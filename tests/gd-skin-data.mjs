// Skins as data (skins.js, the host's 'skin' / 'skins' actions in arena-logic.js, the room's save in lan/room.mjs):
//  · every gun of weapons-data takes a skin of its own (key = its id), the knife one; grenades and the bomb none;
//    sticker limits by the gun's kind through the host;
//  · CS2 finishes (cs2:<kit>, cs2k:<family>) only from the host's catalogue (the import's skins.json, injected): without
//    it a pick is kept as its built-in look (fb) with a note, never dropped; with it wear is clamped into the kit's range;
//  · old knife skin ids (v51's built-in knife finishes) become the CS2 knife finish of that name when the host has it,
//    the old id staying the fallback look; without a catalogue they stay as they were;
//  · many at once (a page restoring its own after a join): 40 slots / 16 KB at most, unknown slots refused, fill;
//  · a pick made in a live round waits for the next freeze; StatTrak kills earned meanwhile stay;
//  · Darja gives a skin on a gun (StatTrak count stays the player's);
//  · kept across fresh() (a match started from the mode menu: v51 lost them), a rematch, and a host restart (gd-skins.json);
//  · an asset pack's skins-pack/ installed under the back-up rule (never written over skins/ file by file).
// Synthetic catalogue and files only (the real finishes are imported from the user's own CS2 install and stay local).
//   node tests/gd-skin-data.mjs
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { cleanSkin, cleanSkinNote, skinKeyOf, skinKindOf, SKIN_SLOTS, setSkinCatalog, catalogHash, KNIFE_ALIAS, skinTitle, cleanSkinSave, skinSave, FINISHES } from '../dist/skins.js';
import { startArena, arenaApply, arenaTick, arenaView, rematch } from '../dist/arena-logic.js';
import { hurt } from '../dist/combat-logic.js';
import { WEAPONS, GRENADES, weaponById } from '../dist/weapons-data.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const throws = (f, re, name) => { n++; assert.throws(f, re, name); };
const P = [{ name: 'Ann', pose: { x: 0, y: 9.7, z: 0 } }, { name: 'Bo', pose: { x: 5, y: 9.7, z: 0 } }, { name: 'Darja', pose: { x: 9, y: 9.7, z: 0 } }];
const fresh = () => { const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, 1e9); return g; };
setSkinCatalog(null);

// ── Every gun a skin of its own ──
ok('27 guns in weapons-data, each its own skin key (its id), the knife one', WEAPONS.length === 27 && WEAPONS.every(w => skinKeyOf(w.id) === w.id) && skinKeyOf('knife') === 'knife' && skinKeyOf('karambit') === 'knife' && SKIN_SLOTS.length === 28);
ok('grenades and the bomb have none', GRENADES.every(x => skinKeyOf(x.id) === null) && skinKeyOf('c4') === null && skinKeyOf('kit') === null && skinKindOf('he') === null);
{ const g = fresh(); for (const w of WEAPONS) arenaApply(g, { type: 'skin', weapon: w.id, skin: { finish: 'hex', wear: .3, seed: 5 } }, 'Ann', P, 1e9);
  ok('the host keeps a skin on each of the 27 guns, under its id', WEAPONS.every(w => g.arena.skins.ann[w.id]?.finish === 'hex') && Object.keys(g.arena.skins.ann).length === 27);
  for (const id of [...GRENADES.map(x => x.id), 'c4']) throws(() => arenaApply(g, { type: 'skin', weapon: id, skin: { finish: 'fade' } }, 'Ann', P, 1e9), /no skins/, id + ' refused');
  const st = (id, k) => ({ type: 'skin', weapon: id, skin: { finish: 'fade', stickers: Array.from({ length: k }, (_, i) => ({ id: 'gg', slot: i })) } });
  for (const [id, max] of [['ak', 5], ['sniper', 5], ['shotgun', 5], ['negev', 5], ['mp9', 5], ['deagle', 4], ['usps', 4], ['knife', 0]]) {
    if (max) ok(`${id}: ${max} stickers through the host`, arenaApply(g, st(id, max), 'Ann', P, 1e9) && g.arena.skins.ann[skinKeyOf(id)].stickers.length === max);
    throws(() => arenaApply(g, st(id, max + 1), 'Ann', P, 1e9), new RegExp(max + ' sticker'), `${id}: ${max + 1} stickers refused`); } }
ok('built-in Fade, Doppler, Marble and Tiger Tooth only go to 0.08 wear (CS2), others to 1', cleanSkin({ finish: 'fade', wear: .9 }, 'knife').wear === .08 && cleanSkin({ finish: 'tiger', wear: .5 }, 'rifle').wear === .08 && cleanSkin({ finish: 'redline', wear: .9 }, 'rifle').wear === .9);
ok('a built-in skin\'s fallback is itself (fb)', cleanSkin({ finish: 'asiimov' }, 'rifle').fb === 'asiimov');

// ── CS2 finishes: only from the host's catalogue ──
{ const r = cleanSkinNote({ finish: 'cs2:cu_ak47_cobra', fb: 'redline', wear: .05 }, 'rifle', null, 'ak');
  ok('no catalogue: a CS2 pick is kept as its built-in look (fb), with a note', r.skin.finish === 'redline' && r.skin.fb === 'redline' && /not imported/.test(r.note), JSON.stringify(r));
  ok('…and an unknown fb becomes the default', cleanSkin({ finish: 'cs2:cu_ak47_cobra', fb: 'nope' }, 'rifle', null, 'ak').finish === 'none'); }
const CAT = { version: 1, res: 1024, weapons: { ak: { model: 'cs2_ak', uv: 0, len: 37, finishes: { cu_ak47_cobra: { name: 'Snake Line', style: 7, wear: [.1, .7], legacy: true, pearl: 0, fbId: 'redline', paint: 'ak/a.jpg', mrw: 'ak/a.png' } } }, p90: { model: 'cs2_p90', uv: 0, len: 20, finishes: { 'cu_p90-asiimov': { name: 'Dash', style: 7, wear: [0, 1], legacy: false, pearl: 0, fbId: 'asiimov', paint: 'p90/a.jpg', mrw: 'p90/a.png' } } } },
  knives: Object.fromEntries(Object.values(KNIFE_ALIAS).filter(f => f !== 'sp_mesh_tan').map(f => [f, { name: 'K ' + f, style: 5, wear: /^a[amn]_/.test(f) ? [0, .08] : [0, 1], pearl: 0, fbId: 'fade', models: { karambit: { paint: 'x.jpg', mrw: 'x.png' } } }]).concat([['cu_lore', { name: 'Tale', style: 7, wear: [0, 1], pearl: 0, fbId: 'gold', models: { m9: {} } }]])), base: {}, shared: {} };
const h = setSkinCatalog(CAT);
ok('the catalogue hash: 12 characters, the same for the same file, another for another', /^[0-9a-f]{12}$/.test(h) && catalogHash() === h && catalogHash(JSON.parse(JSON.stringify(CAT))) === h && catalogHash({ ...CAT, res: 512 }) !== h);
{ const s = cleanSkin({ finish: 'cs2:cu_ak47_cobra', wear: .02, fb: 'gold' }, 'rifle', null, 'ak');
  ok('with the catalogue: kept as CS2, its fallback the catalogue\'s, wear clamped into the kit\'s range', s.finish === 'cs2:cu_ak47_cobra' && s.fb === 'redline' && s.wear === .1, JSON.stringify(s));
  ok('the title takes the catalogue\'s name', skinTitle('AK-47', s) === 'AK-47 | Snake Line (Minimal Wear)', skinTitle('AK-47', s));
  ok('kit ids with "-" are fine', cleanSkin({ finish: 'cs2:cu_p90-asiimov' }, 'smg', null, 'p90').finish === 'cs2:cu_p90-asiimov');
  ok('a kit of another gun is not this gun\'s: its built-in look', cleanSkin({ finish: 'cs2:cu_ak47_cobra', fb: 'web' }, 'rifle', null, 'm4').finish === 'web');
  throws(() => cleanSkin({ finish: 'cs2:cu_ak47_cobra' }, 'knife', null, 'knife'), /gun finish/, 'a gun finish on a knife refused');
  throws(() => cleanSkin({ finish: 'cs2k:aa_fade' }, 'rifle', null, 'ak'), /knife finish/, 'a knife finish on a gun refused');
  throws(() => cleanSkin({ finish: 'cs2:../../x' }, 'rifle', null, 'ak'), /Unknown finish/, 'a kit id with a path refused');
  const k = cleanSkin({ finish: 'cs2k:cu_lore', wear: .5 }, 'knife', null, 'knife'); ok('a CS2 knife finish on the knife slot', k.finish === 'cs2k:cu_lore' && k.fb === 'gold' && k.wear === .5); }
// Old knife skin ids → the CS2 knife finish (PLAN §2.7), the old id the fallback; wear clamped.
for (const [old, fam] of Object.entries(KNIFE_ALIAS)) { const s = cleanSkin({ finish: old, wear: .5, seed: 9 }, 'knife', null, 'knife');
  if (fam === 'sp_mesh_tan') ok('camo: its CS2 family not imported (spray kits are opt-in) → stays built-in camo', s.finish === 'camo' && s.fb === 'camo', JSON.stringify(s));
  else ok(`old knife id ${old} → cs2k:${fam}, fb ${old}`, s.finish === 'cs2k:' + fam && s.fb === old && s.wear === (/^a[amn]_/.test(fam) ? .08 : .5), JSON.stringify(s)); }
ok('asiimov, hex, redline, gold: no CS2 knife finish — stay built-in', ['asiimov', 'hex', 'redline', 'gold'].every(f => cleanSkin({ finish: f }, 'knife', null, 'knife').finish === f));
ok('the built-in one by name (builtin) stays built-in', cleanSkin({ finish: 'fade', builtin: true }, 'knife', null, 'knife').finish === 'fade');
ok('guns have no aliases (a built-in Fade AK stays one)', cleanSkin({ finish: 'fade' }, 'rifle', null, 'ak').finish === 'fade');
{ const g = fresh(); ok('the host stores the knife\'s old id as the CS2 finish', /K aa_fade/.test(arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'fade', wear: .02 } }, 'Ann', P, 1e9)) && g.arena.skins.ann.knife.finish === 'cs2k:aa_fade' && g.arena.skins.ann.knife.fb === 'fade');
  ok('arenaView names the host\'s catalogue (skinCat)', arenaView(g).skinCat === h); }
setSkinCatalog(null);
{ const g = fresh(); ok('no catalogue on the host: the reply says the CS2 pick is drawn built-in', /not imported/.test(arenaApply(g, { type: 'skin', weapon: 'ak', skin: { finish: 'cs2:cu_ak47_cobra', fb: 'redline' } }, 'Ann', P, 1e9)) && g.arena.skins.ann.ak.finish === 'redline');
  ok('and arenaView carries no skinCat', arenaView(g).skinCat === undefined); }

// ── Many at once ──
{ const g = fresh(), set = Object.fromEntries(WEAPONS.slice(0, 10).map(w => [w.id, { finish: 'web', wear: .2 }]));
  ok('a batch: each checked and kept', /Skins: 10 set/.test(arenaApply(g, { type: 'skins', set }, 'Ann', P, 1e9)) && g.arena.skins.ann.ak === undefined && g.arena.skins.ann.pistol.finish === 'web');
  ok('unknown slots and bad skins refused one by one', /2 set · 3 refused/.test(arenaApply(g, { type: 'skins', set: { ak: { finish: 'hex' }, m4: { finish: 'fade' }, he: { finish: 'fade' }, __proto__x: {}, sniper: { finish: 'fade', wear: 9 } } }, 'Ann', P, 1e9)));
  arenaApply(g, { type: 'skins', set: { ak: { finish: 'gold' }, m4s: { finish: 'tiger' }, mp9: { finish: 'gold' } }, fill: true }, 'Ann', P, 1e9);
  ok('fill: only slots the host has none for (the host\'s own win)', g.arena.skins.ann.ak.finish === 'hex' && g.arena.skins.ann.mp9.finish === 'web' && g.arena.skins.ann.m4s.finish === 'tiger');
  throws(() => arenaApply(g, { type: 'skins', set: Object.fromEntries(Array.from({ length: 41 }, (_, i) => ['s' + i, null])) }, 'Ann', P, 1e9), /40 skins/, '41 slots refused');
  throws(() => arenaApply(g, { type: 'skins', set: { ak: { finish: 'hex', name: 'x'.repeat(17000) } } }, 'Ann', P, 1e9), /16 KB/, 'over 16 KB refused');
  ok('clear all', /All skins back/.test(arenaApply(g, { type: 'skins', clearAll: true }, 'Ann', P, 1e9)) && !Object.keys(g.arena.skins.ann).length); }

// ── A pick in a live round waits for the freeze ──
{ const g = fresh(), r = g.combat.d.round; g.combat.d.teams = { ann: 't', bo: 'ct' };
  arenaApply(g, { type: 'skin', weapon: 'ak', skin: { finish: 'hex', st: true } }, 'Ann', P, 1e9); const s0 = g.arena.srev;
  r.phase = 'live'; r.freezeUntil = 0; r.endsAt = 4e15;
  ok('live: the reply says next round, the skin waits', /applies next round/.test(arenaApply(g, { type: 'skin', weapon: 'ak', skin: { finish: 'redline', st: true } }, 'Ann', P, 1e9)) && g.arena.skins.ann.ak.finish === 'hex' && g.arena.skinsNext.ann.ak.finish === 'redline' && g.arena.srev === s0);
  g.arena.loadout.ann = { primary: 'ak', secondary: 'pistol', nades: [] }; hurt(g, 'Ann', 'Bo', weaponById('ak'), 300, 'head', 1e9 + 5);
  ok('a kill meanwhile counts on the gun in hand', g.arena.skins.ann.ak.kills === 1 && g.arena.srev > s0);
  arenaTick(g, P, .05, 1e9 + 10); ok('still live: still waiting', g.arena.skins.ann.ak.finish === 'hex');
  r.phase = 'freeze'; arenaTick(g, P, .05, 1e9 + 20);
  ok('at the freeze: on, the kills kept', g.arena.skins.ann.ak.finish === 'redline' && g.arena.skins.ann.ak.kills === 1 && !g.arena.skinsNext, JSON.stringify(g.arena.skins.ann.ak)); }

// ── Darja gives a skin on a gun; the StatTrak count stays the player's ──
{ const g = fresh(); g.combat.d.teams = { ann: 't', bo: 'ct' }; g.arena.loadout.bo = { primary: 'm4', secondary: 'usps', nades: [] };
  ok('Darja gives Bo an M4 skin', /M4A4 \| Asiimov.*given to Bo/.test(arenaApply(g, { type: 'skin', weapon: 'm4', for: 'Bo', skin: { finish: 'asiimov', st: true } }, 'Darja', P, 1e9)), arenaApply(g, { type: 'skin', weapon: 'm4', for: 'Bo', skin: { finish: 'asiimov', st: true } }, 'Darja', P, 1e9));
  hurt(g, 'Bo', 'Ann', weaponById('m4'), 300, 'head', 1e9 + 5);
  arenaApply(g, { type: 'skin', weapon: 'm4', for: 'Bo', skin: { finish: 'hex', st: true, kills: 999 } }, 'Darja', P, 1e9 + 10);
  ok('another finish from Darja: his kill count stays his (never given)', g.arena.skins.bo.m4.finish === 'hex' && g.arena.skins.bo.m4.kills === 1, JSON.stringify(g.arena.skins.bo.m4));
  throws(() => arenaApply(g, { type: 'skins', for: 'Bo', set: { ak: { finish: 'hex' } } }, 'Ann', P, 1e9), /Only Darja/, 'only Darja gives skins to others (batch too)');
  ok('kept across a rematch', (rematch(g, P, 1e9 + 100), g.arena.skins.bo.m4.finish === 'hex')); }

// ── The save: round trip through the host's checks ──
{ const g = fresh(); arenaApply(g, { type: 'skin', weapon: 'ak', skin: { finish: 'hex', st: true } }, 'Ann', P, 1e9); g.arena.skins.ann.ak.kills = 7; arenaApply(g, { type: 'knife', knife: 'm9' }, 'Ann', P, 1e9);
  const back = cleanSkinSave(JSON.parse(JSON.stringify(skinSave(g.arena))));
  ok('save → read: skins, kills and knives back', back.skins.ann.ak.finish === 'hex' && back.skins.ann.ak.kills === 7 && back.knives.ann === 'm9' && back.dropped === 0, JSON.stringify(back));
  const bad = cleanSkinSave({ v: 1, skins: { ann: { ak: { finish: 'nope' }, he: { finish: 'fade' }, m4: { finish: 'web' } }, __proto__: {} }, knives: { bo: 'spoon', ann: 'karambit' } });
  ok('anything invalid in a save is dropped, the rest kept', bad.skins.ann.m4.finish === 'web' && !bad.skins.ann.ak && !bad.skins.ann.he && bad.knives.ann === 'karambit' && !bad.knives.bo && bad.dropped === 3, JSON.stringify(bad));
  ok('another version of the file: nothing read', Object.keys(cleanSkinSave({ v: 2, skins: { a: { ak: { finish: 'web' } } } }).skins).length === 0); }

// ── Through the room: kept across fresh() (the mode menu) and a host restart (gd-skins.json); a pack's skins-pack/ ──
const { startRoom } = await import('../lan/room.mjs'), { writeZip } = await import('../lan/zip.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gdskin-')), assets = path.join(tmp, 'assets'); mkdirSync(tmp + '/maps'); mkdirSync(assets);
const opts = { port: 0, bind: '127.0.0.1', savePath: path.join(tmp, 's.json'), roomCode: 'SKIN01', hostKey: 'k', mapsDir: tmp + '/maps', assetsDir: assets, log: () => {}, error: () => {} };
const wait = ms => new Promise(r => setTimeout(r, ms));
const client = room => { const base = 'http://127.0.0.1:' + room.port, post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  return { base, post, async join(name, hostKey) { const j = (await post('join', { code: 'SKIN01', name, ...(hostKey ? { hostKey } : {}) })).body; return { token: j.token, act: async a => { let rev = j.revision; for (let i = 0; i < 25; i++) { const r = await post('action', { revision: rev, action: a }, j.token); if (r.status !== 409) return r; rev = r.body.revision; } } }; } }; };
{ let room = await startRoom(opts), c = client(room); const host = await c.join('Ann', 'k');
  ok('the host starts a match from the mode menu', (await host.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'defuse', map: 'dust2', bots: 0 } })).status === 200);
  const A = () => room.world.operations.game.arena; await host.act({ type: 'arena', action: { type: 'skin', weapon: 'ak', skin: { finish: 'tiger' } } }); await host.act({ type: 'arena', action: { type: 'knife', knife: 'butterfly' } });
  ok('the skin is set', A().skins.ann?.ak?.finish === 'tiger');
  await host.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'dm', map: 'yard', bots: 0 } });
  ok('a new match from the mode menu (fresh game): skins and knife kept (v51 lost them)', A().skins.ann?.ak?.finish === 'tiger' && A().knives.ann === 'butterfly', JSON.stringify(A().skins));
  await host.act({ type: 'engineering', action: { type: 'mode', mode: 'free' } }); await host.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'dm', map: 'yard', bots: 0 } });
  ok('…and across a detour to another mode', A().skins.ann?.ak?.finish === 'tiger');
  await wait(60); await room.close();
  ok('the room saved them (gd-skins.json, atomic)', existsSync(path.join(tmp, 'gd-skins.json')) && JSON.parse(readFileSync(path.join(tmp, 'gd-skins.json'), 'utf8')).skins.ann.ak.finish === 'tiger' && !existsSync(path.join(tmp, 'gd-skins.json.tmp')));
  room = await startRoom(opts); c = client(room); const h2 = await c.join('Ann', 'k'); await h2.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'dm', map: 'yard', bots: 0 } });
  ok('a restarted host has them back', room.world.operations.game.arena.skins.ann?.ak?.finish === 'tiger' && room.world.operations.game.arena.knives.ann === 'butterfly');
  // An asset pack with CS2 finishes (skins-pack/): installed as the import tool installs (a backup of the old set, the catalogue read again).
  const png = (w, hh) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(hh, 20); return b; };
  const jpg = (w, hh) => Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, hh >> 8, hh & 255, w >> 8, w & 255, 3, ...Array(20).fill(0)]);
  const man = { version: 1, made: 'x', res: 64, source: {}, shared: {}, base: {}, knives: {}, weapons: { ak: { model: 'cs2_ak', uv: 0, len: 37, finishes: { cu_test: { name: 'Test', rarity: 'Covert', style: 7, wear: [0, 1], legacy: false, pearl: 0, fbId: 'redline', paint: 'ak/cu_test_paint.jpg', mrw: 'ak/cu_test_mrw.png' } } } } };
  mkdirSync(path.join(assets, 'skins'), { recursive: true }); writeFileSync(path.join(assets, 'skins', 'skins.json'), '{"version":1,"old":true}'); writeFileSync(path.join(assets, 'manifest.json'), '{"models":{}}');
  const zip = writeZip([{ name: 'infra-pack.json', data: Buffer.from('{}') }, { name: 'skins-pack/skins.json', data: Buffer.from(JSON.stringify(man)) }, { name: 'skins-pack/ak/cu_test_paint.jpg', data: jpg(64, 64) }, { name: 'skins-pack/ak/cu_test_mrw.png', data: png(64, 64) },
    { name: 'skins-pack/../evil.json', data: Buffer.from('{}') }, { name: 'assets/skins/skins.json', data: Buffer.from('{"overwrite":true}') }]);
  const r = await fetch(c.base + '/api/user-assets/pack', { method: 'POST', headers: { 'X-Player-Token': h2.token }, body: zip }), d = await r.json();
  ok('a pack\'s CS2 finishes installed from skins-pack/', r.status === 200 && d.skins === 3 && d.skinsNote === 'installed' && JSON.parse(readFileSync(path.join(assets, 'skins', 'skins.json'), 'utf8')).weapons.ak.finishes.cu_test.name === 'Test', JSON.stringify(d));
  ok('the old set backed up (skins.bak-…), nothing written outside, assets/skins/ in a pack never written over the set', readdirSync(assets).some(f => /^skins\.bak-/.test(f)) && JSON.parse(readFileSync(path.join(assets, readdirSync(assets).find(f => /^skins\.bak-/.test(f)), 'skins.json'), 'utf8')).old === true && !existsSync(path.join(tmp, 'evil.json')) && !existsSync(path.join(assets, 'evil.json')));
  ok('the host checks against the new catalogue now (the pick kept as CS2)', /AK-47 \| Test/.test(JSON.stringify((await h2.act({ type: 'arena', action: { type: 'skin', weapon: 'ak', skin: { finish: 'cs2:cu_test' } } })).body)) && room.world.operations.game.arena.skins.ann.ak.finish === 'cs2:cu_test');
  const again = await (await fetch(c.base + '/api/user-assets/pack', { method: 'POST', headers: { 'X-Player-Token': h2.token }, body: zip })).json();
  ok('the same pack again: unchanged (no backup used up)', again.skinsNote === 'unchanged' && readdirSync(assets).filter(f => /^skins\.bak-/.test(f)).length === 1, JSON.stringify(again));
  await room.close(); setSkinCatalog(null); }
ok('FINISHES: the 15 built-in ids kept (old ids stay valid everywhere)', ['none', 'fade', 'marble', 'doppler', 'sapphire', 'emerald', 'casehardened', 'web', 'tiger', 'asiimov', 'hex', 'camo', 'forest', 'redline', 'gold'].every(f => FINISHES[f]));
console.log(`PASS: skins as data · ${n} checks (a skin on every gun, none on grenades or the bomb; sticker limits by kind; CS2 finishes only from the host's catalogue, else their built-in look; wear clamped; old knife ids → CS2 knife finishes; batches capped; a live round's pick at the freeze; Darja on guns; kept across fresh, rematch and a host restart; a pack's CS2 finishes installed under the back-up rule)`);
