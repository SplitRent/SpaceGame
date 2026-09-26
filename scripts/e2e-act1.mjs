#!/usr/bin/env node
/**
 * Act 1 systems e2e: drives the real interactables and first-person console controls
 * (not state shortcuts) through power → air → base → reactor, checking that quests,
 * ship visuals and crew react. Materials that would be mined are granted directly.
 * Requires a running dev server (npm run dev).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const exe = ['/opt/pw-browsers/chromium', process.env.CHROME].find((p) => p && fs.existsSync(p));
fs.mkdirSync('screenshots', { recursive: true });
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
  while (Date.now() - t0 < timeout) { if (await g(fn, arg)) return true; await page.waitForTimeout(300); }
  return false;
};
const at = (id) => waitFor((i) => window.__game?.currentLocation?.id === i && window.__game.locations.phase === 'idle', 150000, id);

// Helpers executed in the page
await page.addInitScript(() => {
  window.__t = {
    it: (id) => window.__game.currentLocation.interactables.find((i) => i.id === id),
    use: (id) => { const it = window.__t.it(id); if (!it) throw new Error('no interactable ' + id); it.interact(); },
    panel: (id) => { window.__t.use(id); return window.__game.panel; },
    click: (ctrl) => {
      const p = window.__game.panel;
      const c = p.controls.find((x) => x.id === ctrl);
      if (!c) throw new Error('no control ' + ctrl);
      if (!c.enabled()) return false;
      c.onClick();
      p.refresh();
      return true;
    },
    close: () => window.__game.closePanel(),
    q: (id) => window.__game.store.state.quests[id],
    sys: (id) => window.__game.store.state.ship.systems[id],
    give: (list) => list.forEach(([i, n]) => window.__game.store.give(i, n)),
  };
});

await page.goto(`${BASE}/?start=ship&quality=low`);
ok(await at('lantern.interior'), 'crashed Lantern loads');
ok(await g(() => window.__t.q('mq.aftermath')?.status === 'active'), 'Aftermath active');

// Meet Mira
await g(() => { window.__game.talkTo('dlg.castellanos'); const d = window.__game.dialogue; let n = 0; while (d.active && n++ < 20) { const v = window.__ui.dialogue.value; if (v?.choices.length) d.choose(v.choices[v.choices.length - 1].index); else d.continue(); } });
ok(await g(() => window.__t.q('mq.aftermath').stage === 'power'), 'talking to Mira advances to the power stage');

// Crate → fuel cell
await g(() => window.__t.use('emergency.crate'));
ok(await g(() => window.__game.store.count('fuelcell') === 1 && window.__game.store.count('scrubber') === 2), 'emergency crate yields fuel cell and scrubbers');
await g(() => window.__t.use('emergency.crate'));
ok(await g(() => window.__game.store.count('fuelcell') === 1), 'crate cannot be looted twice');

// Battery bay (first-person panel)
const bay = await g(() => { window.__t.panel('battery.bay'); const r = window.__t.click('slot'); window.__t.close(); return r; });
ok(bay, 'fuel cell seated via the battery-bay slot control');

// Breakers: wrong order trips, right order works
const brk = await g(() => {
  window.__t.panel('power.panel');
  const wrong = window.__t.click('life'); // needs DIST A → trips
  const trippedStateOff = !window.__game.store.getEntity('lantern.interior', 'breakers', 'life');
  for (const b of ['main', 'distA', 'distB', 'life', 'comms', 'hab']) window.__t.click(b);
  const online = window.__t.click('online');
  window.__t.close();
  return { wrong, trippedStateOff, online };
});
ok(brk.trippedStateOff, 'closing a load breaker before its bus trips it');
ok(brk.online, 'BUS ONLINE engages after breakers are closed upstream-first');
ok(await g(() => window.__t.sys('power.batteries').online && window.__t.q('mq.aftermath').status === 'completed'), 'battery bus online; Aftermath completed');
ok(await g(() => window.__t.q('mq.air')?.status === 'active'), 'Air quest starts');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/e2e-act1-01-emergency.png' });

// Craft sealant at the fabricator (materials as if mined), seal both breaches
await g(() => window.__t.give([['regolith', 8], ['scrap', 2]]));
const crafted = await g(() => window.__game.crafting.craft('r.sealant', 'fabricator'));
ok(crafted && (await g(() => window.__game.store.count('sealant') === 4)), 'fabricator crafts hull sealant');
await g(() => { window.__t.use('seal.breach.corridor'); window.__t.use('seal.breach.lab'); });
ok(await g(() => window.__t.sys('life.hull').online), 'both breaches sealed → pressure hull online');

// Life support
const ls = await g(() => { window.__t.panel('life.console'); const a = window.__t.click('scrub'); const b = window.__t.click('repress'); window.__t.close(); return a && b; });
ok(ls, 'scrubbers loaded and ship repressurized via the life-support console');
ok(await g(() => window.__game.currentLocation.isPressurized()), 'interior is pressurized (helmets can come off)');
ok(await waitFor(() => window.__t.q('mq.camp')?.status === 'active' && window.__game.store.state.flags['base.unlocked'] === true, 5000), 'Base Camp quest starts and pads unlock');

// Base modules (built through the base system as the pad overlay does)
await g(() => window.__t.give([['frame', 8], ['sealant', 2], ['solarcell', 2], ['conduit', 4], ['powercell', 2]]));
const built = await g(() => ['shelter', 'solar', 'workbench', 'battery'].map((m, i) => window.__game.base.build(`pad.${'abcd'[i]}`, m)));
ok(built.every(Boolean), 'shelter, solar, workbench and battery constructed');
ok(await waitFor(() => window.__t.q('mq.camp').status === 'completed', 5000), 'Base Camp completed; O₂ capacity upgraded');
ok(await g(() => window.__game.store.state.player.oxygenMax === 320), 'suit oxygen capacity upgrade applied once');

// Reactor
ok(await waitFor(() => window.__t.q('mq.reactor')?.status === 'active', 5000), 'Heart of the Ship starts');
await g(() => window.__t.give([['titanium', 3], ['silicon', 4], ['electronics', 2]]));
const actuator = await g(() => window.__game.crafting.craft('r.circuit', 'fabricator') && window.__game.crafting.craft('r.circuit', 'fabricator') && window.__game.crafting.craft('r.actuator', 'fabricator'));
ok(actuator, 'actuator fabricated from titanium and printed circuits');
await g(() => window.__t.use('reactor.actuator'));
const valves = await g(() => {
  window.__t.panel('reactor.coolant');
  const wrong = window.__t.click('RETURN');
  const wrongOpen = !!window.__game.store.getEntity('lantern.interior', 'coolant', 'v2');
  for (const v of ['PRIMARY', 'SECONDARY', 'RETURN']) window.__t.click(v);
  window.__t.close();
  return { wrongOpen, done: window.__t.sys('power.reactor').steps.coolant };
});
ok(!valves.wrongOpen && valves.done, 'coolant valves must be opened in flow order');
const startup = await g(() => {
  window.__t.panel('eng.console');
  window.__t.click('pumps');
  for (let i = 0; i < 3; i++) window.__t.click('rod');
  window.__t.close();
  return window.__t.sys('power.reactor').online;
});
ok(startup, 'reactor start-up sequence (pumps, three rod steps) brings the core critical');
ok(await waitFor(() => window.__t.q('mq.reactor').status === 'completed' && window.__t.q('mq.earthrise')?.status === 'active', 5000), 'reactor quest completes; Earthrise and Kepler-9 open');
await page.waitForTimeout(3000);
const tp = await g(() => { const l = window.__game.currentLocation; window.__game.player.teleport(l.shipToWorld(new window.__game.player.position.constructor(-2, -4, 31)), Math.PI); window.__game.cam.snap(); return 1; });
void tp;
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-act1-02-reactor.png' });

const real = errors.filter((e) => !/WebGL|GPU|swiftshader/i.test(e));
ok(real.length === 0, `no runtime errors${real.length ? ':\n  ' + real.slice(0, 6).join('\n  ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll Act 1 checks passed');
process.exit(failures ? 1 : 0);
