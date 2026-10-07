// Shooting arena rules, run by the host (the LAN room, also for solo play). State lives on game.arena (map,
// loadouts, bots) and on game.combat (HP, kills, kill feed, spawn orders: the small state the room streams).
// Arena state is never written into Campaign / Payday saves: the room only saves in Campaign mode.
//  · Deathmatch: everyone against everyone, pick any primary + pistol (free), knife always; respawn after 2.5 s
//    at the spawn point farthest from enemies; most kills when the 10-minute clock runs out wins.
//  · Dropped items (CS2): G drops the gun in hand; walking over one whose slot is empty picks it up, E swaps;
//    the dead drop their primary (or pistol). Anyone — players and bots — can pick them up. They lie on
//    game.combat.ground (streamed with HP and kills) and vanish after a minute.
//  · Bots: added and removed by any player; they walk between spawn points, need real line of sight (map walls),
//    react after a short delay, miss more at range and reload. They hit through the same damage rules as players.
import { ARENA } from './facility-layout.js';
import { ARENA_MAPS, mapBoxes, walkable, lineOfSight } from './arena-maps.js';
import { WEAPONS, weaponById, MAX_HP, EYE } from './weapons-data.js';
import { applyHit, isDown, hpOf } from './combat-logic.js';
import { NADES, NADE_IDS, canCarry, nadesOf, throwNade, nadesTick, clearView } from './arena-nades.js';
import { isDefuse, startDefuse, defuseTick, defuseApply, buyError, pay, teamOf, siteAt, assignTeam, DEFUSE } from './arena-defuse.js';
import { hurt } from './combat-logic.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export const PRIMARIES = WEAPONS.filter(w => w.kind !== 'pistol').map(w => w.id), SECONDARIES = WEAPONS.filter(w => w.kind === 'pistol').map(w => w.id);
export const DM_MS = 10 * 60000, MAX_BOTS = 11, GROUND_MAX = 24, GROUND_MS = 60000, PICK_R = 5;
// Loadout slot an item goes in (grenades and the bomb join this when they arrive).
export const slotOf = id => SECONDARIES.includes(id) ? 'secondary' : PRIMARIES.includes(id) ? 'primary' : NADE_IDS.includes(id) ? 'nades' : id === 'c4' ? 'bomb' : null;
const itemName = id => id === 'c4' ? 'C4 bomb' : NADES[id]?.name || weaponById(id).name;
const BOT_UPGRADE = ['ak', 'm4', 'sniper'];
const BOT_NAMES = ['Bat', 'Tuya', 'Saraa', 'Temuulen', 'Oyun', 'Ganaa', 'Bold', 'Anu', 'Khulan', 'Erdene', 'Naraa'];
const BOT_GUNS = ['ak', 'm4', 'ak', 'smg', 'm4', 'shotgun', 'ak', 'sniper'];

export function startArena(game, { map = 'yard', kind = 'dm', bots = 0 } = {}, now = Date.now()) {
  if (!ARENA_MAPS[map]) throw Error('Unknown arena map');
  game.mode = 'arena'; game.payday = false;
  game.arena = { kind, map, startedAt: now, endsAt: now + DM_MS, loadout: {}, bots: [], botSeq: 0, respawnMs: 2500, over: null };
  game.combat = { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [], spawnTo: {}, ground: [], groundSeq: 0, nades: [], nadeSeq: 0 };
  for (let i = 0; i < bots; i++) addBot(game, now);
  if (kind === 'defuse') startDefuse(game, now);
}
const geo = game => { const map = ARENA_MAPS[game.arena.map], [sw, sd] = map.size; return { map, boxes: mapBoxes(map, ARENA.cx, ARENA.cz), bounds: { minX: ARENA.cx - sw / 2, maxX: ARENA.cx + sw / 2, minZ: ARENA.cz - sd / 2, maxZ: ARENA.cz + sd / 2 } }; };
let cache = { map: null, g: null }; const G = game => cache.map === game.arena.map ? cache.g : (cache = { map: game.arena.map, g: geo(game) }).g;

function addBot(game, now = Date.now(), players = []) {
  const A = game.arena; if (A.bots.length >= MAX_BOTS) throw Error('The arena is full of bots (' + MAX_BOTS + ')');
  const n = A.botSeq++, name = 'BOT ' + BOT_NAMES[n % BOT_NAMES.length] + (n >= BOT_NAMES.length ? ' ' + (Math.floor(n / BOT_NAMES.length) + 1) : '');
  const bot = { id: 'bot-' + n, name, weapon: BOT_GUNS[n % BOT_GUNS.length], x: 0, z: 0, yaw: 0, pitch: 0, wp: -1, shotN: 0, lastShot: 0, ammo: 0, reloadUntil: 0, target: null, seenAt: 0, skill: .55 + (n % 4) * .08 };
  bot.ammo = weaponById(bot.weapon).mag; place(game, bot); A.bots.push(bot); if (game.combat?.d) { assignTeam(game, bot.name, players); bot.weapon = 'pistol'; bot.ammo = weaponById('pistol').mag; } return bot;
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

// Put an item on the ground at (x, z), resting at height y.
function dropItem(game, item, x, z, y, by, now) {
  const C = game.combat; C.ground ??= []; C.groundSeq = (C.groundSeq || 0) + 1;
  C.ground.push({ id: 'g' + C.groundSeq, item, x, z, y: Math.max(0, Math.min(40, +y || 0)), yaw: Math.random() * Math.PI * 2, at: now, by });
  while (C.ground.length > GROUND_MAX) C.ground.shift();
}
const poseOf = (players, name) => players.find(p => key(p.name) === key(name))?.pose || null;
export function arenaApply(game, a, name, players = [], now = Date.now()) {
  if (game.mode !== 'arena' || !game.arena) throw Error('Start the arena first');
  const A = game.arena;
  if (a.type === 'drop') {
    if (isDown(game, name, now)) throw Error('You are dead');
    if (a.slot === 'bomb') { const k = key(name); if (game.combat.d?.bomb?.carrier !== k) throw Error('You don\u2019t have the bomb'); const p = poseOf(players, name) || { x: +a.x || 0, z: +a.z || 0, yaw: +a.yaw || 0 }; game.combat.d.bomb.carrier = null; dropItem(game, 'c4', p.x - Math.sin(p.yaw || 0) * 6, p.z - Math.cos(p.yaw || 0) * 6, a.y, name, now); return 'Dropped the bomb'; }
    const l = A.loadout[key(name)] ??= { primary: null, secondary: 'pistol' }, slot = a.slot === 'secondary' ? 'secondary' : a.slot === 'nades' ? 'nades' : 'primary', item = slot === 'nades' ? (nadesOf(l).includes(a.kind) ? a.kind : null) : l[slot];
    if (!item) throw Error('Nothing to drop');
    // About 1 m ahead of you (the camera looks along (−sin yaw, −cos yaw)); at your feet if a wall is in the way.
    const p = poseOf(players, name) || { x: +a.x || 0, z: +a.z || 0, yaw: +a.yaw || 0 }, g = G(game); let x = p.x - Math.sin(p.yaw || 0) * 6, z = p.z - Math.cos(p.yaw || 0) * 6;
    if (!walkable(g.boxes, g.bounds, x, z, .5)) { x = p.x; z = p.z; }
    if (slot === 'nades') l.nades.splice(l.nades.indexOf(item), 1); else l[slot] = null; dropItem(game, item, x, z, a.y, name, now); return 'Dropped ' + itemName(item);
  }
  if (a.type === 'pickup') {
    if (isDown(game, name, now)) throw Error('You are dead');
    const C = game.combat, i = (C.ground || []).findIndex(it => it.id === a.id), it = C.ground?.[i]; if (!it) throw Error('Already taken');
    const p = poseOf(players, name); if (p && Math.hypot(p.x - it.x, p.z - it.z) > PICK_R + 4) throw Error('Too far away');
    const slot = slotOf(it.item); if (!slot) throw Error('Cannot pick that up');
    if (slot === 'bomb') { if (teamOf(game, name) !== 't') throw Error('Only Terrorists carry the bomb'); C.ground.splice(i, 1); game.combat.d.bomb.carrier = key(name); return 'You have the bomb'; }
    const l = A.loadout[key(name)] ??= { primary: null, secondary: 'pistol' };
    if (slot === 'nades') { if (!canCarry(l.nades ??= [], it.item)) throw Error('No room for more grenades'); C.ground.splice(i, 1); l.nades.push(it.item); return 'Picked up ' + itemName(it.item); }
    const old = l[slot]; if (old && !a.swap) throw Error('Slot taken · E to swap');
    C.ground.splice(i, 1); l[slot] = it.item; if (old) dropItem(game, old, it.x, it.z, it.y, name, now);
    return 'Picked up ' + itemName(it.item);
  }
  if (isDefuse(game) && ['buy-kit', 'plant', 'defuse'].includes(a.type)) return defuseApply(game, a, name, poseOf(players, name) || (a.x !== undefined ? { x: +a.x, y: +a.y, z: +a.z } : null), now);
  if (isDefuse(game) && ['loadout', 'buy-nade'].includes(a.type)) { const e = buyError(game, name, poseOf(players, name), now); if (e) throw Error(e); const item = a.type === 'buy-nade' ? a.kind : a.primary ?? a.secondary; if (!(a.type === 'loadout' && item === null)) pay(game, name, item); }
  if (a.type === 'loadout') {
    const primary = a.primary === null ? null : PRIMARIES.includes(a.primary) ? a.primary : undefined, secondary = SECONDARIES.includes(a.secondary) ? a.secondary : undefined;
    if (primary === undefined && secondary === undefined) throw Error('Choose a weapon');
    const l = A.loadout[key(name)] ??= { primary: null, secondary: 'pistol' }; if (primary !== undefined) l.primary = primary; if (secondary !== undefined) l.secondary = secondary;
    return 'Loadout · ' + [l.primary && weaponById(l.primary).name, l.secondary && weaponById(l.secondary).name].filter(Boolean).join(' + ');
  }
  if (a.type === 'buy-nade') { const kind = a.kind; if (!NADES[kind]) throw Error('Unknown grenade'); const l = A.loadout[key(name)] ??= { primary: null, secondary: 'pistol' }, list = l.nades ??= [];
    if (!canCarry(list, kind)) throw Error(list.length >= 4 ? 'You carry four grenades already' : kind === 'flash' ? 'Two flashbangs at most' : 'You already have a ' + NADES[kind].name);
    list.push(kind); return 'Bought ' + NADES[kind].name; }
  if (a.type === 'throw') { if (isDown(game, name, now)) throw Error('You are dead'); return throwNade(game, name, a.kind, a, now); }
  if (a.type === 'add-bot') { const n = Math.max(1, Math.min(MAX_BOTS, Math.floor(+a.count || 1))); let added = 0; for (let i = 0; i < n && A.bots.length < MAX_BOTS; i++, added++) addBot(game, now, players); return added ? 'Added ' + added + ' bot' + (added > 1 ? 's' : '') : 'The arena is full of bots'; }
  if (a.type === 'remove-bot') { const b = A.bots.pop(); if (!b) throw Error('No bots to remove'); delete game.combat.hp[key(b.name)]; delete game.combat.down[key(b.name)]; delete game.combat.kills[key(b.name)]; delete game.combat.deaths[key(b.name)]; return 'Removed ' + b.name; }
  if (a.type === 'restart') { const map = a.map && ARENA_MAPS[a.map]?.kind === A.kind ? a.map : A.map; startArena(game, { map, kind: A.kind, bots: A.bots.length }, now); return 'New match · ' + ARENA_MAPS[game.arena.map].name; }
  throw Error('Unknown arena action');
}

// Host tick (~20×/s): bots think, move and shoot; respawned players get a spawn point; the match clock.
// Returns true when the streamed combat state changed.
export function arenaTick(game, players = [], dt = .05, now = Date.now()) {
  if (game.mode !== 'arena' || !game.arena) return false; const A = game.arena, C = game.combat, g = G(game); let changed = false;
  // Spawn orders for players who just respawned (their client moves them there).
  for (const [k, at] of Object.entries(C.respawnedAt || {})) { if (C.spawnTo[k]?.at === at) continue; const p = players.find(x => key(x.name) === k); if (!p) continue; C.spawnTo[k] = { at, i: bestSpawn(game, alive(game, players, p.name)) }; changed = true; }
  // The dead drop their primary (or pistol) where they fell; in deathmatch they still respawn with their loadout.
  A.deathDrops ??= {};
  for (const [k, d] of Object.entries(C.down || {})) { const tag = (C.deaths?.[k] || 0) + ':' + d.until; if (A.deathDrops[k] === tag) continue; A.deathDrops[k] = tag;
    if (C.d?.bomb?.carrier === k) { const bt = A.bots.find(b => key(b.name) === k) || players.find(x => key(x.name) === k)?.pose; if (bt) dropItem(game, 'c4', bt.x, bt.z, 0, k, now); C.d.bomb.carrier = null; changed = true; }
    const bot = A.bots.find(b => key(b.name) === k), p = bot ? null : players.find(x => key(x.name) === k), l = A.loadout[k] || {}, item = bot ? bot.weapon : l.primary || (l.secondary === undefined ? 'pistol' : l.secondary);
    const at = bot || p?.pose; if (item && at && slotOf(item)) { dropItem(game, item, at.x, at.z, bot ? 0 : Math.max(0, (at.y || 0) - EYE), bot ? bot.name : p.name, now); changed = true; } }
  if (nadesTick(game, players, dt, now, g)) changed = true;
  if (C.ground?.length) { const n = C.ground.length; C.ground = C.ground.filter(it => it.item === 'c4' || now - it.at < GROUND_MS); if (C.ground.length !== n) changed = true; }
  for (const bot of A.bots) {
    if (isDown(game, bot.name, now)) { bot.dead = true; continue; }
    if (bot.dead && !C.d) { bot.dead = false; place(game, bot); bot.ammo = weaponById(bot.weapon).mag; changed = true; }
    if (C.d && (C.d.round?.phase === 'freeze' || C.d.round?.phase === 'over' || C.d.matchOver)) continue;   // defuse: frozen while buying, between rounds
    const team = C.d ? C.d.teams[key(bot.name)] : null;
    // Defuse: the bomb carrier on a site plants straight away (even under fire) and keeps at it.
    if (C.d && team === 't' && C.d.bomb.carrier === key(bot.name) && C.d.round.phase === 'live') { if (C.d.round.plant?.by === key(bot.name)) continue; if (!C.d.round.plant) { const site = siteAt(game, bot); if (site) { C.d.round.plant = { by: key(bot.name), start: now, x: bot.x, z: bot.z, y: 0, site }; changed = true; continue; } } }
    const wpn = weaponById(bot.weapon), foes = alive(game, players, bot.name).filter(f => !team || C.d.teams[key(f.name)] !== team);
    // Nearest visible enemy within range.
    let tgt = null, td = Infinity; for (const f of foes) { const d = Math.hypot(f.x - bot.x, f.z - bot.z); if (d < Math.min(wpn.range, 300) && d < td && clearView(game, g.boxes, bot.x, bot.z, f.x, f.z)) { tgt = f; td = d; } }   // walls and smoke block
    if (tgt) {
      if (bot.target !== tgt.name) { bot.target = tgt.name; bot.seenAt = now; }
      const want = Math.atan2(-(tgt.x - bot.x), -(tgt.z - bot.z)), diff = Math.atan2(Math.sin(want - bot.yaw), Math.cos(want - bot.yaw)); bot.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
      const react = 380 + (1 - bot.skill) * 600;
      if (now < bot.reloadUntil || now < (bot.blindUntil || 0)) continue;   // reloading, or blinded by a flashbang
      if (bot.ammo <= 0) { bot.reloadUntil = now + wpn.reloadMs; bot.ammo = wpn.mag; bot.reloadN = (bot.reloadN || 0) + 1; changed = true; continue; }
      if (Math.abs(diff) < .12 && now - bot.seenAt > react && now - bot.lastShot > wpn.rateMs * (wpn.auto ? 1.6 : 1.1)) {
        bot.lastShot = now; bot.ammo--; bot.shotN++; changed = true;
        const pHit = Math.max(.08, Math.min(.85, bot.skill * (1 - td / (wpn.range * 1.3)) * (wpn.kind === 'shotgun' && td > 40 ? .3 : 1)));
        if (Math.random() < pHit) { const r = Math.random(), zone = r < .12 ? 'head' : r < .62 ? 'chest' : r < .82 ? 'stomach' : 'legs'; applyHit(game, bot.name, tgt.name, wpn, zone, td, wpn.pellets ? 1 + Math.floor(Math.random() * wpn.pellets * .6) : 1, now); }
      }
      continue;
    }
    bot.target = null;
    // Bots pick up better guns they walk over (a rifle or the AWP instead of an SMG, shotgun or LMG).
    if (C.ground?.length && !BOT_UPGRADE.includes(bot.weapon)) { const i = C.ground.findIndex(it => BOT_UPGRADE.includes(it.item) && Math.hypot(it.x - bot.x, it.z - bot.z) < 4);
      if (i >= 0) { const it = C.ground.splice(i, 1)[0]; dropItem(game, bot.weapon, it.x, it.z, it.y, bot.name, now); bot.weapon = it.item; bot.ammo = weaponById(it.item).mag; changed = true; } }
    if (C.d) { if (defuseBot(game, bot, team, g, dt, now)) changed = true; continue; }
    // Wander: walk towards a spawn point used as a waypoint; steer round obstacles; pick another when stuck.
    if (bot.wp < 0 || Math.hypot(...wp(g, bot.wp).map((v, i) => v - (i ? bot.z : bot.x))) < 6) bot.wp = Math.floor(Math.random() * g.map.spawns.length);
    const [wx, wz] = wp(g, bot.wp), head = Math.atan2(wx - bot.x, wz - bot.z), step = 26 * dt;
    let moved = false; for (const turn of [0, .6, -.6, 1.2, -1.2]) { const h = head + turn, nx = bot.x + Math.sin(h) * step, nz = bot.z + Math.cos(h) * step; if (walkable(g.boxes, g.bounds, nx, nz)) { bot.x = nx; bot.z = nz; bot.yaw = h + Math.PI; moved = true; break; } }
    if (!moved) bot.wp = -1;
  }
  if (C.d) { if (defuseTick(game, players, now, { hurtAll: (x, z, y, dmg, R) => { for (const t of alive(game, players, '')) { const dd = Math.hypot(t.x - x, t.z - z); if (dd < R) hurt(game, 'C4', t.name, { id: 'c4', name: 'C4' }, Math.round(dmg * Math.pow(1 - dd / R, 1.4)), 'chest', now); } }, posOf: k => { const b = A.bots.find(b => key(b.name) === k); if (b) return b; const p = players.find(x => key(x.name) === k)?.pose; return p || null; } })) changed = true; return changed; }
  if (!A.over && now > A.endsAt) { const kills = C.kills || {}, top = Object.entries(kills).sort((a, b) => b[1] - a[1])[0]; A.over = { at: now, winner: top ? top[0] : null }; changed = true; }
  if (A.over && now - A.over.at > 12000) { startArena(game, { map: A.map, bots: A.bots.length }, now); changed = true; }
  return changed;
}

// Defuse bots: Terrorists walk a route to this round's site (the carrier plants there); CTs hold a site and, once the
// bomb is down, walk to it and defuse. Same steering as deathmatch bots.
function defuseBot(game, bot, team, g, dt, now) {
  const d = game.combat.d, r = d.round, m = g.map, k = key(bot.name), cx = ARENA.cx, cz = ARENA.cz;
  if (!bot.path) { const routes = m.routes[team], site = team === 't' ? r.tSite : parseInt(bot.id.slice(4)) % 2 ? 'A' : 'B'; bot.site = site; bot.path = routes[site].map(([x, z]) => [cx + x, cz + z]); bot.pi = 0; }
  if (r.phase === 'planted' && team === 'ct' && !bot.retake) { bot.retake = true; bot.path = [...bot.path.slice(bot.pi), [r.planted.x, r.planted.z]]; bot.pi = 0; }
  // At the bomb: defuse. At the site with the bomb: plant.
  if (team === 'ct' && r.phase === 'planted' && Math.hypot(bot.x - r.planted.x, bot.z - r.planted.z) < 5) { if (!r.defuse) { r.defuse = { by: k, start: now, ms: d.kits[k] ? DEFUSE.kitMs : DEFUSE.defuseMs, x: bot.x, z: bot.z }; return true; } return false; }
  if (team === 't' && d.bomb.carrier === k && r.phase === 'live' && !r.plant) { const site = siteAt(game, bot); if (site) { r.plant = { by: k, start: now, x: bot.x, z: bot.z, y: 0, site }; return true; } }
  if (r.plant?.by === k) return false;   // standing still while planting
  // A Terrorist without the bomb picks it up if it lies near.
  if (team === 't' && !d.bomb.carrier) { const i = (game.combat.ground || []).findIndex(it => it.item === 'c4' && Math.hypot(it.x - bot.x, it.z - bot.z) < 4); if (i >= 0) { game.combat.ground.splice(i, 1); d.bomb.carrier = k; return true; } }
  if (bot.pi >= bot.path.length) return false; const [wx, wz] = bot.path[bot.pi]; if (Math.hypot(wx - bot.x, wz - bot.z) < 4) { bot.pi++; return true; }
  const head = Math.atan2(wx - bot.x, wz - bot.z), step = 26 * dt;
  for (const turn of [0, .6, -.6, 1.2, -1.2]) { const h = head + turn, nx = bot.x + Math.sin(h) * step, nz = bot.z + Math.cos(h) * step; if (walkable(g.boxes, g.bounds, nx, nz)) { bot.x = nx; bot.z = nz; bot.yaw = h + Math.PI; return true; } }
  bot.pi++; return true;   // stuck: skip this waypoint
}
const wp = (g, i) => { const [x, z] = g.map.spawns[i]; return [ARENA.cx + x, ARENA.cz + z]; };
// Bots as roster entries, so every client draws, hears and can shoot them like players.
export function botRoster(game) {
  return (game.mode === 'arena' && game.arena?.bots || []).map((b, i) => ({ id: b.id, name: b.name, role: 'bot', bot: true, color: [0xff879e, 0xe2e779, 0x7ca1ff, 0xc5a27d][i % 4], slot: -1,
    pose: { t: Date.now(), x: b.x, y: EYE, z: b.z, yaw: b.yaw, crouched: false, active: !isDown(game, b.name), face: 'smile', skin: ['red', 'blue', 'green', 'pink'][i % 4], hat: 'helmet', outfit: 'vest', carry: null, point: false, gun: true, weapon: b.weapon, shot: { n: b.shotN, pitch: 0, r: b.reloadN || 0 }, emote: { id: null, n: 0 } } }));
}
export const arenaHp = (game, name) => hpOf(game, name) ?? MAX_HP;
