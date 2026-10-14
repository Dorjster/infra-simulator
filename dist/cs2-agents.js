// Counter-Strike 2 agents (player characters) imported on this computer: tools/import-cs2-models.mjs converts them to
// user-assets/agents/ct.glb and t.glb (one skeleton with CS2's bone names, standing on y = 0, facing +z, metres),
// the room serves them, and every player in a Global Defensive match is drawn as their side's agent when there is
// one (else the built-in soldiers, gd-soldiers.js). Never shipped: the models are Valve's.
// The pose is made here from the same state the soldiers get (speed, crouch, holding a gun, reload / throw, dead):
// legs and arms by two-bone IK (feet planted, knees bending as the body crouches; both hands on the gun), the spine
// leaning in. Hit boxes come from the pose, never from the model: the agent is scaled so its head starts where the
// head zone does (HEAD_Y) and drops by the crouch's 18 HU, like the capsule. Allocation-free per frame.
import * as THREE from './three.module.js';
import { GLTFLoader } from './post/GLTFLoader.js';
import { userAssets, userAssetURL } from './user-assets.js';
import { weaponModel, knifeFor, MUZZLE } from './weapon-models.js';
import { weaponById, HEAD_Y } from './weapons-data.js';

const templates = {}; let loading = null;
// Load the imported agents (once): resolves to the sides that have one.
export function loadAgents() {
  return loading ??= userAssets().then(ua => Promise.all(Object.entries(ua.models.agents || {}).map(([side, a]) =>
    new GLTFLoader().loadAsync(userAssetURL(ua, a.file)).then(g => { templates[side] = prepare(g.scene); }, e => console.warn('agent', side, e?.message))))).then(() => Object.keys(templates));
}
export const hasAgent = side => !!templates[side];

// Fingers closed round a grip: each segment's bend (radians) about its own axis — fingers, thumb.
export const CURL = { axis: 'z', sign: 1, fingers: [.75, .9, .6], thumb: [.3, .4, .35] };   // ~125°: round a grip, not a clenched fist
const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'].flatMap(f => [0, 1, 2].flatMap(k => ['l', 'r'].map(sd => `finger_${f}_${k}_${sd}`)));
const POSED0 = ['pelvis', 'spine_0', 'spine_1', 'spine_2', 'spine_3', 'neck_0', 'head_0', 'clavicle_l', 'clavicle_r', 'arm_upper_l', 'arm_upper_r', 'arm_lower_l', 'arm_lower_r', 'hand_l', 'hand_r', 'leg_upper_l', 'leg_upper_r', 'leg_lower_l', 'leg_lower_r', 'ankle_l', 'ankle_r'], TWIST = ['arm_lower_l_twist', 'arm_lower_l_twist1', 'arm_lower_r_twist', 'arm_lower_r_twist1'], POSED = [...POSED0, ...TWIST, ...FINGERS];
// Rest measurements of a template (model space, metres): bone positions, limb lengths, the scale to game units.
function prepare(scene) {
  scene.updateMatrixWorld(true); const bones = {}; scene.traverse(o => { if (o.isBone && !bones[o.name]) bones[o.name] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; o.geometry.userData.shared = true; for (const m of [].concat(o.material)) m.userData.shared = true; } });
  const at = n => bones[n].getWorldPosition(new THREE.Vector3()), P = {}; for (const n of POSED0) if (bones[n]) P[n] = at(n); else throw Error('agent without bone ' + n);
  const len = (a, b) => P[a].distanceTo(P[b]);
  // Each hand's own frame (from its finger bones): toward the knuckles (d), the palm's facing (n, the side the thumb
  // sits on), the palm's length; so a hand can be laid on a grip palm first.
  const hands = {}; for (const sd of ['l', 'r']) { const q = bones['hand_' + sd].getWorldQuaternion(new THREE.Quaternion()).invert(), p0 = at('hand_' + sd), loc = n => at(n).sub(p0).applyQuaternion(q);
    const knuckle = loc('finger_middle_0_' + sd), d = knuckle.clone().normalize(), across = loc('finger_index_0_' + sd).sub(loc('finger_pinky_0_' + sd)), n = new THREE.Vector3().crossVectors(d, across).normalize();
    if (n.dot(loc('finger_thumb_1_' + sd)) < 0) n.negate(); n.addScaledVector(d, -n.dot(d)).normalize(); hands[sd] = { d, n, m: new THREE.Vector3().crossVectors(d, n), palm: knuckle.length() }; }
  return { scene, P, hands, k: HEAD_Y / P.head_0.y, arm: [len('arm_upper_l', 'arm_lower_l'), len('arm_lower_l', 'hand_l')], leg: [len('leg_upper_l', 'leg_lower_l'), len('leg_lower_l', 'ankle_l')] };
}
// A copy with its own bones (meshes, materials and pictures shared).
function cloneSkinned(src) {
  const out = src.clone(true), a = [], b = []; src.traverse(o => a.push(o)); out.traverse(o => b.push(o)); const map = new Map(a.map((o, i) => [o, b[i]]));
  b.forEach((o, i) => { if (o.isSkinnedMesh) { const s = a[i]; o.bind(new THREE.Skeleton(s.skeleton.bones.map(x => map.get(x)), s.skeleton.boneInverses), s.bindMatrix); } });
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
// bright in the sun, never invisible.
export function makeAgent(p, team, { lightAt = null } = {}) {
  const T = templates[team]; if (!T) return null;
  const g = new THREE.Group(), fallG = new THREE.Group(), face = new THREE.Group(), model = new THREE.Group(), body = cloneSkinned(T.scene);
  g.add(fallG); fallG.add(face); face.rotation.y = Math.PI; face.add(model); model.scale.setScalar(T.k); model.add(body);   // the avatar convention: facing −z in g
  const B = {}; body.traverse(o => { if (o.isBone && POSED.includes(o.name) && !B[o.name]) B[o.name] = o; });
  const own = []; if (lightAt) body.traverse(o => { if (o.isMesh) { o.material = [].concat(o.material).map(m => { const c = m.clone(); c.userData = {}; own.push(c); return c; }); if (o.material.length === 1) o.material = o.material[0]; } });
  let shade = 1, shadeAt = 0; const feetW = new THREE.Vector3();
  const rest = POSED.filter(n => B[n]).map(n => [B[n], B[n].position.clone(), B[n].quaternion.clone()]), fingers = FINGERS.filter(n => B[n]).map(n => [B[n], /thumb/.test(n), +n.split('_')[2], n.endsWith('_l')]), curlAx = new THREE.Vector3(), curlQ = new THREE.Quaternion(), ankleRest = { l: new THREE.Quaternion(), r: new THREE.Quaternion() };
  g.updateMatrixWorld(true); for (const s of ['l', 'r']) { B['ankle_' + s].getWorldQuaternion(ankleRest[s]); model.getWorldQuaternion(q1); ankleRest[s].premultiply(q1.invert()); }   // feet flat: their rotation in model space
  const holder = new THREE.Group(); holder.scale.setScalar(1 / T.k); holder.rotation.y = Math.PI; model.add(holder);   // the gun, in game units, muzzle → +z
  let gun = null, gunId = null, kind = 'none', fall = 0, phase = 0, stock = .3, reachFwd = .6; const st = { speed: 0, crouch: 0, gun: 0, reload: 0, throwA: 0 };
  const side = T.P.arm_upper_r.x < 0 ? -1 : 1;   // which way (model x) the right shoulder is
  const M = (x, y, z, out) => model.localToWorld(out.set(x, y, z));   // model space (metres) → world
  const dirW = (x, y, z, out) => { model.getWorldQuaternion(q1); return out.set(x, y, z).applyQuaternion(q1).normalize(); };
  const dR = new THREE.Vector3(), nR = new THREE.Vector3(), dL = new THREE.Vector3(), nL = new THREE.Vector3(), w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), qm = new THREE.Quaternion();
  const shR = new THREE.Vector3(), shL = new THREE.Vector3(), hR = new THREE.Vector3(), hL = new THREE.Vector3(), poleW = new THREE.Vector3(), fwdW = new THREE.Vector3(), rightW = new THREE.Vector3(), upW = new THREE.Vector3(), footW = new THREE.Vector3();
  function setWeapon(id) {
    id = id ? knifeFor(id, team) : null; if (id === gunId) return; gunId = id; if (gun) { holder.remove(gun); gun = null; } if (!id) { kind = 'none'; return; }
    const w = weaponById(id === 'knife-t' ? 'knife' : id); kind = /knife|karambit/.test(id) ? 'knife' : ['he', 'flash', 'smoke', 'molotov', 'c4', 'incgrenade', 'decoy'].includes(id) ? 'item' : w?.kind === 'pistol' ? 'pistol' : 'rifle';
    gun = weaponModel(id, 1); gun.traverse(o => { if (o.isMesh) o.castShadow = true; }); holder.add(gun);
    { const box = new THREE.Box3().setFromObject(gun); stock = Math.max(.12, box.max.z / T.k); reachFwd = Math.max(.1, -box.min.z / T.k); }   // grip → butt and grip → muzzle, metres
  }
  function update(dt, s = {}) {
    if (own.length) { shadeAt -= dt; if (shadeAt <= 0) { shadeAt = .15; g.getWorldPosition(feetW); const l = lightAt(feetW.x, feetW.y, feetW.z), want = Math.min(1.1, Math.max(.3, .3 + .75 * l)); shade += (want - shade) * .5; for (const m of own) m.color.setScalar(shade); } }
    const k = Math.min(1, dt * 10); st.speed += ((s.speed || 0) - st.speed) * Math.min(1, dt * 8); st.crouch += ((s.crouch ? 1 : 0) - st.crouch) * k; st.gun += ((s.aim && !s.dead ? 1 : 0) - st.gun) * k;
    st.reload += ((s.act === 'reload' ? 1 : 0) - st.reload) * Math.min(1, dt * 9); st.throwA += ((s.act === 'throw' ? 1 : 0) - st.throwA) * Math.min(1, dt * 14);
    fall += ((s.dead ? 1 : 0) - fall) * Math.min(1, dt * 7); fallG.rotation.x = -fall * Math.PI / 2; fallG.position.y = fall * 1.3;
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
  function dispose() { g.removeFromParent(); if (gun) holder.remove(gun); for (const m of own) m.dispose(); }
  return { g, team, update, setWeapon, dispose };
}
