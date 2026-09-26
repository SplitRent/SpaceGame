#!/usr/bin/env node
/**
 * Act 2 e2e: Rafi's briefing → Harbor depot refuel → bridge holo star map (locked Earth,
 * available Mars) → plot course → walk the ship during transit → take the helm → arrival in
 * Mars orbit → land in Melas Chasma → Melas Station: find the crew → splice the feeder →
 * seat cells & restart the bus → footage → footprints → spire → report to Imani →
 * take-off back to Mars orbit. Requires a running dev server (npm run dev).
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
const talkAll = (dlg) => g((d) => {
  const game = window.__game;
  game.talkTo(d);
  let guard = 0;
  while (game.dialogue.active && guard++ < 40) {
    const v = window.__ui.dialogue.value;
    if (v && v.choices.length) game.dialogue.choose(v.choices[0].index);
    else game.dialogue.continue();
  }
}, dlg);
const interact = (id) => g((i) => { const it = window.__game.currentLocation.interactables.find((x) => x.id === i); if (!it) return false; it.interact(); return true; }, id);
const quest = (id) => g((q) => window.__game.store.state.quests[q], id);

// ---- Harbor: briefing + depot
await page.goto(`${BASE}/?start=harbor&quality=low`);
ok(await at('harbor.interior'), 'Harbor scenario loads');
await talkAll('dlg.carvalho');
ok(await waitFor(() => window.__game.store.state.flags['slice.complete'] === true, 10000), 'Act 1 ends at Harbor');
ok(await waitFor(() => window.__game.store.state.quests['mq.frontier']?.status === 'active', 10000), 'Act 2 quest “The Frontier” starts');
await talkAll('dlg.haddad');
ok(await g(() => window.__game.store.state.flags['frontier.briefed'] === true), 'Rafi briefs the Mars mission');
const before = await g(() => window.__game.store.state.ship.propellant);
ok(await interact('harbor.depot'), 'Harbor propellant depot is usable');
const after = await g(() => window.__game.store.state.ship.propellant);
ok(after === 2400 && after > before, `depot fills the tanks (${Math.round(before)} → ${after} kg)`);
ok(await waitFor(() => window.__game.store.state.quests['mq.frontier']?.stage === 'plot', 10000), 'fuel objective completes');

// ---- Undock, walk to the bridge, star map
await interact('harbor.toLantern');
ok(await at('lantern.interior'), 'back aboard the Lantern');
const docked = await g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'holo.table').interact();
  const p = game.panel;
  p.select('mars');
  const key = p.controls.find((c) => c.id.startsWith('key.') && c.label().startsWith('PLOT'));
  return { title: p.title, enabled: key.enabled(), reason: game.travel.status(game.travel.entry('mars')).reason };
});
ok(docked.title === 'Holographic star map', 'holo table opens the first-person star map');
ok(!docked.enabled && /Undock/.test(docked.reason), `plotting is refused while docked (“${docked.reason}”)`);
const earth = await g(() => { const game = window.__game; game.panel.select('earth'); return game.travel.status(game.travel.entry('earth')); });
ok(earth.locked && /quarantine/i.test(earth.reason), 'Earth is locked with a story reason');
const jup = await g(() => { const game = window.__game; game.panel.select('jupiter'); return game.travel.status(game.travel.entry('jupiter')); });
ok(jup.locked && /drive/i.test(jup.reason), 'Jupiter is locked by drive range');
await page.screenshot({ path: 'screenshots/e2e-mars-01-starmap.png' });
await g(() => window.__game.closePanel());
await g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'pilot.seat').interact();
  game.panel.controls.find((c) => c.id === 'launch').onClick();
});
ok(await at('space.cislunar'), 'take the helm → undock into lunar orbit');
await g(() => window.__game.currentLocation.leaveSeat());
ok(await at('lantern.interior'), 'leave the seat to walk the ship in orbit');
const plotted = await g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'holo.table').interact();
  const p = game.panel;
  p.select('mars');
  const key = p.controls.find((c) => c.id.startsWith('key.') && c.label().startsWith('PLOT'));
  const enabled = key.enabled();
  if (enabled) key.onClick();
  return { enabled, parking: game.store.state.ship.parking, prop: game.store.state.ship.propellant };
});
ok(plotted.enabled, 'PLOT COURSE is available in orbit');
ok(plotted.parking.kind === 'transit' && plotted.parking.to === 'space.mars', 'transfer burn puts the ship in transit to Mars');
ok(plotted.prop === 1600, `burn costs 800 kg (${plotted.prop} kg left)`);

// ---- Transit: walk the ship, then take the helm
await page.waitForTimeout(2500);
const prog = await g(() => window.__game.store.state.ship.parking.elapsed);
ok(prog > 0, `transit clock runs while walking the ship (${prog.toFixed(1)} s)`);
await g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'pilot.seat').interact();
  game.panel.controls.find((c) => c.id === 'launch').onClick();
});
ok(await at('space.transit'), 'take the helm during transit → cruise view');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/e2e-mars-02-transit.png' });
await g(() => { window.__game.store.state.ship.parking.elapsed = window.__game.store.state.ship.parking.duration - 1; });
ok(await at('space.mars'), 'arrival: orbit insertion at Mars');
ok(await waitFor(() => window.__game.store.state.universe.discovered['mars.orbit'] === true, 5000), 'Mars orbit discovered');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-mars-03-orbit.png' });

// ---- Descend and land
await g(() => { const loc = window.__game.currentLocation; loc.flight.position.set(0, -34500, 0); loc.flight.hold(); });
await page.waitForTimeout(800);
await g(() => window.__game.input.simulate('KeyG', true));
await page.waitForTimeout(400);
await g(() => window.__game.input.simulate('KeyG', false));
ok(await at('mars.melas'), 'land in Melas Chasma');
ok(await g(() => window.__game.store.state.ship.parking.kind === 'surface' && window.__game.store.state.ship.parking.locationId === 'mars.melas'), 'ship parked on Mars');
ok(await g(() => window.__game.currentLocation.env.gravity === 3.71 && window.__game.currentLocation.env.atmosphere === 'thin-co2'), 'Mars gravity and thin CO₂ air');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-mars-04-surface.png' });

// Lantern interior on Mars uses Mars gravity
await interact('enter.airlock');
ok(await at('lantern.interior'), 'enter the Lantern on Mars');
ok(await g(() => window.__game.currentLocation.env.gravity === 3.71), 'interior gravity follows the parked world (3.71)');
await g(() => window.__game.currentLocation.interactables.find((i) => i.id === 'airlock.outer').interact());
ok(await at('mars.melas'), 'airlock back out onto Mars');

// ---- Melas Station
await interact('melas.door');
ok(await at('mars.station'), 'enter Melas Station');
await talkAll('dlg.rao');
ok(await g(() => window.__game.store.state.flags['melas.found'] === true), 'found the station crew');
await interact('melas.cabinet');
ok(await g(() => window.__game.store.count('conduit') >= 1), 'supply cabinet has a spare conduit');
await interact('melas.out');
ok(await at('mars.melas'), 'back outside');
await g(() => { const t = window.__game.currentLocation.toolTargets.find((x) => x.id === 'melas.cable'); if (t.available()) t.onComplete(); });
ok(await g(() => window.__game.store.state.flags['melas.cable'] === true), 'feeder cable spliced (weld)');
await interact('melas.door');
ok(await at('mars.station'), 're-enter the station');
const bus = await g(() => {
  const game = window.__game;
  game.store.give('powercell', 2);
  game.currentLocation.interactables.find((i) => i.id === 'melas.bus').interact();
  const p = game.panel;
  const cells = p.controls.find((c) => c.id === 'cells');
  if (cells.enabled()) cells.onClick();
  const restart = p.controls.find((c) => c.id === 'restart');
  const en = restart.enabled();
  if (en) restart.onClick();
  game.closePanel();
  return en;
});
ok(bus, 'bus console: seat cells, restart enabled');
ok(await g(() => window.__game.store.state.flags['melas.power'] === true), 'Melas Station power restored');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/e2e-mars-05-station.png' });
await talkAll('dlg.rao');
ok(await waitFor(() => window.__game.store.state.quests['mq.frontier']?.status === 'completed', 10000), '“The Frontier” completed');
ok(await waitFor(() => window.__game.store.state.quests['mq.footprints']?.status === 'active', 10000), '“Footprints” starts');
const refuel = await g(() => { const game = window.__game; game.store.setPropellant(100); game.currentLocation.interactables.find((i) => i.id === 'melas.isru').interact(); return game.store.state.ship.propellant; });
ok(refuel === 2400, 'ISRU plant refuels the Lantern on the pad');

// ---- Footprints → spire
await interact('melas.out');
ok(await at('mars.melas'), 'outside again');
ok(await g(() => window.__game.currentLocation.footprints.visible === true), 'footprints are revealed');
await g(() => { const game = window.__game; const L = game.currentLocation; const p = game.player.position.clone(); p.set(752, L.hf.heightAt(752, -432) + 0.3, -432); game.player.teleport(p); });
ok(await waitFor(() => window.__game.store.state.universe.discovered['mars.spire'] === true, 10000), 'follow the tracks to the spire');
await g(() => { const s = window.__game.store; s.state.database['db.spire'] = { at: s.state.clock }; s.apply([{ setFlag: 'spire.scanned' }]); s.markChanged('scan'); });
ok(await waitFor(() => window.__game.store.state.quests['mq.footprints']?.stage === 'report', 5000), 'spire scanned');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/e2e-mars-06-spire.png' });
await talkAll('dlg.sola');
ok(await waitFor(() => window.__game.store.state.quests['mq.footprints']?.status === 'completed', 10000), '“Footprints” completed after telling Imani');

// ---- Save/load on Mars, then take off
await g(() => window.__game.save('slot3', 'mars'));
await g(() => window.__game.loadSlot('slot3'));
ok(await at('mars.melas'), 'reload on Mars');
ok(await g(() => window.__game.store.state.ship.parking.locationId === 'mars.melas'), 'parking survives save/load');
await interact('enter.airlock');
ok(await at('lantern.interior'), 'board the Lantern');
const off = await g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'pilot.seat').interact();
  const key = game.panel.controls.find((c) => c.id === 'launch');
  const label = key.label();
  const en = key.enabled();
  if (en) key.onClick();
  return { label, en };
});
ok(off.en && /TAKE OFF/.test(off.label), `pilot key offers take-off (“${off.label}”)`);
ok(await at('space.mars'), 'lift-off to Mars orbit');
ok(await g(() => window.__game.store.state.ship.propellant === 1950), 'Mars ascent costs 450 kg');

const real = errors.filter((e) => !/WebGL|GPU|swiftshader/i.test(e));
ok(real.length === 0, `no runtime errors${real.length ? ':\n  ' + real.slice(0, 6).join('\n  ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll Act 2 checks passed');
process.exit(failures ? 1 : 0);
