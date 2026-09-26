import * as THREE from 'three';
import type { CameraView } from '../state/GameState';
import type { Player } from '../player/Player';
import type { PhysicsWorld } from '../physics/Physics';
import { damp } from '../engine/math';

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
}

/**
 * Owns the main camera. The player picks one of three views (first-person, third-person
 * behind, third-person front-facing). Other systems can take over the camera with an
 * override (panel focus, seats, cinematics); overrides always blend in/out smoothly and
 * restore the player's previous view.
 */
export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  view: CameraView = 'back';
  /** When set, the camera goes to this pose instead of following the player. */
  private override: CameraPose | null = null;
  private overrideBlend = 0;
  private overrideSpeed = 5;
  /** Instant override (cinematics drive the camera fully). */
  cinematic = false;
  baseFov = 70;
  private dist = 3.6;
  private smoothPos = new THREE.Vector3();
  private initialized = false;
  shake = 0;
  private shakeT = 0;
  /** Forces first-person (e.g. in tight panel areas). */
  forceFirst = false;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 20000);
  }

  get effectiveView(): CameraView {
    return this.forceFirst ? 'first' : this.view;
  }

  cycleView(): CameraView {
    this.view = this.view === 'first' ? 'back' : this.view === 'back' ? 'front' : 'first';
    return this.view;
  }

  setOverride(pose: CameraPose | null, speed = 5): void {
    this.override = pose;
    this.overrideSpeed = speed;
    if (!pose) this.cinematic = false;
  }

  get hasOverride(): boolean {
    return !!this.override;
  }

  /** Snap next frame (after teleport / location change). */
  snap(): void {
    this.initialized = false;
    this.overrideBlend = this.override ? 1 : 0;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  update(dt: number, player: Player | null, physics: PhysicsWorld | null): void {
    const cam = this.camera;
    this.shakeT += dt;
    this.shake = Math.max(0, this.shake - dt * 1.2);

    if (this.cinematic && this.override) {
      cam.position.copy(this.override.position);
      cam.lookAt(this.override.target);
      cam.fov = this.override.fov ?? this.baseFov;
      cam.updateProjectionMatrix();
      this.applyShake();
      return;
    }

    // Player-follow pose
    const followPos = new THREE.Vector3();
    const followTarget = new THREE.Vector3();
    if (player && player.attached) {
      const head = player.head();
      const look = player.lookDir();
      const view = this.effectiveView;
      player.model.setHeadVisible(view !== 'first');
      if (view === 'first') {
        followPos.copy(head).addScaledVector(look, 0.12);
        followTarget.copy(head).addScaledVector(look, 10);
      } else {
        const pivot = head.clone().add(new THREE.Vector3(0, 0.15, 0));
        const flatRight = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
        let dir: THREE.Vector3;
        if (view === 'back') {
          dir = look.clone().negate();
          pivot.addScaledVector(flatRight, 0.45);
        } else {
          dir = look.clone();
          dir.y = -dir.y;
        }
        let dist = this.dist;
        if (physics) dist = Math.min(dist, Math.max(0.3, physics.sphereCast(pivot, dir, 0.22, this.dist) - 0.05));
        followPos.copy(pivot).addScaledVector(dir, dist);
        if (view === 'back') followTarget.copy(pivot).addScaledVector(look, 20);
        else followTarget.copy(pivot);
        // Fade the model when the camera is jammed against it
        player.model.root.visible = dist > 0.6;
      }
      if (view === 'first') player.model.root.visible = true;
    }

    if (!this.initialized) {
      this.smoothPos.copy(followPos);
      this.initialized = true;
    } else {
      // First person must be rigid (no lag); third person has slight smoothing.
      const k = this.effectiveView === 'first' ? 1 : damp(18, dt);
      this.smoothPos.lerp(followPos, k);
    }

    const target = this.override ? 1 : 0;
    this.overrideBlend += (target - this.overrideBlend) * damp(this.overrideSpeed, dt);
    if (Math.abs(target - this.overrideBlend) < 0.001) this.overrideBlend = target;

    if (this.override && this.overrideBlend > 0) {
      const b = this.overrideBlend;
      cam.position.copy(this.smoothPos).lerp(this.override.position, b);
      const tgt = followTarget.clone().lerp(this.override.target, b);
      cam.lookAt(tgt);
      cam.fov = THREE.MathUtils.lerp(this.baseFov, this.override.fov ?? this.baseFov, b);
    } else {
      cam.position.copy(this.smoothPos);
      cam.lookAt(followTarget);
      cam.fov = this.baseFov;
    }
    cam.updateProjectionMatrix();
    this.applyShake();
  }

  private applyShake(): void {
    if (this.shake <= 0.001) return;
    const s = this.shake * this.shake * 0.04;
    const t = this.shakeT * 40;
    this.camera.rotation.x += Math.sin(t * 1.3) * s;
    this.camera.rotation.y += Math.sin(t * 1.7 + 1) * s;
    this.camera.rotation.z += Math.sin(t * 0.9 + 2) * s * 0.6;
  }
}
