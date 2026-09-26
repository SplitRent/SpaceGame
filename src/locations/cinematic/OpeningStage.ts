import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';
import { CinematicPlayer, ease, type Shot } from '../../cinematics/Cinematic';
import { buildLantern, type LanternModel } from '../../procgen/lanternShip';
import { createPlanet, type PlanetHandle } from '../../render/planets';
import { Sky } from '../../render/sky';
import { HeightField, ChunkedTerrain } from '../../procgen/terrain';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { Rng } from '../../engine/Rng';
import { ui } from '../../ui/uiState';

export type CineMode = 'opening' | 'crash' | 'launch';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * The cinematic stage: a lightweight location that stages the game's big set pieces —
 * the Earth launch and Lantern reveal, the crash, and the first ascent from the Moon.
 * Gameplay state changes happen only in each sequence's onEnd (identical when skipped).
 */
export class OpeningStage extends Location {
  readonly id = 'cinematic.opening';
  readonly name = 'Cinematic';
  readonly mode = 'cinematic' as const;
  private player: CinematicPlayer;
  private sky!: Sky;
  private planets: PlanetHandle[] = [];
  private lantern!: LanternModel;
  private t = 0;
  private updaters: ((dt: number, t: number) => void)[] = [];
  private cine: CineMode;
  private sunLight = new THREE.DirectionalLight('#fff4e0', 3);

  constructor(game: Game) {
    super(game, 9.8);
    this.env = { gravity: 9.8, atmosphere: 'breathable', temperatureC: 20, radiation: 0, ambience: 'cinematic' };
    this.player = new CinematicPlayer(game);
    this.cine = (game.store.state.flags['cine.mode'] as CineMode) ?? 'opening';
  }

  async build(): Promise<void> {
    this.scene.background = new THREE.Color('#000');
    this.sky = new Sky({ seed: 11, radius: 60000, starCount: 9000, earth: false });
    this.scene.add(this.sky.group, this.sunLight, this.sunLight.target);
    this.scope.add(() => this.sky.dispose());
    this.scope.add(() => this.planets.forEach((p) => p.dispose()));
    this.spawns = { default: { id: 'default', position: v(0, 0, 0), yaw: 0 } };
    if (this.cine === 'opening') this.buildOpening();
    else if (this.cine === 'crash') this.buildCrash();
    else this.buildLaunch();
  }

  override onEnter(): void {
    const game = this.game;
    game.cam.camera.far = 200000;
    game.cam.camera.near = 0.5;
    void game.fadeTo(0, 1.5);
    if (this.cine === 'opening') this.playOpening();
    else if (this.cine === 'crash') this.playCrash();
    else this.playLaunch();
  }

  override onExit(): void {
    this.game.cam.camera.far = 20000;
    this.game.cam.camera.near = 0.05;
  }

  override update(dt: number): void {
    this.t += dt;
    const cam = this.game.cam.camera;
    this.sky.update(cam.position, this.t, 1);
    for (const p of this.planets) p.update(this.t, this.sky.sunDir);
    for (const u of this.updaters) u(dt, this.t);
    this.particles.update(dt);
    this.glowParticles.update(dt);
  }

  /* ============================== OPENING ============================== */

  private shuttle = new THREE.Group();
  private shuttleFlame!: THREE.Mesh;
  private earthGroup = new THREE.Group();
  private padGroup = new THREE.Group();

  private buildOpening(): void {
    const scene = this.scene;
    // --- Spaceport at dawn (Earth). A dome sky replaces space.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(8000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `varying vec3 vP; void main(){
          float h = vP.y;
          vec3 zen = vec3(0.12,0.28,0.62), hor = vec3(1.0,0.62,0.38), below = vec3(0.05,0.1,0.18);
          float sunA = max(0.0, dot(normalize(vP), normalize(vec3(0.8,0.06,-0.6))));
          vec3 c = mix(hor, zen, smoothstep(0.0, 0.45, h));
          c += vec3(1.0,0.7,0.4) * pow(sunA, 40.0) * 2.0 + vec3(1.0,0.5,0.3)*pow(sunA,6.0)*0.35;
          if (h < 0.0) c = mix(hor*0.6, below, smoothstep(0.0,-0.2,h));
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    this.padGroup.add(dome);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshStandardMaterial({ color: '#2a6a9a', roughness: 0.25, metalness: 0.3 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -2;
    const land = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshStandardMaterial({ color: '#8f8a6a', roughness: 0.95 }));
    land.rotation.x = -Math.PI / 2;
    land.position.set(0, 0, 200);
    this.padGroup.add(ocean, land);
    // Launch pad + tower
    const kit = new KitBuilder({
      concrete: stdMat('#b9b6ad', { roughness: 0.95 }),
      tower: stdMat('#b33a2a', { roughness: 0.6, metalness: 0.4 }),
      steel: stdMat('#9aa3ad', { metalness: 0.7, roughness: 0.4 }),
      banner: stdMat('#ffb347', { emissive: '#ffb347', emissiveIntensity: 0.3 }),
      white: stdMat('#eef0f2'),
      dark: stdMat('#2b2f35'),
    });
    kit.box('concrete', 60, 4, 60, v(0, 2, 0));
    kit.box('dark', 14, 5, 40, v(0, 1, 0));
    for (let i = 0; i < 18; i++) {
      kit.box('tower', 0.8, 5, 0.8, v(18, 6.5 + i * 5, -6));
      kit.box('tower', 0.8, 5, 0.8, v(24, 6.5 + i * 5, -6));
      kit.box('tower', 0.8, 5, 0.8, v(18, 6.5 + i * 5, 0));
      kit.box('tower', 0.8, 5, 0.8, v(24, 6.5 + i * 5, 0));
      kit.box('tower', 6.6, 0.5, 6.6, v(21, 4 + i * 5, -3));
    }
    kit.box('steel', 12, 1.2, 1.2, v(12, 60, -3));
    // Crowd grandstand & banners
    kit.box('white', 120, 6, 18, v(-60, 3, 360));
    for (let i = 0; i < 6; i++) kit.box('banner', 1, 14, 6, v(-110 + i * 20, 13, 350));
    const padMesh = kit.build();
    this.padGroup.add(padMesh);
    // Crowd: instanced little figures
    const rng = new Rng(21);
    const figGeo = new THREE.CapsuleGeometry(0.3, 0.9, 3, 6);
    const figMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const crowd = new THREE.InstancedMesh(figGeo, figMat, 900);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < 900; i++) {
      m.makeTranslation(-115 + rng.range(0, 110), 6.8 + (i % 6) * 0.6, 352 + rng.range(-8, 8) + (i % 6) * 1.2);
      crowd.setMatrixAt(i, m);
      c.setHSL(rng.next(), 0.55, 0.5);
      crowd.setColorAt(i, c);
    }
    crowd.instanceMatrix.needsUpdate = true;
    this.padGroup.add(crowd);
    this.updaters.push((_, t) => {
      // cheering bob
      if (!this.padGroup.visible) return;
      for (let i = 0; i < 900; i += 3) {
        crowd.getMatrixAt(i, m);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        p.y = 6.8 + (i % 6) * 0.6 + Math.max(0, Math.sin(t * 8 + i)) * 0.35;
        m.setPosition(p);
        crowd.setMatrixAt(i, m);
      }
      crowd.instanceMatrix.needsUpdate = true;
    });
    // Shuttle stack: booster + crew vehicle
    const sk = new KitBuilder({
      white: stdMat('#f0f2f4', { roughness: 0.45 }),
      black: stdMat('#1d1f23'),
      orange: stdMat('#ff8a3d'),
      steel: stdMat('#8f98a2', { metalness: 0.8, roughness: 0.3 }),
    });
    sk.cyl('white', 4.2, 4.2, 48, v(0, 24, 0), undefined, 24);
    sk.cyl('black', 4.25, 4.25, 3, v(0, 44, 0), undefined, 24);
    sk.cyl('white', 3.6, 4.2, 10, v(0, 53, 0), undefined, 24);
    sk.cyl('white', 0.6, 3.6, 8, v(0, 62, 0), undefined, 24);
    sk.cyl('orange', 4.3, 4.3, 1.5, v(0, 20, 0), undefined, 24);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      sk.box('black', 0.4, 7, 4, v(Math.cos(a) * 5, 4, Math.sin(a) * 5), [0, -a, 0]);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      sk.cyl('steel', 0.8, 1.4, 2.4, v(Math.cos(a) * 2.2, -0.8, Math.sin(a) * 2.2), undefined, 10);
    }
    this.shuttle.add(sk.build());
    this.shuttleFlame = new THREE.Mesh(
      new THREE.ConeGeometry(4, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.shuttleFlame.rotation.x = Math.PI;
    this.shuttleFlame.position.y = -16;
    this.shuttle.add(this.shuttleFlame);
    this.shuttle.position.set(0, 4, 0);
    this.padGroup.add(this.shuttle);
    const sun = this.sunLight;
    sun.position.set(800, 60, -600);
    sun.intensity = 3;
    scene.add(new THREE.HemisphereLight('#9ec3ff', '#6b5a44', 1.2));
    scene.add(this.padGroup);
    // Daylight on Earth: no stars until we reach orbit.
    this.sky.group.visible = false;

    // --- Orbit: Earth, the Lantern, and the arriving shuttle (far away from the pad set)
    this.earthGroup.position.set(0, 100000, 0);
    const earth = createPlanet('earth', 6000, { segments: 160 });
    earth.group.position.set(0, -6300, 1500);
    earth.group.rotation.set(0.4, 3.9, 0.2);
    this.earthGroup.add(earth.group);
    this.planets.push(earth);
    this.lantern = buildLantern({ damaged: false, power: 1, landed: false });
    this.lantern.group.rotation.y = Math.PI * 0.15;
    this.earthGroup.add(this.lantern.group);
    this.scope.add(() => this.lantern.dispose());
    const ferry = this.shuttle.clone();
    ferry.scale.setScalar(0.12);
    ferry.rotation.x = Math.PI / 2;
    ferry.position.set(70, 8, -120);
    this.earthGroup.add(ferry);
    this.earthGroup.visible = false;
    scene.add(this.earthGroup);
    const orbitSun = new THREE.DirectionalLight('#fff6ea', 3.2);
    orbitSun.position.set(400, 150, -300);
    this.earthGroup.add(orbitSun);
    this.earthGroup.add(new THREE.AmbientLight('#1b2a44', 0.4));
    this.updaters.push((dt) => {
      if (!this.earthGroup.visible) return;
      ferry.position.lerp(v(22, 10, -30), dt * 0.12);
      this.sky.sunDir.set(400, 150, -300).normalize();
      earth.group.rotation.y += dt * 0.004;
    });
  }

  private playOpening(): void {
    const game = this.game;
    const E = this.earthGroup.position;
    const o = (x: number, y: number, z: number) => v(E.x + x, E.y + y, E.z + z);
    let liftT = 0;
    const smoke = () => {
      const base = this.shuttle.position.clone().add(v(0, -14, 0));
      this.particles.emit({ count: 10, position: base, velocity: v(0, -2, 0), spread: 8, life: [2, 5], size: 3.5, color: '#d8d4cc', gravity: -1.5, drag: 0.3 });
      this.glowParticles.emit({ count: 6, position: base, velocity: v(0, -25, 0), spread: 3, life: [0.2, 0.5], size: 1.6, color: '#ffc36b' });
    };
    const shots: Shot[] = [
      { duration: 6, from: { pos: v(-420, 40, -700), target: v(0, 40, 0), fov: 45 }, to: { pos: v(-300, 30, -520), target: v(0, 50, 0), fov: 45 }, subtitle: { speaker: '', text: 'Aurora Point Spaceport, Earth · 2094' }, onStart: () => game.audio.setAmbience('cinematic') },
      { duration: 5, from: { pos: v(-40, 12, 330), target: v(-60, 8, 350), fov: 55 }, to: { pos: v(-70, 12, 330), target: v(-60, 9, 352), fov: 55 }, subtitle: { speaker: 'Crowd', text: 'LAN-TERN! LAN-TERN!' }, onStart: () => game.audio.play('airlock', 0.5) },
      { duration: 6, from: { pos: v(30, 55, 40), target: v(0, 55, 0), fov: 40 }, to: { pos: v(18, 62, 30), target: v(0, 60, 0), fov: 40 }, subtitle: { speaker: 'Okonkwo', text: 'Six of us. Four years. Past Neptune and back. Let’s go and listen.' } },
      { duration: 4, from: { pos: v(90, 8, 120), target: v(0, 30, 0), fov: 50 }, subtitle: { speaker: 'Launch control', text: 'Three… two… one… ignition.' }, onUpdate: (t) => { if (t > 0.5) smoke(); (this.shuttleFlame.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t - 0.5) * 1.6; }, shake: 0.4 },
      {
        duration: 8,
        from: () => ({ pos: v(120, 10, 180), target: this.shuttle.position.clone().add(v(0, 30, 0)), fov: 50 }),
        onStart: () => { game.audio.play('explosion'); game.audio.stinger('launch'); },
        onUpdate: (_t, dt) => {
          liftT += dt;
          this.shuttle.position.y = 4 + liftT * liftT * 6;
          (this.shuttleFlame.material as THREE.MeshBasicMaterial).opacity = 0.9;
          this.shuttleFlame.scale.y = 1 + Math.random() * 0.2;
          smoke();
          game.cam.addShake(0.03);
        },
        subtitle: { speaker: 'Launch control', text: 'Liftoff. Godspeed, Lantern crew.' },
      },
      {
        duration: 2,
        from: { pos: v(0, 6000, 0), target: v(0, 7000, -100), fov: 50 },
        onStart: () => {
          void game.fadeTo(1, 0.8);
        },
        subtitle: null,
      },
      {
        duration: 9,
        onStart: () => {
          this.padGroup.visible = false;
          this.earthGroup.visible = true;
          this.sky.group.visible = true;
          void game.fadeTo(0, 1.2);
        },
        from: { pos: o(-60, 18, -150), target: o(0, 8, -50), fov: 42 },
        to: { pos: o(-40, 22, 40), target: o(0, 8, 30), fov: 42 },
        ease: ease.linear,
        subtitle: { speaker: 'Arakawa', text: 'Three hundred kilometres up. There she is. Home for the next four years.' },
      },
      {
        duration: 8,
        from: { pos: o(180, 60, 160), target: o(0, 5, 0), fov: 50 },
        to: { pos: o(240, 90, 60), target: o(0, 0, -10), fov: 55 },
        subtitle: { speaker: 'Okonkwo', text: 'Welcome aboard the Lantern.' },
        onStart: () => {
          ui.title.value = { text: 'LANTERN', sub: 'A voyage from the known into the unknown' };
        },
      },
      { duration: 1.5, onStart: () => void game.fadeTo(1, 1.2), subtitle: null },
    ];
    void this.player.play(shots, {
      onEnd: async () => {
        ui.title.value = null;
        const store = game.store;
        store.batch('opening', () => {
          store.setFlag('act0', true);
          store.setFlag('opening.seen', true);
          store.state.clock = 0;
        });
        await game.locations.travel({ location: 'lantern.interior', spawn: 'cabin' }, { label: '', holdBlack: true, fadeTime: 0.01 });
        ui.title.value = { text: 'Three days later', sub: 'Trans-lunar coast · 6 hours to Harbor Station' };
        await game.fadeTo(0, 2);
        setTimeout(() => (ui.title.value = null), 3500);
        void game.autosave('Aboard the Lantern');
      },
    });
  }

  /* =============================== CRASH =============================== */

  private blackglass!: THREE.Mesh;

  private buildMoonPatch(seed: number): HeightField {
    const hf = new HeightField({ seed, size: 6144, cell: 24, baseAmp: 90, craterCount: 500, craterMaxR: 500 });
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
    this.scope.own(mat);
    const terrain = new ChunkedTerrain(hf, {
      chunkSize: 768,
      lods: [32, 16],
      lodDistances: [2500],
      material: mat,
      colorFn: (_x, _z, _h, slope, mask) => {
        const g = 0.46 + slope * 0.2 - mask * 0.08;
        return new THREE.Color(g, g, g * 0.98);
      },
    });
    terrain.update(0, v(0, 0, 0), true);
    this.scene.add(terrain.group);
    this.scope.add(() => terrain.dispose());
    return hf;
  }

  private buildCrash(): void {
    const hf = this.buildMoonPatch(777);
    this.sunLight.position.set(1000, 90, 300);
    this.sunLight.intensity = 3.2;
    this.sky.sunDir.copy(this.sunLight.position).normalize();
    this.scene.add(new THREE.HemisphereLight('#6c7a90', '#222', 0.12));
    this.lantern = buildLantern({ damaged: true, power: 0.2, landed: false });
    this.scene.add(this.lantern.group);
    this.scope.add(() => this.lantern.dispose());
    // The Blackglass: an elongated lightless shard, visible only as an absence of stars.
    this.blackglass = new THREE.Mesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: '#000000' }),
    );
    this.blackglass.scale.set(60, 260, 60);
    this.blackglass.renderOrder = 10;
    this.scene.add(this.blackglass);
    (this as any).hf = hf;
  }

  private playCrash(): void {
    const game = this.game;
    const hf = (this as any).hf as HeightField;
    const ship = this.lantern.group;
    const groundAt = (x: number, z: number) => hf.heightAt(x, z);
    const land = v(0, groundAt(0, 0), 0);
    let s = 0;
    const path = (k: number) => {
      // descent from high & tumbling → skim → belly landing
      const start = v(-3000, land.y + 1400, -2600);
      const skim = v(-500, land.y + 60, -420);
      const p = k < 0.8 ? start.clone().lerp(skim, k / 0.8) : skim.clone().lerp(land.clone().add(v(0, 3, 0)), (k - 0.8) / 0.2);
      return p;
    };
    const setShip = (k: number, dt: number) => {
      s = k;
      const p = path(k);
      ship.position.copy(p);
      const tumble = Math.max(0, 1 - k * 1.6);
      ship.rotation.set(Math.sin(this.t * 1.3) * 0.6 * tumble, Math.atan2(2600, 3000) + Math.PI + Math.sin(this.t * 0.7) * 0.4 * tumble, this.t * 1.1 * tumble + (1 - tumble) * 0.12);
      this.glowParticles.emit({ count: 4, position: p.clone().add(v(0, 8, 20)), velocity: v(0, 2, 30), spread: 8, life: [0.4, 1.2], size: 1.2, color: '#ffb36b' });
      void dt;
    };
    this.blackglass.position.set(-2600, land.y + 2600, -3600);
    const shots: Shot[] = [
      {
        duration: 5,
        from: () => ({ pos: path(Math.min(1, s + 0.02)).add(v(160, 60, 220)), target: ship.position.clone(), fov: 50 }),
        onUpdate: (k, dt) => {
          setShip(k * 0.25, dt);
          this.blackglass.position.add(v(-60 * dt * 10, 20 * dt * 10, -40 * dt * 10));
          this.blackglass.rotation.y += dt * 0.3;
        },
        onStart: () => { game.audio.play('alarm'); game.audio.stinger('danger'); },
        subtitle: { speaker: 'Arakawa', text: 'I’ve got nothing! No hydraulics, no nav — the whole board is dark!' },
        shake: 0.5,
      },
      {
        duration: 4,
        from: () => ({ pos: ship.position.clone().add(v(-30, 15, 40)), target: ship.position.clone(), fov: 60 }),
        onUpdate: (k, dt) => setShip(0.25 + k * 0.2, dt),
        subtitle: { speaker: 'Castellanos', text: 'Reactor scram! We’re on batteries — no, we’re on nothing!' },
        shake: 0.4,
      },
      {
        duration: 6,
        from: () => ({ pos: ship.position.clone().add(v(250, -40, 300)), target: ship.position.clone(), fov: 45 }),
        onUpdate: (k, dt) => setShip(0.45 + k * 0.4, dt),
        subtitle: { speaker: 'Arakawa', text: 'Manual thrusters. Come on, girl. Come on. Everybody hold on to something!' },
      },
      {
        duration: 5,
        from: { pos: v(260, land.y + 12, 180), target: v(-200, land.y + 20, -150), fov: 50 },
        to: { pos: v(230, land.y + 10, 150), target: v(0, land.y + 6, 0), fov: 50 },
        onUpdate: (k, dt) => {
          setShip(0.85 + k * 0.15, dt);
          if (k > 0.7) {
            for (let i = 0; i < 3; i++) {
              this.particles.emit({ count: 20, position: ship.position.clone().add(v((Math.random() - 0.5) * 40, -4, (Math.random() - 0.5) * 60)), velocity: v(0, 8, 25), spread: 14, life: [2, 5], size: 3, color: '#a8a49c', gravity: 1.62 });
            }
          }
        },
        onStart: () => setTimeout(() => { game.audio.play('impact'); game.cam.addShake(1.2); }, 3500),
        subtitle: { speaker: '', text: '' },
      },
      {
        duration: 4,
        from: { pos: v(160, land.y + 30, 140), target: v(0, land.y + 6, 0), fov: 45 },
        onStart: () => {
          ship.position.copy(land).add(v(0, -1.2, 0));
          ship.rotation.set(0, Math.atan2(2600, 3000) + Math.PI, 0.12);
          game.audio.play('explosion', 0.6);
        },
        onUpdate: (k) => {
          if (k < 0.5) this.particles.emit({ count: 8, position: land.clone().add(v((Math.random() - 0.5) * 60, 2, (Math.random() - 0.5) * 80)), velocity: v(0, 3, 0), spread: 6, life: [2, 4], size: 3, color: '#a8a49c', gravity: 1.62 });
          if (k > 0.6) void game.fadeTo(1, 1.4);
        },
        subtitle: null,
      },
    ];
    void this.player.play(shots, {
      skippable: true,
      onEnd: async () => {
        applyCrashState(game);
        await game.locations.travel({ location: 'lantern.interior', spawn: 'medbay' }, { label: '', holdBlack: true, fadeTime: 0.01 });
        ui.title.value = { text: 'Act 1 — Stranded', sub: 'Lunar far side · south polar region' };
        game.audio.setAmbience('ship-dead');
        await game.fadeTo(0, 3.5);
        setTimeout(() => (ui.title.value = null), 4000);
        void game.autosave('Stranded');
      },
    });
  }

  /* =============================== LAUNCH =============================== */

  private moonBig: PlanetHandle | null = null;
  private earthBig: PlanetHandle | null = null;
  private orbitGroup = new THREE.Group();
  private surfaceGroup = new THREE.Group();

  private buildLaunch(): void {
    this.scene.remove(this.sky.group);
    this.sky.dispose();
    this.sky = new Sky({ seed: 11, radius: 60000, starCount: 9000, earth: true });
    this.sky.earthDir.set(-0.8, 0.03, -0.6).normalize();
    this.scene.add(this.sky.group);
    const hf = this.buildMoonPatch(4201);
    this.sunLight.position.set(900, 110, 500);
    this.sky.sunDir.copy(this.sunLight.position).normalize();
    this.scene.add(new THREE.HemisphereLight('#6c7a90', '#222', 0.15));
    this.lantern = buildLantern({ damaged: false, power: 1, landed: true });
    const g = hf.heightAt(0, 0);
    this.lantern.group.position.set(0, g, 0);
    this.surfaceGroup.add(this.lantern.group);
    this.scope.add(() => this.lantern.dispose());
    // Base camp lights nearby
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(2.5, 3, 4, 10), new THREE.MeshStandardMaterial({ color: '#e8e6e1', emissive: '#ffd9a0', emissiveIntensity: 0.3 }));
      m.rotation.z = Math.PI / 2;
      m.position.set(70 + (i % 3) * 14, g + 2.5, 40 + Math.floor(i / 3) * 14);
      this.surfaceGroup.add(m);
      const l = new THREE.PointLight('#ffd9a0', 300, 40);
      l.position.copy(m.position).add(v(0, 5, 0));
      this.surfaceGroup.add(l);
    }
    this.scene.add(this.surfaceGroup);
    // Orbital view group (Moon as a sphere below, Earth rising)
    this.orbitGroup.position.set(0, 0, 0);
    this.moonBig = createPlanet('moon', 1737, { segments: 192 });
    this.moonBig.group.position.set(0, -1737 - 8, 0);
    this.orbitGroup.add(this.moonBig.group);
    this.orbitGroup.visible = false;
    this.planets.push(this.moonBig);
    this.scene.add(this.orbitGroup);
    void this.earthBig;
    (this as any).hf = hf;
  }

  private playLaunch(): void {
    const game = this.game;
    const ship = this.lantern.group;
    const base = ship.position.clone();
    let alt = 0;
    const dust = () => {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.emit({ count: 10, position: base.clone().add(v(Math.cos(a) * 15, 1, 60 + Math.sin(a) * 15)), velocity: v(Math.cos(a) * 30, 3, Math.sin(a) * 30), spread: 8, life: [1.5, 3.5], size: 3, color: '#b4afa6', gravity: 1.62 });
      }
    };
    const shots: Shot[] = [
      {
        duration: 5,
        from: { pos: base.clone().add(v(110, 6, 70)), target: base.clone().add(v(0, 10, 0)), fov: 50 },
        onUpdate: (k) => {
          this.lantern.setEngine(k * 0.4);
          if (k > 0.4) dust();
        },
        subtitle: { speaker: 'Arakawa', text: 'Main engine start. Three… two… one…' },
        onStart: () => game.audio.play('powerUp'),
        shake: 0.2,
      },
      {
        duration: 6,
        from: { pos: base.clone().add(v(90, 4, 90)), target: base.clone().add(v(0, 20, 0)), fov: 55 },
        to: () => ({ pos: base.clone().add(v(90, 4, 90)), target: ship.position.clone(), fov: 45 }),
        onStart: () => { game.audio.play('explosion', 0.7); game.audio.stinger('launch'); },
        onUpdate: (_k, dt) => {
          alt += dt * (4 + alt * 0.8);
          ship.position.y = base.y + alt;
          this.lantern.setEngine(1);
          dust();
          game.cam.addShake(0.04);
        },
        subtitle: { speaker: 'Castellanos', text: 'She’s flying! She’s actually flying!' },
      },
      {
        duration: 7,
        from: () => ({ pos: ship.position.clone().add(v(40, 20, 120)), target: ship.position.clone(), fov: 55 }),
        onUpdate: (_k, dt) => {
          alt += dt * (20 + alt * 0.5);
          ship.position.y = base.y + alt;
          ship.rotation.x = Math.min(0.9, ship.rotation.x + dt * 0.12);
          this.lantern.setEngine(1);
        },
        subtitle: { speaker: 'Sola', text: 'Look down. Look at the base. We built that.' },
      },
      {
        duration: 9,
        onStart: () => {
          void game.fadeTo(1, 0.4).then(() => {
            this.surfaceGroup.visible = false;
            this.orbitGroup.visible = true;
            ship.position.set(0, 60, 0);
            ship.rotation.set(0.2, 0, 0);
            this.orbitGroup.add(ship);
            this.scene.children.filter((c) => (c as THREE.Mesh).isMesh || c.type === 'Group').forEach((c) => {
              if (c !== this.orbitGroup && c !== this.sky.group && c !== this.surfaceGroup && c !== this.particles.points && c !== this.glowParticles.points) c.visible = false;
            });
            void game.fadeTo(0, 1.2);
          });
        },
        from: { pos: v(-60, 80, 200), target: v(0, 40, -200), fov: 55 },
        to: { pos: v(-90, 130, 260), target: v(-200, 0, -1000), fov: 55 },
        onUpdate: (_k, dt) => {
          ship.position.z -= dt * 30;
          ship.position.y += dt * 4;
          this.lantern.setEngine(0.6);
          this.sky.earthDir.y = Math.min(0.12, this.sky.earthDir.y + dt * 0.01);
          this.sky.earthDir.normalize();
        },
        subtitle: { speaker: 'Haddad', text: 'Earth. Right there. Somebody tell Houston we’re coming up.' },
      },
      {
        duration: 5,
        onStart: () => {
          ui.title.value = { text: 'Lunar orbit', sub: 'The game just got bigger' };
          game.audio.stinger('arrival');
        },
        from: { pos: v(-120, 160, 120), target: v(-400, 30, -1500), fov: 50 },
        subtitle: null,
      },
      { duration: 1.2, onStart: () => void game.fadeTo(1, 1), subtitle: null },
    ];
    void this.player.play(shots, {
      onEnd: async () => {
        ui.title.value = null;
        applyLaunchState(game);
        await game.locations.travel({ location: 'space.cislunar', spawn: 'launch' }, { label: '', holdBlack: true, fadeTime: 0.01 });
        await game.fadeTo(0, 1.5);
        void game.autosave('Lunar orbit');
      },
    });
  }
}

/** Post-crash world state. Idempotent (grant-guarded), shared by the cinematic and its skip. */
export function applyCrashState(game: Game): void {
  const store = game.store;
  store.grant('story.crash', [
    { setFlag: 'crashed' },
    { setFlag: 'act0', value: false },
    { completeQuest: 'mq.prologue' },
  ]);
  const s = store.state;
  s.meta.chapter = 'Act 1 — Stranded';
  s.ship.listDeg = 7;
  s.ship.parking = { kind: 'surface', locationId: 'moon.south' };
  s.player.respawn = { locationId: 'lantern.interior', spawnId: 'medbay' };
  s.player.oxygen = s.player.oxygenMax;
  s.npcs.arakawa.injured = true;
  s.clock = Math.max(s.clock, 900);
  store.setFlag('cine.mode', 'none');
  store.markChanged('crash');
}

export function applyLaunchState(game: Game): void {
  const store = game.store;
  store.grant('story.launch', [{ setFlag: 'launched' }, { discover: 'harbor' }, { unlock: 'cislunar' }]);
  const s = store.state;
  s.meta.chapter = 'Act 1 — Ascent';
  // Lunar ascent burns most of the propellant made from ice.
  s.ship.propellant = Math.max(150, s.ship.propellant - 1000);
  s.ship.parking = { kind: 'space', locationId: 'space.cislunar', position: [0, 0, 0], quat: [0, 0, 0, 1] };
  store.setFlag('cine.mode', 'none');
  store.markChanged('launch');
}
