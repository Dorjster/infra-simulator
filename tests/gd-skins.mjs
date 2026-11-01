// Weapon skins (skins.js) and the host's check of them (arena-logic.js 'skin'): every number finite and in range (a NaN
// or infinite wear, a seed of 1001 or 2.5, an unknown finish or sticker are refused), each sticker in its own slot and
// no more than the gun takes (five on a rifle, four on a pistol, none on a knife), the name tag cleaned, StatTrak™ kills
// the host's alone (sent kills are ignored; a kill with the gun counts one); wear names and the pattern seed as CS2's.
import assert from 'node:assert/strict';
import { cleanSkin, wearName, patternOf, stickerSlots, skinTitle, FINISHES, STICKER_IDS } from '../dist/skins.js';
import { startArena, arenaApply } from '../dist/arena-logic.js';
import { hurt } from '../dist/combat-logic.js';
import { weaponById } from '../dist/weapons-data.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const bad = (raw, kind, re, what) => { n++; assert.throws(() => cleanSkin(raw, kind), re, what); };
const good = cleanSkin({ finish: 'fade', wear: .023841029, seed: 661, st: true, kills: 99999, name: 'The Code Runner', stickers: [{ id: 'crown', slot: 0, x: .65, y: .46, scale: 1, rot: 12.5 }, { id: 'crown', slot: 4, x: .28, y: .6, scale: .9, rot: 0, wear: .45 }] }, 'rifle');
ok('a good skin is kept', good.finish === 'fade' && good.seed === 661 && good.stickers.length === 2 && good.name === 'The Code Runner');
ok('StatTrak kills can\'t be sent: they start at 0 (only the host counts them)', good.st && good.kills === 0);
bad({ finish: 'fade', wear: NaN }, 'rifle', /Wear must be a number/, 'NaN wear'); bad({ finish: 'fade', wear: Infinity }, 'rifle', /Wear/, 'infinite wear'); bad({ finish: 'fade', wear: -0.1 }, 'rifle', /between 0 and 1/, 'negative wear');
bad({ finish: 'fade', wear: '0.5' + 'x' }, 'rifle', /Wear must be a number/, 'text wear'); bad({ finish: 'fade', wear: true }, 'rifle', /Wear must be a number/, 'boolean wear');
bad({ finish: 'fade', seed: 0 }, 'rifle', /between 1 and 1000/, 'seed 0'); bad({ finish: 'fade', seed: 1001 }, 'rifle', /between 1 and 1000/, 'seed 1001'); bad({ finish: 'fade', seed: 2.5 }, 'rifle', /whole number/, 'seed 2.5');
bad({ finish: 'nope' }, 'rifle', /Unknown finish/, 'unknown finish'); bad({ finish: 'fade', stickers: [{ id: 'nope' }] }, 'rifle', /unknown sticker/, 'unknown sticker');
bad({ finish: 'fade', stickers: [{ id: 'gg', slot: 1 }, { id: 'gg', slot: 1 }] }, 'rifle', /used twice/, 'two stickers in one slot');
bad({ finish: 'fade', stickers: [0, 1, 2, 3, 4].map(i => ({ id: 'gg', slot: i })) }, 'pistol', /4 stickers at most/, 'five on a pistol'); bad({ finish: 'fade', stickers: [{ id: 'gg' }] }, 'knife', /0 stickers at most/, 'a sticker on a knife');
bad({ finish: 'fade', stickers: [{ id: 'gg', scale: NaN }] }, 'rifle', /Sticker size/, 'NaN sticker size'); bad({ finish: 'fade', stickers: [{ id: 'gg', rot: 400 }] }, 'rifle', /rotation/, 'sticker turned 400°');
ok('five stickers on a rifle', cleanSkin({ finish: 'fade', stickers: [0, 1, 2, 3, 4].map(i => ({ id: STICKER_IDS[i], slot: i })) }, 'rifle').stickers.length === 5 && stickerSlots('rifle') === 5 && stickerSlots('pistol') === 4 && stickerSlots('knife') === 0);
ok('a name tag is cleaned (no markup, 20 letters)', cleanSkin({ finish: 'none', name: '<b>"hello"</b> world and much more text' }, 'rifle').name === 'bhello/b world and m');
ok('CS2\'s wear names', wearName(.02) === 'Factory New' && wearName(.1) === 'Minimal Wear' && wearName(.2) === 'Field-Tested' && wearName(.4) === 'Well-Worn' && wearName(.8) === 'Battle-Scarred');
{ const a = patternOf(661), b = patternOf(661), c = patternOf(662); ok('one seed, one pattern; another seed, another', a.u === b.u && a.v === b.v && a.rot === b.rot && (a.u !== c.u || a.v !== c.v), JSON.stringify(a)); ok('the seed offset is fmod(seed × 0.12345, 1)', Math.abs(a.u - (661 * .12345) % 1) < 1e-12); }
ok('the title as CS2 shows it', skinTitle('AK-47', cleanSkin({ finish: 'fade', wear: .02, st: true }, 'rifle')) === 'StatTrak™ AK-47 | Fade (Factory New)' && skinTitle('AK-47', good) === '“The Code Runner”');
ok('every finish is drawable (a pattern, its colours)', Object.values(FINISHES).every(f => f.pattern === 'none' || f.colors.length >= 2));
// The host: one knife skin on whichever knife you carry, and a skin on every gun (CS2; the knife-only rule is gone),
// refused when bad, StatTrak counting each weapon's own kills; everyone picks their own knife and its skin, and Darja can
// give either to another player. (Per-gun keys, CS2 finishes, aliases, the save: tests/gd-skin-data.mjs; owners:
// gd-skin-owner.mjs; the network: gd-skin-net.mjs.)
const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, 1e9); const P = [{ name: 'Ann', pose: { x: 0, y: 9.7, z: 0 } }, { name: 'Bo', pose: { x: 5, y: 9.7, z: 0 } }, { name: 'Darja', pose: { x: 9, y: 9.7, z: 0 } }];
ok('the host equips a knife skin', /StatTrak™ Knife \| Fade/.test(arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'fade', wear: .02, seed: 661, st: true } }, 'Ann', P, 1e9)));
ok('a gun takes its own skin (CS2: every gun)', /AK-47 \| Redline/.test(arenaApply(g, { type: 'skin', weapon: 'ak', skin: { finish: 'redline', wear: .2 } }, 'Ann', P, 1e9)) && g.arena.skins.ann.ak.finish === 'redline');
n++; assert.throws(() => arenaApply(g, { type: 'skin', weapon: 'he', skin: { finish: 'fade' } }, 'Ann', P, 1e9), /no skins/, 'grenades take no skins');
n++; assert.throws(() => arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'fade', wear: NaN } }, 'Ann', P, 1e9), /Wear/, 'the host refuses a bad one');
ok('…and keeps the good one it had', g.arena.skins.ann.knife.finish === 'fade' && g.arena.skins.ann.ak.finish === 'redline');
g.combat.d.teams = { ann: 't', bo: 'ct' }; const cash0 = g.combat.d.money.ann ?? 800; hurt(g, 'Ann', 'Bo', weaponById('ak'), 200, 'chest', 1e9 + 5);
ok('a kill with a gun leaves the knife\'s count alone', (g.arena.skins.ann.knife.kills | 0) === 0); g.combat.down = {}; g.combat.hp = {};
hurt(g, 'Ann', 'Bo', weaponById('knife'), 200, 'chest', 1e9 + 10);
ok('a kill with the StatTrak knife counts', g.arena.skins.ann.knife.kills === 1, String(g.arena.skins.ann.knife.kills));
arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'marble', wear: .3, seed: 2, st: true, kills: 5000 } }, 'Ann', P, 1e9 + 20); ok('a new finish on it keeps its kills (and sent kills are ignored)', g.arena.skins.ann.knife.kills === 1 && g.arena.skins.ann.knife.finish === 'marble');
arenaApply(g, { type: 'skin', weapon: 'karambit', skin: { finish: 'doppler' } }, 'Ann', P, 1e9 + 25); ok('every knife wears the one knife skin (a karambit\'s skin is the knife skin)', g.arena.skins.ann.knife.finish === 'doppler' && !g.arena.skins.ann.karambit);
arenaApply(g, { type: 'skin', weapon: 'knife', clear: true }, 'Ann', P, 1e9 + 30); ok('back to the default look', !g.arena.skins.ann.knife);
ok('a player picks his own knife (any of them, the karambit too)', /Karambit equipped/.test(arenaApply(g, { type: 'knife', knife: 'karambit' }, 'Ann', P, 1e9 + 31)) && g.arena.knives.ann === 'karambit');
n++; assert.throws(() => arenaApply(g, { type: 'knife', knife: 'm9', for: 'Bo' }, 'Ann', P, 1e9 + 31), /Only Darja/, 'only Darja equips a knife on someone else');
ok('Darja gives a player a knife', /Butterfly Knife equipped on Bo/.test(arenaApply(g, { type: 'knife', knife: 'butterfly', for: 'Bo' }, 'Darja', P, 1e9 + 32)) && g.arena.knives.bo === 'butterfly');
ok('…and a skin for it', /given to Bo/.test(arenaApply(g, { type: 'skin', weapon: 'knife', for: 'Bo', skin: { finish: 'tiger', wear: .05 } }, 'Darja', P, 1e9 + 33)) && g.arena.skins.bo.knife.finish === 'tiger');
ok('the player then chooses the skin on it himself', /Knife \| Gold/.test(arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'gold' } }, 'Bo', P, 1e9 + 34)) && g.arena.skins.bo.knife.finish === 'gold' && g.arena.knives.bo === 'butterfly');
n++; assert.throws(() => arenaApply(g, { type: 'skin', weapon: 'knife', for: 'Darja', skin: { finish: 'gold' } }, 'Bo', P, 1e9 + 35), /Only Darja/, 'only Darja gives skins to others');
ok('skins and knives stay from match to match', (() => { startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, 1e9 + 50); return g.arena.skins.bo.knife?.finish === 'gold' && g.arena.knives.bo === 'butterfly'; })());
// ── Drawing them (skin-render.js) ──
{ const THREE = await import('../dist/three.module.js'), { applySkin, skinObject, unskinObject, paintTexel } = await import('../dist/skin-render.js'), { PATTERNS } = await import('../dist/skins.js');
  const fade = { finish: 'fade', wear: .02, seed: 7 }, mat = () => new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  // a clone of a prepared material is painted with its own working uniforms (they lived in userData: JSON-copied, broken)
  const m = mat(); applySkin([m], fade); const c = m.clone(); let err = null; try { applySkin([c], { finish: 'tiger', wear: .1, seed: 3 }); } catch (e) { err = e.message; }
  ok('a clone of a skinned material takes a skin of its own (no shared or broken uniforms)', !err && c.userData.skinU?.uSkA.value.isColor && c.userData.skinU !== m.userData.skinU && m.userData.skinU.uSkinOn.value === 1, err || '');
  // another player's knife: its own copy, not flagged shared (dispose code skips shared), back to the shared one with the skin off
  const base = mat(); base.userData.shared = true; const g = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), base); g.add(mesh);
  skinObject(g, fade); const own = mesh.material; ok('a worn skin is the player\'s own material copy, not marked shared', own !== base && own.userData.shared === false && base.userData.shared === true);
  let disposed = 0; own.addEventListener('dispose', () => disposed++); skinObject(g, null); ok('skin off: the shared material back, the copy freed', mesh.material === base && disposed === 1);
  skinObject(g, fade); const own2 = mesh.material; own2.addEventListener('dispose', () => disposed++); unskinObject(g); ok('put away: the copy freed', mesh.material === base && disposed === 2);
  // a made mask (default knives): used under a skin only — with none, the knife's own look (no black handle, no tint)
  const km = mat(); km.userData.skinMask = true; applySkin([km], null, true); const off = km.userData.skinU.uSkinVC.value; applySkin([km], fade, true);
  ok('a default knife\'s made mask: off with no skin (its own look), the mask under a skin', off === 0 && km.userData.skinU.uSkinVC.value === 2, off + ' → ' + km.userData.skinU.uSkinVC.value);
  const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); kg.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 0, 0, 0, 1, 1, 1], 3));
  const kb = mat(); kb.userData.skinMask = true; const kmesh = new THREE.Mesh(kg, kb); skinObject(kmesh, fade); ok('another player\'s default knife: vertex colours (the mask) on its skinned copy only', kmesh.material.vertexColors === true && kb.vertexColors === false);
  // the menu's swatch paints the shader's own patterns: web and hex (and every pattern) differ
  const A = [.8, .1, .1], B = [.1, .1, .8], C = [.1, .8, .1], S = [.2, .4, .7, 1], pic = pat => { const px = []; for (let j = 0; j < 24; j++) for (let i = 0; i < 48; i++) px.push(...paintTexel(pat, i / 48, j / 48, A, B, C, S)); return px; };
  const diff = (p, q) => { let d = 0; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > .1) d++; return d / (p.length / 3); };
  const pics = PATTERNS.map((_, i) => pic(i)); let least = 1; for (let i = 1; i < pics.length; i++) for (let j = i + 1; j < pics.length; j++) least = Math.min(least, diff(pics[i], pics[j]));
  ok('swatches: every pattern paints differently (web vs hex, tiger vs Case Hardened…: > 20 % of pixels)', least > .2, least.toFixed(2)); }
// A remote player's avatar holding a skinned knife, disposed (leaves, re-dressed, side swap): only the player's own
// skin copy is freed — never the knife's texture (one Texture object shared by every knife of that model). v52 review:
// the copy is marked not shared, so avatar.dispose() freed its map (= the shared texture) until it unskinned first.
{ const prevDoc = globalThis.document; globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }) }) };
  const THREE = await import('../dist/three.module.js'), W = await import('../dist/weapon-models.js'), { createAvatar } = await import('../dist/avatar.js');
  const tex = new THREE.DataTexture(new Uint8Array(64).fill(200), 4, 4), base = new THREE.MeshStandardMaterial({ map: tex }), geo = new THREE.BoxGeometry(.1, .1, 1); base.userData.shared = geo.userData.shared = true;
  const kg = new THREE.Group(); kg.add(new THREE.Mesh(geo, base)); W.registerModel('knife', kg); ok('a registered model\'s maps are marked shared', tex.userData.shared === true);
  tex.userData.shared = false;   // (as a texture nobody marked: avatar.dispose itself must not free it)
  let texGone = 0, copyGone = 0; tex.addEventListener('dispose', () => texGone++);
  const a = createAvatar({ color: 0x334455, name: '', hat: 'combat', outfit: 'plate' }); a.setWeapon('knife'); a.setSkin({ finish: 'fade', wear: .1, seed: 3, stickers: [] });
  let copy = null; a.g.traverse(o => { if (o.isMesh && o.material?.map === tex && o.material !== base) copy = o.material; }); copy?.addEventListener('dispose', () => copyGone++);
  a.dispose(); ok('avatar.dispose with a skinned knife: the copy freed, the shared knife texture kept', !!copy && copyGone === 1 && texGone === 0, `copy ${!!copy} copyGone ${copyGone} texGone ${texGone}`);
  if (prevDoc === undefined) delete globalThis.document; }
console.log(`PASS: skins · ${n} checks (finite, in range, known; slots and sticker limits; every gun takes one, one skin on any knife, grenades none; StatTrak knife kills; everyone picks a knife and its skin, Darja can give them; wear names; pattern seeds; kept across matches; clones and copies of skinned materials, made masks, swatches as the shader paints)`);
