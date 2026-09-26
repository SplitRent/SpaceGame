import type * as THREE from 'three';

/**
 * Anything the player can interact with. The interaction system raycasts against
 * `object` (and its children) and shows `prompt()` when `available()` is true.
 * `interact()` must be safe to call repeatedly; state changes go through the Store
 * (which is idempotent where it matters).
 */
export interface Interactable {
  id: string;
  object: THREE.Object3D;
  /** Max interaction distance from the player's head (m). */
  range?: number;
  /** Text like "Open", "Install fuel cell". Return null to hide. */
  prompt(): string | null;
  /** Secondary line (requirement hints). */
  detail?(): string | null;
  available?(): boolean;
  interact(): void;
  /** Kind affects UI glyph & camera behaviour. */
  kind?: 'use' | 'panel' | 'talk' | 'pickup' | 'door' | 'seat' | 'mine' | 'build';
}
