#!/usr/bin/env node
/**
 * Builds public/data/earth_color.png (equirectangular RGBA: RGB = surface colour,
 * A = ocean mask for specular) from public-domain Natural Earth land/lake polygons.
 *
 *   node scripts/build-earth.mjs [path/to/ne_50m_land.geojson] [path/to/ne_50m_lakes.geojson]
 *
 * If no paths are given, the GeoJSON is downloaded from the Natural Earth GitHub repo.
 * The generated PNG is committed, so players never need to run this.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const W = 2048;
const H = 1024;
const OUT = path.resolve('public/data/earth_color.png');
const LAND_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson';
const LAKE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson';

async function load(p, url) {
  if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url}`);
  return res.json();
}

function rasterize(geo, mask) {
  for (const f of geo.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) fillPolygon(poly, mask);
  }
}

/** Even-odd scanline fill of a polygon with holes (lon/lat rings). */
function fillPolygon(rings, mask) {
  const edges = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [lon0, lat0] = ring[i];
      const [lon1, lat1] = ring[i + 1];
      const x0 = ((lon0 + 180) / 360) * W, y0 = ((90 - lat0) / 180) * H;
      const x1 = ((lon1 + 180) / 360) * W, y1 = ((90 - lat1) / 180) * H;
      if (y0 === y1) continue;
      edges.push(y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0]);
    }
  }
  let minY = H, maxY = 0;
  for (const e of edges) {
    minY = Math.min(minY, e[1]);
    maxY = Math.max(maxY, e[3]);
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const sy = y + 0.5;
    const xs = [];
    for (const [x0, y0, x1, y1] of edges) {
      if (sy < y0 || sy >= y1) continue;
      xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.round(xs[k]));
      const b = Math.min(W, Math.round(xs[k + 1]));
      for (let x = a; x < b; x++) mask[y * W + x] ^= 1;
    }
  }
}

function blur(src, radius) {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += src[y * W + ((x + W) % W)];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / (radius * 2 + 1);
      acc += src[y * W + ((x + radius + 1) % W)] - src[y * W + ((x - radius + W) % W)];
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let acc = 0, n = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= H) continue;
        acc += tmp[yy * W + x];
        n++;
      }
      out[y * W + x] = acc / n;
    }
  }
  return out;
}

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = x - xi, ty = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(tx) + (c - a) * s(ty) + (a - b - c + d) * s(tx) * s(ty);
}
function fbm(x, y) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    v += vnoise(x * f, y * f) * a;
    a *= 0.5;
    f *= 2;
  }
  return v;
}

const inBox = (lon, lat, a, b, c, d) => lon >= a && lon <= b && lat >= c && lat <= d;

// Arid regions as soft ellipses: [lon, lat, radiusLon, radiusLat, strength]
const DESERTS = [
  [8, 23, 26, 9, 1], [42, 22, 14, 9, 1], [55, 26, 8, 6, 0.9], [65, 30, 8, 5, 0.8], [58, 42, 8, 4, 0.7],
  [130, -25, 15, 7, 1], [19, -24, 7, 6, 0.8], [15, -23, 3, 6, 0.8], [95, 41, 18, 5, 0.9], [110, 43, 10, 4, 0.8],
  [-112, 33, 7, 6, 0.8], [-70, -24, 2.5, 7, 0.9], [-68, -44, 3, 6, 0.5], [45, 8, 5, 4, 0.6],
];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function landColor(lon, lat, n) {
  // Perturb coordinates so band edges aren't straight lines.
  const plat = lat + (n - 0.5) * 9;
  const plon = lon + (fbm(lon / 20 + 7, lat / 20) - 0.5) * 10;
  const al = Math.abs(plat);
  const TROP = [34 + n * 16, 88 + n * 20, 36 + n * 10];
  const SAV = [104 + n * 24, 112 + n * 20, 62 + n * 12];
  const TEMP = [70 + n * 26, 104 + n * 18, 56 + n * 12];
  const BOREAL = [44 + n * 16, 72 + n * 14, 48 + n * 10];
  const TUNDRA = [122 + n * 26, 120 + n * 22, 102 + n * 18];
  const ICE = [236, 241, 246];
  let c = TROP;
  c = mix(c, SAV, sstep(8, 18, al));
  c = mix(c, TEMP, sstep(22, 32, al));
  c = mix(c, BOREAL, sstep(46, 56, al));
  c = mix(c, TUNDRA, sstep(62, 70, al));
  // Deserts
  let arid = 0;
  for (const [dl, dt, rl, rt, st] of DESERTS) {
    const dx = (plon - dl) / rl, dy = (plat - dt) / rt;
    arid = Math.max(arid, st * (1 - sstep(0.55, 1.15, Math.sqrt(dx * dx + dy * dy))));
  }
  const SAND = [198 - n * 40, 166 - n * 36, 116 - n * 28];
  c = mix(c, SAND, Math.min(1, arid));
  // Ice sheets (Antarctica, Greenland) and high-latitude snow
  if (lat < -60 || inBox(lon, lat, -56, -10, 59, 84) || inBox(lon, lat, -66, -56, 75, 84)) return ICE;
  c = mix(c, [205, 210, 212], sstep(70, 78, al));
  return c;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgba) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [landPath, lakePath] = process.argv.slice(2);
const land = await load(landPath, LAND_URL);
const lakes = await load(lakePath, LAKE_URL);
const mask = new Uint8Array(W * H);
rasterize(land, mask);
const lakeMask = new Uint8Array(W * H);
rasterize(lakes, lakeMask);
for (let i = 0; i < mask.length; i++) if (lakeMask[i]) mask[i] = 0;
const soft = blur(Float32Array.from(mask), 6);

const rgba = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  const lat = 90 - ((y + 0.5) / H) * 180;
  for (let x = 0; x < W; x++) {
    const lon = ((x + 0.5) / W) * 360 - 180;
    const i = y * W + x;
    const n = fbm(x / 64, y / 64);
    let r, g, b, a;
    if (mask[i]) {
      [r, g, b] = landColor(lon, lat, n);
      a = 0;
    } else {
      // Ocean: deeper blue offshore, lighter near coasts, colder toward poles.
      const shallow = Math.min(1, soft[i] * 2.2);
      const polar = Math.max(0, (Math.abs(lat) - 45) / 45);
      r = 8 + shallow * 30 + polar * 10;
      g = 38 + shallow * 70 + polar * 18;
      b = 88 + shallow * 60 + polar * 10;
      if (lat < -66 || lat > 80) {
        // sea ice
        const ice = Math.min(1, (Math.abs(lat) - (lat < 0 ? 66 : 80)) / 6) * (0.6 + n * 0.4);
        r += (225 - r) * ice;
        g += (232 - g) * ice;
        b += (240 - b) * ice;
      }
      a = 255;
    }
    rgba[i * 4] = Math.round(Math.min(255, r));
    rgba[i * 4 + 1] = Math.round(Math.min(255, g));
    rgba[i * 4 + 2] = Math.round(Math.min(255, b));
    rgba[i * 4 + 3] = a;
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodePNG(rgba));
console.log(`Wrote ${OUT} (${W}x${H})`);
