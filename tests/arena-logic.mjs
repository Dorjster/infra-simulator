// Shooting arena (host rules): deathmatch start, loadouts, bots (movement through walls never, shooting only with
// line of sight), CS2 damage, kills/deaths, respawn at the safest spawn, knives, match clock.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, botRoster, PRIMARIES, MAX_BOTS } from '../dist/arena-logic.js';
import { combatApply, combatTick, hpOf, isDown, arenaArsenalOf, knifeCheck } from '../dist/combat-logic.js';
import { ARENA_MAPS, mapBoxes, walkable, lineOfSight, segmentClear } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { MAX_HP, KNIFE } from '../dist/weapons-data.js';
// Deterministic: bots, spawns and hits use Math.random — seed it so the test never flakes.
let seed = 12345; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const game = { levels: {} }; let now = 1e9;
startArena(game, { map: 'yard', bots: 2 }, now);
assert.equal(game.mode, 'arena'); assert.equal(game.payday, false); assert.equal(game.arena.bots.length, 2);
assert.equal(botRoster(game).length, 2); assert(botRoster(game).every(b => b.bot && b.pose.gun));
// Loadouts: any primary + a pistol; knives by name.
assert.match(arenaApply(game, { type: 'loadout', primary: 'ak', secondary: 'deagle' }, 'Sam'), /AK-47 \+ Desert Eagle/);
assert.throws(() => arenaApply(game, { type: 'loadout', primary: 'rpg' }, 'Sam'), /Choose a weapon/);
assert.deepEqual(arenaArsenalOf(game, 'Sam'), ['ak', 'deagle', 'knife']); assert.deepEqual(arenaArsenalOf(game, 'Darja'), ['pistol', 'karambit'], 'Darja carries the ruby karambit');
// Bots: add up to the limit, remove.
assert.match(arenaApply(game, { type: 'add-bot', count: 3 }, 'Sam'), /Added 3 bots/); assert.equal(game.arena.bots.length, 5);
arenaApply(game, { type: 'remove-bot' }, 'Sam'); assert.equal(game.arena.bots.length, 4);
arenaApply(game, { type: 'add-bot', count: 20 }, 'Sam'); assert.equal(game.arena.bots.length, MAX_BOTS);
// Movement: 60 s of simulated bot time, never inside a wall or crate.
const map = ARENA_MAPS.yard, boxes = mapBoxes(map, ARENA.cx, ARENA.cz), bounds = { minX: ARENA.cx - 130, maxX: ARENA.cx + 130, minZ: ARENA.cz - 130, maxZ: ARENA.cz + 130 };
const start = game.arena.bots.map(b => [b.x, b.z]), far = start.map(() => 0);   // farthest each bot got (they may respawn back at the start)
for (let i = 0; i < 1200; i++) { now += 50; arenaTick(game, [], .05, now); combatTick(game, now); game.arena.bots.forEach((b, j) => { far[j] = Math.max(far[j], Math.hypot(b.x - start[j][0], b.z - start[j][1])); }); for (const b of game.arena.bots) if (!isDown(game, b.name, now)) assert(walkable(boxes, bounds, b.x, b.z, 1.2), b.name + ' inside a wall at ' + b.x.toFixed(1) + ',' + b.z.toFixed(1)); }
assert(far.some(d => d > 20), 'bots move around');
assert(Object.values(game.combat.kills).reduce((a, b) => a + b, 0) > 0, 'bots fight each other in deathmatch');
assert(game.combat.feed.length > 0 && game.combat.feed[0].wid, 'kill feed with weapon');
// Line of sight: a wall between two points blocks; open ground does not.
assert.equal(lineOfSight(boxes, ARENA.cx - 110, ARENA.cz, ARENA.cx + 110, ARENA.cz), false, 'the warehouse blocks');
assert.equal(lineOfSight(boxes, ARENA.cx - 110, ARENA.cz - 110, ARENA.cx - 110, ARENA.cz - 95), true);
// A player hits a bot: CS2 damage, host-checked.
const g2 = { levels: {} }; now += 1000; startArena(g2, { map: 'yard', bots: 1 }, now); const bot = g2.arena.bots[0];
arenaApply(g2, { type: 'loadout', primary: 'ak' }, 'Sam');
// A spot 20 units from the bot with a clear line of fire (the host refuses hits through walls).
const clearSpot = (() => { for (let a = 0; a < 6.3; a += .2) { const x = bot.x + Math.cos(a) * 20, z = bot.z + Math.sin(a) * 20; if (walkable(boxes, bounds, x, z) && segmentClear(boxes, x, 9.7, z, bot.x, 7, bot.z)) return { x, z }; } throw Error('no clear spot'); })();
const players = [{ id: 'p1', name: 'Sam', pose: { x: clearSpot.x, y: 9.7, z: clearSpot.z } }, ...botRoster(g2)];
const r = combatApply(g2, { type: 'hit', target: bot.id, weapon: 'ak', zone: 'chest' }, 'Sam', players, 'p1', now + 10); assert.equal(r.hp, MAX_HP - 36);
assert.throws(() => combatApply(g2, { type: 'hit', target: bot.id, weapon: 'sniper' }, 'Sam', players, 'p1', now + 2000), /own/);
const kpos = { x: bot.x + (clearSpot.x - bot.x) * .15, y: 9.7, z: bot.z + (clearSpot.z - bot.z) * .15, yaw: Math.atan2(-(bot.x - clearSpot.x), -(bot.z - clearSpot.z)) }, bp = players.find(p => p.id === bot.id);
const k = combatApply(g2, { type: 'hit', target: bot.id, weapon: 'knife', zone: 'chest' }, 'Sam', [{ ...players[0], pose: kpos }, { ...bp, pose: { ...bp.pose, yaw: kpos.yaw + Math.PI } }], 'p1', now + 3000); assert.equal(k.dmg, 40, 'knife: light slash from the front');
// CS2's knife: reach 64 / 48 units (plus its hull), a backstab within 61.6° of the victim's back (dot > 0.475), the
// slash 2.5× as quick as the stab, damage 40 / 25 / 90 and 65 / 180.
{ const HUu = 2.54 / 16.5, at = (x, z, yaw = 0) => ({ x, z, yaw }), deg = Math.PI / 180;
  assert(Math.abs(KNIFE.light.range / HUu - 64) < .01 && Math.abs(KNIFE.heavy.range / HUu - 48) < .01 && KNIFE.light.rateMs === 400 && KNIFE.heavy.rateMs === 1000 && KNIFE.light.hitMs === 0, 'knife: CS2 reach (64 / 48), speed (0.4 s / 1.0 s), the hit at the click');
  assert.deepEqual([KNIFE.light.front, KNIFE.light.chain, KNIFE.light.back, KNIFE.heavy.front, KNIFE.heavy.back], [40, 25, 90, 65, 180], 'knife: CS2 damage');
  const from = a => at(6 * Math.sin(a * deg), 6 * Math.cos(a * deg), a * deg);   // 6 units from a victim at the origin facing −z, a° round from straight behind it, facing it
  assert(knifeCheck(from(0), at(0, 0), 'light').back && knifeCheck(from(60), at(0, 0), 'light').back && !knifeCheck(from(65), at(0, 0), 'light').back && !knifeCheck(from(180), at(0, 0), 'light').back, 'knife: a backstab only from within 61.6° of the back');
  const far = d => at(0, d, 0); assert(knifeCheck(far(14.5), at(0, 0), 'light').reach && !knifeCheck(far(14.5), at(0, 0), 'heavy').reach && !knifeCheck(far(17), at(0, 0), 'light').reach, 'knife: the slash reaches further than the stab'); }
{ const g5 = { levels: {} }; startArena(g5, { map: 'yard', bots: 1 }, now); const b5 = g5.arena.bots[0], bp5 = botRoster(g5).find(p => p.id === b5.id), a5 = { x: b5.x + (clearSpot.x - bot.x) * .15, y: 9.7, z: b5.z + (clearSpot.z - bot.z) * .15, yaw: kpos.yaw }, pl5 = [{ id: 'p1', name: 'Sam', pose: a5 }, { ...bp5, pose: { ...bp5.pose, yaw: kpos.yaw + Math.PI } }];
  const slash = t => { try { return combatApply(g5, { type: 'hit', target: b5.id, weapon: 'knife', zone: 'chest' }, 'Sam', pl5, 'p1', t); } catch (e) { return { error: e.message }; } };
  const s1 = slash(now + 100), s2 = slash(now + 420), s3 = slash(now + 2000);
  assert(s1.dmg === 40 && s2.dmg === 25 && s3.dmg === Math.min(40, MAX_HP - 65), 'knife: a slash right after another is the weaker follow-up (CS2: 25); after a pause, 40 again · ' + JSON.stringify([s1.dmg ?? s1.error, s2.dmg ?? s2.error, s3.dmg ?? s3.error])); }
assert.throws(() => combatApply(g2, { type: 'hit', target: bot.id, weapon: 'knife' }, 'Sam', players, 'p1', now + 4000), /reach/);
// Kill → respawn after 2.5 s with full HP; a dead player gets a spawn order.
const kill = combatApply(g2, { type: 'hit', target: bot.id, weapon: 'ak', zone: 'head' }, 'Sam', players, 'p1', now + 5000); assert(kill.down); assert.equal(g2.combat.kills.sam, 1);
combatTick(g2, now + 5000 + 2600); assert.equal(hpOf(g2, bot.name), MAX_HP); arenaTick(g2, players, .05, now + 7700); assert(!isDown(g2, bot.name, now + 7700));
g2.combat.down.sam = { until: now + 8000 }; combatTick(g2, now + 8100); arenaTick(g2, players, .05, now + 8150); assert(Number.isFinite(g2.combat.spawnTo.sam?.x) && g2.combat.spawnTo.sam.at === now + 8100, 'spawn order (an exact spot) for the respawned player');
// Match clock: over after 10 minutes, then a new match on the same map.
arenaTick(g2, players, .05, g2.arena.endsAt + 1); assert(g2.arena.over); arenaTick(g2, players, .05, g2.arena.endsAt + 13000); assert(!g2.arena.over);
// Dropped weapons: G drops, auto pickup into an empty slot, E swaps, the dead drop their gun, bots upgrade, expiry.
{ const g3 = { levels: {} }, t = 2e9; startArena(g3, { map: 'yard', bots: 0 }, t); const cx = ARENA.cx, cz = ARENA.cz + 100;
  const pl = [{ name: 'Ann', pose: { x: cx, y: 9.7, z: cz, yaw: 0 } }, { name: 'Bo', pose: { x: cx + 40, y: 9.7, z: cz, yaw: 0 } }];
  arenaApply(g3, { type: 'loadout', primary: 'ak' }, 'Ann', pl, t);
  assert.match(arenaApply(g3, { type: 'drop', slot: 'primary' }, 'Ann', pl, t), /Dropped AK-47/); assert.deepEqual(arenaArsenalOf(g3, 'Ann'), ['pistol', 'knife']);
  const it = g3.combat.ground[0]; assert.equal(it.item, 'ak'); assert(it.z < cz - 6 && it.z > cz - 40 && Math.abs(it.x - cx) < 1 && it.fly?.ms > 0, 'tossed ahead where you face (1–6 m), as CS2 throws it: ' + (cz - it.z).toFixed(1));
  assert.throws(() => arenaApply(g3, { type: 'pickup', id: it.id }, 'Bo', pl, t), /Too far/);
  pl[1].pose.x = cx; pl[1].pose.z = cz - 5; assert.match(arenaApply(g3, { type: 'pickup', id: it.id }, 'Bo', pl, t), /Picked up AK-47/); assert.equal(g3.arena.loadout.bo.primary, 'ak'); assert.equal(g3.combat.ground.length, 0);
  assert.throws(() => arenaApply(g3, { type: 'pickup', id: it.id }, 'Ann', pl, t), /Already taken/);
  arenaApply(g3, { type: 'drop', slot: 'secondary' }, 'Ann', pl, t); assert.deepEqual(arenaArsenalOf(g3, 'Ann'), ['knife'], 'pistol dropped: knife only');
  arenaApply(g3, { type: 'loadout', primary: 'm4' }, 'Ann', pl, t); const pistolOnGround = g3.combat.ground.find(x => x.item === 'pistol');
  arenaApply(g3, { type: 'drop', slot: 'primary' }, 'Bo', pl, t); const ak = g3.combat.ground.find(x => x.item === 'ak');
  pl[0].pose.z = ak.z; pl[0].pose.x = ak.x; assert.throws(() => arenaApply(g3, { type: 'pickup', id: ak.id }, 'Ann', pl, t), /E to swap/, 'slot taken without swap');
  assert.match(arenaApply(g3, { type: 'pickup', id: ak.id, swap: true }, 'Ann', pl, t), /AK-47/); assert.equal(g3.arena.loadout.ann.primary, 'ak'); assert(g3.combat.ground.some(x => x.item === 'm4'), 'swap leaves the M4');
  assert.match(arenaApply(g3, { type: 'pickup', id: pistolOnGround.id }, 'Ann', pl, t), /Glock-18/); assert.deepEqual(arenaArsenalOf(g3, 'Ann'), ['ak', 'pistol', 'knife']);
  assert.throws(() => arenaApply(g3, { type: 'drop', slot: 'primary' }, 'Nobody', pl, t), /Nothing to drop/);
  // Deathmatch: you respawn with your loadout, so nothing drops (no copies of guns). Defuse drops: arena-defuse test.
  const n0 = g3.combat.ground.length; g3.combat.down.ann = { until: t + 2500 }; arenaTick(g3, pl, .05, t + 10); arenaTick(g3, pl, .05, t + 60);
  assert.equal(g3.combat.ground.length, n0, 'no duplicate gun on a deathmatch death'); assert.equal(g3.arena.loadout.ann.primary, 'ak');
  // Bots take a better gun they walk over.
  arenaApply(g3, { type: 'add-bot' }, 'Ann', pl, t); const bot = g3.arena.bots[0]; bot.weapon = 'smg'; g3.combat.ground.push({ id: 'gx', item: 'sniper', x: bot.x, z: bot.z, y: 0, yaw: 0, at: t });
  pl.length = 0; delete g3.combat.down.ann; arenaTick(g3, pl, .05, t + 100); assert.equal(bot.weapon, 'sniper'); assert(g3.combat.ground.some(x => x.item === 'smg'), 'bot left its SMG');
  arenaTick(g3, pl, .05, t + 100 + 61000); assert.equal(g3.combat.ground.length, 0, 'items vanish after a minute'); }
console.log('PASS: arena logic · drops + pickups · deathmatch, loadouts (' + PRIMARIES.length + ' primaries), knives + Darja karambit, bots (move without clipping, LOS, fight), CS2 damage on bots, respawn + spawn orders, match clock');
