// One local clock for casino animations, shared by the 3D tables and the casino panel, so the ball, reels,
// cards and lotto balls land on screen at the same moment the panel reveals the result. Each event (a spin,
// a deal, a ticket) is keyed by table + round; the first time this client sees it starts its animation.
const seen = new Map();
export function startedAt(key, now = performance.now()) { if (!seen.has(key)) { seen.set(key, now); if (seen.size > 400) seen.delete(seen.keys().next().value); } return seen.get(key); }
export const elapsed = (key, now = performance.now()) => now - startedAt(key, now);
// Durations (ms) both sides use.
export const SYNC = { roulette: 7000, slots: 2200, lottoBall: 1200, dealCard: 380, flop: 600 };
SYNC.dealerCard = 750; SYNC.cardFlight = 320; SYNC.boardCard = 200; SYNC.lottoDraw = 8000;   // lottoDraw = LOTTO.drawMs on the host

// Blackjack after the players: the hole card turns over, then each dealer draw lands one by one, and only then
// are wins / losses (and the chips that pay them) shown.
export function bjReveal(id, t, now = performance.now()) {
  if (t.phase !== 'done') return { cardAt: () => -Infinity, settled: false, revealAt: Infinity };
  const d0 = startedAt('bjd:' + id + ':' + t.round, now), revealAt = d0 + Math.max(0, t.dealer.length - 2) * SYNC.dealerCard + 500;
  return { cardAt: i => i < 2 ? d0 : d0 + (i - 1) * SYNC.dealerCard, settled: now >= revealAt, revealAt };
}
// Lotto: the host queues tickets on the one machine (each ticket carries `wait`, ms after purchase before
// its draw starts). Start times are anchored on the newest ticket and offset by host-time differences, so a
// player who walks in late doesn't see old draws replayed. Returns every ticket's draw clock (e = ms into its
// draw, negative while queued) and the one the machine is showing.
// Hold'em board: when card i lands on the felt. Each card is timed from when this client first saw it; the
// flop's three cards fly one after another, the turn and river on their own.
export function boardLandsAt(id, hand, i, now = performance.now()) { return startedAt('pkb:' + id + ':' + hand + ':' + i, now) + (i < 3 ? i * SYNC.boardCard : 0) + SYNC.cardFlight; }
// A card dealt during play (a hit or a double): lands one flight after it first appears.
export const hitLandsAt = (key, now = performance.now()) => startedAt('hit:' + key, now) + SYNC.cardFlight;
export function lottoPlan(lt, now = performance.now()) {
  const list = lt?.last || [], top = list[0]; if (!top) return { items: [], shown: null };
  const anchor = startedAt('lt:' + top.ticket, now) - (top.at || 0);                          // host time → this client's clock
  const items = list.map(x => ({ x, e: now - (anchor + (x.at || 0) + (x.wait || 0)) }));
  return { items, shown: items.find(i => i.e >= 0 && i.e < SYNC.lottoDraw) || items.find(i => i.e >= 0) || null, of: x => items.find(i => i.x === x) };
}
