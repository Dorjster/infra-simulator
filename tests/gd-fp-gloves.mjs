// CS2's own first-person arms for each side (user-assets/fp-gloves/arms-*.glb from tools/export-fp-gloves.py, made on
// this computer from the CS2 install, never shipped) as fp-view.js wears them on the first-person sets (package V):
// CS2's maps at CS2's resolution with their colour spaces (base colour sRGB; normal, AO, roughness, metalness linear;
// AO/roughness/metalness one ORM picture), CT (SAS: Hardknuckle gloves, SAS sleeves) and T (Phoenix: Full-finger
// gloves, bare forearms, rolled sleeves) told apart, on the set's own skeleton — the hands exactly where the set's
// glove has them through a clip — shared by every set, one shader for both sides; other modes keep the set's glove.
// Skipped without the imported files (CI).
//   node tests/gd-fp-gloves.mjs
import { readFileSync, existsSync } from 'node:fs';
const UA = 'user-assets/', man = existsSync(UA + 'manifest.json') ? JSON.parse(readFileSync(UA + 'manifest.json', 'utf8')) : null, fpg = man?.models?.fpGloves;
if (!fpg || !existsSync(UA + fpg.file) || !existsSync(UA + 'fp/cs2_ak.glb')) { console.log('SKIP: no CS2 first-person arms (tools/export-fp-gloves.py) or sets on this computer'); process.exit(0); }
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });   // (pictures: not drawn here)
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }), getElementById: () => null };
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding/.test(String(a[0]))) w(...a); }; }
const THREE = await import('../dist/three.module.js'), { gltfLoader } = await import('../dist/gltf-loader.js'), F = await import('../dist/fp-view.js');
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const parse = f => { const b = readFileSync(f); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
if (typeof F.armsFrom !== 'function') { check('fp-view.js wears CS2\'s own arms (armsFrom)', false, 'not there'); console.log('FAIL: first-person arms · 0 passed, 1 failed'); process.exit(1); }
// The file's pictures, read from their headers (the loader here decodes none): CS2's own sizes.
const glb = readFileSync(UA + fpg.file), jl = glb.readUInt32LE(12), J = JSON.parse(glb.toString('utf8', 20, 20 + jl)), bin = 20 + jl + 8;
const imgSize = i => { const bv = J.bufferViews[J.images[i].bufferView], b = glb.subarray(bin + (bv.byteOffset || 0), bin + (bv.byteOffset || 0) + bv.byteLength);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20), 'png'];
  for (let k = 2; k < b.length - 9;) { if (b[k] !== 0xff) { k++; continue; } const m = b[k + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(k + 7), b.readUInt16BE(k + 5), 'jpeg']; k += 2 + b.readUInt16BE(k + 2); } return [0, 0, '?']; };
const texImg = t => J.textures[t].source;
for (const md of J.materials.filter(m => m.extras?.part === 'glove')) { const c = imgSize(texImg(md.pbrMetallicRoughness.baseColorTexture.index)), n = imgSize(texImg(md.normalTexture.index)), o = imgSize(texImg(md.occlusionTexture.index));
  check(`${md.name}: colour and normal at CS2's 2048², an ORM map (AO, roughness, metalness) — not one downloaded picture + normal`, c[0] >= 2048 && c[1] >= 2048 && n[0] >= 2048 && n[2] === 'png' && o[0] >= 1024 && md.occlusionTexture.index === md.pbrMetallicRoughness.metallicRoughnessTexture.index, `colour ${c.join('×')} · normal ${n.join('×')} · ORM ${o.join('×')}`); }
// 1. Materials as the game makes them.
const arms = F.armsFrom(await parse(UA + fpg.file));
check('both sides there (CT and T), each with gloves, skin and sleeves', !!arms && ['ct', 't'].every(s => ['glove', 'skin', 'sleeve'].every(p => arms[s].some(o => o.material.userData.part === p))),
  arms && ['ct', 't'].map(s => s + ': ' + arms[s].map(o => o.material.name).join(' + ')).join(' · '));
const mats = arms.materials, glove = s => arms[s].find(o => o.material.userData.part === 'glove').material;
check('CS2\'s own gloves per side: CT the Hardknuckle (SAS), T the Full-finger (Phoenix) — not the Driver Gloves on both', /hardknuckle/.test(glove('ct').name) && /fullfinger/.test(glove('t').name), glove('ct').name + ' · ' + glove('t').name);
check('colour spaces: base colour sRGB; normal, AO, roughness, metalness linear (one ORM texture for the three)', mats.every(m => m.map?.colorSpace === THREE.SRGBColorSpace && m.normalMap && m.normalMap.colorSpace !== THREE.SRGBColorSpace && m.aoMap && m.aoMap === m.roughnessMap && m.aoMap === m.metalnessMap && m.aoMap.colorSpace !== THREE.SRGBColorSpace),
  mats.map(m => `${m.name}: ${m.map?.colorSpace}/${m.normalMap?.colorSpace}/${m.aoMap?.colorSpace}`).join(' · '));
check('normal maps read as glTF\'s (+Y, tangents from the file: no flipped or derived tangent frame)', mats.every(m => m.normalScale.x === 1 && m.normalScale.y === 1) && ['ct', 't'].every(s => arms[s].every(o => o.geometry.attributes.tangent && o.geometry.attributes.uv)));
check('per-part look (roughness and metalness from the maps, ARM_LOOK\'s reflection share and albedo — bare skin toned down from clipping), materials shared', mats.every(m => m.roughness === 1 && m.metalness === 1 && m.envMapIntensity === F.ARM_LOOK[m.userData.part].env && Math.abs(m.color.r - F.ARM_LOOK[m.userData.part].albedo) < 1e-6 && m.userData.shared) && F.ARM_LOOK.skin.albedo < 1,
  mats.map(m => m.name + ' env ' + m.envMapIntensity + ' albedo ' + m.color.r.toFixed(2)).join(' · '));
// Lit as the gun beside them (skin-render.js tier 'fp'): the map's light where you stand (FP_LIGHT — the same uniform
// object, so a tunnel darkens the arms with the gun) and the map's grade, built into the standard shader the way three.js
// builds it (one hook for every arm material: one program). (Their reflections — the gun's studio box, so ARM_LOOK.env
// counts — need a renderer: tests/browser/gd-gloves-sheet.mjs.)
{ const SR = await import('../dist/skin-render.js'), sh = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }), runs = mats.map(m => { const s = sh(); m.onBeforeCompile?.(s, null); return s; }), s = runs[0];
  const lit = s.uniforms.uArmLight === SR.FP_LIGHT || Object.values(s.uniforms).includes(SR.FP_LIGHT), lightLine = /reflectedLight\.directDiffuse \*= \w+;[^\n]*indirectDiffuse \*= \w+;[^\n]*indirectSpecular \*= \w+/.test(s.fragmentShader);
  const graded = /cs2Grade\(gl_FragColor\.rgb\)/.test(s.fragmentShader) && s.fragmentShader.indexOf('cs2Grade(gl_FragColor') < s.fragmentShader.indexOf('#include <tonemapping_fragment>') && !!s.uniforms.uGrade, same = new Set(mats.map(m => m.onBeforeCompile)).size === 1 && new Set(mats.map(m => m.customProgramCacheKey())).size === 1 && runs.every(r => r.fragmentShader === s.fragmentShader);
  check('lit and graded as the gun in the same view: the map\'s light where you stand (FP_LIGHT) on every light term, the map\'s grade before tone mapping; one hook and program key for all', lit && lightLine && graded && same, `FP_LIGHT ${lit} · light terms ${lightLine} · grade ${graded} · one program ${same}`); }
const key = m => [m.type, !!m.map, !!m.normalMap, !!m.aoMap, !!m.roughnessMap, !!m.metalnessMap, !!m.emissiveMap, m.vertexColors, m.transparent, m.alphaTest, m.side, m.flatShading, m.map?.channel, m.aoMap?.channel].join();
check('one shader for every arm material of both sides (a side swap compiles nothing)', new Set(mats.map(key)).size === 1, [...new Set(mats.map(key))].join(' | '));
// 2. On a set: the arms on the set's own skeleton, the hands where the set's glove has them through a clip.
let legacyGlove = null; if (existsSync(UA + 'fp/glove.glb')) (await parse(UA + 'fp/glove.glb')).scene.traverse(o => { if (!legacyGlove && o.isSkinnedMesh) legacyGlove = o; });
const set = F.buildAuthored(await parse(UA + 'fp/cs2_ak.glb'), legacyGlove, 'ak', arms), w = set.worn;
check('the set wears them (CT and T groups, the set\'s glove kept for other modes)', !!w && !!w.ct && !!w.t && w.legacy.length >= 2);
const vis = () => ({ ct: w.ct.visible, t: w.t.visible, legacy: w.legacy.every(o => o.visible) });
set.hold('ak', { draw: false, team: 't' }); const vt = vis(); set.hold('ak', { draw: false, team: 'ct' }); const vc = vis(); set.hold('ak', { draw: false, team: null }); const vn = vis();
check('a T sees the Phoenix arms, a CT the SAS arms, no side (other modes) the set\'s own glove', vt.t && !vt.ct && !vt.legacy && vc.ct && !vc.t && !vc.legacy && vn.legacy && !vn.ct && !vn.t, JSON.stringify({ t: vt, ct: vc, none: vn }));
const skel = w.legacy[0].skeleton; check('on the set\'s own skeleton (one bone texture per set, as before)', [...w.ct.children, ...w.t.children].every(o => o.skeleton === skel));
set.textures.length; check('their pictures go to the GPU with the set (its texture list)', arms.textures.every(t => set.textures.includes(t)), `${arms.textures.length} pictures`);
// The right hand's index knuckle (vertices bound mostly to finger_index_0_R: the hand bone itself carries almost none)
// in the set's glove and in each side's glove, through the reload.
const hi = skel.bones.findIndex(b => b.name === 'finger_index_0_R'), v = new THREE.Vector3();
const palm = mesh => { const sI = mesh.geometry.attributes.skinIndex, sW = mesh.geometry.attributes.skinWeight, c = new THREE.Vector3(); let k = 0; for (let i = 0; i < sI.count; i++) for (let j = 0; j < 4; j++) if (sI.getComponent(i, j) === hi && sW.getComponent(i, j) > .5) { c.add(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld)); k++; } return k ? c.multiplyScalar(1 / k) : null; };
const gloveMesh = (g, s) => g.children.find(o => o.material.userData.part === 'glove'), legacyHand = () => { let best = null; for (const o of w.legacy) { const p = palm(o); if (p && (!best || o.geometry.attributes.position.count > best[1])) best = [p, o.geometry.attributes.position.count]; } return best?.[0]; };
const rows = []; set.hold('ak', { draw: false, team: 'ct' }); set.reload(2500);
for (const t of [0, .6, 1.2]) { set.update(t ? .6 : 0); set.root.updateMatrixWorld(true); const L = legacyHand(), C = palm(gloveMesh(w.ct)), T = palm(gloveMesh(w.t)); rows.push([t, L && C ? L.distanceTo(C) * 16.5 : 99, L && T ? L.distanceTo(T) * 16.5 : 99]); }
check('the hands follow the clip exactly where the set\'s glove has them (right index knuckle within 3 cm, CT and T, through a reload)', rows.every(r => r[1] < 3 && r[2] < 3), rows.map(r => `${r[0]}s CT ${r[1].toFixed(1)} cm T ${r[2].toFixed(1)} cm`).join(' · '));
// 3. Shared by every set: one geometry and material per part, not a copy each.
const set2 = F.buildAuthored(await parse(UA + 'fp/cs2_usps.glb'), legacyGlove, 'usps', arms);
check('shared by every set (the same geometry and materials; each set only its own meshes on its bones)', set2.worn.ct.children.every((o, i) => o.geometry === w.ct.children[i].geometry && o.material === w.ct.children[i].material && o !== w.ct.children[i] && o.skeleton === set2.worn.legacy[0].skeleton));
// 4. Without the file the sets stay as they were (built-in / v51 look).
const set3 = F.buildAuthored(await parse(UA + 'fp/cs2_knife.glb'), legacyGlove, 'knife', null); set3.hold('knife', { draw: false, team: 't' });
let shown = 0; set3.root.traverse(o => { if (o.isSkinnedMesh && o.visible && o.skeleton.getBoneByName('finger_thumb_0_L')) shown++; });
check('without the CS2 arms a set keeps its own glove (no change)', set3.worn === null && shown >= 2, `glove meshes shown ${shown}`);
console.log(`${fail ? 'FAIL' : 'PASS'}: first-person arms · ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
