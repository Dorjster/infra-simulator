// Counter-Strike 2 agents (player characters) imported on this computer: tools/import-cs2-models.mjs converts them to
// user-assets/agents/ct.glb and t.glb (one skeleton with CS2's bone names, standing on y = 0, facing +z, metres),
// the room serves them, and every player in a Global Defensive match is drawn as their side's agent when there is
// one (else the built-in soldiers, gd-soldiers.js). Never shipped: the models are Valve's.
// The pose is made here from the same state the soldiers get (speed, crouch, holding a gun, reload / throw, dead):
// legs and arms by two-bone IK (feet planted, knees bending as the body crouches; both hands on the gun), the spine
// leaning in. Hit boxes come from the pose, never from the model: the agent stands at its true size (CS2's 72 u, the
// capsule's height; its head where the head zone is, weapons-data.js) and drops as the capsule does crouched. Allocation-free per frame.
import { CASTER } from './sun-shadows.js';
import { skinObject, unskinObject, sameSkin } from './skin-render.js';
import * as THREE from './three.module.js';
import { gltfLoader } from './gltf-loader.js';
import { userAssets, userAssetURL } from './user-assets.js';
import { weaponModel, knifeFor, MUZZLE } from './weapon-models.js';
import { weaponById } from './weapons-data.js';
import { addRim, rimFor } from './rim-light.js';
import { live } from './live-settings.js';
import { fitImage, anisotropy } from './texture-quality.js';

const templates = {}; let loading = null;
// Load the imported agents (once): resolves to the sides that have one.
export function loadAgents() {
  return loading ??= userAssets().then(ua => Promise.all([...Object.entries(ua.models.agents || {}).map(([side, a]) =>
    gltfLoader().loadAsync(userAssetURL(ua, a.file)).then(async g => { await fitTextures(g.scene); templates[side] = prepare(g.scene); }, e => console.warn('agent', side, e?.message))),
    ua.models.agentAnims ? gltfLoader().loadAsync(userAssetURL(ua, ua.models.agentAnims.file)).then(g => { CLIPS = splitClips(g.animations); }, e => console.warn('agent animations', e?.message)) : null])).then(() => Object.keys(templates));
}
// CS2's own third-person animations (one file for both sides, user-assets: models.agentAnims — CS2's world-model clips,
// the agents' own bone names; ~/CS2-extract/build/agent_anims.py). Each clip in two halves: the legs and hips (walking,
// running, crouching: lower) and the chest, arms and hands (the gun's own hold, its reload, shot, a throw: upper), so the
// legs can walk while the arms do something else, as CS2's animation graph layers them.
let CLIPS = null;
const UPPER = /^(spine_[123]|neck_|head_|clavicle_|arm_|hand_|finger_|wpn|weapon|eye|jiggle)/i;
function splitClips(list) { const m = new Map(); for (const c of list) { const up = [], lo = []; for (const t of c.tracks) (UPPER.test(t.name.split('.')[0]) ? up : lo).push(t);
  m.set(c.name, { full: c, upper: new THREE.AnimationClip(c.name + '#up', c.duration, up), lower: new THREE.AnimationClip(c.name + '#lo', c.duration, lo) }); } return m; }
export const hasAgent = side => !!templates[side];
// Its pictures at the size Settings → Texture quality asks for (stored at 2048), filtered as set.
async function fitTextures(root) { const ts = new Set(); root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (m[k]) ts.add(m[k]); });
  const a = anisotropy(); await Promise.all([...ts].map(async t => { t.image = await fitImage(t.image); t.anisotropy = a; t.needsUpdate = true; })); }

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
export function makeAgent(p, team, { lightAt = null } = {}) {
  const T = templates[team]; if (!T) return null;
  const g = new THREE.Group(), fallG = new THREE.Group(), face = new THREE.Group(), model = new THREE.Group(), body = cloneSkinned(T.scene);
  g.add(fallG); fallG.add(face); face.rotation.y = Math.PI; face.add(model); model.scale.setScalar(T.k); model.add(body);   // the avatar convention: facing −z in g
  body.traverse(o => { if (o.isMesh) o.layers.enable(CASTER); });   // (casts its shadow on a baked CS2 map: sun-shadows.js)
  const B = {}; body.traverse(o => { const n = o.name.toLowerCase(); if (o.isBone && POSED.includes(n) && !B[n]) B[n] = o; });
  const own = [], rim = { value: rimFor(1) }; if (lightAt) body.traverse(o => { if (o.isMesh) { o.material = [].concat(o.material).map(m => { const c = addRim(m.clone()); c.userData = { rim }; own.push(c); return c; }); if (o.material.length === 1) o.material = o.material[0]; } });
  let shade = 1, shadeAt = 0; const feetW = new THREE.Vector3();
  const rest = POSED.filter(n => B[n]).map(n => [B[n], B[n].position.clone(), B[n].quaternion.clone()]), fingers = FINGERS.filter(n => B[n]).map(n => [B[n], /thumb/.test(n), +n.split('_')[2], n.endsWith('_l')]), curlAx = new THREE.Vector3(), curlQ = new THREE.Quaternion(), ankleRest = { l: new THREE.Quaternion(), r: new THREE.Quaternion() };
  g.updateMatrixWorld(true); for (const s of ['l', 'r']) { B['ankle_' + s].getWorldQuaternion(ankleRest[s]); model.getWorldQuaternion(q1); ankleRest[s].premultiply(q1.invert()); }   // feet flat: their rotation in model space
  const holder = new THREE.Group(); holder.scale.setScalar(1 / T.k); holder.rotation.y = Math.PI; model.add(holder);   // the gun, in game units, muzzle → +z
  const A = CLIPS ? animator(body, T) : null;   // CS2's own clips when the room has them; else posed here (below)
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
  function setWeapon(id) {
    id = id ? knifeFor(id, team) : null; if (id === gunId) return; gunId = id; if (gun) { unskinObject(gun); gun.removeFromParent(); gun = null; } if (!id) { kind = 'none'; A?.setGun(null, 'none'); return; }
    const w = weaponById(id === 'knife-t' ? 'knife' : id); kind = /knife|karambit/.test(id) ? 'knife' : ['he', 'flash', 'smoke', 'molotov', 'c4', 'incendiary', 'incgrenade', 'decoy'].includes(id) ? 'item' : w?.kind === 'pistol' ? 'pistol' : 'rifle';
    gun = weaponModel(id, 1); gun.traverse(o => { if (o.isMesh) { o.castShadow = true; o.layers.enable(CASTER); } }); (A ? A.carry : holder).add(gun); A?.setGun(id, kind); if (skinNow) skinObject(gun, skinNow);
    { const box = new THREE.Box3().setFromObject(gun); stock = Math.max(.12, box.max.z / T.k); reachFwd = Math.max(.1, -box.min.z / T.k); }   // grip → butt and grip → muzzle, metres
  }
  function update(dt, s = {}) {
    if (own.length) { shadeAt -= dt; if (shadeAt <= 0) { shadeAt = .15; g.getWorldPosition(feetW); const l = lightAt(feetW.x, feetW.y, feetW.z), want = Math.min(1.1, Math.max(.3, .3 + .75 * l)); shade += (want - shade) * .5; for (const m of own) m.color.setScalar(shade); rim.value = live.rim ? rimFor(shade) : 0; } }
    const k = Math.min(1, dt * 10); st.speed += ((s.speed || 0) - st.speed) * Math.min(1, dt * 8); st.crouch += ((s.crouch ? 1 : 0) - st.crouch) * k; st.gun += ((s.aim && !s.dead ? 1 : 0) - st.gun) * k;
    st.reload += ((s.act === 'reload' ? 1 : 0) - st.reload) * Math.min(1, dt * 9); st.throwA += ((s.act === 'throw' ? 1 : 0) - st.throwA) * Math.min(1, dt * 14);
    fall += ((s.dead ? 1 : 0) - fall) * Math.min(1, dt * 7); fallG.rotation.x = -fall * Math.PI / 2; fallG.position.y = fall * 1.3;
    if (A) { A.update(dt, s, g); return; }   // (the clips pose it)
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
  function dispose() { g.removeFromParent(); if (gun) gun.removeFromParent(); A?.mixer.stopAllAction(); for (const m of own) m.dispose(); }
  // Their skin on the gun in their hands (skins.js): set as the room's state changes; drawn by skin-render.js.
  let skinNow = null; function setSkin(sk) { sk = sk || null; if (sameSkin(sk, skinNow)) return; skinNow = sk; if (gun) skinObject(gun, skinNow); }
  return { g, team, update, setWeapon, setSkin, dispose };
}
// The animated agent (CS2's clips; see CLIPS): legs from the walking / running / crouching clips of the gun's class
// (rifle, pistol, knife), blended by the speed and the direction moved relative to the facing (CS2's eight
// directions), their time kept in step with the feet; the upper body in the gun's own hold, and a reload, a shot, a
// throw or a knife swing played over it once; a plant or a defuse moves the whole body. The gun rides CS2's weapon
// bone (wpn). Allocation-free per frame.
const DIR8 = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'], U = 2.54 / 16.5;
const WALK = 130 * U, RUN = 250 * U, CROUCH = 85 * U;   // CS2's speeds (u/s) in game units: the clips' own pace
const NADE_IDS = new Set(['he', 'flash', 'smoke', 'molotov', 'incendiary', 'incgrenade', 'decoy']);   // game kind ids ('incendiary'); 'incgrenade' = CS2's own name
const fq = new THREE.Quaternion(), fv = new THREE.Vector3(), aq = new THREE.Quaternion(), aq2 = new THREE.Quaternion();
function animator(body, T) {
  const mixer = new THREE.AnimationMixer(body), acts = new Map();
  const get = (name, part) => { const c = CLIPS.get(name); if (!c) return null; const k = name + '|' + part; let a = acts.get(k); if (!a) { a = mixer.clipAction(c[part]); a.enabled = true; a.setEffectiveWeight(0); a.play(); acts.set(k, a); } return a; };
  const loco = {}; for (const cls of ['rifle', 'pistol', 'knife']) { loco[cls] = { idle: get(cls + '/idle', 'lower'), idleC: get(cls + '/idle_crouch', 'lower'), walk: DIR8.map(d => get(`${cls}/walk_${d}`, 'lower')), run: DIR8.map(d => get(`${cls}/run_${d}`, 'lower')), crouch: DIR8.map(d => get(`${cls}/crouch_${d}`, 'lower')) };
    for (const a of [loco[cls].idle, loco[cls].idleC, ...loco[cls].walk, ...loco[cls].run, ...loco[cls].crouch]) if (a) a.timeScale = 0; }   // (time set here, in step with the feet)
  const all = Object.values(loco).flatMap(L => [L.idle, L.idleC, ...L.walk, ...L.run, ...L.crouch]).filter(Boolean);
  let phase = 0, hold = null, holdC = null, one = null, oneT = 0, oneFull = null, lastAct = null, lastShot = 0, gid = null, cls = 'rifle', cr = 0;
  const wpn = body.getObjectByName('wpn'), carry = new THREE.Group(); if (wpn) { wpn.add(carry); carry.scale.setScalar(1 / T.k); carry.rotation.set(0, Math.PI / 2, 0); }   // the gun in game units, muzzle → +z, along the bone's x
  // The chest on the hips as the gun's hold has it (CS2 points the gun where the player looks). The legs come from the
  // walk clips and the chest, arms and gun from the gun's hold — a full pose CS2 authored over its own turned hips (a
  // rifle's bladed stance); laid over the walk clips' hips the rifle pointed back over the shoulder. So each frame the
  // chest (spine_1, the head, arms and gun with it) is set as the hold has it relative to its own hips and lowest spine:
  // spine_1 ← (hips · spine_0 now)⁻¹ · (hips · spine_0 in the hold) · spine_1. The hold's pair is read once per gun.
  const pelvis = body.getObjectByName('pelvis'), spine0 = body.getObjectByName('spine_0'), spine = body.getObjectByName('spine_1');
  const holdBase = new THREE.Quaternion(), holdBaseC = new THREE.Quaternion(), s1clip = new THREE.Quaternion(); let baseOn = false, s1Kept = false;
  // The gun in the right hand. CS2's weapon bone (wpnPivot → wpn) hangs off the root, put by the clips where the hold's
  // own hips and chest put the hands; under the walk and run clips' hips (they lean, bob and sway) and the chest set as
  // above, the hands moved off it — other players saw the gun float beside the hands (5 units off at a run). So the pivot
  // rides the right hand: each frame where the gun's hold has it relative to that hand, read once per gun from the hold's
  // first frame over the whole chain (hips, spine, shoulder, arm, hand: each joint's own track there, else its rest).
  const handR = body.getObjectByName('hand_R'), pivot = body.getObjectByName('wpnPivot'), chain = []; for (let o = handR; o && pivot && o !== pivot.parent; o = o.parent) chain.unshift(o);
  const restOf = new Map(); for (const b of [...chain, pivot]) if (b) restOf.set(b, [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const offP = new THREE.Matrix4(), offPC = new THREE.Matrix4(), hm = new THREE.Matrix4(), tm = new THREE.Matrix4(), pvClipP = new THREE.Vector3(), pvClipQ = new THREE.Quaternion(), pvClipS = new THREE.Vector3(1, 1, 1); let offOn = false;
  const fk = (clip, bones, out) => { out.identity(); for (const b of bones) { const [p, q, sc] = restOf.get(b), tp = clip.tracks.find(t => t.name === b.name + '.position'), tq = clip.tracks.find(t => t.name === b.name + '.quaternion');
    fv.copy(p); if (tp) fv.fromArray(tp.values, 0); fq.copy(q); if (tq) fq.fromArray(tq.values, 0); out.multiply(tm.compose(fv, fq, sc)); } return out; };
  const offOf = (name, out) => { const c = CLIPS.get(name)?.full; if (!c || !handR || !pivot || chain[0]?.parent !== pivot.parent) return false; fk(c, chain, hm); fk(c, [pivot], out).premultiply(hm.invert()); return true; };
  const poseOf = (name, out) => { const c = CLIPS.get(name)?.full; if (!c) return false; const tp = c.tracks.find(t => t.name === 'pelvis.quaternion'), t0 = c.tracks.find(t => t.name === 'spine_0.quaternion');
    if (!tp || !t0) return false; out.fromArray(tp.values, 0).multiply(aq.fromArray(t0.values, 0)); return true; };
  function setGun(id, kind) {   // which clips: the gun's own (ak, m4, …), the knife's, a grenade's, the bomb's
    gid = !id ? null : /knife|karambit/.test(id) ? 'knife' : NADE_IDS.has(id) ? 'nade' : id === 'c4' ? 'c4' : id;
    cls = kind === 'pistol' ? 'pistol' : kind === 'rifle' ? 'rifle' : 'knife';
    const h = gid && (CLIPS.has(gid + '/hold') ? gid : cls === 'rifle' ? 'ak' : cls === 'pistol' ? 'pistol' : 'knife');
    if (hold) hold.setEffectiveWeight(0); if (holdC) holdC.setEffectiveWeight(0);
    hold = h ? get(h + '/hold', 'upper') : get(cls + '/idle', 'upper'); holdC = h ? get(h + '/hold_crouch', 'upper') || hold : get(cls + '/idle_crouch', 'upper') || hold;
    baseOn = !!h && poseOf(h + '/hold', holdBase); if (baseOn && !poseOf(h + '/hold_crouch', holdBaseC)) holdBaseC.copy(holdBase);
    offOn = !!h && offOf(h + '/hold', offP); if (offOn && !offOf(h + '/hold_crouch', offPC)) offPC.copy(offP); }
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
    if (s.shotAt && s.shotAt !== lastShot) { lastShot = s.shotAt; if (!one || oneT > .2) play(gid === 'knife' ? 'knife/swing' : (CLIPS.has(gid + '/shoot') ? gid : cls === 'pistol' ? 'pistol' : 'ak') + '/shoot'); }
    let ow = 0; if (one) { oneT += dt; const D = one.getClip().duration; ow = Math.min(1, oneT / .08, (D - oneT) / .15); if (oneT >= D) { if (lastAct === 'defuse' && one.getClip().name.startsWith('defuse/enter')) play(cr > .5 ? 'defuse/loop_crouch' : 'defuse/loop', true); else { one.setEffectiveWeight(0); one = null; if (oneFull) { oneFull.setEffectiveWeight(0); oneFull = null; } ow = 0; } } }
    if (one) one.setEffectiveWeight(ow); const fw = oneFull ? ow : 0; if (oneFull) oneFull.setEffectiveWeight(fw);
    // Legs: idle ↔ (walk ↔ run) or crouch idle ↔ crouch walk, between the two nearest of the eight directions.
    for (const a of all) a.setEffectiveWeight(0);
    const lw = 1 - fw, set = (list, w) => { if (w <= 0) return; const a0 = list[i0], a1 = list[i1]; if (a0) { a0.setEffectiveWeight(w * (1 - f)); a0.time = phase * a0.getClip().duration; } if (a1) { a1.setEffectiveWeight(w * f); a1.time = phase * a1.getClip().duration; } };
    if (L.idle) L.idle.setEffectiveWeight(lw * (1 - moving) * (1 - cr)); if (L.idleC) L.idleC.setEffectiveWeight(lw * (1 - moving) * cr);
    set(L.walk, lw * moving * (1 - cr) * (1 - run)); set(L.run, lw * moving * (1 - cr) * run); set(L.crouch, lw * moving * cr);
    // Upper body: the gun's hold (crouched: its crouched hold), under whatever plays once.
    if (hold) hold.setEffectiveWeight((1 - ow) * (holdC === hold ? 1 : 1 - cr)); if (holdC && holdC !== hold) holdC.setEffectiveWeight((1 - ow) * cr);
    // (three.js writes a bone only when its blended value changes: a one-frame hold leaves spine_1 as last set — with last
    // frame's turn on it, which then built up every frame, the chest spinning round as the hips moved. Its clip value first.)
    if (s1Kept) { spine.quaternion.copy(s1clip); if (pivot) { pivot.position.copy(pvClipP); pivot.quaternion.copy(pvClipQ); pivot.scale.copy(pvClipS); } }   // (the gun's pivot too: set from the hand below)
    mixer.update(s.dead ? 0 : dt); if (spine) { s1clip.copy(spine.quaternion); s1Kept = true; if (pivot) { pvClipP.copy(pivot.position); pvClipQ.copy(pivot.quaternion); pvClipS.copy(pivot.scale); } }
    if (baseOn && pelvis && spine0 && spine && !s.dead && fw < .5) { aq.copy(pelvis.quaternion).multiply(spine0.quaternion).invert(); aq2.copy(cr > .5 ? holdBaseC : holdBase); spine.quaternion.premultiply(aq.multiply(aq2)); }   // (the chest as the hold has it on its hips; not while a plant / defuse moves the whole body)
    if (offOn && !s.dead && fw < .5) { hm.identity(); for (const b of chain) hm.multiply(tm.compose(b.position, b.quaternion, b.scale)); hm.multiply(cr > .5 ? offPC : offP).decompose(pivot.position, pivot.quaternion, pivot.scale); }   // the gun in the right hand
  }
  return { mixer, update, setGun, carry };
}
