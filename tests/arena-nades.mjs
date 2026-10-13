// Global Defensive grenades (host rules): buy limits (4 in all, 2 flashbangs, one of the others), throw uses one up,
// flight with gravity and bounces, HE damage with distance and cover, flashbang blinds bots and depends on where
// you look, smoke blocks sight (bots too), molotov burns whoever stands in it, then everything clears; drops.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, slotOf } from '../dist/arena-logic.js';
import { NADES, flashAmount, clearView, nadesTick, predictThrow, stepNade, fireCells, launch, smokeBlocks, smokeDensity, SMOKE } from '../dist/arena-nades.js';
import { ARENA_MAPS, mapBoxes } from '../dist/arena-maps.js';
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
assert.match(arenaApply(g, { type: 'throw', kind: 'he', x: cx - 16, y: 9.7, z: cz, dx: .3, dy: -1, dz: 0, strength: 'short' }, 'Ann', players, t), /Threw/);   // tossed down at Bo's feet
assert(!arenaArsenalOf(g, 'Ann').includes('he'), 'the HE is used up'); assert.equal(g.combat.nades.length, 1);
tickAll(players, 300); const fly = g.combat.nades[0]; assert(fly.phase === 'air' && fly.x > cx - 16, 'in flight');
tickAll(players, 1600); assert.equal(g.combat.nades[0]?.phase, 'boom');
assert(hpOf(g, 'Bo') < MAX_HP, 'Bo near the blast is hurt: ' + hpOf(g, 'Bo')); assert.equal(hpOf(g, 'Cy'), MAX_HP, 'Cy behind the containers is not');
assert.throws(() => arenaApply(g, { type: 'throw', kind: 'he', x: cx, y: 9.7, z: cz, dx: 1, dy: 0, dz: 0 }, 'Ann', players, t), /no HE/);
tickAll(players, 1300); assert(!g.combat.nades.some(n => n.phase === 'boom'), 'explosion cleared');
// Smoke: blocks sight across the lane (bots use the same check), then clears after 18 s.
assert(clearView(g, [], cx - 30, cz, cx + 30, cz), 'clear before the smoke');
arenaApply(g, { type: 'throw', kind: 'smoke', x: cx, y: 9.7, z: cz, dx: 0, dy: -1, dz: 0, strength: 'short' }, 'Ann', players, t); tickAll(players, 3200);
assert.equal(g.combat.nades.find(n => n.kind === 'smoke')?.phase, 'smoke'); assert(!clearView(g, [], cx - 30, cz, cx + 30, cz), 'cannot see through the smoke');
tickAll(players, 18200); assert(clearView(g, [], cx - 30, cz, cx + 30, cz), 'smoke gone after 18 s');
// Molotov: fire where it lands; Dee standing in it burns; it goes out after 7 s.
players = [P('Ann', cx - 90, cz), P('Dee', cx - 20, cz)];   // Ann well clear of her own fire
arenaApply(g, { type: 'throw', kind: 'molotov', x: cx - 20, y: 9.7, z: cz, dx: 0, dy: -1, dz: 0, strength: 'short' }, 'Ann', players, t); tickAll(players, 600);
const fire = g.combat.nades.find(n => n.kind === 'molotov'); assert.equal(fire?.phase, 'fire'); const hp0 = hpOf(g, 'Dee'); tickAll(players, 1000); assert(hpOf(g, 'Dee') <= hp0 - 30, 'about 40 HP a second in the fire: ' + hpOf(g, 'Dee'));
tickAll(players, 7000); assert(!g.combat.nades.some(n => n.kind === 'molotov'), 'fire out');
// Flashbang: blinds a bot that sees it; for players it depends on where they look.
arenaApply(g, { type: 'add-bot' }, 'Ann', [], t); const bot = g.arena.bots[0]; bot.x = cx; bot.z = cz;
arenaApply(g, { type: 'throw', kind: 'flash', x: cx + 10, y: 9.7, z: cz, dx: 0, dy: -1, dz: 0, strength: 'short' }, 'Ann', [], t); for (let i = 0; i < 34; i++) { t += 50; nadesTick(g, [], .05, t, {}); }
assert((bot.blindUntil || 0) > t, 'bot blinded');
const look = flashAmount([], 10, 9, 0, 0, 9, 0, 1, 0, 0), away = flashAmount([], 10, 9, 0, 0, 9, 0, -1, 0, 0), far = flashAmount([], 10, 9, 0, 0, 9, 400, 1, 0, 0);
assert(look > .8 && away < look / 3 && far === 0, `facing ${look.toFixed(2)} · away ${away.toFixed(2)} · far ${far}`);
// Grenades drop and are picked up like guns.
const g3 = { levels: {} }; startArena(g3, { map: 'yard', bots: 0 }, t); arenaApply(g3, { type: 'buy-nade', kind: 'smoke' }, 'Ann');
const pl = [P('Ann', cx, cz), P('Bo', cx, cz - 6)]; assert.match(arenaApply(g3, { type: 'drop', slot: 'nades', kind: 'smoke' }, 'Ann', pl, t), /Dropped Smoke/);
assert.match(arenaApply(g3, { type: 'pickup', id: g3.combat.ground[0].id }, 'Bo', pl, t), /Picked up Smoke/); assert(arenaArsenalOf(g3, 'Bo').includes('smoke'));
// Throw strengths: full ≫ medium ≫ short; the client's preview is exactly the host's flight.
{ const dist = strength => { const pts = predictThrow('smoke', { x: 0, y: 9.7, z: 0, dx: 0, dy: .3, dz: -1, strength }); const e = pts.at(-1); return Math.hypot(e[0], e[2]); };
  const L = dist('long'), M = dist('medium'), S = dist('short'); assert(L > 250 && M < L * .75 && S < M * .6 && S > 15, `full ${L | 0} · medium ${M | 0} · short ${S | 0}`);
  const gq = { kind: 'he', x: 0, y: 9.7, z: 0, ...launch({ dx: 0, dy: .2, dz: -1, strength: 'long' }), still: 0 }, pred = predictThrow('he', { x: 0, y: 9.7, z: 0, dx: 0, dy: .2, dz: -1, strength: 'long' });
  for (let i = 1; i < pred.length; i++) { stepNade(gq, [], null, .05); assert(Math.hypot(gq.x - pred[i][0], gq.y - pred[i][1], gq.z - pred[i][2]) < 1e-9, 'preview = host flight'); } }
// Fire: about 4× the old area in the open; never through a wall; only on the floor it landed on.
{ const open = fireCells([], 0, 0, 0), oldArea = Math.PI * (120 * 2.54 / 16.5) ** 2; assert(open.length * 9 > oldArea * 3.3, 'fire covers ~4× the old area: ' + (open.length * 9 / oldArea).toFixed(1) + '×');
  const wall = [{ minX: 8, maxX: 10, minZ: -60, maxZ: 60, y0: 0, y1: 24 }], cells = fireCells(wall, 0, 0, 0); assert(cells.length && cells.every(([x]) => x < 8), 'the fire stops at a wall');
  const crate = [{ minX: -6, maxX: 6, minZ: -6, maxZ: 6, y0: 0, y1: 6 }], top = fireCells(crate, 0, 0, 6); assert(top.length && top.every(([x, z]) => Math.abs(x) < 6.1 && Math.abs(z) < 6.1), 'fire on a crate stays on the crate'); }
assert(NADES.smoke.radius ** 2 >= (144 * 2.54 / 16.5) ** 2 * 3.9, 'smoke covers ~4× the old area');
// No throwing in the freeze time (Defuse).
{ const gd = { levels: {} }; startArena(gd, { map: 'dune', kind: 'defuse', bots: 0 }, 9e9); const sp = ARENA_MAPS.dune.t[0], ann = [{ name: 'Ann', pose: { x: ARENA.cx + sp[0], y: 9.7, z: ARENA.cz + sp[1], yaw: 0 } }]; arenaTick(gd, ann, .05, 9e9); arenaApply(gd, { type: 'buy-nade', kind: 'he' }, 'Ann', ann, 9e9);
  assert.throws(() => arenaApply(gd, { type: 'throw', kind: 'he', x: 0, y: 9.7, z: 0, dx: 0, dy: 0, dz: -1 }, 'Ann', ann, 9e9 + 10), /throw now/); assert(arenaArsenalOf(gd, 'Ann').includes('he'), 'and the grenade is kept'); }
// ── Smoke as a volume, HE holes, smoke vs fire (one shared state) ──
{ const T0 = 5e9, R = NADES.smoke.radius, sm = { id: 's1', kind: 'smoke', phase: 'smoke', x: 0, y: 0, z: 0, firedAt: T0 }, gs = { combat: { nades: [sm], clock: T0 + 4000 } }, now = T0 + 4000, eye = 9.7;
  assert(smokeBlocks(gs, -R - 30, eye, 0, R + 30, eye, 0, now), 'outside → outside through the cloud: blocked');
  assert(smokeBlocks(gs, -R - 30, eye, 0, 0, eye, 0, now), 'outside → someone in the middle: blocked');
  assert(smokeBlocks(gs, 0, eye, 0, -R - 30, eye, 0, now), 'from deep inside you cannot see out (the same rule both ways)');
  assert(!smokeBlocks(gs, -R * .93, eye, 0, -R - 40, eye, 0, now), 'at the very edge, looking out: you can see');
  assert(smokeDensity(gs, 0, eye, 0, now) > .9 && smokeDensity(gs, R + 5, eye, 0, now) === 0, 'dense in the core, nothing outside');
  assert(!smokeBlocks(gs, -R - 30, eye, 0, R + 30, eye, 0, T0 + NADES.smoke.lasts - 200), 'thin at the end of its life');
  // An HE blast in the smoke opens a hole for a moment, then it closes.
  const ge = { levels: {}, combat: { nades: [{ ...sm }, { id: 'h1', kind: 'he', phase: 'air', x: 0, y: 3, z: 0, vx: 0, vy: 0, vz: 0, at: T0 + 3000 - NADES.he.fuse - 10, still: 0 }], hp: {}, down: {} }, arena: { bots: [] } };
  nadesTick(ge, [], .05, T0 + 3000, {}); const s1 = ge.combat.nades.find(n => n.id === 's1');
  assert(s1.holes?.length === 1, 'the blast punched a hole in the smoke (shared state)');
  assert(!smokeBlocks(ge, -6, eye, 0, 6, eye, 0, T0 + 3300), 'right after: you can see through the hole');
  assert(smokeBlocks(ge, -R - 30, eye, 0, R + 30, eye, 0, T0 + 3000 + SMOKE.holeOpen + SMOKE.holeClose + 100), 'then the smoke closes again');
  // Smoke over a burning molotov puts it out; a molotov into smoke fizzles; nothing re-ignites.
  const gf = { levels: {}, combat: { nades: [{ id: 'f1', kind: 'molotov', phase: 'fire', x: 10, y: 0, z: 0, firedAt: T0, at: T0 }, { id: 's2', kind: 'smoke', phase: 'air', x: 0, y: 0.3, z: 0, vx: 0, vy: -1, vz: 0, at: T0 - 1000, still: 1 }], hp: {}, down: {} }, arena: { bots: [] } };
  for (let i = 0; i < 4; i++) nadesTick(gf, [], .05, T0 + 50 * i, {});
  assert(gf.combat.nades.find(n => n.id === 'f1')?.phase === 'out', 'smoke landing on the fire puts it out');
  for (let i = 0; i < 30; i++) nadesTick(gf, [], .05, T0 + 200 + 50 * i, {}); assert(!gf.combat.nades.some(n => n.id === 'f1' && n.phase === 'fire'), 'the fire never comes back');
  const gm = { levels: {}, combat: { nades: [{ id: 's3', kind: 'smoke', phase: 'smoke', x: 0, y: 0, z: 0, firedAt: T0 }, { id: 'm1', kind: 'molotov', phase: 'air', x: 5, y: 0.3, z: 0, vx: 0, vy: -3, vz: 0, at: T0, still: 0 }], hp: {}, down: {} }, arena: { bots: [] } };
  for (let i = 0; i < 6; i++) nadesTick(gm, [], .05, T0 + 2000 + 50 * i, {}); assert.notEqual(gm.combat.nades.find(n => n.id === 'm1')?.phase, 'fire', 'a molotov thrown into smoke fizzles'); }
console.log('PASS: grenades · throw strengths (full / medium / short), preview = host flight, fire 4× area within walls, smoke 4× area, no throws in the freeze,  · buy limits, throw + flight, HE damage + cover, smoke blocks sight 18 s (a volume: outside, edge, inside), HE opens a hole that closes, smoke puts out fire / molotov fizzles in smoke, molotov burns 7 s, flashbang (bots + facing), drop / pickup');
