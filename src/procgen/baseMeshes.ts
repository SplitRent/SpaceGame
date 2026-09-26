import * as THREE from 'three';
import { KitBuilder, stdMat } from './kit';
import { hullPanelTexture, mliTexture } from './textures';

/**
 * Base module models. Each module has an "unbuilt" blueprint look (hologram frame) and a
 * built look. Emissive parts follow base power so the base visibly comes alive.
 */
export interface ModuleModel {
  group: THREE.Group;
  setPowered(on: boolean): void;
  dispose(): void;
}

const shared = {
  shell: () => stdMat('#e8e6e1', { map: hullPanelTexture(), roughness: 0.6 }),
  dark: () => stdMat('#3a3f47', { roughness: 0.6, metalness: 0.3 }),
  metal: () => stdMat('#a2abb5', { roughness: 0.35, metalness: 0.8 }),
  accent: () => stdMat('#ff8a3d'),
  mli: () => stdMat('#d9a441', { map: mliTexture(), roughness: 0.3, metalness: 0.9 }),
  solar: () => stdMat('#1d2f6b', { roughness: 0.15, metalness: 0.6, emissive: '#0a1a4a', emissiveIntensity: 0.2 }),
  light: () => new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffd9a0', emissiveIntensity: 0 }),
  green: () => new THREE.MeshStandardMaterial({ color: '#4fae4a', roughness: 0.8, flatShading: true, emissive: '#2a6a2a', emissiveIntensity: 0 }),
  glass: () => new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, emissive: '#b8f0ff', emissiveIntensity: 0 }),
};

function mats() {
  return {
    shell: shared.shell(), dark: shared.dark(), metal: shared.metal(), accent: shared.accent(), mli: shared.mli(),
    solar: shared.solar(), light: shared.light(), green: shared.green(), glass: shared.glass(),
  };
}

export function buildModule(moduleId: string): ModuleModel {
  const m = mats();
  const kit = new KitBuilder(m);
  const lights: THREE.PointLight[] = [];
  const addLight = (x: number, y: number, z: number, color = '#ffd9a0', dist = 14) => {
    const l = new THREE.PointLight(color, 0, dist, 2);
    l.position.set(x, y, z);
    lights.push(l);
  };
  // Common pad footing
  kit.cyl('dark', 4.6, 4.8, 0.3, { x: 0, y: 0.15, z: 0 }, undefined, 8);
  switch (moduleId) {
    case 'shelter': {
      // Inflatable habitat: a squat capsule with a rigid airlock tunnel
      kit.add('shell', new THREE.CapsuleGeometry(2.6, 3.5, 6, 16), { x: 0, y: 2.7, z: 0 }, [0, 0, Math.PI / 2]);
      kit.cyl('mli', 2.75, 2.75, 1, { x: 0, y: 2.7, z: 0 }, [0, 0, Math.PI / 2], 16);
      kit.box('shell', 1.8, 2.3, 2, { x: 0, y: 1.4, z: 3 });
      kit.box('dark', 1.2, 1.9, 0.1, { x: 0, y: 1.25, z: 4.02 });
      kit.box('light', 1.4, 0.12, 0.12, { x: 0, y: 2.5, z: 4.05 });
      for (const x of [-2.5, 0, 2.5]) kit.box('light', 0.6, 0.35, 0.05, { x, y: 3.8, z: 2.3 });
      addLight(0, 3.2, 5);
      break;
    }
    case 'solar': {
      kit.cyl('metal', 0.25, 0.3, 5, { x: 0, y: 2.5, z: 0 }, undefined, 8);
      for (const side of [-1, 1]) {
        kit.box('solar', 5, 3.2, 0.1, { x: side * 2.8, y: 4.8, z: 0 }, [0.05, 0, 0]);
        kit.box('metal', 5.2, 0.12, 0.2, { x: side * 2.8, y: 3.2, z: 0 });
        kit.box('metal', 5.2, 0.12, 0.2, { x: side * 2.8, y: 6.4, z: 0 });
      }
      kit.box('dark', 1, 1, 1, { x: 0, y: 0.8, z: 0 });
      kit.box('light', 0.3, 0.1, 0.05, { x: 0, y: 1.1, z: 0.53 });
      break;
    }
    case 'battery': {
      for (let i = 0; i < 3; i++) {
        kit.box('dark', 1.2, 2, 2.4, { x: -1.6 + i * 1.6, y: 1.3, z: 0 });
        kit.box('light', 0.8, 0.12, 0.05, { x: -1.6 + i * 1.6, y: 2.0, z: 1.23 });
        kit.box('accent', 1.25, 0.15, 2.45, { x: -1.6 + i * 1.6, y: 2.3, z: 0 });
      }
      kit.box('metal', 5, 0.2, 2.8, { x: 0, y: 0.3, z: 0 });
      addLight(0, 3, 2, '#7fffb0', 8);
      break;
    }
    case 'workbench': {
      kit.box('metal', 3.6, 0.12, 1.6, { x: 0, y: 1.0, z: 0 });
      for (const [x, z] of [[-1.7, -0.7], [1.7, -0.7], [-1.7, 0.7], [1.7, 0.7]]) kit.box('dark', 0.1, 1, 0.1, { x, y: 0.5, z });
      kit.box('dark', 3.6, 1.4, 0.1, { x: 0, y: 1.7, z: -0.8 });
      kit.box('accent', 0.6, 0.4, 0.4, { x: -1, y: 1.3, z: 0.1 });
      kit.cyl('metal', 0.18, 0.18, 0.6, { x: 1.1, y: 1.35, z: 0 }, undefined, 8);
      kit.box('light', 3.2, 0.08, 0.08, { x: 0, y: 2.4, z: -0.7 });
      // canopy
      kit.box('shell', 4.4, 0.15, 2.6, { x: 0, y: 2.9, z: -0.2 });
      for (const [x, z] of [[-2.1, -1.4], [2.1, -1.4], [-2.1, 1], [2.1, 1]]) kit.box('metal', 0.12, 2.9, 0.12, { x, y: 1.45, z });
      addLight(0, 2.5, 0.5, '#ffe7c4', 9);
      break;
    }
    case 'iceproc': {
      kit.cyl('shell', 1.4, 1.4, 3.5, { x: -1.4, y: 2, z: 0 }, undefined, 14);
      kit.add('shell', new THREE.SphereGeometry(1.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), { x: -1.4, y: 3.75, z: 0 });
      kit.cyl('mli', 0.8, 0.8, 2.6, { x: 1.2, y: 1.5, z: -0.9 }, undefined, 12);
      kit.cyl('metal', 0.8, 0.8, 2.6, { x: 1.2, y: 1.5, z: 0.9 }, undefined, 12);
      kit.cyl('metal', 0.12, 0.12, 2.6, { x: 0, y: 3, z: 0 }, [0, 0, Math.PI / 2], 6);
      kit.box('dark', 1, 1.4, 0.6, { x: -1.4, y: 1, z: 1.5 });
      kit.box('light', 0.7, 0.15, 0.05, { x: -1.4, y: 1.5, z: 1.82 });
      addLight(-1.4, 2.5, 2, '#9fe8ff', 8);
      break;
    }
    case 'greenhouse': {
      kit.box('shell', 6, 0.4, 3.6, { x: 0, y: 0.5, z: 0 });
      kit.add('glass', new THREE.CylinderGeometry(1.8, 1.8, 6, 16, 1, false, 0, Math.PI), { x: 0, y: 0.7, z: 0 }, [0, 0, Math.PI / 2]);
      for (let i = 0; i < 4; i++) {
        kit.box('metal', 5.4, 0.08, 0.5, { x: 0, y: 1.1 + i * 0.001, z: -1.1 + i * 0.73 });
        for (let k = 0; k < 9; k++) {
          kit.add('green', new THREE.IcosahedronGeometry(0.22, 0), { x: -2.4 + k * 0.6, y: 1.35, z: -1.1 + i * 0.73 });
        }
      }
      kit.box('light', 5.6, 0.06, 0.1, { x: 0, y: 2.2, z: 0 });
      addLight(0, 1.9, 0, '#ff9ef0', 9);
      break;
    }
    case 'storage': {
      for (let i = 0; i < 4; i++) kit.box(i % 2 ? 'dark' : 'shell', 1.5, 2.2, 1.5, { x: -2.2 + i * 1.5, y: 1.25, z: 0 });
      kit.box('accent', 6.1, 0.2, 1.55, { x: 0, y: 2.45, z: 0 });
      kit.box('light', 0.3, 0.1, 0.05, { x: 0, y: 1.8, z: 0.78 });
      break;
    }
    case 'lab': {
      kit.box('shell', 4.4, 2.8, 3.4, { x: 0, y: 1.6, z: 0 });
      kit.box('glass', 2.6, 1, 0.1, { x: 0, y: 2.1, z: 1.72 });
      kit.box('dark', 1.2, 2, 0.1, { x: 1.5, y: 1.2, z: 1.72 });
      kit.cyl('metal', 0.2, 0.2, 1.6, { x: -1.6, y: 3.6, z: -1 }, undefined, 8);
      kit.add('metal', new THREE.SphereGeometry(0.5, 10, 6), { x: -1.6, y: 4.4, z: -1 });
      kit.box('light', 2.4, 0.1, 0.06, { x: 0, y: 2.9, z: 1.74 });
      addLight(0, 2.6, 2.4, '#b8ffea', 9);
      break;
    }
    default:
      kit.box('shell', 2, 2, 2, { x: 0, y: 1, z: 0 });
  }
  const group = kit.build();
  for (const l of lights) group.add(l);
  return {
    group,
    setPowered(on: boolean) {
      m.light.emissiveIntensity = on ? 3 : 0.05;
      m.green.emissiveIntensity = on ? 0.35 : 0;
      m.glass.emissiveIntensity = on ? 0.25 : 0;
      m.solar.emissiveIntensity = on ? 0.3 : 0.1;
      for (const l of lights) l.intensity = on ? 30 : 0;
    },
    dispose() {
      for (const mm of Object.values(m)) mm.dispose();
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

/** Holographic blueprint shown on an empty pad (where a module could be built). */
export function buildPadMarker(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.6, 32),
    new THREE.MeshBasicMaterial({ color: '#4fd1ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  g.add(ring);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.6, 0.2, 24),
    new THREE.MeshStandardMaterial({ color: '#5c5f63', roughness: 0.9, flatShading: true }),
  );
  disc.position.y = 0.05;
  disc.receiveShadow = true;
  g.add(disc);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), new THREE.MeshStandardMaterial({ color: '#2b2f35', emissive: '#4fd1ff', emissiveIntensity: 0.6 }));
  post.position.set(3.9, 0.6, 0);
  g.add(post);
  return g;
}
