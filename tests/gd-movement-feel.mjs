// Movement feel, measured (spec §4 "not slippery"): how far and how long you slide after letting go, how fast a
// counter-strafe makes you accurate, how long a full reversal takes, how high a jump goes — and that the frame rate
// changes none of it: the same keys make the same path at 30, 60, 144 and 240 frames a second.
// The expected values are not remembered CS numbers: they are the closed-form results of the same Source formulas
// with CS2's default cvars (sv_friction 5.2, sv_stopspeed 80, sv_accelerate 5.5, sv_gravity 800, sv_jump_impulse
// 301.993; knife 250 u/s), so the test checks that the tick-by-tick movement really behaves like those rules. The game
// moves in fixed ticks of 1/MOVE_HZ s (arena-move.js moveFor / moveTicks): a tick is a little coarser than the
// continuous rules (within 6%, a tick at most for the times), and the frames only decide when you see it (the view is
// drawn between the last two ticks).
import assert from 'node:assert/strict';
import { createMoveState, moveStep, moveTicks, createMoveClock, pressJump, MOVE, HU, maxSpeed, MOVE_HZ, TICK } from '../dist/arena-move.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const V = 250, F = MOVE.friction, S = 80, A = MOVE.accelerate * V, G = 800, J = 301.993;   // HU/s, 1/s, HU/s, HU/s², HU/s², HU/s
// Letting go: exponential decay down to the stop speed, then a constant deceleration (stop speed × friction).
const stopT = Math.log(V / S) / F + S / (S * F), stopD = (V - S) / F + S * S / (2 * S * F);
// Counter-strafe: friction and full acceleration the other way, dv/dt = −F·v − A (above the stop speed), until
// the speed is at most 34% of the maximum (where CS2 shooting is accurate again).
const accT = Math.log((V + A / F) / (.34 * V + A / F)) / F;
// A jump: the apex J² / 2G = 57.0 HU after J / G s, back down after 2J / G = 0.755 s.
const apex = J * J / (2 * G), airT = 2 * J / G;
const world = { boxes: [], bounds: null };
// The rules, tick by tick.
const run = () => { const s = createMoveState(); s.x = s.z = 0; s.vx = maxSpeed('knife'); return s; };
let s = run(), t = 0; while (Math.hypot(s.vx, s.vz) > 1e-4 && t < 2) { moveStep(s, { wish: [0, 0], weapon: 'knife' }, world, TICK); t += TICK; } const rel = { t, d: s.x / HU };
s = run(); t = 0; let acc = null; while (t < 2) { moveStep(s, { wish: [-1, 0], weapon: 'knife' }, world, TICK); t += TICK; if (acc === null && Math.abs(s.vx) <= .34 * maxSpeed('knife')) acc = t; if (s.vx <= -.95 * maxSpeed('knife')) break; } const rev = t;
s = createMoveState(); s.x = s.z = 0; let peak = 0; moveStep(s, { weapon: 'knife', jump: true }, world, TICK); t = TICK; while (!s.onGround && t < 2) { moveStep(s, { weapon: 'knife' }, world, TICK); peak = Math.max(peak, s.y / HU); t += TICK; } const air = t;
const near = (a, b, tol) => Math.abs(a - b) <= tol * b;
ok(`letting go stops you in ${rel.t.toFixed(3)} s (rules: ${stopT.toFixed(3)} s)`, near(rel.t, stopT, .06), rel.t);
ok(`sliding ${rel.d.toFixed(1)} HU (rules: ${stopD.toFixed(1)} HU)`, near(rel.d, stopD, .06), rel.d);
ok(`a counter-strafe is accurate in ${(acc * 1000).toFixed(0)} ms (rules: ${(accT * 1000).toFixed(0)} ms)`, Math.abs(acc - accT) <= Math.max(.1 * accT, TICK), acc);
ok(`a jump peaks at ${peak.toFixed(2)} HU (rules: ${apex.toFixed(2)}) and lands after ${air.toFixed(3)} s (rules: ${airT.toFixed(3)})`, Math.abs(peak - apex) < .05 && Math.abs(air - airT) <= TICK, peak);
// The same keys at 30, 60, 144 and 240 fps: run for 1 s, at 1 s turn right, at 1.5 s let go of forward and press
// jump, at 2 s counter-strafe (left), at 2.5 s crouch (until 3 s), at 3 s jump again (and crouch in the air 1/3 s later,
// for half a second), at 3.5 s walk; keys change on moments all four frame rates share (sixths of a second). Every tick
// and every drawn moment is the same.
function scripted(fps) { const s = createMoveState(); s.x = s.z = 0; const c = createMoveClock(), inp = { wish: [0, 0], weapon: 'knife', walk: false, duck: false, jump: false }, dt = 1 / fps, marks = [];
  let now = 0, landed = 0, ticks = 0; const presses = [1.5, 3];
  for (let f = 0; f < fps * 4.5; f++) { const t = f / fps;
    inp.wish[0] = t < 1 ? 0 : t < 2 ? 1 : -1; inp.wish[1] = t < 1.5 ? -1 : 0; inp.duck = t >= 2.5 && t < 3 || t >= 3 + 2 / 6 - 1e-9 && t < 3 + 5 / 6 - 1e-9; inp.walk = t >= 3.5;
    while (presses.length && presses[0] <= t + 1e-9) pressJump(c, presses.shift());
    now += dt; moveTicks(s, c, inp, world, dt, now); landed += c.landed; ticks += c.ticks - ticks;
    if (Math.abs(now * 2 - Math.round(now * 2)) < 1e-9) marks.push([c.ticks, s.x, s.y, s.z, s.vx, s.vz, c.x, c.y, c.z]); }
  return { fps, s, marks, landed, ticks }; }
const runs = [30, 60, 144, 240].map(scripted), ref = runs[0];
const diff = (a, b) => Math.max(...a.marks.flatMap((m, i) => m.map((v, j) => Math.abs(v - b.marks[i][j]))));
ok('the same keys make the same path at 30, 60, 144 and 240 fps (every half second: ticks, position, velocity, drawn view)', runs.every(r => r.marks.length === ref.marks.length && diff(r, ref) < 1e-9 && r.landed === ref.landed), JSON.stringify(runs.map(r => [r.fps, r.marks.length, +diff(r, ref).toExponential(1), r.landed])));
ok('…and they did something: moved, jumped twice and landed, crouched', ref.landed === 2 && Math.hypot(ref.s.x, ref.s.z) > 50 && ref.marks.length === 9, JSON.stringify(ref.marks.at(-1).map(v => +v.toFixed(2))));
console.log('PASS: movement feel · ' + n + ' checks\n' + `  ticks of 1/${MOVE_HZ} s · stop ${rel.t.toFixed(3)} s after ${rel.d.toFixed(1)} HU (${(rel.d * HU).toFixed(2)} units) · counter-strafe accurate ${(acc * 1000).toFixed(0)} ms · full reversal ${(rev * 1000).toFixed(0)} ms · jump ${peak.toFixed(2)} HU, ${air.toFixed(3)} s in the air`
  + `\n  rules (continuous): stop ${stopT.toFixed(3)} s after ${stopD.toFixed(1)} HU · counter-strafe ${(accT * 1000).toFixed(0)} ms · jump ${apex.toFixed(2)} HU, ${airT.toFixed(3)} s\n  30 / 60 / 144 / 240 fps: the same ${ref.marks.at(-1)[0]} ticks, end at (${ref.s.x.toFixed(3)}, ${ref.s.y.toFixed(3)}, ${ref.s.z.toFixed(3)}) in every run`);
