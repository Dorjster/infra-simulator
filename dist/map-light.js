// What each walkable floor of a map from a file is like, from the map's own faces: every upward-facing face is laid
// over the collision columns and, where a column's floor is on that face, read there.
//  · floorLight: the baked light (Counter-Strike 1.6: RGB bytes through the game's gamma; Source: RGB × 2^exponent), a
//    brightness per column floor (1 ≈ a sunlit floor drawn as is), so players can be lit like the ground they stand
//    on — dark in a tunnel, bright in the sun — instead of all alike by the scene's sun and sky.
//  · floorSurface: what it is made of, as the footstep sounds know it (concrete, metal, wood, grass — dirt and sand
//    too — carpet): from the texture's name (Counter-Strike 1.6) or the material's own $surfaceprop (Source; terrain
//    blending two materials takes the one its blend shows there).
import { MAXF, NONE, CELL } from './cs-columns.js';
import { dispGrid } from './vbsp.js';
import { parseVmt } from './vtf.js';
import { textureRGBA } from './bsp30.js';

export function floorLight(bsp, G, opts) {
  const { cols, rows, n, z } = G, N = cols * rows, out = new Float32Array(N * MAXF).fill(-1);
  const src = bsp.format === 'vbsp' ? bsp.source : bsp; if (!src?.faces?.length || !src.lighting?.length) return null;
  const L = src.lighting, vbsp = bsp.format === 'vbsp';
  floorHits(src, G, opts, (f, ti, W) => {
    if (f.lightOfs < 0 || f.styles[0] === 255) return null;
    // The face's lightmap: its luxel grid (16 units a luxel in CS 1.6; Source: its own mins / size).
    let ls, lt, lw, lh, s0 = 0, t0 = 0;
    if (vbsp) { ls = ti.ls; lt = ti.lt; lw = f.lmSize[0] + 1; lh = f.lmSize[1] + 1; s0 = f.lmMins[0]; t0 = f.lmMins[1]; }
    else { ls = ti.s.map(v => v / 16); lt = ti.t.map(v => v / 16); let smin = Infinity, tmin = Infinity, smax = -Infinity, tmax = -Infinity; for (const v of W) { const s = v[0] * ti.s[0] + v[1] * ti.s[1] + v[2] * ti.s[2] + ti.s[3], t = v[0] * ti.t[0] + v[1] * ti.t[1] + v[2] * ti.t[2] + ti.t[3]; smin = Math.min(smin, s); smax = Math.max(smax, s); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
      s0 = Math.floor(smin / 16); t0 = Math.floor(tmin / 16); lw = Math.ceil(smax / 16) - s0 + 1; lh = Math.ceil(tmax / 16) - t0 + 1; ls = [...ls.slice(0, 3), ti.s[3] / 16]; lt = [...lt.slice(0, 3), ti.t[3] / 16]; }
    if (lw <= 0 || lh <= 0 || lw > 512 || lh > 512) return null;
    return (j, x, y, h) => {
      const ss = Math.min(lw - 1, Math.max(0, Math.round(x * ls[0] + y * ls[1] + h * ls[2] + ls[3] - s0))), tt = Math.min(lh - 1, Math.max(0, Math.round(x * lt[0] + y * lt[1] + h * lt[2] + lt[3] - t0)));
      let lum; if (vbsp) { const o = f.lightOfs + (tt * lw + ss) * 4; if (o + 3 >= L.length) return; const e = 2 ** (L[o + 3] << 24 >> 24); lum = Math.pow(Math.min(1, (.3 * L[o] + .59 * L[o + 1] + .11 * L[o + 2]) * e / 255), 1 / 2.2); }
      else { const o = f.lightOfs + (tt * lw + ss) * 3; if (o + 2 >= L.length) return; lum = Math.pow((.3 * L[o] + .59 * L[o + 1] + .11 * L[o + 2]) / 255, .6) * 1.25; }
      if (lum > out[j]) out[j] = lum; }; });
  // Floors no face was found for (props, displacements): the mean of their lit neighbours, else 1.
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) { if (out[i * MAXF + k] >= 0) continue; let s = 0, m = 0; const h = z[i * MAXF + k];
    for (const j of [i - 1, i + 1, i - cols, i + cols]) { if (j < 0 || j >= N) continue; for (let q = 0; q < n[j]; q++) { const v = out[j * MAXF + q]; if (v >= 0 && Math.abs(z[j * MAXF + q] - h) < 24) { s += v; m++; } } }
    if (m) out[i * MAXF + k] = s / m; }
  for (let i = 0; i < out.length; i++) if (out[i] < 0) out[i] = 1;
  return out;
}

// Footstep surfaces, by their code in floorSurface's result (UNKNOWN: no face says — the map's own default).
export const SURFACES = ['concrete', 'metal', 'wood', 'grass', 'carpet'];
export const UNKNOWN = 255;
// A texture name or a Source $surfaceprop as a footstep surface. Hard floors named for their stone win over the
// ground they lie in ("stone_ground", "ground_tile"); dirt, sand, mud and gravel step like grass (soft).
export function surfaceOf(name) {
  const s = String(name || '').toLowerCase();
  if (/carpet|crpt|\brug|cloth|couch|bean_?bag|mattress/.test(s)) return 4;
  if (/metal|mtl|steel|iron|grate|grid|grt|vent|duct|pipe|chainlink|ladder|rust|ibeam|catwalk|truck|trailer|tank|tnk|crane|mplate|mwall/.test(s)) return 1;
  if (/wood|wd\d|plywood|plank|crate|crt|caja|pallet|barrel|bench|table|floorwd/.test(s)) return 2;
  if (/tile|stone|marble|cobble|brick|asphalt|concrete|conc|paver|plaster|rock|cement|floorst|curb|step|glass|porcelain/.test(s)) return 0;
  if (/grass|gras\b|sand|dirt|mud|earth|soil|gravel|foliage|snow|leaves|hay|nature|grnd|ground/.test(s)) return 3;
  return 0;
}
export function floorSurface(bsp, G, opts) {
  const { cols, rows, n, z } = G, N = cols * rows, out = new Uint8Array(N * MAXF).fill(UNKNOWN), near = new Float32Array(N * MAXF).fill(Infinity);
  const vbsp = bsp.format === 'vbsp', src = vbsp ? bsp.source : bsp; if (!src?.faces?.length) return null;
  // Per texture: [first, second] surface (the second only for terrain blending two materials).
  const kinds = new Map(), kindOf = ti => { const key = vbsp ? ti.texdata : ti.tex; let k = kinds.get(key); if (k) return k;
    if (!vbsp) { const t = src.textures[ti.tex], name = t?.name || ''; k = /^sky|^aaa|^clip|^null|^origin/i.test(name) ? null : [surfaceOf(name)];
      // Named only "ground": soft ground if it looks like earth, else (grey: asphalt, paving) hard.
      if (k?.[0] === 3 && !/grass|gras\b|sand|dirt|mud|earth|soil|gravel|snow|leaves|hay/i.test(name) && grey(t)) k = [0]; }
    else { const name = (src.texdata[ti.texdata]?.name || '').toLowerCase(), bytes = src.pak?.read?.('materials/' + name + '.vmt'); let kv = {}; try { if (bytes) kv = parseVmt(new TextDecoder().decode(bytes), p => src.pak.read(p)); } catch {}
      // No $surfaceprop of its own (a patched material whose original is in the game, not the map): its name; a blend
      // is named for both its materials ("…blend_groundgrass01-groundrock04").
      const parts = (name.split('/').pop().split('blend_')[1] || '').split('-');
      k = /^tools\//.test(name) ? null : [kv.$surfaceprop ? surfaceOf(kv.$surfaceprop) : surfaceOf(parts[0] || name), kv.$surfaceprop2 ? surfaceOf(kv.$surfaceprop2) : parts[1] ? surfaceOf(parts[1]) : null]; }
    kinds.set(key, k); return k; };
  const grids = new Map();
  floorHits(src, G, opts, (f, ti) => {
    const k = kindOf(ti); if (!k) return null;
    if (!(vbsp && f.disp >= 0)) return (j, x, y, h) => { const d = Math.abs(z[j] - h); if (d < near[j]) { near[j] = d; out[j] = k[0]; } };
    // Terrain: its real height and blend at the spot, from its grid (laid on its flat face: a parallelogram).
    let g = grids.get(f.disp); if (g === undefined) grids.set(f.disp, g = dispGrid(src, src.disps[f.disp])); if (!g) return null;
    const C = g.corners, ux = C[3][0] - C[0][0], uy = C[3][1] - C[0][1], vx = C[1][0] - C[0][0], vy = C[1][1] - C[0][1], det = ux * vy - uy * vx; if (Math.abs(det) < 1e-6) return null;
    return (j, x, y) => { const px = x - C[0][0], py = y - C[0][1], u = (px * vy - py * vx) / det, v = (ux * py - uy * px) / det; if (u < -.01 || u > 1.01 || v < -.01 || v > 1.01) return;
      const m = g.n - 1, cu = Math.min(m - 1e-6, Math.max(0, u * m)), cv = Math.min(m - 1e-6, Math.max(0, v * m)), c0 = cu | 0, r0 = cv | 0, fu = cu - c0, fv = cv - r0, P = g.pts;
      const at = (c, r, o) => P[(r * g.n + c) * 4 + o], bl = o => (at(c0, r0, o) * (1 - fu) + at(c0 + 1, r0, o) * fu) * (1 - fv) + (at(c0, r0 + 1, o) * (1 - fu) + at(c0 + 1, r0 + 1, o) * fu) * fv;
      const d = Math.abs(z[j] - bl(2)); if (d > 16 || d >= near[j]) return; near[j] = d; out[j] = k[1] != null && bl(3) >= 128 ? k[1] : k[0]; }; });
  // Floors no face was found for (props): their neighbours' at about the same height.
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N; i++) for (let k = 0; k < n[i]; k++) { if (out[i * MAXF + k] !== UNKNOWN) continue; const h = z[i * MAXF + k];
    found: for (const j of [i - 1, i + 1, i - cols, i + cols]) { if (j < 0 || j >= N) continue; for (let q = 0; q < n[j]; q++) { const v = out[j * MAXF + q]; if (v !== UNKNOWN && Math.abs(z[j * MAXF + q] - h) < 24) { out[i * MAXF + k] = v; break found; } } } }
  return out;
}

// Every upward-facing face of the world laid over the columns: `face(f, texinfo, corners)` gives what to do where one
// of its column floors is on it (or null to skip the face): called with the floor's index (column × MAXF + floor) and
// the spot (x, y, the face's height there). Terrain (a Source displacement) is matched on its flat face, loosely.
function floorHits(src, G, { x0, y1 }, face) {
  const { cols, rows, n, z } = G, P = src.planes, V = src.vertices;
  const verts = f => { const o = []; for (let i = 0; i < f.numEdges; i++) { const se = src.surfedges[f.firstEdge + i], e = Math.abs(se), v = src.edges[e * 2 + (se < 0 ? 1 : 0)]; o.push([V[v * 3], V[v * 3 + 1], V[v * 3 + 2]]); } return o; };
  const world = src.models[0];
  for (let fi = world.firstFace; fi < world.firstFace + world.numFaces; fi++) {
    const f = src.faces[fi], ti = src.texinfo[f.texinfo]; if (!ti) continue;
    const pl = f.plane * 4, sg = f.side ? -1 : 1, nz = P[pl + 2] * sg; if (nz < .6) continue;   // floors only (facing up)
    const W = verts(f); if (W.length < 3) continue; const nx = P[pl] * sg, ny = P[pl + 1] * sg, d = P[pl + 3] * sg;
    const hit = face(f, ti, W); if (!hit) continue;
    let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity; for (const v of W) { xa = Math.min(xa, v[0]); xb = Math.max(xb, v[0]); ya = Math.min(ya, v[1]); yb = Math.max(yb, v[1]); }
    const c0 = Math.max(0, Math.ceil((xa - x0) / CELL - .5)), c1 = Math.min(cols - 1, Math.floor((xb - x0) / CELL - .5)), r0 = Math.max(0, Math.ceil((y1 - yb) / CELL - .5)), r1 = Math.min(rows - 1, Math.floor((y1 - ya) / CELL - .5)), tol = f.disp >= 0 ? 96 : 6;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const i = r * cols + c; if (!n[i]) continue; const x = x0 + (c + .5) * CELL, y = y1 - (r + .5) * CELL;
      if (!inside(W, x, y)) continue; const h = (d - nx * x - ny * y) / nz;   // the face's height here
      for (let k = 0; k < n[i]; k++) if (Math.abs(z[i * MAXF + k] - h) <= tol) hit(i * MAXF + k, x, y, h); } }
}
// A texture stored in the map whose colours are grey on the whole (no tint of earth or grass).
function grey(t) { const px = t?.pixels && textureRGBA(t); if (!px) return false; let r = 0, g = 0, b = 0; for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; } const n = px.length / 4; return Math.max(r, g, b) / n - Math.min(r, g, b) / n < 12; }
function inside(W, x, y) { let c = false; for (let i = 0, j = W.length - 1; i < W.length; j = i++) { const a = W[i], b = W[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
