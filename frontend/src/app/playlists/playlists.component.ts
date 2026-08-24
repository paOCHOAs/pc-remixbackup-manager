import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { LibraryService } from "../core/services/library.service";
import { PlayerService } from "../core/services/player.service";
import { Playlist } from "../core/models/playlist.model";
import { Track } from "../core/models/track.model";

@Component({
  selector: "app-playlists",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    TableModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: "./playlists.component.html",
  styleUrl: "./playlists.component.css",
})
export class PlaylistsComponent implements OnInit {
  playlists = signal<Playlist[]>([]);
  selectedPlaylist = signal<Playlist | null>(null);
  tracks = signal<Track[]>([]);
  newName = signal("");
  searchText = signal("");
  searchResults = signal<Track[]>([]);
  loading = signal(false);
  loadingTracks = signal(false);

  constructor(
    private library: LibraryService,
    public player: PlayerService,
    private messages: MessageService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadPlaylists();
  }

  async loadPlaylists(): Promise<void> {
    this.loading.set(true);
    try {
      this.playlists.set(await this.library.getPlaylists());
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error",
        detail: String(e),
      });
    } finally {
      this.loading.set(false);
    }
  }

  async createPlaylist(): Promise<void> {
    const name = this.newName().trim();
    if (!name) return;
    try {
      const playlist = await this.library.createPlaylist(name);
      await this.log(`Playlist creada: ${name}`);
      this.playlists.update((p) => [...p, playlist].sort((a, b) => a.name.localeCompare(b.name)));
      this.newName.set("");
      this.messages.add({
        severity: "success",
        summary: "Playlist creada",
        detail: playlist.name,
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo crear",
        detail: String(e),
      });
    }
  }

  async selectPlaylist(playlist: Playlist): Promise<void> {
    this.selectedPlaylist.set(playlist);
    this.searchResults.set([]);
    this.searchText.set("");
    await this.loadTracks();
  }

  async loadTracks(): Promise<void> {
    const playlist = this.selectedPlaylist();
    if (!playlist) return;
    this.loadingTracks.set(true);
    try {
      this.tracks.set(await this.library.getPlaylistTracks(playlist.id));
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error cargando tracks",
        detail: String(e),
      });
    } finally {
      this.loadingTracks.set(false);
    }
  }

  async deletePlaylist(playlist: Playlist): Promise<void> {
    try {
      await this.library.deletePlaylist(playlist.id);
      await this.log(`Playlist eliminada: ${playlist.name}`);
      if (this.selectedPlaylist()?.id === playlist.id) {
        this.selectedPlaylist.set(null);
        this.tracks.set([]);
      }
      this.playlists.update((p) => p.filter((x) => x.id !== playlist.id));
      this.messages.add({
        severity: "success",
        summary: "Playlist eliminada",
        detail: playlist.name,
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo eliminar",
        detail: String(e),
      });
    }
  }

  async searchTracks(): Promise<void> {
    const q = this.searchText().trim();
    if (!q) {
      this.searchResults.set([]);
      return;
    }
    try {
      this.searchResults.set(await this.library.getTracks({ search: q, limit: 20 }));
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error buscando",
        detail: String(e),
      });
    }
  }

  async addTrack(track: Track): Promise<void> {
    const playlist = this.selectedPlaylist();
    if (!playlist) return;
    try {
      await this.library.addTrackToPlaylist(playlist.id, track.id);
      await this.log(`Track agregado a playlist: ${track.title || track.filename} en ${playlist.name}`);
      this.searchText.set("");
      this.searchResults.set([]);
      await this.loadTracks();
      this.messages.add({
        severity: "success",
        summary: "Track agregado",
        detail: track.filename,
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo agregar",
        detail: String(e),
      });
    }
  }

  async removeTrack(track: Track): Promise<void> {
    const playlist = this.selectedPlaylist();
    if (!playlist) return;
    try {
      await this.library.removeTrackFromPlaylist(playlist.id, track.id);
      await this.log(`Track removido de playlist: ${track.title || track.filename} en ${playlist.name}`);
      await this.loadTracks();
      this.messages.add({
        severity: "success",
        summary: "Track eliminado",
        detail: track.filename,
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo eliminar",
        detail: String(e),
      });
    }
  }

  play(track: Track): void {
    this.player.play(track);
  }

  formatDuration(secs: number | null): string {
    if (secs == null) return "--:--";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  private async log(message: string): Promise<void> {
    await this.library.log("playlists", message).catch(() => {});
  }
}
