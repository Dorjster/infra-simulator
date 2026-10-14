// Draws a Source map (vbsp.js) as it was lit: its brush faces and displacements (terrain) with the textures packed in
// the map (vtf.js: DXT straight to the GPU), the baked light (lightmaps, RGB × 2^exponent) in one atlas, and the
// two-texture blend of its terrain materials (WorldVertexTransition: by each displacement vertex's alpha). One merged
// mesh per material. Faces outside the play area (the 3D sky box's miniature) and tool / sky faces are left out.
// Props: vbsp-props-mesh.js. Hammer units → game units by `toGame` (the same frame as the collision columns).
import * as THREE from './three.module.js';
import { faceVerts, dispGrid, SURF, playBounds } from './vbsp.js';
import { parseVtf, parseVmt, decodeDxt } from './vtf.js';

const HIDDEN = /^tools\/|^(effects\/(trainsky|skybox))|skybox/;
const DRAWN = /^func_(brush|wall|wall_toggle|breakable|breakable_surf|door|door_rotating|illusionary|movelinear|rotating|button|tracktrain|lod)$|^prop_dynamic$/;
const FORMATS = { dxt1: THREE.RGB_S3TC_DXT1_Format, dxt1a: THREE.RGBA_S3TC_DXT1_Format, dxt3: THREE.RGBA_S3TC_DXT3_Format, dxt5: THREE.RGBA_S3TC_DXT5_Format };

// A loader of the map's textures and materials, shared by the world and the props: path → THREE.Texture (null if none).
export function vbspTextures(bsp, renderer) {
  const s3tc = !!renderer?.extensions?.has?.('WEBGL_compressed_texture_s3tc'), cache = new Map(), vmts = new Map(), read = n => bsp.pak.read(n);
  const texture = (path, srgb = true) => { path = String(path || '').toLowerCase().replace(/\\/g, '/').replace(/\.vtf$/, ''); if (!path) return null; const key = path + (srgb ? '' : ':lin'); if (cache.has(key)) return cache.get(key);
    let tx = null; const v = bsp.vtfs?.get(path) || parseVtf(read('materials/' + path + '.vtf'));   /* compacted maps keep their textures already read (vbsp-compact.js) */
    if (v) { if (v.format !== 'rgba' && s3tc) { tx = new THREE.CompressedTexture(v.mips.map(m => ({ data: m.data, width: m.width, height: m.height })), v.width, v.height, FORMATS[v.format]); tx.minFilter = v.mips.length > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; }
      else { const m = v.mips[0], data = v.format === 'rgba' ? m.data : decodeDxt(m.data, m.width, m.height, v.format); tx = new THREE.DataTexture(data, m.width, m.height, THREE.RGBAFormat); tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; }
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.magFilter = THREE.LinearFilter; tx.anisotropy = 8; tx.flipY = false; tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; tx.userData.alpha = v.alpha; tx.needsUpdate = true;
      if (!bsp.vtfs?.has(path)) tx.onUpdate = () => { if (tx.mipmaps) for (const m of tx.mipmaps) m.data = null; else if (tx.image) tx.image.data = null; };   /* on the GPU: the bytes stay in the map file only (a compacted map's kept copy is reused on the next visit) */
    }
    cache.set(key, tx); return tx; };
  const material = path => { path = String(path || '').toLowerCase().replace(/\\/g, '/'); if (!/\.vmt$/.test(path)) path = 'materials/' + path + '.vmt'; if (vmts.has(path)) return vmts.get(path);
    const b = read(path), kv = b ? parseVmt(new TextDecoder().decode(b), read) : null; vmts.set(path, kv); return kv; };
  return { texture, material, all: () => [...cache.values()].filter(Boolean), dispose() { for (const t of cache.values()) t?.dispose(); cache.clear(); } };
}

export function buildVbspMeshes(bsp, { toGame, renderer, textures = vbspTextures(bsp, renderer), lightScale = 1, lightGamma = 1 / 2.2, bounds = playBounds(bsp) } = {}) {
  // 1. Which faces: the world's and the drawn brush entities' (moved by their origin), inside the play area.
  const items = [], inArea = (x, y) => x >= bounds[0] - 256 && x <= bounds[2] + 256 && y >= bounds[1] - 256 && y <= bounds[3] + 256;
  const addModel = (mi, off) => { const m = bsp.models[mi]; if (m) for (let f = m.firstFace; f < m.firstFace + m.numFaces; f++) items.push({ f, off }); };
  addModel(0, [0, 0, 0]); for (const e of bsp.entities) { const mi = /^\*\d+$/.test(e.model || '') ? +e.model.slice(1) : -1; if (mi > 0 && DRAWN.test(e.classname || '') && e.rendermode !== '10') addModel(mi, (e.origin || '0 0 0').split(/\s+/).map(Number)); }
  // 2. Each face's material, geometry source and lightmap rectangle.
  const faces = [], rects = [];
  for (const it of items) { const f = bsp.faces[it.f], ti = bsp.texinfo[f.texinfo]; if (!ti || ti.flags & (SURF.SKY | SURF.SKY2D | SURF.NODRAW | SURF.HINT | SURF.SKIP)) continue;
    const td = bsp.texdata[ti.texdata]; if (!td || HIDDEN.test(td.name)) continue;
    let V, grid = null; if (f.disp >= 0) { grid = dispGrid(bsp, bsp.disps[f.disp]); if (!grid) continue; V = grid.corners; } else { V = faceVerts(bsp, f); if (V.length < 3) continue; }
    let cx = 0, cy = 0; for (const v of V) { cx += v[0]; cy += v[1]; } if (!inArea(cx / V.length + it.off[0], cy / V.length + it.off[1])) continue;
    const w = f.lmSize[0] + 1, h = f.lmSize[1] + 1, lit = !(ti.flags & SURF.NOLIGHT) && f.lightOfs >= 0 && f.styles[0] !== 255 && w > 0 && h > 0 && w <= 512 && h <= 512;
    const r = { it, f, ti, td, V, grid, lit, w, h }; faces.push(r); if (lit) rects.push(r); }
  // 3. Lightmap atlas (tallest first, shelves, a luxel of border). Light: (r, g, b) × 2^exponent, linear → gamma for an sRGB texture.
  rects.sort((a, b) => b.h - a.h); let AW = 2048; const pack = W => { let x = 0, y = 0, sh = 0; for (const r of rects) { if (x + r.w + 2 > W) { x = 0; y += sh; sh = 0; } r.ax = x + 1; r.ay = y + 1; x += r.w + 2; sh = Math.max(sh, r.h + 2); } return y + sh; };
  let AH = pack(AW); while (AH > AW && AW < 8192) { AW *= 2; AH = pack(AW); } AH = 2 ** Math.ceil(Math.log2(Math.max(1, AH)));
  const atlas = new Uint8Array(AW * AH * 4), L = bsp.lighting, EXP = new Float32Array(256).map((_, e) => 2 ** ((e << 24 >> 24))), lin = v => Math.min(255, Math.round(255 * Math.pow(Math.min(1, v * lightScale / 255), lightGamma)));
  for (const r of rects) { const base = r.f.lightOfs; for (let y = -1; y <= r.h; y++) for (let x = -1; x <= r.w; x++) { const sx = Math.min(r.w - 1, Math.max(0, x)), sy = Math.min(r.h - 1, Math.max(0, y)), o = base + (sy * r.w + sx) * 4; if (o + 3 >= L.length) continue;
      const e = EXP[L[o + 3]], q = ((r.ay + y) * AW + r.ax + x) * 4; atlas[q] = lin(L[o] * e); atlas[q + 1] = lin(L[o + 1] * e); atlas[q + 2] = lin(L[o + 2] * e); atlas[q + 3] = 255; } }
  const GREY = [AW - 1, AH - 1]; { const q = (GREY[1] * AW + GREY[0]) * 4; atlas[q] = atlas[q + 1] = atlas[q + 2] = 170; atlas[q + 3] = 255; }
  const lightTex = new THREE.DataTexture(atlas, AW, AH, THREE.RGBAFormat); lightTex.colorSpace = THREE.SRGBColorSpace; lightTex.magFilter = lightTex.minFilter = THREE.LinearFilter; lightTex.flipY = false; lightTex.channel = 1; lightTex.needsUpdate = true; lightTex.onUpdate = () => { lightTex.image.data = null; };
  // 4. Geometry per material: positions, normals, texture uv, lightmap uv, blend (the second texture's share).
  const groups = new Map(), P3 = [0, 0, 0];
  for (const r of faces) { const key = r.td.name; let G = groups.get(key); if (!G) groups.set(key, G = { name: r.td.name, td: r.td, P: [], N: [], UV: [], UV2: [], A: [], blend: false });
    const { ti, td, f, off } = { ...r, off: r.it.off }, uv = p => [(p[0] * ti.s[0] + p[1] * ti.s[1] + p[2] * ti.s[2] + ti.s[3]) / (td.width || 128), (p[0] * ti.t[0] + p[1] * ti.t[1] + p[2] * ti.t[2] + ti.t[3]) / (td.height || 128)];
    const lm = p => r.lit ? [(r.ax + (p[0] * ti.ls[0] + p[1] * ti.ls[1] + p[2] * ti.ls[2] + ti.ls[3] - f.lmMins[0]) + .5) / AW, (r.ay + (p[0] * ti.lt[0] + p[1] * ti.lt[1] + p[2] * ti.lt[2] + ti.lt[3] - f.lmMins[1]) + .5) / AH] : [(GREY[0] + .5) / AW, (GREY[1] + .5) / AH];
    const put = (p, flat, n, a) => { const g = toGame(p[0] + off[0], p[1] + off[1], p[2] + off[2]); G.P.push(g[0], g[1], g[2]); G.N.push(n[0], n[2], -n[1]); const t = uv(flat), l = lm(flat); G.UV.push(t[0], t[1]); G.UV2.push(l[0], l[1]); G.A.push(a); };
    if (r.grid) { const { n, pts, flat } = r.grid; G.blend = true; const nrm = (i, out) => { const c = i % n, rr = (i / n) | 0, at = (cc, r2) => { cc = Math.max(0, Math.min(n - 1, cc)); r2 = Math.max(0, Math.min(n - 1, r2)); return (r2 * n + cc) * 4; }, a = at(c - 1, rr), b = at(c + 1, rr), u = at(c, rr - 1), d = at(c, rr + 1);
        const ex = pts[b] - pts[a], ey = pts[b + 1] - pts[a + 1], ez = pts[b + 2] - pts[a + 2], fx = pts[d] - pts[u], fy = pts[d + 1] - pts[u + 1], fz = pts[d + 2] - pts[u + 2]; let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const l = Math.hypot(nx, ny, nz) || 1; if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } out[0] = nx / l; out[1] = ny / l; out[2] = nz / l; return out; };
      const vtx = i => { const p = [pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2]], fl = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]]; put(p, fl, nrm(i, [0, 0, 0]), pts[i * 4 + 3] / 255); };
      // Winding: the grid's first triangle against its face's normal (the grid runs either way round).
      const pl = f.plane * 4, sg = f.side ? -1 : 1, fx = bsp.planes[pl] * sg, fy = bsp.planes[pl + 1] * sg, fz = bsp.planes[pl + 2] * sg, F = (i, k) => flat[i * 3 + k];
      const ux = F(1, 0) - F(0, 0), uy = F(1, 1) - F(0, 1), uz = F(1, 2) - F(0, 2), vx = F(n, 0) - F(0, 0), vy = F(n, 1) - F(0, 1), vz = F(n, 2) - F(0, 2), flip = ((uy * vz - uz * vy) * fx + (uz * vx - ux * vz) * fy + (ux * vy - uy * vx) * fz) < 0;   // the first triangle faces away from the face's front: wind the other way
      for (let rr = 0; rr + 1 < n; rr++) for (let c = 0; c + 1 < n; c++) { const a = rr * n + c, b = a + 1, cc = a + n, dd = cc + 1, tris = (rr + c) % 2 ? [a, b, dd, a, dd, cc] : [a, b, cc, b, dd, cc]; for (let k = 0; k < 6; k += 3) { if (flip) { vtx(tris[k]); vtx(tris[k + 2]); vtx(tris[k + 1]); } else { vtx(tris[k]); vtx(tris[k + 1]); vtx(tris[k + 2]); } } } }
    else { const pl = f.plane * 4, sg = f.side ? -1 : 1, n = [bsp.planes[pl] * sg, bsp.planes[pl + 1] * sg, bsp.planes[pl + 2] * sg]; for (let j = 1; j + 1 < r.V.length; j++) for (const k of [0, j + 1, j]) put(r.V[k], r.V[k], n, 0); } }   // fan, wound for three.js (Source winds clockwise seen from the front)
  // 5. Materials (unlit: the light is baked).
  const meshes = [], mats = [];
  for (const G of groups.values()) { if (!G.P.length) continue; const kv = textures.material(G.name) || {}, sh = kv.shader || '', water = sh === 'water';
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(G.N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(G.UV, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(G.UV2, 2));
    const map = water ? null : textures.texture(kv['$basetexture']), map2 = G.blend && kv['$basetexture2'] ? textures.texture(kv['$basetexture2']) : null; if (map2) g.setAttribute('blend', new THREE.Float32BufferAttribute(G.A, 1));
    g.computeBoundingSphere(); for (const a of Object.values(g.attributes)) a.onUpload(releaseArray);
    const translucent = kv['$translucent'] === '1' || water, alphaTest = kv['$alphatest'] === '1', unlit = sh === 'unlitgeneric';
    const m = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : water ? 0x1d3b44 : 0x9a9a92, lightMap: unlit ? null : lightTex, lightMapIntensity: Math.PI, transparent: translucent, opacity: water ? .78 : 1, alphaTest: alphaTest ? .5 : 0, side: translucent || alphaTest || kv['$nocull'] === '1' ? THREE.DoubleSide : THREE.FrontSide, depthWrite: !translucent || alphaTest });
    if (map2) blendWith(m, map2);
    const mesh = new THREE.Mesh(g, m); mesh.userData.arena = true; mesh.userData.bsp = true; mesh.userData.noShadow = true; mesh.castShadow = mesh.receiveShadow = false; meshes.push(mesh); mats.push(m); }
  return { meshes, textures, atlas: { width: AW, height: AH, faces: rects.length } };
}
function releaseArray() { this.array = null; }
// WorldVertexTransition: the second texture over the first by the vertex's blend value.
function blendWith(m, map2) { m.userData.map2 = map2; m.onBeforeCompile = sh => { sh.uniforms.map2 = { value: map2 };
  sh.vertexShader = 'attribute float blend;\nvarying float vBlend;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend;');
  sh.fragmentShader = 'uniform sampler2D map2;\nvarying float vBlend;\n' + sh.fragmentShader.replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = mix(texture2D(map, vMapUv), texture2D(map2, vMapUv), clamp(vBlend, 0.0, 1.0));\ndiffuseColor *= sampledDiffuseColor;'); };
  m.customProgramCacheKey = () => 'wvt'; }
