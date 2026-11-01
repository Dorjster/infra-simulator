// Where CS2's player walks, ours walks (the v52 "Nuke B site is not walkable" report). Checked against the map files'
// own collision (user-maps/<id>.bsp, CS2's player and bullet layers; skipped without them, so CI passes):
//   glass floors — no players' stretch rising a body's height from a flat window where bullets pass (the importer's "floor
//                  over nothing" fill under a glass floor: Nuke's B was pillars from its floor to its ceiling over a third
//                  of the site; cs2-map.js glassFloorFix rebuilds those lines on load), on every map;
//   Nuke's B     — the body stands on B's glass floor and walks straight across it both ways, the bots' B goal is in the
//                  middle of the site (it was pushed into the corner under the walkway) and their B routes end there;
//   Nuke's walkway over B — CS2 parity the other way: its end is railed by CS2's player clips (14 HU of gap, CS2's hull is
//                  32), so walking off it onto B stalls (as in CS2) and a jump gets over.
// The sweep behind it (CS2's real player triangles, a 32×32 hull, flooded from the spawns against our body on all eight
// maps) is scratchpad tooling — the CS2 export isn't in the repo; this keeps its findings.
//   node tests/gd-cs2-passages.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const AM = await import(REPO + '/dist/arena-maps.js'), MV = await import(REPO + '/dist/arena-move.js'), { parseCs2Map } = await import(REPO + '/dist/cs2-map.js');
const MAPS = ['nuke', 'ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'overpass'];   // (Nuke first: the report's map)
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const file = id => { const f = REPO + '/user-maps/' + id + '.bsp'; if (!existsSync(f)) return null; const b = readFileSync(f); return b.subarray(0, 4).toString() === 'CS2M' ? b : null; };
const have = MAPS.filter(file);
if (!have.length) { console.log('SKIP: Global Defensive CS2 passages · no CS2 map files in user-maps'); process.exit(0); }

// ── glass floors: the fill's signature, on every map file ──
for (const id of have) { const raw = parseCs2Map(file(id)); if (!raw.bulletSpans) continue; let lines = 0, at = null;
  for (const e of raw.entities) { if (!e.pane || !e.model) continue; const m = raw.models[+e.model.slice(1)]; if (!m) continue; const [x0, y0, z0] = m.mins, [x1, y1, z1] = m.maxs; if (z1 - z0 > 2 || x1 - x0 < 12 || y1 - y0 < 12) continue;
    for (let x = Math.ceil((x0 - 4) / 8) * 8 + 4; x <= x1; x += 8) for (let y = Math.ceil((y0 - 4) / 8) * 8 + 4; y <= y1; y += 8)
      for (const [b, t] of raw.solidSpans(0, x, y, z1 - 1, z1 + 4000)) if (Math.abs(b - z1) <= 1 && t - b >= 54 && !raw.bulletSpans(x, y, z1 + 1, z1 + 54).length) { lines++; at ??= [x, y, b, t]; } }
  ok(id + ': no glass floor filled solid (a players\' stretch rising from a flat window where bullets pass)', lines === 0, lines + ' lines, first ' + JSON.stringify(at)); }

// ── Nuke ──
if (have.includes('nuke')) {
  AM.useMapFile('nuke', file('nuke')); const M = AM.ARENA_MAPS.nuke, Hm = M.hammer, [W, D] = M.size, boxes = AM.mapBoxes(M, 0, 0);
  for (const b of boxes.movers || []) b.off = b.mat === 'door' ? true : b.role !== 'shut';   // (doors open, windows whole: B's floor windows are walked on)
  const world = { boxes, bounds: { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 }, ladders: [], others: [] };
  const G = (hx, hy) => [(hx - Hm.x0) * Hm.U - W / 2, (Hm.y1 - hy) * Hm.U - D / 2], gy = hz => (hz - Hm.zLow) * Hm.U, toH = (x, z, y) => [(x + W / 2) / Hm.U + Hm.x0, Hm.y1 - (z + D / 2) / Hm.U, y / Hm.U + Hm.zLow];
  // B's glass floor (Hammer x 323…872, y −1084…−702, z −772): a standing body fits nearly everywhere (CS2's hull fits all of it).
  let spots = 0, stand = 0; const bad = [];
  for (let hx = 340; hx <= 860; hx += 40) for (let hy = -1065; hy <= -715; hy += 35) { const [x, z] = G(hx, hy), g = MV.groundAt(boxes, x, z, gy(-760)); spots++;
    if (Math.abs(toH(0, 0, g)[2] + 768) < 8 && !MV.blocked(boxes, null, x, z, g)) stand++;   /* (B's floor: −773 on the windows' clip, −764…−768 round them) */ else if (bad.length < 4) bad.push([hx, hy]); }
  ok('Nuke B: a body stands on B\'s glass floor (≥ 95% of a 40-unit grid over it)', stand >= .95 * spots, stand + '/' + spots + ' · e.g. ' + JSON.stringify(bad));
  // Straight walks across B, both ways (knife, 128 Hz): each covers its whole length on B's floor.
  for (const [name, a, b] of [['west → east', [345, -900], [855, -900]], ['north → south', [600, -715], [600, -1065]], ['north-west → south-east', [360, -730], [840, -1050]], ['east → west', [855, -760], [345, -760]]]) {
    const [ax, az] = G(...a), [bx, bz] = G(...b), L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, s = MV.createMoveState(gy(-772)); s.x = ax; s.z = az;
    let t = 0; for (; t < 128 * 12 && Math.hypot(s.x - ax, s.z - az) < L - .5; t++) MV.moveStep(s, { wish: [dx, dz], look: [dx, dz], weapon: 'knife' }, world, 1 / 128);
    const got = Math.hypot(s.x - ax, s.z - az) / L, h = toH(s.x, s.z, s.y);
    ok('Nuke B: walking ' + name + ' across B gets there', got > .97 && Math.abs(h[2] + 768) < 10, (got * 100).toFixed(0) + '% in ' + (t / 128).toFixed(1) + ' s, stopped at ' + h.map(Math.round).join(',')); }
  // The bots' B goal: the middle of the site, on its floor (it was in the corner under the walkway's end, 408,−1256).
  const goal = toH(M.siteGoals.B[0], M.siteGoals.B[1], M.siteGoals.B[2] ?? 0);
  ok('Nuke B: the bots\' B goal is on B\'s glass floor, not in a corner', goal[0] > 340 && goal[0] < 860 && goal[1] > -1080 && goal[1] < -705 && Math.abs(goal[2] + 768) < 10, goal.map(Math.round).join(','));
  for (const team of ['t', 'ct']) { const p = M.routes[team].B, e = p[p.length - 1], h = toH(e[0], e[1], e[2] ?? 0);
    ok('Nuke B: the ' + team + ' bots\' route to B ends on B', p.length > 0 && Math.hypot(h[0] - goal[0], h[1] - goal[1]) < 24 && Math.abs(h[2] + 768) < 10, h.map(Math.round).join(',')); }
  // The walkway's end (Hammer 360, −1262 at −633): CS2's clips rail it — walking off toward B (east, north-east) stays up there.
  { const run = (hx, hy, dir, jump) => { const [x0, z0] = G(hx, hy), s = MV.createMoveState(gy(-633)); s.x = x0; s.z = z0; const L = Math.hypot(...dir), d = [dir[0] / L, dir[1] / L];
      for (let t = 0; t < 128 * 3; t++) MV.moveStep(s, { wish: d, look: d, weapon: 'knife', jump: jump && t >= 10 && t < 18 }, world, 1 / 128); return toH(s.x, s.z, s.y); };
    for (const [name, dir] of [['east', [1, 0]], ['north-east', [1, -1]]]) { const h = run(366, -1262, dir, false); ok('Nuke walkway over B: walking ' + name + ' off its end stays on it (CS2\'s rails: a jump, not a walk)', h[2] > -660, h.map(Math.round).join(',')); }
    const h = run(350, -1200, [1, 0], true); ok('Nuke walkway over B: a jump east over its rail gets down onto B', h[2] < -740, h.map(Math.round).join(',')); }
}
console.log('PASS: Global Defensive CS2 passages · ' + n + ' checks · maps ' + have.join(', '));
