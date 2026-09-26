/**
 * GameState is the single serializable source of truth for everything meaningful in the game.
 * Scenes are projections of this state. Mutate only through Store.dispatch / effects.
 *
 * RULE: this structure must stay plain JSON (no class instances, no Maps, no functions).
 */

export const STATE_VERSION = 1;

export type Vec3 = [number, number, number];
export type FlagValue = boolean | number | string;

export type CameraView = 'first' | 'back' | 'front';

export interface ItemStack {
  itemId: string;
  qty: number;
}

export interface Container {
  /** Max number of distinct stacks. Quest items ignore this limit. */
  slots: number;
  stacks: ItemStack[];
}

export type QuestStatus = 'active' | 'completed' | 'failed';

export interface QuestState {
  status: QuestStatus;
  stage: string;
  /** Objective progress for the current stage (objectiveId -> count/boolean as 0|1). */
  progress: Record<string, number>;
  /** Stages completed so far, in order. */
  history: string[];
}

export interface NpcState {
  alive: boolean;
  injured: boolean;
  /** -100..100 */
  relationship: number;
  /** Dialogue memory: nodeId/topic -> times seen. */
  memory: Record<string, number>;
}

export interface ShipSystemState {
  /** 0..1 physical condition. */
  condition: number;
  online: boolean;
  /** Completed repair steps for this system. */
  steps: Record<string, boolean>;
}

export type ShipParking =
  | { kind: 'surface'; locationId: string }
  | { kind: 'space'; locationId: string; position: Vec3; quat: [number, number, number, number] }
  | { kind: 'docked'; locationId: string; portId: string };

export interface ShipState {
  name: string;
  systems: Record<string, ShipSystemState>;
  /** 0..1 */
  hull: number;
  /** kg of LOX/LH2 propellant */
  propellant: number;
  /** degrees of list after the crash (0 when leveled) */
  listDeg: number;
  parking: ShipParking;
}

export interface BasePadState {
  moduleId: string | null;
  built: boolean;
}

export interface BaseState {
  pads: Record<string, BasePadState>;
  /** Battery charge in kWh */
  batteryKWh: number;
}

export interface PersistentEntityState {
  [key: string]: FlagValue;
}

export interface DynamicObject {
  uid: string;
  kind: 'cache' | 'droppedItem';
  position: Vec3;
  items: ItemStack[];
}

export interface LocationPersistentState {
  entities: Record<string, PersistentEntityState>;
  dynamic: DynamicObject[];
  visited: boolean;
}

export interface PlayerState {
  name: string;
  locationId: string;
  /** Spawn point id used when position is missing/invalid. */
  spawnId: string;
  position: Vec3 | null;
  yaw: number;
  health: number;
  oxygen: number;
  suitPower: number;
  /** Suit capacities (upgradeable). */
  oxygenMax: number;
  suitPowerMax: number;
  scannerTier: number;
  cameraView: CameraView;
  respawn: { locationId: string; spawnId: string };
}

export interface GameState {
  version: number;
  meta: {
    createdAt: number;
    playtimeSec: number;
    seed: number;
    /** Human readable act/chapter label. */
    chapter: string;
  };
  flags: Record<string, FlagValue>;
  player: PlayerState;
  inventories: Record<string, Container>;
  quests: Record<string, QuestState>;
  /** Idempotency ledger: reward/grant ids that have been applied. */
  granted: Record<string, true>;
  world: Record<string, LocationPersistentState>;
  npcs: Record<string, NpcState>;
  ship: ShipState;
  base: BaseState;
  universe: { discovered: Record<string, true>; unlocked: Record<string, true> };
  database: Record<string, { at: number }>;
  research: Record<string, { status: 'active' | 'done'; progress: number }>;
  /** Seconds of in-game time since start. Drives day/night etc. */
  clock: number;
  /** Monotonic counter for generating unique ids of dynamic objects. */
  uidCounter: number;
}

export function emptyLocationState(): LocationPersistentState {
  return { entities: {}, dynamic: [], visited: false };
}
