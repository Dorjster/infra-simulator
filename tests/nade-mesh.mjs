// Grenades on CS2's own triangles (tools/maps/nade-mesh.mjs → dist/nade-mesh.js → arena-nades.js stepNade): the
// mesh's contact and sight tests, and Source's grenade physics on it — a wall reflects the grenade at the same angle
// with 45 % of its speed, a floor stops it below 30 u/s, a wall 1 unit thin stops it (the 8-unit grid let such walls
// through), a slope throws it off along its own direction, sight passes what stops only grenades (a fence), and the
// arc under gravity is the exact parabola whatever the step.
import { buildNadeMesh } from '../tools/maps/nade-mesh.mjs';
import { createNadeMesh } from '../dist/nade-mesh.js';
import { stepNade, GRAVITY, BOUNCE } from '../dist/arena-nades.js';
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const near = (a, b, e) => Math.abs(a - b) <= e;
// Quads (two triangles each) → a mesh as the game reads it from a map file (the same arrays, the same views).
function meshOf(quads) {
  const T = [], see = []; for (const { p: [a, b, c, d], sight = 1 } of quads) { T.push(...a, ...b, ...c, ...a, ...c, ...d); see.push(sight, sight); }
  const { info, buf } = buildNadeMesh(new Float32Array(T), Uint8Array.from(see)), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), p4 = n => n + (4 - n % 4) % 4;
  let o = 0; const tri = new Uint16Array(ab, o, info.tris * 9); o += p4(info.tris * 18); const box = new Uint16Array(ab, o, info.nodes * 6); o += p4(info.nodes * 12); const links = new Uint32Array(ab, o, info.nodes * 2); o += info.nodes * 8;
  return createNadeMesh({ o: info.o, s: info.s, tri, box, links, sight: new Uint8Array(ab, o, info.tris) });
}
// Here the mesh's units are the game's (x, y up, z): the floor y = 0 over x, z in −500…500; a wall at x = 100 (1 unit
// thin: two faces 1 apart); a 45° slope; a fence (stops grenades, not sight) at z = −100.
const F = 500, M = meshOf([
  { p: [[-F, 0, -F], [F, 0, -F], [F, 0, F], [-F, 0, F]] },
  { p: [[100, 0, -F], [100, 0, F], [100, 300, F], [100, 300, -F]] }, { p: [[101, 0, -F], [101, 300, -F], [101, 300, F], [101, 0, F]] },
  { p: [[-300, 0, 200], [-300, 0, 300], [-200, 100, 300], [-200, 100, 200]] },
  { p: [[-F, 0, -100], [-150, 0, -100], [-150, 200, -100], [-F, 200, -100]], sight: 0 },
]);
const out = new Float64Array(4);
check('contact: a ball over the floor touches it, the way out straight up', M.contact(0, 3, 0, 4, out) && near(out[1], 1, 1e-3) && near(out[3], 1, .05), Array.from(out).map(v => v.toFixed(3)).join(','));
check('…and one well clear of everything touches nothing', !M.contact(0, 50, 0, 4, out));
check('contact at the wall\'s edge is round (an edge, not a face)', M.contact(105, 303, 0, 6, out) && out[0] > .3 && out[1] > .3, Array.from(out).map(v => v.toFixed(2)).join(','));
check('blocked: a line through the wall is', M.blocked(50, 50, 0, 150, 50, 0));
check('…a line beside it is not', !M.blocked(50, 50, 0, 90, 50, 0));
check('sight passes the fence, grenades do not', M.blocked(-300, 50, -50, -300, 50, -150) && !M.blocked(-300, 50, -50, -300, 50, -150, true));
// Grenades on it: the world's surfaces by the mesh, no doors, a big bound.
const boxes = { nadeMesh: M, movers: [] }, bounds = { minX: -F, maxX: F, minZ: -F, maxZ: F }, R = .35;
const fly = (g, s, dt = 1 / 64) => { for (let i = 0; i < s && !g.rest; i++) stepNade(g, boxes, bounds, dt); return g; };
// A wall hit at 45° (no gravity: the reflection alone): out at 45° the other way, 45 % of the speed.
{ const g = fly({ x: 60, y: 150, z: 0, vx: 40, vy: 0, vz: 40, grav: 1e-9, still: 0 }, 128), sp = Math.hypot(40, 40);
  check('a wall reflects it at the same angle', g.vx < 0 && near(-g.vx, g.vz, .02 * Math.abs(g.vz)), [g.vx.toFixed(2), g.vz.toFixed(2)].join(','));
  check('…keeping 45 % of its speed (Source: elasticity 0.45)', near(Math.hypot(g.vx, g.vz), sp * BOUNCE, .02 * sp), Math.hypot(g.vx, g.vz).toFixed(2) + ' of ' + (sp * BOUNCE).toFixed(2)); }
// A fast throw at the 1-unit wall: it never comes out on the far side.
{ let through = 0; for (let k = 0; k < 40; k++) { const g = fly({ x: 40, y: 20 + k * 5, z: -200 + k * 10, vx: 160 + k * 4, vy: 10, vz: 0, still: 0 }, 400); if (g.x > 101) through++; }
  check('a wall 1 unit thin stops every throw (fast ones too)', through === 0, through + ' of 40 through'); }
// Dropped on the floor: bounces lower each time and rests, R over the floor.
{ const g = fly({ x: 0, y: 30, z: 0, vx: 5, vy: 0, vz: 0, still: 0 }, 2000); check('on a floor it comes to rest, lying on it', g.rest && near(g.y, R, .02), g.y.toFixed(3) + ' rest ' + !!g.rest); }
// The slope (normal (−1, 1, 0)/√2): a grenade falling on it leaves along −x (downhill), not straight up.
{ const g = fly({ x: -250, y: 120, z: 250, vx: 0, vy: -30, vz: 0, grav: 1e-9, still: 0 }, 256); check('a slope throws it off its own way (downhill: a straight drop on 45° leaves level)', g.vx < -1 && g.vy > -1e-6, [g.vx.toFixed(2), g.vy.toFixed(2)].join(',')); }
// Players: a grenade thrown into someone bounces back off them at 0.45 × 0.3 of its speed; its thrower it passes.
{ const HU = 2.54 / 16.5, body = [{ name: 'Ann', x: 0, y: 0, z: 0 }, { name: 'Bo', x: 200, y: 0, z: 0 }];
  const g = { x: -100, y: 40 * HU, z: 0, vx: 60, vy: 0, vz: 0, grav: 1e-9, still: 0, by: 'Bo' }; for (let i = 0; i < 128; i++) stepNade(g, boxes, bounds, 1 / 64, body);
  check('a grenade bounces off a player at 30 % of its bounce', g.vx < 0 && near(-g.vx, 60 * BOUNCE * .3, .5), g.vx.toFixed(2));
  const h = { x: 150, y: 40 * HU, z: 0, vx: 60, vy: 0, vz: 0, grav: 1e-9, still: 0, by: 'Bo' }; for (let i = 0; i < 64; i++) stepNade(h, boxes, bounds, 1 / 64, body);
  check('…but never off its own thrower', h.vx === 60 && h.x > 200, h.x.toFixed(1)); }
// The arc: the same throw stepped at 1/64 s and at 1/20 s lands at the same height after 1 s (exact gravity).
{ const a = fly({ x: -400, y: 200, z: 0, vx: 30, vy: 20, vz: 0, still: 0 }, 64, 1 / 64), b = fly({ x: -400, y: 200, z: 0, vx: 30, vy: 20, vz: 0, still: 0 }, 20, 1 / 20), want = 200 + 20 - GRAVITY / 2;
  check('the arc is the exact parabola, whatever the step', near(a.y, want, 1e-6) && near(b.y, want, 1e-6), [a.y.toFixed(4), b.y.toFixed(4), want.toFixed(4)].join(' / ')); }
console.log((fail ? 'FAIL' : 'PASS') + ': grenades on CS2\'s triangles · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
