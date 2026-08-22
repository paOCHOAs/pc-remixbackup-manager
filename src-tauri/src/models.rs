use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub path: String,
    pub filename: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub duration_secs: Option<f64>,
    pub bpm: Option<f64>,
    pub initial_key: Option<String>,
    pub bitrate_kbps: Option<i64>,
    pub sample_rate: Option<i64>,
    pub file_format: Option<String>,
    pub file_size: i64,
    pub moved: bool,
    pub date_added: String,
    pub date_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub added: usize,
    pub updated: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateBatchItem {
    pub keep_id: i64,
    pub remove_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchActionResult {
    pub affected: usize,
    pub freed_bytes: i64,
    pub errors: Vec<String>,
}
