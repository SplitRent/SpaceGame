import * as THREE from 'three';
import { RAPIER, GROUP, groups } from '../physics/Physics';
import type { PhysicsWorld } from '../physics/Physics';
import { Astronaut, PLAYER_LOOK } from '../procgen/astronaut';
import type { Input } from '../input/Input';
import { clamp, damp } from '../engine/math';

const RADIUS = 0.34;
const HALF = 0.56; // capsule half-height (cylinder part)
export const PLAYER_HEIGHT = (HALF + RADIUS) * 2;
export const EYE_HEIGHT = 1.62;

export interface MoveTuning {
  walk: number;
  sprint: number;
  jumpHeight: number;
  groundAccel: number;
  airAccel: number;
}

/**
 * On-foot player controller built on Rapier's kinematic character controller.
 * The body/collider are re-created in each location's physics world when the player
 * is attached, and removed on detach, so there is never more than one player body.
 */
export class Player {
  readonly model: Astronaut;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  sprinting = false;
  crouching = false;
  /** Seconds airborne. */
  airTime = 0;
  /** Latest landing impact speed (for damage/feedback), consumed by Game. */
  landingImpact = 0;
  /** When false, movement input is ignored (dialogue, panel, cinematic). */
  controlEnabled = true;
  frozen = false;

  private physics: PhysicsWorld | null = null;
  private body: RAPIER.RigidBody | null = null;
  private collider: RAPIER.Collider | null = null;
  private controller: RAPIER.KinematicCharacterController | null = null;
  private gravity = 9.8;
  private speedSmoothed = 0;
  private lastPos = new THREE.Vector3();
  private stepTimer = 0;
  onFootstep: ((lowG: boolean) => void) | null = null;

  constructor() {
    this.model = new Astronaut({ ...PLAYER_LOOK }, { headLamp: true });
  }

  attach(physics: PhysicsWorld, scene: THREE.Scene, pos: THREE.Vector3, yaw: number): void {
    this.detach();
    this.physics = physics;
    this.gravity = -physics.world.gravity.y;
    const w = physics.world;
    this.body = w.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + HALF + RADIUS, pos.z),
    );
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(groups(GROUP.PLAYER, GROUP.STATIC | GROUP.DYNAMIC)),
      this.body,
    );
    const c = w.createCharacterController(0.02);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    c.enableAutostep(0.35, 0.2, false);
    c.enableSnapToGround(0.3);
    c.setSlideEnabled(true);
    c.setApplyImpulsesToDynamicBodies(true);
    this.controller = c;
    this.position.copy(pos);
    this.lastPos.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.airTime = 0;
    scene.add(this.model.root);
    this.syncModel();
  }

  detach(): void {
    if (this.physics && this.controller) {
      try {
        this.physics.world.removeCharacterController(this.controller);
      } catch {
        /* world may already be freed */
      }
    }
    this.controller = null;
    this.body = null;
    this.collider = null;
    this.physics = null;
    this.model.root.removeFromParent();
  }

  get attached(): boolean {
    return !!this.controller;
  }

  get lowGravity(): boolean {
    return this.gravity < 4;
  }

  tuning(): MoveTuning {
    if (this.gravity < 4) return { walk: 2.4, sprint: 4.2, jumpHeight: 1.1, groundAccel: 7, airAccel: 1.6 };
    if (this.gravity < 7) return { walk: 3, sprint: 5, jumpHeight: 0.9, groundAccel: 12, airAccel: 2 };
    return { walk: 3.4, sprint: 6, jumpHeight: 0.85, groundAccel: 16, airAccel: 2.5 };
  }

  /** Teleport (spawn resolver, respawn). */
  teleport(pos: THREE.Vector3, yaw?: number): void {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.body?.setNextKinematicTranslation({ x: pos.x, y: pos.y + HALF + RADIUS, z: pos.z });
    this.body?.setTranslation({ x: pos.x, y: pos.y + HALF + RADIUS, z: pos.z }, true);
    this.lastPos.copy(pos);
    this.syncModel();
  }

  /** Look input is applied by the camera director (it knows the active view). */
  applyLook(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -1.45, 1.45);
  }

  update(dt: number, input: Input, staminaOk: boolean): void {
    if (!this.controller || !this.collider || !this.body) return;
    const t = this.tuning();
    const ctx = 'gameplay' as const;
    const canMove = this.controlEnabled && !this.frozen;
    let ix = 0;
    let iz = 0;
    if (canMove) {
      ix = input.axis('left', 'right', ctx);
      iz = input.axis('back', 'forward', ctx);
    }
    this.sprinting = canMove && staminaOk && input.held('sprint', ctx) && iz > 0;
    this.crouching = canMove && input.held('crouch', ctx);
    const speed = (this.sprinting ? t.sprint : t.walk) * (this.crouching ? 0.5 : 1);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);

    const accel = this.grounded ? t.groundAccel : t.airAccel;
    const k = damp(accel, dt);
    this.velocity.x += (wish.x - this.velocity.x) * k;
    this.velocity.z += (wish.z - this.velocity.z) * k;

    if (this.grounded && canMove && input.justPressed('jump', ctx)) {
      this.velocity.y = Math.sqrt(2 * this.gravity * t.jumpHeight);
      this.grounded = false;
    }
    this.velocity.y -= this.gravity * dt;
    // Terminal velocity guard (prevents tunnelling after long falls).
    this.velocity.y = Math.max(this.velocity.y, -50);

    const desired = this.velocity.clone().multiplyScalar(dt);
    this.controller.computeColliderMovement(this.collider, { x: desired.x, y: desired.y, z: desired.z });
    const mv = this.controller.computedMovement();
    const cur = this.body.translation();
    const next = { x: cur.x + mv.x, y: cur.y + mv.y, z: cur.z + mv.z };
    this.body.setNextKinematicTranslation(next);
    this.body.setTranslation(next, true);

    const wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();
    if (this.grounded) {
      if (!wasGrounded && this.airTime > 0.25) this.landingImpact = Math.max(this.landingImpact, -this.velocity.y);
      if (this.velocity.y < 0) this.velocity.y = -0.5;
      this.airTime = 0;
    } else {
      this.airTime += dt;
      // Hit ceiling
      if (mv.y < desired.y * 0.5 && desired.y > 0) this.velocity.y = 0;
    }
    // Horizontal velocity correction when blocked by walls
    if (dt > 0) {
      const actualVX = mv.x / dt;
      const actualVZ = mv.z / dt;
      if (Math.abs(actualVX) < Math.abs(this.velocity.x)) this.velocity.x = actualVX;
      if (Math.abs(actualVZ) < Math.abs(this.velocity.z)) this.velocity.z = actualVZ;
    }

    this.position.set(next.x, next.y - HALF - RADIUS, next.z);
    const horiz = Math.hypot(this.position.x - this.lastPos.x, this.position.z - this.lastPos.z) / Math.max(dt, 1e-4);
    this.speedSmoothed += (horiz - this.speedSmoothed) * damp(10, dt);
    this.lastPos.copy(this.position);

    // Footsteps
    if (this.grounded && this.speedSmoothed > 0.5) {
      this.stepTimer -= dt * (this.speedSmoothed / (this.lowGravity ? 1.6 : 1.3));
      if (this.stepTimer <= 0) {
        this.stepTimer = this.lowGravity ? 0.9 : 0.55;
        this.onFootstep?.(this.lowGravity);
      }
    }
    this.syncModel();
    this.model.animate(dt, this.speedSmoothed, this.grounded, 'idle', this.gravity);
  }

  get horizontalSpeed(): number {
    return this.speedSmoothed;
  }

  /** Head position in world space. */
  head(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + EYE_HEIGHT * (this.crouching ? 0.75 : 1), this.position.z);
  }

  lookDir(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  private syncModel(): void {
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw + Math.PI;
    this.model.lookPitch = -this.pitch * 0.6;
  }
}
