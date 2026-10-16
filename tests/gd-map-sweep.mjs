// Every chunk of every CS2 map (user-maps, converted on this computer), walked with the game's own movement: on a
// grid every 48 Hammer units over every floor a player can reach (the map's columns: floors reached from the spawns),
//   · there, a crouched body is in no solid (a spot you can reach is one you can be at — vents are crawled);
//   · dropped from just above it, the body comes to rest on that floor (no hole to fall through);
//   · walking from it a moment each way (N, E, S, W), the body never falls out of the map (below its lowest floor),
//     never drops 400 units or more (no floor that far under a walkable one — Anubis' canal bed once ended over the
//     bottom of the world), and stays on CS2's radar of the map (when its radar is extracted: export/radar).
// (CS2_RADAR: the radar folder, default ~/CS2-extract/export/radar.)
// Anomalies are listed with their place (CS2's place names) and spot, and written to <out>/sweep-<map>.json.
//   node tests/gd-map-sweep.mjs [--files user-maps] [--out dir] [map ids…]
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { FILE_MAP_IDS } from '../dist/cs-maps/themes.js';
import { createMoveState, moveStep, blocked, MOVE, HU } from '../dist/arena-move.js';
import { ARENA } from '../dist/facility-layout.js';
import { MAXF, NONE } from '../dist/cs-columns.js';
import os from 'node:os'; import { radarMask } from '../tools/maps/radar-mask.mjs';
const RADARS = process.env.CS2_RADAR || os.homedir() + '/CS2-extract/export/radar';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const dir = opt('--files') || 'user-maps', out = opt('--out') || null, only = argv;
if (!existsSync(dir)) { console.log('SKIP: no map files in ' + dir); process.exit(0); }
if (out) mkdirSync(out, { recursive: true });
const dt = 1 / 64, cx = ARENA.cx, cz = ARENA.cz; let total = 0, bad = 0;
for (const f of readdirSync(dir).sort()) { const id = f.replace(/\.bsp$/i, ''); if (!f.endsWith('.bsp') || !FILE_MAP_IDS.includes(id) || (only.length && !only.includes(id))) continue;
  const buf = readFileSync(dir + '/' + f); if (buf.subarray(0, 4).toString() !== 'CS2M') continue;
  useMapFile(id, buf); const M = ARENA_MAPS[id], C = M.columns, G = C?.G; if (!G) { console.log(id + ': no columns'); continue; }
  const boxes = mapBoxes(M, cx, cz); for (const b of boxes.movers || []) b.off = true;   // (doors open, panes and vents broken: the map's own shapes walked — doors have their own tests)
  const [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 }, world = { boxes, bounds, ladders: [] };
  const place = (x, z) => { for (const p of M.places || []) if (p.poly ? false : (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1)) return p.name; return M.calloutAt?.(x - cx, z - cz) || ''; };
  const where = (x, z, y) => ({ x: +(x - cx).toFixed(1), z: +(z - cz).toFixed(1), y: +y.toFixed(1), hammer: M.hammer ? [Math.round((x - cx + M.hammer.W / 2) / M.hammer.U + M.hammer.x0), Math.round(M.hammer.y1 - (z - cz + M.hammer.D / 2) / M.hammer.U)] : null, place: M.locationAt?.(x - cx, z - cz, y) || '' });
  let low = Infinity; for (let i = 0; i < G.cols * G.rows; i++) for (let k = 0; k < G.n[i]; k++) low = Math.min(low, (G.z[i * MAXF + k] - C.zLow) * C.U);
  const res = { map: id, spots: 0, stuck: [], holes: [], void: [], far: [], off: [] }, step = 3;   // (every 3rd column: 48 HU)
  const RM = existsSync(RADARS) ? radarMask(RADARS, id) : null, H = M.hammer, offRadar = (x, z) => RM && H && !RM.inPlay((x - cx + H.W / 2) / H.U + H.x0, H.y1 - (z - cz + H.D / 2) / H.U);
  for (let r = 1; r < G.rows - 1; r += step) for (let c = 1; c < G.cols - 1; c += step) { const i = r * G.cols + c;
    for (let k = 0; k < G.n[i]; k++) { const h = G.z[i * MAXF + k]; if (h === NONE || G.ceil[i * MAXF + k] - h < 54) continue;   /* (room to crouch over it: a floor you can be on — the rest are ledges kept beside walls) */ const y = (h - C.zLow) * C.U, x = cx - C.W / 2 + (c + .5) * C.cell, z = cz - C.D / 2 + (r + .5) * C.cell; res.spots++;
      // Standing: in no solid (a little clearance: the body's radius less a hair — a spot beside a wall is fine).
      if (blocked(boxes, bounds, x, z, y + .05, MOVE.duckHeight * .95, MOVE.radius * .5)) { res.stuck.push(where(x, z, y)); continue; }   // (crouched: a floor under a low ceiling is crawled — a vent)
      // Dropped from just above: rests on this floor.
      { const s = createMoveState(y + 1.5); s.x = x; s.z = z; s.y = y + 1.5; s.onGround = false; for (let t = 0; t < 64; t++) moveStep(s, { wish: [0, 0], weapon: 'knife' }, world, dt); if (s.y < y - 3) res.holes.push({ ...where(x, z, y), fellTo: +s.y.toFixed(1) }); }
      // Walking each way a moment: never out of the map.
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const s = createMoveState(y); s.x = x; s.z = z; s.y = y; for (let t = 0; t < 40; t++) moveStep(s, { wish: [dx, dz], weapon: 'knife' }, world, dt);
        for (let t = 0; t < 64; t++) moveStep(s, { wish: [0, 0], weapon: 'knife' }, world, dt); if (s.y < low - 4) { res.void.push({ ...where(x, z, y), dir: [dx, dz], fellTo: +s.y.toFixed(1) }); break; }
        if (y - s.y >= 400 * HU) { res.far.push({ ...where(x, z, y), dir: [dx, dz], fellTo: +s.y.toFixed(1) }); break; }
        if (offRadar(s.x, s.z)) { res.off.push({ ...where(x, z, y), dir: [dx, dz], to: where(s.x, s.z, s.y) }); break; } } } }
  const n = res.stuck.length + res.holes.length + res.void.length + res.far.length + res.off.length; total += res.spots; bad += n;
  console.log(`${id.padEnd(9)} ${res.spots} spots · stuck in a solid ${res.stuck.length} · holes ${res.holes.length} · fell out of the map ${res.void.length} · fell 400+ ${res.far.length} · off the radar ${RM ? res.off.length : '(no radar)'}`);
  for (const [k, L] of [['stuck', res.stuck], ['hole', res.holes], ['void', res.void], ['far', res.far], ['off', res.off]]) for (const a of L.slice(0, 4)) console.log(`   ${k}: ${JSON.stringify(a)}`);
  if (out) writeFileSync(`${out}/sweep-${id}.json`, JSON.stringify(res, null, 1));
}
console.log(`map sweep · ${total} spots walked · ${bad} anomalies`); if (bad) process.exitCode = 1;
