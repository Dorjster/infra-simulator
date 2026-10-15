// Map files' ladders, doors and breakables with the real movement (arena-move.js): every ladder is climbed from its foot to
// its top (walking into its face, looking up); every door blocks a walk through its doorway while shut and lets it through
// once opened (either way); every breakable stops blocking once broken.
//   node tests/gd-map-actions.mjs --files <dir> [map ids…]   (dir: <id>.bsp map files, e.g. Counter-Strike 2's converted ones)
import { readdirSync, readFileSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes, applyMapState } from '../dist/arena-maps.js';
import { FILE_MAP_IDS } from '../dist/cs-maps/themes.js';
import { createMoveState, moveStep, MOVE } from '../dist/arena-move.js';
import { ARENA } from '../dist/facility-layout.js';
const argv = process.argv.slice(2), fi = argv.indexOf('--files'), dir = fi >= 0 ? argv.splice(fi, 2)[1] : null, only = argv;
if (!dir) { console.log('usage: node tests/gd-map-actions.mjs --files <dir> [ids]'); process.exit(1); }
let n = 0, ok = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const dt = 1 / 64, cx = ARENA.cx, cz = ARENA.cz;
for (const f of readdirSync(dir)) { const id = f.replace(/\.bsp$/i, ''); if (!f.endsWith('.bsp') || !FILE_MAP_IDS.includes(id) || (only.length && !only.includes(id))) continue;
  useMapFile(id, readFileSync(dir + '/' + f)); const M = ARENA_MAPS[id], boxes = mapBoxes(M, cx, cz), [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 };
  const ladders = (M.ladders || []).map(([a, b, c, d, y0, y1]) => ({ minX: cx + a, maxX: cx + b, minZ: cz + c, maxZ: cz + d, y0, y1 })), world = { boxes, bounds, ladders };
  const solidAt = (x, z, y) => boxes.some(b => !b.off && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y > b.y0 && y < b.y1);
  // Ladders: start a body's width out from its face on the open side (the other side is the wall), walk in, look up.
  ladders.forEach((L, i) => { const thinX = L.maxX - L.minX < L.maxZ - L.minZ, mx = (L.minX + L.maxX) / 2, mz = (L.minZ + L.maxZ) / 2, y = L.y0 + 1, off = MOVE.radius + .6;
    const sides = thinX ? [[L.minX - off, mz, 1, 0], [L.maxX + off, mz, -1, 0]] : [[mx, L.minZ - off, 0, 1], [mx, L.maxZ + off, 0, -1]];
    // From either side (whichever you'd come from — behind a thin wall may be another room's floor): the best climb.
    const climb = ([sx, sz, dx, dz]) => { const f = M.nav?.floorAt?.(sx - cx, sz - cz, L.y0 + 6), y0 = Number.isFinite(f) && L.y0 - f < 8 && f - L.y0 < 3 ? f : L.y0;
      const s = createMoveState(y0); s.x = sx; s.z = sz; s.y = y0; let top = s.y; const inp = { wish: [dx, dz], weapon: 'knife', look: [dx, dz], pitch: .35 };
      for (let k = 0; k < 64 * 8; k++) { moveStep(s, inp, world, dt); top = Math.max(top, s.y); if (top >= L.y1 - 1.5) break; } return top; };
    const top = Math.max(...sides.map(climb));
    check(`${id}: ladder ${i + 1} climbs to its top (${(L.y1 - L.y0).toFixed(0)} units)`, top >= L.y1 - 1.5, `reached ${(top - L.y0).toFixed(1)} of ${(L.y1 - L.y0).toFixed(1)}`); });
  // Doors: a walk straight through the doorway (across the door's thin side, at its middle): blocked shut, through open.
  (M.movers || []).forEach((m, id2) => { if (m.kind === 'break') return; const b = m.box, thinX = b[1] - b[0] < b[3] - b[2], mx = cx + (b[0] + b[1]) / 2, mz = cz + (b[2] + b[3]) / 2, y = b[4] + .2, far = 4;
    const walk = (open, sg) => { applyMapState(boxes, { doors: open ? { [id2]: { open: 1, side: sg } } : {}, broken: {} }); const s = createMoveState(y); s.y = y;
      const [x0, z0, ddx, ddz] = thinX ? [mx - far, mz, 1, 0] : [mx, mz - far, 0, 1]; s.x = x0; s.z = z0;
      for (let k = 0; k < 64 * 3; k++) moveStep(s, { wish: [ddx, ddz], weapon: 'knife', look: [ddx, ddz], pitch: 0 }, world, dt);
      return thinX ? s.x > mx + 1 : s.z > mz + 1; };
    const shut = walk(false, 1), openA = walk(true, 1), openB = walk(true, -1); applyMapState(boxes, null);
    check(`${id}: door ${id2} blocks the doorway shut`, !shut); check(`${id}: door ${id2} lets you through open`, openA || openB, `+${openA} −${openB}`); });
  (M.movers || []).forEach((m, id2) => { if (m.kind !== 'break') return; applyMapState(boxes, { doors: {}, broken: { [id2]: 1 } }); const off = boxes.filter(b => b.mover === id2).every(b => b.off); applyMapState(boxes, null);
    check(`${id}: breakable ${id2} stops blocking once broken`, off); });
}
console.log((ok === n ? 'PASS' : 'FAIL') + ': map actions (ladders, doors, breakables) · ' + ok + '/' + n); if (ok !== n) process.exitCode = 1;
