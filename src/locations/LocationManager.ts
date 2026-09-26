import * as THREE from 'three';
import type { Game } from '../Game';
import type { Location } from './Location';
import { LOCATION_REGISTRY } from './registry';
import { ui } from '../ui/uiState';

export interface TravelTarget {
  location: string;
  spawn?: string;
  position?: THREE.Vector3;
  yaw?: number;
}

export interface TravelOptions {
  /** Text shown while loading (diegetic: "Cycling airlock…"). */
  label?: string;
  fadeColor?: string;
  fadeTime?: number;
  /** Keep screen black at the end (caller will fade in, e.g. after a cinematic). */
  holdBlack?: boolean;
}

type Phase = 'idle' | 'exiting' | 'loading' | 'entering';

/**
 * Strict transition state machine: idle → exiting → loading → entering → idle.
 * Only one transition can be in flight; requests during a transition are rejected
 * (and logged), so "transition twice" bugs are impossible by construction.
 * Saving is blocked while not idle.
 */
export class LocationManager {
  current: Location | null = null;
  phase: Phase = 'idle';
  private epoch = 0;

  constructor(private game: Game) {}

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  async travel(target: TravelTarget, opts: TravelOptions = {}): Promise<boolean> {
    if (this.busy) {
      console.warn('[LocationManager] travel rejected: transition in progress', target);
      return false;
    }
    const entry = LOCATION_REGISTRY[target.location];
    if (!entry) {
      console.error('[LocationManager] unknown location', target.location);
      return false;
    }
    const game = this.game;
    const epoch = ++this.epoch;
    game.input.push('cinematic');
    try {
      this.phase = 'exiting';
      ui.fadeColor.value = opts.fadeColor ?? '#000';
      await game.fadeTo(1, opts.fadeTime ?? 0.45);
      ui.loading.value = opts.label ?? entry.loadingText ?? `Travelling to ${entry.name}…`;
      game.onBeforeLocationExit();
      if (this.current) {
        game.player.detach();
        this.current.dispose();
        this.current = null;
      }
      this.phase = 'loading';
      // Yield so the loading label paints before heavy generation work.
      await nextFrame();
      await nextFrame();
      const loc = await entry.create(game);
      await loc.build();
      if (epoch !== this.epoch) {
        loc.dispose();
        return false;
      }
      this.current = loc;
      this.phase = 'entering';
      game.onLocationEntered(loc, target);
      ui.loading.value = null;
      if (!opts.holdBlack) await game.fadeTo(0, opts.fadeTime ?? 0.6);
      return true;
    } catch (err) {
      console.error('[LocationManager] travel failed', err);
      ui.loading.value = `Failed to load ${entry.name}. See console.`;
      return false;
    } finally {
      this.phase = 'idle';
      game.input.pop('cinematic');
    }
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
