// Global Defensive poses on the host (lan/room.mjs /api/pose; arena-move.js poseGate / fallCheck; combat-logic.js
// poseFeet), through the real room server with players made of plain HTTP: the feet a client sends (fy) reach everyone
// with the eye's height over them (ey), and the host's hit boxes stand on them — a crouched body's at CS2's 46 HU eye;
// standing on a team mate's head (a boost: only the height changes) passes; a body that moves faster than anyone can stays
// where it was, while a spawn the host made and the client's own teleport pass at once; a hard landing after a drop the
// host saw costs CS2's fall damage (a deadly one is a kill-feed "Fall"), a claimed one without the drop costs nothing.
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path'; import { mkdtempSync } from 'node:fs';
import { startRoom } from '../lan/room.mjs';
import { startArena } from '../dist/arena-logic.js';
import { hpOf, poseFeet } from '../dist/combat-logic.js';
import { HU, EYE_GD, fallDamage } from '../dist/arena-move.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); console.log('PASS ' + name + (d ? ' · ' + d : '')); };
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'ph-')), 's.json'), roomCode: 'POSE01', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
const join = async (name, hostKey) => (await post('join', { code: 'POSE01', name, ...(hostKey ? { hostKey } : {}) })).body;
const ann = await join('Ann', 'k'), bo = await join('Bo');
// Bo's event stream: the roster (everyone's pose as the host keeps it), the newest one.
let roster = []; const ctl = new AbortController();
fetch(base + '/api/events?token=' + bo.token, { signal: ctl.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (type !== 'players' || !data) continue; try { roster = JSON.parse(data); } catch {} } } }).catch(() => {});
const wait = ms => new Promise(r => setTimeout(r, ms)), g = room.world.operations.game;
await wait(300);
startArena(g, { map: 'dust2', kind: 'defuse', bots: 2, freezeS: 30 }, Date.now()); await wait(500);
Object.assign(g.combat.d.teams, { ann: 't', bo: 'ct' });
const { ARENA_MAPS } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), M = ARENA_MAPS.dust2;
const [sx, sz] = M.t[0], fl = M.nav.floorAt(sx, sz), X = ARENA.cx + sx, Z = ARENA.cz + sz;
// A client's pose (multiplayer.js): its capture clock `ct` 33 ms on per pose (30 a second), 30 ms apart in real time
// (under the room's 45 a second).
const cts = new Map(), send = async (p, o) => { const ct = (cts.get(p) ?? 1000) + 33; cts.set(p, ct); const r = await post('pose', { pose: { x: X, y: fl + 9.7, z: Z, yaw: 0, active: true, ct, ...o } }, p.token); await wait(30); return r; };
const mine = async p => { await wait(120); return roster.find(q => q.id === p.id)?.pose; };

// ── The feet: sent, kept, used ──────────────────────────────────────────────────────────────────────────────────────
let r = await send(ann, { fy: fl, tp: 1 }); let q = await mine(ann);
ok('the feet a client sends (fy) reach everyone, with the eye over them (ey)', r.status === 200 && Math.abs(q?.fy - fl) < 1e-6 && Math.abs(q?.ey - 9.7) < 1e-6, JSON.stringify(q && { fy: q.fy, ey: q.ey, fl }));
await send(ann, { y: fl + EYE_GD.duck, fy: fl, crouched: true, tp: 1 }); q = await mine(ann);
ok('crouched (the hull, held down too): the eye 46 HU over the feet, and the host\'s hit boxes stand on them', q?.crouched === true && Math.abs(q.ey - 46 * HU) < 1e-6 && Math.abs(poseFeet(q) - fl) < 1e-6, JSON.stringify({ ey: q?.ey, feet: q && poseFeet(q) }));
ok('…a pose rewound for a hit (lag-comp.js: its own y) keeps the eye over its feet', Math.abs(poseFeet({ ...q, y: q.y + 3 }) - (fl + 3)) < 1e-6);
ok('…with no feet sent (bots): the eye less CS2\'s 64 / 46 HU (46: 7.08 units, not the hall\'s 5.9)', Math.abs(poseFeet({ y: fl + 9.7, crouched: false }) - fl) < 1e-6 && Math.abs(poseFeet({ y: fl + EYE_GD.duck, crouched: true }) - fl) < 1e-6);
await send(ann, { x: -3, z: 11, y: 9.7, fy: 3 }); q = await mine(ann);
ok('…a pose outside the arena (the hall, the office) keeps no feet: theirs stay the eye less 5.9 / 9.7 (multiplayer.js)', q && q.z === 11 && q.fy === undefined && q.ey === undefined, JSON.stringify(q && { z: q.z, fy: q.fy }));
// Standing on a team mate's head: 72 HU up, same spot.
await send(ann, { y: fl + 72 * HU + 9.7, fy: fl + 72 * HU, tp: 1 }); q = await mine(ann);
ok('a boost (on a head: 72 HU up on the spot) passes the movement check', Math.abs(q?.fy - (fl + 72 * HU)) < 1e-6 && q.x === X && q.z === Z, JSON.stringify(q && { fy: q.fy, x: q.x - X }));
await send(ann, { fy: fl, tp: 1 });

// ── The movement check ─────────────────────────────────────────────────────────────────────────────────────────────
let x = X; for (let i = 0; i < 5; i++) { x += 250 * HU * .033; await send(ann, { x, fy: fl, tp: 1 }); } q = await mine(ann);
ok('running (250 HU/s) passes', Math.abs(q?.x - x) < 1e-6, (q?.x - X).toFixed(2));
await send(ann, { x: x + 20, fy: fl, tp: 1 }); q = await mine(ann);
ok('20 units in 33 ms (600 × a run): the host keeps the last spot', Math.abs(q?.x - x) < 1e-6, (q?.x - x).toFixed(2));
await send(ann, { x: x + 20, fy: fl, tp: 2 }); q = await mine(ann);
ok('…the same jump announced as the client\'s own teleport (a spawn pick, a practice tool) passes', Math.abs(q?.x - (x + 20)) < 1e-6, (q?.x - x).toFixed(2));
{ const [cx, cz] = M.ct[0]; g.combat.spawnTo.ann = { at: Date.now(), x: ARENA.cx + cx, z: ARENA.cz + cz };
  await send(ann, { x: ARENA.cx + cx, z: ARENA.cz + cz, fy: M.nav.floorAt(cx, cz), y: M.nav.floorAt(cx, cz) + 9.7, tp: 2 }); q = await mine(ann);
  ok('…and so does the host\'s own spawn (combat.spawnTo)', Math.abs(q?.x - (ARENA.cx + cx)) < 1e-6 && Math.abs(q?.z - (ARENA.cz + cz)) < 1e-6, JSON.stringify(q && [q.x - ARENA.cx, q.z - ARENA.cz, cx, cz])); }
await send(ann, { fy: fl, tp: 3 });   // back to the T spawn (a teleport)

// ── Fall damage ────────────────────────────────────────────────────────────────────────────────────────────────────
const hp0 = hpOf(g, 'ann'); let land = { n: 0, v: 0 };
await send(ann, { fy: fl, land, tp: 3 }); await send(ann, { fy: fl + 400 * HU, y: fl + 400 * HU + 9.7, land, tp: 3 });   // up on a roof 400 HU high (heights are never checked)
await send(ann, { fy: fl + 200 * HU, y: fl + 200 * HU + 9.7, land, tp: 3 }); land = { n: 1, v: 800 }; await send(ann, { fy: fl, land, tp: 3 }); await wait(100);
const hp1 = hpOf(g, 'ann');
ok('a hard landing (800 HU/s) after a 400 HU drop the host saw: CS2\'s fall damage (~50)', hp0 - hp1 === fallDamage(800) && fallDamage(800) >= 45, hp0 + ' → ' + hp1);
await send(ann, { fy: fl, land, tp: 3 }); await wait(60);
ok('…the same landing again costs nothing', hpOf(g, 'ann') === hp1, hpOf(g, 'ann'));
land = { n: 2, v: 1000 }; await send(ann, { fy: fl, land, tp: 3 }); await wait(60);
ok('…a claimed hard landing with no drop before it costs nothing (never harder than the fall the host saw)', hpOf(g, 'ann') === hp1, hpOf(g, 'ann'));
// Bo jumps off something 700 HU high: dead, a kill-feed "Fall", no kill for anyone.
{ let l = { n: 0, v: 0 }; await send(bo, { fy: fl, land: l, tp: 1 }); await send(bo, { fy: fl + 700 * HU, y: fl + 700 * HU + 9.7, land: l, tp: 1 }); l = { n: 1, v: 1100 }; await send(bo, { fy: fl, land: l, tp: 1 }); await wait(100);
  const f = g.combat.feed?.[0];
  ok('a deadly fall (1100 HU/s after 700 HU): down, the kill feed says Fall, nobody gets a kill', !!g.combat.down?.bo && f?.target === 'Bo' && f.weapon === 'Fall' && !(g.combat.kills?.bo), JSON.stringify(f)); }
ctl.abort(); await room.close?.();
console.log('PASS: Global Defensive poses on the host · ' + n + ' checks');
process.exit(0);
