// Global Defensive performance overlay (dist/gd-perf-overlay.js): the ring buffer's percentiles match the stress test's
// definition (sorted, index floor(n·k)), roll over correctly once full, count long frames, and pushing + reading
// percentiles every frame allocates nothing (the per-frame path must be garbage-free: "no lag"). The overlay object itself
// updates its text at most 4 times a second and only touches a line's DOM text when it changed (tiny DOM stub).
import v8 from 'node:v8'; import vm from 'node:vm';
import { createRing, createPerfOverlay, limitOf } from '../dist/gd-perf-overlay.js';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const ref = (a, k) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * k))]; };
const close = (a, b) => Math.abs(a - b) < 1e-3;
{ const r = createRing(10); check('empty ring: quantiles 0, count 0', r.quantile(.5) === 0 && r.count === 0);
  for (const v of [5, 1, 4]) r.push(v); check('partly filled: p50 of [5,1,4] = 4, p0 = 1, max = 5 (the unused tail never counts)', r.quantile(.5) === 4 && r.quantile(0) === 1 && r.quantile(1) === 5, [r.quantile(0), r.quantile(.5), r.quantile(1)].join(','));
  for (let i = 0; i < 25; i++) r.push(100 + i); check('rolled over: holds only the last 10 (115..124)', r.count === 10 && r.quantile(0) === 115 && r.quantile(1) === 124 && r.last() === 124, [r.quantile(0), r.quantile(1), r.last()].join(',')); }
{ let seed = 3; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647; const r = createRing(240), all = [];
  for (let i = 0; i < 1000; i++) { const v = rnd() < .03 ? 33.4 + rnd() * 30 : 16.6 + rnd() * .3; r.push(v); all.push(Math.fround(v)); }
  const win = all.slice(-240); let good = true; for (const k of [.5, .95, .99, 1]) if (!close(r.quantile(k), ref(win, k))) good = false;
  check('p50 / p95 / p99 / max equal the stress test\'s definition over the last 240 frames', good, [.5, .95, .99].map(k => r.quantile(k).toFixed(2) + '=' + ref(win, k).toFixed(2)).join(' '));
  check('long frames counted in the window (> 33.4 ms)', r.over(33.4) === win.filter(x => x > 33.4).length, r.over(33.4));
  check('mean over the window', Math.abs(r.mean() - win.reduce((a, b) => a + b, 0) / 240) < 1e-3); }
{ // allocation-free: after warm-up, 200 000 frames of push + quantile reads leave the heap where it was
  v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc'); const r = createRing(240), sink = new Float64Array(1);   // (a typed-array sink: a double kept in a closure variable is boxed on every write — the test's own garbage)
  const vals = new Float64Array(7); for (let i = 0; i < 7; i++) vals[i] = 16 + i * .1 + (i === 6 ? 30 : 0);   // (frame times from a typed array: a fresh double passed to a call that isn't inlined is boxed — the caller's garbage, not the ring's)
  function frames(N) { for (let i = 0; i < N; i++) { r.push(vals[i % 7]); if (i % 15 === 0) sink[0] += r.quantile(.5) + r.quantile(.95) + r.quantile(.99) + r.over(33.4); } }
  for (let k = 0; k < 4; k++) { frames(200000); gc(); }   // (warm-up: the optimizing compiler's code lands on the heap too)
  gc(); gc(); const h0 = process.memoryUsage().heapUsed; frames(200000); const h1 = process.memoryUsage().heapUsed;
  check('200 000 frames of push + percentiles allocate nothing (heap growth < 64 KB without a GC)', h1 - h0 < 65536, ((h1 - h0) / 1024).toFixed(1) + ' KB'); }
{ // the overlay: text at most 4 Hz, lines only rewritten when changed (DOM stub)
  let writes = 0; class T { constructor() { this._d = ''; } get data() { return this._d; } set data(v) { this._d = v; writes++; } }
  const body = { kids: [], append(...k) { this.kids.push(...k); } };
  globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, append(...k) { this.kids = (this.kids || []).concat(k); }, hidden: false }), createTextNode: () => new T(), body };
  globalThis.innerWidth = 1920; globalThis.innerHeight = 1080; globalThis.devicePixelRatio = 1;
  const renderer = { info: { render: { calls: 300, triangles: 1.8e6 }, programs: [1, 2] }, getPixelRatio: () => 1, getContext: () => ({ getExtension: () => null, getParameter: () => 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3)', RENDERER: 0 }) };
  const o = createPerfOverlay({ renderer, preferences: { graphics: 'High' }, net: () => ({ rtt: 1, jitter: 2, snapshotAgeMs: 20, interpMs: 100, corrections: 0, correctionMaxU: 0, queue: 0, hostTickMs: 3, lastSnapshotBytes: 2048 }) });
  for (let i = 0; i < 60; i++) o.frame(i * 16.7, 16.7, 4); check('off by default: no element, no text', !o.on && body.kids.length === 0 && writes === 0);
  o.set(true); const w0 = writes; for (let i = 0; i < 600; i++) o.frame(1000 + i * 16.7, 16.7, 4); const texts = writes - w0;
  check('on: text rebuilt at most 4× a second (10 s of frames → ≤ 41 rebuilds of 7 lines)', texts > 0 && texts <= 41 * 7, texts + ' line writes');
  const el = body.kids[0], lines = el.kids.filter(k => k instanceof T).map(t => t.data);
  check('shows FPS, p50/p95/p99, draws, resolution, GPU string, RTT', /60 FPS/.test(lines[0]) && /p95 16\.7/.test(lines[0]) && /300 draws/.test(lines[2]) && /1920×1080/.test(lines[2]) && /ANGLE/.test(lines[3]) && /hardware/.test(lines[3]) && /RTT 1\.0/.test(lines[4]), JSON.stringify(lines.slice(0, 5)));
  const w1 = writes; for (let i = 0; i < 600; i++) o.frame(20000 + i * 16.7, 16.7, 4); check('steady frames: unchanged lines are not rewritten (≤ 2 changing lines per rebuild)', writes - w1 <= 41 * 2, (writes - w1) + ' writes');
  o.frame(40000, 80, 4); o.set(false); o.set(true); check('a long frame is counted for the match', o.rings.frames.over(50) === 1); }
// line 1's "limit": what holds the frame rate back (package W) — nothing at 60 fps; CPU when the main thread fills the slot;
// GPU when the GPU's time (reported) fills its share, or the main thread has time to spare
{ check('limitOf: 60 fps → no tag; 30 fps with 22 ms main thread → CPU; 30 fps with 6 ms main thread → GPU; GPU timer 20 ms → GPU', limitOf(16.7, 9) === '' && limitOf(33.3, 22) === 'CPU' && limitOf(33.3, 6) === 'GPU' && limitOf(33.3, 15, 20) === 'GPU' && limitOf(25, 14.5, 9) === 'CPU', [limitOf(16.7, 9), limitOf(33.3, 22), limitOf(33.3, 6), limitOf(33.3, 15, 20), limitOf(25, 14.5, 9)].join('|'));
  check('limitOf: 144 Hz under the 60 cap (mean 16.7 from 13.9/20.8 gaps) is no limit', limitOf(16.7, 5) === ''); }
console.log(ok + '/' + n); process.exit(ok === n ? 0 : 1);
