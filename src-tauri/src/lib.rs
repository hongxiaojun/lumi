mod ai_library;
mod book_files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            ai_library::save_ai_library,
            book_files::write_book_file,
            book_files::read_book_file,
            book_files::delete_book_file,
            book_files::backup_book_file,
            book_files::write_migration_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lumi");
}
