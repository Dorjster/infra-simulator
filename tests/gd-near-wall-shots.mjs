// Shooting near walls and corners (Global Defensive). A CS2 map's collision boxes are 16-unit columns standing up to 8
// (players) or 16 (bullets) Hammer units proud of the walls they hold; bullets, knives, sight and pickup lines find the
// wall inside a box by CS2's own triangles (arena-maps.js bulletPath / segmentClear / rayBoxes: the fine phase), so:
//   · CI (no map files): a synthetic CS2-style map — its triangles, padded boxes, a door, a pane, a raised floor — at
//     two arena offsets (cx / cz): a shot along a wall you stand against, a corner peek, a shot through a doorway past
//     its frame, over a floor's edge all pass; real walls, a shut door, an intact pane still stop them; a wallbang's
//     thickness is the wall's, wherever it falls in the grid; the impact lies on the wall, facing out; a ray from inside
//     a door shut on you or a box's padding passes it. The host: hits on a body's edge past a corner count (lineOfFire),
//     its boxes follow a map file loaded for the map in play, doors never swing into bodies and switch halfway through
//     the swing. Boxes without the new side trim are what they always were.
//   · Map files (user-maps, this computer only; skipped without): on all eight maps, from eyes pressed to walls by the
//     movement, the lines CS2's sight triangles call clear are blocked under 2.5 %, hidden ones are not let through,
//     pressed bodies stand a CS2-like distance off the walls, the audit's two repro shots pass, ladder climbers' shots
//     leave their eye, impacts lie on CS2's triangles, and a grenade resting at a wall still sees the room.
//   node tests/gd-near-wall-shots.mjs [--files user-maps] [map ids…]
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { buildNadeMesh } from '../tools/maps/nade-mesh.mjs';
import { createNadeMesh } from '../dist/nade-mesh.js';
import { ARENA_MAPS, useMapFile, mapBoxes, applyMapState, bodyInBox, bulletPath, segmentClear, rayBoxes, BulletPath } from '../dist/arena-maps.js';
import { mergeSegs, U } from '../dist/cs-mapbuild.js';
import { CELL } from '../dist/cs-columns.js';
import { lineOfFire } from '../dist/combat-logic.js';
import { startArena, arenaApply, arenaTick } from '../dist/arena-logic.js';
import { FILE_MAP_IDS } from '../dist/cs-maps/themes.js';
import { createMoveState, moveFor, moveStep, blocked } from '../dist/arena-move.js';
import { ARENA } from '../dist/facility-layout.js';
import { boxesNear } from '../dist/box-grid.js';
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const HU = 2.54 / 16.5, near = (a, b, e) => Math.abs(a - b) <= e, f2 = v => (+v).toFixed(2);
const argv = process.argv.slice(2), fi = argv.indexOf('--files'), dir = fi >= 0 ? argv.splice(fi, 2)[1] : 'user-maps', only = argv;

// ——— CI: a synthetic CS2-style map ———
// Solids as CS2 has them (closed boxes of triangles facing out), each with a padded collision box as the importer's grid
// makes them (a wall's box stands `pad` proud of it on each side).
const tris = [], see = [];
const quad = (p, n, s = 1) => { const [a, b, c, d] = p, cr = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])], q = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0 ? [a, d, c, b] : p;
  tris.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); see.push(s, s); };
function solid(x0, y0, z0, x1, y1, z1, s = 1) { const P = (i, j, k) => [i ? x1 : x0, j ? y1 : y0, k ? z1 : z0];
  quad([P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1)], [-1, 0, 0], s); quad([P(1, 0, 0), P(1, 0, 1), P(1, 1, 1), P(1, 1, 0)], [1, 0, 0], s);
  quad([P(0, 0, 0), P(0, 0, 1), P(1, 0, 1), P(1, 0, 0)], [0, -1, 0], s); quad([P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)], [0, 1, 0], s);
  quad([P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0)], [0, 0, -1], s); quad([P(0, 0, 1), P(0, 1, 1), P(1, 1, 1), P(1, 0, 1)], [0, 0, 1], s); }
const box = (x0, y0, z0, x1, y1, z1, mat) => [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, mat, y0];
const T8 = 8 * HU, P12 = 12 * HU;
// W1: plaster, 8 Hammer units thick, its box 12 proud in front and 4 behind. W2: a wall ending at z = 0 (a corner), its
// box 12 past the end. W3: a doorway (frame walls at z < −3 and z > 3, their boxes 8 into the opening) with a rotating
// door. A platform 4 high (box 2 over its top, 8 round it). W5: a wall with a window and a glass pane in it. W6: 40 units
// of concrete. Spare boxes far off make the list big enough for its grid (the chunked walk).
solid(10, 0, -20, 10 + T8, 20, 20); solid(40, 0, -30, 41.2, 20, 0); solid(70, 0, -30, 71.2, 20, -3); solid(70, 0, 3, 71.2, 20, 30);
solid(100, 0, -10, 120, 4, 10);
solid(130, 0, -20, 131.2, 6, 20); solid(130, 12, -20, 131.2, 20, 20); solid(130, 6, -20, 131.2, 12, -4); solid(130, 6, 4, 131.2, 12, 20); solid(130.5, 6, -4, 130.7, 12, 4, 0);   // (the pane: glass, no sight)
solid(160, 0, -20, 160 + 40 * HU, 20, 20, 1);
solid(200, 0, -20, 260, 20, 20);   // W7: a building 60 units deep whose bullet boxes are only its shell (the importer's: lines near its faces)
// W8: W1's 8 units of plaster built of two 4-unit brushes face to face (one's exit face is the other's entry, at one
// point). W9: 20 units of it whose front box starts 5 Hammer units inside its face (over FINE_PAD), its inside without
// boxes. W10: concrete whose only box stands in front of it, ending 5 short of its face (an oblique line through a
// column's corner, made straight). W11: two hulls of plaster, 8 and 48 Hammer units deep, sharing their front face (the
// tree reports it once: past the 8-unit one's exit the line leaves a solid no face entered), boxed only at the faces.
// W12: two 2.5-unit plaster hulls 0.2 Hammer units apart.
solid(280, 0, -20, 280 + 4 * HU, 20, 20); solid(280 + 4 * HU, 0, -20, 280 + T8, 20, 20);
solid(300, 0, -20, 320, 20, 20); solid(340, 0, -20, 350, 20, 20); solid(360, 0, -20, 360 + T8, 20, 20); solid(360, 0, -20, 360 + 48 * HU, 20, 20);
solid(380, 0, -20, 382.5, 20, 20); solid(382.5 + .2 * HU, 0, -20, 385 + .2 * HU, 20, 20);
const MESH = (() => { const { info, buf } = buildNadeMesh(new Float32Array(tris), Uint8Array.from(see)), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), p4 = n => n + (4 - n % 4) % 4;
  let o = 0; const tri = new Uint16Array(ab, o, info.tris * 9); o += p4(info.tris * 18); const bx = new Uint16Array(ab, o, info.nodes * 6); o += p4(info.nodes * 12); const links = new Uint32Array(ab, o, info.nodes * 2); o += info.nodes * 8;
  return createNadeMesh({ o: info.o, s: info.s, tri, box: bx, links, sight: new Uint8Array(ab, o, info.tris) }); })();
const bulletSolids = (pf = P12) => [box(10 - pf, 0, -20 - P12, 10 + T8 + 4 * HU, 20, 20 + P12, 'plaster'), box(40 - P12, 0, -30, 41.2 + P12, 20, P12, 'concrete'),
  box(70 - 4 * HU, 0, -30, 71.2 + 4 * HU, 20, -3 + T8, 'plaster'), box(70 - 4 * HU, 0, 3 - T8, 71.2 + 4 * HU, 20, 30, 'plaster'), box(100 - T8, 0, -10 - T8, 120 + T8, 4 + 2 * HU, 10 + T8, 'concrete'),
  box(130 - P12, 0, -20, 131.2 + P12, 6, 20, 'concrete'), box(130 - P12, 12, -20, 131.2 + P12, 20, 20, 'concrete'), box(130 - P12, 6, -20, 131.2 + P12, 12, -4, 'concrete'), box(130 - P12, 6, 4, 131.2 + P12, 12, 20, 'concrete'),
  box(160 - 4 * HU, 0, -20, 160 + 44 * HU, 20, 20, 'concrete'), box(200 - T8, 0, -20, 200 + 4 * HU, 20, 20, 'plaster'), box(260 - 4 * HU, 0, -20, 260 + T8, 20, 20, 'plaster'),
  box(280 - P12, 0, -20, 280 + T8 + 4 * HU, 20, 20, 'plaster'), box(300 + 5 * HU, 0, -20, 300 + 21 * HU, 20, 20, 'plaster'), box(320 - 16 * HU, 0, -20, 320 + 4 * HU, 20, 20, 'plaster'), box(340 - 21 * HU, 0, -20, 340 - 5 * HU, 20, 20, 'concrete'),
  box(360 - P12, 0, -20, 360 + T8 + 4 * HU, 20, 20, 'plaster'), box(360 + 32 * HU, 0, -20, 360 + 52 * HU, 20, 20, 'plaster'), box(380 - P12, 0, -20, 385 + 4.2 * HU, 20, 20, 'plaster'), box(540, 8, -20, 541, 11, 20, 'metal') /* W13: a pipe the mesh lost (no triangles round it) */, ...Array.from({ length: 1600 }, (_, i) => box(400 + (i % 40) * 3, 0, 300 + Math.floor(i / 40) * 3, 401 + (i % 40) * 3, 2, 301 + Math.floor(i / 40) * 3, 'concrete'))];
const DOOR = { kind: 'rotdoor', box: [70.4, 70.8, -3, 3, 0, 14], hinge: [70.6, 0, -3], angle: Math.PI / 2, open: { '+': [70.6, 76.6, -3.2, -2.8, 0, 14], '-': [64.6, 70.6, -3.2, -2.8, 0, 14] } };
const PANE = { kind: 'break', glass: true, health: 1, pane: true, box: [130.5, 130.7, -4, 4, 6, 12] };
let seq = 0; const synth = (pf, cx, cz) => { const map = { id: 'nearwall-' + seq++, name: 'Near-wall test', kind: 'dm', size: [600, 800], solids: bulletSolids(pf).slice(0, 10), bulletSolids: bulletSolids(pf), movers: [DOOR, PANE], spawns: [[0, 0]],
  nadeMesh: { tris: MESH.tris, contact: MESH.contact, blocked: MESH.blocked, first: MESH.first, sight: true, trianglesIn: MESH.trianglesIn, anyIn: MESH.anyIn } }; return { map, boxes: mapBoxes(map, cx, cz), cx, cz }; };
const RES = new BulletPath(), RES2 = new BulletPath();
for (const [cx, cz] of [[0, 0], [ARENA.cx + 37.5, ARENA.cz - 11.25]]) { const { boxes } = synth(P12, cx, cz), at = `(at ${cx}, ${cz})`;
  const A = (x, y, z) => [cx + x, y, cz + z], shot = (e, t, pen = 0) => { const dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2], L = Math.hypot(dx, dy, dz); const P = bulletPath(boxes, ...e, dx / L, dy / L, dz / L, L + .01, pen, RES); return { P, L, f: P.factor(L), clear: segmentClear(boxes, ...e, ...t) }; };
  const sees = (e, t) => !boxes.nadeMesh.blocked(...e, ...t, true);
  check('the grid: the bullets\' boxes are indexed (the chunked walk) and refined by the triangles ' + at, !!boxes.bullets.grid && boxes.bullets.fine === boxes.nadeMesh);
  applyMapState(boxes, null);
  // Pressed to W1 (the body 1.3 off its box): a shot along the wall at a target in front of it passes.
  { const e = A(10 - P12 - 1.3, 9.7, -10), t = A(10 - .3, 7.9, 15), s = shot(e, t);
    check('pressed to a wall, a shot along it at someone in front of it passes ' + at, sees(e, t) && s.f === 1 && s.clear && rayBoxes(boxes, ...e, ...[t[0] - e[0], t[1] - e[1], t[2] - e[2]].map(v => v / s.L), s.L) >= s.L - 1e-6, `factor ${s.f} clear ${s.clear}`); }
  // Into W1: stops on its face (not its box's), the impact facing out; an AK goes through its 8 units of plaster.
  { const e = A(0, 9.7, 0), t = A(25, 9.7, 0), s = shot(e, t), n = s.P.stopNormal;
    check('a shot into a wall stops on the wall, not its box ' + at, s.f === 0 && near(s.P.stop, 10, .05) && !s.clear, 'stop ' + f2(s.P.stop) + ' (box face at ' + f2(10 - P12) + ')');
    check('…the impact faces out of the wall ' + at, !!n && near(n[0], -1, 1e-3) && near(n[1], 0, 1e-3) && near(n[2], 0, 1e-3), JSON.stringify(n));
    const ak = shot(e, t, 7.5), c = ak.P.crossed[0];
    check('an AK goes through 8 units of plaster, the thickness the wall\'s ' + at, ak.f > 0 && !!c && near(c.t1 - c.t0, T8, .05) && near(c.nx, -1, 1e-3), c ? 'crossed ' + f2((c.t1 - c.t0) / HU) + ' HU, factor ' + f2(ak.f) : 'nothing crossed'); }
  // Corner (W2 ends at z = 0, its box 12 past the end): a shot just past the corner passes; behind it, stopped.
  { const e = A(36, 9.7, 1.3), s = shot(e, A(60, 7.9, 1.3)), h = shot(e, A(60, 7.9, -5));
    check('a corner peek: a shot just past a wall\'s end passes (inside its box) ' + at, s.f === 1 && s.clear, `factor ${s.f}`);
    check('…behind the corner it is stopped ' + at, h.f === 0 && !h.clear, `factor ${h.f}`); }
  // A doorway (frame boxes 8 into the opening): the door shut stops a shot through it (the door is what it hits);
  // swung open, the shot passes, even close by the frame.
  { const e = A(60, 9.7, 0), t = A(80, 9.7, 0), s = shot(e, t), door = s.P.stopBox?.mover === 0 || s.P.embedded?.mover === 0;
    check('a shut door stops a shot through the doorway, and it is the door that is hit ' + at, s.f === 0 && door, 'stopBox ' + (s.P.stopBox?.mat || '-') + ' embedded ' + (s.P.embedded?.mat || '-'));
    applyMapState(boxes, { doors: { 0: { open: 1, side: 1 } }, broken: {} });
    const o = shot(e, t), g = shot(A(60, 9.7, 2.4), A(80, 9.7, 2.4));
    check('…open, it passes, also close by the frame (inside the frame\'s box) ' + at, o.f === 1 && o.clear && g.f === 1 && g.clear, `middle ${o.f}, by the frame ${g.f}`);
    applyMapState(boxes, null); const inDoor = shot(A(70.6, 9.7, 0), t);
    check('an eye inside a door shut on it is not stopped at the eye (GDW-5) ' + at, inDoor.P.stop > 1 && inDoor.clear, 'stop ' + f2(inDoor.P.stop)); }
  // The platform (box 2 over its top): a shot skimming the top passes; one down onto it stops on its top, facing up.
  { const s = shot(A(95, 4 + HU, 0), A(125, 4 + HU, 0)), d = shot(A(110, 15, 0), A(110, 0, 5)), n = d.P.stopNormal;
    check('a shot skimming a raised floor passes (inside its box\'s top) ' + at, s.f === 1 && s.clear, `factor ${s.f}`);
    check('…one down onto it stops on its top, the impact facing up ' + at, d.f === 0 && near(d.P.stop, Math.hypot(0, 11, 11 * 5 / 15), .06) && !!n && near(n[1], 1, 1e-3), 'stop ' + f2(d.P.stop)); }
  // A window's pane: intact, it is what stops a shot (glass: the pane breaks); broken, the shot passes.
  { const e = A(125, 9, 0), t = A(140, 9, 0), s = shot(e, t), pane = s.P.stopBox?.mover === 1 || s.P.embedded?.mover === 1 || s.P.crossed.some(c => c.b.mover === 1);
    applyMapState(boxes, { doors: {}, broken: { 1: 1 } }); const b = shot(e, t); applyMapState(boxes, null);
    check('a window: the pane is what the shot meets; broken, the shot passes through the window ' + at, pane && b.f === 1 && b.clear, `pane ${pane}, broken ${b.f}`); }
  // Real walls: 40 units of concrete stop an AK; a pressed eye never shoots through the wall it leans on.
  { const e = A(150, 9.7, 0), t = A(175, 7.9, 0), w = A(10 - P12 - 1.3, 9.7, 0), b = A(10 + T8 + 3, 7.9, 6);
    check('real walls still stop bullets (40 units of concrete, an AK) ' + at, shot(e, t, 7.5).f === 0 && shot(e, t).f === 0);
    check('no shot through the wall you lean on (pen 0)' + at, shot(w, b).f === 0 && !shot(w, b).clear && rayBoxes(boxes, ...w, 1, 0, 0, 40) < 10.01 - w[0] + cx + 1e-6);
    // W7: the boxes only its shell, two thin plaster boxes an AK would cross — its triangles say 60 units of it: stopped
    // on its face (the solid stays entered across the gap in the boxes; it was once taken for a 4-unit sheet).
    const k = shot(A(190, 9.7, 0), A(270, 9.7, 0), 7.5);
    check('a building whose boxes are only its shell stops an AK on its face (60 units of it, not two thin boxes) ' + at, k.f === 0 && near(k.P.stop, 10, .05) && k.P.crossed.length === 0, 'stop ' + f2(k.P.stop) + ' crossed ' + k.P.crossed.length); }
  // Pressed into a box's padding with no wall there (a ladder's column): a shot out of it passes.
  { const e = A(10 - 6 * HU, 9.7, 0), s = shot(e, A(-20, 9.7, 0));
    check('an eye inside a box\'s padding shoots out of it (GDW-6) ' + at, s.f === 1 && s.clear && s.P.stop === Infinity); }
  // The walker's bookkeeping. W8, two brushes face to face, is W1's wall: an AK through it either way does what it does
  // through W1, one crossing of 8 units (it once took the second brush's far face for an entry: 0 damage, stopped there).
  { const k1 = shot(A(0, 9.7, 0), A(25, 9.7, 0), 7.5).f, a = shot(A(270, 9.7, 0), A(295, 9.7, 0), 7.5), ac = a.P.crossed.map(c => c.t1 - c.t0), b = shot(A(295, 9.7, 0), A(270, 9.7, 0), 7.5).f, o = shot(A(270, 9.7, .3), A(295, 9.7, 2.1), 7.5).f;
    check('a wall of two brushes face to face is one wall: an AK through it, either way or slanting, as through W1 ' + at, near(a.f, k1, .005) && near(b, k1, .005) && near(o, k1, .01) && ac.length === 1 && near(ac[0], T8, .02), [a.f, b, o, k1].map(f2).join(' / ') + ' crossed ' + ac.map(v => f2(v / HU)).join('+') + ' HU');
    const p = shot(A(270, 9.7, 0), A(295, 9.7, 0)).P.stop, q = shot(A(295, 9.7, 0), A(270, 9.7, 0)).P.stop;
    check('…pen 0 stops on its near face either way ' + at, near(p, 10, .05) && near(q, 15 - T8, .05), f2(p) + ' / ' + f2(q)); }
  // W9: its entry lies before every box's window — found back from its exit (it was once looked for only 16 Hammer units
  // back, and the wall taken for a hull wound inside out: the bullet stopped on its far face, marks and tracers behind it).
  { const s = shot(A(295, 9.7, 0), A(325, 9.7, 0)), n = s.P.stopNormal ? [...s.P.stopNormal] : null;
    check('a wall whose box starts over FINE_PAD inside its face stops a shot on that face, facing out ' + at, near(s.P.stop, 5, .05) && !!n && near(n[0], -1, 1e-3) && !s.clear, 'stop ' + f2(s.P.stop) + ' (far face at 25)'); }
  // W10: its only box ends 5 short of its face — the face just past the box's window is found (FINE_AHEAD), not passed.
  { const s = shot(A(330, 9.7, 0), A(355, 9.7, 0)), stop = s.P.stop, ray = rayBoxes(boxes, ...A(330, 9.7, 0), 1, 0, 0, 25);
    check('a wall whose only box ends short of its face still stops a shot on the face ' + at, near(stop, 10, .05) && !s.clear && near(ray, 10, .05), 'stop ' + f2(stop) + ' ray ' + f2(ray)); }
  // W11: two hulls sharing their front face — the deeper one's exit, no face entering it, ends one wall 48 Hammer units
  // deep (too thick for an AK: stopped on its face), not a solid begun there (it once crossed the 8-unit hull and stopped
  // the bullet on the far face, 40 units behind the wall).
  { const s = shot(A(355, 9.7, 0), A(375, 9.7, 0), 7.5), n = s.P.stopNormal ? [...s.P.stopNormal] : null;
    check('two hulls sharing a face are one wall to the deeper one\'s exit: an AK stops on its front face ' + at, s.f === 0 && near(s.P.stop, 5, .05) && s.P.crossed.length === 0 && !!n && near(n[0], -1, 1e-3), 'stop ' + f2(s.P.stop) + ' (far face at ' + f2(5 + 48 * HU) + ') crossed ' + s.P.crossed.length); }
  // W12: two 2.5-unit plaster hulls 0.2 Hammer units apart are one 5-unit wall (over SOLID_THICK) — a pen-9 gun crossed
  // each alone; it stops on the first one's face, not between them.
  { const s = shot(A(375, 9.7, 0), A(392, 9.7, 0), 9), n = s.P.stopNormal ? [...s.P.stopNormal] : null;
    check('hulls a hair apart are one wall: 5 units of plaster stop a pen-9 gun on its face ' + at, s.f === 0 && near(s.P.stop, 5, .05) && s.P.crossed.length === 0 && !!n && near(n[0], -1, 1e-3), 'stop ' + f2(s.P.stop) + ' crossed ' + s.P.crossed.length); }
  // W13: a bullet box with no sight triangle round it — a pipe or beam nade_mesh's simplification dropped (Cache: ~80
  // boxes) — stops bullets as its box did before the fine phase (review A-6); a line under it passes.
  { const s = shot(A(530, 9.7, 0), A(550, 9.7, 0)), stop = s.P.stop, u = shot(A(530, 5, 0), A(550, 5, 0)), r = rayBoxes(boxes, ...A(530, 9.7, 0), 1, 0, 0, 40);   // (s.P is RES: read before the next shot)
    check('a bullet box the mesh has no triangles for still stops a shot on its face (and a line under it passes) ' + at, s.f === 0 && near(stop, 10, .01) && !s.clear && u.f === 1 && u.clear && near(r, 10, .01), 'stop ' + f2(stop) + ' clear ' + s.clear + ' under ' + u.f + ' ray ' + f2(r)); }
  // Sight lines and bullets agree (pen 0), at random.
  { let bad = 0, n = 0, seed = 9; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 3000; i++) { const e = A(-10 + r() * 190, 1 + r() * 18, -25 + r() * 50), t = A(-10 + r() * 190, 1 + r() * 18, -25 + r() * 50), s = shot(e, t); n++; if ((s.f > 0) !== s.clear) bad++; }
    check('segmentClear and bulletPath agree on 3 000 random lines ' + at, bad === 0, bad + ' of ' + n + ' differ'); }
}
// Wallbang thickness is the wall's wherever the grid put its box (GDW-8): the same AK factor for any front padding.
{ const fs = [0, 4, 8, 12, 16].map(p => { const { boxes } = synth(p * HU, 0, 0); applyMapState(boxes, null); return bulletPath(boxes, 0, 9.7, 0, 1, 0, 0, 25, 7.5).factor(24); });
  check('a wallbang through 8 units of plaster gives the same damage wherever the wall sits in its box', Math.max(...fs) - Math.min(...fs) <= .02 && fs[0] > 0, fs.map(f2).join(' / ')); }
// The collision view's triangles (gd-collision-view.js): those round a point, moved with the arena.
{ const { boxes } = synth(P12, 30, -40), out = new Float32Array(9 * 64), flags = new Uint8Array(64), n = boxes.nadeMesh.trianglesIn(30 + 9, 0, -40 - 5, 30 + 11, 20, -40 + 5, out, flags, 64);
  let inside = n > 0; for (let k = 0; k < n * 9; k += 3) if (out[k] < 30 + 9 - 1 || out[k] > 30 + 12 || out[k + 2] < -40 - 21 || out[k + 2] > -40 + 21) inside = false;
  check('trianglesIn: the triangles round a spot, in the arena\'s coordinates', inside, n + ' triangles'); }

// ——— The host ———
// Hits on a body's edge past a corner count (GDW-4): one wall, the shooter by its end, the target's axis behind it but
// its shoulder out; the whole body behind it is still refused.
{ const id = 'nearwall-edge'; ARENA_MAPS[id] = { id, name: 'Edge', kind: 'dm', size: [200, 200], solids: [[0, -10, 2, 20, 30, 'concrete']], spawns: [[0, 0]] };
  const game = { arena: { map: id } }, from = { x: ARENA.cx - 20, y: 9.7, z: ARENA.cz + 1 }, edge = { x: ARENA.cx + 20, y: 9.7, z: ARENA.cz - 1.0 }, hidden = { x: ARENA.cx + 20, y: 9.7, z: ARENA.cz - 6 };
  check('the host takes a hit on a shoulder past a corner (the target\'s axis is behind it)', lineOfFire(game, from, edge, 'chest', 0) === 1 && lineOfFire(game, from, edge, 'chest', 3.5) === 1);
  check('…and refuses one on a body wholly behind the wall', lineOfFire(game, from, hidden, 'chest', 0) === 0);
  // Its boxes follow the map object (GDW-14): a map file loaded for the map in play replaces the one of the same name.
  const open = { x: ARENA.cx + 20, y: 9.7, z: ARENA.cz + 20 }; const before = lineOfFire(game, from, open, 'chest', 0);
  ARENA_MAPS[id] = { ...ARENA_MAPS[id], solids: [[0, -10, 2, 20, 30, 'concrete'], [0, 30, 2, 60, 30, 'concrete']] };
  check('the host\'s walls follow a map loaded in place of the one in play', before === 1 && lineOfFire(game, from, open, 'chest', 0) === 0); }
// Doors (GDW-5, GDW-10): never swung into a body or shut on one; their collision switches halfway through the swing.
{ const id = 'nearwall-door', cx = ARENA.cx, cz = ARENA.cz; ARENA_MAPS[id] = { id, name: 'Door', kind: 'dm', size: [300, 300], solids: [[70.6, -16.5, 1.2, 27, 20, 'plaster'], [70.6, 16.5, 1.2, 27, 20, 'plaster']], spawns: [[0, 0], [100, 0]], movers: [DOOR] };
  const game = { levels: {} }, now = 1e9; startArena(game, { map: id }, now);
  const pl = (name, x, z) => ({ id: name, name, pose: { x: cx + x, y: 9.7, z: cz + z } }), ann = pl('Ann', 67, 0), bob = pl('Bob', 73.5, -2), boxes = mapBoxes(ARENA_MAPS[id], cx, cz), shut = () => !boxes.movers.find(b => b.role === 'shut').off;
  // Ann (west of it) opens it: away from her is east ('+'), where Bob stands — it swings west ('−') instead.
  const r1 = arenaApply(game, { type: 'use', id: 0 }, 'Ann', [ann, bob], now), st = game.combat.mapState.doors[0];
  check('a door swings away from the user, but never into someone: the other way round', /open/i.test(r1) && st.open && st.side === -1, r1 + ' side ' + st.side);
  check('…its collision switches halfway through the swing, not at once', shut() && (arenaTick(game, [ann, bob], .05, now + 200), shut()) && (arenaTick(game, [ann, bob], .05, now + 300), !shut()));
  ARENA_MAPS[id] = { ...ARENA_MAPS[id] }; arenaTick(game, [ann, bob], .05, now + 400); const nb = mapBoxes(ARENA_MAPS[id], cx, cz);   // (a map file loaded for the map in play: new boxes)
  check('…a map loaded in place of the one in play gets the round\'s doors as they stand (GDW-14)', nb !== boxes && nb.movers.find(b => b.role === 'shut').off && !nb.movers.find(b => b.role === '-').off);
  let err = ''; try { arenaApply(game, { type: 'use', id: 0 }, 'Ann', [ann, pl('Cy', 70.6, 0)], now + 1000); } catch (e) { err = e.message; }
  check('a door is not shut on someone standing in the doorway', /in the way/i.test(err) && game.combat.mapState.doors[0].open, err);
  // Shut with the doorway clear, then Cy steps in mid-swing: at halfway its collision waits for Cy to leave (review A-5: arena-move can't walk a body out of a box it is in).
  const nbShut = () => !nb.movers.find(b => b.role === 'shut').off, r2 = arenaApply(game, { type: 'use', id: 0 }, 'Ann', [ann, bob], now + 2000);
  arenaTick(game, [ann, bob, pl('Cy', 70.6, .5)], .05, now + 2300); const held = !nbShut(); arenaTick(game, [ann, bob, pl('Cy', 60, 0)], .05, now + 2350); const still = !nbShut(); arenaTick(game, [ann, bob, pl('Cy', 60, 0)], .05, now + 2450);
  check('…nor turned solid round someone who stepped into the doorway mid-swing: it waits till they have left', /shut/i.test(r2) && held && still && nbShut(), JSON.stringify({ r2, held, still, after: nbShut() }));
  const B = { movers: [{ mover: 0, role: 'shut', flipMs: 278, off: false }, { mover: 0, role: '+', flipMs: 278, off: true }] };
  const next = applyMapState(B, { doors: { 0: { open: 1, side: 1, at: 1000 } } }, 1100), mid = !B.movers[0].off; applyMapState(B, { doors: { 0: { open: 1, side: 1, at: 1000 } } }, 1300);
  check('applyMapState: a door switches at half its swing and says when (the client by its own clock: since)', mid && next === 1278 && B.movers[0].off && !B.movers[1].off && (applyMapState(B, { doors: { 0: { open: 1, side: 1, at: 0 } } }, 5, [4990]), !B.movers[0].off));
  const C = { movers: [{ mover: 0, role: 'shut', flipMs: 278, off: true, minX: 0, maxX: 1, minZ: 0, maxZ: 6, y0: 0, y1: 14 }, { mover: 0, role: '+', flipMs: 278, off: false }] }, shutSt = { doors: { 0: { open: 0, side: 1, at: 1000 } } };
  const wait = applyMapState(C, shutSt, 1300, null, b => bodyInBox(b, .5, 3, 0, 11, 1.3)), waited = C.movers[0].off && C.movers[1].off; const done = applyMapState(C, shutSt, 1400, null, b => bodyInBox(b, -3, 3, 0, 11, 1.3));
  check('applyMapState: a shut box waits while a body is in it (looked at again 100 ms on), then turns solid', wait === 1400 && waited && done === Infinity && !C.movers[0].off && C.movers[1].off, JSON.stringify({ wait, waited, done })); }
// Boxes without a side trim come out of mergeSegs exactly as before (every built-in map's); a trimmed one loses half a column.
{ const cols = 6, rows = 5, segs = Array.from({ length: cols * rows }, (_, i) => i % 3 ? [[0, 40 + (i % 2) * 8, 'concrete', !!(i % 2)]] : [[0, 72, 'plaster', false], [100, 120, 'wood', true]]);
  const old = (() => { const N = cols * rows, W = cols * CELL * U, D = rows * CELL * U, gx = c => -W / 2 + (c + .5) * CELL * U, gz = r => -D / 2 + (r + .5) * CELL * U, gy = h => h * U, out = [], byKey = new Map(), cells = new Uint8Array(N);   // (mergeSegs before the trim, verbatim)
    for (let i = 0; i < N; i++) for (const s of segs[i]) { const k = s[0] + '|' + s[1] + '|' + s[2] + '|' + s[3]; let e = byKey.get(k); if (!e) byKey.set(k, e = { s, list: [] }); e.list.push(i); }
    for (const { s, list } of byKey.values()) { for (const i of list) cells[i] = 1; for (const i of list) { if (!cells[i]) continue; const r = (i / cols) | 0, c = i - r * cols; let c1 = c; while (c1 + 1 < cols && cells[r * cols + c1 + 1]) c1++;
      let r1 = r; grow: while (r1 + 1 < rows) { for (let cc = c; cc <= c1; cc++) if (!cells[(r1 + 1) * cols + cc]) break grow; r1++; } for (let rr = r; rr <= r1; rr++) cells.fill(0, rr * cols + c, rr * cols + c1 + 1);
      const b = [(gx(c) + gx(c1)) / 2, (gz(r) + gz(r1)) / 2, (c1 - c + 1) * CELL * U, (r1 - r + 1) * CELL * U, (s[1] - s[0]) * U, s[2], gy(s[0])]; if (s[3]) b.walk = true; out.push(b); } } return out; })();
  check('boxes without a trim are byte-identical to the old merge', JSON.stringify(mergeSegs(cols, rows, segs, 0)) === JSON.stringify(old) && JSON.stringify(mergeSegs(cols, rows, segs, 0).map(b => b.walk || false)) === JSON.stringify(old.map(b => b.walk || false)));
  const t = mergeSegs(2, 1, [[[0, 72, 'plaster', false, 1]], [[0, 72, 'plaster', false, 1]]], 0);
  check('a seg trimmed on −x loses its west half column and does not merge across it', t.length === 2 && near(t[0][2], CELL * U / 2, 1e-9) && near(t[0][0] - t[0][2] / 2, -CELL * U + CELL * U / 2, 1e-9), JSON.stringify(t.map(b => b.slice(0, 4).map(f2)))); }

// ——— Map files (this computer only) ———
if (!existsSync(dir)) console.log('SKIP: map files — no ' + dir + ' folder (CS2 maps are converted on this computer only)');
else { const dt = 1 / 64, cx = ARENA.cx, cz = ARENA.cz, q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN; };
  const REPRO = { mirage: [[4.86, 24.17, -882.74], [133.29, 39.92, -824.89]], dust2: [[-171.25, 58.34, -637.67], [-120.36, 56.24, -624.15]] };
  let maps = 0;
  for (const f of readdirSync(dir).sort()) { const id = f.replace(/\.bsp$/i, ''); if (!f.endsWith('.bsp') || !FILE_MAP_IDS.includes(id) || (only.length && !only.includes(id))) continue;
    const buf = readFileSync(dir + '/' + f); if (buf.subarray(0, 4).toString() !== 'CS2M') continue; useMapFile(id, buf); const M = ARENA_MAPS[id], boxes = mapBoxes(M, cx, cz), mesh = boxes.nadeMesh;
    if (!mesh?.first || !boxes.bullets?.fine) { console.log(id + ': no sight triangles in this file (an older conversion) — skipped'); continue; } maps++; applyMapState(boxes, null);
    const G = M.columns.G, [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 }, world = { boxes, bounds, ladders: [] };
    let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const cells = []; for (let i = 0; i < G.cols * G.rows; i++) for (let k = 0; k < G.n[i]; k++) if (G.ceil[i * 3 + k] - G.z[i * 3 + k] >= 72) cells.push([i, G.z[i * 3 + k]]);
    const spot = () => { for (;;) { const [i, z] = cells[(rnd() * cells.length) | 0], c = i % G.cols, r = (i / G.cols) | 0, p = [cx - M.columns.W / 2 + (c + rnd()) * 16 * HU, (z - M.columns.zLow) * HU, cz - M.columns.D / 2 + (r + rnd()) * 16 * HU]; if (!blocked(boxes, bounds, p[0], p[2], p[1])) return p; } };
    const R = { vis: 0, visBlocked: 0, hid: 0, hidNew: 0, akNew: 0, akBox: 0, akSolids: 0, akOpen: 0, stand: [], heVis: 0, heBlocked: 0, stops: 0, onMesh: 0, onFront: 0, late: 0, ms: 0, calls: 0 };
    // The first of CS2's faces on e + u·[a, b]: −1 one toward the line (entering a solid), 1 one away (leaving), 0 both at
    // one point (hulls face to face), 2 none. boxOn: does the line e + u·t cross a static bullet box within r of t?
    // (faces that stop sight first, then any: a hull whose entry face only grenades stop is entered there — bulletPath)
    const FN4 = new Float64Array(4), NB = [], faceAt = (e, ux, uy, uz, a, b) => { let w = Infinity; for (const sight of [true, false]) if (w === Infinity) w = mesh.first(e[0] + ux * a, e[1] + uy * a, e[2] + uz * a, e[0] + ux * b, e[1] + uy * b, e[2] + uz * b, sight, FN4); return w === Infinity ? 2 : FN4[3] ? 0 : Math.sign(FN4[0] * ux + FN4[1] * uy + FN4[2] * uz); };
    const boxOn = (e, u, t, r) => { const x = e[0] + u[0] * t, z = e[2] + u[2] * t; return boxesNear(boxes.bullets, x - r, z - r, x + r, z + r, NB).some(b => { if (b.off || b.mover != null) return false; let lo = t - r, hi = t + r;
      for (const [o, d, a, c] of [[e[0], u[0], b.minX, b.maxX], [e[1], u[1], b.y0, b.y1], [e[2], u[2], b.minZ, b.maxZ]]) { if (Math.abs(d) < 1e-12) { if (o < a || o > c) return false; continue; } let p = (a - o) / d, q = (c - o) / d; if (p > q) [p, q] = [q, p]; lo = Math.max(lo, p); hi = Math.min(hi, q); }
      return lo <= hi; }); };
    for (let s = 0; s < 110; s++) { const p = spot(), st = createMoveState(p[1]); st.x = p[0]; st.z = p[2]; const yaw = rnd() * 6.283, wish = [Math.cos(yaw), Math.sin(yaw)]; let lx = st.x, lz = st.z, still = 0;
      // (pressed: no headway the way it runs for 6 frames — stopped, or sliding along the wall as CS2's movement does)
      for (let k = 0; k < 240 && still < 6; k++) { moveFor(st, { wish, weapon: 'ak', look: wish, pitch: 0 }, world, dt); if ((st.x - lx) * wish[0] + (st.z - lz) * wish[1] < .002) still++; else still = 0; lx = st.x; lz = st.z; }
      if (still < 6 || !st.onGround) continue; const eye = [st.x, st.y + 9.7, st.z];
      // How far off the wall: the nearest of CS2's surfaces round the eye, the waist and the shins (19 Hammer units up, just
      // over a step: what stops a body may be a ledge or a rail below the waist), Hammer units.
      { let d = Infinity; for (const y of [eye[1], eye[1] - 5, st.y + 19 * HU]) for (let a = 0; a < 48; a++) { const an = a * Math.PI / 24, w = mesh.first(eye[0], y, eye[2], eye[0] + Math.cos(an) * 60 * HU, y, eye[2] + Math.sin(an) * 60 * HU, true, null); if (w * 60 < d) d = w * 60; } if (d < Infinity) R.stand.push(d); }
      // A grenade resting at that wall (2.3 units off CS2's face, where the grenade's ball rests): what it sees.
      const gy = eye[1] - 5, w0 = mesh.first(eye[0], gy, eye[2], eye[0] + wish[0] * 40 * HU, gy, eye[2] + wish[1] * 40 * HU, true, null), g = Number.isFinite(w0) && w0 * 40 > 2.3 ? [eye[0] + wish[0] * (w0 * 40 - 2.3) * HU, gy, eye[2] + wish[1] * (w0 * 40 - 2.3) * HU] : null;
      for (let k = 0; k < 16; k++) { const t = spot(), T = [t[0], t[1] + 7.9, t[2]], dx = T[0] - eye[0], dy = T[1] - eye[1], dz = T[2] - eye[2], L = Math.hypot(dx, dy, dz); if (L > 1500 * HU || L < 2) continue;
        const vis = !mesh.blocked(...eye, ...T, true), c = performance.now(), P = bulletPath(boxes, ...eye, dx / L, dy / L, dz / L, L + .01, 0, RES), ok = P.factor(L) > 0; R.ms += performance.now() - c; R.calls++;
        // (visible lines a shut door or a pane stops are left out: those aren't in CS2's triangles — they move or break — and rightly stop the shot)
        if (vis) { if (ok || P.stopBox?.mover == null) { R.vis++; if (!ok) R.visBlocked++; } } else { R.hid++; if (ok && bulletPath(boxes, ...eye, dx / L, dy / L, dz / L, L + .01, 0, null, true).factor(L) === 0) R.hidNew++;
          const K = bulletPath(boxes, ...eye, dx / L, dy / L, dz / L, L + .01, 7.5, RES2), face = (a, b) => faceAt(eye, dx / L, dy / L, dz / L, a, b);
          if (K.factor(L) > 0) { R.akNew++; for (const c of K.crossed) if (c.b.mover == null) { R.akSolids++; const a = face(c.t0 - 1e-4, c.t0 + 1e-4), b = face(c.t1 - 1e-4, c.t1 + 1e-4); if (!(a === -1 || a === 0) || !(b === 1 || b === 0)) R.akOpen++; } }   // (an AK through what hides them: each wall it crossed entered on a face toward the line, left on one away from it)
          if (bulletPath(boxes, ...eye, dx / L, dy / L, dz / L, L + .01, 7.5, RES2, true).factor(L) > 0) R.akBox++; }
        if (P.stop < L && P.stopBox?.mover == null) { R.stops++; const f = faceAt(eye, dx / L, dy / L, dz / L, P.stop - HU, P.stop + HU); if (f !== 2) R.onMesh++; if (f === -1 || f === 0) R.onFront++;
          // From open air (the first face from the eye one toward it), where a bullet box holds that face, the bullet stops there, not past it.
          const w0 = mesh.first(...eye, ...T, true, FN4), t0 = w0 * L; if (w0 < Infinity && !FN4[3] && FN4[0] * dx + FN4[1] * dy + FN4[2] * dz < 0 && P.stop > t0 + .05 && boxOn(eye, [dx / L, dy / L, dz / L], t0, 16 * HU)) R.late++; }
        if (g && !mesh.blocked(...g, ...T, true)) { const clear = segmentClear(boxes, ...g, ...T), gx = T[0] - g[0], gy2 = T[1] - g[1], gz = T[2] - g[2], gl = Math.hypot(gx, gy2, gz);
          if (clear || bulletPath(boxes, ...g, gx / gl, gy2 / gl, gz / gl, gl, 0, RES2).stopBox?.mover == null) { R.heVis++; if (!clear) R.heBlocked++; } } } }   // (a door or pane between: left out, as above)
    const pc = (a, b) => (100 * a / Math.max(1, b)).toFixed(2) + '%';
    check(`${id}: from eyes pressed to walls, lines CS2's triangles call clear are blocked under 2.5 %`, R.vis >= 40 && R.visBlocked / R.vis < .025, `${pc(R.visBlocked, R.vis)} of ${R.vis}`);
    check(`${id}: …and hidden lines are not let through (under 0.5 % newly passed)`, R.hidNew / Math.max(1, R.hid) <= .005, `${pc(R.hidNew, R.hid)} of ${R.hid}`);
    // (an AK through what hides them: only walls as thick as their triangles say — each one it crossed entered and left on
    // CS2's surfaces, never a solid whose far side lay past a gap in the boxes taken for a thin sheet; that bug let an AK
    // through 25–64 % of hidden lines. More than through the boxes alone: their padding no longer adds thickness.)
    check(`${id}: …an AK wallbangs only through walls CS2's triangles close (entered on a face toward it, left on one away)`, R.akOpen <= Math.max(1, .01 * R.akSolids), `${R.akOpen} of ${R.akSolids} walls open · AK through ${pc(R.akNew, R.hid)} of hidden lines (boxes alone ${pc(R.akBox, R.hid)})`);
    // (p5 ≥ 5: the trimmed boxes never let bodies into walls — a few thin things CS2 lets players brush, under 5, were so before)
    check(`${id}: a body pressed to a wall stands CS2-like off it (median 12–20, p90 ≤ 30, p5 ≥ 5 Hammer units; CS2: 16)`, q(R.stand, .5) >= 12 && q(R.stand, .5) <= 20 && q(R.stand, .9) <= 30 && q(R.stand, .05) >= 5,
      `median ${q(R.stand, .5).toFixed(1)} p5 ${q(R.stand, .05).toFixed(1)} p90 ${q(R.stand, .9).toFixed(1)} min ${q(R.stand, 0).toFixed(1)} HU (n ${R.stand.length})`);
    check(`${id}: impacts lie on CS2's surfaces, on a face toward the shooter (within 1 Hammer unit)`, R.onMesh / Math.max(1, R.stops) >= .97 && R.onFront / Math.max(1, R.stops) >= .97, `${R.onMesh} on, ${R.onFront} facing the shooter, of ${R.stops}`);
    check(`${id}: …from open air a bullet stops on the first face a bullet box holds, never past it`, R.late <= Math.max(1, .01 * R.stops), `${R.late} of ${R.stops} past it`);
    check(`${id}: a grenade resting at a wall sees what CS2 says it sees (HE damage, flashes, pickups: blocked under 2.5 %)`, R.heBlocked / Math.max(1, R.heVis) < .025, `${pc(R.heBlocked, R.heVis)} of ${R.heVis}`);
    console.log(`  ${id}: bulletPath ${(R.ms / Math.max(1, R.calls) * 1000).toFixed(0)} µs a line (pen 0)`);
    if (REPRO[id]) { const [e, t] = REPRO[id]; check(`${id}: the audit's shot from a wall-hugging eye at a target it sees passes`, segmentClear(boxes, ...e, ...t) && !mesh.blocked(...e, ...t, true)); }
    // Ladders (Nuke, Mirage): climbing up a ladder by its wall, shots leave the eye (a box the eye is in is passed).
    const lads = (M.ladders || []).map(([a, b, c, d, y0, y1]) => ({ minX: cx + a, maxX: cx + b, minZ: cz + c, maxZ: cz + d, y0, y1 }));
    if (lads.length) { const lw = { boxes, bounds, ladders: lads }; let n = 0, at0 = 0;
      for (const L of lads) { const thinX = L.maxX - L.minX <= L.maxZ - L.minZ, mx = (L.minX + L.maxX) / 2, mz = (L.minZ + L.maxZ) / 2;
        for (const sg of [-1, 1]) { const sx = thinX ? (sg < 0 ? L.minX - 1 : L.maxX + 1) : mx, sz = thinX ? mz : (sg < 0 ? L.minZ - 1 : L.maxZ + 1), look = thinX ? [-sg, 0] : [0, -sg]; if (blocked(boxes, bounds, sx, sz, L.y0 + .2)) continue;
          const st = createMoveState(L.y0 + .2); st.x = sx; st.z = sz; st.y = L.y0 + .2;
          for (let k = 0; k < 64 * 4; k++) { moveStep(st, { wish: look, weapon: 'ak', look, pitch: .6 }, lw, dt); if (k % 8) continue; const e = [st.x, st.y + 9.7, st.z];
            for (let a = 0; a < 8; a++) { const d = [Math.cos(a * Math.PI / 4), 0, Math.sin(a * Math.PI / 4)]; if (mesh.first(...e, e[0] + d[0] * 4 * HU, e[1], e[2] + d[2] * 4 * HU, true, null) < Infinity) continue; n++; if (bulletPath(boxes, ...e, ...d, 200, 0, RES).stop < 4 * HU * .9) at0++; } } } }
      check(`${id}: climbing its ladders, shots where CS2 is open leave the eye`, at0 === 0, `${at0} of ${n} stopped at the eye`); } }
  if (!maps) console.log('SKIP: map files — none in ' + dir);
}
console.log((fail ? 'FAIL' : 'PASS') + ': near-wall shots · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
