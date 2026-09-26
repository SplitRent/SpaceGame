import * as THREE from 'three';
import { clamp, damp, lerp } from '../engine/math';

/**
 * Procedurally built stylised astronaut with a rigid-segment rig and procedural animation.
 * Used for the player and all crew. Appearance is data (colours, height); animation is a
 * set of blended procedural poses driven by speed/grounded/activity.
 */
export interface AstronautLook {
  suit: string;
  accent: string;
  skin: string;
  hair: string;
  height: number;
  helmet: boolean;
}

export type Activity = 'idle' | 'work' | 'sit' | 'sleep' | 'injured' | 'talk' | 'wave' | 'patrol';

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true; // survives location disposal
    geoCache.set(key, g);
  }
  return g;
}

function box(w: number, h: number, d: number, bevel = true): THREE.BufferGeometry {
  return geo(`box:${w}:${h}:${d}:${bevel}`, () => {
    if (!bevel) return new THREE.BoxGeometry(w, h, d);
    // Rounded box approximation via capsule-ish scaling of a low-poly sphere-box.
    const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const nx = v.x / (w / 2), ny = v.y / (h / 2), nz = v.z / (d / 2);
      const corner = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
      if (corner > 2.5) v.multiplyScalar(0.9);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}
function capsule(r: number, len: number): THREE.BufferGeometry {
  return geo(`cap:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 8));
}
function sphere(r: number, w = 12, h = 8): THREE.BufferGeometry {
  return geo(`sph:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
}

export class Astronaut {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private helmet: THREE.Group;
  private headBare: THREE.Group;
  private shoulderL = new THREE.Group();
  private shoulderR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private materials: THREE.Material[] = [];
  private visorMat: THREE.MeshStandardMaterial;
  private lampMat: THREE.MeshStandardMaterial;
  readonly headLamp: THREE.SpotLight | null = null;

  /* animation state */
  private phase = 0;
  private blendMove = 0;
  private blendAir = 0;
  private blendSit = 0;
  private blendWork = 0;
  private blendInjured = 0;
  private blendSleep = 0;
  private blendWave = 0;
  private time = Math.random() * 10;
  /** Head look offset (radians), used by player camera / NPC talk. */
  lookPitch = 0;
  lookYaw = 0;

  constructor(readonly look: AstronautLook, opts: { headLamp?: boolean } = {}) {
    const s = look.height / 1.8;
    const suit = this.mat(new THREE.MeshStandardMaterial({ color: look.suit, roughness: 0.75, metalness: 0.05, flatShading: true }));
    const accent = this.mat(new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.6, metalness: 0.1, flatShading: true }));
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.8, flatShading: true }));
    const metal = this.mat(new THREE.MeshStandardMaterial({ color: '#a9b0b8', roughness: 0.35, metalness: 0.8, flatShading: true }));
    this.visorMat = this.mat(new THREE.MeshStandardMaterial({ color: '#1b2533', roughness: 0.08, metalness: 0.9, emissive: '#c98a2e', emissiveIntensity: 0.08 })) as THREE.MeshStandardMaterial;
    this.lampMat = this.mat(new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: '#fff1c8', emissiveIntensity: 0 })) as THREE.MeshStandardMaterial;
    const skin = this.mat(new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7, flatShading: true }));
    const hair = this.mat(new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9, flatShading: true }));
    const eye = this.mat(new THREE.MeshBasicMaterial({ color: '#15171c' }));

    const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    this.root.add(this.hips);
    this.hips.position.y = 0.95 * s;
    // pelvis
    add(this.hips, box(0.34 * s, 0.18 * s, 0.22 * s), suit, 0, 0, 0);
    add(this.hips, box(0.36 * s, 0.05 * s, 0.24 * s), accent, 0, 0.08 * s, 0);

    // spine / torso
    this.hips.add(this.spine);
    this.spine.position.y = 0.08 * s;
    add(this.spine, box(0.42 * s, 0.42 * s, 0.26 * s), suit, 0, 0.24 * s, 0);
    add(this.spine, box(0.3 * s, 0.14 * s, 0.05 * s), dark, 0, 0.3 * s, 0.14 * s); // chest control box
    const light = add(this.spine, box(0.04 * s, 0.03 * s, 0.02 * s), this.mat(new THREE.MeshStandardMaterial({ color: '#3cff9a', emissive: '#3cff9a', emissiveIntensity: 2 })), 0.08 * s, 0.33 * s, 0.17 * s);
    light.castShadow = false;
    add(this.spine, box(0.44 * s, 0.05 * s, 0.28 * s), accent, 0, 0.44 * s, 0); // collar ring base
    // backpack (PLSS)
    add(this.spine, box(0.4 * s, 0.5 * s, 0.2 * s), suit, 0, 0.26 * s, -0.22 * s);
    add(this.spine, box(0.3 * s, 0.1 * s, 0.05 * s), accent, 0, 0.42 * s, -0.33 * s);
    add(this.spine, capsule(0.035 * s, 0.3 * s), metal, 0.16 * s, 0.25 * s, -0.33 * s);

    // neck & head
    this.spine.add(this.neck);
    this.neck.position.y = 0.5 * s;
    this.helmet = new THREE.Group();
    this.neck.add(this.helmet);
    add(this.helmet, sphere(0.19 * s, 14, 10), suit, 0, 0.13 * s, -0.01 * s);
    const visor = add(this.helmet, sphere(0.165 * s, 14, 10), this.visorMat, 0, 0.14 * s, 0.045 * s);
    visor.scale.set(1, 0.85, 0.9);
    add(this.helmet, box(0.08 * s, 0.05 * s, 0.05 * s), metal, 0.15 * s, 0.24 * s, 0.05 * s);
    const lampMesh = add(this.helmet, box(0.05 * s, 0.03 * s, 0.03 * s), this.lampMat, -0.15 * s, 0.24 * s, 0.08 * s);
    lampMesh.castShadow = false;
    if (opts.headLamp) {
      const lamp = new THREE.SpotLight('#fff3dc', 0, 45, 0.55, 0.6, 1.2);
      lamp.position.set(-0.15 * s, 0.24 * s, 0.1 * s);
      lamp.target.position.set(-0.15 * s, 0.1 * s, 3);
      lamp.castShadow = false;
      this.helmet.add(lamp, lamp.target);
      (this as { headLamp: THREE.SpotLight | null }).headLamp = lamp;
    }

    this.headBare = new THREE.Group();
    this.neck.add(this.headBare);
    add(this.headBare, capsule(0.06 * s, 0.05 * s), skin, 0, 0.03 * s, 0);
    const head = add(this.headBare, sphere(0.12 * s, 12, 10), skin, 0, 0.15 * s, 0.01 * s);
    head.scale.set(0.95, 1.1, 1.0);
    const hairCap = add(this.headBare, sphere(0.128 * s, 12, 8), hair, 0, 0.19 * s, -0.012 * s);
    hairCap.scale.set(1, 0.8, 1.02);
    add(this.headBare, sphere(0.016 * s, 6, 4), eye, -0.042 * s, 0.16 * s, 0.115 * s).castShadow = false;
    add(this.headBare, sphere(0.016 * s, 6, 4), eye, 0.042 * s, 0.16 * s, 0.115 * s).castShadow = false;
    this.setHelmet(look.helmet);

    // arms
    const arm = (shoulder: THREE.Group, elbow: THREE.Group, side: number) => {
      this.spine.add(shoulder);
      shoulder.position.set(side * 0.26 * s, 0.4 * s, 0);
      add(shoulder, sphere(0.085 * s, 8, 6), accent, 0, 0, 0);
      add(shoulder, capsule(0.065 * s, 0.18 * s), suit, 0, -0.16 * s, 0);
      shoulder.add(elbow);
      elbow.position.y = -0.3 * s;
      add(elbow, capsule(0.058 * s, 0.17 * s), suit, 0, -0.13 * s, 0);
      add(elbow, box(0.1 * s, 0.05 * s, 0.1 * s), accent, 0, -0.22 * s, 0);
      add(elbow, box(0.085 * s, 0.1 * s, 0.1 * s), dark, 0, -0.3 * s, 0.01 * s); // glove
    };
    arm(this.shoulderL, this.elbowL, -1);
    arm(this.shoulderR, this.elbowR, 1);

    // legs
    const leg = (hip: THREE.Group, knee: THREE.Group, side: number) => {
      this.hips.add(hip);
      hip.position.set(side * 0.11 * s, -0.05 * s, 0);
      add(hip, capsule(0.085 * s, 0.26 * s), suit, 0, -0.21 * s, 0);
      hip.add(knee);
      knee.position.y = -0.43 * s;
      add(knee, sphere(0.08 * s, 8, 6), accent, 0, 0, 0.01 * s);
      add(knee, capsule(0.075 * s, 0.24 * s), suit, 0, -0.2 * s, 0);
      add(knee, box(0.14 * s, 0.11 * s, 0.26 * s), dark, 0, -0.42 * s, 0.04 * s); // boot
      add(knee, box(0.15 * s, 0.03 * s, 0.27 * s), accent, 0, -0.37 * s, 0.04 * s);
    };
    leg(this.hipL, this.kneeL, -1);
    leg(this.hipR, this.kneeR, 1);
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  setHelmet(on: boolean): void {
    this.helmet.visible = on;
    this.headBare.visible = !on;
    this.look.helmet = on;
  }

  setHeadLamp(on: boolean): void {
    this.lampMat.emissiveIntensity = on ? 4 : 0;
    if (this.headLamp) this.headLamp.intensity = on ? 60 : 0;
  }

  /** Hide head geometry (first-person camera inside helmet). */
  setHeadVisible(v: boolean): void {
    this.neck.visible = v;
  }

  /**
   * Advance procedural animation.
   * @param speed horizontal speed (m/s)
   * @param grounded whether on ground
   * @param gravity local gravity (m/s^2); low gravity => bounding gait
   */
  animate(dt: number, speed: number, grounded: boolean, activity: Activity, gravity = 9.8): void {
    this.time += dt;
    const lowG = gravity < 4;
    const moveTarget = grounded ? clamp(speed / 1.6, 0, 1) : 0;
    this.blendMove = lerp(this.blendMove, moveTarget, damp(10, dt));
    this.blendAir = lerp(this.blendAir, grounded ? 0 : 1, damp(8, dt));
    this.blendSit = lerp(this.blendSit, activity === 'sit' ? 1 : 0, damp(5, dt));
    this.blendWork = lerp(this.blendWork, activity === 'work' ? 1 : 0, damp(5, dt));
    this.blendInjured = lerp(this.blendInjured, activity === 'injured' ? 1 : 0, damp(5, dt));
    this.blendSleep = lerp(this.blendSleep, activity === 'sleep' ? 1 : 0, damp(4, dt));
    this.blendWave = lerp(this.blendWave, activity === 'wave' ? 1 : 0, damp(6, dt));

    const cadence = lowG ? 1.7 : speed > 3 ? 2.6 : 1.9;
    this.phase += dt * cadence * Math.PI * 2 * clamp(speed / (lowG ? 2.2 : 1.6), 0.35, 1.6) * (this.blendMove > 0.02 ? 1 : 0);
    const p = this.phase;
    const m = this.blendMove;
    const run = clamp((speed - 2.5) / 2, 0, 1);

    // Idle breathing
    const breathe = Math.sin(this.time * 1.6) * 0.012;

    // Walk/bound cycle
    const stride = lowG ? 0.55 : 0.45 + run * 0.25;
    const legSwing = Math.sin(p) * stride * m;
    const kneeBend = (lowG ? 0.35 : 0.25) * m + Math.max(0, Math.sin(p + 1.2)) * 0.6 * m;
    const kneeBendR = (lowG ? 0.35 : 0.25) * m + Math.max(0, Math.sin(p + Math.PI + 1.2)) * 0.6 * m;
    // Low-g "bunny hop": both legs together more
    const hop = lowG ? Math.abs(Math.sin(p)) : 0;

    this.hipL.rotation.x = lowG ? -Math.sin(p) * 0.25 * m - hop * 0.25 * m : legSwing;
    this.hipR.rotation.x = lowG ? -Math.sin(p) * 0.25 * m - hop * 0.25 * m : -legSwing;
    this.kneeL.rotation.x = kneeBend + (lowG ? hop * 0.4 * m : 0);
    this.kneeR.rotation.x = kneeBendR + (lowG ? hop * 0.4 * m : 0);
    const bob = lowG ? hop * 0.12 * m : Math.abs(Math.sin(p)) * 0.04 * m;
    this.hips.position.y = (0.95 + breathe * 0.3 + bob - 0.02 * m) * (this.look.height / 1.8);

    const armSwing = Math.sin(p) * (0.35 + run * 0.4) * m;
    this.shoulderL.rotation.set(-armSwing, 0, 0.12 + (lowG ? 0.25 * m : 0));
    this.shoulderR.rotation.set(armSwing, 0, -0.12 - (lowG ? 0.25 * m : 0));
    this.elbowL.rotation.x = -0.25 - run * 0.6 * m;
    this.elbowR.rotation.x = -0.25 - run * 0.6 * m;
    this.spine.rotation.x = 0.06 * m + run * 0.12 + breathe;

    // Airborne: tuck legs, arms out
    const a = this.blendAir;
    if (a > 0.01) {
      this.hipL.rotation.x = lerp(this.hipL.rotation.x, -0.5, a);
      this.hipR.rotation.x = lerp(this.hipR.rotation.x, -0.3, a);
      this.kneeL.rotation.x = lerp(this.kneeL.rotation.x, 0.9, a);
      this.kneeR.rotation.x = lerp(this.kneeR.rotation.x, 0.6, a);
      this.shoulderL.rotation.z = lerp(this.shoulderL.rotation.z, 0.7, a);
      this.shoulderR.rotation.z = lerp(this.shoulderR.rotation.z, -0.7, a);
    }

    // Work: arms forward, slight crouch, hands moving
    const w = this.blendWork;
    if (w > 0.01) {
      const t = this.time;
      this.shoulderL.rotation.x = lerp(this.shoulderL.rotation.x, -1.1 + Math.sin(t * 3.1) * 0.15, w);
      this.shoulderR.rotation.x = lerp(this.shoulderR.rotation.x, -1.2 + Math.sin(t * 2.3 + 1) * 0.2, w);
      this.elbowL.rotation.x = lerp(this.elbowL.rotation.x, -0.6, w);
      this.elbowR.rotation.x = lerp(this.elbowR.rotation.x, -0.5 + Math.sin(t * 4) * 0.2, w);
      this.spine.rotation.x = lerp(this.spine.rotation.x, 0.25, w);
    }

    // Sit
    const si = this.blendSit;
    if (si > 0.01) {
      this.hipL.rotation.x = lerp(this.hipL.rotation.x, -1.5, si);
      this.hipR.rotation.x = lerp(this.hipR.rotation.x, -1.5, si);
      this.kneeL.rotation.x = lerp(this.kneeL.rotation.x, 1.5, si);
      this.kneeR.rotation.x = lerp(this.kneeR.rotation.x, 1.5, si);
      const s = this.look.height / 1.8;
      this.hips.position.y = lerp(this.hips.position.y, 0.55 * s, si);
    }

    // Injured: hunched, one arm holding side, sitting on floor
    const inj = this.blendInjured;
    if (inj > 0.01) {
      const s = this.look.height / 1.8;
      this.hips.position.y = lerp(this.hips.position.y, 0.2 * s, inj);
      this.hipL.rotation.x = lerp(this.hipL.rotation.x, -1.4, inj);
      this.hipR.rotation.x = lerp(this.hipR.rotation.x, -1.1, inj);
      this.kneeL.rotation.x = lerp(this.kneeL.rotation.x, 0.6, inj);
      this.kneeR.rotation.x = lerp(this.kneeR.rotation.x, 1.2, inj);
      this.spine.rotation.x = lerp(this.spine.rotation.x, -0.35 + breathe * 3, inj);
      this.shoulderR.rotation.x = lerp(this.shoulderR.rotation.x, -0.4, inj);
      this.elbowR.rotation.x = lerp(this.elbowR.rotation.x, -1.6, inj);
      this.shoulderR.rotation.z = lerp(this.shoulderR.rotation.z, 0.4, inj);
    }

    // Sleep: lying down (rotate root handled by caller via pose), here just relax
    const sl = this.blendSleep;
    if (sl > 0.01) {
      this.hips.rotation.x = lerp(0, -Math.PI / 2, sl);
      const s = this.look.height / 1.8;
      this.hips.position.y = lerp(this.hips.position.y, 0.35 * s, sl);
    } else this.hips.rotation.x = 0;

    // Wave
    const wv = this.blendWave;
    if (wv > 0.01) {
      this.shoulderR.rotation.z = lerp(this.shoulderR.rotation.z, -2.6, wv);
      this.elbowR.rotation.z = Math.sin(this.time * 8) * 0.4 * wv;
    } else this.elbowR.rotation.z = 0;

    // Head look
    this.neck.rotation.set(clamp(this.lookPitch, -0.6, 0.5), clamp(this.lookYaw, -1.1, 1.1), 0);
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}

export const PLAYER_LOOK: AstronautLook = {
  suit: '#e9ecef',
  accent: '#ff8a3d',
  skin: '#c68c6a',
  hair: '#2b1d16',
  height: 1.78,
  helmet: true,
};
