// Reads a Source engine map file (VBSP, versions 19–21: Counter-Strike: Source / CS:GO / Garry's Mod ports — e.g. a
// de_ancient made for CS:GO): geometry (vertices, edges, faces), texture placement and names, the baked light
// (lightmaps, RGB + exponent), displacements (terrain), the BSP tree with each leaf's contents, brushes, brush models,
// static props (name, place, turn, scale) and the files packed into the map (materials, textures, models: a .zip).
// Pure: works in the browser and in Node. Units are the map's own (Hammer units, z up).
// toGoldSrc(bsp) gives the shape bsp-map.js reads from Counter-Strike 1.6 maps (bsp30.js), so the same map builder
// makes the game's map from it (collision columns, floors, sites, spawns, navigation).
export const CONTENTS = { SOLID: 0x1, WINDOW: 0x2, GRATE: 0x8, MOVEABLE: 0x4000, PLAYERCLIP: 0x10000, MONSTERCLIP: 0x20000, LADDER: 0x20000000 };
export const SURF = { SKY2D: 0x2, SKY: 0x4, NODRAW: 0x80, HINT: 0x100, SKIP: 0x200, BUMPLIGHT: 0x800, NOLIGHT: 0x400 };
const L = { ENTITIES: 0, PLANES: 1, TEXDATA: 2, VERTEXES: 3, NODES: 5, TEXINFO: 6, FACES: 7, LIGHTING: 8, LEAFS: 10, EDGES: 12, SURFEDGES: 13, MODELS: 14, LEAFBRUSHES: 17, BRUSHES: 18, BRUSHSIDES: 19,
  DISPINFO: 26, DISP_VERTS: 33, GAME_LUMP: 35, PAKFILE: 40, TEXDATA_STRING_DATA: 43, TEXDATA_STRING_TABLE: 44, DISP_TRIS: 48, LIGHTING_HDR: 53, FACES_HDR: 58 };

export const isVbsp = buf => { const u = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, 4); return u[0] === 0x56 && u[1] === 0x42 && u[2] === 0x53 && u[3] === 0x50; };   // "VBSP"

export function parseVbsp(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0, buffer.byteLength), u8 = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  if (!isVbsp(u8)) throw Error('Not a Source map (VBSP)'); const version = dv.getInt32(4, true); if (version < 19 || version > 21) throw Error('Source map version ' + version + ' (reads 19–21)');
  const lump = i => ({ off: dv.getInt32(8 + i * 16, true), len: dv.getInt32(12 + i * 16, true), ver: dv.getInt32(16 + i * 16, true) });
  const f32 = o => dv.getFloat32(o, true), i32 = o => dv.getInt32(o, true), u16 = o => dv.getUint16(o, true), i16 = o => dv.getInt16(o, true);
  const cstr = (o, max = 1 << 20) => { let s = ''; for (let i = 0; i < max && u8[o + i]; i++) s += String.fromCharCode(u8[o + i]); return s; };
  // Planes (20 bytes): normal, dist, type.
  const PL = lump(L.PLANES), nP = PL.len / 20, planes = new Float32Array(nP * 4); for (let i = 0; i < nP; i++) for (let k = 0; k < 4; k++) planes[i * 4 + k] = f32(PL.off + i * 20 + k * 4);
  const VX = lump(L.VERTEXES), vertices = new Float32Array(VX.len / 4); for (let i = 0; i < vertices.length; i++) vertices[i] = f32(VX.off + i * 4);
  const ED = lump(L.EDGES), edges = new Uint16Array(ED.len / 2); for (let i = 0; i < edges.length; i++) edges[i] = u16(ED.off + i * 2);
  const SE = lump(L.SURFEDGES), surfedges = new Int32Array(SE.len / 4); for (let i = 0; i < surfedges.length; i++) surfedges[i] = i32(SE.off + i * 4);
  // Nodes (32 bytes): plane, children (negative: leaf −(i + 1)).
  const ND = lump(L.NODES), nN = ND.len / 32, nodes = new Int32Array(nN * 3); for (let i = 0; i < nN; i++) { const o = ND.off + i * 32; nodes[i * 3] = i32(o); nodes[i * 3 + 1] = i32(o + 4); nodes[i * 3 + 2] = i32(o + 8); }
  // Leaves (32 bytes in v20+, 56 in v19 with their ambient light): contents, leaf brushes.
  const LF = lump(L.LEAFS), leafSize = version >= 20 ? 32 : 56, nL = LF.len / leafSize, leafContents = new Int32Array(nL), leafBrushes = new Uint32Array(nL * 2);
  for (let i = 0; i < nL; i++) { const o = LF.off + i * leafSize; leafContents[i] = i32(o); leafBrushes[i * 2] = u16(o + 24); leafBrushes[i * 2 + 1] = u16(o + 26); }
  const LB = lump(L.LEAFBRUSHES), leafbrush = new Uint16Array(LB.len / 2); for (let i = 0; i < leafbrush.length; i++) leafbrush[i] = u16(LB.off + i * 2);
  const BR = lump(L.BRUSHES), nB = BR.len / 12, brushes = new Int32Array(nB * 3); for (let i = 0; i < nB; i++) for (let k = 0; k < 3; k++) brushes[i * 3 + k] = i32(BR.off + i * 12 + k * 4);
  const BS = lump(L.BRUSHSIDES), nS = BS.len / 8, brushsides = new Int32Array(nS * 3); for (let i = 0; i < nS; i++) { const o = BS.off + i * 8; brushsides[i * 3] = u16(o); brushsides[i * 3 + 1] = i16(o + 2); brushsides[i * 3 + 2] = u8[o + 6]; }   // plane, texinfo, bevel
  // Texture placement (72 bytes): texture s / t (xyz + offset), lightmap s / t, flags, texdata.
  const TI = lump(L.TEXINFO), nT = TI.len / 72, texinfo = []; for (let i = 0; i < nT; i++) { const o = TI.off + i * 72, v = k => f32(o + k * 4);
    texinfo.push({ s: [v(0), v(1), v(2), v(3)], t: [v(4), v(5), v(6), v(7)], ls: [v(8), v(9), v(10), v(11)], lt: [v(12), v(13), v(14), v(15)], flags: i32(o + 64), texdata: i32(o + 68) }); }
  // Texture data (32 bytes): reflectivity, name (string table), size. Names are material paths ("de_ancient/stone_floor_01").
  const SD = lump(L.TEXDATA_STRING_DATA), ST = lump(L.TEXDATA_STRING_TABLE), names = []; for (let i = 0; i < ST.len / 4; i++) names.push(cstr(SD.off + i32(ST.off + i * 4), 256).toLowerCase().replace(/\\/g, '/'));
  const TD = lump(L.TEXDATA), texdata = []; for (let i = 0; i < TD.len / 32; i++) { const o = TD.off + i * 32; texdata.push({ name: names[i32(o + 12)] || '', width: i32(o + 16), height: i32(o + 20), reflect: [f32(o), f32(o + 4), f32(o + 8)] }); }
  // Faces (56 bytes): plane, side, edges, texinfo, displacement, light styles, light offset, lightmap mins / size (luxels).
  const useHdr = lump(L.FACES).len === 0 && lump(L.FACES_HDR).len > 0, FC = lump(useHdr ? L.FACES_HDR : L.FACES), nF = FC.len / 56, faces = [];
  for (let i = 0; i < nF; i++) { const o = FC.off + i * 56; faces.push({ plane: u16(o), side: u8[o + 2], firstEdge: i32(o + 4), numEdges: i16(o + 8), texinfo: i16(o + 10), disp: i16(o + 12), styles: [u8[o + 16], u8[o + 17], u8[o + 18], u8[o + 19]], lightOfs: i32(o + 20), lmMins: [i32(o + 28), i32(o + 32)], lmSize: [i32(o + 36), i32(o + 40)] }); }
  const LI = lump(useHdr ? L.LIGHTING_HDR : L.LIGHTING), lighting = u8.subarray(LI.off, LI.off + LI.len);
  // Brush models (48 bytes): bounds, origin, head node, faces. Model 0 is the world.
  const MD = lump(L.MODELS), models = []; for (let i = 0; i < MD.len / 48; i++) { const o = MD.off + i * 48; models.push({ mins: [f32(o), f32(o + 4), f32(o + 8)], maxs: [f32(o + 12), f32(o + 16), f32(o + 20)], origin: [f32(o + 24), f32(o + 28), f32(o + 32)], head: i32(o + 36), firstFace: i32(o + 40), numFaces: i32(o + 44) }); }
  // Displacements (176 bytes each): start corner, first vertex / triangle, power, the face they replace.
  const DI = lump(L.DISPINFO), disps = []; for (let i = 0; i < DI.len / 176; i++) { const o = DI.off + i * 176; disps.push({ start: [f32(o), f32(o + 4), f32(o + 8)], vertStart: i32(o + 12), triStart: i32(o + 16), power: i32(o + 20), contents: i32(o + 32), face: u16(o + 36) }); }
  const DV = lump(L.DISP_VERTS), dispVerts = new Float32Array(DV.len / 4); for (let i = 0; i < dispVerts.length; i++) dispVerts[i] = f32(DV.off + i * 4);   // per vertex: offset xyz, distance, alpha
  const DT = lump(L.DISP_TRIS), dispTris = new Uint16Array(DT.len / 2); for (let i = 0; i < dispTris.length; i++) dispTris[i] = u16(DT.off + i * 2);
  // Entities.
  const EN = lump(L.ENTITIES), entities = []; for (const blk of cstr(EN.off, EN.len).match(/\{[^}]*\}/g) || []) { const e = {}; for (const m of blk.matchAll(/"([^"]*)"\s+"([^"]*)"/g)) e[m[1]] = m[2]; entities.push(e); }
  // Static props (game lump "sprp"): model names; each prop's origin, angles (pitch yaw roll), solidity, skin, scale.
  const props = [], propModels = []; { const GL = lump(L.GAME_LUMP), n = GL.len ? i32(GL.off) : 0;
    for (let i = 0; i < n; i++) { const o = GL.off + 4 + i * 16, id = i32(o), ver = u16(o + 6), fo = i32(o + 8), fl = i32(o + 12); if (id !== 0x73707270 || !fl) continue;   // 'sprp'
      let p = fo; const nd = i32(p); p += 4; for (let k = 0; k < nd; k++) propModels.push(cstr(p + k * 128, 128).toLowerCase().replace(/\\/g, '/')); p += nd * 128;
      const nl = i32(p); p += 4 + nl * 2; const np = i32(p); p += 4; if (!np) continue; const size = Math.floor((fo + fl - p) / np);
      for (let k = 0; k < np; k++) { const q = p + k * size; props.push({ origin: [f32(q), f32(q + 4), f32(q + 8)], angles: [f32(q + 12), f32(q + 16), f32(q + 20)], model: u16(q + 24), solid: u8[q + 30], flags: u8[q + 31], skin: i32(q + 32), scale: ver >= 11 && size >= 80 ? f32(q + 76) || 1 : 1 }); } } }
  // Packed files: a .zip in the map (usually stored, not compressed).
  const PK = lump(L.PAKFILE), pak = PK.len ? readPak(u8.subarray(PK.off, PK.off + PK.len)) : new Map();
  return { format: 'vbsp', version, planes, vertices, edges, surfedges, nodes, leafContents, leafBrushes, leafbrush, brushes, brushsides, texinfo, texdata, faces, lighting, hdr: useHdr, models, disps, dispVerts, dispTris, entities, props, propModels, pak };
}

// The map's packed .zip: path (lower case, '/') → { method, offset, size, csize } in `u8`; read(name) gives the bytes.
function readPak(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), files = new Map(); let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) return files;
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n && p + 46 <= u8.length; i++) { if (dv.getUint32(p, true) !== 0x02014b50) break; const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    let name = ''; for (let k = 0; k < nl; k++) name += String.fromCharCode(u8[p + 46 + k]); p += 46 + nl + xl + cl;
    files.set(name.toLowerCase().replace(/\\/g, '/'), { method, csize, size, at: lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true) }); }
  files.read = name => { const f = files.get(name.toLowerCase()); if (!f || f.method !== 0) return null; return u8.subarray(f.at, f.at + f.size); };   // stored entries (Source packs them so)
  return files;
}

// The vertices of a face ([x, y, z] arrays), in order.
export function faceVerts(bsp, f) { const out = []; for (let i = 0; i < f.numEdges; i++) { const se = bsp.surfedges[f.firstEdge + i], e = Math.abs(se), v = bsp.edges[e * 2 + (se < 0 ? 1 : 0)]; out.push([bsp.vertices[v * 3], bsp.vertices[v * 3 + 1], bsp.vertices[v * 3 + 2]]); } return out; }

// A displacement's grid: (2^power + 1)² points [x, y, z, alpha], row by row from the corner nearest its start position,
// and the face's corners in that order (for its texture placement, made on the flat face).
export function dispGrid(bsp, d) {
  const f = bsp.faces[d.face], V = faceVerts(bsp, f); if (V.length !== 4) return null;
  let k0 = 0, best = Infinity; for (let i = 0; i < 4; i++) { const q = (V[i][0] - d.start[0]) ** 2 + (V[i][1] - d.start[1]) ** 2 + (V[i][2] - d.start[2]) ** 2; if (q < best) { best = q; k0 = i; } }
  const C = [0, 1, 2, 3].map(i => V[(k0 + i) % 4]), n = (1 << d.power) + 1, pts = new Float32Array(n * n * 4), flat = new Float32Array(n * n * 3);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const u = c / (n - 1), v = r / (n - 1), i = r * n + c, o = (d.vertStart + i) * 5;
    // Corners: 0 → 1 along v (rows), 3 → 2 the other side (Source's order: the row runs 0→3, rows go 0→1).
    const a = [0, 1, 2].map(k => C[0][k] + (C[1][k] - C[0][k]) * v), b = [0, 1, 2].map(k => C[3][k] + (C[2][k] - C[3][k]) * v), base = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * u), dist = bsp.dispVerts[o + 3];
    for (let k = 0; k < 3; k++) { flat[i * 3 + k] = base[k]; pts[i * 4 + k] = base[k] + bsp.dispVerts[o + k] * dist; } pts[i * 4 + 3] = bsp.dispVerts[o + 4]; }
  return { n, pts, flat, corners: C };
}

// Along the vertical line at (x, y) from z1 down to z0, the stretches inside the brushes under node `head` whose
// contents match `mask` ([[bottom, top], …] low to high): the tree only finds the leaves the line crosses; each of their
// brushes (convex: its side planes) clips the line exactly. Player clips live only in the brushes, not in the leaves'
// contents — CS:GO's invisible walls round the map and its roof clips.
const BRUSH_MASK = CONTENTS.SOLID | CONTENTS.WINDOW | CONTENTS.GRATE | CONTENTS.MOVEABLE | CONTENTS.PLAYERCLIP;
let stampArr = null, stamp = 0;
export function brushSpans(bsp, head, x, y, z0, z1, mask = BRUSH_MASK) {
  const { planes, nodes, leafBrushes, leafbrush, brushes, brushsides } = bsp, nb = brushes.length / 3;
  if (!stampArr || stampArr.length < nb) stampArr = new Uint32Array(nb); if (++stamp > 4e9) { stampArr.fill(0); stamp = 1; }
  const iv = [];
  const leaf = l => { const first = leafBrushes[l * 2], count = leafBrushes[l * 2 + 1];
    for (let k = first; k < first + count; k++) { const b = leafbrush[k]; if (stampArr[b] === stamp) continue; stampArr[b] = stamp; if (!(brushes[b * 3 + 2] & mask)) continue;
      let lo = z0, hi = z1; const s0 = brushes[b * 3], n = brushes[b * 3 + 1];
      for (let j = s0; j < s0 + n && lo < hi; j++) { const p = brushsides[j * 3] * 4, nx = planes[p], ny = planes[p + 1], nz = planes[p + 2], d = planes[p + 3], c = d - nx * x - ny * y;
        if (Math.abs(nz) < 1e-6) { if (c < 0) hi = lo - 1; } else if (nz > 0) hi = Math.min(hi, c / nz); else lo = Math.max(lo, c / nz); }
      if (hi - lo > .01) iv.push([lo, hi]); } };
  const walk = (n, za, zb) => {   // the segment from za (high) to zb (low)
    while (n >= 0) { const p = nodes[n * 3] * 4, nx = planes[p], ny = planes[p + 1], nz = planes[p + 2], base = nx * x + ny * y - planes[p + 3], da = base + nz * za, db = base + nz * zb;
      if (da >= 0 && db >= 0) { n = nodes[n * 3 + 1]; continue; } if (da < 0 && db < 0) { n = nodes[n * 3 + 2]; continue; }
      const zm = -base / nz; walk(da >= 0 ? nodes[n * 3 + 1] : nodes[n * 3 + 2], za, zm); n = db >= 0 ? nodes[n * 3 + 1] : nodes[n * 3 + 2]; za = zm; }
    leaf(-(n + 1)); };
  walk(head, z1, z0);
  iv.sort((a, b) => a[0] - b[0]); const out = []; for (const s of iv) { const last = out[out.length - 1]; if (last && s[0] <= last[1] + .01) last[1] = Math.max(last[1], s[1]); else out.push(s); } return out;
}

// The play area's ground plan [x0, y0, x1, y1] (Hammer units): round the spawns, bomb sites and buy zones, 1 500 units
// out — the 3D sky box (a miniature far outside) is left out.
export function playBounds(bsp) { const pts = []; for (const e of bsp.entities) { if (/^info_player_(terrorist|counterterrorist|deathmatch|start)$/.test(e.classname || '')) pts.push((e.origin || '0 0 0').split(/\s+/).map(Number)); const mi = /^\*\d+$/.test(e.model || '') ? +e.model.slice(1) : -1; if (mi > 0 && /^func_(bomb_target|buyzone)$/.test(e.classname) && bsp.models[mi]) pts.push(bsp.models[mi].mins, bsp.models[mi].maxs); }
  if (!pts.length) { const m = bsp.models[0]; return [m.mins[0], m.mins[1], m.maxs[0], m.maxs[1]]; } return [Math.min(...pts.map(p => p[0])) - 1500, Math.min(...pts.map(p => p[1])) - 1500, Math.max(...pts.map(p => p[0])) + 1500, Math.max(...pts.map(p => p[1])) + 1500]; }

// Counter-Strike 1.6's shape of a map for bsp-map.js: the tree's leaves as solid (−2) / empty (−1), entities under
// their CS 1.6 class names, and hull tests made from the brushes (Source keeps no player hulls), plus the solid
// stretches displacements and props add (extraSpans: in a column, [bottom, top] HU).
export function toGoldSrc(bsp, { extraSpans = null } = {}) {
  const solidMask = CONTENTS.SOLID | CONTENTS.PLAYERCLIP | CONTENTS.WINDOW | CONTENTS.GRATE | CONTENTS.MOVEABLE;
  const leafContents = Int32Array.from(bsp.leafContents, c => c & solidMask ? -2 : -1);
  const CLASS = { info_player_terrorist: 'info_player_deathmatch', info_player_counterterrorist: 'info_player_start' };
  const entities = bsp.entities.map(e => CLASS[e.classname] ? { ...e, classname: CLASS[e.classname] } : e);
  const models = bsp.models.map(m => ({ ...m, hulls: [m.head, m.head, m.head, m.head] }));
  return { format: 'vbsp', version: bsp.version, planes: bsp.planes, nodes: bsp.nodes, leafContents, models, entities, textures: [], faces: [], texinfo: [], vertices: bsp.vertices, edges: bsp.edges, surfedges: bsp.surfedges, lighting: new Uint8Array(0), clipnodes: null, extraSpans, source: bsp,
    solidSpans: (head, x, y, z0, z1) => brushSpans(bsp, head, x, y, z0, z1) };
}
