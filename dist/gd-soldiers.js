// Global Defensive player models that ship with the game (original designs): the player's own character in the
// side's gear — Terrorists in a tan jacket, chest rig and balaclava; Counter-Terrorists in a navy jacket, plate
// carrier and combat helmet with goggles. Same body, rig and gun hold as everywhere else, so hit boxes (computed
// from the pose, never from the model) don't change. Imported CS 1.6 characters, when present, take priority.
import { createAvatar } from './avatar.js';
import { knifeFor } from './weapon-models.js';
import { weaponById } from './weapons-data.js';
import * as THREE from './three.module.js';
import { createRig, soldierDef, startRagdoll, updateRagdoll, stopRagdoll, deathOf, deathCtx, trackVy } from './gd-ragdoll.js';   // (v53 DEATH: the death ragdoll on the soldier's own rig)
// The hold, CS2's convention as far as the soldiers' rig allows (the CS2 agents have CS2's own: cs2-agents.js): every
// pistol held short, up in the hand (the avatar's own default only for its Glock / Deagle); knives with the blade tipped
// up 52° as CS2's default knife idles carry it (idle_default_ct / _t: the blade along (.24, .79, .57) — asin .79 ≈ 52°,
// tools/export-cs2-holds.mjs holds-truth). Rifles stay along the forearm, muzzle forward, as before.
const KNIFE_HOLD = { pitch: 52 * Math.PI / 180 }, PISTOL_HOLD = { short: true };

export const SIDE_LOOK = { t: { color: 0x8c7448, hat: 'balaclava', outfit: 'rig' }, ct: { color: 0x34465e, hat: 'combat', outfit: 'plate' } };
const hash = s => { let h = 7; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
// Deathmatch has no sides: a stable pick per name, so everyone sees the same gear on the same player.
export const sideOf = (name, team) => team === 't' || team === 'ct' ? team : hash(String(name || '').trim().toLowerCase()) % 2 ? 'ct' : 't';

// The dress interface multiplayer.js expects: { g, update(dt, { speed, crouch, dead, aim }), setWeapon(id), setSkin(skin), dispose() }.
export function makeSoldier(p, team) {
  const L = SIDE_LOOK[team] || SIDE_LOOK.t, a = createAvatar({ color: L.color, name: '', face: p.pose?.face, skin: p.pose?.skin, hat: L.hat, outfit: L.outfit });
  let fall = 0;
  // (v53 DEATH) The death ragdoll on the soldier's parts (gd-ragdoll.js SOLDIER: torso, head, upper arms, forearms, legs —
  // our own limits), made now; started on the first dead update, stopped when back. Without a slot (the cap): the old fall.
  const P = a.parts, parts = P ? { torso: P.torso, head: P.head, armL: P.arms?.L, elbowL: P.elbows?.L, armR: P.arms?.R, elbowR: P.elbows?.R, legL: P.legs?.L, legR: P.legs?.R } : null;
  let rag = null; try { if (parts && Object.values(parts).every(Boolean)) rag = createRig(soldierDef(parts), n => parts[n], [parts.torso, parts.head, parts.armL, parts.elbowL, parts.armR, parts.elbowR, parts.legL, parts.legR], THREE); } catch (e) { console.warn('ragdoll', e?.message); }
  let ragOn = false, ragTried = false, ragHid = false; const VY = new Float64Array(2);
  const ELB = [P?.elbows?.L, P?.elbows?.R].filter(Boolean);   // (made once: held() runs every frame of a dead soldier — nothing allocated there)
  const held = on => { for (let k = 0; k < ELB.length; k++) { const ch = ELB[k].children; for (let i = 0; i < ch.length; i++) if (ch[i].userData?.held) ch[i].visible = on; } };   // (the gun in the hand: hidden while lying — it drops)
  return {
    g: a.g, team,
    update(dt, s) {
      if (rag && !s.dead) trackVy(VY, a.g, dt);   // (v53 DEATH r2: its vertical speed, for the ragdoll's momentum)
      if (rag) { if (s.dead) { if (!ragTried) { ragTried = true; fall = 0; a.g.rotation.x = 0; a.g.position.y = 0; ragOn = startRagdoll(rag, deathOf(p?.name), s.vx || 0, Number.isFinite(s.vy) ? s.vy : VY[1], s.vz || 0, deathCtx()); } } else if (ragTried) { ragTried = false; if (ragOn) { stopRagdoll(rag); ragOn = false; if (ragHid) { ragHid = false; a.g.visible = true; } } } }
      if (ragOn) { held(false); updateRagdoll(rag); if (ragHid !== rag.catching) { ragHid = rag.catching; a.g.visible = !ragHid; } return; }   // (not drawn while a late body catches up: gd-ragdoll.js — changed only on its edges, so nobody else's hiding is undone)
      a.update(dt, { speed: s.speed, crouch: s.crouch, gun: !!s.aim && !s.dead, act: s.act }); fall += ((s.dead ? 1 : 0) - fall) * Math.min(1, dt * 7); a.g.rotation.x = -fall * Math.PI / 2; a.g.position.y = fall * 1.3; },
    setWeapon(id, knife = null) { const w = id ? weaponById(id) : null; a.setWeapon(knifeFor(id || 'cannon', team, knife), w?.kind === 'knife' ? KNIFE_HOLD : w?.kind === 'pistol' ? PISTOL_HOLD : null); },   // (knife: the one this player chose, drawn when its model is in; the hold: CS2's convention, below)
    setSkin(sk) { a.setSkin(sk); },
    get ragdoll() { return rag; },   // (its rig: the tests)
    get torso() { return P?.torso || null; },   // (v53 C4: the bomb carried on the back hangs here — gd-c4-back.js)
    dispose() { stopRagdoll(rag); a.dispose(); },
  };
}
