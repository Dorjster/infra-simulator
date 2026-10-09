// Arena maps as plain data (original layouts). Shared by the game (3D build, collision) and the host (bot line of
// sight, spawns). Coordinates are game units relative to the arena centre (ARENA.cx, ARENA.cz); 1 unit ≈ 16.5 cm,
// so a wall 24 high is ~4 m, a crate 6 high is waist-high cover, eye height is 9.7.
// Each solid: [x, z, w, d, h, material, y0?]. Materials: sand, plaster, concrete, brick, wood, crate, metal-red,
// metal-blue, metal-green, roof, stone. kind: 'dm' (deathmatch) or 'defuse' (bomb sites A / B, T / CT spawns, bot routes).
import { wall, house, stairs, platform, prop, sign, awning, assemble } from './arena-mapkit.js';
const B = (x, z, w, d, h, m, y0 = 0) => [x, z, w, d, h, m, y0];
// Windows painted on the face of a solid block (decoration: shutters and frames on a wall you can't enter).
// faces: [x, z, face, length] — the face's centre, which way it looks, how long it is; y = sill height, h = window height.
function windows(faces, y = 15, h = 6, every = 13) { const out = []; for (const [x, z, face, len] of faces) { const n = Math.max(1, Math.floor(len / every)); for (let i = 0; i < n; i++) { const off = (i - (n - 1) / 2) * every, horiz = face === 'n' || face === 's'; out.push({ kind: 'window', x: horiz ? x + off : x, z: horiz ? z : z + off, face, y, w: 4.2, h, shutters: [0x2f6d7a, 0x7a3b2a, 0x5b6b3a][(i + Math.round(x)) % 3] }); } } return out; }
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
  dune: (() => {
    // Dune — a sandstone desert town. T spawn in the south caravan yard, CT spawn in the north courtyard.
    // B (north-west): through the roofed B tunnels from the T side, or the B doors from CT.
    // Mid: the long middle street with the mid doors (a wooden double door) and the raised catwalk to A short.
    // A (north-east): up long A past the long doors, or along the catwalk; CTs come down the CT ramp.
    const W = 'adobe', P = 'plaster', L = (x1, z1, x2, z2, h, m, ops) => wall(x1, z1, x2, z2, 2, h, m, ops);
    const m = assemble(
      // The town wall around the map.
      L(-150, -150, 150, -150, 32, W), L(-150, 150, 150, 150, 32, W), L(-150, -149, -150, 149, 32, W), L(150, -149, 150, 149, 32, W),
      // Building blocks between the lanes (solid masses: you can't shoot through a whole house).
      B(-62, 15, 40, 110, 28, W), B(62, 15, 44, 110, 26, P), B(-98, 28, 32, 56, 26, W), B(-139, 28, 22, 56, 26, W),
      B(-100, 118, 36, 22, 22, P), B(100, 118, 34, 22, 22, W), B(-15, -132, 40, 30, 24, P), B(40, -136, 24, 24, 24, W),
      // B tunnels: a roofed corridor 14 wide (walls are the blocks either side), a dog-leg crate inside.
      B(-121, 28, 16, 58, 1.5, 'roof', 16), prop('crate', -117, 40, 0), prop('barrel', -116, 14),
      // Mid doors: a wall across mid with a 12-wide double doorway (the wooden doors stand open).
      L(-42, -42, 22, -42, 22, W, [{ at: 36, w: 12 }]),
      // Catwalk: a raised walk along mid's east side (stairs up from mid), then A short along the north of the east block.
      B(31, -26, 18, 52, 5.6, W), ...stairs({ x: 31, z: 6, dir: 'n', w: 12, steps: 3 }), B(62, -46, 44, 12, 5.6, W), ...stairs({ x: 90, z: -46, dir: 'w', w: 10, steps: 3 }),
      B(22.3, -26, .6, 52, 1.2, 'wood', 5.6), B(62, -51.7, 44, .6, 1.2, 'wood', 5.6),   // railings
      // Long doors: a wall across long A with one doorway.
      L(84, 40, 150, 40, 24, P, [{ at: 34, w: 12 }]),
      // B doors: from CT mid towards B.
      L(-70, -38, -70, -150, 24, W, [{ at: 57, w: 12 }]),
      // CT ramp up to A: low walls framing it.
      B(78, -118, 4, 30, 8, W),
      // ── A site (north-east): boxes to play around, a parked truck, sandbags.
      prop('crate2', 112, -112, 0), prop('crate', 118, -106, 0), prop('crate', 98, -82, 0), prop('truck', 135, -88, 0, { color: 0x7a5a3a }), prop('sandbags', 96, -100, 1), prop('barrels', 120, -72, 0),
      // ── B site (north-west): ruins, a cart, crates.
      B(-128, -100, 4, 24, 10, W), B(-116, -112, 24, 4, 10, W), prop('crate', -96, -74, 0), prop('crate2', -94, -104, 0), prop('cart', -140, -58, 0), prop('barrel', -132, -78), prop('sandbags', -105, -66, 0),
      // ── Mid and lanes: cover and street furniture.
      prop('crate', -30, 30, 0), prop('crate', -26, 64, 0), prop('stall', 20, 80, 0, { color: 0x2f7d8c }), prop('cart', -28, 95, 1), prop('barrels', 8, -70, 0), prop('palm', -36, 98), prop('palm', 36, 98), prop('palm', 0, -100), prop('well', -26, -74),
      prop('crate', 132, 70, 0), prop('car', 60, 85, 0, { color: 0xa0412d }), prop('barrel', 140, 20), prop('crate2', 92, 10, 0), prop('sandbags', 138, -30, 1), prop('palm', 145, 105),
      prop('crate', -125, 90, 0), prop('barrels', -110, 70, 0), prop('palm', -144, 100), prop('stall', -72, 110, 1, { color: 0xb5651d }),
      prop('crate', -50, -120, 0), prop('barrels', 56, -84, 0), prop('lamp', -40, -60, 0, { light: true }), prop('lamp', 44, -60, 0, { light: true }), prop('lamp', 30, 146, 0, { light: true }), prop('lamp', -146, -10, 0, { light: true }), prop('lamp', 146, 30, 0, { light: true }),
      // Signs and decoration.
      sign('B', -121, 18, 56.5, 's', 6), sign('TUNNELS', -121, 12, 56.5, 's', 1.8), sign('MID', -6, 18, -41, 's', 4), sign('A', 118, 18, 41, 's', 6), sign('LONG', 118, 12, 41, 's', 3),
      sign('CT', -6, 18, -43, 'n', 4), sign('A ⟶', 60, 3, -52.1, 'n', 2.4), sign('⟵ B', -71, 18, -95, 'e', 4), sign('A', 112, 20, -148.9, 's', 8), sign('B', -112, 20, -148.9, 's', 8),
      awning(-62, 70.6, 's', 20, 15, 0x9c3b2a), awning(62, 70.6, 's', 22, 15, 0x2f7d8c), awning(-100, 106.9, 'n', 16, 14, 0xb5651d), awning(100, 106.9, 'n', 16, 14, 0x6c8a3a), awning(-41.9, 20, 'e', 18, 15, 0xc9a227), awning(39.9, 40, 'w', 16, 15, 0x9c3b2a),
    );
    return { name: 'Dune', kind: 'defuse', size: [300, 300], floor: 'sand', sky: 0xbcd6ec, sun: 0xfff0d0, look: { sun: 1.25, hemi: .95, fog: 0xcfd9e0, ambient: 'desert' },
      ...m, decor: [...m.decor, ...windows([[-62, -40, 'n', 40], [-62, 70, 's', 40], [62, 70, 's', 44], [-42, 15, 'e', 110], [40, 15, 'w', 110], [84, 15, 'e', 110], [-82, 15, 'w', 60], [-100, 107, 'n', 36], [100, 107, 'n', 34], [-15, -117, 's', 40]], 15, 6)],
      t: [[0, 128], [-14, 124], [14, 124], [-26, 132], [26, 132]], ct: [[10, -110], [-6, -106], [26, -106], [-6, -96], [26, -96]],
      sites: { A: [112, -92, 22], B: [-108, -86, 22] },
      routes: { t: { A: [[40, 118], [76, 100], [118, 96], [118, 48], [118, 30], [118, -40], [112, -92]], B: [[-40, 118], [-70, 98], [-122, 80], [-123, 58], [-123, 28], [-123, -4], [-122, -60], [-108, -86]], M: [[0, 100], [-6, 40], [-6, -30], [-6, -60]] },
        ct: { A: [[40, -110], [70, -98], [88, -89], [112, -92]], B: [[-6, -100], [-40, -96], [-70, -95], [-90, -90], [-108, -86]] } } };
  })(),
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
      ct: { A: [[-128, 40], [-112, 80], [-90, 84], [-90, 95]], B: [[-128, -40], [-112, -80], [-90, -95]] } },
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
export function mapBoxes(map, cx, cz) { return map.solids.map(s => { const [x, z, w, d, h, mat, y0 = 0] = s; return { minX: cx + x - w / 2, maxX: cx + x + w / 2, minZ: cz + z - d / 2, maxZ: cz + z + d / 2, y0, y1: y0 + h, mat, prop: s.prop || null }; }); }
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
export const PEN_COST = { adobe: 2.6, metal: 1.6, crate: .8, wood: 1, door: .7, plaster: 1.6, roof: 1.2, glass: .3, 'metal-red': 1.6, 'metal-blue': 1.6, 'metal-green': 1.6, metal: 1.6, brick: 3, concrete: 3.2, sand: 3, stone: Infinity };
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
// Spawn spots for a side ('t', 'ct', or 'dm' for every spawn): the map's points plus walkable spots around each
// (6 units apart), so a full team never stands inside each other. Coordinates relative to the arena centre.
const slotCache = new Map();
export function spawnSlots(map, side) {
  const k = (map.name || '') + ':' + side; if (slotCache.has(k)) return slotCache.get(k);
  const base = side === 't' ? map.t : side === 'ct' ? map.ct : map.spawns, boxes = mapBoxes(map, 0, 0), [sw, sd] = map.size, bounds = { minX: -sw / 2, maxX: sw / 2, minZ: -sd / 2, maxZ: sd / 2 }, out = [];
  const free = (x, z) => walkable(boxes, bounds, x, z, 1.8) && out.every(([a, b]) => Math.hypot(a - x, b - z) >= 5.5);
  for (const [x, z] of base) if (free(x, z)) out.push([x, z]);
  for (const r of [6.5, 13]) for (const [x, z] of base) for (let a = 0; a < 8; a++) { const px = x + Math.cos(a * Math.PI / 4) * r, pz = z + Math.sin(a * Math.PI / 4) * r; if (free(px, pz)) out.push([+px.toFixed(2), +pz.toFixed(2)]); }
  slotCache.set(k, out); return out;
}
