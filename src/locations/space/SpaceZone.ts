import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';
import { FlightModel } from '../../gameplay/flight';
import { buildLantern, type LanternModel } from '../../procgen/lanternShip';
import { buildHarbor, type HarborModel } from '../../procgen/harborStation';
import { createPlanet, type PlanetHandle, type PlanetKind } from '../../render/planets';
import { Sky } from '../../render/sky';
import { ScreenDisplay, ScreenUI } from '../../render/screen';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { rockGeometry } from '../../procgen/rocks';
import { Rng } from '../../engine/Rng';
import { damp, lookQuat } from '../../engine/math';
import { ui, pushNotification, type FlightHud } from '../../ui/uiState';
import type { CameraView } from '../../state/GameState';
import type { SpaceZoneDef } from '../../content/zones';
import { zoneForSurface } from '../../content/zones';
import { DESCENT_COST } from '../../content/shipSystems';

/** Local zone metres → background kilometres. */
const KM = 1 / 1000;

interface Target {
  id: string;
  label: string;
  position: () => THREE.Vector3;
  scan?: string;
}

const v3 = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);


/**
 * A local space zone (flight mode), driven entirely by a SpaceZoneDef. Two render layers:
 * the background layer holds the body and its neighbours at true angular sizes in
 * kilometre units; the foreground holds the ship, stations and salvage in metres. Space is
 * a place: you can scan, salvage, dock, descend to the surface, and leave the pilot's seat
 * to walk the ship.
 */
export class SpaceZone extends Location {
  readonly id: string;
  readonly name: string;
  readonly mode = 'flight' as const;
  private flight = new FlightModel();
  private ship!: LanternModel;
  private station: HarborModel | null = null;
  private bgScene = new THREE.Scene();
  private bgCam = new THREE.PerspectiveCamera(70, 1, 0.05, 200000);
  private planet!: PlanetHandle;
  private backdrop: PlanetHandle[] = [];
  private sky!: Sky;
  private sunDir: THREE.Vector3;
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
  private readonly landingSite: THREE.Vector3;

  constructor(game: Game, readonly def: SpaceZoneDef) {
    super(game, 0);
    this.id = def.id;
    this.name = def.name;
    this.sunDir = v3(def.sunDir).normalize();
    this.landingSite = new THREE.Vector3(0, -def.originAltKm * 1000, 0);
    this.env = { gravity: 0, atmosphere: 'vacuum', temperatureC: -100, radiation: 1.5, ambience: 'space' };
  }

  private get altitude(): number {
    return this.def.originAltKm * 1000 + this.flight.position.y;
  }

  async build(): Promise<void> {
    const game = this.game;
    const def = this.def;
    const s = game.store.state;
    this.scene.background = null;
    // ---- Background layer (km)
    this.sky = new Sky({ seed: 31, radius: 150000, starCount: 9000, earth: false });
    this.sky.sunDir.copy(this.sunDir);
    this.bgScene.add(this.sky.group);
    this.bgScene.background = new THREE.Color('#000');
    this.planet = createPlanet(def.planet.kind as PlanetKind, def.planet.radiusKm, { segments: 192 });
    if (def.planet.rot) this.planet.group.rotation.set(...def.planet.rot);
    // We fly tens of km above a sphere thousands of km across: never frustum-cull it.
    this.planet.group.traverse((o) => (o.frustumCulled = false));
    this.bgScene.add(this.planet.group);
    for (const b of def.backdrop) {
      const p = createPlanet(b.kind as PlanetKind, b.radiusKm, { segments: b.radiusKm > 100 ? 128 : 48 });
      const pos = v3(b.pos);
      // Kind 'earth' at 1/10 scale: keep its direction, place it at 1/10 of the real distance.
      if (b.kind === 'earth') pos.setLength(38440);
      p.group.position.copy(pos);
      if (b.rot) p.group.rotation.set(...b.rot);
      this.bgScene.add(p.group);
      this.backdrop.push(p);
    }
    this.scope.add(() => {
      this.sky.dispose();
      this.planet.dispose();
      for (const p of this.backdrop) p.dispose();
    });

    // ---- Foreground layer (m)
    const sun = new THREE.DirectionalLight('#fff6ea', def.sunIntensity);
    sun.position.copy(this.sunDir).multiplyScalar(1000);
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(def.body === 'mars' ? '#3a2a22' : '#20324a', def.body === 'mars' ? '#b0704a' : '#8a8782', 0.35));
    this.ship = buildLantern({ damaged: false, power: 1, landed: false });
    this.scene.add(this.ship.group);
    this.scope.add(() => this.ship.dispose());
    if (def.station) {
      this.station = buildHarbor();
      this.station.group.position.copy(v3(def.station.pos));
      this.station.group.rotation.set(...def.station.rot);
      this.scene.add(this.station.group);
      const st = this.station;
      this.scope.add(() => st.dispose());
    }
    this.buildDebris();
    this.buildSalvage();
    this.buildCockpit();

    // ---- Targets
    this.targets = [];
    if (def.station) this.targets.push({ id: 'station', label: def.station.label, position: () => this.stationDock()!, scan: def.station.scan });
    this.targets.push({ id: 'surface', label: def.landing.label, position: () => this.landingSite.clone(), scan: def.landing.scan });
    for (const sv of this.salvage) this.targets.push({ id: sv.id, label: def.salvage!.label, position: () => sv.mesh.position.clone(), scan: def.salvage!.scan });

    // ---- Initial ship state from parking
    const p = s.ship.parking;
    if (p.kind === 'space' && p.locationId === this.id) {
      this.flight.position.set(...p.position);
      this.flight.quaternion.set(...p.quat);
    } else {
      this.flight.position.copy(v3(def.arrival.pos));
      this.flight.quaternion.copy(lookQuat(this.flight.position, v3(def.arrival.look)));
    }
    this.spawns = {
      launch: { id: 'launch', position: new THREE.Vector3(0, 0, 0), yaw: 0 },
      helm: { id: 'helm', position: this.flight.position.clone(), yaw: 0 },
      arrival: { id: 'arrival', position: v3(def.arrival.pos), yaw: 0 },
      ascent: { id: 'ascent', position: new THREE.Vector3(0, -def.originAltKm * 1000 + def.minAltM + 1500, 0), yaw: 0 },
    };
    const dock = this.stationDock();
    if (dock) this.spawns.undock = { id: 'undock', position: dock.add(new THREE.Vector3(0, 0, 250)), yaw: 0 };
    this.view = s.player.cameraView === 'first' ? 'first' : 'back';
  }

  stationDock(): THREE.Vector3 | null {
    if (!this.station) return null;
    this.station.group.updateMatrixWorld(true);
    return this.station.dockPoint.clone().applyMatrix4(this.station.group.matrixWorld);
  }

  override onEnter(): void {
    const game = this.game;
    const def = this.def;
    const s = game.store.state;
    const spawn = s.player.spawnId;
    const docked = s.ship.parking.kind === 'docked';
    if (spawn === 'launch' && !s.flags['orbit.placed']) {
      // First arrival after the lunar ascent: point the nose at the station. Later loads keep the saved position.
      game.store.setFlag('orbit.placed', true);
      this.flight.position.set(0, 0, 0);
      this.lookAt(def.station ? v3(def.station.pos) : v3(def.arrival.look));
    } else if (spawn === 'ascent') {
      this.flight.position.copy(this.spawns.ascent.position);
      this.flight.velocity.set(0, 40, 0);
      this.lookAt(this.flight.position.clone().add(new THREE.Vector3(0, 0.35, -1)));
    } else if ((docked || spawn === 'undock') && this.spawns.undock) {
      this.flight.position.copy(this.spawns.undock.position);
      this.lookAt(v3(def.station!.pos).add(new THREE.Vector3(0, 0, 3000)));
      this.flight.velocity.set(0, 0, 0);
      if (docked) game.store.setFlag(`${def.station!.prefix}.undocked`, true);
    }
    this.persistParking();
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
    if (!s.universe.discovered[def.discover]) {
      game.store.discover(def.discover);
      game.store.discover(def.body);
      if (spawn !== 'launch') {
        game.audio.stinger('arrival');
        setTimeout(() => game.showLocationTitle(def.arrival.title, def.arrival.sub), 400);
      }
    }
    if (!s.flags['hint.flight']) {
      game.store.setFlag('hint.flight', true);
      ui.hint.value = 'Flight: mouse steers · W/S throttle · A/D/Space/C strafe · Q/E roll · Shift boost · Z flight assist · V view · T target · G dock/land · X leave the seat.';
      setTimeout(() => (ui.hint.value = null), 12000);
    }
    this.updateCamera(1);
  }

  private lookAt(p: THREE.Vector3): void {
    this.flight.quaternion.copy(lookQuat(this.flight.position, p));
  }

  private buildDebris(): void {
    const d = this.def.debris;
    if (!d) return;
    const rng = new Rng(88);
    const geo = rockGeometry(4, 0, 0.3);
    const mat = stdMat('#8f969e', { metalness: 0.6, roughness: 0.4 });
    this.scope.own(geo);
    this.scope.own(mat);
    const im = new THREE.InstancedMesh(geo, mat, d.count);
    const m = new THREE.Matrix4();
    const c = v3(d.center);
    for (let i = 0; i < d.count; i++) {
      const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.4, 0.4), rng.range(-1, 1)).normalize();
      const pos = c.clone().addScaledVector(dir, rng.range(160, 900));
      const sc = rng.range(0.5, 3.5);
      m.compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.next() * 6, rng.next() * 6, 0)), new THREE.Vector3(sc * 2, sc * 0.3, sc));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    this.scene.add(im);
  }

  private buildSalvage(): void {
    const sv = this.def.salvage;
    if (!sv) return;
    const store = this.game.store;
    sv.spots.forEach((spot, i) => {
      const id = `${sv.idPrefix}.${i}`;
      const g = sv.model === 'canister' ? canisterModel() : satelliteModel();
      g.position.copy(v3(spot));
      g.rotation.set(i, i * 2, 0.3);
      this.scene.add(g);
      if (store.getEntity(this.id, id, 'taken')) g.visible = false;
      this.salvage.push({ id, mesh: g });
    });
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
    this.cockpitScreen = new ScreenDisplay(512, 200, 0.9, 0.35, (ctx) => {
      ScreenUI.bg(ctx, 512, 200, '#04090d');
      const f = this.flight;
      ScreenUI.text(ctx, `${f.speed.toFixed(0)} m/s   ALT ${(this.altitude / 1000).toFixed(1)} km`, 16, 50, '#9fe8ff', 26, true);
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
    const def = this.def;
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
    if (this.station) {
      this.station.ring.rotation.z += dt * 0.02;
      this.station.setBeacon(true, this.t);
    }
    for (const sv of this.salvage) sv.mesh.rotation.y += dt * 0.05;
    this.updateCamera(dt);
    // Background layer camera
    const bgPos = new THREE.Vector3(this.flight.position.x * KM, def.planet.radiusKm + def.originAltKm + this.flight.position.y * KM, this.flight.position.z * KM);
    this.bgCam.position.copy(bgPos);
    this.bgCam.quaternion.copy(game.cam.camera.quaternion);
    this.bgCam.fov = game.cam.camera.fov;
    this.bgCam.aspect = game.cam.camera.aspect;
    this.bgCam.near = 0.05;
    this.bgCam.updateProjectionMatrix();
    this.sky.update(this.bgCam.position, this.t, 1);
    this.planet.update(this.t, this.sunDir);
    for (const p of this.backdrop) p.update(this.t, this.sunDir);
    // Station approach beat
    if (def.station) {
      const st = def.station;
      const d = this.flight.position.distanceTo(v3(st.pos));
      if (d < 2500 && !s.flags[`${st.prefix}.approached`]) {
        game.store.setFlag(`${st.prefix}.approached`, true);
        game.showLocationTitle(st.title, st.sub);
        game.audio.stinger('arrival');
        game.store.discover(st.prefix);
      }
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
    if (this.busy) return;
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
    if (this.station) {
      this.station.group.updateMatrixWorld(true);
      for (const c of this.station.colliders) {
        const center = c.center.clone().applyMatrix4(this.station.group.matrixWorld);
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
    }
    // Minimum altitude above the surface (automatic pull-up)
    if (this.altitude < this.def.minAltM) {
      this.flight.position.y = -this.def.originAltKm * 1000 + this.def.minAltM;
      if (this.flight.velocity.y < 0) this.flight.velocity.y = 0;
    }
  }

  private scanTarget(): void {
    const t = this.targets[this.targetIdx];
    const game = this.game;
    if (!t?.scan) return;
    const d = t.position().distanceTo(this.flight.position);
    if (d > 8000 && t.id !== 'surface') {
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
    const dock = this.stationDock();
    const d = dock ? dock.distanceTo(this.flight.position) : Infinity;
    if (d < 400 && this.flight.speed < 60) {
      this.docking = { t: 0, from: this.flight.position.clone(), fromQ: this.flight.quaternion.clone() };
      this.flight.hold();
      game.audio.play('thruster');
      game.story.cinematicActive = true;
      return;
    }
    // Salvage (tractor within 220 m)
    const sal = this.def.salvage;
    for (const sv of this.salvage) {
      if (!sv.mesh.visible || !sal) continue;
      if (sv.mesh.position.distanceTo(this.flight.position) < 220) {
        const store = game.store;
        store.batch('salvage', () => {
          store.setEntity(this.id, sv.id, 'taken', true);
          for (const [item, qty] of sal.items) store.give(item, qty, 'ship.cargo');
        });
        sv.mesh.visible = false;
        game.audio.play('pickup');
        pushNotification(sal.text, 'item');
        return;
      }
    }
    if (this.altitude < this.def.landAltM) {
      void this.land();
      return;
    }
    pushNotification(
      d < 1500 ? 'Slow down and close to 400 m of the docking port to dock.' : `Nothing to dock with. Descend below ${(this.def.landAltM / 1000).toFixed(0)} km to land: ${this.def.landing.label}.`,
      'warn',
    );
  }

  private updateDocking(dt: number): void {
    const game = this.game;
    const dk = this.docking!;
    const st = this.def.station!;
    dk.t += dt / 6;
    const dock = this.stationDock()!;
    this.station!.group.updateMatrixWorld(true);
    const dir = this.station!.dockDir.clone().transformDirection(this.station!.group.matrixWorld);
    const final = dock.clone().addScaledVector(dir, 70);
    const k = Math.min(1, dk.t);
    const e = k * k * (3 - 2 * k);
    this.flight.position.copy(dk.from).lerp(final, e);
    this.flight.quaternion.copy(dk.fromQ).slerp(lookQuat(final, dock), e);
    if (k >= 1 && !this.busy) {
      this.busy = true;
      game.audio.play('impact', 0.3);
      game.cam.addShake(0.3);
      const store = game.store;
      store.batch('dock', () => {
        store.setFlag(`${st.prefix}.docked`, true);
        store.state.ship.parking = { kind: 'docked', locationId: st.dockLocation, portId: st.dockSpawn };
      });
      game.story.cinematicActive = false;
      void game.locations.travel({ location: st.dockLocation, spawn: st.dockSpawn }, { label: 'Docking clamps engaged. Equalizing pressure…' });
    }
  }

  private async land(): Promise<void> {
    const game = this.game;
    this.busy = true;
    const store = game.store;
    const l = this.def.landing;
    // Powered descent. Never strands the ship: a nearly-dry tank still lands (hard).
    const cost = Math.min(DESCENT_COST[this.def.body] ?? 100, store.state.ship.propellant);
    store.batch('land', () => {
      store.setPropellant(store.state.ship.propellant - cost);
      store.state.ship.parking = { kind: 'surface', locationId: l.location };
      store.markChanged('land');
    });
    await game.locations.travel({ location: l.location, spawn: l.spawn }, { label: l.text });
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
      const p = t.position();
      const sv = this.salvage.find((x) => x.id === t.id);
      if (sv && (!sv.mesh.visible || (p.distanceTo(this.flight.position) > 3000 && i !== this.targetIdx && this.def.salvage?.model === 'canister'))) return;
      const v = p.clone().project(cam);
      const behind = v.z > 1;
      const d = p.distanceTo(this.flight.position);
      out.push({
        x: THREE.MathUtils.clamp((behind ? -v.x : v.x) * 0.5 + 0.5, 0.03, 0.97),
        y: THREE.MathUtils.clamp(behind ? 1 : -v.y * 0.5 + 0.5, 0.05, 0.95),
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
    const dock = this.stationDock()?.distanceTo(f.position) ?? Infinity;
    const alt = this.altitude;
    return {
      view: this.view,
      speed: f.speed,
      throttle: Math.max(0, f.throttle),
      assist: f.assist,
      target: t?.label ?? null,
      targetDist: d,
      altitude: alt,
      propellant: s.ship.propellant,
      hull: s.ship.hull,
      mode: dock < 400 && f.speed < 60 ? 'DOCKING AVAILABLE (G)' : alt < this.def.landAltM ? 'LANDING AVAILABLE (G)' : f.boosting ? 'BOOST' : s.ship.propellant <= 0.5 ? 'RCS ONLY' : 'CRUISE',
    };
  }
}

function canisterModel(): THREE.Group {
  const k = new KitBuilder({ c: stdMat('#d6dbe0', { roughness: 0.5 }), a: stdMat('#3fa9f5', { emissive: '#3fa9f5', emissiveIntensity: 0.8 }) });
  k.cyl('c', 1.6, 1.6, 5, { x: 0, y: 0, z: 0 }, [Math.PI / 2, 0, 0], 12);
  k.cyl('a', 1.65, 1.65, 0.4, { x: 0, y: 0, z: 1.8 }, [Math.PI / 2, 0, 0], 12);
  return k.build();
}

/** A derelict areostationary relay: bus, two solar wings, a high-gain dish. */
function satelliteModel(): THREE.Group {
  const k = new KitBuilder({
    bus: stdMat('#c9a74a', { metalness: 0.7, roughness: 0.35 }),
    solar: stdMat('#1f2e66', { metalness: 0.6, roughness: 0.2 }),
    dark: stdMat('#2c3036', { roughness: 0.7 }),
    dish: stdMat('#e6e8ea', { roughness: 0.4 }),
    lamp: stdMat('#ff5a3a', { emissive: '#ff5a3a', emissiveIntensity: 1.5 }),
  });
  k.box('bus', 6, 5, 6, { x: 0, y: 0, z: 0 });
  k.box('dark', 0.6, 0.6, 22, { x: 0, y: 0, z: 0 }, [0, Math.PI / 2, 0]);
  k.box('solar', 16, 0.2, 7, { x: 19, y: 0, z: 0 }, [0.3, 0, 0]);
  k.box('solar', 16, 0.2, 7, { x: -19, y: 0, z: 0 }, [-0.9, 0, 0.2]);
  k.add('dish', new THREE.SphereGeometry(5, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), { x: 0, y: 3.5, z: 4 }, [-0.6, 0, 0]);
  k.box('lamp', 0.8, 0.8, 0.8, { x: 0, y: 2.9, z: -3 });
  const g = k.build();
  g.scale.setScalar(1.4);
  return g;
}

/** Take-off target for a surface region: the zone above it and its ascent spawn. */
export function ascentTarget(surfaceLocation: string): { location: string; spawn: string } | null {
  const z = zoneForSurface(surfaceLocation);
  return z ? { location: z.id, spawn: 'ascent' } : null;
}
