pub mod library_folders;

use crate::duplicates::{self, DuplicateGroup};
use crate::metadata::{write, MetadataUpdate};
use crate::models::{ScanResult, Track};
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
        file_size: row.get("file_size")?,
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
