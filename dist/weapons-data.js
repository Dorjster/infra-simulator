// Weapons for Payday (play money, cartoon office shoot-outs). Shared by the host's rules (damage, range,
// fire rate) and the client (models, sound, recoil). Prices were set in US$ and convert to tögrög.
import { mnt } from './money.js';

// dmg: per bullet (pellets × dmg for the shotgun); rateMs: time between shots; auto: hold to fire;
// range: game units (≈0.165 m each); spread: radians of random aim cone; head: head-shot multiplier.
export const WEAPONS = [
  { id: 'pistol', name: '9mm Pistol', kind: 'pistol', usd: 25000, dmg: 22, rateMs: 300, auto: false, range: 200, spread: .008, head: 2, mag: 15 },
  { id: 'deagle', name: '.50 Hand Cannon', kind: 'pistol', usd: 40000, dmg: 48, rateMs: 620, auto: false, range: 240, spread: .012, head: 2, mag: 7 },
  { id: 'smg', name: 'Compact SMG', kind: 'smg', usd: 60000, dmg: 15, rateMs: 85, auto: true, range: 180, spread: .03, head: 1.6, mag: 30 },
  { id: 'shotgun', name: 'Pump Shotgun', kind: 'shotgun', usd: 75000, dmg: 13, pellets: 8, rateMs: 900, auto: false, range: 60, spread: .085, head: 1.5, mag: 8 },
  { id: 'ak', name: 'Assault Rifle', kind: 'rifle', usd: 100000, dmg: 30, rateMs: 110, auto: true, range: 400, spread: .022, head: 2.5, mag: 30 },
  { id: 'm4', name: 'Carbine', kind: 'rifle', usd: 110000, dmg: 26, rateMs: 95, auto: true, range: 400, spread: .016, head: 2.5, mag: 30 },
  { id: 'sniper', name: 'Sniper Rifle', kind: 'sniper', usd: 180000, dmg: 95, rateMs: 1450, auto: false, range: 1000, spread: .002, head: 2, mag: 5, zoom: true },
  { id: 'lmg', name: 'Light Machine Gun', kind: 'lmg', usd: 250000, dmg: 23, rateMs: 75, auto: true, range: 350, spread: .035, head: 2, mag: 100 },
].map(w => ({ ...w, price: mnt(w.usd) }));
// Darja's chrome hand cannon: her own, not for sale.
export const DARJA_GUN = { id: 'cannon', name: "Darja's Hand Cannon", kind: 'pistol', usd: 0, price: 0, dmg: 40, rateMs: 450, auto: false, range: 240, spread: .01, head: 2, mag: 9 };
export const weaponById = id => id === 'cannon' ? DARJA_GUN : WEAPONS.find(w => w.id === id) || null;
export const MAX_HP = 100, RESPAWN_MS = 5000;
// Player capsule (game units): feet at pose.y − eye height; heads above HEAD_Y count as head shots.
export const EYE = 9.7, BODY_R = 1.5, BODY_H = 10.6, HEAD_Y = 8.6;
