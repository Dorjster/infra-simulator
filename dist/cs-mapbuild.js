// Builds a classic Defuse map (navigation areas + overview mask, cs-columns.js; look, cs-maps/themes.js) into the
// game's map data (the same shape as the other arena maps): merged boxes for collision and drawing, spawns, bomb
// sites, callouts, bot routes, the radar grid, and `nav` — floor / walk / line-of-sight queries on the columns that
// understand stacked levels (bots, spawns, the radar). Game units: 1 unit = 16.5 cm, 1 Hammer unit = 2.54 cm.
import { rasterize, CELL, MAXF, NONE, CRATE, CAR, SITE, HEAD, STEP, DROP, BODY, SLAB, slabBottom } from './cs-columns.js';
import { B } from './arena-mapkit.js';
import { calloutName } from './cs-maps/themes.js';
export const U = 2.54 / 16.5;
const WALL_H = 224, Q = 4;   // HU: walls stand this far above the floors next to them; slab thickness; height step for merging

export function buildCsMap(id, nav, T) {
  const G = rasterize(nav, { navFootprint: !!T.navFootprint }), { cols, rows, n, z, place, flags } = G, N = cols * rows, P = G.places;
  for (let i = 0; i < z.length; i++) if (z[i] > NONE) z[i] = Math.round(z[i] / Q) * Q;   // floors on a 4-HU step (stairs, slopes)
  let zLow = Infinity, zHigh = -Infinity; for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) { zLow = Math.min(zLow, z[i * MAXF + k]); zHigh = Math.max(zHigh, z[i * MAXF + k]); }
  const W = cols * CELL * U, D = rows * CELL * U, gx = c => -W / 2 + (c + .5) * CELL * U, gz = r => -D / 2 + (r + .5) * CELL * U, gy = h => (h - zLow) * U;
  const top = i => n[i] ? z[i * MAXF + n[i] - 1] : NONE, placeOf = (i, k) => P[place[i * MAXF + k]] || '';
  // Ceilings: indoor places (theme) and passages under a higher level — a column whose own level continues, close by,
  // under a floor above it (a stacked column at the same height: an underpass, a lower corridor), or Nuke's lower
  // level. (A plain ledge next to higher ground is not a ceiling.)
  const lowerLevel = h => !!G.split && h <= G.split.top && h >= G.split.bottom;
  const above = new Float32Array(N).fill(NONE); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (!n[i]) continue; const t = top(i); let up = Infinity;
    for (let k = 0; k + 1 < n[i]; k++) if (Math.abs(z[i * MAXF + k] - t) < 1) up = Math.min(up, z[i * MAXF + k + 1]);   // (top is the highest floor, so this stays Infinity: kept for clarity)
    for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue; const j = rr * cols + cc; if (n[j] < 2) continue;
      for (let k = 0; k + 1 < n[j]; k++) if (Math.abs(z[j * MAXF + k] - t) < 24 && z[j * MAXF + k + 1] >= t + HEAD) up = Math.min(up, z[j * MAXF + k + 1]); }
    const ind = T.indoor?.[placeOf(i, n[i] - 1)]; above[i] = up < Infinity ? Math.min(slabBottom(t, up), t + (ind || 140)) : lowerLevel(t) ? t + (ind || 150) : ind ? t + ind : NONE; }
  // Ceiling over each floor (HU): the next floor's slab, or the top floor's ceiling (none: Infinity). A body needs
  // BODY of room under it (walks, bot routes).
  G.ceil = new Float32Array(N * MAXF).fill(Infinity); for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) G.ceil[i * MAXF + k] = k + 1 < n[i] ? slabBottom(z[i * MAXF + k], z[i * MAXF + k + 1]) : above[i] > NONE ? Math.round(above[i] / Q) * Q : Infinity;
  // Wall tops: the highest floor (or ceiling) within 3 columns, plus WALL_H.
  const wallTop = new Float32Array(N); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { let h = -Infinity; for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue; const j = rr * cols + cc; if (n[j]) h = Math.max(h, top(j), above[j] > NONE ? above[j] : -Infinity); }
    wallTop[r * cols + c] = h === -Infinity ? zLow : Math.ceil((h + WALL_H) / 32) * 32; }
  // Column → solid segments [y0, y1, material] (HU).
  const segs = new Array(N), indoor = (i, k) => !!T.indoor?.[placeOf(i, k)];
  for (let i = 0; i < N; i++) { const out = []; if (!n[i]) { if (wallTop[i] > zLow) out.push([zLow, wallTop[i], T.wall, false]); segs[i] = out; continue; }   // (nothing at all far outside the map)
    const f0 = z[i * MAXF], crate = flags[i] & CRATE;
    if (f0 > zLow) out.push([zLow, f0, crate && n[i] === 1 ? (flags[i] & CAR ? T.car || 'metal-blue' : 'crate') : indoor(i, 0) ? T.indoorFloor : T.floor, true]);
    for (let k = 1; k < n[i]; k++) { const f = z[i * MAXF + k], topCrate = crate && k === n[i] - 1, slab = slabBottom(z[i * MAXF + k - 1], f), base = G.crateBase[i] > NONE ? Math.round(G.crateBase[i] / Q) * Q : slab; out.push([topCrate ? Math.min(base, slab) : slab, f, topCrate ? (flags[i] & CAR ? T.car || 'metal-blue' : 'crate') : T.floor, true]); }   // a crate (or car) on an upper level stands on that level's floor
    if (above[i] > NONE) { const a = Math.round(above[i] / Q) * Q; out.push([a, Math.max(a + SLAB, wallTop[i]), indoor(i, n[i] - 1) ? T.indoorWall : T.wall, false]); }
    segs[i] = out; }
  // Merge equal segments of neighbouring columns into boxes (grow right, then down).
  const solids = [], keyOf = s => s[0] + '|' + s[1] + '|' + s[2] + '|' + s[3], byKey = new Map();
  for (let i = 0; i < N; i++) for (const s of segs[i]) { const k = keyOf(s); let e = byKey.get(k); if (!e) byKey.set(k, e = { s, cells: new Uint8Array(N) }); e.cells[i] = 1; }
  for (const { s, cells } of byKey.values()) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (!cells[r * cols + c]) continue; let c1 = c; while (c1 + 1 < cols && cells[r * cols + c1 + 1]) c1++;
    let r1 = r; grow: while (r1 + 1 < rows) { for (let cc = c; cc <= c1; cc++) if (!cells[(r1 + 1) * cols + cc]) break grow; r1++; }
    for (let rr = r; rr <= r1; rr++) cells.fill(0, rr * cols + c, rr * cols + c1 + 1);
    const b = B((gx(c) + gx(c1)) / 2, (gz(r) + gz(r1)) / 2, (c1 - c + 1) * CELL * U, (r1 - r + 1) * CELL * U, (s[1] - s[0]) * U, s[2], gy(s[0])); if (s[3]) b.walk = true; solids.push(b); }
  // Spawns: spread over the spawn place's open columns (farthest-point picks, away from walls).
  const roomy = i => { const c = i % cols, r = (i / cols) | 0; for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) { const j = (r + dr) * cols + c + dc; if (j < 0 || j >= N || !n[j] || flags[j] & CRATE || Math.abs(top(j) - top(i)) > 10) return false; } return true; };
  const cellsOf = name => { const out = []; for (let i = 0; i < N; i++) if (n[i] && placeOf(i, n[i] - 1) === name && !(flags[i] & CRATE)) out.push(i); return out; };
  const spread = (cells, k) => { const pool = cells.filter(roomy), src = pool.length >= k ? pool : cells; if (!src.length) return []; let cx = 0, cz = 0; for (const i of src) { cx += i % cols; cz += (i / cols) | 0; } cx /= src.length; cz /= src.length;
    let first = src[0], bd = Infinity; for (const i of src) { const d = (i % cols - cx) ** 2 + (((i / cols) | 0) - cz) ** 2; if (d < bd) { bd = d; first = i; } }
    const picks = [first]; while (picks.length < k) { let best = -1, bv = -1; for (const i of src) { let m = Infinity; for (const p of picks) m = Math.min(m, (i % cols - p % cols) ** 2 + (((i / cols) | 0) - ((p / cols) | 0)) ** 2); if (m > bv) { bv = m; best = i; } } if (bv < 4) break; picks.push(best); } return picks; };
  const at = i => [+gx(i % cols).toFixed(1), +gz((i / cols) | 0).toFixed(1)];
  const tCells = cellsOf('TSpawn'), ctCells = cellsOf('CTSpawn'), t = spread(tCells, 10).map(at), ct = spread(ctCells, 10).map(at);
  // Bomb sites: the overview's site columns, A or B by their place; a circle for the old checks plus the columns.
  const siteCells = { A: [], B: [] }; for (let i = 0; i < N; i++) if (flags[i] & SITE && n[i]) { const p = placeOf(i, n[i] - 1), L = p === 'BombsiteB' ? 'B' : p === 'BombsiteA' ? 'A' : null; if (L) siteCells[L].push(i); }
  for (const L of ['A', 'B']) if (!siteCells[L].length) siteCells[L] = cellsOf('Bombsite' + L);
  const circle = cells => { let x = 0, zz = 0; for (const i of cells) { x += gx(i % cols); zz += gz((i / cols) | 0); } x /= cells.length; zz /= cells.length; let r = 0; for (const i of cells) r = Math.max(r, Math.hypot(gx(i % cols) - x, gz((i / cols) | 0) - zz)); return [+x.toFixed(1), +zz.toFixed(1), +Math.max(6, r).toFixed(1)]; };
  // Where bots head on each site: its open (not crate) column nearest the site's centre, with room round it.
  const goalOf = (cells, [x, zz]) => { let best = null, bd = Infinity; for (const i of cells) { if (flags[i] & CRATE || !roomy(i)) continue; const d = Math.hypot(gx(i % cols) - x, gz((i / cols) | 0) - zz); if (d < bd) { bd = d; best = i; } } if (best === null) for (const i of cells) { if (flags[i] & CRATE) continue; const d = Math.hypot(gx(i % cols) - x, gz((i / cols) | 0) - zz); if (d < bd) { bd = d; best = i; } } return best === null ? [x, zz] : at(best); };
  const sites = { A: circle(siteCells.A), B: circle(siteCells.B) }, siteGoals = { A: goalOf(siteCells.A, sites.A), B: goalOf(siteCells.B, sites.B) }, goalH = L => { const i = (() => { const [x, zz] = siteGoals[L]; const c = Math.round((x + W / 2) / (CELL * U) - .5), r = Math.round((zz + D / 2) / (CELL * U) - .5); return r * cols + c; })(); for (let k = 0; k < n[i]; k++) if (placeOf(i, k) === 'Bombsite' + L) return z[i * MAXF + k]; return null; }, midCells = cellsOf('Middle').length ? cellsOf('Middle') : cellsOf('TopofMid'), midGoal = midCells.length ? goalOf(midCells, circle(midCells)) : [(siteGoals.A[0] + siteGoals.B[0]) / 2, (siteGoals.A[1] + siteGoals.B[1]) / 2], siteMask = new Uint8Array(N); for (const i of siteCells.A) siteMask[i] = 1; for (const i of siteCells.B) siteMask[i] = 2;
  // Callouts: each place's label at its open column nearest the place's centre.
  const callouts = []; for (const name of P) { if (!name) continue; const cells = cellsOf(name); if (cells.length < 6) continue; let cx = 0, cz = 0; for (const i of cells) { cx += i % cols; cz += (i / cols) | 0; } cx /= cells.length; cz /= cells.length;
    let best = cells[0], bd = Infinity; for (const i of cells) { const d = (i % cols - cx) ** 2 + (((i / cols) | 0) - cz) ** 2; if (d < bd) { bd = d; best = i; } } callouts.push({ name: calloutName(name), x: +gx(best % cols).toFixed(1), z: +gz((best / cols) | 0).toFixed(1), place: name }); }
  const navApi = makeNav(G, { W, D, zLow, above, siteMask });
  const columns = { G, segs, zLow, W, D, cell: CELL * U, U, floorMats: new Set([T.floor, T.indoorFloor, 'crate', T.car || 'metal-blue']) };   // for the renderer (cs-mesh.js)
  const map = { id, name: T.name, kind: 'defuse', classic: true, columns, size: [W, D], floor: T.floor, sky: T.sky, sun: T.sun, solids, props: [], decor: [], t, ct, sites, siteMask, callouts, nav: navApi, scaled: true,
    floorAt: (x, zz, yEye) => navApi.floorAt(x, zz, yEye), siteGoals, get routes() { return this._routes ??= navApi.routes(t[0], ct[0], siteGoals, midGoal, { A: goalH('A'), B: goalH('B') }); },
    grid: { cols, rows, cell: CELL * U, classic: true, cells: (() => { const g = new Uint8Array(N); for (let i = 0; i < N; i++) g[i] = !n[i] ? 0 : flags[i] & CRATE ? 2 : 1; return g; })(), heights: (() => { const h = new Float32Array(N); for (let i = 0; i < N; i++) h[i] = n[i] ? gy(top(i)) : 0; return h; })(), stacked: (() => { const s = new Uint8Array(N); for (let i = 0; i < N; i++) s[i] = n[i] > 1 ? 1 : above[i] > NONE ? 2 : 0; return s; })(), roofs: [], ramps: [] } };
  return map;
}

// Navigation on the columns, in game units relative to the map centre (x east, z south, y up from the lowest floor).
// The body's outline for a bot step: sides and corners (a square hull, 1.3 units out) and halfway in.
const BODY_PTS = [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3], [1, 1], [1, -1], [-1, 1], [-1, -1], [.7, 0], [-.7, 0], [0, .7], [0, -.7]];
function makeNav(G, { W, D, zLow }) {
  const { cols, rows, n, z } = G, Ui = 1 / U, cellOf = (x, zz) => { const c = Math.floor((x + W / 2) / (CELL * U)), r = Math.floor((zz + D / 2) / (CELL * U)); return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c; };
  // The floor (HU) of column i a body at feet height f (HU) stands on: the highest floor at most a step above f.
  const floorFor = (i, f) => { let best = NONE; for (let k = 0; k < n[i]; k++) { const h = z[i * MAXF + k]; if (h <= f + STEP && h > best && G.ceil[i * MAXF + k] - Math.max(f, h) >= BODY) best = h; } return best; };
  const toY = h => (h - zLow) * U, toH = y => y * Ui + zLow;
  const api = {
    // Floor height (game y) under (x, z) for feet near y (default: the top floor); NaN outside.
    floorAt(x, zz, y = Infinity) { const i = cellOf(x, zz); if (i < 0 || !n[i]) return NaN; const h = y === Infinity ? z[i * MAXF + n[i] - 1] : floorFor(i, toH(y)); return h === NONE ? NaN : toY(h); },
    // A body (radius r) at feet y moving to (nx, nz): its new feet y, or NaN when a wall, a ledge higher than a step
    // or a drop deeper than DROP is in the way. Every column under the body must be standable within a step.
    step(x, zz, y, nx, nz) { const f = toH(y), i = cellOf(nx, nz); if (i < 0) return NaN; const h = floorFor(i, f); if (h === NONE || f - h > DROP) return NaN;
      for (const [dx, dz] of BODY_PTS) { const j = cellOf(nx + dx, nz + dz); if (j < 0) return NaN; const hj = floorFor(j, h); if (hj === NONE || Math.abs(hj - h) > STEP * 1.5 && hj > h) return NaN; }
      return toY(h); },
    // Clear line between two points (game units, y absolute): stepped every half column through the columns.
    sight(ax, ay, az, bx, by, bz) { const L = Math.hypot(bx - ax, bz - az), steps = Math.ceil(L / (CELL * U * .5)); for (let s = 1; s < steps; s++) { const t = s / steps, x = ax + (bx - ax) * t, zz = az + (bz - az) * t, h = toH(ay + (by - ay) * t), i = cellOf(x, zz); if (i < 0) return false; if (!openAt(G, i, h)) return false; } return true; },
    // The bomb site (A / B) a body at feet y stands in: an overview site column, on the floor named BombsiteA / B.
    site(x, zz, y) { const i = cellOf(x, zz); if (i < 0 || !n[i] || !(G.flags[i] & SITE)) return null; const f = toH(y); let best = -1, bd = Infinity; for (let k = 0; k < n[i]; k++) { const d = Math.abs(z[i * MAXF + k] - f); if (d < bd) { bd = d; best = k; } }
      if (bd > 48) return null; const p = G.places[G.place[i * MAXF + best]]; return p === 'BombsiteA' ? 'A' : p === 'BombsiteB' ? 'B' : null; },
    // A fresh walk from where a bot stands (feet y) to (tx, tz): [x, z] points (bots that got stuck re-plan).
    route(x, zz, y, tx, tz) { return pathBetween(G, cellOf(x, zz), cellOf(tx, tz), W, D, toH(y)); },
    cellOf, toY, toH, G,
    // Bot routes (lazily, on the host): walks over the columns from a spawn to each site / mid, as [x, z] points.
    routes(tSpawn, ctSpawn, sites, mid, goalH = {}) { const go = (from, to, h = null) => pathBetween(G, cellOf(from[0], from[1]), cellOf(to[0], to[1]), W, D, null, h);
      const A = go(tSpawn, sites.A, goalH.A), M = go(tSpawn, mid); return { t: { A, B: go(tSpawn, sites.B, goalH.B), M: M.length ? M : A }, ct: { A: go(ctSpawn, sites.A, goalH.A), B: go(ctSpawn, sites.B, goalH.B) } }; },
  };
  return api;
}
// Is height h (HU) open air in column i? Above a floor and below what is over it (the next floor's slab or a ceiling).
function openAt(G, i, h) { const { n, z } = G; if (!n[i]) return false; for (let k = 0; k < n[i]; k++) { const f = z[i * MAXF + k], next = k + 1 < n[i] ? z[i * MAXF + k + 1] - 16 : Infinity; if (h >= f && h <= next) return true; } return false; }
// Shortest walk between two columns (8-way, no corner cutting, up a step / down a drop), pulled straight wherever the
// straight walk is clear (a body's width, climbable all the way); [x, z] points in game units.
function pathBetween(G, a, b, W, D, startFloor = null, goalFloor = null) {
  const { cols, rows, n, z } = G; if (a < 0 || b < 0 || !n[a] || !n[b]) return [];
  // Cheapest walk (bucket queue): a column without a body's width of floor at its height round it (a wall, a ledge or
  // a ramp edge beside it) costs extra, so routes keep clear of edges but still pass narrow doorways.
  const key = (i, k) => i * MAXF + k, M = cols * rows * MAXF, prev = new Int32Array(M).fill(-1), cost = new Float32Array(M).fill(Infinity), buckets = []; let goal = -1;
  const push = (v, c2) => { const bi = Math.round(c2); (buckets[bi] ??= []).push(v); };
  let k0 = n[a] - 1; if (startFloor !== null) { let bd = Infinity; for (let k = 0; k < n[a]; k++) { const d = Math.abs(z[a * MAXF + k] - startFloor); if (d < bd) { bd = d; k0 = k; } } }
  const start = key(a, k0); prev[start] = start; cost[start] = 0; push(start, 0);
  const near = (m, h) => { for (let q2 = 0; q2 < n[m]; q2++) if (Math.abs(z[m * MAXF + q2] - h) <= STEP) return true; return false; };
  search: for (let bi = 0; bi < buckets.length; bi++) { const list = buckets[bi]; if (!list) continue; for (let li = 0; li < list.length; li++) { const u = list[li]; if (Math.round(cost[u]) !== bi) continue;
    const i = (u / MAXF) | 0, h = z[u], c = i % cols, r = (i / cols) | 0; if (i === b && (goalFloor === null || Math.abs(h - goalFloor) < 24)) { goal = u; break search; }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue; const j = rr * cols + cc;
      for (let kk = 0; kk < n[j]; kk++) { const hj = z[j * MAXF + kk]; if (hj > h + STEP || h - hj > DROP || G.ceil[j * MAXF + kk] - Math.max(h, hj) < BODY) continue; if (dc && dr && (!near(r * cols + cc, h) || !near(rr * cols + c, h))) continue;
        if (h - hj > 64) { let held = 0; for (const d of [1, -1, cols, -cols, cols + 1, cols - 1, -cols + 1, -cols - 1]) { const m = j + d; if (m >= 0 && m < n.length && near(m, h)) held++; } if (held > 5) continue; }   // falling needs room: off a ledge, yes; through a hole or slit narrower than a body (floor at your height nearly all round), no
        const op = d => { const m = j + d; return m >= 0 && m < n.length && near(m, hj); };
        if (j !== b && ((!op(-1) && !op(1)) || (!op(-cols) && !op(cols)) || (!op(-cols - 1) && !op(cols + 1)) || (!op(-cols + 1) && !op(cols - 1)))) continue;   // obstacles on opposite sides (square hull, corners too): narrower than a body
        let roomy = true; for (const d of [1, -1, cols, -cols]) { const m = j + d; if (m < 0 || m >= n.length || !near(m, hj)) { roomy = false; break; } }
        const v = key(j, kk), nc = cost[u] + (dc && dr ? 1.4 : 1) + (roomy ? 0 : 6); if (nc < cost[v]) { cost[v] = nc; prev[v] = u; push(v, nc); } } } } }
  if (globalThis.__navDebug) globalThis.__navDebug.cost = cost;   // tools/maps/frontier.mjs
  if (goal < 0) return []; const nodes = []; for (let v = goal; ; v = prev[v]) { nodes.push(v); if (v === start) break; } nodes.reverse();
  // A straight walk from node A to node B: half-column samples, each within a step of the last (or a drop), on both sides.
  const cx = v => ((v / MAXF) | 0) % cols, cr = v => (((v / MAXF) | 0) / cols) | 0;
  const straight = (A, Bn) => { const x0 = cx(A) + .5, y0 = cr(A) + .5, x1 = cx(Bn) + .5, y1 = cr(Bn) + .5, L = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(L * 4), nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
    const floorNear = (c, r, h, climb) => { if (c < 0 || r < 0 || c >= cols || r >= rows) return NONE; const j = r * cols + c; let best = NONE; for (let kk = 0; kk < n[j]; kk++) { const hj = z[j * MAXF + kk]; if (hj <= h + climb && h - hj <= (climb === STEP ? DROP : climb) && G.ceil[j * MAXF + kk] - Math.max(h, hj) >= BODY && hj > best) best = hj; } return best; };
    let h = z[A]; for (let s = 1; s <= steps; s++) { const t = s / steps, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t, f = floorNear(Math.floor(px), Math.floor(py), h, STEP); if (f === NONE) return false;
      for (const off of [.55, -.55, 1, -1]) { const g2 = floorNear(Math.floor(px + nx * off), Math.floor(py + ny * off), f, STEP); if (g2 === NONE || Math.abs(g2 - f) > STEP) return false; }   // a body's width each side at the same height: no wall, pillar, ledge or ramp edge
      h = f; } return Math.abs(h - z[Bn]) < 24; };   // and it ends on the waypoint's own floor (a stacked map: not the level above it)
  const keep = [nodes[0]]; let i0 = 0; while (i0 < nodes.length - 1) { let j = Math.min(nodes.length - 1, i0 + 60); while (j > i0 + 1 && !straight(nodes[i0], nodes[j])) j--; keep.push(nodes[j]); i0 = j; }
  const P = v => [-W / 2 + (cx(v) + .5) * CELL * U, -D / 2 + (cr(v) + .5) * CELL * U].map(t => +t.toFixed(1));
  return keep.slice(1).map(P);
}
