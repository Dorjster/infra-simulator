// Drawing skins (skin-render.js, PLAN §5): one program per material type whatever the skin ('|skin2': every mode, finish
// and texture binding a uniform — the shader source is the same for any skin, no define or vertexColors flips after
// load), the Quaternius guns' array materials skinnable (Bug A: o.material.map was Array.prototype.map and clone()
// threw), clones of prepared materials with their own uniforms (Bug B), one painted copy per (material, skin) shared
// by every holder and freed with the last one, the program count constant across ten players, every finish and three
// rematches, applySkin allocation-free, the built-in finishes' looks (object-space fit, metal / rough per finish), and
// the no-assets path (a CS2 finish without its pictures draws its built-in stand-in). Node, built-in models only.
//   node tests/gd-skin-render.mjs
import v8 from 'node:v8'; import vm from 'node:vm';
import * as THREE from '../dist/three.module.js';
import { applySkin, skinObject, unskinObject, prepareModel, prepareLike, prepareSkins, skinInfo, skinRenderStats, fitSkinned, finishLook, sameSkin, skinHash, FP_LIGHT } from '../dist/skin-render.js';
import { FINISHES } from '../dist/skins.js';
let ok = 0, bad = 0; const check = (name, c, d = '') => { if (c) ok++; else bad++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const fade = { finish: 'fade', wear: .02, seed: 7, stickers: [] };
// The shader a material builds (three.js calls onBeforeCompile with its ShaderLib source): what is compiled.
const compiled = m => { const L = THREE.ShaderLib.standard, sh = { uniforms: THREE.UniformsUtils.clone(L.uniforms), vertexShader: L.vertexShader, fragmentShader: L.fragmentShader }; m.onBeforeCompile(sh, null); return sh; };
// What three.js keys a program by, for these materials (the parts that could change: type, the custom key, maps, vertex colours, defines).
const progKey = m => [m.type, m.customProgramCacheKey(), m.vertexColors, !!m.map, !!m.normalMap, !!m.roughnessMap, !!m.metalnessMap, !!m.envMap, !!m.aoMap, m.transparent, JSON.stringify(m.defines || {})].join('|');
// A Quaternius-style gun: one mesh, two flat materials (no maps, no UVs), muzzle along −z.
const qgun = () => { const g = new THREE.Group(), geo = new THREE.BoxGeometry(.2, .3, 3); geo.deleteAttribute('uv'); geo.addGroup(0, 18, 0); geo.addGroup(18, 18, 1);
  const a = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: .8, roughness: .4 }), b = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: .7 }); a.userData.shared = b.userData.shared = true; g.add(new THREE.Mesh(geo, [a, b])); return g; };
const texGun = () => { const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); m.userData.shared = true; g.add(new THREE.Mesh(new THREE.BoxGeometry(.2, .3, 3), m)); return g; };

// ── Bug A: array materials ──
{ const src = prepareModel(qgun(), { model: 'p90', tier: 'tp' }), g = src.clone(), mesh = g.children[0], base = mesh.material; let err = null;
  try { skinObject(g, fade); } catch (e) { err = e.message; }
  const mats = mesh.material, U = mats[0]?.userData?.skinU;
  check('a gun with array materials (the 18 Quaternius guns) takes a skin: no throw, every material its painted copy', !err && Array.isArray(mats) && mats.length === 2 && mats.every((m, i) => m !== base[i] && m.userData.skinU?.uSkinOn.value === 1), err || '');
  check('…drawn in the model\'s own space (mode 2: it has no UVs), its pattern frame along the gun', U?.uSkMode.value === 2 && U.uSkUv.value === 0 && skinInfo(mats[0]).fit, `mode ${U?.uSkMode.value} uv ${U?.uSkUv.value}`);
  // the frame: the muzzle end (−z) at x = +.5, the back at −.5
  const M = U.uSkM.value, tip = new THREE.Vector3(0, 0, -1.5).applyMatrix4(M), back = new THREE.Vector3(0, 0, 1.5).applyMatrix4(M);
  check('…its pattern frame: x along the gun from the back (−0.5) to the muzzle (+0.5), in lengths', Math.abs(tip.x - .5) < 1e-6 && Math.abs(back.x + .5) < 1e-6, `tip ${tip.x.toFixed(3)} back ${back.x.toFixed(3)}`);
  unskinObject(g); check('put away: its own array of shared materials back', mesh.material === base && skinRenderStats().cached === 0); }

// ── one program per material type ──
{ const plain = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }), flat = new THREE.MeshStandardMaterial({ color: 0x333333 }), vc = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), vertexColors: true }); vc.userData.skinMask = true;
  for (const m of [plain, flat, vc]) prepareSkins([m], { model: 'ak', uv: 'cs2', tier: 'tp', M: new THREE.Matrix4() });
  const skins = [null, fade, { finish: 'tiger', wear: .4, seed: 9 }, { finish: 'cs2:cu_ak47_cobra', fb: 'redline', wear: .3, seed: 1 }, { finish: 'cs2k:aa_fade', fb: 'fade', wear: .01, seed: 3 }, { finish: 'none', stickers: [{ id: 'gg', slot: 0, x: .5, y: .5, scale: 1, rot: 0, wear: 0 }] }];
  for (const m of [plain, flat, vc]) { const key0 = progKey(m), src0 = compiled(m); let same = true, keys = true, modes = new Set();
    for (const s of [...skins, ...Object.keys(FINISHES).map(f => ({ finish: f, wear: .5, seed: 500 }))]) { applySkin([m], s, false); modes.add(m.userData.skinU.uSkMode.value); const sh = compiled(m); if (sh.fragmentShader !== src0.fragmentShader || sh.vertexShader !== src0.vertexShader) same = false; if (progKey(m) !== key0) keys = false; }
    check(`${m === plain ? 'textured' : m === flat ? 'flat' : 'vertex-coloured'} material: one shader for every skin and mode (modes ${[...modes].sort().join(',')}), its program key unchanged`, same && keys, key0.slice(-40)); }
  const fs = compiled(plain).fragmentShader;
  check('the patch is in: paint, metal / rough from the paint, the knife mask, wear clamped to 0.97 (CS2 bake rank 1 never wears), the grade', ['skinPattern', 'roughnessFactor = mix(mix(roughnessFactor, skRgh, skK), 0.7, skHnd)', 'metalnessFactor = mix(', 'min(uSkWear, 0.97)', 'cs2Grade(', 'uSkLight'].every(k => fs.includes(k)));
  check('the custom program key is the same for every prepared material (one program per three.js material type)', plain.customProgramCacheKey() === flat.customProgramCacheKey() && plain.customProgramCacheKey().endsWith('|skin2')); }

// ── Bug B and copies ──
{ const m = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); applySkin([m], fade); const c = prepareLike(m.clone(), m); let err = null; try { applySkin([c], { finish: 'tiger', wear: .1, seed: 3 }); } catch (e) { err = e.message; }
  check('a copy of a prepared material takes its own skin (own uniforms; the original keeps its own)', !err && c.userData.skinU !== m.userData.skinU && c.userData.skinU.uSkA.value.isColor && m.userData.skinU.uSkPat.value !== c.userData.skinU.uSkPat.value && c.customProgramCacheKey() === m.customProgramCacheKey(), err || ''); }

// ── the material cache: ten players, every finish, three rematches ──
{ const models = { p90: prepareModel(qgun(), { model: 'p90', tier: 'tp' }), ak: prepareModel(texGun(), { model: 'ak', uv: 'cs2flip', tier: 'tp' }) };
  const knife = (() => { const g = new THREE.Group(), geo = new THREE.BoxGeometry(.05, .1, 1.2); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3)); const m = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), vertexColors: true }); m.userData.skinMask = m.userData.shared = true; g.add(new THREE.Mesh(geo, m)); return prepareModel(g, { model: 'knife', tier: 'tp' }); })();
  const keysOf = roots => { const k = new Set(); for (const r of roots) r.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) k.add(progKey(m)); }); return k; };
  const base = keysOf([models.p90, models.ak, knife]), ids = Object.keys(FINISHES), lateVC0 = skinRenderStats().lateVC; let maxKeys = 0, roundCached = [];
  for (let round = 0; round < 3; round++) {
    const held = []; for (let p = 0; p < 10; p++) for (const src of [models.p90, models.ak, knife]) { const g = src.clone(); skinObject(g, p % 3 === 2 ? null : { finish: ids[(p + round) % ids.length], wear: p / 10, seed: 1 + p * 37 + round }); held.push(g); }
    for (const g of held.slice(0, 5)) skinObject(g, { finish: 'cs2:cu_ak47_cobra', fb: 'redline', wear: .2, seed: 2 });   // (skins changed at a freeze)
    maxKeys = Math.max(maxKeys, keysOf(held).size); roundCached.push(skinRenderStats().cached); for (const g of held) unskinObject(g); }
  check('programs: ten players × three guns × every finish, changed mid-match, three rematches — no program key beyond the guns\' own', maxKeys <= base.size, `${maxKeys} keys in play, ${base.size} for the guns as loaded`);
  check('no vertex-colour switch on a skinned copy (the knife\'s mask is on from load)', skinRenderStats().lateVC === lateVC0);
  check('every painted copy freed after each round (refcounted cache back to empty)', skinRenderStats().cached === 0, 'peak per round ' + roundCached.join(', '));
  const a = models.ak.clone(), b = models.ak.clone(), c = models.ak.clone(), red = { finish: 'redline', wear: .1, seed: 4 }; skinObject(a, red); skinObject(b, { ...red }); skinObject(c, { ...red, seed: 5 });
  const ma = a.children[0].material; let freed = 0; ma.addEventListener('dispose', () => freed++);
  check('two players with the same skin share one painted copy; another seed gets its own', ma === b.children[0].material && ma !== c.children[0].material && ma.userData.shared === false);
  unskinObject(a); const after1 = freed; unskinObject(b); check('…freed only with its last user', after1 === 0 && freed === 1); unskinObject(c);
  // a skin changed in place (same object, a new skin) swaps to the new copy and releases the old one
  const d = models.ak.clone(); skinObject(d, red); const m1 = d.children[0].material; skinObject(d, { finish: 'web', wear: .1, seed: 4 }); check('a skin changed: the new copy on, the old one freed', d.children[0].material !== m1 && skinRenderStats().cached === 1); unskinObject(d); }

// ── applySkin allocates nothing ──
{ v8.setFlagsFromString('--expose_gc'); const gc = vm.runInNewContext('gc'), m = [new THREE.MeshStandardMaterial({ map: new THREE.Texture() }), new THREE.MeshStandardMaterial()]; prepareSkins(m, { model: 'ak', tier: 'fp', M: new THREE.Matrix4() });
  const sk = [fade, { finish: 'casehardened', wear: .3, seed: 661, stickers: [{ id: 'gg', slot: 0, x: .2, y: .3, scale: 1, rot: 10, wear: .1 }] }, null, { finish: 'web', wear: .9, seed: 2 }];
  for (let i = 0; i < 20000; i++) applySkin(m, sk[i & 3], false);   // (warm: looks parsed once, optimised code — the interpreter boxes every double it computes)
  const run = f => { gc(); const h0 = process.memoryUsage().heapUsed; f(); return process.memoryUsage().heapUsed - h0; }, least = f => Math.min(...Array.from({ length: 6 }, () => run(f)));
  const used = least(() => { for (let i = 0; i < 1000; i++) applySkin(m, sk[i & 3], false); }), junk = run(() => { const k = []; for (let i = 0; i < 1000; i++) k.push(new THREE.Color(), new THREE.Vector4()); globalThis.__k = k; });
  // every Color / Vector / Matrix made counted (a prototype setter catches the constructor's first write of its own field)
  let made = 0; const hook = (C, f) => Object.defineProperty(C.prototype, f, { configurable: true, set(v) { made++; Object.defineProperty(this, f, { value: v, writable: true, enumerable: true, configurable: true }); } });
  hook(THREE.Color, 'isColor'); hook(THREE.Vector2, 'x'); hook(THREE.Vector3, 'x'); hook(THREE.Vector4, 'x'); hook(THREE.Matrix4, 'elements'); const probe = (new THREE.Color(), new THREE.Vector4(), made); made = 0;
  for (let i = 0; i < 1000; i++) applySkin(m, sk[i & 3], false); const madeBy = made; for (const [C, f] of [[THREE.Color, 'isColor'], [THREE.Vector2, 'x'], [THREE.Vector3, 'x'], [THREE.Vector4, 'x'], [THREE.Matrix4, 'elements']]) delete C.prototype[f];
  check('applySkin makes no Color, Vector or Matrix: 1,000 calls (4 skins incl. stickers, 2 materials)', probe === 2 && madeBy === 0, `${madeBy} made`);
  check('…and grows the heap by under 128 B a call (numbers V8 boxes aside: one Color + Vector4 is ~270 B)', used < 128000 && junk > 2 * used, `${used} B per 1,000 (1,000 Colors + Vectors: ${junk} B)`); delete globalThis.__k; }

// ── built-in finishes: looks, fits, the no-assets path ──
{ check('anodized finishes are metal and glossy, paints dielectric (per-finish response, not one constant)', finishLook('doppler').metal === 1 && finishLook('doppler').rough < .2 && finishLook('camo').metal === 0 && finishLook('web').metal < .2 && finishLook('casehardened').metal === 1);
  check('Fade, Doppler, Marble, Tiger Tooth wear capped at 0.08 (as CS2)', ['fade', 'doppler', 'marble', 'tiger'].every(f => finishLook(f).wearMax === .08));
  const m = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); prepareSkins([m], { model: 'karambit', uv: 'cs2', tier: 'fp', M: new THREE.Matrix4() });
  applySkin([m], { finish: 'cs2k:aa_fade', fb: 'fade', wear: .5, seed: 1 }, false); const U = m.userData.skinU;
  check('no assets (no manifest): a CS2 knife finish draws its built-in stand-in in the model\'s space (fb fade), wear capped', U.uSkinOn.value === 1 && U.uSkMode.value === 2 && U.uSkPat.value === 1 && U.uSkWear.value === .08 && U.uSkPaint.value.image?.width === 1, `mode ${U.uSkMode.value} pat ${U.uSkPat.value} wear ${U.uSkWear.value}`);
  applySkin([m], { finish: 'cs2:nope', wear: .1, seed: 1 }); check('a CS2 finish with no stand-in and no pictures: drawn plain (mode 0), never a broken look', U.uSkMode.value === 0);
  check('first-person materials share the map\'s light value (one uniform object)', U.uSkLight === FP_LIGHT);
  applySkin([m], { finish: 'mystery', wear: 0, seed: 1 }); check('an unknown finish: no paint', U.uSkinOn.value === 0);
  check('the same skin: a new object with the same fields is the same (fb included); hash changes with the finish', sameSkin({ ...fade, fb: 'x' }, { ...fade, fb: 'x' }) && !sameSkin({ ...fade, fb: 'x' }, fade) && skinHash(fade) !== skinHash({ ...fade, finish: 'web' }));
  // a first-person knife (skinned, bind pose): the blade side (vertex-colour mask) is the front
  const geo = new THREE.BoxGeometry(2, .3, .05), col = new Float32Array(geo.attributes.position.count * 3); for (let i = 0; i < geo.attributes.position.count; i++) col.fill(geo.attributes.position.getX(i) > 0 ? 1 : 0, i * 3, i * 3 + 3); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const M = fitSkinned(new THREE.Mesh(geo, m), null), tip = new THREE.Vector3(1, 0, 0).applyMatrix4(M);
  check('first-person fit: a knife\'s front is its blade (its mask), its length in lengths', Math.abs(tip.x - .5) < 1e-6, tip.x.toFixed(3)); }

console.log(`${bad ? 'FAIL' : 'PASS'}: skin drawing · ${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
