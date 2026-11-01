// Smooth physics at any frame rate (package P, dist/phys-smooth.js and its users): a dropped gun's toss replayed from the
// host's 1/32 s steps is drawn on a new spot every frame and on the same path at 30 / 60 / 144 / 240 fps; a grenade
// followed from the host's 20 Hz words (jittered ticks, Wi-Fi delays) flies at a steady speed with no stall-and-race at
// each word, no zig-zag, and the bounce corrections eased out; the frame's host clock is steady when hostNow() is read
// late by a varying amount; the physics props (arena-physprops.js) fly the same at every frame rate and are drawn moving
// every frame; the death fall starts slowly, lands in ~0.5 s and stays down.
import assert from 'node:assert/strict';
import * as THREE from '../dist/three.module.js';
import { replay, fixedSteps, easeOff, frameClock, flightFrame, deathFall, DEATH_FALL_S, hermiteStep } from '../dist/phys-smooth.js';
import { stepNade, TOSS_DT, TOSS_GRAVITY, R as NADE_R } from '../dist/arena-nades.js';
import { createPhysProps } from '../dist/arena-physprops.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + d : '')); };
const RATES = [30, 60, 144, 240];
// Seeded randomness (jitter) so a failure repeats.
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// Per-frame motion figures of a drawn path [[t, x, y, z]]: holds (no motion between two moving frames), zig-zags
// (forward-back-forward), and the frame-to-frame relative speed change (bounces — a direction change over 25° or a step
// down that holds — left out).
function motion(path, minSpeed = 3) { let holds = 0, zig = 0; const rel = [], d = [], s = [];
  for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i]; d.push([b[1] - a[1], b[2] - a[2], b[3] - a[3]]); s.push(Math.hypot(...d.at(-1)) / (b[0] - a[0])); }
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], m = u => Math.hypot(...u);
  let first = s.findIndex(v => v > 1e-3), last = s.length - 1; while (last > 0 && !(s[last] > 1e-3)) last--;
  for (let i = first; i <= last; i++) { if (!(s[i] > 1e-6)) { holds++; continue; } if (i === first || i === last) continue;
    if (m(d[i - 1]) > 1e-3 && m(d[i + 1]) > 1e-3 && dot(d[i - 1], d[i]) < 0 && dot(d[i], d[i + 1]) < 0) zig++;
    const turn = dot(d[i - 1], d[i]) / (m(d[i - 1]) * m(d[i]) || 1); if (turn < Math.cos(25 * Math.PI / 180)) continue;
    // a speed spike: up then down (or down then up) frame to frame — the smaller of the two changes, of the speed; a
    // smooth arc's speed changes one way between bounces (0), a bounce is a step (one change ~0), a stall-and-race spikes
    // (an impact next — a drop of over 30 % that the frame after keeps: the bounce itself, after a fall's speeding up)
    if (Math.max(s[i - 1], s[i], s[i + 1]) < minSpeed) continue; const d1 = s[i] - s[i - 1], d2 = s[i + 1] - s[i]; if (d2 < -.3 * s[i] && i + 2 < s.length && Math.abs(s[i + 2] - s[i + 1]) < .25 * Math.max(s[i + 1], 1e-6)) continue; rel.push(d1 * d2 < 0 ? Math.min(Math.abs(d1), Math.abs(d2)) / Math.max(s[i - 1], s[i], s[i + 1]) : 0); }
  rel.sort((a, b) => a - b); return { holds, zig, p95: rel.length ? rel[Math.floor(rel.length * .95)] : 0, med: rel.length ? rel[Math.floor(rel.length / 2)] : 0, frames: last - first + 1 }; }

// 1. A dropped gun's toss (the host's flight: arena-nades tossFlight's 1/32 s steps), replayed and drawn.
const toss = { x: 0, y: 6, z: 0, vx: 30, vy: 12, vz: 4 }, wall = [{ minX: 40, maxX: 42, minZ: -50, maxZ: 50, y0: 0, y1: 30 }];
const host = { ...toss, still: 0, grav: TOSS_GRAVITY }; let hostMs = 0; for (; hostMs < 3000 && !host.rest; hostMs += TOSS_DT * 1000) stepNade(host, wall, null, TOSS_DT);
function drawToss(fps, start = 0) { const F = { g: { ...toss, still: 0, grav: TOSS_GRAVITY, view: true }, t: 0, p: new Float64Array(6), started: false, run: start }, out = { x: 0, y: 0, z: 0 }, path = [], end = hostMs / 1000;
  const stepF = (G, h) => stepNade(G, wall, null, h);
  for (let f = 0; f <= fps * 3.2; f++) { if (f) F.run += 1 / fps; replay(F, TOSS_DT, F.run, stepF, out, end, TOSS_GRAVITY); path.push([F.run, out.x, out.y, out.z]); } return { path, F }; }
const tosses = Object.fromEntries(RATES.map(r => [r, drawToss(r)]));
for (const r of RATES) { const M = motion(tosses[r].path, 10);   // (speed checked from 10 units/s up: below it a gun hops along the floor, every 1/32 s step a tiny bounce of its own)
  ok(`toss at ${r} fps: drawn on a new spot every frame while it flies (no 1/32 s steps held)`, M.holds === 0, `${M.holds} holds in ${M.frames} frames`);
  ok(`toss at ${r} fps: no zig-zags, a steady speed between bounces`, M.zig === 0 && M.p95 < .12, JSON.stringify(M)); }
{ // the same path at every rate: positions at times all four draw (every 1/6 s)
  let worst = 0; for (let t = 1 / 6; t < 3; t += 1 / 6) { const at = r => tosses[r].path.reduce((b, p) => Math.abs(p[0] - t) < Math.abs(b[0] - t) ? p : b); const a = at(30); for (const r of RATES) { const p = at(r); worst = Math.max(worst, Math.hypot(p[1] - a[1], p[2] - a[2], p[3] - a[3])); } }
  ok('toss: the same path at 30 / 60 / 144 / 240 fps (≤ 1 mm apart at shared moments)', worst < .007, worst.toExponential(2)); }
{ const F = tosses[60].F; ok('toss: lands exactly where the host\'s flight ends', Math.hypot(F.g.x - host.x, F.g.y - host.y, F.g.z - host.z) < 1e-9 && tosses[60].path.at(-1)[1] === host.x, `${F.g.x} vs ${host.x}`); }
{ // the old drawing (each step as it comes) held the gun 1 frame in 2 at 60 Hz — the measure catches it
  const g = { ...toss, still: 0, grav: TOSS_GRAVITY, view: true }, path = []; let t = 0, run = 0; for (let f = 0; f <= 60 * 2; f++) { run = f / 60; while (t < run && !g.rest) { stepNade(g, wall, null, TOSS_DT); t += TOSS_DT; } path.push([run, g.x, g.y, g.z]); }
  ok('(the v51 way, steps drawn as they come, held it: the measure sees it)', motion(path).holds > 20, motion(path).holds); }
{ // started from the host's moment of the toss (seen 100 ms late): already 100 ms along, on the same path
  const late = drawToss(60, .1), on = tosses[60].path[16], mine = late.path[10]; ok('toss seen late: drawn where the host\'s flight is by then', Math.hypot(on[1] - mine[1], on[2] - mine[2], on[3] - mine[3]) < 1e-6); }
// Hermite: a free step is the exact parabola; a step with a bounce follows the arc in, then the arc out (not the straight
// average across, which cut the corner by 0.11 units here), exact at both ends, never under the floor.
{ const p = new Float64Array([0, 10, 0, 20, 5, 0]), h = .1, G0 = { x: 2, y: 10 + 5 * h - .5 * 50 * h * h, z: 0, vx: 20, vy: 5 - 50 * h, vz: 0 }, o = { x: 0, y: 0, z: 0 };
  hermiteStep(o, p, G0, h, .5, 50); ok('between free steps: the exact parabola', Math.abs(o.y - (10 + 5 * .05 - .5 * 50 * .05 * .05)) < 1e-9 && Math.abs(o.x - 1) < 1e-9, o.y);
  // a ball from y 1 falling at 10 /s (gravity 50, floor at 0) meets the floor at tc and leaves with 45 % of its speed
  const tc = (-10 + Math.sqrt(200)) / 50, up = (10 + 50 * tc) * .45, s1 = h - tc, q = new Float64Array([0, 1, 0, 20, -10, 0]), B = { x: 20 * tc + 9 * s1, y: up * s1 - 25 * s1 * s1, z: 0, vx: 9, vy: up - 50 * s1, vz: 0 };
  const truth = t => t <= tc ? [20 * t, 1 - 10 * t - 25 * t * t] : [20 * tc + 9 * (t - tc), up * (t - tc) - 25 * (t - tc) ** 2]; let worst = 0, under = 0;
  for (let i = 0; i <= 20; i++) { hermiteStep(o, q, B, h, i / 20, 50); const tr = truth(h * i / 20); worst = Math.max(worst, Math.hypot(o.x - tr[0], o.y - tr[1])); under = Math.min(under, o.y); }
  hermiteStep(o, q, B, h, 0, 50); const s0 = Math.hypot(o.x, o.y - 1); hermiteStep(o, q, B, h, 1, 50); const e1 = Math.hypot(o.x - B.x, o.y - B.y);
  ok('a step with a bounce: the arc in, then the arc out (≤ 0.02 units off the true path), exact at both ends, never under the floor', worst < .02 && s0 < 1e-9 && e1 < 1e-9 && under > -.005, `worst ${worst.toFixed(4)} · ends ${s0.toExponential(1)} ${e1.toExponential(1)} · lowest ${under.toFixed(4)}`); }

// 2. A grenade followed from the host's words (flightFrame): host ticks 40–60 ms (lan/room.mjs measures them), each word
// arriving 15–40 ms later (Wi-Fi) plus 0–8 ms of this page's own frame; caught up on the host's clock.
function follow(fps, { boxes = [], wifi = true, v0 = { x: 0, y: 8, z: 0, vx: 90, vy: 25, vz: 10 } } = {}) {
  const H = { ...v0, still: 0 }, words = []; let ht = 0; while (ht < 2.2) { const dt = .04 + rnd() * .02; ht += dt; stepNade(H, boxes, null, dt); words.push({ at: ht + (wifi ? .015 + rnd() * .025 : .002), clock: ht, g: { x: H.x, y: H.y, z: H.z, vx: H.vx, vy: H.vy, vz: H.vz, still: H.still, rest: !!H.rest, bt: H.bt } }); if (H.rest) break; }
  const v = { sim: null, ox: 0, oy: 0, oz: 0, fresh: false }, step = (S, d) => stepNade(S, boxes, null, d), path = [], fc = { t: undefined }; let wi = -1;
  for (let f = 1; f <= fps * 2; f++) { const t = f / fps; let k = wi; while (k + 1 < words.length && words[k + 1].at <= t) k++; const isNew = k !== wi; wi = k;
    const hn = frameClock(fc, 1 / fps, (t + rnd() * .008) * 1000) / 1000;
    if (wi < 0) continue; const w = words[wi]; flightFrame(v, w.g, isNew, isNew ? Math.max(0, hn - w.clock) : 0, 1 / fps, step, false, .05);
    path.push([t, v.sim.x + v.ox, v.sim.y + v.oy, v.sim.z + v.oz]); }
  return path; }
for (const r of RATES) { const M = motion(follow(r, { boxes: [] }).filter(p => p[0] < .55));   // (in the air: before it lands)
  ok(`grenade at ${r} fps over Wi-Fi: steady speed through every host word (Δspeed p95 < 0.05), no holds, no zig-zags`, M.holds === 0 && M.zig === 0 && M.p95 < .05, JSON.stringify(M)); }
{ // with bounces (a wall ahead, the floor): the host meets each bounce a tick apart from this copy — eased, never pulled back
  for (const r of [60, 144]) { const M = motion(follow(r, { boxes: [{ minX: 30, maxX: 32, minZ: -40, maxZ: 40, y0: 0, y1: 40 }] }));
    ok(`grenade off a wall and the floor at ${r} fps: no zig-zags, no holds while it moves`, M.zig === 0 && M.holds === 0, JSON.stringify(M)); } }
{ // the v51 reference (last frame's drawn spot) stalled and raced at every word: the same measure fails it
  const H = { x: 0, y: 8, z: 0, vx: 90, vy: 25, vz: 0, still: 0 }, S = { ...H, view: true }, path = []; let ht = 0, ox = 0, drawn = 0, next = .05;
  for (let f = 1; f <= 30; f++) { const t = f / 60; if (t >= next - 1e-9) { stepNade(H, [], null, .05); ht = next; next += .05; Object.assign(S, { x: H.x, y: H.y, z: H.z, vx: H.vx, vy: H.vy, vz: H.vz }); stepNade(S, [], null, Math.max(1e-6, t - ht)); ox = drawn - S.x; } else stepNade(S, [], null, 1 / 60); ox *= Math.exp(-40 / 60); drawn = S.x + ox; path.push([t, drawn, 0, 0]); }
  ok('(the v51 correction reference: the measure sees its stall-and-race)', motion(path).p95 > .3, JSON.stringify(motion(path))); }
{ // the end of a roll: the copy's floor bounces fall a substep apart from the host's — it must not stop dead frames before
  // the host's grenade does and then be slid on by the next word (v51 / before the slide: 4 frames stopped at 60 Hz)
  let worst = 0; for (const fps of [60, 144]) for (const vy of [-6, -10, 4]) { const path = follow(fps, { wifi: false, v0: { x: 0, y: NADE_R + .3, z: 0, vx: 12, vy, vz: 3 } });
    let run = 0, end = path.length - 1; const sp = path.map((p, i) => i ? Math.hypot(p[1] - path[i - 1][1], p[3] - path[i - 1][3]) * fps : 1); while (end > 0 && sp[end] < .05) end--;
    for (let i = 1; i <= end; i++) { if (sp[i] < .05) worst = Math.max(worst, ++run); else run = 0; } }
  ok('the end of a roll: never stopped for more than a frame before the host\'s grenade stops', worst <= 1, `${worst} frames`); }
{ // your own throw: the copy flown from your hand, then the host's grenade — the same path 30 ms further along — takes it
  // over (arena-nades-view adopt: v.slow): eased in gently, never a lurch faster than 1.4× the flight's own speed
  const v0 = { x: 0, y: 9, z: 0, vx: 100, vy: 20, vz: 0 }, step = (S, d) => stepNade(S, [], null, d), at = T => { const G0 = { ...v0, still: 0 }; step(G0, T); return G0; };   // (at: the host's flight T s after its start — no contact, so exact)
  const run = slow => { const S = { ...v0, still: 0, view: true }, v = { sim: null, ox: 0, oy: 0, oz: 0, fresh: false, slow: 0 }, path = [];
    for (let f = 1; f <= 40; f++) { const t = f / 60; if (f <= 4) step(S, 1 / 60); if (f < 4) { path.push([t, S.x]); continue; }   // (yours, flown here; at frame 4 the mine loop has flown it, then the host's arrives)
      if (f === 4) { v.sim = S; v.fresh = true; v.slow = slow; }
      flightFrame(v, at(t + .03), (f - 4) % 3 === 0, 0, 1 / 60, step, false, .05); path.push([t, S.x + v.ox]); }
    let mx = 0; for (let i = 1; i < path.length; i++) mx = Math.max(mx, (path[i][1] - path[i - 1][1]) * 60); return mx; };
  const gentle = run(.45), lurch = run(0); ok('your own throw taken over by the host\'s: eased in (x speed ≤ 1.4× its 100 units/s)', gentle <= 140, `${gentle.toFixed(0)} units/s (a 50 ms ease: ${lurch.toFixed(0)})`); }
// 3. The frame's host clock: hostNow() read 0–10 ms into each frame, the clock still steps by the frame's dt.
{ const c = { t: undefined }; let worst = 0, prev = null; for (let f = 0; f < 600; f++) { const t = f * 1000 / 144, v = frameClock(c, 1 / 144, 5e6 + t + rnd() * 10); if (prev !== null && f > 30) worst = Math.max(worst, Math.abs(v - prev - 1000 / 144)); prev = v; }
  ok('frame clock: steps by the frame\'s dt (±0.2 ms) though hostNow() is read 0–10 ms late at random', worst < .2, worst.toFixed(3));
  const v = frameClock(c, 1 / 144, 5e6 + 600 * 1000 / 144 + 2000); ok('…and follows a host clock step of 2 s at once', Math.abs(v - (5e6 + 600 * 1000 / 144 + 2000)) < 1); }
ok('a correction eases out the same at any frame rate', Math.abs(easeOff(1, .1, .05) - (() => { let o = 1; for (let i = 0; i < 24; i++) o = easeOff(o, .1 / 24, .05); return o; })()) < 1e-12);

// 4. Fixed steps: the same count at any frame rate; the draw fraction in 0…1.
for (const r of RATES) { const c = { acc: 0, a: 0 }; let steps = 0, bad = 0; for (let f = 0; f < r * 2; f++) { steps += fixedSteps(c, 1 / r, 1 / 128, 16); if (!(c.a >= 0 && c.a <= 1)) bad++; }
  ok(`fixed steps at ${r} fps: 256 steps in 2 s, draw fraction in 0…1`, Math.abs(steps - 256) <= 1 && !bad, `${steps} steps`); }
{ const c = { acc: 0, a: 0 }; ok('a stall (2 s) takes at most the cap, never a burst', fixedSteps(c, 2, 1 / 128, 16) === 16 && c.acc < 1 / 128); }

// 5. Physics props: the same flight at every frame rate; drawn moving every frame while awake.
function props(fps) { const list = [{ i: 0, model: 'metalbucket01a', breaks: false, mass: 1, x: 0, z: 0, y: 0, h: 1.6, rx: .8, rz: .8 }], piv = new Map([[0, new THREE.Group()]]);
  const P = createPhysProps(list, piv, { floorAt: () => 0, blocked: (x, z, y, h, r) => x + r > 30 }), none = new Float32Array(3), path = [], at = {};
  P.blast(-2, 0, .5, 14); for (let f = 1; f <= fps * 2.5; f++) { P.update(1 / fps, none, 0); const p = piv.get(0).position; path.push([f / fps, p.x, p.y, p.z]); for (const T of [.5, 1, 2]) if (Math.abs(f / fps - T) < 1e-9) at[T] = P.at(0); }
  return { path, at, P }; }
const pr = Object.fromEntries(RATES.map(r => [r, props(r)]));
{ let worst = 0; for (const T of [.5, 1, 2]) for (const r of RATES) worst = Math.max(worst, Math.hypot(...pr[r].at[T].map((v, i) => v - pr[30].at[T][i])));
  ok('a blasted prop flies the same at 30 / 60 / 144 / 240 fps (fixed 128 Hz steps)', worst < 1e-3, worst.toExponential(2)); }
for (const r of [60, 144, 240]) { const M = motion(pr[r].path, 1); ok(`a blasted prop at ${r} fps: drawn moving every frame (no holds), no zig-zags`, M.holds === 0 && M.zig === 0, JSON.stringify(M)); }
ok('…and it comes to rest (asleep) where it is drawn', !pr[60].P.awake(0) && Math.hypot(pr[60].path.at(-1)[1] - pr[60].P.at(0)[0], pr[60].path.at(-1)[3] - pr[60].P.at(0)[2]) < 1e-4);

// 6. The death fall: slow to start (a body tips, it doesn't leap), down in about half a second, a small rebound, then still.
{ const a = deathFall(.06), half = deathFall(.25), down = deathFall(.55); let mono = true, prev = 0; for (let t = 0; t <= .5; t += .005) { const f = deathFall(t); if (f < prev - 1e-6) mono = false; prev = f; }
  ok('death fall: slow to start (under 12 % in the first 60 ms — the v51 exponential was at 34 %)', a < .12, a.toFixed(3));
  ok('…gathering speed (each 50 ms covers more than the one before, until it lands)', deathFall(.4) - deathFall(.35) > deathFall(.15) - deathFall(.1) && mono, `${half.toFixed(3)}`);
  ok('…down in about half a second, a rebound under 3 %, then still', down > .97 && deathFall(DEATH_FALL_S) === 1 && deathFall(5) === 1 && Math.min(...[.5, .52, .54, .56, .58, .6].map(deathFall)) > .97, down.toFixed(3)); }
console.log(`PASS: physics smoothness · ${n} checks (toss replay at 30–240 fps, grenade follow over Wi-Fi, frame clock, fixed steps, props, death fall)`);
