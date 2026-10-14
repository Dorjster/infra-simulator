// Minimal PNG reader (8-bit RGB / RGBA / palette, non-interlaced) for the map tracing tools: { width, height, px(x, y) → [r, g, b, a] }.
import { readFileSync } from 'node:fs'; import { inflateSync } from 'node:zlib';
export function readPNG(file) {
  const b = readFileSync(file); let o = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0, pal = null, trns = null; const idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len); o += 12 + len;
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; } else if (t === 'PLTE') pal = d; else if (t === 'tRNS') trns = d; else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break; }
  if (depth !== 8 || inter) throw Error(file + ': only 8-bit non-interlaced PNGs');
  const ch = { 2: 3, 6: 4, 3: 1, 0: 1, 4: 2 }[type], stride = w * ch, raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) { const a = x >= ch ? out[dst + x - ch] : 0, up = y ? out[dst - stride + x] : 0, c = x >= ch && y ? out[dst - stride + x - ch] : 0, v = raw[src + x];
      out[dst + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + up : f === 3 ? v + ((a + up) >> 1) : (() => { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); return v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); })()) & 255; } }
  const px = (x, y) => { const i = y * stride + x * ch; if (type === 6) return [out[i], out[i + 1], out[i + 2], out[i + 3]]; if (type === 2) return [out[i], out[i + 1], out[i + 2], 255]; if (type === 3) { const k = out[i]; return [pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2], trns && k < trns.length ? trns[k] : 255]; } if (type === 4) return [out[i], out[i], out[i], out[i + 1]]; return [out[i], out[i], out[i], 255]; };
  return { width: w, height: h, px };
}
