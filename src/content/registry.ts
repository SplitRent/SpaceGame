import type {
  BarkDef,
  BaseModuleDef,
  CelestialBodyDef,
  DatabaseEntryDef,
  DialogueDef,
  ItemDef,
  NpcDef,
  QuestDef,
  RecipeDef,
  ShipSystemDef,
} from './types';

export interface ContentRegistry {
  items: Record<string, ItemDef>;
  recipes: Record<string, RecipeDef>;
  quests: Record<string, QuestDef>;
  dialogues: Record<string, DialogueDef>;
  barks: BarkDef[];
  npcs: Record<string, NpcDef>;
  shipSystems: Record<string, ShipSystemDef>;
  baseModules: Record<string, BaseModuleDef>;
  database: Record<string, DatabaseEntryDef>;
  bodies: Record<string, CelestialBodyDef>;
}

export function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const it of list) {
    if (out[it.id]) throw new Error(`Duplicate content id: ${it.id}`);
    out[it.id] = it;
  }
  return out;
}
