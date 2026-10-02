// Payday economy and casino rules (host-side, deterministic with a seeded RNG).
import assert from 'node:assert/strict';
import { startPayday, wallet, paySalary, casinoApply, casinoTick, handValue, LEVEL_BONUS, LOTTO } from '../dist/casino-logic.js';

let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const game = { mode: 'campaign', levels: { earned: {} } };
assert.throws(() => casinoApply(game, { type: 'hello' }, 'Darja'), /Payday/);
startPayday(game);
assert.equal(wallet(game, 'Darja').cash, 10000, 'Darja starts with $10,000');
assert.equal(wallet(game, 'darja ').cash, 10000, 'names are case-insensitive');
assert.equal(wallet(game, 'Sam').cash, 500, 'others start with $500');

// Salary once per job.
assert.equal(paySalary(game, 'Sam', { type: 'rack', id: 'S1', pad: 'PAD-R01' }), 150);
assert.equal(paySalary(game, 'Sam', { type: 'rack', id: 'S1', pad: 'PAD-R01' }), 0, 'the same job pays once');
assert.equal(paySalary(game, 'Sam', { type: 'grab', id: 'S1' }), 0, 'carrying is not a job');
assert.equal(wallet(game, 'Sam').cash, 650);
game.levels.earned = { 0: Date.now(), 1: Date.now() }; casinoTick(game, rng);
assert.equal(wallet(game, 'Sam').cash, 650 + 2 * LEVEL_BONUS, 'level bonuses');
assert.equal(wallet(game, 'Darja').cash, 10000 + 2 * LEVEL_BONUS);

// Loans.
const before = wallet(game, 'Darja').cash;
assert.match(casinoApply(game, { type: 'lend', to: 'Sam', amount: 1000 }, 'Darja'), /Lent \$1,000 to Sam/);
assert.equal(wallet(game, 'Darja').cash, before - 1000); assert.equal(wallet(game, 'Sam').cash, 650 + 2 * LEVEL_BONUS + 1000);
assert.throws(() => casinoApply(game, { type: 'lend', to: 'Nobody', amount: 5 }, 'Darja'), /no wallet/);
assert.throws(() => casinoApply(game, { type: 'lend', to: 'Sam', amount: 1e6 }, 'Darja'), /between|Not enough/);
const loan = game.loans[0];
casinoApply(game, { type: 'repay', id: loan.id, amount: 400 }, 'Sam'); assert.equal(loan.owed, 600);
casinoApply(game, { type: 'repay', id: loan.id }, 'Sam'); assert.equal(loan.owed, 0); assert.equal(wallet(game, 'Darja').cash, before);

// Blackjack: two seats, deal, play out, settle; money is conserved against payouts.
assert.equal(handValue(['A♠', 'K♥']), 21); assert.equal(handValue(['A♠', 'A♥', '9♦']), 21); assert.equal(handValue(['K♠', 'Q♥', '5♦']), 25);
const cashBefore = wallet(game, 'Darja').cash + wallet(game, 'Sam').cash;
casinoApply(game, { type: 'bj-bet', amount: 100 }, 'Darja', rng); casinoApply(game, { type: 'bj-bet', amount: 50 }, 'Sam', rng);
assert.throws(() => casinoApply(game, { type: 'bj-bet', amount: 5 }, 'Ana', rng), /Bet between/);
casinoApply(game, { type: 'bj-deal' }, 'Sam', rng, 1000);
const t = game.casino.blackjack; let guard = 0;
while (t.phase === 'playing' && guard++ < 20) { const s = t.seats[t.turn]; casinoApply(game, { type: handValue(s.cards) < 15 ? 'bj-hit' : 'bj-stand' }, s.name, rng, 1000); }
casinoTick(game, rng, 2000); assert.equal(t.phase, 'done');
const paid = t.seats.reduce((a, s) => a + s.payout, 0), staked = t.seats.reduce((a, s) => a + s.bet, 0);
assert.equal(wallet(game, 'Darja').cash + wallet(game, 'Sam').cash, cashBefore - staked + paid, 'blackjack payouts');
assert(t.seats.every(s => ['win', 'lose', 'push', 'bust', 'blackjack'].includes(s.result)));
casinoTick(game, rng, 1e13); assert.equal(t.phase, 'betting');

// Roulette: bets, spin, settle, payouts follow the table.
const r = game.casino.roulette, d0 = wallet(game, 'Darja').cash;
casinoApply(game, { type: 'rl-bet', kind: 'red', amount: 100 }, 'Darja', rng); casinoApply(game, { type: 'rl-bet', kind: 'straight', value: 17, amount: 10 }, 'Darja', rng);
assert.throws(() => casinoApply(game, { type: 'rl-bet', kind: 'straight', value: 40, amount: 10 }, 'Darja', rng), /0–36/);
casinoApply(game, { type: 'rl-spin' }, 'Darja', rng, 5000);
assert.throws(() => casinoApply(game, { type: 'rl-bet', kind: 'red', amount: 10 }, 'Sam', rng, 5001), /No more bets/);
casinoTick(game, rng, 11001); const n = r.result;
const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
assert.equal(wallet(game, 'Darja').cash, d0 - 110 + (red ? 200 : 0) + (n === 17 ? 360 : 0), 'roulette payout for ' + n);

// Lotto: price, jackpot growth, prize table.
const j0 = game.casino.lotto.jackpot, c0 = wallet(game, 'Sam').cash;
const res = casinoApply(game, { type: 'lotto', picks: [1, 2, 3, 4, 5] }, 'Sam', rng);
assert.equal(res.balls.length, 5); assert.equal(new Set(res.balls).size, 5);
assert.equal(game.casino.lotto.jackpot, res.hits === 5 ? LOTTO.seed : j0 + LOTTO.add);
assert.equal(wallet(game, 'Sam').cash, c0 - LOTTO.price + res.prize);
assert.throws(() => casinoApply(game, { type: 'lotto', picks: [1, 1, 2, 3, 4] }, 'Sam', rng), /different/);
assert.throws(() => { const broke = wallet(game, 'Broke'); broke.cash = 3; casinoApply(game, { type: 'lotto', picks: [1, 2, 3, 4, 5] }, 'Broke', rng); }, /Not enough cash/);
console.log('PASS: casino logic · wallets (Darja $10,000), salary once per job, level bonus, loans with partial repayment, blackjack deal/play/settle, roulette bets and payouts, lotto prizes and jackpot.');
