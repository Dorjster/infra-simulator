// 53.0.1 — Global Defensive's asset packs from a file (lan/zip.mjs openZip / writeZipFile; lan/room.mjs installPack):
//   · the upload streams to a temporary file (removed afterwards) and is read one entry at a time: a pack of a few hundred
//     MB installs with the room's memory growing far less than the pack (v53.0.0 held the whole pack in one Buffer, which
//     the desktop app's V8 could not allocate at 2.3 GB);
//   · zips as Finder's Compress writes them (data descriptors, zip64 fields, one top folder, __MACOSX/ and ._ AppleDouble
//     entries, a READ ME) and the "Infra Simulator Assets" folder zipped whole: no infra-pack.json but assets/manifest.json,
//     its assets/skins/ and assets/gloves/ installed through installSkins / installGloves (backups kept);
//   · refused: a symbolic link entry, a CRC mismatch, an entry that unpacks to more than it says, a pack that says it
//     unpacks to more than the caps; names outside the folders (.., absolute, backslash, drive letter) never written;
//   · all or nothing, as v53.0.0: a damaged entry anywhere (or finishes that fail the check) installs nothing; a split
//     zip and a packed size that cannot match the unpacked one refused from the directory; the reply sent only once the
//     temporary files are gone; staging folders a quit room left removed at start;
//   · the writer: zip64 past 65535 entries (or forced), every write in pieces (one fs write is capped at 2 GiB).
// Synthetic files only (the real models are Valve's and stay local). On a Mac, also a real `ditto -c -k --keepParent` zip.
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto'; import http from 'node:http'; import { createReadStream } from 'node:fs'; import { pipeline } from 'node:stream/promises'; import { execFileSync } from 'node:child_process';
import { startRoom } from '../lan/room.mjs';
import { writeZip, openZip, writeZipFile, writeFully, zipEntryName, crc32, ZIP_LIMITS } from '../lan/zip.mjs';
import { setSkinCatalog, setGloveCatalog } from '../dist/skins.js';
let n = 0; const ok = (c, m, d = '') => { n++; assert.ok(c, m + (d ? ' · ' + d : '')); };
const T = mkdtempSync(path.join(os.tmpdir(), 'gd-pack-stream-'));
process.on('exit', () => rmSync(T, { recursive: true, force: true }));   // (a failed or stopped run too: about 500 MB)
const tmpLeft = () => readdirSync(os.tmpdir()).filter(f => /^gd-(pack-upload|skins-pack|gloves-pack)-/.test(f));
const before = new Set(tmpLeft());

// ── A zip as Finder's Compress writes it: data descriptors (zeros in the local header), Unix modes, directory entries,
//    optional zip64 fields (sizes and offset in the 0x0001 extra, the zip64 end record). Faults on request (tests below). ──
function finderZip(entries, { zip64 = false } = {}) {
  const parts = [], central = []; let off = 0;
  for (const e of entries) {
    const nm = Buffer.from(e.name, 'utf8'), data = e.data || Buffer.alloc(0), store = e.store || e.dir || e.link, body = store ? data : zlib.deflateRawSync(data), crc = e.badCrc ? (crc32(data) ^ 1) >>> 0 : crc32(data);
    const size = e.saySize ?? data.length, mode = e.link ? 0o120755 : e.dir ? 0o40755 : 0o100644;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0808, 6); h.writeUInt16LE(store ? 0 : 8, 8); h.writeUInt16LE(nm.length, 26);
    const dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(body.length, 8); dd.writeUInt32LE(size >>> 0, 12);
    const x = zip64 ? Buffer.alloc(28) : Buffer.alloc(0); if (zip64) { x.writeUInt16LE(1, 0); x.writeUInt16LE(24, 2); x.writeBigUInt64LE(BigInt(size), 4); x.writeBigUInt64LE(BigInt(body.length), 12); x.writeBigUInt64LE(BigInt(off), 20); }
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(zip64 ? 45 : 20, 6); c.writeUInt16LE(0x0808, 8); c.writeUInt16LE(store ? 0 : 8, 10); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(zip64 ? 0xFFFFFFFF : body.length, 20); c.writeUInt32LE(zip64 ? 0xFFFFFFFF : size >>> 0, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt16LE(x.length, 30); c.writeUInt32LE((mode << 16) >>> 0, 38); c.writeUInt32LE(zip64 ? 0xFFFFFFFF : off, 42);
    parts.push(h, nm, body, dd); central.push(c, nm, x); off += 30 + nm.length + body.length + 16;
  }
  const cd = Buffer.concat(central), tail = [];
  if (zip64) { const z = Buffer.alloc(56); z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(44n, 4); z.writeUInt16LE(45, 12); z.writeUInt16LE(45, 14); z.writeBigUInt64LE(BigInt(entries.length), 24); z.writeBigUInt64LE(BigInt(entries.length), 32); z.writeBigUInt64LE(BigInt(cd.length), 40); z.writeBigUInt64LE(BigInt(off), 48);
    const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(off + cd.length), 8); l.writeUInt32LE(1, 16); tail.push(z, l); }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(zip64 ? 0xFFFF : entries.length, 8); end.writeUInt16LE(zip64 ? 0xFFFF : entries.length, 10); end.writeUInt32LE(zip64 ? 0xFFFFFFFF : cd.length, 12); end.writeUInt32LE(zip64 ? 0xFFFFFFFF : off, 16);
  return Buffer.concat([...parts, cd, ...tail, end]);
}
const put = (name, buf) => { const f = path.join(T, name); writeFileSync(f, buf); return f; };

// ── 1. The reader: zip64, data descriptors, CRC, bombs, links, names ──
for (const zip64 of [false, true]) {
  const big = randomBytes(70000), z = await openZip(put('dd' + zip64 + '.zip', finderZip([{ name: 'top/', dir: true }, { name: 'top/a.json', data: Buffer.from('{"a":1}') }, { name: 'top/b.bin', data: big }, { name: 'top/c.jpg', data: big.subarray(0, 999), store: true }], { zip64 })));
  const names = z.entries.filter(e => !e.dir).map(e => e.name), back = await Promise.all(z.entries.filter(e => !e.dir).map(e => z.read(e))); await z.close();
  ok(names.join() === 'top/a.json,top/b.bin,top/c.jpg' && back[0].toString() === '{"a":1}' && back[1].equals(big) && back[2].equals(big.subarray(0, 999)), (zip64 ? 'zip64 fields' : 'plain') + ' with data descriptors (local header zeros): every entry read from the central directory, CRC-checked');
}
{ const z = await openZip(put('crc.zip', finderZip([{ name: 'a.bin', data: randomBytes(500), badCrc: true }]))); await assert.rejects(z.read(z.entries[0]), /CRC-32/); await z.close(); n++; }
{ const z = await openZip(put('lie.zip', finderZip([{ name: 'a.bin', data: Buffer.alloc(5e6), saySize: 100000 }]))); await assert.rejects(z.read(z.entries[0]), /more than the zip says/); await assert.rejects(z.extractTo(z.entries[0], path.join(T, 'lie.out')), /more than the zip says/); await z.close(); n++; }   // a bomb: 5 MB of zeros saying 100 KB (inflate stops at what it says)
await assert.rejects(openZip(put('lie2.zip', finderZip([{ name: 'a.bin', data: Buffer.alloc(5e6), saySize: 1000 }]))), /packed for 1000 unpacked/); n++;   // (saying less than its packed size: refused from the directory)
await assert.rejects(openZip(put('bigent.zip', finderZip([{ name: 'a.bin', data: Buffer.alloc(10), saySize: ZIP_LIMITS.entry + 1 }], { zip64: true }))), /more than one file may be/); n++;
await assert.rejects(openZip(put('total.zip', finderZip(Array.from({ length: 9 }, (_, i) => ({ name: i + '.bin', data: Buffer.alloc(10), saySize: ZIP_LIMITS.entry - 1 })), { zip64: true }))), /GB unpacked/); n++;
await assert.rejects(openZip(put('link.zip', finderZip([{ name: 'assets/evil.json', link: true, data: Buffer.from('/etc/passwd') }]))), /symbolic link/); n++;
await assert.rejects(openZip(put('junk.zip', randomBytes(5000))), /not a zip/); n++;
{ // a small file with a huge body behind it: refused from the directory, before read() allocates the packed size
  const z = finderZip([{ name: 'maps/x.bsp', data: Buffer.alloc(1024, 7) }]), c = z.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); z.writeUInt32LE(50e6, c + 20);
  await assert.rejects(openZip(put('csize.zip', z)), /packed for 1024 unpacked/); n++;
  const st = finderZip([{ name: 'a.jpg', data: Buffer.alloc(100), store: true }]), c2 = st.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); st.writeUInt32LE(101, c2 + 24);
  await assert.rejects(openZip(put('stored.zip', st)), /stored sizes differ/); n++; }
for (const [what, patch] of [['disk 1', z => z.writeUInt16LE(1, z.length - 18)], ['directory on disk 1', z => z.writeUInt16LE(1, z.length - 16)], ['entries on other disks', z => z.writeUInt16LE(z.readUInt16LE(z.length - 12) - 1, z.length - 14)],
  ['zip64 locator: 3 disks', z => z.writeUInt32LE(3, z.length - 22 - 4)]]) {   // the last part of a split zip
  const z = finderZip([{ name: 'a.json', data: Buffer.from('{}') }, { name: 'b.json', data: Buffer.from('{}') }], { zip64: what.startsWith('zip64') }); patch(z);
  await assert.rejects(openZip(put('split.zip', z)), /split \(multi-part\) zip is not supported/, what); n++; }
ok(['assets/a.json', 'a b/c d.txt'].every(zipEntryName) && !['../a', 'a/../b', '/etc/x', 'C:/x', 'c:x', 'a\\b', 'a//b', './a', 'a\u0000b', ''].some(zipEntryName), 'names: relative only — no .., absolute paths, drive letters, backslashes, empty parts or control characters');

// ── 2. The writer: in pieces, zip64 ──
{ const buf = randomBytes(100003), chunks = [], fake = (fd, b, o, len) => { const k = Math.min(len, 777); chunks.push(Buffer.from(b.subarray(o, o + k))); return k; };   // a write that takes at most 777 bytes at a time
  ok(writeFully(1, buf, 1 << 12, fake) === buf.length && Buffer.concat(chunks).equals(buf) && chunks.every(c => c.length <= 777), 'writeFully: a buffer written in pieces (each ≤ the chunk, short writes continued) — how a pack over 2 GiB is written');
  const f = path.join(T, 'w64.zip'), data = randomBytes(3000), r = writeZipFile(f, [{ name: 'a.bin', data }, { name: 'p/b.jpg', file: put('src.jpg', data) }], { zip64: true, chunk: 100 }), z = await openZip(f);
  ok(r.zip64 && !existsSync(f + '.part') && z.entries.length === 2 && (await z.read(z.entries[0])).equals(data) && (await z.read(z.entries[1])).equals(data), 'writeZipFile: zip64 records, written 100 bytes at a time, files read as their turn comes, read back'); await z.close();
  const many = Array.from({ length: 65536 }, (_, i) => ({ name: 'e/' + i + '.json', data: Buffer.from(String(i)) })), g = path.join(T, 'many.zip'), rm2 = writeZipFile(g, many), zm = await openZip(g);
  ok(rm2.zip64 && zm.entries.length === 65536 && (await zm.read(zm.entries[65535])).toString() === '65535', 'more than 65535 entries: zip64 written and read (' + rm2.entries + ' entries)'); await zm.close();
  try { execFileSync('unzip', ['-tqq', f], { stdio: 'ignore' }); ok(true, 'unzip -t accepts the zip64 pack'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }

// ── 3. The room: a Finder-zipped "Infra Simulator Assets" folder, through POST /api/user-assets/pack ──
const png = (w, h) => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const webp = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };
const skinMan = name => ({ version: 1, made: 'x', res: 64, source: {}, shared: {}, base: {}, knives: {}, weapons: { ak: { model: 'cs2_ak', uv: 0, len: 37, finishes: { cu_test: { name, rarity: 'Covert', style: 7, wear: [0, 1], legacy: false, pearl: 0, fbId: 'redline', paint: 'ak/cu_test_paint.jpg', mrw: 'ak/cu_test_mrw.png' } } } } });
const skinFiles = name => [['skins.json', Buffer.from(JSON.stringify(skinMan(name)))], ['ak/cu_test_paint.jpg', jpg(64, 64)], ['ak/cu_test_mrw.png', png(64, 64)]];
const NAMES = Array.from({ length: 52 }, (_, i) => `bone_${i}`), ibm = new Float32Array(52 * 16); NAMES.forEach((_, i) => { for (let k = 0; k < 4; k++) ibm[i * 16 + k * 5] = 1; ibm[i * 16 + 12] = -.01 * i; });
const glb = (() => { const bin = Buffer.from(ibm.buffer), J = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'root', children: NAMES.map((_, i) => i + 1) }, ...NAMES.map(m => ({ name: m }))], skins: [{ joints: NAMES.map((_, i) => i + 1), inverseBindMatrices: 0 }], accessors: [{ bufferView: 0, componentType: 5126, count: 52, type: 'MAT4' }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }], buffers: [{ byteLength: bin.length }] };
  let js = Buffer.from(JSON.stringify(J)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]); const h = Buffer.alloc(12); h.write('glTF', 0, 'latin1'); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const c = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; }; return Buffer.concat([h, c(js.length, 0x4e4f534a), js, c(bin.length, 0x004e4942), bin]); })();
const hash = createHash('sha1').update(NAMES.join(',') + '|' + Array.from(ibm, x => Math.floor(x * 1e4 + .5)).join(',')).digest('hex');
const fin = (kit, type, name) => ({ id: kit, paintKit: 10000 + kit.length, name, rarity: 'ancient', rarityName: 'Extraordinary', type, shader: 'v1', color: `${type}/${kit}_color.jpg`, normal: `${type}/${kit}_normal.png`, orm: `${type}/${kit}_orm.png`, wear: `${type}/${kit}_wear.png`, icon: `icons/${type}/${kit}.webp`, wearRange: [.06, .8], wearLook: { brightness: -.26, saturation: -.2, roughness: .75 }, cloth: true, roughMean: .5, metalMean: 0, fallback: '#6c7890' });
const gloveMan = made => ({ version: 1, made, res: 64, source: { s2v: 'test' }, skeleton: { hash, bones: 52, from: 'arms-test.glb' }, types: { sporty: { id: 'sporty', name: 'Sport Gloves', item: 'sporty_gloves', defindex: 5030, mesh: 'meshes/glove-sporty.glb', skeleton: hash, meshes: {}, default: null, finishes: ['sporty_test_a'] } }, finishes: { sporty_test_a: fin('sporty_test_a', 'sporty', 'Test A') } });
const gloveFiles = made => { const m = gloveMan(made), f = m.finishes.sporty_test_a; return [['gloves.json', Buffer.from(JSON.stringify(m))], [m.types.sporty.mesh, glb], [f.color, jpg(64, 64)], [f.normal, png(64, 64)], [f.orm, png(64, 64)], [f.wear, png(512, 512)], [f.icon, webp(256, 192)]]; };
const manifest = { version: 1, hash: 'fold01', models: { weapons: { ak: { file: 'weapons/ak.bin', maps: ['base'] } }, agents: {}, viewmodels: {} } }, bin = randomBytes(4000);
const TOP = 'Infra Simulator Assets v53.0.1/';
const folderFiles = (skinName, made) => [['assets/manifest.json', Buffer.from(JSON.stringify(manifest))], ['assets/weapons/ak.bin', bin], ['assets/sounds/x.ogg', Buffer.from('OggS')],
  ...skinFiles(skinName).map(([r, d]) => ['assets/skins/' + r, d]), ...gloveFiles(made).map(([r, d]) => ['assets/gloves/' + r, d])];

async function room(tag, extra = {}) { const dir = path.join(T, tag), assetsDir = path.join(dir, 'assets'), mapsDir = path.join(dir, 'maps'); mkdirSync(dir, { recursive: true });
  const r = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(dir, 's.json'), roomCode: 'STRM01', hostKey: 'hk', deliveryScale: 0, assetsDir, mapsDir, log: () => {}, ...extra });
  return { r, dir, assetsDir, mapsDir, base: 'http://127.0.0.1:' + r.port }; }
const upload = async (base, body) => { const x = await fetch(base + '/api/user-assets/pack', { method: 'POST', body }); return { status: x.status, d: await x.json() }; };
{ const A0 = path.join(T, 'folder', 'assets'), stale = path.join(A0, '.gd-pack-staging-old'), fresh = path.join(A0, '.gd-pack-staging-now'); mkdirSync(stale, { recursive: true }); mkdirSync(fresh, { recursive: true }); writeFileSync(path.join(stale, 'x.bin'), 'x');
  const old = new Date(Date.now() - 2 * 3600e3); utimesSync(stale, old, old); globalThis.gdSweep = { stale, fresh }; }   // (a room that quit mid-install)
{ const R = await room('folder'), A = R.assetsDir;
  ok(!existsSync(globalThis.gdSweep.stale) && existsSync(globalThis.gdSweep.fresh), 'at start the room removes staging folders a quit room left (over an hour old), not a fresh one'); rmSync(globalThis.gdSweep.fresh, { recursive: true });
  mkdirSync(path.join(A, 'skins'), { recursive: true }); writeFileSync(path.join(A, 'skins', 'skins.json'), '{"version":1,"old":true}');   // an older set: kept as a backup
  const ents = [{ name: TOP, dir: true }, { name: TOP + 'assets/', dir: true }, ...folderFiles('Folder', 'f1').map(([r, data]) => ({ name: TOP + r, data })),
    { name: TOP + 'READ ME.txt', data: Buffer.from('copy the folders') }, { name: TOP + '.DS_Store', data: Buffer.from('x') }, { name: TOP + 'assets/._manifest.json', data: Buffer.from('apple double') },
    { name: '__MACOSX/', dir: true }, { name: '__MACOSX/' + TOP + 'assets/._manifest.json', data: Buffer.from('apple double') },
    { name: TOP + 'assets/../evil.json', data: Buffer.from('{}') }, { name: TOP + 'assets/weapons\\win.json', data: Buffer.from('{}') }, { name: TOP + 'assets/run.sh', data: Buffer.from('rm -rf /') }];
  const { status, d } = await upload(R.base, finderZip(ents, { zip64: true }));
  const leftNow = tmpLeft().filter(f => !before.has(f));
  ok(!leftNow.length && !readdirSync(A).some(f => f.startsWith('.gd-pack-staging-')), 'by the time the reply arrives, the upload\'s temporary file and the staging folder are gone', leftNow.join());
  ok(status === 200 && d.layout === 'folder' && d.files === 3 && d.skins === 3 && d.gloves === 7 && d.skinsNote === 'installed' && d.glovesNote === 'installed', 'the folder zipped by Finder (one top folder, zip64, data descriptors): installed without infra-pack.json', JSON.stringify(d));
  ok(readFileSync(path.join(A, 'weapons', 'ak.bin')).equals(bin) && JSON.parse(readFileSync(path.join(A, 'manifest.json'), 'utf8')).hash === 'fold01', 'its assets/ files are in the assets folder, the same bytes (the top folder left out)');
  ok(JSON.parse(readFileSync(path.join(A, 'skins', 'skins.json'), 'utf8')).weapons.ak.finishes.cu_test.name === 'Folder' && readdirSync(A).some(f => /^skins\.bak-/.test(f)) && JSON.parse(readFileSync(path.join(A, readdirSync(A).find(f => /^skins\.bak-/.test(f)), 'skins.json'), 'utf8')).old === true, 'assets/skins/ installed through installSkins: the new set in place, the old one kept as skins.bak-…');
  ok(JSON.parse(readFileSync(path.join(A, 'gloves', 'gloves.json'), 'utf8')).made === 'f1' && existsSync(path.join(A, 'gloves', 'meshes', 'glove-sporty.glb')), 'assets/gloves/ installed through installGloves');
  ok(!existsSync(path.join(R.dir, 'evil.json')) && !existsSync(path.join(A, 'evil.json')) && !existsSync(path.join(A, 'run.sh')) && !readdirSync(A).some(f => /^\._|\.DS_Store|READ ME|__MACOSX|win/.test(f)) && !existsSync(path.join(A, 'weapons', 'win.json')), 'Finder\'s own files (__MACOSX/, ._*, .DS_Store), the READ ME, .. and backslash names and unknown types: never written');
  const m = await (await fetch(R.base + '/api/user-assets')).json(); ok(m.hash === 'fold01', 'the room serves the new manifest');
  const pick = await (await fetch(R.base + '/user-assets/skins/skins.json')).json(), gl = await fetch(R.base + '/user-assets/gloves/gloves.json');
  ok(pick.weapons.ak.finishes.cu_test.name === 'Folder' && gl.ok, 'and the new finish and glove catalogues');
  const again = await upload(R.base, finderZip(ents));
  ok(again.status === 200 && again.d.skinsNote === 'unchanged' && again.d.glovesNote === 'unchanged' && readdirSync(A).filter(f => /^skins\.bak-/.test(f)).length === 1, 'the same folder again (no zip64 this time): skins and gloves unchanged, no backup used up', JSON.stringify(again.d));
  // Without a top folder (the folder's contents selected and compressed) — and an old-format pack still works.
  const flat = await upload(R.base, finderZip(folderFiles('Flat', 'f2').map(([r, data]) => ({ name: r, data }))));
  ok(flat.status === 200 && flat.d.layout === 'folder' && JSON.parse(readFileSync(path.join(A, 'skins', 'skins.json'), 'utf8')).weapons.ak.finishes.cu_test.name === 'Flat', 'the folder\'s contents zipped without the top folder', JSON.stringify(flat.d));
  const old = await upload(R.base, writeZip([{ name: 'infra-pack.json', data: Buffer.from('{}') }, { name: 'assets/weapons/ak.bin', data: bin }, { name: 'assets/skins/skins.json', data: Buffer.from('{"overwrite":true}') }]));
  ok(old.status === 200 && old.d.layout === 'pack' && old.d.files === 1 && !JSON.parse(readFileSync(path.join(A, 'skins', 'skins.json'), 'utf8')).overwrite, 'an old-format pack (infra-pack.json): as before — its assets/skins/ never written over the set', JSON.stringify(old.d));
  // All or nothing (as v53.0.0): a damaged entry anywhere — the files before it are not installed either.
  const keep = readFileSync(path.join(A, 'manifest.json')), snap = () => readdirSync(A, { recursive: true }).sort().join();
  const s0 = snap();
  for (const [what, ents] of [
    ['an old-format pack, a bad CRC after two good files', [{ name: 'infra-pack.json', data: Buffer.from('{}') }, { name: 'assets/manifest.json', data: Buffer.from('{"hash":"half"}') }, { name: 'assets/weapons/new1.bin', data: bin }, { name: 'assets/weapons/new2.bin', data: bin, badCrc: true }]],
    ['the folder, a bomb entry last', [{ name: TOP + 'assets/manifest.json', data: Buffer.from('{"hash":"half"}') }, { name: TOP + 'assets/weapons/new1.bin', data: bin }, { name: TOP + 'assets/weapons/new2.bin', data: Buffer.alloc(3e6), saySize: 100000 }]],
    ['the folder, finishes that fail the skins check', [{ name: TOP + 'assets/manifest.json', data: Buffer.from('{"hash":"half"}') }, { name: TOP + 'assets/weapons/new1.bin', data: bin }, { name: TOP + 'assets/skins/skins.json', data: Buffer.from('{"version":9}') }]]]) {
    const r = await upload(R.base, finderZip(ents));
    ok(r.status === 400 && readFileSync(path.join(A, 'manifest.json')).equals(keep) && !existsSync(path.join(A, 'weapons', 'new1.bin')) && snap() === s0, what + ': refused, nothing installed (no file of it moved in, the old manifest kept)', r.d.error); }
  ok(!readdirSync(A).some(f => f.startsWith('.gd-pack-staging-')), 'the staging folder is removed after a refused pack');
  // Refused whole.
  const link = await upload(R.base, finderZip([{ name: TOP + 'assets/manifest.json', data: Buffer.from('{}') }, { name: TOP + 'assets/weapons/x.bin', link: true, data: Buffer.from('/etc/passwd') }]));
  ok(link.status === 400 && /symbolic link/.test(link.d.error) && !existsSync(path.join(A, 'weapons', 'x.bin')), 'a symbolic link entry: the pack refused', link.d.error);
  const crc = await upload(R.base, finderZip([{ name: 'assets/manifest.json', data: Buffer.from('{}') }, { name: 'assets/weapons/c.bin', data: bin, badCrc: true }]));
  ok(crc.status === 400 && /CRC-32/.test(crc.d.error) && !existsSync(path.join(A, 'weapons', 'c.bin')), 'a CRC mismatch: refused, the damaged file not written', crc.d.error);
  const bomb = await upload(R.base, finderZip([{ name: 'assets/manifest.json', data: Buffer.from('{}') }, { name: 'assets/weapons/b.bin', data: Buffer.alloc(20e6), saySize: 200000 }]));
  ok(bomb.status === 400 && /more than the zip says/.test(bomb.d.error) && !existsSync(path.join(A, 'weapons', 'b.bin')), 'a zip bomb (20 MB of zeros saying 200 KB): refused', bomb.d.error);
  ok(!readdirSync(path.join(A, 'weapons')).some(f => f.endsWith('.part')), 'a refused entry leaves no half-written file (each is streamed through <file>.part, renamed once its size and CRC-32 are right)');
  const huge = await upload(R.base, finderZip([{ name: 'assets/manifest.json', data: Buffer.from('{}') }, ...Array.from({ length: 9 }, (_, i) => ({ name: 'assets/weapons/' + i + '.bin', data: Buffer.alloc(8), saySize: ZIP_LIMITS.entry - 1 }))], { zip64: true }));
  ok(huge.status === 400 && /GB unpacked/.test(huge.d.error), 'a pack that says it unpacks to more than 8 GB: refused before anything is written', huge.d.error);
  const none = await upload(R.base, finderZip([{ name: TOP + 'notes.txt', data: Buffer.from('x') }]));
  ok(none.status === 400 && /infra-pack\.json/.test(none.d.error), 'a zip that is neither a pack nor the folder: refused');
  await R.r.close(); }

// (the client streams the file with backpressure: Node's fetch would hold a Blob body whole in this same process)
const streamUp = (port, file) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/user-assets/pack', headers: { 'content-length': statSync(file).size } }, x => { const b = []; x.on('data', c => b.push(c)); x.on('end', () => res({ status: x.statusCode, d: JSON.parse(Buffer.concat(b)) })); }); q.on('error', rej); pipeline(createReadStream(file), q).catch(rej); });
// ── 4. Memory: a 256 MB pack streamed in and installed with the room's memory growing far less ──
{ const R = await room('mem'), f = path.join(T, 'mem.zip'), N = 32, piece = randomBytes(8 * 2 ** 20);   // stored .jpg entries: no deflate time (CI)
  writeZipFile(f, [{ name: 'infra-pack.json', data: Buffer.from('{}') }, ...Array.from({ length: N }, (_, i) => ({ name: 'assets/pics/' + i + '.jpg', data: piece }))]);
  const size = statSync(f).size; globalThis.gc?.(); await new Promise(r => setTimeout(r, 50));
  const rss0 = process.memoryUsage().rss; let peak = rss0; const iv = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  const t0 = performance.now(), { status, d } = await streamUp(R.r.port, f), ms = performance.now() - t0; clearInterval(iv); peak = Math.max(peak, process.memoryUsage().rss);
  const grow = peak - rss0;
  ok(status === 200 && d.files === N && readFileSync(path.join(R.assetsDir, 'pics', (N - 1) + '.jpg')).equals(piece), 'a ' + (size / 2 ** 20).toFixed(0) + ' MB pack streamed and installed', JSON.stringify(d));
  ok(grow < size * 0.4, 'the room (and this client, same process) grew ' + (grow / 2 ** 20).toFixed(0) + ' MB for a ' + (size / 2 ** 20).toFixed(0) + ' MB pack (v53.0.0: at least the whole pack, twice while concatenating)');
  console.log('  memory: ' + (size / 2 ** 20).toFixed(0) + ' MB pack, rss +' + (grow / 2 ** 20).toFixed(0) + ' MB, ' + ms.toFixed(0) + ' ms');
  await R.r.close(); }

// ── 5. On a Mac: a real Finder-style zip (ditto -c -k --sequesterRsrc --keepParent, an extended attribute → __MACOSX/) ──
if (process.platform === 'darwin' && existsSync('/usr/bin/ditto')) {
  const src = path.join(T, 'Infra Simulator Assets v53.0.1');
  for (const [r, data] of [...folderFiles('Ditto', 'd1'), ['READ ME.txt', Buffer.from('read me')]]) { const p = path.join(src, r); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, data); }
  try { execFileSync('xattr', ['-w', 'com.infra.test', 'x', path.join(src, 'assets', 'manifest.json')]); } catch {}
  const z = path.join(T, 'ditto.zip'); execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', src, z]);
  const R = await room('ditto'), { status, d } = await streamUp(R.r.port, z);
  ok(status === 200 && d.layout === 'folder' && d.files === 3 && d.skinsNote === 'installed' && d.glovesNote === 'installed' && readFileSync(path.join(R.assetsDir, 'weapons', 'ak.bin')).equals(bin) && JSON.parse(readFileSync(path.join(R.assetsDir, 'skins', 'skins.json'), 'utf8')).weapons.ak.finishes.cu_test.name === 'Ditto', 'a real ditto --keepParent zip of the folder installs (' + (await openZip(z).then(async q => { const s = q.entries.filter(e => e.name.startsWith('__MACOSX/')).length; await q.close(); return s; })) + ' __MACOSX entries skipped)', JSON.stringify(d));
  await R.r.close(); }

setSkinCatalog(null); setGloveCatalog(null);
const left = tmpLeft().filter(f => !before.has(f));   // (removed before the reply is sent)
ok(!left.length, 'every temporary folder removed (the upload, the skins and gloves staging)', left.join());
rmSync(T, { recursive: true, force: true });
console.log('PASS: asset packs from a file · ' + n + ' checks (zip64, data descriptors, the Finder-zipped folder with skins and gloves through their installers, links / CRC / bombs / names refused, streamed with bounded memory, the writer in pieces and zip64)');
