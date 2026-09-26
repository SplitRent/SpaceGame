import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rng } from '../engine/Rng';
import { smoothstep } from '../engine/math';

/**
 * Heightfield terrain: a deterministic height function sampled into a grid (shared by the
 * render chunks and the physics collider, so they always match), rendered as LOD chunks
 * with skirts. Terrain is regenerated from its seed — never saved.
 */

export interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
  rim: number;
  /** 0 = fresh, 1 = ancient/degraded */
  age: number;
}

export interface Stamp {
  /** Returns height delta (m) and optional override blend at (x,z). */
  apply(x: number, z: number, h: number, hf: HeightField): number;
}

export interface TerrainSpec {
  seed: number;
  size: number; // metres (square)
  cell: number; // metres per grid cell
  baseAmp: number;
  craterCount: number;
  craterMaxR: number;
  craters?: Crater[]; // authored craters
  stamps?: Stamp[];
  colorFn?: (x: number, z: number, h: number, slope: number, craterMask: number) => THREE.Color;
}

export class HeightField {
  readonly cells: number;
  readonly verts: number;
  readonly heights: Float32Array;
  readonly craterMask: Float32Array;
  readonly half: number;
  craters: Crater[] = [];
  private grid = new Map<string, Crater[]>();
  private noise: (x: number, y: number) => number;
  private noise2: (x: number, y: number) => number;
  private readonly gridCell = 96;

  constructor(readonly spec: TerrainSpec) {
    this.cells = Math.round(spec.size / spec.cell);
    this.verts = this.cells + 1;
    this.half = spec.size / 2;
    const rng = new Rng(spec.seed);
    this.noise = createNoise2D(() => rng.next());
    this.noise2 = createNoise2D(() => rng.next());
    // Crater population: power-law size distribution (many small, few large).
    const craters: Crater[] = [...(spec.craters ?? [])];
    for (let i = 0; i < spec.craterCount; i++) {
      const u = rng.next();
      const r = 3 + Math.pow(u, 4.5) * spec.craterMaxR;
      const age = rng.next();
      craters.push({
        x: rng.range(-this.half * 1.1, this.half * 1.1),
        z: rng.range(-this.half * 1.1, this.half * 1.1),
        r,
        depth: r * (0.32 - age * 0.18),
        rim: r * (0.06 - age * 0.035),
        age,
      });
    }
    this.craters = craters;
    for (const c of craters) {
      const reach = c.r * 1.8;
      const x0 = Math.floor((c.x - reach) / this.gridCell), x1 = Math.floor((c.x + reach) / this.gridCell);
      const z0 = Math.floor((c.z - reach) / this.gridCell), z1 = Math.floor((c.z + reach) / this.gridCell);
      for (let gx = x0; gx <= x1; gx++)
        for (let gz = z0; gz <= z1; gz++) {
          const k = `${gx},${gz}`;
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(c);
        }
    }
    this.heights = new Float32Array(this.verts * this.verts);
    this.craterMask = new Float32Array(this.verts * this.verts);
    for (let zi = 0; zi < this.verts; zi++) {
      for (let xi = 0; xi < this.verts; xi++) {
        const x = -this.half + xi * spec.cell;
        const z = -this.half + zi * spec.cell;
        const r = this.evaluate(x, z);
        this.heights[zi * this.verts + xi] = r.h;
        this.craterMask[zi * this.verts + xi] = r.mask;
      }
    }
  }

  /** Analytic height (used for generation and far-terrain beyond the grid). */
  /** Height without authored stamps (used by flatten stamps to find their target). */
  baseHeight(x: number, z: number): number {
    return this.evaluate(x, z, false).h;
  }

  evaluate(x: number, z: number, withStamps = true): { h: number; mask: number } {
    const s = this.spec;
    const n = this.noise;
    // Rolling highlands (fbm)
    let h = 0;
    let amp = s.baseAmp;
    let freq = 1 / 900;
    for (let o = 0; o < 5; o++) {
      h += n(x * freq, z * freq) * amp;
      amp *= 0.45;
      freq *= 2.1;
    }
    // Fine regolith undulation
    h += this.noise2(x / 18, z / 18) * 0.35 + this.noise2(x / 6, z / 6) * 0.08;
    // Craters
    let mask = 0;
    const cell = this.gridCell;
    const list = this.grid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
    if (list) {
      for (const c of list) {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.sqrt(dx * dx + dz * dz) / c.r;
        if (d > 1.8) continue;
        h += craterProfile(d, c);
        if (d < 1) mask = Math.max(mask, (1 - d) * (1 - c.age * 0.7));
      }
    }
    if (withStamps && s.stamps) for (const st of s.stamps) h = st.apply(x, z, h, this);
    return { h, mask };
  }

  /** Bilinear height lookup from the grid (matches physics). */
  heightAt(x: number, z: number): number {
    const fx = (x + this.half) / this.spec.cell;
    const fz = (z + this.half) / this.spec.cell;
    if (fx < 0 || fz < 0 || fx >= this.cells || fz >= this.cells) return this.evaluate(x, z).h;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = fx - x0, tz = fz - z0;
    const v = this.verts;
    const h00 = this.heights[z0 * v + x0], h10 = this.heights[z0 * v + x0 + 1];
    const h01 = this.heights[(z0 + 1) * v + x0], h11 = this.heights[(z0 + 1) * v + x0 + 1];
    // Match the triangle split used by the heightfield collider (diagonal).
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = this.spec.cell;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  maskAt(x: number, z: number): number {
    const xi = Math.round((x + this.half) / this.spec.cell);
    const zi = Math.round((z + this.half) / this.spec.cell);
    if (xi < 0 || zi < 0 || xi > this.cells || zi > this.cells) return 0;
    return this.craterMask[zi * this.verts + xi];
  }
}

export function craterProfile(d: number, c: Crater): number {
  // Bowl with raised rim and ejecta falloff. d = distance / radius.
  const soft = 0.25 + c.age * 0.5;
  if (d < 1) {
    const bowl = -c.depth * (1 - d * d);
    const floor = c.r > 60 ? -c.depth * 0.85 : bowl; // larger craters have flatter floors
    const b = c.r > 60 ? Math.max(bowl, floor) : bowl;
    return b + c.rim * smoothstep(1 - soft, 1, d);
  }
  const t = (d - 1) / 0.8;
  return c.rim * Math.exp(-t * t * 3);
}

/* ---------------------------------------------------------------------- */
/*                             Chunked mesh                                */
/* ---------------------------------------------------------------------- */

export interface ChunkedTerrainOptions {
  chunkSize: number; // metres
  lods: number[]; // cells-per-chunk for each LOD, finest first (must divide chunk cells)
  lodDistances: number[]; // switch distances
  material: THREE.Material;
  colorFn: (x: number, z: number, h: number, slope: number, mask: number) => THREE.Color;
}

interface Chunk {
  cx: number;
  cz: number;
  center: THREE.Vector3;
  lod: number;
  meshes: (THREE.Mesh | null)[];
}

export class ChunkedTerrain {
  readonly group = new THREE.Group();
  private chunks: Chunk[] = [];
  private timer = 0;

  constructor(readonly hf: HeightField, readonly opts: ChunkedTerrainOptions) {
    const n = Math.round(hf.spec.size / opts.chunkSize);
    for (let cz = 0; cz < n; cz++)
      for (let cx = 0; cx < n; cx++) {
        const x = -hf.half + (cx + 0.5) * opts.chunkSize;
        const z = -hf.half + (cz + 0.5) * opts.chunkSize;
        this.chunks.push({ cx, cz, center: new THREE.Vector3(x, hf.heightAt(x, z), z), lod: -1, meshes: opts.lods.map(() => null) });
      }
  }

  update(dt: number, camPos: THREE.Vector3, force = false): void {
    this.timer -= dt;
    if (this.timer > 0 && !force) return;
    this.timer = 0.25;
    for (const c of this.chunks) {
      const d = Math.hypot(c.center.x - camPos.x, c.center.z - camPos.z);
      let lod = this.opts.lodDistances.findIndex((ld) => d < ld);
      if (lod < 0) lod = this.opts.lods.length - 1;
      if (lod === c.lod) continue;
      if (c.lod >= 0 && c.meshes[c.lod]) c.meshes[c.lod]!.visible = false;
      c.lod = lod;
      let m = c.meshes[lod];
      if (!m) {
        m = this.buildChunk(c, this.opts.lods[lod]);
        c.meshes[lod] = m;
        this.group.add(m);
      }
      m.visible = true;
    }
  }

  private buildChunk(c: Chunk, seg: number): THREE.Mesh {
    const hf = this.hf;
    const size = this.opts.chunkSize;
    const x0 = -hf.half + c.cx * size;
    const z0 = -hf.half + c.cz * size;
    const step = size / seg;
    const vpr = seg + 1;
    // grid verts + skirt verts (4 edges)
    const skirtCount = seg * 4 + 4;
    const total = vpr * vpr + skirtCount * 2;
    const pos = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const idx: number[] = [];
    const n = new THREE.Vector3();
    let v = 0;
    const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, color: THREE.Color) => {
      pos[v * 3] = x;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = z;
      nrm[v * 3] = nx;
      nrm[v * 3 + 1] = ny;
      nrm[v * 3 + 2] = nz;
      col[v * 3] = color.r;
      col[v * 3 + 1] = color.g;
      col[v * 3 + 2] = color.b;
      uv[v * 2] = x / 8;
      uv[v * 2 + 1] = z / 8;
      return v++;
    };
    for (let j = 0; j <= seg; j++)
      for (let i = 0; i <= seg; i++) {
        const x = x0 + i * step;
        const z = z0 + j * step;
        const h = hf.heightAt(x, z);
        hf.normalAt(x, z, n);
        const color = this.opts.colorFn(x, z, h, 1 - n.y, hf.maskAt(x, z));
        put(x, h, z, n.x, n.y, n.z, color);
      }
    for (let j = 0; j < seg; j++)
      for (let i = 0; i < seg; i++) {
        const a = j * vpr + i, b = a + 1, c2 = a + vpr, d = c2 + 1;
        // Diagonal split matching HeightField.heightAt
        idx.push(a, c2, b, b, c2, d);
      }
    // Skirts: duplicate edge verts pushed down
    const edge: number[] = [];
    for (let i = 0; i <= seg; i++) edge.push(i); // top row (z0)
    for (let j = 1; j <= seg; j++) edge.push(j * vpr + seg); // right col
    for (let i = seg - 1; i >= 0; i--) edge.push(seg * vpr + i); // bottom row
    for (let j = seg - 1; j >= 1; j--) edge.push(j * vpr); // left col
    edge.push(0);
    const skirtDepth = step * 1.5 + 2;
    const base = v;
    for (const e of edge) {
      const c3 = new THREE.Color(col[e * 3], col[e * 3 + 1], col[e * 3 + 2]);
      put(pos[e * 3], pos[e * 3 + 1] - skirtDepth, pos[e * 3 + 2], nrm[e * 3], nrm[e * 3 + 1], nrm[e * 3 + 2], c3);
    }
    for (let k = 0; k < edge.length - 1; k++) {
      const a = edge[k], b = edge[k + 1], a2 = base + k, b2 = base + k + 1;
      idx.push(a, b, a2, b, b2, a2);
      idx.push(a, a2, b, b, a2, b2); // double-sided skirt
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm.subarray(0, v * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, v * 2), 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.opts.material);
    m.receiveShadow = true;
    m.castShadow = true;
    return m;
  }

  dispose(): void {
    for (const c of this.chunks) for (const m of c.meshes) m?.geometry.dispose();
    this.group.clear();
  }
}

/** Build a coarse far-terrain ring (no collision) that extends the landscape to the horizon. */
export function buildFarTerrain(
  hf: HeightField,
  innerHalf: number,
  outerRadius: number,
  material: THREE.Material,
  colorFn: (x: number, z: number, h: number, slope: number, mask: number) => THREE.Color,
  curvatureR: number,
  heightFn?: (x: number, z: number) => number,
): THREE.Mesh {
  const rings = 48;
  const segs = 128;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const hAt = heightFn ?? ((x: number, z: number) => hf.evaluate(x, z).h);
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const rad = innerHalf * 0.92 + (outerRadius - innerHalf * 0.92) * Math.pow(t, 1.6);
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      // Square-to-circle blend for the inner edge so it hides under the chunk grid.
      const cx = Math.cos(a), sz = Math.sin(a);
      const sq = 1 / Math.max(Math.abs(cx), Math.abs(sz));
      const k = r === 0 ? sq : 1 + (sq - 1) * (1 - t) ** 3;
      const x = cx * rad * k;
      const z = sz * rad * k;
      const d = Math.hypot(x, z);
      const drop = (d * d) / (2 * curvatureR);
      const h = hAt(x, z) - drop - (r === 0 ? 3 : 0);
      pos.push(x, h, z);
      const c = colorFn(x, z, h, 0.1, 0);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = segs + 1;
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < segs; s++) {
      const a = r * row + s, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}
