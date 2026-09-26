import * as THREE from 'three';
import { Rng } from '../engine/Rng';
import { createPlanet, type PlanetHandle } from './planets';

/**
 * Airless-world sky: a deterministic starfield with a Milky Way band, the Sun disc with
 * glare, and optionally Earth at its true angular size (~2°). The sky group follows the
 * camera so it is effectively at infinity, but still depth-tests against near terrain —
 * which is how ridges can genuinely hide Earth from the crash site.
 */
export class Sky {
  readonly group = new THREE.Group();
  readonly stars: THREE.Points;
  readonly sunDisc: THREE.Mesh;
  earth: PlanetHandle | null = null;
  readonly radius: number;
  sunDir = new THREE.Vector3(1, 0.1, 0).normalize();
  earthDir = new THREE.Vector3(-1, 0.02, 0).normalize();
  private starMat: THREE.ShaderMaterial;

  constructor(opts: { radius?: number; starCount?: number; seed?: number; earth?: boolean } = {}) {
    this.radius = opts.radius ?? 9000;
    const R = this.radius;
    const rng = new Rng(opts.seed ?? 42);
    const n = opts.starCount ?? 7000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    // Galactic plane tilted relative to our frame
    const galN = new THREE.Vector3(0.3, 0.8, 0.52).normalize();
    const v = new THREE.Vector3();
    const tint = [new THREE.Color('#9fbfff'), new THREE.Color('#ffffff'), new THREE.Color('#fff1d8'), new THREE.Color('#ffd2a1'), new THREE.Color('#ffb38a')];
    for (let i = 0; i < n; i++) {
      // 45% of stars concentrated toward the galactic plane
      for (;;) {
        v.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
        const l = v.length();
        if (l > 1 || l < 0.01) continue;
        v.divideScalar(l);
        if (i % 20 < 9) {
          const d = Math.abs(v.dot(galN));
          if (rng.next() > Math.exp(-d * d * 60)) continue;
        }
        break;
      }
      pos[i * 3] = v.x * R;
      pos[i * 3 + 1] = v.y * R;
      pos[i * 3 + 2] = v.z * R;
      const mag = Math.pow(rng.next(), 6); // few bright stars
      const c = tint[Math.floor(rng.next() * tint.length)];
      const b = 0.35 + mag * 1.9;
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
      size[i] = 1.2 + mag * 3.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uBright: { value: 1 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: `attribute float aSize; attribute vec3 color; varying vec3 vCol; uniform float uPixelRatio;
        void main(){ vCol = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = aSize*uPixelRatio; }`,
      fragmentShader: `varying vec3 vCol; uniform float uBright;
        void main(){ vec2 d = gl_PointCoord-0.5; float r = dot(d,d); if(r>0.25) discard; float a = 1.0 - r*4.0; gl_FragColor = vec4(vCol*uBright*a, 1.0); }`,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -10;
    this.group.add(this.stars);

    // Milky Way diffuse band
    const mw = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.99, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
        uniforms: { uN: { value: galN }, uBright: this.starMat.uniforms.uBright },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vDir; uniform vec3 uN; uniform float uBright;
          float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
          float n3(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
          void main(){ float d = abs(dot(normalize(vDir), uN));
            float band = exp(-d*d*28.0);
            float cl = n3(vDir*6.0)*0.6 + n3(vDir*14.0)*0.4;
            float dust = smoothstep(0.55,0.75, n3(vDir*9.0+3.0)) * exp(-d*d*200.0);
            vec3 c = mix(vec3(0.55,0.6,0.8), vec3(0.9,0.8,0.65), cl) * band * (0.4+0.6*cl) * (1.0-dust*0.8);
            gl_FragColor = vec4(c*0.07*uBright, 1.0); }`,
      }),
    );
    mw.renderOrder = -11;
    this.group.add(mw);

    // Sun disc + glare
    this.sunDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 0.12, R * 0.12),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; vec4 mv = modelViewMatrix*vec4(0.0,0.0,0.0,1.0); mv.xy += position.xy; gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.0;
          float core = smoothstep(0.075,0.06,d);
          float glow = pow(max(0.0,1.0-d),5.0)*0.8 + pow(max(0.0,1.0-d),24.0)*3.0;
          vec3 c = vec3(1.0,0.97,0.9)*(core*20.0 + glow);
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    this.sunDisc.renderOrder = -9;
    this.group.add(this.sunDisc);

    if (opts.earth) {
      const earthR = R * Math.tan(THREE.MathUtils.degToRad(0.95));
      this.earth = createPlanet('earth', earthR, { segments: 64 });
      this.group.add(this.earth.group);
      // Earth must depth-test against terrain but render after the star layer.
      this.earth.group.traverse((o) => (o.renderOrder = -8));
    }
  }

  update(camPos: THREE.Vector3, time: number, starBrightness = 1): void {
    this.group.position.copy(camPos);
    this.sunDisc.position.copy(this.sunDir).multiplyScalar(this.radius * 0.95);
    this.starMat.uniforms.uBright.value = starBrightness;
    if (this.earth) {
      this.earth.group.position.copy(this.earthDir).multiplyScalar(this.radius * 0.9);
      // Earth phase is lit by the same Sun
      this.earth.update(time, this.sunDir);
    }
  }

  dispose(): void {
    this.earth?.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.group.removeFromParent();
  }
}
