use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{DynamicImage, ImageFormat};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Files queued for windows that were just spawned. Keyed by window label so
/// a new window knows which image to open without a query-string round trip.
#[derive(Default)]
struct PendingFiles(Mutex<HashMap<String, String>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImagePayload {
    path: String,
    name: String,
    mime: String,
    ext: String,
    base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    path: String,
    bytes: usize,
}

fn supported_format(format: ImageFormat) -> bool {
    matches!(
        format,
        ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP
    )
}

/// The image this window should open: a queued file for secondary windows,
/// otherwise the first non-flag argument (file managers and `eddy photo.jpg`).
#[tauri::command]
fn initial_file(window: WebviewWindow, pending: State<'_, PendingFiles>) -> Option<String> {
    if let Some(path) = pending
        .0
        .lock()
        .ok()
        .and_then(|mut files| files.remove(window.label()))
    {
        return Some(path);
    }

    std::env::args()
        .skip(1)
        .find(|arg| !arg.starts_with('-'))
}

#[tauri::command]
async fn read_image(path: String) -> Result<ImagePayload, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    let format = image::guess_format(&bytes)
        .map_err(|e| format!("Could not recognise the image format: {e}"))?;

    if !supported_format(format) {
        return Err(format!(
            "Unsupported format. eddy opens PNG, JPEG and WebP images."
        ));
    }

    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image")
        .to_string();

    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_else(|| format.extensions_str()[0].to_string());

    Ok(ImagePayload {
        path,
        name,
        mime: format.to_mime_type().to_string(),
        ext,
        base64: STANDARD.encode(&bytes),
    })
}

fn flatten_to_rgb(image: &DynamicImage) -> image::RgbImage {
    let rgba = image.to_rgba8();
    let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = pixel[3] as f32 / 255.0;
        let blend = |channel: u8| -> u8 {
            (channel as f32 * alpha + 255.0 * (1.0 - alpha)).round() as u8
        };
        rgb.put_pixel(
            x,
            y,
            image::Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]),
        );
    }
    rgb
}

fn encode(image: &DynamicImage, format: ImageFormat, quality: f32) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    match format {
        ImageFormat::Jpeg => {
            let rgb = flatten_to_rgb(image);
            let quality = (quality.clamp(0.1, 1.0) * 100.0).round() as u8;
            let mut encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
            encoder
                .encode_image(&rgb)
                .map_err(|e| format!("Could not encode JPEG: {e}"))?;
        }
        ImageFormat::Png => {
            image
                .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
                .map_err(|e| format!("Could not encode PNG: {e}"))?;
        }
        ImageFormat::WebP => {
            image
                .write_to(&mut Cursor::new(&mut out), ImageFormat::WebP)
                .map_err(|e| format!("Could not encode WebP: {e}"))?;
        }
        _ => return Err("Unsupported output format".into()),
    }
    Ok(out)
}

fn format_from_name(format: &str) -> Result<ImageFormat, String> {
    match format.to_ascii_lowercase().as_str() {
        "png" => Ok(ImageFormat::Png),
        "jpeg" | "jpg" => Ok(ImageFormat::Jpeg),
        "webp" => Ok(ImageFormat::WebP),
        other => Err(format!("Unsupported output format: {other}")),
    }
}

#[tauri::command]
async fn save_image(
    path: String,
    png_base64: String,
    format: String,
    quality: Option<f32>,
) -> Result<SaveResult, String> {
    let target_format = format_from_name(&format)?;

    let png_bytes = STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|e| format!("Could not decode rendered image: {e}"))?;

    let image = image::load_from_memory_with_format(&png_bytes, ImageFormat::Png)
        .map_err(|e| format!("Could not read rendered image: {e}"))?;

    let encoded = encode(&image, target_format, quality.unwrap_or(0.92))?;

    let target = PathBuf::from(&path);
    let parent = target.parent().ok_or("Invalid destination path")?;
    std::fs::create_dir_all(parent).map_err(|e| format!("Could not create folder: {e}"))?;

    // Write to a sibling temp file, then rename, so a failed save never
    // truncates the user's original photo.
    let temp = target.with_file_name(format!(
        ".{}.{}.tmp",
        target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("eddy"),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));

    std::fs::write(&temp, &encoded).map_err(|e| format!("Could not write image: {e}"))?;
    if let Err(error) = std::fs::rename(&temp, &target) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("Could not save image: {error}"));
    }

    Ok(SaveResult {
        path: target.to_string_lossy().to_string(),
        bytes: encoded.len(),
    })
}

/// eddy is one image per window, so opening a file while another is loaded
/// spawns a fresh window instead of replacing the current document.
#[tauri::command]
async fn open_in_new_window(
    app: AppHandle,
    pending: State<'_, PendingFiles>,
    path: String,
) -> Result<(), String> {
    if !Path::new(&path).is_file() {
        return Err(format!("No such file: {path}"));
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let label = format!("image-{stamp}");

    pending
        .0
        .lock()
        .map_err(|_| "Could not queue the image".to_string())?
        .insert(label.clone(), path);

    let built = WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App("index.html".into()))
        .title("eddy")
        .inner_size(1280.0, 860.0)
        .min_inner_size(880.0, 560.0)
        .build();

    if let Err(error) = built {
        if let Ok(mut files) = pending.0.lock() {
            files.remove(&label);
        }
        return Err(format!("Could not open a new window: {error}"));
    }

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(PendingFiles::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            initial_file,
            read_image,
            save_image,
            open_in_new_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running eddy");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_png_jpeg_and_webp() {
        let mut source = image::RgbaImage::new(16, 12);
        for (x, y, pixel) in source.enumerate_pixels_mut() {
            *pixel = image::Rgba([(x * 12) as u8, (y * 18) as u8, 96, 200]);
        }
        let image = DynamicImage::ImageRgba8(source);

        for (format, quality) in [
            (ImageFormat::Png, 0.92),
            (ImageFormat::Jpeg, 0.92),
            (ImageFormat::WebP, 0.9),
        ] {
            let encoded = encode(&image, format, quality).expect("encoding should succeed");
            assert!(!encoded.is_empty(), "{format:?} produced no bytes");

            let decoded = image::load_from_memory_with_format(&encoded, format)
                .expect("encoded bytes should decode");
            assert_eq!((decoded.width(), decoded.height()), (16, 12));
        }
    }

    #[test]
    fn flattens_transparency_to_white_for_jpeg() {
        let mut source = image::RgbaImage::new(1, 1);
        source.put_pixel(0, 0, image::Rgba([0, 0, 0, 0]));
        let rgb = flatten_to_rgb(&DynamicImage::ImageRgba8(source));
        assert_eq!(rgb.get_pixel(0, 0).0, [255, 255, 255]);
    }

    #[test]
    fn maps_format_names() {
        assert!(matches!(format_from_name("PNG"), Ok(ImageFormat::Png)));
        assert!(matches!(format_from_name("jpeg"), Ok(ImageFormat::Jpeg)));
        assert!(matches!(format_from_name("jpg"), Ok(ImageFormat::Jpeg)));
        assert!(matches!(format_from_name("webp"), Ok(ImageFormat::WebP)));
        assert!(format_from_name("gif").is_err());
    }
}
