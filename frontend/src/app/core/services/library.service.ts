import { Injectable, NgZone, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { TreeNode } from "primeng/api";
import { Observable } from "rxjs";
import { DuplicateGroup } from "../models/duplicate-group.model";
import { LibraryFolder } from "../models/library-folder.model";
import { Playlist } from "../models/playlist.model";
import { ScanProgress, ScanResult, Track } from "../models/track.model";

export interface BatchUpdateResult {
  updated: Track[];
  errors: string[];
}

export interface DuplicateBatchItem {
  keep_id: number;
  remove_ids: number[];
}

export interface BatchActionResult {
  affected: number;
  freed_bytes: number;
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

  rescanLibraryFolder(id: number): Promise<ScanResult> {
    return invoke<ScanResult>("rescan_library_folder", { id });
  }

  cleanLibrary(): Promise<number> {
    return invoke<number>("clean_library");
  }

  clearLibrary(): Promise<number> {
    return invoke<number>("clear_library");
  }

  log(module: string, message: string): Promise<void> {
    return invoke<void>("log_event", { module, message });
  }

  createPlaylist(name: string): Promise<Playlist> {
    return invoke<Playlist>("create_playlist", { name });
  }

  getPlaylists(): Promise<Playlist[]> {
    return invoke<Playlist[]>("get_playlists");
  }

  deletePlaylist(id: number): Promise<void> {
    return invoke<void>("delete_playlist", { id });
  }

  addTrackToPlaylist(playlistId: number, trackId: number): Promise<void> {
    return invoke<void>("add_track_to_playlist", { playlistId, trackId });
  }

  removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
    return invoke<void>("remove_track_from_playlist", { playlistId, trackId });
  }

  getPlaylistTracks(playlistId: number): Promise<Track[]> {
    return invoke<Track[]>("get_playlist_tracks", { playlistId });
  }

  findDuplicates(
    mode:
      | "exact"
      | "name_artist"
      | "filename"
      | "duration"
      | "exact_and_duration"
      | "filename_and_size"
      | "size",
  ): Promise<DuplicateGroup[]> {
    return invoke<DuplicateGroup[]>("find_duplicates", { mode });
  }

  removeDuplicate(id: number): Promise<void> {
    return invoke<void>("remove_duplicate", { id });
  }

  removeTrackAndFile(id: number): Promise<string> {
    return invoke<string>("remove_track_and_file", { id });
  }

  listSubfolders(root: string): Promise<{ label: string; data: string; children: any[] }> {
    return invoke<{ label: string; data: string; children: any[] }>("list_subfolders", { root });
  }

  createFolder(parent: string, name: string): Promise<string> {
    return invoke<string>("create_folder", { parent, name });
  }

  moveTrackToFolder(id: number, folder: string): Promise<string> {
    return invoke<string>("move_track_to_folder", { id, folder });
  }

  removeDuplicatesExcept(keep: number, ids: number[]): Promise<number> {
    return invoke<number>("remove_duplicates_except", { keep, ids });
  }

  identifyTrack(id: number): Promise<Track> {
    return invoke<Track>("identify_track", { id });
  }

  keepBestBatch(items: DuplicateBatchItem[]): Promise<BatchActionResult> {
    return invoke<BatchActionResult>("keep_best_batch", { items });
  }

  deleteDuplicatesBatch(
    items: DuplicateBatchItem[],
    delete_file: boolean,
  ): Promise<BatchActionResult> {
    return invoke<BatchActionResult>("delete_duplicates_batch", { items, delete_file });
  }

  moveDuplicatesBatch(items: DuplicateBatchItem[], folder: string): Promise<BatchActionResult> {
    return invoke<BatchActionResult>("move_duplicates_batch", { items, folder });
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

  moveRoot = signal<string | null>(null);
  folderTree = signal<TreeNode[]>([]);
  selectedFolder = signal<TreeNode | null>(null);
  loadingFolders = signal(false);
  newFolderName = signal("");
  creatingFolder = signal(false);

  async loadFolderRoot(): Promise<void> {
    const root = await open({ directory: true, multiple: false });
    if (!root || Array.isArray(root)) return;
    this.loadingFolders.set(true);
    try {
      const node = await this.listSubfolders(root as string);
      this.moveRoot.set(root as string);
      this.folderTree.set([node as TreeNode]);
      this.selectedFolder.set(node as TreeNode);
    } finally {
      this.loadingFolders.set(false);
    }
  }

  onFolderSelect(event: TreeNode | TreeNode[] | null | undefined): void {
    if (Array.isArray(event)) {
      this.selectedFolder.set(event[0] ?? null);
    } else {
      this.selectedFolder.set(event ?? null);
    }
  }

  private insertFolderNode(
    nodes: TreeNode[],
    parentData: string,
    newNode: TreeNode,
  ): TreeNode[] {
    return nodes.map((node) => {
      if (node.data === parentData) {
        const children = [...(node.children ?? []), newNode].sort((a, b) =>
          (a.label ?? "").localeCompare(b.label ?? ""),
        );
        return { ...node, children, expanded: true, leaf: false };
      }
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: this.insertFolderNode(node.children, parentData, newNode),
        };
      }
      return { ...node };
    });
  }

  async createNewFolder(): Promise<string | undefined> {
    const root = this.moveRoot();
    if (!root) return;
    const parent = (this.selectedFolder()?.data as string) ?? root;
    const name = this.newFolderName().trim();
    if (!name) return;
    this.creatingFolder.set(true);
    try {
      const newPath = await this.createFolder(parent, name);
      this.newFolderName.set("");
      const newNode: TreeNode = {
        label: name,
        data: newPath,
        children: [],
      };
      this.folderTree.set(
        this.insertFolderNode(this.folderTree(), parent, newNode),
      );
      this.selectedFolder.set(newNode);
      return newPath;
    } finally {
      this.creatingFolder.set(false);
    }
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
