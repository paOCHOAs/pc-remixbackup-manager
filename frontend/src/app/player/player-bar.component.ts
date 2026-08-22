import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import WaveSurfer from "wavesurfer.js";
import { ButtonModule } from "primeng/button";
import { SliderModule } from "primeng/slider";
import { PlayerService } from "../core/services/player.service";
import { Track } from "../core/models/track.model";

@Component({
  selector: "app-player-bar",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SliderModule],
  templateUrl: "./player-bar.component.html",
  styleUrl: "./player-bar.component.css",
})
export class PlayerBarComponent implements AfterViewInit, OnDestroy {
  @ViewChild("waveform") waveformRef!: ElementRef<HTMLDivElement>;

  track = signal<Track | null>(null);
  playing = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  currentTime = signal(0);
  duration = signal(0);
  volume = 80;
  isSeeking = false;

  private ws: WaveSurfer | null = null;
  private viewReady = false;

  constructor(private player: PlayerService) {
    effect(() => {
      const track = this.player.currentTrack();
      if (track && this.viewReady) this.load(track);
    });
  }

  onSeekChange(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.currentTime.set(value);
  }

  onSeekEnd(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.isSeeking = false;
    this.ws?.setTime(value);
  }

  onSeekStart(): void {
    this.isSeeking = true;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    const pending = this.player.currentTrack();
    if (pending) this.load(pending);
  }

  ngOnDestroy(): void {
    this.ws?.destroy();
  }

  private load(track: Track): void {
    this.track.set(track);
    this.error.set(null);
    this.loading.set(true);
    this.playing.set(false);
    this.currentTime.set(0);
    this.isSeeking = false;
    this.duration.set(track.duration_secs ?? 0);

    this.ws?.destroy();
    this.ws = WaveSurfer.create({
      container: this.waveformRef.nativeElement,
      height: 2,
      waveColor: "transparent",
      progressColor: "#3b82f6",
      cursorColor: "transparent",
      cursorWidth: 0,
      barWidth: 0,
      barGap: 0,
      normalize: true,
      backend: "MediaElement",
      peaks: [new Float32Array([0, 0])],
      url: convertFileSrc(track.path),
    });

    this.ws.on("ready", () => {
      this.loading.set(false);
      this.duration.set(this.ws!.getDuration());
      this.ws!.setVolume(this.volume / 100);
      this.ws!.play();
    });
    this.ws.on("play", () => this.playing.set(true));
    this.ws.on("pause", () => this.playing.set(false));
    this.ws.on("finish", () => this.playing.set(false));
    this.ws.on("timeupdate", (t) => {
      if (!this.isSeeking) this.currentTime.set(t);
    });
    this.ws.on("error", (e) => {
      this.loading.set(false);
      this.error.set(`No se pudo reproducir: ${e}`);
    });
  }

  togglePlay(): void {
    this.ws?.playPause();
  }

  async openExternal(): Promise<void> {
    const t = this.track();
    if (!t) return;
    try {
      await openPath(t.path);
    } catch (e) {
      this.error.set(`No se pudo abrir: ${e}`);
    }
  }

  onVolumeChange(value: number): void {
    this.ws?.setVolume(value / 100);
  }

  formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
}
