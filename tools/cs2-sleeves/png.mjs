// A small PNG reader and writer for tools/import-cs2-sleeves.mjs (Source2Viewer-CLI writes every texture it exports
// as an 8-bit, non-interlaced PNG). Reads colour types 0 (grey), 2 (RGB), 4 (grey + alpha) and 6 (RGBA) at 8 bits
// into RGBA bytes; writes 8-bit RGB or RGBA with filter 0 on every row (no colour chunks: nothing colour-manages a data
// map). Node's zlib only, no dependencies. Pure; throws on a PNG it does not read.
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// → { w, h, data: Uint8Array (w·h·4, RGBA) }
export function readPNG(buf) {
  if (!Buffer.isBuffer(buf) || !buf.subarray(0, 8).equals(SIG)) throw Error('PNG: not a PNG');
  let i = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0; const idat = [];
  while (i + 8 <= buf.length) { const n = buf.readUInt32BE(i), t = buf.toString('latin1', i + 4, i + 8), d = buf.subarray(i + 8, i + 8 + n);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; } else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break; i += 12 + n; }
  const C = { 0: 1, 2: 3, 4: 2, 6: 4 }[type]; if (depth !== 8 || !C || inter) throw Error(`PNG: ${depth}-bit type ${type}${inter ? ' interlaced' : ''} not read`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * C, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) { const a = x >= C ? px[o + x - C] : 0, b = y ? px[o - stride + x] : 0, c = x >= C && y ? px[o - stride + x - C] : 0, r = raw[src + x];
      px[o + x] = (f === 0 ? r : f === 1 ? r + a : f === 2 ? r + b : f === 3 ? r + ((a + b) >> 1) : r + paeth(a, b, c)) & 255; } }
  const data = new Uint8Array(w * h * 4);
  for (let p = 0, q = 0; p < w * h; p++, q += C) { const o = p * 4;
    if (C >= 3) { data[o] = px[q]; data[o + 1] = px[q + 1]; data[o + 2] = px[q + 2]; data[o + 3] = C === 4 ? px[q + 3] : 255; }
    else { data[o] = data[o + 1] = data[o + 2] = px[q]; data[o + 3] = C === 2 ? px[q + 1] : 255; } }
  return { w, h, data };
}
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
// RGBA bytes (w·h·4) → a PNG with `channels` 3 (RGB) or 4 (RGBA).
export function writePNG(w, h, rgba, channels = 4) {
  const C = channels === 3 ? 3 : 4, stride = w * C, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = y * (stride + 1) + 1 + x * C; raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]; if (C === 4) raw[d + 3] = rgba[s + 3]; }
  const hdr = Buffer.alloc(13); hdr.writeUInt32BE(w, 0); hdr.writeUInt32BE(h, 4); hdr[8] = 8; hdr[9] = C === 4 ? 6 : 2;
  return Buffer.concat([SIG, chunk('IHDR', hdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function chunk(type, data) { const t = Buffer.from(type, 'latin1'), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length);
  let c = -1; for (const b of [t, data]) for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); crc.writeUInt32BE((c ^ -1) >>> 0); return Buffer.concat([len, t, data, crc]); }
// A box-filtered copy at (W, H) (smaller only: the ORM map at half size), RGBA.
export function shrink(img, W, H) {
  if (W === img.w && H === img.h) return img; const out = new Uint8Array(W * H * 4), sx = img.w / W, sy = img.h / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx)), y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy)); let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const s = (yy * img.w + xx) * 4; r += img.data[s]; g += img.data[s + 1]; b += img.data[s + 2]; a += img.data[s + 3]; n++; }
    const o = (y * W + x) * 4; out[o] = r / n + .5; out[o + 1] = g / n + .5; out[o + 2] = b / n + .5; out[o + 3] = a / n + .5; }
  return { w: W, h: H, data: out };
}
// Nearest-sample resize (a map at another map's size, e.g. a 1×1 AO beside a 1024×2048 normal), RGBA.
export function resample(img, W, H) {
  if (W === img.w && H === img.h) return img; const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) { const sy = Math.min(img.h - 1, Math.floor((y + .5) * img.h / H)); for (let x = 0; x < W; x++) { const sx = Math.min(img.w - 1, Math.floor((x + .5) * img.w / W)), s = (sy * img.w + sx) * 4, o = (y * W + x) * 4; out[o] = img.data[s]; out[o + 1] = img.data[s + 1]; out[o + 2] = img.data[s + 2]; out[o + 3] = img.data[s + 3]; } }
  return { w: W, h: H, data: out };
}
export function crop(img, x0, y0, x1, y1) {
  const W = x1 - x0, H = y1 - y0, out = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) out.set(img.data.subarray(((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x1) * 4), y * W * 4);
  return { w: W, h: H, data: out };
}
