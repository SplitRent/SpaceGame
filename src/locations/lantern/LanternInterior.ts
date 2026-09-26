import * as THREE from 'three';
import { Location, type LocationEnv } from '../Location';
import type { Game } from '../../Game';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { floorTexture, wallTexture, hullPanelTexture } from '../../procgen/textures';
import { InteriorBuilder, type RoomDef } from './interiorKit';
import { CrewRuntime, type NavGraph, type Spot } from '../../gameplay/crew';
import { Sky } from '../../render/sky';
import { createPlanet, type PlanetHandle } from '../../render/planets';
import { ScreenDisplay, ScreenUI } from '../../render/screen';
import { buildLanternConsoles, type LanternConsoles } from './lanternConsoles';
import { Rng } from '../../engine/Rng';
import { damp } from '../../engine/math';
import { ui } from '../../ui/uiState';

/** Ship-local layout constants (metres). Deck 2 floor is y=0, deck 3 is y=-4. Bow is -Z. */
const D3 = -4;

interface Door {
  id: string;
  left: THREE.Object3D;
  right: THREE.Object3D;
  center: THREE.Vector3; // ship-local
  alongZ: boolean;
  width: number;
  open: number;
  locked: () => boolean;
  collider: ReturnType<Location['physics']['addBox']> | null;
}

export type ShipCondition = 'intact' | 'dead' | 'emergency' | 'powered';

/**
 * EXV Lantern interior: three decks built from a modular kit. Every visual state —
 * darkness, sparks, breaches, emergency lighting, screens, reactor glow, the 7° list — is
 * derived from GameState, so repairing a system visibly changes the ship and persists.
 */
export class LanternInterior extends Location {
  readonly id = 'lantern.interior';
  readonly name = 'EXV Lantern';
  readonly mode = 'foot' as const;
  /** Tilted ship frame (list after the crash). */
  readonly frame = new THREE.Group();
  private outside = new THREE.Group();
  private sky: Sky | null = null;
  private planets: PlanetHandle[] = [];
  private doors: Door[] = [];
  private crew!: CrewRuntime;
  private consoles!: LanternConsoles;
  private condition: ShipCondition = 'dead';
  private lightPanels!: THREE.MeshStandardMaterial;
  private emergencyMat!: THREE.MeshStandardMaterial;

  private reactorGlow!: THREE.MeshStandardMaterial;
  private reactorRings: THREE.Object3D[] = [];
  private pointLights: THREE.PointLight[] = [];
  private emergencyLights: THREE.PointLight[] = [];
  private hemi!: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight | null = null;
  private sparkPoints: THREE.Vector3[] = [];
  private sparkTimer = 0;
  private breachObjs = new Map<string, { hole: THREE.Object3D; patch: THREE.Object3D; beam: THREE.Object3D | null }>();
  private statusBoards: ScreenDisplay[] = [];
  private creakTimer = 8;
  private damaged = true;
  private listDeg = 0;
  private t = 0;
  private dustMotes: THREE.Points | null = null;

  constructor(game: Game) {
    const s = game.store.state;
    const onSurface = s.ship.parking.kind === 'surface' && !!s.flags.crashed;
    super(game, onSurface ? 1.62 : 9.81);
    this.env = {
      gravity: onSurface ? 1.62 : 9.81,
      atmosphere: 'breathable',
      temperatureC: 20,
      radiation: 0,
      ambience: 'ship',
    } satisfies LocationEnv;
    this.killY = -40;
    this.bounds = new THREE.Box3(new THREE.Vector3(-30, -20, -60), new THREE.Vector3(30, 30, 70));
  }

  get pressurized(): boolean {
    const s = this.game.store.state;
    return !s.flags.crashed || !!s.ship.systems['life.support']?.online;
  }

  override isPressurized(): boolean {
    return this.pressurized;
  }

  override temperatureAt(): number {
    return this.pressurized ? 21 : this.game.store.state.ship.systems['power.batteries']?.online ? -35 : -60;
  }

  shipToWorld(v: THREE.Vector3): THREE.Vector3 {
    this.frame.updateMatrixWorld(true);
    return v.clone().applyMatrix4(this.frame.matrixWorld);
  }

  /* ================================================================== */

  async build(): Promise<void> {
    const game = this.game;
    const s = game.store.state;
    this.damaged = !!s.flags.crashed;
    this.listDeg = this.damaged ? s.ship.listDeg : 0;
    this.frame.rotation.z = THREE.MathUtils.degToRad(this.listDeg);
    this.scene.add(this.frame, this.outside);
    this.scene.background = new THREE.Color('#000');
    this.env.ambience = this.damaged && !s.ship.systems['power.batteries']?.online ? 'ship-dead' : 'ship';

    const mats = {
      floor: stdMat('#8b929a', { map: floorTexture(), roughness: 0.6, metalness: 0.5, flatShading: false }),
      wall: stdMat('#e2e4e7', { map: wallTexture(), roughness: 0.6, metalness: 0.1, flatShading: false }),
      ceiling: stdMat('#3b4149', { roughness: 0.8 }),
      trim: stdMat('#5b636d', { roughness: 0.4, metalness: 0.6 }),
      stripe: stdMat('#ff8a3d', { roughness: 0.5, emissive: '#ff8a3d', emissiveIntensity: 0.15 }),
      dark: stdMat('#2a2f36', { roughness: 0.6, metalness: 0.3 }),
      metal: stdMat('#a4adb7', { roughness: 0.35, metalness: 0.8 }),
      hull: stdMat('#d7dade', { map: hullPanelTexture(), roughness: 0.55 }),
      fabric: stdMat('#3e5566', { roughness: 0.95 }),
      bed: stdMat('#dfe6ea', { roughness: 0.9 }),
      pipe: stdMat('#8c7a5e', { roughness: 0.5, metalness: 0.6 }),
      yellow: stdMat('#e8b93a', { roughness: 0.6 }),
      scorch: stdMat('#141210', { roughness: 1 }),
      crate: stdMat('#7a8561', { roughness: 0.8 }),
      glass: new THREE.MeshStandardMaterial({ color: '#9fb8c8', roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }),
      light: new THREE.MeshStandardMaterial({ color: '#f4f6ff', emissive: '#eaf2ff', emissiveIntensity: 2 }),
      emergency: new THREE.MeshStandardMaterial({ color: '#330000', emissive: '#ff2020', emissiveIntensity: 1 }),
      reactor: new THREE.MeshStandardMaterial({ color: '#12303a', emissive: '#4fd8ff', emissiveIntensity: 0, roughness: 0.2 }),
    };
    this.lightPanels = mats.light;
    this.emergencyMat = mats.emergency;

    this.reactorGlow = mats.reactor;
    for (const m of Object.values(mats)) this.scope.own(m);
    const kit = new KitBuilder(mats);
    const b = new InteriorBuilder(kit, this.physics, this.frame);

    /* ------------------------------ Rooms ------------------------------ */
    const rooms: RoomDef[] = [
      {
        id: 'bridge', x0: -8, x1: 8, z0: -36, z1: -24, y: 0, h: 4.2,
        openings: [
          { side: 's', at: 0, width: 2 },
          { side: 'n', at: 0, width: 12, bottom: 1.0, top: 3.7, window: true },
          { side: 'w', at: -31, width: 5, bottom: 1.2, top: 3.2, window: true },
          { side: 'e', at: -31, width: 5, bottom: 1.2, top: 3.2, window: true },
        ],
      },
      {
        id: 'corridor', x0: -1.6, x1: 1.6, z0: -24, z1: 16, y: 0, h: 3,
        openings: [
          { side: 'n', at: 0, width: 2 },
          { side: 's', at: 0, width: 3.1, top: 3 },
          ...[-19, -9, 0.5, 9.5].map((at) => ({ side: 'w' as const, at, width: 1.8 })),
          ...[-21, -12, -1, 9].map((at) => ({ side: 'e' as const, at, width: 1.8 })),
        ],
      },
      { id: 'quarters', x0: -8, x1: -1.6, z0: -24, z1: -14, y: 0, h: 3, openings: [{ side: 'e', at: -19, width: 1.8 }] },
      {
        id: 'common', x0: -8, x1: -1.6, z0: -14, z1: -4, y: 0, h: 3,
        openings: [{ side: 'e', at: -9, width: 1.8 }, { side: 'w', at: -9, width: 7, bottom: 0.7, top: 2.6, window: true }],
      },
      { id: 'medbay', x0: -8, x1: -1.6, z0: -4, z1: 5, y: 0, h: 3, openings: [{ side: 'e', at: 0.5, width: 1.8 }] },
      { id: 'lab', x0: -8, x1: -1.6, z0: 5, z1: 14, y: 0, h: 3, openings: [{ side: 'e', at: 9.5, width: 1.8 }] },
      { id: 'office', x0: 1.6, x1: 8, z0: -24, z1: -18, y: 0, h: 3, openings: [{ side: 'w', at: -21, width: 1.8 }] },
      { id: 'suitroom', x0: 1.6, x1: 8, z0: -18, z1: -6, y: 0, h: 3, openings: [{ side: 'w', at: -12, width: 1.8 }, { side: 'e', at: -9, width: 1.5 }] },
      { id: 'airlock', x0: 8, x1: 11.5, z0: -11, z1: -7, y: 0, h: 2.8, openings: [{ side: 'w', at: -9, width: 1.5 }, { side: 'e', at: -9, width: 1.5 }] },
      { id: 'workshop', x0: 1.6, x1: 8, z0: -6, z1: 4, y: 0, h: 3, openings: [{ side: 'w', at: -1, width: 1.8 }] },
      { id: 'storage', x0: 1.6, x1: 8, z0: 4, z1: 14, y: 0, h: 3, openings: [{ side: 'w', at: 9, width: 1.8 }] },
      {
        id: 'stairs', x0: -1.6, x1: 1.6, z0: 16, z1: 26, y: D3, h: 7, noFloor: true, noCeiling: true,
        openings: [{ side: 'n', at: 0, width: 3.1, bottom: 4, top: 6.9 }, { side: 's', at: 0, width: 3.1, top: 3.4 }],
      },
      {
        id: 'engineering', x0: -12, x1: 6, z0: 26, z1: 50, y: D3, h: 9,
        openings: [
          { side: 'n', at: 0, width: 3.1, top: 3.4 },
          { side: 'e', at: 36, width: 3, top: 3.5 },
          { side: 's', at: -2, width: 1.6, top: 2.2 },
        ],
      },
      {
        id: 'cargo', x0: 6, x1: 15.5, z0: 26, z1: 50, y: D3, h: 7,
        openings: [{ side: 'w', at: 36, width: 3, top: 3.5 }, { side: 'e', at: 33, width: 7, top: 5 }],
      },
      { id: 'crawlway', x0: -3, x1: -1, z0: 50, z1: 58, y: D3, h: 2.4, openings: [{ side: 'n', at: -2, width: 1.6, top: 2.2 }] },
    ];
    for (const r of rooms) b.room(r);
    // Stair ceiling above the upper landing and steps
    b.solid('ceiling', 3.2, 0.2, 10, 0, 3.1, 21);
    const stairLen = Math.hypot(10, 4);
    const stairAng = Math.atan2(4, 10);
    b.collider(3.1, 0.2, stairLen, 0, D3 / 2 - 0.1, 21, [-stairAng, 0, 0]);
    for (let i = 0; i < 20; i++) {
      const z = 16.25 + i * 0.5;
      const y = -(i + 1) * 0.2;
      kit.box('trim', 3, 0.2, 0.5, { x: 0, y: y + 0.1, z });
    }
    for (const x of [-1.5, 1.5]) kit.box('metal', 0.06, 0.06, stairLen, { x, y: D3 / 2 + 1, z: 21 }, [-stairAng, 0, 0]);

    /* ---------------------------- Furniture ---------------------------- */
    this.buildBridge(b, kit);
    this.buildHabitation(b, kit);
    this.buildEngineering(b, kit);
    this.buildCargo(b, kit);

    // Ceiling light strips (emissive, bloom does the rest)
    const strip = (x: number, y: number, z: number, len: number, alongZ = true) =>
      alongZ ? kit.box('light', 0.35, 0.05, len, { x, y, z }) : kit.box('light', len, 0.05, 0.35, { x, y, z });
    strip(0, 2.97, -4, 36);
    for (const [cx, cz] of [[-4.8, -19], [-4.8, -9], [-4.8, 0.5], [-4.8, 9.5], [4.8, -21], [4.8, -12], [4.8, -1], [4.8, 9]]) strip(cx, 2.97, cz, 5);
    strip(0, 4.17, -30, 9, false);
    strip(-3, 4.9, 38, 18);
    strip(3, 4.9, 38, 18);
    strip(10.7, 2.95, 38, 18);
    strip(-2, -1.65, 54, 7);
    // Emergency floor strips
    for (const x of [-1.45, 1.45]) kit.box('emergency', 0.06, 0.04, 39, { x, y: 0.03, z: -4 });
    kit.box('emergency', 0.06, 0.04, 22, { x: -5, y: D3 + 0.03, z: 38 });

    const group = kit.build({ castShadow: false, receiveShadow: true });
    this.frame.add(group);

    /* ------------------------------ Doors ------------------------------ */
    this.buildDoors();

    /* ------------------------------ Lights ----------------------------- */
    this.hemi = new THREE.HemisphereLight('#dfe8ff', '#4a4f57', 0.5);
    this.scene.add(this.hemi);
    const pl = (x: number, y: number, z: number, color = '#eef3ff', dist = 16) => {
      const l = new THREE.PointLight(color, 0, dist, 1.6);
      l.position.set(x, y, z);
      this.frame.add(l);
      this.pointLights.push(l);
    };
    pl(0, 3.6, -30, '#eef3ff', 18);
    pl(0, 2.6, -14);
    pl(0, 2.6, 6);
    pl(-4.8, 2.6, -9, '#fff1dd', 12);
    pl(-4.8, 2.6, 0.5, '#e8fff4', 12);
    pl(-3, 3.5, 36, '#e6f4ff', 26);
    pl(10.5, 2, 38, '#fff1dd', 20);
    for (const [x, y, z] of [[0, 2, -18], [0, 2, -4], [0, 2, 10], [-4, D3 + 2.5, 34], [10, D3 + 2.5, 36], [0, 2.8, -30]]) {
      const l = new THREE.PointLight('#ff2a1a', 0, 14, 1.8);
      l.position.set(x, y, z);
      this.frame.add(l);
      this.emergencyLights.push(l);
    }

    /* ------------------------------ Outside ---------------------------- */
    this.buildOutside();

    /* ---------------------------- Damage FX ---------------------------- */
    if (this.damaged) this.buildDamage(kit);

    /* ---------------------------- Consoles ----------------------------- */
    this.consoles = buildLanternConsoles(game, this);
    this.scope.add(() => this.consoles.dispose());

    /* ------------------------- Status boards --------------------------- */
    const board = (x: number, y: number, z: number, ry: number) => {
      const sd = new ScreenDisplay(512, 320, 1.2, 0.75, (ctx, w, h) => this.drawStatusBoard(ctx, w, h));
      sd.mesh.position.set(x, y, z);
      sd.mesh.rotation.y = ry;
      this.frame.add(sd.mesh);
      this.statusBoards.push(sd);
      this.scope.add(() => sd.dispose());
    };
    board(1.48, 1.7, 13, -Math.PI / 2);
    board(-7.85, 2.4, -26.5, Math.PI / 2);

    /* ------------------------------ Spawns ----------------------------- */
    const sp = (id: string, x: number, y: number, z: number, yaw: number) => {
      this.spawns[id] = { id, position: this.shipToWorld(new THREE.Vector3(x, y + 0.08, z)), yaw };
    };
    sp('cabin', -4.2, 0, -19, -Math.PI / 2);
    sp('cargo', 12.5, D3, 33, Math.PI / 2);
    sp('airlock', 9.8, 0, -9, Math.PI / 2);
    sp('medbay', -3.6, 0, 0.5, -Math.PI / 2);
    sp('bridge', 0, 0, -26, 0);
    sp('pilot', 0, 0, -30.8, 0);
    sp('engineering', -2, D3, 30, 0);

    /* ------------------------------- Crew ------------------------------ */
    const spots: Record<string, Spot> = {};
    const spot = (id: string, x: number, y: number, z: number, yaw: number) => {
      spots[id] = { position: this.shipToWorld(new THREE.Vector3(x, y, z)), yaw };
    };
    spot('bridge.pilot', 0, 0, -32.3, Math.PI);
    spot('bridge.nav', -5.6, 0, -31, -Math.PI / 2);
    spot('bridge.comms', 5.6, 0, -31, Math.PI / 2);
    spot('bridge.science', -5.6, 0, -27.5, -Math.PI / 2);
    spot('bridge.eng', 5.6, 0, -27.5, Math.PI / 2);
    spot('bridge.commander', 0, 0, -27.2, Math.PI);
    spot('bridge.medic', 2.8, 0, -25.4, Math.PI);
    spot('eng.console', -9.6, D3, 30, -Math.PI / 2);
    spot('eng.reactor', -0.2, D3, 38.5, -0.8);
    spot('medbay.bed', -5.6, 0, -1.4, Math.PI / 2);
    spot('medbay.station', -6.2, 0, 3, -Math.PI / 2);
    spot('lab.bench', -6.1, 0, 10, -Math.PI / 2);
    spot('common.table', -4.6, 0, -10.6, 0);
    spot('workshop.bench', 6.0, 0, -1, Math.PI / 2);
    const nodes: Record<string, THREE.Vector3> = {};
    const node = (id: string, x: number, y: number, z: number) => (nodes[id] = this.shipToWorld(new THREE.Vector3(x, y, z)));
    node('bridgeC', 0, 0, -28.5); node('bridgeL', -4, 0, -29.5); node('bridgeR', 4, 0, -29.5); node('bdoor', 0, 0, -23.2);
    node('c1', 0, 0, -21); node('c2', 0, 0, -12); node('c3', 0, 0, -1); node('c4', 0, 0, 9); node('c5', 0, 0, 15);
    node('quarters', -4, 0, -19); node('common', -4.5, 0, -9); node('medbay', -4, 0, 0.5); node('lab', -4, 0, 9.5);
    node('office', 4.5, 0, -21); node('suit', 4.5, 0, -12); node('workshop', 4.5, 0, -1); node('storage', 4.5, 0, 9);
    node('st1', 0, D3, 27); node('e1', 0, D3, 30); node('e2', -7, D3, 31); node('e3', -0.5, D3, 36); node('cargo', 9, D3, 36);
    const nav: NavGraph = {
      nodes,
      edges: [
        ['bridgeC', 'bridgeL'], ['bridgeC', 'bridgeR'], ['bridgeC', 'bdoor'], ['bdoor', 'c1'], ['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'], ['c4', 'c5'],
        ['c1', 'quarters'], ['c1', 'office'], ['c2', 'common'], ['c2', 'suit'], ['c3', 'medbay'], ['c3', 'workshop'], ['c4', 'lab'], ['c4', 'storage'],
        ['c5', 'st1'], ['st1', 'e1'], ['e1', 'e2'], ['e1', 'e3'], ['e3', 'cargo'],
      ],
    };
    this.crew = new CrewRuntime(game, this, spots, (x, z, fallback) => this.floorAt(x, z, fallback), nav);
    this.scope.add(() => this.crew.dispose());

    this.onStateChanged();
  }

  /** Floor height below a world position (raycast), used by NPCs on sloped decks. */
  floorAt(x: number, z: number, fallback: number): number {
    const d = this.physics.raycast(new THREE.Vector3(x, fallback + 1.2, z), new THREE.Vector3(0, -1, 0), 3);
    return d === null ? fallback : fallback + 1.2 - d;
  }

  /* ----------------------------- Bridge ----------------------------- */

  private buildBridge(b: InteriorBuilder, kit: KitBuilder): void {
    // Raised forward dash under the window
    b.solid('dark', 12, 1.0, 1.2, 0, 0.5, -35.2);
    kit.box('trim', 12.2, 0.08, 1.3, { x: 0, y: 1.02, z: -35.2 });
    // Pilot seat
    kit.box('fabric', 0.8, 0.12, 0.8, { x: 0, y: 0.55, z: -32.3 });
    kit.box('fabric', 0.8, 1.0, 0.15, { x: 0, y: 1.05, z: -31.85 }, [0.15, 0, 0]);
    kit.box('metal', 0.2, 0.5, 0.2, { x: 0, y: 0.25, z: -32.3 });
    // Side stations (nav/science left, comms/eng right): desks
    for (const side of [-1, 1]) {
      for (const z of [-31, -27.5]) {
        b.solid('dark', 0.9, 1.0, 2.2, side * 7.35, 0.5, z);
        kit.box('trim', 1.0, 0.06, 2.3, { x: side * 7.35, y: 1.02, z });
      }
    }
    // Commander's holo table
    kit.cyl('dark', 0.9, 1.0, 0.95, { x: 0, y: 0.47, z: -28.4 }, undefined, 12);
    kit.cyl('light', 0.8, 0.8, 0.03, { x: 0, y: 0.96, z: -28.4 }, undefined, 12);
    b.collider(1.8, 1, 1.8, 0, 0.5, -28.4);
    // Jump seats along the aft wall
    for (const x of [-4.5, -3, 3, 4.5]) {
      kit.box('fabric', 0.6, 0.08, 0.5, { x, y: 0.55, z: -24.6 });
      kit.box('fabric', 0.6, 0.9, 0.08, { x, y: 1.0, z: -24.35 });
    }
    // Overhead panels
    kit.box('dark', 4, 0.1, 2, { x: 0, y: 4.1, z: -33.5 }, [0.2, 0, 0]);
  }

  /* --------------------------- Habitation --------------------------- */

  private buildHabitation(b: InteriorBuilder, kit: KitBuilder): void {
    // Quarters: bunks
    for (let i = 0; i < 3; i++) {
      const z = -22.6 + i * 3.2;
      for (const y of [0.45, 1.65]) {
        b.solid('metal', 2.1, 0.12, 0.95, -6.8, y, z);
        kit.box('bed', 1.95, 0.14, 0.85, { x: -6.8, y: y + 0.13, z });
        kit.box('fabric', 0.5, 0.1, 0.7, { x: -7.5, y: y + 0.25, z });
      }
      kit.box('metal', 0.08, 2.4, 0.08, { x: -5.8, y: 1.2, z: z + 0.45 });
    }
    kit.box('dark', 0.6, 2.2, 1.2, { x: -2.3, y: 1.1, z: -15 });
    // Common: table, benches, galley
    b.solid('dark', 2.6, 0.08, 1.3, -4.6, 0.78, -9);
    kit.box('metal', 0.2, 0.75, 0.2, { x: -4.6, y: 0.38, z: -9 });
    for (const dz of [-1.1, 1.1]) b.solid('fabric', 2.4, 0.45, 0.45, -4.6, 0.23, -9 + dz);
    b.solid('metal', 4, 0.95, 0.7, -4.5, 0.48, -13.5);
    kit.box('dark', 4, 0.05, 0.72, { x: -4.5, y: 0.97, z: -13.5 });
    kit.box('dark', 1.2, 0.7, 0.5, { x: -3.4, y: 2.0, z: -13.6 });
    // Medbay: two beds and a station
    for (const z of [-1.5, 2.5]) {
      b.solid('metal', 1.0, 0.6, 2.1, -6.6, 0.3, z);
      kit.box('bed', 0.95, 0.12, 2.0, { x: -6.6, y: 0.66, z });
      kit.box('light', 0.6, 0.04, 0.4, { x: -6.6, y: 2.95, z });
    }
    kit.box('metal', 0.1, 1.6, 0.1, { x: -7.7, y: 0.8, z: 0.5 });
    // Lab: bench and analyzer
    b.solid('metal', 1.2, 0.95, 5, -7.2, 0.48, 10);
    kit.box('dark', 1.25, 0.05, 5.05, { x: -7.2, y: 0.97, z: 10 });
    kit.box('glass', 0.9, 0.7, 1.4, { x: -7.2, y: 1.35, z: 8.2 });
    kit.cyl('metal', 0.08, 0.08, 0.5, { x: -7.2, y: 1.25, z: 11.5 }, undefined, 8);
    // Office: desk
    b.solid('dark', 2.2, 0.8, 1.0, 5.4, 0.4, -22.6);
    kit.box('fabric', 0.7, 1.0, 0.7, { x: 5.4, y: 0.5, z: -21.4 });
    // Suit room: suit lockers along the east wall
    for (let i = 0; i < 6; i++) {
      const z = -17 + i * 1.3;
      if (z > -10.4 && z < -7.6) continue;
      b.solid('metal', 0.7, 2.3, 1.1, 7.45, 1.15, z);
      kit.box('stripe', 0.72, 0.05, 1.12, { x: 7.45, y: 2.0, z });
    }
    kit.box('dark', 0.3, 0.3, 0.3, { x: 11.3, y: 2.3, z: -9 });
    // Workshop: fabricator
    b.solid('metal', 1.4, 1.8, 3.2, 7.1, 0.9, -1);
    kit.box('dark', 1.42, 0.6, 1.6, { x: 7.1, y: 1.2, z: -1 });
    kit.box('stripe', 1.45, 0.08, 3.25, { x: 7.1, y: 1.8, z: -1 });
    b.solid('dark', 3, 0.9, 1, 4.8, 0.45, 3.3);
    // Storage: lockers
    for (let i = 0; i < 6; i++) b.solid(i % 2 ? 'dark' : 'metal', 0.8, 2.4, 1.3, 7.4, 1.2, 5 + i * 1.5);
  }

  /* --------------------------- Engineering -------------------------- */

  private buildEngineering(b: InteriorBuilder, kit: KitBuilder): void {
    // Reactor vessel
    const rx = -4, rz = 42;
    kit.cyl('hull', 3.2, 3.2, 7.6, { x: rx, y: D3 + 3.8, z: rz }, undefined, 24);
    kit.cyl('reactor', 1.4, 1.4, 5.6, { x: rx, y: D3 + 3.8, z: rz }, undefined, 16);
    b.collider(6.6, 7.6, 6.6, rx, D3 + 3.8, rz);
    for (const y of [1, 3.8, 6.6]) kit.cyl('trim', 3.35, 3.35, 0.3, { x: rx, y: D3 + y, z: rz }, undefined, 24);
    // Viewing slots into the core (emissive when running)
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      kit.box('reactor', 0.5, 3.2, 0.1, { x: rx + Math.cos(ang) * 3.22, y: D3 + 3.8, z: rz + Math.sin(ang) * 3.22 }, [0, -ang + Math.PI / 2, 0]);
    }
    // Control rod drive housing on top
    kit.cyl('metal', 1.6, 2.2, 1.2, { x: rx, y: D3 + 8.2, z: rz }, undefined, 16);
    // Coolant pipes
    for (const [x, z] of [[rx + 3.4, rz - 2], [rx + 3.4, rz + 2]]) {
      kit.cyl('pipe', 0.35, 0.35, 8.6, { x, y: D3 + 4.3, z }, undefined, 10);
      kit.cyl('pipe', 0.35, 0.35, 5, { x: x + 2.5, y: D3 + 7.8, z }, [0, 0, Math.PI / 2], 10);
    }
    kit.box('yellow', 7, 0.05, 7, { x: rx, y: D3 + 0.03, z: rz });
    // Spinning rings (animated when the reactor runs)
    const ringMat = this.reactorGlow;
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7 + i * 0.25, 0.06, 6, 48), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(rx, D3 + 2.4 + i * 3, rz);
      this.frame.add(ring);
      this.reactorRings.push(ring);
    }
    // Engineering console desk (west), power panel wall, battery racks, life support
    b.solid('dark', 1.2, 1.0, 3.2, -11.2, D3 + 0.5, 30);
    kit.box('trim', 1.3, 0.06, 3.3, { x: -11.2, y: D3 + 1.02, z: 30 });
    b.solid('dark', 0.5, 2.4, 2.4, -11.65, D3 + 1.6, 35);
    // Battery racks (east wall)
    for (let i = 0; i < 4; i++) {
      b.solid('dark', 1.1, 2.4, 1.0, 5.2, D3 + 1.2, 28 + i * 1.15);
      kit.box('stripe', 1.12, 0.1, 1.02, { x: 5.2, y: D3 + 2.3, z: 28 + i * 1.15 });
    }
    // Life support plant (south-west corner)
    b.solid('metal', 3.4, 3, 4.5, -10.2, D3 + 1.5, 46.4);
    kit.box('dark', 0.1, 1.2, 2.5, { x: -8.45, y: D3 + 1.4, z: 46.4 });
    for (let i = 0; i < 3; i++) kit.cyl('pipe', 0.2, 0.2, 5, { x: -9 + i * 0.5, y: D3 + 5.5, z: 46 }, [Math.PI / 2, 0, 0], 8);
    // Walkway grating and railings around the reactor
    for (const z of [37.8, 46.2]) kit.box('metal', 8, 0.06, 0.06, { x: rx, y: D3 + 1, z });
    // Upper gantry
    kit.box('floor', 18, 0.12, 1.5, { x: -3, y: D3 + 5.2, z: 27 });
    // Crawlway: injector bays
    for (let i = 0; i < 3; i++) kit.box('metal', 0.5, 0.8, 0.9, { x: -1.3, y: D3 + 1.3, z: 53 + i * 1.6 });
    kit.cyl('pipe', 0.25, 0.25, 7.5, { x: -2.7, y: D3 + 2.0, z: 54 }, [Math.PI / 2, 0, 0], 8);
  }

  private buildCargo(b: InteriorBuilder, kit: KitBuilder): void {
    const rng = new Rng(55);
    for (let i = 0; i < 9; i++) {
      const x = 7.4 + (i % 3) * 1.3;
      const z = 41 + Math.floor(i / 3) * 2.4;
      const h = rng.range(0.9, 1.4);
      b.solid(i % 4 === 0 ? 'yellow' : 'crate', 1.2, h, 1.8, x, D3 + h / 2, z);
      if (rng.chance(0.5)) b.solid('crate', 1.1, 0.9, 1.6, x, D3 + h + 0.45, z);
    }
    for (let i = 0; i < 3; i++) b.solid('dark', 1.6, 2.2, 1.2, 14.6, D3 + 1.1, 44 + i * 1.8);
    // Ramp door frame (outer hull)
    kit.box('stripe', 0.3, 0.2, 7.2, { x: 15.3, y: D3 + 5.1, z: 33 });
  }

  /* ------------------------------ Doors ------------------------------ */

  private buildDoors(): void {
    const mat = stdMat('#cfd4da', { map: hullPanelTexture(), roughness: 0.5, metalness: 0.3 });
    const lockMat = new THREE.MeshStandardMaterial({ color: '#2b2f35', emissive: '#ff3030', emissiveIntensity: 0.6 });
    this.scope.own(mat);
    this.scope.own(lockMat);
    const store = this.game.store;
    const mk = (id: string, x: number, y: number, z: number, alongZ: boolean, width: number, height: number, locked: () => boolean) => {
      const half = width / 2;
      const geo = alongZ ? new THREE.BoxGeometry(0.08, height, half) : new THREE.BoxGeometry(half, height, 0.08);
      this.scope.own(geo);
      const left = new THREE.Mesh(geo, mat);
      const right = new THREE.Mesh(geo, mat);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.1 : 0.3, 0.08, alongZ ? 0.3 : 0.1), lockMat);
      lamp.position.set(x, y + height + 0.25, z);
      this.frame.add(left, right, lamp);
      const door: Door = { id, left, right, center: new THREE.Vector3(x, y, z), alongZ, width, open: 0, locked, collider: null };
      this.doors.push(door);
      const place = () => {
        const off = half / 2 + door.open * half * 0.95;
        if (alongZ) {
          left.position.set(x, y + height / 2, z - off);
          right.position.set(x, y + height / 2, z + off);
        } else {
          left.position.set(x - off, y + height / 2, z);
          right.position.set(x + off, y + height / 2, z);
        }
      };
      (door as any).place = place;
      (door as any).lamp = lamp;
      place();
    };
    mk('bridge', 0, 0, -24, false, 2, 2.4, () => false);
    for (const z of [-19, -9, 0.5, 9.5]) mk(`w${z}`, -1.6, 0, z, true, 1.8, 2.4, () => false);
    mk('office', 1.6, 0, -21, true, 1.8, 2.4, () => !store.state.flags['office.unlocked']);
    for (const z of [-12, -1, 9]) mk(`e${z}`, 1.6, 0, z, true, 1.8, 2.4, () => false);
    mk('airlock.inner', 8, 0, -9, true, 1.5, 2.3, () => false);
    // Locked door blocks passage physically
    const office = this.doors.find((d) => d.id === 'office')!;
    if (office.locked()) {
      office.collider = this.physicsBoxLocal(0.3, 2.4, 1.8, 1.6, 1.2, -21);
    }
  }

  private physicsBoxLocal(w: number, h: number, d: number, x: number, y: number, z: number) {
    this.frame.updateMatrixWorld(true);
    const pos = new THREE.Vector3(x, y, z).applyMatrix4(this.frame.matrixWorld);
    const q = new THREE.Quaternion().setFromRotationMatrix(this.frame.matrixWorld);
    return this.physics.addBox(pos, new THREE.Vector3(w / 2, h / 2, d / 2), q);
  }

  private updateDoors(dt: number): void {
    const powered = this.condition !== 'dead';
    const p = this.frame.worldToLocal(this.game.player.position.clone());
    for (const d of this.doors) {
      let target = 0;
      if (d.locked()) target = 0;
      else if (!powered) target = 0.55; // jammed half-open after the crash
      else {
        const dist = Math.hypot(p.x - d.center.x, p.z - d.center.z);
        target = dist < 2.8 && Math.abs(p.y - d.center.y) < 2 ? 1 : 0;
        if (target === 0 && this.crewNear(d)) target = 1;
      }
      const prev = d.open;
      d.open += (target - d.open) * damp(8, dt);
      if (Math.abs(d.open - prev) > 0.001) (d as any).place();
      if (prev < 0.1 && d.open >= 0.1 && powered && target === 1) this.game.audio.play('door', 0.35);
      const lamp = (d as any).lamp as THREE.Mesh;
      const lm = lamp.material as THREE.MeshStandardMaterial;
      lm.emissive.set(d.locked() ? '#ff3030' : powered ? '#3ee08f' : '#553300');
      if (d.collider && !d.locked()) {
        this.physics.removeCollider(d.collider);
        d.collider = null;
      }
    }
  }

  private crewNear(d: Door): boolean {
    void d;
    return false;
  }

  /* ----------------------------- Outside ----------------------------- */

  private buildOutside(): void {
    const s = this.game.store.state;
    this.sky?.dispose();
    for (const p of this.planets) p.dispose();
    this.planets = [];
    this.outside.clear();
    const crashedSurface = !!s.flags.crashed && s.ship.parking.kind === 'surface';
    this.sky = new Sky({ seed: 77, radius: 4000, earth: false });
    this.scene.add(this.sky.group);
    if (crashedSurface) {
      // Lunar landscape seen through the windows (level horizon — the ship is the one tilted)
      const geo = new THREE.PlaneGeometry(3000, 3000, 80, 80);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const rng = new Rng(9);
      const bumps = Array.from({ length: 40 }, () => [rng.range(-1500, 1500), rng.range(-1500, 1500), rng.range(20, 160), rng.range(-12, 30)]);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        let h = Math.sin(x * 0.01) * 3 + Math.cos(z * 0.013) * 3;
        for (const [bx, bz, br, bh] of bumps) {
          const d = Math.hypot(x - bx, z - bz) / br;
          if (d < 1.4) h += bh * Math.exp(-d * d * 2);
        }
        h += Math.max(0, r - 700) * 0.18;
        pos.setY(i, h);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: '#8e8b86', roughness: 0.95, flatShading: true });
      const ground = new THREE.Mesh(geo, mat);
      ground.position.y = -7.2;
      ground.receiveShadow = true;
      this.outside.add(ground);
      this.scope.own(geo);
      this.scope.own(mat);
      this.sun = new THREE.DirectionalLight('#fff6ea', 2.6);
      this.sun.position.set(80, 12, -40);
      this.sun.target.position.set(0, 0, 0);
      this.sun.castShadow = this.game.renderer.quality.shadows;
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
      sc.left = -40; sc.right = 40; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 300;
      this.sun.shadow.bias = -0.0005;
      this.outside.add(this.sun, this.sun.target);
      this.sky.sunDir.copy(this.sun.position).normalize();
    } else if (!s.flags.crashed) {
      // Act 0: cruising from Earth to the Moon — Moon ahead, Earth behind to port.
      const moon = createPlanet('moon', 260, { segments: 64 });
      moon.group.position.set(-300, 120, -2600);
      const earth = createPlanet('earth', 520, { segments: 96 });
      earth.group.position.set(-2800, -300, 1800);
      this.outside.add(moon.group, earth.group);
      this.planets.push(moon, earth);
      this.sky.sunDir.set(0.8, 0.2, -0.3).normalize();
    } else {
      // In space after launch
      const moon = createPlanet('moon', 900, { segments: 96 });
      moon.group.position.set(0, -1400, -600);
      this.outside.add(moon.group);
      this.planets.push(moon);
      this.sky.sunDir.set(0.8, 0.2, -0.3).normalize();
    }
    this.scope.add(() => {
      this.sky?.dispose();
      for (const p of this.planets) p.dispose();
    });
  }

  /* ------------------------------ Damage ----------------------------- */

  private buildDamage(kit: KitBuilder): void {
    void kit;
    const store = this.game.store;
    const scorchMat = stdMat('#151311', { roughness: 1 });
    const patchMat = stdMat('#b8bec6', { roughness: 0.5, metalness: 0.6 });
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    this.scope.own(scorchMat);
    this.scope.own(patchMat);
    this.scope.own(beamMat);
    const breach = (id: string, pos: THREE.Vector3, rot: THREE.Euler, size: [number, number], beamDir: THREE.Vector3 | null) => {
      const hole = new THREE.Group();
      const back = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color: '#000000' }));
      hole.add(back);
      // jagged torn petals
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 0.35, 0.03, size[1] * 0.25), scorchMat);
        petal.position.set(Math.cos(a) * size[0] * 0.45, Math.sin(a) * size[1] * 0.45, 0.08);
        petal.rotation.set(Math.PI / 2 + 0.6, 0, a);
        hole.add(petal);
      }
      hole.position.copy(pos);
      hole.rotation.copy(rot);
      const patch = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.4, size[1] + 0.4, 0.06), patchMat);
      patch.position.copy(pos);
      patch.rotation.copy(rot);
      let beam: THREE.Mesh | null = null;
      if (beamDir) {
        const len = 6;
        beam = new THREE.Mesh(new THREE.CylinderGeometry(size[0] * 0.35, size[0] * 0.5, len, 10, 1, true), beamMat);
        beam.position.copy(pos).addScaledVector(beamDir, len / 2);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir.clone().normalize());
        this.frame.add(beam);
      }
      this.frame.add(hole, patch);
      this.breachObjs.set(id, { hole, patch, beam });
      this.sparkPoints.push(pos.clone());
    };
    breach('breach.corridor', new THREE.Vector3(0, 2.98, 11), new THREE.Euler(Math.PI / 2, 0, 0.3), [1.2, 0.9], new THREE.Vector3(0.25, -1, -0.15));
    breach('breach.lab', new THREE.Vector3(-7.88, 1.5, 7.2), new THREE.Euler(0, Math.PI / 2, 0.2), [1.3, 1.1], new THREE.Vector3(1, -0.35, 0.1));
    // Fallen ceiling panels & debris
    const debris = stdMat('#6b727b', { roughness: 0.6, metalness: 0.5 });
    this.scope.own(debris);
    const rng = new Rng(3);
    const place = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), debris);
      m.position.set(x, y, z);
      m.rotation.set(rng.range(-0.6, 0.6), rng.range(0, 3), rng.range(-0.6, 0.6));
      this.frame.add(m);
    };
    place(0.6, 0.15, -6, 1.2, 0.05, 0.9);
    place(-0.5, 0.2, 4, 1.0, 0.05, 0.8);
    place(-4, 0.1, -7, 0.4, 0.3, 0.4);
    place(3.5, D3 + 0.2, 33, 1.2, 0.05, 1.0);
    place(-6, 0.2, 12, 0.9, 0.05, 0.7);
    // Dangling cables
    const cableMat = stdMat('#1b1b1b');
    this.scope.own(cableMat);
    for (const [x, z] of [[0.4, -4], [-0.6, 6], [0.2, -30], [-2, 40]]) {
      const y = z > 20 ? 4.5 : z < -24 ? 4.1 : 2.95;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 5), cableMat);
      c.position.set(x, y - 0.7, z);
      c.rotation.z = 0.2;
      this.frame.add(c);
      this.sparkPoints.push(new THREE.Vector3(x, y - 1.4, z));
    }
    // Floating dust motes in light shafts (no air to carry smoke)
    const n = 300;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.range(-1.4, 1.4);
      pos[i * 3 + 1] = rng.range(0.2, 2.8);
      pos[i * 3 + 2] = rng.range(-20, 14);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: '#d8d2c8', size: 0.025, transparent: true, opacity: 0.5, depthWrite: false });
    this.dustMotes = new THREE.Points(g, pm);
    this.frame.add(this.dustMotes);
    void store;
  }

  /* --------------------------- State sync ---------------------------- */

  override onStateChanged(): void {
    const s = this.game.store.state;
    const sys = s.ship.systems;
    const prev = this.condition;
    this.condition = !s.flags.crashed ? 'intact' : sys['power.reactor']?.online ? 'powered' : sys['power.batteries']?.online ? 'emergency' : 'dead';
    const c = this.condition;
    const level = c === 'intact' || c === 'powered' ? 1 : c === 'emergency' ? 0.35 : 0;
    this.lightPanels.emissiveIntensity = level * 2.2;
    this.lightPanels.color.set(level > 0 ? '#f4f6ff' : '#2a2c30');
    for (const l of this.pointLights) l.intensity = level * (c === 'emergency' ? 70 : 160);
    const dead = c === 'dead';
    this.emergencyMat.emissiveIntensity = dead ? 1.6 : c === 'emergency' ? 0.5 : 0;
    for (const l of this.emergencyLights) l.intensity = dead ? 22 : c === 'emergency' ? 6 : 0;
    this.hemi.intensity = dead ? 0.14 : 0.2 + level * 0.5;
    this.hemi.color.set(dead ? '#7a4a44' : '#dfe8ff');
    this.reactorGlow.emissiveIntensity = c === 'powered' || c === 'intact' ? 2.2 : 0;
    this.env.ambience = dead ? 'ship-dead' : 'ship';
    this.game.audio.setAmbience(this.env.ambience);
    this.game.audio.setVacuum(!this.pressurized);
    if (prev !== c && prev !== 'dead' && c === 'powered') this.game.cam.addShake(0.3);
    // Breaches
    for (const [id, o] of this.breachObjs) {
      const step = id.replace('breach.', 'breach.');
      const sealed = !!sys['life.hull']?.steps[step];
      o.hole.visible = !sealed;
      o.patch.visible = sealed;
      if (o.beam) o.beam.visible = !sealed;
    }
    if (this.dustMotes) this.dustMotes.visible = !this.pressurized;
    this.consoles?.refresh();
    for (const b of this.statusBoards) {
      b.powered = c !== 'dead';
      b.redraw(this.t);
    }
    this.crew?.refresh();
  }

  private drawStatusBoard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const store = this.game.store;
    const s = store.state;
    ScreenUI.bg(ctx, w, h, '#07131a');
    ScreenUI.title(ctx, `${s.ship.name} · ship status`);
    let y = 70;
    for (const def of Object.values(store.content.shipSystems)) {
      const st = s.ship.systems[def.id];
      const ready = this.game.systemReady(def.id).ok;
      ScreenUI.status(ctx, 22, y, def.name, st.online ? 'ok' : ready ? 'warn' : st.condition > 0.3 ? 'warn' : 'fault');
      ScreenUI.bar(ctx, 250, y - 12, 220, 10, st.condition, st.online ? '#3ee08f' : '#ffc857');
      y += 30;
    }
    ScreenUI.text(ctx, `Hull ${(s.ship.hull * 100).toFixed(0)}%   Propellant ${Math.round(s.ship.propellant)} kg   List ${s.ship.listDeg.toFixed(0)}°`, 22, h - 22, '#9fe8ff', 15);
  }

  /* ------------------------------ Update ----------------------------- */

  override update(dt: number): void {
    this.t += dt;
    const cam = this.game.cam.camera;
    this.sky?.update(cam.position, this.t, 1);
    if (this.planets.length) {
      for (const p of this.planets) p.update(this.t, this.sky!.sunDir);
      // Keep planets at a fixed offset from the camera (at infinity)
      this.outside.position.copy(cam.position).multiplyScalar(0.98);
    }
    this.updateDoors(dt);
    this.crew.update(dt);
    this.consoles.update(dt);
    // Reactor rings
    if (this.condition === 'powered' || this.condition === 'intact') {
      this.reactorRings.forEach((r, i) => (r.rotation.z += dt * (i ? -0.6 : 0.9)));
    }
    // Sparks from damaged wiring (until the reactor restores regulated power)
    if (this.damaged && this.condition !== 'powered') {
      this.sparkTimer -= dt;
      if (this.sparkTimer <= 0) {
        this.sparkTimer = 0.4 + Math.random() * 1.4;
        const p = this.sparkPoints[Math.floor(Math.random() * this.sparkPoints.length)];
        if (p) {
          const wp = this.shipToWorld(p);
          this.glowParticles.emit({ count: 14, position: wp, velocity: new THREE.Vector3(0, -0.5, 0), spread: 1.6, life: [0.2, 0.7], size: 0.05, color: '#ffcf7a', gravity: this.env.gravity });
          if (wp.distanceTo(this.game.player.position) < 10) this.game.audio.play('weld', 0.25);
        }
      }
    }
    this.particles.update(dt);
    this.glowParticles.update(dt);
    if (this.dustMotes) this.dustMotes.rotation.y = Math.sin(this.t * 0.05) * 0.02;
    // Hull creaks while the crashed ship settles
    if (this.damaged) {
      this.creakTimer -= dt;
      if (this.creakTimer <= 0) {
        this.creakTimer = 14 + Math.random() * 20;
        this.game.audio.play('powerDown', 0.15);
      }
    }
  }

  override onEnter(): void {
    const s = this.game.store.state;
    if (s.flags.crashed && !s.flags['hint.ship']) {
      this.game.store.setFlag('hint.ship', true);
      ui.hint.value = 'The Lantern is without power. Your headlamp (L) will help. Consoles are operated in first person: walk up and press E.';
      setTimeout(() => (ui.hint.value = null), 9000);
    }
  }

  /** Act 0 catastrophe: the Blackglass crosses the bow (seen through the bridge window). */
  spawnBlackglass(): void {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#000' }));
    shard.scale.set(40, 160, 40);
    shard.position.set(900, 300, -1600);
    shard.renderOrder = 5;
    this.scene.add(shard);
    this.scope.own(shard.geometry);
    this.scope.own(shard.material as THREE.Material);
    const start = performance.now();
    const off = this.game.addHook(() => {
      const k = (performance.now() - start) / 4000;
      shard.position.set(900 - k * 1300, 300 - k * 250, -1600 + k * 700);
      shard.rotation.y += 0.01;
      if (k > 1.5 || this.scope.disposed) {
        shard.removeFromParent();
        return false;
      }
    });
    this.scope.add(off);
  }

  /** Temporary red-alert look during the catastrophe (pure visual, not state). */
  setCatastropheVisual(on: boolean): void {
    if (!on) return this.onStateChanged();
    this.lightPanels.emissiveIntensity = 0.1;
    for (const l of this.pointLights) l.intensity = 5;
    for (const l of this.emergencyLights) l.intensity = 40;
    this.emergencyMat.emissiveIntensity = 2;
    this.hemi.intensity = 0.1;
    this.hemi.color.set('#7a2020');
  }

  /** Exits: where the ramp/airlock lead depends on where the ship is. */
  exitTarget(which: 'ramp' | 'airlock'): { location: string; spawn: string } | null {
    const p = this.game.store.state.ship.parking;
    if (p.kind === 'surface') return { location: p.locationId, spawn: which };
    if (p.kind === 'docked' && which === 'airlock') return { location: p.locationId, spawn: p.portId };
    return null;
  }
}
