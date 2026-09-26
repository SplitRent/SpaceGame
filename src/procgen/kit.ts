import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * KitBuilder accumulates primitive pieces (with transforms) per material key and merges
 * them into one mesh per material. Large authored structures (ships, stations, interiors)
 * therefore cost a handful of draw calls instead of thousands.
 */
export class KitBuilder {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private tmp = new THREE.Object3D();

  constructor(readonly materials: Record<string, THREE.Material>) {}

  add(key: string, geo: THREE.BufferGeometry, pos: THREE.Vector3Like, rot?: THREE.Euler | [number, number, number], scale?: THREE.Vector3Like): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const o = this.tmp;
    o.position.set(pos.x, pos.y, pos.z);
    if (rot) {
      if (Array.isArray(rot)) o.rotation.set(rot[0], rot[1], rot[2]);
      else o.rotation.copy(rot);
    } else o.rotation.set(0, 0, 0);
    if (scale) o.scale.set(scale.x, scale.y, scale.z);
    else o.scale.set(1, 1, 1);
    o.updateMatrix();
    g.applyMatrix4(o.matrix);
    // Normalise attributes so all parts are mergeable
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
  }

  box(key: string, w: number, h: number, d: number, pos: THREE.Vector3Like, rot?: THREE.Euler | [number, number, number]): void {
    this.add(key, new THREE.BoxGeometry(w, h, d), pos, rot);
  }

  cyl(key: string, rTop: number, rBot: number, h: number, pos: THREE.Vector3Like, rot?: THREE.Euler | [number, number, number], seg = 16): void {
    this.add(key, new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), pos, rot);
  }

  build(opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.materials[key]);
      mesh.name = key;
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

export function stdMat(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, flatShading: true, ...opts });
}
