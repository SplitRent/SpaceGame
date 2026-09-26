import type { ContentRegistry } from '../content/registry';
import type { GameState } from './GameState';
import { createNewGameState } from './newGame';

/**
 * Content reconciliation after loading: saves made before new content was added get
 * sensible defaults for new systems/NPCs/pads, and references to removed content are
 * dropped (logged) instead of crashing. Keeps old saves loadable as the game grows.
 */
export function reconcileState(state: GameState, content: ContentRegistry): void {
  const fresh = createNewGameState(content, state.player.name, state.meta.seed);
  for (const [id, sys] of Object.entries(fresh.ship.systems)) state.ship.systems[id] ??= sys;
  for (const [id, npc] of Object.entries(fresh.npcs)) state.npcs[id] ??= npc;
  for (const [id, pad] of Object.entries(fresh.base.pads)) state.base.pads[id] ??= pad;
  for (const [id, inv] of Object.entries(fresh.inventories)) state.inventories[id] ??= inv;
  for (const id of Object.keys(state.quests)) {
    if (!content.quests[id]) {
      console.warn('[reconcile] dropping unknown quest', id);
      delete state.quests[id];
      continue;
    }
    const q = state.quests[id];
    if (!content.quests[id].stages.some((s) => s.id === q.stage)) {
      console.warn('[reconcile] quest stage missing, resetting to first stage', id, q.stage);
      q.stage = content.quests[id].stages[0].id;
    }
  }
  for (const inv of Object.values(state.inventories)) {
    inv.stacks = inv.stacks.filter((s) => {
      if (content.items[s.itemId]) return true;
      console.warn('[reconcile] dropping unknown item', s.itemId);
      return false;
    });
  }
  for (const pad of Object.values(state.base.pads)) {
    if (pad.moduleId && !content.baseModules[pad.moduleId]) {
      pad.moduleId = null;
      pad.built = false;
    }
  }
}
