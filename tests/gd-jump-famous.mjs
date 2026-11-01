// Named CS2 jump spots, hand-picked per map (user-maps, converted on this computer; skips without them): boxes and ledges
// players know — Dust II's B box, Mirage's mid window box, Inferno's A boxes, Nuke's CT boxes, Cache's B box, Ancient's
// ruins box, … — each with a Hammer take-off point and a straight run at its face (not found by a filter: crates, low
// steps and stacks as they stand, including those whose player hull is taller than their look). For each:
//  · its height for players is CS2's: the file's player physics (CS2's collision for players, player clips included)
//    at the spot = the table (±1 HU), and the top the movement stands on = that (±1 HU). CS2's triangles (grenade/look
//    mesh, no player clips) are printed beside it: CS2 often hulls a crate higher than it looks (Mirage's A and B boxes
//    look 65 HU and are 70–71 for players), and a player can't jump higher than the hull, so the triangles never decide;
//  · where the body stops against the face is within 10 HU of where CS2's 32-HU-wide hull stops against the triangles
//    (the movement's columns are 16 HU wide, the body 8.5 HU in radius: a column's half, plus where CS2's player hull is
//    wider than the triangles — Overpass's B box: 52 HU for players, 48.5 to look at; measured −9.4…+7.1 HU);
//  · run at it (250 HU/s) and jumped at from 0–96 HU before the face, plainly and crouch-jumping (duck from the tick after
//    the take-off), with the game's movement and clock: a plain jump gets on a "plain" spot (≤ 57 HU: sv_jump_impulse
//    301.993, sv_gravity 800 → apex 57.0), only a crouch-jump on a "crouch-jump" spot (58–64; reach ~66), neither on
//    an "impossible" one (≥ 67).
// Named low ceilings (Nuke's B vent, Inferno's apartments and the space under the bridge): CS2's room there is 54–72 HU
// (crouching, not standing); the movement's ceiling = CS2's (±1 HU); a crouched body that lets go of the duck stays down.
//   node tests/gd-jump-famous.mjs [--files user-maps] [map ids…]
import { readFileSync, existsSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { parseCs2Map } from '../dist/cs2-map.js';
import { createMoveState, createMoveClock, moveTicks, pressJump, blocked, MOVE, HU } from '../dist/arena-move.js';
import { ARENA } from '../dist/facility-layout.js';
import { boxesNear } from '../dist/box-grid.js';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const dir = opt('--files') || 'user-maps', only = argv;
// [name, take-off Hammer x,y, floor z, spot x,y, CS2 player height (HU over the floor), kind]
const SPOTS = {
  dust2: [['B site box', -1581, 2615, 6, -1581, 2755, 59, 'crouch-jump'], ['A site stacked box', 899, 2467, 95, 1039, 2467, 75, 'impossible'], ['Upper tunnel box', -1801, 1136, 32, -1801, 1276, 38, 'plain']],
  mirage: [['Mid window box', -1386, -1014, -168, -1386, -874, 56.5, 'plain'], ['Side alley box', 281, 621, -258, 421, 621, 47, 'plain'], ['B site box', -2068, 387, -160, -1928, 387, 70, 'impossible'], ['A site box', -456, -2130, -180, -316, -2130, 71, 'impossible'], ['Top of mid box', 323, -884, -164, 323, -744, 76, 'impossible']],
  inferno: [['A site box', 1999, 279, 160, 1999, 419, 60, 'crouch-jump'], ['A site box by the arch', 2073, 557, 160, 2073, 697, 60, 'crouch-jump'], ['A site small box', 1911, 223, 160, 2051, 223, 49, 'plain'], ['Banana box', 428, 1950, 134, 428, 1810, 92, 'impossible']],
  nuke: [['CT box', 3054, -456, -352, 3054, -316, 59, 'crouch-jump'], ['CT low box', 3107, -428, -352, 3107, -288, 53, 'plain'], ['Mini box', 422, -1694, -416, 422, -1554, 48, 'plain'], ['Outside box', 1124, -1492, -416, 1124, -1352, 76, 'impossible'], ['Ramp box', 310, 275, -415, 450, 275, 75, 'impossible']],
  overpass: [['B site box', -1230, 21, 102, -1230, 161, 52, 'plain'], ['Connector box', -2092, -958, 132, -2092, -818, 48.5, 'plain'], ['Construction box', -1014, -494, 100, -874, -494, 83, 'impossible'], ['Alley box', -756, -1546, 149, -896, -1546, 88, 'impossible']],
  ancient: [['Ruins box', 1004, -1357, 2, 1144, -1357, 58, 'crouch-jump'], ['A site step', -1409, 844, 54, -1269, 844, 32, 'plain'], ['A site box', -1357, 847, 54, -1217, 847, 74, 'impossible']],
  anubis: [['Main box', 1654, 1194, -152, 1794, 1194, 45, 'plain'], ['Bridge box', -284, -214, 0, -284, -74, 38, 'plain'], ['Mid box', 84, 1132, -32, 84, 992, 84, 'impossible']],
  cache: [['B site box', -56, -1503, 1660, -196, -1503, 63, 'crouch-jump'], ['Window box', 744, -1149, 1612, 884, -1149, 54, 'plain'], ['Entrance box', -820, -522, 1612, -680, -522, 37, 'plain'], ['Long hall box', 538, -516, 1612, 538, -656, 78.5, 'impossible']],
};
// [name, Hammer x,y, floor z, CS2 room (HU)]
const LOW = { nuke: [['B vent crawl', -63, -1299, -484, 60]], inferno: [['Apartments', 1188, -540, 392, 60], ['Under the bridge', -252, -252, -48, 65]] };
const ids = Object.keys(SPOTS).filter(id => (!only.length || only.includes(id)) && existsSync(`${dir}/${id}.bsp`));
if (!ids.length) { console.log('SKIP: no CS2 map files in ' + dir); process.exit(0); }
let ok = 0, n = 0, maps = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const cx = ARENA.cx, cz = ARENA.cz, BOX = [], f1 = v => v === v ? (Math.round(v * 10) / 10).toString() : '–';
for (const id of ids) { const buf = readFileSync(`${dir}/${id}.bsp`); if (buf.subarray(0, 4).toString() !== 'CS2M') continue;
  useMapFile(id, buf); const M = ARENA_MAPS[id], HM = M.hammer; if (!HM) continue; maps++;
  const boxes = mapBoxes(M, cx, cz), NM = boxes.nadeMesh, raw = parseCs2Map(buf), R = Number.isFinite(boxes.bodyRadius) ? boxes.bodyRadius : MOVE.radius; for (const b of boxes.movers || []) b.off = true;
  const [W, D] = M.size, world = { boxes, bounds: { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 }, ladders: [] };
  const gx = hx => (hx - HM.x0) * HM.U - HM.W / 2 + cx, gz = hy => (HM.y1 - hy) * HM.U - HM.D / 2 + cz, gy = h => (h - HM.zLow) * HM.U, th = y => y / HM.U + HM.zLow;
  // Tops at a Hammer point within [lo, hi]: CS2's player physics (its solid stretches), CS2's triangles (a ray down), the movement's boxes.
  const pTop = (hx, hy, lo, hi) => { let t = NaN; for (const [, top] of raw.solidSpans(0, hx, hy, lo - 200, hi)) if (top >= lo && top <= hi && !(top <= t)) t = top; return t; };
  const meshTop = (hx, hy, lo, hi) => { if (!NM) return NaN; const x = gx(hx), z = gz(hy), w = NM.first(x, gy(hi), z, x, gy(lo), z); return w === Infinity ? NaN : hi - w * (hi - lo); };
  const boxTop = (hx, hy, lo, hi) => { const x = gx(hx), z = gz(hy); let t = NaN; for (const b of boxesNear(boxes, x - .01, z - .01, x + .01, z + .01, BOX)) if (!b.off && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && th(b.y1) >= lo && th(b.y1) <= hi && !(th(b.y1) <= t)) t = th(b.y1); return t; };
  const listed = [];
  for (const [name, fx, fy, fz, tx, ty, want, kind] of SPOTS[id]) {
    const P = pTop(tx, ty, fz + 20, fz + 100) - fz, B = boxTop(tx, ty, fz + 20, fz + 100) - fz, T = meshTop(tx, ty, fz + 20, fz + 100) - fz;
    // The face along the run (Hammer units from the take-off): where CS2's triangles and the movement's boxes first rise 20 HU.
    const L = Math.hypot(tx - fx, ty - fy), ux = (tx - fx) / L, uy = (ty - fy) / L; let eM = NaN, eB = NaN;
    for (let s = 0; s <= L; s += .5) { const hx = fx + ux * s, hy = fy + uy * s; if (eM !== eM && meshTop(hx, hy, fz + 20, fz + 100) >= fz + 20) eM = s; if (eB !== eB && boxTop(hx, hy, fz + 20, fz + 100) >= fz + 20) eB = s; }
    const stop = eB - R / HU - (eM - 16);   // (body stops R short of the boxes; CS2's hull 16 HU short of the triangles — on an axis-aligned face)
    // Run at it and jump d HU before the body meets the face; on = standing on its top within the run's 1.2 s.
    const wx0 = gx(tx) - gx(fx), wz0 = gz(ty) - gz(fy), wn = Math.hypot(wx0, wz0), wx = wx0 / wn, wz = wz0 / wn, ex = gx(fx + ux * eB), ez = gz(fy + uy * eB);
    const gets = crouch => { for (let d = 0; d <= 96; d += 6) { const s = createMoveState(gy(fz)); s.x = gx(fx); s.z = gz(fy); s.vx = wx * 250 * HU; s.vz = wz * 250 * HU;
        const clk = createMoveClock(), inp = { wish: [wx, wz], weapon: 'knife', duck: false }; let k0 = -1;
        for (let k = 0; k < 128 * 1.2; k++) { if (k0 < 0 && (ex - s.x) * wx + (ez - s.z) * wz <= R + (d + .3) * HU) { k0 = k; pressJump(clk, NaN); }
          inp.duck = crouch && k0 >= 0 && k > k0; moveTicks(s, clk, inp, world, 1 / 128);
          if (k0 >= 0 && s.onGround && Math.abs(th(s.y) - fz - B) < 2.5) return true; } }
      return false; };
    const plain = gets(false), cj = gets(true), wantOn = kind === 'plain' ? [true, true] : kind === 'impossible' ? [false, false] : [false, true];
    listed.push(`${name} ${P} HU (${kind})`);
    check(`${id} · ${name}: ${want} HU for players in CS2 (${kind}) — movement top = CS2's, the face within 10 HU, ${kind === 'plain' ? 'a plain jump gets on' : kind === 'impossible' ? 'no jump gets on' : 'only a crouch-jump gets on'}`,
      Math.abs(P - want) <= 1 && Math.abs(B - P) <= 1 && (eM !== eM || Math.abs(stop) <= 10) && plain === wantOn[0] && cj === wantOn[1],
      `CS2 player collision ${f1(P)} · movement ${f1(B)} · CS2 triangles ${f1(T)} HU · body stops ${f1(stop)} HU from where CS2's hull would · plain ${plain ? 'on' : 'no'}, crouch-jump ${cj ? 'on' : 'no'}`); }
  console.log(`${id}: known jump spots — ${listed.join(' · ')}`);
  for (const [name, hx, hy, fz, room] of LOW[id] || []) { const x = gx(hx), z = gz(hy);
    // CS2's room: the gap over the floor stretch there. The movement's: its floor and lowest ceiling over the body's footprint.
    let cRoom = NaN; const sp = [...raw.solidSpans(0, hx, hy, fz - 100, fz + 200)]; for (let i = 0; i + 1 < sp.length; i++) if (Math.abs(sp[i][1] - fz) < 1) cRoom = sp[i + 1][0] - sp[i][1];
    const fl = boxTop(hx, hy, fz - 2, fz + 2); let ceil = Infinity; for (const b of boxesNear(boxes, x - R, z - R, x + R, z + R, BOX)) if (!b.off && th(b.y0) > fl + 1 && x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R) ceil = Math.min(ceil, th(b.y0));
    const y = gy(fl), s = createMoveState(y); s.x = x; s.z = z; s.ducked = true; s.duck = 1; const clk = createMoveClock(), idle = { wish: [0, 0], weapon: 'knife', duck: false };
    const fits = !blocked(boxes, world.bounds, x, z, y, MOVE.duckHeight, R), stands = !blocked(boxes, world.bounds, x, z, y, MOVE.height, R);
    for (let t = 0; t < 128; t++) moveTicks(s, clk, idle, world, 1 / 128);
    check(`${id} · ${name}: ${room} HU of room in CS2 (crouch, not stand) — the movement's ceiling = CS2's, letting go of crouch keeps you down`,
      Math.abs(cRoom - room) <= 1 && Math.abs(ceil - fl - cRoom) <= 1 && fits && !stands && s.ducked && s.onGround && Math.abs(th(s.y) - fl) < 1,
      `CS2 room ${f1(cRoom)} · movement room ${f1(ceil - fl)} HU · crouched body fits ${fits}, standing fits ${stands} · after 1 s with the key up: ${s.ducked ? 'crouched' : 'standing'}`); } }
if (!maps) { console.log('SKIP: no CS2 map files in ' + dir); process.exit(0); }
console.log(`${ok === n ? 'PASS' : 'FAIL'}: named CS2 jump spots · ${ok}/${n}`); if (ok !== n) process.exitCode = 1;
