import { Injectable, NgZone } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Observable } from "rxjs";
import { LibraryFolder } from "../models/library-folder.model";
import { ScanProgress, ScanResult, Track } from "../models/track.model";

export interface BatchUpdateResult {
  updated: Track[];
  errors: string[];
}

export interface TagUpdate {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  year?: number | null;
  bpm?: number | null;
  initialKey?: string | null;
}

@Injectable({ providedIn: "root" })
export class LibraryService {
  constructor(private zone: NgZone) {}

  scanFolder(folder: string): Promise<ScanResult> {
    return invoke<ScanResult>("scan_folder", { folder });
  }

  getTracks(opts: {
    search?: string;
    sortField?: string;
    sortDesc?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Track[]> {
    return invoke<Track[]>("get_tracks", {
      search: opts.search || null,
      sortField: opts.sortField || null,
      sortDesc: opts.sortDesc ?? null,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
    });
  }

  getTrackCount(search?: string): Promise<number> {
    return invoke<number>("get_track_count", { search: search || null });
  }

  updateTrack(id: number, update: TagUpdate): Promise<Track> {
    return invoke<Track>("update_track_metadata", {
      id,
      ...this.toRustUpdate(update),
    });
  }

  updateTracks(ids: number[], update: TagUpdate): Promise<BatchUpdateResult> {
    return invoke<BatchUpdateResult>("update_tracks_metadata", {
      ids,
      artist: update.artist ?? null,
      album: update.album ?? null,
      genre: update.genre ?? null,
      year: update.year ?? null,
    });
  }

  getLibraryFolders(): Promise<LibraryFolder[]> {
    return invoke<LibraryFolder[]>("get_library_folders");
  }

  addLibraryFolder(path: string): Promise<LibraryFolder> {
    return invoke<LibraryFolder>("add_library_folder", { path });
  }

  removeLibraryFolder(id: number): Promise<void> {
    return invoke<void>("remove_library_folder", { id });
  }

  setLibraryFolderEnabled(id: number, enabled: boolean): Promise<void> {
    return invoke<void>("set_library_folder_enabled", { id, enabled });
  }

  rescanAllLibraryFolders(): Promise<ScanResult> {
    return invoke<ScanResult>("rescan_all_library_folders");
  }

  scanProgress$(): Observable<ScanProgress> {
    return new Observable<ScanProgress>((subscriber) => {
      let unlisten: UnlistenFn | undefined;
      listen<ScanProgress>("scan:progress", (event) => {
        this.zone.run(() => subscriber.next(event.payload));
      }).then((fn) => (unlisten = fn));
      return () => unlisten?.();
    });
  }

  private toRustUpdate(update: TagUpdate) {
    return {
      title: update.title ?? null,
      artist: update.artist ?? null,
      album: update.album ?? null,
      genre: update.genre ?? null,
      year: update.year ?? null,
      bpm: update.bpm ?? null,
      initialKey: update.initialKey ?? null,
    };
  }
}
