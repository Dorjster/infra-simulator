// Radar art for Global Defensive maps, in the style of a CS overview: a dark backdrop with a lettered / numbered grid,
// floors tinted by side (Terrorist half warm, Counter-Terrorist half teal, the contested middle in between), walls
// left dark, cover as lighter blocks, bomb sites as orange boxes with their letter, spawns outlined in green, and
// callout names on the floor. Drawn once per map. Grid maps (arena-gridmap.js) give their cells; other maps are
// rasterised from their boxes. locationOf() names the callout area a point is in (shown under the radar).
import { mapBoxes, walkable } from './arena-maps.js';

const cache = new Map();
// The floor as cells: { cols, rows, cell, cells (0 wall · 1 floor · 2 cover), ox, oz } in map coordinates.
function cellsOf(m, layer = null) {
  if (m.grid && layer === 'lower' && m.grid.lower) return { ...m.grid, cells: m.grid.lower, heights: null, ox: -m.size[0] / 2, oz: -m.size[1] / 2 };   // Nuke's lower level, on its own
  if (m.grid) return { ...m.grid, ox: -m.size[0] / 2, oz: -m.size[1] / 2 };
  const [w, d] = m.size, cell = 3, cols = Math.ceil(w / cell), rows = Math.ceil(d / cell), cells = new Uint8Array(cols * rows), boxes = mapBoxes(m, 0, 0), bd = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = -w / 2 + (c + .5) * cell, z = -d / 2 + (r + .5) * cell; if (walkable(boxes, bd, x, z, .4)) { cells[r * cols + c] = 1; continue; }
    const b = boxes.find(q => q.y0 < 10 && x >= q.minX && x <= q.maxX && z >= q.minZ && z <= q.maxZ); if (b && b.y1 - b.y0 < 10) cells[r * cols + c] = 2; }
  return { cols, rows, cell, cells, ox: -w / 2, oz: -d / 2 };
}
// Walking distance (cells) from a set of points to every floor cell.
function reach(G, pts) { const D = new Float32Array(G.cols * G.rows).fill(Infinity), q = [];
  for (const [x, z] of pts) { const c = Math.floor((x - G.ox) / G.cell), r = Math.floor((z - G.oz) / G.cell), i = r * G.cols + c; if (G.cells[i] && D[i] === Infinity) { D[i] = 0; q.push(i); } }
  for (let h = 0; h < q.length; h++) { const u = q[h], c = u % G.cols, r = (u / G.cols) | 0; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= G.cols || rr >= G.rows) continue; const v = rr * G.cols + cc; if (!G.cells[v] || D[v] !== Infinity) continue; D[v] = D[u] + 1; q.push(v); } }
  return D; }
// Callouts: the map's own, else its painted signs (A, B, MID, LONG…).
export const calloutsOf = m => m.callouts?.length ? m.callouts : (m.decor || []).filter(d => d.kind === 'sign' && d.text && d.text.length > 1 && !/[⟵⟶]/.test(d.text)).map(d => ({ name: d.text[0] + d.text.slice(1).toLowerCase(), x: d.x, z: d.z }));
// The callout area a point is in: the nearest callout within reach (70 units), else ''.
// With `feet` (game units) on a map whose callouts know their floor, a place on another floor counts as far away
// (on Nuke, standing at B under A says B Site).
export function locationOf(m, x, z, feet) { let best = '', bd = 70 * 70; for (const c of calloutsOf(m)) { const d = (c.x - x) ** 2 + (c.z - z) ** 2 + (feet !== undefined && c.y !== undefined ? (Math.max(0, Math.abs(c.y - feet) - 6) * 3) ** 2 : 0); if (d < bd) { bd = d; best = c.name; } } return best; }

// The radar picture: { canvas, scale (pixels per unit) }.
export function radarImage(m, id = m.name, px = 2, layer = null) {
  const k = id + ':' + px + ':' + (layer || ''); if (cache.has(k)) return cache.get(k);
  const [w, d] = m.size, cv = typeof OffscreenCanvas !== 'undefined' && !globalThis.document ? new OffscreenCanvas(1, 1) : document.createElement('canvas'); cv.width = Math.ceil(w * px); cv.height = Math.ceil(d * px);
  const g = cv.getContext('2d'), G = cellsOf(m, layer), X = v => (v + w / 2) * px, Z = v => (v + d / 2) * px, cs = G.cell * px;
  g.fillStyle = '#0b0f12'; g.fillRect(0, 0, cv.width, cv.height);
  // The coordinate grid (A… across, 1… down), faint, under everything.
  const n = 17, step = cv.width / n; g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; for (let i = 1; i < n; i++) { g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, cv.height); g.moveTo(0, i * cv.height / n); g.lineTo(cv.width, i * cv.height / n); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.22)'; g.font = `700 ${Math.round(step * .22)}px system-ui`; for (let i = 0; i < n; i++) { g.fillText('ABCDEFGHIJKLMNOPQ'[i], i * step + 4, step * .26); g.fillText(String(i + 1), 4, i * cv.height / n + step * .55); }
  // Floors tinted by side: how much closer to the T spawn than the CT spawn the cell is.
  const Dt = reach(G, m.t || []), Dc = reach(G, m.ct || []), warm = [138, 118, 74], cool = [46, 104, 116], midc = [86, 98, 96];
  for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) { const v = G.cells[r * G.cols + c]; if (!v) continue; const i = r * G.cols + c, a = Dt[i], b = Dc[i], t = isFinite(a) && isFinite(b) ? Math.max(-1, Math.min(1, (b - a) / Math.max(8, (a + b) * .25))) : 0;
    const mix = t > 0 ? warm.map((q, j) => midc[j] + (q - midc[j]) * t) : cool.map((q, j) => midc[j] + (q - midc[j]) * -t); g.fillStyle = v === 2 ? 'rgb(170,176,170)' : `rgb(${mix.map(Math.round).join(',')})`; g.fillRect(G.ox * 0 + c * cs, r * cs, Math.ceil(cs), Math.ceil(cs)); }
  // Heights (grid maps): higher floors lighter, roofed tunnels dark and hatched, stairs as rungs across the climb.
  if (G.heights) { for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) { const i = r * G.cols + c, h = G.heights[i]; if (G.cells[i] && h > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(.16, h * .028)})`; g.fillRect(c * cs, r * cs, Math.ceil(cs), Math.ceil(cs)); } }
    g.save(); for (const [c0, r0, c1, r1] of G.roofs || []) { g.beginPath(); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (G.cells[r * G.cols + c]) g.rect(c * cs, r * cs, Math.ceil(cs), Math.ceil(cs)); g.fillStyle = 'rgba(0,0,0,.38)'; g.fill(); g.save(); g.clip();
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = Math.max(1, px * .5); g.beginPath(); for (let k = -(r1 - r0 + 1) * cs; k < (c1 - c0 + 1) * cs; k += 5 * px) { g.moveTo(c0 * cs + k, r0 * cs); g.lineTo(c0 * cs + k + (r1 - r0 + 1) * cs, (r1 + 1) * cs); } g.stroke(); g.restore(); }
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = Math.max(1, px * .6); g.beginPath();
    for (const [c0, r0, c1, r1, dir, y0, y1] of G.ramps || []) { const n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 1.5)), ns = dir === 'n' || dir === 's'; for (let k = 1; k < n; k++) { const f = k / n; if (ns) { const y = (r0 + f * (r1 - r0 + 1)) * cs; g.moveTo(c0 * cs + 2, y); g.lineTo((c1 + 1) * cs - 2, y); } else { const x = (c0 + f * (c1 - c0 + 1)) * cs; g.moveTo(x, r0 * cs + 2); g.lineTo(x, (r1 + 1) * cs - 2); } } }
    g.stroke(); g.restore(); }
  // Floor edges: a light rim where floor meets wall (reads like the overview's outline).
  g.strokeStyle = 'rgba(230,240,235,.28)'; g.lineWidth = Math.max(1, px * .6); g.beginPath();
  for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) { if (!G.cells[r * G.cols + c]) continue; const x0 = c * cs, y0 = r * cs, wall = (cc, rr) => cc < 0 || rr < 0 || cc >= G.cols || rr >= G.rows || !G.cells[rr * G.cols + cc];
    if (wall(c, r - 1)) { g.moveTo(x0, y0); g.lineTo(x0 + cs, y0); } if (wall(c, r + 1)) { g.moveTo(x0, y0 + cs); g.lineTo(x0 + cs, y0 + cs); } if (wall(c - 1, r)) { g.moveTo(x0, y0); g.lineTo(x0, y0 + cs); } if (wall(c + 1, r)) { g.moveTo(x0 + cs, y0); g.lineTo(x0 + cs, y0 + cs); } }
  g.stroke();
  // Spawns (green outline) and bomb sites (orange box, yellow letter).
  const boxOf = pts => { let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity; for (const [x, z] of pts) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); e = Math.max(e, z); } return [a - 12, b - 12, c + 12, e + 12]; };
  const label = (text, x, y, size, color = '#fff') => { g.font = `900 ${size}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = Math.max(2, size * .22); g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y); };
  // Two layers (Nuke): each shows its own sites and names; spawns are upstairs.
  const lowY = m.grid?.lowerY, onLayer = y => lowY === undefined || y === undefined || (layer === 'lower') === (y < lowY), siteY = L => calloutsOf(m).find(c => c.place === 'Bombsite' + L)?.y;
  for (const [side, pts, name] of [['t', m.t, 'T SPAWN'], ['ct', m.ct, 'CT SPAWN']]) { if (!pts?.length || layer === 'lower') continue; const [a, b, c, e] = boxOf(pts); g.strokeStyle = '#3ddc6a'; g.lineWidth = Math.max(2, px * 1.2); g.strokeRect(X(a), Z(b), (c - a) * px, (e - b) * px); g.fillStyle = 'rgba(61,220,106,.10)'; g.fillRect(X(a), Z(b), (c - a) * px, (e - b) * px); label(name, X((a + c) / 2), Z((b + e) / 2), Math.round(13 * px * .9)); }
  for (const [L, [sx, sz, r]] of Object.entries(m.sites || {})) { if (layer === 'lower' && !onLayer(siteY(L))) continue; const h = r * .7; g.strokeStyle = '#ff8a1e'; g.lineWidth = Math.max(2, px * 1.3); g.fillStyle = 'rgba(255,138,30,.12)'; g.fillRect(X(sx - h), Z(sz - h), 2 * h * px, 2 * h * px); g.strokeRect(X(sx - h), Z(sz - h), 2 * h * px, 2 * h * px); label(L, X(sx), Z(sz), Math.round(22 * px * .9), '#ffd33a'); }
  // Callout names.
  for (const c of calloutsOf(m)) { if (/^(A|B) Site$|^T Spawn$|^CT Spawn$/i.test(c.name) || !onLayer(c.y)) continue; label(c.name.toUpperCase(), X(c.x), Z(c.z), Math.round(7.5 * px)); }
  const out = { canvas: cv, scale: px }; cache.set(k, out); return out;
}
