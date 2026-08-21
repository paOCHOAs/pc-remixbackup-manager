import { Injectable, signal } from "@angular/core";
import { Track } from "../models/track.model";

@Injectable({ providedIn: "root" })
export class PlayerService {
  /** equal: () => false so replaying the same track re-triggers effects. */
  readonly currentTrack = signal<Track | null>(null, { equal: () => false });

  play(track: Track): void {
    this.currentTrack.set(track);
  }
}
