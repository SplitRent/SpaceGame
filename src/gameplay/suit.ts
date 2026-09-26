import * as THREE from 'three';
import type { Store } from '../state/Store';
import type { Location } from '../locations/Location';
import { clamp } from '../engine/math';

export interface SuitReadout {
  pressurized: boolean;
  temperature: number;
  hazard: string | null;
  oxygenRate: number;
}

/**
 * Suit survival: oxygen, suit power, temperature/radiation hazards and stamina.
 * Oxygen only drains outside pressurised areas and refills quickly inside, so it creates
 * tension on expeditions rather than a constant timer. Suit power drains faster in
 * extreme cold (permanently shadowed craters) and with the headlamp on.
 */
export class SuitSystem {
  stamina = 1;
  headlamp = false;
  private damageAccum = 0;
  private warnO2 = false;
  private warnPower = false;
  private critO2 = false;
  readout: SuitReadout = { pressurized: true, temperature: 20, hazard: null, oxygenRate: 0 };
  onDamage: ((amount: number, cause: string) => void) | null = null;

  constructor(private store: Store) {}

  update(dt: number, loc: Location, pos: THREE.Vector3, sprinting: boolean): void {
    const p = this.store.state.player;
    const pressurized = loc.isPressurized(pos);
    const temp = loc.temperatureAt(pos);
    const hz = loc.hazardAt(pos);
    let hazard: string | null = null;

    // Stamina (not persisted)
    if (sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.12);
    else this.stamina = Math.min(1, this.stamina + dt * 0.2);

    // Oxygen
    let o2Rate = 0;
    if (pressurized) {
      o2Rate = 30; // refill from ambient / ship supply
    } else {
      o2Rate = -(1 + (sprinting ? 0.6 : 0));
    }
    p.oxygen = clamp(p.oxygen + o2Rate * dt, 0, p.oxygenMax);

    // Suit power
    let powerRate = pressurized ? 4 : -0.08;
    if (this.headlamp) powerRate -= 0.05;
    if (temp < loc.coldLimit) {
      powerRate -= 0.9; // heaters working hard
      hazard = 'EXTREME COLD';
    } else if (temp > 100) {
      powerRate -= 0.4;
      hazard = 'EXTREME HEAT';
    }
    if (hz?.radiation) hazard = 'RADIATION';
    p.suitPower = clamp(p.suitPower + powerRate * dt, 0, p.suitPowerMax);

    // Damage from depletion
    let dmg = 0;
    let cause = '';
    if (p.oxygen <= 0) {
      dmg += 8 * dt;
      cause = 'asphyxiation';
      hazard = 'NO OXYGEN';
    }
    if (p.suitPower <= 0 && (temp < -100 || temp > 100)) {
      dmg += 5 * dt;
      cause = 'exposure';
      hazard = 'SUIT POWER DEPLETED';
    }
    if (hz?.radiation) {
      dmg += hz.radiation * dt;
      cause = 'radiation';
    }
    if (dmg > 0) {
      p.health = Math.max(0, p.health - dmg);
      this.damageAccum += dmg;
      if (this.damageAccum > 4) {
        this.onDamage?.(this.damageAccum, cause);
        this.damageAccum = 0;
      }
    } else if (pressurized && p.health < 100) {
      p.health = Math.min(100, p.health + dt * 0.5);
    }

    // Warnings (edge-triggered)
    const lowO2 = !pressurized && p.oxygen / p.oxygenMax < 0.25;
    if (lowO2 && !this.warnO2) this.store.notify('Suit oxygen below 25% — follow the O₂ marker to a refill (suit locker, the ship, or any pressurized room)', 'warn');
    this.warnO2 = lowO2;
    const critO2 = !pressurized && p.oxygen / p.oxygenMax < 0.1;
    if (critO2 && !this.critO2) this.store.notify('OXYGEN CRITICAL', 'warn');
    this.critO2 = critO2;
    const lowPw = p.suitPower / p.suitPowerMax < 0.2;
    if (lowPw && !this.warnPower) this.store.notify('Suit power low', 'warn');
    this.warnPower = lowPw;

    this.readout = { pressurized, temperature: temp, hazard, oxygenRate: o2Rate };
  }

  get dead(): boolean {
    return this.store.state.player.health <= 0;
  }
}
