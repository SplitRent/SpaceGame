import * as THREE from 'three';
import type { Input } from '../input/Input';
import { damp } from '../engine/math';

export interface FlightTuning {
  maxSpeed: number;
  boostSpeed: number;
  accel: number;
  boostAccel: number;
  strafeAccel: number;
  turnRate: number;
  rollRate: number;
  /** Speed cap (m/s) when out of propellant: electric RCS only. */
  rcsOnlySpeed: number;
}

export const DEFAULT_FLIGHT: FlightTuning = {
  maxSpeed: 450,
  boostSpeed: 1600,
  accel: 70,
  boostAccel: 260,
  strafeAccel: 35,
  turnRate: 1.1,
  rollRate: 1.4,
  rcsOnlySpeed: 60,
};

/**
 * Newtonian-lite 6DOF flight model with optional flight assist.
 * Assist ON: the ship damps toward throttle × forward velocity (arcade-friendly).
 * Assist OFF: pure thrust integration — you coast until you counter-burn.
 * Propellant is consumed by main-engine thrust; electric RCS always works (slowly),
 * so the player can never be stranded with an empty tank.
 */
export class FlightModel {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  private angVel = new THREE.Vector3();
  throttle = 0;
  assist = true;
  boosting = false;
  controlEnabled = true;
  tuning: FlightTuning = { ...DEFAULT_FLIGHT };
  /** Propellant consumed in this frame (kg). */
  burned = 0;

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.quaternion);
  }
  up(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.quaternion);
  }
  right(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(1, 0, 0).applyQuaternion(this.quaternion);
  }

  get speed(): number {
    return this.velocity.length();
  }

  update(dt: number, input: Input, mouse: { dx: number; dy: number }, sensitivity: number, hasPropellant: boolean): void {
    const ctx = 'flight' as const;
    const t = this.tuning;
    this.burned = 0;
    if (this.controlEnabled) {
      if (input.held('forward', ctx)) this.throttle = Math.min(1, this.throttle + dt * 0.6);
      if (input.held('back', ctx)) this.throttle = Math.max(this.assist ? -0.3 : 0, this.throttle - dt * 0.6);
      if (input.justPressed('flightAssist', ctx)) this.assist = !this.assist;
    }
    this.boosting = this.controlEnabled && input.held('boost', ctx) && hasPropellant && this.throttle > 0.1;

    // Rotation: mouse steers pitch/yaw, Q/E roll. Angular velocity is damped (assist or not).
    const targetAng = new THREE.Vector3();
    if (this.controlEnabled) {
      targetAng.x = THREE.MathUtils.clamp(-mouse.dy * sensitivity * 40, -t.turnRate, t.turnRate);
      targetAng.y = THREE.MathUtils.clamp(-mouse.dx * sensitivity * 40, -t.turnRate, t.turnRate);
      targetAng.z = input.axis('rollRight', 'rollLeft', ctx) * t.rollRate;
    }
    this.angVel.lerp(targetAng, damp(8, dt));
    const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.angVel.x * dt, this.angVel.y * dt, this.angVel.z * dt, 'YXZ'));
    this.quaternion.multiply(dq).normalize();

    // Translation
    const fwd = this.forward();
    const right = this.right();
    const up = this.up();
    const strafe = new THREE.Vector3();
    if (this.controlEnabled) {
      strafe.addScaledVector(right, input.axis('left', 'right', ctx));
      strafe.addScaledVector(up, input.axis('down', 'up', ctx));
    }
    const cap = hasPropellant ? (this.boosting ? t.boostSpeed : t.maxSpeed) : t.rcsOnlySpeed;
    if (this.assist) {
      const desired = fwd.clone().multiplyScalar(this.throttle * cap).addScaledVector(strafe, cap * 0.15);
      const accel = this.boosting ? t.boostAccel : t.accel;
      const diff = desired.sub(this.velocity);
      const maxDv = accel * dt;
      if (diff.length() > maxDv) diff.setLength(maxDv);
      this.velocity.add(diff);
      if (hasPropellant) this.burned += (diff.length() / Math.max(dt, 1e-4)) * dt * 0.004;
    } else {
      const accel = this.boosting ? t.boostAccel : t.accel;
      if (hasPropellant) {
        this.velocity.addScaledVector(fwd, this.throttle * accel * dt);
        this.burned += Math.abs(this.throttle) * accel * dt * 0.004;
      }
      this.velocity.addScaledVector(strafe, t.strafeAccel * dt);
      if (this.velocity.length() > t.boostSpeed) this.velocity.setLength(t.boostSpeed);
    }
    if (!hasPropellant && this.velocity.length() > t.rcsOnlySpeed) this.velocity.multiplyScalar(1 - damp(0.5, dt));
    this.position.addScaledVector(this.velocity, dt);
  }

  /** Stop all motion (station-keeping when the pilot leaves the seat). */
  hold(): void {
    this.velocity.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.throttle = 0;
  }
}
