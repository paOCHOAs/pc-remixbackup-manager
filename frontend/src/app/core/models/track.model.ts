export interface Track {
  id: number;
  path: string;
  filename: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  year: number | null;
  duration_secs: number | null;
  bpm: number | null;
  initial_key: string | null;
  bitrate_kbps: number | null;
  sample_rate: number | null;
  file_format: string | null;
  file_size: number;
  moved: boolean;
  date_added: string;
  date_modified: string | null;
}

export interface ScanResult {
  added: number;
  updated: number;
  skipped: number;
  missing: number;
  errors: string[];
}

export interface ScanProgress {
  current: number;
  total: number;
  current_file: string;
}
