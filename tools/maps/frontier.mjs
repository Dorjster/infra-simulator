// Route search diagnosis: from (ax, az, feet ay) towards (bx, bz), the reached column nearest the goal and the floors
// and ceilings round it (what stops the search).   node tools/maps/frontier.mjs <id> <ax> <az> <ay> <bx> <bz>
import { ARENA_MAPS } from '../../dist/arena-maps.js'; import { MAXF } from '../../dist/cs-columns.js';
const [id, ...v] = process.argv.slice(2), [ax, az, ay, bx, bz] = v.map(Number), M = ARENA_MAPS[id], nav = M.nav, G = nav.G, { cols, n, z } = G;
globalThis.__navDebug = {}; nav.route(ax, az, ay, bx, bz); const cost = globalThis.__navDebug.cost, ib = nav.cellOf(bx, bz), cb = ib % cols, rb = (ib / cols) | 0;
let best = -1, bd = Infinity; for (let u = 0; u < cost.length; u++) if (cost[u] < Infinity) { const i = (u / MAXF) | 0, d = Math.hypot(i % cols - cb, ((i / cols) | 0) - rb); if (d < bd) { bd = d; best = u; } }
const i0 = (best / MAXF) | 0, c0 = i0 % cols, r0 = (i0 / cols) | 0; console.log('nearest reached', bd.toFixed(1), 'columns from the goal, at col', c0, 'row', r0, 'floor', z[best], G.places[G.place[best]]);
for (let r = r0 - 4; r <= r0 + 4; r++) { let line = String(r).padStart(4); for (let c = c0 - 4; c <= c0 + 4; c++) { const i = r * cols + c, f = []; for (let k = 0; k < n[i]; k++) f.push((cost[i * MAXF + k] < Infinity ? '' : '!') + z[i * MAXF + k] + (G.ceil[i * MAXF + k] === Infinity ? '' : '^' + G.ceil[i * MAXF + k])); line += (f.join('/') || '·').padStart(17) + (c === c0 && r === r0 ? '*' : ' '); } console.log(line); }
