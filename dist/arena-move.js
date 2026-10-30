// CS2-style movement for the shooting arena (Global Defensive): Source's rules (ground friction, acceleration, air
// strafing with the 30-unit air cap, gravity, jump impulse, jump/landing stamina, ducking), CS2's speed with each weapon
// in hand, and CS2's player collision (hulls 32 HU wide, 72 tall, 54 crouched, that can be stood on: boosting). Values
// are CS2's (cvar defaults, weapons.vdata) converted from Hammer units (HU, 1 HU ≈ 2.54 cm) to game units (1 unit ≈
// 16.5 cm); the few that are not are marked as approximations. Deterministic: fixed ticks of 1/128 s (moveFor,
// moveTicks), so the same keys make the same path at any frame rate. Pure: the game and the tests drive it with plain objects.
import { boxesNear } from './box-grid.js';
import { weaponById } from './weapons-data.js';
export const HU = 2.54 / 16.5;
// CS2's cvar defaults: sv_friction 5.2, sv_stopspeed 80, sv_accelerate 5.5, sv_airaccelerate 12, sv_air_max_wishspeed 30,
// sv_gravity 800, sv_jump_impulse 301.993377; step 18, hull 72 (crouched 54); walking .52 and crouching .34 of the max
// speed. radius: the body's half-width against the MAP — 1.3 units (8.5 HU), as the maps' 16-HU collision columns are
// coarser than CS2's brushes (doorways stay passable); a map that sets boxes.bodyRadius (game units) wins. hull: CS2's
// player half-width (32 HU across) against other players and bots. lift: a duck in the air tucks the feet up 9 HU
// (approximation: half of the 18 HU the hull loses — a crouch-jump then clears ~66 HU against a plain jump's ~57, the
// community-measured CS numbers; not checked against CS2's code). bhop: CS:GO's no-bunny-hop cap (1.1 × max speed).
export const MOVE = { friction: 5.2, stopspeed: 80 * HU, accelerate: 5.5, airaccelerate: 12, aircap: 30 * HU, gravity: 800 * HU, jump: 301.993 * HU, walk: .52, duck: .34, step: 18 * HU, height: 72 * HU, duckHeight: 54 * HU, radius: 1.3, bhop: 1.1, hull: 16 * HU, lift: 9 * HU };
// Eye heights in Global Defensive (game units): standing 9.7 (63 HU: the hit model and the host's shot origin are built on
// it; CS2's view offset is 64.06) and crouched CS2's 46 HU (view offset 46.04), in between with the duck. The hall and
// the office keep their own (lab.js).
export const EYE_GD = { stand: 9.7, duck: 46 * HU };
export const eyeAt = duck => EYE_GD.stand + (EYE_GD.duck - EYE_GD.stand) * duck;
// Max running speed (HU/s) with each weapon drawn: CS2's m_flMaxSpeed (weapons.vdata), kept per weapon in weapons-data.js
// (knife 250, Glock 240, AK 215, Negev 150, grenades 245, bomb 250…); scoped, its second value (AUG and SG 553 150, AWP 100,
// SSG 08 230). MAX_SPEED: the older class ids, for any id weapons-data doesn't know.
export const MAX_SPEED = { knife: 250, karambit: 250, pistol: 240, deagle: 230, cannon: 240, smg: 235, shotgun: 220, ak: 215, m4: 225, sniper: 200, lmg: 195 };
const SCOPED = { aug: 150, sg553: 150, sniper: 100, ssg08: 230 };
export const maxSpeed = (weapon, scoped = false) => ((scoped && SCOPED[weapon]) || weaponById(weapon)?.speed || MAX_SPEED[weapon] || 250) * HU;
// Stamina (CS2's sv_staminamax 80, sv_staminajumpcost .08, sv_staminalandcost .05, sv_staminarecoveryrate 60): a jump
// costs 8, a landing 5; on the ground the speed is scaled by (100 − stamina)% until it recovers (CS:GO's use of them).
const STAMINA = { max: 80, jump: .08 * 100, land: .05 * 100, recover: 60 };
// Ducking (approximation: CS:GO's ideal duck speed 8 — fully down or up in 1/8 s — and its duck-spam penalty, from memory
// of the CS:GO code, not checked against CS2): each fresh press makes the next one slower by 2 (never under 1.5), coming
// back at 3 a second. The hull is crouched (54 HU) once fully down; in the air the duck is at once (Source) and tucks
// the feet up MOVE.lift.
export const DUCK = { speed: 8, spam: 2, min: 1.5, recover: 3 };
// Fall damage (approximation: CS:GO's PLAYER_MAX_SAFE_FALL_SPEED 580 HU/s and PLAYER_FATAL_FALL_SPEED 1024, not checked
// against CS2): a landing faster than 580 HU/s (a drop of ~210 HU) hurts, rising evenly to 100 HP at 1024 (~655 HU).
export const FALL = { safe: 580, fatal: 1024 };
export const fallDamage = speed => speed > FALL.safe ? Math.round((speed - FALL.safe) * 100 / (FALL.fatal - FALL.safe)) : 0;
// Ladders (Source / CS): climbing speed, the push off when jumping from one, and how far round a ladder's volume you
// still hold on (game units).
export const LADDER = { climb: 200 * HU, jumpOff: 270 * HU, reach: .45, downPitch: -.4 };
// The ladder the body is on (feet at s.y, `h` tall), or null.
function ladderAt(list, s, h) { const r = MOVE.radius * .6 + LADDER.reach;
  for (const L of list) if (s.x > L.minX - r && s.x < L.maxX + r && s.z > L.minZ - r && s.z < L.maxZ + r && s.y < L.y1 + .3 && s.y + h > L.y0) return L; return null; }

const NG = [], NB = [], NC = [];   // nearby boxes (box-grid.js), one list per query site

// s.duck: how far down (0–1; the eye follows it); s.ducked: the hull is the crouched one; s.lift: the feet tucked up by
// a duck in the air; s.landSpeed: the last landing's speed (HU/s); s.dy: how far this tick's duck moved the feet (not
// motion: moveTicks keeps it out of the drawn path); s.wall (wnx, wnz, wc): a staircase wall being slid along (wallHit).
export function createMoveState(y = 0) { return { vx: 0, vz: 0, vy: 0, y, onGround: true, stamina: 0, ducked: false, duck: 0, duckSpeed: DUCK.speed, duckRate: DUCK.speed, lift: 0, landed: 0, landSpeed: 0, velMod: 1, jumpHeld: false, duckHeld: false, dy: 0, acc: 0, wall: 0, wnx: 0, wnz: 0, wc: 0 }; }
// Tagging (CS: m_flVelocityModifier): a hit slows you to half your speed at once; it comes back at 0.4 a second (full
// again 1.25 s after a hit) — running across a sightline under fire is slow.
export const TAG = { hit: .5, recover: .4 };
export function tag(s, to = TAG.hit) { s.velMod = Math.min(s.velMod ?? 1, to); }

const EPS = 1e-6;   // heights are converted from HU: a riser of exactly 18 HU is a step, never a wall or a drop
const radiusOf = boxes => Number.isFinite(boxes?.bodyRadius) ? boxes.bodyRadius : MOVE.radius;
// Set by moveStep for its own tick only (Infinity / defaults for anyone else calling): STEP_TOP — in the air, the
// highest box top the body may be moved onto. Source steps up only on the ground (StepMove; in the air TryPlayerMove
// stops at a side): a ledge or a crate is got onto only once the feet are over its top, rising or falling (~57 HU, ~66
// crouch-jumping). The one exception: a top within a step of what the body is already over (the highest top under it,
// up to a step above the feet) — the maps' ramps and stairs are staircases of 16 HU columns, and as CS2's smooth ramps
// and clipped stairs never catch a body jumping up or down them, their columns must not either (a jump up a ramp would
// stop dead). AIR: in the air (a player's head is never stepped onto in the air). RAD: the map's body radius. CUR: the body.
let STEP_TOP = Infinity, AIR = false, RAD = MOVE.radius, CUR = null, HEAD = false;
// Ground under (x, z): the highest box top within a step of the feet (0 = floor).
export function groundAt(boxes, x, z, feet, r = radiusOf(boxes)) {
  let g = 0; for (const b of boxesNear(boxes, x - r, z - r, x + r, z + r, NG)) if (b.y1 <= feet + MOVE.step + EPS && b.y1 > g && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) g = b.y1;
  return g;
}
// Can a body (feet at `feet`, `h` tall) stand at (x, z)? Boxes lower than a step are walked onto, not into — in the air
// (AIR) only with head room over the top it would land on (Source's step traces up first: a low ceiling stops it).
export function blocked(boxes, bounds, x, z, feet, h = MOVE.height, r = radiusOf(boxes)) { const st = Math.min(feet + MOVE.step, STEP_TOP) + EPS;
  if (bounds && (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r)) return true;
  let g = feet, c = Infinity;
  for (const b of boxesNear(boxes, x - r, z - r, x + r, z + r, NB)) if (b.y1 > st ? (b.y0 < feet + h || AIR && b.y0 < c) : AIR && b.y1 > g) if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) {
    if (b.y1 <= st) g = b.y1; else if (b.y0 < feet + h) return true; else c = b.y0; }
  return c < g + h - EPS;
}

// Other players and bots: CS2 hulls (32 HU across: centres closer than PW touch; 72 HU tall, 54 crouched — o.ducked; feet
// at o.y), checked beside the map's boxes from a reused pool (no garbage per tick); `nh` of them are live. A hull is solid
// unless it is under the feet (stood on, or stepped onto from the ground) or its feet are in the body's top step (someone
// standing on you never stops you walking). One the body is already inside (spawned on top of each other, a late
// position from the network) only refuses moves that go deeper — toward its centre — so you walk out of it, never
// through it, and nobody is pushed.
const HULLS = [], NONE = [], PW = 2 * MOVE.hull;
const solidTo = (b, feet, h, up) => b.y1 > feet + up + EPS && b.y0 < feet + h - MOVE.step - EPS;
function hullsFor(s, others, h) { let n = 0;
  for (let i = 0; i < others.length; i++) { const o = others[i]; if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue; const b = HULLS[n] ??= {};
    b.cx = o.x; b.cz = o.z; b.y0 = o.y; b.y1 = o.y + (o.ducked ? MOVE.duckHeight : MOVE.height);
    b.inside = Math.abs(o.x - s.x) < PW && Math.abs(o.z - s.z) < PW && solidTo(b, s.y, h, MOVE.step); n++; }
  return n; }
// On a ladder this tick: where the body is (NaN: not climbing) and the ladder. The game's columns are coarser than CS2's
// clip over a ladder's top, which then wraps the climber's head: a box the body is already in holds nobody, and sliding
// along the ladder (strafing) passes what stands over the ladder itself — stepping off sideways, back or over the top
// stays free (CS2); the wall behind it, and anything beside the ladder, still stop you.
let climbX = NaN, climbZ = NaN, climbLad = null;
const blockedClimbing = (boxes, bounds, x, z, feet, h) => { const r = RAD, L = climbLad; if (bounds && (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r)) return true;
  const along = !!L && (L.maxX - L.minX <= L.maxZ - L.minZ ? x === climbX && z !== climbZ : z === climbZ && x !== climbX);
  for (const b of boxesNear(boxes, x - r, z - r, x + r, z + r, NB)) if (b.y1 > feet + MOVE.step + EPS && b.y0 < feet + h && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r && !(climbX > b.minX - r && climbX < b.maxX + r && climbZ > b.minZ - r && climbZ < b.maxZ + r)
    && !(along && b.minX < L.maxX + r && b.maxX > L.minX - r && b.minZ < L.maxZ + r && b.maxZ > L.minZ - r)) return true;
  return false; };
const blockedBy = (boxes, nh, bounds, x, z, feet, h) => { if (climbX === climbX ? blockedClimbing(boxes, bounds, x, z, feet, h) : blocked(boxes, bounds, x, z, feet, h, RAD)) return true;
  for (let i = 0; i < nh; i++) { const b = HULLS[i], dx = x - b.cx, dz = z - b.cz; if (Math.abs(dx) >= PW || Math.abs(dz) >= PW || !solidTo(b, feet, h, AIR ? 0 : MOVE.step)) continue;
    if (!b.inside) return true; const ox = CUR.x - b.cx, oz = CUR.z - b.cz; if (dx * dx + dz * dz < ox * ox + oz * oz - 1e-9) return true; }
  return false; };
// The ground under (x, z) for feet at `feet`: the map's (groundAt), or a player's head (HEAD then says so). In the air
// (`from`: the feet when the tick began) a head counts only when the feet come down onto it from above; on the ground,
// one within a step up or down — a support that stands up lifts you, one that crouches lowers you, and none moves you
// sideways (Source's ground entity carries a body only on moving brushes, not on a player; not checked in CS2's code).
const groundBy = (boxes, nh, x, z, feet, from = NaN) => { let g = groundAt(boxes, x, z, feet, RAD); HEAD = false;
  for (let i = 0; i < nh; i++) { const b = HULLS[i]; if (b.inside || b.y1 <= g || Math.abs(x - b.cx) >= PW || Math.abs(z - b.cz) >= PW) continue;
    if (from === from ? b.y1 <= from + EPS : b.y1 <= feet + MOVE.step + EPS) { g = b.y1; HEAD = true; } }
  return g; };
// A ceiling between the head now (y + h) and after this tick's rise (ny + h)? On a ladder (`lad`) the floor it climbs
// through is not one: the hole round a ladder is narrower than the collision's grid, so its edge would stop the head.
const ceilingIn = (list, n, x, z, y, ny, h, lad = null) => { const r = RAD; for (let i = 0; i < n; i++) { const b = list[i]; if (b.y0 >= y + h && b.y0 < ny + h && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) {
  if (lad && b.minX < lad.maxX + r && b.maxX > lad.minX - r && b.minZ < lad.maxZ + r && b.maxZ > lad.minZ - r && b.y0 < lad.y1 + 1) continue; return true; } } return false; };
// Someone over the head (feet in its top step or higher) is a ceiling too: the one below can't jump through them.
const headIn = (nh, x, z, y, ny, h) => { for (let i = 0; i < nh; i++) { const b = HULLS[i]; if (!b.inside && b.y0 >= y + h - MOVE.step - EPS && b.y0 < ny + h && Math.abs(x - b.cx) < PW && Math.abs(z - b.cz) < PW) return true; } return false; };
// Room to stand up from `h0` tall, feet at `feet`: the map's, and nobody in the way — someone standing on the head is
// lifted with you (CS2's crouch boost) as long as the map leaves them room over theirs, and over anyone standing on
// them (liftRoom: a stack of three under a low ceiling); else you stay down.
function liftRoom(boxes, nh, i, up, depth) { const b = HULLS[i]; if (blocked(boxes, null, b.cx, b.cz, b.y0 + up, b.y1 - b.y0, RAD)) return false;
  if (depth < 4) for (let j = 0; j < nh; j++) { const c = HULLS[j]; if (j === i || c.inside || Math.abs(c.cx - b.cx) >= PW || Math.abs(c.cz - b.cz) >= PW || c.y0 < b.y1 - MOVE.step - EPS) continue;
    const u = b.y1 + up - c.y0; if (u > EPS && !liftRoom(boxes, nh, j, u, depth + 1)) return false; }
  return true; }
function roomToStand(boxes, nh, x, z, feet, h0) {
  if (climbX === climbX ? blockedClimbing(boxes, null, x, z, feet, MOVE.height) : blocked(boxes, null, x, z, feet, MOVE.height, RAD)) return false;
  for (let i = 0; i < nh; i++) { const b = HULLS[i]; if (b.inside || Math.abs(x - b.cx) >= PW || Math.abs(z - b.cz) >= PW) continue;
    if (b.y0 >= feet + h0 - MOVE.step - EPS) { const up = feet + MOVE.height - b.y0; if (up > EPS && !liftRoom(boxes, nh, i, up, 0)) return false; }
    else if (solidTo(b, feet, MOVE.height, MOVE.step)) return false; }
  return true; }

function accelerate(s, wx, wz, wishspeed, accel, dt, cap = Infinity) {
  const current = s.vx * wx + s.vz * wz, add = Math.min(wishspeed, cap) - current;
  if (add <= 0) return; const a = Math.min(accel * dt * wishspeed, add); s.vx += a * wx; s.vz += a * wz;
}

// One tick. input: { wish: [x, z] (camera-relative move direction, any length; [0,0] = no keys), walk, duck, jump (the
// key held), jumpPress (moveTicks: a fresh press in this tick; without it a press is the key going down), weapon, scoped,
// look: [x, z] (where the camera faces), pitch (radians, up +) }. world: { boxes, bounds, ladders, others }.
// On a ladder (touching its volume): no gravity; moving into it climbs (more the more you look up, down when you
// look well down), away climbs down, strafing slides along it, no keys holds on; past the top the same push carries
// you onto the ledge; jumping pushes you off, away from its face. Moves s.x / s.z / s.y in place (s.x, s.z set by the caller).
// world.others: other players / bots [{ x, z, y (feet), ducked }] — solid hulls you can't walk through but can stand on.
// A small corner in the way: the least sideways shift (along ax, az; first toward `along`) that clears it, up to
// CORNER; the other way only when nothing moves along the wall; 0 when none does (a real wall).
export const CORNER = .45; const CORNER_STEPS = [.12, .25, CORNER], STAIR = 16 * HU * 1.05;   // STAIR: one collision cell (16 Hammer units), a staircase's step
function corner(boxes, nh, bounds, s, x, z, ax, az, along, height) {
  const first = along < 0 ? -1 : 1;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { const o = CORNER_STEPS[i] * (k ? -first : first); if (k && Math.abs(along) > 1e-3) continue; if (!blockedBy(boxes, nh, bounds, x + ax * o, z + az * o, s.y, height) && !blockedBy(boxes, nh, bounds, s.x + ax * o, s.z + az * o, s.y, height)) return o; }
  return 0;
}
// A wall built as a staircase of collision cells (an angled wall), blocked moving along (bx, bz): free again one cell
// further along (ax, az) on exactly one side, and blocked again one cell on from there (the next step: a flat wall's
// end is open beyond) — that side (±1), or 0 for a flat wall.
function stairSide(boxes, nh, bounds, x, z, ax, az, bx, bz, y, h) { const S = STAIR, a = !blockedBy(boxes, nh, bounds, x + ax * S, z + az * S, y, h), b = !blockedBy(boxes, nh, bounds, x - ax * S, z - az * S, y, h);
  return a === b ? 0 : a ? (blockedBy(boxes, nh, bounds, x + ax * S + bx * S, z + az * S + bz * S, y, h) ? 1 : 0) : (blockedBy(boxes, nh, bounds, x - ax * S + bx * S, z - az * S + bz * S, y, h) ? -1 : 0); }
// Blocked by a step of a staircase wall, moving to (tx, tz): the wall is the 45° plane through its steps' outer corners
// (normal nx, nz: out of it), as Source's smooth wall would be. The velocity loses the part into it (ClipVelocity); the
// body goes onto the plane — the part of the move past it pushed back out along the normal, so the pace along the wall
// is kept, never more than the move itself (deep in a notch at the first touch, it just waits on that axis) — and the
// plane is kept (s.wall) for the next ticks. Not on a ladder.
// In a staircase's notch or on its plane: a cell on into the wall along each axis is its step (its tread, its riser).
const inSteps = (boxes, bounds, x, z, nx, nz, y, h) => blocked(boxes, bounds, x - Math.sign(nx) * STAIR, z, y, h, RAD) && blocked(boxes, bounds, x, z - Math.sign(nz) * STAIR, y, h, RAD);
function wallHit(boxes, nh, bounds, s, tx, tz, nx, nz, h, dmax) { const vn = s.vx * nx + s.vz * nz; if (vn < 0) { s.vx -= nx * vn; s.vz -= nz * vn; }
  if (climbX === climbX) return; const r = RAD, st = Math.min(s.y + MOVE.step, STEP_TOP) + EPS; let c = -Infinity;
  for (const b of boxesNear(boxes, tx - r, tz - r, tx + r, tz + r, NB)) if (b.y1 > st && b.y0 < s.y + h && tx > b.minX - r && tx < b.maxX + r && tz > b.minZ - r && tz < b.maxZ + r) c = Math.max(c, nx * (nx > 0 ? b.maxX + r : b.minX - r) + nz * (nz > 0 ? b.maxZ + r : b.minZ - r));
  const d = c - (nx * tx + nz * tz) + 1e-9, px = tx + nx * d, pz = tz + nz * d;
  if (d > 0 && d <= dmax + EPS && !blockedBy(boxes, nh, bounds, px, pz, s.y, h)) { s.x = px; s.z = pz; s.wall = 1; s.wnx = nx; s.wnz = nz; s.wc = c; s.owx = s.owz = 0; }
  else if (d > 0 && d < STAIR && inSteps(boxes, bounds, s.x, s.z, nx, nz, s.y, h)) { s.wall = 1; s.wnx = nx; s.wnz = nz; s.wc = c; s.owx = s.owz = 0; } }
export function moveStep(s, input, world, dt) {
  const bounds = world?.bounds || null, boxes = world?.boxes || NONE; RAD = radiusOf(boxes); CUR = s; AIR = false; STEP_TOP = Infinity; s.dy = 0;
  const nh = world?.others?.length ? hullsFor(s, world.others, s.ducked ? MOVE.duckHeight : MOVE.height) : 0;
  s.stamina = Math.max(0, s.stamina - STAMINA.recover * dt);
  // Crouching: down (and up) at the duck speed, slower when spammed; in the air at once, tucking the feet up (the
  // crouch-jump's reach). Standing up needs room (the map, anyone in the way; in the air the tucked feet go back down
  // first); a duck held under a low ceiling stays down.
  const wantDuck = !!input.duck, sp = s.duckSpeed ?? DUCK.speed;
  if (wantDuck && !s.duckHeld) { s.duckRate = sp; s.duckSpeed = Math.max(DUCK.min, sp - DUCK.spam); } else s.duckSpeed = Math.min(DUCK.speed, sp + DUCK.recover * dt);
  s.duckHeld = wantDuck; const rate = s.duckRate ?? DUCK.speed;
  if (wantDuck) { if (!s.ducked && !s.onGround && !s.onLadder) { s.ducked = true; s.duck = 1; s.lift = MOVE.lift; s.y += MOVE.lift; s.dy += MOVE.lift; } else if (!s.ducked) { s.duck = Math.min(1, (s.duck || 0) + rate * dt); if (s.duck >= 1) s.ducked = true; } }
  else if (s.ducked) { const low = s.y - (s.lift || 0);
    if (!s.onGround && s.lift && groundBy(boxes, nh, s.x, s.z, low) <= low + EPS && roomToStand(boxes, nh, s.x, s.z, low, MOVE.duckHeight + s.lift)) { s.y = low; s.dy -= s.lift; s.lift = 0; s.ducked = false; }
    else if (roomToStand(boxes, nh, s.x, s.z, s.y, MOVE.duckHeight)) { s.lift = 0; s.ducked = false; } }
  if (!wantDuck && !s.ducked && s.duck > 0) s.duck = s.onGround ? Math.max(0, s.duck - rate * dt) : 0;
  const height = s.ducked ? MOVE.duckHeight : MOVE.height;
  const W = input.wish; let wx = W ? +W[0] || 0 : 0, wz = W ? +W[1] || 0 : 0; const wl = Math.hypot(wx, wz); if (wl > 1e-6) { wx /= wl; wz /= wl; } else wx = wz = 0;
  let wishspeed = wl > 1e-6 ? maxSpeed(input.weapon, input.scoped) : 0;
  wishspeed *= Math.min(input.walk ? MOVE.walk : 1, 1 + (MOVE.duck - 1) * (s.onGround ? s.duck || 0 : 0));   // crouching (as far down as you are) or walking: the slower
  if (s.stamina > 0 && s.onGround) wishspeed *= (100 - s.stamina) / 100;
  if ((s.velMod ?? 1) < 1) { s.velMod = Math.min(1, s.velMod + TAG.recover * dt); wishspeed *= s.velMod; if (s.onGround) { const top = maxSpeed(input.weapon, input.scoped) * s.velMod, sp = Math.hypot(s.vx, s.vz); if (sp > top) { s.vx *= top / sp; s.vz *= top / sp; } } }   // tagged: slower, and no faster than that on the ground
  // Jumping: a fresh press only (CS2's sv_autobunnyhopping 0: holding the key never jumps again).
  const held = !!input.jump, press = input.jumpPress === undefined ? held && !s.jumpHeld : !!input.jumpPress; s.jumpHeld = held;
  // Ladders.
  s.ladderOff = Math.max(0, (s.ladderOff || 0) - dt);
  const lad = world?.ladders?.length && !s.ladderOff ? ladderAt(world.ladders, s, height) : null; let climbing = false;
  if (lad) { const L = input.look, lx = L ? +L[0] || 0 : 0, lz = L ? +L[1] || 0 : 0, p = input.pitch ?? 0, cp = Math.cos(p);
    // CS's ladder move: forward / back climbs — up, or down while looking down (past ~20°, eased over ~9° so it never
    // snaps) — at the full climb speed, strafing slides along the ladder, the part into it is dropped; no keys: hold on.
    // On the floor and not climbing up: just walking. The ladder's face: its thin side, toward you.
    const thinX = lad.maxX - lad.minX <= lad.maxZ - lad.minZ, cx = (lad.minX + lad.maxX) / 2, cz = (lad.minZ + lad.maxZ) / 2;
    let nx = thinX ? Math.sign(s.x - cx) || -lx : 0, nz = thinX ? 0 : Math.sign(s.z - cz) || -lz;
    const fm = wx * lx + wz * lz, sm = wx * -lz + wz * lx, v = LADDER.climb;
    const up = Math.max(-1, Math.min(1, (p + .3) / .15));
    let vx = (lx * cp * fm + -lz * sm) * v, vy = fm * up * v, vz = (lz * cp * fm + lx * sm) * v; const into = vx * nx + vz * nz;
    if ((held || press) && !s.onGround) { s.vx = nx * LADDER.jumpOff; s.vz = nz * LADDER.jumpOff; s.vy = 0; s.ladderOff = .35; }
    else if (!(s.onGround && (wl < 1e-6 || vy <= 0))) { climbing = true; s.onGround = false;
      // Over the top (CS2): with the feet within a step of the ladder's top, pushing toward it carries you over the lip
      // onto the floor behind (the push into it is kept, with a little lift; the step-up lands you); lower down the push
      // into the ladder is dropped — you climb, never into the wall.
      const overTop = s.y > lad.y1 - MOVE.step && into < 0;
      if (overTop) vy = Math.max(vy, v * .6); else { vx -= nx * into; vz -= nz * into; }
      if (wl < 1e-6) vx = vy = vz = 0;
      s.vx = vx; s.vy = Math.max(-v, Math.min(v, vy)); s.vz = vz; } }
  s.onLadder = climbing;
  let vy0 = s.vy;
  if (climbing) { /* velocities set: no friction, acceleration or gravity this tick */ }
  else if (s.onGround && press) {
    // No bunny hopping (CS: sv_enablebunnyhopping 0): a jump trims horizontal speed to 1.1× the weapon's top speed.
    const sp = Math.hypot(s.vx, s.vz), cap = maxSpeed(input.weapon, input.scoped) * MOVE.bhop; if (sp > cap) { s.vx *= cap / sp; s.vz *= cap / sp; }
    s.vy = MOVE.jump; s.onGround = false; s.stamina = Math.min(STAMINA.max, s.stamina + STAMINA.jump);
  }
  if (s.onGround) {
    // Friction, then acceleration toward the wished direction (counter-strafing stops you in a few ticks).
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > 0) { const drop = Math.max(sp, MOVE.stopspeed) * MOVE.friction * dt, k = Math.max(0, sp - drop) / sp; s.vx *= k; s.vz *= k; }
    accelerate(s, wx, wz, wishspeed, MOVE.accelerate, dt);
  } else if (!climbing) {
    accelerate(s, wx, wz, wishspeed, MOVE.airaccelerate, dt, MOVE.aircap);
    vy0 = s.vy; s.vy -= MOVE.gravity * dt;
  }
  // Horizontal move (slide along walls), stepping up onto low boxes on the ground (in the air: STEP_TOP). A small corner
  // in the way nudges you aside (up to CORNER) instead of stopping you dead — paid back from the next moves along that
  // axis (s.owx / s.owz), so hugging a zig-zag wall is never faster than running; a wall at 45° (a staircase of boxes)
  // is slid along as Source's smooth wall (wallHit, s.wall).
  // (and for a moment after leaving a ladder: stepped off at its top, the body walks out of what wrapped its head)
  if (climbing) s.ladGrace = .75; else if (s.ladGrace) s.ladGrace = Math.max(0, s.ladGrace - dt);
  AIR = !s.onGround && !climbing && !(s.ladGrace > 0); STEP_TOP = AIR ? Math.max(s.y, groundAt(boxes, s.x, s.z, s.y, RAD) + MOVE.step) : Infinity;
  if (climbing || s.ladGrace > 0) { climbX = s.x; climbZ = s.z; climbLad = climbing ? lad : null; }
  // Along a staircase wall touched before (s.wall: its plane — the body still on it, the wall still behind it): the
  // velocity keeps clear of the plane (ClipVelocity each tick, as on Source's smooth wall) and the move goes along it in
  // one piece — never into the notches between its steps, so never bumped out of them at each step (the old jolt, ~11
  // times a second at a run). Off the plane (stepped away, or a first touch deep in a notch) the walls are as they are:
  // a plane guessed from a staircase's last steps never holds anyone off the open floor beside them.
  let moved = false;
  if (s.wall) { const dep = s.wc - (s.wnx * s.x + s.wnz * s.z);
    if ((AIR || s.onGround) && dep > -1e-6 && dep < STAIR && inSteps(boxes, bounds, s.x, s.z, s.wnx, s.wnz, s.y, height)) {
      const vn = s.vx * s.wnx + s.vz * s.wnz; if (vn < 0) { s.vx -= s.wnx * vn; s.vz -= s.wnz * vn; }
      const mx = s.vx * dt, mz = s.vz * dt, e = Math.max(0, Math.min(dep + 1e-9, Math.hypot(mx, mz))), px = s.x + mx + s.wnx * e, pz = s.z + mz + s.wnz * e;
      if (!blockedBy(boxes, nh, bounds, px, pz, s.y, height)) { s.x = px; s.z = pz; moved = true; } }
    else s.wall = 0; }
  // Per axis: a flat wall takes the blocked part away (Source's clip against an axis-aligned plane, also at its end; pushed
  // straight into its end you never slide round it); a step of a staircase wall (stairSide) puts you on its plane.
  if (!moved) { let dx = s.vx * dt; if (s.owx) { if (s.owx * dx > 0) { const p = Math.sign(dx) * Math.min(Math.abs(dx), Math.abs(s.owx)); dx -= p; s.owx -= p; } else s.owx = 0; }
    if (!blockedBy(boxes, nh, bounds, s.x + dx, s.z, s.y, height)) s.x += dx;
    else { const k = Math.sign(dx), sz = stairSide(boxes, nh, bounds, s.x + dx, s.z, 0, 1, k, 0, s.y, height);
      if (sz && inSteps(boxes, bounds, s.x, s.z, -k, sz, s.y, height)) wallHit(boxes, nh, bounds, s, s.x + dx, s.z, -k * Math.SQRT1_2, sz * Math.SQRT1_2, height, Math.abs(dx));
      else { const n = corner(boxes, nh, bounds, s, s.x + dx, s.z, 0, 1, s.vz, height); if (n) { s.x += dx; s.z += n; s.owz = n; } else s.vx = 0; } }
    let dz = s.vz * dt; if (s.owz) { if (s.owz * dz > 0) { const p = Math.sign(dz) * Math.min(Math.abs(dz), Math.abs(s.owz)); dz -= p; s.owz -= p; } else s.owz = 0; }
    if (!blockedBy(boxes, nh, bounds, s.x, s.z + dz, s.y, height)) s.z += dz;
    else { const k = Math.sign(dz), sx = stairSide(boxes, nh, bounds, s.x, s.z + dz, 1, 0, 0, k, s.y, height);
      if (sx && inSteps(boxes, bounds, s.x, s.z, sx, -k, s.y, height)) wallHit(boxes, nh, bounds, s, s.x, s.z + dz, sx * Math.SQRT1_2, -k * Math.SQRT1_2, height, Math.abs(dz));
      else { const n = corner(boxes, nh, bounds, s, s.x, s.z + dz, 1, 0, s.vx, height); if (n) { s.z += dz; s.x += n; s.owx = n; } else s.vz = 0; } } }
  climbX = climbZ = NaN; climbLad = null; AIR = false; STEP_TOP = Infinity;
  // Vertical: fall / rise (the exact parabola: the tick's mean velocity, so a jump peaks at 57.0 HU at any tick), land
  // on the highest surface below, bump the head on ceilings. On the ground a step down keeps you on it; a head that
  // rises under you lifts you only if there is room over yours (else you stay put on it).
  const y0 = s.y, ground = groundBy(boxes, nh, s.x, s.z, s.y, s.onGround ? NaN : s.y), onHead = HEAD;
  if (s.onGround) { if (s.y - ground > MOVE.step + EPS) s.onGround = false; else if (!(onHead && ground > s.y + EPS && blocked(boxes, null, s.x, s.z, ground, height, RAD))) s.y = ground; }
  if (!s.onGround) {
    const ny = s.y + (climbing ? s.vy : (vy0 + s.vy) / 2) * dt;
    const near = s.vy > 0 ? boxesNear(boxes, s.x - RAD, s.z - RAD, s.x + RAD, s.z + RAD, NC) : null;
    if (s.vy > 0 && (ceilingIn(near, near.length, s.x, s.z, s.y, ny, height, climbing ? lad : null) || headIn(nh, s.x, s.z, s.y, ny, height))) s.vy = 0;
    else s.y = ny;
    const g = groundBy(boxes, nh, s.x, s.z, Math.max(s.y, ground), y0);
    if (s.vy <= 0 && s.y <= g) { if (!climbing) { s.landed = 1; s.landSpeed = -s.vy / HU; s.stamina = Math.min(STAMINA.max, s.stamina + STAMINA.land); } s.y = g; s.vy = 0; s.onGround = true; s.lift = 0; }
  }
  return s;
}
// Fixed ticks: the movement always advances in steps of exactly 1/MOVE_HZ s whatever the frame rate, so the same keys
// make the same path at 30 and at 240 fps (a step per frame, or a frame cut into equal steps, made the feel depend on
// it). 128 a second (CS2's servers run 64 with sub-tick input; twice that keeps every result of the continuous rules —
// stop, counter-strafe, jump — within ~1 % with whole-tick input). moveFor: `dt` of it, the time left over (under a
// tick) carried in s.acc, the same input for every tick.
export const MOVE_HZ = 128, TICK = 1 / MOVE_HZ;
export function moveFor(s, input, world, dt) { s.acc = (s.acc || 0) + dt; while (s.acc >= TICK - 1e-9) { s.acc -= TICK; moveStep(s, input, world, TICK); } if (s.acc < 0) s.acc = 0; return s; }
// The game's clock (lab.js): ticks as moveFor, at most MAX_TICKS in a frame (a stall — the laptop waking, the tab coming
// back — drops the backlog instead of running a burst of catch-up ticks), and the body drawn between the last two ticks
// (clk.x / y / z / duck, by the time left over: smooth at any frame rate, one tick behind). Jump presses (pressJump, at
// the moment of the key or wheel event, in seconds on `now`'s clock) wait for the tick they fall in: a press between two
// ticks is never lost, and it jumps only if that tick starts on the ground (one in the air is spent there: no buffered
// jumps in CS2). Each tick's other input is the frame's. clk.landed / landSpeed: a landing in this frame and its speed;
// clk.lift: how far ducks in the air moved the feet this frame (the view keeps still: lab.js).
export const MAX_TICKS = 8;
export function createMoveClock() { return { acc: 0, alpha: 0, ticks: 0, q: new Float64Array(8), nq: 0, px: NaN, py: 0, pz: 0, pd: 0, x: 0, y: 0, z: 0, duck: 0, lift: 0, landed: 0, landSpeed: 0 }; }
export function pressJump(clk, t) { if (clk.nq < clk.q.length) clk.q[clk.nq++] = t; else clk.q[clk.nq - 1] = t; }
export function moveTicks(s, clk, input, world, dt, now = NaN) {
  clk.acc += dt; let n = Math.floor((clk.acc + 1e-9) / TICK); if (n > MAX_TICKS) { n = MAX_TICKS; clk.acc = n * TICK; }
  clk.lift = 0; clk.landed = 0; clk.landSpeed = 0; if (clk.px !== clk.px) { clk.px = s.x; clk.py = s.y; clk.pz = s.z; clk.pd = s.duck || 0; }
  const left = Math.max(0, clk.acc - n * TICK);
  for (let i = 0; i < n; i++) { const at = now - left - (n - 1 - i) * TICK;   // this tick's moment on `now`'s clock (NaN: a press counts at the next tick)
    let press = false, k = 0; for (let j = 0; j < clk.nq; j++) { if (clk.q[j] > at) clk.q[k++] = clk.q[j]; else press = true; } clk.nq = k;
    input.jumpPress = press && !input.noJump; clk.px = s.x; clk.py = s.y; clk.pz = s.z; clk.pd = s.duck || 0;
    moveStep(s, input, world, TICK);
    if (s.dy) { clk.py += s.dy; clk.lift += s.dy; }
    if (s.landed) { s.landed = 0; clk.landed = 1; clk.landSpeed = Math.max(clk.landSpeed, s.landSpeed); } }
  input.jumpPress = undefined; if (input.noJump) clk.nq = 0;
  clk.acc = left; clk.ticks += n; const a = clk.alpha = Math.min(1, left / TICK);
  clk.x = clk.px + (s.x - clk.px) * a; clk.y = clk.py + (s.y - clk.py) * a; clk.z = clk.pz + (s.z - clk.pz) * a; clk.duck = clk.pd + ((s.duck || 0) - clk.pd) * a;
  return clk;
}
// Shot inaccuracy from movement (CS2: accurate up to 34% of the gun's max speed, then rising; very wide in the air).
export function moveSpread(s, weapon, scoped = false) {
  if (!s) return 1;
  if (!s.onGround) return 6;
  const f = Math.hypot(s.vx, s.vz) / maxSpeed(weapon, scoped);
  return 1 + Math.max(0, (f - .34) / .66) * 4 * (weapon === 'sniper' ? 2 : 1) - (s.ducked ? .25 : 0);
}
// Host checks on the pose stream (lan/room.mjs, Global Defensive) — cheap: the host never runs this movement.
// poseGate: a body that moved faster than anyone can — over 2 × the knife's 250 HU/s since its last accepted pose (air
// strafing, ladder jump-offs and network bursts stay well inside; heights are never checked, so boosts, ladders and falls
// pass) — is refused: the host keeps its last accepted spot (as for the dead), and the allowance grows with the time
// since, so a teleport the host didn't hear of catches up in a second or two. A teleport the host made (its spawn,
// `spawn` = combat.spawnTo) or the client announced (`tp`, its teleport count: spawn picks, practice, test hooks) passes at
// once. The time between poses is the client's capture clock (`ct`, ms; robust to network bursts), never more than the
// host's own clock allows plus half a second, with a quarter unit to spare per pose (a unit and a half without that
// clock: arrival times bunch up). A sanity gate for broken or naively hacked clients, not anti-cheat.
export const POSE_GATE = { speed: 500 * HU, slack: .25, slackNoClock: 1.5, bank: .5 };
export function poseGate(g, x, z, ct, now, spawn = null, tp = 0) {
  let ok = !(g.at > 0) || tp !== g.tp || !!spawn && Number.isFinite(spawn.x) && spawn.at !== g.spawnAt && Math.abs(x - spawn.x) < 4 && Math.abs(z - spawn.z) < 4;
  if (!ok) { const dS = Math.max(0, (now - g.at) / 1000), clock = Number.isFinite(ct) && Number.isFinite(g.ct), d = clock ? Math.max(0, Math.min((ct - g.ct) / 1000, dS + POSE_GATE.bank)) : dS;
    ok = Math.hypot(x - g.x, z - g.z) <= POSE_GATE.speed * d + (clock ? POSE_GATE.slack : POSE_GATE.slackNoClock); }
  if (ok) { g.x = x; g.z = z; g.ct = ct; g.at = now; g.tp = tp; if (spawn && Number.isFinite(spawn.x) && Math.abs(x - spawn.x) < 4 && Math.abs(z - spawn.z) < 4) g.spawnAt = spawn.at; }   // (the spawn counts as taken only once the body is there: a pose from the old spot sent before the order arrived — one round trip — used to use it up, and the jump to the spawn was then refused for seconds)
  return ok;
}
// Fall damage on the host, from the pose stream: `land` = { n: the client's count of hard landings, v: the last one's
// speed, HU/s }. A new one costs fallDamage(v), its speed capped by the drop the host saw (from the highest the feet were
// in the last 3–6 s: a landing is never harder than the fall that made it — √(2·800·drop), with 15 % and 40 HU/s to spare
// for the poses' timing: our margin, not a CS2 value). Returns the damage (0: none).
export function fallCheck(st, land, fy, now) {
  if (!Number.isFinite(fy)) return 0;
  if (!(now - (st.at ?? -Infinity) < 3000)) { st.hi0 = st.hi ?? fy; st.hi = fy; st.at = now; } else if (fy > st.hi) st.hi = fy;
  if (!land || !Number.isInteger(land.n)) return 0; if (st.n === undefined || land.n < st.n) { st.n = land.n; return 0; } if (land.n === st.n) return 0; st.n = land.n;
  const drop = Math.max(0, Math.max(st.hi, st.hi0 ?? st.hi) - fy) / HU, cap = Math.sqrt(2 * 800 * drop) * 1.15 + 40; st.hi = st.hi0 = fy;
  return fallDamage(Math.min(+land.v || 0, cap));
}
