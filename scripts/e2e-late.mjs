#!/usr/bin/env node
/**
 * Late-slice e2e: launch readiness → talk to Kit → launch from the pilot seat → launch
 * cinematic → lunar orbit → dock at Harbor → meet survivors → end of Act 1 → save/load
 * in orbit keeps the ship's position. Requires a running dev server (npm run dev).
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
const waitFor = async (fn, timeout = 150000, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await g(fn, arg)) return true; await page.waitForTimeout(400); }
  return false;
};
const at = (id) => waitFor((i) => window.__game?.currentLocation?.id === i && window.__game.locations.phase === 'idle', 150000, id);
const skip = async () => { await g(() => window.__game.input.simulate('Space', true)); await page.waitForTimeout(300); await g(() => window.__game.input.simulate('Space', false)); };

await page.goto(`${BASE}/?start=launch&quality=low`);
ok(await at('lantern.interior'), 'launch-ready scenario loads aboard the Lantern');
ok(await g(() => window.__game.store.state.quests['mq.ascent']?.status === 'active'), 'Ascent quest active');

// Talk to Kit: pick "We did. Let’s go." via the dialogue runner
await g(() => window.__game.talkTo('dlg.arakawa'));
ok(await g(() => !!document.querySelector('.dialogue')), 'dialogue UI opens');
await g(() => window.__game.dialogue.choose(0));
await g(() => { while (window.__game.dialogue.active) window.__game.dialogue.continue(); });
ok(await g(() => window.__game.store.state.flags['ascent.crewReady'] === true), 'talking to Kit readies the crew');
ok(await g(() => window.__game.input.context === 'gameplay'), 'input returns to gameplay after dialogue');

// Pilot seat → flight deck panel → LAUNCH key
const launched = await g(() => {
  const game = window.__game;
  const seat = game.currentLocation.interactables.find((i) => i.id === 'pilot.seat');
  seat.interact();
  const panel = game.panel;
  const key = panel?.controls.find((c) => c.id === 'launch');
  const enabled = key?.enabled();
  if (enabled) key.onClick();
  return { hadPanel: !!panel, enabled };
});
ok(launched.hadPanel, 'pilot seat opens the first-person flight deck panel');
ok(launched.enabled, 'LAUNCH key is enabled when all systems are ready');
ok(await at('cinematic.opening'), 'launch cinematic starts');
await page.waitForTimeout(8000);
await page.screenshot({ path: 'screenshots/e2e-late-01-launch.png' });
await skip();
ok(await at('space.cislunar'), 'arrives in lunar orbit');
ok(await g(() => window.__game.store.state.flags.launched === true && window.__game.store.state.quests['mq.harbor']?.status === 'active'), 'launch state applied; Harbor quest active');
ok(await g(() => window.__game.store.state.ship.propellant < 1300), 'ascent consumed propellant');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-late-02-orbit.png' });

// Save in orbit, move, load → position restored from parking
const pos1 = await g(async () => {
  const game = window.__game;
  const loc = game.currentLocation;
  loc.flight.position.set(1234, 56, -789);
  loc.persistParking();
  await game.save('slot2', 'orbit');
  return loc.flight.position.toArray();
});
await g(() => window.__game.loadSlot('slot2'));
ok(await at('space.cislunar'), 'reload in orbit');
const pos2 = await g(() => window.__game.currentLocation.flight.position.toArray());
ok(Math.hypot(pos1[0] - pos2[0], pos1[1] - pos2[1], pos1[2] - pos2[2]) < 1, `ship position restored after load (${pos2.map((v) => v.toFixed(0))})`);

// Fly to Harbor (teleport near the port) and dock with G
await g(() => {
  const loc = window.__game.currentLocation;
  const dock = loc.stationDock();
  loc.flight.position.copy(dock).add({ x: 0, y: 0, z: 200 });
  loc.flight.hold();
});
await page.waitForTimeout(1500);
ok(await g(() => window.__game.store.state.flags['harbor.approached'] === true), 'approaching Harbor sets the flag');
await g(() => window.__game.input.simulate('KeyG', true));
await page.waitForTimeout(400);
await g(() => window.__game.input.simulate('KeyG', false));
ok(await at('harbor.interior'), 'docking sequence brings you aboard Harbor Station');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-late-03-harbor.png' });
ok(await g(() => window.__game.store.state.ship.parking.kind === 'docked'), 'ship parking is docked');

// Talk to the station manager until the conversation ends
await g(() => window.__game.talkTo('dlg.carvalho'));
await g(() => {
  const d = window.__game.dialogue;
  let guard = 0;
  while (d.active && guard++ < 40) {
    const v = window.__ui.dialogue.value;
    if (v && v.choices.length) d.choose(v.choices[v.choices.length - 1].index);
    else d.continue();
  }
});
ok(await g(() => window.__game.store.state.flags['harbor.survivors'] === true), 'survivors found');
ok(await waitFor(() => window.__game.store.state.quests['mq.harbor']?.status === 'completed', 10000), 'Harbor quest completed');
ok(await g(() => window.__game.store.state.flags['slice.complete'] === true), 'end of Act 1 reached');

// Back aboard the Lantern via the airlock; the pilot seat can take the helm (undock)
await g(() => window.__game.currentLocation.interactables.find((i) => i.id === 'harbor.toLantern').interact());
ok(await at('lantern.interior'), 'board the Lantern from Harbor');
await g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'pilot.seat').interact();
  const key = game.panel?.controls.find((c) => c.id === 'launch');
  if (key?.enabled()) key.onClick();
});
ok(await at('space.cislunar'), 'take the helm → undocked in orbit');
ok(await g(() => window.__game.store.state.ship.parking.kind === 'space'), 'parking switches to space after undocking');

const real = errors.filter((e) => !/WebGL|GPU|swiftshader/i.test(e));
ok(real.length === 0, `no runtime errors${real.length ? ':\n  ' + real.slice(0, 6).join('\n  ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll late-game checks passed');
process.exit(failures ? 1 : 0);
