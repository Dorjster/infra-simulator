// Global Defensive smoke benchmark (the user's MacBook: Retina 1470×956 at 2×, the High preset): solo deathmatch on a
// CS2 map file when this computer has one (Dust II, else Mirage; without user-maps the built-in map), 1, 3 and 6
// overlapping smokes dropped along an open lane, the camera outside them, at the first one's edge (looking along and
// across it) and inside it. Per view: frame time (requestAnimationFrame deltas: p50 / p95 / p99, frames over 25 / 50 ms),
// the GPU's cost of a frame (a forced-sync 1-pixel readPixels after the game's render: submit + finish), draw calls,
// the CPU of the smoke's own per-frame work (nadeView.update and, when present, the smoke pass), and the pixel ratio (the
// dynamic resolution never stepping down). The pixel ratio is put back to the preset's ceiling before every view.
// Writes <out>/smoke-stress-<label>.json and screenshots (shots=1).
//   node tests/browser/gd-smoke-stress.mjs <repo> <out> [label] [map|auto] [headless 0|1] [secs per view] [shots 0|1]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out, label = 'run', mapArg = 'auto', headless = '0', secsArg = '2', shotsArg = '1'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const SECS = +secsArg || 2, SHOTS = shotsArg !== '0';
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SMKBN1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'sm-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: headless === '1', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const p = await b.newPage({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2 }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Smoker'); localStorage.setItem('infra-face-name', 'Smoker'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(500);
const files = existsSync(path.join(root, 'user-maps'));   // (CS2 map files are offered for defuse and practice: practice — no rounds, no freeze time)
await p.selectOption('#ss-ar-kind', files ? 'practice' : 'dm'); await p.waitForTimeout(300);
const options = await p.evaluate(() => [...document.querySelectorAll('#ss-ar-map option')].map(o => o.value));
const want = mapArg !== 'auto' ? [mapArg] : files ? ['dust2', 'mirage'] : []; const map = want.find(m => options.includes(m)) || options[0];
await p.selectOption('#ss-ar-map', map); await p.selectOption('#ss-ar-bots', '0'); console.log('practice bots', await p.evaluate(() => { const s = document.getElementById('ss-pr-bots'); if (!s) return null; const o = [...s.options].map(o => o.value), z = o.find(v => /^(0|none|off)$/i.test(v)); if (z) s.value = z; return o.join(',') + ' → ' + s.value; }));
await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 }); await p.waitForTimeout(1500);
await p.keyboard.press('Escape'); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); });
const info = await p.evaluate(() => ({ map: __infra.lab.world.operations.game.arena?.map, file: !!__infra.lab.arenaScene?.boxes?.nadeMesh, ratio: __infra.renderer.getPixelRatio(), post: __infra.gfx.post, size: [innerWidth, innerHeight, devicePixelRatio] }));
console.log('map', map, JSON.stringify(info));
// An open lane (the widest clear line of sight, as gd-nades-e2e): the smokes along it, the camera at its start.
// (a CS2 map file: its own floors and sight lines — nav.floorAt / nav.sight, as the bots use them — on the floor you
// spawned on; the built-in maps: their boxes)
const lane = await p.evaluate(async () => { const A = await import('./arena-maps.js'), F = await import('./facility-layout.js'); const S = __infra.lab.arenaScene, B = S.boxes, bd = S.bounds, nav = A.ARENA_MAPS[__infra.lab.world.operations.game.arena.map]?.nav, cx = F.ARENA.cx, cz = F.ARENA.cz;
  const f0 = __infra.camera.position.y - 9.7, floor = (x, z, y) => { const f = nav?.floorAt ? nav.floorAt(x - cx, z - cz, y) : A.floorTop(B, x, z, y); return Number.isFinite(f) ? f : NaN; };
  const clear = (ax, ay, az, bx, by, bz) => nav?.sight ? nav.sight(ax - cx, ay, az - cz, bx - cx, by, bz - cz) : A.segmentClear(B, ax, ay, az, bx, by, bz);
  let best = null;
  for (let x = bd.minX + 10; x < bd.maxX - 10; x += 8) for (let z = bd.minZ + 10; z < bd.maxZ - 10; z += 8) { const f = floor(x, z, nav ? f0 + 6 : 99); if (!Number.isFinite(f) || (nav && Math.abs(f - f0) > 40)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let L = 0; while (L < 200 && clear(x, f + 4, z, x + dx * (L + 6), f + 4, z + dz * (L + 6)) && clear(x, f + 14, z, x + dx * (L + 6), f + 14, z + dz * (L + 6)) && (nav || S.clear(x + dx * (L + 6), z + dz * (L + 6))) && Math.abs(floor(x + dx * (L + 6), z + dz * (L + 6), f + 3) - f) < 1.5) L += 6;
    let W = 0; for (const s of [-1, 1]) { let w = 0; while (w < 30 && clear(x + dx * 80, f + 4, z + dz * 80, x + dx * 80 - dz * s * (w + 3), f + 4, z + dz * 80 + dx * s * (w + 3))) w += 3; W += Math.min(w, 24); }
    if (L >= 150 && (nav || S.clear(x, z)) && (!best || L + W * 2 > best.L + best.W * 2)) best = { x, z, f, dx, dz, L, W }; } }
  return best; });
console.log('lane', JSON.stringify(lane));
if (!lane) { console.log('FAIL no open lane'); await b.close(); process.exit(1); }
const at = (u, v) => ({ x: lane.x + lane.dx * u - lane.dz * v, z: lane.z + lane.dz * u + lane.dx * v });   // u along the lane, v across it
const side = Math.min(14, lane.W / 2);
const SPOTS = [[60, 0], [84, side], [84, -side], [108, 0], [70, -side * 1.6], [100, side * 1.6]];   // (CS2 smokes about 50 units across: each overlaps the next)
const act = a => p.evaluate(a => Promise.resolve(__infra.lab.lan.act({ type: 'arena', action: a })).catch(e => String(e)), a);
const smokes = () => p.evaluate(() => (__infra.lab.world.operations.game.combat?.nades || []).filter(n => n.kind === 'smoke').map(n => ({ id: n.id, phase: n.phase, x: n.x, y: n.y, z: n.z, firedAt: n.firedAt })));
async function drop(n) { for (let i = 0; i < n; i++) { const s = at(...SPOTS[i]); await act({ type: 'buy-nade', kind: 'smoke' }); await p.waitForTimeout(120); const r = await act({ type: 'throw', kind: 'smoke', x: s.x, y: lane.f + 12, z: s.z, dx: 0, dy: -1, dz: 0, strength: 'short' }); if (!/Threw/.test(JSON.stringify(r))) console.log('throw:', JSON.stringify(r)); await p.waitForTimeout(150); }
  for (let i = 0; i < 80; i++) { const s = await smokes(); if (s.filter(x => x.phase === 'smoke').length >= n) break; await p.waitForTimeout(100); }
  { const s = await smokes(); if (s.filter(x => x.phase === 'smoke').length < n) console.log('WARN only', JSON.stringify(s)); }
  await p.waitForTimeout(2100); }   // (fully spread: SMOKE.grow 1.8 s)
async function gone() { for (let i = 0; i < 260; i++) { if (!(await smokes()).length) return; await p.waitForTimeout(100); } }
// The measuring harness, in the page: rAF deltas, the forced-sync frame cost, draw calls, the smoke's CPU.
await p.evaluate(() => { const g = __infra.gfx, r = __infra.renderer, gl = r.getContext(), px = new Uint8Array(4), T = globalThis.__S = { on: false, cost: [], submit: [], calls: [], cpu: [], ratio: [], raf: [] };
  const f = g.render; g.render = function () { if (!T.on) return f.apply(this, arguments); r.info.autoReset = false; r.info.reset(); const t0 = performance.now(); f.apply(this, arguments); const t1 = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t2 = performance.now(); r.info.autoReset = true; T.submit.push(t1 - t0); T.cost.push(t2 - t0); T.calls.push(r.info.render.calls); T.ratio.push(r.getPixelRatio()); };
  const nv = __infra.lab.nadeView, u = nv.update; nv.update = function () { const t = performance.now(); try { return u.apply(this, arguments); } finally { if (T.on) T.cpu.push(performance.now() - t); } };
  let last = 0; const tick = t => { if (T.on && last) T.raf.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
const ceiling = await p.evaluate(() => __infra.renderer.getPixelRatio());
const q = (a, k) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * k))].toFixed(2); };
async function measure(name, pos, look, n) {
  await p.evaluate(({ pos, look, ceiling }) => { __infra.renderer.setPixelRatio(ceiling); __infra.lab.look(pos.x, pos.z, look.x, look.y, look.z, pos.y); }, { pos, look, ceiling }); await p.waitForTimeout(400);
  await p.evaluate(() => { const T = __S; T.cost = []; T.submit = []; T.calls = []; T.cpu = []; T.ratio = []; T.raf = []; T.on = true; }); await p.waitForTimeout(SECS * 1000);
  const T = await p.evaluate(() => { __S.on = false; return { ...__S, extra: globalThis.__infra.scene.userData.gdSmoke?.stats?.() || null }; });
  const res = { view: name, smokes: n, frames: T.raf.length, raf: { p50: q(T.raf, .5), p95: q(T.raf, .95), p99: q(T.raf, .99), max: q(T.raf, 1), over25: T.raf.filter(x => x > 25).length, over50: T.raf.filter(x => x > 50).length }, cost: { p50: q(T.cost, .5), p95: q(T.cost, .95), p99: q(T.cost, .99), max: q(T.cost, 1) }, submit: { p50: q(T.submit, .5), p95: q(T.submit, .95) }, calls: q(T.calls, .5), smokeCpu: { p50: q(T.cpu, .5), p95: q(T.cpu, .95), max: q(T.cpu, 1) }, ratio: { min: Math.min(...T.ratio), max: Math.max(...T.ratio) }, extra: T.extra };
  console.log(JSON.stringify(res)); if (SHOTS) { await p.screenshot({ path: path.join(out, `${label}-${n}-${name}.png`) }); } return res;
}
const results = []; const eye = lane.f + 9.7;
const views = n => { const c1 = at(...SPOTS[0]), far = at(130, 0), mid = at(84, 0), edge = at(SPOTS[0][0] - 20, 0), across = at(SPOTS[0][0] - 20, 40);
  return [['inside', { ...c1, y: eye }, { x: far.x, y: eye, z: far.z }], ['edge', { ...edge, y: eye }, { x: far.x, y: eye, z: far.z }], ['edge-across', { ...edge, y: eye }, { x: across.x, y: eye, z: across.z }], ['outside', { ...at(8, 0), y: eye }, { x: mid.x, y: eye, z: mid.z }]]; };   // (inside first: the views end before the first smoke starts thinning at 15 s)
for (const [name, pos, look] of views(0)) results.push(await measure(name, pos, look, 0));
// (every view with all n smokes at full density: thrown again when one would start thinning (15 s) before it ends)
const fresh = n => p.evaluate(({ n, need }) => { const G = __infra.lab.world.operations.game, now = __infra.lab.lan.hostNow?.() ?? G.combat?.clock ?? Date.now(), s = (G.combat?.nades || []).filter(x => x.kind === 'smoke' && x.phase === 'smoke'); return s.length >= n && s.every(x => 15000 - (now - x.firedAt) > need); }, { n, need: SECS * 1000 + 1500 });
for (const n of [1, 3, 6]) { let up = 0;
  for (const [name, pos, look] of views(n)) { if (!(await fresh(n))) { await gone(); await drop(n); up = (await smokes()).filter(x => x.phase === 'smoke').length; console.log(n, 'smokes up:', up); } results.push({ ...(await measure(name, pos, look, n)), up }); } }
const file = path.join(out, `smoke-stress-${label}.json`); writeFileSync(file, JSON.stringify({ label, map, info, lane, ceiling, results, errs }, null, 1));
console.log('wrote', file); console.log('errors', errs.length, errs.slice(0, 3).join(' | '));
await b.close(); server.kill(); process.exit(0);
