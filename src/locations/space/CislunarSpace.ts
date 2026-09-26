import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';
import { FlightModel } from '../../gameplay/flight';
import { buildLantern, type LanternModel } from '../../procgen/lanternShip';
import { buildHarbor, type HarborModel } from '../../procgen/harborStation';
import { createPlanet, type PlanetHandle } from '../../render/planets';
import { Sky } from '../../render/sky';
import { ScreenDisplay, ScreenUI } from '../../render/screen';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { rockGeometry } from '../../procgen/rocks';
import { Rng } from '../../engine/Rng';
import { damp } from '../../engine/math';
import { ui, pushNotification, type FlightHud } from '../../ui/uiState';
import type { CameraView } from '../../state/GameState';

/** Local zone metres → background kilometres. */
const KM = 1 / 1000;
/** The zone origin sits 25 km above the lunar south polar region. */
const ORIGIN_ALT_KM = 25;
const MOON_R = 1737.4;
const HARBOR_POS = new THREE.Vector3(2600, 900, -16000);

interface Target {
  id: string;
  label: string;
  position: () => THREE.Vector3;
  scan?: string;
}

/**
 * Lunar orbit space zone (flight mode). Two render layers: the background layer holds the
 * Moon and Earth at true angular sizes in kilometre units; the foreground holds the ship,
 * Harbor Station and debris in metres. Space is a place: you can scan, salvage, dock,
 * descend to the base, and leave the pilot's seat to walk the ship.
 */
export class CislunarSpace extends Location {
  readonly id = 'space.cislunar';
  readonly name = 'Lunar Orbit';
  readonly mode = 'flight' as const;
  private flight = new FlightModel();
  private ship!: LanternModel;
  private harbor!: HarborModel;
  private bgScene = new THREE.Scene();
  private bgCam = new THREE.PerspectiveCamera(70, 1, 0.05, 200000);
  private moon!: PlanetHandle;
  private earth!: PlanetHandle;
  private sky!: Sky;
  private sunDir = new THREE.Vector3(0.75, 0.25, -0.35).normalize();
  private view: CameraView = 'back';
  private camPos = new THREE.Vector3();
  private targets: Target[] = [];
  private targetIdx = 0;
  private cockpit = new THREE.Group();
  private cockpitScreen!: ScreenDisplay;
  private t = 0;
  private saveTimer = 0;
  private docking: { t: number; from: THREE.Vector3; fromQ: THREE.Quaternion } | null = null;
  private busy = false;
  private salvage: { id: string; mesh: THREE.Object3D }[] = [];
  private engine: { set(t: number): void } | null = null;
  private screenTimer = 0;

  constructor(game: Game) {
    super(game, 0);
    this.env = { gravity: 0, atmosphere: 'vacuum', temperatureC: -100, radiation: 1.5, ambience: 'space' };
  }

  async build(): Promise<void> {
    const game = this.game;
    const s = game.store.state;
    this.scene.background = null;
    // ---- Background layer (km)
    this.sky = new Sky({ seed: 31, radius: 150000, starCount: 9000, earth: false });
    this.sky.sunDir.copy(this.sunDir);
    this.bgScene.add(this.sky.group);
    this.bgScene.background = new THREE.Color('#000');
    this.moon = createPlanet('moon', MOON_R, { segments: 192 });
    this.bgScene.add(this.moon.group);
    this.earth = createPlanet('earth', 637.1, { segments: 128 });
    // Earth is ~10× closer than real at 1/10 size: identical angular size, no depth issues.
    this.earth.group.position.set(-26000, 9000, -26000).setLength(38440);
    this.earth.group.rotation.set(0.4, 1.2, 0);
    this.bgScene.add(this.earth.group);
    this.scope.add(() => {
      this.sky.dispose();
      this.moon.dispose();
      this.earth.dispose();
    });

    // ---- Foreground layer (m)
    const sun = new THREE.DirectionalLight('#fff6ea', 3.4);
    sun.position.copy(this.sunDir).multiplyScalar(1000);
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight('#20324a', '#8a8782', 0.35));
    this.ship = buildLantern({ damaged: false, power: 1, landed: false });
    this.scene.add(this.ship.group);
    this.scope.add(() => this.ship.dispose());
    this.harbor = buildHarbor();
    this.harbor.group.position.copy(HARBOR_POS);
    this.harbor.group.rotation.set(0.1, 0.4, 0);
    this.scene.add(this.harbor.group);
    this.scope.add(() => this.harbor.dispose());
    this.buildDebris();
    this.buildCockpit();

    // ---- Targets
    this.targets = [
      { id: 'harbor', label: 'Harbor Station', position: () => this.harborDock(), scan: 'db.harbor' },
      { id: 'base', label: 'Base Camp (surface)', position: () => this.flight.position.clone().add(new THREE.Vector3(0, -ORIGIN_ALT_KM * 1000 - this.flight.position.y, 0)), scan: 'db.moon' },
      ...this.salvage.map((sv) => ({ id: sv.id, label: 'Cargo canister', position: () => sv.mesh.position.clone(), scan: 'db.salvage' })),
    ];

    // ---- Initial ship state from parking
    const p = s.ship.parking;
    if (p.kind === 'space') {
      this.flight.position.set(...p.position);
      this.flight.quaternion.set(...p.quat);
    }
    this.spawns = {
      launch: { id: 'launch', position: new THREE.Vector3(0, 0, 0), yaw: 0 },
      helm: { id: 'helm', position: this.flight.position.clone(), yaw: 0 },
      undock: { id: 'undock', position: this.harborDock().add(new THREE.Vector3(0, 0, 250)), yaw: 0 },
    };
    this.view = s.player.cameraView === 'first' ? 'first' : 'back';
  }

  harborDock(): THREE.Vector3 {
    this.harbor.group.updateMatrixWorld(true);
    return this.harbor.dockPoint.clone().applyMatrix4(this.harbor.group.matrixWorld);
  }

  override onEnter(): void {
    const game = this.game;
    const s = game.store.state;
    // Spawn resolution for flight: launch → point toward Harbor; undock → back off the port.
    const spawn = s.player.spawnId;
    if (spawn === 'launch') {
      this.flight.position.set(0, 0, 0);
      this.lookAtTarget(HARBOR_POS);
    } else if (spawn === 'undock') {
      this.flight.position.copy(this.spawns.undock.position);
      this.lookAtTarget(HARBOR_POS.clone().add(new THREE.Vector3(0, 0, 3000)));
      this.flight.velocity.set(0, 0, 0);
    }
    game.renderer.setBackground(this.bgScene, this.bgCam);
    this.scope.add(() => game.renderer.setBackground(null, null));
    game.cam.camera.far = 120000;
    this.scope.add(() => {
      game.cam.camera.far = 20000;
      ui.markers.value = [];
    });
    this.engine = game.audio.engine(true);
    this.scope.add(() => game.audio.engine(false));
    game.input.setBase('flight');
    game.store.discover('moon.orbit');
    if (!s.flags['hint.flight']) {
      game.store.setFlag('hint.flight', true);
      ui.hint.value = 'Flight: mouse steers · W/S throttle · A/D/Space/C strafe · Q/E roll · Shift boost · Z flight assist · V view · T target · G dock/land · X leave the seat.';
      setTimeout(() => (ui.hint.value = null), 12000);
    }
    this.updateCamera(1);
  }

  private lookAtTarget(p: THREE.Vector3): void {
    const m = new THREE.Matrix4().lookAt(this.flight.position, p, new THREE.Vector3(0, 1, 0));
    this.flight.quaternion.setFromRotationMatrix(m);
  }

  private buildDebris(): void {
    const rng = new Rng(88);
    const geo = rockGeometry(4, 0, 0.3);
    const mat = stdMat('#8f969e', { metalness: 0.6, roughness: 0.4 });
    this.scope.own(geo);
    this.scope.own(mat);
    const n = 260;
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.4, 0.4), rng.range(-1, 1)).normalize();
      const pos = HARBOR_POS.clone().addScaledVector(dir, rng.range(160, 900));
      const sc = rng.range(0.5, 3.5);
      m.compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.next() * 6, rng.next() * 6, 0)), new THREE.Vector3(sc * 2, sc * 0.3, sc));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    this.scene.add(im);
    // Salvageable cargo canisters (persistent)
    const store = this.game.store;
    for (let i = 0; i < 3; i++) {
      const id = `canister.${i}`;
      const k = new KitBuilder({ c: stdMat('#d6dbe0', { roughness: 0.5 }), a: stdMat('#3fa9f5', { emissive: '#3fa9f5', emissiveIntensity: 0.8 }) });
      k.cyl('c', 1.6, 1.6, 5, { x: 0, y: 0, z: 0 }, [Math.PI / 2, 0, 0], 12);
      k.cyl('a', 1.65, 1.65, 0.4, { x: 0, y: 0, z: 1.8 }, [Math.PI / 2, 0, 0], 12);
      const g = k.build();
      g.position.copy(HARBOR_POS).add(new THREE.Vector3(-400 + i * 350, 120 - i * 90, 600 + i * 180));
      g.rotation.set(i, i * 2, 0);
      this.scene.add(g);
      if (store.getEntity(this.id, id, 'taken')) g.visible = false;
      this.salvage.push({ id, mesh: g });
    }
  }

  private buildCockpit(): void {
    const k = new KitBuilder({
      frame: stdMat('#2a2f36', { roughness: 0.6, metalness: 0.3 }),
      dash: stdMat('#1b1f24', { roughness: 0.7 }),
      trim: stdMat('#ff8a3d', { emissive: '#ff8a3d', emissiveIntensity: 0.3 }),
    });
    // Canopy struts around the view
    k.box('frame', 0.12, 1.6, 0.12, { x: -1.3, y: 0.3, z: -1.2 }, [0, 0, 0.35]);
    k.box('frame', 0.12, 1.6, 0.12, { x: 1.3, y: 0.3, z: -1.2 }, [0, 0, -0.35]);
    k.box('frame', 3.2, 0.12, 0.12, { x: 0, y: 0.95, z: -1.3 });
    k.box('dash', 3.4, 0.6, 0.9, { x: 0, y: -0.85, z: -1.1 }, [0.35, 0, 0]);
    k.box('trim', 3.42, 0.03, 0.05, { x: 0, y: -0.55, z: -1.5 });
    this.cockpit.add(k.build({ castShadow: false }));
    this.cockpitScreen = new ScreenDisplay(512, 200, 0.9, 0.35, (ctx, w, h) => {
      ScreenUI.bg(ctx, w, h, '#04090d');
      const f = this.flight;
      ScreenUI.text(ctx, `${f.speed.toFixed(0)} m/s`, 16, 50, '#9fe8ff', 30, true);
      ScreenUI.text(ctx, `THR ${(f.throttle * 100).toFixed(0)}%  ${f.assist ? 'ASSIST' : 'MANUAL'}`, 16, 90, '#cfe9f2', 18);
      const t = this.targets[this.targetIdx];
      if (t) ScreenUI.text(ctx, `${t.label} · ${(t.position().distanceTo(f.position) / 1000).toFixed(2)} km`, 16, 130, '#ffb347', 18);
      ScreenUI.text(ctx, `PROP ${Math.round(this.game.store.state.ship.propellant)} kg`, 16, 170, '#7d8a96', 16);
    });
    this.cockpitScreen.mesh.position.set(0, -0.55, -1.25);
    this.cockpitScreen.mesh.rotation.x = -0.35;
    this.cockpit.add(this.cockpitScreen.mesh);
    this.scene.add(this.cockpit);
    this.scope.add(() => this.cockpitScreen.dispose());
  }

  /* ------------------------------------------------------------------ */

  override update(dt: number): void {
    const game = this.game;
    const input = game.input;
    const s = game.store.state;
    this.t += dt;
    if (!this.docking && !this.busy) {
      const mouse = input.context === 'flight' ? input.consumeMouse() : { dx: 0, dy: 0 };
      this.flight.controlEnabled = input.context === 'flight';
      const hasProp = s.ship.propellant > 0.5;
      this.flight.update(dt, input, mouse, input.sensitivity * game.settings.sensitivity, hasProp);
      if (this.flight.burned > 0) {
        s.ship.propellant = Math.max(0, s.ship.propellant - this.flight.burned);
      }
      if (input.justPressed('cycleView', 'flight')) {
        this.view = this.view === 'first' ? 'back' : this.view === 'back' ? 'front' : 'first';
        pushNotification(`View: ${this.view === 'first' ? 'Cockpit (first person)' : this.view === 'back' ? 'Chase (behind)' : 'Chase (front)'}`);
      }
      if (input.justPressed('target', 'flight')) this.targetIdx = (this.targetIdx + 1) % this.targets.length;
      if (input.justPressed('exitSeat', 'flight')) void this.leaveSeat();
      if (input.justPressed('dock', 'flight')) this.tryDockOrLand();
      if (input.justPressed('scan', 'flight')) this.scanTarget();
      this.collide();
    } else if (this.docking) {
      this.updateDocking(dt);
    }
    // Ship transform
    this.ship.group.position.copy(this.flight.position).add(new THREE.Vector3(0, -8, 0).applyQuaternion(this.flight.quaternion));
    this.ship.group.quaternion.copy(this.flight.quaternion);
    this.ship.setEngine(this.flight.boosting ? 1 : Math.max(0, this.flight.throttle) * 0.6);
    this.engine?.set(this.flight.boosting ? 1 : Math.abs(this.flight.throttle) * 0.6);
    this.harbor.ring.rotation.z += dt * 0.02;
    this.harbor.setBeacon(true, this.t);
    this.updateCamera(dt);
    // Background layer camera
    const bgPos = new THREE.Vector3(this.flight.position.x * KM, MOON_R + ORIGIN_ALT_KM + this.flight.position.y * KM, this.flight.position.z * KM);
    this.bgCam.position.copy(bgPos);
    this.bgCam.quaternion.copy(game.cam.camera.quaternion);
    this.bgCam.fov = game.cam.camera.fov;
    this.bgCam.aspect = game.cam.camera.aspect;
    this.bgCam.near = 0.05;
    this.bgCam.updateProjectionMatrix();
    this.sky.update(this.bgCam.position, this.t, 1);
    this.moon.update(this.t, this.sunDir);
    this.earth.update(this.t, this.sunDir);
    // Flags & autosave position
    const dHarbor = this.flight.position.distanceTo(HARBOR_POS);
    if (dHarbor < 2500 && !s.flags['harbor.approached']) {
      game.store.setFlag('harbor.approached', true);
      game.showLocationTitle('Harbor Station', 'Dark. Tumbling. Its beacon is blinking.');
      game.audio.stinger('arrival');
      game.store.discover('harbor');
    }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 1;
      this.persistParking();
    }
    this.updateMarkers();
    this.screenTimer -= dt;
    if (this.view === 'first' && this.screenTimer <= 0) {
      this.screenTimer = 0.2;
      this.cockpitScreen.redraw(this.t);
    }
  }

  private persistParking(): void {
    const s = this.game.store.state;
    const p = this.flight.position;
    const q = this.flight.quaternion;
    s.ship.parking = { kind: 'space', locationId: this.id, position: [p.x, p.y, p.z], quat: [q.x, q.y, q.z, q.w] };
  }

  private updateCamera(dt: number): void {
    const cam = this.game.cam.camera;
    const f = this.flight;
    const q = f.quaternion;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.view === 'first') {
      pos = f.position.clone().add(new THREE.Vector3(0, 3.2, -38).applyQuaternion(q));
      look = pos.clone().add(f.forward().multiplyScalar(100));
      this.camPos.copy(pos);
    } else if (this.view === 'back') {
      pos = f.position.clone().add(new THREE.Vector3(0, 32, 135).applyQuaternion(q));
      look = f.position.clone().add(f.forward().multiplyScalar(60));
      this.camPos.lerp(pos, dt >= 1 ? 1 : damp(6, dt));
    } else {
      pos = f.position.clone().add(new THREE.Vector3(0, 16, -170).applyQuaternion(q));
      look = f.position.clone();
      this.camPos.lerp(pos, dt >= 1 ? 1 : damp(6, dt));
    }
    cam.position.copy(this.camPos);
    cam.up.copy(f.up());
    cam.lookAt(look);
    cam.fov = this.game.settings.fov + (f.boosting ? 8 : 0);
    cam.updateProjectionMatrix();
    cam.up.set(0, 1, 0);
    this.cockpit.visible = this.view === 'first';
    this.cockpit.position.copy(cam.position);
    this.cockpit.quaternion.copy(cam.quaternion);
    this.ship.group.visible = this.view !== 'first';
  }

  private collide(): void {
    const game = this.game;
    this.harbor.group.updateMatrixWorld(true);
    for (const c of this.harbor.colliders) {
      const center = c.center.clone().applyMatrix4(this.harbor.group.matrixWorld);
      const r = c.radius + 30;
      const d = this.flight.position.distanceTo(center);
      if (d < r) {
        const n = this.flight.position.clone().sub(center).normalize();
        this.flight.position.copy(center).addScaledVector(n, r);
        const vn = this.flight.velocity.dot(n);
        if (vn < 0) {
          this.flight.velocity.addScaledVector(n, -vn * 1.5);
          const impact = -vn;
          if (impact > 15) {
            game.store.state.ship.hull = Math.max(0.05, game.store.state.ship.hull - impact * 0.0008);
            game.cam.addShake(Math.min(1, impact / 60));
            game.audio.play('impact', Math.min(1, impact / 80));
            pushNotification(`Collision! Hull ${(game.store.state.ship.hull * 100).toFixed(0)}%`, 'warn');
          }
        }
      }
    }
    // Minimum altitude above the lunar surface (automatic pull-up)
    const altM = ORIGIN_ALT_KM * 1000 + this.flight.position.y;
    if (altM < 1500) {
      this.flight.position.y = -ORIGIN_ALT_KM * 1000 + 1500;
      if (this.flight.velocity.y < 0) this.flight.velocity.y = 0;
    }
  }

  private scanTarget(): void {
    const t = this.targets[this.targetIdx];
    const game = this.game;
    if (!t?.scan) return;
    const d = t.position().distanceTo(this.flight.position);
    if (d > 8000 && t.id !== 'base') {
      pushNotification('Out of scanner range (8 km)', 'warn');
      return;
    }
    const s = game.store.state;
    game.audio.play('scanDone');
    if (!s.database[t.scan]) {
      s.database[t.scan] = { at: s.clock };
      game.store.markChanged('scan');
      pushNotification(`Database: ${game.store.content.database[t.scan]?.title}`, 'discovery');
    } else pushNotification(`${t.label}: already catalogued`);
  }

  private tryDockOrLand(): void {
    const game = this.game;
    const dock = this.harborDock();
    const d = dock.distanceTo(this.flight.position);
    if (d < 400 && this.flight.speed < 60) {
      this.docking = { t: 0, from: this.flight.position.clone(), fromQ: this.flight.quaternion.clone() };
      this.flight.hold();
      game.audio.play('thruster');
      game.story.cinematicActive = true;
      return;
    }
    // Salvage canisters
    for (const sv of this.salvage) {
      if (!sv.mesh.visible) continue;
      if (sv.mesh.position.distanceTo(this.flight.position) < 220) {
        const store = game.store;
        store.batch('salvage', () => {
          store.setEntity(this.id, sv.id, 'taken', true);
          store.give('electronics', 4, 'ship.cargo');
          store.give('scrap', 6, 'ship.cargo');
          store.give('powercell', 1, 'ship.cargo');
        });
        sv.mesh.visible = false;
        game.audio.play('pickup');
        pushNotification('Cargo canister tractored into the hold: electronics, scrap, a power cell (ship cargo).', 'item');
        return;
      }
    }
    const altM = ORIGIN_ALT_KM * 1000 + this.flight.position.y;
    if (altM < 4000) {
      void this.land();
      return;
    }
    pushNotification(d < 1500 ? 'Slow down and close to 400 m of the docking port to dock.' : 'Nothing to dock with. Descend below 4 km to land at base camp.', 'warn');
  }

  private updateDocking(dt: number): void {
    const game = this.game;
    const dk = this.docking!;
    dk.t += dt / 6;
    const dock = this.harborDock();
    this.harbor.group.updateMatrixWorld(true);
    const dir = this.harbor.dockDir.clone().transformDirection(this.harbor.group.matrixWorld);
    const final = dock.clone().addScaledVector(dir, 70);
    const k = Math.min(1, dk.t);
    const e = k * k * (3 - 2 * k);
    this.flight.position.copy(dk.from).lerp(final, e);
    const targetQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(final, dock, new THREE.Vector3(0, 1, 0)));
    this.flight.quaternion.copy(dk.fromQ).slerp(targetQ, e);
    if (k >= 1 && !this.busy) {
      this.busy = true;
      game.audio.play('impact', 0.3);
      game.cam.addShake(0.3);
      const store = game.store;
      store.batch('dock', () => {
        store.setFlag('harbor.docked', true);
        store.state.ship.parking = { kind: 'docked', locationId: 'harbor.interior', portId: 'dock' };
      });
      game.story.cinematicActive = false;
      void game.locations.travel({ location: 'harbor.interior', spawn: 'dock' }, { label: 'Docking clamps engaged. Equalizing pressure…' });
    }
  }

  private async land(): Promise<void> {
    const game = this.game;
    this.busy = true;
    const store = game.store;
    store.state.ship.parking = { kind: 'surface', locationId: 'moon.south' };
    store.markChanged('land');
    await game.locations.travel({ location: 'moon.south', spawn: 'ramp' }, { label: 'Descending to base camp… touchdown.' });
  }

  private async leaveSeat(): Promise<void> {
    const game = this.game;
    if (this.flight.speed > 30) {
      pushNotification('Slow below 30 m/s before leaving the seat (autopilot will hold position).', 'warn');
      return;
    }
    this.flight.hold();
    this.persistParking();
    this.busy = true;
    await game.locations.travel({ location: 'lantern.interior', spawn: 'pilot' }, { label: 'Autopilot: station-keeping. Unbuckling…', fadeTime: 0.3 });
  }

  private updateMarkers(): void {
    const cam = this.game.cam.camera;
    const out: typeof ui.markers.value = [];
    this.targets.forEach((t, i) => {
      if (t.id.startsWith('canister') && !this.salvage.find((s) => s.id === t.id)?.mesh.visible) return;
      const p = t.position();
      const v = p.clone().project(cam);
      const behind = v.z > 1;
      const d = p.distanceTo(this.flight.position);
      out.push({
        x: THREE.MathUtils.clamp((behind ? -v.x : v.x) * 0.5 + 0.5, 0.03, 0.97),
        y: THREE.MathUtils.clamp((behind ? 1 : -v.y * 0.5 + 0.5), 0.05, 0.95),
        label: t.label,
        dist: d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${d.toFixed(0)} m`,
        selected: i === this.targetIdx,
        behind,
      });
    });
    ui.markers.value = out;
  }

  flightHud(): FlightHud {
    const f = this.flight;
    const t = this.targets[this.targetIdx];
    const s = this.game.store.state;
    const d = t ? t.position().distanceTo(f.position) : null;
    const dock = this.harborDock().distanceTo(f.position);
    const altM = ORIGIN_ALT_KM * 1000 + f.position.y;
    return {
      speed: f.speed,
      throttle: Math.max(0, f.throttle),
      assist: f.assist,
      target: t?.label ?? null,
      targetDist: d,
      altitude: altM,
      propellant: s.ship.propellant,
      hull: s.ship.hull,
      mode: dock < 400 && f.speed < 60 ? 'DOCKING AVAILABLE (G)' : altM < 4000 ? 'LANDING AVAILABLE (G)' : f.boosting ? 'BOOST' : s.ship.propellant <= 0.5 ? 'RCS ONLY' : 'CRUISE',
    };
  }
}
