// LAN: a guest changes device configuration through the FortiOS CLI path and the FortiGate GUI path;
// the host and a second guest receive the new state live (server-sent world frames) and their device
// logic evaluates it the same way. Fault injection is host-only; physical actions are reach-checked
// on the host while an engineer walks.
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'infra-logic-')), HOST_KEY = 'logic-host-key';
let child, base, revision = 0;
async function start() {
  child = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'LOGIC31', HOST_KEY, CAMPAIGN_SAVE: path.join(temp, 'save.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; child.stderr.on('data', d => err += d);
  await new Promise((resolve, reject) => { child.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { base = 'http://127.0.0.1:' + m[1]; resolve(); } }); child.on('exit', () => reject(Error(err))); });
}
const post = async (route, data, token) => { const r = await fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(data) }); return { status: r.status, ...await r.json() }; };
async function action(a, p, status = 200) {
  let out = await post('action', { revision, action: a }, p.token);
  for (let i = 0; i < 5 && out.status === 409 && out.world; i++) { revision = out.revision; out = await post('action', { revision, action: a }, p.token); }
  assert.equal(out.status, status, (out.error || out.message) + ' · ' + JSON.stringify(a).slice(0, 120));
  if (out.revision !== undefined) revision = out.revision; return out;
}
// Live world frames for one player (what an open GUI page re-renders from).
function stream(p) {
  const frames = [], rosters = [], waiters = [], ac = new AbortController();
  (async () => { const r = await fetch(base + '/api/events?token=' + p.token, { signal: ac.signal }); const reader = r.body.getReader(), dec = new TextDecoder(); let buf = ''; try { for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /event: (\S+)/.exec(chunk)?.[1], data = /data: (.*)/s.exec(chunk)?.[1]; if (ev === 'world') { frames.push(JSON.parse(data)); for (const w of waiters.splice(0)) w(); } if (ev === 'players') { rosters.push(JSON.parse(data)); for (const w of waiters.splice(0)) w(); } } } } catch {} })();
  const until = async (pred, what) => { const t0 = Date.now(); for (;;) { const f = frames.find(x => pred(x.world)); if (f) return f.world; if (Date.now() - t0 > 8000) throw Error('timeout waiting for ' + what); await new Promise(r => { waiters.push(r); setTimeout(r, 300); }); } };
  const roster = async (pred, what) => { const t0 = Date.now(); for (;;) { const f = rosters.find(pred); if (f) return f; if (Date.now() - t0 > 8000) throw Error('timeout waiting for ' + what); await new Promise(r => { waiters.push(r); setTimeout(r, 300); }); } };
  return { frames, rosters, until, roster, close: () => ac.abort() };
}
try {
  await start();
  const host = await post('join', { code: 'LOGIC31', name: 'Host', hostKey: HOST_KEY }), g1 = await post('join', { code: 'LOGIC31', name: 'Guest1' }), g2 = await post('join', { code: 'LOGIC31', name: 'Guest2' });
  assert(host.isHost && !g1.isHost && !g2.isHost); revision = g1.revision;
  const hs = stream(host), s2 = stream(g2);
  await hs.until(w => !!w, 'host frame'); await s2.until(w => !!w, 'guest frame');
  // Guest 1 edits the office-bound FortiGate policy table through the FortiOS CLI action.
  await action({ type: 'config', action: { type: 'fortios', node: 'FIREWALL-A', op: 'edit', store: 'firewall policy', value: { id: 'lan-cli', srcintf: 'VLAN90', dstintf: 'wan', action: 'deny', service: 'HTTPS' } } }, g1);
  for (const s of [hs, s2]) { const w = await s.until(w => w.office?.policies?.['lan-cli'], 'CLI policy'); assert.equal(w.office.policies['lan-cli'].action, 'deny'); assert.equal(w.office.policies['lan-cli'].src, '90'); }
  // Guest 1 uses the FortiGate GUI path (company admin sign-in, DNS record).
  await action({ type: 'office', action: { type: 'login', user: 'itadmin', password: 'OfficeLab19!' } }, g1);
  await action({ type: 'office', action: { type: 'configure', page: 'dns', value: { id: 'lan.company.test', ip: '10.10.50.10', enabled: true } } }, g1);
  for (const s of [hs, s2]) await s.until(w => w.office?.dns?.['lan.company.test']?.ip === '10.10.50.10', 'GUI DNS record');
  // Guest 1 changes a switch through the CLI state action; both others see the port configuration.
  const w0 = s2.frames.at(-1).world, core = w0.nets.find(x => x.id === 'CORE-A').net, idx = core.ports.findIndex(p => p.mode === 'trunk');
  await action({ type: 'config', action: { type: 'cli-state', node: 'CORE-A', op: 'interface', index: idx, value: { native: 99 } } }, g1);
  for (const s of [hs, s2]) await s.until(w => w.nets.find(x => x.id === 'CORE-A').net.ports[idx].native === 99, 'native VLAN on CORE-A');
  await action({ type: 'config', action: { type: 'cli-state', node: 'CORE-A', op: 'interface', index: idx, value: { native: 1 } } }, g1);
  // Faults are host-only; the host's fault reaches every guest (PDU breaker state in the save).
  await action({ type: 'engineering', action: { type: 'fault', fault: 'pdu-overload', rack: 'R04' } }, g1, 403);
  await action({ type: 'engineering', action: { type: 'fault', fault: 'pdu-overload', rack: 'R04' } }, host);
  for (const s of [hs, s2]) await s.until(w => w.operations?.pdus?.['R04:A']?.tripped, 'tripped PDU');
  // Reach: a walking guest far from the rack cannot reset the breaker; the check runs on the host.
  assert.equal((await post('pose', { pose: { x: 60, y: 9.7, z: 20, yaw: 0, active: true } }, g1.token)).status, 200);
  const far = await action({ type: 'engineering', action: { type: 'pdu-reset', rack: 'R04', feed: 'A' } }, g1, 400); assert.match(far.error, /Too far from .* walk to rack R04/);
  assert.equal((await post('pose', { pose: { x: 9, y: 9.7, z: 6, yaw: 0, active: true } }, g1.token)).status, 200);
  const near = await action({ type: 'engineering', action: { type: 'pdu-reset', rack: 'R04', feed: 'A' } }, g1); assert.match(near.message, /Breaker tripped again immediately/, 'still overloaded: it trips again');
  // Avatar state in the pose: emote, face, head colour and laptop reach the other players; the host
  // replaces anything outside the known lists.
  const me = (list, p) => list.find(x => x.id === p.id);
  assert.equal((await post('pose', { pose: { x: 5, y: 9.7, z: 6, yaw: 0, active: true, laptop: true, face: 'angry', skin: 'red', emote: { id: 'salute', n: 7 } } }, g1.token)).status, 200);
  for (const s of [hs, s2]) { const list = await s.roster(l => me(l, g1)?.pose.emote?.n === 7, 'salute pose'); const pose = me(list, g1).pose; assert.deepEqual(pose.emote, { id: 'salute', n: 7 }); assert.equal(pose.face, 'angry'); assert.equal(pose.skin, 'red'); assert.equal(pose.laptop, true); }
  assert.equal((await post('pose', { pose: { x: 5, y: 9.7, z: 6, yaw: 0, active: true, face: '<img>', skin: 'plaid', emote: { id: 'explode', n: 8 } } }, g1.token)).status, 200);
  { const list = await s2.roster(l => me(l, g1)?.pose.emote?.n === 8, 'sanitised pose'); const pose = me(list, g1).pose; assert.equal(pose.emote.id, null); assert.equal(pose.face, 'cute'); assert.equal(pose.skin, 'yellow'); assert.equal(pose.laptop, false); }
  // Renaming: the host cleans the name (letters incl. Cyrillic, digits, space, _ -; 20 chars) and
  // every player's roster (name tag, chat, lobby) shows it.
  const renamed = await post('name', { name: 'Бат-Эрдэнэ <script>' }, g1.token); assert.equal(renamed.status, 200); assert.equal(renamed.name, 'Бат-Эрдэнэ script');
  for (const s of [hs, s2]) await s.roster(l => me(l, g1)?.name === 'Бат-Эрдэнэ script', 'renamed player');
  assert.equal((await post('name', { name: '<<>>' }, g1.token)).name, 'Engineer');
  hs.close(); s2.close();
  console.log('PASS: LAN logic · guest FortiOS-CLI policy, FortiGate GUI DNS record and switch CLI change reach the host and a second guest live; fault injection host-only; walking-reach validated on the host; emote/face/head colour/laptop relayed to the other players and sanitised by the host; player rename shown to everyone.');
} finally { if (child && child.exitCode === null) { child.kill('SIGINT'); await new Promise(r => { child.once('exit', r); setTimeout(() => child.kill('SIGKILL'), 1500).unref(); }); } }
process.exit(0);
