// Grid maps for Global Defensive: a Defuse map written as rectangles of walkable floor (rooms, lanes, doors) carved
// out of solid ground on a cell grid, plus cover, bomb sites, spawns and callout names. The builder turns it into the
// game's map data: wall boxes (the solid cells merged into as few boxes as possible), cover boxes, spawn points, site
// circles, bot routes found along the grid (always walkable), and the grid itself for the radar (floor, sides,
// callouts, sites, spawns). What you see, what blocks you, what the radar shows and what the bots walk all come from
// the same cells.
//
// Spec: { name, cols, rows, cell (units per cell), wall: material, h: wall height, floor: material,
//   open: [[c0, r0, c1, r1], …]          walkable rectangles (inclusive cells)
//   mat:  [[c0, r0, c1, r1, material, h?], …]  wall material / height by area (default: wall / h)
//   cover: [[c0, r0, c1, r1, h, material], …]  boxes standing on the floor (crates, low walls: h < 10 is cover)
//   T, C: [c0, r0, c1, r1]  spawn areas · A, B: [c0, r0, c1, r1] bomb sites · mid: [c, r] (bots' mid route goal)
//   callouts: [[name, c, r], …]  · props, props2: [[type, c, r, rot, extra], …] (arena-mapkit props at cell centres)
//   lift: [[c0, r0, c1, r1, y], …]   raised floor (walk on it; reach it by a ramp, or drop off it)
//   ramp: [[c0, r0, c1, r1, dir, y0, y1], …]  stairs climbing towards dir ('n' −z, 's' +z, 'e' +x, 'w' −x) from y0 to y1
//   roof: [[c0, r0, c1, r1, y], …]   a ceiling at height y over those cells (tunnels, halls) }
// Heights: map.floorAt(x, z) gives the floor under a point (map coordinates); bots and spawns stand on it.
import { B, prop } from './arena-mapkit.js';

const inside = (c, r, [c0, r0, c1, r1]) => c >= c0 && c <= c1 && r >= r0 && r <= r1;
export function gridMap(S) {
  const { cols, rows, cell } = S, W = cols * cell, D = rows * cell, X = c => -W / 2 + (c + .5) * cell, Z = r => -D / 2 + (r + .5) * cell;
  // 0 = solid, 1 = floor; cover cells are floor for the radar but blocked for walking (boxes).
  const g = new Uint8Array(cols * rows); for (const R of S.open) for (let r = R[1]; r <= R[3]; r++) for (let c = R[0]; c <= R[2]; c++) if (c >= 0 && r >= 0 && c < cols && r < rows) g[r * cols + c] = 1;
  for (let c = 0; c < cols; c++) { g[c] = 0; g[(rows - 1) * cols + c] = 0; } for (let r = 0; r < rows; r++) { g[r * cols] = 0; g[r * cols + cols - 1] = 0; }   // a solid rim
  const matOf = (c, r) => { let m = [S.wall, S.h]; for (const M of S.mat || []) if (inside(c, r, M)) m = [M[4], M[5] ?? S.h]; return m; };
  // Merge solid cells into boxes: grow right, then down, over cells of the same material.
  const used = new Uint8Array(cols * rows), solids = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (g[i] || used[i]) continue; const [m, h] = matOf(c, r), same = (cc, rr) => !g[rr * cols + cc] && !used[rr * cols + cc] && matOf(cc, rr)[0] === m && matOf(cc, rr)[1] === h;
    let c1 = c; while (c1 + 1 < cols && same(c1 + 1, r)) c1++; let r1 = r; grow: while (r1 + 1 < rows) { for (let cc = c; cc <= c1; cc++) if (!same(cc, r1 + 1)) break grow; r1++; }
    for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) used[rr * cols + cc] = 1;
    solids.push(B((X(c) + X(c1)) / 2, (Z(r) + Z(r1)) / 2, (c1 - c + 1) * cell, (r1 - r + 1) * cell, h, m)); }
  // Floor heights per cell (lifts, ramps: see below); cover and props stand on them.
  const hg = new Float32Array(cols * rows), rampOf = new Int16Array(cols * rows).fill(-1), RISE = 1.5;
  for (const [c0, r0, c1, r1, y] of S.lift || []) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) hg[r * cols + c] = y;
  (S.ramp || []).forEach(([c0, r0, c1, r1, dir, y0, y1], k) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { rampOf[r * cols + c] = k; hg[r * cols + c] = (y0 + y1) / 2; } });
  const onFloor = (c0, r0, c1, r1) => { let y = 0; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (rampOf[r * cols + c] < 0) y = Math.max(y, hg[r * cols + c] || 0); return y; };
  for (const [c0, r0, c1, r1, h, m] of S.cover || []) { const inset = m === 'crate' ? 4 : .4; solids.push(B((X(c0) + X(c1)) / 2, (Z(r0) + Z(r1)) / 2, (c1 - c0 + 1) * cell - inset, (r1 - r0 + 1) * cell - inset, h, m, onFloor(c0, r0, c1, r1)));   /* crates a little smaller than their cells (CS-size, shot through by rifles) */ for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g[r * cols + c]) g[r * cols + c] = 2; }
  // Floors: lifts and ramps are boxes you walk on (walk: true; the walk checks and the radar ignore them), merged like walls.
  { const done = new Uint8Array(cols * rows); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c, y = hg[i]; if (!g[i] || done[i] || !(y > 0) || rampOf[i] >= 0) continue;
      const same = (cc, rr) => g[rr * cols + cc] && !done[rr * cols + cc] && rampOf[rr * cols + cc] < 0 && hg[rr * cols + cc] === y; let c1 = c; while (c1 + 1 < cols && same(c1 + 1, r)) c1++; let r1 = r; grow: while (r1 + 1 < rows) { for (let cc = c; cc <= c1; cc++) if (!same(cc, r1 + 1)) break grow; r1++; }
      for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) done[rr * cols + cc] = 1; const b = B((X(c) + X(c1)) / 2, (Z(r) + Z(r1)) / 2, (c1 - c + 1) * cell, (r1 - r + 1) * cell, y, S.raised || S.floor || 'stone'); b.walk = true; solids.push(b); } }
  for (const [c0, r0, c1, r1, dir, y0, y1] of S.ramp || []) { const roofed = (S.roof || []).some(R => c0 >= R[0] && c1 <= R[2] && r0 >= R[1] && r1 <= R[3]), [x0, x1, z0, z1] = [X(c0) - cell / 2, X(c1) + cell / 2, Z(r0) - cell / 2, Z(r1) + cell / 2], along = dir === 'n' || dir === 's', len = along ? z1 - z0 : x1 - x0, n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / RISE)), run = len / n;
    for (let i = 0; i < n; i++) { const top = y0 + (y1 - y0) * (i + 1) / n, f = dir === 'n' || dir === 'w' ? 1 - (i + .5) / n : (i + .5) / n, cx = along ? (x0 + x1) / 2 : x0 + f * len, cz = along ? z0 + f * len : (z0 + z1) / 2; if (top <= 0) continue;
      const b = B(cx, cz, along ? x1 - x0 : run, along ? run : z1 - z0, top, roofed ? 'tunnelfloor' : S.raised || S.floor || 'stone'); b.walk = true; b.stair = true; solids.push(b); } }
  // Roofs: a timbered ceiling, dim liners on the walls under it and a worn floor (merged runs: few boxes).
  const LT = .3;
  for (const [c0, r0, c1, r1, y] of S.roof || []) { solids.push(B((X(c0) + X(c1)) / 2, (Z(r0) + Z(r1)) / 2, (c1 - c0 + 1) * cell, (r1 - r0 + 1) * cell, 3, S.roofMat || 'tunnelroof', y));
    const open = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && g[r * cols + c] !== 0, fl = (c, r) => rampOf[r * cols + c] >= 0 ? 0 : hg[r * cols + c];
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const alongC = dr !== 0;   // a face on the north / south side runs along columns
      for (let a = alongC ? r0 : c0; a <= (alongC ? r1 : c1); a++) { let run = null; const flush = () => { if (!run) return; const [s0, s1, y0] = run, n = s1 - s0 + 1, h = y - y0;
          if (alongC) { const zc = Z(a) + dr * (cell / 2 - LT / 2); solids.push(B((X(s0) + X(s1)) / 2, zc, n * cell, LT, h, 'tunnel', y0)); } else { const xc = X(a) + dc * (cell / 2 - LT / 2); solids.push(B(xc, (Z(s0) + Z(s1)) / 2, LT, n * cell, h, 'tunnel', y0)); } run = null; };
        for (let b = alongC ? c0 : r0; b <= (alongC ? c1 : r1); b++) { const c = alongC ? b : a, r = alongC ? a : b, face = open(c, r) && !open(c + dc, r + dr), y0 = open(c, r) ? fl(c, r) : 0;
          if (face && run && run[2] === y0 && run[1] === b - 1) run[1] = b; else { flush(); if (face) run = [b, b, y0]; } } flush(); } }
    for (let r = r0; r <= r1; r++) { let run = null; const flush = () => { if (run) { const f = B((X(run[0]) + X(run[1])) / 2, Z(r), (run[1] - run[0] + 1) * cell, cell, .06, 'tunnelfloor', run[2]); f.walk = true; solids.push(f); } run = null; };
      for (let c = c0; c <= c1; c++) { const ok = open(c, r) && rampOf[r * cols + c] < 0, y0 = hg[r * cols + c]; if (ok && run && run[2] === y0 && run[1] === c - 1) run[1] = c; else { flush(); if (ok) run = [c, c, y0]; } } flush(); } }
  const floorAt = (x, z) => { const c = Math.floor((x + W / 2) / cell), r = Math.floor((z + D / 2) / cell); if (c < 0 || r < 0 || c >= cols || r >= rows) return 0; const i = r * cols + c, k = rampOf[i]; if (k < 0) return hg[i];
    const [c0, r0, c1, r1, dir, y0, y1] = S.ramp[k], t = dir === 'n' ? ((Z(r1) + cell / 2) - z) / ((r1 - r0 + 1) * cell) : dir === 's' ? (z - (Z(r0) - cell / 2)) / ((r1 - r0 + 1) * cell) : dir === 'e' ? (x - (X(c0) - cell / 2)) / ((c1 - c0 + 1) * cell) : ((X(c1) + cell / 2) - x) / ((c1 - c0 + 1) * cell);
    return y0 + (y1 - y0) * Math.max(0, Math.min(1, t)); };
  const props = []; for (const [type, c, r, rot = 0, extra = {}] of [...(S.props || []), ...(S.props2 || [])]) { const P = prop(type, X(c), Z(r), rot, extra.y === undefined && onFloor(c, r, c, r) ? { ...extra, y: onFloor(c, r, c, r) } : extra); solids.push(...P.solids); props.push(P.visual); for (const b of P.solids) for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (g[rr * cols + cc] === 1 && Math.abs(X(cc) - b[0]) < b[2] / 2 + cell / 2 && Math.abs(Z(rr) - b[1]) < b[3] / 2 + cell / 2) g[rr * cols + cc] = 3; }   /* a prop's cells: blocked for the routes, floor on the radar */
  // Spawn points (5 per side, spread over the area), sites (centre + radius), callouts in game units.
  const area = ([c0, r0, c1, r1]) => [(X(c0) + X(c1)) / 2, (Z(r0) + Z(r1)) / 2, (c1 - c0 + 1) * cell / 2, (r1 - r0 + 1) * cell / 2];
  const spawns = R => { const [x, z, hw, hd] = area(R), ox = Math.min(14, hw - 4), oz = Math.min(8, hd - 4); return [[x, z], [x - ox, z], [x + ox, z], [x - ox / 2, z - oz], [x + ox / 2, z + oz]].map(([a, b]) => [+a.toFixed(1), +b.toFixed(1)]); };
  const site = R => { const [x, z, hw, hd] = area(R); return [+x.toFixed(1), +z.toFixed(1), +(Math.min(hw, hd) * .95).toFixed(1)]; };
  // Bot routes: shortest walk on the grid (8-way, no corner cutting), then pulled straight where the walk stays clear.
  const free = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && g[r * cols + c] === 1;
  const path = (from, to) => { const [fc, fr] = from, [tc, tr] = to, prev = new Int32Array(cols * rows).fill(-1), q = [fr * cols + fc]; prev[q[0]] = q[0];
    for (let h = 0; h < q.length; h++) { const u = q[h], uc = u % cols, ur = (u / cols) | 0; if (uc === tc && ur === tr) break;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const c = uc + dc, r = ur + dr; if (!free(c, r) || (dc && dr && (!free(uc + dc, ur) || !free(uc, ur + dr)))) continue; const v = r * cols + c; if (prev[v] >= 0) continue; prev[v] = u; q.push(v); } }
    const out = []; let v = tr * cols + tc; if (prev[v] < 0) return []; while (v !== prev[v]) { out.push([v % cols, (v / cols) | 0]); v = prev[v]; } out.push([fc, fr]); return out.reverse(); };
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3); for (let i = 0; i <= n; i++) { const t = i / n, c = a[0] + (b[0] - a[0]) * t, r = a[1] + (b[1] - a[1]) * t;
      for (const [dc, dr] of [[0, 0], [.32, .32], [-.32, .32], [.32, -.32], [-.32, -.32]]) if (!free(Math.round(c + dc), Math.round(r + dr))) return false; } return true; };
  const pull = cells => { if (cells.length < 2) return cells; const out = [cells[0]]; let a = 0; while (a < cells.length - 1) { let b = cells.length - 1; while (b > a + 1 && !clear(cells[a], cells[b])) b--; out.push(cells[b]); a = b; } return out; };
  const centre = R => [Math.round((R[0] + R[2]) / 2), Math.round((R[1] + R[3]) / 2)];
  const near = ([c, r]) => { if (free(c, r)) return [c, r]; for (let k = 1; k < 8; k++) for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) if (free(c + dc, r + dr)) return [c + dc, r + dr]; return [c, r]; };   /* a goal under a crate: the nearest free cell */
  const route = (from, to) => pull(path(near(from), near(to))).slice(1).map(([c, r]) => [+X(c).toFixed(1), +Z(r).toFixed(1)]);
  const T = spawns(S.T), CT = spawns(S.C), cellOf = ([x, z]) => [Math.round((x + W / 2) / cell - .5), Math.round((z + D / 2) / cell - .5)];
  const routes = { t: { A: route(cellOf(T[0]), centre(S.A)), B: route(cellOf(T[0]), centre(S.B)), M: route(cellOf(T[0]), S.mid) }, ct: { A: route(cellOf(CT[0]), centre(S.A)), B: route(cellOf(CT[0]), centre(S.B)) } };
  for (const [side, R] of Object.entries(routes)) for (const [k, pts] of Object.entries(R)) if (!pts.length) throw Error(S.name + ': no walk from the ' + side + ' spawn to ' + k);
  return { name: S.name, kind: 'defuse', size: [W, D], floor: S.floor || 'sand', sky: S.sky || 0xbcd6ec, sun: S.sun || 0xfff0d0, look: S.look, solids, props, decor: S.decor || [],
    t: T, ct: CT, sites: { A: site(S.A), B: site(S.B) }, routes, callouts: (S.callouts || []).map(([name, c, r]) => ({ name, x: +X(c).toFixed(1), z: +Z(r).toFixed(1) })),
    grid: { cols, rows, cell, cells: g, T: S.T, C: S.C, A: S.A, B: S.B, heights: hg, roofs: S.roof || [], ramps: S.ramp || [] }, floorAt, scaled: true };
}
