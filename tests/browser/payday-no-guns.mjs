// Payday has no guns (they are only in Global Defensive): key 4 draws nothing, R does not reload, nothing is in
// hand, no HP bar, no weapon market in the casino, and the host refuses shots.
//   node tests/browser/payday-no-guns.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'PAYNG1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'png-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 200) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Darja'); localStorage.setItem('infra-face-name', 'Darja'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=payday]').click()); await p.waitForTimeout(800); await p.evaluate(() => (document.getElementById('ss-pay-solo') || document.getElementById('ss-pay-host')).click()); await p.waitForTimeout(3000);
check('Payday started', await p.evaluate(() => !!__infra.lab.world.operations.game.payday));
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(400);
await p.keyboard.press('Digit4'); await p.waitForTimeout(400);
check('Key 4 draws no gun (even Darja)', await p.evaluate(() => !__infra.lab.pistol.equipped));
check('No HP bar in Payday', await p.evaluate(() => document.getElementById('cb-hp').hidden));
check('No weapon market in the casino', await p.evaluate(() => { let n = 0; __infra.scene.traverse(o => { if (o.userData?.table === 'guns') n++; }); return n === 0; }));
const r = await p.evaluate(async () => { try { await __infra.lab.world.apply({ type: 'combat', action: { type: 'hit', target: 'x', weapon: 'ak' } }, __infra.lab.lan.selfID || 'ENGINEER-01'); return 'accepted'; } catch (e) { return e.message; } });
check('The host rules refuse shots in Payday', /only in Global Defensive/.test(r), r);
check('No page errors', errs.length === 0, errs.join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
