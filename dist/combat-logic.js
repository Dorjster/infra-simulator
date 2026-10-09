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
import { weaponById, MAX_HP, RESPAWN_MS, hitDamage, damageFor, HIT_GROUPS, isFirearm, fullAmmo, defaultPistol, KNIFE, EYE, HEAD_KILL_HP } from './weapons-data.js';
import { defuseDamage, defuseKill } from './arena-defuse.js';
import { ARENA_MAPS, mapBoxes, segmentClear, bulletPath } from './arena-maps.js';
import { ARENA } from './facility-layout.js';

const key = name => String(name || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const state = game => game.combat ??= { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [] };
export const hpOf = (game, name) => game.combat?.hp?.[key(name)] ?? MAX_HP;
export const armorOf = (game, name) => game.combat?.armor?.[key(name)] || { kevlar: 0, helmet: false };
export const isDown = (game, name, now = Date.now()) => (game.combat?.down?.[key(name)]?.until || 0) > now;

// What a player carries in Global Defensive: primary, pistol (the team's starting pistol unless they dropped it),
// knife, grenades, the bomb.
const DARJA = n => /^darja$/.test(key(n));
export const teamPistol = (game, name) => defaultPistol(game?.combat?.d?.teams?.[key(name)] || null);
export function arenaArsenalOf(game, name) { const l = game.arena?.loadout?.[key(name)] || {}; return [l.primary, l.secondary === undefined ? teamPistol(game, name) : l.secondary, DARJA(name) ? 'karambit' : 'knife', ...new Set(Array.isArray(l.nades) ? l.nades : []), game.combat?.d?.bomb?.carrier === key(name) ? 'c4' : null].filter(Boolean); }
export const ownedWeapons = (game, name) => game.mode === 'arena' ? arenaArsenalOf(game, name) : [];
// Guns exist only in Global Defensive (the arena): never in Campaign, Free Build, Challenges or Payday.
export const combatOn = game => game.mode === 'arena';
// Defuse: the dead stay down until the next round (arena-defuse.js clears them).
const respawnMs = game => game.mode === 'arena' ? (game.arena?.kind === 'defuse' ? 4e15 : game.arena?.respawnMs ?? 2500) : RESPAWN_MS;

// ── Ammo ────────────────────────────────────────────────────────────────────────────────────────────────────
export function ammoOf(game, name, id) { const a = game.combat?.ammo?.[key(name)]?.[id]; return a ? [a[0], a[1]] : fullAmmo(id); }
export function setAmmo(game, name, id, ammo) { if (!isFirearm(weaponById(id))) return; const C = state(game), k = key(name); ((C.ammo ??= {})[k] ??= {})[id] = ammo ? [Math.max(0, ammo[0] | 0), Math.max(0, ammo[1] | 0)] : fullAmmo(id); }
// Every gun a player carries, full (spawn, new round, deathmatch respawn). Guns no longer carried are forgotten.
export function refillAll(game, name) { const C = state(game), k = key(name), own = arenaArsenalOf(game, name), next = {}; for (const id of own) if (isFirearm(weaponById(id))) next[id] = fullAmmo(id); (C.ammo ??= {})[k] = next; C.shots ??= {}; }
// Shots numbered by the client: take one round for each new number (from the gun named), in order.
// Returns the set of shot numbers that had no round (their hits are refused).
export function takeShots(game, name, n, id) {
  const C = state(game), k = key(name), s = (C.shots ??= {})[k] ??= { n: null, r: null, dry: [] }; n = Math.floor(+n);
  if (!Number.isFinite(n)) return s; if (s.n === null || n < s.n - 1e6 || n > s.n + 500) { s.n = n; return s; }   // first contact (or a client restart): sync, take nothing
  const w = weaponById(id); if (!isFirearm(w)) { s.n = Math.max(s.n, n); return s; }
  while (s.n < n) { s.n++; const a = ammoOf(game, name, id); if (a[0] > 0) { a[0]--; setAmmo(game, name, id, a); } else { s.dry.push(s.n); if (s.dry.length > 24) s.dry.shift(); } }
  return s;
}
// A reload numbered by the client (pose shot.r): moves rounds from the reserve to the magazine, once per number.
export function takeReload(game, name, r, id) {
  const C = state(game), k = key(name), s = (C.shots ??= {})[k] ??= { n: null, r: null, dry: [] }; r = Math.floor(+r);
  if (!Number.isFinite(r)) return false; if (s.r === null || r < s.r || r > s.r + 50) { s.r = r; return false; }
  if (r === s.r) return false; s.r = r; const w = weaponById(id); if (!isFirearm(w)) return false;
  const a = ammoOf(game, name, id), move = Math.min(w.mag - a[0], a[1]); if (move <= 0) return false; a[0] += move; a[1] -= move; setAmmo(game, name, id, a); return true;
}
// The pose stream (room.mjs): shots and reloads since the last pose, for the gun in hand. Returns true on change.
export function poseAmmo(game, name, shot, weapon) {
  if (game?.mode !== 'arena' || !shot || isDown(game, name)) return false; if (!ownedWeapons(game, name).includes(weapon)) return false;
  const C = state(game), k = key(name), before = JSON.stringify([C.ammo?.[k]?.[weapon], C.shots?.[k]?.n, C.shots?.[k]?.r]);
  takeShots(game, name, shot.n, weapon); takeReload(game, name, shot.r, weapon);
  return before !== JSON.stringify([C.ammo?.[k]?.[weapon], C.shots?.[k]?.n, C.shots?.[k]?.r]);
}

// ── Damage ──────────────────────────────────────────────────────────────────────────────────────────────────
// Damage one player (or bot) with a weapon hit: armor and the head-shot rule apply (weapons-data.js hitDamage).
export function applyHit(game, shooter, targetName, wpn, zone, dist, pellets = 1, now = Date.now(), base = null) {
  const C = state(game), tk = key(targetName), arm = C.armor?.[tk] || null, r = hitDamage(wpn, zone, dist, pellets, arm, base);
  if (arm && r.armor) { arm.kevlar = Math.max(0, arm.kevlar - r.armor); if (!arm.kevlar) arm.helmet = false; }
  return hurt(game, shooter, targetName, wpn, r.hp, zone, now, r.headKill);
}
// Take `dmg` HP (grenades and fire pass their own damage); knocks out at 0 with a kill-feed line; assists for
// anyone else who did 41+ damage to the victim in this life (CS2).
export function hurt(game, shooter, targetName, wpn, dmg, zone = 'chest', now = Date.now(), headKill = false) {
  if (game.combat?.d && !headKill) dmg = defuseDamage(game, shooter, targetName, wpn, dmg);   // friendly fire: reduced, not off
  else if (game.combat?.d && headKill && friendly(game, shooter, targetName)) dmg = Math.round(defuseDamage(game, shooter, targetName, wpn, damageCap(wpn)));   // a team mate's head shot is not an instant kill
  const c = state(game), me = key(shooter), tk = key(targetName); if (isDown(game, targetName, now) || dmg <= 0) return { message: 'Already down', dmg: 0, hp: hpOf(game, targetName) };
  const before = hpOf(game, targetName), hp = Math.max(0, before - dmg); c.hp[tk] = hp; const nm = c.names ??= {}; nm[me] = String(shooter).slice(0, 40); nm[tk] = String(targetName).slice(0, 40);
  if (me !== tk) { const d = ((c.dmg ??= {})[tk] ??= {}); d[me] = (d[me] || 0) + Math.min(before, dmg); }
  const shown = Math.min(before, dmg);
  if (hp > 0) return { message: 'Hit ' + targetName + ' · −' + shown + ' HP', dmg: shown, hp, zone, head: zone === 'head' };
  c.down[tk] = { until: now + respawnMs(game), by: shooter, weapon: wpn.name, wid: wpn.id, head: zone === 'head', at: now };
  const teamKill = c.d && c.d.teams[me] && c.d.teams[me] === c.d.teams[tk];
  if (me !== tk && !teamKill) c.kills[me] = (c.kills[me] || 0) + 1; c.deaths[tk] = (c.deaths[tk] || 0) + 1; if (c.d) defuseKill(game, shooter, targetName, wpn);
  let assist = null; for (const [a, n] of Object.entries(c.dmg?.[tk] || {})) if (a !== me && a !== tk && n >= 41 && !(c.d && c.d.teams[a] === c.d.teams[tk])) { (c.assists ??= {})[a] = (c.assists[a] || 0) + 1; assist = c.names?.[a] || a; }
  if (c.dmg) delete c.dmg[tk];
  c.feed.unshift({ at: now, by: shooter, target: targetName, weapon: wpn.name, wid: wpn.id, head: zone === 'head', assist }); c.feed.length = Math.min(c.feed.length, 6);
  return { message: 'Killed ' + targetName + (zone === 'head' ? ' · head shot' : ''), dmg: shown, hp: 0, down: true, zone, head: zone === 'head' };
}
const friendly = (game, a, b) => { const t = game.combat?.d?.teams; return !!t && key(a) !== key(b) && !!t[key(a)] && t[key(a)] === t[key(b)]; };
const damageCap = wpn => Math.round((wpn.dmg || 30) * 4);

// Line of fire: shooter's eye to the target point is clear of the map's walls and crates (3D). Lenient: refused only
// when the head, chest and the zone hit are all hidden (positions are a few frames old on the host).
const ZONE_Y = { head: 9.6, chest: 7.6, stomach: 5.6, legs: 2.6 };
let boxCache = { map: null, boxes: [] };
const boxesOf = game => { const m = game.arena?.map; if (!m || !ARENA_MAPS[m]) return []; if (boxCache.map !== m) boxCache = { map: m, boxes: mapBoxes(ARENA_MAPS[m], ARENA.cx, ARENA.cz) }; return boxCache.boxes; };
// Returns the damage multiplier: 1 in the open, less through crates / thin walls (wallbang, `pen` = the gun's
// penetration budget), 0 when blocked. The best of the zone hit, the head and the chest.
export function lineOfFire(game, from, to, zone = 'chest', pen = 0) {
  const boxes = boxesOf(game); if (!boxes.length || !from || !to) return 1; const feet = Math.max(0, (to.y ?? EYE) - (to.crouched ? 5.9 : EYE)), ey = from.y ?? EYE;
  let best = 0; for (const z of [zone, 'head', 'chest']) { const tx = to.x, ty = feet + (ZONE_Y[z] ?? 7) * (to.crouched ? .62 : 1), tz = to.z, dx = tx - from.x, dy = ty - ey, dz = tz - from.z, L = Math.hypot(dx, dy, dz) || 1e-6;
    const f = pen > 0 ? bulletPath(boxes, from.x, ey, from.z, dx / L, dy / L, dz / L, L + .01, pen).factor(L) : segmentClear(boxes, from.x, ey, from.z, tx, ty, tz) ? 1 : 0; if (f > best) best = f; if (best >= 1) break; }
  return best;
}
// Knife: in front of the attacker (within ~70°), within reach; `back` when the attacker stands behind the target.
export function knifeCheck(from, to, attack) {
  const K = KNIFE[attack] || KNIFE.light, dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1e-6;
  const fx = -Math.sin(from.yaw || 0), fz = -Math.cos(from.yaw || 0), facing = (dx * fx + dz * fz) / d;
  const tx = -Math.sin(to.yaw || 0), tz = -Math.cos(to.yaw || 0), back = (dx * tx + dz * tz) / d > .35;   // the target looks the same way as the line from attacker to target: we are behind it
  return { reach: d <= K.range + BODY_REACH, facing: facing > .34, back, dist: d };
}
const BODY_REACH = 3.5;   // capsule radius + position lag on the host

export function combatApply(game, a, name, players = [], actor = null, now = Date.now()) {
  if (!combatOn(game)) throw Error('Guns are only in Global Defensive');
  const r = game.combat?.d?.round; if (r && (r.phase === 'freeze' || r.phase === 'over' && game.combat.d.matchOver)) throw Error('The round hasn’t started');   // defuse freeze time
  if (game.arena?.lobby && !game.arena.lobby.started) throw Error('Warmup · the match has not started');
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
    c.last[lk] = now; const base = chk.back ? K.back : K.front;
    return applyHit(game, name, target.name, wpn, a.zone === 'head' ? 'head' : 'chest', 0, 1, now, base);
  }
  if (!isFirearm(wpn)) throw Error('Not a gun');
  // The round for this shot: take any shots not yet counted (the hit may arrive before the pose that numbers it).
  const shotN = Math.floor(+a.n); if (Number.isFinite(shotN)) { const s = takeShots(game, name, shotN, wpn.id); if (s.dry.includes(shotN)) throw Error('Out of ammo'); }
  const lk = me + ':' + wpn.id, minGap = wpn.rateMs * .6; if (!a.sameShot && now - (c.last[lk] || 0) < minGap && c.lastShot?.[me] !== shotN) throw Error('Too fast for the ' + wpn.name);
  if (from && to && Math.hypot(from.x - to.x, from.z - to.z) > wpn.range * 1.15 + 4) throw Error('Out of range');
  const zone = HIT_GROUPS[a.zone] ? a.zone : a.head ? 'head' : 'chest';
  const through = from && to ? lineOfFire(game, from, to, zone, wpn.pen || 0) : 1; if (!through) throw Error('Blocked by a wall');
  c.last[lk] = now; (c.lastShot ??= {})[me] = shotN;
  const pellets = wpn.pellets ? Math.max(1, Math.min(wpn.pellets, Math.floor(Number(a.pellets) || 1))) : 1;
  const dist = from && to ? Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) : 0;
  // Damage is computed here from the real distance and what the bullet went through, never trusted from the shooter.
  return applyHit(game, name, target.name, wpn, zone, dist, pellets, now, through < 1 ? Math.max(1, Math.round(damageFor(wpn, zone, dist, pellets) * through)) : null);
}
// Respawn knocked-out players (deathmatch) with full HP and full ammo. Returns true when something changed.
export function combatTick(game, now = Date.now()) {
  const c = game.combat; if (!c) return false; let changed = false;
  for (const [k, d] of Object.entries(c.down)) if (d.until <= now) { delete c.down[k]; c.hp[k] = MAX_HP; c.respawns[k] = (c.respawns[k] || 0) + 1; (c.respawnedAt ??= {})[k] = now; if (game.mode === 'arena') refillAll(game, c.names?.[k] || k); changed = true; }
  return changed;
}
export { HEAD_KILL_HP };
