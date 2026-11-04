// Counter-Strike 2 agents (player characters) imported on this computer: tools/import-cs2-models.mjs converts them to
// user-assets/agents/ct.glb and t.glb (one skeleton with CS2's bone names, standing on y = 0, facing +z, metres),
// the room serves them, and every player in a Global Defensive match is drawn as their side's agent when there is
// one (else the built-in soldiers, gd-soldiers.js). Never shipped: the models are Valve's.
// The pose is made here from the same state the soldiers get (speed, crouch, holding a gun, reload / throw, dead):
// legs and arms by two-bone IK (feet planted, knees bending as the body crouches; both hands on the gun), the spine
// leaning in. Hit boxes come from the pose, never from the model: the agent stands at its true size (CS2's 72 u, the
// capsule's height; its head where the head zone is, weapons-data.js) and drops as the capsule does crouched. Allocation-free per frame.
import { gdTexSize } from './gd-preset.js';   // (v53 stage 6: Low / Very Low texture cap)
import { CASTER, bonesMoved } from './sun-shadows.js';
import { skinObject, unskinObject, sameSkin } from './skin-render.js';
import * as THREE from './three.module.js';
import { gltfLoader } from './gltf-loader.js';
import { userAssets, userAssetURL } from './user-assets.js';
import { weaponModel, knifeFor, MUZZLE, loadRealWeapons, onModelRegistered } from './weapon-models.js';
import { weaponById } from './weapons-data.js';
import { addRim, rimFor } from './rim-light.js';
// v53 LOOK (spec 4.1 readability, CS2's "Boost Player Contrast" — csgo_english.txt SFUI_Settings_PlayerContrast: "Improves
// the legibility of players in low contrast situations"; its exact shading is in CS2's binary, not its files): on top of
// rim-light.js's rim, a slight saturation lift of the agent's lit colour (× SAT_LIFT about its luminance) so a CT or T
// never greys into the wall behind; and the darkest tint an agent takes in a tunnel raised from 0.30 to SHADE_FLOOR (no
// dark-on-dark). One shared onBeforeCompile and key for every agent material (one program, compiled at load as before).
const SAT_LIFT = 1.12, SHADE_FLOOR = .36, RIM_COMPILE = addRim(new THREE.MeshStandardMaterial()).onBeforeCompile;
function readableShader(shader, renderer) { RIM_COMPILE.call(this, shader, renderer);
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `{ float gdY = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) ); outgoingLight = max( mix( vec3( gdY ), outgoingLight, ${SAT_LIFT.toFixed(2)} ), 0.0 ); }\n#include <opaque_fragment>`); }
const readableKey = () => 'rim-1-gdsat';
const readable = m => { addRim(m); m.onBeforeCompile = readableShader; m.customProgramCacheKey = readableKey; return m; };
import { live } from './live-settings.js';
import { fitImage, anisotropy, textureSize } from './texture-quality.js';
import { deathFall, DEATH_FALL_S } from './phys-smooth.js';
import { gloveLook, gloveMaterial, gloveVersion } from './glove-assets.js';   // (the death fall's curve: package P)
import { agentRig, startRagdoll, updateRagdoll, stopRagdoll, deathOf, deathCtx, loadCs2Ragdolls, trackVy } from './gd-ragdoll.js';   // (v53 DEATH: the death ragdoll — CS2's own when imported)

const templates = {}; let loading = null;
// Load the imported agents (once): resolves to the sides that have one.
export function loadAgents() {
  return loading ??= userAssets().then(ua => { const json = f => ua.models.agents ? fetch(userAssetURL(ua, f)).then(r => r.ok ? r.json() : null).catch(() => null) : null, holds = json('holds/holds.json'), holdClips = json('holds/holds-clips.json');   // (CS2's hold data, if exported on the host: tools/export-cs2-holds.mjs; none → the palm grip below)
    return Promise.all([...Object.entries(ua.models.agents || {}).map(([side, a]) =>
    gltfLoader().loadAsync(userAssetURL(ua, a.file)).then(async g => { await fitTextures(g.scene); templates[side] = prepare(g.scene); }, e => console.warn('agent', side, e?.message))),
    ua.models.agentAnims ? gltfLoader().loadAsync(userAssetURL(ua, ua.models.agentAnims.file)).then(g => { CLIPS = splitClips(g.animations); }, e => console.warn('agent animations', e?.message)) : null,
    ua.models.agents ? loadCs2Ragdolls(json) : null]).then(async () => { if (useHolds(await holds, await holdClips)) loadRealWeapons().then(() => { const ids = Object.keys(HOLDS || {}), next = () => { if (ids.length) { warmHolds([ids.shift()]); setTimeout(next, 0); } }; next(); }, () => {}); return Object.keys(templates); }); });   // (each item's model measured once, now, not at its first equip)
}
// CS2's own hold data (user-assets/holds, tools/export-cs2-holds.mjs; never shipped): every item's world model measured
// in its `weapon` bone frame — the frame CS2 hangs it by: the model's weapon bone on the agent's wpn bone — and the
// hold clips cs2_anims.glb lacks (each knife's own idle, the molotov's). Without it the palm grip (setGun) stays.
let HOLDS = null;
export function useHolds(h, c) { HOLDS = h?.items ? h.items : null; FITS.clear();
  if (CLIPS && Array.isArray(c?.clips)) for (const j of c.clips) if (!CLIPS.has(j.name)) for (const [k, v] of splitClips([THREE.AnimationClip.parse(j)])) CLIPS.set(k, v);
  return !!HOLDS; }
// CS2's own third-person animations (one file for both sides, user-assets: models.agentAnims — CS2's world-model clips,
// the agents' own bone names; ~/CS2-extract/build/agent_anims.py). Each clip in two halves: the legs and hips (walking,
// running, crouching: lower) and the chest, arms and hands (the gun's own hold, its reload, shot, a throw: upper), so the
// legs can walk while the arms do something else, as CS2's animation graph layers them.
let CLIPS = null;
const UPPER = /^(spine_[123]|neck_|head_|clavicle_|arm_|hand_|finger_|wpn|weapon|eye|jiggle)/i;
function splitClips(list) { const m = new Map(); for (const c of list) { const up = [], lo = []; for (const t of c.tracks) (UPPER.test(t.name.split('.')[0]) ? up : lo).push(t);
  m.set(c.name, { full: c, upper: new THREE.AnimationClip(c.name + '#up', c.duration, up), lower: new THREE.AnimationClip(c.name + '#lo', c.duration, lo) }); } return m; }
export const hasAgent = side => !!templates[side];
// The same from files read elsewhere (tests/gd-agent-hold.mjs parses user-assets' agents and clips in node): sides { ct, t } → scenes, clips → the animations file's.
export function useAgents(sides = {}, clips = null, holds = undefined) { for (const [side, sc] of Object.entries(sides)) templates[side] = prepare(sc); if (clips) CLIPS = splitClips(clips); if (holds !== undefined) useHolds(holds?.holds, holds?.clips); return Object.keys(templates); }   // (holds: { holds: holds.json, clips: holds-clips.json }, null to drop them)
// Its pictures at the size Settings → Texture quality asks for (stored at 2048), filtered as set.
async function fitTextures(root) { const ts = new Set(); root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (m[k]) ts.add(m[k]); });
  const a = anisotropy(); await Promise.all([...ts].map(async t => { t.image = await fitImage(t.image, gdTexSize(textureSize())); t.anisotropy = a; t.needsUpdate = true; })); }

// Fingers closed round a grip: each segment's bend (radians) about its own axis — fingers, thumb.
export const CURL = { axis: 'z', sign: 1, fingers: [.75, .9, .6], thumb: [.3, .4, .35] };   // ~125°: round a grip, not a clenched fist
const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'].flatMap(f => [0, 1, 2].flatMap(k => ['l', 'r'].map(sd => `finger_${f}_${k}_${sd}`)));
const POSED0 = ['pelvis', 'spine_0', 'spine_1', 'spine_2', 'spine_3', 'neck_0', 'head_0', 'clavicle_l', 'clavicle_r', 'arm_upper_l', 'arm_upper_r', 'arm_lower_l', 'arm_lower_r', 'hand_l', 'hand_r', 'leg_upper_l', 'leg_upper_r', 'leg_lower_l', 'leg_lower_r', 'ankle_l', 'ankle_r'], TWIST = ['arm_lower_l_twist', 'arm_lower_l_twist1', 'arm_lower_r_twist', 'arm_lower_r_twist1'], POSED = [...POSED0, ...TWIST, ...FINGERS];
// Rest measurements of a template (model space, metres): bone positions, limb lengths, the scale to game units.
function prepare(scene) {
  scene.updateMatrixWorld(true); const bones = {}; scene.traverse(o => { if (o.isBone && !bones[o.name.toLowerCase()]) bones[o.name.toLowerCase()] = o;   /* (either case: CS2 names them _L / _R) */ if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; o.geometry.userData.shared = true; for (const m of [].concat(o.material)) m.userData.shared = true; } });
  const at = n => bones[n].getWorldPosition(new THREE.Vector3()), P = {}; for (const n of POSED0) if (bones[n]) P[n] = at(n); else throw Error('agent without bone ' + n);
  const len = (a, b) => P[a].distanceTo(P[b]);
  // Each hand's own frame (from its finger bones): toward the knuckles (d), the palm's facing (n, the side the thumb
  // sits on), the palm's length; so a hand can be laid on a grip palm first.
  const hands = {}; for (const sd of ['l', 'r']) { const q = bones['hand_' + sd].getWorldQuaternion(new THREE.Quaternion()).invert(), p0 = at('hand_' + sd), loc = n => at(n).sub(p0).applyQuaternion(q);
    const knuckle = loc('finger_middle_0_' + sd), d = knuckle.clone().normalize(), across = loc('finger_index_0_' + sd).sub(loc('finger_pinky_0_' + sd)), n = new THREE.Vector3().crossVectors(d, across).normalize();
    if (n.dot(loc('finger_thumb_1_' + sd)) < 0) n.negate(); n.addScaledVector(d, -n.dot(d)).normalize(); hands[sd] = { d, n, m: new THREE.Vector3().crossVectors(d, n), palm: knuckle.length() }; }
  return { scene, P, hands, k: 100 / 16.5,   /* true size: the models are in metres, a game unit is 16.5 cm (CS2's agents stand 72 u, the hit capsule's height) */ arm: [len('arm_upper_l', 'arm_lower_l'), len('arm_lower_l', 'hand_l')], leg: [len('leg_upper_l', 'leg_lower_l'), len('leg_lower_l', 'ankle_l')] };
}
// A copy with its own bones (meshes, materials and pictures shared). The parts one skin drives (body, head, gloves, legs…:
// GLTFLoader gives each its own Skeleton over the same bones) share ONE skeleton in the copy: three.js recomputes every
// skeleton's bone matrices (bones × a matrix product) and re-sends its bone texture on every render() — measured in a
// 10-player Defuse: 47 skeletons, 4 089 bones a pass for 9 agents. Shared only when the bones and their inverse bind
// matrices are the same, so every part is drawn exactly as before.
// (makeAgent) Bones with nothing drawn under them out of the render's walk; `hang`: the bone things are hung on later (kept, with its chain).
export function hideBareBones(body, hang) { let n = 0; const keep = new Set(), drawn = o => { let d = false; o.traverse(c => { if (c.isMesh || c.isLine || c.isPoints || c.isSprite) d = true; }); return d; };
  for (let o = hang ? body.getObjectByName(hang) : null; o; o = o.parent) keep.add(o); body.traverse(o => { if (o.isBone && o.visible && !keep.has(o) && !drawn(o)) { o.visible = false; n++; } }); return n; }
export function cloneSkinned(src) {
  const out = src.clone(true), a = [], b = []; src.traverse(o => a.push(o)); out.traverse(o => b.push(o)); const map = new Map(a.map((o, i) => [o, b[i]])), made = [];
  const same = (s, t) => s.bones.length === t.bones.length && s.bones.every((x, k) => x === t.bones[k]) && s.boneInverses.every((m, k) => m.equals(t.boneInverses[k]));
  b.forEach((o, i) => { if (o.isSkinnedMesh) { const s = a[i].skeleton; let m = made.find(e => same(e.src, s)); if (!m) made.push(m = { src: s, sk: new THREE.Skeleton(s.bones.map(x => map.get(x)), s.boneInverses) }); o.bind(m.sk, a[i].bindMatrix); } });
  return out;
}

// Scratch (no allocation per frame).
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), pole = new THREE.Vector3(), tgt = new THREE.Vector3(), mid = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), axis = new THREE.Vector3();
const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), hX = new THREE.Vector3(), hQ = new THREE.Quaternion(), hD = new THREE.Vector3(), hN = new THREE.Vector3();
// Lay a hand (after the arm's IK) so its knuckles point along `dir` and its palm faces `palm` (world), blended by `w`.
// twists: the forearm's twist bones (near the elbow, near the wrist), which take a third and two thirds of the hand's
// roll about the forearm, so the wrist never pinches like a sweet wrapper.
const tA = new THREE.Vector3(), tQ = new THREE.Quaternion(), tI = new THREE.Quaternion();
function orientHand(hand, H, dir, palm, w, twists = []) {
  if (w <= .001) return;
  hand.parent.getWorldPosition(v1); hand.getWorldPosition(v2); tA.copy(v2).sub(v1).normalize();   // the forearm's axis
  hD.copy(dir).normalize().lerp(tA, .45).normalize();   // half along the forearm: the wrist bends only so far
  hN.copy(palm).addScaledVector(hD, -palm.dot(hD)).normalize(); hX.crossVectors(hD, hN);
  mA.makeBasis(H.d, H.n, H.m); mB.makeBasis(hD, hN, hX); mB.multiply(mA.transpose()); hQ.setFromRotationMatrix(mB);
  hand.getWorldQuaternion(q2); hQ.slerpQuaternions(q2, hQ, Math.min(1, w));
  // The roll about the forearm in that turn (swing-twist), shared with the twist bones.
  tI.copy(q2).invert(); tQ.multiplyQuaternions(hQ, tI); const d = tQ.x * tA.x + tQ.y * tA.y + tQ.z * tA.z, roll = 2 * Math.atan2(d, tQ.w);
  twists.forEach((b, k) => { if (b) turn(b, tA, roll * (k + 1) / 3); });
  setWorldQuat(hand, hQ);
}
// Turn `bone` (in world space) so the direction from it to `child` points at `to` (world).
function aim(bone, child, to) {
  bone.getWorldPosition(v1); child.getWorldPosition(v2); v2.sub(v1).normalize(); v3.copy(to).sub(v1).normalize(); if (v3.lengthSq() < 1e-8) return;
  q1.setFromUnitVectors(v2, v3); bone.getWorldQuaternion(q2); q2.premultiply(q1); bone.parent.getWorldQuaternion(q3); bone.quaternion.copy(q3.invert().multiply(q2)); bone.updateMatrixWorld(true);
}
// Turn `bone` by `angle` about a world axis.
function turn(bone, worldAxis, angle) { q1.setFromAxisAngle(worldAxis, angle); bone.getWorldQuaternion(q2); q2.premultiply(q1); bone.parent.getWorldQuaternion(q3); bone.quaternion.copy(q3.invert().multiply(q2)); bone.updateMatrixWorld(true); }
// Give `bone` this world rotation.
function setWorldQuat(bone, q) { bone.parent.getWorldQuaternion(q3); bone.quaternion.copy(q3.invert().multiply(q)); bone.updateMatrixWorld(true); }
// Two-bone IK (world): upper → lower → end reaching `target`, the middle joint bent toward `poleDir`; s: model → world scale.
function ik(upper, lower, end, [l1, l2], target, poleDir, s) {
  upper.getWorldPosition(v1); v4.copy(target).sub(v1); let d = v4.length(); const L1 = l1 * s, L2 = l2 * s; d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4); v4.normalize();
  const ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca)); pole.copy(poleDir).addScaledVector(v4, -poleDir.dot(v4)).normalize();
  mid.copy(v1).addScaledVector(v4, L1 * ca).addScaledVector(pole, L1 * sa); tgt.copy(v1).addScaledVector(v4, d);
  aim(upper, lower, mid); aim(lower, end, tgt);
}

// The dress interface multiplayer.js expects: { g, update(dt, { speed, crouch, dead, aim, act }), setWeapon(id), dispose() }.
// lightAt(x, y, z) (world, feet): the map's baked light there (map-light.js, 1 ≈ sunlit floor) — the agent is
// tinted by it (its own copies of the materials; the pictures stay shared), never below 30 %: dark in a tunnel,
// bright in the sun, never invisible — and outlined by a rim of light that grows as it gets darker (rim-light.js).
// ── CS2 gloves on other players' agents (their pick: skins record 'gloves', glove-assets.js) ──
// CS2 draws a chosen glove on a third-person agent with the glove model's world LOD (world_L / world_R) in place of the
// agent's own thirdperson_default_gloves mesh. Those 52 bones exist by name in both CS2 agents' skins with the same
// inverse binds (tools/cs2-gloves/tp-check.mjs: CT 0, T 1.5e-5), so the world meshes join the agent's own skeleton: their
// bone indices are re-numbered once per (glove type, side) into the default glove mesh's skeleton (a geometry sharing
// every other attribute with the glove's; the tangents dropped, as the agents' own meshes have none) — no new skeleton,
// no retarget. Material: a copy of the agent's own glove material (the same maps, rim hook and program as the body's:
// no shader is built for a glove) with the finish's 512 colour and normal (or its 1×1 fallback set while they load); per
// agent when it is shaded by the map's light (its own copies, as the body's), else one per finish and side. A type whose
// meshes are not in: the agent's own gloves tinted with the finish's fallback colour. Bones or binds that do not match
// (an agent of another rig): the agent's own gloves.
export const isDefaultGloves = o => o.isSkinnedMesh && /thirdperson_default_gloves$/i.test(o.name);
const worldGeo = new Map();
export function worldGloveGeos(T, side, tpl) {   // (exported for tests) → { world_L, world_R } geometries on tpl's skeleton, or null
  const key = T.type + '|' + side + '|' + tpl.uuid; if (worldGeo.has(key)) return worldGeo.get(key);
  const sk = tpl.skeleton, at = new Map(sk.bones.map((b, i) => [b.name, i])); let ok = !!T.bones?.length, worst = 0;
  const map = (T.bones || []).map((n, i) => { const j = at.get(n); if (j === undefined) { ok = false; return 0; } const a = T.inverses[i].elements, b = sk.boneInverses[j].elements; for (let k = 0; k < 16; k++) worst = Math.max(worst, Math.abs(a[k] - b[k])); return j; });
  let out = null; if (ok && worst < 1e-3) { out = { worst };
    for (const n of ['world_L', 'world_R']) { const src = T.meshes[n]?.geometry; if (!src?.attributes.skinIndex) continue; const g = new THREE.BufferGeometry(); g.setIndex(src.index);
      for (const a of ['position', 'normal', 'uv', 'skinWeight']) if (src.attributes[a]) g.setAttribute(a, src.attributes[a]);
      const si = src.attributes.skinIndex, arr = new Uint16Array(si.count * 4); for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) arr[i * 4 + c] = map[si.getComponent(i, c)] ?? 0;
      g.setAttribute('skinIndex', new THREE.BufferAttribute(arr, 4)); g.name = 'cs2g_world_' + T.type + '_' + n; g.userData.shared = true; out[n] = g; } }
  worldGeo.set(key, out); return out;
}
export function makeAgent(p, team, { lightAt = null } = {}) {
  const T = templates[team]; if (!T) return null;
  const g = new THREE.Group(), fallG = new THREE.Group(), face = new THREE.Group(), model = new THREE.Group(), body = cloneSkinned(T.scene);
  g.add(fallG); fallG.add(face); face.rotation.y = Math.PI; face.add(model); model.scale.setScalar(T.k); model.add(body);   // the avatar convention: facing −z in g
  body.traverse(o => { if (o.isMesh) o.layers.enable(CASTER); });   // (casts its shadow on a baked CS2 map: sun-shadows.js)
  const B = {}; body.traverse(o => { const n = o.name.toLowerCase(); if (o.isBone && POSED.includes(n) && !B[n]) B[n] = o; });
  const own = [], rim = { value: rimFor(1) }; if (lightAt) body.traverse(o => { if (o.isMesh) { o.material = [].concat(o.material).map(m => { const c = readable(m.clone()); c.userData = { rim }; own.push(c); return c; }); if (o.material.length === 1) o.material = o.material[0]; } });
  let shade = 1, shadeAt = 0; const feetW = new THREE.Vector3();
  // (CS2 gloves: see setGloves below)
  let glRec = null, glV = -1, glMat = null, glSrc = null, glTint = false; const glTintC = new THREE.Color(), glMeshes = new Map();
  const dgMesh = (() => { let d = null; body.traverse(o => { if (!d && isDefaultGloves(o)) d = o; }); return d; })(), dgTpl = (() => { let d = null; T.scene.traverse(o => { if (!d && isDefaultGloves(o)) d = o; }); return d; })();
  const dgOrig = dgMesh?.material || null;
  const rest = POSED.filter(n => B[n]).map(n => [B[n], B[n].position.clone(), B[n].quaternion.clone()]), fingers = FINGERS.filter(n => B[n]).map(n => [B[n], /thumb/.test(n), +n.split('_')[2], n.endsWith('_l')]), curlAx = new THREE.Vector3(), curlQ = new THREE.Quaternion(), ankleRest = { l: new THREE.Quaternion(), r: new THREE.Quaternion() };
  g.updateMatrixWorld(true); for (const s of ['l', 'r']) { B['ankle_' + s].getWorldQuaternion(ankleRest[s]); model.getWorldQuaternion(q1); ankleRest[s].premultiply(q1.invert()); }   // feet flat: their rotation in model space
  const holder = new THREE.Group(); holder.scale.setScalar(1 / T.k); holder.rotation.y = Math.PI; model.add(holder);   // the gun, in game units, muzzle → +z
  const A = CLIPS ? animator(body, T) : null;   // CS2's own clips when the room has them; else posed here (below)
  // (v53 DEATH) The death ragdoll (gd-ragdoll.js): its rig made now with the agent (CS2's own for this side when imported,
  // else ours); started on the first dead update from the pose the body had, stepped by the host's clock, stopped when
  // the player is back. Its skeletons are told the bones moved (the sun's pass), the gun hidden (it drops: gd-drops).
  let rag = null; try { rag = agentRig(body, team, T, THREE); } catch (e) { console.warn('ragdoll', e?.message); }
  let ragOn = false, ragTried = false; const ragSkels = [], VY = new Float64Array(2);   // (VY: the feet's height last update, its speed — a typed array: no number boxed per frame) body.traverse(o => { if (o.isSkinnedMesh && !ragSkels.includes(o.skeleton)) ragSkels.push(o.skeleton); });
  const skels = []; if (!A) body.traverse(o => { if (o.isSkinnedMesh && !skels.includes(o.skeleton)) skels.push(o.skeleton); });   // (posed here: update() walks the bones' world matrices itself — sun-shadows.js bonesMoved)
  // Bones draw nothing, yet three.js's render walks every object of every pass (≈ 80 bones an agent: 700+ visits a pass for 9
  // agents, a weak laptop's CPU — package W). A bone with nothing drawn under it — any but the gun's bone (wpn) and the chain
  // down to it, where the gun is hung later — is left out of that walk (visible false); updateMatrixWorld ignores visibility,
  // so the skinning (bone matrices) and the look are exactly as before.
  hideBareBones(body, 'wpn');
  let gun = null, gunId = null, kind = 'none', fall = 0, phase = 0, stock = .3, reachFwd = .6; const st = { speed: 0, crouch: 0, gun: 0, reload: 0, throwA: 0 };
  const side = T.P.arm_upper_r.x < 0 ? -1 : 1;   // which way (model x) the right shoulder is
  const M = (x, y, z, out) => model.localToWorld(out.set(x, y, z));   // model space (metres) → world
  const dirW = (x, y, z, out) => { model.getWorldQuaternion(q1); return out.set(x, y, z).applyQuaternion(q1).normalize(); };
  const dR = new THREE.Vector3(), nR = new THREE.Vector3(), dL = new THREE.Vector3(), nL = new THREE.Vector3(), w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), qm = new THREE.Quaternion();
  const shR = new THREE.Vector3(), shL = new THREE.Vector3(), hR = new THREE.Vector3(), hL = new THREE.Vector3(), poleW = new THREE.Vector3(), fwdW = new THREE.Vector3(), rightW = new THREE.Vector3(), upW = new THREE.Vector3(), footW = new THREE.Vector3();
  // knife: the knife this player chose (game.arena.knives: Butterfly, Stiletto, M9 Bayonet) — drawn when its model is in
  // (baked from its first-person set, fp-view.js), so everyone sees the knife you picked; else the side's default.
  function setWeapon(id, knife = null) {
    id = id ? knifeFor(id, team, knife) : null; if (id === gunId) return; gunId = id; if (gun) { unskinObject(gun); gun.removeFromParent(); gun = null; } if (!id) { kind = 'none'; A?.setGun(null, 'none'); return; }
    const w = weaponById(id === 'knife-t' ? 'knife' : id); kind = KNIFE_ID.test(id) ? 'knife' : ['he', 'flash', 'smoke', 'molotov', 'c4', 'incendiary', 'incgrenade', 'decoy'].includes(id) ? 'item' : w?.kind === 'pistol' ? 'pistol' : 'rifle';
    gun = weaponModel(id, 1); gun.traverse(o => { if (o.isMesh) { o.castShadow = true; o.layers.enable(CASTER); } });
    { const box = new THREE.Box3().setFromObject(gun); stock = Math.max(.12, box.max.z / T.k); reachFwd = Math.max(.1, -box.min.z / T.k); }   // grip → butt (+z) and grip → muzzle (−z), metres: measured in the gun's own frame before it hangs anywhere (measured after, Box3 is world-aligned: it changed with the agent's place and turn, and under the holder's half turn max.z was the muzzle)
    (A ? A.turn : holder).add(gun); A?.setGun(id, kind, gun); if (skinNow) skinObject(gun, skinNow);
  }
  let deadT = 0, fallNew = true;   // (the death fall: seconds since this body died; first update not yet run)
  function update(dt, s = {}) {
    if (own.length) { shadeAt -= dt; if (shadeAt <= 0) { shadeAt = .15; g.getWorldPosition(feetW); const l = lightAt(feetW.x, feetW.y, feetW.z), want = Math.min(1.1, Math.max(SHADE_FLOOR, .3 + .75 * l)); shade += (want - shade) * .5; for (const m of own) m.color.setScalar(shade); if (glTint && dgMesh) dgMesh.material.color.multiply(glTintC); rim.value = live.rim ? rimFor(shade) : 0; } }
    const k = Math.min(1, dt * 10); st.speed += ((s.speed || 0) - st.speed) * Math.min(1, dt * 8); st.crouch += ((s.crouch ? 1 : 0) - st.crouch) * k; st.gun += ((s.aim && !s.dead ? 1 : 0) - st.gun) * k;
    st.reload += ((s.act === 'reload' ? 1 : 0) - st.reload) * Math.min(1, dt * 9); st.throwA += ((s.act === 'throw' ? 1 : 0) - st.throwA) * Math.min(1, dt * 14);
    // Death: toppled about the feet as a body falls (phys-smooth.js deathFall: slow to start, fastest as it lands, ~0.5 s,
    // a small rebound; the same at any frame rate) — the old exponential leapt a third of the way over in 60 ms and crept.
    // Already down when first drawn (joined mid-round): lying there. Back up (a new round): eased up as before.
    if (rag && !s.dead) trackVy(VY, g, dt);   // (v53 DEATH r2: the body's vertical speed from its place — a remote player's own isn't sent)
    if (rag) { if (s.dead) { if (!ragTried) { ragTried = true; fall = 0; fallG.rotation.x = 0; fallG.position.y = 0; ragOn = startRagdoll(rag, deathOf(p?.name), s.vx || 0, Number.isFinite(s.vy) ? s.vy : VY[1], s.vz || 0, deathCtx()); } }   // (v53 DEATH: down — the ragdoll from this pose; r2: its vertical speed too — a death in a jump or a fall keeps it)
      else if (ragTried) { ragTried = false; if (ragOn) { stopRagdoll(rag); ragOn = false; fallG.visible = true; if (gun) gun.visible = true; } } }
    if (ragOn) { if (gun) gun.visible = false; if (updateRagdoll(rag)) for (let i = 0; i < ragSkels.length; i++) bonesMoved(ragSkels[i]); if (fallG.visible === rag.catching) fallG.visible = !rag.catching; return; }   // (v53 DEATH final: not drawn while a late body catches up; its bones re-posed only when it moved — a sleeping body costs nothing)
    if (s.dead) { deadT = fallNew ? DEATH_FALL_S : deadT + dt; fall = deathFall(deadT); } else { deadT = 0; fall *= Math.exp(-dt * 7); } fallNew = false;
    fallG.rotation.x = -fall * Math.PI / 2; fallG.position.y = fall * 1.3;
    if (A) { A.update(dt, s, g); return; }   // (the clips pose it)
    for (let i = 0; i < skels.length; i++) bonesMoved(skels[i]);   // (the world matrices walked below are newer than the last pose: the sun's pass poses this body itself)
    const P = T.P, vm = st.speed / T.k, moving = Math.min(1, vm / 2), cr = st.crouch;   // vm: metres a second
    phase = (phase + dt * Math.PI * 2 * vm / 2.6) % (Math.PI * 2);
    for (const [b, p, q] of rest) { b.position.copy(p); b.quaternion.copy(q); } g.updateMatrixWorld(true); const ws = model.getWorldScale(v4).x;
    // The combat stance (from a reference pose of a T aiming, user-supplied): knees bent (the body 6 % lower), the
    // left shoulder turned ~20° forward, left foot ahead and right foot back on a wide base, elbows out and a little
    // down; rifles shouldered (grip at the shoulder pocket, left hand out on the handguard), pistols in both hands a
    // forearm in front. Walking blends from the stance into a stride; crouching lowers the body by the capsule's 18 HU.
    const stance = st.gun * (1 - moving * .75), rifle = kind === 'rifle' ? 1 : 0, sd = side;   // sd: model x of the right side
    const drop = cr * 2.77 / T.k + stance * .06, bob = Math.abs(Math.cos(phase)) * .025 * moving;
    B.pelvis.parent.worldToLocal(M(P.pelvis.x, P.pelvis.y - drop + bob, P.pelvis.z + cr * .08, v4)); B.pelvis.position.copy(v4); B.pelvis.updateMatrixWorld(true);
    // Spine: leans in (more crouched / running) and turns the left shoulder forward; the head stays level, looking ahead.
    dirW(1, 0, 0, rightW); dirW(0, 1, 0, upW); const lean = .05 + moving * .08 + cr * .28 + stance * .06, twist = sd * stance * (.24 + rifle * .24);
    turn(B.spine_0, rightW, lean * .5); turn(B.spine_2, rightW, lean * .5); turn(B.spine_1, upW, twist * .5); turn(B.spine_3, upW, twist * .5);
    turn(B.head_0, upW, -twist); turn(B.head_0, rightW, -lean * .8 + stance * rifle * .12); dirW(0, 0, 1, fwdW); turn(B.head_0, fwdW, -sd * stance * rifle * .14);   // rifles: the cheek down on the stock
    // Legs: feet on the ground; the stance spreads them (left ahead, right back), walking strides; knees bend forward.
    const stride = Math.min(.42, vm * .075), lift = Math.min(.14, vm * .03); dirW(0, 0, 1, fwdW);
    for (const [s2, ph] of [['l', phase], ['r', phase + Math.PI]]) { const a = P['ankle_' + s2], right = s2 === 'r', spread = stance * (1 - cr);
      M(a.x * (1 + cr * .25 + spread * .25), a.y + Math.max(0, Math.sin(ph)) * lift, a.z + Math.cos(ph) * stride + cr * .05 + spread * (right ? -.16 : .2), footW);
      ik(B['leg_upper_' + s2], B['leg_lower_' + s2], B['ankle_' + s2], T.leg, footW, fwdW, ws);
      model.getWorldQuaternion(q1); setWorldQuat(B['ankle_' + s2], q1.multiply(ankleRest[s2])); }
    // The gun: right hand on the grip, the left on the handguard (rifles) or wrapped round the right (pistols).
    const sh = P.arm_upper_r, hold = st.gun, sx = sh.x, top = sh.y - drop, cx = (P.arm_upper_r.x + P.arm_upper_l.x) / 2, zs = (P.arm_upper_r.z + P.arm_upper_l.z) / 2 + cr * .08;   // ahead of the shoulders (the model's origin is not under them)
    // Rifles, from where the shoulders are now (the body turned side-on): the butt 6 cm in front of the right shoulder
    // joint (the shoulder pocket), so the grip is the gun's own stock length ahead of that; the bore at shoulder height.
    // The left hand on the handguard ~30 cm ahead of the grip, slid back along the gun as far as its reach needs.
    model.worldToLocal(B.arm_upper_r.getWorldPosition(shR)); model.worldToLocal(B.arm_upper_l.getWorldPosition(shL));
    let gx = shR.x * .92, gy = shR.y - .06, gz = shR.z + .06 + stock, lx = gx - sx * .06, ly = gy + .01, lz = gz + Math.min(.3, reachFwd * .55);
    { const reach = (T.arm[0] + T.arm[1]) * .96, dx = lx - shL.x, dy = ly - shL.y, dz2 = reach * reach - dx * dx - dy * dy; if (dz2 > 0 && lz - shL.z > Math.sqrt(dz2)) lz = Math.max(gz + .08, shL.z + Math.sqrt(dz2)); }
    if (kind === 'pistol') { gx = cx + sx * .15; gy = top - .02; gz = zs + .45; lx = gx - sx * .09; ly = gy - .03; lz = gz - .02; }
    else if (kind === 'knife') { gx = sx * 1.1; gy = top - .42; gz = zs + .32; } else if (kind === 'item') { gx = sx * .7; gy = top - .28; gz = zs + .3; }
    gy -= st.reload * .1; gz -= st.reload * .08;
    // Not holding (down, or nothing): the hands hang by the thighs, swinging against the legs.
    const swing = Math.cos(phase) * stride * .6;
    const rx = THREE.MathUtils.lerp(sx * 1.08, gx, hold), ry = THREE.MathUtils.lerp(top - .62, gy, hold), rz = THREE.MathUtils.lerp(zs - swing, gz, hold);
    holder.position.set(rx, ry, rz); holder.rotation.set(-st.reload * .5, Math.PI + st.reload * .35 * -sd, 0); holder.visible = hold > .3 && !!gun && st.throwA < .5;
    // Hands laid on the gun: the right palm against the grip's side (knuckles forward and down round its front), the
    // wrist where that puts the palm on the grip rather than through it; the left palm up under the handguard (rifles)
    // or against the right hand (pistols).
    const palm = hold * (kind === 'none' ? 0 : 1) * (1 - st.throwA), sg = Math.sign(sx) || 1, HR = T.hands.r, HL = T.hands.l;
    dR.set(0, -.6, .8).normalize(); nR.set(-sg, 0, 0); const back = HR.palm * .55, off = .03, gripDown = .08 * palm, gripBack = .025 * palm;   // the palm on the middle of the grip: ~8 cm under the guns' hold point (trigger height), 2 cm back
    M(THREE.MathUtils.lerp(rx, sx, st.throwA) - (nR.x * off + dR.x * back) * palm, THREE.MathUtils.lerp(ry, top + .35, st.throwA) - (nR.y * off + dR.y * back) * palm - gripDown, THREE.MathUtils.lerp(rz, zs - .15, st.throwA) - (nR.z * off + dR.z * back) * palm - gripBack, hR);
    dirW(sx * (1 + rifle * .4), -.3 - (1 - rifle) * .5, 0, poleW); ik(B.arm_upper_r, B.arm_lower_r, B.hand_r, T.arm, hR, poleW, ws);   // the right elbow up and out to the side (rifles: high, clear of the chest), never behind the back
    model.getWorldQuaternion(qm); orientHand(B.hand_r, HR, w1.copy(dR).applyQuaternion(qm), w2.copy(nR).applyQuaternion(qm), palm, [B.arm_lower_r_twist, B.arm_lower_r_twist1]);
    const two = hold * (kind === 'rifle' || kind === 'pistol' ? 1 : 0) * (1 - st.throwA), lh = P.arm_upper_l;
    if (kind === 'rifle') { dL.set(sg * .5, .15, .85).normalize(); nL.set(0, 1, 0); } else { dL.set(0, -.5, .85).normalize(); nL.set(sg, 0, 0); }
    const backL = HL.palm * .55, offL = kind === 'rifle' ? .04 : .03, ax2 = lx + (kind === 'rifle' ? 0 : rx - gx), ay2 = ly - st.reload * .12, az2 = lz + (kind === 'rifle' ? 0 : rz - gz) - st.reload * .3;
    M(THREE.MathUtils.lerp(lh.x * 1.08, ax2 - (nL.x * offL + dL.x * backL), two), THREE.MathUtils.lerp(top - .62, ay2 - (nL.y * offL + dL.y * backL), two), THREE.MathUtils.lerp(zs + swing, az2 - (nL.z * offL + dL.z * backL), two), hL);
    dirW(-sx * .7, -1, .1, poleW); ik(B.arm_upper_l, B.arm_lower_l, B.hand_l, T.arm, hL, poleW, ws);
    orientHand(B.hand_l, HL, w1.copy(dL).applyQuaternion(qm), w2.copy(nL).applyQuaternion(qm), two, [B.arm_lower_l_twist, B.arm_lower_l_twist1]);
    // Fingers: closed round the grip (right) and the handguard (left) while holding; relaxed, half closed otherwise.
    const gripR = .35 + .65 * palm, gripL = .35 + .65 * two; curlAx.set(CURL.axis === 'x' ? 1 : 0, CURL.axis === 'y' ? 1 : 0, CURL.axis === 'z' ? 1 : 0);
    for (const [b, thumb, seg, left] of fingers) { curlQ.setFromAxisAngle(curlAx, CURL.sign * (thumb ? CURL.thumb : CURL.fingers)[seg] * (left ? gripL : gripR)); b.quaternion.multiply(curlQ); }
  }
  function dispose() { stopRagdoll(rag); g.removeFromParent(); if (gun) { unskinObject(gun); gun.removeFromParent(); } A?.mixer.stopAllAction(); A?.mixer.uncacheRoot(body); for (const m of own) m.dispose(); const sk = new Set(); body.traverse(o => { if (o.isSkinnedMesh) sk.add(o.skeleton); }); for (const s of sk) s.dispose(); }   // (its skin's material copy, the clips' bindings and its own skeletons' bone textures: nothing left per agent across side changes and rematches)
  // Their skin on the gun in their hands (skins.js): set as the room's state changes; drawn by skin-render.js.
  let skinNow = null; function setSkin(sk) { sk = sk || null; if (sameSkin(sk, skinNow)) return; skinNow = sk; if (gun) skinObject(gun, skinNow); }
  // Their CS2 gloves (the room's skins record 'gloves'): called with every dress; a pick (the record's identity) or glove
  // files arriving (gloveVersion) re-wear them — two comparisons otherwise, nothing allocated.
  function setGloves(rec) { rec = rec || null; const v = gloveVersion(); if (rec === glRec && v === glV) return; glRec = rec; glV = v; wearGloves(); }
  function wearGloves() {
    if (!dgMesh || !dgTpl) return 'none'; const L = glRec ? gloveLook(glRec, 'tp') : null, geos = L?.type?.state === 'ready' ? worldGloveGeos(L.type, team, dgTpl) : null;
    let shown = null; if (geos) { shown = glMeshes.get(L.type.type);
      if (!shown) { shown = []; for (const n of ['world_L', 'world_R']) { if (!geos[n]) continue; const m = new THREE.SkinnedMesh(geos[n], dgMesh.material); m.name = 'cs2_gloves/' + n; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; m.layers.mask = dgMesh.layers.mask;
          m.position.copy(dgMesh.position); m.quaternion.copy(dgMesh.quaternion); m.scale.copy(dgMesh.scale); m.bind(dgMesh.skeleton, dgMesh.bindMatrix); dgMesh.parent.add(m); shown.push(m); } glMeshes.set(L.type.type, shown); }
      const src = L.tex.state === 'ready' ? L.tex : L.fb, make = tx => { const m = dgOrig.clone(); m.map = tx.color; m.normalMap = tx.normal; m.roughness = L.f.roughMean ?? .75; m.metalness = L.f.metalMean ?? 0; m.name = 'cs2g_tp_' + L.kit; m.userData = { shared: true, kit: L.kit }; return m; };
      let mat; if (lightAt) { if (glSrc !== src || !glMat) { if (glMat) { own.splice(own.indexOf(glMat), 1); glMat.dispose(); } glMat = readable(make(src.tex)); glMat.userData = { rim }; glMat.color.setScalar(shade); own.push(glMat); glSrc = src; } mat = glMat; }
      else mat = gloveMaterial(src, 'tp:' + team, tx => { const m = make(tx); m.onBeforeCompile = dgOrig.onBeforeCompile; m.customProgramCacheKey = dgOrig.customProgramCacheKey; return m; });
      for (const m of shown) m.material = mat; }
    for (const list of glMeshes.values()) for (const m of list) m.visible = list === shown;
    dgMesh.visible = !shown;
    // No meshes for that type (yet): the agent's own gloves in the finish's fallback colour.
    glTint = !!(L && !shown); if (glTint) glTintC.set(L.fb.color); const dm = dgMesh.material;
    if (lightAt) { dm.color.setScalar(shade); if (glTint) dm.color.multiply(glTintC); }   // (its own shaded copy: the tint rides the shade, update())
    else dgMesh.material = glTint ? gloveMaterial(L.fb, 'tptint:' + team, () => { const m = dgOrig.clone(); m.color.set(L.fb.color); m.onBeforeCompile = dgOrig.onBeforeCompile; m.customProgramCacheKey = dgOrig.customProgramCacheKey; m.userData = { shared: true }; return m; }) : dgOrig;
    return shown ? (L.tex.state === 'ready' ? 'glove' : 'fallback') : glTint ? 'tint' : 'agent';
  }
  return { g, team, update, setWeapon, setSkin, setGloves, wearGloves, get gloveMeshes() { return glMeshes; }, get ragdoll() { return rag; }, dispose };   // (ragdoll: its rig — v53 DEATH, the tests)
}
// The animated agent (CS2's clips; see CLIPS): legs from the walking / running / crouching clips of the gun's class
// (rifle, pistol, knife), blended by the speed and the direction moved relative to the facing (CS2's eight
// directions), their time kept in step with the feet; the upper body in the gun's own hold, and a reload, a shot, a
// throw or a knife swing played over it once; a plant or a defuse moves the whole body. The gun rides CS2's weapon
// bone (wpn). Allocation-free per frame.
const DIR8 = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'], U = 2.54 / 16.5, KNIFE_ID = /knife|karambit|butterfly|stiletto|^m9$|^(bayonet|skeleton|talon|flip|nomad)$/;   // (the chosen star knives are knives too: their hold, not a rifle's; v53 KNIVES: the five new ones — gd-knives.js)
const WALK = 130 * U, RUN = 250 * U, CROUCH = 85 * U;   // CS2's speeds (u/s) in game units: the clips' own pace
const NADE_IDS = new Set(['he', 'flash', 'smoke', 'molotov', 'incendiary', 'incgrenade', 'decoy']);   // game kind ids ('incendiary'); 'incgrenade' = CS2's own name
const ikT = new THREE.Vector3(), ikA = new THREE.Vector3(), ikB = new THREE.Vector3(), ikD = new THREE.Vector3(), ikQ = new THREE.Quaternion(), ikM = new THREE.Matrix3(), ikLen = [0, 0];   // (the left hand's IK: shared scratch, frame code)
const fq = new THREE.Quaternion(), fv = new THREE.Vector3(), aq = new THREE.Quaternion(), aq2 = new THREE.Quaternion(), gm = new THREE.Matrix4(), gp = new THREE.Vector3(), IDQ = new THREE.Quaternion(), ZERO3 = [0, 0, 0];
// One attachment rule for every item in an agent's hand. CS2's weapon bone (wpn) has Source's axes: +x the muzzle
// (its child wpnTip sits ahead, wpnEnd behind), +z up, +y the agent's left. Every model here — built-in, CC0 and the
// imported CS2 files (weapon-models.js) — has its muzzle along −z, +y up, +x right. So gun −z → wpn +x, +y → +z,
// +x → −y: the quaternion of that basis (v46–v51 turned it a quarter about y: every gun backwards and on its side,
// tests/gd-agent-hold.mjs).
export const WPN_CARRY = new THREE.Quaternion(-.5, .5, .5, -.5);
// Per item on top of that, only where the hold clip's grip differs from the model's origin or axes (game units, the gun's
// frame; turn: a quaternion after WPN_CARRY). Keyed by the clip family (setGun's gid): 'knife', 'nade', 'c4'.
export const ITEM_HOLD = {};
// CS2's attachment, with CS2's data (HOLDS): the model's `weapon` bone on the agent's `wpn` bone (in every hold clip wpn
// sits exactly on attachHand_R, the hand's attachment: measured 0.0 cm) — so the game's model of an item is laid where
// CS2's own world model lies in wpn's frame (holdFit: a turn and a place, metres). Our models' convention (muzzle /
// blade −z, +y up, the grip at the origin) is not CS2's (+x the muzzle, +z up; a knife's blade along +z, the bomb flat),
// and the origins differ, so each model is registered once against CS2's measurements: guns turned by WPN_CARRY (both
// conventions fix the barrel and the up); a knife, a grenade (kept upright), the bomb by the axis turn (of the 24) whose
// bounds and centroid best match CS2's model. Placed: a gun front to back on CS2's model's bounds and its muzzle on CS2's
// muzzle height and side (the bore on the bore — on the imported CS2 files this is CS2's exact place, ≤ 0.5 cm); a CC0 /
// built-in stand-in gun first scaled to CS2's length in the hands (the stand-ins run 0.8–1.3× — "mis-scaled"; k ≤ ±60 %),
// so its butt and muzzle sit where CS2's do; anything else bounds centre on bounds centre. No per-gun numbers. Cached
// per model (measured once, at load: warmHolds).
const FITS = new Map(), ROTS = [];
{ const P = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], m = new THREE.Matrix4();
  for (const p of P) for (let s = 0; s < 8; s++) { const e = new Array(9).fill(0); for (let r = 0; r < 3; r++) e[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1;
    m.set(e[0], e[1], e[2], 0, e[3], e[4], e[5], 0, e[6], e[7], e[8], 0, 0, 0, 0, 1); if (m.determinant() > 0) ROTS.push(new THREE.Quaternion().setFromRotationMatrix(m)); } }
const GU = .165;   // a game unit in metres
// A model's bounds and surface centroid (area-weighted: the same for any split of its vertices), metres, its own frame.
function measure(gun) { gun.updateMatrixWorld(true); const inv = gun.matrixWorld.clone().invert(), box = new THREE.Box3(), c = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3(), f = new THREE.Vector3(), m = new THREE.Matrix4(); let area = 0;
  gun.traverse(o => { if (!o.isMesh || !o.visible) return; const p = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : p.count; m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < p.count; i++) box.expandByPoint(a.fromBufferAttribute(p, i).applyMatrix4(m));
    for (let t = 0; t + 2 < n; t += 3) { a.fromBufferAttribute(p, ix ? ix.getX(t) : t).applyMatrix4(m); b.fromBufferAttribute(p, ix ? ix.getX(t + 1) : t + 1).applyMatrix4(m); d.fromBufferAttribute(p, ix ? ix.getX(t + 2) : t + 2).applyMatrix4(m);
      const s = e.subVectors(b, a).cross(f.subVectors(d, a)).length() / 2; area += s; c.addScaledVector(a.add(b).add(d), s / 3); } });
  if (area > 0) c.divideScalar(area); else box.getCenter(c); box.min.multiplyScalar(GU); box.max.multiplyScalar(GU); return { box, c: c.multiplyScalar(GU) }; }
// A knife's blade from its finish mask (vertex colour red > .3: the star knives' own, the default knives' made at load),
// metres, the model's frame: its length axis a (toward the tip: away from the guard, our origin), its width w and flat
// normal n (principal axes of the blade's vertices), and its tip (the vertices within 1 cm of its far end). Null without a mask.
function bladeOf(gun) { gun.updateMatrixWorld(true); const inv = gun.matrixWorld.clone().invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), X = [];   // (flat x, y, z: no object per blade vertex)
  gun.traverse(o => { const P = o.isMesh && o.geometry.attributes.position, C = o.isMesh && o.geometry.attributes.color; if (!P || !C) return; m.multiplyMatrices(inv, o.matrixWorld); for (let i = 0; i < P.count; i++) if (C.getX(i) > .3) { v.fromBufferAttribute(P, i).applyMatrix4(m).multiplyScalar(GU); X.push(v.x, v.y, v.z); } });
  const N = X.length / 3; if (N < 20) return null; const c = new THREE.Vector3(), C = [0, 0, 0, 0, 0, 0, 0, 0, 0], p = new THREE.Vector3(); for (let i = 0; i < X.length; i += 3) { c.x += X[i]; c.y += X[i + 1]; c.z += X[i + 2]; } c.divideScalar(N);
  for (let i = 0; i < X.length; i += 3) { const d0 = X[i] - c.x, d1 = X[i + 1] - c.y, d2 = X[i + 2] - c.z; C[0] += d0 * d0; C[1] += d0 * d1; C[2] += d0 * d2; C[3] += d1 * d0; C[4] += d1 * d1; C[5] += d1 * d2; C[6] += d2 * d0; C[7] += d2 * d1; C[8] += d2 * d2; }
  const mul = (x, out) => out.set(C[0] * x.x + C[1] * x.y + C[2] * x.z, C[3] * x.x + C[4] * x.y + C[5] * x.z, C[6] * x.x + C[7] * x.y + C[8] * x.z);
  const iter = (x, off) => { const y = new THREE.Vector3(); for (let k = 0; k < 60; k++) { mul(x, y); if (off) y.addScaledVector(off, -off.dot(y)); x.copy(y).normalize(); } return x; };
  const a = iter(new THREE.Vector3(.3, .2, 1).normalize()), w0 = new THREE.Vector3(1, .3, .1).normalize(); w0.addScaledVector(a, -w0.dot(a)).normalize(); const w = iter(w0, a);
  if (c.dot(a) < 0) a.negate();   // (the blade lies away from the guard, the origin)
  const n = new THREE.Vector3().crossVectors(a, w).normalize(); w.crossVectors(n, a).normalize();
  let hi = -Infinity; for (let i = 0; i < X.length; i += 3) hi = Math.max(hi, p.fromArray(X, i).dot(a)); const tip = new THREE.Vector3(); let k = 0; for (let i = 0; i < X.length; i += 3) if (p.fromArray(X, i).dot(a) > hi - .01) { tip.add(p); k++; }
  return { a, w, n, tip: tip.divideScalar(k) }; }
// A baked star knife laid tip on tip has its own handle, not CS2's (the M9's thinner: CS2's right palm 1.9 cm off CS2's
// handle, 3.9 off ours): moved by up to 3 cm (the tip stays within 3 cm of CS2's) so its surface comes as near CS2's palm
// centre (holds.json hands.palmR, wpn frame) as CS2's own handle is — the least move that does it. Coarse 1 cm, then .25 cm.
function palmOnHandle(gun, H, q, kk, p) {
  const pr = new THREE.Vector3().fromArray(H.hands.palmR), dC = pr.distanceTo(new THREE.Vector3().fromArray(H.hands.gripR)), V = [], v = new THREE.Vector3(), m = new THREE.Matrix4();
  gun.updateMatrixWorld(true); const inv = gun.matrixWorld.clone().invert();
  gun.traverse(o => { const P = o.isMesh && o.visible && o.geometry.attributes.position; if (!P) return; m.multiplyMatrices(inv, o.matrixWorld); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m).multiplyScalar(GU * kk).applyQuaternion(q).add(p).sub(pr); if (v.lengthSq() < .01) V.push(v.x, v.y, v.z); } });   // (its vertices within 10 cm of the palm)
  if (V.length < 9) return; const cost = (x, y, z) => { let d = Infinity; for (let i = 0; i < V.length; i += 3) { const a = V[i] + x, b = V[i + 1] + y, c = V[i + 2] + z; d = Math.min(d, a * a + b * b + c * c); } return Math.max(0, Math.sqrt(d) - dC) + .1 * Math.hypot(x, y, z); };
  let bx = 0, by = 0, bz = 0, bs = cost(0, 0, 0); for (const [st, n, cx, cy, cz] of [[.01, 3, 0, 0, 0], [.0025, 4, null]]) { const ox = cx ?? bx, oy = cy ?? by, oz = cz ?? bz;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) { const x = ox + i * st, y = oy + j * st, z = oz + k * st; if (x * x + y * y + z * z > .0009) continue; const s = cost(x, y, z); if (s < bs) { bs = s; bx = x; by = y; bz = z; } } }
  p.x += bx; p.y += by; p.z += bz; }
const fitKey = (id, gun) => { let n = 0; gun.traverse(o => { if (o.isMesh) n += o.geometry.attributes.position.count; }); return id + ':' + n; };
export const holdFitReady = (id, gun) => !!gun && FITS.has(fitKey(id, gun));   // (measured already: an equip now measures nothing — tests/gd-agent-hold.mjs)
export function holdFit(id, gun) {
  const H = HOLDS?.[id]; if (!H || !gun) return null; let n = 0; gun.traverse(o => { if (o.isMesh) n += o.geometry.attributes.position.count; }); const key = id + ':' + n; let F = FITS.get(key); if (F) return F;
  const M = measure(gun), cb = new THREE.Vector3().fromArray(H.box[0]).add(new THREE.Vector3().fromArray(H.box[1])).multiplyScalar(.5), sc = new THREE.Vector3().fromArray(H.box[1]).sub(new THREE.Vector3().fromArray(H.box[0])), oc = new THREE.Vector3().fromArray(H.c).sub(cb);
  const mg = M.box.getCenter(new THREE.Vector3()), sg = M.box.getSize(new THREE.Vector3()), og = M.c.clone().sub(mg), s = new THREE.Vector3(), o = new THREE.Vector3(), UPZ = new THREE.Vector3();
  const cands = H.kind === 'gun' ? [WPN_CARRY] : H.kind === 'nade' ? ROTS.filter(q => UPZ.set(0, 1, 0).applyQuaternion(q).z > .99) : H.kind === 'knife' ? ROTS.filter(q => UPZ.set(0, 0, -1).applyQuaternion(q).z > .99) : ROTS;   // (grenades upright: our +y on CS2's +z; knives blade on blade: our −z on CS2's +z — the spin about it, the edge's side, from the data)
  // A knife in other units (×2 or more off CS2's length: a set's metres read as game units) is scaled to CS2's length first.
  let kk = H.kind === 'knife' ? sc.z / (sg.z || 1) : 1; kk = kk > 2 || kk < .5 ? Math.min(10, Math.max(.1, kk)) : 1; sg.multiplyScalar(kk); og.multiplyScalar(kk);
  let best = null, bs = Infinity; for (const q of cands) { s.copy(sg).applyQuaternion(q); o.copy(og).applyQuaternion(q); const sz = Math.abs(Math.abs(s.x) - sc.x) + Math.abs(Math.abs(s.y) - sc.y) + Math.abs(Math.abs(s.z) - sc.z), score = sz + 2 * o.distanceTo(oc) + (q.angleTo(WPN_CARRY) < 1e-3 ? 0 : .002); if (score < bs) { bs = score; best = q; } }
  s.copy(sg).applyQuaternion(best); let same = kk === 1 && ['x', 'y', 'z'].every(k => Math.abs(Math.abs(s[k]) - sc[k]) < Math.max(.08 * sc[k], .015)), k = kk;
  const p = cb.clone().sub(mg.clone().applyQuaternion(best).multiplyScalar(kk));   // (centre on centre)
  // A knife that is not CS2's own mesh (the star knives baked from their first-person sets carry stray skinned vertices: an
  // M9 measured 11 × 17 × 35 cm — its bounds say nothing) is laid by its blade instead (bladeOf: its finish mask): the blade
  // along CS2's +z, its width along CS2's x on the side CS2's centroid lies, its tip on CS2's tip. Without a mask: the guard
  // (our origin) on CS2's knife origin — the weapon bone sits at the guard on every CS2 knife — the width along CS2's x.
  if (H.kind === 'knife' && !same) { const B = bladeOf(gun), tipC = H.muzzle && new THREE.Vector3().fromArray(H.muzzle);
    if (B && tipC) {   // its blade (finish mask) on CS2's blade: guard → tip along CS2's guard → tip, its width toward CS2's x (the side its centroid lies on), tip on tip
      const sx = Math.sign(M.c.clone().sub(B.tip).dot(B.w) || 1) === Math.sign(new THREE.Vector3().fromArray(H.c).sub(tipC).x || 1) ? 1 : -1;
      // (the line guard → tip on CS2's guard → tip — the guard our origin, CS2's its weapon bone — not the blade's own axis on
      // CS2's +z: a curved karambit's blade axis is 45° off that line; laid by it, its tip met CS2's but its ring and handle
      // swung 10 cm out of the fist. The width side about that line as before.)
      const a1 = B.tip.clone().normalize(), a2 = tipC.clone().normalize(), w1 = B.w.clone().addScaledVector(a1, -B.w.dot(a1)).normalize(), w2 = new THREE.Vector3(sx, 0, 0).addScaledVector(a2, -sx * a2.x).normalize();
      const Rm = new THREE.Matrix4().makeBasis(w2, new THREE.Vector3().crossVectors(a2, w2), a2).multiply(new THREE.Matrix4().makeBasis(w1, new THREE.Vector3().crossVectors(a1, w1), a1).invert());
      best = new THREE.Quaternion().setFromRotationMatrix(Rm); p.copy(tipC).sub(B.tip.clone().applyQuaternion(best).multiplyScalar(kk));
      if (H.hands) palmOnHandle(gun, H, best, kk, p); }
    else { let b2 = null, s2 = Infinity; for (const q of cands) { if (Math.abs(UPZ.set(0, 1, 0).applyQuaternion(q).x) < .99) continue; const d = o.copy(og).applyQuaternion(q).distanceTo(oc); if (d < s2) { s2 = d; b2 = q; } } if (b2) best = b2; p.set(0, 0, 0); } }   // (no mask: the guard, our origin, on CS2's knife origin)
  const own = same;   // (CS2's own mesh: its bounds are CS2's on every axis)
  if (H.kind === 'gun') {   // a gun: as long as CS2's (a stand-in scaled to it), front to back centred on CS2's, its bore on CS2's bore (the muzzles meet)
    k = Math.min(1.6, Math.max(.6, sc.x / (sg.z || 1))); if (Math.abs(k - 1) < .04) k = 1; same = same || k === 1;
    const mm = MUZZLE[id] ? o.fromArray(MUZZLE[id]).multiplyScalar(GU) : o.set(mg.x, mg.y, M.box.min.z); mm.applyQuaternion(best).multiplyScalar(k);
    p.x = cb.x - mg.clone().applyQuaternion(best).x * k; if (H.muzzle) { p.y = H.muzzle[1] - mm.y; p.z = H.muzzle[2] - mm.z; } }
  F = { q: best.clone(), p, k, same, s: null, ikL: null };
  if (H.kind === 'gun' && !own && H.hands && H.muzzle && H.butt) fitStandIn(gun, F, H);
  FITS.set(key, F); return F; }
// A stand-in gun (CC0 / built-in: no CS2 file imported for it — another shape than CS2's) fitted to where CS2's hands
// touch CS2's gun (holds.json hands, tools/export-cs2-holds.mjs), not just to its length (v52 wave 3: scaled evenly by
// length, short stand-ins grew too tall and the left hand hung off the UMP, MAC-10, LMG, P90). Its tip on CS2's tip, then a
// scale along the bore (kx) and across it (kyz) — searched coarse then fine, 0.6–1.6 — so its surface passes through CS2's
// right-hand grip point (weighted 1), its left-hand one (.6) and CS2's butt (.5: the stock in the shoulder); whatever gap is left at the left
// hand is closed by IK in the animator (ikL: the wrist moved by it, in wpn's frame, as the gun moves). Once, at load.
function fitStandIn(gun, F, H) {
  gun.updateMatrixWorld(true); const inv = gun.matrixWorld.clone().invert(), m = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), v = new THREE.Vector3(), S = [];
  gun.traverse(o => { if (!o.isMesh || !o.visible) return; const P = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : P.count; m.multiplyMatrices(inv, o.matrixWorld);   // its surface, sampled every ~1.5 cm, in wpn's turn (metres, unscaled)
    for (let t = 0; t + 2 < n; t += 3) { a.fromBufferAttribute(P, ix ? ix.getX(t) : t).applyMatrix4(m).multiplyScalar(GU).applyQuaternion(F.q); b.fromBufferAttribute(P, ix ? ix.getX(t + 1) : t + 1).applyMatrix4(m).multiplyScalar(GU).applyQuaternion(F.q); c.fromBufferAttribute(P, ix ? ix.getX(t + 2) : t + 2).applyMatrix4(m).multiplyScalar(GU).applyQuaternion(F.q);
      const e = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)), k = Math.min(10, Math.ceil(e / .015));
      for (let i = 0; i <= k; i++) for (let j = 0; i + j <= k; j++) { v.copy(a).multiplyScalar((k - i - j) / k).addScaledVector(b, i / k).addScaledVector(c, j / k); S.push(v.x, v.y, v.z); } } });
  if (S.length < 30) return; let hi = -Infinity, lo = Infinity; for (let i = 0; i < S.length; i += 3) { hi = Math.max(hi, S[i]); lo = Math.min(lo, S[i]); }
  const front = new THREE.Vector3(); let nf = 0; for (let i = 0; i < S.length; i += 3) if (S[i] > hi - .01) { front.x += S[i]; front.y += S[i + 1]; front.z += S[i + 2]; nf++; }
  front.divideScalar(nf); const mz = new THREE.Vector3().fromArray(H.muzzle), gR = new THREE.Vector3().fromArray(H.hands.gripR), gL = new THREE.Vector3().fromArray(H.hands.gripL), bt = new THREE.Vector3().fromArray(H.butt), two = H.hands.two;
  const R = new Float32Array(S.length); for (let i = 0; i < S.length; i += 3) { R[i] = S[i] - front.x; R[i + 1] = S[i + 1] - front.y; R[i + 2] = S[i + 2] - front.z; }   // (about its tip: the tip stays on CS2's)
  const back = []; for (let i = 0; i < S.length; i += 3) if (S[i] < lo + .03) back.push(i);   // (its butt plate: the surface within 3 cm of its rear end)
  const atBack = (kx, ky, p) => { let bd = Infinity; for (const i of back) { const dx = mz.x + kx * R[i] - p.x, dy = mz.y + ky * R[i + 1] - p.y, dz = mz.z + ky * R[i + 2] - p.z; bd = Math.min(bd, dx * dx + dy * dy + dz * dz); } return Math.sqrt(bd); };
  const nearest = (kx, ky, p, out) => { let bd = Infinity, bi = 0; for (let i = 0; i < R.length; i += 3) { const dx = mz.x + kx * R[i] - p.x, dy = mz.y + ky * R[i + 1] - p.y, dz = mz.z + ky * R[i + 2] - p.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; bi = i; } } if (out) out.set(mz.x + kx * R[bi], mz.y + ky * R[bi + 1], mz.z + ky * R[bi + 2]); return Math.sqrt(bd); };
  const score = (kx, ky) => nearest(kx, ky, gR) + (two ? .6 * nearest(kx, ky, gL) : 0) + .5 * atBack(kx, ky, bt) + .02 * Math.abs(kx - ky);   // (CS2's butt on its butt plate: a stand-in's plate may slant, its rear-most point alone says little)
  let bx = F.k, by = F.k, bs = Infinity; for (const [step, span] of [[.1, null], [.02, .1]]) { const x0 = span ? bx : 1.1, y0 = span ? by : 1.1, hw = span ?? .5;
    for (let kx = Math.max(.6, x0 - hw); kx <= Math.min(1.6, x0 + hw) + 1e-6; kx += step) for (let ky = Math.max(.6, y0 - hw); ky <= Math.min(1.6, y0 + hw) + 1e-6; ky += step) { const s = score(kx, ky); if (s < bs) { bs = s; bx = kx; by = ky; } } }
  // local scale: our x → wpn −y, y → +z, z → −x (WPN_CARRY), so wpn's (kx, ky, ky) is our (ky, ky, kx); the tip on CS2's tip
  F.k = bx; F.s = new THREE.Vector3(by, by, bx); F.p.set(mz.x - bx * front.x, mz.y - by * front.y, mz.z - by * front.z);
  if (two) { const n = new THREE.Vector3(); if (nearest(bx, by, gL, n) > .01) F.ikL = n.sub(gL); } }   // (the left wrist moved by the gap: its palm onto this gun's surface)
// Measure every item's model once (at load, after the weapon models are in), so no equip mid-round measures one — and again
// for a model made later (a star knife baked from its first-person set, fp-view.js → registerModel: the 567-vertex fallback
// was measured at load, the baked knife's first equip measured it in frame code, 2–5 ms), out of the frame that made it.
export function warmHolds(ids = Object.keys(HOLDS || {})) { let n = 0; for (const id of ids) { if (!HOLDS?.[id]) continue; const g = weaponModel(id, 1); if (holdFit(id, g)) n++; } return n; }
onModelRegistered(id => { if (HOLDS?.[id]) setTimeout(() => warmHolds([id]), 0); });
function animator(body, T) {
  const mixer = new THREE.AnimationMixer(body), acts = new Map();
  const get = (name, part) => { const c = CLIPS.get(name); if (!c) return null; const k = name + '|' + part; let a = acts.get(k); if (!a) { a = mixer.clipAction(c[part]); a.enabled = true; a.setEffectiveWeight(0); a.play(); acts.set(k, a); } return a; };
  const loco = {}; for (const cls of ['rifle', 'pistol', 'knife']) { loco[cls] = { idle: get(cls + '/idle', 'lower'), idleC: get(cls + '/idle_crouch', 'lower'), walk: DIR8.map(d => get(`${cls}/walk_${d}`, 'lower')), run: DIR8.map(d => get(`${cls}/run_${d}`, 'lower')), crouch: DIR8.map(d => get(`${cls}/crouch_${d}`, 'lower')) };
    for (const a of [loco[cls].idle, loco[cls].idleC, ...loco[cls].walk, ...loco[cls].run, ...loco[cls].crouch]) if (a) a.timeScale = 0; }   // (time set here, in step with the feet)
  const all = Object.values(loco).flatMap(L => [L.idle, L.idleC, ...L.walk, ...L.run, ...L.crouch]).filter(Boolean);
  let phase = 0, hold = null, holdC = null, holdLo = null, holdLoC = null, one = null, oneT = 0, oneFull = null, lastAct = null, lastShot = 0, gid = null, cls = 'rifle', cr = 0, knifeOn = false, fitNow = null, pitch = 0;
  const wpn = body.getObjectByName('wpn'), carry = new THREE.Group(), turn = new THREE.Group(); carry.name = 'wpn-carry'; turn.name = 'wpn-turn'; carry.add(turn); if (wpn) {   /* (named: tests read the gun's own frame, under turn) */ wpn.add(carry); carry.scale.setScalar(1 / T.k); carry.quaternion.copy(WPN_CARRY); }   // the gun in game units, its muzzle along the bone's x (WPN_CARRY), its grip in the palm (setGun)
  // The chest on the hips as the gun's hold has it (CS2 points the gun where the player looks). The legs come from the
  // walk clips and the chest, arms and gun from the gun's hold — a full pose CS2 authored over its own turned hips (a
  // rifle's bladed stance); laid over the walk clips' hips the rifle pointed back over the shoulder. So each frame the
  // chest (spine_1, the head, arms and gun with it) is set as the hold has it relative to its own hips and lowest spine:
  // spine_1 ← (hips · spine_0 now)⁻¹ · (hips · spine_0 in the hold) · spine_1. The hold's pair is read once per gun.
  const pelvis = body.getObjectByName('pelvis'), spine0 = body.getObjectByName('spine_0'), spine = body.getObjectByName('spine_1');
  const holdBase = new THREE.Quaternion(), holdBaseC = new THREE.Quaternion(), s1clip = new THREE.Quaternion(); let baseOn = false, s1Kept = false;
  const spineUp = [spine, body.getObjectByName('spine_2'), body.getObjectByName('spine_3')].filter(Boolean), upKept = spineUp.slice(1).map(b => [b, b.quaternion.clone()]);   // (aim pitch: below)
  const armL = ['arm_upper_L', 'arm_lower_L', 'hand_L'].map(n => body.getObjectByName(n)), armOk = armL.every(Boolean); if (armOk) for (const b of armL) upKept.push([b, b.quaternion.clone()]);   // (the left hand's IK onto a stand-in gun: its clip values put back before each mixer pass too)
  // The gun in the right hand. CS2's weapon bone (wpnPivot → wpn) hangs off the root, put by the clips where the hold's
  // own hips and chest put the hands; under the walk and run clips' hips (they lean, bob and sway) and the chest set as
  // above, the hands moved off it — other players saw the gun float beside the hands (5 units off at a run). So the pivot
  // rides the right hand: each frame where the gun's hold has it relative to that hand, read once per gun from the hold's
  // first frame over the whole chain (hips, spine, shoulder, arm, hand: each joint's own track there, else its rest).
  const handR = body.getObjectByName('hand_R'), pivot = body.getObjectByName('wpnPivot'), chain = []; for (let o = handR; o && pivot && o !== pivot.parent; o = o.parent) chain.unshift(o);
  const restOf = new Map(); for (const b of [...chain, pivot, wpn]) if (b) restOf.set(b, [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const offP = new THREE.Matrix4(), offPC = new THREE.Matrix4(), hm = new THREE.Matrix4(), tm = new THREE.Matrix4(), pvClipP = new THREE.Vector3(), pvClipQ = new THREE.Quaternion(), pvClipS = new THREE.Vector3(1, 1, 1); let offOn = false;
  const fk = (clip, bones, out) => { out.identity(); for (const b of bones) { const [p, q, sc] = restOf.get(b), tp = clip.tracks.find(t => t.name === b.name + '.position'), tq = clip.tracks.find(t => t.name === b.name + '.quaternion');
    fv.copy(p); if (tp) fv.fromArray(tp.values, 0); fq.copy(q); if (tq) fq.fromArray(tq.values, 0); out.multiply(tm.compose(fv, fq, sc)); } return out; };
  const offOf = (name, out) => { const c = CLIPS.get(name)?.full; if (!c || !handR || !pivot || chain[0]?.parent !== pivot.parent) return false; fk(c, chain, hm); fk(c, [pivot], out).premultiply(hm.invert()); return true; };
  const poseOf = (name, out) => { const c = CLIPS.get(name)?.full; if (!c) return false; const tp = c.tracks.find(t => t.name === 'pelvis.quaternion'), t0 = c.tracks.find(t => t.name === 'spine_0.quaternion');
    if (!tp || !t0) return false; out.fromArray(tp.values, 0).multiply(aq.fromArray(t0.values, 0)); return true; };
  function setGun(id, kind, model = null) {   // which clips: the gun's own (ak, m4, …), the knife's own (CS2 has one per knife: the karambit's is a reverse grip), a grenade's (the molotov its own), the bomb's
    knifeOn = !!id && KNIFE_ID.test(id); const own = id === 'knife' ? 'knife-ct' : id;   // (holds-clips.json: knife-ct/hold — cs2_anims' knife/hold is the shared _default_knife idle)
    gid = !id ? null : knifeOn ? (CLIPS.has(own + '/hold') ? own : 'knife') : CLIPS.has(id + '/hold') ? id : NADE_IDS.has(id) ? 'nade' : id === 'c4' ? 'c4' : id;
    cls = kind === 'pistol' ? 'pistol' : kind === 'rifle' ? 'rifle' : 'knife';
    const h = gid && (CLIPS.has(gid + '/hold') ? gid : cls === 'rifle' ? 'ak' : cls === 'pistol' ? 'pistol' : 'knife');
    if (hold) hold.setEffectiveWeight(0); if (holdC) holdC.setEffectiveWeight(0); if (holdLo) holdLo.setEffectiveWeight(0); if (holdLoC) holdLoC.setEffectiveWeight(0);
    hold = h ? get(h + '/hold', 'upper') : get(cls + '/idle', 'upper'); holdC = h ? get(h + '/hold_crouch', 'upper') || hold : get(cls + '/idle_crouch', 'upper') || hold;
    // Standing still CS2 shows the hold whole (its per-gun idle is a full-body pose: the bladed stance, the feet with it); walking, the walk's legs under it.
    holdLo = h ? get(h + '/hold', 'lower') : null; holdLoC = h ? get(h + '/hold_crouch', 'lower') || holdLo : null; for (const a of [holdLo, holdLoC]) if (a) a.timeScale = 0;
    baseOn = !!h && poseOf(h + '/hold', holdBase); if (baseOn && !poseOf(h + '/hold_crouch', holdBaseC)) holdBaseC.copy(holdBase);
    offOn = !!h && offOf(h + '/hold', offP); if (offOn && !offOf(h + '/hold_crouch', offPC)) offPC.copy(offP);
    // The grip in the palm: our models hold at their origin (the grip; a knife's guard; the bomb's middle), CS2's wpn
    // bone sits at the bore ~15 cm ahead of and above the hand (ak: the palm at −9.8, −3.6, −11 cm in its frame). So
    // the palm's centre (half way from the wrist to the middle knuckle, prepare()) is read in the bone's frame at the
    // hold's first frame — the same hand ↔ pivot relation update() keeps — and the gun's origin put there, on the bore's
    // own plane (y 0: the hand beside the grip, not in it); ITEM_HOLD moves the item's grip / turns it on top.
    // With CS2's hold data (HOLDS) none of that: the model lies where CS2's own world model lies on wpn (holdFit).
    const I = ITEM_HOLD[gid] || null; turn.quaternion.copy(I?.turn || IDQ); turn.position.fromArray(I?.at || ZERO3); carry.position.set(0, 0, 0); carry.quaternion.copy(WPN_CARRY); carry.scale.setScalar(1 / T.k);
    const F = id && model ? holdFit(id, model) : null; fitNow = F;
    if (F) { carry.quaternion.copy(F.q); carry.position.copy(F.p); if (F.s) carry.scale.copy(F.s).divideScalar(T.k); else carry.scale.setScalar(F.k / T.k); turn.quaternion.copy(IDQ); turn.position.set(0, 0, 0); }
    else if (offOn && wpn && wpn.parent === pivot) { fk(CLIPS.get(h + '/hold').full, [wpn], gm); gp.copy(T.hands.r.d).multiplyScalar(T.hands.r.palm * .5).applyMatrix4(hm.copy(offP).invert()).applyMatrix4(gm.invert()); carry.position.set(gp.x, 0, gp.z); } }
  function play(name, full = false) { const a = get(name, 'upper'); if (!a) return; if (one && one !== a) one.setEffectiveWeight(0); one = a; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1; oneT = 0;
    if (oneFull) oneFull.setEffectiveWeight(0); oneFull = full ? get(name, 'lower') : null; if (oneFull) { oneFull.reset(); oneFull.setLoop(THREE.LoopOnce, 1); oneFull.clampWhenFinished = true; oneFull.timeScale = 1; } }
  function update(dt, s, g) {
    // Moving which way, relative to where the agent faces (−z in g)?
    const sp = s.speed || 0; g.getWorldQuaternion(fq); fv.set(0, 0, -1).applyQuaternion(fq);
    const fwd = (s.vx || 0) * fv.x + (s.vz || 0) * fv.z, right = -(s.vx || 0) * fv.z + (s.vz || 0) * fv.x, dirA = Math.atan2(right, fwd);
    let k = (dirA / (Math.PI / 4) + 8) % 8, i0 = Math.floor(k) % 8, i1 = (i0 + 1) % 8, f = k - Math.floor(k); if (!(sp > .5)) { i0 = 0; i1 = 1; f = 0; }
    cr += ((s.crouch ? 1 : 0) - cr) * Math.min(1, dt * 10); const moving = Math.min(1, sp / 4), run = Math.min(1, Math.max(0, (sp - WALK) / (RUN - WALK)));
    // In step: the walk at its pace, the run at its own, a crouch walk at its; the phase is shared, so blends don't slide.
    const L = loco[cls] || loco.rifle, dw = L.walk[0]?.getClip().duration || 1, dr = L.run[0]?.getClip().duration || 1, dc = L.crouch[0]?.getClip().duration || 1;
    const rate = cr > .5 ? sp / (CROUCH * dc) : (1 - run) * sp / (WALK * dw) + run * sp / (RUN * dr); phase = (phase + dt * rate) % 1;
    // A plant / defuse / reload / throw / shot / swing starts once, as it happens.
    const act = s.act || null; if (act !== lastAct) { lastAct = act;
      if (act === 'reload') play((CLIPS.has(gid + '/reload') ? gid : cls === 'pistol' ? 'pistol' : 'ak') + (cr > .5 && CLIPS.has(gid + '/reload_crouch') ? '/reload_crouch' : '/reload'));
      else if (act === 'throw') play('nade/throw'); else if (act === 'plant') play(cr > .5 ? 'c4/plant_crouch' : 'c4/plant', true); else if (act === 'defuse') play(cr > .5 ? 'defuse/enter_crouch' : 'defuse/enter', true); }
    if (s.shotAt && s.shotAt !== lastShot) { lastShot = s.shotAt; if (!one || oneT > .2) play(knifeOn ? 'knife/swing' : (CLIPS.has(gid + '/shoot') ? gid : cls === 'pistol' ? 'pistol' : 'ak') + '/shoot'); }
    let ow = 0; if (one) { oneT += dt; const D = one.getClip().duration; ow = Math.min(1, oneT / .08, (D - oneT) / .15); if (oneT >= D) { if (lastAct === 'defuse' && one.getClip().name.startsWith('defuse/enter')) play(cr > .5 ? 'defuse/loop_crouch' : 'defuse/loop', true); else { one.setEffectiveWeight(0); one = null; if (oneFull) { oneFull.setEffectiveWeight(0); oneFull = null; } ow = 0; } } }
    if (one) one.setEffectiveWeight(ow); const fw = oneFull ? ow : 0; if (oneFull) oneFull.setEffectiveWeight(fw);
    // Legs: idle ↔ (walk ↔ run) or crouch idle ↔ crouch walk, between the two nearest of the eight directions.
    for (const a of all) a.setEffectiveWeight(0);
    const lw = 1 - fw, set = (list, w) => { if (w <= 0) return; const a0 = list[i0], a1 = list[i1]; if (a0) { a0.setEffectiveWeight(w * (1 - f)); a0.time = phase * a0.getClip().duration; } if (a1) { a1.setEffectiveWeight(w * f); a1.time = phase * a1.getClip().duration; } };
    // Standing still: the hold's own legs (CS2's per-gun idle is the whole body), else the class idle.
    const still = lw * (1 - moving), lo = holdLo || L.idle, loC = holdLoC && holdLoC !== holdLo ? holdLoC : L.idleC; if (holdLo) holdLo.setEffectiveWeight(0); if (holdLoC) holdLoC.setEffectiveWeight(0);
    if (lo) lo.setEffectiveWeight(still * (1 - cr)); if (loC) loC.setEffectiveWeight(loC === lo ? still : still * cr);
    set(L.walk, lw * moving * (1 - cr) * (1 - run)); set(L.run, lw * moving * (1 - cr) * run); set(L.crouch, lw * moving * cr);
    // Upper body: the gun's hold (crouched: its crouched hold), under whatever plays once.
    if (hold) hold.setEffectiveWeight((1 - ow) * (holdC === hold ? 1 : 1 - cr)); if (holdC && holdC !== hold) holdC.setEffectiveWeight((1 - ow) * cr);
    // (three.js writes a bone only when its blended value changes: a one-frame hold leaves spine_1 as last set — with last
    // frame's turn on it, which then built up every frame, the chest spinning round as the hips moved. Its clip value first.)
    if (s1Kept) { spine.quaternion.copy(s1clip); for (let i = 0; i < upKept.length; i++) upKept[i][0].quaternion.copy(upKept[i][1]); if (pivot) { pivot.position.copy(pvClipP); pivot.quaternion.copy(pvClipQ); pivot.scale.copy(pvClipS); } }   // (the gun's pivot too: set from the hand below)
    mixer.update(s.dead ? 0 : dt); if (spine) { s1clip.copy(spine.quaternion); s1Kept = true; for (let i = 0; i < upKept.length; i++) upKept[i][1].copy(upKept[i][0].quaternion); if (pivot) { pvClipP.copy(pivot.position); pvClipQ.copy(pivot.quaternion); pvClipS.copy(pivot.scale); } }
    if (baseOn && pelvis && spine0 && spine && !s.dead && fw < .5) { aq.copy(pelvis.quaternion).multiply(spine0.quaternion).invert(); aq2.copy(cr > .5 ? holdBaseC : holdBase); spine.quaternion.premultiply(aq.multiply(aq2)); }   // (the chest as the hold has it on its hips; not while a plant / defuse moves the whole body)
    // Aim pitch (CS2 layers its aim poses over the hold): the chest bends up / down where the player looks, a third at each
    // of spine_1, _2, _3 about the agent's right — the arms, hands and gun (it rides the right hand, next) go with it, so the
    // hold itself never changes. (Their clip values are put back before the next mixer pass: upKept.)
    pitch += (Math.max(-1.2, Math.min(1.2, s.pitch || 0)) * (s.dead ? 0 : 1) - pitch) * Math.min(1, dt * 12);
    if (spine && spine0 && pelvis && Math.abs(pitch) > 1e-3 && fw < .5) { aq.copy(pelvis.parent.quaternion).multiply(pelvis.quaternion).multiply(spine0.quaternion);
      for (let i = 0; i < spineUp.length; i++) { const b = spineUp[i]; fv.set(-1, 0, 0).applyQuaternion(aq2.copy(aq).invert()); b.quaternion.premultiply(aq2.setFromAxisAngle(fv, pitch / 3)); aq.multiply(b.quaternion); } }
    if (offOn && !s.dead && fw < .5) { hm.identity(); for (const b of chain) hm.multiply(tm.compose(b.position, b.quaternion, b.scale)); hm.multiply(cr > .5 ? offPC : offP).decompose(pivot.position, pivot.quaternion, pivot.scale); }   // the gun in the right hand
    // A stand-in gun (fitStandIn): the left wrist moved by the gap between CS2's grip and this gun's surface (in wpn's frame:
    // it follows the gun walking, aiming), two-bone IK with the elbow bent as the clip has it, the hand turned as the clip
    // holds it; faded out under a reload / throw / shot that plays once. (Bone lengths read live: no array, no allocation.)
    const ikW = fitNow?.ikL && armOk && wpn && !s.dead ? (1 - ow) * (1 - fw) : 0;
    if (ikW > .01) { armL[2].getWorldPosition(ikT); armL[2].getWorldQuaternion(ikQ); armL[0].getWorldPosition(ikA); armL[1].getWorldPosition(ikB); ikLen[0] = ikA.distanceTo(ikB); ikLen[1] = ikB.distanceTo(ikT);
      wpn.updateWorldMatrix(true, false); ikT.addScaledVector(ikD.copy(fitNow.ikL).applyMatrix3(ikM.setFromMatrix4(wpn.matrixWorld)), ikW); ikB.sub(ikA);
      ik(armL[0], armL[1], armL[2], ikLen, ikT, ikB, 1); setWorldQuat(armL[2], ikQ); }
  }
  return { mixer, update, setGun, carry, turn };
}
