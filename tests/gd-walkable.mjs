// Must-walk spots on the eight CS2 map files (user-maps; skipped without them): every spot where v51.0.0's own map build
// and movement code could stand and walk must still be walkable with today's code — the bomb sites (a 7×7 patch at 32
// Hammer units round each site's goal and middle: Nuke's B under A first of all), every team spawn, points along the
// standard routes (Lobby > Ramp > B, Outside > Secret > B, A > Vents > B…) and a grid every 144 units over every floor.
// At each spot (the walk sweep of the v52 "Nuke B not walkable" report, scratchpad walk/sweep.mjs, kept as a test):
//   floor  — dropped from 1.5 units above, the body comes to rest on that floor (no hole);
//   stand  — a standing hull fits there (where v51's did), and a crouched one does;
//   walk   — the real moveStep at 128 Hz with the knife, 8 directions to 64 units each: no 2 directions lost that v51
//            walked (a direction lost: under 40 units where v51 made 48+), never stuck, and not 1.3× slower;
//   ladders — each one v51 climbed up / down still climbed.
// The spots (Hammer units, so a new game frame keeps them) and v51's results are in tests/fixtures/gd-walkable.json with
// a hash of each map file: a different file (a CS2 update) is skipped with a note — record again. Doors are open and
// panes broken (the map's own shapes; doors have their own tests). Self-tests: a 12-unit box dropped on Nuke's B site and
// a taller hull are both caught.
//   node tests/gd-walkable.mjs [map ids…]
//   node tests/gd-walkable.mjs --record --root <v51.0.0 checkout> [map ids…]   (writes the fixture from that code)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, ''), FIX = REPO + '/tests/fixtures/gd-walkable.json';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; }, flag = k => { const i = argv.indexOf(k); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const RECORD = flag('--record'), ROOT = (opt('--root') || REPO).replace(/\/$/, ''), only = argv;
const MAPS = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass'];
const GRID = 9, SITE = 3, SITE_STEP = 32, ROUTE_EVERY = 6;   // grid every 9 columns (144 HU); sites ±3 × 32 HU; every 6th route point
const ROUTES = {   // (tests/gd-map-entities.mjs: CS2's place names)
  nuke: [['TSpawn', 'Outside', 'Secret', 'BombsiteB'], ['Lobby', 'Ramp', 'BombsiteB'], ['TSpawn', 'Lobby', 'Hut', 'BombsiteA'], ['CTSpawn', 'Hell', 'BombsiteA'], ['BombsiteA', 'Vents', 'BombsiteB'], ['CTSpawn', 'Garage', 'Secret'], ['CTSpawn', 'BombsiteA'], ['Control', 'Ramp'], ['Admin', 'Ramp']],
  inferno: [['TSpawn', 'Banana', 'BombsiteB'], ['TSpawn', 'Apartments', 'Balcony', 'BombsiteA'], ['CTSpawn', 'BombsiteB'], ['TSpawn', 'Middle', 'BombsiteA'], ['CTSpawn', 'BombsiteA']],
  overpass: [['TSpawn', 'Connector', 'BombsiteB'], ['TSpawn', 'Pipe', 'BombsiteB'], ['TSpawn', 'Water', 'BombsiteB'], ['TSpawn', 'Playground', 'BombsiteA'], ['TSpawn', 'UpperPark', 'BombsiteA'], ['BombsiteA', 'Connector', 'BombsiteB']],
  mirage: [['TSpawn', 'PalaceInterior', 'BombsiteA'], ['TSpawn', 'Middle', 'Connector', 'BombsiteA'], ['TSpawn', 'Apartments', 'BombsiteB'], ['CTSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteB']],
  dust2: [['TSpawn', 'LongDoors', 'LongA', 'BombsiteA'], ['TSpawn', 'UpperTunnel', 'BombsiteB'], ['TSpawn', 'Middle', 'Catwalk', 'BombsiteA'], ['CTSpawn', 'BombsiteB'], ['CTSpawn', 'BombsiteA']],
  ancient: [['TSpawn', 'Middle', 'BombsiteA'], ['TSpawn', 'BombsiteB'], ['TSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteB']],
  anubis: [['TSpawn', 'Middle', 'Connector'], ['TSpawn', 'BombsiteA'], ['TSpawn', 'BombsiteB'], ['CTSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteB']],
  cache: [['TSpawn', 'Squeaky', 'BombsiteA'], ['TSpawn', 'Middle', 'BombsiteB'], ['CTSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteB']],
};
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]].map(([x, z]) => { const l = Math.hypot(x, z); return [x / l, z / l]; });
const DIRN = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const SRC = { g: 'grid', s: 'site', p: 'spawn', r: 'route' };

const AM = await import(ROOT + '/dist/arena-maps.js'), MV = await import(ROOT + '/dist/arena-move.js'), HU = MV.HU;
let pass = 0, fail = 0, skipped = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; if (!ok || process.env.VERBOSE) console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' · ' + info : '')); };

// One spot: floor, stand / crouch room, 8 walks (crouched where only a crouch fits).
function evalSpot(world, x, z, y) {
  const dt = 1 / 128, r = MV.MOVE.radius * .5, b = world.boxes, bd = world.bounds;
  const stand = !MV.blocked(b, bd, x, z, y + .05, MV.MOVE.height * .95, r), crouch = stand || !MV.blocked(b, bd, x, z, y + .05, MV.MOVE.duckHeight * .95, r);
  const duck = !stand, inp = { wish: [0, 0], weapon: 'knife', duck };
  let s = MV.createMoveState(y + 1.5); s.x = x; s.z = z; s.onGround = false; if (duck) { s.duck = 1; s.ducked = true; }
  for (let t = 0; t < 64; t++) MV.moveStep(s, inp, world, dt);
  const floor = Math.abs(s.y - y) <= 3, dist = [], ok = [], tt = [];
  for (const [dx, dz] of DIRS) { s = MV.createMoveState(y); s.x = x; s.z = z; if (duck) { s.duck = 1; s.ducked = true; }
    const wi = { wish: [dx, dz], weapon: 'knife', duck }; let t = 0;
    for (; t < 100; t++) { MV.moveStep(s, wi, world, dt); if (Math.hypot(s.x - x, s.z - z) >= 64 * HU) break; if (y - s.y > 400 * HU) break; }
    const d = Math.hypot(s.x - x, s.z - z) / HU; dist.push(d); ok.push(d >= 48 && (s.y - y) / HU > -400); tt.push(t + 1); }
  return { stand, crouch, floor, dist, ok, tt, nok: ok.filter(Boolean).length };
}
// A ladder climbed from its foot (looking up) or its top (looking down) for 6 s: the share of its height covered.
function climb(world, L, up) { const cx = (L.minX + L.maxX) / 2, cz = (L.minZ + L.maxZ) / 2, thinX = (L.maxX - L.minX) < (L.maxZ - L.minZ); let best = 0;
  for (const sgn of [1, -1]) { const nx = thinX ? sgn : 0, nz = thinX ? 0 : sgn, off = (thinX ? (L.maxX - L.minX) : (L.maxZ - L.minZ)) / 2 + MV.MOVE.radius + .3;
    const s = MV.createMoveState(up ? L.y0 : L.y1); s.x = cx + nx * off; s.z = cz + nz * off; s.y = (up ? L.y0 : L.y1) + .05;
    const inp = { wish: [-nx, -nz], weapon: 'knife', look: [-nx, -nz], pitch: up ? .5 : -.9 }; let top = s.y, bot = s.y;
    for (let t = 0; t < 128 * 6; t++) { MV.moveStep(s, inp, world, 1 / 128); top = Math.max(top, s.y); bot = Math.min(bot, s.y); }
    best = Math.max(best, up ? (top - L.y0) / (L.y1 - L.y0) : (L.y1 - bot) / (L.y1 - L.y0)); }
  return best; }

function loadMap(id) {
  const f = ROOT + '/user-maps/' + id + '.bsp'; if (!existsSync(f)) return null; const buf = readFileSync(f); if (buf.subarray(0, 4).toString() !== 'CS2M') return null;
  const sha = createHash('sha1').update(buf).digest('hex').slice(0, 16); AM.useMapFile(id, buf); const M = AM.ARENA_MAPS[id];
  const boxes = AM.mapBoxes(M, 0, 0); for (const b of boxes.movers || []) b.off = true;
  const [W, D] = M.size, bounds = { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 };
  const ladders = (M.ladders || []).map(([a, b, c, d, y0, y1]) => ({ minX: a, maxX: b, minZ: c, maxZ: d, y0, y1 }));
  const Hm = M.hammer, toH = (x, z, y) => [(x + Hm.W / 2) / Hm.U + Hm.x0, Hm.y1 - (z + Hm.D / 2) / Hm.U, y / Hm.U + Hm.zLow], fromH = (hx, hy, hz) => [(hx - Hm.x0) * Hm.U - Hm.W / 2, (Hm.y1 - hy) * Hm.U - Hm.D / 2, (hz - Hm.zLow) * Hm.U];
  const C = M.columns, G = C.G, place = (x, z, y) => { const c = Math.floor((x + C.W / 2) / C.cell), r = Math.floor((z + C.D / 2) / C.cell); if (c < 0 || r < 0 || c >= G.cols || r >= G.rows) return ''; const i = r * G.cols + c, h = y / C.U + C.zLow; let best = -1, bd = 1e9; for (let k = 0; k < G.n[i]; k++) { const d = Math.abs(G.z[i * 3 + k] - h); if (d < bd) { bd = d; best = k; } } return best >= 0 && bd < 64 ? (G.places[G.place[i * 3 + best]] || '') : ''; };
  return { id, M, sha, boxes, world: { boxes, bounds, ladders, others: [] }, toH, fromH, place };
}

// ───────── record: the spots v51's code walks (run with --root on a v51.0.0 checkout) ─────────
function record(L) {
  const { M, toH, world } = L, Hm = M.hammer, spots = new Map(), add = (x, z, y, src) => { const k = `${Math.round(x / (4 * HU))},${Math.round(z / (4 * HU))},${Math.round(y / (8 * HU))}`; if (!spots.has(k)) spots.set(k, { x, z, y, src }); };
  const C = M.columns, G = C.G;
  const snap = (x, z, y) => { const g = M.nav?.floorAt?.(x, z, y + 18 * HU); return Number.isFinite(g) && Math.abs(g - y) < 40 * HU ? g : y; };
  for (const S of ['B', 'A']) { const g = M.siteGoals?.[S], c = M.sites?.[S];
    for (const [p, what] of [[g, 'goal'], [c, 'centre']]) { if (!p || p.length < 3) continue; const y0 = snap(p[0], p[1], what === 'goal' ? p[2] : (g?.[2] ?? p[2]));
      for (let dx = -SITE; dx <= SITE; dx++) for (let dz = -SITE; dz <= SITE; dz++) { const x = p[0] + dx * SITE_STEP * HU, z = p[1] + dz * SITE_STEP * HU; add(x, z, snap(x, z, y0), 's'); } } }
  for (const P of [M.t, M.ct]) for (const p of P || []) add(p[0], p[1], p[2], 'p');
  const gxz = i => [-M.size[0] / 2 + (i % G.cols + .5) * C.cell, -M.size[1] / 2 + (((i / G.cols) | 0) + .5) * C.cell], gy = h => (h - Hm.zLow) * Hm.U;
  const placeAt = name => { const S = /^Bombsite([AB])$/.exec(name)?.[1]; if (S && M.siteGoals?.[S]?.length === 3) { const [x, z, y] = M.siteGoals[S]; return { x, z, y }; }
    const cells = []; for (let i = 0; i < G.n.length; i++) for (let k = 0; k < G.n[i]; k++) { const v = i * 3 + k; if (G.places[G.place[v]] !== name || G.ceil[v] - G.z[v] < 72) continue; const h = G.z[v];
      const flat = [1, -1, G.cols, -G.cols].every(d => { const j = i + d; if (j < 0 || j >= G.n.length) return false; for (let q = 0; q < G.n[j]; q++) if (Math.abs(G.z[j * 3 + q] - h) <= 18) return true; return false; }); if (flat) cells.push([i, h, G.n[i] === 1]); }
    if (!cells.length) return null; const pool = cells.some(c => c[2]) ? cells.filter(c => c[2]) : cells; let cx = 0, cz = 0; for (const [i] of pool) { const [x, z] = gxz(i); cx += x / pool.length; cz += z / pool.length; }
    const [i, h] = pool.reduce((a, c) => { const [x, z] = gxz(c[0]), [ax, az] = gxz(a[0]); return Math.hypot(x - cx, z - cz) < Math.hypot(ax - cx, az - cz) ? c : a; }); const [x, z] = gxz(i); return { x, z, y: gy(h) }; };
  for (const route of ROUTES[L.id] || []) { const pts = route.map(placeAt); if (pts.some(p => !p)) continue; let cur = pts[0];
    for (let i = 1; i < pts.length; i++) { const b = pts[i]; let p = []; try { p = M.nav.route(cur.x, cur.z, cur.y, b.x, b.z, null, b.y) || []; } catch { p = M.nav.route(cur.x, cur.z, cur.y, b.x, b.z) || []; } if (!p.length) break;
      let fy = cur.y; for (let q = 0; q < p.length; q++) { const [x, z, py] = p[q]; if (Number.isFinite(py)) fy = py; else { const g = M.nav.floorAt(x, z, fy + 18 * HU); if (Number.isFinite(g)) fy = g; } if (q % ROUTE_EVERY === 0) add(x, z, fy, 'r'); }
      const last = p[p.length - 1]; cur = { x: last[0], z: last[1], y: Number.isFinite(last[2]) ? last[2] : b.y }; } }
  for (let r = 1; r < G.rows - 1; r += GRID) for (let c = 1; c < G.cols - 1; c += GRID) { const i = r * G.cols + c;
    for (let k = 0; k < G.n[i]; k++) { const h = G.z[i * 3 + k]; if (G.ceil[i * 3 + k] - h < 54) continue; add(-C.W / 2 + (c + .5) * C.cell, -C.D / 2 + (r + .5) * C.cell, (h - C.zLow) * C.U, 'g'); } }
  const out = []; let tried = 0;
  for (const s of spots.values()) { tried++; const e = evalSpot(world, s.x, s.z, s.y); if (!e.floor || !e.crouch || e.nok < 4) continue;   // (a must-walk spot: on a floor, room, 4+ ways out)
    let mask = 0, ticks = 0; for (let i = 0; i < 8; i++) if (e.ok[i]) { mask |= 1 << i; ticks += e.tt[i]; }
    const [hx, hy, hz] = toH(s.x, s.z, s.y); out.push([+hx.toFixed(1), +hy.toFixed(1), +hz.toFixed(2), e.stand ? 1 : 0, mask, ticks, s.src]); }
  const ladders = world.ladders.map(Lr => { const a = toH(Lr.minX, Lr.maxZ, Lr.y0), b = toH(Lr.maxX, Lr.minZ, Lr.y1); return [...a, ...b].map(v => +v.toFixed(1)).concat([+climb(world, Lr, true).toFixed(2), +climb(world, Lr, false).toFixed(2)]); });
  return { tried, spots: out, ladders };
}

// ───────── check: today's code on the recorded spots ─────────
function verdict(rec, e) {   // rec: [hx, hy, hz, stand, mask, ticks, src] → the reasons it fails ([] = walkable as in v51)
  const why = [], [, , , st, mask, ticks] = rec;
  if (!e.floor) why.push('no floor'); if (st && !e.stand) why.push(e.crouch ? 'no standing room (crouch only)' : 'no standing room'); if (!e.crouch) why.push('in a solid');
  const lost = []; let now = 0, all = true; for (let i = 0; i < 8; i++) if (mask & 1 << i) { if (!e.ok[i] && e.dist[i] < 40) lost.push(DIRN[i]); if (e.ok[i]) now += e.tt[i]; else all = false; }
  if (e.nok === 0) why.push('stuck'); else if (lost.length >= 2) why.push('lost ' + lost.join('/'));
  if (all && now > ticks * 1.3 + 4) why.push(`slow (${now} ticks, v51 ${ticks})`);
  return why;
}
function checkMap(L, R, world = L.world, list = R.spots) {
  const bad = []; for (const rec of list) { const [x, z, y] = L.fromH(rec[0], rec[1], rec[2]), e = evalSpot(world, x, z, y), why = verdict(rec, e); if (why.length) bad.push({ rec, why, place: L.place(x, z, y) }); }
  return bad;
}
const show = bad => bad.slice(0, 8).map(b => `${b.place || '?'} (${SRC[b.rec[6]]}, Hammer ${b.rec.slice(0, 3).map(Math.round).join(',')}): ${b.why.join(', ')}`).join('; ') + (bad.length > 8 ? `; … ${bad.length - 8} more` : '');

if (RECORD) {
  const fx = existsSync(FIX) ? JSON.parse(readFileSync(FIX, 'utf8')) : { maps: {} };
  fx.about = 'tests/gd-walkable.mjs: spots (Hammer x, y, z), v51 stand (1/0), walkable-direction mask (E SE S SW W NW N NE bits), v51 ticks over those directions, source (g grid, s site, p spawn, r route); ladders: Hammer box, v51 up / down share climbed.';
  fx.recordedWith = ROOT; fx.params = { GRID, SITE, SITE_STEP, ROUTE_EVERY };
  for (const id of MAPS) { if (only.length && !only.includes(id)) continue; const t0 = Date.now(), L = loadMap(id); if (!L) { console.log(id + ': no map file'); continue; }
    const R = record(L); fx.maps[id] = { sha: L.sha, ladders: R.ladders, spots: R.spots };
    console.log(`${id}: ${R.spots.length} must-walk spots of ${R.tried} (${R.spots.filter(s => s[6] === 's').length} at the sites), ${R.ladders.length} ladders, ${Date.now() - t0} ms`); }
  writeFileSync(FIX, '{\n' + Object.entries(fx).map(([k, v]) => k === 'maps' ? ' "maps": {\n' + Object.entries(v).map(([id, m]) => `  "${id}": {"sha": "${m.sha}", "ladders": ${JSON.stringify(m.ladders)}, "spots": [\n` + m.spots.map(s => '   ' + JSON.stringify(s)).join(',\n') + '\n  ]}').join(',\n') + '\n }' : ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n');
  console.log('wrote ' + FIX); process.exit(0);
}

const fx = JSON.parse(readFileSync(FIX, 'utf8'));
// (no map files: the fixture's own shape)
check('fixture: all eight maps recorded, each with must-walk spots at both bomb sites', MAPS.every(id => fx.maps[id]?.spots?.filter(s => s[6] === 's').length >= 40));
if (!MAPS.some(id => existsSync(ROOT + '/user-maps/' + id + '.bsp'))) { console.log(`SKIP map checks: no CS2 map files in user-maps · ${pass} passed`); process.exit(fail ? 1 : 0); }
for (const id of MAPS) { if (only.length && !only.includes(id)) continue; const R = fx.maps[id], t0 = Date.now(), L = loadMap(id); if (!L || !R) { skipped++; continue; }
  if (L.sha !== R.sha) { console.log(`SKIP ${id}: the map file is not the one recorded (${L.sha} vs ${R.sha}) — node tests/gd-walkable.mjs --record --root <v51.0.0 checkout> ${id}`); skipped++; continue; }
  const bad = checkMap(L, R), sites = bad.filter(b => b.rec[6] === 's');
  check(`${id}: both bomb sites walkable as in v51 (${R.spots.filter(s => s[6] === 's').length} spots)`, !sites.length, show(sites));
  check(`${id}: spawns, routes and the map's floors walkable as in v51 (${R.spots.filter(s => s[6] !== 's').length} spots)`, bad.length === sites.length, show(bad.filter(b => b.rec[6] !== 's')));
  const lad = []; for (const [hx0, hy0, hz0, hx1, hy1, hz1, up, down] of R.ladders) { const [x0, z0, y0] = L.fromH(hx0, hy0, hz0), [x1, z1] = L.fromH(hx1, hy1, hz1), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const Lr = L.world.ladders.find(l => Math.hypot((l.minX + l.maxX) / 2 - cx, (l.minZ + l.maxZ) / 2 - cz) < 1 && Math.abs(l.y0 - y0) < 1); if (!Lr) { lad.push(`ladder at Hammer ${Math.round(hx0)},${Math.round(hy0)} gone`); continue; }
    if (up >= .9 && climb(L.world, Lr, true) < .9) lad.push(`ladder at Hammer ${Math.round(hx0)},${Math.round(hy0)}: no longer climbed up`); if (down >= .9 && climb(L.world, Lr, false) < .9) lad.push(`ladder at Hammer ${Math.round(hx0)},${Math.round(hy0)}: no longer climbed down`); }
  if (R.ladders.length) check(`${id}: its ${R.ladders.length} ladders climbed as in v51`, !lad.length, lad.join('; '));
  if (process.env.VERBOSE) console.log(`  ${id}: ${R.spots.length} spots, ${Date.now() - t0} ms`);
  if (id === 'nuke') {   // Self-tests: the check catches a blocker on B and a hull that no longer fits.
    const g = L.fromH(408, -1256, -768), M2 = {   // (B's goal as v51 had it — the spots there are v51's; today's goal is in B's middle, which v51 couldn't walk: the glass floor's fill)
    ...L.M, id: 'nuke#selftest', solids: [...L.M.solids, [g[0], g[1], 12, 12, 12, 'concrete', g[2] - .2]] }, boxes2 = AM.mapBoxes(M2, 0, 0); for (const b of boxes2.movers || []) b.off = true;
    const near = R.spots.filter(s => s[6] === 's' && Math.hypot(...((p => [p[0] - g[0], p[1] - g[1]])(L.fromH(s[0], s[1], s[2])))) < 12), caught = checkMap(L, R, { ...L.world, boxes: boxes2 }, near);
    check('self-test: a 12-unit box dropped on Nuke\'s B site is caught', caught.length >= 4, `${caught.length} of ${near.length} spots near it fail`);
    const h = MV.MOVE.height; MV.MOVE.height = h * 1.5; let tall = 0; try { for (const s of R.spots) if (s[3]) { const [x, z, y] = L.fromH(s[0], s[1], s[2]); if (MV.blocked(L.world.boxes, L.world.bounds, x, z, y + .05, MV.MOVE.height * .95, MV.MOVE.radius * .5)) tall++; } } finally { MV.MOVE.height = h; }
    check('self-test: a hull half as tall again no longer stands under Nuke\'s low ceilings', tall >= 5, `${tall} spots`);
    const st = MV.MOVE.step; MV.MOVE.step = 4 * HU; let steps = []; try { steps = checkMap(L, R); } finally { MV.MOVE.step = st; }
    check('self-test: a 4-unit step (no stairs) is caught on Nuke', steps.length >= 10, `${steps.length} spots fail`);
  }
}
console.log(`${fail ? 'FAIL' : 'OK'} gd-walkable: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} maps skipped` : ''}`);
process.exit(fail ? 1 : 0);
