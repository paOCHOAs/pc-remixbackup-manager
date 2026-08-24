use std::io::{BufWriter, Write};
use std::path::Path;

pub fn append<P: AsRef<Path>>(log_dir: P, module: &str, message: &str) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let formatted = crate::scanner::format_unix_timestamp(now);
    let (date, time) = formatted.split_once(' ').unwrap_or((&formatted, ""));

    let dir = log_dir.as_ref().join(module);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = dir.join(format!("{}.log", date));
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;

    let mut writer = BufWriter::new(file);
    writeln!(writer, "[{}] {}", time, message).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}
