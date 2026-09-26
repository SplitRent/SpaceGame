import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { floorTexture, wallTexture } from '../../procgen/textures';
import { InteriorBuilder, navFromRooms, type RoomDef } from '../lantern/interiorKit';
import { CrewRuntime, type Spot } from '../../gameplay/crew';
import { ScreenDisplay, ScreenUI } from '../../render/screen';
import { ConsolePanel } from '../../interaction/ConsolePanel';
import { propellantCapacity } from '../../content/shipSystems';
import { Rng } from '../../engine/Rng';
import { pushNotification } from '../../ui/uiState';

/**
 * Melas Station: a four-person science outpost on the floor of Melas Chasma. Airlock,
 * commons/lab with a window onto the north canyon wall, the storm shelter where the crew
 * sat out the blackout, and the power bay. Dark and cold until its power is restored.
 */
export class MelasStation extends Location {
  readonly id = 'mars.station';
  readonly name = 'Melas Station';
  readonly mode = 'foot' as const;
  private frame = new THREE.Group();
  private crew!: CrewRuntime;
  private lights: THREE.PointLight[] = [];
  private heaterLight!: THREE.PointLight;
  private lightMat!: THREE.MeshStandardMaterial;
  private hemi!: THREE.HemisphereLight;
  private bus!: ConsolePanel;
  private board!: ScreenDisplay;
  private t = 0;
  private outsideOwned: { dispose(): void }[] = [];

  constructor(game: Game) {
    super(game, 3.71);
    this.env = { gravity: 3.71, atmosphere: 'breathable', temperatureC: 4, radiation: 0.3, ambience: 'station' };
    this.killY = -30;
  }

  private get powered(): boolean {
    return !!this.game.store.state.flags['melas.power'];
  }

  override temperatureAt(): number {
    return this.powered ? 19 : 3;
  }

  async build(): Promise<void> {
    const game = this.game;
    const store = game.store;
    this.scene.add(this.frame);
    this.scene.background = new THREE.Color('#c79a72');
    const mats = {
      floor: stdMat('#8a8078', { map: floorTexture(), metalness: 0.3, roughness: 0.7, flatShading: false }),
      wall: stdMat('#e8e2d8', { map: wallTexture(), roughness: 0.7, flatShading: false }),
      ceiling: stdMat('#4a4540'),
      trim: stdMat('#6a625a', { metalness: 0.4, roughness: 0.5 }),
      stripe: stdMat('#d9533a', { emissive: '#d9533a', emissiveIntensity: 0.25 }),
      glass: new THREE.MeshStandardMaterial({ color: '#c8a888', transparent: true, opacity: 0.12, depthWrite: false }),
      dark: stdMat('#2a2f36'),
      metal: stdMat('#a4adb7', { metalness: 0.7, roughness: 0.4 }),
      fabric: stdMat('#3f6a8a'),
      rust: stdMat('#9a5a3a', { roughness: 0.9 }),
      plant: stdMat('#4e9a4a'),
    };
    this.lightMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe2c0', emissiveIntensity: 0.05 });
    for (const m of Object.values(mats)) this.scope.own(m);
    this.scope.own(this.lightMat);
    const kit = new KitBuilder({ ...mats, light: this.lightMat });
    const b = new InteriorBuilder(kit, this.physics, this.frame);
    const rooms: RoomDef[] = [
      { id: 'airlock', x0: -2, x1: 2, z0: 0, z1: 5, y: 0, h: 2.8, openings: [{ side: 'n', at: 0, width: 1.6 }] },
      {
        id: 'commons', x0: -7, x1: 7, z0: -12, z1: 0, y: 0, h: 3.2,
        openings: [
          { side: 's', at: 0, width: 1.6 },
          { side: 'w', at: -6, width: 1.8 },
          { side: 'e', at: -6, width: 1.8 },
          { side: 'n', at: 0, width: 10, bottom: 0.8, top: 2.7, window: true },
        ],
      },
      { id: 'shelter', x0: -15, x1: -7, z0: -10, z1: -2, y: 0, h: 2.8, openings: [{ side: 'e', at: -6, width: 1.8 }] },
      { id: 'power', x0: 7, x1: 15, z0: -10, z1: -2, y: 0, h: 3, openings: [{ side: 'w', at: -6, width: 1.8 }] },
    ];
    for (const r of rooms) b.room(r);
    // Commons: galley table, lab benches, a stubborn potato plant
    b.solid('dark', 3, 0.08, 1.4, 0, 0.78, -5);
    for (const x of [-1, 1]) b.solid('metal', 0.1, 0.78, 0.1, x, 0.39, -5);
    b.solid('metal', 5, 0.9, 0.8, -4, 0.45, -11.4);
    b.solid('metal', 3, 0.9, 0.8, 5, 0.45, -11.4);
    kit.cyl('rust', 0.25, 0.2, 0.4, { x: 3.2, y: 1.1, z: -11.4 }, undefined, 8);
    kit.cyl('plant', 0.3, 0.15, 0.35, { x: 3.2, y: 1.45, z: -11.4 }, undefined, 6);
    // Shelter: bunks, an emergency heater, water drums
    for (let i = 0; i < 2; i++) b.solid('metal', 2, 0.5, 0.9, -13.9, 0.25 + i, -8.8 + i * 0.1);
    b.solid('fabric', 1.9, 0.12, 0.85, -13.9, 1.32, -8.7);
    b.solid('dark', 0.8, 1, 0.5, -8, 0.5, -9.4);
    kit.box('stripe', 0.6, 0.3, 0.05, { x: -8, y: 0.8, z: -9.13 });
    for (let i = 0; i < 3; i++) kit.cyl('fabric', 0.3, 0.3, 0.9, { x: -14.3 + i * 0.7, y: 0.45, z: -2.6 }, undefined, 10);
    // Power bay: battery racks
    for (let i = 0; i < 3; i++) b.solid('dark', 0.8, 2, 1.4, 14.4, 1, -8.5 + i * 2.2);
    // Ceiling lights
    for (const [x, z] of [[0, -3], [0, -9], [-11, -6], [11, -6], [0, 2.5]]) kit.box('light', 1.4, 0.05, 0.3, { x, y: 2.75, z });
    this.frame.add(kit.build({ castShadow: false }));

    // Lighting: dim heater glow until the power returns
    this.hemi = new THREE.HemisphereLight('#ffe6cc', '#3a3430', 0.2);
    this.scene.add(this.hemi);
    for (const [x, z] of [[0, -3], [0, -9], [-11, -6], [11, -6], [0, 2.5]]) {
      const l = new THREE.PointLight('#fff1dc', 0, 14, 1.6);
      l.position.set(x, 2.5, z);
      this.frame.add(l);
      this.lights.push(l);
    }
    this.heaterLight = new THREE.PointLight('#ff7a3a', 25, 8, 1.8);
    this.heaterLight.position.set(-8, 1, -8.8);
    this.frame.add(this.heaterLight);
    // Window light from the canyon
    const sun = new THREE.DirectionalLight('#ffe0c0', 1.2);
    sun.position.set(20, 30, -40);
    this.scene.add(sun, sun.target);

    this.buildOutside();

    // Station log board (commons, east wall)
    this.board = new ScreenDisplay(640, 360, 1.5, 0.84, (ctx, w, h) => {
      const s = store.state;
      ScreenUI.bg(ctx, w, h, '#140c08');
      ScreenUI.title(ctx, 'MELAS STATION · status', 18, 36, '#ffb38a');
      ScreenUI.status(ctx, 20, 80, s.flags['melas.cable'] ? 'Reactor feeder: CONTINUITY OK' : 'Reactor feeder: OPEN CIRCUIT', s.flags['melas.cable'] ? 'ok' : 'fault');
      ScreenUI.status(ctx, 20, 115, s.flags['melas.cells'] ? 'Bus start cells: SEATED' : 'Bus start cells: DISCHARGED (0%)', s.flags['melas.cells'] ? 'ok' : 'fault');
      ScreenUI.status(ctx, 20, 150, s.flags['melas.power'] ? 'Main bus: ONLINE' : 'Main bus: OFFLINE', s.flags['melas.power'] ? 'ok' : 'warn');
      ScreenUI.status(ctx, 20, 185, 'Crew: 2 of 4 aboard', 'warn');
      ScreenUI.status(ctx, 20, 220, 'Blackout: T+0 = Harbor event, to the second', 'fault');
      ScreenUI.status(ctx, 20, 255, 'Seismic: periodic, 32 min 49 s', 'warn');
      ScreenUI.text(ctx, s.flags['melas.power'] ? 'External camera archive available' : 'Running on heater reserve', 20, h - 20, '#7d8a96', 15);
    });
    this.board.mesh.position.set(6.95, 1.7, -3);
    this.board.mesh.rotation.y = -Math.PI / 2;
    this.frame.add(this.board.mesh);
    this.scope.add(() => this.board.dispose());
    this.scannables.push({ entry: 'db.melas', object: this.board.mesh, range: 10 });

    // Power bus console (first person)
    const mount = new THREE.Group();
    mount.position.set(14.9, 1.35, -5.4);
    mount.rotation.y = -Math.PI / 2;
    this.frame.add(mount);
    const flags = () => store.state.flags;
    this.bus = new ConsolePanel(game, mount, {
      title: 'Station power bus',
      width: 1.1,
      height: 0.7,
      screen: {
        x: 0.18, y: 0.1, w: 0.62, h: 0.36, px: [512, 300],
        draw: (ctx, w, h) => {
          ScreenUI.bg(ctx, w, h, '#120a06');
          ScreenUI.title(ctx, 'Main bus', 18, 36, '#ffb38a');
          ScreenUI.status(ctx, 18, 84, flags()['melas.cable'] ? 'Feeder: continuity' : 'Feeder: OPEN (outside, reactor line)', flags()['melas.cable'] ? 'ok' : 'fault');
          ScreenUI.status(ctx, 18, 124, flags()['melas.cells'] ? 'Start cells: seated' : 'Start cells: need 2 power cells', flags()['melas.cells'] ? 'ok' : 'fault');
          ScreenUI.status(ctx, 18, 164, flags()['melas.power'] ? 'BUS ONLINE · 10 kWe' : 'Bus offline', flags()['melas.power'] ? 'ok' : 'warn');
          ScreenUI.text(ctx, flags()['melas.power'] ? 'Heat, air, lights: nominal' : 'Splice the feeder, seat the cells, then restart', 18, h - 22, '#cfe9f2', 15);
        },
      },
      controls: [
        {
          id: 'cells', kind: 'slot', x: -0.36, y: 0.12, color: '#f2c94c',
          label: () => (flags()['melas.cells'] ? 'Start cells seated' : `Seat 2 power cells (${store.count('powercell')} carried)`),
          enabled: () => !flags()['melas.cells'] && store.count('powercell') >= 2,
          state: () => !!flags()['melas.cells'],
          onClick: () => {
            if (!store.take('powercell', 2)) return;
            store.setFlag('melas.cells', true);
            game.audio.play('switch');
          },
        },
        {
          id: 'restart', kind: 'key', x: 0, y: -0.22, color: '#3ee08f',
          label: () => (flags()['melas.power'] ? 'Bus online' : 'RESTART MAIN BUS'),
          enabled: () => !!flags()['melas.cable'] && !!flags()['melas.cells'] && !flags()['melas.power'],
          onClick: () => {
            store.setFlag('melas.power', true);
            game.audio.play('powerUp');
            game.cam.addShake(0.2);
            store.notify('Melas Station main bus online. Heat and light return.', 'info');
          },
        },
      ],
    });
    this.scope.add(() => this.bus.dispose());
    this.registerInteractable({
      id: 'melas.bus', object: this.bus.face, kind: 'panel', range: 2.6,
      prompt: () => 'Station power bus (first-person panel)',
      interact: () => game.openPanel(this.bus),
    });

    // ISRU propellant plant (water ice → hydrolox), feeds the Lantern when she's parked outside
    const plant = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1.4), new THREE.MeshStandardMaterial({ color: '#3a3f46', emissive: '#4fd1ff', emissiveIntensity: 0.2 }));
    plant.position.set(9, 1, -9.2);
    this.frame.add(plant);
    this.physics.addBox(new THREE.Vector3(9, 1, -9.2), new THREE.Vector3(0.6, 1, 0.7));
    this.registerInteractable({
      id: 'melas.isru', object: plant, kind: 'use', range: 3,
      prompt: () => 'ISRU plant — transfer propellant to the Lantern',
      detail: () => {
        if (!this.powered) return 'Unpowered';
        const p = store.state.ship.parking;
        if (p.kind !== 'surface' || p.locationId !== 'mars.melas') return 'The Lantern is not on the pad';
        return `Lantern tanks ${Math.round(store.state.ship.propellant)} / ${propellantCapacity(store.state)} kg`;
      },
      interact: () => {
        const p = store.state.ship.parking;
        if (!this.powered || p.kind !== 'surface' || p.locationId !== 'mars.melas') {
          game.audio.play('error');
          return;
        }
        store.setPropellant(propellantCapacity(store.state));
        game.audio.play('confirm');
        pushNotification(`Tanks topped up from Melas ice: ${propellantCapacity(store.state)} kg.`, 'info');
      },
    });

    // Supply cabinet (once)
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.5), stdMat('#8d959e', { metalness: 0.5 }));
    cab.position.set(-6.6, 0.9, -1);
    this.frame.add(cab);
    this.registerInteractable({
      id: 'melas.cabinet', object: cab, kind: 'use', prompt: () => 'Station supply cabinet',
      available: () => !store.getEntity(this.id, 'cabinet', 'taken'),
      interact: () => {
        store.batch('cab', () => {
          store.setEntity(this.id, 'cabinet', 'taken', true);
          store.give('o2canister', 2);
          store.give('medpatch', 1);
          store.give('conduit', 1);
        });
        pushNotification('O₂ canisters, a med patch, and a spare power conduit.', 'item');
      },
    });

    // Airlock back outside
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.2), new THREE.MeshStandardMaterial({ color: '#2b3038', emissive: '#ff8a3d', emissiveIntensity: 0.5 }));
    hatch.position.set(0, 1.15, 4.85);
    this.frame.add(hatch);
    this.registerInteractable({
      id: 'melas.out', object: hatch, kind: 'door', prompt: () => 'Airlock — go outside',
      interact: () => {
        game.audio.play('airlock');
        void game.locations.travel({ location: 'mars.melas', spawn: 'station' }, { label: 'Cycling the station airlock…' });
      },
    });

    this.spawns = { airlock: { id: 'airlock', position: new THREE.Vector3(0, 0.1, 3), yaw: 0 } };
    const spots: Record<string, Spot> = {
      'melas.shelter.a': { position: new THREE.Vector3(-12.5, 0, -6.5), yaw: Math.PI / 2 },
      'melas.shelter.b': { position: new THREE.Vector3(-9.5, 0, -4), yaw: -Math.PI / 2 },
      'melas.commons': { position: new THREE.Vector3(-1.5, 0, -6.2), yaw: 0 },
      'melas.lab': { position: new THREE.Vector3(-4, 0, -10.4), yaw: Math.PI },
    };
    this.crew = new CrewRuntime(game, this, spots, (_x, _z, fb) => fb, navFromRooms(rooms));
    this.scope.add(() => this.crew.dispose());
    this.onStateChanged();
  }

  /** Through the commons window: the canyon floor and the layered north wall. */
  private buildOutside(): void {
    const geo = new THREE.PlaneGeometry(3000, 3000, 60, 60);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const rng = new Rng(17);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let h = Math.sin(x * 0.02) * 1.5 + rng.range(-0.5, 0.5);
      const wall = Math.max(0, -z - 520);
      h += wall * 1.4 + Math.sin(x * 0.01) * wall * 0.1;
      pos.setY(i, h);
      const band = 0.5 + 0.5 * Math.sin(h * 0.12);
      const k = Math.min(1, wall / 60);
      col.set([0.66 * (1 - k) + (0.5 + 0.3 * band) * k, 0.39 * (1 - k) + (0.3 + 0.32 * band) * k, 0.24 * (1 - k) + (0.19 + 0.27 * band) * k], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = -0.3;
    this.scene.add(ground);
    this.scene.fog = new THREE.Fog('#c79a72', 200, 2600);
    this.outsideOwned.push(geo, mat);
    this.scope.add(() => this.outsideOwned.forEach((d) => d.dispose()));
  }

  override onStateChanged(): void {
    const p = this.powered;
    for (const l of this.lights) l.intensity = p ? 70 : 0;
    this.lightMat.emissiveIntensity = p ? 1.6 : 0.05;
    this.hemi.intensity = p ? 0.5 : 0.15;
    this.heaterLight.intensity = p ? 6 : 25;
    this.bus?.refresh();
    this.board?.redraw(this.t);
    this.crew?.refresh();
  }

  override update(dt: number): void {
    this.t += dt;
    this.crew.update(dt);
    if (!this.powered) this.heaterLight.intensity = 22 + Math.sin(this.t * 3) * 3;
    this.particles.update(dt);
    this.glowParticles.update(dt);
  }

  override onEnter(): void {
    const store = this.game.store;
    store.discover('mars.station');
    if (!store.state.flags['melas.entered']) {
      store.setFlag('melas.entered', true);
      pushNotification('Cold. Dark. A heater glows orange somewhere to the west.', 'info');
    }
  }
}
