// CS2-style movement for the shooting arena: Source rules (ground friction, acceleration, air strafing with the
// 30-unit air cap, gravity, jump impulse, jump/landing stamina) and CS2's speeds per weapon in hand. Values are
// CS2's, converted from Hammer units (1 HU ≈ 2.54 cm) to game units (1 unit ≈ 16.5 cm). Pure: the game and the
// tests drive it with plain objects.
export const HU = 2.54 / 16.5;
export const MOVE = { friction: 5.2, stopspeed: 80 * HU, accelerate: 5.5, airaccelerate: 12, aircap: 30 * HU, gravity: 800 * HU, jump: 301.993 * HU, walk: .52, duck: .34, step: 18 * HU, height: 72 * HU, duckHeight: 54 * HU, radius: 1.3, bhop: 1.1 };
// Max running speed (HU/s) with each weapon drawn; scoped sniper 100.
export const MAX_SPEED = { knife: 250, karambit: 250, pistol: 240, deagle: 230, cannon: 240, smg: 235, shotgun: 220, ak: 215, m4: 225, sniper: 200, lmg: 195 };
export const maxSpeed = (weapon, scoped = false) => (weapon === 'sniper' && scoped ? 100 : MAX_SPEED[weapon] || 250) * HU;
// Stamina (CS:GO/CS2): a jump costs 8%, a landing 5%; speed is scaled by (100 − stamina)% until it recovers.
const STAMINA = { max: 80, jump: .08 * 100, land: .05 * 100, recover: 60 };
// Ladders (Source / CS): climbing speed, the push off when jumping from one, and how far round a ladder's volume you
// still hold on (game units).
export const LADDER = { climb: 200 * HU, jumpOff: 270 * HU, reach: .45, downPitch: -.4 };
// The ladder the body is on (feet at s.y, `h` tall), or null.
function ladderAt(list, s, h) { const r = MOVE.radius * .6 + LADDER.reach;
  for (const L of list) if (s.x > L.minX - r && s.x < L.maxX + r && s.z > L.minZ - r && s.z < L.maxZ + r && s.y < L.y1 + .3 && s.y + h > L.y0) return L; return null; }

import { boxesNear } from './box-grid.js';
const NG = [], NB = [], NC = [];   // nearby boxes (box-grid.js), one list per query site

export function createMoveState(y = 0) { return { vx: 0, vz: 0, vy: 0, y, onGround: true, stamina: 0, ducked: false, landed: 0, velMod: 1 }; }
// Tagging (CS: m_flVelocityModifier): a hit slows you to half your speed at once; it comes back at 0.4 a second (full
// again 1.25 s after a hit) — running across a sightline under fire is slow.
export const TAG = { hit: .5, recover: .4 };
export function tag(s, to = TAG.hit) { s.velMod = Math.min(s.velMod ?? 1, to); }

// Ground under (x, z): the highest box top within a step of the feet (0 = floor).
export function groundAt(boxes, x, z, feet, r = MOVE.radius) {
  let g = 0; for (const b of boxesNear(boxes, x - r, z - r, x + r, z + r, NG)) if (b.y1 <= feet + MOVE.step + 1e-6 && b.y1 > g && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) g = b.y1;
  return g;
}
// Can a body (feet at `feet`, `h` tall) stand at (x, z)? Boxes lower than a step are walked onto, not into.
export function blocked(boxes, bounds, x, z, feet, h = MOVE.height, r = MOVE.radius) {
  if (bounds && (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r)) return true;
  for (const b of boxesNear(boxes, x - r, z - r, x + r, z + r, NB)) if (b.y1 > feet + MOVE.step && b.y0 < feet + h && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
  return false;
}

// Other players' hulls for this tick, in a reused pool: checked beside the map's boxes (never a copy of the map's
// box list, no garbage per tick). `nh` of them are live.
const HULLS = [], NONE = [];
function hullsFor(s, others) { const R = MOVE.radius; let n = 0;
  for (const o of others) { if (Math.abs(o.x - s.x) < 2 * R && Math.abs(o.z - s.z) < 2 * R && o.y < s.y + MOVE.height && o.y + MOVE.height > s.y) continue;   // already overlapping: ignored until you separate
    const b = HULLS[n] ??= {}; b.minX = o.x - R; b.maxX = o.x + R; b.minZ = o.z - R; b.maxZ = o.z + R; b.y0 = o.y; b.y1 = o.y + MOVE.height; n++; }
  return n; }
const blockedBy = (boxes, nh, bounds, x, z, feet, h) => { if (blocked(boxes, bounds, x, z, feet, h)) return true; const r = MOVE.radius;
  for (let i = 0; i < nh; i++) { const b = HULLS[i]; if (b.y1 > feet + MOVE.step && b.y0 < feet + h && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true; } return false; };
const groundBy = (boxes, nh, x, z, feet) => { let g = groundAt(boxes, x, z, feet); const r = MOVE.radius;
  for (let i = 0; i < nh; i++) { const b = HULLS[i]; if (b.y1 <= feet + MOVE.step + 1e-6 && b.y1 > g && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) g = b.y1; } return g; };
// A ceiling between the head now (y + h) and after this tick's rise (ny + h)? On a ladder (`lad`) the floor it climbs
// through is not one: the hole round a ladder is narrower than the collision's grid, so its edge would stop the head.
const ceilingIn = (list, n, x, z, y, ny, h, lad = null) => { const r = MOVE.radius; for (let i = 0; i < n; i++) { const b = list[i]; if (b.y0 >= y + h && b.y0 < ny + h && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) {
  if (lad && b.minX < lad.maxX + r && b.maxX > lad.minX - r && b.minZ < lad.maxZ + r && b.maxZ > lad.minZ - r && b.y0 < lad.y1 + 1) continue; return true; } } return false; };

function accelerate(s, wx, wz, wishspeed, accel, dt, cap = Infinity) {
  const current = s.vx * wx + s.vz * wz, add = Math.min(wishspeed, cap) - current;
  if (add <= 0) return; const a = Math.min(accel * dt * wishspeed, add); s.vx += a * wx; s.vz += a * wz;
}

// One tick. input: { wish: [x, z] (camera-relative move direction, any length; [0,0] = no keys), walk, duck, jump,
// weapon, scoped, look: [x, z] (where the camera faces), pitch (radians, up +) }. world: { boxes, bounds, ladders }.
// On a ladder (touching its volume): no gravity; moving into it climbs (more the more you look up, down when you
// look well down), away climbs down, strafing slides along it, no keys holds on; past the top the same push carries
// you onto the ledge; jumping pushes you off, away from its face. Moves s.x / s.z / s.y in place (s.x, s.z set by the caller).
// world.others: other players / bots [{ x, z, y }] — solid 32×72 u hulls you can't walk through (but can stand
// on). Anyone you already overlap (spawned on top of each other) is ignored until you separate.
// A small corner in the way: the least sideways shift (along ax, az; first toward `along`, the other way after) that
// clears it, up to CORNER; 0 when none does (a real wall).
export const CORNER = .45; const CORNER_STEPS = [.12, .25, CORNER], STAIR = 16 * HU * 1.05;   // STAIR: one collision cell (16 Hammer units), a staircase's step
function corner(boxes, nh, bounds, s, x, z, ax, az, along, height) {
  const first = along < 0 ? -1 : 1;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { const o = CORNER_STEPS[i] * (k ? -first : first); if (!blockedBy(boxes, nh, bounds, x + ax * o, z + az * o, s.y, height) && !blockedBy(boxes, nh, bounds, s.x + ax * o, s.z + az * o, s.y, height)) return o; }
  return 0;
}
export function moveStep(s, input, world, dt) {
  const bounds = world?.bounds || null, boxes = world?.boxes || NONE, nh = world?.others?.length ? hullsFor(s, world.others) : 0;
  s.stamina = Math.max(0, s.stamina - STAMINA.recover * dt);
  // Crouching (in the air too: crouch-jump tucks the legs, reaching higher ledges).
  const wantDuck = !!input.duck;
  if (!wantDuck && s.ducked && blockedBy(boxes, nh, null, s.x, s.z, s.y, MOVE.height)) { /* no room to stand */ } else s.ducked = wantDuck;
  const height = s.ducked ? MOVE.duckHeight : MOVE.height;
  let [wx, wz] = input.wish || [0, 0]; const wl = Math.hypot(wx, wz); if (wl > 1e-6) { wx /= wl; wz /= wl; } else wx = wz = 0;
  let wishspeed = wl > 1e-6 ? maxSpeed(input.weapon, input.scoped) : 0;
  if (s.ducked && s.onGround) wishspeed *= MOVE.duck; else if (input.walk) wishspeed *= MOVE.walk;
  if (s.stamina > 0 && s.onGround) wishspeed *= (100 - s.stamina) / 100;
  if ((s.velMod ?? 1) < 1) { s.velMod = Math.min(1, s.velMod + TAG.recover * dt); wishspeed *= s.velMod; if (s.onGround) { const top = maxSpeed(input.weapon, input.scoped) * s.velMod, sp = Math.hypot(s.vx, s.vz); if (sp > top) { s.vx *= top / sp; s.vz *= top / sp; } } }   // tagged: slower, and no faster than that on the ground
  // Ladders.
  s.ladderOff = Math.max(0, (s.ladderOff || 0) - dt);
  const lad = world?.ladders?.length && !s.ladderOff ? ladderAt(world.ladders, s, height) : null; let climbing = false;
  if (lad) { const [lx, lz] = input.look || [0, 0], p = input.pitch ?? 0, cp = Math.cos(p);
    // CS's ladder move: forward / back climbs — up, or down while looking down (past ~20°, eased over ~9° so it never
    // snaps) — at the full climb speed, strafing slides along the ladder, the part into it is dropped; no keys: hold on.
    // On the floor and not climbing up: just walking. The ladder's face: its thin side, toward you.
    const thinX = lad.maxX - lad.minX <= lad.maxZ - lad.minZ, cx = (lad.minX + lad.maxX) / 2, cz = (lad.minZ + lad.maxZ) / 2;
    let nx = thinX ? Math.sign(s.x - cx) || -lx : 0, nz = thinX ? 0 : Math.sign(s.z - cz) || -lz;
    const fm = wx * lx + wz * lz, sm = wx * -lz + wz * lx, v = LADDER.climb;
    const up = Math.max(-1, Math.min(1, (p + .3) / .15));
    let vx = (lx * cp * fm + -lz * sm) * v, vy = fm * up * v, vz = (lz * cp * fm + lx * sm) * v; const into = vx * nx + vz * nz;
    if (input.jump && !s.onGround) { s.vx = nx * LADDER.jumpOff; s.vz = nz * LADDER.jumpOff; s.vy = 0; s.ladderOff = .35; }
    else if (!(s.onGround && (wl < 1e-6 || vy <= 0))) { climbing = true; s.onGround = false;
      vx -= nx * into; vz -= nz * into; if (wl < 1e-6) vx = vy = vz = 0;
      s.vx = vx; s.vy = Math.max(-v, Math.min(v, vy)); s.vz = vz; } }
  s.onLadder = climbing;
  if (climbing) { /* velocities set: no friction, acceleration or gravity this tick */ }
  else if (s.onGround && input.jump) {
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
    s.vy -= MOVE.gravity * dt;
  }
  // Horizontal move per axis (slide along walls), stepping up onto low boxes. A wall that runs at an angle is a
  // staircase of boxes: its small corners nudge you aside (up to CORNER) instead of stopping you dead, so sliding
  // along it — or along rocks, zig-zag walls — keeps its speed, as on Source's smooth hull.
  const dx = s.vx * dt;
  // Blocked by one step of a staircase (an angled wall in boxes: clear again a cell further along the other axis):
  // the speed is carried along the wall (as Source's velocity clipped to the real slope), not lost at every step. A
  // flat wall still takes the blocked part away (Source's clip against an axis-aligned plane).
  if (!blockedBy(boxes, nh, bounds, s.x + dx, s.z, s.y, height)) s.x += dx;
  else { const n = corner(boxes, nh, bounds, s, s.x + dx, s.z, 0, 1, s.vz, height); if (n) { s.x += dx; s.z += n; }
    else { if (Math.abs(s.vz) > .2 * Math.abs(s.vx) && !blockedBy(boxes, nh, bounds, s.x + dx, s.z + Math.sign(s.vz) * STAIR, s.y, height)) s.vz = Math.sign(s.vz) * Math.hypot(s.vx, s.vz); s.vx = 0; } }
  const dz2 = s.vz * dt;
  if (!blockedBy(boxes, nh, bounds, s.x, s.z + dz2, s.y, height)) s.z += dz2;
  else { const n = corner(boxes, nh, bounds, s, s.x, s.z + dz2, 1, 0, s.vx, height); if (n) { s.z += dz2; s.x += n; }
    else { if (Math.abs(s.vx) > .2 * Math.abs(s.vz) && !blockedBy(boxes, nh, bounds, s.x + Math.sign(s.vx) * STAIR, s.z + dz2, s.y, height)) s.vx = Math.sign(s.vx) * Math.hypot(s.vx, s.vz); s.vz = 0; } }
  // Vertical: fall / rise, land on the highest surface below, bump the head on ceilings.
  const ground = groundBy(boxes, nh, s.x, s.z, s.y);
  if (s.onGround) { if (s.y - ground > MOVE.step) s.onGround = false; else s.y = ground; }
  if (!s.onGround) {
    const ny = s.y + s.vy * dt;
    const near = s.vy > 0 ? boxesNear(boxes, s.x - MOVE.radius, s.z - MOVE.radius, s.x + MOVE.radius, s.z + MOVE.radius, NC) : null;
    if (s.vy > 0 && (ceilingIn(near, near.length, s.x, s.z, s.y, ny, height, climbing ? lad : null) || ceilingIn(HULLS, nh, s.x, s.z, s.y, ny, height))) s.vy = 0;
    else s.y = ny;
    const g = groundBy(boxes, nh, s.x, s.z, Math.max(s.y, ground));
    if (s.vy <= 0 && s.y <= g) { s.y = g; s.vy = 0; s.onGround = true; if (!climbing) { s.landed = 1; s.stamina = Math.min(STAMINA.max, s.stamina + STAMINA.land); } }
  }
  return s;
}
// A frame of movement in equal steps of at most 1/128 s: one step per frame would make the feel depend on the frame
// rate (at 30 fps you'd slide a sixth less after letting go than at 240). Same input for every step.
export const MOVE_HZ = 128;
export function moveFor(s, input, world, dt) { const k = Math.max(1, Math.ceil(dt * MOVE_HZ - 1e-6)), h = dt / k; for (let i = 0; i < k; i++) moveStep(s, input, world, h); return s; }
// Shot inaccuracy from movement (CS2: accurate up to 34% of the gun's max speed, then rising; very wide in the air).
export function moveSpread(s, weapon, scoped = false) {
  if (!s) return 1;
  if (!s.onGround) return 6;
  const f = Math.hypot(s.vx, s.vz) / maxSpeed(weapon, scoped);
  return 1 + Math.max(0, (f - .34) / .66) * 4 * (weapon === 'sniper' ? 2 : 1) - (s.ducked ? .25 : 0);
}
