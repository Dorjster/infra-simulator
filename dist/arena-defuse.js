// Global Defensive · Defuse (CS2 rules), run by the host. State on game.combat.d (streamed with HP and kills):
//  · Teams T and CT, balanced as people join (bots fill); friendly fire on (⅓ bullet, 85 % grenade damage).
//  · Rounds: 15 s freeze (buy), 1:55 to play; buy time ends 20 s after the freeze, only in your spawn.
//    The dead watch their team until the next round. First to 13; sides swap after 12 (money back to $800).
//  · Economy: $800 start, $16,000 cap, kill rewards by weapon, win $3,250 / $3,500 (bomb, defuse), loss bonus
//    $1,400 … $3,400 with the loss streak, +$800 to the Terrorists for a plant they still lose.
//  · Bomb: one Terrorist carries it (slot 5); hold to plant on site A or B (3.2 s); it goes off 40 s later
//    (everyone near dies). A CT holds E on it for 10 s (5 s with a $400 kit) to defuse. It drops when the carrier
//    dies; only Terrorists can pick it up.
//  · Win: eliminate the other team, the bomb explodes (T), it's defused or the clock runs out unplanted (CT).
import { ARENA } from './facility-layout.js';
import { ARENA_MAPS, spawnSlots } from './arena-maps.js';
import { weaponById, EYE, MAX_HP, defaultPistol } from './weapons-data.js';
import { refillAll } from './combat-logic.js';

export const DEFUSE = { freezeMs: 15000, roundMs: 115000, buyMs: 20000, bombMs: 40000, plantMs: 3200, defuseMs: 10000, kitMs: 5000, overMs: 6000, matchOverMs: 12000, half: 12, win: 13, start: 800, max: 16000, buyRadius: 45, bombRadius: 1750 * 2.54 / 16.5 };
// Prices come from the weapon table (weapons-data.js); grenades and the kit here.
export const PRICE = new Proxy({ he: 300, flash: 200, smoke: 300, molotov: 400, kit: 400 }, { get: (o, id) => o[id] ?? weaponById(id)?.price });
const WIN = { elim: 3250, time: 3250, bomb: 3500, defuse: 3500 }, LOSS = [1400, 1900, 2400, 2900, 3400];
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export const isDefuse = game => game?.mode === 'arena' && game.arena?.kind === 'defuse';
export const teamOf = (game, name) => game?.combat?.d?.teams?.[key(name)] || null;
const map = game => ARENA_MAPS[game.arena.map];
const other = t => t === 't' ? 'ct' : 't';
const gain = (d, k, n) => { d.money[k] = Math.max(0, Math.min(DEFUSE.max, (d.money[k] ?? DEFUSE.start) + n)); };

// Friendly fire and kill money (called by combat-logic for every hit in defuse).
export function defuseDamage(game, shooter, target, wpn, dmg) {
  const d = game.combat?.d; if (!d) return dmg; const a = d.teams[key(shooter)], b = d.teams[key(target)];
  return a && a === b && key(shooter) !== key(target) && wpn.id !== 'c4' ? Math.round(dmg * (['he', 'molotov'].includes(wpn.id) ? .85 : .33)) : dmg;
}
export function defuseKill(game, shooter, target, wpn) {
  const d = game.combat?.d; if (!d) return; const k = key(shooter), a = d.teams[k], b = d.teams[key(target)]; if (!a || k === key(target)) return;
  gain(d, k, a === b ? -300 : ({ he: 300, molotov: 300, c4: 0 })[wpn.id] ?? weaponById(wpn.id)?.reward ?? 300);
}

// teams: sides to keep (the lobby's choices); bots without one alternate.
export function startDefuse(game, now, players = [], teams = null) {
  game.combat.d = { teams: teams ? { ...teams } : {}, money: {}, score: { t: 0, ct: 0 }, loss: { t: 0, ct: 0 }, round: null, bomb: { carrier: null }, kits: {}, n: 0, matchOver: null, pending: {} };
  for (const [i, b] of (game.arena.bots || []).entries()) { const k = key(b.name); game.combat.d.teams[k] ??= i % 2 ? 'ct' : 't'; }
  newRound(game, players, now);
}
const warmup = game => !!game.arena?.lobby && !game.arena.lobby.started;
// Everyone in the match: players present in the arena and bots.
function members(game, players) {
  const out = []; for (const p of players) if (p.pose && p.pose.z < ARENA.maxZ) out.push({ k: key(p.name), name: p.name, pose: p.pose });
  for (const b of game.arena.bots || []) out.push({ k: key(b.name), name: b.name, bot: b }); return out;
}
export function teamCounts(game, players = []) { const d = game.combat.d, c = { t: 0, ct: 0 }; for (const m of members(game, players)) if (d.teams[m.k]) c[d.teams[m.k]]++; return c; }
export function assignTeam(game, name, players = []) { const d = game.combat.d, k = key(name); if (d.teams[k]) return d.teams[k]; const c = teamCounts(game, players); d.teams[k] = c.t <= c.ct ? 't' : 'ct'; d.money[k] ??= DEFUSE.start; return d.teams[k]; }

// A new round: everyone alive at their team's spawn; the dead lost their gear; the bomb to a random Terrorist.
export function newRound(game, players, now) {
  const C = game.combat, d = C.d, A = game.arena, m = map(game);
  if (d.n === DEFUSE.half) { // halftime: swap sides, money and gear back to the start
    for (const k of Object.keys(d.teams)) { d.teams[k] = other(d.teams[k]); d.money[k] = DEFUSE.start; delete A.loadout[k]; } d.score = { t: d.score.ct, ct: d.score.t }; d.loss = { t: 0, ct: 0 }; d.kits = {}; C.armor = {};
    for (const b of A.bots) b.weapon = null;
  }
  // Team changes asked for during the last round take effect now.
  for (const [k, t] of Object.entries(d.pending || {})) { d.teams[k] = t; delete A.loadout[k]; delete (C.ammo ??= {})[k]; if (d.bomb?.carrier === k) d.bomb.carrier = null; } d.pending = {};
  for (const bk of d.botMoves || []) if (d.teams[bk]) d.teams[bk] = d.teams[bk] === 't' ? 'ct' : 't'; d.botMoves = [];
  if (!warmup(game)) d.n++; const firstOfHalf = d.n <= 1 || d.n === DEFUSE.half + 1;
  // The dead lose everything (gun, grenades, armor, kit) and start again with their team's pistol.
  for (const k of Object.keys(C.down || {})) { delete (C.armor ??= {})[k]; if (!A.bots.some(b => key(b.name) === k)) { A.loadout[k] = { primary: null, secondary: defaultPistol(d.teams[k]), nades: [] }; delete d.kits[k]; } else { const b = A.bots.find(b => key(b.name) === k); b.weapon = null; } }
  C.down = {}; C.hp = {}; C.nades = []; C.ground = []; C.spawnTo ??= {};
  for (const [k, t] of Object.entries(d.teams)) if (t === 'spec') C.down[k] = { until: 4e15, by: '', weapon: 'spectating' };   // spectators watch
  for (const mem of members(game, players)) { if (!d.teams[mem.k]) assignTeam(game, mem.name, players); if (firstOfHalf) d.money[mem.k] ??= DEFUSE.start; }
  // Every member gets their own spawn spot on their side (no two in the same place, any team size).
  const idx = { t: 0, ct: 0 };
  for (const mem of members(game, players)) { const t = d.teams[mem.k]; if (t !== 't' && t !== 'ct') continue; const slots = spawnSlots(m, t), i = idx[t]++ % slots.length, at = slots[i];
    if (mem.bot) { const b = mem.bot; b.x = ARENA.cx + at[0]; b.z = ARENA.cz + at[1]; b.path = null; b.retake = false; b.dead = false; arm(b, b.weapon || defaultPistol(t)); botBuy(game, b); }
    else { C.spawnTo[mem.k] = { at: now, i: (t === 't' ? 0 : m.t.length) + Math.min(i, (t === 't' ? m.t : m.ct).length - 1), x: ARENA.cx + at[0], z: ARENA.cz + at[1] }; if (A.loadout[mem.k] && A.loadout[mem.k].secondary === undefined) A.loadout[mem.k].secondary = defaultPistol(t); refillAll(game, mem.name); } }   // every gun full for the new round (survivors keep theirs)
  const ts = members(game, players).filter(x => d.teams[x.k] === 't'); d.bomb = { carrier: ts.length ? ts[Math.floor(Math.random() * ts.length)].k : null };
  if (warmup(game)) { d.round = { phase: 'warmup', at: now, freezeUntil: 4e15, buyUntil: 4e15, endsAt: 4e15, planted: null, plant: null, defuse: null, winner: null, reason: null, overAt: null, tSite: 'A' }; A.dirty = true; return; }
  d.round = { phase: 'freeze', at: now, freezeUntil: now + DEFUSE.freezeMs, buyUntil: now + DEFUSE.freezeMs + DEFUSE.buyMs, endsAt: now + DEFUSE.freezeMs + DEFUSE.roundMs, planted: null, plant: null, defuse: null, winner: null, reason: null, overAt: null, tSite: Math.random() < .5 ? 'A' : 'B' };
  A.dirty = true;   // loadouts changed: the room sends the whole world
}
// A bot's gun, full: magazine and reserve.
const arm = (b, id) => { const w = weaponById(id); b.weapon = w.id; b.ammo = w.mag; b.reserve = w.reserve; b.reloadUntil = 0; };
function botBuy(game, b) {
  const d = game.combat.d, k = key(b.name), t = d.teams[k], money = d.money[k] ?? DEFUSE.start; if (b.weapon !== defaultPistol(t)) return;
  const want = money >= 4750 + 1000 && Math.random() < .2 ? 'sniper' : money >= 3100 ? (t === 't' ? 'ak' : 'm4') : money >= 2050 ? (t === 't' ? 'galil' : 'famas') : money >= 1250 ? (t === 't' ? 'mac10' : 'mp9') : null;
  if (want) { gain(d, k, -PRICE[want]); arm(b, want); }
}
// A spawn spot on a side that nobody (alive, of any team) stands on: for players and bots joining mid-freeze.
export function freeSpot(game, players, team, but = null) {
  const m = map(game), C = game.combat, recent = Date.now() - 4000, taken = members(game, players).filter(x => x.k !== but && !(C.down || {})[x.k]).flatMap(x => x.bot ? [{ x: x.bot.x, z: x.bot.z }] : [{ x: x.pose.x, z: x.pose.z }, ...(C.spawnTo?.[x.k] && Number.isFinite(C.spawnTo[x.k].x) && (C.spawnTo[x.k].at || 0) > Math.min(recent, (C.spawnTo[x.k].at || 0)) - 1 ? [{ x: C.spawnTo[x.k].x, z: C.spawnTo[x.k].z }] : [])]);   // where they stand, and where they were just sent
  const slots = spawnSlots(m, team).map(([x, z]) => ({ x: ARENA.cx + x, z: ARENA.cz + z }));
  return slots.find(s => taken.every(o => Math.hypot(o.x - s.x, o.z - s.z) > 4.5)) || slots[Math.floor(Math.random() * slots.length)];
}
// May this player buy now (buy time, in their spawn, alive)? Returns an error message or null.
export function buyError(game, name, pose, now) {
  const d = game.combat.d, r = d.round, t = d.teams[key(name)]; if (!t) return 'Join a team first';
  if (!r || (r.phase !== 'freeze' && now > r.buyUntil) || r.phase === 'over') return 'Buy time is over';
  if ((game.combat.down || {})[key(name)]) return 'You are dead';
  if (pose) { const m = map(game), sp = t === 't' ? m.t : m.ct, cx = sp.reduce((a, s) => a + s[0], 0) / sp.length, cz = sp.reduce((a, s) => a + s[1], 0) / sp.length; if (Math.hypot(pose.x - ARENA.cx - cx, pose.z - ARENA.cz - cz) > DEFUSE.buyRadius) return 'Buy only in your spawn'; }
  return null;
}
// Charge a sum (armor, upgrades): throws when the player can't afford it; nothing is taken then.
export function charge(game, name, amount) { const d = game.combat.d, k = key(name); if ((d.money[k] ?? DEFUSE.start) < amount) throw Error('Not enough money ($' + amount + ')'); gain(d, k, -amount); }
export function pay(game, name, item) { const d = game.combat.d, k = key(name), p = PRICE[item] ?? 0; if ((d.money[k] ?? DEFUSE.start) < p) throw Error('Not enough money ($' + p + ')'); gain(d, k, -p); }

// Plant / defuse: the client holds (hold: true) and lets go (hold: false); the host times it and checks you stay put.
export function defuseApply(game, a, name, pose, now) {
  const d = game.combat.d, r = d.round, k = key(name), t = d.teams[k]; if (!r) throw Error('No round');
  if ((game.combat.down || {})[k]) throw Error('You are dead');
  if (a.type === 'buy-kit') { const e = buyError(game, name, pose, now); if (e) throw Error(e); if (t !== 'ct') throw Error('Only CTs use a defuse kit'); if (d.kits[k]) throw Error('You have a kit'); pay(game, name, 'kit'); d.kits[k] = true; return 'Bought a defuse kit'; }
  if (a.type === 'plant') {
    if (!a.hold) { if (r.plant?.by === k) r.plant = null; return 'Stopped planting'; }
    if (r.phase !== 'live') throw Error('Not now'); if (d.bomb.carrier !== k) throw Error('You don’t have the bomb');
    const site = siteAt(game, pose); if (!site) throw Error('Plant on site A or B'); r.plant = { by: k, start: now, x: pose.x, z: pose.z, y: Math.max(0, (pose.y ?? EYE) - EYE), site }; return 'Planting…';
  }
  if (a.type === 'defuse') {
    if (!a.hold) { if (r.defuse?.by === k) r.defuse = null; return 'Stopped defusing'; }
    if (r.phase !== 'planted' || t !== 'ct') throw Error('Nothing to defuse'); const b = r.planted; if (!pose || Math.hypot(pose.x - b.x, pose.z - b.z) > 7) throw Error('Get closer to the bomb');
    if (r.defuse && r.defuse.by !== k) throw Error('Someone is already defusing'); r.defuse = { by: k, start: now, ms: d.kits[k] ? DEFUSE.kitMs : DEFUSE.defuseMs, x: pose.x, z: pose.z }; return d.kits[k] ? 'Defusing with kit…' : 'Defusing…';
  }
  throw Error('Unknown defuse action');
}
export function siteAt(game, pose) { if (!pose) return null; const m = map(game); for (const [s, [x, z, r]] of Object.entries(m.sites)) if (Math.hypot(pose.x - ARENA.cx - x, pose.z - ARENA.cz - z) < r) return s; return null; }

// Host tick: round clock, plant / defuse timers, the explosion, win checks, round changes. `hurtAll(x, z, y, dmg, radius)`
// applies the explosion; `posOf(k)` gives where someone is (player pose or bot). Returns true when anything changed.
export function defuseTick(game, players, now, { hurtAll, posOf }) {
  const C = game.combat, d = C.d; if (!d?.round) return false; const r = d.round; let changed = false;
  for (const mem of members(game, players)) if (!d.teams[mem.k]) { const t = assignTeam(game, mem.name, players); changed = true;
    if (r.phase !== 'freeze' && r.phase !== 'warmup') C.down[mem.k] = { until: 4e15, by: '', weapon: 'joined mid-round' };   // watch until the next round
    else { const at = freeSpot(game, players, t, mem.k); if (mem.bot) { mem.bot.x = at.x; mem.bot.z = at.z; } else (C.spawnTo ??= {})[mem.k] = { at: now, i: t === 'ct' ? map(game).t.length : 0, x: at.x, z: at.z }; } }
  // Someone on the Terrorist side always has the bomb during the freeze (e.g. the first players just joined).
  if (r.phase === 'freeze' && !d.bomb.carrier) { const ts = members(game, players).filter(x => d.teams[x.k] === 't'); if (ts.length) { d.bomb.carrier = ts[Math.floor(Math.random() * ts.length)].k; changed = true; } }
  if (r.phase === 'warmup') { for (const [k, dn] of Object.entries(C.down || {})) if (d.teams[k] !== 'spec' && now - (dn.at || 0) > 3000 && dn.until > now) { const t = d.teams[k], at = freeSpot(game, players, t, k), b = game.arena.bots.find(x => key(x.name) === k); delete C.down[k]; C.hp[k] = MAX_HP; if (b) { b.x = at.x; b.z = at.z; } else C.spawnTo[k] = { at: now, x: at.x, z: at.z }; changed = true; } return changed; }   // warmup: back after 3 s
  if (d.matchOver) { if (now - d.matchOver.at > DEFUSE.matchOverMs) { startDefuse(game, now, players, d.teams); return true; } return false; }
  if (r.phase === 'freeze' && now >= r.freezeUntil) { r.phase = 'live'; changed = true; }
  const alive = t => members(game, players).filter(m => d.teams[m.k] === t && !(C.down || {})[m.k]).length;
  // Planting: stand still on the site with the bomb.
  // Planting stops only for a real move away (5 units: more than a stop's slide plus position lag), death or losing the bomb.
  if (r.plant) { const p = posOf(r.plant.by); if (!p || (C.down || {})[r.plant.by] || Math.hypot(p.x - r.plant.x, p.z - r.plant.z) > 5 || d.bomb.carrier !== r.plant.by) { r.plant = null; changed = true; }
    else if (now - r.plant.start >= DEFUSE.plantMs && r.phase === 'live') { r.planted = { x: r.plant.x, z: r.plant.z, y: r.plant.y, site: r.plant.site, at: now, explodeAt: now + DEFUSE.bombMs, by: r.plant.by }; r.phase = 'planted'; d.bomb.carrier = null; gain(d, r.plant.by, 300); r.plant = null; r.defuse = null; changed = true; } }
  if (r.defuse) { const p = posOf(r.defuse.by); if (!p || (C.down || {})[r.defuse.by] || Math.hypot(p.x - r.defuse.x, p.z - r.defuse.z) > 5) { r.defuse = null; changed = true; }
    else if (now - r.defuse.start >= r.defuse.ms) { end(game, 'ct', 'defuse', now); return true; } }
  if (r.phase === 'live' || r.phase === 'planted') {
    if (r.phase === 'planted' && now >= r.planted.explodeAt) { hurtAll(r.planted.x, r.planted.z, r.planted.y, 500, DEFUSE.bombRadius); end(game, 't', 'bomb', now); return true; }
    if (alive('ct') === 0 && members(game, players).some(m => d.teams[m.k] === 'ct')) { end(game, 't', 'elim', now); return true; }
    if (r.phase === 'live' && alive('t') === 0 && members(game, players).some(m => d.teams[m.k] === 't')) { end(game, 'ct', 'elim', now); return true; }
    if (r.phase === 'live' && now >= r.endsAt) { end(game, 'ct', 'time', now); return true; }
  }
  if (r.phase === 'over' && now - r.overAt >= DEFUSE.overMs) { newRound(game, players, now); return true; }
  return changed;
}
function end(game, winner, reason, now) {
  const C = game.combat, d = C.d, r = d.round; r.phase = 'over'; r.winner = winner; r.reason = reason; r.overAt = now; r.plant = null; r.defuse = null;
  d.score[winner]++; const loser = other(winner);
  for (const [k, t] of Object.entries(d.teams)) { if (t === winner) gain(d, k, WIN[reason]); else gain(d, k, LOSS[Math.min(4, d.loss[loser])] + (loser === 't' && r.planted ? 800 : 0)); }
  d.loss[loser]++; d.loss[winner] = Math.max(0, d.loss[winner] - 1);
  if (d.score[winner] >= DEFUSE.win) d.matchOver = { at: now, winner };
}
