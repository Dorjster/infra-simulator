// Team voice signalling in the LAN room (lan/room.mjs): relayed between current team mates only; an enemy, or anyone
// in Deathmatch, is refused; a team change cuts it off at once; "bye" always goes through. The HTTPS twin answers
// (a secure origin for browsers on other computers).
import assert from 'node:assert/strict'; import https from 'node:https'; import os from 'node:os'; import path from 'node:path'; import { mkdtempSync } from 'node:fs';
import { startRoom } from '../lan/room.mjs';
import { startArena } from '../dist/arena-logic.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'vr-')), 's.json'), roomCode: 'VOICE1', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
const join = async (name, hostKey) => (await post('join', { code: 'VOICE1', name, ...(hostKey ? { hostKey } : {}) })).body;
const ann = await join('Ann', 'k'), bo = await join('Bo'), cy = await join('Cy');
// Each listens on its event stream for voice messages.
const inbox = { Ann: [], Bo: [], Cy: [] }, chat = {}, ctl = new AbortController();
for (const [who, p] of [['Ann', ann], ['Bo', bo], ['Cy', cy]]) fetch(base + '/api/events?token=' + p.token, { signal: ctl.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = ''; for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); if (/^event: voice/m.test(ev)) inbox[who].push(JSON.parse(ev.split('\ndata: ')[1])); if (/^event: comms/m.test(ev)) (chat[who] ??= []).push(JSON.parse(ev.split('\ndata: ')[1])); } } }).catch(() => {});
await new Promise(r => setTimeout(r, 300));
const idOf = p => p.id ?? p.playerId ?? p.player?.id;
const g = room.world.operations.game;
// Deathmatch: no team mates → refused.
startArena(g, { map: 'yard', kind: 'dm', bots: 0 }, Date.now());
let r = await post('voice', { to: idOf(bo), signal: { type: 'offer', sdp: 'x' } }, ann.token); ok('deathmatch: no voice (no team mates)', r.status === 403, JSON.stringify(r));
// Defuse: Ann and Bo Terrorists, Cy Counter-Terrorist.
startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, Date.now()); g.combat.d.teams = { ann: 't', bo: 't', cy: 'ct' };
r = await post('voice', { to: idOf(bo), signal: { type: 'offer', sdp: 'hello' } }, ann.token); ok('team mate: relayed', r.status === 200, JSON.stringify(r));
r = await post('voice', { to: idOf(cy), signal: { type: 'offer', sdp: 'spy' } }, ann.token); ok('enemy: refused', r.status === 403 && /team only/.test(r.body.error), JSON.stringify(r));
r = await post('voice', { to: idOf(ann), signal: { type: 'ice', c: {} } }, cy.token); ok('enemy → you: refused too', r.status === 403);
await new Promise(r => setTimeout(r, 200));
ok('only the team mate received it', inbox.Bo.length === 1 && inbox.Bo[0].signal.sdp === 'hello' && inbox.Bo[0].from === idOf(ann) && inbox.Cy.length === 0, JSON.stringify(inbox));
// Team change: Bo moves to CT → Ann can no longer reach him; "bye" still goes through (to close the old connection).
g.combat.d.teams.bo = 'ct'; r = await post('voice', { to: idOf(bo), signal: { type: 'answer', sdp: 'late' } }, ann.token); ok('after a team change: cut off at once', r.status === 403);
r = await post('voice', { to: idOf(bo), signal: { type: 'bye' } }, ann.token); ok('"bye" always goes through', r.status === 200);
r = await post('voice', { to: idOf(cy), signal: { type: 'offer', sdp: 'x'.repeat(20000) } }, bo.token); ok('oversized messages refused', r.status === 400);
r = await post('voice', { to: 'nobody', signal: { type: 'offer' } }, ann.token); ok('unknown player refused', r.status === 404);
// ── Comms: team / all chat and radio (gd-radio.js rules, applied by the room) ──
g.combat.d.teams = { ann: 't', bo: 't', cy: 'ct' }; g.combat.d.round.phase = 'live'; const wait = () => new Promise(r => setTimeout(r, 250)), names = who => (chat[who] || []).map(m => m.text);
r = await post('comms', { kind: 'say', team: true, text: 'stack B' }, ann.token); await wait();
ok('team chat: only the team mate reads it', r.status === 200 && names('Bo').includes('stack B') && !names('Cy').includes('stack B'), JSON.stringify(chat));
await new Promise(r => setTimeout(r, 750)); r = await post('comms', { kind: 'say', team: false, text: 'gl hf' }, ann.token); await wait();
ok('all chat: everyone reads it', names('Bo').includes('gl hf') && names('Cy').includes('gl hf'));
g.combat.down = { cy: { until: Date.now() + 6e5 } }; r = await post('comms', { kind: 'say', team: false, text: 'he is at long' }, cy.token); await wait();
ok('dead player’s all chat in a live round: only the dead read it (no ghosting)', r.status === 200 && !names('Ann').includes('he is at long') && !names('Bo').includes('he is at long') && names('Cy').includes('he is at long'));
r = await post('comms', { kind: 'radio', cmd: 'go-a' }, bo.token); await wait();
const radio = (chat.Ann || []).find(m => m.kind === 'radio'); ok('radio: the room builds the line; team mates get it, with the sender’s callout field', r.status === 200 && radio?.text === 'Go A!' && 'callout' in radio && !names('Cy').includes('Go A!'), JSON.stringify(radio));
r = await post('comms', { kind: 'radio', cmd: 'go-a' }, bo.token); ok('radio is rate-limited', r.status === 429);
await new Promise(r => setTimeout(r, 1100)); r = await post('comms', { kind: 'radio', cmd: 'defend-a' }, bo.token); ok('a call from the other side’s list is refused', r.status === 400);
r = await post('comms', { kind: 'radio', cmd: 'backup' }, cy.token); ok('the dead can’t use the radio', r.status === 400);
// The HTTPS twin serves the same room.
const sec = await new Promise(res => https.get('https://127.0.0.1:' + room.securePort + '/api/room', { rejectUnauthorized: false }, rr => { let b = ''; const cert = rr.socket?.getPeerCertificate?.()?.subject?.CN; rr.on('data', d => b += d); rr.on('end', () => res({ status: rr.statusCode, body: JSON.parse(b), cert })); }).on('error', e => res({ error: e.message })));
ok('the HTTPS twin answers with the room (secure origin for voice)', sec.status === 200 && sec.body.app === 'infra-simulator' && room.securePort > 0, JSON.stringify(sec).slice(0, 200));
ok('…with our LAN certificate', sec.cert === 'Infra Simulator LAN', sec.cert);
ctl.abort(); await room.close();
console.log('PASS: team voice relay + comms · ' + n + ' checks (voice: team mates only, enemies and deathmatch refused, team change cuts off, bye, limits, HTTPS twin · comms: team / all chat, no ghosting, room-built radio lines, rate limit)');
process.exit(0);
