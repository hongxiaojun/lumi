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
    let bytes = normalized.as_bytes();
    let is_abs = normalized.starts_with('/')
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':');
    if normalized.is_empty()
        || is_abs
        || normalized.split('/').any(|part| part == "." || part == "..")
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
        if dir == root {
            return Err("refusing to remove library root".into());
        }
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

#[cfg(test)]
mod tests {
    use super::safe_join;
    use std::path::Path;

    #[test]
    fn accepts_book_relative_paths() {
        let root = Path::new("/tmp/lumi-lib");
        assert_eq!(
            safe_join(root, "the-unit/AI.md").unwrap(),
            Path::new("/tmp/lumi-lib/the-unit/AI.md")
        );
        assert_eq!(safe_join(root, "INDEX.md").unwrap(), Path::new("/tmp/lumi-lib/INDEX.md"));
    }

    #[test]
    fn rejects_dot_and_parent_escapes() {
        let root = Path::new("/tmp/lumi-lib");
        for rel in [".", "./", ".//.", "..", "foo/../..", ""] {
            assert!(safe_join(root, rel).is_err(), "should reject {rel:?}");
        }
    }

    #[test]
    fn rejects_absolute_paths() {
        let root = Path::new("/tmp/lumi-lib");
        assert!(safe_join(root, "/etc/passwd").is_err());
        assert!(safe_join(root, "C:/Windows/system32").is_err());
    }
}
