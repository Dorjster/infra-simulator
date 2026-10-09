// Arena maps as plain data (original layouts). Shared by the game (3D build, collision) and the host (bot line of
// sight, spawns). Coordinates are game units relative to the arena centre (ARENA.cx, ARENA.cz); 1 unit ≈ 16.5 cm,
// so a wall 24 high is ~4 m, a crate 6 high is waist-high cover, eye height is 9.7.
// Each solid: [x, z, w, d, h, material, y0?]. Materials: sand, plaster, concrete, brick, wood, crate, metal-red,
// metal-blue, metal-green, roof, stone. kind: 'dm' (deathmatch) or 'defuse' (bomb sites A / B, T / CT spawns, bot routes).
const B = (x, z, w, d, h, m, y0 = 0) => [x, z, w, d, h, m, y0];
// A building shell: four walls with a doorway gap on each listed side ('n','s','e','w'), optional roof.
function building(x, z, w, d, h, m, doors = 'ns', door = 12, roof = true) {
  const t = 2, out = [], half = (span, gapped) => gapped ? (span - door) / 2 : span;
  for (const [side, horiz] of [['n', true], ['s', true], ['w', false], ['e', false]]) {
    const span = horiz ? w : d, gap = doors.includes(side), seg = half(span, gap);
    const at = (o, len) => horiz ? B(x - w / 2 + o + len / 2, z + (side === 'n' ? -d / 2 : d / 2), len, t, h, m) : B(x + (side === 'w' ? -w / 2 : w / 2), z - d / 2 + o + len / 2, t, len, h, m);
    if (gap) { out.push(at(0, seg), at(span - seg, seg)); out.push(horiz ? B(x - w / 2 + span / 2, z + (side === 'n' ? -d / 2 : d / 2), door, t, h - 16, m, 16) : B(x + (side === 'w' ? -w / 2 : w / 2), z - d / 2 + span / 2, t, door, h - 16, m, 16)); }
    else out.push(at(0, span));
  }
  if (roof) out.push(B(x, z, w + 2, d + 2, 1.5, 'roof', h));
  return out;
}
const container = (x, z, rot, m) => rot ? B(x, z, 15, 40, 15, m) : B(x, z, 40, 15, 15, m);

export const ARENA_MAPS = {
  // Deathmatch 1: a freight yard — rows of shipping containers, crate stacks, a warehouse with two doors.
  yard: {
    name: 'Freight Yard', kind: 'dm', size: [260, 260], floor: 'concrete', sky: 0x9fb8cc, sun: 0xfff2dc,
    solids: [
      ...[-120, 120].map(z => B(0, z, 244, 4, 30, 'concrete')), ...[-120, 120].map(x => B(x, 0, 4, 244, 30, 'concrete')),
      container(-70, -70, 0, 'metal-red'), container(-70, -54, 0, 'metal-blue'), B(-70, -62, 40, 15, 15, 'metal-blue', 15),   // a container stacked on the other two
      container(70, 70, 0, 'metal-green'), container(70, 54, 0, 'metal-red'), container(-60, 60, 1, 'metal-blue'), container(60, -60, 1, 'metal-green'),
      container(0, -80, 0, 'metal-green'), container(0, 80, 0, 'metal-blue'), container(-95, 0, 1, 'metal-red'), container(95, 0, 1, 'metal-blue'),
      ...building(0, 0, 70, 50, 32, 'brick', 'ns', 14),
      B(-30, 40, 8, 8, 6, 'crate'), B(-22, 40, 8, 8, 6, 'crate'), B(-26, 40, 8, 8, 6, 'crate', 6), B(30, -40, 8, 8, 6, 'crate'), B(38, -40, 8, 8, 6, 'crate'),
      B(-40, -30, 8, 8, 6, 'crate'), B(40, 32, 8, 8, 6, 'crate'), B(-100, -100, 8, 8, 6, 'crate'), B(100, 100, 8, 8, 6, 'crate'), B(-100, 95, 12, 8, 6, 'crate'), B(100, -95, 12, 8, 6, 'crate'),
      B(-12, 0, 6, 6, 6, 'crate'), B(12, 6, 6, 6, 6, 'crate'),
    ],
    spawns: [[-108, -88], [108, 88], [-105, 105], [105, -105], [0, -105], [0, 105], [-105, 0], [105, 0], [-45, 0], [45, 0], [-30, -95], [30, 95]],
  },
  // Deathmatch 2: an old town — sandstone houses around a plaza, an arch, narrow alleys and a fountain.
  town: {
    name: 'Old Town', kind: 'dm', size: [240, 240], floor: 'stone', sky: 0xa9c7e0, sun: 0xffe7c2,
    solids: [
      ...[-110, 110].map(z => B(0, z, 224, 4, 34, 'plaster')), ...[-110, 110].map(x => B(x, 0, 4, 224, 34, 'plaster')),
      ...building(-70, -70, 50, 44, 36, 'sand', 'es', 13), ...building(70, -70, 50, 44, 30, 'plaster', 'ws', 13), ...building(-70, 70, 50, 44, 30, 'plaster', 'en', 13), ...building(70, 70, 50, 44, 36, 'sand', 'wn', 13),
      B(-28, -18, 4, 30, 26, 'sand'), B(28, 18, 4, 30, 26, 'sand'), B(0, -45, 34, 4, 26, 'sand'), B(0, 45, 34, 4, 26, 'sand'),
      B(-20, -45, 6, 6, 30, 'stone'), B(20, -45, 6, 6, 30, 'stone'), B(0, -45, 46, 6, 6, 'stone', 26),
      B(0, 0, 14, 14, 5, 'stone'), B(0, 0, 4, 4, 11, 'stone'),
      B(-45, 0, 8, 8, 6, 'wood'), B(45, 0, 8, 8, 6, 'wood'), B(-15, 25, 10, 6, 6, 'crate'), B(15, -25, 10, 6, 6, 'crate'), B(-95, 0, 8, 20, 6, 'wood'), B(95, 0, 8, 20, 6, 'wood'),
    ],
    spawns: [[-70, -70], [70, -70], [-70, 70], [70, 70], [0, -95], [0, 95], [-95, -30], [95, 30], [-40, 15], [40, -15]],
  },

  // Defuse maps (original layouts, in the spirit of the classics). Each: T and CT spawns (buy zones around them),
  // two bomb sites { A, B: [x, z, radius] } and bot routes from each spawn to each site.
  // Dune: desert lanes — B through the west tunnel, A down the long east lane, mid doors between.
  dune: {
    name: 'Dune', kind: 'defuse', size: [300, 300], floor: 'sand', sky: 0xb8d4ea, sun: 0xfff0d0,
    solids: [
      ...[-150, 150].map(z => B(0, z, 304, 4, 32, 'sand')), ...[-150, 150].map(x => B(x, 0, 4, 304, 32, 'sand')),
      B(-55, 10, 40, 140, 30, 'sand'), B(55, 10, 40, 140, 30, 'plaster'),                                   // blocks between the lanes
      B(-21, -20, 28, 4, 28, 'sand'), B(21, -20, 28, 4, 28, 'sand'), B(0, -20, 14, 4, 10, 'wood', 18),       // mid doors
      B(-140, 30, 20, 60, 24, 'sand'), B(-85, 30, 20, 60, 24, 'sand'), B(-112, 30, 75, 60, 2, 'roof', 16),   // B tunnel
      B(110, 40, 30, 4, 24, 'plaster'), B(140, -30, 16, 16, 8, 'crate'), B(90, 70, 10, 10, 6, 'crate'),      // A long
      B(105, -95, 10, 10, 8, 'crate'), B(125, -78, 8, 8, 6, 'crate'), B(95, -118, 14, 6, 6, 'wood'), B(118, -110, 8, 8, 12, 'crate'),   // A site
      B(-110, -100, 10, 10, 8, 'crate'), B(-127, -84, 8, 8, 6, 'crate'), B(-95, -112, 8, 8, 6, 'crate'), B(-120, -118, 14, 6, 10, 'wood'), // B site
      B(0, 30, 10, 10, 8, 'crate'), B(-15, 62, 8, 8, 6, 'crate'), B(0, -100, 20, 6, 6, 'crate'), B(18, 100, 12, 6, 6, 'wood'),
    ],
    t: [[0, 128], [-14, 124], [14, 124], [-26, 130], [26, 130]], ct: [[0, -128], [-14, -124], [14, -124], [-26, -132], [26, -132]],
    sites: { A: [115, -95, 24], B: [-108, -88, 24] },
    routes: { t: { A: [[40, 110], [110, 95], [138, 60], [138, 10], [118, -10], [110, -60], [115, -95]], B: [[-40, 110], [-112, 90], [-112, 30], [-112, -40], [-108, -88]], M: [[0, 80], [12, 50], [12, 10], [0, -40], [0, -70]] },
      ct: { A: [[40, -120], [80, -132], [128, -125], [130, -100], [115, -95]], B: [[-40, -120], [-101, -128], [-101, -92], [-108, -88]] } },
  },
  // Plaza: a market town — A by the palace (south-west), B in the apartments (north-west), mid window between.
  plaza: {
    name: 'Plaza', kind: 'defuse', size: [300, 300], floor: 'stone', sky: 0xa9c7e0, sun: 0xffe7c2,
    solids: [
      ...[-150, 150].map(z => B(0, z, 304, 4, 34, 'plaster')), ...[-150, 150].map(x => B(x, 0, 4, 304, 34, 'plaster')),
      B(20, -45, 160, 30, 30, 'plaster'), B(20, 45, 160, 30, 30, 'sand'),                                    // blocks between the lanes
      B(-40, -19, 4, 22, 30, 'plaster'), B(-40, 19, 4, 22, 30, 'plaster'), B(-40, 0, 4, 16, 18, 'plaster', 12),   // mid window (gap under it)
      B(30, -105, 60, 90, 2, 'roof', 18), B(10, -105, 4, 30, 18, 'brick'), B(50, -90, 4, 30, 18, 'brick'),   // apartments
      B(30, 108, 4, 34, 30, 'sand'), B(70, 125, 20, 8, 8, 'wood'), B(-10, 85, 10, 10, 6, 'crate'),           // palace / ramp
      B(-100, 100, 12, 12, 8, 'crate'), B(-80, 120, 10, 6, 6, 'wood'), B(-122, 82, 6, 10, 6, 'crate'), B(-112, 122, 10, 10, 12, 'stone'),   // A site
      B(-100, -100, 10, 10, 8, 'crate'), B(-120, -80, 8, 8, 6, 'crate'), B(-80, -116, 14, 6, 6, 'wood'), B(-122, -122, 12, 12, 10, 'stone'), // B site
      B(-142, 0, 8, 20, 6, 'wood'), B(110, 20, 10, 10, 6, 'crate'), B(110, -20, 10, 10, 6, 'crate'), B(0, 0, 10, 10, 8, 'crate'),
    ],
    t: [[128, 0], [124, -14], [124, 14], [132, -26], [132, 26]], ct: [[-128, 0], [-124, -14], [-124, 14], [-132, -26], [-132, 26]],
    sites: { A: [-90, 95, 24], B: [-90, -95, 24] },
    routes: { t: { A: [[110, 100], [60, 76], [0, 74], [-40, 75], [-90, 95]], B: [[110, -100], [60, -130], [-40, -130], [-90, -95]], M: [[100, 0], [20, 12], [-20, 12], [-30, 0], [-60, 0]] },
      ct: { A: [[-128, 40], [-112, 80], [-90, 95]], B: [[-128, -40], [-112, -80], [-90, -95]] } },
  },
  // Hamlet: a small town — houses you can walk through, A at the church square, B at the market fountain.
  hamlet: {
    name: 'Hamlet', kind: 'defuse', size: [280, 280], floor: 'stone', sky: 0x9fb8cc, sun: 0xfff2dc,
    solids: [
      ...[-140, 140].map(z => B(0, z, 284, 4, 34, 'brick')), ...[-140, 140].map(x => B(x, 0, 4, 284, 34, 'brick')),
      ...building(-90, 50, 50, 40, 30, 'plaster', 'ns', 12), ...building(0, 55, 46, 36, 32, 'brick', 'ns', 12), ...building(90, 50, 50, 40, 30, 'plaster', 'ns', 12),
      ...building(-45, -10, 40, 34, 28, 'brick', 'ew', 12), ...building(45, -10, 40, 34, 28, 'plaster', 'ew', 12),
      B(88, -105, 40, 24, 40, 'stone'), B(70, -60, 8, 8, 6, 'crate'), B(100, -50, 12, 6, 6, 'wood'), B(110, -70, 8, 8, 8, 'crate'),        // church + A site
      B(-85, -50, 10, 10, 4, 'stone'), B(-85, -50, 3, 3, 10, 'stone'), B(-105, -65, 12, 6, 6, 'wood'), B(-65, -38, 8, 8, 6, 'crate'),   // fountain + B site
      B(0, -60, 10, 10, 8, 'crate'), B(0, 100, 12, 8, 6, 'wood'), B(-120, 100, 8, 8, 6, 'crate'), B(120, 100, 8, 8, 6, 'crate'),
    ],
    t: [[0, 120], [-14, 116], [14, 116], [-26, 122], [26, 122]], ct: [[0, -120], [-14, -116], [14, -116], [-26, -122], [26, -122]],
    sites: { A: [85, -62, 22], B: [-85, -64, 22] },
    routes: { t: { A: [[45, 110], [118, 80], [118, 10], [85, -40], [85, -62]], B: [[-45, 110], [-118, 80], [-118, 10], [-118, -40], [-85, -64]], M: [[14, 100], [0, 85], [0, 20], [0, -40]] },
      ct: { A: [[40, -110], [70, -80], [85, -62]], B: [[-40, -110], [-70, -80], [-85, -64]] } },
  },
};
for (const m of Object.values(ARENA_MAPS)) if (m.kind === 'defuse') m.spawns = [...m.t, ...m.ct];
// Solids as world-space boxes: { minX, maxX, minZ, maxZ, y0, y1, mat }.
export function mapBoxes(map, cx, cz) { return map.solids.map(([x, z, w, d, h, mat, y0 = 0]) => ({ minX: cx + x - w / 2, maxX: cx + x + w / 2, minZ: cz + z - d / 2, maxZ: cz + z + d / 2, y0, y1: y0 + h, mat })); }
// Can a player stand at (x, z)? (radius r, ignores roofs and things above head height)
export function walkable(boxes, bounds, x, z, r = 1.3) {
  if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return false;
  for (const b of boxes) if (b.y0 < 10 && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return false;
  return true;
}
// Line of sight at eye height between two points (segment vs boxes that cover y = 8…10).
export function lineOfSight(boxes, ax, az, bx, bz, y = 9) {
  for (const b of boxes) { if (b.y0 > y || b.y1 < y) continue; let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p, d, lo, hi] of [[ax, dx, b.minX, b.maxX], [az, dz, b.minZ, b.maxZ]]) { if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; } let a = (lo - p) / d, c = (hi - p) / d; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) break; }
    if (t0 <= t1 && t0 < 1 && t1 > 0) return false; }
  return true;
}
// Is the 3D segment a→b clear of every box? (slab test; used for bullets, knife, grenades and pickups)
export function segmentClear(boxes, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const b of boxes) { let t0 = 0, t1 = 1, out = false;
    for (const [p, d, lo, hi] of [[ax, dx, b.minX, b.maxX], [ay, dy, b.y0, b.y1], [az, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (p <= lo || p >= hi) { out = true; break; } continue; }
      let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 >= t1) { out = true; break; } }
    if (!out && t0 < 1 && t1 > 0) return false; }
  return true;
}
// Distance along a ray (origin o, unit direction d) to the first box it enters, or Infinity.
export function rayBoxes(boxes, ox, oy, oz, dx, dy, dz, far = 2000) {
  let best = far;
  for (const b of boxes) { let t0 = 0, t1 = best, out = false;
    for (const [p, d, lo, hi] of [[ox, dx, b.minX, b.maxX], [oy, dy, b.y0, b.y1], [oz, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { out = true; break; } continue; }
      let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { out = true; break; } }
    if (!out && t0 > 0 && t0 < best) best = t0; }
  return best;
}
// Bullet penetration (wallbangs): each material costs this much per unit of thickness crossed; Infinity = solid.
// Crates, wooden doors and thin plaster walls can be shot through; brick and concrete only when thin; stone,
// shipping containers (steel boxes full of cargo) and the floor never. A gun's `pen` budget (weapons-data.js) is
// what it can cross in total; damage falls with what it crossed.
export const PEN_COST = { crate: .8, wood: 1, door: .7, plaster: 1.6, roof: 1.2, glass: .3, 'metal-red': 1.6, 'metal-blue': 1.6, 'metal-green': 1.6, metal: 1.6, brick: 3, concrete: 3.2, sand: 3, stone: Infinity };
const SOLID_THICK = 4;   // thicker than this, only crates and wood are crossed (a 15-unit container is not)
export function bulletPath(boxes, ox, oy, oz, dx, dy, dz, far = 2000, budget = 0) {
  const hits = [];
  for (const b of boxes) { let t0 = 0, t1 = far, out = false;
    for (const [p, d, lo, hi] of [[ox, dx, b.minX, b.maxX], [oy, dy, b.y0, b.y1], [oz, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { out = true; break; } continue; }
      let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { out = true; break; } }
    if (!out && t1 > 0 && t0 < far) hits.push({ t0, t1, mat: b.mat, b }); }
  hits.sort((a, b) => a.t0 - b.t0);
  let spent = 0, stop = Infinity; const crossed = [];
  for (const h of hits) {
    const thick = h.t1 - h.t0, unit = PEN_COST[h.mat] ?? 3, soft = h.mat === 'crate' || h.mat === 'wood' || h.mat === 'door' || h.mat === 'glass', cost = (!soft && thick > SOLID_THICK) ? Infinity : thick * unit;
    if (spent + cost > budget) { stop = h.t0; break; } spent += cost; crossed.push({ t0: h.t0, t1: h.t1, mat: h.mat, spent });
  }
  // Damage multiplier for a target at distance t: 1 in the open; less behind each thing the bullet went through.
  const factor = t => { if (t >= stop) return 0; let s = 0; for (const c of crossed) if (c.t1 <= t + 1e-6) s = c.spent; return s ? Math.max(.15, 1 - s / (budget * 1.25)) : 1; };
  return { stop, crossed, factor };
}
