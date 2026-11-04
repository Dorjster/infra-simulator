// Global Defensive (Defuse): CS2's round-end win panel and Tab scoreboard (dist/gd-round-panel.js) on the host's match
// stats (dist/arena-defuse.js matchStats): the MVP's reason and round stats, assists (41+ damage to a player someone else
// killed), HS%, damage, the round history, money shown only to your own side, a fresh table on a rematch, and the panel's
// per-frame update allocating nothing.
//   node tests/gd-round-panel.mjs        (re-runs itself with --expose-gc for the allocation check)
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
const { startArena, arenaTick, rematch } = await import('../dist/arena-logic.js');
const { DEFUSE, matchStats } = await import('../dist/arena-defuse.js');
const { hurt } = await import('../dist/combat-logic.js');
const { ARENA_MAPS } = await import('../dist/arena-maps.js');
const { ARENA } = await import('../dist/facility-layout.js');
const { weaponById } = await import('../dist/weapons-data.js');
const { statsOf, roundPanelHTML, createRoundPanel, boardRows, boardHTML, historyHTML, damageReportLines } = await import('../dist/gd-round-panel.js');
let fails = 0, n = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL:', m); } };

const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: ARENA.cz + z, yaw: 0 });
function match() { let t = 7e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, freezeS: 1 }, t);
  const players = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Bo', pose: at(M.t[1] || M.t[0]) }, { name: 'Cy', pose: at(M.ct[0]) }, { name: 'Di', pose: at(M.ct[1] || M.ct[0]) }];
  const tick = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, players, .05, t); } };
  tick(50); const d = g.combat.d; d.teams.ann = d.teams.bo = 't'; d.teams.cy = d.teams.di = 'ct'; tick(1100); return { g, d, players, tick, now: () => t }; }
const ak = weaponById('ak');

const { g, d, players, tick, now } = match(); ok(d.round.phase === 'live', 'live');
ok(matchStats(g) && Object.keys(matchStats(g).p).length === 0 && matchStats(g).r.length === 0, 'a new match: empty match stats');
// Bo 50 to Cy, Ann head-shots Cy (50 left); Bo 40 to Di (no assist: 40), Ann kills Di (60 left).
hurt(g, 'Bo', 'Cy', ak, 50, 'chest', now()); hurt(g, 'Ann', 'Cy', ak, 100, 'head', now()); hurt(g, 'Bo', 'Di', ak, 40, 'chest', now()); hurt(g, 'Ann', 'Di', ak, 100, 'chest', now()); tick(100);
const r = d.round, ms = matchStats(g);
ok(r.phase === 'over' && r.winner === 't' && r.reason === 'elim', 'Terrorists win by elimination');
ok(r.mvp?.k === 'ann' && r.mvp.why === 'kills' && r.mvp.kills === 2 && r.mvp.dmg === 110 && r.mvp.hs === 1, 'MVP Ann: 2 kills, 110 damage, 1 head shot: ' + JSON.stringify(r.mvp));
const A = statsOf(g.combat, ms, 'ann'), B = statsOf(g.combat, ms, 'bo'), Cy = statsOf(g.combat, ms, 'cy');
ok(A.k === 2 && A.d === 0 && A.mvp === 1 && A.hsk === 1 && A.hsp === 50 && A.dmg === 110, 'Ann: K 2, MVP 1, HS 50%, 110 damage: ' + JSON.stringify(A));
ok(B.a === 1 && B.k === 0 && B.dmg === 90, 'Bo: one assist (50 to Cy), none for 40 to Di, 90 damage: ' + JSON.stringify(B));
ok(Cy.d === 1 && Cy.k === 0 && Cy.hsp === 0, 'Cy: one death, HS% 0 with no kills');
ok(ms.r.length === 1 && ms.r[0][0] === 't' && ms.r[0][1] === 'elim' && historyHTML(ms, d).includes('☠'), 'round history: T won, elimination');
ok(!('ms' in g.combat) && !JSON.stringify(g.combat).includes('"sumN"'), 'match stats are not in the per-frame combat state');
const ph = roundPanelHTML(d, g.combat, ms, 'ann');
ok(ph.includes('TERRORISTS WIN') && ph.includes('All enemies eliminated') && ph.includes('Most eliminations') && ph.includes('Ann') && ph.includes('>110<'), 'the win panel: banner, reason, MVP card');
ok(/Your round: <b>110<\/b> damage to (Cy|Di)/.test(ph) && ph.includes('took <b>0</b>'), 'your round line: ' + ph.slice(ph.indexOf('rp-me')));
ok(roundPanelHTML(d, g.combat, ms, 'cy').includes('took <b>100</b> in 2 hits'), 'Cy took 100 in 2 hits');
// Panel texts for the other endings, no MVP.
{ const dd = { n: 3, teams: { cy: 'ct' }, round: { phase: 'over', winner: 'ct', reason: 'defuse', mvp: { k: 'cy', why: 'defuse', kills: 0, dmg: 0, hs: 0 } } };
  const h = roundPanelHTML(dd, { names: { cy: 'Cy' } }, null, 'cy'); ok(h.includes('COUNTER-TERRORISTS WIN') && h.includes('Bomb defused') && h.includes('Defused the bomb'), 'defused: CT banner and MVP reason');
  dd.round = { phase: 'over', winner: 't', reason: 'bomb', mvp: null }; const h2 = roundPanelHTML(dd, {}, null, 'cy'); ok(h2.includes('Bomb exploded') && !h2.includes('rp-mvp'), 'no MVP: only the banner');
  dd.round = { phase: 'over', winner: 'ct', reason: 'time', mvp: null }; ok(roundPanelHTML(dd, {}, null, 'cy').includes('Target saved'), 'time out: Target saved');
  dd.round.phase = 'freeze'; ok(roundPanelHTML(dd, {}, null, 'cy') === '', 'freeze: no panel'); }
// The board: CT on top, money only for your side, sorted by kills then damage.
const list = ['Ann', 'Bo', 'Cy', 'Di', 'BOT Eve'];
ok(boardRows(d, g.combat, ms, list, 'ct', 't', 'ann', () => false).every(p => p.money === null) && boardRows(d, g.combat, ms, list, 't', 't', 'ann', () => false).every(p => p.money !== null), 'money: your side only');
ok(boardRows(d, g.combat, ms, list, 't', 't', 'ann', () => false).map(p => p.key).join() === 'ann,bo', 'sorted by kills then damage');
{ d.teams['bot eve'] = 'ct'; const h = boardHTML({ d, C: g.combat, ms, list, viewerTeam: 't', me: 'ann', isDown: nm => nm === 'Cy', ping: nm => nm === 'Ann' ? 23.4 : null });
  ok(h.includes('<th class="gb-ping">PING</th><th>PLAYER</th>') && h.includes('<td class="gb-ping">23</td><td>Ann'), 'v53: CS2\'s ping cell first (your round trip, ms)');
  ok(h.indexOf('COUNTER-TERRORISTS') < h.indexOf('>TERRORISTS<'), 'CT block above T');
  ok(h.includes('<td class="gb-ping"><span class="gb-bot">BOT</span></td><td>Eve') && h.includes('★1') && h.includes('50%') && /class="dead"/.test(h) && /class=" me"/.test(h), 'BOT tag (in the ping cell, as CS2), MVP star, HS%, dead dimmed, you highlighted');
  const ctPart = h.slice(h.indexOf('gb ct'), h.indexOf('gb t')); ok(!/\$\d/.test(ctPart), 'no money shown on the other side\'s block'); delete d.teams['bot eve']; }
// The panel on the page: written once per round end, hidden at the freeze, no allocation per frame.
const el = { hidden: true, innerHTML: '' }, P = createRoundPanel(el);
ok(P.update(d, g.combat, ms, 'ann') === true && !el.hidden && el.innerHTML.includes('ROUND MVP'), 'shown at the round end');
ok(P.update(d, g.combat, ms, 'ann') === false, 'unchanged: not written again');
{ const frames = k => { for (let i = 0; i < k; i++) P.update(d, g.combat, ms, 'ann'); }; frames(20000);
  const round = () => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; frames(200000); gc(); gc(); return process.memoryUsage().heapUsed - h0; };
  const dh = Math.min(round(), round(), round()); ok(dh < 64 * 1024, 'no per-frame allocation in the panel update (' + dh + ' B over 200k frames)'); }
tick(DEFUSE.overMs + 100); ok(d.round.phase === 'freeze' || d.round.phase === 'live', 'the next round');
ok(P.update(d, g.combat, ms, 'ann') === true && el.hidden, 'hidden at the next freeze');
// A rematch: a new match object, empty stats.
rematch(g, players, now()); const ms2 = matchStats(g);
ok(ms2 && ms2 !== ms && Object.keys(ms2.p).length === 0 && ms2.r.length === 0, 'a rematch resets the match stats');
ok(statsOf(g.combat, ms2, 'ann').k === 0 && statsOf(g.combat, ms2, 'ann').mvp === 0, 'Ann starts the new match at 0');

if (fails) { console.error(`FAIL: gd-round-panel · ${fails} of ${n}`); process.exit(1); }
// v53 HUD: the console's damage report (CS2's lines), given and taken, from the round's report
{ const L = damageReportLines({ ann: { g: [['bob', 100, 1], ['cy', 27, 2]], d: 127, t: 40, th: 1 }, bob: { g: [['ann', 40, 1]], d: 40, t: 100, th: 1 }, cy: { g: [], d: 0, t: 27, th: 2 } }, 'ann', { names: { ann: 'Ann', bob: 'Bob', cy: 'Cy' } });
  ok(L.join('\n') === ['Player: Ann - Damage Given', '-------------------------', 'Damage Given to "Bob" - 100 in 1 hit', 'Damage Given to "Cy" - 27 in 2 hits', 'Player: Ann - Damage Taken', '-------------------------', 'Damage Taken from "Bob" - 40 in 1 hit'].join('\n'), 'v53: the console damage report, CS2\'s lines (given to each, taken from each)', L.join(' / '));
  ok(damageReportLines(null, 'ann').length === 0, 'no report, no lines'); }
console.log(`PASS: gd-round-panel · ${n} checks`);
