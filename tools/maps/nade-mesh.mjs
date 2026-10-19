// A CS2 map's grenade collision as a triangle mesh with its search tree, for the map file (import-cs2-map.mjs: the
// "nadeMesh" section; read by dist/nade-mesh.js): grenades bounce off CS2's real surfaces — thin walls, slanted roofs,
// rails and corners as they are — not off the 8-unit grid the players walk on.
//   buildNadeMesh(soup, sight) — soup: Float32Array, 9 per triangle (Hammer x y z × 3); sight: Uint8Array, 1 for a
//   triangle that also stops sight (a flash's light: not grenade clips, fences, grates or glass) → { info, buf }
// Stored quantized: every coordinate a Uint16 step across the mesh's bounds (an 8000-unit map: 0.12 units), the tree's
// boxes rounded outward (never smaller than what they hold). Tree: depth first — an inner node's left child is the next
// node, its right child's index is in links[2n] (links[2n + 1] = 0); a leaf holds links[2n + 1] triangles from
// links[2n] on. Up to LEAF triangles a leaf, split at the median along the longest side of the centres' box.
const LEAF = 4;
export function buildNadeMesh(soup, sight = null) {
  const T = soup.length / 9 | 0, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < T * 9; i++) { const a = i % 3, v = soup[i]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
  const o = lo.map(v => Math.floor(v) - 1), s = hi.map((v, a) => (Math.ceil(v) + 1 - o[a]) / 65535);
  const tmin = new Float32Array(T * 3), tmax = new Float32Array(T * 3), cen = new Float32Array(T * 3), idx = new Uint32Array(T);
  for (let t = 0; t < T; t++) { idx[t] = t; for (let a = 0; a < 3; a++) { const p = soup[t * 9 + a], q = soup[t * 9 + 3 + a], r = soup[t * 9 + 6 + a]; tmin[t * 3 + a] = Math.min(p, q, r); tmax[t * 3 + a] = Math.max(p, q, r); cen[t * 3 + a] = (p + q + r) / 3; } }
  // Quickselect: idx[l..r) arranged so the k-th by centre along axis a is at k, smaller before, larger after.
  const select = (l, r, k, a) => { r--; while (r > l) { const piv = cen[idx[(l + r) >> 1] * 3 + a]; let i = l, j = r;
      while (i <= j) { while (cen[idx[i] * 3 + a] < piv) i++; while (cen[idx[j] * 3 + a] > piv) j--; if (i <= j) { const t = idx[i]; idx[i] = idx[j]; idx[j] = t; i++; j--; } }
      if (k <= j) r = j; else if (k >= i) l = i; else return; } };
  const nb = [], nl = [];   // node boxes (6 floats each), links (2 each)
  const build = (l, r) => { const n = nl.length / 2; nl.push(0, 0); const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], c = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = l; i < r; i++) { const t = idx[i]; for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], tmin[t * 3 + a]); b[3 + a] = Math.max(b[3 + a], tmax[t * 3 + a]); c[a] = Math.min(c[a], cen[t * 3 + a]); c[3 + a] = Math.max(c[3 + a], cen[t * 3 + a]); } }
    nb.push(...b); if (r - l <= LEAF) { nl[n * 2] = l; nl[n * 2 + 1] = r - l; return n; }
    const ext = [c[3] - c[0], c[4] - c[1], c[5] - c[2]], a = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2, m = (l + r) >> 1; select(l, r, m, a);
    build(l, m); nl[n * 2] = build(m, r); nl[n * 2 + 1] = 0; return n; };
  // (iterative depth would be deeper than needed here: a median split of 800 000 triangles is 18 levels)
  build(0, T);
  const N = nl.length / 2, q = (v, a) => Math.max(0, Math.min(65535, Math.round((v - o[a]) / s[a])));
  const tri = new Uint16Array(T * 9); for (let i = 0; i < T; i++) { const t = idx[i]; for (let k = 0; k < 9; k++) tri[i * 9 + k] = q(soup[t * 9 + k], k % 3); }
  const box = new Uint16Array(N * 6); for (let n = 0; n < N; n++) for (let a = 0; a < 3; a++) { box[n * 6 + a] = Math.max(0, Math.min(65535, Math.floor((nb[n * 6 + a] - o[a]) / s[a]))); box[n * 6 + 3 + a] = Math.max(0, Math.min(65535, Math.ceil((nb[n * 6 + 3 + a] - o[a]) / s[a]))); }
  const links = Uint32Array.from(nl), pad = b => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]), see = new Uint8Array(T); for (let i = 0; i < T; i++) see[i] = sight ? sight[idx[i]] : 1;
  const buf = Buffer.concat([pad(Buffer.from(tri.buffer)), pad(Buffer.from(box.buffer)), Buffer.from(links.buffer), pad(Buffer.from(see.buffer))]);   // (then a byte a triangle: stops sight)
  return { info: { o, s, tris: T, nodes: N, sight: true, bytes: buf.length }, buf };
}
// Where a CS2M file's known sections end (its header's sizes): what follows is an older nadeMesh section, if any.
export function cs2mBodyEnd(file) {
  const hl = file.readUInt32LE(8), H = JSON.parse(file.subarray(12, 12 + hl).toString()), S = H.sizes, p4 = n => n + (4 - n % 4) % 4;
  let o = 12 + p4(hl); for (const g of [S.players, S.nades]) o += g[0] * 4 + p4(g[1] * 2);
  if (S.surfaces) o += p4(S.surfaces); if (S.bullets) o += S.bullets[0] * 4 + p4(S.bullets[1] * 2) + p4(S.bullets[2]);
  return { header: H, end: o };
}
