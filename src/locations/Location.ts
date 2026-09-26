import * as THREE from 'three';
import { Scope } from '../engine/Scope';
import { PhysicsWorld } from '../physics/Physics';
import type { Game } from '../Game';
import type { Interactable } from '../interaction/Interactable';
import { ParticlePool } from '../render/particles';

/** Something the multi-tool can work on (mining node, weld point, cut panel). */
export interface ToolTarget {
  id: string;
  object: THREE.Object3D;
  action: 'mine' | 'weld' | 'cut';
  label: string;
  range?: number;
  available(): boolean;
  /** Seconds of continuous work per completion. */
  workTime: number;
  /** Called when a work cycle completes (mining yields, weld done...). */
  onComplete(): void;
  /** Optional detail text (remaining ore etc.). */
  detail?(): string | null;
}

/** Something the scanner can identify. `entry` is a database entry id. */
export interface Scannable {
  entry: string;
  object: THREE.Object3D;
  range?: number;
}

export type Atmosphere = 'vacuum' | 'breathable' | 'thin-co2' | 'toxic';

export interface LocationEnv {
  gravity: number;
  atmosphere: Atmosphere;
  /** Ambient temperature in °C (surface; locations may compute dynamically). */
  temperatureC: number;
  /** Radiation dose multiplier (1 = nominal space background). */
  radiation: number;
  /** Ambience profile id for the audio system. */
  ambience: 'vacuum' | 'ship' | 'ship-dead' | 'station' | 'space' | 'cinematic';
}

export interface SpawnPoint {
  id: string;
  position: THREE.Vector3;
  yaw: number;
}

export interface Portal {
  id: string;
  /** Target location and spawn. */
  to: { location: string; spawn: string };
  label: string;
}

export type LocationMode = 'foot' | 'flight' | 'cinematic';

/**
 * A Location is a bounded, streamable 3D place (surface region, ship interior, station,
 * space zone, cinematic stage). It is built from content + persistent state, owns its
 * scene/physics/scope, and is fully disposed when the player leaves.
 */
export abstract class Location {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly mode: LocationMode;
  readonly scene = new THREE.Scene();
  readonly scope: Scope;
  physics: PhysicsWorld;
  env!: LocationEnv;
  spawns: Record<string, SpawnPoint> = {};
  interactables: Interactable[] = [];
  toolTargets: ToolTarget[] = [];
  scannables: Scannable[] = [];
  readonly particles = new ParticlePool(1500);
  readonly glowParticles = new ParticlePool(600, true);
  /** Axis-aligned play bounds (player is clamped/respawned outside). */
  bounds = new THREE.Box3(new THREE.Vector3(-1e4, -200, -1e4), new THREE.Vector3(1e4, 5000, 1e4));
  /** Minimum Y before the player is considered fallen out of the world. */
  killY = -200;

  constructor(protected game: Game, gravity: number) {
    this.scope = game.scope.child(`location`);
    this.physics = new PhysicsWorld(gravity);
    this.scope.add(() => this.physics.free());
    this.scope.add(() => disposeScene(this.scene));
    this.scene.add(this.particles.points, this.glowParticles.points);
  }

  /** Build geometry, colliders and entities from content + state. */
  abstract build(): Promise<void>;

  /** Per-frame update (after player update). */
  update(_dt: number): void {}

  /** Called when the store changes; locations refresh their state-driven visuals. */
  onStateChanged(): void {}

  /** Whether the air at the player position is breathable (helmet can be off). */
  isPressurized(_pos: THREE.Vector3): boolean {
    return this.env.atmosphere === 'breathable';
  }

  /** Ambient temperature at a position (°C). */
  temperatureAt(_pos: THREE.Vector3): number {
    return this.env.temperatureC;
  }

  /** Is a position inside a hazard zone (radiation, extreme cold)? */
  hazardAt(_pos: THREE.Vector3): { cold?: number; radiation?: number } | null {
    return null;
  }

  /** Called after the player has spawned. */
  onEnter(): void {}

  /** Called before disposal. */
  onExit(): void {}

  registerInteractable(i: Interactable): void {
    this.interactables.push(i);
  }

  removeInteractable(i: Interactable): void {
    const idx = this.interactables.indexOf(i);
    if (idx >= 0) this.interactables.splice(idx, 1);
  }

  dispose(): void {
    this.onExit();
    this.interactables.length = 0;
    this.toolTargets.length = 0;
    this.scannables.length = 0;
    this.scope.dispose();
  }
}

/** Dispose all geometries/materials/textures reachable from a scene. */
export function disposeScene(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => mats.add(x));
    else if (mat) mats.add(mat);
  });
  for (const g of geos) if (!(g as any).userData?.shared) g.dispose();
  for (const m of mats) {
    if ((m as any).userData?.shared) continue;
    for (const v of Object.values(m)) {
      if (v instanceof THREE.Texture && !(v as any).userData?.shared) v.dispose();
    }
    m.dispose();
  }
  root.clear();
}
