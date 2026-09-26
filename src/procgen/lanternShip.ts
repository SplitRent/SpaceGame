import * as THREE from 'three';
import { KitBuilder, stdMat } from './kit';
import { hullPanelTexture, mliTexture } from './textures';

/**
 * EXV Lantern exterior — an original ~150 m landing-capable expedition ship.
 * Silhouette: a sleek lofted hull (command bow → habitation → wide engineering flare),
 * paired radiator wings, three main engine bells, belly landing struts, gold-foiled
 * propellant tanks, and the signature amber "lantern" beacon mast on the dorsal spine.
 *
 * Coordinate frame: +Z is aft, -Z is the bow, origin on the ground under mid-hull.
 */
export interface LanternOptions {
  damaged: boolean;
  /** 0..1 power level controls window/beacon glow. */
  power: number;
  landed: boolean;
  /** Extra length (m) on the port struts when levelling on sloped ground. */
  portStrutExtension?: number;
}

interface Section {
  z: number;
  w: number;
  h: number;
  y: number;
}

const HULL: Section[] = [
  { z: -54, w: 3, h: 2.5, y: 8.2 },
  { z: -49, w: 10, h: 6.5, y: 8 },
  { z: -40, w: 16, h: 9, y: 8.2 },
  { z: -27, w: 18, h: 10, y: 8.5 },
  { z: -25, w: 23, h: 11.5, y: 8.5 },
  { z: 14, w: 24, h: 12, y: 8.5 },
  { z: 19, w: 32, h: 14, y: 8 },
  { z: 48, w: 32, h: 14, y: 8 },
  { z: 56, w: 22, h: 12, y: 8 },
  { z: 61, w: 16, h: 10, y: 8 },
];

/** Build a lofted chamfered-rectangle hull. */
function loftHull(sections: Section[]): THREE.BufferGeometry {
  const ring = (s: Section): THREE.Vector3[] => {
    const hw = s.w / 2, hh = s.h / 2, c = Math.min(hw, hh) * 0.42;
    const pts: [number, number][] = [
      [hw - c, hh], [hw, hh - c], [hw, -hh + c * 0.6], [hw - c * 0.6, -hh],
      [-hw + c * 0.6, -hh], [-hw, -hh + c * 0.6], [-hw, hh - c], [-hw + c, hh],
    ];
    return pts.map(([x, y]) => new THREE.Vector3(x, s.y + y, s.z));
  };
  const rings = sections.map(ring);
  const pos: number[] = [];
  const uv: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: [number, number], ub: [number, number], uc: [number, number]) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    uv.push(...ua, ...ub, ...uc);
  };
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1];
    let perimA = 0;
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const segLen = A[i].distanceTo(A[j]);
      const u0 = perimA / 6, u1 = (perimA + segLen) / 6;
      const v0 = A[i].z / 6, v1 = B[i].z / 6;
      pushTri(A[i], B[i], A[j], [u0, v0], [u0, v1], [u1, v0]);
      pushTri(A[j], B[i], B[j], [u1, v0], [u0, v1], [u1, v1]);
      perimA += segLen;
    }
  }
  // caps
  for (const [ringPts, flip] of [[rings[0], true], [rings[rings.length - 1], false]] as const) {
    const c = ringPts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(8);
    for (let i = 0; i < 8; i++) {
      const a = ringPts[i], b = ringPts[(i + 1) % 8];
      if (flip) pushTri(c, a, b, [0, 0], [1, 0], [1, 1]);
      else pushTri(c, b, a, [0, 0], [1, 0], [1, 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export interface LanternModel {
  group: THREE.Group;
  /** Emissive materials whose intensity follows ship power. */
  setPower(p: number): void;
  setEngine(throttle: number): void;
  /** Local-space positions of interesting points. */
  anchors: {
    ramp: THREE.Vector3;
    rampTop: THREE.Vector3;
    airlock: THREE.Vector3;
    antenna: THREE.Vector3;
    weldPoints: THREE.Vector3[];
    beacon: THREE.Vector3;
    engines: THREE.Vector3[];
  };
  dispose(): void;
}

export function buildLantern(opts: LanternOptions): LanternModel {
  const hullTex = hullPanelTexture();
  const mats = {
    hull: stdMat('#e3e5e8', { map: hullTex, roughness: 0.55, metalness: 0.15, flatShading: true }),
    dark: stdMat('#3b4048', { roughness: 0.6, metalness: 0.4 }),
    accent: stdMat('#ff8a3d', { roughness: 0.5 }),
    metal: stdMat('#9aa3ad', { roughness: 0.35, metalness: 0.85 }),
    mli: stdMat('#d9a441', { map: mliTexture(), roughness: 0.3, metalness: 0.9 }),
    glass: stdMat('#10161d', { roughness: 0.05, metalness: 0.9, emissive: '#ffcf8a', emissiveIntensity: 0 }),
    radiator: stdMat('#2b3036', { roughness: 0.5, metalness: 0.3 }),
    scorch: stdMat('#15120f', { roughness: 1, metalness: 0 }),
    beacon: new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.3 }),
    nozzle: stdMat('#5a5f66', { roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }),
    engineGlow: new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  const kit = new KitBuilder(mats);

  // --- Hull
  kit.add('hull', loftHull(HULL), { x: 0, y: 0, z: 0 });
  // Dorsal spine ridge & accent stripe
  kit.box('hull', 4, 1.2, 70, { x: 0, y: 15.2, z: -2 });
  kit.box('accent', 24.4, 0.5, 1.2, { x: 0, y: 12.2, z: -24 });
  kit.box('accent', 32.4, 0.5, 1.2, { x: 0, y: 12.0, z: 19.5 });
  kit.box('accent', 0.3, 2.5, 18, { x: 12.1, y: 9, z: 0 });
  kit.box('accent', 0.3, 2.5, 18, { x: -12.1, y: 9, z: 0 });

  // --- Bridge canopy: wraparound window band on the bow
  for (const side of [-1, 1]) {
    kit.box('glass', 0.4, 2.2, 12, { x: side * 8.4, y: 10.3, z: -36 }, [0, side * 0.12, side * 0.25]);
  }
  kit.box('glass', 9, 2.2, 0.4, { x: 0, y: 10.4, z: -46.4 }, [0.35, 0, 0]);
  kit.box('glass', 12, 0.4, 7, { x: 0, y: 12.9, z: -41 }, [0.12, 0, 0]);

  // --- Habitation windows (rows of small ports)
  for (const side of [-1, 1]) {
    for (let z = -20; z <= 10; z += 3.2) {
      kit.box('glass', 0.3, 0.9, 1.6, { x: side * 12.02, y: 10.4, z });
    }
    // observation window at common area (left side, larger)
    if (side === -1) kit.box('glass', 0.35, 2.4, 7, { x: -12.05, y: 8.4, z: -10 });
  }

  // --- Airlock (right side, habitation)
  kit.box('dark', 0.6, 3.6, 3.2, { x: 12.2, y: 7.4, z: -9 });
  kit.box('accent', 0.7, 0.3, 3.6, { x: 12.3, y: 9.4, z: -9 });

  // --- Belly propellant tanks (gold foil)
  for (const side of [-1, 1]) {
    kit.cyl('mli', 2.6, 2.6, 30, { x: side * 9.5, y: 3.6, z: -4 }, [Math.PI / 2, 0, 0], 20);
    kit.add('mli', new THREE.SphereGeometry(2.6, 16, 10), { x: side * 9.5, y: 3.6, z: 11 });
    kit.add('mli', new THREE.SphereGeometry(2.6, 16, 10), { x: side * 9.5, y: 3.6, z: -19 });
  }

  // --- Engineering: reactor shield dome (dorsal) and radiators
  kit.cyl('metal', 6, 7, 3, { x: 0, y: 16, z: 34 }, undefined, 24);
  kit.add('hull', new THREE.SphereGeometry(6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), { x: 0, y: 17.5, z: 34 });
  const radiatorTilt = 0.18;
  for (const side of [-1, 1]) {
    const broken = opts.damaged && side === -1;
    const rot: [number, number, number] = broken ? [0.1, 0, side * -0.55] : [0, 0, side * radiatorTilt];
    for (let k = 0; k < 3; k++) {
      const z = 22 + k * 9;
      const x = side * (16 + 9);
      const y = broken ? 7 - k * 0.8 : 14 + 1.2;
      if (broken && k === 2) continue; // torn off
      kit.box('radiator', 18, 0.35, 8, { x, y, z }, rot);
      kit.box('metal', 18, 0.5, 0.3, { x, y: y + 0.2, z: z - 4 }, rot);
    }
    kit.box('metal', 3, 1, 28, { x: side * 16.5, y: 14.2, z: 31 });
  }

  // --- Engines
  const engines: THREE.Vector3[] = [];
  for (const ex of [-7.5, 0, 7.5]) {
    const ey = ex === 0 ? 8.5 : 7.5;
    kit.cyl('nozzle', 2.2, 4.2, 9, { x: ex, y: ey, z: 66 }, [Math.PI / 2, 0, 0], 24);
    kit.cyl('dark', 2.6, 2.4, 3, { x: ex, y: ey, z: 61 }, [Math.PI / 2, 0, 0], 16);
    engines.push(new THREE.Vector3(ex, ey, 70.5));
  }
  // RCS quads
  for (const [x, y, z] of [[11, 13, -20], [-11, 13, -20], [15, 14, 50], [-15, 14, 50], [8, 12.5, -44], [-8, 12.5, -44]]) {
    kit.box('dark', 1.2, 1.2, 1.2, { x, y, z });
    kit.cyl('metal', 0.25, 0.4, 0.7, { x: x + Math.sign(x) * 0.8, y, z }, [0, 0, Math.PI / 2], 8);
  }

  // --- Dorsal beacon mast: the "Lantern"
  const beacon = new THREE.Vector3(0, 21.5, -12);
  kit.cyl('metal', 0.35, 0.5, 6, { x: 0, y: 18, z: -12 }, undefined, 8);
  kit.cyl('beacon', 1.1, 1.1, 2.2, { x: 0, y: 21.5, z: -12 }, undefined, 12);
  kit.cyl('metal', 1.4, 1.4, 0.3, { x: 0, y: 22.7, z: -12 }, undefined, 12);
  kit.cyl('metal', 1.4, 1.4, 0.3, { x: 0, y: 20.3, z: -12 }, undefined, 12);

  // --- Comms dish (aft dorsal)
  const antenna = new THREE.Vector3(9, 17.5, 8);
  const dishBroken = opts.damaged;
  kit.cyl('metal', 0.3, 0.3, 4, { x: 9, y: 16, z: 8 }, undefined, 8);
  kit.add(
    'hull',
    new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.35),
    { x: 9, y: dishBroken ? 17.2 : 18.6, z: dishBroken ? 10 : 8 },
    dishBroken ? [1.9, 0.3, 0.4] : [Math.PI * 0.75, 0, 0],
  );

  // --- Landing struts
  const strutZ = [-30, 2, 42];
  for (const z of strutZ)
    for (const side of [-1, 1]) {
      const collapsed = opts.damaged && side === -1 && z !== 42;
      if (collapsed) {
        kit.box('metal', 0.8, 5, 0.8, { x: side * 10, y: 2.5, z }, [0, 0, side * 1.2]);
        continue;
      }
      const top = new THREE.Vector3(side * 8, 3.5, z);
      const ext = side === -1 ? opts.portStrutExtension ?? 0 : 0;
      const foot = new THREE.Vector3(side * 12, opts.landed ? 0.2 - ext : 3, z);
      const mid = top.clone().add(foot).multiplyScalar(0.5);
      const len = top.distanceTo(foot);
      const ang = Math.atan2(foot.x - top.x, top.y - foot.y);
      kit.cyl('metal', 0.45, 0.45, len, mid, [0, 0, ang], 8);
      kit.cyl('dark', 1.6, 1.8, 0.4, foot, undefined, 12);
    }

  // --- Cargo ramp (right side, aft) — lowered when landed
  const rampTop = new THREE.Vector3(16, 3.4, 33);
  const ramp = new THREE.Vector3(24, 0.1, 33);
  kit.box('dark', 0.8, 6, 9, { x: 16.1, y: 7, z: 33 }); // door frame
  if (opts.landed) {
    const mid = rampTop.clone().add(ramp).multiplyScalar(0.5);
    const len = rampTop.distanceTo(ramp);
    const ang = Math.atan2(rampTop.y - ramp.y, ramp.x - rampTop.x);
    kit.box('metal', len, 0.35, 7.5, mid, [0, 0, -ang]);
    kit.box('accent', len, 0.4, 0.3, { x: mid.x, y: mid.y + 0.05, z: mid.z - 3.6 }, [0, 0, -ang]);
    kit.box('accent', len, 0.4, 0.3, { x: mid.x, y: mid.y + 0.05, z: mid.z + 3.6 }, [0, 0, -ang]);
  }

  // --- Damage: scorch marks, torn plates, breach
  const weldPoints: THREE.Vector3[] = [];
  if (opts.damaged) {
    for (const [x, y, z, w, d, r] of [
      [-12.1, 8.5, 2, 0.2, 8, 0.1], [-9, 14.3, -30, 7, 6, 0], [12.2, 5.5, 20, 0.2, 10, 0.05],
      [-16.2, 6, 30, 0.2, 7, -0.1], [0, 14.6, 14, 10, 5, 0.02],
    ] as number[][]) {
      kit.box('scorch', w, 0.05 + (w < 1 ? 3 : 0), d, { x, y, z }, [0, 0, r]);
    }
    // Lab breach hole (left side) — dark torn opening
    kit.box('scorch', 0.6, 2.8, 3.4, { x: -12.1, y: 9.2, z: 6 });
    kit.box('metal', 0.3, 0.4, 3.8, { x: -12.4, y: 10.8, z: 6.4 }, [0.3, 0, 0.2]);
    kit.box('metal', 0.3, 0.3, 2.8, { x: -12.5, y: 7.8, z: 5.2 }, [-0.4, 0, -0.3]);
    // Ventral hull tears to weld (exterior repair points)
    weldPoints.push(new THREE.Vector3(12.3, 5.2, -22), new THREE.Vector3(13.0, 4.8, 44), new THREE.Vector3(-12.3, 5.0, -30));
    for (const p of weldPoints) kit.box('scorch', 0.4, 1.4, 2.6, p);
  }

  const group = kit.build();
  group.name = 'lantern';

  // Engine glow cones (not merged — animated)
  const glowGeo = new THREE.ConeGeometry(2.1, 14, 16, 1, true);
  const glows: THREE.Mesh[] = [];
  for (const e of engines) {
    const m = new THREE.Mesh(glowGeo, mats.engineGlow);
    m.position.copy(e).add(new THREE.Vector3(0, 0, 7));
    m.rotation.x = -Math.PI / 2;
    group.add(m);
    glows.push(m);
  }
  // Beacon point light
  const beaconLight = new THREE.PointLight('#ffb347', 0, 60, 2);
  beaconLight.position.copy(beacon);
  group.add(beaconLight);

  const model: LanternModel = {
    group,
    setPower(p: number) {
      mats.glass.emissiveIntensity = p * 1.4;
      mats.beacon.emissiveIntensity = p > 0 ? 1 + p * 3 : 0;
      beaconLight.intensity = p * 800;
    },
    setEngine(t: number) {
      mats.engineGlow.opacity = Math.min(1, t) * 0.85;
      for (const g of glows) g.scale.set(1, 0.4 + t * 1.2, 1);
    },
    anchors: { ramp, rampTop, airlock: new THREE.Vector3(12.8, 5.6, -9), antenna, weldPoints, beacon, engines },
    dispose() {
      glowGeo.dispose();
      for (const m of Object.values(mats)) m.dispose();
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      group.removeFromParent();
    },
  };
  model.setPower(opts.power);
  model.setEngine(0);
  return model;
}
