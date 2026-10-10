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


fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Only `backup-<digits>` is allowed (M10-3).
pub(crate) fn backup_dir_name(name: &str) -> Result<&str, String> {
    let Some(rest) = name.strip_prefix("backup-") else {
        return Err("bad backup dir".into());
    };
    if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
        return Err("bad backup dir".into());
    }
    Ok(name)
}

pub(crate) fn backup_write_in(
    app_data: &Path,
    backup_dir: &str,
    id: &str,
    ext: &str,
    bytes: &[u8],
) -> Result<PathBuf, String> {
    let dir = backup_dir_name(backup_dir)?;
    let root = safe_join(app_data, dir)?;
    write_in(&root, id, ext, bytes)
}

pub(crate) fn write_migration_in(
    app_data: &Path,
    backup_dir: &str,
    file_name: &str,
    text: &str,
) -> Result<PathBuf, String> {
    let dir = backup_dir_name(backup_dir)?;
    if file_name != "books.json" && file_name != "migration.log" {
        return Err("bad migration file name".into());
    }
    let root = safe_join(app_data, dir)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let path = safe_join(&root, file_name)?;
    if file_name == "migration.log" {
        use std::io::Write;
        let mut f = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    } else {
        fs::write(&path, text).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// JS: `invoke('backup_book_file', bytes, { headers: { 'x-backup-dir', 'x-book-id', 'x-book-ext' } })`
#[tauri::command]
pub fn backup_book_file(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw binary body".into());
    };
    let backup_dir = header(&request, "x-backup-dir")?;
    let id = header(&request, "x-book-id")?;
    let ext = header(&request, "x-book-ext")?;
    let path = backup_write_in(&app_data(&app)?, backup_dir, id, ext, bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

/// JS: `invoke('write_migration_text', utf8Bytes, { headers: { 'x-backup-dir', 'x-file-name' } })`
/// `books.json` overwrites; `migration.log` appends. Any other name is rejected.
#[tauri::command]
pub fn write_migration_text(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw binary body".into());
    };
    let backup_dir = header(&request, "x-backup-dir")?;
    let file_name = header(&request, "x-file-name")?;
    let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    write_migration_in(&app_data(&app)?, backup_dir, file_name, text)?;
    Ok(())
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

    #[test]
    fn backup_dir_name_rejects_bad() {
        for bad in ["backup-", "backup", "Backup-1", "backup-1a", "backup-1/2", "../backup-1", "backup-1.0", ""] {
            assert!(backup_dir_name(bad).is_err(), "{bad}");
            let dir = tempfile::tempdir().unwrap();
            assert!(backup_write_in(dir.path(), bad, "id", "epub", b"x").is_err(), "{bad}");
        }
        assert_eq!(backup_dir_name("backup-1760000000000").unwrap(), "backup-1760000000000");
    }

    #[test]
    fn migration_log_appends_and_whitelist() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let backup = "backup-42";
        write_migration_in(root, backup, "books.json", "[{\"id\":\"a\"}]").unwrap();
        write_migration_in(root, backup, "migration.log", "line1\n").unwrap();
        write_migration_in(root, backup, "migration.log", "line2\n").unwrap();
        let log = fs::read_to_string(root.join(backup).join("migration.log")).unwrap();
        assert_eq!(log, "line1\nline2\n");
        let json = fs::read_to_string(root.join(backup).join("books.json")).unwrap();
        assert_eq!(json, "[{\"id\":\"a\"}]");
        // overwrite books.json
        write_migration_in(root, backup, "books.json", "[]").unwrap();
        assert_eq!(fs::read_to_string(root.join(backup).join("books.json")).unwrap(), "[]");
        assert!(write_migration_in(root, backup, "evil.txt", "x").is_err());
        assert!(write_migration_in(root, backup, "../books.json", "x").is_err());
        let path = backup_write_in(root, backup, "ok-1", "epub", b"EPUB").unwrap();
        assert_eq!(path, root.join(backup).join("ok-1.epub"));
        assert_eq!(fs::read(path).unwrap(), b"EPUB");
    }

    /// A2a visible evidence under /tmp/lumi-m10-3-demo (not the real Application Support tree).
    /// Re-run: `cargo test -- --ignored demo_backup_layout_on_tmp`
    #[test]
    #[ignore = "writes /tmp/lumi-m10-3-demo; run with --ignored"]
    fn demo_backup_layout_on_tmp() {
        let root = Path::new("/tmp/lumi-m10-3-demo");
        let _ = fs::remove_dir_all(root);
        fs::create_dir_all(root).unwrap();
        let backup = "backup-1760100000000";
        backup_write_in(root, backup, "ok-1", "epub", b"GOOD-BYTES").unwrap();
        backup_write_in(root, backup, "bad-1", "epub", b"BAD-BYTES").unwrap();
        write_migration_in(
            root,
            backup,
            "books.json",
            r#"[{"id":"ok-1","title":"Good","fileName":"good.epub"},{"id":"bad-1","title":"Bad","fileName":"bad.epub"}]"#,
        )
        .unwrap();
        write_migration_in(
            root,
            backup,
            "migration.log",
            "2026-10-10T13:09:00+08:00 bad-1 Bad size mismatch 9 != 4\n",
        )
        .unwrap();
        // successful migrate lands under books/
        write_in(&root.join("books"), "ok-1", "epub", b"GOOD-BYTES").unwrap();
        assert!(root.join(backup).join("ok-1.epub").exists());
        assert!(root.join(backup).join("books.json").exists());
        assert!(root.join("books").join("ok-1.epub").exists());
        assert!(!root.join("books").join("bad-1.epub").exists());
    }
}
