// Shooting arena (host rules): deathmatch start, loadouts, bots (movement through walls never, shooting only with
// line of sight), CS2 damage, kills/deaths, respawn at the safest spawn, knives, match clock.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, botRoster, PRIMARIES, MAX_BOTS } from '../dist/arena-logic.js';
import { combatApply, combatTick, hpOf, isDown, arenaArsenalOf } from '../dist/combat-logic.js';
import { ARENA_MAPS, mapBoxes, walkable, lineOfSight } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { MAX_HP } from '../dist/weapons-data.js';
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
const start = game.arena.bots.map(b => [b.x, b.z]);
for (let i = 0; i < 1200; i++) { now += 50; arenaTick(game, [], .05, now); combatTick(game, now); for (const b of game.arena.bots) if (!isDown(game, b.name, now)) assert(walkable(boxes, bounds, b.x, b.z, 1.2), b.name + ' inside a wall at ' + b.x.toFixed(1) + ',' + b.z.toFixed(1)); }
assert(game.arena.bots.some((b, i) => Math.hypot(b.x - start[i][0], b.z - start[i][1]) > 20), 'bots move around');
assert(Object.values(game.combat.kills).reduce((a, b) => a + b, 0) > 0, 'bots fight each other in deathmatch');
assert(game.combat.feed.length > 0 && game.combat.feed[0].wid, 'kill feed with weapon');
// Line of sight: a wall between two points blocks; open ground does not.
assert.equal(lineOfSight(boxes, ARENA.cx - 110, ARENA.cz, ARENA.cx + 110, ARENA.cz), false, 'the warehouse blocks');
assert.equal(lineOfSight(boxes, ARENA.cx - 110, ARENA.cz - 110, ARENA.cx - 110, ARENA.cz - 95), true);
// A player hits a bot: CS2 damage, host-checked.
const g2 = { levels: {} }; now += 1000; startArena(g2, { map: 'yard', bots: 1 }, now); const bot = g2.arena.bots[0];
arenaApply(g2, { type: 'loadout', primary: 'ak' }, 'Sam');
const players = [{ id: 'p1', name: 'Sam', pose: { x: bot.x + 20, y: 9.7, z: bot.z } }, ...botRoster(g2)];
const r = combatApply(g2, { type: 'hit', target: bot.id, weapon: 'ak', zone: 'chest' }, 'Sam', players, 'p1', now + 10); assert.equal(r.hp, MAX_HP - 36);
assert.throws(() => combatApply(g2, { type: 'hit', target: bot.id, weapon: 'sniper' }, 'Sam', players, 'p1', now + 2000), /own/);
const k = combatApply(g2, { type: 'hit', target: bot.id, weapon: 'knife', zone: 'chest' }, 'Sam', [{ ...players[0], pose: { x: bot.x + 3, y: 9.7, z: bot.z } }, players[1]], 'p1', now + 3000); assert.equal(k.dmg, 40, 'knife');
assert.throws(() => combatApply(g2, { type: 'hit', target: bot.id, weapon: 'knife' }, 'Sam', players, 'p1', now + 4000), /range/);
// Kill → respawn after 2.5 s with full HP; a dead player gets a spawn order.
const kill = combatApply(g2, { type: 'hit', target: bot.id, weapon: 'ak', zone: 'head' }, 'Sam', players, 'p1', now + 5000); assert(kill.down); assert.equal(g2.combat.kills.sam, 1);
combatTick(g2, now + 5000 + 2600); assert.equal(hpOf(g2, bot.name), MAX_HP); arenaTick(g2, players, .05, now + 7700); assert(!isDown(g2, bot.name, now + 7700));
g2.combat.down.sam = { until: now + 8000 }; combatTick(g2, now + 8100); arenaTick(g2, players, .05, now + 8150); assert(Number.isInteger(g2.combat.spawnTo.sam?.i), 'spawn order for the player');
// Match clock: over after 10 minutes, then a new match on the same map.
arenaTick(g2, players, .05, g2.arena.endsAt + 1); assert(g2.arena.over); arenaTick(g2, players, .05, g2.arena.endsAt + 13000); assert(!g2.arena.over);
console.log('PASS: arena logic · deathmatch, loadouts (' + PRIMARIES.length + ' primaries), knives + Darja karambit, bots (move without clipping, LOS, fight), CS2 damage on bots, respawn + spawn orders, match clock');
