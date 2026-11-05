// Global Defensive physics props, host-authoritative like CS2 (v53 PROPS, openB-10). The CS2 maps' prop_physics_multiplayer
// / prop_physics entities (pots, cans, bottles, buckets, crates, stools — the map file's props, bsp-map.js physProps,
// read by tools/maps/import-cs2-map.mjs from the map's entity lump) are simulated by the HOST alone, in fixed 1/64 s
// steps (CS2's tick); every player draws them from the host's word, between its last two snapshots.
//
// THE RULE (who moves a prop, and how):
//   host  propsTick (lan/room.mjs, every room tick): the shots in the players' pose records (weapons.js poseShot: the
//         newest shot's number, look and aim punch — the bullet's line from the shooter's eye, stopped by the map's
//         bullet layer), knife hits (the arena action 'prop', arena-logic.js), HE blasts (the host's own grenades,
//         phase 'boom'), grenades in flight (arena-nades.js setNadeProps: they bounce off props and push them) and the
//         bodies of players and bots (a prop they stand in is pushed out of their way) knock the props; then
//         createPropSim steps them in whole 1/64 s steps, the rest of the tick carried to the next (the same motion
//         whatever the room's tick does). A new round (the round's id changes) puts every prop back, whole.
//   frame propsFrame (lan/room.mjs gdFrame: the combat frame's `pp`): quantised integers — only the props moving, the
//         ones that settled in the last half second, a few displaced resting ones in turn, everything displaced on a
//         full frame — plus the broken ones. Nothing at all for a map without props.
//   guest propsNet (dist/lab.js, every frame): each prop drawn PROP_INTERP steps behind the host's newest step,
//         between the two snapshots round that moment (positions straight, angles the short way round), never ahead
//         of the last; a new epoch (a round reset) puts them back. The local simulation (arena-physprops.js) then
//         never moves them itself (it stays the fallback for a host without this field).
//
// THE BODY (createPropSim): an upright body of its box's half width R and height H (game units) on the map's floor
// (map.nav.floorAt), with a yaw and a tip-over (a tall one falls onto its side, toward the knock, as a stick on its
// edge falls: α = 3g / 2H · sin θ); it slides with Coulomb friction (μ g), bounces off walls and the floor by its
// elasticity, knocks the props it runs into (a contact impulse shared by the masses, only while closing), spins with
// friction torque, and sleeps when still. At most MAX_AWAKE move at once (cheap bodies, capped per
// map: a knock on a sleeping prop past the cap is refused; a pot still breaks).
//
// WHERE THE NUMBERS COME FROM:
//   mass, surface              CS2's model data (user-assets/gd-props/props.json, tools/import-cs2-props.mjs: the model's
//                              PHYS m_flMass, else its surface's density × its hulls' shell (surface area × the vsurf
//                              thickness) or, a solid surface, × hull volume); without the file our FALLBACK (a mass
//                              from the box, 0.0018 kg/HU³ — ours)
//   health, damage             CS2's prop_data (the model's DATA, else its base type in scripts/propdata.vdata): a prop
//                              with health > 0 takes damage — a bullet its damage at that range (m_nDamage × the
//                              range modifier per 500 HU, as a player) × dmg.bullets, a knife × dmg.club, an HE ×
//                              dmg.explosive, a grenade striking it 10 × dmg.club — and breaks when it runs out; 0 never
//                              breaks. Without the file: one hit breaks the importer's name rule's pots and bottles
//   elasticity, friction       the prop's CS2 surface (surfaceproperties.vsurf physics, through props.json or
//                              gd-surface-props.js CS2_SURFACES), combined with the world's "default" (e 0.25, f 0.8) as
//                              a product — the combine rule is the physics engine's, NOT in the files (our choice)
//   gravity 800 HU/s², 64 Hz   sv_gravity and CS2's tick (as the grenades, arena-nades.js)
//   bullet impulse             BULLET_J 2400 kg·in/s a bullet (a shotgun pellet PELLET_J 600): CS:GO's ammo physics
//                              force (cs_ammodef, the public SDK) — from memory, NOT in the CS2 files. Each bullet of a
//                              shot along its own line (the shot record's inaccuracy and spread, weapons-data
//                              shotOffsets — the very bullets the shooter fired), as far as the gun reaches (m_flRange)
//   blast impulse              min(base damage × 300, 30000) × 0.85–1.15 kg·in/s away from the blast, the same for every
//                              prop in its radius: Source's CalculateExplosiveDamageForce (ImpulseScale(75, 4) a point
//                              of the BASE damage, clamped at ImpulseScale(75, 400), the random fudge — here seeded by
//                              the prop and the blast, the same on every run) — the public SDK, from memory, NOT in the
//                              CS2 files; the damage (what breaks a pot) falls off as the doors' (arena-logic.js)
//   knife impulse              24000 kg·in/s a swing: Source's CalculateMeleeDamageForce with the knife's scale 80 / damage
//                              (CS:S / CS:GO weapon_knife) — the same caveat
//   grenade push               NADE_KG 0.4 kg × (1 + 0.45) × its speed into the prop — ours (CS2's grenades have no mass
//                              in the files); the grenade bounces off at the world's 0.45 (Source's
//                              ResolveFlyCollisionCustom: a surface that is no player keeps the full 0.45); a breakable
//                              prop takes 10 club damage from it and, broken, lets it fly on at 0.4 × its speed (CS:GO
//                              basecsgrenade_projectile ResolveFlyCollisionCustom — the public SDK, from memory)
//   speed cap 2000 HU/s        Source's physics default maximum velocity — from memory, NOT in the CS2 files
// Allocation: the simulation, the snapshot reader and the drawing write into fixed typed arrays; the host builds one
// small integer array per snapshot step (20 a second, not per drawn frame).
import { ARENA_MAPS, mapBoxes, rayBoxes } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { boxesNear } from './box-grid.js';
import { weaponById, shotBase, EYE, isFirearm, accOf, shotOffsets, offsetDir } from './weapons-data.js';
import { isDown } from './combat-logic.js';   // (v53 PROPS final: a dead player's or bot's body pushes nothing)
import { NADES, setNadeProps } from './arena-nades.js';
import { CS2_SURFACES, surfaceName } from './gd-surface-props.js';
import { gdPresetNow } from './gd-preset.js';

const U = 2.54 / 16.5;                                   // game units per Hammer unit
export const PROP_HZ = 64, PROP_DT = 1 / PROP_HZ, PROP_MAX_STEPS = 16, MAX_AWAKE = 24;
export const PROP_Q = 64, ANG_Q = 4096 / (2 * Math.PI), PROP_INTERP = 7;   // (positions to 1/64 of a game unit, angles to 1/4096 of a turn; drawn 7 steps = 109 ms behind: two of the room's 20 Hz frames)
const GRAVITY = 800 * U, MAX_V = 2000 * U, MAX_W = 30, BODY_R = 16 * U, BODY_H = 72 * U;
export const BULLET_J = 2400, PELLET_J = 600, BLAST_J_PER_DMG = 300, BLAST_J_MAX = 30000, KNIFE_J = 24000, NADE_KG = .4, NADE_DMG = 10, NADE_THROUGH = .4;
export const MAX_SHOT_GAP = 8;   // (v53 PROPS final: a pose's shot number that jumps by more than this in one room tick is a restarted counter — a reload of the page — not bullets)
const WORLD_E = .25, WORLD_F = .8, ROLL = .12, REST_V = .5 * U, REST_W = .05, FALLBACK_DENS = .0018;   // (WORLD_*: CS2's "default" surface physics; ROLL: a round prop lying on its side rolls — our share of its friction)
export const LOW_DRAW_CAP = Object.freeze({ Low: 12, 'Very Low': 8 });   // (v53 PROPS: on Low / Very Low at most this many moving props are redrawn every frame; the rest every other frame)

// ── CS2's model data (the host loads user-assets/gd-props/props.json: lan/room.mjs) ──
let MODELS = null;
export function setPropModels(json) { MODELS = json && typeof json === 'object' && json.models && typeof json.models === 'object' ? json.models : null; return !!MODELS; }
export const propModels = () => MODELS;
// A map file's prop → { kg, e, f, breaks, src }: CS2's numbers where the import has them, else ours.
export function propPhysics(p) {
  const m = MODELS?.[p.model], scale = p.mass > 0 ? p.mass : 1;   // (p.mass: the entity's massScale, 1 when unset)
  const boxKg = Math.max(.2, (2 * p.rx / U) * (2 * p.rz / U) * (p.h / U) * FALLBACK_DENS);
  const kg = m && !m.missing ? (m.mass > 0 ? m.mass : m.massFromDensity > 0 ? m.massFromDensity : boxKg) : boxKg;
  const S = m?.surface ? CS2_SURFACES[surfaceName(m.surface)] || CS2_SURFACES[m.surface] : null;
  const e = Number.isFinite(m?.elasticity) ? m.elasticity : S?.e ?? WORLD_E, f = Number.isFinite(m?.friction) ? m.friction : S?.f ?? WORLD_F;
  const cs2 = !!(m && !m.missing), hp = cs2 && Number.isFinite(m.health) ? Math.max(0, m.health) : cs2 && typeof m.breaks === 'boolean' ? (m.breaks ? 1 : 0) : p.breaks ? 1 : 0;   // (CS2's prop_data health; an older file: breaks → one hit; no file: the name rule, one hit)
  const D = cs2 && m.dmg ? m.dmg : null, mu = v => Number.isFinite(v) && v >= 0 ? v : 1;
  return { kg: Math.max(.1, kg * scale), e: e * WORLD_E, f: f * WORLD_F, breaks: hp > 0, hp, dmg: { bullets: mu(D?.bullets), club: mu(D?.club), explosive: mu(D?.explosive) }, src: cs2 ? 'cs2' : 'ours' };
}

// ── The simulation (the host; tests) ──
// props: map.physProps ({ i, model, mass, breaks, x, z, y, h, rx, rz }, game units, x / z from the map's centre);
// floorAt(x, z, nearY) → the floor's height (map-relative x / z, as map.nav); blocked(x, z, y, h, r) → a wall there (world);
// crosses(ax, ay, az, bx, by, bz) → the way a → b passes through a wall (world; null: none known — a fast small prop moves
// two units a step, more than a can's width: the end test alone let it tunnel through a thin wall).
export function createPropSim(props, { cx = 0, cz = 0, floorAt = () => 0, blocked = () => false, crosses = null, beforeStep = null } = {}) {   // (beforeStep(sim, step): tests — knocks due at a step)
  const n = props.length, K = 12;   // per prop: x z y vx vz vy yaw wy tip tw td (tip direction) — and 1 spare
  const S = new Float64Array(n * K), HOME = new Float64Array(n * 3), R = new Float64Array(n), H = new Float64Array(n), M = new Float64Array(n), E = new Float64Array(n), F = new Float64Array(n);
  const FL = new Float64Array(n), awake = new Uint8Array(n), broken = new Uint8Array(n), lying = new Uint8Array(n), round = new Uint8Array(n), breaks = new Uint8Array(n), moved = new Uint8Array(n), restAt = new Int32Array(n).fill(-1e9);
  const HP0 = new Float64Array(n), HP = new Float64Array(n), MB = new Float64Array(n), MC = new Float64Array(n), ME = new Float64Array(n), LC = new Float64Array(n * 2);   // (v53 PROPS final: CS2's prop_data health and damage multipliers; LC: the last spot where its body stood clear of the walls)
  const clock = { acc: 0, step: 0, epoch: ++EPOCH, blasts: 0 }; let awakeN = 0, brokenN = 0, rr = 0;
  props.forEach((p, k) => { const o = k * K, ph = propPhysics(p); S[o] = cx + p.x; S[o + 1] = cz + p.z; S[o + 2] = p.y; HOME[k * 3] = S[o]; HOME[k * 3 + 1] = S[o + 1]; HOME[k * 3 + 2] = S[o + 2]; FL[k] = p.y;
    R[k] = Math.max(.15, Math.min(4, Math.max(p.rx, p.rz))); H[k] = Math.max(.15, p.h); M[k] = ph.kg; E[k] = ph.e; F[k] = ph.f; breaks[k] = ph.breaks ? 1 : 0;
    HP0[k] = HP[k] = ph.hp; MB[k] = ph.dmg.bullets; MC[k] = ph.dmg.club; ME[k] = ph.dmg.explosive; LC[k * 2] = S[o]; LC[k * 2 + 1] = S[o + 1];
    round[k] = Math.abs(p.rx - p.rz) < .25 * Math.max(p.rx, p.rz) ? 1 : 0; });
  const wakeUp = k => { if (awake[k]) return true; if (awakeN >= MAX_AWAKE) return false; awake[k] = 1; awakeN++; moved[k] = 1; return true; };
  const sleep = k => { if (!awake[k]) return; awake[k] = 0; awakeN--; restAt[k] = clock.step; };
  const comY = k => S[k * K + 2] + (lying[k] ? R[k] : H[k] / 2);
  const hullR = k => lying[k] ? Math.max(R[k], H[k] / 2) : R[k], hullH = k => lying[k] ? 2 * R[k] : H[k];
  function shatter(k) { if (broken[k]) return; if (awake[k]) sleep(k); broken[k] = 1; brokenN++; moved[k] = 1; S[k * K + 3] = S[k * K + 4] = S[k * K + 5] = 0; }
  // Damage (already × the prop's multiplier) to a prop with health: true when it broke (CS2's prop_data: health 0 takes none).
  const hurt = (k, dmg) => { if (!breaks[k] || broken[k] || !(dmg > 0)) return false; HP[k] -= dmg; if (HP[k] > 1e-9) return false; shatter(k); return true; };
  // The widest body (≤ r) that stands clear of the walls at (x, z): r when it is clear, less for one the map put touching a
  // wall or a shelf, 0 for one whose middle is inside the map's geometry (v53 PROPS final: such a prop slid straight
  // through the wall it touched — the wall test was skipped whenever it started blocked).
  const clearR = (x, z, y, h, r) => { if (!blocked(x, z, y, h, r)) return r; for (let q = r * .85; q > .04; q *= .85) if (!blocked(x, z, y, h, q)) return q; return 0; };
  const through = (ax, az, bx, bz, y) => crosses !== null && crosses(ax, y, az, bx, y, bz);
  const clearWay = (ax, az, bx, bz, y, h, r) => !blocked(bx, bz, y, h, r) && !through(ax, az, bx, bz, y + h * .5) && !through(ax, az, bx, bz, y + h * .2);   // (two heights: a low lip or curb too)
  // An impulse (jx jy jz, kg·HU/s) at a point (hx hy hz: from the prop's centre, game units). False: refused (the cap).
  function impulse(k, jx, jy, jz, hx = 0, hy = 0, hz = 0) {
    if (broken[k] || !wakeUp(k)) return false; const o = k * K, im = U / M[k];
    let dvx = jx * im, dvz = jz * im; const dvy = Math.max(0, jy * im), dh = Math.hypot(dvx, dvz);
    S[o + 3] += dvx; S[o + 4] += dvz; S[o + 5] += dvy;
    { const sp = Math.hypot(S[o + 3], S[o + 4], S[o + 5]); if (sp > MAX_V) { const q = MAX_V / sp; S[o + 3] *= q; S[o + 4] *= q; S[o + 5] *= q; } }
    // Spin about the up axis: the angular impulse (r × J)·up over a disc's I = M R² / 2 (HU).
    const rH = R[k] / U, Ly = (hz / U) * jx - (hx / U) * jz; S[o + 7] = Math.max(-MAX_W, Math.min(MAX_W, S[o + 7] + Ly / (.5 * M[k] * rH * rH)));
    // A tall one tips over, away from the knock, when the knock can lift its centre over its edge (sqrt(2 g (d − H/2)),
    // d = the edge's distance from the centre): a hit above the centre turns it (by how far above), and one that slides
    // tips anyway when the floor's grip outdoes its stance (μ ≥ R / (H/2): a bottle, not a bucket).
    if (!lying[k] && S[o + 9] === 0 && H[k] > R[k] * 1.2 && dh > 0) { const d = Math.hypot(R[k], H[k] / 2), need = Math.sqrt(2 * GRAVITY * (d - H[k] / 2)), lever = 3 * Math.max(0, hy) / H[k] + (F[k] >= R[k] / (H[k] / 2) ? 1 : 0);
      if (dh * lever > need) { S[o + 10] = Math.atan2(dvx, dvz); S[o + 9] = Math.max(.5, dh * lever / (H[k] / 2) * .5); } }
    return true; }
  // One fixed step: bodies push, then every awake prop flies / slides / spins / tips.
  function step(pos, count) {
    const dt = PROP_DT; if (beforeStep !== null) beforeStep(api, clock.step);
    for (let b = 0; b < count; b++) { const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
      for (let k = 0; k < n; k++) { if (broken[k]) continue; const o = k * K, r = hullR(k) + BODY_R, dx = S[o] - bx, dz = S[o + 1] - bz; if (dx > r || dx < -r || dz > r || dz < -r) continue;
        if (S[o + 2] > by + BODY_H || S[o + 2] + hullH(k) < by - .3) continue; const d = Math.hypot(dx, dz); if (d >= r) continue;
        if (!wakeUp(k)) continue; const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0, out = r - d;
        if (!blocked(S[o] + ux * out, S[o + 1] + uz * out, S[o + 2], hullH(k), hullR(k))) { S[o] += ux * out; S[o + 1] += uz * out; }   // (never shoved into a wall: its speed below still goes, the wall test bounces it)
        const v = Math.min(250 * U, out / dt * .6), along = S[o + 3] * ux + S[o + 4] * uz; if (along < v) { S[o + 3] += ux * (v - along); S[o + 4] += uz * (v - along); } } }
    // Props against props (an awake one meeting another, its sides' hulls): when they close on each other, the impulse of
    // a contact with the pair's lower elasticity — the masses share it (a sleeping one past the cap: a wall). Only closing
    // pairs: two the map put touching (a stack of cups) are never pushed apart.
    for (let k = 0; k < n; k++) { if (!awake[k]) continue; const o = k * K, rk = hullR(k), y0 = S[o + 2], y1 = y0 + hullH(k);
      for (let j = 0; j < n; j++) { if (j === k || broken[j] || (awake[j] && j < k)) continue; const q = j * K, rs = rk + hullR(j), dx = S[q] - S[o], dz = S[q + 1] - S[o + 1];
        if (dx > rs || dx < -rs || dz > rs || dz < -rs || S[q + 2] > y1 || S[q + 2] + hullH(j) < y0) continue; const d = Math.hypot(dx, dz); if (d >= rs || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, vn = (S[q + 3] - S[o + 3]) * nx + (S[q + 4] - S[o + 4]) * nz; if (vn >= 0) continue;
        const free = wakeUp(j), ik = 1 / M[k], ij = free ? 1 / M[j] : 0, Jn = -(1 + Math.min(E[k], E[j])) * vn / (ik + ij);
        S[o + 3] -= Jn * ik * nx; S[o + 4] -= Jn * ik * nz; if (free) { S[q + 3] += Jn * ij * nx; S[q + 4] += Jn * ij * nz; } } }
    for (let k = 0; k < n; k++) { if (!awake[k]) continue; const o = k * K;
      let vx = S[o + 3], vz = S[o + 4], vy = S[o + 5]; const fl = floorAt(S[o] - cx, S[o + 1] - cz, S[o + 2] + 2 * U), floor = Number.isFinite(fl) ? (FL[k] = fl) : FL[k];   // (no floor known there: the last one it stood on)
      const r = hullR(k), h = hullH(k), nx = S[o] + vx * dt, nz = S[o + 1] + vz * dt;
      // (a wall in the way: off it by its elasticity. One touching a wall where it stands — a shelf, a ledge, where the map
      // put it — is tested with the widest body clear there: free to leave the wall or slide along it, never into it. One
      // whose middle is inside the geometry moves at most its own size from where it last stood clear.)
      const y = S[o + 2], ax = S[o], az = S[o + 1], wr = clearR(ax, az, y, h, r);
      if (wr > 0) { LC[k * 2] = ax; LC[k * 2 + 1] = az;
        if (!clearWay(ax, az, nx, nz, y, h, wr)) { if (clearWay(ax, az, nx, az, y, h, wr)) { S[o] = nx; vz = -vz * E[k]; } else if (clearWay(ax, az, ax, nz, y, h, wr)) { S[o + 1] = nz; vx = -vx * E[k]; } else { vx = -vx * E[k]; vz = -vz * E[k]; } }
        else { S[o] = nx; S[o + 1] = nz; } }
      else { const ex = nx - LC[k * 2], ez = nz - LC[k * 2 + 1], lim = r + .5; if (ex * ex + ez * ez > lim * lim || through(ax, az, nx, nz, y + h * .5) || through(ax, az, nx, nz, y + h * .2)) vx = vz = 0; else { S[o] = nx; S[o + 1] = nz; } }
      const air = S[o + 2] > floor + .01 || vy > 0;
      if (air) { vy -= GRAVITY * dt; S[o + 2] += vy * dt;
        if (S[o + 2] <= floor) { S[o + 2] = floor; const hit = -vy; vy = hit > 30 * U ? hit * E[k] : 0; const sp = Math.hypot(vx, vz), cut = Math.min(sp, F[k] * hit); if (sp > 1e-9) { vx -= vx / sp * cut; vz -= vz / sp * cut; } } }   // (landing: the floor's friction takes μ × the impact off the slide)
      else { S[o + 2] = floor; vy = 0; const sp = Math.hypot(vx, vz), mu = F[k] * (lying[k] && round[k] ? ROLL : 1), cut = mu * GRAVITY * dt; if (sp <= cut) vx = vz = 0; else { vx -= vx / sp * cut; vz -= vz / sp * cut; } }
      // Spin: friction torque on the floor (a disc: 2 μ g / R).
      S[o + 6] += S[o + 7] * dt; if (!air) { const w = S[o + 7], c = 2 * F[k] * GRAVITY / R[k] * dt; S[o + 7] = Math.abs(w) <= c ? 0 : w - Math.sign(w) * c; }
      // Tipping over: θ̈ = 3g / 2H · sin θ (a stick falling about its foot), until it lies on its side.
      if (S[o + 9] > 0 && !lying[k]) { S[o + 9] += 1.5 * GRAVITY / H[k] * Math.sin(Math.max(.05, S[o + 8])) * dt; S[o + 8] += S[o + 9] * dt; if (S[o + 8] >= Math.PI / 2) { S[o + 8] = Math.PI / 2; S[o + 9] = 0; lying[k] = 1; } }
      S[o + 3] = vx; S[o + 4] = vz; S[o + 5] = vy;
      if (!air && vx * vx + vz * vz < REST_V * REST_V && Math.abs(S[o + 7]) < REST_W && !(S[o + 9] > 0)) { S[o + 3] = S[o + 4] = 0; S[o + 7] = 0; sleep(k); } }
    clock.step++; }
  // The first prop (not broken) a ray (origin o, unit d) passes through within `far`: its index, the distance in T[0].
  const T = new Float64Array(1);
  function pick(ox, oy, oz, dx, dy, dz, far) { let best = -1, bt = far;
    for (let k = 0; k < n; k++) { if (broken[k]) continue; const o = k * K, r = Math.max(hullR(k), hullH(k) / 2), px = S[o] - ox, py = comY(k) - oy, pz = S[o + 1] - oz, t = px * dx + py * dy + pz * dz;
      if (t < 0 || t > bt) continue; const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t; if (qx * qx + qy * qy + qz * qz > r * r) continue; best = k; bt = t; }
    T[0] = bt; return best; }
  const PN = new Float64Array(4);
  const api = {
    count: n, get step() { return clock.step; }, get epoch() { return clock.epoch; }, get awakeCount() { return awakeN; }, get brokenCount() { return brokenN; },
    // dt of the room's tick: whole 1/64 s steps (the rest carried to the next; at most PROP_MAX_STEPS at once).
    advance(dt, pos = null, count = 0) { if (!(dt > 0)) return 0; clock.acc += dt; let s = 0; while (clock.acc >= PROP_DT - 1e-9 && s < PROP_MAX_STEPS) { clock.acc -= PROP_DT; step(pos, pos ? count : 0); s++; } if (s === PROP_MAX_STEPS) clock.acc = Math.min(clock.acc, PROP_DT); return s; },
    stepOnce(pos = null, count = 0) { step(pos, pos ? count : 0); },
    pick,
    // A bullet: the first prop on its line knocked along it (J kg·in/s at the point it passes); one with health takes its
    // damage there (dmg × rmod per 500 HU, as a player's — × the prop's dmg.bullets) and breaks when it runs out.
    bullet(ox, oy, oz, dx, dy, dz, far = 400, J = BULLET_J, dmg = 30, rmod = 1) { const k = pick(ox, oy, oz, dx, dy, dz, far); if (k < 0) return -1; const t = T[0], o = k * K;
      if (hurt(k, dmg * Math.pow(rmod, t / U / 500) * MB[k])) return k; impulse(k, dx * J, dy * J, dz * J, ox + dx * t - S[o], oy + dy * t - comY(k), oz + dz * t - S[o + 1]); return k; },
    // An HE blast (world x y z, radius r, damage dmg): each prop within takes the damage there (× dmg.explosive) and is
    // thrown away from it with the base damage's force (Source: the same for all in the radius, fudged 0.85–1.15).
    blast(x, y, z, r, dmg) { const b = ++clock.blasts; for (let k = 0; k < n; k++) { if (broken[k]) continue; const o = k * K, dx = S[o] - x, dy = comY(k) - y, dz = S[o + 1] - z, d = Math.hypot(dx, dy, dz); if (d >= r) continue;
        if (hurt(k, dmg * Math.pow(1 - d / r, 1.3) * ME[k])) continue;
        const J = Math.min(BLAST_J_MAX, dmg * BLAST_J_PER_DMG) * (.85 + .3 * hash01(k, b)), u = d > 1e-6 ? J / d : 0; impulse(k, dx * u, d > 1e-6 ? dy * u : J, dz * u); } },
    // A knife hit on prop k along the swing (unit d), damage dmg (× dmg.club).
    knife(k, dx, dy, dz, dmg) { if (k < 0 || k >= n || broken[k]) return false; if (hurt(k, dmg * MC[k])) return true; return impulse(k, dx * KNIFE_J, dy * KNIFE_J, dz * KNIFE_J); },
    hp: k => HP[k],
    impulse,
    // A grenade (ball radius rr at x y z, velocity v game/s) against the props: the first it is inside of pushes it out —
    // out = [nx, ny, nz, depth] — and is pushed by it (NADE_KG; push false: a preview or a copy — only the contact). True when it touched one.
    nadeHit(x, y, z, rr, vx, vy, vz, out = PN, push = true) { for (let k = 0; k < n; k++) { if (broken[k]) continue; const o = k * K, r = hullR(k), y0 = S[o + 2], y1 = y0 + hullH(k);
        const dx0 = x - S[o], dz0 = z - S[o + 1]; if (dx0 > r + rr || dx0 < -r - rr || dz0 > r + rr || dz0 < -r - rr || y < y0 - rr || y > y1 + rr) continue;
        const hd = Math.hypot(dx0, dz0), cxk = hd > r ? S[o] + dx0 / hd * r : x, czk = hd > r ? S[o + 1] + dz0 / hd * r : z, cyk = Math.max(y0, Math.min(y, y1));
        let ex = x - cxk, ey = y - cyk, ez = z - czk, d = Math.hypot(ex, ey, ez); if (d >= rr) continue;
        if (d > 1e-6) { out[0] = ex / d; out[1] = ey / d; out[2] = ez / d; out[3] = rr - d; }
        else { const up = y1 - y, side = r - hd; if (up <= side) { out[0] = 0; out[1] = 1; out[2] = 0; out[3] = up + rr; } else { const hl = hd || 1; out[0] = hd ? dx0 / hl : 1; out[1] = 0; out[2] = hd ? dz0 / hl : 0; out[3] = side + rr; } }
        const into = -(vx * out[0] + vy * out[1] + vz * out[2]);
        if (push && breaks[k] && into > 20 * U && hurt(k, NADE_DMG * MC[k])) { out[3] = -1; return false; }   // (CS:GO: a grenade striking a breakable prop does it 10 club damage; broken, the grenade flies on — out[3] −1 tells the host's hook to slow it)
        if (push && into > 0) { const J = NADE_KG * 1.45 * into / U; const im = U / M[k]; if (awake[k] || J * Math.hypot(out[0], out[2]) * im > F[k] * GRAVITY * PROP_DT || -out[1] * J * im > GRAVITY * PROP_DT) impulse(k, -out[0] * J, -out[1] * J, -out[2] * J); }   // (a resting prop stays put when the push cannot slide it past the floor's grip in a step — static friction — nor lift it: a grenade landing on top only presses it into the floor)
        return true; }
      return false; },
    // A page's copy of the host's word (propsNet: its grenade previews and copies bounce where the host's do): prop k put
    // at a drawn pose (world x y z, yaw, tip, its direction), lying once tipped over; broken: gone.
    setPose(k, x, y, z, yaw, tip, dir) { if (k < 0 || k >= n) return; const o = k * K; S[o] = x; S[o + 1] = z; S[o + 2] = y; S[o + 6] = yaw; S[o + 8] = tip; S[o + 10] = dir; lying[k] = tip >= Math.PI / 2 - 1e-3 ? 1 : 0; },
    setBroken(k) { if (k >= 0 && k < n && !broken[k]) { broken[k] = 1; brokenN++; } },
    // A new round: every prop where the map put it, whole and still (a new epoch for the guests).
    reset() { for (let k = 0; k < n; k++) { const o = k * K; S[o] = HOME[k * 3]; S[o + 1] = HOME[k * 3 + 1]; S[o + 2] = HOME[k * 3 + 2]; for (let j = 3; j < K; j++) S[o + j] = 0; } for (let k = 0; k < n; k++) FL[k] = HOME[k * 3 + 2]; awake.fill(0); broken.fill(0); lying.fill(0); moved.fill(0); restAt.fill(-1e9); HP.set(HP0); for (let k = 0; k < n; k++) { LC[k * 2] = HOME[k * 3]; LC[k * 2 + 1] = HOME[k * 3 + 1]; } awakeN = brokenN = 0; rr = 0; clock.acc = 0; clock.blasts = 0; clock.epoch = ++EPOCH; },
    awake: k => !!awake[k], broken: k => !!broken[k], lying: k => !!lying[k], at: k => [S[k * K], S[k * K + 2], S[k * K + 1]], mass: k => M[k], moving: () => awakeN > 0,
    // The snapshot (the frame's `pp`, integers): [epoch, step, nb, broken × nb, then i x y z yaw tip dir per prop] —
    // the awake ones, those settled within the last 32 steps, up to 4 displaced resting ones in turn, or (full) every
    // displaced one. A fresh array (it goes into a frame that may still be on its way).
    snapshot(full = false) { const out = [clock.epoch, clock.step, brokenN]; for (let k = 0; k < n; k++) if (broken[k]) out.push(k);
      const put = k => { const o = k * K; out.push(k, Math.round(S[o] * PROP_Q), Math.round(S[o + 2] * PROP_Q), Math.round(S[o + 1] * PROP_Q), qa(S[o + 6]), Math.round(S[o + 8] * ANG_Q), qa(S[o + 10])); };
      let extra = 0; for (let k = 0; k < n; k++) { if (broken[k] || !moved[k]) continue; if (full || awake[k] || clock.step - restAt[k] <= 32) put(k); }
      if (!full && n) for (let c = 0; c < n && extra < 4; c++) { const k = (rr + c) % n; if (broken[k] || !moved[k] || awake[k] || clock.step - restAt[k] <= 32) continue; put(k); extra++; if (extra === 4) { rr = (k + 1) % n; break; } }
      return out; },
  };
  return api;
}
let EPOCH = 0;
const hash01 = (k, b) => { let h = Math.imul((k + 1) * 0x9E3779B1 ^ Math.imul(b, 0x85EBCA77), 0xC2B2AE3D); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; return (h >>> 0) / 4294967296; };   // (integer hashing: the same on every computer)
const qa = a => { const q = Math.round(a * ANG_Q) % 4096; return q < 0 ? q + 4096 : q; };

// ── The guest's view: snapshots in, a pose per prop out (allocation-free) ──
// home: the map's physProps (world x = cx + p.x). RING samples a prop (step x y z yaw tip dir), the newest at head[k]:
// PROP_INTERP steps behind spans two to three of the room's 20 Hz frames, so it draws between the two round that moment.
const RING = 4, W7 = 7;
export function createPropView(props, { cx = 0, cz = 0 } = {}) {
  const n = props.length, Rg = new Float64Array(n * RING * W7), head = new Uint8Array(n), cnt = new Uint8Array(n), brokenNow = new Uint8Array(n), active = new Uint8Array(n);
  const st = { epoch: -1, step: -1, lastStep: -1, ref: null, off: NaN, resets: 0 };
  const slot = (k, back) => (k * RING + ((head[k] - back + RING) % RING)) * W7;   // (back 0: the newest)
  const push = k => { head[k] = (head[k] + 1) % RING; if (cnt[k] < RING) cnt[k]++; return slot(k, 0); };
  const home = k => { const p = props[k]; head[k] = 0; cnt[k] = 0; const o = slot(k, 0); Rg[o] = -1; Rg[o + 1] = cx + p.x; Rg[o + 2] = p.y; Rg[o + 3] = cz + p.z; Rg[o + 4] = Rg[o + 5] = Rg[o + 6] = 0; };
  function clear() { for (let k = 0; k < n; k++) home(k); brokenNow.fill(0); active.fill(0); st.step = st.lastStep = -1; }
  clear();
  return {
    count: n, state: st, active, broken: brokenNow,
    // A frame's pp at local time tMs. Returns 1 when it was new, 2 when it reset (a new epoch), 0 otherwise.
    ingest(pp, tMs) { if (!pp || pp === st.ref || !(pp.length >= 3)) return 0; st.ref = pp; const ep = pp[0], step = pp[1]; let res = 1;
      if (ep !== st.epoch) { st.epoch = ep; clear(); st.resets++; st.off = NaN; res = 2; } else if (step <= st.step) return 0;
      // The host's step clock against ours: the earliest arrival seen (the least delayed), drifting up slowly.
      { const off = tMs * PROP_HZ / 1000 - step; st.off = !Number.isFinite(st.off) || off < st.off ? off : st.off + (off - st.off) * .02; }
      const prevStep = st.step; st.lastStep = prevStep; st.step = step; const nb = pp[2] | 0;
      for (let j = 0; j < nb; j++) { const k = pp[3 + j]; if (k >= 0 && k < n) brokenNow[k] = 1; }
      for (let j = 3 + nb; j + 6 < pp.length; j += 7) { const k = pp[j]; if (!(k >= 0 && k < n)) continue;
        // (not in the last snapshot — resting, or never moved: it starts from where it stood at that snapshot's step)
        { const o = slot(k, 0); if (Rg[o] < prevStep || cnt[k] === 0) { const was = o, q = push(k); for (let c = 1; c < W7; c++) Rg[q + c] = Rg[was + c]; Rg[q] = prevStep >= 0 ? Math.max(prevStep, step - 2 * PROP_INTERP) : step - 1; } }
        const o = push(k); Rg[o] = step; Rg[o + 1] = pp[j + 1] / PROP_Q; Rg[o + 2] = pp[j + 2] / PROP_Q; Rg[o + 3] = pp[j + 3] / PROP_Q; Rg[o + 4] = pp[j + 4] / ANG_Q; Rg[o + 5] = pp[j + 5] / ANG_Q; Rg[o + 6] = pp[j + 6] / ANG_Q; active[k] = 1; }
      return res; },
    // The step to draw at local time tMs (the host's newest step less PROP_INTERP, on the estimated host clock).
    renderStep(tMs) { return Number.isFinite(st.off) ? tMs * PROP_HZ / 1000 - st.off - PROP_INTERP : st.step; },
    // Prop k's pose at step rs into out [x y z yaw tip dir]; true while rs is still before its newest sample (moving).
    pose(k, rs, out) { let b = slot(k, 0); if (cnt[k] < 2 || rs >= Rg[b]) { for (let q = 0; q < 6; q++) out[q] = Rg[b + 1 + q]; return cnt[k] >= 2 && rs < Rg[b]; }
      let a = b; for (let back = 1; back < cnt[k]; back++) { a = slot(k, back); if (Rg[a] <= rs) break; b = a; }
      if (rs <= Rg[a]) { for (let q = 0; q < 6; q++) out[q] = Rg[a + 1 + q]; return true; }   // (older than every sample kept: the oldest)
      const f = (rs - Rg[a]) / (Rg[b] - Rg[a]);
      for (let q = 1; q <= 3; q++) out[q - 1] = Rg[a + q] + (Rg[b + q] - Rg[a + q]) * f;
      out[3] = lerpA(Rg[a + 4], Rg[b + 4], f); out[4] = Rg[a + 5] + (Rg[b + 5] - Rg[a + 5]) * f; out[5] = lerpA(Rg[a + 6], Rg[b + 6], f); return true; },
  };
}
const lerpA = (a, b, f) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };

// ── The guest's hookup (dist/lab.js, every frame of a GD match whose host sends `pp`) ──
// phys: the scene's arena-physprops object (its netPose / netBreak / reset); its view made for it once (a new map: a new
// phys object). onReset: the scene's whole reset (arena-scene.js physReset: the merged look back too).
// The page's grenades (its throw preview, its copies of the host's flights) bounce off its copy of the props (`shadow`:
// a createPropSim never stepped, put where the host's word draws them), read-only — installed while propsNet runs (a
// map without props, or a host without the field: propsNet stops, and after 1 s the copy answers nothing).
const VIEWS = new WeakMap(), POSE = new Float64Array(6), CLIENT = { shadow: null, at: -1e9 };
const clientHit = (x, y, z, rr, g, o) => CLIENT.shadow !== null && performance.now() - CLIENT.at < 1000 && CLIENT.shadow.nadeHit(x, y, z, rr, 0, 0, 0, o, false);
let netFrame = 0;
export function propsNet(phys, props, pp, tMs, { cx = ARENA.cx, cz = ARENA.cz, onReset = null } = {}) {
  if (!phys || !props?.length || !pp) return false; let v = VIEWS.get(phys); if (!v) { v = createPropView(props, { cx, cz }); v.shadow = createPropSim(props, { cx, cz }); VIEWS.set(phys, v); phys.net = true; }
  if (CLIENT.shadow !== v.shadow) { CLIENT.shadow = v.shadow; setNadeProps(clientHit); } CLIENT.at = performance.now();
  const r = v.ingest(pp, tMs); if (r === 2) { v.shadow.reset(); if (onReset) onReset(); else phys.reset?.(); }
  const rs = v.renderStep(tMs), cap = LOW_DRAW_CAP[gdPresetNow()?.name] || Infinity; netFrame++; let drawn = 0;
  for (let k = 0; k < v.count; k++) { if (v.broken[k] && !phys.broken(k)) { phys.netBreak(k, r === 2); v.shadow.setBroken(k); } if (!v.active[k]) continue;   // (r 2: the first word of a round — what broke before this page saw it goes quietly: a guest joining mid-round sees no old breaks replayed)
    if (drawn >= cap && ((k + netFrame) & 1)) continue; drawn++;   // (Low / Very Low: past the cap, every other frame)
    const live = v.pose(k, rs, POSE); phys.netPose(k, POSE[0], POSE[1], POSE[2], POSE[3], POSE[4], POSE[5]); v.shadow.setPose(k, POSE[0], POSE[1], POSE[2], POSE[3], POSE[4], POSE[5]); if (!live) v.active[k] = 0; }
  return true; }
export const propsViewOf = phys => VIEWS.get(phys) || null;

// ── The host's hookup (lan/room.mjs: propsTick every room tick, propsFrame into every combat frame) ──
const HOST = new WeakMap();
function hostFor(game) {
  const A = game?.arena; if (game?.mode !== 'arena' || !A) return null; const map = ARENA_MAPS[A.map];
  let h = HOST.get(game); if (!map?.physProps?.length) { if (h) { HOST.delete(game); setNadeProps(null); } return null; }
  if (h && h.map === map) return h;
  const cx = ARENA.cx, cz = ARENA.cz, boxes = mapBoxes(map, cx, cz), near = [], out = new Float64Array(4);
  const blocked = boxes.nadeMesh ? (x, z, y, hh, r) => { for (const b of boxes.movers || []) if (!b.off && b.y1 > y + .3 && b.y0 < y + hh && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
      return boxes.nadeMesh.contact(x, y + Math.max(hh * .6, r * 1.05), z, r * .95, out) && Math.abs(out[1]) < .7; }
    : (x, z, y, hh, r) => { for (const b of boxesNear(boxes, x - r, z - r, x + r, z + r, near)) if (!b.off && b.y1 > y + .3 && b.y0 < y + hh && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true; return false; };
  const NM = boxes.nadeMesh, FN = new Float64Array(4), crosses = NM?.first ? (ax, ay, az, bx, by, bz) => { const w = NM.first(ax, ay, az, bx, by, bz, false, FN); return w <= 1 && Math.abs(FN[1]) < .7; } : null;   // (a wall, not a floor or a ramp: as the contact test)
  // The floor under a prop: the map's walkable floor (nav), else — or when higher, under it — CS2's own surface straight
  // below (the grenade triangles: a table, a shelf, a sill; v53 PROPS final: off a table's edge a prop kept the table's
  // height in the air, and a picture knocked off a wall slid along it at its height).
  const floorAt = (x, z, y) => { const f = map.nav?.floorAt?.(x, z, y); if (!NM?.first) return f; const top = y + .5, w = NM.first(x + cx, top, z + cz, x + cx, top - 400, z + cz, false, FN);
    const m = w <= 1 && Math.abs(FN[1]) > .7 ? top - 400 * w : NaN;   // (the normal may face either way)
    return Number.isFinite(m) && !(Number.isFinite(f) && f <= top && f > m) ? m : f; };
  const sim = createPropSim(map.physProps, { cx, cz, floorAt, blocked, crosses });
  h = { map, sim, boxes, round: null, seen: new Map(), booms: new Set(), pos: new Float64Array(3 * 64), dir: [0, 0, 0], bd: [0, 0, 0], offs: new Float64Array(64), frames: { step: -1, epoch: -1, part: null, full: null } };
  h.hit = (x, y, z, rr, g, o) => { o[3] = 0; if (sim.nadeHit(x, y, z, rr, g.vx, g.vy, g.vz, o, !g.view)) return true;   // (a preview or a copy on the host: the contact only)
    if (o[3] === -1) { g.vx *= NADE_THROUGH; g.vy *= NADE_THROUGH; g.vz *= NADE_THROUGH; } return false; };   // (v53 PROPS final: it broke the prop — on through it at 0.4 × its speed, CS:GO)
  HOST.set(game, h); return h; }
export const propsHost = game => HOST.get(game)?.sim || null;
// One room tick. players: the roster (name, pose). True while a prop moves or one broke (the frame must go out).
export function propsTick(game, players, dt, now = Date.now()) {
  const h = hostFor(game); if (!h) return false; setNadeProps(h.hit); const C = game.combat || {}, sim = h.sim, b0 = sim.brokenCount;
  if (C.d?.paused) return false;   // (a paused match: every prop holds where it is)
  // A new round (CS2: the props respawn): the round's id, or a practice round's number, or a new match.
  const rk = (C.d?.round?.id ?? '') + '|' + (C.d?.match ?? game.arena.match ?? '') + '|' + (game.arena.practice?.round?.n ?? '');
  if (h.round !== null && rk !== h.round) { sim.reset(); h.booms.clear(); } h.round = rk;
  // Shots: each player's newest shots (their pose's record): every bullet of each along its own line from the eye — the
  // record's look and aim punch, its inaccuracy and the gun's spread (weapons-data shotOffsets: the very bullets the
  // shooter fired, as weapons.js shotDirs draws them), a shotgun's pellets each — as far as the gun reaches (m_flRange),
  // stopped by the map. (v53 PROPS final: the bare crosshair line once, to 400 units, knocked props the bullets missed.)
  for (const p of players || []) { const q = p?.pose, s = q?.shot, nn = s?.n; if (!Number.isFinite(nn)) continue; const was = h.seen.get(p.name); h.seen.set(p.name, nn);
    if (was === undefined || nn <= was || nn - was > MAX_SHOT_GAP || !Number.isFinite(q.x + q.y + q.z)) continue; const w = weaponById(s.w || q.weapon); if (!w || !isFirearm(w)) continue;   // (a jump past MAX_SHOT_GAP: a restarted counter, no bullets)
    const pu = Array.isArray(s.pu) ? s.pu : null, sp = Number.isFinite(s.sp) ? s.sp : +s.pitch || 0, yaw = Number.isFinite(s.yaw) ? s.yaw : +q.yaw || 0, d = shotBase(sp, yaw, pu ? +pu[0] || 0 : 0, pu ? +pu[1] || 0 : 0, h.dir);
    const o = Array.isArray(s.o) && s.o.length === 3 && Number.isFinite(s.o[0] + s.o[1] + s.o[2]) && Math.hypot(s.o[0] - q.x, s.o[2] - q.z) < 40 ? s.o : null;   // (the eye the shot left from: weapons.js shotRec o — else the pose's)
    const ox = o ? o[0] : q.x, oy = o ? o[1] : q.y, oz = o ? o[2] : q.z, reach = w.reach > 0 ? w.reach : w.range > 0 ? w.range : 400, J = w.pellets > 1 ? PELLET_J : BULLET_J;
    const ia = Number.isFinite(s.ia) ? s.ia : 0, spread = accOf(w, !!s.sc)?.spread || 0, bd = h.bd;
    for (let c = Math.min(3, nn - was); c > 0; c--) { const nb = shotOffsets(w, nn - c + 1, ia, spread, h.offs);
      for (let i = 0; i < nb; i++) { offsetDir(d, h.offs[2 * i], h.offs[2 * i + 1], bd); sim.bullet(ox, oy, oz, bd[0], bd[1], bd[2], Math.min(reach, rayBoxes(h.boxes, ox, oy, oz, bd[0], bd[1], bd[2], reach)), J, w.dmg || 0, w.rangeMod ?? 1); } } }
  // HE blasts: each of the host's grenades once, as it goes off.
  for (const g of C.nades || []) if (g.kind === 'he' && g.phase === 'boom' && !h.booms.has(g.id)) { h.booms.add(g.id); sim.blast(g.x, g.y, g.z, NADES.he.radius, NADES.he.dmg); }
  // Bodies: the players' feet and the bots' — the living only (v53 PROPS final: a dead bot pushed props from where it
  // died for the rest of the round). The roster carries the bots (lan/room.mjs botRoster); the bots list only when not.
  let nb = 0, bots = false; const P = h.pos, cap = P.length / 3;
  for (const p of players || []) { const q = p?.pose; if (p?.bot) bots = true; if (!q || nb >= cap || p.loading || q.active === false || !Number.isFinite(q.x + q.z) || isDown(game, p.name, now)) continue; P[nb * 3] = q.x; P[nb * 3 + 1] = Number.isFinite(q.fy) ? q.fy : (q.y || EYE) - EYE; P[nb * 3 + 2] = q.z; nb++; }
  if (!bots) for (const b of game.arena.bots || []) { if (b.dead || nb >= cap || !Number.isFinite(b.x + b.z) || isDown(game, b.name, now)) continue; P[nb * 3] = b.x; P[nb * 3 + 1] = Number.isFinite(b.y) ? b.y : 0; P[nb * 3 + 2] = b.z; nb++; }
  sim.advance(dt, P, nb);
  return sim.moving() || sim.brokenCount !== b0; }
// The combat frame's field: the snapshot of this step (one array a step, shared by every frame of it), or undefined.
export function propsFrame(game, full = false) {
  const h = HOST.get(game); if (!h || game?.mode !== 'arena' || h.map !== ARENA_MAPS[game.arena?.map]) return undefined; const F = h.frames, sim = h.sim;
  if (F.step !== sim.step || F.epoch !== sim.epoch) { F.step = sim.step; F.epoch = sim.epoch; F.part = F.full = null; }
  return full ? (F.full ??= sim.snapshot(true)) : (F.part ??= sim.snapshot(false)); }
// A knife hit on a prop (the arena action { type: 'prop', i, dx, dy, dz, attack }): checked against the swinger's
// pose (in reach of it), then knocked on the host. CS2's knife damage (not in the files): 40 light, 65 heavy.
export function propsKnife(game, name, a, players) {
  const h = hostFor(game); if (!h) throw Error('Nothing to hit there'); const k = Math.floor(+a.i), q = players?.find(p => p.name === name)?.pose;
  if (!(k >= 0 && k < h.sim.count)) throw Error('Nothing to hit there'); const d = [+a.dx, +a.dy, +a.dz], L = Math.hypot(d[0], d[1], d[2]); if (!(L > .5 && L < 1.5)) throw Error('Bad hit');
  if (q) { const at = h.sim.at(k); if (Math.hypot(at[0] - q.x, at[2] - q.z) > 12 || Math.abs(at[1] - (q.y - EYE)) > 12) throw Error('Too far'); }
  h.sim.knife(k, d[0] / L, d[1] / L, d[2] / L, a.attack === 'heavy' ? 65 : 40); return 'Hit'; }
