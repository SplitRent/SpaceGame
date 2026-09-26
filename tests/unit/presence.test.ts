import { describe, it, expect } from 'vitest';
import { makeStore } from '../helpers';
import { resolvePresence } from '../../src/gameplay/presence';
import { CONTENT } from '../../src/content';

describe('NPC presence resolver', () => {
  it('places crew at their Act 0 posts', () => {
    const { store } = makeStore();
    const r = resolvePresence(CONTENT.npcs.castellanos, store, 0.2);
    expect(r?.location).toBe('lantern.interior');
    expect(r?.spot).toBe('eng.console');
  });

  it('the commander is absent after the crash', () => {
    const { store } = makeStore();
    store.setFlag('crashed', true);
    expect(resolvePresence(CONTENT.npcs.okonkwo, store, 0.2)).toBeNull();
  });

  it('dead NPCs are never present', () => {
    const { store } = makeStore();
    store.state.npcs.sola.alive = false;
    expect(resolvePresence(CONTENT.npcs.sola, store, 0.2)).toBeNull();
  });

  it('after launch nobody is left on the Moon', () => {
    const { store } = makeStore();
    store.setFlag('crashed', true);
    store.setFlag('launched', true);
    store.state.base.pads['pad.a'] = { moduleId: 'workbench', built: true };
    for (const phase of [0.05, 0.3, 0.6, 0.9]) {
      for (const def of Object.values(CONTENT.npcs)) {
        const r = resolvePresence(def, store, phase);
        if (r) expect(r.location).not.toBe('moon.south');
      }
    }
  });

  it('schedules move the engineer between base and ship', () => {
    const { store } = makeStore();
    store.setFlag('crashed', true);
    store.state.base.pads['pad.a'] = { moduleId: 'workbench', built: true };
    expect(resolvePresence(CONTENT.npcs.castellanos, store, 0.2)?.location).toBe('moon.south');
    expect(resolvePresence(CONTENT.npcs.castellanos, store, 0.7)?.location).toBe('lantern.interior');
  });
});
