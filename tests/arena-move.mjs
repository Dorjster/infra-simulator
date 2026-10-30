// CS2-style arena movement (dist/arena-move.js): speeds per weapon, walk / crouch, friction stop, jump height,
// climbing low cover but not containers, walls, and the movement inaccuracy factor; the fixed-tick clock (jump presses,
// stalls, drawing between ticks), jump reach and crouch-jumps, ducking, stairs, staircase walls, landings and fall
// damage, CS2 player collision and boosting (standing on team mates), and the host's pose checks.
import { createMoveState, moveStep, moveFor, moveSpread, maxSpeed, HU, MOVE, tag, TAG, moveTicks, createMoveClock, pressJump, TICK, MAX_TICKS, EYE_GD, eyeAt, FALL, fallDamage, fallCheck, poseGate, POSE_GATE } from '../dist/arena-move.js';
import { WEAPONS, GRENADES, C4 } from '../dist/weapons-data.js';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const dt = 1 / 64, at = (x = 0, z = 0) => Object.assign(createMoveState(0), { x, z });
const run = (s, input, world, secs) => { for (let t = 0; t < secs; t += dt) moveStep(s, input, world, dt); return s; };
const hu = s => Math.round(Math.hypot(s.vx, s.vz) / HU);
const open = { boxes: [], bounds: null }, fwd = { wish: [0, -1] };
check('AK-47 tops out at 215 u/s', hu(run(at(), { ...fwd, weapon: 'ak' }, open, 2)) === 215, hu(run(at(), { ...fwd, weapon: 'ak' }, open, 2)));
check('Knife runs at 250 u/s', hu(run(at(), { ...fwd, weapon: 'knife' }, open, 2)) === 250);
check('Scoped AWP is 100 u/s', Math.round(maxSpeed('sniper', true) / HU) === 100);
check('Walking is 52%', hu(run(at(), { ...fwd, weapon: 'knife', walk: true }, open, 2)) === 130);
check('Crouching is 34%', hu(run(at(), { ...fwd, weapon: 'knife', duck: true }, open, 2)) === 85);
const accel = run(at(), { ...fwd, weapon: 'ak' }, open, .1); check('Acceleration is gradual (not instant)', hu(accel) > 40 && hu(accel) < 200, hu(accel));
{ const s = run(at(), { ...fwd, weapon: 'ak' }, open, 2); run(s, { wish: [0, 0], weapon: 'ak' }, open, .25); check('Letting go: below accurate speed (34%) in 0.25 s', hu(s) < 215 * .34, hu(s)); }
{ const s = run(at(), { ...fwd, weapon: 'ak' }, open, 2); let t = 0; while (hu(s) > 215 * .34 && t < 1) { moveStep(s, { wish: [0, 1], weapon: 'ak' }, open, dt); t += dt; } check('Counter-strafing stops faster than letting go', t < .2, t.toFixed(3) + ' s'); }
{ const s = at(); let peak = 0, t = 0; moveStep(s, { weapon: 'ak', jump: true }, open, dt); while (!s.onGround && t < 2) { moveStep(s, { weapon: 'ak' }, open, dt); peak = Math.max(peak, s.y); t += dt; }
  check('Jump peaks near 57 u and lands', Math.abs(peak / HU - 57) < 3 && s.onGround && s.y === 0, (peak / HU).toFixed(1) + ' u, ' + t.toFixed(2) + ' s'); }
const crate = { minX: -5, maxX: 5, minZ: -50, maxZ: -10, y0: 0, y1: 6 }, cont = { minX: -20, maxX: 20, minZ: -20, maxZ: -10, y0: 0, y1: 15 };
{ const s = run(at(), { ...fwd, weapon: 'knife' }, { boxes: [crate] }, 1); check('Running into a crate stops you', s.z > -10 && s.y === 0, s.z.toFixed(2)); }
{ const s = at(0, 10); let jumped = false; for (let t = 0; t < 3; t += dt) { const j = !jumped && s.z < -4; jumped ||= j; moveStep(s, { wish: s.y > 0 && s.onGround ? [0, 0] : [0, -1], weapon: 'knife', jump: j }, { boxes: [crate] }, dt); } check('Jumping onto a waist-high crate', s.y === 6 && s.onGround, s.y.toFixed(2)); }
{ const s = at(0, -6); for (let t = 0; t < 1.5; t += dt) moveStep(s, { ...fwd, weapon: 'knife', jump: t < .05 }, { boxes: [cont] }, dt); check('Cannot jump onto a container', s.y === 0 && s.z > -10, s.y.toFixed(2)); }
{ const s = Object.assign(at(0, -15), { y: 6 }); run(s, { wish: [0, 1], weapon: 'knife' }, { boxes: [crate] }, 1); check('Walking off a crate falls to the floor', s.y === 0 && s.onGround && s.z > -10); }
{ const s = at(), b = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }; run(s, { wish: [1, 0], weapon: 'knife' }, { boxes: [], bounds: b }, 10); check('Map edge blocks', s.x <= 100 - MOVE.radius, s.x.toFixed(1)); }
{ const s = at(); let jumps = 0, was = true; for (let t = 0; t < 3; t += dt) { moveStep(s, { weapon: 'knife', jump: true }, open, dt); if (was && !s.onGround) jumps++; was = s.onGround; }
  check('Holding jump jumps once (CS2 sv_autobunnyhopping 0: each jump a fresh press)', jumps === 1, jumps + ' jumps in 3 s'); }
{ const s = run(at(), { ...fwd, weapon: 'knife' }, open, 2), v0 = hu(s); let jumps = 0, was = true, pj = false; for (let t = 0; t < 3; t += dt) { const j = s.onGround && !pj; pj = j; moveStep(s, { ...fwd, weapon: 'knife', jump: j }, open, dt); if (was && !s.onGround) jumps++; was = s.onGround; }
  check('Tapping jump at each landing: a jump each time, and stamina keeps bunny hops from gaining speed', jumps >= 4 && hu(s) <= v0, v0 + ' → ' + hu(s) + ' after ' + jumps + ' jumps'); }
const PW = 2 * MOVE.hull;   // two CS2 half-widths: players' centres stay 32 HU apart
{ const s = run(at(0, 10), { ...fwd, weapon: 'knife' }, { boxes: [], others: [{ x: 0, z: 0, y: 0 }] }, 1); check('Another player blocks you: CS2\'s 32 HU hulls (centres 32 HU apart)', s.z > PW - .01 && s.z < PW + .3, (s.z / HU).toFixed(1) + ' HU'); }
{ const s = run(at(.5, 0), { ...fwd, weapon: 'knife' }, { boxes: [], others: [{ x: 0, z: 0, y: 0 }] }, 1); check('Spawned inside another player: you can walk out', s.z < -10, s.z.toFixed(2)); }
{ const s = run(at(10, 0), { wish: [-1, 0], weapon: 'knife' }, { boxes: [], others: [{ x: 0, z: 0, y: 0 }, { x: 0, z: 2.6, y: 0 }] }, 1); check('Two players side by side block like a wall', s.x > PW - .01, s.x.toFixed(2)); }
{ const s = at(0, 0); s.y = MOVE.height + 6; s.onGround = false; run(s, { wish: [0, 0], weapon: 'knife' }, { boxes: [], others: [{ x: 0, z: 0, y: 0 }] }, 1); check('You can stand on another player’s head', s.onGround && Math.abs(s.y - MOVE.height) < 1e-6, s.y.toFixed(2)); }
const still = at(), runner = run(at(), { ...fwd, weapon: 'ak' }, open, 2), air = Object.assign(at(), { onGround: false });
check('Standing still is accurate', moveSpread(still, 'ak') === 1);
check('Running is inaccurate, the air far more', moveSpread(runner, 'ak') > 3 && moveSpread(air, 'ak') > moveSpread(runner, 'ak'), moveSpread(runner, 'ak').toFixed(2));
check('Walking is far more accurate than running', moveSpread(run(at(), { ...fwd, weapon: 'ak', walk: true }, open, 2), 'ak') < moveSpread(runner, 'ak') / 2);
// No bunny hopping: landing faster than 1.1× top speed (from air strafing), the next jump trims you to it.
{ const b = at(); b.vx = 0; b.vz = -400 * HU; moveStep(b, { wish: [0, -1], weapon: 'knife', jump: true }, open, dt); const sp = Math.hypot(b.vx, b.vz) / HU;
  check('No bunny hopping: a jump at 400 u/s leaves at 1.1× the knife\'s 250 (275)', Math.abs(sp - 275) < 3 && !b.onGround, sp.toFixed(0)); }
// Angled walls are staircases of 16-unit cells (stairSide, wallHit): sliding along one is sliding along Source's smooth
// 45° wall — the same pace (250 HU/s pushed 12° into it: 250 / cos 12° = 255.6 at most, Source's clip-and-accelerate
// equilibrium; slower the more you push into it), no dip or bump at each step in any of its four orientations either
// way along it, at 60 or 144 fps (the view, drawn between ticks, never jolts), jumping along it too; head-on you stop,
// no jitter (no phantom speed); where it ends, or has a doorway, you go round or in (the plane it is slid along never
// holds you off open space); into an inner corner you stop still; a flat wall run into at 45° still takes the part into
// it away (Source), and pushing into a flat wall at its end never slides you round it.
{ const C = 16 * HU, boxes = []; for (let k = -60; k < 60; k++) boxes.push({ minX: k * C, maxX: k * C + C, minZ: -k * C - C - 50, maxZ: -k * C - C, y0: 0, y1: 40 });
  const w = { boxes, bounds: null, ladders: [] }, tx = Math.SQRT1_2, tz = -Math.SQRT1_2, nx = -Math.SQRT1_2, nz = -Math.SQRT1_2;
  const slide = (deg, fps = 144) => { const a = deg * Math.PI / 180, s = at(2, -.5), c = createMoveClock(), inp = { wish: [nx * Math.cos(a) + tx * Math.sin(a), nz * Math.cos(a) + tz * Math.sin(a)], weapon: 'knife' }, pts = []; let vmax = 0;
    for (let i = 0; i < fps * 3; i++) { moveTicks(s, c, inp, w, 1 / fps); pts.push([c.x, c.z]); if (i >= fps) vmax = Math.max(vmax, Math.hypot(s.vx, s.vz) / HU); }
    const k = fps, along = ((pts.at(-1)[0] - pts[k][0]) * tx + (pts.at(-1)[1] - pts[k][1]) * tz) / HU / 2; let path = 0, dev = 0; for (let i = k + 1; i < pts.length; i++) path += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / HU;
    for (let i = k; i + 20 < pts.length; i++) for (let j = 1; j < 20; j++) { const p0 = pts[i], p1 = pts[i + 20], t = j / 20; dev = Math.max(dev, Math.hypot(p0[0] + (p1[0] - p0[0]) * t - pts[i + j][0], p0[1] + (p1[1] - p0[1]) * t - pts[i + j][1]) / HU); }
    return { along, path: path / 2, vmax, dev }; };
  const along = slide(78), s45 = slide(45), s30 = slide(30), s0 = slide(0), s5 = slide(5);
  check('Sliding along an angled (staircase) wall keeps its pace, no faster than along Source\'s smooth wall', along.along > 245 && along.path < 256.6, `${along.along.toFixed(0)} HU/s along it, path ${along.path.toFixed(0)} HU/s`);
  check('…smoothly: the drawn path strays under 0.25 HU from a straight line (no jolt at each step)', along.dev < .25, along.dev.toFixed(2) + ' HU');
  check('…pushed at it 45° and 30° off its normal: you slide as on Source\'s smooth wall (~187 and ~132 HU/s)', Math.abs(s45.along - 187) < 8 && Math.abs(s30.along - 132) < 8, `${s45.along.toFixed(0)} · ${s30.along.toFixed(0)} HU/s`);
  check('…head-on (0° and 5°): you stop, no jitter, no phantom speed', Math.abs(s0.along) < 6 && s0.path < 6 && s0.vmax < 10 && s5.path < 6 && s5.vmax < 10, `path ${s0.path.toFixed(1)} · ${s5.path.toFixed(1)} HU/s, |v| ≤ ${Math.max(s0.vmax, s5.vmax).toFixed(1)}`);
  { const a = at(2, -.5), pts = [], I = { wish: [Math.SQRT1_2 - .15, -Math.SQRT1_2 - .15], weapon: 'knife' }, sp = [];
    for (let i = 0; i < 240; i++) { moveFor(a, I, w, 1 / 60); pts.push([a.x, a.z]); } for (let i = 61; i < pts.length; i++) sp.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * 60 / HU); const mean = sp.reduce((x, y) => x + y) / sp.length;
    check('…no dip at each step (per frame at 60 fps, whole ticks: mean > 235, lowest > 180)', mean > 235 && Math.min(...sp) > 180, `mean ${mean.toFixed(0)} · lowest ${Math.min(...sp).toFixed(0)} HU/s`); }
  { const rows = []; let lo = Infinity, hi = 0, wob = 0;
    for (const [fx, fz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const bx = boxes.map(b => ({ minX: fx > 0 ? b.minX : -b.maxX, maxX: fx > 0 ? b.maxX : -b.minX, minZ: fz > 0 ? b.minZ : -b.maxZ, maxZ: fz > 0 ? b.maxZ : -b.minZ, y0: 0, y1: 40 })), N = [nx * fx, nz * fz];
      for (const dir of [1, -1]) for (const fps of [60, 144]) { const Tv = [tx * fx * dir, tz * fz * dir], a = 78 * Math.PI / 180, inp = { wish: [N[0] * Math.cos(a) + Tv[0] * Math.sin(a), N[1] * Math.cos(a) + Tv[1] * Math.sin(a)], weapon: 'knife' }, s = at(2 * fx, -.5 * fz), c = createMoveClock();
        let px = 0, pz = 0, dlo = Infinity, dhi = -Infinity; for (let i = 0; i < fps * 3; i++) { moveTicks(s, c, inp, { boxes: bx }, 1 / fps); if (i > fps) { const v = ((c.x - px) * Tv[0] + (c.z - pz) * Tv[1]) * fps / HU, d = c.x * N[0] + c.z * N[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); dlo = Math.min(dlo, d); dhi = Math.max(dhi, d); } px = c.x; pz = c.z; }
        wob = Math.max(wob, (dhi - dlo) / HU); } }
    check('…every frame, all four orientations, both ways along, 60 and 144 fps: 245–256.6 HU/s along it, under 0.25 HU off its line', lo > 245 && hi < 256.6 && wob < .25, `${lo.toFixed(1)}–${hi.toFixed(1)} HU/s, wobble ${wob.toFixed(2)} HU`); }
  { const s = at(2, -.5), c = createMoveClock(), a = 78 * Math.PI / 180, inp = { wish: [nx * Math.cos(a) + tx * Math.sin(a), nz * Math.cos(a) + tz * Math.sin(a)], weapon: 'knife' }; let now = 0, px = 0, pz = 0, dlo = Infinity, dhi = -Infinity, lo = Infinity;
    for (let i = 0; i < 144 * 4; i++) { now += 1 / 144; if (i % 120 === 60) pressJump(c, now); moveTicks(s, c, inp, w, 1 / 144, now); if (i > 144) { const d = (c.x * nx + c.z * nz) / HU; dlo = Math.min(dlo, d); dhi = Math.max(dhi, d); lo = Math.min(lo, ((c.x - px) * tx + (c.z - pz) * tz) * 144 / HU); } px = c.x; pz = c.z; }
    check('…jumping along it: as smooth (no bump at each step in the air)', dhi - dlo < .25 && lo > 200, `wobble ${(dhi - dlo).toFixed(2)} HU, lowest ${lo.toFixed(0)} HU/s`); }
  { const out = s => (s.x + s.z) / Math.SQRT2 / HU, a = 60 * Math.PI / 180, inp = { wish: [nx * Math.cos(a) + tx * Math.sin(a), nz * Math.cos(a) + tz * Math.sin(a)], weapon: 'knife' };
    const go = bx => { const s = at(2, -.5); let deep = Infinity; for (let i = 0; i < 128 * 4; i++) { moveStep(s, inp, { boxes: bx }, TICK); deep = Math.min(deep, out(s)); } return deep; };
    const ends = go(boxes.filter(b => b.minX < 10 * C - 1e-9)), door = go(boxes.filter(b => b.minX < 10 * C - 1e-9 || b.minX > 13 * C + 1e-9));
    const cor = { boxes: [...boxes, { minX: 10 * C, maxX: 10 * C + 50, minZ: -1000, maxZ: 1000, y0: 0, y1: 40 }] }, s = at(2, -.5), c = createMoveClock(); let px = 0, pz = 0, path = 0;
    for (let i = 0; i < 144 * 4; i++) { moveTicks(s, c, { ...inp, wish: [nx * Math.cos(1.36) + tx * Math.sin(1.36), nz * Math.cos(1.36) + tz * Math.sin(1.36)] }, cor, 1 / 144); if (i > 144 * 3) path += Math.hypot(c.x - px, c.z - pz) / HU; px = c.x; pz = c.z; }
    check('…where it ends you go round it, into a doorway in it you go in; into an inner corner you stop still', ends < -100 && door < -100 && path < .01, `${ends.toFixed(0)} · ${door.toFixed(0)} HU past its line, ${path.toFixed(3)} HU moved in the corner's last second`); }
  const flat = { boxes: [{ minX: 10, maxX: 20, minZ: -2000, maxZ: 100, y0: 0, y1: 40 }], bounds: null, ladders: [] }, f = at(0, 0); f.vx = f.vz = 0;
  for (let i = 0; i < 240; i++) moveFor(f, { wish: [Math.SQRT1_2, -Math.SQRT1_2], weapon: 'knife', look: [Math.SQRT1_2, -Math.SQRT1_2], pitch: 0 }, flat, 1 / 60);
  const fsp = Math.hypot(f.vx, f.vz) / HU; check('…a flat wall run into at 45° still takes the part into it away (Source)', fsp > 150 && fsp < 200, fsp.toFixed(0) + ' u/s');
  const end = { boxes: [{ minX: 10, maxX: 12, minZ: 0, maxZ: 60, y0: 0, y1: 40 }], bounds: null }, e = at(5, 1); moveFor(e, { wish: [1, 0], weapon: 'knife' }, end, 1.5);
  check('…pushing straight into a flat wall at its end never slides you round it', Math.abs(e.z - 1) < 1e-9 && Math.hypot(e.vx, e.vz) < 1e-9, `z ${e.z.toFixed(2)}`); }
// Ladders: a ladder on the north face of a wall 30 units tall, with a ledge (the wall's top) to step onto.
{ const wall = { minX: -10, maxX: 10, minZ: -12, maxZ: -2, y0: 0, y1: 30 }, ladder = { minX: -2, maxX: 2, minZ: -2.1, maxZ: -1.8, y0: 0, y1: 30 }, world = { boxes: [wall], bounds: null, ladders: [ladder] };
  const up = { wish: [0, -1], weapon: 'knife', look: [0, -1], pitch: .2 }, s = at(0, 0);
  run(s, up, world, .6); check('Ladder: walking into it climbs (no gravity)', s.y > 10 && s.onLadder, s.y.toFixed(1) + ' u');
  const climbRate = (() => { const a = at(0, -.7); a.y = 5; a.onGround = false; run(a, up, world, .25); const y0 = a.y; run(a, up, world, .25); return (a.y - y0) / .25 / HU; })();
  check('Ladder: climbs at 200 HU/s', Math.abs(climbRate - 200) < 8, climbRate.toFixed(0));
  const h = at(0, -.7); h.y = 12; h.onGround = false; run(h, { wish: [0, 0], weapon: 'knife', look: [0, -1], pitch: 0 }, world, .5); check('Ladder: letting go of the keys, you hold on (no fall)', Math.abs(h.y - 12) < .01, h.y.toFixed(2));
  const d = at(0, -.7); d.y = 20; d.onGround = false; run(d, { ...up, pitch: -.8 }, world, 3); check('Ladder: forward while looking down climbs down to the floor', d.y === 0 && d.onGround, d.y.toFixed(2));
  const t = at(0, -.7); for (let k = 0; k < 400 && !(t.onGround && t.y > 1); k++) moveStep(t, up, world, dt); check('Ladder: at the top, the same push steps onto the ledge', t.onGround && t.y === 30 && t.z < -2, 'y ' + t.y.toFixed(1) + ' z ' + t.z.toFixed(2));
  const j = at(0, -.7); j.y = 15; j.onGround = false; moveStep(j, { wish: [0, 0], weapon: 'knife', look: [0, -1], pitch: 0, jump: true }, world, dt); check('Ladder: jumping pushes you off backwards', j.vz > 0 && !j.onLadder, j.vz.toFixed(1));
  const g = at(0, 0); run(g, { wish: [0, -1], weapon: 'knife', look: [0, -1], pitch: -.8 }, world, .5); check('Ladder: on the floor, looking down, you just walk (no digging in)', g.y === 0, g.y.toFixed(2)); }
// A ladder up a wall that goes on over its top, with CS2's clip over the ladder's top in the game's coarse columns
// (round the climber's head) and a ledge beside it: at the top, strafing steps off sideways onto the ledge; a wall
// beside the ladder still stops a strafe, and the wall behind it is never climbed through.
{ const wall = { minX: -20, maxX: 20, minZ: -12, maxZ: -2, y0: 0, y1: 60 }, clip = { minX: -3, maxX: 3, minZ: -2.1, maxZ: .3, y0: 28, y1: 60 }, ledge = { minX: 4, maxX: 12, minZ: -2, maxZ: 6, y0: 0, y1: 28 }, side = { minX: -7, maxX: -5, minZ: -2, maxZ: 6, y0: 0, y1: 60 };
  const ladder = { minX: -2, maxX: 2, minZ: -2.1, maxZ: -1.8, y0: 0, y1: 31 }, world = { boxes: [wall, clip, ledge, side], bounds: null, ladders: [ladder] }, up = { wish: [0, -1], weapon: 'knife', look: [0, -1], pitch: .3 };
  const s = at(0, -.6); for (let k = 0; k < 64 * 4 && s.y < 29.5; k++) moveStep(s, up, world, dt);
  const r = { ...s }; for (let k = 0; k < 64 * 1.5 && !(r.onGround && !r.onLadder && r.x > 3 + MOVE.radius); k++) moveStep(r, { wish: [1, 0], weapon: 'knife', look: [0, -1], pitch: .3 }, world, dt); check('Ladder: under a clip over its top, strafing steps off onto the ledge beside it', r.onGround && r.y === 28 && r.x > 3 + MOVE.radius, `x ${r.x.toFixed(2)} y ${r.y.toFixed(2)}`);
  const l = { ...s }; run(l, { wish: [-1, 0], weapon: 'knife', look: [0, -1], pitch: .3 }, world, 1.5); check('Ladder: a wall beside it still stops the strafe', l.x >= -5 + MOVE.radius - 1e-6, l.x.toFixed(2));
  const f = { ...s }; run(f, up, world, 1.5); check('Ladder: pushing on at the top never goes through the wall behind it', f.z > -2 + MOVE.radius - .35, f.z.toFixed(2)); }
// Tagging (CS): hit while running, you are at half speed at once, and back to full about 1.25 s later.
{ const t = createMoveState(0), inp = { wish: [1, 0], weapon: 'ak' }, top = maxSpeed('ak'); moveFor(t, inp, null, 1); check('Tagging: running at the AK\'s top speed first', Math.abs(Math.hypot(t.vx, t.vz) - top) < top * .02);
  tag(t); moveFor(t, inp, null, 1 / 64); const v0 = Math.hypot(t.vx, t.vz); check('Tagging: a hit halves your speed at once', v0 <= top * (TAG.hit + .02), (v0 / top).toFixed(2));
  moveFor(t, inp, null, .5); const v1 = Math.hypot(t.vx, t.vz); check('Tagging: half a second later still slowed', v1 < top * .75 && v1 > v0, (v1 / top).toFixed(2));
  moveFor(t, inp, null, 1); check('Tagging: full speed again after ~1.25 s', Math.abs(Math.hypot(t.vx, t.vz) - top) < top * .03 && t.velMod === 1); }
// ── CS2 speeds for every weapon (weapons.vdata m_flMaxSpeed, kept in weapons-data.js), diagonal keys ──────────────────
const T = TICK, idle = { wish: [0, 0], weapon: 'knife' }, ticks = (s, input, world, n) => { for (let i = 0; i < n; i++) moveStep(s, input, world, T); return s; };
{ const all = [...WEAPONS, ...GRENADES, C4], bad = all.filter(w => Math.round(maxSpeed(w.id) / HU) !== w.speed);
  check('Every gun, grenade and the bomb runs at its own speed (no 250 HU/s fallback)', !bad.length && all.length > 30, bad.map(w => w.id + ' ' + Math.round(maxSpeed(w.id) / HU) + '≠' + w.speed).join(', ') || all.length + ' ids');
  const r = id => hu(run(at(), { ...fwd, weapon: id }, open, 2)), ids = ['negev', 'sg553', 'galil', 'mp7', 'ump45', 'usps', 'he', 'c4'];
  check('Running with it: Negev 150, SG 553 210, Galil 215, MP7 220, UMP-45 230, USP-S 240, HE 245, C4 250 (CS2)', ids.map(r).join(' ') === '150 210 215 220 230 240 245 250', ids.map(r).join(' '));
  check('Scoped: AUG and SG 553 150, AWP 100, SSG 08 230 (CS2 m_flMaxSpeed, scoped)', [['aug', 150], ['sg553', 150], ['sniper', 100], ['ssg08', 230]].every(([id, v]) => Math.round(maxSpeed(id, true) / HU) === v && hu(run(at(), { ...fwd, weapon: id, scoped: true }, open, 2)) === v));
  check('Diagonal keys (W+D) are no faster than one key (Source normalises the wish)', hu(run(at(), { wish: [1, -1], weapon: 'knife' }, open, 2)) === 250); }
// ── The fixed-tick clock (moveTicks): presses kept until their tick, none buffered in the air, bounded catch-up, drawn between ticks ──
{ const s = at(), c = createMoveClock(), inp = { wish: [0, 0], weapon: 'knife', jump: false }; moveTicks(s, c, inp, open, T * 4.5, 1);
  pressJump(c, 1 + T * .2); moveTicks(s, c, inp, open, T, 1 + T);   // down and up again within the half tick after the last one (the key is up at the frame)
  check('Clock: a press shorter than a tick is never lost (it jumps in the tick it falls in)', !s.onGround && s.vy > 0, 'vy ' + (s.vy / HU).toFixed(0)); }
{ const s = at(), c = createMoveClock(), inp = { wish: [0, 0], weapon: 'knife', jump: false }; let now = 0, lands = 0; const frame = d => { now += d; moveTicks(s, c, inp, open, d, now); lands += c.landed; };
  pressJump(c, 0); frame(1 / 60); const notes = []; for (let k = 0; k < 10; k++) notes.push(.70 + k * .015);   // a wheel scroll: 10 notches 15 ms apart, across the landing (~0.765 s)
  while (now < 2.5) { while (notes.length && notes[0] <= now + 1 / 60) pressJump(c, notes.shift()); frame(1 / 60); }
  check('Clock: a wheel scroll across a landing jumps exactly once more (notches in the air are spent there)', lands === 2 && s.onGround, lands + ' jumps (landings)'); }
{ const s = at(), c = createMoveClock(), inp = { wish: [0, 0], weapon: 'knife', jump: true }; let now = 0, jumps = 0, was = true; pressJump(c, 0);
  for (let i = 0; i < 300; i++) { now += 1 / 100; moveTicks(s, c, inp, open, 1 / 100, now); if (was && !s.onGround) jumps++; was = s.onGround; }
  check('Clock: holding the key after a press: one jump only', jumps === 1, jumps + ' jumps in 3 s'); }
{ const s = at(), c = createMoveClock(); moveTicks(s, c, { ...fwd, weapon: 'knife' }, open, 30); const n = c.ticks; moveTicks(s, c, { ...fwd, weapon: 'knife' }, open, 1 / 60);
  check('Clock: a 30 s stall (laptop asleep) runs at most ' + MAX_TICKS + ' ticks, with no backlog after', n === MAX_TICKS && c.ticks - n <= 3, n + ' then ' + (c.ticks - n) + ' ticks'); }
{ const s = at(), c = createMoveClock(), inp = { wish: [1, 0], weapon: 'knife' }; let prev = 0, mono = true, lo = Infinity, hi = 0;
  for (let i = 0; i < 480; i++) { moveTicks(s, c, inp, open, 1 / 240); const d = (c.x - prev) * 240 / HU; if (d < -1e-9) mono = false; if (i > 240) { lo = Math.min(lo, d); hi = Math.max(hi, d); } prev = c.x; }
  check('Clock: drawn between ticks — at 240 fps (128 ticks a second) the view moves evenly every frame', mono && lo > 249 && hi < 251 && c.x <= s.x + 1e-12, `${lo.toFixed(1)}–${hi.toFixed(1)} HU/s`); }
// ── Jumping (Source: no step-up in the air), crouch-jumps, ducking ──────────────────────────────────────────────────
{ const box = { minX: -50, maxX: 50, minZ: -100, maxZ: -10, y0: 0, y1: 30 * HU }, s = at(0, -10 + MOVE.radius + .05); let early = false;
  moveStep(s, { wish: [0, -1], weapon: 'knife', jump: true }, { boxes: [box] }, T);
  for (let i = 0; i < 128 && !(s.onGround && s.y > 0); i++) { moveStep(s, { wish: [0, -1], weapon: 'knife' }, { boxes: [box] }, T); if (s.z < -10 + MOVE.radius - 1e-9 && s.y < box.y1 - 1e-9) early = true; }
  check('No step-up in the air: jumping at a 30 HU box you are over it only once your feet clear its top', !early && s.onGround && Math.abs(s.y - box.y1) < 1e-9, 'y ' + (s.y / HU).toFixed(1)); }
// …nor coming down (TryPlayerMove in the air stops at a side): run-and-jumps at a 40, 50 or 54 HU block from 0–200 HU
// in front of it (the far ones reach its edge falling, the feet a few HU under its top), and walking off a 100 HU ledge
// toward a 90 HU block 4–20 units on: over a block's edge only with the feet over its top (they used to pop up ~18 HU).
{ let early = 0, ons = 0;
  for (const hHU of [40, 50, 54]) { const top = hHU * HU, box = { minX: -50, maxX: 50, minZ: -400, maxZ: -10, y0: 0, y1: top };
    for (let d = 0; d <= 200; d += 4) { const s = at(0, -10 + MOVE.radius + d * HU); s.vz = -maxSpeed('knife'); moveStep(s, { wish: [0, -1], weapon: 'knife', jump: true }, { boxes: [box] }, TICK);
      for (let i = 0; i < 256 && !s.onGround; i++) { const zb = s.z, yb = s.y; moveStep(s, { wish: [0, -1], weapon: 'knife' }, { boxes: [box] }, TICK); const e = -10 + MOVE.radius - 1e-9; if (s.z < e && (s.y < top - 1e-9 || zb >= e && yb < top - 1e-9)) early++; } if (s.y === top) ons++; } }
  for (let d = 4; d <= 20; d += 2) { const ledge = { minX: -50, maxX: 50, minZ: 0, maxZ: 50, y0: 0, y1: 100 * HU }, blk = { minX: -50, maxX: 50, minZ: -100, maxZ: -d, y0: 0, y1: 90 * HU }, s = Object.assign(createMoveState(100 * HU), { x: 0, z: 1 });
    s.vz = -maxSpeed('knife'); for (let i = 0; i < 256; i++) { const zb = s.z, yb = s.y; moveStep(s, { wish: [0, -1], weapon: 'knife' }, { boxes: [ledge, blk] }, TICK); const e = -d + MOVE.radius - 1e-9; if (s.z < e && (s.y < blk.y1 - 1e-9 || zb >= e && yb < blk.y1 - 1e-9)) early++; } }
  check('…nor coming down: jumps reaching a block\'s edge falling, and a drop past a 90 HU block, never pop up onto it', !early && ons > 60, `${early} ticks over an edge below its top, ${ons} landings on top`); }
// …but the maps' ramps and stairs (staircases of 16 HU columns, risers under a step) never catch a jump: running up a
// 20° or 33° ramp, or stairs of 8 or 12 HU risers, a jump at any moment keeps the run's pace (CS2's smooth ramps and
// clipped stairs; no step at all in the air stopped such a jump dead at a riser).
{ const C = 16 * HU, ramp = rise => { const b = []; for (let k = 0; k < 300; k++) b.push({ minX: -50, maxX: 50, minZ: -(k + 1) * C, maxZ: -k * C, y0: 0, y1: rise(k) }); return b; }; let worst = Infinity;
  for (const boxes of [ramp(k => Math.floor(k * 16 * Math.tan(20 * Math.PI / 180) * 1e3) / 1e3 * HU), ramp(k => Math.floor(k * 16 * Math.tan(33 * Math.PI / 180) * 1e3) / 1e3 * HU), ramp(k => k * 8 * HU), ramp(k => k * 12 * HU)])
    for (let j = 0; j < 30; j++) { const s = at(0, -.1); for (let i = 0; i < 128 * 2.2; i++) { moveStep(s, { wish: [0, -1], weapon: 'knife', jump: i === 128 + j * 3 }, { boxes }, TICK); if (i > 128 + j * 3) worst = Math.min(worst, -s.vz / HU); } }
  check('…but ramps and stairs never catch a jump up them: the run\'s pace is kept (20° and 33° ramps, 8 and 12 HU risers)', worst > 200, `lowest ${worst.toFixed(0)} HU/s`); }
// …and a step's top is got onto in the air only with head room over it (Source's step traces up first): jumping at a
// 16 HU block under a ceiling 60 HU over it, the body never comes down on it with its head in the ceiling.
{ const blk = { minX: -50, maxX: 50, minZ: -100, maxZ: -10, y0: 0, y1: 16 * HU }, ceil = { minX: -50, maxX: 50, minZ: -100, maxZ: -10, y0: 76 * HU, y1: 200 * HU }, w = { boxes: [blk, ceil] }; let bad = 0;
  for (const d of [0, 1, 2, 3, 4, ...Array.from({ length: 41 }, (_, i) => 165 + i)]) { const s = at(0, -10 + MOVE.radius + d * HU); s.vz = -maxSpeed('knife'); moveStep(s, { wish: [0, -1], weapon: 'knife', jump: true }, w, TICK);
    for (let i = 0; i < 256; i++) { const air = !s.onGround; moveStep(s, { wish: [0, -1], weapon: 'knife' }, w, TICK); if (air && s.z < -10 + MOVE.radius - 1e-9 && s.y + MOVE.height > ceil.y0 + 1e-9) bad++; if (!air) break; } }
  check('…and onto a step\'s top in the air only with head room: never on a 16 HU block with the head in a ceiling 60 HU over it', !bad, bad + ' ticks'); }
// Reach: run (250 HU/s) at a block and jump 0–48 HU in front of it; crouch pressed after take-off. CS: ~57 HU plain (the
// apex, 301.993² / 1600 = 57.0), ~66 crouch-jumping (+9 HU of tucked feet), never a standing player's 72.
const reach = (hHU, duck, fps) => { const top = hHU * HU, box = { minX: -50, maxX: 50, minZ: -400, maxZ: -10, y0: 0, y1: top };
  for (let d = 0; d <= 48; d += 4) { const s = at(0, 6); s.vz = -maxSpeed('knife'); const c = createMoveClock(); let jumped = false, on = false;
    for (let i = 0; i < fps * 1.5 && !on; i++) { if (!jumped && s.z < -10 + MOVE.radius + d * HU) { jumped = true; pressJump(c, NaN); } moveTicks(s, c, { wish: [0, -1], weapon: 'knife', duck: duck && jumped && (!s.onGround || s.ducked) }, { boxes: [box] }, 1 / fps); on = s.onGround && Math.abs(s.y - top) < 1e-9; }
    if (on) return true; } return false; };
{ const rows = [60, 128, 240].map(fps => [reach(56, false, fps), !reach(58, false, fps), reach(65, true, fps), !reach(67, true, fps), !reach(72, true, fps)]);
  check('Jump reach at 60/128/240 fps: a 56 HU ledge yes, 58 no; crouch-jumping 65 yes, 67 no, 72 (a standing head) never', rows.every(r => r.every(Boolean)), JSON.stringify(rows)); }
{ let peak = 0; const s = at(); moveStep(s, { weapon: 'knife', jump: true }, open, T); let t = T; while (!s.onGround && t < 2) { moveStep(s, idle, open, T); peak = Math.max(peak, s.y); t += T; }
  const c = at(); moveStep(c, { weapon: 'knife', jump: true }, open, T); ticks(c, idle, open, 6); const y0 = c.y; moveStep(c, { ...idle, duck: true }, open, T); const lifted = c.dy, y1 = c.y; let cpeak = 0; while (!c.onGround) { moveStep(c, { ...idle, duck: true }, open, T); cpeak = Math.max(cpeak, c.y); }
  check('Jump: peaks at 57.0 HU (the exact parabola), lands after 0.755 s', Math.abs(peak / HU - 57) < .05 && Math.abs(t - .755) <= T, (peak / HU).toFixed(2) + ' HU, ' + t.toFixed(3) + ' s');
  check('Crouch in the air: the feet tuck up 9 HU at once (crouch-jump peak 66), crouched, and land so', Math.abs(lifted / HU - 9) < 1e-9 && y1 - y0 > 9 * HU && Math.abs(cpeak / HU - 66) < .1 && c.ducked && c.y === 0 && !c.lift, `+${(lifted / HU).toFixed(1)} HU, peak ${(cpeak / HU).toFixed(2)}`); }
{ const s = at(); moveStep(s, { weapon: 'knife', jump: true }, open, T); ticks(s, { ...idle, duck: true }, open, 20); ticks(s, idle, open, 1); const back = -s.dy;
  check('…letting go in the air: the feet go back down 9 HU (room below), standing again', !s.ducked && Math.abs(back / HU - 9) < 1e-9, (back / HU).toFixed(2) + ' HU'); }
{ const s = at(); let t = 0; while (!s.ducked && t < 1) { moveStep(s, { ...idle, duck: true }, open, T); t += T; }
  const p = at(); for (let i = 0; i < 4; i++) { ticks(p, { ...idle, duck: true }, open, 13); ticks(p, idle, open, 13); } let t2 = 0; while (!p.ducked && t2 < 2) { moveStep(p, { ...idle, duck: true }, open, T); t2 += T; }
  check('Ducking takes 1/8 s (approximation: CS:GO\'s duck speed 8); the eye goes 64 → 46 HU with it', Math.abs(t - .125) <= .02 && Math.abs(eyeAt(0) - EYE_GD.stand) < 1e-9 && Math.abs(eyeAt(1) / HU - 46) < 1e-9, t.toFixed(3) + ' s');
  check('Crouch spam: a fifth press within a second takes at least twice as long to get down', t2 >= 2 * t, t2.toFixed(3) + ' s'); }
{ const ceil = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, y0: 60 * HU, y1: 100 * HU }, s = at(); ticks(s, { ...idle, duck: true }, { boxes: [ceil] }, 32); ticks(s, idle, { boxes: [ceil] }, 64);
  check('Under a 60 HU ceiling, letting go of crouch keeps you down', s.ducked && s.duck === 1); }
{ const s = at(); let lands = 0; moveStep(s, { weapon: 'knife', jump: true }, open, T); for (let i = 0; i < 256; i++) { moveStep(s, idle, open, T); if (s.landed) { lands++; s.landed = 0; } }
  check('One jump, one landing', lands === 1, lands); }
// ── Stairs: exactly-18 HU risers (heights converted from HU) are steps — up all of them, down without leaving the ground ──
{ const C = 16 * HU, up = [], dn = []; for (let k = 0; k < 20; k++) { up.push({ minX: -20, maxX: 20, minZ: -1e3, maxZ: -(k + 1) * C, y0: 0, y1: (k + 1) * 18 * HU }); dn.push({ minX: -20, maxX: 20, minZ: -(k + 1) * C, maxZ: 1e3, y0: 0, y1: (20 - k) * 18 * HU }); }
  const a = at(); ticks(a, { wish: [0, -1], weapon: 'knife' }, { boxes: up }, 128 * 3);
  check('Stairs of exactly 18 HU risers: walked up, all 20 (a step, not a wall)', Math.abs(a.y - 20 * 18 * HU) < 1e-6, (a.y / HU / 18).toFixed(2) + ' steps');
  const b = Object.assign(createMoveState(20 * 18 * HU), { x: 0, z: 5 }); let air = 0, lb = 0; for (let i = 0; i < 128 * 3; i++) { moveStep(b, { wish: [0, -1], weapon: 'knife' }, { boxes: dn }, T); if (b.landed) { lb++; b.landed = 0; } if (!b.onGround) air++; }
  check('…and down: never airborne, no landings (no landing sound, stamina or air inaccuracy)', b.y === 0 && air === 0 && lb === 0, `landings ${lb}, airborne ticks ${air}`); }
// ── Falls (approximation of CS:GO: hurts above 580 HU/s — a ~210 HU drop — 100 HP at 1024) and the host's check ──────────
{ const drop = h => { const s = createMoveState(h * HU); s.x = s.z = 0; s.onGround = false; for (let i = 0; i < 128 * 3 && !s.landed; i++) moveStep(s, idle, open, T); return s.landSpeed; };
  const a = drop(150), b = drop(400), f = drop(700);
  check('Landing speed: a 150 HU drop lands safe, 400 HU hurts, 700 HU kills', a < FALL.safe && b > FALL.safe && fallDamage(a) === 0 && fallDamage(b) >= 45 && fallDamage(f) >= 100, `${a.toFixed(0)} · ${b.toFixed(0)} (${fallDamage(b)} HP) · ${f.toFixed(0)} HU/s`);
  check('Fall damage: 0 under 580 HU/s, ~50 at 800, 100 at 1024', fallDamage(579) === 0 && fallDamage(800) === 50 && fallDamage(1024) === 100);
  const st = {}; fallCheck(st, { n: 0, v: 0 }, 400 * HU, 0); for (let t = 33; t < 1000; t += 33) fallCheck(st, { n: 0, v: 0 }, Math.max(0, 400 - 400 * (t / 1000) ** 2) * HU, t);
  const hit = fallCheck(st, { n: 1, v: b }, 0, 1033), spoof = fallCheck(st, { n: 2, v: 1500 }, 0, 1066), same = fallCheck(st, { n: 2, v: 1500 }, 0, 1100);
  check('Host: a hard landing after the drop it saw hurts; a claimed one with no drop, or the same one again, does not', hit === fallDamage(b) && spoof === 0 && same === 0, `${hit} · ${spoof} · ${same}`); }
// ── Boosting: CS2 player collision (32 × 72 HU, 54 crouched) — standing on team mates ──────────────────────────────────
const top = () => Object.assign(createMoveState(MOVE.height), { x: 0, z: 0 }), counted = (s, input, world, n, f) => { let lands = 0, off = 0; for (let i = 0; i < n; i++) { moveStep(s, input, world, T); if (s.landed) { lands++; s.landed = 0; } if (!s.onGround) off++; f?.(i); } return { lands, off }; };
{ const r = []; for (const d of [.5, 8, 17]) { const s = top(), o = { x: .3, z: 0, y: 0 }; ticks(s, idle, { others: [o] }, 4); o.y = d * HU; const k = counted(s, idle, { others: [o] }, 64); r.push(Math.abs(s.y - MOVE.height - d * HU) < 1e-9 && s.onGround && !k.lands && !k.off); }
  check('On a head: the support steps up 0.5, 8 or 17 HU (stairs) — you go up with it, never through it, no landings', r.every(Boolean), JSON.stringify(r)); }
{ const s = top(), o = { x: .3, z: 0, y: 0 }, w = { others: [o] }; ticks(s, idle, w, 4); o.ducked = true; const a = counted(s, idle, w, 32), low = s.y; o.ducked = false; const b = counted(s, idle, w, 32);
  check('…it crouches: you go down to 54 HU with it; it stands: you go back up to 72 (no landings, never in the air)', Math.abs(low - MOVE.duckHeight) < 1e-9 && Math.abs(s.y - MOVE.height) < 1e-9 && !a.lands && !b.lands && !a.off && !b.off, `${(low / HU).toFixed(1)} → ${(s.y / HU).toFixed(1)} HU`); }
{ const s = top(), o = { x: .3, z: 0, y: 0 }, w = { others: [o] }, ys = []; const k = counted(s, idle, w, 128 * 5, () => ys.push(s.y));
  check('…standing still on it for 5 s: no bounce, no sinking, no landing events', Math.max(...ys) - Math.min(...ys) < 1e-12 && !k.lands && !k.off && Math.abs(s.y - MOVE.height) < 1e-12); }
{ const s = top(), o = { x: 0, z: 0, y: 0 }, w = { others: [o] }; let x0 = s.x, carried = false, fell = null; const k = counted(s, idle, w, 128, i => { o.x += 250 * HU * T; if (s.onGround && s.y > 1 && s.x !== x0) carried = true; if (fell === null && s.y < MOVE.height - 1e-6) fell = o.x; });
  check('…it walks away: you are not carried (CS2), you drop once it is 32 HU off, and land once', !carried && s.y === 0 && k.lands === 1 && fell >= PW && fell - PW < 250 * HU * T * 3, `fell at ${(fell / HU).toFixed(1)} HU apart, ${k.lands} landing`); }
{ for (const why of ['dies', 'disconnects']) { const s = top(), w = { others: [{ x: .3, z: 0, y: 0 }] }; ticks(s, idle, w, 8); w.others = why === 'dies' ? [] : [null]; const k = counted(s, idle, w, 128);
  check(`…it ${why}: you fall cleanly to the floor, one landing`, s.y === 0 && s.onGround && k.lands === 1, k.lands + ' landing(s)'); } }
{ const s = top(), o = { x: .3, z: 0, y: 0 }, w = { others: [o] }; let vy = MOVE.jump, inside = false, over = false, lands = 0; ticks(s, idle, w, 4);
  for (let i = 0; i < 160; i++) { const v0 = vy; vy -= MOVE.gravity * T; o.y = Math.max(0, o.y + (v0 + vy) / 2 * T); if (o.y === 0) vy = 0; moveStep(s, idle, w, T); if (s.landed) { lands++; s.landed = 0; } if (s.y < o.y + MOVE.height - 1e-6) inside = true; if (s.y > o.y + MOVE.height + 1e-6) over = true; } const k = { lands };
  check('…it jumps (a late position: it can\'t in its own game with you on it): you are never inside it, nor launched', !inside && !over && Math.abs(s.y - MOVE.height) < 1e-9 && !k.lands, `y ${(s.y / HU).toFixed(1)}`); }
{ const s = top(), w = { others: [{ x: 0, z: 0, y: 0 }] }; ticks(s, idle, w, 4); const k = counted(s, { wish: [1, 0], weapon: 'knife', walk: true }, w, 128, i => {});
  check('…you stay on a head until the centres are 32 HU apart (CS2\'s hull), then step off', s.y === 0 && k.lands === 1, 'x ' + (s.x / HU).toFixed(1)); }
// Lockstep: every body moves each tick, seeing the others where they were (as over the network, without the delay).
const lockstep = (bodies, inputs, n, world = {}, each) => { const snap = bodies.map(() => ({ x: 0, y: 0, z: 0, ducked: false })), lands = bodies.map(() => 0);
  for (let t = 0; t < n; t++) { bodies.forEach((b, i) => Object.assign(snap[i], { x: b.x, y: b.y, z: b.z, ducked: b.ducked }));
    bodies.forEach((b, i) => { moveStep(b, typeof inputs[i] === 'function' ? inputs[i](t) : inputs[i], { ...world, others: snap.filter((_, j) => j !== i) }, T); if (b.landed) { lands[i]++; b.landed = 0; } }); each?.(t, snap); } return lands; };
{ const A = at(0, 0), B = Object.assign(createMoveState(MOVE.height), { x: .2, z: 0 }), Cc = Object.assign(createMoveState(2 * MOVE.height), { x: -.2, z: .1 }); let bad = false;
  const lands = lockstep([A, B, Cc], [t => ({ ...idle, duck: t >= 64 && t < 192 }), idle, idle], 128 * 5, {}, (t, sn) => { if (B.y < sn[0].y + (sn[0].ducked ? MOVE.duckHeight : MOVE.height) - 1e-6 || Cc.y < sn[1].y + MOVE.height - 1e-6) bad = true; if (t === 150) bad ||= Math.abs(Cc.y - MOVE.duckHeight - MOVE.height) > 1e-9; });
  check('Three high: the bottom one crouches and stands — the stack goes down 18 HU and back up, nobody inside anybody, no landings, still after 5 s', !bad && lands.every(n => !n) && Math.abs(Cc.y - 2 * MOVE.height) < 1e-9 && B.onGround && Cc.onGround, `top at ${(Cc.y / HU).toFixed(1)} HU, landings ${lands}`); }
{ const A = Object.assign(at(0, 0), { ducked: true, duck: 1 }), B = Object.assign(createMoveState(MOVE.duckHeight), { x: .3, z: 0 }), ceil = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, y0: (54 + 72 + 6) * HU, y1: 200 * HU };
  let poke = false; lockstep([A, B], [t => ({ ...idle, duck: t < 32 }), idle], 256, { boxes: [ceil] }, () => { if (B.y + MOVE.height > ceil.y0 + 1e-9) poke = true; });
  const C = Object.assign(createMoveState(MOVE.duckHeight), { x: 0, z: 0 }), o = { x: .3, z: 0, y: 0, ducked: true }; ticks(C, idle, { boxes: [ceil], others: [o] }, 8); o.ducked = false; ticks(C, idle, { boxes: [ceil], others: [o] }, 32);
  check('Low ceiling: with no room over the one on top, the support stays crouched — and a support standing anyway never pushes you into the ceiling', A.ducked && !poke && Math.abs(B.y - MOVE.duckHeight) < 1e-9 && C.y + MOVE.height <= ceil.y0 + 1e-9, `support ducked ${A.ducked}, top at ${(B.y / HU).toFixed(1)} · ${(C.y / HU).toFixed(1)} HU`); }
{ const A = Object.assign(at(0, 0), { ducked: true, duck: 1 }), B = Object.assign(createMoveState(MOVE.duckHeight), { x: .2, z: 0 }), Cc = Object.assign(createMoveState(MOVE.duckHeight + MOVE.height), { x: -.2, z: .1 }), ceil = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, y0: (54 + 72 + 72 + 6) * HU, y1: 400 * HU };
  let worst = 0; lockstep([A, B, Cc], [t => ({ ...idle, duck: t < 32 }), idle, idle], 256, { boxes: [ceil] }, () => { worst = Math.max(worst, (B.y + MOVE.height - Cc.y) / HU, (A.y + (A.ducked ? MOVE.duckHeight : MOVE.height) - B.y) / HU); });
  check('…three high under it: with no room over the top one (only over the middle), the bottom one stays crouched — nobody pushed into anybody', A.ducked && worst < 1e-6 && Math.abs(Cc.y - (54 + 72) * HU) < 1e-9, `overlap ${worst.toFixed(1)} HU, bottom ducked ${A.ducked}`); }
{ const A = at(0, 0), B = Object.assign(createMoveState(MOVE.height), { x: .3, z: 0 }); let through = false;
  lockstep([A, B], [t => ({ ...idle, jump: t === 10 }), idle], 128, {}, () => { if (A.y > 1e-9 || B.y < A.y + MOVE.height - 1e-9) through = true; });
  check('The one underneath can\'t jump through the one standing on them (they bump their head)', !through && A.onGround && Math.abs(B.y - MOVE.height) < 1e-9); }
// Getting on: a crouched team mate (54 HU) can be jumped onto, a standing one (72) can't, even crouch-jumping.
const mount = (ducked, crouchJump) => { for (let d = 0; d <= 48; d += 4) { const s = at(0, PW + 3), o = { x: 0, z: 0, y: 0, ducked }, c = createMoveClock(); s.vz = -maxSpeed('knife'); let jumped = false;
  for (let i = 0; i < 128 * 1.5; i++) { if (!jumped && s.z < PW + d * HU) { jumped = true; pressJump(c, NaN); } moveTicks(s, c, { wish: [0, -1], weapon: 'knife', duck: crouchJump && jumped && (!s.onGround || s.ducked) }, { others: [o] }, T); if (s.onGround && s.y > 1) return true; } } return false; };
check('Boost: a crouched team mate can be jumped onto; a standing one can\'t, not even crouch-jumping', mount(true, false) && !mount(false, false) && !mount(false, true));
{ const s = at(1, 0), o = { x: 0, z: 0, y: 0 }; let pop = false; for (let i = 0; i < 256; i++) { moveStep(s, { ...idle, jump: i === 2 }, { others: [o] }, T); if (s.onGround && s.y > 1) pop = true; }
  const d = at(PW - 1, 0); let near = Infinity; for (let i = 0; i < 128; i++) { moveStep(d, { wish: [-1, 0], weapon: 'knife' }, { others: [o] }, T); near = Math.min(near, Math.hypot(d.x, d.z)); }
  check('Spawned inside someone: jumping never pops you onto their head, and walking at their middle never gets closer (only out)', !pop && near >= PW - 1 - 1e-9, `closest ${(near / HU).toFixed(1)} HU`); }
{ const s = at(PW + .3, 0), o = { x: 0, z: 0, y: 0 }; let ups = 0, vy = 0; for (let i = 0; i < 90; i++) { moveStep(s, { wish: [-1, 0], weapon: 'knife', jump: i % 6 === 0 }, { others: [o] }, T); if (s.vy > vy + 1e-9) ups++; vy = s.vy; }
  check('No jump resets against someone\'s side: pressing jump again in the air never jumps (nor gets you onto a standing head)', ups === 1 && s.y < MOVE.height, ups + ' jump(s)'); }
// The map's own body radius (package A's world.boxes.bodyRadius: trimmed CS2 maps) is honoured; players keep CS2's.
{ const boxes = Object.assign([{ minX: 10, maxX: 12, minZ: -50, maxZ: 50, y0: 0, y1: 40 }], { bodyRadius: 16 * HU }), s = at(0, 0); ticks(s, { wish: [1, 0], weapon: 'knife' }, { boxes }, 128);
  check('A map\'s own body radius (boxes.bodyRadius) is used against its walls', 10 - s.x >= 16 * HU - 1e-9 && 10 - s.x < 18 * HU, ((10 - s.x) / HU).toFixed(1) + ' HU from the wall'); }
// ── The host's pose check (lan/room.mjs): too fast is refused, bursts, spawns and announced teleports pass ───────────
{ const g = {}, v = 250 * HU; let t = 0, x = 0; poseGate(g, 0, 0, 0, 1000); const runs = []; for (let i = 0; i < 30; i++) { t += 33; x += v * .033; runs.push(poseGate(g, x, 0, t, 1000 + (i < 10 ? 0 : t))); }   // the first 10 arrive in one burst
  const fast = poseGate(g, x + 20, 0, t + 33, 1000 + t + 33), later = poseGate(g, x + 20, 0, t + 1500, 1000 + t + 1500), spawn = poseGate(g, 300, 300, t + 1533, 1000 + t + 1533, { x: 300.5, z: 299.8, at: 7 }), tp = poseGate(g, -200, 0, t + 1566, 1000 + t + 1566, null, 1);
  let hx = -200, kept = 0; t += 1566; for (let i = 0; i < 15; i++) { t += 33; hx += 3 * v * .033; if (poseGate(g, hx, 0, t, 1000 + t, null, 1)) kept++; } const hostRate = (g.x + 200) / (15 * .033) / HU;   // a 3× speed hack for half a second
  check('Host pose check: running (in a network burst too) passes; 20 units in 33 ms is refused, caught up later; a host spawn and an announced teleport pass; a 3× speed hack is held to 2×', runs.every(Boolean) && !fast && later && spawn && tp && kept < 15 && hostRate <= 2 * 250 + 60, JSON.stringify([runs.every(Boolean), fast, later, spawn, tp, kept, Math.round(hostRate)])); }
console.log((ok === n ? 'PASS' : 'FAIL') + ': arena movement · ' + ok + '/' + n); if (ok !== n) process.exitCode = 1;
