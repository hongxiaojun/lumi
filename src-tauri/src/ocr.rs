//! M13: Apple Vision OCR for PDF pages whose text layer is missing or garbled.
//! The frontend renders one page to RGBA pixels and posts them as a raw body;
//! this command runs VNRecognizeTextRequest on-device and returns normalized
//! line boxes (Vision's bottom-left origin).

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};

const MAX_PIXELS: u64 = 4096 * 4096;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Payload = raw RGBA bytes; width/height ride in headers.
pub(crate) fn parse_page(request: &Request<'_>) -> Result<(u32, u32, Vec<u8>), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw binary body".into());
    };
    let (width, height) = page_size(request.headers())?;
    let pixels = pixel_bytes(&width, &height, bytes)?.into_owned();
    Ok((width, height, pixels))
}

/// Width/height headers validated and bounded to what Vision will take.
pub(crate) fn page_size(headers: &tauri::http::HeaderMap) -> Result<(u32, u32), String> {
    let width = size_header(headers, "x-page-width")?;
    let height = size_header(headers, "x-page-height")?;
    if width == 0 || height == 0 {
        return Err("bad page size".into());
    }
    if u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("page too large".into());
    }
    Ok((width, height))
}

/// The body must be exactly w*h*4 RGBA bytes.
pub(crate) fn pixel_bytes<'a>(
    width: &u32,
    height: &u32,
    bytes: &'a [u8],
) -> Result<std::borrow::Cow<'a, [u8]>, String> {
    let need = u64::from(*width) * u64::from(*height) * 4;
    if bytes.len() as u64 != need {
        return Err(format!("expected {need} pixel bytes, got {}", bytes.len()));
    }
    Ok(std::borrow::Cow::Borrowed(bytes))
}

fn size_header(headers: &tauri::http::HeaderMap, name: &str) -> Result<u32, String> {
    let raw = headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("missing {name}"))?;
    raw.parse::<u32>().map_err(|_| format!("bad {name}"))
}

#[tauri::command]
pub async fn ocr_page(request: Request<'_>) -> Result<Vec<OcrLine>, String> {
    let (width, height, pixels) = parse_page(&request)?;
    tauri::async_runtime::spawn_blocking(move || run_ocr(width, height, &pixels))
        .await
        .map_err(|e| format!("ocr join failed: {e}"))?
}

#[cfg(target_os = "macos")]
fn run_ocr(width: u32, height: u32, pixels: &[u8]) -> Result<Vec<OcrLine>, String> {
    vision::recognize(width, height, pixels)
}

#[cfg(not(target_os = "macos"))]
fn run_ocr(_width: u32, _height: u32, _pixels: &[u8]) -> Result<Vec<OcrLine>, String> {
    Err("OCR is only built for macOS".into())
}

#[cfg(target_os = "macos")]
mod vision {
    use std::ffi::c_void;

    use super::OcrLine;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::AllocAnyThread;
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequest,
        VNRequestTextRecognitionLevel,
    };

    // The objc2 bindings expose Vision's CGImage parameter type but not the
    // CoreGraphics C constructors, so this file declares the small FFI it needs.
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGColorSpaceCreateDeviceRGB() -> *const c_void;
        fn CGColorSpaceRelease(space: *const c_void);
        fn CGDataProviderCreateWithCFData(data: *const c_void) -> *const c_void;
        fn CGDataProviderRelease(provider: *const c_void);
        fn CGImageCreate(
            width: usize,
            height: usize,
            bits_per_component: usize,
            bits_per_pixel: usize,
            bytes_per_row: usize,
            space: *const c_void,
            bitmap_info: u32,
            provider: *const c_void,
            decode: *const c_void,
            should_interpolate: bool,
            intent: i32,
        ) -> *const c_void;
        fn CGImageRelease(image: *const c_void);
    }

    const K_CG_IMAGE_ALPHA_PREMULTIPLIED_LAST: u32 = 1;
    const K_CG_RENDERING_INTENT_DEFAULT: i32 = 0;

    pub(crate) fn recognize(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<OcrLine>, String> {
        unsafe {
            let space = CGColorSpaceCreateDeviceRGB();
            if space.is_null() {
                return Err("no RGB color space".into());
            }
            // NSData is toll-free bridged to CFData for the pixel provider and
            // keeps the bytes alive until the request has run.
            let data = NSData::from_vec(rgba.to_vec());
            let provider = CGDataProviderCreateWithCFData(&*data as *const NSData as *const c_void);
            let image = CGImageCreate(
                width as usize,
                height as usize,
                8,
                32,
                width as usize * 4,
                space,
                K_CG_IMAGE_ALPHA_PREMULTIPLIED_LAST,
                provider,
                std::ptr::null(),
                false,
                K_CG_RENDERING_INTENT_DEFAULT,
            );
            let mut lines = Vec::new();
            if image.is_null() {
                CGDataProviderRelease(provider);
                CGColorSpaceRelease(space);
                return Err("CGImageCreate failed".into());
            }
            let result = run_request(image, &mut lines);
            CGImageRelease(image);
            CGDataProviderRelease(provider);
            CGColorSpaceRelease(space);
            result.map(|_| lines)
        }
    }

    unsafe fn run_request(image: *const c_void, lines: &mut Vec<OcrLine>) -> Result<(), String> {
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(true);
        let langs = NSArray::from_retained_slice(&[
            NSString::from_str("zh-Hans"),
            NSString::from_str("en-US"),
        ]);
        request.setRecognitionLanguages(&langs);

        let as_request: Retained<VNRequest> = request.clone().into_super().into_super();
        let requests = NSArray::from_retained_slice(&[as_request]);
        let options = NSDictionary::<NSString, AnyObject>::new();
        let handler = VNImageRequestHandler::initWithCGImage_options(
            VNImageRequestHandler::alloc(),
            &*(image as *const objc2_core_graphics::CGImage),
            &options,
        );
        if let Err(error) = handler.performRequests_error(&requests) {
            return Err(error.localizedDescription().to_string());
        }

        let results = request.results();
        let Some(results) = results else {
            return Ok(());
        };
        for obs in results.iter() {
            let candidates = obs.topCandidates(1);
            let Some(best) = candidates.firstObject() else {
                continue;
            };
            let text = best.string().to_string();
            if text.trim().is_empty() {
                continue;
            }
            let bbox = obs.boundingBox();
            lines.push(OcrLine {
                text,
                x: bbox.origin.x,
                y: bbox.origin.y,
                w: bbox.size.width,
                h: bbox.size.height,
            });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::http::HeaderMap;

    fn headers(width: &str, height: &str) -> HeaderMap {
        let mut map = HeaderMap::new();
        map.insert("x-page-width", width.parse().unwrap());
        map.insert("x-page-height", height.parse().unwrap());
        map
    }

    #[test]
    fn accepts_a_matching_payload() {
        let (w, h) = page_size(&headers("2", "1")).unwrap();
        let pixels = pixel_bytes(&w, &h, &[0u8; 8]).unwrap();
        assert_eq!((w, h), (2, 1));
        assert_eq!(pixels.len(), 8);
    }

    #[test]
    fn rejects_size_mismatch_and_bad_headers() {
        assert!(pixel_bytes(&2, &1, &[0u8; 7]).is_err());
        assert!(page_size(&headers("0", "1")).is_err());
        assert!(page_size(&headers("x", "1")).is_err());
        assert!(page_size(&headers("99999999", "99999999")).is_err());
        assert!(page_size(&HeaderMap::new()).is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn recognizes_a_blank_page_as_no_lines() {
        // 64x64 white page: Vision runs and finds nothing, which is the
        // pipeline's "wired correctly" signal.
        let blank = vec![255u8; 64 * 64 * 4];
        let lines = vision::recognize(64, 64, &blank).expect("vision should run");
        assert!(lines.is_empty());
    }
}
