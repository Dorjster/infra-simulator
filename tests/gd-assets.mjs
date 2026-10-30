// Global Defensive asset identity (spec §8): every gun, knife, grenade and the bomb has its own representation —
//  · a model source of its own (a model of its own, or a base model made different by finish / size / parts),
//    never the generic fallback (v44: a stray comment sent USP-S, Five-SeveN and Desert Eagle to the Makarov);
//  · no two guns resolve to the same model look; the AWP and the SSG 08 are clearly different;
//  · a buy / HUD icon file, no two of them the same picture;
//  · its own gunshot recordings (close, two more takes, distant), no two guns sharing a file;
//  · a first-person rig (arms pack).
import assert from 'node:assert/strict'; import { readFileSync, existsSync } from 'node:fs'; import { createHash } from 'node:crypto';
import { WEAPONS, KNIVES, GRENADES } from '../dist/weapons-data.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const root = new URL('../dist/', import.meta.url);
const src = readFileSync(new URL('weapon-models.js', root), 'utf8');
// The model tables, read from the source (the module needs a browser to load the models themselves).
const table = (name, text = src, decl = 'export const ') => { const i = text.indexOf(decl + name + ' = {'); assert(i >= 0, name); let d = 0, j = text.indexOf('{', i); const s = j; for (; j < text.length; j++) { if (text[j] === '{') d++; else if (text[j] === '}' && !--d) break; } const consts = [...text.matchAll(/^const (NADE_VIEW) = (\[[^\]]*\]);/gm)].map(m => `const ${m[1]} = ${m[2]};`).join(' ');   /* (shared values the table names) */
  return Function('"use strict"; ' + consts + ' return (' + text.slice(s, j + 1) + ');')(); };
const REAL = table('REAL_FIT'), Q = table('QGUNS'), V = table('VARIANTS');
const PROCEDURAL = ['knife', 'karambit'];   // drawn in code (knife(), karambit()) as well as REAL_FIT's karambit
const guns = WEAPONS.map(w => w.id), knives = KNIVES.map(k => k.id), nades = GRENADES.map(g => g.id);
// How each id is drawn, in weaponModel's order: its own model (REAL_FIT or the gun pack QGUNS) → a variant → fallback.
const look = id => REAL[id] ? 'model:' + id : Q[id] ? 'pack:' + JSON.stringify(Q[id]) : V[id] ? 'variant:' + JSON.stringify(V[id]) : PROCEDURAL.includes(id) ? 'code:' + id : null;
for (const id of [...guns, 'knife', 'karambit', ...nades, 'c4']) ok(`${id}: has a model of its own (not the generic fallback)`, !!look(id));
const seen = new Map(); for (const id of guns) { const k = look(id); ok(`${id}: no other gun looks the same`, !seen.has(k), seen.get(k)); seen.set(k, id); }
ok('the AWP and the SSG 08 are different models', look('sniper') !== look('ssg08') && (Q.ssg08?.slimScope || V.ssg08), look('ssg08'));
// Icons: one picture per gun, none shared.
const hash = f => createHash('sha1').update(readFileSync(f)).digest('hex'), icons = new Map();
for (const id of guns) { const f = new URL('icons/w-' + id + '.png', root); ok(`${id}: has a buy / HUD icon`, existsSync(f)); const h = hash(f); ok(`${id}: its icon is its own picture`, !icons.has(h), icons.get(h)); icons.set(h, id); }
// Gunshots: close, two more takes and a distant one, none shared between guns.
const shots = new Map();   // file hash → 'id-take'
for (const id of guns) for (const sfx of ['', '-b', '-c', '-far']) { const f = ['wav', 'ogg'].map(e => new URL(`sounds/shot-${id}${sfx}.${e}`, root)).find(existsSync); ok(`${id}: has its gunshot "${sfx || 'close'}"`, !!f); const h = hash(f); ok(`${id}${sfx}: a recording of its own`, !shots.has(h), shots.get(h)); shots.set(h, id + sfx); }
// The same take cut to another length is the same sound: no two gunshot files may start alike (first 0.2 s).
const starts = new Map(); for (const [h, name] of shots) { const f = ['wav', 'ogg'].map(e => new URL(`sounds/shot-${name}.${e}`, root)).find(existsSync), b = readFileSync(f), head = createHash('sha1').update(b.subarray(44, 44 + 44100 * .2 * 2)).digest('hex'); ok(`${name}: not the same take as another gunshot`, !starts.has(head), starts.get(head)); starts.set(head, name); }
// First person: every gun, knife and grenade has an arms rig.
const fpSrc = readFileSync(new URL('fp-view.js', root), 'utf8'), FP = table('FP', fpSrc), KIND_FP = table('KIND_FP', fpSrc, 'const ');
for (const w of [...WEAPONS, ...KNIVES, ...GRENADES]) ok(`${w.id}: has a first-person rig`, !!(FP[w.id] || KIND_FP[w.kind])?.pack, w.kind);
// Grenades (HE, flashbang, smoke, decoy, molotov, incendiary): each its own look — no two the same model — and its own
// buy-menu picture, kill-feed silhouette and HUD mark; a view-model placement.
const uiSrc = readFileSync(new URL('arena-ui.js', root), 'utf8'), hudSrc = readFileSync(new URL('gd-hud.js', root), 'utf8');
const GEAR = table('GEAR_SVG', uiSrc, 'const '), FEED = table('NADE_ICON', uiSrc, 'const '), MARK = table('NADE_ICON', hudSrc), VIEWS = table('VIEW', src);
ok('every grenade of CS2 is there (decoy and incendiary too)', ['he', 'flash', 'smoke', 'decoy', 'molotov', 'incendiary'].every(id => nades.includes(id)), nades.join());
for (const [what, T] of [['model', Object.fromEntries(nades.map(id => [id, look(id)]))], ['buy picture', GEAR], ['kill-feed icon', FEED], ['HUD mark', MARK]]) { const seen = new Map(); for (const id of nades) { ok(`${id}: has a ${what}`, !!T[id]); ok(`${id}: its ${what} is its own`, !seen.has(T[id]), seen.get(T[id])); seen.set(T[id], id); } }
for (const id of nades) ok(`${id}: has a view-model placement`, Array.isArray(VIEWS[id]) && VIEWS[id].length === 4);
console.log('PASS: asset identity · ' + n + ' checks (' + guns.length + ' guns, knives, ' + nades.length + ' grenades, bomb: own model, no duplicate looks, AWP ≠ SSG 08, own icon, own gunshots ×4, first-person rig; grenades: own look, buy picture, kill-feed icon, HUD mark)');
