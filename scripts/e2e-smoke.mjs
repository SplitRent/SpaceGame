#!/usr/bin/env node
/**
 * End-to-end smoke test in headless Chromium (uses a running dev server).
 *   npm run dev   (in another terminal)
 *   npm run test:e2e            # or: BASE=http://localhost:5173 node scripts/e2e-smoke.mjs
 *
 * Plays through the critical path using the dev test hook (window.__game) and checks
 * invariants at each step: new game → opening (skipped) → Act 0 ship → catastrophe →
 * crash (skipped) → Act 1 wake → save → reload → state equal → transitions ×N (leaks).
 * Screenshots are written to ./screenshots/e2e-*.png.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const exe = ['/opt/pw-browsers/chromium', process.env.CHROME].find((p) => p && fs.existsSync(p));
fs.mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) failures++;
};
const g = (fn, arg) => page.evaluate(fn, arg);
const waitFor = async (fn, timeout = 120000, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await g(fn, arg)) return true;
    await page.waitForTimeout(400);
  }
  return false;
};
const idle = () => waitFor(() => window.__game?.locations.phase === 'idle');
const at = (id) => waitFor((i) => window.__game?.currentLocation?.id === i && window.__game.locations.phase === 'idle', 150000, id);
const skip = async () => {
  await g(() => window.__game.input.simulate('Space', true));
  await page.waitForTimeout(300);
  await g(() => window.__game.input.simulate('Space', false));
};

await page.goto(`${BASE}/?quality=low`);
ok(await waitFor(() => window.__game && document.querySelector('.title-screen')), 'title screen shown');
await page.screenshot({ path: 'screenshots/e2e-01-title.png' });

// New game → opening cinematic
await g(() => window.__game.newGame('Test Pilot'));
ok(await at('cinematic.opening'), 'opening cinematic loaded');
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/e2e-02-opening.png' });
await skip();
ok(await at('lantern.interior'), 'skipping the opening lands in the Lantern (Act 0)');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-03-act0.png' });
ok(await g(() => window.__game.store.state.quests['mq.prologue']?.status === 'active'), 'prologue quest active');
ok(await g(() => !!window.__game.store.state.flags['opening.seen']), 'opening end-state applied');

// Complete Act 0 rounds via world state, then strap in
await g(() => {
  const s = window.__game.store;
  s.batch('test', () => ['prologue.cmdr', 'prologue.diag', 'prologue.lab', 'prologue.petra'].forEach((f) => s.setFlag(f, true)));
});
ok(await g(() => window.__game.store.state.quests['mq.prologue'].stage === 'approach'), 'prologue reaches approach stage');
await g(() => window.__game.store.setFlag('prologue.seated', true));
ok(await waitFor(() => window.__game.story.cinematicActive || window.__game.currentLocation?.id === 'cinematic.opening', 30000), 'catastrophe sequence starts');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/e2e-04-catastrophe.png' });
await skip();
ok(await at('cinematic.opening'), 'crash cinematic loaded');
await page.waitForTimeout(5000);
await page.screenshot({ path: 'screenshots/e2e-05-crash.png' });
await skip();
ok(await at('lantern.interior'), 'wakes aboard the crashed Lantern');
await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshots/e2e-06-wake.png' });
ok(await g(() => window.__game.store.state.flags.crashed === true && window.__game.store.state.quests['mq.aftermath']?.status === 'active'), 'Act 1 state applied (crashed, Aftermath active)');
ok(await g(() => window.__game.store.state.quests['mq.prologue']?.status === 'completed'), 'prologue completed exactly once');

// Save → mutate → load → compare
await idle();
const saved = await g(async () => {
  const game = window.__game;
  const okSave = await game.save('slot1', 'E2E');
  return { okSave, snap: JSON.stringify(game.store.state) };
});
ok(saved.okSave, 'manual save succeeds in a safe state');
await g(() => window.__game.store.give('ice', 9));
await g(() => window.__game.loadSlot('slot1'));
await idle();
await page.waitForTimeout(1500);
const after = await g(() => JSON.stringify(window.__game.store.state));
const a = JSON.parse(saved.snap), b = JSON.parse(after);
// playtime/clock/vitals advance continuously; compare structure that must match exactly
ok(JSON.stringify(a.quests) === JSON.stringify(b.quests) && JSON.stringify(a.inventories) === JSON.stringify(b.inventories) && JSON.stringify(a.ship) === JSON.stringify(b.ship), 'load restores quests, inventories and ship exactly');

// Transition stress: airlock in/out repeatedly, check listeners & GPU resources don't grow
const before = await g(() => ({ l: window.__game.store.events.listenerCount(), geo: window.__game.renderer.gl.info.memory.geometries }));
for (let i = 0; i < 4; i++) {
  await g(() => window.__game.locations.travel({ location: 'moon.south', spawn: 'airlock' }));
  await idle();
  await g(() => window.__game.locations.travel({ location: 'lantern.interior', spawn: 'airlock' }));
  await idle();
}
await page.waitForTimeout(2000);
const afterT = await g(() => ({ l: window.__game.store.events.listenerCount(), geo: window.__game.renderer.gl.info.memory.geometries }));
ok(afterT.l === before.l, `event listeners stable across transitions (${before.l} → ${afterT.l})`);
ok(afterT.geo <= before.geo * 1.3 + 30, `GPU geometries bounded across transitions (${before.geo} → ${afterT.geo})`);
// Double travel request is rejected
const dbl = await g(async () => {
  const game = window.__game;
  const p1 = game.locations.travel({ location: 'moon.south', spawn: 'ramp' });
  const r2 = await game.locations.travel({ location: 'moon.south', spawn: 'ramp' });
  await p1;
  return r2;
});
ok(dbl === false, 'concurrent transition request is rejected');
await idle();
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-07-moon.png' });

const real = errors.filter((e) => !/WebGL|GPU|swiftshader|favicon/i.test(e));
ok(real.length === 0, `no runtime errors${real.length ? ':\n  ' + real.slice(0, 5).join('\n  ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
