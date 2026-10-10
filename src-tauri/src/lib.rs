mod ai_library;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![ai_library::save_ai_library])
        .run(tauri::generate_context!())
        .expect("error while running Lumi");
}
