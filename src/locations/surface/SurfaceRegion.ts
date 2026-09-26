import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { createNoise2D } from 'simplex-noise';
import { Location, type LocationEnv } from '../Location';
import type { Game } from '../../Game';
import { HeightField, ChunkedTerrain, buildFarTerrain, craterProfile, type Stamp } from '../../procgen/terrain';
import { Sky } from '../../render/sky';
import { AtmoSkyDome } from '../../render/atmoSky';
import { createPlanet, type PlanetHandle, type PlanetKind } from '../../render/planets';
import { buildLantern, type LanternModel } from '../../procgen/lanternShip';
import { scatterRocks, rockGeometry } from '../../procgen/rocks';
import { regolithDetailTexture } from '../../procgen/textures';
import { buildPoi } from '../../procgen/poiMeshes';
import { buildFlora, FaunaSystem } from '../../procgen/alienLife';
import { Rng } from '../../engine/Rng';
import { smoothstep } from '../../engine/math';
import { CrewRuntime, type Spot } from '../../gameplay/crew';
import { ui } from '../../ui/uiState';
import { addLanternExterior } from '../shipExterior';
import { registerPoiInteract } from '../poiInteract';
import type { SurfaceDef, TerrainFeature, PoiDef } from '../../content/worldTypes';

const CELL = 2;
const fieldCache = new Map<string, HeightField>();

/** Deterministic 2D hash → [0,1). */
function hash2(x: number, z: number, s: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * A data-driven planetary surface region (see content/worldTypes.ts). Terrain features,
 * palette, sky, lighting, weather, points of interest, resources, flora and fauna all
 * come from a SurfaceDef; every POI interaction runs through the Store's effect DSL, so
 * quests and dialogue react without per-world code.
 */
export class SurfaceRegion extends Location {
  readonly id: string;
  readonly name: string;
  readonly mode = 'foot' as const;
  hf!: HeightField;
  private terrain!: ChunkedTerrain;
  private sky!: Sky;
  private dome: AtmoSkyDome | null = null;
  private csm!: CSM;
  private fill!: THREE.HemisphereLight;
  /** Sunlight bounced off the terrain: lifts slopes facing away from a low sun. */
  private bounce!: THREE.DirectionalLight;
  private fog: THREE.Fog | null = null;
  private skyBody: PlanetHandle | null = null;
  private ship: LanternModel | null = null;
  private shipRoot = new THREE.Group();
  private sunDir = new THREE.Vector3();
  private noonDir: THREE.Vector3;
  private eastDir: THREE.Vector3;
  private crew: CrewRuntime | null = null;
  private fauna: FaunaSystem | null = null;
  private weather: THREE.Points | null = null;
  private pulses: THREE.PointLight[] = [];
  private geysers: THREE.Vector3[] = [];
  private geyserTimer = 0;
  private poiObjects = new Map<string, { def: PoiDef; group: THREE.Group }>();
  private zones: { id: string; name: string; x: number; z: number; r: number; poi?: string }[] = [];
  private zoneTimer = 0;
  private half: number;

  constructor(game: Game, readonly def: SurfaceDef) {
    super(game, def.gravity);
    this.id = def.id;
    this.name = def.name;
    this.half = def.size / 2;
    this.env = {
      gravity: def.gravity,
      atmosphere: def.atmosphere,
      temperatureC: def.temperature[0],
      radiation: def.radiationDamage ? 5 : 1,
      ambience: def.ambience,
    } satisfies LocationEnv;
    this.killY = -400;
    if (def.coldLimit !== undefined) this.coldLimit = def.coldLimit;
    this.bounds = new THREE.Box3(new THREE.Vector3(-this.half + 20, -300, -this.half + 20), new THREE.Vector3(this.half - 20, 2000, this.half - 20));
    this.noonDir = new THREE.Vector3(...def.sun.dir).normalize();
    this.eastDir = new THREE.Vector3().crossVectors(this.noonDir, new THREE.Vector3(0, 0, 1));
    if (this.eastDir.lengthSq() < 1e-4) this.eastDir.set(1, 0, 0);
    this.eastDir.normalize();
    this.sunDir.copy(this.noonDir);
  }

  /* ------------------------------ Terrain ------------------------------ */

  private buildStamps(): Stamp[] {
    const d = this.def;
    const rng = new Rng(d.seed + 5);
    const noise = createNoise2D(() => rng.next());
    const stamps: Stamp[] = [];
    const feats: TerrainFeature[] = [...d.terrain.features];
    // Level the landing zone and any POI that asks for it.
    feats.push({ kind: 'flatten', x: d.lz[0], z: d.lz[1], r: 46, falloff: 26 });
    for (const p of d.pois) if (p.flat) feats.push({ kind: 'flatten', x: p.x, z: p.z, r: p.flat, falloff: p.flat * 0.6 });
    const heightBefore = (i: number, x: number, z: number, hf: HeightField) => {
      let h = hf.baseHeight(x, z);
      for (let j = 0; j < i; j++) h = stamps[j].apply(x, z, h, hf);
      return h;
    };
    feats.forEach((f, idx) => {
      switch (f.kind) {
        case 'rim':
          stamps.push({ apply: (x, z, h) => h + smoothstep(f.r0, f.r1, Math.hypot(x, z)) * f.h * (0.8 + 0.4 * noise(x * 0.003, z * 0.003)) });
          break;
        case 'mound':
          stamps.push({ apply: (x, z, h) => { const dd = (x - f.x) ** 2 + (z - f.z) ** 2; return h + f.h * Math.exp(-dd / (2 * f.r * f.r)); } });
          break;
        case 'crater':
          stamps.push({ apply: (x, z, h) => h + craterProfile(Math.hypot(x - f.x, z - f.z) / f.r, { x: f.x, z: f.z, r: f.r, depth: f.depth, rim: f.r * 0.07, age: 0.1 }) });
          break;
        case 'ridge': {
          const dx = f.x1 - f.x0, dz = f.z1 - f.z0;
          const len2 = dx * dx + dz * dz;
          stamps.push({
            apply: (x, z, h) => {
              const t = Math.max(0, Math.min(1, ((x - f.x0) * dx + (z - f.z0) * dz) / len2));
              const px = f.x0 + dx * t, pz = f.z0 + dz * t;
              const dd = Math.hypot(x - px, z - pz);
              if (dd > f.w * 3) return h;
              const taper = smoothstep(0, 0.08, t) * smoothstep(1, 0.92, t);
              const prof = f.double
                ? Math.exp(-((dd - f.w * 0.55) ** 2) / (2 * (f.w * 0.3) ** 2)) + (dd < f.w * 0.55 ? 0.35 : 0) * Math.exp(-(dd * dd) / (2 * (f.w * 0.5) ** 2))
                : Math.exp(-(dd * dd) / (2 * f.w * f.w));
              return h + f.h * prof * taper;
            },
          });
          break;
        }
        case 'blocks': {
          const br = new Rng(d.seed + idx * 13);
          const blocks = Array.from({ length: f.count }, () => {
            const a = br.range(0, Math.PI * 2);
            const r = Math.sqrt(br.next()) * f.r;
            return {
              x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r,
              w: br.range(f.size[0], f.size[1]), dd: br.range(f.size[0], f.size[1]),
              rot: br.range(0, Math.PI), h: f.h * br.range(0.5, 1.2), tx: br.range(-0.08, 0.08), tz: br.range(-0.08, 0.08),
            };
          });
          stamps.push({
            apply: (x, z, h) => {
              let add = 0;
              for (const b of blocks) {
                const ox = x - b.x, oz = z - b.z;
                const reach = (b.w + b.dd) * 0.6;
                if (Math.abs(ox) > reach || Math.abs(oz) > reach) continue;
                const c = Math.cos(b.rot), s = Math.sin(b.rot);
                const lx = ox * c - oz * s, lz = ox * s + oz * c;
                const m = (1 - smoothstep(b.w / 2 - 4, b.w / 2, Math.abs(lx))) * (1 - smoothstep(b.dd / 2 - 4, b.dd / 2, Math.abs(lz)));
                if (m > 0) add = Math.max(add, m * (b.h + lx * b.tx + lz * b.tz));
              }
              return h + add;
            },
          });
          break;
        }
        case 'cells':
          stamps.push({
            apply: (x, z, h) => {
              if (f.r !== undefined && Math.hypot(x - (f.x ?? 0), z - (f.z ?? 0)) > f.r) return h;
              const gx = x / f.scale, gz = z / f.scale;
              const ix = Math.floor(gx), iz = Math.floor(gz);
              let d1 = 9, d2 = 9;
              for (let a = -1; a <= 1; a++)
                for (let b = -1; b <= 1; b++) {
                  const cx = ix + a + 0.15 + 0.7 * hash2(ix + a, iz + b, 1), cz = iz + b + 0.15 + 0.7 * hash2(ix + a, iz + b, 2);
                  const dd = Math.hypot(gx - cx, gz - cz);
                  if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
                }
              const edge = 1 - smoothstep(0, 0.12, d2 - d1);
              // Cells are gently domed in the middle, troughs along the edges.
              const fade = f.r !== undefined ? 1 - smoothstep(f.r * 0.8, f.r, Math.hypot(x - (f.x ?? 0), z - (f.z ?? 0))) : 1;
              return h + fade * (-f.depth * edge + f.depth * 0.3 * (1 - d1));
            },
          });
          break;
        case 'dunes':
          stamps.push({
            apply: (x, z, h) => {
              const m = 1 - smoothstep(f.r * 0.7, f.r, Math.hypot(x - f.x, z - f.z));
              if (m <= 0) return h;
              const u = x * Math.cos(f.angle) + z * Math.sin(f.angle);
              const phase = (u / f.wavelength) * Math.PI * 2 + noise(x * 0.004, z * 0.004) * 2.2;
              return h + Math.pow(0.5 + 0.5 * Math.sin(phase), 2.2) * f.h * m;
            },
          });
          break;
        case 'mountains':
          stamps.push({
            apply: (x, z, h) => {
              const dd = (x - f.x) ** 2 + (z - f.z) ** 2;
              const m = Math.exp(-dd / (2 * f.r * f.r));
              if (m < 0.01) return h;
              const r1 = 1 - Math.abs(noise(x / 260, z / 260));
              const r2 = 1 - Math.abs(noise(x / 110 + 7, z / 110));
              const r3 = 1 - Math.abs(noise(x / 45 + 3, z / 45 + 9));
              return h + f.h * m * (0.55 * r1 * r1 + 0.3 * r2 * r2 + 0.15 * r3);
            },
          });
          break;
        case 'basin':
          stamps.push({ apply: (x, z, h) => h - f.depth * (1 - smoothstep(f.r * 0.65, f.r, Math.hypot(x - f.x, z - f.z))) });
          break;
        case 'flatten': {
          let target: number | null = null;
          const i = stamps.length;
          const fall = f.falloff ?? 20;
          stamps.push({
            apply: (x, z, h, hf) => {
              const dd = Math.hypot(x - f.x, z - f.z);
              if (dd > f.r + fall) return h;
              if (target === null) target = heightBefore(i, f.x, f.z, hf);
              const w = 1 - smoothstep(f.r, f.r + fall, dd);
              return h + (target - h) * w;
            },
          });
          break;
        }
      }
    });
    return stamps;
  }

  private colorFn(): (x: number, z: number, h: number, slope: number, mask: number) => THREE.Color {
    const p = this.def.palette;
    const base = new THREE.Color(p.base), alt = new THREE.Color(p.alt);
    const layers = p.layers.map((l) => ({ ...l, c: new THREE.Color(l.color) }));
    const rng = new Rng(this.def.seed + 77);
    const noise = createNoise2D(() => rng.next());
    const out = new THREE.Color();
    return (x, z, h, slope, mask) => {
      const n = 0.5 + 0.5 * noise(x / p.altScale, z / p.altScale);
      out.copy(base).lerp(alt, smoothstep(0.3, 0.7, n));
      const v = 0.94 + 0.12 * noise(x / 13, z / 13);
      out.multiplyScalar(v);
      for (const l of layers) {
        let k = 0;
        switch (l.mask) {
          case 'noise': k = smoothstep((l.threshold ?? 0.5) - 0.1, (l.threshold ?? 0.5) + 0.1, 0.5 + 0.5 * noise(x / l.scale + 11, z / l.scale - 5)); break;
          case 'slope': k = smoothstep(0.1, 0.5, slope); break;
          case 'height': k = (l.above !== undefined ? smoothstep(l.above - 4, l.above + 4, h) : 1) * (l.below !== undefined ? 1 - smoothstep(l.below - 2, l.below + 2, h) : 1); break;
          case 'lineae': k = 1 - smoothstep(0, l.width, Math.abs(noise(x / l.scale, z / l.scale))); break;
          case 'patch': k = 1 - smoothstep(l.r * 0.5, l.r, Math.hypot(x - l.x, z - l.z)); break;
          case 'crater': k = mask; break;
          case 'cells': k = 0; break;
        }
        if (k > 0) out.lerp(l.c, k * l.amount);
      }
      return out.clone();
    };
  }

  /* -------------------------------- Build -------------------------------- */

  async build(): Promise<void> {
    const game = this.game;
    const d = this.def;
    const store = game.store;
    const scene = this.scene;
    scene.background = new THREE.Color('#000');

    let hf = fieldCache.get(d.id);
    if (!hf) {
      hf = new HeightField({ seed: d.seed, size: d.size, cell: CELL, baseAmp: d.terrain.baseAmp, craterCount: d.terrain.craterCount, craterMaxR: d.terrain.craterMaxR, stamps: this.buildStamps() });
      fieldCache.set(d.id, hf);
    }
    this.hf = hf;
    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: d.palette.detail === false ? null : regolithDetailTexture() });
    this.scope.own(terrainMat);
    const colorFn = this.colorFn();
    this.terrain = new ChunkedTerrain(hf, { chunkSize: 128, lods: [64, 32, 16], lodDistances: [260, 640], material: terrainMat, colorFn });
    scene.add(this.terrain.group);
    this.scope.add(() => this.terrain.dispose());
    scene.add(buildFarTerrain(hf, this.half, 8000, terrainMat, colorFn, d.terrain.curvatureR));
    this.physics.addHeightfield(hf.heights, hf.cells, hf.cells, d.size, d.size, new THREE.Vector3(0, 0, 0));
    if (d.liquid) {
      const l = d.liquid;
      const geo = new THREE.CircleGeometry(l.r, 64);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: l.color, roughness: 0.08, metalness: 0.5, transparent: true, opacity: l.opacity });
      const lake = new THREE.Mesh(geo, mat);
      lake.position.set(l.x, l.level, l.z);
      lake.receiveShadow = true;
      scene.add(lake);
    }

    // ---- Sky ----
    this.sky = new Sky({ earth: false, seed: d.seed, radius: 9000 });
    scene.add(this.sky.group);
    this.scope.add(() => this.sky.dispose());
    if (d.sky.kind === 'atmo') {
      this.sky.sunDisc.visible = false;
      this.dome = new AtmoSkyDome(8600, d.sky.zenith, d.sky.horizon, d.sky.halo, d.sun.disc ?? 1);
      scene.add(this.dome.mesh);
      this.fog = new THREE.Fog(d.sky.horizon, d.sky.fogNear, d.sky.fogFar);
      scene.fog = this.fog;
      scene.background = new THREE.Color(d.sky.horizon);
      const dome = this.dome;
      this.scope.add(() => dome.dispose());
    }
    if (d.skyBody) {
      const R = 8400;
      const radius = R * Math.tan(THREE.MathUtils.degToRad(d.skyBody.angularDeg / 2));
      this.skyBody = createPlanet(d.skyBody.kind as PlanetKind, radius, { segments: 96 });
      this.skyBody.group.traverse((o) => {
        o.renderOrder = -7;
        o.frustumCulled = false;
      });
      scene.add(this.skyBody.group);
      const sb = this.skyBody;
      this.scope.add(() => sb.dispose());
    }

    // ---- Light ----
    this.csm = new CSM({
      maxFar: 900,
      cascades: game.renderer.quality.shadows ? 3 : 1,
      mode: 'practical',
      parent: scene,
      shadowMapSize: game.renderer.quality.shadowMapSize,
      lightDirection: this.noonDir.clone().negate(),
      lightIntensity: d.sun.intensity,
      camera: game.cam.camera,
      lightFar: 3000,
      lightMargin: 500,
    } as never);
    (this.csm as unknown as { fade: boolean }).fade = true;
    for (const l of this.csmLights()) {
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.6;
      l.color.set(d.sun.color);
    }
    this.csm.setupMaterial(terrainMat);
    this.scope.add(() => {
      this.csm.remove();
      this.csm.dispose();
    });
    this.fill = new THREE.HemisphereLight(d.fill.sky, d.fill.ground, d.fill.intensity);
    scene.add(this.fill);
    this.bounce = new THREE.DirectionalLight(new THREE.Color(d.sun.color).lerp(new THREE.Color(d.palette.base), 0.5), 0);
    this.bounce.castShadow = false;
    scene.add(this.bounce, this.bounce.target);

    // ---- The Lantern ----
    const pk = store.state.ship.parking;
    if (pk.kind === 'surface' && pk.locationId === this.id) this.buildShip();

    // ---- Rocks, resources, POIs, life ----
    const avoid = (x: number, z: number) =>
      Math.hypot(x - d.lz[0], z - d.lz[1]) < 55 || d.pois.some((p) => Math.hypot(x - p.x, z - p.z) < (p.flat ?? 6) + 4) ||
      (d.liquid ? Math.hypot(x - d.liquid.x, z - d.liquid.z) < d.liquid.r && hf.heightAt(x, z) < d.liquid.level : false);
    const rockMat = new THREE.MeshStandardMaterial({ color: d.palette.rock, roughness: 0.92, flatShading: true });
    this.csm.setupMaterial(rockMat);
    this.scope.own(rockMat);
    const { meshes, big } = scatterRocks(rockMat, {
      count: d.rocks.count,
      seed: d.seed + 9,
      area: d.size * 0.94,
      minScale: 0.1,
      maxScale: d.rocks.maxScale,
      density: (x, z) => 0.35 + hf.maskAt(x, z) * 0.6 + Math.min(0.4, (1 - hf.normalAt(x, z).y) * 3),
      height: (x, z) => hf.heightAt(x, z),
      normal: (x, z) => hf.normalAt(x, z),
      avoid,
    });
    for (const m of meshes) scene.add(m);
    for (const b of big) this.physics.addBall(b.pos, b.r);
    this.buildNodes(avoid);
    this.buildPois();
    if (d.flora) {
      const flora = buildFlora(this, d.flora, (x, z) => hf.heightAt(x, z), avoid, this.noonDir, d.seed + 3);
      scene.add(flora);
      flora.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m?.isMeshStandardMaterial) this.csm.setupMaterial(m);
      });
    }
    if (d.fauna?.length) {
      this.fauna = new FaunaSystem(game, this, d.fauna, (x, z) => hf.heightAt(x, z), d.seed + 4);
      const f = this.fauna;
      this.scope.add(() => f.dispose());
    }
    if (d.weather) this.buildWeather();

    this.toolTargets.push({
      id: 'ground', object: this.terrain.group, action: 'mine', label: d.ground.label, range: 4, workTime: 0.9,
      available: () => true,
      onComplete: () => this.game.store.give(d.ground.item, 2),
    });
    this.scannables.push({ entry: d.ground.db, object: this.terrain.group, range: 6 });

    // ---- Spawns ----
    this.shipRoot.updateMatrixWorld(true);
    const sw = (v: THREE.Vector3) => v.clone().applyMatrix4(this.shipRoot.matrixWorld);
    const rampFoot = this.ship ? sw(this.ship.anchors.ramp).add(new THREE.Vector3(5, 0, 0)) : new THREE.Vector3(d.lz[0] + 25, 0, d.lz[1]);
    rampFoot.y = hf.heightAt(rampFoot.x, rampFoot.z) + 0.1;
    const airlockOut = this.ship ? sw(this.ship.anchors.airlock).add(new THREE.Vector3(3.5, 0, 0)) : rampFoot.clone();
    airlockOut.y = hf.heightAt(airlockOut.x, airlockOut.z) + 0.1;
    this.spawns.ramp = { id: 'ramp', position: rampFoot, yaw: -Math.PI / 2 };
    this.spawns.airlock = { id: 'airlock', position: airlockOut, yaw: -Math.PI / 2 };
    this.spawns.lz = { id: 'lz', position: this.ground(d.lz[0] + 40, d.lz[1]), yaw: -Math.PI / 2 };
    this.zones.push({ id: `${d.id}.lz`, name: 'Landing Zone', x: d.lz[0], z: d.lz[1], r: 60 });
    this.onStateChanged();
    this.terrain.update(0, new THREE.Vector3(rampFoot.x, 0, rampFoot.z), true);
  }

  private csmLights(): THREE.DirectionalLight[] {
    return (this.csm as unknown as { lights: THREE.DirectionalLight[] }).lights;
  }

  private ground(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, this.hf.heightAt(x, z) + 0.05, z);
  }

  private setupShadows(o: THREE.Object3D): void {
    o.traverse((c) => {
      const m = (c as THREE.Mesh).material as THREE.Material | undefined;
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) this.csm.setupMaterial(m);
    });
  }

  private buildShip(): void {
    const [x, z] = this.def.lz;
    this.ship = buildLantern({ damaged: false, power: 1, landed: true, portStrutExtension: 0 });
    this.shipRoot.add(this.ship.group);
    this.shipRoot.position.set(x, this.hf.heightAt(x, z) - 0.2, z);
    this.scene.add(this.shipRoot);
    const ship = this.ship;
    this.scope.add(() => ship.dispose());
    this.setupShadows(ship.group);
    const { rampDoor } = addLanternExterior(this.game, this, this.shipRoot, ship);
    (rampDoor.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5;
  }

  private buildNodes(avoid: (x: number, z: number) => boolean): void {
    const hf = this.hf;
    const store = this.game.store;
    const rng = new Rng(this.def.seed + 31);
    const geos = [rockGeometry(this.def.seed + 1, 1, 0.4), rockGeometry(this.def.seed + 2, 1, 0.3), rockGeometry(this.def.seed + 3, 0, 0.5)];
    geos.forEach((g) => this.scope.own(g));
    for (const n of this.def.nodes) {
      const mat = new THREE.MeshStandardMaterial({
        color: n.color, roughness: n.shiny ? 0.25 : 0.85, metalness: n.shiny ? 0.3 : 0.05, flatShading: true,
        emissive: n.glow ?? '#000000', emissiveIntensity: n.glow ? 0.6 : 0,
      });
      this.csm.setupMaterial(mat);
      this.scope.own(mat);
      let made = 0, tries = 0;
      while (made < n.count && tries++ < n.count * 60) {
        let x: number, z: number;
        if (n.r !== undefined) {
          const a = rng.range(0, Math.PI * 2);
          const r = Math.sqrt(rng.next()) * n.r;
          x = (n.x ?? 0) + Math.cos(a) * r;
          z = (n.z ?? 0) + Math.sin(a) * r;
        } else {
          x = rng.range(-this.half * 0.8, this.half * 0.8);
          z = rng.range(-this.half * 0.8, this.half * 0.8);
        }
        if (avoid(x, z) || (n.maxHeight !== undefined && hf.heightAt(x, z) > n.maxHeight)) continue;
        const id = `node.${n.id}.${made}`;
        const cap = rng.int(6, 12);
        const scale = rng.range(1.1, 1.8);
        const mesh = new THREE.Mesh(geos[made % 3], mat);
        mesh.position.set(x, hf.heightAt(x, z) + scale * 0.15, z);
        mesh.scale.setScalar(scale);
        mesh.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3));
        mesh.castShadow = true;
        this.scene.add(mesh);
        made++;
        let cycles = 0;
        const left = () => {
          const v = store.getEntity(this.id, id, 'left');
          return typeof v === 'number' ? v : cap;
        };
        this.toolTargets.push({
          id, object: mesh, action: 'mine', label: n.label, range: 4.2, workTime: 1.1,
          available: () => left() > 0,
          detail: () => `${left()} extractions left`,
          onComplete: () => {
            const l = left();
            if (l <= 0) return;
            cycles++;
            const give = n.alt && cycles % 3 === 0 ? n.alt : n.yields;
            store.batch('mine', () => {
              for (const [item, qty] of give) store.give(item, qty);
              store.setEntity(this.id, id, 'left', l - 1);
            });
            if (l - 1 <= 0) mesh.visible = false;
          },
        });
        this.scannables.push({ entry: n.db, object: mesh, range: 25 });
        if (left() <= 0) mesh.visible = false;
      }
    }
  }

  private buildPois(): void {
    const game = this.game;
    const store = game.store;
    const spots: Record<string, Spot> = {};
    for (const p of this.def.pois) {
      const base = this.ground(p.x, p.z);
      if (p.kind === 'npcspot') {
        spots[p.id] = { position: base, yaw: p.rot ?? 0 };
        continue;
      }
      const m = buildPoi(p.kind, p.variant, p.color);
      m.group.position.copy(base);
      m.group.rotation.y = p.rot ?? 0;
      if (p.scale) m.group.scale.setScalar(p.scale);
      this.scene.add(m.group);
      this.setupShadows(m.group);
      m.group.updateMatrixWorld(true);
      const visibleNow = !p.visibleIf || store.check(p.visibleIf);
      if (visibleNow) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot ?? 0, 0));
        for (const b of m.boxes) {
          const s = p.scale ?? 1;
          this.physics.addBox(b.c.clone().multiplyScalar(s).applyMatrix4(new THREE.Matrix4().makeRotationY(p.rot ?? 0)).add(base), b.h.clone().multiplyScalar(s), q);
        }
      }
      this.poiObjects.set(p.id, { def: p, group: m.group });
      if (m.light && (p.kind === 'spire' || p.kind === 'seed')) this.pulses.push(m.light);
      if (p.kind === 'geyser') this.geysers.push(base.clone());
      const visible = () => !p.visibleIf || store.check(p.visibleIf);
      if (p.interact) registerPoiInteract(game, this, p.id, m.target, p.interact, visible);
      if (p.weld) {
        const w = p.weld;
        this.toolTargets.push({
          id: `weld:${p.id}`, object: m.target, action: 'weld', label: w.label, range: 4.5, workTime: w.time ?? 3,
          available: () => visible() && !store.getEntity(this.id, p.id, 'welded') && (!w.available || store.check(w.available)),
          detail: () => (w.consumes?.length ? `Hold to weld (uses ${w.consumes.map((c) => `${c.qty} × ${store.content.items[c.item]?.name ?? c.item}`).join(', ')})` : 'Hold to weld'),
          onComplete: () => {
            if (w.consumes?.length && !store.takeAll(w.consumes)) {
              store.notify(`Need ${w.consumes.map((c) => `${c.qty} × ${store.content.items[c.item]?.name ?? c.item}`).join(', ')}`, 'warn');
              return;
            }
            store.batch(`weld:${p.id}`, () => {
              store.setEntity(this.id, p.id, 'welded', true);
              store.apply(w.effects);
            });
          },
        });
      }
      if (p.scan) this.scannables.push({ entry: p.scan, object: m.group, range: p.kind === 'recorder' ? 8 : 40 });
      if (p.zone) this.zones.push({ id: p.zone.id, name: p.zone.name, x: p.x, z: p.z, r: p.zone.r, poi: p.id });
      if (p.spawn) {
        const f = m.front.clone().multiplyScalar(p.scale ?? 1).applyMatrix4(new THREE.Matrix4().makeRotationY(p.rot ?? 0)).add(base);
        f.y = this.hf.heightAt(f.x, f.z) + 0.1;
        this.spawns[p.spawn] = { id: p.spawn, position: f, yaw: (p.rot ?? 0) + Math.PI };
      }
    }
    if (Object.keys(spots).length) {
      this.crew = new CrewRuntime(game, this, spots, (x, z) => this.hf.heightAt(x, z));
      const c = this.crew;
      this.scope.add(() => c.dispose());
    }
  }

  private buildWeather(): void {
    const w = this.def.weather!;
    const n = Math.round(1500 * w.density);
    const pos = new Float32Array(n * 3);
    const rng = new Rng(3);
    for (let i = 0; i < n; i++) pos.set([rng.range(-50, 50), rng.range(0, 35), rng.range(-50, 50)], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const glow = w.kind === 'spores';
    const m = new THREE.PointsMaterial({
      color: w.color, size: w.kind === 'rain' ? 0.08 : w.kind === 'snow' ? 0.12 : 0.18, transparent: true, opacity: glow ? 0.9 : 0.55, depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.weather = new THREE.Points(g, m);
    this.weather.frustumCulled = false;
    this.scene.add(this.weather);
  }

  private updateWeather(dt: number, cam: THREE.Vector3): void {
    if (!this.weather) return;
    const kind = this.def.weather!.kind;
    const a = this.weather.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const fall = kind === 'rain' ? 7 : kind === 'snow' ? 0.8 : kind === 'spores' ? -0.25 : 0.2;
    const wind = kind === 'dust' ? 9 : kind === 'rain' ? 1.5 : 0.6;
    const t = this.game.store.state.clock;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += (wind + Math.sin(t * 0.5 + i) * 0.4) * dt;
      arr[i + 1] -= fall * dt;
      arr[i + 2] += Math.cos(t * 0.3 + i) * 0.3 * dt;
      if (arr[i] > 50) arr[i] -= 100;
      if (arr[i + 1] < 0) arr[i + 1] += 35;
      if (arr[i + 1] > 35) arr[i + 1] -= 35;
    }
    a.needsUpdate = true;
    this.weather.position.set(cam.x, this.hf.heightAt(cam.x, cam.z) - 2, cam.z);
  }

  /* --------------------------- State & update --------------------------- */

  override onStateChanged(): void {
    const store = this.game.store;
    for (const { def, group } of this.poiObjects.values()) if (def.visibleIf) group.visible = store.check(def.visibleIf);
    this.crew?.refresh();
  }

  private sunAt(clock: number, out: THREE.Vector3): THREE.Vector3 {
    const period = this.def.sun.cycle;
    if (!period) return out.copy(this.noonDir);
    const h = (((clock + period * 0.15) % period) / period) * Math.PI * 2;
    return out.copy(this.eastDir).multiplyScalar(Math.cos(h)).addScaledVector(this.noonDir, Math.sin(h)).normalize();
  }

  override update(dt: number): void {
    const game = this.game;
    const cam = game.cam.camera;
    const s = game.store.state;
    const d = this.def;
    this.terrain.update(dt, cam.position);
    this.sunAt(s.clock, this.sunDir);
    const sunUp = smoothstep(-0.03, 0.08, this.sunDir.y);
    let day = sunUp;
    if (this.dome) {
      day = this.dome.update(cam.position, this.sunDir, 0).day;
      this.fog!.color.copy(this.dome.horizon);
      (this.scene.background as THREE.Color).copy(this.dome.horizon);
    }
    this.sky.sunDir.copy(this.sunDir);
    const starB = d.sky.kind === 'atmo' ? (1 - day) * (d.sky.nightStars ?? 1) : d.sky.starBrightness ?? 1.2 - sunUp * 0.4;
    this.sky.update(cam.position, s.clock, starB);
    this.sky.sunDisc.visible = d.sky.kind === 'space' && this.sunDir.y > -0.05;
    if (this.skyBody) {
      const dir = new THREE.Vector3(...d.skyBody!.dir).normalize();
      this.skyBody.group.position.copy(cam.position).addScaledVector(dir, 8400);
      this.skyBody.group.rotation.y = s.clock * (d.skyBody!.spin ?? 0.002);
      this.skyBody.update(s.clock, this.sunDir);
    }
    this.csm.lightDirection.copy(this.sunDir).negate();
    for (const l of this.csmLights()) l.intensity = d.sun.intensity * sunUp;
    this.csm.update();
    // A floor of ambient light so shaded ground never goes pure black, plus bounce light
    // from the sunlit terrain (stronger where an atmosphere scatters it around).
    this.fill.intensity = Math.max(0.22, d.fill.intensity * (0.25 + 0.75 * day));
    const atmo = d.sky.kind === 'atmo';
    this.bounce.intensity = d.sun.intensity * sunUp * (atmo ? 0.3 : 0.16);
    this.bounce.position.set(-this.sunDir.x, Math.max(0.35, this.sunDir.y), -this.sunDir.z).normalize().multiplyScalar(100).add(cam.position);
    this.bounce.target.position.copy(cam.position);
    this.updateWeather(dt, cam.position);
    // Blackglass sites keep the Cadence (compressed to ~20 s so it can be seen)
    const ph = (s.clock % 19.69) / 19.69;
    for (const l of this.pulses) l.intensity = ph < 0.08 ? 90 * (1 - ph / 0.08) : 4;
    // Geysers erupt periodically
    this.geyserTimer -= dt;
    if (this.geyserTimer <= 0 && this.geysers.length) {
      this.geyserTimer = 0.12;
      const burst = Math.sin(s.clock * 0.4) > 0.2;
      if (burst)
        for (const g of this.geysers) {
          if (g.distanceTo(cam.position) > 600) continue;
          this.particles.emit({ count: 10, position: g.clone().add(new THREE.Vector3(0, 0.5, 0)), velocity: new THREE.Vector3(0, 22, 0), spread: 2.5, life: [1.5, 3], size: 0.5, color: '#eaf4ff', gravity: d.gravity * 0.6, drag: 0.1 });
        }
    }
    this.particles.update(dt);
    this.glowParticles.update(dt);
    this.fauna?.update(dt);
    this.crew?.update(dt);
    // Discovery zones
    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) {
      this.zoneTimer = 0.5;
      const p = game.player.position;
      for (const z of this.zones) {
        if (s.universe.discovered[z.id]) continue;
        const poi = z.poi ? this.poiObjects.get(z.poi) : undefined;
        if (poi && !poi.group.visible) continue;
        if (Math.hypot(p.x - z.x, p.z - z.z) < z.r) {
          game.store.discover(z.id);
          game.showLocationTitle(z.name, 'Discovered');
        }
      }
    }
  }

  override temperatureAt(): number {
    const [dayT, nightT] = this.def.temperature;
    if (!this.def.sun.cycle) return dayT;
    return nightT + (dayT - nightT) * smoothstep(-0.05, 0.35, this.sunDir.y);
  }

  override hazardAt(): { radiation?: number } | null {
    return this.def.radiationDamage ? { radiation: this.def.radiationDamage } : null;
  }

  timeOfDayLabel(): string {
    const elev = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, this.sunDir.y))));
    return this.def.sun.cycle ? `${elev >= 0 ? 'Sun' : 'Night'} ${elev.toFixed(0)}°` : `Sun fixed at ${elev.toFixed(0)}°`;
  }

  /* ------------------------------ Survey map ------------------------------ */

  private mapUrl: string | null = null;
  private get mapHalf(): number {
    return this.half * 0.95;
  }
  mapTransform = (x: number, z: number): [number, number] => [(x + this.mapHalf) / (this.mapHalf * 2), (z + this.mapHalf) / (this.mapHalf * 2)];

  renderMap(): string {
    if (this.mapUrl) return this.mapUrl;
    const N = 384;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(N, N);
    const light = new THREE.Vector3(-0.6, 0.55, -0.5).normalize();
    const n = new THREE.Vector3();
    const tint = new THREE.Color(this.def.palette.base);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = -this.mapHalf + (i / N) * this.mapHalf * 2;
        const z = -this.mapHalf + (j / N) * this.mapHalf * 2;
        this.hf.normalAt(x, z, n);
        const tone = 60 + Math.max(0, n.dot(light)) * 150;
        const k = (j * N + i) * 4;
        const liquid = this.def.liquid && this.hf.heightAt(x, z) < this.def.liquid.level && Math.hypot(x - this.def.liquid.x, z - this.def.liquid.z) < this.def.liquid.r;
        img.data[k] = liquid ? 30 : tone * (0.5 + tint.r * 0.6);
        img.data[k + 1] = liquid ? 40 : tone * (0.5 + tint.g * 0.6);
        img.data[k + 2] = liquid ? 60 : tone * (0.5 + tint.b * 0.6);
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    this.mapUrl = cv.toDataURL();
    return this.mapUrl;
  }

  override waypointPos(key: string, from: THREE.Vector3): THREE.Vector3 | null {
    const [kind, arg] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind === 'poi') {
      const p = this.def.pois.find((q) => q.id === arg);
      return p ? this.ground(p.x, p.z).add(new THREE.Vector3(0, 1.5, 0)) : null;
    }
    if (kind === 'zone') {
      const z = this.zones.find((q) => q.id === arg);
      return z ? this.ground(z.x, z.z).add(new THREE.Vector3(0, 1.5, 0)) : null;
    }
    if (kind === 'pos') {
      const [x, z] = arg.split(',').map(Number);
      return this.ground(x, z).add(new THREE.Vector3(0, 1.5, 0));
    }
    return super.waypointPos(key, from);
  }

  override oxygenWaypoint(): { key: string; label: string } | null {
    return { key: 'it:enter.airlock', label: 'O₂ refill — the Lantern' };
  }

  mapMarkers(): { x: number; y: number; label: string; color: string }[] {
    const s = this.game.store.state;
    const out: { x: number; y: number; label: string; color: string }[] = [];
    const add = (x: number, z: number, label: string, color: string) => {
      const [u, v] = this.mapTransform(x, z);
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) out.push({ x: u, y: v, label, color });
    };
    if (this.ship) add(this.def.lz[0], this.def.lz[1], 'EXV Lantern', '#ffb347');
    for (const z of this.zones) {
      if (z.id.endsWith('.lz')) continue;
      const poi = z.poi ? this.poiObjects.get(z.poi) : undefined;
      if (poi && !poi.group.visible) continue;
      if (s.universe.discovered[z.id]) add(z.x, z.z, z.name, '#9fe8ff');
      else if (this.game.settings.navAssist === 'markers') add(z.x, z.z, `▶ ${z.name}`, '#ffb347');
    }
    for (const dd of s.world[this.id]?.dynamic ?? []) if (dd.kind === 'cache') add(dd.position[0], dd.position[2], 'Your dropped gear', '#ff6464');
    return out;
  }

  override onEnter(): void {
    const game = this.game;
    const d = this.def;
    const s = game.store.state;
    game.store.discover(this.id);
    game.store.discover(d.body);
    if (!s.flags[`hint.${d.id}`]) {
      game.store.setFlag(`hint.${d.id}`, true);
      game.audio.stinger('arrival');
      setTimeout(() => game.showLocationTitle(d.title, d.subtitle), 600);
      ui.hint.value = d.arrival.hint;
      setTimeout(() => {
        if (ui.hint.value === d.arrival.hint) ui.hint.value = null;
      }, 11000);
      const say = (game.story as unknown as { say?: (l: [string, string][]) => void }).say;
      if (d.arrival.lines.length) say?.(d.arrival.lines);
    }
  }
}
