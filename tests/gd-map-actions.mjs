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
      for (let k = 0; k < 64 * 8; k++) { moveStep(s, inp, world, dt); top = Math.max(top, s.y); if (top >= L.y1 - 1.5) break; }
      // …and off it onto the floor at its top: forward over the lip (a ledge behind the ladder), or — a ladder up a shaft
      // or through a hatch — to the side or back, as in CS2 (the keys as you look at the ladder); within a body's height
      // under its top, clear of it.
      const away = t => t.x < L.minX - MOVE.radius || t.x > L.maxX + MOVE.radius || t.z < L.minZ - MOVE.radius || t.z > L.maxZ + MOVE.radius;
      let left = false; for (const wish of [[dx, dz], [dz, -dx], [-dz, dx], [-dx, -dz]]) { const t = { ...s };
        for (let k = 0; k < 64 * 3 && !left; k++) { moveStep(t, { ...inp, wish }, world, dt); left = t.onGround && !t.onLadder && t.y >= L.y1 - 10 && away(t); } if (left) break; }
      return { top, left }; };
    const runs = sides.map(climb), top = Math.max(...runs.map(r => r.top)), steppedOff = runs.some(r => r.left);
    // (to its top — or, where a ceiling over the shaft stops the head short of it (Nuke's vent: CS2's grate), till you can
    // step off there)
    check(`${id}: ladder ${i + 1} climbs to its top (${(L.y1 - L.y0).toFixed(0)} units)`, top >= L.y1 - 1.5 || steppedOff && top >= L.y1 - 3, `reached ${(top - L.y0).toFixed(1)} of ${(L.y1 - L.y0).toFixed(1)}`);
    check(`${id}: ladder ${i + 1}: at the top you step off onto the floor`, steppedOff); });
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
  // Nuke's vent (A ↔ the duct to the tunnels): its grille on A (a breakable here — CS2's openable vent) keeps you out
  // while whole; broken, you walk in, take the ladder down to the duct, and the way back up steps out onto A.
  const gi = (M.movers || []).findIndex(m => m.lookBounds), vl = ladders.findIndex(L => Math.abs((L.minX + L.maxX) / 2 - cx - 34.3) < 1 && Math.abs((L.minZ + L.maxZ) / 2 - cz - 64.5) < 1);
  if (id === 'nuke' && gi >= 0 && vl >= 0) { const L = ladders[vl], g = M.movers[gi].box, run = (s, secs, inp, stop) => { for (let k = 0; k < secs * 64 && !(stop && stop(s)); k++) moveStep(s, inp, world, dt); return s; };
    for (const broken of [false, true]) { applyMapState(boxes, { doors: {}, broken: broken ? { [gi]: 1 } : {} });
      const a = createMoveState(g[4]); a.x = L.maxX + 1.1; a.z = cz + g[2] - 9; a.y = g[4];
      run(a, 2, { wish: [0, 1], weapon: 'knife', look: [0, 1], pitch: 0 }, s => s.z > cz + 60.3); run(a, .4, { wish: [0, 0], weapon: 'knife', look: [-1, 0], pitch: -.8 }); run(a, 3, { wish: [-1, 0], weapon: 'knife', look: [-1, 0], pitch: -.8 });
      if (!broken) check('nuke: the vent grille on A, whole, keeps you out of the vent', a.y > L.y1 - 4 && a.z < g[2]);
      else { check('nuke: the vent grille broken, you walk in and take its ladder down to the duct', a.onGround && Math.abs(a.y - L.y0) < 5.5 && Math.abs(a.x - L.maxX) < 2.5, `(${(a.x - cx).toFixed(1)}, ${(a.z - cz).toFixed(1)}) y ${a.y.toFixed(1)}`);
        const u = createMoveState(a.y); Object.assign(u, { x: L.maxX + 1.1, z: (L.minZ + L.maxZ) / 2, y: a.y }); run(u, 3, { wish: [-1, 0], weapon: 'knife', look: [-1, 0], pitch: .5 }); run(u, 1.5, { wish: [0, -1], weapon: 'knife', look: [-1, 0], pitch: .5 }); run(u, 1, { wish: [0, -1], weapon: 'knife', look: [0, -1], pitch: 0 });
        check('nuke: …and up the vent ladder, out through the broken grille onto A', u.onGround && Math.abs(u.y - g[4]) < .5 && u.z < g[2] - 2, `(${(u.x - cx).toFixed(1)}, ${(u.z - cz).toFixed(1)}) y ${u.y.toFixed(1)}`); } }
    applyMapState(boxes, null); }
}
console.log((ok === n ? 'PASS' : 'FAIL') + ': map actions (ladders, doors, breakables) · ' + ok + '/' + n); if (ok !== n) process.exitCode = 1;
