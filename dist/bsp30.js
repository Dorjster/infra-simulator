// Reads a GoldSrc (Counter-Strike 1.6 / Half-Life) map file, BSP version 30: geometry (vertices, edges, faces),
// texture placement, the textures stored in the file (8-bit, with their palette), the baked light (lightmaps), the
// BSP tree of the visible hull (for what is solid where), brush models and the entity list (spawns, bomb sites, buy
// zones, ladders…). Pure: works in the browser and in Node. Units are the map's own (Hammer units, z up).
const LUMP = { ENTITIES: 0, PLANES: 1, TEXTURES: 2, VERTICES: 3, VISIBILITY: 4, NODES: 5, TEXINFO: 6, FACES: 7, LIGHTING: 8, CLIPNODES: 9, LEAVES: 10, MARKSURFACES: 11, EDGES: 12, SURFEDGES: 13, MODELS: 14 };
export const CONTENTS = { EMPTY: -1, SOLID: -2, WATER: -3, SLIME: -4, LAVA: -5, SKY: -6 };

export function parseBsp(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0, buffer.byteLength), u8 = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  const version = dv.getInt32(0, true); if (version !== 30) throw Error('Not a Counter-Strike 1.6 map (BSP version ' + version + ', needs 30)');
  const lump = i => ({ off: dv.getInt32(4 + i * 8, true), len: dv.getInt32(8 + i * 8, true) });
  const str = (o, n) => { let s = ''; for (let i = 0; i < n && u8[o + i]; i++) s += String.fromCharCode(u8[o + i]); return s; };
  // Planes: normal, distance.
  const PL = lump(LUMP.PLANES), nPlanes = PL.len / 20, planes = new Float32Array(nPlanes * 4);
  for (let i = 0; i < nPlanes; i++) for (let k = 0; k < 4; k++) planes[i * 4 + k] = dv.getFloat32(PL.off + i * 20 + k * 4, true);
  const VX = lump(LUMP.VERTICES), vertices = new Float32Array(VX.len / 4); for (let i = 0; i < vertices.length; i++) vertices[i] = dv.getFloat32(VX.off + i * 4, true);
  const ED = lump(LUMP.EDGES), edges = new Uint16Array(ED.len / 2); for (let i = 0; i < edges.length; i++) edges[i] = dv.getUint16(ED.off + i * 2, true);
  const SE = lump(LUMP.SURFEDGES), surfedges = new Int32Array(SE.len / 4); for (let i = 0; i < surfedges.length; i++) surfedges[i] = dv.getInt32(SE.off + i * 4, true);
  // Nodes (visible hull): plane, two children (negative: leaf −(i + 1)).
  const ND = lump(LUMP.NODES), nNodes = ND.len / 24, nodes = new Int32Array(nNodes * 3);
  for (let i = 0; i < nNodes; i++) { const o = ND.off + i * 24; nodes[i * 3] = dv.getInt32(o, true); nodes[i * 3 + 1] = dv.getInt16(o + 4, true); nodes[i * 3 + 2] = dv.getInt16(o + 6, true); }
  // Clip nodes (the player hulls 1–3: the real game's collision, with the invisible clip brushes): plane, two children
  // (negative: contents).
  const CN = lump(LUMP.CLIPNODES), nClip = CN.len / 8, clipnodes = new Int32Array(nClip * 3);
  for (let i = 0; i < nClip; i++) { const o = CN.off + i * 8; clipnodes[i * 3] = dv.getInt32(o, true); clipnodes[i * 3 + 1] = dv.getInt16(o + 4, true); clipnodes[i * 3 + 2] = dv.getInt16(o + 6, true); }
  const LF = lump(LUMP.LEAVES), nLeaves = LF.len / 28, leafContents = new Int32Array(nLeaves); for (let i = 0; i < nLeaves; i++) leafContents[i] = dv.getInt32(LF.off + i * 28, true);
  // Texture placement: s and t axes (xyz + offset), texture index, flags (1: special — sky, water: no light).
  const TI = lump(LUMP.TEXINFO), nTexinfo = TI.len / 40, texinfo = []; for (let i = 0; i < nTexinfo; i++) { const o = TI.off + i * 40, v = []; for (let k = 0; k < 8; k++) v.push(dv.getFloat32(o + k * 4, true)); texinfo.push({ s: v.slice(0, 4), t: v.slice(4, 8), tex: dv.getInt32(o + 32, true), flags: dv.getInt32(o + 36, true) }); }
  // Faces: plane, side, edges, texinfo, light styles, light offset.
  const FC = lump(LUMP.FACES), nFaces = FC.len / 20, faces = []; for (let i = 0; i < nFaces; i++) { const o = FC.off + i * 20; faces.push({ plane: dv.getUint16(o, true), side: dv.getInt16(o + 2, true), firstEdge: dv.getInt32(o + 4, true), numEdges: dv.getInt16(o + 8, true), texinfo: dv.getInt16(o + 10, true), styles: [u8[o + 12], u8[o + 13], u8[o + 14], u8[o + 15]], lightOfs: dv.getInt32(o + 16, true) }); }
  const LI = lump(LUMP.LIGHTING), lighting = u8.subarray(LI.off, LI.off + LI.len);
  // Brush models: bounds, origin, head nodes (hull 0 = the visible hull), faces. Model 0 is the world.
  const MD = lump(LUMP.MODELS), models = []; for (let i = 0; i < MD.len / 64; i++) { const o = MD.off + i * 64, f = k => dv.getFloat32(o + k * 4, true); models.push({ mins: [f(0), f(1), f(2)], maxs: [f(3), f(4), f(5)], origin: [f(6), f(7), f(8)], head: dv.getInt32(o + 36, true), hulls: [dv.getInt32(o + 36, true), dv.getInt32(o + 40, true), dv.getInt32(o + 44, true), dv.getInt32(o + 48, true)], firstFace: dv.getInt32(o + 56, true), numFaces: dv.getInt32(o + 60, true) }); }
  // Textures: name, size and (when stored in the map) the pixels as palette indices plus the palette. Textures kept
  // in a separate .wad (offset 0) have only their name.
  const TX = lump(LUMP.TEXTURES), nTex = dv.getInt32(TX.off, true), textures = [];
  for (let i = 0; i < nTex; i++) { const ofs = dv.getInt32(TX.off + 4 + i * 4, true); if (ofs < 0) { textures.push({ name: '', width: 16, height: 16, rgba: null }); continue; }
    const o = TX.off + ofs, name = str(o, 16).toLowerCase(), width = dv.getUint32(o + 16, true), height = dv.getUint32(o + 20, true), off0 = dv.getUint32(o + 24, true);
    // The pixels stay as they are in the file (palette indices, a view: no copy); textureRGBA() decodes them when drawn.
    let pixels = null, palette = null;
    if (off0 && width && height && width * height < 4096 * 4096) { const px = width * height, mipEnd = off0 + px + (px >> 2) + (px >> 4) + (px >> 6), pal = o + mipEnd + 2;
      if (pal + 768 <= TX.off + TX.len) { pixels = u8.subarray(o + off0, o + off0 + px); palette = u8.subarray(pal, pal + 768); } }
    textures.push({ name, width, height, pixels, palette, get rgba() { return !!pixels; } }); }
  // Entities: a list of key / value objects.
  const EN = lump(LUMP.ENTITIES), entText = str(EN.off, EN.len), entities = [];
  for (const blk of entText.match(/\{[^}]*\}/g) || []) { const e = {}; for (const m of blk.matchAll(/"([^"]*)"\s+"([^"]*)"/g)) e[m[1]] = m[2]; entities.push(e); }
  return { version, planes, vertices, edges, surfedges, nodes, clipnodes, leafContents, texinfo, faces, lighting, models, textures, entities };
}

// A texture's colours (RGBA bytes), decoded from its palette; '{' textures: palette entry 255 is see-through (fences, grates).
export function textureRGBA(t) { if (!t.pixels) return null; const px = t.pixels.length, out = new Uint8Array(px * 4), pal = t.palette, alpha = t.name[0] === '{';
  for (let p = 0; p < px; p++) { const c = t.pixels[p], q = c * 3; out[p * 4] = pal[q]; out[p * 4 + 1] = pal[q + 1]; out[p * 4 + 2] = pal[q + 2]; out[p * 4 + 3] = alpha && c === 255 ? 0 : 255; } return out; }
// The vertices of a face, in order ([x, y, z] arrays).
export function faceVerts(bsp, f) { const out = []; for (let i = 0; i < f.numEdges; i++) { const se = bsp.surfedges[f.firstEdge + i], e = Math.abs(se), v = bsp.edges[e * 2 + (se < 0 ? 1 : 0)]; out.push([bsp.vertices[v * 3], bsp.vertices[v * 3 + 1], bsp.vertices[v * 3 + 2]]); } return out; }

// Along the vertical line at (x, y) from z1 (top) down to z0, the solid stretches of the hull under `head` (a node
// index; the world is models[0].head): [[bottom, top], …] from low to high. Recursive line split by the BSP planes.
export function solidSpans(bsp, head, x, y, z0, z1) {
  const { planes, nodes, leafContents } = bsp, out = [];
  const walk = (n, za, zb) => {   // the segment from za (high) to zb (low), za ≥ zb
    while (n >= 0) { const p = nodes[n * 3], nx = planes[p * 4], ny = planes[p * 4 + 1], nz = planes[p * 4 + 2], d = planes[p * 4 + 3], base = nx * x + ny * y - d, da = base + nz * za, db = base + nz * zb;
      if (da >= 0 && db >= 0) { n = nodes[n * 3 + 1]; continue; } if (da < 0 && db < 0) { n = nodes[n * 3 + 2]; continue; }
      const zm = -base / nz;   // where the line crosses the plane
      walk(da >= 0 ? nodes[n * 3 + 1] : nodes[n * 3 + 2], za, zm); n = db >= 0 ? nodes[n * 3 + 1] : nodes[n * 3 + 2]; za = zm; }
    const c = leafContents[-(n + 1)]; if (c === CONTENTS.SOLID || c === CONTENTS.SKY) { const last = out[out.length - 1]; if (last && Math.abs(last[0] - za) < .01) last[0] = zb; else out.push([zb, za]); } };
  walk(head, z1, z0); return out.reverse();
}
// The same for a clip hull (clipnodes: hull 1 is the standing player's box, the world grown by 16 units round and 36
// up and down): where a player's centre cannot be. It holds the invisible player clips the drawn hull doesn't.
export function hullSpans(bsp, head, x, y, z0, z1) {
  const { planes, clipnodes } = bsp, out = []; if (!clipnodes || head == null) return out;
  const walk = (n, za, zb) => {
    while (n >= 0) { const p = clipnodes[n * 3], nx = planes[p * 4], ny = planes[p * 4 + 1], nz = planes[p * 4 + 2], d = planes[p * 4 + 3], base = nx * x + ny * y - d, da = base + nz * za, db = base + nz * zb;
      if (da >= 0 && db >= 0) { n = clipnodes[n * 3 + 1]; continue; } if (da < 0 && db < 0) { n = clipnodes[n * 3 + 2]; continue; }
      const zm = -base / nz; walk(da >= 0 ? clipnodes[n * 3 + 1] : clipnodes[n * 3 + 2], za, zm); n = db >= 0 ? clipnodes[n * 3 + 1] : clipnodes[n * 3 + 2]; za = zm; }
    if (n !== CONTENTS.EMPTY && n !== CONTENTS.WATER) { const last = out[out.length - 1]; if (last && Math.abs(last[0] - za) < .01) last[0] = zb; else out.push([zb, za]); } };
  walk(head, z1, z0); return out.reverse();
}
// Is the point solid in the hull under `head`?
export function solidAt(bsp, head, x, y, z) { const { planes, nodes, leafContents } = bsp; let n = head; while (n >= 0) { const p = nodes[n * 3]; n = planes[p * 4] * x + planes[p * 4 + 1] * y + planes[p * 4 + 2] * z - planes[p * 4 + 3] >= 0 ? nodes[n * 3 + 1] : nodes[n * 3 + 2]; } const c = leafContents[-(n + 1)]; return c === CONTENTS.SOLID || c === CONTENTS.SKY; }
// Would a standing player (hull 1: 32 × 32 × 72, the point is its centre) be inside something at (x, y, z)? The
// game's own test, clip brushes included. head: models[i].hulls[1].
export function hullSolid(bsp, head, x, y, z) { const { planes, clipnodes } = bsp; let n = head; while (n >= 0) { const p = clipnodes[n * 3]; n = planes[p * 4] * x + planes[p * 4 + 1] * y + planes[p * 4 + 2] * z - planes[p * 4 + 3] >= 0 ? clipnodes[n * 3 + 1] : clipnodes[n * 3 + 2]; } return n !== CONTENTS.EMPTY && n !== CONTENTS.WATER; }
// An entity's origin / angles as numbers; a brush entity's model index ('*3' → 3) or −1.
export const vec = s => (s || '0 0 0').split(/\s+/).map(Number);
export const modelOf = e => /^\*\d+$/.test(e.model || '') ? +e.model.slice(1) : -1;
