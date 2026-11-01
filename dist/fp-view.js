// First-person arms on the guns (Global Defensive): "FPS Character Animation Pack" AK-47, Pistol and SAPS-12 by
// Cristian David Duque Camacho (DuqueCD7, CC BY 4.0, dist/models/fp). Each pack is a pair of gloved arms animated on
// its gun: draw, idle, walk, run, fire, reload. The AK, the pistol and the shotgun are the packs' own guns; the other
// rifles, SMG and machine gun use the rifle arms with our model on the pack's weapon bone (the Desert Eagle the
// pistol arms). The rig looks along +z from just in front of its shoulders.
// Imported on this computer (user-assets, never shipped): CS2's gloves are worn on every pair of arms, and CS2's own
// first-person M4A1-S animations (cs2rifle) hold every rifle, sniper and machine gun.
import * as THREE from './three.module.js';
import { prepareSkins, applySkin, fitSkinned, fpLightTick } from './skin-render.js'; import { gloveLook, gloveType, gloveMaterial, onGloves, gloveFpTypes } from './glove-assets.js'; import { loadSkinManifest, skinFileURL } from './skin-textures.js';
import { gltfLoader } from './gltf-loader.js';
import { weaponModel, MUZZLE, VARIANTS, modelFromFile, registerModel, KNIFE_SKINS } from './weapon-models.js';
import { weaponById, CS_UNITS_PER_UNIT } from './weapons-data.js';
import { userAssets, userAssetURL } from './user-assets.js';
import { anisotropy } from './texture-quality.js';
import { FP_LIGHT } from './skin-render.js'; import { GRADE_U, GRADE_PARS } from './cs2-render.js'; import { fitImage, textureSize } from './texture-quality.js';   // (V: the CS2 arms lit and graded as the gun, their pictures at Settings' size)

const U = 1 / .165;   // metres → game units
// Per pack: model scale (the rifle pack is in metres, the others bigger), eye (rig units: height, forward, pitch),
// the pack's own weapon meshes (hidden when another gun is held) and the weapon bone our guns attach to.
const PACKS = {
  rifle: { url: 'rifle', k: 1, eye: [1.6 - .06, .2, 0], gun: /^(SK_AK-47|SM-CARGADOR)/, bone: /^DEF-Weapon/ },
  pistol: { url: 'pistol', k: 2.9, eye: [4.72 - .29, .64, 0], gun: /^Pistol_/, bone: /^DEF-Weapon/ },
  shotgun: { url: 'shotgun', k: 2.38, eye: [3.86 - .14, .24, 0], gun: /^SKM_Saps/, bone: /^DEF-Weapon/ },
  // CS2's own first-person rifle animations, imported on this computer (user-assets/fp/rifle.glb, never shipped): a
  // Rigify body holding the M4A1-S on weapon_hand_r — the hold (ref_pose), draw, inspect, reload and shots as in CS2.
  // When there, every rifle uses them (fpInfo). The eye: just above and ahead of the head bone; the arms CS2's length.
  cs2rifle: { user: 'rifle', k: 1, sleeve: { mat: /arms.v_$/, from: 'rifle/textures/M_Shirt_BlackCamo2' }, eye: [1.781 + .1, .025 + .08, 0], gun: /^m4a1/, bone: /^weapon_hand_r$/, arms: /^rence/, head: /^DEF-spine006$/, gloveMat: /arms.t_$/, fullArms: true, equipEnd: 1, fireEnd: .4,
    // Our guns on weapon_hand_r: CS2's view-model gun is drawn 1.22× real size; at this offset and scale our M4A1-S
    // lies exactly on the file's (measured), and every CS2 gun's origin is its grip. On the M4A1-S the left hand stays
    // where the animation puts it (native); on the others it goes onto their own handguard.
    attach: { at: [0, .44, .065], scale: 1.22 }, native: 'm4s', reach: -2.13, keepGrip: new Set(['aug']) },
};
// Grenades: the pistol arms moved forward (their shoulder sits behind the eye: the hand couldn't reach a grenade held
// out as far as CS2 holds it — it hung huge by the face, the grenade floating beyond), a little lower and right.
const NADE_VIEW = [.05, -.1, -1.3];
// Which pack holds which weapon; `own`: the pack's gun is that weapon (else ours is attached).
export const FP = { knife: { pack: 'pistol', onehand: true, fist: true, noLeft: true, view: [0, -.05, .1] }, karambit: { pack: 'pistol', onehand: true, fist: true, noLeft: true, view: [0, -.05, .1] }, he: { pack: 'pistol', onehand: true, noLeft: true, palm: true, fistK: .4, view: NADE_VIEW }, flash: { pack: 'pistol', onehand: true, noLeft: true, palm: true, fistK: .4, view: NADE_VIEW }, smoke: { pack: 'pistol', onehand: true, noLeft: true, palm: true, fistK: .4, view: NADE_VIEW }, molotov: { pack: 'pistol', onehand: true, noLeft: true, palm: true, fistK: .35, view: NADE_VIEW }, decoy: { pack: 'pistol', onehand: true, noLeft: true, palm: true, fistK: .4, view: NADE_VIEW }, incendiary: { pack: 'pistol', onehand: true, noLeft: true, palm: true, fistK: .4, view: NADE_VIEW },   /* (decoy, incendiary: cans like the smoke and flash, held the same way — only without CS2's own sets: user-assets/fp cs2_decoy / cs2_incendiary / cs2_aug, tools/cs2-fp/export_missing.py; fpFor takes a set first) */ c4: { pack: 'pistol', onehand: true, view: [-.05, -.1, .12] }, ak: { pack: 'rifle', own: true }, m4: { pack: 'rifle' }, sniper: { pack: 'rifle' }, smg: { pack: 'rifle' }, lmg: { pack: 'rifle' }, pistol: { pack: 'pistol', own: true }, deagle: { pack: 'pistol' }, shotgun: { pack: 'shotgun', own: true }, xm1014: { pack: 'shotgun', own: true } };   /* both shotguns use the shotgun arms' own gun in first person: its reload animation is made for it */
// How each pack's arms sit in view for guns, CS2-like (the packs were posed for another camera: the rifle swung in
// toward the crosshair, the pistol tipped up): a turn [pitch, yaw, roll] about the eye and a shift (game units),
// arms and gun together, so the grip never changes. Per-weapon view / viewRot (FP) still win.
export const PACK_VIEW = { rifle: { view: [.35, .05, -.424], rot: [.044, .193, -.223] }, pistol: { view: [.314, -.08, -.409], rot: [.048, .123, -.373] }, shotgun: { view: [.35, -.08, -.424], rot: [.044, .193, -.223] }, cs2rifle: { view: [.9, .55, -.9], rot: [0, 0, 0] } };   // (measured with aimView: barrel level toward the crosshair, the gun upright)
const GUN_KINDS = new Set(['pistol', 'smg', 'rifle', 'sniper', 'lmg', 'shotgun']);
// Our guns on the rifle / pistol weapon bone: offset (game units, in the weapon's own frame) and turn.
export const ATTACH = { p250: { at: [0, -.12, .18], scale: .62, lowPoly: true }, fiveseven: { at: [0, -.12, .18], scale: .62, lowPoly: true },   /* the low-poly pack's pistols: real pistol size in the hand (a CS2 model is real size already) */ knife: { at: [0, -.45, .1], rot: [1.2, 0, 0] }, karambit: { at: [0, -.4, .1], rot: [0, -1.57, 3.14], scale: 1.3 },   // karambit like CS2: ring on the index finger, blade curling up
   he: { at: [0, 0, 0], rot: [0, 0, 0], scale: 1.25 }, flash: { at: [0, 0, 0], rot: [0, 0, 0], scale: 1.25 }, smoke: { at: [0, 0, 0], rot: [0, 0, 0], scale: 1.1 }, molotov: { at: [0, 0, 0], rot: [0, 0, 0], scale: 1.1 }, decoy: { at: [0, 0, 0], rot: [0, 0, 0], scale: 1.1 }, incendiary: { at: [0, 0, 0], rot: [0, 0, 0], scale: 1.1 }, c4: { at: [0, 0, 0], rot: [0, .6, 0] }   /* the bomb lies on the palm, turned to show its face, low right: never over the crosshair */, ak: { at: [0, 0, -1.5] }, m4: { at: [0, -.15, -.6], rot: [0, 0, 0], scale: .7 }, sniper: { at: [0, -.15, -.7], rot: [0, 0, 0], scale: .7 }, smg: { at: [0, -.12, -.5], rot: [0, 0, 0], scale: .72 }, greasegun: { at: [0, -.12, -.5], rot: [0, 0, 0], scale: .72 }, suomi: { at: [0, -.15, -.55], rot: [0, 0, 0], scale: .7 }, lmg: { at: [0, -.15, -.6], rot: [0, 0, 0], scale: .7 },   /* our guns are real size; the pack's AK is ~0.7 of that: same scale, grip in the hand */ deagle: { at: [0, 0, 0], rot: [0, 0, 0] } };   // ak: only for its muzzle (the pack's AK lines up with ours there)
// Every gun gets arms: its own entry, else by kind (rifles, SMGs, snipers, the M249 on the rifle arms; pistols on the
// pistol arms; shotguns on the shotgun arms); grips follow the base model of a variant.
const KIND_FP = { rifle: { pack: 'rifle' }, smg: { pack: 'rifle' }, sniper: { pack: 'rifle' }, lmg: { pack: 'rifle' }, pistol: { pack: 'pistol' }, shotgun: { pack: 'shotgun' } };
const CS2_KINDS = new Set(['rifle', 'sniper', 'lmg']), cs2Info = new Map();
export const fpInfo = id => { const f = FP[id] || KIND_FP[weaponById(id)?.kind] || null; if (!f || !CS2_KINDS.has(weaponById(id)?.kind) || !ready.get('cs2rifle')) return f;   // (the CS2 rifle arms, when imported)
  if (!cs2Info.has(id)) cs2Info.set(id, { ...f, pack: 'cs2rifle', own: false }); return cs2Info.get(id); };
const attachInfo = id => ATTACH[id] || (VARIANTS[id]?.base === 'ak' ? ATTACH.m4 : ATTACH[VARIANTS[id]?.base]) || ATTACH[{ luger: 'deagle', pistol: 'deagle' }[VARIANTS[id]?.base]] || {};
// How a gun sits on the packs' weapon bone (a pack's own gun replaced by a CS2 model: as the M4A4 / Desert Eagle).
const packAttach = id => FP[id]?.own ? ATTACH[FP[id].pack === 'rifle' ? 'm4' : 'deagle'] || {} : attachInfo(id);
// …and on the CS2 rifle arms (P.attach): a CS2 model (its origin is its grip) as the M4A1-S lies; any other model moved
// from the packs' hold the way the M4A4 moves (the same grip in the hand, the same scale-up).
function cs2Attach(P, id, model) { if (modelFromFile(model) || modelFromFile(VARIANTS[model]?.base)) return P.attach;
  const ref = ATTACH.m4, o = packAttach(id), k = P.attach.scale / ref.scale, at = (o.at || [0, 0, 0]).map((v, i) => P.attach.at[i] + k * (v - ref.at[i]));
  return { at, rot: o.rot, scale: k * (o.scale || 1) }; }
// A depth measured on the packs' hold (SUPPORT_Z) on the CS2 rifle arms.
const cs2Z = (P, id, z) => { const o = packAttach(id), ref = ATTACH.m4; return modelFromFile(id) || modelFromFile(VARIANTS[id]?.base) ? P.attach.at[2] + P.attach.scale * (z - (o.at?.[2] || 0)) / (o.scale || 1) : P.attach.at[2] + P.attach.scale / ref.scale * (z - ref.at[2]); };

// The weapon bone's frame → a gun pointing along −z (set from the packs' own guns, see calibrate()).
// Knife twirl: the axis (in the hand's frame) and the pivot (the ring) the knife spins around while inspecting.
export const TWIRL = { axis: 'z', pivot: new THREE.Vector3(0, 0, 0) };
const twq = new THREE.Quaternion(), twq2 = new THREE.Quaternion(), twp = new THREE.Vector3(), twp2 = new THREE.Vector3(); let twirlA = 0; const handM = new THREE.Matrix4();
const BASE = { rifle: new THREE.Quaternion(), pistol: new THREE.Quaternion(), shotgun: new THREE.Quaternion() };
// Knives are gripped in a closed fist: each finger segment curls by these angles (after the animation).
// One-handed items: the left arm hangs relaxed (CS2 shows it open at the bottom left) — upper arm / forearm turns.
export const LEFT = { relaxed: true, upper: [-.5, 0, 1.2], fore: [0, .3, 0] };   // palm down, open, at the bottom left
export const FIST = { axis: 'x', sign: 1, angles: [1.0, 1.3, .9], thumb: [.3, .5, .4] };
export let PALM_OUT = .38;
// The grenade hand (root space ≈ view: x right, y up, z back; game units): the palm's centre, its facing, the knuckles'
// direction, the elbow's.
export const GRENADE_HOLD = { at: [.85, -.6, -.8], palm: [-1, .15, .1], knuckles: [-.15, .25, -1], elbow: [1, -1, .3] };   // CS2's hold: upright in the right hand at the lower right, the fingers round its side and front, fuse and lever on top export const PALM_OUT_SET = v => { PALM_OUT = v; };   // a grenade's centre off the palm (game units: about its radius)
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
const SUPPORT_PACKS = new Set(['rifle', 'shotgun', 'cs2rifle']);
// A pistol's grip base from its points (gun frame: muzzle −z, up +y): the lowest of its rear half, averaged with
// its neighbours (so one stray vertex doesn't decide).
function gripBase(pts) { if (pts.length < 10) return null; let z0 = Infinity, z1 = -Infinity; for (const q of pts) { z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); } const mid = (z0 + z1) / 2, rear = pts.filter(q => q.z > mid);
  if (!rear.length) return null; let lo = Infinity; for (const q of rear) lo = Math.min(lo, q.y); const near = rear.filter(q => q.y < lo + (z1 - z0) * .05), c = new THREE.Vector3(); for (const q of near) c.add(q); return c.multiplyScalar(1 / near.length); }
const loaded = new Map(), ready = new Map();   // pack name → promise · → built arms
function load(name) {
  if (loaded.has(name)) return loaded.get(name);   // (once: a second url promise would reject unheard without imported files)
  const P = PACKS[name], url = P.user ? userAssets().then(ua => { const v = ua.models.viewmodels?.[P.user]; if (!v) throw Error('none'); return userAssetURL(ua, v.file); }) : Promise.resolve(new URL('./models/fp/' + P.url + '/scene.gltf', import.meta.url).href);
  loaded.set(name, Promise.all([url.then(u => gltfLoader().loadAsync(u)), loadGlove()]).then(([g, glove]) => { const b = build(name, g, glove); ready.set(name, b); return b; }).catch(e => { if (e?.message !== 'none' && typeof window !== 'undefined') console.warn('first-person arms', name, e?.message); return null; }));
  return loaded.get(name);
}
export const loadFP = () => Promise.all([...Object.keys(PACKS).map(load), loadKarambit(), loadAuthored()]);

// First-person sets authored in Blender against CS2 reference video (user-assets/fp/cs2_<weapon>.glb, made on this
// computer, never shipped): CS2's own arms (its sport gloves, both teams' sleeves) and the gun with its moving parts,
// posed per clip — idle, draw, fire, reload, inspect — from the video's key poses, and the camera they were posed for
// (the game's view-model field of view). Played as they are: arms, fingers and gun parts all come from the clips; only
// a little walking bob and breathing are added.
const authored = new Map(); let authoredLoading = null;
// Loaded one at a time with a gap between (no long stall at start: each set is a parse and a few texture uploads):
// knives and the starting pistols first, a weapon asked for (wantFP) jumps the queue; the view swaps to a set when it
// arrives (onFPReady) — only once its shaders are built and its textures are on the GPU (one per frame). Nothing loads
// while a match is being played (holdFPLoads):
// menus, loading screens and buy time are enough — the arms already there serve until then.
const FIRST = ['knife', 'knife-t', 'karambit', 'butterfly', 'stiletto', 'm9', 'pistol', 'usps', 'he', 'flash', 'smoke', 'decoy', 'molotov', 'incendiary', 'c4', 'ak', 'm4', 'm4s', 'deagle', 'sniper', 'p250', 'galil', 'famas', 'mp9', 'mac10'], queue = [], readyFns = new Set(); let ctx = null, busy = false;   // (the utilities and what's bought most, first)
export const onFPReady = fn => { readyFns.add(fn); return () => readyFns.delete(fn); };
export function wantFP(id) { const i = queue.findIndex(q => q[0] === id); if (i > 0) queue.unshift(...queue.splice(i, 1)); }
let held = () => false;   // (lab.js: true while a match is being played — no loading then, not even a short stall)
export const holdFPLoads = fn => { held = fn; };
// Behind a loading card nothing is seen: no pacing (the sets load as fast as they parse — the arena's loading screen
// waits for them all, fpSetsReady, so a match never loads one while it is played; it used to load them in buy time:
// a 60–90 ms frame every half second there).
const behindCard = () => typeof document !== 'undefined' && document.getElementById('ar-load')?.hidden === false;
let drained = null;
// Every CS2 first-person set's root not in use (lab.js prewarmArena: all of them compiled behind the map's loading
// card as a match draws them — the C4 used to build its shader on being drawn at the plant, a 70–220 ms frame).
export const fpSetRoots = () => [...authored.values()].map(s => s.root);
export function fpSetsReady() { return drained ??= (() => { const p = loadAuthored().then(() => new Promise(res => { const chk = () => (!queue.length && !busy) ? res() : setTimeout(chk, 50); chk(); })).then(() => { p.done = true; }); p.done = false; return p; })(); }
const sent = new WeakMap();   // texture → its version when sent to the GPU
function pump() {
  if (busy || !queue.length || !ctx) return; if (held()) { setTimeout(pump, 400); return; } busy = true; const [id, v] = queue.shift();
  gltfLoader().loadAsync(userAssetURL(ctx.ua, v.file)).then(async g => { const set = buildAuthored(g, ctx.glove, id, ctx.arms, await knifeBase(id)), I = globalThis.__infra;
      await I?.gfx?.compileFor(set.root).catch(() => {});   // (its shaders built off the frame, for where a frame draws: graphics.js; in a match's own lights by the arena's warm-up, lab.js)
      for (const t of set.textures) { if (sent.get(t) === t.version) continue; while (held()) await new Promise(r => setTimeout(r, 400)); I?.renderer?.initTexture(t); if (I?.renderer) sent.set(t, t.version); if (!behindCard()) await new Promise(r => setTimeout(r, 16)); }   // (its textures on the GPU, one per frame, between plays; the shared ones — CS2 arms, glove — once, not a frame's wait per set: V)
      authored.set(id, set); for (const fn of readyFns) fn(id); })   // only now ready: its first showing costs nothing
    .catch(e => console.warn('first-person set', id, e?.message)).finally(() => { busy = false; setTimeout(pump, behindCard() ? 0 : 150); });
}
function loadAuthored() {
  return authoredLoading ??= Promise.all([userAssets(), loadGlove(), loadArms()]).then(([ua, glove, arms]) => { ctx = { ua, glove, arms };
    const sets = Object.entries(ua.models.viewmodels || {}).filter(([k]) => /^cs2_/.test(k)).map(([k, v]) => [k.slice(4), v]);
    sets.sort((a, b) => (FIRST.indexOf(a[0]) + 1 || 99) - (FIRST.indexOf(b[0]) + 1 || 99)); queue.push(...sets); pump(); }).catch(() => null);
}
// Sets share one glove material (the imported CS2 glove's; a set's own 'cs2_glove' slot carries no textures) and their
// textures go to the GPU as they load, so a weapon's first appearance costs nothing.
const FP_GUN_KINDS = new Set(['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'lmg']);
// Your own gun's reflections (PLAN §5.5): a studio light box made here, once — dark surroundings, a broad soft light
// above, a tall key to the left, a rim strip behind on the right, a grey floor and a horizon band: the light weapon
// pictures are shot in, so chrome and anodized finishes show bright and dark bands instead of a flat grey room.
// Prefiltered once at one size (PMREM 256: a set loading later never makes a program of its own).
// The star knives' CS2 base pictures (user-assets/skins base.<knife>: colour, and ORM = AO / rough / metal — made on the
// host by tools/import-cs2-skins.mjs, never shipped), loaded with the knife's set (before its shader is built). null:
// none (the set's own picture and gloss stay).
const kbases = new Map();
function knifeBase(id) {
  if (!['karambit', 'butterfly', 'm9', 'stiletto'].includes(id) || typeof createImageBitmap !== 'function') return Promise.resolve(null); if (kbases.has(id)) return kbases.get(id);
  const one = (rel, data) => fetch(skinFileURL(rel)).then(r => r.ok ? r.blob() : Promise.reject(Error(r.status + ' ' + rel))).then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: data ? 'none' : 'default' }))
    .then(img => { const t = new THREE.Texture(img); t.flipY = false; t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = anisotropy(); t.userData.shared = true; t.needsUpdate = true; return t; });
  const p = loadSkinManifest().then(man => { const b = man?.base?.[id]; return b?.color && b.orm ? Promise.all([one(b.color, false), one(b.orm, true)]).then(([color, orm]) => ({ color, orm })) : null; }).catch(e => { console.warn('knife base', id, e?.message); return null; });
  kbases.set(id, p); return p;
}
let fpEnvTex;
export function fpEnv() {
  if (fpEnvTex !== undefined) return fpEnvTex; const r = globalThis.__infra?.renderer; if (!r) return null;
  try { const s = new THREE.Scene(), box = (w, h, x, y, z, k, rx = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
    s.background = new THREE.Color(.035, .037, .04); box(9, 9, 0, 6, 0, 2.6, Math.PI / 2); box(3, 7, -6, 1, 1.5, 5, 0, Math.PI / 2); box(1.2, 8, 5.5, 1, -3, 4, 0, -Math.PI / 2.6); box(30, 30, 0, -4, 0, .16, -Math.PI / 2);   // (top softbox, key left, rim right-back, floor)
    const band = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 1.6, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(.45), side: THREE.BackSide })); band.position.y = .3; s.add(band);
    const pm = new THREE.PMREMGenerator(r); fpEnvTex = pm.fromScene(s, .02, .1, 100, { size: 256 }).texture; fpEnvTex.userData.shared = true; pm.dispose(); s.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
  catch (e) { console.warn('first-person reflections', e?.message); fpEnvTex = null; }
  return fpEnvTex;
}
// A star knife for third person, from its first-person set (there are no world models of them here): the knife's mesh
// skinned to the set's idle pose, laid in the game's knife convention — blade along −z (blade: its finish mask, red
// vertex colours; a set without that mask gets no third-person model (null) and others see the default knife — all four
// star knives carry one), the flat of the blade facing ±x, the guard (where the blade starts) at the
// origin. Its own material copy (the set's is painted with YOUR skin in first person), with the set's mask and pictures.
export function bakeKnife(sc, mixer, idle, id = '') {
  let src = null; sc.traverse(o => { if (!src && o.isSkinnedMesh && [].concat(o.material)[0]?.name === 'cs2_weapon') src = o; }); if (!src) return null;
  const a = idle && mixer.clipAction(idle); if (a) { a.play(); mixer.update(0); } let top = sc; while (top.parent) top = top.parent; top.updateMatrixWorld(true);   // (from the set's root: the view's frame, game units)
  const G = src.geometry, n = G.attributes.position.count, P = new Float32Array(n * 3), v = new THREE.Vector3(); for (let i = 0; i < n; i++) src.getVertexPosition(i, v).applyMatrix4(src.matrixWorld).toArray(P, i * 3); if (a) a.stop();
  const col = G.attributes.color, isBlade = i => col ? col.getX(i) > .3 : null, c0 = new THREE.Vector3(), c1 = new THREE.Vector3(); let k0 = 0, k1 = 0;
  const box = new THREE.Box3(); for (let i = 0; i < n; i++) box.expandByPoint(v.fromArray(P, i * 3)); const sz = box.getSize(new THREE.Vector3()).toArray(), ax = sz.indexOf(Math.max(...sz)), axis = new THREE.Vector3().setComponent(ax, 1);
  if (col) for (let i = 0; i < n; i++) { v.fromArray(P, i * 3); if (isBlade(i)) { c1.add(v); k1++; } else { c0.add(v); k0++; } }
  if (!k0 || !k1) return null; c1.multiplyScalar(1 / k1); c0.multiplyScalar(1 / k0); if (c1.clone().sub(c0).dot(axis) < 0) axis.negate();   // (along the length, toward the blade)
  let guard = Infinity; for (let i = 0; i < n; i++) if (isBlade(i)) guard = Math.min(guard, v.fromArray(P, i * 3).dot(axis));
  const thin = [0, 1, 2].filter(k => k !== ax).sort((p, q) => sz[p] - sz[q])[0], side = new THREE.Vector3().setComponent(thin, 1), up = new THREE.Vector3().crossVectors(axis, side);   // −z ← axis, +x ← side, +y = −z × x … (right-handed: x × y = z)
  const m = new THREE.Matrix4().makeBasis(side, up.negate(), axis.clone().negate()).invert(), o = c0.clone().addScaledVector(axis, guard - c0.dot(axis));   // world → knife frame; origin on the guard's plane through the handle's line
  const geo = new THREE.BufferGeometry(); for (let i = 0; i < n; i++) v.fromArray(P, i * 3).sub(o).applyMatrix4(m).toArray(P, i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); for (const name of ['uv', 'color']) if (G.attributes[name]) geo.setAttribute(name, G.attributes[name]); if (G.index) geo.setIndex(G.index); geo.computeVertexNormals(); geo.userData.shared = true;
  const mat = [].concat(src.material)[0].clone(); mat.userData = { shared: true }; mat.vertexColors = !!col; mat.envMapIntensity = .9; applySkin([mat], null, id === 'karambit');   // (no skin: its own finish as in first person — the karambit's Ruby, the others plain steel with black handles)
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; const g = new THREE.Group(); g.add(mesh); return g; }
// A knife without a finish mask (CS2's default CT / T knives: no vertex colours; the star knives carry one): the blade
// found from the mesh itself — along its long axis in 24 slices, a slice is blade where the knife is thin (under 40 %
// of its thickest slice: the guard and grip are fat, the blade a few millimetres) — as vertex colours a skin reads as
// its mask (skin-render.js skinMask: with no skin on, unused). Once, at load.
export function bladeMask(o) {
  const p = o.geometry.attributes.position, n = p.count, bb = (o.geometry.computeBoundingBox(), o.geometry.boundingBox), sz = bb.getSize(new THREE.Vector3()).toArray(), lo = bb.min.toArray();
  const ax = sz.indexOf(Math.max(...sz)), [a1, a2] = [0, 1, 2].filter(k => k !== ax), N = 24, mn = [], mx = [], slice = i => Math.min(N - 1, Math.floor((p.getComponent(i, ax) - lo[ax]) / (sz[ax] || 1) * N));
  for (let s = 0; s < N; s++) { mn.push([Infinity, Infinity]); mx.push([-Infinity, -Infinity]); }
  for (let i = 0; i < n; i++) { const s = slice(i); for (const [j, k] of [[0, a1], [1, a2]]) { const v = p.getComponent(i, k); if (v < mn[s][j]) mn[s][j] = v; if (v > mx[s][j]) mx[s][j] = v; } }
  const thick = mn.map((m, s) => Number.isFinite(m[0]) ? Math.min(mx[s][0] - m[0], mx[s][1] - m[1]) : 0), top = Math.max(...thick), blade = thick.map(t => t > 0 && t < top * .4);
  for (let s = 1; s < N - 1; s++) if (!blade[s] && blade[s - 1] && blade[s + 1]) blade[s] = true;   // (a lone fat slice inside the blade — a thumb notch, the spine's swage — is blade)
  const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.fill(blade[slice(i)] ? 1 : 0, i * 3, i * 3 + 3); o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const m of [].concat(o.material)) { m.vertexColors = true; m.userData.skinMask = true; m.needsUpdate = true; } return blade; }
export function buildAuthored(gltf, glove, id = '', arms = null, kbase = null) {   // (exported for tests/gd-fp-sets.mjs, gd-fp-gloves.mjs)
  const sc = gltf.scene, root = new THREE.Group(), fix = new THREE.Group(); root.add(fix); fix.add(sc); fix.matrixAutoUpdate = false;
  let cam = null, muzzle = null, hand = null; const sleeves = {}, textures = [], weaponMats = [];   // (weaponMats: the gun's or knife's own materials — a skin paints them, skin-render.js)
  sc.traverse(o => { if (o.isCamera && !cam) cam = o; if (o.name === 'muzzle') muzzle = o; if (o.isBone && /^hand_[rR]$/.test(o.name)) hand = o; if (/^sleeve_ctm/.test(o.name)) sleeves.ct = o; if (/^sleeve_tm/.test(o.name)) sleeves.t = o;
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; if (glove && o.material?.name === 'cs2_glove') { o.material.dispose(); o.material = leftHanded(o.geometry) ? leftGlove(glove.material) : glove.material; } else if (o.material?.name === 'cs2_sleeve') { o.material.dispose(); o.material = shirt(PACKS.cs2rifle.sleeve.from); }   // (the forearms in the black camo sleeve every other first-person view wears)
      for (const m of [].concat(o.material)) { m.userData.shared = true; if (m !== glove?.material && m !== leftGloveMat && m !== shirts.get(PACKS.cs2rifle.sleeve.from) && m.map && !/glove|sleeve|arm|hand/i.test(m.name || '') && !weaponMats.includes(m)) weaponMats.push(m); if (m !== glove?.material && m !== leftGloveMat && m !== shirts.get(PACKS.cs2rifle.sleeve.from)) m.envMapIntensity = .35; for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t && !textures.includes(t)) textures.push(t); } } });
  // The authoring camera becomes ours: its frame → the view's, inches (metres: sets built from CS2's own data, its
  // view-model offset in the camera's place) → game units; such sets also carry CS2's view-model field of view.
  sc.updateMatrixWorld(true); const u = (cam?.userData?.metres ? 39.3701 : 1) / CS_UNITS_PER_UNIT, vfov = cam?.userData?.vfov || 0;
  fix.matrix.makeScale(u, u, u).multiply(cam ? cam.matrixWorld.clone().invert() : new THREE.Matrix4()); cam?.removeFromParent();
  const mixer = new THREE.AnimationMixer(sc), clip = n => gltf.animations.find(a => a.name === n), now = () => performance.now();
  const twists = forearmTwists(sc);   // (KNIFE-diag: CS2's forearm twist bones, driven from the hand every update — forearmTwists below)
  for (const c of gltf.animations) { const a = mixer.clipAction(c); a.play(); mixer.update(0); a.stop(); }   // (every clip's bindings made now, while loading: a first draw or swing costs nothing)
  if (id === 'knife' || id === 'knife-t') sc.traverse(o => { if (o.isMesh && [].concat(o.material)[0]?.name === 'cs2_weapon' && !o.geometry.attributes.color) bladeMask(o); });   // (the default knives: a skin on the blade only — SKIN-1)
  if (KNIFE_SKINS[id] || id === 'karambit') { const k = bakeKnife(sc, mixer, clip('idle'), id); if (k) registerModel(id, k); }   // (the chosen star knife in other players' hands: TP-3)
  const worn = dressArms(sc, arms, textures);   // (CS2's own arms for each side, on this set's bones: V)
  { const an = anisotropy(); for (const t of textures) if (t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; } }   // (the shared glove's once)   // (Settings' texture filtering: the gun up close in the view, at a grazing angle, was sampled without it)
  // The muzzle: no set has a 'muzzle' node (all 37: the gun's bones are weapon, weapon_offset, slide / bolt, clip…), so
  // flashes and tracers started at the right wrist. For a gun: at load, in the idle pose, the centre of the gun mesh's
  // front end (its vertices within 1 cm of the one furthest along the view's −z, ≤ 4000 sampled), kept in the 'weapon'
  // bone's frame so it follows every clip (fire kick, reload, inspect). Knives, grenades and the bomb keep the hand.
  let tipBone = null; const tip = new THREE.Vector3();
  if (!muzzle && FP_GUN_KINDS.has(weaponById(id)?.kind)) { const idle = clip('idle'), a = idle && mixer.clipAction(idle); if (a) { a.play(); mixer.update(0); } root.updateMatrixWorld(true);
    sc.traverse(o => { if (o.isBone && o.name === 'weapon' && !tipBone) tipBone = o; }); const pts = [], v = new THREE.Vector3();
    sc.traverse(o => { if (!o.isMesh || [].concat(o.material)[0]?.name !== 'cs2_weapon') return; const n = o.geometry.attributes.position.count, step = Math.max(1, Math.ceil(n / 4000)); for (let i = 0; i < n; i += step) pts.push(o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).clone()); });
    if (tipBone && pts.length) { let z0 = Infinity; for (const p of pts) z0 = Math.min(z0, p.z); let k = 0; for (const p of pts) if (p.z < z0 + .06) { tip.add(p); k++; } tipBone.worldToLocal(tip.multiplyScalar(1 / k)); } else tipBone = null;
    if (a) a.stop(); }
  // Skins (skin-render.js): the gun's or knife's own materials take your skin — CS2's UV0 (imported finishes fit it),
  // tier 'fp' (1024 pictures, the map's light and grade), the pattern frame fitted in the idle pose — and their own
  // reflections (PLAN §5.5): a studio light box (fpEnv) at full strength, not the scene's dim room at .35 (which three.js
  // replaced by scene.environmentIntensity anyway): chrome, Doppler and Fade read as metal. Set now, never in play.
  { const idle = clip('idle'), a = idle && mixer.clipAction(idle); if (a) { a.play(); mixer.update(0); } root.updateMatrixWorld(true); const env = fpEnv();
    for (const m of weaponMats) { let best = null; sc.traverse(o => { if (o.isMesh && [].concat(o.material).includes(m) && (!best || o.geometry.attributes.position.count > best.geometry.attributes.position.count)) best = o; });
      if (kbase && m.name === 'cs2_weapon') { const old = m.map; m.map = kbase.color; m.roughnessMap = m.metalnessMap = m.aoMap = kbase.orm; m.roughness = m.metalness = 1; m.aoMapIntensity = 1; m.needsUpdate = true;   // (a star knife's CS2 base: its steel, rough and metal per texel — the handle matte, not the old pale picture at one gloss)
        const i = textures.indexOf(old); if (i >= 0) textures.splice(i, 1); textures.push(kbase.color, kbase.orm); }
      prepareSkins([m], { model: id, uv: 'cs2', tier: 'fp', M: best ? fitSkinned(best, root) : undefined, hasUv: !!best?.geometry.attributes.uv }); if (env) { m.envMap = env; m.envMapIntensity = 1; } }
    if (a) a.stop(); }
  let cur = null, until = 0, bobT = 0, bobA = 0, breathT = 0; const hm = new THREE.Matrix4();
  const play = (n, { once = false, fade = .12, ms = 0 } = {}) => { const c = clip(n); if (!c) return 0; const a = mixer.clipAction(c); a.reset(); a.enabled = true; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.timeScale = ms ? c.duration * 1000 / ms : 1;
    if (cur && cur !== a && fade > 0) a.crossFadeFrom(cur, fade, false); else if (cur && cur !== a) cur.stop(); a.play(); cur = a; return c.duration * 1000 / a.timeScale; };
  return {
    root, authored: true, vfov, textures, worn, weaponMats: (prepareSkins(weaponMats), weaponMats),
    // gloves: the holder's CS2 gloves (skins record 'gloves') or null — the agent's own; setGloves: a pick or files arriving.
    setGloves(gloves, team = 'ct') { return wearSide(worn, team, gloves || null); },
    hold(id, { draw = true, team = 'ct', gloves = null } = {}) { if (sleeves.ct) sleeves.ct.visible = team !== 't'; if (sleeves.t) sleeves.t.visible = team === 't'; wearSide(worn, team, gloves); until = draw && clip('draw') ? now() + play('draw', { once: true, fade: 0 }) : (play('idle', { fade: 0 }), 0); },
    fire() { if (cur === mixer.existingAction(clip('reload'))) return; until = now() + play('fire', { once: true, fade: .03 }); },
    // Knife swings: the set's own light / heavy clips (else its fire clip).
    swing(kind) { const n = clip(kind) ? kind : 'fire'; until = now() + play(n, { once: true, fade: .05 }); },
    // Grenades: the pin pulled (held at its end until thrown), then the throw (overhand; a short throw underhand).
    prime() { if (!clip('prime')) return this.fire(); play('prime', { once: true, fade: .08 }); until = Infinity; },
    throw(strength) { const n = strength === 'short' && clip('throwlow') ? 'throwlow' : 'throw'; until = clip(n) ? now() + play(n, { once: true, fade: .05 }) : 0; },
    // The bomb: planting.
    plant() { if (clip('plant')) until = now() + play('plant', { once: true, fade: .1 }); },
    reload(ms) { until = now() + play('reload', { once: true, fade: .1, ms }); },
    // A shotgun's shell-by-shell reload broken off by a shot (CS2): back to idle so the shot's own clip can play.
    stopReload() { if (cur === mixer.existingAction(clip('reload'))) { until = 0; play('idle', { fade: .08 }); } },
    inspect() { if (now() < until && cur !== mixer.existingAction(clip('fire'))) return 0; const ms = play('inspect', { once: true, fade: .15 }); until = now() + ms; return ms; },
    twirl() {},
    update(dt, speed = 0) {
      if (until && now() >= until) { until = 0; play('idle', { fade: .18 }); }
      mixer.update(dt); if (twists.length) forearmTwist(twists); fpLightTick(dt, root);   // (the map's light where you stand on your gun, a few times a second: skin-render.js) (forearmTwist: KNIFE-diag)
      // Restrained layers on top: a walking bob, and breathing.
      bobT += dt * Math.min(1, speed / 15) * 9; bobA += (Math.min(1, speed / 15) - bobA) * Math.min(1, dt * 8); breathT += dt;
      root.position.set(Math.sin(bobT) * .012 * bobA, -Math.abs(Math.cos(bobT)) * .01 * bobA + Math.sin(breathT * 1.6) * .0025, 0); root.updateMatrixWorld(true);
    },
    handIn(space, out) { space.updateMatrixWorld(true); return out.setFromMatrixPosition(hm.copy(space.matrixWorld).invert().multiply((hand || root).matrixWorld)); },
    muzzle(out) { root.updateMatrixWorld(true); return tipBone ? tipBone.localToWorld(out.copy(tip)) : (muzzle || hand || root).getWorldPosition(out); },
  };
}

// The karambit's own first-person model when one is imported on this computer (tools/import-cs2-models.mjs →
// Gloves imported on this computer (user-assets/fp/glove.glb: CS2's own, never shipped) are worn on every pack's arms
// in place of their black ones. CS2's glove is skinned to CS2's arm bones; each is matched to the rig's own (hand →
// DEF-hand, finger_index_0 → DEF-f_index01, finger_index_meta → DEF-palm01…) and its part of the glove carried over at
// both rest poses: the bone's start on the rig bone's start, along it to the next joint, turned about it by the way
// the palm faces, stretched to the rig bone's length (across: by the hands' size). Done once, on load: nothing per frame.
let gloveLoading = null;
// The left hand's glove (FP-2): CS2's gloves texture one hand; the other's UVs run 0 → −1 and the picture is read
// mirrored (MirroredRepeat), but three.js takes the normal map's sideways axis from the raw UVs' direction — on the
// left hand it ran the other way, so its stitching and folds were lit inside out. Its own copy of the glove material
// with the normal map's x turned round (shared by every set; the pictures are the same ones).
let leftGloveMat = null;
const leftGlove = m => { if (!leftGloveMat) { leftGloveMat = m.clone(); leftGloveMat.normalScale = m.normalScale.clone().multiply(new THREE.Vector2(-1, 1)); leftGloveMat.userData.shared = true; } return leftGloveMat; };
// A glove primitive textured on the mirrored half (u < 0 on average): the left hand.
export function leftHanded(geo) { const uv = geo.attributes.uv, ix = geo.index; if (!uv) return false; let s = 0; const n = ix ? ix.count : uv.count; for (let i = 0; i < n; i++) s += uv.getX(ix ? ix.getX(i) : i); return s / n < 0; }   // (the sets' primitives share one vertex list: the hand's own triangles decide)
function loadGlove() {
  return gloveLoading ??= userAssets().then(ua => { const v = ua.models.viewmodels?.glove; if (!v) return null;
    // (CS2's gloves are textured one hand; the other's UVs run from 0 to −1 — mirrored: both hands read the picture the
    // same way; with plain repeat one hand read the picture's empty half — the Sport Gloves' right hand plain grey)
    return gltfLoader().loadAsync(userAssetURL(ua, v.file)).then(g => { let m = null; g.scene.traverse(o => { if (!m && o.isSkinnedMesh) m = o; }); g.scene.updateMatrixWorld(true);
      for (const t of [m?.material?.map, m?.material?.normalMap]) if (t) { t.wrapS = THREE.MirroredRepeatWrapping; t.needsUpdate = true; } return fitTextures([m?.material?.map, m?.material?.normalMap]).then(() => m); }); }).catch(e => { console.warn('gloves', e?.message); return null; });   // (at Settings' texture size, as the CS2 arms: 2 × 2048² uploaded with every set)
}
// CS2's own first-person arms for each side (V; user-assets/fp-gloves/arms-*.glb from tools/export-fp-gloves.py, made
// on this computer from the CS2 install, never shipped): what CS2 draws for an agent without glove skins — CT (SAS) the
// black Hardknuckle gloves and SAS sleeves, T (Phoenix) the Full-finger gloves on bare forearms with rolled sleeves.
// The glove above (glove.glb) was a downloaded picture on the Driver Gloves mesh (CS2's own Driver Gloves are a composite
// material: their colour texture is a 4×4 placeholder) and the forearms the FPS pack's camo shirt, the same on both
// sides, with no AO or roughness map. These carry every CS2 map at CS2's resolution, laid out for glTF — base colour
// (sRGB), normal (+Y: Source 2's export, checked against the AO), ORM (AO · roughness = the normal map's alpha with the
// vmat's roughness adjust · metalness) — so GLTFLoader gives each its colour space. Same 52 arm bones at the same bind
// pose as the glove mesh in every set: each set binds them to its own skeleton (one bone texture, as before), the
// geometry and materials shared by all 37 sets (loaded once with the sets, uploaded with the first one, before any
// round). Every arm material has the same maps, so the T side's shader is the CT side's (no compile at a side swap).
// Outside Global Defensive (no side) the sets keep the glove above.
// Lit as the gun in the same view is (skin-render.js tier 'fp'): the gun's own reflections (fpEnv, S's studio box — set
// on these materials, else three.js swaps envMapIntensity for scene.environmentIntensity and ignores ARM_LOOK.env),
// the map's light where you stand (FP_LIGHT: .35 in a tunnel … 1.1 in sun; the arms stayed sunlit while the gun beside
// them went dark) and the map's colour grade (the gun graded, the gloves not: the black Hardknuckles read light grey).
// Per part: env = its share of that light box on leather, cloth and skin; albedo = the base colour's factor (skin:
// CS2 shades it with a diffuse warp and subsurface scattering and tone-maps with a roll-off — a sunlit forearm stays
// tan; here Lambert under linear tone mapping, bare_arm_133's light albedo clipped pale in Dust II's sun).
export const ARM_LOOK = { glove: { env: .5, albedo: 1 }, sleeve: { env: .4, albedo: 1 }, skin: { env: .45, albedo: .78 } };
const ARM_LIGHT = '#include <aomap_fragment>\n\treflectedLight.directDiffuse *= uArmLight; reflectedLight.directSpecular *= uArmLight; reflectedLight.indirectDiffuse *= uArmLight; reflectedLight.indirectSpecular *= uArmLight;';
const ARM_GRADE = '\tif (uGrade > 0.5) gl_FragColor.rgb = cs2Grade(gl_FragColor.rgb);\n#include <tonemapping_fragment>';
export function armsShader(sh) { Object.assign(sh.uniforms, { uArmLight: FP_LIGHT }, GRADE_U);   // (one function for every arm material: one program for CT and T; the uniforms are the shared objects — no per-frame upkeep)
  sh.fragmentShader = sh.fragmentShader.replace('void main() {', GRADE_PARS + 'uniform float uArmLight;\nvoid main() {').replace('#include <aomap_fragment>', ARM_LIGHT).replace('#include <tonemapping_fragment>', ARM_GRADE); }
const armsKey = () => 'cs2arms1';
function armsEnv(arms) { if (!arms || arms.env) return; const e = fpEnv(); if (!e) return; arms.env = e; for (const m of arms.materials) { m.envMap = e; m.needsUpdate = true; } }   // (before the first set's compile: a set's warm-up builds it with its reflections)
// Pictures at Settings → Texture quality (low 512, medium 1024, high 2048 — CS2's 2048² gloves were 148 MB with mips at
// any setting): made smaller once as they load, before any upload; data maps kept as they are (no premultiply, no colour conversion).
async function fitTextures(ts, size = textureSize()) {
  if (typeof createImageBitmap !== 'function') return; const done = new Map();
  for (const t of ts) { const img = t?.image, w = img?.width || 0, h = img?.height || 0; if (!w || !h || Math.max(w, h) <= size) continue;
    if (!done.has(img)) { const k = size / Math.max(w, h); try { done.set(img, await createImageBitmap(img, { resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(h * k)), resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })); } catch { done.set(img, img); } }
    const s = done.get(img); if (s !== img) { t.image = s; t.needsUpdate = true; } }
  for (const [img, s] of done) if (s !== img) img.close?.();
}
let armsLoading = null;
function loadArms() {
  return armsLoading ??= userAssets().then(ua => { const v = ua.models.fpGloves; if (!v) return null; return gltfLoader().loadAsync(userAssetURL(ua, v.file)).then(armsFrom).then(a => a && fitTextures(a.textures).then(() => a)); })
    .catch(e => { console.warn('first-person arms (CS2)', e?.message); return null; });
}
export function armsFrom(gltf) {   // (exported for tests/gd-fp-gloves.mjs)
  const out = { ct: [], t: [], bones: null, inverses: null, textures: [], materials: [] }, an = anisotropy();
  gltf.scene.traverse(o => { if (!o.isSkinnedMesh) return; let q = o; while (q && !/^(arms|sleeves)_(ct|t)$/.test(q.name)) q = q.parent; if (!q) return; const side = q.name.split('_')[1];
    if (!out.bones) { out.bones = o.skeleton.bones.map(b => b.name); out.inverses = o.skeleton.boneInverses; }
    o.name = q.name + '/' + (o.material.name || ''); o.geometry.userData.shared = true; out[side].push(o);
    const m = o.material; if (!out.materials.includes(m)) { out.materials.push(m); m.userData.shared = true; const L = ARM_LOOK[m.userData.part] || ARM_LOOK.glove; m.envMapIntensity = L.env; m.color.multiplyScalar(L.albedo); m.metalness = m.roughness = 1; m.onBeforeCompile = armsShader; m.customProgramCacheKey = armsKey;
      for (const t of [m.map, m.normalMap, m.aoMap, m.roughnessMap, m.metalnessMap]) if (t && !out.textures.includes(t)) { out.textures.push(t); t.anisotropy = an; } } });
  if (!(out.bones && out.ct.length && out.t.length)) return null; armsEnv(out); return out;
}
// The arms on a set: one skinned mesh per part and side on the set's own glove skeleton (the same bones in the same
// order: that skeleton itself), beside its glove; the set's glove and camo sleeves are kept for outside GD.
function dressArms(sc, arms, textures) {
  if (!arms) return null; armsEnv(arms); const legacy = []; sc.traverse(o => { if (o.isSkinnedMesh && o.skeleton?.getBoneByName('finger_thumb_0_L')) legacy.push(o); }); const ref = legacy[0]; if (!ref) return null;
  const sk = arms.bones.length === ref.skeleton.bones.length && arms.bones.every((n, i) => ref.skeleton.bones[i].name === n) ? ref.skeleton : new THREE.Skeleton(arms.bones.map(n => ref.skeleton.getBoneByName(n) || ref.skeleton.bones[0]), arms.inverses), worn = { legacy };
  for (const side of ['ct', 't']) { const g = worn[side] = new THREE.Group(); g.name = 'cs2_arms_' + side; g.visible = side === 'ct'; g.position.copy(ref.position); g.quaternion.copy(ref.quaternion); g.scale.copy(ref.scale); ref.parent.add(g);
    for (const tpl of arms[side]) { const m = new THREE.SkinnedMesh(tpl.geometry, tpl.material); m.name = tpl.name; m.frustumCulled = false; m.castShadow = m.receiveShadow = false; m.bind(sk, ref.bindMatrix); g.add(m); } }
  for (const t of arms.textures) if (!textures.includes(t)) textures.push(t);
  // CS2 gloves (glove-assets.js): the parts a chosen glove replaces — each side's own gloves and bare wrists in arms_<side>
  // (sleeves_<side> stays: the agent's sleeves, the T's rolled-up forearm) — and the glove types worn on this set so far.
  worn.ref = ref; worn.sk = sk; worn.arms = arms; worn.types = new Map(); worn.parts = { ct: [], t: [] }; worn.orig = new Map();
  for (const side of ['ct', 't']) for (const o of worn[side].children) if (/^arms_/.test(o.name) && /^(glove|skin)$/.test(o.material.userData.part)) { worn.parts[side].push(o); worn.orig.set(o, o.material); }
  dressGloveTypes(worn);
  return worn;
}
// ── CS2 gloves on the first-person arms (the player's pick: skins record 'gloves', glove-assets.js) ──
// Only the glove part of CS2's arms is swapped: the chosen type's glove_L + glove_R + its bare wrist ('skin', drawn with the
// arms' own bare_arm_133 material) on the set's own skeleton (the same 52 bones in the same order: that skeleton itself, as
// the arms), the agent's sleeves kept. One material per finish (and wear step), a copy of the CS2 arms' glove material —
// the same maps, the same shader hook and program key (armsShader, 'cs2arms1'), the same reflections: no shader is built
// for a glove, before or during a round. Its pictures arrive under the skin gates (never mid-round); until they do, the
// finish's 1×1 fallback set (the same maps: the same shader). A type whose meshes are not in yet: the agent's own gloves
// tinted with the finish's fallback colour (a copy of that material: the same shader).
const fpGloveTypes = new Set();   // (types some view asked for: sets loading later are dressed with them at build)
// Every type worn so far or wanted at 'fp' (glove-assets prefetch: yours and your team mates'), built on a set (hidden).
function dressGloveTypes(worn) { for (const S of [fpGloveTypes, gloveFpTypes()]) for (const ty of S) { const T = gloveType(ty); if (T?.state === 'ready') gloveGroup(worn, T); } }
function gloveGroup(worn, T) {
  let g = worn.types.get(T.type); if (g) return g; const ref = worn.ref, hook = worn.ct.children[0];
  const sk = T.bones.length === worn.sk.bones.length && T.bones.every((n, i) => worn.sk.bones[i].name === n) ? worn.sk : new THREE.Skeleton(T.bones.map(n => ref.skeleton.getBoneByName(n) || ref.skeleton.bones[0]), T.inverses);
  g = new THREE.Group(); g.name = 'cs2_gloves_' + T.type; g.visible = false; g.position.copy(ref.position); g.quaternion.copy(ref.quaternion); g.scale.copy(ref.scale); ref.parent.add(g);
  const skinMat = worn.arms.materials.find(m => m.userData.part === 'skin') || worn.arms.materials[0];
  for (const n of ['glove_L', 'glove_R', 'skin']) { const tpl = T.meshes[n]; if (!tpl) continue; const m = new THREE.SkinnedMesh(tpl.geometry, n === 'skin' ? skinMat : worn.orig.values().next().value); m.name = 'cs2_gloves/' + n; m.userData.glovePart = n === 'skin' ? 'skin' : 'glove';
    m.frustumCulled = false; m.castShadow = m.receiveShadow = false; if (hook?.onBeforeRender) { m.onBeforeRender = hook.onBeforeRender; m.onAfterRender = hook.onAfterRender; } m.bind(sk, ref.bindMatrix); g.add(m); }   // (on top of the world as the arms are: weapons.js onTop)
  worn.types.set(T.type, g); return g;
}
// The first-person glove material of a finish (its real pictures, or the 1×1 fallback set while they load).
const armsGloveMat = arms => arms.materials.find(m => m.userData.part === 'glove') || arms.materials[0];
export function fpGloveMat(arms, L) {
  const src = L.tex?.state === 'ready' && L.tex.tex?.orm ? L.tex : L.fb; if (!src) return null;
  return gloveMaterial(src, 'fp', tx => { const m = armsGloveMat(arms).clone(); m.name = 'cs2g_' + L.kit; m.map = tx.color; m.normalMap = tx.normal; m.aoMap = m.roughnessMap = m.metalnessMap = tx.orm; m.color.setScalar(ARM_LOOK.glove.albedo); m.roughness = m.metalness = 1; m.envMapIntensity = ARM_LOOK.glove.env;
    m.onBeforeCompile = armsShader; m.customProgramCacheKey = armsKey; m.userData = { shared: true, part: 'glove', kit: L.kit }; m.needsUpdate = true; return m; });
}
const tintMat = (orig, L) => gloveMaterial(L.fb, 'tint:' + orig.uuid, () => { const m = orig.clone(); m.color.set(L.fb.color); m.onBeforeCompile = orig.onBeforeCompile; m.customProgramCacheKey = orig.customProgramCacheKey; m.userData = { shared: true, part: 'glove', tint: L.kit }; return m; });
// A side shown (hold): GD's 'ct' / 't' wear their CS2 arms; no side (other modes) the set's own glove.
// gl: the player's gloves (skins record 'gloves': { finish: 'cs2g:<kit>', wear }) or null — the agent's own. Run on a hold,
// a pick and when glove files arrive (gloveVersion): never per frame. → what is shown: 'agent' | 'glove' | 'fallback' | 'tint' | 'legacy'.
function wearSide(worn, team, gl = null) { if (!worn) return 'none'; const s = team === 'ct' || team === 't' ? team : null; for (const o of worn.legacy) o.visible = !s; worn.ct.visible = s === 'ct'; worn.t.visible = s === 't';
  if (!worn.parts) return s ? 'agent' : 'legacy'; const L = s && gl ? gloveLook(gl, 'fp') : null; if (L) fpGloveTypes.add(L.f.type);
  const grp = L && L.type?.state === 'ready' ? gloveGroup(worn, L.type) : null, mat = grp ? fpGloveMat(worn.arms, L) : null;
  for (const g of worn.types.values()) g.visible = g === grp && !!mat;
  if (grp && mat) for (const o of grp.children) if (o.userData.glovePart === 'glove') o.material = mat;
  for (const side of ['ct', 't']) for (const o of worn.parts[side]) { const on = side === s, orig = worn.orig.get(o); o.visible = !(on && grp && mat); o.material = on && L && !grp && orig.userData.part === 'glove' ? tintMat(orig, L) : orig; }
  worn.shows = !s ? 'legacy' : !L ? 'agent' : grp && mat ? (mat.userData.kit && L.tex?.state === 'ready' ? 'glove' : 'fallback') : 'tint'; return worn.shows; }
// Sets loaded before a type's meshes arrived: dressed when they do (off the frame: glove-assets' load, under its gates).
onGloves(() => { for (const set of authored.values()) if (set.worn?.types) dressGloveTypes(set.worn); });
// ── CS2's forearm twist (KNIFE-diag; user report: the arms looked broken in a knife's slash and stab) ──
// CS2 does not animate the forearm's twist bones: its arms model (glove_slick.vmdl_c, BoneConstraintList, read with
// Source 2 Viewer) drives them with tilt-twist constraints — arm_lower_<s>_TWIST1 takes all of the hand's twist about
// its x axis, arm_lower_<s>_TWIST half, the hand's rotation measured from m_qOffset (the same on both sides). The
// exported clips hold them at the bind pose, so a hand turned over (a knife's swing: up to ~110°; a gun's idle ~15°)
// wrung the forearm at the wrist (CS2's arms and sleeves are weighted almost all to TWIST1): a pinched, twisted wrist.
// Checked on the bind pose: these rules give the bones' bind twist exactly (TWIST1 1.40°, TWIST 0.70°). (The upper
// arm's twist bones carry almost no weight here: left to the clips.) Every set's own skeleton, so the CS2 arms, the
// legacy glove and the glove picks all follow. Per update, after the mixer; no allocation.
export const CS2_HAND_TWIST_OFFSET = Object.freeze([0.684638, -0.0025270376, 0.03596654, 0.72799087]);
const handOffInv = new THREE.Quaternion(...CS2_HAND_TWIST_OFFSET).invert(), twQ = new THREE.Quaternion();
// → [hand, TWIST, TWIST1, …] per side whose three bones share arm_lower as parent (CS2-data sets; [] for the packs).
export function forearmTwists(sc) { const out = [], by = {}; sc.traverse(o => { if (o.isBone && /^(hand|arm_lower)_[LR](_TWIST1?)?$/.test(o.name)) by[o.name] ??= o; });
  for (const s of ['L', 'R']) { const h = by['hand_' + s], a = by['arm_lower_' + s + '_TWIST'], b = by['arm_lower_' + s + '_TWIST1']; if (h && a && b && h.parent === a.parent && a.parent === b.parent) out.push(h, a, b); } return out; }
export function forearmTwist(tw) { for (let i = 0; i < tw.length; i += 3) { twQ.copy(handOffInv).multiply(tw[i].quaternion); let x = twQ.x, w = twQ.w; const n = Math.hypot(x, w);
  if (n < 1e-6) { x = 0; w = 1; } else { x /= n; w /= n; if (w < 0) { x = -x; w = -w; } }   // (the twist about x, the short way round)
  tw[i + 2].quaternion.set(x, 0, 0, w); const h = Math.sqrt(.5 * (1 + w)); tw[i + 1].quaternion.set(x / (2 * h), 0, 0, h); } }   // (TWIST1 all of it, TWIST half: cos θ/4 = √((1 + cos θ/2) / 2))
const FINGERS =['index', 'middle', 'ring', 'pinky'];
// CS2's own hand, measured in Blender on the CS2 arms rig imported on this computer (CS2_MultiRig: Valve's arms and
// gloves on one rig, the same proportions as CS:GO's karambit arms): each finger's knuckle → last joint over the hand's
// size (wrist → middle knuckle), and the hand's size over the forearm (elbow → wrist).
export const CS2_FINGER = { thumb: .647, index: .647, middle: .734, ring: .683, pinky: .476 }, CS2_HAND = .368;
// The rigs it goes on: the packs' (Rigify: DEF-hand, DEF-palm01…, DEF-f_index01…) and the karambit's (CS:GO's Biped:
// Bip01_L_Hand, Finger0 the thumb … Finger4 the little finger, each finger's base on the hand: no palm bones).
const RIG_NAMES = {
  rigify: { up: sd => 'DEF-upper_arm' + sd + '_', up1: sd => 'DEF-upper_arm' + sd + '001', fore: sd => 'DEF-forearm' + sd + '_', fore1: sd => 'DEF-forearm' + sd + '001', hand: sd => 'DEF-hand' + sd + '_',
    meta: (f, sd) => 'DEF-palm0' + (FINGERS.indexOf(f) + 1) + sd + '_', finger: (f, k, sd) => (f === 'thumb' ? 'DEF-thumb0' : 'DEF-f_' + f + '0') + (k + 1) + sd + '_' },
  biped: { up: sd => 'v_weaponBip01_' + sd + '_UpperArm', up1: sd => 'v_weaponBip01_' + sd + '_UpperArm', fore: sd => 'v_weaponBip01_' + sd + '_Forearm', fore1: sd => 'v_weaponBip01_' + sd + '_ForeTwist', hand: sd => 'v_weaponBip01_' + sd + '_Hand',
    meta: (f, sd) => 'v_weaponBip01_' + sd + '_Hand', finger: (f, k, sd) => 'v_weaponBip01_' + sd + '_Finger' + (f === 'thumb' ? 0 : FINGERS.indexOf(f) + 1) + (k ? k : '') },
};
// CS2 glove bone → [rig bone, the joint it runs to (CS2 · rig); none: on past its end].
function gloveBoneMap(R) {
  const M = new Map();
  for (const sd of ['L', 'R']) {
    const up = [R.up(sd), 'arm_lower_' + sd, R.fore(sd)], up1 = [R.up1(sd), ...up.slice(1)], lo = [R.fore(sd), 'hand_' + sd, R.hand(sd)], lo1 = [R.fore1(sd), ...lo.slice(1)];
    M.set('arm_upper_' + sd, up); M.set('arm_upper_' + sd + '_TWIST', up); M.set('arm_upper_' + sd + '_TWIST1', up1);
    M.set('arm_lower_' + sd, lo); M.set('arm_lower_' + sd + '_TWIST', lo); M.set('arm_lower_' + sd + '_TWIST1', lo1);
    M.set('hand_' + sd, [R.hand(sd), 'finger_middle_0_' + sd, R.finger('middle', 0, sd)]);
    for (const f of FINGERS) M.set('finger_' + f + '_meta_' + sd, [R.meta(f, sd), 'finger_' + f + '_0_' + sd, R.finger(f, 0, sd)]);
    for (const f of [...FINGERS, 'thumb']) for (let k = 0; k < 3; k++) M.set('finger_' + f + '_' + k + '_' + sd, [R.finger(f, k, sd), k < 2 ? 'finger_' + f + '_' + (k + 1) + '_' + sd : null, k < 2 ? R.finger(f, k + 1, sd) : null]);
  }
  return M;
}
// The glove on a rig's arms: a skinned mesh on its bones (`rigSkin`: one of the rig's own skinned meshes).
export function wearGlove(src, rigSkin) {
  const GS = src.skeleton, RS = rigSkin.skeleton, R = RS.bones.some(b => b.name.startsWith('DEF-hand')) ? RIG_NAMES.rigify : RIG_NAMES.biped, MAP = gloveBoneMap(R);
  const gi = new Map(GS.bones.map((b, i) => [b.name, i])), rigIdx = pre => { for (const n of [pre, pre.replace(/_$/, '')]) { const i = RS.bones.findIndex(b => b.name === n); if (i >= 0) return i; } return RS.bones.findIndex(b => b.name.startsWith(pre)); };   // (Rigify names with or without three.js' numbered suffix)
  const gW = i => new THREE.Matrix4().copy(GS.boneInverses[i]).invert(), rW = j => new THREE.Matrix4().copy(RS.boneInverses[j]).invert();   // each bone at rest (bind)
  const gP = n => gi.has(n) ? new THREE.Vector3().setFromMatrixPosition(gW(gi.get(n))) : null, rP = pre => { const j = rigIdx(pre); return j < 0 ? null : new THREE.Vector3().setFromMatrixPosition(rW(j)); };
  // Per hand: which way the palm faces, and the hand's size (wrist → middle knuckle), in each rig.
  const side = {}; for (const sd of ['L', 'R']) { const pal = (P, h, i, m, p) => { const H = P(h), I = P(i), Mi = P(m), Pi = P(p); return H && I && Mi && Pi ? { n: new THREE.Vector3().subVectors(I, Pi).cross(new THREE.Vector3().subVectors(Mi, H)).normalize(), size: Mi.distanceTo(H) } : null; };
    side[sd] = { g: pal(gP, 'hand_' + sd, 'finger_index_0_' + sd, 'finger_middle_0_' + sd, 'finger_pinky_0_' + sd), r: pal(rP, R.hand(sd), R.finger('index', 0, sd), R.finger('middle', 0, sd), R.finger('pinky', 0, sd)) }; }
  if (!side.L.g || !side.L.r || !side.R.g || !side.R.r) return null;
  // Each glove finger as thick as CS2's is for that finger's length on this rig (the rigs' fingers are shorter for
  // their hands than CS2's: thickness from the hand's size alone made them fat), the palm by the hand's size.
  for (const sd of ['L', 'R']) { side[sd].f = {}; for (const f of ['thumb', ...FINGERS]) { const a = rP(R.finger(f, 0, sd)), b = rP(R.finger(f, 1, sd)), c = rP(R.finger(f, 2, sd));
    side[sd].f[f] = a && b && c ? Math.min(side[sd].r.size, (a.distanceTo(b) + b.distanceTo(c)) / CS2_FINGER[f]) : side[sd].r.size; } }
  const frame = (head, tail, n) => { const x = tail.clone().sub(head).normalize(), z = n.clone().addScaledVector(x, -n.dot(x)); if (z.lengthSq() < 1e-8) z.set(x.y, -x.x, 0); z.normalize(); return new THREE.Matrix4().makeBasis(x, z.clone().cross(x), z).setPosition(head); };
  const bones = [], inverses = [], A = new Map();
  GS.bones.forEach((b, i) => { const m = MAP.get(b.name), sd = /_([LR])(_TWIST1?)?$/.exec(b.name)?.[1], j = m ? rigIdx(m[0]) : -1;
    if (!m || j < 0 || !sd) return; const S = side[sd], gh = gP(b.name), rh = rW(j).elements, rH = new THREE.Vector3(rh[12], rh[13], rh[14]);
    let gt = m[1] && gP(m[1]), rt = m[2] && rP(m[2]);
    if (!gt || !rt) { const gp = gP(b.parent?.name), j2 = RS.bones.indexOf(RS.bones[j].parent), rp = gp && j2 >= 0 ? new THREE.Vector3().setFromMatrixPosition(rW(j2)) : null;   // the last joint: on past it as far as the one before is long, ×0.8
      if (!gp || !rp) return; gt = gh.clone().addScaledVector(gh.clone().sub(gp), .8); rt = rH.clone().addScaledVector(rH.clone().sub(rp), .8); }
    if (/_meta_/.test(b.name) && m[0] === R.hand(sd)) { const g0 = gP('hand_' + sd); rH.lerp(rt, g0.distanceTo(gh) / Math.max(1e-6, g0.distanceTo(gt))); }   // (no palm bones: the knuckle's bone starts as far along the hand)
    const fm = /^finger_(thumb|index|middle|ring|pinky)_\d_/.exec(b.name), along = rt.distanceTo(rH) / Math.max(1e-6, gt.distanceTo(gh)), across = (fm ? S.f[fm[1]] : S.r.size) / S.g.size;
    A.set(i, [j, frame(rH, rt, S.r.n).multiply(new THREE.Matrix4().makeScale(along, across, across)).multiply(frame(gh, gt, S.g.n).invert())]); });
  // Bones not matched (the file's root): as their nearest matched parent.
  GS.bones.forEach((b, i) => { let k = i, q = b; while (!A.has(k) && q) { q = q.parent; k = q ? gi.get(q.name) ?? -1 : -1; } const [j, Ai] = A.get(k) || A.get(gi.get('hand_L')) || [...A.values()][0];
    bones.push(RS.bones[j]); inverses.push(new THREE.Matrix4().copy(RS.boneInverses[j]).multiply(Ai).multiply(src.bindMatrix)); });
  const mesh = new THREE.SkinnedMesh(src.geometry, src.material); mesh.name = 'gloves'; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  for (const m of [].concat(mesh.material)) { m.userData.shared = true; m.envMapIntensity = .2; }
  return mesh;
}

// The packs' black camo shirt (dist/models/fp/<from>_*.jpg): the sleeves on arms that come bare. One material, shared.
const shirts = new Map();
function shirt(from) {
  if (shirts.has(from)) return shirts.get(from);
  const T = n => { const t = new THREE.TextureLoader().load(new URL('./models/fp/' + from + '_' + n + '.jpg', import.meta.url).href); t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (n === 'baseColor') t.colorSpace = THREE.SRGBColorSpace; return t; };
  const m = new THREE.MeshStandardMaterial({ map: T('baseColor'), normalMap: T('normal'), roughness: .9, metalness: 0, envMapIntensity: .2 }); m.userData.shared = true; shirts.set(from, m); return m;
}

// user-assets/fp/karambit.glb, never shipped: CS:GO's view model — arms in sport gloves, the knife in the right hand,
// ring on the index finger). It replaces the pistol arms for the karambit. Posed, not animated: weapons.js swings and
// turns the whole view round the hand (handIn) and the inspect spins the knife on its ring (twirl). The file comes
// untextured: its bare forearms get the packs' black camo sleeves (as every other weapon's arms), dark sport gloves
// and a Fade blade (purple → pink → gold along it) are painted here.
// KARAMBIT: model units → game units, and the eye in model units (between and above the shoulders, looking along +z).
export const KARAMBIT = { scale: .0076, eye: [-70, 360, -900], forearm: .9, blade: 1.35, left: [-100, 20, 0] };   // forearm: their length (the model's reach far out); eye: the hand at the lower right, the whole knife in view; blade: the knife's size (at its own the fist hid all but the tip); left: the left arm moved in (model units), its hand at the lower left
let karambitRig = null, karambitLoading = null;
function loadKarambit() {
  return karambitLoading ??= userAssets().then(ua => { const v = ua.models.viewmodels?.karambit; if (!v) return null;
    return Promise.all([gltfLoader().loadAsync(userAssetURL(ua, v.file)), loadGlove()]).then(([g, gl]) => { karambitRig = buildKarambit(g.scene, gl); return karambitRig; }); }).catch(e => { console.warn('karambit view model', e?.message); return null; });
}
function buildKarambit(sc, gloveSrc) {
  const root = new THREE.Group(), fix = new THREE.Group(); root.add(fix); fix.add(sc); fix.rotation.y = Math.PI; fix.scale.setScalar(KARAMBIT.scale); sc.position.set(-KARAMBIT.eye[0], -KARAMBIT.eye[1], -KARAMBIT.eye[2]);
  const bones = {}; sc.traverse(o => { if (o.isBone) bones[o.name.replace(/^v_weapon/, '')] = o; });
  // The knife rides on the right hand (in the file it hangs off the rig's root, placed by animations we don't have);
  // then shorter forearms: the hands closer in along them, the knife with them.
  sc.updateMatrixWorld(true); if (bones.knife && bones.Bip01_R_Hand) bones.Bip01_R_Hand.attach(bones.knife);
  for (const s2 of ['L', 'R']) bones[`Bip01_${s2}_Hand`]?.position.multiplyScalar(KARAMBIT.forearm);
  const LC = bones.Bip01_L_Clavicle; if (LC) { sc.updateMatrixWorld(true); const a = sc.worldToLocal(LC.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(...KARAMBIT.left)); LC.position.copy(LC.parent.worldToLocal(sc.localToWorld(a))); }
  const skin = shirt(PACKS.cs2rifle.sleeve.from), glove = new THREE.MeshStandardMaterial({ color: 0x2b313b, roughness: .78, metalness: 0 });
  const blade = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .22, metalness: .9, envMapIntensity: 1.1 });
  for (const m of [glove, blade]) m.userData.shared = true;
  sc.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
    o.material = [].concat(o.material).map(m => /^knife:/.test(m.name) ? blade : /^skin:/.test(m.name) ? skin : glove); if (o.material.length === 1) o.material = o.material[0];
    if (/knife/i.test(o.name)) fade(o); });
  // Imported gloves (as on the packs' arms): in place of its own.
  if (gloveSrc) { let arms = null; sc.traverse(o => { if (!arms && o.isSkinnedMesh && [].concat(o.material).includes(glove)) arms = o; }); const g = arms && wearGlove(gloveSrc, arms); if (g) { arms.parent.add(g); glove.visible = false; } }
  const hand = bones.Bip01_R_Hand, ring = bones.Bip01_R_Finger11 || bones.Bip01_R_Finger1 || hand, finger = bones.Bip01_R_Finger1 || hand, knife = bones.knife;
  // The knife bigger (KARAMBIT.blade) about the ring on the index finger, so it stays where it sits in the hand.
  if (knife && ring !== hand) { sc.updateMatrixWorld(true); const piv = knife.parent.worldToLocal(ring.getWorldPosition(new THREE.Vector3())); knife.position.sub(piv).multiplyScalar(KARAMBIT.blade).add(piv); knife.scale.multiplyScalar(KARAMBIT.blade); }
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
function build(name, gltf, glove) {
  const P = PACKS[name], sc = gltf.scene, root = new THREE.Group(), fix = new THREE.Group(), rig = new THREE.Group(); root.add(fix); fix.add(rig); rig.add(sc); fix.matrixAutoUpdate = false;
  // Rig units → game units, turned to look along −z, the eye at the camera.
  const s = U / P.k; rig.scale.setScalar(s); rig.rotation.set(P.eye[2], Math.PI, 0); sc.position.set(0, -P.eye[0], -P.eye[1]);
  // The arms live under SK_Comando (fabric: no metal shine, so they stay black under the arena's bright sky);
  // every other mesh is the gun.
  const gunMeshes = []; let bone = null;
  sc.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; for (const m of [].concat(o.material)) m.userData.shared = true; let arm = false; for (let q = o; q; q = q.parent) if ((P.arms || /^SK_Comando/).test(q.name)) arm = true; if (!arm) gunMeshes.push(o); else for (const m of [].concat(o.material)) { m.metalness = 0; m.metalnessMap = null; m.envMapIntensity = .2; m.color.multiplyScalar(.8); m.needsUpdate = true; } } if (o.isBone && !bone && P.bone.test(o.name)) bone = o; });
  // CS2's bare arms (P.sleeve) in the packs' black camo shirt, as every other gun's arms.
  if (P.sleeve) sc.traverse(o => { if (o.isMesh && !Array.isArray(o.material) && P.sleeve.mat.test(o.material.name)) o.material = shirt(P.sleeve.from); });
  // Imported gloves on these arms, in place of the pack's black ones.
  if (glove) { const own = []; sc.traverse(o => { if (o.isSkinnedMesh && [].concat(o.material).some(m => (P.gloveMat || /glove/i).test(m.name))) own.push(o); }); const g = own[0] && wearGlove(glove, own[0]); if (g) { own[0].parent.add(g); for (const o of own) o.visible = false; } }
  const clip = re => gltf.animations.find(a => re.test(a.name.replace(/^RIG_UE5_Comando_/, '').replace(/^AK_+/, '')));
  const A = { equip: clip(/^Equip$/), idle: clip(/^Idle$/), walk: clip(/^Walk$/), run: clip(/^_?Run$/), fire: clip(/^Fire$/), reload: clip(/^Reload$/), toReload: clip(/^IdleToReload$/), fromReload: clip(/^ReloadToIdle$/) };
  // CS2's clips: the hold is a single pose (ref_pose), the draw the first part of Equip (the rest is the first-draw
  // charging-handle pull), a shot the first part of Shots; Inspect as it is.
  if (!A.idle && clip(/^ref_pose$/)) { A.idle = clip(/^ref_pose$/); A.idle.duration = Math.max(A.idle.duration, 1); }
  A.inspect = clip(/^Inspect$/); if (A.equip && P.equipEnd) A.equip = THREE.AnimationUtils.subclip(A.equip, 'equip', 0, Math.round(P.equipEnd * 30), 30);
  if (!A.fire && P.fireEnd && clip(/^Shots$/)) A.fire = THREE.AnimationUtils.subclip(clip(/^Shots$/), 'fire', 0, Math.round(P.fireEnd * 30), 30);
  const mixer = new THREE.AnimationMixer(sc), act = k => A[k] && mixer.clipAction(A[k]);
  // three.js writes an animated value to its bone only when it differs from the frame before; the arms are reset, bent
  // and curled after the mixer every frame, so a still pose (CS2's hold, the end of a clip) would stop being
  // re-applied and those changes pile up. Both of each binding's last results are marked stale first: always applied.
  const freshMix = () => { const B = mixer._bindings; for (let i = 0, n = mixer._nActiveBindings; i < n; i++) { const b = B[i], k = b.valueSize; b.buffer[k] = b.buffer[k * 2] = NaN; } };
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
  const fingers = []; sc.traverse(o => { const m = o.isBone && /^DEF-(f_(index|middle|ring|pinky)|thumb)0([123])R(_|$)/.exec(o.name); if (m) fingers.push({ b: o, seg: +m[3] - 1, thumb: m[1] === 'thumb' }); }); let fist = false;
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, fq = new THREE.Quaternion();
  // One-handed items (knife, grenades, bomb): the left arm folds away out of view.
  const boneOf = re => { let b = null; sc.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  const head = (() => { let h = null; sc.traverse(o => { if (!h && (P.head || /^CB-?Head/i).test(o.name)) h = o; }); return h; })(), headRest = new THREE.Matrix4(), fixM = new THREE.Matrix4(), hInv = new THREE.Matrix4(), rigInv = new THREE.Matrix4(), fp_ = new THREE.Vector3(), fq_ = new THREE.Quaternion(), fs_ = new THREE.Vector3();
  // The head bone in the space the correction works in (the rig's parent): rig.matrix × (rig → head).
  const headIn = () => { sc.updateMatrixWorld(true); return new THREE.Matrix4().copy(rig.matrix).multiply(rigInv.copy(rig.matrixWorld).invert().multiply(head.matrixWorld)); };
  if (head) { mixer.clipAction(A.idle).play(); mixer.update(0); root.updateMatrixWorld(true); headRest.copy(headIn()); mixer.stopAllAction(); }   // the head at rest (idle)
  // The arm chains (DEF-upper_arm → .001 → forearm → .001 → hand), their rest offsets, for ARMS (shortened every frame).
  const chains = ['L', 'R'].map(sd => { const up = boneOf(new RegExp('^DEF-upper_arm' + sd + '(_|$)')), up1 = boneOf(new RegExp('^DEF-upper_arm' + sd + '001')), fo = boneOf(new RegExp('^DEF-forearm' + sd + '(_|$)')), fo1 = boneOf(new RegExp('^DEF-forearm' + sd + '001')), hand = boneOf(new RegExp('^DEF-hand' + sd + '(_|$)'));   /* (three.js drops the dots from bone names) */
    return up && up1 && fo && fo1 && hand ? { up, segs: [[up1, 'upper'], [fo, 'upper'], [fo1, 'fore'], [hand, 'fore']].map(([b, k]) => ({ b, k, rest: b.position.clone() })), upRest: up.position.clone(), hand } : null; }).filter(Boolean);
  const aS = new THREE.Vector3(), aH = new THREE.Vector3();
  // CS2's hand size (CS2_HAND, over the forearm): the packs' and the M4A1-S animation's hands are a third bigger. Each
  // is drawn smaller about its palm's centre (where it holds the grip; the gun hangs off the rig's root, not the hand),
  // every frame after the animation; the support-hand and grenade IK read the hand's scale, so those land as before.
  const sized = chains.map(c => { const mid = boneOf(new RegExp('^DEF-f_middle01' + (/L(_|$)/.test(c.up.name) ? 'L' : 'R') + '(_|$)')); if (!mid) return null; sc.updateMatrixWorld(true);
    const w = c.hand.getWorldPosition(new THREE.Vector3()), m = mid.getWorldPosition(new THREE.Vector3()), k = Math.min(1, CS2_HAND * c.segs[1].b.getWorldPosition(new THREE.Vector3()).distanceTo(w) / w.distanceTo(m));
    return k < .98 ? { hand: c.hand, k, c: c.hand.worldToLocal(m).multiplyScalar(.6) } : null; }).filter(Boolean), hv = new THREE.Vector3();
  const sizeHands = () => { for (const h of sized) { h.hand.scale.setScalar(h.k); h.hand.position.add(hv.copy(h.c).multiplyScalar(1 - h.k).applyQuaternion(h.hand.quaternion)); } };
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
  const sides = { L: chains.find(c => /L(_|$)/.test(c.up.name)), R: chains.find(c => /R(_|$)/.test(c.up.name)) }, poleV = new THREE.Vector3(), wristV = new THREE.Vector3();
  const poseElbows = () => { const E = ELBOWS[name]; if (!E || onehand || supportW > .01) return; for (const k of ['L', 'R']) if (E[k] && sides[k]) { const c = sides[k]; root.updateMatrixWorld(true); RI.copy(root.matrixWorld).invert(); relPos(c.hand, wristV); poleV.set(...E[k]).applyQuaternion(qB.copy(root.quaternion).invert()); armTo(c, wristV, poleV, null); } };
  // The support hand on the gun actually held (two-handed guns with our model on the weapon bone: CS2 models' handguards
  // are not where the pack's AK had its own): laid under the handguard — palm up, knuckles across to the right and a
  // little forward, fingers curled round — the arm reaching it with the elbow down; it lets go for reloads and the draw.
  const LH = sides.L?.hand, lfingers = []; let handFrame = null, supportAt = null, supportW = 0;
  sc.traverse(o => { const m = o.isBone && /^DEF-(f_(index|middle|ring|pinky)|thumb)0([123])L(_|$)/.exec(o.name); if (m) lfingers.push({ b: o, seg: +m[3] - 1, thumb: m[1] === 'thumb' }); });
  if (LH) { sc.updateMatrixWorld(true); const at = re => { const b = boneOf(re); return b ? LH.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : null; };
    const mid = at(/^DEF-f_middle01L(_|$)/), idx = at(/^DEF-f_index01L(_|$)/), pnk = at(/^DEF-f_pinky01L(_|$)/), th = at(/^DEF-thumb01L(_|$)/);
    if (mid && idx && pnk && th) { const dL = mid.clone().normalize(), across = idx.clone().sub(pnk), nL = new THREE.Vector3().crossVectors(dL, across).normalize(); if (nL.dot(th) < 0) nL.negate(); nL.addScaledVector(dL, -nL.dot(dL)).normalize();
      handFrame = { basisT: new THREE.Matrix4().makeBasis(dL, nL, new THREE.Vector3().crossVectors(dL, nL)).transpose(), palm: mid.clone().multiplyScalar(.55), thick: nL.clone().multiplyScalar(mid.length() * .22) };   /* (the palm surface, a little off the bone on its own side: under the handguard the bone sits below it) */ } }
  // The handguard of the held gun (its own shape), in `ours`' space: half way from the grip to the muzzle, just under it.
  function findSupport() { supportAt = null; if (!ours) return; ours.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(ours.matrixWorld).invert(), v = new THREE.Vector3(), pts = [];
    ours.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), step = Math.max(1, Math.floor(P.count / 6000)); for (let i = 0; i < P.count; i += step) pts.push(v.fromBufferAttribute(P, i).applyMatrix4(M).clone()); });
    if (pts.length < 20) return; let zMin = Infinity; for (const q of pts) zMin = Math.min(zMin, q.z); if (zMin > -.5) return;
    let by = 0, bn = 0; for (const q of pts) if (q.z < zMin * .92) { by += q.y; bn++; } const bore = bn ? by / bn : 0, sz = SUPPORT_Z[oursId] == null ? null : P.attach ? cs2Z(P, oursId, SUPPORT_Z[oursId]) : SUPPORT_Z[oursId];   /* (SUPPORT_Z: as the guns sit on the packs' weapon bone) */
    let zh = Math.max(zMin * .9, sz ?? zMin * SUPPORT_AT);
    // CS2's arms reach as far along as the animation's own M4A1-S hold (P.reach), but not past the handguard's front:
    // the first slice from the muzzle back with something well under the bore (not the barrel or a suppressor).
    if (P.reach && !P.keepGrip?.has(oursId)) { let front = null; for (let z = zMin * .98; z < -.3 && front === null; z += .1) { let lo = Infinity; for (const q of pts) if (q.z >= z && q.z < z + .1 && Math.abs(q.x) < .45 && q.y > bore - 1.2) lo = Math.min(lo, q.y); if (lo < bore - .3) front = z; }
      if (front !== null) zh = Math.max(P.reach, Math.min(front + .3, sz ?? front + .3)); }   // (a front found behind the measured handguard: missed, the measured one)
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
    const mid = at(/^DEF-f_middle01R(_|$)/), idx = at(/^DEF-f_index01R(_|$)/), pnk = at(/^DEF-f_pinky01R(_|$)/), th = at(/^DEF-thumb01R(_|$)/);
    if (mid && idx && pnk && th) { const d = mid.clone().normalize(), n = new THREE.Vector3().crossVectors(d, idx.clone().sub(pnk)).normalize(); if (n.dot(th) < 0) n.negate(); n.addScaledVector(d, -n.dot(d)).normalize();
      rPalm = { at: mid.clone().multiplyScalar(.85), n,   /* (where a grenade sits: in the fingers' root, toward the knuckles — at the palm's middle it hung below the hand) */ basisT: new THREE.Matrix4().makeBasis(d, n, new THREE.Vector3().crossVectors(d, n)).transpose() }; } }
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
    ours.position.copy(gT).addScaledVector(gN, PALM_OUT); ours.quaternion.identity(); }   // (upright, as CS2 holds every grenade: not tilted with the pack pistol's bone)
  const restArms = () => { for (const c of chains) { c.up.position.copy(c.upRest); for (const g of c.segs) g.b.position.copy(g.rest); } };
  let wholeArm = false;   // (a grenade in the hand: the whole arm, to hold it out as far as CS2 does)
  const shortenArms = () => { if (P.fullArms || wholeArm || ARMS.upper === 1 && ARMS.fore === 1) return; for (const c of chains) { c.hand.updateWorldMatrix(true, false); aS.setFromMatrixPosition(c.up.matrixWorld); aH.setFromMatrixPosition(c.hand.matrixWorld);
      const full = aS.distanceTo(aH); let L0 = 0, L1 = 0; for (const g of c.segs) { const l = g.rest.length(); L0 += l; L1 += l * ARMS[g.k]; g.b.position.copy(g.rest).multiplyScalar(ARMS[g.k]); }
      if (!full || !L0) continue; aS.sub(aH).multiplyScalar(L1 / L0).add(aH); c.up.position.copy(c.up.parent.worldToLocal(aS)); } };
  const leftArm = boneOf(/^DEF-upper_armL/), leftFore = boneOf(/^DEF-forearmL(_|$)/), eu = new THREE.Euler(); let onehand = false, noLeft = false, bobT = 0, bobA = 0;
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
      const F = fpInfo(id) || {}, PV = GUN_KINDS.has(weaponById(id)?.kind) ? PACK_VIEW[F.pack] : null; onehand = !!F.onehand; fist = !!F.fist; palmItem = wholeArm = !!F.palm; fistK = F.fistK ?? 1; noLeft = !!F.noLeft; root.position.set(...(F.view || PV?.view || [0, 0, 0])); viewBase.copy(root.position); root.rotation.set(...(F.viewRot || PV?.rot || [0, 0, 0]));   /* per weapon: how close / where the arms sit */ if (leftArm) leftArm.scale.setScalar(1);
      // A CS2 model imported for this gun (weapon-models.js) replaces the pack's own: held like the other rifles / pistols.
      const own = F.own && !modelFromFile(id); if (ours) { ours.removeFromParent(); ours = null; } oursId = own ? null : id;
      for (const m of gunMeshes) m.visible = !!own;
      if (!own) { let a = F.own ? (ATTACH[F.pack === 'rifle' ? 'm4' : 'deagle'] || {}) : P.attach ? cs2Attach(P, id, model) : attachInfo(id); if (a.lowPoly && modelFromFile(model)) a = {}; const g = weaponModel(model, a.scale || 1); ours = new THREE.Group(); ours.add(g); root.add(ours); g.position.set(...(a.at || [0, 0, 0])); g.rotation.set(...(a.rot || [0, 0, 0])); follow(); }
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
    // CS2's inspect, where these arms have it: plays it, returns its length (ms); 0 — none (the hand turns the gun instead).
    inspect() { if (!A.inspect || reloadPlan || !ours && !gunMeshes.some(m => m.visible)) return 0; to('inspect', .15, { once: true }); oneShotUntil = performance.now() + A.inspect.duration * 1000; return A.inspect.duration * 1000; },
    fire() { if (!A.fire || reloadPlan) return; to('fire', .04, { once: true }); oneShotUntil = performance.now() + Math.min(A.fire.duration * 1000, 450); },
    // Reload over `ms` (the shotgun: into reload, shells, out of reload).
    reload(ms) { const now = performance.now(); if (A.toReload && A.fromReload) { const i = ms * .25, o = ms * .2; reloadPlan = [[now, 'toReload', i], [now + i, 'reload', ms - i - o], [now + ms - o, 'fromReload', o]]; } else reloadPlan = [[now, 'reload', ms]]; reloadPlan.end = now + ms; },
    // A shotgun's shell-by-shell reload broken off by a shot (CS2): the plan ends, the arms go back to idle and fire.
    stopReload() { reloadPlan = null; },
    // speed: the player's horizontal speed (game units / s) for idle / walk / run.
    update(dt, speed = 0) {
      const now = performance.now();
      if (reloadPlan) { if (now >= reloadPlan.end) reloadPlan = null; else { const step = [...reloadPlan].reverse().find(s => now >= s[0]); if (step && cur !== act(step[1])) to(step[1], .1, { once: step[1] !== 'reload' || !A.toReload, ms: step[2] }); } }
      if (!reloadPlan && now >= oneShotUntil) { const want = 'idle';   /* CS2: no run / lowered-gun clip while moving, only a small bob (below) */ if (want !== base || (cur && cur.loop === THREE.LoopOnce)) { base = want; to(A[want] ? want : 'idle', .2); } }
      restArms(); freshMix(); mixer.update(dt); fixHead(); shortenArms(); sizeHands(); follow(); supportHand(dt, SUPPORT_PACKS.has(name) && !onehand && !reloadPlan && now >= oneShotUntil && oursId !== P.native); poseElbows(); { let e = 0; if (reloadPlan) { const t = (now - reloadPlan[0][0]) / (reloadPlan.end - reloadPlan[0][0]), ss = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); e = ss(t / .14) * (1 - ss((t - .86) / .14)); } root.position.copy(viewBase).addScaledVector(roff, e); bobT += dt * Math.min(1, speed / 15) * 9; bobA += (Math.min(1, speed / 15) - bobA) * Math.min(1, dt * 8); root.position.x += Math.sin(bobT) * .012 * bobA; root.position.y += -Math.abs(Math.cos(bobT)) * .01 * bobA; } if (onehand && leftArm) { if (LEFT.relaxed && !noLeft) { leftArm.quaternion.multiply(fq.setFromEuler(eu.set(...LEFT.upper))); if (leftFore) leftFore.quaternion.multiply(fq.setFromEuler(eu.set(...LEFT.fore))); } else leftArm.scale.setScalar(.001); leftArm.updateMatrixWorld(true); }
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
      const sh = relPos(c.up, new THREE.Vector3()), el = relPos(c.segs[1].b, new THREE.Vector3()); const wG = w.clone().sub(ours.position).applyQuaternion(ours.quaternion.clone().invert()), sG = sh.clone().sub(ours.position).applyQuaternion(ours.quaternion.clone().invert()); const pG = palm.clone().sub(ours.position).applyQuaternion(ours.quaternion.clone().invert()); return { palmInGun: pG.toArray().map(v => +v.toFixed(2)), wristInGun: wG.toArray().map(v => +v.toFixed(2)), shoulderInGun: sG.toArray().map(v => +v.toFixed(2)), shW: +sh.distanceTo(w).toFixed(2), wristMiss: +w.distanceTo(wristV).toFixed(3), reach: [+sh.distanceTo(el).toFixed(2), +el.distanceTo(w).toFixed(2), +sh.distanceTo(wristV).toFixed(2)], segs: c.segs.map(g => g.b.name), d: toGun(dL).toArray().map(v => +v.toFixed(2)), n: toGun(nL).toArray().map(v => +v.toFixed(2)), miss: +palm.distanceTo(target).toFixed(3), at: supportAt.toArray().map(v => +v.toFixed(2)), w: supportW }; },
    get boneMuzzle() { return muzzleLocal.clone(); },
    // Where shots leave the barrel (world space).
    muzzle(out) { root.updateMatrixWorld(true);
      if (!ours && name === 'rifle') { rel.copy(rootInv.copy(root.matrixWorld).invert()).multiply(bone.matrixWorld); rel.decompose(bp, bq, bs); out.set(...(MUZZLE.ak || [0, 0, -3.5])).add(new THREE.Vector3(...ATTACH.ak.at)).applyQuaternion(bq.clone().multiply(BASE.rifle)).add(bp); return root.localToWorld(out); }
      if (ours) { const g = ours.children[0]; g.updateMatrixWorld(true); return g.localToWorld(out.set(...(MUZZLE[oursId] || [0, 0, -3]))); } return out.copy(muzzleLocal).applyMatrix4(bone.matrixWorld); },
  };
}
// The arms for a weapon id, if its pack has loaded (else null: the caller shows the plain gun meanwhile).
export const hasFP = id => authored.has(id);   // (a CS2 set loaded for it)
export function fpFor(id, model) { if (model && authored.has(model)) return authored.get(model); if (authored.has(id)) return authored.get(id); if (id === 'karambit' && karambitRig) return karambitRig; const f = fpInfo(id); return f ? ready.get(f.pack) || null : null; }
