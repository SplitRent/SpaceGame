import * as THREE from 'three';
import { PanelController } from '../../interaction/PanelController';
import type { Game } from '../../Game';
import { ScreenDisplay, ScreenUI } from '../../render/screen';

/**
 * First-person relay alignment panel on Earthrise Summit. The player steers the dish in
 * azimuth/elevation with physical buttons while watching the signal-strength display,
 * then locks the link. Completing it performs the real `comms.long:align` repair step.
 */
export class RelayPanel extends PanelController {
  private az = -0.35;
  private el = 0.22;
  private readonly targetAz = 0.08;
  private readonly targetEl = -0.04;
  private screen: ScreenDisplay;
  private panel: THREE.Group;
  private t = 0;

  constructor(game: Game, relay: THREE.Group) {
    const panel = new THREE.Group();
    panel.position.set(0, 1.0, 1.1);
    relay.add(panel);
    super(game, panel, { pos: new THREE.Vector3(0, 0.62, 1.05), target: new THREE.Vector3(0, 0.05, 0), fov: 52 }, 'Relay alignment');
    this.panel = panel;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.12), new THREE.MeshStandardMaterial({ color: '#3a4048', roughness: 0.6 }));
    panel.add(body);
    this.screen = new ScreenDisplay(512, 256, 0.56, 0.28, (ctx, w, h) => this.draw(ctx, w, h));
    this.screen.mesh.position.set(0, 0.1, 0.065);
    panel.add(this.screen.mesh);
    const mkButton = (label: string, x: number, y: number, color: string, onClick: () => void, enabled = () => true) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.04), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
      b.position.set(x, y, 0.075);
      panel.add(b);
      this.controls.push({ id: label, object: b, label: () => label, enabled, onClick });
    };
    const step = 0.03;
    mkButton('Azimuth ◀', -0.33, -0.2, '#4fd1ff', () => this.nudge(-step, 0));
    mkButton('Azimuth ▶', -0.2, -0.2, '#4fd1ff', () => this.nudge(step, 0));
    mkButton('Elevation ▼', 0.2, -0.2, '#9b8cff', () => this.nudge(0, -step));
    mkButton('Elevation ▲', 0.33, -0.2, '#9b8cff', () => this.nudge(0, step));
    mkButton('LOCK LINK', 0, -0.2, '#3ee08f', () => this.lock(), () => this.signal() > 0.9);
    this.refresh();
  }

  private nudge(daz: number, del: number): void {
    this.az += daz;
    this.el += del;
    this.game.audio.play('switch', 0.5);
    this.refresh();
  }

  signal(): number {
    const e = (this.az - this.targetAz) ** 2 + (this.el - this.targetEl) ** 2;
    return Math.exp(-e * 90);
  }

  private lock(): void {
    const game = this.game;
    game.repairStep('comms.long', 'align', 'comms.long');
    game.audio.play('confirm');
    game.closePanel();
  }

  override refresh(): void {
    this.screen.redraw(this.t);
  }

  override update(dt: number): void {
    super.update(dt);
    this.t += dt;
    if (this.isOpen && Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) this.refresh();
  }

  private draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ScreenUI.bg(ctx, w, h, '#06121a');
    ScreenUI.title(ctx, 'Relay · Earth link');
    const sig = this.signal();
    ScreenUI.text(ctx, `AZ ${(this.az * 57.3).toFixed(1)}°   EL ${(this.el * 57.3).toFixed(1)}°`, 18, 72);
    ScreenUI.text(ctx, 'SIGNAL', 18, 112, '#9fe8ff', 16, true);
    ScreenUI.bar(ctx, 100, 98, 380, 18, sig, sig > 0.9 ? '#3ee08f' : sig > 0.4 ? '#ffc857' : '#ff5a5a');
    // Scope: target blip relative to boresight
    const cx = 380, cy = 180, r = 60;
    ctx.strokeStyle = 'rgba(120,220,255,0.4)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();
    const bx = cx + Math.max(-1, Math.min(1, (this.targetAz - this.az) * 4)) * r;
    const by = cy - Math.max(-1, Math.min(1, (this.targetEl - this.el) * 4)) * r;
    ctx.fillStyle = '#6fb3ff';
    ctx.beginPath();
    ctx.arc(bx, by, 7 + Math.sin(this.t * 6) * 2, 0, Math.PI * 2);
    ctx.fill();
    ScreenUI.text(ctx, sig > 0.9 ? 'CARRIER ACQUIRED — LOCK' : 'Steer to centre the Earth carrier', 18, 160, sig > 0.9 ? '#3ee08f' : '#cfe9f2', 16);
    ScreenUI.text(ctx, 'DSN-S band · 2.2 GHz', 18, 200, '#7d8a96', 14);
  }

  protected override onClose(): void {
    this.screen.dispose();
    this.panel.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.panel.removeFromParent();
  }
}
