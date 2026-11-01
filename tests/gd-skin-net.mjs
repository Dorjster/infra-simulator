// Skins over LAN (lan/room.mjs, multiplayer.js mergeSkins / mergeGdFrame): skins are not in the arena frame — 10 players
// with a skin on every gun reached 28–140 KB a frame (over the stream's 128 KB limit) — but in their own 'skins' message
// by srev: the whole table on a join, a reconnect or a new match, then only what changed (a pick, a StatTrak kill, the
// picks of a live round landing at the freeze). A page keeps them across arena frames and world snapshots (which carry
// none). The arena frame names the host's CS2 catalogue (skinCat) so a page re-fetches it when it changes.
//   node tests/gd-skin-net.mjs
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path'; import { mkdtempSync, mkdirSync } from 'node:fs';
import { startRoom } from '../lan/room.mjs'; import { mergeGdFrame, mergeSkins } from '../dist/multiplayer.js';
import { startArena, arenaApply, arenaView, NET_PROTOCOL } from '../dist/arena-logic.js';
import { takeSkinDelta, fullSkins, setSkinCatalog, STICKER_IDS, skinFor } from '../dist/skins.js';
import { WEAPONS } from '../dist/weapons-data.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
setSkinCatalog(null);

// ── Sizes: 10 players, a skin with stickers and a name tag on every gun ──
{ const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, 1e9); const names = Array.from({ length: 10 }, (_, i) => 'Player ' + i), P = names.map(name => ({ name, pose: { x: 0, y: 9.7, z: 0 } }));
  for (const nm of names) { for (const w of WEAPONS) { const max = w.kind === 'pistol' ? 4 : 5; arenaApply(g, { type: 'skin', weapon: w.id, skin: { finish: 'casehardened', wear: .123456, seed: 661, st: true, name: 'Twenty letters here!', stickers: Array.from({ length: max }, (_, i) => ({ id: STICKER_IDS[i], slot: i, x: .6512, y: .4612, scale: 1.234, rot: -12.5, wear: .123 })) } }, nm, P, 1e9); }
    arenaApply(g, { type: 'skin', weapon: 'knife', skin: { finish: 'fade', st: true, name: 'Twenty letters here!' } }, nm, P, 1e9); g.arena.loadout[nm.toLowerCase()] = { primary: 'ak', secondary: 'deagle', nades: ['he', 'flash'], own: { primary: { w: 'ak', k: 'player 3' } } }; }
  const v = JSON.stringify(arenaView(g)); ok('the arena frame carries no skins (arenaView)', !/"skins"|"skinsNext"|"srev"|casehardened/.test(v));
  ok('…and stays small with 10 fully skinned players: < 4 KB', v.length < 4096, v.length + ' B');
  const all = JSON.stringify(fullSkins(g.arena)), d = takeSkinDelta(g.arena), one = JSON.stringify({ srev: 1, set: { 'player 0': g.arena.skins['player 0'] } });
  ok('one player\'s whole set (28 skins, stickers, name tags) in one skins message: < 16 KB', one.length < 16384, one.length + ' B');
  ok('the change log after those picks names every (player, slot) once', Object.keys(d.set).length === 10 && Object.keys(d.set['player 0']).length === 28 && !g.arena.skinsDirty);
  console.log(`  sizes: arena frame ${v.length} B · one player's skins ${one.length} B · everyone's (join) ${all.length} B`); }

// ── The page's merge: by srev, kept across arena frames ──
{ const G = { mode: 'arena', arena: { match: 'm1' } }, R = { combat: 0, arena: 0, loadout: 0, match: null, skins: 0, skinsTable: null };
  ok('the whole table', mergeSkins(G, { srev: 5, full: true, set: { ann: { ak: { finish: 'web' }, knife: { finish: 'fade' } }, bo: { m4: { finish: 'hex' } } } }, R) && G.arena.srev === 5 && G.arena.skins.ann.ak.finish === 'web');
  const t1 = G.arena.skins; ok('a change: just that slot (a new table object, others kept)', mergeSkins(G, { srev: 6, set: { ann: { ak: { finish: 'gold' } } } }, R) && G.arena.skins !== t1 && G.arena.skins.ann.ak.finish === 'gold' && G.arena.skins.ann.knife.finish === 'fade' && G.arena.skins.bo.m4.finish === 'hex');
  ok('an older or repeated one is ignored', !mergeSkins(G, { srev: 6, set: { ann: { ak: { finish: 'none' } } } }, R) && !mergeSkins(G, { srev: 3, set: { ann: null } }, R) && G.arena.skins.ann.ak.finish === 'gold');
  ok('a slot cleared, a player gone', mergeSkins(G, { srev: 7, set: { ann: { knife: null }, bo: null } }, R) && !G.arena.skins.ann.knife && !G.arena.skins.bo);
  mergeGdFrame(G, { arena: { match: 'm1', map: 'dust2', loadout: {} }, arev: 1, lrev: 1, rev: 1 }, R);
  ok('an arena frame (no skins in it) keeps them, and the srev', G.arena.map === 'dust2' && G.arena.skins.ann.ak.finish === 'gold' && G.arena.srev === 7);
  ok('a full table from a restarted host (lower srev) is still taken', mergeSkins(G, { srev: 1, full: true, set: { cy: { ak: { finish: 'tiger' } } } }, R) && !G.arena.skins.ann && G.arena.skins.cy.ak.finish === 'tiger' && R.skins === 1);
  const G2 = { mode: 'free' }, R2 = { combat: 0, arena: 0, loadout: 0, match: null, skins: 0, skinsTable: null };
  mergeSkins(G2, { srev: 3, full: true, set: { ann: { ak: { finish: 'web' } } } }, R2); mergeGdFrame(Object.assign(G2, { mode: 'arena' }), { arena: { match: 'x' }, arev: 1, rev: 1 }, R2);
  ok('skins that came before the arena: put on it when it comes', G2.arena.skins.ann.ak.finish === 'web' && G2.arena.srev === 3); }

// ── Through the room ──
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gdskn-')); mkdirSync(tmp + '/maps'); mkdirSync(tmp + '/assets');
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(tmp, 's.json'), roomCode: 'SKN001', hostKey: 'k', mapsDir: tmp + '/maps', assetsDir: tmp + '/assets', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, wait = ms => new Promise(r => setTimeout(r, ms)), game = () => room.world.operations.game;
const post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(20); } return !!f(); };
async function player(name, hostKey) {
  const j = (await post('join', { code: 'SKN001', name, ...(hostKey ? { hostKey } : {}) })).body; if (!j.token) throw Error('join: ' + JSON.stringify(j));
  const P = { name: j.name, token: j.token, revision: j.revision, G: j.world?.operations || { mode: 'free' }, R: { combat: 0, arena: j.arev || 0, loadout: j.lrev || 0, match: null, skins: 0, skinsTable: null }, msgs: [], world: [] };
  P.open = () => { P.ac = new AbortController(); fetch(base + '/api/events?token=' + P.token, { signal: P.ac.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (!data) continue; const d = JSON.parse(data);
        if (type === 'world') { P.world.push(data); if (d.revision > P.revision) { P.revision = d.revision; const keep = P.R.skinsTable; P.G = d.world.operations; if (P.G.arena && keep) { P.G.arena.skins = keep; P.G.arena.srev = P.R.skins; } } }
        else if (type === 'combat') { P.msgs.push({ type, data }); mergeGdFrame(P.G, d, P.R); }
        else if (type === 'skins') { P.msgs.push({ type, data, d }); mergeSkins(P.G, d, P.R); } } } }).catch(e => { if (e.name !== 'AbortError') console.error('stream', P.name, e); }); };
  P.open(); P.act = async a => { let r; for (let i = 0; i < 25; i++) { r = await post('action', { revision: P.revision, action: a }, P.token); if (r.status !== 409 || !Number.isInteger(r.body.revision)) break; P.revision = r.body.revision; } r.raw = JSON.stringify(r.body); if (r.body.gd) mergeGdFrame(P.G, r.body.gd, P.R); if (r.body.revision > P.revision) P.revision = r.body.revision; return r; };
  return P; }
const ann = await player('Ann', 'k'), bo = await player('Bo');
ok('the room speaks this protocol', (await (await fetch(base + '/api/room')).json()).gd === NET_PROTOCOL);
await ann.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'defuse', map: 'dust2', bots: 0 } });
ok('a new match: everyone gets the whole skins table', await until(() => bo.msgs.some(m => m.type === 'skins' && m.d.full)), JSON.stringify(bo.msgs.map(m => m.type)) + game().mode);
const r1 = await ann.act({ type: 'arena', action: { type: 'skin', weapon: 'ak', skin: { finish: 'redline', st: true } } });
ok('Ann picks an AK skin: Bo gets it in a skins message', await until(() => bo.G.arena?.skins?.ann?.ak?.finish === 'redline'), JSON.stringify(bo.G.arena?.skins));
ok('…not in the arena frame (reply nor stream)', r1.raw.includes('"arena"') && !r1.raw.includes('redline') && bo.msgs.filter(m => m.type === 'combat').every(m => !m.data.includes('redline')));
const s0 = bo.G.arena.srev; await wait(120);
ok('after other arena frames Bo still has it (srev kept)', bo.G.arena.skins.ann.ak.finish === 'redline' && bo.G.arena.srev === s0 && skinFor(bo.G.arena, 'Ann', 'ak').finish === 'redline');
// StatTrak kill → the new count reaches everyone (a small message: one slot)
{ const g = game(); g.combat.d.teams = { ann: 't', bo: 'ct' }; g.arena.loadout.ann = { primary: 'ak', secondary: 'pistol', nades: [] }; const { hurt } = await import('../dist/combat-logic.js'); const before = bo.msgs.length;
  hurt(g, 'Ann', 'Bo', (await import('../dist/weapons-data.js')).weaponById('ak'), 300, 'head', Date.now());
  ok('a StatTrak kill: the count reaches Bo', await until(() => bo.G.arena.skins.ann.ak.kills === 1));
  const m = bo.msgs.slice(before).find(x => x.type === 'skins'); ok('…in a message of that one slot', m && Object.keys(m.d.set).length === 1 && Object.keys(m.d.set.ann).length === 1 && m.data.length < 400, m?.data); }
// A live round: the pick waits, then lands at the freeze
{ const g = game(), r = g.combat.d.round; r.phase = 'live'; r.freezeUntil = 0; r.endsAt = Date.now() + 1e9; const rr = await ann.act({ type: 'arena', action: { type: 'skin', weapon: 'm4', skin: { finish: 'hex' } } });
  await wait(150); ok('in a live round: "applies next round", nobody draws it yet', /next round/.test(JSON.stringify(rr.body)) && !bo.G.arena.skins.ann.m4);
  r.phase = 'freeze'; r.freezeUntil = Date.now() + 15000; ok('at the freeze it reaches everyone', await until(() => bo.G.arena.skins.ann.m4?.finish === 'hex')); }
// A world snapshot carries no skins; a reconnect gets the whole table
{ await ann.act({ type: 'chat-noop' }).catch(() => {}); const snap = (await post('action', { revision: -1, action: { type: 'arena', action: { type: 'ready' } } }, bo.token)).body;
  const j = await post('join', { code: 'SKN001', name: 'Cy' }); ok('world snapshots (a join\'s, a refused action\'s) carry no skins', !JSON.stringify(j.body.world).includes('"skins"') && !JSON.stringify(j.body.world).includes('redline'));
  bo.ac.abort(); bo.R.skinsTable = null; bo.G.arena.skins = {}; bo.R.skins = 0; await wait(50); bo.open();
  ok('a reconnect: the whole table again', await until(() => bo.G.arena.skins?.ann?.ak?.finish === 'redline' && bo.G.arena.skins.ann.m4?.finish === 'hex')); }
// The catalogue: the arena frame names it; a new one → a new name (the page re-fetches skins.json)
{ const h0 = arenaView(game()).skinCat; setSkinCatalog({ version: 1, weapons: { ak: { finishes: { cu_x: { name: 'X', wear: [0, 1], fbId: 'web' } } } }, knives: {} }); const h1 = arenaView(game()).skinCat;
  setSkinCatalog({ version: 1, weapons: { ak: { finishes: { cu_y: { name: 'Y', wear: [0, 1], fbId: 'web' } } } }, knives: {} }); const h2 = arenaView(game()).skinCat; setSkinCatalog(null);
  ok('skinCat: none without a catalogue, its hash with one, another for another', h0 === undefined && /^[0-9a-f]{12}$/.test(h1) && h2 !== h1); }
ann.ac.abort(); bo.ac.abort(); await room.close();
console.log(`PASS: skins over LAN · ${n} checks (not in the arena frame: < 4 KB with 10 fully skinned players; their own message by srev: the whole table on a join / reconnect / new match, a pick or a StatTrak kill as one slot, a live round's pick at the freeze; kept across arena frames and world snapshots; the catalogue named for re-fetching)`);
