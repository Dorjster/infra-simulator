// Lag compensation (lag-comp.js): the host judges a hit where the shooter saw the target. The pose history plays a
// player back between their poses on their own clock, keeps a second, never reaches back further than MAX_UNLAG behind
// the newest pose and starts over when a clock restarts; and in a match, a target that ran behind a wall after the
// shooter fired is still hit (the moment seen), not refused as "blocked" — while a moment older than the limit buys
// nothing, and a shot at someone who was behind the wall all along is still refused.
import assert from 'node:assert/strict';
import { createPoseHistory, rewound, MAX_UNLAG } from '../dist/lag-comp.js';
import { startArena, arenaApply } from '../dist/arena-logic.js';
import { combatApply, lineOfFire } from '../dist/combat-logic.js';
import { ARENA_MAPS, mapBoxes } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + d : '')); };

// ── The history ──
{ const h = createPoseHistory(); for (let s = 0; s <= 1500; s += 50) h.record('p', s, { x: s / 10, y: 9.7, z: 0, yaw: s < 750 ? 3.1 : -3.1, crouched: s >= 1000 });
  ok('between two poses: in between', Math.abs(h.at('p', 1225).x - 122.5) < 1e-9, h.at('p', 1225).x);
  ok('a moment ahead of the newest pose: the newest', h.at('p', 9999).x === 150);
  ok('older than MAX_UNLAG behind the newest: held at the limit', Math.abs(h.at('p', 0).x - (1500 - MAX_UNLAG) / 10) < 1e-9, h.at('p', 0).x);
  ok('no moment: the newest', h.at('p', undefined).x === 150 && h.at('p', NaN).x === 150);
  { const q = createPoseHistory(); q.record('y', 0, { x: 0, y: 0, z: 0, yaw: 3.1 }); q.record('y', 100, { x: 0, y: 0, z: 0, yaw: -3.1 }); const m = q.at('y', 50).yaw;
    ok('turning through ±π takes the short way', Math.abs(Math.abs(m) - Math.PI) < .02, m); }
  ok('kept about a second', h.at('p', 1500 - 999, 5000).x >= 49 && h.at('p', 0, 5000).x >= 45, h.at('p', 0, 5000).x);
  ok('crouching goes with the nearer pose', h.at('p', 1010, 5000).crouched && !h.at('p', 940, 5000).crouched);
  h.record('p', 1500, { x: -1, y: 0, z: 0, yaw: 0 }); ok('a repeated moment is ignored', h.at('p', 1500).x === 150);
  h.record('p', 9000, { x: 9, y: 9.7, z: 0, yaw: 0 }); h.record('p', 20, { x: 7, y: 9.7, z: 0, yaw: 0 }); ok('a restarted clock (more than 5 s back) starts over', h.at('p', 20).x === 7);
  h.forget('p'); ok('a player who left: no history', h.at('p', 20) === null);
  const R = [{ id: 'a', pose: { x: 0, y: 9.7, z: 0, yaw: 0, gun: true } }, { id: 'b', pose: { x: 5, y: 9.7, z: 5, yaw: 0, gun: true } }], H = createPoseHistory();
  for (let s = 0; s <= 300; s += 30) { H.record('b', s, { x: s, y: 9.7, z: 0, yaw: 0 }); H.record('a', 5000 + s, { x: -s, y: 9.7, z: 0, yaw: 0 }); }
  const rw = rewound(H, R, { type: 'hit', target: 'b', seen: 120, ct: 5150 }, 'a');
  ok('rewound: the target where seen, the shooter where it fired, the rest of the pose kept', rw[1].pose.x === 120 && rw[0].pose.x === -150 && rw[1].pose.gun && R[1].pose.x === 5, JSON.stringify(rw.map(p => p.pose.x)));
  ok('not a hit: unchanged', rewound(H, R, { type: 'loadout' }, 'a') === R); }

// ── In a match: a target who ran behind a wall ──
const t = 3e9, g = { levels: {} }; startArena(g, { map: 'yard', bots: 0 }, t);
const boxes = mapBoxes(ARENA_MAPS.yard, ARENA.cx, ARENA.cz);
const wall = boxes.find(b => b.y1 - b.y0 >= 12 && b.y0 === 0 && b.maxX - b.minX > 10 && b.maxZ - b.minZ > 10);
const a = { x: wall.minX - 3, y: 9.7, z: (wall.minZ + wall.maxZ) / 2, yaw: 0 }, hidden = { x: wall.maxX + 3, y: 9.7, z: a.z, yaw: 0 };
// In the open: past the wall's side (north or south), in line of fire from the shooter.
let open = null; for (let d = 2; d < 60 && !open; d += 1) for (let x = wall.maxX + 3; x >= wall.minX - 6 && !open; x -= 2) for (const z of [wall.maxZ + d, wall.minZ - d]) { const q = { x, y: 9.7, z, yaw: 0 }; if (!open && lineOfFire(g, a, q, 'chest') === 1 && lineOfFire(g, a, q, 'head') === 1 && !boxes.some(b => q.x > b.minX - 2 && q.x < b.maxX + 2 && q.z > b.minZ - 2 && q.z < b.maxZ + 2)) open = q; }
ok('a spot in the open past the wall', !!open && lineOfFire(g, a, hidden, 'chest') === 0, JSON.stringify(open));
const P = [{ id: 'a', name: 'Ann', pose: a }, { id: 'b', name: 'Bo', pose: hidden }];
arenaApply(g, { type: 'loadout', primary: 'm4' }, 'Ann', P, t);
// The target's poses (its clock: 0…990 ms) for each case; the shooter stands still (its own clock).
const hist = openUntil => { const H = createPoseHistory(); for (let s = 0; s <= 1000; s += 33) { H.record('b', s, s < openUntil ? open : hidden); H.record('a', s + 50000, a); } return H; };
let k = 0; const shot = (H, extra) => { k++; return combatApply(g, { type: 'hit', target: 'b', weapon: 'm4', zone: 'chest', n: k, ...extra }, 'Ann', rewound(H, P, { type: 'hit', target: 'b', ...extra }, 'a'), 'a', t + 1000 + k * 200); };
assert.throws(() => shot(hist(800), {}), /wall/); n++;   // no moment given: judged where the host has the target now
const r = shot(hist(800), { seen: 760, ct: 50900 }); ok('ran behind the wall just after the shot: hit where it was seen', r && r.dmg > 0, JSON.stringify(r));
assert.throws(() => shot(hist(300), { seen: 100 }), /wall/); n++;   // behind the wall for 700 ms: a moment older than the limit (400) buys nothing
assert.throws(() => shot(hist(-1), { seen: 900 }), /wall/); n++;    // behind the wall all along
console.log('PASS: lag compensation · ' + n + ' checks (history, limit, clock restart; in a match: hit where seen, too old and always hidden refused)');
