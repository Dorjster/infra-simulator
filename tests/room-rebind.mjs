// The desktop app rebinds the room between local-only and LAN hosting. The world keeps ticking across a
// rebind (deliveries, level acceptance), and close() stops it cleanly.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { startRoom } from '../lan/room.mjs';
const dir = await mkdtemp(path.join(os.tmpdir(), 'rebind-'));
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(dir, 's.json'), roomCode: 'REBIND', hostKey: 'hk', deliveryScale: 0, log: () => {} });
const port = room.port; await room.rebind('127.0.0.1', port); await room.rebind('127.0.0.1', port);
assert.equal(room.port, port, 'same port after rebind');
const base = 'http://127.0.0.1:' + port, post = (r, b, t) => fetch(base + '/api/' + r, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'X-Player-Token': t } : {}) }, body: JSON.stringify(b) }).then(x => x.json());
const h = await post('join', { code: 'REBIND', name: 'H', hostKey: 'hk' }); let rev = h.revision;
const act = async a => { let r = await post('action', { revision: rev, action: { type: 'engineering', action: a } }, h.token); if (r.world && r.error) { rev = r.revision; r = await post('action', { revision: rev, action: { type: 'engineering', action: a } }, h.token); } rev = r.revision ?? rev; return r; };
await act({ type: 'mode', mode: 'campaign', track: 'levels', name: 'Rebind' });
let w = await act({ type: 'order', sku: 'rack', quantity: 1, length: 1 }); w = await act({ type: 'unbox', id: w.world.operations.orders.at(-1).id });
const rk = w.world.operations.stock.find(s => s.sku === 'rack'); await act({ type: 'grab', id: rk.id }); await act({ type: 'rack', id: rk.id, pad: 'PAD-R01' });
for (const f of ['A', 'B']) await act({ type: 'rack-feed', rack: 'R01', feed: f });
w = await act({ type: 'order', sku: 'rail', quantity: 1, length: 1 }); w = await act({ type: 'unbox', id: w.world.operations.orders.at(-1).id }); const rl = w.world.operations.stock.find(s => s.sku === 'rail'); await act({ type: 'grab', id: rl.id }); await act({ type: 'rails', id: rl.id, rack: 'R01', unit: 30, units: 1 });
let level = 0; for (let i = 0; i < 30 && level < 1; i++) { await new Promise(r => setTimeout(r, 200)); level = room.world.operations.game.levels.current; }
assert.equal(level, 1, 'level 0 earned by the room tick after two rebinds');
await room.close();
await assert.rejects(fetch(base + '/api/room'), 'listener closed');
console.log('PASS: room rebind · world tick survives local/LAN rebinds (level earned afterwards), close() stops the room.');
process.exit(0);
