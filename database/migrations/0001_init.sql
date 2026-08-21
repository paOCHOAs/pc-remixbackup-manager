CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    title TEXT,
    artist TEXT,
    album TEXT,
    genre TEXT,
    year INTEGER,
    duration_secs REAL,
    bpm REAL,
    initial_key TEXT,
    bitrate_kbps INTEGER,
    sample_rate INTEGER,
    file_size INTEGER NOT NULL DEFAULT 0,
    date_added TEXT NOT NULL DEFAULT (datetime('now')),
    date_modified TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
    title, artist, album, genre, filename,
    content='tracks', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
    INSERT INTO tracks_fts(rowid, title, artist, album, genre, filename)
    VALUES (new.id, new.title, new.artist, new.album, new.genre, new.filename);
END;

CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
    INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre, filename)
    VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre, old.filename);
END;

CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
    INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre, filename)
    VALUES ('delete', old.id, old.title, old.artist, old.album, old.genre, old.filename);
    INSERT INTO tracks_fts(rowid, title, artist, album, genre, filename)
    VALUES (new.id, new.title, new.artist, new.album, new.genre, new.filename);
END;

CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_bpm ON tracks(bpm);
CREATE INDEX IF NOT EXISTS idx_tracks_key ON tracks(initial_key);
