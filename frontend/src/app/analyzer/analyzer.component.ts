import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { SkeletonModule } from "primeng/skeleton";
import { TagModule } from "primeng/tag";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { LibraryService } from "../core/services/library.service";
import { Track } from "../core/models/track.model";

@Component({
  selector: "app-analyzer",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    TableModule,
    SkeletonModule,
    TagModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: "./analyzer.component.html",
  styleUrl: "./analyzer.component.css",
})
export class AnalyzerComponent implements OnInit {
  tracks = signal<Track[]>([]);
  totalCount = signal(0);
  loading = signal(false);
  identifying = signal(false);
  searchText = "";

  readonly pageSize = 100;

  constructor(
    private library: LibraryService,
    private messages: MessageService,
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const [tracks, total] = await Promise.all([
        this.library.getTracks({
          search: this.searchText,
          limit: this.pageSize,
          offset: 0,
        }),
        this.library.getTrackCount(this.searchText),
      ]);
      this.tracks.set(tracks);
      this.totalCount.set(total);
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error cargando tracks",
        detail: String(e),
      });
    } finally {
      this.loading.set(false);
    }
  }

  onSearchChange(value: string): void {
    this.searchText = value;
    this.reload();
  }

  async identify(track: Track): Promise<void> {
    this.identifying.set(true);
    try {
      const updated = await this.library.identifyTrack(track.id);
      this.mergeUpdate(updated);
      this.messages.add({
        severity: "success",
        summary: "Track identificado",
        detail: `${updated.title || updated.filename} → ${updated.genre || "sin género"} / ${updated.year || "sin año"}`,
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error identificando",
        detail: String(e),
      });
    } finally {
      this.identifying.set(false);
    }
  }

  private mergeUpdate(updated: Track): void {
    const buffer = this.tracks().map((t) => (t.id === updated.id ? updated : t));
    this.tracks.set(buffer);
  }

  /** Sugiere la ruta de backup a partir del género y el año del track. */
  suggestBackupPath(track: Track): string {
    const raw = (track.genre ?? "").toLowerCase().trim();
    const year = track.year;

    let category = "Sin género";
    let sub = "General";

    if (raw.includes("cumbia")) {
      category = "Cumbia";
      if (raw.includes("pop")) sub = "Cumbia pop";
      else if (raw.includes("villera")) sub = "Cumbia villera";
      else if (raw.includes("ranchera")) sub = "Cumbia ranchera";
      else if (raw.includes("santafesina")) sub = "Cumbia santafesina";
      else if (raw.includes("cuarteto")) sub = "Cuarteto";
      else sub = "General";
    } else if (raw.includes("salsa")) {
      category = "Salsa";
      sub = raw.includes("romántica") ? "Salsa romántica" : "General";
    } else if (raw.includes("reggaeton")) {
      category = "Reggaeton";
      sub = "General";
    } else if (raw) {
      category = raw.replace(/\b\w/g, (c) => c.toUpperCase());
    }

    const yearFolder = year ? `[año] ${year}` : "[año] sin año";
    return `Música/${category}/${sub}/${yearFolder}`;
  }
}
