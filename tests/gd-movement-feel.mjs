// Movement feel, measured (spec §4 "not slippery"): how far and how long you slide after letting go, how fast a
// counter-strafe makes you accurate, how long a full reversal takes — at 30, 60, 144 and 240 frames a second.
// The expected values are not remembered CS numbers: they are the closed-form results of the same Source formulas
// with CS2's default cvars (sv_friction 5.2, sv_stopspeed 80, sv_accelerate 5.5; knife 250 u/s), so the test checks
// that the frame-by-frame movement really behaves like those rules at every frame rate. The game moves in steps of
// at most 1/MOVE_HZ s (moveFor), so a step is a little coarser than the continuous rules (within 6%).
import assert from 'node:assert/strict';
import { createMoveState, moveFor, MOVE, HU, maxSpeed, MOVE_HZ } from '../dist/arena-move.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const V = 250, F = MOVE.friction, S = 80, A = MOVE.accelerate * V;   // HU/s, 1/s, HU/s, HU/s²
// Letting go: exponential decay down to the stop speed, then a constant deceleration (stop speed × friction).
const stopT = Math.log(V / S) / F + S / (S * F), stopD = (V - S) / F + S * S / (2 * S * F);
// Counter-strafe: friction and full acceleration the other way, dv/dt = −F·v − A (above the stop speed), until
// the speed is at most 34% of the maximum (where CS2 shooting is accurate again).
const accT = Math.log((V + A / F) / (.34 * V + A / F)) / F;
const world = { boxes: [], bounds: null };
function measure(fps) { const dt = 1 / fps, run = () => { const s = createMoveState(); s.x = s.z = 0; s.vx = maxSpeed('knife'); return s; };
  // Release: no keys until stopped.
  let s = run(), t = 0; while (Math.hypot(s.vx, s.vz) > 1e-4 && t < 2) { moveFor(s, { wish: [0, 0], weapon: 'knife' }, world, dt); t += dt; } const rel = { t, d: s.x / HU };
  // Counter-strafe: the opposite key until accurate (≤ 34% of max speed), then until fully reversed (≥ 95% the other way).
  s = run(); t = 0; let acc = null; while (t < 2) { moveFor(s, { wish: [-1, 0], weapon: 'knife' }, world, dt); t += dt; if (acc === null && Math.abs(s.vx) <= .34 * maxSpeed('knife')) acc = t; if (s.vx <= -.95 * maxSpeed('knife')) break; }
  return { fps, stopT: rel.t, stopD: rel.d, accT: acc, revT: t }; }
const rows = [30, 60, 144, 240].map(measure), near = (a, b, tol) => Math.abs(a - b) <= tol * b;
for (const r of rows) {
  ok(`${r.fps} fps: letting go stops you in ${r.stopT.toFixed(3)} s (rules: ${stopT.toFixed(3)} s)`, near(r.stopT, stopT, .06), r.stopT);
  ok(`${r.fps} fps: sliding ${r.stopD.toFixed(1)} HU (rules: ${stopD.toFixed(1)} HU)`, near(r.stopD, stopD, .06), r.stopD);
  ok(`${r.fps} fps: a counter-strafe is accurate in ${(r.accT * 1000).toFixed(0)} ms (rules: ${(accT * 1000).toFixed(0)} ms)`, Math.abs(r.accT - accT) <= Math.max(.1 * accT, 1 / r.fps), r.accT); }
const span = k => Math.max(...rows.map(r => r[k])) / Math.min(...rows.map(r => r[k]));
// Times are counted in whole frames, so they may differ by one frame; the distance has no such rounding.
const sameT = k => rows.every(r => rows.every(q => Math.abs(r[k] - q[k]) <= 1 / r.fps + 1 / q.fps + .005));
ok('the same at any frame rate: slide distance within 3% from 30 to 240 fps', span('stopD') < 1.03, span('stopD').toFixed(3));
ok('the same at any frame rate: stop, counter-strafe and reversal times within a frame', sameT('stopT') && sameT('accT') && sameT('revT'), JSON.stringify(rows.map(r => [r.stopT, r.accT, r.revT].map(x => +x.toFixed(3)))));
console.log('PASS: movement feel · ' + n + ' checks\n' + rows.map(r => `  ${String(r.fps).padStart(3)} fps · stop ${r.stopT.toFixed(3)} s after ${r.stopD.toFixed(1)} HU (${(r.stopD * HU).toFixed(2)} units) · counter-strafe accurate ${(r.accT * 1000).toFixed(0)} ms · full reversal ${(r.revT * 1000).toFixed(0)} ms`).join('\n')
  + `\n  rules (continuous): stop ${stopT.toFixed(3)} s after ${stopD.toFixed(1)} HU · counter-strafe ${(accT * 1000).toFixed(0)} ms`);
