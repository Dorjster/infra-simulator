// Draws a Source map's static props (vbsp.js + vbsp-props.js): one THREE.BatchedMesh per material (one draw call,
// each prop culled on its own), every prop placed by its origin / angles / scale, tinted by the light the map baked
// where it stands (the leaf ambient light: the average of the cube of colours nearest its origin), so a pillar in the
// shade is as dark as the wall beside it. The ambient samples are stored at another scale than the lightmaps (CS:GO
// maps: ~2^6 dimmer), so they are matched to them by their medians — props as bright as the walls round them.
// Props outside the play area are left out. Heavy models get two coarser copies (vertex clustering: ~1/4 and ~1/12 of
// the triangles) swapped in by distance, and a prop past its own fade distance (set in the map) is not drawn — checked
// just before each batch draws, one distance per prop, nothing allocated.
const LOD_AT = [700 / 6.5, 1600 / 6.5], FOLIAGE_FADE = 1800 / 6.5;   // game units (6.5 Hammer units each); foliage (alpha-tested: costly to draw) fades by 1 800 Hammer units at most
import * as THREE from './three.module.js';
import { loadModel, propMatrix } from './vbsp-props.js';
import { playBounds } from './vbsp.js';

export function buildVbspProps(bsp, { toGame, textures, bounds = playBounds(bsp), lightScale = 1, lightGamma = 1 / 2.2 } = {}) {
  const inArea = p => p.origin[0] >= bounds[0] - 512 && p.origin[0] <= bounds[2] + 512 && p.origin[1] >= bounds[1] - 512 && p.origin[1] <= bounds[3] + 512;
  // Hammer units → game units as a matrix (toGame is affine: x east, z up → y up, y north → −z).
  const o = toGame(0, 0, 0), ax = toGame(1, 0, 0), ay = toGame(0, 1, 0), az = toGame(0, 0, 1), G = new THREE.Matrix4().set(ax[0] - o[0], ay[0] - o[0], az[0] - o[0], o[0], ax[1] - o[1], ay[1] - o[1], az[1] - o[1], o[1], ax[2] - o[2], ay[2] - o[2], az[2] - o[2], o[2], 0, 0, 0, 1);
  const models = new Map(), byMat = new Map(), placed = [], k = ambientScale(bsp) * lightScale;
  for (const p of bsp.props) { if (!inArea(p)) continue; if (!models.has(p.model)) models.set(p.model, loadModel(bsp.pak, bsp.propModels[p.model])); const m = models.get(p.model); if (!m) continue;
    const T = propMatrix(p), M = new THREE.Matrix4().set(T[0], T[1], T[2], T[3], T[4], T[5], T[6], T[7], T[8], T[9], T[10], T[11], 0, 0, 0, 1).premultiply(G);
    placed.push({ p, m, M, tint: ambientAt(bsp, p.origin).map(v => Math.min(1.5, v * k / 255)) });
    m.lods[0].forEach((mesh, k) => { let B = byMat.get(mesh.material); if (!B) byMat.set(mesh.material, B = { geoms: new Map(), verts: 0, idx: 0, count: 0 }); const key = p.model + ':' + k;
      if (!B.geoms.has(key)) { const levels = [mesh]; if (mesh.idx.length / 3 > 800) levels.push(cluster(mesh, 36), cluster(mesh, 14)); B.geoms.set(key, { levels, ids: [] }); for (const l of levels) { B.verts += l.pos.length / 3; B.idx += l.idx.length; } } B.count++; }); }
  const meshes = [], tmp = new THREE.Color(); let tris = 0;
  for (const [path, B] of byMat) {
    const kv = textures.material(path) || {}, map = textures.texture(kv['$basetexture']), translucent = kv['$translucent'] === '1', alphaTest = kv['$alphatest'] === '1' || (translucent && /foliage|leaf|leaves|grass|plant|vine|fern|bush|tree/.test(path));
    const mat = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0x8a8a84, alphaTest: alphaTest ? .5 : 0, transparent: translucent && !alphaTest, side: alphaTest || kv['$nocull'] === '1' ? THREE.DoubleSide : THREE.FrontSide, depthWrite: !(translucent && !alphaTest) });
    const batch = new THREE.BatchedMesh(B.count, B.verts, B.idx, mat); batch.perObjectFrustumCulled = true; batch.sortObjects = false;
    for (const g of B.geoms.values()) { for (const l of g.levels) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(l.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(l.nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(l.uv, 2)); geo.setIndex(new THREE.BufferAttribute(l.idx, 1)); g.ids.push(batch.addGeometry(geo)); } g.tris = g.levels[0].idx.length / 3; }
    const inst = [];   // [instance id, x, y, z (game units), fade distance², level ids…]
    for (const P of placed) P.m.lods[0].forEach((mesh, k) => { if (mesh.material !== path) return; const g = B.geoms.get(P.p.model + ':' + k), id = batch.addInstance(g.ids[0]); batch.setMatrixAt(id, P.M); batch.setColorAt(id, tmp.setRGB(P.tint[0], P.tint[1], P.tint[2]));   /* linear, like the lightmaps the walls get */
      const fade = Math.min(P.p.fadeMax > 0 ? P.p.fadeMax / 6.5 * 1.25 : Infinity, alphaTest ? FOLIAGE_FADE : Infinity), fadeOk = Number.isFinite(fade) ? fade : 0; inst.push({ id, x: P.M.elements[12], y: P.M.elements[13], z: P.M.elements[14], fade2: fadeOk * fadeOk, ids: g.ids, cur: 0, vis: true }); tris += g.tris; });
    // Before each draw: the level of detail by distance, hidden past the fade distance.
    batch.onBeforeRender = (r, sc, cam) => { const cx = cam.matrixWorld.elements[12], cy = cam.matrixWorld.elements[13], cz = cam.matrixWorld.elements[14];
      for (let i = 0; i < inst.length; i++) { const I = inst[i], dx = I.x - cx, dy = I.y - cy, dz = I.z - cz, d2 = dx * dx + dy * dy + dz * dz, vis = !I.fade2 || d2 < I.fade2;
        if (vis !== I.vis) { batch.setVisibleAt(I.id, vis); I.vis = vis; } if (!vis || I.ids.length < 2) continue;
        const lv = d2 > LOD_AT[1] * LOD_AT[1] ? 2 : d2 > LOD_AT[0] * LOD_AT[0] ? 1 : 0; if (lv !== I.cur) { batch.setGeometryIdAt(I.id, I.ids[lv]); I.cur = lv; } } };
    batch.userData.arena = true; batch.userData.bsp = true; batch.userData.noShadow = true; batch.castShadow = batch.receiveShadow = false; meshes.push(batch); }
  return { meshes, props: placed.length, materials: byMat.size, tris };
}

// The baked ambient light at a point (the leaf it is in: its nearest ambient sample, the cube's six colours averaged),
// linear, on the samples' own scale; [255, 255, 255] (unchanged) where there is none.
function ambientAt(bsp, at) {
  const A = bsp.ambient; if (!A) return [255, 255, 255];
  const { planes, nodes } = bsp; let n = bsp.models[0].head; while (n >= 0) { const p = nodes[n * 3] * 4; n = planes[p] * at[0] + planes[p + 1] * at[1] + planes[p + 2] * (at[2] + 24) - planes[p + 3] >= 0 ? nodes[n * 3 + 1] : nodes[n * 3 + 2]; }
  const leaf = -(n + 1), cnt = A.index[leaf * 2], first = A.index[leaf * 2 + 1]; if (!cnt) return [255, 255, 255];
  const s = A.samples, o = first * 28, c = [0, 0, 0]; for (let k = 0; k < 6; k++) { const e = 2 ** (s[o + k * 4 + 3] << 24 >> 24); for (let j = 0; j < 3; j++) c[j] += s[o + k * 4 + j] * e / 6; } return c;
}
// How much brighter the lightmaps are than the ambient samples (their medians).
function ambientScale(bsp) {
  const med = a => { a.sort((x, y) => x - y); return a[a.length >> 1] || 1; }, L = bsp.lighting, lm = [], am = [];
  for (let o = 0; o + 3 < L.length; o += 4 * 37) lm.push(Math.max(L[o], L[o + 1], L[o + 2]) * 2 ** (L[o + 3] << 24 >> 24));
  const A = bsp.ambient; if (A) for (let o = 0; o + 27 < A.samples.length; o += 28 * 3) { let v = 0; for (let k = 0; k < 6; k++) v += Math.max(A.samples[o + k * 4], A.samples[o + k * 4 + 1], A.samples[o + k * 4 + 2]) * 2 ** (A.samples[o + k * 4 + 3] << 24 >> 24) / 6; am.push(v); }
  return am.length ? med(lm) / med(am) : 1;
}

// A coarser copy of a mesh by vertex clustering: positions snapped to a grid of (its size / div) cells, one vertex per
// occupied cell (the first one's normal and uv), triangles that collapse dropped.
function cluster(mesh, div) {
  const P = mesh.pos, n = P.length / 3; let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z; }
  const cell = Math.max(x1 - x0, y1 - y0, z1 - z0) / div || 1, map = new Map(), remap = new Int32Array(n), pos = [], nrm = [], uv = [];
  for (let i = 0; i < n; i++) { const k = Math.floor((P[i * 3] - x0) / cell) + Math.floor((P[i * 3 + 1] - y0) / cell) * 4096 + Math.floor((P[i * 3 + 2] - z0) / cell) * 16777216; let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nrm.push(mesh.nrm[i * 3], mesh.nrm[i * 3 + 1], mesh.nrm[i * 3 + 2]); uv.push(mesh.uv[i * 2], mesh.uv[i * 2 + 1]); } remap[i] = j; }
  const I = mesh.idx, idx = []; for (let t = 0; t < I.length; t += 3) { const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  if (!idx.length) idx.push(0, 0, 0);
  return { material: mesh.material, pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), idx: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
