mod audio;
mod commands;
mod database;
mod duplicates;
mod metadata;
mod models;
mod scanner;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = database::open(&data_dir.join("library.db"))?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            // Rescan configured folders on startup
            let _ = commands::library_folders::rescan_all_library_folders(
                app.handle().clone(),
                app.state::<AppState>(),
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_folder,
            commands::get_tracks,
            commands::get_track_count,
            commands::update_track_metadata,
            commands::update_tracks_metadata,
            commands::library_folders::get_library_folders,
            commands::library_folders::add_library_folder,
            commands::library_folders::remove_library_folder,
            commands::library_folders::set_library_folder_enabled,
            commands::library_folders::rescan_all_library_folders
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
