import { Component, OnInit, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { CheckboxModule } from "primeng/checkbox";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { PanelModule } from "primeng/panel";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ToastModule } from "primeng/toast";
import { TooltipModule } from "primeng/tooltip";
import { TreeModule } from "primeng/tree";
import { MessageService, TreeNode } from "primeng/api";
import { open } from "@tauri-apps/plugin-dialog";
import { LibraryService } from "../core/services/library.service";
import { PlayerService } from "../core/services/player.service";
import { Track } from "../core/models/track.model";
import { DuplicateGroup } from "../core/models/duplicate-group.model";
import {
  BatchActionResult,
  DuplicateBatchItem,
} from "../core/services/library.service";

@Component({
  selector: "app-duplicates",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    PanelModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
    TreeModule,
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
  moveRoot = signal<string | null>(null);
  folderTree = signal<TreeNode[]>([]);
  selectedFolder = signal<TreeNode | null>(null);
  loadingFolders = signal(false);
  selectedTracks = signal<Set<number>>(new Set());
  newFolderName = signal("");
  creatingFolder = signal(false);
  batchDialogVisible = signal(false);
  batchAction = signal<"delete_index" | "delete_file" | "move" | null>(null);
  batchItems = signal<DuplicateBatchItem[]>([]);

  totalTracks = computed(() => this.groups().reduce((acc, g) => acc + g.tracks.length, 0));
  allSelected = computed(() => this.totalTracks() > 0 && this.selectedTracks().size === this.totalTracks());
  selectedCount = computed(() => this.selectedTracks().size);
  selectedSummary = computed(() => {
    const ids = this.selectedTracks();
    const tracks = ids.size;
    let bytes = 0;
    for (const g of this.groups()) {
      for (const t of g.tracks) {
        if (ids.has(t.id)) {
          bytes += t.file_size;
        }
      }
    }
    return { tracks, bytes };
  });

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

  onFolderSelect(
    event: TreeNode | TreeNode[] | null | undefined,
  ): void {
    if (Array.isArray(event)) {
      this.selectedFolder.set(event[0] ?? null);
    } else {
      this.selectedFolder.set(event ?? null);
    }
  }

  async loadFolderRoot(): Promise<void> {
    const root = await open({ directory: true, multiple: false });
    if (!root || Array.isArray(root)) return;
    this.loadingFolders.set(true);
    try {
      const node = await this.library.listSubfolders(root);
      this.moveRoot.set(root);
      this.folderTree.set([node as TreeNode]);
      this.selectedFolder.set(node as TreeNode);
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error cargando carpetas",
        detail: String(e),
      });
    } finally {
      this.loadingFolders.set(false);
    }
  }

  async moveTrackToSelected(track: Track): Promise<void> {
    const folder = this.selectedFolder();
    if (!folder) {
      this.messages.add({
        severity: "warn",
        summary: "Sin destino",
        detail: "Selecciona una carpeta del árbol de la derecha",
      });
      return;
    }
    try {
      const newPath = await this.library.moveTrackToFolder(track.id, folder.data as string);
      this.messages.add({
        severity: "success",
        summary: "Archivo movido",
        detail: newPath,
      });
      this.search();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo mover",
        detail: String(e),
      });
    }
  }

  isTrackSelected(track: Track): boolean {
    return this.selectedTracks().has(track.id);
  }

  toggleTrack(track: Track, checked: boolean): void {
    const set = new Set(this.selectedTracks());
    if (checked) {
      set.add(track.id);
    } else {
      set.delete(track.id);
    }
    this.selectedTracks.set(set);
  }

  toggleAll(checked: boolean): void {
    if (checked) {
      const all = new Set<number>();
      for (const g of this.groups()) {
        for (const t of g.tracks) {
          all.add(t.id);
        }
      }
      this.selectedTracks.set(all);
    } else {
      this.selectedTracks.set(new Set());
    }
  }

  buildBatchItems(reload: boolean = false): DuplicateBatchItem[] {
    const ids = Array.from(this.selectedTracks());
    const items: DuplicateBatchItem[] = [{ keep_id: -1, remove_ids: ids }];
    if (reload) {
      this.batchItems.set(items);
    }
    return items;
  }

  openBatch(action: "delete_index" | "delete_file" | "move"): void {
    this.buildBatchItems(true);
    this.batchAction.set(action);
    this.batchDialogVisible.set(true);
  }

  closeBatchDialog(): void {
    this.batchDialogVisible.set(false);
    this.batchAction.set(null);
  }

  async executeBatch(): Promise<void> {
    const items = this.batchItems();
    if (items.length === 0 || items[0].remove_ids.length === 0) {
      this.closeBatchDialog();
      return;
    }

    let result: BatchActionResult;
    const action = this.batchAction();
    try {
      switch (action) {
        case "delete_index":
          result = await this.library.deleteDuplicatesBatch(items, false);
          break;
        case "delete_file":
          result = await this.library.deleteDuplicatesBatch(items, true);
          break;
        case "move": {
          const folder = this.selectedFolder();
          if (!folder) {
            this.messages.add({
              severity: "warn",
              summary: "Sin destino",
              detail: "Selecciona una carpeta del árbol de la derecha",
            });
            return;
          }
          result = await this.library.moveDuplicatesBatch(
            items,
            folder.data as string,
          );
          break;
        }
        default:
          return;
      }
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error en acción por lote",
        detail: String(e),
      });
      this.closeBatchDialog();
      return;
    }

    const sizeMb = (result.freed_bytes / 1024 / 1024).toFixed(1);
    const errors = result.errors.length > 0 ? ` (${result.errors.length} errores)` : "";
    this.messages.add({
      severity: result.errors.length ? "warn" : "success",
      summary: "Acción por lote completada",
      detail: `${result.affected} track(s) afectados, ${sizeMb} MB${errors}`,
    });
    this.selectedTracks.set(new Set());
    this.closeBatchDialog();
    this.search();
  }

  batchActionLabel(action: string): string {
    switch (action) {
      case "delete_index":
        return "borrar del índice las canciones seleccionadas";
      case "delete_file":
        return "borrar del disco las canciones seleccionadas";
      case "move":
        return "mover las canciones seleccionadas a la carpeta destino";
      default:
        return action;
    }
  }

  batchConfirmLabel(action: string): string {
    switch (action) {
      case "delete_index":
        return "Borrar del índice";
      case "delete_file":
        return "Borrar del disco";
      case "move":
        return "Mover seleccionadas";
      default:
        return "Confirmar";
    }
  }

  async createNewFolder(): Promise<void> {
    const root = this.moveRoot();
    if (!root) {
      this.messages.add({
        severity: "warn",
        summary: "Sin raíz",
        detail: "Selecciona una carpeta raíz primero",
      });
      return;
    }
    const parent = (this.selectedFolder()?.data as string) ?? root;
    const name = this.newFolderName().trim();
    if (!name) return;
    this.creatingFolder.set(true);
    try {
      const newPath = await this.library.createFolder(parent, name);
      this.messages.add({
        severity: "success",
        summary: "Carpeta creada",
        detail: newPath,
      });
      this.newFolderName.set("");
      const node = await this.library.listSubfolders(root);
      this.folderTree.set([node as TreeNode]);
      this.selectedFolder.set({
        label: name,
        data: newPath,
        children: [],
      } as TreeNode);
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo crear la carpeta",
        detail: String(e),
      });
    } finally {
      this.creatingFolder.set(false);
    }
  }
}
