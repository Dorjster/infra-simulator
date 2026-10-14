// Asset packs (one .zip of imported models and maps, lan/zip.mjs; installed by the room, POST /api/user-assets/pack):
// a pack installs into the room's assets folder and is served from it (with the manifest); a pack whose map is not a
// usable map file is refused; entries outside the pack's folders (../, unknown types) are never written; only the host
// (or this computer, before anyone hosts) may install. Synthetic packs: the real models are Valve's and stay local.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { startRoom } from '../lan/room.mjs';
import { writeZip, readZip } from '../lan/zip.mjs';
const dir = await mkdtemp(path.join(os.tmpdir(), 'pack-')), assetsDir = path.join(dir, 'assets'), mapsDir = path.join(dir, 'maps');
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(dir, 's.json'), roomCode: 'PACK01', hostKey: 'hk', deliveryScale: 0, assetsDir, mapsDir, log: () => {} });
const base = 'http://127.0.0.1:' + room.port, upload = (zip, token) => fetch(base + '/api/user-assets/pack', { method: 'POST', headers: token ? { 'X-Player-Token': token } : {}, body: zip });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const manifest = { version: 1, hash: 'abc123', models: { weapons: { ak: { file: 'weapons/ak.bin', maps: ['base'] } }, agents: {}, viewmodels: {} } };
const bin = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

// The zip round trip.
{ const e = [{ name: 'a.json', data: Buffer.from('{"x":1}') }, { name: 'b/c.jpg', data: Buffer.from([255, 216, 1]) }], back = readZip(writeZip(e)); ok(back.length === 2 && back[0].data.toString() === '{"x":1}' && back[1].data.equals(e[1].data), 'zip round trip (deflated and stored entries)'); }
// A good pack, with entries that must be ignored.
{ const zip = writeZip([{ name: 'infra-pack.json', data: Buffer.from('{"version":1}') }, { name: 'assets/manifest.json', data: Buffer.from(JSON.stringify(manifest)) }, { name: 'assets/weapons/ak.bin', data: bin },
    { name: 'assets/../evil.json', data: Buffer.from('{}') }, { name: 'assets/weapons/run.sh', data: Buffer.from('rm -rf /') }, { name: 'other/x.bin', data: bin }]);
  const r = await upload(zip), d = await r.json(); ok(r.status === 200 && d.files === 2 && d.maps === 0, 'pack installed from this computer (no host yet): 2 files · ' + JSON.stringify(d));
  ok((await readFile(path.join(assetsDir, 'weapons', 'ak.bin'))).equals(bin), 'the model file is in the assets folder');
  ok(!(await readdir(dir)).includes('evil.json') && !(await readdir(path.join(assetsDir, 'weapons'))).includes('run.sh'), 'nothing written outside the folders or of an unknown type');
  const m = await (await fetch(base + '/api/user-assets')).json(); ok(m.models.weapons.ak && m.hash === 'abc123', 'the room lists the pack (its manifest)');
  const f = await fetch(base + '/user-assets/weapons/ak.bin?h=abc123'); ok(f.ok && Buffer.from(await f.arrayBuffer()).equals(bin), 'and serves its files'); }
// Not a pack, and a pack with a broken map.
{ const r1 = await upload(writeZip([{ name: 'assets/weapons/ak.bin', data: bin }])); ok(r1.status === 400, 'a zip without infra-pack.json is refused');
  const r2 = await upload(writeZip([{ name: 'infra-pack.json', data: Buffer.from('{}') }, { name: 'maps/dust2.bsp', data: Buffer.from('not a map') }])); ok(r2.status === 400 && /usable/.test((await r2.json()).error), 'a pack whose map is not a usable map file is refused'); }
// Once someone hosts, only the host installs.
{ const post = (r, b, t) => fetch(base + '/api/' + r, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'X-Player-Token': t } : {}) }, body: JSON.stringify(b) }).then(x => x.json());
  const h = await post('join', { code: 'PACK01', name: 'Host', hostKey: 'hk' }), g = await post('join', { code: 'PACK01', name: 'Guest' });
  const zip = writeZip([{ name: 'infra-pack.json', data: Buffer.from('{}') }, { name: 'assets/weapons/ak.bin', data: bin }]);
  ok((await upload(zip, g.token)).status === 403, 'a guest cannot install a pack'); ok((await upload(zip, h.token)).status === 200, 'the host can'); }
await room.close();
console.log('PASS: asset packs · ' + n + ' checks');
