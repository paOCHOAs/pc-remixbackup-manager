mod audio;
mod commands;
mod database;
mod duplicates;
mod identification;
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

            // Rescan configured folders on startup in a background thread
            // so the main thread / webview is not blocked.
            let app_handle = app.handle().clone();
            let db_path = data_dir.join("library.db");
            std::thread::spawn(move || {
                if let Ok(mut conn) = database::open(&db_path) {
                    let _ = commands::library_folders::rescan_all(&mut conn, &app_handle);
                }
            });

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
            commands::library_folders::rescan_all_library_folders,
            commands::library_folders::clean_library,
            commands::library_folders::clear_library,
            commands::find_duplicates,
            commands::identify_track,
            commands::remove_duplicate,
            commands::remove_duplicates_except,
            commands::remove_track_and_file,
            commands::get_playable_path,
            commands::list_subfolders,
            commands::move_track_to_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
