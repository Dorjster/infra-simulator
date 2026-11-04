// Global Defensive · Defuse money rules the v53 UI audit found missing (v53 HITS; dist/arena-defuse.js), on the host:
//  · a round lost on time (no plant): the Terrorists still alive earn $0 — CS2's Team_Cash_Award_no_income " +$0
//    penalty for running out of time" (the string is CS2's, the rule CS:GO's) — the dead ones the loss bonus; the
//    loss streak counts the round either way;
//  · the defuser's own award (Player_Cash_Award_Bomb_Defused " +$%s1 for defusing the C4"; the cvar
//    cash_player_bomb_defused is in the install's whitelist, its value isn't: CS:GO's $300, labelled) on top of the
//    team's $3,500;
//  · the overtime MATCH POINT alert (gd-hud-alerts.js matchPoint): MR3 — none at 12–12, at 15–14 (and 15–12), at 18–17
//    in the second block; regulation's 12–x still; not at 15–15.
//   node tests/gd-money-rules.mjs
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick } from '../dist/arena-logic.js';
import { DEFUSE, DEFUSE_AWARD, noIncome } from '../dist/arena-defuse.js';
import { applyHit } from '../dist/combat-logic.js';
import { ARENA_MAPS } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { weaponById } from '../dist/weapons-data.js';
import { alertFor, matchPoint } from '../dist/gd-hud-alerts.js';
let n = 0; const ok = (c, m) => { assert(c, m); n++; if (process.env.V) console.log('  ok ' + m); };
let seed = 11; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: ARENA.cz + z, yaw: 0 });
const match = () => { let t = 7e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t);
  const players = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Bo', pose: at(M.t[1] || M.t[0]) }, { name: 'Cy', pose: at(M.ct[0]) }, { name: 'Di', pose: at(M.ct[1] || M.ct[0]) }];
  const tick = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, players, .05, t); } };
  tick(50); return { g, d: g.combat.d, players, tick, now: () => t }; };

// ── 1. time runs out, no plant: the Terrorist alive earns $0, the dead one the loss bonus ──
{ const { g, d, players, tick, now } = match(); const T = Object.keys(d.teams).filter(k => d.teams[k] === 't'), CT = Object.keys(d.teams).filter(k => d.teams[k] === 'ct');
  ok(T.length === 2 && CT.length === 2, 'two a side');
  tick(DEFUSE.freezeMs + 100);
  const dead = T[0], alive = T[1], killer = players.find(p => p.name.toLowerCase() === CT[0]).name, victim = players.find(p => p.name.toLowerCase() === dead).name;
  for (let k = 0; k < 6 && !g.combat.down?.[dead]; k++) applyHit(g, killer, victim, weaponById('ak'), 'head', 100, 1, now());
  ok(!!g.combat.down?.[dead], 'one Terrorist killed');
  const m0 = { ...d.money }, streak = d.loss.t; tick(DEFUSE.roundMs + 500);
  ok(d.round.phase === 'over' && d.round.reason === 'time' && d.round.winner === 'ct', 'the clock ran out unplanted: the CTs win (time)');
  ok(d.money[alive] === m0[alive], `the Terrorist still alive: +$0 ("+$0 penalty for running out of time") — $${m0[alive]} → $${d.money[alive]}`);
  ok(d.money[dead] === Math.min(16000, m0[dead] + 1400), `the dead Terrorist: the loss bonus $1,400 — $${m0[dead]} → $${d.money[dead]}`);
  ok(d.money[CT[1]] === Math.min(16000, m0[CT[1]] + 3250), 'the CTs: the time win $3,250');
  ok(d.loss.t === streak + 1, 'the loss streak counts it');
  ok(noIncome(g.combat, 't', 'time', alive) && !noIncome(g.combat, 't', 'time', dead) && !noIncome(g.combat, 't', 'elim', alive) && !noIncome(g.combat, 'ct', 'time', CT[0]), 'only a time loss, only the Terrorists alive'); }

// ── 2. the defuse: the defuser's own $300 on top of the team's $3,500 ──
{ const { g, d, players, tick, now } = match(); tick(DEFUSE.freezeMs + 100);
  const carrier = d.bomb.carrier, P = players.find(p => p.name.toLowerCase() === carrier), site = M.siteGoals?.A || M.sites.A.slice(0, 2); P.pose = at(site);
  arenaApply(g, { type: 'plant', hold: true }, P.name, players, now()); tick(DEFUSE.plantMs + 200); ok(d.round.phase === 'planted', 'planted');
  const ctk = Object.keys(d.teams).find(k => d.teams[k] === 'ct'), C = players.find(p => p.name.toLowerCase() === ctk), other = Object.keys(d.teams).find(k => d.teams[k] === 'ct' && k !== ctk);
  C.pose = { ...P.pose, x: P.pose.x + 2 }; const m0 = { ...d.money }; arenaApply(g, { type: 'defuse', hold: true }, C.name, players, now()); tick(DEFUSE.defuseMs + 300);
  ok(d.round.phase === 'over' && d.round.reason === 'defuse', 'defused');
  ok(DEFUSE_AWARD === 300 && d.money[ctk] === Math.min(16000, m0[ctk] + 300 + 3500), `the defuser: +$300 (CS:GO's cash_player_bomb_defused) + $3,500 — $${m0[ctk]} → $${d.money[ctk]}`);
  ok(d.money[other] === Math.min(16000, m0[other] + 3500), 'a team mate: the $3,500 only'); }

// ── 3. MATCH POINT in MR3 overtime ──
const D = (t, ct, o = {}) => ({ round: { phase: 'freeze' }, n: t + ct + 1, score: { t, ct }, rules: { win: 13, ot: 'mr3', ...o } });
ok(!matchPoint(D(12, 12)) && alertFor('over', D(12, 12)) === null, 'MR3, 12–12: overtime starts — no MATCH POINT');
ok(matchPoint(D(15, 14)) && alertFor('over', D(15, 14)) === 'matchPoint', 'MR3, 15–14: MATCH POINT');
ok(matchPoint(D(15, 12)) && matchPoint(D(13, 15)) && !matchPoint(D(14, 13)) && !matchPoint(D(13, 12)), 'MR3 first block: 15–12 and 13–15 yes; 14–13, 13–12 no');
ok(!matchPoint(D(15, 15)) && matchPoint(D(18, 17)) && !matchPoint(D(16, 15)), 'MR3 second block (15–15): 18–17 yes; 15–15, 16–15 no');
ok(matchPoint(D(12, 7)) && matchPoint(D(11, 12)), 'regulation: 12–7, 11–12 still MATCH POINT');
ok(matchPoint({ score: { t: 12, ct: 12 }, rules: { win: 13, ot: 'sudden' } }), 'sudden death at 12–12: the next round decides — MATCH POINT');
console.log(`PASS: gd-money-rules · ${n} checks (time-out survivors $0, the defuser's $300, MR3 overtime match point at 15–14 / 18–17 and none at 12–12)`);
