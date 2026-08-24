use crate::metadata;
use crate::models::{ScanProgress, ScanResult};
use rusqlite::{params, Connection};
use std::path::Path;
use tauri::Emitter;
use walkdir::WalkDir;

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "aiff", "aif", "m4a", "mp4", "ogg", "opus", "wma",
];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn scan_folder(
    conn: &mut Connection,
    folder: &str,
    app: &tauri::AppHandle,
) -> Result<ScanResult, String> {
    let files: Vec<_> = WalkDir::new(folder)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && is_audio_file(e.path()))
        .map(|e| e.into_path())
        .collect();

    let total = files.len();
    let mut result = ScanResult {
        added: 0,
        updated: 0,
        skipped: 0,
        missing: 0,
        errors: Vec::new(),
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for (i, path) in files.iter().enumerate() {
        if i % 25 == 0 || i + 1 == total {
            let _ = app.emit(
                "scan:progress",
                ScanProgress {
                    current: i + 1,
                    total,
                    current_file: path.display().to_string(),
                },
            );
        }

        match index_file(&tx, path) {
            Ok(IndexOutcome::Added) => result.added += 1,
            Ok(IndexOutcome::Updated) => result.updated += 1,
            Ok(IndexOutcome::Skipped) => result.skipped += 1,
            Err(e) => result.errors.push(format!("{}: {}", path.display(), e)),
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

enum IndexOutcome {
    Added,
    Updated,
    Skipped,
}

fn index_file(conn: &Connection, path: &Path) -> Result<IndexOutcome, String> {
    let path_str = path.display().to_string();
    let fs_meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let file_size = fs_meta.len() as i64;
    let modified = fs_meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64);

    let existing: Option<(i64, Option<i64>)> = conn
        .query_row(
            "SELECT id, CAST(strftime('%s', date_modified) AS INTEGER) FROM tracks WHERE path = ?1",
            params![path_str],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    if let Some((_, Some(db_mtime))) = existing {
        if Some(db_mtime) == modified {
            return Ok(IndexOutcome::Skipped);
        }
    }

    let meta = metadata::read(path)?;

    let filename = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();
    let file_format = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    let modified_str = modified.map(format_unix_timestamp);

    conn.execute(
        r#"
        INSERT INTO tracks (path, filename, title, artist, album, genre, year,
            duration_secs, bpm, initial_key, bitrate_kbps, sample_rate, file_size, date_modified, file_format)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        ON CONFLICT(path) DO UPDATE SET
            filename = excluded.filename,
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            genre = excluded.genre,
            year = excluded.year,
            duration_secs = excluded.duration_secs,
            bpm = excluded.bpm,
            initial_key = excluded.initial_key,
            bitrate_kbps = excluded.bitrate_kbps,
            sample_rate = excluded.sample_rate,
            file_size = excluded.file_size,
            date_modified = excluded.date_modified,
            file_format = excluded.file_format,
            moved = 0
        "#,
        params![
            path_str,
            filename,
            meta.title,
            meta.artist,
            meta.album,
            meta.genre,
            meta.year,
            meta.duration_secs,
            meta.bpm,
            meta.initial_key,
            meta.bitrate_kbps,
            meta.sample_rate,
            file_size,
            modified_str,
            file_format
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(if existing.is_some() {
        IndexOutcome::Updated
    } else {
        IndexOutcome::Added
    })
}

pub fn validate_folder_tracks(conn: &mut Connection, folder: &str) -> Result<usize, String> {
    let folder_path = Path::new(folder);
    let mut prefix = folder.to_string();
    if !prefix.ends_with(std::path::MAIN_SEPARATOR) {
        prefix.push(std::path::MAIN_SEPARATOR);
    }
    let pattern = format!("{}%", prefix);

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut stmt = tx
        .prepare("SELECT id, path, moved FROM tracks WHERE path LIKE ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pattern], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut missing = 0usize;
    for row in rows {
        let (id, path, was_moved) = row.map_err(|e| e.to_string())?;
        let track_path = Path::new(&path);
        // Verificación final por componentes para evitar coincidencias de borde.
        if track_path.starts_with(folder_path) {
            let exists = track_path.exists();
            let currently_moved = was_moved != 0;
            if exists && currently_moved {
                tx.execute("UPDATE tracks SET moved = 0 WHERE id = ?1", params![id])
                    .map_err(|e| e.to_string())?;
            } else if !exists && !currently_moved {
                tx.execute("UPDATE tracks SET moved = 1 WHERE id = ?1", params![id])
                    .map_err(|e| e.to_string())?;
                missing += 1;
            }
        }
    }
    drop(stmt);
    tx.commit().map_err(|e| e.to_string())?;
    Ok(missing)
}

/// Formats a unix timestamp as "YYYY-MM-DD HH:MM:SS" (UTC) without external crates.
pub fn format_unix_timestamp(unix_secs: i64) -> String {
    let days = unix_secs.div_euclid(86_400);
    let secs_of_day = unix_secs.rem_euclid(86_400);
    let (h, m, s) = (secs_of_day / 3600, (secs_of_day % 3600) / 60, secs_of_day % 60);

    // civil_from_days algorithm (Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mth = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mth <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", y, mth, d, h, m, s)
}
