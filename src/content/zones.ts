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
  planet: { kind: string; radiusKm: number; rot?: Vec3 };
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
  landing: { location: string; spawn: string; label: string; scan: string; text: string };
  station?: {
    model: 'harbor';
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
};

/** Which space zone sits above a surface location (for take-off). */
export function zoneForSurface(locationId: string): SpaceZoneDef | null {
  return Object.values(ZONES).find((z) => z.landing.location === locationId) ?? null;
}

/** Which space zone a docked station belongs to. */
export function zoneForStation(locationId: string): SpaceZoneDef | null {
  return Object.values(ZONES).find((z) => z.station?.dockLocation === locationId) ?? null;
}
