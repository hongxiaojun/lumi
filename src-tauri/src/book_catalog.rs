//! M10: shelf identity beside the book file (`books/<id>.meta.json`).
//! Progress stays on the device. A missing IndexedDB row can be rebuilt from here.
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request};
use tauri::AppHandle;

use crate::ai_library::safe_join;
use crate::book_files::books_root;

const META_LIMIT: usize = 64 * 1024;

fn checked_id(id: &str) -> Result<&str, String> {
    let ok = (1..=128).contains(&id.len())
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(id)
    } else {
        Err("bad book id".into())
    }
}

fn meta_name(id: &str) -> Result<String, String> {
    Ok(format!("{}.meta.json", checked_id(id)?))
}

fn open_ext(file_name: &str) -> Option<String> {
    let ext = file_name.rsplit_once('.')?.1;
    let lower = ext.to_ascii_lowercase();
    if ["epub", "pdf", "mobi", "azw3", "fb2"].iter().any(|item| *item == lower) {
        Some(lower)
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BookMeta {
    pub id: String,
    pub title: String,
    pub author: String,
    pub file_name: String,
    pub added_at: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_built_at: Option<f64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CatalogHit {
    pub id: String,
    pub file_path: String,
    pub meta: BookMeta,
}

fn normalize(meta: &mut BookMeta) {
    let title = meta.title.trim();
    meta.title = if title.is_empty() { "未命名".into() } else { title.to_string() };
    let author = meta.author.trim();
    meta.author = if author.is_empty() { "未知作者".into() } else { author.to_string() };
    if !matches!(meta.language.as_deref(), Some("zh" | "en" | "mixed" | "other")) {
        meta.language = None;
    }
}

pub(crate) fn write_meta_in(root: &Path, id: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    if bytes.len() > META_LIMIT {
        return Err("book meta too large".into());
    }
    let id = checked_id(id)?.to_string();
    let text = std::str::from_utf8(bytes).map_err(|e| e.to_string())?;
    let mut meta: BookMeta = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if meta.id != id {
        return Err("book id mismatch".into());
    }
    if !meta.added_at.is_finite() || meta.added_at < 0.0 {
        return Err("bad addedAt".into());
    }
    if open_ext(&meta.file_name).is_none() {
        return Err("unsupported book".into());
    }
    normalize(&mut meta);
    let name = meta_name(&id)?;
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let dest = safe_join(root, &name)?;
    let tmp = safe_join(root, &format!(".{name}.tmp"))?;
    {
        let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        let body = serde_json::to_vec(&meta).map_err(|e| e.to_string())?;
        file.write_all(&body).map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(dest)
}

pub(crate) fn list_in(root: &Path) -> Result<Vec<CatalogHit>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let Some(id) = name.strip_suffix(".meta.json") else { continue };
        if checked_id(id).is_err() {
            continue;
        }
        let Ok(text) = fs::read_to_string(entry.path()) else { continue };
        let Ok(meta) = serde_json::from_str::<BookMeta>(&text) else { continue };
        if meta.id != id || !meta.added_at.is_finite() || meta.added_at < 0.0 {
            continue;
        }
        let Some(ext) = open_ext(&meta.file_name) else { continue };
        let book = safe_join(root, &format!("{id}.{ext}"))?;
        if !book.is_file() {
            continue;
        }
        out.push(CatalogHit {
            id: id.to_string(),
            file_path: book.to_string_lossy().into_owned(),
            meta,
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

pub(crate) fn delete_meta_in(root: &Path, id: &str) -> Result<(), String> {
    let path = safe_join(root, &meta_name(id)?)?;
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

#[tauri::command]
pub fn write_book_meta(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw binary body".into());
    };
    let id = header(&request, "x-book-id")?;
    write_meta_in(&books_root(&app)?, id, bytes)?;
    Ok(())
}

#[tauri::command]
pub fn list_book_catalog(app: AppHandle) -> Result<Vec<CatalogHit>, String> {
    list_in(&books_root(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(id: &str, file_name: &str) -> Vec<u8> {
        format!(
            r#"{{"id":"{id}","title":"经济学的思维方式","author":"保罗·海恩","fileName":"{file_name}","addedAt":1760000000000,"fraction":0.265,"language":"zh"}}"#
        )
        .into_bytes()
    }

    #[test]
    fn sidecar_roundtrip_keeps_cjk_and_drops_progress() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("book-1.epub"), b"EPUB").unwrap();
        write_meta_in(root, "book-1", &meta("book-1", "经济学的思维方式.epub")).unwrap();
        let listed = list_in(root).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].meta.title, "经济学的思维方式");
        assert_eq!(listed[0].meta.author, "保罗·海恩");
        assert_eq!(listed[0].meta.file_name, "经济学的思维方式.epub");
        assert_eq!(listed[0].meta.added_at, 1_760_000_000_000.0);
        assert_eq!(listed[0].meta.language.as_deref(), Some("zh"));
        let saved = fs::read_to_string(root.join("book-1.meta.json")).unwrap();
        assert!(!saved.contains("fraction"));
        assert!(listed[0].file_path.ends_with("book-1.epub"));
    }

    #[test]
    fn skips_meta_without_a_book_and_rejects_a_bad_write() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_meta_in(root, "gone", &meta("gone", "gone.mobi")).unwrap();
        assert!(list_in(root).unwrap().is_empty());
        fs::write(root.join("gone.mobi"), b"MOBI").unwrap();
        assert_eq!(list_in(root).unwrap().len(), 1);

        assert!(write_meta_in(root, "gone", &meta("other", "gone.mobi")).is_err());
        assert!(write_meta_in(root, "../x", &meta("../x", "x.epub")).is_err());
        assert!(write_meta_in(root, "gone", &meta("gone", "notes.txt")).is_err());
        assert!(write_meta_in(root, "gone", &vec![b'x'; META_LIMIT + 1]).is_err());
        let negative = br#"{"id":"gone","title":"T","author":"A","fileName":"g.mobi","addedAt":-1}"#;
        assert!(write_meta_in(root, "gone", negative).is_err());
        assert!(list_in(Path::new("/no/such/lumi-catalog")).unwrap().is_empty());
    }

    #[test]
    fn delete_meta_removes_the_sidecar_and_ignores_a_missing_one() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_meta_in(root, "book-1", &meta("book-1", "a.epub")).unwrap();
        assert!(root.join("book-1.meta.json").is_file());
        delete_meta_in(root, "book-1").unwrap();
        assert!(!root.join("book-1.meta.json").exists());
        delete_meta_in(root, "book-1").unwrap();
        assert!(delete_meta_in(root, "../x").is_err());
    }
}
