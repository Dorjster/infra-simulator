// Global Defensive · physical death ragdolls, CS2's way (v53 Addendum 3).
//
// WHAT WAS THERE (52.0.5 / v53 stages 1-3, recorded before this module): a dying CS2 agent was turned about its feet as
// one stiff piece (cs2-agents.js: fallG.rotation.x = −deathFall(t)·π/2 — phys-smooth.js, a tabulated 0.5 s topple with a
// small rebound), the built-in soldiers the same with an exponential ease (gd-soldiers.js), the gun kept in the hand,
// nothing pushed by the shot, through walls and over ledges as it fell.
//
// NOW: the body becomes a ragdoll of linked rigid parts, as CS2's agents do.
//   · CS2's own ragdoll when imported (tools/import-cs2-ragdoll.mjs → user-assets/ragdoll/cs2-ragdoll.json: the PHYS
//     block of agents/models/ctm_sas and tm_phoenix — 15 bodies on the bones pelvis, spine_2, head_0, upper / lower arms
//     and legs, hands, ankles, with CS2's masses (kg), capsules / spheres, linear / angular damping and 14 joints: the
//     knees hinges (type 3), the rest cone joints (type 4) with CS2's swing and twist limits and frames). The limits'
//     axis is read as the joint frame's z — the axis the knees' hinge turns about, lateral in CS2's bone frames (the
//     foot's capsule lies in its x-y plane): "twist" = the bend about z (the knee 0…110°, the spine −5…33°, the hip −73…35°),
//     "swing" = how far z may tilt off (a cone). The file names the numbers, not their axes: this reading is ours, chosen
//     because it is the one that makes every joint human (an elbow bends one way, a spine bends forward more than back).
//   · Without the import (or on the built-in soldiers): our own ragdoll on the same rules — FALLBACK_CS2 (the same 15
//     bones, human limits, our masses) and SOLDIER (the shipped soldier's 8 parts: torso, head, upper arms, forearms, legs).
// Physics: XPBD rigid bodies (Müller et al. 2020, "Detailed Rigid Body Simulation with Extended Position Based
// Dynamics"): positions + orientations, joints as positional attachments plus angular limits, contacts as positional
// constraints with static friction, velocities from the positions; fixed 1/64 s steps (CS2's tick) in SUB substeps.
// World: the map's surfaces — a CS2 map's own triangles (its grenade collision, nade-mesh.js: walls, stairs, slopes,
// props, ladders as they are) plus its doors and breakables (the movers' boxes as they stand), else the built-in maps'
// boxes and ground; a sample never ends a step across a surface (each moving sample's step is swept, and undone if it
// crossed). Living players are not collided with (CS2). Gravity: CS2's sv_gravity 800 HU/s².
// Forces (seeded from the host's kill record — lan/combat state down[victim]: rg = the killing hit's point and
// direction, z = its hit group — so every computer pushes the same way): the hit bone (head / chest / stomach / leg)
// takes an impulse along the bullet, Source's bullet impulse (BULLET_IMPULSE, our number: CS2's files hold no force)
// scaled by the weapon's own damage (weapons-data.js dmg: CS2's m_nDamage); a headshot pushes the head (12 kg) — it
// snaps back; an HE or C4 blast pushes every part away from the blast point (the host's grenade record), less with
// distance; fire and falls push nothing; the body keeps the speed it had when it died (its momentum).
// Rest: a ragdoll whose parts all move slower than SLEEP_V for SLEEP_S sleeps — it stops, its pose stays (no creep, no
// jitter); it is never simulated past MAX_S. CAP active at once (Low presets: CAP_LOW, sooner to sleep); a newer death
// past the cap puts the slowest SETTLING one (every part under 4 × SLEEP_V: only a tremble left) to sleep, or — none
// settling, all still falling — falls the old way (r2 fix: it used to freeze the oldest one older than 1.5 s, which on
// Low was still falling 39 times in 40, up to 75 HU short of where it would have lain).
// (r2 fix) ONE SOLVER ON EVERY PRESET: the same fixed step and SUB substeps everywhere (Low had 4: there a part ended
// 0.68 of its radius inside an Inferno wall, a Mirage body slid through a gap, and Low and High computers drew the same
// death up to 17 HU apart). "Simpler on Low" is fewer bodies (CAP_LOW) and sooner to sleep (SLEEP_S_LOW), not a looser
// solver. SUB_LOW is kept as a name, equal to SUB.
// (r2 fix) UNDER THE MAP: a converted CS2 map's triangles can have a gap (Mirage: a floorless strip ~3 × 9 u near game
// (−81.6, −913)); CS2's own maps are sealed. The map's lowest surface (nadeMesh.minY) is a floor for ragdolls: a body that
// finds a gap stops there instead of falling for MAX_S.
//
// STATE MACHINE (one ragdoll): FREE (in the pool) --start(): the owner died, its nodes' pose read--> ACTIVE (stepped by
// host time since the death: the same number of steps on every computer; ragdollFrame() once a frame, every step it is
// due — up to MAX_STEPS_FRAME a frame — whatever the frame rate) [--started behind by more than MAX_STEPS_FRAME (first
// seen late: joined late, revealed from a smoke)--> CATCHING (not drawn; the catching bodies share FRAME_BUDGET steps a
// frame, at most CATCH_STEPS each) --caught up--> ACTIVE] --slow for SLEEP_S / MAX_S (forced) / cap--> ASLEEP (the pose kept and written once more,
// nothing stepped or re-posed; the owner keeps it) --the owner back alive (next round, respawn) / dispose--> FREE.
// ALIKE ON EVERY COMPUTER, HONESTLY: the forces, the hit bone, the clock and the steps come from the host's record, so
// the push is the same everywhere; the START pose is each computer's own drawn pose at the death (its interpolated
// place, its clip's phase, its interpolated speed), so on stairs and ledges the final poses can differ a little.
// COST: every array is made when a rig is made (at load, with the agent or soldier) — nothing per frame; no new mesh,
// material or shader (the body's own skinned mesh is posed), so nothing compiles during a round. warmRagdolls() runs a
// fall at load behind the loading card so the first death of a round is not the JIT's first — (r2 fix) with every kind
// of ragdoll the match can show (CS2's from the import, ours, the soldier's: one throwaway simulation each, in its bind
// pose) on the match's own map world: the first CS2 death on Dust II cost 13–43 ms in its frame before; a kind first
// seen later (a soldier made mid-match) is warmed when its first rig is made, not at its first death.
// A frame's ragdoll cost (r2): the due steps of every active body (≈ 0.2–0.3 ms a step on a CS2 map on this Mac): 10
// falling at 30 fps ≈ 21 steps; the Low presets' cap of 4 keeps that to ~9.
import { weaponById } from './weapons-data.js';
import { boxesNear } from './box-grid.js';

const HU = 2.54 / 16.5;                       // Hammer unit in game units
export const GRAVITY = 800 * HU;              // CS2's sv_gravity (HU/s²) in game units
export const STEP = 1 / 64, SUB = 8, SUB_LOW = SUB;   // fixed steps of CS2's 64 Hz tick, each in SUB substeps (every preset: see the top)
export const CAP = 10, CAP_LOW = 4;           // active ragdolls (spec: 10; Low / Very Low presets fewer)
export const SLEEP_V = .8, SLEEP_S = .5, SLEEP_S_LOW = .3, MAX_S = 8;   // u/s (13 cm/s: every part slower than this — the solver's own tremble is ~0.2 mm a step), s (ours; Bullet's own default sleeps under 0.8 m/s)
export const SETTLE_SLOW_S = 1.5;            // s under 4 × SLEEP_V (3.2 u/s): asleep (ours)
export const MAX_STEPS_FRAME = 8;             // a body following the clock takes at most 8 steps in a frame (125 ms: a long frame's catch-up)
export const FRAME_BUDGET = 16, CATCH_STEPS = 4;   // catch-up steps per frame for ALL catching ragdolls together, and at most CATCH_STEPS each: a body
// first seen long after its death (joined late, revealed from a smoke) catches up over several frames, hidden while it
// does (rig.catching), instead of 320 steps in one frame. (r2 fix: the budget no longer limits bodies following the clock
// — at 30 fps ten falling bodies want ~21 steps a frame; capped at 16 they fell behind, went "catching" and vanished for
// seconds.)
export const BULLET_IMPULSE = 2400 * HU;      // kg·u/s for 36 damage (Source's 7.62 mm ammo impulse, 2400 kg·HU/s — from memory, not in CS2's files), × the weapon's damage / 36
export const BLAST_SPEED = { he: 240 * HU, c4: 500 * HU };   // u/s given to every part at the blast point, falling off to 0 at its radius (ours)
export const FRICTION = .8;                   // contact friction against the map (ours: CS2's surface props hold friction per material; not read here)
const JOINT_FRICTION = 6;
export const DEPEN_V = 6;                     // u/s (≈ 1 m/s): the fastest a part already inside a surface is pushed out of it (ours; PhysX's and Bullet's "max depenetration velocity" idea)
const REST_LIN = 2, REST_ANG = 6;             // 1/s: extra damping on a part touching the world (ours)                     // 1/s per unit of CS2's m_flFriction: relative spin across a joint damped (our reading of the field)
const MAXB = 16, MAXJ = 16, MAXS = 48;        // bodies, joints, collision samples per ragdoll

// ── Our own ragdolls (no Valve data) ────────────────────────────────────────────────────────────────────────────────
// FALLBACK_CS2: CS2's 15 simulated bones with our own human numbers — masses (kg), capsule radii (HU) and limits (rad);
// the capsules and joint frames are measured from the agent's own skeleton when the rig is made (fallbackDef).
export const FALLBACK_CS2 = {
  bones: { pelvis: [14, 6.5], spine_2: [20, 6.5], head_0: [5, 4.6], arm_upper_l: [2.2, 2.8], arm_lower_l: [1.6, 2.4], hand_l: [.5, 2], arm_upper_r: [2.2, 2.8], arm_lower_r: [1.6, 2.4], hand_r: [.5, 2], leg_upper_l: [8, 3.8], leg_lower_l: [4, 3.2], ankle_l: [1.2, 2], leg_upper_r: [8, 3.8], leg_lower_r: [4, 3.2], ankle_r: [1.2, 2] },
  // [parent, child, hinge?, swing, bendMin, bendMax] — the bend measured positive the way the joint bends (knees back, elbows forward)
  joints: [['pelvis', 'spine_2', 0, .25, -.15, .6], ['spine_2', 'head_0', 0, .45, -.6, .7], ['spine_2', 'arm_upper_l', 0, 1.1, -.6, 1.4], ['arm_upper_l', 'arm_lower_l', 1, 0, 0, 2.3], ['arm_lower_l', 'hand_l', 0, .3, -.7, .7],
    ['spine_2', 'arm_upper_r', 0, 1.1, -.6, 1.4], ['arm_upper_r', 'arm_lower_r', 1, 0, 0, 2.3], ['arm_lower_r', 'hand_r', 0, .3, -.7, .7], ['pelvis', 'leg_upper_l', 0, .45, -.4, 1.5], ['leg_upper_l', 'leg_lower_l', 1, 0, 0, 2.2],
    ['leg_lower_l', 'ankle_l', 0, .15, -.4, .5], ['pelvis', 'leg_upper_r', 0, .45, -.4, 1.5], ['leg_upper_r', 'leg_lower_r', 1, 0, 0, 2.2], ['leg_lower_r', 'ankle_r', 0, .15, -.4, .5]],
  ends: { pelvis: 'spine_1', spine_2: 'neck_0', head_0: null, arm_upper_l: 'arm_lower_l', arm_lower_l: 'hand_l', hand_l: null, arm_upper_r: 'arm_lower_r', arm_lower_r: 'hand_r', hand_r: null, leg_upper_l: 'leg_lower_l', leg_lower_l: 'ankle_l', ankle_l: null, leg_upper_r: 'leg_lower_r', leg_lower_r: 'ankle_r', ankle_r: null },
  // which way each limb's bend is positive, in the body's own facing (model +z forward): the child's far end moves back (knees, the head down…) or forward
  bendFwd: { 'leg_upper_l>leg_lower_l': -1, 'leg_upper_r>leg_lower_r': -1, 'arm_upper_l>arm_lower_l': 1, 'arm_upper_r>arm_lower_r': 1, 'pelvis>spine_2': 1, 'spine_2>head_0': 1, 'pelvis>leg_upper_l': 1, 'pelvis>leg_upper_r': 1, 'spine_2>arm_upper_l': 1, 'spine_2>arm_upper_r': 1, 'arm_lower_l>hand_l': 1, 'arm_lower_r>hand_r': 1, 'leg_lower_l>ankle_l': 1, 'leg_lower_r>ankle_r': 1 },
};
// SOLDIER: the shipped soldier (avatar.js parts, game units, y up, facing +z): bodies on its pivots, shapes in each
// pivot's own frame; every joint bends about the pivot's x (lateral) — the frames turn x into the joints' z.
const QX = [0, Math.SQRT1_2, 0, Math.SQRT1_2];   // turns z into x
export const SOLDIER = {
  units: 'node', bodies: [
    { part: 'torso', mass: 30, shape: { a: [0, .5, 0], b: [0, 3.2, 0], r: 1.55 } },
    { part: 'head', mass: 5, shape: { a: [0, 2, 0], b: [0, 2, 0], r: 2.25 } },
    { part: 'armL', mass: 3, shape: { a: [0, -.1, 0], b: [0, -1.1, 0], r: .55 } }, { part: 'elbowL', mass: 2.5, shape: { a: [0, -.2, 0], b: [0, -1.45, .04], r: .6 } },
    { part: 'armR', mass: 3, shape: { a: [0, -.1, 0], b: [0, -1.1, 0], r: .55 } }, { part: 'elbowR', mass: 2.5, shape: { a: [0, -.2, 0], b: [0, -1.45, .04], r: .6 } },
    { part: 'legL', mass: 12, shape: { a: [0, -.3, 0], b: [0, -1.8, .25], r: .55 } }, { part: 'legR', mass: 12, shape: { a: [0, -.3, 0], b: [0, -1.8, .25], r: .55 } }],
  // a, b: parent / child body; at: the child's pivot in the parent's frame (filled from the nodes at rest); bend about x (rad, negative = forward)
  joints: [{ a: 0, b: 1, swing: .45, twist: [-.6, .7] }, { a: 0, b: 2, swing: 1, twist: [-2.6, .7] }, { a: 2, b: 3, hinge: 1, twist: [-2.4, 0] }, { a: 0, b: 4, swing: 1, twist: [-2.6, .7] }, { a: 4, b: 5, hinge: 1, twist: [-2.4, 0] },
    { a: 0, b: 6, swing: .5, twist: [-1.6, .45] }, { a: 0, b: 7, swing: .5, twist: [-1.6, .45] }],
};

// ── small vector / quaternion helpers on typed arrays (no allocation) ──
// NO DOUBLE CROSSES A CALL in the solver (FINISH pass, measured): V8 passes and returns numbers between functions it does
// not inline as boxed HeapNumbers — ~100 KB of short-lived garbage a step before. So every helper reads its vectors from
// typed arrays at integer offsets and writes its results into them; scalars go through small Float64Array registers.
const T3 = new Float64Array(3), T3b = new Float64Array(3), T3c = new Float64Array(3), T4 = new Float64Array(4), T4b = new Float64Array(4);
const EX = Float64Array.of(1, 0, 0), EZ = Float64Array.of(0, 0, 1);
function rot(q, qo, v, vo, out, oo) {   // out = q · v (q at q[qo…qo+3], x y z w; v at v[vo…vo+2])
  const x = v[vo], y = v[vo + 1], z = v[vo + 2], qx = q[qo], qy = q[qo + 1], qz = q[qo + 2], qw = q[qo + 3], tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[oo] = x + qw * tx + (qy * tz - qz * ty); out[oo + 1] = y + qw * ty + (qz * tx - qx * tz); out[oo + 2] = z + qw * tz + (qx * ty - qy * tx); }
function rotInv(q, qo, v, vo, out, oo) { const x = v[vo], y = v[vo + 1], z = v[vo + 2], qx = -q[qo], qy = -q[qo + 1], qz = -q[qo + 2], qw = q[qo + 3], tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[oo] = x + qw * tx + (qy * tz - qz * ty); out[oo + 1] = y + qw * ty + (qz * tx - qx * tz); out[oo + 2] = z + qw * tz + (qx * ty - qy * tx); }
function qmul(a, ao, b, bo, out, oo) {   // out = a ⊗ b
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3], bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[oo] = aw * bx + ax * bw + ay * bz - az * by; out[oo + 1] = aw * by - ax * bz + ay * bw + az * bx; out[oo + 2] = aw * bz + ax * by - ay * bx + az * bw; out[oo + 3] = aw * bw - ax * bx - ay * by - az * bz; }
function qnorm(q, o) { const l = Math.sqrt(q[o] * q[o] + (q[o + 1]) * (q[o + 1]) + (q[o + 2]) * (q[o + 2]) + (q[o + 3]) * (q[o + 3])) || 1; q[o] /= l; q[o + 1] /= l; q[o + 2] /= l; q[o + 3] /= l; }

// ── the world a ragdoll lies in ──
// mapWorld(boxes, bounds): contact(x, y, z, r, out) → the nearest surface within r (out: its way out nx ny nz and how
// far in), blocked(a → b) → does the segment cross a surface. CS2 maps: their triangles + the movers' boxes; built-in
// maps: the boxes (walkable ones too) and the ground at 0. One world per boxes object (cached), nothing made per call.
const WORLDS = new WeakMap();
export function mapWorld(boxes, bounds = null) {
  if (!boxes) return FLAT; let w = WORLDS.get(boxes); if (w && w.bounds === bounds) return w;
  const NM = boxes.nadeMesh || null, near = [], CT = new Float64Array(4), FLOOR = Float64Array.of(NM && Number.isFinite(NM.minY) ? NM.minY : -Infinity);   // (FLOOR: the map's lowest surface — r2: a floor for a body that finds a gap)
  // (registers: the ball asked about x y z r, the segment ax ay az bx by bz, the best depth so far — no number crosses a call)
  const PB = new Float64Array(4), SB = new Float64Array(6), BEST = new Float64Array(1);
  const boxContact = (list, out) => { const x = PB[0], y = PB[1], z = PB[2], r = PB[3]; let best = BEST[0];
    for (let i = 0; i < list.length; i++) { const b = list[i]; if (b.off || b.mat === 'clip' || x < b.minX - r || x > b.maxX + r || z < b.minZ - r || z > b.maxZ + r || y < b.y0 - r || y > b.y1 + r) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x, cy = y < b.y0 ? b.y0 : y > b.y1 ? b.y1 : y, cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z; let dx = x - cx, dy = y - cy, dz = z - cz, d = Math.sqrt(dx * dx + dy * dy + dz * dz), depth;
      if (d > 1e-9) { if (d >= r) continue; dx /= d; dy /= d; dz /= d; depth = r - d; }
      else { const p0 = x - b.minX, p1 = b.maxX - x, p2 = y - b.y0, p3 = b.y1 - y, p4 = z - b.minZ, p5 = b.maxZ - z; let k = 3, m = p3; if (p0 < m) { m = p0; k = 0; } if (p1 < m) { m = p1; k = 1; } if (p2 < m) { m = p2; k = 2; } if (p4 < m) { m = p4; k = 4; } if (p5 < m) { m = p5; k = 5; }
        dx = k === 0 ? -1 : k === 1 ? 1 : 0; dy = k === 2 ? -1 : k === 3 ? 1 : 0; dz = k === 4 ? -1 : k === 5 ? 1 : 0; depth = r + m; }
      if (depth > best) { best = depth; out[0] = dx; out[1] = dy; out[2] = dz; out[3] = depth; } } BEST[0] = best; };
  function contactAt(out) {
    const x = PB[0], y = PB[1], z = PB[2], r = PB[3]; BEST[0] = 0;
    if (NM) { if ((NM.contactV ? NM.contactV(PB, CT) : NM.contact(x, y, z, r, CT)) && CT[3] > BEST[0]) { BEST[0] = CT[3]; out[0] = CT[0]; out[1] = CT[1]; out[2] = CT[2]; out[3] = CT[3]; } boxContact(boxes.movers || NONE, out);
      if (FLOOR[0] + r - y > BEST[0]) { BEST[0] = FLOOR[0] + r - y; out[0] = 0; out[1] = 1; out[2] = 0; out[3] = BEST[0]; } }
    else { boxContact(boxesNear(boxes, x - r, z - r, x + r, z + r, near), out); if (r - y > BEST[0]) { BEST[0] = r - y; out[0] = 0; out[1] = 1; out[2] = 0; out[3] = BEST[0]; } }
    if (bounds) { const e0 = x - r - bounds.minX, e1 = bounds.maxX - x - r, e2 = z - r - bounds.minZ, e3 = bounds.maxZ - z - r, m = Math.min(e0, e1, e2, e3); if (-m > BEST[0]) { BEST[0] = -m; out[0] = m === e0 ? 1 : m === e1 ? -1 : 0; out[1] = 0; out[2] = m === e2 ? 1 : m === e3 ? -1 : 0; out[3] = BEST[0]; } }
    return BEST[0] > 0; }
  function blockedAt() {
    const ax = SB[0], ay = SB[1], az = SB[2], bx = SB[3], by = SB[4], bz = SB[5];
    if (NM) { if (NM.blockedV ? NM.blockedV(SB) : NM.blocked(ax, ay, az, bx, by, bz)) return true; if (by < FLOOR[0] && ay >= FLOOR[0]) return true; } else if (by < 0 && ay >= 0) return true;
    const L = NM ? (boxes.movers || NONE) : boxesNear(boxes, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), near);
    // a box the segment enters (from outside: a body already inside one — a door shut on it — may leave): the slab test
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (let i = 0; i < L.length; i++) { const b = L[i]; if (b.off || b.mat === 'clip') continue; if (ax > b.minX && ax < b.maxX && ay > b.y0 && ay < b.y1 && az > b.minZ && az < b.maxZ) continue;
      let t0 = 0, t1 = 1; for (let c = 0; c < 3 && t0 <= t1; c++) { const o = c === 0 ? ax : c === 1 ? ay : az, d = c === 0 ? dx : c === 1 ? dy : dz, lo = c === 0 ? b.minX : c === 1 ? b.y0 : b.minZ, hi = c === 0 ? b.maxX : c === 1 ? b.y1 : b.maxZ;
        if (Math.abs(d) < 1e-12) { if (o <= lo || o >= hi) t1 = -1; } else { let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; } }
      if (t0 < t1) return true; }
    return false; }
  w = { bounds, mesh: !!NM,
    contact(x, y, z, r, out) { PB[0] = x; PB[1] = y; PB[2] = z; PB[3] = r; return contactAt(out); },
    blocked(ax, ay, az, bx, by, bz) { SB[0] = ax; SB[1] = ay; SB[2] = az; SB[3] = bx; SB[4] = by; SB[5] = bz; return blockedAt(); },
    // the same with the ball as P = [x, y, z, r] and the segment as S = [ax, ay, az, bx, by, bz] (the solver: nothing boxed)
    contactV(P, out) { PB[0] = P[0]; PB[1] = P[1]; PB[2] = P[2]; PB[3] = P[3]; return contactAt(out); },
    blockedV(S) { SB[0] = S[0]; SB[1] = S[1]; SB[2] = S[2]; SB[3] = S[3]; SB[4] = S[4]; SB[5] = S[5]; return blockedAt(); } };
  WORLDS.set(boxes, w); return w;
}
const NONE = [];
export const FLAT = { mesh: false, bounds: null, contact(x, y, z, r, out) { if (y >= r) return false; out[0] = 0; out[1] = 1; out[2] = 0; out[3] = r - y; return true; }, blocked(ax, ay, az, bx, by, bz) { return ay >= 0 && by < 0; },
  contactV(P, out) { const y = P[1], r = P[3]; if (y >= r) return false; out[0] = 0; out[1] = 1; out[2] = 0; out[3] = r - y; return true; }, blockedV(S) { return S[1] >= 0 && S[4] < 0; } };

// ── one ragdoll's simulation (pure: plain arrays, no THREE) ──
// def (resolved, world units): bodies [{ mass, invI: [3] (local), samples: [[x, y, z, r]…] (from the centre of mass),
// linDamp, angDamp }], joints [{ a, b, ra, rb (anchors from each centre, local), qa, qb (frames, local), hinge, swing,
// tmin, tmax, fric }]. sim.X / Q / V / W: centres, orientations, velocities.
export function createSim(def) {
  const NB = def.bodies.length, NJ = def.joints.length; if (NB > MAXB || NJ > MAXJ) throw Error('ragdoll too big');
  const X = new Float64Array(NB * 3), Q = new Float64Array(NB * 4), V = new Float64Array(NB * 3), W = new Float64Array(NB * 3), Xp = new Float64Array(NB * 3), Qp = new Float64Array(NB * 4), Xs = new Float64Array(NB * 3), Qs = new Float64Array(NB * 4);
  const invM = new Float64Array(NB), invI = new Float64Array(NB * 3), lin = new Float64Array(NB), ang = new Float64Array(NB);
  const S = [], SB = []; def.bodies.forEach((b, i) => { invM[i] = 1 / b.mass; invI.set(b.invI, i * 3); lin[i] = b.linDamp || 0; ang[i] = b.angDamp || 0; for (const s of b.samples) { S.push(s); SB.push(i); } });
  const NS = S.length; if (NS > MAXS) throw Error('ragdoll samples');
  // each sample twice: slot s its nearest surface this step, slot s + NS a second one met once pushed off the first (a
  // floor and a wall, a stair's tread and riser — one plane alone let a part rock between them)
  const NS2 = NS * 2, SX = new Float64Array(NS2 * 4); S.forEach((s, k) => { SX.set(s, k * 4); SX.set(s, (k + NS) * 4); }); const SBI = Int32Array.from([...SB, ...SB]);
  const PN = new Float64Array(NS2 * 4), PQ = new Float64Array(NS2 * 3), PON = new Uint8Array(NS2), PL = new Float64Array(NS2);   // per sample per step: plane normal, the surface point, on, the normal push this substep
  const J = def.joints, JA = Int32Array.from(J.map(j => j.a)), JB = Int32Array.from(J.map(j => j.b)), JRA = new Float64Array(NJ * 3), JRB = new Float64Array(NJ * 3), JQA = new Float64Array(NJ * 4), JQB = new Float64Array(NJ * 4);
  const JH = Uint8Array.from(J.map(j => j.hinge ? 1 : 0)), JSW = Float64Array.from(J.map(j => j.swing ?? Math.PI)), JT0 = Float64Array.from(J.map(j => j.tmin ?? -Math.PI)), JT1 = Float64Array.from(J.map(j => j.tmax ?? Math.PI)), JF = Float64Array.from(J.map(j => j.fric || 0));
  J.forEach((j, k) => { JRA.set(j.ra, k * 3); JRB.set(j.rb, k * 3); JQA.set(j.qa, k * 4); JQB.set(j.qb, k * 4); });
  const C4 = new Float64Array(4), WA = new Float64Array(3), WB = new Float64Array(3), TOUCH = new Uint8Array(NB), LEV = new Float64Array(NB);
  for (let k = 0; k < NS; k++) { const i = SBI[k], o = k * 4; LEV[i] = Math.max(LEV[i], Math.hypot(SX[o], SX[o + 1], SX[o + 2]) + SX[o + 3]); }   // (each part's reach from its centre: its turn counted as the speed of its far end)
  const IN = new Float64Array(3), SPV = new Float64Array(3), PV = new Float64Array(3), NV = new Float64Array(3), DV = new Float64Array(3), RET = new Float64Array(2), HS = new Float64Array(1), P4 = new Float64Array(4), S6 = new Float64Array(6);   // (the registers: no double crosses a call)
  const sim = { NB, NJ, NS, X, Q, V, W, steps: 0, still: 0, slowT: 0, asleep: false, forced: false, sub: SUB, sleepS: SLEEP_S, contacts: 0, speed: 0, freed: 0, checked: false };
  // (r2 fix) A part that STARTS on the far side of a surface from the body's root (the pelvis / torso) — a hand through a
  // thin wall or door the living player stood against — is not held by the world until it is back on the root's side:
  // before, every step that pulled it back crossed the wall and was undone, so it stayed pinned 0.68 of its radius in
  // the wall and kept the whole body trembling until the time limit (Inferno, a sweep's seed 23). FREE[s]: that sample.
  const ROOT = def.root | 0, FREE = new Uint8Array(NS);
  // inverse inertia (world) times v (at v[vo]), for body i, into out
  function iw(i, v, vo, out) { rotInv(Q, i * 4, v, vo, T3c, 0); T3c[0] *= invI[i * 3]; T3c[1] *= invI[i * 3 + 1]; T3c[2] *= invI[i * 3 + 2]; rot(Q, i * 4, T3c, 0, out, 0); }
  // a rotation by the rotation vector SPV on body i (q += ½ ω ⊗ q)
  function spin(i) { const o = i * 4, x = SPV[0], y = SPV[1], z = SPV[2], qx = Q[o], qy = Q[o + 1], qz = Q[o + 2], qw = Q[o + 3];
    Q[o] += .5 * (x * qw + y * qz - z * qy); Q[o + 1] += .5 * (-x * qz + y * qw + z * qx); Q[o + 2] += .5 * (x * qy - y * qx + z * qw); Q[o + 3] += .5 * (-x * qx - y * qy - z * qz); qnorm(Q, o); }
  // generalized inverse mass of body i at world offset r (r[ro]) along unit n (n[no]), into RET[0]
  function wPos(i, r, ro, n, no) { const rx = r[ro], ry = r[ro + 1], rz = r[ro + 2], nx = n[no], ny = n[no + 1], nz = n[no + 2], cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx; IN[0] = cx; IN[1] = cy; IN[2] = cz; iw(i, IN, 0, T3b); RET[0] = invM[i] + cx * T3b[0] + cy * T3b[1] + cz * T3b[2]; }
  function wAng(i, n, no) { iw(i, n, no, T3b); RET[0] = n[no] * T3b[0] + n[no + 1] * T3b[1] + n[no + 2] * T3b[2]; }
  // positional impulse PV (world) on body i at offset r (r[ro]), sign ±1
  function pushPos(i, r, ro, s) { const m = invM[i] * s, o = i * 3, rx = r[ro], ry = r[ro + 1], rz = r[ro + 2], px = PV[0], py = PV[1], pz = PV[2]; X[o] += px * m; X[o + 1] += py * m; X[o + 2] += pz * m; IN[0] = ry * pz - rz * py; IN[1] = rz * px - rx * pz; IN[2] = rx * py - ry * px; iw(i, IN, 0, T3b); SPV[0] = T3b[0] * s; SPV[1] = T3b[1] * s; SPV[2] = T3b[2] * s; spin(i); }
  function pushAng(i, s) { iw(i, PV, 0, T3b); SPV[0] = T3b[0] * s; SPV[1] = T3b[1] * s; SPV[2] = T3b[2] * s; spin(i); }
  // angular correction: turn a by +θ (RET[1]) about unit NV and b by −θ, shared by their inverse inertias
  function angular(a, b) { const th = RET[1]; wAng(a, NV, 0); const wa = RET[0]; wAng(b, NV, 0); const wb = RET[0], w = wa + wb; if (!(w > 1e-12)) return; const l = th / w; PV[0] = NV[0] * l; PV[1] = NV[1] * l; PV[2] = NV[2] * l; pushAng(a, 1); pushAng(b, -1); }
  function solveJoint(k) {
    const a = JA[k], b = JB[k];
    // attach: a's anchor onto b's
    rot(Q, a * 4, JRA, k * 3, WA, 0); rot(Q, b * 4, JRB, k * 3, WB, 0);
    let dx = X[b * 3] + WB[0] - X[a * 3] - WA[0], dy = X[b * 3 + 1] + WB[1] - X[a * 3 + 1] - WA[1], dz = X[b * 3 + 2] + WB[2] - X[a * 3 + 2] - WA[2]; const c = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (c > 1e-9) { dx /= c; dy /= c; dz /= c; DV[0] = dx; DV[1] = dy; DV[2] = dz; wPos(a, WA, 0, DV, 0); const w1 = RET[0]; wPos(b, WB, 0, DV, 0); const w = w1 + RET[0], l = c / w; PV[0] = dx * l; PV[1] = dy * l; PV[2] = dz * l; pushPos(a, WA, 0, 1); PV[0] = dx * l; PV[1] = dy * l; PV[2] = dz * l; pushPos(b, WB, 0, -1); }
    // the joint's frames in the world: their z (the bend axis) and x (the bend's reference)
    qmul(Q, a * 4, JQA, k * 4, T4, 0); qmul(Q, b * 4, JQB, k * 4, T4b, 0);
    rot(T4, 0, EZ, 0, T3, 0); const zax = T3[0], zay = T3[1], zaz = T3[2]; rot(T4b, 0, EZ, 0, T3, 0); const zbx = T3[0], zby = T3[1], zbz = T3[2];
    // swing: z of b within the cone round z of a (a hinge: on it)
    let cx = zay * zbz - zaz * zby, cy = zaz * zbx - zax * zbz, cz = zax * zby - zay * zbx; const sn = Math.sqrt(cx * cx + cy * cy + cz * cz), cs = zax * zbx + zay * zby + zaz * zbz, phi = Math.atan2(sn, cs), lim = JH[k] ? 0 : JSW[k];
    if (phi > lim + 1e-6 && sn > 1e-9) { cx /= sn; cy /= sn; cz /= sn; NV[0] = cx; NV[1] = cy; NV[2] = cz; RET[1] = phi - lim; angular(a, b); }
    // twist (the bend) about the common z: from x of a to x of b, within [tmin, tmax]
    qmul(Q, a * 4, JQA, k * 4, T4, 0); qmul(Q, b * 4, JQB, k * 4, T4b, 0);
    rot(T4, 0, EZ, 0, T3, 0); let nx = T3[0], ny = T3[1], nz = T3[2]; rot(T4b, 0, EZ, 0, T3c, 0); nx += T3c[0]; ny += T3c[1]; nz += T3c[2]; const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); if (nl < 1e-9) return; nx /= nl; ny /= nl; nz /= nl;
    rot(T4, 0, EX, 0, T3, 0); let ax = T3[0], ay = T3[1], az = T3[2]; rot(T4b, 0, EX, 0, T3, 0); let bx = T3[0], by = T3[1], bz = T3[2];
    let d = ax * nx + ay * ny + az * nz; ax -= nx * d; ay -= ny * d; az -= nz * d; d = bx * nx + by * ny + bz * nz; bx -= nx * d; by -= ny * d; bz -= nz * d;
    const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx * bx + by * by + bz * bz); if (la < 1e-9 || lb < 1e-9) return; ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
    const tw = Math.atan2((ay * bz - az * by) * nx + (az * bx - ax * bz) * ny + (ax * by - ay * bx) * nz, ax * bx + ay * by + az * bz);
    const t0 = JT0[k], t1 = JT1[k]; if (tw < t0 - 1e-6) { NV[0] = nx; NV[1] = ny; NV[2] = nz; RET[1] = tw - t0; angular(a, b); } else if (tw > t1 + 1e-6) { NV[0] = nx; NV[1] = ny; NV[2] = nz; RET[1] = tw - t1; angular(a, b); }
  }
  // contacts: each sample against the plane found for it this step
  function solveContacts() {
    for (let s = 0; s < NS2; s++) { PL[s] = 0; if (!PON[s]) continue; const i = SBI[s], o = s * 4; rot(Q, i * 4, SX, o, WA, 0);
      const px = X[i * 3] + WA[0], py = X[i * 3 + 1] + WA[1], pz = X[i * 3 + 2] + WA[2], nx = PN[o], ny = PN[o + 1], nz = PN[o + 2];
      let c = SX[o + 3] - ((px - PQ[s * 3]) * nx + (py - PQ[s * 3 + 1]) * ny + (pz - PQ[s * 3 + 2]) * nz); if (c <= 0) continue;
      // (r2 fix) a part already in the surface when this substep began (a limb back from a wall it started through, a foot
      // in a stair's tread) is pushed out at no more than DEPEN_V — only this substep's own motion into the surface is undone
      // at once: a full push-out became a speed of hundreds of u/s and threw a body 42 u off Dust II's stairs
      { rot(Qp, i * 4, SX, o, WB, 0); const cp = SX[o + 3] - ((Xp[i * 3] + WB[0] - PQ[s * 3]) * nx + (Xp[i * 3 + 1] + WB[1] - PQ[s * 3 + 1]) * ny + (Xp[i * 3 + 2] + WB[2] - PQ[s * 3 + 2]) * nz);
        if (cp > 0) { const lim = c - cp + DEPEN_V * HS[0]; if (c > lim) c = lim; if (c <= 0) continue; } }
      wPos(i, WA, 0, PN, o); const w = RET[0], l = c / w; PV[0] = nx * l; PV[1] = ny * l; PV[2] = nz * l; pushPos(i, WA, 0, 1); PL[s] = c;
      // static friction, at the touching point (the sample's centre less its radius along n — so a lying limb's roll is held
      // too): its slide this substep undone while it is less than μ × the push
      const rr = SX[o + 3]; rot(Qp, i * 4, SX, o, WB, 0); rot(Q, i * 4, SX, o, WA, 0); WA[0] -= nx * rr; WA[1] -= ny * rr; WA[2] -= nz * rr; WB[0] -= nx * rr; WB[1] -= ny * rr; WB[2] -= nz * rr;
      let tx = X[i * 3] + WA[0] - Xp[i * 3] - WB[0], ty = X[i * 3 + 1] + WA[1] - Xp[i * 3 + 1] - WB[1], tz = X[i * 3 + 2] + WA[2] - Xp[i * 3 + 2] - WB[2]; const dn = tx * nx + ty * ny + tz * nz; tx -= nx * dn; ty -= ny * dn; tz -= nz * dn;
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz); if (tl > 1e-9 && tl < FRICTION * c) { tx /= tl; ty /= tl; tz /= tl; DV[0] = tx; DV[1] = ty; DV[2] = tz; wPos(i, WA, 0, DV, 0); const wt = RET[0], lt = tl / wt; PV[0] = tx * lt; PV[1] = ty * lt; PV[2] = tz * lt; pushPos(i, WA, 0, -1); } } }
  function substep() {
    const h = HS[0], gy = GRAVITY;   // (the substep's length: a register, not an argument)
    for (let i = 0; i < NB; i++) { const o = i * 3, q = i * 4; Xp[o] = X[o]; Xp[o + 1] = X[o + 1]; Xp[o + 2] = X[o + 2]; Qp[q] = Q[q]; Qp[q + 1] = Q[q + 1]; Qp[q + 2] = Q[q + 2]; Qp[q + 3] = Q[q + 3];
      V[o + 1] -= gy * h; X[o] += V[o] * h; X[o + 1] += V[o + 1] * h; X[o + 2] += V[o + 2] * h; SPV[0] = W[o] * h; SPV[1] = W[o + 1] * h; SPV[2] = W[o + 2] * h; spin(i); }
    for (let k = 0; k < NJ; k++) solveJoint(k);
    solveContacts();
    for (let i = 0; i < NB; i++) { const o = i * 3, q = i * 4; V[o] = (X[o] - Xp[o]) / h; V[o + 1] = (X[o + 1] - Xp[o + 1]) / h; V[o + 2] = (X[o + 2] - Xp[o + 2]) / h;
      T4[0] = -Qp[q]; T4[1] = -Qp[q + 1]; T4[2] = -Qp[q + 2]; T4[3] = Qp[q + 3]; qmul(Q, q, T4, 0, T4b, 0); const sg = T4b[3] < 0 ? -2 / h : 2 / h; W[o] = T4b[0] * sg; W[o + 1] = T4b[1] * sg; W[o + 2] = T4b[2] * sg;
      const ld = 1 / (1 + lin[i] * h), ad = 1 / (1 + ang[i] * h); V[o] *= ld; V[o + 1] *= ld; V[o + 2] *= ld; W[o] *= ad; W[o + 1] *= ad; W[o + 2] *= ad; }
    // dynamic friction on the samples pushed this substep: their sliding speed taken down by μ × the push speed
    for (let s = 0; s < NS2; s++) { if (!(PL[s] > 0)) continue; const i = SBI[s], o = s * 4, b = i * 3; rot(Q, i * 4, SX, o, WA, 0); const nx = PN[o], ny = PN[o + 1], nz = PN[o + 2], rr = SX[o + 3]; WA[0] -= nx * rr; WA[1] -= ny * rr; WA[2] -= nz * rr;   // (at the touching point)
      let vx = V[b] + W[b + 1] * WA[2] - W[b + 2] * WA[1], vy = V[b + 1] + W[b + 2] * WA[0] - W[b] * WA[2], vz = V[b + 2] + W[b] * WA[1] - W[b + 1] * WA[0]; const vn = vx * nx + vy * ny + vz * nz; vx -= nx * vn; vy -= ny * vn; vz -= nz * vn;
      const vt = Math.sqrt(vx * vx + vy * vy + vz * vz); if (vt < 1e-9) continue; const dv = Math.min(vt, FRICTION * PL[s] / h); vx /= vt; vy /= vt; vz /= vt; DV[0] = vx; DV[1] = vy; DV[2] = vz; wPos(i, WA, 0, DV, 0); const wt = RET[0], l = dv / wt;
      V[b] -= vx * l * invM[i]; V[b + 1] -= vy * l * invM[i]; V[b + 2] -= vz * l * invM[i]; IN[0] = WA[1] * vz - WA[2] * vy; IN[1] = WA[2] * vx - WA[0] * vz; IN[2] = WA[0] * vy - WA[1] * vx; iw(i, IN, 0, T3b); W[b] -= T3b[0] * l; W[b + 1] -= T3b[1] * l; W[b + 2] -= T3b[2] * l; }
    // a part lying on something is slowed more (our rest damping: a heap of limbs at their limits comes to rest instead of creeping)
    for (let s = 0; s < NS2; s++) if (PL[s] > 0) TOUCH[SBI[s]] = 1;
    for (let i = 0; i < NB; i++) { if (!TOUCH[i]) continue; TOUCH[i] = 0; const o = i * 3, ld = 1 / (1 + REST_LIN * h), ad = 1 / (1 + REST_ANG * h); V[o] *= ld; V[o + 1] *= ld; V[o + 2] *= ld; W[o] *= ad; W[o + 1] *= ad; W[o + 2] *= ad; }
    // the joints' own friction (CS2's m_flFriction): the spin across each joint damped
    for (let k = 0; k < NJ; k++) { if (!JF[k]) continue; const a = JA[k] * 3, b = JB[k] * 3, f = Math.min(.5, JF[k] * JOINT_FRICTION * h) * .5;
      const rx = (W[b] - W[a]) * f, ry = (W[b + 1] - W[a + 1]) * f, rz = (W[b + 2] - W[a + 2]) * f; W[a] += rx; W[a + 1] += ry; W[a + 2] += rz; W[b] -= rx; W[b + 1] -= ry; W[b + 2] -= rz; }
  }
  // one fixed step of STEP seconds in sim.sub substeps
  // which samples start (or still are) on the far side of a surface from the root's centre
  function freeCheck(world, all) { const vec = typeof world.blockedV === 'function'; let n = 0; const rx = X[ROOT * 3], ry = X[ROOT * 3 + 1], rz = X[ROOT * 3 + 2];
    for (let s = 0; s < NS; s++) { if (!all && !FREE[s]) continue; const i = SBI[s], o = s * 4; if (i === ROOT) { FREE[s] = 0; continue; } rot(Q, i * 4, SX, o, WA, 0); const px = X[i * 3] + WA[0], py = X[i * 3 + 1] + WA[1], pz = X[i * 3 + 2] + WA[2];
      FREE[s] = (vec ? (S6[0] = rx, S6[1] = ry, S6[2] = rz, S6[3] = px, S6[4] = py, S6[5] = pz, world.blockedV(S6)) : world.blocked(rx, ry, rz, px, py, pz)) ? 1 : 0; n += FREE[s]; } sim.freed = n; }
  sim.isFree = s => FREE[s] === 1;
  // once per death, before its first step (startRagdoll; else the first step itself): ~one segment query per sample —
  // a one-off at the death, not a per-step cost
  sim.freeStart = function (world) { freeCheck(world, true); sim.checked = true; };
  sim.step = function (world) {
    if (sim.asleep) return; if (!sim.checked) sim.freeStart(world); else if (sim.freed) freeCheck(world, false); sim.steps++;
    let fast = 0; for (let i = 0; i < NB; i++) { const o = i * 3, v = Math.sqrt(V[o] * V[o] + (V[o + 1]) * (V[o + 1]) + (V[o + 2]) * (V[o + 2])) + Math.sqrt(W[o] * W[o] + (W[o + 1]) * (W[o + 1]) + (W[o + 2]) * (W[o + 2])) * .5; if (v > fast) fast = v; }
    const margin = fast * STEP * 1.5 + .25, vec = typeof world.contactV === 'function'; sim.contacts = 0;   // (vec: the world takes vectors — mapWorld, FLAT)
    for (let s = 0; s < NS; s++) { const i = SBI[s], o = s * 4; rot(Q, i * 4, SX, o, WA, 0); const px = X[i * 3] + WA[0], py = X[i * 3 + 1] + WA[1], pz = X[i * 3 + 2] + WA[2], r = SX[o + 3] + margin;
      P4[0] = px; P4[1] = py; P4[2] = pz; P4[3] = r; PON[s] = !FREE[s] && (vec ? world.contactV(P4, C4) : world.contact(px, py, pz, r, C4)) ? 1 : 0; PON[s + NS] = 0; if (PON[s]) { sim.contacts++; PN[o] = C4[0]; PN[o + 1] = C4[1]; PN[o + 2] = C4[2]; const back = r - C4[3]; PQ[s * 3] = px - C4[0] * back; PQ[s * 3 + 1] = py - C4[1] * back; PQ[s * 3 + 2] = pz - C4[2] * back;
        // the second surface: from where the first would push it
        const n1x = C4[0], n1y = C4[1], n1z = C4[2], qx = px + n1x * (C4[3] + .02), qy = py + n1y * (C4[3] + .02), qz = pz + n1z * (C4[3] + .02);
        P4[0] = qx; P4[1] = qy; P4[2] = qz; if ((vec ? world.contactV(P4, C4) : world.contact(qx, qy, qz, r, C4)) && C4[0] * n1x + C4[1] * n1y + C4[2] * n1z < .9) { const o2 = (s + NS) * 4, s3 = (s + NS) * 3, b2 = r - C4[3]; PON[s + NS] = 1; PN[o2] = C4[0]; PN[o2 + 1] = C4[1]; PN[o2 + 2] = C4[2]; PQ[s3] = qx - C4[0] * b2; PQ[s3 + 1] = qy - C4[1] * b2; PQ[s3 + 2] = qz - C4[2] * b2; } } }
    Xs.set(X); Qs.set(Q); HS[0] = STEP / sim.sub;
    for (let n = 0; n < sim.sub; n++) substep();
    // swept: a sample whose step crossed a surface takes its body back to where the step began, stopped
    for (let s = 0; s < NS; s++) { if (FREE[s]) continue; const i = SBI[s], o = s * 4; rot(Qs, i * 4, SX, o, WB, 0); rot(Q, i * 4, SX, o, WA, 0);
      const ax = Xs[i * 3] + WB[0], ay = Xs[i * 3 + 1] + WB[1], az = Xs[i * 3 + 2] + WB[2], bx = X[i * 3] + WA[0], by = X[i * 3 + 1] + WA[1], bz = X[i * 3 + 2] + WA[2];
      if (Math.abs(bx - ax) + Math.abs(by - ay) + Math.abs(bz - az) > .02 && (vec ? (S6[0] = ax, S6[1] = ay, S6[2] = az, S6[3] = bx, S6[4] = by, S6[5] = bz, world.blockedV(S6)) : world.blocked(ax, ay, az, bx, by, bz))) { for (let c = 0; c < 3; c++) { X[i * 3 + c] = Xs[i * 3 + c]; V[i * 3 + c] *= -.1; W[i * 3 + c] = 0; } for (let c = 0; c < 4; c++) Q[i * 4 + c] = Qs[i * 4 + c]; } }
    // how fast it really moved this step (the step's displacement — not the substeps' velocities, which carry the solver's own
    // back-and-forth): the fastest part's centre, and its turn × half a metre-ish lever
    let e = 0; for (let i = 0; i < NB; i++) { const o = i * 3, q = i * 4, d = Math.sqrt((X[o] - Xs[o]) * (X[o] - Xs[o]) + (X[o + 1] - Xs[o + 1]) * (X[o + 1] - Xs[o + 1]) + (X[o + 2] - Xs[o + 2]) * (X[o + 2] - Xs[o + 2])), dq = Math.abs(Q[q] * Qs[q] + Q[q + 1] * Qs[q + 1] + Q[q + 2] * Qs[q + 2] + Q[q + 3] * Qs[q + 3]), a = 2 * Math.acos(Math.min(1, dq)), v = (d + a * LEV[i]) / STEP; if (v > e) e = v; }
    // settling: slow (under 4 × SLEEP_V) for a second — a part wedged between surfaces trembling, nothing falling — and it
    // is damped harder each step until it rests (ours: a body never trembles until the time limit)
    sim.slowT = e < SLEEP_V * 4 ? (sim.slowT || 0) + STEP : 0; if (sim.slowT > 1) { const f = .8; for (let i = 0; i < NB * 3; i++) { V[i] *= f; W[i] *= f; } }
    sim.speed = e; sim.still = e < SLEEP_V ? sim.still + STEP : 0;
    if (sim.still >= sim.sleepS || sim.slowT >= SETTLE_SLOW_S) sim.asleep = true;   // (at rest; or slow for 1.5 s: only a tremble left — Bullet's own rule sleeps a body slower than 0.8 m/s for 2 s)
    else if (sim.steps * STEP >= MAX_S - 1e-9) { sim.asleep = true; sim.forced = true; }   // (forced: stopped by the time limit, not at rest — a slide down a steep face, a fall into a hole; the tests count these)
  };
  // the deepest any sample is into the world now (tests: never in a wall or under a floor)
  sim.penetration = function (world) { let m = 0; for (let s = 0; s < NS; s++) { const i = SBI[s], o = s * 4; rot(Q, i * 4, SX, o, WA, 0); if (world.contact(X[i * 3] + WA[0], X[i * 3 + 1] + WA[1], X[i * 3 + 2] + WA[2], SX[o + 3] * .5, C4)) m = Math.max(m, C4[3]); } return m; };
  sim.sampleAt = function (s, out) { const i = SBI[s], o = s * 4; rot(Q, i * 4, SX, o, WA, 0); out[0] = X[i * 3] + WA[0]; out[1] = X[i * 3 + 1] + WA[1]; out[2] = X[i * 3 + 2] + WA[2]; out[3] = SX[o + 3]; return out; };
  sim.sampleBody = s => SBI[s];
  // the forces of a death: momentum (all parts), an impulse J (kg·u/s) along unit d at point p on body hb, a blast
  sim.kick = function (vx, vy, vz) { for (let i = 0; i < NB; i++) { V[i * 3] += vx; V[i * 3 + 1] += vy; V[i * 3 + 2] += vz; } sim.asleep = false; sim.still = 0; };
  sim.impulse = function (hb, px, py, pz, dx, dy, dz, J) { const o = hb * 3; V[o] += dx * J * invM[hb]; V[o + 1] += dy * J * invM[hb]; V[o + 2] += dz * J * invM[hb]; const rx = px - X[o], ry = py - X[o + 1], rz = pz - X[o + 2]; IN[0] = (ry * dz - rz * dy) * J; IN[1] = (rz * dx - rx * dz) * J; IN[2] = (rx * dy - ry * dx) * J; iw(hb, IN, 0, T3b); W[o] += T3b[0]; W[o + 1] += T3b[1]; W[o + 2] += T3b[2]; sim.asleep = false; sim.still = 0; };
  sim.blast = function (bx, by, bz, R, speed) { for (let i = 0; i < NB; i++) { const o = i * 3; let dx = X[o] - bx, dy = X[o + 1] - by + R * .15, dz = X[o + 2] - bz; const d = Math.hypot(dx, dy, dz) || 1, f = Math.max(0, 1 - Math.hypot(X[o] - bx, X[o + 1] - by, X[o + 2] - bz) / R); dx /= d; dy /= d; dz /= d; V[o] += dx * speed * f; V[o + 1] += dy * speed * f; V[o + 2] += dz * speed * f; } sim.asleep = false; sim.still = 0; };
  sim.reset = function () { V.fill(0); W.fill(0); FREE.fill(0); sim.freed = 0; sim.checked = false; sim.steps = 0; sim.still = 0; sim.slowT = 0; sim.asleep = false; sim.forced = false; };
  return sim;
}

// A def resolved into the simulation's bodies and joints (world units: k per def unit) — shared by createRig and the
// warm-up (r2), which builds a throwaway simulation of each kind of ragdoll without nodes.
function resolveDef(def, k) {
  const com = def.bodies.map(b => [(b.shape.a[0] + b.shape.b[0]) / 2, (b.shape.a[1] + b.shape.b[1]) / 2, (b.shape.a[2] + b.shape.b[2]) / 2]);
  const bodies = def.bodies.map((b, i) => { const a = b.shape.a, e = b.shape.b, c = com[i], r = b.shape.r * k, ux = e[0] - a[0], uy = e[1] - a[1], uz = e[2] - a[2], L = Math.hypot(ux, uy, uz) * k;
    // inertia: a solid rod along u (radius r, length L: its diagonal in the body's frame) or a ball, × CS2's inertia scale (7) when given
    const m = b.mass, sc = b.inertia || def.inertiaScale || 1, u2 = ux * ux + uy * uy + uz * uz, ia = .5 * m * r * r, ip = m * (3 * r * r + L * L) / 12;
    const I = L > 0 ? [ux * ux / u2, uy * uy / u2, uz * uz / u2].map(u => (ip * (1 - u) + ia * u) * sc) : [0, 0, 0].map(() => .4 * m * r * r * sc);
    const samples = [[a[0], a[1], a[2]], ...(L > 0 ? [[e[0], e[1], e[2]], [c[0], c[1], c[2]]] : [])].map(p => [(p[0] - c[0]) * k, (p[1] - c[1]) * k, (p[2] - c[2]) * k, r]);
    return { mass: m, invI: I.map(v => 1 / v), samples, linDamp: b.linDamp || 0, angDamp: b.angDamp ?? 2 }; });
  const joints = def.joints.map(j => ({ a: j.a, b: j.b, ra: [0, 1, 2].map(c => (j.f1[c] - com[j.a][c]) * k), rb: [0, 1, 2].map(c => (j.f2[c] - com[j.b][c]) * k), qa: j.f1.slice(3, 7), qb: j.f2.slice(3, 7), hinge: j.type === 'hinge', swing: j.swing ?? Math.PI, tmin: j.twist ? j.twist[0] : -Math.PI, tmax: j.twist ? j.twist[1] : Math.PI, fric: j.fric || 0 }));
  const root = Math.max(0, def.bodies.findIndex(b => /pelvis|torso/.test(b.bone || b.part || '')));   // (r2: the body's root — a part on the far side of a wall from it starts free)
  return { com, bodies, joints, root };
}
// ── a rig: a ragdoll bound to a body's nodes (three.js Object3Ds: CS2 bones or the soldier's pivots) ──
// def: CS2's (units 'hu', bodies on bones) or ours (FALLBACK_CS2 resolved by fallbackDef, SOLDIER on parts). nodeOf(name)
// → the node. order: every node from the root down (parents first) whose pose is written. Reads its scale from the nodes
// once (the agent stands at its true size: the same every time). Nothing allocated after this.
export function createRig(def, nodeOf, order, THREE) {
  const NB = def.bodies.length, nodes = def.bodies.map(b => nodeOf(b.bone || b.part)); if (nodes.some(n => !n)) throw Error('ragdoll: a node is missing (' + def.bodies.filter((b, i) => !nodes[i]).map(b => b.bone || b.part).join(', ') + ')');
  const root = order[0]?.parent || nodes[0].parent; root?.updateWorldMatrix?.(true, true);
  const sv = new THREE.Vector3(), pv = new THREE.Vector3(), qv = new THREE.Quaternion(), M = new THREE.Matrix4(), Mi = new THREE.Matrix4();
  nodes[0].matrixWorld.decompose(pv, qv, sv); const ws = sv.x, k = def.units === 'hu' ? 2.54 / 100 * ws : ws;   // world units per def unit
  const { com, bodies, joints, root: rootI } = resolveDef(def, k);
  const sim = createSim({ bodies, joints, root: rootI }), comW = Float64Array.from(com.flatMap(c => c.map(v => v * k))), drive = new Map(nodes.map((n, i) => [n, i])), seq = order.filter(n => n), di = Int32Array.from(seq.map(n => drive.has(n) ? drive.get(n) : -1));
  noteKind(def, bodies, joints, rootI);   // (r2: this kind of ragdoll warmed on the match's map — once per kind)
  const headI = Math.max(0, def.bodies.findIndex(b => /head/.test(b.bone || b.part)));
  const restL = nodes.map(n => [n.position.clone(), n.quaternion.clone(), n.scale.clone()]), autoL = nodes.map(n => n.matrixAutoUpdate);   // (each driven node's own pose at rest: given back when its owner stands up)
  // (r2 fix) the body lies in the WORLD: its nodes' local matrices are written against their holder's place at the time
  // (ANC: that place); when the holder moves after the death — the player's group still drawn moving toward where the
  // host has the dead player (seen: a bot's group walked 42 u back to its spawn after its death on Dust II's stairs, and
  // its sleeping body went with it) — the pose is written again, so the body stays where it fell.
  const ANC = new Float64Array(16), SUBTREE = def.units === 'node';   // (SUBTREE: the soldier's parts hang off pivots that aren't driven — the hips — whose world matrices are brought up to date with the holder's; a CS2 skeleton's every bone is in order and posed below)
  const rig = { sim, def, nodes, scale: k, head: headI, active: false, moved: false, catching: false, framed: -1, kind: null, t0: 0, key: null, since: 0,
    anchorMoved() { if (!root) return false; root.updateWorldMatrix(true, false); const e = root.matrixWorld.elements; let ch = false; for (let i = 0; i < 16; i++) if (e[i] !== ANC[i]) { ch = true; ANC[i] = e[i]; } return ch; },
    // body index nearest to a world point (the hit bone)
    nearest(x, y, z) { let best = 0, bd = Infinity; for (let i = 0; i < NB; i++) { const d = (sim.X[i * 3] - x) ** 2 + (sim.X[i * 3 + 1] - y) ** 2 + (sim.X[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; },
    // the driven nodes back to their rest pose (the owner's animation takes them on from there)
    restore() { for (let i = 0; i < NB; i++) { nodes[i].position.copy(restL[i][0]); nodes[i].quaternion.copy(restL[i][1]); nodes[i].scale.copy(restL[i][2]); nodes[i].matrixAutoUpdate = autoL[i]; } },
    // read the nodes' pose now into the bodies (the moment of death)
    read() { root?.updateWorldMatrix?.(true, true); for (let i = 0; i < NB; i++) { nodes[i].matrixWorld.decompose(pv, qv, sv); const o = i * 3, q = i * 4; sim.Q[q] = qv.x; sim.Q[q + 1] = qv.y; sim.Q[q + 2] = qv.z; sim.Q[q + 3] = qv.w; qnorm(sim.Q, q); rot(sim.Q, q, comW, i * 3, T3, 0); sim.X[o] = pv.x + T3[0]; sim.X[o + 1] = pv.y + T3[1]; sim.X[o + 2] = pv.z + T3[2]; } sim.reset(); },
    // write the bodies' pose onto the nodes (parents first; the nodes between keep their own local pose)
    write() { root?.updateWorldMatrix?.(true, SUBTREE); if (root) { const e = root.matrixWorld.elements; for (let i = 0; i < 16; i++) ANC[i] = e[i]; }
      for (let n = 0; n < seq.length; n++) { const node = seq[n], i = di[n], par = node.parent;
        if (i >= 0) { const o = i * 3, q = i * 4; rot(sim.Q, q, comW, o, T3, 0); pv.set(sim.X[o] - T3[0], sim.X[o + 1] - T3[1], sim.X[o + 2] - T3[2]); qv.set(sim.Q[q], sim.Q[q + 1], sim.Q[q + 2], sim.Q[q + 3]); sv.setScalar(ws);
          // (its local matrix kept as is, not decomposed into position / quaternion / scale — decompose() calls a function
          // returning a number, which V8 boxes each call; while ragdolled the node's matrix is not rebuilt from them)
          M.compose(pv, qv, sv); if (par) { Mi.copy(par.matrixWorld).invert(); node.matrix.multiplyMatrices(Mi, M); } else node.matrix.copy(M); node.matrixAutoUpdate = false; node.matrixWorld.copy(M); }
        else { node.matrix.compose(node.position, node.quaternion, node.scale); if (par) node.matrixWorld.multiplyMatrices(par.matrixWorld, node.matrix); else node.matrixWorld.copy(node.matrix); } } },
  };
  return rig;
}

// Our CS2-skeleton ragdoll from the agent's own skeleton (no CS2 import): the bodies' capsules from each bone to its
// child's, the joint frames at the child's rest place, the bend's sign from which way the child's end moves.
export function fallbackDef(nodeOf, THREE) {
  const F = FALLBACK_CS2, names = Object.keys(F.bones), M = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const local = (child, parent) => { M.copy(parent.matrixWorld).invert().multiply(child.matrixWorld); M.decompose(p, q, s); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w]; };
  const root = nodeOf('pelvis'); root.parent?.updateWorldMatrix?.(true, true); root.updateWorldMatrix(true, true);
  const toHU = v => v / 0.0254;   // (the skeleton's own units are metres: tools/import-cs2-models.mjs)
  const bodies = names.map(n => { const [mass, r] = F.bones[n], end = F.ends[n] ? nodeOf(F.ends[n]) : null; let b = [0, 0, 0];
    if (end) { const l = local(end, nodeOf(n)); b = [toHU(l[0]), toHU(l[1]), toHU(l[2])]; } else if (/head/.test(n)) b = [5, 0, 0]; else b = [3, 0, 0];
    const a = /head/.test(n) ? [3, 0, 0] : [0, 0, 0]; if (/head/.test(n)) b = [3, 0, 0];
    return { bone: n, mass, shape: { a, b, r }, linDamp: 0, angDamp: 2 }; });
  const joints = F.joints.map(([pa, ch, hinge, swing, t0, t1]) => { const ia = names.indexOf(pa), ib = names.indexOf(ch), l = local(nodeOf(ch), nodeOf(pa)); const f1 = [toHU(l[0]), toHU(l[1]), toHU(l[2]), l[3], l[4], l[5], l[6]];
    // the bend's sign: turn the child about the frame's z by +0.2 rad and see where its far end goes in the model's facing (+z of the root's parent)
    const sign = (() => { const cn = nodeOf(ch), end = F.ends[ch] ? nodeOf(F.ends[ch]) : null; if (!end) return 1; const a0 = new THREE.Vector3(), e0 = new THREE.Vector3(); cn.getWorldPosition(a0); end.getWorldPosition(e0);
      const ax = new THREE.Vector3(0, 0, 1).applyQuaternion(cn.getWorldQuaternion(new THREE.Quaternion())), moved = e0.clone().sub(a0).applyAxisAngle(ax, .2).add(a0), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion((root.parent || root).getWorldQuaternion(new THREE.Quaternion()));
      return Math.sign(moved.sub(e0).dot(fwd) * (F.bendFwd[pa + '>' + ch] || 1)) || 1; })();
    return { type: hinge ? 'hinge' : 'cone', a: ia, b: ib, f1, f2: [0, 0, 0, 0, 0, 0, 1], swing: hinge ? 0 : swing, twist: sign > 0 ? [t0, t1] : [-t1, -t0], fric: .3 }; });
  return { units: 'hu', bodies, joints, inertiaScale: 5, from: 'ours' };   // (a heavier spin, as CS2's own ragdolls take it (×7): small parts settle without jitter)
}
// The soldier's ragdoll def with its joints' places read from its parts at rest (parts: { torso, head, armL, … }).
export function soldierDef(parts) {
  const P = SOLDIER, nodes = P.bodies.map(b => parts[b.part]);
  const joints = P.joints.map(j => { const c = nodes[j.b], pa = nodes[j.a]; let x = c.position.x, y = c.position.y, z = c.position.z;
    if (c.parent !== pa && c.parent === pa.parent) { x -= pa.position.x; y -= pa.position.y; z -= pa.position.z; }   // (a leg hangs off the hips, a sibling of the torso: its place in the torso's frame at rest)
    return { type: j.hinge ? 'hinge' : 'cone', a: j.a, b: j.b, f1: [x, y, z, ...QX], f2: [0, 0, 0, ...QX], swing: j.hinge ? 0 : j.swing, twist: j.twist, fric: .3 }; });
  return { units: 'node', bodies: P.bodies.map(b => ({ part: b.part, mass: b.mass, shape: b.shape, linDamp: 0, angDamp: 2 })), joints, inertiaScale: 3 };
}

// ── the forces of a kill, from the host's record (lan: combat.down[victim]) ──
// dn: { by, wid, head, at, rg: [px, py, pz, dx, dy, dz] (the killing hit's point and direction), z (its hit group) };
// ctx.nades: the host's grenade records (an HE's blast point: the one that went off nearest the body at the death);
// ctx.bomb: where the bomb went off ({ x, y, z }). HE's damage radius 350 HU and C4's 1750 HU (CS2's weapons.vdata
// hegrenade m_flRadius… are not read here: arena-nades.js / arena-defuse.js own them; these only scale the push).
export const HE_R = 350 * HU, C4_R = 1750 * HU;
export function applyKill(rig, dn, vx = 0, vy = 0, vz = 0, ctx = null) {
  const sim = rig.sim; sim.kick(vx, vy, vz);
  const w = dn?.wid, wp = w ? weaponById(w) : null;
  if (Array.isArray(dn?.rg) && dn.rg.length >= 6 && dn.rg.every(Number.isFinite) && wp) {
    const [px, py, pz, dx, dy, dz] = dn.rg, dmg = (wp.dmg || 30) * (wp.pellets || 1), J = BULLET_IMPULSE * dmg / 36;
    const hb = dn.head || dn.z === 'head' ? rig.head : rig.nearest(px, py, pz); sim.impulse(hb, px, py, pz, dx, dy, dz, J); return 'hit';
  }
  if (w === 'he' && ctx?.nades) { let best = null, bd = Infinity; const X = sim.X;
    for (const g of ctx.nades) { if (!g || g.kind !== 'he' || !Number.isFinite(g.x) || (g.phase && g.phase !== 'boom' && g.phase !== 'gone')) continue; const d = Math.hypot(g.x - X[0], g.z - X[2]) + Math.abs((g.firedAt || g.at || 0) - (dn.at || 0)) / 50; if (d < bd) { bd = d; best = g; } }
    if (best) { sim.blast(best.x, best.y, best.z, HE_R, BLAST_SPEED.he); return 'blast'; } }
  if ((dn?.by === 'C4' || w === 'c4') && ctx?.bomb && Number.isFinite(ctx.bomb.x)) { sim.blast(ctx.bomb.x, ctx.bomb.y || 0, ctx.bomb.z, C4_R, BLAST_SPEED.c4); return 'blast'; }
  return 'fall';
}

// ── the pool: who is ragdolled now, the cap, the world, the clock ──
// setRagdollWorld({ world: () => mapWorld(…), quality: () => 'Low' | …, hostNow: () => ms, game: () => G }) once (lab.js).
const ENV = { world: () => FLAT, quality: () => 'High', hostNow: () => Date.now(), game: () => null };
const ACTIVE = [];   // rigs being simulated (≤ cap)
export function setRagdollWorld(env) { Object.assign(ENV, env); }
export const ragdollCap = () => /low/i.test(String(ENV.quality() || '')) ? CAP_LOW : CAP;
export const activeRagdolls = () => ACTIVE.length;
// Start the rig's ragdoll for a death (dn: the host's down record; at: when, host ms; v: the body's speed then).
// Returns false when it can't (over the cap with nobody settled): the caller falls the old way.
export function startRagdoll(rig, dn, vx = 0, vy = 0, vz = 0, ctx = null) {
  if (rig.active) return true; const low = /low/i.test(String(ENV.quality() || '')), cap = low ? CAP_LOW : CAP;
  for (let i = ACTIVE.length - 1; i >= 0; i--) if (ACTIVE[i].sim.asleep || !ACTIVE[i].active) ACTIVE.splice(i, 1);   // (asleep: their pose kept, no longer counted)
  // (r2) past the cap: the slowest body that is only trembling (every part under 4 × SLEEP_V) is put to sleep where it
  // lies; none such — all still falling — and this death falls the old way (a body frozen mid-fall looks worse)
  if (ACTIVE.length >= cap) { let old = -1; for (let i = 0; i < ACTIVE.length; i++) { const sm = ACTIVE[i].sim; if (!ACTIVE[i].catching && sm.steps > 8 && sm.speed < SLEEP_V * 4 && (old < 0 || sm.speed < ACTIVE[old].sim.speed)) old = i; }
    if (old < 0) return false; ACTIVE[old].sim.asleep = true; ACTIVE[old].moved = true; ACTIVE[old].catching = false; ACTIVE.splice(old, 1); }
  rig.read(); rig.sim.sub = SUB; rig.sim.sleepS = low ? SLEEP_S_LOW : SLEEP_S; rig.t0 = Number.isFinite(dn?.at) ? dn.at : ENV.hostNow(); rig.active = true; rig.moved = true; rig.kind = applyKill(rig, dn, vx, vy, vz, ctx);
  rig.sim.freeStart(ENV.world() || FLAT); NOW[0] = ENV.hostNow(); rig.catching = dueSteps(rig) > MAX_STEPS_FRAME; ACTIVE.push(rig); return true;
}
// Stepping (FINISH pass, after review): the steps a ragdoll is due follow the host's clock since the death (capped at
// MAX_S), taken in ragdollFrame() — once a frame for every active ragdoll, whether or not its owner is drawn (a body
// hidden in a smoke keeps falling) — within FRAME_BUDGET for all of them; a body behind by more than MAX_STEPS_FRAME
// catches up CATCH_STEPS a frame and is not drawn until it has (rig.catching): no frame ever runs hundreds of steps.
// Without ragdollFrame() being called (the node tests drive the owners only), updateRagdoll() steps its own rig on the
// same rules, the budget per call.
let FRAME_N = 0, BUDGET = FRAME_BUDGET; const NOW = new Float64Array(1);   // (NOW: the host's clock this frame — a register, so no number crosses a call)   // (ragdollFrame()'s count: a rig it stepped this frame carries it — rig.framed — and is not stepped again by its owner)
const dueSteps = rig => Math.min(Math.floor((NOW[0] - rig.t0) / 1000 / STEP), Math.ceil(MAX_S / STEP)) - rig.sim.steps;
// (r2 fix) a body following the clock takes every step it is due (at most MAX_STEPS_FRAME: a long frame's lag is made
// up over the next frames, the body drawn all along); only a body that STARTED behind (rig.catching, set by startRagdoll)
// draws on BUDGET — the catch-up steps of all catching bodies this frame — and is hidden until it has caught up.
function stepRig(rig, world) {
  const sim = rig.sim; if (!rig.active || sim.asleep) { rig.catching = false; return; }
  const behind = dueSteps(rig), n = rig.catching ? Math.min(behind, CATCH_STEPS, BUDGET > 0 ? BUDGET : 0) : Math.min(behind, MAX_STEPS_FRAME);
  for (let i = 0; i < n && !sim.asleep; i++) { sim.step(world); if (rig.catching) BUDGET--; } if (n > 0) rig.moved = true;
  if (rig.catching) rig.catching = !sim.asleep && dueSteps(rig) > MAX_STEPS_FRAME;
  if (sim.asleep) { const k = ACTIVE.indexOf(rig); if (k >= 0) ACTIVE.splice(k, 1); }
}
// Once a frame (lab.js, before the bodies are updated): every active ragdoll stepped to now, within the frame's budget.
export function ragdollFrame() {
  FRAME_N++; BUDGET = FRAME_BUDGET; if (!ACTIVE.length) return; NOW[0] = ENV.hostNow(); const world = ENV.world() || FLAT;
  for (let i = ACTIVE.length - 1; i >= 0; i--) { const rig = ACTIVE[i]; rig.framed = FRAME_N; stepRig(rig, world); }   // (from the end: a rig that falls asleep leaves the list)
}
// Each frame its owner is drawn: its nodes posed — only when the ragdoll moved since the last pose (a sleeping body
// costs nothing: its bones keep the last pose). Returns true when it wrote the pose (the owner then tells its
// skeletons, sun-shadows.js bonesMoved). While catching up (rig.catching) the owner hides the body.
export function updateRagdoll(rig) {
  if (!rig.active) return false;
  if (!rig.sim.asleep && rig.framed !== FRAME_N) { if (!FRAME_N) BUDGET = FRAME_BUDGET; NOW[0] = ENV.hostNow(); stepRig(rig, ENV.world() || FLAT); }   // (not stepped by ragdollFrame() this frame — started since, or no ragdollFrame() running at all (the node tests): stepped here)
  if (!rig.moved && rig.anchorMoved?.()) rig.moved = true;   // (r2: its holder moved — the body kept where it lies in the world)
  if (!rig.moved) return false; rig.moved = false; rig.write(); return true;
}
// (r2) An owner's vertical speed from where its group's holder stands (VY: [last height, speed]; g: the dress's group, a
// child of the player's group — a body placed straight in the scene (your own) gets its speed given instead): kept
// within a jump's and a fall's speeds, 0 after a gap (a teleport, a body not updated for a while).
export function trackVy(VY, g, dt) { const P = g?.parent; if (!P || P.isScene || !(dt > 0)) return; const y = P.position.y, v = (y - VY[0]) / dt; VY[0] = y; VY[1] = v > -120 && v < 60 && dt < .25 ? v : 0; }
// The owner is alive again (a new round, a respawn) or gone: the ragdoll back in the pool, the nodes to their owner.
export function stopRagdoll(rig) { if (!rig) return; if (rig.active) rig.restore(); rig.active = false; rig.catching = false; rig.moved = false; const k = ACTIVE.indexOf(rig); if (k >= 0) ACTIVE.splice(k, 1); }
// The host's death record of a player (combat.down[key]) and what pushes a blast (the grenades, the planted bomb) — the
// game state given to setRagdollWorld. Read once per death.
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export function deathOf(name) { return ENV.game()?.combat?.down?.[key(name)] || null; }
const CTX = { nades: null, bomb: null };
export function deathCtx() { const G = ENV.game(); CTX.nades = G?.combat?.nades || null; CTX.bomb = G?.combat?.d?.round?.planted || null; return CTX; }
// A rig for a CS2 agent's skeleton (body: its cloned scene): CS2's own ragdoll for its side when imported, else ours —
// the def made once per skeleton template (tpl), the rig per agent. bones: name (lower case) → bone.
const CS2_DEFS = {}; let CS2_LOADING = null; const FB_DEFS = new WeakMap();
export function useCs2Ragdolls(json) { for (const k of Object.keys(CS2_DEFS)) delete CS2_DEFS[k]; if (json?.sides) for (const [side, d] of Object.entries(json.sides)) if (Array.isArray(d?.bodies) && Array.isArray(d?.joints)) CS2_DEFS[side] = d; return Object.keys(CS2_DEFS); }
export function loadCs2Ragdolls(fetchJson) { return CS2_LOADING ??= Promise.resolve(fetchJson('ragdoll/cs2-ragdoll.json')).then(j => useCs2Ragdolls(j), () => []); }
export const cs2RagdollSides = () => Object.keys(CS2_DEFS);
export function agentRig(body, side, tpl, THREE) {
  const bones = {}; body.traverse(o => { if (o.isBone) { const n = o.name.toLowerCase(); if (!bones[n]) bones[n] = o; } });
  let rootBone = bones.pelvis; if (!rootBone) return null; while (rootBone.parent?.isBone) rootBone = rootBone.parent; const order = []; rootBone.traverse(o => { if (o.isBone) order.push(o); });
  let def = CS2_DEFS[side] || null; if (def && def.bodies.some(b => !bones[b.bone])) def = null;
  if (!def) { def = FB_DEFS.get(tpl); if (!def) { def = fallbackDef(n => bones[n], THREE); FB_DEFS.set(tpl, def); } }
  const rig = createRig(def, n => bones[n], order, THREE); rig.cs2 = def === CS2_DEFS[side]; return rig;
}

// Warm-up at load (behind the loading card): one fall on flat ground, so the solver's code is compiled before a round;
// (r2) with a world and a spot — lab.js, when the match's map is in (its warm-up) — also one fall of every kind of
// ragdoll known (CS2's imported ones, and each kind a rig was made of: ours, the soldier's) on that world, so the map's
// own surface queries and the full-size solver are compiled before the first death. A kind first made after that (a
// soldier joining mid-match) is warmed when its first rig is made (noteKind). Returns the steps run.
const KINDS = new Map(), WARMED = new Set(); const LASTW = { world: null, x: 0, y: 0, z: 0 };
const kindOf = (def, NB) => (def.units || '') + NB + (def.from || '');
function noteKind(def, bodies, joints, root = 0) { const k = kindOf(def, bodies.length); if (KINDS.has(k)) return; KINDS.set(k, { bodies, joints, root }); if (LASTW.world) warmKind(k); }
function warmKind(k) {
  const d = KINDS.get(k), w = LASTW.world; if (!d || !w) return 0; const wk = k + '@' + (WORLDS_ID.get(w) ?? (WORLDS_ID.set(w, WORLDS_ID.size + 1), WORLDS_ID.size)); if (WARMED.has(wk)) return 0; WARMED.add(wk);
  const sim = createSim(d), X = sim.X, Q = sim.Q, done = new Uint8Array(sim.NB); Q.fill(0); for (let i = 0; i < sim.NB; i++) Q[i * 4 + 3] = 1; done[0] = 1;
  // the bind pose from the joints (their two frames agree at rest): child orientation = parent · qa · qb⁻¹, its centre where the anchors meet
  for (const j of d.joints) { if (!done[j.a] || done[j.b]) continue; const qb = Float64Array.of(-j.qb[0], -j.qb[1], -j.qb[2], j.qb[3]), qa = Float64Array.from(j.qa);
    qmul(Q, j.a * 4, qa, 0, T4, 0); qmul(T4, 0, qb, 0, Q, j.b * 4); qnorm(Q, j.b * 4); rot(Q, j.a * 4, Float64Array.from(j.ra), 0, T3, 0); rot(Q, j.b * 4, Float64Array.from(j.rb), 0, T3b, 0);
    for (let c = 0; c < 3; c++) X[j.b * 3 + c] = X[j.a * 3 + c] + T3[c] - T3b[c]; done[j.b] = 1; }
  for (let i = 0; i < sim.NB; i++) { X[i * 3] += LASTW.x; X[i * 3 + 1] += LASTW.y + 6; X[i * 3 + 2] += LASTW.z; }
  // WARM_FALLS falls from that pose, pushed two ways (with and without a contact-heavy slide), up to 2 s each
  const X0 = Float64Array.from(X), Q0 = Float64Array.from(Q); let n = 0;
  for (let f = 0; f < WARM_FALLS; f++) { X.set(X0); Q.set(Q0); sim.reset(); const a = f * 2.4; sim.freeStart(w); sim.impulse(ROOT_OF(d), X[ROOT_OF(d) * 3], X[ROOT_OF(d) * 3 + 1] + 1, X[ROOT_OF(d) * 3 + 2], Math.sin(a), f % 3 ? 0 : .3, Math.cos(a), BULLET_IMPULSE * (1 + f % 3));
    if (f % 2) sim.kick(Math.cos(a) * 20, f % 4 ? 0 : 15, Math.sin(a) * 20); for (let i = 0; i < 128 && !sim.asleep; i++) sim.step(w); n += sim.steps; }
  return n;
}
const WARM_FALLS = 2, ROOT_OF = d => d.root | 0;
const WORLDS_ID = new WeakMap();
export function warmRagdolls(world = null, x = 0, y = 0, z = 0) {
  const T0 = { mass: 20, invI: [1, 1, 1], samples: [[0, -.5, 0, .5], [0, .5, 0, .5]], linDamp: 0, angDamp: 2 };
  const sim = createSim({ bodies: [T0, { ...T0, mass: 5 }], joints: [{ a: 0, b: 1, ra: [0, 1, 0], rb: [0, -1, 0], qa: [0, 0, 0, 1], qb: [0, 0, 0, 1], hinge: false, swing: .5, tmin: -.5, tmax: .5, fric: .3 }] });
  sim.X.set([0, 3, 0, 0, 5, 0]); sim.Q.set([0, 0, 0, 1, 0, 0, 0, 1]); sim.impulse(1, 0, 5, 0, 1, 0, 0, 20); for (let i = 0; i < 96 && !sim.asleep; i++) sim.step(FLAT); let n = sim.steps;
  if (!world) return n; LASTW.world = world; LASTW.x = x; LASTW.y = y; LASTW.z = z;
  for (const side in CS2_DEFS) { const def = CS2_DEFS[side], r = resolveDef(def, HU); noteKind(def, r.bodies, r.joints, r.root); }   // (CS2's, from the import: k = HU — 2.54 / 100 m a Hammer unit × the agent's 100 / 16.5)
  for (const k of KINDS.keys()) n += warmKind(k); return n;
}
