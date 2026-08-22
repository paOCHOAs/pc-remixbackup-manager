use crate::commands::row_to_track;
use crate::models::Track;
use rusqlite::{params, Connection};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub enum DuplicateMode {
    Exact,
    Filename,
    DurationAndSize,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DuplicateGroup {
    pub key: String,
    pub tracks: Vec<Track>,
}

pub fn find(conn: &Connection, mode: &DuplicateMode) -> Result<Vec<DuplicateGroup>, String> {
    let sql = match mode {
        DuplicateMode::Exact => {
            "SELECT * FROM tracks
             WHERE LOWER(COALESCE(title, '')) || '|' || LOWER(COALESCE(artist, '')) IN (
                 SELECT LOWER(COALESCE(title, '')) || '|' || LOWER(COALESCE(artist, ''))
                 FROM tracks
                 WHERE title IS NOT NULL AND artist IS NOT NULL
                 GROUP BY LOWER(title), LOWER(artist)
                 HAVING COUNT(*) > 1
             )
             ORDER BY LOWER(COALESCE(title, '')), LOWER(COALESCE(artist, '')), path"
        }
        DuplicateMode::Filename => {
            "SELECT * FROM tracks
             WHERE LOWER(filename) IN (
                 SELECT LOWER(filename)
                 FROM tracks
                 GROUP BY LOWER(filename)
                 HAVING COUNT(*) > 1
             )
             ORDER BY LOWER(filename), path"
        }
        DuplicateMode::DurationAndSize => {
            "SELECT * FROM tracks
             WHERE duration_secs || '|' || file_size IN (
                 SELECT duration_secs || '|' || file_size
                 FROM tracks
                 WHERE duration_secs IS NOT NULL
                 GROUP BY duration_secs, file_size
                 HAVING COUNT(*) > 1
             )
             ORDER BY duration_secs, file_size, path"
        }
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_track)
        .map_err(|e| e.to_string())?;
    let mut tracks: Vec<Track> = Vec::new();
    for r in rows {
        tracks.push(r.map_err(|e| e.to_string())?);
    }

    let mut groups: Vec<DuplicateGroup> = Vec::new();
    let mut current_key = String::new();
    let mut current_tracks: Vec<Track> = Vec::new();

    for track in tracks {
        let key = match mode {
            DuplicateMode::Exact => format!(
                "{} - {}",
                track.artist.as_deref().unwrap_or("").to_lowercase(),
                track.title.as_deref().unwrap_or("").to_lowercase()
            ),
            DuplicateMode::Filename => track.filename.to_lowercase(),
            DuplicateMode::DurationAndSize => {
                format!("{:.3}s | {} bytes", track.duration_secs.unwrap_or(0.0), track.file_size)
            }
        };

        if key != current_key {
            if !current_tracks.is_empty() {
                groups.push(DuplicateGroup {
                    key: current_key,
                    tracks: current_tracks,
                });
            }
            current_key = key;
            current_tracks = Vec::new();
        }
        current_tracks.push(track);
    }

    if !current_tracks.is_empty() {
        groups.push(DuplicateGroup {
            key: current_key,
            tracks: current_tracks,
        });
    }

    Ok(groups)
}

pub fn remove_track(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
