// Global Defensive spawns on every map (the built-in ones, then the CS2 map files on this computer): each side has
// spots for a full LAN team, no two closer than a body is wide (CS2: 32 units — nobody spawns in anybody), none in a
// box or (CS2 maps) in the map's own geometry, a CS2 map's spots its own (not the built-in map's of the same name),
// and a full round start — every bot and eight people — puts everyone on a spot of their own.
//   node tests/gd-spawns.mjs
import { readFileSync, existsSync } from 'node:fs';
import { ARENA_MAPS, spawnSlots, mapBoxes, useMapFile, MAP_LIST } from '../dist/arena-maps.js';
import { blocked, groundAt } from '../dist/arena-move.js';
import { startArena, arenaTick, MAX_BOTS } from '../dist/arena-logic.js';
import { ARENA } from '../dist/facility-layout.js';
const HU = 2.54 / 16.5, BODY = 32 * HU, TEAM = 12, SAME_FLOOR = 6;
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; if (!ok || process.env.VERBOSE) console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' · ' + info : '')); };
const near = (a, b) => !(Number.isFinite(a[2]) && Number.isFinite(b[2]) && Math.abs(a[2] - b[2]) > SAME_FLOOR) && Math.hypot(a[0] - b[0], a[1] - b[1]) < BODY;
function slots(id, label) {
  const M = ARENA_MAPS[id], boxes = mapBoxes(M, 0, 0), [sw, sd] = M.size, bounds = { minX: -sw / 2, maxX: sw / 2, minZ: -sd / 2, maxZ: sd / 2 }, NM = boxes.nadeMesh;
  for (const side of ['t', 'ct', 'dm']) { if (!(side === 't' ? M.t : side === 'ct' ? M.ct : M.spawns)?.length) continue; const S = spawnSlots(M, side); let close = 0, stuck = 0, inMap = 0;
    for (let i = 0; i < S.length; i++) { const [x, z, y] = S[i], feet = Number.isFinite(y) ? y : groundAt(boxes, x, z, 1e4); if (blocked(boxes, bounds, x, z, feet + .05)) stuck++;
      if (NM && [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].some(([dx, dz]) => NM.blocked(x + dx, feet + 18 * HU, z + dz, x + dx, feet + 72 * HU, z + dz, true))) inMap++;
      for (let j = 0; j < i; j++) if (near(S[i], S[j])) close++; }
    check(`${label} ${side}: spots for a full team, none overlapping, none in a wall`, (side === 'dm' || S.length >= TEAM) && !close && !stuck && !inMap, `${S.length} spots · ${close} pairs closer than 32 units · ${stuck} in a box · ${inMap} in the map's geometry`); }
}
// A round start with every bot and eight people (a LAN room): where each one is put.
function roundStart(id, label) {
  let t = 7e9; const g = { levels: {} }; startArena(g, { map: id, kind: 'defuse', bots: MAX_BOTS }, t); const M = ARENA_MAPS[id];
  const people = Array.from({ length: 8 }, (_, i) => ({ name: 'P' + i, pose: { x: ARENA.cx + M.t[0][0], y: 9.7, z: ARENA.cz + M.t[0][1], yaw: 0 } }));
  for (let i = 0; i < 3; i++) { t += 50; arenaTick(g, people, .05, t); }
  const C = g.combat, at = [...people.map(p => C.spawnTo?.[p.name.toLowerCase()]).filter(Boolean).map(s => [s.x, s.z, s.y]), ...g.arena.bots.map(b => [b.x, b.z, b.y])];
  let close = 0; for (let i = 0; i < at.length; i++) for (let j = 0; j < i; j++) if (near(at[i], at[j])) close++;
  check(`${label}: a full round start (${MAX_BOTS} bots, 8 people) puts everyone on a spot of their own`, at.length === MAX_BOTS + 8 && !close, `${at.length} placed · ${close} pairs overlapping`);
}
const builtIn = MAP_LIST.filter(m => !m.fileOnly).map(m => m.id), defuse = MAP_LIST.filter(m => m.kind === 'defuse' && !m.fileOnly).map(m => m.id), before = {};
for (const id of builtIn) { slots(id, id); if (ARENA_MAPS[id].t?.length) before[id] = spawnSlots(ARENA_MAPS[id], 't'); }
for (const id of defuse) roundStart(id, id);
for (const id of ['dust2', 'mirage', 'inferno', 'nuke', 'cache', 'anubis', 'ancient', 'overpass']) { const f = 'user-maps/' + id + '.bsp'; if (!existsSync(f)) continue; useMapFile(id, readFileSync(f));
  if (before[id]) check(`${id} (CS2 file): its own spots, not the built-in map's`, spawnSlots(ARENA_MAPS[id], 't') !== before[id]);
  slots(id, id + ' (CS2 file)'); roundStart(id, id + ' (CS2 file)'); }
console.log((fail ? 'FAIL' : 'PASS') + ': spawns · every map: room for a full team, nobody in anybody, nobody in a wall · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
