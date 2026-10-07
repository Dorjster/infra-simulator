// Global Defensive grenades (host rules): buy limits (4 in all, 2 flashbangs, one of the others), throw uses one up,
// flight with gravity and bounces, HE damage with distance and cover, flashbang blinds bots and depends on where
// you look, smoke blocks sight (bots too), molotov burns whoever stands in it, then everything clears; drops.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, slotOf } from '../dist/arena-logic.js';
import { NADES, flashAmount, clearView, nadesTick } from '../dist/arena-nades.js';
import { hpOf, isDown, arenaArsenalOf } from '../dist/combat-logic.js';
import { ARENA } from '../dist/facility-layout.js';
import { MAX_HP } from '../dist/weapons-data.js';
let seed = 7; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const g = { levels: {} }; let t = 5e9; startArena(g, { map: 'yard', bots: 0 }, t);
const cx = ARENA.cx, cz = ARENA.cz + 102;   // the open lane between the containers and the south wall
const P = (name, x, z) => ({ name, pose: { x, y: 9.7, z, yaw: 0 } });
// Buying: one of each, two flashbangs, four in all.
for (const k of ['he', 'flash', 'smoke', 'molotov']) assert.match(arenaApply(g, { type: 'buy-nade', kind: k }, 'Ann'), /Bought/);
assert.throws(() => arenaApply(g, { type: 'buy-nade', kind: 'flash' }, 'Ann'), /four grenades/);
const g2 = { levels: {} }; startArena(g2, { map: 'yard', bots: 0 }, t); arenaApply(g2, { type: 'buy-nade', kind: 'flash' }, 'Bo'); arenaApply(g2, { type: 'buy-nade', kind: 'flash' }, 'Bo');
assert.throws(() => arenaApply(g2, { type: 'buy-nade', kind: 'flash' }, 'Bo'), /Two flashbangs/); arenaApply(g2, { type: 'buy-nade', kind: 'he' }, 'Bo'); assert.throws(() => arenaApply(g2, { type: 'buy-nade', kind: 'he' }, 'Bo'), /already have/);
assert.deepEqual(arenaArsenalOf(g, 'Ann').slice(-4), ['he', 'flash', 'smoke', 'molotov'], 'grenades are in the arsenal (slot 4)');
assert.equal(slotOf('molotov'), 'nades');
// HE thrown along the lane: flies, lands, explodes after 1.6 s; Bo (near) is hurt, Cy behind the containers is not.
const world = { boxes: [], bounds: null }; const tickAll = (players, ms) => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, players, .05, t); } };
let players = [P('Ann', cx - 40, cz), P('Bo', cx - 10, cz), P('Cy', cx - 10, cz - 60)];
assert.match(arenaApply(g, { type: 'throw', kind: 'he', x: cx - 16, y: 9.7, z: cz, dx: .3, dy: -1, dz: 0 }, 'Ann', players, t), /Threw/);   // tossed down at Bo's feet
assert(!arenaArsenalOf(g, 'Ann').includes('he'), 'the HE is used up'); assert.equal(g.combat.nades.length, 1);
tickAll(players, 300); const fly = g.combat.nades[0]; assert(fly.phase === 'air' && fly.x > cx - 16, 'in flight');
tickAll(players, 1400); assert.equal(g.combat.nades[0]?.phase, 'boom');
assert(hpOf(g, 'Bo') < MAX_HP, 'Bo near the blast is hurt: ' + hpOf(g, 'Bo')); assert.equal(hpOf(g, 'Cy'), MAX_HP, 'Cy behind the containers is not');
assert.throws(() => arenaApply(g, { type: 'throw', kind: 'he', x: cx, y: 9.7, z: cz, dx: 1, dy: 0, dz: 0 }, 'Ann', players, t), /no HE/);
tickAll(players, 1300); assert(!g.combat.nades.some(n => n.phase === 'boom'), 'explosion cleared');
// Smoke: blocks sight across the lane (bots use the same check), then clears after 18 s.
assert(clearView(g, [], cx - 30, cz, cx + 30, cz), 'clear before the smoke');
arenaApply(g, { type: 'throw', kind: 'smoke', x: cx, y: 9.7, z: cz, dx: 0, dy: -1, dz: 0 }, 'Ann', players, t); tickAll(players, 3200);
assert.equal(g.combat.nades.find(n => n.kind === 'smoke')?.phase, 'smoke'); assert(!clearView(g, [], cx - 30, cz, cx + 30, cz), 'cannot see through the smoke');
tickAll(players, 18200); assert(clearView(g, [], cx - 30, cz, cx + 30, cz), 'smoke gone after 18 s');
// Molotov: fire where it lands; Dee standing in it burns; it goes out after 7 s.
players = [P('Ann', cx - 40, cz), P('Dee', cx - 20, cz)];
arenaApply(g, { type: 'throw', kind: 'molotov', x: cx - 20, y: 9.7, z: cz, dx: 0, dy: -1, dz: 0 }, 'Ann', players, t); tickAll(players, 600);
const fire = g.combat.nades.find(n => n.kind === 'molotov'); assert.equal(fire?.phase, 'fire'); const hp0 = hpOf(g, 'Dee'); tickAll(players, 1000); assert(hpOf(g, 'Dee') <= hp0 - 30, 'about 40 HP a second in the fire: ' + hpOf(g, 'Dee'));
tickAll(players, 7000); assert(!g.combat.nades.some(n => n.kind === 'molotov'), 'fire out');
// Flashbang: blinds a bot that sees it; for players it depends on where they look.
arenaApply(g, { type: 'add-bot' }, 'Ann', [], t); const bot = g.arena.bots[0]; bot.x = cx; bot.z = cz;
arenaApply(g, { type: 'throw', kind: 'flash', x: cx + 10, y: 9.7, z: cz, dx: 0, dy: -1, dz: 0 }, 'Ann', [], t); for (let i = 0; i < 34; i++) { t += 50; nadesTick(g, [], .05, t, {}); }
assert((bot.blindUntil || 0) > t, 'bot blinded');
const look = flashAmount([], 10, 9, 0, 0, 9, 0, 1, 0, 0), away = flashAmount([], 10, 9, 0, 0, 9, 0, -1, 0, 0), far = flashAmount([], 10, 9, 0, 0, 9, 400, 1, 0, 0);
assert(look > .8 && away < look / 3 && far === 0, `facing ${look.toFixed(2)} · away ${away.toFixed(2)} · far ${far}`);
// Grenades drop and are picked up like guns.
const g3 = { levels: {} }; startArena(g3, { map: 'yard', bots: 0 }, t); arenaApply(g3, { type: 'buy-nade', kind: 'smoke' }, 'Ann');
const pl = [P('Ann', cx, cz), P('Bo', cx, cz - 6)]; assert.match(arenaApply(g3, { type: 'drop', slot: 'nades', kind: 'smoke' }, 'Ann', pl, t), /Dropped Smoke/);
assert.match(arenaApply(g3, { type: 'pickup', id: g3.combat.ground[0].id }, 'Bo', pl, t), /Picked up Smoke/); assert(arenaArsenalOf(g3, 'Bo').includes('smoke'));
console.log('PASS: grenades · buy limits, throw + flight, HE damage + cover, smoke blocks sight 18 s, molotov burns 7 s, flashbang (bots + facing), drop / pickup');
