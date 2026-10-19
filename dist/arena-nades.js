// Global Defensive grenades, run by the host: HE, flashbang, smoke and molotov. Shared with every client (the
// trajectory preview and the fire area use the same functions, so what you see is what the host does).
// State machine (one grenade, host side): air (flies, bounces) → effect (boom / pop / smoke / fire) → gone.
// Client side (weapons.js): equipped → pin pulled (press) → held → released (throw) → this.
//  · Throw: from your eye along your aim (a little upwards); left = full throw, right = short underhand, both = medium;
//    your running speed carries over. A full throw crosses most of the map.
//  · HE: explodes 1.8 s after the throw · up to 98 damage within 62 units, less with distance; walls and crates block it.
//  · Flashbang: pops after 1.6 s · each client works out how blinded it is (3D line of sight from the eye, facing,
//    distance; smoke and walls block); bots that see it can't shoot for a moment.
//  · Smoke: blooms when it stops rolling (or after 3.5 s) · an 18 s cloud, 44 units across, that no one sees through.
//  · Molotov: bursts on landing (or after 2.2 s) · 7 s of fire over up to 37 units around, spreading only over the
//    floor it landed on (walls and drops stop it); burns anyone standing in it.
import { EYE } from './weapons-data.js';
import { hurt, isDown, recording, statOf } from './combat-logic.js';
import { lineOfSight, segmentClear, ARENA_MAPS, floorAt } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { boxesNear } from './box-grid.js';
const SO = [], FA = [], FB = [], GU = [];   // nearby boxes per query (box-grid.js)

const HU = 2.54 / 16.5;
export const NADES = {
  // (fuses, CS2's: an HE and a flash go off 1.5 s after the throw; a smoke once it rests, 1.5 s at the earliest; a
  // molotov on the first floor it hits, or bursts after 2 s in the air)
  he: { id: 'he', name: 'HE Grenade', kind: 'nade', price: 300, fuse: 1500, dmg: 98, radius: 62 },
  flash: { id: 'flash', name: 'Flashbang', kind: 'nade', price: 200, fuse: 1500, radius: 2000 * HU },
  smoke: { id: 'smoke', name: 'Smoke Grenade', kind: 'nade', price: 300, fuse: 1500, radius: 144 * HU, lasts: 18000, maxAir: 12000 },   // (CS2's cloud: 144 units round, about 150 high)
  molotov: { id: 'molotov', name: 'Molotov', kind: 'nade', price: 400, fuse: 2000, radius: 37, lasts: 7000, dps: 40, airburst: 128 * HU },
};
export const NADE_IDS = Object.keys(NADES), MAX_NADES = 4, MAX_FLASH = 2;
// Flight, exactly CS2's (Source) grenade physics in our units (1 hammer unit = HU): a throw leaves at 675 u/s × the
// strength's power (long 1.0, medium 0.65, short 0.3), under 0.4 × 800 u/s² gravity; bounces keep 45 %.
export const GRAVITY = 320 * HU, THROW = 675 * HU, BOUNCE = .45, R = .35;
export const STRENGTH = { long: 1, medium: .5, short: .25 };   // (kept for old saves / validation)
// CS2's throw strength per mode (m_flThrowStrength): long = 1, medium (both buttons) = 0.5, short (right) = 0.
export const POWER = { long: 1, medium: .5, short: 0 };
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export const nadesOf = l => Array.isArray(l?.nades) ? l.nades : [];
// Room for one more of this kind? (four in all, two flashbangs)
export const canCarry = (list, kind) => list.length < MAX_NADES && (kind !== 'flash' || list.filter(k => k === 'flash').length < MAX_FLASH) && !(kind !== 'flash' && list.includes(kind));
// The launch velocity for an aim (dx, dy, dz), a strength and the thrower's run velocity (vx, vz), as CS2 does it:
// the aim pitch is remapped so a level aim throws 10° up — looking down by 100/90 of the angle, up by 80/90, so
// straight down still throws straight down and straight up straight up (Source's ThrowGrenade, kept by CS:GO and CS2:
// a lineup's angles land where CS2's do) — speed is 675 × (power × 0.7 + 0.3), and 1.25 × the
// thrower's velocity is added (running throws go further).
export function launch(a) {
  const n = Math.hypot(+a.dx || 0, +a.dy || 0, +a.dz || 0) || 1, dx = (+a.dx || 0) / n, dy = (+a.dy || 0) / n, dz = (+a.dz || 0) / n, P = POWER[a.strength] ?? 1;
  const down = -Math.asin(Math.max(-1, Math.min(1, dy))) * 180 / Math.PI, pitch = down >= 0 ? -10 + down * 100 / 90 : -10 + down * 80 / 90, up = -pitch * Math.PI / 180;
  const h = Math.hypot(dx, dz) || 1, cu = Math.cos(up), speed = THROW * (P * .7 + .3); const cl = v => Math.max(-60, Math.min(60, +v || 0));   /* run / jump speed only (never a launcher) */
  return { vx: dx / h * cu * speed + cl(a.vx) * 1.25, vy: Math.sin(up) * speed + cl(a.vy) * 1.25, vz: dz / h * cu * speed + cl(a.vz) * 1.25 }; }
// Where a throw starts (Source): the eye, lower for weaker throws (power × 12 − 12 units), then 22 units ahead along
// the throw's own direction (the remapped pitch: 10° up for a level aim — Source traces along angThrow, not the eye's
// aim) — short of a wall in the way (a grenade thrown against a wall starts on this side of it).
export function throwStart(a, boxes = null, bounds = null) {
  const v = launch({ dx: a.dx, dy: a.dy, dz: a.dz, strength: 'long' }), n = Math.hypot(v.vx, v.vy, v.vz) || 1, dx = v.vx / n, dy = v.vy / n, dz = v.vz / n;
  const x = +a.x || 0, y = (+a.y || EYE) + ((POWER[a.strength] ?? 1) * 12 - 12) * HU, z = +a.z || 0;
  let t = 22 * HU; if (boxes) for (let s = 2 * HU; s <= t; s += 2 * HU) if (solid(boxes, bounds, x + dx * s, y + dy * s, z + dz * s)) { t = Math.max(0, s - 2 * HU - R); break; }
  return { x: x + dx * t, y: y + dy * t, z: z + dz * t }; }
// Throw from the eye along (dx, dy, dz): one grenade leaves the loadout (never two for one throw).
export function throwNade(game, name, kind, a, now = Date.now()) {
  const l = game.arena.loadout[key(name)] ??= { primary: null, secondary: 'pistol' }, list = l.nades ??= [], i = list.indexOf(kind);
  if (!NADES[kind]) throw Error('Unknown grenade'); if (i < 0) throw Error('You have no ' + NADES[kind].name);
  const r = game.combat?.d?.round; if (r && (['freeze', 'warmup'].includes(r.phase) || r.phase === 'over' && game.combat.d.matchOver) || game.arena?.lobby && !game.arena.lobby.started || game.combat?.d?.paused) throw Error('You can’t throw now');
  list.splice(i, 1); const C = game.combat; C.nades ??= []; C.nadeSeq = (C.nadeSeq || 0) + 1; const v = launch(a), bx = solidsOf?.(game) || null;
  C.nades.push({ id: 'n' + C.nadeSeq, kind, by: String(name).slice(0, 40), ...throwStart(a, bx?.length ? bx : null), ...v, at: now, phase: 'air', still: 0, strength: STRENGTH[a.strength] ? a.strength : 'long' });
  return 'Threw a ' + NADES[kind].name;
}
// Solid at (x, y, z)? (map boxes, the floor, the map edge) hitMover: the door or breakable it was, if any.
let hitMover = null;
function solid(boxes, bounds, x, y, z) {
  if (boxes.nadeMesh) return meshHit(boxes, bounds, x, y, z);
  if (y < R) return true; if (bounds && (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ)) return true;
  // A map file: its own shapes (bsp-map.js nadeSolid: no player clips, gaps as small as the map has them), and its
  // doors and breakables while shut / whole.
  hitMover = null; if (boxes.nadeSolid) { if (boxes.nadeSolid(x, y, z)) return true; for (const b of boxes.movers) if (!b.off && x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R && y > b.y0 - R && y < b.y1 + R) { hitMover = b; return true; } return false; }
  for (const b of boxesNear(boxes, x - R, z - R, x + R, z + R, SO)) if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R && y > b.y0 - R && y < b.y1 + R) return true; return false;
}
// A CS2 map with its grenade triangles (boxes.nadeMesh, dist/nade-mesh.js): does the grenade's ball touch something
// at (x, y, z)? Then N is the way out (the surface's own direction; round at an edge or a corner) and DEPTH how far in.
// The map's edge, its doors and breakables (by their boxes) as before.
const CT = new Float64Array(4), PEN = new Float64Array(6); let DEPTH = 0;
function meshHit(boxes, bounds, x, y, z) {
  hitMover = null;
  if (bounds) { const e = Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z); if (e < 0) { N[1] = 0; N[0] = e === x - bounds.minX ? 1 : e === bounds.maxX - x ? -1 : 0; N[2] = N[0] ? 0 : e === z - bounds.minZ ? 1 : -1; DEPTH = -e; return true; } }
  if (y < R) { N[0] = 0; N[1] = 1; N[2] = 0; DEPTH = R - y; return true; }
  for (const b of boxes.movers) { if (b.off || x <= b.minX - R || x >= b.maxX + R || z <= b.minZ - R || z >= b.maxZ + R || y <= b.y0 - R || y >= b.y1 + R) continue; hitMover = b;
    const p = PEN; p[0] = x - (b.minX - R); p[1] = b.maxX + R - x; p[2] = y - (b.y0 - R); p[3] = b.y1 + R - y; p[4] = z - (b.minZ - R); p[5] = b.maxZ + R - z; let k = 0; for (let i = 1; i < 6; i++) if (p[i] < p[k]) k = i;
    N[0] = k === 0 ? -1 : k === 1 ? 1 : 0; N[1] = k === 2 ? -1 : k === 3 ? 1 : 0; N[2] = k === 4 ? -1 : k === 5 ? 1 : 0; DEPTH = p[k]; return true; }
  if (boxes.nadeMesh.contact(x, y, z, R, CT)) { N[0] = CT[0]; N[1] = CT[1]; N[2] = CT[2]; DEPTH = CT[3]; return true; }
  return false;
}
// One physics step of a flying grenade (host tick and client preview alike), as Source moves a grenade: in short steps
// (never further than about its own size, so a fast throw can't pass through a thin wall); on a hit, the velocity is
// reflected off the surface's own direction there (slopes and corners too, not just flat floors and straight walls) and
// all of it kept at 45 % — a wall takes the run out of it as much as a floor does; on a floor (facing up within ~45°)
// it stops dead once slower than 30 u/s. Allocation-free. Returns true when it hit a floor.
const STOP = 30 * HU, SUB = R * .8, N = new Float64Array(3), DIRS = [], GLASS_KEEP = .15;
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) { const l = Math.hypot(x, y, z); DIRS.push([x / l, y / l, z / l]); }
// The surface's way out at a contact (into N): the mean of the directions round it that are free.
function normalAt(boxes, bounds, x, y, z) {
  let nx = 0, ny = 0, nz = 0; const e = R * 1.6;
  for (const d of DIRS) if (!solid(boxes, bounds, x + d[0] * e, y + d[1] * e, z + d[2] * e)) { nx += d[0]; ny += d[1]; nz += d[2]; }
  const l = Math.hypot(nx, ny, nz); if (l < 1e-6) { N[0] = 0; N[1] = 1; N[2] = 0; } else { N[0] = nx / l; N[1] = ny / l; N[2] = nz / l; } }
// Players (the host's step only: bodies = [{ name, x, y (feet), z }]): a grenade that meets one bounces off at 30 % of
// its usual 45 % (Source: players are no floor and soak up most of it), never off whoever threw it.
const BODY_R = 16 * HU, BODY_H = 72 * HU, PLAYER_BOUNCE = BOUNCE * .3;
function bodyHit(bodies, thrower, x, y, z) {
  for (const b of bodies) { if (b.name === thrower) continue; const cx = Math.max(b.x - BODY_R, Math.min(x, b.x + BODY_R)), cy = Math.max(b.y, Math.min(y, b.y + BODY_H)), cz = Math.max(b.z - BODY_R, Math.min(z, b.z + BODY_R)), dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= R * R) continue; const d = Math.sqrt(d2); if (d > 1e-6) { N[0] = dx / d; N[1] = dy / d; N[2] = dz / d; DEPTH = R - d; } else { const hx = x - b.x, hz = z - b.z, hl = Math.hypot(hx, hz) || 1; N[0] = hx / hl; N[1] = 0; N[2] = hz / hl; DEPTH = BODY_R - Math.hypot(hx, hz) + R; } return true; }
  return false; }
export function stepNade(g, boxes, bounds, dt, bodies = null) {
  let hitFloor = false;
  if (g.rest && !solid(boxes, bounds, g.x, g.y - R * 1.2, g.z)) g.rest = false;   // (the floor went: a door opened, a crate broke)
  const n = g.rest ? 0 : Math.max(1, Math.min(24, Math.ceil(Math.hypot(g.vx, g.vy, g.vz) * dt / SUB))), h = dt / Math.max(1, n);
  for (let s = 0; s < n; s++) {
    const gh = (g.grav ?? GRAVITY) * h, x = g.x + g.vx * h, y = g.y + (g.vy - gh * .5) * h, z = g.z + g.vz * h; g.vy -= gh;
    if (bodies && bodies.length && bodyHit(bodies, g.by, x, y, z)) { const nx = N[0], ny = N[1], nz = N[2], d = g.vx * nx + g.vy * ny + g.vz * nz; g.x = x + nx * DEPTH; g.y = y + ny * DEPTH; g.z = z + nz * DEPTH;
      if (d < 0) { g.vx = (g.vx - 2 * d * nx) * PLAYER_BOUNCE; g.vy = (g.vy - 2 * d * ny) * PLAYER_BOUNCE; g.vz = (g.vz - 2 * d * nz) * PLAYER_BOUNCE; } continue; }   // (half the step's gravity before the move, half after: Source's PhysicsAddGravityMove — the exact arc, whatever the step; g.grav: a dropped gun falls at the full 800)
    // CS2's triangles: out of the surface to just touching it, then off it — reflected about the surface's own way out,
    // 45 % kept (Source's ResolveFlyCollision); a second surface still touching (a corner) pushes it out of that too.
    if (boxes.nadeMesh) { if (!meshHit(boxes, bounds, x, y, z)) { g.x = x; g.y = y; g.z = z; continue; }
      if (hitMover && hitMover.mat === 'glass') { if (!g.view) { (g.glass ??= []).push(hitMover.mover); hitMover.off = true; } else if (g.pastGlass === hitMover) { g.x = x; g.y = y; g.z = z; continue; } else g.pastGlass = hitMover; g.vx *= GLASS_KEEP; g.vz *= GLASS_KEEP; g.vy = Math.min(g.vy, 0) * GLASS_KEEP; continue; }   // (g.view: a client's copy of a flight — the host breaks the pane for everyone; the copy only goes on through it)
      const nx = N[0], ny = N[1], nz = N[2]; let px = x + nx * DEPTH, py = y + ny * DEPTH, pz = z + nz * DEPTH;
      if (meshHit(boxes, bounds, px, py, pz) && !(hitMover && hitMover.mat === 'glass')) { px += N[0] * DEPTH; py += N[1] * DEPTH; pz += N[2] * DEPTH; }
      g.x = px; g.y = py; g.z = pz; const d = g.vx * nx + g.vy * ny + g.vz * nz;
      if (d < 0) { g.vx = (g.vx - 2 * d * nx) * BOUNCE; g.vy = (g.vy - 2 * d * ny) * BOUNCE; g.vz = (g.vz - 2 * d * nz) * BOUNCE; }
      if (ny > .7) { hitFloor = true; if (Math.hypot(g.vx, g.vy, g.vz) < STOP) { g.vx = g.vy = g.vz = 0; g.rest = true; break; } }
      else if (Math.hypot(g.vx, g.vy, g.vz) < STOP) g.vx = g.vy = g.vz = 0;   // (too slow off a wall: stopped, and falls from there — Source's)
      continue; }
    if (!solid(boxes, bounds, x, y, z)) { g.x = x; g.y = y; g.z = z; continue; }
    // A glass pane in the way: it breaks, and the grenade, its run spent on it, drops on through (g.glass: which pane —
    // the host breaks it for everyone).
    if (hitMover && hitMover.mat === 'glass') { (g.glass ??= []).push(hitMover.mover); hitMover.off = true; g.vx *= GLASS_KEEP; g.vz *= GLASS_KEEP; g.vy = Math.min(g.vy, 0) * GLASS_KEEP; continue; }
    normalAt(boxes, bounds, x, y, z); const d = g.vx * N[0] + g.vy * N[1] + g.vz * N[2];
    if (d < 0) { g.vx = (g.vx - 2 * d * N[0]) * BOUNCE; g.vy = (g.vy - 2 * d * N[1]) * BOUNCE; g.vz = (g.vz - 2 * d * N[2]) * BOUNCE; }
    if (N[1] > .7) { hitFloor = true; if (Math.hypot(g.vx, g.vy, g.vz) < STOP) { g.vx = g.vy = g.vz = 0; g.rest = true; break; } } }
  const speed = Math.hypot(g.vx, g.vy, g.vz); g.still = speed < 6 ? (g.still || 0) + dt : 0; return hitFloor;
}
// A dropped gun's toss (CS2: thrown forward with your run, it bounces and slides to a stop): the same flight as a
// grenade's, stepped at TOSS_DT until it rests (at most TOSS_MAX s). The host keeps where it ends up (pickups); every
// client replays the same steps to show it flying there (arena-ui.js). Returns { x, y (its floor), z, ms }.
export const TOSS_DT = 1 / 32, TOSS_MAX = 3;
export const TOSS_GRAVITY = 800 * HU;
export function tossFlight(boxes, bounds, fly) { const g = { x: fly.x, y: fly.y, z: fly.z, vx: fly.vx, vy: fly.vy, vz: fly.vz, still: 0, grav: TOSS_GRAVITY }; let t = 0;
  for (; t < TOSS_MAX && !g.rest; t += TOSS_DT) stepNade(g, boxes, bounds, TOSS_DT);
  return { x: g.x, y: Math.max(0, g.y - R), z: g.z, ms: Math.round(t * 1000) }; }
// When does it go off? (age in ms since the throw)
const goesOff = (g, hitFloor, age) => { const N = NADES[g.kind]; return g.kind === 'molotov' ? hitFloor || age > N.fuse : g.kind === 'smoke' ? ((g.rest || g.still > .2) && age >= N.fuse) || age > N.maxAir : age >= N.fuse; };
// The path a throw will take (client preview): points every 50 ms until it goes off (≤ 4 s).
export function predictThrow(kind, a, boxes = [], bounds = null) {
  const g = { kind, ...throwStart(a, boxes?.length ? boxes : null, bounds), ...launch(a), still: 0 }, pts = [[g.x, g.y, g.z]];
  for (let t = 50; t <= 4000; t += 50) { const hit = stepNade(g, boxes, bounds, .05); pts.push([g.x, g.y, g.z]); if (goesOff(g, hit, t)) break; }
  return pts;
}
const people = (game, players) => { const out = []; for (const p of players) if (p.pose && !isDown(game, p.name)) out.push({ name: p.name, x: p.pose.x, z: p.pose.z, y: (p.pose.y || EYE) - EYE });
  for (const b of game.arena?.bots || []) if (!isDown(game, b.name)) out.push({ name: b.name, x: b.x, z: b.z, y: floorAt(ARENA_MAPS[game.arena?.map], ARENA.cx, ARENA.cz, b.x, b.z), bot: b }); return out; };
// ── Smoke, one shared model (host rules, bots, radar, flashes and every client's view use it) ──
// CS2's smoke is a volume that fills the space it pops in: from the canister it spreads through the air around it —
// along the floor, round corners, down a corridor, up a stairwell, never through a wall — until it holds its volume
// (an ellipsoid's worth: R wide, flatter than tall). Here: cells of VOX units flood-filled from where it lies, nearest
// first (a path's length, up and down counting 1.6×), until that volume is used up or the path gets too long (DMAX).
// The same map and spot give the same cells on the host and every client (smokeVoxels; the map's boxes come from
// setSmokeSolids). It spreads over SMOKE.grow ms (its front follows the path length, so it pours round a corner the
// way it went) and thins over its last SMOKE.fade ms. Density is 1 inside, soft at its front and its outer cells. An
// HE blast in or beside it clears the smoke round where it went off: the cells it reaches through the air (CS2: the
// blast empties the voxels round it, never through a wall — holeField), as far as a cloud is big — one in the middle
// takes the whole cloud away for a moment, one at its side the part near it (the far side stays); it opens over
// holeGrow ms, stays open holeOpen ms, then the smoke pours back in from the hole's edge over holeClose ms — about two
// seconds in all. The holes live in the
// host's grenade state: every client opens the same hole at the same place and time. A sightline is blocked when it
// crosses more than SMOKE.block units of dense smoke — the same rule from outside, at the edge and from inside.
// Without the map's boxes (a test with no map): the ellipsoid alone, lifted a little off the ground.
export const SMOKE = { lift: .42, vert: .8, grow: 1800, fade: 3000, holeR: 190 * HU, holeGrow: 150, holeOpen: 1100, holeClose: 750, block: 14 };   // (in the middle it clears the whole cloud, at its side the part round it; about 2 s)
export const VOX = 3, VOX_UP = 1, VOX_DMAX = 1.7;   // (CS2's cloud: a dome about 300 units across and 150 high)
let solidsOf = null;
// (game) → the arena map's collision boxes (arena-logic.js on the host; the client's scene, which has them built).
export function setSmokeSolids(fn) { solidsOf = fn; }
const VOXELS = new Map(), VOXW = new WeakMap();   // (VOXW: smoke → its cells while it lies where they were made — a look-up per sample with no key string)
const growOf = (s, now) => { const t = now - (s.firedAt || now); return 1 - Math.pow(1 - Math.min(1, Math.max(0, t) / SMOKE.grow), 3); };
const fadeOf = (s, now) => Math.max(0, Math.min(1, (NADES.smoke.lasts - (now - (s.firedAt || now))) / SMOKE.fade));
export function smokeShape(s, now) { return { r: NADES.smoke.radius * (.35 + .65 * growOf(s, now)), dens: fadeOf(s, now), cy: (s.y || 0) + NADES.smoke.radius * SMOKE.lift }; }
// The cells a smoke fills (cached per smoke and spot): a grid of VOX cells round it; d = each filled cell's path length
// from the canister (Infinity: not filled), solid = 1 where the map is (the view stops its rays there); dFill = the
// longest path filled. Null without the map's boxes.
export function smokeVoxels(game, s) {
  const map = game?.arena?.map || '', w = VOXW.get(s); if (w && w.x === s.x && w.y === (s.y || 0) && w.z === s.z && w.map === map) return w.v;
  const key = s.id + ':' + map + ':' + Math.round(s.x * 10) + ',' + Math.round((s.y || 0) * 10) + ',' + Math.round(s.z * 10); let v = VOXELS.get(key);
  if (v === undefined) { const boxes = solidsOf?.(game); if (!boxes?.length) return null; v = fillSmoke(boxes, s); if (VOXELS.size > 24) VOXELS.delete(VOXELS.keys().next().value); VOXELS.set(key, v); }
  VOXW.set(s, { v, x: s.x, y: s.y || 0, z: s.z, map }); return v;
}
// The 26 neighbours of a cell in an nx × ny × nz grid: offsets (NO), steps (NI, NJ, NK) and lengths (NW).
function neighbours(nx, ny, up = VOX_UP) { const NI = new Int8Array(26), NJ = new Int8Array(26), NK = new Int8Array(26), NO = new Int32Array(26), NW = new Float32Array(26); let m = 0;
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj || dk) { NI[m] = di; NJ[m] = dj; NK[m] = dk; NO[m] = (dk * ny + dj) * nx + di; NW[m] = VOX * Math.hypot(di, dj * up, dk); m++; }
  return { NI, NJ, NK, NO, NW }; }
// Nearest first through the open cells of a smoke's grid (Dijkstra, buckets of half a unit) from `start`, path lengths
// into d (pre-filled with Infinity, d[start] set), never past dMax; stops after `budget` cells. Returns the cells done
// (in order) and the longest path reached.
function flood(nx, ny, nz, solid, d, start, dMax, budget = Infinity, up = VOX_UP) {
  const { NI, NJ, NK, NO, NW } = neighbours(nx, ny, up), done = new Uint8Array(nx * ny * nz), sx = nx * ny, BW = .5, buckets = [[start]]; let filled = 0, far = 0;
  for (let b = 0; b < buckets.length && filled < budget; b++) { const list = buckets[b]; if (!list) continue;
    for (let q = 0; q < list.length && filled < budget; q++) { const c = list[q]; if (done[c]) continue; done[c] = 1; filled++; const dc = d[c]; far = dc;
      const k = (c / sx) | 0, j = ((c - k * sx) / nx) | 0, i = c - k * sx - j * nx, edge = i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1;
      for (let t = 0; t < 26; t++) { if (edge) { const ii = i + NI[t], jj = j + NJ[t], kk = k + NK[t]; if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue; }
        const n = c + NO[t]; if (solid[n] || done[n]) continue;
        if (NI[t] && NK[t] && (solid[c + NI[t]] || solid[c + NK[t] * sx])) continue;   // (no squeezing diagonally past a wall's corner)
        const nd = dc + NW[t]; if (nd >= d[n] || nd > dMax) continue; d[n] = nd; const bi = (nd / BW) | 0; (buckets[bi] ??= []).push(n); } } }
  return { done, far };
}
function fillSmoke(boxes, s) {
  const R = NADES.smoke.radius, D = R * VOX_DMAX, nx = Math.ceil(2 * D / VOX), nz = nx, ny = Math.ceil((R * 1.35 + VOX) / VOX), x0 = s.x - nx * VOX / 2, z0 = s.z - nz * VOX / 2, y0 = (s.y || 0) - VOX;
  const N = nx * ny * nz, solid = new Uint8Array(N), d = new Float32Array(N).fill(Infinity), at = (i, j, k) => (k * ny + j) * nx + i, near = [];
  // Solid cells: a box reaching more than half a unit into the cell (a thin wall always fills one; a doorway always
  // leaves one) — each box near drawn into the grid once.
  for (const b of boxesNear(boxes.bullets || boxes, x0, z0, x0 + nx * VOX, z0 + nz * VOX, near)) { if (b.off) continue;   // (CS2 maps: the bullets' boxes — smoke pours through player clips and fences)
    const i0 = Math.max(0, Math.floor((b.minX - x0 + .5) / VOX)), i1 = Math.min(nx - 1, Math.ceil((b.maxX - x0 - .5) / VOX) - 1), k0 = Math.max(0, Math.floor((b.minZ - z0 + .5) / VOX)), k1 = Math.min(nz - 1, Math.ceil((b.maxZ - z0 - .5) / VOX) - 1);
    const j0 = Math.max(0, Math.floor((b.y0 - y0 + .5) / VOX)), j1 = Math.min(ny - 1, Math.ceil((b.y1 - y0 - .5) / VOX) - 1); if (i0 > i1 || k0 > k1 || j0 > j1) continue;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) { const row = (k * ny + j) * nx; for (let i = i0; i <= i1; i++) solid[row + i] = 1; } }
  // The canister's cell (or the nearest open one: a smoke in a corner).
  let start = -1; { const ci = Math.floor(nx / 2), ck = Math.floor(nz / 2), cj = Math.max(0, Math.min(ny - 1, Math.floor(((s.y || 0) + 1 - y0) / VOX)));
    for (let r = 0; r < 4 && start < 0; r++) for (let dj = 0; dj <= r && start < 0; dj++) for (let dk = -r; dk <= r && start < 0; dk++) for (let di = -r; di <= r && start < 0; di++) { const j = cj + dj; if (j < ny && !solid[at(ci + di, j, ck + dk)]) start = at(ci + di, j, ck + dk); } }
  let dFill = 0;
  if (start >= 0) {
    // Nearest first, until the volume is used up.
    d[start] = 0; const { done, far } = flood(nx, ny, nz, solid, d, start, D, Math.round(4 / 3 * Math.PI * R * R * R * SMOKE.vert / VOX ** 3 * .85)); dFill = far;
    for (let c = 0; c < N; c++) if (!done[c]) d[c] = Infinity;   // (reached but not filled: outside)
  }
  return { x0, y0, z0, nx, ny, nz, d, solid, dFill: Math.max(dFill, VOX) };
}
// An HE blast's reach through a smoke's grid: the path length from the blast to each cell through the open cells (the
// air: never through a wall, round a corner only the long way), Infinity past its reach (SMOKE.holeR × HOLE_OUT). From the blast's cell (or the
// nearest open one: a grenade lying on the floor); a blast beside the grid starts at its nearest edge, that far already.
function blastFill(v, x, y, z) {
  const { nx, ny, nz, x0, y0, z0, solid } = v, R = SMOKE.holeR * HOLE_OUT, d = new Float32Array(nx * ny * nz).fill(Infinity), at = (i, j, k) => (k * ny + j) * nx + i, cl = (q, n) => Math.max(0, Math.min(n - 1, q));
  const fi = (x - x0) / VOX, fj = (y - y0) / VOX, fk = (z - z0) / VOX, d0 = VOX * Math.hypot(Math.max(0, -fi, fi - nx), Math.max(0, -fj, fj - ny), Math.max(0, -fk, fk - nz)); if (d0 > R) return d;
  const ci = cl(Math.floor(fi), nx), cj = cl(Math.floor(fj), ny), ck = cl(Math.floor(fk), nz); let start = -1;
  for (let r = 0; r < 3 && start < 0; r++) for (let dj = 0; dj <= r && start < 0; dj++) for (let dk = -r; dk <= r && start < 0; dk++) for (let di = -r; di <= r && start < 0; di++) { const i = ci + di, j = cj + dj, k = ck + dk; if (i >= 0 && k >= 0 && i < nx && j < ny && k < nz && !solid[at(i, j, k)]) start = at(i, j, k); }
  if (start < 0) return d; d[start] = d0; flood(nx, ny, nz, solid, d, start, R, Infinity, HOLE_UP); return d;
}
// A hole's field (blastFill), once per hole: the host when the grenade goes off, each client when it first sees the hole
// (the same cells from the same smoke and spot); HOLEW: hole → field without a key string per sample.
const HOLES = new Map(), HOLEW = new WeakMap();
function holeField(v, s, h) {
  const w = HOLEW.get(h); if (w && w.v === v) return w.d;
  const key = s.id + ':' + h.at + ':' + h.x + ',' + h.y + ',' + h.z; let f = HOLES.get(key);
  if (!f || f.v !== v) { f = { v, d: blastFill(v, h.x, h.y, h.z) }; if (HOLES.size > 16) HOLES.delete(HOLES.keys().next().value); HOLES.set(key, f); }
  HOLEW.set(h, f); return f.d;
}
// For the view: a hole's field in its smoke's grid (null without the map).
export function smokeHoleCells(game, s, h) { const v = smokeVoxels(game, s); return v ? holeField(v, s, h) : null; }
// Does an HE going off at (x, y, z) reach this smoke? The hole it opens (to put in the smoke's state), or null: on a map,
// a cell of the smoke (as far as it has spread) within the blast's reach through the air; with no map, its ellipsoid.
function blastHole(game, s, x, y, z, now) {
  const h = { x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), at: now }, v = smokeVoxels(game, s);
  if (!v) return Math.hypot(s.x - x, s.z - z) < smokeShape(s, now).r + SMOKE.holeR * .5 ? h : null;
  const f = holeField(v, s, h), front = smokeFront(v, s, now); for (let c = 0; c < f.length; c++) if (f[c] < SMOKE.holeR * HOLE_OUT && v.d[c] < front) return h; return null;
}
// The fill run once on a made-up room (the loading screen): the first real smoke of a match then fills at full speed.
// With a map's boxes: once more on them (its box grid's lookups warmed too), at a spot of it.
export function warmSmoke(boxes = null, x = 0, y = 0, z = 0) { const b = (minX, maxX, minZ, maxZ, y0, y1) => ({ minX, maxX, minZ, maxZ, y0, y1 }), room = [b(-90, 90, -90, 90, -4, 0), b(-90, 90, 20, 23, 0, 30), b(-90, 90, -90, 90, 50, 54)]; for (let i = 0; i < 2; i++) fillSmoke(room, { x: 0, y: .35, z: 0 }); if (boxes?.length) fillSmoke(boxes, { x, y, z }); }
// The front of a smoke's spread now (path length; cells further along are still empty).
export const smokeFront = (v, s, now) => v.dFill * (.3 + .7 * growOf(s, now)) + VOX;
// How dense one smoke is at a point (0 … 1), before its holes.
function oneDensity(game, s, x, y, z, now) {
  const v = smokeVoxels(game, s);
  if (!v) { const S = smokeShape(s, now), q = Math.hypot(x - s.x, z - s.z, (y - S.cy) / SMOKE.vert) / S.r; return q >= 1 ? 0 : (q < .7 ? 1 : (1 - q) / .3) * S.dens; }
  const i = Math.floor((x - v.x0) / VOX), j = Math.floor((y - v.y0) / VOX), k = Math.floor((z - v.z0) / VOX); if (i < 0 || j < 0 || k < 0 || i >= v.nx || j >= v.ny || k >= v.nz) return 0;
  const dc = v.d[(k * v.ny + j) * v.nx + i]; if (dc === Infinity) return 0; const front = smokeFront(v, s, now); if (dc >= front) return 0;
  return Math.min(1, (front - dc) / (2 * VOX)) * Math.min(1, (v.dFill - dc) / (3 * VOX) + .4) * fadeOf(s, now); }
// A hole's radius now (its reach through the air): it opens with the blast, stays, then closes from its edge in as the
// smoke pours back — 0 when closed.
export const HOLE_IN = .8, HOLE_OUT = 1.25, HOLE_UP = .6;   // (cleared out to HOLE_IN × the radius; thinned beyond, less and less, to HOLE_OUT × — the smoke the blast pushed aside; HOLE_UP: height counts less, the blast throws smoke up as well as out)
export const holeRadius = (h, now) => { const a = Math.max(0, now - h.at), G = SMOKE.holeGrow, O = G + SMOKE.holeOpen, u = (a - O) / SMOKE.holeClose;
  return a < G ? SMOKE.holeR * (1 - (1 - a / G) ** 2) : a < O ? SMOKE.holeR : u < 1 ? SMOKE.holeR * (1 - u * u * (3 - 2 * u)) : 0; };
// How open the smoke's HE holes are at a point: 0 (untouched) … 1 (fully cleared).
export function holeOpen(game, s, x, y, z, now) { const H = s.holes; if (!H?.length) return 0; let cut = 0, v;
  for (let n = 0; n < H.length; n++) { const h = H[n], r = holeRadius(h, now); if (r <= 0) continue; let dist;
    if (v === undefined) v = smokeVoxels(game, s);
    if (v) { const i = Math.floor((x - v.x0) / VOX), j = Math.floor((y - v.y0) / VOX), k = Math.floor((z - v.z0) / VOX); dist = i < 0 || j < 0 || k < 0 || i >= v.nx || j >= v.ny || k >= v.nz ? Infinity : holeField(v, s, h)[(k * v.ny + j) * v.nx + i]; }
    else dist = Math.hypot(x - h.x, (y - h.y) * HOLE_UP, z - h.z);
    const hi = r * HOLE_OUT; if (dist < hi) cut = Math.max(cut, Math.min(1, (hi - dist) / (hi - r * HOLE_IN))); }
  return cut; }
// Smoke density at a point (0 … 1, summed over clouds, capped).
export const hostNow = game => game?.combat?.clock ?? Date.now();   // the host's clock (stamped each tick; clients keep an offset)
export function smokeDensity(game, x, y, z, now = hostNow(game)) { let d = 0; for (const s of game.combat?.nades || []) { if (s.phase !== 'smoke') continue; const q = oneDensity(game, s, x, y, z, now); if (q <= 0) continue;
    d += q * (1 - holeOpen(game, s, x, y, z, now)); if (d >= 1) return 1; } return d; }
// A smoke's reach (centre and radius of a ball round all it can fill): segments that miss it skip it.
const reachOf = (game, s) => { const v = smokeVoxels(game, s); return v ? { x: s.x, y: (s.y || 0) + NADES.smoke.radius * .5, z: s.z, r: NADES.smoke.radius * VOX_DMAX * 1.05, vert: 1 } : { x: s.x, y: (s.y || 0) + NADES.smoke.radius * SMOKE.lift, z: s.z, r: NADES.smoke.radius, vert: SMOKE.vert }; };
// Units of dense smoke between two points (3D), sampled every 1.5 units where the segment passes a cloud.
export function smokeDepth(game, ax, ay, az, bx, by, bz, now = hostNow(game)) {
  let depth = 0; const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1;
  for (const s of game.combat?.nades || []) { if (s.phase !== 'smoke') continue; const C = reachOf(game, s), t = Math.max(0, Math.min(1, ((C.x - ax) * dx + (C.y - ay) * dy + (C.z - az) * dz) / (L * L)));
    if (Math.hypot(ax + dx * t - C.x, (ay + dy * t - C.y) / C.vert, az + dz * t - C.z) > C.r) continue;   // misses this cloud
    const n = Math.ceil(L / 1.5); for (let i = 0; i <= n; i++) { const u = i / n, x = ax + dx * u, y = ay + dy * u, z = az + dz * u, q = oneDensity(game, s, x, y, z, now); if (q > 0) depth += q * (1 - holeOpen(game, s, x, y, z, now)) * L / n; } }
  return depth;
}
export const smokeBlocks = (game, ax, ay, az, bx, by, bz, now = hostNow(game)) => smokeDepth(game, ax, ay, az, bx, by, bz, now) > SMOKE.block;
const smoked = (game, ax, az, bx, bz, y = 8, now = hostNow(game)) => smokeBlocks(game, ax, y, az, bx, y, bz, now);
// Is the line between two points (at chest height) clear of walls and smoke?
export function clearView(game, boxes, ax, az, bx, bz, y = 8, now = hostNow(game)) { return lineOfSight(boxes, ax, az, bx, bz, y) && !smoked(game, ax, az, bx, bz, y, now); }
// Fire and smoke (CS2): a smoke whose volume reaches burning flames puts the whole fire out (also while it is still
// spreading); a molotov that breaks inside smoke fizzles. A put-out fire stays in the state as 'out' briefly (steam),
// then leaves; nothing re-ignites it. An HE doesn't touch fire.
const smokedAt = (game, x, y, z, now) => smokeDensity(game, x, y + 2, z, now) > .35;
export function putOut(f, now) { f.phase = 'out'; f.outAt = now; f.firedAt = now; }
// Where a molotov burns (CS2's inferno): flames spread from where it broke over FIRE.spread ms — across the floor, down
// stairs and slopes (a step up of FIRE.up at most, down FIRE.down), never up a wall or through one — to the cells
// within its radius. Each cell: [x, z, y, d] (d: how far along the spread, 0 … 1). Near the end the flames die out
// one by one (each cell's own moment in the last FIRE.die ms). Deterministic, so every client draws the host's fire.
export const FIRE = { cell: 3, spread: 1100, up: 1.5, down: 3.2, die: 1500, hit: 200, ramp: 8, rest: 600 };
const fireCache = new Map();
export function fireCells(boxes, x, z, y = 0) {
  const k = [x.toFixed(1), z.toFixed(1), y.toFixed(1), boxes.length].join(); if (fireCache.has(k)) return fireCache.get(k);
  const S = FIRE.cell, R = NADES.molotov.radius, Rn = Math.ceil(R / S);
  // The floor under (px, pz) near height ref: the highest top a step up or a stair down from it (the map's ground: 0).
  const floorNear = (px, pz, ref) => { let top = -Infinity; for (const b of boxesNear(boxes, px, pz, px, pz, FA)) if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ && b.y1 <= ref + FIRE.up && b.y1 >= ref - FIRE.down && b.y1 > top) top = b.y1;
    if (top === -Infinity && 0 <= ref + FIRE.up && 0 >= ref - FIRE.down) top = 0; return top; };
  const blocked = (px, pz, fy) => boxesNear(boxes, px - .5, pz - .5, px + .5, pz + .5, FB).some(b => !b.off && px > b.minX - .5 && px < b.maxX + .5 && pz > b.minZ - .5 && pz < b.maxZ + .5 && b.y0 < fy + 2 && b.y1 > fy + FIRE.up);   // a wall or crate standing on this floor
  const y0 = floorNear(x, z, y + .5), out = [], seen = new Map(), q = [[0, 0, Number.isFinite(y0) ? y0 : y, 0]]; seen.set('0,0', 1);
  for (let h = 0; h < q.length; h++) { const [i, j, fy, steps] = q[h], px = x + i * S, pz = z + j * S; if (blocked(px, pz, fy)) continue; out.push([+px.toFixed(2), +pz.toFixed(2), +fy.toFixed(2), steps]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj, kk = ii + ',' + jj; if (seen.has(kk) || Math.abs(ii) > Rn || Math.abs(jj) > Rn || Math.hypot(ii, jj) * S > R) continue;
      const ny = floorNear(x + ii * S, z + jj * S, fy); if (!Number.isFinite(ny)) continue; seen.set(kk, 1); q.push([ii, jj, ny, steps + 1]); } }
  const far = Math.max(1, ...out.map(c => c[3])); for (const c of out) c[3] = +(c[3] / far).toFixed(3);
  if (fireCache.size > 64) fireCache.clear(); fireCache.set(k, out); return out;
}
// Is a cell of fire `g` burning at `now` (host clock)? Lit once the spread reaches it, out at its own moment near the end.
export const cellEnd = c => NADES.molotov.lasts - FIRE.die * (((Math.sin(c[0] * 12.9898 + c[1] * 78.233) * 43758.5453) % 1 + 1) % 1);   // when a cell's flame dies (ms after the fire started)
export const cellLit = (g, c, now) => { const t = now - (g.firedAt || now); return t >= c[3] * FIRE.spread && t < cellEnd(c); };
// Someone at (x, z), feet at y, standing in the flames? (Without g: any cell, as it stands.)
export const inFire = (cells, x, z, y = null, g = null, now = 0) => cells.some(c => Math.abs(c[0] - x) < 2.2 && Math.abs(c[1] - z) < 2.2 && (y === null || Math.abs((c[2] ?? 0) - y) < 3) && (!g || cellLit(g, c, now)));
// One host tick: move, bounce, set off, burn, clean up. Returns true when anything changed.
export function nadesTick(game, players, dt, now, { boxes = [], bounds = null } = {}, onBlast = null, onGlass = null) {   // onBlast(x, y, z, radius, dmg): an HE went off there (arena-logic.js: doors and breakables take it)
  const C = game.combat; if (C) C.clock = now; if (!C?.nades?.length) return false; let changed = false; const bodies = C.nades.some(g => g.phase === 'air') ? people(game, players) : null;   // (the living, for grenades in flight to bounce off)
  for (const g of C.nades) {
    const N = NADES[g.kind], age = now - g.at;
    if (g.phase === 'air') {
      const hitFloor = stepNade(g, boxes, bounds, dt, bodies); changed = true;
      if (g.glass?.length) { for (const id of g.glass) onGlass?.(id); g.glass = null; }   // (panes it broke on the way: broken for everyone)
      if (!goesOff(g, hitFloor, age)) continue;
      g.phase = { he: 'boom', flash: 'pop', smoke: 'smoke', molotov: 'fire' }[g.kind]; g.firedAt = now; g.vx = g.vy = g.vz = 0;
      if (g.kind === 'molotov' && !hitFloor && g.y - groundUnder(boxes, g.x, g.z, g.y) > N.airburst) { g.phase = 'out'; g.airburst = true; }   // timed out high in the air: it bursts there, no fire (CS2)
      else if (g.kind === 'molotov' || g.kind === 'smoke') g.y = groundUnder(boxes, g.x, g.z, g.y);
      if (g.phase === 'smoke') smokeVoxels(game, g);   // its cells now, once, where it lies (every sightline after reads them)
      if (g.kind === 'molotov' && smokedAt(game, g.x, g.y, g.z, now)) putOut(g, now);   // into smoke: it fizzles
      if (g.kind === 'smoke') for (const f of C.nades) if (f.phase === 'fire' && fireCells(boxes, f.x, f.z, f.y).some(c => cellLit(f, c, now) && Math.hypot(c[0] - g.x, c[1] - g.z) < NADES.smoke.radius * .35 && Math.abs(c[2] - g.y) < 6)) putOut(f, now);   // popping in the flames: out at once (then its volume reaches the rest)
      if (g.kind === 'he') for (const s of C.nades) { const h = s.phase === 'smoke' && blastHole(game, s, g.x, g.y, g.z, now); if (h) s.holes = [...(s.holes || []), h].slice(-3); }   // a blast clears the smoke round it for a moment
      if (g.kind === 'he') onBlast?.(g.x, g.y, g.z, N.radius, N.dmg);
      if (g.kind === 'he') for (const t of people(game, players)) { const d = Math.hypot(t.x - g.x, t.z - g.z, t.y + 5 - g.y); if (d > N.radius || !(segmentClear(boxes, g.x, g.y + .5, g.z, t.x, t.y + 5, t.z) || segmentClear(boxes, g.x, g.y + .5, g.z, t.x, t.y + 9, t.z))) continue;
        hurt(game, g.by, t.name, { id: 'he', name: N.name }, Math.round(N.dmg * Math.pow(1 - d / N.radius, 1.3)), 'chest', now); }
      // Flash statistics: enemies it blinded (people: from where they look; bots: as the bots themselves react).
      if (g.kind === 'flash' && recording(game)) { const tm = game.combat.d?.teams || {}, mine = tm[key(g.by)]; for (const p of players) { if (!p.pose || isDown(game, p.name, now) || !mine || tm[key(p.name)] === mine) continue; const yaw = +p.pose.yaw || 0, pit = +p.pose.shot?.pitch || 0, a = flashAmount(boxes, g.x, g.y, g.z, p.pose.x, p.pose.y ?? EYE, p.pose.z, -Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit), game); if (a > .4) { const st = statOf(game, g.by); st.flashed++; st.blindMs += Math.round(600 + 3400 * a); } }
        for (const b of game.arena?.bots || []) if (!isDown(game, b.name, now) && mine && tm[key(b.name)] !== mine && Math.hypot(b.x - g.x, b.z - g.z) < N.radius && segmentClear(boxes, g.x, Math.max(1, g.y), g.z, b.x, 9.7, b.z) && !smoked(game, g.x, g.z, b.x, b.z)) { const st = statOf(game, g.by); st.flashed++; st.blindMs += 2500; } }
      if (g.kind === 'flash') for (const t of people(game, players)) if (t.bot && Math.hypot(t.x - g.x, t.z - g.z) < N.radius && segmentClear(boxes, g.x, Math.max(1, g.y), g.z, t.x, 9.7, t.z) && !smoked(game, g.x, g.z, t.x, t.z)) t.bot.blindUntil = now + 2500;
    } else if (g.phase === 'fire') {
      // Burning (CS2): a hit every FIRE.hit ms to everyone standing in lit flames, 1 damage the first hit, one more each
      // hit up to FIRE.ramp (then 40 a second); out of the flames a moment and it starts again at 1. Armor doesn't help.
      // Two fires overlapping both burn. A smoke reaching the flames puts the whole fire out.
      if (now - (g.burnAt || 0) >= FIRE.hit) { g.burnAt = now; const cells = fireCells(boxes, g.x, g.z, g.y), heat = g.heat ??= {};
        if (C.nades.some(s => s.phase === 'smoke')) { for (let i = 0; i < cells.length; i += 4) if (cellLit(g, cells[i], now) && smokedAt(game, cells[i][0], cells[i][2], cells[i][1], now)) { putOut(g, now); changed = true; break; } if (g.phase !== 'fire') continue; }
        for (const t of people(game, players)) { const k = key(t.name); if (!inFire(cells, t.x, t.z, t.y, g, now)) continue;
          const h = heat[k], n = h && now - h.at < FIRE.rest ? Math.min(FIRE.ramp, h.n + 1) : 1; heat[k] = { n, at: now }; hurt(game, g.by, t.name, { id: 'molotov', name: N.name }, n, 'legs', now); changed = true; } }
    }
  }
  const n = C.nades.length;
  C.nades = C.nades.filter(g => g.phase === 'air' || now - g.firedAt < ({ boom: 1200, pop: 1200, smoke: NADES.smoke.lasts, fire: NADES.molotov.lasts, out: 900 }[g.phase] || 0));
  return changed || C.nades.length !== n;
}
function groundUnder(boxes, x, z, y) { let g = 0; for (const b of boxesNear(boxes, x, z, x, z, GU)) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.y1 <= y + 1 && b.y1 > g) g = b.y1; return g; }
// How blinded a viewer is by a flash at (fx, fy, fz): 0…1 (1 = fully white), from distance, how much of the flash
// reaches their eye and how directly they look at it. dirX/Y/Z: where the viewer looks.
// How much reaches the eye is CS's PercentageOfFlashForPlayer: seen straight (no wall — CS2's own surfaces on a CS2
// map, its light passing grenade clips, fences and glass — nor smoke in between): all of it; otherwise the light off a
// point 50 units over the flash and 75 units to either side of it (as the eye sees it), a sixth each that reaches
// the eye (a flash round a corner or over a wall still catches you a little). Then by where the eye looks, as CS's
// RadiusFlash: within about 53° of it all, to 73° 70 %, to 101° 40 %, behind 20 %.
const FLASH_UP = 50 * HU, FLASH_SIDE = 75 * HU;
function flashReach(boxes, game, fx, fy, fz, x, y, z) {
  const M = boxes.nadeMesh, clear = (ax, ay, az, bx, by, bz) => (M ? !M.blocked(ax, ay, az, bx, by, bz, true) : segmentClear(boxes, ax, ay, az, bx, by, bz)) && !(game && smokeBlocks(game, ax, ay, az, bx, by, bz));
  if (clear(fx, fy, fz, x, y, z)) return 1;
  let ex = x - fx, ey = y - fy, ez = z - fz; const l = Math.hypot(ex, ey, ez) || 1; ex /= l; ey /= l; ez /= l;
  let rx = -ez, rz = ex; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; const ux = -ey * rz, uy = ez * rx - ex * rz, uz = ey * rx;   // (right: level, across the view; up: across both)
  let got = 0; for (const [px, py, pz] of [[fx + ux * FLASH_UP, fy + uy * FLASH_UP, fz + uz * FLASH_UP], [fx + rx * FLASH_SIDE, fy, fz + rz * FLASH_SIDE], [fx - rx * FLASH_SIDE, fy, fz - rz * FLASH_SIDE]])
    if (clear(fx, fy, fz, px, py, pz) && clear(px, py, pz, x, y, z)) got += 1 / 6;
  return got;
}
export function flashAmount(boxes, fx, fy, fz, x, y, z, dirX, dirY, dirZ, game = null) {
  const dx = fx - x, dy = fy - y, dz = fz - z, d = Math.hypot(dx, dy, dz); if (d > NADES.flash.radius) return 0;
  const reach = flashReach(boxes, game, fx, Math.max(.6, fy), fz, x, y, z); if (reach <= 0) return 0;
  const facing = (dx * dirX + dy * dirY + dz * dirZ) / (d || 1), look = facing >= .6 ? 1 : facing >= .3 ? .7 : facing >= -.2 ? .4 : .2;
  return Math.max(0, Math.min(1, reach * look * (1 - Math.pow(d / NADES.flash.radius, 1.4)) * (d < 25 ? 1.15 : 1)));
}
