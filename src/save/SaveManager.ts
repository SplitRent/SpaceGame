import { z } from 'zod';
import { get, set, del, keys } from 'idb-keyval';
import { STATE_VERSION, type GameState } from '../state/GameState';
import { migrate } from './migrations';

/**
 * Save files wrap a GameState snapshot with metadata. The state is validated against
 * a structural schema and migrated from older versions before use. Writes are atomic
 * (written to a temp key, verified, then swapped in).
 */

export const SLOT_IDS = ['auto1', 'auto2', 'quick', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const flag = z.union([z.boolean(), z.number(), z.string()]);
const stack = z.object({ itemId: z.string(), qty: z.number().int().nonnegative() });

export const GameStateSchema = z.object({
  version: z.number().int(),
  meta: z.object({ createdAt: z.number(), playtimeSec: z.number(), seed: z.number(), chapter: z.string() }),
  flags: z.record(z.string(), flag),
  player: z.object({
    name: z.string(),
    locationId: z.string(),
    spawnId: z.string(),
    position: vec3.nullable(),
    yaw: z.number(),
    health: z.number(),
    oxygen: z.number(),
    suitPower: z.number(),
    oxygenMax: z.number(),
    suitPowerMax: z.number(),
    scannerTier: z.number(),
    cameraView: z.enum(['first', 'back', 'front']),
    respawn: z.object({ locationId: z.string(), spawnId: z.string() }),
  }),
  inventories: z.record(z.string(), z.object({ slots: z.number(), stacks: z.array(stack) })),
  quests: z.record(
    z.string(),
    z.object({
      status: z.enum(['active', 'completed', 'failed']),
      stage: z.string(),
      progress: z.record(z.string(), z.number()),
      history: z.array(z.string()),
    }),
  ),
  granted: z.record(z.string(), z.literal(true)),
  world: z.record(
    z.string(),
    z.object({
      entities: z.record(z.string(), z.record(z.string(), flag)),
      dynamic: z.array(
        z.object({ uid: z.string(), kind: z.enum(['cache', 'droppedItem']), position: vec3, items: z.array(stack) }),
      ),
      visited: z.boolean(),
    }),
  ),
  npcs: z.record(
    z.string(),
    z.object({ alive: z.boolean(), injured: z.boolean(), relationship: z.number(), memory: z.record(z.string(), z.number()) }),
  ),
  ship: z.object({
    name: z.string(),
    systems: z.record(z.string(), z.object({ condition: z.number(), online: z.boolean(), steps: z.record(z.string(), z.boolean()) })),
    hull: z.number(),
    propellant: z.number(),
    listDeg: z.number(),
    parking: z.union([
      z.object({ kind: z.literal('surface'), locationId: z.string() }),
      z.object({ kind: z.literal('space'), locationId: z.string(), position: vec3, quat: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
      z.object({ kind: z.literal('docked'), locationId: z.string(), portId: z.string() }),
      z.object({ kind: z.literal('transit'), locationId: z.literal('space.transit'), from: z.string(), to: z.string(), elapsed: z.number(), duration: z.number() }),
    ]),
  }),
  base: z.object({
    pads: z.record(z.string(), z.object({ moduleId: z.string().nullable(), built: z.boolean() })),
    batteryKWh: z.number(),
  }),
  universe: z.object({ discovered: z.record(z.string(), z.literal(true)), unlocked: z.record(z.string(), z.literal(true)) }),
  database: z.record(z.string(), z.object({ at: z.number() })),
  research: z.record(z.string(), z.object({ status: z.enum(['active', 'done']), progress: z.number() })),
  clock: z.number(),
  uidCounter: z.number(),
});

export const SaveFileSchema = z.object({
  format: z.literal('lantern-save'),
  schemaVersion: z.number().int(),
  gameVersion: z.string(),
  slot: z.string(),
  savedAt: z.number(),
  label: z.string(),
  meta: z.object({ location: z.string(), chapter: z.string(), objective: z.string().nullable(), playtimeSec: z.number() }),
  checksum: z.string(),
  state: z.unknown(),
});

export type SaveFile = z.infer<typeof SaveFileSchema> & { state: GameState };

export interface SaveSummary {
  slot: string;
  label: string;
  savedAt: number;
  meta: SaveFile['meta'];
}

export const GAME_VERSION = '0.1.0';
const PREFIX = 'lantern:save:';

export function checksum(text: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function buildSaveFile(state: GameState, slot: string, label: string, objective: string | null, locationName: string): SaveFile {
  const snapshot = structuredClone(state);
  const body = JSON.stringify(snapshot);
  return {
    format: 'lantern-save',
    schemaVersion: STATE_VERSION,
    gameVersion: GAME_VERSION,
    slot,
    savedAt: Date.now(),
    label,
    meta: { location: locationName, chapter: snapshot.meta.chapter, objective, playtimeSec: snapshot.meta.playtimeSec },
    checksum: checksum(body),
    state: snapshot,
  };
}

export type ParseResult = { ok: true; state: GameState; file: SaveFile } | { ok: false; error: string };

/** Validate, verify checksum, migrate and schema-check a raw save object. */
export function parseSaveFile(raw: unknown): ParseResult {
  const env = SaveFileSchema.safeParse(raw);
  if (!env.success) return { ok: false, error: 'Not a valid save file.' };
  const file = env.data as SaveFile;
  const body = JSON.stringify(file.state);
  if (checksum(body) !== file.checksum) return { ok: false, error: 'Save file is corrupted (checksum mismatch).' };
  if (file.schemaVersion > STATE_VERSION) return { ok: false, error: 'Save was made with a newer version of the game.' };
  let migrated: unknown;
  try {
    migrated = migrate(structuredClone(file.state), file.schemaVersion);
  } catch (e) {
    return { ok: false, error: `Save migration failed: ${(e as Error).message}` };
  }
  const parsed = GameStateSchema.safeParse(migrated);
  if (!parsed.success) {
    console.error('[Save] schema errors', parsed.error.issues.slice(0, 10));
    return { ok: false, error: 'Save data is incomplete or invalid.' };
  }
  return { ok: true, state: parsed.data as GameState, file };
}

/** Storage backend: IndexedDB, falling back to memory if unavailable (e.g. private mode). */
class Storage {
  private memory = new Map<string, unknown>();
  private idbOk = true;
  get available(): boolean {
    return this.idbOk;
  }
  async get(key: string): Promise<unknown> {
    if (this.idbOk) {
      try {
        return await get(key);
      } catch {
        this.idbOk = false;
      }
    }
    return this.memory.get(key);
  }
  async set(key: string, value: unknown): Promise<void> {
    if (this.idbOk) {
      try {
        await set(key, value);
        return;
      } catch {
        this.idbOk = false;
      }
    }
    this.memory.set(key, value);
  }
  async del(key: string): Promise<void> {
    if (this.idbOk) {
      try {
        await del(key);
      } catch {
        this.idbOk = false;
      }
    }
    this.memory.delete(key);
  }
  async keys(): Promise<string[]> {
    if (this.idbOk) {
      try {
        return (await keys()).map(String);
      } catch {
        this.idbOk = false;
      }
    }
    return [...this.memory.keys()];
  }
}

export class SaveManager {
  private storage = new Storage();
  private writing = false;

  get persistent(): boolean {
    return this.storage.available;
  }

  async write(file: SaveFile): Promise<void> {
    if (this.writing) throw new Error('A save is already in progress.');
    this.writing = true;
    try {
      const key = PREFIX + file.slot;
      const tmp = key + ':tmp';
      await this.storage.set(tmp, file);
      const back = await this.storage.get(tmp);
      const check = parseSaveFile(back);
      if (!check.ok) throw new Error(`Save verification failed: ${check.error}`);
      await this.storage.set(key, file);
      await this.storage.del(tmp);
    } finally {
      this.writing = false;
    }
  }

  async read(slot: string): Promise<ParseResult> {
    const raw = await this.storage.get(PREFIX + slot);
    if (!raw) return { ok: false, error: 'Empty slot.' };
    return parseSaveFile(raw);
  }

  async remove(slot: string): Promise<void> {
    await this.storage.del(PREFIX + slot);
  }

  async list(): Promise<SaveSummary[]> {
    const out: SaveSummary[] = [];
    for (const k of await this.storage.keys()) {
      if (!k.startsWith(PREFIX) || k.endsWith(':tmp')) continue;
      const raw = (await this.storage.get(k)) as SaveFile | undefined;
      if (!raw || raw.format !== 'lantern-save') continue;
      out.push({ slot: raw.slot, label: raw.label, savedAt: raw.savedAt, meta: raw.meta });
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  async latest(): Promise<SaveSummary | null> {
    return (await this.list())[0] ?? null;
  }

  /** Rotating autosave slot. */
  async nextAutoSlot(): Promise<SlotId> {
    const list = await this.list();
    const a1 = list.find((s) => s.slot === 'auto1');
    const a2 = list.find((s) => s.slot === 'auto2');
    if (!a1) return 'auto1';
    if (!a2) return 'auto2';
    return a1.savedAt <= a2.savedAt ? 'auto1' : 'auto2';
  }

  exportJson(file: SaveFile): string {
    return JSON.stringify(file);
  }
}
