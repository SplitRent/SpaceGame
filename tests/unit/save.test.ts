import { describe, it, expect } from 'vitest';
import { makeStore } from '../helpers';
import { buildSaveFile, parseSaveFile } from '../../src/save/SaveManager';
import { reconcileState } from '../../src/state/reconcile';
import { CONTENT } from '../../src/content';

describe('save / load', () => {
  it('round-trips state exactly', () => {
    const { store } = makeStore();
    store.setFlag('crashed', true);
    store.give('ice', 7);
    store.apply([{ repairStep: { system: 'life.hull', step: 'breach.lab' } }]);
    const file = buildSaveFile(store.state, 'slot1', 'Test', null, 'Moon');
    const res = parseSaveFile(JSON.parse(JSON.stringify(file)));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state).toEqual(store.state);
  });

  it('round-trips a ship in interplanetary transit', () => {
    const { store } = makeStore();
    store.state.ship.parking = { kind: 'transit', locationId: 'space.transit', from: 'space.cislunar', to: 'space.mars', elapsed: 42.5, duration: 90 };
    const file = buildSaveFile(store.state, 'slot1', 'Test', null, 'Transit');
    const res = parseSaveFile(JSON.parse(JSON.stringify(file)));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.ship.parking).toEqual(store.state.ship.parking);
  });

  it('rejects tampered or corrupted saves', () => {
    const { store } = makeStore();
    const file = buildSaveFile(store.state, 'slot1', 'Test', null, 'Moon');
    const raw = JSON.parse(JSON.stringify(file));
    raw.state.player.health = 999;
    expect(parseSaveFile(raw).ok).toBe(false);
    expect(parseSaveFile({ hello: 'world' }).ok).toBe(false);
  });

  it('rejects saves from a newer game version', () => {
    const { store } = makeStore();
    const file = buildSaveFile(store.state, 'slot1', 'Test', null, 'Moon');
    const raw = JSON.parse(JSON.stringify(file));
    raw.schemaVersion = 999;
    expect(parseSaveFile(raw).ok).toBe(false);
  });

  it('reconciliation repairs saves missing newer content and drops unknown content', () => {
    const { store } = makeStore();
    const s = structuredClone(store.state);
    delete (s.ship.systems as any)['nav.core'];
    delete (s.npcs as any)['wren'];
    s.inventories.player.stacks.push({ itemId: 'removed-item', qty: 3 });
    s.quests['removed-quest'] = { status: 'active', stage: 'x', progress: {}, history: [] };
    reconcileState(s, CONTENT);
    expect(s.ship.systems['nav.core']).toBeTruthy();
    expect(s.npcs['wren']).toBeTruthy();
    expect(s.inventories.player.stacks.find((x) => x.itemId === 'removed-item')).toBeUndefined();
    expect(s.quests['removed-quest']).toBeUndefined();
  });
});
