import * as THREE from 'three';
import { KitBuilder } from '../../procgen/kit';
import type { PhysicsWorld } from '../../physics/Physics';

export type Side = 'n' | 's' | 'e' | 'w'; // n = -Z, s = +Z, e = +X, w = -X

export interface Opening {
  side: Side;
  /** Centre along the wall (world z for e/w walls, world x for n/s walls). */
  at: number;
  width: number;
  /** Door: 0..height. Window: sill..top. */
  bottom?: number;
  top?: number;
  window?: boolean;
}

export interface RoomDef {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
  h: number;
  openings: Opening[];
  /** Skip building walls on these sides (open to another room). */
  open?: Side[];
  noCeiling?: boolean;
  noFloor?: boolean;
  wall?: string;
  floor?: string;
}

const T = 0.2; // wall thickness

/**
 * Builds room shells (floor, ceiling, walls with door/window gaps) into a KitBuilder and
 * matching static colliders transformed by the ship frame (so a listing ship has
 * genuinely sloped floors).
 */
export class InteriorBuilder {
  constructor(
    readonly kit: KitBuilder,
    private physics: PhysicsWorld,
    private frame: THREE.Object3D,
  ) {}

  /** Visual + collider box in ship-local coordinates. */
  solid(key: string | null, w: number, h: number, d: number, x: number, y: number, z: number, rot?: [number, number, number]): void {
    if (key) this.kit.box(key, w, h, d, { x, y, z }, rot);
    this.collider(w, h, d, x, y, z, rot);
  }

  collider(w: number, h: number, d: number, x: number, y: number, z: number, rot?: [number, number, number]): void {
    this.frame.updateMatrixWorld(true);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))),
      new THREE.Vector3(1, 1, 1),
    );
    m.premultiply(this.frame.matrixWorld);
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(pos, q, s);
    this.physics.addBox(pos, new THREE.Vector3(w / 2, h / 2, d / 2), q);
  }

  room(r: RoomDef): void {
    const wall = r.wall ?? 'wall';
    const floor = r.floor ?? 'floor';
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (!r.noFloor) this.solid(floor, w, 0.2, d, cx, r.y - 0.1, cz);
    if (!r.noCeiling) this.solid('ceiling', w, 0.2, d, cx, r.y + r.h + 0.1, cz);
    const sides: Side[] = ['n', 's', 'e', 'w'];
    for (const side of sides) {
      if (r.open?.includes(side)) continue;
      const alongZ = side === 'e' || side === 'w';
      const a0 = alongZ ? r.z0 : r.x0;
      const a1 = alongZ ? r.z1 : r.x1;
      const fixed = side === 'n' ? r.z0 + T / 2 : side === 's' ? r.z1 - T / 2 : side === 'e' ? r.x1 - T / 2 : r.x0 + T / 2;
      const ops = r.openings.filter((o) => o.side === side).sort((p, q) => p.at - q.at);
      let cursor = a0;
      const seg = (from: number, to: number, y0: number, y1: number, key = wall) => {
        if (to - from < 0.01 || y1 - y0 < 0.01) return;
        const len = to - from;
        const mid = (from + to) / 2;
        const hy = y1 - y0;
        if (alongZ) this.solid(key, T, hy, len, fixed, r.y + y0 + hy / 2, mid);
        else this.solid(key, len, hy, T, mid, r.y + y0 + hy / 2, fixed);
        if (y0 === 0 && y1 === r.h && key === wall) {
          // accent stripe along full-height wall segments
          const inset = side === 'n' || side === 'w' ? T * 0.55 : -T * 0.55;
          if (alongZ) this.kit.box('stripe', 0.02, 0.06, len, { x: fixed + inset, y: r.y + 1.1, z: mid });
          else this.kit.box('stripe', len, 0.06, 0.02, { x: mid, y: r.y + 1.1, z: fixed + inset });
        }
      };
      for (const o of ops) {
        const s0 = o.at - o.width / 2;
        const s1 = o.at + o.width / 2;
        seg(cursor, s0, 0, r.h);
        const bottom = o.bottom ?? 0;
        const top = o.top ?? Math.min(2.4, r.h);
        if (bottom > 0) seg(s0, s1, 0, bottom);
        seg(s0, s1, top, r.h);
        if (o.window) {
          // glass pane (visual only; collider keeps the player inside)
          const len = s1 - s0;
          const mid = (s0 + s1) / 2;
          const hy = top - bottom;
          if (alongZ) {
            this.kit.box('glass', 0.05, hy, len, { x: fixed, y: r.y + bottom + hy / 2, z: mid });
            this.collider(T, hy, len, fixed, r.y + bottom + hy / 2, mid);
          } else {
            this.kit.box('glass', len, hy, 0.05, { x: mid, y: r.y + bottom + hy / 2, z: fixed });
            this.collider(len, hy, T, mid, r.y + bottom + hy / 2, fixed);
          }
          // frame
          if (alongZ) {
            this.kit.box('trim', 0.26, 0.08, len + 0.1, { x: fixed, y: r.y + top, z: mid });
            this.kit.box('trim', 0.26, 0.08, len + 0.1, { x: fixed, y: r.y + bottom, z: mid });
          } else {
            this.kit.box('trim', len + 0.1, 0.08, 0.26, { x: mid, y: r.y + top, z: fixed });
            this.kit.box('trim', len + 0.1, 0.08, 0.26, { x: mid, y: r.y + bottom, z: fixed });
          }
        } else {
          // door frame trim
          if (alongZ) {
            this.kit.box('trim', 0.3, top, 0.12, { x: fixed, y: r.y + top / 2, z: s0 - 0.06 });
            this.kit.box('trim', 0.3, top, 0.12, { x: fixed, y: r.y + top / 2, z: s1 + 0.06 });
            this.kit.box('trim', 0.3, 0.12, o.width + 0.24, { x: fixed, y: r.y + top + 0.06, z: o.at });
          } else {
            this.kit.box('trim', 0.12, top, 0.3, { x: s0 - 0.06, y: r.y + top / 2, z: fixed });
            this.kit.box('trim', 0.12, top, 0.3, { x: s1 + 0.06, y: r.y + top / 2, z: fixed });
            this.kit.box('trim', o.width + 0.24, 0.12, 0.3, { x: o.at, y: r.y + top + 0.06, z: fixed });
          }
        }
        cursor = s1;
      }
      seg(cursor, a1, 0, r.h);
    }
  }
}

/**
 * Walk graph for crew, derived from room layout: a node at every room centre and at every
 * doorway (windows excluded), rooms linked to their own doorways. Doorways shared by two
 * rooms merge into one node, which joins the rooms.
 */
export function navFromRooms(rooms: RoomDef[]): { nodes: Record<string, THREE.Vector3>; edges: [string, string][] } {
  const nodes: Record<string, THREE.Vector3> = {};
  const edges: [string, string][] = [];
  const key = (x: number, z: number) => `d:${Math.round(x * 2) / 2},${Math.round(z * 2) / 2}`;
  for (const r of rooms) {
    const c = `r:${r.id}`;
    nodes[c] = new THREE.Vector3((r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2);
    for (const o of r.openings) {
      if (o.window || (o.bottom ?? 0) > 0.3) continue;
      const x = o.side === 'e' ? r.x1 : o.side === 'w' ? r.x0 : o.at;
      const z = o.side === 'n' ? r.z0 : o.side === 's' ? r.z1 : o.at;
      const k = key(x, z);
      nodes[k] ??= new THREE.Vector3(x, r.y, z);
      edges.push([c, k]);
    }
  }
  return { nodes, edges };
}
