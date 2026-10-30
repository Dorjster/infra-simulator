// Global Defensive network state (spec §2): every combat state that leaves the LAN host — stream frames, world
// snapshots, action replies — carries a rising revision, so a client can always tell the newer one; each match has an
// id and each round (restarts too) its own id; a buy / plant / defuse sent in a round that has since ended is refused.
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path'; import { mkdtempSync } from 'node:fs';
import { startRoom } from '../lan/room.mjs';
import { startArena } from '../dist/arena-logic.js';
import { DEFUSE } from '../dist/arena-defuse.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'ns-')), 's.json'), roomCode: 'NET001', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
const join = async (name, hostKey) => (await post('join', { code: 'NET001', name, ...(hostKey ? { hostKey } : {}) })).body;
const ann = await join('Ann', 'k'), bo = await join('Bo');
// Bo's event stream: every combat state, in the order it arrives (frames and world snapshots); `frames` keeps each event's
// type, size and payload (the Global Defensive frames: arena, loadouts, revisions).
const seen = [], frames = [], ctl = new AbortController();
fetch(base + '/api/events?token=' + bo.token, { signal: ctl.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (!data) continue;
      try { const d = JSON.parse(data); frames.push({ type, bytes: data.length, d, at: Date.now() }); if (type === 'combat') seen.push(['frame', d.rev]); else if (type === 'world' && d.world?.operations?.combat) seen.push(["world", d.world.operations.combat.rev]); } catch {} } } }).catch(() => {});
await new Promise(r => setTimeout(r, 300));
const g = room.world.operations.game, wait = ms => new Promise(r => setTimeout(r, ms));
const act = (p, a) => post('action', { action: { type: 'arena', action: a } }, p.token);
startArena(g, { map: 'dust2', kind: 'defuse', bots: 2, freezeS: 15 }, Date.now()); await wait(600);
const d = () => g.combat.d; Object.assign(d().teams, { ann: 't', bo: 'ct' });
// Stand in your spawn (where buying is allowed), as a client reports it.
const { ARENA_MAPS } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), M = ARENA_MAPS.dust2;
const pose = (p, [x, z]) => post('pose', { pose: { x: ARENA.cx + x, y: 9.7 + M.nav.floorAt(x, z), z: ARENA.cz + z, yaw: 0, active: true } }, p.token);
await pose(ann, M.t[0]); await pose(bo, M.ct[0]); await wait(100);
ok('a match id and a round id', typeof d().match === 'string' && d().match.length >= 6 && d().round.id === d().match + '.1' && g.arena.match === d().match, JSON.stringify([d().match, d().round.id, g.arena.match]));
// Buys: the reply's state is at least as new as anything streamed before it — and it is the match's state (a GD frame:
// combat + arena with the loadouts), never the facility's world snapshot; the other player gets the same small frame.
const before = Math.max(0, ...seen.map(s => s[1] || 0)), worldsBefore = frames.filter(f => f.type === 'world').length, nBefore = frames.length;
let r = await act(ann, { type: 'buy-nade', kind: 'flash', round: d().round.id });
ok('a buy carrying the current round goes through', r.status === 200, JSON.stringify(r.body).slice(0, 200));
ok('…and its reply is newer than every combat state streamed before it', (r.body.gd?.rev || 0) > before, (r.body.gd?.rev) + ' vs ' + before);
ok('…the reply carries the match (arena, loadouts, revisions), not the world snapshot', !r.body.world && r.body.gd?.arena?.loadout?.ann?.nades?.includes('flash') && r.body.gd.arev > 0 && r.body.gd.lrev > 0, JSON.stringify(Object.keys(r.body)) + ' · ' + JSON.stringify(r.body.gd?.arena?.loadout?.ann));
await wait(150); { const mine = frames.slice(nBefore), gdf = mine.find(f => f.type === 'combat' && f.d.arena), worldBytes = JSON.stringify(room.world.snapshotFor()).length;
  ok('the other player gets the buy as a small GD frame (< 10 KB) with the new loadout — no world snapshot', frames.filter(f => f.type === 'world').length === worldsBefore && !!gdf && gdf.bytes < 10240 && gdf.d.arena.loadout.ann.nades.includes('flash'), JSON.stringify({ worlds: frames.filter(f => f.type === 'world').length - worldsBefore, gdBytes: gdf?.bytes, worldBytes }));
  console.log('  sizes: a GD action frame ' + gdf?.bytes + ' B (the facility snapshot it replaced: ' + worldBytes + ' B)'); }
r = await act(ann, { type: 'buy-nade', kind: 'flash' }); ok('a buy without a round id still works (older clients)', r.status === 200, JSON.stringify(r.body).slice(0, 200));
const old = d().round.id;
// The host restarts the round: a new round id; a buy still carrying the old one is refused, nothing is charged.
r = await act(ann, { type: 'restart-round' }); await wait(200);
ok('a restarted round gets a new id', d().round.id !== old && d().round.id.startsWith(d().match + '.'), d().round.id);
const money = d().money.ann; r = await act(ann, { type: 'buy-nade', kind: 'smoke', round: old });
ok('a buy sent in the round that ended is refused, nothing charged', r.status !== 200 && /round has ended/.test(r.body.error) && d().money.ann === money, JSON.stringify(r.body).slice(0, 200));
r = await act(ann, { type: 'plant', hold: true, round: old }); ok('so is a plant from the old round', r.status !== 200 && /round has ended/.test(r.body.error));
// Every in-play request is bound to its round and match (multiplayer.js stamps them): a throw, drop, pickup, door, glass or
// hit that crossed the round change is refused — no old grenade, no gun leaving the new round's hands, no old damage.
const nadesBefore = (g.combat.nades || []).length, flashes = g.arena.loadout.ann.nades.filter(x => x === 'flash').length;
for (const a of [{ type: 'throw', kind: 'flash', x: 0, y: 9.7, z: 0, dx: 0, dy: 0, dz: -1 }, { type: 'drop', slot: 'secondary' }, { type: 'pickup', id: 'g1' }, { type: 'use', id: 0 }, { type: 'break', id: 0, dmg: 5 }]) {
  r = await act(ann, { ...a, round: old }); ok('an old-round ' + a.type + ' is refused', r.status !== 200 && /round has ended/.test(r.body.error), JSON.stringify(r.body).slice(0, 160)); }
ok('…nothing thrown, nothing dropped', (g.combat.nades || []).length === nadesBefore && g.arena.loadout.ann.nades.filter(x => x === 'flash').length === flashes && g.arena.loadout.ann.secondary === 'pistol');
r = await post('combat', { action: { type: 'hit', target: bo.id, weapon: 'pistol', zone: 'head', n: 4000, round: old } }, ann.token); ok('an old-round hit is refused before it is judged', r.status === 400 && /round has ended/.test(r.body.error), JSON.stringify(r.body));
r = await act(ann, { type: 'buy-nade', kind: 'smoke', match: 'older', round: d().round.id }); ok('a buy from another match is refused', r.status !== 200 && /match has ended/.test(r.body.error), JSON.stringify(r.body).slice(0, 160));
r = await act(ann, { type: 'settings', bots: 2, round: old }); ok('round ids only bind round actions (host settings are not refused)', r.status === 200, JSON.stringify(r.body).slice(0, 200));
// A round played out (bots move, freeze ends …): many frames.
d().round.freezeUntil = Date.now(); await wait(1500);
const fr = seen.filter(s => s[1] !== undefined);
ok('combat states streamed (GD frames; a world snapshot only when the stream opened)', fr.filter(s => s[0] === 'frame').length > 5 && fr.filter(s => s[0] === 'world').length <= 1, JSON.stringify(fr.map(s => s[0][0]).join('')));
ok('every combat state carries a revision, rising in the order sent', fr.every((s, i) => i === 0 || s[1] > fr[i - 1][1]), JSON.stringify(fr.slice(0, 30)));
// One shot counts once: the same shot number on the same target again (a resent request) is refused; the next shot lands.
{ const at = M.t[0]; await post('pose', { pose: { x: ARENA.cx + at[0] + 3, y: 9.7 + M.nav.floorAt(at[0], at[1]), z: ARENA.cz + at[1], yaw: 0, active: true, tp: 1 } }, bo.token); await wait(80);   // (tp: a teleport the client announces — the host's pose gate lets it through)
  const hit = n => post('combat', { action: { type: 'hit', target: bo.id, weapon: 'pistol', zone: 'chest', n, match: g.arena.match, round: d().round.id } }, ann.token);
  const r1 = await hit(7001), hp1 = g.combat.hp.bo, r2 = await hit(7001), hp2 = g.combat.hp.bo; await wait(200); const r3 = await hit(7002);
  ok('a hit counts once: the same shot on the same target again is refused, HP unchanged', r1.status === 200 && r2.status === 400 && /Already counted/.test(r2.body.error) && hp1 === hp2 && hp1 < 100, JSON.stringify([r1.body.result?.dmg ?? r1.body, r2.body, hp1, hp2]));
  ok('…the next shot is judged as usual', r3.status === 200 || !/Already counted/.test(r3.body.error || ''), JSON.stringify(r3.body).slice(0, 120)); }
// A quiet Defuse round: the facility's own ticks never send the ~120 KB world snapshot mid-match.
{ const w0 = frames.filter(f => f.type === 'world').length; await wait(2500); ok('2.5 s of play: no world snapshot reaches a player', frames.filter(f => f.type === 'world').length === w0); }
// A new match: a new match id.
const m0 = d().match; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, Date.now() + 5); ok('a new match, a new match id', d().match !== m0);
await wait(300); { const f = [...frames].reverse().find(x => x.type === 'combat' && x.d.arena); ok('…and the host tick sends it to everyone (the arena with the new match id), unasked', f && f.d.arena.match === g.arena.match && f.d.match === g.arena.match, JSON.stringify(f?.d?.arena?.match)); }
ctl.abort(); await room.close();
// ── The page's own merge rule (multiplayer.js mergeGdFrame), as frames cross on the network ──
{ const { mergeGdFrame } = await import('../dist/multiplayer.js'); const R = { combat: 0, arena: 0, loadout: 0, match: null };
  const G = { mode: 'arena', arena: { map: 'dust2', match: 'm1', loadout: { ann: { primary: null, secondary: 'pistol', nades: [] } } }, combat: null };
  mergeGdFrame(G, { rev: 10, arena: { map: 'dust2', match: 'm1', loadout: {} }, arev: 3, lrev: 2 }, R);
  // A hit's reply (rev 11) overtakes the stream frame (rev 10) that carries Ann's pickup (lrev 3).
  mergeGdFrame(G, { rev: 11, hp: { bo: 64 } }, R); const applied = mergeGdFrame(G, { rev: 10, hp: { bo: 100 }, loadout: { ann: { primary: 'ak', secondary: 'pistol', nades: [] } }, lrev: 3 }, R);
  ok('a frame overtaken by a newer reply still brings its loadout (Ann’s pickup); its older combat state is not applied', !applied && G.arena.loadout.ann.primary === 'ak' && G.combat.hp.bo === 64 && R.loadout === 3 && R.combat === 11, JSON.stringify([applied, G.arena.loadout, G.combat]));
  // A new match (arev 4, lrev 4: everyone clean, a kill feed emptied); then a late frame from the match before.
  mergeGdFrame(G, { rev: 20, feed: [], arena: { map: 'dust2', match: 'm2', loadout: { ann: { primary: null, secondary: 'pistol', nades: [] } } }, arev: 4, lrev: 4 }, R);
  ok('…a new match’s arena is taken (its id seen)', G.arena.match === 'm2' && R.match === 'm2' && R.arena === 4);
  const late = mergeGdFrame(G, { rev: 19, feed: [{ by: 'ann', target: 'bo', at: 1 }], arena: { map: 'dust2', match: 'm1', loadout: { ann: { primary: 'ak', secondary: 'deagle', nades: ['he'] } } }, arev: 3, lrev: 3, loadout: { ann: { primary: 'ak' } } }, R);
  ok('a late frame from the match before changes nothing: no old guns back, no old kill (its sound) replayed, the match stays', !late && G.arena.match === 'm2' && !G.arena.loadout.ann.primary && !G.combat.feed.length, JSON.stringify([late, G.arena.match, G.arena.loadout.ann, G.combat.feed]));
  ok('…a combat state of the same revision as the one held (a reply and its stream frame) is taken', mergeGdFrame(G, { rev: 20, feed: [] }, R) === true); }
console.log('PASS: network state · ' + n + ' checks (match / round ids, rising combat revisions across frames, snapshots and replies, stale round requests refused, the page’s frame merge rule)');
process.exit(0);
