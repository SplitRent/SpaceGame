import * as THREE from 'three';
import { PanelController } from '../../interaction/PanelController';
import type { Game } from '../../Game';
import { ScreenDisplay, ScreenUI } from '../../render/screen';
import { STARMAP, TRANSIT_SECONDS } from '../../content/starmap';
import { BODIES } from '../../content/bodies';
import { ZONES } from '../../content/zones';

const COLORS: Record<string, string> = {
  mercury: '#b8b0a8', venus: '#f2dfae', earth: '#5aa8ff', moon: '#d8d6d0', mars: '#ff7a4a', ceres: '#a9a39a',
  jupiter: '#e9c9a0', saturn: '#f0dca0', uranus: '#9fe8f0', neptune: '#5a86ff', pluto: '#e6d2b8',
};

/** Log-compressed orbit radius (m on the table) so Mercury and Pluto both fit. */
const orbitR = (au: number) => 0.1 * Math.log2(1 + au * 3);

/**
 * The bridge holo table: a first-person holographic chart of the Solar System. Point at a
 * world to learn about it and why it can or cannot be reached; plot a course with the
 * physical PLOT COURSE key. Everything shown comes from content + state (TravelSystem).
 */
export class StarMapPanel extends PanelController {
  private holo = new THREE.Group();
  private screen: ScreenDisplay;
  private selected: string | null = null;
  private bodyPos = new Map<string, THREE.Vector3>();
  private selRing: THREE.Mesh;
  private hereRing: THREE.Mesh;
  private routeLine: THREE.Line;
  private routeDot: THREE.Mesh;
  private t = 0;
  private owned: { dispose(): void }[] = [];

  constructor(game: Game, tableRoot: THREE.Object3D) {
    super(game, tableRoot, { pos: new THREE.Vector3(0, 1.15, 0.85), target: new THREE.Vector3(0, -0.4, -0.1), fov: 60 }, 'Holographic star map');
    const additive = (color: string, opacity = 0.85) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      this.owned.push(m);
      return m;
    };
    const geo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.owned.push(g);
      return g;
    };
    this.holo.position.y = 0.14;
    tableRoot.add(this.holo);

    // Projector disc and grid rings
    const disc = new THREE.Mesh(geo(new THREE.CircleGeometry(0.8, 48)), additive('#0c3a4a', 0.16));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.13;
    this.holo.add(disc);
    const lineMat = new THREE.LineBasicMaterial({ color: '#4fd1ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.owned.push(lineMat);
    const circle = (r: number, tilt = 0) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * Math.sin(tilt), Math.sin(a) * r * Math.cos(tilt)));
      }
      const l = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(pts)), lineMat);
      this.holo.add(l);
    };

    // The Sun
    const sun = new THREE.Mesh(geo(new THREE.SphereGeometry(0.03, 16, 12)), additive('#ffd27a', 1));
    this.holo.add(sun);
    this.controls.push({ id: 'sun', object: sun, label: () => 'The Sun', enabled: () => true, onClick: () => this.select('sun') });

    // Planets on their (compressed) orbits, at fixed display longitudes
    const sphere = geo(new THREE.SphereGeometry(1, 14, 10));
    const proxyGeo = geo(new THREE.SphereGeometry(1, 8, 6));
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    this.owned.push(proxyMat);
    let lon = 0.6;
    for (const e of STARMAP) {
      const body = BODIES.find((b) => b.id === e.body);
      if (!body) continue;
      let p: THREE.Vector3;
      if (body.kind === 'moon' && body.parent) {
        const parent = this.bodyPos.get(body.parent);
        if (!parent) continue;
        p = parent.clone().add(parent.clone().setY(0).normalize().multiplyScalar(0.07)).add(new THREE.Vector3(0, 0.03, 0));
      } else {
        const r = orbitR(body.orbit);
        const tilt = body.id === 'pluto' ? THREE.MathUtils.degToRad(17) : 0;
        lon += 2.39996; // golden angle: evenly spread, deterministic
        p = new THREE.Vector3(Math.cos(lon) * r, Math.sin(lon) * r * Math.sin(tilt), Math.sin(lon) * r * Math.cos(tilt));
        if (body.id !== 'ceres') circle(r, tilt);
      }
      this.bodyPos.set(body.id, p);
      const size = body.radiusKm > 20000 ? 0.028 : body.radiusKm > 3000 ? 0.018 : 0.012;
      const m = new THREE.Mesh(sphere, additive(COLORS[body.id] ?? '#ffffff', 0.95));
      m.scale.setScalar(size);
      m.position.copy(p);
      this.holo.add(m);
      if (body.id === 'saturn') {
        const ring = new THREE.Mesh(geo(new THREE.RingGeometry(0.036, 0.05, 32)), additive('#f0dca0', 0.5));
        ring.rotation.x = -Math.PI / 2 + 0.45;
        ring.position.copy(p);
        this.holo.add(ring);
      }
      const proxy = new THREE.Mesh(proxyGeo, proxyMat);
      proxy.scale.setScalar(body.kind === 'moon' ? 0.03 : 0.045);
      proxy.position.copy(p);
      this.holo.add(proxy);
      const id = body.id;
      this.controls.push({ id, object: proxy, label: () => `${body.name} — ${this.game.travel.status(e).ok ? 'course available' : 'details'}`, enabled: () => true, onClick: () => this.select(id) });
    }
    // Asteroid belt: a haze of points between 2.2 and 3.3 AU
    {
      const n = 500;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = (i * 2.39996) % (Math.PI * 2);
        const r = orbitR(2.2 + ((i * 0.618) % 1) * 1.1);
        pos.set([Math.cos(a) * r, ((i * 0.37) % 1 - 0.5) * 0.01, Math.sin(a) * r], i * 3);
      }
      const g = geo(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({ color: '#8fa0a8', size: 0.006, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      this.owned.push(pm);
      this.holo.add(new THREE.Points(g, pm));
    }
    // Markers
    this.selRing = new THREE.Mesh(geo(new THREE.RingGeometry(0.04, 0.046, 32)), additive('#ffb347', 1));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.hereRing = new THREE.Mesh(geo(new THREE.RingGeometry(0.03, 0.035, 32)), additive('#3ee08f', 1));
    this.hereRing.rotation.x = -Math.PI / 2;
    this.holo.add(this.selRing, this.hereRing);
    const routeMat = new THREE.LineDashedMaterial({ color: '#ffb347', dashSize: 0.015, gapSize: 0.01, transparent: true, opacity: 0.9 });
    this.owned.push(routeMat);
    this.routeLine = new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])), routeMat);
    this.routeLine.visible = false;
    this.routeDot = new THREE.Mesh(geo(new THREE.SphereGeometry(0.008, 8, 6)), additive('#ffffff', 1));
    this.routeDot.visible = false;
    this.holo.add(this.routeLine, this.routeDot);

    // Chart display, standing at the far side of the table
    this.screen = new ScreenDisplay(900, 520, 1.25, 0.72, (ctx, w, h) => this.draw(ctx, w, h));
    this.screen.mesh.position.set(0, 0.55, -0.98);
    this.screen.mesh.rotation.x = -0.12;
    tableRoot.add(this.screen.mesh);
    // Pedestal carrying the display and the keys
    const pedMat = new THREE.MeshStandardMaterial({ color: '#23282f', roughness: 0.5, metalness: 0.4 });
    this.owned.push(pedMat);
    const ped = new THREE.Mesh(geo(new THREE.BoxGeometry(0.9, 0.24, 0.08)), pedMat);
    ped.position.set(0, 0.12, -0.94);
    tableRoot.add(ped);
    const post = new THREE.Mesh(geo(new THREE.BoxGeometry(0.08, 0.3, 0.06)), pedMat);
    post.position.set(0, 0.36, -0.99);
    tableRoot.add(post);
    const key = (label: () => string, x: number, color: string, enabled: () => boolean, onClick: () => void) => {
      const k = new THREE.Mesh(geo(new THREE.BoxGeometry(0.3, 0.08, 0.04)), new THREE.MeshStandardMaterial({ color: '#1b1f24', emissive: color, emissiveIntensity: 0.6 }));
      this.owned.push(k.material as THREE.Material);
      // Physical keys on the chart pedestal, just under the display
      k.position.set(x, 0.14, -0.88);
      tableRoot.add(k);
      this.controls.push({ id: `key.${x}`, object: k, label, enabled, onClick });
      return k;
    };
    key(() => (this.selected ? `PLOT COURSE — ${this.nameOf(this.selected)}` : 'PLOT COURSE (select a world first)'), 0.2, '#3ee08f', () => this.canPlot(), () => this.plot());
    key(() => 'Centre on current position', -0.2, '#4fd1ff', () => true, () => this.select(this.game.travel.currentBody()));
    this.refresh();
  }

  private nameOf(id: string): string {
    return BODIES.find((b) => b.id === id)?.name ?? id;
  }

  private canPlot(): boolean {
    const e = this.selected ? this.game.travel.entry(this.selected) : undefined;
    return !!e && this.game.travel.status(e).ok;
  }

  private select(id: string | null): void {
    this.selected = id;
    this.game.audio.play('switch', 0.4);
    this.refresh();
  }

  private plot(): void {
    if (!this.selected) return;
    if (this.game.travel.plot(this.selected)) {
      this.game.audio.play('confirm');
      this.game.closePanel();
    }
  }

  /** The hologram only projects with reactor power (or before the crash). */
  setPowered(on: boolean): void {
    this.holo.visible = on;
    this.screen.powered = on;
    this.screen.redraw(this.t);
  }

  override refresh(): void {
    const here = this.game.travel.currentBody();
    const hp = here ? this.bodyPos.get(here) : undefined;
    this.hereRing.visible = !!hp;
    if (hp) this.hereRing.position.copy(hp);
    const sp = this.selected ? this.bodyPos.get(this.selected) ?? (this.selected === 'sun' ? new THREE.Vector3() : undefined) : undefined;
    this.selRing.visible = !!sp;
    if (sp) this.selRing.position.copy(sp);
    // Transit route
    const p = this.game.store.state.ship.parking;
    if (p.kind === 'transit') {
      const a = this.bodyPos.get(ZONES[p.from]?.body ?? '');
      const b = this.bodyPos.get(ZONES[p.to]?.body ?? '');
      if (a && b) {
        this.routeLine.geometry.setFromPoints([a, b]);
        this.routeLine.computeLineDistances();
        this.routeLine.visible = true;
        this.routeDot.visible = true;
        this.routeDot.position.copy(a).lerp(b, p.elapsed / p.duration);
      }
    } else {
      this.routeLine.visible = false;
      this.routeDot.visible = false;
    }
    this.screen.redraw(this.t);
  }

  override update(dt: number): void {
    super.update(dt);
    this.t += dt;
    const pulse = 1 + Math.sin(this.t * 4) * 0.15;
    this.hereRing.scale.setScalar(pulse);
    this.selRing.rotation.z += dt;
    if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2) && (this.isOpen || this.game.store.state.ship.parking.kind === 'transit')) this.refresh();
  }

  private draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const store = this.game.store;
    const s = store.state;
    ScreenUI.bg(ctx, w, h, '#04121a');
    const here = this.game.travel.currentBody();
    const p = s.ship.parking;
    const where = p.kind === 'transit' ? `In transit to ${ZONES[p.to]?.name} · ${Math.round((p.elapsed / p.duration) * 100)}%` : `Current position: ${here ? this.nameOf(here) : '—'}${p.kind === 'surface' ? ' (surface)' : p.kind === 'docked' ? ' (docked)' : ' (orbit)'}`;
    ScreenUI.text(ctx, where, 24, h - 58, '#3ee08f', 24);
    ScreenUI.text(ctx, `Propellant ${Math.round(s.ship.propellant)} kg`, 24, h - 22, '#9aa8b4', 22);
    if (!this.selected) {
      ScreenUI.title(ctx, 'Solar System · navigation chart', 24, 48);
      ScreenUI.text(ctx, 'Point at a world and click to select it.', 24, 116, '#cfe9f2', 28);
      ScreenUI.text(ctx, 'Orbits are log-scaled to fit the table.', 24, 160, '#9aa8b4', 22);
      return;
    }
    const body = BODIES.find((b) => b.id === this.selected);
    if (!body) return;
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(body.name.toUpperCase(), 24, 50);
    const dist = body.kind === 'moon' ? `${body.orbit.toLocaleString()} km from ${this.nameOf(body.parent ?? '')}` : body.kind === 'star' ? 'Centre of the Solar System' : `${body.orbit} AU from the Sun`;
    ScreenUI.text(ctx, `${body.kind.toUpperCase()} · r ${body.radiusKm.toLocaleString()} km · g ${body.gravity} m/s²`, 24, 90, '#9fe8ff', 22);
    ScreenUI.text(ctx, dist, 24, 120, '#9fe8ff', 22);
    let y = 156;
    for (const line of wrap(ctx, [body.atmosphere, ...body.facts].join('  ·  '), w - 48, 21)) {
      ScreenUI.text(ctx, line, 24, y, '#cfe9f2', 21);
      y += 27;
      if (y > 260) break;
    }
    const e = this.game.travel.entry(body.id);
    if (!e) {
      ScreenUI.text(ctx, 'Not a navigation target.', 24, 300, '#9aa8b4', 24);
      return;
    }
    const st = this.game.travel.status(e);
    if (e.zone) {
      ScreenUI.text(ctx, `Transfer: ${e.realTime} · ${TRANSIT_SECONDS} s cruise`, 24, 296, '#cfe9f2', 21);
      ScreenUI.text(ctx, `Burn: ${e.cost} kg propellant`, 24, 326, '#cfe9f2', 21);
    }
    let yy = 370;
    const color = st.ok ? '#3ee08f' : st.locked ? '#ff7b7b' : '#ffc857';
    const msg = st.ok ? 'COURSE AVAILABLE — press PLOT COURSE' : st.reason ?? '';
    for (const line of wrap(ctx, msg, w - 48, 24)) {
      ScreenUI.text(ctx, line, 24, yy, color, 24, true);
      yy += 30;
    }
  }

  protected override onClose(): void {
    this.refresh();
  }

  dispose(): void {
    this.screen.dispose();
    for (const o of this.owned) o.dispose();
    this.holo.removeFromParent();
    this.screen.mesh.removeFromParent();
    for (const c of this.controls) if (c.id.startsWith('key.')) c.object.removeFromParent();
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number): string[] {
  ctx.font = `${size}px system-ui, sans-serif`;
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = wd;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
