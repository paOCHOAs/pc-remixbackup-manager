use crate::models::ScanResult;
use crate::scanner;
use crate::AppState;
use rusqlite::params;
use tauri::State;

#[derive(Debug, Clone, serde::Serialize)]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub enabled: bool,
    pub last_scanned: Option<String>,
}

#[tauri::command]
pub fn clean_library(state: State<'_, AppState>) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let paths: Vec<(i64, String)> = conn
        .prepare("SELECT id, path FROM tracks")
        .map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut removed = 0usize;
    for (id, path) in paths {
        if !std::path::Path::new(&path).exists() {
            conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn clear_library(state: State<'_, AppState>) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "DELETE FROM playlist_tracks;
         DELETE FROM tracks;
         VACUUM;",
    )
    .map_err(|e| e.to_string())?;
    Ok(count as usize)
}

fn row_to_folder(row: &rusqlite::Row) -> rusqlite::Result<LibraryFolder> {
    Ok(LibraryFolder {
        id: row.get("id")?,
        path: row.get("path")?,
        enabled: row.get::<_, i64>("enabled")? == 1,
        last_scanned: row.get("last_scanned")?,
    })
}

#[tauri::command]
pub fn get_library_folders(state: State<'_, AppState>) -> Result<Vec<LibraryFolder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT * FROM library_folders ORDER BY path")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_folder)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_library_folder(
    path: String,
    state: State<'_, AppState>,
) -> Result<LibraryFolder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO library_folders (path, enabled) VALUES (?1, 1)",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT * FROM library_folders WHERE id = ?1",
        params![id],
        row_to_folder,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_library_folder(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM library_folders WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_library_folder_enabled(
    id: i64,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE library_folders SET enabled = ?1 WHERE id = ?2",
        params![if enabled { 1 } else { 0 }, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn rescan_all(conn: &mut rusqlite::Connection, app: &tauri::AppHandle) -> Result<ScanResult, String> {
    let mut folders = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT path FROM library_folders WHERE enabled = 1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for r in rows {
            folders.push(r.map_err(|e| e.to_string())?);
        }
    }

    let mut total = ScanResult {
        added: 0,
        updated: 0,
        skipped: 0,
        errors: Vec::new(),
    };

    for path in folders {
        match scanner::scan_folder(conn, &path, app) {
            Ok(r) => {
                total.added += r.added;
                total.updated += r.updated;
                total.skipped += r.skipped;
                total.errors.extend(r.errors);
            }
            Err(e) => total.errors.push(format!("{}: {}", path, e)),
        }
        conn.execute(
            "UPDATE library_folders SET last_scanned = datetime('now') WHERE path = ?1",
            params![path],
        )
        .ok();
    }

    Ok(total)
}

#[tauri::command]
pub fn rescan_all_library_folders(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    rescan_all(&mut conn, &app)
}
