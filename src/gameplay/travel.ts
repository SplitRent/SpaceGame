import * as THREE from 'three';
import type { Game } from '../Game';
import { STARMAP, TRANSIT_SECONDS, type StarMapEntry } from '../content/starmap';
import { ZONES, zoneForStation } from '../content/zones';
import { LOCATION_REGISTRY } from '../locations/registry';
import { lookQuat } from '../engine/math';
import { pushNotification } from '../ui/uiState';
import { BODIES } from '../content/bodies';

export interface EntryStatus {
  ok: boolean;
  /** Why a course cannot be plotted right now (null when ok). */
  reason: string | null;
  /** True when the body is locked by story/equipment (not just by circumstance). */
  locked: boolean;
  here: boolean;
}

/**
 * Interplanetary travel: where the ship is (by body), whether a course can be plotted
 * and why not, the transfer burn, and the transit clock. Transit progress lives in the
 * ship's parking state and advances with game time wherever the player is — at the helm
 * or walking the ship.
 */
export class TravelSystem {
  constructor(private game: Game) {}

  /** The body the ship is at (or heading to, during transit). */
  currentBody(): string | null {
    const p = this.game.store.state.ship.parking;
    if (p.kind === 'surface') return LOCATION_REGISTRY[p.locationId]?.body ?? null;
    if (p.kind === 'space') return ZONES[p.locationId]?.body ?? null;
    if (p.kind === 'docked') return zoneForStation(p.locationId)?.body ?? null;
    return ZONES[p.to]?.body ?? null;
  }

  /** Star system the ship is in ('sol' or 'vesper'). */
  currentSystem(): 'sol' | 'vesper' {
    const b = this.currentBody();
    return (b && BODIES.find((x) => x.id === b)?.system) || 'sol';
  }

  /** Entries drawn on the map right now (same system, discovered). */
  visibleEntries(): StarMapEntry[] {
    const sys = this.currentSystem();
    return STARMAP.filter((e) => ((BODIES.find((b) => b.id === e.body)?.system ?? 'sol') === sys) && (!e.hiddenUnless || this.game.store.check(e.hiddenUnless)));
  }

  entry(body: string): StarMapEntry | undefined {
    return STARMAP.find((e) => e.body === body);
  }

  status(e: StarMapEntry): EntryStatus {
    const store = this.game.store;
    const s = store.state;
    const p = s.ship.parking;
    const here = this.currentBody() === e.body && p.kind !== 'transit';
    const sys = BODIES.find((b) => b.id === e.body)?.system ?? 'sol';
    if (sys !== this.currentSystem()) return { ok: false, reason: 'In another star system. The way back is through the gate.', locked: true, here };
    const lock = e.locks.find((l) => !store.check(l.unless));
    if (lock) return { ok: false, reason: lock.reason, locked: true, here };
    if (!e.zone) return { ok: false, reason: 'Not a destination yet.', locked: true, here };
    if (here) return { ok: false, reason: 'You are here.', locked: false, here };
    if (p.kind === 'transit') return { ok: false, reason: `Already in transit to ${ZONES[p.to]?.name ?? p.to}.`, locked: false, here };
    if (!s.ship.systems['nav.core']?.online || !s.ship.systems['prop.main']?.online) return { ok: false, reason: 'Navigation and the main drive must be online.', locked: false, here };
    if (p.kind === 'surface') return { ok: false, reason: 'Take off first — transfer burns start from orbit.', locked: false, here };
    if (p.kind === 'docked') return { ok: false, reason: 'Undock first.', locked: false, here };
    if (s.ship.propellant < e.cost) return { ok: false, reason: `Needs ${e.cost} kg of propellant (${Math.round(s.ship.propellant)} kg aboard).`, locked: false, here };
    return { ok: true, reason: null, locked: false, here };
  }

  /** Commit the transfer burn. Returns false (and changes nothing) if not allowed. */
  plot(body: string): boolean {
    const e = this.entry(body);
    const game = this.game;
    const store = game.store;
    if (!e || !e.zone || !this.status(e).ok) return false;
    const p = store.state.ship.parking;
    if (p.kind !== 'space') return false;
    store.batch('plot', () => {
      store.setPropellant(store.state.ship.propellant - e.cost);
      store.state.ship.parking = { kind: 'transit', locationId: 'space.transit', from: p.locationId, to: e.zone!, elapsed: 0, duration: e.seconds ?? TRANSIT_SECONDS };
      store.setFlag(`course.${body}`, true);
      store.markChanged('plot');
    });
    game.audio.play('powerUp');
    game.cam.addShake(0.35);
    store.apply([{ story: 'transit.depart' }]);
    return true;
  }

  update(dt: number): void {
    const store = this.game.store;
    const p = store.state.ship.parking;
    if (p.kind !== 'transit') return;
    const before = p.elapsed / p.duration;
    p.elapsed = Math.min(p.duration, p.elapsed + dt);
    const k = p.elapsed / p.duration;
    if (before < 0.5 && k >= 0.5) store.apply([{ story: 'transit.half' }]);
    if (k >= 1) this.arrive();
  }

  private arrive(): void {
    const game = this.game;
    const store = game.store;
    const p = store.state.ship.parking;
    if (p.kind !== 'transit') return;
    const def = ZONES[p.to];
    const pos = new THREE.Vector3(...def.arrival.pos);
    const q = lookQuat(pos, new THREE.Vector3(...def.arrival.look));
    store.batch('arrive', () => {
      store.state.ship.parking = { kind: 'space', locationId: def.id, position: [pos.x, pos.y, pos.z], quat: [q.x, q.y, q.z, q.w] };
      store.markChanged('arrive');
    });
    if (game.currentLocation?.id === 'space.transit') {
      void game.locations.travel({ location: def.id, spawn: 'arrival' }, { label: `Orbit insertion burn… ${def.name}.`, fadeTime: 0.8 });
    } else {
      pushNotification(`Arrived: ${def.name}. Autopilot is holding orbit — take the helm to fly.`, 'discovery');
      game.audio.stinger('arrival');
    }
    store.apply([{ story: 'transit.arrive' }]);
  }
}
