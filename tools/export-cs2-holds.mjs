// Third-person holds from Counter-Strike 2's own data (package T, v52): reads the CS2 install on this computer
// (~/CS2-extract: Source2Viewer-CLI and pak01_dir.vpk) and writes user-assets/holds/ — local only, never committed
// or shipped (Valve's data):
//   holds.json        per item (game id): CS2's world model measured in its own `weapon` bone frame (Source axes:
//                     +x the muzzle, +z up, +y left; metres) — mesh bounds, area centroid, muzzle point, trigger bone.
//                     How CS2 hangs a world weapon on an agent: the model's `weapon` bone sits on the agent's `wpn` bone
//                     (= attachHand_R in every clip; measured: 0.0 cm apart), so this frame IS wpn's.
//   holds-clips.json  CS2's own third-person idle clips the agents file (cs2_anims.glb) lacks: each knife's own hold
//                     (default CT / T, karambit, butterfly, M9, stiletto: knife-ct/hold, knife-t/hold, karambit/hold …;
//                     cs2_anims.glb's knife/hold is the shared _default_knife idle) and the molotov's, standing and crouched
//                     (three.js AnimationClip JSON, the agents' bone names, root_motion's Z-up turn baked in as
//                     ~/CS2-extract/build/agent_anims.py does).
//   holds-truth.json  ground truth for tests/gd-agent-hold.mjs and tests/browser/gd-models-sheet.mjs: each item in its
//                     CS2 hold clip's first frame (standing / crouched), in the agent's root frame (metres, Y up,
//                     facing +z): the wpn bone, the muzzle (point, direction), both hands and CS2's hand targets
//                     (wpnHand_R / _L), the right shoulder and the butt (stock-to-shoulder distance).
//   src/              the raw Source2Viewer exports (cache; the contact sheet draws CS2's own models from here), always
//                     with the model's skeleton (--gltf_export_animations: without it Source2Viewer writes no bones and the
//                     `weapon` bone frame is lost — v52 wave 3: the AUG's data came from a bone-less export, its frame was
//                     the model root, 14.5 cm off the weapon bone, so the AUG hung 11 cm above the hands). A model this
//                     Source2Viewer cannot read (the AUG: KV3 types 26 / 27, CS2's October 2026 update) is exported from a
//                     scratch copy rewritten by tools/cs2-fp/kv3_compat.py (package M's). A gun with no `weapon` bone
//                     is refused (left out: the game keeps its palm grip), never measured from its root.
//   node tools/export-cs2-holds.mjs [--cs2 ~/CS2-extract] [--out user-assets/holds]
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path'; import os from 'node:os';
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding|Couldn't load texture/.test(String(a[0]))) w(...a); }; }
const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '..');
const THREE = await import(path.join(repo, 'dist/three.module.js')); const { gltfLoader } = await import(path.join(repo, 'dist/gltf-loader.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CS2 = path.resolve(arg('--cs2', path.join(os.homedir(), 'CS2-extract'))), OUT = path.resolve(arg('--out', path.join(repo, 'user-assets/holds'))), SRC = path.join(OUT, 'src');
const S2V = path.join(CS2, 'tools/s2v/Source2Viewer-CLI'), PAK = path.join(CS2, 'game/game/csgo/pak01_dir.vpk'), GI = path.join(CS2, 'game/game/csgo/gameinfo.gi');
if (!existsSync(S2V) || !existsSync(PAK)) { console.log('No CS2 install with Source2Viewer-CLI at ' + CS2 + ' (--cs2 <dir>)'); process.exit(1); }
mkdirSync(SRC, { recursive: true });
// game id → CS2 world model (weapons/models/<…>.vmdl_c)
const W = { pistol: 'glock18/weapon_pist_glock18', usps: 'usp_silencer/weapon_pist_usp_silencer', p250: 'p250/weapon_pist_p250', fiveseven: 'fiveseven/weapon_pist_fiveseven', cz75: 'cz75a/weapon_pist_cz75a', tec9: 'tec9/weapon_pist_tec9', deagle: 'deagle/weapon_pist_deagle',
  mac10: 'mac10/weapon_smg_mac10', mp9: 'mp9/weapon_smg_mp9', mp7: 'mp7/weapon_smg_mp7', smg: 'mp5sd/weapon_smg_mp5sd', bizon: 'bizon/weapon_smg_bizon', ump45: 'ump45/weapon_smg_ump45', p90: 'p90/weapon_smg_p90',
  shotgun: 'nova/weapon_shot_nova', xm1014: 'xm1014/weapon_shot_xm1014', galil: 'galilar/weapon_rif_galilar', famas: 'famas/weapon_rif_famas', ak: 'ak47/weapon_rif_ak47', m4: 'm4a4/weapon_rif_m4a4', m4s: 'm4a1_silencer/weapon_rif_m4a1_silencer',
  sg553: 'sg556/weapon_rif_sg556', aug: 'aug/weapon_rif_aug', ssg08: 'ssg08/weapon_snip_ssg08', sniper: 'awp/weapon_snip_awp', lmg: 'm249/weapon_mach_m249', negev: 'negev/weapon_mach_negev',
  knife: 'knife/knife_default_ct/weapon_knife_default_ct', 'knife-t': 'knife/knife_default_t/weapon_knife_default_t', karambit: 'knife/knife_karambit/weapon_knife_karambit', butterfly: 'knife/knife_butterfly/weapon_knife_butterfly', stiletto: 'knife/knife_stiletto/weapon_knife_stiletto', m9: 'knife/knife_m9/weapon_knife_m9',
  // (v53 KNIVES: CS2's Bayonet, Skeleton, Talon — weapon_knife_widowmaker, model folder knife_talon —, Flip and Nomad — knife_outdoor)
  bayonet: 'knife/knife_bayonet/weapon_knife_bayonet', skeleton: 'knife/knife_skeleton/weapon_knife_skeleton', talon: 'knife/knife_talon/weapon_knife_talon', flip: 'knife/knife_flip/weapon_knife_flip', nomad: 'knife/knife_outdoor/weapon_knife_outdoor',
  he: 'grenade/hegrenade/weapon_hegrenade', flash: 'grenade/flashbang/weapon_flashbang', smoke: 'grenade/smokegrenade/weapon_smokegrenade', decoy: 'grenade/decoy/weapon_decoy', molotov: 'grenade/molotov/weapon_molotov', incendiary: 'grenade/incendiary/weapon_incendiarygrenade', c4: 'c4/weapon_c4' };
// The hold clip each item plays in game (cs2-agents.js setGun): a gun its own (cs2_anims.glb: <id>/hold), each knife
// its own (CS2's per-knife idle; the karambit's is its own grip), the molotov its own, other grenades the shared one.
const A = 'animation/anims/world/', EXTRA = { 'knife-ct': 'knife/default_ct/idle%_default_ct', 'knife-t': 'knife/default_t/idle%_default_t', karambit: 'knife/knife_karambit/idle%_karambit', butterfly: 'knife/knife_butterfly/idle%_butterfly',
  stiletto: 'knife/knife_stiletto/idle%_stiletto', m9: 'knife/knife_m9/idle%_m9', molotov: 'grenade/grenade_molotov/idle%_molotov',
  bayonet: 'knife/knife_bayonet/idle%_bayonet', skeleton: 'knife/knife_skeleton/idle%_skeleton', talon: 'knife/knife_talon/idle%_talon', flip: 'knife/knife_flip/idle%_flip', nomad: 'knife/knife_outdoor/idle%_outdoor' };   // (v53 KNIVES: each its own CS2 idle)
const NADES = ['he', 'flash', 'smoke', 'decoy', 'incendiary'];
const tp = JSON.parse(readFileSync(path.join(CS2, 'export/tp/clips.json'), 'utf8'));   // (what cs2_anims.glb was built from: ~/CS2-extract/build/tp_clips.py)
const s2v = (vpkPath, out, anim) => { if (existsSync(out)) return out; try { execFileSync(S2V, ['-i', PAK, '-f', vpkPath, '-o', out, '-d', '--gltf_export_format', 'glb', ...(anim ? ['--gltf_export_animations'] : [])], { stdio: 'ignore', cwd: SRC }); } catch {} return existsSync(out) ? out : null; };
// An export with the model's skeleton: a glb whose nodes include the `weapon` bone (read from its JSON chunk).
const hasBone = f => { try { const b = readFileSync(f), n = b.readUInt32LE(12); return JSON.parse(b.subarray(20, 20 + n).toString()).nodes?.some(o => o.name === 'weapon'); } catch { return false; } };
// A world model exported again, with its skeleton, into `out` (replacing a bone-less cache file): straight from the vpk, or —
// where this Source2Viewer stops on newer KV3 — from a scratch copy rewritten by kv3_compat.py, exported by its relative path.
function s2vSkel(vpkPath, out) { const tmp = mkdtempSync(path.join(os.tmpdir(), 'cs2-holds-')), o = path.join(tmp, path.basename(out)), flags = ['-d', '--gltf_export_format', 'glb', '--gltf_export_animations'];
  try { try { execFileSync(S2V, ['-i', PAK, '-f', vpkPath, '-o', o, ...flags], { stdio: 'ignore', cwd: tmp }); } catch {}
    if (!hasBone(o)) { const raw = path.join(tmp, 'raw.vmdl_c'), fixed = path.join(tmp, 'fixed'); mkdirSync(path.join(fixed, path.dirname(vpkPath)), { recursive: true });
      try { execFileSync(S2V, ['-i', PAK, '-f', vpkPath, '-o', raw], { stdio: 'ignore' }); execFileSync('python3', ['-I', path.join(repo, 'tools/cs2-fp/kv3_compat.py'), raw, path.join(fixed, vpkPath)], { stdio: 'ignore' });
        execFileSync(S2V, ['-i', vpkPath, '--game', GI, '-o', o, ...flags], { stdio: 'ignore', cwd: fixed }); } catch {} }
    if (!hasBone(o)) return null; renameSync(o, out); return out; } finally { rmSync(tmp, { recursive: true, force: true }); } }
const parse = f => { const b = readFileSync(f); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
const r5 = x => Math.round(x * 1e5) / 1e5, arr = v => v.toArray().map(r5);
// ── the world models ──
const items = {}, meshes = {}, TRIS = {};
// The nearest point of a triangle soup (flat Float32Array) to p.
const nearestOn = (T, p) => { const tri = new THREE.Triangle(), q = new THREE.Vector3(), best = new THREE.Vector3(); let bd = Infinity; for (let i = 0; i < T.length; i += 9) { tri.a.fromArray(T, i); tri.b.fromArray(T, i + 3); tri.c.fromArray(T, i + 6); const d = tri.closestPointToPoint(p, q).distanceToSquared(p); if (d < bd) { bd = d; best.copy(q); } } return best; };
for (const [id, m] of Object.entries(W)) {
  const own = path.join(CS2, 'export/weapons', path.basename(m) + '.glb'), mine = path.join(SRC, path.basename(m) + '.glb'); if (existsSync(own) && !existsSync(mine)) copyFileSync(own, mine);   // (src/ keeps every model: the contact sheet draws CS2's own as the reference)
  const vp = 'weapons/models/' + m + '.vmdl_c'; let f = s2v(vp, mine, true); if (!f || !hasBone(f)) f = s2vSkel(vp, mine);   // (a cached export without the skeleton is made again with it)
  if (!f) { console.log('  ' + id + ': no export of ' + m + ' with its weapon bone (Source2Viewer cannot read it, even rewritten) — left out: the game keeps its palm grip for it'); continue; }
  const g = await parse(f); g.scene.updateMatrixWorld(true); const wb = g.scene.getObjectByName('weapon');
  if (!wb) { console.log('  ' + id + ': ' + m + ' has no weapon bone — left out (never measured from its root)'); continue; }
  const iW = wb.matrixWorld.clone().invert(), at = n => { const o = g.scene.getObjectByName(n); return o ? arr(o.getWorldPosition(new THREE.Vector3()).applyMatrix4(iW)) : null; };
  // the drawn mesh: CS2's HD body when it has one (the imported models are those), else its legacy body; physics and screens left out
  const all = []; g.scene.traverse(o => { if (o.isMesh) all.push(o); }); const hd = all.filter(o => /body_hd/.test(o.name)), body = hd.length ? hd : all.filter(o => /body/.test(o.name)).length ? all.filter(o => /body/.test(o.name)) : all;
  const box = new THREE.Box3(), c = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(); let area = 0; const pts = [], tv = [];
  // (the molotov as the game draws it — the bottle (weapon-models.js, package M): its lighter (the vertices riding the lighter
  // bones) and the wick's flame cards left out; with them its bounds ran 14 cm past the bottle and the bottle sat 8.7 cm off)
  const DROP = id === 'molotov' ? /^lighter/ : null;
  for (const o of body) { if (DROP && /flame/.test([].concat(o.material)[0]?.name || '')) continue; const p = o.geometry.attributes.position, P = [], v = new THREE.Vector3(), skip = new Uint8Array(p.count), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < p.count; i++) { if (DROP && si && sw && o.skeleton) { let bi = 0; for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, bi)) bi = k; skip[i] = DROP.test(o.skeleton.bones[si.getComponent(i, bi)]?.name || '') ? 1 : 0; }
      v.fromBufferAttribute(p, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(iW); P.push(v.clone()); if (!skip[i]) box.expandByPoint(v); }
    const ix = o.geometry.index; for (let t = 0; t < (ix ? ix.count : p.count); t += 3) { const i0 = ix ? ix.getX(t) : t, i1 = ix ? ix.getX(t + 1) : t + 1, i2 = ix ? ix.getX(t + 2) : t + 2; if (skip[i0] || skip[i1] || skip[i2]) continue; a.copy(P[i0]); b.copy(P[i1]); d.copy(P[i2]);
      tv.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z); const s = e1.subVectors(b, a).cross(e2.subVectors(d, a)).length() / 2; area += s; c.addScaledVector(a.add(b).add(d), s / 3); } pts.push(...P.filter((_, i) => !skip[i])); }
  TRIS[id] = new Float32Array(tv);   // (its triangles, weapon frame: where the hands touch it — the grip data below)
  c.divideScalar(area || 1); const kind = /^knife|karambit|butterfly|stiletto|m9|bayonet|skeleton|talon|flip|nomad$/.test(id) ? 'knife' : NADES.includes(id) || id === 'molotov' ? 'nade' : id === 'c4' ? 'c4' : 'gun';
  // muzzle: guns — the centre of the vertices within 1 cm of the front end (+x); knives — the blade's tip end (+z in their frame)
  let muzzle = null; if (kind === 'gun') { const f0 = pts.filter(p => p.x > box.max.x - .01); muzzle = arr(f0.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(f0.length)); }
  else if (kind === 'knife') { const f0 = pts.filter(p => p.z > box.max.z - .01); muzzle = arr(f0.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(f0.length)); }
  const butt = kind === 'gun' ? (() => { const f0 = pts.filter(p => p.x < box.min.x + .01); return arr(f0.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(f0.length)); })() : null;
  // (every CS2 gun's bore runs within 3.4 cm of its weapon bone and carries ag1_hand_r: one that does not was measured in the wrong frame)
  if (kind === 'gun' && (!muzzle || Math.hypot(muzzle[1], muzzle[2]) > .05 || !g.scene.getObjectByName('ag1_hand_r'))) { console.log('  ' + id + ': bore ' + (muzzle ? (Math.hypot(muzzle[1], muzzle[2]) * 100).toFixed(1) + ' cm' : '?') + ' off its weapon bone / no ag1_hand_r — left out'); continue; }
  items[id] = { vmdl: 'weapons/models/' + m + '.vmdl', file: 'src/' + path.basename(mine), kind, box: [arr(box.min), arr(box.max)], c: arr(c), muzzle, butt, trigger: at('trigger'), hand: at('ag1_hand_r') }; meshes[id] = true;
  console.log('  ' + id.padEnd(10) + ' box ' + items[id].box.map(v => v.map(x => (x * 100).toFixed(1)).join(',')).join(' | ') + ' cm');
}
// ── the extra clips (each knife's and the molotov's own hold) ──
const clipFile = (vnm, name) => s2v(vnm, path.join(SRC, name.replace(/\//g, '__') + '.glb'), true);
const ROOTKIDS = new Set(['pelvis', 'wpnPivot', 'wpnAimIntent', 'attachWorld', 'camera']);
function bakeClip(g, name) {   // root motion out, root_motion's turn into its children's tracks, at most 30 keys a second
  const rm = g.scene.getObjectByName('root_motion'), R = rm.quaternion.clone(), kids = new Set(rm.children.map(o => o.name)), q = new THREE.Quaternion(), v = new THREE.Vector3(), tracks = [];
  for (const t of g.animations[0].tracks) { const [node, prop] = t.name.split('.'); if (node === 'root_motion' || prop === 'scale') continue;
    let times = Array.from(t.times), vals = Array.from(t.values); const n = prop === 'quaternion' ? 4 : 3;
    if (kids.has(node)) for (let i = 0; i < times.length; i++) { if (n === 4) { q.fromArray(vals, i * 4).premultiply(R).toArray(vals, i * 4); } else { v.fromArray(vals, i * 3).applyQuaternion(R).toArray(vals, i * 3); } }
    const same = vals.every((x, i) => Math.abs(x - vals[i % n]) < 1e-4); if (same) { times = [0]; vals = vals.slice(0, n); }
    else if (times.length > 2) { const dt = (times.at(-1) - times[0]) / (times.length - 1), step = Math.max(1, Math.round((1 / 30) / dt)); if (step > 1) { const keep = []; for (let i = 0; i < times.length; i += step) keep.push(i); if (keep.at(-1) !== times.length - 1) keep.push(times.length - 1); times = keep.map(i => times[i]); vals = keep.flatMap(i => vals.slice(i * n, i * n + n)); } }
    tracks.push({ name: t.name, type: prop === 'quaternion' ? 'quaternion' : 'vector', times: times.map(r5), values: vals.map(r5) }); }
  return { name, duration: g.animations[0].duration, tracks };
}
const clips = [], clipGlb = {};
for (const [id, pat] of Object.entries(EXTRA)) for (const [k, crouch] of [['hold', ''], ['hold_crouch', '_crouch']]) {
  const vnm = A + pat.replace('%', crouch) + '.vnmclip+non_additive.vnmclip_c', name = id + '/' + k, f = clipFile(vnm, name); if (!f) { console.log('  clip missing: ' + vnm); continue; }
  const g = await parse(f); clips.push(bakeClip(g, name)); clipGlb[name] = g; }
// ── ground truth: each item in its hold's first frame ──
const clipFor = (id, k) => (id = id === 'knife' ? 'knife-ct' : id, clipGlb[id + '/' + k]) ? Promise.resolve(clipGlb[id + '/' + k]) : (() => { const gid = NADES.includes(id) ? 'nade' : id, e = tp[gid + '/' + k] || tp[gid + '/hold']; return e ? parse(path.join(CS2, 'export/tp', e.file)) : null; })();
const truth = {};
for (const id of Object.keys(W)) { const it = items[id]; truth[id] = {};
  for (const [st, k] of [['stand', 'hold'], ['crouch', 'hold_crouch']]) { const g = await clipFor(id, k); if (!g) continue; const sk = g.scene, mx = new THREE.AnimationMixer(sk); mx.clipAction(g.animations[0]).play(); mx.update(0); sk.updateMatrixWorld(true);
    const P = n => { const o = sk.getObjectByName(n); return o ? arr(o.getWorldPosition(new THREE.Vector3())) : null; }, wpn = sk.getObjectByName('wpn'), M = wpn.matrixWorld, Q = wpn.getWorldQuaternion(new THREE.Quaternion());
    const T = { wpn: { p: P('wpn'), q: arr(Q) }, handR: P('hand_R'), handL: P('hand_L'), gripR: P('wpnHand_R'), gripL: P('wpnHand_L'), shoulder: P('arm_upper_R'), attachR: P('attachHand_R') };
    if (it) { const kd = it.kind === 'knife' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0); T.dir = arr(kd.applyQuaternion(Q));
      if (it.muzzle) T.muzzle = arr(new THREE.Vector3(...it.muzzle).applyMatrix4(M)); if (it.butt) { const b = new THREE.Vector3(...it.butt).applyMatrix4(M); T.butt = arr(b); T.stockToShoulder = r5(b.distanceTo(new THREE.Vector3(...T.shoulder))); }
      T.centre = arr(new THREE.Box3(new THREE.Vector3(...it.box[0]), new THREE.Vector3(...it.box[1])).getCenter(new THREE.Vector3()).applyMatrix4(M));
      // both hands on it? (the left hand within 6 cm of the model's bounds, in its own frame)
      const hl = new THREE.Vector3(...T.handL).applyMatrix4(M.clone().invert()); T.twoHands = new THREE.Box3(new THREE.Vector3(...it.box[0]), new THREE.Vector3(...it.box[1])).distanceToPoint(hl) < .06;
      // Where CS2's hands touch its gun (standing hold; weapon frame, metres): each palm's centre (half way from the wrist to
      // the middle knuckle), the nearest point of the gun's surface to it (grip), and the left wrist — so a stand-in gun of
      // another shape can be fitted to the same hand contacts and the left hand laid on its own surface (cs2-agents holdFit).
      // (knives too: a star knife baked from its first-person set has another handle than CS2's world model — its right palm
      // contact is where cs2-agents lays that handle, not its tip alone: the M9's palm sat 3.9 cm off it vs CS2's 1.9)
      if (st === 'stand' && (it.kind === 'gun' || it.kind === 'knife') && TRIS[id]) { const iM = M.clone().invert(), W3 = n => { const o = sk.getObjectByName(n); return o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(iM) : null; }, palm = s => W3('hand_' + s)?.add(W3('finger_middle_0_' + s) || W3('hand_' + s)).multiplyScalar(.5);
        const pR = palm('R'), pL = palm('L'); if (pR && pL) it.hands = { palmR: arr(pR), gripR: arr(nearestOn(TRIS[id], pR)), palmL: arr(pL), gripL: arr(nearestOn(TRIS[id], pL)), wristL: arr(W3('hand_L')), two: T.twoHands }; } }
    truth[id][st] = T; }
  if (truth[id].stand) console.log('  ' + id.padEnd(10) + ' muzzle ' + (truth[id].stand.muzzle || []).map(x => (x * 100).toFixed(0)).join(',') + ' dir ' + (truth[id].stand.dir || []).map(x => x.toFixed(2)).join(',') + (truth[id].stand.stockToShoulder ? ' stock→shoulder ' + (truth[id].stand.stockToShoulder * 100).toFixed(1) + ' cm' : '') + (truth[id].stand.twoHands ? ' two hands' : ''));
}
// (v53 KNIVES: the back-up rule — the files there now are copied to holds.bak-<stamp>/ first, never written over unkept)
{ const old = ['holds.json', 'holds-clips.json', 'holds-truth.json'].filter(f => existsSync(path.join(OUT, f)));
  if (old.length) { const bak = OUT + '.bak-' + new Date().toISOString().replace(/\D/g, '').slice(0, 12); mkdirSync(bak, { recursive: true }); for (const f of old) copyFileSync(path.join(OUT, f), path.join(bak, f)); console.log('kept the old ' + old.join(', ') + ' in ' + bak); } }
writeFileSync(path.join(OUT, 'holds.json'), JSON.stringify({ version: 1, from: 'Counter-Strike 2 (local install): world models in their weapon bone frame (metres, Source axes)', items }));
writeFileSync(path.join(OUT, 'holds-clips.json'), JSON.stringify({ version: 1, clips }));
writeFileSync(path.join(OUT, 'holds-truth.json'), JSON.stringify({ version: 1, frame: 'agent root, metres, +y up, facing +z; first frame of the hold clip', truth }, null, 0));
console.log('WROTE ' + OUT + ': ' + Object.keys(items).length + ' items, ' + clips.length + ' clips, truth for ' + Object.keys(truth).length);
