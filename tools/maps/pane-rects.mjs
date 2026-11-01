// A glass pane's real shape as boxes (import-cs2-map.mjs: every window breakable). CS2's glass collision comes in
// pieces (triangles joined where they share corners) and one piece can be several windows tied together by thin glass
// strips round a doorway (Cache's Long A building: two small windows and their strips, one 310 × 110 box over the open
// door — a standing body blocked, only a crouch through). The piece's own box would block all of that; these boxes cover
// only where its glass is: its triangles drawn flat on the pane's face (the two wide axes) on a grid that marks every
// cell a triangle touches, the cells joined into rectangles (runs along a row, a run the same in the next row grows down),
// each one then shrunk to the glass inside it (the triangles cut to it). Each covers its glass ≥ 60 % (coverage, below).
//   paneRects(pos, idx, tris, lo, hi) → [{ mins, maxs }]   (pos/idx: the mesh's corners and triangles, tris: the piece's
//   triangle indices, lo/hi: its bounds; Hammer units)
//   paneCoverage(pos, idx, tris, mins, maxs[, ax]) → the share of the box's face the glass covers (0..1, on a ½-unit
//   grid; ax: the axis across the glass — by default the one its triangles in the box face most)
export const PANE_MIN_COVER = 0.6;
const MAX_RECTS = 24;
// (the triangle's corners in the face's axes; clipped to [u0,u1] × [w0,w1] keeping all three coordinates)
function clipTri(P, ax, u, w, u0, u1, w0, w1) {
  let poly = P; for (const [k, v, sg] of [[u, u0, 1], [u, u1, -1], [w, w0, 1], [w, w1, -1]]) { const out = [];
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[k] - v) * sg, db = (b[k] - v) * sg;
      if (da >= 0) out.push(a); if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); } }
    poly = out; if (poly.length < 3) return null; }
  return poly; }
const corners = (pos, idx, t) => [0, 1, 2].map(c => { const v = idx[t * 3 + c] * 3; return [pos[v], pos[v + 1], pos[v + 2]]; });
const axesOf = (lo, hi) => { const e = [0, 1, 2].map(k => hi[k] - lo[k]), ax = e.indexOf(Math.min(...e)); return [ax, ...[0, 1, 2].filter(k => k !== ax)]; };
// (2-D: does the triangle a b c touch the cell [x0,x1] × [y0,y1] — separating axes)
function triTouches(a, b, c, x0, x1, y0, y1) {
  if (Math.max(a[0], b[0], c[0]) < x0 || Math.min(a[0], b[0], c[0]) > x1 || Math.max(a[1], b[1], c[1]) < y0 || Math.min(a[1], b[1], c[1]) > y1) return false;
  for (const [p, q, r] of [[a, b, c], [b, c, a], [c, a, b]]) { const nx = q[1] - p[1], ny = p[0] - q[0], side = Math.sign(nx * (r[0] - p[0]) + ny * (r[1] - p[1])); if (!side) continue;
    let any = false; for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) if (Math.sign(nx * (x - p[0]) + ny * (y - p[1])) !== -side) { any = true; break; } if (!any) return false; }
  return true; }
const facing = (pos, idx, tris, mins, maxs) => { const n = [0, 0, 0];
  for (const t of tris) { const [a, b, c] = corners(pos, idx, t); if ([0, 1, 2].some(k => (a[k] + b[k] + c[k]) / 3 < mins[k] - .5 || (a[k] + b[k] + c[k]) / 3 > maxs[k] + .5)) continue;
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; n[0] += Math.abs(e[1] * f[2] - e[2] * f[1]); n[1] += Math.abs(e[2] * f[0] - e[0] * f[2]); n[2] += Math.abs(e[0] * f[1] - e[1] * f[0]); }
  return n[0] + n[1] + n[2] > 0 ? n.indexOf(Math.max(...n)) : axesOf(mins, maxs)[0]; };
export function paneCoverage(pos, idx, tris, mins, maxs, axis) {
  const ax = axis ?? facing(pos, idx, tris, mins, maxs), [u, w] = [0, 1, 2].filter(k => k !== ax), S = 0.5, nu = Math.max(1, Math.round((maxs[u] - mins[u]) / S)), nw = Math.max(1, Math.round((maxs[w] - mins[w]) / S)), su = (maxs[u] - mins[u]) / nu, sw = (maxs[w] - mins[w]) / nw, cov = new Uint8Array(nu * nw);
  for (const t of tris) { const P = corners(pos, idx, t).map(p => [p[u], p[w]]), ar = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]); if (Math.abs(ar) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor((Math.min(P[0][0], P[1][0], P[2][0]) - mins[u]) / su)), i1 = Math.min(nu - 1, Math.floor((Math.max(P[0][0], P[1][0], P[2][0]) - mins[u]) / su)), j0 = Math.max(0, Math.floor((Math.min(P[0][1], P[1][1], P[2][1]) - mins[w]) / sw)), j1 = Math.min(nw - 1, Math.floor((Math.max(P[0][1], P[1][1], P[2][1]) - mins[w]) / sw));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { if (cov[i * nw + j]) continue; const px = mins[u] + (i + .5) * su, py = mins[w] + (j + .5) * sw, d = (a, b) => (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]), d0 = d(P[0], P[1]), d1 = d(P[1], P[2]), d2 = d(P[2], P[0]);
      if ((d0 >= -1e-9 && d1 >= -1e-9 && d2 >= -1e-9) || (d0 <= 1e-9 && d1 <= 1e-9 && d2 <= 1e-9)) cov[i * nw + j] = 1; } }
  let n = 0; for (const c of cov) n += c; return n / cov.length; }
function rectsAt(pos, idx, tris, lo, hi, R) {
  const [ax, u, w] = axesOf(lo, hi), nu = Math.max(1, Math.ceil((hi[u] - lo[u]) / R - 1e-6)), nw = Math.max(1, Math.ceil((hi[w] - lo[w]) / R - 1e-6)), on = new Uint8Array(nu * nw);
  for (const t of tris) { const P = corners(pos, idx, t).map(p => [p[u] - lo[u], p[w] - lo[w]]);
    const i0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]) / R)), i1 = Math.min(nu - 1, Math.floor(Math.max(P[0][0], P[1][0], P[2][0]) / R)), j0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]) / R)), j1 = Math.min(nw - 1, Math.floor(Math.max(P[0][1], P[1][1], P[2][1]) / R));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!on[j * nu + i] && triTouches(P[0], P[1], P[2], i * R, (i + 1) * R, j * R, (j + 1) * R)) on[j * nu + i] = 1; }
  // (runs along each row; a run the same as one open in the row before grows that rectangle)
  const done = [], open = new Map();
  for (let j = 0; j <= nw; j++) { const runs = []; if (j < nw) for (let i = 0; i < nu; i++) if (on[j * nu + i]) { let k = i; while (k + 1 < nu && on[j * nu + k + 1]) k++; runs.push(i + ',' + k); i = k; }
    for (const [key, r] of open) if (!runs.includes(key)) { done.push(r); open.delete(key); }
    for (const key of runs) { const r = open.get(key); if (r) r.j1 = j; else { const [i0, i1] = key.split(',').map(Number); open.set(key, { i0, i1, j0: j, j1: j }); } } }
  const out = [];
  for (const r of done) { const u0 = lo[u] + r.i0 * R, u1 = Math.min(hi[u], lo[u] + (r.i1 + 1) * R), w0 = lo[w] + r.j0 * R, w1 = Math.min(hi[w], lo[w] + (r.j1 + 1) * R), a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    for (const t of tris) { const poly = clipTri(corners(pos, idx, t), ax, u, w, u0, u1, w0, w1); if (poly) for (const p of poly) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], p[k]); b[k] = Math.max(b[k], p[k]); } }
    if (!(b[u] > a[u]) || !(b[w] > a[w])) continue;
    if (b[ax] - a[ax] < 1) { const m = (a[ax] + b[ax]) / 2, h = Math.min(.5, (hi[ax] - lo[ax]) / 2); a[ax] = Math.max(lo[ax], m - h); b[ax] = Math.min(hi[ax], m + h); }   // (a flat sheet of glass: a unit thick at least)
    out.push({ mins: a.map(v => +v.toFixed(2)), maxs: b.map(v => +v.toFixed(2)) }); }
  return out; }
// The piece's boxes: its own box when its glass covers that well (most windows), else the rectangles — on a 1-unit
// grid, coarser while there are more than MAX_RECTS (an arch's steps) as long as each still covers its glass well.
export function paneRects(pos, idx, tris, lo, hi) {
  const whole = { mins: lo.map(v => +v.toFixed(2)), maxs: hi.map(v => +v.toFixed(2)) };
  if (paneCoverage(pos, idx, tris, lo, hi, axesOf(lo, hi)[0]) >= PANE_MIN_COVER) return [whole];
  let best = null;
  for (const R of [1, 2, 4, 8]) { const rs = rectsAt(pos, idx, tris, lo, hi, R); if (!rs.length) continue;
    const ax = axesOf(lo, hi)[0], ok = rs.every(r => paneCoverage(pos, idx, tris, r.mins, r.maxs, ax) >= PANE_MIN_COVER);
    if (!best || (ok && rs.length <= MAX_RECTS)) best = rs; if (ok && rs.length <= MAX_RECTS) break; if (!ok) break; }
  return best || [whole]; }
