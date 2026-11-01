// Doors and glass (the v52 "gaps round Nuke's doors, glass you can't see through, B's glass not breaking, Cache's Long A
// doors crouch-only" report). Part one, always: the look's cuts (dist/look-cuts.js — the render's duplicate-door and other-
// mode cuts go by whole islands, so a door's frame stays; a door drawn lying flat turns onto its collision; which glass is
// drawn see-through; which panes break without a look of their own). Part two, with the map files (user-maps/<id>.bsp,
// skipped without them so CI passes): Cache's door collision stands where its door is drawn; Cache's Long A doorways are
// walked standing (the panes' collision is their glass, not one box over the door) and the glass is still there to break;
// every one of Nuke B's floor windows breaks, and with all of them broken the floor's clip still holds everyone up.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const LC = await import(REPO + '/dist/look-cuts.js');
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };

// ── The look's cuts, on made-up meshes (game units: x, y up, z) ──
// A box's 12 triangles (its 8 corners its own: one island).
const boxMesh = (p, ia, [x0, y0, z0], [x1, y1, z1]) => { const b = p.length / 3; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) p.push(x, y, z);
  for (const f of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) ia.push(b + f[0], b + f[1], b + f[2], b + f[0], b + f[2], b + f[3]); };
{ // A doorway: the frame (one island round the opening), CS2's swung-open copy of the leaf inside the door's open space, and a leaf elsewhere.
  const p = [], ia = [];
  boxMesh(p, ia, [-2, 0, -1], [62, 4, 6]);            // (0: the lintel — reaches past the door's space)
  boxMesh(p, ia, [0, 0, 0], [2, 110, 60]);           // (1: the copy of the leaf, swung open: 2 × 110 × 60)
  boxMesh(p, ia, [300, 0, 0], [302, 110, 60]);       // (2: a leaf far away: a decorative door)
  boxMesh(p, ia, [-3, 0, -3], [-1, 112, 63]);        // (3: a jamb inside the space, shaped unlike any of the door's pieces)
  const near = [{ b: [-4, 64, -4, 64, 0, 112], shapes: [[2, 60, 110]] }];
  const go = LC.dupCut(p, ia, near, 1, 1); ok('dupCut: something goes', !!go);
  const isl = t => Math.floor(t / 12), gone = new Set(); for (let t = 0; t < go.length; t++) if (go[t]) gone.add(isl(t));
  ok('dupCut: the swung-open copy of the leaf goes', gone.has(1), [...gone].join());
  ok('dupCut: the frame and jamb round the door stay (no see-through strips)', !gone.has(0) && !gone.has(3), [...gone].join());
  ok('dupCut: a door elsewhere stays', !gone.has(2));
  // modeCut: the whole island in the box goes; one reaching past it stays whole (Ramp's silo slit).
  const box = [-10, -10, -10, 10, 10, 10], hit = (L, t) => { for (let c = 0; c < 9; c += 3) if (t[c] < L[0] || t[c] > L[3] || t[c + 1] < L[1] || t[c + 1] > L[4] || t[c + 2] < L[2] || t[c + 2] > L[5]) return false; return true; };
  const q = [], qi = []; boxMesh(q, qi, [-5, -5, -5], [5, 5, 5]); boxMesh(q, qi, [0, 0, 0], [30, 2, 2]);
  const mc = LC.modeCut(q, qi, box, hit); ok('modeCut: the island inside goes', mc && mc.slice(0, 12).every(Boolean));
  ok('modeCut: the island reaching out of the box stays whole', mc && mc.slice(12).every(v => !v));
}
{ // A door drawn lying flat (its model's up its own x — Overpass) turns a quarter about its hinge onto its standing collision.
  const box = [0, 4, 0, 60, 0, 110], flat = [0, 110, 0, 60, -4, 0], t = LC.doorTurn(flat, box, [0, 0, 0], 8);
  ok('doorTurn: a flat door look finds its quarter turn', !!t && t.axis === 'z', JSON.stringify(t));
  const b = t && LC.turnBox(flat, [0, 0, 0], t.axis, t.angle); ok('doorTurn: turned, it stands on its collision', b && b.every((v, i) => Math.abs(v - box[i]) <= 8), JSON.stringify(b));
  ok('doorTurn: a look already on its collision stays', LC.doorTurn([1, 4, 0, 59, 0, 111], box, [0, 0, 0], 8) === null);
}
{ // Glass drawn see-through: CS2's glass shader comes untextured; painted windows, frames and opaque glass stay.
  for (const g of ['hr_glass_panel_001', 'ch2_sheet_glass_02_trans', 'inferno_glass_01', 'safety_glass_1', 'nuke_window_unbroken']) ok('see-through: ' + g, LC.seeThroughName(g, false));
  for (const [g, tx] of [['hr_glass_panel_001', true], ['glass_frame_metal', false], ['window_opaque_01', false], ['dust_windows_01', true], ['concrete_wall', false]]) ok('not see-through: ' + g + (tx ? ' (textured)' : ''), !LC.seeThroughName(g, tx));
  // Panes with no look of their own still break when they're window-shaped (thin); glass collision round a tree doesn't.
  ok('paneShaped: a thin window', LC.paneShaped({ kind: 'break', pane: true, box: [0, 4, 0, 210, 0, 206] }, 1));
  ok('paneShaped: glass collision round a trunk (thick)', !LC.paneShaped({ kind: 'break', pane: true, box: [0, 10.7, 0, 18.4, 0, 68] }, 1));
  ok('paneShaped: a crate is no pane', !LC.paneShaped({ kind: 'break', box: [0, 4, 0, 40, 0, 40] }, 1));
}

// ── The map files ──
const file = id => { const f = REPO + '/user-maps/' + id + '.bsp'; if (!existsSync(f)) return null; const b = readFileSync(f); return b.subarray(0, 4).toString() === 'CS2M' ? b : null; };
if (!file('cache') && !file('nuke')) { console.log(`PASS: Global Defensive doors & glass · ${n} checks (map files absent: their part skipped)`); process.exit(0); }
const AM = await import(REPO + '/dist/arena-maps.js'), MV = await import(REPO + '/dist/arena-move.js');
const load = id => { AM.useMapFile(id, file(id)); const M = AM.ARENA_MAPS[id], Hm = M.hammer, [W, D] = M.size, boxes = AM.mapBoxes(M, 0, 0);
  const G = (hx, hy) => [(hx - Hm.x0) * Hm.U - W / 2, (Hm.y1 - hy) * Hm.U - D / 2], gy = hz => (hz - Hm.zLow) * Hm.U, toH = (x, z, y) => [(x + W / 2) / Hm.U + Hm.x0, Hm.y1 - (z + D / 2) / Hm.U, y / Hm.U + Hm.zLow];
  return { M, Hm, boxes, G, gy, toH }; };

if (file('cache')) { const { M, boxes, G, gy, toH } = load('cache');
  // Cache's door (ch2_door_001, hinge 204 2046): drawn along x from the hinge (x 204…261, y 2042…2051) — its collision there too.
  const d = M.movers.find(m => m.kind === 'rotdoor'), a = toH(d.box[0], d.box[3], d.box[4]), c = toH(d.box[1], d.box[2], d.box[5]);
  ok('cache: the door\'s collision stands where it is drawn (along x from its hinge)', Math.abs(a[0] - 204) < 3 && Math.abs(c[0] - 261.4) < 3 && a[1] > 2038 && c[1] < 2054, JSON.stringify([a, c].map(v => v.map(Math.round))));
  // Long A's two doorways (the panes' glass round them: one 310 × 110 box over the open door, one 210 × 206): walked standing,
  // the windows whole.
  for (const b of boxes.movers) b.off = b.mat === 'door' ? true : b.role !== 'shut';
  const rows = [['east doorway (pane over x 727…1037, y 2058)', [920, 936, 952].map(hx => [hx, 2058]), 1702], ['west doorway (pane over y 2056…2266, x 514; just either side of it)', [[506, 2120], [506, 2160], [522, 2120], [522, 2180]], 1700]];
  for (const [name, pts, fz] of rows) { const bad = [];
    for (const [hx, hy] of pts) { const [x, z] = G(hx, hy), g = MV.groundAt(boxes, x, z, gy(fz + 20)); if (Math.abs(toH(0, 0, g)[2] - fz) > 12 || MV.blocked(boxes, null, x, z, g)) bad.push([hx, hy, +toH(0, 0, g)[2].toFixed(1)]); }
    ok('cache: Long A ' + name + ' walked standing, the window whole', !bad.length, JSON.stringify(bad)); }
  const rp = M.movers.filter(m => m.rects); ok('cache: the doorway panes keep their glass as collision (boxes to break)', rp.length >= 2 && rp.every(m => m.rects.length >= 2 && boxes.movers.filter(b => b.mover === M.movers.indexOf(m) && b.role === 'shut').length === m.rects.length), rp.length + ' panes');
}

if (file('nuke')) { const { M, boxes, G, gy, toH } = load('nuke');
  // B's floor windows (Hammer x 323…872, y −1084…−702, z −772): every one a glass pane that breaks.
  const inB = m => { const a = toH(m.box[0], m.box[3], m.box[4]), c = toH(m.box[1], m.box[2], m.box[5]); return a[0] > 300 && c[0] < 900 && a[1] > -1100 && c[1] < -690 && Math.abs(c[2] + 772) < 10; };
  const floor = M.movers.filter(m => m.kind === 'break' && m.pane && m.glass && inB(m)); ok('nuke: B\'s floor windows are breakable glass panes', floor.length >= 43, floor.length + ' panes');
  // All broken: the clip under them holds (nobody falls into B).
  for (const b of boxes.movers) b.off = b.mat === 'door' ? true : b.role !== 'shut' || floor.includes(M.movers[b.mover]);
  let spots = 0, held = 0; const bad = [];
  for (let hx = 360; hx <= 840; hx += 60) for (let hy = -1060; hy <= -720; hy += 50) { const [x, z] = G(hx, hy), g = MV.groundAt(boxes, x, z, gy(-740)); spots++; if (toH(0, 0, g)[2] > -790) held++; else if (bad.length < 4) bad.push([hx, hy, +toH(0, 0, g)[2].toFixed(0)]); }
  ok('nuke: B\'s floor windows all broken, the floor still holds', held / spots >= .95, held + '/' + spots + ' ' + JSON.stringify(bad));
}
console.log(`PASS: Global Defensive doors & glass · ${n} checks`);
