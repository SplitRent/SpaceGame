import { describe, it, expect } from 'vitest';
import { CONTENT } from '../../src/content';
import type { Condition, Effect } from '../../src/content/types';
import { LOCATION_REGISTRY } from '../../src/locations/registry';

/** Content validation: every reference resolves, so broken data fails CI, not the player. */
const errors: string[] = [];
const item = (id: string, where: string) => { if (!CONTENT.items[id]) errors.push(`${where}: unknown item ${id}`); };
const quest = (id: string, where: string) => { if (!CONTENT.quests[id]) errors.push(`${where}: unknown quest ${id}`); };
const system = (id: string, where: string) => { if (!CONTENT.shipSystems[id]) errors.push(`${where}: unknown system ${id}`); };
const npc = (id: string, where: string) => { if (!CONTENT.npcs[id]) errors.push(`${where}: unknown npc ${id}`); };

function cond(c: Condition | undefined, where: string): void {
  if (!c) return;
  if ('all' in c) return c.all.forEach((x) => cond(x, where));
  if ('any' in c) return c.any.forEach((x) => cond(x, where));
  if ('not' in c) return cond(c.not, where);
  if ('hasItem' in c) item(c.hasItem, where);
  if ('quest' in c) quest(c.quest, where);
  if ('questDone' in c) quest(c.questDone, where);
  if ('questActive' in c) quest(c.questActive, where);
  if ('system' in c) {
    system(c.system, where);
    if (c.step && !CONTENT.shipSystems[c.system]?.steps.some((s) => s.id === c.step)) errors.push(`${where}: unknown step ${c.system}/${c.step}`);
  }
  if ('module' in c && !CONTENT.baseModules[c.module]) errors.push(`${where}: unknown module ${c.module}`);
  if ('scanned' in c && !CONTENT.database[c.scanned]) errors.push(`${where}: unknown db entry ${c.scanned}`);
  if ('npcAlive' in c) npc(c.npcAlive, where);
  if ('relationship' in c) npc(c.relationship.npc, where);
  if ('quest' in c && c.stage && !CONTENT.quests[c.quest]?.stages.some((s) => s.id === c.stage)) errors.push(`${where}: unknown stage ${c.quest}/${c.stage}`);
}

function eff(list: Effect[] | undefined, where: string): void {
  for (const e of list ?? []) {
    if ('give' in e) item(e.give, where);
    if ('take' in e) item(e.take, where);
    if ('startQuest' in e) quest(e.startQuest, where);
    if ('completeQuest' in e) quest(e.completeQuest, where);
    if ('setStage' in e) quest(e.setStage.quest, where);
    if ('repairStep' in e) system(e.repairStep.system, where);
    if ('systemOnline' in e) system(e.systemOnline.system, where);
    if ('relationship' in e) npc(e.relationship.npc, where);
    if ('grant' in e) eff(e.effects, where);
  }
}

for (const r of Object.values(CONTENT.recipes)) {
  item(r.output.item, `recipe ${r.id}`);
  r.inputs.forEach((i) => item(i.item, `recipe ${r.id}`));
  cond(r.requires, `recipe ${r.id}`);
}
for (const q of Object.values(CONTENT.quests)) {
  cond(q.autoStart, `quest ${q.id}`);
  eff(q.onStart, `quest ${q.id}`);
  eff(q.rewards, `quest ${q.id}`);
  if (q.giver) npc(q.giver, `quest ${q.id}`);
  const ids = new Set(q.stages.map((s) => s.id));
  for (const s of q.stages) {
    if (s.next !== 'complete' && !ids.has(s.next)) errors.push(`quest ${q.id}/${s.id}: next stage ${s.next} missing`);
    s.objectives.forEach((o) => cond(o.done, `quest ${q.id}/${s.id}/${o.id}`));
    eff(s.onComplete, `quest ${q.id}/${s.id}`);
  }
}
for (const d of Object.values(CONTENT.dialogues)) {
  npc(d.npc, `dialogue ${d.id}`);
  for (const e of d.entries) {
    cond(e.if, `dialogue ${d.id}`);
    if (!d.nodes[e.node]) errors.push(`dialogue ${d.id}: entry node ${e.node} missing`);
  }
  for (const n of Object.values(d.nodes)) {
    eff(n.effects, `dialogue ${d.id}/${n.id}`);
    if (n.next && n.next !== 'end' && !d.nodes[n.next]) errors.push(`dialogue ${d.id}/${n.id}: next ${n.next} missing`);
    for (const c of n.choices ?? []) {
      cond(c.if, `dialogue ${d.id}/${n.id}`);
      eff(c.effects, `dialogue ${d.id}/${n.id}`);
      if (c.to !== 'end' && !d.nodes[c.to]) errors.push(`dialogue ${d.id}/${n.id}: choice → ${c.to} missing`);
    }
  }
}
for (const n of Object.values(CONTENT.npcs)) {
  if (!CONTENT.dialogues[n.dialogue]) errors.push(`npc ${n.id}: dialogue ${n.dialogue} missing`);
  for (const p of n.presence) {
    cond(p.if, `npc ${n.id}`);
    if (!LOCATION_REGISTRY[p.location]) errors.push(`npc ${n.id}: unknown location ${p.location}`);
  }
}
for (const b of CONTENT.barks) {
  npc(b.npc, `bark ${b.id}`);
  if (b.reply) npc(b.reply.npc, `bark ${b.id}`);
  cond(b.if, `bark ${b.id}`);
}
for (const s of Object.values(CONTENT.shipSystems)) {
  s.dependsOn.forEach((d) => system(d, `system ${s.id}`));
  s.steps.forEach((st) => st.consumes?.forEach((c) => item(c.item, `system ${s.id}/${st.id}`)));
}
for (const m of Object.values(CONTENT.baseModules)) {
  m.cost.forEach((c) => item(c.item, `module ${m.id}`));
  cond(m.requires, `module ${m.id}`);
}
for (const d of Object.values(CONTENT.database)) {
  d.yields?.forEach((y) => item(y.item, `db ${d.id}`));
  eff(d.onScan, `db ${d.id}`);
}

describe('content validation', () => {
  it('all references resolve', () => {
    expect(errors).toEqual([]);
  });

  it('every recipe output needed by a quest-gated repair can be crafted from gatherable resources', () => {
    const gatherable = new Set(['regolith', 'ice', 'iron', 'aluminum', 'silicon', 'titanium', 'carbon', 'scrap', 'electronics']);
    const craftable = new Set(Object.values(CONTENT.recipes).map((r) => r.output.item));
    for (const s of Object.values(CONTENT.shipSystems)) {
      for (const st of s.steps) {
        for (const c of st.consumes ?? []) {
          const it = CONTENT.items[c.item];
          const ok = gatherable.has(c.item) || craftable.has(c.item) || it.category === 'quest';
          expect(ok, `${s.id}/${st.id} needs ${c.item}`).toBe(true);
        }
      }
    }
  });

  it('ship system dependency graph is acyclic', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`cycle at ${id}`);
      visiting.add(id);
      CONTENT.shipSystems[id].dependsOn.forEach(visit);
      visiting.delete(id);
      done.add(id);
    };
    Object.keys(CONTENT.shipSystems).forEach(visit);
  });
});
