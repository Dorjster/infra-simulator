// CS2's forearm twist on the first-person arms (user report: "when doing slash and mouse 1 and mouse2 with knife arms
// are looks broken"). CS2 drives arm_lower_<s>_TWIST / _TWIST1 by tilt-twist constraints from the hand (its arms model's
// BoneConstraintList: TWIST1 all of the hand's twist about x, TWIST half); the exported clips hold them at the bind
// pose, so a hand turned over in a knife's slash or stab wrung the wrist (CS2's arms and sleeves sit almost all on
// TWIST1): the wrist ring shrank to 57–61 % of its width (butterfly heavy, knife draw 43 %), guns' fire ~100 %.
// fp-view.js forearmTwist (every set update) — checked here: the rule reproduces the bind pose's own twist, the bones
// follow the hand through the clips, and the wrist keeps its width through every knife's light and heavy swing on
// both sides' CS2 arms. Skipped without the imported files (CI).
//   node tests/gd-fp-forearm-twist.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const UA = 'user-assets/', man = existsSync(UA + 'manifest.json') ? JSON.parse(readFileSync(UA + 'manifest.json', 'utf8')) : null, fpg = man?.models?.fpGloves;
const KNIVES = ['knife', 'knife-t', 'karambit', 'butterfly', 'm9', 'stiletto', 'bayonet', 'skeleton', 'talon', 'flip', 'nomad'].filter(id => existsSync(UA + 'fp/cs2_' + id + '.glb'));
if (!fpg || !existsSync(UA + fpg.file) || !KNIVES.length || !existsSync(UA + 'fp/cs2_ak.glb')) { console.log('SKIP: no CS2 first-person arms or knife sets on this computer'); process.exit(0); }
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }), getElementById: () => null };
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding|Couldn't load texture/.test(String(a[0]))) w(...a); }; }
const THREE = await import('../dist/three.module.js'), { gltfLoader } = await import('../dist/gltf-loader.js'), F = await import('../dist/fp-view.js');
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const parse = f => { const b = readFileSync(f); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
if (typeof F.forearmTwist !== 'function' || typeof F.forearmTwists !== 'function') { check('fp-view.js drives CS2\'s forearm twist bones (forearmTwist)', false, 'not there'); console.log('FAIL: forearm twist · 0 passed, 1 failed'); process.exit(1); }
const deg = q => { const n = Math.hypot(q.x, q.w) || 1; let x = q.x / n, w = q.w / n; if (w < 0) { x = -x; w = -w; } return 2 * Math.atan2(x, w) * 180 / Math.PI; };
const arms = F.armsFrom(await parse(UA + fpg.file));
// 1. The rule (CS2's constraint data) gives the bind pose's own twist on every set: the bones' bind rotation from the hand's.
{ const g = await parse(UA + 'fp/cs2_ak.glb'), tw = F.forearmTwists(g.scene); let sm = null; g.scene.traverse(o => { if (!sm && o.isSkinnedMesh && o.skeleton.getBoneByName('hand_L')) sm = o; });
  const sk = sm.skeleton, bindLocal = b => sk.boneInverses[sk.bones.indexOf(b.parent)].clone().multiply(sk.boneInverses[sk.bones.indexOf(b)].clone().invert()), q = new THREE.Quaternion(), t = new THREE.Vector3(), s = new THREE.Vector3(), rows = [];
  for (let i = 0; i < tw.length; i += 3) { bindLocal(tw[i]).decompose(t, tw[i].quaternion, s); F.forearmTwist([tw[i], tw[i + 1], tw[i + 2]]);
    for (const k of [1, 2]) { bindLocal(tw[i + k]).decompose(t, q, s); rows.push([tw[i + k].name, deg(tw[i + k].quaternion), deg(q), tw[i + k].quaternion.angleTo(q) * 180 / Math.PI]); } }
  check('both forearms found on a CS2 set (hand, TWIST, TWIST1 under arm_lower; none on a pack)', tw.length === 6 && F.forearmTwists(new THREE.Group()).length === 0, tw.map(b => b.name).join(' '));
  // (TWIST1 exact on both sides and the right TWIST too; CS2's own bind pose has the left TWIST at TWIST1's 1.40°, not the
  // constraint's half — an authoring quirk of 0.7°: the constraint data is followed, as CS2 does in play)
  check('CS2\'s constraint rule reproduces the bind pose\'s own twist bones (TWIST1 = the hand\'s twist within 0.05°, TWIST = half within 0.75°)', rows.length === 4 && rows.every(r => r[3] < (/TWIST1$/.test(r[0]) ? .05 : .75)), rows.map(r => `${r[0]} ${r[1].toFixed(2)}° vs bind ${r[2].toFixed(2)}°`).join(' · ')); }
// 2. Through the game's own path (hold → swing → update), on each side's CS2 arms: the twist bones follow the hand and the
// wrist keeps its width. Wrist ring: the arm vertices blending hand_<s> and arm_lower_<s>_TWIST1 (both > .25), their
// mean distance from the forearm axis vs the bind pose (before: knife light 57 %, heavy 60 %; guns' fire ~100 %).
const v = new THREE.Vector3(), e = new THREE.Vector3(), w = new THREE.Vector3(), ax = new THREE.Vector3();
function wristGauge(set) { const W = set.worn, sk = W.sk, bi = n => sk.bones.findIndex(b => b.name === n), ring = { R: [], L: [] };
  for (const s of ['R', 'L']) { const H = bi('hand_' + s), T1 = bi('arm_lower_' + s + '_TWIST1');
    for (const m of [...W.ct.children, ...W.t.children]) { const sI = m.geometry.attributes.skinIndex, sW = m.geometry.attributes.skinWeight; for (let i = 0; i < sI.count; i++) { let a = 0, b = 0; for (let j = 0; j < 4; j++) { const k = sI.getComponent(i, j), x = sW.getComponent(i, j); if (k === H) a += x; if (k === T1) b += x; } if (a > .25 && b > .25) ring[s].push([m, i]); } } }
  const rad = s => { const E = sk.bones[bi('arm_lower_' + s)].getWorldPosition(e), Wr = sk.bones[bi('hand_' + s)].getWorldPosition(w); ax.copy(Wr).sub(E).normalize(); let sum = 0;
    for (const [m, i] of ring[s]) { m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).sub(Wr); sum += v.addScaledVector(ax, -v.dot(ax)).length(); } return sum / ring[s].length; };
  sk.pose(); set.root.updateMatrixWorld(true); const r0 = { R: rad('R'), L: rad('L') };
  return { n: ring.R.length + ring.L.length, at: () => Math.min(rad('R') / r0.R, rad('L') / r0.L) }; }
const twistGap = tw => { let worst = 0; const q = new THREE.Quaternion(); for (let i = 0; i < tw.length; i += 3) { q.set(...F.CS2_HAND_TWIST_OFFSET).invert().multiply(tw[i].quaternion); worst = Math.max(worst, Math.abs(deg(q) - deg(tw[i + 2].quaternion)), Math.abs(deg(q) / 2 - deg(tw[i + 1].quaternion))); } return worst; };
const rows = [], gaps = []; let fewRing = false;
for (const id of [...KNIVES, 'ak']) {
  const g = await parse(UA + 'fp/cs2_' + id + '.glb'), set = F.buildAuthored(g, null, id, arms), tw = F.forearmTwists(g.scene), G = wristGauge(set); if (G.n < 200) fewRing = true;
  for (const team of ['ct', 't']) { set.hold(id, { draw: false, team }); set.update(0);
    for (const kind of id === 'ak' ? ['fire'] : ['light', 'heavy']) { if (kind === 'fire') set.fire(); else set.swing(kind); let min = 9, gap = 0;
      for (let k = 0; k < 22; k++) { set.update(.05); set.root.updateMatrixWorld(true); min = Math.min(min, G.at()); gap = Math.max(gap, twistGap(tw)); }
      rows.push([id, team, kind, min]); gaps.push(gap); } }
}
check('the twist bones follow the hand through every clip played (TWIST1 the hand\'s twist, TWIST half; within 0.5°)', gaps.every(x => x < .5), 'worst ' + Math.max(...gaps).toFixed(3) + '°');
const knife = rows.filter(r => r[0] !== 'ak'), gun = rows.filter(r => r[0] === 'ak');
// (≥ 90 % on the default knives, M9 and stiletto — before 57–61 %; ≥ 80 % on the karambit and butterfly, whose heavy
// swing bends the wrist hard — that narrows the ring by itself: karambit heavy 84 %, butterfly light 93 %; v53 KNIVES: the
// Talon, CS2's other reverse-grip claw, the same 84 % in its heavy — the new Bayonet, Skeleton, Flip and Nomad ≥ 92 %)
check('the wrist keeps its width through every knife\'s slash (M1) and stab (M2), CT and T arms (ring ≥ 90 % of the bind pose, karambit / butterfly / talon ≥ 80 %; before 57–61 %)', !fewRing && knife.length === KNIVES.length * 4 && knife.every(r => r[3] >= (/karambit|butterfly|talon/.test(r[0]) ? .8 : .9)),
  knife.map(r => `${r[0]} ${r[1]} ${r[2]} ${(r[3] * 100).toFixed(0)}%`).join(' · '));
check('a gun\'s fire unchanged (AK-47: ring ≥ 95 %)', gun.every(r => r[3] >= .95), gun.map(r => `${r[1]} ${(r[3] * 100).toFixed(0)}%`).join(' · '));
// 3. (KNIFE-fix) Every other first-person set — every gun, grenade and the bomb — and every clip in it (draw, fire,
// reload, inspect, prime, throw, plant…): both forearms are driven, and the wrist at the clip's worst moment is never
// narrower than with the twist bones held at the bind pose (the old code), and nowhere below 60 %. Before: tec9 reload
// 25 %, knife draw 43 %, AK inspect 55 %, mp7 draw 42 %; after ≥ 64 % everywhere (mac10 inspect: the left hand bent
// ~130° off screen — a bend, not twist). Each clip sampled 12 times with a mixer of the test's own.
{ const sets = readdirSync(UA + 'fp').filter(f => /^cs2_.+\.glb$/.test(f)), miss = [], worse = [], low = []; let clips = 0, worst = [9, ''];
  for (const f of sets) { const id = f.slice(4, -4), g = await parse(UA + 'fp/' + f), set = F.buildAuthored(g, null, id, arms), tw = F.forearmTwists(g.scene);
    if (tw.length !== 6) { miss.push(id); continue; } const bind = tw.map(b => b.quaternion.clone()), G = wristGauge(set), mx = new THREE.AnimationMixer(g.scene);
    for (const c of g.animations) { const a = mx.clipAction(c); a.reset().play(); let held = 9, driven = 9; clips++;
      for (let k = 0; k <= (c.duration > 0 ? 12 : 0); k++) { a.time = c.duration * k / 12; mx.update(0);
        for (const j of [1, 2, 4, 5]) tw[j].quaternion.copy(bind[j]); set.root.updateMatrixWorld(true); held = Math.min(held, G.at());
        F.forearmTwist(tw); set.root.updateMatrixWorld(true); driven = Math.min(driven, G.at()); }
      a.stop(); const tag = `${id} ${c.name} ${(held * 100).toFixed(0)}→${(driven * 100).toFixed(0)}%`; if (driven < held - .02) worse.push(tag); if (driven < .6) low.push(tag); if (driven < worst[0]) worst = [driven, tag]; } }
  check('every first-person set (guns, grenades, C4, knives) has both forearms\' twist bones driven', sets.length > KNIVES.length + 1 && !miss.length, `${sets.length} sets` + (miss.length ? ' · missing: ' + miss.join(' ') : ''));
  check('every clip of every set keeps the wrist (never narrower than the bind-held twist bones, ≥ 60 % of the bind pose)', clips > 100 && !worse.length && !low.length, `${clips} clips · worst ${worst[1]}` + (worse.length ? ' · narrower: ' + worse.join(', ') : '') + (low.length ? ' · low: ' + low.join(', ') : '')); }
console.log(`${fail ? 'FAIL' : 'PASS'}: forearm twist · ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
