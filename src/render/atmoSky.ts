import * as THREE from 'three';
import { smoothstep } from '../engine/math';

/**
 * Generic atmospheric sky dome: zenith/horizon gradient, a coloured halo around the Sun
 * (forward scattering), a small sun disc, darkening at night so stars show through.
 * `storm` blends toward a flat, darker murk (dust, haze, rain).
 */
export class AtmoSkyDome {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  readonly horizon = new THREE.Color();
  private hz: THREE.Color;
  private murk: THREE.Color;

  constructor(radius: number, zenith: string, horizon: string, halo: string, disc = 1) {
    this.hz = new THREE.Color(horizon);
    this.murk = this.hz.clone().multiplyScalar(0.6);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
      uniforms: {
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uDay: { value: 1 },
        uStorm: { value: 0 },
        uZenith: { value: new THREE.Color(zenith) },
        uHorizon: { value: this.hz.clone() },
        uHalo: { value: new THREE.Color(halo) },
        uMurk: { value: this.murk.clone() },
        uDisc: { value: disc },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uDay; uniform float uStorm; uniform float uDisc;
        uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHalo; uniform vec3 uMurk;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float elev = d.y;
          float mu = dot(d, normalize(uSun));
          vec3 col = mix(uHorizon, uZenith, pow(clamp(elev,0.0,1.0), 0.55));
          float dusk = 1.0 - smoothstep(0.0, 0.3, uSun.y);
          col = mix(col, uHalo, pow(max(mu,0.0), 9.0) * (0.3 + 0.5*dusk));
          col += vec3(1.0,0.93,0.82) * pow(max(mu,0.0), 220.0) * 1.1;
          col += vec3(1.0,0.97,0.9) * smoothstep(1.0 - 0.00009*uDisc*uDisc, 1.0 - 0.00004*uDisc*uDisc, mu) * 10.0 * (1.0 - uStorm*0.9);
          col *= mix(0.5, 1.0, smoothstep(-0.25, 0.04, elev));
          col = mix(col, uMurk, uStorm*0.8);
          col *= 0.15 + 0.85*uDay;
          gl_FragColor = vec4(col, clamp(uDay*1.3 + uStorm*0.8, 0.0, 1.0));
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), this.mat);
    this.mesh.renderOrder = -8;
    this.mesh.frustumCulled = false;
  }

  update(camPos: THREE.Vector3, sunDir: THREE.Vector3, storm: number): { day: number } {
    this.mesh.position.copy(camPos);
    const day = smoothstep(-0.14, 0.12, sunDir.y);
    const u = this.mat.uniforms;
    u.uSun.value.copy(sunDir);
    u.uDay.value = day;
    u.uStorm.value = storm;
    this.horizon.copy(this.hz).lerp(this.murk, storm * 0.8).multiplyScalar(0.15 + 0.85 * day);
    return { day };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
