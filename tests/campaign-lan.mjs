// Campaign levels on a LAN room: the host alone chooses the mode and save; a guest does the level work
// (order, unbox, carry, place, rack feeds, rails); the host earns the level and every player sees the
// same stage. An older (v30) campaign file is backed up before its first migrated save, and a late
// joiner and a host restart get the same level progress.
import { spawn } from 'node:child_process';
import { mkdtemp, copyFile, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'infra-levels-')), HOST_KEY = 'levels-host-key', save = path.join(temp, 'campaign-save.json');
await copyFile(path.join(root, 'tests/fixtures/v30-campaign.json'), save);
let child, base, revision = 0;
async function start() {
  child = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'LEVELS', HOST_KEY, CAMPAIGN_SAVE: save, DELIVERY_SCALE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '', out = ''; child.stderr.on('data', d => err += d);
  await new Promise((resolve, reject) => { child.stdout.on('data', d => { out += d; const m = /localhost:(\d+)/.exec(out); if (m && !base) { base = 'http://127.0.0.1:' + m[1]; resolve(); } }); child.on('exit', () => reject(Error(err))); });
  return () => out;
}
const post = async (route, data, token) => { const r = await fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(data) }); return { status: r.status, ...await r.json() }; };
async function act(a, p, status = 200) {
  let out = await post('action', { revision, action: a }, p.token);
  for (let i = 0; i < 5 && out.status === 409 && out.world; i++) { revision = out.revision; out = await post('action', { revision, action: a }, p.token); }
  assert.equal(out.status, status, (out.error || out.message) + ' · ' + JSON.stringify(a).slice(0, 120));
  if (out.revision !== undefined) revision = out.revision; return out;
}
const join = async (name, host) => { const r = await post('join', { code: 'LEVELS', name, ...(host ? { hostKey: HOST_KEY } : {}) }); assert.equal(r.status, 200, r.error); revision = r.revision; return r; };
const eng = (action, p, status) => act({ type: 'engineering', action }, p, status);
const waitFor = async (p, pred, what) => { const t0 = Date.now(); for (;;) { const r = await post('join', { code: 'LEVELS', name: 'probe' }); await post('leave', {}, r.token); if (pred(r.world)) return r.world; if (Date.now() - t0 > 9000) throw Error('timeout: ' + what); await new Promise(r => setTimeout(r, 300)); } };

let log = await start();
// ---- Migration with a backup of the old file ------------------------------------------------------------
await access(save.replace(/\.json$/, '') + '.pre-v32-backup.json');
assert.match(log(), /backed up/);
const host = await join('Host', true), guest = await join('Guest');
assert.equal(host.world.format, 32); assert.equal(host.world.operations.track, 'levels');
assert.equal(host.world.operations.levels.current, 3, 'v30 contract progress → level 3 current');
assert.equal(guest.world.operations.levels.current, 3, 'guest sees the same stage');
{ const old = JSON.parse(await readFile(save.replace(/\.json$/, '') + '.pre-v32-backup.json', 'utf8')); assert.equal(old.format, undefined, 'backup is the untouched v30 file'); }

// ---- Host-only control of the mode and saves ------------------------------------------------------------------
await eng({ type: 'mode', mode: 'campaign', track: 'levels', name: 'LAN HQ' }, guest, 403);
await eng({ type: 'checkpoint' }, guest, 403);
await eng({ type: 'mode', mode: 'campaign', track: 'levels', name: 'LAN HQ' }, host);
// ---- A guest performs level 0; the host earns it; everyone sees level 1 -----------------------------------------
await eng({ type: 'order', sku: 'rack', quantity: 1, length: 1 }, guest);
await eng({ type: 'order', sku: 'rail', quantity: 1, length: 1 }, guest);
let w = (await act({ type: 'engineering', action: { type: 'hint' } }, guest)).world;
for (const o of w.operations.orders) await eng({ type: 'unbox', id: o.id }, guest);
w = (await act({ type: 'engineering', action: { type: 'hint' } }, guest)).world;
const rack = w.operations.stock.find(s => s.sku === 'rack'), rail = w.operations.stock.find(s => s.sku === 'rail');
await eng({ type: 'grab', id: rack.id }, guest);
await eng({ type: 'order', sku: 'cat6', quantity: 1, length: 5 }, guest, 400); // carrying: finish or put down first
await eng({ type: 'rack', id: rack.id, pad: 'PAD-R02' }, guest);
await eng({ type: 'rack-feed', rack: 'R02', feed: 'A' }, guest);
await eng({ type: 'rack-feed', rack: 'R02', feed: 'B' }, host);
await eng({ type: 'grab', id: rail.id }, guest);
await eng({ type: 'rails', id: rail.id, rack: 'R02', unit: 20, units: 1 }, guest);
const earned = await waitFor(guest, x => x.operations.levels.current === 1, 'level 0 earned on the host');
assert(earned.operations.levels.earned[0]); assert.match(earned.operations.history[0].message, /Level 0 · Empty site accepted/);
// ---- Late joiner and host restart keep the stage --------------------------------------------------------------------
const late = await join('Late');
assert.equal(late.world.operations.levels.current, 1, 'late joiner sees level 1');
child.kill('SIGINT'); await new Promise(r => child.on('exit', r)); base = null;
log = await start();
const again = await join('Host', true);
assert.equal(again.world.operations.levels.current, 1, 'progress survives a host restart'); assert.equal(again.world.operations.racks[0].id, 'R02');
assert(!/backed up/.test(log()), 'a format-32 save is not backed up again');
child.kill('SIGINT');
console.log('PASS: campaign LAN · v30 save backed up then migrated (level 3), guest mode/save requests refused, guest does level 0 work and the host earns it, late joiner and host restart see the same level.');
process.exit(0);
