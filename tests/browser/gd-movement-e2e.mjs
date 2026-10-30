// Global Defensive movement in the real game (solo deathmatch, no bots, its first map — built in, or its file when this
// computer has one): the fixed 128 Hz movement clock runs and the view is drawn from it (arena-move.js moveTicks), you
// run at the gun's own CS2 speed (m_flMaxSpeed), a tap of Space jumps once — 57 HU high, one landing — and holding it
// never jumps again (CS2's sv_autobunnyhopping 0), crouching puts the eye at CS2's 46 HU (back to standing on release),
// a crouch key held through a teleport still crouches, and the pose the room keeps carries the true feet (fy) with the
// eye over them (ey). No page errors.
//   node tests/browser/gd-movement-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'MOVE01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'mv-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Mover'); localStorage.setItem('infra-face-name', 'Mover'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'dm'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 120000 });
await p.waitForTimeout(800); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(500);
await p.waitForFunction(() => !!__infra.lab.move?.am, null, { timeout: 10000 }).catch(() => {});
// A spot in the open: the spawn, facing the way with the most room (60 units clear of the map's boxes, the floor level).
const spot = await p.evaluate(async () => { const { blocked, groundAt, HU } = await import('/arena-move.js'), boxes = __infra.lab.arenaScene.boxes, c = __infra.camera.position, y0 = __infra.lab.move.am.y;
  for (const [x, z] of [[c.x, c.z], ...Array.from({ length: 24 }, (_, i) => [c.x + Math.cos(i) * 6 * (1 + i % 3), c.z + Math.sin(i) * 6 * (1 + i % 3)])]) { const y = groundAt(boxes, x, z, y0 + 2); if (blocked(boxes, null, x, z, y)) continue;
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, dx = Math.cos(a), dz = Math.sin(a); let clear = true; for (let d = 1; d <= 60 && clear; d += 1) { const px = x + dx * d, pz = z + dz * d; if (blocked(boxes, null, px, pz, y) || Math.abs(groundAt(boxes, px, pz, y + 2) - y) > 1e-6) clear = false; }
      for (let d = 1; d <= 20 && clear; d += 1) if (blocked(boxes, null, x - dx * d, z - dz * d, y)) clear = false;
      if (clear) return { x, z, y, dx, dz, HU }; } } return null; });
check('an open spot near the spawn (60 units clear)', !!spot, JSON.stringify(spot));
const place = () => p.evaluate(s => { __infra.lab.look(s.x, s.z, s.x + s.dx * 10, s.y + 9.7, s.z + s.dz * 10, s.y + 9.7); }, spot);
// Every frame (after the game's own update): the body, the clock and the camera.
await p.evaluate(() => { const M = __infra.lab.move; globalThis.__mv = []; const f = () => { const m = __infra.lab.move, a = m.am, c = __infra.camera.position; if (a) __mv.push({ t: performance.now(), y: a.y, g: a.onGround, vx: a.vx, vz: a.vz, ticks: m.clk.ticks, ducked: a.ducked, eye: c.y - m.clk.y, same: c.x === m.clk.x && c.z === m.clk.z, landAt: a.landAt || 0 }); if (__mv.length > 4000) __mv.splice(0, 2000); requestAnimationFrame(f); }; requestAnimationFrame(() => requestAnimationFrame(f)); });
const since = t0 => p.evaluate(t0 => __mv.filter(s => s.t >= t0), t0), now = () => p.evaluate(() => performance.now());
if (spot) {
  await place(); await p.waitForTimeout(600);
  // The clock: 128 ticks a second of real time, the view drawn from it.
  let t0 = await now(); await p.waitForTimeout(1500); let s = await since(t0);
  const rate = s.length > 1 ? (s.at(-1).ticks - s[0].ticks) / ((s.at(-1).t - s[0].t) / 1000) : 0;
  check('the movement clock runs 128 ticks a second (fixed ticks: arena-move.js moveTicks)', rate > 110 && rate < 136, rate.toFixed(1) + ' ticks/s over ' + s.length + ' frames');
  check('…and the view is drawn from it (camera = the clock\'s drawn spot, every frame)', s.length > 30 && s.every(q => q.same), s.filter(q => !q.same).length + ' frames apart');
  // Running: the gun's own speed.
  const want = await p.evaluate(async () => { const { maxSpeed, HU } = await import('/arena-move.js'); return { id: __infra.lab.pistol.current?.id || 'knife', v: maxSpeed(__infra.lab.pistol.current?.id || 'knife', __infra.lab.pistol.scope > 0) / HU }; });
  t0 = await now(); await p.keyboard.down('KeyW'); await p.waitForTimeout(1200); await p.keyboard.up('KeyW'); s = await since(t0);
  const top = Math.max(...s.map(q => Math.hypot(q.vx, q.vz) / spot.HU));
  check('running (W): the gun\'s CS2 speed (' + want.id + ' ' + want.v + ' HU/s), no more', Math.abs(top - want.v) < want.v * .01, top.toFixed(1) + ' HU/s');
  // A tap of Space: one jump, 57 HU, one landing.
  await place(); await p.waitForTimeout(700);
  t0 = await now(); await p.keyboard.press('Space'); await p.waitForTimeout(1300); s = await since(t0);
  const ups = s.filter((q, i) => i && s[i - 1].g && !q.g).length + (s[0] && !s[0].g ? 1 : 0), peak = (Math.max(...s.map(q => q.y)) - spot.y) / spot.HU, lands = new Set(s.map(q => q.landAt).filter(Boolean)).size;
  check('a tap of Space jumps once, 57 HU high (CS2), and lands once', ups === 1 && Math.abs(peak - 57) < 1.2 && lands === 1, JSON.stringify({ ups, peak: +peak.toFixed(2), lands }));
  // Holding Space: still one jump (a fresh press each time).
  await p.waitForTimeout(400); t0 = await now(); await p.keyboard.down('Space'); await p.waitForTimeout(2200); await p.keyboard.up('Space'); s = await since(t0);
  const ups2 = s.filter((q, i) => i && s[i - 1].g && !q.g).length + (s[0] && !s[0].g ? 1 : 0);
  check('holding Space for 2 s jumps once (CS2\'s sv_autobunnyhopping 0: no pogo)', ups2 === 1, ups2 + ' jumps');
  // Crouching: the eye at CS2's 46 HU, back at the standing eye on release.
  await p.waitForTimeout(500); await p.keyboard.down('KeyC'); await p.waitForTimeout(450); let e = await p.evaluate(() => { const m = __infra.lab.move; return { eye: __infra.camera.position.y - m.clk.y, ducked: m.am.ducked }; });
  check('crouching: the hull crouched, the eye at CS2\'s 46 HU (the hall keeps its own)', e.ducked && Math.abs(e.eye / spot.HU - 46) < .5, (e.eye / spot.HU).toFixed(2) + ' HU');
  await p.screenshot({ path: path.join(out, 'crouched.png') });
  // …held through a respawn (the host's spawn: arena-ui.js goSpawn → the teleport, which clears the crouch toggle): still crouched.
  const tp0 = await p.evaluate(() => __infra.lab.move.tp);
  await p.evaluate(s => { const C = __infra.lab.world.operations.game.combat; (C.spawnTo ??= {}).mover = { at: Date.now() + 7, x: s.x, z: s.z, y: s.y }; }, spot); await p.waitForTimeout(500);
  e = await p.evaluate(() => ({ ducked: __infra.lab.move.am?.ducked, tp: __infra.lab.move.tp }));
  check('a crouch key held through a respawn (a teleport) still crouches', e.ducked === true && e.tp > tp0, JSON.stringify({ ...e, tp0 }));
  await p.keyboard.up('KeyC'); await p.waitForTimeout(450); e = await p.evaluate(() => { const m = __infra.lab.move; return { eye: __infra.camera.position.y - m.clk.y, ducked: m.am.ducked }; });
  check('…let go: standing, the eye back at 9.7 units (63 HU)', !e.ducked && Math.abs(e.eye - 9.7) < .02, e.eye.toFixed(3));
  // The pose the room keeps: the true feet and the eye over them.
  await p.keyboard.down('KeyA'); await p.waitForTimeout(150); await p.keyboard.up('KeyA'); await p.waitForTimeout(900);
  const pose = await p.evaluate(() => { const L = __infra.lab.lan, me = L.players?.find(q => q.id === L.selfID); return { fy: me?.pose?.fy, ey: me?.pose?.ey, feet: __infra.lab.move.am.y, crouched: me?.pose?.crouched }; });
  check('the room keeps the true feet (fy) and the eye over them (ey) for everyone', Number.isFinite(pose.fy) && Math.abs(pose.fy - pose.feet) < .01 && Math.abs(pose.ey - 9.7) < .05 && pose.crouched === false, JSON.stringify(pose));
  // A boost with a team mate through the room: "Prop" (plain HTTP, its poses as multiplayer.js sends them) crouches 20
  // units out; you jump onto its head (54 HU), it stands up (72 HU: you go up with it), crouches (back to 54), then walks
  // off (you are not carried: you drop to the floor where you were).
  const code = await p.evaluate(() => __infra.lab.lan.roomCode), map = await p.evaluate(() => __infra.lab.world.operations.game.arena.map), HU = spot.HU;
  const http = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ error: e.message }));
  const prop = await http('join', { code, name: 'Prop' }); await http('arena-ready', { map }, prop.token);
  const S = { x: spot.x + spot.dx * 20, z: spot.z + spot.dz * 20, crouched: true }; let ct = 1000;
  const propPose = () => http('pose', { pose: { x: S.x, z: S.z, y: spot.y + (S.crouched ? 46 * HU : 9.7), fy: spot.y, crouched: S.crouched, yaw: 0, active: true, ct: ct += 50, tp: 1 } }, prop.token);
  const keep = setInterval(propPose, 50); await propPose();
  await p.waitForFunction(S => { const m = [...__infra.lab.lan.models.values()].find(q => q.pname === 'Prop'); return m && m.crouch === true && Math.hypot(m.g.position.x - S.x, m.g.position.z - S.z) < .05; }, S, { timeout: 15000 }).catch(() => {});
  const seen = await p.evaluate(() => { const m = [...__infra.lab.lan.models.values()].find(q => q.pname === 'Prop'); return m ? { y: m.g.position.y, crouch: m.crouch, visible: m.g.visible } : null; });
  check('a team mate\'s true feet and crouch reach the page (pose fy → its body)', !!seen && Math.abs(seen.y - spot.y) < 1e-3 && seen.crouch === true, JSON.stringify(seen));
  const me = () => p.evaluate(() => { const a = __infra.lab.move.am; return { y: a.y, g: a.onGround, x: a.x, z: a.z }; });
  // (34 HU short of its centre along the larger axis — hulls are square — facing it; W held until you stand on it)
  await p.evaluate(({ s, d }) => { __infra.lab.look(s.x + s.dx * d, s.z + s.dz * d, s.x + s.dx * 40, s.y + 9.7, s.z + s.dz * 40, s.y + 9.7); }, { s: spot, d: 20 - 34 * HU / Math.max(Math.abs(spot.dx), Math.abs(spot.dz)) }); await p.waitForTimeout(500);
  await p.evaluate(top => { const w = () => { const a = __infra.lab.move.am; if (a && a.onGround && a.y > top) { dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' })); return; } requestAnimationFrame(w); }; requestAnimationFrame(w); }, spot.y + 40 * HU);
  await p.keyboard.down('KeyW'); await p.keyboard.press('Space'); await p.waitForTimeout(1100); await p.keyboard.up('KeyW'); await p.waitForTimeout(400);
  let m1 = await me(); check('jumped onto a crouched team mate\'s head: standing on it, 54 HU up', m1.g && Math.abs((m1.y - spot.y) / HU - 54) < .5, ((m1.y - spot.y) / HU).toFixed(2) + ' HU');
  // (the view eases those 18 HU — never a jump of them in one frame: lab.js STEP_SMOOTH, with arena-move.js's tolerance)
  const camTrack = () => p.evaluate(() => { window.__camY = []; const f = () => { if (!window.__camY) return; window.__camY.push(__infra.camera.position.y); requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const camJump = () => p.evaluate(() => { const a = window.__camY || []; window.__camY = null; let j = 0; for (let i = 1; i < a.length; i++) j = Math.max(j, Math.abs(a[i] - a[i - 1])); return { j, frames: a.length }; });
  S.crouched = false; await camTrack(); await p.waitForTimeout(700); let cj = await camJump(); m1 = await me();
  check('…it stands up: you go up with it to 72 HU (the crouch boost), the view eased up', m1.g && Math.abs((m1.y - spot.y) / HU - 72) < .5 && cj.j < 9 * HU, ((m1.y - spot.y) / HU).toFixed(2) + ' HU, biggest view step ' + (cj.j / HU).toFixed(1) + ' HU in ' + cj.frames + ' frames');
  S.crouched = true; await camTrack(); await p.waitForTimeout(700); cj = await camJump(); m1 = await me();
  check('…it crouches: you go down with it to 54 HU, the view eased down', m1.g && Math.abs((m1.y - spot.y) / HU - 54) < .5 && cj.j < 9 * HU, ((m1.y - spot.y) / HU).toFixed(2) + ' HU, biggest view step ' + (cj.j / HU).toFixed(1) + ' HU');
  const x0 = m1.x, z0 = m1.z; for (let i = 0; i < 20; i++) { S.x += spot.dx * .3; S.z += spot.dz * .3; await p.waitForTimeout(50); } await p.waitForTimeout(1200); m1 = await me();
  check('…it walks off: you are not carried along, you drop to the floor', m1.g && Math.abs(m1.y - spot.y) < 1e-6 && Math.hypot(m1.x - x0, m1.z - z0) < .05, JSON.stringify({ y: (m1.y - spot.y) / HU, moved: Math.hypot(m1.x - x0, m1.z - z0) }));
  clearInterval(keep); await http('leave', {}, prop.token);
}
check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
console.log((ok === n ? 'PASS' : 'FAIL') + ': GD movement in the game · ' + ok + '/' + n);
await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
