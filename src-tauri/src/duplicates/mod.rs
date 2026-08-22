use crate::commands::row_to_track;
use crate::models::Track;
use rusqlite::{params, Connection};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub enum DuplicateMode {
    Exact,
    NameAndArtist,
    Filename,
    DurationAndSize,
    ExactAndDuration,
    FilenameAndSize,
    SizeOnly,
}

fn strip_between(s: &str, open: char, close: char) -> String {
    let mut out = String::new();
    let mut depth = 0;
    for c in s.chars() {
        if c == open {
            depth += 1;
        } else if c == close {
            if depth > 0 {
                depth -= 1;
            }
            continue;
        }
        if depth == 0 {
            out.push(c);
        }
    }
    out
}

fn strip_leading_garbage(s: &str) -> &str {
    let mut s = s.trim_start();
    while let Some(c) = s.chars().next() {
        if c.is_alphabetic() {
            break;
        }
        s = &s[c.len_utf8()..];
        s = s.trim_start();
    }
    s
}

fn normalize_name(s: &str) -> String {
    let mut s = s.to_lowercase();
    s = strip_between(&s, '(', ')');
    s = strip_between(&s, '[', ']');
    s = s.replace("{", "").replace("}", "");
    s = strip_leading_garbage(&s).to_string();
    s = format!(" {} ", s);
    for (pat, rep) in [
        (" feat.", " "), (" feat", " "), (" ft.", " "), (" ft", " "),
        (" featuring", " "), (" &", " "), (" and", " "), (" y", " "),
        (" la ", " "), (" el ", " "), (" los ", " "), (" las ", " "),
        (" the ", " "), (" le ", " "), (" les ", " "),
        (" de ", " "), (" del ", " "), (" en ", " "),
        (" un ", " "), (" una ", " "),
        (" ora.", " "), (" ora ", " "),
        (" orq.", " "), (" orq ", " "),
        (" , ", " "), (",", ""), (";", ""), ("!", ""), ("?", ""),
    ] {
        s = s.replace(pat, rep);
    }
    s = s.chars()
        .filter(|c| c.is_alphabetic() || c.is_whitespace())
        .collect();
    s.split_whitespace()
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DuplicateGroup {
    pub key: String,
    pub tracks: Vec<Track>,
}

fn compute_key(track: &Track, mode: &DuplicateMode) -> String {
    match mode {
        DuplicateMode::Exact => format!(
            "{} - {}",
            track.artist.as_deref().unwrap_or("").to_lowercase(),
            track.title.as_deref().unwrap_or("").to_lowercase()
        ),
        DuplicateMode::NameAndArtist => format!(
            "{} - {}",
            normalize_name(track.artist.as_deref().unwrap_or("")),
            normalize_name(track.title.as_deref().unwrap_or(""))
        ),
        DuplicateMode::Filename => track.filename.to_lowercase(),
        DuplicateMode::DurationAndSize => {
            format!("{:.3}s | {} bytes", track.duration_secs.unwrap_or(0.0), track.file_size)
        }
        DuplicateMode::ExactAndDuration => format!(
            "{} - {} ({:.0}s)",
            track.artist.as_deref().unwrap_or("").to_lowercase(),
            track.title.as_deref().unwrap_or("").to_lowercase(),
            track.duration_secs.unwrap_or(0.0)
        ),
        DuplicateMode::FilenameAndSize => {
            format!("{} ({} bytes)", track.filename.to_lowercase(), track.file_size)
        }
        DuplicateMode::SizeOnly => format!("{} bytes", track.file_size),
    }
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
        DuplicateMode::NameAndArtist => {
            "SELECT * FROM tracks
             WHERE title IS NOT NULL AND artist IS NOT NULL
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
        DuplicateMode::ExactAndDuration => {
            "SELECT * FROM tracks
             WHERE LOWER(COALESCE(title, '')) || '|' || LOWER(COALESCE(artist, '')) || '|' || CAST(duration_secs AS INTEGER) IN (
                 SELECT LOWER(COALESCE(title, '')) || '|' || LOWER(COALESCE(artist, '')) || '|' || CAST(duration_secs AS INTEGER)
                 FROM tracks
                 WHERE title IS NOT NULL AND artist IS NOT NULL AND duration_secs IS NOT NULL
                 GROUP BY LOWER(title), LOWER(artist), CAST(duration_secs AS INTEGER)
                 HAVING COUNT(*) > 1
             )
             ORDER BY LOWER(COALESCE(title, '')), LOWER(COALESCE(artist, '')), duration_secs, path"
        }
        DuplicateMode::FilenameAndSize => {
            "SELECT * FROM tracks
             WHERE LOWER(filename) || '|' || file_size IN (
                 SELECT LOWER(filename) || '|' || file_size
                 FROM tracks
                 GROUP BY LOWER(filename), file_size
                 HAVING COUNT(*) > 1
             )
             ORDER BY LOWER(filename), file_size, path"
        }
        DuplicateMode::SizeOnly => {
            "SELECT * FROM tracks
             WHERE file_size IN (
                 SELECT file_size
                 FROM tracks
                 GROUP BY file_size
                 HAVING COUNT(*) > 1
             )
             ORDER BY file_size, path"
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

    tracks.sort_by(|a, b| compute_key(a, mode).cmp(&compute_key(b, mode)));

    let mut groups: Vec<DuplicateGroup> = Vec::new();
    let mut current_key = String::new();
    let mut current_tracks: Vec<Track> = Vec::new();

    for track in tracks {
        let key = compute_key(&track, mode);

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

    groups.retain(|g| g.tracks.len() > 1);

    Ok(groups)
}

pub fn remove_track(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
