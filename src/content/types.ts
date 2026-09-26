import type { FlagValue, QuestStatus } from '../state/GameState';

/* ------------------------------------------------------------------ */
/* Conditions / Effects DSL — shared by quests, dialogue, interactions, */
/* NPC presence, recipes and research.                                   */
/* ------------------------------------------------------------------ */

export type Condition =
  | { flag: string; eq?: FlagValue; gte?: number }
  | { notFlag: string }
  | { hasItem: string; qty?: number; in?: string }
  | { quest: string; status?: QuestStatus; stage?: string }
  | { questDone: string }
  | { questActive: string }
  | { system: string; online?: boolean; step?: string }
  | { module: string }
  | { scanned: string }
  | { discovered: string }
  | { propellant: number }
  | { npcAlive: string }
  | { relationship: { npc: string; gte: number } }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { always: true }
  | { never: true };

export type Effect =
  | { setFlag: string; value?: FlagValue }
  | { addFlag: string; value: number }
  | { give: string; qty?: number; to?: string }
  | { take: string; qty?: number; from?: string }
  | { startQuest: string }
  | { setStage: { quest: string; stage: string } }
  | { completeQuest: string }
  | { repairStep: { system: string; step: string } }
  | { systemOnline: { system: string; online: boolean } }
  | { relationship: { npc: string; delta: number } }
  | { discover: string }
  | { unlock: string }
  | { notify: string }
  | { grant: string; effects: Effect[] }
  | { setEntity: { location: string; entity: string; key: string; value: FlagValue } }
  | { upgrade: { stat: 'oxygenMax' | 'suitPowerMax' | 'scannerTier'; value: number } }
  | { heal: number }
  | { refillOxygen: true }
  | { story: string }
  /** Open a readable log/document (terminal, recorder, carving). */
  | { log: { title: string; text: string } }
  /** Move the player to another location/spawn (doors, lifts, hatches). */
  | { travel: { location: string; spawn: string; label?: string } };

/* ------------------------------ Items ------------------------------ */

export type ItemCategory = 'resource' | 'component' | 'consumable' | 'quest' | 'tool';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  /** Max per stack. Quest items stack to 1 typically. */
  stack: number;
  /** Colour used by UI icon swatches (hex). */
  color: string;
  /** Short glyph for the icon (1-2 chars). */
  glyph: string;
  /** Consumable use effects. */
  use?: Effect[];
  /** Base trade value in credits (0 = not tradable). */
  value?: number;
  /** Scientific note displayed in inventory. */
  science?: string;
}

/* ----------------------------- Crafting ---------------------------- */

export type Facility = 'field' | 'fabricator' | 'workbench' | 'lab';

export interface RecipeDef {
  id: string;
  output: { item: string; qty: number };
  inputs: { item: string; qty: number }[];
  /** Facilities where this can be crafted. */
  facility: Facility[];
  /** Seconds to craft (for feedback only; crafting is instant after the timer). */
  time: number;
  requires?: Condition;
}

/* ------------------------------ Quests ----------------------------- */

export interface ObjectiveDef {
  id: string;
  text: string;
  /** Objective is complete while this condition holds. */
  done: Condition;
  optional?: boolean;
  /** Optional marker target (entity id in a location) for "markers" navigation assist. */
  marker?: { location: string; entity: string };
}

export interface QuestStageDef {
  id: string;
  /** Journal text describing the situation. */
  journal: string;
  objectives: ObjectiveDef[];
  /** Applied once when all non-optional objectives are complete. */
  onComplete?: Effect[];
  /** Next stage id, or 'complete'. */
  next: string | 'complete';
}

export interface QuestDef {
  id: string;
  title: string;
  kind: 'main' | 'side' | 'crew';
  giver?: string;
  summary: string;
  stages: QuestStageDef[];
  onStart?: Effect[];
  /** Applied once on completion (through the grant ledger). */
  rewards?: Effect[];
  /** Automatically start when this condition becomes true. */
  autoStart?: Condition;
}

/* ----------------------------- Dialogue ---------------------------- */

export interface DialogueChoice {
  text: string;
  to: string | 'end';
  if?: Condition;
  effects?: Effect[];
  /** Hide after chosen once (tracked in npc memory). */
  once?: boolean;
}

export interface DialogueNode {
  id: string;
  speaker: string; // npc id or 'player' or 'narrator'
  text: string;
  effects?: Effect[];
  choices?: DialogueChoice[];
  /** Auto-continue to this node when no choices. */
  next?: string | 'end';
}

export interface DialogueDef {
  id: string;
  npc: string;
  /** Entries are checked in order; the first whose condition passes is the start node. */
  entries: { if?: Condition; node: string }[];
  nodes: Record<string, DialogueNode>;
}

export interface BarkDef {
  id: string;
  npc: string;
  text: string;
  if?: Condition;
  /** Location id where this bark can play (optional). */
  location?: string;
  once?: boolean;
  /** Another npc responding (banter). */
  reply?: { npc: string; text: string };
}

/* ------------------------------- NPCs ------------------------------ */

export interface NpcPresenceRule {
  if?: Condition;
  location: string;
  spot: string;
  activity: 'work' | 'idle' | 'sit' | 'sleep' | 'injured' | 'patrol';
  /** Optional patrol spots for patrol activity. */
  route?: string[];
  /** Only during this fraction window of the local day cycle [start, end) (wraps). */
  schedule?: [number, number];
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  bio: string;
  suitColor: string;
  accentColor: string;
  skinTone: string;
  hairColor: string;
  /** Height in metres. */
  height: number;
  dialogue: string;
  /** First matching rule decides where the npc is. Missing = absent. */
  presence: NpcPresenceRule[];
}

/* ---------------------------- Ship systems ------------------------- */

export interface RepairStepDef {
  id: string;
  label: string;
  /** Where the step is performed (for journal hints). */
  where: string;
  requires?: Condition;
  consumes?: { item: string; qty: number }[];
}

export interface ShipSystemDef {
  id: string;
  name: string;
  group: 'power' | 'life' | 'comms' | 'nav' | 'propulsion' | 'structure';
  description: string;
  steps: RepairStepDef[];
  /** Other systems that must be online for this to be brought online. */
  dependsOn: string[];
  /** Power draw when online (kW). Negative = generation. */
  powerKW: number;
}

/* ---------------------------- Base modules ------------------------- */

export interface BaseModuleDef {
  id: string;
  name: string;
  description: string;
  cost: { item: string; qty: number }[];
  /** kW; negative = generation (solar generation scales with sunlight). */
  powerKW: number;
  requires?: Condition;
  /** Facility provided (for crafting). */
  facility?: Facility;
  storageSlots?: number;
}

/* ----------------------------- Database ---------------------------- */

export interface DatabaseEntryDef {
  id: string;
  title: string;
  category: 'geology' | 'astronomy' | 'technology' | 'anomaly' | 'history' | 'biology';
  text: string;
  /** Scanner tier needed. */
  tier: number;
  /** Items granted the first time this is scanned. */
  yields?: { item: string; qty: number }[];
  onScan?: Effect[];
}

/* ------------------------- Celestial bodies ------------------------ */

export type BodyPlayMode = 'landable' | 'orbital' | 'stationHost' | 'backdrop';

export interface CelestialBodyDef {
  id: string;
  name: string;
  kind: 'star' | 'planet' | 'dwarf' | 'moon' | 'structure';
  /** Star system (default 'sol'). */
  system?: 'sol' | 'vesper';
  parent?: string;
  /** km */
  radiusKm: number;
  /** m/s^2 */
  gravity: number;
  /** semi-major axis in AU (planets) or km (moons) */
  orbit: number;
  axialTiltDeg: number;
  /** hours; negative = retrograde */
  rotationHours: number;
  atmosphere: string;
  playMode: BodyPlayMode;
  /** Short visual reference summary guiding the art. */
  visual: string;
  facts: string[];
}
