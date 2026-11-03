// A lineup thrown by a guest over LAN lands where the host's own throw from the same spot does (v53, SPEC 1.2.6 / 1.4):
// through the real room server (lan/room.mjs, its own tick), plain HTTP players. Ann (the host's page) and Bo (a guest)
// each throw the same lineup — the same setpos / setang — at the same moment. Ann's message is built straight from the
// lineup (arena-nades.js throwPacket); Bo's comes the way a guest page makes it: a movement state (arena-move.js) put at
// the spot and settled onto the CLIENT's own collision for the map, frames at 144 fps, the release at a moment inside a
// tick (pressThrow), the packet from the resolved release as lab.js throwReady builds it, sent as JSON. Both grenades must
// go off at the same place and after the same air time (≤ 0.5 units, ≤ 1 tick), where the preview says (simThrow);
// every state of them Bo's stream carries is the flight's own step n, to the last bit (nothing rounded on the way),
// carrying its 64 Hz clock (n, acc). The client's map (collision and grenade mesh) is built in a SEPARATE module instance
// of arena-maps.js from the bytes the room serves (GET /api/user-maps, /user-maps/<id>.bsp: user-maps.js's path) and
// must answer as the host's own. Dust II always (the room's map file when it has one, else built in, on both); Mirage's window smoke from cart (CS2's own getpos line) when
// Mirage is converted on this computer (user-maps/mirage.bsp).
//   node tests/gd-lan-lineup.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { startRoom } from '../lan/room.mjs';
import { startArena } from '../dist/arena-logic.js';
import { ARENA_MAPS, useMapFile, mapBoxes, floorTop } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { throwPacket, simThrow, NADE_MS } from '../dist/arena-nades.js';
import { HU, createMoveState, createMoveClock, moveTicks, pressThrow, pressJump } from '../dist/arena-move.js';
const CL = await import('../dist/arena-maps.js?client');   // (the guest's own copy of the map module: what its page builds, apart from the host's)
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); if (process.env.VERBOSE) console.log('  ok ' + name); };
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdll-')), 's.json'), roomCode: 'LINE01', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, wait = ms => new Promise(r => setTimeout(r, ms));
const post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const join = async (name, hostKey) => (await post('join', { code: 'LINE01', name, ...(hostKey ? { hostKey } : {}) })).body;
const ann = await join('Ann', 'k'), bo = await join('Bo');
// Bo's stream: every grenade state in every combat frame (as JSON brought it).
const streamed = [], ctl = new AbortController();
fetch(base + '/api/events?token=' + bo.token, { signal: ctl.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (!data || type !== 'combat') continue;
      try { const d = JSON.parse(data); for (const q of d.nades || []) streamed.push(q); } catch {} } } }).catch(() => {});
await wait(200);
const g = () => room.world.operations.game, act = (p, a) => post('action', { action: { type: 'arena', action: a } }, p.token);
const cx = ARENA.cx, cz = ARENA.cz;
// The guest's maps: what its page has (user-maps.js ensureMapFile) — every map file the room lists, fetched by its hash
// from the room's own endpoint into the guest's OWN arena-maps.js instance (CL); a map not listed stays built in, there
// and on the host alike. Then its collision and grenade mesh must answer as the host's.
const listing = await (await fetch(base + '/api/user-maps')).json(), served = new Set();
async function guestMap(id) { if (served.has(id)) return; served.add(id); const info = (listing.maps || []).find(m => m.id === id);
  if (info) { const buf = Buffer.from(await (await fetch(base + '/user-maps/' + id + '.bsp?h=' + info.hash)).arrayBuffer()); CL.useMapFile(id, buf, { hash: info.hash, name: info.name }); }
  const M = ARENA_MAPS[id], C = CL.ARENA_MAPS[id], hb = mapBoxes(M, cx, cz), gb = CL.mapBoxes(C, cx, cz), A = hb.nadeMesh, B = gb.nadeMesh, tag = id + (info ? ' (the room\'s map file ' + info.hash + ')' : ' (built in)');
  ok(`${tag}: the guest's map is its own module's (not the host's object), the same file`, C !== M && (!info || CL.mapFileOf?.(id)?.hash === info.hash || !CL.mapFileOf));
  const key = b => [b.minX, b.maxX, b.minY ?? b.y0, b.maxY ?? b.y1, b.minZ, b.maxZ, b.walk ? 1 : 0].join(',');
  ok(`${tag}: the guest's collision boxes are the host's (${hb.length})`, hb.length === gb.length && hb.every((b, i) => key(b) === key(gb[i])));
  if (!A && !B) return;
  // every answer the grenade code asks of the mesh — first crossing (where, how far), sight, contact — along 3000 lines
  // and points spread over the whole map, the same to the last bit
  const fp = Me => { const [W, D] = M.size, t = new Float64Array(4), o = []; for (let i = 0; i < 3000; i++) { const x = cx - W / 2 + (i * 7919 % 1000) / 1000 * W, z = cz - D / 2 + (i * 104729 % 1000) / 1000 * D, y = (i * 31 % 60) - 10, k = i % 3;
      const r = k === 0 ? Me.first(x, y + 40, z, x, y - 40, z, false, t) : k === 1 ? Me.first(x, y, z, x + 30, y - 5, z - 20, false, t) : Me.blocked(x, y, z, x - 25, y + 3, z + 25, true); o.push(r, t[0], t[1], t[2]); if (Me.contact) { Me.contact(x, y, z, .5, t); o.push(t[0], t[1], t[2], t[3]); } } return o; };
  const fa = A && fp(A), fb = B && fp(B), diff = fa && fb ? fa.findIndex((v, i) => !Object.is(v, fb[i])) : 0;
  ok(`${tag}: the guest's grenade mesh answers as the host's (3000 queries, bit for bit)`, A && B && A !== B && A.tris === B.tris && fa.length === fb.length && diff < 0, JSON.stringify([A?.tris, B?.tris, diff, fa?.[diff], fb?.[diff]])); }
// A lineup: [name, map, feet (game units), pitch / yaw (radians, the game's raw look), strength, kind]
const lineups = [];
// where a player put at (x, y0, z) stands (a setpos: the body's hull settles on the floor under it — a ledge within its
// width counts — and out of a wall it touches), on the HOST's own collision for the map: the host player's own feet
const settle = (M, x, z, y0) => { const bx = mapBoxes(M, cx, cz), W = { boxes: bx, ladders: [], bounds: { minX: cx - M.size[0] / 2, maxX: cx + M.size[0] / 2, minZ: cz - M.size[1] / 2, maxZ: cz + M.size[1] / 2 }, others: [] }, s = createMoveState(y0), c = createMoveClock(), I = { wish: [0, 0], weapon: 'smoke', look: [0, -1], duck: false }; s.x = x; s.z = z; for (let i = 0; i < 64; i++) moveTicks(s, c, I, W, 1 / 128, i / 128); return s; };
{ const M = ARENA_MAPS.dust2, s = M.t[0], F = settle(M, cx + s[0], cz + s[1], floorTop(mapBoxes(M, cx, cz), cx + s[0], cz + s[1]));   // (T spawn: the host's own feet there — the old nav guess was 6 HU under its floor)
  lineups.push({ name: 'Dust II: a lob from T spawn', map: 'dust2', x: F.x, y: F.y, z: F.z, pitch: .61, yaw: 2.3, strength: 'long', kind: 'smoke' });
  lineups.push({ name: 'Dust II: a medium flash from T spawn', map: 'dust2', x: F.x, y: F.y, z: F.z, pitch: .9, yaw: -.4, strength: 'medium', kind: 'flash' }); }
if (existsSync('user-maps/mirage.bsp') && readFileSync('user-maps/mirage.bsp').subarray(0, 4).toString() === 'CS2M') {
  const buf = readFileSync('user-maps/mirage.bsp'); useMapFile('mirage', buf); const M = ARENA_MAPS.mirage, H = M.hammer, U = H.U;
  const toGame = (x, y, z) => [cx + (x - H.x0) * U - H.W / 2, (z - H.zLow) * U, cz + (H.y1 - y) * U - H.D / 2];
  // CS2's getpos: setpos 360.075439 -691.968750 -100.067307;setang -37.951241 176.761139 (the eye; pitch down positive)
  const [ex, ey, ez] = toGame(360.075439, -691.96875, -100.067307), yaw = (176.761139 - 90) * Math.PI / 180, pitch = 37.951241 * Math.PI / 180;
  const F = settle(M, ex, ez, ey - 64.0626 * HU);   // (the host player put at CS2's setpos: the cart's side nudges the body 0.8 HU out — gd-lineups.mjs checks the getpos against CS2 itself)
  lineups.push({ name: 'Mirage: window smoke from cart (CS2\'s getpos line)', map: 'mirage', x: F.x, y: F.y, z: F.z, pitch, yaw, strength: 'long', kind: 'smoke' });
  lineups.push({ name: 'Mirage: the same angles as a medium jump-throw (both buttons)', map: 'mirage', x: F.x, y: F.y, z: F.z, pitch, yaw, strength: 'medium', kind: 'smoke', vy: 301.993 * HU, jt: 1 });   // (a full jump-throw from there sails out over the map)
} else console.log('  (Mirage is not converted on this computer: Dust II only)');
let map = null;
for (const L of lineups) {
  if (map !== L.map) { startArena(g(), { map: L.map, kind: 'defuse', bots: 0, freezeS: 15 }, Date.now()); map = L.map; await wait(300); Object.assign(g().combat.d.teams, { ann: 't', bo: 't' }); g().combat.d.round.freezeUntil = Date.now(); await wait(300); }
  const A = g().arena; A.loadout ??= {}; for (const k of ['ann', 'bo']) { A.loadout[k] ??= { secondary: 'pistol' }; A.loadout[k].nades = [L.kind]; }
  const packet = throwPacket({ x: L.x, y: L.y, z: L.z, duck: 0, vx: 0, vy: L.vy || 0, vz: 0, pitch: L.pitch, yaw: L.yaw, strength: L.strength, frac: .5, jt: L.jt }), wire = JSON.parse(JSON.stringify(packet));
  // Bo's: the guest's movement on the guest's own collision (CL: the served map file; Dust II built in), standing at the
  // spot; frames at 144 fps; Space at the same moment for the jump-throw; the release resolved off its tick (lab.js
  // throwReady: feet, duck, velocity, the raw angles, the strength, frac, jt)
  await guestMap(L.map); const CM = CL.ARENA_MAPS[L.map], cb = CL.mapBoxes(CM, cx, cz), Wc = { boxes: cb, ladders: [], bounds: { minX: cx - CM.size[0] / 2, maxX: cx + CM.size[0] / 2, minZ: cz - CM.size[1] / 2, maxZ: cz + CM.size[1] / 2 }, others: [] };
  const ms = createMoveState(L.y), clk = createMoveClock(), In = { wish: [0, 0], weapon: L.kind, look: [-Math.sin(L.yaw), -Math.cos(L.yaw)], pitch: L.pitch, duck: false }; ms.x = L.x; ms.z = L.z;
  let ct = 0; moveTicks(ms, clk, In, Wc, 0, ct); const tRel = .5 + .37 / 128; let sent = false;
  for (let f = 0; f < 400 && !clk.thr[0]; f++) { const nt = ct + 1 / 144; if (!sent && nt >= tRel) { sent = true; if (L.jt) pressJump(clk, tRel); } moveTicks(ms, clk, In, Wc, 1 / 144, nt); ct = nt; if (sent && clk.rt !== clk.rt && !clk.thr[0] && ct >= tRel && f < 399) pressThrow(clk, tRel); }
  const T = clk.thr, guest = T[0] ? JSON.parse(JSON.stringify(throwPacket({ x: T[1], y: T[2], z: T[3], duck: T[7], vx: T[4], vy: T[5], vz: T[6], pitch: L.pitch, yaw: L.yaw, strength: L.strength, frac: T[8], jt: T[9] }))) : null;
  ok(`${L.name}: the guest's release resolved off its movement tick${L.jt ? ' as a jump-throw (301.993 u/s up)' : ', standing still'} — feet ${guest ? ((guest.y - packet.y) / HU).toFixed(5) : '?'} HU from the lineup's`, guest && (L.jt ? T[9] === 1 && Math.abs(T[5] - (L.vy || 0)) < 1e-9 : T[9] === 0 && T[4] === 0 && T[5] === 0 && T[6] === 0) && Math.hypot(guest.x - packet.x, guest.y - packet.y, guest.z - packet.z) / HU < .01, JSON.stringify(guest && [guest.x - packet.x, guest.y - packet.y, guest.z - packet.z]));
  const M = ARENA_MAPS[L.map], boxes = mapBoxes(M, cx, cz), [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 };
  const path = []; const ref = simThrow(L.kind, wire, boxes, bounds, 20000, s => path.push([s.x, s.y, s.z]));
  const before = new Set((g().combat.nades || []).map(q => q.id)), s0 = streamed.length;
  const [ra, rb] = await Promise.all([act(ann, { type: 'throw', kind: L.kind, ...wire }), act(bo, { type: 'throw', kind: L.kind, ...guest })]);
  ok(`${L.name}: both throws taken (the host's own and the guest's)`, ra.status === 200 && rb.status === 200, JSON.stringify([ra.body.error, rb.body.error, g().combat.d.round.phase]));
  const mine = () => (g().combat.nades || []).filter(q => !before.has(q.id)), byOf = w => mine().find(q => q.by.toLowerCase() === w);
  const t0 = Date.now(); while (Date.now() - t0 < 12000 && mine().some(q => q.phase === 'air')) await wait(30);
  const ga = byOf('ann'), gb = byOf('bo');
  ok(`${L.name}: both went off`, ga && gb && ga.phase !== 'air' && gb.phase !== 'air' && ref.off, JSON.stringify([ga?.phase, gb?.phase, ref.off]));
  const d = Math.hypot(ga.x - gb.x, ga.y - gb.y, ga.z - gb.z) / HU, ta = (ga.firedAt - ga.at) / NADE_MS, tb = (gb.firedAt - gb.at) / NADE_MS;
  ok(`${L.name}: the guest's lands where the host's own does (≤ 0.5 units) — ${d.toFixed(6)}`, d <= .5, JSON.stringify([[ga.x, ga.y, ga.z], [gb.x, gb.y, gb.z]]));
  ok(`${L.name}: after the same air time (≤ 1 tick) — ${ta.toFixed(3)} / ${tb.toFixed(3)} ticks (${(ta * NADE_MS / 1000).toFixed(3)} s)`, Math.abs(ta - tb) <= 1 && Math.abs(ta - ref.n) <= 1, JSON.stringify([ta, tb, ref.n]));
  ok(`${L.name}: where the preview says (≤ 0.5 units across)`, Math.hypot(ga.x - ref.x, ga.z - ref.z) / HU <= .5, JSON.stringify([ga.x - ref.x, ga.z - ref.z]));
  await wait(150); const sts = streamed.slice(s0).filter(q => (q.id === ga.id || q.id === gb.id) && q.phase === 'air' && Number.isInteger(q.n) && q.n < path.length);
  const worst = Math.max(0, ...sts.map(q => Math.hypot(q.x - path[q.n][0], q.y - path[q.n][1], q.z - path[q.n][2])));
  ok(`${L.name}: Bo's stream carries both flights on their own 64 Hz steps, unrounded (${sts.length} states, worst ${worst})`, sts.length >= 4 && worst <= 1e-9 && sts.every(q => Number.isFinite(q.acc) && q.acc >= 0 && q.acc < 1 / 64 + 1e-6), JSON.stringify(sts.slice(0, 2)));
}
ctl.abort(); await room.close?.();
console.log(`PASS: LAN lineups · ${n} checks (${lineups.map(l => l.name).join('; ')})`);
process.exit(0);
