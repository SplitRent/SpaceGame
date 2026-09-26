import * as THREE from 'three';
import type { Game } from '../Game';
import type { Scannable, ToolTarget } from '../locations/Location';
import type { ScanHud } from '../ui/uiState';
import { pushNotification } from '../ui/uiState';

const ray = new THREE.Raycaster();

/**
 * Handheld equipment: the Scanner (hold F on a target) and the Multi-tool (hold mouse on
 * mining nodes / weld points). Both are physical: they need line of sight and range,
 * show a beam, and produce particles and sound.
 */
export class ToolSystem {
  scanHud: ScanHud | null = null;
  private scanTarget: Scannable | null = null;
  private scanProgress = 0;
  private scanResultTimer = 0;
  private workTarget: ToolTarget | null = null;
  private workProgress = 0;
  private sfxTimer = 0;
  private beam: THREE.Line | null = null;
  private lastResult: string | null = null;

  constructor(private game: Game) {}

  get label(): string {
    return 'Multi-tool · Scanner';
  }

  reset(): void {
    this.scanTarget = null;
    this.scanProgress = 0;
    this.workTarget = null;
    this.workProgress = 0;
    this.scanHud = null;
    this.beam?.removeFromParent();
    this.beam = null;
  }

  update(dt: number): void {
    const game = this.game;
    const loc = game.currentLocation;
    const input = game.input;
    if (!loc || !game.player.attached) return;
    const ctx = 'gameplay' as const;
    const cam = game.cam.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    ray.set(cam.position, dir);
    ray.far = 60;
    const head = game.player.head();

    /* ------------------------------ scanner ------------------------------ */
    const scanning = input.held('scan', ctx);
    this.scanResultTimer = Math.max(0, this.scanResultTimer - dt);
    if (scanning) {
      const hitScan = this.pick(loc.scannables.map((s) => ({ obj: s.object, item: s })), head, (s) => s.range ?? 40);
      if (hitScan && hitScan !== this.scanTarget) {
        this.scanTarget = hitScan;
        this.scanProgress = 0;
      }
      if (!hitScan) {
        this.scanTarget = null;
        this.scanProgress = 0;
      }
      if (this.scanTarget) {
        const entry = game.store.content.database[this.scanTarget.entry];
        const known = !!game.store.state.database[this.scanTarget.entry];
        const tierOk = !entry || entry.tier <= game.store.state.player.scannerTier;
        const time = known ? 0.4 : 1.6;
        this.scanProgress += dt / time;
        this.sfxTimer -= dt;
        if (this.sfxTimer <= 0) {
          this.sfxTimer = 0.6;
          game.audio.play('scan', 0.6);
        }
        if (this.scanProgress >= 1) {
          this.scanProgress = 0;
          const target = this.scanTarget;
          this.scanTarget = null;
          this.lastResult = this.completeScan(target.entry, tierOk);
          this.scanResultTimer = 3;
        }
        this.scanHud = {
          progress: Math.min(1, this.scanProgress),
          label: entry ? (known ? entry.title : 'Analyzing…') : 'Unknown',
          result: null,
        };
      } else {
        this.scanHud = { progress: 0, label: 'No scannable target', result: this.scanResultTimer > 0 ? this.lastResult : null };
      }
    } else {
      this.scanTarget = null;
      this.scanProgress = 0;
      this.scanHud = this.scanResultTimer > 0 ? { progress: 1, label: '', result: this.lastResult } : null;
    }

    /* ----------------------------- multi-tool ----------------------------- */
    const working = input.held('primary', ctx) && !scanning;
    let beamTo: THREE.Vector3 | null = null;
    if (working) {
      const candidates = loc.toolTargets.filter((t) => t.available()).map((t) => ({ obj: t.object, item: t }));
      const hit = this.pickWithPoint(candidates, head, (t) => t.range ?? 3.2);
      if (hit && hit.item !== this.workTarget) {
        this.workTarget = hit.item;
        this.workProgress = 0;
      }
      if (!hit) {
        this.workTarget = null;
        this.workProgress = 0;
      }
      if (this.workTarget && hit) {
        beamTo = hit.point;
        this.workProgress += dt / this.workTarget.workTime;
        this.sfxTimer -= dt;
        if (this.sfxTimer <= 0) {
          this.sfxTimer = 0.12;
          game.audio.play(this.workTarget.action === 'weld' ? 'weld' : 'mine', 0.5);
        }
        const vac = loc.env.atmosphere === 'vacuum';
        if (this.workTarget.action === 'mine') {
          loc.particles.emit({
            count: 3, position: hit.point, velocity: hit.normal.clone().multiplyScalar(1.5), spread: 1.2,
            life: [0.6, 1.4], size: 0.12, color: '#b9b4aa', gravity: loc.env.gravity, drag: vac ? 0 : 1.5,
          });
        } else {
          loc.glowParticles.emit({
            count: 4, position: hit.point, velocity: hit.normal.clone().multiplyScalar(2), spread: 2.5,
            life: [0.2, 0.5], size: 0.06, color: '#ffc36b', gravity: loc.env.gravity,
          });
        }
        if (this.workProgress >= 1) {
          this.workProgress = 0;
          this.workTarget.onComplete();
          game.cam.addShake(0.05);
        }
        game.store.markChanged('toolWork');
      }
    } else {
      this.workTarget = null;
      this.workProgress = 0;
    }
    this.updateBeam(beamTo);
    loc.particles.update(dt);
    loc.glowParticles.update(dt);
  }

  get workState(): { label: string; progress: number; detail: string | null } | null {
    if (!this.workTarget) return null;
    return { label: this.workTarget.label, progress: this.workProgress, detail: this.workTarget.detail?.() ?? null };
  }

  private completeScan(entryId: string, tierOk: boolean): string {
    const game = this.game;
    const store = game.store;
    const entry = store.content.database[entryId];
    if (!entry) return 'No data.';
    if (!tierOk) {
      game.audio.play('error', 0.6);
      return `${entry.title}: analysis requires scanner tier ${entry.tier}`;
    }
    game.audio.play('scanDone', 0.8);
    if (store.state.database[entryId]) return `${entry.title} — already catalogued`;
    store.batch('scan', () => {
      store.state.database[entryId] = { at: store.state.clock };
      store.markChanged('scan');
      if (entry.yields) for (const y of entry.yields) store.give(y.item, y.qty);
      if (entry.onScan) store.grant(`scan:${entryId}`, entry.onScan);
    });
    pushNotification(`Database: ${entry.title}`, 'discovery');
    return `${entry.title} — new database entry`;
  }

  private pick<T>(list: { obj: THREE.Object3D; item: T }[], head: THREE.Vector3, range: (t: T) => number): T | null {
    return this.pickWithPoint(list, head, range)?.item ?? null;
  }

  private pickWithPoint<T>(
    list: { obj: THREE.Object3D; item: T }[],
    head: THREE.Vector3,
    range: (t: T) => number,
  ): { item: T; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    if (!list.length) return null;
    const owners = new Map<THREE.Object3D, T>();
    for (const l of list) owners.set(l.obj, l.item);
    const hits = ray.intersectObjects(list.map((l) => l.obj), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      let owner: T | undefined;
      while (o && (owner = owners.get(o)) === undefined) o = o.parent;
      if (owner === undefined) continue;
      if (h.point.distanceTo(head) > range(owner)) return null;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      return { item: owner, point: h.point.clone(), normal };
    }
    return null;
  }

  private updateBeam(to: THREE.Vector3 | null): void {
    const loc = this.game.currentLocation;
    if (!loc) return;
    if (!to) {
      if (this.beam) this.beam.visible = false;
      return;
    }
    if (!this.beam) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const m = new THREE.LineBasicMaterial({ color: '#ffd28a', transparent: true, opacity: 0.85 });
      this.beam = new THREE.Line(g, m);
      this.beam.frustumCulled = false;
    }
    if (this.beam.parent !== loc.scene) loc.scene.add(this.beam);
    const p = this.game.player;
    const hand = p.position.clone().add(new THREE.Vector3(Math.cos(p.yaw) * 0.3, 1.2, -Math.sin(p.yaw) * 0.3));
    if (this.game.cam.effectiveView === 'first') {
      const cam = this.game.cam.camera;
      hand.copy(cam.position).add(new THREE.Vector3(0.25, -0.25, -0.4).applyQuaternion(cam.quaternion));
    }
    const pos = this.beam.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, hand.x, hand.y, hand.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    this.beam.visible = true;
    (this.beam.material as THREE.LineBasicMaterial).opacity = 0.5 + Math.random() * 0.5;
  }
}
