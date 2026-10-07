// Weapons for Payday (play money, cartoon office shoot-outs). Shared by the host's rules (damage, range,
// fire rate) and the client (models, sound, recoil). Prices are approximate real-life shop prices (US civilian market, 2026) converted to tögrög.
import { mnt } from './money.js';

// dmg: per bullet (pellets × dmg for the shotgun); rateMs: time between shots; auto: hold to fire;
// range: game units (≈0.165 m each); spread: radians of random aim cone; head: head-shot multiplier.
// Real firearms (names and approximate shop prices); ids stay as before so saved arsenals keep working.
// mag: rounds per magazine · reloadMs: reload time · recoil: aim kick per shot in radians (up, random side).
export const WEAPONS = [
  { id: 'pistol', name: 'Glock-18', kind: 'pistol', usd: 550, dmg: 22, rateMs: 150, auto: false, range: 200, spread: .009, head: 2, mag: 20, reloadMs: 1700, recoil: [.012, .004] },
  { id: 'deagle', name: 'Desert Eagle', kind: 'pistol', usd: 2000, dmg: 48, rateMs: 420, auto: false, range: 240, spread: .012, head: 2.5, mag: 7, reloadMs: 2100, recoil: [.045, .012] },
  { id: 'smg', name: 'MP5', kind: 'smg', usd: 2800, dmg: 16, rateMs: 75, auto: true, range: 180, spread: .022, head: 1.6, mag: 30, reloadMs: 2300, recoil: [.007, .005] },
  { id: 'shotgun', name: 'Nova (pump)', kind: 'shotgun', usd: 450, dmg: 13, pellets: 9, rateMs: 880, auto: false, range: 60, spread: .085, head: 1.5, mag: 8, reloadMs: 3000, recoil: [.05, .01] },
  { id: 'ak', name: 'AK-47', kind: 'rifle', usd: 1100, dmg: 30, rateMs: 100, auto: true, range: 400, spread: .016, head: 2.5, mag: 30, reloadMs: 2500, recoil: [.014, .008] },
  { id: 'm4', name: 'M4A1', kind: 'rifle', usd: 1200, dmg: 26, rateMs: 90, auto: true, range: 400, spread: .012, head: 2.5, mag: 30, reloadMs: 3100, recoil: [.010, .006] },
  { id: 'sniper', name: 'AWP', kind: 'sniper', usd: 6500, dmg: 100, rateMs: 1470, auto: false, range: 1000, spread: .002, head: 2, mag: 10, reloadMs: 3600, recoil: [.06, .01], zoom: true },
  { id: 'lmg', name: 'M249', kind: 'lmg', usd: 9000, dmg: 24, rateMs: 80, auto: true, range: 350, spread: .03, head: 2, mag: 100, reloadMs: 5700, recoil: [.009, .009] },
].map(w => ({ ...w, price: mnt(w.usd) }));
// Darja's chrome hand cannon: her own, not for sale.
export const DARJA_GUN = { id: 'cannon', name: "Darja's Hand Cannon", kind: 'pistol', usd: 0, price: 0, dmg: 40, rateMs: 450, auto: false, range: 240, spread: .01, head: 2, mag: 9, reloadMs: 1900, recoil: [.035, .01] };
export const weaponById = id => id === 'cannon' ? DARJA_GUN : WEAPONS.find(w => w.id === id) || null;
export const MAX_HP = 100, RESPAWN_MS = 5000;
// Player capsule (game units): feet at pose.y − eye height; heads above HEAD_Y count as head shots.
export const EYE = 9.7, BODY_R = 1.5, BODY_H = 10.6, HEAD_Y = 8.6;
