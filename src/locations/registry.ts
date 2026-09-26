import type { Game } from '../Game';
import type { Location } from './Location';
import { ZONES } from '../content/zones';

export interface LocationEntry {
  name: string;
  body: string;
  kind: 'surface' | 'interior' | 'station' | 'space' | 'cinematic' | 'cave';
  loadingText?: string;
  /** Lazily imported so each location is its own code-split chunk. */
  create(game: Game): Promise<Location>;
}

export const LOCATION_REGISTRY: Record<string, LocationEntry> = {
  'moon.south': {
    name: 'Lunar South Polar Region',
    body: 'moon',
    kind: 'surface',
    loadingText: 'Stepping onto the regolith…',
    create: async (g) => new (await import('./moon/MoonSurface')).MoonSurface(g),
  },
  'lantern.interior': {
    name: 'EXV Lantern',
    body: 'moon',
    kind: 'interior',
    loadingText: 'Cycling airlock…',
    create: async (g) => new (await import('./lantern/LanternInterior')).LanternInterior(g),
  },
  'moon.kepler9': {
    name: 'Outpost Kepler-9',
    body: 'moon',
    kind: 'cave',
    loadingText: 'Descending into Kepler-9…',
    create: async (g) => new (await import('./moon/Kepler9')).Kepler9(g),
  },
  'space.cislunar': {
    name: 'Lunar Orbit',
    body: 'moon',
    kind: 'space',
    loadingText: 'Ascending…',
    create: async (g) => new (await import('./space/SpaceZone')).SpaceZone(g, ZONES['space.cislunar']),
  },
  'space.mars': {
    name: 'Mars Orbit',
    body: 'mars',
    kind: 'space',
    loadingText: 'Orbit insertion…',
    create: async (g) => new (await import('./space/SpaceZone')).SpaceZone(g, ZONES['space.mars']),
  },
  'space.transit': {
    name: 'Interplanetary Transit',
    body: 'sun',
    kind: 'space',
    loadingText: 'Taking the helm…',
    create: async (g) => new (await import('./space/Transit')).Transit(g),
  },
  'mars.melas': {
    name: 'Melas Chasma, Mars',
    body: 'mars',
    kind: 'surface',
    loadingText: 'Stepping onto Mars…',
    create: async (g) => new (await import('./mars/MarsSurface')).MarsSurface(g),
  },
  'mars.station': {
    name: 'Melas Station',
    body: 'mars',
    kind: 'station',
    loadingText: 'Cycling the station airlock…',
    create: async (g) => new (await import('./mars/MelasStation')).MelasStation(g),
  },
  'harbor.interior': {
    name: 'Harbor Station',
    body: 'moon',
    kind: 'station',
    loadingText: 'Docking clamps engaged. Equalizing pressure…',
    create: async (g) => new (await import('./harbor/HarborStation')).HarborStation(g),
  },
  'cinematic.opening': {
    name: 'Earth',
    body: 'earth',
    kind: 'cinematic',
    loadingText: '',
    create: async (g) => new (await import('./cinematic/OpeningStage')).OpeningStage(g),
  },
};
