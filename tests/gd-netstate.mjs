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
// Bo's event stream: every combat state, in the order it arrives (frames and world snapshots).
const seen = [], ctl = new AbortController();
fetch(base + '/api/events?token=' + bo.token, { signal: ctl.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (!data) continue;
      try { const d = JSON.parse(data); if (type === 'combat') seen.push(['frame', d.rev]); else if (type === 'world' && d.world?.operations?.combat) seen.push(["world", d.world.operations.combat.rev]); } catch {} } } }).catch(() => {});
await new Promise(r => setTimeout(r, 300));
const g = room.world.operations.game, wait = ms => new Promise(r => setTimeout(r, ms));
const act = (p, a) => post('action', { action: { type: 'arena', action: a } }, p.token);
startArena(g, { map: 'dust2', kind: 'defuse', bots: 2, freezeS: 15 }, Date.now()); await wait(600);
const d = () => g.combat.d; Object.assign(d().teams, { ann: 't', bo: 'ct' });
// Stand in your spawn (where buying is allowed), as a client reports it.
const { ARENA_MAPS } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), M = ARENA_MAPS.dust2;
const pose = (p, [x, z]) => post('pose', { pose: { x: ARENA.cx + x, y: 9.7 + M.nav.floorAt(x, z), z: ARENA.cz + z, yaw: 0, active: true } }, p.token);
await pose(ann, M.t[0]); await pose(bo, M.ct[0]); await wait(100);
ok('a match id and a round id', typeof d().match === 'string' && d().match.length >= 6 && d().round.id === d().match + '.1', JSON.stringify([d().match, d().round.id]));
// Buys: the reply's snapshot is at least as new as anything streamed before it.
const before = Math.max(0, ...seen.map(s => s[1] || 0));
let r = await act(ann, { type: 'buy-nade', kind: 'flash', round: d().round.id });
ok('a buy carrying the current round goes through', r.status === 200, JSON.stringify(r.body).slice(0, 200));
ok('…and its reply is newer than every combat state streamed before it', (r.body.world?.operations?.combat?.rev || 0) > before, (r.body.world?.operations?.combat?.rev) + ' vs ' + before);
r = await act(ann, { type: 'buy-nade', kind: 'flash' }); ok('a buy without a round id still works (older clients)', r.status === 200, JSON.stringify(r.body).slice(0, 200));
const old = d().round.id;
// The host restarts the round: a new round id; a buy still carrying the old one is refused, nothing is charged.
r = await act(ann, { type: 'restart-round' }); await wait(200);
ok('a restarted round gets a new id', d().round.id !== old && d().round.id.startsWith(d().match + '.'), d().round.id);
const money = d().money.ann; r = await act(ann, { type: 'buy-nade', kind: 'smoke', round: old });
ok('a buy sent in the round that ended is refused, nothing charged', r.status !== 200 && /round has ended/.test(r.body.error) && d().money.ann === money, JSON.stringify(r.body).slice(0, 200));
r = await act(ann, { type: 'plant', hold: true, round: old }); ok('so is a plant from the old round', r.status !== 200 && /round has ended/.test(r.body.error));
r = await act(ann, { type: 'settings', bots: 2, round: old }); ok('round ids only bind round actions (host settings are not refused)', r.status === 200, JSON.stringify(r.body).slice(0, 200));
// A round played out (bots move, freeze ends …): many frames.
d().round.freezeUntil = Date.now(); await wait(1500);
const fr = seen.filter(s => s[1] !== undefined);
ok('combat states streamed (frames and snapshots)', fr.filter(s => s[0] === 'frame').length > 5 && fr.some(s => s[0] === 'world'), fr.length);
ok('every combat state carries a revision, rising in the order sent', fr.every((s, i) => i === 0 || s[1] > fr[i - 1][1]), JSON.stringify(fr.slice(0, 30)));
// A new match: a new match id.
const m0 = d().match; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, Date.now() + 5); ok('a new match, a new match id', d().match !== m0);
ctl.abort(); await room.close();
console.log('PASS: network state · ' + n + ' checks (match / round ids, rising combat revisions across frames, snapshots and replies, stale round requests refused)');
process.exit(0);
