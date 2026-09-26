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
    case 'k9':
      completeUpTo(s, 'reactor');
      s.player.locationId = 'moon.kepler9';
      s.player.spawnId = 'entrance';
      s.flags['k9.opened'] = true;
      break;
    case 'launch':
      completeUpTo(s, 'all');
      s.player.locationId = 'lantern.interior';
      s.player.spawnId = 'bridge';
      break;
    case 'orbit':
      completeUpTo(s, 'all');
      s.flags.launched = true;
      s.ship.propellant = 400;
      s.ship.parking = { kind: 'space', locationId: 'space.cislunar', position: [0, 0, 0], quat: [0, 0, 0, 1] };
      s.player.locationId = 'space.cislunar';
      s.player.spawnId = 'launch';
      break;
    case 'harbor':
      completeUpTo(s, 'all');
      s.flags.launched = true;
      s.flags['harbor.approached'] = true;
      s.flags['harbor.docked'] = true;
      s.ship.parking = { kind: 'docked', locationId: 'harbor.interior', portId: 'dock' };
      s.player.locationId = 'harbor.interior';
      s.player.spawnId = 'dock';
      break;
    default:
      s.player.locationId = 'moon.south';
      s.player.spawnId = 'ramp';
  }
  return s;
}

/** Mark ship systems repaired/online up to a milestone (dev/test only). */
function completeUpTo(s: GameState, upTo: 'reactor' | 'all'): void {
  const order = ['power.batteries', 'life.hull', 'life.support', 'power.reactor', 'comms.short', 'comms.long', 'nav.core', 'prop.main'];
  const last = upTo === 'reactor' ? 3 : order.length - 1;
  for (let i = 0; i <= last; i++) {
    const def = CONTENT.shipSystems[order[i]];
    const sys = s.ship.systems[order[i]];
    for (const st of def.steps) sys.steps[st.id] = true;
    sys.online = true;
    sys.condition = 1;
  }
  s.flags['met.castellanos'] = true;
  s.flags['kit.treated'] = true;
  for (const [pad, mod] of [['pad.a', 'shelter'], ['pad.b', 'solar'], ['pad.c', 'workbench'], ['pad.d', 'battery'], ['pad.e', 'iceproc']] as const) {
    s.base.pads[pad] = { moduleId: mod, built: true };
  }
  s.base.batteryKWh = 40;
  const done = ['mq.aftermath', 'mq.air', 'mq.camp', 'mq.ice', 'mq.reactor'];
  if (upTo === 'all') {
    done.push('mq.earthrise', 'mq.kepler', 'mq.bearings', 'mq.lift');
    s.ship.listDeg = 0;
    s.ship.propellant = 1300;
    s.flags['ship.propellant'] = 1300;
    s.flags['earth.called'] = true;
    s.flags['iceproc.loaded'] = true;
    s.inventories.player.stacks = [];
  }
  for (const q of done) {
    const def = CONTENT.quests[q];
    s.quests[q] = { status: 'completed', stage: def.stages[def.stages.length - 1].id, progress: {}, history: def.stages.map((x) => x.id) };
    s.granted[`quest:${q}:rewards`] = true;
  }
}

export async function devScenario(game: Game, id: string): Promise<void> {
  await game.loadState(scenarioState(id), false);
}
