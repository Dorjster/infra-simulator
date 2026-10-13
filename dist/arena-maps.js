// Arena maps as plain data (deathmatch: original layouts; Defuse: the classic maps, cs-mapbuild.js). Shared by the game (3D build, collision) and the host (bot line of
// sight, spawns). Coordinates are game units relative to the arena centre (ARENA.cx, ARENA.cz); 1 unit ≈ 16.5 cm,
// so a wall 24 high is ~4 m, a crate 6 high is waist-high cover, eye height is 9.7.
// Each solid: [x, z, w, d, h, material, y0?]. Materials: sand, plaster, concrete, brick, wood, crate, metal-red,
// metal-blue, metal-green, roof, stone. kind: 'dm' (deathmatch) or 'defuse' (bomb sites A / B, T / CT spawns, bot routes).
import { DRESS } from './arena-maps-more.js';
import { buildCsMap } from './cs-mapbuild.js';
import { parseBsp } from './bsp30.js'; import { buildBspMap } from './bsp-map.js'; import { isVbsp, parseVbsp, toGoldSrc, playBounds } from './vbsp.js'; import { sourceSolids } from './vbsp-solids.js';
import { THEMES, CS_MAP_IDS } from './cs-maps/themes.js';
import dust2 from './cs-maps/dust2-nav.js'; import mirage from './cs-maps/mirage-nav.js'; import inferno from './cs-maps/inferno-nav.js'; import nuke from './cs-maps/nuke-nav.js';
import cache from './cs-maps/cache-nav.js'; import anubis from './cs-maps/anubis-nav.js'; import ancient from './cs-maps/ancient-nav.js';
const NAV = { dust2, mirage, inferno, nuke, cache, anubis, ancient };
const B = (x, z, w, d, h, m, y0 = 0) => [x, z, w, d, h, m, y0];
// Windows painted on the face of a solid block (decoration: shutters and frames on a wall you can't enter).
// (windows() — painted windows on solid blocks — lives in arena-mapkit.js.)
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
// The Defuse maps: the classic Counter-Strike maps, rebuilt at true scale from their navigation areas and overviews
// (cs-mapbuild.js). Each is built the first time it is used (a fraction of a second) and kept.
for (const id of CS_MAP_IDS) Object.defineProperty(ARENA_MAPS, id, { enumerable: true, configurable: true, get() {
  const m = buildCsMap(id, NAV[id], THEMES[id]); m.spawns = [...m.t, ...m.ct]; Object.defineProperty(ARENA_MAPS, id, { value: m, enumerable: true, configurable: true, writable: true }); return m; } });
// Maps from files (Counter-Strike 1.6 .bsp, imported on this computer, never shipped): useMapFile puts one in place of
// the built-in version of the same map — drawn from the file, walked on its own geometry (bsp-map.js). Built the first
// time it is used. The host and every client load the same file (the room serves it), so all build the same map.
const FILE_MAPS = new Map();
// Counter-Strike 1.6 (BSP 30) or Source (VBSP: CS:S / CS:GO ports; its terrain and solid props join the collision when the map is built).
export function useMapFile(id, buffer, info = {}) { if (!CS_MAP_IDS.includes(id)) throw Error('No such Defuse map: ' + id); const bsp = isVbsp(buffer) ? (sb => { const g = toGoldSrc(sb); g.extraSpans = (x, y) => (g._solids ??= sourceSolids(sb, { bounds: playBounds(sb) })).extraSpans(x, y); return g; })(parseVbsp(buffer)) : parseBsp(buffer); FILE_MAPS.set(id, { size: buffer.byteLength, ...info });
  Object.defineProperty(ARENA_MAPS, id, { enumerable: true, configurable: true, get() { const m = buildBspMap(id, bsp, { T: THEMES[id], nav: NAV[id] }); m.spawns = [...m.t, ...m.ct]; Object.defineProperty(ARENA_MAPS, id, { value: m, enumerable: true, configurable: true, writable: true }); return m; } }); }
export const mapFileOf = id => FILE_MAPS.get(id) || null;
// Every map's id, name and kind without building any (menus, settings).
export const MAP_LIST = [...Object.keys(ARENA_MAPS).filter(id => !CS_MAP_IDS.includes(id)).map(id => ({ id, name: ARENA_MAPS[id].name, kind: ARENA_MAPS[id].kind })), ...CS_MAP_IDS.map(id => ({ id, name: THEMES[id].name, kind: 'defuse' }))];
// In a team's buy zone? (dx, dz relative to the arena centre.) Classic maps: within reach of any of the team's spawn
// points (their spawn areas are large); others: around the spawns' centre.
export function inBuyZone(m, side, dx, dz, radius) { const sp = side === 'ct' ? m.ct : m.t; if (!sp?.length) return true;
  if (m.classic) return sp.some(([x, z]) => Math.hypot(dx - x, dz - z) <= radius * .9);
  const cx = sp.reduce((a, q) => a + q[0], 0) / sp.length, cz = sp.reduce((a, q) => a + q[1], 0) / sp.length; return Math.hypot(dx - cx, dz - cz) <= radius; }
export const mapMeta = id => MAP_LIST.find(m => m.id === id) || null;
// The older maps get their props, windows and callouts (arena-maps-more.js).
for (const [id, dress] of Object.entries(DRESS)) { if (CS_MAP_IDS.includes(id) || !Object.getOwnPropertyDescriptor(ARENA_MAPS, id)?.value || ARENA_MAPS[id]?.grid) continue; const M = ARENA_MAPS[id], d = dress(); M.solids = [...M.solids, ...d.solids]; M.decor = [...(M.decor || []), ...d.decor]; M.props = [...(M.props || []), ...d.props]; }

// Solids as world-space boxes: { minX, maxX, minZ, maxZ, y0, y1, mat }.
export function mapBoxes(map, cx, cz) { return map.solids.map(s => { const [x, z, w, d, h, mat, y0 = 0] = s; return { minX: cx + x - w / 2, maxX: cx + x + w / 2, minZ: cz + z - d / 2, maxZ: cz + z + d / 2, y0, y1: y0 + h, mat, prop: s.prop || null, walk: !!s.walk }; }); }
// The highest walk-on floor (raised floor, stair) under (x, z) whose top is at most `below` (0 if none).
export function floorTop(boxes, x, z, below = Infinity) { let y = 0; for (const b of boxes) if (b.walk && b.y1 <= below && b.y1 > y && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) y = b.y1; return y; }
// The floor under a world point (raised floors and ramps of grid maps; 0 elsewhere).
export const floorAt = (map, cx, cz, x, z) => map?.floorAt ? map.floorAt(x - cx, z - cz) : 0;
// Can a player stand at (x, z)? (radius r, ignores roofs, raised floors and stairs (walked on) and things above head height)
export function walkable(boxes, bounds, x, z, r = 1.3) {
  if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return false;
  for (const b of boxes) if (b.y0 < 10 && !b.walk && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return false;
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
  // Classic maps: a spot on the spawn's own floor with floor all round it (their columns know the levels).
  const nav = map.nav, levelOf = (x, z, y) => nav ? (Number.isFinite(y) ? nav.floorAt(x, z, y + 9.7) : nav.floorAt(x, z)) : 0;   // (a spawn's own height when it has one: [x, z, y])
  const ground = (x, z, level) => !nav ? walkable(boxes, bounds, x, z, 1.8) : [[0, 0], [1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8]].every(([dx, dz]) => { const f = nav.floorAt(x + dx, z + dz, level); return Number.isFinite(f) && Math.abs(f - level) < 2.8; });
  const free = (x, z, level = levelOf(x, z)) => ground(x, z, level) && out.every(([a, b]) => Math.hypot(a - x, b - z) >= 5.5);
  const lv = l => Number.isFinite(l) ? +l.toFixed(2) : undefined;
  for (const [x, z, y] of base) { const level = levelOf(x, z, y); if (free(x, z, level)) out.push([x, z, lv(level)]); }
  for (const r of [6.5, 13]) for (const [x, z, y] of base) { const level = levelOf(x, z, y); for (let a = 0; a < 8; a++) { const px = x + Math.cos(a * Math.PI / 4) * r, pz = z + Math.sin(a * Math.PI / 4) * r; if (free(px, pz, level)) out.push([+px.toFixed(2), +pz.toFixed(2), lv(level)]); } }
  slotCache.set(k, out); return out;
}
