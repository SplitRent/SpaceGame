import * as THREE from 'three';
import { Location } from '../Location';
import type { Game } from '../../Game';
import { KitBuilder, stdMat } from '../../procgen/kit';
import { floorTexture, wallTexture } from '../../procgen/textures';
import { InteriorBuilder, navFromRooms } from '../lantern/interiorKit';
import { CrewRuntime, type Spot } from '../../gameplay/crew';
import { registerPoiInteract } from '../poiInteract';
import { pushNotification } from '../../ui/uiState';
import '../threshold/GlyphPanel';
import type { InteriorDef } from '../../content/worldTypes';

/**
 * A data-driven interior (outposts, stations, Builder halls). Rooms come from the same
 * InteriorBuilder as the Lantern and Harbor; props, lights, crew spots, doors and
 * interactive points are declared in content. Human style: white panels and warm light;
 * alien style: lightless black glass with violet seams.
 */
export class GenericInterior extends Location {
  readonly id: string;
  readonly name: string;
  readonly mode = 'foot' as const;
  private frame = new THREE.Group();
  private crew: CrewRuntime | null = null;
  private t = 0;
  private points = new Map<string, THREE.Object3D>();
  private seamMat: THREE.MeshStandardMaterial | null = null;

  constructor(game: Game, readonly def: InteriorDef) {
    super(game, def.gravity);
    this.id = def.id;
    this.name = def.name;
    this.env = { gravity: def.gravity, atmosphere: 'breathable', temperatureC: def.temperature, radiation: 0.2, ambience: def.style === 'alien' ? 'cinematic' : 'station' };
    this.killY = -40;
  }

  override temperatureAt(): number {
    return this.def.temperature;
  }

  async build(): Promise<void> {
    const game = this.game;
    const d = this.def;
    const alien = d.style === 'alien';
    this.scene.add(this.frame);
    this.scene.background = new THREE.Color(d.outside?.sky ?? '#000');
    const mats = alien
      ? {
          floor: new THREE.MeshStandardMaterial({ color: '#0e0c16', roughness: 0.2, metalness: 0.85, emissive: '#140c2a', emissiveIntensity: 0.5 }),
          wall: new THREE.MeshStandardMaterial({ color: '#0a0812', roughness: 0.12, metalness: 0.95, emissive: '#1a1036', emissiveIntensity: 0.7 }),
          ceiling: new THREE.MeshStandardMaterial({ color: '#030205', roughness: 0.2, metalness: 1 }),
          trim: new THREE.MeshStandardMaterial({ color: '#05030a', emissive: '#7a5cff', emissiveIntensity: 1.2 }),
          stripe: new THREE.MeshStandardMaterial({ color: '#05030a', emissive: '#7a5cff', emissiveIntensity: 1.6 }),
          glass: new THREE.MeshStandardMaterial({ color: '#221a44', transparent: true, opacity: 0.12, depthWrite: false }),
          dark: new THREE.MeshStandardMaterial({ color: '#08070c', roughness: 0.1, metalness: 1 }),
          metal: new THREE.MeshStandardMaterial({ color: '#0e0c14', roughness: 0.2, metalness: 1 }),
          fabric: stdMat('#1a1426'),
          plant: stdMat('#3fffd8', { emissive: '#3fffd8', emissiveIntensity: 0.5 }),
          light: new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#b8a8ff', emissiveIntensity: 1.2 }),
          water: new THREE.MeshStandardMaterial({ color: '#0a0620', roughness: 0.02, metalness: 0.6, emissive: '#2a1a66', emissiveIntensity: 0.5 }),
        }
      : {
          floor: stdMat('#7d858e', { map: floorTexture(), metalness: 0.5, roughness: 0.6, flatShading: false }),
          wall: stdMat('#dcdfe3', { map: wallTexture(), roughness: 0.6, flatShading: false }),
          ceiling: stdMat('#3a4048'),
          trim: stdMat('#58606a', { metalness: 0.6, roughness: 0.4 }),
          stripe: stdMat('#e8742e', { emissive: '#e8742e', emissiveIntensity: 0.3 }),
          glass: new THREE.MeshStandardMaterial({ color: '#9fb8c8', transparent: true, opacity: 0.1, depthWrite: false }),
          dark: stdMat('#2a2f36'),
          metal: stdMat('#a4adb7', { metalness: 0.8, roughness: 0.35 }),
          fabric: stdMat('#3f6a8a'),
          plant: stdMat('#3e8f45'),
          light: new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe8cc', emissiveIntensity: 1.2 }),
          water: new THREE.MeshStandardMaterial({ color: '#2a6a8a', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8 }),
        };
    this.seamMat = alien ? (mats.stripe as THREE.MeshStandardMaterial) : null;
    for (const m of Object.values(mats)) this.scope.own(m);
    const kit = new KitBuilder(mats);
    const b = new InteriorBuilder(kit, this.physics, this.frame);
    for (const r of d.rooms) b.room(r);

    for (const p of d.props) {
      const y = p.y ?? 0;
      const rot: [number, number, number] = [0, p.rot ?? 0, 0];
      switch (p.kind) {
        case 'desk':
          b.solid('dark', p.w ?? 2.4, 0.9, p.d ?? 0.9, p.x, y + 0.45, p.z, rot);
          kit.box('light', (p.w ?? 2.4) * 0.8, 0.04, 0.4, { x: p.x, y: y + 0.92, z: p.z }, rot);
          break;
        case 'bunk':
          for (let i = 0; i < 2; i++) b.solid('metal', 2, 0.35, 0.9, p.x, y + 0.3 + i * 1.1, p.z, rot);
          kit.box('fabric', 1.9, 0.1, 0.85, { x: p.x, y: y + 0.52, z: p.z }, rot);
          break;
        case 'rack':
          b.solid('dark', p.w ?? 0.8, p.h ?? 2.2, p.d ?? 1.4, p.x, y + (p.h ?? 2.2) / 2, p.z, rot);
          kit.box('stripe', 0.05, (p.h ?? 2.2) * 0.8, 0.05, { x: p.x + (p.w ?? 0.8) / 2 + 0.01, y: y + (p.h ?? 2.2) / 2, z: p.z }, rot);
          break;
        case 'table':
          b.solid('dark', p.w ?? 2.6, 0.08, p.d ?? 1.3, p.x, y + 0.78, p.z, rot);
          break;
        case 'crate':
          b.solid('metal', p.w ?? 1.2, p.h ?? 0.9, p.d ?? 0.9, p.x, y + (p.h ?? 0.9) / 2, p.z, rot);
          break;
        case 'plant':
          kit.cyl('dark', 0.3, 0.25, 0.5, { x: p.x, y: y + 0.25, z: p.z }, undefined, 8);
          kit.cyl('plant', 0.35, 0.1, 0.6, { x: p.x, y: y + 0.8, z: p.z }, undefined, 6);
          break;
        case 'pillar':
          b.solid('wall', p.w ?? 1.2, p.h ?? 6, p.d ?? 1.2, p.x, y + (p.h ?? 6) / 2, p.z, rot);
          kit.box('stripe', 0.06, (p.h ?? 6) * 0.9, (p.d ?? 1.2) + 0.02, { x: p.x, y: y + (p.h ?? 6) / 2, z: p.z }, rot);
          break;
        case 'glyphwall': {
          kit.box('dark', p.w ?? 4, p.h ?? 3, 0.2, { x: p.x, y: y + (p.h ?? 3) / 2 + 0.4, z: p.z }, rot);
          for (let i = 0; i < 12; i++) {
            const gx = ((i % 4) - 1.5) * ((p.w ?? 4) / 4.5), gy = Math.floor(i / 4) * 0.8 + 0.9;
            kit.box('stripe', 0.3 + (i % 3) * 0.12, 0.05, 0.03, { x: p.x + gx * Math.cos(p.rot ?? 0), y: y + gy, z: p.z + 0.11 - gx * Math.sin(p.rot ?? 0) }, [0, p.rot ?? 0, (i % 5) * 0.4]);
          }
          break;
        }
        case 'pool':
          kit.cyl('water', p.w ?? 3, p.w ?? 3, 0.1, { x: p.x, y: y + 0.05, z: p.z }, undefined, 32);
          break;
        case 'plinth':
          b.solid('dark', p.w ?? 1.2, p.h ?? 1, p.d ?? 1.2, p.x, y + (p.h ?? 1) / 2, p.z, rot);
          kit.box('stripe', (p.w ?? 1.2) + 0.02, 0.05, (p.d ?? 1.2) + 0.02, { x: p.x, y: y + (p.h ?? 1) - 0.05, z: p.z }, rot);
          break;
        case 'screen':
          kit.box('light', p.w ?? 2, p.h ?? 1.1, 0.05, { x: p.x, y: y + 1.7, z: p.z }, rot);
          break;
        case 'tank':
          b.solid('metal', 1.6, p.h ?? 2.6, 1.6, p.x, y + (p.h ?? 2.6) / 2, p.z, rot);
          kit.cyl('metal', 0.8, 0.8, p.h ?? 2.6, { x: p.x, y: y + (p.h ?? 2.6) / 2, z: p.z }, undefined, 14);
          break;
      }
    }
    this.frame.add(kit.build({ castShadow: false }));

    // Lights
    this.scene.add(new THREE.HemisphereLight(alien ? '#6a5acd' : '#e6eeff', alien ? '#08060f' : '#3a3f46', alien ? 0.25 : 0.3));
    for (const l of d.lights) {
      const pl = new THREE.PointLight(l.color ?? (alien ? '#8a6cff' : '#fff1dc'), (l.intensity ?? 60) * (alien ? 1 : 0.55), l.range ?? 16, 1.6);
      pl.position.set(l.x, l.y ?? 2.6, l.z);
      this.frame.add(pl);
    }
    if (d.outside) this.buildOutside(d.outside);

    // Interactive points
    for (const p of d.points) {
      const size = p.size ?? [0.8, 1.2, 0.8];
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        new THREE.MeshStandardMaterial({ color: alien ? '#07060a' : '#2b3038', emissive: p.color ?? (alien ? '#7a5cff' : '#4fd1ff'), emissiveIntensity: 0.5, metalness: alien ? 1 : 0.2, roughness: alien ? 0.1 : 0.6 }),
      );
      m.position.set(p.x, p.y, p.z);
      this.frame.add(m);
      this.points.set(p.id, m);
      const vis = () => !p.visibleIf || game.store.check(p.visibleIf);
      registerPoiInteract(game, this, p.id, m, p, vis);
      if (p.scan) this.scannables.push({ entry: p.scan, object: m, range: 10 });
    }

    for (const sp of d.spawns) this.spawns[sp.id] = { id: sp.id, position: new THREE.Vector3(sp.x, 0.1, sp.z), yaw: sp.yaw };
    if (d.spots.length) {
      const spots: Record<string, Spot> = {};
      for (const s of d.spots) spots[s.id] = { position: new THREE.Vector3(s.x, 0, s.z), yaw: s.yaw };
      this.crew = new CrewRuntime(game, this, spots, (_x, _z, fb) => fb, navFromRooms(d.rooms));
      const c = this.crew;
      this.scope.add(() => c.dispose());
    }
    this.onStateChanged();
  }

  private buildOutside(o: NonNullable<InteriorDef['outside']>): void {
    const geo = new THREE.PlaneGeometry(4000, 4000, 40, 40);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      pos.setY(i, Math.sin(x * 0.01) + Math.cos(z * 0.013) + Math.max(0, r - 600) * 0.15);
    }
    geo.computeVertexNormals();
    // Unlit: a directional "sun" here would also shine through the (unshadowed) ceiling onto the floor.
    const mat = new THREE.MeshBasicMaterial({ color: o.ground });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = -8;
    this.scene.add(ground);
    this.scope.own(geo);
    this.scope.own(mat);
    if (o.fog) this.scene.fog = new THREE.Fog(o.sky, o.fog[0], o.fog[1]);
  }

  override onStateChanged(): void {
    const store = this.game.store;
    for (const p of this.def.points) {
      const o = this.points.get(p.id);
      if (o && p.visibleIf) o.visible = store.check(p.visibleIf);
    }
    this.crew?.refresh();
  }

  override update(dt: number): void {
    this.t += dt;
    this.crew?.update(dt);
    if (this.seamMat) {
      const ph = (this.game.store.state.clock % 19.69) / 19.69;
      this.seamMat.emissiveIntensity = 1.2 + (ph < 0.08 ? 3 * (1 - ph / 0.08) : 0);
    }
    this.particles.update(dt);
    this.glowParticles.update(dt);
  }

  override onEnter(): void {
    const store = this.game.store;
    store.discover(this.id);
    const e = this.def.onEnter;
    if (e && !store.state.flags[e.flag]) {
      store.setFlag(e.flag, true);
      if (e.notify) pushNotification(e.notify, 'info');
      const say = (this.game.story as unknown as { say?: (l: [string, string][]) => void }).say;
      if (e.lines?.length) say?.(e.lines);
    }
  }
}
