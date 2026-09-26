import type { SurfaceDef, InteriorDef } from '../worldTypes';
import { CERES_SURFACE, CERES_DEEP } from './ceres';
import { EUROPA_SURFACE, TITAN_SURFACE, PLUTO_SURFACE } from './outer';
import { THRESHOLD_HALL, VESPER_GATEHALL, VESPER_SURFACE, ARCHIVE } from './beyond';
import { HALCYON, MERCURY_SURFACE } from './inner';

/** Every data-driven surface region, by location id. */
export const SURFACES: Record<string, SurfaceDef> = Object.fromEntries(
  [CERES_SURFACE, EUROPA_SURFACE, TITAN_SURFACE, PLUTO_SURFACE, VESPER_SURFACE, MERCURY_SURFACE].map((d) => [d.id, d]),
);

/** Every data-driven interior, by location id. */
export const INTERIORS: Record<string, InteriorDef> = Object.fromEntries(
  [CERES_DEEP, THRESHOLD_HALL, VESPER_GATEHALL, ARCHIVE, HALCYON].map((d) => [d.id, d]),
);
