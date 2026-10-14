// Draws a classic map (cs-mapbuild.js) straight from its columns: only the surfaces you can see — floor tops (one
// surface per level, its corners shared with the neighbours so ramps and stairs are smooth slopes and real ledges stay
// sharp), wall and riser faces where neighbouring columns differ, and the undersides of ceilings and slabs. No hidden
// faces between neighbouring boxes (those cost a lot of shading on a true-scale map). Collision stays on the boxes.
import * as THREE from './three.module.js';
import { MAXF } from './cs-columns.js';
import { THEMES } from './cs-maps/themes.js';
const JOIN = 12;   // HU: floors closer than this at a shared corner are one smooth surface
// Baked light (vertex colours): a floor corner shaded by the walls around it (ambient occlusion: none, one, two, three
// walls), the shade at a wall's foot (fading up over FOOT_H), and the undersides of slabs and ceilings lifted (lit only
// by the sky's ground colour they read as black). Floors tilted less than FLAT_N keep a straight-up normal: the map
// data's small height noise no longer shows as creased, "folded paper" floors (ramps and stairs keep their shading).
const AO = [1, .8, .66, .56, .56], FOOT = .72, FOOT_H = 28, UNDER = 1.75, FLAT_N = .965, ONE = [1, 1, 1, 1];
export function buildColumnMeshes(map, materialFor, tileOf, cx = 0, cz = 0) {
  const { G, segs, zLow, W, D, cell, U } = map.columns, { cols, rows } = G, N = cols * rows, y = h => (h - zLow) * U, X = c => cx - W / 2 + c * cell, Z = r => cz - D / 2 + r * cell;
  const isFloor = s => !!s[3];   // walk-on segments (floors, slabs, crate tops)
  // The map's look (themes.js): outdoor walls take a palette colour per block of buildings (BLK columns square), a painted
  // band, a ledge along their top.
  const T = THEMES[map.id] || {}, PAL = T.palette || [[1, 1, 1]], BLK = 22, WHITE = [1, 1, 1];
  const tintAt = (x, z) => { const a = Math.floor((x - cx + W / 2) / cell / BLK), b = Math.floor((z - cz + D / 2) / cell / BLK), h = ((a * 73856093) ^ (b * 19349663)) >>> 0; return PAL[h % PAL.length]; };
  // A wall beside a floor at h: something solid from about the floor up through a body.
  const solidAt = (c, r, h) => { if (c < 0 || r < 0 || c >= cols || r >= rows) return false; for (const s of segs[r * cols + c]) if (s[0] <= h + 10 && s[1] >= h + 40) return true; return false; };
  const occ = (c, r, h) => { let k = 0; for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (solidAt(c + dc, r + dr, h)) k++; return AO[k]; };
  // The open floor of a column near h (a floor with a body's room above it), or null.
  const openFloor = (c, r, h) => { if (c < 0 || r < 0 || c >= cols || r >= rows) return null; const S = segs[r * cols + c]; for (const s of S) if (isFloor(s) && Math.abs(s[1] - h) < 60 && !S.some(o => o !== s && o[0] < s[1] + 60 && o[1] > s[1] + .01)) return s[1]; return null; };
  // Corner heights per (column, segment): the floors meeting at each corner, clustered (gaps over JOIN split them).
  const cornerH = (c, r, h) => { const v = []; for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue; for (const s of segs[rr * cols + cc]) if (isFloor(s) && Math.abs(s[1] - h) < 60) v.push(s[1]); }
    v.sort((a, b) => a - b); let lo = 0; for (let i = 1; i <= v.length; i++) if (i === v.length || v[i] - v[i - 1] > JOIN) { const cl = v.slice(lo, i); if (cl.length && h >= cl[0] - .01 && h <= cl[cl.length - 1] + .01) return cl.reduce((a, b) => a + b, 0) / cl.length; lo = i; } return h; };
  const CH = 48 * cell, out = new Map(), bucket = (m, x, z) => { const k = m + '|' + Math.floor((x - cx + W / 2) / CH) + '|' + Math.floor((z - cz + D / 2) / CH); let b = out.get(k); if (!b) out.set(k, b = { m, P: [], N: [], UV: [], C: [], tile: tileOf(m) }); return b; };   // per material and 48-column chunk (culled when out of view)
  // Triangles of a quad / triangle, counter-clockwise seen from n; k: a colour (shade) per corner.
  const put = (m, pts, n, k, tint = WHITE) => { const B = bucket(m, pts[0][0], pts[0][2]), t = B.tile, ny = Math.abs(n[1]) > .5, nx = Math.abs(n[0]) > .5, diag = !ny && !nx;
    for (let j = 0; j < pts.length; j++) { const p = pts[j]; B.P.push(p[0], p[1], p[2]); B.N.push(n[0], n[1], n[2]); B.UV.push((ny ? p[0] : nx ? p[2] : diag ? (p[0] - p[2]) * Math.SQRT1_2 : p[0]) / t, (ny ? p[2] : p[1]) / t); B.C.push(k[j] * tint[0], k[j] * tint[1], k[j] * tint[2]); } };
  const quad = (m, a, b, c, d, n, k = ONE, tint = WHITE) => put(m, [a, b, c, a, c, d], n, [k[0], k[1], k[2], k[0], k[2], k[3]], tint);
  // A quad whose winding is worked out from n (any corner order going round).
  const face = (m, a, b, c, d, n, k = ONE, tint = WHITE) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (x[0] * n[0] + x[1] * n[1] + x[2] * n[2] >= 0) quad(m, a, b, c, d, n, k, tint); else quad(m, d, c, b, a, n, [k[3], k[2], k[1], k[0]], tint); };
  const tri = (m, a, b, c, n, k = ONE) => put(m, [a, b, c], n, k);
  // A wall face from y0 to y1 along (p0 → p1): the foot band shaded, the rest plain.
  // Outdoor walls (the theme's wall material) take their block's palette colour and the theme's band.
  const wall = (m, p0, p1, y0, y1, n, foot = true) => { const yb = foot ? Math.min(y1, y0 + FOOT_H * U) : y0, out = m === T.wall, tint = out ? tintAt((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2) : WHITE;
    const slab = (lo, hi, k, t = tint) => { if (hi > lo + 1e-4) quad(m, [p0[0], lo, p0[1]], [p1[0], lo, p1[1]], [p1[0], hi, p1[1]], [p0[0], hi, p0[1]], n, k, t); };
    slab(y0, yb, [FOOT, FOOT, 1, 1]);
    const B = out && T.band, base = y0 + (foot ? 16 * U : 0), bf = B ? Math.max(yb, Math.min(y1, base + B.from * U)) : y1, bt = B ? Math.max(bf, Math.min(y1, base + B.to * U)) : y1;
    slab(yb, bf, ONE); if (B) { slab(bf, bt, ONE, B.color); slab(bt, y1, ONE); } };
  // A ledge along a wall's top edge (p0 → p1, outward normal n, top at yt): the theme's cap — front, underside, top,
  // back above the roof line and both ends; it runs a little past each end so lips meet at outer corners.
  const capOf = (m, p0, p1, yt, n) => { const C = T.cap; if (!C || m !== T.wall) return; const mat = C.mat || m, o = C.out * U, L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, ex = (p1[0] - p0[0]) / L * o, ez = (p1[1] - p0[1]) / L * o;
    const a = [p0[0] - ex, p0[1] - ez], b = [p1[0] + ex, p1[1] + ez], A = [a[0] + n[0] * o, a[1] + n[2] * o], Bq = [b[0] + n[0] * o, b[1] + n[2] * o], top = yt + 2 * U, bot = yt - C.h * U, k = C.shade, K = [k, k, k, k], K2 = [k * .7, k * .7, k * .7, k * .7];
    face(mat, [A[0], bot, A[1]], [Bq[0], bot, Bq[1]], [Bq[0], top, Bq[1]], [A[0], top, A[1]], n, K);
    face(mat, [a[0], bot, a[1]], [b[0], bot, b[1]], [Bq[0], bot, Bq[1]], [A[0], bot, A[1]], [0, -1, 0], K2);
    face(mat, [a[0], top, a[1]], [b[0], top, b[1]], [Bq[0], top, Bq[1]], [A[0], top, A[1]], [0, 1, 0]);
    face(mat, [a[0], yt, a[1]], [b[0], yt, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], [-n[0], 0, -n[2]], K);
    const d = [(p1[0] - p0[0]) / L, 0, (p1[1] - p0[1]) / L];
    face(mat, [a[0], bot, a[1]], [A[0], bot, A[1]], [A[0], top, A[1]], [a[0], top, a[1]], [-d[0], 0, -d[2]], K);
    face(mat, [b[0], bot, b[1]], [Bq[0], bot, Bq[1]], [Bq[0], top, Bq[1]], [b[0], top, b[1]], d, K); };
  // Chamfers: a wall column's outer corner on a diagonal edge (floor on two sides and between them, the wall going on
  // behind it) is cut along the diagonal, so diagonal walls are straight faces, not staircases of blocks.
  const cham = new Map(); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const S = segs[r * cols + c], top = S[S.length - 1]; if (!top || isFloor(top)) continue; let hit = null, count = 0;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const hA = openFloor(c + sx, r, top[1] - 200); if (hA === null) continue; const hB = openFloor(c, r + sz, hA), hD = openFloor(c + sx, r + sz, hA);
      if (hB === null || hD === null || Math.abs(hB - hA) > JOIN || Math.abs(hD - hA) > JOIN) continue; const h = Math.max(hA, hB, hD); const w = S.find(o => o[0] <= h + 10 && o[1] >= h + 60); if (!w) continue;
      if (!solidAt(c - sx, r, h) || !solidAt(c, r - sz, h)) continue; count++; hit = { sx, sz, h, w }; }
    if (count === 1) cham.set(r * cols + c, hit); }
  // Grid corner (gc, gr) of cell (c, r) → its place in the counter-clockwise (from above) order SW, SE, NE, NW.
  const ccw = (c, r, gc, gr) => gc === c ? (gr === r ? 3 : 0) : (gr === r ? 2 : 1);
  const topOf = new Array(N), flat = [];   // per column: smoothed corner heights of its floor tops, keyed by segment top; flat tops merged below
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c, S = segs[i]; for (const s of S) {
    const covered = S.some(o => o !== s && o[0] <= s[1] + .01 && o[1] > s[1] + .01);
    // Top face (smoothed for floors).
    if (!covered) { const h = s[1], f = isFloor(s), k = f ? [cornerH(c, r, h), cornerH(c + 1, r, h), cornerH(c + 1, r + 1, h), cornerH(c, r + 1, h)] : [h, h, h, h]; (topOf[i] ??= new Map()).set(h, k);
      const p = [[X(c), y(k[0]), Z(r)], [X(c + 1), y(k[1]), Z(r)], [X(c + 1), y(k[2]), Z(r + 1)], [X(c), y(k[3]), Z(r + 1)]], e1 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]], e2 = [p[3][0] - p[1][0], p[3][1] - p[1][1], p[3][2] - p[1][2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const L = Math.hypot(...n) || 1; n = n.map(v => v / L); if (n[1] < 0) n = n.map(v => -v); if (n[1] > FLAT_N) n = [0, 1, 0];
      const ao = f ? [occ(c, r, h), occ(c + 1, r, h), occ(c + 1, r + 1, h), occ(c, r + 1, h)] : ONE, ch = cham.get(i);
      if (ch && s === ch.w) { const K = [c + (ch.sx > 0 ? 1 : 0), r + (ch.sz > 0 ? 1 : 0)], keep = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]].filter(([gc, gr]) => gc !== K[0] || gr !== K[1]).sort((A, B) => ccw(c, r, ...A) - ccw(c, r, ...B));
        tri(s[2], ...keep.map(([gc, gr]) => [X(gc), y(h), Z(gr)]), [0, 1, 0]); }   // the wall's top, less the cut corner
      else if (k[0] === k[1] && k[1] === k[2] && k[2] === k[3] && ao.every(v => v === 1)) flat.push([c, r, h, s[2]]); else quad(s[2], p[3], p[2], p[1], p[0], n, [ao[3], ao[2], ao[1], ao[0]]); }
    // Underside (ceilings, slabs) where nothing rests below.
    if (s[0] > zLow + .01 && !S.some(o => o !== s && o[1] >= s[0] - .01 && o[0] < s[0] - .01)) quad(s[2], [X(c), y(s[0]), Z(r)], [X(c + 1), y(s[0]), Z(r)], [X(c + 1), y(s[0]), Z(r + 1)], [X(c), y(s[0]), Z(r + 1)], [0, -1, 0], [UNDER, UNDER, UNDER, UNDER]); } }
  // Flat tops: merged into rectangles (same height and material): far fewer triangles.
  { const byKey = new Map(); for (const [c, r, h, m] of flat) { const k = h + '|' + m; let e = byKey.get(k); if (!e) byKey.set(k, e = { h, m, cells: new Set() }); e.cells.add(r * cols + c); }
    for (const { h, m, cells } of byKey.values()) for (const i0 of cells) { if (!cells.has(i0)) continue; const c0 = i0 % cols, r0 = (i0 / cols) | 0; let c1 = c0; while (cells.has(r0 * cols + c1 + 1)) c1++;
      let r1 = r0; grow: while (true) { for (let c = c0; c <= c1; c++) if (!cells.has((r1 + 1) * cols + c)) break grow; r1++; }
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.delete(r * cols + c);
      quad(m, [X(c0), y(h), Z(r1 + 1)], [X(c1 + 1), y(h), Z(r1 + 1)], [X(c1 + 1), y(h), Z(r0)], [X(c0), y(h), Z(r0)], [0, 1, 0]); } }
  // Side faces: what of a column's segments its neighbour doesn't cover (floor risers below JOIN are bridged by the smooth tops).
  const sides = [[1, 0, [1, 0, 0]], [-1, 0, [-1, 0, 0]], [0, 1, [0, 0, 1]], [0, -1, [0, 0, -1]]], runs = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; for (const [dc, dr, n] of sides) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue; const other = segs[rr * cols + cc];
    const ch = cham.get(i);
    for (const s of segs[i]) { if (ch && s === ch.w && ((dc === ch.sx && !dr) || (dr === ch.sz && !dc))) continue;   // replaced by the chamfer's diagonal face
      let parts = [[s[0], s[1]]]; for (const o of other) { const next = []; for (const [a, b] of parts) { if (o[1] <= a || o[0] >= b) { next.push([a, b]); continue; } if (o[0] > a) next.push([a, o[0]]); if (o[1] < b) next.push([o[1], b]); } parts = next; }
      for (let [a, b] of parts) { if (b - a < .5) continue; const floorTop = isFloor(s) && Math.abs(b - s[1]) < .01; if (floorTop && b - a <= JOIN && other.some(o => isFloor(o) && Math.abs(o[1] - a) < .01)) continue;
        a -= isFloor(s) ? 0 : 16;   // walls reach a little below the floor in front of them (no seam under a smoothed edge)
        // the edge's two ends: (x0,z0) → (x1,z1), counter-clockwise seen from n
        const ex = dc === 1 ? X(c + 1) : dc === -1 ? X(c) : null, ez = dr === 1 ? Z(r + 1) : dr === -1 ? Z(r) : null;
        const [p0, p1] = ex !== null ? (dc === 1 ? [[ex, Z(r + 1)], [ex, Z(r)]] : [[ex, Z(r)], [ex, Z(r + 1)]]) : (dr === 1 ? [[X(c), ez], [X(c + 1), ez]] : [[X(c + 1), ez], [X(c), ez]]);
        let t0 = y(b), t1 = y(b); if (floorTop) { const k = topOf[i]?.get(s[1]); if (k) { const idx = dc === 1 ? [2, 1] : dc === -1 ? [0, 3] : dr === 1 ? [3, 2] : [1, 0]; t0 = y(k[idx[0]]); t1 = y(k[idx[1]]); } }
        if (t0 === y(b) && t1 === y(b)) { const plane = dc ? c + (dc > 0 ? 1 : 0) : r + (dr > 0 ? 1 : 0), along = dc ? r : c; runs.push([dc, dr, plane, a, b, s[2], along, !isFloor(s) && Math.abs(b - s[1]) < .01 && s === segs[i][segs[i].length - 1] && b - a > 56 ? 1 : 0]); } else quad(s[2], [p0[0], y(a), p0[1]], [p1[0], y(a), p1[1]], [p1[0], t1, p1[1]], [p0[0], t0, p0[1]], n, [FOOT, FOOT, 1, 1]); } } } }
  // Chamfered corners: the diagonal wall face, and the floor in the cut-off corner (smooth with the floor around it).
  for (const [i, ch] of cham) { const c = i % cols, r = (i / cols) | 0, { sx, sz, h, w } = ch, K = [c + (sx > 0 ? 1 : 0), r + (sz > 0 ? 1 : 0)], Ka = [K[0], r + (sz > 0 ? 0 : 1)], Kb = [c + (sx > 0 ? 0 : 1), K[1]];
    const n = [sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2], right = [sz, -sx], dot = g => (X(g[0]) - cx) * right[0] + (Z(g[1]) - cz) * right[1], [g0, g1] = dot(Ka) < dot(Kb) ? [Ka, Kb] : [Kb, Ka];
    const fy = g => y(cornerH(g[0], g[1], h));
    wall(w[2], [X(g0[0]), Z(g0[1])], [X(g1[0]), Z(g1[1])], Math.min(fy(g0), fy(g1)) - 16 * U, y(w[1]), n);
    const fl = segs[(r) * cols + c + sx]?.find(o => isFloor(o) && Math.abs(o[1] - h) <= JOIN), mat = fl ? fl[2] : w[2], tri3 = [K, Ka, Kb].sort((A, B) => ccw(c, r, ...A) - ccw(c, r, ...B));
    tri(mat, ...tri3.map(g => [X(g[0]), fy(g), Z(g[1])]), [0, 1, 0], tri3.map(g => occ(g[0], g[1], h))); }
  // Flat wall faces merged along their edge (same plane, height span and material, neighbouring cells).
  runs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3] || p[4] - q[4] || (p[5] < q[5] ? -1 : p[5] > q[5] ? 1 : 0) || p[7] - q[7] || p[6] - q[6]);
  for (let i = 0; i < runs.length;) { const [dc, dr, plane, a, b, m, s0] = runs[i]; let j = i + 1, s1 = s0; while (j < runs.length && runs[j][0] === dc && runs[j][1] === dr && runs[j][2] === plane && runs[j][3] === a && runs[j][4] === b && runs[j][5] === m && runs[j][7] === runs[i][7] && runs[j][6] === s1 + 1) { s1++; j++; }
    const n = dc === 1 ? [1, 0, 0] : dc === -1 ? [-1, 0, 0] : dr === 1 ? [0, 0, 1] : [0, 0, -1];
    const [p0, p1] = dc ? (dc === 1 ? [[X(plane), Z(s1 + 1)], [X(plane), Z(s0)]] : [[X(plane), Z(s0)], [X(plane), Z(s1 + 1)]]) : (dr === 1 ? [[X(s0), Z(plane)], [X(s1 + 1), Z(plane)]] : [[X(s1 + 1), Z(plane)], [X(s0), Z(plane)]]);
    wall(m, p0, p1, y(a), y(b), n); if (runs[i][7]) capOf(m, p0, p1, y(b), n); i = j; }
  const meshes = []; for (const B of out.values()) { const m = B.m; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(B.UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.C, 3)); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, materialFor(m)); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.arena = true; meshes.push(mesh); }
  return meshes;
}
