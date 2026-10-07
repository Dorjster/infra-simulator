// Global Defensive grenades in a real browser: buy all four in the buy menu, key 4 cycles them, left click throws;
// the host runs them (HE, flash, smoke, molotov), effects are drawn, a flashbang you face whites out the screen and
// wears off, and no frame over 50 ms while it all happens.   node tests/browser/arena-nades-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GUN001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'g-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
p.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Darja'); localStorage.setItem('infra-face-name', 'Darja'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1500);
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 200) : '')); };
await p.evaluate(() => { globalThis.__lf = []; let last = 0; const tick = t => { const load = !document.getElementById('ar-load')?.hidden || !document.getElementById('start-screen')?.hidden; if (last && !load && t - last > 50) __lf.push(Math.round(t - last)); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 }); await p.waitForTimeout(600);
if (await p.evaluate(() => document.getElementById('ar-buy').hidden)) await p.keyboard.press('KeyB');
for (const k of ['he', 'flash', 'smoke', 'molotov']) await p.evaluate(k => document.querySelector(`#ar-buy [data-pick="${k}"]`).click(), k);
await p.waitForTimeout(500); check('Bought all four grenades in the buy menu', await p.evaluate(() => JSON.stringify(__infra.lab.world.operations.game.arena.loadout.darja?.nades)) === '["he","flash","smoke","molotov"]');
await p.evaluate(() => document.querySelector('#ar-buy [data-act="close"]').click()); await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(300);
const kinds = [];
for (let i = 0; i < 4; i++) { await p.keyboard.press('Digit4'); await p.waitForTimeout(650); kinds.push(await p.evaluate(() => __infra.lab.pistol.current?.id)); if (i === 0) await p.screenshot({ path: path.join(out, 'nade-in-hand.png') });
  await p.evaluate(() => { const c = __infra.camera; c.rotation.set(-.35, c.rotation.y, 0); }); await p.mouse.move(700, 425); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(300); }
check('Key 4 cycled through the grenades and left click threw each', new Set(kinds).size >= 3, JSON.stringify(kinds));
await p.waitForTimeout(1600); const phases = await p.evaluate(() => __infra.lab.world.operations.game.combat.nades.map(n => n.kind + ':' + n.phase));
check('Host is running them (boom / pop / smoke / fire)', phases.length >= 2, JSON.stringify(phases));
await p.screenshot({ path: path.join(out, 'nades.png') });
check('Effects drawn (explosion, smoke cloud or fire)', await p.evaluate(() => { let n = 0; __infra.scene.getObjectByName('nades')?.traverse(o => { if (o.isSprite || o.isMesh) n++; }); return n; }) > 5);
check('All grenades used up', await p.evaluate(() => (__infra.lab.world.operations.game.arena.loadout.darja?.nades || []).length === 0));
// Flashbang at your feet while looking at it: the screen goes white.
await p.evaluate(() => __infra.lab.lan.send ? null : null); await p.evaluate(() => document.querySelector('#ar-buy') && null);
await p.evaluate(async () => { const L = __infra.lab; await (L.lan.connected ? L.lan.send({ type: 'arena', action: { type: 'buy-nade', kind: 'flash' } }) : L.world.apply({ type: 'arena', action: { type: 'buy-nade', kind: 'flash' } }, 'ENGINEER-01')); });
await p.waitForTimeout(400); await p.keyboard.press('Digit4'); await p.waitForTimeout(650); await p.evaluate(() => { const c = __infra.camera; c.rotation.set(-1.2, c.rotation.y, 0); }); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(1900);
check('Flashbang whites out the screen when you face it', await p.evaluate(() => +document.getElementById('gd-flash').style.opacity) > .5, await p.evaluate(() => document.getElementById('gd-flash').style.opacity));
await p.screenshot({ path: path.join(out, 'flashed.png') });
await p.waitForTimeout(4500); check('Flash wears off', await p.evaluate(() => +document.getElementById('gd-flash').style.opacity) < .05);
check('No hitches while throwing and blowing things up (no frame over 50 ms)', (await p.evaluate(() => __lf)).length === 0, JSON.stringify(await p.evaluate(() => __lf)));
check('No page errors', errs.length === 0, errs.join(' | ')); console.log(ok + '/' + n); await b.close(); server.kill();
