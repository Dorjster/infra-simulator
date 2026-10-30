// Global Defensive host clock on a guest (dist/host-clock.js, GD-NET-06): every match time — round, buy, bomb and lobby
// clocks, when the dead come back, the Deathmatch clock — is the host's; a guest's own clock is often seconds off on an
// offline LAN. hostNow() follows the host from the frames' send stamps: the least delayed frame of the last 3 s (jitter
// and a stalled stream never pull it back), eased toward a better one (no jumps on screen), at once for a step of 250 ms
// or more (another host, its clock changed). And the GD screens compare the host's stamps with it, not Date.now().
//   node tests/gd-host-clock.mjs
import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
// A controlled clock: this computer's wall clock and its monotonic one move together; the host's runs 5 s ahead.
let mono = 1000, wall = 1.7e12; const realNow = Date.now; Date.now = () => wall; performance.now = () => mono;
const step = ms => { mono += ms; wall += ms; }, AHEAD = 5000, hostAt = delay => wall + AHEAD - delay;   // a frame stamped by the host `delay` ms ago
const { hostNow, hostClockSample, resetHostClock, hostClockSynced } = await import('../dist/host-clock.js');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

ok('no frame yet (solo, another mode): this computer’s clock', hostNow() === wall && !hostClockSynced());
hostClockSample(hostAt(30)); ok('the first frame (30 ms on the way): the host’s time at once', near(hostNow(), wall + AHEAD - 30, .5), hostNow() - wall);
// Frames 50 ms apart for 2 s, mostly 30 ms on the way, one in five quick (8 ms), and a stall of 1.5 s now and then.
for (let i = 0; i < 40; i++) { step(50); hostClockSample(hostAt(i % 13 === 6 ? 1500 : i % 5 === 0 ? 8 : 30)); }
ok('jitter and a stalled frame never pull it back: it follows the least delayed frames (≈ 8 ms behind the host)', near(hostNow(), wall + AHEAD - 8, 3), (hostNow() - wall - AHEAD).toFixed(1));
// The next better frame (2 ms): eased in at 5 % of the time passing — no jump of the round clock on screen.
step(50); const before = hostNow(); hostClockSample(hostAt(2)); ok('a better frame (6 ms better) is eased in, not jumped to: 5 % of the 50 ms since the last', hostNow() - before > 0 && hostNow() - before <= 2.51, (hostNow() - before).toFixed(2));
for (let i = 0; i < 20; i++) { step(50); hostClockSample(hostAt(2)); } ok('…and reached within a second', near(hostNow(), wall + AHEAD - 2, .5), (hostNow() - wall - AHEAD).toFixed(2));
// The host's clock steps 10 s (its time was set, or this is another host): taken at once.
for (let i = 0; i < 5; i++) { step(50); hostClockSample(hostAt(2) + 10000); } ok('a host clock step of 10 s is taken at once', near(hostNow(), wall + AHEAD + 10000 - 2, .5), (hostNow() - wall - AHEAD).toFixed(1));
// This computer's own wall clock is changed (Date.now jumps a minute): the host's time does not move (monotonic clock).
const h0 = hostNow(); wall += 60000; ok('this computer’s clock being changed does not move the host’s time', hostNow() === h0);
wall -= 60000;
// A new room: learnt afresh.
resetHostClock(); ok('a new room (rejoined, another host): this computer’s clock until its first frame', hostNow() === wall && !hostClockSynced());
// A stall of 4 s (Wi-Fi, this page busy building a map), then the frames queued meanwhile arrive in a burst, oldest first,
// and the stream goes on: the 3 s window holds only late frames for a moment — hostNow must not go back by the stall.
for (let i = 0; i < 60; i++) { step(50); hostClockSample(hostAt(20)); }
step(4000); let worst = 0; const err = () => hostNow() - (wall + AHEAD - 20);
for (let k = 80; k >= 0; k--) { hostClockSample(hostAt(k * 50 + 20)); worst = Math.min(worst, err()); if (k % 10 === 0) step(3); }
for (let i = 0; i < 100; i++) { step(50); hostClockSample(hostAt(i < 40 ? 400 - i * 9 : 20)); worst = Math.min(worst, err()); }   // (then a slow drain: 400 ms late, catching up)
ok('a 4 s stall and its backlog (oldest first, then a slow drain): hostNow never goes back more than 30 ms', worst > -30, worst.toFixed(0));
ok('…and is on the host’s time afterwards', near(err(), 0, 2), err().toFixed(1));
// The host's clock is set back 10 s: followed once every frame says so for 3 s more (3–6 s), not on one late burst.
let back = -1; for (let i = 0; i < 200 && back < 0; i++) { step(50); hostClockSample(hostAt(20) - 10000); if (near(hostNow(), wall + AHEAD - 10020, 5)) back = (i + 1) * 50; }
ok('a host clock set back 10 s is followed within 3–6.5 s of its frames', back >= 3000 && back <= 6500, back + ' ms');
Date.now = realNow;

// The GD screens judge the host's stamps by the host's clock (GD-NET-06's list): the dead (HUD, spectating, radar), the buy
// time, round, lobby, Deathmatch and bomb clocks — never against this computer's Date.now().
const src = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const STAMPS = /(until|buyUntil|endsAt|explodeAt|\.at)\s*-\s*Date\.now\(\)|>\s*Date\.now\(\)|Date\.now\(\)\s*>\s*r\.buyUntil|isDown\([^()]*\.name\)/;
for (const f of ['arena-ui.js', 'combat-hud.js', 'arena-spectate.js', 'gd-radar.js']) { const s = src(f), m = STAMPS.exec(s);
  ok(f + ': imports the host clock and compares no host stamp with Date.now()', /from '\.\/host-clock\.js'/.test(s) && !m, m ? m[0] : ''); }
console.log('PASS: host clock · ' + n + ' checks (least-delayed frame, eased, steps at once, monotonic, reset; GD screens on the host’s clock)');
