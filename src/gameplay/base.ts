import type { Store } from '../state/Store';
import { PLAYER_INV } from '../state/Store';
import { BATTERY_KWH } from '../content/baseModules';
import { countItem } from './inventory';

export interface PowerReport {
  generationKW: number;
  demandKW: number;
  batteryKWh: number;
  capacityKWh: number;
  powered: boolean;
}

/** Propellant (kg) produced per unit of ice processed. */
export const PROPELLANT_PER_ICE = 20;
/** Seconds of game clock per ice unit processed when powered. */
export const ICE_PROCESS_TIME = 4;

/**
 * Base logic: construction on pads (atomic material spend), the power budget
 * (solar generation follows the sun; batteries carry the base through the night), and
 * the ice processor converting hopper ice into propellant for the Lantern.
 * All results live in GameState, so the base's look and function persist exactly.
 */
export class BaseSystem {
  private iceTimer = 0;
  report: PowerReport = { generationKW: 0, demandKW: 0, batteryKWh: 0, capacityKWh: 0, powered: false };

  constructor(private store: Store) {}

  builtModules(): string[] {
    return Object.values(this.store.state.base.pads)
      .filter((p) => p.built && p.moduleId)
      .map((p) => p.moduleId!);
  }

  canBuild(moduleId: string): { ok: boolean; reason?: string } {
    const store = this.store;
    const def = store.content.baseModules[moduleId];
    if (!def) return { ok: false, reason: 'Unknown module' };
    if (!store.check(def.requires)) return { ok: false, reason: 'Requires another module first' };
    const inv = store.container(PLAYER_INV);
    for (const c of def.cost) {
      if (countItem(inv, c.item) < c.qty) return { ok: false, reason: `Need ${c.qty} ${store.content.items[c.item]?.name ?? c.item}` };
    }
    return { ok: true };
  }

  build(padId: string, moduleId: string): boolean {
    const store = this.store;
    const pad = store.state.base.pads[padId];
    const def = store.content.baseModules[moduleId];
    if (!pad || !def || pad.built) return false;
    if (!this.canBuild(moduleId).ok) return false;
    let ok = false;
    store.batch('build', () => {
      if (!store.takeAll(def.cost)) return;
      pad.moduleId = moduleId;
      pad.built = true;
      if (def.storageSlots) {
        const storage = store.container('base.storage');
        storage.slots += def.storageSlots;
      }
      store.setFlag(`built.${moduleId}`, true);
      store.markChanged('build');
      store.notify(`${def.name} constructed`, 'quest');
      ok = true;
    });
    return ok;
  }

  /**
   * @param sunFactor 0..1 current solar illumination at the base
   */
  update(dt: number, sunFactor: number): void {
    const store = this.store;
    const s = store.state;
    const mods = this.builtModules();
    let gen = 0;
    let demand = 0;
    let batteries = 0;
    for (const id of mods) {
      const def = store.content.baseModules[id];
      if (!def) continue;
      if (def.powerKW < 0) gen += -def.powerKW * (id === 'solar' ? sunFactor : 1);
      else demand += def.powerKW;
      if (id === 'battery') batteries++;
    }
    const cap = batteries * BATTERY_KWH;
    // Game-time energy integration (dt is game seconds; scale so a night drains visibly)
    const hours = (dt / 3600) * 12;
    let bat = s.base.batteryKWh + (gen - demand) * hours;
    bat = Math.max(0, Math.min(cap, bat));
    s.base.batteryKWh = bat;
    const powered = mods.length > 0 && (gen >= demand || bat > 0.01);
    const wasPowered = s.flags['base.powered'] === true;
    if (powered !== wasPowered) store.setFlag('base.powered', powered);
    this.report = { generationKW: gen, demandKW: demand, batteryKWh: bat, capacityKWh: cap, powered };

    // Ice processor
    if (powered && mods.includes('iceproc')) {
      const hopper = (s.flags['iceproc.hopper'] as number) ?? 0;
      if (hopper > 0) {
        this.iceTimer += dt;
        if (this.iceTimer >= ICE_PROCESS_TIME) {
          this.iceTimer = 0;
          store.batch('iceproc', () => {
            store.setFlag('iceproc.hopper', hopper - 1);
            s.ship.propellant += PROPELLANT_PER_ICE;
            store.setFlag('ship.propellant', Math.round(s.ship.propellant));
          });
        }
      }
    }
  }

  /** Move all ice from the suit into the processor hopper. */
  loadIce(): number {
    const store = this.store;
    const n = store.count('ice');
    if (n <= 0) return 0;
    store.batch('loadIce', () => {
      store.take('ice', n);
      store.setFlag('iceproc.hopper', ((store.state.flags['iceproc.hopper'] as number) ?? 0) + n);
      store.setFlag('iceproc.loaded', true);
    });
    return n;
  }
}
