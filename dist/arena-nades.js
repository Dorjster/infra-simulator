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
// Flight, exactly CS2's (Source) grenade physics in our units (1 hammer unit = HU): a throw leaves at 675 u/s × the
// strength's power (long 1.0, medium 0.65, short 0.3), under 0.4 × 800 u/s² gravity; bounces keep 45 %.
export const GRAVITY = 320 * HU, THROW = 675 * HU, BOUNCE = .45, R = .35;
export const STRENGTH = { long: 1, medium: .5, short: .25 };   // (kept for old saves / validation)
// CS2's throw strength per mode (m_flThrowStrength): long = 1, medium (both buttons) = 0.5, short (right) = 0.
export const POWER = { long: 1, medium: .5, short: 0 };
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export const nadesOf = l => Array.isArray(l?.nades) ? l.nades : [];
// Room for one more of this kind? (four in all, two flashbangs)
export const canCarry = (list, kind) => list.length < MAX_NADES && (kind !== 'flash' || list.filter(k => k === 'flash').length < MAX_FLASH) && !(kind !== 'flash' && list.includes(kind));
// The launch velocity for an aim (dx, dy, dz), a strength and the thrower's run velocity (vx, vz), as CS2 does it:
// the aim pitch is remapped so a level aim throws 10° up (straight down stays down, straight up stays up), speed is
// 675 × (power × 0.7 + 0.3), and 1.25 × the thrower's velocity is added (running throws go further).
export function launch(a) {
  const n = Math.hypot(+a.dx || 0, +a.dy || 0, +a.dz || 0) || 1, dx = (+a.dx || 0) / n, dy = (+a.dy || 0) / n, dz = (+a.dz || 0) / n, P = POWER[a.strength] ?? 1;
  const down = -Math.asin(Math.max(-1, Math.min(1, dy))) * 180 / Math.PI, pitch = down >= 0 ? -10 + down * 100 / 90 : -10 + down * 80 / 90, up = -pitch * Math.PI / 180;
  const h = Math.hypot(dx, dz) || 1, cu = Math.cos(up), speed = THROW * (P * .7 + .3); const cl = v => Math.max(-60, Math.min(60, +v || 0));   /* run / jump speed only (never a launcher) */
  return { vx: dx / h * cu * speed + cl(a.vx) * 1.25, vy: Math.sin(up) * speed + cl(a.vy) * 1.25, vz: dz / h * cu * speed + cl(a.vz) * 1.25 }; }
// Where a throw starts: the eye, lower for weaker throws (CS2: power × 12 − 12 units).
export const throwStart = a => ({ x: +a.x || 0, y: (+a.y || EYE) + ((POWER[a.strength] ?? 1) * 12 - 12) * HU, z: +a.z || 0 });
// Throw from the eye along (dx, dy, dz): one grenade leaves the loadout (never two for one throw).
export function throwNade(game, name, kind, a, now = Date.now()) {
  const l = game.arena.loadout[key(name)] ??= { primary: null, secondary: 'pistol' }, list = l.nades ??= [], i = list.indexOf(kind);
  if (!NADES[kind]) throw Error('Unknown grenade'); if (i < 0) throw Error('You have no ' + NADES[kind].name);
  const r = game.combat?.d?.round; if (r && ['freeze', 'over', 'warmup'].includes(r.phase) || game.arena?.lobby && !game.arena.lobby.started || game.combat?.d?.paused) throw Error('You can’t throw now');
  list.splice(i, 1); const C = game.combat; C.nades ??= []; C.nadeSeq = (C.nadeSeq || 0) + 1; const v = launch(a);
  C.nades.push({ id: 'n' + C.nadeSeq, kind, by: String(name).slice(0, 40), ...throwStart(a), ...v, at: now, phase: 'air', still: 0, strength: STRENGTH[a.strength] ? a.strength : 'long' });
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
  const g = { kind, ...throwStart(a), ...launch(a), still: 0 }, pts = [[g.x, g.y, g.z]];
  for (let t = 50; t <= 4000; t += 50) { const hit = stepNade(g, boxes, bounds, .05); pts.push([g.x, g.y, g.z]); if (goesOff(g, hit, t)) break; }
  return pts;
}
const people = (game, players) => { const out = []; for (const p of players) if (p.pose && !isDown(game, p.name)) out.push({ name: p.name, x: p.pose.x, z: p.pose.z, y: (p.pose.y || EYE) - EYE });
  for (const b of game.arena?.bots || []) if (!isDown(game, b.name)) out.push({ name: b.name, x: b.x, z: b.z, y: 0, bot: b }); return out; };
// ── Smoke, one shared model (host rules, bots, radar, flashes and every client's view use it) ──
// A smoke is a volume: an ellipsoid column lifted a little off the ground, growing over SMOKE.grow ms after it pops
// and thinning over its last SMOKE.fade ms. Density is 1 in the core (inside 0.7 R), falling to 0 at the edge. An HE
// blast inside punches a hole (holeR) that is clear for holeOpen ms, then closes again over holeClose ms (the holes
// live in the host's grenade state, so every client opens the same hole at the same place and time). A sightline is
// blocked when it crosses more than SMOKE.block units of dense smoke — the same rule from outside, at the edge and
// from inside: deep inside you can't see out; at the edge you can.
export const SMOKE = { lift: .42, vert: .62, grow: 1800, fade: 3000, holeR: 15, holeOpen: 900, holeClose: 1600, block: 14 };
export function smokeShape(s, now) { const t = now - (s.firedAt || now), grow = 1 - Math.pow(1 - Math.min(1, Math.max(0, t) / SMOKE.grow), 3), fade = Math.max(0, Math.min(1, (NADES.smoke.lasts - t) / SMOKE.fade));
  return { r: NADES.smoke.radius * (.35 + .65 * grow), dens: fade, cy: (s.y || 0) + NADES.smoke.radius * SMOKE.lift }; }
// How open the smoke's HE holes are at a point: 0 (untouched) … 1 (fully cleared).
export function holeOpen(s, x, y, z, now) { let cut = 0; for (const h of s.holes || []) { const age = now - h.at, open = age < SMOKE.holeOpen ? 1 : age < SMOKE.holeOpen + SMOKE.holeClose ? 1 - (age - SMOKE.holeOpen) / SMOKE.holeClose : 0; if (open <= 0) continue;
    const d = Math.hypot(x - h.x, (y - h.y) * .8, z - h.z); if (d < SMOKE.holeR) cut = Math.max(cut, open * (1 - (d / SMOKE.holeR) ** 2)); } return cut; }
// Smoke density at a point (0 … 1, summed over clouds, capped).
export const hostNow = game => game?.combat?.clock ?? Date.now();   // the host's clock (stamped each tick; clients keep an offset)
export function smokeDensity(game, x, y, z, now = hostNow(game)) { let d = 0; for (const s of game.combat?.nades || []) { if (s.phase !== 'smoke') continue; const S = smokeShape(s, now), q = Math.hypot(x - s.x, z - s.z, (y - S.cy) / SMOKE.vert) / S.r; if (q >= 1) continue;
    d += (q < .7 ? 1 : (1 - q) / .3) * S.dens * (1 - holeOpen(s, x, y, z, now)); if (d >= 1) return 1; } return d; }
// Units of dense smoke between two points (3D), sampled every 1.5 units where the segment passes a cloud.
export function smokeDepth(game, ax, ay, az, bx, by, bz, now = hostNow(game)) {
  let depth = 0; const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1;
  for (const s of game.combat?.nades || []) { if (s.phase !== 'smoke') continue; const S = smokeShape(s, now), t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (S.cy - ay) * dy + (s.z - az) * dz) / (L * L)));
    if (Math.hypot(ax + dx * t - s.x, (ay + dy * t - S.cy) / SMOKE.vert, az + dz * t - s.z) > S.r) continue;   // misses this cloud
    const n = Math.ceil(L / 1.5); for (let i = 0; i <= n; i++) { const u = i / n, x = ax + dx * u, y = ay + dy * u, z = az + dz * u, q = Math.hypot(x - s.x, z - s.z, (y - S.cy) / SMOKE.vert) / S.r; if (q < 1) depth += (q < .7 ? 1 : (1 - q) / .3) * S.dens * (1 - holeOpen(s, x, y, z, now)) * L / n; } }
  return depth;
}
export const smokeBlocks = (game, ax, ay, az, bx, by, bz, now = hostNow(game)) => smokeDepth(game, ax, ay, az, bx, by, bz, now) > SMOKE.block;
const smoked = (game, ax, az, bx, bz, y = 8, now = hostNow(game)) => smokeBlocks(game, ax, y, az, bx, y, bz, now);
// Is the line between two points (at chest height) clear of walls and smoke?
export function clearView(game, boxes, ax, az, bx, bz, y = 8, now = hostNow(game)) { return lineOfSight(boxes, ax, az, bx, bz, y) && !smoked(game, ax, az, bx, bz, y, now); }
// Fire and smoke: a smoke that pops over a fire puts the fire out; a molotov that lands in smoke fizzles. A put-out
// fire stays in the state as 'out' briefly (steam), then leaves; nothing re-ignites it.
const covers = (s, f) => Math.hypot(s.x - f.x, s.z - f.z) < NADES.smoke.radius + NADES.molotov.radius * .4 && Math.abs((s.y || 0) - (f.y || 0)) < 8;
export function putOut(f, now) { f.phase = 'out'; f.outAt = now; f.firedAt = now; }
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
  const C = game.combat; if (C) C.clock = now; if (!C?.nades?.length) return false; let changed = false;
  for (const g of C.nades) {
    const N = NADES[g.kind], age = now - g.at;
    if (g.phase === 'air') {
      const hitFloor = stepNade(g, boxes, bounds, dt); changed = true;
      if (!goesOff(g, hitFloor, age)) continue;
      g.phase = { he: 'boom', flash: 'pop', smoke: 'smoke', molotov: 'fire' }[g.kind]; g.firedAt = now; g.vx = g.vy = g.vz = 0;
      if (g.kind === 'molotov' || g.kind === 'smoke') g.y = groundUnder(boxes, g.x, g.z, g.y);
      if (g.kind === 'molotov' && C.nades.some(s => s.phase === 'smoke' && covers(s, g))) putOut(g, now);   // into smoke: it fizzles
      if (g.kind === 'smoke') for (const f of C.nades) if (f.phase === 'fire' && covers(g, f)) putOut(f, now);   // smoke over fire: out
      if (g.kind === 'he') for (const s of C.nades) if (s.phase === 'smoke' && Math.hypot(s.x - g.x, s.z - g.z) < smokeShape(s, now).r + SMOKE.holeR * .6) { s.holes = [...(s.holes || []), { x: +g.x.toFixed(2), y: +g.y.toFixed(2), z: +g.z.toFixed(2), at: now }].slice(-3); }   // a blast opens the smoke for a moment
      if (g.kind === 'he') for (const t of people(game, players)) { const d = Math.hypot(t.x - g.x, t.z - g.z, t.y + 5 - g.y); if (d > N.radius || !(segmentClear(boxes, g.x, g.y + .5, g.z, t.x, t.y + 5, t.z) || segmentClear(boxes, g.x, g.y + .5, g.z, t.x, t.y + 9, t.z))) continue;
        hurt(game, g.by, t.name, { id: 'he', name: N.name }, Math.round(N.dmg * Math.pow(1 - d / N.radius, 1.3)), 'chest', now); }
      if (g.kind === 'flash') for (const t of people(game, players)) if (t.bot && Math.hypot(t.x - g.x, t.z - g.z) < N.radius && segmentClear(boxes, g.x, Math.max(1, g.y), g.z, t.x, 9.7, t.z) && !smoked(game, g.x, g.z, t.x, t.z)) t.bot.blindUntil = now + 2500;
    } else if (g.phase === 'fire') {
      // Burning: damage in steps of a quarter second to everyone standing in the flames (only where it burns).
      if (now - (g.burnAt || 0) >= 250) { g.burnAt = now; const cells = fireCells(boxes, g.x, g.z, g.y); for (const t of people(game, players)) if (Math.abs(t.y - g.y) < 4 && inFire(cells, t.x, t.z)) { hurt(game, g.by, t.name, { id: 'molotov', name: N.name }, Math.round(N.dps / 4), 'legs', now); changed = true; } }
    }
  }
  const n = C.nades.length;
  C.nades = C.nades.filter(g => g.phase === 'air' || now - g.firedAt < ({ boom: 1200, pop: 1200, smoke: NADES.smoke.lasts, fire: NADES.molotov.lasts, out: 900 }[g.phase] || 0));
  return changed || C.nades.length !== n;
}
function groundUnder(boxes, x, z, y) { let g = 0; for (const b of boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.y1 <= y + 1 && b.y1 > g) g = b.y1; return g; }
// How blinded a viewer is by a flash at (fx, fy, fz): 0…1 (1 = fully white), from distance and how directly they look
// at it; nothing through walls (3D, from the eye) or smoke. dirX/Y/Z: where the viewer looks.
export function flashAmount(boxes, fx, fy, fz, x, y, z, dirX, dirY, dirZ, game = null) {
  const dx = fx - x, dy = fy - y, dz = fz - z, d = Math.hypot(dx, dy, dz); if (d > NADES.flash.radius) return 0;
  if (!segmentClear(boxes, x, y, z, fx, Math.max(.6, fy), fz) || (game && smokeBlocks(game, x, y, z, fx, Math.max(.6, fy), fz))) return 0;
  const facing = (dx * dirX + dy * dirY + dz * dirZ) / (d || 1), look = facing > .75 ? 1 : facing > .3 ? .8 : facing > -.2 ? .45 : .12;
  return Math.max(0, Math.min(1, look * (1 - Math.pow(d / NADES.flash.radius, 1.4)) * (d < 25 ? 1.15 : 1)));
}
