import type { Condition, Effect } from './types';
import type { Vec3 } from '../state/GameState';
import type { Atmosphere, LocationEnv } from '../locations/Location';

/**
 * Data definitions for generic surface regions and interiors. Every world after Mars is
 * *content*: terrain features, palette, sky, points of interest and their effects are
 * declared here and rendered by `SurfaceRegion` / `GenericInterior`.
 */

export type TerrainFeature =
  /** Encircling walls/rim that bound the region (hides the edge of the playable area). */
  | { kind: 'rim'; r0: number; r1: number; h: number }
  /** Gaussian hill (h > 0) or bowl (h < 0). */
  | { kind: 'mound'; x: number; z: number; r: number; h: number }
  /** Straight ridge; `double` makes a Europa-style double ridge with a central trough. */
  | { kind: 'ridge'; x0: number; z0: number; x1: number; z1: number; w: number; h: number; double?: boolean }
  /** Chaos terrain: tilted, flat-topped blocks of crust scattered in a disc. */
  | { kind: 'blocks'; x: number; z: number; r: number; count: number; h: number; size: [number, number] }
  /** Convection-cell polygons (Sputnik Planitia): troughs along cell edges. */
  | { kind: 'cells'; scale: number; depth: number; x?: number; z?: number; r?: number }
  /** Linear dune field. */
  | { kind: 'dunes'; wavelength: number; h: number; angle: number; x: number; z: number; r: number }
  /** Rugged massif from ridged noise. */
  | { kind: 'mountains'; x: number; z: number; r: number; h: number }
  /** Flat-floored depression (lake bed, crater floor). */
  | { kind: 'basin'; x: number; z: number; r: number; depth: number }
  /** Flat pad (landing zones, structures). */
  | { kind: 'flatten'; x: number; z: number; r: number; falloff?: number }
  /** Fresh bowl crater with a raised rim. */
  | { kind: 'crater'; x: number; z: number; r: number; depth: number };

export type ColorLayer =
  | { mask: 'noise'; color: string; scale: number; threshold?: number; amount: number }
  | { mask: 'slope'; color: string; amount: number }
  | { mask: 'height'; color: string; above?: number; below?: number; amount: number }
  | { mask: 'lineae'; color: string; scale: number; width: number; amount: number }
  | { mask: 'patch'; color: string; x: number; z: number; r: number; amount: number }
  | { mask: 'crater'; color: string; amount: number }
  | { mask: 'cells'; color: string; amount: number };

export type SkyDef =
  | { kind: 'space'; starBrightness?: number }
  | { kind: 'atmo'; zenith: string; horizon: string; halo: string; fogNear: number; fogFar: number; nightStars?: number };

export interface PoiInteract {
  prompt: string;
  detail?: string;
  available?: Condition;
  /** Items consumed (checked first; a warning explains what is missing). */
  requires?: { item: string; qty: number }[];
  effects?: Effect[];
  /** Mark done after first use (persisted as entity state). */
  once?: boolean;
  log?: { title: string; text: string };
  travel?: { location: string; spawn: string; label?: string };
  /** Opens a named custom panel (e.g. 'glyph'). */
  panel?: string;
  kind?: 'use' | 'panel' | 'talk' | 'pickup' | 'door';
  range?: number;
}

export type PoiKind =
  | 'hab' | 'dome' | 'wreck' | 'spire' | 'seed' | 'terminal' | 'crate' | 'pylon' | 'geyser' | 'ruin'
  | 'marker' | 'recorder' | 'npcspot' | 'beacon' | 'dish' | 'drill' | 'hatch';

export interface PoiDef {
  id: string;
  kind: PoiKind;
  x: number;
  z: number;
  rot?: number;
  scale?: number;
  /** Visual variant (wreck: lander/rover/rotorcraft/probe/debris; ruin: arch/pillars/gate/stair). */
  variant?: string;
  scan?: string;
  interact?: PoiInteract;
  /** Multi-tool weld target (repair a pylon, splice a line…). */
  weld?: { label: string; available?: Condition; consumes?: { item: string; qty: number }[]; effects: Effect[]; time?: number };
  visibleIf?: Condition;
  /** Adds a spawn point with this id in front of the POI. */
  spawn?: string;
  /** Discovery zone around the POI. */
  zone?: { id: string; name: string; r: number };
  /** Level the ground under the POI (radius). */
  flat?: number;
  /** Light colour for glowing POIs. */
  color?: string;
}

export interface NodeDef {
  id: string;
  label: string;
  color: string;
  yields: [string, number][];
  alt?: [string, number][];
  db: string;
  count: number;
  /** Placement disc; omitted = anywhere below `maxHeight`. */
  x?: number;
  z?: number;
  r?: number;
  maxHeight?: number;
  shiny?: boolean;
  glow?: string;
}

export interface FaunaDef {
  kind: 'grazer' | 'kite' | 'stalker';
  count: number;
  x: number;
  z: number;
  r: number;
}

export interface SurfaceDef {
  id: string;
  name: string;
  /** Celestial body id. */
  body: string;
  title: string;
  subtitle: string;
  seed: number;
  size: number;
  gravity: number;
  atmosphere: Atmosphere;
  /** Suit HUD label for the outside air when not breathable. */
  airLabel: string;
  /** °C at full day and at night (or fixed day value). */
  temperature: [number, number];
  /** Suit heater strain threshold (°C). Outer-system suit liners are rated lower. */
  coldLimit?: number;
  /** Health per second lost outside (Jupiter's radiation belts). */
  radiationDamage?: number;
  ambience: LocationEnv['ambience'];
  terrain: { baseAmp: number; craterCount: number; craterMaxR: number; features: TerrainFeature[]; curvatureR: number };
  palette: { base: string; alt: string; altScale: number; layers: ColorLayer[]; rock: string; detail?: boolean };
  liquid?: { level: number; color: string; opacity: number; x: number; z: number; r: number; label: string };
  sky: SkyDef;
  sun: { dir: Vec3; color: string; intensity: number; /** Day/night cycle period (s); omitted = fixed */ cycle?: number; disc?: number };
  /** A planet hanging in the sky (Jupiter over Europa, Charon over Pluto). */
  skyBody?: { kind: string; angularDeg: number; dir: Vec3; spin?: number };
  fill: { sky: string; ground: string; intensity: number };
  lz: [number, number];
  pois: PoiDef[];
  nodes: NodeDef[];
  rocks: { count: number; maxScale: number };
  flora?: { count: number; x: number; z: number; r: number };
  fauna?: FaunaDef[];
  weather?: { kind: 'snow' | 'rain' | 'dust' | 'spores'; color: string; density: number };
  /** Regolith-equivalent collected from the ground itself. */
  ground: { label: string; item: string; db: string };
  arrival: { lines: [string, string][]; hint: string };
}

export interface InteriorProp {
  kind: 'desk' | 'bunk' | 'rack' | 'table' | 'crate' | 'plant' | 'pillar' | 'glyphwall' | 'pool' | 'plinth' | 'screen' | 'tank';
  x: number;
  z: number;
  rot?: number;
  y?: number;
  w?: number;
  h?: number;
  d?: number;
}

export interface InteriorPoint extends PoiInteract {
  id: string;
  x: number;
  y: number;
  z: number;
  size?: [number, number, number];
  color?: string;
  visibleIf?: Condition;
  scan?: string;
}

export interface InteriorDef {
  id: string;
  name: string;
  body: string;
  style: 'human' | 'alien';
  gravity: number;
  temperature: number;
  rooms: import('../locations/lantern/interiorKit').RoomDef[];
  props: InteriorProp[];
  lights: { x: number; y?: number; z: number; color?: string; intensity?: number; range?: number }[];
  /** Colours of the world outside the windows. */
  outside: { ground: string; sky: string; fog?: [number, number] } | null;
  spawns: { id: string; x: number; z: number; yaw: number }[];
  spots: { id: string; x: number; z: number; yaw: number }[];
  points: InteriorPoint[];
  onEnter?: { flag: string; notify?: string; lines?: [string, string][] };
}
