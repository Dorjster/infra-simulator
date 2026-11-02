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
  // Every glass on B breaks (the v52.0.1 report "Nuke's B glasses should break like the vent's board"): the 44 floor
  // windows, the 20 floor panels the importer made world (17 over metal, 3 under a metal plate's collision — 2 panes, one
  // two layers) and the 2 Observation windows (no glass collision in the file) — cs-maps/cs2-extra-panes.js.
  const inBAll = m => { const a = toH(m.box[0], m.box[3], m.box[4]), c = toH(m.box[1], m.box[2], m.box[5]); return a[0] > -300 && c[0] < 1045 && a[1] > -1100 && c[1] < -400 && a[2] > -780 && c[2] < -500; };
  const glass = M.movers.map((m, id) => ({ m, id })).filter(({ m }) => m.kind === 'break' && m.glass && inBAll(m));
  ok('nuke: every glass on B is a breakable glass pane (floor windows, the panels over and under metal, Observation)', glass.length >= 65 && glass.filter(q => q.m.pane).length === glass.length, glass.length + ' panes');
  // A shot at each from two places (bulletPath as weapons.js and the host's bots fire it: a pane crossed breaks).
  for (const b of boxes.movers) b.off = b.mat === 'door' ? true : b.role !== 'shut';
  const BP = new AM.BulletPath(), G3 = (hx, hy, hz) => { const [x, z] = G(hx, hy); return [x, gy(hz), z]; }; let shot = 0; const miss = [];
  for (const { m, id } of glass) { const a = toH(m.box[0], m.box[3], m.box[4]), c = toH(m.box[1], m.box[2], m.box[5]), cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2, cz = (a[2] + c[2]) / 2, flat = c[2] - a[2] < 15; let got = 0;
    for (const e of flat ? [[cx - 60, cy - 40, -708], [cx + 50, cy + 30, -708]] : [[cx - 48, cy, cz + 10], [cx + 45, cy, cz + 15]]) { const [ex, ey, ez] = G3(...e), [tx, ty, tz] = G3(cx, cy, flat ? c[2] : cz), L = Math.hypot(tx - ex, ty - ey, tz - ez);
      AM.bulletPath(boxes, ex, ey, ez, (tx - ex) / L, (ty - ey) / L, (tz - ez) / L, L + 5, 0, BP); const end = Math.min(BP.stop, L + 5); if (BP.crossed.some(q => q.t0 <= end && q.b?.mover === id) || BP.stopBox?.mover === id) got++; }
    if (got) shot++; else if (miss.length < 4) miss.push([id, a.map(Math.round)]); }
  ok('nuke: a shot reaches every glass on B (its pane is crossed before anything stops the bullet)', shot === glass.length, shot + '/' + glass.length + ' · missed ' + JSON.stringify(miss));
  // The added panes: the same on every computer (each parse gives the same movers, in the same order), after the file's own.
  { const { parseCs2Map } = await import(REPO + '/dist/cs2-map.js'), r1 = parseCs2Map(file('nuke')), r2 = parseCs2Map(file('nuke')), sig = r => r.entities.map(e => e.added ? e.model : '').join();
    const firstAdded = r1.entities.findIndex(e => e.added); ok('nuke: the added glass panes are the same on every computer, after the file\'s own entities', sig(r1) === sig(r2) && firstAdded > 0 && r1.entities.slice(firstAdded).every(e => e.added), 'first added entity ' + firstAdded); }
  // All of B's glass broken: the floor holds there too (the panels over metal keep the metal; the windows' floor its own).
  const floorSpots = []; for (let hx = -280; hx <= 860; hx += 40) for (let hy = -1060; hy <= -700; hy += 40) { const [x, z] = G(hx, hy), fz = toH(0, 0, MV.groundAt(boxes, x, z, gy(-740)))[2]; if (Math.abs(fz + 770) < 8) floorSpots.push([x, z]); }   // (B's floor, glass whole)
  for (const b of boxes.movers) b.off = b.mat === 'door' ? true : b.role !== 'shut' || glass.some(q => q.id === b.mover);
  const s2 = floorSpots.length, h2 = floorSpots.filter(([x, z]) => toH(0, 0, MV.groundAt(boxes, x, z, gy(-740)))[2] > -790).length;
  ok('nuke: all of B\'s glass broken, B\'s floor still holds everywhere', s2 > 150 && h2 === s2, h2 + '/' + s2 + ' spots');
  // Bots' bullets break glass (the host: arena-logic.js shotGlass — on every bot shot, hit or miss, along its line), for
  // everyone (the room's map state), once; and the round's reset makes it whole (arena-defuse.js / freshMatch).
  { const AL = await import(REPO + '/dist/arena-logic.js'), { ARENA } = await import(REPO + '/dist/facility-layout.js'), game = { mode: 'arena', arena: { map: 'nuke', kind: 'defuse', bots: [] }, combat: {} };
    const W3 = (hx, hy, hz) => { const [x, y, z] = G3(hx, hy, hz); return [x + ARENA.cx, y, z + ARENA.cz]; };
    const pane = glass.find(q => q.m.pane && toH(q.m.box[0], q.m.box[3], q.m.box[4])[0] > 440 && toH(q.m.box[0], q.m.box[3], q.m.box[4])[0] < 460 && Math.abs(toH(0, 0, q.m.box[5])[2] + 772) < 2) || glass[0], a = toH(pane.m.box[0], pane.m.box[3], pane.m.box[4]), c = toH(pane.m.box[1], pane.m.box[2], pane.m.box[5]);
    const tgt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, -790], eye = [tgt[0] - 40, tgt[1] - 30, -708];   // (a bot on B shooting someone below the glass — the line crosses the pane)
    const n1 = AL.shotGlass(game, ...W3(...eye), ...W3(...tgt)), st = AL.mapStateOf(game);
    ok('nuke: a bot\'s shot through a B window breaks it for everyone (host map state)', n1 === 1 && st.broken[pane.id] === 1, 'broke ' + n1 + ', state ' + JSON.stringify(st.broken));
    ok('nuke: …once (a second shot there breaks nothing more)', AL.shotGlass(game, ...W3(...eye), ...W3(...tgt)) === 0);
    const wall = AL.shotGlass(game, ...W3(1000, -465, -700), ...W3(1000, -465, -1000)); ok('nuke: a bot\'s shot that meets no glass breaks nothing', wall === 0, 'broke ' + wall); }
  // Broken windows: as CS2's collision lets players through, or doesn't (the v52 report "Nuke's B glasses: when they break
  // we can go through the window"). CS2's crouched hull (32 × 54) fits through none of Nuke's 36 standing panes with their
  // glass gone — its player clips and frames fill the openings (checked against CS2's own collision when
  // cs-maps/cs2-pane-clips.js was made; the export isn't in the repo) — but the importer opened the players' collision at
  // every pane, so a broken one let our narrower body through (the Observation windows over B: walked out of at a run).
  // With every pane broken: no body fits through any of them, anywhere across its opening (feet from a crouch under its
  // sill to its top), the run at the Observation window stays in the room, and bullets and sight still go through it.
  { const PC = (await import(REPO + '/dist/cs-maps/cs2-pane-clips.js')).default.nuke || [], U = M.hammer.U, world = { boxes, bounds: null, ladders: [], others: [] };
    for (const b of boxes.movers) b.off = true;   // (every door open, every pane broken)
    const tall = M.movers.map((m, id) => ({ m, id })).filter(({ m }) => m.kind === 'break' && m.pane && m.box[5] - m.box[4] >= 12 * U && Math.min(m.box[1] - m.box[0], m.box[3] - m.box[2]) <= 16 * U);
    const through = []; for (const { m, id } of tall) { const [x0, x1, z0, z1, y0, y1] = m.box, thinX = x1 - x0 < z1 - z0, c = thinX ? (x0 + x1) / 2 : (z0 + z1) / 2; let at = null;
      for (let u = thinX ? z0 : x0; u <= (thinX ? z1 : x1) && !at; u += 2 * U) for (let f = y0 - 54 * U; f < y1 - 26 * U && !at; f += 2 * U) { const [x, z] = thinX ? [c, u] : [u, c]; if (!MV.blocked(boxes, null, x, z, f, MV.MOVE.duckHeight)) at = toH(x, z, f).map(Math.round); }
      if (at) through.push([id, ...at]); }
    ok('nuke: every standing pane, broken, still keeps players out as CS2\'s collision does (no body fits through any)', tall.length >= 36 && !through.length && PC.length >= 29, tall.length + ' panes, ' + through.length + ' let a body through · e.g. ' + JSON.stringify(through.slice(0, 4)));
    const [ox, oz] = G(1230, -400), s = MV.createMoveState(MV.groundAt(boxes, ox, oz, gy(-600))); s.x = ox; s.z = oz;
    for (let t = 0; t < 128 * 2; t++) MV.moveStep(s, { wish: [0, -1], look: [0, -1], weapon: 'knife', jump: t % 40 < 3, duck: t > 128 }, world, 1 / 128);
    const end = toH(s.x, s.z, s.y); ok('nuke: running and jumping at the broken Observation window (y −354) stays in the room', end[1] < -350, end.map(Math.round).join(','));
    const BP = new AM.BulletPath(), [ax, az] = G(1230, -420), [bx, bz] = G(1230, -300), ay = gy(-580), L = Math.hypot(bx - ax, bz - az); AM.bulletPath(boxes, ax, ay, az, (bx - ax) / L, 0, (bz - az) / L, L, 0, BP);
    ok('nuke: …while a shot goes through it (nothing stops it at the window)', BP.stop >= L * .66, 'stopped after ' + (BP.stop / U).toFixed(0) + ' of ' + (L / U).toFixed(0) + ' HU');
    if (M.nav?.sight) ok('nuke: …and so does sight (the bots\' line through the columns)', M.nav.sight(ax, ay, az, bx, ay, bz)); }
}
console.log(`PASS: Global Defensive doors & glass · ${n} checks`);
