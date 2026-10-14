// Global Defensive practice, in a real browser: started from the start panel on a Defuse map (any map) with its
// settings; no time limit; the bots stand still; shooting leaves red impact marks and shows the spray in the recoil
// panel; a reload never takes from the reserve (infinite ammo); a thrown grenade draws its flight path; the Esc menu
// changes the settings in the session (bots move); no hitch in play; no page errors.
//   node tests/browser/gd-practice-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'PRAC01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'pr-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Trainee'); localStorage.setItem('infra-face-name', 'Trainee'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForSelector('#ss-ar-kind');
await p.selectOption('#ss-ar-kind', 'practice'); await p.waitForTimeout(200);
const panel = await p.evaluate(() => ({ shown: !document.getElementById('ss-ar-practice').hidden, maps: [...document.querySelectorAll('#ss-ar-map option')].map(o => o.value) }));
check('practice: its settings shown, every map offered (Defuse maps too)', panel.shown && panel.maps.includes('dust2') && panel.maps.includes('yard'), JSON.stringify(panel));
await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '2'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 60000 });
await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy(false); __infra.lab.enter(); }); await p.waitForTimeout(1500);
const A = await p.evaluate(() => { const a = __infra.lab.world.operations.game.arena; return { kind: a.kind, map: a.map, practice: a.practice, endsIn: a.endsAt - Date.now(), bots: a.bots.length }; });
check('a practice session on Dust II: no time limit, its settings, the bots', A.map === 'dust2' && A.practice?.bots === 'stand' && A.practice.impacts && A.endsIn > 1e9 && A.bots === 2, JSON.stringify({ ...A, endsIn: A.endsIn > 1e9 }));
const bpos = () => p.evaluate(() => __infra.lab.world.operations.game.arena.bots.map(b => [b.x, b.z]));
const b0 = await bpos(); await p.waitForTimeout(2000); const b1 = await bpos(); check('the bots stand still', b0.every((q, i) => Math.hypot(q[0] - b1[i][0], q[1] - b1[i][1]) < .5), JSON.stringify([b0, b1]));
// Shoot at a wall: impacts and the spray.
await p.evaluate(async () => { await __infra.lab.lan.act({ type: 'arena', action: { type: 'loadout', primary: 'ak' } }); __infra.lab.arenaUI?.buy(false); __infra.lab.pistol.equip('ak'); }); await p.waitForTimeout(1300);
for (let i = 0; i < 6; i++) { await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForTimeout(110); }
await p.waitForTimeout(200);
const marks = await p.evaluate(() => { const m = __infra.scene.children.find(o => o.isInstancedMesh && o.count === 192); if (!m) return -1; let k = 0; const M = new (m.matrix.constructor)(); for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M); if (M.elements[13] > -1000) k++; } return k; });
check('shots leave red impact marks', marks >= 4, marks);
check('the recoil panel shows the spray', await p.evaluate(() => getComputedStyle(document.getElementById('gd-recoil')).display === 'block'));
const res0 = await p.evaluate(() => __infra.lab.pistol.reserve); await p.evaluate(() => __infra.lab.pistol.reload()); await p.waitForTimeout(3200); const res1 = await p.evaluate(() => [__infra.lab.pistol.ammo, __infra.lab.pistol.reserve]);
check('infinite ammo: a reload fills the magazine, the reserve stays', res1[0] === 30 && res1[1] === res0, JSON.stringify([res0, res1]));
// A grenade: its flight path.
await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: 'he' } })); await p.waitForTimeout(300);
await p.evaluate(() => __infra.lab.arenaUI.throwNade('he', 'long')); await p.waitForTimeout(600);
const line = await p.evaluate(() => Math.max(0, ...__infra.scene.children.filter(o => o.isLine && o.userData.gd).map(l => l.geometry.drawRange.count)));
check('a thrown grenade draws its flight path', line > 5, line);
// The Esc menu changes the session's settings.
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
const menu = await p.evaluate(() => [...document.querySelectorAll('#gd-menu .gm-practice button')].map(x => x.textContent));
check('Esc: the practice settings', menu.length >= 5 && /stand still/.test(menu[0]), JSON.stringify(menu));
await p.evaluate(() => document.querySelector('#gd-menu .gm-practice [data-k=bots]').click()); await p.waitForTimeout(800);
check('…bots: move (the session changed)', await p.evaluate(() => __infra.lab.world.operations.game.arena.practice.bots) === 'move');
await p.evaluate(() => document.querySelector('#gd-menu [data-gm=resume]')?.click()); await p.waitForTimeout(800);
const frames = await p.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = t => { ts.push(t - last); last = t; if (ts.length < 150) requestAnimationFrame(f); else res(ts.slice(5)); }; requestAnimationFrame(f); }));
check('no hitch in practice (no frame over 50 ms)', Math.max(...frames) < 50, 'max ' + Math.max(...frames).toFixed(1));
await p.screenshot({ path: path.join(out, 'practice.jpg'), type: 'jpeg', quality: 80 });
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
