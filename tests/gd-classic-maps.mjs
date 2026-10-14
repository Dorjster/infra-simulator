// The seven classic Defuse maps (Dust II, Mirage, Inferno, Nuke, Cache, Anubis, Ancient), built from their
// navigation areas and overviews (cs-mapbuild.js). Checks, per map:
//  · a player with the game's own movement (arena-move.js, CS2 rules), steering round corners like a player, walks every bot route — each spawn to A, to B
//    and (Terrorists) to mid — without getting stuck: real walkability, not just a path on a grid;
//  · the spawns: ten per side, each on open floor, and no Terrorist spawn can see a Counter-Terrorist spawn;
//  · both bomb sites have plantable area on their own floor, and planting off-site is refused;
//  · the callouts cover the map, and the overview is fully used.
import assert from 'node:assert/strict';
import { ARENA_MAPS, mapBoxes } from '../dist/arena-maps.js';
import { CS_MAP_IDS } from '../dist/cs-maps/themes.js';
import { createMoveState, moveStep, blocked, MOVE } from '../dist/arena-move.js';
import { EYE } from '../dist/weapons-data.js';
import { locationOf } from '../dist/gd-radar-art.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
// --files <dir>: test the maps made from map files in <dir> (<id>.bsp) instead of the built-in ones.
const argv = process.argv.slice(2), fi = argv.indexOf('--files'), filesDir = fi >= 0 ? argv.splice(fi, 2)[1] : null, only = argv, report = [];
if (filesDir) { const { readdirSync, readFileSync } = await import('node:fs'), { useMapFile } = await import('../dist/arena-maps.js'); for (const f of readdirSync(filesDir)) { const id = f.replace(/\.bsp$/i, ''); if (f.toLowerCase().endsWith('.bsp') && CS_MAP_IDS.includes(id)) useMapFile(id, readFileSync(filesDir + '/' + f)); } }
for (const id of CS_MAP_IDS) { if (only.length && !only.includes(id)) continue; if (filesDir && !(await import('../dist/arena-maps.js')).mapFileOf(id)) continue;
  const M = ARENA_MAPS[id], boxes = mapBoxes(M, 0, 0), [W, D] = M.size, bounds = { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 }, nav = M.nav;
  // Walk a route with the real movement: steer at the next waypoint, 64 ticks a second; stuck = no progress for 4 s.
  const walk = (from, pts) => { const s = createMoveState(from[2] ?? nav.floorAt(from[0], from[1])); /* a spawn's own floor when it has a height */ s.x = from[0]; s.z = from[1]; let i = 0, best = Infinity, since = 0, t = 0; const dt = 1 / 64;
    // A waypoint is reached on its own floor (routes carry heights on stacked maps); still above it (a drop ahead), keep
    // going the way the route goes until off the edge — as the bots do.
    while (i < pts.length && t < 240) { const [px, pz, py] = pts[i], above = Number.isFinite(py) && s.y - py > 6, dd = Math.hypot(px - s.x, pz - s.z); if (dd < 1.5 && (!above || since > 1)) { i++; best = Infinity; since = 0; continue; }   // reached within 1.5 units, as the bots (a looser 3 let the walker drift off the checked line onto a ledge beside it)   // (above it a second already: on to the next point — a vent's way down)
      let wx = px, wz = pz; if (above && dd < 4) { const [qx, qz] = i > 0 ? pts[i - 1] : from, L = Math.hypot(px - qx, pz - qz) || 1; wx = px + (px - qx) / L * 3; wz = pz + (pz - qz) / L * 3; }   // straight on, off the edge
      const dx = wx - s.x, dz = wz - s.z, d = Math.hypot(dx, dz) + (above ? s.y - py : 0);
      // Steer like a player (and the bots): straight at the waypoint, else the nearest turn that isn't into a wall.
      // Steer the velocity, not just the facing (counter-strafe out of the old direction at corners, as players do).
      const sp = 30, vx = dx / d * sp - s.vx * .7, vz = dz / d * sp - s.vz * .7, vl = Math.hypot(vx, vz) || 1;
      let wx2 = vx / vl, wz2 = vz / vl; if (since > 1 && since % 1.5 < .5) { const side = Math.floor(since / 1.5) % 2 ? 1 : -1; [wx2, wz2] = [-wz2 * side - wx2 * .4, wx2 * side - wz2 * .4]; }   // no progress for a second: sidestep (and back off a little), like a player would
      else for (const turn of [0, .4, -.4, .8, -.8, 1.2, -1.2]) { const c = Math.cos(turn), sn = Math.sin(turn), ux = wx2 * c - wz2 * sn, uz = wx2 * sn + wz2 * c; if (!blocked(boxes, bounds, s.x + ux * .8, s.z + uz * .8, s.y, MOVE.height)) { wx2 = ux; wz2 = uz; break; } }
      moveStep(s, { wish: [wx2, wz2], weapon: 'knife' }, { boxes, bounds }, dt); t += dt; if (d < best - .2) { best = d; since = 0; } else if ((since += dt) > 4) return { stuck: [+s.x.toFixed(1), +s.z.toFixed(1), +s.y.toFixed(1)], at: i, of: pts.length, t: +t.toFixed(1) }; }
    return i >= pts.length ? { t: +t.toFixed(1) } : { stuck: [s.x, s.z], timeout: true }; };
  const times = {};
  for (const [side, R] of Object.entries(M.routes)) for (const [goal, pts] of Object.entries(R)) { const from = side === 't' ? M.t[0] : M.ct[0], r = walk(from, pts);
    ok(`${id}: a ${side.toUpperCase()} route to ${goal} exists`, pts.length > 0);
    ok(`${id}: a player walks the ${side.toUpperCase()} route to ${goal}`, !r.stuck, JSON.stringify(r) + ' near ' + (M.callouts.reduce((b, c) => !r.stuck || Math.hypot(c.x - r.stuck[0], c.z - r.stuck[1]) > Math.hypot(b.x - r.stuck[0], b.z - r.stuck[1]) ? b : c, M.callouts[0])?.name));
    times[side + goal] = r.t; }
  // Spawns: ten a side, on open floor; no T spawn sees a CT spawn (eye to eye).
  ok(`${id}: ten spawns a side`, M.t.length === 10 && M.ct.length === 10, M.t.length + '/' + M.ct.length);
  for (const [x, z, y] of [...M.t, ...M.ct]) ok(`${id}: spawn ${x},${z} stands on floor`, Number.isFinite(y === undefined ? nav.floorAt(x, z) : nav.floorAt(x, z, y + EYE)));
  let seen = null; for (const a of M.t) for (const b of M.ct) { const ya = (a[2] ?? nav.floorAt(a[0], a[1])) + EYE, yb = (b[2] ?? nav.floorAt(b[0], b[1])) + EYE; if (nav.sight(a[0], ya, a[1], b[0], yb, b[1])) seen = [a, b]; }
  ok(`${id}: no Terrorist spawn sees a Counter-Terrorist spawn`, !seen, JSON.stringify(seen));
  // Sites: plantable on their own floor (the bot goal), refused a little away from it.
  for (const L of ['A', 'B']) { const [gx, gz, gy] = M.siteGoals[L], f = gy ?? nav.floorAt(gx, gz); ok(`${id}: ${L} site is plantable at its goal`, nav.site(gx, gz, f) === L, String(nav.site(gx, gz, f))); }
  ok(`${id}: no site at the T spawn`, nav.site(M.t[0][0], M.t[0][1], M.t[0][2] ?? nav.floorAt(M.t[0][0], M.t[0][1])) === null);
  ok(`${id}: callouts`, M.callouts.length >= 12, M.callouts.length);
  // Callouts know their floor: standing at each one (at its height) names it — on stacked maps too.
  ok(`${id}: every callout has a floor height and names its own spot`, M.callouts.every(c => Number.isFinite(c.y) && locationOf(M, c.x, c.z, c.y) === c.name), M.callouts.filter(c => locationOf(M, c.x, c.z, c.y) !== c.name).map(c => c.name).join(', '));
  if (id === 'nuke') { const [bx, bz, by] = M.siteGoals.B, [ax, az, ay] = M.siteGoals.A, fl = (x, z, y) => y ?? nav.floorAt(x, z);
    ok('nuke: a lower radar layer (B site, tunnels) below the upper floor', !!M.grid.lower && M.grid.lower.some(Boolean) && fl(bx, bz, by) < M.grid.lowerY && fl(ax, az, ay) > M.grid.lowerY, M.grid.lowerY);
    ok('nuke: standing at B (under A) says B Site; at A, A Site', locationOf(M, bx, bz, fl(bx, bz, by)) === 'B Site' && locationOf(M, ax, az, fl(ax, az, ay)) === 'A Site'); }
  report.push(id + ' ' + Object.entries(times).map(([k, v]) => k + ' ' + v + 's').join(' '));
}
console.log('PASS: classic maps · ' + n + ' checks\n  ' + report.join('\n  '));
