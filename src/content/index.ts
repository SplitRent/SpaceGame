import { byId, type ContentRegistry } from './registry';
import { ITEMS } from './items';
import { RECIPES } from './recipes';
import { QUESTS } from './quests';
import { DIALOGUES, BARKS } from './dialogue';
import { NPCS } from './npcs';
import { SHIP_SYSTEMS } from './shipSystems';
import { BASE_MODULES } from './baseModules';
import { DATABASE } from './database';
import { BODIES } from './bodies';

/** The complete, validated content registry. */
export const CONTENT: ContentRegistry = {
  items: byId(ITEMS),
  recipes: byId(RECIPES),
  quests: byId(QUESTS),
  dialogues: byId(DIALOGUES),
  barks: BARKS,
  npcs: byId(NPCS),
  shipSystems: byId(SHIP_SYSTEMS),
  baseModules: byId(BASE_MODULES),
  database: byId(DATABASE),
  bodies: byId(BODIES),
};
