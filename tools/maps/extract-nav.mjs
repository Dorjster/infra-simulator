// Extracts the walkable navigation areas of the classic Defuse maps from awpy's nav data (MIT, Peter Xenopoulos:
// github.com/pnxenopoulos/awpy, commit a5434abc06 — awpy/data/nav/nav_info.csv + de_<map>.txt + map/map_data.json,
// themselves read from the CS:GO navigation meshes) into dist/cs-maps/<id>-nav.js: every area as
// [x0, y0, x1, y1, zA, zB, axis, place] in Hammer units (x east, y north, z up). zA / zB are the heights at the
// low-x / low-y end and the high end of the area along its slope axis (0 = along x, 1 = along y, 2 = flat); the CSV
// only keeps two corners, so the axis comes from the neighbouring areas (which side climbs). Run:
// The radar overviews (boltobserv, GPL-3.0 — Ancient and Anubis carry their own MIT licence, Lexogrine: github.com/boltgolt/boltobserv src/maps/<map>/radar.png +
// meta.json5) give the crisp outline: each 16-unit column is classed from the overview pixels over it as outside (0),
// floor (1), cover (2), bomb site (3) or wall line (4), stored run-length encoded ("mask"; Nuke's lower level, drawn
// further down the overview, as "mask2"). The overview itself is never shipped.
//   node tools/maps/extract-nav.mjs <awpy data folder> <boltobserv maps folder (de_x/flat.png + meta.json5)>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import { readPNG } from './png.mjs'; import { CELL } from '../../dist/cs-columns.js'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const [dir, radarDir] = process.argv.slice(2), out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cs-maps'); mkdirSync(out, { recursive: true });
const MAPS = { dust2: 'de_dust2', mirage: 'de_mirage', inferno: 'de_inferno', nuke: 'de_nuke', cache: 'de_cache', anubis: 'de_anubis', ancient: 'de_ancient', train: 'de_train' };
const csv = readFileSync(path.join(dir, 'nav_info.csv'), 'utf8').trim().split('\n'), head = csv.shift().split(','), meta = JSON.parse(readFileSync(path.join(dir, 'map_data.json'), 'utf8'));
const col = Object.fromEntries(head.map((h, i) => [h, i]));
for (const [id, de] of Object.entries(MAPS)) {
  const lines = csv.map(l => l.split(",")).filter(r => r[col.mapName] === de), byId = new Map();
  for (const r of lines) { const a = { id: +r[col.areaId], place: r[col.areaName], x0: +r[col.northWestX], y0: +r[col.northWestY], z0: +r[col.northWestZ], x1: +r[col.southEastX], y1: +r[col.southEastY], z1: +r[col.southEastZ], nb: [] }; byId.set(a.id, a); }
  for (const l of readFileSync(path.join(dir, de + '.txt'), 'utf8').trim().split('\n')) { const [a, b] = l.split(',').map(Number); if (byId.has(a) && byId.has(b)) { byId.get(a).nb.push(byId.get(b)); byId.get(b).nb.push(byId.get(a)); } }
  // Slope axis: the side whose neighbours differ in height like the area's two corners do.
  const zAt = (n, a) => (n.z0 + n.z1) / 2;
  for (const a of byId.values()) { const dz = a.z1 - a.z0; a.axis = 2; if (Math.abs(dz) < 2) continue;
    const side = { w: [], e: [], s: [], n: [] }; for (const n of a.nb) { if (n.x1 <= a.x0 + 1) side.w.push(zAt(n)); else if (n.x0 >= a.x1 - 1) side.e.push(zAt(n)); else if (n.y1 <= a.y0 + 1) side.s.push(zAt(n)); else if (n.y0 >= a.y1 - 1) side.n.push(zAt(n)); }
    const avg = v => v.length ? v.reduce((p, q) => p + q, 0) / v.length : null, fit = (lo, hi) => lo === null || hi === null ? null : Math.abs((hi - lo) - dz);
    const fx = fit(avg(side.w), avg(side.e)), fy = fit(avg(side.s), avg(side.n));
    a.axis = fx !== null && (fy === null || fx <= fy) ? 0 : fy !== null ? 1 : (a.x1 - a.x0 >= a.y1 - a.y0 ? 0 : 1); }
  // The overview, sampled 4 × 4 per column of the same grid the game rasterises (cs-columns.js: x0 / y1 from the areas).
  const metaTxt = readFileSync(path.join(radarDir, de, 'meta.json5'), 'utf8'), num = re => +re.exec(metaTxt)[1]; let res = num(/"resolution":\s*([\d.]+)/), ox = num(/"offset":\s*\{[^}]*?"x":\s*(-?[\d.]+)/s), oy = num(/"offset":\s*\{[^}]*?"y":\s*(-?[\d.]+)/s);
  const sp = metaTxt.slice(metaTxt.indexOf('"splits"')), split = /"splits":\s*\[\s*\{/.test(metaTxt) ? { top: +/"top":\s*(-?[\d.]+)/.exec(sp)[1], bottom: +/"bottom":\s*(-?[\d.]+)/.exec(sp)[1], dy: +/"offset":\s*\{\s*"x":\s*-?[\d.]+,\s*"y":\s*(-?[\d.]+)/.exec(sp)[1] } : null;
  const img = readPNG(path.join(radarDir, de, 'flat.png')), k = img.width / 1024;
  // Fit the overview's scale and offset to the navigation areas (some overviews are a little off): maximise how many
  // area points land on overview floor and how much overview floor the areas cover.
  { const pts = []; for (const a of byId.values()) for (let x = a.x0 + 8; x < a.x1; x += 32) for (let y = a.y0 + 8; y < a.y1; y += 32) pts.push([x, y]);
    const floorPx = (x, y, s, ox2, oy2) => { const px = Math.floor(((x + ox2) / s) * k), py = Math.floor((1024 - (y + oy2) / s) * k); if (px < 0 || py < 0 || px >= img.width || py >= img.height) return false; const [r, g, b, al] = img.px(px, py); return al >= 128 && (r + g + b) / 3 < 200; };
    const fpx = []; for (let py = 0; py < img.height; py += 6) for (let px = 0; px < img.width; px += 6) { const [r, g, b, al] = img.px(px, py); if (al >= 128 && (r + g + b) / 3 < 110) fpx.push([px, py]); }
    const navAt = new Set(); for (const a of byId.values()) for (let x = Math.floor(a.x0 / 32); x <= Math.floor(a.x1 / 32); x++) for (let y = Math.floor(a.y0 / 32); y <= Math.floor(a.y1 / 32); y++) navAt.add(x + ',' + y);
    const score = (s, ox2, oy2) => { let h = 0; for (const [x, y] of pts) if (floorPx(x, y, s, ox2, oy2)) h++; let c = 0; for (const [px, py] of fpx) { const x = px / k * s - ox2, y = (1024 - py / k) * s - oy2; if (navAt.has(Math.floor(x / 32) + ',' + Math.floor(y / 32))) c++; } return h / pts.length + c / fpx.length; };
    let best = [res, ox, oy, score(res, ox, oy)]; const base = best[3];
    for (const [ds, dd] of [[.02, 48], [.006, 16], [.002, 6]]) { const [s0, x0b, y0b] = best; for (let s = s0 - ds * 4; s <= s0 + ds * 4 + 1e-9; s += ds) for (let dx = -dd * 4; dx <= dd * 4; dx += dd) for (let dy = -dd * 4; dy <= dd * 4; dy += dd) { const v = score(s, x0b + dx, y0b + dy); if (v > best[3]) best = [s, x0b + dx, y0b + dy, v]; } }
    console.log(de, 'overview fit', base.toFixed(3), '→', best[3].toFixed(3), 'scale', res, '→', best[0].toFixed(3), 'offset', ox, oy, '→', best[1], best[2]);
    if (best[3] > base + .01) { res = best[0]; ox = best[1]; oy = best[2]; } }
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity; for (const a of byId.values()) { xa = Math.min(xa, a.x0); xb = Math.max(xb, a.x1); ya = Math.min(ya, a.y0); yb = Math.max(yb, a.y1); }
  const PAD = 6, gx0 = Math.floor(xa / CELL) * CELL - PAD * CELL, gy1 = Math.ceil(yb / CELL) * CELL + PAD * CELL, cols = Math.ceil((xb - gx0) / CELL) + PAD, rows = Math.ceil((gy1 - ya) / CELL) + PAD;
  const classAt = (x, y, dyPct) => { const px = Math.floor(((x + ox) / res) * k), py = Math.floor((1024 - (y + oy) / res - dyPct / 100 * 1024) * k); if (px < 0 || py < 0 || px >= img.width || py >= img.height) return 0;
    const [r, g, b, al] = img.px(px, py); if (al < 128) return 0; if (r > g + 25 && r > b + 10) return 3; const L = (r + g + b) / 3; return L > 200 ? 4 : L > 110 ? 2 : 1; };
  const maskFor = dyPct => { const m = new Uint8Array(cols * rows); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const n = [0, 0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) n[classAt(gx0 + (c + (sx + .5) / 4) * CELL, gy1 - (r + (sy + .5) / 4) * CELL, dyPct)]++;
      m[r * cols + c] = n[3] >= 5 ? 3 : n[2] >= 8 ? 2 : n[4] >= 9 ? 4 : n[0] >= 9 ? 0 : n[1] + n[2] + n[3] + n[4] >= 8 ? 1 : 0; } return m; };
  const rle = m => { let s = '', v = m[0], run = 0; for (let i = 0; i <= m.length; i++) { if (i < m.length && m[i] === v && run < 35) { run++; continue; } s += v + run.toString(36); v = m[i]; run = 1; } return s; };
  const mask = rle(maskFor(0)), mask2 = split ? rle(maskFor(split.dy)) : null;
  const places = [...new Set([...byId.values()].map(a => a.place))].sort(), m = meta[de];
  const areas = [...byId.values()].map(a => [Math.round(a.x0), Math.round(a.y0), Math.round(a.x1), Math.round(a.y1), Math.round(a.z0), Math.round(a.z1), a.axis, places.indexOf(a.place)]);
  const src = `// Generated by tools/maps/extract-nav.mjs from awpy's ${de} navigation areas (MIT, Peter Xenopoulos). Hammer units.\n` +
    `export default ${JSON.stringify({ map: de, radar: { x: m.pos_x, y: m.pos_y, scale: m.scale, zCutoff: m.z_cutoff ?? null }, grid: { x0: gx0, y1: gy1, cols, rows }, split: split && { top: split.top, bottom: split.bottom }, places, mask, mask2 })
      .replace(/}$/, '')}, "areas": [${areas.map(a => '[' + a.join(',') + ']').join(',')}] };\n`;
  writeFileSync(path.join(out, id + '-nav.js'), src); console.log(id, areas.length, 'areas', places.length, 'places', (src.length / 1024).toFixed(0) + ' KB');
}
