import type { Game } from '../Game';
import type { Location } from './Location';
import { ZONES } from '../content/zones';
import { SURFACES, INTERIORS } from '../content/worlds';

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

// Data-driven worlds: every space zone, surface region and interior declared in content.
for (const z of Object.values(ZONES)) {
  if (LOCATION_REGISTRY[z.id]) continue;
  LOCATION_REGISTRY[z.id] = {
    name: z.name,
    body: z.body,
    kind: 'space',
    loadingText: 'Orbit insertion…',
    create: async (g) => new (await import('./space/SpaceZone')).SpaceZone(g, z),
  };
}
for (const d of Object.values(SURFACES)) {
  LOCATION_REGISTRY[d.id] = {
    name: d.name,
    body: d.body,
    kind: 'surface',
    loadingText: `Stepping out onto ${d.title}…`,
    create: async (g) => new (await import('./surface/SurfaceRegion')).SurfaceRegion(g, d),
  };
}
for (const d of Object.values(INTERIORS)) {
  LOCATION_REGISTRY[d.id] = {
    name: d.name,
    body: d.body,
    kind: d.style === 'alien' ? 'interior' : 'station',
    loadingText: d.style === 'alien' ? '…' : 'Cycling the airlock…',
    create: async (g) => new (await import('./interior/GenericInterior')).GenericInterior(g, d),
  };
}
