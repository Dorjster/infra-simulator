// Extracts the walkable navigation areas of the classic Defuse maps from awpy's nav data (MIT, Peter Xenopoulos:
// github.com/pnxenopoulos/awpy, commit a5434abc06 — awpy/data/nav/nav_info.csv + de_<map>.txt + map/map_data.json,
// themselves read from the CS:GO navigation meshes) into dist/cs-maps/<id>-nav.js: every area as
// [x0, y0, x1, y1, zA, zB, axis, place] in Hammer units (x east, y north, z up). zA / zB are the heights at the
// low-x / low-y end and the high end of the area along its slope axis (0 = along x, 1 = along y, 2 = flat); the CSV
// only keeps two corners, so the axis comes from the neighbouring areas (which side climbs). Run:
// The radar overviews (MIT, Lexogrine: github.com/lexogrine/csgo-react-hud src/HUD/Radar/LexoRadar/maps/<map>/radar.png +
// index.ts) give the crisp outline: each 16-unit column is classed from the overview pixels over it as outside (0),
// floor (1), cover (2), bomb site (3) or wall line (4), stored run-length encoded ("mask"; Nuke's lower level, drawn
// in the lower half of the image with its own transform, as "mask2"). The overview itself is never shipped.
// (A boltobserv-style folder — flat.png + meta.json5 — still works.)
//   node tools/maps/extract-nav.mjs <awpy data folder> <overviews folder: de_x/flat.png (non-interlaced copy of radar.png) + index.ts>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'; import { readPNG } from './png.mjs'; import { CELL } from '../../dist/cs-columns.js'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
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
  // Its transform per level, in pixels of a 1024-wide image: px = ox + x · sx, py = oy + y · sy (sy < 0). Two layouts:
  // Lexogrine's (index.ts: origin + pxPerUX / pxPerUY, a "high" and a "low" level on Nuke split at a height) and
  // boltobserv's (meta.json5: resolution, offset, splits).
  let lv, split = null; const lexoTs = path.join(radarDir, de, 'index.ts');
  if (existsSync(lexoTs)) { const ts = readFileSync(lexoTs, 'utf8'), cfg = block => ({ ox: +/"x":\s*(-?[\d.]+)/.exec(block)[1], oy: +/"y":\s*(-?[\d.]+)/.exec(block)[1], sx: +/"pxPerUX":\s*(-?[\d.]+)/.exec(block)[1], sy: +/"pxPerUY":\s*(-?[\d.]+)/.exec(block)[1] }), part = n => new RegExp('const ' + n + ' = \\{([\\s\\S]*?)\\n\\};').exec(ts)?.[1];
    if (part('high') && part('low')) { lv = [cfg(part('high')), cfg(part('low'))]; split = { top: +/height < (-?[\d.]+)/.exec(ts)[1], bottom: -2500 }; } else lv = [cfg(ts)]; }
  else { const metaTxt = readFileSync(path.join(radarDir, de, 'meta.json5'), 'utf8'), num = re => +re.exec(metaTxt)[1], res = num(/"resolution":\s*([\d.]+)/), ox = num(/"offset":\s*\{[^}]*?"x":\s*(-?[\d.]+)/s), oy = num(/"offset":\s*\{[^}]*?"y":\s*(-?[\d.]+)/s);
    lv = [{ ox: ox / res, oy: 1024 - oy / res, sx: 1 / res, sy: -1 / res }]; const sp = metaTxt.slice(metaTxt.indexOf('"splits"'));
    if (/"splits":\s*\[\s*\{/.test(metaTxt)) { const dy = +/"offset":\s*\{\s*"x":\s*-?[\d.]+,\s*"y":\s*(-?[\d.]+)/.exec(sp)[1]; split = { top: +/"top":\s*(-?[\d.]+)/.exec(sp)[1], bottom: +/"bottom":\s*(-?[\d.]+)/.exec(sp)[1] }; lv.push({ ...lv[0], oy: lv[0].oy - dy / 100 * 1024 }); } }
  const img = readPNG(path.join(radarDir, de, 'flat.png')), k = img.width / 1024, at = (T, x, y) => [Math.floor((T.ox + x * T.sx) * k), Math.floor((T.oy + y * T.sy) * k)];
  // Fit the overview's scale and offset to the navigation areas (some overviews are a little off): maximise how many
  // area points land on overview floor and how much overview floor the areas cover. The same correction applies to
  // every level of the image.
  { const pts = []; for (const a of byId.values()) for (let x = a.x0 + 8; x < a.x1; x += 32) for (let y = a.y0 + 8; y < a.y1; y += 32) pts.push([x, y]);
    const fpx = []; for (let py = 0; py < img.height; py += 6) for (let px = 0; px < img.width; px += 6) { const [r, g, b, al] = img.px(px, py); if (al >= 128 && (r + g + b) / 3 < 110) fpx.push([px, py]); }
    const navAt = new Set(); for (const a of byId.values()) for (let x = Math.floor(a.x0 / 32); x <= Math.floor(a.x1 / 32); x++) for (let y = Math.floor(a.y0 / 32); y <= Math.floor(a.y1 / 32); y++) navAt.add(x + ',' + y);
    const T0 = lv[0], adj = ([m, dx, dy]) => ({ ox: T0.ox + dx, oy: T0.oy + dy, sx: T0.sx * m, sy: T0.sy * m });
    const score = q => { const T = adj(q); let h = 0; for (const [x, y] of pts) { const [px, py] = at(T, x, y); if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue; const [r, g, b, al] = img.px(px, py); if (al >= 128 && (r + g + b) / 3 < 200) h++; }
      let c = 0; for (const [px, py] of fpx) { const x = (px / k - T.ox) / T.sx, y = (py / k - T.oy) / T.sy; if (navAt.has(Math.floor(x / 32) + ',' + Math.floor(y / 32))) c++; } return h / pts.length + c / fpx.length; };
    let best = [1, 0, 0], bs = score(best); const base = bs, u = Math.abs(T0.sx);
    for (const [dm, dd] of [[.0045, 48], [.0014, 16], [.00045, 6]]) { const [m0, x0b, y0b] = best; for (let m = m0 - dm * 4; m <= m0 + dm * 4 + 1e-9; m += dm) for (let dx = -dd * 4; dx <= dd * 4; dx += dd) for (let dy = -dd * 4; dy <= dd * 4; dy += dd) { const q = [m, x0b + dx * u, y0b + dy * u], v = score(q); if (v > bs) { best = q; bs = v; } } }
    console.log(de, 'overview fit', base.toFixed(3), '→', bs.toFixed(3), 'scale ×' + best[0].toFixed(4), 'offset px', best[1].toFixed(1), best[2].toFixed(1));
    if (bs > base + .01) lv = lv.map(T => ({ ox: T.ox + best[1], oy: T.oy + best[2], sx: T.sx * best[0], sy: T.sy * best[0] })); }
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity; for (const a of byId.values()) { xa = Math.min(xa, a.x0); xb = Math.max(xb, a.x1); ya = Math.min(ya, a.y0); yb = Math.max(yb, a.y1); }
  const PAD = 6, gx0 = Math.floor(xa / CELL) * CELL - PAD * CELL, gy1 = Math.ceil(yb / CELL) * CELL + PAD * CELL, cols = Math.ceil((xb - gx0) / CELL) + PAD, rows = Math.ceil((gy1 - ya) / CELL) + PAD;
  const classAt = (x, y, T) => { const [px, py] = at(T, x, y); if (px < 0 || py < 0 || px >= img.width || py >= img.height) return 0;
    const [r, g, b, al] = img.px(px, py); if (al < 128) return 0; if (r > g + 25 && r > b + 10) return 3; const L = (r + g + b) / 3; return L > 200 ? 4 : L > 110 ? 2 : 1; };
  const maskFor = T => { const m = new Uint8Array(cols * rows); for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const n = [0, 0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) n[classAt(gx0 + (c + (sx + .5) / 4) * CELL, gy1 - (r + (sy + .5) / 4) * CELL, T)]++;
      m[r * cols + c] = n[3] >= 5 ? 3 : n[2] >= 8 ? 2 : n[4] >= 9 ? 4 : n[0] >= 9 ? 0 : n[1] + n[2] + n[3] + n[4] >= 8 ? 1 : 0; } return m; };
  const rle = m => { let s = '', v = m[0], run = 0; for (let i = 0; i <= m.length; i++) { if (i < m.length && m[i] === v && run < 35) { run++; continue; } s += v + run.toString(36); v = m[i]; run = 1; } return s; };
  const mask = rle(maskFor(lv[0])), mask2 = split ? rle(maskFor(lv[1])) : null;
  const places = [...new Set([...byId.values()].map(a => a.place))].sort(), m = meta[de];
  const areas = [...byId.values()].map(a => [Math.round(a.x0), Math.round(a.y0), Math.round(a.x1), Math.round(a.y1), Math.round(a.z0), Math.round(a.z1), a.axis, places.indexOf(a.place)]);
  // Which areas join (the navigation mesh's connections, as index pairs): a wall line between two areas that don't is a
  // real wall, however thin (cs-columns.js keeps it standing).
  const index = new Map([...byId.values()].map((a, i) => [a, i])), links = []; for (const [i, a] of [...byId.values()].entries()) for (const b of a.nb) { const j = index.get(b); if (j > i) links.push(i, j); }
  const src = `// Generated by tools/maps/extract-nav.mjs from awpy's ${de} navigation areas (MIT, Peter Xenopoulos). Hammer units.\n` +
    `export default ${JSON.stringify({ map: de, radar: { x: m.pos_x, y: m.pos_y, scale: m.scale, zCutoff: m.z_cutoff ?? null }, grid: { x0: gx0, y1: gy1, cols, rows }, split: split && { top: split.top, bottom: split.bottom }, places, mask, mask2 })
      .replace(/}$/, '')}, "areas": [${areas.map(a => '[' + a.join(',') + ']').join(',')}], "links": [${[...new Set(links.reduce((o, v, i) => (i % 2 ? o[o.length - 1].push(v) : o.push([v]), o), []).map(p => p.join(',')))].join(',')}] };\n`;
  writeFileSync(path.join(out, id + '-nav.js'), src); console.log(id, areas.length, 'areas', places.length, 'places', (src.length / 1024).toFixed(0) + ' KB');
}
