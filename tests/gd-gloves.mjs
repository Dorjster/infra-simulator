// CS2 gloves as skins (Global Defensive): the data, the host's checks, LAN and the pack — no Valve files needed (a
// synthetic gloves.json; tests/gd-gloves-view.mjs draws the real ones when this computer has them).
//  · one 'gloves' slot in a player's skins record ({ finish: 'cs2g:<kit>', wear }), checked by the host against its own
//    gloves.json (unknown kit, no catalogue, junk: refused; wear clamped into the finish's range); everyone picks any pair;
//    Darja gives; a live round's pick waits for the freeze; Clear all takes them off too;
//  · LAN: in the room's 'skins' message (small: ~40 bytes a player), never in the arena frame (only the catalogue's hash,
//    gloveCat); merged by the page as any slot; kept across a rematch, a new match from the mode menu, a host restart
//    (gd-skins.json) and a reconnect (the full table again); NET_PROTOCOL unchanged;
//  · the page's catalogue check (glove-assets.js validGloveManifest), type order (Sport Gloves first), wear steps and the
//    wear bake; what is loaded ahead for whom (skin-sync wantedGloves);
//  · an asset pack's gloves-pack/ installed under the back-up rule (gloves.bak-…), assets/gloves/ never written over.
//   node tests/gd-gloves.mjs
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cleanSkinNote, skinKindOf, setGloveCatalog, gloveEntry, cleanSkinSave, skinSave, takeSkinDelta, fullSkins, gloveCatalogHash, gloveTitle, GLOVE_TYPE_ORDER, setSkinCatalog } from '../dist/skins.js';
import { startArena, arenaApply, arenaTick, arenaView, rematch, NET_PROTOCOL } from '../dist/arena-logic.js';
import { mergeSkins } from '../dist/multiplayer.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const throws = (f, re, name) => { n++; assert.throws(f, re, name); };
const P = [{ name: 'Ann', pose: { x: 0, y: 9.7, z: 0 } }, { name: 'Bo', pose: { x: 5, y: 9.7, z: 0 } }, { name: 'Darja', pose: { x: 9, y: 9.7, z: 0 } }];
const fresh = () => { const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, 1e9); return g; };
// A synthetic catalogue in the import's shape (MANIFEST-FORMAT.md): two types, three finishes.
const fin = (kit, type, name) => ({ id: kit, paintKit: 10000 + kit.length, name, rarity: 'ancient', rarityName: 'Extraordinary', type, shader: 'v1', color: `${type}/${kit}_color.jpg`, normal: `${type}/${kit}_normal.png`, orm: `${type}/${kit}_orm.png`, wear: `${type}/${kit}_wear.png`, icon: `icons/${type}/${kit}.webp`, wearRange: [.06, .8], wearLook: { brightness: -.26, saturation: -.2, roughness: .75 }, cloth: true, roughMean: .5, metalMean: 0, fallback: '#6c7890' });
const MAN = { version: 1, made: '2026-11-01T00:00:00Z', res: 64, source: { s2v: 'test' }, skeleton: { hash: 'h', bones: 52, from: 'arms-test.glb' },
  types: { slick: { id: 'slick', name: 'Driver Gloves', item: 'slick_gloves', defindex: 5031, mesh: 'meshes/glove-slick.glb', skeleton: 'h', meshes: {}, default: null, finishes: ['slick_test_red'] },
    sporty: { id: 'sporty', name: 'Sport Gloves', item: 'sporty_gloves', defindex: 5030, mesh: 'meshes/glove-sporty.glb', skeleton: 'h', meshes: {}, default: null, finishes: ['sporty_test_a', 'sporty_test_b'] } },
  finishes: { sporty_test_a: fin('sporty_test_a', 'sporty', 'Test A'), sporty_test_b: fin('sporty_test_b', 'sporty', 'Test B'), slick_test_red: fin('slick_test_red', 'slick', 'Test Red') } };

// ── The host's check ──
setGloveCatalog(null); setSkinCatalog(null);
ok('one slot for gloves beside the knife and guns', skinKindOf('gloves') === 'gloves' && skinKindOf('glove') === null);
throws(() => cleanSkinNote({ finish: 'cs2g:sporty_test_a', wear: .1 }, 'gloves'), /not imported on the host/, 'no catalogue on the host: refused (no gloves)');
setGloveCatalog(MAN);
ok('the catalogue is the host\'s (hash for the arena frame)', !!gloveCatalogHash() && gloveEntry('sporty_test_a')?.type === 'sporty' && gloveEntry({ finish: 'cs2g:slick_test_red' })?.name === 'Test Red' && !gloveEntry('nope'));
{ const r = cleanSkinNote({ finish: 'cs2g:sporty_test_a', wear: .25, seed: 7, stickers: [{ id: 'gg' }], name: 'x', st: true, kills: 99 }, 'gloves').skin;
  ok('a pick stored as { finish, wear } only (no seed, stickers, name tag or StatTrak on gloves)', JSON.stringify(r) === '{"finish":"cs2g:sporty_test_a","wear":0.25}', JSON.stringify(r)); }
ok('wear clamped into the finish\'s range (CS2: 0.06 – 0.80)', cleanSkinNote({ finish: 'cs2g:sporty_test_a', wear: 0 }, 'gloves').skin.wear === .06 && cleanSkinNote({ finish: 'cs2g:sporty_test_a', wear: 1 }, 'gloves').skin.wear === .8 && cleanSkinNote({ finish: 'cs2g:sporty_test_a' }, 'gloves').skin.wear === .06);
throws(() => cleanSkinNote({ finish: 'cs2g:nope', wear: .1 }, 'gloves'), /not imported/, 'an unknown kit: refused');
throws(() => cleanSkinNote({ finish: 'cs2k:aa_fade' }, 'gloves'), /Unknown gloves/, 'a knife finish is not gloves');
throws(() => cleanSkinNote({ finish: 'cs2g:../x' }, 'gloves'), /Unknown gloves/, 'a path in a kit: refused');
throws(() => cleanSkinNote({ finish: 'cs2g:sporty_test_a', wear: 'lots' }, 'gloves'), /Wear must be a number/, 'junk wear: refused');
throws(() => cleanSkinNote(null, 'gloves'), /No gloves/, 'nothing: refused');
ok('their title as CS2 shows it', gloveTitle({ finish: 'cs2g:sporty_test_b', wear: .2 }) === '★ Sport Gloves | Test B (Field-Tested)' && gloveTitle(null) === 'Default gloves');
ok('Sport Gloves first, then CS2\'s order', GLOVE_TYPE_ORDER[0] === 'sporty' && GLOVE_TYPE_ORDER.length === 8);

// ── Picks through the rules (arena-logic 'skin' / 'skins') ──
{ const g = fresh(); const A = () => g.arena;
  ok('everyone picks a pair (as knives)', /Sport Gloves \| Test A/.test(arenaApply(g, { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:sporty_test_a', wear: .3 } }, 'Ann', P, 1e9)) && A().skins.ann.gloves.finish === 'cs2g:sporty_test_a' && A().skins.ann.gloves.wear === .3);
  ok('…Bo too, another type', /Driver Gloves/.test(arenaApply(g, { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:slick_test_red', wear: .5 } }, 'Bo', P, 1e9)) && A().skins.bo.gloves.finish === 'cs2g:slick_test_red');
  throws(() => arenaApply(g, { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:nope' } }, 'Ann', P, 1e9), /not imported/, 'an unknown kit through the rules: refused, the old pair kept');
  ok('…the old pair kept', A().skins.ann.gloves.finish === 'cs2g:sporty_test_a');
  throws(() => arenaApply(g, { type: 'skin', weapon: 'gloves', for: 'Ann', skin: { finish: 'cs2g:sporty_test_b' } }, 'Bo', P, 1e9), /Only Darja/, 'only Darja gives gloves to others');
  ok('Darja gives a pair', /given to Bo/.test(arenaApply(g, { type: 'skin', weapon: 'gloves', for: 'Bo', skin: { finish: 'cs2g:sporty_test_b', wear: .07 } }, 'Darja', P, 1e9)) && A().skins.bo.gloves.finish === 'cs2g:sporty_test_b');
  ok('a batch (a page restoring its own after a join) takes gloves too', /1 set/.test(arenaApply(g, { type: 'skins', set: { gloves: { finish: 'cs2g:slick_test_red', wear: .4 } } }, 'Darja', P, 1e9)) && A().skins.darja.gloves.finish === 'cs2g:slick_test_red');
  ok('back to the agent\'s own gloves', /Default gloves/.test(arenaApply(g, { type: 'skin', weapon: 'gloves', clear: true }, 'Darja', P, 1e9)) && !A().skins.darja?.gloves);
  // A live round: waits for the freeze.
  const r = g.combat.d.round; r.phase = 'live'; r.freezeUntil = 0; r.endsAt = 4e15; const s0 = A().srev;
  ok('live: the pick waits for the next freeze', /applies next round/.test(arenaApply(g, { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:sporty_test_b', wear: .1 } }, 'Ann', P, 1e9)) && A().skins.ann.gloves.finish === 'cs2g:sporty_test_a' && A().skinsNext.ann.gloves.finish === 'cs2g:sporty_test_b' && A().srev === s0);
  r.phase = 'over'; r.overAt = 1e9; arenaTick(g, P, .05, 1e9 + 1e7); for (let i = 0; i < 4 && A().skinsNext; i++) arenaTick(g, P, .05, 1e9 + 2e7 + i);
  ok('at the freeze: on', A().skins.ann.gloves.finish === 'cs2g:sporty_test_b' && !A().skinsNext, JSON.stringify(A().skins.ann));
  // LAN: the arena frame carries none; the skins message is small.
  const v = JSON.stringify(arenaView(g)); ok('the arena frame carries no gloves (only the catalogue\'s hash: gloveCat)', !/cs2g:|"gloves"/.test(v) && JSON.parse(v).gloveCat === gloveCatalogHash());
  takeSkinDelta(A()); arenaTick(g, P, .05, 1e9 + 3e7); r.phase = 'freeze'; arenaApply(g, { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:sporty_test_a', wear: .123456 } }, 'Ann', P, 1e9 + 3e7); const d = takeSkinDelta(A()), dj = JSON.stringify(d);
  ok('a pick\'s skins message: one slot, small (≤ 90 bytes for a player)', d && Object.keys(d.set).length === 1 && JSON.stringify(d.set.ann) === '{"gloves":{"finish":"cs2g:sporty_test_a","wear":0.123456}}' && dj.length <= 90, dj + ' (' + dj.length + ' B)');
  ok('NET_PROTOCOL unchanged (gd-52): no existing message changed its format', NET_PROTOCOL === 'gd-52');
  // The page's merge: gloves a slot like any other; a reconnect's full table brings them back.
  const G = { mode: 'arena', arena: { match: 'm1' } }, R = { skins: 0, skinsTable: null };
  ok('merged from the full table (a join or reconnect)', mergeSkins(G, fullSkins(A()), R) && G.arena.skins.ann.gloves.finish === 'cs2g:sporty_test_a' && G.arena.skins.bo.gloves.finish === 'cs2g:sporty_test_b');
  const kept = G.arena.skins.bo.gloves; ok('a change to Ann: Bo\'s record keeps its identity (views compare records, not contents)', mergeSkins(G, { srev: (R.skins || 0) + 1, set: { ann: { gloves: null } } }, R) && !G.arena.skins.ann?.gloves && G.arena.skins.bo.gloves === kept);
  // Kept across a rematch, Clear all takes them off.
  rematch(g, P, 1e9 + 4e7); ok('kept across a rematch', A().skins.ann.gloves.finish === 'cs2g:sporty_test_a');
  r.phase = 'freeze'; g.combat.d.round.phase = 'freeze'; arenaApply(g, { type: 'skins', clearAll: true }, 'Bo', P, 1e9 + 5e7); ok('Clear all: the gloves too', !A().skins.bo?.gloves); }

// ── The save (gd-skins.json) ──
{ const g = fresh(); arenaApply(g, { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:slick_test_red', wear: .44 } }, 'Ann', P, 1e9); arenaApply(g, { type: 'skin', weapon: 'ak', skin: { finish: 'hex' } }, 'Ann', P, 1e9);
  const back = cleanSkinSave(JSON.parse(JSON.stringify(skinSave(g.arena))));
  ok('save → read: the gloves back with the skins', back.skins.ann.gloves.finish === 'cs2g:slick_test_red' && back.skins.ann.gloves.wear === .44 && back.skins.ann.ak.finish === 'hex' && back.dropped === 0, JSON.stringify(back));
  const bad = cleanSkinSave({ v: 1, skins: { ann: { gloves: { finish: 'cs2g:gone' } }, bo: { gloves: { finish: 'cs2g:sporty_test_a', wear: 9 } } } });
  ok('a pair the host no longer has: dropped; a wear out of range: refused', !bad.skins.ann?.gloves && !bad.skins.bo?.gloves && bad.dropped === 2, JSON.stringify(bad));
  setGloveCatalog(null); const none = cleanSkinSave(JSON.parse(JSON.stringify(skinSave(g.arena))));
  ok('a host without gloves.json reads the save without them (the skins kept)', !none.skins.ann.gloves && none.skins.ann.ak.finish === 'hex' && none.dropped === 1); setGloveCatalog(MAN); }

// ── The page's side (glove-assets.js, skin-sync.js): catalogue check, order, wear steps and bake, what to load for whom ──
{ const GA = await import('../dist/glove-assets.js'), { wantedGloves } = await import('../dist/skin-sync.js'); GA.setGloveLoader({ image: () => new Promise(() => {}), buf: () => new Promise(() => {}) });   // (nothing fetched here: tests/gd-gloves-view.mjs loads real files)
  ok('the page\'s check accepts the import\'s shape', GA.validGloveManifest(MAN) && !GA.validGloveManifest({ ...MAN, version: 2 }) && !GA.validGloveManifest({ ...MAN, finishes: { 'x/../y': MAN.finishes.sporty_test_a } }) && !GA.validGloveManifest({ ...MAN, finishes: { a: { ...MAN.finishes.sporty_test_a, type: 'nope' } } }));
  await GA.loadGloveManifest(false, MAN); ok('the page\'s catalogue → skins.js (names, solo play\'s checks)', GA.gloveManifest() === MAN && !!gloveEntry('sporty_test_a'));
  ok('types: Sport Gloves first (CS2\'s order), with their counts', JSON.stringify(GA.gloveTypeList().map(t => t.id + ':' + t.count)) === '["sporty:2","slick:1"]');
  ok('finishes of a type in CS2\'s order, icons by kit', GA.gloveFinishes('sporty').map(f => f.kit).join() === 'sporty_test_a,sporty_test_b' && /icons\/sporty\/sporty_test_a\.webp\?m=/.test(GA.gloveIconURL('sporty_test_a')) && GA.gloveIconURL('nope') === null);
  ok('wear steps: Factory New and below unworn, else 0.02 steps inside the range', GA.wearBucket(.03, [.06, .8]) === 0 && GA.wearBucket(.0699, [.06, .8]) === 0 && GA.wearBucket(.123, [.06, .8]) === .12 && GA.wearBucket(.99, [.06, .8]) === .8 && GA.wearBucket(NaN, [.06, .8]) === 0);
  ok('one texture set per (kit, wear step, tier), shared', GA.gloveTex('sporty_test_a', .121, 'fp') === GA.gloveTex('sporty_test_a', .119, 'fp') && GA.gloveTex('sporty_test_a', .12, 'fp') !== GA.gloveTex('sporty_test_a', .12, 'tp') && GA.gloveTex('nope', 0) === null);
  { const px = new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 255]), wr = new Uint8ClampedArray([10, 0, 0, 255, 250, 0, 0, 255]), worn = GA.bakeWear(px, wr, 2, .5, { brightness: -.25, saturation: -1 });
    ok('the wear bake: only texels whose threshold the wear passed, darker and greyer', worn === 1 && px[0] === px[1] && px[1] === px[2] && px[0] < 150 && px[4] === 200 && px[5] === 100, Array.from(px).join()); }
  const L = GA.gloveLook({ finish: 'cs2g:sporty_test_a', wear: .3 }, 'fp');
  ok('a record → its type, its pictures (queued) and its 1×1 fallback set (the same maps: colour, normal, ORM)', L.type.type === 'sporty' && L.tex.tier === 'fp' && L.fb.tex.color.image.data.join() === '108,120,144,255' && L.fb.tex.normal && L.fb.tex.orm && GA.gloveLook(null, 'fp') === null && GA.gloveLook({ finish: 'cs2g:nope' }, 'tp') === null);
  const A = { skins: { ann: { gloves: { finish: 'cs2g:sporty_test_a', wear: .1 } }, bo: { gloves: { finish: 'cs2g:slick_test_red', wear: .1 } }, cy: { gloves: { finish: 'cs2g:sporty_test_b', wear: .1 } }, dee: { ak: {} } } };
  const w = (teams, me) => wantedGloves(A, teams, me).map(x => x.rec.finish.slice(5).split('_').pop() + ':' + x.tier).sort().join();
  ok('loaded ahead: everyone\'s at tp (their agents), yours and your side\'s at fp (spectating shows theirs)', w({ ann: 'ct', bo: 'ct', cy: 't' }, 'ann') === 'a:fp,b:tp,red:fp,red:tp', w({ ann: 'ct', bo: 'ct', cy: 't' }, 'ann'));
  ok('…a spectator: everyone\'s at fp; deathmatch (no sides): only yours', w({ ann: 'spec', bo: 'ct', cy: 't' }, 'ann') === 'a:fp,b:fp,b:tp,red:fp,red:tp' && w(null, 'ann') === 'a:fp,b:tp,red:tp');
  GA.resetGloves(); setGloveCatalog(MAN); }

// ── Through the room: kept across a new match and a host restart; a pack's gloves-pack/ under the back-up rule ──
const { startRoom } = await import('../lan/room.mjs'), { writeZip } = await import('../lan/zip.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gdgloves-')), assets = path.join(tmp, 'assets'); mkdirSync(tmp + '/maps'); mkdirSync(assets);
// The installed catalogue the room reads at start (gloves/gloves.json), and a pack's: synthetic files the check reads (headers, a skinned glb).
const png = (w, h) => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const webp = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };
const NAMES = Array.from({ length: 52 }, (_, i) => `bone_${i}`), ibm = new Float32Array(52 * 16); NAMES.forEach((_, i) => { for (let k = 0; k < 4; k++) ibm[i * 16 + k * 5] = 1; ibm[i * 16 + 12] = -.01 * i; });
const glb = (() => { const bin = Buffer.from(ibm.buffer), J = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'root', children: NAMES.map((_, i) => i + 1) }, ...NAMES.map(n => ({ name: n }))], skins: [{ joints: NAMES.map((_, i) => i + 1), inverseBindMatrices: 0 }], accessors: [{ bufferView: 0, componentType: 5126, count: 52, type: 'MAT4' }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }], buffers: [{ byteLength: bin.length }] };
  let js = Buffer.from(JSON.stringify(J)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]); const h = Buffer.alloc(12); h.write('glTF', 0, 'latin1'); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const c = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; }; return Buffer.concat([h, c(js.length, 0x4e4f534a), js, c(bin.length, 0x004e4942), bin]); })();
const hash = createHash('sha1').update(NAMES.join(',') + '|' + Array.from(ibm, x => Math.floor(x * 1e4 + .5)).join(',')).digest('hex');
const manFor = m => { const x = JSON.parse(JSON.stringify(m)); x.skeleton.hash = hash; for (const t of Object.values(x.types)) t.skeleton = hash; return x; };
const filesOf = m => [['gloves.json', Buffer.from(JSON.stringify(m))], ...Object.values(m.types).map(t => [t.mesh, glb]), ...Object.values(m.finishes).flatMap(f => [[f.color, jpg(64, 64)], [f.normal, png(64, 64)], [f.orm, png(64, 64)], [f.wear, png(512, 512)], [f.icon, webp(256, 192)]])];
const OLD = manFor({ ...MAN, made: 'old', types: { sporty: { ...MAN.types.sporty, finishes: ['sporty_test_a'] } }, finishes: { sporty_test_a: MAN.finishes.sporty_test_a } });
for (const [rel, data] of filesOf(OLD)) { const f = path.join(assets, 'gloves', rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, data); }
writeFileSync(path.join(assets, 'manifest.json'), '{"models":{}}');
const opts = { port: 0, bind: '127.0.0.1', savePath: path.join(tmp, 's.json'), roomCode: 'GLOV01', hostKey: 'k', mapsDir: tmp + '/maps', assetsDir: assets, log: () => {}, error: () => {} };
const wait = ms => new Promise(r => setTimeout(r, ms));
const client = room => { const base = 'http://127.0.0.1:' + room.port, post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  return { base, post, async join(name, hostKey) { const j = (await post('join', { code: 'GLOV01', name, ...(hostKey ? { hostKey } : {}) })).body; return { token: j.token, act: async a => { let rev = j.revision; for (let i = 0; i < 25; i++) { const r = await post('action', { revision: rev, action: a }, j.token); if (r.status !== 409) return r; rev = r.body.revision; } } }; } }; };
setGloveCatalog(null);
{ let room = await startRoom(opts), c = client(room); const host = await c.join('Ann', 'k'); const A = () => room.world.operations.game.arena;
  await host.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'defuse', map: 'dust2', bots: 0 } });
  ok('the room read its gloves.json at start (a pick is checked against it)', (await host.act({ type: 'arena', action: { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:sporty_test_a', wear: .2 } } })).status === 200 && A().skins.ann?.gloves?.finish === 'cs2g:sporty_test_a');
  ok('…and refuses a kit it has not imported', (await host.act({ type: 'arena', action: { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:slick_test_red' } } })).status !== 200 && A().skins.ann.gloves.finish === 'cs2g:sporty_test_a');
  ok('the room serves gloves.json and the icons (/user-assets/gloves/…)', (await fetch(c.base + '/user-assets/gloves/gloves.json')).status === 200 && (await fetch(c.base + '/user-assets/gloves/icons/sporty/sporty_test_a.webp')).headers.get('content-type') === 'image/webp');
  await host.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'dm', map: 'yard', bots: 0 } });
  ok('a new match from the mode menu: the gloves kept', A().skins.ann?.gloves?.finish === 'cs2g:sporty_test_a');
  await wait(60); await room.close();
  ok('saved with the skins (gd-skins.json)', JSON.parse(readFileSync(path.join(tmp, 'gd-skins.json'), 'utf8')).skins.ann.gloves.finish === 'cs2g:sporty_test_a');
  setGloveCatalog(null); room = await startRoom(opts); c = client(room); const h2 = await c.join('Ann', 'k'); await h2.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'dm', map: 'yard', bots: 0 } });
  ok('a restarted host has them back (its gloves.json read before the save)', room.world.operations.game.arena.skins.ann?.gloves?.finish === 'cs2g:sporty_test_a');
  // A pack with the new bake under gloves-pack/ (and an assets/gloves/ entry that must never land over the set).
  const NEW = manFor(MAN), zip = writeZip([{ name: 'infra-pack.json', data: Buffer.from('{}') }, ...filesOf(NEW).map(([rel, data]) => ({ name: 'gloves-pack/' + rel, data })),
    { name: 'gloves-pack/../evil.json', data: Buffer.from('{}') }, { name: 'assets/gloves/gloves.json', data: Buffer.from('{"overwrite":true}') }]);
  const r = await fetch(c.base + '/api/user-assets/pack', { method: 'POST', headers: { 'X-Player-Token': h2.token }, body: zip }), d = await r.json();
  ok('a pack\'s CS2 gloves installed from gloves-pack/', r.status === 200 && d.glovesNote === 'installed' && d.gloves === filesOf(NEW).length && JSON.parse(readFileSync(path.join(assets, 'gloves', 'gloves.json'), 'utf8')).finishes.slick_test_red?.name === 'Test Red', JSON.stringify(d));
  const bak = readdirSync(assets).find(f => /^gloves\.bak-/.test(f));
  ok('the old set backed up (gloves.bak-…), nothing written outside, assets/gloves/ in a pack never written over the set', !!bak && JSON.parse(readFileSync(path.join(assets, bak, 'gloves.json'), 'utf8')).made === 'old' && !existsSync(path.join(tmp, 'evil.json')) && !existsSync(path.join(assets, 'evil.json')) && !JSON.parse(readFileSync(path.join(assets, 'gloves', 'gloves.json'), 'utf8')).overwrite);
  ok('the host checks against the new catalogue now', (await h2.act({ type: 'arena', action: { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:slick_test_red', wear: .3 } } })).status === 200 && room.world.operations.game.arena.skins.ann.gloves.finish === 'cs2g:slick_test_red');
  const again = await (await fetch(c.base + '/api/user-assets/pack', { method: 'POST', headers: { 'X-Player-Token': h2.token }, body: zip })).json();
  ok('the same pack again: unchanged (no backup used up)', again.glovesNote === 'unchanged' && readdirSync(assets).filter(f => /^gloves\.bak-/.test(f)).length === 1, JSON.stringify(again));
  await room.close(); setGloveCatalog(null); }

// ── The importer packs them only when asked (tools/import-cs2-models.mjs --with-gloves; the app copy under the same rule) ──
{ const src = readFileSync(new URL('../tools/import-cs2-models.mjs', import.meta.url), 'utf8'), forge = readFileSync(new URL('../desktop/forge.config.cjs', import.meta.url), 'utf8');
  ok('import-cs2-models: gloves/ left out of the hash, app copy and pack unless --with-gloves, then as gloves-pack/ and installGloves in the app', /GLOVES = \/\^gloves\(\$\|\[\.\]\)\//.test(src) && /SKINS\.test\(e\.name\) \|\| GLOVES\.test\(e\.name\)/.test(src) && /'gloves-pack\/'/.test(src) && /installGloves\(\{ assets: path\.join\(app, 'assets'\)/.test(src) && /--with-gloves/.test(src));
  ok('the desktop app carries tools/cs2-gloves/manifest.mjs (installPack imports it for gloves-pack/)', /cs2-gloves', 'manifest\.mjs'/.test(forge)); }
console.log(`PASS: CS2 gloves as skins · ${n} checks (one 'gloves' slot, the host's catalogue, wear clamped, everyone picks, Darja gives, a live pick at the freeze; small skins message, never the arena frame; merged, kept across rematch, a new match, a restart and a reconnect; the page's catalogue, order, wear steps and bake, what loads for whom; gloves-pack/ under the back-up rule; --with-gloves)`);
