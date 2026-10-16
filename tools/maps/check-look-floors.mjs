// Is every floor a player can stand on drawn? A CS2 map's look (its converted .glb) against its collision (the map
// file's columns): at every walkable floor spot (a 48-unit grid), a face of the look facing up within a few units of
// that floor. Lists where floors are missing, by CS2's place names, and whether CS2's own world export had them.
//   node tools/maps/check-look-floors.mjs <id> [look.glb] [export world.glb]
import { readFileSync, existsSync } from 'node:fs'; import os from 'node:os';
import { ARENA_MAPS, useMapFile } from '../../dist/arena-maps.js';
import { parseCs2Map } from '../../dist/cs2-map.js';
import { MAXF, NONE } from '../../dist/cs-columns.js';
const H0 = os.homedir() + '/CS2-extract', [id, lookFile = `${H0}/render/${id}.glb`, exportFile = `${H0}/export/${id}/world2/world.glb`] = process.argv.slice(2);
const buf = readFileSync(new URL(`../../user-maps/${id}.bsp`, import.meta.url)); useMapFile(id, buf); const M = ARENA_MAPS[id], C = M.columns, G = C.G, Hm = M.hammer, P = parseCs2Map(buf);
// Faces turned up of a glb, in Hammer units, bucketed on a 64-unit grid.
function floors(file) { if (!existsSync(file)) return null; const b = readFileSync(file), n = b.readUInt32LE(12), g = JSON.parse(b.subarray(20, 20 + n)), bin = b.subarray(20 + n + 8), K = 39.3701, cell = 64, buckets = new Map(), T = [];
  const mul = (A, B) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]; return o; };
  const local = nd => { if (nd.matrix) return nd.matrix; const [tx, ty, tz] = nd.translation || [0, 0, 0], [qx, qy, qz, qw] = nd.rotation || [0, 0, 0, 1], [sx, sy, sz] = nd.scale || [1, 1, 1];
    return [(1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0, 2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0, 2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0, tx, ty, tz, 1]; };
  const acc = i => { const a = g.accessors[i], v = g.bufferViews[a.bufferView]; return { a, st: v.byteStride, o: (v.byteOffset || 0) + (a.byteOffset || 0) }; };
  const walk = (ni, Pm) => { const nd = g.nodes[ni], W = mul(Pm, local(nd));
    if (nd.mesh != null) for (const pr of g.meshes[nd.mesh].primitives) { const mat = g.materials[pr.material]?.name || ''; if (/sky|clip|nodraw|invisible|toolsblock|water|decal|overlay/i.test(mat)) continue;
      const pa = acc(pr.attributes.POSITION), st = pa.st || 12, cnt0 = pa.a.count, V = new Float32Array(cnt0 * 3);
      for (let j = 0; j < cnt0; j++) { const o = pa.o + j * st, x = bin.readFloatLE(o), y = bin.readFloatLE(o + 4), z = bin.readFloatLE(o + 8), gx = W[0] * x + W[4] * y + W[8] * z + W[12], gy = W[1] * x + W[5] * y + W[9] * z + W[13], gz = W[2] * x + W[6] * y + W[10] * z + W[14]; V[j * 3] = gz * K; V[j * 3 + 1] = gx * K; V[j * 3 + 2] = gy * K; }
      const ia = pr.indices != null ? acc(pr.indices) : null, cnt = ia ? ia.a.count : cnt0, ix = j => ia ? (ia.a.componentType === 5125 ? bin.readUInt32LE(ia.o + j * 4) : bin.readUInt16LE(ia.o + j * 2)) : j;
      for (let t = 0; t < cnt; t += 3) { const a = ix(t) * 3, bb = ix(t + 1) * 3, c = ix(t + 2) * 3, ux = V[bb] - V[a], uy = V[bb + 1] - V[a + 1], uz = V[bb + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
        const nz = ux * vy - uy * vx, nl = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz); if (nl < 1e-9 || Math.abs(nz) / nl < .5) continue;
        const k = T.length; T.push(V[a], V[a + 1], V[a + 2], V[bb], V[bb + 1], V[bb + 2], V[c], V[c + 1], V[c + 2]);
        const lx = Math.min(V[a], V[bb], V[c]), hx = Math.max(V[a], V[bb], V[c]), ly = Math.min(V[a + 1], V[bb + 1], V[c + 1]), hy = Math.max(V[a + 1], V[bb + 1], V[c + 1]);
        for (let q = Math.floor(ly / cell); q <= Math.floor(hy / cell); q++) for (let p = Math.floor(lx / cell); p <= Math.floor(hx / cell); p++) { const key = q * 100000 + p; let L = buckets.get(key); if (!L) buckets.set(key, L = []); L.push(k); } } }
    for (const c of nd.children || []) walk(c, W); };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; for (const ni of g.scenes[g.scene || 0].nodes) walk(ni, I);
  return (x, y, z, below = 16, above = 10) => { const L = buckets.get(Math.floor(y / cell) * 100000 + Math.floor(x / cell)); if (!L) return false;
    for (const k of L) { const ax = T[k], ay = T[k + 1], bx = T[k + 3], by = T[k + 4], cx = T[k + 6], cy = T[k + 7], d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-9) continue;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, w = 1 - u - v; if (u < -.002 || v < -.002 || w < -.002) continue;
      const h = u * T[k + 2] + v * T[k + 5] + w * T[k + 8]; if (h >= z - below && h <= z + above) return true; } return false; }; }
const look = floors(lookFile), exp = floors(exportFile); if (!look) { console.log(id + ': no look'); process.exit(0); }
const placeOf = (x, y, z) => { let best = ''; for (const p of P.places) if (x >= p.mins[0] && x <= p.maxs[0] && y >= p.mins[1] && y <= p.maxs[1] && z >= p.mins[2] - 32 && z <= p.maxs[2] + 32) best = p.name; return best; };
let spots = 0; const miss = [], byPlace = new Map();
for (let r = 1; r < G.rows - 1; r += 3) for (let c = 1; c < G.cols - 1; c += 3) { const i = r * G.cols + c;
  for (let k = 0; k < G.n[i]; k++) { const h = G.z[i * MAXF + k]; if (h === NONE || G.ceil[i * MAXF + k] - h < 54) continue; spots++;
    const hx = Hm.x0 + (c + .5) * 16, hy = Hm.y1 - (r + .5) * 16;   // (columns are 16 units, from x0 / y1 in Hammer)
    // (a face within the column: its centre or a few units round it — a floor's own triangle edges, a grate's holes)
    let ok = false; for (const [dx, dy] of [[0, 0], [4, 4], [-4, -4], [4, -4], [-4, 4]]) if (look(hx + dx, hy + dy, h)) { ok = true; break; }
    // (none there: a floor drawn lower down — within 200 units under it — is one seen through an invisible clip a player
    // stands on, over props or a ledge, as in CS2; nothing under it at all is a hole: the sky seen through the floor)
    if (!ok) { const inExport = exp ? [[0, 0], [4, 4], [-4, -4]].some(([dx, dy]) => exp(hx + dx, hy + dy, h)) : null, pl = placeOf(hx, hy, h), under = look(hx, hy, h - 10, 200, 0) || look(hx + 4, hy + 4, h - 10, 200, 0);
      miss.push({ x: hx, y: hy, z: Math.round(h), place: pl, inExport, under }); if (!under) byPlace.set(pl, (byPlace.get(pl) || 0) + 1); } } }
const holes = miss.filter(m => !m.under);
console.log(`${id}: ${spots} floor spots · drawn ${spots - miss.length} (${((1 - miss.length / spots) * 100).toFixed(2)} %) · on a clip over a drawn floor ${miss.length - holes.length} · holes (nothing drawn under) ${holes.length} (export had ${holes.filter(m => m.inExport).length} of them)`);
console.log('  holes by place:', JSON.stringify([...byPlace].sort((a, b) => b[1] - a[1]).slice(0, 12)));
console.log('  holes:', JSON.stringify(holes.slice(0, process.env.ALL ? 1e9 : 8)));
