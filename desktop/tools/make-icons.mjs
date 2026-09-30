// Draws the app icon (a rack with status LEDs on a navy tile) at every size, without dependencies:
// PNGs for Linux/window icons, icon.ico (PNG-in-ICO) for Windows and icon.icns via macOS iconutil.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function png(n) {
  const px = Buffer.alloc(n * n * 4), s = n / 1024;
  const inRound = (x, y, x0, y0, x1, y1, r) => { if (x < x0 || x > x1 || y < y0 || y > y1) return false; const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + .5) / s, y = (j + .5) / s, o = (j * n + i) * 4; let c = null;
    if (inRound(x, y, 64, 64, 960, 960, 190)) { const t = y / 1024; c = [15 - 8 * t, 42 - 24 * t, 58 - 31 * t, 255]; }
    if (c && inRound(x, y, 330, 190, 694, 850, 26)) c = [18, 30, 40, 255];                       // rack cabinet
    if (c && inRound(x, y, 330, 190, 694, 850, 26) && !inRound(x, y, 352, 212, 672, 828, 14)) c = [126, 240, 196, 255]; // teal frame
    for (let k = 0; k < 5; k++) { const y0 = 250 + k * 112; if (c && inRound(x, y, 384, y0, 640, y0 + 74, 10)) c = k === 2 ? [51, 201, 196, 255] : [95, 112, 126, 255]; if (c && (x - 604) ** 2 + (y - y0 - 37) ** 2 < 13 ** 2) c = k === 3 ? [255, 190, 107, 255] : [92, 255, 156, 255]; }
    if (c) { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3]; }
  }
  const raw = Buffer.alloc(n * (n * 4 + 1)); for (let j = 0; j < n; j++) { raw[j * (n * 4 + 1)] = 0; px.copy(raw, j * (n * 4 + 1) + 1, j * n * 4, (j + 1) * n * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'icon.png'), png(1024));
// ICO with embedded PNGs (Windows Vista+).
const sizes = [16, 32, 48, 64, 128, 256], imgs = sizes.map(png), head = Buffer.alloc(6 + 16 * sizes.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length; sizes.forEach((sz, k) => { const e = 6 + 16 * k; head[e] = sz === 256 ? 0 : sz; head[e + 1] = sz === 256 ? 0 : sz; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(imgs[k].length, e + 8); head.writeUInt32LE(offset, e + 12); offset += imgs[k].length; });
writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([head, ...imgs]));
if (process.platform === 'darwin') {
  const set = path.join(out, 'icon.iconset'); rmSync(set, { recursive: true, force: true }); mkdirSync(set);
  for (const sz of [16, 32, 128, 256, 512]) { writeFileSync(path.join(set, `icon_${sz}x${sz}.png`), png(sz)); writeFileSync(path.join(set, `icon_${sz}x${sz}@2x.png`), png(sz * 2)); }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(out, 'icon.icns')]); rmSync(set, { recursive: true, force: true });
}
console.log('Icons written to', out);
