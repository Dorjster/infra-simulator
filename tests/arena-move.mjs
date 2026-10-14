// CS2-style arena movement (dist/arena-move.js): speeds per weapon, walk / crouch, friction stop, jump height,
// climbing low cover but not containers, walls, and the movement inaccuracy factor.
import { createMoveState, moveStep, moveSpread, maxSpeed, HU, MOVE } from '../dist/arena-move.js';
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
{ const s = run(at(), { ...fwd, weapon: 'knife' }, open, 2), v0 = hu(s); let jumps = 0; for (let t = 0; t < 3; t += dt) { if (s.onGround) jumps++; moveStep(s, { ...fwd, weapon: 'knife', jump: true }, open, dt); } check('Holding jump: stamina keeps bunny hops from gaining speed', hu(s) <= v0, v0 + ' → ' + hu(s) + ' after ' + jumps + ' jumps'); }
{ const s = run(at(0, 10), { ...fwd, weapon: 'knife' }, { boxes: [], others: [{ x: 0, z: 0, y: 0 }] }, 1); check('Another player blocks you', s.z > 2 * MOVE.radius - .01 && s.z < 3, s.z.toFixed(2)); }
{ const s = run(at(.5, 0), { ...fwd, weapon: 'knife' }, { boxes: [], others: [{ x: 0, z: 0, y: 0 }] }, 1); check('Spawned inside another player: you can walk out', s.z < -10, s.z.toFixed(2)); }
{ const s = run(at(10, 0), { wish: [-1, 0], weapon: 'knife' }, { boxes: [], others: [{ x: 0, z: 0, y: 0 }, { x: 0, z: 2.6, y: 0 }] }, 1); check('Two players side by side block like a wall', s.x > 2 * MOVE.radius - .01, s.x.toFixed(2)); }
{ const s = at(0, 0); s.y = MOVE.height + 6; s.onGround = false; run(s, { wish: [0, 0], weapon: 'knife' }, { boxes: [], others: [{ x: 0, z: 0, y: 0 }] }, 1); check('You can stand on another player’s head', s.onGround && Math.abs(s.y - MOVE.height) < 1e-6, s.y.toFixed(2)); }
const still = at(), runner = run(at(), { ...fwd, weapon: 'ak' }, open, 2), air = Object.assign(at(), { onGround: false });
check('Standing still is accurate', moveSpread(still, 'ak') === 1);
check('Running is inaccurate, the air far more', moveSpread(runner, 'ak') > 3 && moveSpread(air, 'ak') > moveSpread(runner, 'ak'), moveSpread(runner, 'ak').toFixed(2));
check('Walking is far more accurate than running', moveSpread(run(at(), { ...fwd, weapon: 'ak', walk: true }, open, 2), 'ak') < moveSpread(runner, 'ak') / 2);
// No bunny hopping: landing faster than 1.1× top speed (from air strafing), the next jump trims you to it.
{ const b = at(); b.vx = 0; b.vz = -400 * HU; moveStep(b, { wish: [0, -1], weapon: 'knife', jump: true }, open, dt); const sp = Math.hypot(b.vx, b.vz) / HU;
  check('No bunny hopping: a jump at 400 u/s leaves at 1.1× the knife\'s 250 (275)', Math.abs(sp - 275) < 3 && !b.onGround, sp.toFixed(0)); }
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
console.log((ok === n ? 'PASS' : 'FAIL') + ': arena movement · ' + ok + '/' + n); if (ok !== n) process.exitCode = 1;
