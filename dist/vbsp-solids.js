// What is solid in a Source map besides its brushes (the BSP tree): displacements (terrain — not in the tree) and the
// solid static props (crates, pillars, cars…), for bsp-map.js's collision columns. extraSpans(x, y) gives, on the
// vertical line at (x, y), [bottom, top] stretches (Hammer units): a displacement as a 12-unit slab under its surface
// (its top is the floor); a solid prop by its own shape — its triangles (vbsp-props.js) rasterised once into the
// 16-unit columns (a vertical line through each column's centre: solid from each way in to the way out, so an arch
// stays open underneath and a crate is solid through).
import { dispGrid } from './vbsp.js';
import { loadModel, propMatrix } from './vbsp-props.js';

const CELL = 32;   // the lookup grid (Hammer units)
export function sourceSolids(bsp, { bounds = null } = {}) {
  const tris = [];
  // Displacement triangles (the solid ones: Source marks non-solid displacements by their contents).
  for (const d of bsp.disps) { const g = dispGrid(bsp, d); if (!g) continue; const n = g.n, P = g.pts, at = i => [P[i * 4], P[i * 4 + 1], P[i * 4 + 2]];
    for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) { const a = r * n + c, b = a + 1, cc = a + n, dd = cc + 1; tris.push(at(a), at(b), at(dd), at(a), at(dd), at(cc)); } }
  // Solid props, by shape: per 16-unit column (global grid) the stretches their triangles enclose.
  const models = new Map(), propCols = new Map(), C16 = 16, hits = new Map(); let propCount = 0;
  for (const p of bsp.props) { if (!p.solid) continue; if (bounds && (p.origin[0] < bounds[0] - 512 || p.origin[0] > bounds[2] + 512 || p.origin[1] < bounds[1] - 512 || p.origin[1] > bounds[3] + 512)) continue;
    if (!models.has(p.model)) models.set(p.model, loadModel(bsp.pak, bsp.propModels[p.model])); const m = models.get(p.model); if (!m) continue;
    const T = propMatrix(p), lod = m.lods[m.lods.length - 1]; hits.clear(); propCount++;
    for (const mesh of lod) { const P = mesh.pos, I = mesh.idx, W = new Float32Array(P.length);
      for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; W[i] = T[0] * x + T[1] * y + T[2] * z + T[3]; W[i + 1] = T[4] * x + T[5] * y + T[6] * z + T[7]; W[i + 2] = T[8] * x + T[9] * y + T[10] * z + T[11]; }
      for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ax = W[a], ay = W[a + 1], bx = W[b], by = W[b + 1], cx = W[c], cy = W[c + 1], det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(det) < 1e-6) continue;
        const c0 = Math.ceil(Math.min(ax, bx, cx) / C16 - .5), c1 = Math.floor(Math.max(ax, bx, cx) / C16 - .5), r0 = Math.ceil(Math.min(ay, by, cy) / C16 - .5), r1 = Math.floor(Math.max(ay, by, cy) / C16 - .5);
        for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) { const x = (cc + .5) * C16, y = (r + .5) * C16, u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, w = 1 - u - v; if (u < 0 || v < 0 || w < 0) continue;
          const key = cc * 65536 + r, h = u * W[a + 2] + v * W[b + 2] + w * W[c + 2]; let l = hits.get(key); if (!l) hits.set(key, l = []); l.push(h); } } }
    for (const [key, l] of hits) { l.sort((x, y) => x - y); const out = propCols.get(key) || []; let k = 0; for (; k + 1 < l.length; k += 2) if (l[k + 1] - l[k] > .5) out.push([l[k], l[k + 1]]); else k--;   /* in → out pairs (a doubled hit at an edge counts once) */ if (k < l.length) out.push([l[l.length - 1] - 8, l[l.length - 1]]); if (out.length) propCols.set(key, out); } }
  // Lookup: each triangle / box in the grid cells its footprint covers.
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; if (bounds) [bx0, by0, bx1, by1] = bounds; else for (let i = 0; i < tris.length; i++) { bx0 = Math.min(bx0, tris[i][0]); by0 = Math.min(by0, tris[i][1]); bx1 = Math.max(bx1, tris[i][0]); by1 = Math.max(by1, tris[i][1]); }
  const cols = Math.max(1, Math.ceil((bx1 - bx0) / CELL)), rows = Math.max(1, Math.ceil((by1 - by0) / CELL)), grid = new Map(), add = (x0, y0, x1, y1, item) => {
    const c0 = Math.max(0, Math.floor((x0 - bx0) / CELL)), c1 = Math.min(cols - 1, Math.floor((x1 - bx0) / CELL)), r0 = Math.max(0, Math.floor((y0 - by0) / CELL)), r1 = Math.min(rows - 1, Math.floor((y1 - by0) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = r * cols + c; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(item); } };
  for (let i = 0; i < tris.length; i += 3) { const A = tris[i], B = tris[i + 1], C = tris[i + 2]; add(Math.min(A[0], B[0], C[0]), Math.min(A[1], B[1], C[1]), Math.max(A[0], B[0], C[0]), Math.max(A[1], B[1], C[1]), i); }
  return { tris: tris.length / 3, props: propCount, propColumns: propCols.size, extraSpans(x, y) {
    const pc = propCols.get(Math.floor(x / C16) * 65536 + Math.floor(y / C16)), c = Math.floor((x - bx0) / CELL), r = Math.floor((y - by0) / CELL), l = c < 0 || r < 0 || c >= cols || r >= rows ? null : grid.get(r * cols + c); if (!l && !pc) return null; const out = pc ? pc.slice() : []; if (!l) return out;
    for (const it of l) { if (typeof it === 'number') { const A = tris[it], B = tris[it + 1], C = tris[it + 2], d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(d) < 1e-6) continue;
        const u = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / d, v = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / d, w = 1 - u - v; if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
        const h = u * A[2] + v * B[2] + w * C[2]; out.push([h - 12, h]); }
      }
    return out; } };
}
