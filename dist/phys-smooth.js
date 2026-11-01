// Smooth motion for Global Defensive's physics (package P: "all in game physics looks so laggy"): the helpers that draw
// a fixed-step simulation at any frame rate (30–240 fps on 60 / 75 / 100 / 144 / 165 Hz) without holds or steps, and
// blend a correction out instead of snapping to it. Pure functions and fixed scratch: nothing allocated per frame.
//  · replay(F, step, run, stepFn): a deterministic fixed-step flight (a dropped gun's toss: arena-nades tossFlight at
//    TOSS_DT = 1/32 s, the host's own steps) caught up to `run` seconds and drawn between the last two steps — drawn at
//    the step rate, a 32 Hz flight held 2 frames of 3 at 60 Hz and 4–5 at 144 Hz (the "laggy" drop). Between two steps
//    it is a cubic Hermite through both positions and velocities: the arc of a step with no contact is a parabola
//    (stepNade's gravity is Source's exact half-before / half-after move), which the cubic reproduces exactly; a step
//    with a contact (its end velocity not the start's under gravity) is drawn straight, never bulging into the wall.
//  · fixedSteps(clock, dt, step, max): how many fixed steps a frame of dt takes (the rest carried), and clock.a: how far
//    into the next step the frame is drawn (0…1) — the physics props (arena-physprops.js) at 128 Hz, like the movement.
//  · easeOff(o, dt, tau): a correction offset decayed with time constant tau (frame-rate independent): the host's word
//    on where a grenade is, eased out over ~3 tau instead of a jump (multiplayer, arena-nades-view.js).
//  · deathFall(t): how far over a body has fallen t seconds after death (0 standing … 1 flat): a rigid body toppling
//    about its feet under gravity (θ'' = 3g / 2L · sin θ, L 1.8 m, a shot's push to start it) — slow at first, fastest as
//    it lands, a small rebound — not the old exponential that leapt a third of the way in the first 60 ms and crept.
// Units: game units (HU × 2.54 / 16.5), seconds.

// A replayed flight F (the caller's object, kept per flight): F.g the flown state (x y z vx vy vz, rest), F.t the
// flight time stepped so far (starts 0); F.p the state one step before (a Float64Array(6) the caller makes once per
// flight). stepFn(g, step) steps g once. `end`: the flight's last step time (s), or Infinity; grav: its gravity. Writes
// the drawn position at flight time `run` into out (x, y, z); returns the steps taken this call.
export function replay(F, step, run, stepFn, out, end = Infinity, grav = 0) {
  const g = F.g, p = F.p; let n = 0;
  if (!F.started) { F.started = true; p[0] = g.x; p[1] = g.y; p[2] = g.z; p[3] = g.vx; p[4] = g.vy; p[5] = g.vz; }
  while (F.t < run && !g.rest && F.t < end - 1e-9) { p[0] = g.x; p[1] = g.y; p[2] = g.z; p[3] = g.vx; p[4] = g.vy; p[5] = g.vz; stepFn(g, step); F.t += step; n++; }
  if (F.t <= 0) { out.x = g.x; out.y = g.y; out.z = g.z; return n; }   // (not started: where it leaves the hand)
  hermiteStep(out, p, g, step, Math.min(1, Math.max(0, 1 - (F.t - run) / step)), grav); return n; }   // (p is the state at F.t − step; stopped: a = 1, where it lies)
const lerp3 = (out, p, g, a) => { out.x = p[0] + (g.x - p[0]) * a; out.y = p[1] + (g.y - p[1]) * a; out.z = p[2] + (g.z - p[2]) * a; };
// Between state p (start of the step) and g (end), fraction a: the Hermite cubic through both ends' positions and
// velocities when the step had no contact (its velocities agree with a free flight under gravity `grav`). A step with a
// contact (a bounce, a hop along the floor): the arc it came in on (from p) up to where it meets the arc it left on (back
// from g) — the bounce point, searched at 12 moments of the step — then that one; what the two miss by (the contact's
// own push-out) spread over each side, so it is continuous and exact at both ends. (Straight across, a bounce step's
// speed was the step's average: a 1–3 units/s kink at every bounce.) At rest after it: the arc in, then lying there.
const pre = (p, k, t, grav) => p[k] + p[k + 3] * t - (k === 1 ? .5 * grav * t * t : 0);
const post = (g, k, s, grav, rest) => { const c = k === 0 ? g.x : k === 1 ? g.y : g.z, v = rest ? 0 : k === 0 ? g.vx : k === 1 ? g.vy : g.vz; return c - v * s - (k === 1 && !rest ? .5 * grav * s * s : 0); };
export function hermiteStep(out, p, g, h, a, grav = 0) {
  const free = Math.abs(g.vx - p[3]) + Math.abs(g.vz - p[5]) + Math.abs(g.vy - (p[4] - grav * h)) < 1e-6 * (1 + Math.abs(p[3]) + Math.abs(p[4]) + Math.abs(p[5]));
  if (!free) { const rest = !!g.rest; let tb = 0, best = Infinity;
    for (let i = 0; i <= 12; i++) { const t = h * i / 12, s = h - t, dx = pre(p, 0, t, grav) - post(g, 0, s, grav, rest), dy = pre(p, 1, t, grav) - post(g, 1, s, grav, rest), dz = pre(p, 2, t, grav) - post(g, 2, s, grav, rest), d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; tb = t; } }
    const tau = a * h, s = h - tau, ex = pre(p, 0, tb, grav) - post(g, 0, h - tb, grav, rest), ey = pre(p, 1, tb, grav) - post(g, 1, h - tb, grav, rest), ez = pre(p, 2, tb, grav) - post(g, 2, h - tb, grav, rest);
    if (tau <= tb && tb > 0) { const w = tau / tb * (tb < h ? .5 : 1); out.x = pre(p, 0, tau, grav) - ex * w; out.y = pre(p, 1, tau, grav) - ey * w; out.z = pre(p, 2, tau, grav) - ez * w; }
    else { const w = tb < h ? s / (h - tb) * (tb > 0 ? .5 : 1) : 0; out.x = post(g, 0, s, grav, rest) + ex * w; out.y = post(g, 1, s, grav, rest) + ey * w; out.z = post(g, 2, s, grav, rest) + ez * w; }
    return out; }
  const a2 = a * a, a3 = a2 * a, h00 = 2 * a3 - 3 * a2 + 1, h10 = (a3 - 2 * a2 + a) * h, h01 = -2 * a3 + 3 * a2, h11 = (a3 - a2) * h;
  out.x = h00 * p[0] + h10 * p[3] + h01 * g.x + h11 * g.vx; out.y = h00 * p[1] + h10 * p[4] + h01 * g.y + h11 * g.vy; out.z = h00 * p[2] + h10 * p[5] + h01 * g.z + h11 * g.vz; return out; }

// Fixed steps for a frame: clock = { acc } (the caller's, kept); returns the steps to take (at most max — after a stall
// the rest is dropped, never a burst); clock.a = the draw fraction into the next step.
export function fixedSteps(clock, dt, step, max = 8) {
  if (!(dt > 0)) { clock.a = clock.acc / step; return 0; } clock.acc += dt; let n = Math.floor(clock.acc / step + 1e-9);
  if (n > max) { n = max; clock.acc = step * max; } clock.acc -= n * step; if (clock.acc < 0) clock.acc = 0; clock.a = Math.min(1, clock.acc / step); return n; }

// A correction offset (one axis) decayed over time: tau seconds (≈ 95 % gone after 3 tau), the same at any frame rate.
export const easeOff = (o, dt, tau = .04) => o * Math.exp(-dt / tau);

// The host's time for THIS frame (ms): a clock moved on by the frame's own dt (the display's refresh steps) and pulled
// gently (2 %/s-scale: dt × 2 of the gap) to hostNow() as read — read mid-frame, after whatever ran before it (2–10 ms
// of script that varies frame to frame), a raw hostNow() put the grenade's catch-up ahead by that much at random: a
// 100 units/s flight jittered ±0.5 units, every host update. More than 250 ms apart (a stall, a clock step): taken as is.
export function frameClock(c, dt, now) { const t = c.t + dt * 1000; if (c.t === undefined || !(Math.abs(now - t) < 250)) c.t = now; else c.t = t + (now - t) * Math.min(1, dt * 2); return c.t; }

// A grenade in flight as a client draws it (arena-nades-view.js): its own copy flown every frame by the host's physics
// (step(S, dt): arena-nades stepNade on this map), and on each new word from the host (g: x y z vx vy vz still rest grav
// bt, `late` s old on the host's clock) the copy reset to it and caught up — the difference to where the copy was to be
// drawn THIS frame (flown on by dt first) kept as an offset eased out with time constant tau. v: { sim (null until the
// first word), ox, oy, oz, fresh (its copy already flown this frame) }. Draw at v.sim + offset. Allocation-free after
// the first word (the copy is made once per grenade).
// v.slow (s, optional): while above 0 the offset eases with SLOW_TAU instead — your own throw's copy taken over by the
// host's grenade: the two are the same path a few tens of ms apart in time (the host's first tick flies a grenade the
// whole tick, the request took half a round trip), 1–4 units; eased in 50 ms that was a 380 units/s lurch.
export const SLOW_TAU = .15;
export function flightFrame(v, g, isNew, late, dt, step, paused = false, tau = .05) {
  if (v.slow > 0) { tau = SLOW_TAU; v.slow -= dt; }
  if (v.sim) { v.ox = easeOff(v.ox, dt, tau); v.oy = easeOff(v.oy, dt, tau); v.oz = easeOff(v.oz, dt, tau); }
  if (isNew && Number.isFinite(g.vx)) { const first = !v.sim, S = v.sim ??= { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, still: 0, rest: false, grav: undefined, bt: undefined, void: false, bad: false, view: true, pastGlass: null };
    if (!first && !v.fresh && !paused && !S.void) fly(v, S, dt, step);
    const wx = S.x + v.ox, wy = S.y + v.oy, wz = S.z + v.oz; v.fresh = false;
    S.x = g.x; S.y = g.y; S.z = g.z; S.vx = g.vx; S.vy = g.vy; S.vz = g.vz; S.still = g.still || 0; S.rest = !!g.rest; S.grav = g.grav; S.bt = g.bt; S.void = S.bad = false; v.hostRest = !!g.rest; v.slide = 0;
    if (late > 0 && !paused) fly(v, S, Math.min(.25, late), step);
    if (first) { v.ox = v.oy = v.oz = 0; } else { v.ox = wx - S.x; v.oy = wy - S.y; v.oz = wz - S.z; } return; }
  if (v.sim && !v.sim.void && !paused) { if (!v.fresh) fly(v, v.sim, dt, step); } v.fresh = false; }
// The copy flown d s as the host flies it — but never brought to rest by itself while the host's last word has it moving:
// its bounces on the floor fall a substep apart from the host's, so it stopped dead up to 4 frames before the host's
// grenade did and the next word slid it on (a stop-and-go at the end of every roll). Stopped short, it slides on at the
// speed it had along the floor, losing it at SLIDE_K /s, for at most SLIDE_S s (a word held up: no sliding through walls
// for long) — the host's next word takes over. (v.slide: seconds slid; 0 not sliding.)
const SLIDE_K = 6, SLIDE_S = .12;
function fly(v, S, d, step) {
  if (v.slide > 0) { if (v.slide >= SLIDE_S) return; v.slide += d; S.x += S.vx * d; S.z += S.vz * d; const k = Math.exp(-SLIDE_K * d); S.vx *= k; S.vz *= k; return; }
  const vx = S.vx, vz = S.vz, was = S.rest; step(S, d);
  if (S.rest && !was && !v.hostRest && vx * vx + vz * vz > 0) { v.slide = 1e-9; S.vx = vx; S.vz = vz; S.vy = 0; } }

// The death fall: tabulated once (1 ms) from the toppling body — no per-frame work beyond a lookup.
const FALL_MS = 900, FALL = new Float32Array(FALL_MS + 1);
{ const g = 9.81, L = 1.8, k = 3 * g / (2 * L), h = 1e-4; let th = 0, w = 2.4, t = 0, i = 0, landed = false;   // (w: the push, rad/s — a shot or a blast tips it at once; ~0.5 s down)
  while (i <= FALL_MS) { if (t >= i / 1000 - 1e-12) { FALL[i++] = Math.min(1, th / (Math.PI / 2)); continue; }
    w += k * Math.sin(th) * h; th += w * h; t += h;
    if (th >= Math.PI / 2 && w > 0) { th = Math.PI / 2; w = landed ? 0 : -w * .14; landed = true; }   // (flat on the floor: one small rebound, then still)
  }
  FALL[FALL_MS] = 1; }
export function deathFall(t) { if (!(t > 0)) return 0; const m = t * 1000; if (m >= FALL_MS) return 1; const i = m | 0, f = m - i; return FALL[i] + (FALL[i + 1] - FALL[i]) * f; }
export const DEATH_FALL_S = FALL_MS / 1000;
