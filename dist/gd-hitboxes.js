// CS2's hit boxes on every Global Defensive body (v53 AGENTS, H8): the host's hit test (combat-logic.js traceShot) and
// the shooter's own prediction (weapons.js), and the tracers other players see (lab.js traceRemote) all call rayHit()
// here, with the same pose (feet, yaw, crouched, the item in hand, the look's pitch, the side's agent), so a guest's
// predicted hit group is the host's.
//
// Where the shapes come from: the agents' models in the host's own CS2 install. Every agent vmdl carries one hit box
// set, "cstrike" (m_hitboxsets in an MDAT block, read with Source2Viewer-CLI): 19 capsules (m_nShapeType 2), each on
// one bone (m_sBoneName), its two end points in that bone's frame (m_vMinBounds / m_vMaxBounds, Hammer units), its
// radius (m_flShapeRadius) and its hit group (m_nGroupId). The set is the same in all 11 agents read.
// tools/import-cs2-sleeves.mjs reads it and hangs the capsules on the agent's own skeleton posed as the game draws it
// (cs2-agents.js makeAgent with CS2's own clips): every item's own hold (each gun, knife, grenade, the bomb: the clip
// and grip cs2-agents gives it — 37 distinct poses a side), standing and crouched, each side's own agent; written in the
// body's frame (feet at the origin, facing −z: the avatar convention) to user-assets/hitboxes/cs2-hitboxes-<sha8>.json
// (manifest models.hitboxes, file version 2) — Valve's numbers, local only, never committed. The room (lan/room.mjs)
// and every page (cs2-agents.js loadAgents) install it with useHitboxes(), both only with CS2's agents drawn; a guest
// gets the host's file (the room serves user-assets), so both agree.
// Without it (CI, a computer without CS2): the built-in shape, weapons-data.js rayBody (ours), exactly as before.
//
// The look's pitch: cs2-agents.js bends the drawn chest where the player looks — the pitch (clamped to ±1.2 rad) shared
// a third each over spine_1, spine_2 and spine_3, about the body's right through each bone (the head, the arms and the
// gun ride spine_3). The file keeps, per pose, those three pivots, the axis and each capsule's level (the highest of the
// three spine bones it hangs under); rayHit turns the ray into each level's frame by the same three turns, so the
// capsules sit on the drawn chest at any pitch (checked: tests/gd-hitboxes.mjs, against the agent posed at ±0.3 … ±1.2
// rad — 0.00 HU). The pitch is the pose's (pose.shot.pitch), the host's rewound to the shooter's moment (lag-comp.js).
//
// Hit groups: m_nGroupId is Source's HITGROUP number (the numbering is the engine's, not the files'): 1 head, 2 chest,
// 3 stomach (CS2 puts the pelvis and spine_0 here), 4 / 5 left / right arm (hands included), 6 / 7 left / right leg
// (ankles included), 8 neck. Damage keeps our existing multipliers (weapons-data.js HIT_GROUPS, hitDamage): a group is
// scored as the zone with CS2's multiplier for it — head ×hs, chest / arms / neck ×1, stomach ×1.25, legs ×0.75 — the
// arms and the neck as 'chest' so the vest covers them (CS:GO's IsArmored covers the arms; the neck's ×1 and armour are
// the engine's code, not in the files: not verified). out.group keeps the CS2 group for anyone who needs it.
//
// Not like CS2 (yet): CS2 poses the capsules every tick from the animated body (walk cycles, a reload, a jump, a
// shot's kick); here each body is its item's idle hold, standing or crouched, turned by the yaw and bent by the pitch.
// The host has no animation to sample, and a fixed pose is what lets host and guest agree exactly.
// Allocation-free per ray (numbers and typed arrays only); a bounding cylinder rejects most rays before any capsule.
import { rayBody, weaponById, HU } from './weapons-data.js';

// CS2 hit group → our damage zone (see above), and its name (Source's HITGROUP order).
export const GROUP_ZONE = Object.freeze([null, 'head', 'chest', 'stomach', 'chest', 'chest', 'legs', 'legs', 'chest']);
export const GROUP_NAME = Object.freeze(['generic', 'head', 'chest', 'stomach', 'left arm', 'right arm', 'left leg', 'right leg', 'neck']);
export const PITCH_MAX = 1.2;   // (cs2-agents.js: the drawn chest's pitch, clamped to ±1.2 rad, a third on each of spine_1 … _3)
const STRIDE = 8;               // per capsule: ax ay az bx by bz r group (game units, the body's frame)
let T = null;                   // installed: { ct: { poses: { key: { stand, crouch } }, ids: { item id: key } }, t: …, meta }

// The pose a held item gives the body, as cs2-agents.js setGun picks its clip (that module needs three.js; the host
// does not load it): the file names every item the importer posed (ids); an item it does not name (a newer gun) takes
// cs2-agents' own fallback — a knife the side's knife, a grenade CS2's grenade hold, the bomb its own, a pistol the
// pistol's, else a rifle's (CS2's AK hold).
const KNIFE_ID = /knife|karambit|butterfly|stiletto|^m9$|^(bayonet|skeleton|talon|flip|nomad)$/, NADES = ['he', 'flash', 'smoke', 'molotov', 'incendiary', 'incgrenade', 'decoy'];
const own = (S, k) => S.ids[k] || null;   // (S.ids has no prototype: only the file's own items)
export function holdOf(id, side = 'ct') {
  if (!T) return null; const S = T[side === 't' ? 't' : 'ct']; id = id ? String(id) : 'ak'; const k = own(S, id); if (k) return k;
  if (KNIFE_ID.test(id)) return own(S, side === 't' ? 'knife-t' : 'knife') || own(S, 'knife') || S.base;
  if (NADES.includes(id)) return own(S, 'he') || S.base; if (id === 'c4') return own(S, 'c4') || S.base;
  return weaponById(id)?.kind === 'pistol' ? own(S, 'pistol') || S.base : S.base;
}
// The item a body is drawn holding: its weapon, but the knife is the one the player chose (game.arena.knives, as the
// dress draws it: weapon-models.js knifeFor) or the side's own (CS2's T knife on a T).
export function heldId(weapon, knife = null, side = 'ct') {
  if (weapon !== 'knife') return weapon || null;
  if (knife && knife !== 'knife' && KNIFE_ID.test(String(knife)) && T && Object.hasOwn(T[side === 't' ? 't' : 'ct'].ids, knife)) return String(knife);
  return side === 't' ? 'knife-t' : 'knife';
}
// The side a body is drawn as (gd-soldiers.js sideOf, copied for the same reason; the test checks it): its team, or in
// deathmatch a stable pick by name — so host and guest pick the same agent's capsules.
const hashName = s => { let h = 7; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const bodySide = (name, team) => team === 't' || team === 'ct' ? team : hashName(String(name || '').trim().toLowerCase()) % 2 ? 'ct' : 't';
// The body a player is drawn as, for rayHit — ONE rule for the host (combat-logic traceShot) and every page (lab.js
// shootTargets): out.side (its team, game.combat.d.teams, else the deathmatch pick), out.held (the item in hand, the
// chosen knife: game.arena.knives) and out.pitch (the look the chest is bent by). weapon / pitch: the pose's — the host's
// rewound to the moment the shooter saw, a page's as it draws the body then (multiplayer.js). → out (no allocation).
export function bodyFor(game, name, weapon, pitch, out) {
  const k = String(name || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';   // (combat-logic / arena-defuse key)
  out.side = bodySide(name, game?.combat?.d?.teams?.[k] || null); out.held = heldId(weapon, game?.arena?.knives?.[k] || null, out.side); out.pitch = Number.isFinite(pitch) ? pitch : 0;
  return out;
}

// The pitch's turns. For a turn th (a third of the pitch) about unit u through the pivots P1..P3 (spine_1..3), level L's
// capsules move by Rot_P1 ∘ … ∘ Rot_PL — all about one axis, so (A, b) = (R^L, Σ): x' = A x + b. Written into M (48
// numbers: 4 levels × [A row-major 9, b 3]; level 0 the identity).
const RM = new Float64Array(9), TH = new Float64Array(1);   // (TH[0]: the turn — passed in a typed array, not as an argument: a double argument to a call V8 does not inline is boxed)
function levels(P, M) {
  const th = TH[0], ux = P.u[0], uy = P.u[1], uz = P.u[2], c = Math.cos(th), s = Math.sin(th), k = 1 - c;
  RM[0] = c + ux * ux * k; RM[1] = ux * uy * k - uz * s; RM[2] = ux * uz * k + uy * s;
  RM[3] = uy * ux * k + uz * s; RM[4] = c + uy * uy * k; RM[5] = uy * uz * k - ux * s;
  RM[6] = uz * ux * k - uy * s; RM[7] = uz * uy * k + ux * s; RM[8] = c + uz * uz * k;
  for (let L = 0; L < 4; L++) { const o = L * 12;
    // start from the identity, then for j = L … 1: (A, b) ← (R·A, R·(b − Pj) + Pj)
    for (let e = 0; e < 12; e++) M[o + e] = e === 0 || e === 4 || e === 8 ? 1 : 0;
    for (let j = L; j >= 1; j--) { const px = P.piv[(j - 1) * 3], py = P.piv[(j - 1) * 3 + 1], pz = P.piv[(j - 1) * 3 + 2];
      for (let col = 0; col < 3; col++) { const a0 = M[o + col], a1 = M[o + 3 + col], a2 = M[o + 6 + col]; M[o + col] = RM[0] * a0 + RM[1] * a1 + RM[2] * a2; M[o + 3 + col] = RM[3] * a0 + RM[4] * a1 + RM[5] * a2; M[o + 6 + col] = RM[6] * a0 + RM[7] * a1 + RM[8] * a2; }
      const b0 = M[o + 9] - px, b1 = M[o + 10] - py, b2 = M[o + 11] - pz;
      M[o + 9] = RM[0] * b0 + RM[1] * b1 + RM[2] * b2 + px; M[o + 10] = RM[3] * b0 + RM[4] * b1 + RM[5] * b2 + py; M[o + 11] = RM[6] * b0 + RM[7] * b1 + RM[8] * b2 + pz; } }
}
const thOf = pitch => Number.isFinite(pitch) ? Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch)) / 3 : 0;
// One posed set ({ caps: [[ax, ay, az, bx, by, bz, r, group] …] HU, piv: [spine_1, _2, _3 xyz] HU, axis }) and the
// capsules' levels → game units, with its bounding cylinder over every pitch (sampled; a margin for the arcs between).
const LV = new Float64Array(48);
function packPose(e, lvl) {
  const list = e?.caps; if (!Array.isArray(list) || !list.length || list.length > 64 || lvl.length !== list.length) return null;
  if (!Array.isArray(e.piv) || e.piv.length !== 9 || !e.piv.every(Number.isFinite) || !Array.isArray(e.axis) || e.axis.length !== 3 || !e.axis.every(Number.isFinite)) return null;
  const ul = Math.hypot(...e.axis); if (Math.abs(ul - 1) > 1e-3) return null;
  const caps = new Float64Array(list.length * STRIDE), P = { caps, n: list.length, lvl, piv: Float64Array.from(e.piv, v => v * HU), u: Float64Array.from(e.axis, v => v / ul), R: 0, top: 0, low: Infinity };
  for (let i = 0; i < list.length; i++) { const c = list[i]; if (!Array.isArray(c) || c.length !== 8 || !c.every(Number.isFinite)) return null; const g = c[7] | 0;
    if (!(c[6] > 0 && c[6] < 30) || g < 0 || g > 8 || g !== c[7]) return null;
    for (let k = 0; k < 7; k++) caps[i * STRIDE + k] = c[k] * HU; caps[i * STRIDE + 7] = g; }
  for (let s = -24; s <= 24; s++) { TH[0] = PITCH_MAX / 3 * s / 24; levels(P, LV);
    for (let i = 0; i < P.n; i++) { const M = lvl[i] * 12, r = caps[i * STRIDE + 6] + .5 * HU;   // (+0.5 HU: the arc between two samples)
      for (const o of [0, 3]) { const x = caps[i * STRIDE + o], y = caps[i * STRIDE + o + 1], z = caps[i * STRIDE + o + 2];
        const X = LV[M] * x + LV[M + 1] * y + LV[M + 2] * z + LV[M + 9], Y = LV[M + 3] * x + LV[M + 4] * y + LV[M + 5] * z + LV[M + 10], Z = LV[M + 6] * x + LV[M + 7] * y + LV[M + 8] * z + LV[M + 11];
        P.R = Math.max(P.R, Math.hypot(X, Z) + r); P.top = Math.max(P.top, Y + r); P.low = Math.min(P.low, Y - r); } } }
  return P;
}
// Install a hit box file (cs2-hitboxes-*.json, version 2: tools/import-cs2-sleeves.mjs) or remove it (null). → true when
// installed. sides.ct / sides.t: { lvl, poses: { key: { stand, crouch } }, ids: { item: key } } (each side's agent).
export function useHitboxes(json) {
  T = null; if (!json || json.version !== 2 || !json.sides) return false;
  const next = {};
  for (const side of ['ct', 't']) { const J = json.sides[side]; if (!J || typeof J.poses !== 'object' || typeof J.ids !== 'object' || !Array.isArray(J.lvl)) return false;
    if (!J.lvl.every(v => v === 0 || v === 1 || v === 2 || v === 3)) return false; const lvl = Uint8Array.from(J.lvl);
    const S = { poses: Object.create(null), ids: Object.create(null), base: 'ak' };
    for (const [k, p] of Object.entries(J.poses)) { const st = packPose(p?.stand, lvl), cr = packPose(p?.crouch, lvl); if (!st || !cr) return false; S.poses[k] = { stand: st, crouch: cr }; }
    for (const [id, k] of Object.entries(J.ids)) { if (!S.poses[k]) return false; S.ids[id] = k; }
    if (!S.poses.ak || S.ids.ak !== 'ak') return false; next[side] = S; }
  next.meta = { from: String(json.from || ''), agents: json.agents || null, count: next.ct.poses.ak.stand.n, poses: Object.keys(next.ct.poses).length + Object.keys(next.t.poses).length };
  T = next; return true;
}
export const hitboxesOn = () => !!T;
export const hitboxInfo = () => T ? T.meta : null;
// The installed pose for an item (game units, the body's frame, at pitch 0) — for the tests and the overlay picture.
// null without a file.
export const hitboxPose = (item = 'ak', crouched = false, side = 'ct') => T ? T[side === 't' ? 't' : 'ct'].poses[holdOf(item, side)][crouched ? 'crouch' : 'stand'] : null;
// A capsule's end points as rayHit sees them at that pitch (game units, the body's frame) → out[0..5]: the overlay
// picture and the tests.
export function capsuleAt(P, i, pitch, out) {
  TH[0] = thOf(pitch); levels(P, LV); const M = P.lvl[i] * 12, C = P.caps;
  for (let o = 0; o <= 3; o += 3) { const x = C[i * STRIDE + o], y = C[i * STRIDE + o + 1], z = C[i * STRIDE + o + 2];
    out[o] = LV[M] * x + LV[M + 1] * y + LV[M + 2] * z + LV[M + 9]; out[o + 1] = LV[M + 3] * x + LV[M + 4] * y + LV[M + 5] * z + LV[M + 10]; out[o + 2] = LV[M + 6] * x + LV[M + 7] * y + LV[M + 8] * z + LV[M + 11]; }
  return out;
}

// THE hit test for a body (host and shooter alike). Ray: origin o, unit direction d (world, game units). The body: feet
// at (fx, fy, fz), facing yaw (the pose's: forward is (−sin yaw, −cos yaw)), crouched or not, holding `held` (an item id:
// heldId; null: a rifle's pose), drawn as `side`'s agent (bodySide), looking `pitch` up (+) or down (−). pad: extra
// radius (the host's tolerance). → the distance to the first capsule hit or −1; out.zone = its damage zone, out.group =
// CS2's hit group, out.box = the capsule's index in the set. Without an installed file, rayBody (the built-in shape;
// out.group 0).
const RY = new Float64Array(24);   // the ray in each level's frame: 4 × [o, d]
export function rayHit(ox, oy, oz, dx, dy, dz, fx, fy, fz, yaw = 0, crouched = false, pad = 0, out = null, held = null, side = 'ct', pitch = 0) {
  if (!T) { const t = rayBody(ox, oy, oz, dx, dy, dz, fx, fy, fz, crouched, pad, out); if (out) { out.group = 0; out.box = -1; } return t; }
  const sd = side === 't' ? 't' : 'ct', S = T[sd].poses[holdOf(held, sd)][crouched ? 'crouch' : 'stand'], c = Math.cos(Number.isFinite(yaw) ? yaw : 0), s = Math.sin(Number.isFinite(yaw) ? yaw : 0);
  // into the body's frame: local = R(−yaw) · (world − feet)
  const wx = ox - fx, wy = oy - fy, wz = oz - fz, lx = c * wx - s * wz, ly = wy, lz = s * wx + c * wz, ldx = c * dx - s * dz, ldy = dy, ldz = s * dx + c * dz;
  // bounding cylinder (axis y, radius S.R + pad, from S.low to S.top, over every pitch): the nearest approach in plan, then the heights
  const R = S.R + pad, hh = ldx * ldx + ldz * ldz;
  if (hh > 1e-12) { const tc = -(lx * ldx + lz * ldz) / hh, px = lx + ldx * tc, pz = lz + ldz * tc; if (px * px + pz * pz > R * R) return miss(out);
    const half = Math.sqrt((R * R - px * px - pz * pz) / hh), y0 = ly + ldy * (tc - half), y1 = ly + ldy * (tc + half); if (Math.max(y0, y1) < S.low - pad || Math.min(y0, y1) > S.top + pad || tc + half < 0) return miss(out); }
  else if (lx * lx + lz * lz > R * R) return miss(out);
  // the pitch: the ray into each level's frame (x = Aᵀ(x' − b): the capsules stay as filed); level 0 the body's frame
  const th = thOf(pitch), bent = Math.abs(th) > 1e-6;
  RY[0] = lx; RY[1] = ly; RY[2] = lz; RY[3] = ldx; RY[4] = ldy; RY[5] = ldz;
  if (bent) { TH[0] = th; levels(S, LV); for (let L = 1; L < 4; L++) { const M = L * 12, q = L * 6, ex = lx - LV[M + 9], ey = ly - LV[M + 10], ez = lz - LV[M + 11];
    RY[q] = LV[M] * ex + LV[M + 3] * ey + LV[M + 6] * ez; RY[q + 1] = LV[M + 1] * ex + LV[M + 4] * ey + LV[M + 7] * ez; RY[q + 2] = LV[M + 2] * ex + LV[M + 5] * ey + LV[M + 8] * ez;
    RY[q + 3] = LV[M] * ldx + LV[M + 3] * ldy + LV[M + 6] * ldz; RY[q + 4] = LV[M + 1] * ldx + LV[M + 4] * ldy + LV[M + 7] * ldz; RY[q + 5] = LV[M + 2] * ldx + LV[M + 5] * ldy + LV[M + 8] * ldz; } }
  // each capsule: the unit ray against it, all in its level's frame — the distance to the first entry; a ray starting
  // inside counts as no hit, as the old shape did. (Ray–capsule intersection: the infinite cylinder about AB, kept between
  // the ends, else the nearer end's sphere.) Written out here, not called: V8 boxes the doubles passed to a call it does
  // not inline (13 a capsule).
  const C = S.caps; let best = -1, bi = -1;
  for (let i = 0, o = 0; i < S.n; i++, o += STRIDE) { const q = bent ? S.lvl[i] * 6 : 0, ox = RY[q], oy = RY[q + 1], oz = RY[q + 2], dx = RY[q + 3], dy = RY[q + 4], dz = RY[q + 5];
    const ax = C[o], ay = C[o + 1], az = C[o + 2], bx = C[o + 3], by = C[o + 4], bz = C[o + 5], r = C[o + 6] + pad;
    const bax = bx - ax, bay = by - ay, baz = bz - az, oax = ox - ax, oay = oy - ay, oaz = oz - az;
    const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz, rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
    const qa = baba - bard * bard, qb = baba * rdoa - baoa * bard, qc = baba * oaoa - baoa * baoa - r * r * baba;
    let t = -1, side = true;   // (side: the cylinder's wall missed or not reached — try the end spheres)
    if (qa > 1e-12) { const h = qb * qb - qa * qc; if (h < 0) side = false; else { const tt = (-qb - Math.sqrt(h)) / qa, y = baoa + tt * bard; if (y > 0 && y < baba) { side = false; if (tt > 0) t = tt; } } }
    if (side) for (let k = 0; k < 2; k++) { const cx = k ? ox - bx : oax, cy = k ? oy - by : oay, cz = k ? oz - bz : oaz, b = dx * cx + dy * cy + dz * cz, c2 = cx * cx + cy * cy + cz * cz - r * r, h = b * b - c2;   // the end caps: the sphere at A and at B, the nearer entry
      if (h >= 0) { const tt = -b - Math.sqrt(h); if (tt > 0 && (t < 0 || tt < t)) t = tt; } }
    if (t > 0 && (best < 0 || t < best)) { best = t; bi = i; } }
  if (out) { if (bi >= 0) { const g = C[bi * STRIDE + 7] | 0; out.group = g;   /* (| 0: a small integer — a double stored where 0 is also stored is boxed each time) */ out.zone = GROUP_ZONE[g] || 'chest'; out.box = bi; } else { out.group = 0; out.zone = null; out.box = -1; } }
  return best;
}
function miss(out) { if (out) { if (out.zone !== null) out.zone = null; if (out.group !== 0) out.group = 0; if (out.box !== -1) out.box = -1; } return -1; }   // (written only when they change: a store can box)
