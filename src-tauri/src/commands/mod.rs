pub mod library_folders;

use crate::duplicates::{self, DuplicateGroup};
use crate::identification;
use crate::metadata::{write, MetadataUpdate};
use crate::models::{BatchActionResult, DuplicateBatchItem, ScanResult, Track};
use crate::scanner;
use crate::AppState;
use rusqlite::{params, Connection};
use tauri::State;

/// Columns allowed in ORDER BY (never interpolate user input directly).
const SORTABLE_COLUMNS: &[&str] = &[
    "title",
    "artist",
    "album",
    "genre",
    "year",
    "duration_secs",
    "bpm",
    "initial_key",
    "bitrate_kbps",
    "file_size",
    "file_format",
    "date_added",
    "filename",
];

pub fn row_to_track(row: &rusqlite::Row) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get("id")?,
        path: row.get("path")?,
        filename: row.get("filename")?,
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get("album")?,
        genre: row.get("genre")?,
        year: row.get("year")?,
        duration_secs: row.get("duration_secs")?,
        bpm: row.get("bpm")?,
        initial_key: row.get("initial_key")?,
        bitrate_kbps: row.get("bitrate_kbps")?,
        sample_rate: row.get("sample_rate")?,
        file_format: row.get("file_format")?,
        file_size: row.get("file_size")?,
        moved: row.get("moved")?,
        date_added: row.get("date_added")?,
        date_modified: row.get("date_modified")?,
    })
}

fn build_fts_query(search: &str) -> String {
    search
        .split_whitespace()
        .map(|w| format!("\"{}\"*", w.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ")
}

fn order_clause(sort_field: Option<&str>, sort_desc: bool, searching: bool) -> String {
    match sort_field.filter(|f| SORTABLE_COLUMNS.contains(f)) {
        Some(col) => {
            let dir = if sort_desc { "DESC" } else { "ASC" };
            format!("ORDER BY t.{col} {dir} NULLS LAST, t.id")
        }
        None if searching => "ORDER BY rank".to_string(),
        None => "ORDER BY t.artist NULLS LAST, t.title, t.id".to_string(),
    }
}

#[tauri::command]
pub async fn scan_folder(
    folder: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    scanner::scan_folder(&mut conn, &folder, &app)
}

#[tauri::command]
pub fn get_tracks(
    search: Option<String>,
    sort_field: Option<String>,
    sort_desc: Option<bool>,
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<Track>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(100).clamp(1, 1000);
    let offset = offset.unwrap_or(0).max(0);
    let search = search.filter(|s| !s.trim().is_empty());
    let order =
        order_clause(sort_field.as_deref(), sort_desc.unwrap_or(false), search.is_some());

    let mut tracks = Vec::new();
    match search {
        Some(q) => {
            let sql = format!(
                "SELECT t.* FROM tracks t
                 JOIN tracks_fts f ON f.rowid = t.id
                 WHERE tracks_fts MATCH ?1
                 {order} LIMIT ?2 OFFSET ?3"
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![build_fts_query(&q), limit, offset], row_to_track)
                .map_err(|e| e.to_string())?;
            for r in rows {
                tracks.push(r.map_err(|e| e.to_string())?);
            }
        }
        None => {
            let sql = format!("SELECT t.* FROM tracks t {order} LIMIT ?1 OFFSET ?2");
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![limit, offset], row_to_track)
                .map_err(|e| e.to_string())?;
            for r in rows {
                tracks.push(r.map_err(|e| e.to_string())?);
            }
        }
    }
    Ok(tracks)
}

#[tauri::command]
pub fn get_track_count(search: Option<String>, state: State<'_, AppState>) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    match search.filter(|s| !s.trim().is_empty()) {
        Some(q) => conn
            .query_row(
                "SELECT COUNT(*) FROM tracks_fts WHERE tracks_fts MATCH ?1",
                params![build_fts_query(&q)],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string()),
        None => conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
            .map_err(|e| e.to_string()),
    }
}

fn path_by_id(conn: &Connection, id: i64) -> Result<String, String> {
    conn.query_row(
        "SELECT path FROM tracks WHERE id = ?1",
        params![id],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

fn refresh_db_row(conn: &Connection, id: i64, meta: &crate::metadata::AudioMetadata) -> Result<Track, String> {
    let modified = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    conn.execute(
        "UPDATE tracks SET
            title = ?2, artist = ?3, album = ?4, genre = ?5, year = ?6,
            bpm = ?7, initial_key = ?8, duration_secs = ?9, bitrate_kbps = ?10,
            sample_rate = ?11, date_modified = ?12
        WHERE id = ?1",
        params![
            id,
            meta.title,
            meta.artist,
            meta.album,
            meta.genre,
            meta.year,
            meta.bpm,
            meta.initial_key,
            meta.duration_secs,
            meta.bitrate_kbps,
            meta.sample_rate,
            crate::scanner::format_unix_timestamp(modified)
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT * FROM tracks WHERE id = ?1",
        params![id],
        row_to_track,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BatchUpdateResult {
    pub updated: Vec<Track>,
    pub errors: Vec<String>,
}

#[tauri::command]
pub fn update_track_metadata(
    id: i64,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    year: Option<i64>,
    bpm: Option<f64>,
    initial_key: Option<String>,
    state: State<'_, AppState>,
) -> Result<Track, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let path = path_by_id(&conn, id)?;
    let path = std::path::Path::new(&path);

    let update = MetadataUpdate {
        title,
        artist,
        album,
        genre,
        year,
        bpm,
        initial_key,
    };

    let meta = write(path, &update)?;
    refresh_db_row(&conn, id, &meta)
}

#[tauri::command]
pub fn update_tracks_metadata(
    ids: Vec<i64>,
    artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    year: Option<i64>,
    state: State<'_, AppState>,
) -> Result<BatchUpdateResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut updated = Vec::with_capacity(ids.len());
    let mut errors = Vec::new();

    for id in ids {
        let path = match path_by_id(&conn, id) {
            Ok(p) => p,
            Err(e) => {
                errors.push(format!("id {id}: {e}"));
                continue;
            }
        };

        let update = MetadataUpdate {
            title: None,
            artist: artist.clone(),
            album: album.clone(),
            genre: genre.clone(),
            year,
            bpm: None,
            initial_key: None,
        };

        match write(std::path::Path::new(&path), &update) {
            Ok(meta) => match refresh_db_row(&conn, id, &meta) {
                Ok(t) => updated.push(t),
                Err(e) => errors.push(format!("id {id}: {e}")),
            },
            Err(e) => errors.push(format!("{path}: {e}")),
        }
    }

    Ok(BatchUpdateResult { updated, errors })
}

#[tauri::command]
pub fn find_duplicates(
    mode: String,
    state: State<'_, AppState>,
) -> Result<Vec<DuplicateGroup>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mode = match mode.as_str() {
        "exact" => duplicates::DuplicateMode::Exact,
        "name_artist" => duplicates::DuplicateMode::NameAndArtist,
        "filename" => duplicates::DuplicateMode::Filename,
        "duration" => duplicates::DuplicateMode::DurationAndSize,
        "exact_and_duration" => duplicates::DuplicateMode::ExactAndDuration,
        "filename_and_size" => duplicates::DuplicateMode::FilenameAndSize,
        "size" => duplicates::DuplicateMode::SizeOnly,
        _ => duplicates::DuplicateMode::Exact,
    };
    duplicates::find(&conn, &mode)
}

#[tauri::command]
pub fn remove_duplicate(
    id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    duplicates::remove_track(&conn, id)
}

#[tauri::command]
pub fn remove_duplicates_except(
    keep: i64,
    ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("DELETE FROM tracks WHERE id = ?1 AND id != ?2")
        .map_err(|e| e.to_string())?;
    let mut removed = 0usize;
    for id in ids {
        if id == keep {
            continue;
        }
        removed += stmt.execute(params![id, keep]).map_err(|e| e.to_string())?;
    }
    Ok(removed)
}

#[tauri::command]
pub fn identify_track(
    id: i64,
    state: State<'_, AppState>,
) -> Result<Track, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    identification::identify(&conn, id)
}

#[tauri::command]
pub fn remove_track_and_file(
    id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let path: String = conn
        .query_row("SELECT path FROM tracks WHERE id = ?1", params![id], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    if std::path::Path::new(&path).exists() {
        trash::delete(&path).map_err(|e| e.to_string())?;
    }
    duplicates::remove_track(&conn, id)?;
    Ok(path)
}

fn needs_transcode(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let e = e.to_lowercase();
            e == "aif" || e == "aiff"
        })
        .unwrap_or(false)
}

fn path_hash(path: &std::path::Path) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    path.to_string_lossy().hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

#[tauri::command]
pub async fn get_playable_path(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let input = std::path::Path::new(&path);
        if !input.exists() {
            return Err("Archivo no encontrado".into());
        }
        if !needs_transcode(input) {
            return Ok(path);
        }

        let input_modified = input
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

        let cache_dir = std::env::temp_dir().join("djmm-playback-cache");
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        let output = cache_dir.join(format!("{}.wav", path_hash(input)));

        if let Ok(meta) = output.metadata() {
            if let Ok(out_modified) = meta.modified() {
                if out_modified >= input_modified {
                    return Ok(output.to_string_lossy().into_owned());
                }
            }
            let _ = std::fs::remove_file(&output);
        }

        let status = std::process::Command::new("ffmpeg")
            .args([
                "-y",
                "-loglevel",
                "error",
                "-i",
                &path,
                "-ar",
                "44100",
                "-sample_fmt",
                "s16",
                "-ac",
                "2",
                "-f",
                "wav",
            ])
            .arg(&output)
            .status()
            .map_err(|e| format!("No se pudo ejecutar ffmpeg: {e}"))?;

        if !status.success() {
            return Err("FFmpeg no pudo convertir el archivo".into());
        }

        Ok(output.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FolderNode {
    pub label: String,
    pub data: String,
    pub children: Vec<FolderNode>,
}

fn build_folder_node(path: &std::path::Path) -> Result<FolderNode, String> {
    let label = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Carpeta")
        .to_string();
    let data = path.to_string_lossy().to_string();
    let mut entries: Vec<_> = std::fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();
    entries.sort_by(|a, b| {
        a.file_name()
            .to_string_lossy()
            .cmp(&b.file_name().to_string_lossy())
    });
    let mut children = Vec::with_capacity(entries.len());
    for e in entries {
        children.push(build_folder_node(&e.path())?);
    }
    Ok(FolderNode { label, data, children })
}

#[tauri::command]
pub fn list_subfolders(root: String) -> Result<FolderNode, String> {
    let path = std::path::Path::new(&root);
    if !path.is_dir() {
        return Err("La ruta no es una carpeta".into());
    }
    build_folder_node(path)
}

#[tauri::command]
pub fn move_track_to_folder(
    id: i64,
    folder: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let (old_path, filename, moved): (String, String, bool) = conn
        .query_row(
            "SELECT path, filename, moved FROM tracks WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    if moved {
        return Err("El track ya fue movido anteriormente".into());
    }
    let old = std::path::Path::new(&old_path);
    let new_path = std::path::Path::new(&folder).join(&filename);
    let new_path_str = new_path.to_string_lossy().to_string();
    if new_path.exists() {
        return Err("Ya existe un archivo con ese nombre en la carpeta destino".into());
    }
    if !old.exists() {
        return Err("El archivo original no existe".into());
    }
    if std::fs::rename(&old, &new_path).is_err() {
        std::fs::copy(&old, &new_path)
            .map_err(|e| format!("No se pudo copiar el archivo: {e}"))?;
        std::fs::remove_file(&old)
            .map_err(|e| format!("Copiado, pero no se pudo borrar el original: {e}"))?;
    }
    let modified = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    conn.execute(
        "UPDATE tracks SET path = ?1, filename = ?2, date_modified = ?3, moved = 1 WHERE id = ?4",
        params![
            new_path_str,
            filename,
            crate::scanner::format_unix_timestamp(modified),
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(new_path_str)
}

#[tauri::command]
pub fn keep_best_batch(
    items: Vec<DuplicateBatchItem>,
    state: State<'_, AppState>,
) -> Result<BatchActionResult, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut affected = 0usize;
    let mut freed_bytes: i64 = 0;
    let mut errors = Vec::new();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut size_stmt = tx
        .prepare("SELECT file_size FROM tracks WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut delete_stmt = tx
        .prepare("DELETE FROM tracks WHERE id = ?1 AND id != ?2")
        .map_err(|e| e.to_string())?;

    for item in items {
        for id in &item.remove_ids {
            if *id == item.keep_id {
                continue;
            }
            if let Ok(size) = size_stmt.query_row(params![id], |r| r.get::<_, i64>(0)) {
                freed_bytes += size;
            }
            match delete_stmt.execute(params![id, item.keep_id]) {
                Ok(n) => affected += n,
                Err(e) => errors.push(format!("id {}: {}", id, e)),
            }
        }
    }

    drop(size_stmt);
    drop(delete_stmt);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(BatchActionResult {
        affected,
        freed_bytes,
        errors,
    })
}

#[tauri::command]
pub fn delete_duplicates_batch(
    items: Vec<DuplicateBatchItem>,
    delete_file: bool,
    state: State<'_, AppState>,
) -> Result<BatchActionResult, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut affected = 0usize;
    let mut freed_bytes: i64 = 0;
    let mut errors = Vec::new();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut path_stmt = tx
        .prepare("SELECT path, file_size FROM tracks WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut delete_stmt = tx
        .prepare("DELETE FROM tracks WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    for item in items {
        for id in &item.remove_ids {
            if *id == item.keep_id {
                continue;
            }
            let (path, size): (String, i64) = match path_stmt.query_row(params![id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            }) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if delete_file && std::path::Path::new(&path).exists() {
                if let Err(e) = trash::delete(&path) {
                    errors.push(format!("{}: {}", path, e));
                    continue;
                }
                freed_bytes += size;
            }
            match delete_stmt.execute(params![id]) {
                Ok(n) => affected += n,
                Err(e) => errors.push(format!("id {}: {}", id, e)),
            }
        }
    }

    drop(path_stmt);
    drop(delete_stmt);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(BatchActionResult {
        affected,
        freed_bytes,
        errors,
    })
}

#[tauri::command]
pub fn move_duplicates_batch(
    items: Vec<DuplicateBatchItem>,
    folder: String,
    state: State<'_, AppState>,
) -> Result<BatchActionResult, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut affected = 0usize;
    let mut freed_bytes: i64 = 0;
    let mut errors = Vec::new();

    let folder = std::path::Path::new(&folder);
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut path_stmt = tx
        .prepare("SELECT path, filename, file_size, moved FROM tracks WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut update_stmt = tx
        .prepare("UPDATE tracks SET path = ?1, filename = ?2, date_modified = ?3, moved = 1 WHERE id = ?4")
        .map_err(|e| e.to_string())?;

    for item in items {
        for id in &item.remove_ids {
            if *id == item.keep_id {
                continue;
            }
            let (old_path, filename, size, moved): (String, String, i64, bool) = match path_stmt
                .query_row(params![id], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, bool>(3)?,
                    ))
                }) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if moved {
                errors.push(format!("{}: ya fue movido anteriormente", filename));
                continue;
            }
            let old = std::path::Path::new(&old_path);
            let new_path = folder.join(&filename);
            let new_path_str = new_path.to_string_lossy().to_string();
            if new_path.exists() {
                errors.push(format!("{}: ya existe en destino", filename));
                continue;
            }
            if !old.exists() {
                errors.push(format!("{}: archivo original no encontrado", filename));
                continue;
            }
            if std::fs::rename(&old, &new_path).is_err() {
                if let Err(e) = std::fs::copy(&old, &new_path) {
                    errors.push(format!("{}: no se pudo copiar: {}", filename, e));
                    continue;
                }
                if let Err(e) = std::fs::remove_file(&old) {
                    errors.push(format!("{}: copiado, pero no se pudo borrar: {}", filename, e));
                    continue;
                }
            }
            let modified = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            match update_stmt.execute(params![
                new_path_str,
                filename,
                crate::scanner::format_unix_timestamp(modified),
                id
            ]) {
                Ok(n) => {
                    affected += n;
                    freed_bytes += size;
                }
                Err(e) => errors.push(format!("id {}: {}", id, e)),
            }
        }
    }

    drop(path_stmt);
    drop(update_stmt);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(BatchActionResult {
        affected,
        freed_bytes,
        errors,
    })
}

#[tauri::command]
pub fn create_folder(
    parent: String,
    name: String,
) -> Result<String, String> {
    let parent = std::path::Path::new(&parent);
    let new_path = parent.join(&name.trim());
    if new_path.exists() {
        return Err("Ya existe una carpeta con ese nombre".into());
    }
    std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}
