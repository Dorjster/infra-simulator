// Shooting arena rules, run by the host (the LAN room, also for solo play). State lives on game.arena (map,
// loadouts, bots) and on game.combat (HP, kills, kill feed, spawn orders: the small state the room streams).
// Arena state is never written into Campaign / Payday saves: the room only saves in Campaign mode.
//  · Deathmatch: everyone against everyone, pick any primary + pistol (free), knife always; respawn after 2.5 s
//    at the spawn point farthest from enemies; most kills when the 10-minute clock runs out wins.
//  · Bots: added and removed by any player; they walk between spawn points, need real line of sight (map walls),
//    react after a short delay, miss more at range and reload. They hit through the same damage rules as players.
import { ARENA } from './facility-layout.js';
import { ARENA_MAPS, mapBoxes, walkable, lineOfSight } from './arena-maps.js';
import { WEAPONS, weaponById, MAX_HP, EYE } from './weapons-data.js';
import { applyHit, isDown, hpOf } from './combat-logic.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export const PRIMARIES = WEAPONS.filter(w => w.kind !== 'pistol').map(w => w.id), SECONDARIES = WEAPONS.filter(w => w.kind === 'pistol').map(w => w.id);
export const DM_MS = 10 * 60000, MAX_BOTS = 11;
const BOT_NAMES = ['Bat', 'Tuya', 'Saraa', 'Temuulen', 'Oyun', 'Ganaa', 'Bold', 'Anu', 'Khulan', 'Erdene', 'Naraa'];
const BOT_GUNS = ['ak', 'm4', 'ak', 'smg', 'm4', 'shotgun', 'ak', 'sniper'];

export function startArena(game, { map = 'yard', kind = 'dm', bots = 0 } = {}, now = Date.now()) {
  if (!ARENA_MAPS[map]) throw Error('Unknown arena map');
  game.mode = 'arena'; game.payday = false;
  game.arena = { kind, map, startedAt: now, endsAt: now + DM_MS, loadout: {}, bots: [], botSeq: 0, respawnMs: 2500, over: null };
  game.combat = { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [], spawnTo: {} };
  for (let i = 0; i < bots; i++) addBot(game, now);
}
const geo = game => { const map = ARENA_MAPS[game.arena.map], [sw, sd] = map.size; return { map, boxes: mapBoxes(map, ARENA.cx, ARENA.cz), bounds: { minX: ARENA.cx - sw / 2, maxX: ARENA.cx + sw / 2, minZ: ARENA.cz - sd / 2, maxZ: ARENA.cz + sd / 2 } }; };
let cache = { map: null, g: null }; const G = game => cache.map === game.arena.map ? cache.g : (cache = { map: game.arena.map, g: geo(game) }).g;

function addBot(game, now = Date.now()) {
  const A = game.arena; if (A.bots.length >= MAX_BOTS) throw Error('The arena is full of bots (' + MAX_BOTS + ')');
  const n = A.botSeq++, name = 'BOT ' + BOT_NAMES[n % BOT_NAMES.length] + (n >= BOT_NAMES.length ? ' ' + (Math.floor(n / BOT_NAMES.length) + 1) : '');
  const bot = { id: 'bot-' + n, name, weapon: BOT_GUNS[n % BOT_GUNS.length], x: 0, z: 0, yaw: 0, pitch: 0, wp: -1, shotN: 0, lastShot: 0, ammo: 0, reloadUntil: 0, target: null, seenAt: 0, skill: .55 + (n % 4) * .08 };
  bot.ammo = weaponById(bot.weapon).mag; place(game, bot); A.bots.push(bot); return bot;
}
// Spawn point farthest from everyone else who is alive.
function bestSpawn(game, others) {
  const { map } = G(game); let best = 0, bestD = -1;
  map.spawns.forEach(([sx, sz], i) => { const x = ARENA.cx + sx, z = ARENA.cz + sz, d = others.length ? Math.min(...others.map(o => Math.hypot(o.x - x, o.z - z))) : Math.random() * 100; if (d > bestD) { bestD = d; best = i; } });
  return best;
}
function place(game, bot) { const i = bestSpawn(game, alive(game, [], bot.name)), [sx, sz] = G(game).map.spawns[i]; bot.x = ARENA.cx + sx; bot.z = ARENA.cz + sz; bot.wp = -1; }
// Everyone alive (players in the arena + bots), except `but`.
function alive(game, players, but) {
  const out = []; for (const p of players) if (p.pose && p.pose.z < ARENA.maxZ && key(p.name) !== key(but) && !isDown(game, p.name)) out.push({ name: p.name, x: p.pose.x, z: p.pose.z, y: p.pose.y });
  for (const b of game.arena?.bots || []) if (key(b.name) !== key(but) && !isDown(game, b.name)) out.push({ name: b.name, x: b.x, z: b.z, y: EYE }); return out;
}

export function arenaApply(game, a, name, players = [], now = Date.now()) {
  if (game.mode !== 'arena' || !game.arena) throw Error('Start the arena first');
  const A = game.arena;
  if (a.type === 'loadout') {
    const primary = a.primary === null ? null : PRIMARIES.includes(a.primary) ? a.primary : undefined, secondary = SECONDARIES.includes(a.secondary) ? a.secondary : undefined;
    if (primary === undefined && secondary === undefined) throw Error('Choose a weapon');
    const l = A.loadout[key(name)] ??= { primary: null, secondary: 'pistol' }; if (primary !== undefined) l.primary = primary; if (secondary !== undefined) l.secondary = secondary;
    return 'Loadout · ' + [l.primary && weaponById(l.primary).name, weaponById(l.secondary).name].filter(Boolean).join(' + ');
  }
  if (a.type === 'add-bot') { const n = Math.max(1, Math.min(MAX_BOTS, Math.floor(+a.count || 1))); let added = 0; for (let i = 0; i < n && A.bots.length < MAX_BOTS; i++, added++) addBot(game, now); return added ? 'Added ' + added + ' bot' + (added > 1 ? 's' : '') : 'The arena is full of bots'; }
  if (a.type === 'remove-bot') { const b = A.bots.pop(); if (!b) throw Error('No bots to remove'); delete game.combat.hp[key(b.name)]; delete game.combat.down[key(b.name)]; delete game.combat.kills[key(b.name)]; delete game.combat.deaths[key(b.name)]; return 'Removed ' + b.name; }
  if (a.type === 'restart') { startArena(game, { map: a.map && ARENA_MAPS[a.map] ? a.map : A.map, bots: A.bots.length }, now); return 'New match · ' + ARENA_MAPS[game.arena.map].name; }
  throw Error('Unknown arena action');
}

// Host tick (~20×/s): bots think, move and shoot; respawned players get a spawn point; the match clock.
// Returns true when the streamed combat state changed.
export function arenaTick(game, players = [], dt = .05, now = Date.now()) {
  if (game.mode !== 'arena' || !game.arena) return false; const A = game.arena, C = game.combat, g = G(game); let changed = false;
  // Spawn orders for players who just respawned (their client moves them there).
  for (const [k, at] of Object.entries(C.respawnedAt || {})) { if (C.spawnTo[k]?.at === at) continue; const p = players.find(x => key(x.name) === k); if (!p) continue; C.spawnTo[k] = { at, i: bestSpawn(game, alive(game, players, p.name)) }; changed = true; }
  for (const bot of A.bots) {
    if (isDown(game, bot.name, now)) { bot.dead = true; continue; }
    if (bot.dead) { bot.dead = false; place(game, bot); bot.ammo = weaponById(bot.weapon).mag; changed = true; }
    const wpn = weaponById(bot.weapon), foes = alive(game, players, bot.name);
    // Nearest visible enemy within range.
    let tgt = null, td = Infinity; for (const f of foes) { const d = Math.hypot(f.x - bot.x, f.z - bot.z); if (d < Math.min(wpn.range, 300) && d < td && lineOfSight(g.boxes, bot.x, bot.z, f.x, f.z)) { tgt = f; td = d; } }
    if (tgt) {
      if (bot.target !== tgt.name) { bot.target = tgt.name; bot.seenAt = now; }
      const want = Math.atan2(-(tgt.x - bot.x), -(tgt.z - bot.z)), diff = Math.atan2(Math.sin(want - bot.yaw), Math.cos(want - bot.yaw)); bot.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
      const react = 380 + (1 - bot.skill) * 600;
      if (now < bot.reloadUntil) continue;
      if (bot.ammo <= 0) { bot.reloadUntil = now + wpn.reloadMs; bot.ammo = wpn.mag; bot.reloadN = (bot.reloadN || 0) + 1; changed = true; continue; }
      if (Math.abs(diff) < .12 && now - bot.seenAt > react && now - bot.lastShot > wpn.rateMs * (wpn.auto ? 1.6 : 1.1)) {
        bot.lastShot = now; bot.ammo--; bot.shotN++; changed = true;
        const pHit = Math.max(.08, Math.min(.85, bot.skill * (1 - td / (wpn.range * 1.3)) * (wpn.kind === 'shotgun' && td > 40 ? .3 : 1)));
        if (Math.random() < pHit) { const r = Math.random(), zone = r < .12 ? 'head' : r < .62 ? 'chest' : r < .82 ? 'stomach' : 'legs'; applyHit(game, bot.name, tgt.name, wpn, zone, td, wpn.pellets ? 1 + Math.floor(Math.random() * wpn.pellets * .6) : 1, now); }
      }
      continue;
    }
    bot.target = null;
    // Wander: walk towards a spawn point used as a waypoint; steer round obstacles; pick another when stuck.
    if (bot.wp < 0 || Math.hypot(...wp(g, bot.wp).map((v, i) => v - (i ? bot.z : bot.x))) < 6) bot.wp = Math.floor(Math.random() * g.map.spawns.length);
    const [wx, wz] = wp(g, bot.wp), head = Math.atan2(wx - bot.x, wz - bot.z), step = 13 * dt;
    let moved = false; for (const turn of [0, .6, -.6, 1.2, -1.2]) { const h = head + turn, nx = bot.x + Math.sin(h) * step, nz = bot.z + Math.cos(h) * step; if (walkable(g.boxes, g.bounds, nx, nz)) { bot.x = nx; bot.z = nz; bot.yaw = h + Math.PI; moved = true; break; } }
    if (!moved) bot.wp = -1;
  }
  if (!A.over && now > A.endsAt) { const kills = C.kills || {}, top = Object.entries(kills).sort((a, b) => b[1] - a[1])[0]; A.over = { at: now, winner: top ? top[0] : null }; changed = true; }
  if (A.over && now - A.over.at > 12000) { startArena(game, { map: A.map, bots: A.bots.length }, now); changed = true; }
  return changed;
}
const wp = (g, i) => { const [x, z] = g.map.spawns[i]; return [ARENA.cx + x, ARENA.cz + z]; };
// Bots as roster entries, so every client draws, hears and can shoot them like players.
export function botRoster(game) {
  return (game.mode === 'arena' && game.arena?.bots || []).map((b, i) => ({ id: b.id, name: b.name, role: 'bot', bot: true, color: [0xff879e, 0xe2e779, 0x7ca1ff, 0xc5a27d][i % 4], slot: -1,
    pose: { t: Date.now(), x: b.x, y: EYE, z: b.z, yaw: b.yaw, crouched: false, active: !isDown(game, b.name), face: 'smile', skin: ['red', 'blue', 'green', 'pink'][i % 4], hat: 'helmet', outfit: 'vest', carry: null, point: false, gun: true, weapon: b.weapon, shot: { n: b.shotN, pitch: 0, r: b.reloadN || 0 }, emote: { id: null, n: 0 } } }));
}
export const arenaHp = (game, name) => hpOf(game, name) ?? MAX_HP;
