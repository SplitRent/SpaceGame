import type { Vec3 } from '../state/GameState';

/**
 * Local space zones (flight mode). Each zone is the space around one body: the body and
 * its neighbours drawn in the kilometre background layer, stations/salvage in the metre
 * foreground layer, and a landing corridor to an authored surface region. Zones are data;
 * one SpaceZone location class renders them all.
 */
export interface SpaceZoneDef {
  id: string;
  name: string;
  /** Celestial body id (content/bodies.ts). */
  body: string;
  /** rot: orientation so the zone's surface region faces the zone origin (+Y). */
  planet?: { kind: string; radiusKm: number; rot?: Vec3 };
  /** Star system the zone belongs to (the star map only plots within one). */
  system?: 'sol' | 'vesper';
  /** The zone origin sits this many km above the surface. */
  originAltKm: number;
  /** Automatic pull-up floor (m above surface). */
  minAltM: number;
  /** Below this altitude the landing corridor is available (m). */
  landAltM: number;
  sunDir: Vec3;
  sunIntensity: number;
  backdrop: { kind: string; radiusKm: number; pos: Vec3; rot?: Vec3 }[];
  /** Discovery id recorded on entry. */
  discover: string;
  /** Where the ship drops out of a transit (m), and what it faces. */
  arrival: { pos: Vec3; look: Vec3; title: string; sub: string };
  landing?: { location: string; spawn: string; label: string; scan: string; text: string };
  station?: {
    model: 'harbor' | 'threshold' | 'gate' | 'aerostat';
    pos: Vec3;
    rot: Vec3;
    label: string;
    scan: string;
    dockLocation: string;
    dockSpawn: string;
    /** Flags `<prefix>.approached/.docked/.undocked`, discovery id `<prefix>`. */
    prefix: string;
    title: string;
    sub: string;
  };
  salvage?: {
    model: 'canister' | 'satellite';
    idPrefix: string;
    label: string;
    scan: string;
    items: [string, number][];
    text: string;
    spots: Vec3[];
  };
  /** Instanced debris cloud around a point (m). */
  debris?: { center: Vec3; count: number };
}

const HARBOR: Vec3 = [2600, 900, -16000];

export const ZONES: Record<string, SpaceZoneDef> = {
  'space.cislunar': {
    id: 'space.cislunar',
    name: 'Lunar Orbit',
    body: 'moon',
    planet: { kind: 'moon', radiusKm: 1737.4 },
    originAltKm: 25,
    minAltM: 1500,
    landAltM: 4000,
    sunDir: [0.75, 0.25, -0.35],
    sunIntensity: 3.4,
    // Earth ~10× closer than real at 1/10 size: identical angular size, no depth issues.
    backdrop: [{ kind: 'earth', radiusKm: 637.1, pos: [-26000, 9000, -26000], rot: [0.4, 1.2, 0] }],
    discover: 'moon.orbit',
    arrival: { pos: [-6000, 9000, 42000], look: HARBOR, title: 'The Moon', sub: 'Lunar orbit · 384,400 km from Earth' },
    landing: { location: 'moon.south', spawn: 'ramp', label: 'Base Camp (surface)', scan: 'db.moon', text: 'Descending to base camp… touchdown.' },
    station: {
      model: 'harbor',
      pos: HARBOR,
      rot: [0.1, 0.4, 0],
      label: 'Harbor Station',
      scan: 'db.harbor',
      dockLocation: 'harbor.interior',
      dockSpawn: 'dock',
      prefix: 'harbor',
      title: 'Harbor Station',
      sub: 'Dark. Tumbling. Its beacon is blinking.',
    },
    salvage: {
      model: 'canister',
      idPrefix: 'canister',
      label: 'Cargo canister',
      scan: 'db.salvage',
      items: [['electronics', 4], ['scrap', 6], ['powercell', 1]],
      text: 'Cargo canister tractored into the hold: electronics, scrap, a power cell (ship cargo).',
      spots: [0, 1, 2].map((i) => [HARBOR[0] - 400 + i * 350, HARBOR[1] + 120 - i * 90, HARBOR[2] + 600 + i * 180] as Vec3),
    },
    debris: { center: HARBOR, count: 260 },
  },
  'space.mars': {
    id: 'space.mars',
    name: 'Mars Orbit',
    body: 'mars',
    // Tip the globe so the rendered Valles Marineris (~9°S) lies directly below the zone origin.
    planet: { kind: 'mars', radiusKm: 3389.5, rot: [-1.5692, -0.3987, 0.3993] },
    originAltKm: 40,
    minAltM: 2500,
    landAltM: 7000,
    sunDir: [0.55, 0.3, 0.6],
    sunIntensity: 2.6,
    backdrop: [
      // Phobos (real orbit radius 9,376 km) and Deimos (23,460 km) — both tiny, both real.
      { kind: 'phobos', radiusKm: 11.1, pos: [-0.52 * 9376, 0.5 * 9376, -0.69 * 9376] },
      { kind: 'phobos', radiusKm: 6.2, pos: [0.62 * 23460, 0.45 * 23460, -0.64 * 23460] },
    ],
    discover: 'mars.orbit',
    arrival: { pos: [0, 14000, 36000], look: [0, -40000, -30000], title: 'Mars', sub: 'Fourth planet · 1.52 AU from the Sun' },
    landing: { location: 'mars.melas', spawn: 'ramp', label: 'Melas Chasma (surface)', scan: 'db.mars', text: 'Entry, descent and landing… Melas Chasma. Touchdown.' },
    salvage: {
      model: 'satellite',
      idPrefix: 'aresrelay',
      label: 'Ares Relay 2 (derelict)',
      scan: 'db.aresrelay',
      items: [['electronics', 5], ['circuit', 2], ['powercell', 1]],
      text: 'Ares Relay 2’s avionics core tractored aboard: electronics, circuit boards, a power cell.',
      spots: [[-3200, 2600, -9000]],
    },
  },
  'space.ceres': {
    id: 'space.ceres',
    name: 'Ceres Orbit',
    body: 'ceres',
    planet: { kind: 'ceres', radiusKm: 469.7 },
    originAltKm: 15,
    minAltM: 1200,
    landAltM: 5000,
    sunDir: [0.5, 0.4, -0.6],
    sunIntensity: 2.4,
    backdrop: [],
    discover: 'ceres.orbit',
    arrival: { pos: [0, 12000, 30000], look: [0, -15000, -20000], title: 'Ceres', sub: 'Dwarf planet · the asteroid belt · 2.77 AU' },
    landing: { location: 'ceres.occator', spawn: 'ramp', label: 'Occator Crater (surface)', scan: 'db.ceres', text: 'Descending into Occator… touchdown in microgravity.' },
    salvage: {
      model: 'canister', idPrefix: 'orebarge', label: 'Drifting ore canister', scan: 'db.salvage',
      items: [['iron', 6], ['titanium', 3], ['salts', 3]],
      text: 'Ore canister tractored aboard: iron, titanium, salts (ship cargo).',
      spots: [[-1500, 3000, -6000], [2200, 1800, -9000]],
    },
  },
  'space.jupiter': {
    id: 'space.jupiter',
    name: 'Europa Orbit',
    body: 'europa',
    planet: { kind: 'europa', radiusKm: 1560.8, rot: [0.3, 0, 0.2] },
    originAltKm: 25,
    minAltM: 1500,
    landAltM: 6000,
    sunDir: [0.55, 0.25, -0.6],
    sunIntensity: 2.2,
    // Jupiter at 1/5 of its real distance and size: the same 12° disc.
    backdrop: [{ kind: 'jupiter', radiusKm: 13982, pos: [-0.5 * 134220, 0.42 * 134220, -0.76 * 134220], rot: [0.05, 0, 0.05] }],
    discover: 'europa.orbit',
    arrival: { pos: [0, 15000, 35000], look: [-20000, 5000, -40000], title: 'Jupiter', sub: 'Europa orbit · 5.2 AU' },
    landing: { location: 'europa.conamara', spawn: 'ramp', label: 'Conamara Chaos (surface)', scan: 'db.europa', text: 'Descending onto the ice of Europa… touchdown.' },
  },
  'space.saturn': {
    id: 'space.saturn',
    name: 'Titan Orbit',
    body: 'titan',
    planet: { kind: 'titan', radiusKm: 2574.7 },
    originAltKm: 90,
    minAltM: 3000,
    landAltM: 70000,
    sunDir: [0.4, 0.35, -0.7],
    sunIntensity: 2,
    // Saturn at 1/10 scale: same angular size (~5.5°).
    backdrop: [{ kind: 'saturn', radiusKm: 5823, pos: [0.55 * 122187, 0.35 * 122187, -0.76 * 122187], rot: [0.47, 0, 0.1] }],
    discover: 'titan.orbit',
    arrival: { pos: [0, 20000, 40000], look: [30000, 10000, -60000], title: 'Saturn', sub: 'Titan orbit · 9.5 AU' },
    landing: { location: 'titan.kraken', spawn: 'ramp', label: 'Kraken Mare shore (surface)', scan: 'db.titan', text: 'Down through the orange haze… parachutes aren’t needed, but it feels like they should be. Touchdown.' },
  },
  'space.pluto': {
    id: 'space.pluto',
    name: 'Pluto Orbit',
    body: 'pluto',
    planet: { kind: 'pluto', radiusKm: 1188.3, rot: [-0.3, 0, 0.1] },
    originAltKm: 20,
    minAltM: 1200,
    landAltM: 6000,
    sunDir: [0.4, 0.2, 0.6],
    sunIntensity: 1.6,
    backdrop: [{ kind: 'charon', radiusKm: 606, pos: [-0.6 * 19591, 0.5 * 19591, -0.62 * 19591] }],
    discover: 'pluto.orbit',
    arrival: { pos: [0, 12000, 30000], look: [0, -20000, -25000], title: 'Pluto', sub: '39.5 AU · the last planet anyone ever demoted' },
    landing: { location: 'pluto.sputnik', spawn: 'ramp', label: 'Sputnik Planitia (surface)', scan: 'db.pluto', text: 'Descending over the heart of Pluto… touchdown on nitrogen ice.' },
  },
  'space.threshold': {
    id: 'space.threshold',
    name: 'The Threshold',
    body: 'threshold',
    originAltKm: 0,
    minAltM: 0,
    landAltM: 0,
    sunDir: [0.3, 0.1, 0.95],
    sunIntensity: 1,
    backdrop: [],
    discover: 'threshold.zone',
    arrival: { pos: [0, 1500, 14000], look: [0, 0, -9000], title: 'The Threshold', sub: '51 AU · the source of the Cadence' },
    station: {
      model: 'threshold', pos: [0, 0, -9000], rot: [0, 0, 0], label: 'The Threshold', scan: 'db.threshold',
      dockLocation: 'threshold.interior', dockSpawn: 'dock', prefix: 'threshold', title: 'The Threshold', sub: 'It has been waiting.',
    },
  },
  'space.vesper': {
    id: 'space.vesper',
    name: 'Vesper b Orbit',
    body: 'vesperb',
    system: 'vesper',
    planet: { kind: 'vesperb', radiusKm: 6250 },
    originAltKm: 140,
    minAltM: 4000,
    landAltM: 115000,
    sunDir: [1, 0.12, 0.2],
    sunIntensity: 2.6,
    backdrop: [{ kind: 'neptune', radiusKm: 2400, pos: [-0.5 * 60000, 0.3 * 60000, -0.8 * 60000] }],
    discover: 'vesper.orbit',
    arrival: { pos: [0, 3000, 8000], look: [0, -60000, -60000], title: 'Vesper b', sub: 'Another star. Another world. Alive.' },
    landing: { location: 'vesper.terminator', spawn: 'ramp', label: 'The terminator (surface)', scan: 'db.vesperb', text: 'Through clouds lit orange from one side and black from the other… touchdown in the twilight band.' },
    station: {
      model: 'gate', pos: [0, 0, -9000], rot: [0, 0, 0], label: 'The Far Gate', scan: 'db.threshold',
      dockLocation: 'vesper.gatehall', dockSpawn: 'dock', prefix: 'vespergate', title: 'The Far Gate', sub: 'The way home.',
    },
  },
  'space.venus': {
    id: 'space.venus',
    name: 'Venus — cloud tops',
    body: 'venus',
    planet: { kind: 'venus', radiusKm: 6051.8 },
    originAltKm: 150,
    minAltM: 20000,
    landAltM: 0,
    sunDir: [0.6, 0.5, -0.4],
    sunIntensity: 3.6,
    backdrop: [],
    discover: 'venus.orbit',
    arrival: { pos: [0, 5000, 30000], look: [0, -20000, -12000], title: 'Venus', sub: 'Halcyon aerostat · 0.72 AU' },
    station: {
      model: 'aerostat', pos: [1800, -2000, -9000], rot: [0, 0.3, 0], label: 'Halcyon aerostat', scan: 'db.halcyon',
      dockLocation: 'venus.halcyon', dockSpawn: 'lock', prefix: 'halcyon', title: 'Halcyon', sub: 'A city-sized balloon, fifty kilometres above hell.',
    },
  },
  'space.mercury': {
    id: 'space.mercury',
    name: 'Mercury Orbit',
    body: 'mercury',
    planet: { kind: 'mercury', radiusKm: 2439.7, rot: [Math.PI / 2 - 0.1, 0, 0] },
    originAltKm: 25,
    minAltM: 1500,
    landAltM: 6000,
    sunDir: [0.85, 0.1, -0.3],
    sunIntensity: 4.5,
    backdrop: [],
    discover: 'mercury.orbit',
    arrival: { pos: [0, 12000, 30000], look: [0, -20000, -25000], title: 'Mercury', sub: '0.39 AU · the Sun is three times wider here' },
    landing: { location: 'mercury.chao', spawn: 'ramp', label: 'Chao Meng-Fu crater (surface)', scan: 'db.mercury', text: 'Down into the shadow of the south pole… touchdown.' },
  },
  'space.earth': {
    id: 'space.earth',
    name: 'Earth Orbit',
    body: 'earth',
    planet: { kind: 'earth', radiusKm: 6371, rot: [0.4, 2.2, 0] },
    originAltKm: 420,
    minAltM: 100000,
    landAltM: 0,
    sunDir: [0.7, 0.3, -0.5],
    sunIntensity: 3.4,
    backdrop: [{ kind: 'moon', radiusKm: 579, pos: [0.3 * 128133, 0.2 * 128133, -0.93 * 128133] }],
    discover: 'earth.orbit',
    arrival: { pos: [0, 0, 20000], look: [0, -60000, -20000], title: 'Earth', sub: 'Home.' },
  },
};

/** Which space zone sits above a surface location (for take-off). */
export function zoneForSurface(locationId: string): SpaceZoneDef | null {
  return Object.values(ZONES).find((z) => z.landing?.location === locationId) ?? null;
}

/** Which space zone a docked station belongs to. */
export function zoneForStation(locationId: string): SpaceZoneDef | null {
  return Object.values(ZONES).find((z) => z.station?.dockLocation === locationId) ?? null;
}
