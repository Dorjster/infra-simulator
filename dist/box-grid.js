// A uniform grid (x / z) over the arena's collision boxes, so movement, shots, grenades and sound look at the boxes
// near them instead of every box (a Source map has ~85 000: a plain scan per movement step cost ~0.6 ms). Maps with
// few boxes keep the plain list. Queries fill the caller's own array (no garbage per call; each call site keeps its
// own, so a query inside another's loop never disturbs it) and return it; without a grid they return the list itself.
const MIN_BOXES = 1500;
export function indexBoxes(boxes, cell = 8) {
  if (!boxes || boxes.length < MIN_BOXES) return boxes;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const b of boxes) { if (b.minX < x0) x0 = b.minX; if (b.minZ < z0) z0 = b.minZ; if (b.maxX > x1) x1 = b.maxX; if (b.maxZ > z1) z1 = b.maxZ; }
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell)), rows = Math.max(1, Math.ceil((z1 - z0) / cell)), count = new Uint32Array(cols * rows + 1);
  const span = b => [Math.max(0, Math.floor((b.minX - x0) / cell)), Math.min(cols - 1, Math.floor((b.maxX - x0) / cell)), Math.max(0, Math.floor((b.minZ - z0) / cell)), Math.min(rows - 1, Math.floor((b.maxZ - z0) / cell))];
  for (const b of boxes) { const [c0, c1, r0, r1] = span(b); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) count[r * cols + c + 1]++; }
  for (let i = 1; i < count.length; i++) count[i] += count[i - 1];   // start of each cell's list
  const items = new Uint32Array(count[count.length - 1]), fill = count.slice(0, -1);
  boxes.forEach((b, k) => { const [c0, c1, r0, r1] = span(b); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) items[fill[r * cols + c]++] = k; });
  boxes.grid = { x0, z0, cell, cols, rows, start: count, items, stamp: new Uint32Array(boxes.length), mark: 0 };
  return boxes;
}
const nextMark = G => { if (++G.mark > 4e9) { G.stamp.fill(0); G.mark = 1; } return G.mark; };
const addCell = (boxes, G, i, m, out) => { for (let k = G.start[i]; k < G.start[i + 1]; k++) { const j = G.items[k]; if (G.stamp[j] !== m) { G.stamp[j] = m; out.push(boxes[j]); } } };
// Boxes whose footprint may overlap the rectangle [x0, x1] × [z0, z1].
export function boxesNear(boxes, x0, z0, x1, z1, out) {
  const G = boxes?.grid; if (!G) return boxes; out.length = 0; const m = nextMark(G);
  const c0 = Math.max(0, Math.floor((x0 - G.x0) / G.cell)), c1 = Math.min(G.cols - 1, Math.floor((x1 - G.x0) / G.cell)), r0 = Math.max(0, Math.floor((z0 - G.z0) / G.cell)), r1 = Math.min(G.rows - 1, Math.floor((z1 - G.z0) / G.cell));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) addCell(boxes, G, r * G.cols + c, m, out);
  return out;
}
// Boxes whose footprint may touch the segment (ax, az) → (bx, bz), widened by `pad`: the grid cells the segment
// crosses (a walk along it) and their neighbours within the pad.
export function boxesAlong(boxes, ax, az, bx, bz, pad, out) {
  const G = boxes?.grid; if (!G) return boxes; out.length = 0; const m = nextMark(G), w = Math.max(1, Math.ceil(pad / G.cell));   /* at least the neighbours: a diagonal never slips past a corner cell */
  const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / (G.cell * .5)));
  let lc = -1, lr = -1;
  for (let s = 0; s <= steps; s++) { const t = s / steps, c = Math.floor((ax + (bx - ax) * t - G.x0) / G.cell), r = Math.floor((az + (bz - az) * t - G.z0) / G.cell); if (c === lc && r === lr) continue; lc = c; lr = r;
    for (let rr = r - w; rr <= r + w; rr++) { if (rr < 0 || rr >= G.rows) continue; for (let cc = c - w; cc <= c + w; cc++) if (cc >= 0 && cc < G.cols) addCell(boxes, G, rr * G.cols + cc, m, out); } }
  return out;
}
