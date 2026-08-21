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

#[tauri::command]
pub fn rescan_all_library_folders(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    let mut folders = Vec::new();
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT path FROM library_folders WHERE enabled = 1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for r in rows {
            folders.push(r.map_err(|e| e.to_string())?);
        }
    } // conn released here

    let mut total = ScanResult {
        added: 0,
        updated: 0,
        skipped: 0,
        errors: Vec::new(),
    };

    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    for path in folders {
        match scanner::scan_folder(&mut conn, &path, &app) {
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
