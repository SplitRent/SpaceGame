import { describe, it, expect } from 'vitest';
import { CONTENT } from '../../src/content';
import { WAYPOINTS } from '../../src/content/waypoints';
import { SURFACES, INTERIORS } from '../../src/content/worlds';
import { LOCATION_REGISTRY } from '../../src/locations/registry';

describe('objective waypoints', () => {
  it('every waypoint key names a real quest objective and a real location', () => {
    const problems: string[] = [];
    for (const [key, specs] of Object.entries(WAYPOINTS)) {
      const [q, st, o] = key.split('/');
      const obj = CONTENT.quests[q]?.stages.find((s) => s.id === st)?.objectives.find((x) => x.id === o);
      if (!obj) problems.push(`${key}: no such objective`);
      for (const s of specs) {
        if (s.loc && !LOCATION_REGISTRY[s.loc]) problems.push(`${key}: unknown location ${s.loc}`);
        if (!s.loc && !s.at?.startsWith('npc:')) problems.push(`${key}: needs loc or npc target`);
        if (s.at?.startsWith('npc:') && !CONTENT.npcs[s.at.slice(4)]) problems.push(`${key}: unknown npc ${s.at}`);
        if (s.at?.startsWith('poi:')) {
          const def = SURFACES[s.loc ?? ''];
          if (!def?.pois.some((p) => p.id === s.at!.slice(4))) problems.push(`${key}: unknown poi ${s.at} in ${s.loc}`);
        }
        if (s.at?.startsWith('it:') && s.loc && INTERIORS[s.loc]) {
          if (!INTERIORS[s.loc].points.some((p) => p.id === s.at!.slice(3))) problems.push(`${key}: unknown point ${s.at} in ${s.loc}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every non-optional main-quest objective has a waypoint', () => {
    const missing: string[] = [];
    for (const q of Object.values(CONTENT.quests)) {
      if (q.kind !== 'main') continue;
      for (const st of q.stages) for (const o of st.objectives) if (!o.optional && !WAYPOINTS[`${q.id}/${st.id}/${o.id}`]) missing.push(`${q.id}/${st.id}/${o.id}`);
    }
    expect(missing).toEqual([]);
  });
});
