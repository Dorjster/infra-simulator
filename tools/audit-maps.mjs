// Audits the maps made from map files (user-maps/<id>.bsp) against what the game collides with: every wall face you
// can stand next to must be solid behind it (no walking through), every floor face you can stand on must hold you
// (no falling through), and every spawn must be on open floor with room to stand. Reports the share of samples that
// fail and the worst spots (with their callouts), per map.
//   node --max-old-space-size=8192 tools/audit-maps.mjs [<dir> = user-maps] [ids…] [--json <file>]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { groundAt, createMoveState, moveStep } from '../dist/arena-move.js';
import { CS_MAP_IDS } from '../dist/cs-maps/themes.js';
import { locationOf } from '../dist/gd-radar-art.js';
import { boxesNear } from '../dist/box-grid.js';
import { MAXF, CELL } from '../dist/cs-columns.js';

const argv = process.argv.slice(2), ji = argv.indexOf('--json'), jsonOut = ji >= 0 ? argv.splice(ji, 2)[1] : null;
const dir = argv[0] && !CS_MAP_IDS.includes(argv[0]) ? argv.shift() : 'user-maps', only = argv;
// Faces that are not meant to be solid where they are drawn, or are drawn without collision on purpose.
const SKIP = /sky|clip|trigger|nodraw|null|hint|skip|origin|water|glass|window|grate|fence|chain|ladder|invis|black|toolsblock|bevel|aaatrigger|^!|^\+|^\{|foliage|leaves|plant|vine|grass_|tree|bush|wire|cable|rope|decal|overlay|light/i;
const out = {};
for (const id of CS_MAP_IDS) {
  if (only.length && !only.includes(id)) continue; const file = `${dir}/${id}.bsp`; if (!existsSync(file)) continue;
  const buf = readFileSync(file); useMapFile(id, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const M = ARENA_MAPS[id], boxes = mapBoxes(M, 0, 0), B = M.bsp; if (!B) { console.log(id + ': not from a file'); continue; }
  const vb = B.data.format === 'vbsp', src = vb ? B.data.source : B.data, T = B.toGame, P = src.planes, V = src.vertices;
  const nameOf = ti => vb ? (src.texdata[ti.texdata]?.name || '') : (src.textures[ti.tex]?.name || '');
  const [W, D] = M.size, bounds = { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 }, inside = (x, z) => Math.abs(x) < W / 2 - 2 && Math.abs(z) < D / 2 - 2;
  const near = [], solidAt = (x, y, z) => { for (const b of boxesNear(boxes, x - .1, z - .1, x + .1, z + .1, near)) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y > b.y0 && y < b.y1) return true; return false; };
  const verts = f => { const o = []; for (let i = 0; i < f.numEdges; i++) { const se = src.surfedges[f.firstEdge + i], e = Math.abs(se), v = src.edges[e * 2 + (se < 0 ? 1 : 0)]; o.push([V[v * 3], V[v * 3 + 1], V[v * 3 + 2]]); } return o; };
  // Where players can get to: the collision grid's floors flooded from the spawns — a step up (18 units), a jump up
  // (crouch-jump, 56), any drop — so walls and floors only out of reach (roofs, the far side of a clip) don't count.
  const C = M.columns, G = C.G, U = C.U, toBsp = (gx, gz, gy) => [(gx + C.W / 2) / U + G.x0, G.y1 - (gz + C.D / 2) / U, gy / U + C.zLow];
  const reach = new Uint8Array(G.cols * G.rows * MAXF), queue = [];
  const floorNear = (i, h, up = 20, down = 20) => { let best = -1, bd = Infinity; for (let k = 0; k < G.n[i]; k++) { const dz = G.z[i * MAXF + k] - h; if (dz <= up && dz >= -down && Math.abs(dz) < bd) { bd = Math.abs(dz); best = k; } } return best; };
  const cellAt = (x, y) => { const c = Math.floor((x - G.x0) / CELL), r = Math.floor((G.y1 - y) / CELL); return c < 0 || r < 0 || c >= G.cols || r >= G.rows ? -1 : r * G.cols + c; };
  for (const sp of [...M.t, ...M.ct]) { const y = sp[2] ?? M.nav.floorAt(sp[0], sp[1]), b = toBsp(sp[0], sp[1], y), i = cellAt(b[0], b[1]); if (i < 0) continue; const k = floorNear(i, b[2], 30, 30); if (k >= 0 && !reach[i * MAXF + k]) { reach[i * MAXF + k] = 1; queue.push(i * MAXF + k); } }
  while (queue.length) { const j = queue.pop(), i = (j / MAXF) | 0, h = G.z[j], c = i % G.cols, r = (i / G.cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= G.cols || rr >= G.rows) continue; const ni = rr * G.cols + cc;
      for (let k = 0; k < G.n[ni]; k++) { const nj = ni * MAXF + k, dz = G.z[nj] - h; if (!reach[nj] && dz <= 56 && dz >= -400) { reach[nj] = 1; queue.push(nj); } } } }
  const reachable = (gx, gz, gy) => { const b = toBsp(gx, gz, gy), i = cellAt(b[0], b[1]); if (i < 0) return false; const k = floorNear(i, b[2], 12, 12); return k >= 0 && !!reach[i * MAXF + k]; };
  const stats = { wallSamples: 0, wallHoles: 0, floorSamples: 0, floorHoles: 0 }, holes = [], floorBad = [];
  const world = src.models[0];
  for (let fi = world.firstFace; fi < world.firstFace + world.numFaces; fi++) {
    const f = src.faces[fi], ti = src.texinfo[f.texinfo]; if (!ti || (vb && f.disp >= 0)) continue; const name = nameOf(ti); if (SKIP.test(name)) continue;
    const pl = f.plane * 4, sg = f.side ? -1 : 1, n = [P[pl] * sg, P[pl + 1] * sg, P[pl + 2] * sg], W3 = verts(f); if (W3.length < 3) continue;
    // Area (for the sample count) and the face's own frame.
    let ax = 0, ay = 0, az = 0; for (let i = 1; i + 1 < W3.length; i++) { const a = W3[0], b = W3[i], c = W3[i + 1], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; ax += u[1] * v[2] - u[2] * v[1]; ay += u[2] * v[0] - u[0] * v[2]; az += u[0] * v[1] - u[1] * v[0]; }
    const area = Math.hypot(ax, ay, az) / 2; if (area < 256) continue;   // smaller than 16 × 16 units: trim
    const k = Math.min(12, Math.max(1, Math.round(area / 4096)));
    for (let s = 0; s < k; s++) {
      // A point on the face: a random mix of its corners (inside a convex face).
      const wts = W3.map(() => Math.random()), sum = wts.reduce((a, b) => a + b, 0), p = [0, 0, 0]; W3.forEach((v, i) => { for (let j = 0; j < 3; j++) p[j] += v[j] * wts[i] / sum; });
      if (Math.abs(n[2]) < .3) {   // a wall
        const o = T(p[0] + n[0] * 10, p[1] + n[1] * 10, p[2]), q = T(p[0] - n[0] * 3, p[1] - n[1] * 3, p[2]); if (!inside(o[0], o[2])) continue;
        const g = groundAt(boxes, o[0], o[2], o[1] + .2); if (!Number.isFinite(g) || o[1] - g < .4 || o[1] - g > 10) continue;   // nobody stands in front of it at this height
        { let top = -Infinity; for (const v of W3) top = Math.max(top, v[2]); if (T(p[0], p[1], top)[1] - g < 3.5) continue; }   // a step or a curb (stepped up, ~23 units): not a wall
        if (solidAt(o[0], o[1], o[2]) || solidAt(o[0], g + 1, o[2])) continue;                    // the front is itself blocked
        if (!reachable(o[0], o[2], g)) continue;                                                    // nobody gets there
        stats.wallSamples++; if (!solidAt(q[0], q[1], q[2])) { stats.wallSuspect = (stats.wallSuspect || 0) + 1;
          // Confirmed only if a player walking into it from the front gets through (the probe can miss a thin wall).
          const a = T(p[0], p[1], p[2]), b = T(p[0] + n[0], p[1] + n[1], p[2]), nx = b[0] - a[0], nz = b[2] - a[2], nl = Math.hypot(nx, nz) || 1, ux = nx / nl, uz = nz / nl;
          const far = T(p[0] + n[0] * 40, p[1] + n[1] * 40, p[2]), gf = groundAt(boxes, far[0], far[2], o[1] + .2); if (!Number.isFinite(gf) || Math.abs(gf - g) > 3 || solidAt(far[0], gf + 1, far[2])) continue;   /* start clear of the wall (40 units out: more than the body's radius) */
          const st = createMoveState(gf); st.x = far[0]; st.z = far[2]; let top = gf; for (let t = 0; t < 2; t += 1 / 64) { moveStep(st, { wish: [-ux, -uz], weapon: 'knife' }, { boxes, bounds }, 1 / 64); top = Math.max(top, st.y); }
          const dpl = (st.x - a[0]) * ux + (st.z - a[2]) * uz; if (dpl < -1.5 && top - gf < .9) {   /* through it at floor level (never stepped up onto it) */ stats.wallHoles++; holes.push({ at: q.map(v => +v.toFixed(1)), tex: name, where: locationOf(M, q[0], q[2], g), through: +dpl.toFixed(1) }); } }
      } else if (n[2] > .7) {   // a floor
        const g3 = T(p[0], p[1], p[2]); if (!inside(g3[0], g3[2])) continue; if (solidAt(g3[0], g3[1] + 1, g3[2]) || solidAt(g3[0], g3[1] + 8, g3[2])) continue;   // no room above: not walked on
        { const b = toBsp(g3[0], g3[2], g3[1]), i = cellAt(b[0], b[1]); let near = false; if (i >= 0) for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + dr * G.cols + dc; if (ni < 0 || ni >= G.cols * G.rows) continue; const k = floorNear(ni, b[2], 60, 60); if (k >= 0 && reach[ni * MAXF + k]) near = true; } if (!near) continue; }   // next to where players get
        stats.floorSamples++; const g = groundAt(boxes, g3[0], g3[2], g3[1] + 1.5); let fell = false;
        if (!Number.isFinite(g) || Math.abs(g - g3[1]) > 1.2) { const st = createMoveState(g3[1] + 1.5); st.x = g3[0]; st.z = g3[2]; st.onGround = false; for (let t = 0; t < 1; t += 1 / 64) moveStep(st, { wish: [0, 0], weapon: 'knife' }, { boxes, bounds }, 1 / 64); fell = st.y < g3[1] - 3; }   /* confirmed only if a player dropped on it falls through */
        if (fell) { stats.floorHoles++; floorBad.push({ at: g3.map(v => +v.toFixed(1)), ground: Number.isFinite(g) ? +g.toFixed(1) : null, tex: name, where: locationOf(M, g3[0], g3[2], g3[1]) }); }
      }
    }
  }
  // Spawns: on open floor, standing room.
  const spawnBad = []; for (const [side, list] of [['t', M.t], ['ct', M.ct]]) for (const sp of list) { const y = sp[2] ?? M.nav.floorAt(sp[0], sp[1]); if (!Number.isFinite(y) || solidAt(sp[0], y + 1, sp[1]) || solidAt(sp[0], y + 8, sp[1]) || Math.abs(groundAt(boxes, sp[0], sp[1], y + 1) - y) > 1) spawnBad.push({ side, at: sp }); }
  const group = list => { const m = new Map(); for (const h of list) { const k = h.where + ' · ' + h.tex; m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8); };
  out[id] = { ...stats, wallHolePct: +(100 * stats.wallHoles / Math.max(1, stats.wallSamples)).toFixed(2), floorHolePct: +(100 * stats.floorHoles / Math.max(1, stats.floorSamples)).toFixed(2), spawnBad, wallHoles: group(holes), floorHoles: group(floorBad), wallExamples: holes.slice(0, 5), floorExamples: floorBad.slice(0, 5) };
  const r = out[id]; console.log(`${id}: walls ${r.wallSamples} sampled, ${stats.wallSuspect || 0} probe misses, ${stats.wallHoles} walked through (${r.wallHolePct} %) · floors ${r.floorSamples}, ${stats.floorHoles} fallen through (${r.floorHolePct} %) · bad spawns ${spawnBad.length}`);
  for (const [k, c] of r.wallHoles) console.log('   wall  ' + c + '× ' + k); for (const [k, c] of r.floorHoles) console.log('   floor ' + c + '× ' + k);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
