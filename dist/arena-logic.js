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
import { ARENA_MAPS, mapBoxes, walkable, lineOfSight, segmentClear, spawnSlots, floorAt, applyMapState } from './arena-maps.js';
import { WEAPONS, weaponById, MAX_HP, EYE, isFirearm, fullAmmo, defaultPistol, ARMOR } from './weapons-data.js';
import { cleanSkin, skinTitle, skinKeyOf } from './skins.js';
import { applyHit, isDown, hpOf, ammoOf, setAmmo, refillAll, teamPistol, SPAWN_SAFE_MS } from './combat-logic.js';
import { NADES, NADE_IDS, canCarry, nadesOf, throwNade, nadesTick, clearView, fireCells, inFire, smokeBlocks, setSmokeSolids, tossFlight } from './arena-nades.js';
import { isDefuse, startDefuse, defuseTick, defuseApply, buyError, pay, charge, teamOf, siteAt, assignTeam, balanceBots, DEFUSE, PRICE, newRound, freeSpot, rulesOf, cleanRules, MATCH_PRESETS } from './arena-defuse.js';
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
export const TIMER_LIMITS = { warmup: [0, 600], freeze: [0, 60] };   // seconds (host settings)
const clampS = (v, [lo, hi], dflt) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
// Practice (spec §15): any map, deathmatch rules (free buying, respawns) with no time limit, and its settings: bots
// stand still / move without shooting / fight back, infinite ammo, and the assists the client draws (bullet impacts,
// your recoil pattern, grenade flight paths). Only a practice session carries arena.practice: no assist reaches a
// normal match.
export function cleanPractice(p = {}) { return { bots: ['stand', 'move', 'fight'].includes(p.bots) ? p.bots : 'stand', ammo: p.ammo !== false, impacts: p.impacts !== false, recoil: p.recoil !== false, paths: p.paths !== false }; }
export function startArena(game, { map = 'yard', kind = 'dm', bots = 0, lobbyMs = 0, difficulty = 'normal', freezeS = 15, warmupS = null, rules = null, practice = null } = {}, now = Date.now()) {
  if (!ARENA_MAPS[map] || ARENA_MAPS[map].stub) throw Error(ARENA_MAPS[map]?.stub ? ARENA_MAPS[map].name + ': the room has no map file for it' : 'Unknown arena map');   // (a file-only map's stand-in: arena-maps.js)
  if (practice) kind = 'dm';
  else if (ARENA_MAPS[map].kind !== kind) throw Error(ARENA_MAPS[map].name + ' is not a ' + (kind === 'defuse' ? 'Defuse' : 'Deathmatch') + ' map');
  game.mode = 'arena'; game.payday = false;
  const knives = game.arena?.knives || {}, skins = game.arena?.skins || {};   // (the knives and skins people chose stay theirs from match to match)
  game.arena = { kind, map, startedAt: now, endsAt: now + DM_MS, loadout: {}, bots: [], botSeq: 0, respawnMs: 2500, over: null, difficulty: DIFFICULTY[difficulty] ? difficulty : 'normal', lobby: lobbyMs > 0 ? { until: now + lobbyMs, started: false, ready: {}, note: '' } : null, freezeMs: clampS(freezeS, TIMER_LIMITS.freeze, 15) * 1000, warmupS: Math.round(lobbyMs / 1000), nextMap: null };
  game.arena.knives = knives; game.arena.skins = skins;
  game.arena.rules = cleanRules(rules || {});   // Defuse match rules (host settings), fixed for this match
  if (practice) { game.arena.practice = cleanPractice(practice); game.arena.endsAt = 4e15; }   // no time limit
  game.combat = { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [], spawnTo: {}, ground: [], groundSeq: 0, nades: [], nadeSeq: 0 };
  for (let i = 0; i < bots; i++) addBot(game, now);
  if (kind === 'defuse') startDefuse(game, now);
}
const geo = game => { const map = ARENA_MAPS[game.arena.map], [sw, sd] = map.size; return { map, boxes: mapBoxes(map, ARENA.cx, ARENA.cz), bounds: { minX: ARENA.cx - sw / 2, maxX: ARENA.cx + sw / 2, minZ: ARENA.cz - sd / 2, maxZ: ARENA.cz + sd / 2 } }; };
let cache = { map: null, g: null }; const G = game => cache.map === game.arena.map ? cache.g : (cache = { map: game.arena.map, g: geo(game) }).g;
setSmokeSolids(game => game?.arena?.map && ARENA_MAPS[game.arena.map] ? G(game).boxes : null);   // (smoke fills the map's space: arena-nades.js smokeVoxels)

// Bot movement and sight. Classic maps (map.nav): the bot walks the map's columns — up steps and stairs, down ledges,
// on its own level of stacked floors — and keeps its feet height (bot.y); it sees along a real 3D line. Other maps:
// the flat checks against the boxes.
const feetOf = (g, bot) => { if (!g.map.nav) return 0; if (!Number.isFinite(bot.y)) { const f = g.map.nav.floorAt(bot.x - ARENA.cx, bot.z - ARENA.cz); bot.y = Number.isFinite(f) ? f : 0; } return bot.y; };
// Bots open the doors on their way, as CS2's do (their walking map has no doors): a shut door their step reaches swings
// open away from them. TICK: the game and time of the tick running (arenaTick sets them).
const TICK = { game: null, now: 0 };
function openDoorOnPath(g, bot, nx, nz) { const movers = g.map.movers, game = TICK.game; if (!movers?.length || !game) return; const st = mapStateOf(game), y = feetOf(g, bot), x1 = nx - ARENA.cx, z1 = nz - ARENA.cz, r = 1.7;   /* (a body's radius and a little) */
  for (let id = 0; id < movers.length; id++) { const m = movers[id]; if (m.kind === 'break' || st.broken[id] || st.doors[id]?.open) continue; const b = m.box;
    if (y + 6 < b[4] || y > b[5] || x1 < b[0] - r || x1 > b[1] + r || z1 < b[2] - r || z1 > b[3] + r) continue;
    st.doors[id] = { open: 1, side: awaySide(m, bot.x - ARENA.cx, bot.z - ARENA.cz), at: TICK.now }; st.v++; syncMapState(game); } }
function tryMove(g, bot, nx, nz) { const nav = g.map.nav; if (!nav) { if (!walkable(g.boxes, g.bounds, nx, nz)) return false; bot.x = nx; bot.z = nz; return true; }
  openDoorOnPath(g, bot, nx, nz);
  const y = nav.step(bot.x - ARENA.cx, bot.z - ARENA.cz, feetOf(g, bot), nx - ARENA.cx, nz - ARENA.cz); if (!Number.isFinite(y)) return false; bot.x = nx; bot.z = nz; bot.y = y; return true; }
const standable = (g, x, z, nearY = Infinity) => g.map.nav ? Number.isFinite(g.map.nav.floorAt(x - ARENA.cx, z - ARENA.cz, nearY)) : walkable(g.boxes, g.bounds, x, z);
// Can a (eye at ay) see b (eye at by)? Walls, levels and smoke block.
const sees = (game, g, ax, ay, az, bx, by, bz) => g.map.nav ? g.map.nav.sight(ax - ARENA.cx, ay, az - ARENA.cz, bx - ARENA.cx, by, bz - ARENA.cz) && !smokeBlocks(game, ax, ay, az, bx, by, bz) : clearView(game, g.boxes, ax, az, bx, bz);
// One bot step towards heading h (steering round obstacles); true when it moved.
function botStep(g, bot, h, step) { for (const turn of [0, .5, -.5, 1, -1, 1.5, -1.5]) { const hh = h + turn, nx = bot.x + Math.sin(hh) * step, nz = bot.z + Math.cos(hh) * step; if (tryMove(g, bot, nx, nz)) return true; } return false; }
// The nearest walkable spot (within 20 units, reachable in a straight line) that a wall or crate hides from `from`.
function findCover(g, bot, from) {
  let best = null, bd = Infinity;
  const fy = feetOf(g, bot);
  for (let a = 0; a < 12; a++) for (const r of [5, 10, 15, 20]) { const h = a / 12 * Math.PI * 2, x = bot.x + Math.sin(h) * r, z = bot.z + Math.cos(h) * r; if (r >= bd || !standable(g, x, z, fy + 2.8)) continue;
    if (g.map.nav ? g.map.nav.sight(from.x - ARENA.cx, (from.y ?? EYE), from.z - ARENA.cz, x - ARENA.cx, fy + EYE, z - ARENA.cz) : lineOfSight(g.boxes, from.x, from.z, x, z, 9)) continue; let clear = true; for (let t = .25; t < 1; t += .25) if (!standable(g, bot.x + (x - bot.x) * t, bot.z + (z - bot.z) * t, fy + 2.8)) { clear = false; break; } if (clear) { best = { x, z }; bd = r; } }
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
  for (const b of game.arena?.bots || []) if (key(b.name) !== key(but) && !isDown(game, b.name)) out.push({ name: b.name, x: b.x, z: b.z, y: EYE + botFloor(game, b) }); return out;
}

// Put an item on the ground at (x, z), resting at height y.
// A gun keeps its rounds on the ground ([magazine, reserve]); `by` and their team are shown to whoever finds it.
// fly (optional): tossed from { x, y, z } with { vx, vy, vz } — where it comes to rest is where it lies (tossFlight);
// the item keeps the toss so every player sees it fly there.
function dropItem(game, item, x, z, y, by, now, ammo = null, fly = null) {
  const C = game.combat; C.ground ??= []; C.groundSeq = (C.groundSeq || 0) + 1;
  if (fly) { const g = G(game), end = tossFlight(g.boxes, g.bounds, fly); x = end.x; z = end.z; y = end.y; fly = { ...Object.fromEntries(Object.entries(fly).map(([k, v]) => [k, +(+v).toFixed(3)])), ms: end.ms }; }
  C.ground.push({ id: 'g' + C.groundSeq, item, x, z, y: Math.max(0, Math.min(250, +y || 0)), yaw: Math.random() * Math.PI * 2, at: now, by, team: C.d?.teams?.[key(by)] || null, ammo: isFirearm(weaponById(item)) ? (ammo || fullAmmo(item)) : null, ...(fly ? { fly } : {}) });
  while (C.ground.length > GROUND_MAX) { const i = C.ground.findIndex(it => it.item !== 'c4'); C.ground.splice(i < 0 ? 0 : i, 1); }
  return 'g' + C.groundSeq;
}
// The floor a bot stands on (raised floors and stairs of grid maps).
const botFloor = (game, b) => Number.isFinite(b.y) ? b.y : floorAt(ARENA_MAPS[game.arena?.map], ARENA.cx, ARENA.cz, b.x, b.z);
// Rules changed before the match: the warmup round has no clock, so nothing to retime (kept for clarity).
// This round's purchases per player (for refunds), newest last.
function bought(game, name, b) { const d = game.combat.d; ((d.bought ??= {})[key(name)] ??= []).push(b); }
// Take a gun out of a player's hands onto the ground (with its rounds); forgets their ammo for it.
function dropFrom(game, name, item, x, z, y, now, fly = null) { const k = key(name), a = ammoOf(game, name, item); if (game.combat.ammo?.[k]) delete game.combat.ammo[k][item]; return dropItem(game, item, x, z, y, name, now, a, fly); }
// A toss (CS2's drop): from the hands, forward where you face at 200 u/s and up at 100, plus your own run.
const tossOf = (p, run = true) => { const yaw = +p.yaw || 0, f = 200 * HU_, vx = run ? Math.max(-40, Math.min(40, +p.vx || 0)) : 0, vz = run ? Math.max(-40, Math.min(40, +p.vz || 0)) : 0; return { x: p.x - Math.sin(yaw) * 1.2, y: Math.max(1.5, (p.y ?? EYE) - 3), z: p.z - Math.cos(yaw) * 1.2, vx: -Math.sin(yaw) * f + vx, vy: 100 * HU_, vz: -Math.cos(yaw) * f + vz }; };
const HU_ = 2.54 / 16.5;
// Can a player at pose reach an item on the ground (close enough, no wall between)?
function reachable(game, p, it) { if (!p) return true; const g = G(game), d = Math.hypot(p.x - it.x, p.z - it.z); if (d > PICK_R + 4) return 'Too far away'; const eye = p.y ?? EYE; return segmentClear(g.boxes, p.x, eye, p.z, it.x, (it.y || 0) + .6, it.z) || segmentClear(g.boxes, p.x, eye - 6, p.z, it.x, (it.y || 0) + .6, it.z) ? true : 'Behind a wall'; }
const poseOf = (players, name) => players.find(p => key(p.name) === key(name))?.pose || null;
// A player's loadout (created with the team's starting pistol).
export const loadoutOf = (game, name) => game.arena.loadout[key(name)] ??= { primary: null, secondary: teamPistol(game, name), nades: [] };
export const ROUND_BOUND = new Set(['buy', 'loadout', 'buy-armor', 'buy-nade', 'buy-kit', 'refund', 'plant', 'defuse']);
export function arenaApply(game, a, name, players = [], now = Date.now(), perm = { isHost: true }) {
  if (game.mode !== 'arena' || !game.arena) throw Error('Start the arena first');
  const A = game.arena;
  // A request made in a round that has ended (it crossed the round change on the network) does nothing.
  if (a.round !== undefined && ROUND_BOUND.has(a.type) && game.combat?.d?.round?.id && a.round !== game.combat.d.round.id) throw Error('That round has ended');
  // ── Match: lobby, teams, host settings, map ──
  if (a.type === 'practice') { if (!A.practice) throw Error('Only in practice'); A.practice = cleanPractice({ ...A.practice, ...(a.settings || {}) }); return 'Practice: ' + ({ stand: 'bots stand still', move: 'bots move', fight: 'bots fight back' })[A.practice.bots]; }   // its settings, changed during the session
  if (a.type === 'ready') { if (!A.lobby || A.lobby.started) throw Error('The match is running'); A.lobby.ready[key(name)] = a.ready !== false; return a.ready === false ? 'Not ready' : 'Ready'; }
  if (a.type === 'start-match') { if (!perm.isHost) throw Error('Only the host starts the match'); if (!A.lobby || A.lobby.started) throw Error('The match is already running'); const e = lobbyShort(game, players); if (e) throw Error(e); beginMatch(game, players, now); return 'Match started'; }
  // Your knife (the M menu): a CS2 knife on the knife slot — Butterfly, Stiletto, M9 Bayonet (the same blade for the
  // rules), Darja's karambit (hers alone), or the default. Any time; it's yours from match to match.
  // Darja may equip any knife on anyone in the room (a.for: their name), the karambit too.
  // A weapon's skin (skins.js: finish, wear, pattern seed, stickers, name tag, StatTrak™): checked here (never trusted),
  // then everyone's view draws it. { weapon, skin } sets one, { weapon, clear: true } goes back to the default.
  // Darja may give a skin to anyone in the room (a.for: their name), as she equips knives; a StatTrak™ count stays
  // theirs (earned, never given).
  if (a.type === 'skin') { const w = weaponById(String(a.weapon || '')), sk = w && skinKeyOf(w.id); if (!sk) throw Error('Skins go on knives');   // (one knife skin, on whichever knife you carry)
    const darja = /^darja$/.test(key(name)); if (a.for != null && !darja) throw Error('Only Darja gives skins to others');
    const who = a.for != null ? String(a.for).trim().slice(0, 40) : name; if (key(who) !== key(name) && (!who || /^bot /i.test(who) || (players.length && !players.some(p => !p.bot && key(p.name) === key(who))))) throw Error('No such player in the room');
    const mine = (A.skins ??= {})[key(who)] ??= {}, on = key(who) !== key(name) ? ' on ' + who : ''; if (a.clear) { delete mine[sk]; return 'Default knife' + on; }
    const s = cleanSkin(a.skin, 'knife', mine[sk]); mine[sk] = s; return skinTitle('Knife', s) + (on ? ' given to ' + who : ' equipped'); }
  if (a.type === 'knife') { const k = String(a.knife || ''), darja = /^darja$/.test(key(name)), who = a.for != null ? String(a.for).trim().slice(0, 40) : name; if (!['default', 'butterfly', 'stiletto', 'm9', 'karambit'].includes(k)) throw Error('Unknown knife');
    if (key(who) !== key(name) && !darja) throw Error('Only Darja gives knives to others');   // (everyone picks their own knife — any of them — and the skin on it)
    if (key(who) !== key(name) && (!who || /^bot /i.test(who) || (players.length && !players.some(p => !p.bot && key(p.name) === key(who))))) throw Error('No such player in the room');
    const kn = (A.knives ??= {}); kn[key(who)] = k; return { butterfly: 'Butterfly Knife', stiletto: 'Stiletto Knife', m9: 'M9 Bayonet', karambit: 'Karambit | Ruby', default: 'Default knife' }[k] + ' equipped' + (key(who) !== key(name) ? ' on ' + who : ''); }
  if (a.type === 'team') return changeTeam(game, name, a.team, players, now);
  // Host administration (the room checks the host): pause, restart the round, move someone to spectator, the next
  // match's map. Disruptive ones are confirmed in the host's menu first.
  if (['pause', 'restart-round', 'move-spec', 'next-map'].includes(a.type)) { if (!perm.isHost) throw Error('Only the host can do that'); const d = game.combat?.d;
    if (a.type === 'next-map') { if (a.map && (!ARENA_MAPS[a.map] || ARENA_MAPS[a.map].stub)) throw Error('That map is not available'); A.nextMap = a.map || null; return A.nextMap ? 'Next match: ' + ARENA_MAPS[A.nextMap].name : 'Next match: same map'; }
    if (!d) throw Error('Defuse matches only');
    if (a.type === 'pause') { const on = !!a.on; if (on === !!d.paused) return on ? 'Already paused' : 'Not paused'; if (on) { d.paused = { at: now }; return 'Match paused'; }
      const dt = now - d.paused.at, r = d.round; d.paused = null; if (r) { for (const f of ['freezeUntil', 'buyUntil', 'endsAt', 'overAt']) if (Number.isFinite(r[f]) && r[f] < 4e15) r[f] += dt; if (r.planted) r.planted.explodeAt += dt; if (r.plant) r.plant.start += dt; if (r.defuse) r.defuse.start += dt; }
      if (A.lobby && !A.lobby.started) A.lobby.until += dt; return 'Match resumed'; }
    if (a.type === 'restart-round') { if (d.matchOver) throw Error('The match is over'); A.restarting = true; newRound(game, players, now); return 'Round restarted'; }
    if (a.type === 'move-spec') { const k = key(a.name); if (!d.teams[k]) throw Error('No such player'); applyTeam(game, k, 'spec', players, now); return a.name + ' is now a spectator'; } }
  if (a.type === 'settings') { if (!perm.isHost) throw Error('Only the host changes match settings');
    // Match rules: a preset and / or single fields. Before the match starts (lobby / warmup) they apply now; during a
    // match, from the next match (a running match never changes its rules mid-way).
    if (a.preset !== undefined || a.rules !== undefined) { if (a.preset !== undefined && !MATCH_PRESETS[a.preset]) throw Error('Unknown preset');
      const next = cleanRules({ ...(A.rulesNext || A.rules || {}), ...(MATCH_PRESETS[a.preset] || {}), ...(a.rules || {}) }), live = !!game.combat?.d && !(A.lobby && !A.lobby.started);
      if (live) A.rulesNext = next; else { A.rules = next; delete A.rulesNext; if (game.combat?.d) game.combat.d.rules = { ...next }; }
      return 'Rules: first to ' + next.win + ' · ' + next.roundS + ' s rounds · $' + next.start + ' start · friendly fire ' + (next.ff ? 'on' : 'off') + ' · ' + { sudden: 'sudden death', draw: 'draws allowed', mr3: 'MR3 overtime' }[next.ot] + (live ? ' · from the next match' : ''); }
    if (a.freeze !== undefined) { const v = clampS(a.freeze, TIMER_LIMITS.freeze, 15) * 1000, live = !!game.combat?.d && !(A.lobby && !A.lobby.started); if (live) A.freezeNext = v; else A.freezeMs = v; }
    if (a.warmup !== undefined && A.lobby && !A.lobby.started) { A.warmupS = clampS(a.warmup, TIMER_LIMITS.warmup, 120); A.lobby.until = A.startedAt + A.warmupS * 1000; }
    if (a.difficulty !== undefined) { if (!DIFFICULTY[a.difficulty]) throw Error('Unknown difficulty'); A.difficulty = a.difficulty; }
    if (a.bots !== undefined) { const want = Math.max(0, Math.min(MAX_BOTS, Math.floor(+a.bots) || 0)); while (A.bots.length < want) addBot(game, now, players); while (A.bots.length > want) removeBot(game); }
    return 'Bots: ' + A.bots.length + ' · ' + A.difficulty + (a.freeze !== undefined ? ' · freeze ' + Math.round((A.freezeNext ?? A.freezeMs) / 1000) + ' s' + (A.freezeNext !== undefined ? ' from the next round' : '') : '') + (a.warmup !== undefined && A.lobby && !A.lobby.started ? ' · warmup ' + A.warmupS + ' s' : ''); }
  if (a.type === 'change-map') { if (!perm.isHost) throw Error('Only the host changes the map'); const m = ARENA_MAPS[a.map]; if (!m) throw Error('That map is not available');
    const teams = game.combat?.d?.teams ? { ...game.combat.d.teams } : null; startArena(game, { map: a.map, kind: m.kind, bots: A.bots.length, difficulty: A.difficulty }, now);
    if (teams && game.combat.d) { for (const [k, t] of Object.entries(teams)) if (!/^bot /.test(k)) game.combat.d.teams[k] = t;   // people keep their side;
      balanceBots(game, players); game.arena.restarting = true; newRound(game, players, now); }   // (game.arena: the new map's)   // the new bots even the sides, and round 1 starts over with everyone on their own side's spots
    return 'Map · ' + m.name + ' · ' + (m.kind === 'defuse' ? 'Defuse' : 'Deathmatch'); }
  if (a.type === 'drop') {
    if (isDown(game, name, now)) throw Error('You are dead');
    if (a.slot === 'bomb') { const k = key(name); if (game.combat.d?.bomb?.carrier !== k) throw Error('You don\u2019t have the bomb'); const p = poseOf(players, name) || { x: +a.x || 0, z: +a.z || 0, yaw: +a.yaw || 0 }; game.combat.d.bomb.carrier = null; dropItem(game, 'c4', p.x - Math.sin(p.yaw || 0) * 6, p.z - Math.cos(p.yaw || 0) * 6, a.y, name, now); return 'Dropped the bomb'; }
    const l = loadoutOf(game, name), slot = a.slot === 'secondary' ? 'secondary' : a.slot === 'nades' ? 'nades' : 'primary', item = slot === 'nades' ? (nadesOf(l).includes(a.kind) ? a.kind : null) : l[slot];
    if (!item) throw Error('Nothing to drop');
    // About 1 m ahead of you (the camera looks along (−sin yaw, −cos yaw)); at your feet if a wall is in the way.
    const p = poseOf(players, name) || { x: +a.x || 0, z: +a.z || 0, yaw: +a.yaw || 0 }, g = G(game); let x = p.x - Math.sin(p.yaw || 0) * 6, z = p.z - Math.cos(p.yaw || 0) * 6;
    if (!walkable(g.boxes, g.bounds, x, z, .5)) { x = p.x; z = p.z; }
    const fly = poseOf(players, name) ? tossOf(p) : null;   // (thrown forward with your run, as CS2's G — bounces, slides, lands where it stops)
    if (slot === 'nades') { l.nades.splice(l.nades.indexOf(item), 1); dropItem(game, item, x, z, a.y, name, now, null, fly); } else { l[slot] = null; dropFrom(game, name, item, x, z, a.y, now, fly); } return 'Dropped ' + itemName(item);
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
  // Undo a purchase (CS2): during buy time, in your spawn, an item bought this round and not used yet goes back for
  // its full price; a gun brings back the one it replaced if that is still lying where it was dropped.
  if (a.type === 'refund') { if (!isDefuse(game)) throw Error('Nothing to refund in deathmatch'); const e = buyError(game, name, poseOf(players, name), now); if (e) throw Error(e);
    const k = key(name), log = game.combat.d.bought?.[k] || [], i = a.item ? log.findLastIndex(b => b.item === a.item) : log.length - 1, b = log[i]; if (!b) throw Error('Nothing to refund');
    const l = loadoutOf(game, name), C = game.combat, d = C.d;
    if (b.kind === 'gun') { if (l[b.slot] !== b.item) throw Error('You no longer have it'); const am = ammoOf(game, name, b.item), full = fullAmmo(b.item); if (am && full && (am[0] !== full[0] || am[1] !== full[1])) throw Error('Already used');
      if (game.combat.ammo?.[k]) delete game.combat.ammo[k][b.item]; l[b.slot] = null;
      if (b.prev) { const gi = (C.ground || []).findIndex(it => it.id === b.prev.ground); if (gi >= 0 || !b.prev.ground) { const it = gi >= 0 ? C.ground.splice(gi, 1)[0] : null; l[b.slot] = b.prev.item; setAmmo(game, name, b.prev.item, it?.ammo || b.prev.ammo); } } }
    else if (b.kind === 'nade') { const list = l.nades || [], j = list.lastIndexOf(b.item); if (j < 0) throw Error('Already thrown'); list.splice(j, 1); }
    else if (b.kind === 'armor') { const arm = C.armor?.[k]; if (!arm || arm.kevlar < 100) throw Error('Already damaged'); arm.kevlar = b.prev.kevlar; arm.helmet = b.prev.helmet; }
    else if (b.kind === 'kit') { if (!d.kits[k]) throw Error('You no longer have it'); delete d.kits[k]; }
    log.splice(i, 1); charge(game, name, -b.price); return 'Refunded ' + (b.kind === 'armor' ? (b.item === 'helmet' ? 'Kevlar + Helmet' : 'Kevlar Vest') : b.kind === 'kit' ? 'Defuse kit' : itemName(b.item)) + ' · +$' + b.price; }
  if (a.type === 'loadout' || a.type === 'buy') {
    // Buying a gun: one primary and one pistol at most; the one you had drops at your feet with its rounds.
    const primary = a.primary === null ? null : PRIMARIES.includes(a.primary) ? a.primary : undefined, secondary = SECONDARIES.includes(a.secondary) ? a.secondary : undefined;
    if (primary === undefined && secondary === undefined) throw Error('Choose a weapon');
    const team = teamOf(game, name), buys = [['primary', primary], ['secondary', secondary]].filter(([, it]) => it !== undefined), l = loadoutOf(game, name), dropped = [];
    if (isDefuse(game)) { const e = buyError(game, name, poseOf(players, name), now); if (e) throw Error(e); let cost = 0;
      for (const [, it] of buys) { const w = it && weaponById(it); if (w?.team && team && w.team !== team) throw Error(w.name + ' is a ' + (w.team === 't' ? 'Terrorist' : 'Counter-Terrorist') + ' weapon'); cost += it ? PRICE[it] : 0; }
      if ((game.combat.d.money[key(name)] ?? rulesOf(game).start) < cost) throw Error('Not enough money ($' + cost + ')'); for (const [, it] of buys) if (it) pay(game, name, it); }   // all or nothing: never charged without the gun
    const p = poseOf(players, name) || (a.x !== undefined ? { x: +a.x, z: +a.z, y: +a.y } : null);
    for (const [slot, item] of buys) { const old = l[slot], had = old && ammoOf(game, name, old); let ground = null;
      if (old && item) { if (p) ground = dropFrom(game, name, old, p.x, p.z, Math.max(0, (p.y ?? EYE) - EYE), now); else if (game.combat.ammo?.[key(name)]) delete game.combat.ammo[key(name)][old]; dropped.push(weaponById(old).name); }
      l[slot] = item; if (item) setAmmo(game, name, item, fullAmmo(item));
      if (isDefuse(game) && item) bought(game, name, { kind: 'gun', item, slot, price: PRICE[item] ?? 0, prev: old ? { item: old, ammo: had, ground } : null }); }
    return (isDefuse(game) ? 'Bought ' : 'Loadout · ') + [l.primary && weaponById(l.primary).name, l.secondary && weaponById(l.secondary).name].filter(Boolean).join(' + ') + (dropped.length ? ' · dropped your ' + dropped.join(' and ') : '');
  }
  if (a.type === 'buy-armor') {
    const kind = a.kind === 'helmet' ? 'helmet' : 'kevlar', C = game.combat, k = key(name), arm = (C.armor ??= {})[k] ??= { kevlar: 0, helmet: false };
    if (kind === 'kevlar' && arm.kevlar >= 100) throw Error('Your vest is full');
    if (kind === 'helmet' && arm.kevlar >= 100 && arm.helmet) throw Error('You have full armor');
    const cost = kind === 'helmet' && arm.kevlar >= 100 ? ARMOR.helmet.upgrade : ARMOR[kind].price;
    if (isDefuse(game)) { const e = buyError(game, name, poseOf(players, name), now); if (e) throw Error(e); charge(game, name, cost); bought(game, name, { kind: 'armor', item: kind, price: cost, prev: { kevlar: arm.kevlar, helmet: arm.helmet } }); }
    arm.kevlar = 100; if (kind === 'helmet') arm.helmet = true; return 'Bought ' + ARMOR[kind].name;
  }
  if (isDefuse(game) && a.type === 'buy-nade') { const e = buyError(game, name, poseOf(players, name), now); if (e) throw Error(e); if (!NADES[a.kind]) throw Error('Unknown grenade'); const list = loadoutOf(game, name).nades ??= []; if (!canCarry(list, a.kind)) throw Error(list.length >= 4 ? 'You carry four grenades already' : a.kind === 'flash' ? 'Two flashbangs at most' : 'You already have a ' + NADES[a.kind].name); pay(game, name, a.kind); bought(game, name, { kind: 'nade', item: a.kind, price: PRICE[a.kind] ?? 0 }); }
  if (a.type === 'buy-nade') { const kind = a.kind; if (!NADES[kind]) throw Error('Unknown grenade'); const l = loadoutOf(game, name), list = l.nades ??= [];
    if (!canCarry(list, kind)) throw Error(list.length >= 4 ? 'You carry four grenades already' : kind === 'flash' ? 'Two flashbangs at most' : 'You already have a ' + NADES[kind].name);
    list.push(kind); return 'Bought ' + NADES[kind].name; }
  if (a.type === 'throw') { if (isDown(game, name, now)) throw Error('You are dead'); return throwNade(game, name, a.kind, a, now); }
  if (a.type === 'add-bot') { const n = Math.max(1, Math.min(MAX_BOTS, Math.floor(+a.count || 1))); let added = 0; for (let i = 0; i < n && A.bots.length < MAX_BOTS; i++, added++) addBot(game, now, players); return added ? 'Added ' + added + ' bot' + (added > 1 ? 's' : '') : 'The arena is full of bots'; }
  if (a.type === 'remove-bot') { const b = removeBot(game); if (!b) throw Error('No bots to remove'); return 'Removed ' + b.name; }
  if (a.type === 'restart') { if (a.map && (!ARENA_MAPS[a.map] || ARENA_MAPS[a.map].stub)) throw Error('That map is not available'); const map = a.map && ARENA_MAPS[a.map]?.kind === A.kind ? a.map : A.map; startArena(game, { map, kind: A.kind, bots: A.bots.length, difficulty: A.difficulty, rules: A.rulesNext || A.rules }, now); return 'New match · ' + ARENA_MAPS[game.arena.map].name; }
  // E at a door: opens it away from you, or shuts it. A shot into a breakable: its damage, broken at its health (glass:
  // a hit) — the client sends what its bullet crossed (weapons.js).
  if (a.type === 'use' || a.type === 'break') { const m = ARENA_MAPS[A.map]?.movers?.[+a.id], id = +a.id, p = poseOf(players, name); if (!m) throw Error('Nothing to use there');
    const st = mapStateOf(game);
    if (a.type === 'use') { if (m.kind === 'break') throw Error('Nothing to use there'); if (isDown(game, name, now)) throw Error('You are dead'); if (st.broken[id]) throw Error('The door is broken');
      if (p && boxDist(m.box, p.x - ARENA.cx, p.z - ARENA.cz) > 7) throw Error('Too far from the door'); const d = st.doors[id];
      if (d && now - (d.at || 0) < 300) return d.open ? 'Door open' : 'Door shut';   // (a double press)
      st.doors[id] = d?.open ? { open: 0, side: d.side, at: now } : { open: 1, side: p ? awaySide(m, p.x - ARENA.cx, p.z - ARENA.cz) : 1, at: now }; st.v++; syncMapState(game); return st.doors[id].open ? 'Door open' : 'Door shut'; }
    if (m.kind !== 'break') throw Error('Not breakable'); if (st.broken[id]) return 'Already broken';
    st.hp[id] = (st.hp[id] ?? m.health) - Math.max(1, Math.min(500, +a.dmg || 1)); if (st.hp[id] > 0 && !m.glass) return 'Hit';
    st.broken[id] = 1; st.v++; syncMapState(game); return 'Broken'; }
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
  delete C.down[k]; C.hp[k] = MAX_HP; const at = freeSpot(game, players, team, k); C.spawnTo[k] = { at: now, x: at.x, z: at.z, ...(at.y !== undefined ? { y: at.y } : {}) };
}
// Host tick (~20×/s): bots think, move and shoot; respawned players get a spawn point; the match clock.
// Returns true when the streamed combat state changed.
// The round's doors and breakables (map files: bsp-map.js movers), shared on the combat frame: doors[id] = { open, side,
// at }, broken[id], hp[id] (damage taken so far); v counts changes. A new map starts them fresh; so does every round
// (arena-defuse.js newRound: CS closes the doors and puts the glass back).
export function mapStateOf(game) { const A = game.arena, C = game.combat; if (!C.mapState || C.mapState.map !== A.map) C.mapState = { map: A.map, v: (C.mapState?.v || 0) + 1, doors: {}, broken: {}, hp: {} }; return C.mapState; }
let appliedState = null, appliedV = -1;
const syncMapState = game => { const st = game.combat?.mapState; if (!st || st === appliedState && st.v === appliedV) return; appliedState = st; appliedV = st.v; applyMapState(geo(game).boxes, st); };
const boxDist = (b, x, z) => Math.hypot(Math.max(b[0] - x, 0, x - b[1]), Math.max(b[2] - z, 0, z - b[3]));
// An HE blast at (x, y, z) (map-relative): each door and breakable within its radius takes its damage (falling off as a
// player's does); a door breaks off its hinges at DOOR_HP, glass and grates at their own health.
export const DOOR_HP = 60;
function blastMovers(game, x, y, z, r, dmg) { const movers = ARENA_MAPS[game.arena.map]?.movers; if (!movers?.length) return false; let hit = false;
  movers.forEach((m, id) => { const st = mapStateOf(game); if (st.broken[id]) return; const b = m.box, d = Math.hypot(Math.max(b[0] - x, 0, x - b[1]), Math.max(b[4] - y, 0, y - b[5]), Math.max(b[2] - z, 0, z - b[3]));
    if (d >= r) return; const take = dmg * Math.pow(1 - d / r, 1.3); st.hp[id] = (st.hp[id] ?? (m.kind === 'break' ? m.health : DOOR_HP)) - take;
    if (st.hp[id] <= 0 || (m.kind === 'break' && m.glass)) { st.broken[id] = 1; if (st.doors[id]) delete st.doors[id]; } st.v++; hit = true; });
  if (hit) syncMapState(game); return hit; }
// The way a rotating door swings open from (x, z) (map-relative): away from you (CS) — the side whose swung middle is farther.
function awaySide(m, x, z) { if (m.kind !== 'rotdoor') return 1; const cx = (m.box[0] + m.box[1]) / 2 - m.hinge[0], cz = (m.box[2] + m.box[3]) / 2 - m.hinge[2], far = sg => { const t = sg * m.angle; return Math.hypot(m.hinge[0] + cx * Math.cos(t) + cz * Math.sin(t) - x, m.hinge[2] - cx * Math.sin(t) + cz * Math.cos(t) - z); };
  return far(1) >= far(-1) ? 1 : -1; }
export function arenaTick(game, players = [], dt = .05, now = Date.now()) { TICK.game = game; TICK.now = now; if (game.arena) game.arena.botAt = now;   // (the bots' positions are of this moment: botRoster stamps them so)
  if (game.mode !== 'arena' || !game.arena) return false; const A = game.arena, C = game.combat, g = G(game); let changed = false;
  // Doors and breakables: bots open the doors they reach and smash what blocks their way (they walk the map's paths,
  // which run through doorways and vents); the host's collision follows the state.
  { const movers = ARENA_MAPS[A.map]?.movers; if (movers?.length && A.bots.length) { let st = null;
      for (const b of A.bots) { if (isDown(game, b.name, now)) continue; const x = b.x - ARENA.cx, z = b.z - ARENA.cz;
        movers.forEach((m, id) => { const d = boxDist(m.box, x, z); if (d > 2.2) return; st ??= mapStateOf(game);
          if (m.kind === 'break') { if (!st.broken[id] && d < 1.2) { st.broken[id] = 1; st.v++; changed = true; } }
          else if (!st.doors[id]?.open) { st.doors[id] = { open: 1, side: awaySide(m, x, z), at: now }; st.v++; changed = true; } }); } } }
  syncMapState(game);
  // Lobby: start at the timeout when there are enough players, else wait 30 s more and say why.
  if (A.lobby && !A.lobby.started) { A.endsAt = now + DM_MS; if (now >= A.lobby.until) { const e = lobbyShort(game, players); if (e) { A.lobby.until = now + LOBBY_MORE_MS; A.lobby.note = e; } else beginMatch(game, players, now); changed = true; } }
  // Spawn orders for players who just respawned (their client moves them there).
  for (const [k, at] of Object.entries(C.respawnedAt || {})) { if (C.spawnTo[k]?.at === at) continue; const p = players.find(x => key(x.name) === k); if (!p) continue; const s = bestSpot(game, occupied(game, players, p.name, now)); C.spawnTo[k] = { at, x: s.x, z: s.z }; changed = true; }
  // Deathmatch: a player seen for the first time gets a spot of their own too (not the client's guess).
  if (!C.d) for (const p of players) { const k = key(p.name); if (p.bot || C.spawnTo[k]) continue; const s = bestSpot(game, occupied(game, players, p.name, now)); C.spawnTo[k] = { at: now, x: s.x, z: s.z }; (C.safe ??= {})[k] = now + SPAWN_SAFE_MS; changed = true; }
  // Defuse: the dead drop their best gun (with its rounds) and the bomb where they fell; it leaves their hands, so
  // nothing is duplicated. Deathmatch: you respawn with your loadout, nothing drops.
  A.deathDrops ??= {};
  for (const [k, d] of Object.entries(C.down || {})) { const tag = (C.deaths?.[k] || 0) + ':' + d.until; if (A.deathDrops[k] === tag) continue; A.deathDrops[k] = tag;
    if (C.d?.bomb?.carrier === k) { const bb = A.bots.find(b => key(b.name) === k), bt = bb || players.find(x => key(x.name) === k)?.pose; if (bt) dropItem(game, 'c4', bt.x, bt.z, bb ? botFloor(game, bb) : Math.max(0, (bt.y ?? EYE) - EYE), k, now); C.d.bomb.carrier = null; changed = true; }   // where they fell, on their floor
    if (!C.d) continue;
    const bot = A.bots.find(b => key(b.name) === k), p = bot ? null : players.find(x => key(x.name) === k), at = bot || p?.pose; if (!at) continue;
    // (a body's gun falls from its hands with a little toss — CS2: it slides off where it lands)
    const fall = (x, y, z) => { const a = Math.random() * Math.PI * 2, v = (50 + Math.random() * 40) * HU_; return { x, y, z, vx: Math.sin(a) * v, vy: 60 * HU_, vz: Math.cos(a) * v }; };
    if (bot) { if (bot.weapon && slotOf(bot.weapon)) { dropItem(game, bot.weapon, bot.x, bot.z, botFloor(game, bot), bot.name, now, [bot.ammo, bot.reserve ?? weaponById(bot.weapon).reserve], fall(bot.x, botFloor(game, bot) + 4, bot.z)); bot.weapon = null; changed = true; } continue; }
    const l = A.loadout[k] || {}, slot = l.primary ? 'primary' : l.secondary ? 'secondary' : null;
    if (slot) dropFrom(game, p.name, l[slot], at.x, at.z, Math.max(0, (at.y || 0) - EYE), now, fall(at.x, Math.max(1, (at.y || EYE) - 5), at.z));
    // Everything else is gone with them right away (pistol, grenades, armor, kit), so nothing old shows while dead or
    // at the next round: they come back with the team's starting pistol only (CS2).
    A.loadout[k] = { primary: null, secondary: defaultPistol(C.d.teams[k]), nades: [] }; delete (C.armor ??= {})[k]; if (C.d.kits) delete C.d.kits[k]; A.dirty = true; changed = true; }
  // Walking over a dropped gun with that slot empty picks it up (CS2): a rifle into an empty primary, a pistol into an
  // empty secondary; grenades while there's room; the bomb (Terrorists). An occupied slot is never replaced (E or the
  // B menu swap); your own drop isn't picked straight back up. One claim: it leaves the ground as it's taken.
  if (C.ground?.length) for (const p of players) { if (!p.pose || !(p.pose.z < ARENA.maxZ) || isDown(game, p.name, now)) continue; const k = key(p.name), l = loadoutOf(game, p.name), fy = Math.max(0, (p.pose.y ?? EYE) - EYE);
    for (let i = C.ground.length - 1; i >= 0; i--) { const it = C.ground[i]; if (Math.hypot(it.x - p.pose.x, it.z - p.pose.z) > 3.2 || Math.abs((it.y || 0) - fy) > 4 || now - it.at < 300 || (key(it.by) === k && now - it.at < 1500)) continue;
      const slot = slotOf(it.item); let took = false;
      if (slot === 'bomb') { if (C.d && teamOf(game, p.name) === 't' && !C.d.bomb.carrier) { C.d.bomb.carrier = k; took = true; } }
      else if (slot === 'nades') { if (canCarry(l.nades ??= [], it.item)) { l.nades.push(it.item); took = true; } }
      else if (slot === 'primary' ? !l.primary : slot === 'secondary' && l.secondary === null) { l[slot] = it.item; setAmmo(game, p.name, it.item, it.ammo || fullAmmo(it.item)); took = true; }
      if (took) { C.ground.splice(i, 1); (C.picked ??= {})[k] = { item: it.item, at: now, ammo: it.ammo || null }; A.dirty = true; changed = true; } } }
  if (nadesTick(game, players, dt, now, g, (x, y, z, r, dmg) => { if (blastMovers(game, x - ARENA.cx, y, z - ARENA.cz, r, dmg)) changed = true; }, id => { const m = ARENA_MAPS[game.arena.map]?.movers?.[id], st = mapStateOf(game); if (m?.kind === 'break' && !st.broken[id]) { st.broken[id] = 1; st.v++; syncMapState(game); changed = true; } })) changed = true;   // (a grenade through a pane breaks it)
  if (C.ground?.length) { const n = C.ground.length; C.ground = C.ground.filter(it => it.item === 'c4' || now - it.at < GROUND_MS); if (C.ground.length !== n) changed = true; }
  for (const bot of A.bots) {
    if (isDown(game, bot.name, now)) { bot.dead = true; continue; }
    if (bot.dead && !C.d) { bot.dead = false; place(game, bot, players); botArm(bot, bot.weapon || 'pistol'); changed = true; }
    if (!bot.weapon) botArm(bot, defaultPistol(C.d?.teams?.[key(bot.name)]));
    if (C.d && (C.d.round?.phase === 'freeze' || C.d.matchOver || C.d.paused)) continue;   // defuse: frozen while buying (after a round's end they fight on until the next, as in CS2)
    if (A.lobby && !A.lobby.started) continue;   // lobby: no fighting
    const team = C.d ? C.d.teams[key(bot.name)] : null;
    if (A.practice?.bots === 'stand') continue;   // practice: targets that stand still
    // Defuse: the bomb carrier on a site plants straight away (even under fire) and keeps at it.
    if (C.d && team === 't' && C.d.bomb.carrier === key(bot.name) && C.d.round.phase === 'live') { if (C.d.round.plant?.by === key(bot.name)) continue; if (!C.d.round.plant) { const site = siteAt(game, { x: bot.x, z: bot.z, y: feetOf(g, bot) + EYE }); if (site) { C.d.round.plant = { by: key(bot.name), start: now, x: bot.x, z: bot.z, y: feetOf(g, bot), site }; changed = true; continue; } } }
    const wpn = weaponById(bot.weapon), foes = alive(game, players, bot.name).filter(f => !team || C.d.teams[key(f.name)] !== team), DF = DIFFICULTY[A.difficulty] || DIFFICULTY.normal;
    // Grenades: run from a live HE close by; never stand in fire.
    { const danger = (C.nades || []).find(n => (n.phase === 'air' && n.kind === 'he' && Math.hypot(n.x - bot.x, n.z - bot.z) < 40) || (n.phase === 'fire' && Math.hypot(n.x - bot.x, n.z - bot.z) < NADES.molotov.radius + 2 && inFire(fireCells(g.boxes, n.x, n.z, n.y), bot.x, bot.z)));
      if (danger && botStep(g, bot, Math.atan2(bot.x - danger.x, bot.z - danger.z), 34 * dt)) { changed = true; continue; } }
    // Nearest visible enemy within range.
    let tgt = null, td = Infinity; if (!A.practice || A.practice.bots === 'fight') for (const f of foes) { const d = Math.hypot(f.x - bot.x, f.z - bot.z); if (d < Math.min(wpn.range, 300) && d < td && sees(game, g, bot.x, feetOf(g, bot) + EYE, bot.z, f.x, f.y ?? EYE, f.z)) { tgt = f; td = d; } }   // walls and smoke block
    if (tgt) {
      if (bot.target !== tgt.name) { bot.target = tgt.name; bot.seenAt = now; }
      const want = Math.atan2(-(tgt.x - bot.x), -(tgt.z - bot.z)), diff = Math.atan2(Math.sin(want - bot.yaw), Math.cos(want - bot.yaw)); bot.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
      // Strafe while fighting (side to side, changing direction every ~0.7 s), never into walls.
      { const side = Math.floor(now / 700 + bot.shotN * .37 + (+bot.id.slice(4) || 0)) % 2 ? 1 : -1, sx = Math.cos(bot.yaw) * side, sz = -Math.sin(bot.yaw) * side, st = 14 * dt, nx = bot.x + sx * st, nz = bot.z + sz * st; if (tryMove(g, bot, nx, nz)) changed = true; }
      const react = DF.react + (1 - bot.skill) * 300;
      // Cover: while reloading, or hurt, step behind the nearest wall or crate that hides you from the target.
      if ((now < bot.reloadUntil || hpOf(game, bot.name) < 40) && !bot.noCover) { if (!bot.cover || now > bot.cover.until) bot.cover = { at: findCover(g, bot, tgt), until: now + 1500 }; const cv = bot.cover.at; if (cv && Math.hypot(cv.x - bot.x, cv.z - bot.z) > 1.5 && botStep(g, bot, Math.atan2(cv.x - bot.x, cv.z - bot.z), 30 * dt)) changed = true; }
      if (now < bot.reloadUntil || now < (bot.blindUntil || 0)) continue;   // reloading, or blinded by a flashbang
      if (bot.ammo <= 0) { if (botReload(game, bot)) { bot.reloadUntil = now + wpn.reloadMs; bot.reloadN = (bot.reloadN || 0) + 1; } changed = true; continue; }
      if (Math.abs(diff) < .12 && now - bot.seenAt > react && now - bot.lastShot > wpn.rateMs * (wpn.auto ? 1.6 : 1.1)) {
        bot.lastShot = now; bot.ammo--; bot.shotN++; changed = true; if (C.safe) delete C.safe[key(bot.name)];   // firing ends spawn protection
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
    let moved = false; for (const turn of [0, .6, -.6, 1.2, -1.2]) { const h = head + turn, nx = bot.x + Math.sin(h) * step, nz = bot.z + Math.cos(h) * step; if (tryMove(g, bot, nx, nz)) { bot.yaw = h + Math.PI; moved = true; break; } }
    if (!moved) bot.wp = -1;
  }
  // The host scheduled another map for the next match: switch when this one ends (people keep their side).
  if (C.d?.matchOver && A.nextMap && now - C.d.matchOver.at > DEFUSE.matchOverMs) { const id = A.nextMap, m = ARENA_MAPS[id], teams = { ...C.d.teams }; startArena(game, { map: id, kind: m.kind, bots: A.bots.length, difficulty: A.difficulty, freezeS: (A.freezeMs ?? 15000) / 1000, rules: A.rulesNext || A.rules }, now); if (game.combat.d) for (const [k, t] of Object.entries(teams)) if (!/^bot /.test(k)) game.combat.d.teams[k] = t; return true; }
  if (C.d) { if (defuseTick(game, players, now, { hurtAll: (x, z, y, dmg, R) => { for (const t of alive(game, players, '')) { const dd = Math.hypot(t.x - x, t.z - z); if (dd < R) hurt(game, 'C4', t.name, { id: 'c4', name: 'C4' }, Math.round(dmg * Math.pow(1 - dd / R, 1.4)), 'chest', now); } }, posOf: k => { const b = A.bots.find(b => key(b.name) === k); if (b) return b; const p = players.find(x => key(x.name) === k)?.pose; return p || null; } })) changed = true; return changed; }
  if (!A.over && now > A.endsAt) { const kills = C.kills || {}, top = Object.entries(kills).sort((a, b) => b[1] - a[1])[0]; A.over = { at: now, winner: top ? top[0] : null }; changed = true; }
  if (A.over && now - A.over.at > 12000) { startArena(game, { map: A.map, bots: A.bots.length }, now); changed = true; }
  return changed;
}

// Defuse bots: Terrorists walk a route to this round's site (the carrier plants there); CTs hold a site and, once the
// bomb is down, walk to it and defuse. Same steering as deathmatch bots.
function defuseBot(game, bot, team, g, dt, now) {
  const d = game.combat.d, r = d.round, m = g.map, k = key(bot.name), cx = ARENA.cx, cz = ARENA.cz;
  if (!bot.path) { const routes = m.routes[team], site = team === 't' ? r.tSite : parseInt(bot.id.slice(4)) % 2 ? 'A' : 'B'; bot.site = site; bot.path = routes[site].map(([x, z, y]) => [cx + x, cz + z, y]); bot.pi = 0; }
  if (r.phase === 'planted' && team === 'ct' && !bot.retake) { bot.retake = true; bot.path = [...bot.path.slice(bot.pi), [r.planted.x, r.planted.z]]; bot.pi = 0; }
  // At the bomb: defuse. At the site with the bomb: plant.
  if (team === 'ct' && r.phase === 'planted' && Math.hypot(bot.x - r.planted.x, bot.z - r.planted.z) < 5) { if (!r.defuse) { r.defuse = { by: k, start: now, ms: d.kits[k] ? DEFUSE.kitMs : DEFUSE.defuseMs, x: bot.x, z: bot.z }; return true; } return false; }
  if (team === 't' && d.bomb.carrier === k && r.phase === 'live' && !r.plant) { const site = siteAt(game, { x: bot.x, z: bot.z, y: feetOf(g, bot) + EYE }); if (site) { r.plant = { by: k, start: now, x: bot.x, z: bot.z, y: feetOf(g, bot), site }; return true; } }
  if (r.plant?.by === k) return false;   // standing still while planting
  // A Terrorist without the bomb picks it up if it lies near.
  if (team === 't' && !d.bomb.carrier) { const i = (game.combat.ground || []).findIndex(it => it.item === 'c4' && Math.hypot(it.x - bot.x, it.z - bot.z) < 4); if (i >= 0) { game.combat.ground.splice(i, 1); d.bomb.carrier = k; return true; } }
  // Past the last waypoint but not there (it was skipped while stuck): walk a fresh route to it (at most every 2 s).
  if (bot.pi >= bot.path.length) { const end = bot.path[bot.path.length - 1]; if (!m.nav || !end || Math.hypot(end[0] - bot.x, end[1] - bot.z) < 4 || now - (bot.replanAt || 0) <= 2000) return false;
    bot.replanAt = now; const fresh = m.nav.route(bot.x - cx, bot.z - cz, feetOf(g, bot), end[0] - cx, end[1] - cz); if (!fresh.length) return false; bot.path = fresh.map(([x, z, y]) => [cx + x, cz + z, y]); bot.pi = 0; return true; }
  // Reached when close: on the classic maps within 1.5 units (a tick's step), so a bot never cuts a corner off the walk the
  // route checked (4 units let bots shortcut round ledges and wedge there).
  // A waypoint is reached on its own floor (classic maps: a point below a ledge is not reached from the ledge above
  // it). Above a lower waypoint, keep going the way the route goes until off the edge, then come back to it.
  const [wx, wz, wy] = bot.path[bot.pi], above = m.nav && Number.isFinite(wy) && feetOf(g, bot) - wy > 6,   /* a ledge, not a ramp (on a steep ramp the body rides a few units above the next point) */ dw = Math.hypot(wx - bot.x, wz - bot.z);
  if (dw < (m.nav ? 1.5 : 4) && (!above || now - (bot.stillSince ?? now) > 1000)) { bot.pi++; return true; }   // (above it and stuck a second: on to the next point — a vent's way down)
  // Progress towards the waypoint (distance, and height still to drop): none for 3 s means this way does not work for a
  // body here (a drop or gap the route allowed) — re-plan from where the bot stands, round the spot it failed at.
  { const prog = dw + (Number.isFinite(wy) ? Math.max(0, feetOf(g, bot) - wy) : 0);
    if (bot.wpI !== bot.pi || bot.wpPath !== bot.path) { bot.wpI = bot.pi; bot.wpPath = bot.path; bot.wpBest = prog; bot.wpAt = now; }
    else if (prog < bot.wpBest - 1) { bot.wpBest = prog; bot.wpAt = now; }
    else if (m.nav && now - bot.wpAt > 3000) { bot.wpAt = now; (bot.avoid ??= []).push([wx - cx, wz - cz]); if (bot.avoid.length > 8) bot.avoid.shift();
      const end = bot.path[bot.path.length - 1], fresh = m.nav.route(bot.x - cx, bot.z - cz, feetOf(g, bot), end[0] - cx, end[1] - cz, bot.avoid);
      if (fresh.length) { bot.path = fresh.map(([x, z, y]) => [cx + x, cz + z, y]); bot.pi = 0; return true; } } }
  let tx = wx, tz = wz; if (above && dw < 4) { const [px, pz] = bot.pi > 0 ? bot.path[bot.pi - 1] : [bot.x - (wx - bot.x), bot.z - (wz - bot.z)], L = Math.hypot(wx - px, wz - pz) || 1; tx = wx + (wx - px) / L * 3; tz = wz + (wz - pz) / L * 3; }
  const head0 = Math.atan2(tx - bot.x, tz - bot.z), step = 26 * dt;
  // No progress for a second: sidestep for half a second (out of a corner between two obstacles), then carry on.
  if (Math.hypot(bot.x - (bot.lastX ?? 1e9), bot.z - (bot.lastZ ?? 1e9)) > 1.5) { bot.lastX = bot.x; bot.lastZ = bot.z; bot.stillSince = now; }
  const stuckFor = now - (bot.stillSince ?? now), head = stuckFor > 1000 && stuckFor % 1500 < 500 ? head0 + (Math.floor(stuckFor / 1500) % 2 ? 2.2 : -2.2) : head0;
  for (const turn of [0, .6, -.6, 1.2, -1.2]) { const h = head + turn, nx = bot.x + Math.sin(h) * step, nz = bot.z + Math.cos(h) * step; if (tryMove(g, bot, nx, nz)) { bot.yaw = h + Math.PI; return true; } }
  // Stuck: on classic maps walk a fresh route from here to where this one ends (at most every 2 s); else skip the waypoint.
  if (m.nav && now - (bot.replanAt || 0) > 2000) { bot.replanAt = now; const end = bot.path[bot.path.length - 1], fresh = m.nav.route(bot.x - cx, bot.z - cz, feetOf(g, bot), end[0] - cx, end[1] - cz);
    if (fresh.length) { bot.path = fresh.map(([x, z, y]) => [cx + x, cz + z, y]); bot.pi = 0; return true; } }
  bot.pi++; return true;   // stuck: skip this waypoint
}
const wp = (g, i) => { const [x, z] = g.map.spawns[i]; return [ARENA.cx + x, ARENA.cz + z]; };
// Bots as roster entries, so every client draws, hears and can shoot them like players.
// (each pose stamped with the tick that moved it — not when the roster went out: rosters also go out between ticks, as
// players' poses arrive, and a later stamp on a position that hadn't moved made bots stop and lurch on everyone's screen)
export function botRoster(game) {
  return (game.mode === 'arena' && game.arena?.bots || []).map((b, i) => ({ id: b.id, name: b.name, role: 'bot', bot: true, color: [0xff879e, 0xe2e779, 0x7ca1ff, 0xc5a27d][i % 4], slot: -1,
    pose: { t: game.arena.botAt || Date.now(), x: b.x, y: EYE + botFloor(game, b), z: b.z, yaw: b.yaw, crouched: false, active: !isDown(game, b.name), face: 'smile', skin: ['red', 'blue', 'green', 'pink'][i % 4], hat: 'helmet', outfit: 'vest', carry: null, point: false, gun: true, weapon: b.weapon, shot: { n: b.shotN, pitch: 0, r: b.reloadN || 0 }, emote: { id: null, n: 0 } } }));
}
export const arenaHp = (game, name) => hpOf(game, name) ?? MAX_HP;
