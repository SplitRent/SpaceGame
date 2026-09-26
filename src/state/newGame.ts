import type { ContentRegistry } from '../content/registry';
import { STATE_VERSION, type GameState } from './GameState';

/** Builds the initial GameState for a new game from content definitions. */
export function createNewGameState(content: ContentRegistry, playerName = 'Specialist', seed = 1969): GameState {
  const systems: GameState['ship']['systems'] = {};
  for (const def of Object.values(content.shipSystems)) {
    systems[def.id] = { condition: 0.15, online: false, steps: {} };
  }
  const npcs: GameState['npcs'] = {};
  for (const def of Object.values(content.npcs)) {
    npcs[def.id] = { alive: true, injured: false, relationship: 10, memory: {} };
  }
  return {
    version: STATE_VERSION,
    meta: { createdAt: Date.now(), playtimeSec: 0, seed, chapter: 'Act 0 — The Expedition' },
    flags: {},
    player: {
      name: playerName,
      locationId: 'lantern.interior',
      spawnId: 'cabin',
      position: null,
      yaw: 0,
      health: 100,
      oxygen: 240,
      suitPower: 100,
      oxygenMax: 240,
      suitPowerMax: 100,
      scannerTier: 1,
      cameraView: 'first',
      respawn: { locationId: 'lantern.interior', spawnId: 'medbay' },
    },
    inventories: {
      player: { slots: 16, stacks: [] },
      'ship.cargo': { slots: 60, stacks: [] },
      'base.storage': { slots: 30, stacks: [] },
    },
    quests: {},
    granted: {},
    world: {},
    npcs,
    ship: {
      name: 'EXV Lantern',
      systems,
      hull: 0.35,
      propellant: 0,
      listDeg: 7,
      parking: { kind: 'surface', locationId: 'moon.south' },
    },
    base: {
      pads: {
        'pad.a': { moduleId: null, built: false },
        'pad.b': { moduleId: null, built: false },
        'pad.c': { moduleId: null, built: false },
        'pad.d': { moduleId: null, built: false },
        'pad.e': { moduleId: null, built: false },
        'pad.f': { moduleId: null, built: false },
        'pad.g': { moduleId: null, built: false },
        'pad.h': { moduleId: null, built: false },
      },
      batteryKWh: 0,
    },
    universe: { discovered: { earth: true, moon: true, sun: true }, unlocked: { moon: true } },
    database: {},
    research: {},
    clock: 0,
    uidCounter: 0,
  };
}
