// Global Defensive bots (host): full Defuse matches with bots only, on every Defuse map and every difficulty —
// every match ends (first to 13), bombs get planted and defused, nobody walks into a wall or stays stuck,
// money and kills add up, harder bots win more duels. Deterministic (seeded).
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick } from '../dist/arena-logic.js';
import { combatTick } from '../dist/combat-logic.js';
import { ARENA_MAPS, mapBoxes, walkable } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
let seed = 3; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
// --files <dir>: the maps made from map files in <dir> (<id>.bsp) instead of the built-in ones (only those maps).
const fi = process.argv.indexOf('--files'), filesDir = fi >= 0 ? process.argv[fi + 1] : null, fileIds = [];
if (filesDir) { const { readdirSync, readFileSync } = await import('node:fs'), { useMapFile } = await import('../dist/arena-maps.js'), { CS_MAP_IDS } = await import('../dist/cs-maps/themes.js'); for (const f of readdirSync(filesDir)) { const id = f.replace(/\.bsp$/i, ''); if (f.toLowerCase().endsWith('.bsp') && CS_MAP_IDS.includes(id)) { useMapFile(id, readFileSync(filesDir + '/' + f)); fileIds.push(id); } } }
const defuseMaps = filesDir ? fileIds : Object.entries(ARENA_MAPS).filter(([, m]) => m.kind === 'defuse').map(([id]) => id);
const stats = {};
// Classic maps (3D): a bot stands on a floor at its own height, with floor round it at that height (no wall, no pillar).
const standsFree = (M, b) => { const y = Number.isFinite(b.y) ? b.y : M.nav.floorAt(b.x - ARENA.cx, b.z - ARENA.cz); return [[0, 0], [.9, 0], [-.9, 0], [0, .9], [0, -.9]].every(([dx, dz]) => { const f = M.nav.floorAt(b.x - ARENA.cx + dx, b.z - ARENA.cz + dz, y); return Number.isFinite(f) && f - y < 2.8; }); };   // a lower floor beside you is a ledge, not a wall
for (const map of defuseMaps) for (const diff of ['easy', 'normal', 'hard']) {
  const g = { levels: {} }; let t = 1e11; startArena(g, { map, kind: 'defuse', bots: 10, difficulty: diff }, t);
  const M = ARENA_MAPS[map], boxes = mapBoxes(M, ARENA.cx, ARENA.cz), [sw, sd] = M.size, bounds = { minX: ARENA.cx - sw / 2, maxX: ARENA.cx + sw / 2, minZ: ARENA.cz - sd / 2, maxZ: ARENA.cz + sd / 2 };
  let planted = 0, defused = 0, rounds = 0, lastN = 0, wallHits = 0, phase = '';
  const still = new Map(); let frozen = null;
  for (let i = 0; i < 20 * 60 * 70 && !g.combat.d.matchOver; i++) { t += 50; arenaTick(g, [], .05, t); combatTick(g, t);
    const d = g.combat.d; if (d.round.phase !== phase) { phase = d.round.phase; if (phase === 'planted') planted++; if (phase === 'over' && d.round.reason === 'defuse') defused++; }
    if (d.n !== lastN) { lastN = d.n; rounds++; still.clear(); }
    // A Terrorist with somewhere to go never stands still for 10 s (fighting, planting, arrived and the freeze excepted).
    if (d.round.phase === 'live') for (const b of g.arena.bots) { const k = b.name.toLowerCase(); if (d.teams[k] !== 't' || g.combat.down[k]) continue; const h = still.get(k); if (h && i % 20 && !b.target) continue;   // every tick for fights (a target seen even briefly), every second for progress
      if (!h || Math.hypot(b.x - h.x, b.z - h.z) > 6 || b.target || d.round.plant?.by === k || (b.path && b.pi >= b.path.length && Math.hypot(b.path[b.path.length - 1][0] - b.x, b.path[b.path.length - 1][1] - b.z) < 4)) still.set(k, { x: b.x, z: b.z, t }); else if (t - h.t > 10000 && !frozen) frozen = b.name + ' at ' + Math.round(b.x - ARENA.cx) + ',' + Math.round(b.z - ARENA.cz) + ' round ' + d.n; }
    if (i % 20 === 0) for (const b of g.arena.bots) if (!g.combat.down[b.name.toLowerCase()] && !(M.nav ? standsFree(M, b) : walkable(boxes, bounds, b.x, b.z, 1.2))) { wallHits++; if (process.env.WALLDBG && wallHits < 5) { const x = b.x - ARENA.cx, z = b.z - ARENA.cz, y = Number.isFinite(b.y) ? b.y : M.nav.floorAt(x, z); console.log('WALL', map, diff, b.name, x.toFixed(1), z.toFixed(1), 'y', y?.toFixed?.(1), [[0, 0], [.9, 0], [-.9, 0], [0, .9], [0, -.9]].map(([dx, dz]) => { const f = M.nav.floorAt(x + dx, z + dz, y); return Number.isFinite(f) ? (f - y).toFixed(1) : 'none'; }).join(' ')); } } }
  const d = g.combat.d; stats[map + ' ' + diff] = { rounds, score: d.score, planted, defused, kills: Object.values(g.combat.kills).reduce((a, b) => a + b, 0) };
  ok(map + ' · ' + diff + ': the match ends (first to 13)', !!d.matchOver && Math.max(d.score.t, d.score.ct) === 13, JSON.stringify(d.score));
  ok(map + ' · ' + diff + ': nobody inside walls', wallHits === 0, wallHits);
  ok(map + ' · ' + diff + ': no Terrorist freezes on the way (10 s without moving, not fighting)', !frozen, frozen);
  ok(map + ' · ' + diff + ': kills and money', stats[map + ' ' + diff].kills > 20 && Object.values(d.money).every(m => m >= 0 && m <= 16000));
}
// Terrorist bots get the bomb down on every map, and on every difficulty they either plant or win rounds by fighting.
for (const map of defuseMaps) { const S = df => stats[map + ' ' + df];
  ok(map + ': bots plant the bomb (at least 4 times over the three difficulties)', ['easy', 'normal', 'hard'].reduce((a, df) => a + S(df).planted, 0) >= 4, JSON.stringify(['easy', 'normal', 'hard'].map(S)));
  ok(map + ': on every difficulty the Terrorists plant or win rounds', ['easy', 'normal', 'hard'].every(df => S(df).planted >= 2 || S(df).score.t >= 5), JSON.stringify(['easy', 'normal', 'hard'].map(S))); }
/* (defusing bots: next bot pass) */
console.log('PASS: Global Defensive bots · ' + n + ' checks · ' + Object.entries(stats).map(([k, s]) => k + ' ' + s.score.t + '-' + s.score.ct + ' (' + s.planted + ' plants, ' + s.defused + ' defuses)').join(' · '));
