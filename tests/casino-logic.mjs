// Payday economy and casino rules (host-side, deterministic with a seeded RNG).
import assert from 'node:assert/strict';
import { startPayday, wallet, paySalary, casinoApply, casinoTick, handValue, bestHand, compareHands, slotPay, redactCasino, migrateCasino, LEVEL_BONUS, LOTTO, TABLES, SALARY, START_CASH, DARJA_CASH, DRINKS, DRINK_PRICE, luckOf, arsenalOf, SALARY_LOAN, salaryPlan, payoffOf, goalsOf, goalsDoneOf, GOALS } from '../dist/casino-logic.js';
import { combatApply, combatTick, hpOf, isDown } from '../dist/combat-logic.js';
import { startArena, arenaApply } from '../dist/arena-logic.js';
import { WEAPONS, MAX_HP, RESPAWN_MS, damageFor, weaponById } from '../dist/weapons-data.js';
import { mnt, money } from '../dist/money.js';

let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const game = { mode: 'campaign', levels: { earned: {} } };
assert.throws(() => casinoApply(game, { type: 'hello' }, 'Darja'), /Payday/);
startPayday(game);
const T = id => game.casino.tables[id], cash = n => wallet(game, n).cash;
assert.equal(cash('Darja'), 36000000, 'Darja starts with 36,000,000₮ (US$10,000)'); assert.equal(cash('darja '), DARJA_CASH); assert.equal(cash('Sam'), 1800000);
assert.equal(money(1800000), '1,800,000₮'); assert.equal(mnt(5000), 18000000);
assert.equal(TABLES.filter(t => t.game === 'roulette').length, 2); assert.equal(TABLES.filter(t => t.game === 'blackjack').length, 2);

// Salary once per job, level bonus.
assert.equal(paySalary(game, 'Sam', { type: 'rack', id: 'S1', pad: 'PAD-R01' }), SALARY.rack);
assert.equal(paySalary(game, 'Sam', { type: 'rack', id: 'S1', pad: 'PAD-R01' }), 0);
game.levels.earned = { 0: 1, 1: 1 }; casinoTick(game, rng); assert.equal(cash('Sam'), START_CASH + SALARY.rack + 2 * LEVEL_BONUS);

// Loans.
const d0 = cash('Darja'); casinoApply(game, { type: 'lend', to: 'Sam', amount: 3600000 }, 'Darja'); const loan = game.loans[0];
casinoApply(game, { type: 'repay', id: loan.id, amount: 1400000 }, 'Sam'); assert.equal(loan.owed, 2200000); casinoApply(game, { type: 'repay', id: loan.id }, 'Sam'); assert.equal(cash('Darja'), d0);

// Blackjack on both tables, limits per table.
assert.equal(handValue(['A♠', 'K♥']), 21); assert.equal(handValue(['A♠', 'A♥', '9♦']), 21);
assert.throws(() => casinoApply(game, { type: 'bj-bet', table: 'bj-2', amount: 50000 }, 'Darja', rng), /500,000₮/);
const before = cash('Darja') + cash('Sam');
casinoApply(game, { type: 'bj-bet', table: 'bj-1', amount: 400000 }, 'Darja', rng); casinoApply(game, { type: 'bj-bet', table: 'bj-1', amount: 200000 }, 'Sam', rng);
casinoApply(game, { type: 'bj-deal', table: 'bj-1' }, 'Sam', rng, 1000);
assert.equal(redactCasino(game.casino, 'Sam').tables['bj-1'].dealer[1], game.casino.tables['bj-1'].phase === 'playing' ? '??' : game.casino.tables['bj-1'].dealer[1], 'dealer hole card hidden while playing');
for (let g = 0; T('bj-1').phase === 'playing' && g < 20; g++) { const s = T('bj-1').seats[T('bj-1').turn]; casinoApply(game, { type: handValue(s.cards) < 15 ? 'bj-hit' : 'bj-stand', table: 'bj-1' }, s.name, rng, 1000); }
casinoTick(game, rng, 2000); assert.equal(T('bj-1').phase, 'done');
assert.equal(cash('Darja') + cash('Sam'), before - 600000 + T('bj-1').seats.reduce((a, s) => a + s.payout, 0));

// Roulette: timing for the 3D wheel and payouts.
const r0 = cash('Darja');
casinoApply(game, { type: 'rl-bet', table: 'rl-2', kind: 'red', amount: 1000000 }, 'Darja', rng); casinoApply(game, { type: 'rl-spin', table: 'rl-2' }, 'Darja', rng, 5000);
assert.equal(T('rl-2').landsAt - T('rl-2').spunAt, 7000);
casinoTick(game, rng, 11999); assert.equal(T('rl-2').phase, 'spinning', 'ball still rolling'); casinoTick(game, rng, 12000);
const n = T('rl-2').history[0], red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
assert.equal(cash('Darja'), r0 - 1000000 + (red ? 2000000 : 0));

// Poker hand ranking.
const H = (...c) => bestHand(c);
assert.equal(H('A♠', 'K♠', 'Q♠', 'J♠', '10♠', '2♦', '3♣').name, 'Royal flush');
assert.equal(H('5♠', '4♦', '3♠', '2♣', 'A♥', 'K♦', '9♣').name, 'Straight');
assert.equal(H('9♠', '9♦', '9♣', '4♠', '4♦', 'A♥', 'K♦').name, 'Full house');
assert.equal(H('2♥', '7♥', '9♥', 'J♥', 'K♥', 'A♠', 'A♦').name, 'Flush');
assert(compareHands(H('A♠', 'A♦', 'K♣', '7♦', '5♠', '3♥', '2♣'), H('A♥', 'A♣', 'Q♣', '7♣', '5♦', '3♦', '2♦')) > 0, 'kicker decides');
assert.equal(compareHands(H('A♠', 'K♦', 'Q♣', 'J♦', '9♠', '3♥', '2♣'), H('A♥', 'K♣', 'Q♦', 'J♣', '9♦', '3♦', '2♦')), 0, 'split');
assert(compareHands(H('6♠', '5♦', '4♣', '3♦', '2♠', 'K♥', 'K♣'), H('5♥', '4♣', '3♦', '2♣', 'A♦', 'Q♦', 'J♦')) > 0, '6-high straight beats the wheel');

// Poker: three players, blinds, betting, an all-in with a side pot, conservation of chips.
for (const p of ['Ana', 'Ben']) wallet(game, p).cash = 12000000;
casinoApply(game, { type: 'pk-sit', table: 'pk-1', seat: 0, buyIn: 4000000 }, 'Darja', rng, 0);
casinoApply(game, { type: 'pk-sit', table: 'pk-1', seat: 2, buyIn: 1200000 }, 'Ana', rng, 0);
casinoApply(game, { type: 'pk-sit', table: 'pk-1', seat: 4, buyIn: 4000000 }, 'Ben', rng, 0);
assert.throws(() => casinoApply(game, { type: 'pk-sit', table: 'pk-1', seat: 2, buyIn: 2000000 }, 'Sam', rng, 0), /taken/);
const pk = T('pk-1'), chips = () => pk.seats.filter(Boolean).reduce((a, s) => a + s.stack + s.total, 0) - (pk.phase === 'waiting' ? 0 : 0);
casinoTick(game, rng, 6000); assert.equal(pk.phase, 'preflop', 'hand starts with 2+ players'); assert.equal(pk.hand, 1);
const seated = pk.seats.filter(Boolean); assert(seated.every(s => s.cards.length === 2)); assert.equal(seated.reduce((a, s) => a + s.total, 0), 150000, 'blinds posted');
const masked = redactCasino(game.casino, 'Darja').tables['pk-1'].seats; assert.equal(masked[2].cards[0], '??', 'other hole cards hidden'); assert.notEqual(masked[0].cards[0], '??', 'own cards visible');
const act = (type, extra = {}) => { const s = pk.seats[pk.toAct]; return casinoApply(game, { type, table: 'pk-1', ...extra }, s.name, rng, 7000); };
assert.throws(() => casinoApply(game, { type: 'pk-check', table: 'pk-1' }, pk.seats[(pk.toAct + 2) % 5]?.name || 'Nobody', rng, 7000), /turn|seat/);
// Preflop: the first to act raises to 100, the short stack goes all-in (300), the other calls.
act('pk-raise', { to: 400000 }); let guard = 0;
while (pk.phase === 'preflop' && guard++ < 10) { const s = pk.seats[pk.toAct]; if (s.name === 'Ana') act('pk-allin'); else act(pk.currentBet > s.bet ? 'pk-call' : 'pk-check'); }
assert.equal(chips(), 9200000, 'chips conserved during the hand');
while (!['showdown'].includes(pk.phase) && guard++ < 40) { const s = pk.seats[pk.toAct]; if (!s) break; act(pk.currentBet > s.bet ? 'pk-call' : 'pk-check'); }
assert.equal(pk.phase, 'showdown'); assert.equal(pk.board.length, 5);
assert.equal(pk.seats.filter(Boolean).reduce((a, s) => a + s.stack, 0), 9200000, 'every chip is awarded (main + side pot)');
assert(pk.results.winners.length >= 1);
// A player who times out checks or folds; leaving cashes out to the wallet.
casinoTick(game, rng, 7000 + 9001); casinoTick(game, rng, 7000 + 12000);
const stacks = Object.fromEntries(pk.seats.filter(Boolean).map(s => [s.name, s.stack]));
if (pk.phase === 'preflop') { const who = pk.toAct; casinoTick(game, rng, 7000 + 12000 + 30001); assert(pk.seats[who].folded || pk.seats[who].acted, 'timer acts for an idle player'); }
const w0 = cash('Darja'), stackNow = pk.seats[0].stack; casinoApply(game, { type: 'pk-leave', table: 'pk-1' }, 'Darja', rng, 60000);
if (!pk.seats[0]) assert.equal(cash('Darja'), w0 + stackNow, 'cash-out returns the stack'); else assert(pk.seats[0].leaving, 'leaves after the hand');

// Slots: pays and return-to-player.
assert.equal(slotPay([5, 5, 5]), 250); assert.equal(slotPay([0, 0, 3]), 2.5); assert.equal(slotPay([1, 2, 3]), 0);
const g2 = { levels: {} }; startPayday(g2); wallet(g2, 'Bot').cash = 1e9; let paid = 0; const spins = 40000;
for (let i = 0; i < spins; i++) { const c0 = wallet(g2, 'Bot').cash; casinoApply(g2, { type: 'sl-spin', table: 'sl-1', amount: 5000 }, 'Bot', rng); paid += wallet(g2, 'Bot').cash - c0 + 5000; }
const rtp = paid / spins / 5000; assert(rtp > .85 && rtp < .98, 'slot return-to-player ' + rtp.toFixed(3));

// Lotto.
const j0 = T('lotto').jackpot, c0 = cash('Sam'), res = casinoApply(game, { type: 'lotto', picks: [1, 2, 3, 4, 5] }, 'Sam', rng);
assert.equal(new Set(res.balls).size, 5); assert.equal(T('lotto').jackpot, res.hits === 5 ? LOTTO.seed : j0 + LOTTO.add); assert.equal(cash('Sam'), c0 - LOTTO.price + res.prize);
// One machine: tickets queue in order (each waits for the draw before it); a third waiting ticket is refused.
{ const lt = T('lotto'), now0 = 5e12; lt.busyUntil = 0;
  for (let i = 0; i < 3; i++) casinoApply(game, { type: 'lotto', picks: [1, 2, 3, 4, 5] }, 'Darja', rng, now0);
  assert.deepEqual(lt.last.slice(0, 3).map(x => x.wait).reverse(), [0, LOTTO.drawMs, 2 * LOTTO.drawMs]);
  assert.throws(() => casinoApply(game, { type: 'lotto', picks: [1, 2, 3, 4, 5] }, 'Darja', rng, now0), /machine is busy/);
  casinoApply(game, { type: 'lotto', picks: [1, 2, 3, 4, 5] }, 'Darja', rng, now0 + LOTTO.drawMs); }
// Slots: another player can't pull the lever while someone's reels are still turning.
{ const now0 = 6e12; casinoApply(game, { type: 'sl-spin', table: 'sl-2', amount: 5000 }, 'Darja', rng, now0);
  assert.throws(() => casinoApply(game, { type: 'sl-spin', table: 'sl-2', amount: 5000 }, 'Sam', rng, now0 + 1000), /still spinning/);
  casinoApply(game, { type: 'sl-spin', table: 'sl-2', amount: 5000 }, 'Sam', rng, now0 + 3000); }

// Stage: tips request dances, queued in order, each 18 s.
const st = T('stage'), tip0 = cash('Darja');
assert.match(casinoApply(game, { type: 'st-tip', dance: 2, amount: 200000 }, 'Darja', rng, 100000), /starts now/); assert.equal(st.dance, 2); assert.equal(cash('Darja'), tip0 - 200000);
assert.match(casinoApply(game, { type: 'st-tip', dance: 5, amount: 70000 }, 'Sam', rng, 101000), /next in line/);
assert.throws(() => casinoApply(game, { type: 'st-tip', dance: 6, amount: 70000 }, 'Sam', rng, 101000), /six dances/); assert.throws(() => casinoApply(game, { type: 'st-tip', dance: 1, amount: 10000 }, 'Sam', rng, 101000), /70,000₮/);
casinoTick(game, rng, 118001); assert.equal(st.dance, 5); assert.equal(st.by, 'Sam'); casinoTick(game, rng, 136002); assert.equal(st.dance, -1);
// v34 saves migrate: chips still on the old tables go back to their owners.
const old = { payday: true, wallets: {}, casino: { blackjack: { phase: 'betting', seats: [{ name: 'Sam', bet: 40 }] }, roulette: { bets: [{ name: 'Sam', amount: 25 }] }, lotto: { jackpot: 7777, last: [], tickets: 3 } } };
wallet(old, 'Sam').cash = 100; migrateCasino(old); assert.equal(old.wallets.sam.cash, mnt(165), 'US$ chips returned, then converted'); assert.equal(old.casino.version, 3); assert.equal(old.casino.tables.lotto.jackpot, mnt(7777));
// Bar: a drink costs US$5,000 in ₮ and gives timed luck, good or bad at random; luck nudges own slots.
{ const g3 = { levels: {} }; startPayday(g3); wallet(g3, 'Bo').cash = 1e12; const kinds = new Set();
  for (let i = 0; i < 40; i++) { casinoApply(g3, { type: 'drink', drink: DRINKS[i % 8].id }, 'Bo', rng, 1000); kinds.add(luckOf(g3, 'Bo', 1000).kind); }
  assert.deepEqual([...kinds].sort(), ['lucky', 'unlucky'], 'drinks give both kinds of luck');
  assert.equal(wallet(g3, 'Bo').cash, 1e12 - [...Array(40).keys()].reduce((a, i) => a + DRINKS[i % 8].price, 0), 'each drink at its own price'); assert.equal(DRINK_PRICE, 5000); assert(DRINKS.every(d => d.price >= 5000 && d.price <= 50000), 'real bar prices');
  assert.equal(luckOf(g3, 'Bo', 1000 + 5 * 60000), null, 'luck wears off');
  assert.throws(() => casinoApply(g3, { type: 'drink', drink: 'kumis' }, 'Bo', rng), /menu/);
  const rtpWith = kind => { const g = { levels: {} }; startPayday(g); wallet(g, 'L').cash = 1e12; g.luck = { l: { kind, strength: .35, until: 9e15 } }; let paid = 0; const n = 30000;
    for (let i = 0; i < n; i++) { const c = wallet(g, 'L').cash; casinoApply(g, { type: 'sl-spin', table: 'sl-1', amount: 5000 }, 'L', rng, 1e6 + i * 3000); paid += wallet(g, 'L').cash - c + 5000; } return paid / n / 5000; };
  const lucky = rtpWith('lucky'), unlucky = rtpWith('unlucky'); assert(lucky > rtp + .05 && unlucky < rtp - .05, `luck moves slots: lucky ${lucky.toFixed(3)} · plain ${rtp.toFixed(3)} · unlucky ${unlucky.toFixed(3)}`);
  globalThis.__luck = [lucky, unlucky]; }
// No guns in Payday: the weapon market is gone, nobody owns a gun, the host refuses shots; old saves load.
{ const g4 = { levels: {} }; startPayday(g4); wallet(g4, 'Sam').cash = 1e9;
  assert.throws(() => casinoApply(g4, { type: 'buy-weapon', weapon: 'ak' }, 'Sam', rng), /only in Global Defensive/);
  assert.deepEqual(arsenalOf(g4, 'Sam'), []); assert.deepEqual(arsenalOf(g4, 'Darja'), [], 'no cannon either');
  assert(!TABLES.some(t => t.id === 'guns'), 'no weapon market station');
  const players = [{ id: 'p1', name: 'Sam', pose: { x: 0, y: 9.7, z: 50 } }, { id: 'p2', name: 'Darja', pose: { x: 0, y: 9.7, z: 80 } }];
  g4.arsenal = { sam: ['ak'] }; assert.throws(() => combatApply(g4, { type: 'hit', target: 'p2', weapon: 'ak' }, 'Sam', players, 'p1', 1000), /only in Global Defensive/, 'an old save with guns still cannot shoot');
  const old = { levels: {} }; startPayday(old); old.casino.tables.guns = { sold: 3, last: null }; migrateCasino(old); assert(!old.casino.tables.guns, 'old weapon-market table dropped on load'); }
// Combat (Global Defensive): host-checked hits, HP, head shots, range, fire rate, knock-out and respawn.
{ const g4 = { levels: {} }; startArena(g4, { map: 'yard', bots: 0 }, 1000); arenaApply(g4, { type: 'loadout', primary: 'ak' }, 'Sam');
  const players = [{ id: 'p1', name: 'Sam', pose: { x: 0, y: 9.7, z: 50 } }, { id: 'p2', name: 'Darja', pose: { x: 0, y: 9.7, z: 80 } }, { id: 'p3', name: 'Far', pose: { x: 0, y: 9.7, z: 1000 } }];
  assert.throws(() => combatApply(g4, { type: 'hit', target: 'p2', weapon: 'sniper' }, 'Sam', players, 'p1', 1000), /own/);
  let r = combatApply(g4, { type: 'hit', target: 'p2', weapon: 'ak' }, 'Sam', players, 'p1', 1000); const AK = weaponById('ak'), d30 = damageFor(AK, 'chest', 30); assert.equal(r.hp, MAX_HP - d30); assert(d30 >= 35 && d30 <= 36, 'AK chest ≈ 36');
  assert.throws(() => combatApply(g4, { type: 'hit', target: 'p2', weapon: 'ak' }, 'Sam', players, 'p1', 1010), /Too fast/);
  assert.throws(() => combatApply(g4, { type: 'hit', target: 'p3', weapon: 'ak' }, 'Sam', players, 'p1', 2000), /range/);
  assert.throws(() => combatApply(g4, { type: 'hit', target: 'p1', weapon: 'ak' }, 'Sam', players, 'p1', 2000), /target/);
  r = combatApply(g4, { type: 'hit', target: 'p2', weapon: 'ak', head: true }, 'Sam', players, 'p1', 4000); assert.equal(r.dmg, damageFor(AK, 'head', 30)); assert(r.dmg > 130, 'AK head shot one-shots (×4, CS2)'); assert(r.down);
  assert.throws(() => combatApply(g4, { type: 'hit', target: 'p1', weapon: 'pistol' }, 'Darja', players, 'p2', 4500), /knocked out/);
  assert.equal(g4.combat.kills.sam, 1); assert.equal(g4.combat.feed[0].target, 'Darja');
  assert(combatTick(g4, 4000 + g4.arena.respawnMs)); assert.equal(hpOf(g4, 'Darja'), MAX_HP); assert.equal(g4.combat.respawns.darja, 1);
  r = combatApply(g4, { type: 'hit', target: 'p1', weapon: 'pistol' }, 'Darja', players, 'p2', 20000); assert.equal(r.hp, MAX_HP - damageFor(weaponById('pistol'), 'chest', 30), "Darja's pistol works");
  arenaApply(g4, { type: 'loadout', primary: 'shotgun' }, 'Sam');
  r = combatApply(g4, { type: 'hit', target: 'p2', weapon: 'shotgun', pellets: 2 }, 'Sam', [{ ...players[0], pose: { x: 0, y: 9.7, z: 70 } }, players[1]], 'p1', 30000); assert.equal(r.hp, MAX_HP - damageFor(weaponById('shotgun'), 'chest', 10) * 2, 'two pellets'); }
// CS2 damage model: falloff with range differs by gun; hit groups; the host uses the real distance.
{ const ak = weaponById('ak'), dg = weaponById('deagle'), nv = weaponById('shotgun');
  assert(damageFor(ak, 'chest', 300) / damageFor(ak, 'chest', 5) > .9, 'rifles keep their damage at range');
  assert(damageFor(dg, 'chest', 300) / damageFor(dg, 'chest', 5) < .6, 'pistols lose damage at range');
  assert(damageFor(nv, 'chest', 60, 9) < damageFor(nv, 'chest', 5, 9), 'shotgun falls off');
  assert.equal(damageFor(ak, 'legs', 5), Math.round(36 * .75 * Math.pow(.98, 5 * 6.5 / 500)));
  const gz = { levels: {} }; startArena(gz, { map: 'yard', bots: 0 }, 1); arenaApply(gz, { type: 'loadout', primary: 'ak' }, 'Sam'); const pl = [{ id: 'a', name: 'Sam', pose: { x: 0, y: 9.7, z: 0 } }, { id: 'b', name: 'Bo', pose: { x: 0, y: 9.7, z: 300 } }];
  const far = combatApply(gz, { type: 'hit', target: 'b', weapon: 'ak', zone: 'chest' }, 'Sam', pl, 'a', 1000); assert.equal(far.dmg, damageFor(ak, 'chest', 300), 'host computes from real distance'); }
// Roulette is pure chance: every pocket about 1/37, colours independent of the previous spin.
{ const g5 = { levels: {} }; startPayday(g5); wallet(g5, 'R').cash = 1e15; const counts = Array(37).fill(0), seq = []; let t = 1e7, rr = Math.random;
  for (let i = 0; i < 37000; i++) { casinoApply(g5, { type: 'rl-bet', table: 'rl-1', kind: 'red', amount: 50000 }, 'R', rr, t); casinoApply(g5, { type: 'rl-spin', table: 'rl-1' }, 'R', rr, t); t += 7001; casinoTick(g5, rr, t); const n = g5.casino.tables['rl-1'].history[0]; counts[n]++; seq.push(n === 0 ? 'g' : [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n) ? 'r' : 'b'); }
  const chi = counts.reduce((a, c) => a + (c - 1000) ** 2 / 1000, 0); assert(chi < 75, 'chi-square over 36 d.o.f. ' + chi.toFixed(1));   // p ≈ 0.0002 cut-off
  const rr2 = seq.slice(1).filter((c, i) => seq[i] === 'r' && c === 'r').length / seq.slice(0, -1).filter(c => c === 'r').length; assert(Math.abs(rr2 - 18 / 37) < .02, 'red after red ' + rr2.toFixed(3));
  globalThis.__chi = chi; }
// Blackjack, Hold'em and lotto are fair: full decks, every card / ball equally likely.
{ const g6 = { levels: {} }; startPayday(g6); wallet(g6, 'B').cash = 1e15; const ranks = {}, first = {}; let t = 1e8, rounds = 6000, rr = Math.random;
  for (let i = 0; i < rounds; i++) { casinoApply(g6, { type: 'bj-bet', table: 'bj-1', amount: 50000 }, 'B', rr, t); casinoApply(g6, { type: 'bj-deal', table: 'bj-1' }, 'B', rr, t);
    const tb = g6.casino.tables['bj-1'], cs = [...tb.seats[0].cards, ...tb.dealer]; for (const c of cs) { const r = c.slice(0, -1); ranks[r] = (ranks[r] || 0) + 1; } const v = handValue(tb.seats[0].cards); first[v] = (first[v] || 0) + 1;
    if (tb.phase === 'playing') casinoApply(g6, { type: 'bj-stand', table: 'bj-1' }, 'B', rr, t); for (let k = 0; k < 4 && tb.phase !== 'done'; k++) casinoTick(g6, rr, t += 50); t += 9000; casinoTick(g6, rr, t); }
  const shoe = g6.casino.tables['bj-1'].shoe; assert(shoe.length <= 312);
  const total = Object.values(ranks).reduce((a, b) => a + b, 0), chiR = Object.values(ranks).reduce((a, c) => a + (c - total / 13) ** 2 / (total / 13), 0);
  assert.equal(Object.keys(ranks).length, 13); assert(chiR < 40, 'blackjack ranks uniform · χ² ' + chiR.toFixed(1) + ' (12 dof)');
  const p20 = first[20] / rounds; assert(p20 > .085 && p20 < .125, 'starting 20 ≈ 10.3% · got ' + (p20 * 100).toFixed(1) + '%');
  // Hold'em: 52 unique cards per hand.
  const g7 = { levels: {} }; startPayday(g7); for (const n of ['P1', 'P2', 'P3', 'P4', 'P5']) wallet(g7, n).cash = 1e12; ['P1', 'P2', 'P3', 'P4', 'P5'].forEach((n, i) => casinoApply(g7, { type: 'pk-sit', table: 'pk-1', seat: i, buyIn: 4000000 }, n, rr, 0));
  casinoTick(g7, rr, 6000); const pt = g7.casino.tables['pk-1'], dealt = [...pt.deck, ...pt.seats.flatMap(x => x.cards)];
  assert.equal(dealt.length, 52); assert.equal(new Set(dealt).size, 52, 'one full deck per hand');
  // Lotto: every ball equally likely.
  const g8 = { levels: {} }; startPayday(g8); wallet(g8, 'L').cash = 1e15; const balls = Array(37).fill(0); let lt = 1e9;
  for (let i = 0; i < 4000; i++) { casinoApply(g8, { type: 'lotto', picks: [1, 2, 3, 4, 5] }, 'L', rr, lt); lt += 9000; for (const b of g8.casino.tables.lotto.last[0].balls) balls[b]++; }
  const exp = 4000 * 5 / 36, chiL = balls.slice(1).reduce((a, c) => a + (c - exp) ** 2 / exp, 0); assert(chiL < 70, 'lotto balls uniform · χ² ' + chiL.toFixed(1) + ' (35 dof)');
  globalThis.__fair = 'blackjack χ² ' + chiR.toFixed(0) + '/12, starting 20 ' + (p20 * 100).toFixed(1) + '%, lotto χ² ' + chiL.toFixed(0) + '/35'; }
// Payday goals: three each, advanced by real events, claimed for a bonus, replaced by a new goal.
{ const g9 = { levels: {} }; startPayday(g9); wallet(g9, 'Gi').cash = 1e12; let s9 = 3; const r9 = () => (s9 = (s9 * 16807) % 2147483647) / 2147483647;
  assert.equal(goalsOf(g9, 'Gi', r9).length, 3); g9.goals.gi = [{ id: 'drink', progress: 0 }, { id: 'jobs', progress: 0 }, { id: 'tip', progress: 0 }];
  casinoApply(g9, { type: 'drink', drink: 'beer' }, 'Gi', r9, 1000);
  assert.equal(goalsDoneOf(g9, 'Gi').length, 1, 'drink goal met'); assert.equal(goalsOf(g9, 'Gi', r9).length, 3, 'a new goal replaces it'); assert(!g9.goals.gi.some(x => x.id === 'drink'));
  paySalary(g9, 'Gi', { type: 'rack', id: 'A', pad: '1' }); paySalary(g9, 'Gi', { type: 'patch', id: 'B', port: '2' }); assert.equal(g9.goals.gi.find(x => x.id === 'jobs').progress, 2);
  paySalary(g9, 'Gi', { type: 'unbox', id: 'C' }); assert.equal(goalsDoneOf(g9, 'Gi').length, 2, 'three jobs met');
  const c0 = wallet(g9, 'Gi').cash, want = GOALS.find(x => x.id === 'drink').reward + GOALS.find(x => x.id === 'jobs').reward;
  assert.match(casinoApply(g9, { type: 'claim-goals' }, 'Gi', r9), /claimed/); assert.equal(wallet(g9, 'Gi').cash, c0 + want); assert.throws(() => casinoApply(g9, { type: 'claim-goals' }, 'Gi', r9), /No finished/); }
// Цалингийн зээл: 20,000,000₮ from the bank, 2–10 installments with 2% a month interest (хүү), one loan at a time.
{ const gl = { levels: {} }; startPayday(gl); const c0 = wallet(gl, 'Tuul').cash; wallet(gl, 'Tuul').cash += 1e9; const W = () => wallet(gl, 'Tuul').cash;
  const p10 = salaryPlan(10); assert.deepEqual([p10.installment, p10.interest, p10.total], [2400000, 4000000, 24000000]); assert.equal(salaryPlan(1).months, 2); assert.equal(salaryPlan(40).months, 10);
  let w0 = W(); assert.match(casinoApply(gl, { type: 'salary-loan', months: 10 }, 'Tuul', rng), /10 × 2,400,000₮/); assert.equal(W(), w0 + SALARY_LOAN);
  assert.throws(() => casinoApply(gl, { type: 'salary-loan', months: 4 }, 'Tuul', rng), /Repay your salary loan first/);
  const ln = gl.loans.find(l => l.bank); w0 = W();
  for (let i = 0; i < 3; i++) casinoApply(gl, { type: 'pay-installment', id: ln.id }, 'Tuul', rng);
  assert.equal(W(), w0 - 3 * 2400000); assert.equal(ln.paid, 3); assert.equal(ln.owed, 14000000 + 7 * 400000);
  w0 = W(); assert.equal(payoffOf(ln), 14000000 + 400000, 'pay off = principal left + this month'); casinoApply(gl, { type: 'repay', id: ln.id }, 'Tuul', rng); assert.equal(W(), w0 - 14400000); assert.equal(ln.owed, 0);
  // 3 months: rounding lands in the last installment, the bank gets exactly 20,000,000 + 3 × 400,000.
  w0 = W(); casinoApply(gl, { type: 'salary-loan', months: 3 }, 'Tuul', rng); const l3 = gl.loans.filter(l => l.bank).at(-1);
  for (let i = 0; i < 3; i++) casinoApply(gl, { type: 'pay-installment', id: l3.id }, 'Tuul', rng);
  assert.equal(l3.owed, 0); assert.equal(W(), w0 + SALARY_LOAN - (SALARY_LOAN + 3 * 400000), 'exact total repaid');
  assert(!Object.values(gl.wallets).some(w => /bank/i.test(w.name)), 'the bank has no wallet');
  casinoApply(gl, { type: 'salary-loan', months: 2 }, 'Tuul', rng); wallet(gl, 'Bat'); const b0 = wallet(gl, 'Bat').cash;
  assert.match(casinoApply(gl, { type: 'lend', to: 'Bat', amount: 1e7 }, 'Tuul', rng), /Lent 10,000,000₮ to Bat/); assert.equal(wallet(gl, 'Bat').cash, b0 + 1e7, 'salary-loan money can be lent on'); }
// Darja's bank: only Darja; gives, takes back (never below 0), shows in the wallet history.
{ const gb = { levels: {} }; startPayday(gb);
  assert.match(casinoApply(gb, { type: 'bank', to: 'Sam', amount: 5e8 }, 'Darja', rng), /Gave 500,000,000₮ to Sam/); assert.equal(wallet(gb, 'Sam').cash, START_CASH + 5e8);
  assert.match(casinoApply(gb, { type: 'bank', to: 'Darja', amount: 1e9 }, 'darja', rng), /Gave/); assert.equal(wallet(gb, 'Darja').cash, DARJA_CASH + 1e9);
  assert.match(casinoApply(gb, { type: 'bank', to: 'Sam', amount: -1e12 }, 'Darja', rng), /Took/); assert.equal(wallet(gb, 'Sam').cash, 0, 'never below zero');
  assert.throws(() => casinoApply(gb, { type: 'bank', to: 'Sam', amount: 1e6 }, 'Sam', rng), /Only Darja/);
  assert.throws(() => casinoApply(gb, { type: 'bank', to: 'Sam', amount: 1e6 }, 'Darja Jr', rng), /Only Darja/);
  assert.match(wallet(gb, 'Sam').log[1].text, /Darja's bank/); }
console.log('PASS: casino logic · salary loan 20M₮ in 2–10 installments with хүү, Darja bank, Payday goals (events, claim, refill), fairness (' + globalThis.__fair + '), tögrög economy, bar luck (slots RTP lucky ' + globalThis.__luck[0].toFixed(2) + ' / unlucky ' + globalThis.__luck[1].toFixed(2) + '), no guns in Payday (market gone, shots refused, old saves load), arena combat HP/head/range/rate/respawn, roulette randomness (χ² ' + globalThis.__chi.toFixed(0) + '/36 dof),  lotto queue + busy slot guard, wallets, salary, loans, 2 blackjack + 2 roulette tables with limits, roulette timing, poker hand ranking, 3-player Hold\'em with all-in side pot and hidden hole cards, timer, cash-out, slots RTP ' + rtp.toFixed(3) + ', lotto, stage tips and dance queue, v34 migration.');
