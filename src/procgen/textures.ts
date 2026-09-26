import * as THREE from 'three';

/** Small procedural canvas textures (panel lines, grates, labels). Cached and shared. */
const cache = new Map<string, THREE.Texture>();

function make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}

/** Hull plating: light panels with thin seams and occasional darker plates. */
export function hullPanelTexture(): THREE.Texture {
  return make('hull', 512, (ctx, s) => {
    ctx.fillStyle = '#d8dbde';
    ctx.fillRect(0, 0, s, s);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < s; y += 64) {
      let x = 0;
      while (x < s) {
        const w = 64 * (1 + Math.floor(rnd() * 3));
        const shade = 205 + Math.floor(rnd() * 30);
        ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
        ctx.fillRect(x + 1, y + 1, w - 2, 62);
        if (rnd() < 0.08) {
          ctx.fillStyle = '#b9bec4';
          ctx.fillRect(x + 6, y + 6, w - 12, 50);
        }
        x += w;
      }
    }
    ctx.strokeStyle = 'rgba(60,65,72,0.55)';
    ctx.lineWidth = 2;
    for (let y = 0; y <= s; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
    }
    // rivets
    ctx.fillStyle = 'rgba(90,95,100,0.5)';
    for (let y = 4; y < s; y += 64) for (let x = 4; x < s; x += 16) ctx.fillRect(x, y, 2, 2);
  });
}

/** Floor grating for ship/station interiors. */
export function floorTexture(): THREE.Texture {
  return make('floor', 256, (ctx, s) => {
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#2a2e33';
    ctx.lineWidth = 3;
    for (let i = 0; i <= s; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(s, i);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < s; i += 32) for (let j = 0; j < s; j += 32) ctx.fillRect(i + 4, j + 4, 10, 10);
  });
}

/** Interior wall panels with a thin accent line. */
export function wallTexture(): THREE.Texture {
  return make('wall', 256, (ctx, s) => {
    ctx.fillStyle = '#c9ccd0';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#b7bbc0';
    ctx.fillRect(0, s * 0.62, s, s * 0.38);
    ctx.strokeStyle = 'rgba(40,44,50,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(0, s * 0.6, s, 4);
    ctx.fillStyle = 'rgba(40,44,50,0.35)';
    for (let i = 16; i < s; i += 48) ctx.fillRect(i, 20, 18, 6);
  });
}

/** Gold multi-layer insulation (MLI) crinkle. */
export function mliTexture(): THREE.Texture {
  return make('mli', 256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#c9962e');
    g.addColorStop(0.5, '#e8c46a');
    g.addColorStop(1, '#a8781e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 400; i++) {
      ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '255,240,200' : '90,60,10'},${0.15 + rnd() * 0.2})`;
      ctx.beginPath();
      const x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 60);
      ctx.stroke();
    }
  });
}

/** Tiny detail normal-ish grain for regolith (used as a roughness/colour modulation map). */
export function regolithDetailTexture(): THREE.Texture {
  return make('regolith', 512, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < s * s; i++) {
      const v = 200 + rnd() * 55;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // micro craters
    for (let i = 0; i < 120; i++) {
      const x = rnd() * s, y = rnd() * s, r = 2 + rnd() * rnd() * 22;
      const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
      g.addColorStop(0, 'rgba(120,120,120,0.55)');
      g.addColorStop(0.8, 'rgba(150,150,150,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
