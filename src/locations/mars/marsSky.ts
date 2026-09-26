import * as THREE from 'three';
import { smoothstep } from '../../engine/math';

/** A compressed sol (real: 24 h 39 min). */
export const MARS_DAY = 6000;
/** Dust storms roll through on this cycle once the station has been found. */
const STORM_CYCLE = 1500;

/** Sun direction over Melas Chasma: rises in the east (+X), crosses the sky to the south-ish, sets west. */
export function marsSunDirection(clock: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phase = ((clock + MARS_DAY * 0.1) % MARS_DAY) / MARS_DAY;
  const h = phase * Math.PI * 2;
  return out.set(Math.cos(h), Math.sin(h) * 0.85, 0.35).normalize();
}

/** 0..1 dust storm strength. */
export function marsStorm(clock: number, enabled: boolean): number {
  if (!enabled) return 0;
  const k = (clock % STORM_CYCLE) / STORM_CYCLE;
  return smoothstep(0.7, 0.78, k) * (1 - smoothstep(0.93, 1, k));
}

/**
 * The Martian sky: fine suspended dust makes the day sky butterscotch and — through forward
 * scattering — the sky around the Sun blue, most striking at sunset (as the rovers saw).
 * The Sun is smaller than from Earth (~0.35°). At night the dome fades and stars show.
 */
export class MarsSkyDome {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  /** Colour of the horizon right now (for fog/background matching). */
  readonly horizon = new THREE.Color();

  constructor(radius: number) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: 1 }, uStorm: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uDay; uniform float uStorm;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float elev = d.y;
          float mu = dot(d, normalize(uSun));
          vec3 zenith = vec3(0.50,0.33,0.22);
          vec3 horizon = vec3(0.84,0.63,0.44);
          vec3 col = mix(horizon, zenith, pow(clamp(elev,0.0,1.0), 0.55));
          float dusk = 1.0 - smoothstep(0.0, 0.3, uSun.y);
          float halo = pow(max(mu,0.0), 9.0);
          col = mix(col, vec3(0.42,0.6,0.86), halo * (0.25 + 0.6*dusk));
          col += vec3(1.0,0.92,0.8) * pow(max(mu,0.0), 220.0) * 1.2;
          col += vec3(1.0,0.98,0.92) * smoothstep(0.99990, 0.99996, mu) * 12.0 * (1.0 - uStorm*0.85);
          col *= mix(0.5, 1.0, smoothstep(-0.25, 0.04, elev));
          col = mix(col, vec3(0.52,0.31,0.19), uStorm*0.75);
          col *= 0.18 + 0.82*uDay;
          gl_FragColor = vec4(col, clamp(uDay*1.3 + uStorm*0.7, 0.0, 1.0));
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), this.mat);
    this.mesh.renderOrder = -8;
    this.mesh.frustumCulled = false;
  }

  update(camPos: THREE.Vector3, sunDir: THREE.Vector3, storm: number): { day: number } {
    this.mesh.position.copy(camPos);
    const day = smoothstep(-0.14, 0.12, sunDir.y);
    this.mat.uniforms.uSun.value.copy(sunDir);
    this.mat.uniforms.uDay.value = day;
    this.mat.uniforms.uStorm.value = storm;
    // CPU mirror of the horizon colour
    this.horizon.setRGB(0.84, 0.63, 0.44).lerp(new THREE.Color(0.52, 0.31, 0.19), storm * 0.75).multiplyScalar(0.18 + 0.82 * day);
    return { day };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
