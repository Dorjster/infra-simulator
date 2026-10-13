// Alignment check: overview mask (blue = floor, grey = cover, red = site, white = line) with the raw navigation areas
// on top (green outline fill). They must line up for the map to build right.
//   node tools/maps/align.mjs <id> <out.png> [maskName]
import { writeFileSync } from 'node:fs'; import { writePNG } from './png-write.mjs'; import { CELL } from '../../dist/cs-columns.js';
const [id, out, which = 'mask'] = process.argv.slice(2), nav = (await import('../../dist/cs-maps/' + id + '-nav.js')).default, { x0, y1, cols, rows } = nav.grid;
const m = new Uint8Array(cols * rows); { let i = 0; const s = nav[which]; for (let p = 0; p < s.length; p += 2) { m.fill(+s[p], i, i + parseInt(s[p + 1], 36)); i += parseInt(s[p + 1], 36); } }
const nv = new Uint8Array(cols * rows); for (const a of nav.areas) { if (which === 'mask2' ? !(a[4] < nav.split.top) : nav.split && a[4] < nav.split.top) continue; for (let r = Math.floor((y1 - a[3]) / CELL); r <= Math.floor((y1 - a[1]) / CELL); r++) for (let c = Math.floor((a[0] - x0) / CELL); c <= Math.floor((a[2] - x0) / CELL); c++) if (r >= 0 && c >= 0 && r < rows && c < cols) nv[r * cols + c] = 1; }
const px = new Uint8Array(cols * rows * 4), COL = [[0, 0, 0], [40, 60, 140], [130, 130, 140], [150, 30, 50], [230, 230, 230]];
for (let i = 0; i < cols * rows; i++) { const c = COL[m[i]]; px[i * 4] = nv[i] ? (c[0] + 60) / 2 : c[0]; px[i * 4 + 1] = nv[i] ? 200 : c[1]; px[i * 4 + 2] = nv[i] ? c[2] / 2 : c[2]; px[i * 4 + 3] = 255; }
writeFileSync(out, writePNG(cols, rows, px));
