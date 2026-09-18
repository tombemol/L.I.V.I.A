mod scanner;

use scanner::{ScanProgress, ScanReport};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
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
            cancel_scan,
            system_drive,
            open_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a L.I.V.I.A.");
}
