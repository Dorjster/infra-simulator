// Global Defensive · Nuke's B site walked in the real game (user report after v52: "on nuke B site is no walkable").
// A solo Defuse match on Nuke (the CS2 map file), you a Terrorist with the bomb: from your spawn the body walks the bots'
// routes T spawn → Lobby → Ramp → the walkway over B → off its end onto B → the bomb spot with W held (the real movement and the scene's own collision, doors and panes as
// they stand at the round's start; steered by turning only where the route bends), then across the site to four of
// its corners and back, and plants with key 5 + a held click. Fails when the walk stalls (2.5 s without getting nearer,
// a jump tried) or leaves B's floor, when B is not reached, or when the plant does not go in.
//   node tests/browser/gd-nuke-b-walk-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-nuke-b-walk')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
if (!existsSync(path.join(root, 'user-maps', 'nuke.bsp'))) { console.log('SKIP: no Nuke map file in user-maps'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDNB01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdnb-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const errs = [], report = { legs: [] };
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Darja'); localStorage.setItem('infra-face-name', 'Darja'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'nuke'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.darja, null, { timeout: 240000 });
  const st = () => p.evaluate(() => { const g = __infra.lab.world.operations.game, d = g.combat?.d; return { map: g.arena?.map, team: d?.teams?.darja, phase: d?.round?.phase, carrier: d?.bomb?.carrier, planted: d?.round?.planted || null }; });
  let s = await st(); check('Defuse on Nuke (map file), you a Terrorist', s.map === 'nuke' && s.team === 't', JSON.stringify(s));
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.arenaUI?.buy?.(false); });
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'live', null, { timeout: 60000 });
  await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(800);
  // Turning as a player turns: the mouse (pointer-lock mousemove, the game's own look handler), closed loop on the camera's
  // yaw. (lab.look() re-places the body — it rebuilds the movement from the camera, on the floor under the eye — which on
  // a thin ledge's edge, such as Ramp's foot over B, drops it into the wall under the ledge: a test artefact, not the game.)
  await p.evaluate(() => { const sleep = t => new Promise(r => setTimeout(r, t)); let gain = 1;
    globalThis.__turn = async (tx, tz) => { for (let it = 0; it < 6; it++) { const a = __infra.lab.move.am; if (!a) return 'none'; const f = new (__infra.camera.position.constructor)(); __infra.camera.getWorldDirection(f);
        const want = Math.atan2(tz - a.z, tx - a.x), have = Math.atan2(f.z, f.x); let e = want - have; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; if (Math.abs(e) < .03) return 'mouse';
        if (!document.pointerLockElement) { __infra.lab.look(a.x, a.z, tx, a.y + 9.7, tz, a.y + 9.7); return 'look'; }
        const mx = Math.max(-1200, Math.min(1200, e / (.0021 * gain))); document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: 0, bubbles: true })); await sleep(34);
        const g = new (__infra.camera.position.constructor)(); __infra.camera.getWorldDirection(g); let got = Math.atan2(g.z, g.x) - have; while (got > Math.PI) got -= 2 * Math.PI; while (got < -Math.PI) got += 2 * Math.PI;
        if (Math.abs(got) > 1e-3 && Math.sign(got) === Math.sign(e)) gain = Math.max(.05, Math.min(20, gain * Math.abs(got) / Math.abs(mx * .0021 * gain))); } return 'mouse'; }; });
  const info = await p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), { blocked, groundAt } = await import('/arena-move.js'), boxes = __infra.lab.arenaScene.boxes, M = ARENA_MAPS.nuke, G = M.columns.G, cw = M.columns.cell, Hm = M.hammer;
    const gxz = i => [-M.size[0] / 2 + (i % G.cols + .5) * cw, -M.size[1] / 2 + (((i / G.cols) | 0) + .5) * cw], gy = h => (h - Hm.zLow) * Hm.U;
    // A place's spot as tests/gd-map-entities.mjs takes it: a flat floor with standing room nearest its middle; a bomb site: the bots' goal.
    const placeAt = name => { const L = /^Bombsite([AB])$/.exec(name)?.[1]; if (L && M.siteGoals?.[L]?.length === 3) { const [x, z, y] = M.siteGoals[L]; return { x, z, y }; }
      const cells = []; for (let i = 0; i < G.n.length; i++) for (let k = 0; k < G.n[i]; k++) { const v = i * 3 + k; if (G.places[G.place[v]] !== name || G.ceil[v] - G.z[v] < 72) continue; const h = G.z[v];
        const flat = [1, -1, G.cols, -G.cols].every(d => { const j = i + d; if (j < 0 || j >= G.n.length) return false; for (let q = 0; q < G.n[j]; q++) if (Math.abs(G.z[j * 3 + q] - h) <= 18) return true; return false; }); if (flat) cells.push([i, h, G.n[i] === 1]); }
      if (!cells.length) return null; const pool = cells.some(c => c[2]) ? cells.filter(c => c[2]) : cells; let cx = 0, cz = 0; for (const [i] of pool) { const [x, z] = gxz(i); cx += x / pool.length; cz += z / pool.length; }
      const [i, h] = pool.reduce((a, c) => { const [x, z] = gxz(c[0]), [ax, az] = gxz(a[0]); return Math.hypot(x - cx, z - cz) < Math.hypot(ax - cx, az - cz) ? c : a; }); const [x, z] = gxz(i); return { x, z, y: gy(h) }; };
    // B's corners: of its floor cells (standing room — the body fits there in the scene's own boxes —, on B's level), the farthest out each way from the goal.
    const goal = M.siteGoals.B, bc = []; for (let i = 0; i < G.n.length; i++) for (let k = 0; k < G.n[i]; k++) { const v = i * 3 + k; if (G.places[G.place[v]] !== 'BombsiteB' || G.ceil[v] - G.z[v] < 80 || Math.abs(gy(G.z[v]) - goal[2]) > 1.5) continue; const [x, z] = gxz(i), y = gy(G.z[v]); if (blocked(boxes, null, ARENA.cx + x, ARENA.cz + z, groundAt(boxes, ARENA.cx + x, ARENA.cz + z, y + .5))) continue; bc.push({ x, z, y }); }
    const far = (fx, fz) => bc.reduce((a, c) => (c.x - goal[0]) * fx + (c.z - goal[1]) * fz > (a.x - goal[0]) * fx + (a.z - goal[1]) * fz ? c : a, bc[0]);
    const near = (x, z) => bc.reduce((a, c) => Math.hypot(c.x - x, c.z - z) < Math.hypot(a.x - x, a.z - z) ? c : a, bc[0]);
    const corners = bc.length ? [far(1, 1), far(1, -1), far(-1, -1), far(-1, 1)].map(c => near(goal[0] + (c.x - goal[0]) * .7, goal[1] + (c.z - goal[1]) * .7)) : [];
    const hg = (hx, hy, hz) => ({ x: (hx - Hm.x0) * Hm.U - M.size[0] / 2, z: (Hm.y1 - hy) * Hm.U - M.size[1] / 2, y: (hz - Hm.zLow) * Hm.U });   // (Hammer → game)
    return { cx: ARENA.cx, cz: ARENA.cz, lobby: placeAt('Lobby'), ramp: placeAt('Ramp'), wEnd: hg(366, -1262, -633), dropE: hg(460, -1262, -768), dropNE: hg(460, -1200, -768), wJump: hg(356, -1200, -633), jumpTo: hg(470, -1200, -768), goal: { x: goal[0], z: goal[1], y: goal[2] }, corners, bCells: bc.length, hammer: { x0: Hm.x0, y1: Hm.y1, W: Hm.W, D: Hm.D, U: Hm.U, zLow: Hm.zLow } }; });
  const H = (x, z, y) => [Math.round((x + info.hammer.W / 2) / info.hammer.U + info.hammer.x0), Math.round(info.hammer.y1 - (z + info.hammer.D / 2) / info.hammer.U), Math.round(y / info.hammer.U + info.hammer.zLow)];
  check('Nuke: Lobby, Ramp and B found (B: ' + info.bCells + ' floor cells)', info.lobby && info.ramp && info.bCells > 20, JSON.stringify({ lobby: info.lobby, ramp: info.ramp, goal: info.goal }));
  // One leg: a bot's route from where the body is to (x, z) on floor y, walked with W held, turned toward the route's next point
  // ahead on the route whenever it is more than 25° off (turning stops the body: as few turns as the route needs).
  const leg = async (name, to, shot) => {
    const plan = await p.evaluate(async ({ to }) => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), a = __infra.lab.move.am; const x = a.x - ARENA.cx, z = a.z - ARENA.cz;
      const r = ARENA_MAPS.nuke.nav.route(x, z, a.y, to.x, to.z, null, to.y); return r.length ? r.map(q => [q[0], q[1], q[2] ?? null]) : null; }, { to });
    if (!plan) { check(name + ': a route exists', false, 'no nav route'); return null; }
    await p.keyboard.down('KeyW');
    const res = await p.evaluate(async ({ plan, to, cx, cz }) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms)), am = () => __infra.lab.move.am, trace = [], stalls = []; let i = 0, best = Infinity, bestAt = performance.now(), jumped = false, turns = 0; const t0 = performance.now();
      // (look() re-captures the mouse, and the pointer-lock change lets go of every held key — the game's own rule: W is
      // pressed again after it, as a player's finger still is)
      let on = true; const pressW = () => { if (on) dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' })); };
      const how = {}, aim = async (x, z) => { const a = am(); if (!a) return; const h = await __turn(cx + x, cz + z); how[h] = (how[h] || 0) + 1; turns++; if (h === 'look') { setTimeout(pressW, 120); setTimeout(pressW, 400); } };
      const done = r => { on = false; dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' })); return r; };
      while (performance.now() - t0 < 45000) { await sleep(40); const a = am(); if (!a) continue; const x = a.x - cx, z = a.z - cz;
        while (i < plan.length - 1 && Math.hypot(plan[i][0] - x, plan[i][1] - z) < 2) i++;
        const tgt = plan[i], d = Math.hypot(to.x - x, to.z - z); trace.push([+x.toFixed(2), +z.toFixed(2), +a.y.toFixed(2)]);
        if (d < 2 && Math.abs(a.y - to.y) < 3) return done({ arrived: true, ms: performance.now() - t0, trace, stalls, turns, how, end: [x, z, a.y] });
        // facing: the camera's yaw vs the bearing to the target point
        const f = new (__infra.camera.position.constructor)(); __infra.camera.getWorldDirection(f); const want = Math.atan2(tgt[1] - z, tgt[0] - x), have = Math.atan2(f.z, f.x); let e = Math.abs(want - have) % (2 * Math.PI); if (e > Math.PI) e = 2 * Math.PI - e;
        if (e > 25 * Math.PI / 180) await aim(tgt[0], tgt[1]);
        let left = Math.hypot(tgt[0] - x, tgt[1] - z); for (let j = i; j < plan.length - 1; j++) left += Math.hypot(plan[j + 1][0] - plan[j][0], plan[j + 1][1] - plan[j][1]); /* (the way still to go along the route) */ if (left < best - .5) { best = left; bestAt = performance.now(); jumped = false; }
        else if (performance.now() - bestAt > 2500) { if (!jumped) { jumped = true; bestAt = performance.now(); stalls.push({ at: [x, z, a.y], i, of: plan.length }); dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); await sleep(60); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })); await aim(tgt[0], tgt[1]); }
          else return done({ arrived: false, stuck: true, ms: performance.now() - t0, trace, stalls, turns, how, end: [x, z, a.y], i, of: plan.length }); } }
      const a = am(); return done({ arrived: false, ms: 45000, trace, stalls, turns, end: a ? [a.x - cx, a.z - cz, a.y] : null }); }, { plan, to, cx: info.cx, cz: info.cz });
    await p.keyboard.up('KeyW'); await p.waitForTimeout(300);
    if (shot) await p.screenshot({ path: path.join(out, shot), type: 'jpeg', quality: 80 });
    report.legs.push({ name, to, route: plan.length, ...res, trace: undefined, endHammer: res.end && H(...res.end) }); report[name] = res.trace;
    return res; };
  let r = await leg('spawn→Lobby', info.lobby, '1-lobby.jpg'); check('Walked from the T spawn to Lobby', r?.arrived, r && JSON.stringify({ ms: Math.round(r.ms), turns: r.turns, stalls: r.stalls, end: r.end && H(...r.end) }));
  r = await leg('Lobby→Ramp', info.ramp, '2-ramp.jpg'); check('Walked from Lobby to Ramp', r?.arrived, r && JSON.stringify({ ms: Math.round(r.ms), turns: r.turns, stalls: r.stalls, end: r.end && H(...r.end) }));
  // Into B over the walkway: Ramp's foot runs on level onto the railed walkway 134 HU over B (Hammer x 324…392) down to
  // its end over the bomb corner (Hammer 366, −1262). Walking off the end east — W only, no jump — is tried first and
  // recorded: CS2's own player clips rail it (14 HU of gap for a 32 HU hull), so CS2 needs a jump there too. Then a jump
  // east over the rail (as a CS2 player does, from Hammer 356, −1200) lands on B.
  r = await leg('Ramp→walkway end', info.wEnd, '3a-walkway-end.jpg'); check('Walked from Ramp along the walkway to its end over B', r?.arrived, r && JSON.stringify({ ms: Math.round(r.ms), turns: r.turns, stalls: r.stalls, end: r.end && H(...r.end) }));
  const push = (to, ms, jumpAt) => p.evaluate(async ({ to, ms, jumpAt, cx, cz }) => { const sleep = t => new Promise(r => setTimeout(r, t)), am = () => __infra.lab.move.am, low = [];
    let a = am(); await __turn(cx + to.x, cz + to.z); await sleep(150);
    const W = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' })); W(); setTimeout(W, 120); setTimeout(W, 400); const t0 = performance.now(); let jumped = false;
    while (performance.now() - t0 < ms) { await sleep(30); a = am(); low.push(a.y);
      if (jumpAt != null && !jumped && performance.now() - t0 > jumpAt) { jumped = true; dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); await sleep(60); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })); } }
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' })); await sleep(500); a = am(); return { end: [a.x - cx, a.z - cz, a.y], low: Math.min(...low, a.y) }; }, { to, ms, jumpAt, cx: info.cx, cz: info.cz });
  const onB = q => q && q.end[2] < info.goal.y + 3;
  const walkOff = []; for (const [nm, to] of [['east', info.dropE], ['north-east', info.dropNE]]) { const q = await push(to, 3000, null); walkOff.push({ dir: nm, end: H(...q.end), onB: onB(q) }); if (onB(q)) break; await leg('back to walkway end', info.wEnd, null); }
  await p.screenshot({ path: path.join(out, '3b-walk-off-try.jpg'), type: 'jpeg', quality: 80 });
  const dropNoJump = walkOff.some(w => w.onB); report.dropWithoutJump = dropNoJump; report.walkOff = walkOff;
  console.log('INFO walkway end → B without a jump: ' + (dropNoJump ? 'DROPS onto B' : 'stays up on the walkway (CS2\'s player-clip rails: a jump, as in CS2)') + ' · ' + JSON.stringify(walkOff));
  let dropped = dropNoJump;
  if (!dropped) { await leg('walkway to jump spot', info.wJump, null); const q = await push(info.jumpTo, 2200, 100); report.jumpDrop = { end: H(...q.end) }; dropped = onB(q); }
  check('Off the walkway onto B\'s floor (' + (dropNoJump ? 'walked off, no jump' : 'a jump over the rail') + ')', dropped, JSON.stringify({ walkOff, jump: report.jumpDrop }));
  await p.screenshot({ path: path.join(out, '3c-dropped-on-b.jpg'), type: 'jpeg', quality: 80 });
  r = await leg('to the bomb spot', info.goal, '3-b-site.jpg'); check('Walked across B\'s floor to the bomb spot', r?.arrived, r && JSON.stringify({ ms: Math.round(r.ms), turns: r.turns, stalls: r.stalls, end: r.end && H(...r.end) }));
  let across = 0; const cornerRes = [];
  for (let k = 0; k < info.corners.length; k++) { const c = info.corners[k]; const q = await leg('B corner ' + (k + 1), c, k === 1 ? '4-b-across.jpg' : null); cornerRes.push(q ? { arrived: q.arrived, stalls: q.stalls.length, end: q.end && H(...q.end), low: q.trace.length ? Math.min(...q.trace.map(t => t[2])) : null } : null); if (q?.arrived) across++; }
  check('Walked across B to its four corners, never off B\'s floor', across === info.corners.length && cornerRes.every(c => c && c.low > info.goal.y - 2), JSON.stringify(cornerRes));
  r = await leg('back to B goal', info.goal, null); check('Back on the bomb spot', r?.arrived, r && JSON.stringify({ end: r.end && H(...r.end) }));
  s = await st(); check('Still live, the bomb with you', s.phase === 'live' && s.carrier === 'darja', JSON.stringify(s));
  await p.keyboard.press('Digit5'); await p.waitForTimeout(800);
  const c4 = await p.evaluate(() => __infra.lab.pistol.current?.id); check('Key 5: the bomb in hand', c4 === 'c4', c4);
  await p.mouse.move(640, 400); await p.mouse.down(); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, '5-planting.jpg'), type: 'jpeg', quality: 80 }); await p.waitForTimeout(2600); await p.mouse.up(); await p.waitForTimeout(600);
  s = await st(); check('Bomb planted on B', s.phase === 'planted', JSON.stringify(s));
  await p.screenshot({ path: path.join(out, '6-planted.jpg'), type: 'jpeg', quality: 80 });
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report));
  check('No page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally { await b.close(); server.kill(); }
console.log(`${ok === n ? 'PASS' : 'FAIL'}: Nuke B walked in the real game · ${ok}/${n}`); process.exit(ok === n ? 0 : 1);
