import type { Game } from '../Game';
import { CONTENT } from '../content';
import { createNewGameState } from '../state/newGame';
import type { GameState } from '../state/GameState';

/**
 * Dev/test scenarios: jump straight to a progression point (?start=<id>). Each scenario
 * produces a *valid* GameState by applying the same flags/effects progression would.
 */
export function scenarioState(id: string): GameState {
  const s = createNewGameState(CONTENT, 'Sam Reyes', 1969);
  s.flags.crashed = true;
  s.flags['base.unlocked'] = true;
  s.meta.chapter = 'Act 1 — Stranded';
  s.clock = 900;
  s.player.respawn = { locationId: 'lantern.interior', spawnId: 'medbay' };
  switch (id) {
    case 'moon':
      s.player.locationId = 'moon.south';
      s.player.spawnId = 'ramp';
      break;
    case 'ship':
      s.player.locationId = 'lantern.interior';
      s.player.spawnId = 'cargo';
      break;
    case 'rich':
      s.player.locationId = 'moon.south';
      s.player.spawnId = 'base';
      s.inventories.player.stacks = [
        { itemId: 'frame', qty: 12 }, { itemId: 'conduit', qty: 10 }, { itemId: 'sealant', qty: 10 },
        { itemId: 'solarcell', qty: 6 }, { itemId: 'powercell', qty: 6 }, { itemId: 'circuit', qty: 10 },
        { itemId: 'electronics', qty: 10 }, { itemId: 'relaykit', qty: 1 }, { itemId: 'ice', qty: 20 },
      ];
      break;
    default:
      s.player.locationId = 'moon.south';
      s.player.spawnId = 'ramp';
  }
  return s;
}

export async function devScenario(game: Game, id: string): Promise<void> {
  await game.loadState(scenarioState(id), false);
}
