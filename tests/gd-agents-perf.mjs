// Global Defensive CPU cost of the CS2 agents (package W — weak Windows laptops are CPU-bound in a 10-player fight):
//  · cs2-agents.js cloneSkinned: the parts one skin drives share ONE skeleton in each copy (GLTFLoader gives every part its
//    own Skeleton over the same bones; three.js recomputes each skeleton's bone matrices and re-sends its bone texture on
//    every render(): 47 skeletons / 4 089 bones a pass with 9 agents, measured) — and every part is still drawn exactly as
//    before (the same bone matrices), parts with other inverse bind matrices keep their own.
import * as THREE from '../dist/three.module.js';
import { cloneSkinned } from '../dist/cs2-agents.js';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };

// a source as GLTFLoader builds it: one bone chain, four skinned parts — three on the same skin (each its own Skeleton
// object, equal inverse matrices made separately), one on another skin (other inverse bind matrices)
const root = new THREE.Group(), bones = []; let parent = root;
for (let i = 0; i < 6; i++) { const b = new THREE.Bone(); b.name = 'b' + i; b.position.set(0, i ? 1 : 0, 0); parent.add(b); bones.push(b); parent = b; }
root.updateMatrixWorld(true);
const inv = () => bones.map(b => b.matrixWorld.clone().invert()), geo = () => { const g = new THREE.BoxGeometry(1, 6, 1, 1, 6, 1); const p = g.attributes.position, si = [], sw = []; for (let i = 0; i < p.count; i++) { const k = Math.max(0, Math.min(5, Math.round(p.getY(i) + 3))); si.push(k, 0, 0, 0); sw.push(1, 0, 0, 0); } g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); return g; };
const parts = []; for (let i = 0; i < 4; i++) { const m = new THREE.SkinnedMesh(geo(), new THREE.MeshBasicMaterial()); m.name = 'part' + i; root.add(m); const I = inv(); if (i === 3) I[2] = I[2].clone().multiply(new THREE.Matrix4().makeTranslation(0, .5, 0)); m.bind(new THREE.Skeleton(bones, I), m.matrixWorld); parts.push(m); }
check('source: four parts, four Skeleton objects (as GLTFLoader makes them)', new Set(parts.map(p => p.skeleton)).size === 4);

const copy = cloneSkinned(root), cParts = [], cBones = []; copy.traverse(o => { if (o.isSkinnedMesh) cParts.push(o); if (o.isBone) cBones.push(o); });
const sks = new Set(cParts.map(p => p.skeleton));
check('copy: the three parts on one skin share one skeleton, the other skin keeps its own (2, was 4)', sks.size === 2 && cParts[0].skeleton === cParts[1].skeleton && cParts[1].skeleton === cParts[2].skeleton && cParts[3].skeleton !== cParts[0].skeleton, sks.size + ' skeletons');
check('copy: its own bones (none of the source\'s)', cParts.every(p => p.skeleton.bones.every((b, k) => b === cBones[k] && !bones.includes(b))));

// the same bone matrices as a copy with a skeleton per part (the old way): pose the copy, compare every part's matrices
const old = root.clone(true), oa = [], ob = []; root.traverse(o => oa.push(o)); old.traverse(o => ob.push(o)); const map = new Map(oa.map((o, i) => [o, ob[i]]));
ob.forEach((o, i) => { if (o.isSkinnedMesh) o.bind(new THREE.Skeleton(oa[i].skeleton.bones.map(x => map.get(x)), oa[i].skeleton.boneInverses), oa[i].bindMatrix); });
const oParts = []; old.traverse(o => { if (o.isSkinnedMesh) oParts.push(o); }); const oBones = []; old.traverse(o => { if (o.isBone) oBones.push(o); });
for (const [B, R] of [[cBones, copy], [oBones, old]]) { B.forEach((b, k) => b.rotation.set(.1 * k, .3 * k, -.2 * k)); R.position.set(3, 1, -2); R.updateMatrixWorld(true); }
let worst = 0; for (let i = 0; i < 4; i++) { cParts[i].skeleton.update(); oParts[i].skeleton.update(); const A = cParts[i].skeleton.boneMatrices, O = oParts[i].skeleton.boneMatrices; for (let k = 0; k < A.length; k++) worst = Math.max(worst, Math.abs(A[k] - O[k])); }
check('every part: the same bone matrices as with a skeleton of its own (drawn exactly as before)', worst < 1e-6, 'max difference ' + worst.toExponential(1));
check('bone matrix work per pass: 2 skeletons × 6 bones (was 4 × 6)', [...sks].reduce((s, k) => s + k.bones.length, 0) === 12);

// ── hideBareBones: bones with nothing drawn under them leave the render's object walk; the gun's bone chain and any bone
// with a mesh under it stay; the bone matrices (skinning) are the same either way ──
{ const { hideBareBones } = await import('../dist/cs2-agents.js');
  const rig = cloneSkinned(root); const all = []; rig.traverse(o => { if (o.isBone) all.push(o); });
  all[3].name = 'wpn'; const hung = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); all[1].add(new THREE.Group().add(hung));   // (b1 carries a drawn thing; b3 = wpn: kept for later)
  const before = []; rig.updateMatrixWorld(true); const sk = []; rig.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); sk.push(Float32Array.from(o.skeleton.boneMatrices)); } });
  const n2 = hideBareBones(rig, 'wpn'); const vis = all.map(b => b.visible);
  check('bones with nothing drawn under them hidden (b4, b5); wpn\'s chain (b0–b3) and the bone carrying a mesh kept', n2 === 2 && vis.join() === 'true,true,true,true,false,false', vis.join());
  let walk0 = 0, walk1 = 0; const walk = (o, f) => { if (!o.visible) return; f(); for (const c of o.children) walk(c, f); }; walk(rig, () => walk1++); rig.traverse(() => walk0++);
  check('the render\'s walk visits fewer objects', walk1 < walk0, walk1 + ' of ' + walk0);
  all.forEach((b, k) => b.rotation.set(.2 * k, .1, 0)); rig.updateMatrixWorld(true); const all2 = []; const ref = cloneSkinned(root), rb = []; ref.traverse(o => { if (o.isBone) rb.push(o); }); rb.forEach((b, k) => b.rotation.set(.2 * k, .1, 0)); ref.updateMatrixWorld(true);
  let worst = 0; const rs = []; ref.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); rs.push(o.skeleton.boneMatrices); } }); rig.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); all2.push(o.skeleton.boneMatrices); } }); for (let i = 0; i < rs.length; i++) for (let k = 0; k < rs[i].length; k++) worst = Math.max(worst, Math.abs(rs[i][k] - all2[i][k]));
  check('hidden bones still move the skin exactly (bone matrices equal to an untouched copy)', worst < 1e-6 && sk.length === 4, 'max difference ' + worst.toExponential(1)); }
// ── gd-anim-lod.js: how often an agent is animated (multiplayer.js) ──
//  in view within 160 units: every frame (as before); out of view (behind, beside): every other frame with twice the
//  step — the same animation time per second, half the mixer work; far (≥ 160): every other frame (as before)
{ const { agentAnimDt, createViewTest, NEAR_FULL } = await import('../dist/gd-anim-lod.js');
  const run = (far, seen) => { let t = 0, calls = 0; for (let k = 0; k < 120; k++) { const d = agentAnimDt(far, seen, k, 1 / 60); if (d) { calls++; t += d; } } return { calls, t }; };
  const a = run(40, true), b = run(40, false), c = run(200, true), d = run(200, false);
  check('in view, near: animated every frame (120 of 120)', a.calls === 120 && Math.abs(a.t - 2) < 1e-9, JSON.stringify(a));
  check('out of view, near: every other frame, the same animation time (60 of 120, 2 s)', b.calls === 60 && Math.abs(b.t - 2) < 1e-9, JSON.stringify(b) + ' (before: every frame — out of view cost as much as in view)');
  check('far (≥ ' + NEAR_FULL + ' units), in view or not: every other frame, as before', c.calls === 60 && d.calls === 60 && Math.abs(c.t - 2) < 1e-9);
  const cam = new THREE.PerspectiveCamera(78, 16 / 9, .1, 1700); cam.position.set(0, 9.7, 0); cam.lookAt(0, 9.7, -10); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const v = createViewTest(cam); v.frame();
  check('view test: a body ahead is seen, one behind is not, one far off to the side is not, one half past the screen edge is', v.seen(0, 0, -50) && !v.seen(0, 0, 50) && !v.seen(-200, 0, -20) && v.seen(-60, 0, -50) && !v.seen(-200, 0, 30));
  let worst = 0; { const t0 = performance.now(); for (let i = 0; i < 1e5; i++) v.seen(i % 50, 0, -(i % 70)); worst = (performance.now() - t0) / 1e5 * 1000; } check('view test is cheap (< 2 µs a body)', worst < 2, worst.toFixed(3) + ' µs'); }
console.log(ok + '/' + n); process.exit(ok === n ? 0 : 1);
