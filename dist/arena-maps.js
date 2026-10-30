// Arena maps as plain data (deathmatch: original layouts; Defuse: the classic maps, cs-mapbuild.js). Shared by the game (3D build, collision) and the host (bot line of
// sight, spawns). Coordinates are game units relative to the arena centre (ARENA.cx, ARENA.cz); 1 unit ≈ 16.5 cm,
// so a wall 24 high is ~4 m, a crate 6 high is waist-high cover, eye height is 9.7.
// Each solid: [x, z, w, d, h, material, y0?]. Materials: sand, plaster, concrete, brick, wood, crate, metal-red,
// metal-blue, metal-green, roof, stone. kind: 'dm' (deathmatch) or 'defuse' (bomb sites A / B, T / CT spawns, bot routes).
import { DRESS } from './arena-maps-more.js';
import { buildCsMap } from './cs-mapbuild.js';
import { parseBsp } from './bsp30.js'; import { isCs2Map, parseCs2Map } from './cs2-map.js'; import { buildBspMap } from './bsp-map.js'; import { isVbsp, parseVbsp, toGoldSrc, playBounds } from './vbsp.js'; import { sourceSolids } from './vbsp-solids.js'; import { compactVbsp } from './vbsp-compact.js'; import { indexBoxes, boxesNear, boxesAlong } from './box-grid.js';
import { THEMES, CS_MAP_IDS, FILE_MAP_IDS } from './cs-maps/themes.js';
import dust2 from './cs-maps/dust2-nav.js'; import mirage from './cs-maps/mirage-nav.js'; import inferno from './cs-maps/inferno-nav.js'; import nuke from './cs-maps/nuke-nav.js';
import cache from './cs-maps/cache-nav.js'; import anubis from './cs-maps/anubis-nav.js'; import ancient from './cs-maps/ancient-nav.js';
import { textureSize } from './texture-quality.js';
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
// Maps there are only as files (Overpass: CS2's): a stand-in with just the name until the file is in (menus and the HUD
// read it; nothing plays on it — the host refuses it, arena-logic.js; the radar and the scene wait for the file).
for (const id of FILE_MAP_IDS) if (!CS_MAP_IDS.includes(id)) Object.defineProperty(ARENA_MAPS, id, { enumerable: false, configurable: true, writable: true,   // (not counted among the maps: Object.keys / entries skip it)
  value: { id, name: THEMES[id].name, kind: 'defuse', classic: true, stub: true, size: [1, 1], solids: [], decor: [], t: [], ct: [], spawns: [], sites: {}, siteGoals: {}, callouts: [] } });
// Maps from files (Counter-Strike 1.6 .bsp, imported on this computer, never shipped): useMapFile puts one in place of
// the built-in version of the same map — drawn from the file, walked on its own geometry (bsp-map.js). Built the first
// time it is used. The host and every client load the same file (the room serves it), so all build the same map.
const FILE_MAPS = new Map();
// Counter-Strike 1.6 (BSP 30), Source (VBSP: CS:S / CS:GO ports; its terrain and solid props join the collision when the
// map is built), or Counter-Strike 2 (converted here: cs2-map.js).
export function useMapFile(id, buffer, info = {}) { if (!FILE_MAP_IDS.includes(id)) throw Error('No such Defuse map: ' + id); const bsp = isCs2Map(buffer) ? parseCs2Map(buffer) : isVbsp(buffer) ? (sb => { const g = toGoldSrc(sb); g.extraSpans = (x, y) => (g._solids ??= sourceSolids(sb, { bounds: playBounds(sb) })).extraSpans(x, y); return g; })(compactVbsp(parseVbsp(buffer), { maxSize: textureSize() })) : parseBsp(buffer); FILE_MAPS.set(id, { size: buffer.byteLength, cs2: !!bsp.cs2, ...info });
  Object.defineProperty(ARENA_MAPS, id, { enumerable: true, configurable: true, get() { const m = buildBspMap(id, bsp, { T: THEMES[id], nav: NAV[id] }); m.spawns = [...m.t, ...m.ct]; Object.defineProperty(ARENA_MAPS, id, { value: m, enumerable: true, configurable: true, writable: true }); return m; } }); }
export const mapFileOf = id => FILE_MAPS.get(id) || null;
// Every map's id, name and kind without building any (menus, settings).
export const MAP_LIST = [...Object.keys(ARENA_MAPS).filter(id => !FILE_MAP_IDS.includes(id)).map(id => ({ id, name: ARENA_MAPS[id].name, kind: ARENA_MAPS[id].kind })), ...FILE_MAP_IDS.map(id => ({ id, name: THEMES[id].name, kind: 'defuse', ...(THEMES[id].fileOnly ? { fileOnly: true } : {}) }))];   // (fileOnly: offered once the room has its file — mapOffered)
// In a team's buy zone? (dx, dz relative to the arena centre.) Classic maps: within reach of any of the team's spawn
// points (their spawn areas are large); others: around the spawns' centre.
export function inBuyZone(m, side, dx, dz, radius) { const sp = side === 'ct' ? m.ct : m.t; if (!sp?.length) return true;
  if (m.classic) return sp.some(([x, z]) => Math.hypot(dx - x, dz - z) <= radius * .9);
  const cx = sp.reduce((a, q) => a + q[0], 0) / sp.length, cz = sp.reduce((a, q) => a + q[1], 0) / sp.length; return Math.hypot(dx - cx, dz - cz) <= radius; }
export const mapMeta = id => MAP_LIST.find(m => m.id === id) || null;
// Can a match be started on it here: built in, or a file-only map the room has (`roomMaps`: the ids of the room's map files).
export const mapOffered = (m, roomMaps = []) => !m.fileOnly || roomMaps.includes(m.id) || !!FILE_MAPS.get(m.id);
// The older maps get their props, windows and callouts (arena-maps-more.js).
for (const [id, dress] of Object.entries(DRESS)) { if (CS_MAP_IDS.includes(id) || !Object.getOwnPropertyDescriptor(ARENA_MAPS, id)?.value || ARENA_MAPS[id]?.grid) continue; const M = ARENA_MAPS[id], d = dress(); M.solids = [...M.solids, ...d.solids]; M.decor = [...(M.decor || []), ...d.decor]; M.props = [...(M.props || []), ...d.props]; }

// Solids as world-space boxes: { minX, maxX, minZ, maxZ, y0, y1, mat }.
// The map's collision boxes at (cx, cz), with a grid index for nearby queries (box-grid.js); the same list is handed
// out again (read only) for the last few maps asked for.
const BOX_CACHE = new Map();
export function mapBoxes(map, cx, cz) {
  const key = (map.id || '') + '@' + cx + ',' + cz, hit = BOX_CACHE.get(key); if (hit && hit.map === map) return hit.boxes;
  const list = map.solids.map(s => { const [x, z, w, d, h, mat, y0 = 0] = s; return { minX: cx + x - w / 2, maxX: cx + x + w / 2, minZ: cz + z - d / 2, maxZ: cz + z + d / 2, y0, y1: y0 + h, mat, prop: s.prop || null, walk: !!s.walk, mover: null, role: null, off: false }; });
  // Doors and breakables (map files: bsp-map.js movers): a shut / intact box, and the open ones, off until opened.
  for (const [id, m] of (map.movers || []).entries()) { const flipMs = DOOR_SWING[m.kind] ? 500 / DOOR_SWING[m.kind] : 0, add = (bx, role) => list.push({ minX: cx + bx[0], maxX: cx + bx[1], minZ: cz + bx[2], maxZ: cz + bx[3], y0: bx[4], y1: bx[5], mat: m.glass ? 'glass' : m.kind === 'break' ? 'crate' : 'door', prop: null, walk: false, mover: id, role, off: role !== 'shut', flipMs });
    add(m.box, 'shut'); for (const [role, bx] of Object.entries(m.open || {})) add(bx, role); }
  const boxes = indexBoxes(list); boxes.movers = list.filter(b => b.mover !== null);
  // CS2 maps: what bullets (and sight, knives, smoke) meet — its own boxes, without player clips and the fences bullets
  // pass, each made of what CS2 says (wallbangs: PEN_COST); the doors and breakables the same objects as above.
  if (map.bulletSolids) { const bl = map.bulletSolids.map(s => { const [x, z, w, d, h, mat, y0 = 0] = s; return { minX: cx + x - w / 2, maxX: cx + x + w / 2, minZ: cz + z - d / 2, maxZ: cz + z + d / 2, y0, y1: y0 + h, mat, prop: null, walk: false, mover: null, role: null, off: false, tri: 0 }; });   // (tri: has it sight triangles round it — 0 not looked yet, 1 yes, 2 none: bulletPath's fine phase, hasTri)
    boxes.bullets = indexBoxes(bl.concat(boxes.movers)); }
  if (map.nadeSolid) boxes.nadeSolid = (x, y, z) => map.nadeSolid(x - cx, y, z - cz);   // (map files: grenades by the real shapes, arena-nades.js)
  if (map.nadeMesh) { const M = map.nadeMesh; boxes.nadeMesh = { tris: M.tris, minY: M.minY, contact: (x, y, z, r, out) => M.contact(x - cx, y, z - cz, r, out), blocked: (ax, ay, az, bx, by, bz, sightOnly = false) => M.blocked(ax - cx, ay, az - cz, bx - cx, by, bz - cz, sightOnly) };   // (CS2 maps, newer files: grenades off CS2's own triangles)
    if (M.first) { const N = boxes.nadeMesh; N.sight = !!M.sight; N.first = (ax, ay, az, bx, by, bz, sightOnly = false, out = null) => M.first(ax - cx, ay, az - cz, bx - cx, by, bz - cz, sightOnly, out);
      if (M.anyIn) N.anyIn = (x0, y0, z0, x1, y1, z1, sightOnly = false) => M.anyIn(x0 - cx, y0, z0 - cz, x1 - cx, y1, z1 - cz, sightOnly);
      N.trianglesIn = (x0, y0, z0, x1, y1, z1, out, flags, max) => { const n = M.trianglesIn(x0 - cx, y0, z0 - cz, x1 - cx, y1, z1 - cz, out, flags, max); for (let k = 0; k < n * 9; k += 3) { out[k] += cx; out[k + 2] += cz; } return n; };
      if (N.sight) (boxes.bullets || boxes).fine = N; } }   // bullets, knives, sight lines: where a box's wall really is (bulletPath's fine phase)
  // A body's radius on these boxes (CS2 map files: their boxes stand 0–8 units proud of the walls, bsp-map.js trimOf — a
  // body this wide keeps CS2's 16-unit stand-off on average; arena-move.js takes it when present).
  if (map.bodyRadius) boxes.bodyRadius = map.bodyRadius;
  BOX_CACHE.delete(key); BOX_CACHE.set(key, { map, boxes }); while (BOX_CACHE.size > 4) BOX_CACHE.delete(BOX_CACHE.keys().next().value); return boxes;
}
// The round's doors and breakables (game.combat.mapState: doors[id] = { open, side, at }, broken[id]) on these boxes: a
// door's shut box while shut, its open box on the side it swung to while open; a broken one's none. A door moving
// switches halfway through its swing (`now` against when it started: d.at on the host's clock, or since[id] — the
// client's own clock when it saw the change, arena-scene.js), as the door is seen to move (DOOR_SWING). Returns when the
// next door still swinging switches (Infinity: none) — apply again then. inWay(b) (optional): is a body inside door box b?
// A door box that would turn solid round a body stays off until the body has left (looked at again every DOOR_RETRY ms):
// someone who stepped into the doorway mid-swing is never shut inside a box (arena-move.js can't walk a body out of a map
// box it is already in; CS2's doors stop at what is in their way — here the door is drawn shut and is passable a moment).
export const DOOR_SWING = { rotdoor: 1.8, door: 1.2 };   // a door's whole swing per second (rotating, sliding): arena-scene.js draws it at this pace
const DOOR_RETRY = 100;
export const bodyInBox = (b, x, z, feet, h, r) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r && feet < b.y1 && feet + h > b.y0;
export function applyMapState(boxes, state, now = Infinity, since = null, inWay = null) { let next = Infinity;
  for (const b of boxes?.movers || []) { const d = state?.doors?.[b.mover]; let open = !!d?.open;
    if (d && b.flipMs) { const at = since ? since[b.mover] : d.at; if (Number.isFinite(at) && now < at + b.flipMs) { open = !open; if (at + b.flipMs < next) next = at + b.flipMs; } }   // (still on its old side of halfway)
    const off = !!state?.broken?.[b.mover] || (open ? !(b.role === 'open' || b.role === ((d?.side ?? 1) < 0 ? '-' : '+')) : b.role !== 'shut');
    if (!off && b.off && b.flipMs && inWay && Number.isFinite(now) && inWay(b)) { if (now + DOOR_RETRY < next) next = now + DOOR_RETRY; continue; }   // (someone in its way: not yet)
    b.off = off; }
  return next; }
// The highest walk-on floor (raised floor, stair) under (x, z) whose top is at most `below` (0 if none).
const FT = [];
export function floorTop(boxes, x, z, below = Infinity) { let y = 0; for (const b of boxesNear(boxes, x, z, x, z, FT)) if (b.walk && b.y1 <= below && b.y1 > y && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) y = b.y1; return y; }
// The floor under a world point (raised floors and ramps of grid maps; 0 elsewhere).
export const floorAt = (map, cx, cz, x, z) => map?.floorAt ? map.floorAt(x - cx, z - cz) : 0;
// Can a player stand at (x, z)? (radius r, ignores roofs, raised floors and stairs (walked on) and things above head height)
export function walkable(boxes, bounds, x, z, r = 1.3) {
  if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return false;
  for (const b of boxesNear(boxes, x - r, z - r, x + r, z + r, WK)) if (b.y0 < 10 && !b.walk && x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return false;
  return true;
}
// Line of sight at eye height between two points (segment vs boxes that cover y = 8…10).
const LS = [], SC = [], RB = [], WK = [], BP = [];   // nearby boxes per query (box-grid.js)
export function lineOfSight(boxes, ax, az, bx, bz, y = 9) {
  for (const b of boxesAlong(boxes.bullets || boxes, ax, az, bx, bz, 0, LS)) { if (b.y0 > y || b.y1 < y) continue; let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p, d, lo, hi] of [[ax, dx, b.minX, b.maxX], [az, dz, b.minZ, b.maxZ]]) { if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; } let a = (lo - p) / d, c = (hi - p) / d; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) break; }
    if (t0 <= t1 && t0 < 1 && t1 > 0) return false; }
  return true;
}
// The ray o + d·t (t in [0, far]) against box b, no garbage: false when it misses; else ST0 / ST1 where it enters and
// leaves and SAX the axis it enters through (0 x, 1 y, 2 z; −1: the ray starts inside). strict: a ray along a face, or
// one only touching the box, misses it (segmentClear's rule; bullets and the knife count a touch).
let ST0 = 0, ST1 = 0, SAX = -1;
function slab(b, ox, oy, oz, dx, dy, dz, far, strict) { let t0 = 0, t1 = far, ax = -1, u, v, w;
  if (dx > -1e-9 && dx < 1e-9) { if (strict ? ox <= b.minX || ox >= b.maxX : ox < b.minX || ox > b.maxX) return false; } else { u = (b.minX - ox) / dx; v = (b.maxX - ox) / dx; if (u > v) { w = u; u = v; v = w; } if (u > t0) { t0 = u; ax = 0; } if (v < t1) t1 = v; if (strict ? t0 >= t1 : t0 > t1) return false; }
  if (dy > -1e-9 && dy < 1e-9) { if (strict ? oy <= b.y0 || oy >= b.y1 : oy < b.y0 || oy > b.y1) return false; } else { u = (b.y0 - oy) / dy; v = (b.y1 - oy) / dy; if (u > v) { w = u; u = v; v = w; } if (u > t0) { t0 = u; ax = 1; } if (v < t1) t1 = v; if (strict ? t0 >= t1 : t0 > t1) return false; }
  if (dz > -1e-9 && dz < 1e-9) { if (strict ? oz <= b.minZ || oz >= b.maxZ : oz < b.minZ || oz > b.maxZ) return false; } else { u = (b.minZ - oz) / dz; v = (b.maxZ - oz) / dz; if (u > v) { w = u; u = v; v = w; } if (u > t0) { t0 = u; ax = 2; } if (v < t1) t1 = v; if (strict ? t0 >= t1 : t0 > t1) return false; }
  ST0 = t0; ST1 = t1; SAX = ax; return true; }
// The fine phase (Counter-Strike 2 map files: boxes.bullets.fine — their sight triangles, nade-mesh.js first). A static
// bullet box is a 16-unit column standing up to 16 units proud of the wall it holds (bsp-map.js: CS2's surfaces on lines
// 8 apart, each line solid within 4 of a face, a column solid where 2 of its 4 rays are — and a big solid's inside has
// no boxes at all: only its shell), so it says only where a wall may be: the triangles the line
// crosses in the box's window (the box ± FINE_PAD along the line) say where it is — a face toward the line enters a
// solid, one away from it leaves one. A box no triangle is crossed in is padding and passed, unless the line runs deep
// inside it (FINE_DEEP across, FINE_FLAT up or down: a solid CS2 drew no sight triangles for). A line starting inside
// CS2's solid (an eye pressed into a ladder's column) passes it, as the knife's ray always passed a box it starts in.
// Doors and panes (movers) are thin and exact: their boxes stand. (FINE_PAD: a box face lies up to ~3 Hammer units
// behind CS2's — 1.7–3.2 % of faces over 2, measured on all eight maps; a box with nothing in its window also looks
// FINE_OUT either side of it, where no window looked, for a face toward the line: a line through a column's corner, or
// one grazing a slope, can have its window start or end short of the face, and that solid's inside has no boxes.)
const HU_G = 2.54 / 16.5, FINE_PAD = 4 * HU_G, FINE_OUT = 16 * HU_G, FINE_DEEP = 20 * HU_G, FINE_FLAT = 4 * HU_G, FINE_EPS = 1e-4, FN = new Float64Array(4);
// The next sight triangle crossed on o + d·t for t in [t, e]: its t, or Infinity (its outward normal in FN; FN[3] 1: two
// faces there, one in and one out — hulls touching, the wall goes on, or an edge grazed — nothing changes).
const crossAt = (F, ox, oy, oz, dx, dy, dz, t, e, sight = true) => { const w = F.first(ox + dx * t, oy + dy * t, oz + dz * t, ox + dx * e, oy + dy * e, oz + dz * e, sight, FN); return w === Infinity ? Infinity : t + (e - t) * w; };
const entering = (dx, dy, dz) => FN[0] * dx + FN[1] * dy + FN[2] * dz < 0;
// Looking back from tc to lo, past faces met two at a time: the face before tc if it enters a solid (its t; its normal
// in FN), else Infinity. sight false: any of CS2's faces, also those only grenades stop.
function entryBack(F, ox, oy, oz, dx, dy, dz, tc, lo, sight, eps = FINE_EPS) { let tb = tc - eps;   // (eps: FINE_EPS in t's units)
  for (let r = 0; r < 8 && tb > lo; r++) { tb = crossAt(F, ox, oy, oz, dx, dy, dz, tb, lo, sight); if (tb === Infinity || !FN[3]) break; tb -= eps; }
  return tb > lo && tb < Infinity && !FN[3] && entering(dx, dy, dz) ? tb : Infinity; }
// A static bullet box with no sight triangle round it (its bounds within NOTRI_PAD, twice the ~4 Hammer units a box's
// face stands from CS2's): a surface the mesh lost (nade_mesh's simplification drops small detail — Cache's overhead
// beams and pipes, 50 boxes there, 2 on Nuke, none on the other six maps) that the bullets' boxes kept: the box itself
// stops bullets, as before the fine phase. Looked up once a box (b.tri; ~2 µs).
const NOTRI_PAD = 2 * FINE_PAD;
const noTri = (F, b) => { if (!b.tri) b.tri = !F.anyIn || F.anyIn(b.minX - NOTRI_PAD, b.y0 - NOTRI_PAD, b.minZ - NOTRI_PAD, b.maxX + NOTRI_PAD, b.y1 + NOTRI_PAD, b.maxZ + NOTRI_PAD, true) ? 1 : 2; return b.tri === 2; };
const deepIn = (b, x, y, z) => Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z) > FINE_DEEP && Math.min(y - b.y0, b.y1 - y) > FINE_FLAT;
// Does the line o + d·t really meet static box b's solid on t in [t0, t1] (fractions of d when d is a segment: `scale`
// is d's length)? A crossing into a solid does; from the line's start (start: t0 is 0) one out of a solid is passed.
// exact (rayBoxes: where, not only whether): the solid's entry as bulletPath finds it — a face toward the line just
// before the window, or for a crossing out of a solid not seen entered, its entry further back (faces that stop sight
// first, then all).
function fineMeets(F, b, ox, oy, oz, dx, dy, dz, t0, t1, scale, lim, exact = false) { const pad = FINE_PAD / scale, e = FINE_EPS / scale, A = Math.max(0, t0 - pad), E = Math.min(lim, t1 + pad); let t = A, hit = Infinity, any = false;
  for (let g = 0; g < 32 && t < E; g++) { const tc = crossAt(F, ox, oy, oz, dx, dy, dz, t, E); if (tc === Infinity) break; any = true; if (!FN[3] && (A > 0 || entering(dx, dy, dz))) { hit = tc; break; } t = tc + e; }
  if (hit < Infinity && !exact) return hit;
  const out = hit < Infinity && !entering(dx, dy, dz);
  if (out) { const tb = entryBack(F, ox, oy, oz, dx, dy, dz, hit, 0, true, e); return tb < Infinity ? tb : Math.min(hit, entryBack(F, ox, oy, oz, dx, dy, dz, hit, 0, false, e)); }
  if (A > 0) { const tb = entryBack(F, ox, oy, oz, dx, dy, dz, A + e, Math.max(0, A - FINE_OUT / scale), true, e); if (tb < Infinity) return tb; }   // (a face just before the window: bulletPath's FINE_OUT)
  if (hit < Infinity) return hit;
  if (!any) { const e2 = Math.min(lim, E + FINE_OUT / scale); if (e2 > E + e) { const tc = crossAt(F, ox, oy, oz, dx, dy, dz, E, e2); if (tc < Infinity && !FN[3] && entering(dx, dy, dz)) return tc; } }   // (…or just past it)
  if (any || t0 <= 0) return Infinity; const m = (t0 + t1) / 2; return deepIn(b, ox + dx * m, oy + dy * m, oz + dz * m) ? t0 : Infinity; }
// Is the 3D segment a→b clear of every box? (slab test; used for bullets, knife, grenades and pickups) CS2 maps: the
// bullets' boxes (no player clips: they stop players only), each confirmed by its triangles (the fine phase). A box the
// segment starts in — a door shut on you, a ladder's column — is passed (rayBoxes always did).
export function segmentClear(boxes, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, list = boxes.bullets || boxes, F = list.fine || null, L = Math.hypot(dx, dy, dz) || 1e-9;
  for (const b of boxesAlong(list, ax, az, bx, bz, 0, SC)) { if (b.off || !slab(b, ax, ay, az, dx, dy, dz, 1, true) || !(ST0 < 1 && ST1 > 0)) continue;
    if (!F || b.mover != null || noTri(F, b)) { if (SAX < 0) continue; return false; }
    if (fineMeets(F, b, ax, ay, az, dx, dy, dz, ST0, ST1, L, 1) < Infinity) return false; }
  return true;
}
// Distance along a ray (origin o, unit direction d) to the first box it enters (CS2 maps: the first solid it really
// enters — the fine phase), or `far`.
export function rayBoxes(boxes, ox, oy, oz, dx, dy, dz, far = 2000) {
  let best = far; const list = boxes.bullets || boxes, F = list.fine || null;
  for (const b of boxesAlong(list, ox, oz, ox + dx * far, oz + dz * far, 0, RB)) { if (b.off || !slab(b, ox, oy, oz, dx, dy, dz, best, false)) continue;
    if (!F || b.mover != null || noTri(F, b)) { if (ST0 > 0 && ST0 < best) best = ST0; continue; }
    const t = fineMeets(F, b, ox, oy, oz, dx, dy, dz, ST0, ST1, 1, best, true); if (t < best) best = t; }
  return best;
}
// Bullet penetration (wallbangs): each material costs this much per unit of thickness crossed; Infinity = solid.
// Crates, wooden doors and thin plaster walls can be shot through; brick and concrete only when thin; stone,
// shipping containers (steel boxes full of cargo) and the floor never. A gun's `pen` budget (weapons-data.js) is
// what it can cross in total; damage falls with what it crossed.
export const PEN_COST = { adobe: 2.6, metal: 1.6, crate: .8, wood: 1, door: .7, plaster: 1.6, roof: 1.2, glass: .3, 'metal-red': 1.6, 'metal-blue': 1.6, 'metal-green': 1.6, metal: 1.6, brick: 3, concrete: 3.2, sand: 3, stone: Infinity };
const SOLID_THICK = 4;   // thicker than this, only crates and wood are crossed (a 15-unit container is not)
const costOf = (mat, thick, run = thick) => (mat === 'crate' || mat === 'wood' || mat === 'door' || mat === 'glass' || run <= SOLID_THICK) ? thick * (PEN_COST[mat] ?? 3) : Infinity;   // (what crossing `thick` units of it spends; run: the whole wall it is part of — CS2 maps: solids end to end, one wall built of several hulls)
const JOIN = .5 * 2.54 / 16.5;   // (CS2 maps: solids closer than this, half a Hammer unit — the mesh's 16-bit corners apart — are one wall)
// A bullet's way (bulletPath): stop — where it ends (Infinity: nothing within `far`), stopBox and stopNormal (the face it
// ends on, toward the shooter: impact marks lie on the wall — CS2 maps: the triangle's own), crossed — what it went
// through ({ t0, t1, mat, spent, b, nx, ny, nz }: entry, exit, material, budget spent by then, the box, the entry face's
// normal), embedded (below). Hand one in (bulletPath's `res`) to have it refilled: no garbage per shot.
export class BulletPath {
  constructor() { this.stop = Infinity; this.stopBox = null; this.stopNormal = null; this.crossed = []; this.embedded = null; this.budget = 0; Object.defineProperty(this, 'pool', { value: { n: [0, 0, 0], c: [] } }); }
  // Damage multiplier for a target at distance t: 1 in the open; less behind each thing the bullet went through.
  factor(t) { if (t >= this.stop) return 0; let s = 0; for (const c of this.crossed) if (c.t1 <= t + 1e-6) s = c.spent; return s ? Math.max(.15, 1 - s / (this.budget * 1.25)) : 1; }
}
// The line is gathered CHUNK units at a time, nearest first (a bullet stopped by the first wall never looks at the boxes
// past it: a 2 000-unit shot read every box along the line), into pooled records (no garbage per shot or pellet).
const CHUNK = 96, BPA = [], HP = [], HL = [], OUT = []; let hpN = 0;
function hitRec(b, t0, t1, nx, ny, nz) { let h = HP[hpN]; if (!h) HP[hpN] = h = { b: null, t0: 0, t1: 0, mat: '', nx: 0, ny: 0, nz: 0, paid: false }; hpN++; h.b = b; h.t0 = t0; h.t1 = t1; h.mat = b.mat; h.nx = nx; h.ny = ny; h.nz = nz; h.paid = false; return h; }
function sortFrom(L, k) { for (let i = k + 1; i < L.length; i++) { const h = L[i]; let j = i - 1; while (j >= k && L[j].t0 > h.t0) { L[j + 1] = L[j]; j--; } L[j + 1] = h; } }   // (insertion: a handful a chunk, stable)
let lastEnd = -Infinity, lastRec = null;   // (the fine walker's last solid and its end: bulletPath's, reset each call — a module function, no closure per shot)
function emit(b, t0, t1, nx, ny, nz) { OUT.push(lastRec = hitRec(b, t0, t1, nx, ny, nz)); lastEnd = t1; }
// coarse: boxes only, no fine phase (sound through walls, lab.js: its loss needs no exactness).
export function bulletPath(boxes, ox, oy, oz, dx, dy, dz, far = 2000, budget = 0, res = null, coarse = false) {
  const R = res || new BulletPath(), list = boxes.bullets || boxes, F = coarse ? null : list.fine || null, P = R.pool;
  R.stop = Infinity; R.stopBox = null; R.stopNormal = null; R.embedded = null; R.budget = budget; R.crossed.length = 0; hpN = 0; HL.length = 0; OUT.length = 0;
  // The fine walker (F): done up to wt; inside `depth` solids since s0 (entry normal sn, box sb); eye: nothing entered
  // since the eye (a solid left first is one the eye is in); lastEnd: the last solid's end.
  let spent = 0, i = 0, k = 0, wt = 0, depth = 0, sgn = 1, s0 = 0, snx = 0, sny = 0, snz = 0, sb = null, eye = true, runT0 = 0, runEnd = -Infinity; lastEnd = -Infinity; lastRec = null;   // (sgn −1: a solid whose faces are wound inside out — its entry looks like an exit; run: the wall being paid for, solids end to end)
  const step = list.grid ? CHUNK : far;
  for (let c0 = 0; c0 < far && R.stop === Infinity; c0 += step) { const c1 = Math.min(far, c0 + step), last = c1 >= far, from = HL.length;
    // The boxes the line enters in [c0, c1) (each once, by where it enters).
    for (const b of boxesAlong(list, ox + dx * c0, oz + dz * c0, ox + dx * c1, oz + dz * c1, 0, BPA)) { if (b.off || !slab(b, ox, oy, oz, dx, dy, dz, far, false) || ST1 <= 0 || ST0 >= far || ST0 < c0 || (ST0 >= c1 && !last)) continue;
      if (SAX < 0 && (b.mover != null || !F || noTri(F, b))) continue;   // the line starts inside it — a door shut on you, a ladder's column: passed, as the knife's ray passes it
      HL.push(hitRec(b, ST0, ST1, SAX === 0 ? -Math.sign(dx) : 0, SAX === 1 ? -Math.sign(dy) : 0, SAX === 2 ? -Math.sign(dz) : 0)); }
    sortFrom(HL, from);
    // Into OUT: movers (and every box without the fine phase) as they are; static boxes (CS2 maps) as the solids their
    // triangles say are in them.
    // A solid entered stays entered across gaps in the boxes until its triangles say it is left: a CS2 map's bullet boxes
    // are only its solids' shells (lines within 4 units of a face), so a building's inside has none — a gap is no exit.
    for (; i < HL.length; i++) { const h = HL[i]; if (!F || h.b.mover != null) { OUT.push(h); continue; }
      if (noTri(F, h.b)) { if (depth === 0 && h.t1 > lastEnd + FINE_EPS) { if (h.t0 < lastEnd) h.t0 = lastEnd; OUT.push(h); } continue; }   // (a surface the mesh lost: its box, past any solid already found; inside a solid being walked, nothing more)
      const A = Math.max(wt, h.t0 - FINE_PAD), E = Math.min(far, h.t1 + FINE_PAD); let t = A, any = false; if (A > wt + 1e-9) eye = false;   // (past the eye's own space: a solid left now was entered unseen)
      // A face toward the line just before the window, where no window looked (FINE_OUT back): the box starts short of
      // CS2's face — a line through a column's corner or grazing a slope — and the line is inside that solid from there.
      if (depth === 0 && A > wt + FINE_EPS) { const tb = entryBack(F, ox, oy, oz, dx, dy, dz, A + FINE_EPS, Math.max(wt, lastEnd, A - FINE_OUT), true); if (tb < Infinity) { any = true; eye = false; depth = 1; sgn = 1; s0 = tb; snx = FN[0]; sny = FN[1]; snz = FN[2]; sb = h.b; } }
      for (let g = 0; g < 32 && t < E; g++) { const tc = crossAt(F, ox, oy, oz, dx, dy, dz, t, E); if (tc === Infinity) break; any = true; if (FN[3]) { t = tc + FINE_EPS; continue; } const ent = entering(dx, dy, dz);
        if (depth > 0) { if (sgn > 0 ? ent : !ent) depth++; else if (--depth === 0) emit(sb, s0, tc, snx, sny, snz); }
        else if (ent) { eye = false; depth = 1; sgn = 1; s0 = tc; snx = FN[0]; sny = FN[1]; snz = FN[2]; sb = h.b; }
        else if (!eye) {   // left a solid never seen entered: its entry before every window so far (a box face standing over FINE_PAD behind CS2's, the solid's inside without boxes) — looked for back to the last solid's end, among the faces that stop sight, then among all (a hull whose entry face only grenades stop)
          const lo = Math.max(0, lastEnd); let tb = entryBack(F, ox, oy, oz, dx, dy, dz, tc, lo, true); if (tb === Infinity) tb = entryBack(F, ox, oy, oz, dx, dy, dz, tc, lo, false);
          if (tb < Infinity) emit(h.b, tb, tc, FN[0], FN[1], FN[2]);
          // Nothing entered since the last solid: that solid goes on to here — a hull overlapping it whose entry face is
          // one the tree reported once with its own (the same face twice) or a face the sight flags drop; 3–5 % of
          // crossings on the eight maps leave a solid no face entered. (Paid for already: the rest of it, end to end.)
          else if (lastRec) { if (!lastRec.paid) { lastRec.t1 = tc; lastEnd = tc; } else emit(lastRec.b, lastEnd, tc, lastRec.nx, lastRec.ny, lastRec.nz); }
          else { crossAt(F, ox, oy, oz, dx, dy, dz, t, E); depth = 1; sgn = -1; s0 = tc; snx = -FN[0]; sny = -FN[1]; snz = -FN[2]; sb = h.b; } }   // (no solid before it on the line: a hull wound inside out — its faces all the other way)
        // (else the line starts inside CS2's solid — a climber's eye in the column by a ladder: that solid is passed)
        t = tc + FINE_EPS; }
      // (nothing in the window: padding — or a face just past it, the box ending short of CS2's face and the solid's inside
      // without boxes: up to FINE_OUT on, unless the next window takes it)
      let end = E;
      if (!any && depth === 0) { const e2 = Math.min(far, E + FINE_OUT, i + 1 < HL.length ? HL[i + 1].t0 - FINE_PAD : Infinity), tc = e2 > E + FINE_EPS ? crossAt(F, ox, oy, oz, dx, dy, dz, E, e2) : Infinity;
        if (tc < Infinity && !FN[3] && entering(dx, dy, dz)) { any = true; eye = false; depth = 1; sgn = 1; s0 = tc; snx = FN[0]; sny = FN[1]; snz = FN[2]; sb = h.b; end = tc + FINE_EPS; } }
      if (!any && depth === 0 && h.t0 > 0 && h.t0 >= lastEnd - 1e-6) { const m = (h.t0 + h.t1) / 2; if (deepIn(h.b, ox + dx * m, oy + dy * m, oz + dz * m)) emit(h.b, h.t0, h.t1, h.nx, h.ny, h.nz); }
      if (end > wt) wt = end; }
    if (last && depth > 0) { emit(sb, s0, far, snx, sny, snz); depth = 0; }   // never left within the line (a one-sided face, or a solid past its end): solid to the end
    // Pay for what is settled (nothing still to come can start before lim), nearest first.
    sortFrom(OUT, k); const lim = last ? Infinity : Math.min(F ? c1 - FINE_PAD : c1, depth > 0 ? s0 : Infinity);
    // (CS2 maps: solids end to end are one wall — its whole thickness against SOLID_THICK, and a bullet it stops stops on its face)
    for (; k < OUT.length && OUT[k].t0 < lim; k++) { const h = OUT[k], th = h.t1 - h.t0, wall = !!F && h.b.mover == null; if (!wall || h.t0 - runEnd >= JOIN) runT0 = h.t0; runEnd = wall ? h.t1 : -Infinity;
      const cost = costOf(h.mat, th, h.t1 - runT0);
      if (spent + cost > budget) { let s = h; if (runT0 < h.t0) { while (R.crossed.length && R.crossed[R.crossed.length - 1].t0 >= runT0 - 1e-9) s = R.crossed.pop(); spent = R.crossed.length ? R.crossed[R.crossed.length - 1].spent : 0; }
        R.stop = s.t0; R.stopBox = s.b; const n = P.n; if (s.nx || s.ny || s.nz) { n[0] = s.nx; n[1] = s.ny; n[2] = s.nz; } else { n[0] = -dx; n[1] = -dy; n[2] = -dz; } R.stopNormal = n; break; }
      spent += cost; h.paid = true; const c = P.c[R.crossed.length] ??= { t0: 0, t1: 0, mat: '', spent: 0, b: null, nx: 0, ny: 0, nz: 0 }; c.t0 = h.t0; c.t1 = h.t1; c.mat = h.mat; c.spent = spent; c.b = h.b; const z = !(h.nx || h.ny || h.nz); c.nx = z ? -dx : h.nx; c.ny = z ? -dy : h.ny; c.nz = z ? -dz : h.nz; R.crossed.push(c); }
    // Still inside a solid, all before it paid: when what is left cannot cross even the part walked so far, the bullet
    // stops on its face now (a pen-0 shot at once; a thick wall without walking to its far side).
    if (R.stop === Infinity && depth > 0 && (k === OUT.length || OUT[k].t0 >= s0) && s0 - runEnd >= JOIN && spent + costOf(sb.mat, wt - s0) > budget) { R.stop = s0; R.stopBox = sb; const n = P.n; n[0] = snx; n[1] = sny; n[2] = snz; R.stopNormal = n; } }
  // A door, vent or pane set into a wall (its collision a 16-unit cell, so the thin mover sits inside the wall's box):
  // reached when it starts within MOVER_SLOP past where the wall stopped the bullet.
  if (R.stopBox && R.stopBox.mover == null) { const MV = list.grid ? boxes.movers : null;
    if (MV) { let best = Infinity; for (const b of MV) if (!b.off && slab(b, ox, oy, oz, dx, dy, dz, far, false) && SAX >= 0 && ST0 >= R.stop - 1e-6 && ST0 <= R.stop + MOVER_SLOP && ST0 < best) { best = ST0; R.embedded = b; } }
    else for (const h of HL) if (h.b.mover != null && h.t0 >= R.stop - 1e-6 && h.t0 <= R.stop + MOVER_SLOP) { R.embedded = h.b; break; } }
  return R;
}
export const MOVER_SLOP = 16 * 2.54 / 16.5 + .3;   // (one collision cell, 16 Hammer units, in game units)
// Spawn spots for a side ('t', 'ct', or 'dm' for every spawn): the map's points plus walkable spots around each
// (6 units apart), so a full team never stands inside each other. Coordinates relative to the arena centre.
const SLOT_R = 1.3, SLOT_STEP = 18 * 2.54 / 16.5, SLOT_TALL = 72 * 2.54 / 16.5, SLOT_RING = [[0, 0], [SLOT_R, 0], [-SLOT_R, 0], [0, SLOT_R], [0, -SLOT_R]], SN = [];   // (a body: arena-move MOVE.radius, CS2's 18-unit step and 72-unit height)
const slotCache = new WeakMap();   // (per map object: a map file's build never takes the built-in map's slots, which share its name)
export function spawnSlots(map, side) {
  let mine = slotCache.get(map); if (!mine) slotCache.set(map, mine = {}); if (mine[side]) return mine[side];
  const base = side === 't' ? map.t : side === 'ct' ? map.ct : map.spawns, boxes = mapBoxes(map, 0, 0), [sw, sd] = map.size, bounds = { minX: -sw / 2, maxX: sw / 2, minZ: -sd / 2, maxZ: sd / 2 }, out = [];
  // Classic maps: a spot on the spawn's own floor with floor all round it (their columns know the levels).
  const nav = map.nav, levelOf = (x, z, y) => nav ? (Number.isFinite(y) ? nav.floorAt(x, z, y + 9.7) : nav.floorAt(x, z)) : 0;   // (a spawn's own height when it has one: [x, z, y])
  const ground = (x, z, level) => !nav ? walkable(boxes, bounds, x, z, 1.8) : [[0, 0], [1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8]].every(([dx, dz]) => { const f = nav.floorAt(x + dx, z + dz, level); return Number.isFinite(f) && Math.abs(f - level) < 2.8; });
  // Room to stand (a body's width, 72 units tall over a step): no box in it; on a CS2 map none of its own geometry
  // either (its grenade mesh — a slot in a wall, under a stair or an awning is never handed out).
  const roomy = (x, z, level) => { const f = Number.isFinite(level) ? level : 0;
    for (const b of boxesNear(boxes, x - SLOT_R, z - SLOT_R, x + SLOT_R, z + SLOT_R, SN)) if (!b.off && b.y1 > f + SLOT_STEP && b.y0 < f + SLOT_TALL && x > b.minX - SLOT_R && x < b.maxX + SLOT_R && z > b.minZ - SLOT_R && z < b.maxZ + SLOT_R) return false;
    const NM = boxes.nadeMesh; if (NM) for (const [dx, dz] of SLOT_RING) if (NM.blocked(x + dx, f + SLOT_STEP, z + dz, x + dx, f + SLOT_TALL, z + dz, true)) return false;
    return true; };
  const free = (x, z, level = levelOf(x, z)) => ground(x, z, level) && roomy(x, z, level) && out.every(([a, b]) => Math.hypot(a - x, b - z) >= 5.5);
  const lv = l => Number.isFinite(l) ? +l.toFixed(2) : undefined;
  for (const [x, z, y] of base) { const level = levelOf(x, z, y); if (free(x, z, level)) out.push([x, z, lv(level)]); }
  for (const r of [6.5, 13]) for (const [x, z, y] of base) { const level = levelOf(x, z, y); for (let a = 0; a < 8; a++) { const px = x + Math.cos(a * Math.PI / 4) * r, pz = z + Math.sin(a * Math.PI / 4) * r; if (free(px, pz, level)) out.push([+px.toFixed(2), +pz.toFixed(2), lv(level)]); } }
  mine[side] = out; return out;
}
