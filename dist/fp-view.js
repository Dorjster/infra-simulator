// First-person arms on the guns (Global Defensive): "FPS Character Animation Pack" AK-47, Pistol and SAPS-12 by
// Cristian David Duque Camacho (DuqueCD7, CC BY 4.0, dist/models/fp). Each pack is a pair of gloved arms animated on
// its gun: draw, idle, walk, run, fire, reload. The AK, the pistol and the shotgun are the packs' own guns; the other
// rifles, SMG and machine gun use the rifle arms with our model on the pack's weapon bone (the Desert Eagle the
// pistol arms). The rig looks along +z from just in front of its shoulders.
import * as THREE from './three.module.js';
import { GLTFLoader } from './post/GLTFLoader.js';
import { weaponModel, MUZZLE, VARIANTS } from './weapon-models.js';
import { weaponById } from './weapons-data.js';

const U = 1 / .165;   // metres → game units
// Per pack: model scale (the rifle pack is in metres, the others bigger), eye (rig units: height, forward, pitch),
// the pack's own weapon meshes (hidden when another gun is held) and the weapon bone our guns attach to.
const PACKS = {
  rifle: { url: 'rifle', k: 1, eye: [1.6 - .06, .2, 0], gun: /^(SK_AK-47|SM-CARGADOR)/, bone: /^DEF-Weapon/ },
  pistol: { url: 'pistol', k: 2.9, eye: [4.72 - .29, .64, 0], gun: /^Pistol_/, bone: /^DEF-Weapon/ },
  shotgun: { url: 'shotgun', k: 2.38, eye: [3.86 - .14, .24, 0], gun: /^SKM_Saps/, bone: /^DEF-Weapon/ },
};
// Which pack holds which weapon; `own`: the pack's gun is that weapon (else ours is attached).
export const FP = { knife: { pack: 'pistol', onehand: true, fist: true, view: [0, -.05, .1] }, karambit: { pack: 'pistol', onehand: true, fist: true, view: [0, -.05, .1] }, he: { pack: 'pistol', onehand: true }, flash: { pack: 'pistol', onehand: true }, smoke: { pack: 'pistol', onehand: true }, molotov: { pack: 'pistol', onehand: true }, c4: { pack: 'pistol', onehand: true }, ak: { pack: 'rifle', own: true }, m4: { pack: 'rifle' }, sniper: { pack: 'rifle' }, smg: { pack: 'rifle' }, lmg: { pack: 'rifle' }, pistol: { pack: 'pistol', own: true }, deagle: { pack: 'pistol' }, shotgun: { pack: 'shotgun', own: true }, xm1014: { pack: 'shotgun', own: true } };   /* both shotguns use the shotgun arms' own gun in first person: its reload animation is made for it */
// Our guns on the rifle / pistol weapon bone: offset (game units, in the weapon's own frame) and turn.
export const ATTACH = { knife: { at: [0, -.45, .1], rot: [1.2, 0, 0] }, karambit: { at: [0, -.4, .1], rot: [0, -1.57, 3.14], scale: 1.3 },   // karambit like CS2: ring on the index finger, blade curling up
   he: { at: [0, 0, 0], rot: [0, 0, 0] }, flash: { at: [0, 0, 0], rot: [0, 0, 0] }, smoke: { at: [0, 0, 0], rot: [0, 0, 0] }, molotov: { at: [0, 0, 0], rot: [0, 0, 0] }, c4: { at: [0, 0, 0], rot: [0, 0, 0] }, ak: { at: [0, 0, -1.5] }, m4: { at: [0, -.15, -.6], rot: [0, 0, 0], scale: .7 }, sniper: { at: [0, -.15, -.7], rot: [0, 0, 0], scale: .7 }, smg: { at: [0, -.12, -.5], rot: [0, 0, 0], scale: .72 }, greasegun: { at: [0, -.12, -.5], rot: [0, 0, 0], scale: .72 }, suomi: { at: [0, -.15, -.55], rot: [0, 0, 0], scale: .7 }, lmg: { at: [0, -.15, -.6], rot: [0, 0, 0], scale: .7 },   /* our guns are real size; the pack's AK is ~0.7 of that: same scale, grip in the hand */ deagle: { at: [0, 0, 0], rot: [0, 0, 0] } };   // ak: only for its muzzle (the pack's AK lines up with ours there)
// Every gun gets arms: its own entry, else by kind (rifles, SMGs, snipers, the M249 on the rifle arms; pistols on the
// pistol arms; shotguns on the shotgun arms); grips follow the base model of a variant.
const KIND_FP = { rifle: { pack: 'rifle' }, smg: { pack: 'rifle' }, sniper: { pack: 'rifle' }, lmg: { pack: 'rifle' }, pistol: { pack: 'pistol' }, shotgun: { pack: 'shotgun' } };
export const fpInfo = id => FP[id] || KIND_FP[weaponById(id)?.kind] || null;
const attachInfo = id => ATTACH[id] || (VARIANTS[id]?.base === 'ak' ? ATTACH.m4 : ATTACH[VARIANTS[id]?.base]) || ATTACH[{ luger: 'deagle', pistol: 'deagle' }[VARIANTS[id]?.base]] || {};

// The weapon bone's frame → a gun pointing along −z (set from the packs' own guns, see calibrate()).
const BASE = { rifle: new THREE.Quaternion(), pistol: new THREE.Quaternion(), shotgun: new THREE.Quaternion() };
// Knives are gripped in a closed fist: each finger segment curls by these angles (after the animation).
// One-handed items: the left arm hangs relaxed (CS2 shows it open at the bottom left) — upper arm / forearm turns.
export const LEFT = { relaxed: true, upper: [-.5, 0, 1.2], fore: [0, .3, 0] };   // palm down, open, at the bottom left
export const FIST = { axis: 'x', sign: 1, angles: [1.0, 1.3, .9], thumb: [.3, .5, .4] };
const loaded = new Map(), ready = new Map();   // pack name → promise · → built arms
function load(name) {
  if (!loaded.has(name)) loaded.set(name, new GLTFLoader().loadAsync(new URL('./models/fp/' + PACKS[name].url + '/scene.gltf', import.meta.url).href).then(g => { const b = build(name, g); ready.set(name, b); return b; }).catch(() => null));
  return loaded.get(name);
}
export const loadFP = () => Promise.all(Object.keys(PACKS).map(load));
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
  const muzzleLocal = new THREE.Vector3(); {
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
    mixer.stopAllAction(); }
  // Our gun follows the weapon bone: its position and rotation in camera space, at real size.
  const bp = new THREE.Vector3(), bq = new THREE.Quaternion(), bs = new THREE.Vector3(), rootInv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  const follow = () => { if (!ours) return; root.updateMatrixWorld(true); rel.copy(rootInv.copy(root.matrixWorld).invert()).multiply(bone.matrixWorld); rel.decompose(bp, bq, bs); ours.position.copy(bp); ours.quaternion.copy(bq).multiply(BASE[name]); };
  const fingers = []; sc.traverse(o => { const m = o.isBone && /^DEF-(f_(index|middle|ring|pinky)|thumb)0([123])R_/.exec(o.name); if (m) fingers.push({ b: o, seg: +m[3] - 1, thumb: m[1] === 'thumb' }); }); let fist = false;
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, fq = new THREE.Quaternion();
  // One-handed items (knife, grenades, bomb): the left arm folds away out of view.
  const boneOf = re => { let b = null; sc.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  const head = (() => { let h = null; sc.traverse(o => { if (!h && /^CB-?Head/i.test(o.name)) h = o; }); return h; })(), headRest = new THREE.Matrix4(), fixM = new THREE.Matrix4(), hInv = new THREE.Matrix4(), rigInv = new THREE.Matrix4(), fp_ = new THREE.Vector3(), fq_ = new THREE.Quaternion(), fs_ = new THREE.Vector3();
  // The head bone in the space the correction works in (the rig's parent): rig.matrix × (rig → head).
  const headIn = () => { sc.updateMatrixWorld(true); return new THREE.Matrix4().copy(rig.matrix).multiply(rigInv.copy(rig.matrixWorld).invert().multiply(head.matrixWorld)); };
  if (head) { mixer.clipAction(A.idle).play(); mixer.update(0); root.updateMatrixWorld(true); headRest.copy(headIn()); mixer.stopAllAction(); }   // the head at rest (idle)
  const leftArm = boneOf(/^DEF-upper_armL/), leftFore = boneOf(/^DEF-forearmL_/), eu = new THREE.Euler(); let onehand = false;
  let ours = null, oursId = null, cur = null, base = 'idle', oneShotUntil = 0, reloadPlan = null;
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
    hold(id, { draw = true, drawMs = 800 } = {}) {
      const F = fpInfo(id) || {}; onehand = !!F.onehand; fist = !!F.fist; root.position.set(...(F.view || [0, 0, 0])); viewBase.copy(root.position); root.rotation.set(...(F.viewRot || [0, 0, 0]));   // per weapon: how close / where the arms sit if (leftArm && !onehand) leftArm.scale.setScalar(1);
      if (ours) { ours.removeFromParent(); ours = null; } oursId = F.own ? null : id;
      const own = F.own; for (const m of gunMeshes) m.visible = !!own;
      if (!own) { const a = attachInfo(id), g = weaponModel(id, a.scale || 1); ours = new THREE.Group(); ours.add(g); root.add(ours); g.position.set(...(a.at || [0, 0, 0])); g.rotation.set(...(a.rot || [0, 0, 0])); follow(); }
      reloadPlan = null; base = 'idle';
      if (draw && A.equip) { to('equip', 0, { once: true, ms: drawMs }); oneShotUntil = performance.now() + drawMs; } else to('idle', 0);
    },
    fire() { if (!A.fire || reloadPlan) return; to('fire', .04, { once: true }); oneShotUntil = performance.now() + Math.min(A.fire.duration * 1000, 450); },
    // Reload over `ms` (the shotgun: into reload, shells, out of reload).
    reload(ms) { const now = performance.now(); if (A.toReload && A.fromReload) { const i = ms * .25, o = ms * .2; reloadPlan = [[now, 'toReload', i], [now + i, 'reload', ms - i - o], [now + ms - o, 'fromReload', o]]; } else reloadPlan = [[now, 'reload', ms]]; reloadPlan.end = now + ms; },
    // speed: the player's horizontal speed (game units / s) for idle / walk / run.
    update(dt, speed = 0) {
      const now = performance.now();
      if (reloadPlan) { if (now >= reloadPlan.end) reloadPlan = null; else { const step = [...reloadPlan].reverse().find(s => now >= s[0]); if (step && cur !== act(step[1])) to(step[1], .1, { once: step[1] !== 'reload' || !A.toReload, ms: step[2] }); } }
      if (!reloadPlan && now >= oneShotUntil) { const want = speed > 20 ? 'run' : speed > 3 ? 'walk' : 'idle'; if (want !== base || (cur && cur.loop === THREE.LoopOnce)) { base = want; to(A[want] ? want : 'idle', .2); } }
      mixer.update(dt); fixHead(); { let e = 0; if (reloadPlan) { const t = (now - reloadPlan[0][0]) / (reloadPlan.end - reloadPlan[0][0]), ss = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); e = ss(t / .14) * (1 - ss((t - .86) / .14)); } root.position.copy(viewBase).addScaledVector(roff, e); } if (onehand && leftArm) { if (LEFT.relaxed) { leftArm.quaternion.multiply(fq.setFromEuler(eu.set(...LEFT.upper))); if (leftFore) leftFore.quaternion.multiply(fq.setFromEuler(eu.set(...LEFT.fore))); } else leftArm.scale.setScalar(.001); leftArm.updateMatrixWorld(true); }
      if (fist) { for (const f of fingers) f.b.quaternion.multiply(fq.setFromAxisAngle(AX[FIST.axis], FIST.sign * (f.thumb ? FIST.thumb : FIST.angles)[f.seg])); sc.updateMatrixWorld(true); } follow();
    },
    // Calibration info: the pack gun's muzzle in the bone frame (its forward axis).
    get boneMuzzle() { return muzzleLocal.clone(); },
    // Where shots leave the barrel (world space).
    muzzle(out) { root.updateMatrixWorld(true);
      if (!ours && name === 'rifle') { rel.copy(rootInv.copy(root.matrixWorld).invert()).multiply(bone.matrixWorld); rel.decompose(bp, bq, bs); out.set(...(MUZZLE.ak || [0, 0, -3.5])).add(new THREE.Vector3(...ATTACH.ak.at)).applyQuaternion(bq.clone().multiply(BASE.rifle)).add(bp); return root.localToWorld(out); }
      if (ours) { const g = ours.children[0]; g.updateMatrixWorld(true); return g.localToWorld(out.set(...(MUZZLE[oursId] || [0, 0, -3]))); } return out.copy(muzzleLocal).applyMatrix4(bone.matrixWorld); },
  };
}
// The arms for a weapon id, if its pack has loaded (else null: the caller shows the plain gun meanwhile).
export function fpFor(id) { const f = fpInfo(id); return f ? ready.get(f.pack) || null : null; }
