import * as THREE from 'three';
import { KitBuilder, stdMat } from './kit';
import type { HarborModel } from './harborStation';

/**
 * Additional dockable structures sharing Harbor's interface: the Builders' Threshold (and
 * its twin gate at Vesper), and the Venus aerostat Halcyon.
 */

export function buildThreshold(scale = 1): HarborModel {
  const black = new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.04, metalness: 1, emissive: '#0c0718', emissiveIntensity: 0.6 });
  const seam = new THREE.MeshStandardMaterial({ color: '#05030a', emissive: '#7a5cff', emissiveIntensity: 1.5 });
  const group = new THREE.Group();
  const ring = new THREE.Group();
  const R = 900 * scale, tube = 70 * scale;
  const torus = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 24, 160), black);
  ring.add(torus);
  for (const k of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(R + k * tube * 0.72, tube * 0.05, 6, 160), seam);
    s.position.z = tube * 0.55 * k;
    ring.add(s);
  }
  // Spokes to the hub
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(R * 0.9, 14 * scale, 14 * scale), black);
    sp.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0);
    sp.rotation.z = a;
    ring.add(sp);
  }
  group.add(ring);
  const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(85 * scale, 1), black);
  group.add(hub);
  const port = new THREE.Mesh(new THREE.CylinderGeometry(18 * scale, 22 * scale, 12 * scale, 6), seam);
  port.rotation.x = Math.PI / 2;
  port.position.z = 86 * scale;
  group.add(port);
  const light = new THREE.PointLight('#7a5cff', 4e5 * scale, 4000 * scale, 1.6);
  group.add(light);
  const colliders: HarborModel['colliders'] = [{ center: new THREE.Vector3(0, 0, 0), radius: 88 * scale }];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    colliders.push({ center: new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0), radius: tube * 1.1 });
  }
  return {
    group,
    ring,
    dockPoint: new THREE.Vector3(0, 0, 92 * scale),
    dockDir: new THREE.Vector3(0, 0, 1),
    colliders,
    setBeacon(_on: boolean, t: number) {
      const ph = (t % 19.69) / 19.69;
      seam.emissiveIntensity = 1.2 + (ph < 0.1 ? 4 * (1 - ph / 0.1) : 0);
    },
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      black.dispose();
      seam.dispose();
    },
  };
}

export function buildAerostat(): HarborModel {
  const k = new KitBuilder({
    env: stdMat('#e8e4d6', { roughness: 0.5 }),
    band: stdMat('#c9a74a', { metalness: 0.6, roughness: 0.35 }),
    hull: stdMat('#d6dbe0', { roughness: 0.5 }),
    dark: stdMat('#30353c', { roughness: 0.6 }),
    glow: new THREE.MeshStandardMaterial({ color: '#221a10', emissive: '#ffd9a0', emissiveIntensity: 0.9 }),
    solar: stdMat('#1d2e6b', { roughness: 0.2, metalness: 0.6 }),
  });
  k.add('env', new THREE.SphereGeometry(1, 32, 16), { x: 0, y: 60, z: 0 }, undefined, { x: 55, y: 45, z: 130 });
  for (const z of [-80, -30, 30, 80]) k.cyl('band', 50 * Math.sqrt(1 - (z / 130) ** 2) + 1, 50 * Math.sqrt(1 - (z / 130) ** 2) + 1, 2, { x: 0, y: 60, z }, [Math.PI / 2, 0, 0], 32);
  k.box('solar', 70, 1, 160, { x: 0, y: 106, z: 0 });
  k.cyl('hull', 14, 14, 70, { x: 0, y: -2, z: 0 }, [Math.PI / 2, 0, 0], 20);
  for (let i = -3; i <= 3; i++) k.box('glow', 3, 2, 0.5, { x: 14, y: -2, z: i * 8 }, [0, Math.PI / 2, 0]);
  for (const x of [-10, 10]) k.box('dark', 1, 20, 1, { x, y: 12, z: 0 });
  k.cyl('dark', 6, 6, 6, { x: 0, y: -2, z: 38 }, [Math.PI / 2, 0, 0], 16);
  const group = k.build();
  const ring = new THREE.Group();
  group.add(ring);
  return {
    group,
    ring,
    dockPoint: new THREE.Vector3(0, -2, 42),
    dockDir: new THREE.Vector3(0, 0, 1),
    colliders: [
      { center: new THREE.Vector3(0, 60, 0), radius: 58 },
      { center: new THREE.Vector3(0, 60, 70), radius: 40 },
      { center: new THREE.Vector3(0, 60, -70), radius: 40 },
      { center: new THREE.Vector3(0, -2, 0), radius: 20 },
    ],
    setBeacon() {},
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    },
  };
}
