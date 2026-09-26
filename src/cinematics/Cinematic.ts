import * as THREE from 'three';
import type { Game } from '../Game';
import { ui } from '../ui/uiState';

export interface CamKey {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
}

export interface Shot {
  duration: number;
  /** Camera keys: from → to (world space, or functions evaluated each frame for tracking shots). */
  from?: CamKey | (() => CamKey);
  to?: CamKey | (() => CamKey);
  ease?: (t: number) => number;
  subtitle?: { speaker: string; text: string } | null;
  onStart?: () => void;
  /** Called every frame with shot-local progress 0..1 and dt. */
  onUpdate?: (t: number, dt: number) => void;
  shake?: number;
}

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => t * t * (3 - 2 * t),
  out: (t: number) => 1 - (1 - t) * (1 - t),
  in: (t: number) => t * t,
};

/**
 * Plays a list of camera shots with subtitles, letterboxing and optional skipping.
 * IMPORTANT: gameplay state changes belong in `onEnd`, which runs exactly once whether
 * the sequence completes or is skipped — so skipping always yields identical state.
 */
export class CinematicPlayer {
  private shots: Shot[] = [];
  private index = -1;
  private t = 0;
  private resolve: (() => void) | null = null;
  private onEnd: (() => void | Promise<void>) | null = null;
  private skippable = true;
  private ended = false;
  private remove: (() => void) | null = null;

  constructor(private game: Game) {}

  get playing(): boolean {
    return this.index >= 0 && !this.ended;
  }

  play(shots: Shot[], opts: { skippable?: boolean; letterbox?: boolean; onEnd?: () => void | Promise<void> } = {}): Promise<void> {
    this.shots = shots;
    this.index = -1;
    this.ended = false;
    this.skippable = opts.skippable ?? true;
    this.onEnd = opts.onEnd ?? null;
    const game = this.game;
    game.story.cinematicActive = true;
    ui.letterbox.value = opts.letterbox ?? true;
    game.input.push('cinematic');
    game.interaction.reset();
    this.next();
    this.remove = game.addHook((dt) => this.update(dt));
    return new Promise((r) => (this.resolve = r));
  }

  private next(): void {
    this.index++;
    this.t = 0;
    const s = this.shots[this.index];
    if (!s) {
      void this.finish();
      return;
    }
    s.onStart?.();
    if (s.subtitle) {
      // Hold the shot long enough for the line to be spoken.
      s.duration = Math.max(s.duration, this.game.voices.duration(s.subtitle.speaker, s.subtitle.text) + 0.2);
    }
    if (s.subtitle !== undefined) ui.subtitle.value = s.subtitle;
    if (s.shake) this.game.cam.addShake(s.shake);
  }

  private update(dt: number): boolean {
    if (this.ended) return false;
    const game = this.game;
    if (this.skippable && (game.input.justPressed('skip', 'cinematic') || game.input.justPressed('pause', 'cinematic'))) {
      this.skip();
      return false;
    }
    const s = this.shots[this.index];
    if (!s) return false;
    this.t += dt;
    const k = Math.min(1, this.t / s.duration);
    s.onUpdate?.(k, dt);
    if (s.from) {
      const a = typeof s.from === 'function' ? s.from() : s.from;
      const b = s.to ? (typeof s.to === 'function' ? s.to() : s.to) : a;
      const e = (s.ease ?? ease.inOut)(k);
      const pos = a.pos.clone().lerp(b.pos, e);
      const target = a.target.clone().lerp(b.target, e);
      const fov = (a.fov ?? 60) + ((b.fov ?? a.fov ?? 60) - (a.fov ?? 60)) * e;
      game.cam.setOverride({ position: pos, target, fov });
      game.cam.cinematic = true;
    }
    if (k >= 1) this.next();
    return !this.ended;
  }

  skip(): void {
    if (this.ended) return;
    this.game.voices.stop();
    // Run remaining onStart hooks that only set up visuals is unnecessary; state lives in onEnd.
    void this.finish();
  }

  private async finish(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.remove?.();
    const game = this.game;
    ui.subtitle.value = null;
    ui.letterbox.value = false;
    game.cam.setOverride(null);
    game.cam.cinematic = false;
    game.input.pop('cinematic');
    game.story.cinematicActive = false;
    const end = this.onEnd;
    this.onEnd = null;
    if (end) await end();
    this.index = -1;
    this.resolve?.();
    this.resolve = null;
  }
}
