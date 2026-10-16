// Solid stretches along vertical lines through a triangle mesh (a CS2 map's physics: hulls and meshes, Hammer units,
// z up) — the same answer bsp-map.js gets from a BSP's brushes, so the column builder works unchanged. Going down a
// line, a triangle facing up starts a solid, one facing down ends it (hulls are closed; a terrain sheet faces up
// only, so it is solid down to whatever is under it). Walls (facing sideways) don't cut a vertical line: their tops
// and bottoms do. A grid over x / y keeps each query to the triangles near it.
// `open` (optional, per triangle): a triangle of an open sheet (a roof, terrain or awning modelled one-sided) — not the
// skin of a closed solid, so it can't say what lies under it: it stands for a thin slab (SHEET) at its surface.
export const SHEET = 4;
// `piece` (optional, per triangle): which closed piece it belongs to. Then a closed piece is crossed in and out in turn
// along a line — its hits paired, whichever way its triangles face (some hulls come wound inside out).
// `group` (optional, per triangle): what each is made of (an id); every stretch then carries the id of the face its top
// is ([bottom, top, id]; 255: no face — a wall's top, the query's bounds) — the footstep surface of a floor.
// `wallGroups`: a wall face's stretch carries its own group too (the bullets' layer: what a wall is made of — wood,
// metal, plaster — decides what a bullet gets through); else 255 (the players' layer: a wall's top says no floor).
// `thinCols` (with `wall`): thin walls a column thick (see below) — the players' and grenades' layers.
export function meshSolids(pos, idx, cell = 64, open = null, piece = null, wall = 0, wallOff = 0, group = null, wallGroups = false, thinCols = false) {
  const WS = wallGroups && group ? 3 : 2;
  const nt = idx.length / 3; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { const x = pos[i], y = pos[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell) + 1), rows = Math.max(1, Math.ceil((y1 - y0) / cell) + 1);
  // Per triangle: its normal's z (sign: up or down) and its footprint's cells.
  const nz = new Float32Array(nt), count = new Uint32Array(cols * rows + 1);
  const span = (t, f) => { const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const lx = Math.min(pos[a], pos[b], pos[c]), hx = Math.max(pos[a], pos[b], pos[c]), ly = Math.min(pos[a + 1], pos[b + 1], pos[c + 1]), hy = Math.max(pos[a + 1], pos[b + 1], pos[c + 1]);
    const c0 = Math.floor((lx - x0) / cell), c1 = Math.floor((hx - x0) / cell), r0 = Math.floor((ly - y0) / cell), r1 = Math.floor((hy - y0) / cell);
    for (let r = r0; r <= r1; r++) for (let q = c0; q <= c1; q++) f(r * cols + q); };
  for (let t = 0; t < nt; t++) { const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    nz[t] = (pos[b] - pos[a]) * (pos[c + 1] - pos[a + 1]) - (pos[b + 1] - pos[a + 1]) * (pos[c] - pos[a]);   // (2 × the footprint's signed area: + facing up)
    if (Math.abs(nz[t]) > 1e-6) span(t, i => count[i + 1]++); }
  for (let i = 1; i < count.length; i++) count[i] += count[i - 1];
  const items = new Uint32Array(count[count.length - 1]), fill = count.slice(0, -1);
  for (let t = 0; t < nt; t++) if (Math.abs(nz[t]) > 1e-6) span(t, i => { items[fill[i]++] = t; });
  // Steep faces (walls), traced into a fine grid (`wall` units a cell, its cells centred where the builder's lines fall:
  // `wallOff`): a vertical line never crosses a wall's face, so a wall that is one face thick (a one-sided sheet — you'd
  // walk into it and see the map from inside) or thinner than the line spacing would have no collision at all. Each
  // cell a steep face passes through is solid over the heights the face covers there (merged per cell).
  const wallCells = new Map(); if (wall > 0) { const step = wall / 2;
    for (let t = 0; t < nt; t++) { const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nzz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nzz); if (nl < 1e-6 || Math.abs(nzz) / nl > .35) continue;   // (floors, roofs and slopes: the vertical lines see those)
      const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz), nu = Math.max(1, Math.ceil(lu / step)), nv = Math.max(1, Math.ceil(lv / step));
      const mine = new Map();   // (this face's height range in each cell it crosses: faces at other heights stay apart — a gap under a railing stays open)
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const s = i / nu, r = j / nv; if (s + r > 1.0001) continue;
        const px = pos[a] + ux * s + vx * r, py = pos[a + 1] + uy * s + vy * r, pz = pos[a + 2] + uz * s + vz * r, key = Math.round((px - wallOff) / wall) * 1e6 + Math.round((py - wallOff) / wall);
        const L = mine.get(key); if (!L) mine.set(key, [pz, pz]); else { if (pz < L[0]) L[0] = pz; if (pz > L[1]) L[1] = pz; } }
      for (const [key, L] of mine) { const list = wallCells.get(key); if (list) { list.push(L[0], L[1]); if (WS === 3) list.push(group[t]); } else wallCells.set(key, WS === 3 ? [L[0], L[1], group[t]] : [L[0], L[1]]); } } }
  const hz = [], hs = [], ht = [], gOf = t => group && t >= 0 ? group[t] : 255;   // (reused per query; ht: each hit's triangle)
  function solidSpans(x, y, z0, z1, noWalls = false) {
    const q = Math.floor((x - x0) / cell), r = Math.floor((y - y0) / cell); if (q < 0 || r < 0 || q >= cols || r >= rows) return [];
    hz.length = 0; hs.length = 0; ht.length = 0; const sheets = [], byPiece = new Map(), i = r * cols + q;
    for (let k = count[i]; k < count[i + 1]; k++) { const t = items[k], a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      // (x, y) inside the triangle's footprint (barycentric), and its height there.
      const d = nz[t], u = ((pos[b] - x) * (pos[c + 1] - y) - (pos[b + 1] - y) * (pos[c] - x)) / d, v = ((pos[c] - x) * (pos[a + 1] - y) - (pos[c + 1] - y) * (pos[a] - x)) / d, w = 1 - u - v;
      if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue;
      const z = u * pos[a + 2] + v * pos[b + 2] + w * pos[c + 2]; if (z < z0 - 1 || z > z1 + 1) continue;
      if (open && open[t]) { sheets.push(d > 0 ? [z - SHEET, z, gOf(t)] : [z, z + SHEET, gOf(t)]); continue; }
      if (piece) { const pc = piece[t]; let L = byPiece.get(pc); if (!L) byPiece.set(pc, L = []); L.push([z, t]); continue; }
      hz.push(z); hs.push(d > 0 ? 1 : -1); ht.push(t); }
    for (const L of byPiece.values()) { L.sort((p, s) => p[0] - s[0]); const u = []; for (const h of L) if (!u.length || h[0] - u[u.length - 1][0] > .01) u.push(h);   // (an edge two triangles share: once)
      for (let k = 0; k + 1 < u.length; k += 2) sheets.push([u[k][0], u[k + 1][0], gOf(u[k + 1][1])]); }
    const order = hz.map((_, k) => k).sort((p, s) => hz[s] - hz[p]);   // top down
    // How deep inside solids the line is, going down: a top surface one deeper, an underside one less (overlapping
    // hulls — CS2 builds its collision from many — count once each).
    const out = []; let top = null, topT = -1, depth = 0, lz = Infinity, ls = 0;
    for (const k of order) { const z = hz[k]; if (hs[k] === ls && lz - z < .01) continue; lz = z; ls = hs[k];   // (a line along an edge two triangles share meets the surface twice)
      if (hs[k] > 0) { if (depth++ === 0) { top = z; topT = ht[k]; } }   // a top surface: solid below it
      else if (depth > 0) { if (--depth === 0 && top - z > .5) out.push([z, top, gOf(topT)]); }   // the last underside: out again
      else out.push([z, z1, 255]); }   // an underside with nothing above it: solid from here up (the line starts inside)
    if (depth > 0) out.push([z0, top, gOf(topT)]);
    for (const sh of sheets) out.push(sh);
    if (wall > 0 && !noWalls) { const W = wallCells.get(Math.round((x - wallOff) / wall) * 1e6 + Math.round((y - wallOff) / wall)); if (W) for (let k = 0; k < W.length; k += WS) if (W[k + 1] > z0 && W[k] < z1) out.push([Math.max(W[k], z0), Math.min(W[k + 1] + .5, z1), WS === 3 ? W[k + 2] : 255]); }   // (the walls' faces through this cell)
    out.sort((p, s) => p[0] - s[0]); const merged = []; for (const s of out) { const last = merged[merged.length - 1]; if (last && s[0] <= last[1] + .5) { if (s[1] > last[1] || (s[1] > last[1] - .5 && last[2] === 255)) { last[1] = Math.max(last[1], s[1]); last[2] = s[2]; } } else merged.push([s[0], s[1], s[2]]); }   // (a merged stretch: the surface of its highest top)
    if (!group) for (const m of merged) m.length = 2;   // (no surfaces asked for: [bottom, top])
    return merged; }
  // Thin walls a column thick: the game's columns (16 units, bsp-map.js) are solid where two of their four lines are
  // (lines 8 apart, at wallOff), so a thin wall crossing a column slantwise — through one line's cell only — left that
  // column open: a slanted one-face wall (Mirage's buildings round Side Alley are shells) let a body walk inside. Where a
  // slanted steep face has nothing solid 10 units behind it (a sheet, or a hull that thin), every line of each column
  // it crosses is solid over the heights it covers there. (Square to the lines, a wall meets two lines a column: kept.)
  if (thinCols && wall > 0) { const step = wall / 2, add = new Map(), col = k => 2 * Math.floor(k / 2), PROBES = [[1 / 3, 1 / 3], [.6, .2], [.2, .6], [.2, .2]];
    let zl = Infinity, zh = -Infinity; for (let i = 2; i < pos.length; i += 3) { if (pos[i] < zl) zl = pos[i]; if (pos[i] > zh) zh = pos[i]; }
    const at = (x, y, z) => { for (const s of solidSpans(x, y, zl - 1, zh + 1, true)) if (s[0] <= z && s[1] >= z) return true; return false; };   // (the whole line: a hull's top and bottom say what is between)
    for (let t = 0; t < nt; t++) { const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nzz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nzz); if (nl < 1e-6 || Math.abs(nzz) / nl > .35) continue;
      const hl = Math.hypot(nx, ny), hx = nx / hl, hy = ny / hl; if (Math.min(Math.abs(hx), Math.abs(hy)) < .17) continue;   // (within 10° of square to the lines)
      // (thin: at any of four points over the face, nothing solid 10 units behind it — on the hull's side, if either)
      let thin = false; for (const [s, r] of PROBES) { const px = pos[a] + ux * s + vx * r, py = pos[a + 1] + uy * s + vy * r, pz = pos[a + 2] + uz * s + vz * r;
        const back = at(px - hx * 1.5, py - hy * 1.5, pz), front = !back && at(px + hx * 1.5, py + hy * 1.5, pz), sg = back ? -1 : front ? 1 : 0;
        if (!sg || !at(px + sg * hx * 10, py + sg * hy * 10, pz)) { thin = true; break; } }
      if (!thin) continue;   // thick: its lines have it
      const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz), nu = Math.max(1, Math.ceil(lu / step)), nv = Math.max(1, Math.ceil(lv / step)), mine = new Map();
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const s = i / nu, r = j / nv; if (s + r > 1.0001) continue;
        const px = pos[a] + ux * s + vx * r, py = pos[a + 1] + uy * s + vy * r, pz = pos[a + 2] + uz * s + vz * r;
        const kx = col(Math.round((px - wallOff) / wall)), ky = col(Math.round((py - wallOff) / wall));
        for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) { const key = (kx + dx) * 1e6 + ky + dy, L = mine.get(key); if (!L) mine.set(key, [pz, pz]); else { if (pz < L[0]) L[0] = pz; if (pz > L[1]) L[1] = pz; } } }
      for (const [key, L] of mine) { const list = add.get(key); if (list) { list.push(L[0], L[1]); if (WS === 3) list.push(group[t]); } else add.set(key, WS === 3 ? [L[0], L[1], group[t]] : [L[0], L[1]]); } }
    for (const [key, L] of add) { const list = wallCells.get(key); if (list) for (const v of L) list.push(v); else wallCells.set(key, L); } }
  return { solidSpans, bounds: { mins: [x0, y0], maxs: [x1, y1] }, triangles: nt };
}
