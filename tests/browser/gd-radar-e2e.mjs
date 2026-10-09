// Global Defensive radar + HUD layout (solo Defuse on Dune with 4 bots), at 1920×1080 and 1280×720:
// the radar shows the map, bomb sites and team mates; enemies only when someone on your side can see them (never
// through walls); N switches rotating / fixed; radar, health, ammo, money, kill feed and top bar don't overlap.
//   node tests/browser/gd-radar-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'RAD001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'rd-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 240) : '')); }; const errs = [];
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); p.on('pageerror', e => errs.push(e.message));
for (const [w, h] of [[1920, 1080], [1280, 720]]) {
  if (w !== 1920) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(800); } else {
  if (w === 1920) await p.addInitScript(() => { localStorage.setItem('infra-name', 'Rada'); localStorage.setItem('infra-face-name', 'Rada'); localStorage.setItem('infra-face', 'smile'); localStorage.removeItem('gd-radar-mode'); });
  if (w === 1920) { await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000); }
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dune'); await p.selectOption('#ss-ar-bots', '4'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.round, null, { timeout: 40000 });
  await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(1500); }
  check(w + 'p: the radar is shown', await p.evaluate(() => !document.getElementById('gd-radar').hidden));
  // Overlaps: radar, HP, ammo, money, top bar, kill feed — no two of them share pixels.
  const rects = await p.evaluate(() => Object.fromEntries(['gd-radar', 'gd-hp', 'gd-wp', 'ar-money', 'ar-top', 'ar-feed', 'ar-alive'].map(id => { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === 'none') return [id, null]; const r = e.getBoundingClientRect(); return [id, r.width && r.height ? [r.left, r.top, r.right, r.bottom] : null]; })));
  const hits = []; const ids = Object.keys(rects).filter(k => rects[k]); for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = rects[ids[i]], c = rects[ids[j]]; if (a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]) hits.push(ids[i] + '×' + ids[j]); }
  check(w + 'p: radar, health, ammo, money, top bar and feed do not overlap', hits.length === 0, hits.join(', ') + ' ' + JSON.stringify(rects));
  // Enemies: only those someone on our side can see.
  const r = await p.evaluate(async () => { const { clearView } = await import('./arena-nades.js'), { mapBoxes, ARENA_MAPS } = await import('./arena-maps.js'), { ARENA } = await import('./facility-layout.js');
    const G = __infra.lab.world.operations.game, d = G.combat.d, me = 'rada', boxes = mapBoxes(ARENA_MAPS[G.arena.map], ARENA.cx, ARENA.cz), cam = __infra.camera.position;
    const mine = (__infra.lab.lan.players || []).filter(x => d.teams[x.name.toLowerCase()] === d.teams[me] && x.name.toLowerCase() !== me).map(x => x.pose).concat([{ x: cam.x, z: cam.z }]);
    const foes = (__infra.lab.lan.players || []).filter(x => d.teams[x.name.toLowerCase()] && d.teams[x.name.toLowerCase()] !== d.teams[me]);
    await new Promise(r => setTimeout(r, 300)); const shown = __infra.lab.radar.revealed;
    const visible = foes.filter(f => mine.some(e => Math.hypot(e.x - f.pose.x, e.z - f.pose.z) < 220 && clearView(G, boxes, e.x, e.z, f.pose.x, f.pose.z))).map(f => f.name.toLowerCase());
    return { shown, visible, foes: foes.map(f => [f.name, Math.round(f.pose.x), Math.round(f.pose.z)]), mine: mine.map(e => [Math.round(e.x), Math.round(e.z)]), why: __infra.lab.radar.why }; });
  check(w + 'p: enemies on the radar only when seen (never through walls)', r.shown.every(k => r.visible.includes(k)), JSON.stringify(r));
  const m0 = await p.evaluate(() => __infra.lab.radar.mode); await p.keyboard.press('KeyN'); await p.waitForTimeout(200); const m1 = await p.evaluate(() => __infra.lab.radar.mode);
  check(w + 'p: N switches rotating ⇄ fixed', m0 === 'rotate' && m1 === 'fixed', m0 + ' → ' + m1);
  await p.screenshot({ path: path.join(out, 'hud-' + w + '.png') }); await p.keyboard.press('KeyN');
}
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
