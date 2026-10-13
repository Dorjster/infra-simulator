// Reads Source engine models (static props packed in a map, vbsp.js): .mdl (header, materials, body parts, meshes),
// .vvd (vertices: position, normal, uv; fixups per level of detail) and .dx90.vtx (triangle lists per level of
// detail). loadModel(pak, path) → { hull, lods: [[{ material, pos, nrm, uv, idx }]] } — lods[0] the finest, the last
// the coarsest (used for collision). Materials are resolved to their .vmt paths in the pack (texture directories).
export function loadModel(pak, path) {
  const mdl = pak.read(path), base = path.replace(/\.mdl$/i, ''), vvd = pak.read(base + '.vvd'), vtx = pak.read(base + '.dx90.vtx') || pak.read(base + '.vtx');
  if (!mdl || !vvd || !vtx) return null;
  const M = new DataView(mdl.buffer, mdl.byteOffset, mdl.byteLength), D = new DataView(vvd.buffer, vvd.byteOffset, vvd.byteLength), X = new DataView(vtx.buffer, vtx.byteOffset, vtx.byteLength);
  if (M.getUint32(0, true) !== 0x54534449 || D.getUint32(0, true) !== 0x56534449) return null;   // 'IDST', 'IDSV'
  const i32 = (V, o) => V.getInt32(o, true), f32 = (V, o) => V.getFloat32(o, true), u16 = (V, o) => V.getUint16(o, true);
  const str = (V, o) => { let s = ''; for (let k = 0; o + k < V.byteLength && k < 256; k++) { const c = V.getUint8(o + k); if (!c) break; s += String.fromCharCode(c); } return s; };
  const version = i32(M, 4), hull = [f32(M, 104), f32(M, 108), f32(M, 112), f32(M, 116), f32(M, 120), f32(M, 124)];
  // Materials: texture names, the directories they are in, skin family 0.
  const nTex = i32(M, 204), texAt = i32(M, 208), nDir = i32(M, 212), dirAt = i32(M, 216), nRef = i32(M, 220), skinAt = i32(M, 228);
  const texNames = []; for (let t = 0; t < nTex; t++) { const o = texAt + t * 64; texNames.push(str(M, o + i32(M, o)).toLowerCase().replace(/\\/g, '/')); }
  const dirs = []; for (let d = 0; d < nDir; d++) dirs.push(str(M, i32(M, dirAt + d * 4)).toLowerCase().replace(/\\/g, '/'));
  const skin = []; for (let r = 0; r < nRef; r++) skin.push(u16(M, skinAt + r * 2));
  const material = m => { const name = texNames[skin[m] ?? m] || texNames[m] || ''; for (const d of dirs.length ? dirs : ['']) { const p = ('materials/' + d + '/' + name).replace(/\/+/g, '/') + '.vmt'; if (pak.has(p)) return p; } return ('materials/' + (dirs[0] || '') + '/' + name).replace(/\/+/g, '/') + '.vmt'; };
  // Vertices (48 bytes each: weights, bones, position, normal, uv) for a level of detail, after its fixups.
  const numLODs = i32(D, 12), nFix = i32(D, 48), fixAt = i32(D, 52), vAt = i32(D, 56);
  const vertsFor = lod => { if (!nFix) return null; const list = []; for (let k = 0; k < nFix; k++) { const o = fixAt + k * 12; if (i32(D, o) >= lod) list.push([i32(D, o + 4), i32(D, o + 8)]); } return list; };
  const vertex = (table, i) => { if (table) { for (const [s, n] of table) { if (i < n) return s + i; i -= n; } return -1; } return i; };
  // Meshes from the .mdl (per body part, model 0): material, first vertex.
  const nBody = i32(M, 232), bodyAt = i32(M, 236), meshesMdl = [];
  for (let b = 0; b < nBody; b++) { const bo = bodyAt + b * 16, nm = i32(M, bo + 4), mo = bo + i32(M, bo + 12); const list = [];
    for (let m = 0; m < nm; m++) { const mdo = mo + m * 148, nMesh = i32(M, mdo + 72), meshAt = mdo + i32(M, mdo + 76), vIndex = i32(M, mdo + 84) / 48; const meshes = [];
      for (let k = 0; k < nMesh; k++) { const mo2 = meshAt + k * 116; meshes.push({ material: i32(M, mo2), vertexOffset: i32(M, mo2 + 12), base: vIndex }); } list.push(meshes); }
    meshesMdl.push(list); }
  // Triangles from the .vtx: body part → model → LOD → mesh → strip groups (index lists into their vertices, which
  // point at the mesh's own vertices). CS:GO's strip-group headers are 8 bytes longer; tried both, checked by range.
  const vtxBody = i32(X, 28), vtxBodyAt = i32(X, 32), lodCount = Math.max(1, Math.min(i32(X, 20), numLODs || 1));
  const lods = []; for (let L = 0; L < lodCount; L++) lods.push([]);
  const tryGroups = (sgAt, nSg, sz) => { const out = []; for (let g = 0; g < nSg; g++) { const go = sgAt + g * sz; if (go + 25 > X.byteLength) return null; const nV = i32(X, go), vo = go + i32(X, go + 4), nI = i32(X, go + 8), io = go + i32(X, go + 12);
      if (nV < 0 || nI < 0 || vo + nV * 9 > X.byteLength || io + nI * 2 > X.byteLength) return null; const verts = new Uint16Array(nV); for (let v = 0; v < nV; v++) verts[v] = u16(X, vo + v * 9 + 4);
      const idx = new Uint16Array(nI); for (let k = 0; k < nI; k++) { idx[k] = u16(X, io + k * 2); if (idx[k] >= nV) return null; } out.push({ verts, idx }); } return out; };
  let sgSize = version >= 49 ? 33 : 25;
  for (let b = 0; b < Math.min(vtxBody, meshesMdl.length); b++) { const bo = vtxBodyAt + b * 8, mo = bo + i32(X, bo + 4);
    const md = mo, nl = Math.min(i32(X, md), lodCount), lo = md + i32(X, md + 4);   // model 0 of the body part
    for (let L = 0; L < nl; L++) { const lho = lo + L * 12, nMesh = i32(X, lho), meshAt = lho + i32(X, lho + 4), table = vertsFor(L);
      for (let k = 0; k < nMesh; k++) { const mho = meshAt + k * 9, nSg = i32(X, mho), sgAt = mho + i32(X, mho + 4), mm = meshesMdl[b][0]?.[k]; if (!mm || !nSg) continue;
        let groups = tryGroups(sgAt, nSg, sgSize); if (!groups) { sgSize = sgSize === 33 ? 25 : 33; groups = tryGroups(sgAt, nSg, sgSize); } if (!groups) continue;
        const pos = [], nrm = [], uv = [], idx = []; let n0 = 0;
        for (const G of groups) { for (let v = 0; v < G.verts.length; v++) { const vi = vertex(table, mm.base + mm.vertexOffset + G.verts[v]), o = vAt + vi * 48; if (vi < 0 || o + 48 > D.byteLength) { pos.push(0, 0, 0); nrm.push(0, 0, 1); uv.push(0, 0); continue; }
            pos.push(f32(D, o + 16), f32(D, o + 20), f32(D, o + 24)); nrm.push(f32(D, o + 28), f32(D, o + 32), f32(D, o + 36)); uv.push(f32(D, o + 40), f32(D, o + 44)); }
          for (let t = 0; t + 2 < G.idx.length; t += 3) idx.push(n0 + G.idx[t], n0 + G.idx[t + 2], n0 + G.idx[t + 1]); n0 += G.verts.length; }   // Source winds clockwise
        lods[L].push({ material: material(mm.material), pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), idx: n0 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) }); } } }
  while (lods.length > 1 && !lods[lods.length - 1].length) lods.pop();
  return lods[0]?.length ? { hull, lods } : null;
}
// A prop's placement (Source angles: pitch about y, yaw about z, roll about x; applied roll, pitch, yaw), as a 3×4
// row-major matrix (Hammer units) with its scale.
export function propMatrix(p) {
  const d = Math.PI / 180, [pi, ya, ro] = p.angles.map(a => a * d), s = p.scale || 1, cp = Math.cos(pi), sp = Math.sin(pi), cy = Math.cos(ya), sy = Math.sin(ya), cr = Math.cos(ro), sr = Math.sin(ro);
  // Columns: forward (x), left (y), up (z) — Source's AngleMatrix.
  return [cp * cy * s, (sr * sp * cy - cr * sy) * s, (cr * sp * cy + sr * sy) * s, p.origin[0],
          cp * sy * s, (sr * sp * sy + cr * cy) * s, (cr * sp * sy - sr * cy) * s, p.origin[1],
          -sp * s, sr * cp * s, cr * cp * s, p.origin[2]];
}
