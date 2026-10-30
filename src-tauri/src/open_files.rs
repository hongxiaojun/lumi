//! M12-2: OS "Open With" / double-click → whitelist tokens → frontend importMany.
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_OPEN_BYTES: u64 = 512 * 1024 * 1024;

/// Formats the shelf can already import, minus `.txt` (the kernel rejects plain text).
/// Finder, drag-drop, and File → Open share this list.
pub const OPEN_BOOK_EXTS: &[&str] = &["epub", "pdf", "mobi", "azw3", "fb2"];

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
        .filter(|e| OPEN_BOOK_EXTS.iter().any(|ok| ok == e))
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct FilterOpenResult {
    pub accepted: Vec<PathBuf>,
    /// Display names of paths outside [`OPEN_BOOK_EXTS`] (for user-facing tips).
    pub rejected: Vec<String>,
}

/// Keep [`OPEN_BOOK_EXTS`] only (case-insensitive). Skip `-psn_*` silently.
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

/// Validate + canonicalize, then (in ONE whitelist lock) dedupe by canonical path and register.
/// `Ok(None)` = this file already has an unconsumed token; nothing new to deliver.
fn admit_path(state: &OpenFilesState, path: &Path) -> Result<Option<PendingOpen>, String> {
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
    let mut map = state
        .whitelist
        .lock()
        .map_err(|_| "open-files lock poisoned".to_string())?;
    if map.values().any(|existing| existing == &canon) {
        return Ok(None);
    }
    let token = new_token();
    map.insert(token.clone(), canon);
    Ok(Some(PendingOpen { token, name }))
}

/// Admit a batch; skips invalid paths and files that already hold an unconsumed token.
fn admit_batch(state: &OpenFilesState, paths: Vec<PathBuf>) -> Vec<PendingOpen> {
    let mut batch = Vec::new();
    for path in paths {
        match admit_path(state, &path) {
            Ok(Some(item)) => batch.push(item),
            Ok(None) => {}
            Err(err) => eprintln!("M12 open skip {:?}: {err}", path),
        }
    }
    batch
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct OpenRegistration {
    pub rejected: Vec<String>,
    /// `Some` → emit `open-files` with these items (frontend ready).
    /// `None` → either empty or queued into pending (not ready).
    pub to_emit: Option<Vec<PendingOpen>>,
}

/// Pure registration against in-memory state (no AppHandle). Used by menu Open and OS open/drop.
pub fn register_opens_into(state: &OpenFilesState, paths: Vec<PathBuf>) -> OpenRegistration {
    let filtered = filter_open_paths(paths);
    let batch = admit_batch(state, filtered.accepted);
    let to_emit = match state.delivery.lock() {
        Ok(mut delivery) => delivery.route(batch),
        Err(_) => None,
    };
    OpenRegistration {
        rejected: filtered.rejected,
        to_emit,
    }
}

/// Filter paths, surface rejected names, register accepted via the open-files pipeline.
pub fn register_opens_filtered(app: &AppHandle, paths: Vec<PathBuf>) {
    let state = app.state::<OpenFilesState>();
    let result = register_opens_into(&state, paths);
    if !result.rejected.is_empty() {
        let _ = app.emit("open-files-rejected", &result.rejected);
    }
    if let Some(batch) = result.to_emit {
        let _ = app.emit("open-files", &batch);
    }
}

/// Menu / dialog "Open…" layer: empty selection = cancel (no-op).
pub fn register_menu_open_selection(
    state: &OpenFilesState,
    selected: Option<Vec<PathBuf>>,
) -> OpenRegistration {
    register_opens_into(state, selected.unwrap_or_default())
}

#[tauri::command]
pub fn take_pending_opens(state: State<'_, OpenFilesState>) -> Result<Vec<PendingOpen>, String> {
    let mut delivery = state
        .delivery
        .lock()
        .map_err(|_| "open-files lock poisoned".to_string())?;
    Ok(delivery.take())
}

fn forget_token(state: &OpenFilesState, token: &str) {
    if let Ok(mut map) = state.whitelist.lock() {
        map.remove(token);
    }
}

/// One window of an admitted file. macOS evaluates each IPC reply as one script,
/// so a whole book cannot come back in a single call. The token stays until a
/// short window (including an empty one past the end) so the next window can
/// still find the path. A hard error forgets the token so the same file can be opened again.
pub(crate) fn read_opened_range(
    state: &OpenFilesState,
    token: &str,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>, String> {
    if length == 0 || length > crate::book_files::BOOK_READ_CHUNK {
        return Err("bad read length".into());
    }
    let path = {
        let map = state
            .whitelist
            .lock()
            .map_err(|_| "open-files lock poisoned".to_string())?;
        map.get(token)
            .cloned()
            .ok_or_else(|| "unknown open token".to_string())?
    };
    let fail = |message: String| -> Result<Vec<u8>, String> {
        forget_token(state, token);
        Err(message)
    };
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) => return fail(error.to_string()),
    };
    if meta.file_type().is_symlink() {
        return fail("symlink rejected".into());
    }
    if !meta.is_file() {
        return fail("not a regular file".into());
    }
    if book_ext(&path).is_none() {
        return fail("unsupported extension".into());
    }
    let len = meta.len();
    if len > MAX_OPEN_BYTES {
        return fail(format!(
            "file too large: {len} bytes (max {MAX_OPEN_BYTES} = 512MB)"
        ));
    }
    let mut file = match File::open(&path) {
        Ok(file) => file,
        Err(error) => return fail(error.to_string()),
    };
    if let Err(error) = file.seek(SeekFrom::Start(offset)) {
        return fail(error.to_string());
    }
    let mut buf = vec![0u8; length as usize];
    let n = match crate::book_protocol::fill_read(&mut file, &mut buf) {
        Ok(n) => n,
        Err(error) => return fail(error.to_string()),
    };
    buf.truncate(n);
    if (n as u64) < length {
        forget_token(state, token);
    }
    Ok(buf)
}

#[tauri::command]
pub fn read_opened_file(
    state: State<'_, OpenFilesState>,
    token: String,
    offset: u64,
    length: u64,
) -> Result<Response, String> {
    Ok(Response::new(read_opened_range(
        &state, &token, offset, length,
    )?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn item(t: &str) -> PendingOpen {
        PendingOpen {
            token: t.into(),
            name: format!("{t}.epub"),
        }
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
            PathBuf::from("/tmp/余华.AZW3"),
            PathBuf::from("/tmp/story.FB2"),
            PathBuf::from("/tmp/old.azw"),
            PathBuf::from("/tmp/packed.fb2.zip"),
        ];
        let got = filter_open_paths(args);
        assert_eq!(
            got.accepted,
            vec![
                PathBuf::from("/tmp/A.EPUB"),
                PathBuf::from("/tmp/b.Pdf"),
                PathBuf::from("/tmp/c.mobi"),
                PathBuf::from("/tmp/余华.AZW3"),
                PathBuf::from("/tmp/story.FB2"),
            ]
        );
        assert_eq!(
            got.rejected,
            vec![
                "leaf-reader".to_string(),
                "notes.txt".to_string(),
                "old.azw".to_string(),
                "packed.fb2.zip".to_string(),
            ]
        );
    }

    #[test]
    fn admit_kernel_formats_and_reject_txt_and_azw() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let mut accepted = Vec::new();
        for name in ["one.mobi", "two.azw3", "three.fb2"] {
            let path = dir.path().join(name);
            fs::write(&path, b"book").unwrap();
            accepted.push(path);
        }
        let got = admit_batch(&state, accepted);
        assert_eq!(got.len(), 3);
        assert_eq!(
            got.iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            vec!["one.mobi", "two.azw3", "three.fb2"]
        );
        let txt = dir.path().join("plain.txt");
        let azw = dir.path().join("kindle.azw");
        fs::write(&txt, b"t").unwrap();
        fs::write(&azw, b"a").unwrap();
        assert!(admit_path(&state, &txt)
            .unwrap_err()
            .contains("unsupported"));
        assert!(admit_path(&state, &azw)
            .unwrap_err()
            .contains("unsupported"));
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
        assert_eq!(
            got.rejected,
            vec!["photo.png".to_string(), "readme".to_string()]
        );
    }

    #[test]
    fn menu_open_cancel_is_noop() {
        let state = OpenFilesState::default();
        let _ = state.delivery.lock().unwrap().take(); // ready
        let result = register_menu_open_selection(&state, None);
        assert!(result.rejected.is_empty());
        assert!(result.to_emit.is_none());
        assert!(state.whitelist.lock().unwrap().is_empty());
        let empty = register_menu_open_selection(&state, Some(vec![]));
        assert!(empty.rejected.is_empty());
        assert!(empty.to_emit.is_none());
    }

    #[test]
    fn menu_open_mixed_formats_reject_and_accept() {
        let state = OpenFilesState::default();
        let _ = state.delivery.lock().unwrap().take();
        let dir = tempfile::tempdir().unwrap();
        let good = dir.path().join("ok.epub");
        let bad = dir.path().join("nope.txt");
        fs::write(&good, b"E").unwrap();
        fs::write(&bad, b"T").unwrap();
        let result = register_menu_open_selection(&state, Some(vec![good, bad]));
        assert_eq!(result.rejected, vec!["nope.txt".to_string()]);
        let batch = result.to_emit.expect("ready emit");
        assert_eq!(batch.len(), 1);
        assert_eq!(batch[0].name, "ok.epub");
    }

    #[test]
    fn menu_open_dedupes_unconsumed_token() {
        let state = OpenFilesState::default();
        let _ = state.delivery.lock().unwrap().take();
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("one.epub");
        fs::write(&file, b"1").unwrap();
        let first = register_menu_open_selection(&state, Some(vec![file.clone()]));
        let second = register_menu_open_selection(&state, Some(vec![file]));
        assert_eq!(first.to_emit.as_ref().unwrap().len(), 1);
        assert!(second.to_emit.is_none());
        assert_eq!(state.whitelist.lock().unwrap().len(), 1);
    }

    #[test]
    fn register_twice_same_batch_no_duplicate_token() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.epub");
        let b = dir.path().join("b.pdf");
        fs::write(&a, b"A").unwrap();
        fs::write(&b, b"B").unwrap();
        let first = admit_batch(&state, vec![a.clone(), b.clone()]);
        assert_eq!(first.len(), 2);
        let second = admit_batch(&state, vec![a, b]);
        assert!(second.is_empty());
        assert_eq!(state.whitelist.lock().unwrap().len(), 2);
    }

    #[test]
    fn different_spelling_same_canonical_one_token() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let file = sub.join("same.epub");
        fs::write(&file, b"S").unwrap();
        let alt = sub.join("..").join("sub").join(".").join("same.epub");
        let got = admit_batch(&state, vec![file, alt]);
        assert_eq!(got.len(), 1);
        assert_eq!(state.whitelist.lock().unwrap().len(), 1);
    }

    #[test]
    fn consumed_token_allows_reopen() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("again.epub");
        fs::write(&file, b"AG").unwrap();
        let first = admit_batch(&state, vec![file.clone()]);
        assert_eq!(first.len(), 1);
        assert!(admit_batch(&state, vec![file.clone()]).is_empty());
        read_opened_file_for_test(&state, first[0].token.clone()).unwrap();
        let again = admit_batch(&state, vec![file]);
        assert_eq!(again.len(), 1);
        assert_ne!(again[0].token, first[0].token);
    }

    #[test]
    fn opened_file_walks_in_windows_then_forgets_the_token() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("wide.epub");
        let bytes: Vec<u8> = (0..300_000).map(|i| (i % 251) as u8).collect();
        fs::write(&file, &bytes).unwrap();
        let pending = admit_path(&state, &file).unwrap().unwrap();
        let chunk = crate::book_files::BOOK_READ_CHUNK;
        let a = read_opened_range(&state, &pending.token, 0, chunk).unwrap();
        assert_eq!(a.len(), chunk as usize);
        assert_eq!(a[0], bytes[0]);
        assert_eq!(state.whitelist.lock().unwrap().len(), 1);
        let b = read_opened_range(&state, &pending.token, chunk, chunk).unwrap();
        assert_eq!(b.len(), chunk as usize);
        assert_eq!(b[0], bytes[chunk as usize]);
        let tail = read_opened_range(&state, &pending.token, chunk * 2, chunk).unwrap();
        assert_eq!(tail.len(), bytes.len() - (chunk as usize) * 2);
        assert_eq!(tail[0], bytes[(chunk as usize) * 2]);
        assert!(state.whitelist.lock().unwrap().is_empty());
        assert!(read_opened_range(&state, &pending.token, 0, chunk)
            .unwrap_err()
            .contains("unknown open token"));
    }

    #[test]
    fn opened_file_exact_window_needs_an_empty_read_to_forget_the_token() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("exact.epub");
        let chunk = crate::book_files::BOOK_READ_CHUNK as usize;
        fs::write(&file, vec![4u8; chunk]).unwrap();
        let pending = admit_path(&state, &file).unwrap().unwrap();
        let full = read_opened_range(&state, &pending.token, 0, chunk as u64).unwrap();
        assert_eq!(full.len(), chunk);
        assert_eq!(state.whitelist.lock().unwrap().len(), 1);
        let end = read_opened_range(&state, &pending.token, chunk as u64, chunk as u64).unwrap();
        assert!(end.is_empty());
        assert!(state.whitelist.lock().unwrap().is_empty());
    }

    #[test]
    fn opened_file_rejects_a_window_past_128kb() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("one.epub");
        fs::write(&file, b"EPUB").unwrap();
        let pending = admit_path(&state, &file).unwrap().unwrap();
        let err = read_opened_range(
            &state,
            &pending.token,
            0,
            crate::book_files::BOOK_READ_CHUNK + 1,
        )
        .unwrap_err();
        assert!(err.contains("bad read length"), "{err}");
        assert_eq!(state.whitelist.lock().unwrap().len(), 1);
    }

    #[test]
    fn token_is_one_shot_unknown_errors() {
        let state = OpenFilesState::default();
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("one.epub");
        fs::write(&file, b"EPUB").unwrap();
        let pending = admit_path(&state, &file).unwrap().unwrap();
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
        assert!(admit_path(&state, &txt)
            .unwrap_err()
            .contains("unsupported"));

        let sub = dir.path().join("folder");
        fs::create_dir(&sub).unwrap();
        assert!(admit_path(&state, &sub)
            .unwrap_err()
            .contains("not a regular file"));

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
        let pending = admit_path(&state, &big).unwrap().unwrap();
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
        read_opened_range(state, &token, 0, crate::book_files::BOOK_READ_CHUNK)
    }
}
