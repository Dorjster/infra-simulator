#!/usr/bin/env node
// CS2's agents in first person and their hit boxes (v53 AGENTS), from the CS2 install on this computer, into the
// git-ignored user-assets/ (Valve's files and numbers: local only, never committed — tests/no-valve-data.mjs).
//
// 1. Sleeves. Every agent model (agents/models/<agent>/<agent>.vmdl_c) carries, besides its third-person body, the
//    first-person meshes CS2 draws over the view-model arms: `firstperson_sleeves` (the agent's own sleeve; the T's rolled
//    forearm cloth) — on the same 52 view-model arm bones at the same bind pose as the arms every first-person set wears
//    (user-assets/fp-gloves/arms-*.glb, tools/export-fp-gloves.py: SAS and Phoenix). Source2Viewer-CLI exports that mesh
//    with its material; this writes one small glb per agent, user-assets/sleeves/<agent>-<sha8>.glb, laid out exactly as
//    the arms glb's own sleeves (mesh `sleeves_<side>`, the 52 bones in the arms glb's order, material extras.part
//    'sleeve', base colour JPEG (sRGB) · normal PNG · ORM PNG at half size: R = g_tAmbientOcclusion, G = roughness = the
//    normal map's alpha with the vmat's g_vRoughnessAdjustBrightnessContrast, B = g_tMetalness (0 on F_CLOTH_SHADING)),
//    so dist/fp-view.js draws it with the arms' own shader (one program: no compile) in place of the arms glb's sleeve,
//    for the agent each side is drawn as (user-assets/manifest models.agents[side].from). The gloves (the player's CS2
//    gloves or the agent's own) are never touched. The tint is the vmat's g_vColorTint as Source2Viewer exports it
//    (linear, its baseColorFactor). Listed in user-assets/sleeves/sleeves-<sha8>.json → manifest models.sleeves.
// 2. Hit boxes (H8). Every agent vmdl's MDAT block holds one hit box set, "cstrike" (m_hitboxsets): 19 capsules
//    (m_nShapeType 2) on 19 bones — m_sBoneName, the two end points m_vMinBounds / m_vMaxBounds in that bone's frame (HU),
//    m_flShapeRadius, m_nGroupId (Source's HITGROUP: 1 head 2 chest 3 stomach 4/5 left/right arm 6/7 left/right leg
//    8 neck). They are hung on the agent's own skeleton (user-assets/agents, the model each side is drawn with) posed by
//    dist/cs2-agents.js with CS2's own clips (user-assets/agents/cs2_anims.glb) for every item's own hold (each gun,
//    knife, grenade, the bomb: POSE_IDS, through cs2-agents' setWeapon — items with one pose share it) standing and
//    crouched — the pose every other player sees — with what the look's pitch needs (the spine_1..3 pivots, the axis,
//    each capsule's level: aimOfPose), and written in the body's frame (feet at the origin, facing −z, game units ÷ HU =
//    HU) to user-assets/hitboxes/cs2-hitboxes-<sha8>.json (file version 2; manifest models.hitboxes) with the raw set
//    and each box bone's bind matrix (m_invBindPose) for the tests. dist/gd-hitboxes.js installs it on the host and
//    every page.
//    The glb bones are CS2's bone frames in metres (checked: pelvis 42.82 HU = 1.08775 m, head_0 5.76 HU along x).
//
//   node tools/import-cs2-sleeves.mjs [--cs2 ~/CS2-extract] [--assets user-assets] [--agents a,b,…] [--all]
//        [--work DIR] [--no-install] [--sleeves-only] [--hitboxes-only]
//     --agents   the agents to import sleeves for (vmdl names: ctm_fbi, tm_leet_varianta, …); default DEFAULT_AGENTS
//                (each CT and T family's first model) plus the two each side is drawn as; --all: every agent model.
//   Back-up rule: an existing user-assets/sleeves or hitboxes folder is moved to <folder>.bak-<stamp> (two kept) and the
//   manifest copied to manifest.bak-<stamp>.json before anything is written; the manifest is read just before its
//   write and only models.sleeves / models.hitboxes change.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKV3 } from './cs2-ragdoll/kv3.mjs';
import { readPNG, writePNG, shrink, resample, crop } from './cs2-sleeves/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_AGENTS = ['ctm_sas', 'ctm_fbi', 'ctm_st6_variante', 'ctm_swat_variante', 'ctm_gendarmerie_varianta', 'ctm_diver_varianta',
  'tm_phoenix', 'tm_leet_varianta', 'tm_balkan_variantf', 'tm_jungle_raider_varianta', 'tm_professional_varf'];
export const sideOfAgent = a => /^ctm_/.test(a) ? 'ct' : /^tm_/.test(a) ? 't' : null;
export const vmdlOf = a => `agents/models/${a.replace(/_(variant[a-z0-9]+|var[a-z][0-9]*)$/, '')}/${a}.vmdl_c`;
// The agent a manifest entry names (models.agents[side].from: "CS2: agents/models/ctm_sas/ctm_sas (Steam depot)").
export const agentOfEntry = e => /agents\/models\/[a-z0-9_]+\/([a-z0-9_]+)/i.exec(String(e?.from || ''))?.[1]?.toLowerCase() || null;

// ── Hit boxes: the "cstrike" set of an MDAT dump (Source2Viewer-CLI -b MDAT) ──
export function hitboxSetOf(dump, from = '') {
  const sets = []; let at = 0;
  for (;;) { at = dump.indexOf('--- Data for block "MDAT"', at); if (at < 0) break; const k = parseKV3(dump.slice(at)); at += 10;
    const hs = (k.m_hitboxsets || []).find(s => s.key === 'cstrike')?.value; if (!hs) continue;
    const bones = new Map((k.m_skeleton?.m_bones || []).map(b => [String(b.m_boneName).toLowerCase(), b]));
    const boxes = hs.m_HitBoxes.map(h => ({ name: h.m_name, bone: String(h.m_sBoneName).toLowerCase(), group: h.m_nGroupId, r: h.m_flShapeRadius, a: h.m_vMinBounds, b: h.m_vMaxBounds, shape: h.m_nShapeType, surf: h.m_sSurfaceProperty }));
    const bind = {}; for (const b of boxes) { const B = bones.get(b.bone); if (B?.m_invBindPose) bind[b.bone] = B.m_invBindPose; }
    sets.push({ boxes, bind }); }
  if (!sets.length) throw Error(from + ': no "cstrike" hit box set');
  for (const s of sets.slice(1)) if (JSON.stringify(s.boxes) !== JSON.stringify(sets[0].boxes)) throw Error(from + ': the meshes\' hit box sets differ');
  for (const b of sets[0].boxes) if (b.shape !== 2) throw Error(from + ': ' + b.name + ' is not a capsule (shape ' + b.shape + ')');
  return { ...sets[0], blocks: sets.length };
}
// The items posed: every gun, every knife (each has its own CS2 hold clip), the grenades, the bomb, the Zeus — each
// through cs2-agents' own setWeapon (its clip, its grip, a stand-in gun's left-hand reach), as multiplayer.js dresses a
// remote player (its csAim). 'ak' first: the rifle hold every unnamed item falls back to (gd-hitboxes.js holdOf).
export const POSE_IDS = async () => { const { WEAPON_IDS } = await import('../dist/weapons-data.js'), { STAR_KNIVES } = await import('../dist/gd-knives.js');
  return [...new Set(['ak', ...WEAPON_IDS, 'knife', 'knife-t', ...Object.keys(STAR_KNIVES), 'he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy', 'c4', 'zeus'])]; };
export const aimOf = (weaponById, id) => { const w = weaponById(id === 'knife-t' ? 'knife' : id); return !w ? (/knife|karambit|butterfly|stiletto|^m9$|^(bayonet|skeleton|talon|flip|nomad)$/.test(id) ? 'knife' : null) : w.kind === 'knife' ? 'knife' : w.kind === 'pistol' ? 'pistol' : w.kind === 'sniper' ? 'sniper' : 'rifle'; };   // (multiplayer.js csAim)
// The capsules hung on a posed agent → [[ax, ay, az, bx, by, bz, r, group] …] in HU, the body's frame (feet at 0, −z
// forward). agent: cs2-agents makeAgent's { g } posed; boxes: hitboxSetOf().boxes; THREE: three.js.
export function hangBoxes(THREE, agent, boxes) {
  agent.g.updateMatrixWorld(true); const by = {}; agent.g.traverse(o => { if (o.isBone && !by[o.name.toLowerCase()]) by[o.name.toLowerCase()] = o; });
  const U = 2.54 / 16.5, inv = new THREE.Matrix4().copy(agent.g.matrixWorld).invert(), p = new THREE.Vector3(), r6 = x => Math.round(x * 1e4) / 1e4;
  return boxes.map(b => { const B = by[b.bone]; if (!B) throw Error('the agent has no bone ' + b.bone);
    const end = v => { p.set(v[0] * .0254, v[1] * .0254, v[2] * .0254).applyMatrix4(B.matrixWorld).applyMatrix4(inv); return [p.x / U, p.y / U, p.z / U].map(r6); };   // (bone frame HU → metres → the body's game units → HU)
    return [...end(b.a), ...end(b.b), b.r, b.group]; });
}
// The look's pitch as cs2-agents.js bends the drawn chest (a third of it on each of spine_1, _2, _3, about its model
// frame's −x, the frame of pelvis' parent's parent): each capsule's level (the highest of those three bones above its
// bone: 0 none), the three pivots (HU, the body's frame, this pose) and that axis in the body's frame.
const SPINES = ['spine_1', 'spine_2', 'spine_3'];
export function aimOfPose(THREE, agent, boxes) {
  agent.g.updateMatrixWorld(true); const by = {}; agent.g.traverse(o => { if (o.isBone && !by[o.name.toLowerCase()]) by[o.name.toLowerCase()] = o; });
  const U = 2.54 / 16.5, inv = new THREE.Matrix4().copy(agent.g.matrixWorld).invert(), r6 = x => Math.round(x * 1e4) / 1e4;
  const piv = SPINES.flatMap(n => { if (!by[n]) throw Error('the agent has no bone ' + n); const p = new THREE.Vector3().setFromMatrixPosition(by[n].matrixWorld).applyMatrix4(inv); return [p.x / U, p.y / U, p.z / U].map(r6); });
  const M = by.pelvis?.parent?.parent; if (!M) throw Error('the agent has no pelvis frame');
  const ax = new THREE.Vector3(-1, 0, 0).transformDirection(new THREE.Matrix4().multiplyMatrices(inv, M.matrixWorld));
  const lvl = boxes.map(b => { let L = 0; for (let o = by[b.bone]; o; o = o.parent) { const k = SPINES.indexOf(o.name.toLowerCase()); if (k >= 0) L = Math.max(L, k + 1); } return L; });
  return { piv, axis: [ax.x, ax.y, ax.z].map(v => Math.round(v * 1e6) / 1e6), lvl };
}
// Pose each side's agent for every item, standing and crouched (CS2's clips through cs2-agents' own animator, pitch 0)
// → { lvl, poses: { key: { stand: { caps, piv, axis }, crouch } }, ids: { item: key } }: items with the same pose share
// one (its first item's id is its key).
export function poseOne(THREE, { makeAgent }, side, boxes, id, crouch, weaponById, pitch = 0, frames = 90) {
  const a = makeAgent({ name: 'hitboxes-' + side }, side); a.setWeapon(id); const aim = aimOf(weaponById, id);
  for (let i = 0; i < frames; i++) a.update(1 / 60, { speed: 0, crouch, aim, dead: false, pitch });
  const caps = hangBoxes(THREE, a, boxes), A = aimOfPose(THREE, a, boxes); a.dispose?.(); return { caps, piv: A.piv, axis: A.axis, lvl: A.lvl };
}
export async function poseAll(THREE, CA, side, boxes, ids = null) {
  const { weaponById } = await import('../dist/weapons-data.js'), out = { lvl: null, poses: {}, ids: {} }, seen = new Map();
  for (const id of ids || await POSE_IDS()) { const st = poseOne(THREE, CA, side, boxes, id, 0, weaponById), cr = poseOne(THREE, CA, side, boxes, id, 1, weaponById);
    if (!out.lvl) out.lvl = st.lvl; if (st.lvl.join() !== out.lvl.join() || cr.lvl.join() !== out.lvl.join()) throw Error('the capsules\' spine levels differ between poses');
    const key = [st, cr].map(p => p.caps.map(c => c.slice(0, 6).map(v => v.toFixed(2)).join(',')).join(';')).join('|');
    let k = seen.get(key); if (!k) { k = id; seen.set(key, k); out.poses[k] = { stand: { caps: st.caps, piv: st.piv, axis: st.axis }, crouch: { caps: cr.caps, piv: cr.piv, axis: cr.axis } }; }
    out.ids[id] = k; }
  return out;
}
// Node stand-ins so three.js' GLTFLoader and dist/cs2-agents.js load here (pictures are not drawn), as tests/gd-agent-hold.mjs.
export async function nodeAgents(assets) {
  globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
  { const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding/.test(String(a[0]))) w(...a); }; }
  const THREE = await import('../dist/three.module.js'), CA = await import('../dist/cs2-agents.js'), { gltfLoader } = await import('../dist/gltf-loader.js');
  const man = JSON.parse(readFileSync(path.join(assets, 'manifest.json'), 'utf8')), M = man.models || {};
  const parse = f => { const b = readFileSync(path.join(assets, f)); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
  if (!M.agents?.ct || !M.agents?.t || !M.agentAnims) throw Error('no CS2 agents in ' + assets + ' (tools/import-cs2-models.mjs first)');
  const [ct, t, anims] = await Promise.all([parse(M.agents.ct.file), parse(M.agents.t.file), parse(M.agentAnims.file)]);
  const j = f => existsSync(path.join(assets, f)) ? JSON.parse(readFileSync(path.join(assets, f), 'utf8')) : null;
  CA.useAgents({ ct: ct.scene, t: t.scene }, anims.animations, { holds: j('holds/holds.json'), clips: j('holds/holds-clips.json') });
  return { THREE, CA, man, drawn: { ct: agentOfEntry(M.agents.ct), t: agentOfEntry(M.agents.t) } };
}

// ── Sleeves ──
const CT = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function readGLB(buf) { const n = buf.readUInt32LE(12), J = JSON.parse(buf.toString('utf8', 20, 20 + n)), bin = buf.subarray(20 + n + 8); return { J, bin }; }
export function accessor({ J, bin }, i) {   // → a typed array (count × components), de-strided
  const a = J.accessors[i], v = J.bufferViews[a.bufferView], T = CT[a.componentType], c = NC[a.type], es = T.BYTES_PER_ELEMENT * c, st = v.byteStride || es, off = (v.byteOffset || 0) + (a.byteOffset || 0), out = new T(a.count * c);
  for (let k = 0; k < a.count; k++) { const s = bin.subarray(off + k * st, off + k * st + es); out.set(new T(s.buffer.slice(s.byteOffset, s.byteOffset + es)), k * c); }
  if (a.normalized) { const f = new Float32Array(out.length), m = { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[a.componentType]; for (let k = 0; k < out.length; k++) f[k] = out[k] / m; return f; }
  return out;
}
// The arms glb's bones (names in its skin's order, inverse binds): the sleeves are written on exactly these.
export function armBones(armsGlb) { const G = readGLB(armsGlb), sk = G.J.skins[0]; return { names: sk.joints.map(j => G.J.nodes[j].name), ibm: accessor(G, sk.inverseBindMatrices) }; }
const toJPEG = (png, tmp) => { if (process.platform !== 'darwin') return null; const a = path.join(tmp, 'c.png'), b = path.join(tmp, 'c.jpg'); writeFileSync(a, png);
  try { execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', a, '--out', b], { stdio: 'ignore' }); return readFileSync(b); } catch { return null; } };
// One agent's sleeves (Source2Viewer's glb + its PNGs in dir) → { glb: Buffer, info }.
// Weights: the sleeves of some agents (Leet, …) reach past the arm onto the clavicle, scapula and spine, which the
// first-person arms skeleton does not have (CS2 drives them in its view model; here they stay off screen, by the
// shoulder): such a share goes to the nearer upper arm (by the vertex's bind distance to arm_upper_L / _R) and is reported.
export function buildSleeve(agent, side, srcGlb, dir, bones, tmp) {
  const G = readGLB(srcGlb), node = G.J.nodes.find(n => n.mesh !== undefined && /firstperson_sleeves$/.test(G.J.meshes[n.mesh].name || '')); if (!node) throw Error(agent + ': no firstperson_sleeves mesh');
  const sk = G.J.skins[node.skin], names = sk.joints.map(j => G.J.nodes[j].name), sib = accessor(G, sk.inverseBindMatrices), remap = names.map(n => bones.names.indexOf(n));
  let worstBind = 0; names.forEach((n, k) => { const i = remap[k]; if (i >= 0) for (let e = 0; e < 16; e++) worstBind = Math.max(worstBind, Math.abs(sib[k * 16 + e] - bones.ibm[i * 16 + e])); });
  const upper = ['arm_upper_L', 'arm_upper_R'].map(n => { const i = bones.names.indexOf(n), m = invert4(bones.ibm.subarray(i * 16, i * 16 + 16)); return { i, x: m[12], y: m[13], z: m[14] }; });   // (bind positions: the inverse bind's translation)
  const prims = G.J.meshes[node.mesh].primitives.map(p => { const A = p.attributes, j = accessor(G, A.JOINTS_0), w = accessor(G, A.WEIGHTS_0), pos = accessor(G, A.POSITION), jj = new Uint8Array(j.length), ww = new Float32Array(w.length); let moved = 0;
    for (let v = 0; v < j.length; v += 4) { const q = v / 4 * 3, d = upper.map(u => (pos[q] - u.x) ** 2 + (pos[q + 1] - u.y) ** 2 + (pos[q + 2] - u.z) ** 2), near = upper[d[0] <= d[1] ? 0 : 1].i;
      for (let c = 0; c < 4; c++) { let i = remap[j[v + c]]; if (i < 0) { if (w[v + c] > 0) moved += w[v + c]; i = near; } jj[v + c] = i; ww[v + c] = w[v + c]; }
      for (let c = 0; c < 4; c++) for (let e = c + 1; e < 4; e++) if (jj[v + e] === jj[v + c] && ww[v + e] > 0) { ww[v + c] += ww[v + e]; ww[v + e] = 0; }   // (two weights now on one bone: one entry)
      let s = 0; for (let c = 0; c < 4; c++) s += ww[v + c]; if (s > 0) for (let c = 0; c < 4; c++) ww[v + c] /= s; else { jj[v] = near; ww[v] = 1; } }
    return { mi: p.material, pos, nrm: accessor(G, A.NORMAL), tan: A.TANGENT !== undefined ? accessor(G, A.TANGENT) : null, uv: accessor(G, A.TEXCOORD_0), j: jj, w: ww, idx: accessor(G, p.indices), moved }; });
  // the glb: the 52 arm bones (the arms glb's names, order and inverse binds), one skinned mesh `sleeves_<side>`
  const J = { asset: { version: '2.0', generator: 'infra tools/import-cs2-sleeves.mjs' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'cs2_sleeves', children: [] }], meshes: [], skins: [], accessors: [], bufferViews: [], buffers: [], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }] };
  const chunks = []; let len = 0; const view = (b, target) => { while (len % 4) { chunks.push(Buffer.alloc(1)); len++; } const v = { buffer: 0, byteOffset: len, byteLength: b.byteLength }; if (target) v.target = target; chunks.push(Buffer.from(Buffer.from(b.buffer, b.byteOffset, b.byteLength))); len += b.byteLength;   /* (bytes, not elements: typed arrays too) */ J.bufferViews.push(v); return J.bufferViews.length - 1; };
  const acc = (arr, type, comp = 5126, target = 34962, mm = false) => { const a = { bufferView: view(arr, target), componentType: comp, count: arr.length / NC[type], type }; if (mm) { const c = NC[type]; a.min = []; a.max = []; for (let e = 0; e < c; e++) { let lo2 = Infinity, hi2 = -Infinity; for (let k = e; k < arr.length; k += c) { lo2 = Math.min(lo2, arr[k]); hi2 = Math.max(hi2, arr[k]); } a.min.push(lo2); a.max.push(hi2); } } J.accessors.push(a); return J.accessors.length - 1; };
  const tex = (b, mime) => { J.images.push({ bufferView: view(b), mimeType: mime }); J.textures.push({ source: J.images.length - 1, sampler: 0 }); return J.textures.length - 1; };
  const joints = bones.names.map((n, i) => { const m = bones.ibm.subarray(i * 16, i * 16 + 16); J.nodes.push({ name: n, matrix: [...invert4(m)] }); J.nodes[0].children.push(J.nodes.length - 1); return J.nodes.length - 1; });
  J.skins.push({ name: 'cs2_viewmodel_arms', joints, inverseBindMatrices: acc(new Float32Array(bones.ibm), 'MAT4', 5126, null) });
  // each material once: its maps cropped to the part of its picture in use (as export-fp-gloves.py)
  const mats = new Map(), minfo = [];
  for (const mi of new Set(prims.map(p => p.mi))) { const M0 = G.J.materials[mi], ps = prims.filter(p => p.mi === mi), vm = M0.extras?.vmat || {}, TP = vm.TextureParams || {}, V = vm.VectorParams || {}, I = vm.IntParams || {};
    const pic = k => { const f = TP[k] && path.join(dir, TP[k].replace(/\.vtex$/, '.png')); return f && existsSync(f) ? readPNG(readFileSync(f)) : null; };
    const nor0 = pic('g_tNormal'); if (!nor0) throw Error(agent + ': no normal map for ' + M0.name); const W = nor0.w, H = nor0.h, WHITE = { w: 1, h: 1, data: new Uint8Array([255, 255, 255, 255]) };
    const col0 = resample(pic('g_tColor') || WHITE, W, H), ao0 = resample(pic('g_tAmbientOcclusion') || WHITE, W, H), met0 = pic('g_tMetalness');
    const lo = [1, 1], hi = [0, 0]; for (const p of ps) for (let k = 0; k < p.uv.length; k += 2) for (const c of [0, 1]) { const u = Math.min(1, Math.max(0, p.uv[k + c])); lo[c] = Math.min(lo[c], u); hi[c] = Math.max(hi[c], u); }
    let x0 = Math.max(0, Math.floor(lo[0] * W) - 16) >> 2 << 2, x1 = Math.min(W, Math.ceil((Math.ceil(hi[0] * W) + 16) / 4) * 4), y0 = Math.max(0, Math.floor(lo[1] * H) - 16) >> 2 << 2, y1 = Math.min(H, Math.ceil((Math.ceil(hi[1] * H) + 16) / 4) * 4);
    const skin = /^bare_arm/.test(String(vm.Name || M0.name || '').split('/').pop()), cut = !skin && (x1 - x0) * (y1 - y0) < .6 * W * H; if (!cut) { x0 = 0; y0 = 0; x1 = W; y1 = H; }   // (a bare forearm whole: the arms glb's own bare_arm_133 picture, so fp-view can share it)
    if (cut) for (const p of ps) for (let k = 0; k < p.uv.length; k += 2) { p.uv[k] = (p.uv[k] * W - x0) / (x1 - x0); p.uv[k + 1] = (p.uv[k + 1] * H - y0) / (y1 - y0); }
    const col = crop(col0, x0, y0, x1, y1), nor = crop(nor0, x0, y0, x1, y1), ao = crop(ao0, x0, y0, x1, y1), cloth = !!I.F_CLOTH_SHADING, met = met0 && !cloth ? crop(resample(met0, W, H), x0, y0, x1, y1) : null;
    const bc = V.g_vRoughnessAdjustBrightnessContrast || [0, 1, 0, 0], w = x1 - x0, h = y1 - y0, orm = { w, h, data: new Uint8Array(w * h * 4) }; let rsum = 0;
    for (let q = 0; q < w * h; q++) { const r = Math.min(1, Math.max(.04, (nor.data[q * 4 + 3] / 255 - .5) * bc[1] + .5 + bc[0])); rsum += r; orm.data[q * 4] = ao.data[q * 4]; orm.data[q * 4 + 1] = Math.round(r * 255); orm.data[q * 4 + 2] = met ? met.data[q * 4] : 0; orm.data[q * 4 + 3] = 255; }
    const ormS = shrink(orm, Math.max(4, w >> 1), Math.max(4, h >> 1)), colPNG = writePNG(w, h, col.data, 3), colJPG = toJPEG(colPNG, tmp), ormT = tex(writePNG(ormS.w, ormS.h, ormS.data, 3), 'image/png');
    const mname = String(vm.Name || M0.name || 'sleeve').split('/').pop().replace(/\.vmat$/, ''), part = /^bare_arm/.test(mname) ? 'skin' : 'sleeve';   // (export-fp-gloves.py's rule: a bare forearm is skin)
    J.materials.push({ name: mname, pbrMetallicRoughness: { baseColorFactor: M0.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1], baseColorTexture: { index: tex(colJPG || colPNG, colJPG ? 'image/jpeg' : 'image/png') }, metallicFactor: 1, roughnessFactor: 1, metallicRoughnessTexture: { index: ormT } },
      normalTexture: { index: tex(writePNG(w, h, nor.data, 3), 'image/png') }, occlusionTexture: { index: ormT }, extras: { part, cloth, vmat: vm.Name || '', size: [w, h], ormSize: [ormS.w, ormS.h], roughMean: Math.round(rsum / (w * h) * 1e3) / 1e3, agent } });
    mats.set(mi, J.materials.length - 1); minfo.push({ name: mname, part, vmat: vm.Name || '', tint: V.g_vColorTint || null, size: [w, h], cropped: cut }); }
  J.meshes.push({ name: 'sleeves_' + side, primitives: prims.map(p => { const n = p.pos.length / 3, big = n >= 65536, A = { POSITION: acc(p.pos, 'VEC3', 5126, 34962, true), NORMAL: acc(p.nrm, 'VEC3'), TEXCOORD_0: acc(p.uv, 'VEC2'), JOINTS_0: acc(p.j, 'VEC4', 5121), WEIGHTS_0: acc(p.w, 'VEC4') };
    if (p.tan) A.TANGENT = acc(p.tan, 'VEC4'); return { attributes: A, indices: acc(big ? new Uint32Array(p.idx) : new Uint16Array(p.idx), 'SCALAR', big ? 5125 : 5123, 34963), material: mats.get(p.mi) }; }), extras: { side, part: 'sleeves', agent } });
  J.nodes.push({ name: 'sleeves_' + side, mesh: 0, skin: 0 }); J.nodes[0].children.push(J.nodes.length - 1);
  while (len % 4) { chunks.push(Buffer.alloc(1)); len++; } J.buffers = [{ byteLength: len }]; let js = Buffer.from(JSON.stringify(J)); if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - js.length % 4, 0x20)]);
  const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + len, 8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(len, 0); bh.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([head, jh, js, bh, ...chunks]), moved = prims.reduce((s, p) => s + p.moved, 0), verts = prims.reduce((s, p) => s + p.pos.length / 3, 0);
  const main = minfo.find(m => m.part === 'sleeve') || minfo[0];
  return { glb, info: { agent, side, material: main.name, vmat: main.vmat, tint: main.tint, size: main.size, cropped: main.cropped, materials: minfo, tris: prims.reduce((s, p) => s + p.idx.length / 3, 0), worstBind, movedWeight: Math.round(moved / verts * 1e3) / 1e3 } };
}
function invert4(m) {   // a column-major 4×4 inverse (bind matrices: affine)
  const a = Array.from(m), o = new Array(16), [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return o;
}

// ── The run ──
const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 12);
function backupDir(dir) { if (!existsSync(dir)) return null; const bak = `${dir}.bak-${stamp()}`; renameSync(dir, bak);
  const base = path.basename(dir), up = path.dirname(dir), olds = readdirSync(up).filter(f => f.startsWith(base + '.bak-')).sort(); for (const o of olds.slice(0, -2)) rmSync(path.join(up, o), { recursive: true, force: true });   // (ours: two kept)
  return bak; }
async function main() {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }, has = k => argv.includes(k);
  const CS2 = path.resolve(opt('--cs2', path.join(os.homedir(), 'CS2-extract'))), ASSETS = path.resolve(opt('--assets', path.join(ROOT, 'user-assets'))), INSTALL = !has('--no-install');
  const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
  for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V], ['user-assets manifest', path.join(ASSETS, 'manifest.json')]]) if (!existsSync(p)) { console.error(`No ${what} at ${p}`); process.exit(1); }
  const WORK = path.resolve(opt('--work', mkdtempSync(path.join(os.tmpdir(), 'gd-sleeves-')))); mkdirSync(WORK, { recursive: true });
  const s2v = (args, enc) => execFileSync(S2V, args, { encoding: enc, stdio: ['ignore', enc ? 'pipe' : 'ignore', 'ignore'], maxBuffer: 256 << 20 });
  const { THREE, CA, man, drawn } = await nodeAgents(ASSETS);
  let agents = (opt('--agents', '') || '').split(',').filter(Boolean);
  if (has('--all')) agents = s2v(['-i', VPK, '-l', '-f', 'agents/models/', '-e', 'vmdl_c'], 'utf8').split('\n').map(l => /agents\/models\/(?:c?tm_[a-z0-9_]+)\/((?:ctm|tm)_[a-z0-9_]+)\.vmdl_c/.exec(l)?.[1]).filter(Boolean);
  if (!agents.length) agents = DEFAULT_AGENTS.slice(); for (const a of Object.values(drawn)) if (a && !agents.includes(a)) agents.unshift(a);
  agents = [...new Set(agents)].filter(a => sideOfAgent(a));
  const raw = a => { const f = path.join(WORK, a + '.vmdl_c'); if (!existsSync(f)) { s2v(['-i', VPK, '-f', vmdlOf(a), '-o', f]); if (!existsSync(f)) throw Error('Not in this CS2 install: ' + vmdlOf(a)); } return f; };
  const report = { hitboxes: null, sleeves: [] };
  // 1. hit boxes: the set of the agent each side is drawn as, posed on that agent; every other agent's set compared
  let hb = null;
  if (!has('--sleeves-only')) {
    const sets = {}; for (const a of agents.concat(Object.values(drawn).filter(Boolean))) if (!sets[a]) try { sets[a] = hitboxSetOf(s2v(['-i', raw(a), '-b', 'MDAT'], 'utf8'), vmdlOf(a)); } catch (e) { console.warn('  hit boxes', a, e.message); }
    const ref = sets[drawn.ct] || sets[drawn.t], same = Object.entries(sets).filter(([, s]) => JSON.stringify(s.boxes) === JSON.stringify(ref.boxes)).map(([a]) => a), differ = Object.keys(sets).filter(a => !same.includes(a));
    hb = { version: 2, from: 'CS2: m_hitboxsets "cstrike" of ' + Object.values(drawn).map(vmdlOf).join(' and ') + ' (MDAT), posed on user-assets/agents with cs2_anims.glb hold clips, every item', units: 'hu', made: new Date().toISOString(),
      agents: drawn, sameIn: same, differIn: differ, pitch: 'cs2-agents.js: ±1.2 rad, a third on each of spine_1..3 about axis through piv (gd-hitboxes.js)', sides: {}, raw: {} };
    for (const side of ['ct', 't']) { const s = sets[drawn[side]]; if (!s) throw Error('no hit box set for the ' + side + ' agent ' + drawn[side]); hb.raw[side] = s; hb.sides[side] = await poseAll(THREE, CA, side, s.boxes);
      console.log(`  hit boxes ${side}: ${Object.keys(hb.sides[side].ids).length} items in ${Object.keys(hb.sides[side].poses).length} distinct holds (standing and crouched)`); }
    report.hitboxes = { boxes: ref.boxes.length, groups: [...new Set(ref.boxes.map(b => b.group))].sort(), sameIn: same.length, differIn: differ };
    console.log(`hit boxes: ${ref.boxes.length} capsules, groups ${report.hitboxes.groups.join(' ')}; identical in ${same.length} of ${Object.keys(sets).length} agents${differ.length ? ' (differ: ' + differ.join(', ') + ')' : ''}`);
  }
  // 2. sleeves: one glb per agent
  const sleeves = [];
  if (!has('--hitboxes-only')) {
    if (!man.models?.fpGloves?.file) throw Error('no CS2 first-person arms in user-assets (tools/export-fp-gloves.py first): the sleeves ride on their bones');
    const bones = armBones(readFileSync(path.join(ASSETS, man.models.fpGloves.file)));
    for (const a of agents) { const side = sideOfAgent(a), out = path.join(WORK, 'sl-' + a); mkdirSync(out, { recursive: true });
      try { const glbIn = path.join(out, a + '.glb'); if (!existsSync(glbIn)) s2v(['-i', VPK, '-f', vmdlOf(a), '-o', glbIn, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials', '--gltf_mesh_list', 'firstperson_sleeves', '--gltf_export_animations', '--gltf_animation_list', '__none__']);
        if (!existsSync(glbIn)) throw Error('Source2Viewer wrote no glb');
        const { glb, info } = buildSleeve(a, side, readFileSync(glbIn), out, bones, out), file = `${a}-${createHash('sha1').update(glb).digest('hex').slice(0, 8)}.glb`;
        if (info.worstBind > 1e-3) throw Error('its arm bind pose differs from the arms glb (' + info.worstBind.toExponential(2) + ')');
        writeFileSync(path.join(WORK, file), glb); sleeves.push({ ...info, file, bytes: glb.length });
        console.log(`  sleeves ${side} ${a}: ${info.material} ${info.size.join('×')}${info.cropped ? ' (cropped)' : ''}, ${info.tris} triangles, ${(glb.length / 1048576).toFixed(1)} MB, bind Δ ${info.worstBind.toExponential(1)}${info.movedWeight ? ', ' + (info.movedWeight * 100).toFixed(1) + '% of the weight moved off the shoulder onto the upper arm' : ''}${info.materials.length > 1 ? ' + ' + info.materials.filter(m => m !== info.materials.find(x => x.name === info.material)).map(m => m.name).join(', ') : ''}`);
      } catch (e) { console.warn('  sleeves', a, 'skipped:', e.message); } }
    report.sleeves = sleeves;
  }
  if (!INSTALL) { console.log('built in', WORK, '(--no-install)'); return report; }
  // install (back-up rule)
  const mp = path.join(ASSETS, 'manifest.json'); copyFileSync(mp, path.join(ASSETS, `manifest.bak-sleeves-${stamp()}.json`));
  const put = {};
  if (hb) { const d = path.join(ASSETS, 'hitboxes'), bak = backupDir(d), txt = JSON.stringify(hb), f = `cs2-hitboxes-${createHash('sha1').update(txt).digest('hex').slice(0, 8)}.json`; mkdirSync(d, { recursive: true }); writeFileSync(path.join(d, f), txt, { flag: 'wx' }); if (bak) console.log('backed up', bak);
    put.hitboxes = { file: 'hitboxes/' + f, from: hb.from, agents: drawn }; }
  if (sleeves.length) { const d = path.join(ASSETS, 'sleeves'), bak = backupDir(d); mkdirSync(d, { recursive: true }); for (const s of sleeves) copyFileSync(path.join(WORK, s.file), path.join(d, s.file));
    const list = { version: 1, made: new Date().toISOString(), bones: man.models.fpGloves.file, agents: Object.fromEntries(sleeves.map(s => [s.agent, { side: s.side, file: 'sleeves/' + s.file, material: s.material, vmat: s.vmat, bytes: s.bytes }])) };
    const lt = JSON.stringify(list, null, 1), lf = `sleeves-${createHash('sha1').update(lt).digest('hex').slice(0, 8)}.json`; writeFileSync(path.join(d, lf), lt, { flag: 'wx' }); if (bak) console.log('backed up', bak);
    put.sleeves = { file: 'sleeves/' + lf, agents: sleeves.length, bytes: sleeves.reduce((n, s) => n + s.bytes, 0), from: 'CS2: the agents\' firstperson_sleeves meshes (agents/models/*, Steam depot, converted on this computer)' }; }
  const cur = JSON.parse(readFileSync(mp, 'utf8')); cur.models ??= {}; Object.assign(cur.models, put);   // (read just before the write: another importer's change in between is kept)
  // (the manifest's hash is left alone: every file here is named by its content, so no page can hold a stale copy and
  // the live room's other cached files stay cached)
  const tmp = mp + '.sleeves-tmp'; writeFileSync(tmp, JSON.stringify(cur, null, 1)); renameSync(tmp, mp);
  console.log('installed →', Object.keys(put).map(k => 'models.' + k).join(', '), 'in', mp);
  if (put.hitboxes) console.log('(a Global Defensive room already running keeps its hit boxes until restarted or a pack is installed; pages read them when loaded)');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e?.stack || e); process.exit(1); });
