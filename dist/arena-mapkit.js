// Map kit for Global Defensive: builds believable places out of the boxes the game collides, shoots and walks on.
// Everything solid is a box (what you see is exactly what blocks you, stops bullets and shows on the radar); the
// rest is decoration that never blocks: window frames, signs, awnings, lamps, palm fronds, roof tiles… flush on
// walls or out of reach. Props (barrels, cars, stalls…) are drawn by arena-scene.js and collide as the boxes listed
// here, so a prop's collision always matches its shape.
// Units: 1 ≈ 16.5 cm. Player: 11 tall (eye 9.7), radius 1.3, steps up 2.77. Doors 14 high, 8–14 wide; stairs 1.4 rise.
export const B = (x, z, w, d, h, m, y0 = 0) => [x, z, w, d, h, m, y0];
export const DOOR_H = 14, STEP = 1.4, RUN = 2;

// A wall from (x1, z1) to (x2, z2) (axis-aligned), `t` thick, `h` high, with openings [{ at, w, y0 = 0, h = DOOR_H }]
// (at = centre, measured along the wall from its start). Openings get a lintel above and, for windows, a sill.
export function wall(x1, z1, x2, z2, t, h, m, openings = [], base = 0) {
  const out = [], horiz = z1 === z2, len = Math.abs(horiz ? x2 - x1 : z2 - z1), s = Math.sign(horiz ? x2 - x1 : z2 - z1) || 1;
  const seg = (a, b, y0, y1) => { if (b - a < .05 || y1 - y0 < .05) return; const mid = (a + b) / 2, L = b - a; out.push(horiz ? B(x1 + s * mid, z1, L, t, y1 - y0, m, base + y0) : B(x1, z1 + s * mid, t, L, y1 - y0, m, base + y0)); };
  const ops = [...openings].sort((a, b) => a.at - b.at); let pos = 0;
  for (const o of ops) { const a = o.at - o.w / 2, b = o.at + o.w / 2, y0 = o.y0 || 0, y1 = y0 + (o.h || DOOR_H); seg(pos, a, 0, h); seg(a, b, y1, h); if (y0 > 0) seg(a, b, 0, y0); pos = b; }
  seg(pos, len, 0, h); return out;
}
// Decoration around openings (frames, shutters) — visual only.
function frames(x1, z1, x2, z2, t, openings, base, look) {
  const out = [], horiz = z1 === z2, s = Math.sign(horiz ? x2 - x1 : z2 - z1) || 1;
  for (const o of openings) { const y0 = base + (o.y0 || 0), y1 = y0 + (o.h || DOOR_H), c = o.at; const at = d => horiz ? [x1 + s * d, z1] : [x1, z1 + s * d];
    for (const d of [c - o.w / 2, c + o.w / 2]) { const [x, z] = at(d); out.push({ kind: 'frame', x, z, y0, y1, horiz, t: t + .5, look }); }
    const [x, z] = at(c); out.push({ kind: 'lintel', x, z, y: y1, w: o.w + 1, horiz, t: t + .5, look });
    if (o.y0) out.push({ kind: 'sill', x, z, y: y0, w: o.w + .8, horiz, t: t + .9, look });
    if (o.shutters) for (const sgn of [-1, 1]) { const [sx, sz] = at(c + sgn * (o.w / 2 + o.w * .27)); out.push({ kind: 'shutter', x: sx, z: sz, y0, y1, w: o.w * .5, horiz, t: t + .3, color: o.shutters }); } }
  return out;
}
// A house: four walls with doors / windows per side, an optional flat roof (collides) and an upper floor.
// sides: { n | s | e | w: [opening…] } (opening.at measured from the west / north end of that side).
// roof: material or null · floor2: { y, hole: [x, z, w, d] } (an upper floor with a stairwell hole) · trim: frame colour.
export function house({ x, z, w, d, h, m, t = 1.5, sides = {}, roof = 'roof', floor2 = null, trim = 0x6b4a2a, parapet = 0, look = null }) {
  const solids = [], decor = [], x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const add = (xa, za, xb, zb, ops) => { solids.push(...wall(xa, za, xb, zb, t, h, m, ops || [])); decor.push(...frames(xa, za, xb, zb, t, ops || [], 0, trim)); };
  add(x0, z0, x1, z0, sides.n); add(x0, z1, x1, z1, sides.s); add(x0, z0 + t / 2, x0, z1 - t / 2, sides.w); add(x1, z0 + t / 2, x1, z1 - t / 2, sides.e);
  if (roof) { solids.push(B(x, z, w + 1.6, d + 1.6, 1.4, roof, h)); if (parapet) for (const [px, pz, pw, pd] of [[x, z0 - .5, w + 1.6, .8], [x, z1 + .5, w + 1.6, .8], [x0 - .5, z, .8, d + 1.6], [x1 + .5, z, .8, d + 1.6]]) solids.push(B(px, pz, pw, pd, parapet, m, h + 1.4)); }
  if (floor2) { const { y, hole } = floor2, [hx, hz, hw, hd] = hole || [x, z, 0, 0], th = 1;
    // The floor as up to four boxes around the stairwell hole.
    const parts = hw ? [[x0, z0, x1, hz - hd / 2], [x0, hz + hd / 2, x1, z1], [x0, hz - hd / 2, hx - hw / 2, hz + hd / 2], [hx + hw / 2, hz - hd / 2, x1, hz + hd / 2]] : [[x0, z0, x1, z1]];
    for (const [a, b, c, e] of parts) if (c - a > .2 && e - b > .2) solids.push(B((a + c) / 2, (b + e) / 2, c - a, e - b, th, 'wood', y - th)); }
  if (look) decor.push({ kind: 'roofTiles', x, z, w: w + 2, d: d + 2, y: h + 1.4, look });
  return { solids, decor };
}
// Straight stairs: `steps` boxes rising `rise` each over `run` each, going towards dir ('n' = −z, 's' = +z, 'e' = +x, 'w' = −x),
// starting at (x, z) (the foot of the first step), `w` wide. Each box reaches the floor (no gaps to fall into).
export function stairs({ x, z, dir = 'n', w = 8, steps = 6, rise = STEP, run = RUN, m = 'stone', y0 = 0 }) {
  const out = [], [dx, dz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir];
  for (let i = 0; i < steps; i++) { const cx = x + dx * (i + .5) * run, cz = z + dz * (i + .5) * run; out.push(B(cx, cz, dx ? run : w, dx ? w : run, y0 + rise * (i + 1), m)); }
  return out;
}
// A raised platform (walkable top) with stairs up one side.
export function platform({ x, z, w, d, h, m = 'stone', stairsSide = 's', stairsW = 10, trimStairs = true }) {
  const out = [B(x, z, w, d, h, m)], steps = Math.ceil(h / STEP), rise = h / steps;
  const at = { n: [x, z - d / 2, 'n'], s: [x, z + d / 2, 's'], e: [x + w / 2, z, 'e'], w: [x - w / 2, z, 'w'] }[stairsSide];
  // Stairs climb towards the platform: start `steps` runs out and rise inward.
  const [sx, sz, side] = at, [dx, dz] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[side], inward = { n: 's', s: 'n', e: 'w', w: 'e' }[side];
  out.push(...stairs({ x: sx + dx * steps * RUN, z: sz + dz * steps * RUN, dir: inward, w: stairsW, steps: steps - 1, rise, m }));
  return out;
}
// ── Props: [type, x, z, rot (0 | 1 = turned 90°), extra] → collision boxes + a visual (arena-scene draws it). ──
// The boxes are the prop's real footprint and height, so you can stand on a crate, hide behind a car, shoot over
// sandbags, and the radar shows them.
const PROP = {
  barrel: { size: [2.6, 2.6, 4.4], mat: 'metal-blue' }, barrels: { size: [5.4, 2.8, 4.4], mat: 'metal-blue' },
  crate: { size: [6, 6, 6], mat: 'crate' }, crate2: { size: [6, 6, 12], mat: 'crate' }, pallet: { size: [7, 5, 3], mat: 'wood' },
  sandbags: { size: [12, 3, 4.8], mat: 'sand' }, car: { size: [10.5, 24, 8.5], mat: 'metal-red', solidMat: 'metal' }, truck: { size: [13, 34, 16], mat: 'metal-blue', solidMat: 'metal' },
  stall: { size: [12, 7, 5], mat: 'wood' }, cart: { size: [6, 10, 5], mat: 'wood' }, hay: { size: [6, 4, 4], mat: 'wood' }, dumpster: { size: [10, 5.5, 7], mat: 'metal-green' },
  fountain: { size: [16, 16, 3.2], mat: 'stone' }, well: { size: [6, 6, 4], mat: 'stone' }, bench: { size: [8, 2.5, 2.6], mat: 'wood' }, planter: { size: [5, 5, 3.4], mat: 'stone' },
  lamp: { size: [1, 1, 18], mat: 'metal' }, palm: { size: [1.6, 1.6, 26], mat: 'wood' }, tree: { size: [2, 2, 22], mat: 'wood' }, pillar: { size: [3.4, 3.4, 30], mat: 'stone' },
  bollard: { size: [1.2, 1.2, 3.4], mat: 'metal' }, forklift: { size: [6, 11, 9], mat: 'metal-red', solidMat: 'metal' }, container: { size: [15, 40, 15], mat: 'metal-red' },
};
export const PROP_TYPES = Object.keys(PROP);
// Props with their own shape (the rest — crates, pallets, dumpsters, containers, pillars — are textured boxes).
export const DRAWN = new Set(['barrel', 'barrels', 'car', 'truck', 'stall', 'cart', 'hay', 'fountain', 'well', 'lamp', 'palm', 'tree', 'bollard', 'sandbags', 'bench', 'planter', 'forklift']);
export function prop(type, x, z, rot = 0, extra = {}) {
  const P = PROP[type]; if (!P) throw Error('Unknown prop ' + type); let [w, d, h] = P.size; if (extra.size) [w, d, h] = extra.size; if (rot) [w, d] = [d, w];
  const y0 = extra.y || 0, mat = extra.mat || P.solidMat || P.mat, solids = [];
  if (type === 'lamp' || type === 'palm' || type === 'tree') solids.push(B(x, z, w, d, h, mat, y0));   // only the pole / trunk collides; leaves and lamp head are above reach
  else if (type === 'fountain') solids.push(B(x, z, w, d, h, 'stone', y0), B(x, z, 2.4, 2.4, 9, 'stone', y0));
  else if (type === 'stall') solids.push(B(x, z, w, d, 3.6, 'wood', y0));   // the counter; the awning is high above
  else solids.push(B(x, z, w, d, h, mat, y0));
  if (DRAWN.has(type)) for (const b of solids) b.prop = type;   // drawn as its own shape by arena-scene (not as a plain box)
  return { solids, visual: { type, x, z, y: y0, rot, w, d, h, color: extra.color, text: extra.text, light: extra.light } };
}
// Signs and callouts (painted on walls; visual only): [text, x, y, z, facing ('n'|'s'|'e'|'w'), size].
export const sign = (text, x, y, z, face, size = 5, color = '#f2e3c0', bg = 'rgba(40,30,20,.0)') => ({ kind: 'sign', text, x, y, z, face, size, color, bg });
// An awning on a wall (visual only, above head height): at (x, z) facing `face`, `w` wide.
export const awning = (x, z, face, w, y = 15, color = 0xc0392b, stripes = 0xf2e3c0) => ({ kind: 'awning', x, z, face, w, y, color, stripes });

// Assemble a map: parts are { solids, decor } objects, arrays of boxes (solids) or props. Returns the map's lists.
export function assemble(...parts) {
  const solids = [], decor = [], props = [];
  const take = p => { if (!p) return; if (Array.isArray(p) && p.length === 7 && typeof p[5] === 'string') { solids.push(p); return; } if (Array.isArray(p)) { for (const q of p) take(q); return; } if (p.visual) { solids.push(...p.solids); props.push(p.visual); return; } if (p.kind) { decor.push(p); return; } if (p.solids) { solids.push(...p.solids); decor.push(...(p.decor || [])); } };
  for (const p of parts) take(p);
  return { solids, decor, props };
}
