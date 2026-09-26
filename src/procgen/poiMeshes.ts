import * as THREE from 'three';
import { KitBuilder, stdMat } from './kit';
import type { PoiKind } from '../content/worldTypes';

export interface PoiModel {
  group: THREE.Group;
  /** Local-space box colliders (centre, half extents). */
  boxes: { c: THREE.Vector3; h: THREE.Vector3 }[];
  /** The part the player aims at to interact (defaults to the group). */
  target: THREE.Object3D;
  /** Pulsing/glow light, if any. */
  light?: THREE.PointLight;
  /** Local point in front of the POI where a spawn/door exit goes. */
  front: THREE.Vector3;
}

const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => ({ c: new THREE.Vector3(x, y, z), h: new THREE.Vector3(hx, hy, hz) });

/**
 * Procedural models for surface points of interest. Human hardware is white/orange/grey
 * kit; Blackglass is zero-reflectance faceted black with a violet heart; Builder ruins
 * are black glass architecture with violet seams.
 */
export function buildPoi(kind: PoiKind, variant = '', color = '#6a4cff'): PoiModel {
  const k = new KitBuilder({
    shell: stdMat('#e6e3dc', { roughness: 0.6 }),
    dark: stdMat('#2c3036', { roughness: 0.7 }),
    metal: stdMat('#8d959e', { metalness: 0.7, roughness: 0.4 }),
    solar: stdMat('#1f2e66', { roughness: 0.25, metalness: 0.5 }),
    accent: stdMat('#e8742e'),
    gold: stdMat('#c9a74a', { metalness: 0.8, roughness: 0.3 }),
    glow: stdMat('#101010', { emissive: color, emissiveIntensity: 1.6 }),
    black: new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.03, metalness: 1, emissive: '#1a0f2e', emissiveIntensity: 0.35 }),
    seam: new THREE.MeshStandardMaterial({ color: '#05030a', emissive: '#7a5cff', emissiveIntensity: 1.4 }),
    ice: stdMat('#dfe8ee', { roughness: 0.25 }),
  });
  const boxes: PoiModel['boxes'] = [];
  let front = new THREE.Vector3(0, 0, 4);
  let light: THREE.PointLight | undefined;
  switch (kind) {
    case 'hab': {
      k.cyl('shell', 3.4, 3.4, 12, { x: 0, y: 3.5, z: 0 }, [0, 0, Math.PI / 2], 18);
      k.box('dark', 2.6, 3, 2, { x: 0, y: 1.5, z: 3.9 });
      k.box('accent', 12.2, 0.4, 0.2, { x: 0, y: 5.6, z: 3.45 });
      k.cyl('metal', 0.15, 0.2, 10, { x: 5, y: 5, z: -3 }, undefined, 6);
      k.add('shell', new THREE.SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), { x: 5, y: 10, z: -3 }, [-1, 0, 0]);
      for (let i = 0; i < 4; i++) k.box('solar', 4, 0.1, 2.2, { x: -9 + i * 4.5, y: 1.4, z: -7 }, [0.4, 0, 0]);
      boxes.push(box(0, 3.5, 0, 6.2, 3.5, 3.4), box(0, 1.5, 3.9, 1.3, 1.5, 1));
      front = new THREE.Vector3(0, 0, 7.5);
      break;
    }
    case 'dome': {
      k.add('shell', new THREE.SphereGeometry(8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), { x: 0, y: 0, z: 0 });
      k.box('dark', 2.8, 3.2, 3, { x: 0, y: 1.6, z: 8.2 });
      k.box('accent', 3, 0.3, 3.1, { x: 0, y: 3.3, z: 8.2 });
      boxes.push(box(0, 3, 0, 6.5, 3, 6.5), box(0, 1.6, 8.2, 1.4, 1.6, 1.5));
      front = new THREE.Vector3(0, 0, 11.5);
      break;
    }
    case 'wreck': {
      if (variant === 'rover') {
        k.box('shell', 2.6, 1.2, 4.2, { x: 0, y: 1.3, z: 0 });
        k.box('solar', 4, 0.08, 3, { x: 0, y: 2.1, z: 0 }, [0.1, 0, 0.05]);
        for (const [dx, dz] of [[-1.5, -1.6], [1.5, -1.6], [-1.5, 1.6], [1.5, 1.6]]) k.cyl('dark', 0.5, 0.5, 0.4, { x: dx, y: 0.5, z: dz }, [0, 0, Math.PI / 2], 12);
        boxes.push(box(0, 1.2, 0, 1.6, 1.2, 2.4));
      } else if (variant === 'rotorcraft') {
        k.box('shell', 2, 1.4, 3.4, { x: 0, y: 1.6, z: 0 }, [0.1, 0, 0.25]);
        for (const [dx, dz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
          k.cyl('metal', 0.1, 0.1, 3.4, { x: dx * 0.5, y: 1.9, z: dz * 0.5 }, [0, 0, Math.PI / 2], 6);
          k.cyl('dark', 1.6, 1.6, 0.05, { x: dx, y: 2.2 + (dx > 0 ? 0.3 : -0.1), z: dz }, [0.2, 0, 0.3], 16);
        }
        for (const dx of [-0.9, 0.9]) k.box('metal', 0.1, 0.1, 3.4, { x: dx, y: 0.5, z: 0 });
        boxes.push(box(0, 1.4, 0, 1.4, 1.2, 2));
      } else if (variant === 'probe') {
        // Huygens-like entry probe: squat disc with a heat-shield rim
        k.cyl('gold', 0.65, 0.7, 0.45, { x: 0, y: 0.3, z: 0 }, undefined, 18);
        k.cyl('shell', 0.72, 0.72, 0.08, { x: 0, y: 0.55, z: 0 }, undefined, 18);
        k.box('dark', 0.25, 0.2, 0.25, { x: 0.3, y: 0.62, z: 0.2 });
        boxes.push(box(0, 0.35, 0, 0.7, 0.35, 0.7));
        front = new THREE.Vector3(0, 0, 2);
      } else if (variant === 'debris') {
        for (let i = 0; i < 5; i++) k.box(i % 2 ? 'metal' : 'shell', 2 + i * 0.4, 0.2, 1 + (i % 3) * 0.6, { x: -3 + i * 1.6, y: 0.2 + (i % 2) * 0.3, z: (i % 3) - 1 }, [0.3 * i, i, 0.2]);
        boxes.push(box(0, 0.4, 0, 4, 0.5, 2));
      } else {
        // Lander: tilted body on three legs, one collapsed
        k.cyl('shell', 1.8, 2.2, 2.4, { x: 0, y: 2.4, z: 0 }, [0.25, 0, 0.1], 10);
        k.cyl('gold', 2.25, 2.25, 0.3, { x: 0, y: 1.2, z: 0 }, [0.25, 0, 0.1], 10);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          k.box('metal', 0.14, 2.6, 0.14, { x: Math.cos(a) * 2.2, y: 1, z: Math.sin(a) * 2.2 }, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5 + (i === 0 ? 0.9 : 0)]);
          k.cyl('dark', 0.4, 0.5, 0.12, { x: Math.cos(a) * 2.8, y: 0.06, z: Math.sin(a) * 2.8 }, undefined, 8);
        }
        k.box('solar', 5, 0.08, 1.6, { x: 0, y: 3.8, z: 0 }, [0.3, 0.5, 0.1]);
        boxes.push(box(0, 2, 0, 2, 2, 2));
      }
      break;
    }
    case 'spire': {
      k.add('black', new THREE.OctahedronGeometry(1, 0), { x: 0, y: 5.5, z: 0 }, [0, 0.4, 0], { x: 1.6, y: 7, z: 1.3 });
      boxes.push(box(0, 5, 0, 1.2, 5, 1.2));
      light = new THREE.PointLight(color, 4, 25, 2);
      light.position.set(0, 2, 0);
      front = new THREE.Vector3(0, 0, 5);
      break;
    }
    case 'seed': {
      // A Blackglass sphere half-sunk in bright salt
      k.add('black', new THREE.IcosahedronGeometry(3.2, 1), { x: 0, y: 1.2, z: 0 });
      boxes.push(box(0, 1.6, 0, 2.6, 2.4, 2.6));
      light = new THREE.PointLight(color, 5, 30, 2);
      light.position.set(0, 4.5, 0);
      front = new THREE.Vector3(0, 0, 6);
      break;
    }
    case 'terminal': {
      k.box('dark', 0.6, 1.1, 0.5, { x: 0, y: 0.55, z: 0 });
      k.box('glow', 0.5, 0.35, 0.05, { x: 0, y: 1.05, z: 0.23 }, [-0.4, 0, 0]);
      boxes.push(box(0, 0.55, 0, 0.3, 0.55, 0.25));
      front = new THREE.Vector3(0, 0, 1.6);
      break;
    }
    case 'recorder': {
      k.box('gold', 0.3, 0.12, 0.2, { x: 0, y: 0.06, z: 0 });
      k.box('glow', 0.08, 0.04, 0.08, { x: 0.08, y: 0.13, z: 0 });
      light = new THREE.PointLight('#ffcf7a', 3, 5, 2);
      light.position.set(0, 0.4, 0);
      front = new THREE.Vector3(0, 0, 1.5);
      break;
    }
    case 'crate': {
      k.box('shell', 1.4, 1, 1, { x: 0, y: 0.5, z: 0 });
      k.box('accent', 1.42, 0.16, 1.02, { x: 0, y: 0.7, z: 0 });
      boxes.push(box(0, 0.5, 0, 0.7, 0.5, 0.5));
      front = new THREE.Vector3(0, 0, 1.8);
      break;
    }
    case 'pylon': {
      k.cyl('metal', 0.25, 0.35, 5, { x: 0, y: 2.5, z: 0 }, undefined, 8);
      k.box('dark', 1.2, 0.8, 0.8, { x: 0, y: 1.2, z: 0.3 });
      k.box('glow', 0.3, 0.3, 0.3, { x: 0, y: 5.1, z: 0 });
      boxes.push(box(0, 2.5, 0, 0.5, 2.5, 0.5));
      front = new THREE.Vector3(0, 0, 2);
      break;
    }
    case 'geyser': {
      k.cyl('ice', 2.4, 3.2, 0.6, { x: 0, y: 0.1, z: 0 }, undefined, 14);
      k.cyl('dark', 0.8, 0.9, 0.65, { x: 0, y: 0.15, z: 0 }, undefined, 10);
      front = new THREE.Vector3(0, 0, 6);
      break;
    }
    case 'ruin': {
      if (variant === 'pillars') {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const h = 5 + ((i * 3) % 4) * 1.5;
          k.box('black', 1, h, 1, { x: Math.cos(a) * 7, y: h / 2, z: Math.sin(a) * 7 }, [0, a, 0]);
          k.box('seam', 0.06, h * 0.8, 1.02, { x: Math.cos(a) * 7, y: h / 2, z: Math.sin(a) * 7 }, [0, a, 0]);
          boxes.push(box(Math.cos(a) * 7, h / 2, Math.sin(a) * 7, 0.6, h / 2, 0.6));
        }
        k.cyl('black', 3, 3.2, 0.4, { x: 0, y: 0.2, z: 0 }, undefined, 6);
      } else if (variant === 'gate') {
        k.box('black', 1.4, 12, 2, { x: -6, y: 6, z: 0 });
        k.box('black', 1.4, 12, 2, { x: 6, y: 6, z: 0 });
        k.box('black', 13.4, 1.6, 2, { x: 0, y: 12.6, z: 0 });
        k.box('seam', 11, 0.08, 0.2, { x: 0, y: 11.6, z: 1.02 });
        k.box('seam', 0.08, 11, 0.2, { x: -5.3, y: 5.8, z: 1.02 });
        k.box('seam', 0.08, 11, 0.2, { x: 5.3, y: 5.8, z: 1.02 });
        boxes.push(box(-6, 6, 0, 0.7, 6, 1), box(6, 6, 0, 0.7, 6, 1));
        front = new THREE.Vector3(0, 0, 6);
      } else if (variant === 'stair') {
        for (let i = 0; i < 8; i++) {
          k.box('black', 10, 0.5, 1.6, { x: 0, y: 0.25 + i * 0.5, z: -i * 1.6 });
          boxes.push(box(0, 0.25 + i * 0.5, -i * 1.6, 5, 0.25, 0.8));
        }
        k.box('black', 10, 4, 10, { x: 0, y: 2, z: -17 });
        boxes.push(box(0, 2, -17, 5, 2, 5));
        front = new THREE.Vector3(0, 0, 4);
      } else {
        // Arch
        const segs = 9;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI;
          k.box('black', 1.4, 1.4, 1.8, { x: Math.cos(a) * 7, y: Math.sin(a) * 9, z: 0 }, [0, 0, a]);
        }
        k.box('seam', 0.2, 0.2, 1.9, { x: 0, y: 9, z: 0 });
        boxes.push(box(-7, 2, 0, 0.8, 2, 1), box(7, 2, 0, 0.8, 2, 1));
      }
      light = new THREE.PointLight('#7a5cff', 6, 22, 2);
      light.position.set(0, 3, 2);
      break;
    }
    case 'marker': {
      k.add('dark', new THREE.ConeGeometry(0.7, 1.4, 5), { x: 0, y: 0.7, z: 0 });
      k.cyl('metal', 0.04, 0.04, 2.4, { x: 0.2, y: 1.6, z: 0 }, undefined, 5);
      k.box('accent', 0.7, 0.45, 0.02, { x: 0.55, y: 2.55, z: 0 });
      front = new THREE.Vector3(0, 0, 2);
      break;
    }
    case 'beacon': {
      k.cyl('metal', 0.1, 0.14, 4, { x: 0, y: 2, z: 0 }, undefined, 6);
      k.box('glow', 0.35, 0.35, 0.35, { x: 0, y: 4.1, z: 0 });
      light = new THREE.PointLight(color, 20, 30, 1.8);
      light.position.set(0, 4.3, 0);
      front = new THREE.Vector3(0, 0, 2);
      break;
    }
    case 'dish': {
      k.cyl('metal', 0.3, 0.45, 4, { x: 0, y: 2, z: 0 }, undefined, 8);
      k.add('shell', new THREE.SphereGeometry(4, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), { x: 0, y: 5, z: 0 }, [-0.9, 0, 0]);
      boxes.push(box(0, 2, 0, 0.5, 2, 0.5));
      front = new THREE.Vector3(0, 0, 4);
      break;
    }
    case 'drill': {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        k.box('metal', 0.2, 9, 0.2, { x: Math.cos(a) * 1.6, y: 4.2, z: Math.sin(a) * 1.6 }, [Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18]);
      }
      k.cyl('dark', 0.5, 0.5, 6, { x: 0, y: 3, z: 0 }, undefined, 10);
      k.box('accent', 2, 1.2, 2, { x: 0, y: 8.4, z: 0 });
      k.box('shell', 3, 1.4, 2, { x: 3, y: 0.7, z: 0 });
      boxes.push(box(0, 4, 0, 1.2, 4, 1.2), box(3, 0.7, 0, 1.5, 0.7, 1));
      front = new THREE.Vector3(0, 0, 3.5);
      break;
    }
    case 'hatch': {
      k.cyl('metal', 1.6, 1.8, 0.6, { x: 0, y: 0.3, z: 0 }, undefined, 16);
      k.cyl('dark', 1.2, 1.2, 0.62, { x: 0, y: 0.32, z: 0 }, undefined, 16);
      k.box('glow', 0.3, 0.1, 0.3, { x: 1.3, y: 0.65, z: 0 });
      front = new THREE.Vector3(0, 0, 3);
      break;
    }
    case 'npcspot':
      break;
  }
  const group = k.build();
  if (light) group.add(light);
  const target = group;
  return { group, boxes, target, light, front };
}
