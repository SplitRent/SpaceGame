import * as THREE from 'three';

/**
 * A diegetic in-world display backed by a canvas texture. Ship consoles draw their real
 * system state onto these; they are redrawn only when state changes (or on a slow tick
 * for animated readouts).
 */
export class ScreenDisplay {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshBasicMaterial;
  readonly mesh: THREE.Mesh;
  powered = true;

  constructor(
    readonly width: number,
    readonly height: number,
    worldW: number,
    worldH: number,
    private draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), this.material);
    this.redraw(0);
  }

  redraw(t: number): void {
    const { ctx, width: w, height: h } = this;
    ctx.save();
    if (!this.powered) {
      ctx.fillStyle = '#050607';
      ctx.fillRect(0, 0, w, h);
      // faint reflection
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else {
      this.draw(ctx, w, h, t);
      // scanlines
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

/** Shared console UI drawing helpers (consistent original visual identity). */
export const ScreenUI = {
  bg(ctx: CanvasRenderingContext2D, w: number, h: number, tint = '#08141c'): void {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,220,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  },
  title(ctx: CanvasRenderingContext2D, text: string, x = 18, y = 36, color = '#9fe8ff'): void {
    ctx.fillStyle = color;
    ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(text.toUpperCase(), x, y);
  },
  text(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#cfe9f2', size = 17, bold = false): void {
    ctx.fillStyle = color;
    ctx.font = `${bold ? 'bold ' : ''}${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(text, x, y);
  },
  bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, color = '#4fd1ff'): void {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
  },
  status(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, state: 'ok' | 'warn' | 'off' | 'fault'): void {
    const colors = { ok: '#3ee08f', warn: '#ffc857', off: '#56606b', fault: '#ff5a5a' };
    ctx.fillStyle = colors[state];
    ctx.beginPath();
    ctx.arc(x + 7, y - 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ScreenUI.text(ctx, label, x + 20, y, state === 'off' ? '#7d8a96' : '#d9f1ff', 16);
  },
};
