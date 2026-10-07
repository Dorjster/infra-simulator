// Rebinding in a real browser through Settings → Controls: Objective J → K, then real key presses in the game.
//   node tests/browser/controls-rebind.mjs <repo-root>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root] = process.argv.slice(2);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'KEY001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'kb-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-player-preferences', JSON.stringify({ showControls: true })); });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d ? ' · ' + String(d).slice(0, 200) : '')); };
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1500);
await p.click('[data-start=free]'); await p.waitForTimeout(2500);
const panelOpen = () => p.evaluate(() => !!__infra.lab.campaignUI.isOpen);
const enter = () => p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.enter(); });
await p.evaluate(() => __infra.lab.campaignUI.panel('settings')); await p.waitForTimeout(400);
await p.click('[data-rebind="objective"]'); await p.waitForTimeout(150);
check('Clicking a control waits for a key', /Press a key/.test(await p.$eval('[data-rebind="objective"]', e => e.innerText)));
await p.keyboard.press('k'); await p.waitForTimeout(250);
check('Objective is now K', (await p.$eval('[data-rebind="objective"]', e => e.innerText)) === 'K');
await enter(); await p.waitForTimeout(400);
check('Hint bar shows the new key', /K<\/kbd> objective/.test(await p.$eval('#controls-hint', e => e.innerHTML)), await p.$eval('#controls-hint', e => e.innerText));
await p.keyboard.press('j'); await p.waitForTimeout(300); check('J no longer opens the objective', !(await panelOpen()));
await p.keyboard.press('k'); await p.waitForTimeout(300); check('K opens the objective', await panelOpen());
// Conflict: binding Objective to E asks to swap (accepted), then E opens the objective and K "uses".
p.once('dialog', d => d.accept()); await p.evaluate(() => __infra.lab.campaignUI.panel('settings')); await p.waitForTimeout(300); await p.click('[data-rebind="objective"]'); await p.keyboard.press('e'); await p.waitForTimeout(300);
check('Conflict offers a swap; use moves to K', (await p.$eval('[data-rebind="objective"]', e => e.innerText)) === 'E' && (await p.$eval('[data-rebind="interact"]', e => e.innerText)) === 'K');
// Text fields: typing in the search box never moves or triggers actions.
await p.fill('#ctl-search', 'map'); check('Search filters the list', (await p.$$eval('[data-rebind]', l => l.length)) <= 3);
p.once('dialog', d => d.accept()); await p.fill('#ctl-search', ''); await p.click('[data-ctl="reset"]'); await p.waitForTimeout(300);
check('Reset restores J for the objective', (await p.$eval('[data-rebind="objective"]', e => e.innerText)) === 'J');
// Survives reload.
await p.click('[data-rebind="map"]'); await p.keyboard.press('n'); await p.reload(); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 });
check('Bindings survive a restart', await p.evaluate(async () => (await import('./input.js')).labelOf('infra', 'map') === 'N'));
check('No page errors', !errs.length, errs.join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
