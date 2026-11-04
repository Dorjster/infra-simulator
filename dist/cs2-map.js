// Counter-Strike 2 maps converted on this computer (tools/maps/import-cs2-map.mjs: user-maps/<id>.bsp starting "CS2M")
// → the shape bsp-map.js builds maps from: a world model with its bounds, the entities (spawns, buy zones, bomb sites,
// places) with their boxes as brush models, and the collision as solid stretches along vertical lines — CS2's physics
// sampled every 8 units, at the very points the builder's rays fall on. Grenades get their own (CS2's grenade clips
// in, its player clips out). Pure: the room host, the clients and the tests share it.
import { windowPanes } from './nade-mesh.js';   // (v53 LINEUPS: CS2's window panes — below)
import PANE_RECTS from './cs-maps/cs2-pane-rects.js'; import EXTRA_PANES from './cs-maps/cs2-extra-panes.js'; import PANE_CLIPS from './cs-maps/cs2-pane-clips.js';
export const isCs2Map = buf => { const u = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, 4); return u[0] === 67 && u[1] === 83 && u[2] === 50 && u[3] === 77; };   // "CS2M"
export function parseCs2Map(buf) {
  const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), dv = new DataView(ab), hl = dv.getUint32(8, true);
  const H = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 12, hl))), G = H.grid, n = G.cols * G.rows + 1; let o = 12 + hl + (4 - hl % 4) % 4;
  const grid = () => { const offs = new Uint32Array(ab, o, n); o += n * 4; const nv = offs[n - 1], vals = new Int16Array(ab, o, nv); o += nv * 2 + (4 - (nv * 2) % 4) % 4; return { offs, vals }; };
  const P = grid(), N = grid(), SURF = H.sizes?.surfaces ? new Uint8Array(ab, o, H.sizes.surfaces) : null;   // (what each player stretch's top is made of: CS2's surface property, header.surfaces)
  if (SURF) o += SURF.length + (4 - SURF.length % 4) % 4;
  // The bullets' layer (newer files): what bullets hit — no player clips or bullet-passing fences — and what each stretch
  // is made of (header.pens: wood, metal, plaster… — wallbangs). Older files: the players' layer stands in.
  const B = H.sizes?.bullets ? grid() : null, PEN = B ? new Uint8Array(ab, o, H.sizes.bullets[2]) : null, PENS = H.pens || [];
  if (PEN) o += PEN.length + (4 - PEN.length % 4) % 4;
  // The grenades' triangles (newer files: header.nadeMesh — tools/maps/nade-mesh.mjs, dist/nade-mesh.js): Uint16 corners
  // across the mesh's bounds, then the search tree's boxes and links.
  const NM = H.nadeMesh, p4 = n => n + (4 - n % 4) % 4; let nadeMesh = null;
  if (NM && NM.tris > 0) { const tri = new Uint16Array(ab, o, NM.tris * 9); o += p4(NM.tris * 18); const box = new Uint16Array(ab, o, NM.nodes * 6); o += p4(NM.nodes * 12); const links = new Uint32Array(ab, o, NM.nodes * 2); o += NM.nodes * 8; const sight = NM.sight ? new Uint8Array(ab, o, NM.tris) : null; if (sight) o += p4(NM.tris); nadeMesh = { o: NM.o, s: NM.s, tri, box, links, sight }; }   // (sight: a byte a triangle, 1 = it stops sight too)
  const at = (g, x, y) => { const c = Math.round((x - G.x0) / G.step), r = Math.round((y - G.y0) / G.step); return c < 0 || r < 0 || c >= G.cols || r >= G.rows ? -1 : r * G.cols + c; };
  // Glass floors (files made before the importer knew them): the importer's "floors over nothing" fill took a player
  // clip lying under a flat window (Nuke's B site: a clip slab under its floor windows) for a floor nobody sees — the
  // look's glass doesn't count as drawn — and filled it solid up to the next floor (B's ceiling): pillars over a third
  // of B. Those lines are rebuilt (glassFloorFix): P.fix holds their stretches (half units, as the file's).
  P.fix = glassFloorFix(H, G, P, B, at);
  // Ladders whose wall the importer cut away behind them (Nuke's Lobby ladder, the v52 report "we can't go up that
  // ladder": its rung clearing took the 12-unit wall at its back for a ladder standing free, and left a slot through to
  // the next room — at the mezzanine the climber went into it, at the top fell down it and stayed). Rebuilt (ladderBackFix).
  P.fix = ladderBackFix(H, G, P, at, P.fix);
  // Solid stretches [bottom, top] (Hammer units) on the line through (x, y), clipped to [z0, z1].
  const spans = (g, x, y, z0, z1) => { const i = at(g, x, y), out = []; if (i < 0) return out; const f = g.fix?.get(i);
    if (f) { for (let k = 0; k < f.length; k += 2) { const b = f[k] / 2, t = f[k + 1] / 2; if (t > z0 && b < z1) out.push([Math.max(b, z0), Math.min(t, z1)]); } return out; }
    for (let k = g.offs[i]; k < g.offs[i + 1]; k += 2) { const b = g.vals[k] / 2, t = g.vals[k + 1] / 2; if (t > z0 && b < z1) out.push([Math.max(b, z0), Math.min(t, z1)]); } return out; };
  // What the floor at (x, y) about height z is made of (CS2's surface name), or null.
  const surfaceAt = (x, y, z) => { if (!SURF) return null; const i = at(P, x, y); if (i < 0) return null; let best = -1, bd = 6; for (let k = P.offs[i]; k < P.offs[i + 1]; k += 2) { const d = Math.abs(P.vals[k + 1] / 2 - z); if (d < bd) { bd = d; best = SURF[k >> 1]; } } return best >= 0 && best < 255 ? H.surfaces[best] : null; };
  const pointIn = (g, x, y, z) => { const i = at(g, x, y); if (i < 0) return false; for (let k = g.offs[i]; k < g.offs[i + 1]; k += 2) if (z >= g.vals[k] / 2 && z <= g.vals[k + 1] / 2) return true; return false; };
  // Glass the importer left unbreakable (cs-maps/cs2-extra-panes.js: Nuke's B floor panels it took for world, its
  // Observation windows with no glass collision): breakable panes, added after the file's own entities (their ids — the
  // movers' order — the same on every computer; the file's own keep theirs). A file that already has a pane there keeps it.
  for (const r of EXTRA_PANES[H.id] || []) { const lo = r.slice(0, 3), hi = r.slice(3, 6);
    if (H.entities.some(e => { if (!e.pane || !e.model) return false; const m = H.models[+e.model.slice(1)]; return m && [0, 1, 2].every(k => m.mins[k] < hi[k] + 1 && m.maxs[k] > lo[k] - 1); })) continue;
    H.entities.push({ classname: 'func_breakable', model: '*' + H.models.length, origin: '0 0 0', material: '0', health: '1', spawnflags: '0', look: 'bounds', pane: 1, added: 1 }); H.models.push({ mins: lo, maxs: hi }); }
  // v53 LINEUPS — CS2's window panes (the "window" collision layer: solid to grenades, breakable; nade-mesh.js
  // windowPanes finds them in the grenade triangles by shape — Nuke 8, Anubis 15): each becomes a breakable glass pane
  // like those above, its triangles out of the grenades' copy (the file's bytes untouched) — a grenade or a bullet breaks
  // it for everyone (the host's word) and a grenade flies on through unslowed (arena-nades.js: hitMover.win — CS2's own
  // lineups through these windows pop where an unslowed grenade does); whole again next round. (Before v53 LINEUPS'
  // final pass the panes were only taken out of the grenades' triangles: glass grenades flew through unbroken.)
  if (nadeMesh) { const wp = windowPanes(nadeMesh); if (wp) { nadeMesh = { ...nadeMesh, tri: wp.tri };
    for (const r of wp.boxes) { const lo = r.slice(0, 3), hi = r.slice(3, 6);
      const had = H.entities.find(e => { if (!e.pane || !e.model || e.window === 2) return false; const m = H.models[+e.model.slice(1)]; return m && [0, 1, 2].every(k => m.mins[k] < hi[k] + 1 && m.maxs[k] > lo[k] - 1); });
      if (had) { had.window = 1; continue; }   // (a pane the file already has there: it is that window — marked so)
      H.entities.push({ classname: 'func_breakable', model: '*' + H.models.length, origin: '0 0 0', material: '0', health: '1', spawnflags: '0', look: 'bounds', pane: 1, added: 1, window: 2 }); H.models.push({ mins: lo, maxs: hi }); } } }   // (window 2: added here — its neighbours, 2 units over it, get their own)
  // Windows CS2 keeps players out of with the glass gone (cs-maps/cs2-pane-clips.js: the v52 report "Nuke's B glasses:
  // when they break we can go through the window"): their pane gets `clip` — bsp-map.js / arena-maps.js mapBoxes keep a
  // box there for players only, broken or not (bullets, sight and grenades go by their own layers and pass a broken pane).
  for (const r of PANE_CLIPS[H.id] || []) for (const e of H.entities) { if (!e.pane || !e.model) continue; const m = H.models[+e.model.slice(1)];
    if (m && [0, 1, 2].every(k => Math.abs(m.mins[k] - r[k]) <= 1 && Math.abs(m.maxs[k] - r[k + 3]) <= 1)) e.clip = 1; }
  const DOOR_QUARTER = /ch2_door_001\.vmdl$/;
  const models = H.models.map((m, i) => ({ mins: m.mins, maxs: m.maxs, head: i ? -1 : 0, hulls: [], ...(m.rects ? { rects: m.rects } : {}) }));
  // A pane whose one box is far bigger than its glass (cs-maps/cs2-pane-rects.js: Cache's Long A doorway): its glass's
  // own boxes for its collision (bsp-map.js mover rects) — a standing body walks through the doorway it spanned.
  const near = (a, b) => a.every((v, k) => Math.abs(v - b[k]) <= 1);
  for (const [box, rects] of PANE_RECTS[H.id] || []) for (const e of H.entities) { if (!e.pane || !e.model) continue; const m = models[+e.model.slice(1)];
    if (m && !m.rects && near(m.mins, box.slice(0, 3)) && near(m.maxs, box.slice(3, 6))) m.rects = rects.map(r => ({ mins: r.slice(0, 3), maxs: r.slice(3, 6) })); }
  // Doors whose collision the importer took from their look's bounds the way Nuke's door models lie (no physics model of
  // their own): Cache's ch2_door_001 runs along x where that read it along y — its collision stood turned a quarter
  // about the hinge, the drawn doorway open to walk through while shut and a plate swinging beside it. Turned back.
  for (const e of H.entities) { if (e.classname !== 'func_door_rotating' || !DOOR_QUARTER.test(e.cs2 || '') || !e.model) continue; const m = models[+e.model.slice(1)]; if (!m || m.turned) continue;
    const [x0, y0, z0] = m.mins, [x1, y1, z1] = m.maxs; if (y1 - y0 <= x1 - x0) continue;   /* (already along x: a newer file) */ m.mins = [y0, -x1, z0]; m.maxs = [y1, -x0, z1]; m.turned = true; }
  // Spawns under the names the builder knows them by (as in Counter-Strike 1.6 / Source: Terrorists at
  // info_player_deathmatch, Counter-Terrorists at info_player_start).
  const SPAWN = { info_player_terrorist: 'info_player_deathmatch', info_player_counterterrorist: 'info_player_start' }; H.entities = H.entities.map(e => SPAWN[e.classname] ? { ...e, classname: SPAWN[e.classname] } : e);
  return { format: 'vbsp', cs2: true, source: null, id: H.id, origin: H.source, models, entities: H.entities, ladderBoxes: H.ladderBoxes || [],   // (ladders: CS2's ladder surfaces as climbing volumes, import-cs2-map.mjs)
    solidSpans: (head, x, y, z0, z1) => spans(P, x, y, z0, z1),   // (the builder's world part: head 0)
    bulletSpans: B ? (x, y, z0, z1) => { const i = at(B, x, y), out = []; if (i < 0) return out; for (let k = B.offs[i]; k < B.offs[i + 1]; k += 2) { const b = B.vals[k] / 2, t = B.vals[k + 1] / 2; if (t > z0 && b < z1) out.push([Math.max(b, z0), Math.min(t, z1), PENS[PEN[k >> 1]] || 'concrete']); } return out; } : null,
    props: H.props || [],                                          // physics props (pots, cans, stools): pushed about, never in the way
    modeOff: H.modeOff || null,                                    // another mode's walls and props the look still draws (v52 files; bsp-map.js modeOffOf)
    pointSolid: (x, y, z) => pointIn(N, x, y, z),                  // grenades (older files; newer: nadeMesh)
    nadeMesh,                                                      // grenades: CS2's surfaces as triangles (dist/nade-mesh.js)
    surfaceAt,                                                     // footsteps (map-light.js floorSurface)
    places: H.entities.filter(e => e.classname === 'env_cs_place' && e.place_name).map(e => ({ name: e.place_name, ...H.models[+e.model.slice(1)] })) };
}

// The lines a glass floor's fill made solid, rebuilt: Map(line → [bottom, top, …] in half units), or null. Signature: a
// flat window (a breakable pane, thinner than it is wide, header entities' `pane`) and, on a line in it (or 2 round it), a players'
// stretch that starts at the window (within a unit) and rises a body's height or more (54) with nothing there in the
// bullets' layer just over the window (a real wall stops bullets; the fill doesn't). The stretch goes; what stood in its
// height range comes back from the bullets' layer (floors, walkways, ceilings) and, for player clips (rails, which
// bullets pass), from the nearest untouched lines on both sides along x or y (within 64 units) where both have them
// and they don't rise from the window itself (the fill beside the window's lines).
// Needs the bullets' layer (newer files); older files are left as they are.
function glassFloorFix(H, G, P, B, at) {
  if (!B) return null; const S = G.step, bad = new Map();   // line → [x, y, its stretches, the filled ones' indices]
  const runs = (g, i) => { const o = []; if (i < 0) return o; for (let k = g.offs[i]; k < g.offs[i + 1]; k += 2) o.push(g.vals[k], g.vals[k + 1]); return o; };
  const covered = (L, lo, hi) => { for (let k = 0; k < L.length; k += 2) if (L[k] < hi && L[k + 1] > lo) return true; return false; };
  for (const e of H.entities) { if (!e.pane || !e.model) continue; const m = H.models[+e.model.slice(1)]; if (!m) continue; const [x0, y0, z0] = m.mins, [x1, y1, z1] = m.maxs;
    if (z1 - z0 > 2 || x1 - x0 < 12 || y1 - y0 < 12) continue;   // (flat: a floor window)
    const zt = Math.round(z1 * 2);
    // (on its lines and 2 round it, as the importer cut it: the frame's gaps between windows)
    for (let x = G.x0 + Math.ceil((x0 - 2 - G.x0) / S) * S; x <= x1 + 2; x += S) for (let y = G.y0 + Math.ceil((y0 - 2 - G.y0) / S) * S; y <= y1 + 2; y += S) { const i = at(P, x, y); if (i < 0) continue;
      const L = runs(P, i); for (let k = 0; k < L.length; k += 2) if (Math.abs(L[k] - zt) <= 2 && L[k + 1] - L[k] >= 108 && !covered(runs(B, i), zt + 2, zt + 108)) { const q = bad.get(i); if (!q) bad.set(i, [x, y, L, [k]]); else if (!q[3].includes(k)) q[3].push(k); } } }
  if (!bad.size) return null; const fix = new Map();
  for (const [i, [x, y, L, ks]] of bad) { const add = [], v = runs(B, i);
    const side = (dx, dy, sg) => { for (let d = 1; d <= 64 / S; d++) { const j = at(P, x + sg * dx * d, y + sg * dy * d); if (j < 0) return null; if (!bad.has(j)) return runs(P, j); } return null; };
    for (const k of ks) { const lo = L[k] + 2, hi = L[k + 1];
      for (let q = 0; q < v.length; q += 2) if (v[q + 1] > lo && v[q] < hi) add.push(Math.max(v[q], lo), Math.min(v[q + 1], hi));
      for (const [dx, dy] of [[S, 0], [0, S]]) { const a = side(dx, dy, 1), b = side(dx, dy, -1); if (!a || !b) continue;
        for (let p = 0; p < a.length; p += 2) for (let q = 0; q < b.length; q += 2) { const s0 = Math.max(a[p], b[q], lo), s1 = Math.min(a[p + 1], b[q + 1], hi); if (s1 > s0 && s0 > lo + 4) add.push(s0, s1); } } }   // (never one rising from the window itself: the same fill beside it)
    const all = []; for (let q = 0; q < L.length; q += 2) if (!ks.includes(q)) all.push([L[q], L[q + 1]]); for (let q = 0; q < add.length; q += 2) all.push([add[q], add[q + 1]]);
    all.sort((p, q) => p[0] - q[0]); const out = []; for (const [b0, t0] of all) { const n = out.length; if (n && b0 <= out[n - 1]) { if (t0 > out[n - 1]) out[n - 1] = t0; } else out.push(b0, t0); }
    fix.set(i, out); }
  return fix;
}

// The wall behind a ladder, where the importer's rung clearing (tools/maps/import-cs2-map.mjs ladderClears) cut it away:
// a ladder with a wall right beside both its ends on one side only (the lines just past its width, 12 and 20 units out
// from its face, solid over 80% of its height) — that side is its back, the other the climbing side — whose lines in
// between, 6 to 26 units behind its face, miss what both those neighbours share: those lines get it back (within 24 units
// of the ladder's foot and top). A ladder in a hatch or standing free (no wall on either side, or on both) keeps its lines.
// Returns the line fixes (Map, half units, as glassFloorFix's) with these added.
function ladderBackFix(H, G, P, at, fix) {
  const S = G.step, g0 = [G.x0, G.y0];
  const runs = i => { if (i < 0) return null; const f = fix?.get(i); if (f) return f; const o = []; for (let k = P.offs[i]; k < P.offs[i + 1]; k += 2) o.push(P.vals[k], P.vals[k + 1]); return o; };
  const cover = (R, lo, hi) => { let c = 0; if (R) for (let k = 0; k < R.length; k += 2) c += Math.max(0, Math.min(R[k + 1], hi) - Math.max(R[k], lo)); return c; };
  for (const L of H.ladderBoxes || []) {
    const a = L.maxs[0] - L.mins[0] < L.maxs[1] - L.mins[1] ? 0 : 1, b = 1 - a, p0 = (L.mins[a] + L.maxs[a]) / 2, z0 = L.mins[2] * 2, z1 = L.maxs[2] * 2;
    const line = (av, bv) => a === 0 ? at(P, av, bv) : at(P, bv, av), ln = v => g0[a] + Math.round((v - g0[a]) / S) * S;
    const bA = g0[b] + Math.ceil((L.mins[b] - 2 - g0[b]) / S) * S, bB = g0[b] + Math.floor((L.maxs[b] + 2 - g0[b]) / S) * S, ends = [bA - S, bB + S];
    const wall = sg => [12, 20].every(d => ends.every(bv => cover(runs(line(ln(p0 + sg * d), bv)), z0, z1) >= .8 * (z1 - z0)));
    const wp = wall(1), wn = wall(-1), sg = wp === wn ? 0 : wp ? 1 : -1;
    // Where another piece of the same ladder goes on from its top (CS2's ladder surfaces come in pieces: Nuke's Lobby
    // ladder is two, joined at its mezzanine), the clearing left a sliver between its two cuts (a unit thick, at the join):
    // a climber coming down stood on it, short of the lower piece. On the ladder's own lines and its climbing side's (up
    // to 26 units out), stretches no thicker than 4 units within 6 of the join go.
    if (H.ladderBoxes.some(B => B !== L && B.mins[0] < L.maxs[0] && B.maxs[0] > L.mins[0] && B.mins[1] < L.maxs[1] && B.maxs[1] > L.mins[1] && Math.abs(B.mins[2] - L.maxs[2]) < 2))
      for (let av = ln(p0 - 26); av <= p0 + 26; av += S) { if (sg && sg * (av - p0) >= 6) continue;
        for (let bv = bA; bv <= bB; bv += S) { const i = line(av, bv), R = runs(i); if (!R) continue; const out = [];
          for (let k = 0; k < R.length; k += 2) if (!(R[k + 1] - R[k] <= 8 && Math.abs(R[k] - z1) <= 12)) out.push(R[k], R[k + 1]);
          if (out.length !== R.length) (fix ??= new Map()).set(i, out); } }
    if (!sg) continue;
    for (let av = ln(p0 + sg * 6); sg * (av - p0) <= 26; av += sg * S) { if (sg * (av - p0) < 6) continue;
      const n1 = runs(line(av, ends[0])), n2 = runs(line(av, ends[1])); if (!n1 || !n2) continue; const both = [];
      for (let p = 0; p < n1.length; p += 2) for (let q = 0; q < n2.length; q += 2) { const lo = Math.max(n1[p], n2[q], z0 - 48), hi = Math.min(n1[p + 1], n2[q + 1], z1 + 48); if (hi - lo >= 16) both.push(lo, hi); }
      if (!both.length) continue;
      for (let bv = bA; bv <= bB; bv += S) { const i = line(av, bv), R = runs(i); if (!R) continue; const all = [];
        for (let k = 0; k < R.length; k += 2) all.push([R[k], R[k + 1]]); for (let k = 0; k < both.length; k += 2) all.push([both[k], both[k + 1]]);
        all.sort((p, q) => p[0] - q[0]); const out = []; for (const [b0, t0] of all) { const n = out.length; if (n && b0 <= out[n - 1]) { if (t0 > out[n - 1]) out[n - 1] = t0; } else out.push(b0, t0); }
        if (out.length !== R.length || out.some((v, k) => v !== R[k])) (fix ??= new Map()).set(i, out); } } }
  return fix;
}
