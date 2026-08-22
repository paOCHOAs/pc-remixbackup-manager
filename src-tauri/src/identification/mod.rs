//! Track identification via MusicBrainz to fill missing genre/year metadata.

use crate::commands::row_to_track;
use crate::metadata::{write, MetadataUpdate};
use crate::models::Track;
use crate::scanner::format_unix_timestamp;
use rusqlite::{params, Connection};
use serde::{de::DeserializeOwned, Deserialize};
use std::time::{Duration, SystemTime};

const USER_AGENT: &str = "DJMusicManager/0.1.0";
const BASE_URL: &str = "https://musicbrainz.org/ws/2";
const RATE_LIMIT_MS: u64 = 1200;

#[derive(Debug, Clone, Default)]
pub struct IdentifyResult {
    pub year: Option<i64>,
    pub genre: Option<String>,
}

#[derive(Deserialize)]
struct SearchResponse {
    recordings: Vec<Recording>,
}

#[derive(Deserialize)]
struct Recording {
    id: String,
    #[serde(rename = "first-release-date")]
    first_release_date: Option<String>,
    #[serde(default)]
    releases: Vec<Release>,
    #[serde(default)]
    tags: Vec<Tag>,
}

#[derive(Deserialize)]
struct Release {
    date: Option<String>,
    #[serde(rename = "release-group")]
    release_group: Option<ReleaseGroup>,
}

#[derive(Deserialize)]
struct ReleaseGroup {
    #[serde(rename = "first-release-date")]
    first_release_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Tag {
    name: String,
    #[serde(default)]
    count: Option<i64>,
}

#[derive(Deserialize)]
struct LookupResponse {
    #[serde(default)]
    genres: Vec<GenreName>,
    #[serde(default)]
    tags: Vec<Tag>,
}

#[derive(Deserialize)]
struct GenreName {
    name: String,
}

fn musicbrainz_get<T: DeserializeOwned>(path: &str) -> Result<T, String> {
    let url = format!("{}{}", BASE_URL, path);
    ureq::get(&url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/json")
        .call()
        .map_err(|e| format!("MusicBrainz request failed: {}", e))?
        .body_mut()
        .read_json::<T>()
        .map_err(|e| e.to_string())
}

fn parse_year(date: &str) -> Option<i64> {
    date.split('-').next()?.parse::<i64>().ok()
}

fn extract_year(release: &Release) -> Option<i64> {
    if let Some(d) = &release.date {
        return parse_year(d);
    }
    if let Some(rg) = &release.release_group {
        if let Some(d) = &rg.first_release_date {
            return parse_year(d);
        }
    }
    None
}

fn build_search_query(title: &str, artist: &str) -> String {
    let title = title.replace('"', "");
    let artist = artist.replace('"', "");
    if artist.trim().is_empty() {
        format!(r#"recording:"{}""#, title)
    } else {
        format!(r#"recording:"{}" AND artist:"{}""#, title, artist)
    }
}

fn search(title: &str, artist: &str) -> Result<(String, Option<i64>, Vec<Tag>), String> {
    let query = build_search_query(title, artist);
    let path = format!(
        "/recording/?query={}&fmt=json&limit=1",
        urlencoding::encode(&query)
    );
    let search: SearchResponse = musicbrainz_get(&path)?;

    let recording = search
        .recordings
        .into_iter()
        .next()
        .ok_or("No se encontró el track en MusicBrainz")?;

    let year = recording
        .first_release_date
        .as_deref()
        .and_then(parse_year)
        .or_else(|| recording.releases.iter().filter_map(extract_year).min());

    Ok((recording.id, year, recording.tags))
}

fn lookup_genres_and_tags(mbid: &str) -> Result<(Vec<String>, Vec<Tag>), String> {
    std::thread::sleep(Duration::from_millis(RATE_LIMIT_MS));
    let path = format!("/recording/{}/?inc=genres+tags&fmt=json", mbid);
    let lookup: LookupResponse = musicbrainz_get(&path)?;
    let genres = lookup.genres.into_iter().map(|g| g.name).collect();
    Ok((genres, lookup.tags))
}

fn pick_genre(genres: &[String], tags: &[Tag]) -> Option<String> {
    if !genres.is_empty() {
        return Some(genres[0].clone());
    }
    // Fallback to folksonomy tags sorted by popularity.
    let mut tags: Vec<&Tag> = tags.iter().collect();
    tags.sort_by(|a, b| b.count.unwrap_or(0).cmp(&a.count.unwrap_or(0)));
    tags.into_iter().map(|t| t.name.clone()).next()
}

pub fn identify(conn: &Connection, id: i64) -> Result<Track, String> {
    let track = conn
        .query_row("SELECT * FROM tracks WHERE id = ?1", params![id], row_to_track)
        .map_err(|e| e.to_string())?;

    let title = track
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| track.filename.clone());
    let artist = track.artist.clone().unwrap_or_default();

    let (mbid, year, search_tags) = search(&title, &artist)
        .or_else(|_| search(&title, ""))?;
    let (genres, mut lookup_tags) = lookup_genres_and_tags(&mbid)?;
    let mut tags = search_tags;
    tags.append(&mut lookup_tags);
    let genre = pick_genre(&genres, &tags);

    let result = IdentifyResult { year, genre };
    if result.year.is_none() && result.genre.is_none() {
        return Err("MusicBrainz no devolvió género ni año".to_string());
    }

    let path = std::path::Path::new(&track.path);
    let update = MetadataUpdate {
        title: None,
        artist: None,
        album: None,
        genre: result.genre,
        year: result.year,
        bpm: None,
        initial_key: None,
    };
    let meta = write(path, &update)?;

    let modified = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    conn.execute(
        "UPDATE tracks SET genre = ?2, year = ?3, date_modified = ?4 WHERE id = ?1",
        params![
            id,
            meta.genre,
            meta.year,
            format_unix_timestamp(modified)
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row("SELECT * FROM tracks WHERE id = ?1", params![id], row_to_track)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_known_track() {
        // Simple query to verify MusicBrainz connectivity and query syntax.
        let result = search("Yesterday", "The Beatles");
        eprintln!("search result: {:?}", result);
        assert!(result.is_ok(), "search failed: {:?}", result);
        let (mbid, year, _tags) = result.unwrap();
        assert!(!mbid.is_empty());
        eprintln!("mbid={mbid} year={year:?}");

        let (genres, _tags) = lookup_genres_and_tags(&mbid).unwrap();
        eprintln!("lookup genres: {:?}", genres);
    }
}
