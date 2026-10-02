// One local clock for casino animations, shared by the 3D tables and the casino panel, so the ball, reels,
// cards and lotto balls land on screen at the same moment the panel reveals the result. Each event (a spin,
// a deal, a ticket) is keyed by table + round; the first time this client sees it starts its animation.
const seen = new Map();
export function startedAt(key, now = performance.now()) { if (!seen.has(key)) { seen.set(key, now); if (seen.size > 400) seen.delete(seen.keys().next().value); } return seen.get(key); }
export const elapsed = (key, now = performance.now()) => now - startedAt(key, now);
// Durations (ms) both sides use.
export const SYNC = { roulette: 7000, slots: 2200, lottoBall: 1200, dealCard: 380, flop: 600 };
