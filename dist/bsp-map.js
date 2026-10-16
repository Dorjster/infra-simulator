// A Defuse map built from a Counter-Strike 1.6 map file (bsp30.js): what you see is what you walk on. Every 16-unit
// column is probed with four vertical rays through the map's solid parts (the world, walls, doors, breakables); the
// solid stretches two or more rays agree on are the column's collision, and the top of a solid with at least a
// crouching body's room above it is a floor (its ceiling the next solid). Spawns, bomb sites and buy zones come from
// the map's own entities. Place names (callouts, the radar's labels, the bots' mid) come from the CS:GO navigation
// data of the same map, matched to this file by aligning the spawns and bomb sites (the community ports are often
// moved, rotated or scaled). The rest (boxes, navigation, routes, radar) is the classic maps' own (finishMap).
import { solidSpans, solidAt, hullSolid, hullSpans, vec, modelOf } from './bsp30.js';
import { CELL, MAXF, NONE, SITE, STEP } from './cs-columns.js';
import { finishMap, mergeSegs, U } from './cs-mapbuild.js';
import { floorLight, floorSurface, SURFACES, UNKNOWN } from './map-light.js';

const CROUCH = 36, SOLID = /^func_(wall|wall_toggle|breakable|door|door_rotating|pushable|train|tracktrain|plat|rotating|button|brush)$/, Q = 2;
// Counter-Strike 1.6 doors (sliding, and rotating about an upright hinge) and breakables (glass, vents, crates) move or
// break in play: they are not part of the fixed collision but boxes of their own, switched by the round's state
// (arena-maps.js applyMapState), and drawn as meshes of their own (bsp-mesh.js). Unbreakable glass (material 7),
// trigger-only breakables and doors turning about a level axis stay fixed.
export const moverOf = (e, src) => { if (src) return null;   /* (Source map files: none; Counter-Strike 2's: its doors and breakables, cs2-map.js) */ const c = e.classname || '', f = +e.spawnflags || 0;
  if (c === 'func_door_rotating') return f & (64 | 128) ? null : 'rotdoor'; if (c === 'func_door') return f & 8 ? null : 'door';
  if (c === 'func_breakable') return +e.material === 7 || f & 1 ? null : 'break'; return null; };
export function buildBspMap(id, bsp, { T, nav = null } = {}) {
  // Solid parts: the world and the solid brush entities (with their origin offset), each with its bounds.
  const parts = [{ head: bsp.models[0].head, off: [0, 0, 0], mi: 0, ...bounds(bsp.models[0], [0, 0, 0]) }];
  for (const e of bsp.entities) { const mi = modelOf(e); if (mi > 0 && SOLID.test(e.classname || '') && bsp.models[mi] && !moverOf(e, bsp.format === 'vbsp' && !bsp.cs2)) { const off = e.origin ? vec(e.origin) : [0, 0, 0]; parts.push({ head: bsp.models[mi].head, off, mi, ...bounds(bsp.models[mi], off) }); } }
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
  // Counter-Strike 2 maps: what bullets hit, sampled the same way (cs2-map.js bulletSpans) with what each stretch is made
  // of — no player clips (Mirage's mid window, smoothing round corners) or fences that let bullets through.
  const bspans = bsp.bulletSpans ? new Array(N) : null, evB = [], mB = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const cx = x0 + (c + .5) * CELL, cy = y1 - (r + .5) * CELL; ev.length = 0;
    for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { const x = cx + dx, y = cy + dy, ray = [];
      for (const p of parts) { if (x < p.mins[0] || x > p.maxs[0] || y < p.mins[1] || y > p.maxs[1]) continue; for (const [b, t] of (bsp.solidSpans ? bsp.solidSpans(p.head, x - p.off[0], y - p.off[1], zA - p.off[2], zB - p.off[2]) : solidSpans(bsp, p.head, x - p.off[0], y - p.off[1], zA - p.off[2], zB - p.off[2]))) ray.push([b + p.off[2], t + p.off[2]]); }   // Source: by its brushes (vbsp.js)
      if (bsp.extraSpans) { const ex = bsp.extraSpans(x, y); if (ex) for (const [b, t] of ex) if (t > zA && b < zB) ray.push([b, t]); }   // Source: displacements, solid props (vbsp-solids.js)
      for (const [b, t] of ray) { ev.push(b, 1, t, -1); } }
    const ord = []; for (let i = 0; i < ev.length; i += 2) ord.push(i); ord.sort((a, b) => ev[a] - ev[b] || ev[b + 1] - ev[a + 1]);
    const out = []; let k = 0, start = null; for (const i of ord) { const was = k; k += ev[i + 1]; if (was < 2 && k >= 2) start = ev[i]; else if (was >= 2 && k < 2 && start !== null) { const lo = Math.floor(start / Q) * Q, hi = Math.round(ev[i] / Q) * Q, last = out[out.length - 1]; if (last && lo - last[1] < 4) last[1] = hi; else if (hi > lo) out.push([lo, hi]); start = null; } }
    spans[r * cols + c] = out;
    if (bspans) { evB.length = 0; mB.length = 0;
      for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) for (const [b, t, m] of bsp.bulletSpans(cx + dx, cy + dy, zA, zB)) { evB.push(b, 1, t, -1); mB.push(b, t, m); }
      const ordB = []; for (let i = 0; i < evB.length; i += 2) ordB.push(i); ordB.sort((a, b) => evB[a] - evB[b] || evB[b + 1] - evB[a + 1]);
      const outB = []; let kb = 0, sb = null; for (const i of ordB) { const was = kb; kb += evB[i + 1]; if (was < 2 && kb >= 2) sb = evB[i]; else if (was >= 2 && kb < 2 && sb !== null) { const lo = Math.floor(sb / Q) * Q, hi = Math.round(evB[i] / Q) * Q;
        if (hi > lo) { let mat = 'concrete', best = 0; for (let j = 0; j < mB.length; j += 3) { const ov = Math.min(hi, mB[j + 1]) - Math.max(lo, mB[j]); if (ov > best) { best = ov; mat = mB[j + 2]; } } outB.push([lo, hi, mat]); } sb = null; } }
      bspans[r * cols + c] = outB; } }
  if (!src) thinWalls(bsp, parts, spans, { x0, y1, cols, rows, zA, zB, src });   // (Source maps: their brushes clipped exactly per ray; none was walked through)
  if (!src) playerClips(bsp, spans, { x0, y1, cols, rows, zA, zB });
  // Floors: a solid's top with crouching room above (its ceiling the next solid's bottom); three per column at most —
  // standing room first, lowest first.
  const n = new Uint8Array(N), z = new Float32Array(N * MAXF).fill(NONE), ceil = new Float32Array(N * MAXF).fill(Infinity), place = new Uint8Array(N * MAXF), flags = new Uint8Array(N), slope = new Uint8Array(N * MAXF), floorOf = new Array(N);
  for (let i = 0; i < N; i++) { const S = spans[i], fl = []; for (let k = 0; k < S.length; k++) { const gap = (S[k + 1]?.[0] ?? Infinity) - S[k][1]; if (gap >= CROUCH && S[k][1] > zA + 16 && (k + 1 < S.length || S[k][1] < zB - 16)) fl.push({ h: S[k][1], c: S[k + 1]?.[0] ?? Infinity, stand: gap >= 72 }); }
    const keep = fl.length > MAXF ? [...fl.filter(f => f.stand), ...fl.filter(f => !f.stand)].slice(0, MAXF).sort((a, b) => a.h - b.h) : fl; n[i] = keep.length; keep.forEach((f, k) => { z[i * MAXF + k] = f.h; ceil[i * MAXF + k] = f.c; }); floorOf[i] = keep; }
  // Only floors a player can get to count: flooded from the spawns over steps and jumps (up to 64 units, a crouch-jump),
  // drops, and up and down the map's ladders. Roofs inside the sky box and sealed spaces are not floors (their solid
  // still blocks), so "the floor here" is never a roof nobody can reach.
  { const ents0 = c => bsp.entities.filter(e => e.classname === c), cellOf0 = (x, y) => { const c = Math.floor((x - x0) / CELL), r = Math.floor((y1 - y) / CELL); return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c; };
    const ladder = new Float32Array(N).fill(-Infinity), ladderVols = [...ents0('func_ladder').map(e => { const mi = modelOf(e); return mi > 0 && bsp.models[mi] ? bounds(bsp.models[mi], e.origin ? vec(e.origin) : [0, 0, 0]) : null; }).filter(Boolean), ...(bsp.ladderBoxes || [])];   // (Source: ladder brushes)
    for (const b of ladderVols) { for (let x = b.mins[0] - 24; x <= b.maxs[0] + 24; x += CELL / 2) for (let y = b.mins[1] - 24; y <= b.maxs[1] + 24; y += CELL / 2) { const i = cellOf0(x, y); if (i >= 0) ladder[i] = Math.max(ladder[i], b.maxs[2]); } }
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
      const fit = bsp.cs2 ? { s: 1, th: 0, dz: 0, map: (x, y, h) => [x, y, h], err: Math.hypot(...src.slice(2).flatMap((p, k) => [p[0] - to[k + 2][0], p[1] - to[k + 2][1], p[2] - to[k + 2][2]])) }   // (Counter-Strike 2 maps: the navigation's own coordinates — no fitting, just which site is which; by height too: Nuke's B lies under A)
        : similarity(src, to); if (!align || fit.err < align.err) { align = fit; labels = order; } } }
  // Place names: each floor takes the place of the CS:GO area under its aligned position (its height near).
  if (align) { const P = nav.places, grid = new Map(), K = 128, key = (a, b) => a + ',' + b; G.places = [...P];
    for (const [ai, a] of nav.areas.entries()) for (let gx = Math.floor(a[0] / K); gx <= Math.floor(a[2] / K); gx++) for (let gy = Math.floor(a[1] / K); gy <= Math.floor(a[3] / K); gy++) { const k = key(gx, gy); (grid.get(k) || grid.set(k, []).get(k)).push(ai); }
    for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) { const cx = x0 + (i % cols + .5) * CELL, cy = y1 - (((i / cols) | 0) + .5) * CELL, [X, Y, H] = align.map(cx, cy, z[i * MAXF + k]); let best = -1, bd = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const ai of grid.get(key(Math.floor(X / K) + dx, Math.floor(Y / K) + dy)) || []) { const a = nav.areas[ai], ex = Math.max(a[0] - X, 0, X - a[2]), ey = Math.max(a[1] - Y, 0, Y - a[3]), dz = Math.abs((a[4] + a[5]) / 2 - H), d = Math.hypot(ex, ey) + dz * .5; if (d < bd && dz < 160) { bd = d; best = ai; } }
      if (best >= 0 && bd < 200) place[i * MAXF + k] = nav.areas[best][7]; } }
  // A Counter-Strike 2 map with no CS:GO navigation data (Overpass): each floor takes the place of CS2's own place volume
  // it stands in (env_cs_place — the game's callouts; the smallest where they overlap), and each bomb target the letter
  // of the site volume round it.
  if (!align && bsp.cs2 && bsp.places?.length) { const P = bsp.places, K = 256, grid = new Map(), key = (a, b) => a + ',' + b, ids = new Map();
    for (const p of P) if (!ids.has(p.name)) { ids.set(p.name, G.places.length); G.places.push(p.name); }
    for (const [pi, p] of P.entries()) for (let gx = Math.floor(p.mins[0] / K); gx <= Math.floor(p.maxs[0] / K); gx++) for (let gy = Math.floor(p.mins[1] / K); gy <= Math.floor(p.maxs[1] / K); gy++) { const k = key(gx, gy); (grid.get(k) || grid.set(k, []).get(k)).push(pi); }
    const inside = (p, x, y, h) => x >= p.mins[0] && x <= p.maxs[0] && y >= p.mins[1] && y <= p.maxs[1] && h >= p.mins[2] && h <= p.maxs[2], vol = p => (p.maxs[0] - p.mins[0]) * (p.maxs[1] - p.mins[1]) * (p.maxs[2] - p.mins[2]);
    for (let i = 0; i < N; i++) { const cx = x0 + (i % cols + .5) * CELL, cy = y1 - (((i / cols) | 0) + .5) * CELL, L = grid.get(key(Math.floor(cx / K), Math.floor(cy / K))); if (!L) continue;
      for (let k = 0; k < n[i]; k++) { const h = z[i * MAXF + k] + 8; let best = -1, bv = Infinity; for (const pi of L) { const p = P[pi]; if (inside(p, cx, cy, h) && vol(p) < bv) { bv = vol(p); best = pi; } } if (best >= 0) place[i * MAXF + k] = ids.get(P[best].name); } }
    labels = siteBoxes.map((b, j) => { const [x, y, h] = boxC(b), p = P.find(p => /^Bombsite[AB]$/.test(p.name) && inside(p, x, y, h + 8)); return p ? p.name.slice(-1) : 'AB'[j]; }); }
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
  // (CS2 maps: the bullets' own boxes, each with what it is made of — arena-maps.js mapBoxes / bulletPath)
  const bsegs = bspans ? bspans.map(L => L.filter(([, hi]) => hi > zLow - 64).map(([lo, hi, m]) => [Math.max(lo, zLow - 64), hi, m, false])) : null;
  // Spawns carry their floor's height ([x, z, y]): these maps have floors above the spawns (balconies, bridges).
  const spawnY = p => { const i = cellOf(p[0], p[1]), k = i >= 0 ? floorNear(i, p[2]) : -1; return +(((k >= 0 ? z[i * MAXF + k] : p[2]) - zLow) * U).toFixed(2); };
  const spawns = { t: T10.map(p => [...toGameXZ(p[0], p[1]), spawnY(p)]), ct: CT10.map(p => [...toGameXZ(p[0], p[1]), spawnY(p)]) };
  const toGame = (x, y, h) => [(x - x0) * U - W / 2, (h - zLow) * U, (y1 - y) * U - D / 2];
  // Ladders (func_ladder): their volumes in game units relative to the map centre [minX, maxX, minZ, maxZ, y0, y1], for
  // climbing (arena-move.js).
  const ladders = []; for (const e of ents('func_ladder')) { const mi = modelOf(e); if (mi <= 0 || !bsp.models[mi]) continue; const b = bounds(bsp.models[mi], e.origin ? vec(e.origin) : [0, 0, 0]), a = toGame(b.mins[0], b.maxs[1], b.mins[2]), c = toGame(b.maxs[0], b.mins[1], b.maxs[2]);
    ladders.push([a[0], c[0], a[2], c[2], a[1], c[1]].map(v => +v.toFixed(2))); }
  // Movers (moverOf): each with its shut box, its open box(es) and how it moves — game units relative to the map
  // centre, boxes as [minX, maxX, minZ, maxZ, y0, y1]. Rotating doors turn about their origin (the hinge) by
  // `distance` degrees either way (they open away from whoever uses them); sliding doors move along `angle` (−1 up,
  // −2 down) by their own size less `lip`.
  const movers = [], boxOf = (lo, hi) => { const a = toGame(lo[0], hi[1], lo[2]), c = toGame(hi[0], lo[1], hi[2]); return [a[0], c[0], a[2], c[2], a[1], c[1]].map(v => +v.toFixed(3)); };
  bsp.entities.forEach((e, ei) => { const kind = moverOf(e, bsp.format === 'vbsp' && !bsp.cs2), mi = modelOf(e); if (!kind || mi <= 0 || !bsp.models[mi]) return; const off = e.origin ? vec(e.origin) : [0, 0, 0], b = bounds(bsp.models[mi], off), box = boxOf(b.mins, b.maxs), m = { e: ei, mi, kind, box };
    if (kind === 'rotdoor') { const h = toGame(off[0], off[1], off[2]), deg = +e.distance || 90; m.hinge = h.map(v => +v.toFixed(3)); m.angle = deg * Math.PI / 180; m.open = {};
      for (const sg of [1, -1]) { const t = sg * m.angle, c = Math.cos(t), sn = Math.sin(t), xs = [], zs = []; for (const x of [box[0], box[1]]) for (const z of [box[2], box[3]]) { const dx = x - h[0], dz = z - h[2]; xs.push(h[0] + dx * c + dz * sn); zs.push(h[2] - dx * sn + dz * c); }
        m.open[sg > 0 ? '+' : '-'] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), box[4], box[5]].map(v => +v.toFixed(3)); } }
    else if (kind === 'door') { const ang = +e.angle || 0, d = ang === -1 ? [0, 0, 1] : ang === -2 ? [0, 0, -1] : [Math.cos(ang * Math.PI / 180), Math.sin(ang * Math.PI / 180), 0], size = [0, 1, 2].map(k => b.maxs[k] - b.mins[k]);
      const len = Math.max(0, Math.abs(d[0]) * size[0] + Math.abs(d[1]) * size[1] + Math.abs(d[2]) * size[2] - (+e.lip || 0)), g = [d[0] * len * U, d[2] * len * U, -d[1] * len * U].map(v => +v.toFixed(3)); m.slide = g;
      m.open = { open: [box[0] + g[0], box[1] + g[0], box[2] + g[2], box[3] + g[2], box[4] + g[1], box[5] + g[1]] }; }
    else { m.glass = !+e.material; m.health = Math.max(1, +e.health || 1); }
    movers.push(m); });
  // Grenades fly through the map's real shapes, as in CS — not its player clips (the roofs and edges that stop only
  // players) nor the collision columns (a gap narrower than a column would be shut): a point test on the file. Counter-
  // Strike 1.6: the world and the solid brush entities by their visible hull; Source: its solid brushes and solid props.
  // The sky lets them through (a high lob comes back down). Map-relative game units in.
  const fromGame = (gx, gy, gz) => [x0 + (gx + W / 2) / U, y1 - (gz + D / 2) / U, zLow + gy / U], NS = bsp.source, NMASK = 0x1 | 0x2 | 0x8 | 0x4000;
  const contentsAt = (B, head, x, y, z) => { const { planes, nodes } = B; let n = head; while (n >= 0) { const q = nodes[n * 3] * 4; n = planes[q] * x + planes[q + 1] * y + planes[q + 2] * z - planes[q + 3] >= 0 ? nodes[n * 3 + 1] : nodes[n * 3 + 2]; } return B.leafContents[-(n + 1)]; };
  const nadeSolid = bsp.pointSolid ? (gx, gy, gz) => bsp.pointSolid(...fromGame(gx, gy, gz))   // (Counter-Strike 2: its own grenade collision, cs2-map.js)
    : NS ? (gx, gy, gz) => { const [x, y, z] = fromGame(gx, gy, gz); if (contentsAt(NS, NS.models[0].head, x, y, z) & NMASK) return true; const sp = bsp.extraSpans?.(x, y); if (sp) for (const s of sp) if (z >= s[0] && z <= s[1]) return true; return false; }
    : (gx, gy, gz) => { const [x, y, z] = fromGame(gx, gy, gz); for (const q of parts) { if (x < q.mins[0] || x > q.maxs[0] || y < q.mins[1] || y > q.maxs[1] || z < q.mins[2] || z > q.maxs[2]) continue; if (contentsAt(bsp, q.head, x - q.off[0], y - q.off[1], z - q.off[2]) === -2) return true; } return false; };
  for (const L of bsp.ladderBoxes || []) { const a = toGame(L.mins[0], L.maxs[1], L.mins[2]), c = toGame(L.maxs[0], L.mins[1], L.maxs[2]); ladders.push([a[0], c[0], a[2], c[2], a[1], c[1]].map(v => +v.toFixed(2))); }   // (Source: ladder brushes)
  const map = finishMap(id, G, T, { segs, above: new Float32Array(N).fill(NONE), zLow, spawns, extra: { bsp: bsp.cs2 ? null : { data: bsp, toGame }, cs2: !!bsp.cs2, hammer: bsp.cs2 ? { x0, y1, W, D, zLow, U } : null, aligned: align ? +align.err.toFixed(0) : null, fromFile: true, ladders, movers, nadeSolid } });
  // The segments only made the collision boxes: these maps are drawn from their own faces (bsp-mesh.js), never from
  // the columns, and a large map holds some 200 000 of them (60 MB).
  if (bsegs) map.bulletSolids = mergeSegs(cols, rows, bsegs, zLow);
  map.physProps = (bsp.props || []).map(p => { const a = toGame(p.mins[0], p.maxs[1], p.mins[2]), c = toGame(p.maxs[0], p.mins[1], p.maxs[2]); return { i: p.i, model: p.model, mass: p.mass, breaks: !!p.breaks, x: (a[0] + c[0]) / 2, z: (a[2] + c[2]) / 2, y: a[1], h: c[1] - a[1], rx: Math.abs(c[0] - a[0]) / 2, rz: Math.abs(c[2] - a[2]) / 2 }; });   // (physics props, game units: pushed about — arena-physprops.js)
  if (!bsp.cs2) map.columns.segs = null;   // (Counter-Strike 2 maps: drawn from their columns until their own meshes are converted)
  // The baked light on each floor and what it is made of (map-light.js), by spot in game units (x, z, feet):
  // lightAt — 1 ≈ a sunlit floor; surfaceAt — a footstep surface, or null where the map's faces don't say.
  const light = floorLight(bsp, G, { x0, y1 }), surface = floorSurface(bsp, G, { x0, y1 }), cw = CELL * U;
  const floorIndex = (x, zz, feet) => { const c = Math.floor((x + W / 2) / cw), r = Math.floor((zz + D / 2) / cw); if (c < 0 || r < 0 || c >= cols || r >= rows) return -1; const i = r * cols + c, h = feet / U + zLow;
    let best = -1, bd = Infinity; for (let k = 0; k < n[i]; k++) { const dz = h - z[i * MAXF + k]; if (dz > -STEP && Math.abs(dz) < bd) { bd = Math.abs(dz); best = k; } } return best >= 0 ? i * MAXF + best : -1; };
  map.lightAt = (x, zz, feet) => { if (!light) return 1; const j = floorIndex(x, zz, feet); return j >= 0 ? light[j] : 1; };
  map.surfaceAt = (x, zz, feet) => { if (!surface) return null; const j = floorIndex(x, zz, feet), v = j >= 0 ? surface[j] : UNKNOWN; return v === UNKNOWN ? null : SURFACES[v]; };
  return map;
}
// A brush model's bounds, moved by an entity origin.
function bounds(m, off) { return { mins: m.mins.map((v, j) => v + off[j]), maxs: m.maxs.map((v, j) => v + off[j]) }; }
// Least-squares 2D similarity src → dst (Umeyama), heights by the same scale plus a shift; err: mean distance (units).
function similarity(src, dst) { const n = src.length, ms = [0, 0], md = [0, 0]; for (let i = 0; i < n; i++) { ms[0] += src[i][0] / n; ms[1] += src[i][1] / n; md[0] += dst[i][0] / n; md[1] += dst[i][1] / n; }
  let a = 0, b = 0, ss = 0; for (let i = 0; i < n; i++) { const sx = src[i][0] - ms[0], sy = src[i][1] - ms[1], dx = dst[i][0] - md[0], dy = dst[i][1] - md[1]; a += sx * dx + sy * dy; b += sx * dy - sy * dx; ss += sx * sx + sy * sy; }
  const s = Math.hypot(a, b) / ss, th = Math.atan2(b, a), co = Math.cos(th) * s, si = Math.sin(th) * s; let dz = 0; for (let i = 0; i < n; i++) dz += (dst[i][2] - src[i][2] * s) / n;
  const map = (x, y, h) => [md[0] + co * (x - ms[0]) - si * (y - ms[1]), md[1] + si * (x - ms[0]) + co * (y - ms[1]), h * s + dz];
  let err = 0; for (let i = 0; i < n; i++) { const p = map(...src[i]); err += Math.hypot(p[0] - dst[i][0], p[1] - dst[i][1], p[2] - dst[i][2]) / n; } return { s, th, dz, map, err }; }   // (heights count: Nuke's sites are stacked)
// Thin walls — doors, planks, sandbags, fences: thinner than the rays' spacing, they fell between the four rays (or
// met only one) and could be walked through (Dust II's long doors, Nuke's roll doors). Every upright face of the solid
// parts is laid over the columns: where it is thin (solid just behind, open 10 units behind), its column is solid at
// that height. Thicker walls always meet a ray (they are 8 units apart); this only adds what the rays missed.
function thinWalls(bsp, parts, spans, { x0, y1, cols, rows, zA, zB, src }) {
  const F = src ? bsp.source : bsp; if (!F?.faces?.length) return; const P = F.planes, V = F.vertices, add = new Map();
  const solid = (p, x, y, z) => src ? bsp.solidSpans(p.head, x - p.off[0], y - p.off[1], z - p.off[2] - .5, z - p.off[2] + .5).length > 0 : solidAt(bsp, p.head, x - p.off[0], y - p.off[1], z - p.off[2]);
  for (const p of parts) { const m = F.models[p.mi]; if (!m) continue;
    for (let fi = m.firstFace; fi < m.firstFace + m.numFaces; fi++) { const f = F.faces[fi]; if (src && f.disp >= 0) continue;
      const pl = f.plane * 4, sg = f.side ? -1 : 1, nx = P[pl] * sg, ny = P[pl + 1] * sg, nz = P[pl + 2] * sg; if (Math.abs(nz) > .3) continue;
      const W = []; for (let i = 0; i < f.numEdges; i++) { const se = F.surfedges[f.firstEdge + i], e = Math.abs(se), v = F.edges[e * 2 + (se < 0 ? 1 : 0)]; W.push([V[v * 3] + p.off[0], V[v * 3 + 1] + p.off[1], V[v * 3 + 2] + p.off[2]]); }
      if (W.length < 3) continue; const hl = Math.hypot(nx, ny) || 1, hx = -ny / hl, hy = nx / hl;   // along the wall (horizontal), and up
      let s0 = Infinity, s1 = -Infinity, z0 = Infinity, z1 = -Infinity; const ox = W[0][0], oy = W[0][1]; const S = W.map(v => { const sv = (v[0] - ox) * hx + (v[1] - oy) * hy; s0 = Math.min(s0, sv); s1 = Math.max(s1, sv); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]); return [sv, v[2]]; });
      if (z1 < zA || z0 > zB || (s1 - s0) * (z1 - z0) < 32) continue;
      { let thin = false; for (let a = 1; a < 4 && !thin; a++) for (let b = 1; b < 4 && !thin; b++) { const sv = s0 + (s1 - s0) * a / 4, zz = z0 + (z1 - z0) * b / 4; if (inside2(S, sv, zz) && !solid(p, ox + hx * sv - nx * 10, oy + hy * sv - ny * 10, zz)) thin = true; }
        if (!thin && (s1 - s0) > 24) continue; }   // thick all over (a 3 × 3 look): the rays have it
      for (let sv = s0 + 2; sv < s1; sv += 8) for (let zz = z0 + 2; zz < z1; zz += 8) { if (!inside2(S, sv, zz)) continue;   // (twice a column across: every column it crosses)
        const x = ox + hx * sv - nx * 1.5, y = oy + hy * sv - ny * 1.5; if (!solid(p, x, y, zz) || solid(p, ox + hx * sv - nx * 10, oy + hy * sv - ny * 10, zz)) continue;   // solid just behind the face, open 10 behind: a thin wall (the rays, 8 apart, never miss a thicker one)
        const c = Math.floor((x - x0) / CELL), r = Math.floor((y1 - y) / CELL); if (c < 0 || r < 0 || c >= cols || r >= rows) continue; const i = r * cols + c;
        let L = add.get(i); if (!L) add.set(i, L = []); L.push([Math.max(z0, zz - 4), Math.min(z1, zz + 4)]); } } }
  for (const [i, L] of add) { const all = spans[i].concat(L).sort((a, b) => a[0] - b[0]), out = [];
    for (const [b, t] of all) { const last = out[out.length - 1]; if (last && b - last[1] < 4) last[1] = Math.max(last[1], t); else out.push([Math.floor(b / Q) * Q, Math.round(t / Q) * Q]); }
    spans[i] = out; }
}
function inside2(W, x, y) { let c = false; for (let i = 0, j = W.length - 1; i < W.length; j = i++) { const a = W[i], b = W[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
// Counter-Strike 1.6's invisible player clips (the map's edges, roofs, smoothing round props: drawn hull 0 doesn't
// have them; they were walked through). Hull 1 is the world grown by the player's box (16 units round, 36 up and
// down); shrunk back, a column is a clip where hull 1 is solid at its centre and its four neighbours' (16 out), from
// 36 above the hull's bottom to 36 below its top.
function playerClips(bsp, spans, { x0, y1, cols, rows, zA, zB }) {
  const head = bsp.models[0].hulls?.[1]; if (!bsp.clipnodes?.length || head == null) return;
  const cut = (A, B) => { const out = []; let i = 0, j = 0; while (i < A.length && j < B.length) { const lo = Math.max(A[i][0], B[j][0]), hi = Math.min(A[i][1], B[j][1]); if (hi > lo) out.push([lo, hi]); if (A[i][1] < B[j][1]) i++; else j++; } return out; };
  const H = new Array(cols * rows), FULL = [[zA - 40, zB + 40]];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c, S0 = spans[i]; H[i] = S0.length === 1 && S0[0][0] <= zA + 2 && S0[0][1] >= zB - 2 ? FULL : hullSpans(bsp, head, x0 + (c + .5) * CELL, y1 - (r + .5) * CELL, zA - 40, zB + 40); }   // once per column (solid top to bottom: outside the map, no walk)
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) { let S = H[r * cols + c]; if (!S.length || S === FULL) continue;
    for (const j of [r * cols + c + 1, r * cols + c - 1, (r + 1) * cols + c, (r - 1) * cols + c]) { S = cut(S, H[j]); if (!S.length) break; }   // the four neighbours (16 out)
    const add = []; for (const [b, t] of S) { const lo = b + 36, hi = t - 36; if (hi - lo >= 2 && hi > zA && lo < zB) add.push([Math.floor(lo / Q) * Q, Math.round(hi / Q) * Q]); }
    if (!add.length) continue; const i = r * cols + c, all = spans[i].concat(add).sort((a, b) => a[0] - b[0]), out = [];
    for (const [b, t] of all) { const last = out[out.length - 1]; if (last && b - last[1] < 4) last[1] = Math.max(last[1], t); else out.push([b, t]); }
    spans[i] = out; }
}
