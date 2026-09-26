import { describe, it, expect } from 'vitest';
import { makeStore } from '../helpers';

describe('store conditions & effects', () => {
  it('evaluates composite conditions', () => {
    const { store } = makeStore();
    store.setFlag('a', true);
    store.give('ice', 3);
    expect(store.check({ all: [{ flag: 'a' }, { hasItem: 'ice', qty: 3 }] })).toBe(true);
    expect(store.check({ any: [{ flag: 'nope' }, { not: { flag: 'a' } }] })).toBe(false);
    expect(store.check({ flag: 'n', gte: 2 })).toBe(false);
    store.setFlag('n', 3);
    expect(store.check({ flag: 'n', gte: 2 })).toBe(true);
  });

  it('grants are idempotent across repeated application', () => {
    const { store } = makeStore();
    for (let i = 0; i < 5; i++) store.grant('reward.x', [{ give: 'circuit', qty: 2 }]);
    expect(store.count('circuit')).toBe(2);
  });

  it('takeAll is atomic', () => {
    const { store } = makeStore();
    store.give('iron', 2);
    expect(store.takeAll([{ item: 'iron', qty: 2 }, { item: 'scrap', qty: 1 }])).toBe(false);
    expect(store.count('iron')).toBe(2);
  });

  it('repair steps raise condition and never double-apply', () => {
    const { store } = makeStore();
    store.apply([{ repairStep: { system: 'power.batteries', step: 'fuelcell' } }]);
    const c1 = store.state.ship.systems['power.batteries'].condition;
    store.apply([{ repairStep: { system: 'power.batteries', step: 'fuelcell' } }]);
    expect(store.state.ship.systems['power.batteries'].condition).toBe(c1);
    expect(c1).toBeGreaterThan(0.15);
  });
});
