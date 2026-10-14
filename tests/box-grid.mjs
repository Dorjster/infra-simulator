// The box grid (dist/box-grid.js) never changes an answer: on a classic map's boxes (thousands: the grid is used),
// thousands of random queries — bullet rays, segments, sight lines, wallbang paths, standing room, ground under feet —
// give exactly what the plain scan of every box gives.
import { ARENA_MAPS, mapBoxes, segmentClear, rayBoxes, lineOfSight, bulletPath, walkable, floorTop } from '../dist/arena-maps.js';
import { groundAt, blocked } from '../dist/arena-move.js';
let n = 0, bad = 0; const fail = [];
for (const id of ['dust2', 'nuke']) {
  const M = ARENA_MAPS[id], grid = mapBoxes(M, 0, 0), plain = grid.slice();   // slice(): the same boxes, no grid
  if (!grid.grid) throw Error(id + ': no grid (' + grid.length + ' boxes)');
  const [w, d] = M.size; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, X = () => (rnd() - .5) * w, Z = () => (rnd() - .5) * d, Y = () => rnd() * 30;
  const same = (name, a, b) => { n++; if (a !== b && !(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9)) { bad++; if (fail.length < 5) fail.push(`${id} ${name}: ${a} ≠ ${b}`); } };
  const bounds = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
  for (let i = 0; i < 4000; i++) {
    const ax = X(), az = Z(), ay = Y(), bx = rnd() < .5 ? ax + (rnd() - .5) * 60 : X(), bz = rnd() < .5 ? az + (rnd() - .5) * 60 : Z(), by = Y();
    same('segment', segmentClear(grid, ax, ay, az, bx, by, bz), segmentClear(plain, ax, ay, az, bx, by, bz));
    same('sight', lineOfSight(grid, ax, az, bx, bz, ay), lineOfSight(plain, ax, az, bx, bz, ay));
    const l = Math.hypot(bx - ax, by - ay, bz - az) || 1, dx = (bx - ax) / l, dy = (by - ay) / l, dz = (bz - az) / l;
    same('ray', rayBoxes(grid, ax, ay, az, dx, dy, dz, 400), rayBoxes(plain, ax, ay, az, dx, dy, dz, 400));
    same('wallbang', JSON.stringify(bulletPath(grid, ax, ay, az, dx, dy, dz, 400)), JSON.stringify(bulletPath(plain, ax, ay, az, dx, dy, dz, 400)));
    same('walkable', walkable(grid, bounds, ax, az), walkable(plain, bounds, ax, az));
    same('floorTop', floorTop(grid, ax, az, ay), floorTop(plain, ax, az, ay));
    same('ground', groundAt(grid, ax, az, ay), groundAt(plain, ax, az, ay));
    same('blocked', blocked(grid, null, ax, az, ay), blocked(plain, null, ax, az, ay));
  }
}
if (bad) { console.error('FAIL: box grid · ' + bad + '/' + n + ' differ: ' + fail.join(' | ')); process.exit(1); }
console.log('PASS: box grid · ' + n + ' queries, all the same as the plain scan');
