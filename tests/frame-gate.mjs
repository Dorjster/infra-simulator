// Global Defensive frame limiter (dist/frame-gate.js, GDUI-01): a 60 fps cap gives 60 fps on every display refresh — the
// old "1000/cap − 2 ms since the last drawn frame" test gave 48 on 144 Hz, 37.5 on 75 Hz, 50 on 100 Hz, 55 on 165 Hz —
// a display at most 1.25× the cap is not limited (75 Hz draws 75), stalls never cause a burst of catch-up frames, and the
// dynamic resolution's late / slow thresholds don't read the schedule's 2-3-2-3 refresh gaps on 144 Hz as overload.
import { createFrameGate, frameThresholds, createScaler, stepFor, gdPresetFromBench } from '../dist/frame-gate.js';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
// rAF ticks on a display of `hz` (timestamps with ±0.05 ms noise), `secs` long; returns drawn frame times
function run(hz, cap, secs = 10, gate = createFrameGate(), jitter = .05, stallAt = -1, auto = true) {
  const v = 1000 / hz, drawn = []; let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (let i = 0, t = 0; t < secs * 1000; i++, t = i * v) { if (stallAt >= 0 && t > stallAt && t < stallAt + 250) continue;   // (a 250 ms stall: no ticks)
    const now = t + (rnd() - .5) * 2 * jitter; if (gate.due(now, cap, auto)) drawn.push(now); }
  return drawn;
}
// A game whose drawn frames cost `cost(t)` ms of main-thread time: like Chrome, no rAF tick is delivered while the last
// frame is still busy (the next one comes on the first refresh after it). Returns the drawn frames' gaps.
function busy(hz, cap, cost, secs, gate = createFrameGate(), auto = true, from = 0) {
  const v = 1000 / hz, gaps = []; let until = 0, last = -1, seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (let i = 0, t = 0; t < secs * 1000; i++, t = i * v) { const now = from + t + (rnd() - .5) * .1; if (now < until) continue;
    if (gate.due(now, cap, auto)) { if (last >= 0) gaps.push(now - last); last = now; until = now + cost(t); } else until = now + .1; }
  return gaps;
}
const stats = (g, th) => { const s = [...g].sort((a, b) => a - b), mean = g.reduce((a, b) => a + b, 0) / g.length; return { med: s[s.length >> 1], mean, late: th ? g.filter(x => x > th.late).length : 0, fps: 1000 / mean }; };
// what app.js scaleResolution (GD) calls overload, on a 40-frame window: the median slow, ≥ 4 late, or the mean slow
const overloaded = (g, th) => { const w = g.slice(-40), s = stats(w, th); return s.med > th.slow || s.late >= 4 || s.mean > th.mean; };
const oldGate = (hz, cap, secs = 10) => { const v = 1000 / hz; let last = 0, k = 0; for (let t = 0; t < secs * 1000; t += v) { if (cap && t - last < 1000 / cap - 2) continue; last = t; k++; } return k / secs; };
for (const hz of [60, 75, 100, 120, 144, 165, 240]) {
  const d = run(hz, 60), fps = d.length / 10, expect = hz <= 75 ? hz : 60;
  check(`${hz} Hz, cap 60 → ${expect} fps`, Math.abs(fps - expect) <= 1.2, fps.toFixed(1) + ' fps (old limiter ' + oldGate(hz, 60).toFixed(1) + ')');
  let worst = 0; for (let i = 1; i < d.length; i++) worst = Math.max(worst, d[i] - d[i - 1]);
  check(`${hz} Hz, cap 60: no gap over one refresh beyond the slot`, worst <= Math.max(1000 / 60, 1000 / hz) + 1000 / hz + .2, worst.toFixed(2) + ' ms');
}
check('the old limiter really gave 48 fps on 144 Hz (what this replaces)', Math.abs(oldGate(144, 60) - 48) < .6, oldGate(144, 60).toFixed(1));
for (const [hz, cap, expect] of [[144, 120, 144], [165, 120, 120], [240, 144, 144], [60, 30, 30], [144, 30, 30], [144, 20, 20], [60, 0, 60], [165, 0, 165]]) {
  const fps = run(hz, cap).length / 10; check(`${hz} Hz, cap ${cap || 'none'} → ${expect} fps`, Math.abs(fps - expect) <= 1.5, fps.toFixed(1));
}
{ const g = createFrameGate(); const d = run(144, 60, 3, g, .05, 1000); let burst = 0; for (let i = 1; i < d.length; i++) if (d[i] - d[i - 1] < 1000 / 144 * 1.5) burst++;
  check('after a 250 ms stall: no burst of back-to-back catch-up frames', burst <= 1, burst + ' back-to-back frames'); }
{ const g = createFrameGate(); run(144, 60, 1, g); check('refresh measured from the ticks (144 Hz → 6.94 ms)', Math.abs(g.vsync - 1000 / 144) < .15, g.vsync.toFixed(3));
  check('interval aimed at: the cap (16.7 ms), or the refresh when slower', Math.abs(g.interval(60) - 16.667) < .01 && Math.abs(g.interval(0) - g.vsync) < 1e-9 && Math.abs(g.interval(240) - g.vsync) < 1e-9); }
// the dynamic resolution's tests on what the schedule draws: gaps on 144 Hz under the 60 cap are never late or slow;
// on 60 Hz a missed refresh (33.3 ms) is late, a 16.7 ms median is not slow, a 33.3 one is
{ const g = createFrameGate(), d = run(144, 60, 10, g), gaps = []; for (let i = 1; i < d.length; i++) gaps.push(d[i] - d[i - 1]);
  const th = frameThresholds(g.interval(60), g.vsync), late = gaps.filter(x => x > th.late).length, med = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
  check('144 Hz cap 60: no frame counted late, median not slow (no resolution step-down)', late === 0 && med <= th.slow, `late ${late}, median ${med.toFixed(2)} vs ${th.slow.toFixed(2)} (old fixed 18.5 ms: ${med > 18.5 ? 'SLOW' : 'ok'})`); }
{ const th = frameThresholds(1000 / 60, 1000 / 60); check('60 Hz cap 60: 33.3 ms late, 16.7 ok; median 16.7 fast, 33.3 slow', 33.3 > th.late && 16.7 < th.late && 16.7 < th.slow && 33.3 > th.slow, JSON.stringify(th)); }
{ const g = createFrameGate(); run(75, 60, 2, g); const th = frameThresholds(g.interval(60, true), g.vsync); check('75 Hz (unlimited under Auto 60): a missed refresh (26.7 ms) is late, 13.3 is not', 26.7 > th.late && 13.4 < th.late && 13.4 < th.slow, JSON.stringify(th)); }
// a cap the player chose is kept: 75 Hz and 144 Hz under "60 FPS" / "120 FPS" draw 60 / 120 (only "Auto · 60" lets 75 Hz draw 75)
for (const [hz, cap, expect] of [[75, 60, 60], [144, 120, 120], [144, 60, 60]]) { const fps = run(hz, cap, 10, createFrameGate(), .05, -1, false).length / 10; check(`${hz} Hz, chosen cap ${cap} → ${expect} fps`, Math.abs(fps - expect) <= 1.2, fps.toFixed(1)); }
// Overload (review I2-perf): a game that can't keep up only gets every 2nd / 3rd tick — the refresh estimate must not become
// the slow frame interval (the old estimator read 33.3 ms at 30 fps on 60 Hz and 20.8 at 48 fps on 144 Hz, and the
// thresholds built on it saw no overload: no resolution step down where a low-end laptop needs one).
let gaps0 = 0;
for (const [hz, cap, ms, auto, name] of [[60, 60, 40, true, '60 Hz, 40 ms frames (25 fps)'], [60, 60, 20, true, '60 Hz, 20 ms frames (30 fps)'], [144, 60, 18.75, true, '144 Hz Auto 60, 18–19.5 ms frames (48 fps)'], [144, 60, 18.75, false, '144 Hz chosen 60, 18–19.5 ms frames (48 fps)'], [120, 60, 22, true, '120 Hz, 22 ms frames (40 fps)'], [165, 60, 21, true, '165 Hz, 21 ms frames (41 fps)']]) {
  const g = createFrameGate(); busy(hz, cap, () => 1, 1, g, auto); const gaps = busy(hz, cap, () => ms + (ms === 18.75 ? Math.sin(gaps0++) * .75 : 0), 6, g, auto, 1000), th = frameThresholds(g.interval(cap, auto), g.vsync, undefined, cap), s = stats(gaps.slice(-40), th);
  check(name + ': refresh estimate stays the display\'s, overload seen', Math.abs(g.vsync - 1000 / hz) < .3 && overloaded(gaps, th), `vsync ${g.vsync.toFixed(2)}, ${s.fps.toFixed(1)} fps, median ${s.med.toFixed(1)} vs slow ${th.slow.toFixed(1)}, mean ${s.mean.toFixed(1)} vs ${th.mean.toFixed(1)}, late ${s.late}`);
}
// …and a game that keeps up is not overloaded (no step down): 144 Hz under 60 with 5 and 12 ms frames, 60 Hz with 12 ms
for (const [hz, cap, ms, auto] of [[144, 60, 5, true], [144, 60, 12, true], [144, 60, 12, false], [60, 60, 12, true], [165, 60, 9, false]]) {
  const g = createFrameGate(); busy(hz, cap, () => 1, 1, g, auto); const gaps = busy(hz, cap, () => ms, 6, g, auto, 1000), th = frameThresholds(g.interval(cap, auto), g.vsync, undefined, cap), s = stats(gaps, th);
  check(`${hz} Hz cap ${cap}${auto ? ' (Auto)' : ''}, ${ms} ms frames: ${cap} fps, not overloaded`, Math.abs(s.fps - cap) <= 1.5 && !overloaded(gaps, th), `${s.fps.toFixed(1)} fps, vsync ${g.vsync.toFixed(2)}, median ${s.med.toFixed(1)}, mean ${s.mean.toFixed(1)} vs ${th.mean.toFixed(1)}`);
}
// real Chrome on this Mac's 60 Hz screen: rAF gaps 15.8–17.6 ms, so the estimate (their minimum) reads ~15 ms — a full
// 60 fps (mean 16.7) must still not be "overloaded", nor 75 Hz under Auto drawing 60+ (the cap is met)
{ const g = createFrameGate(), gaps = busy(60, 60, () => 5, 4, g, true, 0); let k = 0; for (let i = 0; i < 40; i++) g.due(10000 + i * 16.67 + (i % 2 ? 1.6 : -1.6), 60, true); const th = frameThresholds(g.interval(60, true), g.vsync, undefined, 60), even = Array(40).fill(1000 / 60); k = overloaded(even, th);
  check('jittery 60 Hz clock (estimate below 16.7): a full 60 fps is not overload', !k && g.vsync < 16, `vsync ${g.vsync.toFixed(2)}, mean threshold ${th.mean.toFixed(2)}, slow ${th.slow.toFixed(2)}, late ${th.late.toFixed(2)}`); }
{ const th = frameThresholds(1000 / 75, 1000 / 75, undefined, 60), s = Array(40).fill(1000 / 62); check('75 Hz under Auto 60 drawing 62 fps: the cap is met, not overload', !overloaded(s, th), JSON.stringify(th)); }
// a move to another display is still followed (144 → 60 Hz: ×2.4, not a whole multiple), and 60 → 144 at once
{ const g = createFrameGate(); busy(144, 60, () => 1, 1, g, true, 0); busy(60, 60, () => 1, 1, g, true, 1000); const a = g.vsync; busy(144, 60, () => 1, 1, g, true, 2000); check('display change followed: 144 → 60 Hz → 144 Hz', Math.abs(a - 16.67) < .2 && Math.abs(g.vsync - 6.94) < .15, a.toFixed(2) + ' then ' + g.vsync.toFixed(2)); }
// ── The dynamic resolution's decisions over whole Defuse matches (frame-gate.js createScaler, as app.js calls it) — package W,
// weak Windows laptops. A frame takes max(main-thread ms, GPU ms) (they overlap), rounded up to the 60 Hz refresh; the GPU's
// cost goes with the pixels (ratio²); freeze time 10 s (quiet: 80 % of the fight's GPU load, no smokes), fights 40 s (hold).
// Checks every 0.5 s on the last 40 frames, as app.js. `w: false` = the scaler before package W (the reference).
// `real`: the game's own round (arena-defuse.js DEFUSE: freeze 15 s, round over 6 s, both quiet) with the main thread per
// phase — freeze `cpuFreeze` (no gunfire, smokes or moving bots: lighter), round over halfway between it and the fight.
// `jitter`: the machine's load swings from one 0.5 s check to the next (other programs, a laptop's boost clock): the main
// thread's cost that check × 1 ± jitter (`sd` picks the run).
function match({ cpu, gpu1, timer = false, rounds = 8, w = true, ceiling = 1, floor = .5, real = false, cpuFreeze = cpu, jitter = 0, sd = 5 }) {
  const sc = createScaler({ w }), steps = [1, .85, .72, .6, .5].map(k => Math.max(floor, Math.round(ceiling * k * 20) / 20)), V = 1000 / 60, th = frameThresholds(V, V, undefined, 60);
  let r = ceiling, t = 7000, seed = sd; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, ev = [], tail = [], fr = new Array(40);
  const phases = real ? [['freeze', 15], ['live', 40], ['over', 6]] : [['freeze', 10], ['live', 40]];
  for (let k = 0; k < rounds; k++) for (const [phase, secs] of phases) for (let s = 0; s < secs * 2; s++, t += 500) {
    const load = phase === 'live' ? 1 : .8, cp = (phase === 'live' ? cpu : phase === 'over' ? (cpu + cpuFreeze) / 2 : cpuFreeze) * (jitter ? 1 + (rnd() - .5) * 2 * jitter : 1); for (let f = 0; f < 40; f++) { const g = gpu1 * load * r * r * (1 + (rnd() - .5) * .1), c = cp * (1 + (rnd() - .5) * .1); fr[f] = V * Math.max(1, Math.ceil(Math.max(c, g) / V - .02)); }
    const so = [...fr].sort((a, b) => a - b), median = so[20], mean = fr.reduce((a, b) => a + b) / 40, late = fr.filter(x => x > th.late).length;
    const next = sc.decide({ now: t, gd: true, median, mean, late, th, interval: V, gpu: timer ? gpu1 * load * r * r : null, budget: 14, cap: 60, current: r, ceiling, steps, hold: phase === 'live', cpu: cp });
    if (Math.abs(next - r) > .01) { ev.push({ round: k, phase, from: r, to: next }); r = next; sc.applied(t); }
    if (phase === 'live' && k >= rounds - 3) tail.push(...fr);
  }
  return { ev, r, changes: ev.length, midFight: ev.filter(e => e.phase === 'live').length, late: ev.filter(e => e.round >= 3).length, fps: 1000 / (tail.reduce((a, b) => a + b) / tail.length), show: ev.map(e => e.round + e.phase[0] + ':' + e.from + '→' + e.to).join(' ') };
}
{ // a CPU-bound laptop (i5 main thread ≈ 22 ms a frame, the GPU fine): a smaller picture can't help — never a step mid-fight;
  // one try at a quiet moment, undone back to full resolution when it didn't help, then nothing (no cycle)
  const a = match({ cpu: 22, gpu1: 6 }), b = match({ cpu: 22, gpu1: 6, w: false });
  check('CPU-bound (22 ms main thread, no GPU timer): no change mid-fight, one try undone at quiet moments, back at full resolution, none after round 2', a.midFight === 0 && a.changes <= 2 && a.r === 1 && !a.ev.some(e => e.round > 2), `now ${a.changes}: ${a.show}; before ${b.changes} (${b.midFight} mid-fight): ${b.show}`); }
// …and the same laptop in the game's real round (freeze 15 s + round over 6 s) where freeze time is lighter on the processor
// (12 ms): the "did it help" verdict taken in freeze time read every step as helping and walked the resolution down to .5
// in 2–3 rounds with no fps gained (review W-windows; v51 never stepped here) — judged fight against fight, it's one try, undone
for (const cl of [18, 20, 22]) {
  const a = match({ cpu: cl, cpuFreeze: 12, gpu1: 6, real: true, rounds: 10 });
  check(`CPU-bound in real rounds (fight ${cl} ms, freeze 12 ms, no GPU timer): back at full resolution, ≤ 2 changes, none mid-fight, none after round 2`, a.r === 1 && a.changes <= 2 && a.midFight === 0 && !a.ev.some(e => e.round > 2), a.show || 'no change'); }
{ // the GPU-bound laptops in the same real rounds still settle (the step a fight asked for helps the next fight: kept)
  const a = match({ cpu: 8, cpuFreeze: 6, gpu1: 26, real: true, rounds: 10 }), f = match({ cpu: 10, cpuFreeze: 7, gpu1: 20, real: true, rounds: 10 });
  check('weak GPU in real rounds (26 ms fight GPU, frame times only): settles below full resolution, 60 fps, nothing after round 3', a.r < 1 && a.fps > 58 && a.late === 0, a.show + ` (${a.fps.toFixed(1)} fps)`);
  check('fight-only GPU overload in real rounds (20 ms in fights, 16 at freeze): the fight\'s step is kept, 60 fps, nothing after round 3', f.r < 1 && f.fps > 58 && f.late === 0, f.show + ` (${f.fps.toFixed(1)} fps)`); }
for (const timer of [false, true]) { // a weak GPU (Iris Xe ≈ 0.5× the M3: 26 ms at the ceiling in a fight, 8 ms of main thread): settles fast, then holds
  const a = match({ cpu: 8, gpu1: 26, timer }), b = match({ cpu: 8, gpu1: 26, timer, w: false });
  check(`weak GPU (${timer ? 'GPU timer: one change' : 'frame times only: ≤ 3 changes (one probe up, taken back once)'}), 60 fps after, no change after round 3`, a.changes <= (timer ? 1 : 3) && a.fps > 58 && a.late === 0 && a.changes < b.changes, `now ${a.show} (${a.fps.toFixed(1)} fps); before ${b.changes} changes: ${b.show} (${b.fps.toFixed(1)} fps)`); }
{ // a GPU just over budget in fights only (18 ms with smokes, 14.4 at freeze): no up-at-freeze / down-in-fight cycle
  const a = match({ cpu: 7, gpu1: 18, rounds: 12 }), b = match({ cpu: 7, gpu1: 18, rounds: 12, w: false });
  check('fight-only overload (frame times only): at most 4 changes in 12 rounds, none in the last 6, 60 fps', a.changes <= 4 && !a.ev.some(e => e.round >= 6) && a.fps > 58, `now ${a.changes}: ${a.show} (${a.fps.toFixed(1)} fps); before ${b.changes}: ${b.show}`);
  check('…where the scaler before package W kept cycling (the reference really oscillates)', b.ev.filter(e => e.round >= 6).length >= 2, b.show); }
{ // a weak GPU whose main thread LOOKS busy (15 ms: Chrome's GL calls wait on a GPU that is behind): the CPU-bound hint only
  // moves the step to the quiet moment — it is still taken, it helps, it stays (60 fps after). Its slow freeze frames alone
  // (CPU-bound-looking) ask for nothing: the first fight asks, so it settles a round later than a plain weak GPU (round index ≤ 3)
  const a = match({ cpu: 15, gpu1: 26 }); check('GPU-bound with a busy-looking main thread: no step mid-fight, settled at a quiet moment after the first fight, 60 fps, no change after the 4th round', a.midFight === 0 && a.changes >= 1 && a.changes <= 3 && a.fps > 58 && !a.ev.some(e => e.round > 3), a.show + ` (${a.fps.toFixed(1)} fps)`); }
{ // a CPU-bound laptop whose processor is the limit in EVERY phase (freeze as heavy as the fight: CPU ×4, render ≈ 10 of the
  // 14 ms anywhere) while the machine's load swings from check to check: quiet frames slow while CPU-bound take no step of
  // their own (as v51) — a step judged on such frames read "helped" by chance and stayed for the match in 20–32 % of runs
  // (review W-windows, scratchpad review-W-windows/scaler-noise.mjs); only a fight asks, judged fight against fight
  let below = 0, mid = 0, runs = 0, worst = ''; const cfgs = [{ cpu: 17 }, { cpu: 18, cpuFreeze: 15 }, { cpu: 16.5, jitter: .35 }, { cpu: 20, cpuFreeze: 14, jitter: .3 }];
  for (const c of cfgs) for (let s = 1; s <= 40; s++, runs++) { const a = match({ gpu1: 4, real: true, rounds: 10, jitter: .25, ...c, sd: s * 7919 }); if (a.r < 1) { below++; worst = worst || JSON.stringify(c) + ' ' + a.show; } mid += a.midFight; }
  check(`CPU-bound in every phase with load swings (${runs} matches): at most 1 ends below full resolution, none mid-fight`, below <= 1 && mid === 0, `${below} below, ${mid} mid-fight changes${worst ? '; e.g. ' + worst : ''}`); }
{ // light load: nothing changes (no regression on a strong laptop)
  const a = match({ cpu: 6, gpu1: 9 }); check('strong laptop (6 ms CPU, 9 ms GPU): no change', a.changes === 0, a.show); }
{ // stepFor: the pixels go with the ratio² — 2× over budget wants the ratio / √2.2 (≤ .674: .6), 1.2× wants ≤ .87 (.85); capped at max steps
  const st = [1, .85, .72, .6, .5]; check('stepFor: load 2 → .6 (3 steps; .72 with at most 2), load 1.2 → .85, the last step stays', st[stepFor(st, 0, 2, 3)] === .6 && st[stepFor(st, 0, 2, 2)] === .72 && st[stepFor(st, 0, 1.2, 3)] === .85 && stepFor(st, 4, 9, 3) === 4); }
{ // the first-run preset (package W, wave 2): the readPixels waits the M3 MacBook read at freeze time (no timer queries on
  // Apple's Metal; 9.8–13.4 ms at 1×, 2× and 4× the pixels alike: the display's refresh, not GPU work — perf/W2 A4-auto-g*)
  // stay Medium (v51's 12 ms and the unreviewed 7 ms made a MacBook "Low"); a GPU that can't finish a quiet frame in a
  // refresh and a third is Low; with timer queries the GPU's own time decides at 10 ms
  const m3 = [9.8, 11, 12.2, 12.8, 13.4], picks = m3.map(ms => gdPresetFromBench(ms, false));
  check('first-run preset: the M3\'s readPixels waits (9.8–13.4 ms, no timer) → Medium every time', picks.every(p => p === 'Medium'), picks.join(' '));
  check('first-run preset: a wait past a refresh and a third (30 ms) → Low; GPU timer 6 ms → Medium', gdPresetFromBench(30, false) === 'Low' && gdPresetFromBench(6, true) === 'Medium');
  // with timer queries (Chrome's Direct3D 11 path, the Windows laptops): the package's own emulation at freeze time (≈ 80 %
  // of the fight) — Iris Xe 15.4–17.3 ms in the fight → 12–14 at freeze must stay Medium (docs §9: Balanced; the 10 ms rule
  // set it to Performance); Intel UHD ≈ half of Iris Xe → 24–28 at freeze → Low
  const iris = [12, 13, 14].map(ms => gdPresetFromBench(ms, true)), uhd = [24, 26, 28].map(ms => gdPresetFromBench(ms, true));
  check('first-run preset, GPU timer: emulated Iris Xe at freeze (12–14 ms) → Medium, emulated Intel UHD (24–28 ms) → Low', iris.every(p => p === 'Medium') && uhd.every(p => p === 'Low'), 'Iris ' + iris.join(' ') + ' · UHD ' + uhd.join(' ')); }
console.log(ok + '/' + n); process.exit(ok === n ? 0 : 1);
