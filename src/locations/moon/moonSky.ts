import * as THREE from 'three';
import { DAY_LENGTH } from '../../gameplay/presence';

/**
 * Lunar south-polar sun model (compressed time): the Sun circles the horizon once per
 * day cycle at a very low elevation, dipping just below it for a short "night". This is
 * what gives the pole its endless long shadows and peaks of near-eternal light.
 */
export function moonSunDirection(clock: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phase = clock / DAY_LENGTH;
  const az = phase * Math.PI * 2 + 0.6;
  const elev = THREE.MathUtils.degToRad(5 + 5.5 * Math.sin(phase * Math.PI * 2 * 1 - 0.3));
  return out.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
}

/** 0..1 solar illumination factor for base power at the pole. */
export function moonSunFactor(clock: number): number {
  const d = moonSunDirection(clock);
  return THREE.MathUtils.smoothstep(d.y, -0.01, 0.06);
}

/** Earth is fixed in the lunar sky (tidal locking); from the south pole it grazes the horizon. */
export const EARTH_DIR = new THREE.Vector3(-0.8, Math.tan(THREE.MathUtils.degToRad(1.4)), -0.6).normalize();
