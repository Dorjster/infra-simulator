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
const AM = await import(REPO + '/dist/arena-maps.js'), MV = await import(REPO + '/dist/arena-move.js'), { parseCs2Map } = await import(REPO + '/dist/cs2-map.js'), { boxesNear } = await import(REPO + '/dist/box-grid.js');
const MAPS = ['nuke', 'ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'overpass'];   // (Nuke first: the report's map)
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const file = id => { const f = REPO + '/user-maps/' + id + '.bsp'; if (!existsSync(f)) return null; const b = readFileSync(f); return b.subarray(0, 4).toString() === 'CS2M' ? b : null; };
const have = MAPS.filter(file);
if (!have.length) { console.log('SKIP: Global Defensive CS2 passages · no CS2 map files in user-maps'); process.exit(0); }

// ── glass floors: the fill's signature, on every map file ──
for (const id of have) { const raw = parseCs2Map(file(id)); if (!raw.bulletSpans) continue; let lines = 0, at = null;
  for (const e of raw.entities) { if (!e.pane || !e.model || e.added) continue; const m = raw.models[+e.model.slice(1)];   /* (added: glass the importer made world — cs-maps/cs2-extra-panes.js; its collision is the world's) */ if (!m) continue; const [x0, y0, z0] = m.mins, [x1, y1, z1] = m.maxs; if (z1 - z0 > 2 || x1 - x0 < 12 || y1 - y0 < 12) continue;
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
  // Nuke's vents (the v52.0.1 report "in the vent when I jump, going void of the map"): their floor −608, their roof a
  // 4-unit slab at −526 (82 units of room) with a 4-unit trim at −596 along a wall — stood on, the head is 2 units into
  // the roof, and a jump went on up through it (arena-move.js ceilingIn only saw ceilings over the head), onto it and out
  // of the map. From every spot on the vents' floor (16-unit grid, grille broken), in eight directions, W held and jumping
  // every 0.3 s for 2.5 s: the feet stay between the floor and the roof (the shaft up to A aside, and the two drops onto
  // the covers over B — whole here — at the vents' ends).
  { const lad = (M.ladders || []).map(([a, b, c, d, y0, y1]) => ({ minX: a, maxX: b, minZ: c, maxZ: d, y0, y1 })), w2 = { ...world, ladders: lad };
    let tries = 0; const out = [];
    for (let hx = 430; hx <= 1000; hx += 16) for (let hy = -1500; hy <= -1356; hy += 16) { const [x, z] = G(hx, hy), g = MV.groundAt(boxes, x, z, gy(-590)); if (Math.abs(toH(0, 0, g)[2] + 604) > 9 || MV.blocked(boxes, null, x, z, g)) continue;
      for (let a = 0; a < 8; a++) { const d = [Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4)], s = MV.createMoveState(g); s.x = x; s.z = z; tries++;
        for (let t = 0; t < 320; t++) { MV.moveStep(s, { wish: d, look: d, weapon: 'knife', jump: t % 40 < 4 }, w2, 1 / 128); const p = toH(s.x, s.z, s.y);
          if ((p[2] > -560 && !(p[0] < 484 && p[1] > -1470)) || p[2] < -650 || (p[2] < -616 && !((p[0] > 580 && p[0] < 712 && p[1] < -1468) || (p[0] > 1040 && p[1] > -1420 && p[1] < -1300)))) { if (out.length < 4) out.push([hx, hy, a, t, ...p.map(Math.round)]); else out.length++; break; } } } }
    ok('Nuke vents: jumping everywhere in them (W held, 8 directions) stays inside — never up through their roof', tries > 400 && !out.length, tries + ' runs, ' + out.length + ' left the vents · e.g. ' + JSON.stringify(out.slice(0, 4))); }
}
// ── Low ceilings on every map: jumping never takes the body into or through a ceiling ──
// Floors with 72–120 units of room (vents, crawl spaces, under stairs, low rooms; the movement's own columns), ~300 a map:
// standing still and walking four ways, jumping every 0.3 s for 1.25 s. After every tick no solid may reach more than a
// step into the body (a step up onto a lip under a low roof leaves the head a few units in it, as CS2's own hull test
// allows nothing deeper). Before the fix Nuke's vents, Ancient's and Inferno's low rooms let the head through.
for (const id of have) { if (id !== 'nuke' || !AM.ARENA_MAPS.nuke?.columns) AM.useMapFile(id, file(id)); const M = AM.ARENA_MAPS[id], Hm = M.hammer, [W, D] = M.size, U = Hm.U, boxes = AM.mapBoxes(M, 0, 0);
  for (const b of boxes.movers || []) b.off = b.mat === 'door' ? true : b.role !== 'shut';
  const world = { boxes, bounds: { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 }, ladders: (M.ladders || []).map(([a, b, c, d, y0, y1]) => ({ minX: a, maxX: b, minZ: c, maxZ: d, y0, y1 })), others: [] };
  const G = M.columns.G, MAXF = G.z.length / (G.cols * G.rows), cand = [], R = boxes.bodyRadius ?? MV.MOVE.radius, st = MV.MOVE.step, NB = [];
  for (let i = 0; i < G.cols * G.rows; i++) for (let k = 0; k < G.n[i]; k++) { const h = G.z[i * MAXF + k], c = G.ceil[i * MAXF + k]; if (c - h >= 72 && c - h <= 120) cand.push([i, h]); }
  const every = Math.max(1, Math.floor(cand.length / 300)); let tries = 0; const bad = [];
  for (let q = 0; q < cand.length; q += every) { const [i, hf] = cand[q], hx = G.x0 + (i % G.cols + .5) * 16, hy = G.y1 - (((i / G.cols) | 0) + .5) * 16, x = (hx - Hm.x0) * U - W / 2, z = (Hm.y1 - hy) * U - D / 2, y0 = (hf - Hm.zLow) * U;
    if (MV.blocked(boxes, world.bounds, x, z, y0)) continue;
    for (let a = -1; a < 4; a++) { const d = a < 0 ? [0, 0] : [Math.cos(a * Math.PI / 2 + .3), Math.sin(a * Math.PI / 2 + .3)], s = MV.createMoveState(y0); s.x = x; s.z = z; tries++; let hit = null;
      for (let t = 0; t < 160 && !hit; t++) { MV.moveStep(s, { wish: d, look: a < 0 ? [1, 0] : d, weapon: 'knife', jump: t % 40 < 3 }, world, 1 / 128); const h = s.ducked ? MV.MOVE.duckHeight : MV.MOVE.height;
        for (const b of boxesNear(boxes, s.x - R, s.z - R, s.x + R, s.z + R, NB)) if (s.x > b.minX - R + .01 && s.x < b.maxX + R - .01 && s.z > b.minZ - R + .01 && s.z < b.maxZ + R - .01 && b.y1 > s.y + st + .01 && b.y0 < s.y + h - st - .01) { hit = [Math.round(hx), Math.round(hy), Math.round(hf), a, t, Math.round(s.y / U + Hm.zLow), Math.round(b.y0 / U + Hm.zLow), Math.round(b.y1 / U + Hm.zLow)]; break; } }
      if (hit) bad.push(hit); } }
  ok(id + ': jumping under low ceilings never takes the body into or through one', tries > 100 && !bad.length, tries + ' runs from ' + cand.length + ' low spots, ' + bad.length + ' went into a ceiling · e.g. ' + JSON.stringify(bad.slice(0, 3))); }
console.log('PASS: Global Defensive CS2 passages · ' + n + ' checks · maps ' + have.join(', '));
