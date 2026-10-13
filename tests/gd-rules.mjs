// Global Defensive host match rules (arena-defuse.js cleanRules / MATCH_PRESETS, the 'settings' action): limits,
// presets, host-only, lobby changes apply at once and match changes from the next match (also when the same map
// restarts by itself), round time, starting and maximum money, friendly fire off, and what happens at a tie —
// sudden death, a draw, or MR3 overtime ($10,000 blocks of six, sides swap after three, 4 of 6 wins a block).
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, LOBBY_MS } from '../dist/arena-logic.js';
import { DEFUSE, cleanRules, MATCH_PRESETS, RULE_LIMITS } from '../dist/arena-defuse.js';
import { applyHit, isDown } from '../dist/combat-logic.js';
import { buildReport } from '../dist/gd-report.js';
import { ARENA_MAPS } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { weaponById } from '../dist/weapons-data.js';
let seed = 7; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + M.nav.floorAt(x, z), z: ARENA.cz + z, yaw: 0 });

// ── Limits ──
{ const r = cleanRules({ win: 99, roundS: 10, start: -5, max: 1e9, ot: 'forever' });
  ok('values are kept inside the limits', r.win === RULE_LIMITS.win[1] && r.roundS === RULE_LIMITS.roundS[0] && r.start === 0 && r.max === RULE_LIMITS.max[1], JSON.stringify(r));
  ok('an unknown tie rule falls back to sudden death; friendly fire defaults on', r.ot === 'sudden' && r.ff === true);
  ok('nonsense numbers fall back to the defaults', cleanRules({ win: 'x' }).win === DEFUSE.win);
  ok('every preset is within the limits', Object.values(MATCH_PRESETS).every(p => JSON.stringify(cleanRules(p)) === JSON.stringify({ ...cleanRules({}), ...p }))); }

// ── The settings action: host only; lobby → now; match → from the next match (restart, next map, or the same map again) ──
{ let t = 1e10; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, lobbyMs: LOBBY_MS }, t);
  const P = [{ id: 'h', name: 'Host', pose: at(M.t[0]) }, { id: 'g', name: 'Guest', pose: at(M.ct[0]) }]; arenaTick(g, P, .05, t += 50);
  assert.throws(() => arenaApply(g, { type: 'settings', preset: 'short' }, 'Guest', P, t, { isHost: false }), /Only the host/); n++;
  assert.throws(() => arenaApply(g, { type: 'settings', preset: 'nonsense' }, 'Host', P, t), /Unknown preset/); n++;
  const msg = arenaApply(g, { type: 'settings', preset: 'short', rules: { start: 2400 } }, 'Host', P, t);
  ok('in the lobby the rules apply at once', g.arena.rules.win === 9 && g.combat.d.rules.win === 9 && g.arena.rules.start === 2400 && !/next match/.test(msg), msg);
  arenaApply(g, { type: 'start-match' }, 'Host', P, t += 50); arenaTick(g, P, .05, t += 50); const d = g.combat.d;
  ok('the match starts with the lobby’s rules: first to 9, $2400 each', d.rules.win === 9 && d.money.host === 2400 && d.money.guest === 2400, JSON.stringify([d.rules, d.money]));
  const msg2 = arenaApply(g, { type: 'settings', rules: { win: 5, ff: false } }, 'Host', P, t);
  ok('during a match: queued for the next match, this one unchanged', /next match/.test(msg2) && g.combat.d.rules.win === 9 && g.combat.d.rules.ff === true && g.arena.rulesNext.win === 5 && g.arena.rulesNext.start === 2400, msg2);
  // The match ends; the same map starts again by itself → the queued rules take over.
  d.matchOver = { at: t, winner: 't' }; arenaTick(g, P, .05, t += DEFUSE.matchOverMs + 100);
  ok('the next match (same map, restarted by itself) uses the queued rules', g.combat.d !== d && g.combat.d.rules.win === 5 && g.combat.d.rules.ff === false && !g.arena.rulesNext, JSON.stringify(g.combat.d.rules));
  arenaApply(g, { type: 'settings', rules: { win: 7 } }, 'Host', P, t); arenaApply(g, { type: 'restart' }, 'Host', P, t += 50);
  ok('a host restart uses the queued rules too', g.arena.rules.win === 7 && g.combat.d.rules.win === 7 && !g.arena.rulesNext); }

// Drive a match: `win(k)` ends the current round with player k's side winning (CT by time, T by the bomb).
function match(rules, players = ['Ann', 'Cy']) {
  let t = 2e10 + Math.random() * 1e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, freezeS: 0, rules }, t);
  const P = players.map((name, i) => ({ id: 'p' + i, name, pose: at(i % 2 ? M.ct[i >> 1] : M.t[i >> 1]) })); arenaTick(g, P, .05, t += 50);
  const d = () => g.combat.d, tick = ms => { arenaTick(g, P, .05, t += ms); };
  const win = k => { const side = d().teams[k.toLowerCase()], r = d().round; assert.equal(r.phase, 'live', 'round live before ending it');
    if (side === 'ct') r.endsAt = t + 1; else { r.phase = 'planted'; r.planted = { x: ARENA.cx + M.siteGoals.A[0], z: ARENA.cz + M.siteGoals.A[1], y: 0, site: 'A', at: t, explodeAt: t + 1, by: 'x' }; }
    tick(50); assert.equal(r.winner, side, 'the round went to ' + k); if (!d().matchOver) tick(DEFUSE.overMs + 50); };
  return { g, P, d, win, tick, get t() { return t; } };
}
const teamScore = (d, k) => d.score[d.teams[k]];

// ── Round time, money cap ──
{ const m = match({ roundS: 60, max: 5000, start: 4800 }); const r = m.d().round;
  ok('round time: 60 s after the freeze', r.endsAt - r.freezeUntil === 60000, r.endsAt - r.freezeUntil);
  m.win('Ann'); ok('money never goes over the maximum ($5000)', m.d().money.ann === 5000 && m.d().money.cy <= 5000, JSON.stringify(m.d().money)); }

// ── Friendly fire off: no damage, no penalty; on: a third ──
for (const ff of [false, true]) { const m = match({ ff }, ['A1', 'B1', 'A2', 'B2']), d = m.d(); const [x, y] = Object.keys(d.teams).filter(k => d.teams[k] === d.teams.a1); const money = d.money[x];
  const dmg = applyHit(m.g, x, y, weaponById('ak'), 'chest', 10, 1, m.t + 10).dmg;
  if (!ff) { for (let i = 0; i < 10; i++) applyHit(m.g, x, y, weaponById('ak'), 'head', 10, 1, m.t + 20 + i * 200);
    ok('friendly fire off: a team mate takes no damage, is never killed, and nobody pays', dmg === 0 && !isDown(m.g, y, m.t + 3000) && d.money[x] === money, JSON.stringify({ dmg, money: d.money[x] })); }
  else ok('friendly fire on: a third of the damage', dmg > 0 && dmg < 20, dmg); }

// ── Regulation: halftime swap, first to `win` ──
{ const m = match({ win: 5 }); const side0 = m.d().teams.ann;
  for (let i = 0; i < 4; i++) m.win(i % 2 ? 'Cy' : 'Ann');
  ok('halftime after win − 1 rounds (4 for first to 5): sides swap, money back to the start', m.d().teams.ann !== side0 && m.d().money.ann === 800 && teamScore(m.d(), 'ann') === 2, JSON.stringify([m.d().teams, m.d().score]));
  m.win('Ann'); m.win('Ann'); ok('not over at 4', !m.d().matchOver); m.win('Ann'); ok('first to 5 wins', m.d().matchOver?.winner === m.d().teams.ann && teamScore(m.d(), 'ann') === 5); }

// ── A tie at win − 1 each ──
const tie = (m, w) => { for (let i = 0; i < 2 * (w - 1); i++) m.win(i % 2 ? 'Cy' : 'Ann'); };
{ const m = match({ win: 5, ot: 'sudden' }); tie(m, 5); ok('sudden death: 4–4 is not over', !m.d().matchOver); m.win('Cy'); ok('sudden death: the next round decides', m.d().matchOver?.winner === m.d().teams.cy); }
{ const m = match({ win: 5, ot: 'draw' }); tie(m, 5); const o = m.d().matchOver;
  ok('draw: 4–4 ends the match as a draw', o && o.draw === true && o.winner === null, JSON.stringify(o));
  const R = buildReport(m.g); ok('the report shows a draw (no winners)', R.winner === null && R.score.t === 4 && R.score.ct === 4, JSON.stringify([R.winner, R.score])); }
{ const m = match({ win: 5, ot: 'mr3', start: 800 }); tie(m, 5); const d = m.d;
  ok('MR3: 4–4 goes to overtime', !d().matchOver && d().n === 9);
  ok('overtime starts with $10,000 each, sides as they were', d().money.ann === 10000 && d().money.cy === 10000, JSON.stringify(d().money));
  const sideOT = d().teams.ann; m.win('Ann'); m.win('Cy'); m.win('Ann');   // 6–5 after three overtime rounds
  ok('overtime halftime after 3 rounds: sides swap, $10,000 again', d().teams.ann !== sideOT && d().money.ann === 10000 && teamScore(d(), 'ann') === 6, JSON.stringify([d().teams, d().score, d().money]));
  m.win('Cy'); m.win('Ann'); ok('7–6: not yet', !d().matchOver); m.win('Cy');   // 7–7 after six: the block is drawn
  ok('a drawn block (7–7) plays another one, $10,000 again', !d().matchOver && d().money.ann === 10000 && teamScore(d(), 'ann') === 7, JSON.stringify([d().score, d().money]));
  m.win('Ann'); m.win('Ann'); m.win('Ann'); ok('10–7 is not enough (4 of 6 wins a block)', !d().matchOver);
  m.win('Ann'); ok('11–7 wins the second overtime', d().matchOver?.winner === d().teams.ann && teamScore(d(), 'ann') === 11, JSON.stringify(d().score)); }
{ const m = match({ win: 5, ot: 'mr3' }); tie(m, 5); for (let i = 0; i < 4; i++) m.win('Cy');
  ok('MR3: 4 straight overtime wins end it (8–4)', m.d().matchOver?.winner === m.d().teams.cy && teamScore(m.d(), 'cy') === 8); }

console.log('PASS: match rules · ' + n + ' checks (limits, presets, host only, lobby now / match next — also on a restart by itself, round time, money cap, friendly fire off, halftime, sudden death, draw, MR3 overtime blocks)');
