import { describe, it, expect } from 'vitest';
import { CONTENT } from '../../src/content';
import { SURFACES, INTERIORS } from '../../src/content/worlds';
import { ZONES } from '../../src/content/zones';
import { STARMAP } from '../../src/content/starmap';
import { LOCATION_REGISTRY } from '../../src/locations/registry';
import type { Effect } from '../../src/content/types';

const problems: string[] = [];
const db = (id: string | undefined, where: string) => {
  if (id && !CONTENT.database[id]) problems.push(`${where}: unknown database entry ${id}`);
};
const loc = (id: string, where: string) => {
  if (!LOCATION_REGISTRY[id]) problems.push(`${where}: unknown location ${id}`);
};
const effects = (list: Effect[] | undefined, where: string) => {
  for (const e of list ?? []) {
    if ('give' in e && !CONTENT.items[e.give]) problems.push(`${where}: unknown item ${e.give}`);
    if ('travel' in e) loc(e.travel.location, where);
  }
};

describe('data-driven worlds', () => {
  it('every reference in surfaces, interiors, zones and the star map resolves', () => {
    for (const s of Object.values(SURFACES)) {
      db(s.ground.db, s.id);
      if (!CONTENT.items[s.ground.item]) problems.push(`${s.id}: ground item ${s.ground.item}`);
      for (const n of s.nodes) {
        db(n.db, `${s.id}/${n.id}`);
        for (const [item] of [...n.yields, ...(n.alt ?? [])]) if (!CONTENT.items[item]) problems.push(`${s.id}/${n.id}: item ${item}`);
      }
      for (const p of s.pois) {
        db(p.scan, `${s.id}/${p.id}`);
        effects(p.interact?.effects, `${s.id}/${p.id}`);
        effects(p.weld?.effects, `${s.id}/${p.id}`);
        if (p.interact?.travel) loc(p.interact.travel.location, `${s.id}/${p.id}`);
        for (const r of p.interact?.requires ?? []) if (!CONTENT.items[r.item]) problems.push(`${s.id}/${p.id}: requires ${r.item}`);
      }
      if (!Object.values(ZONES).some((z) => z.landing?.location === s.id)) problems.push(`${s.id}: no space zone lands here (no way to take off)`);
    }
    for (const d of Object.values(INTERIORS)) {
      for (const p of d.points) {
        db(p.scan, `${d.id}/${p.id}`);
        effects(p.effects, `${d.id}/${p.id}`);
        if (p.travel) loc(p.travel.location, `${d.id}/${p.id}`);
      }
      if (!d.spawns.length) problems.push(`${d.id}: no spawn`);
    }
    for (const z of Object.values(ZONES)) {
      loc(z.id, 'zones');
      if (z.landing) loc(z.landing.location, z.id);
      if (z.station) loc(z.station.dockLocation, z.id);
      db(z.landing?.scan, z.id);
      db(z.station?.scan, z.id);
    }
    for (const e of STARMAP) {
      if (e.zone && !ZONES[e.zone]) problems.push(`starmap ${e.body}: unknown zone ${e.zone}`);
      if (!CONTENT.bodies[e.body]) problems.push(`starmap: unknown body ${e.body}`);
    }
    expect(problems).toEqual([]);
  });

  it('every NPC presence rule points at a spot that exists in its location', () => {
    const spots: Record<string, Set<string>> = {};
    for (const s of Object.values(SURFACES)) spots[s.id] = new Set(s.pois.filter((p) => p.kind === 'npcspot').map((p) => p.id));
    for (const d of Object.values(INTERIORS)) spots[d.id] = new Set(d.spots.map((p) => p.id));
    const bad: string[] = [];
    for (const n of Object.values(CONTENT.npcs))
      for (const r of n.presence) if (spots[r.location] && !spots[r.location].has(r.spot)) bad.push(`${n.id} → ${r.location}/${r.spot}`);
    expect(bad).toEqual([]);
  });
});
