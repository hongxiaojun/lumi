//! M12-2: OS "Open With" / double-click → whitelist tokens → frontend importMany.
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_OPEN_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingOpen {
    pub token: String,
    pub name: String,
}

/// Ready flag + pending queue under ONE lock, so "route vs take" can't race.
#[derive(Default, Debug)]
pub struct Delivery {
    ready: bool,
    pending: Vec<PendingOpen>,
}

impl Delivery {
    /// Not ready → queue, return None (don't emit). Ready → don't queue, return batch to emit.
    pub fn route(&mut self, batch: Vec<PendingOpen>) -> Option<Vec<PendingOpen>> {
        if batch.is_empty() {
            return None;
        }
        if self.ready {
            Some(batch)
        } else {
            self.pending.extend(batch);
            None
        }
    }

    /// Drain pending and mark ready in the same critical section.
    pub fn take(&mut self) -> Vec<PendingOpen> {
        self.ready = true;
        std::mem::take(&mut self.pending)
    }
}

#[derive(Default)]
pub struct OpenFilesState {
    whitelist: Mutex<HashMap<String, PathBuf>>,
    delivery: Mutex<Delivery>,
}

static TOKEN_SEQ: AtomicU64 = AtomicU64::new(1);

fn new_token() -> String {
    let n = TOKEN_SEQ.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}-{n:x}-{:x}", std::process::id())
}

fn book_ext(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| e == "epub" || e == "pdf")
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct FilterOpenResult {
    pub accepted: Vec<PathBuf>,
    /// Display names of paths that were not `.epub`/`.pdf` (for user-facing tips).
    pub rejected: Vec<String>,
}

/// Keep `.epub` / `.pdf` only (case-insensitive). Skip `-psn_*` silently.
/// Other paths contribute their file name to `rejected`. Dedupe accepted (order kept).
pub fn filter_open_paths<I, P>(args: I) -> FilterOpenResult
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    let mut seen = HashSet::new();
    let mut seen_reject = HashSet::new();
    let mut accepted = Vec::new();
    let mut rejected = Vec::new();
    for arg in args {
        let path = arg.as_ref();
        let raw = path.to_string_lossy();
        if raw.starts_with("-psn_") {
            continue;
        }
        if book_ext(path).is_none() {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| raw.to_string());
            if !name.is_empty() && seen_reject.insert(name.clone()) {
                rejected.push(name);
            }
            continue;
        }
        let key = raw.to_string();
        if !seen.insert(key) {
            continue;
        }
        accepted.push(path.to_path_buf());
    }
    FilterOpenResult { accepted, rejected }
}

fn admit_path(state: &OpenFilesState, path: &Path) -> Result<PendingOpen, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
        return Err("symlink rejected".into());
    }
    if !meta.is_file() {
        return Err("not a regular file".into());
    }
    if book_ext(path).is_none() {
        return Err("unsupported extension".into());
    }
    let canon = path.canonicalize().map_err(|e| e.to_string())?;
    // Re-check after canonicalize (reject if target drifted).
    let meta2 = fs::symlink_metadata(&canon).map_err(|e| e.to_string())?;
    if meta2.file_type().is_symlink() || !meta2.is_file() {
        return Err("not a regular file".into());
    }
    if book_ext(&canon).is_none() {
        return Err("unsupported extension".into());
    }
    let name = canon
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| "bad file name".to_string())?;
    let token = new_token();
    state
        .whitelist
        .lock()
        .map_err(|_| "open-files lock poisoned".to_string())?
        .insert(token.clone(), canon);
    Ok(PendingOpen { token, name })
}

/// Admit accepted paths into whitelist + ready/pending state machine; emit `open-files` when ready.
pub fn register_opens(app: &AppHandle, paths: Vec<PathBuf>) {
    let state = app.state::<OpenFilesState>();
    let mut batch = Vec::new();
    for path in paths {
        match admit_path(&state, &path) {
            Ok(item) => batch.push(item),
            Err(err) => eprintln!("M12 open skip {:?}: {err}", path),
        }
    }
    let to_emit = match state.delivery.lock() {
        Ok(mut delivery) => delivery.route(batch),
        Err(_) => None,
    };
    // Lock released before emit.
    if let Some(batch) = to_emit {
        let _ = app.emit("open-files", &batch);
    }
}

/// Filter paths, surface rejected names, register accepted via the open-files pipeline.
pub fn register_opens_filtered(app: &AppHandle, paths: Vec<PathBuf>) {
    let filtered = filter_open_paths(paths);
    if !filtered.rejected.is_empty() {
        let _ = app.emit("open-files-rejected", &filtered.rejected);
    }
    if !filtered.accepted.is_empty() {
        register_opens(app, filtered.accepted);
    }
}

#[tauri::command]
pub fn take_pending_opens(state: State<'_, OpenFilesState>) -> Result<Vec<PendingOpen>, String> {
    let mut delivery = state
        .delivery
        .lock()
        .map_err(|_| "open-files lock poisoned".to_string())?;
    Ok(delivery.take())
}

#[tauri::command]
pub fn read_opened_file(state: State<'_, OpenFilesState>, token: String) -> Result<Response, String> {
    let path = {
        let mut map = state
            .whitelist
            .lock()
            .map_err(|_| "open-files lock poisoned".to_string())?;
        map.remove(&token)
            .ok_or_else(|| "unknown open token".to_string())?
    };
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
        return Err("symlink rejected".into());
    }
    if !meta.is_file() {
        return Err("not a regular file".into());
    }
    if book_ext(&path).is_none() {
        return Err("unsupported extension".into());
    }
    let len = meta.len();
    if len > MAX_OPEN_BYTES {
        return Err(format!(
            "file too large: {len} bytes (max {MAX_OPEN_BYTES} = 512MB)"
        ));
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn item(t: &str) -> PendingOpen {
        PendingOpen { token: t.into(), name: format!("{t}.epub") }
    }

    #[test]
    fn delivery_before_ready_queues_without_emit() {
        let mut d = Delivery::default();
        assert_eq!(d.route(vec![item("a")]), None);
        assert_eq!(d.route(vec![item("b")]), None);
        assert_eq!(d.route(vec![]), None);
        assert_eq!(d.pending, vec![item("a"), item("b")]);
        assert!(!d.ready);
    }

    #[test]
    fn delivery_take_drains_and_sets_ready() {
        let mut d = Delivery::default();
        d.route(vec![item("a")]);
        assert_eq!(d.take(), vec![item("a")]);
        assert!(d.ready);
        assert!(d.pending.is_empty());
        assert!(d.take().is_empty());
    }

    #[test]
    fn delivery_after_ready_emits_without_queue() {
        let mut d = Delivery::default();
        d.take();
        assert_eq!(d.route(vec![item("c")]), Some(vec![item("c")]));
        assert!(d.pending.is_empty());
        assert!(d.take().is_empty());
    }

    #[test]
    fn filter_keeps_books_skips_psn_and_exe_dedupes() {
        let args = [
            PathBuf::from("/Applications/Lumi.app/Contents/MacOS/leaf-reader"),
            PathBuf::from("-psn_0_12345"),
            PathBuf::from("/tmp/A.EPUB"),
            PathBuf::from("/tmp/notes.txt"),
            PathBuf::from("/tmp/A.EPUB"),
            PathBuf::from("/tmp/b.Pdf"),
            PathBuf::from("/tmp/c.mobi"),
        ];
        let got = filter_open_paths(args);
        assert_eq!(
            got.accepted,
            vec![PathBuf::from("/tmp/A.EPUB"), PathBuf::from("/tmp/b.Pdf")]
        );
        assert_eq!(
            got.rejected,
            vec![
                "leaf-reader".into(),
                "notes.txt".into(),
                "c.mobi".into(),
            ]
        );
    }

    #[test]
    fn filter_returns_rejected_names_for_bad_ext() {
        let got = filter_open_paths([
            PathBuf::from("/Books/Good.epub"),
            PathBuf::from("/Books/photo.png"),
            PathBuf::from("/Books/photo.png"),
            PathBuf::from("/Books/readme"),
        ]);
        assert_eq!(got.accepted, vec![PathBuf::from("/Books/Good.epub")]);
        assert_eq!(got.rejected, vec!["photo.png".into(), "readme".into()]);
    }

    #[test]
    fn token_is_one_shot_unknown_errors() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("one.epub");
        fs::write(&file, b"EPUB").unwrap();
        let pending = admit_path(&state, &file).unwrap();
        assert_eq!(pending.name, "one.epub");
        assert!(!pending.token.contains('/'));
        let first = read_opened_file_for_test(&state, pending.token.clone()).unwrap();
        assert_eq!(first, b"EPUB");
        let second = read_opened_file_for_test(&state, pending.token);
        assert!(second.unwrap_err().contains("unknown open token"));
        assert!(read_opened_file_for_test(&state, "nope".into())
            .unwrap_err()
            .contains("unknown open token"));
    }

    #[test]
    fn reject_bad_ext_dir_symlink_and_huge() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();

        let txt = dir.path().join("x.txt");
        fs::write(&txt, b"nope").unwrap();
        // filter drops it; admit also rejects if forced
        assert!(admit_path(&state, &txt).unwrap_err().contains("unsupported"));

        let sub = dir.path().join("folder");
        fs::create_dir(&sub).unwrap();
        assert!(admit_path(&state, &sub).unwrap_err().contains("not a regular file"));

        let target = dir.path().join("real.epub");
        fs::write(&target, b"ok").unwrap();
        let link = dir.path().join("link.epub");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&target, &link).unwrap();
            assert!(admit_path(&state, &link).unwrap_err().contains("symlink"));
        }

        // Huge file: admit ok, read fails.
        let big = dir.path().join("big.epub");
        let mut f = fs::File::create(&big).unwrap();
        // Don't actually write 513MB; poke metadata via admit then swap map entry? Instead
        // unit-test the size gate with a tiny helper.
        f.write_all(b"small").unwrap();
        drop(f);
        let pending = admit_path(&state, &big).unwrap();
        // Manually verify size check function path by writing oversized via sparse if possible.
        // On APFS seek beyond 512MB creates sparse file quickly.
        {
            use std::io::{Seek, SeekFrom};
            let mut f = fs::OpenOptions::new().write(true).open(&big).unwrap();
            f.seek(SeekFrom::Start(MAX_OPEN_BYTES + 1)).unwrap();
            f.write_all(&[1]).unwrap();
        }
        // Re-insert same path under token (whitelist still points at big).
        let err = read_opened_file_for_test(&state, pending.token).unwrap_err();
        assert!(err.contains("file too large"), "{err}");
    }

    fn read_opened_file_for_test(state: &OpenFilesState, token: String) -> Result<Vec<u8>, String> {
        let path = {
            let mut map = state.whitelist.lock().unwrap();
            map.remove(&token).ok_or_else(|| "unknown open token".to_string())?
        };
        let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            return Err("symlink rejected".into());
        }
        if !meta.is_file() {
            return Err("not a regular file".into());
        }
        if book_ext(&path).is_none() {
            return Err("unsupported extension".into());
        }
        let len = meta.len();
        if len > MAX_OPEN_BYTES {
            return Err(format!(
                "file too large: {len} bytes (max {MAX_OPEN_BYTES} = 512MB)"
            ));
        }
        fs::read(&path).map_err(|e| e.to_string())
    }
}
