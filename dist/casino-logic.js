// Payday mode economy and casino. Pure state on `game` (operations.game), applied by the host only, so every
// engineer on the LAN sees the same cards, spins, balances and loans. Play money: nothing leaves the game.
//
//  · Wallets: one per engineer (by name). Darja starts with $10,000, everyone else $500.
//  · Salary: each job pays the engineer who did it once (installing a rack, mounting a device, patching
//    a cable…); every Campaign level earned pays everyone a bonus.
//  · Loans: lend cash to another engineer; they repay when they can (partial repayments allowed).
//  · Blackjack: shared table, up to 5 seats, 6-deck shoe, dealer stands on all 17s, blackjack pays 3:2,
//    double down on the first two cards. Betting closes 10 s after the first bet (or Deal).
//  · Roulette: European single-zero wheel; straight 35:1, dozen/column 2:1, red/black/odd/even/low/high 1:1.
//    Betting closes when someone spins; the ball lands 6 s later.
//  · Lotto machine: $20 ticket, pick 5 of 1–36, five balls are drawn; 2 → $20, 3 → $150, 4 → $2,500,
//    5 → the jackpot. Every ticket adds $10 to the shared jackpot.
export const START_CASH = 500, DARJA_CASH = 10000, LEVEL_BONUS = 1500, TABLE_MIN = 10, TABLE_MAX = 5000;
export const SALARY = { rack: 150, mount: 120, 'rack-feed': 60, rails: 40, power: 35, patch: 30, optic: 25, boot: 40, unbox: 15, repair: 90, 'isp-order': 50 };
export const LOTTO = { price: 20, numbers: 36, picks: 5, pays: { 2: 20, 3: 150, 4: 2500 }, seed: 5000, add: 10 };
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const rouletteColor = n => n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';

const key = name => String(name || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const int = (v, label, min = 1, max = 1e9) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < min || n > max) throw Error(label); return n; };

export function freshCasino() {
  return { blackjack: { phase: 'betting', seats: [], dealer: [], shoe: [], turn: -1, closesAt: 0, turnEndsAt: 0, doneAt: 0, round: 0, log: [] }, roulette: { phase: 'betting', bets: [], result: null, landsAt: 0, history: [], round: 0 }, lotto: { jackpot: LOTTO.seed, last: [], tickets: 0 } };
}
export function startPayday(game) { game.payday = true; game.wallets = {}; game.loans = []; game.paidJobs = {}; game.paidLevels = 0; game.loanCounter = 0; game.casino = freshCasino(); }

export function wallet(game, name) {
  const k = key(name); game.wallets ??= {};
  return game.wallets[k] ??= { name: String(name || 'Engineer').trim().slice(0, 40) || 'Engineer', cash: /^darja$/.test(k) ? DARJA_CASH : START_CASH, salary: 0, won: 0, lost: 0, log: [] };
}
function note(w, text, amount) { w.log.unshift({ at: Date.now(), text, amount }); w.log.length = Math.min(w.log.length, 30); }
function take(w, amount, why) { if (w.cash < amount) throw Error('Not enough cash · you have ' + money(w.cash) + (why ? ' (' + why + ')' : '')); w.cash -= amount; }

// Salary for a job, paid once per job identity (re-doing the same job pays nothing).
export function paySalary(game, name, action) {
  if (!game.payday) return 0; const rate = SALARY[action?.type]; if (!rate) return 0;
  const job = action.type + ':' + (action.id ?? action.node ?? action.rack ?? '') + ':' + (action.pad ?? action.unit ?? action.pa ?? action.feed ?? action.port ?? '');
  game.paidJobs ??= {}; if (game.paidJobs[job]) return 0; game.paidJobs[job] = true;
  const w = wallet(game, name); w.cash += rate; w.salary += rate; note(w, 'Salary · ' + action.type, rate); return rate;
}

// ---- Blackjack -------------------------------------------------------------------------------------------
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function shoe(rng) { const cards = []; for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) cards.push(r + s); for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; } return cards; }
export function handValue(cards) { let total = 0, aces = 0; for (const c of cards) { const r = c.slice(0, -1); if (r === 'A') { aces++; total += 11; } else total += ['J', 'Q', 'K'].includes(r) ? 10 : +r; } while (total > 21 && aces) { total -= 10; aces--; } return total; }
const natural = cards => cards.length === 2 && handValue(cards) === 21;
function draw(t, rng) { if (t.shoe.length < 60) t.shoe = shoe(rng); return t.shoe.pop(); }
function nextTurn(t, now) { let i = t.turn + 1; while (i < t.seats.length && t.seats[i].done) i++; t.turn = i; t.turnEndsAt = now + 25000; if (i >= t.seats.length) t.phase = 'dealer'; }
function settleBlackjack(game, t, rng, now) {
  const live = t.seats.some(s => handValue(s.cards) <= 21 && !s.natural);
  if (live) while (handValue(t.dealer) < 17) t.dealer.push(draw(t, rng));
  const d = handValue(t.dealer), dn = natural(t.dealer);
  for (const s of t.seats) {
    const w = wallet(game, s.name), p = handValue(s.cards); let pay = 0, result;
    if (p > 21) result = 'bust'; else if (s.natural && !dn) { pay = s.bet * 2.5; result = 'blackjack'; } else if (dn && !s.natural) result = 'lose'; else if (d > 21 || p > d) { pay = s.bet * 2; result = 'win'; } else if (p === d) { pay = s.bet; result = 'push'; } else result = 'lose';
    s.result = result; s.payout = pay; w.cash += pay; const net = pay - s.bet; if (net > 0) w.won += net; else w.lost -= net;
    note(w, 'Blackjack · ' + result, net);
  }
  t.phase = 'done'; t.doneAt = now + 7000; t.log.unshift('Dealer ' + (d > 21 ? 'busts with ' + d : d) + ' · ' + t.seats.map(s => s.name + ' ' + s.result).join(' · ')); t.log.length = Math.min(t.log.length, 8);
}
function dealBlackjack(t, rng, now) {
  t.phase = 'playing'; t.round++; t.dealer = [draw(t, rng), draw(t, rng)];
  for (const s of t.seats) { s.cards = [draw(t, rng), draw(t, rng)]; s.natural = natural(s.cards); s.done = s.natural; s.result = null; s.payout = 0; }
  t.turn = -1; if (natural(t.dealer)) { t.turn = t.seats.length; t.phase = 'dealer'; return; } nextTurn(t, now);
}
function blackjack(game, a, name, rng, now) {
  const t = game.casino.blackjack, me = t.seats.find(s => key(s.name) === key(name));
  if (a.type === 'bj-bet') {
    if (t.phase !== 'betting') throw Error('Wait for the next hand');
    const amount = int(a.amount, 'Bet between ' + money(TABLE_MIN) + ' and ' + money(TABLE_MAX), TABLE_MIN, TABLE_MAX), w = wallet(game, name);
    if (me) { take(w, amount, 'raise'); me.bet += amount; if (me.bet > TABLE_MAX) { w.cash += amount; me.bet -= amount; throw Error('Table maximum is ' + money(TABLE_MAX)); } return 'Bet raised to ' + money(me.bet); }
    if (t.seats.length >= 5) throw Error('The table is full (5 seats)');
    take(w, amount); t.seats.push({ name: w.name, bet: amount, cards: [], done: false }); if (!t.closesAt) t.closesAt = now + 10000;
    return 'Seat taken · bet ' + money(amount);
  }
  if (a.type === 'bj-leave') { if (t.phase !== 'betting' || !me) throw Error('You can leave between hands'); wallet(game, name).cash += me.bet; t.seats.splice(t.seats.indexOf(me), 1); if (!t.seats.length) t.closesAt = 0; return 'Left the table · bet returned'; }
  if (a.type === 'bj-deal') { if (t.phase !== 'betting' || !t.seats.length) throw Error('Place a bet first'); dealBlackjack(t, rng, now); return 'Cards dealt'; }
  if (t.phase !== 'playing' || !me || t.seats[t.turn] !== me) throw Error(t.phase === 'playing' ? 'Not your turn' : 'No hand in play');
  if (a.type === 'bj-hit') { me.cards.push(draw(t, rng)); const v = handValue(me.cards); if (v >= 21) { me.done = true; nextTurn(t, now); } else t.turnEndsAt = now + 25000; return v > 21 ? 'Bust · ' + v : 'Hit · ' + v; }
  if (a.type === 'bj-stand') { me.done = true; nextTurn(t, now); return 'Stand · ' + handValue(me.cards); }
  if (a.type === 'bj-double') { if (me.cards.length !== 2) throw Error('Double down on your first two cards only'); take(wallet(game, name), me.bet, 'double'); me.bet *= 2; me.doubled = true; me.cards.push(draw(t, rng)); me.done = true; nextTurn(t, now); return 'Doubled · ' + handValue(me.cards); }
  throw Error('Unknown blackjack move');
}

// ---- Roulette --------------------------------------------------------------------------------------------
const BETS = { straight: 35, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1, dozen: 2, column: 2 };
function wins(kind, value, n) {
  if (kind === 'straight') return n === value;
  if (n === 0) return false;
  return { red: RED.has(n), black: !RED.has(n), odd: n % 2 === 1, even: n % 2 === 0, low: n <= 18, high: n >= 19, dozen: Math.ceil(n / 12) === value, column: ((n - 1) % 3) + 1 === value }[kind];
}
function roulette(game, a, name, rng, now) {
  const t = game.casino.roulette;
  if (a.type === 'rl-bet') {
    if (t.phase !== 'betting') throw Error('No more bets · the ball is rolling');
    if (!(a.kind in BETS)) throw Error('Unknown bet');
    const value = a.kind === 'straight' ? int(a.value, 'Pick a number 0–36', 0, 36) : ['dozen', 'column'].includes(a.kind) ? int(a.value, 'Pick 1, 2 or 3', 1, 3) : null;
    const amount = int(a.amount, 'Bet between ' + money(TABLE_MIN) + ' and ' + money(TABLE_MAX), TABLE_MIN, TABLE_MAX), w = wallet(game, name);
    take(w, amount); t.bets.push({ name: w.name, kind: a.kind, value, amount }); return 'Bet ' + money(amount) + ' on ' + a.kind + (value !== null ? ' ' + value : '');
  }
  if (a.type === 'rl-clear') { if (t.phase !== 'betting') throw Error('No more bets'); const mine = t.bets.filter(b => key(b.name) === key(name)), w = wallet(game, name); for (const b of mine) w.cash += b.amount; t.bets = t.bets.filter(b => !mine.includes(b)); return mine.length ? 'Your bets were returned' : 'You have no bets on the table'; }
  if (a.type === 'rl-spin') { if (t.phase !== 'betting') throw Error('Already spinning'); if (!t.bets.length) throw Error('Place a bet first'); t.phase = 'spinning'; t.round++; t.result = Math.floor(rng() * 37); t.landsAt = now + 6000; return 'No more bets · spinning'; }
  throw Error('Unknown roulette move');
}
function settleRoulette(game, t) {
  const n = t.result, winners = {};
  for (const b of t.bets) { const w = wallet(game, b.name); if (wins(b.kind, b.value, n)) { const pay = b.amount * (BETS[b.kind] + 1); w.cash += pay; w.won += pay - b.amount; winners[w.name] = (winners[w.name] || 0) + pay - b.amount; note(w, 'Roulette ' + n + ' · ' + b.kind, pay - b.amount); } else { w.lost += b.amount; note(w, 'Roulette ' + n + ' · ' + b.kind, -b.amount); } }
  t.history.unshift(n); t.history.length = Math.min(t.history.length, 12); t.lastWinners = winners; t.bets = []; t.phase = 'betting'; t.result = n;
}

// ---- Lotto -----------------------------------------------------------------------------------------------
function lotto(game, a, name, rng) {
  const t = game.casino.lotto, picks = [...new Set((a.picks || []).map(Number))].filter(n => Number.isInteger(n) && n >= 1 && n <= LOTTO.numbers);
  if (picks.length !== LOTTO.picks) throw Error('Pick ' + LOTTO.picks + ' different numbers from 1 to ' + LOTTO.numbers);
  const w = wallet(game, name); take(w, LOTTO.price, 'ticket'); t.jackpot += LOTTO.add; t.tickets++;
  const pool = Array.from({ length: LOTTO.numbers }, (_, i) => i + 1), balls = [];
  for (let i = 0; i < LOTTO.picks; i++) balls.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const hits = picks.filter(n => balls.includes(n)).length; let prize = LOTTO.pays[hits] || 0;
  if (hits === LOTTO.picks) { prize = t.jackpot; t.jackpot = LOTTO.seed; }
  w.cash += prize; if (prize) w.won += prize - LOTTO.price; else w.lost += LOTTO.price; note(w, 'Lotto · ' + hits + ' of 5', prize - LOTTO.price);
  t.last.unshift({ name: w.name, picks, balls, hits, prize, at: Date.now() }); t.last.length = Math.min(t.last.length, 8);
  return { message: (prize ? 'Lotto · ' + hits + ' numbers · won ' + money(prize) : 'Lotto · ' + hits + ' numbers · no prize'), balls, hits, prize };
}

// ---- Loans -----------------------------------------------------------------------------------------------
function loans(game, a, name) {
  game.loans ??= [];
  if (a.type === 'lend') {
    const to = String(a.to || '').trim(); if (!to || key(to) === key(name)) throw Error('Choose another engineer');
    if (!game.wallets?.[key(to)]) throw Error(to + ' has no wallet yet');
    const amount = int(a.amount, 'Lend between $1 and $100,000', 1, 100000), from = wallet(game, name), b = wallet(game, to);
    take(from, amount); b.cash += amount; game.loanCounter = (game.loanCounter || 0) + 1;
    game.loans.push({ id: 'L' + game.loanCounter, lender: from.name, borrower: b.name, amount, owed: amount, at: Date.now() });
    note(from, 'Lent to ' + b.name, -amount); note(b, 'Loan from ' + from.name, amount);
    return 'Lent ' + money(amount) + ' to ' + b.name;
  }
  if (a.type === 'repay') {
    const loan = game.loans.find(l => l.id === a.id && key(l.borrower) === key(name) && l.owed > 0); if (!loan) throw Error('No open loan to repay');
    const w = wallet(game, name), amount = Math.min(loan.owed, int(a.amount ?? loan.owed, 'Repay at least $1', 1, 1e9)); take(w, amount);
    const lender = wallet(game, loan.lender); lender.cash += amount; loan.owed -= amount;
    note(w, 'Repaid ' + lender.name, -amount); note(lender, 'Repayment from ' + w.name, amount);
    return 'Repaid ' + money(amount) + ' to ' + lender.name + (loan.owed ? ' · still owe ' + money(loan.owed) : ' · loan cleared');
  }
  if (a.type === 'forgive') { const loan = game.loans.find(l => l.id === a.id && key(l.lender) === key(name) && l.owed > 0); if (!loan) throw Error('No open loan of yours'); const owed = loan.owed; loan.owed = 0; loan.forgiven = true; return 'Forgave ' + money(owed) + ' owed by ' + loan.borrower; }
  throw Error('Unknown wallet action');
}

export function casinoApply(game, a, name, rng = Math.random, now = Date.now()) {
  if (!game.payday) throw Error('The casino and wallets are part of Payday mode');
  game.casino ??= freshCasino(); wallet(game, name);
  if (a?.type === 'hello') return 'Wallet ready · ' + money(wallet(game, name).cash);
  if (/^bj-/.test(a?.type)) return blackjack(game, a, name, rng, now);
  if (/^rl-/.test(a?.type)) return roulette(game, a, name, rng, now);
  if (a?.type === 'lotto') return lotto(game, a, name, rng);
  if (['lend', 'repay', 'forgive'].includes(a?.type)) return loans(game, a, name);
  throw Error('Unknown casino action');
}

// Timers and level bonuses. Returns true when state changed (the host then broadcasts it).
export function casinoTick(game, rng = Math.random, now = Date.now()) {
  if (!game.payday || !game.casino) return false; let changed = false;
  const earned = Object.keys(game.levels?.earned || {}).length;
  if (earned > (game.paidLevels || 0)) { const n = earned - (game.paidLevels || 0); game.paidLevels = earned; for (const w of Object.values(game.wallets || {})) { w.cash += LEVEL_BONUS * n; w.salary += LEVEL_BONUS * n; note(w, 'Level bonus', LEVEL_BONUS * n); } changed = true; }
  const t = game.casino.blackjack;
  if (t.phase === 'betting' && t.seats.length && t.closesAt && now >= t.closesAt) { dealBlackjack(t, rng, now); changed = true; }
  if (t.phase === 'playing' && now >= t.turnEndsAt && t.seats[t.turn]) { t.seats[t.turn].done = true; nextTurn(t, now); changed = true; }
  if (t.phase === 'dealer') { settleBlackjack(game, t, rng, now); changed = true; }
  if (t.phase === 'done' && now >= t.doneAt) { t.phase = 'betting'; t.seats = []; t.dealer = []; t.turn = -1; t.closesAt = 0; changed = true; }
  const r = game.casino.roulette;
  if (r.phase === 'spinning' && now >= r.landsAt) { settleRoulette(game, r); changed = true; }
  return changed;
}

export function walletSummary(game) { return Object.values(game.wallets || {}).sort((a, b) => b.cash - a.cash).map(w => ({ name: w.name, cash: w.cash, salary: w.salary, won: w.won, lost: w.lost })); }
