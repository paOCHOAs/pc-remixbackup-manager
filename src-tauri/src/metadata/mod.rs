use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey, Tag};
use std::path::Path;

// Suppress false-positive unused import warnings: WriteOptions/Accessor are used via method calls.

#[derive(Debug, Default, Clone)]
pub struct AudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub bpm: Option<f64>,
    pub initial_key: Option<String>,
    pub duration_secs: f64,
    pub bitrate_kbps: Option<i64>,
    pub sample_rate: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct MetadataUpdate {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub genre: Option<String>,
    pub year: Option<i64>,
    pub bpm: Option<f64>,
    pub initial_key: Option<String>,
}

impl MetadataUpdate {
    fn has_changes(&self) -> bool {
        self.title.is_some()
            || self.artist.is_some()
            || self.album.is_some()
            || self.genre.is_some()
            || self.year.is_some()
            || self.bpm.is_some()
            || self.initial_key.is_some()
    }

    fn empty_means_none(&self) -> Self {
        MetadataUpdate {
            title: self.title.clone().filter(|s| !s.is_empty()),
            artist: self.artist.clone().filter(|s| !s.is_empty()),
            album: self.album.clone().filter(|s| !s.is_empty()),
            genre: self.genre.clone().filter(|s| !s.is_empty()),
            year: self.year,
            bpm: self.bpm,
            initial_key: self.initial_key.clone().filter(|s| !s.is_empty()),
        }
    }
}

pub fn read(path: &Path) -> Result<AudioMetadata, String> {
    let tagged = Probe::open(path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let props = tagged.properties();
    let mut meta = AudioMetadata {
        duration_secs: props.duration().as_secs_f64(),
        bitrate_kbps: props.audio_bitrate().map(|b| b as i64),
        sample_rate: props.sample_rate().map(|s| s as i64),
        ..Default::default()
    };

    if let Some(t) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
        meta.title = t.title().map(|s| s.to_string());
        meta.artist = t.artist().map(|s| s.to_string());
        meta.album = t.album().map(|s| s.to_string());
        meta.genre = t.genre().map(|s| s.to_string());
        meta.year = t
            .get_string(ItemKey::Year)
            .or_else(|| t.get_string(ItemKey::RecordingDate))
            .and_then(|s| s.get(..4))
            .and_then(|s| s.parse::<i64>().ok());
        meta.bpm = t
            .get_string(ItemKey::Bpm)
            .and_then(|s| s.parse::<f64>().ok());
        meta.initial_key = t.get_string(ItemKey::InitialKey).map(|s| s.to_string());
    }

    Ok(meta)
}

pub fn write(path: &Path, update: &MetadataUpdate) -> Result<AudioMetadata, String> {
    let update = update.empty_means_none();
    if !update.has_changes() {
        return read(path);
    }

    let mut tagged = Probe::open(path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    if tagged.primary_tag().is_none() {
        let tag_type = tagged.primary_tag_type();
        tagged.insert_tag(Tag::new(tag_type));
    }

    let Some(tag) = tagged.primary_tag_mut() else {
        return Err("Could not get or create tag".to_string());
    };

    set_text(tag, ItemKey::TrackTitle, &update.title);
    set_text(tag, ItemKey::TrackArtist, &update.artist);
    set_text(tag, ItemKey::AlbumTitle, &update.album);
    set_text(tag, ItemKey::Genre, &update.genre);
    set_text(tag, ItemKey::InitialKey, &update.initial_key);

    if let Some(y) = update.year {
        tag.insert_text(ItemKey::Year, y.to_string());
    } else {
        tag.remove_key(ItemKey::Year);
    }

    if let Some(b) = update.bpm {
        tag.insert_text(ItemKey::Bpm, format!("{:.2}", b));
    } else {
        tag.remove_key(ItemKey::Bpm);
    }

    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    tagged
        .save_to(&mut file, WriteOptions::default())
        .map_err(|e| e.to_string())?;

    read(path)
}

fn set_text(tag: &mut Tag, key: ItemKey, value: &Option<String>) {
    if let Some(v) = value {
        tag.insert_text(key, v.clone());
    } else {
        tag.remove_key(key);
    }
}
