// v52 (package N) in a real browser, on the CS2 maps converted on this computer (user-maps + user-assets): another game
// mode's walls and props are out of the look — Nuke's 2v2 silo doors on both sides of Ramp and its roll-up door across
// Outside → Secret (players saw doors there and thought the way shut), the duct over its vent, Overpass's 2v2 walls,
// Inferno's barricades — while the real doors stay; and at a round start every player stands in their own team's
// spawn (the big map, Tab, as a Terrorist and as a Counter-Terrorist) on Nuke, Mirage and Inferno. Pictures of each
// spot (before: run with BT_REPO = the v51 tree — the look counts then show what was drawn there) and of the big maps.
//   node tests/browser/gd-map-blockers-e2e.mjs <repo-root> <out-dir> [maps…] [--no-radar]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-map-blockers'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const noRadar = rest.includes('--no-radar'), only = rest.filter(a => !a.startsWith('--'));
if (!existsSync(path.join(root, 'user-maps', 'nuke.bsp')) || !existsSync(path.join(root, 'user-assets', 'maps', 'nuke.glb'))) { console.log('SKIP: no converted Nuke (map file and look) on this computer'); process.exit(0); }
// Spots (Hammer units): where the camera stands (feet), what it looks at, and the scenery there (box, material).
const SPOTS = {
  nuke: [
    { n: 'ramp-west-from-control', cam: [190, 80, -416], at: [450, 80, -360], box: [288, 4, -416, 296, 162, -281], mat: 'metal_door_001' },
    { n: 'ramp-west-from-ramp', cam: [470, -90, -416], at: [292, 83, -350], box: [288, 4, -416, 296, 162, -281], mat: 'metal_door_001' },
    { n: 'ramp-east-from-admin', cam: [1110, 80, -416], at: [850, 80, -360], box: [984, 4, -416, 992, 162, -281], mat: 'metal_door_001' },
    { n: 'ramp-east-from-ramp', cam: [820, -90, -416], at: [988, 83, -350], box: [984, 4, -416, 992, 162, -281], mat: 'metal_door_001' },
    { n: 'secret-from-outside', allow: 20, cam: [1110, -2367, -416], at: [1400, -2367, -370], box: [1239, -2464, -416, 1253, -2271, -288], mat: 'rollup_door_001' },
    { n: 'outside-from-secret', allow: 20, cam: [1390, -2367, -416], at: [1100, -2367, -370], box: [1239, -2464, -416, 1253, -2271, -288], mat: 'rollup_door_001' },
    { n: 'b-doors-real', cam: [900, -980, -768], at: [1100, -980, -720], box: [985, -1050, -768, 1110, -910, -650], mat: 'metal_door_001', real: true },
  ],
  overpass: [
    { n: 'wall-62151', cam: [-1944, -1080, 244], at: [-1944, -1300, 300], box: [-2034, -1212, 244, -1854, -1203, 372], mat: 'concrete_12_blend_3' },
    { n: 'wall-62156', cam: [-1788, 1000, 132], at: [-1788, 780, 200], box: [-1850, 873, 132, -1726, 882, 296], mat: 'concrete_12_blend_3' },
    { n: 'wall-62163', cam: [-2080, 945, 260], at: [-2300, 945, 320], box: [-2250, 899, 260, -2170, 996, 420], mat: 'concrete_12_blend_3' },
    { n: 'wall-62164', cam: [-1390, -2380, 338], at: [-1600, -2380, 390], box: [-1500, -2458, 338, -1494, -2302, 452], mat: 'concrete_4' },
  ],
  inferno: [
    { n: 'barricade-656', cam: [540, -60, 71], at: [760, -100, 100], box: [620, -261, 70, 690, 12, 135], mat: 'italy_railingkit_metal_02' },
    { n: 'barricade-440', cam: [290, 565, 82], at: [520, 565, 110], box: [410, 455, 80, 462, 675, 141], mat: 'italy_railingkit_metal_02' },
    { n: 'barricade-1812', cam: [1812, 1430, 157], at: [1812, 1620, 190], box: [1743, 1505, 155, 1884, 1551, 216], mat: 'italy_railingkit_metal_02' },
    { n: 'door-2338', allow: 2, cam: [2338, 1460, 160], at: [2338, 1650, 215], box: [2303, 1549, 158, 2373, 1559, 272], mat: 'door_simple_56_112_01_blend_dirt' },
  ],
};
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDN052', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdn-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const errs = [], report = {};
async function play(map, kind = 'practice', bots = '0') { const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', kind); await p.selectOption('#ss-ar-map', map); await p.selectOption('#ss-ar-bots', bots); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); }); await p.waitForTimeout(2500); return p; }
// The look's triangles of material `mat` (any copy: .001, __nolm) with their middle in Hammer box `box` and in the open
// (in no collision box, a unit's leeway: the doorway, not the wall or floor round it — those may share the material).
const countIn = (p, map, box, mat, real) => p.evaluate(async ({ map, box, mat, real }) => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), H = ARENA_MAPS[map].hammer; let look = null, c = 0;
  const solid = __infra.lab.arenaScene.boxes.filter(b => b.mover == null && !b.off), e = H.U, inSolid = (x, y, z) => solid.some(b => x >= b.minX - e && x <= b.maxX + e && z >= b.minZ - e && z <= b.maxZ + e && y >= b.y0 - e && y <= b.y1 + e);
  __infra.scene.traverse(o => { if (o.userData?.cs2Render) look = o; }); if (!look) return -1; look.updateMatrixWorld(true);
  const base = s => String(s || '').replace(/__nolm$/, '').replace(/\.\d+$/, ''), v = [0, 0, 0];
  look.traverse(o => { if (!o.isMesh || base(o.material?.name) !== mat || !o.geometry.index) return; const P = o.geometry.attributes.position, I = o.geometry.index.array, E = o.matrixWorld.elements, s = o.geometry.drawRange, end = Math.min(I.length, s.start + s.count);
    for (let t = s.start; t + 2 < end; t += 3) { v[0] = v[1] = v[2] = 0; for (let k = 0; k < 3; k++) { const q = I[t + k]; v[0] += P.getX(q) / 3; v[1] += P.getY(q) / 3; v[2] += P.getZ(q) / 3; }
      const gx = E[0] * v[0] + E[4] * v[1] + E[8] * v[2] + E[12] - ARENA.cx, gy = E[1] * v[0] + E[5] * v[1] + E[9] * v[2] + E[13], gz = E[2] * v[0] + E[6] * v[1] + E[10] * v[2] + E[14] - ARENA.cz;
      const hx = (gx + H.W / 2) / H.U + H.x0, hy = H.y1 - (gz + H.D / 2) / H.U, hz = gy / H.U + H.zLow; if (hx >= box[0] && hx <= box[3] && hy >= box[1] && hy <= box[4] && hz >= box[2] && hz <= box[5] && (real || !inSolid(gx + ARENA.cx, gy, gz + ARENA.cz))) c++; } });
  return c; }, { map, box, mat, real: !!real });
try {
  for (const map of Object.keys(SPOTS)) { if (only.length && !only.includes(map)) continue; if (!existsSync(path.join(root, 'user-maps', map + '.bsp'))) continue;
    const p = await play(map), info = await p.evaluate(async map => { const { ARENA_MAPS } = await import('/arena-maps.js'); let look = null; __infra.scene.traverse(o => { if (o.userData?.cs2Render) look = o; }); return { listed: ARENA_MAPS[map].modeOff?.length ?? null, cut: look?.userData.modeCut ?? null, look: !!look }; }, map);
    report[map] = { ...info, spots: {} }; console.log(map + ': ' + JSON.stringify(info));
    for (const s of SPOTS[map]) {
      await p.evaluate(async ({ map, s }) => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), M = ARENA_MAPS[map], H = M.hammer, g = ([hx, hy, hz]) => [(hx - H.x0) * H.U - H.W / 2, (hz - H.zLow) * H.U, (H.y1 - hy) * H.U - H.D / 2];
        const [cx, cy, cz] = g(s.cam), [tx, ty, tz] = g(s.at), f = M.nav.floorAt(cx, cz, cy + 1), eye = (Number.isFinite(f) ? f : cy) + 9.7; __infra.lab.look(ARENA.cx + cx, ARENA.cz + cz, ARENA.cx + tx, ty, ARENA.cz + tz, eye); }, { map, s });
      await p.waitForTimeout(900); await p.screenshot({ path: path.join(out, `${map}-${s.n}.jpg`), type: 'jpeg', quality: 80 });
      const c = await countIn(p, map, s.box, s.mat, s.real); report[map].spots[s.n] = c; console.log(`  ${s.n}: ${c} triangles of ${s.mat} there`);
      if (s.real) check(`${map} ${s.n}: the real doors are still drawn`, c > 0, c); else check(`${map} ${s.n}: another mode's ${s.mat} is out of the look there ${s.allow ? ' (a sliver at most: its rail on the floor)' : ''}`, c <= (s.allow || 0), c); }   // (v51: 2–306 there)
    check(`${map}: its mode-only scenery is listed and cut from the look`, info.listed > 0 && info.cut > 0, JSON.stringify(info));
    await p.close(); }
  // Round start: everyone in their own spawn (Tab's big map, as a T and as a CT).
  if (!noRadar) for (const map of ['nuke', 'mirage', 'inferno']) { if (only.length && !only.includes(map)) continue; if (!existsSync(path.join(root, 'user-maps', map + '.bsp'))) continue;
    const p = await play(map, 'defuse', '9'); await p.evaluate(() => __infra.lab.enter?.());
    for (const side of ['t', 'ct']) {
      const mine = await p.evaluate(() => __infra.lab.world.operations.game.combat?.d?.teams?.tester); if (mine !== side) { await p.evaluate(t => __infra.lab.lan.act({ type: 'arena', action: { type: 'team', team: t } }), side); await p.waitForTimeout(600); }
      await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'restart-round' } })); await p.waitForTimeout(3500);
      const where = await p.evaluate(async map => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), M = ARENA_MAPS[map], H = M.hammer, G = __infra.lab.world.operations.game, d = G.combat.d;
        const at = [...G.arena.bots.map(x => [x.name.toLowerCase(), x.x, x.z]), ['tester', __infra.camera.position.x, __infra.camera.position.z]];
        return at.map(([k, x, z]) => ({ k, team: d.teams[k], h: [Math.round((x - ARENA.cx + H.W / 2) / H.U + H.x0), Math.round(H.y1 - (z - ARENA.cz + H.D / 2) / H.U)] })); }, map);
      const T = where.filter(w => w.team === 't'), C = where.filter(w => w.team === 'ct'), spread = L => { let m = 0; for (const a of L) for (const q of L) m = Math.max(m, Math.hypot(a.h[0] - q.h[0], a.h[1] - q.h[1])); return m; };
      check(`${map} (${side}): a round start puts every T together and every CT together (5 v 5, each team within 1 200 units)`, T.length === 5 && C.length === 5 && spread(T) < 1200 && spread(C) < 1200, `T ${T.length} spread ${spread(T).toFixed(0)} · CT ${C.length} spread ${spread(C).toFixed(0)}`);
      (report.spawns ??= {})[map + '-' + side] = where;
      await p.keyboard.down('Tab'); await p.waitForTimeout(700); await p.screenshot({ path: path.join(out, `radar-${map}-${side}.jpg`), type: 'jpeg', quality: 82 }); await p.keyboard.up('Tab'); }
    await p.close(); }
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { check('no crash', false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log((ok === n ? 'PASS' : 'FAIL') + ': mode blockers out of the look, spawns in place · ' + ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
