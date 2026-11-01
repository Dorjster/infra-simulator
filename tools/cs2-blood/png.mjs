// Small PNG reader / writer and RGBA helpers for tools/import-cs2-blood.mjs (no dependencies: node's zlib). Reads 8- and
// 16-bit non-interlaced PNGs of every colour type (grey, RGB, palette, grey + alpha, RGBA) into RGBA8; writes RGBA8.
import { inflateSync, deflateSync } from 'node:zlib';
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
export function readPng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw Error('not a PNG');
  let o = 8, W = 0, H = 0, depth = 8, type = 6, inter = 0, pal = null, trns = null; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), kind = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len); o += 12 + len;
    if (kind === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (kind === 'PLTE') pal = d; else if (kind === 'tRNS') trns = d; else if (kind === 'IDAT') idat.push(d); else if (kind === 'IEND') break; }
  if (inter) throw Error('interlaced PNG'); if (depth !== 8 && depth !== 16 && !(type === 3 && depth <= 8)) throw Error('PNG bit depth ' + depth);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], bpp = Math.max(1, ch * depth / 8), stride = Math.ceil(W * ch * depth / 8), raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) { const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0, v = raw[src + x];
      let p; if (f === 0) p = v; else if (f === 1) p = v + a; else if (f === 2) p = v + b; else if (f === 3) p = v + ((a + b) >> 1); else { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[dst + x] = p & 255; } }
  const out = new Uint8Array(W * H * 4), s16 = depth === 16 ? 2 : 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o4 = (y * W + x) * 4;
    if (type === 3) { const bits = depth, per = 8 / bits, byte = px[y * stride + Math.floor(x / per)], idx = (byte >> ((per - 1 - x % per) * bits)) & ((1 << bits) - 1); out[o4] = pal[idx * 3]; out[o4 + 1] = pal[idx * 3 + 1]; out[o4 + 2] = pal[idx * 3 + 2]; out[o4 + 3] = trns && idx < trns.length ? trns[idx] : 255; continue; }
    const i = y * stride + x * ch * s16, g = k => px[i + k * s16];
    if (type === 0) { out[o4] = out[o4 + 1] = out[o4 + 2] = g(0); out[o4 + 3] = 255; } else if (type === 4) { out[o4] = out[o4 + 1] = out[o4 + 2] = g(0); out[o4 + 3] = g(1); }
    else if (type === 2) { out[o4] = g(0); out[o4 + 1] = g(1); out[o4 + 2] = g(2); out[o4 + 3] = 255; } else { out[o4] = g(0); out[o4 + 1] = g(1); out[o4 + 2] = g(2); out[o4 + 3] = g(3); } }
  return { width: W, height: H, data: out };
}
export function writePng({ width: W, height: H, data }) {
  const raw = Buffer.alloc((W * 4 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 1;   // (filter 1, "sub": smaller files)
    for (let x = 0; x < W * 4; x++) raw[y * (W * 4 + 1) + 1 + x] = (data[y * W * 4 + x] - (x >= 4 ? data[y * W * 4 + x - 4] : 0)) & 255; }
  const chunk = (kind, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(kind, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
export const blank = (W, H = W) => ({ width: W, height: H, data: new Uint8Array(W * H * 4) });
// Draw src scaled into dst's rectangle (dx, dy, dw, dh), area-averaged with premultiplied alpha (no dark fringes).
export function drawScaled(dst, src, dx, dy, dw, dh) {
  const sx = src.width / dw, sy = src.height / dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const X = Math.round(dx) + x, Y = Math.round(dy) + y; if (X < 0 || Y < 0 || X >= dst.width || Y >= dst.height) continue;
    const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy; let r = 0, g = 0, b = 0, a = 0, w = 0;
    for (let j = Math.floor(y0); j < Math.ceil(y1); j++) { const wy = Math.min(j + 1, y1) - Math.max(j, y0); if (wy <= 0 || j >= src.height) continue;
      for (let i = Math.floor(x0); i < Math.ceil(x1); i++) { const wx = Math.min(i + 1, x1) - Math.max(i, x0); if (wx <= 0 || i >= src.width) continue; const k = (j * src.width + i) * 4, al = src.data[k + 3] / 255, ww = wx * wy;
        r += src.data[k] * al * ww; g += src.data[k + 1] * al * ww; b += src.data[k + 2] * al * ww; a += al * ww; w += ww; } }
    if (!w) continue; const o = (Y * dst.width + X) * 4, A = a / w; if (A <= 0) continue;
    dst.data[o] = Math.round(r / a); dst.data[o + 1] = Math.round(g / a); dst.data[o + 2] = Math.round(b / a); dst.data[o + 3] = Math.round(A * 255); }
}
