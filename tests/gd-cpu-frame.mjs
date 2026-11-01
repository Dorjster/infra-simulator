// Global Defensive main-thread cost per frame on a weak Windows laptop (package W, wave 2: CPU ×4 — an i5-11th-gen's main
// thread — is CPU-bound in the 10-player fight; tests/browser/gd-perf-stress.mjs throttle=4 measures it):
//  · render-optimizer.js walkFixed: a CS2 map's fixed surfaces (leaf meshes with matrixAutoUpdate = false) skip three.js's
//    per-frame world-matrix walk until their group moves, they are flagged or they are new — the SAME world matrices as
//    three.js's own walk in every case below, with far fewer multiplications.
//  · sun-shadows.js: a skeleton the frame's own pass posed since the last shadows is not posed again in the shadow pass
//    (its bone matrices would be the same numbers); one not posed since (off screen, its shadow on screen) still is.
import * as THREE from '../dist/three.module.js';
import { walkFixed, unwalkFixed } from '../dist/render-optimizer.js';
import { createSunShadows, bonesMoved } from '../dist/sun-shadows.js';
import { BAKED } from '../dist/cs2-render.js';
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };

// ── walkFixed: a map look as cs2-render builds it — a placed root (matrixAutoUpdate false), fixed leaf meshes, a prop group
// that moves (matrixAutoUpdate true, with a child), a door group; and the same tree without walkFixed, side by side
let mults = 0; const mm = THREE.Matrix4.prototype.multiplyMatrices; THREE.Matrix4.prototype.multiplyMatrices = function (a, b) { mults++; return mm.call(this, a, b); };
function build(fixed) {
  const scene = new THREE.Scene(), arena = new THREE.Group(), root = new THREE.Group(); scene.add(arena); arena.add(root); arena.position.set(5, 0, -3);
  root.matrixAutoUpdate = false; root.matrix.makeRotationY(.4).setPosition(1, 2, 3);
  const leaves = []; for (let i = 0; i < 300; i++) { const m = new THREE.Mesh(); m.matrixAutoUpdate = false; m.matrix.makeTranslation(i, i % 7, -i); root.add(m); leaves.push(m); }
  const prop = new THREE.Group(), part = new THREE.Mesh(); prop.add(part); part.position.set(0, 1, 0); root.add(prop); prop.position.set(10, 0, 10);
  if (fixed) walkFixed(root); root.updateMatrixWorld(true);
  return { scene, arena, root, leaves, prop, part };
}
const A = build(true), B = build(false);
const all = T => { const out = []; T.scene.traverse(o => out.push(o)); return out; };
const same = () => { const a = all(A), b = all(B); let worst = 0; for (let i = 0; i < a.length; i++) for (let k = 0; k < 16; k++) worst = Math.max(worst, Math.abs(a[i].matrixWorld.elements[k] - b[i].matrixWorld.elements[k])); return a.length === b.length && worst < 1e-9; };
const frame = T => { const m0 = mults; T.scene.updateMatrixWorld(); return mults - m0; };   // (what WebGLRenderer.render does each frame)
frame(A); frame(B); let ma = 0, mb = 0; for (let f = 0; f < 10; f++) { ma += frame(A); mb += frame(B); }
check('steady frames: the same world matrices as three.js\'s own walk', same());
check('steady frames: the fixed surfaces are not multiplied again (≤ 10 a frame, was ≥ 300)', ma / 10 <= 10 && mb / 10 >= 300, `${ma / 10} vs ${mb / 10} multiplications a frame`);
for (const T of [A, B]) { T.prop.position.x += 2; T.prop.rotation.y = .7; } frame(A); frame(B);
check('a moving prop (matrixAutoUpdate) and its child: walked as before', same());
for (const T of [A, B]) { T.arena.position.y = 4; } frame(A); frame(B);
check('the map\'s parent moves: every fixed surface follows the same frame', same());
for (const T of [A, B]) T.root.matrix.makeRotationY(-.2); A.root.matrixWorldNeedsUpdate = true; B.root.matrixWorldNeedsUpdate = true; frame(A); frame(B);
check('the root itself re-placed (placeRender): every fixed surface follows', same());
for (const T of [A, B]) { T.leaves[5].matrix.makeTranslation(-9, 9, 9); T.leaves[5].matrixWorldNeedsUpdate = true; } frame(A); frame(B);
check('a fixed surface edited by hand and flagged (matrixWorldNeedsUpdate): updated', same());
for (const T of [A, B]) { const m = new THREE.Mesh(); m.matrixAutoUpdate = false; m.matrix.makeTranslation(7, 7, 7); T.root.add(m); } frame(A); frame(B);
check('a fixed surface added after the first walk (a merged batch): worked out on its first frame', same());
for (const T of [A, B]) { const m = T.leaves[9]; T.root.remove(m); T.root.add(m); } frame(A); frame(B);
check('one taken out and put back: still right', same());
unwalkFixed(A.root); for (const T of [A, B]) T.arena.position.z = 8; frame(A); frame(B);
check('unwalkFixed: three.js\'s own walk again', same() && A.root.updateMatrixWorld === THREE.Object3D.prototype.updateMatrixWorld);
THREE.Matrix4.prototype.multiplyMatrices = mm;

// ── the sun's shadow pass and skeletons: a stand-in renderer that poses skinned meshes the way three.js does (once per
// render() call, for those on the camera's layers); the main pass draws only the agents "on screen"
BAKED.uSunDir.value.set(.3, .8, .2).normalize();
// (posed = its bone matrices worked out: each pass starts them as NaN, posed ones hold numbers after it)
const posed = { list: [], length: 0, includes: s => !Number.isNaN(s.boneMatrices[0]) };
const fake = { autoClear: true, renderBufferDirect() {}, getRenderTarget: () => null, setRenderTarget() {},
  render(scene, cam) { scene.traverseVisible(o => { if (o.isSkinnedMesh && o.layers.test(cam.layers) && (cam.userData?.sun || !o.userData.offscreen)) o.skeleton.update(); }); } };
// (main camera: draws those not marked offscreen; the sun's: every caster — userData.sun set below on its camera's render)
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(); const agents = [];
for (let i = 0; i < 3; i++) { const b = new THREE.Bone(), g = new THREE.BoxGeometry(); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(g.attributes.position.count * 4), 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(.25), 4));
  const m = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial()); m.add(b); m.bind(new THREE.Skeleton([b])); m.layers.enable(7); scene.add(m); agents.push(m); }
agents[2].userData.offscreen = true;   // (behind you: not drawn on screen, its shadow is)
const sun = createSunShadows(fake); const realRender = fake.render;
let sunDrawn = 0; fake.render = function (s, c) { const isSun = c.isOrthographicCamera; if (isSun) sunDrawn++; return realRender.call(this, s, Object.assign(c, { userData: { ...c.userData, sun: isSun } })); };
const clear = () => { for (const a of agents) a.skeleton.boneMatrices.fill(NaN); }, count = () => agents.filter(a => posed.includes(a.skeleton)).length;
const sunPass = () => { const d = sunDrawn; for (let i = 0; i < 3 && sunDrawn === d; i++) sun.update(scene, cam); };   // (it draws every other frame: until it has)
fake.render(scene, cam); sunPass(); fake.render(scene, cam); clear();   // a main pass
sunPass();   // the shadows (the next frame, before its main pass)
check('shadow pass: the agents the main pass just posed are not posed again', !posed.includes(agents[0].skeleton) && !posed.includes(agents[1].skeleton), count() + ' posed');
check('shadow pass: the one off screen (not posed since) is still posed — its shadow moves', posed.includes(agents[2].skeleton));
clear(); fake.render(scene, cam);
check('main pass: posed every frame as before', posed.includes(agents[0].skeleton) && posed.includes(agents[1].skeleton));
clear(); sunPass(); const posedNow = agents.filter(a => posed.includes(a.skeleton)).map(a => a.skeleton);
clear(); sunPass();   // two shadow passes, no main pass between
check('two shadow passes with no main pass between: the second poses them itself (nothing stale is kept)', !posedNow.includes(agents[0].skeleton) && posed.includes(agents[0].skeleton), count() + ' posed');
// a body whose update walks its bones' world matrices itself (cs2-agents.js's posed-here fallback, no CS2 clips) between the
// main pass and the shadows says so (bonesMoved): the shadow pass poses it from the new matrices — its shadow is this
// frame's, not the last one's (review W-windows) — while a clip-posed body beside it is still skipped
fake.render(scene, cam); sunPass(); fake.render(scene, cam); bonesMoved(agents[0].skeleton); clear(); sunPass();
check('shadow pass: a body flagged bonesMoved (its update walked its bones) is posed again; the others still skipped', posed.includes(agents[0].skeleton) && !posed.includes(agents[1].skeleton), count() + ' posed');

console.log(`${ok}/${n}`); if (ok !== n) process.exit(1);
