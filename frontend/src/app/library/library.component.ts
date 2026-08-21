import { Component, OnDestroy, OnInit, ViewChild, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { open } from "@tauri-apps/plugin-dialog";
import { Subject, Subscription, debounceTime } from "rxjs";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { ProgressBarModule } from "primeng/progressbar";
import { Table, TableLazyLoadEvent, TableModule } from "primeng/table";
import { SkeletonModule } from "primeng/skeleton";
import { TagModule } from "primeng/tag";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { MetadataEditorComponent } from "../shared/metadata-editor/metadata-editor.component";
import { LibraryService, TagUpdate } from "../core/services/library.service";
import { PlayerService } from "../core/services/player.service";
import { ScanProgress, Track } from "../core/models/track.model";

@Component({
  selector: "app-library",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    ProgressBarModule,
    TableModule,
    SkeletonModule,
    TagModule,
    ToastModule,
    MetadataEditorComponent,
  ],
  providers: [MessageService],
  templateUrl: "./library.component.html",
  styleUrl: "./library.component.css",
})
export class LibraryComponent implements OnInit, OnDestroy {
  @ViewChild("dt") table?: Table;

  tracks = signal<Track[]>([]);
  totalCount = signal(0);
  loading = signal(false);
  scanning = signal(false);
  scanProgress = signal<ScanProgress | null>(null);
  searchText = "";

  selectedTracks = signal<Track[]>([]);
  editorVisible = signal(false);

  readonly rowHeight = 40;
  readonly pageSize = 100;

  private search$ = new Subject<string>();
  private subs = new Subscription();

  constructor(
    private library: LibraryService,
    private player: PlayerService,
    private messages: MessageService,
  ) {}

  playTrack(track: Track): void {
    this.player.play(track);
  }

  ngOnInit(): void {
    this.subs.add(
      this.search$.pipe(debounceTime(250)).subscribe(() => this.reload()),
    );
    this.subs.add(
      this.library.scanProgress$().subscribe((p) => this.scanProgress.set(p)),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onSearchChange(value: string): void {
    this.search$.next(value);
  }

  /** Resets scroll position and reloads from the backend (search/scan changes). */
  private reload(): void {
    this.tracks.set([]);
    this.selectedTracks.set([]);
    if (this.table) {
      this.table.first = 0;
      this.table.firstChange.emit(0);
      this.table.resetScrollTop();
    }
    this.loadChunk({
      first: 0,
      rows: this.pageSize,
      sortField: this.table?.sortField ?? undefined,
      sortOrder: this.table?.sortOrder,
    });
  }

  async loadChunk(event: TableLazyLoadEvent): Promise<void> {
    const first = event.first ?? 0;
    const rows = event.rows ?? this.pageSize;
    const sortField =
      typeof event.sortField === "string" ? event.sortField : undefined;
    const sortDesc = event.sortOrder === -1;

    this.loading.set(true);
    try {
      const [chunk, total] = await Promise.all([
        this.library.getTracks({
          search: this.searchText,
          sortField,
          sortDesc,
          limit: rows,
          offset: first,
        }),
        this.library.getTrackCount(this.searchText),
      ]);

      const buffer = [...this.tracks()];
      buffer.length = total;
      chunk.forEach((t, i) => (buffer[first + i] = t));
      this.tracks.set(buffer);
      this.totalCount.set(total);
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error cargando biblioteca",
        detail: String(e),
      });
    } finally {
      this.loading.set(false);
    }
  }

  async addFolder(): Promise<void> {
    const folder = await open({ directory: true, multiple: false });
    if (!folder) return;

    this.scanning.set(true);
    this.scanProgress.set(null);
    try {
      await this.library.addLibraryFolder(folder as string);
      const result = await this.library.scanFolder(folder as string);
      this.messages.add({
        severity: "success",
        summary: "Escaneo completado",
        detail: `${result.added} agregados, ${result.updated} actualizados, ${result.skipped} sin cambios${
          result.errors.length ? `, ${result.errors.length} errores` : ""
        }`,
      });
      this.reload();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error en escaneo",
        detail: String(e),
      });
    } finally {
      this.scanning.set(false);
      this.scanProgress.set(null);
    }
  }

  openEditor(): void {
    this.editorVisible.set(true);
  }

  async saveMetadata(update: TagUpdate): Promise<void> {
    const selected = this.selectedTracks();
    if (selected.length === 0) return;

    try {
      let updated: Track[] = [];

      if (selected.length === 1) {
        const t = await this.library.updateTrack(selected[0].id, update);
        updated = [t];
      } else {
        const result = await this.library.updateTracks(
          selected.map((t) => t.id),
          update,
        );
        updated = result.updated;
        if (result.errors.length) {
          this.messages.add({
            severity: "warn",
            summary: "Algunos tracks no se pudieron editar",
            detail: result.errors.slice(0, 3).join("; "),
          });
        }
      }

      this.mergeUpdates(updated);
      this.editorVisible.set(false);
      this.selectedTracks.set([]);
      this.messages.add({
        severity: "success",
        summary: "Metadata guardada",
        detail: `${updated.length} track${updated.length === 1 ? "" : "s"} actualizado${updated.length === 1 ? "" : "s"}`,
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error guardando metadata",
        detail: String(e),
      });
    }
  }

  private mergeUpdates(updated: Track[]): void {
    const byId = new Map(updated.map((t) => [t.id, t]));
    const buffer = this.tracks().map((t) => byId.get(t.id) ?? t);
    this.tracks.set(buffer);
  }

  formatDuration(secs: number | null): string {
    if (secs == null) return "--:--";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  progressPercent(): number {
    const p = this.scanProgress();
    return p && p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
  }
}
