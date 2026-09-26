import { describe, it, expect } from 'vitest';
import { navFromRooms } from '../../src/locations/lantern/interiorKit';
import { INTERIORS } from '../../src/content/worlds';

describe('interior walk graphs', () => {
  it('connect every room of every data-driven interior', () => {
    for (const d of Object.values(INTERIORS)) {
      const nav = navFromRooms(d.rooms);
      const ids = Object.keys(nav.nodes);
      const seen = new Set([ids[0]]);
      const stack = [ids[0]];
      while (stack.length) {
        const u = stack.pop()!;
        for (const [a, b] of nav.edges) {
          const v = a === u ? b : b === u ? a : null;
          if (v && !seen.has(v)) {
            seen.add(v);
            stack.push(v);
          }
        }
      }
      const rooms = ids.filter((i) => i.startsWith('r:'));
      expect(rooms.filter((r) => !seen.has(r)), d.id).toEqual([]);
    }
  });
});
