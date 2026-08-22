import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
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
  mode:
    | "exact"
    | "filename"
    | "duration"
    | "exact_and_duration"
    | "filename_and_size"
    | "size" = "exact";

  modes = [
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

  async keepBest(group: DuplicateGroup, keep: (typeof group.tracks)[0]): Promise<void> {
    const toRemove = group.tracks.filter((t) => t.id !== keep.id);
    for (const t of toRemove) {
      try {
        await this.library.removeDuplicate(t.id);
      } catch (e) {
        this.messages.add({
          severity: "error",
          summary: "No se pudo eliminar",
          detail: String(e),
        });
        return;
      }
    }
    this.messages.add({
      severity: "success",
      summary: "Duplicados limpiados",
      detail: `${toRemove.length} track(s) eliminados del índice`,
    });
    this.search();
  }

  formatDuration(secs: number | null): string {
    if (secs == null) return "--:--";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
}
