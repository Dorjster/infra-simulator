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
// The host: skins go on knives only (one skin, on whichever knife you carry), refused when bad, StatTrak counting the
// knife's kills only; everyone picks their own knife and its skin, and Darja can give either to another player.
const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, 1e9); const P = [{ name: 'Ann', pose: { x: 0, y: 9.7, z: 0 } }, { name: 'Bo', pose: { x: 5, y: 9.7, z: 0 } }, { name: 'Darja', pose: { x: 9, y: 9.7, z: 0 } }];
ok('the host equips a knife skin', /StatTrak™ Knife \| Fade/.test(arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'fade', wear: .02, seed: 661, st: true } }, 'Ann', P, 1e9)));
n++; assert.throws(() => arenaApply(g, { type: 'skin', weapon: 'ak', skin: { finish: 'fade' } }, 'Ann', P, 1e9), /knives/, 'guns take no skins');
n++; assert.throws(() => arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'fade', wear: NaN } }, 'Ann', P, 1e9), /Wear/, 'the host refuses a bad one');
ok('…and keeps the good one it had', g.arena.skins.ann.knife.finish === 'fade' && !g.arena.skins.ann.ak);
g.combat.d.teams = { ann: 't', bo: 'ct' }; const cash0 = g.combat.d.money.ann ?? 800; hurt(g, 'Ann', 'Bo', weaponById('ak'), 200, 'chest', 1e9 + 5);
ok('a kill with a gun leaves the knife\'s count alone', (g.arena.skins.ann.knife.kills | 0) === 0); g.combat.down = {}; g.combat.hp = {};
hurt(g, 'Ann', 'Bo', weaponById('knife'), 200, 'chest', 1e9 + 10);
ok('a kill with the StatTrak knife counts', g.arena.skins.ann.knife.kills === 1, String(g.arena.skins.ann.knife.kills));
arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'marble', wear: .3, seed: 2, st: true, kills: 5000 } }, 'Ann', P, 1e9 + 20); ok('a new finish on it keeps its kills (and sent kills are ignored)', g.arena.skins.ann.knife.kills === 1 && g.arena.skins.ann.knife.finish === 'marble');
arenaApply(g, { type: 'skin', weapon: 'karambit', skin: { finish: 'doppler' } }, 'Ann', P, 1e9 + 25); ok('every knife wears the one knife skin (a karambit\'s skin is the knife skin)', g.arena.skins.ann.knife.finish === 'doppler' && !g.arena.skins.ann.karambit);
arenaApply(g, { type: 'skin', weapon: 'knife', clear: true }, 'Ann', P, 1e9 + 30); ok('back to the default look', !g.arena.skins.ann.knife);
ok('a player picks his own knife (any of them, the karambit too)', /Karambit \| Ruby equipped/.test(arenaApply(g, { type: 'knife', knife: 'karambit' }, 'Ann', P, 1e9 + 31)) && g.arena.knives.ann === 'karambit');
n++; assert.throws(() => arenaApply(g, { type: 'knife', knife: 'm9', for: 'Bo' }, 'Ann', P, 1e9 + 31), /Only Darja/, 'only Darja equips a knife on someone else');
ok('Darja gives a player a knife', /Butterfly Knife equipped on Bo/.test(arenaApply(g, { type: 'knife', knife: 'butterfly', for: 'Bo' }, 'Darja', P, 1e9 + 32)) && g.arena.knives.bo === 'butterfly');
ok('…and a skin for it', /given to Bo/.test(arenaApply(g, { type: 'skin', weapon: 'knife', for: 'Bo', skin: { finish: 'tiger', wear: .05 } }, 'Darja', P, 1e9 + 33)) && g.arena.skins.bo.knife.finish === 'tiger');
ok('the player then chooses the skin on it himself', /Knife \| Gold/.test(arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'gold' } }, 'Bo', P, 1e9 + 34)) && g.arena.skins.bo.knife.finish === 'gold' && g.arena.knives.bo === 'butterfly');
n++; assert.throws(() => arenaApply(g, { type: 'skin', weapon: 'knife', for: 'Darja', skin: { finish: 'gold' } }, 'Bo', P, 1e9 + 35), /Only Darja/, 'only Darja gives skins to others');
ok('skins and knives stay from match to match', (() => { startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, 1e9 + 50); return g.arena.skins.bo.knife?.finish === 'gold' && g.arena.knives.bo === 'butterfly'; })());
console.log(`PASS: knife skins · ${n} checks (finite, in range, known; slots and sticker limits; knives only, one skin on any knife; StatTrak knife kills; everyone picks a knife and its skin, Darja can give them; wear names; pattern seeds; kept across matches)`);
