//! M10-1: book source files on disk under `app_data_dir()/books/<id>.<ext>`.
//! Bytes travel over Tauri's binary IPC (raw request body / raw response),
//! never as a JSON number array.
use std::fs;
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

use crate::ai_library::safe_join;

fn books_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("books"))
}

fn file_name(id: &str, ext: &str) -> Result<String, String> {
    let id_ok = (1..=128).contains(&id.len())
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    let ext_ok = (1..=10).contains(&ext.len()) && ext.chars().all(|c| c.is_ascii_alphanumeric());
    if !id_ok || !ext_ok {
        return Err("bad book id or extension".into());
    }
    Ok(format!("{id}.{}", ext.to_ascii_lowercase()))
}

pub(crate) fn write_in(root: &Path, id: &str, ext: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let name = file_name(id, ext)?;
    let dest = safe_join(root, &name)?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let tmp = safe_join(root, &format!(".{name}.tmp"))?;
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(dest)
}

pub(crate) fn read_in(root: &Path, id: &str, ext: &str) -> Result<Vec<u8>, String> {
    let path = safe_join(root, &file_name(id, ext)?)?;
    fs::read(path).map_err(|e| e.to_string())
}

pub(crate) fn delete_in(root: &Path, id: &str, ext: &str) -> Result<(), String> {
    let path = safe_join(root, &file_name(id, ext)?)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("missing header {name}"))
}

/// JS: `invoke('write_book_file', bytes, { headers: { 'x-book-id': id, 'x-book-ext': ext } })`
#[tauri::command]
pub fn write_book_file(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw binary body".into());
    };
    let id = header(&request, "x-book-id")?;
    let ext = header(&request, "x-book-ext")?;
    let path = write_in(&books_root(&app)?, id, ext, bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn read_book_file(app: AppHandle, id: String, ext: String) -> Result<Response, String> {
    Ok(Response::new(read_in(&books_root(&app)?, &id, &ext)?))
}

#[tauri::command]
pub fn delete_book_file(app: AppHandle, id: String, ext: String) -> Result<(), String> {
    delete_in(&books_root(&app)?, &id, &ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_read_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let bytes: Vec<u8> = (0..=255u8).cycle().take(100_000).collect();
        let path = write_in(dir.path(), "book-1", "EPUB", &bytes).unwrap();
        assert_eq!(path, dir.path().join("book-1.epub"));
        assert_eq!(read_in(dir.path(), "book-1", "epub").unwrap(), bytes);
    }

    #[test]
    fn path_traversal_rejected() {
        let dir = tempfile::tempdir().unwrap();
        for (id, ext) in [("../x", "epub"), ("a/b", "epub"), ("a\\b", "epub"), ("", "epub"),
                          ("ok", "../e"), ("ok", ""), ("ok", "e/p"), ("..", "epub")] {
            assert!(write_in(dir.path(), id, ext, b"x").is_err(), "write {id:?}.{ext:?}");
            assert!(read_in(dir.path(), id, ext).is_err(), "read {id:?}.{ext:?}");
            assert!(delete_in(dir.path(), id, ext).is_err(), "delete {id:?}.{ext:?}");
        }
        assert!(!dir.path().parent().unwrap().join("x.epub").exists());
    }

    #[test]
    fn delete_removes_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_in(dir.path(), "b2", "pdf", b"%PDF").unwrap();
        assert!(path.exists());
        delete_in(dir.path(), "b2", "pdf").unwrap();
        assert!(!path.exists());
        assert!(read_in(dir.path(), "b2", "pdf").is_err());
        delete_in(dir.path(), "b2", "pdf").unwrap();
    }
}
