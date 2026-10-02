// Payday economy and casino rules (host-side, deterministic with a seeded RNG).
import assert from 'node:assert/strict';
import { startPayday, wallet, paySalary, casinoApply, casinoTick, handValue, bestHand, compareHands, slotPay, redactCasino, migrateCasino, LEVEL_BONUS, LOTTO, TABLES } from '../dist/casino-logic.js';

let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const game = { mode: 'campaign', levels: { earned: {} } };
assert.throws(() => casinoApply(game, { type: 'hello' }, 'Darja'), /Payday/);
startPayday(game);
const T = id => game.casino.tables[id], cash = n => wallet(game, n).cash;
assert.equal(cash('Darja'), 10000, 'Darja starts with $10,000'); assert.equal(cash('darja '), 10000); assert.equal(cash('Sam'), 500);
assert.equal(TABLES.filter(t => t.game === 'roulette').length, 2); assert.equal(TABLES.filter(t => t.game === 'blackjack').length, 2);

// Salary once per job, level bonus.
assert.equal(paySalary(game, 'Sam', { type: 'rack', id: 'S1', pad: 'PAD-R01' }), 150);
assert.equal(paySalary(game, 'Sam', { type: 'rack', id: 'S1', pad: 'PAD-R01' }), 0);
game.levels.earned = { 0: 1, 1: 1 }; casinoTick(game, rng); assert.equal(cash('Sam'), 650 + 2 * LEVEL_BONUS);

// Loans.
const d0 = cash('Darja'); casinoApply(game, { type: 'lend', to: 'Sam', amount: 1000 }, 'Darja'); const loan = game.loans[0];
casinoApply(game, { type: 'repay', id: loan.id, amount: 400 }, 'Sam'); assert.equal(loan.owed, 600); casinoApply(game, { type: 'repay', id: loan.id }, 'Sam'); assert.equal(cash('Darja'), d0);

// Blackjack on both tables, limits per table.
assert.equal(handValue(['A♠', 'K♥']), 21); assert.equal(handValue(['A♠', 'A♥', '9♦']), 21);
assert.throws(() => casinoApply(game, { type: 'bj-bet', table: 'bj-2', amount: 50 }, 'Darja', rng), /\$100/);
const before = cash('Darja') + cash('Sam');
casinoApply(game, { type: 'bj-bet', table: 'bj-1', amount: 100 }, 'Darja', rng); casinoApply(game, { type: 'bj-bet', table: 'bj-1', amount: 50 }, 'Sam', rng);
casinoApply(game, { type: 'bj-deal', table: 'bj-1' }, 'Sam', rng, 1000);
assert.equal(redactCasino(game.casino, 'Sam').tables['bj-1'].dealer[1], game.casino.tables['bj-1'].phase === 'playing' ? '??' : game.casino.tables['bj-1'].dealer[1], 'dealer hole card hidden while playing');
for (let g = 0; T('bj-1').phase === 'playing' && g < 20; g++) { const s = T('bj-1').seats[T('bj-1').turn]; casinoApply(game, { type: handValue(s.cards) < 15 ? 'bj-hit' : 'bj-stand', table: 'bj-1' }, s.name, rng, 1000); }
casinoTick(game, rng, 2000); assert.equal(T('bj-1').phase, 'done');
assert.equal(cash('Darja') + cash('Sam'), before - 150 + T('bj-1').seats.reduce((a, s) => a + s.payout, 0));

// Roulette: timing for the 3D wheel and payouts.
const r0 = cash('Darja');
casinoApply(game, { type: 'rl-bet', table: 'rl-2', kind: 'red', amount: 200 }, 'Darja', rng); casinoApply(game, { type: 'rl-spin', table: 'rl-2' }, 'Darja', rng, 5000);
assert.equal(T('rl-2').landsAt - T('rl-2').spunAt, 7000);
casinoTick(game, rng, 11999); assert.equal(T('rl-2').phase, 'spinning', 'ball still rolling'); casinoTick(game, rng, 12000);
const n = T('rl-2').history[0], red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
assert.equal(cash('Darja'), r0 - 200 + (red ? 400 : 0));

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
for (const p of ['Ana', 'Ben']) wallet(game, p).cash = 3000;
casinoApply(game, { type: 'pk-sit', table: 'pk-1', seat: 0, buyIn: 1000 }, 'Darja', rng, 0);
casinoApply(game, { type: 'pk-sit', table: 'pk-1', seat: 2, buyIn: 300 }, 'Ana', rng, 0);
casinoApply(game, { type: 'pk-sit', table: 'pk-1', seat: 4, buyIn: 1000 }, 'Ben', rng, 0);
assert.throws(() => casinoApply(game, { type: 'pk-sit', table: 'pk-1', seat: 2, buyIn: 500 }, 'Sam', rng, 0), /taken/);
const pk = T('pk-1'), chips = () => pk.seats.filter(Boolean).reduce((a, s) => a + s.stack + s.total, 0) - (pk.phase === 'waiting' ? 0 : 0);
casinoTick(game, rng, 6000); assert.equal(pk.phase, 'preflop', 'hand starts with 2+ players'); assert.equal(pk.hand, 1);
const seated = pk.seats.filter(Boolean); assert(seated.every(s => s.cards.length === 2)); assert.equal(seated.reduce((a, s) => a + s.total, 0), 30, 'blinds posted');
const masked = redactCasino(game.casino, 'Darja').tables['pk-1'].seats; assert.equal(masked[2].cards[0], '??', 'other hole cards hidden'); assert.notEqual(masked[0].cards[0], '??', 'own cards visible');
const act = (type, extra = {}) => { const s = pk.seats[pk.toAct]; return casinoApply(game, { type, table: 'pk-1', ...extra }, s.name, rng, 7000); };
assert.throws(() => casinoApply(game, { type: 'pk-check', table: 'pk-1' }, pk.seats[(pk.toAct + 2) % 5]?.name || 'Nobody', rng, 7000), /turn|seat/);
// Preflop: the first to act raises to 100, the short stack goes all-in (300), the other calls.
act('pk-raise', { to: 100 }); let guard = 0;
while (pk.phase === 'preflop' && guard++ < 10) { const s = pk.seats[pk.toAct]; if (s.name === 'Ana') act('pk-allin'); else act(pk.currentBet > s.bet ? 'pk-call' : 'pk-check'); }
assert.equal(chips(), 2300, 'chips conserved during the hand');
while (!['showdown'].includes(pk.phase) && guard++ < 40) { const s = pk.seats[pk.toAct]; if (!s) break; act(pk.currentBet > s.bet ? 'pk-call' : 'pk-check'); }
assert.equal(pk.phase, 'showdown'); assert.equal(pk.board.length, 5);
assert.equal(pk.seats.filter(Boolean).reduce((a, s) => a + s.stack, 0), 2300, 'every chip is awarded (main + side pot)');
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
for (let i = 0; i < spins; i++) { const c0 = wallet(g2, 'Bot').cash; casinoApply(g2, { type: 'sl-spin', table: 'sl-1', amount: 1 }, 'Bot', rng); paid += wallet(g2, 'Bot').cash - c0 + 1; }
const rtp = paid / spins; assert(rtp > .85 && rtp < .98, 'slot return-to-player ' + rtp.toFixed(3));

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
{ const now0 = 6e12; casinoApply(game, { type: 'sl-spin', table: 'sl-2', amount: 5 }, 'Darja', rng, now0);
  assert.throws(() => casinoApply(game, { type: 'sl-spin', table: 'sl-2', amount: 5 }, 'Sam', rng, now0 + 1000), /still spinning/);
  casinoApply(game, { type: 'sl-spin', table: 'sl-2', amount: 5 }, 'Sam', rng, now0 + 3000); }

// Stage: tips request dances, queued in order, each 18 s.
const st = T('stage'), tip0 = cash('Darja');
assert.match(casinoApply(game, { type: 'st-tip', dance: 2, amount: 50 }, 'Darja', rng, 100000), /starts now/); assert.equal(st.dance, 2); assert.equal(cash('Darja'), tip0 - 50);
assert.match(casinoApply(game, { type: 'st-tip', dance: 5, amount: 20 }, 'Sam', rng, 101000), /next in line/);
assert.throws(() => casinoApply(game, { type: 'st-tip', dance: 6, amount: 20 }, 'Sam', rng, 101000), /six dances/); assert.throws(() => casinoApply(game, { type: 'st-tip', dance: 1, amount: 5 }, 'Sam', rng, 101000), /\$20/);
casinoTick(game, rng, 118001); assert.equal(st.dance, 5); assert.equal(st.by, 'Sam'); casinoTick(game, rng, 136002); assert.equal(st.dance, -1);
// v34 saves migrate: chips still on the old tables go back to their owners.
const old = { payday: true, wallets: {}, casino: { blackjack: { phase: 'betting', seats: [{ name: 'Sam', bet: 40 }] }, roulette: { bets: [{ name: 'Sam', amount: 25 }] }, lotto: { jackpot: 7777, last: [], tickets: 3 } } };
wallet(old, 'Sam').cash = 100; migrateCasino(old); assert.equal(old.wallets.sam.cash, 165); assert.equal(old.casino.version, 2); assert.equal(old.casino.tables.lotto.jackpot, 7777);
console.log('PASS: casino logic · lotto queue + busy slot guard, wallets, salary, loans, 2 blackjack + 2 roulette tables with limits, roulette timing, poker hand ranking, 3-player Hold\'em with all-in side pot and hidden hole cards, timer, cash-out, slots RTP ' + rtp.toFixed(3) + ', lotto, stage tips and dance queue, v34 migration.');
