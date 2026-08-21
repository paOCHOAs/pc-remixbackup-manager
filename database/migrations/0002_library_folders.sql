CREATE TABLE IF NOT EXISTS library_folders (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_scanned TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
