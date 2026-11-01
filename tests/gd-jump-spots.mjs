// CS2 jumps on every CS2 map file (user-maps, converted on this computer; skips without them): every clean ledge of
// each map — a floor rising 30–90 HU onto a top two columns deep, a straight face (solid from the floor to the top at
// three depths and both sides, straight across 28 HU: no half-way step, no slanted edge), a clear run-up — is jumped at with the game's own movement and
// clock (arena-move.js), from four take-off distances, plainly and crouch-jumping (duck held from the tick after the
// take-off: CS2's in-air duck). CS2's rules: up to ~57 HU a plain jump gets on (sv_jump_impulse 301.993, sv_gravity 800
// → apex 57.0; a top 1 HU under it is grazed: ≤ 55 tested), 58–64 only a crouch-jump (the measured CS crouch-jump reach
// ~64–66 HU: ≥ 58 and ≤ 64 tested), 67 and up neither. Each map's report names a few of them by CS2's callouts (the
// nearest place) with their heights, as a list of known jump spots, one of each kind where the map has it.
// The heights are CS2's: each ledge's top in the collision the movement uses (boxes) is checked against the columns and
// against CS2's player physics itself (the file's player stretches: CS2's collision for players, player clips included,
// sampled every 8 HU at 0.5 HU) — within 1 HU; and against CS2's grenade triangles (the file's nadeMesh: no player
// clips) by a vertical ray — reported, ≥ 85 % within 4 HU (Dust II's curbs carry ~3 HU of player-only collision).
// Low ceilings: on spots with crouching room but not standing room (CS2's 54–72 HU: vents, under the car, the
// window's lintel), a crouched body that lets go of the duck stays down; walked out to standing room it stands up.
//   node tests/gd-jump-spots.mjs [--files user-maps] [map ids…]
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { parseCs2Map } from '../dist/cs2-map.js';
import { FILE_MAP_IDS } from '../dist/cs-maps/themes.js';
import { createMoveState, createMoveClock, moveTicks, pressJump, blocked, groundAt, MOVE, HU } from '../dist/arena-move.js';
import { ARENA } from '../dist/facility-layout.js';
import { MAXF, NONE } from '../dist/cs-columns.js';
import { boxesNear } from '../dist/box-grid.js';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const dir = opt('--files') || 'user-maps', only = argv;
if (!existsSync(dir)) { console.log('SKIP: no map files in ' + dir); process.exit(0); }
const files = readdirSync(dir).filter(f => f.endsWith('.bsp') && FILE_MAP_IDS.includes(f.replace(/\.bsp$/i, '')) && (!only.length || only.includes(f.replace(/\.bsp$/i, '')))).sort();
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const cx = ARENA.cx, cz = ARENA.cz, PLAIN = 55, CJ_LO = 58, CJ_HI = 64, NEVER = 67, BOX = [];
let maps = 0; const ALL = {};   // (JUMP_SPOTS_OUT=<file>: every ledge tested, as JSON — for pictures)
for (const f of files) { const id = f.replace(/\.bsp$/i, ''), buf = readFileSync(dir + '/' + f); if (buf.subarray(0, 4).toString() !== 'CS2M') continue;
  useMapFile(id, buf); const M = ARENA_MAPS[id], C = M.columns, G = C?.G; if (!G) continue; maps++;
  const boxes = mapBoxes(M, cx, cz); for (const b of boxes.movers || []) b.off = true;   // (doors open, panes broken: the map's own shapes)
  const [W, D] = M.size, world = { boxes, bounds: { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 }, ladders: [] };
  const X = c => cx - C.W / 2 + (c + .5) * C.cell, Z = r => cz - C.D / 2 + (r + .5) * C.cell, Y = h => (h - C.zLow) * C.U, toH = y => y / C.U + C.zLow;
  const floorNear = (i, h, tol) => { let b = NONE, d = tol; for (let k = 0; k < G.n[i]; k++) { const e = Math.abs(G.z[i * MAXF + k] - h); if (e <= d) { d = e; b = G.z[i * MAXF + k]; } } return b; };
  const ceilOf = (i, h) => { for (let k = 0; k < G.n[i]; k++) if (Math.abs(G.z[i * MAXF + k] - h) < .01) return G.ceil[i * MAXF + k]; return -Infinity; };
  const at = (x, z) => boxesNear(boxes, x - .01, z - .01, x + .01, z + .01, BOX).filter(b => !b.off && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
  // Solid from lo to hi at (x, z) (no gap: a straight face), and nothing over the run-up from lo to 130 HU up.
  const cover = (x, z, lo, hi) => { const L = at(x, z).filter(b => b.y1 > lo && b.y0 < hi).sort((a, b) => a.y0 - b.y0); let y = lo; for (const b of L) { if (b.y0 > y + .05) return false; y = Math.max(y, b.y1); } return y >= hi - .05; };
  const topAt = (x, z, lo, hi) => { let t = -Infinity; for (const b of at(x, z)) if (b.y1 > lo && b.y1 < hi) t = Math.max(t, b.y1); return t; };
  const clear = (x, z, lo, hi) => !boxesNear(boxes, x - 1, z - 1, x + 1, z + 1, BOX).some(b => !b.off && x > b.minX - .9 && x < b.maxX + .9 && z > b.minZ - .9 && z < b.maxZ + .9 && b.y1 > lo + .05 && b.y0 < hi);
  // CS2's triangle top at (x, z) between lo and hi (game units): the highest height a downward ray from hi first hits.
  const NM = boxes.nadeMesh, meshTop = (x, z, lo, hi) => { if (!NM || !NM.blocked(x, hi, z, x, lo, z)) return NaN; let a = lo, b = hi; for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (NM.blocked(x, hi, z, x, m, z)) a = m; else b = m; } return (a + b) / 2; };
  const callout = (x, z) => { let best = '', bd = Infinity; for (const c of M.callouts || []) { const d = Math.hypot(c.x - (x - cx), c.z - (z - cz)); if (d < bd) { bd = d; best = c.name; } } return best; };
  const jump = (c, r, dc, dr, f, top, crouch) => { const face = { x: X(c) + dc * C.cell / 2, z: Z(r) + dr * C.cell / 2 };
    for (const d of [.05, .3, .8, 1.5]) { const s = createMoveState(Y(f)); s.x = X(c) - dc * C.cell * 2.5; s.z = Z(r) - dr * C.cell * 2.5; const clk = createMoveClock(), inp = { wish: [dc, dr], weapon: 'knife', duck: false }; let jumped = false, t = 0;
      for (let k = 0; k < 128 * 1.6; k++) { if (!jumped && (face.x - s.x) * dc + (face.z - s.z) * dr <= MOVE.radius + d) { jumped = true; t = k; pressJump(clk, NaN); }
        inp.duck = crouch && jumped && k > t; moveTicks(s, clk, inp, world, 1 / 128);
        if (jumped && s.onGround && Math.abs(s.y - Y(top)) < 2.5 * HU && (s.x - face.x) * dc + (s.z - face.z) * dr > 0) return true; } }
    return false; };
  const res = [], heights = { n: 0, box: 0, cs2: 0, mesh: 0, mesh2: 0, meshN: 0 }, raw = parseCs2Map(buf), HM = M.hammer;
  // CS2's player collision top at (x, z) within [lo, hi] (Hammer units): the highest stretch top of the 2×2 samples round it.
  const cs2Top = (x, z, lo, hi) => { const hx = (x - cx + HM.W / 2) / HM.U + HM.x0, hy = HM.y1 - (z - cz + HM.D / 2) / HM.U; let t = -Infinity; for (const ox of [-4, 4]) for (const oy of [-4, 4]) for (const [, top] of raw.solidSpans(0, hx + ox, hy + oy, lo - 40, hi)) if (top >= lo && top <= hi) t = Math.max(t, top); return t; };
  for (let r = 4; r < G.rows - 4; r++) for (let c = 4; c < G.cols - 4; c++) { const i = r * G.cols + c;
    for (let k = 0; k < G.n[i]; k++) { const f = G.z[i * MAXF + k]; if (G.ceil[i * MAXF + k] - f < 72 + 70) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = i + dc + dr * G.cols;
        let top = NONE; for (let q = 0; q < G.n[j]; q++) { const h = G.z[j * MAXF + q], rise = h - f; if (rise >= 30 && rise <= 90 && G.ceil[j * MAXF + q] - h >= 54) { top = h; break; } } if (top === NONE) continue;
        const rise = top - f; if (rise > PLAIN && rise < CJ_LO || rise > CJ_HI && rise < NEVER) continue;   // (within a HU or two of a limit: tick and edge grazes decide — not tested)
        let good = true; for (const s of [2, 3]) { const jj = i + dc * s + dr * s * G.cols, h = floorNear(jj, top, 2); if (h === NONE || ceilOf(jj, h) - h < 72) good = false; }
        for (const s of [1, 2, 3]) { const ii = i - dc * s - dr * s * G.cols, h = floorNear(ii, f, 1); if (h === NONE || ceilOf(ii, h) - h < 72 + 70) good = false; }
        for (const sd of [-1, 1]) { const ii = i + dr * sd + dc * sd * G.cols, jj = j + dr * sd + dc * sd * G.cols; if (floorNear(ii, f, 1) === NONE || floorNear(jj, top, 2) === NONE) good = false; }
        if (!good) continue;
        const fy = Y(f), ty = Y(top), u = C.cell / 16;   // (u: one HU of the column grid, game units)
        for (const [al, sd] of [[2, -14], [2, 14], [2, -6], [2, 0], [2, 6], [8, -6], [8, 0], [8, 6], [14, -6], [14, 0], [14, 6]]) if (good && !cover(X(c) + dc * (8 + al) * u + dr * sd * u, Z(r) + dr * (8 + al) * u + dc * sd * u, fy + .1, ty - .1)) good = false;
        if (!good || !clear(X(c), Z(r), fy, fy + 130 * HU) || !clear(X(c - dc), Z(r - dr), fy, fy + 130 * HU)) continue;
        // Heights: the top the movement stands on, the columns' and CS2's triangles' (centre of the top's first column).
        const tx = X(c + dc), tz = Z(r + dr), bt = topAt(tx, tz, fy + .1, ty + 3 * HU), mt = meshTop(tx, tz, ty - 4 * HU, ty + 4 * HU);
        heights.n++; if (Math.abs(toH(bt) - top) <= 1) heights.box++; if (Math.abs(cs2Top(tx, tz, top - 6, top + 6) - toH(bt)) <= 1) heights.cs2++; if (mt === mt) { heights.meshN++; const e = Math.abs(toH(mt) - toH(bt)); if (e <= 4) heights.mesh++; if (e <= 2) heights.mesh2++; } if (process.env.DEBUG_H && mt === mt && Math.abs(toH(mt) - toH(bt)) > 2) console.log('  height', id, c, r, 'box', toH(bt).toFixed(1), 'col', top, 'mesh', toH(mt).toFixed(1));
        const plain = jump(c, r, dc, dr, f, top, false), cj = jump(c, r, dc, dr, f, top, true);
        const kind = rise <= PLAIN ? 'plain' : rise <= CJ_HI ? 'crouch-jump only' : 'impossible', want = kind === 'plain' ? [true, true] : kind === 'impossible' ? [false, false] : [false, true];
        res.push({ c, r, dc, dr, f, top, kind, rise, plain, cj, bad: plain !== want[0] || cj !== want[1], place: callout(X(c), Z(r)), hammer: M.hammer ? [Math.round((X(c) + dc * C.cell / 2 - cx + M.hammer.W / 2) / M.hammer.U + M.hammer.x0), Math.round(M.hammer.y1 - (Z(r) + dr * C.cell / 2 - cz + M.hammer.D / 2) / M.hammer.U), f] : null }); } } }
  // A few named spots per map (a list of its jump spots: one place each, the plain, crouch-jump-only and impossible kinds).
  const spots = [], used = new Set(); for (const kind of ['crouch-jump only', 'plain', 'impossible']) { let m = 0; for (const e of res) if (e.kind === kind && !used.has(e.place) && m < 2 && spots.length < 6) { used.add(e.place); spots.push(e); m++; } }
  console.log(`${id}: jump spots ` + spots.map(e => `${e.place || '?'} ${e.rise} HU (${e.kind}: plain ${e.plain ? 'on' : 'no'}, crouch-jump ${e.cj ? 'on' : 'no'}) at ${e.hammer?.join(',')}`).join(' · '));
  ALL[id] = res; const bad = res.filter(e => e.bad), kinds = k => res.filter(e => e.kind === k).length;
  check(`${id}: every clean ledge as CS2 — a plain jump gets on up to 55 HU, 58–64 only crouch-jumping, 67+ never`, res.length >= 6 && bad.length === 0,
    `${res.length} ledges (${kinds('plain')} plain, ${kinds('crouch-jump only')} crouch-jump only, ${kinds('impossible')} impossible) · wrong ${bad.length}` + (bad.length ? ' ' + JSON.stringify(bad.slice(0, 3)) : ''));
  check(`${id}: the ledges' tops are CS2's — movement boxes = the columns = CS2's player collision (±1 HU); CS2's grenade triangles within 4 HU on ≥ 85 %`, heights.box === heights.n && heights.cs2 === heights.n && (heights.meshN < 5 || heights.mesh >= .85 * heights.meshN),
    `columns ${heights.box}/${heights.n}, CS2 player collision ${heights.cs2}/${heights.n}, triangles ±4 HU ${heights.mesh}/${heights.meshN} (±2 HU ${heights.mesh2})`);
  // Low ceilings, from the movement's own collision: floors where a crouched body fits and a standing one doesn't (vents,
  // under the car, a window's lintel). There, letting go of the duck keeps you down (a second, still, on that floor); then
  // walking out each way with the key up, you stand only where a standing body fits — never inside the ceiling.
  let tried = 0, held = 0, stood = 0, inside = 0; const lowAt = [], fails = [], R = Number.isFinite(boxes.bodyRadius) ? boxes.bodyRadius : MOVE.radius;
  for (let r = 4; r < G.rows - 4 && tried < 16; r++) for (let c = 4; c < G.cols - 4 && tried < 16; c++) { const i = r * G.cols + c; if ((c * 7 + r * 13) % 3) continue;
    for (let k = 0; k < G.n[i] && tried < 16; k++) { const f = G.z[i * MAXF + k]; if (G.ceil[i * MAXF + k] - f < 54) continue; const x = X(c), z = Z(r), y = groundAt(boxes, x, z, Y(f) + .01, R);   // (the ground the body rests on there: the highest top under its radius)
      if (blocked(boxes, world.bounds, x, z, y, MOVE.duckHeight, R) || !blocked(boxes, null, x, z, y, MOVE.height, R)) continue;
      tried++; const s = createMoveState(y); s.x = x; s.z = z; s.ducked = true; s.duck = 1; const clk = createMoveClock(), idle = { wish: [0, 0], weapon: 'knife', duck: false };
      for (let t = 0; t < 128; t++) moveTicks(s, clk, idle, world, 1 / 128);
      if (s.ducked && s.duck === 1 && s.onGround && Math.abs(s.y - y) < 2 * HU) held++; else if (!s.ducked && blocked(boxes, null, s.x, s.z, s.y, MOVE.height, R * .98)) { inside++; fails.push([callout(x, z), +(x - cx).toFixed(1), +(z - cz).toFixed(1), toH(y), s.ducked, +((s.y - y) / HU).toFixed(1)]); continue; } else continue;   // (else: the floor there slopes or steps and the body moved off it: not a test of the ceiling)
      if (lowAt.length < 3) { let top = Infinity; for (const q of boxesNear(boxes, x - R, z - R, x + R, z + R, BOX)) if (!q.off && q.y0 > y + .1 && x > q.minX - R && x < q.maxX + R && z > q.minZ - R && z < q.maxZ + R) top = Math.min(top, q.y0); lowAt.push(`${callout(x, z) || '?'} ${Math.round((top - y) / HU)} HU of room`); }
      let up = false; for (const w of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = createMoveState(y); b.x = x; b.z = z; b.ducked = true; b.duck = 1; const ck = createMoveClock(), go = { wish: w, weapon: 'knife', duck: false };
        for (let t = 0; t < 128 * 1.5; t++) { const was = b.ducked; moveTicks(b, ck, go, world, 1 / 128); if (was && !b.ducked) { up = true; if (blocked(boxes, null, b.x, b.z, b.y, MOVE.height, R * .98)) inside++; } } }
      if (up) stood++; } }
  if (tried) check(`${id}: under a low ceiling (crouching room, no standing room: ≥ 3 in 4 hold still there) letting go of crouch keeps you down; walked out, you stand only where there is room`, held >= tried * .75 && inside === 0 && stood > 0,
    `${tried} spots (${lowAt.join(', ')}): stayed down ${held}, stood up on the way out ${stood}, stood inside a ceiling ${inside}` + (fails.length ? ' ' + JSON.stringify(fails.slice(0, 3)) : ''));
}
if (!maps) { console.log('SKIP: no CS2 map files in ' + dir); process.exit(0); }
if (process.env.JUMP_SPOTS_OUT) writeFileSync(process.env.JUMP_SPOTS_OUT, JSON.stringify(ALL));
console.log(`${ok === n ? 'PASS' : 'FAIL'}: CS2 jump spots · ${ok}/${n}`); if (ok !== n) process.exitCode = 1;
