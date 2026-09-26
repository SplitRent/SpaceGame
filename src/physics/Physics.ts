import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

let initPromise: Promise<void> | null = null;

/** Must be awaited once during boot before any physics world is created. */
export function initPhysics(): Promise<void> {
  if (!initPromise) initPromise = RAPIER.init();
  return initPromise;
}

export { RAPIER };

/** Collision groups (membership bits). */
export const GROUP = {
  STATIC: 0x0001,
  PLAYER: 0x0002,
  NPC: 0x0004,
  DYNAMIC: 0x0008,
  TRIGGER: 0x0010,
  INTERACT: 0x0020,
} as const;

/** Encode Rapier interaction groups: 16 bits membership, 16 bits filter. */
export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/**
 * One physics world per active location. Created on location load and freed on unload,
 * so nothing from a previous location can collide or leak.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private freed = false;

  constructor(gravity: number) {
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    this.world.timestep = 1 / 60;
  }

  setGravity(g: number): void {
    this.world.gravity = { x: 0, y: -g, z: 0 };
  }

  step(): void {
    this.world.step();
  }

  /** Static axis-aligned or rotated box collider. */
  addBox(center: THREE.Vector3, half: THREE.Vector3, quat?: THREE.Quaternion, friction = 0.8): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setFriction(friction)
      .setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    if (quat) desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    return this.world.createCollider(desc);
  }

  addCylinder(center: THREE.Vector3, halfHeight: number, radius: number, quat?: THREE.Quaternion): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    if (quat) desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    return this.world.createCollider(desc);
  }

  addBall(center: THREE.Vector3, radius: number): RAPIER.Collider {
    return this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setTranslation(center.x, center.y, center.z)
        .setCollisionGroups(groups(GROUP.STATIC, 0xffff)),
    );
  }

  /**
   * Heightfield collider. `heights` is indexed [zi * (nx+1) + xi] (row-major by z) as used by
   * our terrain generator; this converts to Rapier's column-major layout.
   */
  addHeightfield(
    heights: Float32Array,
    cellsX: number,
    cellsZ: number,
    sizeX: number,
    sizeZ: number,
    center: THREE.Vector3,
  ): RAPIER.Collider {
    const nx = cellsX + 1;
    const nz = cellsZ + 1;
    const hf = new Float32Array(nx * nz);
    for (let zi = 0; zi < nz; zi++) {
      for (let xi = 0; xi < nx; xi++) {
        hf[zi + xi * nz] = heights[zi * nx + xi];
      }
    }
    const desc = RAPIER.ColliderDesc.heightfield(cellsZ, cellsX, hf, { x: sizeX, y: 1, z: sizeZ })
      .setTranslation(center.x, center.y, center.z)
      .setFriction(0.9)
      .setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    return this.world.createCollider(desc);
  }

  addTrimesh(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): RAPIER.Collider {
    const g = geometry.index ? geometry : geometry;
    const pos = g.getAttribute('position');
    const verts = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (matrix) v.applyMatrix4(matrix);
      verts[i * 3] = v.x;
      verts[i * 3 + 1] = v.y;
      verts[i * 3 + 2] = v.z;
    }
    let idx: Uint32Array;
    if (g.index) idx = new Uint32Array(g.index.array);
    else {
      idx = new Uint32Array(pos.count);
      for (let i = 0; i < pos.count; i++) idx[i] = i;
    }
    return this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(verts, idx).setCollisionGroups(groups(GROUP.STATIC, 0xffff)),
    );
  }

  removeCollider(c: RAPIER.Collider): void {
    if (this.freed) return;
    this.world.removeCollider(c, false);
  }

  /** Raycast against static geometry. Returns distance or null. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, filterGroups = groups(0xffff, GROUP.STATIC)): number | null {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRay(ray, maxDist, true, undefined, filterGroups);
    return hit ? hit.timeOfImpact : null;
  }

  /** Sphere cast (for camera collision). Returns the safe distance along dir. */
  sphereCast(origin: THREE.Vector3, dir: THREE.Vector3, radius: number, maxDist: number): number {
    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: dir.x, y: dir.y, z: dir.z },
      shape,
      0,
      maxDist,
      true,
      undefined,
      groups(0xffff, GROUP.STATIC),
    );
    return hit ? hit.time_of_impact : maxDist;
  }

  free(): void {
    if (this.freed) return;
    this.freed = true;
    this.world.free();
  }
}
