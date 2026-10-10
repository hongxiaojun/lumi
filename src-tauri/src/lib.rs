mod ai_library;
mod book_files;
mod open_files;

use open_files::{register_opens_filtered, OpenFilesState};
use std::path::PathBuf;
use tauri::{DragDropEvent, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(OpenFilesState::default())
        .invoke_handler(tauri::generate_handler![
            ai_library::save_ai_library,
            book_files::write_book_file,
            book_files::read_book_file,
            book_files::delete_book_file,
            book_files::backup_book_file,
            book_files::write_migration_text,
            open_files::take_pending_opens,
            open_files::read_opened_file
        ])
        .setup(|app| {
            let args: Vec<PathBuf> = std::env::args_os().skip(1).map(PathBuf::from).collect();
            register_opens_filtered(app.handle(), args);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Lumi")
        .run(|app, event| match event {
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            RunEvent::Opened { urls } => {
                let paths: Vec<PathBuf> = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect();
                register_opens_filtered(app, paths);
            }
            RunEvent::WindowEvent {
                event: WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }),
                ..
            } => {
                register_opens_filtered(app, paths);
            }
            RunEvent::WebviewEvent {
                event: tauri::WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }),
                ..
            } => {
                register_opens_filtered(app, paths);
            }
            _ => {}
        });
}
