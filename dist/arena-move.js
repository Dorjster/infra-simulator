// CS2-style movement for the shooting arena: Source rules (ground friction, acceleration, air strafing with the
// 30-unit air cap, gravity, jump impulse, jump/landing stamina) and CS2's speeds per weapon in hand. Values are
// CS2's, converted from Hammer units (1 HU ≈ 2.54 cm) to game units (1 unit ≈ 16.5 cm). Pure: the game and the
// tests drive it with plain objects.
export const HU = 2.54 / 16.5;
export const MOVE = { friction: 5.2, stopspeed: 80 * HU, accelerate: 5.5, airaccelerate: 12, aircap: 30 * HU, gravity: 800 * HU, jump: 301.993 * HU, walk: .52, duck: .34, step: 18 * HU, height: 72 * HU, duckHeight: 54 * HU, radius: 1.3 };
// Max running speed (HU/s) with each weapon drawn; scoped sniper 100.
export const MAX_SPEED = { knife: 250, karambit: 250, pistol: 240, deagle: 230, cannon: 240, smg: 235, shotgun: 220, ak: 215, m4: 225, sniper: 200, lmg: 195 };
export const maxSpeed = (weapon, scoped = false) => (weapon === 'sniper' && scoped ? 100 : MAX_SPEED[weapon] || 250) * HU;
// Stamina (CS:GO/CS2): a jump costs 8%, a landing 5%; speed is scaled by (100 − stamina)% until it recovers.
const STAMINA = { max: 80, jump: .08 * 100, land: .05 * 100, recover: 60 };

export function createMoveState(y = 0) { return { vx: 0, vz: 0, vy: 0, y, onGround: true, stamina: 0, ducked: false, landed: 0 }; }

// Ground under (x, z): the highest box top within a step of the feet (0 = floor).
export function groundAt(boxes, x, z, feet, r = MOVE.radius) {
  let g = 0; for (const b of boxes) if (b.y1 <= feet + MOVE.step + 1e-6 && b.y1 > g && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) g = b.y1;
  return g;
}
// Can a body (feet at `feet`, `h` tall) stand at (x, z)? Boxes lower than a step are walked onto, not into.
export function blocked(boxes, bounds, x, z, feet, h = MOVE.height, r = MOVE.radius) {
  if (bounds && (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r)) return true;
  for (const b of boxes) if (b.y1 > feet + MOVE.step && b.y0 < feet + h && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
  return false;
}

function accelerate(s, wx, wz, wishspeed, accel, dt, cap = Infinity) {
  const current = s.vx * wx + s.vz * wz, add = Math.min(wishspeed, cap) - current;
  if (add <= 0) return; const a = Math.min(accel * dt * wishspeed, add); s.vx += a * wx; s.vz += a * wz;
}

// One tick. input: { wish: [x, z] (camera-relative move direction, any length; [0,0] = no keys), walk, duck, jump,
// weapon, scoped }. world: { boxes, bounds }. Moves s.x / s.z / s.y in place (s.x, s.z set by the caller).
// world.others: other players / bots [{ x, z, y }] — solid 32×72 u hulls you can't walk through (but can stand
// on). Anyone you already overlap (spawned on top of each other) is ignored until you separate.
export function moveStep(s, input, world, dt) {
  const { bounds = null, others = [] } = world || {}, R = MOVE.radius;
  const boxes = others.length ? [...(world.boxes || []), ...others.filter(o => Math.abs(o.x - s.x) >= 2 * R || Math.abs(o.z - s.z) >= 2 * R || o.y >= s.y + MOVE.height || o.y + MOVE.height <= s.y).map(o => ({ minX: o.x - R, maxX: o.x + R, minZ: o.z - R, maxZ: o.z + R, y0: o.y, y1: o.y + MOVE.height }))] : world?.boxes || [];
  s.stamina = Math.max(0, s.stamina - STAMINA.recover * dt);
  // Crouching (in the air too: crouch-jump tucks the legs, reaching higher ledges).
  const wantDuck = !!input.duck;
  if (!wantDuck && s.ducked && blocked(boxes, null, s.x, s.z, s.y, MOVE.height)) { /* no room to stand */ } else s.ducked = wantDuck;
  const height = s.ducked ? MOVE.duckHeight : MOVE.height;
  let [wx, wz] = input.wish || [0, 0]; const wl = Math.hypot(wx, wz); if (wl > 1e-6) { wx /= wl; wz /= wl; } else wx = wz = 0;
  let wishspeed = wl > 1e-6 ? maxSpeed(input.weapon, input.scoped) : 0;
  if (s.ducked && s.onGround) wishspeed *= MOVE.duck; else if (input.walk) wishspeed *= MOVE.walk;
  if (s.stamina > 0 && s.onGround) wishspeed *= (100 - s.stamina) / 100;
  if (s.onGround && input.jump) {
    s.vy = MOVE.jump; s.onGround = false; s.stamina = Math.min(STAMINA.max, s.stamina + STAMINA.jump);
  }
  if (s.onGround) {
    // Friction, then acceleration toward the wished direction (counter-strafing stops you in a few ticks).
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > 0) { const drop = Math.max(sp, MOVE.stopspeed) * MOVE.friction * dt, k = Math.max(0, sp - drop) / sp; s.vx *= k; s.vz *= k; }
    accelerate(s, wx, wz, wishspeed, MOVE.accelerate, dt);
  } else {
    accelerate(s, wx, wz, wishspeed, MOVE.airaccelerate, dt, MOVE.aircap);
    s.vy -= MOVE.gravity * dt;
  }
  // Horizontal move per axis (slide along walls), stepping up onto low boxes.
  const dx = s.vx * dt, dz = s.vz * dt;
  if (!blocked(boxes, bounds, s.x + dx, s.z, s.y, height)) s.x += dx; else s.vx = 0;
  if (!blocked(boxes, bounds, s.x, s.z + dz, s.y, height)) s.z += dz; else s.vz = 0;
  // Vertical: fall / rise, land on the highest surface below, bump the head on ceilings.
  const ground = groundAt(boxes, s.x, s.z, s.y);
  if (s.onGround) { if (s.y - ground > MOVE.step) s.onGround = false; else s.y = ground; }
  if (!s.onGround) {
    const ny = s.y + s.vy * dt;
    if (s.vy > 0 && boxes.some(b => b.y0 >= s.y + height && b.y0 < ny + height && s.x > b.minX - MOVE.radius && s.x < b.maxX + MOVE.radius && s.z > b.minZ - MOVE.radius && s.z < b.maxZ + MOVE.radius)) s.vy = 0;
    else s.y = ny;
    const g = groundAt(boxes, s.x, s.z, Math.max(s.y, ground));
    if (s.vy <= 0 && s.y <= g) { s.y = g; s.vy = 0; s.onGround = true; s.landed = 1; s.stamina = Math.min(STAMINA.max, s.stamina + STAMINA.land); }
  }
  return s;
}
// Shot inaccuracy from movement (CS2: accurate up to 34% of the gun's max speed, then rising; very wide in the air).
export function moveSpread(s, weapon, scoped = false) {
  if (!s) return 1;
  if (!s.onGround) return 6;
  const f = Math.hypot(s.vx, s.vz) / maxSpeed(weapon, scoped);
  return 1 + Math.max(0, (f - .34) / .66) * 4 * (weapon === 'sniper' ? 2 : 1) - (s.ducked ? .25 : 0);
}
