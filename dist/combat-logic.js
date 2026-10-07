// Payday shoot-outs, decided by the host. A shooter's client reports a hit on another engineer; the host
// checks it (the gun is theirs, it isn't firing faster than the gun can, the target is within the gun's range
// of the shooter's position, both are standing) and only then takes HP. At 0 HP an engineer is knocked out,
// drops for a few seconds and respawns with full HP at the entrance. Nothing else in the game is affected.
import { weaponById, MAX_HP, RESPAWN_MS, damageFor, HIT_GROUPS } from './weapons-data.js';
import { arsenalOf } from './casino-logic.js';

const key = name => String(name || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const state = game => game.combat ??= { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [] };
export const hpOf = (game, name) => game.combat?.hp?.[key(name)] ?? MAX_HP;
export const isDown = (game, name, now = Date.now()) => (game.combat?.down?.[key(name)]?.until || 0) > now;

// What a player may use: Payday = bought guns (+ Darja's cannon); Arena = the match loadout (primary, pistol, knife).
const DARJA = n => /^darja$/.test(key(n));
export function arenaArsenalOf(game, name) { const l = game.arena?.loadout?.[key(name)] || {}; return [l.primary, l.secondary || 'pistol', DARJA(name) ? 'karambit' : 'knife'].filter(Boolean); }
export const ownedWeapons = (game, name) => game.mode === 'arena' ? arenaArsenalOf(game, name) : arsenalOf(game, name);
export const combatOn = game => !!game.payday || game.mode === 'arena';
const respawnMs = game => game.mode === 'arena' ? (game.arena?.respawnMs ?? 2500) : RESPAWN_MS;
// Damage one engineer (or bot). Shared by player hits (checked in combatApply) and host-run bots.
export function applyHit(game, shooter, targetName, wpn, zone, dist, pellets = 1, now = Date.now()) {
  const c = state(game), me = key(shooter), tk = key(targetName); if (isDown(game, targetName, now)) return { message: 'Already down', dmg: 0, hp: 0 };
  const dmg = damageFor(wpn, zone, dist, pellets), hp = Math.max(0, hpOf(game, targetName) - dmg); c.hp[tk] = hp; const nm = c.names ??= {}; nm[me] = String(shooter).slice(0, 40); nm[tk] = String(targetName).slice(0, 40);
  if (hp > 0) return { message: 'Hit ' + targetName + ' · −' + dmg + ' HP', dmg, hp, zone };
  c.down[tk] = { until: now + respawnMs(game), by: shooter, weapon: wpn.name };
  c.kills[me] = (c.kills[me] || 0) + 1; c.deaths[tk] = (c.deaths[tk] || 0) + 1;
  c.feed.unshift({ at: now, by: shooter, target: targetName, weapon: wpn.name, wid: wpn.id, head: zone === 'head' }); c.feed.length = Math.min(c.feed.length, 6);
  return { message: 'Knocked out ' + targetName + (zone === 'head' ? ' · head shot' : ''), dmg, hp: 0, down: true, zone };
}
export function combatApply(game, a, name, players = [], actor = null, now = Date.now()) {
  if (!combatOn(game)) throw Error('Weapons are part of Payday and the Arena');
  const c = state(game), me = key(name);
  if (a?.type !== 'hit') throw Error('Unknown combat action');
  const wpn = weaponById(a.weapon); if (!wpn || !ownedWeapons(game, name).includes(wpn.id)) throw Error('You do not own that weapon');
  if (isDown(game, name, now)) throw Error('You are knocked out');
  const target = players.find(p => p.id === a.target), tk = key(target?.name);
  if (!target || target.id === actor || tk === me) throw Error('No target');
  if (isDown(game, target.name, now)) return 'Already down';
  if (now - (c.last[me] || 0) < wpn.rateMs * .6) throw Error('Too fast for the ' + wpn.name);
  const from = players.find(p => p.id === actor)?.pose, to = target.pose;
  if (from && to && Math.hypot(from.x - to.x, from.z - to.z) > wpn.range * 1.15 + 4) throw Error('Out of range');
  c.last[me] = now;
  const pellets = wpn.pellets ? Math.max(1, Math.min(wpn.pellets, Math.floor(Number(a.pellets) || 1))) : 1;
  const zone = HIT_GROUPS[a.zone] ? a.zone : a.head ? 'head' : 'chest', dist = from && to ? Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) : 0;
  // Damage is computed here from the real distance, never trusted from the shooter.
  return applyHit(game, name, target.name, wpn, zone, dist, pellets, now);
}
// Respawn knocked-out engineers with full HP. Returns true when something changed.
export function combatTick(game, now = Date.now()) {
  const c = game.combat; if (!c) return false; let changed = false;
  for (const [k, d] of Object.entries(c.down)) if (d.until <= now) { delete c.down[k]; c.hp[k] = MAX_HP; c.respawns[k] = (c.respawns[k] || 0) + 1; (c.respawnedAt ??= {})[k] = now; changed = true; }
  return changed;
}
