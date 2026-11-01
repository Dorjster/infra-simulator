// Global Defensive spawns on every map (the built-in ones, then the CS2 map files on this computer): each side has
// spots for a full LAN team, no two closer than a body is wide (CS2: 32 units — nobody spawns in anybody), none in a
// box or (CS2 maps) in the map's own geometry, a CS2 map's spots its own (not the built-in map's of the same name),
// and a full round start — every bot and eight people — puts everyone on a spot of their own.
// v52: a CS2 map file's Defuse spots are CS2's competitive spawns — every spot of a team of 12 within 150 units of an
// enabled competitive spawn of that team (CS2's own list from the export on this computer when there is one, else the
// file's spawns), all of a team's spots within 1 200 units of each other, none in a bomb site (Nuke put a T in Secret
// and a CT by Ramp: Wingman's 2v2 spawns); the farthest spot per map is printed (VERBOSE); and the cs2Spawns rules.
//   node tests/gd-spawns.mjs
import { readFileSync, existsSync } from 'node:fs'; import os from 'node:os';
import { cs2Spawns } from '../dist/bsp-map.js'; import { SPAWN_PRIORITY } from '../dist/cs-maps/cs2-mode-props.js';
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
  slots(id, id + ' (CS2 file)'); roundStart(id, id + ' (CS2 file)'); competitive(id, id + ' (CS2 file)'); }
// CS2's competitive spawns (v52): the rules on made-up spawns (CI), then each map file's spots against CS2's own list.
{ const sp = (o, k = {}) => ({ classname: 'info_player_deathmatch', origin: o.join(' '), ...k }), base = [[0, 0, 0], [64, 0, 0], [128, 0, 0], [0, 64, 0], [64, 64, 0], [128, 64, 0]];
  const keyed = [...base.map((o, i) => sp(o, { enabled: 'true', priority: String(i < 3 ? 1 : 0), targetname: 'spawnpoints.standard' })), ...[[3000, 0, 0], [3064, 0, 0]].map(o => sp(o, { enabled: 'false', targetname: 'spawnpoints.2v2' }))];
  const a = cs2Spawns(keyed).map(e => e.origin);
  check('cs2Spawns: Wingman\'s disabled 2v2 spawns are no spawns; priority 0 first (CS2 fills it first)', a.length === 6 && !a.some(o => o.startsWith('30')) && a.slice(0, 3).every(o => / 64 0$/.test(o)), JSON.stringify(a));
  const old = cs2Spawns([...base.map(o => sp(o)), ...[[3000, 0, 0], [3064, 0, 0], [3000, 64, 0]].map(o => sp(o))]).map(e => e.origin);   // (a file from before v52: no keys)
  check('cs2Spawns: without keys, only the team\'s own spawn cluster (a set 3 000 units off is another mode\'s), its middle first', old.length === 6 && !old.some(o => o.startsWith('30')) && (old[0] === '64 0 0' || old[0] === '64 64 0'), JSON.stringify(old));
  check('cs2Spawns: a named Wingman / Retakes spawn is out even when enabled', cs2Spawns([...base.map(o => sp(o)), sp([16, 16, 0], { targetname: 'spawnpoints.retake' })]).length === 6);
  const kn = cs2Spawns(base.map(o => sp(o)), base.map((o, i) => [...o, i === 0 || i === 2 || i === 5 ? 0 : 1, 0])).map(e => e.origin);   // (no keys: the priorities from SPAWN_PRIORITY by origin)
  check('cs2Spawns: a file without priorities takes them from the table — priority 0 first', kn.slice(0, 3).sort().join() === ['0 0 0', '128 0 0', '128 64 0'].join(), JSON.stringify(kn)); }
// Each team's spots (a team of 12) within 150 units of one of CS2's competitive spawns of that team, all within 1 200 of
// each other, none in a bomb site.
function competitive(id, label) {
  const M = ARENA_MAPS[id], Hm = M.hammer; if (!Hm) return; const ef = os.homedir() + '/CS2-extract/export/' + id + '/ents.txt';
  const vec = s => (String(s || '').match(/-?[\d.]+(e-?\d+)?/g) || []).slice(0, 3).map(Number), truth = { t: [], ct: [] }, own = !existsSync(ef);
  if (!own) for (const b of readFileSync(ef, 'utf8').split(/\n====\d+====\n/)) { const kv = {}; for (const line of b.split('\n')) { const m = /^(\S+)\s+(.*)$/.exec(line.trim()); if (m && !(m[1].toLowerCase() in kv)) kv[m[1].toLowerCase()] = m[2].trim().replace(/^"(.*)"$/, '$1'); }
    const side = kv.classname === 'info_player_terrorist' ? 't' : kv.classname === 'info_player_counterterrorist' ? 'ct' : null; if (side && kv.enabled !== 'false' && !/2v2|retake|wingman/i.test(kv.targetname || '')) truth[side].push(vec(kv.origin)); }
  else { truth.t = M.t.map(([x, z]) => [(x + Hm.W / 2) / Hm.U + Hm.x0, Hm.y1 - (z + Hm.D / 2) / Hm.U]); truth.ct = M.ct.map(([x, z]) => [(x + Hm.W / 2) / Hm.U + Hm.x0, Hm.y1 - (z + Hm.D / 2) / Hm.U]); }
  for (const side of ['t', 'ct']) { const S = spawnSlots(M, side).slice(0, TEAM), H = S.map(([x, z]) => [(x + Hm.W / 2) / Hm.U + Hm.x0, Hm.y1 - (z + Hm.D / 2) / Hm.U]);
    let far = 0, span = 0; for (const p of H) { far = Math.max(far, Math.min(...truth[side].map(q => Math.hypot(p[0] - q[0], p[1] - q[1])))); for (const q of H) span = Math.max(span, Math.hypot(p[0] - q[0], p[1] - q[1])); }
    // (in a site only where CS2's own spawn is: Overpass's A bomb target takes in its CT spawn)
    const siteAt = (x, z, y) => M.nav.site(x, z, Number.isFinite(y) ? y : M.nav.floorAt(x, z)), gx = q => [(q[0] - Hm.x0) * Hm.U - Hm.W / 2, (Hm.y1 - q[1]) * Hm.U - Hm.D / 2];
    const inSite = S.filter(([x, z, y], i) => { const s = siteAt(x, z, y); if (!s) return false; const q = truth[side].reduce((a, b) => Math.hypot(H[i][0] - b[0], H[i][1] - b[1]) < Math.hypot(H[i][0] - a[0], H[i][1] - a[1]) ? b : a), [qx, qz] = gx(q); return siteAt(qx, qz, y) !== s; }).length;
    check(`${label} ${side}: a team of ${TEAM} spawns on CS2's competitive spawns (${own ? 'the file\'s' : 'CS2\'s list'}) — none in a site, none on mid`, S.length >= TEAM && far <= 150 && span <= 1200 && !inSite, `farthest ${far.toFixed(0)} units from one · team spread ${span.toFixed(0)} · ${inSite} in a bomb site`);
    // CS2 fills priority 0 first (the five of a 5v5 on all eight maps): the first five spots are those (cs2-mode-props.js
    // SPAWN_PRIORITY for files without the key — before: nearest the cluster's middle, priority 1 and 2 among them)
    const P = (SPAWN_PRIORITY[id] || []).filter(r => r[4] === (side === 't' ? 0 : 1)); if (!P.length) continue;
    const pr = H.slice(0, 5).map(p => { const r = P.find(r => Math.hypot(r[0] - p[0], r[1] - p[1]) < 4); return r ? r[3] : 'none'; });
    check(`${label} ${side}: the first five spots are CS2's priority-0 spawns (it fills those first)`, pr.length === 5 && pr.every(v => v === 0), 'priorities ' + pr.join(',')); }
}
console.log((fail ? 'FAIL' : 'PASS') + ': spawns · every map: room for a full team, nobody in anybody, nobody in a wall · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
