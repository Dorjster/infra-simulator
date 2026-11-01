// CS2 finishes' pictures (skin-textures.js, PLAN §5.4 / §5.6): looked up in the host's manifest (guns 'cs2:<kit>', knives
// 'cs2k:<family>' per knife model), nothing fetched or uploaded while a round is live (the gate), one texture to the GPU
// per frame, one pair per (model, finish, tier) shared by everyone, the mrw picture kept as data (no colour space),
// the budget evicting only pictures nobody shows, and a material switching to the CS2 bake (mode 3) only once its
// pictures are on the GPU — its built-in stand-in until then. Node, a fake manifest and loader (no user-assets needed).
//   node tests/gd-skin-textures.mjs
import * as THREE from '../dist/three.module.js';
import * as T from '../dist/skin-textures.js';
import { applySkin, prepareSkins, skinObject, unskinObject, prepareModel } from '../dist/skin-render.js';
let ok = 0, bad = 0; const check = (name, c, d = '') => { if (c) ok++; else bad++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const MAN = { version: 1, made: 'test-1', res: 1024, shared: {}, base: {},
  weapons: { ak: { model: 'cs2_ak', uv: 0, len: 37, finishes: { cu_ak47_cobra: { name: 'Line', style: 7, wear: [.1, .7], paint: 'ak/a_paint.jpg', mrw: 'ak/a_mrw.png', fbId: 'redline' }, 'cu_p90-x': { paint: 'ak/b_paint.jpg', mrw: 'ak/b_mrw.png', fbId: 'hex' } } } },
  knives: { aa_fade: { name: 'F', style: 6, wear: [0, .08], fbId: 'fade', models: { karambit: { kit: 'aa_fade', paint: 'karambit/f_paint.jpg', mrw: 'karambit/f_mrw.png' } } } } };
const fetched = [], uploads = []; let size = 512;
T.resetSkinTextures(); T.setSkinLoader((url, o) => { fetched.push({ url, ...o }); return Promise.resolve({ width: o.size, height: o.size, close() {} }); }, '/s/');
T.setSkinRenderer({ initTexture: t => uploads.push(t) }); let live = true; T.setSkinGate(() => !live);
await T.loadSkinManifest(false, MAN);
check('manifest lookups: a gun kit on its gun, a knife family on a knife model; none elsewhere (built-in stand-in)', !!T.finishFiles('ak', 'cs2:cu_ak47_cobra') && !!T.finishFiles('karambit', 'cs2k:aa_fade') && !T.finishFiles('m9', 'cs2k:aa_fade') && !T.finishFiles('m4', 'cs2:cu_ak47_cobra') && !!T.finishFiles('ak', 'cs2:cu_p90-x'));
check('the manifest\'s stand-in (fbId) when a skin carries none', T.fbOf('cs2k:aa_fade') === 'fade' && T.fbOf('cs2:cu_ak47_cobra') === 'redline');
// a knife skinned mid-round: its stand-in, nothing fetched or uploaded
const knife = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); prepareSkins([knife], { model: 'karambit', uv: 'cs2', tier: 'fp', M: new THREE.Matrix4() });
applySkin([knife], { finish: 'cs2k:aa_fade', wear: .02, seed: 1 }, false); await tick(80); const U = knife.userData.skinU;
check('live round: the CS2 finish waits — its built-in stand-in drawn (mode 2, fade), nothing fetched, nothing uploaded', U.uSkMode.value === 2 && U.uSkPat.value === 1 && fetched.length === 0 && uploads.length === 0, `mode ${U.uSkMode.value} fetched ${fetched.length} uploads ${uploads.length}`);
// freeze time: fetched, then one texture per frame, then mode 3
live = false; T.setSkinGate(() => !live); for (let i = 0; i < 20 && fetched.length < 2; i++) await tick(10);
check('freeze time: both pictures fetched at the tier\'s size (your own view 1024), the mrw as data', fetched.length === 2 && fetched.every(f => f.size === 1024) && fetched.find(f => /mrw/.test(f.url))?.data === true && fetched.find(f => /paint/.test(f.url))?.data === false && fetched[0].url.includes('?m=test-1'), JSON.stringify(fetched.map(f => [f.url, f.size, f.data])));
await tick(5); const e = T.texEntry('karambit', 'cs2k:aa_fade', 'fp'); let perFrame = []; for (let i = 0; i < 6 && e.state !== 'ready'; i++) { const n = uploads.length; T.pumpSkinTextures(); perFrame.push(uploads.length - n); }
for (let i = 0; i < 10 && e.state !== 'ready'; i++) await tick(20);
check('one texture to the GPU per frame (paint, then mrw)', perFrame.every(n => n <= 1) && uploads.length === 2, perFrame.join(','));
check('…the paint sRGB, the mrw no colour space, repeat wrap, flipY off (glTF UVs)', e.paint.colorSpace === THREE.SRGBColorSpace && e.mrw.colorSpace === THREE.NoColorSpace && e.paint.wrapS === THREE.RepeatWrapping && !e.paint.flipY);
check('pictures in: the knife switches to the CS2 bake (mode 3), its pictures bound, the vertex-colour mask off (the bake has the black handle), the skin\'s wear as given', U.uSkMode.value === 3 && U.uSkPaint.value === e.paint && U.uSkMRW.value === e.mrw && U.uSkinVC.value === 0 && U.uSkWear.value === .02, `mode ${U.uSkMode.value}`);
// shared by every holder at a tier; refcounts
const g = prepareModel((() => { const r = new THREE.Group(); r.add(new THREE.Mesh(new THREE.BoxGeometry(.2, .3, 3), Object.assign(new THREE.MeshStandardMaterial({ map: new THREE.Texture() }), { userData: { shared: true } }))); return r; })(), { model: 'ak', uv: 'cs2flip', tier: 'tp' });
const holders = Array.from({ length: 10 }, () => g.clone()), red = { finish: 'cs2:cu_ak47_cobra', fb: 'redline', wear: .3, seed: 1 };
for (const h of holders) skinObject(h, red); for (let i = 0; i < 40 && T.texEntry('ak', 'cs2:cu_ak47_cobra', 'tp').state !== 'ready'; i++) await tick(20);
const eA = T.texEntry('ak', 'cs2:cu_ak47_cobra', 'tp'), mat = holders[0].children[0].material, UA = mat.userData.skinU;
check('ten players with the same AK finish: one pair of textures at 512 (third person), one shared material, the .bin\'s flipped V', eA.state === 'ready' && eA.refs === 1 && holders.every(h => h.children[0].material === mat) && UA.uSkMode.value === 3 && UA.uSkFlip.value === 1 && fetched.filter(f => /ak\/a_/.test(f.url)).every(f => f.size === 512), `refs ${eA.refs} state ${eA.state}`);
for (const h of holders) unskinObject(h); check('all put away: the pair unreferenced (kept for reuse until the budget needs the room)', eA.refs === 0 && eA.state === 'ready');
// budget: never frees a referenced pair; never while live
const st0 = T.skinTexStats(); live = true; T.setSkinGate(() => !live); check('eviction never runs in a live round', T.evict(0) === 0 && T.skinTexStats().ready === st0.ready);
live = false; T.setSkinGate(() => !live); const n = T.evict(0); const st1 = T.skinTexStats();
check('over budget between rounds: the unreferenced pair freed, the knife you hold kept', n === 1 && e.state === 'ready' && e.refs === 1 && st1.ready === 1, `evicted ${n}, ready ${st1.ready}`);
// the knife put down (skin off): its reference released
applySkin([knife], null, false); check('skin off: the knife\'s reference released, back to its own look', e.refs === 0 && U.uSkinOn.value === 0 && U.uSkPaint.value.image?.width === 1);
check('memory accounted (RGBA + mips) and within the 128 MiB budget', st0.bytes > 0 && st0.bytes <= T.SKIN_BUDGET && T.SKIN_BUDGET === 128 * 1024 * 1024, `${(st0.bytes / 1048576).toFixed(1)} MiB`);
// no manifest (CI, a host without the import): nothing at all to fetch
T.resetSkinTextures(); await T.loadSkinManifest(false, null); check('no manifest: no entries, CS2 finishes fall back (texEntry null)', T.texEntry('ak', 'cs2:cu_ak47_cobra') === null && T.skinManifest() === null);
console.log(`${bad ? 'FAIL' : 'PASS'}: skin textures · ${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
