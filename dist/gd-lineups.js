// Global Defensive · lineups (v53 S2, SPEC 1.3): CS2's getpos / setpos / setang in this game's units, and the lineup
// library a Practice session shows. Pure (no DOM, no three.js): the console (gd-console.js), the practice tools
// (arena-practice.js), the room (lan/room.mjs: the per-user file) and the tests all use it.
//  · Coordinates. A CS2 map file (arena-maps.js: map.hammer = its Hammer → game transform) is in CS2's own units, so a
//    getpos line from CS2 is a getpos line here, number for number: x y z = the EYE in Hammer units (CS2 prints
//    origin + view offset — 64.06 standing, 46.04 crouched: arena-nades.js NADE_EYE), setang pitch (down positive)
//    yaw (degrees, 0 = +x, counter-clockwise) roll. A built-in map (no file) has no Hammer frame: its getpos is in
//    Hammer-sized units round the arena's middle (x east, y north, z up) — exact both ways, but not CS2's numbers.
//    The game's look angles: pitch up positive (radians), yaw = the camera's rotation.y = CS2 yaw − 90°.
//  · Text. formatPos prints CS2's form, 6 decimals ("%f": 1e-6 units, far under a grenade's 0.001-unit determinism);
//    parsePos reads it back (also "setpos_exact", commas, a missing setang); a line printed and read back is the same
//    line (tests/gd-practice-console.mjs).
//  · A lineup: { id, map, name, kind (smoke / flash / he / molotov / incendiary / decoy), button (left / right / both),
//    move (stand / crouch / jump / runjump / walk / run), pos (its getpos line), place (CS2's place it lands in), land
//    ([x, y, z] Hammer: CS2's own landing / pop point, when known), air (s, from the release, when known), src, notes,
//    pic, user (true: the player's own), pop (a flash: a pop-flash over a wall — popFlash) }. cleanLineup checks one (the room keeps only clean ones).
//  · Throw: lineupThrow(L, frame) = the release state a player standing on the spot and throwing as the lineup says
//    gives (arena-nades.js throwPacket fields: feet → eye, raw angles, strength, a jump-throw's take-off speed) — what
//    the practice tools' "throw it for me" and tests/gd-lineups.mjs fly with arena-nades.js simThrow (the game's one
//    fixed-step flight, CS2's 0.104 s throw delay included: cs2Release).
//  · Aim: aimOff(L, pitch, yaw) = how far your angles are from the lineup's, in degrees (the larger of the pitch and
//    the yaw differences, yaw wrapped); AIM_OK 0.1° — the practice target turns green within it.
// The shipped seeds (gd-lineup-seeds.js) are public getpos lines with CS2's recorded landing points; the player's own
// (user-assets/lineups/<map>.json, git-ignored, through the room: GET / POST /api/lineups/<map>) are added to them.
import { SEEDS } from './gd-lineup-seeds.js';

export const HU = 2.54 / 16.5;
export const EYE_HU = { stand: 64.0626, duck: 46.045 };   // (arena-nades.js NADE_EYE, in Hammer units: the eye a getpos line names)
export const JUMP_HU = 301.993;   // (arena-move.js MOVE.jump: sv_jump_impulse)
export const RUN_HU = 245;        // (weapons.vdata m_flMaxSpeed of every grenade: a run-jump throw at full speed)
export const AIM_OK = .1;         // degrees (SPEC 1.3: the aim target turns green within 0.1°)
export const KINDS = ['smoke', 'flash', 'he', 'molotov', 'incendiary', 'decoy'], BUTTONS = ['left', 'right', 'both'], MOVES = ['stand', 'crouch', 'jump', 'runjump', 'walk', 'run'];
export const STRENGTH_OF = { left: 'long', right: 'short', both: 'medium' };
export const MAX_USER = 200;   // lineups a player keeps per map
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// The Hammer ↔ game frame of a map (arena-maps.js entry, the arena's middle cx / cz). Into `out` arrays (reused).
export function mapFrame(M, cx, cz) {
  const H = M?.hammer;
  if (H) return { cs2: true,
    toGame: (x, y, z, o = [0, 0, 0]) => { o[0] = cx + (x - H.x0) * H.U - H.W / 2; o[1] = (z - H.zLow) * H.U; o[2] = cz + (H.y1 - y) * H.U - H.D / 2; return o; },
    toHammer: (gx, gy, gz, o = [0, 0, 0]) => { o[0] = H.x0 + (gx - cx + H.W / 2) / H.U; o[1] = H.y1 - (gz - cz + H.D / 2) / H.U; o[2] = H.zLow + gy / H.U; return o; } };
  return { cs2: false,
    toGame: (x, y, z, o = [0, 0, 0]) => { o[0] = cx + x * HU; o[1] = z * HU; o[2] = cz - y * HU; return o; },
    toHammer: (gx, gy, gz, o = [0, 0, 0]) => { o[0] = (gx - cx) / HU; o[1] = -(gz - cz) / HU; o[2] = gy / HU; return o; } };
}
// CS2's setang (degrees: pitch down positive, yaw from +x counter-clockwise) ↔ the game's look (radians: pitch up
// positive, yaw = rotation.y). Yaw comes back in (−180, 180].
export const toLook = (pitchDeg, yawDeg, o = { pitch: 0, yaw: 0 }) => { o.pitch = -pitchDeg * D2R; o.yaw = (yawDeg - 90) * D2R; return o; };
export const wrapDeg = a => { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; };
export const fromLook = (pitch, yaw, o = { pitch: 0, yaw: 0 }) => { o.pitch = -pitch * R2D; o.yaw = wrapDeg(yaw * R2D + 90); return o; };

const f6 = v => { const s = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6); return s === '-0.000000' ? '0.000000' : s; };
// CS2's getpos form: "setpos x y z;setang pitch yaw roll".
export function formatPos(p) { return `setpos ${f6(p.x)} ${f6(p.y)} ${f6(p.z)};setang ${f6(p.pitch)} ${f6(p.yaw)} ${f6(p.roll || 0)}`; }
const NUM = '([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?)', SEP = '[\\s,]+';
const RE_POS = new RegExp('setpos(?:_exact)?\\s+' + NUM + SEP + NUM + SEP + NUM, 'i'), RE_ANG = new RegExp('setang(?:_exact)?\\s+' + NUM + SEP + NUM + '(?:' + SEP + NUM + ')?', 'i');
// A getpos line (or just its setpos / setang half) → { x, y, z, pitch, yaw, roll, hasPos, hasAng }, or null.
export function parsePos(text) {
  const s = String(text ?? ''), p = RE_POS.exec(s), a = RE_ANG.exec(s); if (!p && !a) return null;
  const n = v => { const x = +v; return Number.isFinite(x) ? x : NaN; };
  const o = { x: p ? n(p[1]) : NaN, y: p ? n(p[2]) : NaN, z: p ? n(p[3]) : NaN, pitch: a ? n(a[1]) : NaN, yaw: a ? n(a[2]) : NaN, roll: a && a[3] !== undefined ? n(a[3]) : 0, hasPos: !!p, hasAng: !!a };
  if (p && !Number.isFinite(o.x + o.y + o.z)) return null; if (a && !Number.isFinite(o.pitch + o.yaw)) return null; return o; }

// Where a lineup is thrown from: the feet (game units) and the look, for a frame.
export function lineupStand(L, frame, out = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, duck: 0 }) {
  const p = parsePos(L.pos), duck = L.move === 'crouch' ? 1 : 0, g = frame.toGame(p.x, p.y, p.z - (duck ? EYE_HU.duck : EYE_HU.stand));
  out.x = g[0]; out.y = g[1]; out.z = g[2]; const l = toLook(p.pitch, p.yaw); out.pitch = l.pitch; out.yaw = l.yaw; out.duck = duck; return out; }
// The release state of a lineup thrown as written (throwPacket's fields): standing / crouched still, a jump-throw
// (the take-off: the full jump impulse; cs2Release then moves it on by CS2's throw delay), a run-jump or a run at a
// grenade's full speed along the yaw, a walk at CS2's walk share (0.52) of it.
export function lineupThrow(L, frame) {
  const s = lineupStand(L, frame), air = L.move === 'jump' || L.move === 'runjump', run = L.move === 'runjump' || L.move === 'run' ? RUN_HU : L.move === 'walk' ? RUN_HU * .52 : 0;
  const v = run * HU; return { x: s.x, y: s.y, z: s.z, duck: s.duck, pitch: s.pitch, yaw: s.yaw, vx: -Math.sin(s.yaw) * v, vy: air ? JUMP_HU * HU : 0, vz: -Math.cos(s.yaw) * v, strength: STRENGTH_OF[L.button] || 'long', frac: 0, jt: air ? 1 : 0 }; }
// How far the look (game radians) is from the lineup's angles, degrees (the larger of the two differences).
export function aimOff(L, pitch, yaw) { const p = L._ang || (L._ang = parsePos(L.pos)), a = fromLook(pitch, yaw, AO); return Math.max(Math.abs(a.pitch - p.pitch), Math.abs(wrapDeg(a.yaw - p.yaw))); }
const AO = { pitch: 0, yaw: 0 };
export const aimed = (L, pitch, yaw) => aimOff(L, pitch, yaw) <= AIM_OK + 1e-9;
// A pop-flash (v53 S2 review, SPEC 1.3: "the pop height above walls must blind players round the corner while not
// blinding the thrower when they turn away"): the flash thrown as written (N: arena-nades.js — simThrow, throwPacket,
// flashBlind, lookDir — passed in so this module stays light) pops where the thrower, still on the spot and turned away
// (yaw + 180°, level), is blinded for at most POP_AWAY_MS in all, and a viewer round the corner — 150–500 HU from the
// pop (16 directions × 8 distances × 4 heights), who sees the pop but not the thrower's eye — facing it is blinded for
// at least POP_VICTIM_MS. On a CS2 map (its grenade mesh) only; null elsewhere. Used by the seed picker (the seeds'
// pop: true) and tests/gd-lineups.mjs (each pop: true seed checked). Returns { pop, awayMs, victimMs }.
export const POP_AWAY_MS = 250, POP_VICTIM_MS = 1000;
export function popFlash(L, frame, boxes, bounds, N) {
  const M = boxes?.nadeMesh; if (!M || L.kind !== 'flash') return null; const T = lineupThrow(L, frame), P = N.throwPacket(T), g = N.simThrow('flash', P, boxes, bounds, 4000); if (!g.off) return { pop: false, awayMs: NaN, victimMs: 0 };
  const ex = T.x, ey = P.y, ez = T.z, aw = N.lookDir(0, T.yaw + Math.PI), A = N.flashBlind(boxes, g.x, g.y, g.z, ex, ey, ez, aw.dx, aw.dy, aw.dz), awayMs = A.hold + A.fade; let victimMs = 0;
  for (let r = 150; r <= 500; r += 50) for (let k = 0; k < 16; k++) { const vx = g.x + Math.cos(k * Math.PI / 8) * r * HU, vz = g.z + Math.sin(k * Math.PI / 8) * r * HU;
    for (const up of [0, -64, -128, -200]) { const vy = g.y + up * HU, dx = g.x - vx, dy = g.y - vy, dz = g.z - vz, n = Math.hypot(dx, dy, dz);
      if (M.blocked(vx, vy, vz, g.x, g.y, g.z, true) || !M.blocked(ex, ey, ez, vx, vy, vz, true)) continue; const B = N.flashBlind(boxes, g.x, g.y, g.z, vx, vy, vz, dx / n, dy / n, dz / n); victimMs = Math.max(victimMs, B.hold + B.fade); } }
  return { pop: awayMs <= POP_AWAY_MS && victimMs >= POP_VICTIM_MS, awayMs, victimMs }; }

// One lineup made safe to keep (a player's own, a file read back): known kinds / buttons / moves, a readable getpos
// line (both halves), short text. null when it is not a lineup.
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
export function cleanLineup(o, map) {
  if (!o || typeof o !== 'object') return null; const p = parsePos(o.pos); if (!p?.hasPos || !p.hasAng) return null;
  const kind = KINDS.includes(o.kind) ? o.kind : null, button = BUTTONS.includes(o.button) ? o.button : 'left', move = MOVES.includes(o.move) ? o.move : 'stand'; if (!kind) return null;
  const land = Array.isArray(o.land) && o.land.length === 3 && o.land.every(Number.isFinite) ? o.land.map(Number) : null, air = Number.isFinite(+o.air) && +o.air > 0 && +o.air < 30 ? +o.air : null;
  return { id: txt(o.id, 64) || 'u' + Math.abs(hash(o.pos + kind)).toString(36), map: txt(map ?? o.map, 24), name: txt(o.name, 80) || 'Lineup', kind, button, move, pos: formatPos(p), place: txt(o.place, 40), land, air, notes: txt(o.notes, 400), pic: /^[a-z0-9][a-z0-9_.\-\/]*\.(jpg|png|webp)$/i.test(o.pic || '') ? o.pic : '', src: txt(o.src, 200), user: !!o.user, ...(kind === 'flash' && o.pop === true ? { pop: true } : {}) };   // (pop: a pop-flash — popFlash)
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
// A lineup from the current getpos (the console's lineup_save): what is in hand, how it is thrown.
export function lineupFrom(map, posLine, { name = '', kind = 'smoke', button = 'left', move = 'stand', notes = '', place = '' } = {}) {
  return cleanLineup({ id: 'u' + Date.now().toString(36), name, kind, button, move, pos: posLine, notes, place, user: true }, map); }
// lineup_save's words (v53 S2 review): "[name …] [left|right|both] [stand|crouch|jump|runjump|walk|run]" — the button
// and the move may end the line, in either order; without them, the last throw's (last: its packet — strength, jt),
// else crouched / standing as `duck` says, left click. → { name, button, move }.
export function saveArgs(text, last = null, duck = 0) {
  const w = String(text ?? '').trim().split(/\s+/).filter(Boolean); let button = null, move = null;
  while (w.length) { const t = w[w.length - 1].toLowerCase(); if (!button && BUTTONS.includes(t)) button = t; else if (!move && MOVES.includes(t)) move = t; else break; w.pop(); }
  button ??= last ? BUTTONS.find(b => STRENGTH_OF[b] === last.strength) || 'left' : 'left'; move ??= last?.jt ? 'jump' : duck >= .5 ? 'crouch' : 'stand';
  return { name: w.join(' '), button, move }; }
// The shipped seeds of a map (copies), then the player's own (cleaned).
export function seedsFor(map) { return (SEEDS[map] || []).map(L => ({ ...L, map, land: L.land ? L.land.slice() : null })); }
export function lineupsFor(map, user = []) { const out = seedsFor(map), ids = new Set(out.map(l => l.id)); for (const u of Array.isArray(user) ? user : []) { const c = cleanLineup({ ...u, user: true }, map); if (c && !ids.has(c.id)) { ids.add(c.id); out.push(c); } } return out; }
// The player's file (user-assets/lineups/<map>.json): { map, lineups: [...] } — at most MAX_USER, the newest kept.
export function userFile(map, list) { const out = []; for (const u of Array.isArray(list) ? list : []) { const c = cleanLineup({ ...u, user: true }, map); if (c) out.push(c); } return { map, version: 1, lineups: out.slice(-MAX_USER) }; }
export const MAP_ID = /^[a-z0-9_]{1,24}$/;
