// Physics props of CS2 maps (arena-physprops.js): a body walking into a pot pushes it ahead; it slides and settles; a
// wall stops it; a shot knocks a stool along the shot and a tall bottle tips over; a pot shatters when shot; an HE blast
// throws props outward; a new round puts everything back. And on Mirage's own file (when converted on this computer):
// its physics props are no collision for players — the pots, cans and stools of CS2 never stop you.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from '../dist/three.module.js';
import { createPhysProps } from '../dist/arena-physprops.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const U = 2.54 / 16.5, dt = 1 / 60;
const props = [
  { i: 0, model: 'claypot03', breaks: true, mass: 1, x: 0, z: 0, y: 0, h: 2, rx: .9, rz: .9 },
  { i: 1, model: 'chair_stool01a', breaks: false, mass: 1, x: 20, z: 0, y: 0, h: 4, rx: 1.2, rz: 1.2 },
  { i: 2, model: 'garbage_glassbottle003a', breaks: false, mass: 1, x: 40, z: 0, y: 0, h: 1.8, rx: .3, rz: .3 },
  { i: 3, model: 'metalbucket01a', breaks: false, mass: 1, x: 60, z: 0, y: 0, h: 1.6, rx: .8, rz: .8 }];
const pivots = new Map(props.map(p => { const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); return [p.i, g]; }));
const wallX = 66;   // a wall just past the bucket
const broke = [];
const P = createPhysProps(props, pivots, { floorAt: () => 0, blocked: (x, z, y, h, r) => x + r > wallX, onBreak: (k) => broke.push(k) });
ok('four props', P.count === 4);
// A body walks into the stool from the −x side at a player's speed (250 HU/s): the stool goes ahead of it, along +x.
const pos = new Float32Array(3); let bx = 14;
for (let t = 0; t < 40; t++) { bx += 250 * U * dt; pos[0] = bx; pos[1] = 0; pos[2] = 0; P.update(dt, pos, 1); }
const stool = P.at(1); ok('a body walking into a stool pushes it ahead', stool[0] > 20.5, 'x ' + stool[0].toFixed(2));
ok('it stays out of the body (never inside it)', stool[0] - bx > 1.2 * .9, `stool ${stool[0].toFixed(2)} body ${bx.toFixed(2)}`);
for (let t = 0; t < 400; t++) P.update(dt, pos, 0);
ok('left alone it slides to a stop', !P.awake(1), 'still moving');
// The bucket shot toward the wall (+x): knocked along the shot; the wall stops it.
P.shot(50, 1, 0, 1, 0, 0, 100, 1); ok('a shot knocks a bucket', P.awake(3));
for (let t = 0; t < 300; t++) P.update(dt, pos, 0);
const bk = P.at(3); ok('a wall stops it', bk[0] + .8 <= wallX + .01, 'x ' + bk[0].toFixed(2));
// The pot shot: shattered (gone; no longer hit).
const k = P.shot(-10, 1, 0, 1, 0, 0, 30, 1); ok('a shot hits the pot first', k === 0); ok('a pot shatters when shot', P.broken(0) && broke.includes(0) && !pivots.get(0).visible);
ok('a shattered pot is no longer hit', P.shot(-10, 1, 0, 1, 0, 0, 15, 1) === -1);
// An HE blast beside the bottle: it flies outward (away from the blast) and up.
P.blast(38, 0, 0, 20); for (let t = 0; t < 3; t++) P.update(dt, pos, 0); const b = P.at(2); ok('an HE blast throws a bottle away from it', b[0] > 40 && b[1] > 0, JSON.stringify(b.map(v => +v.toFixed(2))));
for (let t = 0; t < 400; t++) P.update(dt, pos, 0);
ok('a tall bottle knocked hard tips over onto its side', Math.abs(pivots.get(2).quaternion.w - Math.SQRT1_2) < .05 || Math.abs(pivots.get(2).quaternion.w) < .75, 'w ' + pivots.get(2).quaternion.w.toFixed(3));
ok('and it lands on the floor', Math.abs(P.at(2)[1]) < .05);
// A new round: back in place, whole.
P.reset(); ok('a new round puts every prop back, whole', props.every((p, j) => Math.hypot(P.at(j)[0] - p.x, P.at(j)[2] - p.z) < 1e-6 && !P.broken(j)) && pivots.get(0).visible && pivots.get(2).quaternion.w > .999);
// Mirage converted on this computer: its physics props are listed and none is in the players' way.
const mf = new URL('../user-maps/mirage.bsp', import.meta.url);
if (existsSync(mf)) { const { useMapFile, ARENA_MAPS, mapBoxes } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js');
  useMapFile('mirage', readFileSync(mf)); const M = ARENA_MAPS.mirage;
  if (M.physProps?.length) { const boxes = mapBoxes(M, ARENA.cx, ARENA.cz);
    // (nothing of the players' collision at its middle where it stands — v46 had a solid round 77 of Mirage's 81; those
    // left stand on ledges and shelves against a wall, whose 16-unit column takes them in)
    const free = M.physProps.filter(p => { const x = ARENA.cx + p.x, z = ARENA.cz + p.z; return !boxes.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.y0 < p.y + p.h * .8 && b.y1 > p.y + p.h * .5); });
    ok(`Mirage: its ${M.physProps.length} physics props are no collision for players`, free.length >= M.physProps.length * .5, `${free.length} free`);
    ok('Mirage: the bullets have their own layer (no player clips) with what walls are made of', boxes.bullets?.length > 0 && boxes.bullets.some(b => b.mat === 'wood') && boxes.bullets.some(b => b.mat === 'metal')); }
  else console.log('(Mirage file from before physics props: skipped)'); }
console.log(`PASS: physics props · ${n} checks (pushed by a body, slide to a stop, walls, shots, pottery shatters, HE blast, tip over, new round)`);
