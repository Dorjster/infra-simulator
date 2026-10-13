// Global Defensive maps (geometry rules, every map): spawns and spawn spots on open ground with room for 10 a side,
// bomb sites walkable, every bot route walkable leg by leg, both sites reachable from both spawns on foot (grid
// path search at ground level), everything inside the map, no box with a broken size, decoration (signs, windows,
// awnings) sitting on a real wall face — nothing floating, no invisible walls (all collision is the boxes the scene
// draws, by construction).
import assert from 'node:assert/strict';
import { ARENA_MAPS, mapBoxes, walkable, spawnSlots, lineOfSight } from '../dist/arena-maps.js';
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
  // Fair starts: no opposing spawn spot sees another, nor does any spot either team reaches in its first 1.5 s of
  // running (knife speed) see the other team's early area — no instant spawn kills. And at least 280 units apart.
  if (M.kind === 'defuse') { const T = spawnSlots(M, 't'), CT = spawnSlots(M, 'ct'); let los = 0, sep = Infinity; for (const a of T) for (const b of CT) { sep = Math.min(sep, Math.hypot(a[0] - b[0], a[1] - b[1])); if (lineOfSight(boxes, a[0], a[1], b[0], b[1], 9.7)) los++; }
    ok(id + ': no line of sight between the two spawns', !los, los + ' pairs'); ok(id + ': spawns at least 280 units apart', sep >= 280, sep.toFixed(0));
    const Rr = 250 * 2.54 / 16.5 * 1.5, dist = from => { const D = new Float32Array(nx * nz).fill(Infinity), q = []; for (const [x, z] of from) { const [i, j] = cell(x, z), k = i * nz + j; if (open[k] && D[k] === Infinity) { D[k] = 0; q.push(k); } }
      for (let h = 0; h < q.length; h++) { const u = q[h], i = Math.floor(u / nz), j = u % nz; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= nx || b2 >= nz) continue; const v = a2 * nz + b2; if (!open[v] || D[v] !== Infinity) continue; D[v] = D[u] + C; q.push(v); } } return D; };
    const Dt = dist(T), Dc = dist(CT), early = d => { const out = []; for (let k = 0; k < nx * nz; k++) if (d[k] <= Rr) out.push([-sw / 2 + (Math.floor(k / nz) + .5) * C, -sd / 2 + (k % nz + .5) * C]); return out; }, Et = early(Dt), Ec = early(Dc);
    let seen = null; for (const a of Et) { for (const b of Ec) if (lineOfSight(boxes, a[0], a[1], b[0], b[1], 9.7)) { seen = [a, b]; break; } if (seen) break; }
    ok(id + ': no line of sight between the areas each team reaches in its first 1.5 s', !seen, JSON.stringify(seen)); }
  if (M.kind === 'defuse') {
    for (const [s, [x, z]] of Object.entries(M.sites)) { ok(id + ': site ' + s + ' walkable', W(x, z)); for (const side of ['t', 'ct']) ok(id + ': site ' + s + ' reachable from the ' + side.toUpperCase() + ' spawn', reach(M[side][0], [x, z])); }
    for (const side of ['t', 'ct']) for (const [r, pts] of Object.entries(M.routes[side])) { const start = M[side][0]; let prev = start; const legs = [];
      for (const p of pts) { ok(id + ' · ' + side + ' route ' + r + ': waypoint ' + p + ' walkable', W(...p)); let clear = true; for (let t = 0; t <= 1; t += .05) if (!W(prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t)) clear = false; if (!clear) legs.push(prev + '→' + p); prev = p; }
      ok(id + ' · ' + side + ' route ' + r + ': every leg walkable in a straight line', !legs.length, legs.join(' ')); }
  } else { const sp = M.spawns; for (let i = 1; i < sp.length; i++) ok(id + ': spawn ' + i + ' reachable from spawn 0', reach(sp[0], sp[i])); }
  // Decoration on walls: within 0.6 of a box face (signs, windows, awnings).
  for (const d of M.decor || []) { if (!['sign', 'window', 'awning'].includes(d.kind)) continue; const near = boxes.some(b => { const dx = Math.max(b.minX - d.x, 0, d.x - b.maxX), dz = Math.max(b.minZ - d.z, 0, d.z - b.maxZ); return Math.hypot(dx, dz) < .9 && (d.y ?? 15) <= b.y1 + .5; }); ok(id + ': ' + d.kind + ' "' + (d.text || '') + '" at ' + d.x + ',' + d.z + ' is on a wall', near); }
}
// Heights (grid maps): every floor can be walked to from both spawns without a ledge higher than a step (18 HU), the
// spawns are on the ground, and roofs leave head room above the floor.
{ const STEP = 18 * 2.54 / 16.5, HEAD = 72 * 2.54 / 16.5;
  for (const [id, M] of Object.entries(ARENA_MAPS)) { if (!M.grid?.heights) continue; const { cols, rows, cell, cells } = M.grid, W = cols * cell, D = rows * cell, X = c => -W / 2 + (c + .5) * cell, Z = r => -D / 2 + (r + .5) * cell, open = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && cells[r * cols + c] === 1;
    const reachFrom = ([sx, sz]) => { const c0 = Math.floor((sx + W / 2) / cell), r0 = Math.floor((sz + D / 2) / cell), seen = new Uint8Array(cols * rows), q = [[c0, r0]]; seen[r0 * cols + c0] = 1;
      while (q.length) { const [c, r] = q.pop(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cc = c + dc, rr = r + dr; if (!open(cc, rr) || seen[rr * cols + cc]) continue; const ex = (X(c) + X(cc)) / 2, ez = (Z(r) + Z(rr)) / 2, ha = M.floorAt(ex - dc * .05, ez - dr * .05), hb = M.floorAt(ex + dc * .05, ez + dr * .05);
          if (Math.abs(ha - hb) <= STEP + 1e-6 || hb < ha) { if (hb > ha + STEP + 1e-6) continue; seen[rr * cols + cc] = 1; q.push([cc, rr]); } } } return seen; };
    const fromT = reachFrom(M.t[0]), fromCT = reachFrom(M.ct[0]); let lost = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (open(c, r) && (!fromT[r * cols + c] || !fromCT[r * cols + c])) lost.push(c + ',' + r);
    ok(id + ': every floor reachable on foot from both spawns (no ledge above a step)', !lost.length, lost.slice(0, 12).join(' '));
    ok(id + ': spawns on the ground', [...M.t, ...M.ct].every(([x, z]) => M.floorAt(x, z) === 0));
    for (const [c0, r0, c1, r1, y] of M.grid.roofs) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (open(c, r)) { const top = M.floorAt(X(c) + cell * .45, Z(r)), top2 = M.floorAt(X(c) - cell * .45, Z(r)); if (y - Math.max(top, top2) < HEAD + 3) { ok(id + ': head room under the roof at ' + c + ',' + r, false, y + ' over ' + Math.max(top, top2)); } }
    ok(id + ': head room under every roof', true); } }
console.log('PASS: Global Defensive maps · ' + n + ' checks · ' + Object.keys(ARENA_MAPS).join(', '));
