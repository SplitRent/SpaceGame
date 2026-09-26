import * as THREE from 'three';
import { KitBuilder, stdMat } from './kit';
import { hullPanelTexture, mliTexture } from './textures';

/**
 * Harbor Station exterior — an original cislunar staging station: a long central hub with
 * an axial docking port, a segmented habitation ring on four spokes (one segment torn
 * away: the module that fell to the Moon), twin solar wings and radiator fins.
 * Local frame: hub along Z, docking port at +Z.
 */
export interface HarborModel {
  group: THREE.Group;
  ring: THREE.Group;
  dockPoint: THREE.Vector3;
  dockDir: THREE.Vector3;
  colliders: { center: THREE.Vector3; radius: number }[];
  setBeacon(on: boolean, t: number): void;
  dispose(): void;
}

export function buildHarbor(): HarborModel {
  const mats = {
    hull: stdMat('#dde0e4', { map: hullPanelTexture(), roughness: 0.55 }),
    dark: stdMat('#30353c', { roughness: 0.6, metalness: 0.4 }),
    truss: stdMat('#9aa2ab', { metalness: 0.75, roughness: 0.35 }),
    solar: stdMat('#1d2e6b', { roughness: 0.15, metalness: 0.6, emissive: '#0a1640', emissiveIntensity: 0.3 }),
    mli: stdMat('#d9a441', { map: mliTexture(), roughness: 0.3, metalness: 0.9 }),
    accent: stdMat('#3fa9f5', { emissive: '#3fa9f5', emissiveIntensity: 0.2 }),
    scorch: stdMat('#141210', { roughness: 1 }),
    window: new THREE.MeshStandardMaterial({ color: '#10161d', emissive: '#ffd9a0', emissiveIntensity: 0.15 }),
    beacon: new THREE.MeshStandardMaterial({ color: '#330000', emissive: '#ff2a1a', emissiveIntensity: 0 }),
    dockLight: new THREE.MeshStandardMaterial({ color: '#002a1a', emissive: '#3ee08f', emissiveIntensity: 0 }),
  };
  const kit = new KitBuilder(mats);
  // Hub
  kit.cyl('hull', 14, 14, 90, { x: 0, y: 0, z: 0 }, [Math.PI / 2, 0, 0], 24);
  kit.cyl('mli', 14.3, 14.3, 20, { x: 0, y: 0, z: -20 }, [Math.PI / 2, 0, 0], 24);
  kit.cyl('dark', 15, 15, 3, { x: 0, y: 0, z: 30 }, [Math.PI / 2, 0, 0], 24);
  kit.cyl('hull', 7, 10, 12, { x: 0, y: 0, z: 51 }, [Math.PI / 2, 0, 0], 20);
  kit.cyl('dark', 4.5, 4.5, 4, { x: 0, y: 0, z: 58 }, [Math.PI / 2, 0, 0], 20);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    kit.box('window', 1.8, 1.2, 0.2, { x: Math.cos(a) * 14.05, y: Math.sin(a) * 14.05, z: 10 }, [0, 0, a + Math.PI / 2]);
    kit.box('dockLight', 0.8, 0.8, 0.8, { x: Math.cos(a) * 5.5, y: Math.sin(a) * 5.5, z: 60 });
  }
  // Rear power module and radiators
  kit.cyl('dark', 10, 12, 16, { x: 0, y: 0, z: -53 }, [Math.PI / 2, 0, 0], 16);
  for (const s of [-1, 1]) {
    kit.box('dark', 60, 0.5, 14, { x: s * 44, y: 0, z: -50 });
    kit.box('truss', 30, 1.2, 1.2, { x: s * 29, y: 0, z: -50 });
    // Solar wings
    kit.box('truss', 1.4, 110, 1.4, { x: 0, y: s * 70, z: -35 });
    for (let k = 0; k < 4; k++) kit.box('solar', 36, 22, 0.3, { x: s * 0.5 * 0, y: s * (35 + k * 24), z: -35 }, [0, 0, 0]);
  }
  const hub = kit.build();

  // Habitation ring (separate group, rotates slowly)
  const ringKit = new KitBuilder(mats);
  const R = 72;
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    if (i === 3) {
      // The missing segment: torn stubs
      const a = (i / segs) * Math.PI * 2;
      for (const off of [-0.18, 0.18]) {
        const aa = a + off;
        ringKit.cyl('scorch', 7, 7, 4, { x: Math.cos(aa) * R, y: Math.sin(aa) * R, z: 0 }, [0, 0, aa], 14);
      }
      continue;
    }
    const a = (i / segs) * Math.PI * 2;
    const len = (2 * Math.PI * R) / segs - 3;
    ringKit.cyl('hull', 7, 7, len, { x: Math.cos(a) * R, y: Math.sin(a) * R, z: 0 }, [0, 0, a], 16);
    ringKit.cyl('dark', 7.4, 7.4, 1.4, { x: Math.cos(a + 0.26) * R, y: Math.sin(a + 0.26) * R, z: 0 }, [0, 0, a + 0.26], 16);
    for (let w = -2; w <= 2; w++) {
      ringKit.box('window', 1.2, 0.8, 0.2, { x: Math.cos(a) * (R - 7.05) + Math.cos(a + Math.PI / 2) * w * 5, y: Math.sin(a) * (R - 7.05) + Math.sin(a + Math.PI / 2) * w * 5, z: 0 }, [0, 0, a + Math.PI / 2]);
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 12;
    ringKit.cyl('truss', 2, 2, R - 16, { x: Math.cos(a) * (R / 2 + 5), y: Math.sin(a) * (R / 2 + 5), z: 0 }, [0, 0, a + Math.PI / 2], 8);
    ringKit.box('accent', 1, 1, 4.2, { x: Math.cos(a) * (R / 2 + 5), y: Math.sin(a) * (R / 2 + 5), z: 0 });
  }
  const ring = new THREE.Group();
  ring.add(ringKit.build());
  ring.position.z = 5;

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), mats.beacon);
  beacon.position.set(0, 15.5, 38);
  const beaconLight = new THREE.PointLight('#ff2a1a', 0, 200, 1.5);
  beaconLight.position.copy(beacon.position);

  const group = new THREE.Group();
  group.add(hub, ring, beacon, beaconLight);
  group.name = 'harbor';
  const colliders = [
    { center: new THREE.Vector3(0, 0, 0), radius: 48 },
    { center: new THREE.Vector3(0, 0, 45), radius: 14 },
    { center: new THREE.Vector3(0, 0, -52), radius: 20 },
  ];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    colliders.push({ center: new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 5), radius: 10 });
  }
  return {
    group,
    ring,
    dockPoint: new THREE.Vector3(0, 0, 64),
    dockDir: new THREE.Vector3(0, 0, 1),
    colliders,
    setBeacon(on: boolean, t: number) {
      const blink = on && Math.sin(t * 3) > 0.6 ? 1 : 0;
      mats.beacon.emissiveIntensity = blink * 6;
      beaconLight.intensity = blink * 4000;
      mats.dockLight.emissiveIntensity = on ? 1.5 + Math.sin(t * 4) : 0;
      mats.window.emissiveIntensity = on ? 0.35 : 0.05;
    },
    dispose() {
      for (const m of Object.values(mats)) m.dispose();
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
