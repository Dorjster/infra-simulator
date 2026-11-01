// Whose skin a gun shows (CS2): its owner's — the player who bought it — whoever holds it now (skins.js skinFor; the host
// keeps the owner on loadouts (l.own) and ground items (it.own), arena-logic.js). Bought, dropped, picked up by an enemy
// (E, or walking over it), dropped at death, carried by a bot and dropped again, refunded back: the owner's skin goes
// with it every time. A bot's own guns have no skin. StatTrak counts only in the owner's hands. A ground item's owner is
// in the combat frame as every page gets it.
//   node tests/gd-skin-owner.mjs
import assert from 'node:assert/strict';
import { skinFor, skinOwner, groundSkin, setSkinCatalog } from '../dist/skins.js';
import { startArena, arenaApply, arenaTick, botRoster } from '../dist/arena-logic.js';
import { hurt } from '../dist/combat-logic.js';
import { weaponById, EYE } from '../dist/weapons-data.js';
import { ARENA_MAPS, spawnSlots } from '../dist/arena-maps.js'; import { ARENA } from '../dist/facility-layout.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
setSkinCatalog(null);
const sp = spawnSlots(ARENA_MAPS.dust2, 't')[0], X = ARENA.cx + sp[0], Z = ARENA.cz + sp[1], Y = sp[2] + EYE;
const pose = (dx = 0) => ({ x: X + dx, y: Y, z: Z, yaw: 0, fy: sp[2] });
const T0 = 1e9;
function match() { const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, T0); const d = g.combat.d; d.teams = { ann: 'ct', bo: 't', cy: 't' }; d.money = { ann: 16000, bo: 16000, cy: 16000 };
  const P = [{ name: 'Ann', pose: pose(0) }, { name: 'Bo', pose: pose(1) }, { name: 'Cy', pose: pose(2) }];
  for (const [who, f] of [['Ann', 'asiimov'], ['Bo', 'web'], ['Cy', 'gold']]) for (const id of ['ak', 'm4', 'famas', 'usps', 'pistol', 'sniper']) arenaApply(g, { type: 'skin', weapon: id, skin: { finish: f, st: true } }, who, P, T0);
  return { g, P, d }; }
// (the picker stands at the gun: E reaches it)
const take = (g, who, it, t, swap = false) => arenaApply(g, { type: 'pickup', id: it.id, ...(swap ? { swap } : {}) }, who, [{ name: who, pose: { x: it.x, y: (it.y || 0) + EYE, z: it.z, yaw: 0 } }], t);
const fin = (g, holder, id, hint) => skinFor(g.arena, holder, id, hint)?.finish ?? null;

// ── Bought, dropped, picked up by an enemy ──
{ const { g, P } = match();
  arenaApply(g, { type: 'buy', primary: 'm4', x: X, z: Z }, 'Ann', [], T0 + 1);
  ok('bought: the buyer\'s skin, no owner mark needed', fin(g, 'Ann', 'm4') === 'asiimov' && !g.arena.loadout.ann.own);
  ok('Bo\'s own M4 would wear his', fin(g, 'Bo', 'm4') === 'web');
  arenaApply(g, { type: 'drop', slot: 'primary' }, 'Ann', P, T0 + 2); const it = g.combat.ground.find(x => x.item === 'm4');
  ok('dropped: the ground gun carries its owner and shows the owner\'s skin', it?.own === 'ann' && groundSkin(g.arena, it)?.finish === 'asiimov', JSON.stringify(it));
  ok('the owner is in the combat frame as pages get it', JSON.parse(JSON.stringify(g.combat)).ground.find(x => x.item === 'm4').own === 'ann');
  take(g, 'Bo', it, T0 + 2000);
  ok('an enemy picks it up: Ann\'s skin in Bo\'s hands (CS2)', g.arena.loadout.bo.primary === 'm4' && fin(g, 'Bo', 'm4') === 'asiimov' && skinOwner(g.arena, 'Bo', 'm4') === 'ann', JSON.stringify(g.arena.loadout.bo));
  // StatTrak: only in the owner's hands
  const k0 = g.arena.skins.ann.m4.kills; hurt(g, 'Bo', 'Ann', weaponById('m4'), 300, 'head', T0 + 2100);
  ok('Bo kills with Ann\'s StatTrak M4: neither count moves (it does not belong to him)', g.arena.skins.ann.m4.kills === k0 && (g.arena.skins.bo.m4.kills | 0) === 0);
  g.combat.down = {}; g.combat.hp = {};
  // Bo swaps it for Cy's? Bo drops it, Cy walks over it (slot empty): still Ann's
  arenaApply(g, { type: 'drop', slot: 'primary' }, 'Bo', P, T0 + 3000); const it2 = g.combat.ground.find(x => x.item === 'm4');
  ok('dropped again by Bo: still Ann\'s', it2?.own === 'ann' && !g.arena.loadout.bo.own?.primary);
  g.arena.loadout.cy = { primary: null, secondary: 'pistol', nades: [] }; const P2 = [{ name: 'Cy', pose: { ...pose(0), x: it2.x, z: it2.z, y: (it2.y || 0) + EYE } }];
  arenaTick(g, P2, .05, T0 + 3000 + 5000);
  ok('Cy walks over it: Ann\'s skin in Cy\'s hands', g.arena.loadout.cy.primary === 'm4' && fin(g, 'Cy', 'm4') === 'asiimov', JSON.stringify(g.arena.loadout.cy));
  // Ann takes her own gun back: hers again, no mark
  arenaApply(g, { type: 'drop', slot: 'primary' }, 'Cy', P, T0 + 9000); const it3 = g.combat.ground.find(x => x.item === 'm4'); g.arena.loadout.ann.primary = null;
  take(g, 'Ann', it3, T0 + 12000);
  ok('back in the owner\'s hands: no owner mark, her skin', fin(g, 'Ann', 'm4') === 'asiimov' && !g.arena.loadout.ann.own);
  hurt(g, 'Ann', 'Bo', weaponById('m4'), 300, 'head', T0 + 12100); ok('…and her StatTrak counts', g.arena.skins.ann.m4.kills === k0 + 1); }

// ── E swap: the old gun drops with its owner, the new one comes with its own ──
{ const { g, P } = match(); g.arena.loadout.bo = { primary: 'ak', secondary: 'pistol', nades: [] }; g.arena.loadout.ann = { primary: 'm4', secondary: 'usps', nades: [] };
  arenaApply(g, { type: 'drop', slot: 'primary' }, 'Ann', P, T0 + 1); const m4 = g.combat.ground.find(x => x.item === 'm4');
  take(g, 'Bo', m4, T0 + 2000, true);
  const ak = g.combat.ground.find(x => x.item === 'ak');
  ok('E swap: Bo\'s AK on the ground is Bo\'s, Ann\'s M4 in his hands is Ann\'s', ak?.own === 'bo' && fin(g, 'Bo', 'm4') === 'asiimov' && groundSkin(g.arena, ak)?.finish === 'web'); }

// ── Death drops ──
{ const { g, P } = match(); g.arena.loadout.ann = { primary: 'm4', secondary: 'usps', nades: [], own: { primary: { w: 'm4', k: 'cy' } } };
  hurt(g, 'Bo', 'Ann', weaponById('ak'), 300, 'head', T0 + 10); arenaTick(g, P, .05, T0 + 20);
  const it = g.combat.ground.find(x => x.item === 'm4');
  ok('death drop: the gun keeps its owner (Cy\'s gun Ann carried)', it?.own === 'cy' && groundSkin(g.arena, it)?.finish === 'gold', JSON.stringify(it));
  ok('the dead start again with a clean loadout (no owner marks)', !g.arena.loadout.ann.own); }

// ── Bots: pick up a player's gun (it keeps the owner's skin; the roster says whose), drop it; their own guns none ──
{ const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 1 }, T0); const P = [{ name: 'Ann', pose: pose(0) }];
  arenaApply(g, { type: 'skin', weapon: 'ak', skin: { finish: 'tiger' } }, 'Ann', P, T0); arenaApply(g, { type: 'skin', weapon: 'smg', skin: { finish: 'hex' } }, 'Ann', P, T0); Object.assign(g.combat.d.round, { phase: 'live', freezeUntil: 0, endsAt: 4e15 });   // (bots move in a live round)
  const bot = g.arena.bots[0]; bot.weapon = 'smg'; bot.x = X + 30; bot.z = Z; bot.y = sp[2];
  g.arena.loadout.ann = { primary: 'ak', secondary: 'pistol', nades: [] }; arenaApply(g, { type: 'drop', slot: 'primary' }, 'Ann', [], T0 + 1); const it = g.combat.ground.find(x => x.item === 'ak'); it.x = bot.x; it.z = bot.z; it.y = sp[2]; it.at = T0 - 1e4; delete it.fly;
  ok('a bot\'s own gun: no skin', fin(g, bot.name, 'smg', botRoster(g)[0].pose.own) === null);
  arenaTick(g, [], .05, T0 + 2000);
  const r = botRoster(g)[0];
  ok('a bot picks up Ann\'s AK: the roster names her, everyone draws her skin on it', bot.weapon === 'ak' && r.pose.own === 'ann' && fin(g, bot.name, 'ak', r.pose.own) === 'tiger', JSON.stringify({ w: bot.weapon, own: r.pose.own }));
  const sm = g.combat.ground.find(x => x.item === 'smg'); ok('the bot\'s own SMG it dropped for it: no owner (no skin)', sm && !sm.own && groundSkin(g.arena, sm) === null);
  ok('a bot carrying its own gun: no own in the roster', (() => { bot.own = null; return botRoster(g)[0].pose.own === undefined; })());
  bot.own = { w: 'ak', k: 'ann' }; g.combat.d = null;
  // (a Defuse death drop of a bot carrying her gun)
  const g2 = { levels: {} }; startArena(g2, { map: 'dust2', kind: 'defuse', bots: 1 }, T0); const b2 = g2.arena.bots[0]; b2.weapon = 'ak'; b2.own = { w: 'ak', k: 'ann' }; b2.x = X; b2.z = Z; b2.y = sp[2];
  g2.arena.skins = { ann: { ak: { finish: 'tiger', fb: 'tiger', wear: 0, seed: 1, stickers: [], name: '', st: false, kills: 0 } } }; g2.combat.d.teams[b2.name.toLowerCase()] = 't';
  hurt(g2, 'Ann', b2.name, weaponById('m4'), 300, 'head', T0 + 10); arenaTick(g2, [], .05, T0 + 20);
  const it2 = g2.combat.ground.find(x => x.item === 'ak'); ok('a bot dies with Ann\'s AK: it drops as hers', it2?.own === 'ann' && groundSkin(g2.arena, it2)?.finish === 'tiger', JSON.stringify(it2));
  // A player picks up a bot's own gun: no skin (its owner is no player)
  const g3 = { levels: {} }; startArena(g3, { map: 'dust2', kind: 'defuse', bots: 1 }, T0); const b3 = g3.arena.bots[0]; b3.weapon = 'sniper'; b3.x = X; b3.z = Z; b3.y = sp[2]; g3.combat.d.teams = { ann: 'ct', [b3.name.toLowerCase()]: 't' };
  g3.arena.skins = { ann: { sniper: { finish: 'asiimov', fb: 'asiimov', wear: 0, seed: 1, stickers: [], name: '', st: false, kills: 0 } } };
  hurt(g3, 'Ann', b3.name, weaponById('m4'), 300, 'head', T0 + 10); arenaTick(g3, [], .05, T0 + 20); const aw = g3.combat.ground.find(x => x.item === 'sniper');
  g3.arena.loadout.ann = { primary: null, secondary: 'usps', nades: [] }; arenaApply(g3, { type: 'pickup', id: aw.id }, 'Ann', [{ name: 'Ann', pose: { x: aw.x, y: (aw.y || 0) + EYE, z: aw.z } }], T0 + 3000);
  ok('Ann picks up a bot\'s AWP: no skin, not even hers', g3.arena.loadout.ann.primary === 'sniper' && fin(g3, 'Ann', 'sniper') === null && skinOwner(g3.arena, 'Ann', 'sniper') === null); }

// ── Refund: the gun you had comes back with its owner ──
{ const { g, P } = match(); g.arena.loadout.ann = { primary: 'ak', secondary: 'usps', nades: [], own: { primary: { w: 'ak', k: 'bo' } } };
  arenaApply(g, { type: 'buy', primary: 'famas', x: X, z: Z }, 'Ann', [], T0 + 1);
  const it = g.combat.ground.find(x => x.item === 'ak');
  ok('a buy drops Bo\'s AK Ann carried: as Bo\'s; the new FAMAS is hers', it?.own === 'bo' && fin(g, 'Ann', 'famas') === 'asiimov' && !g.arena.loadout.ann.own);
  arenaApply(g, { type: 'refund', item: 'famas' }, 'Ann', [], T0 + 2);
  ok('refunded: Bo\'s AK back in her hands, still Bo\'s skin', g.arena.loadout.ann.primary === 'ak' && fin(g, 'Ann', 'ak') === 'web' && skinOwner(g.arena, 'Ann', 'ak') === 'bo', JSON.stringify(g.arena.loadout.ann)); }

// ── A slot refilled any other way is the holder's again (the owner mark names the gun) ──
{ const { g } = match(); g.arena.loadout.ann = { primary: 'famas', secondary: 'usps', nades: [], own: { primary: { w: 'ak', k: 'bo' } } };
  ok('an owner mark for another gun is ignored (the slot holds her own FAMAS)', fin(g, 'Ann', 'famas') === 'asiimov'); }
ok('knives are always their carrier\'s', (() => { const { g } = match(); return skinOwner(g.arena, 'Bo', 'knife') === 'bo' && skinOwner(g.arena, 'Bo', 'karambit') === 'bo'; })());
console.log(`PASS: skin owners · ${n} checks (bought, dropped, picked up by an enemy with E or walking over it, swapped, dropped at death, carried and dropped by a bot, refunded: the owner's skin goes with the gun; bots' own guns none; StatTrak only in the owner's hands; the owner in the combat frame)`);
