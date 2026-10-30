// Global Defensive grenades, run by the host: HE, flashbang, smoke, decoy, molotov and incendiary. Shared with every
// client (the trajectory preview and the fire area use the same functions, so what you see is what the host does).
// State machine (one grenade, host side): air (flies, bounces) → effect (boom / pop / smoke / fire / decoy → fizz)
// → gone; or `void` (fell out of the world: removed at once, logged — NADE_LOG).
// Client side (weapons.js): equipped → pin pulled (press) → held → released (throw) → this.
//  · Throw: from your eye along your aim (a little upwards); left = full throw, right = short underhand, both = medium;
//    your running speed carries over. A full throw crosses most of the map.
//  · HE: explodes 1.5 s after the throw · up to 99 damage, falling off over 350 units (CS2's m_nDamage, m_flRange);
//    walls, floors, shut doors and crates block it; kevlar takes some of it.
//  · Flashbang: pops after 1.5 s · each client works out how blinded it is (3D line of sight from the eye, facing,
//    distance; smoke, walls and shut doors block); bots that see it can't shoot for a moment.
//  · Smoke: blooms once it rests (1.5 s at the earliest, 12 s at the latest) · an 18 s cloud no one sees through.
//  · Decoy: once it rests, sounds like the thrower's gun in bursts for 15 s (and shows on the enemies' radar while it
//    fires), then pops.
//  · Molotov (T) / Incendiary (CT): bursts on a floor it hits (or after 2 s) · 7 s of fire over up to 37 units around,
//    spreading only over the floor it landed on (walls and drops stop it); burns anyone standing in it.
import { EYE, weaponById, defaultPistol } from './weapons-data.js';
import { hurt, applyHit, isDown, recording, statOf } from './combat-logic.js';
import { lineOfSight, segmentClear, ARENA_MAPS, floorAt } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { boxesNear, boxesAlong } from './box-grid.js';
const SO = [], FA = [], FB = [], GU = [];   // nearby boxes per query (box-grid.js)

const HU = 2.54 / 16.5;
export const NADES = {
  // (fuses, CS2's: an HE and a flash go off 1.5 s after the throw; a smoke once it rests, 1.5 s at the earliest; a
  // molotov on the first floor it hits, or bursts after 2 s in the air)
  // HE (weapons.vdata weapon_hegrenade): m_nDamage 99, m_flRange 350 (the blast's reach, HU), m_flArmorRatio 1.2 → ap
  // .6 (half the ratio through kevlar, as every gun's `ap` in weapons-data.js).
  he: { id: 'he', name: 'HE Grenade', kind: 'nade', price: 300, fuse: 1500, dmg: 99, radius: 350 * HU, ap: .6 },
  flash: { id: 'flash', name: 'Flashbang', kind: 'nade', price: 200, fuse: 1500, radius: 2000 * HU },
  smoke: { id: 'smoke', name: 'Smoke Grenade', kind: 'nade', price: 300, fuse: 1500, radius: 164 * HU, lasts: 18000, maxAir: 12000 },   // (CS2's cloud is 144 units round, about 150 high; here 30 % more ground (164 round) and 30 % more height, as asked)
  // Decoy ($50, m_nPrice): goes off once it rests like a smoke (12 s at the latest), then DECOY below.
  decoy: { id: 'decoy', name: 'Decoy Grenade', kind: 'nade', price: 50, fuse: 1500, maxAir: 12000 },
  molotov: { id: 'molotov', name: 'Molotov', kind: 'nade', team: 't', price: 400, fuse: 2000, radius: 37, lasts: 7000, dps: 40, airburst: 128 * HU },
  // The Counter-Terrorists' fire grenade (m_nPrice 500, m_nDamage 40 like the molotov's): the same fire, its own id.
  incendiary: { id: 'incendiary', name: 'Incendiary Grenade', kind: 'nade', team: 'ct', price: 500, fuse: 2000, radius: 37, lasts: 7000, dps: 40, airburst: 128 * HU },
};
export const NADE_IDS = Object.keys(NADES), MAX_NADES = 4, MAX_FLASH = 2;
// The fire grenades (one burning rule set; a player carries one of them at a time — CS2's AMMO_TYPE_MOLOTOV).
export const FIRE_KINDS = { molotov: 1, incendiary: 1 }; export const isFire = kind => FIRE_KINDS[kind] === 1;
// Decoy (CS2): its rest starts a gun show — bursts of the thrower's gun (their primary, else their pistol, picked at the
// throw) for `lasts` ms, then a small pop. Shots: CS:GO's decoy pattern as far as we know it (approximations, not CS2
// figures): bursts of 3–6 for automatic guns at the gun's own rate, 1–3 for the rest (a human's pace at least), a
// pause of 0.6–2.4 s between bursts. Radar (deliberate rule, for gd-radar): while it fires — within `blip` ms of a shot
// — the decoy shows on the thrower's ENEMIES' radar as an enemy at its spot (decoyBlip). The pop: ours (≤ dmg HP
// within `radius`), not a CS2 figure (weapons.vdata's m_nDamage 50 for weapon_decoy is the grenades' shared default —
// the flashbang and smoke list the same 50 — not the pop's).
export const DECOY = { lasts: 15000, start: 300, blip: 1000, dmg: 5, radius: 64 * HU, pop: 600 };
// Flight, exactly CS2's (Source) grenade physics in our units (1 hammer unit = HU): a throw leaves at 675 u/s × the
// strength's power (long 1.0, medium 0.65, short 0.3), under 0.4 × 800 u/s² gravity; bounces keep 45 %.
export const GRAVITY = 320 * HU, THROW = 675 * HU, BOUNCE = .45, R = .35;
export const STRENGTH = { long: 1, medium: .5, short: .25 };   // (kept for old saves / validation)
// CS2's throw strength per mode (m_flThrowStrength): long = 1, medium (both buttons) = 0.5, short (right) = 0.
export const POWER = { long: 1, medium: .5, short: 0 };
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export const nadesOf = l => Array.isArray(l?.nades) ? l.nades : [];
// Room for one more of this kind? (four in all, two flashbangs, one of each other kind — one fire grenade, a molotov or
// an incendiary)
export const canCarry = (list, kind) => list.length < MAX_NADES && (kind === 'flash' ? list.filter(k => k === 'flash').length < MAX_FLASH : !list.some(k => k === kind || (isFire(k) && isFire(kind))));
const num = v => { const n = +v; return Number.isFinite(n) ? n : 0; };   // (a throw's numbers: NaN / ±Infinity → 0)
// The launch velocity for an aim (dx, dy, dz), a strength and the thrower's run velocity (vx, vz), as CS2 does it:
// the aim pitch is remapped so a level aim throws 10° up — looking down by 100/90 of the angle, up by 80/90, so
// straight down still throws straight down and straight up straight up (Source's ThrowGrenade, kept by CS:GO and CS2:
// a lineup's angles land where CS2's do) — speed is 675 × (power × 0.7 + 0.3), and 1.25 × the
// thrower's velocity is added (running throws go further).
export function launch(a) {
  const n = Math.hypot(num(a.dx), num(a.dy), num(a.dz)) || 1, dx = num(a.dx) / n, dy = num(a.dy) / n, dz = num(a.dz) / n, P = POWER[a.strength] ?? 1;
  const down = -Math.asin(Math.max(-1, Math.min(1, dy))) * 180 / Math.PI, pitch = down >= 0 ? -10 + down * 100 / 90 : -10 + down * 80 / 90, up = -pitch * Math.PI / 180;
  const h = Math.hypot(dx, dz) || 1, cu = Math.cos(up), speed = THROW * (P * .7 + .3); const cl = v => Math.max(-60, Math.min(60, num(v)));   /* run / jump speed only (never a launcher; the ±60 clamp is ours) */
  return { vx: dx / h * cu * speed + cl(a.vx) * 1.25, vy: Math.sin(up) * speed + cl(a.vy) * 1.25, vz: dz / h * cu * speed + cl(a.vz) * 1.25 }; }
// Where a throw starts (Source): the eye, lower for weaker throws (power × 12 − 12 units), then 22 units ahead along
// the throw's own direction (the remapped pitch: 10° up for a level aim — Source traces along angThrow, not the eye's
// aim) — short of a wall in the way (a grenade thrown against a wall starts on this side of it). On a CS2 map it is
// swept from the eye itself — down to the hand, then out along the throw: a surface crossed on the way (a wall, a low
// ceiling, a railing; one-faced CS2 walls too; a shut door, a whole crate, an intact pane) stops it R short, then it steps back along the way until the ball
// touches nothing — a grenade never starts inside or behind a wall.
export function throwStart(a, boxes = null, bounds = null) {
  const v = launch({ dx: a.dx, dy: a.dy, dz: a.dz, strength: 'long' }), n = Math.hypot(v.vx, v.vy, v.vz) || 1, dx = v.vx / n, dy = v.vy / n, dz = v.vz / n;
  const x = num(a.x), ey = num(a.y) || EYE, y = ey + ((POWER[a.strength] ?? 1) * 12 - 12) * HU, z = num(a.z);
  let t = 22 * HU; const M = boxes?.nadeMesh;
  // (The doors, crates and panes too, while shut / whole: their boxes grown by R — where the ball first touches one, as
  // in flight; a pane of no thickness counts — a pane included, the flight then breaks it. A sweep of the triangles
  // alone started a throw 16 HU from a shut door on its far side.)
  if (M) { const mv = boxes.movers, drop = ey - y, reach = (w, wm, L) => Math.min(w <= 1 ? w * L - R : Infinity, wm <= 1 ? wm * L - 1e-3 : Infinity);
    if (drop > 1e-6) { const d = reach(meshFirst(M, x, ey, z, x, y, z), moverFirst(mv, x, ey, z, x, y, z, true, R), drop); if (d < Infinity) return backOff(boxes, bounds, x, ey, z, 0, -1, 0, d); }   // (something between the eye and the hand: from the eye, short of it)
    const ex = x + dx * t, ey2 = y + dy * t, ez = z + dz * t; return backOff(boxes, bounds, x, y, z, dx, dy, dz, Math.min(t, reach(meshFirst(M, x, y, z, ex, ey2, ez), moverFirst(mv, x, y, z, ex, ey2, ez, true, R), t))); }
  if (boxes) for (let s = 2 * HU; s <= t; s += 2 * HU) if (solid(boxes, bounds, x + dx * s, y + dy * s, z + dz * s)) { t = Math.max(0, s - 2 * HU - R); break; }
  return { x: x + dx * t, y: y + dy * t, z: z + dz * t }; }
// From (x, y, z), `t` along (dx, dy, dz) at most: the furthest point where the ball touches nothing, stepping back R/2
// at a time (the start itself at worst).
function backOff(boxes, bounds, x, y, z, dx, dy, dz, t) { for (; t > 0; t -= R / 2) if (!solid(boxes, bounds, x + dx * t, y + dy * t, z + dz * t)) break; t = Math.max(0, t); return { x: x + dx * t, y: y + dy * t, z: z + dz * t }; }
// The map's grenade bounds for a game (its grid: arena-logic.js geo), or null.
const boundsOf = game => { const m = ARENA_MAPS[game?.arena?.map]; if (!m?.size) return null; const [w, d] = m.size; return { minX: ARENA.cx - w / 2, maxX: ARENA.cx + w / 2, minZ: ARENA.cz - d / 2, maxZ: ARENA.cz + d / 2 }; };
// Throw from the eye along (dx, dy, dz): one grenade leaves the loadout (never two for one throw). The host takes the
// client's eye as sent (fair under lag; LAN trust — it is not pulled to the last pose heard, which test rigs and
// spectator throws do not match); numbers that are not finite are refused (a string such as '1e999' is Infinity, and
// a grenade at Infinity went NaN for its whole fuse on every client).
export function throwNade(game, name, kind, a, now = Date.now()) {
  if (!NADES[kind]) throw Error('Unknown grenade');
  const l = game.arena?.loadout?.[key(name)], list = Array.isArray(l?.nades) ? l.nades : [], i = list.indexOf(kind);   // (no loadout is made for a thrower without one: a throw never hands out a pistol)
  if (i < 0) throw Error('You have no ' + NADES[kind].name);
  const r = game.combat?.d?.round; if (r && (['freeze', 'warmup'].includes(r.phase) || r.phase === 'over' && game.combat.d.matchOver) || game.arena?.lobby && !game.arena.lobby.started || game.combat?.d?.paused) throw Error('You can’t throw now');
  for (const f of ['x', 'y', 'z', 'dx', 'dy', 'dz', 'vx', 'vy', 'vz']) if (a[f] !== undefined && a[f] !== null && !Number.isFinite(+a[f])) throw Error('Bad throw');
  const bx = solidsOf?.(game) || null, boxes = bx?.length ? bx : null, bounds = boundsOf(game);
  list.splice(i, 1); const C = game.combat; C.nades ??= []; C.nadeSeq = (C.nadeSeq || 0) + 1; const v = launch(a), s0 = throwStart(a, boxes, bounds), id = 'n' + C.nadeSeq;
  const g = { id, kind, by: String(name).slice(0, 40), ...s0, ...v, at: now, phase: 'air', still: 0, strength: STRENGTH[a.strength] ? a.strength : 'long' };
  if (kind === 'decoy') { const team = game.combat?.d?.teams?.[key(name)] || null; g.gun = l.primary || l.secondary || defaultPistol(team); g.team = team; g.seed = (C.nadeSeq * 7919 + (now % 100003)) % 2147483646 + 1; }   // (the thrower's primary, else pistol; the side whose enemies hear it)
  C.nades.push(g); traceStart(game, g);
  return 'Threw a ' + NADES[kind].name;
}
// Solid at (x, y, z)? (map boxes, the floor, the map edge) hitMover: the door or breakable it was, if any.
// keepPanes (stepNade: a copy's g.panes — a client's replay of the host's toss, which broke them): panes taken as whole
// for that copy though broken here, until it meets each (the host broke it at the first touch: then it is off for the
// copy too), so it slows at them as the host's flight did (no 11-unit snap when it lands).
let hitMover = null, keepPanes = null;
const whole = b => !b.off || keepPanes !== null && b.mat === 'glass' && keepPanes.includes(b.mover);
function solid(boxes, bounds, x, y, z) {
  if (boxes.nadeMesh) return meshHit(boxes, bounds, x, y, z);
  if (y < R) return true; if (bounds && (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ)) return true;
  // A map file: its own shapes (bsp-map.js nadeSolid: no player clips, gaps as small as the map has them), and its
  // doors and breakables while shut / whole.
  hitMover = null; if (boxes.nadeSolid) { if (boxes.nadeSolid(x, y, z)) return true; for (const b of boxes.movers) if (whole(b) && x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R && y > b.y0 - R && y < b.y1 + R) { hitMover = b; return true; } return false; }
  for (const b of boxesNear(boxes, x - R, z - R, x + R, z + R, SO)) if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R && y > b.y0 - R && y < b.y1 + R) return true; return false;
}
// A CS2 map with its grenade triangles (boxes.nadeMesh, dist/nade-mesh.js): does the grenade's ball touch something
// at (x, y, z)? Then N is the way out (the surface's own direction; round at an edge or a corner) and DEPTH how far in.
// The map's edge (its grid's bounds: walls the map file has as clips), its doors and breakables (by their boxes) as
// before — and no floor of our own: under CS2's lowest triangle there is nothing (a grenade falling VOID_DEPTH past
// it has left the world: stepNade marks it g.void; the old plane at the lowest player floor held grenades in mid-air
// over the Anubis canal and caught every lob over an outer wall).
const CT = new Float64Array(4), PEN = new Float64Array(6); let DEPTH = 0;
function meshHit(boxes, bounds, x, y, z) {
  hitMover = null; hitKind = 3;
  if (bounds) { const e = Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z); if (e < 0) { N[1] = 0; N[0] = e === x - bounds.minX ? 1 : e === bounds.maxX - x ? -1 : 0; N[2] = N[0] ? 0 : e === z - bounds.minZ ? 1 : -1; DEPTH = -e; return true; } }
  hitKind = 2; for (const b of boxes.movers || NONE) { if (!whole(b) || x <= b.minX - R || x >= b.maxX + R || z <= b.minZ - R || z >= b.maxZ + R || y <= b.y0 - R || y >= b.y1 + R) continue; hitMover = b;
    const p = PEN; p[0] = x - (b.minX - R); p[1] = b.maxX + R - x; p[2] = y - (b.y0 - R); p[3] = b.y1 + R - y; p[4] = z - (b.minZ - R); p[5] = b.maxZ + R - z; let k = 0; for (let i = 1; i < 6; i++) if (p[i] < p[k]) k = i;
    N[0] = k === 0 ? -1 : k === 1 ? 1 : 0; N[1] = k === 2 ? -1 : k === 3 ? 1 : 0; N[2] = k === 4 ? -1 : k === 5 ? 1 : 0; DEPTH = p[k]; return true; }
  hitKind = 1; if (boxes.nadeMesh.contact(x, y, z, R, CT)) { N[0] = CT[0]; N[1] = CT[1]; N[2] = CT[2]; DEPTH = CT[3]; return true; }
  return false;
}
let hitKind = 0;   // (what meshHit met: 1 a CS2 surface, 2 a door / breakable, 3 the map's edge)
// Where the segment a→b first crosses CS2's triangles: its fraction (0…1; Infinity: nowhere) and the crossed surface's
// unit normal into FN, turned back towards a (nade-mesh.js first(); without it — an older map wrapper — bisection on
// blocked(), the normal then straight back along the segment). sightOnly: only surfaces that stop sight.
const FN = new Float64Array(3), NONE = [];
function meshFirst(M, ax, ay, az, bx, by, bz, sightOnly = false) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  if (M.first) { const w = M.first(ax, ay, az, bx, by, bz, sightOnly, FN); if (!(w <= 1)) return Infinity; if (FN[0] * dx + FN[1] * dy + FN[2] * dz > 0) { FN[0] = -FN[0]; FN[1] = -FN[1]; FN[2] = -FN[2]; } return w; }
  if (!M.blocked(ax, ay, az, bx, by, bz, sightOnly)) return Infinity; let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (M.blocked(ax, ay, az, ax + dx * m, ay + dy * m, az + dz * m, sightOnly)) hi = m; else lo = m; }
  const L = Math.hypot(dx, dy, dz) || 1; FN[0] = -dx / L; FN[1] = -dy / L; FN[2] = -dz / L; return hi; }
// One physics step of a flying grenade (host tick, client copy, preview, a dropped gun), as Source moves a grenade, in
// substeps never longer than SUB (most of its radius) — as many as its speed and the gravity it gains over dt need, so a
// long host tick or a client catching up takes more of them, never longer ones (the old fixed cap of 24 let a 100 ms
// tick pass thin walls) — and on CS2's triangles each substep's committed path is swept: a surface the centre would
// cross (a one-faced wall, a thin floor) stops it there, R on the side it came from. Nothing is passed through at any
// tick length. On a hit (Source's ResolveFlyCollisionCustom, run once a 64-tick): reflected off the surface's own way
// out (slopes and corners too), 45 % of the speed kept; touching again within the same 1/64 s it only slides along (no
// sinking in, no second loss: the loss per second is Source's whatever the step); on a floor (facing up within ~45°)
// it stops dead once slower than 30 u/s, off a wall too slow it drops. Speed is capped at Source's sv_maxvelocity
// (3500 u/s). Falling VOID_DEPTH under the map's lowest triangle marks g.void (out of the world); numbers gone non-
// finite mark g.bad. Allocation-free. Returns true when it hit a floor; lastNy: the most upward-facing surface hit.
const STOP = 30 * HU, SUB = R * .8, N = new Float64Array(3), DIRS = [], GLASS_KEEP = .15, TICK = 1 / 64, MAX_V = 3500 * HU, VOID_DEPTH = 64 * HU, STILL = 1;
let lastNy = -1, probe = null;
// Tests: a function called after each substep a flight moves (g, and where it was: ox, oy, oz) — the sweep test checks
// every committed piece of path against the map's triangles. null (the game): nothing.
export function setNadeProbe(fn) { probe = typeof fn === 'function' ? fn : null; }
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) { const l = Math.hypot(x, y, z); DIRS.push([x / l, y / l, z / l]); }
// The surface's way out at a contact (into N): the mean of the directions round it that are free.
function normalAt(boxes, bounds, x, y, z) {
  let nx = 0, ny = 0, nz = 0; const e = R * 1.6;
  for (const d of DIRS) if (!solid(boxes, bounds, x + d[0] * e, y + d[1] * e, z + d[2] * e)) { nx += d[0]; ny += d[1]; nz += d[2]; }
  const l = Math.hypot(nx, ny, nz); if (l < 1e-6) { N[0] = 0; N[1] = 1; N[2] = 0; } else { N[0] = nx / l; N[1] = ny / l; N[2] = nz / l; } }
// Players (the host's step only: bodies = [{ name, x, y (feet), z, h (hull height; a crouch's is lower) }]): a grenade that meets one bounces off at 30 % of
// its usual 45 % (Source: players are no floor and soak up most of it), never off whoever threw it (Source makes the
// thrower the grenade's owner, and a projectile's traces skip their owner — for the whole flight, not a moment).
const BODY_R = 16 * HU, BODY_H = 72 * HU, PLAYER_BOUNCE = BOUNCE * .3;
function bodyHit(bodies, thrower, x, y, z) {
  for (const b of bodies) { if (b.name === thrower) continue; const cx = Math.max(b.x - BODY_R, Math.min(x, b.x + BODY_R)), cy = Math.max(b.y, Math.min(y, b.y + (b.h ?? BODY_H))), cz = Math.max(b.z - BODY_R, Math.min(z, b.z + BODY_R)), dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= R * R) continue; const d = Math.sqrt(d2); if (d > 1e-6) { N[0] = dx / d; N[1] = dy / d; N[2] = dz / d; DEPTH = R - d; } else { const hx = x - b.x, hz = z - b.z, hl = Math.hypot(hx, hz) || 1; N[0] = hx / hl; N[1] = 0; N[2] = hz / hl; DEPTH = BODY_R - Math.hypot(hx, hz) + R; } return true; }
  return false; }
// The surface's answer at a contact whose way out is (nx, ny, nz) (Source's ResolveFlyCollisionCustom): only when the
// grenade moves into it; a fresh hit (none in the last 1/64 s — Source resolves one a tick) reflects it (overbounce 2)
// keeping `keep` of the speed, another touch in the same tick only takes away what goes into the surface. Then on a
// floor at rest once slower than STOP; off a wall too slow it is stopped (and drops). Returns true on a floor.
function bounce(g, nx, ny, nz, keep) {
  const d = g.vx * nx + g.vy * ny + g.vz * nz; if (d >= 0) return false; if (ny > lastNy) lastNy = ny;
  if ((g.bt ?? TICK) >= TICK) { g.vx = (g.vx - 2 * d * nx) * keep; g.vy = (g.vy - 2 * d * ny) * keep; g.vz = (g.vz - 2 * d * nz) * keep; g.bt = 0; } else { g.vx -= d * nx; g.vy -= d * ny; g.vz -= d * nz; }
  const sp = Math.hypot(g.vx, g.vy, g.vz); if (ny > .7) { if (sp < STOP) { g.vx = g.vy = g.vz = 0; g.rest = true; } return true; }
  if (sp < STOP) g.vx = g.vy = g.vz = 0; return false; }
// The last contact (the host's development log of a grenade that went wrong: nadesTick → NADE_LOG).
const LC = new Float64Array(7); let lcSet = false;
const note = (x, y, z, nx, ny, nz, what) => { LC[0] = x; LC[1] = y; LC[2] = z; LC[3] = nx; LC[4] = ny; LC[5] = nz; LC[6] = what; lcSet = true; };   // what: 1 mesh, 2 door / breakable, 3 map edge, 4 body, 5 box, 6 crossing caught by the sweep
export function stepNade(g, boxes, bounds, dt, bodies = null) {
  let hitFloor = false; lastNy = -1; lcSet = false;
  if (!Number.isFinite(g.x + g.y + g.z + g.vx + g.vy + g.vz)) { g.bad = true; return false; }
  if (!(dt > 0)) return false; if (dt > 1) dt = 1;   // (callers step ≤ 0.25 s; a guard)
  keepPanes = g.view && g.panes?.length ? g.panes : null;   // (only for this step: reset below)
  const M = boxes.nadeMesh, grav = g.grav ?? GRAVITY, voidY = M ? (M.minY ?? 0) - VOID_DEPTH : -Infinity; let sp = Math.hypot(g.vx, g.vy, g.vz);
  if (sp > MAX_V) { const k = MAX_V / sp; g.vx *= k; g.vy *= k; g.vz *= k; sp = MAX_V; }
  if (g.rest && !solid(boxes, bounds, g.x, g.y - R * 1.2, g.z)) g.rest = false;   // (the floor went: a door opened, a crate broke)
  const n = g.rest ? 0 : Math.max(1, Math.ceil((sp + Math.abs(grav) * dt) * dt / SUB)), h = dt / Math.max(1, n);
  for (let s = 0; s < n; s++) {
    g.bt = (g.bt ?? TICK) + h; const ox = g.x, oy = g.y, oz = g.z;
    const gh = grav * h, x = g.x + g.vx * h, y = g.y + (g.vy - gh * .5) * h, z = g.z + g.vz * h; g.vy -= gh;   // (half the step's gravity before the move, half after: Source's PhysicsAddGravityMove — the exact arc, whatever the step; g.grav: a dropped gun falls at the full 800)
    if (bodies && bodies.length && bodyHit(bodies, g.by, x, y, z)) { const nx = N[0], ny = N[1], nz = N[2], d = g.vx * nx + g.vy * ny + g.vz * nz; let px = x + nx * DEPTH, py = y + ny * DEPTH, pz = z + nz * DEPTH;
      if (M && meshFirst(M, ox, oy, oz, px, py, pz) <= 1) { px = ox; py = oy; pz = oz; }   // (pushed off a body into a wall: stays where it was)
      g.x = px; g.y = py; g.z = pz; note(px, py, pz, nx, ny, nz, 4); if (probe !== null) probe(g, ox, oy, oz);
      if (d < 0) { g.vx = (g.vx - 2 * d * nx) * PLAYER_BOUNCE; g.vy = (g.vy - 2 * d * ny) * PLAYER_BOUNCE; g.vz = (g.vz - 2 * d * nz) * PLAYER_BOUNCE; } continue; }
    // CS2's triangles: out of the surface to just touching it, then off it — reflected about the surface's own way out,
    // 45 % kept; a second surface still touching (a corner) pushes it out of that too. Then the sweep: the way from where
    // it was to where it ends up must cross no surface — if it does, it stops at the crossing, R back.
    if (M) { let px = x, py = y, pz = z, nx = 0, ny = 0, nz = 0, hit = 0;
      if (meshHit(boxes, bounds, x, y, z)) {
        if (hitMover && hitMover.mat === 'glass') { if (!g.view) { (g.glass ??= []).push(hitMover.mover); hitMover.off = true; } else if (hitMover.off) keepPanes = g.panes = g.panes.filter(id => id !== hitMover.mover); else if (g.pastGlass === hitMover) { g.x = x; g.y = y; g.z = z; continue; } else g.pastGlass = hitMover; g.vx *= GLASS_KEEP; g.vz *= GLASS_KEEP; g.vy = Math.min(g.vy, 0) * GLASS_KEEP; continue; }   // (g.view: a copy of a flight — a client's, the preview, a client's replay of a dropped gun: the host breaks the pane for everyone; the copy only goes on through it)
        nx = N[0]; ny = N[1]; nz = N[2]; hit = hitKind;
        px = x + nx * DEPTH; py = y + ny * DEPTH; pz = z + nz * DEPTH;
        if (meshHit(boxes, bounds, px, py, pz) && !(hitMover && hitMover.mat === 'glass')) { px += N[0] * DEPTH; py += N[1] * DEPTH; pz += N[2] * DEPTH; } }
      const w = meshFirst(M, ox, oy, oz, px, py, pz);
      if (w <= 1) { nx = FN[0]; ny = FN[1]; nz = FN[2]; hit = 6; px = ox + (px - ox) * w + nx * R; py = oy + (py - oy) * w + ny * R; pz = oz + (pz - oz) * w + nz * R;
        if (meshHit(boxes, bounds, px, py, pz) && !(hitMover && hitMover.mat === 'glass')) { px += N[0] * DEPTH; py += N[1] * DEPTH; pz += N[2] * DEPTH; }
        if (meshFirst(M, ox, oy, oz, px, py, pz) <= 1) { px = ox; py = oy; pz = oz; } }   // (a tight corner: it stays where it was this substep)
      g.x = px; g.y = py; g.z = pz; if (probe !== null) probe(g, ox, oy, oz);
      if (hit) { note(px, py, pz, nx, ny, nz, hit); if (bounce(g, nx, ny, nz, BOUNCE)) hitFloor = true; if (g.rest) break; }
      if (g.y < voidY) { g.void = true; g.vx = g.vy = g.vz = 0; break; }   // (under the world's lowest surface: out of the world)
      continue; }
    if (!solid(boxes, bounds, x, y, z)) { g.x = x; g.y = y; g.z = z; if (probe !== null) probe(g, ox, oy, oz); continue; }
    // A glass pane in the way: it breaks, and the grenade, its run spent on it, drops on through (g.glass: which pane —
    // the host breaks it for everyone; a copy of a flight, g.view, only goes on through it).
    if (hitMover && hitMover.mat === 'glass') { if (!g.view) { (g.glass ??= []).push(hitMover.mover); hitMover.off = true; } else if (hitMover.off) keepPanes = g.panes = g.panes.filter(id => id !== hitMover.mover); else if (g.pastGlass === hitMover) { g.x = x; g.y = y; g.z = z; continue; } else g.pastGlass = hitMover; g.vx *= GLASS_KEEP; g.vz *= GLASS_KEEP; g.vy = Math.min(g.vy, 0) * GLASS_KEEP; continue; }
    normalAt(boxes, bounds, x, y, z); note(g.x, g.y, g.z, N[0], N[1], N[2], hitMover ? 2 : 5); if (bounce(g, N[0], N[1], N[2], BOUNCE)) hitFloor = true; if (g.rest) break; }
  keepPanes = null; if (!Number.isFinite(g.x + g.y + g.z + g.vx + g.vy + g.vz)) g.bad = true;
  const speed = Math.hypot(g.vx, g.vy, g.vz); g.still = speed < STILL ? (g.still || 0) + dt : 0; return hitFloor;
}
// A dropped gun's toss (CS2: thrown forward with your run, it bounces and slides to a stop): the same flight as a
// grenade's, stepped at TOSS_DT until it rests (at most TOSS_MAX s). The host keeps where it ends up (pickups) and
// breaks the panes it went through (glass: their ids — arena-logic.js puts them in the map state, as a grenade's);
// every client replays the same steps as a copy (g.view: never touching its own collision; g.panes = fly.glass, the
// panes the host's toss broke, taken as whole by the copy — the map state has them broken by the time it replays, and
// without them it flew on unslowed and snapped ~11 units back on landing) to show it flying there (arena-ui.js). Out of
// the world: it lies where it was dropped. Returns { x, y (its floor), z, ms, glass }.
export const TOSS_DT = 1 / 32, TOSS_MAX = 3;
export const TOSS_GRAVITY = 800 * HU;
export function tossFlight(boxes, bounds, fly, view = false) { const g = { x: fly.x, y: fly.y, z: fly.z, vx: fly.vx, vy: fly.vy, vz: fly.vz, still: 0, grav: TOSS_GRAVITY, ...(view ? { view: true, panes: Array.isArray(fly.glass) ? fly.glass : null } : {}) }; let t = 0;
  for (; t < TOSS_MAX && !g.rest && !g.void && !g.bad; t += TOSS_DT) stepNade(g, boxes, bounds, TOSS_DT);
  if (g.void || g.bad) { const f = groundUnder(boxes, num(fly.x), num(fly.z), num(fly.y)); return { x: num(fly.x), y: Math.max(0, f ?? 0), z: num(fly.z), ms: 0, glass: g.glass || null }; }
  return { x: g.x, y: Math.max(0, g.y - R), z: g.z, ms: Math.round(t * 1000), glass: g.glass || null }; }
// When does it go off? (age in ms since the throw) A molotov / incendiary on the first floor flat enough (CS:GO's
// weapon_molotov_maxdetonateslope 30°: CS2's assumed the same) — on a steeper one it bounces on — else in the air after
// its fuse; a smoke and a decoy once at rest (no faster than STILL for 0.2 s: Source checks every 0.2 s for a speed of
// about nothing), not before the fuse, at the latest after maxAir.
const FIRE_SLOPE_NY = Math.cos(30 * Math.PI / 180);
const goesOff = (g, hitFloor, age) => { const N = NADES[g.kind]; return isFire(g.kind) ? (hitFloor && lastNy >= FIRE_SLOPE_NY) || age > N.fuse : g.kind === 'smoke' || g.kind === 'decoy' ? ((g.rest || g.still > .2) && age >= N.fuse) || age > N.maxAir : age >= N.fuse; };
// The path a throw will take (client preview): points every 50 ms until it goes off (≤ 4 s). A copy of a flight
// (view): it never breaks a pane in the local collision — the real throw does that for everyone.
export function predictThrow(kind, a, boxes = [], bounds = null) {
  const g = { kind, ...throwStart(a, boxes?.length ? boxes : null, bounds), ...launch(a), still: 0, view: true }, pts = [[g.x, g.y, g.z]];
  for (let t = 50; t <= 4000; t += 50) { const hit = stepNade(g, boxes, bounds, .05); pts.push([g.x, g.y, g.z]); if (g.void || g.bad || goesOff(g, hit, t)) break; }
  return pts;
}
// The living, for grenades (bodies to bounce off, blasts, flashes, fire): players at their pose — feet = the eye less
// its height over them (e: pose.ey, from the client's true feet, lan/room.mjs; else CS2's eye, 64 HU standing / 46
// crouched — as combat-logic.js poseFeet; the old eye − 64 HU put a crouched player's feet 18 HU under the floor, so
// an HE's feet sample hit the slab and crouching took a fifth off its damage) and the hull's top (h: the 72 HU hull,
// lowered as far as the eye is — CS2's 72 → 54 HU as its eye goes 64 → 46); bots at their own feet (bot.y, kept by
// arena-logic.js; the column's top floor only when unknown — a bot on Nuke's lower level is not upstairs), standing;
// with where they look (yaw; bots: bot.yaw).
const DUCK_EYE = 46 * HU;
const people = (game, players) => { const out = []; for (const p of players) if (p.pose && !isDown(game, p.name)) { const q = p.pose, e = Number.isFinite(q.ey) ? q.ey : q.crouched ? DUCK_EYE : EYE; out.push({ name: p.name, x: q.x, z: q.z, y: (q.y || EYE) - e, e, h: BODY_H - Math.max(0, EYE - e), yaw: +q.yaw || 0, pitch: +q.shot?.pitch || 0 }); }
  for (const b of game.arena?.bots || []) if (!isDown(game, b.name)) out.push({ name: b.name, x: b.x, z: b.z, y: Number.isFinite(b.y) ? b.y : floorAt(ARENA_MAPS[game.arena?.map], ARENA.cx, ARENA.cz, b.x, b.z) || 0, e: EYE, h: BODY_H, yaw: +b.yaw || 0, pitch: 0, bot: b }); return out; };
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
// host's grenade state: every client opens the same hole at the same place and time. Bullets cut short-lived tunnels
// (smokeCut, TUNNEL). The density at a point is the one the screen draws (the same bytes, the same billows, the same
// formula as the view's march, arena-nades-view.js), and a sightline is blocked when less than SMOKE.see of the light
// gets through it: e^(−k · ∫density) < see — about SMOKE.block (≈ 3.6) units of dense smoke — the same rule from
// outside, at the edge and from inside, whatever the order or overlap of the clouds (their densities add).
// Without the map's boxes (a test with no map): the ellipsoid alone, lifted a little off the ground.
// (k: light swallowed per unit of full-density smoke — the renderer's and the rules' one figure, picked by look: an
// approximation, not a CS2 value; see: 2 % of the light through counts as unseen)
export const SMOKE = { lift: .42, vert: .91, top: 1.54, grow: 1800, fade: 3000, holeR: 217 * HU, holeGrow: 150, holeOpen: 1100, holeClose: 750, k: 1.1, see: .02, block: Math.log(1 / .02) / 1.1, near: 1.2 };   // (near: the screen's march starts this far from the eye — arm's length, your gun and hands never in it — and smokeHides' lines too)   // (holes: in the middle it clears the whole cloud, at its side the part round it; about 2 s)
export const VOX = 3, VOX_UP = 1, VOX_DMAX = 1.7;   // (CS2's cloud: a dome about 300 units across and 150 high)
let solidsOf = null;
// (game) → the arena map's collision boxes (arena-logic.js on the host; the client's scene, which has them built).
export function setSmokeSolids(fn) { solidsOf = fn; smokeNoise(); }   // (the billows' bytes made now, at start — not at the first smoke)
const VOXELS = new Map(), VOXW = new WeakMap();   // (VOXW: smoke → its cells while it lies where they were made — a look-up per sample with no key string)
const growOf = (s, now) => { const t = now - (s.firedAt || now); return 1 - Math.pow(1 - Math.min(1, Math.max(0, t) / SMOKE.grow), 3); };
const fadeOf = (s, now) => Math.max(0, Math.min(1, (NADES.smoke.lasts - (now - (s.firedAt || now))) / SMOKE.fade));
export function smokeShape(s, now) { return { r: NADES.smoke.radius * (.35 + .65 * growOf(s, now)), dens: fadeOf(s, now), cy: (s.y || 0) + NADES.smoke.radius * SMOKE.lift }; }
// The cells a smoke fills (cached per smoke and spot): a grid of VOX cells round it; d = each filled cell's path length
// from the canister (Infinity: not filled), solid = 1 where the map is (the view stops its rays there); dFill = the
// longest path filled. Null without the map's boxes.
// The doors and panes it fills round are those of the moment it popped: the first fill (the host's, at the pop) stamps
// them into the smoke (s.mv: the open / broken parts near it), and every later fill — a client's, a cache miss — uses
// that stamp, not the doors as they are now (a door opened later doesn't change where the smoke is, and a client
// filling a moment later can't disagree with the host).
export function smokeVoxels(game, s) {
  const map = game?.arena?.map || '', w = VOXW.get(s); if (w && w.x === s.x && w.y === (s.y || 0) && w.z === s.z && w.map === map) return w.v;
  let boxes = null; if (typeof s.mv !== 'string') { boxes = solidsOf?.(game); if (!boxes?.length) return null; s.mv = moverStamp(boxes, s); }
  const key = s.id + ':' + map + ':' + Math.round(s.x * 10) + ',' + Math.round((s.y || 0) * 10) + ',' + Math.round(s.z * 10) + ':' + s.mv; let v = VOXELS.get(key);
  if (v === undefined) { boxes ??= solidsOf?.(game); if (!boxes?.length) return null; v = fillSmoke(boxes, s, s.mv); if (VOXELS.size > 24) VOXELS.delete(VOXELS.keys().next().value); VOXELS.set(key, v); }
  VOXW.set(s, { v, x: s.x, y: s.y || 0, z: s.z, map }); return v;
}
// The open / broken door and pane parts (mover:role) within a smoke's grid, sorted: its stamp.
const MV = [];
function moverStamp(boxes, s) { const M = boxes.movers; if (!M?.length) return ''; const R = NADES.smoke.radius * VOX_DMAX + 2 * VOX, y0 = (s.y || 0) - 2 * VOX, y1 = (s.y || 0) + NADES.smoke.radius * SMOKE.top + 2 * VOX; MV.length = 0;
  for (const b of M) if (b.off && b.maxX > s.x - R && b.minX < s.x + R && b.maxZ > s.z - R && b.minZ < s.z + R && b.y1 > y0 && b.y0 < y1) MV.push(b.mover + ':' + b.role);
  return MV.sort().join('|'); }
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
function fillSmoke(boxes, s, mv = null) {
  const R = NADES.smoke.radius, D = R * VOX_DMAX, nx = Math.ceil(2 * D / VOX), nz = nx, ny = Math.ceil((R * SMOKE.top + VOX) / VOX), x0 = s.x - nx * VOX / 2, z0 = s.z - nz * VOX / 2, y0 = (s.y || 0) - VOX;
  const N = nx * ny * nz, solid = new Uint8Array(N), d = new Float32Array(N).fill(Infinity), at = (i, j, k) => (k * ny + j) * nx + i, near = [], off = typeof mv === 'string' ? new Set(mv ? mv.split('|') : []) : null;
  // Solid cells: a box reaching more than half a unit into the cell (a thin wall always fills one; a doorway always
  // leaves one) — each box near drawn into the grid once. Doors and panes as the stamp has them (smokeVoxels).
  for (const b of boxesNear(boxes.bullets || boxes, x0, z0, x0 + nx * VOX, z0 + nz * VOX, near)) { if (off && b.mover != null ? off.has(b.mover + ':' + b.role) : b.off) continue;   // (CS2 maps: the bullets' boxes — smoke pours through player clips and fences)
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
  // As the view's texture holds it and the rules read it — the same bytes the GPU filters: r8 = path / scaleD in 8 bits
  // (255: empty); box = the filled cells' bounds, half a cell wider (the filtering's reach), in world units.
  const dF = Math.max(dFill, VOX), scaleD = dF * 1.25, r8 = new Uint8Array(N).fill(255); let li = nx, lj = ny, lk = nz, hi = -1, hj = -1, hk = -1;
  for (let k = 0, c = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) { const dc = d[c]; if (dc === Infinity) continue; r8[c] = Math.min(254, Math.round(dc / scaleD * 255)); if (i < li) li = i; if (j < lj) lj = j; if (k < lk) lk = k; if (i > hi) hi = i; if (j > hj) hj = j; if (k > hk) hk = k; }
  const box = hi < 0 ? null : [x0 + (li - .5) * VOX, y0 + (lj - .5) * VOX, z0 + (lk - .5) * VOX, x0 + (hi + 1.5) * VOX, y0 + (hj + 1.5) * VOX, z0 + (hk + 1.5) * VOX];
  return { x0, y0, z0, nx, ny, nz, d, solid, dFill: dF, scaleD, r8, box };
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
// With a map's boxes: once more on them (its box grid's lookups warmed too), at a spot of it. The first HE into a smoke
// (blastFill: ~20 ms cold), the billows' noise and the density the rules march through are warmed with it — none of
// them a first-use stall in play.
export function warmSmoke(boxes = null, x = 0, y = 0, z = 0) { const b = (minX, maxX, minZ, maxZ, y0, y1) => ({ minX, maxX, minZ, maxZ, y0, y1 }), room = [b(-90, 90, -90, 90, -4, 0), b(-90, 90, 20, 23, 0, 30), b(-90, 90, -90, 90, 50, 54)]; smokeNoise();
  const warm = (v, sx, sy, sz) => { if (!v.box) return 0; const h = { x: sx, y: sy + 1, z: sz, at: 0 }; HOLEW.set(h, { v, d: blastFill(v, h.x, h.y, h.z) }); const P = prep({ id: '~warm', x: sx, y: sy, z: sz, firedAt: 0, holes: [h] }, v, 900), B = v.box; let q = 0;
    for (let i = 0; i < 600; i++) q += voxDensity(P, B[0] + (B[3] - B[0]) * (i % 25) / 25, sy + 2 + (i % 7), B[2] + (B[5] - B[2]) * ((i / 25) | 0) / 24); return q; };
  for (let i = 0; i < 2; i++) warm(fillSmoke(room, { x: 0, y: .35, z: 0 }), 0, .35, 0); if (boxes?.length) warm(fillSmoke(boxes, { x, y, z }), x, y, z); }
// The front of a smoke's spread now (path length; cells further along are still empty).
export const smokeFront = (v, s, now) => v.dFill * (.3 + .7 * growOf(s, now)) + VOX;
// Without the map (tests): how dense the ellipsoid is at a point (0 … 1), before its holes.
function ellipsoid(s, x, y, z, now) { const S = smokeShape(s, now), q = Math.hypot(x - s.x, z - s.z, (y - S.cy) / SMOKE.vert) / S.r; return q >= 1 ? 0 : (q < .7 ? 1 : (1 - q) / .3) * S.dens; }
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
// ── The density: what the screen draws (arena-nades-view.js marches exactly this) and what the rules count ──
// The billows (CS2's lumpy, drifting edge): tileable cellular noise (Worley, turned over: 1 at each puff's middle) of
// two sizes, 32³ bytes from a fixed seed — the same bytes here and on the GPU (the view uploads smokeNoise()), sampled
// the same way (trilinear, wrapping), drifting on the host's clock: the edge the rules see is the edge drawn. Made once,
// when first needed (warmSmoke: the loading screen).
let N3 = null;
export function smokeNoise() { if (N3) return N3; const n = 32, a = new Uint8Array(n * n * n); let s = 1234567; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const octave = cells => { const pts = new Float32Array(cells ** 3 * 3); for (let i = 0; i < pts.length; i++) pts[i] = rnd(); return { pts, cells, cs: n / cells }; };
  const worley = ({ pts, cells, cs }, x, y, z) => { const cx = Math.floor(x / cs), cy = Math.floor(y / cs), cz = Math.floor(z / cs); let best = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ix = cx + dx, iy = cy + dy, iz = cz + dz, c = ((((iz % cells) + cells) % cells * cells + ((iy % cells) + cells) % cells) * cells + ((ix % cells) + cells) % cells) * 3;
      const px = (ix + pts[c]) * cs - x, py = (iy + pts[c + 1]) * cs - y, pz = (iz + pts[c + 2]) * cs - z, d2 = px * px + py * py + pz * pz; if (d2 < best) best = d2; }
    return Math.max(0, 1 - Math.sqrt(best) / cs); };
  const big = octave(4), small = octave(8);
  for (let z = 0, i = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++, i++) a[i] = Math.round(255 * Math.min(1, .68 * worley(big, x + .5, y + .5, z + .5) + .32 * worley(small, x + .5, y + .5, z + .5)));
  return N3 = a; }
// (scale: puffs ~60 units; rise / turn: the drift per second, up and sideways; period: the clock wraps every 1000 s,
// where the drift has moved a whole number of texture repeats — no jump)
export const BILLOW = { scale: .0165, rise: .006, turn: .002, period: 1000 };
function noise3(x, y, z) { const N = N3 || smokeNoise(); x = x * 32 - .5; y = y * 32 - .5; z = z * 32 - .5; const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
  const i0 = i & 31, i1 = (i + 1) & 31, j0 = (j & 31) << 5, j1 = ((j + 1) & 31) << 5, k0 = (k & 31) << 10, k1 = ((k + 1) & 31) << 10;
  const a = N[k0 + j0 + i0], b = N[k0 + j0 + i1], c = N[k0 + j1 + i0], d = N[k0 + j1 + i1], e = N[k1 + j0 + i0], f = N[k1 + j0 + i1], g = N[k1 + j1 + i0], h = N[k1 + j1 + i1];
  const ab = a + (b - a) * fx, cd = c + (d - c) * fx, ef = e + (f - e) * fx, gh = g + (h - g) * fx, l0 = ab + (cd - ab) * fy; return (l0 + (ef + (gh - ef) * fy - l0) * fz) / 255; }
// Both sizes of billow at a point at host time t (s, within BILLOW.period): 0 … 1.
function billow(x, y, z, t) { const qx = x * BILLOW.scale, qy = y * BILLOW.scale - t * BILLOW.rise, qz = z * BILLOW.scale + t * BILLOW.turn; return noise3(qx, qy, qz) * .72 + noise3(qx * 2.3 + .31, qy * 2.3 + .31, qz * 2.3 + .31) * .28; }
// A grid's bytes (r8: the spread; a hole's reach) at a point, trilinear as the GPU filters them (cell centres at
// (i + ½) VOX); cells outside the grid read 255 (empty — the view's texture has a border of them): 0 … 1.
function voxByte(a, v, x, y, z) { const nx = v.nx, ny = v.ny, nz = v.nz, fx = (x - v.x0) / VOX - .5, fy = (y - v.y0) / VOX - .5, fz = (z - v.z0) / VOX - .5, i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), wx = fx - i, wy = fy - j, wz = fz - k; let c000, c100, c010, c110, c001, c101, c011, c111;
  if (i >= 0 && j >= 0 && k >= 0 && i + 1 < nx && j + 1 < ny && k + 1 < nz) { const o = (k * ny + j) * nx + i, sy = nx, sz = nx * ny; c000 = a[o]; c100 = a[o + 1]; c010 = a[o + sy]; c110 = a[o + sy + 1]; c001 = a[o + sz]; c101 = a[o + sz + 1]; c011 = a[o + sz + sy]; c111 = a[o + sz + sy + 1]; }
  else { if (i < -1 || j < -1 || k < -1 || i >= nx || j >= ny || k >= nz) return 1; const at = (ii, jj, kk) => ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz ? 255 : a[(kk * ny + jj) * nx + ii];
    c000 = at(i, j, k); c100 = at(i + 1, j, k); c010 = at(i, j + 1, k); c110 = at(i + 1, j + 1, k); c001 = at(i, j, k + 1); c101 = at(i + 1, j, k + 1); c011 = at(i, j + 1, k + 1); c111 = at(i + 1, j + 1, k + 1); }
  const x00 = c000 + (c100 - c000) * wx, x10 = c010 + (c110 - c010) * wx, x01 = c001 + (c101 - c001) * wx, x11 = c011 + (c111 - c011) * wx, y0 = x00 + (x10 - x00) * wy; return (y0 + (x01 + (x11 - x01) * wy - y0) * wz) / 255; }
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// A hole's reach in bytes (path / HOLE_MAX; 255 out of reach), as the view uploads it (once per hole).
export const HOLE_MAX = SMOKE.holeR * HOLE_OUT * 1.1;
function holeBytes(v, s, h) { holeField(v, s, h); const f = HOLEW.get(h); if (!f.b) { const d = f.d, b = f.b = new Uint8Array(d.length); for (let c = 0; c < d.length; c++) b[c] = d[c] === Infinity ? 255 : Math.min(254, Math.round(d[c] / HOLE_MAX * 255)); } return f.b; }
export function smokeHoleBytes(game, s, h) { const v = smokeVoxels(game, s); return v ? holeBytes(v, s, h) : null; }
// One smoke's state now (its front, fade, billow time, last two holes): worked out once per smoke per question.
const P = { v: null, front: 0, fade: 0, t: 0, h0: null, r0: 0, h1: null, r1: 0 };
function prep(s, v, now) { P.v = v; P.front = smokeFront(v, s, now); P.fade = fadeOf(s, now); P.t = (now / 1000) % BILLOW.period; P.h0 = P.h1 = null; P.r0 = P.r1 = 0; const H = s.holes;
  if (H?.length) for (let n = Math.max(0, H.length - 2); n < H.length; n++) { const r = holeRadius(H[n], now); if (r <= 0) continue; const b = holeBytes(v, s, H[n]); if (P.h0) { P.h1 = b; P.r1 = r; } else { P.h0 = b; P.r0 = r; } }
  return P; }
// One smoke's density at a point (0 … 1, before bullet tunnels) — line for line the view's march (SMOKE_DENSITY there):
// its spread front grown in over 2 cells, the billows eating its edge (where it lies deeper than ~60 % of its fill,
// solid whatever the billows), HE holes cleared to their radius now, its fade.
function voxDensity(P, x, y, z) { const v = P.v, r = voxByte(v.r8, v, x, y, z); if (r > .99) return 0; const dq = r * v.scaleD, grow = Math.min(1, Math.max(0, (P.front - dq) / (2 * VOX))); if (grow <= .003) return 0;
  const f = Math.min(1, Math.max(0, (v.dFill - dq) / v.dFill)); let n = .5, dens;
  if (f >= .595 && !P.h0) dens = grow; else { n = billow(x, y, z, P.t); dens = grow * smooth(.14, .22, f + (n - .5) * .75); }
  if (P.h0 && dens > 0) { const hd = voxByte(P.h0, v, x, y, z) * HOLE_MAX + (n - .5) * 2 * VOX, lo = P.r0 * HOLE_IN, hi = P.r0 * HOLE_OUT; dens *= Math.min(1, Math.max(0, (hd - lo) / (hi - lo))); }
  if (P.h1 && dens > 0) { const hd = voxByte(P.h1, v, x, y, z) * HOLE_MAX + (n - .5) * 2 * VOX, lo = P.r1 * HOLE_IN, hi = P.r1 * HOLE_OUT; dens *= Math.min(1, Math.max(0, (hd - lo) / (hi - lo))); }
  return dens * P.fade; }
// Bullet tunnels (CS2): a shot through a smoke clears a narrow tube along its path that fills in again within about a
// second — spraying holds it open. The host keeps the last TUNNEL.max shots that crossed a smoke (combat.cuts:
// [ax, ay, az, bx, by, bz, at], host clock — smokeCut); a client adds its own shots at once (smokeLocalCut) until the
// host's copy arrives. The rules subtract the same tubes the view clears (the newest TUNNEL.max of both).
// (radius ≈ 8 HU, open / close ms: approximations by eye, not figures from CS2's files)
export const TUNNEL = { radius: 1.3, open: 250, close: 900, reach: 400, max: 6 };
export const cutOpen = (c, now) => { const a = now - c[6]; return a < TUNNEL.open ? (a < -500 ? 0 : 1) : a < TUNNEL.open + TUNNEL.close ? 1 - (a - TUNNEL.open) / TUNNEL.close : 0; };
// Host: a shot from (x, y, z) along (dx, dy, dz): a tunnel if it crosses a smoke. True when one was cut.
export function smokeCut(game, x, y, z, dx, dy, dz, len = TUNNEL.reach, now = hostNow(game)) { const C = game.combat; if (!C?.nades?.some(s => s.phase === 'smoke')) return false;
  const n = Math.hypot(dx, dy, dz) || 1, L = Math.min(len, TUNNEL.reach), ex = x + dx / n * L, ey = y + dy / n * L, ez = z + dz / n * L; if (!crosses(game, x, y, z, ex, ey, ez, now)) return false;
  const r = q => Math.round(q * 100) / 100; C.cuts = (C.cuts || []).filter(c => cutOpen(c, now) > 0); C.cuts.push([r(x), r(y), r(z), r(ex), r(ey), r(ez), Math.round(now)]); if (C.cuts.length > TUNNEL.max) C.cuts.splice(0, C.cuts.length - TUNNEL.max); return true; }
// Host, each tick: the shots the players' poses count since the last tick (pose.shot.n; where the newest went: the pose's
// yaw and shot.pitch, from its eye) — each player's newest shot cuts its tunnel through any smoke it crosses. One per
// player per tick (a spray's tunnels follow the aim as the poses arrive). SHOTS: the counts seen, per match state.
const SHOTS = new WeakMap();
export function cutShots(game, players, now = hostNow(game)) { const C = game?.combat; if (!C || !players?.length) return 0; let seen = SHOTS.get(C), cut = 0; if (!seen) SHOTS.set(C, seen = new Map());
  const up = smokeUp(game); for (let i = 0; i < players.length; i++) { const p = players[i], q = p?.pose, n = q?.shot?.n; if (!Number.isFinite(n)) continue; const was = seen.get(p.name); seen.set(p.name, n);
    if (!up || was === undefined || n <= was || !Number.isFinite(q.x + q.y + q.z)) continue; const yaw = +q.yaw || 0, pitch = +q.shot.pitch || 0, c = Math.cos(pitch);
    if (smokeCut(game, q.x, q.y, q.z, -Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c, TUNNEL.reach, now)) cut++; }
  return cut; }
// Client: its own shot, at once (a ring of TUNNEL.max, reused) — rule state until the host's copy arrives (cutShots: the
// host cuts the same shot from your pose), so the models it hides agree with your screen meanwhile. `view`: another
// player's shot replayed here (multiplayer.js → fun-pistol onShot) — drawn only (c[7] = 1), never in the rules: its
// origin is this client's copy of his model, its length the full reach (the replay doesn't know where it stopped), so
// every client's would differ; the rules take other players' tunnels from the host alone. A replay's pellets (a
// shotgun: onShot per pellet) cut one tube per shot, so they never push the host's out. `game`: when given, a shot that
// crosses no smoke cuts nothing (the ring keeps the tunnels that matter). True when one was cut.
export const LOCAL_CUTS = []; const byAt = (a, b) => a[6] - b[6];
export function smokeLocalCut(x, y, z, dx, dy, dz, len = TUNNEL.reach, now = Date.now(), view = false, game = null) { const n = Math.hypot(dx, dy, dz) || 1, L = Math.min(len, TUNNEL.reach), ex = x + dx / n * L, ey = y + dy / n * L, ez = z + dz / n * L;
  if (view) for (let i = 0; i < LOCAL_CUTS.length; i++) { const q = LOCAL_CUTS[i]; if (q[7] && Math.abs(q[6] - now) < 30 && Math.abs(q[0] - x) + Math.abs(q[1] - y) + Math.abs(q[2] - z) < .01) return false; }   // (the same replayed shot's other pellets)
  if (game && !crosses(game, x, y, z, ex, ey, ez, now)) return false;
  const c = LOCAL_CUTS.length < TUNNEL.max ? LOCAL_CUTS[LOCAL_CUTS.push(new Float64Array(8)) - 1] : LOCAL_CUTS[0];   // (oldest first: the oldest is reused)
  c[0] = x; c[1] = y; c[2] = z; c[3] = ex; c[4] = ey; c[5] = ez; c[6] = now; c[7] = view ? 1 : 0; LOCAL_CUTS.sort(byAt); return true; }
// The tunnels open now, newest first (TUNNEL.max of them: the host's, then your own the host hasn't sent back yet):
// CUT[n·7 …] = ax, ay, az, bx, by, bz, openness. Returns how many (and smokeCutsNow hands them to the view).
const CUT = new Float64Array(TUNNEL.max * 7); let CUT_N = 0, BARE = false;
// Does a shot's line cross smoke? (the clouds as they are, the open tunnels ignored: a spray down its own tunnel keeps it open)
function crosses(game, ax, ay, az, bx, by, bz, now) { BARE = true; try { return smokeDepth(game, ax, ay, az, bx, by, bz, now, 1e-3) > 1e-3; } finally { BARE = false; } }
const hostHas = (H, c) => { for (let i = 0; i < H.length; i++) { const h = H[i]; if (Math.abs(h[6] - c[6]) < 600 && Math.hypot(h[0] - c[0], h[1] - c[1], h[2] - c[2]) < 4) return true; } return false; };
function cutsNow(game, now, view = false) { const H = game.combat?.cuts, L = LOCAL_CUTS; let i = BARE ? -1 : (H?.length || 0) - 1, j = BARE ? -1 : L.length - 1; CUT_N = 0;   // (view: the screen's set — also others' replayed shots)
  while (CUT_N < TUNNEL.max && (i >= 0 || j >= 0)) { let c; if (j < 0 || (i >= 0 && H[i][6] >= L[j][6])) c = H[i--]; else { c = L[j--]; if ((c[7] && !view) || (H && hostHas(H, c))) continue; }
    const w = cutOpen(c, now); if (w <= 0) continue; const o = CUT_N++ * 7; for (let k = 0; k < 6; k++) CUT[o + k] = c[k]; CUT[o + 6] = w; }
  return CUT_N; }
export const SMOKE_CUTS = CUT; export function smokeCutsNow(game, now = hostNow(game), view = true) { return cutsNow(game, now, view); }   // (how many; SMOKE_CUTS holds them — the screen's set unless view is false)
// How much the open tunnels leave of the smoke at a point (1: none there).
function cutFactor(x, y, z) { let f = 1; const R2 = TUNNEL.radius * TUNNEL.radius; for (let n = 0; n < CUT_N; n++) { const o = n * 7, ax = CUT[o], ay = CUT[o + 1], az = CUT[o + 2], ux = CUT[o + 3] - ax, uy = CUT[o + 4] - ay, uz = CUT[o + 5] - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * ux + (y - ay) * uy + (z - az) * uz) / Math.max(ux * ux + uy * uy + uz * uz, 1e-4))), px = ax + ux * t - x, py = ay + uy * t - y, pz = az + uz * t - z, k2 = (px * px + py * py + pz * pz) / R2;
    if (k2 < 1) f *= 1 - CUT[o + 6] * (1 - k2); } return f; }
// Smoke density at a point (0 … 1, the clouds' densities summed, capped).
export const hostNow = game => game?.combat?.clock ?? Date.now();   // the host's clock (stamped each tick; clients keep an offset)
export function smokeDensity(game, x, y, z, now = hostNow(game)) { const N = game.combat?.nades; if (!N?.length) return 0; let d = 0, cuts = -1;
  for (let m = 0; m < N.length; m++) { const s = N[m]; if (s.phase !== 'smoke') continue; const v = smokeVoxels(game, s); let q;
    if (v) { const B = v.box; if (!B || x < B[0] || y < B[1] || z < B[2] || x > B[3] || y > B[4] || z > B[5]) continue; q = voxDensity(prep(s, v, now), x, y, z); if (q > 0) { if (cuts < 0) cuts = cutsNow(game, now); if (cuts) q *= cutFactor(x, y, z); } }
    else { q = ellipsoid(s, x, y, z, now); if (q > 0) q *= 1 - holeOpen(game, s, x, y, z, now); }
    if (q > 0) { d += q; if (d >= 1) return 1; } }
  return d; }
// Units of full-density smoke between two points (3D): ∫ density along the segment — the clouds' densities add, so the
// answer is the same whatever their order or overlap — sampled every ≤ 1.5 units over the part inside each cloud's
// box (nothing outside it). `limit`: stop as soon as it is passed (smokeBlocks only asks whether it is).
export function smokeDepth(game, ax, ay, az, bx, by, bz, now = hostNow(game), limit = Infinity) {
  const N = game.combat?.nades; if (!N?.length) return 0; let depth = 0, cuts = -1; const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1;
  for (let m = 0; m < N.length; m++) { const s = N[m]; if (s.phase !== 'smoke') continue; const v = smokeVoxels(game, s);
    if (!v) { depth += ellipsoidDepth(game, s, ax, ay, az, dx, dy, dz, L, now); if (depth > limit) return depth; continue; }
    const B = v.box; if (!B) continue; let t0 = 0, t1 = 1;   // (the segment's part inside the cloud's box: slabs)
    for (let a = 0; a < 3 && t0 < t1; a++) { const o = a === 0 ? ax : a === 1 ? ay : az, d = a === 0 ? dx : a === 1 ? dy : dz; if (Math.abs(d) < 1e-9) { if (o < B[a] || o > B[a + 3]) t1 = -1; continue; } let u0 = (B[a] - o) / d, u1 = (B[a + 3] - o) / d; if (u0 > u1) { const q = u0; u0 = u1; u1 = q; } if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1; }
    if (t0 >= t1) continue; const Q = prep(s, v, now); if (Q.fade <= 0) continue; if (cuts < 0) cuts = cutsNow(game, now);
    const n = Math.max(1, Math.ceil((t1 - t0) * L / 1.5)), du = (t1 - t0) / n, ds = du * L;
    for (let i = 0; i < n; i++) { const u = t0 + (i + .5) * du, x = ax + dx * u, y = ay + dy * u, z = az + dz * u; let q = voxDensity(Q, x, y, z); if (q <= 0) continue; if (cuts) q *= cutFactor(x, y, z); depth += q * ds; if (depth > limit) return depth; } }
  return depth;
}
// (no map: the ellipsoid's reach ball, then every 1.5 units along the segment)
function ellipsoidDepth(game, s, ax, ay, az, dx, dy, dz, L, now) { const cx = s.x, cy = (s.y || 0) + NADES.smoke.radius * SMOKE.lift, cz = s.z, t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / (L * L)));
  if (Math.hypot(ax + dx * t - cx, (ay + dy * t - cy) / SMOKE.vert, az + dz * t - cz) > NADES.smoke.radius) return 0; let depth = 0;
  const n = Math.ceil(L / 1.5); for (let i = 0; i <= n; i++) { const u = i / n, x = ax + dx * u, y = ay + dy * u, z = az + dz * u, q = ellipsoid(s, x, y, z, now); if (q > 0) depth += q * (1 - holeOpen(game, s, x, y, z, now)) * L / n; } return depth; }
// Blocked: less than SMOKE.see of the light gets through (e^(−k·depth) < see, i.e. depth > SMOKE.block).
export const smokeBlocks = (game, ax, ay, az, bx, by, bz, now = hostNow(game)) => smokeDepth(game, ax, ay, az, bx, by, bz, now, SMOKE.block) > SMOKE.block;
// How much light gets through between two points (1: no smoke … 0): e^(−k · depth) — what the screen shows.
export const smokeSeen = (game, ax, ay, az, bx, by, bz, now = hostNow(game)) => Math.exp(-SMOKE.k * smokeDepth(game, ax, ay, az, bx, by, bz, now));
// Is a player (feet at x, fy, z) hidden by smoke from an eye? Only when it hides all of him — head, chest and knees, each
// by smokeBlocks (what the screen draws): a head above a cloud's edge or legs under it are seen. The remote models'
// hiding (lab.js) and the radar's spotting (gd-radar.js) ask this. (BODY: fractions of the hull's height, CS2's hull 72
// units standing, 54 crouched — the points themselves an approximation, not CS2 figures)
export const BODY = [.95, .72, .3], HULL = 72 * HU, HULL_CROUCH = 54 * HU;
// Each line starts SMOKE.near out from the eye, as the screen's march does (from inside a cloud the rules count what is drawn).
export function smokeHides(game, ex, ey, ez, x, fy, z, crouched = false, now = hostNow(game)) { const h = crouched ? HULL_CROUCH : HULL;
  for (let i = 0; i < BODY.length; i++) { const y = fy + BODY[i] * h, dx = x - ex, dy = y - ey, dz = z - ez, L = Math.hypot(dx, dy, dz), f = L > SMOKE.near ? SMOKE.near / L : 0;
    if (!smokeBlocks(game, ex + dx * f, ey + dy * f, ez + dz * f, x, y, z, now)) return false; } return true; }
// Is any smoke up? (a loop: nothing made per call)
export function smokeUp(game) { const N = game?.combat?.nades; if (N) for (let i = 0; i < N.length; i++) if (N[i].phase === 'smoke') return true; return false; }
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
// On a CS2 map the fire goes by CS2's own surfaces (boxes.nadeMesh): each cell's floor is the first surface straight down
// from a step over the floor it spread from (to a stair's drop below it), and fire passes from cell to cell only where
// nothing stands between them a little over the higher floor (a wall, a doorframe, a shut door) — never through a wall,
// never to a floor above or below (stacked floors: Nuke's, Overpass'). Elsewhere by the map's boxes; a molotov that
// lies against a wall starts from the nearest open cell round it (the old start, inside the wall's margin, burned nothing).
export const FIRE = { cell: 3, spread: 1100, up: 1.5, down: 3.2, die: 1500, hit: 200, ramp: 8, rest: 600, lift: .6 };
const fireCache = new Map(); let F_SEEN = new Uint8Array(0), F_ASK = new Float64Array(0), F_GOT = new Float64Array(0), F_Q = new Float64Array(0);
export function fireCells(boxes, x, z, y = 0) {
  const k = [x.toFixed(1), z.toFixed(1), y.toFixed(1), boxes.length].join(); if (fireCache.has(k)) return fireCache.get(k);
  const S = FIRE.cell, R = NADES.molotov.radius, Rn = Math.ceil(R / S), M = boxes.nadeMesh;
  // The floor under (px, pz) near height ref: the highest top a step up or a stair down from it (the map's ground: 0).
  const floorNear = M ? (px, pz, ref) => { const a = ref + FIRE.up, w = meshFirst(M, px, a, pz, px, ref - FIRE.down, pz); let top = w <= 1 ? a - (FIRE.up + FIRE.down) * w : -Infinity;
      for (const b of doors) if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ && b.y1 <= ref + FIRE.up && b.y1 >= ref - FIRE.down && b.y1 > top) top = b.y1; return top; }
    : (px, pz, ref) => { let top = -Infinity; for (const b of boxesNear(boxes, px, pz, px, pz, FA)) if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ && b.y1 <= ref + FIRE.up && b.y1 >= ref - FIRE.down && b.y1 > top) top = b.y1;
      if (top === -Infinity && 0 <= ref + FIRE.up && 0 >= ref - FIRE.down) top = 0; return top; };
  const blocked = M ? () => false : (px, pz, fy) => boxesNear(boxes, px - .5, pz - .5, px + .5, pz + .5, FB).some(b => !b.off && px > b.minX - .5 && px < b.maxX + .5 && pz > b.minZ - .5 && pz < b.maxZ + .5 && b.y0 < fy + 2 && b.y1 > fy + FIRE.up);   // a wall or crate standing on this floor
  const doors = M ? (boxes.movers || NONE).filter(b => !b.off && b.mat !== 'glass' && b.maxX > x - R - S && b.minX < x + R + S && b.maxZ > z - R - S && b.minZ < z + R + S) : NONE;   // (the shut doors and whole crates within its reach: once)
  const linked = M ? (ax, az, ay, bx, bz, by) => { const h = Math.max(ay, by) + FIRE.lift; return meshFirst(M, ax, h, az, bx, h, bz) > 1 && moverFirst(doors, ax, h, az, bx, h, bz, false) > 1 && (ay >= by || meshFirst(M, ax, ay + FIRE.lift, az, ax, h, az) > 1); } : () => true;   // (nothing between two cells a little over the higher floor; a step up: nothing over the lower one either)
  // Where it starts: the cell it lies in, else the nearest open one round it (within two cells) on the same floor.
  let si = 0, sj = 0, sy = floorNear(x, z, y + .5); if (!Number.isFinite(sy)) sy = y;
  if (blocked(x, z, sy)) { let best = Infinity; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const d = i * i + j * j; if (!d || d >= best) continue; const f = floorNear(x + i * S, z + j * S, sy + .5); if (Number.isFinite(f) && !blocked(x + i * S, z + j * S, f)) { best = d; si = i; sj = j; sy = f; } } }
  // The flood (nearest first): the grid's cells by index into reused typed arrays — seen, the floor last asked for
  // (from which height, and what it was: a cell a wall kept out is asked again from its other sides) and the queue —
  // no string keys, no Map, no array per step (a new fire's work is mostly its rays then; the result is the same).
  const Wd = 2 * Rn + 1, n2 = Wd * Wd; if (F_SEEN.length < n2) { F_SEEN = new Uint8Array(n2); F_ASK = new Float64Array(n2); F_GOT = new Float64Array(n2); F_Q = new Float64Array(n2 * 4); }
  F_SEEN.fill(0, 0, n2); F_ASK.fill(NaN, 0, n2); const out = []; let qn = 1, far = 1; F_Q[0] = si; F_Q[1] = sj; F_Q[2] = sy; F_Q[3] = 0; F_SEEN[(si + Rn) * Wd + sj + Rn] = 1;
  for (let h = 0; h < qn; h++) { const i = F_Q[h * 4], j = F_Q[h * 4 + 1], fy = F_Q[h * 4 + 2], steps = F_Q[h * 4 + 3], px = x + i * S, pz = z + j * S; if (blocked(px, pz, fy)) continue; out.push([+px.toFixed(2), +pz.toFixed(2), +fy.toFixed(2), steps]); if (steps > far) far = steps;
    for (let d = 0; d < 4; d++) { const ii = d === 0 ? i + 1 : d === 1 ? i - 1 : i, jj = d === 2 ? j + 1 : d === 3 ? j - 1 : j; if (Math.abs(ii) > Rn || Math.abs(jj) > Rn || Math.hypot(ii, jj) * S > R) continue; const kk = (ii + Rn) * Wd + jj + Rn; if (F_SEEN[kk]) continue;
      let ny; if (F_ASK[kk] === fy) ny = F_GOT[kk]; else { ny = floorNear(x + ii * S, z + jj * S, fy); F_ASK[kk] = fy; F_GOT[kk] = ny; }
      if (!Number.isFinite(ny) || !linked(px, pz, fy, x + ii * S, z + jj * S, ny)) continue; F_SEEN[kk] = 1; const o = qn * 4; F_Q[o] = ii; F_Q[o + 1] = jj; F_Q[o + 2] = ny; F_Q[o + 3] = steps + 1; qn++; } }
  for (const c of out) c[3] = +(c[3] / far).toFixed(3);
  if (fireCache.size > 64) fireCache.clear(); fireCache.set(k, out); return out;
}
// A map's first fire, ahead of time (at map load, beside warmSmoke: one flood at a spawn) — so the match's first
// molotov does not pay the cold cost on the frame it lands (measured on the user's CS2 maps, a loaded machine: the
// first flood ~40–100 ms, the next ones 2–12 ms).
export function warmFire(boxes, x, z, y = 0) { if (boxes && Number.isFinite(x + z + y)) fireCells(boxes, x, z, y); }
// Is a cell of fire `g` burning at `now` (host clock)? Lit once the spread reaches it, out at its own moment near the end.
export const cellEnd = c => NADES.molotov.lasts - FIRE.die * (((Math.sin(c[0] * 12.9898 + c[1] * 78.233) * 43758.5453) % 1 + 1) % 1);   // when a cell's flame dies (ms after the fire started)
export const cellLit = (g, c, now) => { const t = now - (g.firedAt || now); return t >= c[3] * FIRE.spread && t < cellEnd(c); };
// Someone at (x, z), feet at y, standing in the flames? (Without g: any cell, as it stands.)
export const inFire = (cells, x, z, y = null, g = null, now = 0) => cells.some(c => Math.abs(c[0] - x) < 2.2 && Math.abs(c[1] - z) < 2.2 && (y === null || Math.abs((c[2] ?? 0) - y) < 3) && (!g || cellLit(g, c, now)));
// One host tick: move, bounce, set off, burn, clean up. Returns true when anything changed.
export function nadesTick(game, players, dt, now, { boxes = [], bounds = null } = {}, onBlast = null, onGlass = null) {   // onBlast(x, y, z, radius, dmg): an HE went off there (arena-logic.js: doors and breakables take it)
  const C = game.combat; if (C) C.clock = now; if (C && players?.length) cutShots(game, players, now);   // (the players' new shots through a smoke cut its tunnels on the host — counted every tick, smoke or not)
  if (!C?.nades?.length) return false; let changed = false; const bodies = C.nades.some(g => g.phase === 'air') ? people(game, players) : null;   // (the living, for grenades in flight to bounce off)
  for (const g of C.nades) {
    const N = NADES[g.kind], age = now - g.at; if (!N) { g.phase = 'gone'; continue; }
    if (g.phase === 'air') {
      const hitFloor = stepNade(g, boxes, bounds, dt, bodies); changed = true; traceStep(g);
      if (g.glass?.length) { for (const id of g.glass) onGlass?.(id); g.glass = null; }   // (panes it broke on the way: broken for everyone)
      // Out of the world (a lob over an outer wall falls past CS2's lowest surface: a deliberate removal, logged — or,
      // with a surface over it, a fall through a gap in the map file: voidWhy), or gone wrong (numbers not finite; in
      // the air past any fuse): removed at once.
      if (g.void || g.bad || age > AIR_MAX) { logNade(game, g, g.void ? voidWhy(boxes, g) : g.bad ? 'not finite' : 'too long in the air', now); g.phase = 'gone'; continue; }
      if (!goesOff(g, hitFloor, age)) continue;
      g.phase = { he: 'boom', flash: 'pop', smoke: 'smoke', decoy: 'decoy', molotov: 'fire', incendiary: 'fire' }[g.kind]; g.firedAt = now; g.vx = g.vy = g.vz = 0;
      if (isFire(g.kind) || g.kind === 'smoke') { const fy = groundUnder(boxes, g.x, g.z, g.y);   // (the surface it lies on: CS2's triangles on a CS2 map — beside a wall, on a roof or a stair as they are)
        if (fy === null && !isFire(g.kind)) { logNade(game, g, 'out of the world', now); g.phase = 'gone'; continue; }   // (no surface under it at all: out of the world)
        if (isFire(g.kind) && (fy === null || (!(hitFloor && lastNy >= FIRE_SLOPE_NY) && g.y - fy > N.airburst))) { g.phase = 'out'; g.airburst = true; }   // timed out high in the air (or over nothing at all): it bursts there, no fire (CS2)
        else g.y = fy; }
      if (g.phase === 'smoke') smokeVoxels(game, g);   // its cells now, once, where it lies (every sightline after reads them)
      if (isFire(g.kind) && g.phase === 'fire' && smokedAt(game, g.x, g.y, g.z, now)) putOut(g, now);   // into smoke: it fizzles
      if (g.kind === 'smoke') for (const f of C.nades) if (f.phase === 'fire' && fireCells(boxes, f.x, f.z, f.y).some(c => cellLit(f, c, now) && Math.hypot(c[0] - g.x, c[1] - g.z) < NADES.smoke.radius * .35 && Math.abs(c[2] - g.y) < 6)) putOut(f, now);   // popping in the flames: out at once (then its volume reaches the rest)
      if (g.kind === 'he') for (const s of C.nades) { const h = s.phase === 'smoke' && blastHole(game, s, g.x, g.y, g.z, now); if (h) s.holes = [...(s.holes || []), h].slice(-3); }   // a blast clears the smoke round it for a moment
      if (g.kind === 'he') onBlast?.(g.x, g.y, g.z, N.radius, N.dmg);
      if (g.kind === 'he') for (const t of people(game, players)) { const base = heDamage(boxes, g.x, g.y + HU, g.z, t); if (base > 0) applyHit(game, g.by, t.name, { id: 'he', name: N.name, ap: N.ap }, 'chest', Math.hypot(t.x - g.x, t.z - g.z), 1, now, base); }   // (kevlar: applyHit takes `ap` of it through, as a gun's)
      // Flashbang: everyone's own white-out is worked out where they look (arena-nades-view.js); bots here, as the same
      // model at their real eye (their feet + EYE, where they face; everyone's: a crouched player's eye is lower) — blind (can't shoot) for the hold and half the fade,
      // CS:GO's m_blindUntilTime; never shortened by a weaker flash. Statistics: enemies blinded 1.96 s or more.
      if (g.kind === 'flash') { const tm = game.combat.d?.teams || {}, mine = tm[key(g.by)], rec = recording(game) && mine;
        for (const t of people(game, players)) { const dir = Math.cos(t.pitch), B = flashBlind(boxes, g.x, g.y, g.z, t.x, t.y + t.e, t.z, -Math.sin(t.yaw) * dir, Math.sin(t.pitch), -Math.cos(t.yaw) * dir, game, FBO), ms = B.hold + B.fade; if (B.s <= 0) continue;
          if (t.bot) t.bot.blindUntil = Math.max(t.bot.blindUntil || 0, now + B.hold + B.fade * .5);
          if (rec && tm[key(t.name)] && tm[key(t.name)] !== mine && ms >= 1960) { const st = statOf(game, g.by); st.flashed++; st.blindMs += Math.round(ms); } } }
    } else if (g.phase === 'fire') {
      // Burning (CS2): a hit every FIRE.hit ms to everyone standing in lit flames, 1 damage the first hit, one more each
      // hit up to FIRE.ramp (then 40 a second — weapons.vdata m_nDamage 40 for the molotov and the incendiary; the
      // ramp from 1 and the 200 ms beat are ours, an approximation of CS2's build-up); out of the flames a moment and
      // it starts again at 1. Armor doesn't help (CS:GO's burn damage skips kevlar; CS2 assumed the same).
      // Two fires overlapping both burn. A smoke reaching the flames puts the whole fire out. The hits keep their own
      // 200 ms beat on the host's clock whatever its tick (the next one is due a beat after the last was due, not after
      // the tick that happened to run it: at 40–60 ms ticks the old way burned ~35 a second); after a stall it starts
      // again from now.
      if (now - (g.burnAt || 0) >= FIRE.hit) { g.burnAt = g.burnAt && now - g.burnAt < 2 * FIRE.hit ? g.burnAt + FIRE.hit : now; const cells = fireCells(boxes, g.x, g.z, g.y), heat = g.heat ??= {};
        if (C.nades.some(s => s.phase === 'smoke')) { for (let i = 0; i < cells.length; i += 4) if (cellLit(g, cells[i], now) && smokedAt(game, cells[i][0], cells[i][2], cells[i][1], now)) { putOut(g, now); changed = true; break; } if (g.phase !== 'fire') continue; }
        for (const t of people(game, players)) { const k = key(t.name); if (!inFire(cells, t.x, t.z, t.y, g, now)) continue;
          const h = heat[k], n = h && now - h.at < FIRE.rest ? Math.min(FIRE.ramp, h.n + 1) : 1; heat[k] = { n, at: now }; const r = hurt(game, g.by, t.name, { id: g.kind, name: N.name }, n, 'legs', now); changed = true;
          if (r?.dmg > 0) { const b = (C.burns ??= {})[k] ??= { d: 0, f: 1, at: 0 }; b.d = (b.d + r.dmg) % 1e9; b.f = FIRE_FLINCH[g.kind] ?? 1; b.at = now; } } }   // (each body's running burn total, sent with its HP: a client tags a drop by it — burnTag)
    } else if (g.phase === 'decoy' && now - g.firedAt >= DECOY.lasts) {
      // The decoy's end: a small pop (ours: up to DECOY.dmg HP within DECOY.radius, through the air only).
      g.phase = 'fizz'; g.firedAt = now; changed = true;
      for (const t of people(game, players)) { const cy = t.y + 5 * t.h / BODY_H, d = Math.hypot(t.x - g.x, t.z - g.z, cy - g.y); if (d > DECOY.radius || !blastClear(boxes, g.x, g.y + HU, g.z, t.x, cy, t.z)) continue; /* (the chest, lower when crouched: as the HE's) */ const dmg = Math.round(DECOY.dmg * (1 - d / DECOY.radius)); if (dmg > 0) hurt(game, g.by, t.name, { id: 'decoy', name: N.name }, dmg, 'chest', now); }
    }
  }
  const n = C.nades.length;
  C.nades = C.nades.filter(g => g.phase === 'air' || now - g.firedAt < ({ boom: 1200, pop: 1200, smoke: NADES.smoke.lasts, fire: NADES.molotov.lasts, out: 900, decoy: DECOY.lasts + 1000, fizz: DECOY.pop }[g.phase] || 0));
  if (C.nades.length !== n) for (const id of TRACE.keys()) if (!C.nades.some(g => g.id === id)) TRACE.delete(id);
  return changed || C.nades.length !== n;
}
const AIR_MAX = 20000;   // ms: no grenade is in the air longer (HE / flash 1.5 s, fire 2 s, smoke / decoy 12 s at most) — past it, a bug
// The surface under a grenade at (x, y, z): on a CS2 map the first of CS2's triangles straight down from its middle (a
// stair, a ledge, a roof, the floor beside a wall — as they are, not the players' 16-unit columns, which put most of
// them at the map's bottom), or a shut door's / whole crate's top under it; null when there is nothing under it at all
// (out of the world). Elsewhere: the highest box top under it (the ground: 0).
function groundUnder(boxes, x, z, y) {
  const M = boxes.nadeMesh;
  if (M) { const lo = (M.minY ?? 0) - VOID_DEPTH, w = meshFirst(M, x, y, z, x, lo, z); let top = w <= 1 ? y + (lo - y) * w : -Infinity;
    for (const b of boxes.movers || NONE) if (!b.off && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.y1 <= y + R && b.y1 > top) top = b.y1;
    return top === -Infinity ? null : top; }
  let g = 0; for (const b of boxesNear(boxes, x, z, x, z, GU)) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.y1 <= y + 1 && b.y1 > g) g = b.y1; return g; }
// What blocks a blast, light or a body check between a and b: on a CS2 map its triangles that stop sight (not grenade
// clips, fences, grates or glass) and the doors and breakables while shut / whole (by their boxes; `glass`: whether a
// pane counts — light passes it, an HE's blast does not); elsewhere the map's boxes. Fractions along a→b (1: clear).
function moverFirst(movers, ax, ay, az, bx, by, bz, glass = true, pad = 0) { let best = Infinity; const dx = bx - ax, dy = by - ay, dz = bz - az;   // (pad: each box grown by that — a ball's radius: where it first touches)
  for (const b of movers || NONE) { if (b.off || (!glass && b.mat === 'glass')) continue; const t = slabT(b.minX - pad, b.y0 - pad, b.minZ - pad, b.maxX + pad, b.y1 + pad, b.maxZ + pad, ax, ay, az, dx, dy, dz); if (t < best) best = t; } return best; }
const SB = [];
function boxFirst(boxes, ax, ay, az, bx, by, bz) { let best = Infinity; const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const b of boxesAlong(boxes.bullets || boxes, ax, az, bx, bz, 0, SB)) { if (b.off) continue; const t = slabT(b.minX, b.y0, b.minZ, b.maxX, b.y1, b.maxZ, ax, ay, az, dx, dy, dz); if (t < best) best = t; } return best; }
// Where the segment p + t·d (t 0…1) enters the box (0 when it starts inside; Infinity: misses it).
function slabT(x0, y0, z0, x1, y1, z1, px, py, pz, dx, dy, dz) { let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-12) { if (px <= x0 || px >= x1) return Infinity; } else { let u = (x0 - px) / dx, v = (x1 - px) / dx; if (u > v) { const s = u; u = v; v = s; } if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 >= t1) return Infinity; }
  if (Math.abs(dy) < 1e-12) { if (py <= y0 || py >= y1) return Infinity; } else { let u = (y0 - py) / dy, v = (y1 - py) / dy; if (u > v) { const s = u; u = v; v = s; } if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 >= t1) return Infinity; }
  if (Math.abs(dz) < 1e-12) { if (pz <= z0 || pz >= z1) return Infinity; } else { let u = (z0 - pz) / dz, v = (z1 - pz) / dz; if (u > v) { const s = u; u = v; v = s; } if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 >= t1) return Infinity; }
  return t0 < 1 && t1 > 0 ? t0 : Infinity; }
// Clear between a and b for a blast (HE, the decoy's pop)? Real geometry only: never a player-collision column, never
// through a floor; a pane that survived the blast blocks it too.
function blastClear(boxes, ax, ay, az, bx, by, bz) { const M = boxes.nadeMesh; return M ? meshFirst(M, ax, ay, az, bx, by, bz, true) > 1 && moverFirst(boxes.movers, ax, ay, az, bx, by, bz, true) > 1 : segmentClear(boxes, ax, ay, az, bx, by, bz); }
// An HE's damage to a body `t` (feet t.y, facing t.yaw), before armor — CS:GO's RadiusDamage, kept by CS2 as far as we
// know: dmg × a Gaussian of the distance from the blast to the body's middle (σ = range / 3: ~1 % at the range, 67 % at
// 0.3 of it) × how much of the body the blast sees (CS:GO's GetAmountOfEntityVisible: chest 40 %, head 20 %, feet 20 %,
// each side 10 % — a side 16 units off the middle), through real geometry only (blastClear: no leaking through a floor).
function heDamage(boxes, x, y, z, t) {
  const H = t.h ?? BODY_H, N = NADES.he, cy = t.y + 5 * H / BODY_H, d = Math.hypot(t.x - x, cy - y, t.z - z); if (d > N.radius) return 0; const s = N.radius / 3, rx = Math.cos(t.yaw || 0) * 16 * HU, rz = -Math.sin(t.yaw || 0) * 16 * HU;   // (H: the body's hull — chest and head lower when it crouches; the chest at 5 units of a standing 72 HU hull, the head 1 HU under its top: ours)
  const seen = (blastClear(boxes, x, y, z, t.x, cy, t.z) ? .4 : 0) + (blastClear(boxes, x, y, z, t.x, t.y + H - HU, t.z) ? .2 : 0) + (blastClear(boxes, x, y, z, t.x, t.y + .15, t.z) ? .2 : 0) + (blastClear(boxes, x, y, z, t.x + rx, cy, t.z + rz) ? .1 : 0) + (blastClear(boxes, x, y, z, t.x - rx, cy, t.z - rz) ? .1 : 0);
  return seen > 0 ? Math.round(N.dmg * Math.exp(-d * d / (2 * s * s)) * seen) : 0; }
// How blinded a viewer is by a flash at (fx, fy, fz): 0…1 (1 = fully white), from distance, how much of the flash
// reaches their eye and how directly they look at it. dirX/Y/Z: where the viewer looks.
// How much reaches the eye is CS's PercentageOfFlashForPlayer: seen straight (no wall — CS2's own surfaces that stop
// sight on a CS2 map, so its light passes grenade clips, fences and glass; a shut door or a whole crate by its box; no
// dense smoke in between; never a player's movement box): all of it. Otherwise the light off three points — 50 units
// up from the flash (up as the eye sees it) and 75 units to either side 10 up — a sixth each that gets back to the eye
// from where its own way out stopped (a flash popped against a ceiling or a wall still lights round the corner). Bots
// alike: CS's straight-or-nothing is for entities that are no player (hostages); its bots are players. Then by where the eye looks, as CS's RadiusFlash: within about 53° of it all, to 73°
// 70 %, to 101° 40 %, behind 20 % (flashAmount: the overall measure; flashBlind splits it into how long and how white).
const FLASH_UP = 50 * HU, FLASH_SIDE = 75 * HU, FLASH_SIDE_UP = 10 * HU, LIGHT_BACK = .05;
// How far along a→b the flash's light gets (0…1; 1: all the way).
function lightTo(boxes, game, ax, ay, az, bx, by, bz) {
  const M = boxes.nadeMesh; let w = M ? Math.min(meshFirst(M, ax, ay, az, bx, by, bz, true), moverFirst(boxes.movers, ax, ay, az, bx, by, bz, false)) : boxFirst(boxes, ax, ay, az, bx, by, bz);
  w = Math.min(1, w); if (game && w > 0 && smokeBlocks(game, ax, ay, az, ax + (bx - ax) * w, ay + (by - ay) * w, az + (bz - az) * w)) return 0; return w; }
function flashReach(boxes, game, fx, fy, fz, x, y, z) {
  if (lightTo(boxes, game, fx, fy, fz, x, y, z) >= 1) return 1;
  let ex = x - fx, ey = y - fy, ez = z - fz; const l = Math.hypot(ex, ey, ez) || 1; ex /= l; ey /= l; ez /= l;
  let rx = -ez, rz = ex; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; const ux = -ey * rz, uy = rz * ex - rx * ez, uz = ey * rx;   // (right: level, across the view; up: right × the way to the eye — upward; it pointed down before)
  let got = 0;
  for (let k = 0; k < 3; k++) { const px = k === 0 ? fx + ux * FLASH_UP : fx + (k === 1 ? rx : -rx) * FLASH_SIDE, py = k === 0 ? fy + uy * FLASH_UP : fy + FLASH_SIDE_UP, pz = k === 0 ? fz + uz * FLASH_UP : fz + (k === 1 ? rz : -rz) * FLASH_SIDE;
    const L = Math.hypot(px - fx, py - fy, pz - fz) || 1, w = Math.max(0, lightTo(boxes, game, fx, fy, fz, px, py, pz) - LIGHT_BACK / L);   // (where it stopped, a little back on the flash's side: Source's trace end)
    if (w > 0 && lightTo(boxes, game, fx + (px - fx) * w, fy + (py - fy) * w, fz + (pz - fz) * w, x, y, z) >= 1) got += 1 / 6; }
  return got;
}
const flashFall = d => Math.min(1, (1 - Math.pow(d / NADES.flash.radius, 1.4)) * (d < 25 ? 1.15 : 1));   // (ours: full close by, fading out to the flash's 2000 units)
const lookTier = facing => facing >= .6 ? 0 : facing >= .3 ? 1 : facing >= -.2 ? 2 : 3;
export function flashAmount(boxes, fx, fy, fz, x, y, z, dirX, dirY, dirZ, game = null) {
  const dx = fx - x, dy = fy - y, dz = fz - z, d = Math.hypot(dx, dy, dz); if (d > NADES.flash.radius) return 0;
  const reach = flashReach(boxes, game, fx, Math.max(.6, fy), fz, x, y, z); if (reach <= 0) return 0;
  return Math.max(0, Math.min(1, reach * FLASH.tiers[lookTier((dx * dirX + dy * dirY + dz * dirZ) / (d || 1))][2] * flashFall(d)));
}
// A viewer's white-out from one flash (CS:GO's RadiusFlash → CCSPlayer::Blind; CS2 assumed alike): s = how much of the
// flash reaches the eye × its fall-off with distance; where the eye looks picks a tier (FLASH.tiers: [facing at
// least, hold ×, fade ×, whiteness]) — CS:GO's hold 1.25 / .8 / .5 / .25 and fade 2.5 / 1.75 / 1 / .5 of one figure
// (here relative to the first tier) and full white in the first three, 200/255 from behind: a far or side-on flash is
// as white, only shorter. A full flash: FLASH.hold ms solid then FLASH.fade ms fading (2.2 s + 1.8 s, as this game had
// it — ours, not CS2 figures). Into `out` (reused): { s, peak, hold, fade } (ms).
export const FLASH = { hold: 2200, fade: 1800, tiers: [[.6, 1, 1, 1], [.3, .64, .7, 1], [-.2, .4, .4, 1], [-Infinity, .2, .2, 200 / 255]] };
const FBO = { s: 0, peak: 0, hold: 0, fade: 0 };
export function flashBlind(boxes, fx, fy, fz, x, y, z, dirX, dirY, dirZ, game = null, out = { s: 0, peak: 0, hold: 0, fade: 0 }) {
  out.s = out.peak = out.hold = out.fade = 0; const dx = fx - x, dy = fy - y, dz = fz - z, d = Math.hypot(dx, dy, dz); if (d > NADES.flash.radius) return out;
  const s = flashReach(boxes, game, fx, Math.max(.6, fy), fz, x, y, z) * Math.max(0, flashFall(d)); if (s <= 0) return out;
  const T = FLASH.tiers[lookTier((dx * dirX + dy * dirY + dz * dirZ) / (d || 1))]; out.s = s; out.peak = T[3]; out.hold = FLASH.hold * s * T[1]; out.fade = FLASH.fade * s * T[2]; return out; }
// Two flashes on one viewer (CS:GO's Blind: the whiteness only rises, the blindness only lengthens): `st` = { peak,
// holdUntil, fadeEnd } (a client's own, reused) and a new white-out `b` at `now` — after it the white is never less, at
// any moment, than either flash alone would give. Returns st.
export function stackFlash(st, b, now) { if (!(b.hold + b.fade > 0)) return st; const cur = flashWhite(st, now);
  st.peak = Math.max(cur, b.peak); st.holdUntil = Math.max(st.holdUntil > now ? st.holdUntil : now, now + b.hold); st.fadeEnd = Math.max(st.fadeEnd || 0, now + b.hold + b.fade, st.holdUntil); return st; }
// How white a viewer's screen is at `now` (0…1) from their stacked flashes.
export const flashWhite = (st, now) => !st.peak || now >= (st.fadeEnd || 0) ? 0 : now < st.holdUntil ? st.peak : st.peak * Math.max(0, Math.min(1, (st.fadeEnd - now) / Math.max(1, st.fadeEnd - st.holdUntil)));
// ── Decoy: its shots (ms after it went off), the same on the host and every client (from its seed and gun), cached ──
const DECOY_SHOTS = new Map(), DECOY_W = new WeakMap();   // (DECOY_W: this state object → its shots, no key string per look-up — the radar and the view ask every frame)
export function decoyShots(g) {
  let s = DECOY_W.get(g); if (s && s.gun === g.gun && s.seed === g.seed) return s.t;
  const k = g.id + ':' + g.seed + ':' + g.gun; s = DECOY_SHOTS.get(k); if (s) { DECOY_W.set(g, { t: s, gun: g.gun, seed: g.seed }); return s; }
  const w = weaponById(g.gun), auto = w?.mode === 'auto', rate = Math.max(50, w?.rateMs || 150), list = []; let r = Math.abs(Math.floor(+g.seed || 1)) % 2147483646 + 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let t = DECOY.start; t < DECOY.lasts - 200;) { const n = auto ? 3 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 3), gap = auto ? rate : Math.max(rate, 180 + rnd() * 220);
    for (let i = 0; i < n && t < DECOY.lasts - 200; i++, t += gap) list.push(Math.round(t)); t += 600 + rnd() * 1800; }
  s = Float64Array.from(list); if (DECOY_SHOTS.size > 32) DECOY_SHOTS.delete(DECOY_SHOTS.keys().next().value); DECOY_SHOTS.set(k, s); DECOY_W.set(g, { t: s, gun: g.gun, seed: g.seed }); return s; }
// The index of a decoy's last shot at or before `now` (-1: none yet).
export function decoyShotAt(g, now) { if (g?.phase !== 'decoy') return -1; const s = decoyShots(g), t = now - g.firedAt; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= t) lo = m + 1; else hi = m; } return lo - 1; }
// On the enemies' radar now? (the rule above: within DECOY.blip ms of a shot; the radar shows it to players not on g.team)
export function decoyBlip(g, now) { const i = decoyShotAt(g, now); return i >= 0 && now - g.firedAt - decoyShots(g)[i] < DECOY.blip; }
// ── Tagging by fire (lab.js onHurt) ──
// CS2's burn carries its grenade's flinch (weapons.vdata m_flFlinchVelocityModifierSmall / Large: molotov 1 / 1 — no
// slowdown at all — incendiary 0.8 / 0.7). A burn hit is small (1–8 HP), so the Small one (which of the two CS2 uses for
// a burn tick is our assumption). For someone at (x, z), feet y: standing in lit flames → the lowest flinch of the fires
// they stand in (1: none), else null (not fire: an ordinary hit's tagging).
export const FIRE_FLINCH = { molotov: 1, incendiary: .8 };
// How a client tags a drop of `drop` HP it just saw (lab.js onHurt) — by the damage's source, not its size: the host
// keeps each body's running burn total with its HP (combat.burns[k] = { d, f: the flinch of the fire that burned last,
// at }); `seen` ({ d: 0 } at first, the caller's, kept) is the total at the last look. All of the drop is burn (and the
// burn is fresh): the fire's flinch (1: no slowdown). A gun, an HE, a fall in it — or a drop the burns don't cover:
// null, an ordinary hit's tagging. Two fires' hits bunched into one drop (a laggy frame) are still a burn.
export function burnTag(game, name, drop, seen, now) { const b = game?.combat?.burns?.[key(name)], d = b ? b.d : 0, burnt = d - (seen.d ?? 0); seen.d = d;
  return b && burnt > 0 && drop <= burnt && now - b.at < 1000 ? b.f : null; }
export function fireFlinch(game, boxes, x, y, z, now) { let f = null;
  for (const g of game?.combat?.nades || NONE) { if (g.phase !== 'fire' || !isFire(g.kind) || Math.hypot(g.x - x, g.z - z) > NADES.molotov.radius + 3) continue;
    if (inFire(fireCells(boxes || NONE, g.x, g.z, g.y), x, z, y, g, now)) f = Math.min(f ?? 1, FIRE_FLINCH[g.kind] ?? 1); }
  return f; }
// ── A paused match (arena-logic.js): the grenades stand still ──
// Every time a grenade keeps moves on with the pause, a tick at a time (no flight step meanwhile), so fuses, smokes,
// fires, HE holes and decoys pick up where they were — the host and every client read these times.
export function holdNades(game, now) { const C = game?.combat; if (!C) return false; const dt = Number.isFinite(C.clock) ? Math.max(0, now - C.clock) : 0; C.clock = now; if (!dt || !C.nades?.length) return false;
  for (const g of C.nades) { if (Number.isFinite(g.at)) g.at += dt; if (g.firedAt) g.firedAt += dt; if (g.burnAt) g.burnAt += dt; if (g.outAt) g.outAt += dt; for (const h of g.holes || NONE) h.at += dt; if (g.heat) for (const k in g.heat) g.heat[k].at += dt; }
  return true; }
// ── Development log (host) ──
// A grenade that left the world (a legitimate end: a lob over an outer wall — the map file has no sky clips), went off
// over nothing, went non-finite or stayed in the air too long: its map, kind, where it was thrown from and how fast,
// its last contact (where, the surface's way out, what it was) and where it ended. Newest last, at most 40; all but
// "out of the world" are bugs and are printed too (console.warn).
export const NADE_LOG = []; const TRACE = new Map(), r2 = v => Math.round(v * 100) / 100, WHAT = ['', 'CS2 surface', 'door / breakable', 'map edge', 'body', 'box', 'crossing caught by the sweep'];
function traceStart(game, g) { TRACE.set(g.id, { map: game?.arena?.map || '', launch: [r2(g.x), r2(g.y), r2(g.z)], v: [r2(g.vx), r2(g.vy), r2(g.vz)], last: new Float64Array(7), hit: false, top: g.y }); if (TRACE.size > 64) TRACE.delete(TRACE.keys().next().value); }
function traceStep(g) { const T = TRACE.get(g.id); if (!T) return; if (g.y > T.top) T.top = g.y; if (lcSet) { T.last.set(LC); T.hit = true; } }   // (top: the flight's highest point, host ticks)
// Why a grenade fell out of the world: nothing over where it left (a lob over the map's outer edge — CS2's sky clips,
// which the map file lacks, would have bounced it back: a legitimate removal), or one of CS2's surfaces over it there
// (it got under the map through a face the map file is missing — a facade's open back, a wall's hollow: a gap in the
// map's data, not a crossing; logged as a bug of the map file).
export const GAP_WHY = 'fell under the map (a gap in its surfaces)';
function voidWhy(boxes, g) { const M = boxes.nadeMesh, T = TRACE.get(g.id); if (!M) return 'out of the world'; const top = T ? Math.max(T.top, g.y) + 2 : g.y + 100;   // (no trace — not thrown here: 100 units up)
  return meshFirst(M, g.x, g.y, g.z, g.x, top, g.z) <= 1 ? GAP_WHY : 'out of the world'; }
function logNade(game, g, why, now) { const T = TRACE.get(g.id), L = T?.hit ? T.last : null;
  const e = { at: now, why, map: T?.map ?? (game?.arena?.map || ''), kind: g.kind, id: g.id, launch: T?.launch || null, v: T?.v || null, last: L ? { at: [r2(L[0]), r2(L[1]), r2(L[2])], n: [r2(L[3]), r2(L[4]), r2(L[5])], what: WHAT[L[6]] || '' } : null, end: [r2(g.x), r2(g.y), r2(g.z)] };
  NADE_LOG.push(e); if (NADE_LOG.length > 40) NADE_LOG.shift(); if (why !== 'out of the world') try { console.warn('[grenade] ' + why + ' ' + JSON.stringify(e)); } catch {} }
