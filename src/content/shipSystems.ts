import type { ShipSystemDef } from './types';

/**
 * The Lantern's systems graph. Each system is repaired through physical steps performed
 * at real places in the ship or in the world, then brought online at its console.
 * Scene visuals (lights, screens, machinery) are driven entirely by this state.
 */
export const SHIP_SYSTEMS: ShipSystemDef[] = [
  {
    id: 'power.batteries', name: 'Battery Bus', group: 'power', powerKW: -8, dependsOn: [],
    description: 'Emergency batteries and the internal distribution bus. Wakes lights, doors and consoles.',
    steps: [
      { id: 'fuelcell', label: 'Install emergency fuel cell', where: 'Engineering — battery bay', consumes: [{ item: 'fuelcell', qty: 1 }] },
      { id: 'breakers', label: 'Close bus breakers in order', where: 'Engineering — power panel' },
    ],
  },
  {
    id: 'life.hull', name: 'Pressure Hull', group: 'structure', powerKW: 0, dependsOn: [],
    description: 'Hull breaches in the habitation deck must be sealed before the ship can hold air.',
    steps: [
      { id: 'breach.corridor', label: 'Seal corridor breach', where: 'Deck 2 — spine corridor', consumes: [{ item: 'sealant', qty: 2 }] },
      { id: 'breach.lab', label: 'Seal laboratory breach', where: 'Deck 2 — science lab', consumes: [{ item: 'sealant', qty: 2 }] },
    ],
  },
  {
    id: 'life.support', name: 'Life Support', group: 'life', powerKW: 3, dependsOn: ['power.batteries', 'life.hull'],
    description: 'CO₂ scrubbing, oxygen and temperature regulation. Lets the crew take their helmets off.',
    steps: [
      { id: 'scrubbers', label: 'Load CO₂ scrubber cartridges', where: 'Deck 3 — life support plant', consumes: [{ item: 'scrubber', qty: 2 }] },
      { id: 'restart', label: 'Repressurize and restart', where: 'Deck 3 — life support console' },
    ],
  },
  {
    id: 'power.reactor', name: 'Fission Reactor', group: 'power', powerKW: -60, dependsOn: ['power.batteries', 'life.support'],
    description: 'Compact fission reactor. Full ship power: lights, fabrication, drive pre-heat.',
    steps: [
      { id: 'actuator', label: 'Replace control-rod actuator', where: 'Deck 3 — reactor room', consumes: [{ item: 'actuator', qty: 1 }] },
      { id: 'coolant', label: 'Re-open coolant loop valves', where: 'Deck 3 — reactor room' },
      { id: 'startup', label: 'Reactor start-up sequence', where: 'Deck 3 — engineering console' },
    ],
  },
  {
    id: 'comms.short', name: 'Short-Range Comms', group: 'comms', powerKW: 1, dependsOn: ['power.batteries'],
    description: 'Hull antenna for suit-to-ship and local radio.',
    steps: [
      { id: 'antenna', label: 'Repair hull antenna', where: 'Exterior — dorsal hull', consumes: [{ item: 'conduit', qty: 1 }, { item: 'circuit', qty: 1 }] },
    ],
  },
  {
    id: 'comms.long', name: 'Long-Range Comms', group: 'comms', powerKW: 4, dependsOn: ['comms.short', 'power.reactor'],
    description: 'Deep-space link. The crash site has no line of sight to Earth; a relay is required.',
    steps: [
      { id: 'relay', label: 'Deploy relay on Earthrise Summit', where: 'Moon — Earthrise Summit', consumes: [{ item: 'relaykit', qty: 1 }] },
      { id: 'align', label: 'Align relay dish to Earth', where: 'Moon — Earthrise Summit' },
    ],
  },
  {
    id: 'nav.core', name: 'Navigation', group: 'nav', powerKW: 2, dependsOn: ['power.reactor'],
    description: 'Star tracker, inertial reference and navigation computer.',
    steps: [
      { id: 'tracker', label: 'Install star tracker', where: 'Deck 1 — navigation station', consumes: [{ item: 'startracker', qty: 1 }] },
      { id: 'calibrate', label: 'Calibrate against reference stars', where: 'Deck 1 — navigation station' },
    ],
  },
  {
    id: 'prop.main', name: 'Main Drive', group: 'propulsion', powerKW: 10, dependsOn: ['power.reactor', 'nav.core'],
    description: 'Hydrolox main drive and RCS thrusters. Needs propellant, injectors and a level ship.',
    steps: [
      { id: 'injectors', label: 'Install drive injectors', where: 'Deck 3 — drive crawlway', consumes: [{ item: 'injector', qty: 3 }] },
      { id: 'struts', label: 'Level the ship on its struts', where: 'Deck 3 — engineering console' },
      { id: 'hull', label: 'Weld exterior hull plates (3)', where: 'Exterior — ventral hull' },
    ],
  },
  {
    id: 'prop.fusion', name: 'Kestrel Fusion Torch', group: 'propulsion', powerKW: 25, dependsOn: ['power.reactor', 'prop.main'],
    description: 'Prototype D-He3 fusion drive from Ceres Deep. Extends the Lantern’s reach to the outer planets and adds 2,000 kg of tankage.',
    steps: [
      { id: 'core', label: 'Seat the fusion core', where: 'Deck 3 — engineering upgrade console', consumes: [{ item: 'fusioncore', qty: 1 }] },
      { id: 'coils', label: 'Install the magnetic nozzle coils', where: 'Deck 3 — engineering upgrade console', consumes: [{ item: 'magcoil', qty: 2 }] },
      { id: 'tune', label: 'Tune the confinement field', where: 'Deck 3 — engineering upgrade console' },
    ],
  },
  {
    id: 'hull.thermal', name: 'Thermal Shield', group: 'structure', powerKW: 0, dependsOn: [],
    description: 'Ceramic tiles for the sunward hull. Needed to fly the inner Solar System (Venus, Mercury).',
    steps: [{ id: 'tiles', label: 'Fit the thermal tiles', where: 'Deck 3 — engineering upgrade console', consumes: [{ item: 'thermaltile', qty: 6 }] }],
  },
];

/** Propellant needed for lunar ascent to orbit (kg). */
export const LAUNCH_PROPELLANT = 1200;

/** Hydrolox tank capacity before upgrades (kg). */
export const PROPELLANT_CAPACITY = 2400;
/** Extra tankage fitted with the Kestrel fusion torch (its reaction mass is also hydrogen). */
export const FUSION_EXTRA_TANK = 2000;

/** Current tank capacity. */
export function propellantCapacity(state: { ship: { systems: Record<string, { online: boolean }> } }): number {
  return PROPELLANT_CAPACITY + (state.ship.systems['prop.fusion']?.online ? FUSION_EXTRA_TANK : 0);
}

/** Propellant for leaving each world's surface to its orbit zone (kg). */
export const ASCENT_COST: Record<string, number> = { moon: 150, mars: 450, ceres: 60, europa: 200, titan: 250, pluto: 120, mercury: 400, vesperb: 700 };
/** Propellant for a powered descent (Mars aerobrakes most of the way). */
export const DESCENT_COST: Record<string, number> = { moon: 100, mars: 150, ceres: 40, europa: 150, titan: 60, pluto: 80, mercury: 300, vesperb: 150 };
