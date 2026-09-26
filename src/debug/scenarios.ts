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
    case 'powered':
      completeUpTo(s, 'reactor');
      s.player.locationId = 'lantern.interior';
      s.player.spawnId = 'engineering';
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
      {
        const def = CONTENT.quests['mq.ascent'];
        s.quests['mq.ascent'] = { status: 'completed', stage: def.stages[def.stages.length - 1].id, progress: {}, history: def.stages.map((x) => x.id) };
        s.granted['quest:mq.ascent:rewards'] = true;
      }
      s.flags['harbor.approached'] = true;
      s.flags['harbor.docked'] = true;
      s.ship.parking = { kind: 'docked', locationId: 'harbor.interior', portId: 'dock' };
      s.player.locationId = 'harbor.interior';
      s.player.spawnId = 'dock';
      break;
    case 'frontier':
      postSlice(s);
      s.ship.parking = { kind: 'space', locationId: 'space.cislunar', position: [0, 0, 0], quat: [0, 0, 0, 1] };
      s.player.locationId = 'lantern.interior';
      s.player.spawnId = 'bridge';
      break;
    case 'transit':
      postSlice(s);
      s.flags['course.mars'] = true;
      s.ship.propellant = 800;
      s.ship.parking = { kind: 'transit', locationId: 'space.transit', from: 'space.cislunar', to: 'space.mars', elapsed: 75, duration: 90 };
      s.player.locationId = 'space.transit';
      s.player.spawnId = 'helm';
      break;
    case 'marsorbit':
      postSlice(s);
      s.flags['course.mars'] = true;
      s.ship.propellant = 800;
      s.ship.parking = { kind: 'space', locationId: 'space.mars', position: [0, -34000, 0], quat: [0, 0, 0, 1] };
      s.player.locationId = 'space.mars';
      s.player.spawnId = 'helm';
      break;
    case 'mars':
    case 'melas':
      postSlice(s);
      s.flags['course.mars'] = true;
      s.universe.discovered['mars.orbit'] = true;
      s.universe.discovered['space.mars'] = true;
      s.ship.propellant = 650;
      s.ship.parking = { kind: 'surface', locationId: 'mars.melas' };
      s.inventories.player.stacks = [{ itemId: 'conduit', qty: 1 }, { itemId: 'powercell', qty: 2 }, { itemId: 'o2canister', qty: 2 }];
      if (id === 'melas') {
        s.universe.discovered['mars.melas'] = true;
        s.player.locationId = 'mars.station';
        s.player.spawnId = 'airlock';
      } else {
        s.player.locationId = 'mars.melas';
        s.player.spawnId = 'ramp';
      }
      break;
    case 'ceres':
    case 'europa':
    case 'titan':
    case 'pluto':
    case 'threshold':
    case 'vesper':
    case 'archive':
    case 'venus':
    case 'mercury': {
      lateGame(s, id);
      break;
    }
    default:
      s.player.locationId = 'moon.south';
      s.player.spawnId = 'ramp';
  }
  return s;
}

/** State right after the vertical slice: launched, Harbor reached, Act 2 begun and briefed. */
function postSlice(s: GameState): void {
  completeUpTo(s, 'all');
  s.meta.chapter = 'Act 2 — The Frontier';
  for (const f of ['launched', 'orbit.placed', 'harbor.approached', 'harbor.docked', 'harbor.undocked', 'harbor.survivors', 'harbor.burstlog', 'slice.complete', 'scar.pulse', 'frontier.briefed', 'hint.flight', 'hint.ship']) s.flags[f] = true;
  for (const d of ['harbor', 'moon.orbit', 'harbor.interior']) s.universe.discovered[d] = true;
  for (const q of ['mq.ascent', 'mq.harbor']) {
    const def = CONTENT.quests[q];
    s.quests[q] = { status: 'completed', stage: def.stages[def.stages.length - 1].id, progress: {}, history: def.stages.map((x) => x.id) };
    s.granted[`quest:${q}:rewards`] = true;
  }
  s.granted['story.launch'] = true;
  s.ship.propellant = 1600;
  s.flags['ship.propellant'] = 1600;
}

function done(s: GameState, q: string): void {
  const def = CONTENT.quests[q];
  s.quests[q] = { status: 'completed', stage: def.stages[def.stages.length - 1].id, progress: {}, history: def.stages.map((x) => x.id) };
  s.granted[`quest:${q}:rewards`] = true;
}

/** Acts 2–5 jump points: everything before the named destination is completed. */
function lateGame(s: GameState, id: string): void {
  postSlice(s);
  const order = ['ceres', 'europa', 'titan', 'pluto', 'threshold', 'vesper', 'archive'];
  const at = order.indexOf(id);
  for (const q of ['mq.frontier', 'mq.footprints']) done(s, q);
  for (const f of ['course.mars', 'melas.found', 'melas.cable', 'melas.cells', 'melas.power', 'melas.debrief', 'footprints.revealed', 'spire.reported', 'network.briefed', 'hint.mars']) s.flags[f] = true;
  for (const d of ['mars', 'mars.orbit', 'mars.melas', 'mars.station', 'mars.spire']) s.universe.discovered[d] = true;
  s.flags['ship.propellant'] = 2400;
  s.ship.propellant = 2400;
  const fusion = at >= 1 || id === 'venus' || id === 'mercury';
  if (fusion) {
    done(s, 'mq.network');
    for (const f of ['ceres.met', 'ceres.pylon.1', 'ceres.pylon.2', 'ceres.pylon.3', 'ceres.hangar']) s.flags[f] = true;
    for (const st of ['core', 'coils', 'tune']) s.ship.systems['prop.fusion'].steps[st] = true;
    s.ship.systems['prop.fusion'].online = true;
    s.ship.systems['prop.fusion'].condition = 1;
    s.ship.propellant = 4400;
  }
  if (id === 'venus' || id === 'mercury') {
    s.ship.systems['hull.thermal'].steps.tiles = true;
    s.ship.systems['hull.thermal'].online = true;
    s.ship.systems['hull.thermal'].condition = 1;
  }
  if (at >= 2) {
    s.flags['europa.recorder'] = true;
    s.flags['cadence.1'] = true;
    s.universe.discovered['europa.conamara'] = true;
  }
  if (at >= 3) {
    s.flags['titan.recorder'] = true;
    s.flags['cadence.2'] = true;
    s.universe.discovered['titan.kraken'] = true;
  }
  if (at >= 4) {
    done(s, 'mq.cadence');
    s.flags['okonkwo.found'] = true;
    s.universe.discovered['pluto.sputnik'] = true;
    s.inventories.player.stacks.push({ itemId: 'latticekey', qty: 1 });
  }
  if (at >= 5) {
    done(s, 'mq.threshold');
    for (const f of ['threshold.docked', 'threshold.open', 'threshold.entered']) s.flags[f] = true;
    s.universe.discovered['threshold.zone'] = true;
  }
  if (at >= 6) {
    done(s, 'mq.vesper');
    for (const d of ['vesper.orbit', 'vesper.terminator', 'vesper.archive.door']) s.universe.discovered[d] = true;
  }
  const surface: Record<string, string> = { ceres: 'ceres.occator', europa: 'europa.conamara', titan: 'titan.kraken', pluto: 'pluto.sputnik', vesper: 'vesper.terminator', archive: 'vesper.terminator', mercury: 'mercury.chao' };
  if (id === 'threshold') {
    s.flags['threshold.docked'] = true;
    s.universe.discovered['threshold.zone'] = true;
    s.ship.parking = { kind: 'docked', locationId: 'threshold.interior', portId: 'dock' };
    s.player.locationId = 'threshold.interior';
    s.player.spawnId = 'dock';
  } else if (id === 'venus') {
    s.ship.parking = { kind: 'docked', locationId: 'venus.halcyon', portId: 'lock' };
    s.player.locationId = 'venus.halcyon';
    s.player.spawnId = 'lock';
  } else {
    s.ship.parking = { kind: 'surface', locationId: surface[id] };
    s.player.locationId = id === 'archive' ? 'vesper.archive' : surface[id];
    s.player.spawnId = id === 'archive' ? 'entry' : 'ramp';
  }
  s.meta.chapter = at >= 5 ? 'Act 4 — The Unknown' : at >= 1 ? 'Act 3 — The Outer System' : 'Act 2 — The Frontier';
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
