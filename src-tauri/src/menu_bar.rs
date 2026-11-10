//! M12-4: native application menu (Lumi / File / Edit / Window).
//! Compiled for macOS only. rfd has no iOS file dialog.
#![cfg(target_os = "macos")]

use std::path::PathBuf;

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Runtime};

use crate::open_files::{
    register_menu_open_selection, register_opens_filtered, OpenFilesState, OPEN_BOOK_EXTS,
};

pub const OPEN_MENU_ID: &str = "file-open";

pub fn install_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let pkg = app.package_info();
    let about = tauri::menu::AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        ..Default::default()
    };

    let app_menu = Submenu::with_items(
        app,
        "Lumi",
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let open = MenuItem::with_id(app, OPEN_MENU_ID, "打开…", true, Some("CmdOrCtrl+O"))?;
    let file_menu = Submenu::with_items(app, "文件", true, &[&open])?;

    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "窗口",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
            &PredefinedMenuItem::bring_all_to_front(app, None)?,
        ],
    )?;

    let menu = Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu])?;
    app.set_menu(menu)?;
    Ok(())
}

pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    if event.id() != OPEN_MENU_ID {
        return;
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        match pick_book_files().await {
            None => {
                // Cancelled — exercise the same registration layer as tests.
                let state = handle.state::<OpenFilesState>();
                let _ = register_menu_open_selection(&state, None);
            }
            Some(paths) => register_opens_filtered(&handle, paths),
        }
    });
}

async fn pick_book_files() -> Option<Vec<PathBuf>> {
    rfd::AsyncFileDialog::new()
        .set_title("打开")
        .add_filter("电子书", OPEN_BOOK_EXTS)
        .pick_files()
        .await
        .map(|files| files.into_iter().map(|f| f.path().to_path_buf()).collect())
}
