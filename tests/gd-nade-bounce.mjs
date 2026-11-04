// v53 LINEUPS — what a grenade does after it first touches something, pinned to Source's rules (the public SDK's
// CBaseCSGrenadeProjectile::ResolveFlyCollisionCustom and Spawn, which CS:GO and CS2 inherited — SOURCE RULES, not in
// the CS2 files) and to CS2's own collision properties (scripts/collision_properties.txt in the user's install):
//  · one full reflection a 1/64 s tick (PhysicsToss traces the tick's move once and resolves that impact — PhysicsClipVelocity,
//    backoff 2 — keeping 0.45 × the surface's 1.0, a player's 0.3); a second touch in the same tick (our substeps)
//    only pushes it out, as Source's PhysicsPushEntity of the rest of the tick, and the next tick reflects it again;
//  · a rolling grenade meets the floor again each tick and loses 55 % a tick: at rest in as many ticks as Source's;
//  · on a floor (normal up > 0.7) it rests once its speed after the bounce is under 30 u/s, not at 31;
//  · off a player 0.45 × 0.3, and stopped (never at rest: a player is no floor) under 30 u/s;
//  · the box hull: off an edge or a corner it answers with a plane (the face or an axis), never a rounded normal;
//  · glass: a breakable pane breaks and it flies on at Source's 0.4 of its velocity; one of CS2's window props (the
//    "window" collision layer — solid to grenades, breakable) breaks too, the grenade flying on unslowed (FITTED to
//    CS2's own lineups through them); the window panes are found at load (nade-mesh.js windowPanes, cs2-map.js);
//  · a smoke goes off once it rests (not before its 1.5 s fuse) — on the step it rests: OURS (Source re-checks on its
//    0.2 s think; measured against the public lineups' air times it made no difference — arena-nades.js goesOff).
// Synthetic meshes in game units (tools/maps/nade-mesh.mjs → dist/nade-mesh.js), the game's own stepNade / simThrow.
//   node tests/gd-nade-bounce.mjs
import { buildNadeMesh } from '../tools/maps/nade-mesh.mjs';
import { createNadeMesh, windowPanes } from '../dist/nade-mesh.js';
import { readFileSync, existsSync } from 'node:fs';
import { parseCs2Map } from '../dist/cs2-map.js';
import { stepNade, simThrow, setNadeProbe, BOUNCE, NADE_DT, NADE_MS, NADES } from '../dist/arena-nades.js';
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const near = (a, b, e) => Math.abs(a - b) <= e, HU = 2.54 / 16.5, f2 = v => (+v).toFixed(2);
// Quads (two triangles each) and boxes (12 triangles) → a mesh as the game reads it from a map file.
function quad(T, see, [a, b, c, d], s = 1) { T.push(...a, ...b, ...c, ...a, ...c, ...d); see.push(s, s); }
function box(T, see, [x0, y0, z0], [x1, y1, z1], s) { const P = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
  quad(T, see, [P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)], s); quad(T, see, [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], s);
  quad(T, see, [P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)], s); quad(T, see, [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)], s);
  quad(T, see, [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], s); quad(T, see, [P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)], s); }
function meshOf(build) { const T = [], see = []; build(T, see);
  const { info, buf } = buildNadeMesh(new Float32Array(T), Uint8Array.from(see)), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), p4 = n => n + (4 - n % 4) % 4;
  let o = 0; const tri = new Uint16Array(ab, o, info.tris * 9); o += p4(info.tris * 18); const bx = new Uint16Array(ab, o, info.nodes * 6); o += p4(info.nodes * 12); const links = new Uint32Array(ab, o, info.nodes * 2); o += info.nodes * 8;
  const raw = { o: info.o, s: info.s, tri, box: bx, links, sight: new Uint8Array(ab, o, info.tris) }; return Object.assign(createNadeMesh(raw), { raw }); }
// The floor y = 0 (−500…500), a wall x = 100…101 (300 high).
const F = 500, M = meshOf((T, see) => { quad(T, see, [[-F, 0, -F], [F, 0, -F], [F, 0, F], [-F, 0, F]]); quad(T, see, [[100, 0, -F], [100, 0, F], [100, 300, F], [100, 300, -F]]); quad(T, see, [[101, 0, -F], [101, 300, -F], [101, 300, F], [101, 0, F]]); quad(T, see, [[100, 300, -F], [100, 300, F], [101, 300, F], [101, 300, -F]]); });
// (as mapBoxes gives it: a list of boxes — one far off here — carrying the map's grenade mesh and its doors)
// (the map wrapper's contact as bsp-map.js gives it: an out with room for 7 also gets the touched face's normal — faceOf)
const FO = new Float64Array(3), wrap = m => ({ tris: m.tris, blocked: m.blocked, first: m.first, contact: (x, y, z, r, out) => { if (!m.contact(x, y, z, r, out)) return false; if (out.length > 6 && m.faceOf(FO)) { out[4] = FO[0]; out[5] = FO[1]; out[6] = FO[2]; } return true; } });
const boxes = Object.assign([{ minX: 9e5, maxX: 9e5 + 1, minZ: 9e5, maxZ: 9e5 + 1, y0: 0, y1: 1 }], { nadeMesh: wrap(M), movers: [] }), bounds = { minX: -F, maxX: F, minZ: -F, maxZ: F }, R = .35;
const fly = (g, s, dt = NADE_DT, bodies = null) => { for (let i = 0; i < s && !g.rest; i++) stepNade(g, boxes, bounds, dt, bodies); return g; };
// 1 · the 45 % reflection: a straight drop on the floor leaves straight up at 0.45 of its speed.
{ const g = { x: 0, y: 2, z: 0, vx: 0, vy: -100, vz: 0, grav: 1e-9, still: 0 }; let k = 0; while (g.vy < 0 && k++ < 64) stepNade(g, boxes, bounds, NADE_DT);
  check('a floor reflects a straight drop, keeping 45 % (Source: elasticity 0.45 × surface 1.0, backoff 2)', near(g.vy, 100 * BOUNCE, .01) && BOUNCE === .45 && near(g.vx, 0, 1e-9), 'up at ' + f2(g.vy) + ' of 100'); }
// 2 · one full reflection a tick: into the corner of the wall and the floor at once, the first tick reflects it off one
//     (0.45 of its speed) and only pushes it out of the other; the next tick reflects that one too (0.45 × 0.45). (v53:
//     'every touch reflects' took both in one tick, and the old 'a second touch slides' took away its run into the floor.)
{ const g = { x: 100 - R - .02, y: R + .02, z: 0, vx: 200, vy: -200, vz: 0, grav: 1e-9, still: 0 }, v0 = Math.hypot(200, 200); stepNade(g, boxes, bounds, NADE_DT);
  const s1 = Math.hypot(g.vx, g.vy), one = (g.vx < 0) !== (g.vy > 0); stepNade(g, boxes, bounds, NADE_DT); const s2 = Math.hypot(g.vx, g.vy);
  check('a wall and the floor touched in one tick: one reflection that tick (0.45), the other the next (0.45 × 0.45)', one && near(s1, v0 * BOUNCE, v0 * BOUNCE * .02) && g.vx < 0 && g.vy > 0 && near(s2, v0 * BOUNCE * BOUNCE, v0 * BOUNCE * BOUNCE * .03), f2(s1) + ' then ' + f2(s2) + ' of ' + f2(v0)); }
// 3 · the roll: sliding along the floor at 300 u/s, gravity brings it back onto the floor each tick and each tick's touch
//     costs 55 % — 300 → 135 → 61 → 27 u/s: at rest on the 3rd tick, one reflection a tick, a few units on (Source: 3
//     ticks, ~8 units at the speed before each touch; ours moves at the reflected speed after the touch inside a tick).
{ const v0 = 300 * HU, g = { x: -200, y: R, z: 0, vx: v0, vy: 0, vz: 0, still: 0 }, sp = [], per = []; let px = g.vx, k = 0, c = 0;
  setNadeProbe(q => { if (Math.abs(q.vx - px) > 1e-9) { sp.push(q.vx / HU); c++; } px = q.vx; }); while (!g.rest && k++ < 128) { c = 0; stepNade(g, boxes, bounds, NADE_DT); per.push(c); } setNadeProbe(null);
  const run = (g.x + 200) / HU, each = sp.slice(0, 2).every((v, i) => near(v, 300 * BOUNCE ** (i + 1), 300 * BOUNCE ** (i + 1) * .03));
  check('rolling, each tick\'s floor touch costs 55 %, one a tick: at rest on the 3rd tick, under 16 units on', g.rest && per.length === 3 && per.every(n => n <= 1) && each && run > 2 && run < 16, 'speeds ' + sp.map(v => v.toFixed(0)).join(' → ') + ' u/s, touches a tick ' + per.join(',') + ', rests ' + run.toFixed(1) + ' units on'); }
// 4 · the floor stop: under 30 u/s after the bounce it rests at once; at 31 it bounces on.
{ const drop = v => { const g = { x: -300, y: R + .01, z: 0, vx: 0, vy: -v / BOUNCE * HU, vz: 0, grav: 1e-9, still: 0 }; for (let i = 0; i < 3; i++) stepNade(g, boxes, bounds, NADE_DT); return g; };
  const a = drop(29), b = drop(31);
  check('on a floor it rests once slower than 30 u/s (speed² < 30², Source), not at 31', a.rest && a.vy === 0 && !b.rest && b.vy > 0, '29 → rest ' + !!a.rest + ', 31 → ' + f2(b.vy / HU) + ' u/s up'); }
// 5 · off a player: 0.45 × 0.3; dropped slowly onto a head it is stopped (under 30 u/s), never at rest on it.
{ const body = [{ name: 'Ann', x: 0, y: 0, z: 0 }], g = { x: -100, y: 40 * HU, z: 0, vx: 60, vy: 0, vz: 0, grav: 1e-9, still: 0, by: 'Bo' }; fly(g, 128, NADE_DT, body);
  check('off a player it keeps 0.45 × 0.3 (Source: a player\'s surface elasticity 0.3)', g.vx < 0 && near(-g.vx, 60 * .45 * .3, .05), f2(g.vx) + ' of 60');
  const h = { x: 0, y: 72 * HU + R + .01, z: 0, vx: 0, vy: -50 * HU, vz: 0, grav: 1e-9, still: 0, by: 'Bo' }; stepNade(h, boxes, bounds, NADE_DT, body);
  check('…a slow one landing on a head is stopped there (speed² < 30²), not at rest (a player is no floor)', h.vy === 0 && h.vx === 0 && !h.rest, 'v ' + f2(h.vy / HU) + ' u/s, rest ' + !!h.rest); }
// 6 · the box hull at an edge: dropped just past the wall's top outer edge (x 101…101.35: the ball touches the edge,
//     not the face), it leaves straight up off the axial plane — a ball's rounded normal threw it sideways.
{ const g = { x: 101.2, y: 300.5, z: 0, vx: 0, vy: -50, vz: 0, grav: 1e-9, still: 0 }; let k = 0; while (g.vy < 0 && k++ < 64) stepNade(g, boxes, bounds, NADE_DT);
  check('off an edge it answers with a plane (the box hull: up), not a rounded normal', near(g.vx, 0, 1e-6) && g.vy > 0, 'v ' + f2(g.vx) + ', ' + f2(g.vy)); }
// 7 · CS2's window panes: a see-through box 0.5 thick, 84 × 68 (nuke_window_84x68's size) is found (its box) and left
//     out of the grenades' copy of the triangles, the file's own untouched; a grenade clip box 1.0 thick of the same size,
//     and a solid 0.5 one, stay. On the user's Nuke and Anubis (if present) they become breakable glass panes (cs2-map.js).
{ const W = meshOf((T, see) => { box(T, see, [0, 0, 0], [.5, 68, 84], 0); box(T, see, [200, 0, 0], [201, 68, 84], 0); box(T, see, [400, 0, 0], [400.5, 68, 84], 1); }), wp = windowPanes(W.raw), o = new Float64Array(4);
  const C = wp && createNadeMesh({ ...W.raw, tri: wp.tri }), b0 = wp?.boxes[0] || [];
  check('CS2\'s window panes (thin see-through boxes) are found, and left out of the grenades\' copy', wp?.boxes.length === 1 && near(b0[3] - b0[0], .5, .2) && near(b0[4] - b0[1], 68, .2) && near(b0[5] - b0[2], 84, .2) && !C.contact(-1, 30, 40, 2, o) && !C.contact(.25, 30, 40, 2, o) && W.contact(.25, 30, 40, 2, o), 'boxes ' + JSON.stringify(wp?.boxes));
  check('…a grenade clip box 1 unit thick and a solid pane stay', C.contact(199, 30, 40, 2, o) && C.contact(399, 30, 40, 2, o));
  const got = {}; for (const id of ['nuke', 'anubis']) { const f = new URL('../user-maps/' + id + '.bsp', import.meta.url); if (!existsSync(f)) continue; const P = parseCs2Map(readFileSync(f)), ws = P.entities.filter(e => e.window);
    got[id] = ws.length + (ws.every(e => e.pane && e.classname === 'func_breakable') ? '' : ' (not all breakable panes)'); }
  check('…on the user\'s CS2 maps they become breakable glass panes (Nuke 8, Anubis 15)', String(got.nuke ?? 8) === '8' && String(got.anubis ?? 15) === '15', JSON.stringify(got)); }
// 7b · glass: a breakable pane breaks and the grenade flies on at 0.4 of its velocity (Source's breakthrough); a CS2
//      window prop's pane breaks and it flies on unslowed (FITTED to CS2's lineups through them).
for (const win of [false, true]) { const pane = { minX: 5, maxX: 5.3, minZ: -5, maxZ: 5, y0: 0, y1: 20, mat: 'glass', mover: 3, off: false, win }, bx = [pane]; bx.movers = [pane]; bx.nadeSolid = () => false;
  const g = { kind: 'he', x: 0, y: 9, z: 0, vx: 60, vy: 6, vz: 3, grav: 1e-9, still: 0 }; for (let i = 0; i < 8 && !g.glass; i++) stepNade(g, bx, null, NADE_DT);
  const k = win ? 1 : .4; check(win ? '…a CS2 window prop\'s pane breaks and it flies on unslowed' : 'a breakable glass pane breaks and the grenade flies on at 0.4 of its velocity (Source)', pane.off && g.glass?.[0] === 3 && near(g.vx, 60 * k, 1e-6) && near(g.vz, 3 * k, 1e-6) && near(g.vy, 6 * k, 1e-3), f2(g.vx) + ', ' + f2(g.vy) + ', ' + f2(g.vz)); }
// 8 · the smoke's pop: once at rest, not before the 1.5 s fuse — where it rests; one that rests later goes off then.
{ const a = simThrow('smoke', { x: 0, y: 3, z: 0, dx: 0, dy: -1, dz: 0, strength: 'short' }, boxes, bounds, 20000), b = simThrow('smoke', { x: -200, y: 60, z: 0, dx: 1, dy: .3, dz: 0, strength: 'long' }, boxes, bounds, 20000);
  check('a smoke at rest early goes off at its 1.5 s fuse, lying where it rests', a.off && a.rest && a.n === Math.ceil(NADES.smoke.fuse / NADE_MS - 1e-9) && near(a.y, R, .02), 'step ' + a.n + ' (' + (a.n * NADE_MS / 1000).toFixed(3) + ' s), y ' + a.y.toFixed(3));
  let restN = 0; const c = simThrow('smoke', { x: -200, y: 60, z: 0, dx: 1, dy: .3, dz: 0, strength: 'long' }, boxes, bounds, 20000, q => { if (q.rest && !restN) restN = q.n; });
  check('…one that bounces on goes off the step it rests (ours — Source re-checks on its 0.2 s think: notCS2)', b.off && b.rest && b.n * NADE_MS > NADES.smoke.fuse && c.n === b.n && b.n === restN, 'rests and goes off at step ' + b.n + ' (' + (b.n * NADE_MS / 1000).toFixed(2) + ' s)'); }
console.log((fail ? 'FAIL' : 'PASS') + ': grenade bounce, roll and rest (Source rules, CS2\'s window layer) · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
