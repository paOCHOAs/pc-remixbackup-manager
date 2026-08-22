use rusqlite::Connection;
use std::path::Path;

/// Migrations are embedded at compile time from `database/migrations/` (repo root).
/// Add new entries at the end; each runs once, tracked via PRAGMA user_version.
const MIGRATIONS: &[&str] = &[
    include_str!("../../../database/migrations/0001_init.sql"),
    include_str!("../../../database/migrations/0002_library_folders.sql"),
    include_str!("../../../database/migrations/0003_track_format.sql"),
];

pub fn open(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    run_migrations(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        conn.execute_batch(sql)?;
        conn.pragma_update(None, "user_version", (i + 1) as i64)?;
    }
    Ok(())
}
