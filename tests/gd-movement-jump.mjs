// CS2 jumping and crouching (dist/arena-move.js) against CS2's values: the jump's apex from sv_jump_impulse 301.993 and
// sv_gravity 800 (57.0 HU), the crouch-jump (a duck in the air tucks the feet up: ~66 HU), a crouch and a jump on one
// key (the crouch-jump bind: same tick), jumping while already crouched (no extra reach), the duck's timing window in
// the air, stamina (sv_staminajumpcost .08, sv_staminalandcost .05, sv_staminarecoveryrate 60: a jump straight off a
// landing is low, a landing at a run costs speed for a moment, jump spam stays low), air strafing (sv_airaccelerate 12,
// the 30 HU/s air cap: turning with the strafe key gains speed, the next jump trims it), the same path at 30/60/144/240
// fps, and two bodies moved in turn (the host's bots, the client's own prediction) exactly as each one alone.
import { createMoveState, moveStep, moveTicks, createMoveClock, pressJump, maxSpeed, HU, MOVE, TICK, STAMINA } from '../dist/arena-move.js';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const T = TICK, open = { boxes: [], bounds: null }, idle = { wish: [0, 0], weapon: 'knife' };
const at = (x = 0, z = 0) => Object.assign(createMoveState(0), { x, z });
const hu = s => Math.hypot(s.vx, s.vz) / HU;
// One jump on the spot (press on the first tick): its apex (HU over the take-off) and the ticks to land.
const apex = (s, duckFrom = Infinity, world = open) => { const y0 = s.y; let top = -Infinity, k = 0; moveStep(s, { ...idle, jump: true, duck: duckFrom <= 0 || s.ducked && duckFrom === -1 }, world, T);
  while (!s.onGround && k < 400) { k++; moveStep(s, { ...idle, duck: k >= duckFrom }, world, T); top = Math.max(top, s.y); } return { h: (top - y0) / HU, k }; };

// 1. The apex from CS2's cvars.
{ const want = 301.993 ** 2 / (2 * 800), a = apex(at()), c = apex(at(), 1);
  check('Plain jump: apex = sv_jump_impulse² / (2·sv_gravity) = 57.0 HU', Math.abs(a.h - want) < .05 && Math.abs(want - 57) < .01, a.h.toFixed(2) + ' HU (cvars: ' + want.toFixed(2) + ')');
  check('Crouch-jump: the duck in the air tucks the feet up 9 HU — apex 66 HU (CS crouch-jump reach ~64–66)', Math.abs(c.h - 66) < .1, c.h.toFixed(2) + ' HU'); }

// Reach onto a block `h` HU high, running at it (250 HU/s), jumping 0–48 HU before it; the duck given by duckAt(tick
// since the press, body) — at any frame rate (moveTicks).
const reach = (h, duckAt, fps = 128, pre = false) => { const top = h * HU, box = { minX: -50, maxX: 50, minZ: -400, maxZ: -10, y0: 0, y1: top };
  for (let d = 0; d <= 48; d += 4) { const s = at(0, pre ? -10 + MOVE.radius + 60 * HU : 30); s.vz = -maxSpeed('knife') * (pre ? MOVE.duck : 1); if (pre) { s.ducked = true; s.duck = 1; s.duckHeld = true; } /* (crouched: at the crouch-walk's 85 HU/s, from 60 HU out) */ const c = createMoveClock(); let k = -1, on = false;
    for (let i = 0; i < fps * 1.6 && !on; i++) { if (k < 0 && s.z < -10 + MOVE.radius + d * HU) { k = 0; pressJump(c, NaN); } else if (k >= 0) k++;
      moveTicks(s, c, { wish: [0, -1], weapon: 'knife', duck: pre || duckAt(k, s) }, { boxes: [box] }, 1 / fps); on = s.onGround && Math.abs(s.y - top) < 1e-9 && s.z < -10; }
    if (on) return true; } return false; };
// 2. Crouch and jump on one key (the crouch-jump bind): the same tick as the press still crouch-jumps.
{ const same = k => k >= 0, rows = [60, 128, 240].map(f => [reach(65, same, f), !reach(67, same, f)]);
  check('Crouch and jump on the same key (one tick): 65 HU yes, 67 no — at 60/128/240 fps', rows.every(r => r.every(Boolean)), JSON.stringify(rows)); }
// 3. Jumping while already crouched (fully down on the ground): a plain jump's reach, never a crouch-jump's.
{ const r = [reach(56, () => true, 128, true), !reach(58, () => true, 128, true), !reach(62, () => true, 128, true)], a = apex(Object.assign(at(), { ducked: true, duck: 1, duckHeld: true }), -1);
  check('Jumping while crouched: apex 57 HU with the crouched hull, onto 56 HU yes, 58 and 62 no (no crouch-jump without the duck in the air)', r.every(Boolean) && Math.abs(a.h - 57) < .05, JSON.stringify(r) + ' · apex ' + a.h.toFixed(2)); }
// 4. The duck's window: any time on the way up (feet still under the top less 9 HU) reaches; late on the way down, not.
{ const early = reach(64, k => k >= 13), late = reach(64, k => k >= 64), none = reach(64, () => false);
  check('Crouch-jump window: ducking 0.1 s after take-off still reaches 64 HU; 0.5 s (falling) or never does not', early && !late && !none, JSON.stringify([early, late, none])); }

// 4b. Crouch-walking and walking get going at once (CS's ground acceleration on max(250, wish): 5.5 × 250 HU/s² less
// friction) — a crouch from standing at its 85 HU/s in well under 0.2 s, a walk at its 130.
{ const t = (inp, v) => { const s = at(); let k = 0; while (hu(s) < v - .5 && k < 512) { moveStep(s, inp, open, T); k++; } return k * T; };
  const crouch = t({ wish: [0, -1], weapon: 'knife', duck: true }, 85), walk = t({ wish: [0, -1], weapon: 'knife', walk: true }, 130), ak = t({ wish: [0, -1], weapon: 'ak', duck: true }, 215 * .34);
  check('Crouch-walking from standing reaches 85 HU/s in under 0.2 s (AK: 73 HU/s), walking 130 in under 0.2 s', crouch < .2 && walk < .2 && ak < .2, `crouch ${crouch.toFixed(3)} s, AK crouch ${ak.toFixed(3)} s, walk ${walk.toFixed(3)} s`); }

// 5. Stamina.
{ const s = at(); const first = apex(s).h; const second = apex(s).h; const third = apex(s).h;   // (each press on the landing tick)
  const r = at(); apex(r); for (let i = 0; i < 40; i++) moveStep(r, idle, open, T); const rested = apex(r).h;   // (0.31 s on the ground first)
  check('Stamina: a jump straight off a landing is low (~41 HU, 36–46), spam stays low; 0.3 s on the ground and it is 57 again', Math.abs(first - 57) < .05 && second > 36 && second < 46 && third > 36 && third < 48 && Math.abs(rested - 57) < .05,
    [first, second, third, rested].map(v => v.toFixed(1)).join(' / ') + ' HU'); }
{ const s = at(); for (let i = 0; i < 256; i++) moveStep(s, { wish: [0, -1], weapon: 'knife' }, open, T); moveStep(s, { wish: [0, -1], weapon: 'knife', jump: true }, open, T);
  while (!s.onGround) moveStep(s, { wish: [0, -1], weapon: 'knife' }, open, T); let lo = hu(s), back = NaN;
  for (let i = 1; i < 256; i++) { moveStep(s, { wish: [0, -1], weapon: 'knife' }, open, T); lo = Math.min(lo, hu(s)); if (back !== back && i > 8 && hu(s) >= 245) back = i * T; }
  check('Stamina: landing a running jump costs speed for a moment (250 → under 180 HU/s), back to 245+ within 0.8 s', lo < 180 && lo > 60 && back <= .8, `lowest ${lo.toFixed(0)} HU/s, back in ${back.toFixed(2)} s`); }
{ const s = at(); const steps = []; for (let i = 0; i < 6; i++) steps.push({ minX: -50, maxX: 50, minZ: -200, maxZ: -100 + i * 3, y0: 0, y1: (6 - i) * 16 * HU });   // (a staircase down: 16 HU steps)
  Object.assign(s, { y: 96 * HU, z: -150 }); let maxS = 0, lands = 0; for (let i = 0; i < 256; i++) { moveStep(s, { wish: [0, 1], weapon: 'knife' }, { boxes: steps }, T); maxS = Math.max(maxS, s.stamina); lands += s.landed; s.landed = 0; }
  check('Stamina: walking down a staircase of 16 HU steps never counts as landings (no slow-down)', maxS === 0 && lands === 0 && s.y === 0 && s.z > -80, `stamina ${maxS}, landings ${lands}, at ${(s.y / HU).toFixed(1)} HU`); }
check('Stamina cvars: sv_staminamax 80, jump cost .08, land cost .05, recovery 60/s', STAMINA.max === 80 && STAMINA.jump === .08 && STAMINA.land === .05 && STAMINA.recover === 60);

// 6. Air strafing: turning the view with the strafe key held gains speed (CS's air acceleration against a 30 HU/s wish);
// the next jump trims it to 1.1 × the knife's 250 (no bunny-hop gains).
{ const s = at(); for (let i = 0; i < 256; i++) moveStep(s, { wish: [0, -1], weapon: 'knife' }, open, T); moveStep(s, { wish: [0, -1], weapon: 'knife', jump: true }, open, T);
  let ang = 0, k = 0; while (!s.onGround && k++ < 200) { const v = Math.hypot(s.vx, s.vz), dir = Math.atan2(s.vz, s.vx); ang = dir + Math.acos(Math.min(1, (30 - 12 * 250 * T) * HU / v)); /* (the wish just under 90° off the velocity: the full air acceleration each tick) */ moveStep(s, { wish: [Math.cos(ang), Math.sin(ang)], weapon: 'knife' }, open, T); }
  const air = hu(s); const plain = at(); for (let i = 0; i < 256; i++) moveStep(plain, { wish: [0, -1], weapon: 'knife' }, open, T); moveStep(plain, { wish: [0, -1], weapon: 'knife', jump: true }, open, T); while (!plain.onGround) moveStep(plain, { wish: [0, -1], weapon: 'knife' }, open, T);
  s.stamina = 0; moveStep(s, { weapon: 'knife', jump: true }, open, T); const after = hu(s);
  check('Air strafing gains speed in the air (sv_airaccelerate 12, 30 HU/s cap); the next jump trims it to 275', air > 262 && after <= 275 + 1e-6 && after > 270, `air ${air.toFixed(0)} HU/s (straight: ${hu(plain).toFixed(0)}), after the jump ${after.toFixed(0)}`); }

// 7. The same path at 30/60/144/240 fps: run, a crouch-jump onto a box, a jump straight off the landing, duck spam,
// stand. (Keys change on frames every 1/6 s — a frame time at all four rates; jumps pressed at their moment.)
{ const box = { minX: -60, maxX: 60, minZ: -60, maxZ: -25, y0: 0, y1: 62 * HU }, world = { boxes: [box] };
  const plan = t => { const p = Math.floor(t * 6 + 1e-9); return { wish: p < 9 ? [0, -1] : [0, 0], weapon: 'knife', duck: p === 3 || p === 4 || p >= 10 && p % 2 === 0 }; };
  const presses = [2.5 / 6, 6.95 / 6];
  const runAt = fps => { const s = at(0, 0), c = createMoveClock(); let t = 0; const N = Math.round(fps * 3), q = presses.slice();
    for (let i = 0; i < N; i++) { const t1 = (i + 1) / fps; while (q.length && q[0] <= t1) pressJump(c, q.shift()); moveTicks(s, c, plan(t), world, 1 / fps, t1); t = t1; }
    return [s.x, s.y, s.z, s.vx, s.vz, s.vy, s.stamina, s.duck, +s.ducked, s.duckSpeed, c.ticks]; };
  const R = [30, 60, 144, 240].map(runAt), same = R.every(r => r.every((v, i) => Math.abs(v - R[0][i]) < 1e-9));
  const s = at(0, 0); let onBox = false; { const c = createMoveClock(); const q = presses.slice(); for (let i = 0; i < 128 * 3; i++) { const t1 = (i + 1) / 128; while (q.length && q[0] <= t1) pressJump(c, q.shift()); moveTicks(s, c, plan(i / 128), world, 1 / 128, t1); if (s.onGround && Math.abs(s.y - box.y1) < 1e-9) onBox = true; } }
  check('The same keys make the same path at 30/60/144/240 fps (a crouch-jump onto a 62 HU box, a jump off the landing, duck spam): identical to 1e-9', same && onBox, R.map(r => `${r[2].toFixed(4)},${(r[1] / HU).toFixed(2)}`).join(' | ') + (onBox ? ' · on the box' : ' · never on the box')); }

// 8. Bodies moved in turn (the host's bots, or a client's own body among others): each exactly as alone — the module's
// per-tick state (air step limit, ladder, hull pool) never leaks from one body to the next.
{ const box = { minX: -60, maxX: 60, minZ: -60, maxZ: -25, y0: 0, y1: 62 * HU }, w = { boxes: [box] }, w2 = { boxes: [box, { minX: 10, maxX: 30, minZ: 5, maxZ: 25, y0: 0, y1: 20 * HU }], others: [{ x: 50, z: 50, y: 0, ducked: false }] };
  const inA = i => ({ wish: [0, -1], weapon: 'knife', jump: i === 20, duck: i > 22 && i < 120 }), inB = i => ({ wish: [Math.sin(i / 20), Math.cos(i / 30)], weapon: 'ak', jump: i % 90 === 5, duck: i % 50 < 10 });
  const a1 = at(0, 0), b1 = at(20, 40); for (let i = 0; i < 400; i++) { moveStep(a1, inA(i), w, T); moveStep(b1, inB(i), w2, T); }
  const a2 = at(0, 0); for (let i = 0; i < 400; i++) moveStep(a2, inA(i), w, T); const b2 = at(20, 40); for (let i = 0; i < 400; i++) moveStep(b2, inB(i), w2, T);
  const k = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'stamina', 'duck', 'ducked'], same = k.every(f => a1[f] === a2[f] && b1[f] === b2[f]);
  check('Two bodies moved tick by tick in turn end exactly where each ends alone (host bots = a client\'s own prediction)', same, k.map(f => `${f} ${+a1[f] === +a2[f] && +b1[f] === +b2[f] ? '=' : '≠'}`).join(' ')); }

// Duck timing (CS:GO's ideal duck speed 8 and its spam penalty — the values DUCK pins; CS2's own aren't published): a
// fresh crouch is fully down in 1/8 s (16 ticks) and back up in 1/8 s; each fresh press costs the next one 2 of the
// speed (never under 1.5), which comes back at 3 a second meanwhile — pressed again at once: 20, then 23 ticks; spammed:
// ~1.5 (2/3 s a crouch); rested 3 s: 1/8 s again.
{ const ticksDown = (s, cap = 200) => { let k = 0; while (!s.ducked && k < cap) { moveStep(s, { ...idle, duck: true }, open, T); k++; } return k; };
  const ticksUp = (s, cap = 200) => { let k = 0; do { moveStep(s, idle, open, T); k++; } while (s.duck > 0 && k < cap); return k; };
  const s = at(), d1 = ticksDown(s), u1 = ticksUp(s), d2 = ticksDown(s), u2 = ticksUp(s), d3 = ticksDown(s), u3 = ticksUp(s);
  for (let i = 0; i < 8; i++) { ticksDown(s, 4); ticksUp(s, 1); } const sp = s.duckSpeed; for (let i = 0; i < 128 * 3; i++) moveStep(s, idle, open, T); const rested = ticksDown(s);
  check('Crouch timing: down in 1/8 s, up in 1/8 s; pressed again at once 20 then 23 ticks, spammed down to the 1.5/s floor; 3 s of rest restores 1/8 s',
    d1 === 16 && u1 === 16 && d2 === 20 && u2 === 20 && d3 === 23 && u3 === 23 && sp >= 1.5 && sp < 1.7 && rested === 16,
    `ticks down/up: ${d1}/${u1}, ${d2}/${u2}, ${d3}/${u3} · after 8 more presses the duck speed is ${sp.toFixed(2)} · rested 3 s: ${rested} ticks`); }

console.log(`${ok === n ? 'PASS' : 'FAIL'}: CS2 jump and crouch · ${ok}/${n}`); if (ok !== n) process.exitCode = 1;
