// Nuke's and Cache's doors and glass in the real game (practice, no bots, the CS2 map files) — pictures and the look's counts:
// each real door's doorway seen from both sides (B's double doors to Secret, Decon's, the Hut's) and Ramp's two silo
// doorways (Wingman's doors taken out of the look); then B's glass before and after a shot — a floor pane (a breakable),
// a floor panel the importer left as world (wall right behind it) and B's Observation window (no glass collision) — a
// shot as weapons.js makes it (bulletPath from the eye; the doors and breakables it crossed go to the room as 'gd-break').
//   node tests/browser/gd-doors-glass-shots.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-doors-glass-shots')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
if (!existsSync(path.join(root, 'user-maps', 'nuke.bsp')) || !existsSync(path.join(root, 'user-maps', 'cache.bsp'))) { console.log('SKIP: no Nuke / Cache map file'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDDG01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gddg-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const errs = [], report = { views: [], shots: [] };
// Views (Hammer units): eye [x, y, z], target [x, y, z]
const VIEWS = [
  ['b-doors-from-B', [985, -1000, -704], [1047, -975, -712]], ['b-doors-hinge-edge', [1010, -935, -704], [1047, -918, -700]], ['b-doors-from-Secret', [1110, -975, -704], [1047, -985, -712]],
  ['decon-door-east', [360, -1318, -704], [305, -1318, -712]], ['decon-door-west', [250, -1318, -704], [305, -1318, -712]], ['decon-door-hinge-edge', [345, -1365, -704], [305, -1350, -700]],
  ['hut-door-east', [312, -1282, -352], [257, -1282, -360]], ['hut-door-west', [200, -1282, -352], [257, -1282, -360]], ['hut-door-hinge-edge', [300, -1325, -352], [257, -1310, -350]],
  ['ramp-silo-west', [350, 60, -352], [291, 4, -350]], ['ramp-silo-east', [930, 60, -352], [988, 4, -350]],
];
// Glass shots: eye, aim point, what it is
const SHOTS = [
  ['b-floor-pane', [430, -1000, -704], [481, -925, -772], 'B floor pane (a breakable pane, 451..511 × -956..-894)'],
  ['b-floor-panel-backed', [560, -800, -704], [592, -754, -772], 'B floor panel 579..606 × -764..-744 (importer: "backed", left as world)'],
  ['b-floor-west-backed', [300, -800, -704], [225, -722, -772], 'B floor panel 195..255 × -748..-696 (importer: "backed")'],
  ['b-observation-window', [900, -465, -704], [1038, -465, -560], 'B Observation window x1038 y-511..-418 (no glass collision)'],
  ['nuke-real-func-breakable', [1380, -391, -330], [1415, -391, -341], 'func_breakable window x1414 y-391 (CS2 entity glass)'],
];
async function play(MAP, VIEWS, SHOTS) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(2500);
  const info = await p.evaluate(async () => { let look = null; __infra.scene.traverse(o => { if (o.userData?.cs2Render) look = o; }); return { panes: look?.userData.panes, duplicates: look?.userData.duplicates, dupBy: look?.userData.dupBy, modeCut: look?.userData.modeCut, doorTurns: look?.userData.doorTurns || [], glass: (() => { let n = 0, t = 0; look?.traverse(o => { if (o.isMesh && o.userData.glass) { n++; if (o.material.transparent && o.material.opacity < 1) t++; } }); return [n, t]; })(), panesRegistered: __infra.lab.arenaScene?.boxes?.movers?.filter(b => b.role === 'shut' && __infra.lab.arenaScene.breakableOf(b) != null).length }; });
  (report.look ??= {})[MAP] = info; console.log('look', JSON.stringify(info));
  const g = h => p.evaluate(async h => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), Hm = ARENA_MAPS[h[3]].hammer; return [ARENA.cx + (h[0] - Hm.x0) * Hm.U - Hm.W / 2, (h[2] - Hm.zLow) * Hm.U, ARENA.cz + (Hm.y1 - h[1]) * Hm.U - Hm.D / 2]; }, [...h, MAP]);
  const aim = async (eye, tgt) => { const e = await g(eye), t = await g(tgt); await p.evaluate(({ e, t }) => { __infra.lab.look(e[0], e[2], t[0], t[1], t[2], e[1]); __infra.camera.lookAt(t[0], t[1], t[2]); }, { e, t }); await p.waitForTimeout(150);
    await p.evaluate(({ e, t }) => { __infra.camera.position.set(e[0], e[1], e[2]); __infra.camera.lookAt(t[0], t[1], t[2]); }, { e, t }); return { e, t }; };
  for (const [name, eye, tgt] of VIEWS) { await aim(eye, tgt); await p.waitForTimeout(600); await aim(eye, tgt); await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(out, MAP + '-door-' + name + '.jpg'), type: 'jpeg', quality: 80 }); report.views.push({ name, eye, tgt }); console.log('view', name); }
  for (const [name, eye, tgt, what] of SHOTS) { const { e, t } = await aim(eye, tgt); await p.waitForTimeout(600); await aim(eye, tgt); await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(out, MAP + '-glass-' + name + '-before.jpg'), type: 'jpeg', quality: 80 });
    const r = await p.evaluate(async ({ e, t }) => { const { bulletPath, BulletPath } = await import('/arena-maps.js'); const S = __infra.lab.arenaScene, bx = S.boxes; let dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2]; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
      const P = bulletPath(bx, e[0], e[1], e[2], dx, dy, dz, 2000, 0, new BulletPath()), wallT = Math.min(P.stop, dy < -1e-6 ? -e[1] / dy : Infinity), end = Math.min(wallT, 400), broke = new Set();
      for (const c of P.crossed) if (c.t0 < end && c.b?.mover != null) broke.add(c.b); if (P.stopBox?.mover != null && wallT === P.stop) broke.add(P.stopBox); if (P.embedded && wallT === P.stop) broke.add(P.embedded);
      const ids = [...broke].map(x => ({ mover: x.mover, role: x.role, mat: x.mat, breakableOf: S.breakableOf(x) }));
      if (broke.size) dispatchEvent(new CustomEvent('gd-break', { detail: { boxes: [...broke], dmg: 30 } }));
      return { dist: +L.toFixed(2), stop: +P.stop.toFixed(2), stopMat: P.stopBox?.mat || null, stopMover: P.stopBox?.mover ?? null, crossed: P.crossed.map(c => ({ t0: +c.t0.toFixed(2), mat: c.mat, mover: c.b?.mover ?? null })), sent: ids }; }, { e, t });
    await p.waitForTimeout(1200);
    const st = await p.evaluate(ids => { const ms = __infra.lab.world.operations.game.combat?.mapState; return ids.map(i => ({ id: i, broken: !!ms?.broken?.[i] })); }, r.sent.map(x => x.mover));
    await p.screenshot({ path: path.join(out, MAP + '-glass-' + name + '-after.jpg'), type: 'jpeg', quality: 80 });
    const rec = { map: MAP, name, what, ...r, state: st, broke: st.some(s => s.broken) }; report.shots.push(rec); console.log('shot', name, JSON.stringify(rec)); }
  await p.close(); }
const CACHE_VIEWS = [
  ['door-north', [232, 2000, 1752], [232, 2046, 1744]], ['door-south', [232, 2100, 1752], [232, 2046, 1744]], ['door-hinge-edge', [190, 2010, 1752], [204, 2046, 1744]],
  ['longa-east-doorway', [936, 2010, 1766], [936, 2058, 1770]], ['longa-east-doorway-back', [936, 2110, 1766], [936, 2058, 1770]], ['longa-west-doorway', [460, 2150, 1764], [514, 2150, 1768]],
];
const CACHE_SHOTS = [['longa-east-glass-strip', [900, 2010, 1766], [900, 2058, 1858], 'Long A east doorway: the glass strip over the door (pane 517, its glass now its collision)']];
try { await play('nuke', VIEWS, SHOTS); await play('cache', CACHE_VIEWS, CACHE_SHOTS);
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log('page errors:', errs.length, errs.slice(0, 5).join(' | '));
} finally { await b.close(); server.kill(); }
