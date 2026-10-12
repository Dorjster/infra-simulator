// Global Defensive player models that ship with the game (original designs): the player's own character in the
// side's gear — Terrorists in a tan jacket, chest rig and balaclava; Counter-Terrorists in a navy jacket, plate
// carrier and combat helmet with goggles. Same body, rig and gun hold as everywhere else, so hit boxes (computed
// from the pose, never from the model) don't change. Imported CS 1.6 characters, when present, take priority.
import { createAvatar } from './avatar.js';

export const SIDE_LOOK = { t: { color: 0x8c7448, hat: 'balaclava', outfit: 'rig' }, ct: { color: 0x34465e, hat: 'combat', outfit: 'plate' } };
const hash = s => { let h = 7; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
// Deathmatch has no sides: a stable pick per name, so everyone sees the same gear on the same player.
export const sideOf = (name, team) => team === 't' || team === 'ct' ? team : hash(String(name || '').trim().toLowerCase()) % 2 ? 'ct' : 't';

// The dress interface multiplayer.js expects: { g, update(dt, { speed, crouch, dead, aim }), setWeapon(id), dispose() }.
export function makeSoldier(p, team) {
  const L = SIDE_LOOK[team] || SIDE_LOOK.t, a = createAvatar({ color: L.color, name: '', face: p.pose?.face, skin: p.pose?.skin, hat: L.hat, outfit: L.outfit });
  let fall = 0;
  return {
    g: a.g, team,
    update(dt, s) { a.update(dt, { speed: s.speed, crouch: s.crouch, gun: !!s.aim && !s.dead }); fall += ((s.dead ? 1 : 0) - fall) * Math.min(1, dt * 7); a.g.rotation.x = -fall * Math.PI / 2; a.g.position.y = fall * 1.3; },
    setWeapon(id) { a.setWeapon(id || 'cannon'); },
    dispose() { a.dispose(); },
  };
}
