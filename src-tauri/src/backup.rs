//! Backups automáticos dos arquivos de projeto.
//!
//! Cada projeto tem uma pasta própria em
//! `~/Library/Application Support/Investigando/backups/<slug>/` com até 20
//! snapshots JSON. O nome do snapshot é o timestamp em milissegundos.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

const MAX_BACKUPS: usize = 20;
const MIN_INTERVAL_MS: u64 = 60_000;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn backups_root() -> PathBuf {
    match std::env::var("HOME") {
        Ok(home) if !home.is_empty() => {
            PathBuf::from(home).join("Library/Application Support/Investigando/backups")
        }
        _ => std::env::temp_dir().join("Investigando/backups"),
    }
}

fn slug_for(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("projeto");
    let mut out = String::new();
    for ch in stem.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
        if out.len() >= 60 {
            break;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        "projeto".to_string()
    } else {
        out
    }
}

fn project_dir(path: &Path) -> PathBuf {
    backups_root().join(slug_for(path))
}

/// Nome de arquivo aceito como id: sem separadores e sem `..`.
fn safe_id(id: &str) -> Option<String> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return None;
    }
    let name = Path::new(id).file_name()?.to_string_lossy().to_string();
    if name != id || !name.ends_with(".json") {
        return None;
    }
    Some(name)
}

struct Entry {
    id: String,
    path: PathBuf,
    mtime: u64,
    bytes: u64,
}

fn entries(dir: &Path) -> Vec<Entry> {
    let mut out = Vec::new();
    let Ok(read) = fs::read_dir(dir) else {
        return out;
    };
    for item in read.flatten() {
        let path = item.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !name.ends_with(".json") {
            continue;
        }
        let Ok(meta) = item.metadata() else {
            continue;
        };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(Entry {
            id: name.to_string(),
            path,
            mtime,
            bytes: meta.len(),
        });
    }
    out.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    out
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp-backup");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Copia o estado atual para um snapshot novo. Não aplica o limite de tempo.
fn snapshot(src: &Path, dir: &Path) -> Result<String, String> {
    let bytes = fs::read(src).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let base = now_ms();
    let mut id = format!("{}.json", base);
    let mut n = 0u64;
    while dir.join(&id).exists() && n < 1000 {
        n += 1;
        id = format!("{}.json", base + n);
    }
    atomic_write(&dir.join(&id), &bytes)?;
    Ok(id)
}

fn prune(dir: &Path) {
    let list = entries(dir);
    if list.len() <= MAX_BACKUPS {
        return;
    }
    for old in list.iter().skip(MAX_BACKUPS) {
        let _ = fs::remove_file(&old.path);
    }
}

fn iso_from_ms(ms: u64) -> String {
    let secs = ms / 1000;
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

// Howard Hinnant, days since 1970-01-01 -> (ano, mês, dia) no calendário gregoriano.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Cria um snapshot do projeto. Retorna `None` quando não há arquivo ou quando
/// o último backup tem menos de um minuto.
#[tauri::command]
pub fn backup_create(path: String) -> Result<Option<String>, String> {
    let src = PathBuf::from(&path);
    if !src.is_file() {
        return Ok(None);
    }
    let dir = project_dir(&src);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if let Some(last) = entries(&dir).first() {
        if now_ms().saturating_sub(last.mtime) < MIN_INTERVAL_MS {
            return Ok(None);
        }
    }
    let id = snapshot(&src, &dir)?;
    prune(&dir);
    Ok(Some(id))
}

/// Lista os backups, do mais recente para o mais antigo.
#[tauri::command]
pub fn backup_list(path: String) -> Vec<Value> {
    let dir = project_dir(Path::new(&path));
    entries(&dir)
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "id": e.id,
                "timestamp": e.mtime,
                "iso": iso_from_ms(e.mtime),
                "bytes": e.bytes,
            })
        })
        .collect()
}

/// Restaura um backup sobre o projeto. Antes, guarda o estado atual como novo
/// snapshot para permitir desfazer a restauração.
#[tauri::command]
pub fn backup_restore(path: String, id: String) -> Result<bool, String> {
    let target = PathBuf::from(&path);
    let dir = project_dir(&target);
    let name = safe_id(&id).ok_or_else(|| "backup inválido".to_string())?;
    let file = dir.join(&name);
    if !file.is_file() {
        return Err("backup não encontrado".to_string());
    }
    // lê antes de podar, para não perder o próprio backup em restauração
    let bytes = fs::read(&file).map_err(|e| e.to_string())?;
    if target.is_file() {
        let _ = snapshot(&target, &dir);
        prune(&dir);
    }
    atomic_write(&target, &bytes)?;
    Ok(true)
}

/// Apaga um backup do projeto.
#[tauri::command]
pub fn backup_delete(path: String, id: String) -> bool {
    let Some(name) = safe_id(&id) else {
        return false;
    };
    fs::remove_file(project_dir(Path::new(&path)).join(name)).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_is_safe() {
        assert_eq!(slug_for(Path::new("/tmp/Entrevista Ação.investigando")), "entrevista-a-o");
        assert_eq!(slug_for(Path::new("/tmp/---.json")), "projeto");
    }

    #[test]
    fn rejects_unsafe_ids() {
        assert!(safe_id("../x.json").is_none());
        assert!(safe_id("a/b.json").is_none());
        assert!(safe_id("x.txt").is_none());
        assert_eq!(safe_id("123.json").as_deref(), Some("123.json"));
    }

    #[test]
    fn formats_iso() {
        assert_eq!(iso_from_ms(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_from_ms(1_700_000_000_000), "2023-11-14T22:13:20Z");
    }
}
