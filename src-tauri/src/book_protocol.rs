//! Serves one book file at `leafbook://localhost/<id>.<ext>`.
//! The path is a single filename under the books directory. Range bodies stay
//! at or under `BOOK_FETCH_CHUNK` so the webview never asks for a whole book.
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use tauri::http::header::{
    ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS,
    ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_EXPOSE_HEADERS, CONTENT_RANGE, CONTENT_TYPE,
};
use tauri::http::{Response, StatusCode};

use crate::ai_library::safe_join;

pub(crate) const BOOK_FETCH_CHUNK: u64 = 512 * 1024;

pub(crate) fn fill_read(reader: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match reader.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }
    Ok(filled)
}

pub(crate) fn book_name_from_path(path: &str) -> Result<String, StatusCode> {
    let raw = path.split('?').next().unwrap_or(path);
    let decoded = percent_decode(raw);
    let name = decoded.trim_start_matches('/');
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
        || name.contains("..")
    {
        return Err(StatusCode::FORBIDDEN);
    }
    let Some((id, ext)) = name.rsplit_once('.') else {
        return Err(StatusCode::FORBIDDEN);
    };
    let id_ok = (1..=128).contains(&id.len())
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    let ext_ok = (1..=10).contains(&ext.len()) && ext.chars().all(|c| c.is_ascii_alphanumeric());
    if !id_ok || !ext_ok {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(format!("{id}.{}", ext.to_ascii_lowercase()))
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn finish(status: StatusCode, content_range: Option<String>, body: Vec<u8>) -> Response<Vec<u8>> {
    let mut builder = Response::builder()
        .status(status)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
        .header(ACCESS_CONTROL_ALLOW_HEADERS, "range")
        .header(
            ACCESS_CONTROL_EXPOSE_HEADERS,
            "content-range, content-length, accept-ranges",
        )
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_TYPE, "application/octet-stream");
    if let Some(value) = content_range {
        builder = builder.header(CONTENT_RANGE, value);
    }
    builder.body(body).unwrap_or_else(|_| {
        Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Vec::new())
            .expect("empty error body")
    })
}

fn parse_range(header: Option<&str>, total: u64) -> (u64, u64) {
    let last = total.saturating_sub(1);
    let Some(header) = header else {
        return (0, last);
    };
    let Some(spec) = header.trim().strip_prefix("bytes=") else {
        return (0, last);
    };
    let spec = spec.split(',').next().unwrap_or(spec).trim();
    let Some((start_s, end_s)) = spec.split_once('-') else {
        return (0, last);
    };
    let start = start_s.parse::<u64>().unwrap_or(0);
    let end = if end_s.is_empty() {
        last
    } else {
        end_s.parse::<u64>().unwrap_or(last)
    };
    (start, end)
}

fn read_window(path: &Path, range: Option<&str>) -> std::io::Result<(StatusCode, Option<String>, Vec<u8>)> {
    let mut file = File::open(path)?;
    let total = file.metadata()?.len();
    if total == 0 {
        return Ok((
            StatusCode::RANGE_NOT_SATISFIABLE,
            Some(format!("bytes */{total}")),
            Vec::new(),
        ));
    }
    let (start, want_end) = parse_range(range, total);
    if start >= total {
        return Ok((
            StatusCode::RANGE_NOT_SATISFIABLE,
            Some(format!("bytes */{total}")),
            Vec::new(),
        ));
    }
    let end = want_end.min(total - 1).min(start.saturating_add(BOOK_FETCH_CHUNK - 1));
    let len = (end - start + 1) as usize;
    file.seek(SeekFrom::Start(start))?;
    let mut buf = vec![0u8; len];
    let n = fill_read(&mut file, &mut buf)?;
    buf.truncate(n);
    if n == 0 {
        return Ok((
            StatusCode::RANGE_NOT_SATISFIABLE,
            Some(format!("bytes */{total}")),
            Vec::new(),
        ));
    }
    let actual_end = start + n as u64 - 1;
    let status = if range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    Ok((
        status,
        Some(format!("bytes {start}-{actual_end}/{total}")),
        buf,
    ))
}

pub(crate) fn unavailable() -> Response<Vec<u8>> {
    finish(StatusCode::SERVICE_UNAVAILABLE, None, Vec::new())
}

pub(crate) fn respond_book(
    root: &Path,
    method: &str,
    path: &str,
    range: Option<&str>,
) -> Response<Vec<u8>> {
    if method.eq_ignore_ascii_case("OPTIONS") {
        return finish(StatusCode::NO_CONTENT, None, Vec::new());
    }
    if !method.eq_ignore_ascii_case("GET") && !method.eq_ignore_ascii_case("HEAD") {
        return finish(StatusCode::METHOD_NOT_ALLOWED, None, Vec::new());
    }
    let name = match book_name_from_path(path) {
        Ok(name) => name,
        Err(status) => return finish(status, None, Vec::new()),
    };
    let file_path = match safe_join(root, &name) {
        Ok(path) => path,
        Err(_) => return finish(StatusCode::FORBIDDEN, None, Vec::new()),
    };
    match std::fs::symlink_metadata(&file_path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            return finish(StatusCode::FORBIDDEN, None, Vec::new());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return finish(StatusCode::NOT_FOUND, None, Vec::new());
        }
        Err(_) => return finish(StatusCode::INTERNAL_SERVER_ERROR, None, Vec::new()),
    }
    match read_window(&file_path, range) {
        Ok((status, content_range, bytes)) => {
            let body = if method.eq_ignore_ascii_case("HEAD") {
                Vec::new()
            } else {
                bytes
            };
            finish(status, content_range, body)
        }
        Err(_) => finish(StatusCode::INTERNAL_SERVER_ERROR, None, Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct OneByte<'a> {
        bytes: &'a [u8],
        at: usize,
    }

    impl Read for OneByte<'_> {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            if self.at >= self.bytes.len() || buf.is_empty() {
                return Ok(0);
            }
            buf[0] = self.bytes[self.at];
            self.at += 1;
            Ok(1)
        }
    }

    #[test]
    fn short_read_is_filled() {
        let data = [9u8, 8, 7, 6, 5];
        let mut reader = OneByte { bytes: &data, at: 0 };
        let mut buf = [0u8; 5];
        assert_eq!(fill_read(&mut reader, &mut buf).unwrap(), 5);
        assert_eq!(buf, data);
    }

    #[test]
    fn filename_request_returns_the_range_and_content_range() {
        let dir = tempfile::tempdir().unwrap();
        let bytes: Vec<u8> = (0..100).map(|i| i as u8).collect();
        std::fs::write(dir.path().join("book-1.epub"), &bytes).unwrap();
        let res = respond_book(dir.path(), "GET", "/book-1.epub", Some("bytes=2-5"));
        assert_eq!(res.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(res.body(), &vec![2, 3, 4, 5]);
        assert_eq!(
            res.headers().get(CONTENT_RANGE).unwrap().to_str().unwrap(),
            "bytes 2-5/100"
        );
        assert_eq!(
            res.headers()
                .get(ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap()
                .to_str()
                .unwrap(),
            "*"
        );
        let capped = vec![7u8; (BOOK_FETCH_CHUNK as usize) + 10];
        std::fs::write(dir.path().join("big-1.epub"), &capped).unwrap();
        let wide = respond_book(dir.path(), "GET", "/big-1.epub", Some("bytes=0-9999999"));
        assert_eq!(wide.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(wide.body().len(), BOOK_FETCH_CHUNK as usize);
        assert_eq!(
            wide.headers().get(CONTENT_RANGE).unwrap().to_str().unwrap(),
            format!("bytes 0-{}/{len}", BOOK_FETCH_CHUNK - 1, len = capped.len())
        );
    }

    #[test]
    fn traversal_and_nested_paths_are_forbidden() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("book-1.epub"), b"inside").unwrap();
        let outside = dir.path().parent().unwrap().join("secret.epub");
        std::fs::write(&outside, b"secret").unwrap();
        for path in [
            "/../secret.epub",
            "/book-1.epub/../secret.epub",
            "/%2e%2e/secret.epub",
            "/nested/book-1.epub",
            "/..",
        ] {
            let res = respond_book(dir.path(), "GET", path, None);
            assert_eq!(res.status(), StatusCode::FORBIDDEN, "{path}");
            assert!(res.body().is_empty(), "{path}");
        }
        assert_eq!(std::fs::read(&outside).unwrap(), b"secret");
        let _ = std::fs::remove_file(&outside);
        let missing = respond_book(dir.path(), "GET", "/missing.epub", None);
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
        let preflight = respond_book(dir.path(), "OPTIONS", "/book-1.epub", None);
        assert_eq!(preflight.status(), StatusCode::NO_CONTENT);
    }
}
