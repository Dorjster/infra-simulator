// First-person arms on the guns (Global Defensive): "FPS Character Animation Pack" AK-47, Pistol and SAPS-12 by
// Cristian David Duque Camacho (DuqueCD7, CC BY 4.0, dist/models/fp). Each pack is a pair of gloved arms animated on
// its gun: draw, idle, walk, run, fire, reload. The AK, the pistol and the shotgun are the packs' own guns; the other
// rifles, SMG and machine gun use the rifle arms with our model on the pack's weapon bone (the Desert Eagle the
// pistol arms). The rig looks along +z from just in front of its shoulders.
import * as THREE from './three.module.js';
import { GLTFLoader } from './post/GLTFLoader.js';
import { weaponModel, MUZZLE, VARIANTS, modelFromFile } from './weapon-models.js';
import { weaponById } from './weapons-data.js';
import { userAssets, userAssetURL } from './user-assets.js';

const U = 1 / .165;   // metres → game units
// Per pack: model scale (the rifle pack is in metres, the others bigger), eye (rig units: height, forward, pitch),
// the pack's own weapon meshes (hidden when another gun is held) and the weapon bone our guns attach to.
const PACKS = {
  rifle: { url: 'rifle', k: 1, eye: [1.6 - .06, .2, 0], gun: /^(SK_AK-47|SM-CARGADOR)/, bone: /^DEF-Weapon/ },
  pistol: { url: 'pistol', k: 2.9, eye: [4.72 - .29, .64, 0], gun: /^Pistol_/, bone: /^DEF-Weapon/ },
  shotgun: { url: 'shotgun', k: 2.38, eye: [3.86 - .14, .24, 0], gun: /^SKM_Saps/, bone: /^DEF-Weapon/ },
};
// Which pack holds which weapon; `own`: the pack's gun is that weapon (else ours is attached).
export const FP = { knife: { pack: 'pistol', onehand: true, fist: true, noLeft: true, view: [0, -.05, .1] }, karambit: { pack: 'pistol', onehand: true, fist: true, noLeft: true, view: [0, -.05, .1] }, he: { pack: 'pistol', onehand: true, palm: true, fistK: .55 }, flash: { pack: 'pistol', onehand: true, palm: true, fistK: .55 }, smoke: { pack: 'pistol', onehand: true, palm: true, fistK: .55 }, molotov: { pack: 'pistol', onehand: true, palm: true, fistK: .45 }, c4: { pack: 'pistol', onehand: true, view: [-.05, -.1, .12] }, ak: { pack: 'rifle', own: true }, m4: { pack: 'rifle' }, sniper: { pack: 'rifle' }, smg: { pack: 'rifle' }, lmg: { pack: 'rifle' }, pistol: { pack: 'pistol', own: true }, deagle: { pack: 'pistol' }, shotgun: { pack: 'shotgun', own: true }, xm1014: { pack: 'shotgun', own: true } };   /* both shotguns use the shotgun arms' own gun in first person: its reload animation is made for it */
// How each pack's arms sit in view for guns, CS2-like (the packs were posed for another camera: the rifle swung in
// toward the crosshair, the pistol tipped up): a turn [pitch, yaw, roll] about the eye and a shift (game units),
// arms and gun together, so the grip never changes. Per-weapon view / viewRot (FP) still win.
export const PACK_VIEW = { rifle: { view: [.35, .05, -.424], rot: [.044, .193, -.223] }, pistol: { view: [.314, -.08, -.409], rot: [.048, .123, -.373] }, shotgun: { view: [.35, -.08, -.424], rot: [.044, .193, -.223] } };   // (measured with aimView: barrel level toward the crosshair, the gun upright)
const GUN_KINDS = new Set(['pistol', 'smg', 'rifle', 'sniper', 'lmg', 'shotgun']);
// Our guns on the rifle / pistol weapon bone: offset (game units, in the weapon's own frame) and turn.
export const ATTACH = { p250: { at: [0, -.12, .18], scale: .62 }, fiveseven: { at: [0, -.12, .18], scale: .62 },   /* the low-poly pack's pistols: real pistol size in the hand */ knife: { at: [0, -.45, .1], rot: [1.2, 0, 0] }, karambit: { at: [0, -.4, .1], rot: [0, -1.57, 3.14], scale: 1.3 },   // karambit like CS2: ring on the index finger, blade curling up
   he: { at: [0, 0, 0], rot: [0, 0, 0] }, flash: { at: [0, 0, 0], rot: [0, 0, 0] }, smoke: { at: [0, 0, 0], rot: [0, 0, 0] }, molotov: { at: [0, 0, 0], rot: [0, 0, 0] }, c4: { at: [0, 0, 0], rot: [0, .6, 0] }   /* the bomb lies on the palm, turned to show its face, low right: never over the crosshair */, ak: { at: [0, 0, -1.5] }, m4: { at: [0, -.15, -.6], rot: [0, 0, 0], scale: .7 }, sniper: { at: [0, -.15, -.7], rot: [0, 0, 0], scale: .7 }, smg: { at: [0, -.12, -.5], rot: [0, 0, 0], scale: .72 }, greasegun: { at: [0, -.12, -.5], rot: [0, 0, 0], scale: .72 }, suomi: { at: [0, -.15, -.55], rot: [0, 0, 0], scale: .7 }, lmg: { at: [0, -.15, -.6], rot: [0, 0, 0], scale: .7 },   /* our guns are real size; the pack's AK is ~0.7 of that: same scale, grip in the hand */ deagle: { at: [0, 0, 0], rot: [0, 0, 0] } };   // ak: only for its muzzle (the pack's AK lines up with ours there)
// Every gun gets arms: its own entry, else by kind (rifles, SMGs, snipers, the M249 on the rifle arms; pistols on the
// pistol arms; shotguns on the shotgun arms); grips follow the base model of a variant.
const KIND_FP = { rifle: { pack: 'rifle' }, smg: { pack: 'rifle' }, sniper: { pack: 'rifle' }, lmg: { pack: 'rifle' }, pistol: { pack: 'pistol' }, shotgun: { pack: 'shotgun' } };
export const fpInfo = id => FP[id] || KIND_FP[weaponById(id)?.kind] || null;
const attachInfo = id => ATTACH[id] || (VARIANTS[id]?.base === 'ak' ? ATTACH.m4 : ATTACH[VARIANTS[id]?.base]) || ATTACH[{ luger: 'deagle', pistol: 'deagle' }[VARIANTS[id]?.base]] || {};

// The weapon bone's frame → a gun pointing along −z (set from the packs' own guns, see calibrate()).
// Knife twirl: the axis (in the hand's frame) and the pivot (the ring) the knife spins around while inspecting.
export const TWIRL = { axis: 'z', pivot: new THREE.Vector3(0, 0, 0) };
const twq = new THREE.Quaternion(), twq2 = new THREE.Quaternion(), twp = new THREE.Vector3(), twp2 = new THREE.Vector3(); let twirlA = 0; const handM = new THREE.Matrix4();
const BASE = { rifle: new THREE.Quaternion(), pistol: new THREE.Quaternion(), shotgun: new THREE.Quaternion() };
// Knives are gripped in a closed fist: each finger segment curls by these angles (after the animation).
// One-handed items: the left arm hangs relaxed (CS2 shows it open at the bottom left) — upper arm / forearm turns.
export const LEFT = { relaxed: true, upper: [-.5, 0, 1.2], fore: [0, .3, 0] };   // palm down, open, at the bottom left
export const FIST = { axis: 'x', sign: 1, angles: [1.0, 1.3, .9], thumb: [.3, .5, .4] };
export let PALM_OUT = .2;
// The grenade hand (root space ≈ view: x right, y up, z back; game units): the palm's centre, its facing, the knuckles'
// direction, the elbow's.
export const GRENADE_HOLD = { at: [.55, -.5, -1.2], palm: [-.2, 1, .25], knuckles: [-.35, .2, -1], elbow: [1, -1, .4] }; export const PALM_OUT_SET = v => { PALM_OUT = v; };   // a grenade's centre off the palm (game units: about its radius)
// Shorter arms (CS2's view models show little sleeve): each arm's segments × these lengths, the arm's root moved along
// toward the hand to match, so the hand keeps its place and grip on the gun (the gun hangs off the rig's root, not
// the hand) — only less arm reaches into the picture.
export const ARMS = { upper: .75, fore: .65 };
// Where the elbows point (CS2's view models: the support arm's elbow down, its forearm rising from the bottom edge,
// not the packs' elbow out sideways with the sleeve flat across the picture): per pack and arm, a direction in the
// view (x right, y up, z back). The hand stays exactly where the animation has it (two-bone IK on the arm).
export const ELBOWS = { rifle: { L: [-.25, -1, .35] }, shotgun: { L: [-.25, -1, .35] } };
// The support hand's grip on a two-handed gun, in the gun's frame (x right, y up, muzzle −z): where along it (share of
// the grip → muzzle length), the knuckles' direction, the palm's facing, and the fingers' curl round the handguard.
export let SUPPORT_AT = .44; export const SUPPORT_AT_SET = v => { SUPPORT_AT = v; };
// Where each gun's support hand goes, ahead of the grip (game units: 1 ≈ 16.5 cm): its handguard / forend, measured
// on the models (a share of the length put it on bare barrel or a suppressor on some: hand too high). Others: SUPPORT_AT.
export const SUPPORT_Z = { ak: -1.43, galil: -1.31, m4: -1.28, m4s: -1.28, famas: -.92, aug: -.85, sg553: -1.1, sniper: -1.75, ssg08: -1.5, mp9: -.57, mp7: -.76, mac10: -.6, ump45: -1, p90: -.6, bizon: -1, lmg: -1.5 };
export const SUPPORT_GRIP = { knuckles: [.55, .28, -.78], palm: [-.2, 1, 0], axis: 'x', sign: 1, fingers: [1, 1.2, .8], thumb: [.4, .5, .3] };
const SUPPORT_PACKS = new Set(['rifle', 'shotgun']);
// A pistol's grip base from its points (gun frame: muzzle −z, up +y): the lowest of its rear half, averaged with
// its neighbours (so one stray vertex doesn't decide).
function gripBase(pts) { if (pts.length < 10) return null; let z0 = Infinity, z1 = -Infinity; for (const q of pts) { z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); } const mid = (z0 + z1) / 2, rear = pts.filter(q => q.z > mid);
  if (!rear.length) return null; let lo = Infinity; for (const q of rear) lo = Math.min(lo, q.y); const near = rear.filter(q => q.y < lo + (z1 - z0) * .05), c = new THREE.Vector3(); for (const q of near) c.add(q); return c.multiplyScalar(1 / near.length); }
const loaded = new Map(), ready = new Map();   // pack name → promise · → built arms
function load(name) {
  if (!loaded.has(name)) loaded.set(name, new GLTFLoader().loadAsync(new URL('./models/fp/' + PACKS[name].url + '/scene.gltf', import.meta.url).href).then(g => { const b = build(name, g); ready.set(name, b); return b; }).catch(() => null));
  return loaded.get(name);
}
export const loadFP = () => Promise.all([...Object.keys(PACKS).map(load), loadKarambit()]);

// The karambit's own first-person model when one is imported on this computer (tools/import-cs2-models.mjs →
// user-assets/fp/karambit.glb, never shipped: CS:GO's view model — arms in sport gloves, the knife in the right hand,
// ring on the index finger). It replaces the pistol arms for the karambit. Posed, not animated: weapons.js swings and
// turns the whole view round the hand (handIn) and the inspect spins the knife on its ring (twirl). The file comes
// untextured: skin, dark sport gloves and a Fade blade (purple → pink → gold along it) are painted here.
// KARAMBIT: model units → game units, and the eye in model units (between and above the shoulders, looking along +z).
export const KARAMBIT = { scale: .0076, eye: [50, 505, -1030], forearm: .9 };   // forearm: their length (the model's reach far out)
let karambitRig = null, karambitLoading = null;
function loadKarambit() {
  return karambitLoading ??= userAssets().then(ua => { const v = ua.models.viewmodels?.karambit; if (!v) return null;
    return new GLTFLoader().loadAsync(userAssetURL(ua, v.file)).then(g => { karambitRig = buildKarambit(g.scene); return karambitRig; }); }).catch(e => { console.warn('karambit view model', e?.message); return null; });
}
function buildKarambit(sc) {
  const root = new THREE.Group(), fix = new THREE.Group(); root.add(fix); fix.add(sc); fix.rotation.y = Math.PI; fix.scale.setScalar(KARAMBIT.scale); sc.position.set(-KARAMBIT.eye[0], -KARAMBIT.eye[1], -KARAMBIT.eye[2]);
  const bones = {}; sc.traverse(o => { if (o.isBone) bones[o.name.replace(/^v_weapon/, '')] = o; });
  // The knife rides on the right hand (in the file it hangs off the rig's root, placed by animations we don't have);
  // then shorter forearms: the hands closer in along them, the knife with them.
  sc.updateMatrixWorld(true); if (bones.knife && bones.Bip01_R_Hand) bones.Bip01_R_Hand.attach(bones.knife);
  for (const s2 of ['L', 'R']) bones[`Bip01_${s2}_Hand`]?.position.multiplyScalar(KARAMBIT.forearm);
  const skin = new THREE.MeshStandardMaterial({ color: 0x9a6a4f, roughness: .55, metalness: 0 }), glove = new THREE.MeshStandardMaterial({ color: 0x2b313b, roughness: .78, metalness: 0 });
  const blade = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .22, metalness: .9, envMapIntensity: 1.1 });
  for (const m of [skin, glove, blade]) m.userData.shared = true;
  sc.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
    o.material = [].concat(o.material).map(m => /^knife:/.test(m.name) ? blade : /^skin:/.test(m.name) ? skin : glove); if (o.material.length === 1) o.material = o.material[0];
    if (/knife/i.test(o.name)) fade(o); });
  const hand = bones.Bip01_R_Hand, ring = bones.Bip01_R_Finger11 || bones.Bip01_R_Finger1 || hand, finger = bones.Bip01_R_Finger1 || hand, knife = bones.knife;
  const k0 = knife ? [knife.position.clone(), knife.quaternion.clone()] : null, piv = new THREE.Vector3(), ax = new THREE.Vector3(), tq = new THREE.Quaternion(), tm = new THREE.Matrix4(), out0 = new THREE.Vector3();
  let t = 0;
  return {
    root, karambit: true,
    hold() { root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); this.twirl(0); },
    // Spin the knife on its ring (round the index finger) by `a` radians.
    twirl(a) { if (!knife) return; knife.position.copy(k0[0]); knife.quaternion.copy(k0[1]); if (!a) return; sc.updateMatrixWorld(true);
      const inv = tm.copy(knife.parent.matrixWorld).invert(); ring.getWorldPosition(piv).applyMatrix4(inv); finger.getWorldPosition(ax); ring.getWorldPosition(out0); ax.sub(out0).transformDirection(inv).normalize();
      if (ax.lengthSq() < .5) ax.set(1, 0, 0); tq.setFromAxisAngle(ax, a); knife.position.sub(piv).applyQuaternion(tq).add(piv); knife.quaternion.premultiply(tq); },
    handIn(space, out) { space.updateMatrixWorld(true); return out.setFromMatrixPosition(tm.copy(space.matrixWorld).invert().multiply(hand.matrixWorld)); },
    fire() {}, reload() {},
    // A slow breathing sway.
    update(dt) { t += dt; root.position.set(Math.sin(t * 1.1) * .004, Math.sin(t * 2.2) * .006, 0); root.updateMatrixWorld(true); },
    get boneMuzzle() { return new THREE.Vector3(); },
    muzzle(out) { root.updateMatrixWorld(true); return out.setFromMatrixPosition(hand.matrixWorld); },
  };
}
// Fade: the blade coloured along its length (its bind-pose vertices' longest axis), purple at the ring to gold at the tip.
function fade(mesh) {
  const P = mesh.geometry.attributes.position, box = new THREE.Box3().setFromBufferAttribute(P), size = box.getSize(new THREE.Vector3()), axis = size.x > size.y ? (size.x > size.z ? 'x' : 'z') : (size.y > size.z ? 'y' : 'z');
  const lo = box.min[axis], len = size[axis] || 1, C = new Float32Array(P.count * 3), stops = [[0, [.32, .16, .62]], [.45, [.9, .32, .62]], [.75, [.98, .6, .7]], [1, [1, .82, .35]]], c = new THREE.Color();
  for (let i = 0; i < P.count; i++) { const v = ({ x: P.getX(i), y: P.getY(i), z: P.getZ(i) })[axis], f = (v - lo) / len; let a = stops[0], b = stops[stops.length - 1]; for (let k = 0; k + 1 < stops.length; k++) if (f >= stops[k][0] && f <= stops[k + 1][0]) { a = stops[k]; b = stops[k + 1]; break; }
    const w = (f - a[0]) / ((b[0] - a[0]) || 1); c.setRGB(a[1][0] + (b[1][0] - a[1][0]) * w, a[1][1] + (b[1][1] - a[1][1]) * w, a[1][2] + (b[1][2] - a[1][2]) * w, THREE.SRGBColorSpace); C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; }
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(C, 3));
}
function build(name, gltf) {
  const P = PACKS[name], sc = gltf.scene, root = new THREE.Group(), fix = new THREE.Group(), rig = new THREE.Group(); root.add(fix); fix.add(rig); rig.add(sc); fix.matrixAutoUpdate = false;
  // Rig units → game units, turned to look along −z, the eye at the camera.
  const s = U / P.k; rig.scale.setScalar(s); rig.rotation.set(P.eye[2], Math.PI, 0); sc.position.set(0, -P.eye[0], -P.eye[1]);
  // The arms live under SK_Comando (fabric: no metal shine, so they stay black under the arena's bright sky);
  // every other mesh is the gun.
  const gunMeshes = []; let bone = null;
  sc.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; for (const m of [].concat(o.material)) m.userData.shared = true; let arm = false; for (let q = o; q; q = q.parent) if (/^SK_Comando/.test(q.name)) arm = true; if (!arm) gunMeshes.push(o); else for (const m of [].concat(o.material)) { m.metalness = 0; m.metalnessMap = null; m.envMapIntensity = .2; m.color.multiplyScalar(.8); m.needsUpdate = true; } } if (o.isBone && !bone && P.bone.test(o.name)) bone = o; });
  const clip = re => gltf.animations.find(a => re.test(a.name.replace(/^RIG_UE5_Comando_/, '').replace(/^AK_+/, '')));
  const A = { equip: clip(/^Equip$/), idle: clip(/^Idle$/), walk: clip(/^Walk$/), run: clip(/^_?Run$/), fire: clip(/^Fire$/), reload: clip(/^Reload$/), toReload: clip(/^IdleToReload$/), fromReload: clip(/^ReloadToIdle$/) };
  const mixer = new THREE.AnimationMixer(sc), act = k => A[k] && mixer.clipAction(A[k]);
  // Calibrate from the pack's own gun at the idle pose: its root bone, which of that bone's axes point forward and up
  // in view (→ BASE, so our guns line up the same way) and where its muzzle is in that bone's frame.
  // The gun's main bone: the one most of its vertices are skinned to (the body, not the magazine or slide).
  const gunSkin = gunMeshes.filter(m => m.isSkinnedMesh).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0] || null;   // the body (most vertices), not a spare magazine
  if (gunSkin) { const si = gunSkin.geometry.attributes.skinIndex, sw = gunSkin.geometry.attributes.skinWeight, count = new Map();
    for (let i = 0; i < si.count; i++) { let bi = si.getX(i), bw = sw.getX(i); for (const k of [1, 2, 3]) { const w = [sw.getX, sw.getY, sw.getZ, sw.getW][k].call(sw, i); if (w > bw) { bw = w; bi = [si.getX, si.getY, si.getZ, si.getW][k].call(si, i); } } count.set(bi, (count.get(bi) || 0) + 1); }
    bone = gunSkin.skeleton.bones[[...count].sort((a, b) => b[1] - a[1])[0][0]]; }
  let packGrip = null; const muzzleLocal = new THREE.Vector3(); {
    mixer.clipAction(A.idle).play(); mixer.update(0); root.updateMatrixWorld(true);
    const q = new THREE.Quaternion(); new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(bone.matrixWorld).decompose(new THREE.Vector3(), q, new THREE.Vector3());
    const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a)), best = want => axes.reduce((b, a) => a.clone().applyQuaternion(q).dot(want) > b.clone().applyQuaternion(q).dot(want) ? a : b);
    const f = best(new THREE.Vector3(0, 0, -1)), u = best(new THREE.Vector3(0, 1, 0)), Z = f.clone().negate(), X = u.clone().cross(Z);
    BASE[name] = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, u, Z));
    // Muzzle: the gun's vertex farthest forward in view (skinned, at the idle pose), kept in the gun bone's frame.
    if (gunSkin) { const v = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())); let far = -Infinity;
      for (const m of [gunSkin]) { const n = m.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 4000));
        for (let i = 0; i < n; i += step) { m.getVertexPosition(i, v); m.localToWorld(v); const d = v.dot(fwd); if (d > far) { far = d; muzzleLocal.copy(v); } } }
      bone.worldToLocal(muzzleLocal); }
    // The pack's own gun's grip (its lowest point in its rear half: the grip's base, not a magazine ahead of the
    // trigger), in the gun's frame: other pistols are slid so their grip's base sits there, in the hand.
    if (gunSkin && name === 'pistol') { const v = new THREE.Vector3(), bp = new THREE.Vector3(), bq = new THREE.Quaternion(), bs = new THREE.Vector3(), pts = [];   // (in the frame `ours` gets: root space, at the bone, turned by BASE)
      new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(bone.matrixWorld).decompose(bp, bq, bs); const inv = bq.multiply(BASE[name]).invert(), rInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const n = gunSkin.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 4000));
      for (let i = 0; i < n; i += step) { gunSkin.getVertexPosition(i, v); gunSkin.localToWorld(v).applyMatrix4(rInv).sub(bp).applyQuaternion(inv); pts.push(v.clone()); }
      packGrip = gripBase(pts); }
    mixer.stopAllAction(); }
  // Our gun follows the weapon bone: its position and rotation in camera space, at real size.
  const bp = new THREE.Vector3(), bq = new THREE.Quaternion(), bs = new THREE.Vector3(), rootInv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  const follow = () => { if (!ours) return; root.updateMatrixWorld(true); rel.copy(rootInv.copy(root.matrixWorld).invert()).multiply(bone.matrixWorld); rel.decompose(bp, bq, bs); ours.position.copy(bp); ours.quaternion.copy(bq).multiply(BASE[name]); if (twirlA) { ours.quaternion.multiply(twq.setFromAxisAngle(AX[TWIRL.axis], twirlA)); ours.position.add(twp.copy(TWIRL.pivot).applyQuaternion(ours.quaternion).negate().add(twp2.copy(TWIRL.pivot).applyQuaternion(twq2.copy(bq).multiply(BASE[name])))); } };   /* a knife twirl (inspect) turns the knife around the ring finger, not the hand */
  const fingers = []; sc.traverse(o => { const m = o.isBone && /^DEF-(f_(index|middle|ring|pinky)|thumb)0([123])R_/.exec(o.name); if (m) fingers.push({ b: o, seg: +m[3] - 1, thumb: m[1] === 'thumb' }); }); let fist = false;
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, fq = new THREE.Quaternion();
  // One-handed items (knife, grenades, bomb): the left arm folds away out of view.
  const boneOf = re => { let b = null; sc.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  const head = (() => { let h = null; sc.traverse(o => { if (!h && /^CB-?Head/i.test(o.name)) h = o; }); return h; })(), headRest = new THREE.Matrix4(), fixM = new THREE.Matrix4(), hInv = new THREE.Matrix4(), rigInv = new THREE.Matrix4(), fp_ = new THREE.Vector3(), fq_ = new THREE.Quaternion(), fs_ = new THREE.Vector3();
  // The head bone in the space the correction works in (the rig's parent): rig.matrix × (rig → head).
  const headIn = () => { sc.updateMatrixWorld(true); return new THREE.Matrix4().copy(rig.matrix).multiply(rigInv.copy(rig.matrixWorld).invert().multiply(head.matrixWorld)); };
  if (head) { mixer.clipAction(A.idle).play(); mixer.update(0); root.updateMatrixWorld(true); headRest.copy(headIn()); mixer.stopAllAction(); }   // the head at rest (idle)
  // The arm chains (DEF-upper_arm → .001 → forearm → .001 → hand), their rest offsets, for ARMS (shortened every frame).
  const chains = ['L', 'R'].map(sd => { const up = boneOf(new RegExp('^DEF-upper_arm' + sd + '_')), up1 = boneOf(new RegExp('^DEF-upper_arm' + sd + '001')), fo = boneOf(new RegExp('^DEF-forearm' + sd + '_')), fo1 = boneOf(new RegExp('^DEF-forearm' + sd + '001')), hand = boneOf(new RegExp('^DEF-hand' + sd + '_'));   /* (three.js drops the dots from bone names) */
    return up && up1 && fo && fo1 && hand ? { up, segs: [[up1, 'upper'], [fo, 'upper'], [fo1, 'fore'], [hand, 'fore']].map(([b, k]) => ({ b, k, rest: b.position.clone() })), upRest: up.position.clone(), hand } : null; }).filter(Boolean);
  const aS = new THREE.Vector3(), aH = new THREE.Vector3();
  // Arm IK, worked out in the rig's own space (below the view model's stretch, which is not uniform): two bones — the
  // upper arm turned so the elbow sits on its circle round shoulder → wrist toward a pole, the forearm turned onto the
  // wrist — then the hand set to its rotation. Everything preallocated: no garbage per frame.
  const RI = new THREE.Matrix4(), RM = new THREE.Matrix4(), rP = new THREE.Vector3(), rQ = new THREE.Quaternion(), rS = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  const kS = new THREE.Vector3(), kE = new THREE.Vector3(), kH = new THREE.Vector3(), kW = new THREE.Vector3(), kA = new THREE.Vector3(), kN = new THREE.Vector3(), kP = new THREE.Vector3(), kV = new THREE.Vector3(), kU = new THREE.Vector3();
  const relPos = (b, out) => out.setFromMatrixPosition(RM.multiplyMatrices(RI, b.matrixWorld));
  const relQuat = (b, out) => { RM.multiplyMatrices(RI, b.matrixWorld).decompose(rP, out, rS); return out; };
  const setRel = (b, Q) => { relQuat(b.parent, qA); b.quaternion.copy(qA.invert().multiply(Q)); b.updateWorldMatrix(false, true); };
  const turnRel = (b, from, to) => { qB.setFromUnitVectors(kV.copy(from).normalize(), kU.copy(to).normalize()); relQuat(b, rQ); setRel(b, rQ.premultiply(qB)); };
  const handQ0 = new THREE.Quaternion();
  function armTo(c, W, pole, handQ) {   // W: the wrist's place, pole: elbow direction, handQ: the hand's rotation (null: as it is) — all in root space
    const fo = c.segs[1].b; root.updateMatrixWorld(true); RI.copy(root.matrixWorld).invert(); if (!handQ) relQuat(c.hand, handQ0);
    relPos(c.up, kS); relPos(fo, kE); relPos(c.hand, kH); const a = kS.distanceTo(kE), b = kE.distanceTo(kH); let d = kS.distanceTo(W); if (a < 1e-6 || b < 1e-6 || d < 1e-6) return;
    d = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, d)); kA.subVectors(W, kS).normalize(); kN.copy(pole).addScaledVector(kA, -pole.dot(kA)); if (kN.lengthSq() < 1e-10) return; kN.normalize();
    const x = (a * a - b * b + d * d) / (2 * d), r = Math.sqrt(Math.max(0, a * a - x * x)); kP.copy(kS).addScaledVector(kA, x).addScaledVector(kN, r);   // the new elbow
    turnRel(c.up, kV.subVectors(kE, kS), kU.subVectors(kP, kS));
    relPos(fo, kE); relPos(c.hand, kH); kW.copy(kS).addScaledVector(kA, d); turnRel(fo, kV.subVectors(kH, kE), kU.subVectors(kW, kE));
    setRel(c.hand, handQ || handQ0); }
  const sides = { L: chains.find(c => /L_/.test(c.up.name)), R: chains.find(c => /R_/.test(c.up.name)) }, poleV = new THREE.Vector3(), wristV = new THREE.Vector3();
  const poseElbows = () => { const E = ELBOWS[name]; if (!E || onehand || supportW > .01) return; for (const k of ['L', 'R']) if (E[k] && sides[k]) { const c = sides[k]; root.updateMatrixWorld(true); RI.copy(root.matrixWorld).invert(); relPos(c.hand, wristV); poleV.set(...E[k]).applyQuaternion(qB.copy(root.quaternion).invert()); armTo(c, wristV, poleV, null); } };
  // The support hand on the gun actually held (two-handed guns with our model on the weapon bone: CS2 models' handguards
  // are not where the pack's AK had its own): laid under the handguard — palm up, knuckles across to the right and a
  // little forward, fingers curled round — the arm reaching it with the elbow down; it lets go for reloads and the draw.
  const LH = sides.L?.hand, lfingers = []; let handFrame = null, supportAt = null, supportW = 0;
  sc.traverse(o => { const m = o.isBone && /^DEF-(f_(index|middle|ring|pinky)|thumb)0([123])L_/.exec(o.name); if (m) lfingers.push({ b: o, seg: +m[3] - 1, thumb: m[1] === 'thumb' }); });
  if (LH) { sc.updateMatrixWorld(true); const at = re => { const b = boneOf(re); return b ? LH.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : null; };
    const mid = at(/^DEF-f_middle01L_/), idx = at(/^DEF-f_index01L_/), pnk = at(/^DEF-f_pinky01L_/), th = at(/^DEF-thumb01L_/);
    if (mid && idx && pnk && th) { const dL = mid.clone().normalize(), across = idx.clone().sub(pnk), nL = new THREE.Vector3().crossVectors(dL, across).normalize(); if (nL.dot(th) < 0) nL.negate(); nL.addScaledVector(dL, -nL.dot(dL)).normalize();
      handFrame = { basisT: new THREE.Matrix4().makeBasis(dL, nL, new THREE.Vector3().crossVectors(dL, nL)).transpose(), palm: mid.clone().multiplyScalar(.55), thick: nL.clone().multiplyScalar(mid.length() * .22) };   /* (the palm surface, a little off the bone on its own side: under the handguard the bone sits below it) */ } }
  // The handguard of the held gun (its own shape), in `ours`' space: half way from the grip to the muzzle, just under it.
  function findSupport() { supportAt = null; if (!ours) return; ours.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(ours.matrixWorld).invert(), v = new THREE.Vector3(), pts = [];
    ours.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), step = Math.max(1, Math.floor(P.count / 6000)); for (let i = 0; i < P.count; i += step) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(M).clone()); });
    if (pts.length < 20) return; let zMin = Infinity; for (const q of pts) zMin = Math.min(zMin, q.z); if (zMin > -.5) return;
    let by = 0, bn = 0; for (const q of pts) if (q.z < zMin * .92) { by += q.y; bn++; } const bore = bn ? by / bn : 0, zh = Math.max(zMin * .9, SUPPORT_Z[oursId] ?? zMin * SUPPORT_AT);
    // The handguard's underside there: the lowest point a hand's width round it, below the bore (not the barrel itself)
    // and above anything hanging lower (a magazine): with none, a little under the bore.
    let bottom = Infinity; for (const q of pts) if (Math.abs(q.z - zh) < .2 && Math.abs(q.x) < .45 && q.y > bore - .6 && q.y < bore - .1) bottom = Math.min(bottom, q.y);
    supportAt = new THREE.Vector3(0, Number.isFinite(bottom) ? bottom : bore - .3, zh); }
  const sT = new THREE.Vector3(), sD = new THREE.Vector3(), sN = new THREE.Vector3(), sM = new THREE.Vector3(), sB = new THREE.Matrix4(), sQ = new THREE.Quaternion(), sOff = new THREE.Vector3(), sTmp = new THREE.Quaternion(), fq2 = new THREE.Quaternion();
  const keep = { up: new THREE.Quaternion(), fo: new THREE.Quaternion(), hand: new THREE.Quaternion() };
  function supportHand(dt, wanted) {
    supportW += ((wanted ? 1 : 0) - supportW) * Math.min(1, dt * 9); const c = sides.L; if (supportW < .01 || !c || !handFrame || !supportAt || !ours) return;
    const fo = c.segs[1].b; keep.up.copy(c.up.quaternion); keep.fo.copy(fo.quaternion); keep.hand.copy(c.hand.quaternion);
    // The target in root space: ours' place × the handguard point; the hand's frame from the gun's axes.
    sT.copy(supportAt).applyQuaternion(ours.quaternion).add(ours.position);
    sD.set(...SUPPORT_GRIP.knuckles).normalize().applyQuaternion(ours.quaternion); sN.set(...SUPPORT_GRIP.palm).applyQuaternion(ours.quaternion); sN.addScaledVector(sD, -sN.dot(sD)).normalize(); sM.crossVectors(sD, sN);
    sB.makeBasis(sD, sN, sM).multiply(handFrame.basisT); sQ.setFromRotationMatrix(sB);   // (world frame × the hand's own frame, inverted)
    // The wrist: the palm's centre on the handguard (from the hand's own proportions, at its scale in root space).
    root.updateMatrixWorld(true); RI.copy(root.matrixWorld).invert(); RM.multiplyMatrices(RI, c.hand.matrixWorld).decompose(rP, rQ, rS);
    sOff.copy(handFrame.palm).add(handFrame.thick).multiply(rS).applyQuaternion(sQ); wristV.copy(sT).sub(sOff);
    poleV.set(...(ELBOWS[name]?.L || [0, -1, .4])).applyQuaternion(qB.copy(root.quaternion).invert());
    armTo(c, wristV, poleV, sQ);
    for (const f of lfingers) f.b.quaternion.multiply(fq2.setFromAxisAngle(AX[SUPPORT_GRIP.axis], SUPPORT_GRIP.sign * (f.thumb ? SUPPORT_GRIP.thumb : SUPPORT_GRIP.fingers)[f.seg] * supportW));
    if (supportW < .99) { sTmp.copy(c.up.quaternion); c.up.quaternion.slerpQuaternions(keep.up, sTmp, supportW); sTmp.copy(fo.quaternion); fo.quaternion.slerpQuaternions(keep.fo, sTmp, supportW); sTmp.copy(c.hand.quaternion); c.hand.quaternion.slerpQuaternions(keep.hand, sTmp, supportW); }
    sc.updateMatrixWorld(true); }
  // Grenades in the right palm (the weapon bone is where the pack's pistol would be: a grenade there floated above the
  // fist): its centre on the palm, a grenade's half width off it, the fingers closed round it (FP fistK).
  const RH = sides.R?.hand; let rPalm = null;
  if (RH) { sc.updateMatrixWorld(true); const at = re => { const b = boneOf(re); return b ? RH.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : null; };
    const mid = at(/^DEF-f_middle01R_/), idx = at(/^DEF-f_index01R_/), pnk = at(/^DEF-f_pinky01R_/), th = at(/^DEF-thumb01R_/);
    if (mid && idx && pnk && th) { const d = mid.clone().normalize(), n = new THREE.Vector3().crossVectors(d, idx.clone().sub(pnk)).normalize(); if (n.dot(th) < 0) n.negate(); n.addScaledVector(d, -n.dot(d)).normalize();
      rPalm = { at: mid.clone().multiplyScalar(.5), n, basisT: new THREE.Matrix4().makeBasis(d, n, new THREE.Vector3().crossVectors(d, n)).transpose() }; } }
  const pP = new THREE.Vector3(), pQ = new THREE.Quaternion(), pS = new THREE.Vector3(), pV = new THREE.Vector3(), pM = new THREE.Matrix4(), pI = new THREE.Matrix4();
  // A grenade on the open right hand: the hand itself posed (two-bone IK on the arm) palm up at the lower right —
  // knuckles forward and in — the grenade resting on the palm, the fingers round it (the pack's pistol grip had the
  // palm facing in: a grenade floated beside the fist or vanished in it).
  const gD = new THREE.Vector3(), gN = new THREE.Vector3(), gM = new THREE.Vector3(), gB = new THREE.Matrix4(), gQ = new THREE.Quaternion(), gT = new THREE.Vector3(), gW = new THREE.Vector3(), gPole = new THREE.Vector3();
  function inPalm() { const c = sides.R; if (!ours || !rPalm || !c) return;
    gD.set(...GRENADE_HOLD.knuckles).normalize(); gN.set(...GRENADE_HOLD.palm); gN.addScaledVector(gD, -gN.dot(gD)).normalize(); gM.crossVectors(gD, gN); gB.makeBasis(gD, gN, gM).multiply(rPalm.basisT); gQ.setFromRotationMatrix(gB);
    root.updateMatrixWorld(true); RI.copy(root.matrixWorld).invert(); RM.multiplyMatrices(RI, c.hand.matrixWorld).decompose(rP, rQ, rS);
    gT.set(...GRENADE_HOLD.at); gW.copy(rPalm.at).multiply(rS).applyQuaternion(gQ); gW.subVectors(gT, gW);   // the wrist: the palm's centre on the target
    armTo(c, gW, gPole.set(...GRENADE_HOLD.elbow), gQ);
    for (const f of fingers) f.b.quaternion.multiply(fq.setFromAxisAngle(AX[FIST.axis], FIST.sign * (f.thumb ? FIST.thumb : FIST.angles)[f.seg] * fistK)); sc.updateMatrixWorld(true);
    ours.position.copy(gT).addScaledVector(gN, PALM_OUT); }
  const restArms = () => { for (const c of chains) { c.up.position.copy(c.upRest); for (const g of c.segs) g.b.position.copy(g.rest); } };
  const shortenArms = () => { if (ARMS.upper === 1 && ARMS.fore === 1) return; for (const c of chains) { c.hand.updateWorldMatrix(true, false); aS.setFromMatrixPosition(c.up.matrixWorld); aH.setFromMatrixPosition(c.hand.matrixWorld);
      const full = aS.distanceTo(aH); let L0 = 0, L1 = 0; for (const g of c.segs) { const l = g.rest.length(); L0 += l; L1 += l * ARMS[g.k]; g.b.position.copy(g.rest).multiplyScalar(ARMS[g.k]); }
      if (!full || !L0) continue; aS.sub(aH).multiplyScalar(L1 / L0).add(aH); c.up.position.copy(c.up.parent.worldToLocal(aS)); } };
  const leftArm = boneOf(/^DEF-upper_armL/), leftFore = boneOf(/^DEF-forearmL_/), eu = new THREE.Euler(); let onehand = false, noLeft = false, bobT = 0, bobA = 0;
  let ours = null, oursId = null, cur = null, base = 'idle', oneShotUntil = 0, reloadPlan = null, palmItem = false, fistK = 1;
  // Reloads: the packs' reload clips lift and tilt the gun toward the face; at our field of view that left the screen.
  // While reloading the arms ease back (and a little down and left) so the whole reload stays in view (like CS2's
  // viewmodel during a reload), and ease back in at the end.
  const viewBase = new THREE.Vector3(), RELOAD_OFF = { rifle: [-.25, -.08, -.75], pistol: [-.15, -.1, -.9], shotgun: [-.15, -.06, -.55] }, roff = new THREE.Vector3(...(RELOAD_OFF[name] || [0, 0, 0]));
  // The animated head (the animator's camera): the view follows it, so a reload is framed as it was authored (the gun
  // tilts up for the magazine and stays on screen) instead of swinging out of view from a fixed eye.
  const fixHead = () => { if (!head) return; const h = headIn(); fixM.copy(headRest).multiply(hInv.copy(h).invert()); fixM.decompose(fp_, fq_, fs_); fix.matrix.compose(fp_, fq_, fs_.set(1, 1, 1)); fix.matrixWorldNeedsUpdate = true; };
  const to = (k, fade = .15, { once = false, ms = 0 } = {}) => { const a = act(k); if (!a) return; if (cur === a && !once) return; a.reset(); a.enabled = true; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.timeScale = ms ? A[k].duration * 1000 / ms : 1; if (cur && cur !== a) a.crossFadeFrom(cur, fade, false); a.play(); cur = a; };
  return {
    root,
    // Hold this weapon id (draw: play the draw animation over `drawMs`).
    hold(id, { draw = true, drawMs = 800, model = id } = {}) {
      const F = fpInfo(id) || {}, PV = GUN_KINDS.has(weaponById(id)?.kind) ? PACK_VIEW[F.pack] : null; onehand = !!F.onehand; fist = !!F.fist; palmItem = !!F.palm; fistK = F.fistK ?? 1; noLeft = !!F.noLeft; root.position.set(...(F.view || PV?.view || [0, 0, 0])); viewBase.copy(root.position); root.rotation.set(...(F.viewRot || PV?.rot || [0, 0, 0]));   /* per weapon: how close / where the arms sit */ if (leftArm) leftArm.scale.setScalar(1);
      // A CS2 model imported for this gun (weapon-models.js) replaces the pack's own: held like the other rifles / pistols.
      const own = F.own && !modelFromFile(id); if (ours) { ours.removeFromParent(); ours = null; } oursId = own ? null : id;
      for (const m of gunMeshes) m.visible = !!own;
      if (!own) { const a = F.own ? (ATTACH[F.pack === 'rifle' ? 'm4' : 'deagle'] || {}) : attachInfo(id), g = weaponModel(model, a.scale || 1); ours = new THREE.Group(); ours.add(g); root.add(ours); g.position.set(...(a.at || [0, 0, 0])); g.rotation.set(...(a.rot || [0, 0, 0])); follow(); }
      if (ours && packGrip && F.pack === 'pistol' && GUN_KINDS.has(weaponById(id)?.kind) && (modelFromFile(model) || VARIANTS[model])) {   /* (CS2 models and the real-model variants: the low-poly pack keeps its own fit) */ const g = ours.children[0]; ours.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(ours.matrixWorld).invert(), v = new THREE.Vector3(), pts = [];
        g.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), step = Math.max(1, Math.floor(P.count / 4000)); for (let i = 0; i < P.count; i += step) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(M).clone()); });
        const mine = gripBase(pts); if (mine) { g.position.add(packGrip.clone().sub(mine)); follow(); } }   // its grip in the hand, where the pack's own pistol's is
      findSupport(); supportW = 0;
      reloadPlan = null; base = 'idle';
      if (draw && A.equip) { to('equip', 0, { once: true, ms: drawMs }); oneShotUntil = performance.now() + drawMs; } else to('idle', 0);
    },
    twirl(a) { twirlA = a; },
    // The right hand's position in `space`'s local frame (the pivot for swings and inspect).
    handIn(space, out) { space.updateMatrixWorld(true); return out.setFromMatrixPosition(handM.copy(space.matrixWorld).invert().multiply(bone.matrixWorld)); },
    fire() { if (!A.fire || reloadPlan) return; to('fire', .04, { once: true }); oneShotUntil = performance.now() + Math.min(A.fire.duration * 1000, 450); },
    // Reload over `ms` (the shotgun: into reload, shells, out of reload).
    reload(ms) { const now = performance.now(); if (A.toReload && A.fromReload) { const i = ms * .25, o = ms * .2; reloadPlan = [[now, 'toReload', i], [now + i, 'reload', ms - i - o], [now + ms - o, 'fromReload', o]]; } else reloadPlan = [[now, 'reload', ms]]; reloadPlan.end = now + ms; },
    // speed: the player's horizontal speed (game units / s) for idle / walk / run.
    update(dt, speed = 0) {
      const now = performance.now();
      if (reloadPlan) { if (now >= reloadPlan.end) reloadPlan = null; else { const step = [...reloadPlan].reverse().find(s => now >= s[0]); if (step && cur !== act(step[1])) to(step[1], .1, { once: step[1] !== 'reload' || !A.toReload, ms: step[2] }); } }
      if (!reloadPlan && now >= oneShotUntil) { const want = 'idle';   /* CS2: no run / lowered-gun clip while moving, only a small bob (below) */ if (want !== base || (cur && cur.loop === THREE.LoopOnce)) { base = want; to(A[want] ? want : 'idle', .2); } }
      restArms(); mixer.update(dt); fixHead(); shortenArms(); follow(); supportHand(dt, SUPPORT_PACKS.has(name) && !onehand && !reloadPlan && now >= oneShotUntil); poseElbows(); { let e = 0; if (reloadPlan) { const t = (now - reloadPlan[0][0]) / (reloadPlan.end - reloadPlan[0][0]), ss = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); e = ss(t / .14) * (1 - ss((t - .86) / .14)); } root.position.copy(viewBase).addScaledVector(roff, e); bobT += dt * Math.min(1, speed / 15) * 9; bobA += (Math.min(1, speed / 15) - bobA) * Math.min(1, dt * 8); root.position.x += Math.sin(bobT) * .012 * bobA; root.position.y += -Math.abs(Math.cos(bobT)) * .01 * bobA; } if (onehand && leftArm) { if (LEFT.relaxed && !noLeft) { leftArm.quaternion.multiply(fq.setFromEuler(eu.set(...LEFT.upper))); if (leftFore) leftFore.quaternion.multiply(fq.setFromEuler(eu.set(...LEFT.fore))); } else leftArm.scale.setScalar(.001); leftArm.updateMatrixWorld(true); }
      if (fist) { for (const f of fingers) f.b.quaternion.multiply(fq.setFromAxisAngle(AX[FIST.axis], FIST.sign * (f.thumb ? FIST.thumb : FIST.angles)[f.seg] * fistK)); sc.updateMatrixWorld(true); } follow(); if (palmItem) inPalm();
    },
    // Calibration info: the pack gun's muzzle in the bone frame (its forward axis).
    // Calibration (tools / tests): the turn and shift of `root` that make the held gun's barrel point along `forward`
    // and its top along `up` (view space: x right, y up, z back), its grip staying where it is on screen. Returns
    // { rot: [x, y, z] (Euler XYZ), view: [x, y, z] } for PACK_VIEW.
    aimView({ forward = [-.1, 0, -1], up = [0, 1, 0] } = {}) {
      root.updateMatrixWorld(true); RI.copy(root.matrixWorld).invert(); const gq = relQuat(bone, new THREE.Quaternion()).multiply(BASE[name]), gp = relPos(bone, new THREE.Vector3());
      const Rold = root.quaternion.clone(), tOld = root.position.clone(), gv = gq.clone().premultiply(Rold);
      const f0 = new THREE.Vector3(0, 0, -1).applyQuaternion(gv), u0 = new THREE.Vector3(0, 1, 0).applyQuaternion(gv), frame = (f, u) => { const F = new THREE.Vector3(...[].concat(f)).normalize(), U = new THREE.Vector3(...[].concat(u)); U.addScaledVector(F, -U.dot(F)).normalize(); const R = new THREE.Vector3().crossVectors(U, F.clone().negate()); return new THREE.Matrix4().makeBasis(R, U, F.clone().negate()); };
      const M0 = frame(f0.toArray(), u0.toArray()), M1 = frame(forward, up), Q = new THREE.Quaternion().setFromRotationMatrix(M1.multiply(M0.transpose()));
      const pView = gp.clone().applyQuaternion(Rold).add(tOld), Rnew = Q.clone().multiply(Rold), tNew = pView.clone().sub(gp.clone().applyQuaternion(Rnew)), e = new THREE.Euler().setFromQuaternion(Rnew, 'XYZ');
      return { rot: [e.x, e.y, e.z].map(v => +v.toFixed(3)), view: tNew.toArray().map(v => +v.toFixed(3)), barrel: f0.toArray().map(v => +v.toFixed(2)), top: u0.toArray().map(v => +v.toFixed(2)) }; },
    get support() { return { at: supportAt && supportAt.toArray().map(v => +v.toFixed(2)), w: +supportW.toFixed(2) }; },
    debugSupport() { const c = sides.L; if (!c || !ours || !handFrame) return null; root.updateMatrixWorld(true); RI.copy(root.matrixWorld).invert(); const q = relQuat(c.hand, new THREE.Quaternion()), w = relPos(c.hand, new THREE.Vector3());
      const toGun = v => v.clone().applyQuaternion(q).applyQuaternion(ours.quaternion.clone().invert()), bT = handFrame.basisT.clone().transpose(), dL = new THREE.Vector3().setFromMatrixColumn(bT, 0), nL = new THREE.Vector3().setFromMatrixColumn(bT, 1);
      const target = supportAt.clone().applyQuaternion(ours.quaternion).add(ours.position), palm = handFrame.palm.clone().add(handFrame.thick).multiply(rS).applyQuaternion(q).add(w);
      return { d: toGun(dL).toArray().map(v => +v.toFixed(2)), n: toGun(nL).toArray().map(v => +v.toFixed(2)), miss: +palm.distanceTo(target).toFixed(3), at: supportAt.toArray().map(v => +v.toFixed(2)), w: supportW }; },
    get boneMuzzle() { return muzzleLocal.clone(); },
    // Where shots leave the barrel (world space).
    muzzle(out) { root.updateMatrixWorld(true);
      if (!ours && name === 'rifle') { rel.copy(rootInv.copy(root.matrixWorld).invert()).multiply(bone.matrixWorld); rel.decompose(bp, bq, bs); out.set(...(MUZZLE.ak || [0, 0, -3.5])).add(new THREE.Vector3(...ATTACH.ak.at)).applyQuaternion(bq.clone().multiply(BASE.rifle)).add(bp); return root.localToWorld(out); }
      if (ours) { const g = ours.children[0]; g.updateMatrixWorld(true); return g.localToWorld(out.set(...(MUZZLE[oursId] || [0, 0, -3]))); } return out.copy(muzzleLocal).applyMatrix4(bone.matrixWorld); },
  };
}
// The arms for a weapon id, if its pack has loaded (else null: the caller shows the plain gun meanwhile).
export function fpFor(id) { if (id === 'karambit' && karambitRig) return karambitRig; const f = fpInfo(id); return f ? ready.get(f.pack) || null : null; }
