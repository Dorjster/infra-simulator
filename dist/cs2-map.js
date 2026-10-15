// Counter-Strike 2 maps converted on this computer (tools/maps/import-cs2-map.mjs: user-maps/<id>.bsp starting "CS2M")
// → the shape bsp-map.js builds maps from: a world model with its bounds, the entities (spawns, buy zones, bomb sites,
// places) with their boxes as brush models, and the collision as solid stretches along vertical lines — CS2's physics
// sampled every 8 units, at the very points the builder's rays fall on. Grenades get their own (CS2's grenade clips
// in, its player clips out). Pure: the room host, the clients and the tests share it.
export const isCs2Map = buf => { const u = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, 4); return u[0] === 67 && u[1] === 83 && u[2] === 50 && u[3] === 77; };   // "CS2M"
export function parseCs2Map(buf) {
  const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), dv = new DataView(ab), hl = dv.getUint32(8, true);
  const H = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 12, hl))), G = H.grid, n = G.cols * G.rows + 1; let o = 12 + hl + (4 - hl % 4) % 4;
  const grid = () => { const offs = new Uint32Array(ab, o, n); o += n * 4; const nv = offs[n - 1], vals = new Int16Array(ab, o, nv); o += nv * 2 + (4 - (nv * 2) % 4) % 4; return { offs, vals }; };
  const P = grid(), N = grid(), SURF = H.sizes?.surfaces ? new Uint8Array(ab, o, H.sizes.surfaces) : null;   // (what each player stretch's top is made of: CS2's surface property, header.surfaces)
  const at = (g, x, y) => { const c = Math.round((x - G.x0) / G.step), r = Math.round((y - G.y0) / G.step); return c < 0 || r < 0 || c >= G.cols || r >= G.rows ? -1 : r * G.cols + c; };
  // Solid stretches [bottom, top] (Hammer units) on the line through (x, y), clipped to [z0, z1].
  const spans = (g, x, y, z0, z1) => { const i = at(g, x, y), out = []; if (i < 0) return out; for (let k = g.offs[i]; k < g.offs[i + 1]; k += 2) { const b = g.vals[k] / 2, t = g.vals[k + 1] / 2; if (t > z0 && b < z1) out.push([Math.max(b, z0), Math.min(t, z1)]); } return out; };
  // What the floor at (x, y) about height z is made of (CS2's surface name), or null.
  const surfaceAt = (x, y, z) => { if (!SURF) return null; const i = at(P, x, y); if (i < 0) return null; let best = -1, bd = 6; for (let k = P.offs[i]; k < P.offs[i + 1]; k += 2) { const d = Math.abs(P.vals[k + 1] / 2 - z); if (d < bd) { bd = d; best = SURF[k >> 1]; } } return best >= 0 && best < 255 ? H.surfaces[best] : null; };
  const pointIn = (g, x, y, z) => { const i = at(g, x, y); if (i < 0) return false; for (let k = g.offs[i]; k < g.offs[i + 1]; k += 2) if (z >= g.vals[k] / 2 && z <= g.vals[k + 1] / 2) return true; return false; };
  const models = H.models.map((m, i) => ({ mins: m.mins, maxs: m.maxs, head: i ? -1 : 0, hulls: [] }));
  // Spawns under the names the builder knows them by (as in Counter-Strike 1.6 / Source: Terrorists at
  // info_player_deathmatch, Counter-Terrorists at info_player_start).
  const SPAWN = { info_player_terrorist: 'info_player_deathmatch', info_player_counterterrorist: 'info_player_start' }; H.entities = H.entities.map(e => SPAWN[e.classname] ? { ...e, classname: SPAWN[e.classname] } : e);
  return { format: 'vbsp', cs2: true, source: null, id: H.id, origin: H.source, models, entities: H.entities, ladderBoxes: H.ladderBoxes || [],   // (ladders: CS2's ladder surfaces as climbing volumes, import-cs2-map.mjs)
    solidSpans: (head, x, y, z0, z1) => spans(P, x, y, z0, z1),   // (the builder's world part: head 0)
    pointSolid: (x, y, z) => pointIn(N, x, y, z),                  // grenades
    surfaceAt,                                                     // footsteps (map-light.js floorSurface)
    places: H.entities.filter(e => e.classname === 'env_cs_place' && e.place_name).map(e => ({ name: e.place_name, ...H.models[+e.model.slice(1)] })) };
}
