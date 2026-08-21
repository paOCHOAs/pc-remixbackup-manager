import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { open } from "@tauri-apps/plugin-dialog";
import { ButtonModule } from "primeng/button";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { ProgressBarModule } from "primeng/progressbar";
import { TableModule } from "primeng/table";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { LibraryService } from "../core/services/library.service";
import { LibraryFolder } from "../core/models/library-folder.model";

@Component({
  selector: "app-folders",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ToggleSwitchModule,
    ProgressBarModule,
    TableModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: "./folders.component.html",
  styleUrl: "./folders.component.css",
})
export class FoldersComponent implements OnInit {
  folders = signal<LibraryFolder[]>([]);
  scanning = signal(false);
  progress = signal(0);

  constructor(
    private library: LibraryService,
    private messages: MessageService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    try {
      this.folders.set(await this.library.getLibraryFolders());
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error",
        detail: String(e),
      });
    }
  }

  async addFolder(): Promise<void> {
    const path = await open({ directory: true, multiple: false });
    if (!path) return;

    try {
      await this.library.addLibraryFolder(path as string);
      await this.load();
      this.messages.add({
        severity: "success",
        summary: "Carpeta añadida",
        detail: String(path),
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "No se pudo añadir carpeta",
        detail: String(e),
      });
    }
  }

  async remove(folder: LibraryFolder): Promise<void> {
    try {
      await this.library.removeLibraryFolder(folder.id);
      await this.load();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error",
        detail: String(e),
      });
    }
  }

  async toggleEnabled(folder: LibraryFolder): Promise<void> {
    try {
      await this.library.setLibraryFolderEnabled(folder.id, folder.enabled);
    } catch (e) {
      folder.enabled = !folder.enabled;
      this.messages.add({
        severity: "error",
        summary: "Error",
        detail: String(e),
      });
    }
  }

  async rescan(): Promise<void> {
    this.scanning.set(true);
    this.progress.set(0);
    try {
      const result = await this.library.rescanAllLibraryFolders();
      this.messages.add({
        severity: "success",
        summary: "Escaneo completado",
        detail: `${result.added} agregados, ${result.updated} actualizados, ${result.skipped} sin cambios${
          result.errors.length ? `, ${result.errors.length} errores` : ""
        }`,
      });
      await this.load();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error en escaneo",
        detail: String(e),
      });
    } finally {
      this.scanning.set(false);
    }
  }
}
