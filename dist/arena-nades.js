// Global Defensive grenades (CS2-style), run by the host: HE, flashbang, smoke and molotov. A throw puts the
// grenade on game.combat.nades (streamed with HP and kills); each host tick moves it (gravity, bounces off walls,
// crates and the floor) and sets it off:
//  · HE: explodes 1.6 s after the throw · up to 98 damage, less with distance, walls and crates block it.
//  · Flashbang: pops after 1.6 s · each client works out how blinded it is (line of sight, facing); bots that see it
//    can't shoot for a moment.
//  · Smoke: blooms once it stops rolling (or after 3 s) · an 18 s cloud you can't see through — bots neither.
//  · Molotov: bursts on the first floor hit (or after 2 s) · 7 s of fire that burns anyone standing in it.
// Values are CS2's, in game units (1 HU ≈ 0.154 units).
import { EYE } from './weapons-data.js';
import { hurt, isDown } from './combat-logic.js';
import { lineOfSight } from './arena-maps.js';

const HU = 2.54 / 16.5;
export const NADES = {
  he: { id: 'he', name: 'HE Grenade', kind: 'nade', price: 300, fuse: 1600, dmg: 98, radius: 350 * HU },
  flash: { id: 'flash', name: 'Flashbang', kind: 'nade', price: 200, fuse: 1600, radius: 2000 * HU },
  smoke: { id: 'smoke', name: 'Smoke Grenade', kind: 'nade', price: 300, fuse: 3000, radius: 144 * HU, lasts: 18000 },
  molotov: { id: 'molotov', name: 'Molotov', kind: 'nade', price: 400, fuse: 2000, radius: 120 * HU, lasts: 7000, dps: 40 },
};
export const NADE_IDS = Object.keys(NADES), MAX_NADES = 4, MAX_FLASH = 2;
const GRAVITY = 800 * HU * .4, THROW = 750 * HU * .9, BOUNCE = .45, R = .35;
// Throw strength (CS2): left click alone = full throw, right click alone = short underhand, both = medium.
export const STRENGTH = { long: 1, medium: .62, short: .3 };
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
export const nadesOf = l => Array.isArray(l?.nades) ? l.nades : [];
// Room for one more of this kind? (four in all, two flashbangs)
export const canCarry = (list, kind) => list.length < MAX_NADES && (kind !== 'flash' || list.filter(k => k === 'flash').length < MAX_FLASH) && !(kind !== 'flash' && list.includes(kind));

// Throw from the eye along (dx, dy, dz) — aimed a little upwards like CS2; your running speed carries over.
export function throwNade(game, name, kind, a, now = Date.now()) {
  const l = game.arena.loadout[key(name)] ??= { primary: null, secondary: 'pistol' }, list = l.nades ??= [], i = list.indexOf(kind);
  if (!NADES[kind]) throw Error('Unknown grenade'); if (i < 0) throw Error('You have no ' + NADES[kind].name);
  const n = Math.hypot(+a.dx || 0, +a.dy || 0, +a.dz || 0) || 1, dx = (+a.dx || 0) / n, dy = (+a.dy || 0) / n + .1, dz = (+a.dz || 0) / n, k = STRENGTH[a.strength] ?? 1;
  list.splice(i, 1); const C = game.combat; C.nades ??= []; C.nadeSeq = (C.nadeSeq || 0) + 1;
  C.nades.push({ id: 'n' + C.nadeSeq, kind, by: String(name).slice(0, 40), x: +a.x || 0, y: +a.y || EYE, z: +a.z || 0, vx: dx * THROW * k + (+a.vx || 0), vy: dy * THROW * k, vz: dz * THROW * k + (+a.vz || 0), at: now, phase: 'air', still: 0 });
  return 'Threw a ' + NADES[kind].name;
}
// Solid at (x, y, z)? (map boxes, the floor, the map edge)
function solid(boxes, bounds, x, y, z) {
  if (y < R) return true; if (bounds && (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ)) return true;
  for (const b of boxes) if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R && y > b.y0 - R && y < b.y1 + R) return true; return false;
}
const people = (game, players) => { const out = []; for (const p of players) if (p.pose && !isDown(game, p.name)) out.push({ name: p.name, x: p.pose.x, z: p.pose.z, y: (p.pose.y || EYE) - EYE });
  for (const b of game.arena?.bots || []) if (!isDown(game, b.name)) out.push({ name: b.name, x: b.x, z: b.z, y: 0, bot: b }); return out; };
// Is the line between two points (at chest height) clear of walls and smoke?
export function clearView(game, boxes, ax, az, bx, bz, y = 8) {
  if (!lineOfSight(boxes, ax, az, bx, bz, y)) return false;
  for (const s of game.combat?.nades || []) if (s.phase === 'smoke') { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / L)); if (Math.hypot(ax + dx * t - s.x, az + dz * t - s.z) < NADES.smoke.radius * .8) return false; }
  return true;
}
// One host tick: move, bounce, set off, burn, clean up. Returns true when anything changed.
export function nadesTick(game, players, dt, now, { boxes = [], bounds = null } = {}) {
  const C = game.combat; if (!C?.nades?.length) return false; let changed = false;
  for (const g of C.nades) {
    const N = NADES[g.kind], age = now - g.at;
    if (g.phase === 'air') {
      g.vy -= GRAVITY * dt; let hitFloor = false;
      for (const ax of ['x', 'y', 'z']) { const v = 'v' + ax, next = g[ax] + g[v] * dt, p = { x: g.x, y: g.y, z: g.z, [ax]: next };
        if (solid(boxes, bounds, p.x, p.y, p.z)) { if (ax === 'y' && g.vy < 0) hitFloor = true; g[v] = -g[v] * BOUNCE; if (ax === 'y') { g.vx *= .8; g.vz *= .8; } } else g[ax] = next; }
      changed = true; const speed = Math.hypot(g.vx, g.vy, g.vz); g.still = speed < 6 ? g.still + dt : 0;
      const go = g.kind === 'molotov' ? hitFloor || age > N.fuse : g.kind === 'smoke' ? (g.still > .25 && age > 900) || age > N.fuse : age > N.fuse;
      if (!go) continue;
      g.phase = { he: 'boom', flash: 'pop', smoke: 'smoke', molotov: 'fire' }[g.kind]; g.firedAt = now; g.vx = g.vy = g.vz = 0;
      if (g.kind === 'molotov' || g.kind === 'smoke') { let y = g.y; for (const b of boxes) if (g.x > b.minX && g.x < b.maxX && g.z > b.minZ && g.z < b.maxZ && b.y1 <= g.y + 1 && b.y1 > y - 50) y = b.y1; g.y = Math.min(g.y, y); if (g.kind === 'molotov') g.y = groundUnder(boxes, g.x, g.z, g.y); }
      if (g.kind === 'he') for (const t of people(game, players)) { const d = Math.hypot(t.x - g.x, t.z - g.z, t.y + 5 - g.y); if (d > N.radius || !lineOfSight(boxes, g.x, g.z, t.x, t.z, Math.max(1, Math.min(g.y, t.y + 5)))) continue;
        hurt(game, g.by, t.name, { id: 'he', name: N.name }, Math.round(N.dmg * Math.pow(1 - d / N.radius, 1.5)), 'chest', now); }
      if (g.kind === 'flash') for (const t of people(game, players)) if (t.bot && Math.hypot(t.x - g.x, t.z - g.z) < N.radius && lineOfSight(boxes, g.x, g.z, t.x, t.z, Math.max(1, g.y))) t.bot.blindUntil = now + 2500;
    } else if (g.phase === 'fire') {
      // Burning: damage in steps of a quarter second to everyone standing in the flames.
      if (now - (g.burnAt || 0) >= 250) { g.burnAt = now; for (const t of people(game, players)) if (Math.hypot(t.x - g.x, t.z - g.z) < N.radius && Math.abs(t.y - g.y) < 4) { hurt(game, g.by, t.name, { id: 'molotov', name: N.name }, Math.round(N.dps / 4), 'legs', now); changed = true; } }
    }
  }
  const n = C.nades.length;
  C.nades = C.nades.filter(g => g.phase === 'air' || now - g.firedAt < ({ boom: 1200, pop: 1200, smoke: NADES.smoke.lasts, fire: NADES.molotov.lasts }[g.phase] || 0));
  return changed || C.nades.length !== n;
}
function groundUnder(boxes, x, z, y) { let g = 0; for (const b of boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.y1 <= y + 1 && b.y1 > g) g = b.y1; return g; }
// How blinded a viewer is by a flash at (fx, fy, fz): 0…1 (1 = fully white), from distance and how directly they
// look at it; nothing through walls. dirX/Y/Z: where the viewer looks.
export function flashAmount(boxes, fx, fy, fz, x, y, z, dirX, dirY, dirZ) {
  const dx = fx - x, dy = fy - y, dz = fz - z, d = Math.hypot(dx, dy, dz); if (d > NADES.flash.radius || !lineOfSight(boxes, x, z, fx, fz, Math.max(1, Math.min(y, fy)))) return 0;
  const facing = (dx * dirX + dy * dirY + dz * dirZ) / (d || 1), look = facing > .5 ? 1 : facing > -.2 ? .55 : .15;
  return Math.max(0, Math.min(1, look * (1 - Math.pow(d / NADES.flash.radius, 1.5))));
}
