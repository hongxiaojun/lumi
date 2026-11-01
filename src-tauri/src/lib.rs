mod ai_library;
mod book_catalog;
mod book_files;
mod book_protocol;
mod edge_open;
mod menu_bar;
mod ocr;
mod open_files;

use edge_open::OpenChoice;
use open_files::{register_opens_filtered, OpenFilesState};
use std::path::PathBuf;
use tauri::webview::NewWindowResponse;
use tauri::{DragDropEvent, Emitter, Manager, RunEvent, WebviewEvent, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .register_asynchronous_uri_scheme_protocol("leafbook", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let method = request.method().clone();
            let path = request.uri().path().to_string();
            let range = request
                .headers()
                .get(tauri::http::header::RANGE)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string);
            std::thread::spawn(move || {
                let response = match app.path().app_data_dir() {
                    Ok(dir) => book_protocol::respond_book(
                        &dir.join("books"),
                        method.as_str(),
                        &path,
                        range.as_deref(),
                    ),
                    Err(_) => book_protocol::unavailable(),
                };
                responder.respond(response);
            });
        })
        .manage(OpenFilesState::default())
        .invoke_handler(tauri::generate_handler![
            ai_library::save_ai_library,
            book_files::write_book_file,
            book_files::read_book_file,
            book_files::delete_book_file,
            book_catalog::write_book_meta,
            book_catalog::list_book_catalog,
            book_files::backup_book_file,
            book_files::write_migration_text,
            open_files::take_pending_opens,
            open_files::read_opened_file,
            edge_open::open_chapter_in_edge,
            ocr::ocr_page
        ])
        .setup(|app| {
            let window = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .expect("main window");
            let handle = app.handle().clone();
            WebviewWindowBuilder::from_config(app.handle(), &window)?
                .on_new_window(move |url, _features| {
                    let raw = url.as_str().to_string();
                    match edge_open::choose(&raw) {
                        OpenChoice::Frame => {
                            let _ = handle.emit("leaf-open-frame", raw);
                        }
                        OpenChoice::Link => {
                            let app = handle.clone();
                            std::thread::spawn(move || {
                                if let Err(message) = edge_open::launch_edge(&raw) {
                                    let _ = app.emit("leaf-open-frame-status", message);
                                }
                            });
                        }
                        OpenChoice::Deny => {}
                    }
                    NewWindowResponse::Deny
                })
                .build()?;
            menu_bar::install_menu(app.handle())?;
            let args: Vec<PathBuf> = std::env::args_os().skip(1).map(PathBuf::from).collect();
            register_opens_filtered(app.handle(), args);
            Ok(())
        })
        .on_menu_event(|app, event| menu_bar::on_menu_event(app, event))
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
            RunEvent::WebviewEvent {
                event: WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }),
                ..
            } => {
                register_opens_filtered(app, paths);
            }
            _ => {}
        });
}
