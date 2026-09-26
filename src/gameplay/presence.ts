import type { NpcDef, NpcPresenceRule } from '../content/types';
import type { Store } from '../state/Store';

/** Length of the (compressed) day cycle in seconds of game clock. */
export const DAY_LENGTH = 7200;

export function dayPhase(clock: number): number {
  return ((clock / DAY_LENGTH) % 1 + 1) % 1;
}

function inWindow(phase: number, w: [number, number]): boolean {
  const [a, b] = w;
  return a <= b ? phase >= a && phase < b : phase >= a || phase < b;
}

/**
 * Pure presence resolver: where is this NPC right now? The first rule whose condition
 * (and schedule window) passes wins. Dead NPCs are never present. Because this is a pure
 * function of state, NPC placement can never contradict progress, and it is unit-tested.
 */
export function resolvePresence(def: NpcDef, store: Store, phase = dayPhase(store.state.clock)): NpcPresenceRule | null {
  const st = store.state.npcs[def.id];
  if (st && !st.alive) return null;
  for (const rule of def.presence) {
    if (rule.schedule && !inWindow(phase, rule.schedule)) continue;
    if (store.check(rule.if)) return rule;
  }
  return null;
}
