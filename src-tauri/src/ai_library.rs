use std::fs;
use std::path::{Path, PathBuf};

fn library_root() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".leaf-reader").join("library")
}

pub(crate) fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let normalized = rel.replace('\\', "/");
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.split('/').any(|part| part == "..")
    {
        return Err("bad path".into());
    }
    Ok(root.join(normalized))
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_ai_library(
    files: std::collections::HashMap<String, String>,
    remove_slug: Option<String>,
) -> Result<String, String> {
    let root = library_root();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    if let Some(slug) = remove_slug.as_deref().filter(|s| !s.is_empty()) {
        let dir = safe_join(&root, slug)?;
        let _ = fs::remove_dir_all(dir);
    }
    for (rel, content) in files {
        let dest = safe_join(&root, &rel)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&dest, content).map_err(|e| e.to_string())?;
    }
    Ok(root.to_string_lossy().into_owned())
}
