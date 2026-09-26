import { STATE_VERSION } from '../state/GameState';

/**
 * Versioned save migrations. Each entry upgrades a state object from version N to N+1.
 * Never edit an existing migration after release; add a new one and bump STATE_VERSION.
 */
type Migration = (state: any) => any;

export const MIGRATIONS: Record<number, Migration> = {
  // 1 -> 2 example (not yet used):
  // 1: (s) => { s.newField = defaultValue; s.version = 2; return s; },
};

export function migrate(state: any, fromVersion: number): any {
  let v = fromVersion;
  let s = state;
  while (v < STATE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from version ${v}`);
    s = m(s);
    v++;
  }
  s.version = STATE_VERSION;
  return s;
}
