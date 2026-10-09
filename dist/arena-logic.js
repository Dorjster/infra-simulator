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
import { ARENA_MAPS, mapBoxes, walkable, lineOfSight, segmentClear, spawnSlots } from './arena-maps.js';
import { WEAPONS, weaponById, MAX_HP, EYE, isFirearm, fullAmmo, defaultPistol, ARMOR } from './weapons-data.js';
import { applyHit, isDown, hpOf, ammoOf, setAmmo, refillAll, teamPistol } from './combat-logic.js';
import { NADES, NADE_IDS, canCarry, nadesOf, throwNade, nadesTick, clearView, fireCells, inFire } from './arena-nades.js';
import { isDefuse, startDefuse, defuseTick, defuseApply, buyError, pay, charge, teamOf, siteAt, assignTeam, DEFUSE, PRICE, newRound, freeSpot } from './arena-defuse.js';
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

// A LAN match opens with a lobby (`lobbyMs`, normally 2 minutes): players join, pick teams and ready up, walking
// around with no fighting; it starts at the timeout (if there are enough players) or when the host starts it.
export const LOBBY_MS = 120000, LOBBY_MORE_MS = 30000, DIFFICULTY = { easy: { skill: .35, react: 800, head: .03, aim: .5 }, normal: { skill: .55, react: 480, head: .06, aim: 1 }, hard: { skill: .8, react: 260, head: .12, aim: 1.4 } };
export function startArena(game, { map = 'yard', kind = 'dm', bots = 0, lobbyMs = 0, difficulty = 'normal' } = {}, now = Date.now()) {
  if (!ARENA_MAPS[map]) throw Error('Unknown arena map');
  if (ARENA_MAPS[map].kind !== kind) throw Error(ARENA_MAPS[map].name + ' is not a ' + (kind === 'defuse' ? 'Defuse' : 'Deathmatch') + ' map');
  game.mode = 'arena'; game.payday = false;
  game.arena = { kind, map, startedAt: now, endsAt: now + DM_MS, loadout: {}, bots: [], botSeq: 0, respawnMs: 2500, over: null, difficulty: DIFFICULTY[difficulty] ? difficulty : 'normal', lobby: lobbyMs > 0 ? { until: now + lobbyMs, started: false, ready: {}, note: '' } : null };
  game.combat = { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [], spawnTo: {}, ground: [], groundSeq: 0, nades: [], nadeSeq: 0 };
  for (let i = 0; i < bots; i++) addBot(game, now);
  if (kind === 'defuse') startDefuse(game, now);
}
const geo = game => { const map = ARENA_MAPS[game.arena.map], [sw, sd] = map.size; return { map, boxes: mapBoxes(map, ARENA.cx, ARENA.cz), bounds: { minX: ARENA.cx - sw / 2, maxX: ARENA.cx + sw / 2, minZ: ARENA.cz - sd / 2, maxZ: ARENA.cz + sd / 2 } }; };
let cache = { map: null, g: null }; const G = game => cache.map === game.arena.map ? cache.g : (cache = { map: game.arena.map, g: geo(game) }).g;

// One bot step towards heading h (steering round obstacles); true when it moved.
function botStep(g, bot, h, step) { for (const turn of [0, .5, -.5, 1, -1, 1.5, -1.5]) { const hh = h + turn, nx = bot.x + Math.sin(hh) * step, nz = bot.z + Math.cos(hh) * step; if (walkable(g.boxes, g.bounds, nx, nz)) { bot.x = nx; bot.z = nz; return true; } } return false; }
// The nearest walkable spot (within 20 units, reachable in a straight line) that a wall or crate hides from `from`.
function findCover(g, bot, from) {
  let best = null, bd = Infinity;
  for (let a = 0; a < 12; a++) for (const r of [5, 10, 15, 20]) { const h = a / 12 * Math.PI * 2, x = bot.x + Math.sin(h) * r, z = bot.z + Math.cos(h) * r; if (r >= bd || !walkable(g.boxes, g.bounds, x, z)) continue;
    if (lineOfSight(g.boxes, from.x, from.z, x, z, 9)) continue; let clear = true; for (let t = .25; t < 1; t += .25) if (!walkable(g.boxes, g.bounds, bot.x + (x - bot.x) * t, bot.z + (z - bot.z) * t)) { clear = false; break; } if (clear) { best = { x, z }; bd = r; } }
  return best;
}
// A bot's gun with its rounds (finite like everyone's): full unless `ammo` [magazine, reserve] is given.
export function botArm(bot, id, ammo = null) { const w = weaponById(id) || weaponById('pistol'); bot.weapon = w.id; bot.ammo = ammo ? ammo[0] : w.mag; bot.reserve = ammo ? ammo[1] : w.reserve; bot.reloadUntil = 0; }
// Reload from the reserve; empty reserve: fall back to the team pistol. Returns true when a reload started.
function botReload(game, bot) { const w = weaponById(bot.weapon), move = Math.min(w.mag - bot.ammo, bot.reserve || 0); if (move > 0) { bot.ammo += move; bot.reserve -= move; return true; } botArm(bot, defaultPistol(game.combat?.d?.teams?.[key(bot.name)])); return false; }
function addBot(game, now = Date.now(), players = []) {
  const A = game.arena; if (A.bots.length >= MAX_BOTS) throw Error('The arena is full of bots (' + MAX_BOTS + ')');
  const n = A.botSeq++, name = 'BOT ' + BOT_NAMES[n % BOT_NAMES.length] + (n >= BOT_NAMES.length ? ' ' + (Math.floor(n / BOT_NAMES.length) + 1) : '');
  const bot = { id: 'bot-' + n, name, weapon: BOT_GUNS[n % BOT_GUNS.length], x: 0, z: 0, yaw: 0, pitch: 0, wp: -1, shotN: 0, lastShot: 0, ammo: 0, reloadUntil: 0, target: null, seenAt: 0, skill: .55 + (n % 4) * .08 };
  botArm(bot, bot.weapon); place(game, bot); A.bots.push(bot); if (game.combat?.d) { const t = assignTeam(game, bot.name, players); botArm(bot, defaultPistol(t)); } return bot;
}
// Deathmatch spawn: the spot (of the map's spawn spots, spawnSlots) farthest from everyone alive — never on someone.
function bestSpot(game, others) {
  const { map } = G(game), slots = spawnSlots(map, 'dm'); let best = slots[0], bestD = -1;
  for (const [sx, sz] of slots) { const x = ARENA.cx + sx, z = ARENA.cz + sz, d = others.length ? Math.min(...others.map(o => Math.hypot(o.x - x, o.z - z))) : Math.random() * 100; if (d > bestD) { bestD = d; best = [sx, sz]; } }
  return { x: ARENA.cx + best[0], z: ARENA.cz + best[1] };
}
// Everyone alive plus where players were just sent (they may not be there yet): what a new spawn must avoid.
const occupied = (game, players, but, now = Date.now()) => [...alive(game, players, but), ...Object.entries(game.combat.spawnTo || {}).filter(([k, s]) => k !== key(but) && Number.isFinite(s.x) && now - (s.at || 0) < 4000).map(([, s]) => ({ x: s.x, z: s.z }))];
function place(game, bot, players = []) { const s = bestSpot(game, occupied(game, players, bot.name)); bot.x = s.x; bot.z = s.z; bot.wp = -1; }
// Everyone alive (players in the arena + bots), except `but`.
function alive(game, players, but) {
  const out = []; for (const p of players) if (p.pose && p.pose.z < ARENA.maxZ && key(p.name) !== key(but) && !isDown(game, p.name)) out.push({ name: p.name, x: p.pose.x, z: p.pose.z, y: p.pose.y });
  for (const b of game.arena?.bots || []) if (key(b.name) !== key(but) && !isDown(game, b.name)) out.push({ name: b.name, x: b.x, z: b.z, y: EYE }); return out;
}

// Put an item on the ground at (x, z), resting at height y.
// A gun keeps its rounds on the ground ([magazine, reserve]); `by` and their team are shown to whoever finds it.
function dropItem(game, item, x, z, y, by, now, ammo = null) {
  const C = game.combat; C.ground ??= []; C.groundSeq = (C.groundSeq || 0) + 1;
  C.ground.push({ id: 'g' + C.groundSeq, item, x, z, y: Math.max(0, Math.min(40, +y || 0)), yaw: Math.random() * Math.PI * 2, at: now, by, team: C.d?.teams?.[key(by)] || null, ammo: isFirearm(weaponById(item)) ? (ammo || fullAmmo(item)) : null });
  while (C.ground.length > GROUND_MAX) { const i = C.ground.findIndex(it => it.item !== 'c4'); C.ground.splice(i < 0 ? 0 : i, 1); }
}
// Take a gun out of a player's hands onto the ground (with its rounds); forgets their ammo for it.
function dropFrom(game, name, item, x, z, y, now) { const k = key(name), a = ammoOf(game, name, item); if (game.combat.ammo?.[k]) delete game.combat.ammo[k][item]; dropItem(game, item, x, z, y, name, now, a); }
// Can a player at pose reach an item on the ground (close enough, no wall between)?
function reachable(game, p, it) { if (!p) return true; const g = G(game), d = Math.hypot(p.x - it.x, p.z - it.z); if (d > PICK_R + 4) return 'Too far away'; const eye = p.y ?? EYE; return segmentClear(g.boxes, p.x, eye, p.z, it.x, (it.y || 0) + .6, it.z) || segmentClear(g.boxes, p.x, eye - 6, p.z, it.x, (it.y || 0) + .6, it.z) ? true : 'Behind a wall'; }
const poseOf = (players, name) => players.find(p => key(p.name) === key(name))?.pose || null;
// A player's loadout (created with the team's starting pistol).
export const loadoutOf = (game, name) => game.arena.loadout[key(name)] ??= { primary: null, secondary: teamPistol(game, name), nades: [] };
export function arenaApply(game, a, name, players = [], now = Date.now(), perm = { isHost: true }) {
  if (game.mode !== 'arena' || !game.arena) throw Error('Start the arena first');
  const A = game.arena;
  // ── Match: lobby, teams, host settings, map ──
  if (a.type === 'ready') { if (!A.lobby || A.lobby.started) throw Error('The match is running'); A.lobby.ready[key(name)] = a.ready !== false; return a.ready === false ? 'Not ready' : 'Ready'; }
  if (a.type === 'start-match') { if (!perm.isHost) throw Error('Only the host starts the match'); if (!A.lobby || A.lobby.started) throw Error('The match is already running'); const e = lobbyShort(game, players); if (e) throw Error(e); beginMatch(game, players, now); return 'Match started'; }
  if (a.type === 'team') return changeTeam(game, name, a.team, players, now);
  if (a.type === 'settings') { if (!perm.isHost) throw Error('Only the host changes match settings');
    if (a.difficulty !== undefined) { if (!DIFFICULTY[a.difficulty]) throw Error('Unknown difficulty'); A.difficulty = a.difficulty; }
    if (a.bots !== undefined) { const want = Math.max(0, Math.min(MAX_BOTS, Math.floor(+a.bots) || 0)); while (A.bots.length < want) addBot(game, now, players); while (A.bots.length > want) removeBot(game); }
    return 'Bots: ' + A.bots.length + ' · ' + A.difficulty; }
  if (a.type === 'change-map') { if (!perm.isHost) throw Error('Only the host changes the map'); const m = ARENA_MAPS[a.map]; if (!m) throw Error('That map is not available');
    const teams = game.combat?.d?.teams ? { ...game.combat.d.teams } : null; startArena(game, { map: a.map, kind: m.kind, bots: A.bots.length, difficulty: A.difficulty }, now);
    if (teams && game.combat.d) { for (const [k, t] of Object.entries(teams)) if (!/^bot /.test(k)) game.combat.d.teams[k] = t; }   // people keep their side
    return 'Map · ' + m.name + ' · ' + (m.kind === 'defuse' ? 'Defuse' : 'Deathmatch'); }
  if (a.type === 'drop') {
    if (isDown(game, name, now)) throw Error('You are dead');
    if (a.slot === 'bomb') { const k = key(name); if (game.combat.d?.bomb?.carrier !== k) throw Error('You don\u2019t have the bomb'); const p = poseOf(players, name) || { x: +a.x || 0, z: +a.z || 0, yaw: +a.yaw || 0 }; game.combat.d.bomb.carrier = null; dropItem(game, 'c4', p.x - Math.sin(p.yaw || 0) * 6, p.z - Math.cos(p.yaw || 0) * 6, a.y, name, now); return 'Dropped the bomb'; }
    const l = loadoutOf(game, name), slot = a.slot === 'secondary' ? 'secondary' : a.slot === 'nades' ? 'nades' : 'primary', item = slot === 'nades' ? (nadesOf(l).includes(a.kind) ? a.kind : null) : l[slot];
    if (!item) throw Error('Nothing to drop');
    // About 1 m ahead of you (the camera looks along (−sin yaw, −cos yaw)); at your feet if a wall is in the way.
    const p = poseOf(players, name) || { x: +a.x || 0, z: +a.z || 0, yaw: +a.yaw || 0 }, g = G(game); let x = p.x - Math.sin(p.yaw || 0) * 6, z = p.z - Math.cos(p.yaw || 0) * 6;
    if (!walkable(g.boxes, g.bounds, x, z, .5)) { x = p.x; z = p.z; }
    if (slot === 'nades') { l.nades.splice(l.nades.indexOf(item), 1); dropItem(game, item, x, z, a.y, name, now); } else { l[slot] = null; dropFrom(game, name, item, x, z, a.y, now); } return 'Dropped ' + itemName(item);
  }
  if (a.type === 'pickup') {
    if (isDown(game, name, now)) throw Error('You are dead');
    const C = game.combat, i = (C.ground || []).findIndex(it => it.id === a.id), it = C.ground?.[i]; if (!it) throw Error('Already taken');
    const p = poseOf(players, name), ok = reachable(game, p, it); if (ok !== true) throw Error(ok);
    const slot = slotOf(it.item); if (!slot) throw Error('Cannot pick that up');
    if (slot === 'bomb') { if (teamOf(game, name) !== 't') throw Error('Only Terrorists carry the bomb'); C.ground.splice(i, 1); game.combat.d.bomb.carrier = key(name); return 'You have the bomb'; }
    const l = loadoutOf(game, name);
    if (slot === 'nades') { if (!canCarry(l.nades ??= [], it.item)) throw Error('No room for more grenades'); C.ground.splice(i, 1); l.nades.push(it.item); return 'Picked up ' + itemName(it.item); }
    const old = l[slot]; if (old && !a.swap) throw Error('Slot taken · E to swap');
    // Claimed: off the ground first (a second claim finds it gone), then the old gun drops where you stand.
    C.ground.splice(i, 1); if (old) dropFrom(game, name, old, p ? p.x : it.x, p ? p.z : it.z, p ? Math.max(0, (p.y ?? EYE) - EYE) : it.y, now);
    l[slot] = it.item; setAmmo(game, name, it.item, it.ammo || fullAmmo(it.item));
    const am = it.ammo || fullAmmo(it.item); return 'Picked up ' + itemName(it.item) + (am ? ' · ' + am[0] + ' / ' + am[1] : '');
  }
  // Plant / defuse: where the client says it stands (the host's copy of its position is a few frames old and a
  // CS2 stop still slides), as long as that agrees with the host's copy within a few units.
  if (isDefuse(game) && ['buy-kit', 'plant', 'defuse'].includes(a.type)) { const hp = poseOf(players, name), cp = Number.isFinite(+a.x) && Number.isFinite(+a.z) ? { x: +a.x, y: Number.isFinite(+a.y) ? +a.y : hp?.y, z: +a.z } : null;
    return defuseApply(game, a, name, cp && (!hp || Math.hypot(cp.x - hp.x, cp.z - hp.z) < 8) ? cp : hp || cp, now); }
  if (['loadout', 'buy-nade', 'buy-armor'].includes(a.type) && isDown(game, name, now)) throw Error('You are dead');
  if (a.type === 'loadout' || a.type === 'buy') {
    // Buying a gun: one primary and one pistol at most; the one you had drops at your feet with its rounds.
    const primary = a.primary === null ? null : PRIMARIES.includes(a.primary) ? a.primary : undefined, secondary = SECONDARIES.includes(a.secondary) ? a.secondary : undefined;
    if (primary === undefined && secondary === undefined) throw Error('Choose a weapon');
    const team = teamOf(game, name), buys = [['primary', primary], ['secondary', secondary]].filter(([, it]) => it !== undefined), l = loadoutOf(game, name), dropped = [];
    if (isDefuse(game)) { const e = buyError(game, name, poseOf(players, name), now); if (e) throw Error(e); let cost = 0;
      for (const [, it] of buys) { const w = it && weaponById(it); if (w?.team && team && w.team !== team) throw Error(w.name + ' is a ' + (w.team === 't' ? 'Terrorist' : 'Counter-Terrorist') + ' weapon'); cost += it ? PRICE[it] : 0; }
      if ((game.combat.d.money[key(name)] ?? DEFUSE.start) < cost) throw Error('Not enough money ($' + cost + ')'); for (const [, it] of buys) if (it) pay(game, name, it); }   // all or nothing: never charged without the gun
    const p = poseOf(players, name) || (a.x !== undefined ? { x: +a.x, z: +a.z, y: +a.y } : null);
    for (const [slot, item] of buys) { const old = l[slot];
      if (old && item) { if (p) dropFrom(game, name, old, p.x, p.z, Math.max(0, (p.y ?? EYE) - EYE), now); else if (game.combat.ammo?.[key(name)]) delete game.combat.ammo[key(name)][old]; dropped.push(weaponById(old).name); }
      l[slot] = item; if (item) setAmmo(game, name, item, fullAmmo(item)); }
    return (isDefuse(game) ? 'Bought ' : 'Loadout · ') + [l.primary && weaponById(l.primary).name, l.secondary && weaponById(l.secondary).name].filter(Boolean).join(' + ') + (dropped.length ? ' · dropped your ' + dropped.join(' and ') : '');
  }
  if (a.type === 'buy-armor') {
    const kind = a.kind === 'helmet' ? 'helmet' : 'kevlar', C = game.combat, k = key(name), arm = (C.armor ??= {})[k] ??= { kevlar: 0, helmet: false };
    if (kind === 'kevlar' && arm.kevlar >= 100) throw Error('Your vest is full');
    if (kind === 'helmet' && arm.kevlar >= 100 && arm.helmet) throw Error('You have full armor');
    const cost = kind === 'helmet' && arm.kevlar >= 100 ? ARMOR.helmet.upgrade : ARMOR[kind].price;
    if (isDefuse(game)) { const e = buyError(game, name, poseOf(players, name), now); if (e) throw Error(e); charge(game, name, cost); }
    arm.kevlar = 100; if (kind === 'helmet') arm.helmet = true; return 'Bought ' + ARMOR[kind].name;
  }
  if (isDefuse(game) && a.type === 'buy-nade') { const e = buyError(game, name, poseOf(players, name), now); if (e) throw Error(e); if (!NADES[a.kind]) throw Error('Unknown grenade'); const list = loadoutOf(game, name).nades ??= []; if (!canCarry(list, a.kind)) throw Error(list.length >= 4 ? 'You carry four grenades already' : a.kind === 'flash' ? 'Two flashbangs at most' : 'You already have a ' + NADES[a.kind].name); pay(game, name, a.kind); }
  if (a.type === 'buy-nade') { const kind = a.kind; if (!NADES[kind]) throw Error('Unknown grenade'); const l = loadoutOf(game, name), list = l.nades ??= [];
    if (!canCarry(list, kind)) throw Error(list.length >= 4 ? 'You carry four grenades already' : kind === 'flash' ? 'Two flashbangs at most' : 'You already have a ' + NADES[kind].name);
    list.push(kind); return 'Bought ' + NADES[kind].name; }
  if (a.type === 'throw') { if (isDown(game, name, now)) throw Error('You are dead'); return throwNade(game, name, a.kind, a, now); }
  if (a.type === 'add-bot') { const n = Math.max(1, Math.min(MAX_BOTS, Math.floor(+a.count || 1))); let added = 0; for (let i = 0; i < n && A.bots.length < MAX_BOTS; i++, added++) addBot(game, now, players); return added ? 'Added ' + added + ' bot' + (added > 1 ? 's' : '') : 'The arena is full of bots'; }
  if (a.type === 'remove-bot') { const b = removeBot(game); if (!b) throw Error('No bots to remove'); return 'Removed ' + b.name; }
  if (a.type === 'restart') { if (a.map && !ARENA_MAPS[a.map]) throw Error('That map is not available'); const map = a.map && ARENA_MAPS[a.map]?.kind === A.kind ? a.map : A.map; startArena(game, { map, kind: A.kind, bots: A.bots.length, difficulty: A.difficulty }, now); return 'New match · ' + ARENA_MAPS[game.arena.map].name; }
  throw Error('Unknown arena action');
}

function removeBot(game) { const A = game.arena, b = A.bots.pop(); if (!b) return null; const k = key(b.name), C = game.combat; for (const f of ['hp', 'down', 'kills', 'deaths', 'assists']) if (C[f]) delete C[f][k]; if (C.d) { delete C.d.teams[k]; delete C.d.money[k]; if (C.d.bomb?.carrier === k) C.d.bomb.carrier = null; } return b; }
// Players present in the arena (from the room roster): not bots.
const humans = players => players.filter(p => !p.bot && p.pose);
// Why the lobby can't start yet (null = it can): two participants; in Defuse someone on each side (bots count).
function lobbyShort(game, players) {
  const n = humans(players).length + game.arena.bots.length; if (n < 2) return 'Need at least 2 players · add bots or wait for friends';
  const d = game.combat.d; if (d) { const c = { t: 0, ct: 0 }; for (const p of humans(players)) { const t = d.teams[key(p.name)]; if (c[t] !== undefined) c[t]++; } for (const b of game.arena.bots) { const t = d.teams[key(b.name)]; if (c[t] !== undefined) c[t]++; } if (!c.t || !c.ct) return 'Need someone on both teams'; }
  return null;
}
// The lobby ends: a clean match for everyone in it (fresh money, loadouts, scores; sides kept).
function beginMatch(game, players, now) {
  const A = game.arena, teams = game.combat.d ? { ...game.combat.d.teams } : null, lobby = A.lobby; lobby.started = true; lobby.startedAt = now; A.loadout = {}; A.startedAt = now; A.endsAt = now + DM_MS;
  const C = game.combat; Object.assign(C, { hp: {}, down: {}, kills: {}, deaths: {}, assists: {}, last: {}, respawns: {}, feed: [], spawnTo: {}, ground: [], nades: [], ammo: {}, armor: {}, dmg: {} });
  if (A.kind === 'defuse') startDefuse(game, now, players, teams);
  for (const b of A.bots) { botArm(b, game.combat.d ? defaultPistol(game.combat.d.teams[key(b.name)]) : BOT_GUNS[(+b.id.slice(4) || 0) % BOT_GUNS.length]); if (!game.combat.d) place(game, b, players); }
  A.dirty = true;
}
// M: change team. In the lobby / warmup at once; during a match at the next round (the round in play stays fair).
// Balance: a side may not get two more players than the other, unless a bot gives way.
function changeTeam(game, name, team, players, now) {
  const d = game.combat.d, k = key(name); if (!d) throw Error('Deathmatch has no teams');
  if (!['t', 'ct', 'spec'].includes(team)) throw Error('Choose Terrorists, Counter-Terrorists or Spectator'); const cur = d.teams[k];
  if (cur === team && !d.pending?.[k]) return 'You are already ' + TEAM_NAME[team];
  if (team !== 'spec') { const c = { t: 0, ct: 0 }; for (const [kk, t] of Object.entries(d.teams)) if (kk !== k && c[t] !== undefined && (players.some(p => key(p.name) === kk) || game.arena.bots.some(b => key(b.name) === kk))) c[t]++;
    const other = team === 't' ? 'ct' : 't', botOnTeam = game.arena.bots.find(b => d.teams[key(b.name)] === team);
    if (c[team] + 1 - c[other] > 1) { if (!botOnTeam) throw Error(TEAM_NAME[team] + ' would have too many players'); (d.botMoves ??= []).push(key(botOnTeam.name)); } }
  const now_ = game.arena.lobby && !game.arena.lobby.started || d.round?.phase === 'warmup';
  if (now_) { applyTeam(game, k, team, players, now); return 'You are now ' + TEAM_NAME[team]; }
  (d.pending ??= {})[k] = team; return 'You join the ' + TEAM_NAME[team] + ' next round';
}
const TEAM_NAME = { t: 'Terrorists', ct: 'Counter-Terrorists', spec: 'Spectator' };
export function applyTeam(game, k, team, players, now) {
  const d = game.combat.d, C = game.combat; d.teams[k] = team; if (d.pending) delete d.pending[k]; delete game.arena.loadout[k]; delete (C.ammo ??= {})[k]; if (d.bomb?.carrier === k) d.bomb.carrier = null;
  for (const bk of d.botMoves || []) if (d.teams[bk]) d.teams[bk] = d.teams[bk] === 't' ? 'ct' : 't'; d.botMoves = [];
  if (team === 'spec') { C.down[k] = { until: 4e15, by: '', weapon: 'spectating' }; return; }
  delete C.down[k]; C.hp[k] = MAX_HP; const at = freeSpot(game, players, team, k); C.spawnTo[k] = { at: now, x: at.x, z: at.z };
}
// Host tick (~20×/s): bots think, move and shoot; respawned players get a spawn point; the match clock.
// Returns true when the streamed combat state changed.
export function arenaTick(game, players = [], dt = .05, now = Date.now()) {
  if (game.mode !== 'arena' || !game.arena) return false; const A = game.arena, C = game.combat, g = G(game); let changed = false;
  // Lobby: start at the timeout when there are enough players, else wait 30 s more and say why.
  if (A.lobby && !A.lobby.started) { A.endsAt = now + DM_MS; if (now >= A.lobby.until) { const e = lobbyShort(game, players); if (e) { A.lobby.until = now + LOBBY_MORE_MS; A.lobby.note = e; } else beginMatch(game, players, now); changed = true; } }
  // Spawn orders for players who just respawned (their client moves them there).
  for (const [k, at] of Object.entries(C.respawnedAt || {})) { if (C.spawnTo[k]?.at === at) continue; const p = players.find(x => key(x.name) === k); if (!p) continue; const s = bestSpot(game, occupied(game, players, p.name, now)); C.spawnTo[k] = { at, x: s.x, z: s.z }; changed = true; }
  // Deathmatch: a player seen for the first time gets a spot of their own too (not the client's guess).
  if (!C.d) for (const p of players) { const k = key(p.name); if (p.bot || C.spawnTo[k]) continue; const s = bestSpot(game, occupied(game, players, p.name, now)); C.spawnTo[k] = { at: now, x: s.x, z: s.z }; changed = true; }
  // Defuse: the dead drop their best gun (with its rounds) and the bomb where they fell; it leaves their hands, so
  // nothing is duplicated. Deathmatch: you respawn with your loadout, nothing drops.
  A.deathDrops ??= {};
  for (const [k, d] of Object.entries(C.down || {})) { const tag = (C.deaths?.[k] || 0) + ':' + d.until; if (A.deathDrops[k] === tag) continue; A.deathDrops[k] = tag;
    if (C.d?.bomb?.carrier === k) { const bt = A.bots.find(b => key(b.name) === k) || players.find(x => key(x.name) === k)?.pose; if (bt) dropItem(game, 'c4', bt.x, bt.z, 0, k, now); C.d.bomb.carrier = null; changed = true; }
    if (!C.d) continue;
    const bot = A.bots.find(b => key(b.name) === k), p = bot ? null : players.find(x => key(x.name) === k), at = bot || p?.pose; if (!at) continue;
    if (bot) { if (bot.weapon && slotOf(bot.weapon)) { dropItem(game, bot.weapon, bot.x, bot.z, 0, bot.name, now, [bot.ammo, bot.reserve ?? weaponById(bot.weapon).reserve]); bot.weapon = null; changed = true; } continue; }
    const l = A.loadout[k] || {}, slot = l.primary ? 'primary' : l.secondary ? 'secondary' : null; if (!slot) continue;
    dropFrom(game, p.name, l[slot], at.x, at.z, Math.max(0, (at.y || 0) - EYE), now); l[slot] = null; changed = true; }
  if (nadesTick(game, players, dt, now, g)) changed = true;
  if (C.ground?.length) { const n = C.ground.length; C.ground = C.ground.filter(it => it.item === 'c4' || now - it.at < GROUND_MS); if (C.ground.length !== n) changed = true; }
  for (const bot of A.bots) {
    if (isDown(game, bot.name, now)) { bot.dead = true; continue; }
    if (bot.dead && !C.d) { bot.dead = false; place(game, bot, players); botArm(bot, bot.weapon || 'pistol'); changed = true; }
    if (!bot.weapon) botArm(bot, defaultPistol(C.d?.teams?.[key(bot.name)]));
    if (C.d && (C.d.round?.phase === 'freeze' || C.d.round?.phase === 'over' || C.d.matchOver)) continue;   // defuse: frozen while buying, between rounds
    if (A.lobby && !A.lobby.started) continue;   // lobby: no fighting
    const team = C.d ? C.d.teams[key(bot.name)] : null;
    // Defuse: the bomb carrier on a site plants straight away (even under fire) and keeps at it.
    if (C.d && team === 't' && C.d.bomb.carrier === key(bot.name) && C.d.round.phase === 'live') { if (C.d.round.plant?.by === key(bot.name)) continue; if (!C.d.round.plant) { const site = siteAt(game, bot); if (site) { C.d.round.plant = { by: key(bot.name), start: now, x: bot.x, z: bot.z, y: 0, site }; changed = true; continue; } } }
    const wpn = weaponById(bot.weapon), foes = alive(game, players, bot.name).filter(f => !team || C.d.teams[key(f.name)] !== team), DF = DIFFICULTY[A.difficulty] || DIFFICULTY.normal;
    // Grenades: run from a live HE close by; never stand in fire.
    { const danger = (C.nades || []).find(n => (n.phase === 'air' && n.kind === 'he' && Math.hypot(n.x - bot.x, n.z - bot.z) < 40) || (n.phase === 'fire' && Math.hypot(n.x - bot.x, n.z - bot.z) < NADES.molotov.radius + 2 && inFire(fireCells(g.boxes, n.x, n.z, n.y), bot.x, bot.z)));
      if (danger && botStep(g, bot, Math.atan2(bot.x - danger.x, bot.z - danger.z), 34 * dt)) { changed = true; continue; } }
    // Nearest visible enemy within range.
    let tgt = null, td = Infinity; for (const f of foes) { const d = Math.hypot(f.x - bot.x, f.z - bot.z); if (d < Math.min(wpn.range, 300) && d < td && clearView(game, g.boxes, bot.x, bot.z, f.x, f.z)) { tgt = f; td = d; } }   // walls and smoke block
    if (tgt) {
      if (bot.target !== tgt.name) { bot.target = tgt.name; bot.seenAt = now; }
      const want = Math.atan2(-(tgt.x - bot.x), -(tgt.z - bot.z)), diff = Math.atan2(Math.sin(want - bot.yaw), Math.cos(want - bot.yaw)); bot.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
      // Strafe while fighting (side to side, changing direction every ~0.7 s), never into walls.
      { const side = Math.floor(now / 700 + bot.shotN * .37 + (+bot.id.slice(4) || 0)) % 2 ? 1 : -1, sx = Math.cos(bot.yaw) * side, sz = -Math.sin(bot.yaw) * side, st = 14 * dt, nx = bot.x + sx * st, nz = bot.z + sz * st; if (walkable(g.boxes, g.bounds, nx, nz)) { bot.x = nx; bot.z = nz; changed = true; } }
      const react = DF.react + (1 - bot.skill) * 300;
      // Cover: while reloading, or hurt, step behind the nearest wall or crate that hides you from the target.
      if ((now < bot.reloadUntil || hpOf(game, bot.name) < 40) && !bot.noCover) { if (!bot.cover || now > bot.cover.until) bot.cover = { at: findCover(g, bot, tgt), until: now + 1500 }; const cv = bot.cover.at; if (cv && Math.hypot(cv.x - bot.x, cv.z - bot.z) > 1.5 && botStep(g, bot, Math.atan2(cv.x - bot.x, cv.z - bot.z), 30 * dt)) changed = true; }
      if (now < bot.reloadUntil || now < (bot.blindUntil || 0)) continue;   // reloading, or blinded by a flashbang
      if (bot.ammo <= 0) { if (botReload(game, bot)) { bot.reloadUntil = now + wpn.reloadMs; bot.reloadN = (bot.reloadN || 0) + 1; } changed = true; continue; }
      if (Math.abs(diff) < .12 && now - bot.seenAt > react && now - bot.lastShot > wpn.rateMs * (wpn.auto ? 1.6 : 1.1)) {
        bot.lastShot = now; bot.ammo--; bot.shotN++; changed = true;
        // Difficulty: accuracy, head-shot share and reaction time (easy · normal · hard, host setting).
        const pHit = Math.max(.05, Math.min(.9, bot.skill * DF.aim * (1 - td / (wpn.range * 1.3)) * (wpn.kind === 'shotgun' && td > 40 ? .3 : 1)));
        if (Math.random() < pHit) { const r = Math.random(), zone = r < DF.head ? 'head' : r < .55 ? 'chest' : r < .8 ? 'stomach' : 'legs'; applyHit(game, bot.name, tgt.name, wpn, zone, td, wpn.pellets ? 1 + Math.floor(Math.random() * wpn.pellets * .6) : 1, now); }
      }
      continue;
    }
    bot.target = null;
    // Bots pick up better guns they walk over (a rifle or the AWP instead of an SMG, shotgun or LMG).
    if (C.ground?.length && !BOT_UPGRADE.includes(bot.weapon)) { const i = C.ground.findIndex(it => BOT_UPGRADE.includes(it.item) && Math.hypot(it.x - bot.x, it.z - bot.z) < 4);
      if (i >= 0) { const it = C.ground.splice(i, 1)[0]; if (bot.weapon) dropItem(game, bot.weapon, it.x, it.z, it.y, bot.name, now, [bot.ammo, bot.reserve]); botArm(bot, it.item, it.ammo); changed = true; } }
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
