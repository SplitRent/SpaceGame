import * as THREE from 'three';
import { PanelController } from '../../interaction/PanelController';
import type { Game } from '../../Game';
import { ScreenDisplay, ScreenUI } from '../../render/screen';
import { registerPanel } from '../../interaction/namedPanels';

/** The three lines of the Cadence the nodes sang (Europa, Titan, Pluto), as glyph indices. */
const TARGET = [2, 5, 1];
const GLYPHS = 6;

function drawGlyph(ctx: CanvasRenderingContext2D, g: number, x: number, y: number, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  // Each glyph: g+1 spokes, rotated by g — simple, distinct, alien enough.
  for (let i = 0; i <= g; i++) {
    const a = (i / (g + 1)) * Math.PI * 2 + g * 0.4;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * The Door of the Threshold: three concentric rings of Builder glyphs. Turn each ring until
 * it shows the line of the Cadence its node sang (shown above), then open the way.
 */
export class GlyphPanel extends PanelController {
  private rings = [0, 3, 4];
  private screen: ScreenDisplay;
  private panel = new THREE.Group();
  private t = 0;

  constructor(game: Game, anchor: THREE.Object3D) {
    const panel = new THREE.Group();
    panel.position.set(0, 0.75, 0.2);
    panel.rotation.x = -0.35;
    anchor.add(panel);
    super(game, panel, { pos: new THREE.Vector3(0, 0.25, 1.15), target: new THREE.Vector3(0, 0.05, 0), fov: 50 }, 'The Door');
    this.panel = panel;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.05), new THREE.MeshStandardMaterial({ color: '#05030a', metalness: 1, roughness: 0.1, emissive: '#1a0f33', emissiveIntensity: 0.6 }));
    panel.add(back);
    this.screen = new ScreenDisplay(640, 300, 1.1, 0.52, (ctx, w, h) => this.draw(ctx, w, h));
    this.screen.mesh.position.set(0, 0.1, 0.03);
    panel.add(this.screen.mesh);
    const key = (label: string, x: number, y: number, color: string, onClick: () => void, enabled = () => true) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.04), new THREE.MeshStandardMaterial({ color: '#05030a', emissive: color, emissiveIntensity: 1 }));
      b.position.set(x, y, 0.05);
      panel.add(b);
      this.controls.push({ id: label, object: b, label: () => label, enabled, onClick });
    };
    for (let i = 0; i < 3; i++) {
      const x = -0.37 + i * 0.37;
      key(`Turn ring ${i + 1} ◀`, x - 0.08, -0.27, '#7a5cff', () => this.turn(i, -1));
      key(`Turn ring ${i + 1} ▶`, x + 0.08, -0.27, '#7a5cff', () => this.turn(i, 1));
    }
    key('OPEN THE WAY', 0, -0.36, '#ffb070', () => this.openWay(), () => this.solved());
    this.refresh();
  }

  private turn(i: number, d: number): void {
    this.rings[i] = (this.rings[i] + d + GLYPHS) % GLYPHS;
    this.game.audio.play('switch', 0.5);
    this.refresh();
  }

  private solved(): boolean {
    return this.rings.every((r, i) => r === TARGET[i]);
  }

  private openWay(): void {
    const game = this.game;
    game.audio.play('powerUp');
    game.closePanel();
    game.store.setFlag('threshold.open', true);
    game.store.apply([{ story: 'gate.open' }]);
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
    ScreenUI.bg(ctx, w, h, '#05030c');
    ScreenUI.text(ctx, 'THE CADENCE — AS THE NODES SANG IT', 20, 30, '#b8a8ff', 16, true);
    const src = ['Europa', 'Titan', 'Pluto'];
    for (let i = 0; i < 3; i++) {
      const cx = 110 + i * 210;
      ScreenUI.text(ctx, src[i], cx - 30, 62, '#7d8a96', 14);
      drawGlyph(ctx, TARGET[i], cx, 105, 26, '#ffb070');
      const ok = this.rings[i] === TARGET[i];
      drawGlyph(ctx, this.rings[i], cx, 205, 40, ok ? '#3ee08f' : '#7a5cff');
      if (ok) ScreenUI.text(ctx, 'attuned', cx - 26, 268, '#3ee08f', 14);
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    if (this.solved()) ScreenUI.text(ctx, 'THE WAY IS READY', w - 200, 30, `rgba(255,176,112,${0.5 + pulse * 0.5})`, 16, true);
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

registerPanel('glyph', (game, anchor) => new GlyphPanel(game, anchor));
