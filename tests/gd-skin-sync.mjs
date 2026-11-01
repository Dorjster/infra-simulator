// Skins between the room and the GPU (skin-sync.js, PLAN §5.6): the host's catalogue reaches skins.js on this page
// (CS2 names in titles), and the CS2 finishes everyone shows are queued ahead at the right tier — other players' guns,
// knives and dropped guns at 'tp', your own at 'fp'; built-in finishes, default knives and finishes without a bake on
// that model never. Node, a fake manifest (no user-assets needed).
//   node tests/gd-skin-sync.mjs
import * as T from '../dist/skin-textures.js';
import { wanted } from '../dist/skin-sync.js';
import { setSkinCatalog, finishName, skinTitle } from '../dist/skins.js';
let ok = 0, bad = 0; const check = (name, c, d = '') => { if (c) ok++; else bad++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const MAN = { version: 1, made: 'sync-1', res: 1024, shared: {}, base: {},
  weapons: { ak: { model: 'cs2_ak', uv: 0, len: 37, finishes: { cu_ak47_cobra: { name: 'Line', rarity: 'Classified', style: 7, wear: [.1, .7], paint: 'ak/a_paint.jpg', mrw: 'ak/a_mrw.png', fbId: 'redline' } } },
    usps: { model: 'cs2_usps', uv: 0, len: 20, finishes: { cu_usp_kc: { name: 'Kill', style: 7, wear: [0, 1], paint: 'usps/k_paint.jpg', mrw: 'usps/k_mrw.png', fbId: 'asiimov' } } } },
  knives: { aa_fade: { name: 'Fade', style: 6, wear: [0, .08], fbId: 'fade', models: { karambit: { kit: 'aa_fade', paint: 'karambit/f_paint.jpg', mrw: 'karambit/f_mrw.png' } } } } };
T.resetSkinTextures(); T.setSkinGate(() => false); await T.loadSkinManifest(false, MAN); setSkinCatalog(MAN);
check('catalogue on the page: CS2 names in titles', finishName({ finish: 'cs2:cu_ak47_cobra' }) === 'Line' && /AK-47 \| Line/.test(skinTitle('AK-47', { finish: 'cs2:cu_ak47_cobra', fb: 'redline', wear: .2, seed: 1 })));
const ak = { finish: 'cs2:cu_ak47_cobra', fb: 'redline', wear: .2, seed: 1, stickers: [] }, kc = { finish: 'cs2:cu_usp_kc', fb: 'asiimov', wear: .1, seed: 1, stickers: [] }, fade = { finish: 'cs2k:aa_fade', fb: 'fade', wear: .01, seed: 1, stickers: [] };
const A = { loadout: { ann: { primary: 'ak', secondary: 'usps' }, bob: { primary: 'ak', secondary: 'usps', own: { primary: { w: 'ak', k: 'ann' } } }, 'bot x': { primary: 'ak', secondary: null } },
  skins: { ann: { ak, usps: kc, knife: fade }, bob: { usps: { finish: 'fade', fb: 'fade', wear: .01, seed: 1, stickers: [] }, knife: fade }, cid: { knife: fade } }, knives: { ann: 'karambit', bob: 'default', cid: 'm9' } };
const W = wanted(A, [{ id: 1, item: 'ak', own: 'ann' }, { id: 2, item: 'usps', own: null }], 'ann'), has = (m, f, t) => W.some(w => w.model === m && w.finish === f && w.tier === t);
check('your own guns and knife at fp', has('ak', ak.finish, 'fp') && has('usps', kc.finish, 'fp') && has('karambit', fade.finish, 'fp'), JSON.stringify(W));
check('a gun someone else carries shows its owner\'s skin at tp (Bob holds Ann\'s AK)', has('ak', ak.finish, 'tp'));
check('dropped guns: the owner\'s at tp, no owner nothing', W.filter(w => w.tier === 'tp' && w.model === 'ak').length === 1 && !W.some(w => w.model === 'usps' && w.tier === 'tp'));
check('never queued: built-in finishes, default knives, a family with no bake on that knife (M9), bots\' own guns', !W.some(w => !w.finish.startsWith('cs2')) && !W.some(w => w.model === 'default' || w.model === 'm9'));
check('each (model, finish, tier) once', new Set(W.map(w => w.model + w.finish + w.tier)).size === W.length);
check('no manifest: nothing', (T.resetSkinTextures(), wanted(A, [], 'ann').length === 0));
console.log(bad ? `FAIL: skin sync · ${bad} failed` : `PASS: skin sync · ${ok} passed, 0 failed`); process.exit(bad ? 1 : 0);
