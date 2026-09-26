import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';
import { buildLantern, type LanternModel } from '../../procgen/lanternShip';
import { createPlanet, type PlanetHandle, type PlanetKind } from '../../render/planets';
import { Sky } from '../../render/sky';
import { damp } from '../../engine/math';
import { Rng } from '../../engine/Rng';
import { ui, pushNotification, type FlightHud } from '../../ui/uiState';
import type { CameraView } from '../../state/GameState';
import { ZONES } from '../../content/zones';

/** Mean heliocentric distance covered by an Earth–Mars Hohmann transfer (m), for the HUD. */
const TRANSFER_M = 3.9e11;

/**
 * Interplanetary cruise. The transfer burn is done; the ship coasts on autopilot while the
 * origin shrinks astern and the destination swells ahead. Months are compressed into a
 * minute and a half. You can stay at the helm or unbuckle (X) and walk the ship; the
 * transit clock keeps running either way (TravelSystem).
 */
export class Transit extends Location {
  readonly id = 'space.transit';
  readonly name = 'Interplanetary Transit';
  readonly mode = 'flight' as const;
  private ship!: LanternModel;
  private sky!: Sky;
  private from: PlanetHandle | null = null;
  private to: PlanetHandle | null = null;
  private streaks!: THREE.LineSegments;
  private view: CameraView = 'back';
  private camPos = new THREE.Vector3();
  private orbit = 0;
  private t = 0;
  private busy = false;
  private quat = new THREE.Quaternion();
  private engine: { set(t: number): void } | null = null;

  constructor(game: Game) {
    super(game, 0);
    this.env = { gravity: 0, atmosphere: 'vacuum', temperatureC: -120, radiation: 2, ambience: 'space' };
  }

  private progress(): number {
    const p = this.game.store.state.ship.parking;
    return p.kind === 'transit' ? Math.min(1, p.elapsed / p.duration) : 1;
  }

  async build(): Promise<void> {
    const s = this.game.store.state;
    const p = s.ship.parking;
    this.scene.background = new THREE.Color('#000');
    this.sky = new Sky({ seed: 31, radius: 9000, starCount: 9000, earth: false });
    this.sky.sunDir.set(0.6, 0.15, 0.7).normalize();
    this.scene.add(this.sky.group);
    this.scope.add(() => this.sky.dispose());
    if (p.kind === 'transit') {
      const fromKind = (ZONES[p.from]?.planet?.kind ?? 'pluto') as PlanetKind;
      const toKind = (ZONES[p.to]?.planet?.kind ?? 'charon') as PlanetKind;
      this.from = createPlanet(fromKind, 100, { segments: 64 });
      this.to = createPlanet(toKind, 100, { segments: 96 });
      this.scene.add(this.from.group, this.to.group);
      // Earth–Moon departures: Earth hangs beside the Moon as it recedes.
      this.scope.add(() => {
        this.from?.dispose();
        this.to?.dispose();
      });
    }
    const sun = new THREE.DirectionalLight('#fff6ea', 3);
    sun.position.copy(this.sky.sunDir).multiplyScalar(1000);
    this.scene.add(sun, sun.target, new THREE.HemisphereLight('#20324a', '#3a3632', 0.3));
    this.ship = buildLantern({ damaged: false, power: 1, landed: false });
    this.scene.add(this.ship.group);
    this.scope.add(() => this.ship.dispose());
    // Speed streaks: faint dust/ion trails sweeping past (a readability device, not physics).
    const rng = new Rng(5);
    const n = 260;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = rng.range(-600, 600), y = rng.range(-400, 400), z = rng.range(-1500, 1500);
      pos.set([x, y, z, x, y, z + 40], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.streaks = new THREE.LineSegments(g, m);
    this.streaks.frustumCulled = false;
    this.scene.add(this.streaks);
    this.spawns = { helm: { id: 'helm', position: new THREE.Vector3(), yaw: 0 } };
    this.view = s.player.cameraView === 'first' ? 'first' : 'back';
  }

  override onEnter(): void {
    const game = this.game;
    game.cam.camera.far = 20000;
    this.engine = game.audio.engine(true);
    this.scope.add(() => {
      game.audio.engine(false);
      ui.markers.value = [];
    });
    game.input.setBase('flight');
    if (!game.store.state.flags['hint.transit']) {
      game.store.setFlag('hint.transit', true);
      ui.hint.value = 'Coasting on autopilot. V changes view · X unbuckles so you can walk the ship. Arrival is automatic.';
      setTimeout(() => (ui.hint.value = null), 9000);
    }
    this.update(0);
  }

  override update(dt: number): void {
    const game = this.game;
    const input = game.input;
    this.t += dt;
    const k = this.progress();
    // Gentle autopilot attitude drift so the view breathes.
    this.quat.setFromEuler(new THREE.Euler(Math.sin(this.t * 0.07) * 0.03, Math.sin(this.t * 0.05) * 0.04, Math.sin(this.t * 0.09) * 0.02));
    this.ship.group.position.set(0, -8, 0);
    this.ship.group.quaternion.copy(this.quat);
    this.ship.setEngine(k < 0.04 || k > 0.93 ? 0.8 : 0.08);
    this.engine?.set(k < 0.04 || k > 0.93 ? 0.7 : 0.1);
    // Origin recedes astern, destination grows ahead (angular size eases up near arrival).
    if (this.from) {
      this.from.group.position.set(700, -300, 3000 + k * 9000);
      this.from.group.scale.setScalar(Math.max(0.05, 3 * (1 - k) ** 3));
      this.from.update(this.t, this.sky.sunDir);
    }
    if (this.to) {
      this.to.group.position.set(-300, 80, -7000);
      this.to.group.scale.setScalar(0.08 + 9 * k ** 4);
      this.to.update(this.t, this.sky.sunDir);
    }
    // Streaks flow aft
    const a = this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const v = dt * 900;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 2] += v;
      arr[i + 5] += v;
      if (arr[i + 2] > 1500) {
        arr[i + 2] -= 3000;
        arr[i + 5] -= 3000;
      }
    }
    a.needsUpdate = true;
    this.sky.update(new THREE.Vector3(), this.t, 1);
    if (!this.busy && input.context === 'flight') {
      input.consumeMouse();
      if (input.justPressed('cycleView', 'flight')) {
        this.view = this.view === 'first' ? 'back' : this.view === 'back' ? 'front' : 'first';
        pushNotification(`View: ${this.view === 'first' ? 'Cockpit (first person)' : this.view === 'back' ? 'Chase (behind)' : 'Chase (front)'}`);
      }
      if (input.justPressed('exitSeat', 'flight')) {
        this.busy = true;
        void game.locations.travel({ location: 'lantern.interior', spawn: 'pilot' }, { label: 'Autopilot has the ship. Unbuckling…', fadeTime: 0.3 });
      }
      if (input.justPressed('dock', 'flight') || input.justPressed('target', 'flight')) pushNotification('In transit — nothing to do but wait. Arrival is automatic.');
    }
    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    const cam = this.game.cam.camera;
    const q = this.quat;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    if (this.view === 'first') {
      pos = new THREE.Vector3(0, 3.2, -38).applyQuaternion(q);
      look = pos.clone().addScaledVector(fwd, 100);
      this.camPos.copy(pos);
    } else {
      this.orbit += dt * 0.02;
      const off = this.view === 'back' ? new THREE.Vector3(Math.sin(this.orbit) * 30, 36, 150) : new THREE.Vector3(0, 16, -175);
      pos = off.applyQuaternion(q);
      look = this.view === 'back' ? fwd.clone().multiplyScalar(60) : new THREE.Vector3();
      this.camPos.lerp(pos, dt >= 1 || dt === 0 ? 1 : damp(4, dt));
    }
    cam.position.copy(this.camPos);
    cam.lookAt(look);
    cam.fov = this.game.settings.fov;
    cam.updateProjectionMatrix();
    this.ship.group.visible = this.view !== 'first';
  }

  flightHud(): FlightHud {
    const s = this.game.store.state;
    const p = s.ship.parking;
    const k = this.progress();
    const dest = p.kind === 'transit' ? ZONES[p.to]?.name ?? '' : '';
    return {
      view: this.view,
      speed: 24100,
      throttle: 0,
      assist: true,
      target: dest,
      targetDist: TRANSFER_M * (1 - k),
      altitude: null,
      propellant: s.ship.propellant,
      hull: s.ship.hull,
      mode: `TRANSIT ${(k * 100).toFixed(0)}% · ARRIVAL IN ${Math.max(0, Math.ceil(p.kind === 'transit' ? p.duration - p.elapsed : 0))} s`,
    };
  }
}
