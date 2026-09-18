mod scanner;

use scanner::{
    DuplicateProgress, DuplicateReport, FileEntry, ScanIndex, ScanProgress, ScanReport, SearchResponse,
};
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, RwLock,
    },
};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct ScanState {
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    index: Arc<RwLock<Option<ScanIndex>>>,
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

    tauri::async_runtime::spawn_blocking(move || {
        let requested: HashSet<String> = paths.into_iter().collect();

        let candidates = {
            let guard = index_state
                .read()
                .map_err(|_| "O índice local ficou indisponível.".to_string())?;
            let index = guard
                .as_ref()
                .ok_or_else(|| "Faça uma análise antes de limpar arquivos.".to_string())?;

            index
                .files
                .iter()
                .filter(|file| requested.contains(&file.path))
                .cloned()
                .collect::<Vec<_>>()
        };

        if candidates.is_empty() {
            return Err("Nenhum dos arquivos selecionados pertence ao índice atual.".to_string());
        }

        let current_exe = std::env::current_exe().ok();
        let windows_dir = std::env::var_os("WINDIR").map(PathBuf::from);
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

        if !moved_files.is_empty() {
            let moved_paths: HashSet<&str> = moved_files.iter().map(|file| file.path.as_str()).collect();
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

        Ok(CleanupResult {
            moved_files,
            moved_bytes,
            failed,
        })
    })
    .await
    .map_err(|error| format!("Falha ao executar a limpeza assistida: {error}"))?
}

fn is_protected_path(target: &Path, current_exe: Option<&Path>, windows_dir: Option<&Path>) -> bool {
    let normalized = target.to_string_lossy().to_ascii_lowercase();

    if let Some(exe) = current_exe {
        if normalized == exe.to_string_lossy().to_ascii_lowercase() {
            return true;
        }
    }

    if let Some(windows) = windows_dir {
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

    false
}

#[tauri::command]
fn cancel_scan(state: State<'_, ScanState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn system_drive() -> String {
    let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
    format!("{drive}\\")
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

    #[cfg(not(target_os = "windows"))]
    {
        Err("Abrir no Explorer está disponível apenas no Windows.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScanState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_path,
            browse_index,
            search_index,
            find_duplicates,
            move_to_trash,
            cancel_scan,
            system_drive,
            open_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a L.I.V.I.A.");
}
