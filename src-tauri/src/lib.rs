mod scanner;

use scanner::{ScanProgress, ScanReport};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct ScanState {
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
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

    let task = tauri::async_runtime::spawn_blocking(move || {
        scanner::scan(path, cancel, |progress: ScanProgress| {
            let _ = app.emit("scan-progress", progress);
        })
    });

    let result = task.await;
    running.store(false, Ordering::SeqCst);

    match result {
        Ok(report) => report,
        Err(error) => Err(format!("A análise foi interrompida: {error}")),
    }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScanState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_path,
            cancel_scan,
            system_drive
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a L.I.V.I.A.");
}
