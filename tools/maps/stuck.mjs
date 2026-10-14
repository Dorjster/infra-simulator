// What stops a player at (x, z) feet y on a classic map: the boxes in the way of a step in each direction and the
// floor columns around.   node tools/maps/stuck.mjs <id> <x> <z> <y>
import { ARENA_MAPS, mapBoxes } from '../../dist/arena-maps.js'; import { MOVE, groundAt } from '../../dist/arena-move.js'; import { MAXF } from '../../dist/cs-columns.js';
const [id, X, Zs, Ys] = process.argv.slice(2), x = +X, z = +Zs, y = +Ys, M = ARENA_MAPS[id], boxes = mapBoxes(M, 0, 0), nav = M.nav, G = nav.G;
console.log('ground here', groundAt(boxes, x, z, y).toFixed(2), 'nav floor', nav.floorAt(x, z, y).toFixed(2), 'top', nav.floorAt(x, z).toFixed(2));
for (const [dx, dz, nm] of [[1.5, 0, 'E'], [-1.5, 0, 'W'], [0, 1.5, 'S'], [0, -1.5, 'N']]) { const nx = x + dx, nz = z + dz, R = MOVE.radius;
  const hit = boxes.filter(b => b.y1 > y + MOVE.step && b.y0 < y + MOVE.height && nx > b.minX - R && nx < b.maxX + R && nz > b.minZ - R && nz < b.maxZ + R);
  console.log(nm, hit.length ? hit.slice(0, 3).map(b => `${b.mat} y${b.y0.toFixed(1)}-${b.y1.toFixed(1)} x${b.minX.toFixed(1)}..${b.maxX.toFixed(1)} z${b.minZ.toFixed(1)}..${b.maxZ.toFixed(1)}${b.walk ? ' walk' : ''}`).join(' | ') : 'free'); }
const i0 = nav.cellOf(x, z), c0 = i0 % G.cols, r0 = (i0 / G.cols) | 0, toY = h => nav.toY(h).toFixed(1);
for (let r = r0 - 3; r <= r0 + 3; r++) { let line = ''; for (let c = c0 - 4; c <= c0 + 4; c++) { const i = r * G.cols + c, f = []; for (let k = 0; k < G.n[i]; k++) f.push(toY(G.z[i * MAXF + k]) + (G.flags[i] & 1 ? 'c' : '')); line += (f.join('/') || '·').padStart(11) + (c === c0 && r === r0 ? '*' : ' '); } console.log(line); }
