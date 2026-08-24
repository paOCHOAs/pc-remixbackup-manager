import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { open } from "@tauri-apps/plugin-dialog";
import { ButtonModule } from "primeng/button";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { ProgressBarModule } from "primeng/progressbar";
import { TableModule } from "primeng/table";
import { ToastModule } from "primeng/toast";
import { ConfirmationService, MessageService } from "primeng/api";
import { LibraryService } from "../core/services/library.service";
import { LibraryFolder } from "../core/models/library-folder.model";
import { PageLayoutComponent } from "../shared/layout/page-layout.component";
import { PageHeaderComponent } from "../shared/layout/page-header.component";

@Component({
  selector: "app-folders",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    ToggleSwitchModule,
    ProgressBarModule,
    TableModule,
    ToastModule,
    PageLayoutComponent,
    PageHeaderComponent,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: "./folders.component.html",
  styleUrl: "./folders.component.css",
})
export class FoldersComponent implements OnInit {
  folders = signal<LibraryFolder[]>([]);
  scanning = signal(false);
  rescanningId = signal<number | null>(null);
  progress = signal(0);

  constructor(
    private library: LibraryService,
    private messages: MessageService,
    private confirmation: ConfirmationService,
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
      this.log(`Carpeta añadida: ${path}`);
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
      this.log(`Carpeta ${folder.enabled ? "activada" : "desactivada"}: ${folder.path}`);
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
      this.log(`Re-escaneo global: +${result.added}, ~${result.updated}, !${result.missing} perdidos`);
      this.messages.add({
        severity: "success",
        summary: "Escaneo completado",
        detail: `${result.added} agregados, ${result.updated} actualizados, ${result.skipped} sin cambios, ${result.missing} no encontrados${
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

  async rescanFolder(folder: LibraryFolder): Promise<void> {
    this.rescanningId.set(folder.id);
    try {
      const result = await this.library.rescanLibraryFolder(folder.id);
      this.log(`Re-escaneo carpeta: ${folder.path} — +${result.added}, ~${result.updated}, !${result.missing} perdidos`);
      this.messages.add({
        severity: "success",
        summary: "Carpeta re-escaneada",
        detail: `${result.added} agregados, ${result.updated} actualizados, ${result.skipped} sin cambios, ${result.missing} no encontrados${
          result.errors.length ? `, ${result.errors.length} errores` : ""
        }`,
      });
      await this.load();
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error re-escaneando carpeta",
        detail: String(e),
      });
    } finally {
      this.rescanningId.set(null);
    }
  }

  async clean(): Promise<void> {
    try {
      const removed = await this.library.cleanLibrary();
      this.log(`Biblioteca limpiada: ${removed} tracks huérfanos`);
      this.messages.add({
        severity: "success",
        summary: "Biblioteca limpiada",
        detail: `${removed} track(s) huérfano(s) eliminados del índice. Los archivos no se borraron.`,
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error limpiando biblioteca",
        detail: String(e),
      });
    }
  }

  confirmClear(): void {
    this.confirmation.confirm({
      message:
        "Se borrarán todos los tracks de la biblioteca. Los archivos de música no se eliminarán. ¿Continuar?",
      header: "Vaciar biblioteca",
      icon: "pi pi-exclamation-triangle",
      acceptButtonStyleClass: "p-button-danger",
      accept: () => this.clear(),
    });
  }

  async clear(): Promise<void> {
    try {
      const removed = await this.library.clearLibrary();
      this.log(`Biblioteca vaciada: ${removed} tracks`);
      this.messages.add({
        severity: "success",
        summary: "Biblioteca vaciada",
        detail: `${removed} track(s) eliminados del índice. Las carpetas siguen configuradas.`,
      });
    } catch (e) {
      this.messages.add({
        severity: "error",
        summary: "Error vaciando biblioteca",
        detail: String(e),
      });
    }
  }

  private log(message: string): void {
    this.library.log("folders", message).catch(() => {});
  }
}
