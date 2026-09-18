mod scanner;

use scanner::ScanReport;

#[tauri::command]
fn scan_path(path: String) -> Result<ScanReport, String> {
    scanner::scan(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_path])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a L.I.V.I.A.");
}
