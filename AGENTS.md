# DJ Music Manager

App de escritorio (Windows/macOS) para gestión de música de DJ: biblioteca, playlists/crates, metadata, duplicados y análisis de audio.

## Stack

- **Frontend**: Angular 20 + TypeScript + RxJS + PrimeNG (tema Aura, dark mode con clase `app-dark`) — en `frontend/`
- **Desktop/Backend**: Tauri 2 + Rust — en `src-tauri/`
- **DB**: SQLite (rusqlite bundled) + FTS5. Migraciones embebidas desde `database/migrations/` (se ejecutan por `PRAGMA user_version`)
- **Tags**: lofty (ID3, Vorbis Comments, MP4)

## Comandos (desde la raíz del proyecto)

- `npm run dev` — arranca la app en modo desarrollo (ng serve + cargo run)
- `npm run build` — genera instaladores (NSIS/MSI en Windows, DMG en Mac)
- `npm run tauri <cmd>` — cualquier comando del CLI de Tauri
- Verificación rápida: `cargo check` en `src-tauri/`, `npm run build` en `frontend/`

## Estructura

- `frontend/src/app/` — features: `library/`, futuros: `playlists/`, `folders/`, `duplicates/`, `analyzer/`, `settings/` (hoy placeholders en `shared/placeholder/`)
- `frontend/src/app/core/` — servicios (`LibraryService` envuelve `invoke`/eventos de Tauri) y modelos
- `src-tauri/src/` — módulos Rust: `commands/`, `database/`, `metadata/`, `scanner/`, `audio/` (pendiente), `duplicates/` (pendiente)
- `database/migrations/` — SQL versionado; agregar archivos nuevos al array `MIGRATIONS` en `src-tauri/src/database/mod.rs`

## Notas

- El CLI de Tauri debe invocarse desde la raíz (busca `src-tauri/` hacia abajo); el `package.json` raíz ya lo resuelve
- Cargo no está en PATH por defecto en esta máquina: anteponer `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`
- La DB vive en `%APPDATA%/com.djmusicmanager.app/library.db`
- Cuidado con el espacio en disco D: (los builds de Rust crecen varios GB)
