#!/usr/bin/env node
/**
 * Acts 2b–5 e2e: Ceres (Deep, pylons, hangar) → fusion torch on the upgrade console →
 * take-off → star map to Europa → transit → land → recorder + node scan → Pluto: find the
 * commander → Threshold glyph door → gate jump to Vesper → land (breathable) → Archive
 * memories → crew gathers → final choice → ending → Earth unlocked → gate home.
 * Side: Halcyon radar and the Mercury spire. Requires a running dev server.
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
const talkAll = (dlg, pick = 0) => g(([d, pick]) => {
  const game = window.__game;
  game.talkTo(d);
  let guard = 0;
  while (game.dialogue.active && guard++ < 40) {
    const v = window.__ui.dialogue.value;
    if (v && v.choices.length) game.dialogue.choose(v.choices[Math.min(pick, v.choices.length - 1)].index);
    else game.dialogue.continue();
  }
}, [dlg, pick]);
const interact = (id) => g((i) => { const it = window.__game.currentLocation.interactables.find((x) => x.id === i); if (!it) return false; if (it.available && !it.available()) return 'unavailable'; it.interact(); return true; }, id);
const flag = (f) => g((x) => window.__game.store.state.flags[x], f);
const quest = (q) => g((x) => window.__game.store.state.quests[x]?.status ?? null, q);
const scan = (id) => g((x) => window.__game.tools.completeScan(x, true), id);
const pilot = () => g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'pilot.seat').interact();
  const key = game.panel.controls.find((c) => c.id === 'launch');
  const r = { label: key.label(), enabled: key.enabled() };
  if (r.enabled) key.onClick(); else game.closePanel();
  return r;
});
const plot = (body) => g((b) => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'holo.table').interact();
  const p = game.panel;
  p.select(b);
  const key = p.controls.find((c) => c.id.startsWith('key.') && c.label().startsWith('PLOT'));
  const enabled = key.enabled();
  const reason = game.travel.status(game.travel.entry(b)).reason;
  if (enabled) key.onClick(); else game.closePanel();
  return { enabled, reason };
}, body);
const land = async () => {
  await g(() => { const L = window.__game.currentLocation; L.flight.position.y = -L.def.originAltKm * 1000 + 500 + L.def.minAltM; L.flight.hold(); });
  await page.waitForTimeout(600);
  await g(() => window.__game.input.simulate('KeyG', true));
  await page.waitForTimeout(400);
  await g(() => window.__game.input.simulate('KeyG', false));
};

/* ------------------------------ Ceres ------------------------------ */
await page.goto(`${BASE}/?start=ceres&quality=low`);
ok(await at('ceres.occator'), 'Ceres scenario: landed in Occator');
ok(await waitFor(() => window.__game.store.state.quests['mq.network']?.stage === 'deep', 10000), '“The Network” reaches the Ceres Deep stage');
ok((await interact('deep')) === true, 'Ceres Deep airlock');
ok(await at('ceres.deep'), 'inside Ceres Deep');
await talkAll('dlg.adeyemi');
ok(await flag('ceres.met'), 'met Adeyemi');
await page.screenshot({ path: 'screenshots/e2e-finale-01-deep.png' });
await interact('exit');
ok(await at('ceres.occator'), 'back on the salt');
const hangarLocked = await interact('hangar');
ok(hangarLocked === 'unavailable', 'hangar stays locked until the pylons are reset');
await g(() => {
  const L = window.__game.currentLocation;
  for (const id of ['weld:pylon1', 'weld:pylon2', 'weld:pylon3']) { const t = L.toolTargets.find((x) => x.id === id); if (t.available()) t.onComplete(); }
});
ok((await flag('ceres.pylon.1')) && (await flag('ceres.pylon.2')) && (await flag('ceres.pylon.3')), 'three relay pylons welded');
ok((await interact('hangar')) === true, 'hangar cradle raised');
ok(await g(() => window.__game.store.count('fusioncore') === 1 && window.__game.store.count('magcoil') >= 2), 'fusion core and coils collected');
await interact('enter.airlock');
ok(await at('lantern.interior'), 'aboard the Lantern');
const up = await g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'upgrades').interact();
  const p = game.panel;
  for (const id of ['core', 'coils', 'tune', 'tiles']) { const c = p.controls.find((x) => x.id === id); if (c.enabled()) c.onClick(); }
  game.closePanel();
  return { fusion: game.store.state.ship.systems['prop.fusion'].online, thermal: game.store.state.ship.systems['hull.thermal'].online };
});
ok(up.fusion, 'Kestrel fusion torch online (upgrade console)');
ok(up.thermal, 'thermal shield fitted');
ok(await waitFor(() => window.__game.store.state.quests['mq.network']?.status === 'completed', 10000), '“The Network” completed');
ok(await waitFor(() => window.__game.store.state.quests['mq.cadence']?.status === 'active', 10000), '“The Cadence” starts');
const cap = await g(() => { window.__game.store.setPropellant(99999); return window.__game.store.state.ship.propellant; });
ok(cap === 4400, `fusion tankage raises capacity to ${cap} kg`);

/* ------------------------- Take off → Europa ------------------------- */
const off = await pilot();
ok(off.enabled && /TAKE OFF/.test(off.label), `take-off from Ceres (“${off.label}”)`);
ok(await at('space.ceres'), 'in Ceres orbit');
await g(() => { const L = window.__game.currentLocation; L.flight.hold(); return L.leaveSeat(); });
ok(await at('lantern.interior'), 'walk to the bridge');
const pe = await plot('europa');
ok(pe.enabled, `plot course to Europa${pe.reason ? ` (${pe.reason})` : ''}`);
await g(() => { const p = window.__game.store.state.ship.parking; p.elapsed = p.duration - 0.5; });
await waitFor(() => window.__game.store.state.ship.parking.kind === 'space', 20000);
ok(await g(() => window.__game.store.state.ship.parking.locationId === 'space.jupiter'), 'arrived in Europa orbit while walking the ship');
await pilot();
ok(await at('space.jupiter'), 'take the helm at Jupiter');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/e2e-finale-02-jupiter.png' });
await land();
ok(await at('europa.conamara'), 'land on Europa');
ok(await g(() => window.__game.currentLocation.hazardAt()?.radiation > 0), 'Europa radiation hazard active');
await g(() => { const game = window.__game; const L = game.currentLocation; const p = game.player.position.clone(); p.set(250, L.hf.heightAt(250, -182) + 0.3, -182); game.player.teleport(p); });
ok((await interact('recorder')) === true, 'commander’s recorder (Europa)');
await g(() => window.__game.closeOverlay());
await scan('db.europaspire');
ok(await flag('cadence.1'), 'Europa node scanned: first line of the Cadence');

/* ------------------------------ Pluto ------------------------------ */
await page.goto(`${BASE}/?start=pluto&quality=low`);
ok(await at('pluto.sputnik'), 'Pluto scenario');
ok(await waitFor(() => window.__game.currentLocation.interactables.some((i) => i.id === 'npc:okonkwo'), 10000), 'Okonkwo is standing at the Pluto spire');
await talkAll('dlg.okonkwo', 1);
ok(await flag('okonkwo.found'), 'Commander found');
ok(await g(() => window.__game.store.count('latticekey') === 1), 'Lattice Key received');
ok(await waitFor(() => window.__game.store.state.quests['mq.threshold']?.status === 'active', 10000), '“The Threshold” starts');
ok(await g(() => window.__game.travel.visibleEntries().some((e) => e.body === 'threshold')), 'Threshold appears on the star map');

/* ------------------------------ Threshold ------------------------------ */
await page.goto(`${BASE}/?start=threshold&quality=low`);
ok(await at('threshold.interior'), 'inside the Threshold');
const glyph = await g(() => {
  const game = window.__game;
  game.currentLocation.interactables.find((i) => i.id === 'door').interact();
  const p = game.panel;
  const openKey = p.controls.find((c) => c.id === 'OPEN THE WAY');
  const before = openKey.enabled();
  for (let i = 0; i < 3; i++) for (let k = 0; k < 6 && !p.rings.every((r, j) => r === [2, 5, 1][j]); k++) if (p.rings[i] !== [2, 5, 1][i]) p.controls.find((c) => c.id === `Turn ring ${i + 1} ▶`).onClick();
  const after = openKey.enabled();
  if (after) openKey.onClick();
  return { before, after };
});
ok(!glyph.before && glyph.after, 'glyph rings must be attuned before the Door opens');
ok(await at('space.vesper'), 'gate jump: arrived at Vesper b');
ok(await waitFor(() => window.__game.store.state.quests['mq.vesper']?.status === 'active', 10000), '“Vesper” starts');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-finale-03-vesper-orbit.png' });
await land();
ok(await at('vesper.terminator'), 'land on Vesper b');
ok(await g(() => window.__game.suit.readout.pressurized === true || window.__game.currentLocation.env.atmosphere === 'breathable'), 'breathable air: helmet off');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/e2e-finale-04-vesper.png' });
ok((await interact('archivedoor')) === true, 'Archive door');
ok(await at('vesper.archive'), 'inside the Archive');
for (const m of ['mem1', 'mem2', 'mem3']) { await interact(m); await g(() => window.__game.closeOverlay()); }
ok((await flag('archive.mem1')) && (await flag('archive.mem2')) && (await flag('archive.mem3')), 'three memories');
ok(await waitFor(() => ['npc:okonkwo', 'npc:sola', 'npc:haddad'].every((n) => window.__game.currentLocation.interactables.some((i) => i.id === n)), 10000), 'the crew gathers in the Heart');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/e2e-finale-05-heart.png' });
await talkAll('dlg.okonkwo', 1);
ok((await flag('ending.chosen')) === 'close', 'final choice made (close the Lattice)');
ok(await waitFor(() => window.__ui.overlay.value === 'ending', 10000), 'ending sequence plays');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/e2e-finale-06-ending.png' });
await g(() => window.__game.finishEnding());
ok(await g(() => window.__ui.overlay.value === null && window.__game.input.context === 'gameplay'), 'back to free exploration after the credits');
ok(await waitFor(() => window.__game.store.state.quests['mq.truth']?.status === 'completed', 10000), '“The Truth” completed');
ok(await flag('earth.quarantine.lifted'), 'Earth quarantine lifted');

/* ------------------------------ Gate home ------------------------------ */
await page.goto(`${BASE}/?start=vesper&quality=low`);
ok(await at('vesper.terminator'), 'Vesper scenario');
await g(() => window.__game.locations.travel({ location: 'vesper.gatehall', spawn: 'dock' }));
ok(await at('vesper.gatehall'), 'Far Gate hall');
await interact('return');
ok(await at('space.threshold'), 'gate home: back at the Threshold');
ok(await g(() => window.__game.travel.currentSystem() === 'sol'), 'back in the Solar System');

/* ------------------------------ Side: older than us ------------------------------ */
await page.goto(`${BASE}/?start=venus&quality=low`);
ok(await at('venus.halcyon'), 'Halcyon aerostat');
await interact('radar');
await g(() => window.__game.closeOverlay());
ok(await flag('halcyon.radar'), 'deep radar survey read');
await page.goto(`${BASE}/?start=mercury&quality=low`);
ok(await at('mercury.chao'), 'Mercury, Chao Meng-Fu');
await scan('db.oldspire');
await talkAll('dlg.sola');
ok(await flag('oldspire.reported'), 'reported the old spire to Imani');

const real = errors.filter((e) => !/WebGL|GPU|swiftshader/i.test(e));
ok(real.length === 0, `no runtime errors${real.length ? ':\n  ' + real.slice(0, 8).join('\n  ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll finale checks passed');
process.exit(failures ? 1 : 0);
