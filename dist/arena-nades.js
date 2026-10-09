// Global Defensive grenades, run by the host: HE, flashbang, smoke and molotov. Shared with every client (the
// trajectory preview and the fire area use the same functions, so what you see is what the host does).
// State machine (one grenade, host side): air (flies, bounces) → effect (boom / pop / smoke / fire) → gone.
// Client side (weapons.js): equipped → pin pulled (press) → held → released (throw) → this.
//  · Throw: from your eye along your aim (a little upwards); left = full throw, right = short underhand, both = medium;
//    your running speed carries over. A full throw crosses most of the map.
//  · HE: explodes 1.8 s after the throw · up to 98 damage within 62 units, less with distance; walls and crates block it.
//  · Flashbang: pops after 1.6 s · each client works out how blinded it is (3D line of sight from the eye, facing,
//    distance; smoke and walls block); bots that see it can't shoot for a moment.
//  · Smoke: blooms when it stops rolling (or after 3.5 s) · an 18 s cloud, 44 units across, that no one sees through.
//  · Molotov: bursts on landing (or after 2.2 s) · 7 s of fire over up to 37 units around, spreading only over the
//    floor it landed on (walls and drops stop it); burns anyone standing in it.
import { EYE } from './weapons-data.js';
import { hurt, isDown } from './combat-logic.js';
import { lineOfSight, segmentClear } from './arena-maps.js';

const HU = 2.54 / 16.5;
export const NADES = {
  he: { id: 'he', name: 'HE Grenade', kind: 'nade', price: 300, fuse: 1800, dmg: 98, radius: 62 },
  flash: { id: 'flash', name: 'Flashbang', kind: 'nade', price: 200, fuse: 1600, radius: 2000 * HU },
  smoke: { id: 'smoke', name: 'Smoke Grenade', kind: 'nade', price: 300, fuse: 3500, radius: 44, lasts: 18000 },
  molotov: { id: 'molotov', name: 'Molotov', kind: 'nade', price: 400, fuse: 2200, radius: 37, lasts: 7000, dps: 40 },
};
export const NADE_IDS = Object.keys(NADES), MAX_NADES = 4, MAX_FLASH = 2;
// Flight: a full throw leaves at 230 units/s under 98 units/s² gravity (a 45° throw would carry ~540 units if nothing
// stopped it; the fuse and the map's walls do). Bounces keep 45 %.
export const GRAVITY = 98, THROW = 230, BOUNCE = .45, R = .35;
// Throw strength (CS2): left click alone = full throw, right click alone = short underhand, both = medium.
export const STRENGTH = { long: 1, medium: .5, short: .25 };
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export const nadesOf = l => Array.isArray(l?.nades) ? l.nades : [];
// Room for one more of this kind? (four in all, two flashbangs)
export const canCarry = (list, kind) => list.length < MAX_NADES && (kind !== 'flash' || list.filter(k => k === 'flash').length < MAX_FLASH) && !(kind !== 'flash' && list.includes(kind));
// The launch velocity for an aim (dx, dy, dz), a strength and the thrower's run velocity.
export function launch(a) { const n = Math.hypot(+a.dx || 0, +a.dy || 0, +a.dz || 0) || 1, k = STRENGTH[a.strength] ?? 1, dx = (+a.dx || 0) / n, dy = (+a.dy || 0) / n + .1, dz = (+a.dz || 0) / n;
  return { vx: dx * THROW * k + (+a.vx || 0), vy: dy * THROW * k, vz: dz * THROW * k + (+a.vz || 0) }; }

// Throw from the eye along (dx, dy, dz): one grenade leaves the loadout (never two for one throw).
export function throwNade(game, name, kind, a, now = Date.now()) {
  const l = game.arena.loadout[key(name)] ??= { primary: null, secondary: 'pistol' }, list = l.nades ??= [], i = list.indexOf(kind);
  if (!NADES[kind]) throw Error('Unknown grenade'); if (i < 0) throw Error('You have no ' + NADES[kind].name);
  const r = game.combat?.d?.round; if (r && ['freeze', 'over', 'warmup'].includes(r.phase) || game.arena?.lobby && !game.arena.lobby.started) throw Error('You can’t throw now');
  list.splice(i, 1); const C = game.combat; C.nades ??= []; C.nadeSeq = (C.nadeSeq || 0) + 1; const v = launch(a);
  C.nades.push({ id: 'n' + C.nadeSeq, kind, by: String(name).slice(0, 40), x: +a.x || 0, y: +a.y || EYE, z: +a.z || 0, ...v, at: now, phase: 'air', still: 0, strength: STRENGTH[a.strength] ? a.strength : 'long' });
  return 'Threw a ' + NADES[kind].name;
}
// Solid at (x, y, z)? (map boxes, the floor, the map edge)
function solid(boxes, bounds, x, y, z) {
  if (y < R) return true; if (bounds && (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ)) return true;
  for (const b of boxes) if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R && y > b.y0 - R && y < b.y1 + R) return true; return false;
}
// One physics step of a flying grenade (host tick and client preview alike). Returns true when it hit the floor.
export function stepNade(g, boxes, bounds, dt) {
  g.vy -= GRAVITY * dt; let hitFloor = false;
  for (const ax of ['x', 'y', 'z']) { const v = 'v' + ax, next = g[ax] + g[v] * dt, p = { x: g.x, y: g.y, z: g.z, [ax]: next };
    if (solid(boxes, bounds, p.x, p.y, p.z)) { if (ax === 'y' && g[v] < 0) hitFloor = true; g[v] = -g[v] * BOUNCE; if (ax === 'y') { g.vx *= .62; g.vz *= .62; } } else g[ax] = next; }
  // Rolling on the ground: friction slows it quickly (a grenade comes to rest a few units after landing).
  if (g.y < R + .2 && Math.abs(g.vy) < 12) { const k = Math.max(0, 1 - 5 * dt); g.vx *= k; g.vz *= k; }
  const speed = Math.hypot(g.vx, g.vy, g.vz); g.still = speed < 6 ? (g.still || 0) + dt : 0; return hitFloor;
}
// When does it go off? (age in ms since the throw)
const goesOff = (g, hitFloor, age) => { const N = NADES[g.kind]; return g.kind === 'molotov' ? hitFloor || age > N.fuse : g.kind === 'smoke' ? (g.still > .25 && age > 900) || age > N.fuse : age > N.fuse; };
// The path a throw will take (client preview): points every 50 ms until it goes off (≤ 4 s).
export function predictThrow(kind, a, boxes = [], bounds = null) {
  const g = { kind, x: +a.x, y: +a.y, z: +a.z, ...launch(a), still: 0 }, pts = [[g.x, g.y, g.z]];
  for (let t = 50; t <= 4000; t += 50) { const hit = stepNade(g, boxes, bounds, .05); pts.push([g.x, g.y, g.z]); if (goesOff(g, hit, t)) break; }
  return pts;
}
const people = (game, players) => { const out = []; for (const p of players) if (p.pose && !isDown(game, p.name)) out.push({ name: p.name, x: p.pose.x, z: p.pose.z, y: (p.pose.y || EYE) - EYE });
  for (const b of game.arena?.bots || []) if (!isDown(game, b.name)) out.push({ name: b.name, x: b.x, z: b.z, y: 0, bot: b }); return out; };
// Smoke on the line between two points? (2D at chest height, the cloud's core)
const smoked = (game, ax, az, bx, bz) => { for (const s of game.combat?.nades || []) if (s.phase === 'smoke') { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / L)); if (Math.hypot(ax + dx * t - s.x, az + dz * t - s.z) < NADES.smoke.radius * .8) return true; } return false; };
// Is the line between two points (at chest height) clear of walls and smoke?
export function clearView(game, boxes, ax, az, bx, bz, y = 8) { return lineOfSight(boxes, ax, az, bx, bz, y) && !smoked(game, ax, az, bx, bz); }
// Where a molotov burns: 3-unit cells within its radius, on the surface it landed on, reachable from the centre
// without crossing a wall (flood fill). Deterministic, so every client draws exactly the host's fire.
const fireCache = new Map();
export function fireCells(boxes, x, z, y = 0) {
  const k = [x.toFixed(1), z.toFixed(1), y.toFixed(1), boxes.length].join(); if (fireCache.has(k)) return fireCache.get(k);
  const S = 3, Rn = Math.ceil(NADES.molotov.radius / S), floorAt = (px, pz) => { let top = 0; for (const b of boxes) if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ && b.y0 <= y + 1.5 && b.y1 <= y + 1.5 && b.y1 > top) top = b.y1; return top; };
  const blocked = (px, pz) => boxes.some(b => px > b.minX - .5 && px < b.maxX + .5 && pz > b.minZ - .5 && pz < b.maxZ + .5 && b.y0 < y + 2 && b.y1 > y + 1.5);   // a wall or crate standing on this surface
  const seen = new Set(['0,0']), out = [], q = [[0, 0]];
  while (q.length) { const [i, j] = q.shift(), px = x + i * S, pz = z + j * S; if (Math.hypot(i, j) * S > NADES.molotov.radius || blocked(px, pz) || Math.abs(floorAt(px, pz) - y) > 1.5) continue; out.push([+px.toFixed(2), +pz.toFixed(2)]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (i + di) + ',' + (j + dj); if (!seen.has(kk) && Math.abs(i + di) <= Rn && Math.abs(j + dj) <= Rn) { seen.add(kk); q.push([i + di, j + dj]); } } }
  if (fireCache.size > 64) fireCache.clear(); fireCache.set(k, out); return out;
}
export const inFire = (cells, x, z) => cells.some(([cx, cz]) => Math.abs(cx - x) < 2.2 && Math.abs(cz - z) < 2.2);
// One host tick: move, bounce, set off, burn, clean up. Returns true when anything changed.
export function nadesTick(game, players, dt, now, { boxes = [], bounds = null } = {}) {
  const C = game.combat; if (!C?.nades?.length) return false; let changed = false;
  for (const g of C.nades) {
    const N = NADES[g.kind], age = now - g.at;
    if (g.phase === 'air') {
      const hitFloor = stepNade(g, boxes, bounds, dt); changed = true;
      if (!goesOff(g, hitFloor, age)) continue;
      g.phase = { he: 'boom', flash: 'pop', smoke: 'smoke', molotov: 'fire' }[g.kind]; g.firedAt = now; g.vx = g.vy = g.vz = 0;
      if (g.kind === 'molotov' || g.kind === 'smoke') g.y = groundUnder(boxes, g.x, g.z, g.y);
      if (g.kind === 'he') for (const t of people(game, players)) { const d = Math.hypot(t.x - g.x, t.z - g.z, t.y + 5 - g.y); if (d > N.radius || !(segmentClear(boxes, g.x, g.y + .5, g.z, t.x, t.y + 5, t.z) || segmentClear(boxes, g.x, g.y + .5, g.z, t.x, t.y + 9, t.z))) continue;
        hurt(game, g.by, t.name, { id: 'he', name: N.name }, Math.round(N.dmg * Math.pow(1 - d / N.radius, 1.3)), 'chest', now); }
      if (g.kind === 'flash') for (const t of people(game, players)) if (t.bot && Math.hypot(t.x - g.x, t.z - g.z) < N.radius && segmentClear(boxes, g.x, Math.max(1, g.y), g.z, t.x, 9.7, t.z) && !smoked(game, g.x, g.z, t.x, t.z)) t.bot.blindUntil = now + 2500;
    } else if (g.phase === 'fire') {
      // Burning: damage in steps of a quarter second to everyone standing in the flames (only where it burns).
      if (now - (g.burnAt || 0) >= 250) { g.burnAt = now; const cells = fireCells(boxes, g.x, g.z, g.y); for (const t of people(game, players)) if (Math.abs(t.y - g.y) < 4 && inFire(cells, t.x, t.z)) { hurt(game, g.by, t.name, { id: 'molotov', name: N.name }, Math.round(N.dps / 4), 'legs', now); changed = true; } }
    }
  }
  const n = C.nades.length;
  C.nades = C.nades.filter(g => g.phase === 'air' || now - g.firedAt < ({ boom: 1200, pop: 1200, smoke: NADES.smoke.lasts, fire: NADES.molotov.lasts }[g.phase] || 0));
  return changed || C.nades.length !== n;
}
function groundUnder(boxes, x, z, y) { let g = 0; for (const b of boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.y1 <= y + 1 && b.y1 > g) g = b.y1; return g; }
// How blinded a viewer is by a flash at (fx, fy, fz): 0…1 (1 = fully white), from distance and how directly they look
// at it; nothing through walls (3D, from the eye) or smoke. dirX/Y/Z: where the viewer looks.
export function flashAmount(boxes, fx, fy, fz, x, y, z, dirX, dirY, dirZ, game = null) {
  const dx = fx - x, dy = fy - y, dz = fz - z, d = Math.hypot(dx, dy, dz); if (d > NADES.flash.radius) return 0;
  if (!segmentClear(boxes, x, y, z, fx, Math.max(.6, fy), fz) || (game && smoked(game, x, z, fx, fz))) return 0;
  const facing = (dx * dirX + dy * dirY + dz * dirZ) / (d || 1), look = facing > .75 ? 1 : facing > .3 ? .8 : facing > -.2 ? .45 : .12;
  return Math.max(0, Math.min(1, look * (1 - Math.pow(d / NADES.flash.radius, 1.4)) * (d < 25 ? 1.15 : 1)));
}
