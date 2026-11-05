// Minimal .zip writing and reading (stored and deflated entries, Node's zlib) for Global Defensive's asset packs: one file
// with every imported model and map, made by tools/import-cs2-models.mjs and installed by the room (lan/room.mjs) on any
// computer. readZip / writeZip work on one Buffer (small packs, the tests); openZip / writeZipFile work on a file, one
// entry at a time, for packs of several GB (53.0.1: the desktop app's V8 cannot hold a 2.3 GB Buffer, and one fs write is
// capped at 2 GiB).
import zlib from 'node:zlib';
import { open as openFile } from 'node:fs/promises';
import { openSync, writeSync, closeSync, readFileSync, renameSync, rmSync, createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
export function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

// entries: [{ name, data: Buffer }] → the .zip (pictures and .glb stored as they are, everything else deflated).
export function writeZip(entries) {
  const parts = [], central = []; let off = 0;
  for (const { name, data } of entries) {
    const nm = Buffer.from(name, 'utf8'), deflate = !/\.(jpe?g|png|webp)$/i.test(name), body = deflate ? zlib.deflateRawSync(data, { level: 6 }) : data, crc = crc32(data), method = deflate ? 8 : 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, nm, body); central.push(c, nm); off += 30 + nm.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

// The entries of a .zip: [{ name, data }] (directories left out). Throws on anything it can't read.
export function readZip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--; if (e < 0) throw Error('not a zip file');
  const n = buf.readUInt16LE(e + 10), out = []; let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw Error('damaged zip directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen); p += 46 + nlen + xlen + clen; if (name.endsWith('/')) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null; if (!data) throw Error(name + ': unsupported compression'); if (data.length !== size) throw Error(name + ': damaged');
    out.push({ name, data });
  }
  return out;
}

// ---- 53.0.1: zips as files, one entry at a time ----
const inflateRaw = promisify(zlib.inflateRaw);
const crcMore = typeof zlib.crc32 === 'function' ? (b, c = 0) => zlib.crc32(b, c) >>> 0   // (Node 20.15+ and the desktop app's Electron 33)
  : (b, c = 0) => { c = ~c; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
const fastCrc = b => crcMore(b);
const U32 = 0xFFFFFFFF;
// What a zip may hold before it is refused (a zip bomb, or not an asset pack): one file, everything unpacked, the entry
// count and the directory. The v53.0.0 folder is 2.8 GB unpacked, its largest file 100 MB.
export const ZIP_LIMITS = { entry: 2 ** 30, total: 8 * 2 ** 30, entries: 200000, directory: 256 * 2 ** 20 };
// A name that stays inside the folder it is unpacked into: relative, '/'-separated, no '.' / '..' / empty parts, no
// backslash, no drive letter or other ':' and no control characters.
export function zipEntryName(name) {
  return typeof name === 'string' && name.length > 0 && name.length < 1024 && !name.startsWith('/') && !/[\\:\x00-\x1f]/.test(name)
    && !name.replace(/\/$/, '').split('/').some(x => !x || x === '.' || x === '..');
}

// A .zip on disk: { entries, read(entry) → Buffer, close() }. Reads the end record (zip64 too) and the central directory
// only; read() reads and unpacks one entry (stored or deflated) and checks its size and CRC-32. The central directory's
// sizes are trusted (entries written with data descriptors, as Finder's Compress writes them, have zeros in their local
// header). Refused: split (multi-part) zips, encrypted entries, symbolic links, a packed size that cannot match the
// unpacked one, an entry over `maxEntry` or a total over `maxTotal` unpacked (what the directory says; an entry that
// unpacks to more than it says is refused when read).
// entry: { name, method, crc, csize, size, local, dir }; extractTo(entry, file) streams one entry to a file instead.
export async function openZip(file, { maxEntry = ZIP_LIMITS.entry, maxTotal = ZIP_LIMITS.total, maxEntries = ZIP_LIMITS.entries } = {}) {
  const fh = await openFile(file, 'r');
  try {
    const size = (await fh.stat()).size;
    const at = async (pos, len) => {
      if (pos < 0 || pos + len > size) throw Error('damaged zip (an offset past the end of the file)');
      const b = Buffer.allocUnsafe(len); let got = 0;
      while (got < len) { const { bytesRead } = await fh.read(b, got, len - got, pos + got); if (!bytesRead) throw Error('zip file cut short'); got += bytesRead; }
      return b;
    };
    const dataAt = async en => { const h = await at(en.local, 30); if (h.readUInt32LE(0) !== 0x04034b50) throw Error(en.name + ': damaged zip entry'); const p = en.local + 30 + h.readUInt16LE(26) + h.readUInt16LE(28); if (p + en.csize > size) throw Error(en.name + ': cut short'); return p; };
    if (size < 22) throw Error('not a zip file');
    const tailLen = Math.min(size, 22 + 65535), tailPos = size - tailLen, tail = await at(tailPos, tailLen);
    let e = tailLen - 22; while (e >= 0 && !(tail.readUInt32LE(e) === 0x06054b50 && e + 22 + tail.readUInt16LE(e + 20) <= tailLen)) e--;
    if (e < 0) throw Error('not a zip file');
    const endPos = tailPos + e; let count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16), dirEnd = endPos;
    // A split (multi-part) zip — zip -s, WinZip/7-Zip volumes: .z01 … .zip — is refused up front (only its last part is
    // here; its entries would read as "damaged" one by one): this disk and the directory's disk 0, every entry on it.
    const SPLIT = 'a split (multi-part) zip is not supported: zip the folder again as one file';
    const d16 = (v, wide) => v !== 0 && !(wide && v === 0xFFFF);   // (0xFFFF: the value is in the zip64 record)
    if (d16(tail.readUInt16LE(e + 4), true) || d16(tail.readUInt16LE(e + 6), true) || (tail.readUInt16LE(e + 8) !== tail.readUInt16LE(e + 10))) throw Error(SPLIT);
    if (endPos >= 20) {   // zip64: the locator just before the end record points at the zip64 end record
      const loc = e >= 20 ? tail.subarray(e - 20, e) : await at(endPos - 20, 20);
      if (loc.readUInt32LE(0) === 0x07064b50) {
        if (loc.readUInt32LE(4) !== 0 || loc.readUInt32LE(16) > 1) throw Error(SPLIT);
        const z = Number(loc.readBigUInt64LE(8)), r = await at(z, 56); if (r.readUInt32LE(0) !== 0x06064b50) throw Error('damaged zip64 end record');
        if (r.readUInt32LE(16) !== 0 || r.readUInt32LE(20) !== 0 || r.readBigUInt64LE(24) !== r.readBigUInt64LE(32)) throw Error(SPLIT);
        count = Number(r.readBigUInt64LE(32)); cdSize = Number(r.readBigUInt64LE(40)); cdOff = Number(r.readBigUInt64LE(48)); dirEnd = z;
      }
    }
    if (count > maxEntries) throw Error('too many entries (' + count + ')');
    if (cdSize > ZIP_LIMITS.directory || cdOff + cdSize > dirEnd) throw Error('damaged zip directory');
    const cd = await at(cdOff, cdSize), entries = []; let p = 0, total = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw Error('damaged zip directory');
      const madeBy = cd.readUInt16LE(p + 4), flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16), nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32), attr = cd.readUInt32LE(p + 38);
      let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24), local = cd.readUInt32LE(p + 42);
      if (p + 46 + nlen + xlen + clen > cd.length) throw Error('damaged zip directory');
      const name = cd.toString('utf8', p + 46, p + 46 + nlen);
      for (let x = p + 46 + nlen, xe = x + xlen; x + 4 <= xe;) {   // extra fields: zip64 (0x0001) holds the sizes and offset that did not fit
        const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2), d = x + 4; if (d + len > xe) break;
        if (id === 1) { let q = d; const big = () => { if (q + 8 > d + len) throw Error(name + ': damaged zip64 field'); const v = Number(cd.readBigUInt64LE(q)); q += 8; return v; };
          if (usize === U32) usize = big(); if (csize === U32) csize = big(); if (local === U32) local = big(); }
        x = d + len;
      }
      p += 46 + nlen + xlen + clen;
      if ((madeBy >>> 8) === 3 && ((attr >>> 16) & 0o170000) === 0o120000) throw Error(name + ': a symbolic link (refused)');
      if (flags & 1) throw Error(name + ': encrypted (not supported)');
      const dir = name.endsWith('/');
      // The packed size against the unpacked one, before anything is read or allocated (read() holds one packed entry):
      // stored, the same; deflated, at most what deflate's worst case adds (stored blocks: 5 bytes a 64 KB block) with
      // room to spare — a small file with gigabytes behind it is refused here.
      if (method === 0 && csize !== usize) throw Error(name + ': damaged (stored sizes differ)');
      if (method === 8 && csize > usize + Math.ceil(usize / 16) + 1024) throw Error(name + ': damaged (' + csize + ' bytes packed for ' + usize + ' unpacked)');
      if (!dir) { if (usize > maxEntry) throw Error(name + ': ' + (usize / 2 ** 20).toFixed(0) + ' MB unpacked, more than one file may be (' + (maxEntry / 2 ** 20).toFixed(0) + ' MB)');
        total += usize; if (total > maxTotal) throw Error('more than ' + (maxTotal / 2 ** 30).toFixed(1) + ' GB unpacked (refused)'); }
      entries.push({ name, method, crc, csize, size: usize, local, dir });
    }
    return {
      entries, size, total,
      async read(en) {
        if (en.dir) return Buffer.alloc(0);
        const raw = await at(await dataAt(en), en.csize); let data;
        if (en.method === 0) data = raw;
        else if (en.method === 8) { try { data = await inflateRaw(raw, { maxOutputLength: Math.max(1, en.size) }); } catch (err) { throw Error(en.name + (err.code === 'ERR_BUFFER_TOO_LARGE' ? ': unpacks to more than the zip says (refused)' : ': damaged (' + err.message + ')')); } }
        else throw Error(en.name + ': unsupported compression (' + en.method + ')');
        if (data.length !== en.size) throw Error(en.name + ': damaged (' + data.length + ' bytes, the zip says ' + en.size + ')');
        if (fastCrc(data) !== en.crc) throw Error(en.name + ': damaged (CRC-32 does not match)');
        return data;
      },
      // One entry streamed into `dest` (through dest.part, renamed once its size and CRC-32 are right; removed if not):
      // memory stays at the stream buffers, whatever the entry's size.
      async extractTo(en, dest) {
        if (en.method !== 0 && en.method !== 8) throw Error(en.name + ': unsupported compression (' + en.method + ')');
        if (en.method === 0 && en.csize !== en.size) throw Error(en.name + ': damaged (stored sizes differ)');
        const start = await dataAt(en), part = dest + '.part'; let got = 0, crc = 0;
        const check = new Transform({ transform(c, _, done) { got += c.length; if (got > en.size) return done(Error(en.name + ': unpacks to more than the zip says (refused)')); crc = crcMore(c, crc); done(null, c); } });
        try {
          const src = async function* () { for (let pos = start, left = en.csize; left > 0;) { const k = Math.min(left, 2 ** 20), b = Buffer.allocUnsafe(k), { bytesRead } = await fh.read(b, 0, k, pos); if (!bytesRead) throw Error('cut short'); pos += bytesRead; left -= bytesRead; yield bytesRead === k ? b : b.subarray(0, bytesRead); } };   // (1 MB reads; FileHandle.createReadStream leaves a listener per stream)
          await pipeline(src, ...(en.method === 8 ? [zlib.createInflateRaw()] : []), check, createWriteStream(part));
          if (got !== en.size) throw Error(en.name + ': damaged (' + got + ' bytes, the zip says ' + en.size + ')');
          if (crc !== en.crc) throw Error(en.name + ': damaged (CRC-32 does not match)');
          await rename(part, dest);
        } catch (err) { await rm(part, { force: true }).catch(() => {}); throw String(err.message).startsWith(en.name + ':') ? err : Error(en.name + ': damaged (' + err.message + ')'); }
        return en.size;
      },
      close: () => fh.close(),
    };
  } catch (err) { await fh.close().catch(() => {}); throw err; }
}

// One write call is capped at 2 GiB in Node: buf written in pieces of at most `chunk` bytes, each write's own count trusted.
export function writeFully(fd, buf, chunk = 2 ** 30, write = writeSync) {
  for (let o = 0; o < buf.length;) { const n = write(fd, buf, o, Math.min(chunk, buf.length - o)); if (!(n > 0)) throw Error('write failed'); o += n; }
  return buf.length;
}

// entries (any iterable): { name, data: Buffer } or { name, file: path } (read when its turn comes) → the .zip written to
// `file` one entry at a time (as writeZip: pictures stored, everything else deflated), never all in memory, through
// `file`.part renamed at the end. Zip64 records when the zip passes 4 GB or 65535 entries (or `zip64: true`); one file of
// 4 GB or more is refused. → { entries, bytes, zip64 }
export function writeZipFile(file, entries, { zip64: force64 = false, chunk = 2 ** 30 } = {}) {
  const part = file + '.part', fd = openSync(part, 'w'), central = []; let off = 0, n = 0, any64 = force64;
  const put = b => { off += writeFully(fd, b, chunk); };
  try {
    for (const en of entries) {
      const data = en.data ?? readFileSync(en.file), nm = Buffer.from(en.name, 'utf8'), deflate = !/\.(jpe?g|png|webp)$/i.test(en.name), body = deflate ? zlib.deflateRawSync(data, { level: 6 }) : data, crc = fastCrc(data), method = deflate ? 8 : 0;
      if (data.length >= U32 || body.length >= U32) throw Error(en.name + ': one file of 4 GB or more is not supported');
      const z = force64 || off >= U32; any64 ||= z;
      const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
      const c = Buffer.alloc(46 + (z ? 12 : 0)); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(z ? 45 : 20, 4); c.writeUInt16LE(z ? 45 : 20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28);
      if (z) { c.writeUInt16LE(12, 30); c.writeUInt32LE(U32, 42); c.writeUInt16LE(1, 46); c.writeUInt16LE(8, 48); c.writeBigUInt64LE(BigInt(off), 50); } else c.writeUInt32LE(off, 42);
      central.push(Buffer.concat([c.subarray(0, 46), nm, c.subarray(46)])); n++;
      put(h); put(nm); put(body);
    }
    const cdOff = off; for (const c of central) put(c); const cdSize = off - cdOff;
    const big = any64 || n > 0xFFFF || cdOff >= U32 || cdSize >= U32;
    if (big) {
      const z = Buffer.alloc(56), zAt = off; z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(44n, 4); z.writeUInt16LE(45, 12); z.writeUInt16LE(45, 14); z.writeBigUInt64LE(BigInt(n), 24); z.writeBigUInt64LE(BigInt(n), 32); z.writeBigUInt64LE(BigInt(cdSize), 40); z.writeBigUInt64LE(BigInt(cdOff), 48); put(z);
      const l = Buffer.alloc(20); l.writeUInt32LE(0x07064b50, 0); l.writeBigUInt64LE(BigInt(zAt), 8); l.writeUInt32LE(1, 16); put(l);
    }
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(big ? 0xFFFF : n, 8); end.writeUInt16LE(big ? 0xFFFF : n, 10); end.writeUInt32LE(big ? U32 : cdSize, 12); end.writeUInt32LE(big ? U32 : cdOff, 16); put(end);
    closeSync(fd); renameSync(part, file);
    return { entries: n, bytes: off, zip64: big };
  } catch (err) { try { closeSync(fd); } catch {} rmSync(part, { force: true }); throw err; }
}
