// Where two parts of a classic map fail to connect: the closest pair of columns between what is walkable from a and
// what reaches b, with their floors and ceilings.   node tools/maps/barrier.mjs <id> <ax> <az> <bx> <bz>
import { ARENA_MAPS } from '../../dist/arena-maps.js'; import { MAXF } from '../../dist/cs-columns.js';
const [id, ...v] = process.argv.slice(2), [ax, az, bx, bz] = v.map(Number), M = ARENA_MAPS[id], nav = M.nav, G = nav.G, { cols, n, z } = G, STEP = 18, DROP = 260, BODY = 72;
const near = (m, h) => { for (let q = 0; q < n[m]; q++) if (Math.abs(z[m * MAXF + q] - h) <= STEP) return true; return false; };
function reach(start, rev) { const seen = new Uint8Array(n.length * MAXF), q = [start]; seen[start] = 1;
  while (q.length) { const u = q.pop(), i = (u / MAXF) | 0, h = z[u], c = i % cols, r = (i / cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (r + dr) * cols + c + dc; if (j < 0 || j >= n.length) continue; for (let kk = 0; kk < n[j]; kk++) { const hj = z[j * MAXF + kk], up = rev ? h - hj : hj - h, down = rev ? hj - h : h - hj;
      if (up > STEP || down > DROP || G.ceil[j * MAXF + kk] - Math.max(h, hj) < BODY) continue; const v2 = j * MAXF + kk; if (!seen[v2]) { seen[v2] = 1; q.push(v2); } } } } return seen; }
const ia = nav.cellOf(ax, az), ib = nav.cellOf(bx, bz), A = reach(ia * MAXF + n[ia] - 1, false), B = reach(ib * MAXF, true);
let best = null; const pts = []; for (let u = 0; u < A.length; u++) if (A[u]) pts.push(u); const bp = []; for (let u = 0; u < B.length; u++) if (B[u]) bp.push(u);
console.log('reach from a', pts.length, 'reach to b', bp.length);
const pos = u => { const i = (u / MAXF) | 0; return [-M.size[0] / 2 + (i % cols + .5) * nav.G.cols / nav.G.cols * (M.size[0] / cols), -M.size[1] / 2 + (((i / cols) | 0) + .5) * (M.size[1] / G.rows)]; };
for (let s = 0; s < pts.length; s += 3) { const p = pos(pts[s]); for (let t = 0; t < bp.length; t += 3) { const q2 = pos(bp[t]), d = Math.hypot(p[0] - q2[0], p[1] - q2[1]); if (!best || d < best[0]) best = [d, pts[s], bp[t]]; } }
const show = u => { const i = (u / MAXF) | 0, f = []; for (let k = 0; k < n[i]; k++) f.push(nav.toY(z[i * MAXF + k]).toFixed(1) + (G.ceil[i * MAXF + k] === Infinity ? '' : 'c' + nav.toY(G.ceil[i * MAXF + k]).toFixed(1))); return pos(u).map(x => x.toFixed(1)).join(',') + ' floor ' + nav.toY(z[u]).toFixed(1) + ' [' + f.join(' ') + '] ' + G.places[G.place[u]]; };
console.log('gap', best[0].toFixed(1), '\n  from side:', show(best[1]), '\n  goal side:', show(best[2]));
