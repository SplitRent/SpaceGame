import * as THREE from 'three';
import { KitBuilder, stdMat } from './kit';
import { Rng } from '../engine/Rng';
import type { Game } from '../Game';
import type { Location } from '../locations/Location';
import type { FaunaDef } from '../content/worldTypes';
import { pushNotification } from '../ui/uiState';

/**
 * Life on Vesper b. Under an orange K-dwarf, photosynthesis favours dark red-violet
 * pigments that soak up the reddish light; bioluminescence helps in the long terminator
 * dusk. Flora is instanced; fauna is a light-weight agent system (grazers, kites, stalkers).
 */

type FloraKind = 'frond' | 'sail' | 'bulb' | 'moss';

function floraPrototype(kind: FloraKind): THREE.Group {
  const k = new KitBuilder({
    stem: stdMat('#3a1f2e', { roughness: 0.8 }),
    leaf: stdMat('#5a1f45', { roughness: 0.7, side: THREE.DoubleSide }),
    tip: stdMat('#0a1a1a', { emissive: '#3fffd8', emissiveIntensity: 1.6 }),
    bulb: stdMat('#1a0a20', { emissive: '#ff8ae0', emissiveIntensity: 1.4 }),
    moss: stdMat('#4a1830', { roughness: 1 }),
  });
  switch (kind) {
    case 'frond':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        k.add('leaf', new THREE.ConeGeometry(0.06, 1.2, 4), { x: Math.cos(a) * 0.15, y: 0.6, z: Math.sin(a) * 0.15 }, [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]);
        k.add('tip', new THREE.SphereGeometry(0.05, 5, 4), { x: Math.cos(a) * 0.4, y: 1.15, z: Math.sin(a) * 0.4 });
      }
      break;
    case 'sail':
      k.cyl('stem', 0.18, 0.3, 7, { x: 0, y: 3.5, z: 0 }, undefined, 7);
      k.add('leaf', new THREE.PlaneGeometry(4.5, 3.2), { x: 0, y: 7.2, z: 0.2 }, [-0.25, 0, 0]);
      k.add('tip', new THREE.SphereGeometry(0.12, 6, 4), { x: 0, y: 8.9, z: 0.4 });
      break;
    case 'bulb':
      k.cyl('stem', 0.03, 0.05, 1.4, { x: 0, y: 0.7, z: 0 }, undefined, 5);
      k.add('bulb', new THREE.SphereGeometry(0.22, 10, 8), { x: 0, y: 1.5, z: 0 });
      k.cyl('stem', 0.02, 0.04, 0.9, { x: 0.3, y: 0.45, z: 0.1 }, [0, 0, -0.3], 5);
      k.add('bulb', new THREE.SphereGeometry(0.14, 8, 6), { x: 0.45, y: 0.95, z: 0.1 });
      break;
    case 'moss':
      k.add('moss', new THREE.CircleGeometry(1.4, 9), { x: 0, y: 0.04, z: 0 }, [-Math.PI / 2, 0, 0]);
      break;
  }
  return k.build({ castShadow: kind === 'sail' });
}

/** Instanced alien flora. The sail-trees' broad leaves face the unmoving star. */
export function buildFlora(
  loc: Location,
  area: { count: number; x: number; z: number; r: number },
  heightAt: (x: number, z: number) => number,
  avoid: (x: number, z: number) => boolean,
  sunDir: THREE.Vector3,
  seed: number,
): THREE.Group {
  const root = new THREE.Group();
  const rng = new Rng(seed);
  const kinds: [FloraKind, number][] = [['moss', 0.35], ['frond', 0.3], ['bulb', 0.2], ['sail', 0.15]];
  const facing = Math.atan2(sunDir.x, sunDir.z);
  for (const [kind, share] of kinds) {
    const proto = floraPrototype(kind);
    const n = Math.round(area.count * share);
    const mats: THREE.Matrix4[] = [];
    let tries = 0;
    while (mats.length < n && tries++ < n * 6) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * area.r;
      const x = area.x + Math.cos(a) * r, z = area.z + Math.sin(a) * r;
      if (avoid(x, z)) continue;
      const s = kind === 'sail' ? rng.range(0.7, 1.4) : rng.range(0.6, 1.5);
      const yaw = kind === 'sail' ? facing + rng.range(-0.3, 0.3) : rng.range(0, Math.PI * 2);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - 0.05, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
      mats.push(m);
      if (kind === 'sail') loc.physics.addBall(new THREE.Vector3(x, heightAt(x, z) + 1, z), 0.4 * s);
    }
    for (const child of proto.children) {
      const mesh = child as THREE.Mesh;
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.max(1, mats.length));
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.count = mats.length;
      im.castShadow = mesh.castShadow;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      root.add(im);
    }
  }
  return root;
}

/* -------------------------------- Fauna -------------------------------- */

interface Creature {
  kind: FaunaDef['kind'];
  group: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  home: THREE.Vector3;
  range: number;
  t: number;
  cooldown: number;
  target: THREE.Vector3;
  alt: number;
}

function creatureModel(kind: FaunaDef['kind']): { group: THREE.Group; legs: THREE.Object3D[]; wings: THREE.Object3D[] } {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const wings: THREE.Object3D[] = [];
  if (kind === 'grazer') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), stdMat('#6b3a52', { roughness: 0.8 }));
    body.scale.set(1.1, 0.8, 1.6);
    body.position.y = 1.5;
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), stdMat('#1a0a14', { emissive: '#3fffd8', emissiveIntensity: 0.9 }));
    back.scale.set(1.2, 0.35, 1.8);
    back.position.set(0, 2.2, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), stdMat('#5a2f44'));
    head.position.set(0, 1.5, 1.7);
    group.add(body, back, head);
    for (let i = 0; i < 6; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 1.3, 5), stdMat('#3a1f2e'));
      const pivot = new THREE.Group();
      pivot.position.set(i % 2 ? 0.8 : -0.8, 1.4, -0.9 + Math.floor(i / 2) * 0.9);
      leg.position.y = -0.65;
      pivot.add(leg);
      group.add(pivot);
      legs.push(pivot);
    }
  } else if (kind === 'kite') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 6), stdMat('#2a1030', { emissive: '#ff8ae0', emissiveIntensity: 0.5 }));
    body.rotation.x = Math.PI / 2;
    group.add(body);
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1), new THREE.MeshStandardMaterial({ color: '#7a2a6a', side: THREE.DoubleSide, transparent: true, opacity: 0.85, emissive: '#3a0a30' }));
      const pivot = new THREE.Group();
      w.position.x = side * 1.2;
      w.rotation.x = -Math.PI / 2;
      pivot.add(w);
      group.add(pivot);
      wings.push(pivot);
    }
  } else {
    // Stalker: low, long, many-limbed; eyes glow faintly
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2.4, 4, 8), stdMat('#12090f', { roughness: 0.4, metalness: 0.2 }));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.8;
    group.add(body);
    for (const side of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
      eye.position.set(side, 1.0, 1.65);
      group.add(eye);
    }
    for (let i = 0; i < 8; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 1.1, 4), stdMat('#12090f'));
      const pivot = new THREE.Group();
      pivot.position.set(i % 2 ? 0.45 : -0.45, 0.8, -1.2 + Math.floor(i / 2) * 0.8);
      leg.position.y = -0.5;
      pivot.add(leg);
      group.add(pivot);
      legs.push(pivot);
    }
  }
  group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return { group, legs, wings };
}

export class FaunaSystem {
  private creatures: Creature[] = [];
  private warned = false;

  constructor(private game: Game, private loc: Location, defs: FaunaDef[], private heightAt: (x: number, z: number) => number, seed: number) {
    const rng = new Rng(seed);
    for (const d of defs)
      for (let i = 0; i < d.count; i++) {
        const { group, legs, wings } = creatureModel(d.kind);
        const a = rng.range(0, Math.PI * 2);
        const r = Math.sqrt(rng.next()) * d.r;
        const pos = new THREE.Vector3(d.x + Math.cos(a) * r, 0, d.z + Math.sin(a) * r);
        pos.y = heightAt(pos.x, pos.z);
        const s = d.kind === 'grazer' ? rng.range(0.8, 1.3) : d.kind === 'kite' ? rng.range(0.7, 1.2) : rng.range(0.9, 1.1);
        group.scale.setScalar(s);
        loc.scene.add(group);
        const c: Creature = {
          kind: d.kind, group, legs, wings, pos, heading: rng.range(0, 6.28), speed: 0,
          home: new THREE.Vector3(d.x, 0, d.z), range: d.r, t: rng.range(0, 10), cooldown: 0,
          target: pos.clone(), alt: rng.range(14, 32),
        };
        this.creatures.push(c);
        loc.scannables.push({ entry: `db.${d.kind}`, object: group, range: d.kind === 'kite' ? 60 : 30 });
      }
  }

  update(dt: number): void {
    const game = this.game;
    const player = game.player.position;
    const lampOn = game.suit.headlamp;
    const look = game.player.lookDir();
    for (const c of this.creatures) {
      c.t += dt;
      c.cooldown = Math.max(0, c.cooldown - dt);
      const toPlayer = new THREE.Vector3(player.x - c.pos.x, 0, player.z - c.pos.z);
      const dist = toPlayer.length();
      let desired = c.target.clone();
      let speed = 0;
      if (c.kind === 'grazer') {
        if (dist < 12) {
          desired = c.pos.clone().addScaledVector(toPlayer.normalize(), -20);
          speed = 5;
        } else {
          if (c.pos.distanceTo(c.target) < 2 || c.t > 12) {
            c.t = 0;
            const a = Math.random() * Math.PI * 2;
            c.target.set(c.home.x + Math.cos(a) * c.range * Math.random(), 0, c.home.z + Math.sin(a) * c.range * Math.random());
          }
          speed = 1.2;
        }
      } else if (c.kind === 'kite') {
        const a = c.t * 0.25 + c.alt;
        desired.set(c.home.x + Math.cos(a) * c.range * 0.6, 0, c.home.z + Math.sin(a) * c.range * 0.6);
        speed = 7;
      } else {
        // Stalker: circles in, charges, retreats from a lit headlamp pointed at it.
        const facing = -toPlayer.clone().normalize().dot(new THREE.Vector3(look.x, 0, look.z).normalize());
        const lit = lampOn && dist < 22 && facing > 0.75;
        if (lit) {
          desired = c.pos.clone().addScaledVector(toPlayer.normalize(), -25);
          speed = 7;
          if (!this.warned) {
            this.warned = true;
            pushNotification('The stalker recoils from your headlamp.', 'discovery');
          }
        } else if (dist < 45 && c.cooldown <= 0) {
          desired = player.clone();
          speed = dist < 12 ? 6.5 : 2.5;
          if (dist < 1.8) {
            c.cooldown = 8;
            const s = game.store.state.player;
            s.health = Math.max(1, s.health - 12);
            game.cam.addShake(0.6);
            game.audio.play('impact', 0.7);
            pushNotification('Something struck you from the dark! Stalkers shy away from light (L).', 'warn');
          }
        } else if (c.cooldown > 0) {
          desired = c.pos.clone().addScaledVector(toPlayer.normalize(), -15);
          speed = 4;
        } else {
          if (c.pos.distanceTo(c.target) < 2 || c.t > 10) {
            c.t = 0;
            const a = Math.random() * Math.PI * 2;
            c.target.set(c.home.x + Math.cos(a) * c.range * Math.random(), 0, c.home.z + Math.sin(a) * c.range * Math.random());
          }
          desired = c.target.clone();
          speed = 1.5;
        }
      }
      // Stay within the home range
      const fromHome = new THREE.Vector3(desired.x - c.home.x, 0, desired.z - c.home.z);
      if (fromHome.length() > c.range * 1.3) desired.set(c.home.x, 0, c.home.z).addScaledVector(fromHome.normalize(), c.range * 1.3);
      const dir = new THREE.Vector3(desired.x - c.pos.x, 0, desired.z - c.pos.z);
      if (dir.lengthSq() > 0.01) {
        const want = Math.atan2(dir.x, dir.z);
        let dh = want - c.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        c.heading += dh * Math.min(1, dt * 3);
      }
      c.speed += (speed - c.speed) * Math.min(1, dt * 2);
      c.pos.x += Math.sin(c.heading) * c.speed * dt;
      c.pos.z += Math.cos(c.heading) * c.speed * dt;
      const ground = this.heightAt(c.pos.x, c.pos.z);
      c.pos.y = c.kind === 'kite' ? ground + c.alt + Math.sin(c.t) * 2 : ground;
      c.group.position.copy(c.pos);
      c.group.rotation.set(c.kind === 'kite' ? Math.sin(c.t * 0.7) * 0.2 : 0, c.heading, c.kind === 'kite' ? -0.3 : 0);
      const gait = c.t * (2 + c.speed * 1.5);
      c.legs.forEach((l, i) => (l.rotation.x = Math.sin(gait + (i % 2) * Math.PI + Math.floor(i / 2)) * Math.min(0.6, c.speed * 0.2)));
      c.wings.forEach((w, i) => (w.rotation.z = Math.sin(c.t * 5) * 0.5 * (i ? -1 : 1)));
    }
  }

  dispose(): void {
    for (const c of this.creatures) c.group.removeFromParent();
    this.creatures = [];
    void this.loc;
  }
}
