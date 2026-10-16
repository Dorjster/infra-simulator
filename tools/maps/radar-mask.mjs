// CS2's radar as the play space: its overview pictures (panorama/images/overheadmaps/de_<id>_radar_psd and, Nuke, the
// lower level's) are see-through outside the map, placed by resource/overviews/de_<id>.txt (pos_x, pos_y: the
// picture's top-left corner in Hammer units; scale: units a pixel). inPlay(x, y): a drawn pixel within `margin` units —
// every place a player can be is on its map's radar (a boost spot, a ledge, are a little outside its drawn floor).
// Extracted from the game (Source 2 Viewer) to ~/CS2-extract/export/radar/; null when the map has none.
import { existsSync, readFileSync } from 'node:fs'; import { execFileSync } from 'node:child_process'; import path from 'node:path';
export function radarMask(radarDir, id, margin = 128) {
  const ov = path.join(radarDir, 'resource', 'overviews', `de_${id}.txt`); if (!existsSync(ov)) return null;
  const txt = readFileSync(ov, 'utf8'), num = k => { const m = new RegExp(`"${k}"\\s+"(-?[\\d.]+)"`).exec(txt); return m ? +m[1] : NaN; }, X0 = num('pos_x'), Y0 = num('pos_y'), S = num('scale');
  if (![X0, Y0, S].every(Number.isFinite)) return null;
  const pics = ['', '_lower'].map(s => path.join(radarDir, 'panorama', 'images', 'overheadmaps', `de_${id}${s}_radar_psd.png`)).filter(existsSync); if (!pics.length) return null;
  let W = 0, H = 0, on = null;
  for (const f of pics) { const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number);
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 }); if (!on) { W = w; H = h; on = new Uint8Array(W * H); } if (w !== W || h !== H) continue;
    for (let i = 0; i < W * H; i++) if (raw[i * 4 + 3] > 16) on[i] = 1; }
  // (a summed-area table: any drawn pixel in a square round a point, at once)
  const sat = new Uint32Array((W + 1) * (H + 1)); for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += on[y * W + x]; sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + row; } }
  const r = Math.max(1, Math.round(margin / S)), cl = (v, n) => Math.max(0, Math.min(n, v));
  const inPlay = (x, y) => { const px = Math.floor((x - X0) / S), py = Math.floor((Y0 - y) / S), a = cl(px - r, W), b = cl(px + r + 1, W), c = cl(py - r, H), d = cl(py + r + 1, H); if (a >= b || c >= d) return false;
    return sat[d * (W + 1) + b] - sat[c * (W + 1) + b] - sat[d * (W + 1) + a] + sat[c * (W + 1) + a] > 0; };
  return { inPlay, pos: [X0, Y0], scale: S, size: [W, H], pictures: pics.length };
}
