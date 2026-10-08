// Global Defensive · Defuse (host rules): teams, freeze + buy rules, economy, plant / defuse / explosion, elimination,
// time-out, friendly fire, the bomb dropping (Terrorists only pick it up), halftime swap, first to 13.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, slotOf } from '../dist/arena-logic.js';
import { DEFUSE, teamOf, isDefuse } from '../dist/arena-defuse.js';
import { hpOf, isDown, applyHit, arenaArsenalOf } from '../dist/combat-logic.js';
import { ARENA_MAPS } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { weaponById, MAX_HP } from '../dist/weapons-data.js';
let seed = 11; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const M = ARENA_MAPS.dune, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7, z: ARENA.cz + z, yaw: 0 });
let t = 7e9; const g = { levels: {} }; startArena(g, { map: 'dune', kind: 'defuse', bots: 0 }, t);
assert(isDefuse(g)); const d = g.combat.d;
// Two players join: one per team; they spawn at their team's spawn.
const players = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Cy', pose: at(M.ct[0]) }];
const tick = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, players, .05, t); } };
tick(50); assert.equal(teamOf(g, 'Ann'), 't'); assert.equal(teamOf(g, 'Cy'), 'ct'); assert.equal(d.round.phase, 'freeze');
// Each side gets a spawn order on its own spawn; poses follow.
players[0].pose = at(M.t[0]); players[1].pose = at(M.ct[0]);
// Buying: $800 start; an AK is too dear; a Desert Eagle is fine; only in your spawn and during buy time.
assert.throws(() => arenaApply(g, { type: 'loadout', primary: 'ak' }, 'Ann', players, t), /Not enough money/);
assert.match(arenaApply(g, { type: 'loadout', secondary: 'deagle' }, 'Ann', players, t), /Desert Eagle/); assert.equal(d.money.ann, 100);
assert.throws(() => arenaApply(g, { type: 'buy-nade', kind: 'he' }, 'Cy', [{ name: 'Cy', pose: at([0, 0]) }], t), /only in your spawn/);
assert.match(arenaApply(g, { type: 'buy-kit' }, 'Cy', players, t), /kit/); assert.equal(d.money.cy, 400);
// The bomb goes to a Terrorist; it's in slot 5.
assert.equal(d.bomb.carrier, 'ann'); assert(arenaArsenalOf(g, 'Ann').includes('c4')); assert.equal(slotOf('c4'), 'bomb');
tick(DEFUSE.freezeMs); assert.equal(d.round.phase, 'live');
assert.throws(() => arenaApply(g, { type: 'loadout', primary: 'smg' }, 'Ann', players, t + DEFUSE.buyMs + 100), /Buy time is over/);
// Plant: only on a site, standing still for 3.2 s.
assert.throws(() => arenaApply(g, { type: 'plant', hold: true }, 'Ann', players, t), /site A or B/);
players[0].pose = at(M.sites.A.slice(0, 2)); arenaApply(g, { type: 'plant', hold: true }, 'Ann', players, t);
tick(1500); assert.equal(d.round.phase, 'live', 'not yet'); tick(1800); assert.equal(d.round.phase, 'planted'); assert.equal(d.bomb.carrier, null); assert.equal(d.round.planted.site, 'A');
// Defuse: a CT next to the bomb, with a kit: 5 s.
assert.throws(() => arenaApply(g, { type: 'defuse', hold: true }, 'Cy', players, t), /closer/);
players[1].pose = { ...players[0].pose, x: players[0].pose.x + 2 }; arenaApply(g, { type: 'defuse', hold: true }, 'Cy', players, t);
tick(4000); assert.equal(d.round.phase, 'planted'); tick(1200); assert.equal(d.round.phase, 'over'); assert.equal(d.round.winner, 'ct'); assert.equal(d.round.reason, 'defuse');
assert.deepEqual(d.score, { t: 0, ct: 1 }); assert.equal(d.money.cy, 400 + 3500, 'CT win $3,500'); assert.equal(d.money.ann, 100 + 300 + 1400 + 800, 'plant $300, loss $1,400, planted-but-lost $800');
// Next round after the round-end pause; survivors keep their gear.
tick(DEFUSE.overMs + 100); assert.equal(d.round.phase, 'freeze'); assert.equal(d.n, 2); assert.equal(g.arena.loadout.ann.secondary, 'deagle', 'survivor keeps the Deagle');
assert(g.combat.spawnTo.ann && g.combat.spawnTo.cy, 'spawn orders for both');
// Elimination: Ann shoots Cy dead → T win; Cy loses his gear for next round.
players[0].pose = at(M.t[0]); players[1].pose = at(M.ct[0]); tick(DEFUSE.freezeMs + 100);
for (let i = 0; i < 4 && !isDown(g, 'Cy', t); i++) { applyHit(g, 'Ann', 'Cy', weaponById('deagle'), 'chest', 20, 1, t); t += 500; }
assert(isDown(g, 'Cy', t)); tick(100); assert.equal(d.round.winner, 't'); assert.equal(d.round.reason, 'elim');
assert(isDown(g, 'Cy', t + 60000), 'no respawn until the next round');
tick(DEFUSE.overMs + 100); assert(!isDown(g, 'Cy', t), 'back next round'); assert.equal(g.arena.loadout.cy.primary, null);
// Friendly fire: ⅓ damage; a team kill costs $300 and no kill.
const g2 = { levels: {} }; startArena(g2, { map: 'dune', kind: 'defuse', bots: 0 }, t); const pl2 = [{ name: 'A1', pose: at(M.t[0]) }, { name: 'B1', pose: at(M.ct[0]) }, { name: 'A2', pose: at(M.t[1]) }, { name: 'B2', pose: at(M.ct[1]) }];
arenaTick(g2, pl2, .05, t + 50); assert.equal(teamOf(g2, 'A2'), 't'); arenaTick(g2, pl2, .05, t + DEFUSE.freezeMs + 60); t += DEFUSE.freezeMs + 60; const full = applyHit({ levels: {}, mode: 'arena', arena: {}, combat: { hp: {}, down: {}, kills: {}, deaths: {}, feed: [] } }, 'x', 'y', weaponById('ak'), 'chest', 10).dmg;
const ff = applyHit(g2, 'A1', 'A2', weaponById('ak'), 'chest', 10, 1, t + 100).dmg; assert.equal(ff, Math.round(full * .33), 'friendly fire is a third');
g2.combat.d.money.a1 = 1000; for (let i = 0; i < 12 && !isDown(g2, 'A2', t + 200); i++) applyHit(g2, 'A1', 'A2', weaponById('ak'), 'head', 10, 1, t + 200 + i * 200);
assert(isDown(g2, 'A2', t + 5000)); assert.equal(g2.combat.d.money.a1, 700, 'team kill −$300'); assert(!g2.combat.kills.a1, 'no kill credit');
// The bomb drops when its carrier dies; CTs can't take it, Terrorists can.
const c = g2.combat.d.bomb.carrier; assert(c); const carrier = pl2.find(p => p.name.toLowerCase() === c);
for (let i = 0; i < 6 && !isDown(g2, carrier.name, t + 9000); i++) applyHit(g2, 'B1', carrier.name, weaponById('ak'), 'head', 10, 1, t + 6000 + i * 200);
arenaTick(g2, pl2, .05, t + 9100); const bombIt = g2.combat.ground.find(it => it.item === 'c4'); assert(bombIt, 'bomb on the ground'); assert.equal(g2.combat.d.bomb.carrier, null);
const ct = { name: 'B1', pose: { ...carrier.pose } }, tt = pl2.find(p => p.name !== carrier.name && teamOf(g2, p.name) === 't'); tt.pose = { ...carrier.pose };
assert.throws(() => arenaApply(g2, { type: 'pickup', id: bombIt.id }, 'B1', [ct], t + 9200), /Only Terrorists/);
if (!isDown(g2, tt.name, t + 9300)) { assert.match(arenaApply(g2, { type: 'pickup', id: bombIt.id }, tt.name, [tt], t + 9300), /bomb/); assert.equal(g2.combat.d.bomb.carrier, tt.name.toLowerCase()); }
// The bomb explodes after 40 s: Terrorists win, everyone near is killed.
const g3 = { levels: {} }; startArena(g3, { map: 'dune', kind: 'defuse', bots: 0 }, t); const pl3 = [{ name: 'T1', pose: at(M.t[0]) }, { name: 'C1', pose: at(M.ct[0]) }];
let t3 = t; const tick3 = ms => { for (let i = 0; i < ms / 50; i++) { t3 += 50; arenaTick(g3, pl3, .05, t3); } }; tick3(DEFUSE.freezeMs + 100);
pl3[0].pose = at(M.sites.B.slice(0, 2)); arenaApply(g3, { type: 'plant', hold: true }, 'T1', pl3, t3); tick3(3400); assert.equal(g3.combat.d.round.phase, 'planted');
pl3[1].pose = at([M.sites.B[0] + 5, M.sites.B[1]]); tick3(DEFUSE.bombMs + 100); assert.equal(g3.combat.d.round.winner, 't'); assert.equal(g3.combat.d.round.reason, 'bomb'); assert(isDown(g3, 'C1', t3), 'the CT next to it died');
// Time runs out without a plant: CTs win. Twelve rounds, then sides swap ($800 again); first to 13 ends the match.
const g4 = { levels: {} }; startArena(g4, { map: 'hamlet', kind: 'defuse', bots: 0 }, t); const pl4 = [{ name: 'P', pose: at(ARENA_MAPS.hamlet.t[0]) }, { name: 'Q', pose: at(ARENA_MAPS.hamlet.ct[0]) }];
let t4 = t; const round4 = () => { for (let i = 0; i < (DEFUSE.freezeMs + DEFUSE.roundMs + DEFUSE.overMs + 300) / 50; i++) { t4 += 50; arenaTick(g4, pl4, .05, t4); } };
round4(); assert.equal(g4.combat.d.round.n ?? g4.combat.d.n, 2); assert.equal(g4.combat.d.score.ct, 1, 'time-out: CT win');
for (let r = 1; r < 12; r++) round4(); assert.equal(teamOf(g4, 'P'), 'ct', 'sides swapped after 12 rounds'); assert.equal(g4.combat.d.money.p, 800); assert.deepEqual(g4.combat.d.score, { t: 12, ct: 0 }, 'scores follow the teams');
for (let i = 0; i < (DEFUSE.freezeMs + 100) / 50; i++) { t4 += 50; arenaTick(g4, pl4, .05, t4); }   // round 13: the Terrorists (12 points) eliminate the CT
for (let i = 0; i < 8 && !isDown(g4, 'P', t4); i++) { applyHit(g4, 'Q', 'P', weaponById('deagle'), 'head', 10, 1, t4); t4 += 500; }
arenaTick(g4, pl4, .05, t4 + 50); assert(g4.combat.d.matchOver && g4.combat.d.matchOver.winner === 't', 'first to 13');
console.log('PASS: defuse · teams, buy rules ($, time, spawn), economy, plant 3.2 s / kit defuse 5 s, explosion, elimination, no respawn mid-round, friendly fire ⅓ + team-kill −$300, bomb drop (T-only pickup), time-out, halftime swap, first to 13');
