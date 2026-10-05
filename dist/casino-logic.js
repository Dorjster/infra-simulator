// Payday mode economy and casino. Pure state on `game` (operations.game), applied by the host only, so every
// engineer on the LAN sees the same cards, spins, balances and loans. Play money: nothing leaves the game.
//
//  · Money is Mongolian tögrög (₮, see money.js). Wallets: one per engineer (by name). Darja starts with
//    36,000,000₮ (US$10,000), everyone else 1,800,000₮ (US$500).
//  · Salary: each job pays the engineer who did it once; every Campaign level earned pays everyone a bonus.
//  · Loans: lend cash to another engineer; they repay when they can (partial repayments allowed).
//  · Tables (each with its own limits and state):
//      Blackjack ×2 — up to 5 seats, 6-deck shoe, dealer stands on all 17s, blackjack 3:2, double down.
//      Roulette ×2 — European single zero; number 35:1, dozen/column 2:1, even chances 1:1.
//      Texas Hold'em — 5 seats, blinds 50,000₮/100,000₮, side pots, 30 s to act.
//      Slots ×3 — three reels; Lotto — 5 of 36, shared jackpot (draws queue on the one machine).
//  · Bar: every drink costs 18,000,000₮ (US$5,000) and gives a few minutes of luck — good or bad, at random —
//    that nudges your own slot spins and lotto draws. Roulette, blackjack and poker stay pure chance.
//  · Weapon market: eight guns from 90,000,000₮ (US$25,000); see combat-logic.js for HP and hits.
//  · Timing fields (spinMs, dealtAt, drawnAt…) let every client animate the 3D tables in step with the result.
import { mnt, money } from './money.js';
import { WEAPONS } from './weapons-data.js';
export const START_CASH = mnt(500), DARJA_CASH = mnt(10000), LEVEL_BONUS = mnt(1500);
export const SALARY = Object.fromEntries(Object.entries({ rack: 150, mount: 120, 'rack-feed': 60, rails: 40, power: 35, patch: 30, optic: 25, boot: 40, unbox: 15, repair: 90, 'isp-order': 50 }).map(([k, v]) => [k, mnt(v)]));
export const LOTTO = { price: 70000, numbers: 36, picks: 5, pays: { 2: 70000, 3: 500000, 4: 9000000 }, seed: 18000000, add: 35000, drawMs: 8000 };   // drawMs = SYNC.lottoDraw: one draw on the machine
export const TABLES = [
  { id: 'bj-1', game: 'blackjack', name: 'Blackjack', min: 50000, max: 20000000 },
  { id: 'bj-2', game: 'blackjack', name: 'High-limit blackjack', min: 500000, max: 100000000 },
  { id: 'rl-1', game: 'roulette', name: 'Roulette', min: 50000, max: 20000000 },
  { id: 'rl-2', game: 'roulette', name: 'High-limit roulette', min: 500000, max: 100000000 },
  { id: 'pk-1', game: 'poker', name: "Texas Hold'em", sb: 50000, bb: 100000, minBuy: 1000000, maxBuy: 20000000, seats: 5 },
  { id: 'sl-1', game: 'slots', name: 'Slot · Lucky 7', min: 5000, max: 500000 }, { id: 'sl-2', game: 'slots', name: 'Slot · Diamond', min: 5000, max: 500000 },
  { id: 'sl-3', game: 'slots', name: 'Slot · High Roller', min: 100000, max: 10000000 },
  { id: 'lotto', game: 'lotto', name: 'Lotto machine' },
  { id: 'stage', game: 'stage', name: 'Center stage', min: 70000, max: 20000000 },
  { id: 'bar', game: 'bar', name: 'The Payday Bar' },
  { id: 'guns', game: 'market', name: 'Weapon market' }
];
// Bar: every drink US$5,000; luck lasts `min` minutes, strength = chance a result is nudged your way (or against you).
export const DRINK_PRICE = mnt(5000);
export const DRINKS = [
  { id: 'beer', name: 'Draught beer', min: 2, strength: .2 }, { id: 'airag', name: 'Airag', min: 2.5, strength: .22 },
  { id: 'wine', name: 'Red wine', min: 3, strength: .24 }, { id: 'cocktail', name: 'Cocktail', min: 3, strength: .25 },
  { id: 'champagne', name: 'Champagne', min: 3, strength: .27 }, { id: 'tequila', name: 'Tequila shot', min: 3.5, strength: .3 },
  { id: 'vodka', name: 'Vodka', min: 4, strength: .32 }, { id: 'whisky', name: 'Single malt whisky', min: 4, strength: .35 }
];
// Payday goals: every engineer has three personal goals; the host advances them from real events and pays a
// bonus when one is met, then draws a new one. Kinds: work (salary jobs, levels) and casino (wins, the bar, the stage).
export const GOALS = [
  { id: 'jobs', text: 'Finish 3 paid jobs (racking, cabling, power…)', need: 3, usd: 1500 },
  { id: 'level', text: 'Help earn the next campaign level', need: 1, usd: 3000 },
  { id: 'bj-win', text: 'Win a hand of blackjack', need: 1, usd: 800 },
  { id: 'rl-win', text: 'Win a roulette bet', need: 1, usd: 600 },
  { id: 'rl-number', text: 'Hit a single number at roulette', need: 1, usd: 5000 },
  { id: 'slot-win', text: 'Win on a slot machine', need: 1, usd: 400 },
  { id: 'lotto-2', text: 'Match 2+ numbers in the lotto', need: 1, usd: 1000 },
  { id: 'pk-pot', text: "Win a Hold'em pot", need: 1, usd: 1200 },
  { id: 'tip', text: 'Tip the dancer for a special move', need: 1, usd: 300 },
  { id: 'drink', text: 'Order a drink at the bar', need: 1, usd: 1500 },
  { id: 'jobs-5', text: 'Finish 5 paid jobs', need: 5, usd: 3000 },
  { id: 'bj-3', text: 'Win 3 hands of blackjack', need: 3, usd: 2500 },
].map(x => ({ ...x, reward: mnt(x.usd) }));
export function goalsOf(game, name, rng = Math.random, avoid = []) {
  game.goals ??= {}; const k = key(name), list = game.goals[k] ??= [];
  while (list.length < 3) { const pool = GOALS.filter(gl => !list.some(x => x.id === gl.id) && !avoid.includes(gl.id)); /* never hand back the goal just finished */ const gl = pool[Math.floor(rng() * pool.length)]; list.push({ id: gl.id, progress: 0, at: Date.now() }); }
  return list.map(x => ({ ...GOALS.find(gl => gl.id === x.id), progress: x.progress }));
}
function goal(game, name, id, n = 1, rng = Math.random) {
  if (!game.payday || !name) return; const list = (goalsOf(game, name, rng), game.goals[key(name)]), match = list.filter(x => x.id === id || (id === 'jobs' && x.id === 'jobs-5') || (id === 'bj-win' && x.id === 'bj-3'));
  const finished = [];
  for (const x of match) { const def = GOALS.find(gl => gl.id === x.id); x.progress = Math.min(def.need, x.progress + n);
    if (x.progress >= def.need) { list.splice(list.indexOf(x), 1); finished.push(def.id); (game.goalsDone ??= {})[key(name)] ??= []; game.goalsDone[key(name)].push({ id: def.id, text: def.text, reward: def.reward, at: Date.now() }); } }
  goalsOf(game, name, rng, finished);
}
// A met goal waits to be claimed (the bonus lands in the wallet when the engineer presses Claim).
export const goalsDoneOf = (game, name) => game.goalsDone?.[key(name)] || [];
// Read-only view for the screens (never creates goals: on a guest that would invent goals the host doesn't have).
export const goalsView = (game, name) => (game.goals?.[key(name)] || []).map(x => ({ ...GOALS.find(gl => gl.id === x.id), progress: x.progress })).filter(x => x.id);
function claimGoals(game, name) {
  const done = game.goalsDone?.[key(name)] || []; if (!done.length) throw Error('No finished goals to claim');
  const w = wallet(game, name), total = done.reduce((a, x) => a + x.reward, 0); for (const x of done) note(w, 'Goal · ' + x.text, x.reward);
  w.cash += total; w.won += total; game.goalsDone[key(name)] = []; return 'Goals claimed · +' + money(total);
}
export function luckOf(game, name, now = Date.now()) { const l = game.luck?.[key(name)]; return l && l.until > now ? l : null; }
// Centre-stage performer: a tip of 70,000₮+ requests one of six dances (queued, 18 s each, everyone sees the same).
export const DANCES = ['Pole spin', 'Climb & sit', 'Showgirl kicks', 'Body wave', 'Disco fever', 'Lay-back'], DANCE_MS = 18000;
export const tableDef = id => TABLES.find(t => t.id === id);
export const ROULETTE_SPIN_MS = 7000, POKER_ACT_MS = 30000;
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const rouletteColor = n => n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';
// Slot reels: symbol weights and three-of-a-kind pays (× bet); exactly two cherries pay 2.5× (return-to-player ≈ 92%).
export const SLOT_SYMBOLS = ['Cherry', 'Lemon', 'Plum', 'Bell', 'BAR', '7'];   // classic symbols (drawn in slot-symbols.js)
const SLOT_WEIGHTS = [24, 22, 18, 14, 9, 5], SLOT_PAYS = [6, 8, 15, 30, 75, 250];

const key = name => String(name || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const int = (v, label, min = 1, max = 1e9) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < min || n > max) throw Error(label); return n; };
const range = t => 'Bet between ' + money(t.min) + ' and ' + money(t.max);

function freshTable(def) {
  if (def.game === 'blackjack') return { phase: 'betting', seats: [], dealer: [], shoe: [], turn: -1, closesAt: 0, turnEndsAt: 0, doneAt: 0, round: 0, dealtAt: 0, log: [] };
  if (def.game === 'roulette') return { phase: 'betting', bets: [], result: null, spunAt: 0, landsAt: 0, history: [], round: 0, lastWinners: null };
  if (def.game === 'poker') return { phase: 'waiting', seats: Array(def.seats).fill(null), button: -1, deck: [], board: [], toAct: -1, currentBet: 0, minRaise: def.bb, actionEndsAt: 0, nextHandAt: 0, hand: 0, log: [], results: null, streetAt: 0 };
  if (def.game === 'slots') return { last: null, spins: 0 };
  if (def.game === 'lotto') return { jackpot: LOTTO.seed, last: [], tickets: 0 };
  if (def.game === 'bar') return { served: 0, last: null };
  if (def.game === 'market') return { sold: 0, last: null };
  if (def.game === 'stage') return { dance: -1, by: null, round: 0, startedAt: 0, until: 0, queue: [], tips: 0, log: [] };
  return {};
}
export function freshCasino() { const tables = {}; for (const d of TABLES) tables[d.id] = freshTable(d); return { version: 3, currency: 'MNT', tables }; }
export function startPayday(game) { game.payday = true; game.wallets = {}; game.loans = []; game.paidJobs = {}; game.paidLevels = 0; game.loanCounter = 0; game.luck = {}; game.arsenal = {}; game.combat = null; game.casino = freshCasino(); }
// v34 saves had one blackjack and one roulette table: return any chips still on them and move to v2 tables.
export function migrateCasino(game) {
  const c = game.casino; if (!c) return;
  if (c.version === 2) { toTugrik(game); return; }
  if (c.version === 3) { for (const d of TABLES) c.tables[d.id] ??= freshTable(d); return; }
  for (const s of c.blackjack?.seats || []) if (c.blackjack.phase === 'betting' || c.blackjack.phase === 'playing') wallet(game, s.name).cash += s.bet;
  for (const b of c.roulette?.bets || []) wallet(game, b.name).cash += b.amount;
  const lotto = c.lotto; game.casino = freshCasino(); game.casino.version = 2; if (lotto) Object.assign(game.casino.tables.lotto, { jackpot: lotto.jackpot, last: lotto.last || [], tickets: lotto.tickets || 0 });
  toTugrik(game);
}
// v35 saves were in US$: return every chip still on a table, convert wallets, loans and the jackpot to ₮.
function toTugrik(game) {
  const c = game.casino, T = c.tables || {}, x = v => mnt(v || 0);
  for (const d of TABLES) { const t = T[d.id]; if (!t) continue;
    if (d.game === 'blackjack' && ['betting', 'playing', 'dealer'].includes(t.phase)) for (const s of t.seats) wallet(game, s.name).cash += s.bet;
    if (d.game === 'roulette') for (const b of t.bets || []) wallet(game, b.name).cash += b.amount;
    if (d.game === 'poker') for (const s of t.seats || []) if (s) wallet(game, s.name).cash += (s.stack || 0) + (s.bet || 0); }
  for (const w of Object.values(game.wallets || {})) { for (const k of ['cash', 'salary', 'won', 'lost']) w[k] = x(w[k]); for (const e of w.log || []) e.amount = x(e.amount); }
  for (const l of game.loans || []) for (const k of ['amount', 'owed', 'repaid']) if (Number.isFinite(l[k])) l[k] = x(l[k]);
  const lt = T.lotto; game.casino = freshCasino(); if (lt) Object.assign(game.casino.tables.lotto, { jackpot: x(lt.jackpot), last: [], tickets: lt.tickets || 0 });
  game.luck ??= {}; game.arsenal ??= {};
}

export function wallet(game, name) {
  const k = key(name); game.wallets ??= {};
  return game.wallets[k] ??= { name: String(name || 'Engineer').trim().slice(0, 40) || 'Engineer', cash: /^darja$/.test(k) ? DARJA_CASH : START_CASH, salary: 0, won: 0, lost: 0, log: [] };
}
function note(w, text, amount) { w.log.unshift({ at: Date.now(), text, amount }); w.log.length = Math.min(w.log.length, 30); }
function take(w, amount, why) { if (w.cash < amount) throw Error('Not enough cash · you have ' + money(w.cash) + (why ? ' (' + why + ')' : '')); w.cash -= amount; }
function result(w, text, net) { if (net > 0) w.won += net; else w.lost -= net; note(w, text, net); }

export function paySalary(game, name, action) {
  if (!game.payday) return 0; const rate = SALARY[action?.type]; if (!rate) return 0;
  const job = action.type + ':' + (action.id ?? action.node ?? action.rack ?? '') + ':' + (action.pad ?? action.unit ?? action.pa ?? action.feed ?? action.port ?? '');
  game.paidJobs ??= {}; if (game.paidJobs[job]) return 0; game.paidJobs[job] = true;
  const w = wallet(game, name); w.cash += rate; w.salary += rate; note(w, 'Salary · ' + action.type, rate); goal(game, name, 'jobs'); return rate;
}

// ---- Cards ------------------------------------------------------------------------------------------------
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function shuffled(decks, rng) { const cards = []; for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) cards.push(r + s); for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; } return cards; }
export function handValue(cards) { let total = 0, aces = 0; for (const c of cards) { if (c === '??') continue; const r = c.slice(0, -1); if (r === 'A') { aces++; total += 11; } else total += ['J', 'Q', 'K'].includes(r) ? 10 : +r; } while (total > 21 && aces) { total -= 10; aces--; } return total; }

// ---- Blackjack ------------------------------------------------------------------------------------------
const natural = cards => cards.length === 2 && handValue(cards) === 21;
function draw(t, rng) { if (t.shoe.length < 60) t.shoe = shuffled(6, rng); return t.shoe.pop(); }
function nextTurn(t, now) { let i = t.turn + 1; while (i < t.seats.length && t.seats[i].done) i++; t.turn = i; t.turnEndsAt = now + 25000; if (i >= t.seats.length) t.phase = 'dealer'; }
function settleBlackjack(game, t, rng, now) {
  if (t.seats.some(s => handValue(s.cards) <= 21 && !s.natural)) while (handValue(t.dealer) < 17) t.dealer.push(draw(t, rng));
  const d = handValue(t.dealer), dn = natural(t.dealer);
  for (const s of t.seats) {
    const w = wallet(game, s.name), p = handValue(s.cards); let pay = 0, r;
    if (p > 21) r = 'bust'; else if (s.natural && !dn) { pay = s.bet * 2.5; r = 'blackjack'; } else if (dn && !s.natural) r = 'lose'; else if (d > 21 || p > d) { pay = s.bet * 2; r = 'win'; } else if (p === d) { pay = s.bet; r = 'push'; } else r = 'lose';
    s.result = r; s.payout = pay; w.cash += pay; result(w, 'Blackjack · ' + r, pay - s.bet); if (r === 'win' || r === 'blackjack') goal(game, s.name, 'bj-win');
  }
  t.phase = 'done'; t.doneAt = now + 8000; t.settledAt = now; t.log.unshift('Dealer ' + (d > 21 ? 'busts with ' + d : d) + ' · ' + t.seats.map(s => s.name + ' ' + s.result).join(' · ')); t.log.length = Math.min(t.log.length, 8);
}
function dealBlackjack(t, rng, now) {
  t.phase = 'playing'; t.round++; t.dealtAt = now; t.dealer = [draw(t, rng), draw(t, rng)];
  for (const s of t.seats) { s.cards = [draw(t, rng), draw(t, rng)]; s.natural = natural(s.cards); s.done = s.natural; s.result = null; s.payout = 0; }
  t.turn = -1; if (natural(t.dealer)) { t.turn = t.seats.length; t.phase = 'dealer'; return; } nextTurn(t, now);
}
function blackjack(game, def, t, a, name, rng, now) {
  const me = t.seats.find(s => key(s.name) === key(name));
  if (a.type === 'bj-bet') {
    if (t.phase !== 'betting') throw Error('Wait for the next hand');
    const amount = int(a.amount, range(def), def.min, def.max), w = wallet(game, name);
    if (me) { if (me.bet + amount > def.max) throw Error('Table maximum is ' + money(def.max)); take(w, amount, 'raise'); me.bet += amount; return 'Bet raised to ' + money(me.bet); }
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

// ---- Roulette -------------------------------------------------------------------------------------------
const BETS = { straight: 35, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1, dozen: 2, column: 2 };
function wins(kind, value, n) {
  if (kind === 'straight') return n === value; if (n === 0) return false;
  return { red: RED.has(n), black: !RED.has(n), odd: n % 2 === 1, even: n % 2 === 0, low: n <= 18, high: n >= 19, dozen: Math.ceil(n / 12) === value, column: ((n - 1) % 3) + 1 === value }[kind];
}
function roulette(game, def, t, a, name, rng, now) {
  if (a.type === 'rl-bet') {
    if (t.phase !== 'betting') throw Error('No more bets · the ball is rolling');
    if (!(a.kind in BETS)) throw Error('Unknown bet');
    const value = a.kind === 'straight' ? int(a.value, 'Pick a number 0–36', 0, 36) : ['dozen', 'column'].includes(a.kind) ? int(a.value, 'Pick 1, 2 or 3', 1, 3) : null;
    const amount = int(a.amount, range(def), def.min, def.max), w = wallet(game, name);
    take(w, amount); t.bets.push({ name: w.name, kind: a.kind, value, amount }); return 'Bet ' + money(amount) + ' on ' + a.kind + (value !== null ? ' ' + value : '');
  }
  if (a.type === 'rl-clear') { if (t.phase !== 'betting') throw Error('No more bets'); const mine = t.bets.filter(b => key(b.name) === key(name)), w = wallet(game, name); for (const b of mine) w.cash += b.amount; t.bets = t.bets.filter(b => !mine.includes(b)); return mine.length ? 'Your bets were returned' : 'You have no bets on the table'; }
  if (a.type === 'rl-spin') { if (t.phase !== 'betting') throw Error('Already spinning'); if (!t.bets.length) throw Error('Place a bet first'); t.phase = 'spinning'; t.round++; t.result = Math.floor(rng() * 37); t.spunAt = now; t.landsAt = now + ROULETTE_SPIN_MS; t.lastWinners = null; return 'No more bets · spinning'; }
  throw Error('Unknown roulette move');
}
function settleRoulette(game, t) {
  const n = t.result, winners = {};
  for (const b of t.bets) { const w = wallet(game, b.name), won = wins(b.kind, b.value, n), pay = won ? b.amount * (BETS[b.kind] + 1) : 0; w.cash += pay; result(w, 'Roulette ' + n + ' · ' + b.kind, pay - b.amount); if (won) winners[w.name] = (winners[w.name] || 0) + pay - b.amount; b.won = won; }
  for (const b of t.bets) if (b.won) { goal(game, b.name, 'rl-win'); if (b.kind === 'straight') goal(game, b.name, 'rl-number'); }
  t.history.unshift(n); t.history.length = Math.min(t.history.length, 14); t.lastWinners = winners; t.lastBets = t.bets; t.bets = []; t.phase = 'betting';
}

// ---- Texas Hold'em --------------------------------------------------------------------------------------
const RV = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
const CATS = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
function straightHigh(values) { const v = [...new Set(values)].sort((a, b) => b - a); if (v[0] === 14) v.push(1); let run = 1; for (let i = 1; i < v.length; i++) { run = v[i] === v[i - 1] - 1 ? run + 1 : 1; if (run >= 5) return v[i] + 4; } return 0; }
// Best five-card hand from up to seven cards: { score: [category, …kickers], name }.
export function bestHand(cards) {
  const cs = cards.map(c => ({ v: RV[c.slice(0, -1)], s: c.slice(-1) })), bySuit = {}; for (const c of cs) (bySuit[c.s] ??= []).push(c.v);
  const flushSuit = Object.keys(bySuit).find(s => bySuit[s].length >= 5);
  if (flushSuit) { const sf = straightHigh(bySuit[flushSuit]); if (sf) return { score: [8, sf], name: sf === 14 ? 'Royal flush' : 'Straight flush' }; }
  const count = {}; for (const c of cs) count[c.v] = (count[c.v] || 0) + 1;
  const groups = Object.entries(count).map(([v, n]) => [+v, n]).sort((a, b) => b[1] - a[1] || b[0] - a[0]), vals = cs.map(c => c.v).sort((a, b) => b - a);
  const kick = (excl, n) => vals.filter(v => !excl.includes(v)).slice(0, n);
  if (groups[0][1] === 4) return { score: [7, groups[0][0], ...kick([groups[0][0]], 1)], name: CATS[7] };
  if (groups[0][1] === 3 && groups[1]?.[1] >= 2) return { score: [6, groups[0][0], groups[1][0]], name: CATS[6] };
  if (flushSuit) return { score: [5, ...bySuit[flushSuit].sort((a, b) => b - a).slice(0, 5)], name: CATS[5] };
  const st = straightHigh(vals); if (st) return { score: [4, st], name: CATS[4] };
  if (groups[0][1] === 3) return { score: [3, groups[0][0], ...kick([groups[0][0]], 2)], name: CATS[3] };
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) return { score: [2, groups[0][0], groups[1][0], ...kick([groups[0][0], groups[1][0]], 1)], name: CATS[2] };
  if (groups[0][1] === 2) return { score: [1, groups[0][0], ...kick([groups[0][0]], 3)], name: CATS[1] };
  return { score: [0, ...vals.slice(0, 5)], name: CATS[0] };
}
export const compareHands = (a, b) => { for (let i = 0; i < Math.max(a.score.length, b.score.length); i++) { const d = (a.score[i] || 0) - (b.score[i] || 0); if (d) return d; } return 0; };
const occupied = t => t.seats.map((s, i) => s ? i : -1).filter(i => i >= 0);
const nextSeat = (t, from, ok) => { const n = t.seats.length; for (let k = 1; k <= n; k++) { const i = (from + k + n) % n; if (t.seats[i] && ok(t.seats[i], i)) return i; } return -1; };
const inHand = s => s && s.cards?.length && !s.folded;
const canAct = s => inHand(s) && !s.allIn;
function postBet(s, amount) { const a = Math.min(amount, s.stack); s.stack -= a; s.bet += a; s.total += a; if (!s.stack) s.allIn = true; return a; }
function startHand(def, t, rng, now) {
  for (const i of occupied(t)) { const s = t.seats[i]; if (s.leaving || s.stack <= 0) { s.sittingOut = true; } }
  const players = occupied(t).filter(i => !t.seats[i].sittingOut);
  if (players.length < 2) { t.phase = 'waiting'; return false; }
  t.hand++; t.deck = shuffled(1, rng); t.board = []; t.results = null; t.phase = 'preflop'; t.streetAt = now; t.dealtAt = now;
  for (const i of occupied(t)) Object.assign(t.seats[i], { cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, shown: false, best: null, won: 0 });
  for (const i of players) t.seats[i].cards = [t.deck.pop(), t.deck.pop()];
  const ok = s => !s.sittingOut && s.cards.length;
  t.button = nextSeat(t, t.button, ok);
  const headsUp = players.length === 2, sb = headsUp ? t.button : nextSeat(t, t.button, ok), bb = nextSeat(t, sb, ok);
  postBet(t.seats[sb], def.sb); postBet(t.seats[bb], def.bb); t.sbSeat = sb; t.bbSeat = bb;
  t.currentBet = def.bb; t.minRaise = def.bb; t.toAct = nextSeat(t, bb, canAct); if (t.toAct < 0) t.toAct = bb; t.actionEndsAt = now + POKER_ACT_MS;
  t.log.unshift('Hand #' + t.hand + ' · ' + t.seats[sb].name + ' small blind, ' + t.seats[bb].name + ' big blind'); t.log.length = Math.min(t.log.length, 10);
  if (!players.some(i => canAct(t.seats[i]) && (t.seats[i].bet < t.currentBet || !t.seats[i].acted))) advance(def, t, rng, now);
  return true;
}
function roundDone(t) { const live = occupied(t).map(i => t.seats[i]).filter(inHand); if (live.length <= 1) return true; return live.filter(s => !s.allIn).every(s => s.acted && s.bet === t.currentBet); }
function advance(def, t, rng, now) {
  const live = occupied(t).map(i => t.seats[i]).filter(inHand);
  if (live.length <= 1 || t.phase === 'river') return showdown(t, now);
  for (const s of t.seats) if (s) { s.bet = 0; s.acted = false; }
  t.currentBet = 0; t.minRaise = def.bb; t.streetAt = now;
  if (t.phase === 'preflop') { t.board.push(t.deck.pop(), t.deck.pop(), t.deck.pop()); t.phase = 'flop'; } else if (t.phase === 'flop') { t.board.push(t.deck.pop()); t.phase = 'turn'; } else { t.board.push(t.deck.pop()); t.phase = 'river'; }
  if (live.filter(s => !s.allIn).length <= 1) return advance(def, t, rng, now);   // everyone all-in: run the board out
  t.toAct = nextSeat(t, t.button, canAct); t.actionEndsAt = now + POKER_ACT_MS;
}
function showdown(t, now) {
  const seats = occupied(t).map(i => ({ s: t.seats[i], i })), live = seats.filter(x => inHand(x.s)), out = [];
  for (const x of live) if (t.board.length === 5 || live.length > 1) x.s.best = bestHand([...x.s.cards, ...t.board]);
  if (live.length === 1) { const pot = seats.reduce((a, x) => a + x.s.total, 0); live[0].s.stack += pot; live[0].s.won = pot; out.push({ name: live[0].s.name, amount: pot, hand: 'uncontested' }); }
  else {
    // Side pots: layer by all-in level; each layer goes to the best eligible hand (ties split, odd chip to the first after the button).
    const levels = [...new Set(seats.filter(x => x.s.total > 0).map(x => x.s.total))].sort((a, b) => a - b); let prev = 0;
    for (const level of levels) {
      const amount = seats.reduce((a, x) => a + Math.max(0, Math.min(x.s.total, level) - prev), 0), eligible = live.filter(x => x.s.total >= level); prev = level;
      if (!amount || !eligible.length) continue;
      const best = eligible.reduce((b, x) => !b.length || compareHands(x.s.best, b[0].s.best) > 0 ? [x] : compareHands(x.s.best, b[0].s.best) === 0 ? [...b, x] : b, []);
      const order = best.sort((a, b) => ((a.i - t.button + 5) % 5) - ((b.i - t.button + 5) % 5)), share = Math.floor(amount / order.length); let rest = amount - share * order.length;
      for (const x of order) { const w = share + (rest-- > 0 ? 1 : 0); x.s.stack += w; x.s.won += w; const o = out.find(r => r.name === x.s.name); if (o) o.amount += w; else out.push({ name: x.s.name, amount: w, hand: x.s.best.name }); }
    }
    for (const x of live) x.s.shown = true;
  }
  t.results = { hand: t.hand, winners: out, board: t.board.slice(), at: now }; t.phase = 'showdown'; t.toAct = -1; t.nextHandAt = now + 9000;
  t.log.unshift('Hand #' + t.hand + ' · ' + out.map(r => r.name + ' wins ' + money(r.amount) + ' (' + r.hand + ')').join(' · ')); t.log.length = Math.min(t.log.length, 10);
}
function poker(game, def, t, a, name, rng, now) {
  const seat = t.seats.findIndex(s => s && key(s.name) === key(name)), me = t.seats[seat];
  if (a.type === 'pk-sit') {
    if (me) throw Error('You already have a seat');
    const want = a.seat !== undefined ? int(a.seat, 'Choose seat 1–5', 0, def.seats - 1) : t.seats.findIndex(s => !s);
    if (want < 0 || t.seats[want]) throw Error(want < 0 ? 'The table is full' : 'That seat is taken');
    const buy = int(a.buyIn ?? def.minBuy * 5, 'Buy in for ' + money(def.minBuy) + '–' + money(def.maxBuy), def.minBuy, def.maxBuy), w = wallet(game, name); take(w, buy, 'buy-in');
    t.seats[want] = { name: w.name, stack: buy, bet: 0, total: 0, cards: [], folded: false, allIn: false, acted: false, sittingOut: false, buyIn: buy };
    if (t.phase === 'waiting' && occupied(t).length >= 2 && !t.nextHandAt) t.nextHandAt = now + 5000;
    note(w, 'Poker buy-in', -buy); return 'Seated at seat ' + (want + 1) + ' with ' + money(buy);
  }
  if (!me) throw Error('Take a seat first');
  if (a.type === 'pk-leave') {
    const live = !['waiting', 'showdown'].includes(t.phase) && inHand(me);
    if (live) { me.leaving = true; if (t.toAct === seat) return poker(game, def, t, { type: 'pk-fold' }, name, rng, now); me.folded = true; if (roundDone(t)) advance(def, t, rng, now); return 'You fold and leave after this hand'; }
    const w = wallet(game, name); w.cash += me.stack; result(w, 'Poker cash-out', me.stack - (me.buyIn || 0)); t.seats[seat] = null; return 'Cashed out ' + money(me.stack);
  }
  if (a.type === 'pk-rebuy') { if (!['waiting', 'showdown'].includes(t.phase)) throw Error('Top up between hands'); const amt = int(a.amount, 'Top up', 1, def.maxBuy - me.stack); take(wallet(game, name), amt, 'top-up'); me.stack += amt; me.buyIn = (me.buyIn || 0) + amt; me.sittingOut = false; return 'Topped up to ' + money(me.stack); }
  if (t.toAct !== seat || !canAct(me)) throw Error(['waiting', 'showdown'].includes(t.phase) ? 'Wait for the next hand' : 'Not your turn');
  const owe = t.currentBet - me.bet; let msg;
  if (a.type === 'pk-fold') { me.folded = true; msg = 'Fold'; }
  else if (a.type === 'pk-check') { if (owe > 0) throw Error('You must call ' + money(owe) + ' or fold'); msg = 'Check'; }
  else if (a.type === 'pk-call') { if (owe <= 0) throw Error('Nothing to call · check'); postBet(me, owe); msg = me.allIn ? 'Call · all-in' : 'Call ' + money(owe); }
  else if (a.type === 'pk-raise' || a.type === 'pk-allin') {
    const to = a.type === 'pk-allin' ? me.bet + me.stack : int(a.to, 'Raise amount', 1, 1e9), add = to - me.bet;
    if (add > me.stack) throw Error('You only have ' + money(me.stack));
    const full = to - t.currentBet >= t.minRaise;
    if (to <= t.currentBet) throw Error('Raise above ' + money(t.currentBet)); if (!full && add < me.stack) throw Error('Minimum raise is to ' + money(t.currentBet + t.minRaise));
    postBet(me, add); if (full) { t.minRaise = to - t.currentBet; for (const s of t.seats) if (s && s !== me) s.acted = false; } t.currentBet = Math.max(t.currentBet, me.bet); msg = me.allIn ? 'All-in ' + money(me.bet) : (owe ? 'Raise to ' : 'Bet ') + money(to);
  } else throw Error('Unknown poker move');
  me.acted = true; me.lastAction = msg;
  if (roundDone(t)) advance(def, t, rng, now); else { t.toAct = nextSeat(t, seat, canAct); t.actionEndsAt = now + POKER_ACT_MS; }
  return msg;
}
function pokerTick(game, def, t, rng, now) {
  let changed = false;
  if (t.phase === 'showdown' && now >= t.nextHandAt) {
    for (const i of occupied(t)) { const s = t.seats[i]; if (s.leaving) { const w = wallet(game, s.name); w.cash += s.stack; result(w, 'Poker cash-out', s.stack - (s.buyIn || 0)); t.seats[i] = null; } else { s.cards = []; s.bet = s.total = 0; s.folded = s.allIn = s.shown = false; s.best = null; if (s.stack <= 0) s.sittingOut = true; } }
    t.phase = 'waiting'; t.board = []; t.nextHandAt = now + 2000; changed = true;
  }
  if (t.phase === 'waiting' && occupied(t).filter(i => !t.seats[i].sittingOut && t.seats[i].stack > 0).length >= 2 && now >= (t.nextHandAt || 0)) { startHand(def, t, rng, now); changed = true; }
  if (!['waiting', 'showdown'].includes(t.phase) && now >= t.actionEndsAt && t.seats[t.toAct]) { const s = t.seats[t.toAct]; try { poker(game, def, t, { type: s.bet === t.currentBet ? 'pk-check' : 'pk-fold' }, s.name, rng, now); } catch {} changed = true; }
  return changed;
}

// ---- Slots & lotto --------------------------------------------------------------------------------------
function reel(rng) { let r = rng() * SLOT_WEIGHTS.reduce((a, b) => a + b), i = 0; while (r >= SLOT_WEIGHTS[i]) r -= SLOT_WEIGHTS[i++]; return i; }
export function slotPay(reels) { if (reels[0] === reels[1] && reels[1] === reels[2]) return SLOT_PAYS[reels[0]]; return reels.filter(r => r === 0).length === 2 ? 2.5 : 0; }
function slots(game, def, t, a, name, rng, now) {
  if (t.last && key(t.last.name) !== key(name) && now - t.last.at < 2600) throw Error(t.last.name + "'s reels are still spinning");
  const bet = int(a.amount, range(def), def.min, def.max), w = wallet(game, name); take(w, bet);
  let reels = [reel(rng), reel(rng), reel(rng)]; const l = luckOf(game, name, now), lucky = l?.kind === 'lucky';
  if (l && (lucky ? slotPay(reels) === 0 : slotPay(reels) > 0) && rng() < l.strength) reels = [reel(rng), reel(rng), reel(rng)];   // the drink nudges one re-spin
  const pay = Math.round(slotPay(reels) * bet); w.cash += pay; result(w, def.name + ' · ' + reels.map(r => SLOT_SYMBOLS[r]).join(' '), pay - bet);
  t.spins++; t.last = { name: w.name, reels, bet, pay, at: now, spin: t.spins }; if (pay > 0) goal(game, name, 'slot-win'); return pay ? 'Win ' + money(pay) + '!' : 'No win';
}
function lotto(game, t, a, name, rng, now) {
  const picks = [...new Set((a.picks || []).map(Number))].filter(n => Number.isInteger(n) && n >= 1 && n <= LOTTO.numbers);
  if (picks.length !== LOTTO.picks) throw Error('Pick ' + LOTTO.picks + ' different numbers from 1 to ' + LOTTO.numbers);
  // One machine: tickets queue and are drawn in order, at most two waiting.
  const wait = Math.max(0, (t.busyUntil || 0) - now); if (wait > 2 * LOTTO.drawMs) throw Error('The machine is busy · try again in ' + Math.ceil((wait - 2 * LOTTO.drawMs) / 1000 + 1) + ' s');
  const w = wallet(game, name); take(w, LOTTO.price, 'ticket'); t.jackpot += LOTTO.add; t.tickets++; t.busyUntil = now + wait + LOTTO.drawMs;
  const pool = Array.from({ length: LOTTO.numbers }, (_, i) => i + 1), balls = [];
  const l = luckOf(game, name, now);
  for (let i = 0; i < LOTTO.picks; i++) {
    let b = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (l && (l.kind === 'lucky') !== picks.includes(b) && rng() < l.strength * .6) { pool.push(b); b = pool.splice(Math.floor(rng() * pool.length), 1)[0]; }   // luck redraws a ball
    balls.push(b);
  }
  const hits = picks.filter(n => balls.includes(n)).length; let prize = LOTTO.pays[hits] || 0;
  if (hits === LOTTO.picks) { prize = t.jackpot; t.jackpot = LOTTO.seed; }
  w.cash += prize; result(w, 'Lotto · ' + hits + ' of 5', prize - LOTTO.price);
  t.last.unshift({ name: w.name, picks, balls, hits, prize, at: now, wait, ticket: t.tickets }); if (hits >= 2) goal(game, name, 'lotto-2'); t.last.length = Math.min(t.last.length, 8);
  return { message: prize ? 'Lotto · ' + hits + ' numbers · won ' + money(prize) : 'Lotto · ' + hits + ' numbers · no prize', balls, hits, prize };
}

// ---- Loans ----------------------------------------------------------------------------------------------
function loans(game, a, name) {
  game.loans ??= [];
  if (a.type === 'lend') {
    const to = String(a.to || '').trim(); if (!to || key(to) === key(name)) throw Error('Choose another engineer');
    if (!game.wallets?.[key(to)]) throw Error(to + ' has no wallet yet');
    const amount = int(a.amount, 'Lend between 1,000₮ and 1,000,000,000₮', 1000, 1e9), from = wallet(game, name), b = wallet(game, to);
    take(from, amount); b.cash += amount; game.loanCounter = (game.loanCounter || 0) + 1;
    game.loans.push({ id: 'L' + game.loanCounter, lender: from.name, borrower: b.name, amount, owed: amount, at: Date.now() });
    note(from, 'Lent to ' + b.name, -amount); note(b, 'Loan from ' + from.name, amount); return 'Lent ' + money(amount) + ' to ' + b.name;
  }
  if (a.type === 'repay') {
    const loan = game.loans.find(l => l.id === a.id && key(l.borrower) === key(name) && l.owed > 0); if (!loan) throw Error('No open loan to repay');
    const w = wallet(game, name), amount = Math.min(loan.owed, int(a.amount ?? loan.owed, 'Repay at least 1,000₮', 1, 1e10)); take(w, amount);
    const lender = wallet(game, loan.lender); lender.cash += amount; loan.owed -= amount; note(w, 'Repaid ' + lender.name, -amount); note(lender, 'Repayment from ' + w.name, amount);
    return 'Repaid ' + money(amount) + ' to ' + lender.name + (loan.owed ? ' · still owe ' + money(loan.owed) : ' · loan cleared');
  }
  if (a.type === 'forgive') { const loan = game.loans.find(l => l.id === a.id && key(l.lender) === key(name) && l.owed > 0); if (!loan) throw Error('No open loan of yours'); const owed = loan.owed; loan.owed = 0; loan.forgiven = true; return 'Forgave ' + money(owed) + ' owed by ' + loan.borrower; }
  throw Error('Unknown wallet action');
}

const GAME_OF = { bj: 'blackjack', rl: 'roulette', pk: 'poker', sl: 'slots', st: 'stage' };
function startDance(t, req, now) { t.round++; t.dance = req.dance; t.by = req.name; t.startedAt = now; t.until = now + DANCE_MS; t.log.unshift(req.name + ' tipped ' + money(req.amount) + ' · ' + DANCES[req.dance]); t.log.length = Math.min(t.log.length, 8); }
function stage(game, def, t, a, name, now) {
  if (a.type !== 'st-tip') throw Error('Unknown stage action');
  const dance = int(a.dance, 'Choose one of the six dances', 0, DANCES.length - 1), amount = int(a.amount, 'Tip between ' + money(def.min) + ' and ' + money(def.max), def.min, def.max), w = wallet(game, name);
  if (t.queue.length >= 6) throw Error('Six dances are already requested · tip again in a moment');
  take(w, amount, 'tip'); result(w, 'Tip · ' + DANCES[dance], -amount); goal(game, name, 'tip'); t.tips += amount; const req = { name: w.name, dance, amount };
  if (now >= t.until) { startDance(t, req, now); return 'Thank you! ' + DANCES[dance] + ' starts now'; }
  t.queue.push(req); return 'Thank you! ' + DANCES[dance] + ' is next in line (' + t.queue.length + ')';
}
export function casinoApply(game, a, name, rng = Math.random, now = Date.now()) {
  if (!game.payday) throw Error('The casino and wallets are part of Payday mode');
  if (!game.casino) game.casino = freshCasino(); migrateCasino(game); wallet(game, name); goalsOf(game, name, rng);
  if (a?.type === 'hello') return 'Wallet ready · ' + money(wallet(game, name).cash);
  if (['lend', 'repay', 'forgive'].includes(a?.type)) return loans(game, a, name);
  if (a?.type === 'lotto') return lotto(game, game.casino.tables.lotto, a, name, rng, now);
  if (a?.type === 'drink') return drink(game, a, name, rng, now);
  if (a?.type === 'claim-goals') return claimGoals(game, name);
  if (a?.type === 'buy-weapon') return buyWeapon(game, a, name);
  const prefix = String(a?.type || '').split('-')[0], gameName = GAME_OF[prefix]; if (!gameName) throw Error('Unknown casino action');
  const id = a.table || TABLES.find(t => t.game === gameName).id, def = tableDef(id); if (def && !game.casino.tables[id]) game.casino.tables[id] = freshTable(def); const t = game.casino.tables[id];
  if (!def || def.game !== gameName || !t) throw Error('Unknown table');
  if (gameName === 'blackjack') return blackjack(game, def, t, a, name, rng, now);
  if (gameName === 'roulette') return roulette(game, def, t, a, name, rng, now);
  if (gameName === 'poker') { const r = poker(game, def, t, a, name, rng, now); pokerGoals(game, t); return r; }
  if (gameName === 'stage') return stage(game, def, t, a, name, now);
  return slots(game, def, t, a, name, rng, now);
}

// ---- Bar & weapon market ---------------------------------------------------------------------------------
function drink(game, a, name, rng, now) {
  const d = DRINKS.find(x => x.id === a.drink); if (!d) throw Error('That is not on the menu');
  const w = wallet(game, name); take(w, DRINK_PRICE, d.name); note(w, 'Bar · ' + d.name, -DRINK_PRICE);
  const kind = rng() < .5 ? 'lucky' : 'unlucky'; game.luck ??= {};
  game.luck[key(name)] = { kind, strength: d.strength, drink: d.name, until: now + d.min * 60000 };
  goal(game, name, 'drink');
  const bar = game.casino.tables.bar ??= freshTable(tableDef('bar')); bar.served++; bar.last = { name: w.name, drink: d.name, kind, at: now };
  return d.name + ' · you feel ' + (kind === 'lucky' ? 'LUCKY' : 'UNLUCKY') + ' for ' + d.min + ' min (slots and lotto)';
}
function buyWeapon(game, a, name) {
  const wpn = WEAPONS.find(x => x.id === a.weapon); if (!wpn) throw Error('Unknown weapon');
  game.arsenal ??= {}; const own = game.arsenal[key(name)] ??= []; if (own.includes(wpn.id)) throw Error('You already own the ' + wpn.name);
  const w = wallet(game, name); take(w, wpn.price, wpn.name); note(w, 'Weapon market · ' + wpn.name, -wpn.price); own.push(wpn.id);
  const m = game.casino.tables.guns ??= freshTable(tableDef('guns')); m.sold++; m.last = { name: w.name, weapon: wpn.name };
  return 'Bought the ' + wpn.name + ' · press 4 to draw it';
}
export const arsenalOf = (game, name) => [...(/^darja$/.test(key(name)) ? ['cannon'] : []), ...(game.arsenal?.[key(name)] || [])];

// Timers and level bonuses. Returns true when state changed (the host then broadcasts it).
// Hold'em winners advance their goals once per hand (results are written where the game state isn't at hand).
function pokerGoals(game, t) { if (t.results && t.goalsHand !== t.results.hand) { t.goalsHand = t.results.hand; for (const o of t.results.winners || []) goal(game, o.name, 'pk-pot'); } }
export function casinoTick(game, rng = Math.random, now = Date.now()) {
  for (const d of TABLES) if (d.game === 'poker' && game.casino?.tables?.[d.id]) pokerGoals(game, game.casino.tables[d.id]);
  if (!game.payday || !game.casino) return false; migrateCasino(game); let changed = false;
  const earned = Object.keys(game.levels?.earned || {}).length;
  if (earned > (game.paidLevels || 0)) { const n = earned - (game.paidLevels || 0); game.paidLevels = earned; for (const w of Object.values(game.wallets || {})) { w.cash += LEVEL_BONUS * n; w.salary += LEVEL_BONUS * n; note(w, 'Level bonus', LEVEL_BONUS * n); goal(game, w.name, 'level', n, rng); } changed = true; }
  for (const def of TABLES) {
    const t = game.casino.tables[def.id] ??= freshTable(def);
    if (def.game === 'blackjack') {
      if (t.phase === 'betting' && t.seats.length && t.closesAt && now >= t.closesAt) { dealBlackjack(t, rng, now); changed = true; }
      if (t.phase === 'playing' && now >= t.turnEndsAt && t.seats[t.turn]) { t.seats[t.turn].done = true; nextTurn(t, now); changed = true; }
      if (t.phase === 'dealer') { settleBlackjack(game, t, rng, now); changed = true; }
      if (t.phase === 'done' && now >= t.doneAt) { t.phase = 'betting'; t.seats = []; t.dealer = []; t.turn = -1; t.closesAt = 0; changed = true; }
    }
    if (def.game === 'roulette' && t.phase === 'spinning' && now >= t.landsAt) { settleRoulette(game, t); changed = true; }
    if (def.game === 'poker' && pokerTick(game, def, t, rng, now)) changed = true;
    if (def.game === 'stage' && t.dance >= 0 && now >= t.until) { if (t.queue.length) startDance(t, t.queue.shift(), now); else t.dance = -1; changed = true; }
  }
  return changed;
}

// What one engineer may see: other players' poker hole cards stay face down until they are shown.
export function redactCasino(casino, viewer) {
  if (!casino?.tables) return casino; const v = key(viewer), out = { ...casino, tables: { ...casino.tables } };
  for (const def of TABLES) if (def.game === 'poker' && out.tables[def.id]) { const t = out.tables[def.id]; out.tables[def.id] = { ...t, deck: [], seats: t.seats.map(s => s && !s.shown && key(s.name) !== v && s.cards?.length ? { ...s, cards: s.cards.map(() => '??') } : s) }; }
  for (const def of TABLES) if (def.game === 'blackjack' && out.tables[def.id]) { const t = out.tables[def.id]; out.tables[def.id] = { ...t, shoe: [], dealer: t.phase === 'done' ? t.dealer : t.dealer.map((c, i) => i === 1 ? '??' : c) }; }
  return out;
}
export function walletSummary(game) { return Object.values(game.wallets || {}).sort((a, b) => b.cash - a.cash).map(w => ({ name: w.name, cash: w.cash, salary: w.salary, won: w.won, lost: w.lost })); }
