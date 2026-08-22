import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { DialogModule } from "primeng/dialog";
import { SelectModule } from "primeng/select";
import { PanelModule } from "primeng/panel";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ToastModule } from "primeng/toast";
import { TooltipModule } from "primeng/tooltip";
import { MessageService } from "primeng/api";
import { LibraryService } from "../core/services/library.service";
import { PlayerService } from "../core/services/player.service";
import { Track } from "../core/models/track.model";
import { DuplicateGroup } from "../core/models/duplicate-group.model";

@Component({
  selector: "app-duplicates",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    SelectModule,
    PanelModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: "./duplicates.component.html",
  styleUrl: "./duplicates.component.css",
})
export class DuplicatesComponent implements OnInit {
  groups = signal<DuplicateGroup[]>([]);
  loading = signal(false);
  deleteDialogVisible = signal(false);
  deleteStep = signal<"choose" | "confirm-file">("choose");
  pendingDelete = signal<Track | null>(null);
  mode:
    | "exact"
    | "name_artist"
    | "filename"
    | "duration"
    | "exact_and_duration"
    | "filename_and_size"
    | "size" = "name_artist";

  modes = [
    { label: "Nombre + Artista (normalizado)", value: "name_artist" },
    { label: "Título + Artista", value: "exact" },
    { label: "Título + Artista + Duración", value: "exact_and_duration" },
    { label: "Nombre de archivo", value: "filename" },
    { label: "Nombre de archivo + Tamaño", value: "filename_and_size" },
    { label: "Duración + Tamaño", value: "duration" },
    { label: "Solo tamaño de archivo", value: "size" },
  ];

  constructor(
    private library: LibraryService,
    private player: PlayerService,
    private messages: MessageService,
  ) {}

  play(track: Track): void {
    this.player.play(track);
  }

  ngOnInit(): void {
    this.search();
  }

  async search(): Promise<void> {
    this.loading.set(true);
    try {
      this.groups.set(await this.library.findDuplicates(this.mode));
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

  showDeleteDialog(track: Track): void {
    this.pendingDelete.set(track);
    this.deleteStep.set("choose");
    this.deleteDialogVisible.set(true);
  }

  closeDeleteDialog(): void {
    this.deleteDialogVisible.set(false);
    this.pendingDelete.set(null);
  }

  async removeFromIndexOnly(): Promise<void> {
    const track = this.pendingDelete();
    if (!track) return;
    try {
      await this.library.removeDuplicate(track.id);
      this.messages.add({
        severity: "success",
        summary: "Track eliminado del índice",
        detail: track.filename,
      });
      this.closeDeleteDialog();
      this.search();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo eliminar",
        detail: String(e),
      });
    }
  }

  askDeleteFile(): void {
    this.deleteStep.set("confirm-file");
  }

  async removeFromDisk(): Promise<void> {
    const track = this.pendingDelete();
    if (!track) return;
    try {
      const path = await this.library.removeTrackAndFile(track.id);
      this.messages.add({
        severity: "success",
        summary: "Track y archivo eliminados",
        detail: path,
      });
      this.closeDeleteDialog();
      this.search();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo eliminar",
        detail: String(e),
      });
    }
  }

  async keepBest(group: DuplicateGroup, keep: (typeof group.tracks)[0]): Promise<void> {
    const ids = group.tracks.map((t) => t.id);
    try {
      const removed = await this.library.removeDuplicatesExcept(keep.id, ids);
      this.messages.add({
        severity: "success",
        summary: "Duplicados limpiados",
        detail: `${removed} track(s) eliminados del índice`,
      });
      this.search();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo limpiar",
        detail: String(e),
      });
    }
  }

  bestTrack(group: DuplicateGroup): (typeof group.tracks)[0] {
    return group.tracks.slice().sort((a, b) => {
      if ((b.bitrate_kbps ?? 0) !== (a.bitrate_kbps ?? 0))
        return (b.bitrate_kbps ?? 0) - (a.bitrate_kbps ?? 0);
      if (b.file_size !== a.file_size) return b.file_size - a.file_size;
      if ((b.duration_secs ?? 0) !== (a.duration_secs ?? 0))
        return (b.duration_secs ?? 0) - (a.duration_secs ?? 0);
      return a.path.localeCompare(b.path);
    })[0];
  }

  async keepAutoBest(group: DuplicateGroup): Promise<void> {
    const keep = this.bestTrack(group);
    await this.keepBest(group, keep);
  }

  formatDuration(secs: number | null): string {
    if (secs == null) return "--:--";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
}
