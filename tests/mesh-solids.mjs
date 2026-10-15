// mesh-solids.js: vertical solid stretches through triangle meshes (CS2 map physics) — closed boxes, a terrain sheet,
// stacked floors, a line starting inside a solid, and a wall that only stands beside the line.
import { meshSolids } from '../dist/mesh-solids.js';
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' · ' + info : '')); };
// A closed box [x0, y0, z0]–[x1, y1, z1] as 12 triangles, faces outward.
function box(P, I, [x0, y0, z0], [x1, y1, z1]) {
  const b = P.length / 3, v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const p of v) P.push(...p);
  for (const [a, c, d] of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]) I.push(b + a, b + c, b + d); }
const P = [], I = [];
box(P, I, [0, 0, 0], [100, 100, 16]);        // a floor slab
box(P, I, [0, 0, 128], [100, 100, 144]);     // a second floor above (a balcony)
box(P, I, [200, 0, -50], [216, 100, 300]);   // a wall
const s = meshSolids(new Float32Array(P), new Uint32Array(I));
const eq = (a, b) => JSON.stringify(a.map(q => q.map(v => Math.round(v)))) === JSON.stringify(b);
check('two stacked floors: two solids, at their heights', eq(s.solidSpans(50, 50, -100, 400), [[0, 16], [128, 144]]), JSON.stringify(s.solidSpans(50, 50, -100, 400)));
check('inside the wall: solid all the way', eq(s.solidSpans(208, 50, -100, 400), [[-50, 300]]), JSON.stringify(s.solidSpans(208, 50, -100, 400)));
check('beside the wall: nothing', s.solidSpans(150, 50, -100, 400).length === 0);
// A terrain sheet (faces up only): solid from it down.
const T = [], TI = []; T.push(0, 0, 10, 100, 0, 30, 100, 100, 30, 0, 100, 10); TI.push(0, 1, 2, 0, 2, 3);
const t = meshSolids(new Float32Array(T), new Uint32Array(TI)), ts = t.solidSpans(50, 50, -100, 400);
check('a terrain sheet: solid from its surface down', ts.length === 1 && Math.round(ts[0][0]) === -100 && Math.abs(ts[0][1] - 20) < .5, JSON.stringify(ts));
// A line starting inside a solid (the query's top inside a hull): solid from the hull's underside up to the top.
const s2 = s.solidSpans(208, 50, -100, 100);
check('a query whose top is inside a solid', eq(s2, [[-50, 100]]), JSON.stringify(s2));
// Overlapping hulls (CS2's collision is many): one solid where they overlap, not a gap.
{ const O = [], OI = []; box(O, OI, [0, 0, 0], [100, 100, 50]); box(O, OI, [0, 0, 30], [100, 100, 80]); box(O, OI, [0, 0, 200], [100, 100, 210]);
  const o = meshSolids(new Float32Array(O), new Uint32Array(OI)), os = o.solidSpans(50, 50, -100, 400);
  check('overlapping hulls: one solid over both, the floor above apart', eq(os, [[0, 80], [200, 210]]), JSON.stringify(os)); }
// An open roof sheet (top faces only) over a closed floor: a thin slab, not solid all the way down to the floor.
{ const O = [], OI = []; box(O, OI, [0, 0, 0], [100, 100, 16]); const b0 = O.length / 3; O.push(0, 0, 200, 100, 0, 200, 100, 100, 200, 0, 100, 200); OI.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  const open = new Uint8Array(OI.length / 3); open[12] = open[13] = 1;
  const o = meshSolids(new Float32Array(O), new Uint32Array(OI), 64, open), os = o.solidSpans(50, 50, -100, 400);
  check('an open roof sheet over a room: a thin slab, the room under it free', eq(os, [[0, 16], [196, 200]]), JSON.stringify(os)); }
// A wall that is one face (a one-sided sheet, no thickness): solid in the cells it passes through (traced: wall = 8), not
// in the next one; a second face higher up in the same cell keeps the gap between them.
{ const O = [], OI = []; const quad = (x0, y0, x1, y1, z0, z1) => { const b = O.length / 3; O.push(x0, y0, z0, x1, y1, z0, x1, y1, z1, x0, y0, z1); OI.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  quad(100, 0, 100, 200, 0, 120); quad(140, 0, 140, 200, 0, 40); quad(140, 0, 140, 200, 80, 120);
  const o = meshSolids(new Float32Array(O), new Uint32Array(OI), 64, new Uint8Array(OI.length / 3).fill(1), null, 8, 4), at = (x, y) => o.solidSpans(x, y, -10, 200).map(q => q.map(Math.round));
  const near = (got, want) => got.length === want.length && got.every((q, i) => Math.abs(q[0] - want[i][0]) <= 3 && Math.abs(q[1] - want[i][1]) <= 3);   // (traced every ~4 units: within a few)
  check('a one-face wall: solid where it stands', near(at(100, 50), [[0, 120]]), JSON.stringify(at(100, 50)));
  check('…and not a cell beside it', at(116, 50).length === 0, JSON.stringify(at(116, 50)));
  check('two faces at different heights in a cell keep the gap between', near(at(140, 50), [[0, 40], [80, 120]]), JSON.stringify(at(140, 50))); }
console.log((fail ? 'FAIL' : 'PASS') + ': mesh solids · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
