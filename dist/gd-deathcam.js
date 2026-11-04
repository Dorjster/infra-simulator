// Global Defensive · CS2's death cam (v53 Addendum 2): when you die you don't jump straight into a team mate's eyes. The
// view stays at your death spot, eases back a little and up so your own falling body shows, turns smoothly to face your
// killer and keeps them framed while they move; then it fades to black and the first-person spectating of a team mate
// starts (arena-spectate.js — the first-person-only rule stays: this short look is CS2's one exception).
//
// CS2's numbers — the convars spec_freeze_deathanim_time, spec_freeze_traveltime, spec_freeze_time,
// spec_freeze_time_lock and mp_deathcam_skippable EXIST in CS2 (listed in the user's install:
// scripts/workshop_cvar_whitelist.txt), but their DEFAULT VALUES ARE NOT IN THE INSTALL'S FILES (they live in the game's
// binaries, not downloaded here; the cfg folder holds no gamemode_*.cfg). The values below are the Source / CS:GO
// defaults from memory, NOT VERIFIED: deathanim 0.8 s, travel 0.3 s, freeze 3.0 s, lock 2.0 s, skippable 1. They are
// one table (CAM), so a verified number is a one-line change.
// Verified from the install:
//   · the death cam's colour: lighting/postprocessing/effects/death_cam_phase1.vpost — a 32³ colour table that keeps red
//     and multiplies green and blue by 0.58 (white → (1, .58, .58): measured on its every entry) — drawn here as a
//     full-screen multiply of #ff9494 (exactly that table) faded in; death_cam_phase2.vpost — a table of all zeros: the
//     fade to black at its end (how fast CS2 fades is not in the files: FADE is ours);
//   · the skip key: CS2's "[{s:bind_jump}] Skip" (Panorama_Death_Cancel_Start_Replay, resource/csgo_english.txt) — jump
//     (Space) skips once the lock has passed;
//   · Player.FreezeCam (CS:GO's freeze-frame shutter) has volume 0.0 in CS2's game_sounds_ui.vsndevts: no shutter sound.
//   · (r2 fix) death_cam_phase1.vpost also turns on a vignette: m_flVignetteStrength −0.0964, m_flRadius 0.0903,
//     m_flRoundness 0, m_flFeather 0.4665, m_vColorTint [0.533, 0.109, 0.109] (s2v -b DATA on the _c file). Drawn in the
//     same multiply layer: the colour table's #ff9494 at the centre out to radius, eased over the feather to #f48787 at the
//     edges (#ff9494 × (1 − 0.0964 · (1 − tint)) — our reading of how strength and tint combine: the file names the numbers,
//     not the formula; roundness 0 read as "follows the screen's shape": an ellipse). Its local-contrast block
//     (m_flLocalContrastStrength 2, EdgeStrength 2, VignetteStart −0.31, End 0.94, Blur 0.95) is NOT done: it needs a
//     blur-and-sharpen pass over the frame, a shader this module doesn't add (no shader compiles mid-round).
//   · the tint is CS2's death cam's only (phase 1): hidden the moment the fade to black is full, before the black lifts
//     over the spectated team mate's view (it never shows over spectating).
// Not verified, so not done: whether CS2 draws the killer through walls in the death cam (no file says; nothing here
// reveals anyone — the camera only turns toward where the killer is, as the kill already tells you).
//
// STATE MACHINE (time t since your death, the host's clock: the down record's `at`):
//   ALIVE --down (with at)--> ANIM [0, deathanim): from your eye back BACK and up UP (away from the killer, never through
//     a wall: the move is cut short at the first surface) looking from where you looked toward your body
//   --> TRAVEL [deathanim, +travel): the look turns from your body to the killer (eased)
//   --> FREEZE [.., +freeze): the killer kept framed (a smoothed follow of their chest (PF); gone or dead: where they were,
//     else back along the bullet that killed you); the last FADE seconds go to black
//   --> DONE: spectating (the black lifts over FADE_IN). A skip (jump, after deathanim + lock, mp_deathcam_skippable) goes
//     to the fade at once. Back alive at any point (respawn modes): ALIVE. No killer (the bomb, a fall, your own grenade,
//     the world): CS2's equivalent — the same cam looking at your own body. A down record without `at` (older hosts,
//     tests) skips the cam.
//   RESPAWN MODES (r2 fix): the cam never runs past your respawn — its end is min(anim + travel + freeze, the down
//     record's until − at) and the fade to black starts FADE before that, so a 2.5 s deathmatch respawn fades out the
//     cam instead of cutting it; after the respawn the black lifts over FADE_IN over your own view. (CS2's deathmatch
//     respawn delay is not in the install's files either: the host's respawnMs is ours.) The skip lock (2.8 s) is past
//     a 2.5 s respawn, so there no skip is offered — the respawn comes first.
//   FOV (r2 fix): the cam and the spectating after it use your normal field of view (fov(): lab.js viewFov) — a death
//     while scoped or zoomed doesn't keep the scope's 10–40° lens.
// COST: one camera pose computed per frame from reused vectors; two fixed page layers (tint, black) whose opacity only
// changes; nothing allocated per frame, no shader.
import * as THREE from './three.module.js';
import { hostNow } from './host-clock.js';
import { mapWorld } from './gd-ragdoll.js';

const HU = 2.54 / 16.5;
export const CAM = { deathanim: .8, travel: .3, freeze: 3, lock: 2, skippable: true };   // (NOT VERIFIED: see the top)
export const FADE = .35, FADE_IN = .25, SKIP_FADE = .2;   // s (ours)
export const BACK = 56 * HU, UP = 22 * HU, LOOK_K = 9;    // the camera's step back and up (ours), how fast it keeps the killer framed (1/s)
export const TINT = '#ff9494', TINT_IN = .3;              // CS2's death_cam_phase1 table as a multiply colour; its fade-in (s, ours)
export const camTotal = () => CAM.deathanim + CAM.travel + CAM.freeze;
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
// the tint layer: the colour table at the centre, the vignette at the edges (see the top; percentages of the half-diagonal)
export const TINT_EDGE = '#f48787', VIG_IN = 9, VIG_OUT = 56;
const OPA = Array.from({ length: 201 }, (_, i) => (i / 200).toFixed(3));   // (the layers' opacities, made once: a fade writes no new string)
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

// (FINISH pass, allocation: the cam's own per-frame use reads t and the skip from a register R — [t, skip time or −1,
// out, (dt), the respawn cap (s since the death; Infinity: none)] — so no number crosses a call V8 may not inline; the
// exported forms below fill one and ask the same code.)
function phaseR(R) {
  const t = R[0], sk = R[1], full = CAM.deathanim + CAM.travel + CAM.freeze, total = R[4] < full ? R[4] : full, skip = sk >= 0 && sk < total - FADE, end = skip ? sk + SKIP_FADE : total, fadeFrom = skip ? sk : total - FADE;
  if (!(t >= 0)) return 'anim'; if (t >= end) return 'done'; if (t >= fadeFrom) return 'fade';
  if (t < CAM.deathanim) return 'anim'; if (t < CAM.deathanim + CAM.travel) return 'travel'; return 'freeze';
}
function blackR(R) {   // into R[2]
  const t = R[0], sk = R[1], full = CAM.deathanim + CAM.travel + CAM.freeze, total = R[4] < full ? R[4] : full, skip = sk >= 0 && sk < total - FADE, from = skip ? sk : total - FADE, len = skip ? SKIP_FADE : FADE, end = from + len;
  if (t < from) R[2] = 0; else if (t < end) { const x = (t - from) / len; R[2] = x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); } else { const v = 1 - (t - end) / FADE_IN; R[2] = v > 0 ? v : 0; }
}
const RX = new Float64Array(5);
// The phase at t seconds since the death (skipAt: when a skip came, or null; cap: the respawn, s after the death). Pure: the tests drive it.
export function camPhase(t, skipAt = null, cap = Infinity) { RX[0] = t; RX[1] = skipAt === null ? -1 : skipAt; RX[4] = cap; return phaseR(RX); }
// How black the screen is at t (0…1), and whether a skip is allowed at t.
export function blackAt(t, skipAt = null, cap = Infinity) { RX[0] = t; RX[1] = skipAt === null ? -1 : skipAt; RX[4] = cap; blackR(RX); return RX[2]; }
// The cam's respawn cap for a down record: until − at in seconds (Defuse's "back next round" is ~forever: none).
export const respawnCap = dn => Number.isFinite(dn?.until) && Number.isFinite(dn?.at) && dn.until - dn.at < 6e5 ? (dn.until - dn.at) / 1000 : Infinity;
export const canSkip = t => CAM.skippable && t >= CAM.deathanim + CAM.lock;
// Who killed you, as CS2's death panel and cam treat it: 'killer' (another player), 'self' (your own grenade, a fall,
// the world), 'bomb' (the C4), 'fire' (burnt by your own or a world fire).
export function deathKind(dn, me) { if (!dn) return null; if (!dn.by) return 'self'; if (dn.by === 'C4' || dn.wid === 'c4') return 'bomb'; if (key(dn.by) === me) return dn.wid === 'molotov' || dn.wid === 'incendiary' ? 'fire' : 'self'; return 'killer'; }

// Live state of the cam, read by the death panel (gd-death-panel.js) and the HUD: one record, refilled.
export const DEATHCAM = { on: false, phase: 'alive', t: 0, skip: false, canSkip: false, at: 0, kind: null };

// The cam itself. world: the game world (operations.game); lan: models (to find the killer); boxes(): the map's;
// selfBody(): your own body (it lies where you died: arena-spectate.js), or null.
export function createDeathCam({ camera, world, lan, name, boxes = () => null, bounds = () => null, fov = null, doc = globalThis.document }) {
  const css = doc?.createElement?.('style'); if (css) { css.textContent = `#gd-dc-tint{position:fixed;inset:0;z-index:30;pointer-events:none;background:radial-gradient(ellipse farthest-corner at 50% 50%,${TINT} ${VIG_IN}%,${TINT_EDGE} ${VIG_OUT}%);mix-blend-mode:multiply;opacity:0}#gd-dc-black{position:fixed;inset:0;z-index:31;pointer-events:none;background:#000;opacity:0}#gd-dc-tint[hidden],#gd-dc-black[hidden]{display:none}`; (doc.head || doc.body)?.append?.(css); }
  const mk = id => { const e = doc?.createElement?.('div') || { style: {}, hidden: true }; e.id = id; e.hidden = true; doc?.body?.append?.(e); return e; };
  const tint = mk('gd-dc-tint'), black = mk('gd-dc-black');
  const E0 = new THREE.Vector3(), E1 = new THREE.Vector3(), body = new THREE.Vector3(), aim = new THREE.Vector3(), look0 = new THREE.Vector3();
  const KL = new Float64Array(3), PF = new Float64Array(3), TG = new Float64Array(3);   // (written every frame, so typed arrays: the killer's chest, the smoothed framing point, a look target)
  const Mx = new THREE.Matrix4(), UPV = new THREE.Vector3(0, 1, 0), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  let at = null, skipAt = null, kind = null, killerKey = null, lastSet = { t: -1, b: -1 }, hasKiller = false;
  const R = new Float64Array(5);   // (the frame's registers: [0] t since the death (s), [1] the skip's t or −1, [2] how black, [3] the frame's dt not yet used by the follow, [4] the respawn cap (s))
  const LIFT = new Float64Array(2); LIFT[0] = -1;   // (r2: after a respawn the black lifts over FADE_IN — [0] when it started (host ms) or −1, [1] how black it was)
  let nameSeen = null, nameKey = '';   // (your key, made again only when your name changes: no string made per frame)
  const myKey = () => { const n = name(); if (n !== nameSeen) { nameSeen = n; nameKey = key(n); } return nameKey; };
  let killerM = null, killerId = null, scanAt = -1e9;   // (the killer's model, found once per death: no name keys made per frame)
  const g = () => world.operations.game;
  // where the killer is now (their body's chest), into kill; false when not on the map (left the match)
  // (looked up by name only when the one found is gone — at most twice a second, so a killer who left costs nothing per frame)
  function killerAt() { if (!killerKey) return false;
    if (!killerM || lan.models?.get?.(killerId) !== killerM) { killerM = null; const pn = globalThis.performance?.now?.() ?? Date.now(); if (pn - scanAt < 500) return false; scanAt = pn;
      for (const [id, m] of lan.models || []) if (m?.g && key(m.name) === killerKey) { killerM = m; killerId = id; break; } if (!killerM) return false; }
    const kp = killerM.g.position; KL[0] = kp.x; KL[1] = kp.y + 7.5; KL[2] = kp.z; return true; }
  function begin(dn, t0) {
    at = t0; skipAt = null; R[1] = -1; killerM = null; killerId = null; scanAt = -1e9; const me = myKey(); kind = deathKind(dn, me); killerKey = kind === 'killer' ? key(dn.by) : null;
    LIFT[0] = -1; if (fov) { const f = fov(); if (Number.isFinite(f) && f > 0 && Math.abs(camera.fov - f) > 1e-3) { camera.fov = f; camera.updateProjectionMatrix?.(); } }   // (r2: your normal FOV, not a scope's)
    E0.copy(camera.position); camera.getWorldDirection(look0).multiplyScalar(20).add(E0); body.set(E0.x, E0.y - 8, E0.z);   // (your body: lying round your feet)
    hasKiller = killerAt();
    if (!hasKiller && Array.isArray(dn.rg) && dn.rg.length >= 6) { KL[0] = E0.x - dn.rg[3] * 60; KL[1] = E0.y - dn.rg[4] * 60; KL[2] = E0.z - dn.rg[5] * 60; hasKiller = kind === 'killer'; }   // (not on the map: back along the bullet)
    // step back from the killer (or back from where you looked), and up; cut short at the first surface on the way
    if (hasKiller) aim.set(E0.x - KL[0], 0, E0.z - KL[2]); else aim.set(E0.x - look0.x, 0, E0.z - look0.z); if (aim.lengthSq() < 1e-6) aim.set(0, 0, 1); aim.normalize();
    if (hasKiller) PF.set(KL); else { PF[0] = body.x; PF[1] = body.y; PF[2] = body.z; }   // (the framing's smoothed point starts on them)
    E1.set(E0.x + aim.x * BACK, E0.y + UP, E0.z + aim.z * BACK);
    const w = mapWorld(boxes(), bounds()); if (w.blocked(E0.x, E0.y, E0.z, E1.x, E1.y, E1.z)) { let lo = 0, hi = 1; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (w.blocked(E0.x, E0.y, E0.z, E0.x + (E1.x - E0.x) * m, E0.y + (E1.y - E0.y) * m, E0.z + (E1.z - E0.z) * m)) hi = m; else lo = m; } E1.lerpVectors(E0, E1, Math.max(0, lo - .1)); }
    tint.hidden = false; black.hidden = false;
  }
  // (r2) the cam over: the tint gone at once; the black — full when a respawn ended the cam (it faded out before it) —
  // lifts over FADE_IN instead of cutting to the new view
  function end() { const b = lastSet.b; at = null; DEATHCAM.on = false; DEATHCAM.phase = 'alive'; DEATHCAM.kind = null; tint.hidden = true; if (tint.style) tint.style.opacity = '0'; lastSet.t = lastSet.b = -1;
    if (b > .02 && !black.hidden) { LIFT[0] = hostNow(); LIFT[1] = b; } else { LIFT[0] = -1; black.hidden = true; if (black.style) black.style.opacity = '0'; } }
  function lift() { const v = LIFT[1] * (1 - (hostNow() - LIFT[0]) / 1000 / FADE_IN); if (v <= 0) { LIFT[0] = -1; black.hidden = true; if (black.style) black.style.opacity = '0'; return; } if (black.style) black.style.opacity = OPA[Math.round(v * 200)]; }
  // the camera's look at target, into out (three.js's Matrix4.lookAt, written out: its own calls hand numbers across)
  function lookAt(A, out) {   // (A: a typed array [x, y, z])
    const e = camera.position; let zx = e.x - A[0], zy = e.y - A[1], zz = e.z - A[2], l = zx * zx + zy * zy + zz * zz; if (l === 0) { zz = 1; l = 1; } l = Math.sqrt(l); zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx; l = xx * xx + xz * xz;   // (up × z, up = +y)
    if (l === 0) { zz += .0001; l = Math.sqrt(zx * zx + zy * zy + zz * zz); zx /= l; zy /= l; zz /= l; xx = zz; xz = -zx; l = xx * xx + xz * xz; }
    l = Math.sqrt(l); xx /= l; xy /= l; xz /= l; const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx, te = Mx.elements;
    te[0] = xx; te[4] = yx; te[8] = zx; te[1] = xy; te[5] = yy; te[9] = zy; te[2] = xz; te[6] = yz; te[10] = zz; return out.setFromRotationMatrix(Mx); }
  // camera.quaternion = slerp(qa → qb, by R[2]) (three.js's slerp written out, the factor from the register)
  function slerpTo() { const k = R[2]; let x = qb._x, y = qb._y, z = qb._z, w = qb._w, c = qa._x * x + qa._y * y + qa._z * z + qa._w * w; if (c < 0) { x = -x; y = -y; z = -z; w = -w; c = -c; }
    let s0 = 1 - k, s1 = k; if (c < .9995) { const th = Math.acos(c), sn = Math.sin(th); s0 = Math.sin((1 - k) * th) / sn; s1 = Math.sin(k * th) / sn; }
    let ox = qa._x * s0 + x * s1, oy = qa._y * s0 + y * s1, oz = qa._z * s0 + z * s1, ow = qa._w * s0 + w * s1; const n = Math.sqrt(ox * ox + oy * oy + oz * oz + ow * ow) || 1; camera.quaternion.set(ox / n, oy / n, oz / n, ow / n); }
  function pose() {   // (t: R[0])
    const t = R[0], a = t / CAM.deathanim, ea = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a);
    // where: from your eye back and up over the death anim, then held
    const cp = camera.position; cp.x = E0.x + (E1.x - E0.x) * ea; cp.y = E0.y + (E1.y - E0.y) * ea; cp.z = E0.z + (E1.z - E0.z) * ea;
    // the look: anim — from where you looked to your body; travel — to the killer; freeze — kept on them, smoothed
    const ph = phaseR(R);
    if (ph === 'anim') { TG[0] = look0.x; TG[1] = look0.y; TG[2] = look0.z; lookAt(TG, qa); TG[0] = body.x; TG[1] = body.y; TG[2] = body.z; lookAt(TG, qb); R[2] = ea; slerpTo(); return; }
    TG[0] = body.x; TG[1] = body.y; TG[2] = body.z;   // (your body: the look's start in travel, the look itself with no killer)
    if (!hasKiller) { lookAt(TG, camera.quaternion); return; }
    killerAt();   // (where they are now; not on the map: where they were)
    if (ph === 'travel') { const b = (t - CAM.deathanim) / CAM.travel; lookAt(TG, qa); lookAt(KL, qb); R[2] = b <= 0 ? 0 : b >= 1 ? 1 : b * b * (3 - 2 * b); slerpTo(); PF.set(KL); return; }
    // freeze / fade: a smoothed follow of the killer's chest (P), so their moving stays framed without jerks — the frame's
    // dt used once (update() and follow() both pose: the follow rate stays LOOK_K a second)
    const k = R[3] * LOOK_K, f = k < 1 ? k : 1; R[3] = 0; PF[0] += (KL[0] - PF[0]) * f; PF[1] += (KL[1] - PF[1]) * f; PF[2] += (KL[2] - PF[2]) * f; lookAt(PF, camera.quaternion);
  }
  function paint() {   // (t: R[0]; the black into R[2])
    const t = R[0], ti = phaseR(R) === 'done' ? 0 : t / TINT_IN < 1 ? t / TINT_IN : 1; blackR(R); const b = R[2];   // (r2: no tint once the cam is done)
    if (Math.abs(ti - lastSet.t) > .005 || (ti === 0 && lastSet.t !== 0)) { lastSet.t = ti; if (tint.style) tint.style.opacity = OPA[Math.round((ti > 0 ? ti : 0) * 200)]; }
    if (Math.abs(b - lastSet.b) > .005 || (b === 0 && lastSet.b !== 0)) { lastSet.b = b; if (black.style) black.style.opacity = OPA[Math.round(b * 200)]; }
  }
  return {
    get on() { return DEATHCAM.on; }, get phase() { return DEATHCAM.phase; }, get kind() { return kind; },
    // Every frame (before the spectator): true while the cam runs (the game then takes no input but the skip).
    update(dt) {
      const G = g(), dn = G.mode === 'arena' ? G.combat?.down?.[myKey()] : null, now = hostNow(), dead = !!dn && dn.until > now;
      if (!dead || !Number.isFinite(dn.at)) { if (at !== null || DEATHCAM.on) end(); if (LIFT[0] >= 0) lift(); return false; }
      if (dn.at !== at) begin(dn, dn.at);
      const t = (now - at) / 1000; R[0] = t; R[3] = dt; R[4] = dn.until - at < 6e5 ? (dn.until - at) / 1000 : Infinity; const ph = phaseR(R);   // (R[4]: respawnCap(dn), inline)
      DEATHCAM.t = t; DEATHCAM.at = at; DEATHCAM.skip = skipAt !== null; DEATHCAM.canSkip = CAM.skippable && t >= CAM.deathanim + CAM.lock && skipAt === null; DEATHCAM.kind = kind; DEATHCAM.phase = ph;
      paint();
      if (ph === 'done') { DEATHCAM.on = false; if (!tint.hidden) tint.hidden = true; if (R[2] <= 0 && !black.hidden) black.hidden = true; return false; }   // (r2: the tint off the moment the cam is done — the black is full then)
      DEATHCAM.on = true; pose(); return true;
    },
    // After this frame's bodies are placed (lab.js, after lan.update): the killer's framing from where they are drawn now.
    follow() { if (!DEATHCAM.on || at === null) return; R[0] = (hostNow() - at) / 1000; if (phaseR(R) !== 'anim') pose(); },
    // The skip key (CS2: jump): true when it took.
    skip() { if (!DEATHCAM.on || at === null) return false; const t = (hostNow() - at) / 1000; if (!canSkip(t) || skipAt !== null || t >= R[4] - FADE) return false; skipAt = t; R[1] = t; return true; },
    end,
  };
}
