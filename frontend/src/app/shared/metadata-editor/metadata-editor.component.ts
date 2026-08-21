import {
  Component,
  effect,
  input,
  model,
  output,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputNumberModule } from "primeng/inputnumber";
import { InputTextModule } from "primeng/inputtext";
import { DialogModule } from "primeng/dialog";
import { TagModule } from "primeng/tag";
import { Track } from "../../core/models/track.model";
import { TagUpdate } from "../../core/services/library.service";

@Component({
  selector: "app-metadata-editor",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    DialogModule,
    TagModule,
  ],
  templateUrl: "./metadata-editor.component.html",
  styleUrl: "./metadata-editor.component.css",
})
export class MetadataEditorComponent {
  visible = model.required<boolean>();
  tracks = input.required<Track[]>();
  saved = output<TagUpdate>();

  title = signal<string | null>(null);
  artist = signal<string | null>(null);
  album = signal<string | null>(null);
  genre = signal<string | null>(null);
  year = signal<number | null>(null);
  bpm = signal<number | null>(null);
  initialKey = signal<string | null>(null);
  loading = signal(false);

  constructor() {
    effect(() => {
      const selected = this.tracks();
      this.resetTo(selected);
    });
  }

  private resetTo(tracks: Track[]): void {
    if (tracks.length === 1) {
      const t = tracks[0];
      this.title.set(t.title ?? null);
      this.artist.set(t.artist ?? null);
      this.album.set(t.album ?? null);
      this.genre.set(t.genre ?? null);
      this.year.set(t.year);
      this.bpm.set(t.bpm);
      this.initialKey.set(t.initial_key ?? null);
    } else {
      // Batch: start empty (meaning "no change")
      this.title.set(null);
      this.artist.set(null);
      this.album.set(null);
      this.genre.set(null);
      this.year.set(null);
      this.bpm.set(null);
      this.initialKey.set(null);
    }
  }

  isSingle(): boolean {
    return this.tracks().length === 1;
  }

  titlePlaceholder(): string {
    return this.isSingle() ? "Título" : "Sin cambios (batch)";
  }

  onSave(): void {
    this.loading.set(true);
    this.saved.emit(this.collectChanges());
  }

  collectChanges(): TagUpdate {
    return {
      title: this.isSingle() ? this.title() : undefined,
      artist: this.artist() ?? undefined,
      album: this.album() ?? undefined,
      genre: this.genre() ?? undefined,
      year: this.year() ?? undefined,
      bpm: this.isSingle() ? this.bpm() : undefined,
      initialKey: this.isSingle() ? this.initialKey() : undefined,
    };
  }
}
