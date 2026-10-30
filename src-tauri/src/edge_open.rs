//! Open the current chapter in Microsoft Edge. The book frame is a blob page,
//! so Edge cannot load it in place. The chapter is written to a temp file first.
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

pub const EDGE_BUNDLE: &str = "com.microsoft.edgemac";
pub const EDGE_MISSING: &str = "这台 Mac 上没有找到 Microsoft Edge";
const MAX_HTML: usize = 8 * 1024 * 1024;

static SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, PartialEq, Eq)]
pub enum OpenChoice {
    Frame,
    Link,
    Deny,
}

pub fn choose(url: &str) -> OpenChoice {
    match url.split(':').next().unwrap_or("") {
        "blob" => OpenChoice::Frame,
        "http" | "https" => OpenChoice::Link,
        _ => OpenChoice::Deny,
    }
}

pub fn edge_args(target: &str) -> Vec<String> {
    vec!["-b".into(), EDGE_BUNDLE.into(), target.into()]
}

pub fn launch_edge(target: &str) -> Result<(), String> {
    let status = Command::new("open")
        .args(edge_args(target))
        .status()
        .map_err(|_| EDGE_MISSING.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(EDGE_MISSING.to_string())
    }
}

fn chapter_name() -> String {
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("chapter-{n}.html")
}

fn sweep_chapters(dir: &Path) {
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("chapter-") && name.ends_with(".html") {
            let _ = fs::remove_file(entry.path());
        }
    }
}

pub fn write_chapter(dir: &Path, html: &str) -> Result<PathBuf, String> {
    write_chapter_limited(dir, html, MAX_HTML)
}

fn write_chapter_limited(dir: &Path, html: &str, max: usize) -> Result<PathBuf, String> {
    if html.trim().is_empty() {
        return Err("这一章是空的".into());
    }
    if html.len() > max {
        return Err("这一章太大，Edge 打不开".into());
    }
    fs::create_dir_all(dir).map_err(|_| "这一章写不出去".to_string())?;
    sweep_chapters(dir);
    let path = dir.join(chapter_name());
    fs::write(&path, html).map_err(|_| "这一章写不出去".to_string())?;
    Ok(path)
}

#[tauri::command]
pub fn open_chapter_in_edge(html: String) -> Result<(), String> {
    let dir = std::env::temp_dir().join("lumi-edge");
    let path = write_chapter(&dir, &html)?;
    launch_edge(&path.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_frame_is_the_chapter_and_web_links_go_out() {
        assert_eq!(choose("blob:http://localhost/abc"), OpenChoice::Frame);
        assert_eq!(choose("blob:null/abc"), OpenChoice::Frame);
        assert_eq!(choose("https://example.test/a"), OpenChoice::Link);
        assert_eq!(choose("http://example.test/a"), OpenChoice::Link);
        assert_eq!(choose("leafbook://localhost/book.epub"), OpenChoice::Deny);
        assert_eq!(choose("javascript:alert(1)"), OpenChoice::Deny);
        assert_eq!(choose("file:///tmp/a.html"), OpenChoice::Deny);
    }

    #[test]
    fn edge_is_opened_by_bundle_id_without_a_shell() {
        assert_eq!(
            edge_args("/tmp/lumi-edge/chapter-1.html"),
            vec![
                "-b".to_string(),
                "com.microsoft.edgemac".to_string(),
                "/tmp/lumi-edge/chapter-1.html".to_string(),
            ]
        );
    }

    #[test]
    fn chapter_file_replaces_only_older_chapters() {
        let dir = std::env::temp_dir().join(format!("lumi-edge-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("chapter-old.html"), "old").unwrap();
        fs::write(dir.join("notes.txt"), "keep").unwrap();
        let path = write_chapter(&dir, "<p>余华</p>").unwrap();
        let name = path.file_name().unwrap().to_string_lossy();
        assert!(name.starts_with("chapter-") && name.ends_with(".html"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "<p>余华</p>");
        assert!(!dir.join("chapter-old.html").exists());
        assert_eq!(fs::read_to_string(dir.join("notes.txt")).unwrap(), "keep");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_or_huge_chapter_is_refused() {
        let dir = std::env::temp_dir().join(format!("lumi-edge-empty-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(write_chapter(&dir, "  ").unwrap_err(), "这一章是空的");
        assert_eq!(
            write_chapter_limited(&dir, "hello", 4).unwrap_err(),
            "这一章太大，Edge 打不开"
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
