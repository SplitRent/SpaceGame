import * as THREE from 'three';

/**
 * Pooled CPU-simulated point particles. One pool per location scene; fixed capacity,
 * so particle bursts can never grow memory unbounded. Gravity and drag are per-emit
 * (vacuum dust follows ballistic arcs with no drag).
 */
export interface EmitOptions {
  count: number;
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  spread: number;
  life: [number, number];
  size: number;
  color: THREE.ColorRepresentation;
  gravity?: number;
  drag?: number;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  gl_FragColor = vec4(vColor, vAlpha * (1.0 - r * 4.0));
}`;

export class ParticlePool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private color: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private alive = 0;

  constructor(private capacity = 2000, additive = false) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(o: EmitOptions): void {
    const c = new THREE.Color(o.color);
    for (let n = 0; n < o.count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const i3 = i * 3;
      this.pos[i3] = o.position.x;
      this.pos[i3 + 1] = o.position.y;
      this.pos[i3 + 2] = o.position.z;
      const v = o.velocity ?? new THREE.Vector3();
      this.vel[i3] = v.x + (Math.random() - 0.5) * 2 * o.spread;
      this.vel[i3 + 1] = v.y + (Math.random() - 0.5) * 2 * o.spread;
      this.vel[i3 + 2] = v.z + (Math.random() - 0.5) * 2 * o.spread;
      const l = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.size[i] = o.size * (0.6 + Math.random() * 0.8);
      this.color[i3] = c.r;
      this.color[i3 + 1] = c.g;
      this.color[i3 + 2] = c.b;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0;
    }
    this.alive = this.capacity;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      any = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.max(0, Math.min(1, t * 1.5));
    }
    if (!any) this.alive = 0;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }
}
