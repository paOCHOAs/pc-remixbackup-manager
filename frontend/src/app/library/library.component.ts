import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  signal,
  WritableSignal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { open } from "@tauri-apps/plugin-dialog";
import { Subject, Subscription, debounceTime } from "rxjs";
import { ButtonModule } from "primeng/button";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { PaginatorModule } from "primeng/paginator";
import { ProgressBarModule } from "primeng/progressbar";
import { TableModule } from "primeng/table";
import { SkeletonModule } from "primeng/skeleton";
import { TagModule } from "primeng/tag";
import { ToastModule } from "primeng/toast";
import { TooltipModule } from "primeng/tooltip";
import { TreeModule } from "primeng/tree";
import { MessageService, TreeNode } from "primeng/api";
import { MetadataEditorComponent } from "../shared/metadata-editor/metadata-editor.component";
import { LibraryService, TagUpdate } from "../core/services/library.service";
import { PlayerService } from "../core/services/player.service";
import { ScanProgress, Track } from "../core/models/track.model";
import { DuplicateBatchItem, BatchActionResult } from "../core/services/library.service";

@Component({
  selector: "app-library",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    PaginatorModule,
    ProgressBarModule,
    TableModule,
    SkeletonModule,
    TagModule,
    ToastModule,
    TooltipModule,
    TreeModule,
    MetadataEditorComponent,
  ],
  providers: [MessageService],
  templateUrl: "./library.component.html",
  styleUrl: "./library.component.css",
})
export class LibraryComponent implements OnInit, OnDestroy {
  tracks = signal<Track[]>([]);
  totalCount = signal(0);
  loading = signal(false);
  scanning = signal(false);
  scanProgress = signal<ScanProgress | null>(null);
  searchText = "";

  selectedTracks = signal<Track[]>([]);
  editorVisible = signal(false);
  moveDialogVisible = signal(false);
  folderTree: WritableSignal<TreeNode[]>;
  selectedFolder: WritableSignal<TreeNode | null>;
  moveRoot: WritableSignal<string | null>;
  newFolderName: WritableSignal<string>;
  creatingFolder: WritableSignal<boolean>;
  loadingFolders: WritableSignal<boolean>;
  batchAction = signal<"delete_index" | "delete_file" | null>(null);
  batchDialogVisible = signal(false);
  trackDeleteDialogVisible = signal(false);
  pendingDeleteTrack = signal<Track | null>(null);
  first = signal(0);

  selectedCount = computed(() => this.selectedTracks().length);
  selectedBytes = computed(() =>
    this.selectedTracks().reduce((acc, t) => acc + t.file_size, 0),
  );

  readonly pageSize = 100;

  private search$ = new Subject<string>();
  private subs = new Subscription();

  constructor(
    private library: LibraryService,
    public player: PlayerService,
    private messages: MessageService,
  ) {
    this.folderTree = this.library.folderTree;
    this.selectedFolder = this.library.selectedFolder;
    this.moveRoot = this.library.moveRoot;
    this.newFolderName = this.library.newFolderName;
    this.creatingFolder = this.library.creatingFolder;
    this.loadingFolders = this.library.loadingFolders;
  }

  playTrack(track: Track): void {
    this.player.play(track);
  }

  async moveTrackToSelected(track: Track): Promise<void> {
    const folder = this.selectedFolder();
    if (!folder) {
      this.messages.add({
        severity: "warn",
        summary: "Sin destino",
        detail: "Selecciona una carpeta del árbol",
      });
      return;
    }
    try {
      const newPath = await this.library.moveTrackToFolder(
        track.id,
        folder.data as string,
      );
      this.messages.add({
        severity: "success",
        summary: "Archivo movido",
        detail: newPath,
      });
      this.mergeTrackUpdate(track.id, { moved: true, path: newPath });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo mover",
        detail: String(e),
      });
    }
  }

  openTrackDeleteDialog(track: Track): void {
    this.pendingDeleteTrack.set(track);
    this.trackDeleteDialogVisible.set(true);
  }

  closeTrackDeleteDialog(): void {
    this.pendingDeleteTrack.set(null);
    this.trackDeleteDialogVisible.set(false);
  }

  async executeTrackDelete(removeFile: boolean): Promise<void> {
    const track = this.pendingDeleteTrack();
    if (!track) return;
    try {
      if (removeFile) {
        await this.library.removeTrackAndFile(track.id);
      } else {
        await this.library.deleteDuplicatesBatch(
          [{ keep_id: -1, remove_ids: [track.id] }],
          false,
        );
      }
      this.log(`${removeFile ? "Eliminado disco" : "Eliminado índice"}: ${track.title || track.filename}`);
      this.messages.add({
        severity: "success",
        summary: track.title || track.filename,
        detail: removeFile
          ? "Track y archivo eliminados"
          : "Track eliminado del índice",
      });
      this.tracks.set(this.tracks().filter((t) => t.id !== track.id));
      this.totalCount.update((v) => Math.max(0, v - 1));
      this.closeTrackDeleteDialog();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo eliminar",
        detail: String(e),
      });
    }
  }

  ngOnInit(): void {
    this.subs.add(
      this.search$.pipe(debounceTime(250)).subscribe(() => this.reload()),
    );
    this.subs.add(
      this.library.scanProgress$().subscribe((p) => this.scanProgress.set(p)),
    );
    this.reload();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onSearchChange(value: string): void {
    this.search$.next(value);
  }

  /** Loads the first page of tracks (search/scan changes). */
  private async reload(): Promise<void> {
    this.first.set(0);
    this.selectedTracks.set([]);
    await this.loadPage(0);
  }

  async loadPage(offset: number): Promise<void> {
    this.loading.set(true);
    this.tracks.set([]);
    try {
      const [tracks, total] = await Promise.all([
        this.library.getTracks({
          search: this.searchText,
          limit: this.pageSize,
          offset,
        }),
        this.library.getTrackCount(this.searchText),
      ]);
      this.tracks.set(tracks);
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

  onPage(event: { first?: number }): void {
    const first = event.first ?? 0;
    this.first.set(first);
    this.loadPage(first);
    this.selectedTracks.set([]);
  }

  async addFolder(): Promise<void> {
    const folder = await open({ directory: true, multiple: false });
    if (!folder) return;

    this.scanning.set(true);
    this.scanProgress.set(null);
    try {
      await this.library.addLibraryFolder(folder as string);
      const result = await this.library.scanFolder(folder as string);
      this.log(`Escaneo carpeta: ${folder} — +${result.added}, ~${result.updated}`);
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
      this.log(`Metadata guardada: ${updated.length} tracks`);
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

  private mergeTrackUpdate(
    id: number,
    patch: Partial<Track>,
  ): void {
    this.tracks.set(
      this.tracks().map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
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

  isTrackPlaying(track: Track): boolean {
    return this.player.currentTrack()?.id === track.id;
  }

  async loadFolderRoot(): Promise<void> {
    try {
      await this.library.loadFolderRoot();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error cargando carpetas",
        detail: String(e),
      });
    }
  }

  onFolderSelect(
    event: TreeNode | TreeNode[] | null | undefined,
  ): void {
    this.library.onFolderSelect(event);
  }

  async createNewFolder(): Promise<void> {
    try {
      const newPath = await this.library.createNewFolder();
      if (newPath) {
        this.log(`Carpeta destino creada: ${newPath}`);
        this.messages.add({
          severity: "success",
          summary: "Carpeta creada",
          detail: newPath,
        });
      }
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo crear la carpeta",
        detail: String(e),
      });
    }
  }

  private buildBatchItems(): DuplicateBatchItem[] {
    const ids = this.selectedTracks().map((t) => t.id);
    return [{ keep_id: -1, remove_ids: ids }];
  }

  openMoveDialog(): void {
    this.moveDialogVisible.set(true);
  }

  closeMoveDialog(): void {
    this.moveDialogVisible.set(false);
  }

  async moveSelected(): Promise<void> {
    const folder = this.selectedFolder();
    if (!folder) {
      this.messages.add({
        severity: "warn",
        summary: "Sin destino",
        detail: "Selecciona una carpeta del árbol",
      });
      return;
    }
    const items = this.buildBatchItems();
    if (items[0].remove_ids.length === 0) {
      this.closeMoveDialog();
      return;
    }
    try {
      const result = await this.library.moveDuplicatesBatch(
        items,
        folder.data as string,
      );
      this.log(`Mover seleccionados: ${result.affected} tracks a ${folder.data}`);
      const sizeMb = (result.freed_bytes / 1024 / 1024).toFixed(1);
      const errors =
        result.errors.length > 0
          ? ` (${result.errors.length} errores)`
          : "";
      this.messages.add({
        severity: result.errors.length ? "warn" : "success",
        summary: "Movimiento completado",
        detail: `${result.affected} track(s) movidos, ${sizeMb} MB${errors}`,
      });
      this.selectedTracks.set([]);
      this.closeMoveDialog();
      const dest = folder.data as string;
      const ids = new Set(items[0].remove_ids);
      if (result.errors.length === 0) {
        this.tracks.set(
          this.tracks().map((t) =>
            ids.has(t.id)
              ? { ...t, moved: true, path: `${dest}\\${t.filename}` }
              : t,
          ),
        );
      } else {
        this.reload();
      }
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo mover",
        detail: String(e),
      });
    }
  }

  openDeleteDialog(action: "delete_index" | "delete_file"): void {
    this.batchAction.set(action);
    this.batchDialogVisible.set(true);
  }

  closeBatchDialog(): void {
    this.batchDialogVisible.set(false);
    this.batchAction.set(null);
  }

  async executeDelete(): Promise<void> {
    const items = this.buildBatchItems();
    if (items[0].remove_ids.length === 0) {
      this.closeBatchDialog();
      return;
    }
    try {
      const result = await this.library.deleteDuplicatesBatch(
        items,
        this.batchAction() === "delete_file",
      );
      const sizeMb = (result.freed_bytes / 1024 / 1024).toFixed(1);
      const errors =
        result.errors.length > 0
          ? ` (${result.errors.length} errores)`
          : "";
      this.log(`Eliminación en lote: ${result.affected} tracks (${this.batchAction()})`);
      this.messages.add({
        severity: result.errors.length ? "warn" : "success",
        summary: "Eliminación completada",
        detail: `${result.affected} track(s) eliminados, ${sizeMb} MB${errors}`,
      });
      this.selectedTracks.set([]);
      this.closeBatchDialog();
      this.reload();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo eliminar",
        detail: String(e),
      });
    }
  }

  private log(message: string): void {
    this.library.log("library", message).catch(() => {});
  }
}
