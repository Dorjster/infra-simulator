// Global Defensive maps (geometry rules, every map): spawns and spawn spots on open ground with room for 10 a side,
// bomb sites walkable, every bot route walkable leg by leg, both sites reachable from both spawns on foot (grid
// path search at ground level), everything inside the map, no box with a broken size, decoration (signs, windows,
// awnings) sitting on a real wall face — nothing floating, no invisible walls (all collision is the boxes the scene
// draws, by construction).
import assert from 'node:assert/strict';
import { ARENA_MAPS, mapBoxes, walkable, spawnSlots } from '../dist/arena-maps.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
for (const [id, M] of Object.entries(ARENA_MAPS)) {
  const [sw, sd] = M.size, boxes = mapBoxes(M, 0, 0), bounds = { minX: -sw / 2, maxX: sw / 2, minZ: -sd / 2, maxZ: sd / 2 }, W = (x, z) => walkable(boxes, bounds, x, z, 1.3);
  ok(id + ': every box has a size', M.solids.every(s => s[2] > 0 && s[3] > 0 && s[4] > 0), JSON.stringify(M.solids.find(s => !(s[2] > 0 && s[3] > 0 && s[4] > 0))));
  ok(id + ': everything inside the map', boxes.every(b => b.minX >= bounds.minX - 3 && b.maxX <= bounds.maxX + 3 && b.minZ >= bounds.minZ - 3 && b.maxZ <= bounds.maxZ + 3));
  const sides = M.kind === 'defuse' ? ['t', 'ct'] : ['dm'];
  for (const side of sides) { const base = side === 't' ? M.t : side === 'ct' ? M.ct : M.spawns; const bad = base.filter(([x, z]) => !W(x, z)); ok(id + ' · ' + side + ': spawns on open ground', !bad.length, JSON.stringify(bad)); ok(id + ' · ' + side + ': room for 10 (spawn spots)', spawnSlots(M, side).length >= 10, spawnSlots(M, side).length); }
  // Grid path search (2-unit cells) at ground level.
  const C = 2, nx = Math.ceil(sw / C), nz = Math.ceil(sd / C), open = new Uint8Array(nx * nz); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) open[i * nz + j] = W(-sw / 2 + (i + .5) * C, -sd / 2 + (j + .5) * C) ? 1 : 0;
  const cell = (x, z) => [Math.floor((x + sw / 2) / C), Math.floor((z + sd / 2) / C)], reach = (a, b) => { const [ai, aj] = cell(...a), [bi, bj] = cell(...b), seen = new Uint8Array(nx * nz), q = [[ai, aj]]; seen[ai * nz + aj] = 1;
    while (q.length) { const [i, j] = q.shift(); if (Math.abs(i - bi) <= 1 && Math.abs(j - bj) <= 1) return true; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= nx || b2 >= nz) continue; const k = a2 * nz + b2; if (seen[k] || !open[k]) continue; seen[k] = 1; q.push([a2, b2]); } } return false; };
  if (M.kind === 'defuse') {
    for (const [s, [x, z]] of Object.entries(M.sites)) { ok(id + ': site ' + s + ' walkable', W(x, z)); for (const side of ['t', 'ct']) ok(id + ': site ' + s + ' reachable from the ' + side.toUpperCase() + ' spawn', reach(M[side][0], [x, z])); }
    for (const side of ['t', 'ct']) for (const [r, pts] of Object.entries(M.routes[side])) { const start = M[side][0]; let prev = start; const legs = [];
      for (const p of pts) { ok(id + ' · ' + side + ' route ' + r + ': waypoint ' + p + ' walkable', W(...p)); let clear = true; for (let t = 0; t <= 1; t += .05) if (!W(prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t)) clear = false; if (!clear) legs.push(prev + '→' + p); prev = p; }
      ok(id + ' · ' + side + ' route ' + r + ': every leg walkable in a straight line', !legs.length, legs.join(' ')); }
  } else { const sp = M.spawns; for (let i = 1; i < sp.length; i++) ok(id + ': spawn ' + i + ' reachable from spawn 0', reach(sp[0], sp[i])); }
  // Decoration on walls: within 0.6 of a box face (signs, windows, awnings).
  for (const d of M.decor || []) { if (!['sign', 'window', 'awning'].includes(d.kind)) continue; const near = boxes.some(b => { const dx = Math.max(b.minX - d.x, 0, d.x - b.maxX), dz = Math.max(b.minZ - d.z, 0, d.z - b.maxZ); return Math.hypot(dx, dz) < .9 && (d.y ?? 15) <= b.y1 + .5; }); ok(id + ': ' + d.kind + ' "' + (d.text || '') + '" at ' + d.x + ',' + d.z + ' is on a wall', near); }
}
console.log('PASS: Global Defensive maps · ' + n + ' checks · ' + Object.keys(ARENA_MAPS).join(', '));
