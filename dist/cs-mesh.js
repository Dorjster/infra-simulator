// Draws a classic map (cs-mapbuild.js) straight from its columns: only the surfaces you can see — floor tops (one
// surface per level, its corners shared with the neighbours so ramps and stairs are smooth slopes and real ledges stay
// sharp), wall and riser faces where neighbouring columns differ, and the undersides of ceilings and slabs. No hidden
// faces between neighbouring boxes (those cost a lot of shading on a true-scale map). Collision stays on the boxes.
import * as THREE from './three.module.js';
import { MAXF } from './cs-columns.js';
const JOIN = 12;   // HU: floors closer than this at a shared corner are one smooth surface
export function buildColumnMeshes(map, materialFor, tileOf, cx = 0, cz = 0) {
  const { G, segs, zLow, W, D, cell, U } = map.columns, { cols, rows } = G, N = cols * rows, y = h => (h - zLow) * U, X = c => cx - W / 2 + c * cell, Z = r => cz - D / 2 + r * cell;
  const isFloor = s => !!s[3];   // walk-on segments (floors, slabs, crate tops)
  // Corner heights per (column, segment): the floors meeting at each corner, clustered (gaps over JOIN split them).
  const cornerH = (c, r, h) => { const v = []; for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue; for (const s of segs[rr * cols + cc]) if (isFloor(s) && Math.abs(s[1] - h) < 60) v.push(s[1]); }
    v.sort((a, b) => a - b); let lo = 0; for (let i = 1; i <= v.length; i++) if (i === v.length || v[i] - v[i - 1] > JOIN) { const cl = v.slice(lo, i); if (cl.length && h >= cl[0] - .01 && h <= cl[cl.length - 1] + .01) return cl.reduce((a, b) => a + b, 0) / cl.length; lo = i; } return h; };
  const CH = 48 * cell, out = new Map(), bucket = (m, x, z) => { const k = m + '|' + Math.floor((x - cx + W / 2) / CH) + '|' + Math.floor((z - cz + D / 2) / CH); let b = out.get(k); if (!b) out.set(k, b = { m, P: [], N: [], UV: [], tile: tileOf(m) }); return b; };   // per material and 48-column chunk (culled when out of view)
  const quad = (m, a, b, c, d, n) => { const B = bucket(m, (a[0] + c[0]) / 2, (a[2] + c[2]) / 2), t = B.tile, ny = Math.abs(n[1]) > .5, nx = Math.abs(n[0]) > .5;   // a b c d counter-clockwise seen from n
    for (const p of [a, b, c, a, c, d]) { B.P.push(p[0], p[1], p[2]); B.N.push(n[0], n[1], n[2]); B.UV.push((ny ? p[0] : nx ? p[2] : p[0]) / t, (ny ? p[2] : p[1]) / t); } };
  const topOf = new Array(N), flat = [];   // per column: smoothed corner heights of its floor tops, keyed by segment top; flat tops merged below
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c, S = segs[i]; for (const s of S) {
    const covered = S.some(o => o !== s && o[0] <= s[1] + .01 && o[1] > s[1] + .01);
    // Top face (smoothed for floors).
    if (!covered) { const h = s[1], f = isFloor(s), k = f ? [cornerH(c, r, h), cornerH(c + 1, r, h), cornerH(c + 1, r + 1, h), cornerH(c, r + 1, h)] : [h, h, h, h]; (topOf[i] ??= new Map()).set(h, k);
      const p = [[X(c), y(k[0]), Z(r)], [X(c + 1), y(k[1]), Z(r)], [X(c + 1), y(k[2]), Z(r + 1)], [X(c), y(k[3]), Z(r + 1)]], e1 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]], e2 = [p[3][0] - p[1][0], p[3][1] - p[1][1], p[3][2] - p[1][2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const L = Math.hypot(...n) || 1; n = n.map(v => v / L); if (n[1] < 0) n = n.map(v => -v);
      if (k[0] === k[1] && k[1] === k[2] && k[2] === k[3]) flat.push([c, r, h, s[2]]); else quad(s[2], p[3], p[2], p[1], p[0], n); }
    // Underside (ceilings, slabs) where nothing rests below.
    if (s[0] > zLow + .01 && !S.some(o => o !== s && o[1] >= s[0] - .01 && o[0] < s[0] - .01)) quad(s[2], [X(c), y(s[0]), Z(r)], [X(c + 1), y(s[0]), Z(r)], [X(c + 1), y(s[0]), Z(r + 1)], [X(c), y(s[0]), Z(r + 1)], [0, -1, 0]); } }
  // Flat tops: merged into rectangles (same height and material): far fewer triangles.
  { const byKey = new Map(); for (const [c, r, h, m] of flat) { const k = h + '|' + m; let e = byKey.get(k); if (!e) byKey.set(k, e = { h, m, cells: new Set() }); e.cells.add(r * cols + c); }
    for (const { h, m, cells } of byKey.values()) for (const i0 of cells) { if (!cells.has(i0)) continue; const c0 = i0 % cols, r0 = (i0 / cols) | 0; let c1 = c0; while (cells.has(r0 * cols + c1 + 1)) c1++;
      let r1 = r0; grow: while (true) { for (let c = c0; c <= c1; c++) if (!cells.has((r1 + 1) * cols + c)) break grow; r1++; }
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.delete(r * cols + c);
      quad(m, [X(c0), y(h), Z(r1 + 1)], [X(c1 + 1), y(h), Z(r1 + 1)], [X(c1 + 1), y(h), Z(r0)], [X(c0), y(h), Z(r0)], [0, 1, 0]); } }
  // Side faces: what of a column's segments its neighbour doesn't cover (floor risers below JOIN are bridged by the smooth tops).
  const sides = [[1, 0, [1, 0, 0]], [-1, 0, [-1, 0, 0]], [0, 1, [0, 0, 1]], [0, -1, [0, 0, -1]]], runs = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; for (const [dc, dr, n] of sides) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue; const other = segs[rr * cols + cc];
    for (const s of segs[i]) { let parts = [[s[0], s[1]]]; for (const o of other) { const next = []; for (const [a, b] of parts) { if (o[1] <= a || o[0] >= b) { next.push([a, b]); continue; } if (o[0] > a) next.push([a, o[0]]); if (o[1] < b) next.push([o[1], b]); } parts = next; }
      for (let [a, b] of parts) { if (b - a < .5) continue; const floorTop = isFloor(s) && Math.abs(b - s[1]) < .01; if (floorTop && b - a <= JOIN && other.some(o => isFloor(o) && Math.abs(o[1] - a) < .01)) continue;
        a -= isFloor(s) ? 0 : 16;   // walls reach a little below the floor in front of them (no seam under a smoothed edge)
        // the edge's two ends: (x0,z0) → (x1,z1), counter-clockwise seen from n
        const ex = dc === 1 ? X(c + 1) : dc === -1 ? X(c) : null, ez = dr === 1 ? Z(r + 1) : dr === -1 ? Z(r) : null;
        const [p0, p1] = ex !== null ? (dc === 1 ? [[ex, Z(r + 1)], [ex, Z(r)]] : [[ex, Z(r)], [ex, Z(r + 1)]]) : (dr === 1 ? [[X(c), ez], [X(c + 1), ez]] : [[X(c + 1), ez], [X(c), ez]]);
        let t0 = y(b), t1 = y(b); if (floorTop) { const k = topOf[i]?.get(s[1]); if (k) { const idx = dc === 1 ? [2, 1] : dc === -1 ? [0, 3] : dr === 1 ? [3, 2] : [1, 0]; t0 = y(k[idx[0]]); t1 = y(k[idx[1]]); } }
        if (t0 === y(b) && t1 === y(b)) { const plane = dc ? c + (dc > 0 ? 1 : 0) : r + (dr > 0 ? 1 : 0), along = dc ? r : c; runs.push([dc, dr, plane, a, b, s[2], along]); } else quad(s[2], [p0[0], y(a), p0[1]], [p1[0], y(a), p1[1]], [p1[0], t1, p1[1]], [p0[0], t0, p0[1]], n); } } } }
  // Flat wall faces merged along their edge (same plane, height span and material, neighbouring cells).
  runs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3] || p[4] - q[4] || (p[5] < q[5] ? -1 : p[5] > q[5] ? 1 : 0) || p[6] - q[6]);
  for (let i = 0; i < runs.length;) { const [dc, dr, plane, a, b, m, s0] = runs[i]; let j = i + 1, s1 = s0; while (j < runs.length && runs[j][0] === dc && runs[j][1] === dr && runs[j][2] === plane && runs[j][3] === a && runs[j][4] === b && runs[j][5] === m && runs[j][6] === s1 + 1) { s1++; j++; }
    const n = dc === 1 ? [1, 0, 0] : dc === -1 ? [-1, 0, 0] : dr === 1 ? [0, 0, 1] : [0, 0, -1];
    const [p0, p1] = dc ? (dc === 1 ? [[X(plane), Z(s1 + 1)], [X(plane), Z(s0)]] : [[X(plane), Z(s0)], [X(plane), Z(s1 + 1)]]) : (dr === 1 ? [[X(s0), Z(plane)], [X(s1 + 1), Z(plane)]] : [[X(s1 + 1), Z(plane)], [X(s0), Z(plane)]]);
    quad(m, [p0[0], y(a), p0[1]], [p1[0], y(a), p1[1]], [p1[0], y(b), p1[1]], [p0[0], y(b), p0[1]], n); i = j; }
  const meshes = []; for (const B of out.values()) { const m = B.m; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(B.UV, 2)); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, materialFor(m)); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.arena = true; meshes.push(mesh); }
  return meshes;
}
