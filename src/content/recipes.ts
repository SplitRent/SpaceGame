import type { RecipeDef } from './types';

/**
 * Crafting is tied to places: the ship fabricator (workshop), the base workbench,
 * the lab, or the field (suit). Advanced parts require real facilities.
 */
export const RECIPES: RecipeDef[] = [
  { id: 'r.sealant', output: { item: 'sealant', qty: 2 }, inputs: [{ item: 'regolith', qty: 4 }, { item: 'scrap', qty: 1 }], facility: ['fabricator', 'workbench'], time: 2 },
  { id: 'r.frame', output: { item: 'frame', qty: 1 }, inputs: [{ item: 'iron', qty: 2 }, { item: 'scrap', qty: 2 }], facility: ['fabricator', 'workbench'], time: 2 },
  { id: 'r.conduit', output: { item: 'conduit', qty: 1 }, inputs: [{ item: 'aluminum', qty: 2 }, { item: 'scrap', qty: 1 }], facility: ['fabricator', 'workbench'], time: 2 },
  { id: 'r.circuit', output: { item: 'circuit', qty: 1 }, inputs: [{ item: 'silicon', qty: 2 }, { item: 'electronics', qty: 1 }], facility: ['fabricator'], time: 3 },
  { id: 'r.solarcell', output: { item: 'solarcell', qty: 1 }, inputs: [{ item: 'silicon', qty: 3 }, { item: 'aluminum', qty: 2 }], facility: ['fabricator', 'workbench'], time: 3 },
  { id: 'r.powercell', output: { item: 'powercell', qty: 1 }, inputs: [{ item: 'titanium', qty: 1 }, { item: 'electronics', qty: 2 }, { item: 'aluminum', qty: 1 }], facility: ['fabricator'], time: 3 },
  { id: 'r.medpatch', output: { item: 'medpatch', qty: 2 }, inputs: [{ item: 'carbon', qty: 1 }, { item: 'ice', qty: 1 }], facility: ['fabricator', 'lab'], time: 2 },
  {
    id: 'r.o2canister', output: { item: 'o2canister', qty: 1 }, inputs: [{ item: 'ice', qty: 2 }], facility: ['workbench'], time: 2,
    requires: { module: 'iceproc' },
  },
  { id: 'r.field.sealant', output: { item: 'sealant', qty: 1 }, inputs: [{ item: 'regolith', qty: 6 }, { item: 'scrap', qty: 2 }], facility: ['field'], time: 4 },
  {
    id: 'r.actuator', output: { item: 'actuator', qty: 1 }, inputs: [{ item: 'titanium', qty: 3 }, { item: 'circuit', qty: 2 }], facility: ['fabricator'], time: 4,
    requires: { questActive: 'mq.reactor' },
  },
  {
    id: 'r.relaykit', output: { item: 'relaykit', qty: 1 },
    inputs: [{ item: 'conduit', qty: 2 }, { item: 'circuit', qty: 2 }, { item: 'frame', qty: 1 }, { item: 'solarcell', qty: 1 }],
    facility: ['fabricator'], time: 4, requires: { questActive: 'mq.earthrise' },
  },
  {
    id: 'r.injector', output: { item: 'injector', qty: 1 }, inputs: [{ item: 'titanium', qty: 2 }, { item: 'circuit', qty: 1 }], facility: ['fabricator'], time: 3,
    requires: { questActive: 'mq.lift' },
  },
];
