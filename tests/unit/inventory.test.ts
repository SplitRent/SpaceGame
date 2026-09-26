import { describe, it, expect } from 'vitest';
import { addItem, removeItem, countItem, spaceFor, transfer } from '../../src/gameplay/inventory';
import { CONTENT } from '../../src/content';
import type { Container } from '../../src/state/GameState';

const item = (id: string) => CONTENT.items[id];

describe('inventory', () => {
  it('stacks up to the stack limit and opens new slots', () => {
    const c: Container = { slots: 3, stacks: [] };
    expect(addItem(c, item('regolith'), 120)).toBe(120);
    expect(c.stacks.length).toBe(3);
    expect(countItem(c, 'regolith')).toBe(120);
  });

  it('never exceeds capacity for normal items (partial add)', () => {
    const c: Container = { slots: 1, stacks: [] };
    expect(addItem(c, item('iron'), 100)).toBe(40);
    expect(countItem(c, 'iron')).toBe(40);
    expect(spaceFor(c, item('iron'))).toBe(0);
  });

  it('always accepts quest items even when full', () => {
    const c: Container = { slots: 1, stacks: [{ itemId: 'iron', qty: 40 }] };
    expect(addItem(c, item('fuelcell'), 1)).toBe(1);
    expect(countItem(c, 'fuelcell')).toBe(1);
  });

  it('removal is all-or-nothing', () => {
    const c: Container = { slots: 4, stacks: [{ itemId: 'ice', qty: 5 }] };
    expect(removeItem(c, 'ice', 6)).toBe(false);
    expect(countItem(c, 'ice')).toBe(5);
    expect(removeItem(c, 'ice', 5)).toBe(true);
    expect(c.stacks.length).toBe(0);
  });

  it('transfer moves only what fits and conserves totals', () => {
    const a: Container = { slots: 4, stacks: [{ itemId: 'scrap', qty: 70 }] };
    const b: Container = { slots: 1, stacks: [] };
    const moved = transfer(a, b, item('scrap'), 70);
    expect(moved).toBe(40);
    expect(countItem(a, 'scrap') + countItem(b, 'scrap')).toBe(70);
  });
});
