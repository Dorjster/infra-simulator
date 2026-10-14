// Source engine textures (.vtf, versions 7.0–7.5) and their materials (.vmt): parseVtf gives the largest frame's mip
// chain (largest first) in its stored format — DXT1 / DXT3 / DXT5 go to the GPU as they are (compressed: little memory,
// no decoding); the uncompressed formats come back as RGBA. parseVmt reads a material's key values.
const FMT = { RGBA8888: 0, ABGR8888: 1, RGB888: 2, BGR888: 3, RGB565: 4, I8: 5, IA88: 6, A8: 8, ARGB8888: 11, BGRA8888: 12, DXT1: 13, DXT3: 14, DXT5: 15, BGRX8888: 16, DXT1A: 20, BGRA4444: 19, UV88: 22 };
const BPP = { 0: 4, 1: 4, 2: 3, 3: 3, 4: 2, 5: 1, 6: 2, 8: 1, 9: 3, 10: 3, 11: 4, 12: 4, 16: 4, 17: 2, 18: 2, 19: 2, 21: 2, 22: 2, 23: 4, 24: 8, 25: 8, 26: 4 };
const isDxt = f => f === 13 || f === 14 || f === 15 || f === 20;
const mipBytes = (f, w, h) => isDxt(f) ? Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * (f === 14 || f === 15 ? 16 : 8) : w * h * (BPP[f] || 4);

// { width, height, format: 'dxt1' | 'dxt3' | 'dxt5' | 'rgba', alpha, mips: [{ width, height, data }] } or null.
// skipAbove: leave out the top mips while the texture is wider than this (a 2048 picture used at 1024: a quarter of the memory).
export function parseVtf(u8, { skipAbove = 1024 } = {}) {
  if (!u8 || u8.length < 64 || u8[0] !== 0x56 || u8[1] !== 0x54 || u8[2] !== 0x46) return null;   // 'VTF'
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), minor = dv.getUint32(8, true), headerSize = dv.getUint32(12, true), W = dv.getUint16(16, true), H = dv.getUint16(18, true), flags = dv.getUint32(20, true);
  const frames = Math.max(1, dv.getUint16(24, true)), fmt = dv.getInt32(52, true), mipCount = u8[56], lowFmt = dv.getInt32(57, true), lowW = u8[61], lowH = u8[62], depth = minor >= 2 ? Math.max(1, dv.getUint16(63, true)) : 1;
  const faces = flags & 0x4000 ? (minor < 5 && dv.getUint16(26, true) === 0xffff ? 7 : 6) : 1;   // environment maps: cube faces (frame 0, face 0 used)
  if (!(BPP[fmt] || isDxt(fmt)) || !W || !H) return null;
  let at = headerSize + (lowFmt >= 0 ? mipBytes(lowFmt, lowW, lowH) : 0);
  if (minor >= 3) { const n = dv.getUint32(68, true); for (let i = 0; i < n; i++) { const o = 80 + i * 8; if (u8[o] === 0x30 && u8[o + 1] === 0 && u8[o + 2] === 0) at = dv.getUint32(o + 4, true); } }
  // The high-resolution chain is stored smallest first; each mip holds every frame, face and slice.
  const sizes = []; for (let m = 0; m < mipCount; m++) sizes.push([Math.max(1, W >> m), Math.max(1, H >> m)]);
  const offs = new Array(mipCount); for (let m = mipCount - 1; m >= 0; m--) { offs[m] = at; at += mipBytes(fmt, sizes[m][0], sizes[m][1]) * frames * faces * Math.max(1, depth >> m); }
  if (at > u8.length + 16) return null;
  let first = 0; while (first < mipCount - 1 && sizes[first][0] > skipAbove) first++;
  const mips = []; for (let m = first; m < mipCount; m++) { const [w, h] = sizes[m], n = mipBytes(fmt, w, h), d = u8.subarray(offs[m], offs[m] + n); if (d.length < n) break; mips.push({ width: w, height: h, data: isDxt(fmt) ? d : toRGBA(d, fmt, w * h) }); }
  if (!mips.length) return null;
  const alpha = fmt === 15 || fmt === 14 || fmt === 20 || fmt === 0 || fmt === 1 || fmt === 11 || fmt === 12 || fmt === 6 || fmt === 8 || fmt === 19;
  return { width: mips[0].width, height: mips[0].height, format: fmt === 13 ? 'dxt1' : fmt === 20 ? 'dxt1a' : fmt === 14 ? 'dxt3' : fmt === 15 ? 'dxt5' : 'rgba', alpha, mips };
}
function toRGBA(d, f, n) {
  const o = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { let r = 0, g = 0, b = 0, a = 255; const k = i * (BPP[f] || 4);
    switch (f) { case 0: r = d[k]; g = d[k + 1]; b = d[k + 2]; a = d[k + 3]; break; case 1: a = d[k]; b = d[k + 1]; g = d[k + 2]; r = d[k + 3]; break; case 2: r = d[k]; g = d[k + 1]; b = d[k + 2]; break; case 3: b = d[k]; g = d[k + 1]; r = d[k + 2]; break;
      case 11: a = d[k]; r = d[k + 1]; g = d[k + 2]; b = d[k + 3]; break; case 12: b = d[k]; g = d[k + 1]; r = d[k + 2]; a = d[k + 3]; break; case 16: b = d[k]; g = d[k + 1]; r = d[k + 2]; break;
      case 5: r = g = b = d[k]; break; case 6: r = g = b = d[k]; a = d[k + 1]; break; case 8: r = g = b = 255; a = d[k]; break;
      case 4: { const v = d[k] | d[k + 1] << 8; r = (v & 31) << 3; g = (v >> 5 & 63) << 2; b = (v >> 11) << 3; break; }
      case 19: { const v = d[k] | d[k + 1] << 8; b = (v & 15) * 17; g = (v >> 4 & 15) * 17; r = (v >> 8 & 15) * 17; a = (v >> 12) * 17; break; }
      case 22: r = d[k]; g = d[k + 1]; b = 255; break; default: r = d[k]; g = d[k + 1]; b = d[k + 2]; }
    o[i * 4] = r; o[i * 4 + 1] = g; o[i * 4 + 2] = b; o[i * 4 + 3] = a; }
  return o;
}
// DXT (S3TC) blocks → RGBA, for GPUs without compressed-texture support.
export function decodeDxt(data, w, h, kind) {
  const out = new Uint8Array(w * h * 4), bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), blk = kind === 'dxt1' || kind === 'dxt1a' ? 8 : 16, c = [[0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { const o = (by * bw + bx) * blk, co = blk === 16 ? o + 8 : o, c0 = data[co] | data[co + 1] << 8, c1 = data[co + 2] | data[co + 3] << 8;
    const rgb = v => [(v >> 11) * 255 / 31 | 0, (v >> 5 & 63) * 255 / 63 | 0, (v & 31) * 255 / 31 | 0], a0 = rgb(c0), a1 = rgb(c1); c[0] = [...a0, 255]; c[1] = [...a1, 255];
    if (c0 > c1 || blk === 16) { c[2] = [0, 1, 2].map(k => (2 * a0[k] + a1[k]) / 3 | 0).concat(255); c[3] = [0, 1, 2].map(k => (a0[k] + 2 * a1[k]) / 3 | 0).concat(255); }
    else { c[2] = [0, 1, 2].map(k => (a0[k] + a1[k]) / 2 | 0).concat(255); c[3] = [0, 0, 0, kind === 'dxt1a' ? 0 : 255]; }
    const bits = data[co + 4] | data[co + 5] << 8 | data[co + 6] << 16 | data[co + 7] << 24;
    // Alpha: DXT3 explicit 4-bit, DXT5 interpolated.
    let A = null; if (kind === 'dxt5') { const a0v = data[o], a1v = data[o + 1], t = [a0v, a1v]; if (a0v > a1v) for (let k = 1; k < 7; k++) t.push(((7 - k) * a0v + k * a1v) / 7 | 0); else { for (let k = 1; k < 5; k++) t.push(((5 - k) * a0v + k * a1v) / 5 | 0); t.push(0, 255); }
      let ab = 0n; for (let k = 0; k < 6; k++) ab |= BigInt(data[o + 2 + k]) << BigInt(8 * k); A = i => t[Number((ab >> BigInt(3 * i)) & 7n)]; }
    else if (kind === 'dxt3') A = i => ((data[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) { const x = bx * 4 + px, y = by * 4 + py; if (x >= w || y >= h) continue; const i = py * 4 + px, col = c[(bits >>> (2 * i)) & 3], q = (y * w + x) * 4;
      out[q] = col[0]; out[q + 1] = col[1]; out[q + 2] = col[2]; out[q + 3] = A ? A(i) : col[3]; } }
  return out;
}

// A material's key values (lower-cased keys, the shader as `shader`), patch materials merged over the one they include
// (read: the pack's reader, name → bytes).
export function parseVmt(text, read = null, depth = 0) {
  const toks = []; const re = /"([^"]*)"|(\{)|(\})|([^\s{}"]+)/g; let m; text = text.replace(/\/\/[^\n]*/g, '');
  while ((m = re.exec(text))) toks.push(m[2] ? '{' : m[3] ? '}' : m[1] ?? m[4]);
  let i = 0; const block = () => { const o = {}; while (i < toks.length && toks[i] !== '}') { const k = String(toks[i++]).toLowerCase(); if (toks[i] === '{') { i++; o[k] = block(); i++; } else o[k] = toks[i++]; } return o; };
  const shader = String(toks[0] || '').toLowerCase(); i = 1; if (toks[i] === '{') i++; const kv = block(); kv.shader = shader;
  if (shader === 'patch' && read && depth < 3) { const inc = String(kv.include || '').toLowerCase().replace(/\\/g, '/'), b = read(inc); if (b) { const base = parseVmt(new TextDecoder().decode(b), read, depth + 1); return { ...base, ...(kv.insert || {}), ...(kv.replace || {}) }; } }
  return kv;
}
