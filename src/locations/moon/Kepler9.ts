import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { InteriorBuilder, type RoomDef } from '../lantern/interiorKit';
import { Rng } from '../../engine/Rng';
import { dampAngle } from '../../engine/math';
import { ScreenDisplay, ScreenUI } from '../../render/screen';
import { pushNotification, ui } from '../../ui/uiState';

interface Drone {
  id: string;
  group: THREE.Group;
  eye: THREE.MeshStandardMaterial;
  laser: THREE.Line;
  route: THREE.Vector3[];
  routeIdx: number;
  pos: THREE.Vector3;
  yaw: number;
  mode: 'patrol' | 'chase' | 'attack' | 'disabled';
  attackCd: number;
}

/**
 * Outpost Kepler-9 tunnels: an abandoned mining survey facility under the hill.
 * Contains the star tracker (main quest), the seismic logs (mystery), survey drones
 * whose unsupervised firmware treats people as ore (tool-based combat), and a cavity
 * that should not exist.
 */
export class Kepler9 extends Location {
  readonly id = 'moon.kepler9';
  readonly name = 'Outpost Kepler-9';
  readonly mode = 'foot' as const;
  private drones: Drone[] = [];
  private seamMat!: THREE.MeshStandardMaterial;
  private t = 0;
  private humTimer = 0;
  private builder!: InteriorBuilder;
  private frame = new THREE.Group();

  constructor(game: Game) {
    super(game, 1.62);
    this.env = { gravity: 1.62, atmosphere: 'vacuum', temperatureC: -40, radiation: 1, ambience: 'vacuum' };
    this.killY = -30;
    this.bounds = new THREE.Box3(new THREE.Vector3(-60, -20, -120), new THREE.Vector3(60, 20, 20));
  }

  async build(): Promise<void> {
    const game = this.game;
    const store = game.store;
    this.scene.background = new THREE.Color('#000');
    this.scene.add(this.frame);
    const mats = {
      floor: stdMat('#5e5a55', { roughness: 0.95 }),
      wall: stdMat('#6d6862', { roughness: 0.98 }),
      ceiling: stdMat('#4f4b47', { roughness: 0.98 }),
      trim: stdMat('#8a7a4e', { roughness: 0.5, metalness: 0.5 }),
      stripe: stdMat('#d9a13a', { emissive: '#d9a13a', emissiveIntensity: 0.2 }),
      glass: new THREE.MeshStandardMaterial({ color: '#9fb8c8', transparent: true, opacity: 0.15 }),
      metal: stdMat('#8d959e', { metalness: 0.7, roughness: 0.4 }),
      dark: stdMat('#2d3137'),
      lamp: new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffb347', emissiveIntensity: 1.6 }),
      black: new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.05, metalness: 1 }),
      rubble: stdMat('#5a5550'),
    };
    for (const m of Object.values(mats)) this.scope.own(m);
    const kit = new KitBuilder(mats);
    const b = (this.builder = new InteriorBuilder(kit, this.physics, this.frame));
    const rooms: RoomDef[] = [
      { id: 'tunnelA', x0: -2, x1: 2, z0: -30, z1: 5, y: 0, h: 3.2, openings: [{ side: 'n', at: 0, width: 3.2, top: 3 }] },
      { id: 'junction', x0: -9, x1: 9, z0: -44, z1: -30, y: 0, h: 4, openings: [{ side: 's', at: 0, width: 3.2, top: 3 }, { side: 'e', at: -37, width: 3, top: 3 }, { side: 'n', at: 0, width: 3.2, top: 3 }] },
      { id: 'tunnelB', x0: 9, x1: 30, z0: -39, z1: -35, y: 0, h: 3.2, openings: [{ side: 'w', at: -37, width: 3, top: 3 }, { side: 'e', at: -37, width: 3, top: 3 }] },
      { id: 'vault', x0: 30, x1: 44, z0: -48, z1: -26, y: 0, h: 4.5, openings: [{ side: 'w', at: -37, width: 3, top: 3 }] },
      { id: 'tunnelC', x0: -2, x1: 2, z0: -72, z1: -44, y: 0, h: 3.2, openings: [{ side: 's', at: 0, width: 3.2, top: 3 }, { side: 'n', at: 0, width: 3.2, top: 3 }] },
      { id: 'cavity', x0: -14, x1: 14, z0: -100, z1: -72, y: -2, h: 12, openings: [{ side: 's', at: 0, width: 3.2, bottom: 2, top: 5 }], wall: 'black', floor: 'black' },
    ];
    for (const r of rooms) b.room(r);
    // Step down into the cavity
    b.solid('rubble', 4, 1, 3, 0, -1.5, -73.5);
    // Mining frame arches every 4 m in tunnels
    for (let z = 2; z > -30; z -= 4) this.arch(kit, 0, z, 4, 3.2, true);
    for (let z = -46; z > -72; z -= 4) this.arch(kit, 0, z, 4, 3.2, true);
    for (let x = 12; x < 30; x += 4) this.arch(kit, x, -37, 4, 3.2, false);
    // Rubble from the partial collapse in tunnel C
    const rng = new Rng(19);
    for (let i = 0; i < 14; i++) {
      const s = rng.range(0.3, 0.9);
      kit.add('rubble', new THREE.IcosahedronGeometry(s, 0), { x: rng.range(-1.7, 1.7), y: s * 0.5, z: rng.range(-66, -58) }, [rng.next(), rng.next(), rng.next()]);
    }
    b.collider(1.2, 1, 3, -1.2, 0.5, -62);
    // Lamps (RTG-powered, dim amber — someone left the lights on)
    const lamp = (x: number, y: number, z: number, dist = 14) => {
      kit.box('lamp', 0.5, 0.12, 0.25, { x, y, z });
      const l = new THREE.PointLight('#ffb347', 30, dist, 1.8);
      l.position.set(x, y - 0.3, z);
      this.frame.add(l);
    };
    for (const z of [0, -12, -24]) lamp(0, 3.1, z);
    lamp(-5, 3.9, -37, 16);
    lamp(5, 3.9, -37, 16);
    lamp(20, 3.1, -37);
    lamp(37, 4.4, -37, 20);
    lamp(0, 3.1, -50);
    // Junction: storage racks and workbench
    for (let i = 0; i < 3; i++) b.solid('metal', 0.8, 2.6, 3, -8.2, 1.3, -41 + i * 3.2);
    b.solid('dark', 3, 0.9, 1.2, 6.5, 0.45, -42.8);
    // Vault: seismometer pillars
    for (let i = 0; i < 6; i++) {
      const x = 33 + (i % 3) * 4.5, z = -44 + Math.floor(i / 3) * 12;
      kit.cyl('metal', 0.5, 0.6, 1.4, { x, y: 0.7, z }, undefined, 10);
      kit.cyl('dark', 0.55, 0.55, 0.1, { x, y: 1.45, z }, undefined, 10);
    }
    b.solid('dark', 2.5, 1.8, 1.2, 42.5, 0.9, -37);
    // The cavity: a smooth seam of faint violet light in the black wall
    this.seamMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#6a4cff', emissiveIntensity: 1.2 });
    this.scope.own(this.seamMat);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 9, 0.2), this.seamMat);
    seam.position.set(0, 3, -99.7);
    this.frame.add(seam);
    const seamH = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 0.2), this.seamMat);
    seamH.position.set(0, 7.5, -99.7);
    this.frame.add(seamH);
    const glow = new THREE.PointLight('#6a4cff', 40, 30, 1.5);
    glow.position.set(0, 4, -96);
    this.frame.add(glow);
    this.frame.add(kit.build({ castShadow: false }));
    this.scene.add(new THREE.HemisphereLight('#8a7a6a', '#1a1816', 0.12));

    /* ------------------------------ Items ------------------------------ */
    const pickup = (id: string, item: string, pos: THREE.Vector3, color: string, prompt: string, onTake?: () => void) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, metalness: 0.5 }));
      m.position.copy(pos);
      this.frame.add(m);
      this.registerInteractable({
        id,
        object: m,
        kind: 'pickup',
        prompt: () => prompt,
        available: () => !store.getEntity(this.id, id, 'taken'),
        interact: () => {
          store.batch('pickup', () => {
            store.setEntity(this.id, id, 'taken', true);
            store.give(item, 1);
          });
          m.visible = false;
          onTake?.();
        },
      });
      if (store.getEntity(this.id, id, 'taken')) m.visible = false;
    };
    pickup('tracker', 'startracker', new THREE.Vector3(-8.2, 1.7, -41), '#a29bfe', 'Take the survey star tracker', () => game.audio.play('pickup'));
    pickup('quakelog', 'quakelog', new THREE.Vector3(42.5, 2.0, -37), '#dfe6e9', 'Pull the seismic data core', () => {
      pushNotification('The core’s index is labelled PERIODIC EVENTS — DO NOT TRANSMIT.', 'discovery');
    });
    pickup('supplies', 'o2canister', new THREE.Vector3(6.5, 1.1, -42.8), '#7fd3ff', 'Take an oxygen canister');

    // Terminal: last log entry
    const term = new ScreenDisplay(512, 320, 0.9, 0.56, (ctx, w, h) => {
      ScreenUI.bg(ctx, w, h, '#1a1206');
      ScreenUI.title(ctx, 'KEPLER-9 · OPS LOG', 18, 36, '#ffb347');
      const lines = [
        'Day 1041. Periodic events continue. 1,969 s.',
        'Directorate says: stop transmitting the data.',
        'Day 1043. Drill 4 broke into a void at -38 m.',
        'Walls are smooth. Nothing reflects. Nobody',
        'wants to go down there again.',
        'Day 1044. Evacuation ordered. Leave the lights on.',
      ];
      lines.forEach((l, i) => ScreenUI.text(ctx, l, 18, 80 + i * 36, '#f3dcb0', 18));
    });
    term.mesh.position.set(6.5, 1.6, -43.3);
    this.frame.add(term.mesh);
    this.scope.add(() => term.dispose());
    this.registerInteractable({
      id: 'k9.terminal', object: term.mesh, kind: 'use', prompt: () => 'Read the operations log',
      interact: () => {
        store.batch('k9log', () => {
          store.setFlag('k9.log.read', true);
          store.discover('lore.k9.void');
        });
        game.audio.play('beep');
        pushNotification('Kepler-9 was abandoned three days after its drill broke into something at 38 metres.', 'discovery');
      },
    });

    // Scannables
    const seismoProxy = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 20), new THREE.MeshBasicMaterial({ visible: false }));
    seismoProxy.position.set(37, 1.5, -37);
    this.frame.add(seismoProxy);
    this.scannables.push({ entry: 'db.seismometer', object: seismoProxy, range: 20 });
    const cavityProxy = new THREE.Mesh(new THREE.BoxGeometry(26, 10, 2), new THREE.MeshBasicMaterial({ visible: false }));
    cavityProxy.position.set(0, 3, -99);
    this.frame.add(cavityProxy);
    this.scannables.push({ entry: 'db.cavity', object: cavityProxy, range: 40 });
    this.registerInteractable({
      id: 'cavity.wall', object: seam, kind: 'use', range: 3,
      prompt: () => 'Touch the seam',
      interact: () => {
        game.cam.addShake(0.6);
        game.audio.play('powerDown');
        game.audio.stinger('danger');
        store.setFlag('cavity.touched', true);
        ui.fadeColor.value = '#2a1a66';
        void game.fadeTo(0.7, 0.1).then(() => game.fadeTo(0, 1.5));
        pushNotification('For a heartbeat every suit readout shows the same number: 1969.', 'discovery');
      },
    });

    /* ------------------------------ Drones ----------------------------- */
    this.addDrone('drone.0', [new THREE.Vector3(-5, 0, -34), new THREE.Vector3(5, 0, -34), new THREE.Vector3(5, 0, -41), new THREE.Vector3(-5, 0, -41)]);
    this.addDrone('drone.1', [new THREE.Vector3(33, 0, -30), new THREE.Vector3(41, 0, -30), new THREE.Vector3(41, 0, -45), new THREE.Vector3(33, 0, -45)]);
    this.addDrone('drone.2', [new THREE.Vector3(0, 0, -48), new THREE.Vector3(0, 0, -56)]);

    this.spawns = {
      entrance: { id: 'entrance', position: new THREE.Vector3(0, 0.1, 2), yaw: 0 },
    };
    // Exit door
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, 0.3), new THREE.MeshStandardMaterial({ color: '#1c1f24', emissive: '#00cec9', emissiveIntensity: 0.3 }));
    door.position.set(0, 1.5, 4.8);
    this.frame.add(door);
    this.registerInteractable({
      id: 'k9.exit', object: door, kind: 'door', prompt: () => 'Return to the surface',
      interact: () => void game.locations.travel({ location: 'moon.south', spawn: 'k9.door' }, { label: 'Climbing out of Kepler-9…' }),
    });
  }

  private arch(kit: KitBuilder, x: number, z: number, w: number, h: number, alongZ: boolean): void {
    if (alongZ) {
      kit.box('trim', 0.2, h, 0.25, { x: x - w / 2 + 0.2, y: h / 2, z });
      kit.box('trim', 0.2, h, 0.25, { x: x + w / 2 - 0.2, y: h / 2, z });
      kit.box('trim', w, 0.2, 0.25, { x, y: h - 0.2, z });
    } else {
      kit.box('trim', 0.25, h, 0.2, { x, y: h / 2, z: z - w / 2 + 0.2 });
      kit.box('trim', 0.25, h, 0.2, { x, y: h / 2, z: z + w / 2 - 0.2 });
      kit.box('trim', 0.25, 0.2, w, { x, y: h - 0.2, z });
    }
  }

  private addDrone(id: string, route: THREE.Vector3[]): void {
    const store = this.game.store;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.4), new THREE.MeshStandardMaterial({ color: '#c9a23a', roughness: 0.6, metalness: 0.3 }));
    body.position.y = 0.55;
    const tread = new THREE.MeshStandardMaterial({ color: '#222' });
    for (const x of [-0.6, 0.6]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 1.5), tread);
      t.position.set(x, 0.2, 0);
      g.add(t);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: '#2d3137' }));
    head.position.set(0, 0.95, 0.35);
    const eye = new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff3b30', emissiveIntensity: 2 });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eye);
    lens.position.set(0, 0.95, 0.62);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), new THREE.MeshStandardMaterial({ color: '#8d959e', metalness: 0.8 }));
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0.35, 0.7, 0.9);
    g.add(body, head, lens, arm);
    const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: '#ff5a3a' }));
    laser.visible = false;
    laser.frustumCulled = false;
    this.scene.add(laser);
    this.frame.add(g);
    const drone: Drone = { id, group: g, eye, laser, route, routeIdx: 0, pos: route[0].clone(), yaw: 0, mode: store.getEntity(this.id, id, 'disabled') ? 'disabled' : 'patrol', attackCd: 0 };
    this.drones.push(drone);
    g.position.copy(drone.pos);
    this.scannables.push({ entry: 'db.drone', object: g, range: 20 });
    this.toolTargets.push({
      id,
      object: g,
      action: 'cut',
      label: 'Survey drone — override firmware',
      range: 3.5,
      workTime: 2.2,
      available: () => drone.mode !== 'disabled',
      detail: () => 'Hold the multi-tool on its control head',
      onComplete: () => {
        drone.mode = 'disabled';
        store.setEntity(this.id, id, 'disabled', true);
        store.setFlag('stat.drones', ((store.state.flags['stat.drones'] as number) ?? 0) + 1);
        this.game.audio.play('powerDown', 0.7);
        pushNotification('Drone firmware overridden. It powers down.', 'info');
        store.grant(`drone.salvage.${id}`, [{ give: 'electronics', qty: 2 }, { give: 'circuit', qty: 1 }]);
      },
    });
  }

  override update(dt: number): void {
    this.t += dt;
    this.seamMat.emissiveIntensity = 0.8 + Math.sin(this.t * (Math.PI * 2) / 3.2) * 0.5;
    const player = this.game.player;
    const pp = player.position;
    for (const d of this.drones) {
      if (d.mode === 'disabled') {
        d.eye.emissiveIntensity = 0;
        d.laser.visible = false;
        d.group.position.copy(d.pos);
        continue;
      }
      const toP = pp.clone().sub(d.pos);
      toP.y = 0;
      const dist = toP.length();
      const sees = dist < 12 && this.lineOfSight(d.pos, pp);
      if (d.mode === 'patrol' && sees) {
        d.mode = 'chase';
        this.game.audio.play('alarm', 0.3);
      }
      if (d.mode !== 'patrol' && (dist > 22 || !this.lineOfSight(d.pos, pp) && dist > 8)) d.mode = 'patrol';
      let target: THREE.Vector3;
      let speed = 1.2;
      if (d.mode === 'patrol') {
        target = d.route[d.routeIdx];
        if (d.pos.distanceTo(target) < 0.4) d.routeIdx = (d.routeIdx + 1) % d.route.length;
      } else {
        target = pp.clone();
        speed = 2.1;
        d.mode = dist < 2.4 ? 'attack' : 'chase';
      }
      const dir = target.clone().sub(d.pos);
      dir.y = 0;
      if (d.mode !== 'attack' && dir.length() > 0.05) {
        dir.normalize();
        d.pos.addScaledVector(dir, speed * dt);
        d.yaw = dampAngle(d.yaw, Math.atan2(dir.x, dir.z), 5, dt);
      } else if (d.mode === 'attack') {
        d.yaw = dampAngle(d.yaw, Math.atan2(toP.x, toP.z), 8, dt);
      }
      d.group.position.copy(d.pos);
      d.group.rotation.y = d.yaw;
      d.eye.emissiveIntensity = d.mode === 'patrol' ? 1.2 : 3 + Math.sin(this.t * 20);
      // Attack: sampling cutter
      d.attackCd -= dt;
      if (d.mode === 'attack') {
        const from = d.pos.clone().add(new THREE.Vector3(Math.sin(d.yaw) * 0.9, 0.7, Math.cos(d.yaw) * 0.9));
        const to = player.head().add(new THREE.Vector3(0, -0.6, 0));
        const pos = d.laser.geometry.getAttribute('position') as THREE.BufferAttribute;
        pos.setXYZ(0, from.x, from.y, from.z);
        pos.setXYZ(1, to.x, to.y, to.z);
        pos.needsUpdate = true;
        d.laser.visible = Math.sin(this.t * 30) > -0.3;
        if (d.attackCd <= 0) {
          d.attackCd = 0.5;
          const s = this.game.store.state.player;
          s.health = Math.max(0, s.health - 6);
          this.game.audio.play('hurt', 0.5);
          this.game.cam.addShake(0.12);
          this.glowParticles.emit({ count: 8, position: to, velocity: new THREE.Vector3(0, 1, 0), spread: 1.5, life: [0.2, 0.5], size: 0.05, color: '#ff8a5a', gravity: 1.62 });
        }
      } else d.laser.visible = false;
    }
    // Low hum near the cavity, pulsing slowly
    this.humTimer -= dt;
    if (this.humTimer <= 0 && pp.z < -60) {
      this.humTimer = 3.2;
      this.game.audio.play('powerDown', 0.25);
    }
  }

  private lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const from = a.clone().add(new THREE.Vector3(0, 1, 0));
    const to = b.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = to.clone().sub(from);
    const len = dir.length();
    const hit = this.physics.raycast(from, dir.normalize(), len);
    return hit === null || hit > len - 0.5;
  }

  override temperatureAt(pos: THREE.Vector3): number {
    return pos.z < -72 ? -120 : -40;
  }

  override onEnter(): void {
    void this.builder;
  }
}
