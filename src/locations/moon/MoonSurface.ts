import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { Location, type LocationEnv, type ToolTarget } from '../Location';
import type { Game } from '../../Game';
import { HeightField, ChunkedTerrain, buildFarTerrain, craterProfile, type Crater, type Stamp } from '../../procgen/terrain';
import { Sky } from '../../render/sky';
import { buildLantern, type LanternModel } from '../../procgen/lanternShip';
import { scatterRocks, rockGeometry } from '../../procgen/rocks';
import { buildModule, buildPadMarker, type ModuleModel } from '../../procgen/baseMeshes';
import { regolithDetailTexture } from '../../procgen/textures';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { Rng } from '../../engine/Rng';
import { smoothstep, clamp } from '../../engine/math';
import { CrewRuntime, type Spot } from '../../gameplay/crew';
import { moonSunDirection, EARTH_DIR } from './moonSky';
import { dayPhase } from '../../gameplay/presence';
import type { Interactable } from '../../interaction/Interactable';
import { ui, pushNotification } from '../../ui/uiState';
import { RelayPanel } from './RelayPanel';

const SIZE = 2048;
const CELL = 2;
const SEED = 4201;
const CURVATURE_R = 260000;

export const SHIP_POS = new THREE.Vector2(100, 120);
let cachedField: HeightField | null = null;
const SHIP_ROLL = THREE.MathUtils.degToRad(7);
const BASE_CENTER = new THREE.Vector2(190, 182);
const SHADOW_CRATER: Crater = { x: -520, z: 430, r: 230, depth: 85, rim: 22, age: 0.15 };
const SCAR: Crater = { x: 58, z: 42, r: 11, depth: 3.5, rim: 1.3, age: 0 };
const HARBOR_DEBRIS = new THREE.Vector2(-260, -140);
const SUMMIT = new THREE.Vector2(-640, -560);
const K9 = new THREE.Vector2(430, -430);
const EARTH_AZ = Math.atan2(EARTH_DIR.z, EARTH_DIR.x);

export const PADS: Record<string, THREE.Vector2> = {
  'pad.a': new THREE.Vector2(-16, -12),
  'pad.b': new THREE.Vector2(0, -15),
  'pad.c': new THREE.Vector2(16, -12),
  'pad.d': new THREE.Vector2(-19, 4),
  'pad.e': new THREE.Vector2(19, 4),
  'pad.f': new THREE.Vector2(-13, 19),
  'pad.g': new THREE.Vector2(2, 21),
  'pad.h': new THREE.Vector2(17, 18),
};

type NodeType = 'anorthosite' | 'basalt' | 'ilmenite' | 'meteorite' | 'ice' | 'debris';
const NODE_INFO: Record<NodeType, { color: string; yields: [string, number][]; alt?: [string, number][]; db: string; cap: [number, number]; label: string }> = {
  anorthosite: { color: '#d9d6cf', yields: [['aluminum', 2]], alt: [['silicon', 1]], db: 'db.anorthosite', cap: [8, 14], label: 'Anorthosite outcrop' },
  basalt: { color: '#4d4b4a', yields: [['silicon', 2]], alt: [['iron', 1]], db: 'db.basalt', cap: [8, 12], label: 'Basalt boulder' },
  ilmenite: { color: '#2e3136', yields: [['titanium', 1]], alt: [['iron', 1]], db: 'db.ilmenite', cap: [8, 12], label: 'Ilmenite-rich rock' },
  meteorite: { color: '#6b5044', yields: [['iron', 3]], db: 'db.meteorite', cap: [5, 8], label: 'Meteorite fragment' },
  ice: { color: '#a9c9e8', yields: [['ice', 3]], alt: [['carbon', 1]], db: 'db.ice', cap: [10, 16], label: 'Ice-cemented regolith' },
  debris: { color: '#9aa1a8', yields: [['scrap', 2]], alt: [['electronics', 1]], db: 'db.wreckage', cap: [4, 7], label: 'Lantern debris' },
};

interface Zone {
  id: string;
  name: string;
  center: THREE.Vector2;
  radius: number;
}

const ZONES: Zone[] = [
  { id: 'moon.crashsite', name: 'Crash Site', center: SHIP_POS, radius: 90 },
  { id: 'moon.shadowcrater', name: 'Shadow Crater', center: new THREE.Vector2(SHADOW_CRATER.x, SHADOW_CRATER.z), radius: 200 },
  { id: 'moon.summit', name: 'Earthrise Summit', center: SUMMIT, radius: 60 },
  { id: 'moon.kepler9', name: 'Outpost Kepler-9', center: K9, radius: 70 },
  { id: 'moon.harbordebris', name: 'Fallen Harbor Module', center: HARBOR_DEBRIS, radius: 40 },
  { id: 'moon.scar', name: 'Impact Scar', center: new THREE.Vector2(SCAR.x, SCAR.z), radius: 18 },
];

export class MoonSurface extends Location {
  readonly id = 'moon.south';
  readonly name = 'Lunar South Polar Region';
  readonly mode = 'foot' as const;
  hf!: HeightField;
  private terrain!: ChunkedTerrain;
  private sky!: Sky;
  private csm!: CSM;
  private fill!: THREE.HemisphereLight;
  private ship!: LanternModel;
  private shipRoot = new THREE.Group();
  private crew!: CrewRuntime;
  private spots: Record<string, Spot> = {};
  private modules = new Map<string, { moduleId: string; model: ModuleModel; root: THREE.Group }>();
  private padMarkers = new Map<string, THREE.Group>();
  private nodeMeshes = new Map<string, THREE.Mesh>();
  private entityObjects = new Map<string, THREE.Object3D>();
  private floodlights: THREE.PointLight[] = [];
  private floodMat!: THREE.MeshStandardMaterial;
  private relay!: THREE.Group;
  private zoneTimer = 0;
  private sunDir = new THREE.Vector3();
  /** Actual highest point of Earthrise Summit (computed from the terrain). */
  private peak = new THREE.Vector2();

  constructor(game: Game) {
    super(game, 1.62);
    this.env = { gravity: 1.62, atmosphere: 'vacuum', temperatureC: -60, radiation: 1, ambience: 'vacuum' } satisfies LocationEnv;
    this.killY = -400;
    this.bounds = new THREE.Box3(new THREE.Vector3(-SIZE / 2 + 20, -300, -SIZE / 2 + 20), new THREE.Vector3(SIZE / 2 - 20, 1200, SIZE / 2 - 20));
  }

  /* ------------------------------------------------------------------ */
  /*                               Build                                  */
  /* ------------------------------------------------------------------ */

  async build(): Promise<void> {
    const game = this.game;
    const store = game.store;
    const scene = this.scene;
    scene.background = new THREE.Color('#000000');

    // ---- Terrain ----
    const cache = new Map<string, number>();
    const cachedBase = (key: string, x: number, z: number, hf: HeightField) => {
      let v = cache.get(key);
      if (v === undefined) cache.set(key, (v = hf.baseHeight(x, z)));
      return v;
    };
    const stamps: Stamp[] = [
      // Basin rim: the region sits inside an ancient crater; its walls hide Earth from the floor.
      {
        apply: (x, z, h) => {
          const r = Math.hypot(x, z);
          // A low saddle in the rim toward Earth: only from the summit massif does Earth clear the horizon.
          let d = Math.atan2(z, x) - EARTH_AZ;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          const notch = 1 - 0.88 * Math.exp(-(d * d) / (2 * 0.24 * 0.24)) * smoothstep(600, 800, r);
          return h + (smoothstep(760, 1150, r) * 290 + smoothstep(1150, 2600, r) * 120) * notch;
        },
      },
      // Earthrise Summit massif with a gentler eastern spur to climb.
      {
        apply: (x, z, h) => {
          const dx = x - SUMMIT.x, dz = z - SUMMIT.y;
          const d2 = dx * dx + dz * dz;
          let add = 300 * Math.exp(-d2 / (2 * 240 * 240));
          // spur: elongated ridge from the east
          const ax = 1, az = 0.35;
          const len = Math.hypot(ax, az);
          const ux = ax / len, uz = az / len;
          const t = dx * ux + dz * uz;
          const perp = -dx * uz + dz * ux;
          if (t > 0 && t < 520) add += (1 - t / 520) * 170 * Math.exp(-(perp * perp) / (2 * 60 * 60));
          return h + add;
        },
      },
      // Kepler-9 hill (houses the tunnel) + outpost pad
      {
        apply: (x, z, h, hf) => {
          const dx = x - (K9.x + 40), dz = z - (K9.y - 45);
          h += 40 * Math.exp(-(dx * dx + dz * dz) / (2 * 40 * 40));
          return flatten(x, z, h, K9.x, K9.y, 34, 18, cachedBase('k9', K9.x, K9.y, hf));
        },
      },
      // Crash trench behind the Lantern's stern, then a tilted bed matching the ship's roll.
      {
        apply: (x, z, h, hf) => {
          const along = z - (SHIP_POS.y + 60);
          const across = x - SHIP_POS.x;
          if (along > 0 && along < 480) {
            const w = 18 + along * 0.02;
            const depth = 5 * (1 - along / 480);
            const k = Math.exp(-(across * across) / (2 * w * w));
            const berm = Math.exp(-((Math.abs(across) - w * 1.6) ** 2) / (2 * 8 * 8)) * 2.2 * (1 - along / 480);
            h += -depth * k + berm;
          }
          const target = cachedBase('ship', SHIP_POS.x, SHIP_POS.y, hf) + (x - SHIP_POS.x) * Math.tan(SHIP_ROLL);
          const bed = Math.min(target, cachedBase('ship', SHIP_POS.x, SHIP_POS.y, hf) + 30 * Math.tan(SHIP_ROLL));
          return flattenEllipse(x, z, h, SHIP_POS.x + 4, SHIP_POS.y + 5, 36, 92, 30, bed);
        },
      },
      // Base plateau
      {
        // Same level as the ship's raised (starboard) side so the ramp leads straight onto it.
        apply: (x, z, h, hf) =>
          flatten(x, z, h, BASE_CENTER.x, BASE_CENTER.y, 44, 30, cachedBase('ship', SHIP_POS.x, SHIP_POS.y, hf) + 30 * Math.tan(SHIP_ROLL)),
      },
    ];
    // Terrain is deterministic: generate once per session and reuse on every visit.
    this.hf = cachedField ??= new HeightField({
      seed: SEED,
      size: SIZE,
      cell: CELL,
      baseAmp: 38,
      craterCount: 900,
      craterMaxR: 140,
      craters: [SHADOW_CRATER, SCAR, { x: HARBOR_DEBRIS.x + 6, z: HARBOR_DEBRIS.y, r: 14, depth: 3, rim: 1.2, age: 0.05 }],
      stamps,
    });
    const hf = this.hf;
    // The true summit: highest ground near the massif centre (props and the relay sit here).
    let best = -Infinity;
    for (let dx = -80; dx <= 80; dx += 4)
      for (let dz = -80; dz <= 80; dz += 4) {
        const h = hf.heightAt(SUMMIT.x + dx, SUMMIT.y + dz);
        if (h > best) {
          best = h;
          this.peak.set(SUMMIT.x + dx, SUMMIT.y + dz);
        }
      }

    const regolithTex = regolithDetailTexture();
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
      map: regolithTex,
      flatShading: false,
    });
    this.scope.own(terrainMat);
    const colorFn = (x: number, z: number, h: number, slope: number, mask: number) => {
      const n = (Math.sin(x * 0.013) * Math.cos(z * 0.011) + Math.sin(x * 0.041 + z * 0.037) * 0.5) * 0.5;
      let v = 0.48 + n * 0.05 + slope * 0.18 - mask * 0.06;
      // bright fresh ejecta around the impact scar
      const ds = Math.hypot(x - SCAR.x, z - SCAR.z) / SCAR.r;
      let tint = 0;
      if (ds < 1) v = 0.22 + ds * 0.1; // dark glassy centre
      else if (ds < 4) v += (1 - (ds - 1) / 3) * 0.12;
      // Shadow crater floor frost
      const dc = Math.hypot(x - SHADOW_CRATER.x, z - SHADOW_CRATER.z) / SHADOW_CRATER.r;
      if (dc < 0.6) tint = (0.6 - dc) * 0.35;
      // trench: disturbed darker regolith
      const along = z - (SHIP_POS.y + 60);
      if (along > -60 && along < 480 && Math.abs(x - SHIP_POS.x) < 30) v -= 0.05;
      return new THREE.Color(v - tint * 0.3, v - tint * 0.15, v + tint * 0.25);
    };
    this.terrain = new ChunkedTerrain(hf, {
      chunkSize: 128,
      lods: [64, 32, 16, 8],
      lodDistances: [220, 480, 900],
      material: terrainMat,
      colorFn,
    });
    scene.add(this.terrain.group);
    this.scope.add(() => this.terrain.dispose());
    const far = buildFarTerrain(hf, SIZE / 2, 9000, terrainMat, colorFn, CURVATURE_R);
    scene.add(far);
    this.physics.addHeightfield(hf.heights, hf.cells, hf.cells, SIZE, SIZE, new THREE.Vector3(0, 0, 0));

    // ---- Sky & light ----
    this.sky = new Sky({ earth: true, seed: 77 });
    this.sky.earthDir.copy(EARTH_DIR);
    scene.add(this.sky.group);
    this.scope.add(() => this.sky.dispose());
    const cam = game.cam.camera;
    this.csm = new CSM({
      maxFar: 900,
      cascades: game.renderer.quality.shadows ? 3 : 1,
      mode: 'practical',
      parent: scene,
      shadowMapSize: game.renderer.quality.shadowMapSize,
      lightDirection: new THREE.Vector3(-1, -0.1, 0).normalize(),
      lightIntensity: 3.2,
      camera: cam,
      lightFar: 3000,
      lightMargin: 400,
    } as any);
    (this.csm as any).fade = true;
    for (const l of (this.csm as any).lights as THREE.DirectionalLight[]) {
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.6;
      l.color.set('#fff6ea');
    }
    this.csm.setupMaterial(terrainMat);
    this.scope.add(() => {
      this.csm.remove();
      this.csm.dispose();
    });
    this.fill = new THREE.HemisphereLight('#7b8aa3', '#3b3a38', 0.12);
    scene.add(this.fill);

    // ---- The Lantern (only if she is parked here) ----
    const shipHere = store.state.ship.parking.kind === 'surface';
    if (shipHere) this.buildShip();

    // ---- Rocks ----
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8e8b86', roughness: 0.95, flatShading: true });
    this.csm.setupMaterial(rockMat);
    this.scope.own(rockMat);
    const avoid = (x: number, z: number) =>
      Math.hypot(x - BASE_CENTER.x, z - BASE_CENTER.y) < 48 ||
      (Math.abs(x - SHIP_POS.x) < 36 && z > SHIP_POS.y - 70 && z < SHIP_POS.y + 90) ||
      Math.hypot(x - K9.x, z - K9.y) < 36;
    const { meshes, big } = scatterRocks(rockMat, {
      count: 5200,
      seed: SEED + 9,
      area: SIZE * 0.96,
      minScale: 0.12,
      maxScale: 3.2,
      density: (x, z) => 0.35 + hf.maskAt(x, z) * 0.9,
      height: (x, z) => hf.heightAt(x, z),
      normal: (x, z) => hf.normalAt(x, z),
      avoid,
    });
    for (const m of meshes) scene.add(m);
    for (const b of big) this.physics.addBall(b.pos, b.r);

    // ---- Resource nodes ----
    this.buildResourceNodes(avoid);

    // ---- Landmarks ----
    this.buildScar();
    this.buildHarborDebris();
    this.buildKepler9();
    this.buildSummit();
    this.buildBase();

    // Regolith collection: the ground itself is a tool target
    const regolithTarget: ToolTarget = {
      id: 'regolith',
      object: this.terrain.group,
      action: 'mine',
      label: 'Regolith',
      range: 4,
      workTime: 0.9,
      available: () => true,
      onComplete: () => {
        this.game.store.give('regolith', 2);
      },
    };
    this.toolTargets.push(regolithTarget);
    this.scannables.push({ entry: 'db.regolith', object: this.terrain.group, range: 6 });

    // ---- Spawns ----
    const shipWorld = (v: THREE.Vector3) => v.clone().applyMatrix4(this.shipRoot.matrixWorld);
    this.shipRoot.updateMatrixWorld(true);
    const rampFoot = shipHere ? shipWorld(this.ship.anchors.ramp).add(new THREE.Vector3(5, 0, 0)) : new THREE.Vector3(BASE_CENTER.x - 30, 0, BASE_CENTER.y);
    rampFoot.y = hf.heightAt(rampFoot.x, rampFoot.z) + 0.1;
    const airlockOut = shipHere ? shipWorld(this.ship.anchors.airlock).add(new THREE.Vector3(3.5, 0, 0)) : rampFoot.clone();
    airlockOut.y = hf.heightAt(airlockOut.x, airlockOut.z) + 0.1;
    this.spawns = {
      ramp: { id: 'ramp', position: rampFoot, yaw: -Math.PI / 2 },
      airlock: { id: 'airlock', position: airlockOut, yaw: -Math.PI / 2 },
      base: { id: 'base', position: this.ground(BASE_CENTER.x, BASE_CENTER.y + 6), yaw: 0 },
      summit: { id: 'summit', position: this.ground(this.peak.x + 10, this.peak.y + 6), yaw: Math.PI / 2 },
      k9: { id: 'k9', position: this.ground(K9.x - 10, K9.y + 25), yaw: 0 },
      landing: { id: 'landing', position: this.ground(BASE_CENTER.x - 30, BASE_CENTER.y + 40), yaw: 0 },
    };

    // ---- Crew ----
    this.spots = {
      'crash.ramp': { position: rampFoot.clone().add(new THREE.Vector3(3, 0, -4)), yaw: -Math.PI / 2 },
      'base.center': { position: this.ground(BASE_CENTER.x + 2, BASE_CENTER.y + 3), yaw: Math.PI },
    };
    this.crew = new CrewRuntime(game, this, this.spots, (x, z) => hf.heightAt(x, z));
    this.scope.add(() => this.crew.dispose());

    this.onStateChanged();
    this.terrain.update(0, new THREE.Vector3(rampFoot.x, 0, rampFoot.z), true);
    void store;
  }

  private ground(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, this.hf.heightAt(x, z) + 0.05, z);
  }

  private buildShip(): void {
    const st = this.game.store.state;
    const hullFixed = !!st.ship.systems['prop.main']?.steps['hull'] || !!st.flags.launched;
    const leveled = st.ship.listDeg <= 0.01;
    this.ship = buildLantern({ damaged: !hullFixed, power: 0, landed: true, portStrutExtension: leveled ? 2.9 : 0 });
    this.shipRoot.add(this.ship.group);
    const baseY = this.hf.heightAt(SHIP_POS.x, SHIP_POS.y);
    const roll = THREE.MathUtils.degToRad(st.ship.listDeg);
    // Leveled ship stands on extended struts; crashed ship lies in its bed.
    // The bed is tilted toward port; a levelled ship stands on its starboard feet with extended port struts.
    this.shipRoot.position.set(SHIP_POS.x, roll > 0 ? baseY - 1.3 : baseY + 12 * Math.tan(SHIP_ROLL) - 0.2, SHIP_POS.y);
    this.shipRoot.rotation.set(roll > 0 ? 0.012 : 0, 0, roll);
    this.scene.add(this.shipRoot);
    this.scope.add(() => this.ship.dispose());
    this.ship.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) this.csm.setupMaterial(m);
    });
    this.shipRoot.updateMatrixWorld(true);
    const mtx = this.shipRoot.matrixWorld;
    const q = new THREE.Quaternion().setFromRotationMatrix(mtx);
    const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
      const c = new THREE.Vector3(cx, cy, cz).applyMatrix4(mtx);
      this.physics.addBox(c, new THREE.Vector3(hx, hy, hz), q);
    };
    box(0, 8.3, -39, 7.5, 5, 13);
    box(0, 8.5, -5, 11.8, 6, 20);
    box(0, 8, 37.5, 15.8, 7, 23.5);
    box(0, 8, 66, 11, 4.5, 6);
    box(-9.5, 3.6, -4, 2.6, 2.6, 17);
    box(9.5, 3.6, -4, 2.6, 2.6, 17);
    box(0, 17.2, 34, 6.5, 2.2, 6.5);
    // Walkable cargo ramp
    const a = this.ship.anchors;
    const mid = a.ramp.clone().add(a.rampTop).multiplyScalar(0.5);
    const len = a.ramp.distanceTo(a.rampTop);
    const ang = Math.atan2(a.rampTop.y - a.ramp.y, a.ramp.x - a.rampTop.x);
    const rq = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -ang)));
    this.physics.addBox(mid.clone().applyMatrix4(mtx), new THREE.Vector3(len / 2, 0.2, 3.7), rq);

    // Ship entrances
    const rampDoor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 7), new THREE.MeshStandardMaterial({ color: '#1a1d22', emissive: '#ffcf8a', emissiveIntensity: 0 }));
    rampDoor.position.copy(a.rampTop).add(new THREE.Vector3(-0.2, 2.6, 0));
    this.ship.group.add(rampDoor);
    this.entityObjects.set('rampDoor', rampDoor);
    this.registerInteractable({
      id: 'enter.cargo',
      object: rampDoor,
      kind: 'door',
      range: 4,
      prompt: () => 'Enter the Lantern — cargo hold',
      interact: () => void this.game.locations.travel({ location: 'lantern.interior', spawn: 'cargo' }, { label: 'Entering the cargo hold…' }),
    });
    const airlockDoor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 3), new THREE.MeshStandardMaterial({ color: '#2a2e35', emissive: '#7fd4ff', emissiveIntensity: 0.2 }));
    airlockDoor.position.set(12.45, 7.3, -9);
    this.ship.group.add(airlockDoor);
    // Short ladder up to the airlock threshold
    const ladder = new KitBuilder({ m: stdMat('#8b939c', { metalness: 0.7, roughness: 0.4 }) });
    for (let i = 0; i < 6; i++) ladder.box('m', 0.1, 0.1, 1.4, { x: 13.2, y: 1 + i * 0.9, z: -9 });
    ladder.box('m', 0.12, 6, 0.12, { x: 13.2, y: 3.2, z: -9.7 });
    ladder.box('m', 0.12, 6, 0.12, { x: 13.2, y: 3.2, z: -8.3 });
    ladder.box('m', 0.12, 12, 0.12, { x: 12.8, y: 10.5, z: -2.7 });
    ladder.box('m', 0.12, 12, 0.12, { x: 12.8, y: 10.5, z: -1.3 });
    for (let i = 0; i < 12; i++) ladder.box('m', 0.1, 0.1, 1.4, { x: 12.8, y: 5 + i * 0.95, z: -2 });
    this.ship.group.add(ladder.build());
    this.registerInteractable({
      id: 'enter.airlock',
      object: airlockDoor,
      kind: 'door',
      range: 4.5,
      prompt: () => 'Cycle main airlock',
      interact: () => {
        this.game.audio.play('airlock');
        void this.game.locations.travel({ location: 'lantern.interior', spawn: 'airlock' }, { label: 'Cycling airlock…' });
      },
    });

    // Dorsal hull access (ladder) and the short-range antenna
    const ladderFoot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
    ladderFoot.position.set(13.6, 6.5, -2);
    this.ship.group.add(ladderFoot);
    const topPoint = new THREE.Vector3(5, 15.2, -2);
    this.registerInteractable({
      id: 'ladder.up',
      object: ladderFoot,
      kind: 'use',
      range: 5,
      prompt: () => 'Climb to the dorsal hull',
      interact: () => {
        const p = topPoint.clone().applyMatrix4(this.shipRoot.matrixWorld);
        this.game.player.teleport(p);
        this.game.audio.play('stepMetal');
      },
    });
    const ladderTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: '#ff8a3d', emissive: '#ff8a3d', emissiveIntensity: 0.4 }));
    ladderTop.position.set(11.2, 14.8, -2);
    this.ship.group.add(ladderTop);
    this.registerInteractable({
      id: 'ladder.down',
      object: ladderTop,
      kind: 'use',
      range: 3,
      prompt: () => 'Climb down',
      interact: () => {
        const p = new THREE.Vector3(15.5, 0, -2).applyMatrix4(this.shipRoot.matrixWorld);
        p.y = this.hf.heightAt(p.x, p.z) + 0.1;
        this.game.player.teleport(p);
      },
    });
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.4, 10), new THREE.MeshStandardMaterial({ color: '#555b63', metalness: 0.7, roughness: 0.4 }));
    antenna.position.copy(a.antenna).add(new THREE.Vector3(0, -2.2, 0));
    this.ship.group.add(antenna);
    this.registerInteractable({
      id: 'antenna',
      object: antenna,
      kind: 'use',
      range: 3.5,
      available: () => !this.game.store.check({ system: 'comms.short', step: 'antenna' }),
      prompt: () => 'Repair hull antenna',
      detail: () => {
        const st = this.game.store;
        if (!st.check({ system: 'power.batteries' })) return 'Ship has no power — the antenna would stay dead';
        return st.count('conduit') >= 1 && st.count('circuit') >= 1 ? 'Uses 1 Power Conduit, 1 Circuit Board' : 'Needs 1 Power Conduit and 1 Circuit Board';
      },
      interact: () => this.game.repairStep('comms.short', 'antenna', 'comms.short'),
    });
    this.scannables.push({ entry: 'db.lantern', object: this.ship.group, range: 120 });

    // Exterior hull weld points (final flight readiness)
    a.weldPoints.forEach((wp, i) => {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 2.8), new THREE.MeshStandardMaterial({ color: '#2a2521', roughness: 1, emissive: '#ff6a2a', emissiveIntensity: 0.25 }));
      marker.position.copy(wp).add(new THREE.Vector3(Math.sign(wp.x) * 0.25, 0, 0));
      this.ship.group.add(marker);
      this.entityObjects.set(`weld.${i}`, marker);
      this.toolTargets.push({
        id: `weld.${i}`,
        object: marker,
        action: 'weld',
        label: 'Hull tear',
        range: 4.5,
        workTime: 3,
        available: () => this.game.store.check({ questActive: 'mq.lift' }) && !this.game.store.getEntity(this.id, `weld.${i}`, 'done'),
        detail: () => 'Hold to weld (needs 1 Structural Frame)',
        onComplete: () => {
          const st = this.game.store;
          if (!st.take('frame', 1)) {
            st.notify('Need a Structural Frame to patch this tear', 'warn');
            return;
          }
          st.setEntity(this.id, `weld.${i}`, 'done', true);
          st.notify(`Hull tear sealed (${this.weldCount()}/3)`, 'info');
          if (this.weldCount() >= 3) this.game.repairStep('prop.main', 'hull', 'prop.main');
        },
      });
    });
  }

  weldCount(): number {
    let n = 0;
    for (let i = 0; i < 3; i++) if (this.game.store.getEntity(this.id, `weld.${i}`, 'done')) n++;
    return n;
  }

  private buildResourceNodes(avoid: (x: number, z: number) => boolean): void {
    const hf = this.hf;
    const rng = new Rng(SEED + 31);
    const geos = [rockGeometry(901, 1, 0.4), rockGeometry(902, 1, 0.3), rockGeometry(903, 0, 0.5)];
    geos.forEach((g) => this.scope.own(g));
    const mats: Record<string, THREE.MeshStandardMaterial> = {};
    for (const [k, info] of Object.entries(NODE_INFO)) {
      const m = new THREE.MeshStandardMaterial({
        color: info.color,
        roughness: k === 'ice' ? 0.35 : k === 'meteorite' ? 0.5 : 0.85,
        metalness: k === 'meteorite' || k === 'debris' ? 0.6 : 0.05,
        flatShading: true,
        emissive: k === 'ice' ? '#0b2a44' : '#000000',
        emissiveIntensity: k === 'ice' ? 0.5 : 0,
      });
      this.csm.setupMaterial(m);
      mats[k] = m;
      this.scope.own(m);
    }
    const place = (type: NodeType, count: number, pick: () => [number, number] | null) => {
      let made = 0;
      let tries = 0;
      while (made < count && tries < count * 30) {
        tries++;
        const p = pick();
        if (!p) continue;
        const [x, z] = p;
        if (avoid(x, z) && type !== 'debris') continue;
        const id = `node.${type}.${made}`;
        this.addNode(id, type, x, z, geos[made % geos.length], mats[type], rng);
        made++;
      }
    };
    const within = (r: number) => () => [rng.range(-r, r), rng.range(-r, r)] as [number, number];
    place('anorthosite', 30, () => {
      const [x, z] = within(820)();
      return hf.maskAt(x, z) < 0.3 ? [x, z] : null;
    });
    place('basalt', 16, within(800));
    place('ilmenite', 12, () => {
      const [x, z] = within(700)();
      return x > -100 && z < 200 ? [x, z] : null;
    });
    place('meteorite', 6, () => {
      const [x, z] = within(700)();
      return hf.maskAt(x, z) > 0.4 ? [x, z] : null;
    });
    place('ice', 16, () => {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * SHADOW_CRATER.r * 0.55;
      return [SHADOW_CRATER.x + Math.cos(a) * r, SHADOW_CRATER.z + Math.sin(a) * r];
    });
    place('debris', 18, () => {
      const along = rng.range(-40, 420);
      return [SHIP_POS.x + rng.range(-45, 45), SHIP_POS.y + 60 + along];
    });
  }

  private addNode(id: string, type: NodeType, x: number, z: number, geo: THREE.BufferGeometry, mat: THREE.Material, rng: Rng): void {
    const store = this.game.store;
    const info = NODE_INFO[type];
    const cap = rng.int(info.cap[0], info.cap[1]);
    const scale = type === 'debris' ? rng.range(0.8, 1.6) : rng.range(1.1, 1.9);
    const mesh = new THREE.Mesh(geo, mat);
    const y = this.hf.heightAt(x, z);
    mesh.position.set(x, y + scale * 0.15, z);
    mesh.scale.set(scale * (type === 'debris' ? 1.6 : 1), scale * (type === 'debris' ? 0.35 : 1), scale);
    mesh.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.nodeMeshes.set(id, mesh);
    let cycles = 0;
    const left = () => {
      const v = store.getEntity(this.id, id, 'left');
      return typeof v === 'number' ? v : cap;
    };
    this.toolTargets.push({
      id,
      object: mesh,
      action: 'mine',
      label: info.label,
      range: 4.2,
      workTime: type === 'ice' ? 1.3 : 1.0,
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
          store.setFlag('stat.mined', ((store.state.flags['stat.mined'] as number) ?? 0) + 1);
        });
        const nl = l - 1;
        const s = 0.55 + 0.45 * (nl / cap);
        mesh.scale.multiplyScalar(s / Math.max(0.55, 0.55 + 0.45 * (l / cap)));
        if (nl <= 0) mesh.visible = false;
      },
    });
    this.scannables.push({ entry: info.db, object: mesh, range: 25 });
    if (left() <= 0) mesh.visible = false;
    else mesh.scale.multiplyScalar(0.55 + 0.45 * (left() / cap));
  }

  private buildScar(): void {
    const store = this.game.store;
    const p = this.ground(SCAR.x, SCAR.z);
    // The fragment: a shard that reflects nothing
    const frag = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.02, metalness: 1, emissive: '#1a0f2e', emissiveIntensity: 0.4 }),
    );
    frag.scale.set(0.6, 1.4, 0.5);
    frag.position.copy(p).add(new THREE.Vector3(0, 0.45, 0));
    frag.rotation.set(0.4, 0.3, 0.6);
    this.scene.add(frag);
    this.entityObjects.set('fragment', frag);
    const halo = new THREE.PointLight('#6a4cff', 6, 8, 2);
    halo.position.copy(frag.position).add(new THREE.Vector3(0, 0.6, 0));
    this.scene.add(halo);
    this.entityObjects.set('fragment.halo', halo);
    this.scannables.push({ entry: 'db.fragment', object: frag, range: 20 });
    const scarProbe = new THREE.Mesh(new THREE.CylinderGeometry(SCAR.r, SCAR.r, 2, 16), new THREE.MeshBasicMaterial({ visible: false }));
    scarProbe.position.copy(p);
    this.scene.add(scarProbe);
    this.entityObjects.set('scar.probe', scarProbe);
    this.registerInteractable({
      id: 'fragment',
      object: frag,
      kind: 'pickup',
      range: 3,
      available: () => !store.getEntity(this.id, 'fragment', 'taken'),
      prompt: () => 'Collect the black shard',
      detail: () => (store.state.database['db.fragment'] ? 'Unidentified material' : 'Scan it first? (hold F)'),
      interact: () => {
        store.batch('fragment', () => {
          store.setEntity(this.id, 'fragment', 'taken', true);
          store.give('fragment', 1);
          store.setFlag('fragment.found', true);
        });
        this.game.audio.stinger('wonder');
        this.game.cam.addShake(0.1);
      },
    });
  }

  private buildHarborDebris(): void {
    const store = this.game.store;
    const kit = new KitBuilder({
      shell: stdMat('#d8d9dc', { roughness: 0.6 }),
      dark: stdMat('#2c3036', { roughness: 0.7 }),
      solar: stdMat('#1f2e66', { roughness: 0.2, metalness: 0.6 }),
      scorch: stdMat('#141210', { roughness: 1 }),
      accent: stdMat('#3fa9f5'),
    });
    kit.cyl('shell', 3, 3, 12, { x: 0, y: 1.8, z: 0 }, [Math.PI / 2, 0, 0.35], 16);
    kit.cyl('dark', 3.1, 3.1, 0.6, { x: 0, y: 1.8, z: 5.9 }, [Math.PI / 2, 0, 0], 16);
    kit.cyl('scorch', 3.05, 2.4, 1.2, { x: 0, y: 1.8, z: -6.2 }, [Math.PI / 2, 0, 0], 12);
    kit.box('accent', 6.2, 0.4, 1, { x: 0, y: 4.5, z: 2 }, [0, 0, 0.35]);
    kit.box('solar', 10, 0.1, 3.5, { x: 7, y: 1.2, z: 1 }, [0.1, 0.2, -0.4]);
    kit.box('solar', 8, 0.1, 3.5, { x: -8, y: 0.4, z: -2 }, [-0.2, -0.4, 0.15]);
    kit.box('dark', 0.3, 0.3, 9, { x: 2.5, y: 1.5, z: 1 }, [0.1, 0.2, -0.4]);
    const g = kit.build();
    const p = this.ground(HARBOR_DEBRIS.x, HARBOR_DEBRIS.y);
    g.position.copy(p).add(new THREE.Vector3(0, -0.8, 0));
    g.rotation.y = 0.7;
    this.scene.add(g);
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) this.csm.setupMaterial(m);
    });
    this.physics.addBox(p.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(3, 2.4, 6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.7, 0)));
    this.scannables.push({ entry: 'db.harbormodule', object: g, range: 40 });
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.4), new THREE.MeshStandardMaterial({ color: '#3a3f46', emissive: '#ff4040', emissiveIntensity: 0.3 }));
    hatch.position.copy(p).add(new THREE.Vector3(Math.sin(0.7) * 6.3, 1.2, Math.cos(0.7) * 6.3));
    hatch.rotation.y = 0.7;
    this.scene.add(hatch);
    this.registerInteractable({
      id: 'harbor.salvage',
      object: hatch,
      kind: 'use',
      range: 3,
      available: () => !store.getEntity(this.id, 'harbor.salvage', 'done'),
      prompt: () => 'Salvage the module’s avionics bay',
      interact: () => {
        store.batch('salvage', () => {
          store.setEntity(this.id, 'harbor.salvage', 'done', true);
          store.give('electronics', 6);
          store.give('circuit', 1);
          store.give('scrubber', 2);
          store.setFlag('harbor.debris.salvaged', true);
        });
        store.notify('The module’s registry plate reads HARBOR STATION — HAB 3. It fell from orbit.', 'discovery');
      },
    });
  }

  private buildKepler9(): void {
    const store = this.game.store;
    const base = this.ground(K9.x, K9.y);
    const kit = new KitBuilder({
      shell: stdMat('#cfcac0', { roughness: 0.7 }),
      dark: stdMat('#30343a', { roughness: 0.7 }),
      metal: stdMat('#8d959e', { metalness: 0.7, roughness: 0.4 }),
      accent: stdMat('#d9a13a'),
      pad: stdMat('#55575a', { roughness: 0.95 }),
      glass: stdMat('#101418', { roughness: 0.1, metalness: 0.8 }),
    });
    // landing pad
    kit.cyl('pad', 12, 12, 0.3, { x: -18, y: 0.15, z: 14 }, undefined, 24);
    kit.box('accent', 16, 0.32, 0.8, { x: -18, y: 0.2, z: 14 });
    // derelict habitat
    kit.cyl('shell', 3.2, 3.2, 10, { x: 8, y: 3.4, z: 8 }, [0, 0, Math.PI / 2], 16);
    kit.box('dark', 2, 3, 2.4, { x: 14, y: 1.6, z: 8 });
    for (let i = -1; i <= 1; i++) kit.box('glass', 1, 0.8, 0.2, { x: 8 + i * 3, y: 4.2, z: 11.2 });
    kit.box('accent', 10.2, 0.4, 0.3, { x: 8, y: 1.2, z: 11.3 });
    // regolith berm
    kit.box('pad', 12, 1.6, 2, { x: 8, y: 0.8, z: 13.5 });
    // broken comms tower
    for (let i = 0; i < 5; i++) {
      kit.box('metal', 0.2, 3, 0.2, { x: -6, y: 1.5 + i * 3, z: -6 }, [0, 0, i > 2 ? 0.5 : 0]);
      kit.box('metal', 0.2, 3, 0.2, { x: -4, y: 1.5 + i * 3, z: -6 }, [0, 0, i > 2 ? 0.5 : 0]);
      kit.box('metal', 2.2, 0.15, 0.15, { x: -5, y: 3 * i, z: -6 });
    }
    // rover wreck
    kit.box('shell', 3, 1, 5, { x: -12, y: 1.2, z: -2 }, [0.1, 0.4, 0.25]);
    for (const [dx, dz] of [[-1.5, -1.8], [1.5, -1.8], [-1.5, 1.8], [1.4, 1.9]]) kit.cyl('dark', 0.6, 0.6, 0.4, { x: -12 + dx, y: 0.6, z: -2 + dz }, [0, 0, Math.PI / 2], 10);
    // Tunnel portal cut into the hill (north-east)
    kit.box('metal', 8, 6, 1, { x: 30, y: 3, z: -26 }, [0, -0.72, 0]);
    kit.box('dark', 5, 4.2, 1.2, { x: 30, y: 2.2, z: -26 }, [0, -0.72, 0]);
    kit.box('accent', 8.2, 0.5, 1.2, { x: 30, y: 6.2, z: -26 }, [0, -0.72, 0]);
    const g = kit.build();
    g.position.copy(base);
    this.scene.add(g);
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) this.csm.setupMaterial(m);
    });
    this.physics.addBox(base.clone().add(new THREE.Vector3(8, 3.4, 8)), new THREE.Vector3(5.5, 3.2, 3.2));
    this.physics.addBox(base.clone().add(new THREE.Vector3(-12, 1.2, -2)), new THREE.Vector3(1.8, 1, 2.8));
    this.scannables.push({ entry: 'db.kepler9', object: g, range: 60 });

    // Abandoned suit with the access card
    const suit = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: '#d7d2c6', roughness: 0.8, flatShading: true }));
    body.rotation.z = 1.2;
    body.position.set(0, 0.4, 0);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: '#d7d2c6', roughness: 0.6 }));
    helm.position.set(-0.8, 0.55, 0);
    suit.add(body, helm);
    suit.position.copy(base).add(new THREE.Vector3(14.5, 0.1, 11));
    this.scene.add(suit);
    this.registerInteractable({
      id: 'k9.suit',
      object: suit,
      kind: 'pickup',
      range: 3,
      available: () => !store.getEntity(this.id, 'k9.suit', 'taken'),
      prompt: () => 'Search the abandoned suit',
      interact: () => {
        store.batch('k9suit', () => {
          store.setEntity(this.id, 'k9.suit', 'taken', true);
          store.give('keycard', 1);
          store.give('o2canister', 1);
        });
        store.notify('Empty. The suit was left propped against the hab, helmet off, as if someone left in a hurry.', 'discovery');
      },
    });

    // Tunnel door → Kepler-9 interior
    const door = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.6), new THREE.MeshStandardMaterial({ color: '#1c1f24', emissive: '#00cec9', emissiveIntensity: 0.25 }));
    door.position.copy(base).add(new THREE.Vector3(30, 2.1, -26)).add(new THREE.Vector3(Math.sin(-0.72) * 0.8, 0, Math.cos(-0.72) * 0.8));
    door.rotation.y = -0.72;
    this.scene.add(door);
    this.registerInteractable({
      id: 'k9.door',
      object: door,
      kind: 'door',
      range: 4,
      prompt: () => (store.count('keycard') > 0 || store.state.flags['k9.opened'] ? 'Enter Kepler-9 tunnels' : 'Sealed maintenance door'),
      detail: () => (store.count('keycard') > 0 || store.state.flags['k9.opened'] ? null : 'Requires a Kepler-9 access card'),
      interact: () => {
        if (store.count('keycard') <= 0 && !store.state.flags['k9.opened']) {
          this.game.audio.play('error');
          return;
        }
        store.setFlag('k9.opened', true);
        this.game.audio.play('door');
        void this.game.locations.travel({ location: 'moon.kepler9', spawn: 'entrance' }, { label: 'Descending into Kepler-9…' });
      },
    });
    const doorOut = base.clone().add(new THREE.Vector3(30, 0, -26)).add(new THREE.Vector3(Math.sin(-0.72) * 4, 0, Math.cos(-0.72) * 4));
    doorOut.y = this.hf.heightAt(doorOut.x, doorOut.z) + 0.1;
    this.spawns['k9.door'] = { id: 'k9.door', position: doorOut, yaw: -0.72 + Math.PI };
  }

  private buildSummit(): void {
    const store = this.game.store;
    const peak = this.ground(this.peak.x, this.peak.y);
    // Survey cairn marks the summit
    const cairn = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 5), new THREE.MeshStandardMaterial({ color: '#8f8b85', flatShading: true }));
    cairn.position.copy(peak).add(new THREE.Vector3(-3, 0.8, 2));
    this.scene.add(cairn);
    // Relay (visible once deployed)
    this.relay = new THREE.Group();
    const kit = new KitBuilder({ m: stdMat('#dfe3e8', { metalness: 0.3 }), d: stdMat('#2d3238'), a: stdMat('#ff9f43', { emissive: '#ff9f43', emissiveIntensity: 0.6 }) });
    kit.cyl('m', 0.12, 0.15, 3.2, { x: 0, y: 1.6, z: 0 }, undefined, 8);
    kit.add('m', new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), { x: 0, y: 3.4, z: 0 }, [-Math.PI / 2 - 0.3, 0, 0]);
    kit.box('d', 0.8, 0.6, 0.6, { x: 0, y: 0.4, z: 0 });
    kit.box('a', 0.2, 0.12, 0.62, { x: 0.3, y: 0.55, z: 0 });
    for (const a of [0, 2.1, 4.2]) kit.box('m', 0.06, 0.06, 1.6, { x: Math.cos(a) * 0.6, y: 0.3, z: Math.sin(a) * 0.6 }, [0.9, a, 0]);
    this.relay.add(kit.build());
    const dish = this.relay.children[0];
    this.relay.position.copy(peak).add(new THREE.Vector3(2, 0, -1));
    this.relay.rotation.y = Math.atan2(EARTH_DIR.x, EARTH_DIR.z) + Math.PI;
    this.scene.add(this.relay);
    void dish;
    const site = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 12), new THREE.MeshStandardMaterial({ color: '#4fd1ff', emissive: '#4fd1ff', emissiveIntensity: 0.5, transparent: true, opacity: 0.5 }));
    site.position.copy(peak).add(new THREE.Vector3(2, 0.1, -1));
    this.scene.add(site);
    this.entityObjects.set('relay.site', site);
    this.registerInteractable({
      id: 'relay.deploy',
      object: site,
      kind: 'build',
      range: 3.5,
      available: () => !store.check({ system: 'comms.long', step: 'relay' }),
      prompt: () => 'Deploy comms relay',
      detail: () => (store.count('relaykit') > 0 ? 'Line of sight to Earth confirmed' : 'Requires a Comms Relay Kit (fabricate aboard the Lantern)'),
      interact: () => {
        if (store.count('relaykit') <= 0) {
          this.game.audio.play('error');
          store.notify('You need a Comms Relay Kit', 'warn');
          return;
        }
        this.game.repairStep('comms.long', 'relay', null);
        this.game.audio.play('build');
      },
    });
    this.registerInteractable({
      id: 'relay.align',
      object: this.relay,
      kind: 'panel',
      range: 3.5,
      available: () => store.check({ system: 'comms.long', step: 'relay' }) && !store.check({ system: 'comms.long', step: 'align' }),
      prompt: () => 'Align the relay dish (first-person panel)',
      interact: () => this.game.openPanel(new RelayPanel(this.game, this.relay)),
    });
    this.scannables.push({ entry: 'db.summit', object: cairn, range: 30 });
  }

  private buildBase(): void {
    const store = this.game.store;
    // Floodlight masts around the base
    this.floodMat = new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: '#fff1d0', emissiveIntensity: 0 });
    this.scope.own(this.floodMat);
    const mastMat = stdMat('#6f7780', { metalness: 0.6 });
    this.scope.own(mastMat);
    for (const [dx, dz] of [[-28, -24], [28, -22], [-28, 26], [28, 28]]) {
      const p = this.ground(BASE_CENTER.x + dx, BASE_CENTER.y + dz);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 7, 6), mastMat);
      mast.position.copy(p).add(new THREE.Vector3(0, 3.5, 0));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), this.floodMat);
      lamp.position.copy(p).add(new THREE.Vector3(0, 7.1, 0));
      lamp.lookAt(this.ground(BASE_CENTER.x, BASE_CENTER.y));
      const light = new THREE.PointLight('#ffe6c0', 0, 55, 1.6);
      light.position.copy(lamp.position);
      this.scene.add(mast, lamp, light);
      this.floodlights.push(light);
    }
    for (const [padId, off] of Object.entries(PADS)) {
      const p = this.ground(BASE_CENTER.x + off.x, BASE_CENTER.y + off.y);
      const marker = buildPadMarker();
      marker.position.copy(p);
      this.scene.add(marker);
      this.padMarkers.set(padId, marker);
      this.registerInteractable({
        id: `pad:${padId}`,
        object: marker,
        kind: 'build',
        range: 5.5,
        available: () => !store.state.base.pads[padId]?.built && store.check({ flag: 'base.unlocked' }),
        prompt: () => 'Construction pad — build module',
        interact: () => this.game.openOverlay('build', padId),
      });
    }
    this.scannables.push({ entry: 'db.basecamp', object: this.padMarkers.get('pad.b')!, range: 30 });
  }

  /** Create/update module models to match state. */
  private syncBase(): void {
    const store = this.game.store;
    const powered = store.state.flags['base.powered'] === true;
    for (const [padId, pad] of Object.entries(store.state.base.pads)) {
      const off = PADS[padId];
      if (!off) continue;
      const cur = this.modules.get(padId);
      const want = pad.built && pad.moduleId ? pad.moduleId : null;
      if (cur && cur.moduleId !== want) {
        this.removeModuleInteractables(padId);
        cur.model.dispose();
        cur.root.removeFromParent();
        this.modules.delete(padId);
      }
      if (want && !this.modules.has(padId)) {
        const model = buildModule(want);
        const root = new THREE.Group();
        root.add(model.group);
        const p = this.ground(BASE_CENTER.x + off.x, BASE_CENTER.y + off.y);
        root.position.copy(p);
        // face the base centre
        root.rotation.y = Math.atan2(-off.x, -off.y);
        model.group.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) this.csm.setupMaterial(m);
        });
        this.scene.add(root);
        this.modules.set(padId, { moduleId: want, model, root });
        this.physics.addBox(p.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(2.6, 1.5, 2.6));
        this.addModuleInteractables(padId, want, root);
        this.spots[`base.${want}`] = {
          position: p.clone().add(new THREE.Vector3(-off.x, 0, -off.y).normalize().multiplyScalar(4.2)),
          yaw: Math.atan2(off.x, off.y),
        };
      }
      this.padMarkers.get(padId)!.visible = !want;
    }
    for (const m of this.modules.values()) m.model.setPowered(powered);
    this.floodMat.emissiveIntensity = powered ? 3 : 0;
    for (const l of this.floodlights) l.intensity = powered ? 900 : 0;
  }

  private moduleInteractables = new Map<string, Interactable[]>();
  private removeModuleInteractables(padId: string): void {
    for (const it of this.moduleInteractables.get(padId) ?? []) this.removeInteractable(it);
    this.moduleInteractables.delete(padId);
  }

  private addModuleInteractables(padId: string, moduleId: string, root: THREE.Object3D): void {
    const game = this.game;
    const store = game.store;
    const list: Interactable[] = [];
    const add = (it: Interactable) => {
      list.push(it);
      this.registerInteractable(it);
    };
    const def = store.content.baseModules[moduleId];
    const powered = () => store.state.flags['base.powered'] === true;
    switch (moduleId) {
      case 'shelter':
        add({
          id: `${padId}:rest`, object: root, kind: 'use', range: 6,
          prompt: () => 'Habitat — refill suit & set recovery point',
          detail: () => (powered() ? 'Powered' : 'No power: suit refill limited to oxygen'),
          interact: () => {
            const s = store.state.player;
            s.oxygen = s.oxygenMax;
            if (powered()) s.suitPower = s.suitPowerMax;
            s.health = Math.max(s.health, powered() ? 100 : s.health);
            s.respawn = { locationId: this.id, spawnId: 'base' };
            store.markChanged('rest');
            store.notify('Suit refilled. Recovery point set to base camp.', 'info');
            game.audio.play('airlock', 0.5);
            void game.autosave('Base camp');
          },
        });
        add({ id: `${padId}:storage`, object: root.children[0], kind: 'use', range: 6, prompt: () => 'Open base storage', interact: () => game.openOverlay('container', 'base.storage') });
        break;
      case 'storage':
        add({ id: `${padId}:storage`, object: root, kind: 'use', range: 6, prompt: () => 'Open base storage', interact: () => game.openOverlay('container', 'base.storage') });
        break;
      case 'workbench':
        add({
          id: `${padId}:craft`, object: root, kind: 'use', range: 6,
          prompt: () => 'Use workbench',
          detail: () => (powered() ? null : 'Needs base power'),
          interact: () => {
            if (!powered()) {
              game.audio.play('error');
              store.notify('The workbench needs base power', 'warn');
              return;
            }
            game.openOverlay('craft', 'workbench');
          },
        });
        break;
      case 'lab':
        add({
          id: `${padId}:lab`, object: root, kind: 'use', range: 6,
          prompt: () => 'Use field lab',
          detail: () => (powered() ? null : 'Needs base power'),
          interact: () => (powered() ? game.openOverlay('craft', 'lab') : store.notify('The lab needs base power', 'warn')),
        });
        break;
      case 'iceproc':
        add({
          id: `${padId}:ice`, object: root, kind: 'use', range: 6,
          prompt: () => `Ice processor — load ice (${store.count('ice')} carried)`,
          detail: () => `Hopper: ${(store.state.flags['iceproc.hopper'] as number) ?? 0} · Propellant ${Math.round(store.state.ship.propellant)} kg${powered() ? '' : ' · UNPOWERED'}`,
          interact: () => {
            const n = game.base.loadIce();
            if (n > 0) {
              store.notify(`Loaded ${n} ice into the processor`, 'info');
              game.audio.play('mine');
            } else store.notify('You are not carrying any ice', 'warn');
          },
        });
        break;
      case 'solar':
      case 'battery':
      case 'greenhouse':
        add({
          id: `${padId}:info`, object: root, kind: 'use', range: 6,
          prompt: () => def?.name ?? moduleId,
          detail: () => {
            const r = game.base.report;
            return `Gen ${r.generationKW.toFixed(1)} kW · Load ${r.demandKW.toFixed(1)} kW · Battery ${r.batteryKWh.toFixed(0)}/${r.capacityKWh} kWh`;
          },
          interact: () => {
            if (moduleId === 'greenhouse') {
              if (!store.state.flags['greenhouse.visited']) {
                store.setFlag('greenhouse.visited', true);
                store.notify('Green leaves under LED light, a quarter-million miles from home.', 'discovery');
              }
              store.grant('greenhouse.first', [{ give: 'medpatch', qty: 2 }]);
            }
            game.openOverlay('shipstatus', 'base');
          },
        });
        break;
    }
    this.moduleInteractables.set(padId, list);
  }

  /* ------------------------------------------------------------------ */
  /*                           State & update                             */
  /* ------------------------------------------------------------------ */

  override onStateChanged(): void {
    const store = this.game.store;
    const s = store.state;
    const power = s.ship.systems['power.reactor']?.online ? 1 : s.ship.systems['power.batteries']?.online ? 0.35 : 0;
    this.ship?.setPower(power);
    const rampDoor = this.entityObjects.get('rampDoor') as THREE.Mesh | undefined;
    if (rampDoor) (rampDoor.material as THREE.MeshStandardMaterial).emissiveIntensity = power * 1.5;
    const taken = !!store.getEntity(this.id, 'fragment', 'taken');
    const frag = this.entityObjects.get('fragment');
    if (frag) frag.visible = !taken;
    const halo = this.entityObjects.get('fragment.halo') as THREE.PointLight | undefined;
    if (halo) halo.visible = !taken || !!s.flags['scar.pulse'];
    for (let i = 0; i < 3; i++) {
      const w = this.entityObjects.get(`weld.${i}`) as THREE.Mesh | undefined;
      if (w) {
        const done = !!store.getEntity(this.id, `weld.${i}`, 'done');
        const mat = w.material as THREE.MeshStandardMaterial;
        mat.color.set(done ? '#b9bec4' : '#2a2521');
        mat.emissiveIntensity = done ? 0 : store.check({ questActive: 'mq.lift' }) ? 0.8 : 0.1;
      }
    }
    if (this.relay) this.relay.visible = store.check({ system: 'comms.long', step: 'relay' });
    const site = this.entityObjects.get('relay.site');
    if (site) site.visible = !this.relay.visible && store.check({ questActive: 'mq.earthrise' });
    this.syncBase();
    this.crew?.refresh();
  }

  override update(dt: number): void {
    const game = this.game;
    const cam = game.cam.camera;
    const s = game.store.state;
    this.terrain.update(dt, cam.position);
    // Sun and sky
    moonSunDirection(s.clock, this.sunDir);
    const elevFactor = smoothstep(-0.03, 0.05, this.sunDir.y);
    this.sky.sunDir.copy(this.sunDir);
    this.sky.update(cam.position, s.clock, 1.2 - elevFactor * 0.55);
    this.sky.sunDisc.visible = this.sunDir.y > -0.05;
    this.csm.lightDirection.copy(this.sunDir).negate();
    for (const l of (this.csm as any).lights as THREE.DirectionalLight[]) l.intensity = 3.4 * elevFactor;
    this.csm.update();
    this.fill.intensity = 0.05 + elevFactor * 0.1;
    // After the Harbor revelation the scar pulses with the Cadence (compressed: visible every ~20 s).
    if (s.flags['scar.pulse']) {
      const halo = this.entityObjects.get('fragment.halo') as THREE.PointLight | undefined;
      if (halo) {
        const ph = (s.clock % 19.69) / 19.69;
        halo.intensity = ph < 0.08 ? 60 * (1 - ph / 0.08) : 2;
      }
      const probe = this.entityObjects.get('scar.probe');
      if (probe && !this.scannables.some((x) => x.entry === 'db.scarpulse')) this.scannables.push({ entry: 'db.scarpulse', object: probe, range: 40 });
    }
    // Base power simulation is global (Game.base), we only react visually here.
    this.crew.update(dt);
    // Discovery zones
    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) {
      this.zoneTimer = 0.5;
      const p = game.player.position;
      for (const z of ZONES) {
        if (s.universe.discovered[z.id]) continue;
        if (Math.hypot(p.x - z.center.x, p.z - z.center.y) < z.radius) {
          game.store.discover(z.id);
          game.showLocationTitle(z.name, 'Discovered');
        }
      }
      // Earth becomes visible from the summit: a designed moment.
      if (!s.flags['earth.seen.moon'] && Math.hypot(p.x - this.peak.x, p.z - this.peak.y) < 120 && this.earthVisibleFrom(game.player.head())) {
        game.store.setFlag('earth.seen.moon', true);
        game.audio.stinger('wonder');
        // Helmet visor zoom: Earth is only ~2° across from here, so let the player really see it.
        const head = game.player.head();
        game.player.frozen = true;
        game.cam.setOverride({ position: head, target: head.clone().addScaledVector(EARTH_DIR, 1000), fov: 9 }, 1.2);
        setTimeout(() => {
          game.cam.setOverride(null);
          game.player.frozen = false;
        }, 7000);
        game.showLocationTitle('Earthrise', 'Home, on the horizon');
        pushNotification('Earth — 384,400 km away', 'discovery');
        game.store.batch('earthdb', () => {
          if (!s.database['db.earth']) {
            s.database['db.earth'] = { at: s.clock };
            game.store.markChanged('db');
          }
        });
      }
    }
  }

  /* ------------------------------ Survey map ------------------------------ */

  private mapUrl: string | null = null;
  private readonly mapHalf = 950;

  mapTransform = (x: number, z: number): [number, number] => [(x + this.mapHalf) / (this.mapHalf * 2), (z + this.mapHalf) / (this.mapHalf * 2)];

  /** Hillshaded relief map generated from the real heightfield (cached). */
  renderMap(): string {
    if (this.mapUrl) return this.mapUrl;
    const N = 384;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d')!;
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
        const tone = 40 + shade * 150 + Math.max(-30, Math.min(30, h * 0.12));
        const k = (j * N + i) * 4;
        img.data[k] = tone * 0.92;
        img.data[k + 1] = tone * 0.97;
        img.data[k + 2] = tone * 1.05;
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    // survey grid
    ctx.strokeStyle = 'rgba(143,227,255,0.12)';
    for (let g = 0; g <= N; g += N / 8) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, N);
      ctx.moveTo(0, g);
      ctx.lineTo(N, g);
      ctx.stroke();
    }
    this.mapUrl = c.toDataURL();
    return this.mapUrl;
  }

  mapMarkers(): { x: number; y: number; label: string; color: string }[] {
    const s = this.game.store.state;
    const out: { x: number; y: number; label: string; color: string }[] = [];
    const add = (x: number, z: number, label: string, color: string) => {
      const [u, v] = this.mapTransform(x, z);
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) out.push({ x: u, y: v, label, color });
    };
    if (s.ship.parking.kind === 'surface') add(SHIP_POS.x, SHIP_POS.y, 'EXV Lantern', '#ffb347');
    if (Object.values(s.base.pads).some((p) => p.built)) add(BASE_CENTER.x, BASE_CENTER.y, 'Base camp', '#3ee08f');
    for (const z of ZONES) if (s.universe.discovered[z.id] && z.id !== 'moon.crashsite') add(z.center.x, z.center.y, z.name, '#9fe8ff');
    for (const d of s.world[this.id]?.dynamic ?? []) if (d.kind === 'cache') add(d.position[0], d.position[2], 'Your dropped gear', '#ff6464');
    // Navigation assist: objective markers for undiscovered destinations
    if (this.game.settings.navAssist === 'markers') {
      const q = (id: string) => this.game.store.check({ questActive: id });
      if (q('mq.ice') && !s.universe.discovered['moon.shadowcrater']) add(SHADOW_CRATER.x, SHADOW_CRATER.z, '▶ Shadow Crater', '#ffb347');
      if (q('mq.earthrise') && !s.universe.discovered['moon.summit']) add(SUMMIT.x, SUMMIT.y, '▶ Earthrise Summit', '#ffb347');
      if (q('mq.kepler') && !s.universe.discovered['moon.kepler9']) add(K9.x, K9.y, '▶ Kepler-9', '#ffb347');
    }
    return out;
  }

  /** Honest line-of-sight test: is the top of Earth's disc above the terrain horizon from here? */
  earthVisibleFrom(eye: THREE.Vector3): boolean {
    const ex = EARTH_DIR.x, ez = EARTH_DIR.z;
    const n = Math.hypot(ex, ez);
    const earthTop = Math.asin(EARTH_DIR.y) + THREE.MathUtils.degToRad(0.9);
    for (let d = 15; d < 6000; d += d < 400 ? 8 : 40) {
      const px = eye.x + (ex / n) * d, pz = eye.z + (ez / n) * d;
      const r = Math.hypot(px, pz);
      const h = Math.abs(px) < 1020 && Math.abs(pz) < 1020 ? this.hf.heightAt(px, pz) : this.hf.evaluate(px, pz).h - (r * r) / (2 * CURVATURE_R);
      if (Math.atan2(h - eye.y, d) > earthTop) return false;
    }
    return true;
  }

  override temperatureAt(pos: THREE.Vector3): number {
    const dc = Math.hypot(pos.x - SHADOW_CRATER.x, pos.z - SHADOW_CRATER.z);
    if (dc < SHADOW_CRATER.r * 0.85 && pos.y < this.hf.heightAt(SHADOW_CRATER.x + SHADOW_CRATER.r, SHADOW_CRATER.z) - 20) return -228;
    const day = this.sunDir.y > 0;
    return day ? -20 + clamp(this.sunDir.y * 400, 0, 60) : -150;
  }

  timeOfDayLabel(): string {
    const phase = dayPhase(this.game.store.state.clock);
    const elev = THREE.MathUtils.radToDeg(Math.asin(this.sunDir.y));
    return `${elev >= 0 ? 'Sun' : 'Night'} ${elev.toFixed(1)}° · cycle ${(phase * 100).toFixed(0)}%`;
  }

  override onEnter(): void {
    const store = this.game.store;
    // Returning after Harbor: the first world has changed.
    if (store.state.flags['slice.complete'] && !store.state.flags['scar.pulse']) {
      store.setFlag('scar.pulse', true);
      const say = (this.game.story as any).say as ((l: [string, string, number?][]) => void) | undefined;
      say?.([
        ['Sola', 'Before you go anywhere — the impact scar. My instruments show it pulsing. Every 1,969 seconds.'],
        ['Haddad', 'The fragment’s in our lab. So what’s keeping time out there?'],
      ]);
      pushNotification('New anomaly: the impact scar near the Lantern (scanner tier 2)', 'discovery');
    }
    const ui0 = ui.hint;
    if (!this.game.store.state.flags['hint.moon']) {
      this.game.store.setFlag('hint.moon', true);
      ui0.value = 'Low gravity: jumps carry you far. Hold F to scan, hold Left Mouse to use the multi-tool, L for headlamp.';
      setTimeout(() => (ui0.value = null), 9000);
    }
  }
}

function flatten(x: number, z: number, h: number, cx: number, cz: number, r: number, falloff: number, target: number): number {
  const d = Math.hypot(x - cx, z - cz);
  if (d > r + falloff) return h;
  const w = 1 - smoothstep(r, r + falloff, d);
  return h + (target - h) * w;
}

function flattenEllipse(x: number, z: number, h: number, cx: number, cz: number, rx: number, rz: number, falloff: number, target: number): number {
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  const d = Math.sqrt(dx * dx + dz * dz);
  const edge = falloff / Math.min(rx, rz);
  if (d > 1 + edge) return h;
  const w = 1 - smoothstep(1, 1 + edge, d);
  return h + (target - h) * w;
}

void craterProfile;
