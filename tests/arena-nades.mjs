// Global Defensive grenades (host rules): buy limits (4 in all, 2 flashbangs, one of the others), throw uses one up,
// flight with gravity and bounces, HE damage with distance and cover, flashbang blinds bots and depends on where
// you look, smoke blocks sight (bots too), molotov burns whoever stands in it, then everything clears; drops.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, slotOf } from '../dist/arena-logic.js';
import { NADES, flashAmount, clearView, nadesTick, predictThrow, stepNade, fireCells, launch, smokeBlocks, smokeDensity, SMOKE, throwStart, setSmokeSolids, holeRadius } from '../dist/arena-nades.js';
import { ARENA_MAPS, mapBoxes } from '../dist/arena-maps.js';
import { hpOf, isDown, arenaArsenalOf } from '../dist/combat-logic.js';
import { ARENA } from '../dist/facility-layout.js';
import { MAX_HP, weaponById } from '../dist/weapons-data.js';
import { tossFlight, flashBlind, stackFlash, flashWhite, FLASH, fireFlinch, burnTag, decoyShots, decoyBlip, DECOY, NADE_LOG, GAP_WHY, holdNades, canCarry, R as NADE_R } from '../dist/arena-nades.js';
import { buildNadeMesh } from '../tools/maps/nade-mesh.mjs';
import { createNadeMesh } from '../dist/nade-mesh.js';
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
tickAll(players, 2100);   // everyone in play past the deathmatch spawn protection
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
tickAll(players, 2100);   // Dee just joined: past her deathmatch spawn protection
arenaApply(g, { type: 'throw', kind: 'molotov', x: cx - 20, y: 9.7, z: cz, dx: 0, dy: -1, dz: 0, strength: 'short' }, 'Ann', players, t); tickAll(players, 600);
const fire = g.combat.nades.find(n => n.kind === 'molotov'); assert.equal(fire?.phase, 'fire'); const hp0 = hpOf(g, 'Dee'); tickAll(players, 1000); const hp1 = hpOf(g, 'Dee'); assert(hp1 <= hp0 - 12 && hp1 > hp0 - 40, 'CS2: the burn ramps up (1, 2, 3 … a hit): ' + hp0 + ' → ' + hp1);
tickAll(players, 1000); assert(hp1 - hpOf(g, 'Dee') >= 36, 'then 40 HP a second (8 a hit): ' + hp1 + ' → ' + hpOf(g, 'Dee'));
tickAll(players, 6000); assert(!g.combat.nades.some(n => n.kind === 'molotov'), 'fire out');
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
  // (CS2 on flat ground: a full throw flies ~1 150 u and its bounces, each keeping 45 % of the speed, add ~300: ~220 game units.)
  const L = dist('long'), M = dist('medium'), S = dist('short'); assert(L > 200 && M < L * .75 && S < M * .6 && S > 15, `full ${L | 0} · medium ${M | 0} · short ${S | 0}`);
  const gq = { kind: 'he', ...throwStart({ x: 0, y: 9.7, z: 0, dx: 0, dy: .2, dz: -1, strength: 'long' }), ...launch({ dx: 0, dy: .2, dz: -1, strength: 'long' }), still: 0 }, pred = predictThrow('he', { x: 0, y: 9.7, z: 0, dx: 0, dy: .2, dz: -1, strength: 'long' });
  for (let i = 1; i < pred.length; i++) { stepNade(gq, [], null, .05); assert(Math.hypot(gq.x - pred[i][0], gq.y - pred[i][1], gq.z - pred[i][2]) < 1e-9, 'preview = host flight'); } }
// CS2's throw (Source ThrowGrenade, kept by CS:GO and CS2): a level aim throws 10° up; looking down d° throws
// −10 + d·100/90 (so 45° down throws 40° down, straight down straight down); looking up u° throws −10 − u·80/90 (45° up
// throws 50° up, straight up straight up); it starts 22 units ahead of the eye, short of a wall in the way.
{ const HU = 2.54 / 16.5, ang = a => { const v = launch({ dx: Math.cos(a * Math.PI / 180), dy: Math.sin(a * Math.PI / 180), dz: 0, strength: 'long' }); return Math.atan2(v.vy, v.vx) * 180 / Math.PI; };
  assert(Math.abs(ang(0) - 10) < .01, 'level: 10° up · ' + ang(0)); assert(Math.abs(ang(-45) - (10 - 45 * 100 / 90)) < .01, 'down 45°: 40° down · ' + ang(-45)); assert(Math.abs(ang(45) - (10 + 45 * 80 / 90)) < .01, 'up 45°: 50° up · ' + ang(45)); assert(Math.abs(ang(-89.9) + 90) < .2 && Math.abs(ang(89.9) - 90) < .2, 'straight down / up throw straight down / up (Source) · ' + ang(-89.9) + ' / ' + ang(89.9));
  const st = throwStart({ x: 0, y: 9.7, z: 0, dx: 1, dy: 0, dz: 0, strength: 'long' }); assert(Math.abs(st.x - 22 * HU * Math.cos(Math.PI / 18)) < 1e-9 && Math.abs(st.y - (9.7 + 22 * HU * Math.sin(Math.PI / 18))) < 1e-9, 'starts 22 units ahead along the throw (10° up for a level aim, as Source traces it)');
  const wall = [{ minX: 2, maxX: 3, minZ: -5, maxZ: 5, y0: 0, y1: 20 }], sw = throwStart({ x: 0, y: 9.7, z: 0, dx: 1, dy: 0, dz: 0, strength: 'long' }, wall); assert(sw.x < 2 - .3, 'a wall 2 units ahead: it starts this side of it · ' + sw.x.toFixed(2));
  assert(NADES.he.fuse === 1500 && NADES.flash.fuse === 1500 && NADES.molotov.fuse === 2000, 'CS2 fuses: HE and flash 1.5 s, molotov 2 s in the air'); }
// A molotov that times out high in the air bursts there — no fire; one low over the floor sets the floor alight.
{ const T = 7e9, high = { levels: {}, combat: { nades: [{ id: 'm1', kind: 'molotov', phase: 'air', x: 0, y: 60, z: 0, vx: 0, vy: 0, vz: 0, at: T - 2100, still: 0 }], hp: {}, down: {} }, arena: { bots: [] } };
  nadesTick(high, [], .01, T, {}); assert(high.combat.nades[0].phase === 'out' && high.combat.nades[0].airburst, 'high in the air: an air burst, no fire');
  const low = { levels: {}, combat: { nades: [{ id: 'm2', kind: 'molotov', phase: 'air', x: 0, y: 6, z: 0, vx: 0, vy: 0, vz: 0, at: T - 2100, still: 0 }], hp: {}, down: {} }, arena: { bots: [] } };
  nadesTick(low, [], .01, T, {}); assert(low.combat.nades[0].phase === 'fire' && low.combat.nades[0].y === 0, 'low over the floor: the floor burns'); }
// A grenade into a glass pane (a map file's breakable): the pane breaks, the grenade loses its run and drops through.
{ const pane = { minX: 5, maxX: 5.3, minZ: -5, maxZ: 5, y0: 0, y1: 20, mat: 'glass', mover: 3, off: false }, bx = [pane]; bx.movers = [pane]; bx.nadeSolid = () => false;
  const g = { kind: 'he', x: 0, y: 9, z: 0, vx: 60, vy: 0, vz: 0, still: 0 }; let broke = null; for (let i = 0; i < 4 && !broke; i++) { stepNade(g, bx, null, .02); if (g.glass?.length) broke = g.glass[0]; }
  assert(broke === 3 && pane.off, 'the pane it hits breaks'); assert(Math.abs(g.vx) < 60 * .2, 'and the grenade loses most of its speed · ' + g.vx.toFixed(1)); }
// Fire: about 4× the old area in the open; never through a wall; only on the floor it landed on.
{ const open = fireCells([], 0, 0, 0), oldArea = Math.PI * (120 * 2.54 / 16.5) ** 2; assert(open.length * 9 > oldArea * 3.3, 'fire covers ~4× the old area: ' + (open.length * 9 / oldArea).toFixed(1) + '×');
  const wall = [{ minX: 8, maxX: 10, minZ: -60, maxZ: 60, y0: 0, y1: 24 }], cells = fireCells(wall, 0, 0, 0); assert(cells.length && cells.every(([x]) => x < 8), 'the fire stops at a wall');
  const crate = [{ minX: -6, maxX: 6, minZ: -6, maxZ: 6, y0: 0, y1: 6 }], top = fireCells(crate, 0, 0, 6); assert(top.length && top.every(([x, z]) => Math.abs(x) < 6.1 && Math.abs(z) < 6.1), 'fire on a crate stays on the crate'); }
assert(Math.abs(NADES.smoke.radius - 164 * 2.54 / 16.5) < .5 && Math.abs(SMOKE.vert / .8 * 164 / 144 - 1.3) < .03, 'smoke: 30 % more ground and height than CS2\'s 144-unit cloud (as asked)');
// No throwing in the freeze time (Defuse).
{ const gd = { levels: {} }; startArena(gd, { map: 'dust2', kind: 'defuse', bots: 0 }, 9e9); const sp = ARENA_MAPS.dust2.t[0], ann = [{ name: 'Ann', pose: { x: ARENA.cx + sp[0], y: 9.7, z: ARENA.cz + sp[1], yaw: 0 } }]; arenaTick(gd, ann, .05, 9e9); arenaApply(gd, { type: 'buy-nade', kind: 'he' }, 'Ann', ann, 9e9);
  assert.throws(() => arenaApply(gd, { type: 'throw', kind: 'he', x: 0, y: 9.7, z: 0, dx: 0, dy: 0, dz: -1 }, 'Ann', ann, 9e9 + 10), /throw now/); assert(arenaArsenalOf(gd, 'Ann').includes('he'), 'and the grenade is kept');
  // After a round's end (CS2): play goes on until the next round — the grenade flies; not after the match is over.
  gd.combat.d.round.phase = 'over'; gd.combat.d.round.overAt = 9e9 + 20; arenaApply(gd, { type: 'throw', kind: 'he', x: 0, y: 9.7, z: 0, dx: 0, dy: 0, dz: -1 }, 'Ann', ann, 9e9 + 30); assert(gd.combat.nades.some(n => n.kind === 'he'), 'a grenade thrown after the round ends flies');
  gd.combat.d.matchOver = true; (gd.arena.loadout.ann.nades ??= []).push('he'); assert.throws(() => arenaApply(gd, { type: 'throw', kind: 'he', x: 0, y: 9.7, z: 0, dx: 0, dy: 0, dz: -1 }, 'Ann', ann, 9e9 + 40), /throw now/, 'no throwing once the match is over'); }
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
  assert(!smokeBlocks(ge, -R - 30, eye, 0, R + 30, eye, 0, T0 + 3300) && smokeDensity(ge, R * .9, eye, 0, T0 + 3300) < .05, 'an HE in the middle takes the whole cloud away for a moment');
  assert(holeRadius({ at: 0 }, SMOKE.holeGrow) === SMOKE.holeR && holeRadius({ at: 0 }, SMOKE.holeGrow + SMOKE.holeOpen + SMOKE.holeClose * .5) < SMOKE.holeR * .6 && Math.abs(SMOKE.holeGrow + SMOKE.holeOpen + SMOKE.holeClose - 2000) <= 250, 'the hole opens at once, then the smoke pours back in from its edge: about two seconds in all');
  assert(smokeBlocks(ge, -R - 30, eye, 0, R + 30, eye, 0, T0 + 3000 + SMOKE.holeGrow + SMOKE.holeOpen + SMOKE.holeClose + 100), 'then the smoke closes again');
  // Smoke over a burning molotov puts it out; a molotov into smoke fizzles; nothing re-ignites.
  const gf = { levels: {}, combat: { nades: [{ id: 'f1', kind: 'molotov', phase: 'fire', x: 4, y: 0, z: 0, firedAt: T0, at: T0 }, { id: 's2', kind: 'smoke', phase: 'air', x: 0, y: 0.3, z: 0, vx: 0, vy: -1, vz: 0, at: T0 - 1600, still: 1 }], hp: {}, down: {} }, arena: { bots: [] } };
  for (let i = 0; i < 4; i++) nadesTick(gf, [], .05, T0 + 50 * i, {});
  assert(gf.combat.nades.find(n => n.id === 'f1')?.phase === 'out', 'smoke landing on the fire puts it out');
  for (let i = 0; i < 30; i++) nadesTick(gf, [], .05, T0 + 200 + 50 * i, {}); assert(!gf.combat.nades.some(n => n.id === 'f1' && n.phase === 'fire'), 'the fire never comes back');
  const gm = { levels: {}, combat: { nades: [{ id: 's3', kind: 'smoke', phase: 'smoke', x: 0, y: 0, z: 0, firedAt: T0 }, { id: 'm1', kind: 'molotov', phase: 'air', x: 5, y: 0.3, z: 0, vx: 0, vy: -3, vz: 0, at: T0, still: 0 }], hp: {}, down: {} }, arena: { bots: [] } };
  for (let i = 0; i < 6; i++) nadesTick(gm, [], .05, T0 + 2000 + 50 * i, {}); assert.notEqual(gm.combat.nades.find(n => n.id === 'm1')?.phase, 'fire', 'a molotov thrown into smoke fizzles'); }
// On a map (the smoke's cells): an HE clears the cells it reaches through the air — never through a wall — and the cloud
// refills from the hole's edge in. A floor and a wall along x = 0; the smoke lies west of it.
{ const T0 = 6e9, R = NADES.smoke.radius, eye = 9.7, B = (minX, maxX, minZ, maxZ, y0, y1) => ({ minX, maxX, minZ, maxZ, y0, y1 }), room = [B(-200, 200, -200, 200, -4, 0), B(-.75, .75, -200, 200, 0, 60)];
  setSmokeSolids(game => game.testBoxes || (game?.arena?.map && ARENA_MAPS[game.arena.map] ? mapBoxes(ARENA_MAPS[game.arena.map], ARENA.cx, ARENA.cz) : null));   // (as arena-logic.js, plus this room)
  const world = (id, hx, hz = 0) => ({ levels: {}, testBoxes: room, combat: { nades: [{ id, kind: 'smoke', phase: 'smoke', x: -14, y: 0, z: 0, firedAt: T0 }, { id: id + 'he', kind: 'he', phase: 'air', x: hx, y: .3, z: hz, vx: 0, vy: 0, vz: 0, at: T0 + 3000 - NADES.he.fuse - 10, still: 0 }], hp: {}, down: {} }, arena: { bots: [] } });
  const across = (gm, t) => smokeBlocks(gm, -14, eye, -R - 30, -14, eye, R + 30, t), holesOf = (gm, id) => gm.combat.nades.find(n => n.id === id).holes?.length || 0;   // (a sightline through the cloud, along the wall)
  const gw = world('w1', 8); nadesTick(gw, [], .05, T0 + 3000, {}); assert(holesOf(gw, 'w1') === 0 && across(gw, T0 + 3300), 'an HE behind a wall does not clear the smoke');
  const gh = world('w2', -14); nadesTick(gh, [], .05, T0 + 3000, {}); const open = T0 + 3300;
  assert(holesOf(gh, 'w2') === 1 && smokeDensity(gh, -14, eye, 0, open) < .05 && smokeDensity(gh, -14, 18, 12, open) < .05 && !across(gh, open), 'an HE in the middle of the smoke takes it all away (up to its top)');
  const gs = world('w3', -14, -18); nadesTick(gs, [], .05, T0 + 3000, {}); const dNear = smokeDensity(gs, -14, eye, -16, open), dFar = Math.max(smokeDensity(gs, -14, eye, 16, open), smokeDensity(gs, -14, eye, 20, open));
  assert(holesOf(gs, 'w3') === 1 && dNear < .05 && dFar > .2, 'an HE at its side clears the part round it; the far side stays · ' + dNear.toFixed(2) + ' / ' + dFar.toFixed(2));
  const mid = T0 + 3000 + SMOKE.holeGrow + SMOKE.holeOpen + SMOKE.holeClose * .5, dIn = smokeDensity(gh, -14, 3, 0, mid), dOut = smokeDensity(gh, -14, eye, 16, mid);
  assert(dIn < .05 && dOut > .3, 'half way through the refill the hole\'s edge is smoke again, its middle still open · ' + dIn.toFixed(2) + ' / ' + dOut.toFixed(2));
  assert(across(gh, T0 + 3000 + SMOKE.holeGrow + SMOKE.holeOpen + SMOKE.holeClose + 100), 'then it is whole again'); }
// ── v51: grenade physics and utility rules (package C1) ──
// A mesh in game units (x, y up, z) from quads, as a CS2 map file's grenade triangles (tests/nade-mesh.mjs does the same).
const meshOf = quads => { const T = []; for (const [a, b, c, d] of quads) T.push(...a, ...b, ...c, ...a, ...c, ...d);
  const { info, buf } = buildNadeMesh(new Float32Array(T)), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), p4 = n => n + (4 - n % 4) % 4;
  let o = 0; const tri = new Uint16Array(ab, o, info.tris * 9); o += p4(info.tris * 18); const box = new Uint16Array(ab, o, info.nodes * 6); o += p4(info.nodes * 12); const links = new Uint32Array(ab, o, info.nodes * 2); o += info.nodes * 8;
  return createNadeMesh({ o: info.o, s: info.s, tri, box, links, sight: new Uint8Array(ab, o, info.tris) }); };
const flat = (y, x0 = -200, x1 = 200, z0 = -200, z1 = 200) => [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]];   // (a floor quad facing up)
const meshBoxes = (M, list = [], movers = []) => { const b = list.slice(); b.nadeMesh = M; b.movers = movers; return b; };
const lone = (kind, extra = {}, T = 7e9) => ({ levels: {}, combat: { nades: [{ id: 'x' + kind, kind, phase: 'air', x: 0, y: NADE_R, z: 0, vx: 0, vy: 0, vz: 0, at: T - 2100, still: 1, rest: true, ...extra }], hp: {}, down: {} }, arena: { bots: [] } });
// GD-NET-11: a throw by someone with no loadout makes none (it used to hand a CT the Terrorists' Glock).
{ const gd = { levels: {} }; startArena(gd, { map: 'dust2', kind: 'defuse', bots: 0 }, 9e9); gd.combat.d.teams.bo = 'ct';
  assert.throws(() => arenaApply(gd, { type: 'throw', kind: 'he', x: 0, y: 9.7, z: 0, dx: 0, dy: 0, dz: -1 }, 'Bo', [], 9e9 + 1), /no HE/);
  assert(gd.arena.loadout.bo === undefined && arenaArsenalOf(gd, 'Bo').includes('usps'), 'a refused throw makes no loadout: the CT keeps the USP-S'); }
// NADE-7: numbers that are not finite are refused (the grenade is kept); a grenade never goes NaN.
{ const g7 = { levels: {} }; startArena(g7, { map: 'yard', bots: 0 }, 9e9); arenaApply(g7, { type: 'buy-nade', kind: 'he' }, 'Ann');
  assert.throws(() => arenaApply(g7, { type: 'throw', kind: 'he', x: '1e999', y: 9.7, z: cz, dx: 0, dy: 0, dz: -1 }, 'Ann', [], 9e9 + 1), /Bad throw/);
  assert(arenaArsenalOf(g7, 'Ann').includes('he') && !g7.combat.nades.length, 'a throw at Infinity is refused and the grenade kept'); }
// NADE-4 / DROP-1: the preview and a client's replay of a dropped gun never switch a pane off; the host's toss reports it.
{ const pane = { minX: 5, maxX: 5.3, minZ: -5, maxZ: 5, y0: 0, y1: 20, mat: 'glass', mover: 3, off: false }, bx = [pane]; bx.movers = [pane]; bx.nadeSolid = () => false;
  predictThrow('he', { x: 0, y: 9, z: 0, dx: 1, dy: 0, dz: 0, strength: 'long' }, bx, null); assert(!pane.off, 'the throw preview never breaks a pane in the local collision');
  const c = tossFlight(bx, null, { x: 0, y: 9, z: 0, vx: 40, vy: 0, vz: 0 }, true); assert(!pane.off && !c.glass, "nor does a client's replay of a dropped gun");
  const h = tossFlight(bx, null, { x: 0, y: 9, z: 0, vx: 40, vy: 0, vz: 0 }); assert(pane.off && h.glass?.[0] === 3, "the host's toss reports the pane it broke (arena-logic.js breaks it in the map state)"); pane.off = false;
  const pm = { minX: 5, maxX: 5.3, minZ: -5, maxZ: 5, y0: 0, y1: 20, mat: 'glass', mover: 4, off: false }, mb = meshBoxes(meshOf([flat(0)]), [pm], [pm]);
  predictThrow('he', { x: 0, y: 9, z: 0, dx: 1, dy: 0, dz: 0, strength: 'long' }, mb, null); assert(!pm.off, '…on a CS2 map too'); }
// …and a client's replay of a gun tossed through a pane (fly.glass: the panes the host's toss broke — already broken in
// the client's map state when it replays) slows at it as the host's did and lands where the gun lies (it flew on
// unslowed and snapped ~11 units back).
for (const mesh of [true, false]) { const pane = { minX: 5, maxX: 5.2, minZ: -5, maxZ: 5, y0: 0, y1: 20, mat: 'glass', mover: 3, off: false }; let bx;
  if (mesh) bx = meshBoxes(meshOf([flat(0)]), [pane], [pane]); else { bx = [pane]; bx.movers = [pane]; bx.nadeSolid = (x, y) => y < 0; }
  const fly = { x: 0, y: 8, z: 0, vx: 30, vy: 5, vz: 0 }, host = tossFlight(bx, null, fly), copy = tossFlight(bx, null, { ...fly, glass: host.glass }, true);
  assert(pane.off && host.glass?.[0] === 3 && host.x < 8 && Math.hypot(copy.x - host.x, copy.z - host.z) < .05, `${mesh ? 'CS2 map' : 'map file'}: the replay through a broken pane ends at ${copy.x.toFixed(2)}, the host's toss at ${host.x.toFixed(2)}`); }
// NADE-1: on a CS2 map a smoke / molotov goes off on the surface it lies on (CS2's triangles) — not on the players'
// column boxes' tops, which put a canister beside a wall or on a stair at the map's bottom (y = 0).
{ const bx = meshBoxes(meshOf([flat(20)]), [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1, y0: 0, y1: 60 }, { minX: 3, maxX: 30, minZ: -30, maxZ: 30, y0: 0, y1: 20.9 }]);   // (a wall's column over the canister, a stair column rounded up)
  const s = lone('smoke', { y: 20 + NADE_R }); nadesTick(s, [], .05, 7e9, { boxes: bx }); assert(s.combat.nades[0].phase === 'smoke' && Math.abs(s.combat.nades[0].y - 20) < .05, 'a smoke on a ledge at 20 pops at 20 · ' + s.combat.nades[0].y);
  const m = lone('molotov', { y: 20 + NADE_R }); nadesTick(m, [], .05, 7e9, { boxes: bx }); const f = m.combat.nades[0], cells = fireCells(bx, f.x, f.z, f.y);
  assert(f.phase === 'fire' && Math.abs(f.y - 20) < .05 && cells.length > 100 && cells.every(c => Math.abs(c[2] - 20) < .05), 'a molotov there burns on that floor · ' + f.y + ' / ' + cells.length + ' cells'); }
// NADE-3: under a CS2 map's lowest surface there is nothing — a grenade lobbed off the edge of the world is removed (and
// logged), not held on an invisible floor; a pit below the lowest player floor is reached.
{ const half = meshBoxes(meshOf([flat(0, -200, 0)])), g = lone('smoke', { x: 2, y: 3, vx: 6, rest: false, at: 7e9 - 100 }), n0 = NADE_LOG.length; let t = 7e9;
  for (let i = 0; i < 80 && g.combat.nades.length; i++) { t += 50; nadesTick(g, [], .05, t, { boxes: half }); }
  assert(!g.combat.nades.length && NADE_LOG.length > n0 && NADE_LOG.at(-1).why === 'out of the world', 'a smoke over the edge of the world is removed, logged · ' + JSON.stringify(NADE_LOG.at(-1)));
  const pitM = meshOf([flat(0, -200, 10), flat(-5, 10, 30), flat(0, 30, 200)]); pitM.minY = -5; const pit = meshBoxes(pitM), q = { x: 20, y: 2, z: 0, vx: 0, vy: 0, vz: 0, still: 0 };
  for (let i = 0; i < 80 && !q.rest; i++) stepNade(q, pit, null, .05); assert(q.rest && Math.abs(q.y - (-5 + NADE_R)) < .05, 'a grenade in a pit below the players\' lowest floor lies at its bottom · ' + q.y.toFixed(2)); }
// …told apart in the log from a fall through a gap in the map file's own surfaces (a roof over where it fell out: it got
// under the map through a face the file lacks — map data, not a lob off the edge).
{ const roofed = meshBoxes(meshOf([flat(0, -200, 0), [[0, 30, -200], [200, 30, -200], [200, 30, 200], [0, 30, 200]]])), g = lone('smoke', { id: 'gap', x: 2, y: 3, vx: 6, rest: false, at: 7.05e9 - 100 }), n0 = NADE_LOG.length; let t = 7.05e9;
  for (let i = 0; i < 80 && g.combat.nades.length; i++) { t += 50; nadesTick(g, [], .05, t, { boxes: roofed }); }
  assert(!g.combat.nades.length && NADE_LOG.length > n0 && NADE_LOG.at(-1).why === GAP_WHY, 'under a roof it fell through a gap in the map\'s surfaces · ' + JSON.stringify(NADE_LOG.at(-1))); }
// A throw starts on the eye's side of a surface between the eye and the hand (swept from the eye).
{ const rail = meshBoxes(meshOf([flat(8.5, -5, 5, -5, 5), flat(0)])), s = throwStart({ x: 0, y: 9.7, z: 0, dx: 1, dy: -.3, dz: 0, strength: 'short' }, rail, null);
  assert(s.y > 8.5 + NADE_R * .99, 'a short throw over a rail starts above it (not under it, behind the surface) · ' + s.y.toFixed(2)); }
// …and on the eye's side of a shut door or an intact pane 1.3 / 2.46 units (16 HU) ahead on a CS2 map (the release
// sweep stops at doors, crates and panes too: a sweep of the triangles alone started it behind the door, and it flew
// on through the door, or through the pane without breaking it); the flight then breaks the pane.
{ const HU = 2.54 / 16.5; for (const gap of [1.3, 16 * HU]) for (const strength of ['long', 'medium', 'short']) {
    const door = { minX: gap, maxX: gap + .28, minZ: -5, maxZ: 5, y0: 0, y1: 14, mat: 'door', mover: 1, off: false }, bx = meshBoxes(meshOf([flat(0)]), [door], [door]), a = { x: 0, y: 9.7, z: 0, dx: 1, dy: 0, dz: 0, strength };
    const s = throwStart(a, bx, null), g = { ...s, ...launch(a), still: 0 }; for (let t = 0; t < 3 && !g.rest; t += .05) stepNade(g, bx, null, .05);
    assert(s.x <= gap - NADE_R + 1e-9 && g.x < gap, `a ${strength} throw ${gap.toFixed(2)} from a shut door starts and stays on this side · start ${s.x.toFixed(2)}, end ${g.x.toFixed(2)}`); }
  for (const th of [.2, 0]) { const pane = { minX: 16 * HU, maxX: 16 * HU + th, minZ: -5, maxZ: 5, y0: 0, y1: 14, mat: 'glass', mover: 7, off: false }, pb = meshBoxes(meshOf([flat(0)]), [pane], [pane]), a = { x: 0, y: 9.7, z: 0, dx: 1, dy: 0, dz: 0, strength: 'long' };   // (th 0: a map file's pane of no thickness — a plain slab test never sees it)
    const s = throwStart(a, pb, null), g = { ...s, ...launch(a), still: 0 }; for (let t = 0; t < 1 && !g.rest; t += .05) stepNade(g, pb, null, .05);
    assert(s.x <= pane.minX - NADE_R + 1e-9 && pane.off && g.glass?.[0] === 7 && g.x > pane.maxX, `one 16 HU from a pane ${th} thick starts on this side, breaks it and goes on · start ${s.x.toFixed(2)}`); } }
// NADE-5 / BOT-FLOOR / FLASH-BOTS: bots are where their feet are (bot.y), not on the top floor of their column; a bot
// is flashed at its own eye (feet + EYE), facing it.
{ ARENA_MAPS.__stack = { floorAt: () => 62 };   // (a column whose top floor is 62: the bot stands on the lower one)
  const T = 7.7e9, bx = [{ minX: -40, maxX: 40, minZ: -40, maxZ: 40, y0: 28, y1: 32 }, { minX: -40, maxX: 40, minZ: -40, maxZ: 40, y0: 60, y1: 62 }];
  const world = (kind, y, z = 0) => ({ levels: {}, combat: { nades: [{ id: 'b' + kind + y, kind, phase: 'air', x: 0, y, z, vx: 0, vy: 0, vz: 0, at: T - 1510, still: 1, rest: true }], hp: {}, down: {} }, arena: { map: '__stack', bots: [{ name: 'Bot', x: 4, z: 0, y: 32, yaw: 0 }] } });
  const low = world('he', 32 + NADE_R); nadesTick(low, [], .05, T, { boxes: bx }); assert(hpOf(low, 'Bot') < MAX_HP, 'an HE on the bot\'s own (lower) floor hurts it · ' + hpOf(low, 'Bot'));
  const high = world('he', 62 + NADE_R); nadesTick(high, [], .05, T, { boxes: bx }); assert.equal(hpOf(high, 'Bot'), MAX_HP, 'one on the floor above does not');
  const fl = world('flash', 32 + NADE_R + 1, 0); fl.arena.bots[0].x = 0; fl.arena.bots[0].z = 4; nadesTick(fl, [], .05, T, { boxes: bx }); assert((fl.arena.bots[0].blindUntil || 0) > T + 1500, 'a bot facing a flash on its floor is blinded · ' + ((fl.arena.bots[0].blindUntil || 0) - T));
  delete ARENA_MAPS.__stack; }
// HE-ARMOR: kevlar takes CS2's share of an HE (m_flArmorRatio 1.2: 60 % through) and loses armor.
{ const T = 7.8e9, mk = arm => ({ levels: {}, combat: { nades: [{ id: 'a', kind: 'he', phase: 'air', x: 0, y: NADE_R, z: 0, vx: 0, vy: 0, vz: 0, at: T - 1510, still: 1, rest: true }], hp: {}, down: {}, armor: arm ? { bo: { kevlar: 100, helmet: false } } : {} }, arena: { bots: [] } });
  const pl = [{ name: 'Bo', pose: { x: 6, y: 9.7, z: 0, yaw: 0 } }], a = mk(false), b = mk(true); nadesTick(a, pl, .05, T, {}); nadesTick(b, pl, .05, T, {});
  const la = MAX_HP - hpOf(a, 'Bo'), lb = MAX_HP - hpOf(b, 'Bo'); assert(la > 60 && Math.abs(lb / la - .6) < .04 && b.combat.armor.bo.kevlar < 100, `HE: ${la} bare, ${lb} through kevlar (${b.combat.armor.bo.kevlar} armor left)`);
  // …and it falls off with distance (CS:GO's Gaussian over the 350-unit range: ~1/3 at half of it), and never through a CS2 floor.
  const far = mk(false); far.combat.nades[0].x = -NADES.he.radius / 2 + 5; nadesTick(far, pl, .05, T, {}); const lf = MAX_HP - hpOf(far, 'Bo'); assert(lf > 20 && lf < 45, 'half the range away: about a third · ' + lf);
  const slab = meshBoxes(meshOf([flat(0), flat(14, -50, 50, -50, 50), [[-50, 13.5, -50], [50, 13.5, -50], [50, 13.5, 50], [-50, 13.5, 50]]]));   // (a floor slab over a player's head, both faces)
  const up = mk(false); up.combat.nades[0].y = 14 + NADE_R; up.combat.nades[0].x = 3; nadesTick(up, pl, .05, T, { boxes: slab }); assert.equal(hpOf(up, 'Bo'), MAX_HP, 'an HE on the floor above (a CS2 slab between) does not hurt through it'); }
// …and a crouched player's feet are on the floor (pose.ey, else CS2's 46 HU crouched eye), not 18 HU under it: on a
// CS2 floor the HE's feet sample was behind the slab and crouching took a fifth off the damage (71 for 87 standing).
{ const T = 7.85e9, HU = 2.54 / 16.5, fl = meshBoxes(meshOf([flat(0)])), he = pose => { const w = { levels: {}, combat: { nades: [{ id: 'c', kind: 'he', phase: 'air', x: 0, y: NADE_R, z: 0, vx: 0, vy: 0, vz: 0, at: T - 1510, still: 1, rest: true }], hp: {}, down: {} }, arena: { bots: [] } }; nadesTick(w, [{ name: 'Bo', pose }], .05, T, { boxes: fl }); return MAX_HP - hpOf(w, 'Bo'); };
  const stand = he({ x: 8, y: 64 * HU, z: 0, yaw: 0, ey: 64 * HU }), duck = he({ x: 8, y: 46 * HU, z: 0, yaw: 0, ey: 46 * HU, crouched: true }), duck2 = he({ x: 8, y: 46 * HU, z: 0, yaw: 0, crouched: true });
  assert(stand > 60 && duck >= stand - 2 && duck2 >= stand - 2, `an HE on a CS2 floor 8 units away: standing ${stand}, crouched ${duck} (ey sent) / ${duck2} (crouched only)`); }
// FLASH-DOOR: on a CS2 map a shut door (its box) stops the light; open, or a pane of glass, it does not.
{ const door = { minX: 4, maxX: 4.5, minZ: -30, maxZ: 30, y0: 0, y1: 30, mat: 'door', mover: 1, off: false }, bx = meshBoxes(meshOf([flat(-10)]), [door], [door]), amt = () => flashAmount(bx, 0, 9, 0, 12, 9, 0, -1, 0, 0);
  const shut = amt(); door.off = true; const open = amt(); door.off = false; door.mat = 'glass'; const glass = amt();
  assert(shut === 0 && open > .9 && glass > .9, `flash through a shut door ${shut.toFixed(2)} · open ${open.toFixed(2)} · glass ${glass.toFixed(2)}`); }
// FLASH-BOUNCE: a flash popped under a low ceiling round a wall still reaches you a little (the light off the ceiling,
// from where it stopped — CS's trace end point — and "up" really up).
{ const bx = [{ minX: 9.5, maxX: 10.5, minZ: -60, maxZ: 60, y0: 0, y1: 5 }, { minX: -5, maxX: 5, minZ: -5, maxZ: 5, y0: 8, y1: 9 }, { minX: -60, maxX: 60, minZ: -60, maxZ: 60, y0: -3, y1: 0 }], a = flashAmount(bx, 0, 1, 0, 20, 3, 0, -1, 0, 0);   // (a wall, a ceiling over the flash, the ground)
  assert(a > 1 / 6 * .9 && a < .5, 'round a wall, under a ceiling: a sixth of the flash · ' + a.toFixed(3)); }
// …bots too (CS's bots are players: its straight-or-nothing rule is for hostages): one behind a short wall the light
// gets round is blinded for a while, as a player there would be.
{ const T = 7.9e9, bx = [{ minX: 9.5, maxX: 10.5, minZ: -5, maxZ: 5, y0: 0, y1: 14 }, { minX: -60, maxX: 60, minZ: -60, maxZ: 60, y0: -3, y1: 0 }];
  const w = { levels: {}, combat: { nades: [{ id: 'fb', kind: 'flash', phase: 'air', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, at: T - 1510, still: 1, rest: true }], hp: {}, down: {} }, arena: { bots: [{ name: 'Bot', x: 20, z: 0, y: 0, yaw: Math.PI / 2 }] } };
  const pl = flashAmount(bx, 0, 1, 0, 20, 9.7, 0, -1, 0, 0); nadesTick(w, [], .05, T, { boxes: bx }); const ms = (w.arena.bots[0].blindUntil || 0) - T;
  assert(pl > .2 && pl < .5 && ms > 600, `a bot behind a short wall, facing the flash: blind ${ms | 0} ms (a player there gets ${pl.toFixed(2)} of it)`); }
// FLASH-FACING: where you look sets how long, not how white (CS: full white in the first three tiers, 200/255 behind).
{ const B = (dx, dz) => ({ ...flashBlind([], 10, 9, 0, 0, 9, 0, dx, 0, dz) }), head = B(1, 0), side = B(.5, .866), behind = B(-1, 0), long = h => h.hold + h.fade;
  assert(head.peak === 1 && side.peak === 1 && Math.abs(behind.peak - 200 / 255) < 1e-9, 'white: full facing it and 60° off, 200/255 from behind');
  assert(Math.abs(long(side) / long(head) - (.64 * FLASH.hold + .7 * FLASH.fade) / (FLASH.hold + FLASH.fade)) < .01 && long(behind) < long(head) * .25, `how long: ${long(head) | 0} / ${long(side) | 0} / ${long(behind) | 0} ms`); }
// FLASH-STACK: a weaker second flash never shortens or dims a stronger one; a stronger one lengthens a weak one.
{ const strong = { s: 1, peak: 1, hold: 2200, fade: 1800 }, weak = { s: .1, peak: 1, hold: 140, fade: 126 }, a = { peak: 0, holdUntil: 0, fadeEnd: 0 }; stackFlash(a, strong, 0); stackFlash(a, weak, 500);
  assert(flashWhite(a, 2100) === 1 && Math.abs(flashWhite(a, 3100) - .5) < .02 && flashWhite(a, 4001) === 0, 'a weak flash after a strong one: still the strong one\'s white-out');
  const b = { peak: 0, holdUntil: 0, fadeEnd: 0 }; stackFlash(b, weak, 0); stackFlash(b, strong, 100); assert(flashWhite(b, 2250) === 1 && flashWhite(b, 4000) > 0, 'a strong flash after a weak one: its full length');
  const c = { peak: 0, holdUntil: 0, fadeEnd: 0 }; stackFlash(c, strong, 0); const before = flashWhite(c, 3000); stackFlash(c, { s: .3, peak: 200 / 255, hold: 100, fade: 100 }, 3000); assert(flashWhite(c, 3000) >= before - 1e-9 && flashWhite(c, 3150) >= flashWhite({ peak: 1, holdUntil: 2200, fadeEnd: 4000 }, 3150) - 1e-9, 'never dimmer than before'); }
// FIRE-TICK: the burn keeps its 200 ms beat whatever the host's tick (40–60 ms, jittered): 40 a second after the ramp.
{ const T = 8e9, gf = { levels: {}, combat: { nades: [{ id: 'f', kind: 'molotov', phase: 'fire', x: 0, y: 0, z: 0, firedAt: T, at: T }], hp: {}, down: {} }, arena: { bots: [] } }, pl = [{ name: 'Cy', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }];
  let t = T, k = 7, dmg = 0; const jit = () => 40 + (k = (k * 16807) % 2147483647) % 21;
  while (t < T + 1700) { t += jit(); gf.combat.hp.cy = MAX_HP; nadesTick(gf, pl, .05, t, {}); } const t0 = t;
  while (t < T + 5400) { t += jit(); gf.combat.hp.cy = MAX_HP; nadesTick(gf, pl, .05, t, {}); dmg += MAX_HP - hpOf(gf, 'Cy'); } const dps = dmg / ((t - t0) / 1000);
  assert(Math.abs(dps - 40) < 40 * .07, 'burning at 40 a second on 40–60 ms host ticks · ' + dps.toFixed(1)); }
// MOLOTOV-SLOPE: a molotov breaks on a floor flat enough (CS's 30° max detonate slope): it bounces on off a 40° ramp.
{ const ramp = deg => { const k = Math.tan(deg * Math.PI / 180); return meshBoxes(meshOf([[[-100, -100 * k, -100], [-100, -100 * k, 100], [100, 100 * k, 100], [100, 100 * k, -100]]])); }, T = 8.05e9;
  const drop = deg => { const w = lone('molotov', { y: 2, rest: false, at: T }); let t = T; for (let i = 0; i < 6; i++) { t += 50; nadesTick(w, [], .05, t, { boxes: ramp(deg) }); } return w.combat.nades[0].phase; };
  assert(drop(20) === 'fire' && drop(40) === 'air', 'onto a 20° ramp: fire; onto a 40° one it bounces on · ' + drop(20) + ' / ' + drop(40)); }
// TAG-FIRE: a burn tags you by its grenade's own flinch (CS2 weapons.vdata: molotov none, incendiary 0.8), not 50 %.
{ const T = 8.1e9, mk = kind => ({ combat: { nades: [{ id: 'q' + kind, kind, phase: 'fire', x: 0, y: 0, z: 0, firedAt: T - 1500, at: T - 1500 }] } });
  assert(fireFlinch(mk('molotov'), [], 0, 0, 0, T) === 1 && fireFlinch(mk('incendiary'), [], 0, 0, 0, T) === .8 && fireFlinch(mk('incendiary'), [], 60, 0, 0, T) === null, 'fire flinch: molotov 1 (none), incendiary 0.8, out of the fire: an ordinary hit'); }
// …and a client tells a burn by its source (the host's running burn total, sent with the HP), not by the drop's size:
// two burns bunched into one 9 HP drop are still the fire's flinch; a 5 HP gun hit in the flames, or a burn and a hit
// in one drop, an ordinary tag (the old "8 HP or less" guess got all three wrong).
{ const T = 8.12e9, gf = { levels: {}, combat: { nades: [{ id: 'bt', kind: 'incendiary', phase: 'fire', x: 0, y: 0, z: 0, firedAt: T - 1500, at: T - 1500 }], hp: {}, down: {} }, arena: { bots: [] } }, pl = [{ name: 'Cy', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }], seen = { d: 0 };
  let t = T, hp = MAX_HP; const step = () => { t += 200; nadesTick(gf, pl, .05, t, {}); const d = hp - hpOf(gf, 'Cy'); hp = hpOf(gf, 'Cy'); return d; }, gun = n => { gf.combat.hp.cy -= n; hp -= n; return n; };
  const d1 = step(), f1 = burnTag(gf, 'Cy', d1, seen, t); for (let i = 0; i < 2; i++) { const d = step(); burnTag(gf, 'Cy', d, seen, t); }
  const d2 = step() + step(), f2 = burnTag(gf, 'Cy', d2, seen, t), f3 = burnTag(gf, 'Cy', gun(5), seen, t), d4 = step() + gun(5), f4 = burnTag(gf, 'Cy', d4, seen, t);
  assert(d1 > 0 && f1 === .8 && d2 > 8 && f2 === .8 && f3 === null && f4 === null, `burn ${d1} → ${f1}; two bunched (${d2}) → ${f2}; a 5 HP hit → ${f3}; a burn + a hit (${d4}) → ${f4}`); }
// Incendiary (CT): its own kind, the molotov's fire; one fire grenade at a time; a decoy is one of the four.
{ assert(NADES.incendiary.price === 500 && NADES.decoy.price === 50 && NADES.he.dmg === 99, 'CS2 prices (incendiary $500, decoy $50) and the HE\'s 99');
  assert(!canCarry(['molotov'], 'incendiary') && canCarry(['he', 'flash'], 'decoy') && !canCarry(['decoy'], 'decoy') && !canCarry(['he', 'flash', 'smoke', 'decoy'], 'flash'), 'carrying: one fire grenade, one decoy, four in all');
  const T = 8.15e9, w = lone('incendiary', { y: 1, vy: -10, rest: false, at: T - 100 }), pl = [{ name: 'Di', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }]; let t = T; for (let i = 0; i < 30; i++) { t += 50; nadesTick(w, pl, .05, t, {}); }
  assert(w.combat.nades[0].phase === 'fire' && hpOf(w, 'Di') < MAX_HP, 'an incendiary bursts on the floor and burns'); }
// Decoy (CS2: $50): once it rests it fires its thrower's gun in bursts for 15 s (the same shots on every client), shows
// on the enemies' radar while it fires, then pops.
{ const gq = { levels: {} }; let tq = 8.2e9; startArena(gq, { map: 'yard', bots: 0 }, tq); assert.match(arenaApply(gq, { type: 'buy-nade', kind: 'decoy' }, 'Ann'), /Bought/);
  const pq = [P('Ann', cx, cz)]; arenaApply(gq, { type: 'throw', kind: 'decoy', x: cx, y: 9.7, z: cz, dx: 0, dy: -1, dz: 0, strength: 'short' }, 'Ann', pq, tq);
  const d = gq.combat.nades.find(n => n.kind === 'decoy'); for (let i = 0; i < 50; i++) { tq += 50; arenaTick(gq, pq, .05, tq); }
  assert(d.phase === 'decoy' && weaponById(d.gun), 'it rests and starts: the thrower\'s gun · ' + d.phase + ' ' + d.gun);
  const shots = decoyShots(d); assert(shots.length >= 6 && shots.at(-1) < DECOY.lasts && shots.at(-1) > DECOY.lasts * .6 && decoyShots({ ...d }).join() === shots.join(),'bursts of shots for 15 s, the same from its seed · ' + shots.length);
  assert(decoyBlip(d, d.firedAt + shots[0] + 50) && !decoyBlip(d, d.firedAt + shots[0] - 50), 'on the enemies\' radar while it fires');
  while (tq < d.firedAt + DECOY.lasts + 100) { tq += 50; arenaTick(gq, pq, .05, tq); } assert.equal(d.phase, 'fizz', 'after 15 s it pops');
  for (let i = 0; i < 20; i++) { tq += 50; arenaTick(gq, pq, .05, tq); } assert(!gq.combat.nades.includes(d), 'and is gone'); }
// The host's tick cuts the tunnels of the players' new shots through a smoke (package E's cutShots, run by nadesTick):
// the first count seen is the start, a new shot along the aim through the cloud is a tunnel.
{ const T = 8.3e9, gs = { levels: {}, combat: { nades: [{ id: 'cs', kind: 'smoke', phase: 'smoke', x: 0, y: 0, z: 0, firedAt: T - 4000, at: T - 6000 }], hp: {}, down: {} }, arena: { bots: [] } }, pl = [{ name: 'Ed', pose: { x: 0, y: 9.7, z: 40, yaw: 0, shot: { n: 1, pitch: 0 } } }];
  nadesTick(gs, pl, .05, T, {}); assert(!gs.combat.cuts?.length, 'no new shot yet: no tunnel'); pl[0].pose.shot.n = 2; nadesTick(gs, pl, .05, T + 50, {});
  assert(gs.combat.cuts?.length === 1, 'a new shot through the smoke cuts its tunnel on the host\'s tick · ' + JSON.stringify(gs.combat.cuts)); }
// NADE-6: a paused match holds every grenade — a smoke 5 s old stays 13 s more after a 10 s pause; one in the air stays put.
{ const gp = { levels: {} }; let tp = 9.5e9; startArena(gp, { map: 'dust2', kind: 'defuse', bots: 0 }, tp); const sp = ARENA_MAPS.dust2.t[0], ann = [{ name: 'Ann', pose: { x: ARENA.cx + sp[0], y: 9.7, z: ARENA.cz + sp[1], yaw: 0 } }];
  arenaTick(gp, ann, .05, tp); const sm = { id: 'ps', kind: 'smoke', phase: 'smoke', x: ARENA.cx + sp[0], y: 0, z: ARENA.cz + sp[1], firedAt: tp - 5000, at: tp - 6500 }, fly = { id: 'pa', kind: 'he', phase: 'air', x: ARENA.cx + sp[0], y: 30, z: ARENA.cz + sp[1], vx: 5, vy: 0, vz: 0, at: tp - 100, still: 0 };
  gp.combat.nades.push(sm, fly); gp.combat.d.paused = { at: tp }; for (let i = 0; i < 200; i++) { tp += 50; arenaTick(gp, ann, .05, tp); }
  assert(Math.abs(sm.firedAt - (tp - 5000)) < 1 && fly.y === 30 && fly.x === ARENA.cx + sp[0] && gp.combat.nades.includes(fly), 'paused 10 s: the smoke\'s clock and the grenade in the air stand still');
  assert(holdNades({ combat: { clock: 5, nades: [] } }, 10) === false, '(nothing to hold: no change)'); }
console.log('PASS: grenades v51 · no loadout from a refused throw, finite throws only, preview / client toss never break panes, smoke & fire on the real surface, out of the world removed + logged, pit floors reached, throw swept from the eye, bots on their own floor + flashed at their eye, HE armor / falloff / floors, flash: doors, bounce light, facing tiers, stacking, burn beat 40/s, molotov 30° slope, fire flinch, incendiary, decoy, host smoke tunnels, pause; falls through a map file\'s gaps told apart');
console.log('PASS: grenades · throw strengths (full / medium / short), preview = host flight, fire 4× area within walls, smoke at CS2’s size, no throws in the freeze (but after a round’s end), CS2’s throw angles and 22-unit start, CS2 fuses, molotov air burst, grenades break glass,  · buy limits, throw + flight, HE damage + cover, smoke blocks sight 18 s (a volume: outside, edge, inside), HE opens a hole that closes, smoke puts out fire / molotov fizzles in smoke, molotov burns 7 s, flashbang (bots + facing), drop / pickup');
