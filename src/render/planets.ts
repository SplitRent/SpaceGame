import * as THREE from 'three';
import { NOISE3 } from './glsl';

/**
 * Procedural planet renderer grounded in each body's real appearance (see content/bodies.ts
 * `visual`). One shader handles rocky, gas-giant, Earth and star surfaces; atmospheres,
 * clouds and rings are separate shells.
 */
export type PlanetKind =
  | 'sun' | 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn'
  | 'uranus' | 'neptune' | 'pluto' | 'charon' | 'europa' | 'ganymede' | 'titan' | 'phobos';

const KIND_ID: Record<PlanetKind, number> = {
  sun: 0, earth: 1, moon: 2, mercury: 2, mars: 3, venus: 4, jupiter: 5, saturn: 5, uranus: 6, neptune: 7,
  pluto: 8, charon: 2, europa: 9, ganymede: 2, titan: 4, phobos: 2,
};

interface Palette {
  a: string;
  b: string;
  c: string;
  atmo: string | null;
  atmoStrength: number;
}

const PALETTES: Record<PlanetKind, Palette> = {
  sun: { a: '#fff4d6', b: '#ffcf6b', c: '#ff9a3c', atmo: '#ffcf6b', atmoStrength: 1.2 },
  earth: { a: '#ffffff', b: '#ffffff', c: '#ffffff', atmo: '#6fb3ff', atmoStrength: 1.0 },
  moon: { a: '#a9a7a2', b: '#5d5c5a', c: '#d8d6d0', atmo: null, atmoStrength: 0 },
  mercury: { a: '#8c8580', b: '#57524e', c: '#b8b0a8', atmo: null, atmoStrength: 0 },
  charon: { a: '#9b9794', b: '#5e4b44', c: '#c3c0bb', atmo: null, atmoStrength: 0 },
  ganymede: { a: '#8f8578', b: '#5a5249', c: '#c9c2b6', atmo: null, atmoStrength: 0 },
  phobos: { a: '#6b625b', b: '#4a4440', c: '#8a8078', atmo: null, atmoStrength: 0 },
  mars: { a: '#c1603a', b: '#7a3b25', c: '#e0a47a', atmo: '#e7b48a', atmoStrength: 0.35 },
  venus: { a: '#e8d9a8', b: '#d9c287', c: '#f4ebc9', atmo: '#f2dfae', atmoStrength: 0.8 },
  titan: { a: '#d9942e', b: '#b8741f', c: '#e8b35a', atmo: '#e0a040', atmoStrength: 0.9 },
  jupiter: { a: '#e9dcc3', b: '#b07a52', c: '#c9563b', atmo: '#e8d6b5', atmoStrength: 0.35 },
  saturn: { a: '#eadcae', b: '#c9ad73', c: '#b38d55', atmo: '#f0e2b8', atmoStrength: 0.35 },
  uranus: { a: '#b7e6ea', b: '#9fd6dd', c: '#c9f0f2', atmo: '#bdf0f5', atmoStrength: 0.5 },
  neptune: { a: '#3a64d8', b: '#26409e', c: '#e8f0ff', atmo: '#5a86ff', atmoStrength: 0.6 },
  pluto: { a: '#c9b49a', b: '#7a4a33', c: '#f2ede4', atmo: '#9ec3ff', atmoStrength: 0.15 },
  europa: { a: '#e8e0d0', b: '#a0603c', c: '#f6f2ea', atmo: null, atmoStrength: 0 },
};

const SURFACE_VERT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec2 vUv;
varying vec3 vWorldPos;
void main(){
  vUv = uv;
  vObjPos = normalize(position);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SURFACE_FRAG = /* glsl */ `
uniform int uKind;
uniform vec3 uSunDir;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uTime;
uniform float uSeed;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uRadius;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec2 vUv;
varying vec3 vWorldPos;
${NOISE3}
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
// Crater height field: bowls with raised rims from a 3D cell lattice (Worley-style).
float craterField(vec3 p, float scale){
  vec3 q = p * scale;
  vec3 ip = floor(q);
  float h = 0.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 c = ip + vec3(float(x), float(y), float(z));
    float rnd = hash13(c);
    if (rnd < 0.45) continue;
    vec3 ctr = c + vec3(hash13(c + 7.1), hash13(c + 3.7), hash13(c + 1.3));
    float r = 0.18 + 0.32 * hash13(c + 9.2);
    float d = length(q - ctr) / r;
    if (d < 1.0) h += (d * d - 1.0) * 0.8;
    else if (d < 1.6) h += 0.25 * (1.0 - (d - 1.0) / 0.6);
  }
  return h;
}
float crater(vec3 p, float scale){
  float n = abs(snoise(p*scale));
  return smoothstep(0.0, 0.25, n);
}
// Bump mapping without tangents (Mikkelsen): perturb N using screen-space height derivatives.
vec3 bumpNormal(vec3 N, vec3 pos, float h, float strength){
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * N - strength * grad);
}
void main(){
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndl = dot(N, L);
  vec3 p = vObjPos + uSeed;
  float lat = asin(clamp(vObjPos.y, -1.0, 1.0));
  vec3 col;
  float spec = 0.0;
  vec3 emissive = vec3(0.0);
  float terminatorSoft = 0.08;

  if (uKind == 0) { // star
    float g = fbm3(p*8.0 + vec3(uTime*0.05));
    col = mix(uColC, uColA, 0.6 + 0.4*g);
    float mu = max(dot(N, V), 0.0);
    col *= 0.55 + 0.45*pow(mu, 0.5);
    gl_FragColor = vec4(col*3.0, 1.0);
    return;
  } else if (uKind == 1) { // earth
    vec4 tex = texture2D(uMap, vUv);
    col = tex.rgb;
    float ocean = tex.a;
    vec3 H = normalize(L + V);
    spec = ocean * pow(max(dot(N, H), 0.0), 60.0) * 0.8;
    // city lights on the night side (land, populated latitudes)
    float night = smoothstep(0.05, -0.15, ndl);
    float cities = (1.0 - ocean) * smoothstep(0.55, 0.9, snoise(vObjPos*60.0)*0.5+0.5) * smoothstep(1.2, 0.2, abs(lat));
    emissive = vec3(1.0, 0.72, 0.38) * cities * night * 0.9;
  } else if (uKind == 2) { // airless rocky (moon, mercury...)
    float maria = smoothstep(0.1, 0.35, fbm3(p*1.3));
    col = mix(uColA, uColB, maria*0.8);
    float c1 = crater(p, 9.0);
    float c2 = crater(p, 23.0);
    col *= 0.78 + 0.14*c1 + 0.08*c2;
    float rays = smoothstep(0.75, 0.95, snoise(p*3.0)) * 0.25;
    col = mix(col, uColC, rays);
    // Relief: large and small craters plus rolling highlands, as a bump-mapped height.
    float hgt = craterField(p, 14.0) * 0.6 + craterField(p, 55.0) * 0.25 + craterField(p, 180.0) * 0.08 + fbm3(p * 30.0) * 0.15;
    N = bumpNormal(N, vWorldPos, hgt, uRadius * 0.012);
    ndl = dot(N, L);
    col *= 0.9 + 0.2*snoise(p*60.0);
    terminatorSoft = 0.02;
  } else if (uKind == 3) { // mars
    float dark = smoothstep(0.05, 0.4, fbm3(p*1.6));
    col = mix(uColA, uColB, dark*0.75);
    col = mix(col, uColC, smoothstep(0.3, 0.7, snoise(p*4.0))*0.25);
    float cap = smoothstep(1.2, 1.32, abs(lat) + 0.05*snoise(p*6.0));
    col = mix(col, vec3(0.95,0.94,0.92), cap);
    // Valles Marineris-like canyon streak near the equator
    float canyon = smoothstep(0.03, 0.0, abs(lat + 0.15 + 0.03*snoise(p*5.0))) * smoothstep(0.6, 0.2, abs(atan(vObjPos.z, vObjPos.x) - 1.2));
    col *= 1.0 - canyon*0.5;
  } else if (uKind == 4) { // thick featureless clouds (venus, titan)
    float n = fbm3(vec3(p.x*1.2 + uTime*0.01, p.y*3.0, p.z*1.2));
    col = mix(uColA, uColB, 0.5 + 0.5*n);
    col = mix(col, uColC, smoothstep(0.2, 0.6, snoise(vec3(lat*6.0, p.x*2.0, p.z*2.0)))*0.3);
    terminatorSoft = 0.25;
  } else if (uKind == 5) { // banded giants (jupiter, saturn)
    float turb = fbm3(p*vec3(3.0, 6.0, 3.0) + vec3(uTime*0.004, 0.0, 0.0));
    float bands = sin(lat*18.0 + turb*1.6) * 0.5 + 0.5;
    float fine = sin(lat*55.0 + turb*3.0) * 0.5 + 0.5;
    col = mix(uColA, uColB, bands);
    col = mix(col, uColA*1.05, fine*0.25);
    // Great Red Spot (jupiter palette only uses uColC as red)
    vec3 spotC = normalize(vec3(cos(-0.39)*cos(2.0), sin(-0.39), cos(-0.39)*sin(2.0)));
    float sd = distance(vObjPos, spotC);
    float spot = smoothstep(0.13, 0.06, length(vec2(sd*0.9, 0.0)) + 0.02*snoise(p*20.0)) * step(0.5, uSeed);
    col = mix(col, uColC, spot*0.85);
    float mu = max(dot(N, V), 0.0);
    col *= 0.7 + 0.3*pow(mu, 0.4);
    terminatorSoft = 0.12;
  } else if (uKind == 6) { // uranus: nearly featureless
    float n = snoise(vec3(p.x*0.8, lat*4.0, p.z*0.8));
    col = mix(uColA, uColB, 0.5 + 0.2*n);
    float mu = max(dot(N, V), 0.0);
    col *= 0.75 + 0.25*pow(mu, 0.5);
    terminatorSoft = 0.15;
  } else if (uKind == 7) { // neptune
    float turb = fbm3(p*vec3(2.0, 5.0, 2.0) + vec3(uTime*0.006, 0.0, 0.0));
    col = mix(uColA, uColB, sin(lat*10.0 + turb*2.0)*0.5 + 0.5);
    float cirrus = smoothstep(0.55, 0.8, snoise(vec3(p.x*6.0, lat*14.0, p.z*6.0)));
    col = mix(col, uColC, cirrus*0.6);
    vec3 spotC = normalize(vec3(0.6, -0.35, 0.72));
    float spot = smoothstep(0.12, 0.05, distance(vObjPos, spotC));
    col *= 1.0 - spot*0.55;
    terminatorSoft = 0.15;
  } else if (uKind == 8) { // pluto: bright heart (Sputnik Planitia), reddish tholins
    float base = fbm3(p*2.0);
    col = mix(uColA, uColB, smoothstep(-0.1, 0.4, base) * smoothstep(0.1, -0.6, vObjPos.y));
    // heart: two lobes near the equator facing +x
    vec3 h1 = normalize(vec3(0.95, 0.15, 0.25));
    vec3 h2 = normalize(vec3(0.9, 0.05, -0.3));
    float heart = max(smoothstep(0.42, 0.3, distance(vObjPos, h1)), smoothstep(0.36, 0.24, distance(vObjPos, h2)));
    col = mix(col, uColC, heart);
    col *= 0.9 + 0.15*snoise(p*20.0);
    terminatorSoft = 0.04;
  } else { // europa: bright ice with reddish lineae
    col = uColA;
    float lines = smoothstep(0.03, 0.0, abs(snoise(p*4.0))) + smoothstep(0.02, 0.0, abs(snoise(p*9.0 + 3.0)));
    col = mix(col, uColB, clamp(lines, 0.0, 1.0)*0.7);
    col = mix(col, uColB*0.8, smoothstep(0.3, 0.6, fbm3(p*2.0))*0.4);
  }
  float diff = smoothstep(-terminatorSoft, terminatorSoft*2.0 + 0.2, ndl) * max(ndl + terminatorSoft, 0.0) / (1.0 + terminatorSoft);
  vec3 lit = col * (diff * 1.6 + 0.012) + spec + emissive;
  gl_FragColor = vec4(lit, 1.0);
}`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main(){
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float rim = 1.0 - max(dot(N, V), 0.0);
  float lit = smoothstep(-0.35, 0.4, dot(N, normalize(uSunDir)));
  float a = pow(rim, 2.6) * lit * uStrength;
  // warm sunset tint at the terminator
  vec3 c = mix(uColor, vec3(1.0, 0.55, 0.3), smoothstep(0.35, 0.0, abs(dot(N, normalize(uSunDir)))) * 0.35);
  gl_FragColor = vec4(c * a * 1.6, a);
}`;

const ATMO_VERT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main(){
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const CLOUD_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec2 vUv;
varying vec3 vWorldPos;
${NOISE3}
void main(){
  vec3 p = vObjPos * 2.5 + vec3(uTime*0.003, 0.0, 0.0);
  float lat = asin(clamp(vObjPos.y, -1.0, 1.0));
  float n = fbm3(p + fbm3(p*1.7)*0.6);
  // More cloud in mid-latitude storm tracks and ITCZ, less in subtropics
  float belt = 0.55 + 0.25*cos(lat*6.0);
  float c = smoothstep(0.05, 0.45, n * belt + 0.08);
  vec3 N = normalize(vWorldNormal);
  float ndl = dot(N, normalize(uSunDir));
  float lit = smoothstep(-0.1, 0.3, ndl);
  gl_FragColor = vec4(vec3(1.0) * (0.03 + lit*1.4), c * 0.85);
}`;

const RING_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorldPos;
void main(){
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const RING_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
uniform float uInner;
uniform float uOuter;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vLocal;
varying vec3 vWorldPos;
float h(float x){ return fract(sin(x*127.1)*43758.5453); }
void main(){
  float r = length(vLocal.xy);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  // Radial structure: C ring (faint), B ring (bright), Cassini division, A ring, Encke gap
  float dens = 0.25;
  dens = mix(dens, 0.95, smoothstep(0.18, 0.22, t));
  dens = mix(dens, 0.05, smoothstep(0.585, 0.6, t) * (1.0 - smoothstep(0.64, 0.655, t)));
  dens = mix(dens, 0.7, smoothstep(0.655, 0.67, t));
  dens *= 1.0 - smoothstep(0.87, 0.875, t) * (1.0 - smoothstep(0.88, 0.885, t)) * 0.9;
  dens *= 1.0 - smoothstep(0.97, 1.0, t);
  dens *= 0.75 + 0.25*h(floor(r*400.0));
  // Planet shadow on rings
  vec3 L = normalize(uSunDir);
  vec3 toP = uPlanetCenter - vWorldPos;
  float tca = dot(toP, L);
  float d2 = dot(toP, toP) - tca*tca;
  float shadow = (tca > 0.0 && d2 < uPlanetRadius*uPlanetRadius) ? 0.08 : 1.0;
  vec3 col = uColor * (0.5 + 0.5*h(floor(r*90.0))) * shadow * 1.3;
  gl_FragColor = vec4(col, dens * uOpacity);
}`;

export interface PlanetHandle {
  group: THREE.Group;
  surface: THREE.Mesh;
  kind: PlanetKind;
  radius: number;
  update(time: number, sunDirWorld: THREE.Vector3): void;
  dispose(): void;
}

let earthTex: THREE.Texture | null = null;
function earthTexture(): THREE.Texture {
  if (!earthTex) {
    earthTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}data/earth_color.png`);
    earthTex.colorSpace = THREE.SRGBColorSpace;
    earthTex.anisotropy = 8;
    earthTex.userData.shared = true;
  }
  return earthTex;
}

export function createPlanet(kind: PlanetKind, radius: number, opts: { segments?: number; rings?: boolean } = {}): PlanetHandle {
  const seg = opts.segments ?? 96;
  const pal = PALETTES[kind];
  const group = new THREE.Group();
  group.name = `planet:${kind}`;
  const geo = new THREE.SphereGeometry(radius, seg, Math.round(seg * 0.6));
  const uniforms = {
    uKind: { value: KIND_ID[kind] },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uColA: { value: new THREE.Color(pal.a) },
    uColB: { value: new THREE.Color(pal.b) },
    uColC: { value: new THREE.Color(pal.c) },
    uTime: { value: 0 },
    uSeed: { value: kind === 'jupiter' ? 1 : kind === 'saturn' ? 0.2 : (kind.length * 0.37) % 1 },
    uMap: { value: kind === 'earth' ? earthTexture() : null },
    uHasMap: { value: kind === 'earth' ? 1 : 0 },
    uRadius: { value: radius },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG, uniforms });
  const surface = new THREE.Mesh(geo, mat);
  group.add(surface);
  const extras: { mat: THREE.ShaderMaterial; geo: THREE.BufferGeometry }[] = [];

  let clouds: THREE.Mesh | null = null;
  if (kind === 'earth') {
    const cg = new THREE.SphereGeometry(radius * 1.008, seg, Math.round(seg * 0.6));
    const cm = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: { uSunDir: uniforms.uSunDir, uTime: uniforms.uTime },
      transparent: true,
      depthWrite: false,
    });
    clouds = new THREE.Mesh(cg, cm);
    group.add(clouds);
    extras.push({ mat: cm, geo: cg });
  }
  if (pal.atmo && kind !== 'sun') {
    const ag = new THREE.SphereGeometry(radius * (kind === 'earth' ? 1.035 : 1.02), seg, Math.round(seg * 0.6));
    const am = new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: { uSunDir: uniforms.uSunDir, uColor: { value: new THREE.Color(pal.atmo) }, uStrength: { value: pal.atmoStrength } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Mesh(ag, am));
    extras.push({ mat: am, geo: ag });
  }
  if (kind === 'sun') {
    // Corona glow sprite
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 8, radius * 8),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {},
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; vec4 mv = modelViewMatrix*vec4(0.0,0.0,0.0,1.0); mv.xy += position.xy; gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.0; float a = pow(max(0.0,1.0-d),3.0)*0.9 + pow(max(0.0,1.0-d),12.0)*2.0; gl_FragColor = vec4(vec3(1.0,0.85,0.6)*a, a); }`,
      }),
    );
    glow.renderOrder = 2;
    group.add(glow);
    extras.push({ mat: glow.material as THREE.ShaderMaterial, geo: glow.geometry });
  }
  const ringUniforms = {
    uSunDir: uniforms.uSunDir,
    uPlanetCenter: { value: new THREE.Vector3() },
    uPlanetRadius: { value: radius },
    uInner: { value: radius * 1.24 },
    uOuter: { value: radius * 2.27 },
    uColor: { value: new THREE.Color(kind === 'saturn' ? '#e6d6b0' : '#8c8c8c') },
    uOpacity: { value: kind === 'saturn' ? 1.0 : 0.25 },
  };
  if (opts.rings || kind === 'saturn' || kind === 'uranus' || kind === 'neptune') {
    if (kind !== 'saturn') {
      ringUniforms.uInner.value = radius * 1.6;
      ringUniforms.uOuter.value = radius * 2.0;
    }
    const rg = new THREE.RingGeometry(ringUniforms.uInner.value, ringUniforms.uOuter.value, 256, 1);
    const rm = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: ringUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    extras.push({ mat: rm, geo: rg });
  }

  return {
    group,
    surface,
    kind,
    radius,
    update(time, sunDir) {
      uniforms.uTime.value = time;
      uniforms.uSunDir.value.copy(sunDir).normalize();
      group.getWorldPosition(ringUniforms.uPlanetCenter.value);
      if (clouds) clouds.rotation.y = time * 0.004;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      for (const e of extras) {
        e.geo.dispose();
        e.mat.dispose();
      }
      group.removeFromParent();
    },
  };
}
