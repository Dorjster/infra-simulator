// Global Defensive's LOADOUT & SKINS picker (M → LOADOUT & SKINS, PLAN §6): fits a 1280×720 and a 1920×1080 window
// (nothing past the window, only its lists scroll), every category lists its guns, a finish is picked (CS2's when the
// host has them imported, else built-in) and equipped on the AK: the room keeps it, the list ticks it; the search
// keeps its focus while it filters and typing in it never moves the player; closing it leaves nothing behind (Esc in play: lab.js, unchanged — this window never
// entered play, so it is closed by the menu's own call here). No page errors.
//   node tests/browser/gd-skins-picker-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SKPK01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'sk-')), 's.json') }, stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); }; const errs = [];
const bw = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const ctx = await bw.newContext({ viewport: { width: 1280, height: 720 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Ann'); localStorage.setItem('infra-face-name', 'Ann'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForSelector('#ss-ar-solo');
await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-host').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 90000 });
await p.waitForTimeout(2500);   // (skin-sync: the host's catalogue fetched on its 1 s timer)
const openSkins = () => p.evaluate(() => { __infra.lab.arenaUI.teamMenu(true); document.querySelector('#ar-team [data-tab=skins]').click(); });
const fit = () => p.evaluate(() => { const box = document.querySelector('#ar-team>div').getBoundingClientRect(), r = id => document.getElementById(id)?.getBoundingClientRect(), W = innerWidth, H = innerHeight, cols = ['sk-list', 'sk-mid', 'sk-detail'].map(r);
  return { W, H, box: [box.left, box.top, box.right, box.bottom].map(Math.round), inside: box.left >= 0 && box.top >= 0 && box.right <= W && box.bottom <= H, cols: cols.map(c => c && Math.round(c.width)), hscroll: document.documentElement.scrollWidth > W, panelH: document.querySelector('#ar-team>div').scrollWidth > document.querySelector('#ar-team>div').clientWidth + 1, thumbs: document.querySelectorAll('#sk-grid .sk-grid button').length, cs2: !!document.querySelector('[data-sk-src=cs2]') }; });
await openSkins(); await p.waitForTimeout(400);
const f1 = await fit(); check('1280×720: the panel inside the window, three columns, no sideways scroll', f1.inside && f1.cols.every(w => w > 150) && !f1.hscroll && !f1.panelH && f1.thumbs > 0, JSON.stringify(f1));
await p.screenshot({ path: path.join(out, 'picker-1280.jpg'), type: 'jpeg', quality: 80 });
const cats = await p.evaluate(async () => { const o = {}; for (const b of document.querySelectorAll('#ar-team [data-sk-cat]')) { const c = b.dataset.skCat; document.querySelector(`#ar-team [data-sk-cat=${c}]`).click(); await new Promise(r => setTimeout(r, 60)); o[c] = [...document.querySelectorAll('#sk-list [data-sk-w]')].map(x => x.dataset.skW); } return o; });
const total = Object.values(cats).flat(); check('categories list the knife and every gun once (27 guns)', cats.knives.join() === 'knife' && total.length === 28 && new Set(total).size === 28 && cats.rifle.includes('ak') && cats.pistol.includes('usps'), JSON.stringify(cats));
// The AK: CS2's first finish when the host has them, else the Fade; equipped (warmup: at once).
const pick = await p.evaluate(async () => { document.querySelector('#ar-team [data-sk-cat=rifle]').click(); await new Promise(r => setTimeout(r, 50)); document.querySelector('#sk-list [data-sk-w=ak]').click(); await new Promise(r => setTimeout(r, 50));
  const b = [...document.querySelectorAll('#sk-grid [data-sk-finish]')].find(x => x.dataset.skFinish !== 'none' && (x.dataset.skFinish.startsWith('cs2:') || !document.querySelector('[data-sk-src=cs2]'))) || document.querySelector('#sk-grid [data-sk-finish=fade]'); b.click(); await new Promise(r => setTimeout(r, 50));
  const fin = b.dataset.skFinish; document.querySelector('#sk-detail [data-sk-apply]').click(); return fin; });
await p.waitForFunction(f => __infra.lab.world.operations.game.arena?.skins?.ann?.ak?.finish === f, pick, { timeout: 8000 }).catch(() => {});
const got = await p.evaluate(() => ({ s: __infra.lab.world.operations.game.arena?.skins?.ann?.ak, tick: !!document.querySelector('#sk-list [data-sk-w=ak] .ok'), cur: document.getElementById('sk-cur')?.textContent }));
check('Equip: the room keeps the AK\'s finish; the list ticks it, the detail names it', got.s?.finish === pick && got.tick && /Equipped: AK-47/.test(got.cur || ''), pick + ' ' + JSON.stringify(got));
const z0 = await p.evaluate(() => [__infra.camera.position.x, __infra.camera.position.z].map(v => +v.toFixed(3)).join());
await p.focus('#sk-q'); await p.keyboard.type('wwwwa'); await p.waitForTimeout(300); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace');
const q = await p.evaluate(() => ({ focus: document.activeElement?.id, val: document.getElementById('sk-q')?.value, pos: [__infra.camera.position.x, __infra.camera.position.z].map(v => +v.toFixed(3)).join() }));
check('search keeps its focus while it filters; typing in it never moves the player', q.focus === 'sk-q' && q.val === '' && q.pos === z0, JSON.stringify(q) + ' was ' + z0);
await p.setViewportSize({ width: 1920, height: 1080 }); await p.waitForTimeout(300);
const f2 = await fit(); check('1920×1080: the panel inside the window, no sideways scroll', f2.inside && !f2.hscroll && !f2.panelH && f2.thumbs > 0, JSON.stringify(f2));
await p.screenshot({ path: path.join(out, 'picker-1920.jpg'), type: 'jpeg', quality: 80 });
await p.evaluate(() => __infra.lab.arenaUI.teamMenu(false)); await p.waitForTimeout(200);
check('closed: the menu hidden', await p.evaluate(() => !__infra.lab.arenaUI.teamOpen && document.getElementById('ar-team').hidden));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await bw.close(); server.kill(); process.exit(ok === n ? 0 : 1);
