// Browser side of tools/import-cs2-models.mjs (runs in Chrome with three.js' loaders and exporter): reads one
// downloaded model (glTF binary or FBX), tells what it is from the names Counter-Strike 2 gives its meshes and
// bones, and converts it:
//  · guns, knives, the bomb and the defuse kit → the game's compact model (weapon-models.js loadReal): one part,
//    pose baked, centimetres, y up, muzzle / blade along −z, plus base / normal / ORM pictures (JPEG, 2048 px: the game
//    takes the size its texture quality asks for);
//  · agents (player characters) → a .glb with one skeleton (CS2's bone names, dist/cs2-agents.js drives it) and its
//    pictures at 2048 px;
//  · the karambit first-person model (arms, gloves, knife) → a .glb with one skeleton, untextured (the game paints it);
//  · first-person rifle animations (arms on a Rigify rig holding CS2's M4A1-S: Equip, Inspect, Reload, Shots…, the gun
//    on weapon_hand_r) → a .glb with the arms, the gun (plain: only its shape is used), the bones and the clips;
//  · gloves (CS2's characters/models/shared/arms/glove_*) → a .glb: both hands on CS2's arm bones, with its pictures
//    (the game moves it onto its first-person arms, dist/fp-view.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// CS2's weapon class names → the game's weapon ids.
const VALVE = { glock18: 'pistol', usp_silencer: 'usps', hkp2000: 'p2000', p250: 'p250', fiveseven: 'fiveseven', deagle: 'deagle', revolver: 'revolver', tec9: 'tec9', cz75a: 'cz75', elite: 'elite',
  mac10: 'mac10', mp9: 'mp9', mp7: 'mp7', mp5sd: 'smg', ump45: 'ump45', p90: 'p90', bizon: 'bizon', nova: 'shotgun', xm1014: 'xm1014', mag7: 'mag7', sawedoff: 'sawedoff',
  galilar: 'galil', famas: 'famas', ak47: 'ak', m4a4: 'm4', m4a1: 'm4', m4a1_silencer: 'm4s', sg556: 'sg553', aug: 'aug', ssg08: 'ssg08', awp: 'sniper', g3sg1: 'g3sg1', scar20: 'scar20', m249: 'lmg', negev: 'negev',
  hegrenade: 'he', flashbang: 'flash', smokegrenade: 'smoke', molotov: 'molotov', incendiarygrenade: 'incgrenade', decoy: 'decoy', taser: 'zeus' };

const file = async url => { const r = await fetch(url); if (!r.ok) throw Error(url + ': ' + r.status); return r.arrayBuffer(); };
export async function load(url) {
  const buf = await file(url);
  // OBJ (with its .mtl and pictures beside it, when it has them).
  if (/\.obj$/i.test(url)) { const base = url.slice(0, url.lastIndexOf('/') + 1), text = new TextDecoder().decode(buf), lib = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim(), ol = new OBJLoader();
    if (lib) { try { const m = new MTLLoader().setPath(base).parse(new TextDecoder().decode(await file(base + encodeURIComponent(lib))), base); await new Promise(r => { m.preload(); setTimeout(r, 50); }); ol.setMaterials(m); } catch {} }
    const o = ol.parse(text); await new Promise(r => setTimeout(r, 400)); return { root: o, animations: [], gltf: false }; }
  if (/\.fbx$/i.test(url)) { const o = new FBXLoader().parse(buf, url.slice(0, url.lastIndexOf('/') + 1)); return { root: o, animations: o.animations || [], gltf: false }; }
  const g = await new GLTFLoader().parseAsync(buf, ''); return { root: g.scene, animations: g.animations || [], gltf: true };
}
const namesOf = root => { const n = []; root.traverse(o => { n.push(o.name); if (o.isMesh) for (const m of [].concat(o.material)) n.push(m.name); }); return n.join(' ').toLowerCase(); };

// What a model is: { kind: 'weapon' | 'agent' | 'viewmodel', id, team? } or null.
export function identify(root) {
  const s = namesOf(root); let bones = 0; root.traverse(o => { if (o.isBone) bones++; });
  if (/v_knife_karam/.test(s) && /glove|arm/.test(s)) return { kind: 'viewmodel', id: 'karambit' };
  if (/\bweapon_hand_r\b/.test(s) && /v_models.arms/.test(s) && /def-hand/.test(s)) return { kind: 'fp', id: 'rifle' };
  if (/glove_/.test(s) && /finger_index_0_l/.test(s) && !/\bpelvis\b|knife/.test(s)) return { kind: 'glove', id: 'glove' };
  if (bones > 40 && /\bpelvis\b/.test(s) && /arm_upper_l/.test(s)) { const ct = /ctm_/.test(s), t = /\btm_|body_tm_|[^c]tm_/.test(s.replace(/ctm_/g, '')); return ct || t ? { kind: 'agent', id: ct ? 'ct' : 't', team: ct ? 'ct' : 't', name: (/(ctm|tm)_([a-z0-9]+)/.exec(s) || [])[2] || '' } : null; }
  if (/defuse_multimeter|defuser/.test(s)) return { kind: 'weapon', id: 'kit' };
  if (/knife_default_ct/.test(s)) return { kind: 'weapon', id: 'knife' };
  if (/knife_default_t/.test(s)) return { kind: 'weapon', id: 'knife-t' };
  if (/knife_karam/.test(s)) return { kind: 'weapon', id: 'karambit' };
  if (/weapon_c4|_c4\b/.test(s)) return { kind: 'weapon', id: 'c4' };
  const m = /weapon_(?:rif|pist|smg|snip|shot|mach|eq|)_?([a-z0-9_]+?)(?:\.vmdl|_dropped|\b)/.exec(s);
  if (m) { const k = Object.keys(VALVE).filter(k => m[1] === k || m[1].startsWith(k + '_') || m[1].startsWith(k)).sort((a, b) => b.length - a.length)[0]; if (k) return { kind: 'weapon', id: VALVE[k] }; }
  return null;
}

// The skinned pose (bind pose, or as posed) baked into world space: every vertex through its bones.
const skinM = new THREE.Matrix4(), tmpM = new THREE.Matrix4();
function vertexMatrix(o, i, out) {
  if (!o.isSkinnedMesh) return out.copy(o.matrixWorld);
  const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, bm = o.skeleton.boneMatrices, e = skinM.elements; e.fill(0);
  for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (!w) continue; const b = si.getComponent(i, k); for (let j = 0; j < 16; j++) e[j] += w * bm[b * 16 + j]; }
  return out.copy(o.matrixWorld).multiply(tmpM.copy(o.bindMatrixInverse).multiply(skinM).multiply(o.bindMatrix));
}
// One part per material: positions (cm), normals, uvs (texture rows from the bottom, as loadReal draws them).
// toGame: the model's frame → the game's (muzzle along −z, y up).
export function bake(root, { gltf, toGame, keep = () => true }) {
  root.updateMatrixWorld(true); root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
  const parts = new Map(), M = new THREE.Matrix4(), NM = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh || !keep(o)) return; const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, idx = g.index, mats = [].concat(o.material);
    const wp = new Float32Array(P.count * 3), wn = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { vertexMatrix(o, i, M); v.fromBufferAttribute(P, i).applyMatrix4(M).applyMatrix4(toGame); wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z;
      if (N) { NM.getNormalMatrix(tmpM.multiplyMatrices(toGame, M)); n.fromBufferAttribute(N, i).applyMatrix3(NM).normalize(); wn[i * 3] = n.x; wn[i * 3 + 1] = n.y; wn[i * 3 + 2] = n.z; } }
    const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : P.count, materialIndex: 0 }];
    for (const gr of groups) { const mat = mats[gr.materialIndex || 0]; if (!mat || mat.visible === false) continue; const key = mat.name || 'main';
      let pt = parts.get(key); if (!pt) parts.set(key, pt = { mat, P: [], N: [], U: [] });
      for (let k = gr.start; k < gr.start + gr.count; k++) { const i = idx ? idx.getX(k) : k; pt.P.push(wp[i * 3], wp[i * 3 + 1], wp[i * 3 + 2]); pt.N.push(wn[i * 3], wn[i * 3 + 1], wn[i * 3 + 2]); pt.U.push(UV ? UV.getX(i) : 0, UV ? (gltf ? 1 - UV.getY(i) : UV.getY(i)) : 0); } } });
  return [...parts.values()];
}

// Pictures: drawn to `size`, as JPEG (base64). Sources: a texture's image (from the model) or a file URL.
// A picture's colours exactly as stored, at size × size, its alpha left out. CS2 keeps data in the alpha of its
// pictures (normal maps: often 0), and a 2D canvas multiplies the colours by it — the normal maps came out black or
// half dark, lighting the guns and agents wrong. So: read through WebGL (nothing premultiplied), then averaged down.
let rgl = null;
async function pixels(src, size) {
  if (!src) return null; const b = typeof src === 'string' ? await createImageBitmap(await (await fetch(src)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : src;
  const W = b.width, H = b.height, gl = rgl ??= new OffscreenCanvas(1, 1).getContext('webgl2'), t = gl.createTexture(), fb = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, b);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(t);
  const out = new ImageData(size, size), o = out.data;
  for (let y = 0; y < size; y++) { const ya = Math.floor(y * H / size), yb = Math.max(ya + 1, Math.floor((y + 1) * H / size));
    for (let x = 0; x < size; x++) { const xa = Math.floor(x * W / size), xb = Math.max(xa + 1, Math.floor((x + 1) * W / size)); let r = 0, g = 0, bl = 0, n = 0;
      for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) { const i = (yy * W + xx) * 4; r += px[i]; g += px[i + 1]; bl += px[i + 2]; n++; }
      const j = (y * size + x) * 4; o[j] = r / n; o[j + 1] = g / n; o[j + 2] = bl / n; o[j + 3] = 255; } }
  return out;
}
async function jpeg(data, q = .88) { const c = new OffscreenCanvas(data.width, data.height); c.getContext('2d').putImageData(data, 0, 0); const u8 = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768)); return btoa(s); }
// A picture file of this model by kind (color / normal / rough / ao / metal / orm), best match to the material's name.
const KIND = { color: /_(color|albedo|basecolor|diffuse|rgb)(?![a-z])/, normal: /_normal|_n\.(png|jpe?g)$/, rough: /_rough/, ao: /_ao(?!.*_orm)|ambientocclusion/, metal: /_metal/, orm: /_orm/ };
export function pickTexture(files, kind, matName = '') {
  const toks = new Set(matName.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1 && !/^(body|default|psd|tga|png|vmat|mat)$/.test(t)));
  let best = null, bs = -1; for (const f of files) { const b = f.toLowerCase().split('/').pop(); if (!KIND[kind].test(b) || (kind !== 'orm' && /@channels/.test(b))) continue; let sc = 0; for (const t of b.split(/[^a-z0-9]+/)) if (toks.has(t)) sc++; if (sc > bs) { bs = sc; best = f; } } return best;
}

// A gun from elsewhere, tidied in place (parts: { P, N, U } triangle soups, cm): triangles far outside the gun's main
// body dropped (the 2nd–98th percentile box, widened by half), then turned so its longest side runs along z, its
// height along y; the end with the grip hanging down at the back (+z: the muzzle along −z), the grip pointing down.
function tidy(parts) {
  const xs = [], ys = [], zs = []; for (const pt of parts) for (let i = 0; i < pt.P.length; i += 3) { xs.push(pt.P[i]); ys.push(pt.P[i + 1]); zs.push(pt.P[i + 2]); }
  const pr = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) * q)]; }, lim = a => { const lo = pr(a, .02), hi = pr(a, .98), w = (hi - lo) * .5; return [lo - w, hi + w]; }, LX = lim(xs), LY = lim(ys), LZ = lim(zs);
  const ok = (P, i) => P[i] >= LX[0] && P[i] <= LX[1] && P[i + 1] >= LY[0] && P[i + 1] <= LY[1] && P[i + 2] >= LZ[0] && P[i + 2] <= LZ[1];
  for (const pt of parts) { const P = [], N = [], U = []; for (let t = 0; t < pt.P.length / 9; t++) { if (!ok(pt.P, t * 9) || !ok(pt.P, t * 9 + 3) || !ok(pt.P, t * 9 + 6)) continue; for (let k = 0; k < 9; k++) { P.push(pt.P[t * 9 + k]); N.push(pt.N[t * 9 + k]); } for (let k = 0; k < 6; k++) U.push(pt.U[t * 6 + k]); } pt.P = P; pt.N = N; pt.U = U; }
  const each = f => { for (const pt of parts) for (const A of [pt.P, pt.N]) for (let i = 0; i < A.length; i += 3) { const r = f(A[i], A[i + 1], A[i + 2]); A[i] = r[0]; A[i + 1] = r[1]; A[i + 2] = r[2]; } };
  const ext = () => { const b = new THREE.Box3(); for (const pt of parts) for (let i = 0; i < pt.P.length; i += 3) b.expandByPoint(new THREE.Vector3(pt.P[i], pt.P[i + 1], pt.P[i + 2])); return b; };
  let b = ext(), sz = b.getSize(new THREE.Vector3()); const order = [['x', sz.x], ['y', sz.y], ['z', sz.z]].sort((a, c) => a[1] - c[1]).map(a => a[0]);   // shortest → x, middle → y, longest → z
  if (order.join('') !== 'xyz') { const ix = { x: 0, y: 1, z: 2 }, [a, m, l] = order.map(k => ix[k]), odd = !['012', '120', '201'].includes('' + a + m + l);   // (an odd swap mirrors: x turned back)
    each((x, y, z) => { const v = [x, y, z]; return [odd ? -v[a] : v[a], v[m], v[l]]; }); }
  // Which end has the grip: the half whose slices are taller in all (grip, stock) — the muzzle half is mostly barrel;
  // it goes to +z. Then which way it hangs from the muzzle half's middle line: down (−y).
  b = ext(); const z0 = b.min.z, dz = (b.max.z - b.min.z) / 20 || 1, lo = new Float64Array(20).fill(Infinity), hi = new Float64Array(20).fill(-Infinity);
  for (const pt of parts) for (let i = 0; i < pt.P.length; i += 3) { const s = Math.min(19, Math.floor((pt.P[i + 2] - z0) / dz)); lo[s] = Math.min(lo[s], pt.P[i + 1]); hi[s] = Math.max(hi[s], pt.P[i + 1]); }
  const span = (s0, s1) => { let t = 0; for (let s = s0; s < s1; s++) if (hi[s] > lo[s]) t += hi[s] - lo[s]; return t; }, mid = (s0, s1) => { let t = 0, n = 0; for (let s = s0; s < s1; s++) if (hi[s] > lo[s]) { t += (hi[s] + lo[s]) / 2; n++; } return n ? t / n : 0; };
  const gripEnd = span(0, 10) > span(10, 20) ? 0 : 1, [g0, g1] = gripEnd ? [10, 20] : [0, 10], line = gripEnd ? mid(0, 10) : mid(10, 20);
  let gLo = Infinity, gHi = -Infinity; for (let s = g0; s < g1; s++) if (hi[s] > lo[s]) { gLo = Math.min(gLo, lo[s]); gHi = Math.max(gHi, hi[s]); }
  const gripDown = line - gLo >= gHi - line;
  if (gripEnd === 0) each((x, y, z) => [-x, y, -z]);   // grip end to the back
  if (!gripDown) each((x, y, z) => [-x, -y, z]);        // grip downward
}
// Real lengths (cm), for files in other units: the pistols, SMGs and machine guns downloaded from elsewhere.
const REAL_LENGTH_CM = { pistol: 20.2, p250: 19.2, fiveseven: 20.8, cz75: 20.6, tec9: 31.7, deagle: 26.9, usps: 30, bizon: 66.8, negev: 100, galil: 96 };
// A static model (gun, knife, bomb, kit): baked parts + pictures (base, normal, ORM: G roughness, B metalness).
export async function convertStatic({ url, files, base, size = 2048, id }) {
  const { root, gltf } = await load(url); root.updateMatrixWorld(true);
  // CS2 guns from glTF face +z (y up, metres); the FBX ones are in centimetres. → cm, muzzle / blade along −z.
  const k = gltf ? 100 : 1, toGame = new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeScale(k, k, k));
  // Left out: the bomb's screen overlay; the defuse kit's cables (stretched out straight in the file: 1.4 m).
  let parts = bake(root, { gltf, toGame, keep: o => !/controlpanel|panorama/i.test(o.name) }).filter(pt => !(id === 'kit' && /cable/i.test(pt.mat.name)));
  // One picture set: the material with the most triangles (CS2 guns have one; the kit's cable bits share theirs).
  parts.sort((a, b) => b.P.length - a.P.length); const main = parts[0], mat = main.mat;
  // Re-exports from elsewhere: parts far from the gun (a ground plane metres away) left out, and a file in other units
  // (metres, inches) scaled to the real gun's length — CS2's own files are already right and are left as they are.
  { const box = P => { const b = new THREE.Box3(); for (let i = 0; i < P.length; i += 3) b.expandByPoint(new THREE.Vector3(P[i], P[i + 1], P[i + 2])); return b; }, mb = box(main.P), mc = mb.getCenter(new THREE.Vector3()), md = mb.getSize(new THREE.Vector3()).length();
    parts = parts.filter(pt => pt === main || box(pt.P).getCenter(new THREE.Vector3()).distanceTo(mc) < md * 1.5);
    if (REAL_LENGTH_CM[id] && !/weapon_|_cs2|\.vmdl/i.test(url)) tidy(parts);   // not CS2's own file: stray triangles out, the gun turned the right way
    const all0 = new THREE.Box3(); for (const pt of parts) all0.union(box(pt.P)); const L = all0.max.z - all0.min.z, E = REAL_LENGTH_CM[id];
    if (E && L > 0 && (L < E * .85 || L > E * 1.5)) { const f = E / L; for (const pt of parts) for (let i = 0; i < pt.P.length; i++) pt.P[i] *= f; } }
  const all = { P: [], N: [], U: [] }; for (const pt of parts) for (const key of ['P', 'N', 'U']) for (const x of pt[key]) all[key].push(x);
  const tex = {}, src = { color: mat.map?.image, normal: mat.normalMap?.image, orm: (mat.metalnessMap || mat.roughnessMap)?.image };
  for (const kind of ['color', 'normal', 'rough', 'ao', 'metal', 'orm']) if (!src[kind]) { const f = pickTexture(files, kind, mat.name); if (f) src[kind] = base + f; }
  const col = await pixels(src.color, size), nor = await pixels(src.normal, size); let orm = await pixels(src.orm, size);
  if (!orm) { const r = await pixels(src.rough, size), m = await pixels(src.metal, size), a = await pixels(src.ao, size); if (r || m) { orm = new ImageData(size, size);
    for (let i = 0; i < orm.data.length; i += 4) { orm.data[i] = a ? a.data[i] : 255; orm.data[i + 1] = r ? r.data[i] : 150;
      // No metalness picture (the knives): bright, grey, smooth texels are steel.
      let met = m ? m.data[i] : 0; if (!m && col) { const R = col.data[i], G = col.data[i + 1], B = col.data[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B); met = mx > 70 && (mx - mn) < 26 && (r ? r.data[i] < 150 : true) ? 255 : 0; }
      orm.data[i + 2] = met; orm.data[i + 3] = 255; } } }
  if (!col) { const d = new ImageData(16, 16); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 58; d.data[i + 1] = 60; d.data[i + 2] = 64; d.data[i + 3] = 255; } tex.base = await jpeg(d, .92);   // no picture of its own: gunmetal
    if (!orm) { const o = new ImageData(16, 16); for (let i = 0; i < o.data.length; i += 4) { o.data[i] = 255; o.data[i + 1] = 120; o.data[i + 2] = 200; o.data[i + 3] = 255; } tex.orm = await jpeg(o, .92); } }
  if (col) tex.base = await jpeg(col, .92); if (nor) tex.normal = await jpeg(nor, .95); if (orm) tex.orm = await jpeg(orm, .92);
  const box = new THREE.Box3(); for (let i = 0; i < all.P.length; i += 3) box.expandByPoint(new THREE.Vector3(all.P[i], all.P[i + 1], all.P[i + 2]));
  return { id, tex, box: [box.min.toArray(), box.max.toArray()], part: { name: 'main', P: all.P, N: all.N, U: all.U }, tris: all.P.length / 9 };
}

// Skinned models: every mesh onto one clean skeleton. FBX files from CS2 give each mesh its own copy of the bones, and
// three.js nests the copies inside one another (pelvis < pelvis < pelvis…): a new bone per name, parented by name
// (the nearest ancestor with another bone name), placed where the bone is now; each mesh is bound to it with bind
// matrices that keep every vertex exactly where it was (new⁻¹ · old · old bind).
function oneSkeleton(root) {
  root.updateMatrixWorld(true); const skinned = []; root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); }); if (!skinned.length) return null;
  const ref = new Map(); for (const m of skinned) for (const b of m.skeleton.bones) if (!ref.has(b.name)) ref.set(b.name, b);
  const parentOf = new Map(); for (const [n, b] of ref) { let q = b.parent; while (q && q.isBone && (q.name === n || !ref.has(q.name))) q = q.parent; parentOf.set(n, q && q.isBone ? q.name : null); }
  const top = new THREE.Group(); top.name = 'skeleton'; root.add(top); const nb = new Map(); for (const n of ref.keys()) { const b = new THREE.Bone(); b.name = n; nb.set(n, b); }
  for (const [n, b] of nb) (parentOf.get(n) ? nb.get(parentOf.get(n)) : top).add(b);
  root.updateMatrixWorld(true); const m4 = new THREE.Matrix4();
  top.traverse(b => { if (!b.isBone) return; m4.copy(b.parent.isBone ? ref.get(b.parent.name).matrixWorld : top.matrixWorld).invert().multiply(ref.get(b.name).matrixWorld).decompose(b.position, b.quaternion, b.scale); b.updateMatrixWorld(true); });
  for (const m of skinned) { const old = m.skeleton; m.bind(new THREE.Skeleton(old.bones.map(b => nb.get(b.name)), old.bones.map((b, i) => new THREE.Matrix4().copy(nb.get(b.name).matrixWorld).invert().multiply(b.matrixWorld).multiply(old.boneInverses[i]))), m.bindMatrix); }
  // The old bones go (the outermost of each nest; everything under them is old too).
  const keep = new Set(nb.values()), drop = []; root.traverse(o => { if (o.isBone && !keep.has(o) && !(o.parent?.isBone && !keep.has(o.parent))) drop.push(o); }); for (const o of drop) o.parent.remove(o);
  return { bones: [...nb.values()] };
}
// Pictures of a skinned model at `size`: JPEG, and roughness / metalness / occlusion packed into one (R ao, G rough, B metal).
async function packTextures(root, files, base, size, gltf) {
  const done = new Map(), tex = async (data, srgb) => { const c = new OffscreenCanvas(data.width, data.height); c.getContext('2d').putImageData(data, 0, 0); const t = new THREE.CanvasTexture(c); t.flipY = gltf ? false : true; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.userData.mimeType = 'image/jpeg'; return t; };
  const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) o.material = await Promise.all([].concat(o.material).map(async m => {
    if (done.has(m)) return done.get(m); const name = m.name.replace(/\.\d+$/, ''), src = { color: m.map?.image, normal: m.normalMap?.image, orm: (m.metalnessMap || m.roughnessMap)?.image };
    for (const kind of ['color', 'normal', 'rough', 'ao', 'metal']) if (!src[kind]) { const f = pickTexture(files, kind, name); if (f) src[kind] = base + f; }
    const S = s => /lens|eye/.test(name) ? 128 : s, col = await pixels(src.color, S(size)), nor = await pixels(src.normal, S(size)); let orm = await pixels(src.orm, S(size));
    if (!orm && (src.rough || src.metal || src.ao)) { const z = S(size), r = await pixels(src.rough, z), me = await pixels(src.metal, z), a = await pixels(src.ao, z); orm = new ImageData(z, z); for (let i = 0; i < orm.data.length; i += 4) { orm.data[i] = a ? a.data[i] : 255; orm.data[i + 1] = r ? r.data[i] : 200; orm.data[i + 2] = me ? me.data[i] : 0; orm.data[i + 3] = 255; } }
    const out = new THREE.MeshStandardMaterial({ name, roughness: 1, metalness: orm ? 1 : 0 });
    if (col) out.map = await tex(col, true); if (nor) out.normalMap = await tex(nor, false); if (orm) { const t = await tex(orm, false); out.roughnessMap = out.metalnessMap = t; }
    if (!col) out.color.copy(m.color || new THREE.Color(.5, .5, .5)); if (m.transparent || /lens|glass/.test(name)) { out.transparent = true; out.opacity = Math.min(m.opacity ?? 1, .85); }
    done.set(m, out); return out; }));
  for (const o of meshes) if (o.material.length === 1) o.material = o.material[0];
}
const exportGLB = root => new Promise((res, rej) => new GLTFExporter().parse(root, b => { const u8 = new Uint8Array(b); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768)); res(btoa(s)); }, rej, { binary: true, onlyVisible: true, animations: [] }));

// An agent: one skeleton, pictures at `size`, standing on y = 0 facing +z, in metres.
export async function convertAgent({ url, files, base, size = 2048 }) {
  const { root, gltf } = await load(url); const skel = oneSkeleton(root); root.updateMatrixWorld(true);
  // Height and facing from the bones: feet on the ground, the toes (ball_l / ball_r) ahead of the ankles → +z.
  const w = name => { const b = skel.bones.find(b => b.name === name); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
  const head = w('head_0'), ankle = w('ankle_l'), ball = w('ball_l'), pelvis = w('pelvis'); if (!head || !ankle || !ball) throw Error('not a CS2 agent skeleton');
  const up = head.clone().sub(ankle).normalize(), fwd = ball.clone().sub(ankle); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  // A turn taking `up` to +y and `fwd` to +z; scale to metres from the model's own height (a CS2 agent's head bone is ~1.65 m up).
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, fwd), up, fwd).invert(), height = head.distanceTo(ankle), k = 1.62 / height;
  const fix = new THREE.Group(); fix.name = 'agent'; root.parent?.remove(root); fix.add(root); root.applyMatrix4(new THREE.Matrix4().makeScale(k, k, k).multiply(basis)); fix.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3(); root.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i += 5) { v.fromBufferAttribute(P, i); o.applyBoneTransform(i, v); box.expandByPoint(v.applyMatrix4(o.matrixWorld)); } } });
  root.position.y -= box.min.y; root.position.x -= (box.min.x + box.max.x) / 2; root.position.z -= (box.min.z + box.max.z) / 2; fix.updateMatrixWorld(true);
  await packTextures(root, files, base, size, gltf);
  root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  let tris = 0; root.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return { glb: await exportGLB(fix), tris, bones: skel.bones.length, height: +(box.max.y - box.min.y).toFixed(3) };
}

// First-person animations: the arms (their own pictures, at most 2048 px) and the gun on one skeleton, with every clip;
// the backdrop the file was shown on dropped, the gun's pictures dropped (the game holds its own guns; it only measures
// where this one sits in the hand).
export async function convertFPAnim({ url }) {
  const { root, animations } = await load(url); root.updateMatrixWorld(true);
  const drop = []; root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) drop.push(o); }); for (const o of drop) o.parent.remove(o);
  let arms = 0, tris = 0, bones = 0; root.traverse(o => { if (o.isBone) bones++; if (!o.isSkinnedMesh) return; o.frustumCulled = false; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if ([].concat(o.material).some(m => /v_models.arms/i.test(m.name))) { arms++; for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap']) if (m[k]) m[k].userData.mimeType = 'image/jpeg'; }
    else o.material = new THREE.MeshStandardMaterial({ name: 'gun', color: 0x555555 }); });
  if (!arms || !animations.length) throw Error('no arms or no clips');
  const glb = await new Promise((res, rej) => new GLTFExporter().parse(root, b => { const u8 = new Uint8Array(b); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768)); res(btoa(s)); }, rej, { binary: true, onlyVisible: false, animations, maxTextureSize: 2048 }));
  return { glb, tris, bones, clips: animations.map(a => a.name + ' ' + a.duration.toFixed(2)) };
}

// Gloves: one skinned mesh (both hands) on CS2's arm bones, kept as it is, with its pictures — the download's base
// colour (any picture not named as another kind) and normal map, at 2048 px.
export async function convertGlove({ url, files, base, size = 2048 }) {
  const { root, gltf } = await load(url); root.updateMatrixWorld(true);
  const nm = f => f.split('/').pop().toLowerCase(), nor = files.find(f => /normal|_n\.(png|jpe?g|tga)$/.test(nm(f))), col = files.find(f => f !== nor && /\.(png|jpe?g|tga)$/.test(nm(f)) && !/rough|metal|_ao|orm|mask|spec/.test(nm(f)));
  const tex = async (f, srgb) => { const d = f && await pixels(base + f, size); if (!d) return null; const c = new OffscreenCanvas(d.width, d.height); c.getContext('2d').putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.flipY = !gltf; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.userData.mimeType = 'image/jpeg'; return t; };
  const mat = new THREE.MeshStandardMaterial({ name: 'glove', map: await tex(col, true), normalMap: await tex(nor, false), roughness: .8, metalness: 0 });
  let tris = 0, bones = 0; root.traverse(o => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } if (o.isBone) bones++; });
  if (!bones) throw Error('a glove without bones');
  return { glb: await exportGLB(root), tris, bones, maps: [col && 'base', nor && 'normal'].filter(Boolean) };
}

// The karambit first-person model: arms, gloves and knife on one skeleton, the far-off spare knife dropped, in its
// authored hold (CS:GO's view model: units are inches, looking along +x… the game fits it, dist/fp-view.js).
export async function convertViewmodel({ url }) {
  const { root } = await load(url); root.updateMatrixWorld(true);
  // Two copies of the knife: keep the one in the hand (nearest the right hand bone).
  // (The right hand of the arms' own skeleton: the knife files carry copies of the hand bones elsewhere.)
  const knives = [], arms = []; root.traverse(o => { if (o.isSkinnedMesh) (/knife/i.test(o.name) ? knives : arms).push(o); });
  const hand = arms.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0]?.skeleton.bones.find(b => /R_Hand$/i.test(b.name))?.getWorldPosition(new THREE.Vector3());
  const centre = o => { o.skeleton.update(); const c = new THREE.Vector3(), v = new THREE.Vector3(), P = o.geometry.attributes.position; for (let i = 0; i < P.count; i += 7) { v.fromBufferAttribute(P, i); o.applyBoneTransform(i, v); c.add(v.applyMatrix4(o.matrixWorld)); } return c.multiplyScalar(7 / P.count); };
  if (knives.length > 1 && hand) { knives.sort((a, b) => centre(a).distanceTo(hand) - centre(b).distanceTo(hand)); for (const k of knives.slice(1)) k.parent.remove(k); }
  oneSkeleton(root);
  // Untextured: plain materials named for the game to paint (skin, glove, knife).
  root.traverse(o => { if (!o.isMesh) return; o.material = [].concat(o.material).map(m => { const n = m.name.toLowerCase(), role = /karam|knife/.test(n) ? 'knife' : /bare_arm|skin/.test(n) ? 'skin' : 'glove'; return new THREE.MeshStandardMaterial({ name: role + ':' + m.name, color: role === 'skin' ? 0xc89a7a : role === 'knife' ? 0x999999 : 0x333333, roughness: .6, metalness: role === 'knife' ? 1 : 0 }); }); if (o.material.length === 1) o.material = o.material[0]; o.frustumCulled = false; });
  let tris = 0, bones = 0; root.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; if (o.isBone) bones++; });
  return { glb: await exportGLB(root), tris, bones };
}
