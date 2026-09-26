import * as THREE from 'three';
import { Rng } from '../engine/Rng';

/** Deformed icosahedron boulders (shared geometry, flat shaded). */
export function rockGeometry(seed: number, detail = 1, roughness = 0.35): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  // Consistent displacement per unique vertex position
  const disp = new Map<string, number>();
  const sx = rng.range(0.8, 1.3), sy = rng.range(0.45, 0.8), sz = rng.range(0.8, 1.2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let d = disp.get(key);
    if (d === undefined) {
      d = 1 + rng.range(-roughness, roughness);
      disp.set(key, d);
    }
    v.multiplyScalar(d);
    v.set(v.x * sx, v.y * sy, v.z * sz);
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3; // flatter base, sits into regolith
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  g.dispose();
  return ng;
}

export interface ScatterOptions {
  count: number;
  seed: number;
  area: number;
  minScale: number;
  maxScale: number;
  /** Return density 0..1 at (x,z) — lower density rejects more placements. */
  density: (x: number, z: number) => number;
  height: (x: number, z: number) => number;
  normal: (x: number, z: number) => THREE.Vector3;
  avoid?: (x: number, z: number) => boolean;
}

/** Scatter instanced rocks; returns the instanced meshes and the large-rock list for colliders. */
export function scatterRocks(
  material: THREE.Material,
  o: ScatterOptions,
): { meshes: THREE.InstancedMesh[]; big: { pos: THREE.Vector3; r: number }[] } {
  const rng = new Rng(o.seed);
  const geos = [rockGeometry(o.seed + 1, 1), rockGeometry(o.seed + 2, 1, 0.45), rockGeometry(o.seed + 3, 0, 0.3)];
  const buckets: THREE.Matrix4[][] = geos.map(() => []);
  const big: { pos: THREE.Vector3; r: number }[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let tries = 0;
  let placed = 0;
  while (placed < o.count && tries < o.count * 8) {
    tries++;
    const x = rng.range(-o.area / 2, o.area / 2);
    const z = rng.range(-o.area / 2, o.area / 2);
    if (rng.next() > o.density(x, z)) continue;
    if (o.avoid?.(x, z)) continue;
    const s = o.minScale + Math.pow(rng.next(), 3.5) * (o.maxScale - o.minScale);
    const n = o.normal(x, z);
    q.setFromUnitVectors(up, n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, rng.range(0, Math.PI * 2)));
    const y = o.height(x, z) - s * 0.25;
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    buckets[placed % geos.length].push(m.clone());
    if (s > 1.1) big.push({ pos: new THREE.Vector3(x, y + s * 0.2, z), r: s * 0.75 });
    placed++;
  }
  const meshes = geos.map((g, i) => {
    const im = new THREE.InstancedMesh(g, material, Math.max(1, buckets[i].length));
    buckets[i].forEach((mm, k) => im.setMatrixAt(k, mm));
    im.count = buckets[i].length;
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    return im;
  });
  return { meshes, big };
}
