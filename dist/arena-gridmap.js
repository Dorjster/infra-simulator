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
//   callouts: [[name, c, r], …]  · props: [[type, c, r, rot, extra], …] (arena-mapkit props at cell centres) }
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
  for (const [c0, r0, c1, r1, h, m] of S.cover || []) { const inset = m === 'crate' ? 4 : .4; solids.push(B((X(c0) + X(c1)) / 2, (Z(r0) + Z(r1)) / 2, (c1 - c0 + 1) * cell - inset, (r1 - r0 + 1) * cell - inset, h, m));   /* crates a little smaller than their cells (CS-size, shot through by rifles) */ for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g[r * cols + c]) g[r * cols + c] = 2; }
  const props = []; for (const [type, c, r, rot = 0, extra = {}] of S.props || []) { const P = prop(type, X(c), Z(r), rot, extra); solids.push(...P.solids); props.push(P.visual); for (const b of P.solids) for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (g[rr * cols + cc] === 1 && Math.abs(X(cc) - b[0]) < b[2] / 2 + cell / 2 && Math.abs(Z(rr) - b[1]) < b[3] / 2 + cell / 2) g[rr * cols + cc] = 3; }   /* a prop's cells: blocked for the routes, floor on the radar */
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
    grid: { cols, rows, cell, cells: g, T: S.T, C: S.C, A: S.A, B: S.B }, scaled: true };
}
