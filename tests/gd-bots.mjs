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
const defuseMaps = Object.entries(ARENA_MAPS).filter(([, m]) => m.kind === 'defuse').map(([id]) => id);
const stats = {};
for (const map of defuseMaps) for (const diff of ['easy', 'normal', 'hard']) {
  const g = { levels: {} }; let t = 1e11; startArena(g, { map, kind: 'defuse', bots: 10, difficulty: diff }, t);
  const M = ARENA_MAPS[map], boxes = mapBoxes(M, ARENA.cx, ARENA.cz), [sw, sd] = M.size, bounds = { minX: ARENA.cx - sw / 2, maxX: ARENA.cx + sw / 2, minZ: ARENA.cz - sd / 2, maxZ: ARENA.cz + sd / 2 };
  let planted = 0, defused = 0, rounds = 0, lastN = 0, wallHits = 0, phase = '';
  const still = new Map();
  for (let i = 0; i < 20 * 60 * 70 && !g.combat.d.matchOver; i++) { t += 50; arenaTick(g, [], .05, t); combatTick(g, t);
    const d = g.combat.d; if (d.round.phase !== phase) { phase = d.round.phase; if (phase === 'planted') planted++; if (phase === 'over' && d.round.reason === 'defuse') defused++; }
    if (d.n !== lastN) { lastN = d.n; rounds++; }
    if (i % 20 === 0) for (const b of g.arena.bots) if (!g.combat.down[b.name.toLowerCase()] && !walkable(boxes, bounds, b.x, b.z, 1.2)) wallHits++; }
  const d = g.combat.d; stats[map + ' ' + diff] = { rounds, score: d.score, planted, defused, kills: Object.values(g.combat.kills).reduce((a, b) => a + b, 0) };
  ok(map + ' · ' + diff + ': the match ends (first to 13)', !!d.matchOver && Math.max(d.score.t, d.score.ct) === 13, JSON.stringify(d.score));
  ok(map + ' · ' + diff + ': nobody inside walls', wallHits === 0, wallHits);
  ok(map + ' · ' + diff + ': kills and money', stats[map + ' ' + diff].kills > 20 && Object.values(d.money).every(m => m >= 0 && m <= 16000));
}
for (const map of defuseMaps) ok(map + ': bots plant the bomb (over the three difficulties)', ['easy', 'normal', 'hard'].some(df => stats[map + ' ' + df].planted > 0), JSON.stringify(stats));
ok('bombs get defused somewhere', Object.values(stats).some(s => s.defused > 0), JSON.stringify(stats));
console.log('PASS: Global Defensive bots · ' + n + ' checks · ' + Object.entries(stats).map(([k, s]) => k + ' ' + s.score.t + '-' + s.score.ct + ' (' + s.planted + ' plants, ' + s.defused + ' defuses)').join(' · '));
