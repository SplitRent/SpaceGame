#!/usr/bin/env node
/**
 * Objective waypoint e2e: the on-screen marker follows the current objective, routes
 * through exits / back to the ship, and switches to an O₂ refill when suit oxygen is low.
 * Also checks the breach sealant supply can't soft-lock the Air quest.
 * Requires a running dev server (npm run dev).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const exe = ['/opt/pw-browsers/chromium', process.env.CHROME].find((p) => p && fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
const g = (fn, arg) => page.evaluate(fn, arg);
const waitFor = async (fn, timeout = 120000, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await g(fn, arg)) return true; await page.waitForTimeout(250); }
  return false;
};
const at = (id) => waitFor((i) => window.__game?.currentLocation?.id === i && window.__game.locations.phase === 'idle', 150000, id);
const wp = () => g(() => window.__ui.waypoint.value);
const wpLabel = async (re, what) => {
  const hit = await waitFor((src) => new RegExp(src).test(window.__ui.waypoint.value?.label ?? ''), 8000, re.source);
  const w = await wp();
  ok(hit, `${what} → waypoint "${w?.label ?? '(none)'}" ${w ? `· ${w.dist}${w.edge ? ' (edge)' : ''}` : ''}`);
};

await page.addInitScript(() => {
  window.__t = {
    it: (id) => window.__game.currentLocation.interactables.find((i) => i.id === id),
    use: (id) => { const it = window.__t.it(id); if (!it) throw new Error('no interactable ' + id); it.interact(); },
    q: (id) => window.__game.store.state.quests[id],
    talk: (dlg) => { window.__game.talkTo(dlg); const d = window.__game.dialogue; let n = 0; while (d.active && n++ < 20) { const v = window.__ui.dialogue.value; if (v?.choices.length) d.choose(v.choices[v.choices.length - 1].index); else d.continue(); } },
  };
});

/* ------------------------------ Crashed Lantern ------------------------------ */
await page.goto(`${BASE}/?start=ship&quality=low`);
ok(await at('lantern.interior'), 'crashed Lantern loads');
await wpLabel(/Mira/, 'Aftermath: find Mira');
ok(await g(() => window.__game.currentLocation.nav !== null), 'Lantern exposes its nav graph for breadcrumbs');

await g(() => window.__t.talk('dlg.castellanos'));
await wpLabel(/Emergency crate/, 'Power: get the fuel cell');
await g(() => window.__t.use('emergency.crate'));
ok(await g(() => window.__game.store.count('sealant') >= 4), 'emergency crate holds enough sealant for both breaches');
await wpLabel(/Battery bay/, 'Power: seat the fuel cell');

// Jump the power repair (covered by e2e-act1) and check the Air quest waypoints.
await g(() => {
  const s = window.__game.store;
  s.apply([
    { repairStep: { system: 'power.batteries', step: 'fuelcell' } },
    { repairStep: { system: 'power.batteries', step: 'breakers' } },
    { systemOnline: { system: 'power.batteries', online: true } },
  ]);
});
ok(await waitFor(() => window.__t.q('mq.air')?.status === 'active', 10000), 'Air quest starts');
await wpLabel(/Corridor breach/, 'Air: seal the corridor breach');
await g(() => window.__t.use('seal.breach.corridor'));
// Simulate the reported soft-lock: sealant used elsewhere.
await g(() => window.__game.store.take('sealant', window.__game.store.count('sealant')));
await wpLabel(/Maintenance cabinet/, 'Air: out of sealant → points to the workshop cabinet');
await g(() => window.__t.use('sealant.cabinet'));
ok(await g(() => window.__game.store.count('sealant') === 2), 'cabinet tops up exactly the sealant still needed');
await wpLabel(/Lab breach/, 'Air: seal the lab breach');
await g(() => window.__t.use('seal.breach.lab'));
ok(await g(() => !!window.__game.store.state.ship.systems['life.hull']?.steps['breach.lab']), 'lab breach sealed');

// Low oxygen overrides the objective with the suit locker.
await g(() => { window.__game.store.state.player.oxygen = 30; });
await wpLabel(/suit locker/, 'Low O₂ in the unpressurized ship');
await g(() => { window.__game.store.state.player.oxygen = window.__game.store.state.player.oxygenMax; });

// Panel exit with Space (not only Esc).
await g(() => window.__t.use('life.console'));
ok(await waitFor(() => window.__game.input.context === 'panel', 3000), 'life support panel opens');
await page.waitForTimeout(400);
await page.keyboard.press('Space');
ok(await waitFor(() => window.__game.input.context === 'gameplay', 3000), 'Space steps back from the panel');

/* ------------------------------ Moon surface ------------------------------ */
await page.goto(`${BASE}/?start=moon&quality=low`);
ok(await at('moon.south'), 'Moon surface loads');
// The Aftermath objective (Mira, inside the ship) routes back into the Lantern.
await wpLabel(/Back to the Lantern/, 'Surface: objective inside the ship routes to the airlock');

/* ------------------------------ Mars ------------------------------ */
await page.goto(`${BASE}/?start=mars&quality=low`);
ok(await at('mars.melas'), 'Mars loads');
const q = await g(() => window.__game.story.currentObjective());
console.log('   objective:', q?.questId, q?.stageId, q?.objectiveId, '—', q?.objective);
await wpLabel(/Entrance|Melas|Rao|Station/, 'Mars: find the station crew routes to the station door');

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll waypoint checks passed');
process.exit(failures ? 1 : 0);
