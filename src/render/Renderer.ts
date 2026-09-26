import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

export type QualityPreset = 'low' | 'medium' | 'high';

export interface QualitySettings {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  antialias: boolean;
  drawDistance: number;
}

export const QUALITY: Record<QualityPreset, QualitySettings> = {
  low: { pixelRatio: 0.75, shadows: false, shadowMapSize: 1024, bloom: false, antialias: false, drawDistance: 0.6 },
  medium: { pixelRatio: 1, shadows: true, shadowMapSize: 2048, bloom: true, antialias: true, drawDistance: 0.85 },
  high: { pixelRatio: Math.min(window.devicePixelRatio, 2), shadows: true, shadowMapSize: 4096, bloom: true, antialias: true, drawDistance: 1 },
};

/**
 * Owns the WebGL renderer and post-processing chain. Supports a two-layer render:
 * an optional "background" scene/camera (e.g. planets, space) is drawn first, and the
 * main scene (e.g. ship interior or local area) is drawn on top with a cleared depth.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  private renderPass: RenderPass;
  private bgPass: RenderPass;
  private bloom: BloomEffect;
  private effectPass: EffectPass;
  private vignette: VignetteEffect;
  quality: QualitySettings;
  preset: QualityPreset;
  scene: THREE.Scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  bgScene: THREE.Scene | null = null;
  bgCamera: THREE.Camera | null = null;

  constructor(readonly canvas: HTMLCanvasElement, preset: QualityPreset = 'medium') {
    this.preset = preset;
    this.quality = QUALITY[preset];
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      logarithmicDepthBuffer: false,
    });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping; // done in post
    this.gl.shadowMap.enabled = this.quality.shadows;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.setPixelRatio(this.quality.pixelRatio);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 20000);

    this.composer = new EffectComposer(this.gl, { frameBufferType: THREE.HalfFloatType });
    this.bgPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bgPass.enabled = false;
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new BloomEffect({ intensity: 1.1, luminanceThreshold: 0.75, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
    this.vignette = new VignetteEffect({ darkness: 0.45, offset: 0.3 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const smaa = new SMAAEffect();
    this.effectPass = new EffectPass(this.camera, this.bloom, tone, this.vignette, smaa);
    this.composer.addPass(this.bgPass);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.effectPass);
    this.applyQuality();
    this.resize();
  }

  setQuality(preset: QualityPreset): void {
    this.preset = preset;
    this.quality = QUALITY[preset];
    this.gl.setPixelRatio(this.quality.pixelRatio);
    this.gl.shadowMap.enabled = this.quality.shadows;
    this.applyQuality();
    this.resize();
    // Force materials to recompile for shadow changes.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((mm) => (mm.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
  }

  private applyQuality(): void {
    this.bloom.blendMode.opacity.value = this.quality.bloom ? 1 : 0;
  }

  setScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.scene = scene;
    this.camera = camera;
    this.renderPass.mainScene = scene;
    this.renderPass.mainCamera = camera;
    this.effectPass.mainCamera = camera;
    this.resize();
  }

  /** Configure the optional background layer (drawn before the main scene). */
  setBackground(scene: THREE.Scene | null, camera: THREE.Camera | null): void {
    this.bgScene = scene;
    this.bgCamera = camera;
    if (scene && camera) {
      this.bgPass.mainScene = scene;
      this.bgPass.mainCamera = camera;
      this.bgPass.enabled = true;
      // Main layer keeps the background colour but clears depth so it draws on top.
      this.renderPass.clearPass.enabled = true;
      this.renderPass.clearPass.setClearFlags(false, true, false);
      this.renderPass.ignoreBackground = true;
    } else {
      this.bgPass.enabled = false;
      this.renderPass.clearPass.enabled = true;
      this.renderPass.clearPass.setClearFlags(true, true, true);
      this.renderPass.ignoreBackground = false;
    }
  }

  setVignette(darkness: number): void {
    this.vignette.darkness = darkness;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const bg = this.bgCamera as THREE.PerspectiveCamera | null;
    if (bg && 'aspect' in bg) {
      bg.aspect = w / h;
      bg.updateProjectionMatrix();
    }
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  stats(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.gl.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }
}
