// Nuke's B site walkable in the real game (practice, no bots, the CS2 map file): stood on spots across B and on its ways
// in (Ramp's foot, Secret, the vents), the body walks each way (W, A, S, D for 0.7 s each) — how far it got, whether it
// stayed on its floor, and a picture of each spot.
//   node tests/browser/gd-walk-nuke-b.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-walk-nuke-b')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
if (!existsSync(path.join(root, 'user-maps', 'nuke.bsp'))) { console.log('SKIP: no Nuke map file'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDWB01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdwb-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const errs = [], report = { spots: [] };
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  const kind = process.env.WB_KIND || 'practice';
  await p.selectOption('#ss-ar-kind', kind); await p.selectOption('#ss-ar-map', 'nuke'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(2500);
  // Spots: B's goal and B cells spread over the site, the foot of Ramp, Secret's and the vents' lowest floors near B.
  const spots = await p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), { MAXF } = await import('/cs-columns.js'), M = ARENA_MAPS.nuke, C = M.columns, G = C.G;
    const X = c => -C.W / 2 + (c + .5) * C.cell, Z = r => -C.D / 2 + (r + .5) * C.cell, Y = h => (h - C.zLow) * C.U, out = [], g = M.siteGoals.B; out.push({ n: 'B goal', x: g[0], z: g[1], y: g[2] });
    for (const [place, k0, maxY] of [['BombsiteB', 9, 6], ['Ramp', 3, 12], ['Secret', 3, 12], ['Vents', 2, 12]]) { const L = [];
      for (let i = 0; i < G.n.length; i++) for (let k = 0; k < G.n[i]; k++) { const v = i * MAXF + k; if (G.places[G.place[v]] !== place || G.ceil[v] - G.z[v] < 80 || Y(G.z[v]) > maxY) continue; L.push({ x: X(i % G.cols), z: Z((i / G.cols) | 0), y: Y(G.z[v]) }); }
      L.sort((a, b) => a.x - b.x || a.z - b.z); for (let j = 0; j < k0 && L.length; j++) { const q = L[Math.floor((j + .5) * L.length / k0)]; out.push({ n: place + ' ' + j, ...q }); } }
    return out; });
  const { cx, cz } = await p.evaluate(async () => { const { ARENA } = await import('/facility-layout.js'); return { cx: ARENA.cx, cz: ARENA.cz }; });
  for (const s of spots) {
    await p.evaluate(({ s, cx, cz }) => __infra.lab.look(cx + s.x, cz + s.z, cx + s.x + 10, s.y + 9.7, cz + s.z, s.y + 9.7), { s, cx, cz }); await p.waitForTimeout(700);
    const r = { ...s, walk: {} };
    r.start = await p.evaluate(() => { const a = __infra.lab.move.am; return a ? { x: a.x, z: a.z, y: a.y, g: a.onGround } : null; });
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { const a0 = await p.evaluate(() => { const a = __infra.lab.move.am; return a ? [a.x, a.z, a.y] : null; });
      await p.keyboard.down(key); await p.waitForTimeout(700); await p.keyboard.up(key); await p.waitForTimeout(250);
      const a1 = await p.evaluate(() => { const a = __infra.lab.move.am, d = __infra.lab.world.operations.game.combat?.d; return a ? [a.x, a.z, a.y, a.onGround, a.stamina, d?.round?.phase, !!d?.paused] : null; });
      r.walk[key] = a0 && a1 ? { d: +Math.hypot(a1[0] - a0[0], a1[1] - a0[1]).toFixed(2), dy: +(a1[2] - a0[2]).toFixed(2), g: a1[3], st: a1[4], phase: a1[5], paused: a1[6] } : null; }
    await p.screenshot({ path: path.join(out, s.n.replace(/\s+/g, '-') + '.jpg'), type: 'jpeg', quality: 70 });
    report.spots.push(r); console.log(s.n, JSON.stringify({ x: +s.x.toFixed(1), z: +s.z.toFixed(1), y: +s.y.toFixed(2), start: r.start, walk: r.walk })); }
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log('page errors:', errs.length, errs.slice(0, 5).join(' | '));
} finally { await b.close(); server.kill(); }
