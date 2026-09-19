mod scanner;
mod updater;

use scanner::{
    DuplicateProgress, DuplicateReport, FileEntry, ScanIndex, ScanProgress, ScanReport, SearchResponse,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashSet, VecDeque},
    ffi::OsString,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, RwLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Emitter, State};


const PERSISTENCE_SCHEMA: u32 = 1;
const SNAPSHOT_LIMIT: usize = 60;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedIndexEnvelope {
    schema_version: u32,
    saved_at_secs: u64,
    #[serde(default)]
    checksum_sha256: Option<String>,
    index: ScanIndex,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SnapshotBucket {
    label: String,
    path: Option<String>,
    size: u64,
    count: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StorageSnapshot {
    id: String,
    created_at_secs: u64,
    root: String,
    total_size: u64,
    file_count: u64,
    folder_count: u64,
    indexed_files: usize,
    engine_label: String,
    #[serde(default)]
    directories: Vec<SnapshotBucket>,
    #[serde(default)]
    extensions: Vec<SnapshotBucket>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedIndexResponse {
    report: ScanReport,
    saved_at_secs: u64,
    snapshots: Vec<StorageSnapshot>,
    recovered_from_backup: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RefreshIndexResponse {
    report: ScanReport,
    incremental: bool,
    changed_entries: usize,
    updated_files: usize,
    removed_files: usize,
    fallback_reason: Option<String>,
}

#[derive(Default)]
struct ScanState {
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    index: Arc<RwLock<Option<ScanIndex>>>,
    #[cfg(not(target_os = "android"))]
    cleanup_undo: Arc<Mutex<VecDeque<CleanupUndoRecord>>>,
}

#[cfg(not(target_os = "android"))]
struct CleanupUndoItem {
    trash_item: trash::TrashItem,
    file: FileEntry,
}

#[cfg(not(target_os = "android"))]
struct CleanupUndoRecord {
    id: String,
    index_root: String,
    items: Vec<CleanupUndoItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupFailure {
    path: String,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupResult {
    moved_files: Vec<FileEntry>,
    moved_bytes: u64,
    failed: Vec<CleanupFailure>,
    operation_id: Option<String>,
    undoable_files: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupRestoreResult {
    restored_files: Vec<FileEntry>,
    restored_bytes: u64,
    failed: Vec<CleanupFailure>,
    remaining_undoable_files: usize,
}

#[tauri::command]
async fn scan_path(
    app: AppHandle,
    state: State<'_, ScanState>,
    path: String,
) -> Result<ScanReport, String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("Já existe uma análise em andamento.".to_string());
    }

    state.cancel.store(false, Ordering::SeqCst);

    let cancel = Arc::clone(&state.cancel);
    let running = Arc::clone(&state.running);
    let index_state = Arc::clone(&state.index);

    let task = tauri::async_runtime::spawn_blocking(move || {
        scanner::scan(path, cancel, |progress: ScanProgress| {
            let _ = app.emit("scan-progress", progress);
        })
    });

    let result = task.await;
    running.store(false, Ordering::SeqCst);

    match result {
        Ok(Ok(bundle)) => {
            let report = bundle.report;
            if let Err(error) = save_persisted_index(&bundle.index) {
                eprintln!("L.I.V.I.A.: não foi possível persistir o índice: {error}");
            }
            if let Err(error) = record_snapshot(&report) {
                eprintln!("L.I.V.I.A.: não foi possível registrar o snapshot: {error}");
            }

            let mut guard = index_state
                .write()
                .map_err(|_| "O índice local ficou indisponível.".to_string())?;
            *guard = Some(bundle.index);
            Ok(report)
        }
        Ok(Err(error)) => Err(format!("A análise foi interrompida: {error}")),
        Err(error) => Err(format!("A análise foi interrompida: {error}")),
    }
}


#[tauri::command]
async fn load_cached_index(
    state: State<'_, ScanState>,
) -> Result<Option<CachedIndexResponse>, String> {
    let index_state = Arc::clone(&state.index);

    tauri::async_runtime::spawn_blocking(move || {
        let Some((envelope, recovered_from_backup)) = load_persisted_index()? else {
            return Ok(None);
        };

        let report = scanner::browse_index(&envelope.index, envelope.index.root.clone())
            .map_err(|error| format!("O índice persistente não pôde ser reconstruído: {error}"))?;
        let snapshots = load_snapshot_history(&envelope.index.root, SNAPSHOT_LIMIT)?;

        let mut guard = index_state
            .write()
            .map_err(|_| "O índice local ficou indisponível.".to_string())?;
        *guard = Some(envelope.index);

        Ok(Some(CachedIndexResponse {
            report,
            saved_at_secs: envelope.saved_at_secs,
            snapshots,
            recovered_from_backup,
        }))
    })
    .await
    .map_err(|error| format!("Falha ao carregar o índice persistente: {error}"))?
}

#[tauri::command]
async fn snapshot_history(root: String, limit: usize) -> Result<Vec<StorageSnapshot>, String> {
    tauri::async_runtime::spawn_blocking(move || load_snapshot_history(&root, limit))
        .await
        .map_err(|error| format!("Falha ao carregar snapshots: {error}"))?
}


#[tauri::command]
async fn refresh_index(
    app: AppHandle,
    state: State<'_, ScanState>,
) -> Result<RefreshIndexResponse, String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("Já existe uma análise em andamento.".to_string());
    }

    state.cancel.store(false, Ordering::SeqCst);

    let current = {
        let guard = state
            .index
            .read()
            .map_err(|_| "O índice local ficou indisponível.".to_string())?;
        guard
            .as_ref()
            .cloned()
            .ok_or_else(|| "Não há índice para atualizar.".to_string())?
    };

    let root = current.root.clone();
    let cancel = Arc::clone(&state.cancel);
    let running = Arc::clone(&state.running);
    let index_state = Arc::clone(&state.index);

    let task = tauri::async_runtime::spawn_blocking(move || {
        match scanner::refresh_usn(&current) {
            Ok(bundle) => Ok::<_, String>((
                bundle.report,
                bundle.index,
                true,
                bundle.changed_entries,
                bundle.updated_files,
                bundle.removed_files,
                None,
            )),
            Err(reason) => {
                let mut bundle = scanner::scan(root, cancel, |progress: ScanProgress| {
                    let _ = app.emit("scan-progress", progress);
                })?;

                let fallback_reason = format!(
                    "USN incremental indisponível ({reason}). O índice completo foi reconstruído."
                );
                bundle.report.engine.fallback_reason = Some(fallback_reason.clone());
                bundle.index.engine.fallback_reason = Some(fallback_reason.clone());

                Ok((
                    bundle.report,
                    bundle.index,
                    false,
                    0,
                    0,
                    0,
                    Some(fallback_reason),
                ))
            }
        }
    });

    let result = task.await;
    running.store(false, Ordering::SeqCst);

    match result {
        Ok(Ok((report, index, incremental, changed_entries, updated_files, removed_files, fallback_reason))) => {
            if let Err(error) = save_persisted_index(&index) {
                eprintln!("L.I.V.I.A.: não foi possível persistir o índice atualizado: {error}");
            }
            if let Err(error) = record_snapshot(&report) {
                eprintln!("L.I.V.I.A.: não foi possível registrar o snapshot atualizado: {error}");
            }

            let mut guard = index_state
                .write()
                .map_err(|_| "O índice local ficou indisponível.".to_string())?;
            *guard = Some(index);

            Ok(RefreshIndexResponse {
                report,
                incremental,
                changed_entries,
                updated_files,
                removed_files,
                fallback_reason,
            })
        }
        Ok(Err(error)) => Err(format!("A atualização foi interrompida: {error}")),
        Err(error) => Err(format!("A atualização foi interrompida: {error}")),
    }
}

#[tauri::command]
async fn browse_index(state: State<'_, ScanState>, path: String) -> Result<ScanReport, String> {
    let index_state = Arc::clone(&state.index);

    tauri::async_runtime::spawn_blocking(move || {
        let guard = index_state
            .read()
            .map_err(|_| "O índice local ficou indisponível.".to_string())?;
        let index = guard
            .as_ref()
            .ok_or_else(|| "Faça uma análise antes de navegar pelo índice.".to_string())?;
        scanner::browse_index(index, path)
    })
    .await
    .map_err(|error| format!("Falha ao consultar o índice: {error}"))?
}

#[tauri::command]
async fn search_index(
    state: State<'_, ScanState>,
    scope: String,
    query: String,
    extension: String,
    min_size: u64,
    sort_key: String,
    sort_direction: String,
    limit: usize,
) -> Result<SearchResponse, String> {
    let index_state = Arc::clone(&state.index);

    tauri::async_runtime::spawn_blocking(move || {
        let guard = index_state
            .read()
            .map_err(|_| "O índice local ficou indisponível.".to_string())?;
        let index = guard
            .as_ref()
            .ok_or_else(|| "Faça uma análise antes de pesquisar.".to_string())?;

        Ok(scanner::search_index(
            index,
            scope,
            query,
            extension,
            min_size,
            sort_key,
            sort_direction,
            limit,
        ))
    })
    .await
    .map_err(|error| format!("Falha ao pesquisar o índice: {error}"))?
}

#[tauri::command]
async fn find_duplicates(
    app: AppHandle,
    state: State<'_, ScanState>,
    scope: String,
) -> Result<DuplicateReport, String> {
    let index_state = Arc::clone(&state.index);

    tauri::async_runtime::spawn_blocking(move || {
        let guard = index_state
            .read()
            .map_err(|_| "O índice local ficou indisponível.".to_string())?;
        let index = guard
            .as_ref()
            .ok_or_else(|| "Faça uma análise antes de verificar duplicatas.".to_string())?;

        scanner::find_duplicates(index, scope, |progress: DuplicateProgress| {
            let _ = app.emit("duplicate-progress", progress);
        })
    })
    .await
    .map_err(|error| format!("Falha ao verificar duplicatas: {error}"))?
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn move_to_trash(
    state: State<'_, ScanState>,
    paths: Vec<String>,
) -> Result<CleanupResult, String> {
    if paths.is_empty() {
        return Err("Selecione ao menos um arquivo antes de limpar.".to_string());
    }
    if paths.len() > 200 {
        return Err("A limpeza assistida aceita no máximo 200 arquivos por operação.".to_string());
    }

    let index_state = Arc::clone(&state.index);
    let cleanup_undo = Arc::clone(&state.cleanup_undo);

    tauri::async_runtime::spawn_blocking(move || {
        let requested: HashSet<String> = paths.into_iter().collect();

        let (candidates, index_root) = {
            let guard = index_state
                .read()
                .map_err(|_| "O índice local ficou indisponível.".to_string())?;
            let index = guard
                .as_ref()
                .ok_or_else(|| "Faça uma análise antes de limpar arquivos.".to_string())?;

            (
                index
                    .files
                    .iter()
                    .filter(|file| requested.contains(&file.path))
                    .cloned()
                    .collect::<Vec<_>>(),
                index.root.clone(),
            )
        };

        if candidates.is_empty() {
            return Err("Nenhum dos arquivos selecionados pertence ao índice atual.".to_string());
        }

        let current_exe = std::env::current_exe().ok();
        let windows_dir = std::env::var_os("WINDIR").map(PathBuf::from);
        let trash_before = trash::os_limited::list().ok();
        let mut moved_files = Vec::<FileEntry>::new();
        let mut failed = Vec::<CleanupFailure>::new();

        for file in candidates {
            let target = PathBuf::from(&file.path);

            if is_protected_path(&target, current_exe.as_deref(), windows_dir.as_deref()) {
                failed.push(CleanupFailure {
                    path: file.path.clone(),
                    reason: "Arquivo protegido pela política de segurança da L.I.V.I.A.".to_string(),
                });
                continue;
            }

            let metadata = match fs::symlink_metadata(&target) {
                Ok(metadata) => metadata,
                Err(error) => {
                    failed.push(CleanupFailure {
                        path: file.path.clone(),
                        reason: format!("O arquivo não está mais acessível: {error}"),
                    });
                    continue;
                }
            };

            if metadata.file_type().is_symlink() || !metadata.is_file() {
                failed.push(CleanupFailure {
                    path: file.path.clone(),
                    reason: "A limpeza assistida aceita somente arquivos regulares.".to_string(),
                });
                continue;
            }

            if metadata.len() != file.size {
                failed.push(CleanupFailure {
                    path: file.path.clone(),
                    reason: "O arquivo mudou desde a indexação e foi preservado.".to_string(),
                });
                continue;
            }

            match trash::delete(&target) {
                Ok(()) => moved_files.push(file),
                Err(error) => failed.push(CleanupFailure {
                    path: target.to_string_lossy().to_string(),
                    reason: format!("Não foi possível mover para a Lixeira: {error}"),
                }),
            }
        }

        let mut undo_items = Vec::<CleanupUndoItem>::new();

        if !moved_files.is_empty() {
            if let Some(before_items) = trash_before {
                let before_ids: HashSet<OsString> =
                    before_items.into_iter().map(|item| item.id).collect();

                if let Ok(after_items) = trash::os_limited::list() {
                    for file in &moved_files {
                        let matches = after_items
                            .iter()
                            .filter(|item| {
                                !before_ids.contains(&item.id)
                                    && same_path(&item.original_path(), Path::new(&file.path))
                            })
                            .cloned()
                            .collect::<Vec<_>>();

                        if matches.len() == 1 {
                            undo_items.push(CleanupUndoItem {
                                trash_item: matches[0].clone(),
                                file: file.clone(),
                            });
                        }
                    }
                }
            }

            let moved_paths: HashSet<&str> =
                moved_files.iter().map(|file| file.path.as_str()).collect();
            let mut guard = index_state
                .write()
                .map_err(|_| "O índice local ficou indisponível.".to_string())?;
            let index = guard
                .as_mut()
                .ok_or_else(|| "O índice atual foi encerrado durante a limpeza.".to_string())?;
            index
                .files
                .retain(|file| !moved_paths.contains(file.path.as_str()));
        }

        let moved_bytes = moved_files
            .iter()
            .map(|file| file.size)
            .fold(0_u64, u64::saturating_add);

        let undoable_files = undo_items.len();
        let operation_id = if undoable_files > 0 {
            let id = cleanup_operation_id();
            let mut guard = cleanup_undo
                .lock()
                .map_err(|_| "O histórico de desfazer ficou indisponível.".to_string())?;

            guard.push_front(CleanupUndoRecord {
                id: id.clone(),
                index_root,
                items: undo_items,
            });

            while guard.len() > 20 {
                guard.pop_back();
            }

            Some(id)
        } else {
            None
        };

        if !moved_files.is_empty() {
            if let Err(error) = persist_state_index(&index_state) {
                eprintln!("L.I.V.I.A.: não foi possível atualizar o índice persistente após limpeza: {error}");
            }
        }

        Ok(CleanupResult {
            moved_files,
            moved_bytes,
            failed,
            operation_id,
            undoable_files,
        })
    })
    .await
    .map_err(|error| format!("Falha ao executar a limpeza assistida: {error}"))?
}


#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn restore_cleanup(
    state: State<'_, ScanState>,
    operation_id: String,
) -> Result<CleanupRestoreResult, String> {
    let index_state = Arc::clone(&state.index);
    let cleanup_undo = Arc::clone(&state.cleanup_undo);

    tauri::async_runtime::spawn_blocking(move || {
        let (mut items, index_root) = {
            let mut guard = cleanup_undo
                .lock()
                .map_err(|_| "O histórico de desfazer ficou indisponível.".to_string())?;
            let record = guard
                .iter_mut()
                .find(|record| record.id == operation_id)
                .ok_or_else(|| {
                    "Esta operação não está mais disponível para desfazer nesta sessão.".to_string()
                })?;

            if record.items.is_empty() {
                return Err("Esta operação já foi restaurada.".to_string());
            }

            (std::mem::take(&mut record.items), record.index_root.clone())
        };

        let mut restored_files = Vec::<FileEntry>::new();
        let mut failed = Vec::<CleanupFailure>::new();
        let mut remaining = Vec::<CleanupUndoItem>::new();

        for item in items.drain(..) {
            let original_path = item.file.path.clone();
            match trash::os_limited::restore_all(std::iter::once(item.trash_item.clone())) {
                Ok(()) => restored_files.push(item.file),
                Err(error) => {
                    failed.push(CleanupFailure {
                        path: original_path,
                        reason: format!("Não foi possível restaurar da Lixeira: {error}"),
                    });
                    remaining.push(item);
                }
            }
        }

        let remaining_undoable_files = remaining.len();
        {
            let mut guard = cleanup_undo
                .lock()
                .map_err(|_| "O histórico de desfazer ficou indisponível.".to_string())?;
            if let Some(record) = guard.iter_mut().find(|record| record.id == operation_id) {
                record.items = remaining;
            }
        }

        if !restored_files.is_empty() {
            if let Ok(mut guard) = index_state.write() {
                if let Some(index) = guard.as_mut() {
                    if same_path(Path::new(&index.root), Path::new(&index_root)) {
                        for file in &restored_files {
                            if Path::new(&file.path).exists()
                                && !index.files.iter().any(|current| current.path == file.path)
                            {
                                index.files.push(file.clone());
                            }
                        }
                    }
                }
            }
        }

        let restored_bytes = restored_files
            .iter()
            .map(|file| file.size)
            .fold(0_u64, u64::saturating_add);

        if !restored_files.is_empty() {
            if let Err(error) = persist_state_index(&index_state) {
                eprintln!("L.I.V.I.A.: não foi possível atualizar o índice persistente após restauração: {error}");
            }
        }

        Ok(CleanupRestoreResult {
            restored_files,
            restored_bytes,
            failed,
            remaining_undoable_files,
        })
    })
    .await
    .map_err(|error| format!("Falha ao desfazer a limpeza: {error}"))?
}


#[cfg(target_os = "android")]
#[tauri::command]
async fn move_to_trash(
    _state: State<'_, ScanState>,
    _paths: Vec<String>,
) -> Result<CleanupResult, String> {
    Err("A v0.8 Android é somente leitura. Limpeza será habilitada quando o fluxo SAF puder preservar as mesmas garantias do desktop.".to_string())
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn restore_cleanup(
    _state: State<'_, ScanState>,
    _operation_id: String,
) -> Result<CleanupRestoreResult, String> {
    Err("Desfazer limpeza não se aplica ao protótipo Android somente leitura.".to_string())
}


fn persistence_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let dir = {
        let base = std::env::var_os("LOCALAPPDATA")
            .or_else(|| std::env::var_os("APPDATA"))
            .ok_or_else(|| "O Windows não informou uma pasta local para os dados da L.I.V.I.A.".to_string())?;
        PathBuf::from(base).join("L.I.V.I.A").join("state")
    };

    #[cfg(not(target_os = "windows"))]
    let dir = {
        if let Some(base) = std::env::var_os("XDG_STATE_HOME") {
            PathBuf::from(base).join("livia")
        } else {
            let home = std::env::var_os("HOME")
                .ok_or_else(|| "O sistema não informou a pasta pessoal para os dados da L.I.V.I.A.".to_string())?;
            PathBuf::from(home).join(".local").join("state").join("livia")
        }
    };

    fs::create_dir_all(&dir)
        .map_err(|error| format!("Não foi possível criar a pasta de estado: {error}"))?;
    Ok(dir)
}

fn persisted_index_path() -> Result<PathBuf, String> {
    Ok(persistence_dir()?.join("index-v1.json"))
}

fn snapshots_path() -> Result<PathBuf, String> {
    Ok(persistence_dir()?.join("snapshots-v1.json"))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn backup_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("state.json");
    path.with_file_name(format!("{name}.bak"))
}

fn temp_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("state.json");
    path.with_file_name(format!("{name}.tmp"))
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "O caminho de persistência é inválido.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Não foi possível criar a pasta de estado: {error}"))?;

    let temp = temp_path(path);
    let backup = backup_path(path);
    let bytes = serde_json::to_vec(value)
        .map_err(|error| format!("Não foi possível serializar o estado: {error}"))?;

    if temp.exists() {
        let _ = fs::remove_file(&temp);
    }

    {
        let mut file = File::create(&temp)
            .map_err(|error| format!("Não foi possível criar o estado temporário: {error}"))?;
        file.write_all(&bytes)
            .map_err(|error| format!("Não foi possível gravar o estado temporário: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Não foi possível sincronizar o estado temporário: {error}"))?;
    }

    if path.exists() {
        if backup.exists() {
            fs::remove_file(&backup)
                .map_err(|error| format!("Não foi possível renovar o backup do estado: {error}"))?;
        }
        fs::rename(path, &backup)
            .map_err(|error| format!("Não foi possível preservar o estado anterior: {error}"))?;
    }

    if let Err(error) = fs::rename(&temp, path) {
        if backup.exists() && !path.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temp);
        return Err(format!("Não foi possível concluir a gravação do estado: {error}"));
    }

    Ok(())
}

fn index_checksum(index: &ScanIndex) -> Result<String, String> {
    let bytes = serde_json::to_vec(index)
        .map_err(|error| format!("Não foi possível serializar o índice para validação: {error}"))?;
    let digest = Sha256::digest(bytes);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn validate_index_envelope(envelope: PersistedIndexEnvelope) -> Result<PersistedIndexEnvelope, String> {
    if envelope.schema_version != PERSISTENCE_SCHEMA {
        return Err(format!(
            "schema incompatível: esperado {}, encontrado {}",
            PERSISTENCE_SCHEMA, envelope.schema_version
        ));
    }

    if let Some(expected) = envelope.checksum_sha256.as_deref() {
        let actual = index_checksum(&envelope.index)?;
        if !actual.eq_ignore_ascii_case(expected) {
            return Err("checksum SHA-256 divergente".to_string());
        }
    }

    Ok(envelope)
}

fn read_index_file(path: &Path) -> Result<PersistedIndexEnvelope, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("não foi possível ler {}: {error}", path.display()))?;
    let envelope: PersistedIndexEnvelope = serde_json::from_str(&content)
        .map_err(|error| format!("JSON inválido em {}: {error}", path.display()))?;
    validate_index_envelope(envelope)
}

fn read_json_with_backup<T: DeserializeOwned>(
    path: &Path,
    label: &str,
) -> Result<Option<(T, bool)>, String> {
    let backup = backup_path(path);

    if !path.exists() && !backup.exists() {
        return Ok(None);
    }

    if path.exists() {
        match fs::read_to_string(path)
            .map_err(|error| error.to_string())
            .and_then(|content| serde_json::from_str::<T>(&content).map_err(|error| error.to_string()))
        {
            Ok(value) => return Ok(Some((value, false))),
            Err(primary_error) if !backup.exists() => {
                return Err(format!("O {label} está corrompido: {primary_error}"));
            }
            Err(_) => {}
        }
    }

    let content = fs::read_to_string(&backup)
        .map_err(|error| format!("Não foi possível ler o backup de {label}: {error}"))?;
    let value = serde_json::from_str::<T>(&content)
        .map_err(|error| format!("O backup de {label} também está corrompido: {error}"))?;

    let _ = fs::copy(&backup, path);
    Ok(Some((value, true)))
}

fn save_persisted_index(index: &ScanIndex) -> Result<u64, String> {
    let saved_at_secs = now_secs();
    let envelope = PersistedIndexEnvelope {
        schema_version: PERSISTENCE_SCHEMA,
        saved_at_secs,
        checksum_sha256: Some(index_checksum(index)?),
        index: index.clone(),
    };

    write_json_atomic(&persisted_index_path()?, &envelope)?;
    Ok(saved_at_secs)
}

fn load_persisted_index() -> Result<Option<(PersistedIndexEnvelope, bool)>, String> {
    let path = persisted_index_path()?;
    let backup = backup_path(&path);

    if !path.exists() && !backup.exists() {
        return Ok(None);
    }

    if path.exists() {
        match read_index_file(&path) {
            Ok(envelope) => return Ok(Some((envelope, false))),
            Err(primary_error) if !backup.exists() => {
                return Err(format!("O índice persistente está corrompido: {primary_error}"));
            }
            Err(_) => {}
        }
    }

    let envelope = read_index_file(&backup)
        .map_err(|error| format!("O índice e seu backup estão inválidos: {error}"))?;

    let _ = fs::copy(&backup, &path);
    Ok(Some((envelope, true)))
}

fn record_snapshot(report: &ScanReport) -> Result<(), String> {
    let path = snapshots_path()?;
    let mut snapshots = read_json_with_backup::<Vec<StorageSnapshot>>(&path, "histórico de snapshots")?
        .map(|(items, _)| items)
        .unwrap_or_default();

    let created_at_secs = now_secs();
    snapshots.insert(
        0,
        StorageSnapshot {
            id: format!("snapshot-{created_at_secs}-{}", report.file_count),
            created_at_secs,
            root: report.index_root.clone(),
            total_size: report.total_size,
            file_count: report.file_count,
            folder_count: report.folder_count,
            indexed_files: report.indexed_files,
            engine_label: report.engine.label.clone(),
            directories: report
                .directories
                .iter()
                .take(20)
                .map(|item| SnapshotBucket {
                    label: item.name.clone(),
                    path: Some(item.path.clone()),
                    size: item.size,
                    count: item.file_count,
                })
                .collect(),
            extensions: report
                .extensions
                .iter()
                .take(20)
                .map(|item| SnapshotBucket {
                    label: item.extension.clone(),
                    path: None,
                    size: item.size,
                    count: item.count,
                })
                .collect(),
        },
    );

    snapshots.truncate(SNAPSHOT_LIMIT);
    write_json_atomic(&path, &snapshots)
}

fn load_snapshot_history(root: &str, limit: usize) -> Result<Vec<StorageSnapshot>, String> {
    let path = snapshots_path()?;
    let snapshots = read_json_with_backup::<Vec<StorageSnapshot>>(&path, "histórico de snapshots")?
        .map(|(items, _)| items)
        .unwrap_or_default();

    let normalized_root = Path::new(root);
    Ok(snapshots
        .into_iter()
        .filter(|snapshot| same_path(Path::new(&snapshot.root), normalized_root))
        .take(limit.clamp(1, SNAPSHOT_LIMIT))
        .collect())
}

fn persist_state_index(index_state: &Arc<RwLock<Option<ScanIndex>>>) -> Result<(), String> {
    let guard = index_state
        .read()
        .map_err(|_| "O índice local ficou indisponível.".to_string())?;
    let index = guard
        .as_ref()
        .ok_or_else(|| "Não há índice para persistir.".to_string())?;
    save_persisted_index(index)?;
    Ok(())
}

fn cleanup_operation_id() -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("cleanup-{stamp}")
}

fn same_path(left: &Path, right: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        fn normalize(path: &Path) -> String {
            path.to_string_lossy()
                .replace('/', "\\")
                .trim_end_matches('\\')
                .to_ascii_lowercase()
        }
        normalize(left) == normalize(right)
    }

    #[cfg(not(target_os = "windows"))]
    {
        left == right
    }
}

fn is_protected_path(target: &Path, current_exe: Option<&Path>, windows_dir: Option<&Path>) -> bool {
    if let Some(exe) = current_exe {
        if same_path(target, exe) {
            return true;
        }
    }

    if let Some(windows) = windows_dir {
        let normalized = target.to_string_lossy().to_ascii_lowercase();
        let windows = windows
            .to_string_lossy()
            .trim_end_matches(|value| value == '\\' || value == '/')
            .to_ascii_lowercase();
        if normalized == windows
            || normalized.starts_with(&format!("{windows}\\"))
            || normalized.starts_with(&format!("{windows}/"))
        {
            return true;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        const SYSTEM_ROOTS: [&str; 11] = [
            "/bin", "/boot", "/dev", "/etc", "/lib", "/lib64",
            "/proc", "/sbin", "/sys", "/usr", "/var/lib",
        ];
        if SYSTEM_ROOTS.iter().any(|root| {
            target == Path::new(root) || target.starts_with(Path::new(root))
        }) {
            return true;
        }
    }

    false
}

#[tauri::command]
fn cancel_scan(state: State<'_, ScanState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn system_drive() -> String {
    #[cfg(target_os = "windows")]
    {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        format!("{drive}\\")
    }

    #[cfg(not(target_os = "windows"))]
    {
        "/".to_string()
    }
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);

    if !target.exists() {
        return Err("O caminho não existe mais.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut command = Command::new("explorer.exe");
        if target.is_file() {
            command.arg("/select,").arg(&target);
        } else {
            command.arg(&target);
        }

        command
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Não foi possível abrir o Explorer: {error}"))
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let open_target = if target.is_file() {
            target.parent().unwrap_or(&target)
        } else {
            &target
        };

        Command::new("xdg-open")
            .arg(open_target)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Não foi possível abrir o gerenciador de arquivos: {error}"))
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let mut command = Command::new("open");
        if target.is_file() {
            command.arg("-R");
        }
        command
            .arg(&target)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Não foi possível abrir o Finder: {error}"))
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err("Abrir no gerenciador de arquivos não está disponível nesta plataforma.".to_string())
    }
}

#[tauri::command]
fn save_report_file(path: String, content: String) -> Result<(), String> {
    const MAX_EXPORT_BYTES: usize = 100 * 1024 * 1024;

    if content.len() > MAX_EXPORT_BYTES {
        return Err("O relatório excede o limite de 100 MB para exportação.".to_string());
    }

    let target = PathBuf::from(path);
    if !target.is_absolute() {
        return Err("Escolha um caminho absoluto para exportar o relatório.".to_string());
    }

    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if extension != "json" && extension != "csv" {
        return Err("A L.I.V.I.A. exporta relatórios apenas em JSON ou CSV.".to_string());
    }

    if target.is_dir() {
        return Err("O destino escolhido é uma pasta, não um arquivo.".to_string());
    }

    let parent = target
        .parent()
        .ok_or_else(|| "O caminho de exportação é inválido.".to_string())?;

    if !parent.exists() {
        return Err("A pasta escolhida para exportação não existe.".to_string());
    }

    fs::write(&target, content.as_bytes())
        .map_err(|error| format!("Não foi possível gravar o relatório: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(ScanState::default())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_android_fs::init());

    builder
        .invoke_handler(tauri::generate_handler![
            scan_path,
            load_cached_index,
            snapshot_history,
            refresh_index,
            browse_index,
            search_index,
            find_duplicates,
            move_to_trash,
            restore_cleanup,
            cancel_scan,
            system_drive,
            open_in_explorer,
            save_report_file,
            updater::check_for_update,
            updater::download_update,
            updater::install_update
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a L.I.V.I.A.");
}


#[cfg(test)]
mod persistence_tests {
    use super::{backup_path, read_json_with_backup, write_json_atomic};
    use serde_json::{json, Value};
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    fn test_dir() -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("livia-state-test-{stamp}"))
    }

    #[test]
    fn recovers_previous_json_when_primary_is_corrupted() {
        let dir = test_dir();
        fs::create_dir_all(&dir).expect("create test dir");
        let path = dir.join("state.json");

        write_json_atomic(&path, &json!({ "generation": 1 })).expect("write generation 1");
        write_json_atomic(&path, &json!({ "generation": 2 })).expect("write generation 2");
        assert!(backup_path(&path).exists());

        fs::write(&path, b"{ definitely-not-json").expect("corrupt primary");

        let (value, recovered) = read_json_with_backup::<Value>(&path, "estado de teste")
            .expect("recover backup")
            .expect("state exists");

        assert!(recovered);
        assert_eq!(value["generation"], 1);

        let restored: Value = serde_json::from_str(
            &fs::read_to_string(&path).expect("read restored primary")
        ).expect("restored primary is valid");
        assert_eq!(restored["generation"], 1);

        let _ = fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod cleanup_tests {
    use super::{is_protected_path, same_path};
    use std::path::Path;

    #[test]
    fn blocks_windows_directory_case_insensitively() {
        assert!(is_protected_path(
            Path::new(r"C:\WINDOWS\System32\kernel32.dll"),
            None,
            Some(Path::new(r"C:\Windows")),
        ));
    }

    #[test]
    fn blocks_current_executable() {
        assert!(is_protected_path(
            Path::new(r"C:\Apps\Livia\L.I.V.I.A.exe"),
            Some(Path::new(r"C:\Apps\Livia\L.I.V.I.A.exe")),
            None,
        ));
    }

    #[test]
    fn allows_unrelated_user_file() {
        assert!(!is_protected_path(
            Path::new(r"C:\Users\Tom\Downloads\old.iso"),
            Some(Path::new(r"C:\Apps\Livia\L.I.V.I.A.exe")),
            Some(Path::new(r"C:\Windows")),
        ));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn compares_windows_paths_case_insensitively() {
        assert!(same_path(
            Path::new(r"C:\Users\Tom\Downloads\FILE.ISO"),
            Path::new(r"c:/users/tom/downloads/file.iso"),
        ));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn keeps_unix_paths_case_sensitive() {
        assert!(!same_path(
            Path::new("/home/tom/FILE.ISO"),
            Path::new("/home/tom/file.iso"),
        ));
    }
}
