mod scanner;

use scanner::{DuplicateProgress, DuplicateReport, ScanIndex, ScanProgress, ScanReport, SearchResponse};
use std::{
    path::PathBuf,
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
            cancel_scan,
            system_drive,
            open_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a L.I.V.I.A.");
}
