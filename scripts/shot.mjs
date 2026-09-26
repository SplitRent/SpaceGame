#!/usr/bin/env node
/**
 * Dev helper: open the game in headless Chromium, optionally run a small script of
 * actions, and save screenshots.  Usage:
 *   node scripts/shot.mjs <url> <out.png> [waitMs] [jsonActions]
 * Actions: [{"eval":"js"},{"wait":ms},{"key":"KeyW","down":true},{"shot":"file.png"}]
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [url, out, waitMs = '4000', actionsJson = '[]'] = process.argv.slice(2);
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +(process.env.W ?? 960), height: +(process.env.H ?? 540) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(+waitMs);
for (const a of JSON.parse(actionsJson)) {
  if (a.eval) logs.push(`[eval] ${JSON.stringify(await page.evaluate(a.eval))}`);
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.key) await page.evaluate(([k, d]) => window.__game.input.simulate(k, d), [a.key, a.down]);
  if (a.shot) await page.screenshot({ path: a.shot });
  if (a.click) await page.mouse.click(a.click[0], a.click[1]);
}
await page.screenshot({ path: out });
console.log(logs.slice(-60).join('\n'));
await browser.close();
