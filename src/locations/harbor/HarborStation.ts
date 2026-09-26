import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { floorTexture, wallTexture } from '../../procgen/textures';
import { InteriorBuilder, type RoomDef } from '../lantern/interiorKit';
import { CrewRuntime, type Spot } from '../../gameplay/crew';
import { createPlanet, type PlanetHandle } from '../../render/planets';
import { Sky } from '../../render/sky';
import { ScreenDisplay, ScreenUI } from '../../render/screen';
import { pushNotification } from '../../ui/uiState';

/**
 * Harbor Station habitation ring (spin gravity ≈ 0.5 g): docking port and airlock, the
 * spoke elevator lobby, a curving ring corridor, and the operations deck whose big window
 * looks down on the Moon. Emergency power only — the station restarted itself.
 */
export class HarborStation extends Location {
  readonly id = 'harbor.interior';
  readonly name = 'Harbor Station';
  readonly mode = 'foot' as const;
  private frame = new THREE.Group();
  private crew!: CrewRuntime;
  private planets: PlanetHandle[] = [];
  private sky!: Sky;
  private t = 0;
  private flicker: THREE.PointLight[] = [];

  constructor(game: Game) {
    super(game, 4.9);
    this.env = { gravity: 4.9, atmosphere: 'breathable', temperatureC: 12, radiation: 0.5, ambience: 'station' };
    this.killY = -30;
  }

  async build(): Promise<void> {
    const game = this.game;
    this.scene.add(this.frame);
    this.scene.background = new THREE.Color('#000');
    const mats = {
      floor: stdMat('#7d858e', { map: floorTexture(), metalness: 0.5, roughness: 0.6, flatShading: false }),
      wall: stdMat('#d5d9de', { map: wallTexture(), roughness: 0.6, flatShading: false }),
      ceiling: stdMat('#3a4048'),
      trim: stdMat('#58606a', { metalness: 0.6, roughness: 0.4 }),
      stripe: stdMat('#3fa9f5', { emissive: '#3fa9f5', emissiveIntensity: 0.4 }),
      glass: new THREE.MeshStandardMaterial({ color: '#9fb8c8', transparent: true, opacity: 0.1, depthWrite: false }),
      dark: stdMat('#2a2f36'),
      metal: stdMat('#a4adb7', { metalness: 0.8, roughness: 0.35 }),
      light: new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe2c0', emissiveIntensity: 0.6 }),
      fabric: stdMat('#5b3f66'),
      plant: stdMat('#3e8f45'),
    };
    for (const m of Object.values(mats)) this.scope.own(m);
    const kit = new KitBuilder(mats);
    const b = new InteriorBuilder(kit, this.physics, this.frame);
    const rooms: RoomDef[] = [
      { id: 'airlock', x0: -2, x1: 2, z0: -2, z1: 4, y: 0, h: 2.8, openings: [{ side: 'n', at: 0, width: 1.6 }] },
      { id: 'lobby', x0: -6, x1: 6, z0: -12, z1: -2, y: 0, h: 3.4, openings: [{ side: 's', at: 0, width: 1.6 }, { side: 'n', at: 0, width: 2.2 }, { side: 'e', at: -7, width: 2 }] },
      { id: 'corridor', x0: -2, x1: 2, z0: -40, z1: -12, y: 0, h: 3, openings: [{ side: 's', at: 0, width: 2.2 }, { side: 'n', at: 0, width: 2.4 }, { side: 'w', at: -26, width: 2 }] },
      { id: 'quarters', x0: -10, x1: -2, z0: -32, z1: -20, y: 0, h: 3, openings: [{ side: 'e', at: -26, width: 2 }] },
      {
        id: 'ops', x0: -10, x1: 10, z0: -56, z1: -40, y: 0, h: 4.2,
        openings: [{ side: 's', at: 0, width: 2.4 }, { side: 'n', at: 0, width: 16, bottom: 0.6, top: 3.8, window: true }],
      },
      { id: 'elevator', x0: 6, x1: 10, z0: -9, z1: -5, y: 0, h: 3.4, openings: [{ side: 'w', at: -7, width: 2 }] },
    ];
    for (const r of rooms) b.room(r);
    // Ops consoles
    for (const x of [-7, -3.5, 3.5, 7]) {
      b.solid('dark', 2.6, 1, 1, x, 0.5, -53.8);
      kit.box('light', 2.4, 0.05, 0.6, { x, y: 1.03, z: -53.8 });
    }
    b.solid('dark', 3, 0.9, 1.6, 0, 0.45, -46);
    // Quarters: bunks, a plant someone kept alive
    for (let i = 0; i < 3; i++) b.solid('metal', 2, 0.5, 0.9, -8.8, 0.25 + (i % 2), -30 + i * 3);
    kit.cyl('plant', 0.25, 0.2, 0.5, { x: -3, y: 0.95, z: -21 }, undefined, 6);
    b.solid('dark', 0.8, 0.7, 0.8, -3, 0.35, -21);
    // Ceiling lights
    for (let z = -14; z > -40; z -= 4) kit.box('light', 0.3, 0.05, 1.6, { x: 0, y: 2.97, z });
    this.frame.add(kit.build({ castShadow: false }));
    // Lighting: emergency white with occasional flicker
    this.scene.add(new THREE.HemisphereLight('#cfe0ff', '#3a3f46', 0.35));
    const pl = (x: number, y: number, z: number, i = 60, d = 14, color = '#eaf2ff') => {
      const l = new THREE.PointLight(color, i, d, 1.6);
      l.position.set(x, y, z);
      this.frame.add(l);
      return l;
    };
    pl(0, 2.6, 1, 30);
    pl(0, 3, -7, 60);
    this.flicker.push(pl(0, 2.6, -20, 50), pl(0, 2.6, -33, 50));
    pl(-6, 2.6, -26, 40, 12, '#ffd9b0');
    pl(0, 3.8, -48, 90, 20);

    // View: the Moon below the ops window, Earth beyond.
    this.sky = new Sky({ seed: 13, radius: 5000 });
    this.sky.sunDir.set(0.75, 0.25, -0.35).normalize();
    this.scene.add(this.sky.group);
    const moon = createPlanet('moon', 1400, { segments: 128 });
    moon.group.position.set(300, -1700, -2600);
    const earth = createPlanet('earth', 120, { segments: 64 });
    earth.group.position.set(-900, 300, -3800);
    this.scene.add(moon.group, earth.group);
    this.planets.push(moon, earth);
    this.scope.add(() => {
      this.sky.dispose();
      this.planets.forEach((p) => p.dispose());
    });

    // Status screen: what happened
    const board = new ScreenDisplay(640, 360, 1.6, 0.9, (ctx, w, h) => {
      ScreenUI.bg(ctx, w, h, '#0a0f14');
      ScreenUI.title(ctx, 'HARBOR · station status');
      ScreenUI.status(ctx, 20, 80, 'Habitation Module 3: LOST', 'fault');
      ScreenUI.status(ctx, 20, 115, 'Main power: OFFLINE — emergency cells 31%', 'warn');
      ScreenUI.status(ctx, 20, 150, 'Life support: DEGRADED', 'warn');
      ScreenUI.status(ctx, 20, 185, 'Crew aboard: 2 of 9', 'fault');
      ScreenUI.status(ctx, 20, 220, 'Automatic restart: T+04:02:11 (no operator)', 'warn');
      ScreenUI.status(ctx, 20, 255, 'Long-range TX log: 1 burst, outbound, unscheduled', 'fault');
      ScreenUI.text(ctx, 'Docked: EXV LANTERN — port 1', 20, h - 20, '#3ee08f', 16);
    });
    board.mesh.position.set(0, 2.1, -39.9 - 0.02);
    board.mesh.rotation.y = Math.PI;
    board.mesh.position.z = -40.12;
    this.frame.add(board.mesh);
    this.scope.add(() => board.dispose());
    this.scannables.push({ entry: 'db.harbor', object: board.mesh, range: 10 });

    // Airlock back to the Lantern
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.2), new THREE.MeshStandardMaterial({ color: '#2b3038', emissive: '#3ee08f', emissiveIntensity: 0.5 }));
    hatch.position.set(0, 1.15, 3.85);
    this.frame.add(hatch);
    this.registerInteractable({
      id: 'harbor.toLantern', object: hatch, kind: 'door', prompt: () => 'Board the Lantern',
      interact: () => {
        game.audio.play('airlock');
        void game.locations.travel({ location: 'lantern.interior', spawn: 'airlock' }, { label: 'Crossing to the Lantern…' });
      },
    });
    // Spoke elevator (flavour + lore)
    const elev = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 2), new THREE.MeshStandardMaterial({ color: '#2b3038', emissive: '#ff5a3a', emissiveIntensity: 0.4 }));
    elev.position.set(9.8, 1.1, -7);
    this.frame.add(elev);
    this.registerInteractable({
      id: 'harbor.elevator', object: elev, kind: 'use', prompt: () => 'Spoke elevator to the hub',
      detail: () => 'LOCKED OUT — hub in microgravity, no power',
      interact: () => pushNotification('The elevator is locked out. The hub will have to wait for Act 2.', 'info'),
    });

    // Supply locker: resupply (once)
    const locker = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.6), stdMat('#8d959e', { metalness: 0.6 }));
    locker.position.set(-5.2, 1, -11.5);
    this.frame.add(locker);
    this.registerInteractable({
      id: 'harbor.locker', object: locker, kind: 'use', prompt: () => 'Station supply locker',
      available: () => !game.store.getEntity(this.id, 'locker', 'taken'),
      interact: () => {
        const st = game.store;
        st.batch('locker', () => {
          st.setEntity(this.id, 'locker', 'taken', true);
          st.give('o2canister', 2);
          st.give('medpatch', 2);
          st.give('powercell', 1);
        });
      },
    });

    this.spawns = { dock: { id: 'dock', position: new THREE.Vector3(0, 0.1, 2), yaw: 0 } };
    const spots: Record<string, Spot> = {
      'harbor.ops': { position: new THREE.Vector3(-3.5, 0, -52.5), yaw: Math.PI },
      'harbor.quarters': { position: new THREE.Vector3(-6, 0, -24), yaw: Math.PI / 2 },
      'harbor.table': { position: new THREE.Vector3(1.5, 0, -46), yaw: -Math.PI / 2 },
    };
    this.crew = new CrewRuntime(game, this, spots, (_x, _z, fb) => fb);
    this.scope.add(() => this.crew.dispose());
    this.crew.refresh();
  }

  override update(dt: number): void {
    this.t += dt;
    const cam = this.game.cam.camera;
    this.sky.update(cam.position, this.t, 1);
    for (const p of this.planets) p.update(this.t, this.sky.sunDir);
    this.crew.update(dt);
    for (const [i, l] of this.flicker.entries()) l.intensity = Math.sin(this.t * 13 + i * 7) > 0.93 ? 5 : 50;
  }

  override onStateChanged(): void {
    this.crew?.refresh();
  }

  override onEnter(): void {
    this.game.store.discover('harbor.interior');
  }
}
