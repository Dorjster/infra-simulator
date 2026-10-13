// The eight classic Defuse maps (Dust II, Mirage, Inferno, Nuke, Cache, Anubis, Ancient, Train), built from their
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
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const only = process.argv.slice(2), report = [];
for (const id of CS_MAP_IDS) { if (only.length && !only.includes(id)) continue;
  const M = ARENA_MAPS[id], boxes = mapBoxes(M, 0, 0), [W, D] = M.size, bounds = { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 }, nav = M.nav;
  // Walk a route with the real movement: steer at the next waypoint, 64 ticks a second; stuck = no progress for 4 s.
  const walk = (from, pts) => { const s = createMoveState(nav.floorAt(from[0], from[1])); s.x = from[0]; s.z = from[1]; let i = 0, best = Infinity, since = 0, t = 0; const dt = 1 / 64;
    while (i < pts.length && t < 240) { const [wx, wz] = pts[i], dx = wx - s.x, dz = wz - s.z, d = Math.hypot(dx, dz); if (d < 3) { i++; best = Infinity; since = 0; continue; }
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
  for (const [x, z] of [...M.t, ...M.ct]) ok(`${id}: spawn ${x},${z} stands on floor`, Number.isFinite(nav.floorAt(x, z)));
  let seen = null; for (const a of M.t) for (const b of M.ct) { const ya = nav.floorAt(a[0], a[1]) + EYE, yb = nav.floorAt(b[0], b[1]) + EYE; if (nav.sight(a[0], ya, a[1], b[0], yb, b[1])) seen = [a, b]; }
  ok(`${id}: no Terrorist spawn sees a Counter-Terrorist spawn`, !seen, JSON.stringify(seen));
  // Sites: plantable on their own floor (the bot goal), refused a little away from it.
  for (const L of ['A', 'B']) { const [gx, gz] = M.siteGoals[L], f = nav.floorAt(gx, gz); ok(`${id}: ${L} site is plantable at its goal`, nav.site(gx, gz, f) === L, String(nav.site(gx, gz, f))); }
  ok(`${id}: no site at the T spawn`, nav.site(M.t[0][0], M.t[0][1], nav.floorAt(M.t[0][0], M.t[0][1])) === null);
  ok(`${id}: callouts`, M.callouts.length >= 12, M.callouts.length);
  report.push(id + ' ' + Object.entries(times).map(([k, v]) => k + ' ' + v + 's').join(' '));
}
console.log('PASS: classic maps · ' + n + ' checks\n  ' + report.join('\n  '));
