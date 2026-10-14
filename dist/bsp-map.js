// A Defuse map built from a Counter-Strike 1.6 map file (bsp30.js): what you see is what you walk on. Every 16-unit
// column is probed with four vertical rays through the map's solid parts (the world, walls, doors, breakables); the
// solid stretches two or more rays agree on are the column's collision, and the top of a solid with at least a
// crouching body's room above it is a floor (its ceiling the next solid). Spawns, bomb sites and buy zones come from
// the map's own entities. Place names (callouts, the radar's labels, the bots' mid) come from the CS:GO navigation
// data of the same map, matched to this file by aligning the spawns and bomb sites (the community ports are often
// moved, rotated or scaled). The rest (boxes, navigation, routes, radar) is the classic maps' own (finishMap).
import { solidSpans, hullSolid, vec, modelOf } from './bsp30.js';
import { CELL, MAXF, NONE, SITE, STEP } from './cs-columns.js';
import { finishMap, U } from './cs-mapbuild.js';

const CROUCH = 36, SOLID = /^func_(wall|wall_toggle|breakable|door|door_rotating|pushable|train|tracktrain|plat|rotating|button|brush)$/, Q = 2;
export function buildBspMap(id, bsp, { T, nav = null } = {}) {
  // Solid parts: the world and the solid brush entities (with their origin offset), each with its bounds.
  const parts = [{ head: bsp.models[0].head, off: [0, 0, 0], ...bounds(bsp.models[0], [0, 0, 0]) }];
  for (const e of bsp.entities) { const mi = modelOf(e); if (mi > 0 && SOLID.test(e.classname || '') && bsp.models[mi]) { const off = e.origin ? vec(e.origin) : [0, 0, 0]; parts.push({ head: bsp.models[mi].head, off, ...bounds(bsp.models[mi], off) }); } }
  // Source maps (vbsp.js: toGoldSrc) keep their 3D sky box — a miniature far outside the play area — inside the world's
  // bounds: there the area is the spawns' and bomb sites' surroundings (1 500 units round them) and their height range.
  // Source places a spawn at the feet (Counter-Strike 1.6: the body's centre, 36 up).
  const src = bsp.format === 'vbsp', feetUp = src ? 0 : 36;
  if (src) { const pts = []; for (const e of bsp.entities) { if (/^info_player_(deathmatch|start)$/.test(e.classname)) pts.push(vec(e.origin)); const mi = modelOf(e); if (mi > 0 && /^func_(bomb_target|buyzone)$/.test(e.classname) && bsp.models[mi]) { const m = bsp.models[mi]; pts.push(m.mins, m.maxs); } }
    const lo = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k]))), W = parts[0];
    W.mins = [Math.max(W.mins[0], lo[0] - 1500), Math.max(W.mins[1], lo[1] - 1500), Math.max(W.mins[2], lo[2] - 700)]; W.maxs = [Math.min(W.maxs[0], hi[0] + 1500), Math.min(W.maxs[1], hi[1] + 1500), Math.min(W.maxs[2], hi[2] + 900)]; }
  const W0 = parts[0], x0 = Math.floor(W0.mins[0] / CELL) * CELL, y1 = Math.ceil(W0.maxs[1] / CELL) * CELL, cols = Math.ceil((W0.maxs[0] - x0) / CELL), rows = Math.ceil((y1 - W0.mins[1]) / CELL), N = cols * rows, zA = W0.mins[2] - 8, zB = W0.maxs[2] + 8;
  // Solid stretches per column: four rays (±4 units), solid where two or more are.
  const spans = new Array(N), ev = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const cx = x0 + (c + .5) * CELL, cy = y1 - (r + .5) * CELL; ev.length = 0;
    for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { const x = cx + dx, y = cy + dy, ray = [];
      for (const p of parts) { if (x < p.mins[0] || x > p.maxs[0] || y < p.mins[1] || y > p.maxs[1]) continue; for (const [b, t] of (bsp.solidSpans ? bsp.solidSpans(p.head, x - p.off[0], y - p.off[1], zA - p.off[2], zB - p.off[2]) : solidSpans(bsp, p.head, x - p.off[0], y - p.off[1], zA - p.off[2], zB - p.off[2]))) ray.push([b + p.off[2], t + p.off[2]]); }   // Source: by its brushes (vbsp.js)
      if (bsp.extraSpans) { const ex = bsp.extraSpans(x, y); if (ex) for (const [b, t] of ex) if (t > zA && b < zB) ray.push([b, t]); }   // Source: displacements, solid props (vbsp-solids.js)
      for (const [b, t] of ray) { ev.push(b, 1, t, -1); } }
    const ord = []; for (let i = 0; i < ev.length; i += 2) ord.push(i); ord.sort((a, b) => ev[a] - ev[b] || ev[b + 1] - ev[a + 1]);
    const out = []; let k = 0, start = null; for (const i of ord) { const was = k; k += ev[i + 1]; if (was < 2 && k >= 2) start = ev[i]; else if (was >= 2 && k < 2 && start !== null) { const lo = Math.floor(start / Q) * Q, hi = Math.round(ev[i] / Q) * Q, last = out[out.length - 1]; if (last && lo - last[1] < 4) last[1] = hi; else if (hi > lo) out.push([lo, hi]); start = null; } }
    spans[r * cols + c] = out; }
  // Floors: a solid's top with crouching room above (its ceiling the next solid's bottom); three per column at most —
  // standing room first, lowest first.
  const n = new Uint8Array(N), z = new Float32Array(N * MAXF).fill(NONE), ceil = new Float32Array(N * MAXF).fill(Infinity), place = new Uint8Array(N * MAXF), flags = new Uint8Array(N), slope = new Uint8Array(N * MAXF), floorOf = new Array(N);
  for (let i = 0; i < N; i++) { const S = spans[i], fl = []; for (let k = 0; k < S.length; k++) { const gap = (S[k + 1]?.[0] ?? Infinity) - S[k][1]; if (gap >= CROUCH && S[k][1] > zA + 16 && (k + 1 < S.length || S[k][1] < zB - 16)) fl.push({ h: S[k][1], c: S[k + 1]?.[0] ?? Infinity, stand: gap >= 72 }); }
    const keep = fl.length > MAXF ? [...fl.filter(f => f.stand), ...fl.filter(f => !f.stand)].slice(0, MAXF).sort((a, b) => a.h - b.h) : fl; n[i] = keep.length; keep.forEach((f, k) => { z[i * MAXF + k] = f.h; ceil[i * MAXF + k] = f.c; }); floorOf[i] = keep; }
  // Only floors a player can get to count: flooded from the spawns over steps and jumps (up to 64 units, a crouch-jump),
  // drops, and up and down the map's ladders. Roofs inside the sky box and sealed spaces are not floors (their solid
  // still blocks), so "the floor here" is never a roof nobody can reach.
  { const ents0 = c => bsp.entities.filter(e => e.classname === c), cellOf0 = (x, y) => { const c = Math.floor((x - x0) / CELL), r = Math.floor((y1 - y) / CELL); return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c; };
    const ladder = new Float32Array(N).fill(-Infinity); for (const e of ents0('func_ladder')) { const mi = modelOf(e); if (mi <= 0 || !bsp.models[mi]) continue; const b = bounds(bsp.models[mi], e.origin ? vec(e.origin) : [0, 0, 0]); for (let x = b.mins[0] - 24; x <= b.maxs[0] + 24; x += CELL / 2) for (let y = b.mins[1] - 24; y <= b.maxs[1] + 24; y += CELL / 2) { const i = cellOf0(x, y); if (i >= 0) ladder[i] = Math.max(ladder[i], b.maxs[2]); } }
    // A floor a standing player fits on, by the game's own player hull (clip brushes included: the roofs the real game
    // keeps you off stay out). Floors right by a wall (the hull's centre can't get that close) join their neighbours below.
    const hull1 = bsp.models[0].hulls[1], fits = v => { if (!bsp.clipnodes) return ceil[v] - z[v] >= 54;   /* Source keeps no player hulls: room to crouch over the floor */ const i = (v / MAXF) | 0, x = x0 + (i % cols + .5) * CELL, y = y1 - (((i / cols) | 0) + .5) * CELL; for (const up of [38, 44, 50, 56, 72, 92, 112, 132]) if (!hullSolid(bsp, hull1, x, y, z[v] + up)) return true; return false; };   // centre 36 above the feet, up to a step more on ramps and stairs (the hull rests on the highest point under it), or on an invisible clip floor up to 96 above (Train's tracks); roof clips reach up to the sky
    // Source maps' terrain: a floor on a slope steeper than 45° (a step higher on one side, a step lower on the opposite
    // one) can't be walked up onto — Source slides you off it; jumping up a cliff of displacements is not a way out.
    const steep = new Uint8Array(N * MAXF); if (src) { const nearH = (j, h) => { let b = NaN, d = Infinity; for (let k = 0; k < n[j]; k++) { const e = Math.abs(z[j * MAXF + k] - h); if (e < d) { d = e; b = z[j * MAXF + k]; } } return d <= 64 ? b : NaN; };
      for (let i = 0; i < N; i++) { const c = i % cols, r = (i / cols) | 0; for (let k = 0; k < n[i]; k++) { const h = z[i * MAXF + k], at = (dc, dr) => { const cc = c + dc, rr = r + dr; return cc < 0 || rr < 0 || cc >= cols || rr >= rows ? NaN : nearH(rr * cols + cc, h) - h; };
        for (const [a, b] of [[at(-1, 0), at(1, 0)], [at(0, -1), at(0, 1)]]) if ((a > 18 && b < -18) || (a < -18 && b > 18)) { steep[i * MAXF + k] = 1; break; } } } }
    const seen = new Uint8Array(N * MAXF), q = [];
    for (const e of [...ents0('info_player_deathmatch'), ...ents0('info_player_start')]) { const o = vec(e.origin), i = cellOf0(o[0], o[1]); if (i < 0) continue; let best = -1, bd = Infinity; for (let k = 0; k < n[i]; k++) { const d = Math.abs(z[i * MAXF + k] - (o[2] - feetUp)); if (d < bd) { bd = d; best = k; } } if (best >= 0 && bd < 64 && !seen[i * MAXF + best]) { seen[i * MAXF + best] = 1; q.push(i * MAXF + best); } }
    for (let h = 0; h < q.length; h++) { const v = q[h], i = (v / MAXF) | 0, hv = z[v], c = i % cols, climb = ladder[i] > -Infinity ? Math.max(64, ladder[i] + 40 - hv) : 64;
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols, i]) { if (j < 0 || j >= N) continue; const cl = Math.max(climb, ladder[j] > -Infinity ? ladder[j] + 40 - hv : 0);
        for (let k = 0; k < n[j]; k++) { const w = j * MAXF + k, hj = z[w]; if (seen[w] || w === v || hj - hv > cl || hv - hj > 600 || (steep[w] && hj - hv > 2) || Math.min(ceil[w], j === i ? Infinity : ceil[v]) - Math.max(hv, hj) < CROUCH) continue; seen[w] = 1; if (fits(w)) q.push(w); else seen[w] = 2; } } }   // 2: kept as floor (beside a wall), not walked on from
    for (let i = 0; i < N; i++) { let w = 0; const fl = []; for (let k = 0; k < n[i]; k++) if (seen[i * MAXF + k]) { z[i * MAXF + w] = z[i * MAXF + k]; ceil[i * MAXF + w] = ceil[i * MAXF + k]; fl.push(floorOf[i][k]); w++; } for (let k = w; k < MAXF; k++) { z[i * MAXF + k] = NONE; ceil[i * MAXF + k] = Infinity; } n[i] = w; floorOf[i] = fl; } }
  let zLow = Infinity; for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) zLow = Math.min(zLow, z[i * MAXF + k]); if (!Number.isFinite(zLow)) throw Error('No floor found in the map');
  const G = { cols, rows, x0, y1, n, z, place, flags, slope, places: [''], split: null, crateBase: new Float32Array(N).fill(NONE), ceil };
  const W = cols * CELL * U, D = rows * CELL * U, toGameXZ = (x, y) => [+((x - x0) * U - W / 2).toFixed(1), +((y1 - y) * U - D / 2).toFixed(1)], cellOf = (x, y) => { const c = Math.floor((x - x0) / CELL), r = Math.floor((y1 - y) / CELL); return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c; };
  const floorNear = (i, h) => { let best = -1, bd = Infinity; for (let k = 0; k < n[i]; k++) { const d = Math.abs(z[i * MAXF + k] - h); if (d < bd) { bd = d; best = k; } } return bd < 64 ? best : -1; };
  // Spawns (feet = origin − 36) and bomb sites from the entities.
  const ents = c => bsp.entities.filter(e => e.classname === c), feet = e => { const o = vec(e.origin); return [o[0], o[1], o[2] - feetUp]; };
  const tSp = ents('info_player_deathmatch').map(feet), ctSp = ents('info_player_start').map(feet);
  const siteBoxes = ents('func_bomb_target').concat(ents('info_bomb_target')).map(e => { const mi = modelOf(e); if (mi > 0) return bounds(bsp.models[mi], e.origin ? vec(e.origin) : [0, 0, 0]); const o = vec(e.origin); return { mins: [o[0] - 128, o[1] - 128, o[2] - 64], maxs: [o[0] + 128, o[1] + 128, o[2] + 128] }; });
  // Align to the CS:GO navigation data: a 2D similarity (scale, turn, shift) from the spawn and site centres.
  const centre = pts => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  const boxC = b => [(b.mins[0] + b.maxs[0]) / 2, (b.mins[1] + b.maxs[1]) / 2, b.mins[2]];
  let labels = ['A', 'B'].slice(0, siteBoxes.length), align = null;
  if (nav && tSp.length && ctSp.length) { const navC = p => { const a = nav.areas.filter(x => nav.places[x[7]] === p); return a.length ? centre(a.map(x => [(x[0] + x[2]) / 2, (x[1] + x[3]) / 2, (x[4] + x[5]) / 2])) : null; };
    const dst = { T: navC('TSpawn'), CT: navC('CTSpawn'), A: navC('BombsiteA'), B: navC('BombsiteB') };
    for (const order of siteBoxes.length >= 2 ? [['A', 'B'], ['B', 'A']] : [['A']]) { const src = [centre(tSp), centre(ctSp), ...siteBoxes.slice(0, order.length).map(boxC)], to = [dst.T, dst.CT, ...order.map(L => dst[L])]; if (to.some(v => !v)) continue;
      const fit = similarity(src, to); if (!align || fit.err < align.err) { align = fit; labels = order; } } }
  // Place names: each floor takes the place of the CS:GO area under its aligned position (its height near).
  if (align) { const P = nav.places, grid = new Map(), K = 128, key = (a, b) => a + ',' + b; G.places = [...P];
    for (const [ai, a] of nav.areas.entries()) for (let gx = Math.floor(a[0] / K); gx <= Math.floor(a[2] / K); gx++) for (let gy = Math.floor(a[1] / K); gy <= Math.floor(a[3] / K); gy++) { const k = key(gx, gy); (grid.get(k) || grid.set(k, []).get(k)).push(ai); }
    for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) { const cx = x0 + (i % cols + .5) * CELL, cy = y1 - (((i / cols) | 0) + .5) * CELL, [X, Y, H] = align.map(cx, cy, z[i * MAXF + k]); let best = -1, bd = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const ai of grid.get(key(Math.floor(X / K) + dx, Math.floor(Y / K) + dy)) || []) { const a = nav.areas[ai], ex = Math.max(a[0] - X, 0, X - a[2]), ey = Math.max(a[1] - Y, 0, Y - a[3]), dz = Math.abs((a[4] + a[5]) / 2 - H), d = Math.hypot(ex, ey) + dz * .5; if (d < bd && dz < 160) { bd = d; best = ai; } }
      if (best >= 0 && bd < 200) place[i * MAXF + k] = nav.areas[best][7]; } }
  // A separate lower level (Nuke): the CS:GO data's split height, brought into this file's heights by the alignment.
  if (align && nav.split) G.split = { top: (nav.split.top - align.dz) / align.s, bottom: -1e9 };
  const placeId = name => { let p = G.places.indexOf(name); if (p < 0) { p = G.places.length; G.places.push(name); } return p; };
  // Bomb sites: the floors inside each target's box, named BombsiteA / B.
  // Bomb sites: the ground under each target's box — floors near the box's bottom with standing room (not a railcar's
  // deck, not the ground under one); a box whose bottom is well above the floor takes the lowest standable floor under it.
  siteBoxes.forEach((b, j) => { const pid = placeId('Bombsite' + (labels[j] || 'AB'[j])); for (const loose of [false, true]) { let got = 0;
    for (let i = 0; i < N; i++) { const cx = x0 + (i % cols + .5) * CELL, cy = y1 - (((i / cols) | 0) + .5) * CELL; if (cx < b.mins[0] || cx > b.maxs[0] || cy < b.mins[1] || cy > b.maxs[1]) continue;
      for (let k = 0; k < n[i]; k++) { const h = z[i * MAXF + k]; if (ceil[i * MAXF + k] - h < 72) continue; if (loose ? h >= b.mins[2] - 96 && h <= b.maxs[2] : h >= b.mins[2] - 24 && h <= Math.min(b.maxs[2], b.mins[2] + 48)) { place[i * MAXF + k] = pid; flags[i] |= SITE; got++; break; } } }
    if (got) break; } });
  // Spawns: ten a side, spread out (farthest first) from the map's spawn points; their columns are the spawn places.
  const pickTen = pts => { if (pts.length <= 10) return pts; const c = centre(pts), out = [pts.reduce((a, p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(a[0] - c[0], a[1] - c[1]) ? p : a)]; while (out.length < 10) { let best = null, bd = -1; for (const p of pts) { const d = Math.min(...out.map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))); if (d > bd) { bd = d; best = p; } } out.push(best); } return out; };
  const T10 = pickTen(tSp), CT10 = pickTen(ctSp);
  for (const [pts, name] of [[tSp, 'TSpawn'], [ctSp, 'CTSpawn']]) { const pid = placeId(name); for (const p of pts) { const i = cellOf(p[0], p[1]); if (i < 0) continue; const k = floorNear(i, p[2]); if (k >= 0 && !G.places[place[i * MAXF + k]]) place[i * MAXF + k] = pid; } }
  // Collision segments: the solid stretches, walk-on where a floor is on top.
  const segs = new Array(N); for (let i = 0; i < N; i++) { const out = []; for (const [b, t] of spans[i]) { if (t <= zLow - 64) continue; const top = floorOf[i].some(f => f.h === t); out.push([Math.max(b, zLow - 64), t, top ? (T.floor || 'concrete') : (T.wall || 'concrete'), top]); } segs[i] = out; }
  // Spawns carry their floor's height ([x, z, y]): these maps have floors above the spawns (balconies, bridges).
  const spawnY = p => { const i = cellOf(p[0], p[1]), k = i >= 0 ? floorNear(i, p[2]) : -1; return +(((k >= 0 ? z[i * MAXF + k] : p[2]) - zLow) * U).toFixed(2); };
  const spawns = { t: T10.map(p => [...toGameXZ(p[0], p[1]), spawnY(p)]), ct: CT10.map(p => [...toGameXZ(p[0], p[1]), spawnY(p)]) };
  const toGame = (x, y, h) => [(x - x0) * U - W / 2, (h - zLow) * U, (y1 - y) * U - D / 2];
  // Ladders (func_ladder): their volumes in game units relative to the map centre [minX, maxX, minZ, maxZ, y0, y1], for
  // climbing (arena-move.js).
  const ladders = []; for (const e of ents('func_ladder')) { const mi = modelOf(e); if (mi <= 0 || !bsp.models[mi]) continue; const b = bounds(bsp.models[mi], e.origin ? vec(e.origin) : [0, 0, 0]), a = toGame(b.mins[0], b.maxs[1], b.mins[2]), c = toGame(b.maxs[0], b.mins[1], b.maxs[2]);
    ladders.push([a[0], c[0], a[2], c[2], a[1], c[1]].map(v => +v.toFixed(2))); }
  const map = finishMap(id, G, T, { segs, above: new Float32Array(N).fill(NONE), zLow, spawns, extra: { bsp: { data: bsp, toGame }, aligned: align ? +align.err.toFixed(0) : null, fromFile: true, ladders } });
  // The segments only made the collision boxes: these maps are drawn from their own faces (bsp-mesh.js), never from
  // the columns, and a large map holds some 200 000 of them (60 MB).
  map.columns.segs = null; return map;
}
// A brush model's bounds, moved by an entity origin.
function bounds(m, off) { return { mins: m.mins.map((v, j) => v + off[j]), maxs: m.maxs.map((v, j) => v + off[j]) }; }
// Least-squares 2D similarity src → dst (Umeyama), heights by the same scale plus a shift; err: mean distance (units).
function similarity(src, dst) { const n = src.length, ms = [0, 0], md = [0, 0]; for (let i = 0; i < n; i++) { ms[0] += src[i][0] / n; ms[1] += src[i][1] / n; md[0] += dst[i][0] / n; md[1] += dst[i][1] / n; }
  let a = 0, b = 0, ss = 0; for (let i = 0; i < n; i++) { const sx = src[i][0] - ms[0], sy = src[i][1] - ms[1], dx = dst[i][0] - md[0], dy = dst[i][1] - md[1]; a += sx * dx + sy * dy; b += sx * dy - sy * dx; ss += sx * sx + sy * sy; }
  const s = Math.hypot(a, b) / ss, th = Math.atan2(b, a), co = Math.cos(th) * s, si = Math.sin(th) * s; let dz = 0; for (let i = 0; i < n; i++) dz += (dst[i][2] - src[i][2] * s) / n;
  const map = (x, y, h) => [md[0] + co * (x - ms[0]) - si * (y - ms[1]), md[1] + si * (x - ms[0]) + co * (y - ms[1]), h * s + dz];
  let err = 0; for (let i = 0; i < n; i++) { const p = map(...src[i]); err += Math.hypot(p[0] - dst[i][0], p[1] - dst[i][1], p[2] - dst[i][2]) / n; } return { s, th, dz, map, err }; }   // (heights count: Nuke's sites are stacked)
