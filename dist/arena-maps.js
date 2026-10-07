// Arena maps as plain data (original layouts). Shared by the game (3D build, collision) and the host (bot line of
// sight, spawns). Coordinates are game units relative to the arena centre (ARENA.cx, ARENA.cz); 1 unit ≈ 16.5 cm,
// so a wall 24 high is ~4 m, a crate 6 high is waist-high cover, eye height is 9.7.
// Each solid: [x, z, w, d, h, material, y0?]. Materials: sand, plaster, concrete, brick, wood, crate, metal-red,
// metal-blue, metal-green, roof, stone. kind: 'dm' (deathmatch) or 'defuse' (later: bomb sites A / B).
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
};
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
