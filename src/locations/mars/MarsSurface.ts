import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { createNoise2D } from 'simplex-noise';
import { Location, type LocationEnv } from '../Location';
import type { Game } from '../../Game';
import { HeightField, ChunkedTerrain, buildFarTerrain, type Stamp } from '../../procgen/terrain';
import { Sky } from '../../render/sky';
import { buildLantern, type LanternModel } from '../../procgen/lanternShip';
import { scatterRocks, rockGeometry } from '../../procgen/rocks';
import { regolithDetailTexture } from '../../procgen/textures';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { Rng } from '../../engine/Rng';
import { smoothstep, clamp } from '../../engine/math';
import { ui, pushNotification } from '../../ui/uiState';
import { addLanternExterior } from '../shipExterior';
import { MarsSkyDome, marsSunDirection, marsStorm, MARS_DAY } from './marsSky';

const SIZE = 2048;
const CELL = 2;
const SEED = 7331;
const CURVATURE_R = 3_389_500;

/** Landing zone (the Lantern), Melas Station, and the points of interest along the canyon floor. */
export const LZ = new THREE.Vector2(-160, 80);
export const STATION = new THREE.Vector2(170, -90);
const REACTOR = new THREE.Vector2(262, -176);
const ROVER = new THREE.Vector2(-470, 300);
const SPIRE = new THREE.Vector2(760, -440);
const SLIDE = new THREE.Vector2(330, 560);
const BLUFF = new THREE.Vector2(-640, -470);

let cachedField: HeightField | null = null;

type NodeType = 'basalt' | 'hematite' | 'clay' | 'ice';
const NODE_INFO: Record<NodeType, { color: string; yields: [string, number][]; alt?: [string, number][]; db: string; cap: [number, number]; label: string }> = {
  basalt: { color: '#3b2e2a', yields: [['silicon', 2]], alt: [['iron', 1]], db: 'db.marsbasalt', cap: [8, 12], label: 'Basalt boulder' },
  hematite: { color: '#5a3a3a', yields: [['iron', 3]], db: 'db.hematite', cap: [6, 10], label: 'Hematite concretions' },
  clay: { color: '#b8906a', yields: [['aluminum', 2]], alt: [['silicon', 1]], db: 'db.layers', cap: [8, 12], label: 'Layered sulfate & clay deposit' },
  ice: { color: '#d8e4ea', yields: [['ice', 3]], db: 'db.marsice', cap: [10, 14], label: 'Exposed ground ice' },
};

interface Zone {
  id: string;
  name: string;
  center: THREE.Vector2;
  radius: number;
}

const ZONES: Zone[] = [
  { id: 'mars.lz', name: 'Landing Zone', center: LZ, radius: 70 },
  { id: 'mars.station', name: 'Melas Station', center: STATION, radius: 70 },
  { id: 'mars.rover', name: 'Rover Wreck', center: ROVER, radius: 40 },
  { id: 'mars.slide', name: 'Landslide Fan', center: SLIDE, radius: 150 },
  { id: 'mars.bluff', name: 'Ice Bluff', center: BLUFF, radius: 90 },
  { id: 'mars.spire', name: 'The Spire', center: SPIRE, radius: 40 },
];

/**
 * Melas Chasma, in the heart of Valles Marineris. A canyon floor of rust-coloured regolith
 * and dark basaltic dunes between walls of layered sediment hundreds of metres high.
 * Thin CO₂ air (0.6 % of Earth's pressure — suit required), 3.71 m/s² gravity, a
 * butterscotch sky, cold nights and dust storms.
 */
export class MarsSurface extends Location {
  readonly id = 'mars.melas';
  readonly name = 'Melas Chasma, Mars';
  readonly mode = 'foot' as const;
  hf!: HeightField;
  private terrain!: ChunkedTerrain;
  private sky!: Sky;
  private dome!: MarsSkyDome;
  private csm!: CSM;
  private fill!: THREE.HemisphereLight;
  private fog = new THREE.Fog('#c79a72', 400, 5500);
  private ship: LanternModel | null = null;
  private shipRoot = new THREE.Group();
  private sunDir = new THREE.Vector3();
  private storm = 0;
  private zoneTimer = 0;
  private dust!: THREE.Points;
  private stationLights: THREE.PointLight[] = [];
  private stationGlow!: THREE.MeshStandardMaterial;
  private spireLight!: THREE.PointLight;
  private footprints!: THREE.InstancedMesh;
  private cableSpark = 0;
  private cableGap!: THREE.Object3D;
  private cablePatch!: THREE.Object3D;

  constructor(game: Game) {
    super(game, 3.71);
    this.env = { gravity: 3.71, atmosphere: 'thin-co2', temperatureC: -40, radiation: 0.6, ambience: 'mars' } satisfies LocationEnv;
    this.killY = -200;
    this.bounds = new THREE.Box3(new THREE.Vector3(-SIZE / 2 + 20, -150, -SIZE / 2 + 20), new THREE.Vector3(SIZE / 2 - 20, 1500, SIZE / 2 - 20));
  }

  /* ------------------------------------------------------------------ */

  async build(): Promise<void> {
    const game = this.game;
    const store = game.store;
    const scene = this.scene;
    scene.background = new THREE.Color('#c79a72');
    scene.fog = this.fog;

    // ---- Terrain: canyon floor between two layered walls ----
    const rng = new Rng(SEED);
    const wn = createNoise2D(() => rng.next());
    const cache = new Map<string, number>();
    const cachedBase = (key: string, x: number, z: number, hf: HeightField) => {
      let v = cache.get(key);
      if (v === undefined) cache.set(key, (v = hf.baseHeight(x, z)));
      return v;
    };
    const stamps: Stamp[] = [
      {
        // Canyon walls with spurs, terraced into sedimentary layers.
        apply: (x, z, h) => {
          const zn = -660 + 90 * Math.sin(x * 0.0042) + 80 * wn(x * 0.004, 3.1);
          const zs = 720 + 70 * Math.sin(x * 0.0035 + 1) + 70 * wn(x * 0.004, 8.7);
          const north = 820 * smoothstep(-40, 700, zn - z);
          const south = 640 * smoothstep(-40, 640, z - zs);
          let wall = north + south;
          if (wall > 1) {
            // Resistant layers form ledges: gentle treads, steeper risers.
            const t = wall / 60;
            const f = t - Math.floor(t);
            wall = 60 * (Math.floor(t) + 0.35 * f + 0.65 * smoothstep(0.35, 0.8, f));
          }
          // Broad erosional spurs and gullies (spur-and-gully walls, as in Valles Marineris)
          const gully = (0.5 + 0.5 * Math.sin(x * 0.012 + wn(x * 0.003, z * 0.003) * 1.5)) * Math.min(1, wall / 200) * 40;
          return h + wall - gully;
        },
      },
      {
        // Dune field (dark basaltic sand) on the southern floor + the landslide fan.
        apply: (x, z, h) => {
          const m = smoothstep(120, 260, z) * (1 - smoothstep(560, 680, z)) * (1 - smoothstep(200, 420, x));
          const phase = (x * 0.8 + z * 0.6) * 0.05 + wn(x * 0.004, z * 0.004) * 2.2;
          const dune = Math.pow(0.5 + 0.5 * Math.sin(phase), 2.2) * 4.2;
          const dx = x - SLIDE.x, dz = z - SLIDE.y;
          const fan = 46 * Math.exp(-(dx * dx) / (2 * 180 * 180) - (dz * dz) / (2 * 110 * 110));
          return h + dune * m + fan;
        },
      },
      {
        // Level ground for the Lantern and the station
        apply: (x, z, h, hf) => {
          h = flatten(x, z, h, LZ.x, LZ.y, 48, 28, cachedBase('lz', LZ.x, LZ.y, hf));
          return flatten(x, z, h, STATION.x + 30, STATION.y - 25, 70, 30, cachedBase('st', STATION.x, STATION.y, hf));
        },
      },
    ];
    this.hf = cachedField ??= new HeightField({ seed: SEED, size: SIZE, cell: CELL, baseAmp: 14, craterCount: 70, craterMaxR: 45, stamps });
    const hf = this.hf;

    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: regolithDetailTexture() });
    this.scope.own(terrainMat);
    const c = new THREE.Color();
    const colorFn = (x: number, z: number, h: number, slope: number, mask: number) => {
      const n = (Math.sin(x * 0.013) * Math.cos(z * 0.011) + Math.sin(x * 0.041 + z * 0.037) * 0.5) * 0.5;
      // Floor: rust regolith
      c.setRGB(0.66 + n * 0.05, 0.39 + n * 0.03, 0.24 + n * 0.02);
      // Walls: alternating light/dark sedimentary layers by height
      const wallK = smoothstep(25, 90, h);
      if (wallK > 0) {
        const band = smoothstep(0.2, 0.8, 0.5 + 0.5 * Math.sin((h / 60) * Math.PI * 2 + Math.sin(x * 0.003) * 0.8));
        const light = [0.86, 0.68, 0.5], dark = [0.46, 0.26, 0.16];
        c.lerp(new THREE.Color(light[0] * band + dark[0] * (1 - band), light[1] * band + dark[1] * (1 - band), light[2] * band + dark[2] * (1 - band)), wallK);
      }
      // Dark dunes
      const dm = smoothstep(120, 260, z) * (1 - smoothstep(560, 680, z)) * (1 - smoothstep(200, 420, x)) * (1 - wallK);
      c.lerp(new THREE.Color(0.3, 0.23, 0.21), dm * 0.8);
      // Steep faces and crater interiors a little darker; landslide debris paler
      c.multiplyScalar(1 - slope * 0.25 - mask * 0.05);
      const ds = Math.hypot((x - SLIDE.x) / 180, (z - SLIDE.y) / 110);
      if (ds < 1) c.lerp(new THREE.Color(0.74, 0.55, 0.4), (1 - ds) * 0.5);
      return c.clone();
    };
    this.terrain = new ChunkedTerrain(hf, { chunkSize: 128, lods: [64, 32, 16], lodDistances: [260, 640], material: terrainMat, colorFn });
    scene.add(this.terrain.group);
    this.scope.add(() => this.terrain.dispose());
    const farH = (x: number, z: number) => hf.evaluate(x, z).h;
    scene.add(buildFarTerrain(hf, SIZE / 2, 8000, terrainMat, colorFn, CURVATURE_R, farH));
    this.physics.addHeightfield(hf.heights, hf.cells, hf.cells, SIZE, SIZE, new THREE.Vector3(0, 0, 0));

    // ---- Sky, sun, weather ----
    this.sky = new Sky({ earth: false, seed: 404, radius: 9000 });
    this.sky.sunDisc.visible = false;
    scene.add(this.sky.group);
    this.dome = new MarsSkyDome(8600);
    scene.add(this.dome.mesh);
    this.scope.add(() => {
      this.sky.dispose();
      this.dome.dispose();
    });
    this.csm = new CSM({
      maxFar: 900,
      cascades: game.renderer.quality.shadows ? 3 : 1,
      mode: 'practical',
      parent: scene,
      shadowMapSize: game.renderer.quality.shadowMapSize,
      lightDirection: new THREE.Vector3(-1, -0.5, 0).normalize(),
      lightIntensity: 2.4,
      camera: game.cam.camera,
      lightFar: 3000,
      lightMargin: 500,
    } as any);
    (this.csm as any).fade = true;
    for (const l of (this.csm as any).lights as THREE.DirectionalLight[]) {
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.6;
      l.color.set('#ffe9d2');
    }
    this.csm.setupMaterial(terrainMat);
    this.scope.add(() => {
      this.csm.remove();
      this.csm.dispose();
    });
    // Scattered skylight is strong on Mars: the dusty sky itself lights the ground.
    this.fill = new THREE.HemisphereLight('#e0b48e', '#6b3f2c', 0.5);
    scene.add(this.fill);
    this.buildDust();

    // ---- The Lantern (only if parked here) ----
    const pk = store.state.ship.parking;
    const shipHere = pk.kind === 'surface' && pk.locationId === this.id;
    if (shipHere) this.buildShip();

    // ---- Rocks ----
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8a5a40', roughness: 0.95, flatShading: true });
    this.csm.setupMaterial(rockMat);
    this.scope.own(rockMat);
    const avoid = (x: number, z: number) => Math.hypot(x - LZ.x, z - LZ.y) < 52 || Math.hypot(x - STATION.x - 30, z - STATION.y + 25) < 75;
    const { meshes, big } = scatterRocks(rockMat, {
      count: 4200,
      seed: SEED + 9,
      area: SIZE * 0.96,
      minScale: 0.1,
      maxScale: 2.6,
      density: (x, z) => 0.3 + hf.maskAt(x, z) * 0.6 + Math.min(0.5, (1 - hf.normalAt(x, z).y) * 3),
      height: (x, z) => hf.heightAt(x, z),
      normal: (x, z) => hf.normalAt(x, z),
      avoid,
    });
    for (const m of meshes) scene.add(m);
    for (const b of big) this.physics.addBall(b.pos, b.r);
    this.buildResourceNodes(avoid);

    // ---- Landmarks ----
    this.buildStation();
    this.buildRover();
    this.buildSpire();
    this.buildFootprints();

    this.toolTargets.push({
      id: 'regolith', object: this.terrain.group, action: 'mine', label: 'Martian regolith', range: 4, workTime: 0.9,
      available: () => true,
      onComplete: () => this.game.store.give('regolith', 2),
    });
    this.scannables.push({ entry: 'db.marsregolith', object: this.terrain.group, range: 6 });

    // ---- Spawns ----
    this.shipRoot.updateMatrixWorld(true);
    const shipWorld = (v: THREE.Vector3) => v.clone().applyMatrix4(this.shipRoot.matrixWorld);
    const rampFoot = this.ship ? shipWorld(this.ship.anchors.ramp).add(new THREE.Vector3(5, 0, 0)) : new THREE.Vector3(LZ.x + 20, 0, LZ.y);
    rampFoot.y = hf.heightAt(rampFoot.x, rampFoot.z) + 0.1;
    const airlockOut = this.ship ? shipWorld(this.ship.anchors.airlock).add(new THREE.Vector3(3.5, 0, 0)) : rampFoot.clone();
    airlockOut.y = hf.heightAt(airlockOut.x, airlockOut.z) + 0.1;
    this.spawns = {
      ramp: { id: 'ramp', position: rampFoot, yaw: -Math.PI / 2 },
      airlock: { id: 'airlock', position: airlockOut, yaw: -Math.PI / 2 },
      station: { id: 'station', position: this.ground(STATION.x, STATION.y + 11), yaw: Math.PI },
      lz: { id: 'lz', position: this.ground(LZ.x + 40, LZ.y), yaw: -Math.PI / 2 },
    };
    this.onStateChanged();
    this.terrain.update(0, new THREE.Vector3(rampFoot.x, 0, rampFoot.z), true);
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
    // Level, on all four struts, in the flattened landing zone.
    this.ship = buildLantern({ damaged: false, power: 1, landed: true, portStrutExtension: 0 });
    this.shipRoot.add(this.ship.group);
    this.shipRoot.position.set(LZ.x, this.hf.heightAt(LZ.x, LZ.y) - 0.2, LZ.y);
    this.scene.add(this.shipRoot);
    const ship = this.ship;
    this.scope.add(() => ship.dispose());
    this.setupShadows(ship.group);
    const { rampDoor } = addLanternExterior(this.game, this, this.shipRoot, ship);
    (rampDoor.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5;
  }

  /* ------------------------------ Weather ------------------------------ */

  private buildDust(): void {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const rng = new Rng(3);
    for (let i = 0; i < n; i++) pos.set([rng.range(-60, 60), rng.range(0, 30), rng.range(-60, 60)], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: '#c08a5e', size: 0.25, transparent: true, opacity: 0, depthWrite: false });
    this.dust = new THREE.Points(g, m);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  private updateWeather(dt: number, cam: THREE.Vector3): void {
    const a = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const wind = 6 + this.storm * 26;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += wind * dt;
      arr[i + 1] += Math.sin(i + this.game.store.state.clock) * dt * 0.6;
      if (arr[i] > 60) arr[i] -= 120;
      if (arr[i + 1] > 30) arr[i + 1] = 0;
      if (arr[i + 1] < 0) arr[i + 1] = 30;
    }
    a.needsUpdate = true;
    this.dust.position.set(cam.x, this.hf.heightAt(cam.x, cam.z) - 2, cam.z);
    (this.dust.material as THREE.PointsMaterial).opacity = (0.05 + this.storm * 0.6) * (0.15 + 0.85 * smoothstep(-0.1, 0.1, this.sunDir.y));
  }

  /* ---------------------------- Resource nodes ---------------------------- */

  private buildResourceNodes(avoid: (x: number, z: number) => boolean): void {
    const hf = this.hf;
    const rng = new Rng(SEED + 31);
    const geos = [rockGeometry(911, 1, 0.4), rockGeometry(912, 1, 0.3), rockGeometry(913, 0, 0.5)];
    geos.forEach((g) => this.scope.own(g));
    const mats: Record<string, THREE.MeshStandardMaterial> = {};
    for (const [k, info] of Object.entries(NODE_INFO)) {
      const m = new THREE.MeshStandardMaterial({
        color: info.color,
        roughness: k === 'ice' ? 0.3 : 0.85,
        metalness: k === 'hematite' ? 0.45 : 0.05,
        flatShading: true,
        emissive: k === 'ice' ? '#1a2a33' : '#000000',
        emissiveIntensity: k === 'ice' ? 0.4 : 0,
      });
      this.csm.setupMaterial(m);
      mats[k] = m;
      this.scope.own(m);
    }
    const place = (type: NodeType, count: number, pick: () => [number, number] | null) => {
      let made = 0;
      let tries = 0;
      while (made < count && tries < count * 40) {
        tries++;
        const p = pick();
        if (!p || avoid(p[0], p[1])) continue;
        this.addNode(`node.${type}.${made}`, type, p[0], p[1], geos[made % geos.length], mats[type], rng);
        made++;
      }
    };
    const floor = () => {
      const x = rng.range(-850, 850), z = rng.range(-560, 600);
      return hf.heightAt(x, z) < 40 ? ([x, z] as [number, number]) : null;
    };
    place('basalt', 16, floor);
    place('hematite', 12, () => {
      const p = floor();
      return p && p[1] > 60 && p[1] < 600 ? p : null;
    });
    // Layered deposits sit at the foot of the walls
    place('clay', 16, () => {
      const x = rng.range(-850, 850), z = rng.range(-760, 820);
      const h = hf.heightAt(x, z);
      return h > 25 && h < 70 ? [x, z] : null;
    });
    // Ground ice exposed in the shaded scarp of the northern bluff (as orbiters have seen in scarps)
    place('ice', 12, () => {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * 70;
      return [BLUFF.x + Math.cos(a) * r, BLUFF.y + Math.sin(a) * r];
    });
  }

  private addNode(id: string, type: NodeType, x: number, z: number, geo: THREE.BufferGeometry, mat: THREE.Material, rng: Rng): void {
    const store = this.game.store;
    const info = NODE_INFO[type];
    const cap = rng.int(info.cap[0], info.cap[1]);
    const scale = rng.range(1.1, 1.9);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, this.hf.heightAt(x, z) + scale * 0.15, z);
    mesh.scale.setScalar(scale);
    if (type === 'clay') mesh.scale.set(scale * 1.6, scale * 0.6, scale * 1.2);
    mesh.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    let cycles = 0;
    const left = () => {
      const v = store.getEntity(this.id, id, 'left');
      return typeof v === 'number' ? v : cap;
    };
    this.toolTargets.push({
      id, object: mesh, action: 'mine', label: info.label, range: 4.2, workTime: type === 'ice' ? 1.3 : 1.0,
      available: () => left() > 0,
      detail: () => `${left()} extractions left`,
      onComplete: () => {
        const l = left();
        if (l <= 0) return;
        cycles++;
        const give = info.alt && cycles % 3 === 0 ? info.alt : info.yields;
        store.batch('mine', () => {
          for (const [item, qty] of give) store.give(item, qty);
          store.setEntity(this.id, id, 'left', l - 1);
        });
        if (l - 1 <= 0) mesh.visible = false;
      },
    });
    this.scannables.push({ entry: info.db, object: mesh, range: 25 });
    if (left() <= 0) mesh.visible = false;
  }

  /* ------------------------------ Station ------------------------------ */

  private buildStation(): void {
    const game = this.game;
    const store = game.store;
    const base = this.ground(STATION.x, STATION.y);
    const kit = new KitBuilder({
      shell: stdMat('#e6e1d8', { roughness: 0.6 }),
      dust: stdMat('#b98a66', { roughness: 0.95 }),
      dark: stdMat('#2c3036', { roughness: 0.7 }),
      metal: stdMat('#8d959e', { metalness: 0.7, roughness: 0.4 }),
      solar: stdMat('#1f2e66', { roughness: 0.25, metalness: 0.5 }),
      accent: stdMat('#d9533a'),
    });
    // Main hab: two horizontal cylinders joined by a node, an inflatable dome, a garage
    kit.cyl('shell', 4, 4, 16, { x: 0, y: 4, z: 0 }, [0, 0, Math.PI / 2], 20);
    kit.cyl('shell', 4, 4, 12, { x: 14, y: 4, z: -8 }, [Math.PI / 2, 0, 0], 20);
    kit.box('dust', 16.2, 1.2, 8.2, { x: 0, y: 0.6, z: 0 });
    kit.add('shell', new THREE.SphereGeometry(7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), { x: -14, y: 0, z: -2 });
    kit.box('accent', 16.4, 0.5, 0.2, { x: 0, y: 6.4, z: 4.05 });
    kit.box('dark', 3, 3.4, 2, { x: 0, y: 1.7, z: 4.6 }); // airlock vestibule
    // Solar field, dusty
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      kit.box('solar', 5, 0.12, 2.6, { x: -30 + i * 6, y: 1.6, z: -22 - j * 4 }, [0.35, 0, 0]);
      kit.box('dust', 5, 0.04, 2.6, { x: -30 + i * 6, y: 1.68, z: -22 - j * 4 }, [0.35, 0, 0]);
    }
    // Comms mast
    kit.cyl('metal', 0.2, 0.3, 14, { x: 10, y: 7, z: 8 }, undefined, 8);
    kit.add('shell', new THREE.SphereGeometry(1.8, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), { x: 10, y: 14, z: 8 }, [-1, 0, 0]);
    const g = kit.build();
    g.position.copy(base);
    this.scene.add(g);
    this.setupShadows(g);
    this.physics.addBox(base.clone().add(new THREE.Vector3(0, 4, 0)), new THREE.Vector3(8.2, 4, 4.1));
    this.physics.addBox(base.clone().add(new THREE.Vector3(14, 4, -8)), new THREE.Vector3(4.1, 4, 6.2));
    this.physics.addBall(base.clone().add(new THREE.Vector3(-14, 0, -2)), 7);
    this.scannables.push({ entry: 'db.melas', object: g, range: 60 });

    // Window glow and exterior lights, driven by station power
    this.stationGlow = new THREE.MeshStandardMaterial({ color: '#2a2e33', emissive: '#ffd9a0', emissiveIntensity: 0 });
    this.scope.own(this.stationGlow);
    for (let i = -2; i <= 2; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.1), this.stationGlow);
      w.position.copy(base).add(new THREE.Vector3(i * 3, 4.6, 3.95));
      this.scene.add(w);
    }
    for (const [dx, dz] of [[-6, 6], [6, 6]]) {
      const l = new THREE.PointLight('#ffe0b0', 0, 30, 1.6);
      l.position.copy(base).add(new THREE.Vector3(dx, 6, dz));
      this.scene.add(l);
      this.stationLights.push(l);
    }

    // Airlock door → station interior
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.3), new THREE.MeshStandardMaterial({ color: '#1c1f24', emissive: '#ff8a3d', emissiveIntensity: 0.4 }));
    door.position.copy(base).add(new THREE.Vector3(0, 1.4, 5.65));
    this.scene.add(door);
    this.registerInteractable({
      id: 'melas.door', object: door, kind: 'door', range: 3.5,
      prompt: () => 'Melas Station airlock',
      detail: () => (store.state.flags['melas.power'] ? null : 'Manual crank — no power'),
      interact: () => {
        game.audio.play('airlock');
        void game.locations.travel({ location: 'mars.station', spawn: 'airlock' }, { label: store.state.flags['melas.power'] ? 'Cycling the station airlock…' : 'Cranking the airlock by hand…' });
      },
    });

    // Kilopower-class fission unit and its feeder cable (cut)
    const rp = this.ground(REACTOR.x, REACTOR.y);
    const rk = new KitBuilder({ m: stdMat('#b9bec4', { metalness: 0.6, roughness: 0.4 }), fin: stdMat('#5c636b', { metalness: 0.5 }), warn: stdMat('#f2c94c') });
    rk.cyl('m', 0.9, 1.1, 4, { x: 0, y: 2, z: 0 }, undefined, 16);
    rk.add('m', new THREE.ConeGeometry(3.2, 3, 16, 1, true), { x: 0, y: 5.2, z: 0 }, [Math.PI, 0, 0]);
    for (let i = 0; i < 8; i++) rk.box('fin', 0.05, 3, 1.4, { x: Math.cos((i / 8) * Math.PI * 2) * 1.7, y: 5, z: Math.sin((i / 8) * Math.PI * 2) * 1.7 }, [0, -(i / 8) * Math.PI * 2, 0]);
    rk.box('warn', 2.4, 0.2, 2.4, { x: 0, y: 0.1, z: 0 });
    const reactor = rk.build();
    reactor.position.copy(rp);
    this.scene.add(reactor);
    this.setupShadows(reactor);
    this.physics.addBox(rp.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(1.2, 2, 1.2));
    this.scannables.push({ entry: 'db.kilopower', object: reactor, range: 25 });
    // Cable along the ground from the reactor to the station
    const a = rp.clone().add(new THREE.Vector3(-1.5, 0.15, 1.5));
    const b = base.clone().add(new THREE.Vector3(16, 0.15, -14));
    const cableMat = stdMat('#1f2124', { roughness: 0.8 });
    this.scope.own(cableMat);
    const mid = a.clone().lerp(b, 0.5);
    const seg = (p0: THREE.Vector3, p1: THREE.Vector3) => {
      const len = p0.distanceTo(p1);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 6), cableMat);
      m.position.copy(p0).lerp(p1, 0.5);
      m.position.y = this.hf.heightAt(m.position.x, m.position.z) + 0.12;
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      this.scene.add(m);
      return m;
    };
    const dir = b.clone().sub(a).normalize();
    seg(a, mid.clone().addScaledVector(dir, -0.6));
    seg(mid.clone().addScaledVector(dir, 0.6), b);
    // The cut: two frayed ends; a splice appears once welded
    this.cableGap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: '#2a2521', emissive: '#ff6a2a', emissiveIntensity: 0.4 }));
    this.cableGap.position.copy(mid);
    this.cableGap.position.y = this.hf.heightAt(mid.x, mid.z) + 0.15;
    this.cableGap.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    this.scene.add(this.cableGap);
    this.cablePatch = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), stdMat('#c9a74a', { metalness: 0.7 }));
    this.cablePatch.position.copy(this.cableGap.position);
    this.cablePatch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(this.cablePatch);
    this.toolTargets.push({
      id: 'melas.cable', object: this.cableGap, action: 'weld', label: 'Severed feeder cable', range: 4, workTime: 3,
      available: () => store.check({ questActive: 'mq.frontier' }) && !!store.state.flags['melas.found'] && !store.state.flags['melas.cable'],
      detail: () => 'Hold to splice (needs 1 Power Conduit)',
      onComplete: () => {
        if (!store.take('conduit', 1)) {
          store.notify('You need a Power Conduit to splice the cable (fabricate one aboard the Lantern).', 'warn');
          return;
        }
        store.setFlag('melas.cable', true);
        store.notify('Feeder cable spliced. The reactor can reach the station again.', 'info');
      },
    });
    this.scannables.push({ entry: 'db.cablecut', object: this.cableGap, range: 12 });
  }

  private buildRover(): void {
    const store = this.game.store;
    const p = this.ground(ROVER.x, ROVER.y);
    const kit = new KitBuilder({
      body: stdMat('#d8d2c4', { roughness: 0.7 }),
      dust: stdMat('#b98a66', { roughness: 1 }),
      dark: stdMat('#2c3036'),
      wheel: stdMat('#3a3a3a', { roughness: 0.9 }),
      solar: stdMat('#1f2e66', { metalness: 0.5, roughness: 0.3 }),
    });
    kit.box('body', 2.6, 1.2, 4.2, { x: 0, y: 1.3, z: 0 });
    kit.box('dust', 2.62, 0.2, 4.22, { x: 0, y: 1.95, z: 0 });
    kit.box('solar', 4, 0.08, 3, { x: 0, y: 2.2, z: 0 }, [0.1, 0, 0.05]);
    kit.cyl('dark', 0.08, 0.08, 1.8, { x: 0.8, y: 2.9, z: -1.6 }, undefined, 6);
    kit.box('dark', 0.5, 0.35, 0.3, { x: 0.8, y: 3.8, z: -1.6 });
    for (const [dx, dz] of [[-1.5, -1.6], [1.5, -1.6], [-1.5, 0], [1.5, 0], [-1.5, 1.6], [1.5, 1.6]]) kit.cyl('wheel', 0.5, 0.5, 0.4, { x: dx, y: 0.5, z: dz }, [0, 0, Math.PI / 2], 12);
    const g = kit.build();
    g.position.copy(p);
    g.rotation.set(0.12, 0.8, 0.22);
    this.scene.add(g);
    this.setupShadows(g);
    this.physics.addBox(p.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(1.6, 1.2, 2.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.8, 0)));
    this.scannables.push({ entry: 'db.rover', object: g, range: 30 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: '#30353b', emissive: '#3ee08f', emissiveIntensity: 0.3 }));
    box.position.copy(p).add(new THREE.Vector3(1.9, 1.2, 0.6));
    this.scene.add(box);
    this.registerInteractable({
      id: 'rover.log', object: box, kind: 'use', range: 3,
      available: () => !store.state.flags['rover.log'],
      prompt: () => 'Read the rover’s drive log',
      interact: () => {
        store.batch('roverlog', () => {
          store.setFlag('rover.log', true);
          store.give('electronics', 3);
          store.give('powercell', 1);
        });
        store.notify('DRIVE LOG, last entry: “Seismic ping, bearing 070, period 32 min 49 s. Going to look.” The rover never came back. You pull a power cell and electronics from its bus.', 'discovery');
      },
    });
  }

  private buildSpire(): void {
    const p = this.ground(SPIRE.x, SPIRE.y);
    // Blackglass: reflects nothing. Taller than it is wide, faceted, standing perfectly upright.
    const mat = new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.02, metalness: 1, emissive: '#1a0f2e', emissiveIntensity: 0.4 });
    this.scope.own(mat);
    const spire = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat);
    spire.scale.set(1.6, 7, 1.3);
    spire.position.copy(p).add(new THREE.Vector3(0, 5.5, 0));
    spire.rotation.y = 0.4;
    this.scene.add(spire);
    this.physics.addBox(p.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Vector3(1.2, 5, 1.2));
    this.spireLight = new THREE.PointLight('#6a4cff', 4, 25, 2);
    this.spireLight.position.copy(p).add(new THREE.Vector3(0, 2, 0));
    this.scene.add(this.spireLight);
    this.scannables.push({ entry: 'db.spire', object: spire, range: 30 });
  }

  /** The trail the station camera saw: bootprints from the station toward the spire. */
  private buildFootprints(): void {
    const geo = new THREE.PlaneGeometry(0.16, 0.32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#4a2c1e', roughness: 1, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.scope.own(geo);
    this.scope.own(mat);
    const start = new THREE.Vector2(STATION.x + 18, STATION.y - 6);
    const end = new THREE.Vector2(SPIRE.x - 3, SPIRE.y + 3);
    const len = start.distanceTo(end);
    const n = Math.floor(len / 0.8);
    this.footprints = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const dir = end.clone().sub(start).normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x);
    const yaw = Math.atan2(-dir.y, dir.x) - Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const wander = Math.sin(t * 17) * 6 + Math.sin(t * 5.3) * 12;
      const side = i % 2 ? 0.18 : -0.18;
      const x = start.x + dir.x * t * len + perp.x * (wander + side);
      const z = start.y + dir.y * t * len + perp.y * (wander + side);
      m.compose(new THREE.Vector3(x, this.hf.heightAt(x, z) + 0.03, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
      this.footprints.setMatrixAt(i, m);
    }
    this.footprints.instanceMatrix.needsUpdate = true;
    this.footprints.receiveShadow = true;
    this.scene.add(this.footprints);
  }

  /* --------------------------- State & update --------------------------- */

  override onStateChanged(): void {
    const s = this.game.store.state;
    const powered = !!s.flags['melas.power'];
    this.stationGlow.emissiveIntensity = powered ? 1.6 : 0.05;
    for (const l of this.stationLights) l.intensity = powered ? 500 : 0;
    this.footprints.visible = !!s.flags['footprints.revealed'];
    const cut = !s.flags['melas.cable'];
    this.cableGap.visible = cut;
    this.cablePatch.visible = !cut;
  }

  override update(dt: number): void {
    const game = this.game;
    const cam = game.cam.camera;
    const s = game.store.state;
    this.terrain.update(dt, cam.position);
    marsSunDirection(s.clock, this.sunDir);
    const target = marsStorm(s.clock, !!s.flags['melas.found']);
    this.storm += (target - this.storm) * Math.min(1, dt * 0.3);
    const { day } = this.dome.update(cam.position, this.sunDir, this.storm);
    this.sky.update(cam.position, s.clock, (1 - day) * 1.2 * (1 - this.storm));
    const sunUp = smoothstep(-0.03, 0.08, this.sunDir.y);
    this.csm.lightDirection.copy(this.sunDir).negate();
    for (const l of (this.csm as any).lights as THREE.DirectionalLight[]) l.intensity = 2.4 * sunUp * (1 - this.storm * 0.75);
    this.csm.update();
    this.fill.intensity = 0.06 + day * 0.45 * (1 - this.storm * 0.3);
    this.fill.color.copy(this.dome.horizon).multiplyScalar(1 / Math.max(0.2, 0.18 + 0.82 * day));
    // Fog and background match the horizon; storms close the view right in.
    this.fog.color.copy(this.dome.horizon);
    (this.scene.background as THREE.Color).copy(this.dome.horizon);
    this.fog.near = THREE.MathUtils.lerp(400, 12, this.storm);
    this.fog.far = THREE.MathUtils.lerp(5500, 220, this.storm);
    this.updateWeather(dt, cam.position);
    // The spire keeps the same time as the lunar scar
    const ph = (s.clock % 19.69) / 19.69;
    this.spireLight.intensity = ph < 0.08 ? 80 * (1 - ph / 0.08) : 3;
    // Sparks at the cut cable
    if (!s.flags['melas.cable'] && s.flags['melas.found']) {
      this.cableSpark -= dt;
      if (this.cableSpark <= 0) {
        this.cableSpark = 1.5 + Math.random() * 2;
        this.glowParticles.emit({ count: 6, position: this.cableGap.position.clone().add(new THREE.Vector3(0, 0.2, 0)), spread: 0.8, life: [0.2, 0.5], size: 0.05, color: '#ffcf7a', gravity: 3.71 });
      }
    }
    this.particles.update(dt);
    this.glowParticles.update(dt);
    // Discovery zones
    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) {
      this.zoneTimer = 0.5;
      const p = game.player.position;
      for (const z of ZONES) {
        if (s.universe.discovered[z.id]) continue;
        if (z.id === 'mars.spire' && !s.flags['footprints.revealed']) continue;
        if (Math.hypot(p.x - z.center.x, p.z - z.center.y) < z.radius) {
          game.store.discover(z.id);
          game.showLocationTitle(z.name, 'Discovered');
          if (z.id === 'mars.spire') game.audio.stinger('wonder');
        }
      }
      if (this.storm > 0.5 && !s.flags['hint.storm']) {
        game.store.setFlag('hint.storm', true);
        pushNotification('Dust storm. Visibility is dropping — follow your map (M) or shelter at the station or the Lantern.', 'warn');
      }
    }
  }

  override temperatureAt(): number {
    const day = this.sunDir.y > 0;
    const t = day ? -55 + clamp(this.sunDir.y * 80, 0, 50) : -90;
    return t + this.storm * 15;
  }

  timeOfDayLabel(): string {
    const elev = THREE.MathUtils.radToDeg(Math.asin(this.sunDir.y));
    const sol = ((this.game.store.state.clock % MARS_DAY) / MARS_DAY) * 100;
    return `${elev >= 0 ? 'Sun' : 'Night'} ${elev.toFixed(0)}° · sol ${sol.toFixed(0)}%${this.storm > 0.3 ? ' · DUST STORM' : ''}`;
  }

  /* ------------------------------ Survey map ------------------------------ */

  private mapUrl: string | null = null;
  private readonly mapHalf = 980;
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
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = -this.mapHalf + (i / N) * this.mapHalf * 2;
        const z = -this.mapHalf + (j / N) * this.mapHalf * 2;
        this.hf.normalAt(x, z, n);
        const shade = Math.max(0, n.dot(light));
        const h = this.hf.heightAt(x, z);
        const tone = 50 + shade * 140 + Math.max(-20, Math.min(40, h * 0.05));
        const k = (j * N + i) * 4;
        img.data[k] = tone * 1.1;
        img.data[k + 1] = tone * 0.72;
        img.data[k + 2] = tone * 0.5;
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    this.mapUrl = cv.toDataURL();
    return this.mapUrl;
  }

  override waypointPos(key: string, from: THREE.Vector3): THREE.Vector3 | null {
    const [kind, arg] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind === 'zone') {
      const z = ZONES.find((q) => q.id === arg);
      return z ? this.ground(z.center.x, z.center.y).add(new THREE.Vector3(0, 1.5, 0)) : null;
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
    if (this.ship) add(LZ.x, LZ.y, 'EXV Lantern', '#ffb347');
    add(STATION.x, STATION.y, 'Melas Station', '#3ee08f');
    for (const z of ZONES) if (s.universe.discovered[z.id] && z.id !== 'mars.lz' && z.id !== 'mars.station') add(z.center.x, z.center.y, z.name, '#9fe8ff');
    for (const d of s.world[this.id]?.dynamic ?? []) if (d.kind === 'cache') add(d.position[0], d.position[2], 'Your dropped gear', '#ff6464');
    if (this.game.settings.navAssist === 'markers' && s.flags['footprints.revealed'] && !s.universe.discovered['mars.spire']) add(SPIRE.x, SPIRE.y, '▶ Follow the footprints', '#ffb347');
    return out;
  }

  override onEnter(): void {
    const game = this.game;
    const s = game.store.state;
    game.store.discover(this.id);
    game.store.discover('mars');
    if (!s.flags['hint.mars']) {
      game.store.setFlag('hint.mars', true);
      game.audio.stinger('arrival');
      setTimeout(() => game.showLocationTitle('Mars', 'Melas Chasma · Valles Marineris'), 600);
      ui.hint.value = 'Mars: 0.38 g, air far too thin to breathe (keep the helmet sealed). The station is east of the landing zone — look for the mast.';
      setTimeout(() => (ui.hint.value = null), 10000);
      const say = (game.story as any).say as ((l: [string, string, number?][]) => void) | undefined;
      say?.([
        ['Arakawa', 'Wheels down in Melas Chasma. That’s — that’s Mars out there.'],
        ['Sola', 'Look at the walls. Every one of those layers is a chapter of an ancient lakebed.'],
        ['Haddad', 'Station beacon is two hundred metres east. Go knock on the door.'],
      ]);
    }
  }
}

function flatten(x: number, z: number, h: number, cx: number, cz: number, r: number, falloff: number, target: number): number {
  const d = Math.hypot(x - cx, z - cz);
  if (d > r + falloff) return h;
  const w = 1 - smoothstep(r, r + falloff, d);
  return h + (target - h) * w;
}
