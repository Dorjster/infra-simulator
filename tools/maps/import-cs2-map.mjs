// A Counter-Strike 2 map (its own files, exported on this computer from the game's .vpk with Source 2 Viewer — see
// tools/fp-anim/README.md for the download) → user-maps/<id>.bsp in the game's own "CS2M" format: the collision of
// CS2's physics mesh as solid stretches on an 8-unit grid (players: everything but grenade clips; grenades: everything
// but player clips), the spawns, buy zones and bomb sites, and CS2's place names. The game's map builder (bsp-map.js)
// makes floors, walls, ceilings, navigation and routes from it as from any map file. Valve's: it stays on this
// computer (user-maps is git-ignored) and is never shipped.
//   node tools/maps/import-cs2-map.mjs <id> <export dir> [out dir]   (export dir: world_physics_physics.glb, ents.txt, ent_bounds.json;
//   out dir: user-maps by default)
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
import { meshSolids } from '../../dist/mesh-solids.js';
import { surfaceOf, SURFACES } from '../../dist/map-light.js';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), [id, dir, outDir = path.join(repo, 'user-maps')] = process.argv.slice(2);
if (!id || !dir) { console.log('usage: node tools/maps/import-cs2-map.mjs <id> <export dir> [out dir]'); process.exit(1); }
// GLB → { meshes: [{ name, pos: Float32Array (Hammer x y z), idx: Uint32Array }] }
function readGlb(file) {
  const b = readFileSync(file), n = b.readUInt32LE(12), g = JSON.parse(b.subarray(20, 20 + n).toString()), bin = b.subarray(20 + n + 8);
  const acc = i => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], k = { SCALAR: 1, VEC3: 3 }[a.type], o = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || 0;
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType], size = T.BYTES_PER_ELEMENT, out = new T(a.count * k);
    for (let j = 0; j < a.count; j++) for (let c = 0; c < k; c++) out[j * k + c] = bin[`read${T === Float32Array ? 'FloatLE' : T === Uint32Array ? 'UInt32LE' : 'UInt16LE'}`](o + j * (stride || size * k) + c * size); return out; };
  return g.meshes.map(m => { const P = [], I = []; let base = 0; for (const p of m.primitives) { const pos = acc(p.attributes.POSITION), idx = p.indices != null ? acc(p.indices) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i); P.push(pos); I.push(Uint32Array.from(idx, x => x + base)); base += pos.length / 3; }
    const pos = new Float32Array(P.reduce((s, a) => s + a.length, 0)), idx = new Uint32Array(I.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of P) { pos.set(a, o); o += a.length; } o = 0; for (const a of I) { idx.set(a, o); o += a.length; }
    return { name: m.name || '', pos, idx }; });
}
// What each triangle is made of: CS2 groups its collision by surface property (physics_group_concrete, _sand, _metal,
// _wood_crate…): the name, listed once (SURF) — the footstep surface of the floors (bsp-map.js, map-light.js).
const SURF = [], surfOf = name => { const k = String(name || '').replace(/^physics_group_/, '').toLowerCase() || 'default'; let i = SURF.indexOf(k); if (i < 0) { i = SURF.length; SURF.push(k); } return Math.min(254, i); };
const join = list => { const n = list.reduce((s, m) => s + m.pos.length, 0), pos = new Float32Array(n), idx = new Uint32Array(list.reduce((s, m) => s + m.idx.length, 0)), grp = new Uint8Array(idx.length / 3); let po = 0, io = 0;
  for (const m of list) { pos.set(m.pos, po); for (let k = 0; k < m.idx.length; k++) idx[io + k] = m.idx[k] + po / 3; grp.fill(surfOf(m.name), io / 3, (io + m.idx.length) / 3); po += m.pos.length; io += m.idx.length; } return { pos, idx, grp }; };
// Entities: Source 2 Viewer's text dump (blocks of "key value").
function readEnts(file) { return readFileSync(file, 'utf8').split(/\n====\d+====\n/).map(b => { const kv = {}; for (const line of b.split('\n')) { const m = /^(\S+)\s+(.*)$/.exec(line.trim()); if (m && !(m[1] in kv)) kv[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1'); } return kv; }).filter(e => e.classname); }
const vec3 = s => (String(s || '').match(/-?[\d.]+(e-?\d+)?/g) || []).slice(0, 3).map(Number);
const meshes = readGlb(path.join(dir, 'world_physics_physics.glb')), ents = readEnts(path.join(dir, 'ents.txt')), bounds = JSON.parse(readFileSync(path.join(dir, 'ent_bounds.json'), 'utf8'));
// The map's own entities (export_ents.py → entities.json): solid props and brush walls join the collision; doors and
// breakables become the game's movers (bsp-map.js: a door opens with E, a grate or a pane breaks); placed as Source does
// (angles: pitch, yaw, roll; then the origin).
const angleMatrix = ([p, y, r]) => { const [sp, cp, sy, cy, sr, cr] = [p, p, y, y, r, r].map((a, i) => (i % 2 ? Math.cos : Math.sin)(a * Math.PI / 180));
  return [cp * cy, sp * sr * cy - cr * sy, sp * cr * cy + sr * sy, cp * sy, sp * sr * sy + cr * cy, sp * cr * sy - sr * cy, -sp, sr * cp, cr * cp]; };
function placed(list, e) { const M = angleMatrix(e.angles), [ox, oy, oz] = e.origin, [kx, ky, kz] = e.scale || [1, 1, 1];
  return list.map(m => { const pos = new Float32Array(m.pos.length); for (let i = 0; i < pos.length; i += 3) { const x = m.pos[i] * kx, y = m.pos[i + 1] * ky, z = m.pos[i + 2] * kz;
    pos[i] = M[0] * x + M[1] * y + M[2] * z + ox; pos[i + 1] = M[3] * x + M[4] * y + M[5] * z + oy; pos[i + 2] = M[6] * x + M[7] * y + M[8] * z + oz; } return { name: m.name, pos, idx: m.idx }; }); }
const entList = existsSync(path.join(dir, 'entities.json')) ? JSON.parse(readFileSync(path.join(dir, 'entities.json'), 'utf8')) : [];
const solidEnts = entList.filter(e => e.kind === 'solid' && e.physics).flatMap(e => placed(readGlb(e.physics), e));
// Ladders: CS2 marks them in the collision ('ladder'): not solid — a climbing volume round each (below).
const isLadder = m => /ladder/.test(m.name), isSky = m => /physics_sky/.test(m.name);
// Players: everything but grenade clips and ladders; grenades: everything but player clips, ladders and the sky (a high
// lob comes back down) — fences and grates stop them too (they only let bullets through).
const players = join([...meshes.filter(m => !/grenadeclip/.test(m.name) && !isLadder(m)), ...solidEnts.filter(m => !/grenadeclip/.test(m.name))]);
const nades = join([...meshes.filter(m => !/playerclip/.test(m.name) && !isLadder(m) && !isSky(m)), ...solidEnts.filter(m => !/playerclip/.test(m.name))]);
console.log('physics:', meshes.map(m => `${m.name} ${m.idx.length / 3}`).join(' · '));
// Brush-like entities (models '*N' with their bounds, as a map file's): buy zones, bomb sites, places.
const models = [null], out = [];
for (const e of ents) { const c = e.classname, res = /resource_name:"?([^"]+?)"?$/.exec(e.model || '')?.[1], key = res && path.basename(res).replace(/\.vmdl$/, ''), o = vec3(e.origin);
  if (/^info_player_(terrorist|counterterrorist)$/.test(c)) { const a = vec3(e.angles); out.push({ classname: c, origin: o.join(' '), angles: (a.length ? a : [0, 0, 0]).join(' ') }); continue; }
  if (/^(func_buyzone|func_bomb_target|env_cs_place)$/.test(c) && key && bounds[key]) { const [lo, hi] = bounds[key]; models.push({ mins: lo.map((v, i) => v + (o[i] || 0)), maxs: hi.map((v, i) => v + (o[i] || 0)) });
    out.push({ classname: c, model: '*' + (models.length - 1), origin: '0 0 0', TeamNum: e.TeamNum || e.teamnum || '', place_name: e.place_name || '' }); } }
// Doors (prop_door_rotating: the hinge is its origin; it swings `distance`°) and breakables (grates, panes): their box
// from their own collision, as brush models; movers.json says which entity each is and its look (convert_world.py).
const lookBox = file => { if (!file) return []; const b = readFileSync(file), n = b.readUInt32LE(12), g = JSON.parse(b.subarray(20, 20 + n)); const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of g.meshes) for (const p of m.primitives) { const a = g.accessors[p.attributes.POSITION]; if (!a.min) continue; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); } }
  if (!Number.isFinite(lo[0])) return []; const M = 39.3701, pos = new Float32Array(24); let i = 0; for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) { pos[i++] = x * M; pos[i++] = z * M; pos[i++] = y * M; }
  return [{ name: 'look', pos, idx: new Uint32Array(0) }]; };
const moverLooks = [];
for (const e of entList.filter(e => (e.kind === 'door' || e.kind === 'break') && (e.physics || e.look))) {
  // (no collision file: its look's bounds — a door's look is in metres, across = x, along = z, up = y — as a box)
  const src = e.physics ? readGlb(e.physics) : lookBox(e.look), pm = placed(src, e); let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of pm) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.pos[i + k]); hi[k] = Math.max(hi[k], m.pos[i + k]); }
  if (!Number.isFinite(lo[0])) continue;
  const hinge = e.kind === 'door' ? e.origin : [0, 0, 0]; models.push({ mins: lo.map((v, k) => v - hinge[k]), maxs: hi.map((v, k) => v - hinge[k]) });
  out.push(e.kind === 'door' ? { classname: 'func_door_rotating', model: '*' + (models.length - 1), origin: hinge.join(' '), distance: String(e.distance || 90), spawnflags: '0', cs2: e.model }
    : { classname: 'func_breakable', model: '*' + (models.length - 1), origin: '0 0 0', material: e.glass ? '0' : '2', health: String(Math.max(1, e.health || 1)), spawnflags: '0', cs2: e.model });
  moverLooks.push({ ent: out.length - 1, kind: e.kind, look: e.look, physics: e.physics, origin: e.origin, angles: e.angles, scale: e.scale }); }
// Ladders: each piece of CS2's ladder surface (its triangles joined where they touch), as a climbing volume as thin as
// the surface (a player touching its face climbs: arena-move.js reaches round it).
const ladderBoxes = []; { const L = meshes.filter(isLadder); for (const m of L) { const nt = m.idx.length / 3, used = new Uint8Array(nt);
  for (let t0 = 0; t0 < nt; t0++) { if (used[t0]) continue; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], st = [t0]; used[t0] = 1;
    while (st.length) { const t = st.pop(); for (let c = 0; c < 3; c++) { const v = m.idx[t * 3 + c]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.pos[v * 3 + k]); hi[k] = Math.max(hi[k], m.pos[v * 3 + k]); } }
      for (let u = 0; u < nt; u++) if (!used[u]) { let share = false; for (let a = 0; a < 3 && !share; a++) for (let b = 0; b < 3; b++) { const va = m.idx[t * 3 + a], vb = m.idx[u * 3 + b]; if (Math.abs(m.pos[va * 3] - m.pos[vb * 3]) + Math.abs(m.pos[va * 3 + 1] - m.pos[vb * 3 + 1]) + Math.abs(m.pos[va * 3 + 2] - m.pos[vb * 3 + 2]) < .1) { share = true; break; } } if (share) { used[u] = 1; st.push(u); } } }
    ladderBoxes.push({ mins: [lo[0] - 1, lo[1] - 1, lo[2]], maxs: [hi[0] + 1, hi[1] + 1, hi[2] + 4] }); } } }   // (thin, as the surface is: the game climbs it from its face, arena-move.js)
console.log(`entities: ${entList.filter(e => e.kind === 'solid' && e.physics).length} solid (collision added), ${moverLooks.filter(m => m.kind === 'door').length} doors, ${moverLooks.filter(m => m.kind === 'break').length} breakables; ladders: ${ladderBoxes.length}`);
// The play area: the spawns, buy zones and bomb sites, 1 500 round them (the map's far scenery left out), and its heights.
const pts = []; for (const e of out) { if (e.origin && !e.model) pts.push(vec3(e.origin)); else if (e.model && /^func_(buyzone|bomb_target)$/.test(e.classname)) { const m = models[+e.model.slice(1)]; pts.push(m.mins, m.maxs); } }
const lo = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])));
const X0 = Math.floor((lo[0] - 1500) / 8) * 8 + 4, Y0 = Math.floor((lo[1] - 1500) / 8) * 8 + 4, cols = Math.ceil((hi[0] + 1500 - X0) / 8) + 1, rows = Math.ceil((hi[1] + 1500 - Y0) / 8) + 1, Z0 = lo[2] - 700, Z1 = hi[2] + 900;
models[0] = { mins: [X0 - 4, Y0 - 4, Z0], maxs: [X0 + cols * 8, Y0 + rows * 8, Z1] };
// Which triangles belong to open sheets: vertices welded (0.05 units), triangles joined across shared edges, and a
// piece is closed when every edge of it is used exactly twice — CS2's hulls; the rest (one-sided roofs, terrain,
// awnings) can't say what is under them (mesh-solids.js: thin slabs).
function openFlags(soup) { const { pos, idx } = soup, nt = idx.length / 3, weld = new Map(), vid = new Uint32Array(pos.length / 3);
  for (let v = 0; v < vid.length; v++) { const k = Math.round(pos[v * 3] * 20) + ',' + Math.round(pos[v * 3 + 1] * 20) + ',' + Math.round(pos[v * 3 + 2] * 20); let w = weld.get(k); if (w === undefined) { w = weld.size; weld.set(k, w); } vid[v] = w; }
  const parent = new Uint32Array(nt).map((_, i) => i), find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }, edges = new Map();
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) { const a = vid[idx[t * 3 + e]], b = vid[idx[t * 3 + (e + 1) % 3]]; if (a === b) continue; const k = a < b ? a * 4294967296 + b : b * 4294967296 + a; const prev = edges.get(k);
    if (prev === undefined) edges.set(k, t); else { if (prev >= 0) { const ra = find(prev), rb = find(t); if (ra !== rb) parent[ra] = rb; } edges.set(k, prev >= 0 ? -1 - prev : prev - nt * 2); } }   // (used once: its triangle; twice: −1−first; more: below −2·nt)
  const bad = new Set(); for (const [k, v] of edges) if (v >= 0 || v < -nt) { if (v >= 0) bad.add(find(v)); else bad.add(find(-1 - ((-v - 1) % nt))); }   // an edge used once (an open border) or more than twice
  const open = new Uint8Array(nt), piece = new Int32Array(nt); let n = 0; for (let t = 0; t < nt; t++) { piece[t] = find(t); if (bad.has(piece[t])) { open[t] = 1; n++; } }
  console.log(`  ${weld.size} welded vertices · ${nt - n} triangles in closed pieces · ${n} in open sheets`); return { open, piece }; }
// Solid stretches at every grid point (x, y ≡ 4 mod 8: where the builder's rays fall), z in half units.
// In front of each ladder (players only): its rungs and rails don't keep you off it — CS2 climbs its surface. From the
// surface out to the open side (the side with room, the other is the wall), over the ladder's width, between a little
// above its foot and a little below its top, the solid goes (the floor at its foot and the ledge at its top stay).
function ladderClears(S) { const out = [], DEPTH = 26;
  for (const L of ladderBoxes) { const thinX = L.maxs[0] - L.mins[0] < L.maxs[1] - L.mins[1], mid = [(L.mins[0] + L.maxs[0]) / 2, (L.mins[1] + L.maxs[1]) / 2], zt = L.mins[2] + 40;
    // (the open side: free close by — 16 to 40 units out, at a few heights; far out, behind a thin wall, is another room)
    const freeAt = (x, y, z) => !S.solidSpans(x, y, z - 1, z + 1).length, room = sg => { let n = 0; for (const d of [16, 24, 32, 40]) for (const dz of [24, 40, 56]) n += freeAt(thinX ? mid[0] + sg * d : mid[0], thinX ? mid[1] : mid[1] + sg * d, L.mins[2] + dz) ? 1 : 0; return n; };
    const rp = room(1), rn = room(-1), side = rp > rn ? 1 : rn > rp ? -1 : 0, a = thinX ? 0 : 1, b = 1 - a, lo = [0, 0], hi = [0, 0], p0 = (L.mins[a] + L.maxs[a]) / 2;
    // its own column always (a ladder standing free is climbed from either side); the open side's DEPTH too, when there is one
    // (the game's columns are 16 units, each solid where two of its four samples are: the whole column the ladder stands in)
    const c0 = Math.floor(p0 / 16) * 16; lo[a] = side < 0 || !side ? Math.min(c0, p0 - (side ? DEPTH : 24)) : c0; hi[a] = side > 0 || !side ? Math.max(c0 + 16, p0 + (side ? DEPTH : 24)) : c0 + 16;   /* (standing free — no wall behind: a body's room on both sides) */ lo[b] = Math.floor((L.mins[b] - 2) / 16) * 16; hi[b] = Math.ceil((L.maxs[b] + 2) / 16) * 16;   /* (whole columns across its width too: its rails don't pinch the way in) */
    // (from just above the floor under its foot — a ladder may start above the floor, its lowest rung then in the way)
    let floor = -Infinity; for (const sg of side ? [side] : [1, -1]) { const fp = [(L.mins[0] + L.maxs[0]) / 2, (L.mins[1] + L.maxs[1]) / 2]; fp[a] = p0 + sg * 20;   // (by its foot on the side(s) cleared: the higher floor stays whole)
      for (const sp of S.solidSpans(fp[0], fp[1], L.mins[2] - 60, L.mins[2] + 1)) floor = Math.max(floor, sp[1]); }
    out.push({ x0: lo[0], x1: hi[0], y0: lo[1], y1: hi[1], z0: Math.max(floor + 2, L.mins[2] - 8), z1: L.maxs[2] + 2 }); }   // (up through the hatch at its top: the hole round a ladder is narrower than a column)
  return out; }
// What each floor is made of, as CS2 draws it: the map's look (Source 2 Viewer's world export, the source of its look in
// the game) — every face turned up, with its material's name (sand, tiles, asphalt, metal grates, wood, carpet), in a
// 64-unit grid. The collision's own groups are coarse (Nuke's floor is all "metal"; clips lie on stairs): they only
// stand in for a map without a look. glTF axes: X = Hammer y, Y = Hammer z, Z = Hammer x, metres.
function lookFloors(file) {
  if (!existsSync(file)) return null; const t0 = Date.now();
  const b = readFileSync(file), n = b.readUInt32LE(12), g = JSON.parse(b.subarray(20, 20 + n).toString()), bin0 = 20 + n + 8, K = 39.3701;
  const arr = (i, T, k) => { const a = g.accessors[i], v = g.bufferViews[a.bufferView], o = bin0 + (v.byteOffset || 0) + (a.byteOffset || 0), size = T.BYTES_PER_ELEMENT * k; if (v.byteStride && v.byteStride !== size) return null; return new T(b.buffer.slice(b.byteOffset + o, b.byteOffset + o + a.count * size)); };
  const mul = (A, B) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]; return o; };
  const local = nd => { if (nd.matrix) return nd.matrix; const [tx, ty, tz] = nd.translation || [0, 0, 0], [qx, qy, qz, qw] = nd.rotation || [0, 0, 0, 1], [sx, sy, sz] = nd.scale || [1, 1, 1];
    return [(1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0, 2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0, 2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0, tx, ty, tz, 1]; };
  const T = [], MAT = [], names = []; const nameId = new Map(), idOf = nm => { let i = nameId.get(nm); if (i === undefined) { i = names.length; names.push(nm); nameId.set(nm, i); } return i; };
  const walk = (ni, P) => { const nd = g.nodes[ni], W = mul(P, local(nd));
    if (nd.mesh != null) for (const pr of g.meshes[nd.mesh].primitives) { const mname = pr.material != null ? (g.materials[pr.material].name || '') : ''; if (/sky|clip|nodraw|invisible|toolsblock|water|decal|overlay|glass/i.test(mname)) continue;
      const pos = arr(pr.attributes.POSITION, Float32Array, 3); if (!pos) continue; const ia = g.accessors[pr.indices], idx = pr.indices == null ? null : arr(pr.indices, ia.componentType === 5125 ? Uint32Array : Uint16Array, 1); const mid = idOf(mname);
      const H = new Float32Array(pos.length); for (let v = 0; v < pos.length; v += 3) { const x = pos[v], y = pos[v + 1], z = pos[v + 2], gx = W[0] * x + W[4] * y + W[8] * z + W[12], gy = W[1] * x + W[5] * y + W[9] * z + W[13], gz = W[2] * x + W[6] * y + W[10] * z + W[14]; H[v] = gz * K; H[v + 1] = gx * K; H[v + 2] = gy * K; }
      const nt = idx ? idx.length / 3 : pos.length / 9;
      for (let t = 0; t < nt; t++) { const a = (idx ? idx[t * 3] : t * 3) * 3, b2 = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
        const ux = H[b2] - H[a], uy = H[b2 + 1] - H[a + 1], uz = H[b2 + 2] - H[a + 2], vx = H[c] - H[a], vy = H[c + 1] - H[a + 1], vz = H[c + 2] - H[a + 2], nz = ux * vy - uy * vx, nl = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz);
        if (nl < 1e-6 || Math.abs(nz) / nl < .5) continue;   // (floors: faces turned up — either winding)
        T.push(H[a], H[a + 1], H[a + 2], H[b2], H[b2 + 1], H[b2 + 2], H[c], H[c + 1], H[c + 2]); MAT.push(mid); } }
    for (const c of nd.children || []) walk(c, W); };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; for (const ni of g.scenes[g.scene || 0].nodes) walk(ni, I);
  const tri = Float32Array.from(T), mat = Uint32Array.from(MAT), nt = mat.length, C = 64; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < tri.length; i += 3) { x0 = Math.min(x0, tri[i]); x1 = Math.max(x1, tri[i]); y0 = Math.min(y0, tri[i + 1]); y1 = Math.max(y1, tri[i + 1]); }
  const cols = Math.ceil((x1 - x0) / C) + 1, rows = Math.ceil((y1 - y0) / C) + 1, buckets = new Map();
  for (let t = 0; t < nt; t++) { const o = t * 9, lx = Math.min(tri[o], tri[o + 3], tri[o + 6]), hx = Math.max(tri[o], tri[o + 3], tri[o + 6]), ly = Math.min(tri[o + 1], tri[o + 4], tri[o + 7]), hy = Math.max(tri[o + 1], tri[o + 4], tri[o + 7]);
    for (let r = Math.floor((ly - y0) / C); r <= Math.floor((hy - y0) / C); r++) for (let q = Math.floor((lx - x0) / C); q <= Math.floor((hx - x0) / C); q++) { const k = r * cols + q; let L = buckets.get(k); if (!L) buckets.set(k, L = []); L.push(t); } }
  console.log(`  look floors: ${nt} faces, ${names.length} materials (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  // The material of the floor face under (x, y) nearest height z (within 8 units), or null.
  return (x, y, z) => { const L = buckets.get(Math.floor((y - y0) / C) * cols + Math.floor((x - x0) / C)); if (!L) return null; let best = null, bd = 8;
    for (const t of L) { const o = t * 9, ax = tri[o], ay = tri[o + 1], bx = tri[o + 3], by = tri[o + 4], cx = tri[o + 6], cy = tri[o + 7], d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-9) continue;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, w = 1 - u - v; if (u < -.001 || v < -.001 || w < -.001) continue;
      const h = u * tri[o + 2] + v * tri[o + 5] + w * tri[o + 8], dz = Math.abs(h - z); if (dz < bd) { bd = dz; best = names[mat[t]]; } }
    return best; };
}
const LOOK = lookFloors(path.join(dir, 'world2', 'world.glb'));
// A stretch's footstep surface (SURFACES index): its look's floor material; where the look has none, the collision's group
// (clips and sound blockers say nothing: their floors take their neighbours' in the game).
const surfClass = (x, y, top, g) => { const nm = LOOK?.(x, y, top); if (nm) return surfaceOf(nm); const pg = SURF[g]; return g === 255 || !pg || /clip|block|pass|sky|default|unknown/.test(pg) ? 255 : surfaceOf(pg); };   // (no face of the look there — collision only, under or outside the play space: the collision's group)
function grid(soup, ladderCut = false) { const F = openFlags(soup), S = meshSolids(soup.pos, soup.idx, 64, F.open, F.piece, 8, 4, soup.grp), offs = new Uint32Array(cols * rows + 1), vals = [], surf = []; let t = Date.now();
  const cuts = ladderCut ? ladderClears(S) : []; if (cuts.length) console.log(`  ${cuts.length} ladders cleared of their rungs`); if (process.env.CUTS) console.log(JSON.stringify(cuts.map(k => Object.fromEntries(Object.entries(k).map(([a, v]) => [a, Math.round(v)])))), JSON.stringify(ladderBoxes.map(L => [L.mins.map(Math.round), L.maxs.map(Math.round)])));
  for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { const x = X0 + c * 8, y = Y0 + r * 8; let sp = S.solidSpans(x, y, Z0, Z1);
      for (const k of cuts) if (x >= k.x0 && x <= k.x1 && y >= k.y0 && y <= k.y1) sp = sp.flatMap(([b, tp, g]) => tp <= k.z0 || b >= k.z1 ? [[b, tp, g]] : [...(b < k.z0 ? [[b, k.z0, 255]] : []), ...(tp > k.z1 ? [[k.z1, tp, g]] : [])]);
      for (const [b, tp, g] of sp) { vals.push(Math.max(-32768, Math.round(b * 2)), Math.min(32767, Math.round(tp * 2))); surf.push(ladderCut ? surfClass(x, y, tp, g ?? 255) : 255); } offs[r * cols + c + 1] = vals.length; }
    if (Date.now() - t > 5000) { t = Date.now(); console.log(`  ${Math.round(100 * r / rows)}%`); } }
  return { offs, vals: Int16Array.from(vals), surf: Uint8Array.from(surf) }; }
console.log(`grid ${cols} × ${rows} (8 units) over x ${X0}…${X0 + cols * 8}, y ${Y0}…${Y0 + rows * 8}, z ${Z0.toFixed(0)}…${Z1.toFixed(0)}`);
const P = grid(players, true), N = grid(nades);
// The file: "CS2M", version, header length, header JSON, then the grids (each: offsets Uint32 × (cols·rows+1), values Int16),
// then a byte per player stretch: what its top is made of (a footstep surface: header.surfaces; 255: unknown).
const header = Buffer.from(JSON.stringify({ id, source: 'Counter-Strike 2 (' + path.basename(dir) + ')', grid: { x0: X0, y0: Y0, step: 8, cols, rows, z0: Z0, z1: Z1 }, models, entities: out, ladderBoxes,
  sizes: { players: [P.offs.length, P.vals.length], nades: [N.offs.length, N.vals.length], surfaces: P.surf.length }, surfaces: SURFACES }));
const pad = b => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]), u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const file = Buffer.concat([Buffer.from('CS2M'), u32(1), u32(header.length), pad(header), ...[P, N].flatMap(g => [Buffer.from(g.offs.buffer), pad(Buffer.from(g.vals.buffer))]), pad(Buffer.from(P.surf.buffer))]);   // (then each player stretch's surface: an index into the header's `surfaces`)
const target = path.join(outDir, id + '.bsp'); mkdirSync(path.dirname(target), { recursive: true });
if (existsSync(target) && readFileSync(target).subarray(0, 4).toString() !== 'CS2M') { const bk = path.join(os.homedir(), 'CS2-extract', 'backup'); mkdirSync(bk, { recursive: true }); const to = path.join(bk, id + '-before-cs2.bsp'); if (!existsSync(to)) { copyFileSync(target, to); console.log('kept the earlier map file:', to); } }
writeFileSync(target, file); writeFileSync(path.join(dir, 'movers.json'), JSON.stringify(moverLooks, null, 1));   /* (for the look: convert_world.py) */ console.log(`→ ${target} (${(file.length / 1048576).toFixed(1)} MB): ${out.filter(e => /^info_player/.test(e.classname)).length} spawns, ${out.filter(e => e.classname === 'func_buyzone').length} buy zones, ${out.filter(e => e.classname === 'func_bomb_target').length} bomb sites, ${out.filter(e => e.classname === 'env_cs_place').length} places`);
