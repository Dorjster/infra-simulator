// Global Defensive combat, decided by the host (the LAN room, also for solo play). A shooter's client reports a hit
// on another player; the host checks it (they own the gun, it has a round for that shot, it isn't firing faster than
// the gun can, the target is in range and not behind a wall) and only then applies the damage through the one shared
// rule (weapons-data.js hitDamage: armor, one head shot kills). At 0 HP a player is down: in deathmatch they respawn,
// in Defuse they watch until the next round.
//
// Ammo is host state too: game.combat.ammo[player][gun] = [magazine, reserve]. Clients number their shots (pose
// shot.n, and every hit carries its shot number); the host takes one round per new shot number, in order, whichever
// arrives first. A hit for a shot fired with an empty magazine is refused. A reload (pose shot.r) only moves rounds
// from the reserve into the magazine. Clients show their own count and take the host's whenever they are in sync.
import { skinKeyOf, skinOwner, touchSkin } from './skins.js';
import { weaponById, MAX_HP, RESPAWN_MS, hitDamage, damageFor, HIT_GROUPS, isFirearm, fullAmmo, defaultPistol, KNIFE, EYE, HEAD_KILL_HP, CROUCH_H, NADE_ORDER, BODY_R, accOf, shotBase, shotOffsets, offsetDir, rayBody, pelletDamage, HU, JUMP_IMPULSE, FLINCH } from './weapons-data.js';
import { defuseDamage, defuseKill } from './arena-defuse.js';
import { ARENA_MAPS, mapBoxes, segmentClear, bulletPath, BulletPath } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { smokeBlocks } from './arena-nades.js';   /* kill-feed mark: shot through smoke (only used at call time: no load-order issue) */

const key = name => String(name || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const state = game => game.combat ??= { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [] };
export const hpOf = (game, name) => game.combat?.hp?.[key(name)] ?? MAX_HP;
export const armorOf = (game, name) => game.combat?.armor?.[key(name)] || { kevlar: 0, helmet: false };
export const isDown = (game, name, now = Date.now()) => (game.combat?.down?.[key(name)]?.until || 0) > now;

// What a player carries in Global Defensive: primary, pistol (the team's starting pistol unless they dropped it),
// knife, grenades (each kind once, in CS2's slot order 6–10 — HE, flash, smoke, decoy, molotov / incendiary — not the
// order they were bought: key 4 cycles them so), the bomb.
const DARJA = n => /^darja$/.test(key(n));
export const teamPistol = (game, name) => defaultPistol(game?.combat?.d?.teams?.[key(name)] || null);
export function arenaArsenalOf(game, name) { const l = game.arena?.loadout?.[key(name)] || {}; return [l.primary, l.secondary === undefined ? teamPistol(game, name) : l.secondary, (DARJA(name) && !['default', 'butterfly', 'stiletto', 'm9'].includes(game.arena?.knives?.[key(name)])) || game.arena?.knives?.[key(name)] === 'karambit' ? 'karambit' : 'knife',   /* (Darja's karambit; or one she equipped on you) */ ...(Array.isArray(l.nades) && l.nades.length ? NADE_ORDER.filter(id => l.nades.includes(id)) : []), game.combat?.d?.bomb?.carrier === key(name) ? 'c4' : null].filter(Boolean); }
export const ownedWeapons = (game, name) => game.mode === 'arena' ? arenaArsenalOf(game, name) : [];
// Guns exist only in Global Defensive (the arena): never in Campaign, Free Build, Challenges or Payday.
export const combatOn = game => game.mode === 'arena';
// Defuse: the dead stay down until the next round (arena-defuse.js clears them).
// Deathmatch spawn protection: no damage for this long after a (re)spawn, or until you fire (our own value; you could be
// shot while still choosing a gun at your spawn).
export const SPAWN_SAFE_MS = 2000;
const respawnMs = game => game.mode === 'arena' ? (game.arena?.kind === 'defuse' ? 4e15 : game.arena?.respawnMs ?? 2500) : RESPAWN_MS;

// ── Ammo ────────────────────────────────────────────────────────────────────────────────────────────────────
export function ammoOf(game, name, id) { const a = game.combat?.ammo?.[key(name)]?.[id]; return a ? [a[0], a[1]] : fullAmmo(id); }
export function setAmmo(game, name, id, ammo) { if (!isFirearm(weaponById(id))) return; const C = state(game), k = key(name); ((C.ammo ??= {})[k] ??= {})[id] = ammo ? [Math.max(0, ammo[0] | 0), Math.max(0, ammo[1] | 0)] : fullAmmo(id); }
// Every gun a player carries, full (spawn, new round, deathmatch respawn). Guns no longer carried are forgotten.
export function refillAll(game, name) { const C = state(game), k = key(name), own = arenaArsenalOf(game, name), next = {}; for (const id of own) if (isFirearm(weaponById(id))) next[id] = fullAmmo(id); (C.ammo ??= {})[k] = next; C.shots ??= {}; }
// Shots numbered by the client: take one round for each new number (from the gun named), in order.
// Returns the set of shot numbers that had no round (their hits are refused).
// Match statistics (the post-match report): recorded from the host's own events while a Defuse match is live (not in
// warmup or the lobby). One hit is counted once, damage only up to the HP the victim had (CS2's ADR rule).
export const recording = game => !!game.combat?.d && !(game.arena?.lobby && !game.arena.lobby.started) && game.combat.d.round?.phase !== 'warmup';
export const statOf = (game, name) => ((game.combat.stats ??= {})[key(name)] ??= { shots: 0, hits: 0, hsHits: 0, hsKills: 0, dmg: 0, util: 0, flashed: 0, blindMs: 0, plants: 0, defuses: 0 });
// fromHit: a hit's own number — never the resync below (a forged jump would skip the ammo): the caller refuses it.
const SESSION_N = 1e6;   // (weapons.js numbers shots from 1e6 + a random start: lower ones are test rigs and old callers)
// Freeze time (Defuse): nobody can fire, so new numbers are shots from the round before arriving late — counted, not
// charged to the new round's fresh magazine (SHOOT-15).
// fromPose: the pose stream's numbers — only a new shot in them ends the spawn protection (every pose used to: the
// first pose after a deathmatch spawn took the 2 s of protection away before anyone had fired).
export function takeShots(game, name, n, id, fromHit = false, fromPose = false) {
  const C = state(game), k = key(name), s = (C.shots ??= {})[k] ??= { n: null, r: null, dry: [] }; n = Math.floor(+n);
  if (game.combat?.safe && (!fromPose || (s.n !== null && n > s.n && n <= s.n + 500))) delete game.combat.safe[k];   // firing ends your spawn protection
  if (!Number.isFinite(n)) return s; if (fromHit && s.n >= SESSION_N && n > s.n + 500) return s;
  if (s.n === null || n < s.n - 1e6 || n > s.n + 500) { s.n = n; return s; }   // first contact (or a client restart): sync, take nothing
  const w = weaponById(id); if (!isFirearm(w) || game.combat?.d?.round?.phase === 'freeze') { s.n = Math.max(s.n, n); return s; }
  while (s.n < n) { s.n++; const a = ammoOf(game, name, id); if (a[0] > 0) { a[0]--; setAmmo(game, name, id, a); if (recording(game)) statOf(game, name).shots++; } else { s.dry.push(s.n); if (s.dry.length > 24) s.dry.shift(); } }
  return s;
}
// A reload numbered by the client (pose shot.r): moves rounds from the reserve to the magazine, once per number — a
// magazine fills it; a shotgun (shell by shell, CS2) takes one shell per number.
export function takeReload(game, name, r, id) {
  const C = state(game), k = key(name), s = (C.shots ??= {})[k] ??= { n: null, r: null, dry: [] }; r = Math.floor(+r);
  if (!Number.isFinite(r)) return false; if (s.r === null || r < s.r || r > s.r + 50) { s.r = r; return false; }
  if (r === s.r) return false; const steps = r - s.r; s.r = r; const w = weaponById(id); if (!isFirearm(w)) return false;
  const a = ammoOf(game, name, id), move = Math.min(w.shellMs ? steps : Infinity, w.mag - a[0], a[1]); if (move <= 0) return false; a[0] += move; if (!game.arena?.practice?.ammo) a[1] -= move; setAmmo(game, name, id, a); return true;   // practice: the reserve never runs down
}
// The pose stream (room.mjs): shots and reloads since the last pose. They are charged to the gun that fired (shot.w)
// and the one that reloaded (shot.rw) when the pose names them (a quick switch before the next pose no longer refunds
// an AWP round or charges an AK's to the pistol: SHOOT-13), else to the gun in hand. Returns true on change.
export function poseAmmo(game, name, shot, weapon) {
  if (game?.mode !== 'arena' || !shot || isDown(game, name)) return false; const own = ownedWeapons(game, name);
  const sw = own.includes(shot.w) ? shot.w : weapon, rw = own.includes(shot.rw) ? shot.rw : weapon; if (!own.includes(sw) && !own.includes(rw)) return false;
  const C = state(game), k = key(name), snap = () => JSON.stringify([C.ammo?.[k]?.[sw], C.ammo?.[k]?.[rw], C.shots?.[k]?.n, C.shots?.[k]?.r]), before = snap();
  if (own.includes(sw)) takeShots(game, name, shot.n, sw, false, true); if (own.includes(rw)) takeReload(game, name, shot.r, rw);
  return before !== snap();
}

// ── Damage ──────────────────────────────────────────────────────────────────────────────────────────────────
// Damage one player (or bot) with a weapon hit: armor and the head-shot rule apply (weapons-data.js hitDamage).
export function applyHit(game, shooter, targetName, wpn, zone, dist, pellets = 1, now = Date.now(), base = null, how = null) {
  const C = state(game), tk = key(targetName), arm = C.armor?.[tk] || null, r = hitDamage(wpn, zone, dist, pellets, arm, base);
  if (arm && r.armor) { arm.kevlar = Math.max(0, arm.kevlar - r.armor); if (!arm.kevlar) arm.helmet = false; }
  return hurt(game, shooter, targetName, wpn, r.hp, zone, now, r.headKill, how);
}
// Take `dmg` HP (grenades and fire pass their own damage); knocks out at 0 with a kill-feed line; assists for
// anyone else who did 41+ damage to the victim in this life (CS2).
// `how`: CS2 kill-feed marks { wallbang, smoke, noscope, air, blind, far (metres) }.
export function hurt(game, shooter, targetName, wpn, dmg, zone = 'chest', now = Date.now(), headKill = false, how = null) {
  if (!game.combat?.d && (game.combat?.safe?.[key(targetName)] || 0) > now) return { message: 'Spawn protection', dmg: 0, hp: hpOf(game, targetName), safe: true };   // deathmatch: just (re)spawned
  if (game.combat?.d && !headKill) dmg = defuseDamage(game, shooter, targetName, wpn, dmg);   // friendly fire: reduced, not off
  else if (game.combat?.d && headKill && friendly(game, shooter, targetName)) dmg = Math.round(defuseDamage(game, shooter, targetName, wpn, damageCap(wpn)));   // a team mate's head shot is not an instant kill
  const c = state(game), me = key(shooter), tk = key(targetName); if (isDown(game, targetName, now) || dmg <= 0) return { message: 'Already down', dmg: 0, hp: hpOf(game, targetName) };
  const before = hpOf(game, targetName), hp = Math.max(0, before - dmg); c.hp[tk] = hp; const nm = c.names ??= {}; nm[me] = String(shooter).slice(0, 40); nm[tk] = String(targetName).slice(0, 40);
  if (me !== tk) { const d = ((c.dmg ??= {})[tk] ??= {}); d[me] = (d[me] || 0) + Math.min(before, dmg); }
  const shown = Math.min(before, dmg);
  if (me !== tk && recording(game) && !friendly(game, shooter, targetName)) { const st = statOf(game, shooter), util = wpn.id === 'he' || wpn.id === 'molotov' || wpn.id === 'incendiary'; st.dmg += shown; if (util) st.util += shown; else if (isFirearm(wpn)) { st.hits++; if (zone === 'head') st.hsHits++; } if (hp <= 0 && zone === 'head' && isFirearm(wpn)) st.hsKills++; }
  if (hp > 0) return { message: 'Hit ' + targetName + ' · −' + shown + ' HP', dmg: shown, hp, zone, head: zone === 'head' };
  c.down[tk] = { until: now + respawnMs(game), by: shooter, weapon: wpn.name, wid: wpn.id, head: zone === 'head', at: now };
  const teamKill = c.d && c.d.teams[me] && c.d.teams[me] === c.d.teams[tk];
  if (me !== tk && !teamKill) { c.kills[me] = (c.kills[me] || 0) + 1; const sk = game.arena && skinOwner(game.arena, me, wpn.id) === me && game.arena.skins?.[me]?.[skinKeyOf(wpn.id)]; if (sk?.st) { sk.kills = (sk.kills | 0) + 1; touchSkin(game.arena, me, skinKeyOf(wpn.id)); } }   /* (StatTrak™: the weapon counts its own kills — only in its owner's hands, CS2's "does not belong to you"; the room sends the new count) */ c.deaths[tk] = (c.deaths[tk] || 0) + 1; if (c.d) defuseKill(game, shooter, targetName, wpn);
  let assist = null; for (const [a, n] of Object.entries(c.dmg?.[tk] || {})) if (a !== me && a !== tk && n >= 41 && !(c.d && c.d.teams[a] === c.d.teams[tk])) { (c.assists ??= {})[a] = (c.assists[a] || 0) + 1; assist = c.names?.[a] || a; }
  if (c.dmg) delete c.dmg[tk];
  c.feed.unshift({ at: now, by: shooter, target: targetName, weapon: wpn.name, wid: wpn.id, head: zone === 'head', assist, ...(how ? { how } : {}) }); c.feed.length = Math.min(c.feed.length, 6);
  return { message: 'Killed ' + targetName + (zone === 'head' ? ' · head shot' : ''), dmg: shown, hp: 0, down: true, zone, head: zone === 'head' };
}
const friendly = (game, a, b) => { const t = game.combat?.d?.teams; return !!t && key(a) !== key(b) && !!t[key(a)] && t[key(a)] === t[key(b)]; };
const damageCap = wpn => Math.round((wpn.dmg || 30) * 4);
// A Global Defensive body's feet (game units): the eye (pose.y) less its height over the feet as the pose told it (ey,
// from the client's true feet fy: lan/room.mjs; a pose rewound for a hit, lag-comp.js, keeps its own y), else less
// CS2's eye — 64 HU standing, 46 crouched (bots, which send no feet, never crouch).
const DUCK_EYE = 46 * 2.54 / 16.5;   // (arena-move.js EYE_GD.duck)
export const poseFeet = q => Math.max(0, (q.y ?? EYE) - (Number.isFinite(q.ey) ? q.ey : q.crouched ? DUCK_EYE : EYE));

// Line of fire: shooter's eye to the target point is clear of the map's walls and crates (3D). Lenient: refused only
// when the head, chest and the zone hit are all hidden (positions are a few frames old on the host).
const ZONE_Y = { head: 10.2, chest: 7.9, stomach: 5.8, legs: 2.7 };   // (the middle of each zone: weapons-data.js zoneAt)
// Blood (gd-blood.js): each bullet or knife hit the host applies leaves a small record on the combat state, combat.bl —
// the last BLEED_MS of hits, 12 at most: { i (rising: max(last + 1, host ms)), at (host ms), v (the victim's key), z
// (zone), d (damage taken), k (1: it killed), kn (1: a knife), p (where it met the body, units, 2 decimals), r (its
// direction, 3 decimals) }. Every computer draws the same blood from it (seeded by i); clients only draw. A page
// without gd-blood.js ignores the field (gd-52 unchanged: nothing it sends or checks moved).
export const BLEED_MS = 1500;
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
export function bleed(game, victim, res, px, py, pz, dx, dy, dz, now = Date.now(), knife = false) {
  if (!res || typeof res !== 'object' || !(res.dmg > 0) || !combatOn(game) || ![px, py, pz, dx, dy, dz].every(Number.isFinite)) return null;
  const c = state(game), L = c.bl ??= [], len = Math.hypot(dx, dy, dz); if (!(len > 1e-6)) return null;
  while (L.length && (now - L[0].at > BLEED_MS || L.length >= 12)) L.shift();
  const rec = { i: c.blI = Math.max((c.blI || 0) + 1, now), at: now, v: key(victim), z: res.zone || 'chest', d: Math.round(res.dmg), p: [r2(px), r2(py), r2(pz)], r: [r3(dx / len), r3(dy / len), r3(dz / len)] };
  if (res.down) rec.k = 1; if (knife) rec.kn = 1; L.push(rec); return rec;
}
// From a shooter's eye to a body (its pose: x, z, feet — poseFeet — or fy, crouched / cr) at the hit's zone: the point on
// the body's near side, along that line (bots' shots, knives, hits without a shot record).
export function bleedFrom(game, victim, res, ex, ey, ez, to, now = Date.now(), knife = false) {
  if (!res || typeof res !== 'object' || !(res.dmg > 0) || !to) return null;
  const cr = !!(to.crouched ?? to.cr), feet = Number.isFinite(to.fy) ? to.fy : poseFeet(to), ty = feet + (ZONE_Y[res.zone] ?? ZONE_Y.chest) * (cr ? CROUCH_H : 1);
  let dx = to.x - ex, dy = ty - ey, dz = to.z - ez; const L = Math.hypot(dx, dy, dz) || 1, h = Math.hypot(dx, dz) || 1; dx /= L; dy /= L; dz /= L;
  const back = BODY_R * Math.min(1, h / L * 1.2);   // (the body's near side, along the line)
  return bleed(game, victim, res, to.x - dx * back, ty - dy * back, to.z - dz * back, dx, dy, dz, now, knife);
}
// (Kept per map object, not its name: a map file loaded for a map in play replaces the built-in one of the same name.)
let boxCache = { map: null, boxes: [] };
const boxesOf = game => { const m = game.arena?.map, M = m ? ARENA_MAPS[m] : null; if (!M) return []; if (boxCache.map !== M) boxCache = { map: M, boxes: mapBoxes(M, ARENA.cx, ARENA.cz) }; return boxCache.boxes; };
// Returns the damage multiplier: 1 in the open, less through crates / thin walls (wallbang, `pen` = the gun's
// penetration budget), 0 when blocked. The best of the zone hit, the head and the chest — each on the body's axis and at
// its two edges as the shooter sees it (EDGE of the capsule's radius either side: the client hits the whole capsule,
// weapons.js rayCapsule, so a shoulder past a corner is a hit the host must see too).
const LOF = new BulletPath(), EDGE = .8;
export function lineOfFire(game, from, to, zone = 'chest', pen = 0) {
  const boxes = boxesOf(game); if (!boxes.length || !from || !to) return 1; const feet = poseFeet(to), ey = from.y ?? EYE;
  const hx = to.x - from.x, hz = to.z - from.z, hl = Math.hypot(hx, hz) || 1e-6, px = -hz / hl * BODY_R * EDGE, pz = hx / hl * BODY_R * EDGE;
  let best = 0; for (const z of [zone, 'head', 'chest']) for (let s = 0; s < 3; s++) { const tx = to.x + (s === 1 ? px : s === 2 ? -px : 0), tz = to.z + (s === 1 ? pz : s === 2 ? -pz : 0), ty = feet + (ZONE_Y[z] ?? 7) * (to.crouched ? CROUCH_H : 1), dx = tx - from.x, dy = ty - ey, dz = tz - from.z, L = Math.hypot(dx, dy, dz) || 1e-6;
    const f = pen > 0 ? bulletPath(boxes, from.x, ey, from.z, dx / L, dy / L, dz / L, L + .01, pen, LOF).factor(L) : segmentClear(boxes, from.x, ey, from.z, tx, ty, tz) ? 1 : 0; if (f > best) best = f; if (best >= 1) return best; }
  return best;
}
// Knife: in front of the attacker (within ~70°; up close, anywhere ahead — the hull is wide), within reach (CS2's
// 64 / 48 units, its hull, the bodies); `back` when the attacker stands behind the target — the line from attacker to
// target within 61.6° of the way the target faces (CS: dot > 0.475).
export function knifeCheck(from, to, attack) {
  const K = KNIFE[attack] || KNIFE.light, dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1e-6;
  const fx = -Math.sin(from.yaw || 0), fz = -Math.cos(from.yaw || 0), facing = (dx * fx + dz * fz) / d;
  const tx = -Math.sin(to.yaw || 0), tz = -Math.cos(to.yaw || 0), back = (dx * tx + dz * tz) / d > KNIFE.backDot;
  return { reach: d <= K.range + KNIFE.hull + BODY_REACH, facing: facing > (d < 6 ? 0 : .34), back, dist: d };
}
const BODY_REACH = 3.5;   // capsule radius + position lag on the host

export function combatApply(game, a, name, players = [], actor = null, now = Date.now()) {
  if (!combatOn(game)) throw Error('Guns are only in Global Defensive');
  const r = game.combat?.d?.round; if (r && (r.phase === 'freeze' || r.phase === 'over' && game.combat.d.matchOver)) throw Error('The round hasn’t started');   // defuse freeze time
  if (game.arena?.lobby && !game.arena.lobby.started) throw Error('Warmup · the match has not started');
  if (game.combat?.d?.paused) throw Error('The match is paused');
  const c = state(game), me = key(name);
  if (a?.type !== 'hit') throw Error('Unknown combat action');
  const wpn = weaponById(a.weapon); if (!wpn || !ownedWeapons(game, name).includes(wpn.id)) throw Error('You do not own that weapon');
  if (isDown(game, name, now)) throw Error('You are knocked out');
  const target = players.find(p => p.id === a.target), tk = key(target?.name);
  if (!target || target.id === actor || tk === me) throw Error('No target');
  if (isDown(game, target.name, now)) return 'Already down';
  const from = players.find(p => p.id === actor)?.pose, to = target.pose;
  if (wpn.kind === 'knife') {
    const attack = a.attack === 'heavy' ? 'heavy' : 'light', K = KNIFE[attack], lk = me + ':' + attack;
    if (now - (c.last[lk] || 0) < K.rateMs * .6) throw Error('Too fast');
    const chk = from && to ? knifeCheck(from, to, attack) : { reach: true, facing: true, back: false, dist: 0 };
    if (!chk.reach) throw Error('Out of reach'); if (!chk.facing) throw Error('Not facing the target');
    if (from && to && !lineOfFire(game, from, to, 'chest', 0)) throw Error('Blocked by a wall');
    // A slash right after another attack is the weaker follow-up (CS2): the attacker says so (it knows its misses too),
    // or the host sees it from its own hits — within chainMs of the last attack's end.
    const prev = c.last[me + ':knife'] || 0, chain = attack === 'light' && (a.chain === true || (prev > 0 && now < prev + (c.last[me + ':knifeMs'] || 0) + KNIFE.chainMs));
    c.last[lk] = now; c.last[me + ':knife'] = now; c.last[me + ':knifeMs'] = K.rateMs; const base = chk.back ? K.back : chain ? K.chain : K.front;
    const out = applyHit(game, name, target.name, wpn, a.zone === 'head' ? 'head' : 'chest', 0, 1, now, base);
    if (from && to) bleedFrom(game, target.name, out, from.x, from.y ?? EYE, from.z, to, now, true);
    return out;
  }
  if (!isFirearm(wpn)) throw Error('Not a gun');
  // Once per shot and body: the same shot number on the same target again (a resent, replayed or duplicated request)
  // never adds damage (SHOOT-12; the room refuses it before this too). A number far past the last one of a numbering
  // session (game clients number from 1e6 up, weapons.js) is no resync here (a forged jump would skip the ammo): refused.
  // (Poses still resync — a reloaded page starts a new numbering — so this is defence in depth, not a lock.)
  const shotN = Math.floor(+a.n), sd = sideOf(c), hk = shotN + ':' + tk;
  if (Number.isFinite(shotN)) { if ((sd.seen[me] ||= []).includes(hk)) throw Error('Already counted'); const s0 = c.shots?.[me]; if (s0 && s0.n >= SESSION_N && shotN > s0.n + 500) throw Error('Unknown shot');
    // The round for this shot: take any shots not yet counted (the hit may arrive before the pose that numbers it).
    const s = takeShots(game, name, shotN, wpn.id, true); if (s.dry.includes(shotN)) throw Error('Out of ammo'); }
  // Fire rate (SHOOT-02): by shot numbers on the shooter's own clock (ft: when its trigger fired), never the arrival
  // times — a LAN that bunches two requests together no longer throws a real hit away. n shots apart must be at least
  // n cycles apart (less 20 % and 25 ms for the clock's grain). The same number (a second body) is the same shot.
  // A hit with no number (older callers): the arrival-time gate as before. The last shot only counts from the same
  // numbering session on the same clock: a reloaded page or a rejoin starts a new random numbering and a fresh page
  // clock (weapons.js) — measured against the old one, every hit was 'Too fast' (or never gated) for the rest of the match.
  const ft = Number.isFinite(+a.ft) && a.ft !== null ? +a.ft : null, p0 = sd.last[me], prev = p0 && Math.abs(shotN - p0.n) <= 500 && !(ft !== null && p0.ft !== null && ft < p0.ft - 5000) ? p0 : null;
  if (Number.isFinite(shotN)) { if (prev && prev.wid === wpn.id && shotN > prev.n) { const gap = ft !== null && prev.ft !== null ? ft - prev.ft : now - prev.at, need = (shotN - prev.n) * wpn.rateMs * (ft !== null && prev.ft !== null ? .8 : .5) - 25; if (gap < need) throw Error('Too fast for the ' + wpn.name); } }
  else { const lk = me + ':' + wpn.id; if (now - (c.last[lk] || 0) < wpn.rateMs * .6) throw Error('Too fast for the ' + wpn.name); c.last[lk] = now; }
  // Range: a shot with its record, CS2's m_flRange (reach: 8192 HU for rifles); a hit without one keeps the old rules.
  const reach = Array.isArray(a.eye) ? wpn.reach ?? wpn.range : wpn.range;
  if (from && to && Math.hypot(from.x - to.x, from.z - to.z) > reach * 1.15 + 4) throw Error('Out of range');
  // The shot itself (SHOOT-07): with its record (eye, raw look, aim punch, inaccuracy) the host traces the very bullets
  // the shooter fired — the same seeded spread — against the target where the shooter saw it (lag-comp.js), through the
  // walls (bulletPath: the wallbang factor along the real line), each pellet in its own hit group: the client's zone and
  // pellet count are only hints. Without a record (older callers, tests): the centre-line check and the zone claimed.
  let res, dist, through = 1, wound = null;
  if (Array.isArray(a.eye) && Array.isArray(a.look)) {
    const T = traceShot(game, wpn, a, shotN, from, to); dist = T.dist; if (T.at) wound = T;
    res = pelletDamage(wpn, T.hits, dist, armorOf(game, target.name)); through = T.factor;
  } else {
    const zone = HIT_GROUPS[a.zone] ? a.zone : a.head ? 'head' : 'chest';
    through = from && to ? lineOfFire(game, from, to, zone, wpn.pen || 0) : 1; if (!through) throw Error('Blocked by a wall');
    dist = from && to ? Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) : 0;
    // Shotgun pellets each in their own group (SHOOT-04: one head pellet no longer makes every pellet a head shot).
    const zs = wpn.pellets && a.zones && typeof a.zones === 'object' ? a.zones : { [zone]: wpn.pellets ? Math.floor(Number(a.pellets) || 1) : 1 }, hits = [];
    for (const z of ['head', 'chest', 'stomach', 'legs']) for (let i = Math.max(0, Math.floor(+zs[z] || 0)); i > 0 && hits.length < (wpn.pellets || 1); i--) hits.push({ zone: z, f: through });
    if (!hits.length) hits.push({ zone, f: through }); res = pelletDamage(wpn, hits, dist, armorOf(game, target.name));
  }
  if (Number.isFinite(shotN)) { const seen = sd.seen[me]; seen.push(hk); if (seen.length > 96) seen.shift(); if (!prev || shotN > prev.n) sd.last[me] = { n: shotN, ft, at: now, wid: wpn.id }; }
  // Damage is computed here from the real distance and what the bullet went through, never trusted from the shooter.
  // Kill-feed marks: wallbang and through smoke are the host's own findings; no-scope, airborne and blind come from the shooter.
  const eyeA = from ? (from.y ?? 9.7) : 0, eyeB = to ? (to.y ?? 9.7) - 1.5 : 0, how = { wallbang: through < 1, smoke: !!(from && to && smokeBlocks(game, from.x, eyeA, from.z, to.x, eyeB, to.z, now)), noscope: !!a.noscope && !!wpn.zoom, air: !!a.air, blind: !!a.blind, far: Math.round(dist * .165) };
  const arm = c.armor?.[tk]; if (arm && res.armor) { arm.kevlar = Math.max(0, arm.kevlar - res.armor); if (!arm.kevlar) arm.helmet = false; }
  const out = hurt(game, name, target.name, wpn, res.hp, res.zone, now, false, how);
  if (wound) bleed(game, target.name, out, wound.at[0], wound.at[1], wound.at[2], wound.dir[0], wound.dir[1], wound.dir[2], now);
  else if (from && to) bleedFrom(game, target.name, out, from.x, from.y ?? EYE, from.z, to, now);
  return out;
}
// Host-side records per combat state (never sent to anyone): the shot numbers and bodies already counted, and each
// shooter's newest shot (number, trigger clock, arrival, gun) for the fire-rate gate.
const SIDE = new WeakMap(), sideOf = c => { let s = SIDE.get(c); if (!s) SIDE.set(c, s = { seen: {}, last: {} }); return s; };
// How far a shot's record may stray from the shooter's pose at its moment (lag-comp.js: poses 33 ms apart at best, ~100
// on a slow LAN, interpolated): the eye (units: a run at full speed covers ~4 in 100 ms), the look's yaw (rad: a flick
// turns 20+ rad/s, and the pose's yaw also carries the camera's view punch — this only stops a shot sent sideways or
// back), the target's body (pad, units: where the shooter drew it against where the host has it then). Our tolerances.
// A hit usually beats its own moment's pose to the host (sent at the trigger; poses go at 30 Hz, later on Wi-Fi or a slow
// laptop): for the time past the newest pose (lead, ms, credited up to `lead`) the eye may have moved `run` units/ms
// (~390 HU/s: CS2's 250 run plus air gain), and the look is not judged at all until a pose at or after the moment has
// arrived (as the speed floor: a flick-and-fire — turn onto someone and click at once — was refused as 'Not where you
// looked' whenever the hit beat the pose that showed the turn); between two poses it is judged against either one's
// facing (a flick between them faces anywhere along the turn). Approximations, ours.
export const SHOT_TOL = { eye: 4, look: 1.2, pad: .35, run: .06, lead: 200 };
// The biggest aim punch a gun's spray reaches (°), plus the flinch's.
const PUNCH = new Map(), punchMax = w => { let m = PUNCH.get(w.id); if (!m) { m = { p: 0, y: 0 }; for (const [p, y] of w.pattern || []) { m.p = Math.max(m.p, p); m.y = Math.max(m.y, Math.abs(y)); } PUNCH.set(w.id, m); } return m; };
// The least inaccuracy the host is sure of: the gun's lower floor (standing or crouched: the pose's crouch may lag), and —
// only when its poses show it clearly — running (over 85 % of the gun's speed) or a fast rise / fall (over 300 HU/s,
// faster than stairs), each counted at 30 % (poses are coarse). The speed is lag-comp vel(): the slower of the windows
// before and after the trigger, unknown until a pose after it has arrived — so a counter-strafe (fast before, still
// after) is never caught, and a hit that beats its pose to the host gets the floor only.
function minInaccuracy(wpn, acc, from, sc) {
  let lo = Math.min(acc.stand, acc.crouch) * .999; const v = from?.vel; if (!v) return lo;
  const max = (sc && wpn.scopedSpeed ? wpn.scopedSpeed : wpn.speed || 250) * HU; if (v.h > max * .85) lo += .3 * Math.min(1, (v.h - max * .34) / (max * .61)) * acc.move;
  const vv = Math.abs(v.v) / HU; if (vv > 300) { const sj = Math.sqrt(JUMP_IMPULSE); lo += .3 * acc.jump * Math.min(2, (Math.sqrt(vv) - sj * .25) / (sj * .75)); }
  return lo;
}
const SB = [0, 0, 0], SD = [0, 0, 0], SO = new Float64Array(32), SZ = { zone: null }, SP = new BulletPath();
const wrapA = x => Math.atan2(Math.sin(x), Math.cos(x));
// The host's own trace of a shot on one body. Returns { hits: [{ zone, f }], dist, factor (the weakest pellet's wall
// factor: < 1 a wallbang) }; throws when the record is out of bounds or no bullet reaches the body.
export function traceShot(game, wpn, a, n, from, to) {
  const eye = a.eye.map(Number), look = a.look.map(Number), pu = Array.isArray(a.pu) ? a.pu.map(Number) : [0, 0], sc = !!a.sc && !!wpn.accZ, acc = accOf(wpn, sc);
  if (eye.length !== 3 || look.length !== 2 || pu.length !== 2 || ![...eye, ...look, ...pu].every(Number.isFinite) || !Number.isFinite(n)) throw Error('Bad shot');
  const lead = from && Number.isFinite(from.lead) ? Math.min(SHOT_TOL.lead, Math.max(0, from.lead)) : 0;
  if (from && Math.hypot(eye[0] - from.x, eye[1] - (from.y ?? EYE), eye[2] - from.z) > SHOT_TOL.eye + lead * SHOT_TOL.run) throw Error('Not where you stood');
  if (from && Number.isFinite(from.yaw) && !(from.lead > 0)) { let dv = Math.abs(wrapA(look[1] - from.yaw)); if (Number.isFinite(from.ya)) dv = Math.min(dv, Math.abs(wrapA(look[1] - from.ya))); if (Number.isFinite(from.yb)) dv = Math.min(dv, Math.abs(wrapA(look[1] - from.yb)));
    if (dv > SHOT_TOL.look) throw Error('Not where you looked'); }
  const pm = punchMax(wpn), fl = 2 * FLINCH.max + 1; if (pu[0] < -fl || pu[0] > pm.p + fl + 1 || Math.abs(pu[1]) > pm.y + fl + 1) throw Error('Recoil out of bounds');
  const ia = Math.min(1, Math.max(minInaccuracy(wpn, acc, from, sc), Number.isFinite(+a.ia) ? +a.ia : 0)), reach = wpn.reach ?? wpn.range, boxes = to ? boxesOf(game) : [];
  if (!to) return { hits: [{ zone: HIT_GROUPS[a.zone] ? a.zone : 'chest', f: 1 }], dist: 0, factor: 1 };   // (no pose for the target: nothing to trace against)
  const fx = to.x, fy = poseFeet(to), fz = to.z, cr = !!to.crouched, hits = [], dir = [0, 0, 0]; let dist = Infinity, factor = 1;
  shotBase(look[0], look[1], pu[0], pu[1], SB); const k = shotOffsets(wpn, n, ia, acc.spread, SO);
  for (let i = 0; i < k; i++) { offsetDir(SB, SO[2 * i], SO[2 * i + 1], SD); const t = rayBody(eye[0], eye[1], eye[2], SD[0], SD[1], SD[2], fx, fy, fz, cr, SHOT_TOL.pad, SZ); if (t < 0 || t > reach) continue;
    if (SD[1] < -1e-6 && -eye[1] / SD[1] < t) continue;   // (the floor plane first: as the shooter's own trace)
    const f = boxes.length ? bulletPath(boxes, eye[0], eye[1], eye[2], SD[0], SD[1], SD[2], t + .01, wpn.pen || 0, SP).factor(t) : 1; if (!(f > 0)) continue;
    hits.push({ zone: SZ.zone, f }); if (t < dist) { dist = t; dir[0] = SD[0]; dir[1] = SD[1]; dir[2] = SD[2]; } factor = Math.min(factor, f); }
  if (!hits.length) throw Error('Missed');
  return { hits, dist, factor, at: [eye[0] + dir[0] * dist, eye[1] + dir[1] * dist, eye[2] + dir[2] * dist], dir };   // (at, dir: the nearest bullet's entry on the body — the blood, bleed)
}
// Respawn knocked-out players (deathmatch) with full HP and full ammo. Returns true when something changed.
export function combatTick(game, now = Date.now()) {
  const c = game.combat; if (!c) return false; let changed = false;
  for (const [k, d] of Object.entries(c.down)) if (d.until <= now) { delete c.down[k]; c.hp[k] = MAX_HP; c.respawns[k] = (c.respawns[k] || 0) + 1; (c.respawnedAt ??= {})[k] = now; if (game.mode === 'arena' && !c.d) (c.safe ??= {})[k] = now + SPAWN_SAFE_MS; if (game.mode === 'arena') refillAll(game, c.names?.[k] || k); changed = true; }
  return changed;
}
export { HEAD_KILL_HP };
