// Top view of a rasterised map: floor height as colour (low blue → high yellow), stacked columns hatched, nothing = black.
//   node tools/maps/preview.mjs <id> <out.png>
import { writeFileSync } from 'node:fs'; import { rasterize, MAXF } from '../../dist/cs-columns.js'; import { writePNG } from './png-write.mjs';
const [id, out] = process.argv.slice(2), nav = (await import('../../dist/cs-maps/' + id + '-nav.js')).default, G = rasterize(nav, { navFootprint: id === 'train' });
let lo = Infinity, hi = -Infinity; for (let i = 0; i < G.n.length; i++) for (let k = 0; k < G.n[i]; k++) { lo = Math.min(lo, G.z[i * MAXF + k]); hi = Math.max(hi, G.z[i * MAXF + k]); }
const S = 2, W = G.cols * S, H = G.rows * S, px = new Uint8Array(W * H * 4);
for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) { const i = r * G.cols + c, k = G.n[i]; let col = [0, 0, 0];
  if (k) { const t = (G.z[i * MAXF + k - 1] - lo) / (hi - lo || 1); col = [40 + 215 * t, 60 + 160 * t, 200 - 170 * t]; }
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const p = ((r * S + dy) * W + c * S + dx) * 4, hatch = k > 1 && (dx + dy) % 2 === 0; px[p] = hatch ? 255 : col[0]; px[p + 1] = hatch ? 60 : col[1]; px[p + 2] = hatch ? 200 : col[2]; px[p + 3] = 255; } }
// Seams (neighbouring top floors 18–48 HU apart, no crate): red dots.
for (let r = 0; r < G.rows - 1; r++) for (let c = 0; c < G.cols - 1; c++) { const i = r * G.cols + c; if (!G.n[i] || G.flags[i] & 1) continue; for (const j of [i + 1, i + G.cols]) { if (!G.n[j] || G.flags[j] & 1) continue; const dz = Math.abs(G.z[i * MAXF + G.n[i] - 1] - G.z[j * MAXF + G.n[j] - 1]); if (dz > 18 && dz <= 48) for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const p = ((r * S + dy) * W + c * S + dx) * 4; px[p] = 255; px[p + 1] = 0; px[p + 2] = 0; } } }
writeFileSync(out, writePNG(W, H, px)); console.log(id, G.cols + '×' + G.rows, 'z', lo.toFixed(0), hi.toFixed(0), 'stacked', G.n.reduce((s, v) => s + (v > 1), 0));
