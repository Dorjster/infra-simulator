// CS2's own smoke lineups on Mirage (converted on this computer: user-maps/mirage.bsp), thrown with the game's physics:
// each lands in the place CS2's does (CS2's place volumes, from the map file) at about the time CS2's takes (its
// "air time", from a lineup site: until the smoke settles). The positions are CS2's getpos lines (setpos = the EYE,
// 64 units over the floor; setang: pitch down positive, yaw), plain left-click throws standing still. A wrong pitch remap,
// throw speed, start point, gravity or a collision that lets grenades through shows up here. Skipped without the map.
//   node tests/gd-lineups.mjs
import { readFileSync, existsSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { parseCs2Map } from '../dist/cs2-map.js';
import { throwStart, launch, stepNade } from '../dist/arena-nades.js';
const FILE = 'user-maps/mirage.bsp';
if (!existsSync(FILE) || readFileSync(FILE).subarray(0, 4).toString() !== 'CS2M') { console.log('SKIP: no converted CS2 Mirage on this computer'); process.exit(0); }
const buf = readFileSync(FILE), P = parseCs2Map(buf); if (!P.nadeMesh) { console.log('SKIP: this Mirage has no grenade mesh (convert it again)'); process.exit(0); }
useMapFile('mirage', buf); const M = ARENA_MAPS.mirage, H = M.hammer, U = H.U, cx = ARENA.cx, cz = ARENA.cz, boxes = mapBoxes(M, cx, cz), [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 };
const toGame = (x, y, z) => [cx + (x - H.x0) * U - H.W / 2, (z - H.zLow) * U, cz + (H.y1 - y) * U - H.D / 2], toH = (gx, gy, gz) => [H.x0 + (gx - cx + H.W / 2) / U, H.y1 - (gz - cz + H.D / 2) / U, H.zLow + gy / U];
const placeAt = q => P.places.filter(pl => q[0] >= pl.mins[0] - 16 && q[0] <= pl.maxs[0] + 16 && q[1] >= pl.mins[1] - 16 && q[1] <= pl.maxs[1] + 16 && q[2] >= pl.mins[2] - 48 && q[2] <= pl.maxs[2] + 48).map(pl => pl.name);
let pass = 0, fail = 0; const check = (name, ok, info) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ' · ' + info); };
// [name, where CS2's lands, CS2's air time (s), setpos x y z, setang pitch yaw] — www.cs2util.com/mirage/smoke/…
for (const [name, want, air, [x, y, z], [pitch, yaw]] of [
  ['Window smoke from cart', 'SnipersNest', 5.4, [360.075439, -691.96875, -100.067307], [-37.951241, 176.761139]],
  ['Jungle smoke from cart', 'Jungle', 6.6, [343.30954, -621.610291, -99.046494], [-42.075249, -148.328827]],
  ['B short smoke from cart', 'Catwalk', 3.6, [360.075439, -691.96875, -100.067307], [-24.971155, 160.756149]],
  ['Window smoke from underpass', 'SnipersNest', 2.6, [-968.03125, -380.064697, -288.06308], [-41.883251, -117.848106]],
]) {
  const p = pitch * Math.PI / 180, a = yaw * Math.PI / 180, f = [Math.cos(p) * Math.cos(a), Math.cos(p) * Math.sin(a), -Math.sin(p)], [ex, ey, ez] = toGame(x, y, z), A = { x: ex, y: ey, z: ez, dx: f[0], dy: f[2], dz: -f[1], strength: 'long' };
  const g = { kind: 'smoke', ...throwStart(A, boxes, bounds), ...launch(A), still: 0 }; let t = 0; for (; t < 12 && !g.rest; t += 1 / 64) stepNade(g, boxes, bounds, 1 / 64);
  const end = toH(g.x, g.y, g.z), at = placeAt(end);
  check(name + ': lands where CS2\'s does, when', at.includes(want) && Math.abs(t - air) <= .4, `${at.join('/') || 'nowhere named'} at ${end.map(Math.round).join(', ')} after ${t.toFixed(2)} s (CS2: ${want}, ${air} s)`);
}
console.log((fail ? 'FAIL' : 'PASS') + ': CS2 lineups on Mirage · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
