// Classic Defuse maps as floor columns, rasterised from their navigation areas (dist/cs-maps/<id>-nav.js, Hammer
// units). The map is a grid of CELL × CELL columns; each column holds up to MAXF walkable floors (stacked levels: Nuke,
// Mirage's underpass, Anubis' bridge…). Everything else is derived from the columns: walls where a column has no
// floor, raised floors and stairs, slabs between levels, ceilings over indoor places, crates (small raised islands),
// bot navigation and line of sight. Pure (no three.js): the room host, the clients and the tests share it.
export const CELL = 16, MAXF = 3, HEAD = 74, STEP = 18, DROP = 260, BODY = 72, SLAB = 16;
// The underside of the slab under floor `up`, above floor `low` (HU): SLAB thick, thinner where the gap is tight so a
// body (BODY) still fits under it — two navigation floors that close are both walkable in the reference.
// The underside of the floor above a floor: a SLAB-thick slab, thinner (down to 2) where needed to leave a body plus a
// step of room — walking down a slope into a low passage the head is up to a step above the floor it is entering.
export const slabBottom = (low, up) => Math.max(up - SLAB, Math.min(up - 2, low + BODY + STEP));   // HU: column size, floors per column, head room, step up, safe drop
const NONE = -1e9;

// Height of an area at (x, y) along its slope axis.
function areaZ(a, x, y) { const [x0, y0, x1, y1, zA, zB, axis] = a; if (axis === 2) return (zA + zB) / 2;
  const t = axis === 0 ? (x - x0) / Math.max(1, x1 - x0) : (y - y0) / Math.max(1, y1 - y0); return zA + (zB - zA) * Math.max(0, Math.min(1, t)); }

// nav (cs-maps/<id>-nav.js) → { cols, rows, x0, y1 (HU of the grid's west / north edge), n (floors per column),
// z (Float32 cols·rows·MAXF, sorted low → high), place (Uint8, same), flags (Uint8 per column: CRATE, SITE) }.
// Row 0 is the north edge (radar up). The overview mask decides where there is floor, cover and bomb site; the
// navigation areas give the heights (spread into overview floor they don't quite reach) and the stacked levels
// (kept where the overview shows the level above them).
export const CRATE = 1, SITE = 2, CAR = 4, CRATE_H = 64, CAR_H = 150;
const unrle = (s, N) => { const m = new Uint8Array(N); let i = 0; for (let p = 0; p < s.length; p += 2) { const v = +s[p], run = parseInt(s[p + 1], 36); m.fill(v, i, i + run); i += run; } return m; };
const floorsOf = (G, i) => { const out = []; for (let k = 0; k < G.n[i]; k++) out.push(G.z[i * MAXF + k]); return out; };
// opts.navFootprint (Train: its overview is an older version): the navigation areas decide where the floor is (grown
// one column to the walls); overview floor they don't reach becomes railcars.
export function rasterize(nav, opts = {}) {
  const A = nav.areas, { x0, y1, cols, rows } = nav.grid, N = cols * rows, mask = unrle(nav.mask, N), mask2 = nav.mask2 ? unrle(nav.mask2, N) : null, sp = nav.split;
  const lower = zz => !!sp && zz <= sp.top && zz >= sp.bottom, maskOf = (i, zz) => lower(zz) && mask2 ? mask2[i] : mask[i], open = v => v === 1 || v === 2 || v === 3;
  const n = new Uint8Array(N), z = new Float32Array(N * MAXF).fill(NONE), place = new Uint8Array(N * MAXF), flags = new Uint8Array(N), slope = new Uint8Array(N * MAXF), aid = new Int32Array(N * MAXF).fill(-1);   // aid: the navigation area a floor came from
  const G = { cols, rows, x0, y1, n, z, place, flags, slope, places: nav.places, split: sp };
  const add = (i, zz, p, sl = 0, ai = -1) => { for (let k = 0; k < n[i]; k++) if (Math.abs(z[i * MAXF + k] - zz) < 24) { if (zz > z[i * MAXF + k]) { z[i * MAXF + k] = zz; place[i * MAXF + k] = p; slope[i * MAXF + k] = sl; aid[i * MAXF + k] = ai; } return; }
    if (n[i] < MAXF) { z[i * MAXF + n[i]] = zz; place[i * MAXF + n[i]] = p; slope[i * MAXF + n[i]] = sl; aid[i * MAXF + n[i]] = ai; n[i]++; } };
  for (const [ai, a] of A.entries()) { const c0 = Math.max(0, Math.ceil((a[0] - x0) / CELL - .5)), c1 = Math.min(cols - 1, Math.floor((a[2] - x0) / CELL - .5)), r0 = Math.max(0, Math.ceil((y1 - a[3]) / CELL - .5)), r1 = Math.min(rows - 1, Math.floor((y1 - a[1]) / CELL - .5));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) add(r * cols + c, areaZ(a, x0 + (c + .5) * CELL, y1 - (r + .5) * CELL), a[7], a[6] === 2 ? 0 : 1, ai); }
  headroom(G);
  // Floors where the overview shows none: kept only under something standing above them nearby (a passage under a
  // level: the overview draws the top) — else dropped (outside, or a thin wall line).
  const under = (i, zz) => { const c = i % cols, r = (i / cols) | 0; for (let dr = -5; dr <= 5; dr++) for (let dc = -5; dc <= 5; dc++) { const j = (r + dr) * cols + c + dc; if (j < 0 || j >= N) continue; for (let k = 0; k < n[j]; k++) if (z[j * MAXF + k] >= zz + HEAD) return true; } return false; };
  const keep = new Uint8Array(N * MAXF); for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) { const zz = z[i * MAXF + k], m = maskOf(i, zz); keep[i * MAXF + k] = opts.navFootprint || open(m) || m === 4 || (m === 0 && under(i, zz)) ? 1 : 0; }   // an overview line where a body can walk is an edge or a ledge mark, not a wall
  // Thin walls: an overview wall line between two areas at the same height that the navigation mesh does not join
  // there is a wall, however thin — kept standing (it used to become floor, and you saw, shot and walked through it:
  // Nuke's A hall and the Outside yard). Joined areas open the line only where their facing edges overlap (a doorway).
  if (nav.links) { const L = new Set(); for (let q = 0; q + 1 < nav.links.length; q += 2) { const a = nav.links[q], b = nav.links[q + 1]; L.add(a < b ? a * 65536 + b : b * 65536 + a); }
    // a and b joined at `at` along the boundary (ax 0: a west–east step, the boundary runs north–south: y; 1: x).
    const joined = (a, b, ax, at) => { if (a === b) return true; if (!L.has(a < b ? a * 65536 + b : b * 65536 + a)) return false; const P = A[a], Q = A[b], lo = Math.max(ax ? P[0] : P[1], ax ? Q[0] : Q[1]), hi = Math.min(ax ? P[2] : P[3], ax ? Q[2] : Q[3]); return at >= lo - CELL && at <= hi + CELL; };
    const areaNear = (j, zz) => { if (j < 0 || j >= N) return -1; for (let k = 0; k < n[j]; k++) if (Math.abs(z[j * MAXF + k] - zz) <= STEP) return aid[j * MAXF + k]; return -1; }, wall = [];
    for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) { const zz = z[i * MAXF + k]; if (!keep[i * MAXF + k] || maskOf(i, zz) !== 4) continue; const c = i % cols, r = (i / cols) | 0, a0 = aid[i * MAXF + k];
      for (const [ax, j1, j2, at] of [[0, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, y1 - (r + .5) * CELL], [1, i - cols, i + cols, x0 + (c + .5) * CELL]]) { const a1 = areaNear(j1, zz), a2 = areaNear(j2, zz); if (a1 < 0 || a2 < 0 || a1 === a2) continue;
        if (!joined(a1, a2, ax, at) && !(a0 >= 0 && a0 !== a1 && a0 !== a2 && joined(a1, a0, ax, at) && joined(a0, a2, ax, at))) { wall.push(i * MAXF + k); break; } } }
    for (const q of wall) keep[q] = 0; G.thinWalls = wall.length; }
  for (let i = 0; i < N; i++) { let w = 0; for (let k = 0; k < n[i]; k++) if (keep[i * MAXF + k]) { z[i * MAXF + w] = z[i * MAXF + k]; place[i * MAXF + w] = place[i * MAXF + k]; slope[i * MAXF + w] = slope[i * MAXF + k]; w++; } for (let k = w; k < n[i]; k++) z[i * MAXF + k] = NONE; n[i] = w; }
  // Spread heights into overview floor without a navigation area (nearest first), per level.
  for (const lvl of sp ? [false, true] : [false]) { const has = i => floorsOf(G, i).some(f => lower(f) === lvl), want = i => (opts.navFootprint || open(lvl ? mask2[i] : mask[i])) && !has(i) && (lvl || !n[i]);   // the upper level's overview also draws what lies under it: never spread an upper floor over a lower one
    let q = []; for (let i = 0; i < N; i++) if (has(i)) q.push(i);
    for (let pass = 0; pass < (opts.navFootprint ? 1 : 40) && q.length; pass++) { const got = new Map();
      for (const i of q) { const c = i % cols; for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) if (j >= 0 && j < N && !got.has(j) && want(j)) got.set(j, i); }
      for (const [j, i] of got) for (let k = 0; k < n[i]; k++) if (lower(z[i * MAXF + k]) === lvl) add(j, z[i * MAXF + k], place[i * MAXF + k], slope[i * MAXF + k]);
      q = [...got.keys()]; } }
  sortFloors(G); headroom(G); relaxSlopes(G); fillPinholes(G); fillPinholes(G); sortFloors(G); headroom(G);
  // Railcars (navFootprint maps): overview floor no area reached, enclosed by floor — a car standing on the ground around it.
  const carBase = new Map(); if (opts.navFootprint) { const cars = [];
    for (let i = cols; i < N - cols; i++) { if (n[i] || !open(mask[i])) continue; let sides = 0, g = NONE; const c = i % cols, r = (i / cols) | 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 1; d <= 24; d++) { const cc = c + dc * d, rr = r + dr * d; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) break; const j = rr * cols + cc; if (n[j]) { sides++; g = Math.max(g, z[j * MAXF]); break; } if (!open(mask[j])) break; }
      if (sides >= 3 && g > NONE) cars.push([i, g]); }
    for (const [i, g] of cars) { add(i, g + CAR_H, 0); flags[i] |= CAR | CRATE; carBase.set(i, g); } }
  // Cover: a crate standing on the floor around it (or the navigation's own crate top when that is high enough); sites.
  G.crateBase = new Float32Array(N).fill(NONE); for (const [i, g] of carBase) G.crateBase[i] = g;   // the floor a crate stands on (its column's top floor is the crate top)
  for (let i = 0; i < N; i++) { if (mask[i] === 3 || (mask2 && mask2[i] === 3)) flags[i] |= SITE; if (mask[i] !== 2 || !n[i] || flags[i] & CAR) continue; const t = i * MAXF + n[i] - 1, base = groundAround(G, i, z[t]);
    G.crateBase[i] = n[i] > 1 ? z[t] : Math.min(base, z[t]); if (z[t] < base + 40) z[t] = (n[i] > 1 ? z[t] : base) + CRATE_H; flags[i] |= CRATE; }   // stacked: the crate stands on its own level's floor, the passage under it stays open
  return G;
}
// The floor level around a column (the lowest top floor among its non-cover neighbours within 3 columns, near zz).
function groundAround(G, i, zz) { const { cols, n, z, flags } = G, c = i % cols, r = (i / cols) | 0; let best = zz;
  for (let d = 1; d <= 3; d++) for (const [dc, dr] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const j = (r + dr) * cols + c + dc; if (j < 0 || j >= n.length || !n[j] || flags[j] & CRATE) continue; const t = z[j * MAXF + n[j] - 1]; if (Math.abs(t - zz) < 120) best = Math.min(best, t); }
  return best; }
// Two floors closer than a body's height can't both be stood on: keep the higher (a crate top over its shadow).
function headroom(G) { const { n, z, place } = G; for (let i = 0; i < n.length; i++) { if (n[i] < 2) continue; sortCell(G, i);
  for (let k = 0; k + 1 < n[i];) { if (z[i * MAXF + k + 1] - z[i * MAXF + k] < HEAD) { for (let j = k; j + 1 < n[i]; j++) { z[i * MAXF + j] = z[i * MAXF + j + 1]; place[i * MAXF + j] = place[i * MAXF + j + 1]; if (G.slope) G.slope[i * MAXF + j] = G.slope[i * MAXF + j + 1]; } n[i]--; z[i * MAXF + n[i]] = NONE; } else k++; } } }
function sortCell(G, i) { const { n, z, place, slope } = G, f = []; for (let k = 0; k < n[i]; k++) f.push([z[i * MAXF + k], place[i * MAXF + k], slope ? slope[i * MAXF + k] : 0]); f.sort((p, q) => p[0] - q[0]); f.forEach(([zz, p, sl], k) => { z[i * MAXF + k] = zz; place[i * MAXF + k] = p; if (slope) slope[i * MAXF + k] = sl; }); }
function sortFloors(G) { for (let i = 0; i < G.n.length; i++) if (G.n[i] > 1) sortCell(G, i); }
// Floor of column i nearest below (or a step above) height y; NONE if none.
export function floorBelow(G, i, y) { let best = NONE; for (let k = 0; k < G.n[i]; k++) { const f = G.z[i * MAXF + k]; if (f <= y + STEP && f > best) best = f; } return best; }
export const cellOf = (G, x, y) => { const c = Math.floor((x - G.x0) / CELL), r = Math.floor((G.y1 - y) / CELL); return c < 0 || r < 0 || c >= G.cols || r >= G.rows ? -1 : r * G.cols + c; };
export { NONE };

// Stairs and ramps: the columns of sloped areas become a smooth surface between the flat floors around them (repeated
// averaging with the flat floors held), so they climb evenly instead of in seams where areas meet. Real ledges —
// between two flat floors — are untouched.
function relaxSlopes(G) { const { cols, rows, n, z, slope } = G, N = cols * rows, nb = [-1, 1, -cols, cols];
  for (let it = 0; it < 60; it++) { let moved = 0;
    for (let i = cols; i < N - cols; i++) for (let k = 0; k < n[i]; k++) { const s = i * MAXF + k; if (!slope[s]) continue; const h = z[s]; let sum = 0, cnt = 0;
      for (const d of nb) { const j = i + d; let best = NONE, bd = 24; for (let q = 0; q < n[j]; q++) { const dz = Math.abs(z[j * MAXF + q] - h); if (dz < bd) { bd = dz; best = z[j * MAXF + q]; } } if (best > NONE) { sum += best; cnt++; } }   // the same surface only (never the level above or below)
      if (cnt) { const v = (h + sum) / (cnt + 1); moved = Math.max(moved, Math.abs(v - h)); z[s] = v; } }
    if (moved < .5) break; } }

// Specks: a column with no floor at some height while (nearly) all its neighbours have one there — a rasterisation
// pinhole (a lone wall dot, or a missing piece of a lower level that would stand as a pillar) — gets that floor.
function fillPinholes(G) { const { cols, rows, n, z, place, flags } = G, N = cols * rows, adds = [];
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) { const i = r * cols + c; if (flags[i] & 1) continue; const seen = [];
    for (const d of [-1, 1, -cols, cols, -cols - 1, -cols + 1, cols - 1, cols + 1]) { const j = i + d; if (flags[j] & 1) continue; for (let k = 0; k < n[j]; k++) seen.push([z[j * MAXF + k], place[j * MAXF + k]]); }
    seen.sort((a, b) => a[0] - b[0]); let lo = 0; for (let q = 1; q <= seen.length; q++) if (q === seen.length || seen[q][0] - seen[q - 1][0] > STEP) { const cl = seen.slice(lo, q); lo = q; if (cl.length < 6) continue;
      const h = cl.reduce((a, b) => a + b[0], 0) / cl.length; let clash = false; for (let k = 0; k < n[i]; k++) if (Math.abs(z[i * MAXF + k] - h) < HEAD) { clash = true; break; } if (!clash) adds.push([i, h, cl[0][1]]); } }
  for (const [i, h, p] of adds) if (n[i] < MAXF) { z[i * MAXF + n[i]] = h; place[i * MAXF + n[i]] = p; n[i]++; } }
