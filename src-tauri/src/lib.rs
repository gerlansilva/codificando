use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

mod ocr;

fn b64() -> base64::engine::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .data_dir()
        .map_err(|e| e.to_string())?
        .join("Investigando");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn files_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("files");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn store_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("investigando.json"))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp-write");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn path_of(fp: tauri_plugin_dialog::FilePath) -> Option<PathBuf> {
    fp.into_path().ok()
}

fn describe(path: &Path) -> Value {
    serde_json::json!({
        "path": path.to_string_lossy(),
        "name": path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
    })
}

#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.print().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn store_load(app: AppHandle, path: Option<String>) -> Option<Value> {
    let file = match path {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => store_file(&app).ok()?,
    };
    let raw = fs::read_to_string(file).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
fn store_save(app: AppHandle, data: Value) -> Result<bool, String> {
    let file = store_file(&app)?;
    let bytes = serde_json::to_vec(&data).map_err(|e| e.to_string())?;
    atomic_write(&file, &bytes)?;
    Ok(true)
}

#[tauri::command]
fn data_path(app: AppHandle) -> String {
    store_file(&app)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
fn files_save(app: AppHandle, name: String, base64: String, key: String) -> Result<String, String> {
    let _ = &name;
    let safe = Path::new(&key)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .ok_or_else(|| "chave inválida".to_string())?;
    let bytes = b64().decode(base64.as_bytes()).map_err(|e| e.to_string())?;
    atomic_write(&files_dir(&app)?.join(&safe), &bytes)?;
    Ok(safe)
}

#[tauri::command]
fn files_read(app: AppHandle, key: String) -> Option<String> {
    let safe = Path::new(&key).file_name()?.to_string_lossy().to_string();
    let bytes = fs::read(files_dir(&app).ok()?.join(safe)).ok()?;
    Some(b64().encode(bytes))
}

#[tauri::command]
fn files_delete(app: AppHandle, key: String) -> bool {
    let Some(safe) = Path::new(&key).file_name().map(|s| s.to_string_lossy().to_string()) else {
        return false;
    };
    match files_dir(&app) {
        Ok(dir) => fs::remove_file(dir.join(safe)).is_ok(),
        Err(_) => false,
    }
}

#[tauri::command]
fn read_path(path: String) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(b64().encode(bytes))
}

#[tauri::command]
fn write_path(path: String, base64: String) -> Result<bool, String> {
    let bytes = b64().decode(base64.as_bytes()).map_err(|e| e.to_string())?;
    atomic_write(Path::new(&path), &bytes)?;
    Ok(true)
}

#[tauri::command]
async fn save_file(app: AppHandle, name: String, content: String, mime: String) -> Result<bool, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Salvar arquivo")
        .set_file_name(&name)
        .blocking_save_file();
    let _ = &mime;
    let Some(path) = picked.and_then(path_of) else {
        return Ok(false);
    };
    fs::write(path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn pick_files(app: AppHandle) -> Vec<Value> {
    let picked = app
        .dialog()
        .file()
        .set_title("Importar transcrições")
        .add_filter("Documentos", &["pdf", "doc", "docx", "txt", "rtf"])
        .blocking_pick_files();
    picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(path_of)
        .map(|p| describe(&p))
        .collect()
}

#[tauri::command]
async fn pick_images(app: AppHandle) -> Vec<Value> {
    let picked = app
        .dialog()
        .file()
        .set_title("Escolher imagens")
        .add_filter("Imagens", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_files();
    picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(path_of)
        .map(|p| describe(&p))
        .collect()
}

#[tauri::command]
async fn pick_image(app: AppHandle) -> Option<String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Escolher imagem")
        .add_filter("Imagens", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_file();
    picked.and_then(path_of).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
async fn save_panel(app: AppHandle, name: String) -> Option<String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Salvar projeto")
        .set_file_name(&name)
        .add_filter("Projeto Codificando", &["investigando", "json"])
        .blocking_save_file();
    picked.and_then(path_of).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
async fn open_panel(app: AppHandle) -> Option<String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Abrir projeto")
        .add_filter("Projeto Codificando", &["investigando", "json"])
        .blocking_pick_file();
    picked.and_then(path_of).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn convert_document(app: AppHandle, base64: String, ext: String) -> Option<String> {
    let bytes = b64().decode(base64.as_bytes()).ok()?;
    let tmp = std::env::temp_dir().join(format!("codificando-convert.{}", ext));
    fs::write(&tmp, bytes).ok()?;
    let output = std::process::Command::new("textutil")
        .arg("-convert")
        .arg("txt")
        .arg("-stdout")
        .arg(&tmp)
        .output()
        .ok()?;
    let _ = fs::remove_file(&tmp);
    let _ = app;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            print_window,
            store_load,
            store_save,
            data_path,
            files_save,
            files_read,
            files_delete,
            read_path,
            write_path,
            save_file,
            pick_files,
            pick_images,
            pick_image,
            save_panel,
            open_panel,
            convert_document,
            ocr::ocr_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
