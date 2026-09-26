import type * as THREE from 'three';
import type { Game } from '../Game';
import type { PanelController } from './PanelController';

/**
 * Custom first-person panels that data-driven locations can open by name
 * (`interact: { panel: 'glyph' }`). Registered by the modules that implement them.
 */
type Factory = (game: Game, anchor: THREE.Object3D) => PanelController;
const PANELS = new Map<string, Factory>();

export function registerPanel(name: string, factory: Factory): void {
  PANELS.set(name, factory);
}

export function openNamedPanel(game: Game, name: string, anchor: THREE.Object3D): boolean {
  const f = PANELS.get(name);
  if (!f) {
    console.warn('[panels] unknown panel', name);
    return false;
  }
  game.openPanel(f(game, anchor));
  return true;
}
