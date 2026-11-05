// Global Defensive · hit and headshot feedback (v53 spec 2.2), made by gd-hud.js:
//  · the shooter — hit(kill, head, helmet) for each hit the host confirmed (lab.js reportHit: its result's down, head
//    and hm — the victim wore a helmet as the bullet met the head, combat-logic.js hitMarks): the hit marker
//    (gd-crosshair.js: a white X, red for a kill, an extra tick for a headshot) ONLY when Settings → Global Defensive →
//    Hit marker is On (v53 FEEDBACK, spec addendum 15: default Off — CS2 has no hit marker; live.hitMarker, per user),
//    and in both settings the sounds (gd-sounds.js hitEvents:
//    the body tick, the headshot ding — the helmet's metallic ping or the bare head's dull thud — and on a headshot kill
//    the heavier headshot-kill sound layered with the kill confirm);
//  · the victim and the onlookers — update() reads the room's blood records (combat.bl: one per bullet / knife hit the
//    host applied, rising i; v victim, z zone, hm helmet, k killed, s shooter, p where, r direction): a hit on YOU
//    plays your own hurt sound (2D) and lights CS2's damage indicator towards where it came from (the shot's direction
//    against your view, from the listener the camera set this frame: one of its four segments, two for a diagonal
//    shot — segmentsOf); a hit
//    on anyone else plays where it happened (placed: CS2's distance curve, walls, HRTF — gdPlay), unless you fired it
//    (your own feedback has it). A killing headshot is CS2's Death* event, a wounding one its Damage* (gd-sounds.js
//    hurtEvent). There is no red screen flash on losing health in GD (CS2 has none: combat-hud.js's #cb-flash was removed
//    there). (v53 FEEDBACK — the user, 2026-11-05: "no blood should be on own wound only red barrier something with 4
//    side") A hit on you puts NO blood on your screen (gd-blood.js draws none there): this indicator is the only thing
//    you see, whatever Settings → Blood says.
//  · CS2's damage indicator, checked again 2026-11-05 against the user's install (Source2Viewer-CLI; its -d decompile
//    of these two files fails on an unknown KV3 type, so the compiled files were read raw: the .vcss_c holds the
//    stylesheet's text, the .vxml_c's LZ4 data block decoded by hand):
//    panorama/layout/hud/huddamageindicator.vxml — a CSGOHudDamageIndicator (hittest false) with a Panel id Damage and
//    its panels DamageTop / DamageRight / DamageBottom / DamageLeft, classes "Damage__Segment Damage__Segment--Top"
//    (… --Right, --Bottom, --Left), and one "Damage__Segment_Bar Damage__Segment--Top"; there is no .vjs for it (the
//    game's code lights the segments). panorama/styles/hud/huddamageindicator.vcss — @define damageIndicatorSize 300px
//    (.Damage: that square, centred); .Damage__Segment 100 % of it, background gradient(radial, 50% 50%, 0% 1%, 49% 49%):
//    clear to .861, white .862–.889, clear .890–.919, white .920–.999, clear at 1 (a thin and a thick band); clip:
//    radial(50% 50%, 315deg, 90deg) (a 90° wedge round the top); wash-color #cc3300FF; --Top translate3d(0, −5px, 0),
//    --Right / --Bottom / --Left the same then rotateZ 90 / 180 / 270°. All of it below (HIT_ARC_CSS), at the picture's
//    height (300 px at 1080 p, Panorama's scale).
//    (v53 FEEDBACK final) The ORDER of "translate3d(0, −5px, 0) rotateZ(N)" is our reading, not verified: the files hold
//    only the text, not how Panorama composes it. Read as a web browser does (rotate, then shift up the screen) all four
//    segments would move up 5 px — the ring off centre (top 152 px out, bottom 142) — which the stylesheet would rather
//    say once on .Damage; the same −5 px written on each side reads as each segment pushed 5 px OUT along its own side
//    (translate in the segment's frame, then turn — Panorama applying the list in written order), a symmetric gap. So
//    below it is written for the browser as rotate(N) translate3d(0, −5px, 0). A CS2 screenshot would settle it.
//    NOT in the files (ours): the fade — 950 ms, in over 5 %, held, out (CS2's code, not the stylesheet: no transition
//    or animation in it) — and which segments light. Ours for that (segmentsOf) takes ONLY the .3 share threshold of
//    the Source engine's indicator (hud_damageindicator.cpp, Source SDK 2013, from memory — not in the user's install;
//    CS2's rule is in its code): the shot's direction, level, against your view, each of ahead / behind / right / left
//    lit when its share passes .3 — a shot straight from one side lights one segment, a diagonal one (between 17.5° and
//    72.5° off an axis) the two it lies between — and an HE right on you ([0, 0]) lights all four. NOT taken from it
//    (v53 FEEDBACK final, listed as not verified for CS2): brightness scaled by the share (every lit segment here plays
//    the same full fade), the all-four case for any attacker within 50 units (a knife lights one or two), and pitch. The Damage__Segment_Bar (white — no
//    wash-color — 270° round the sides and bottom, radius 57 %, band .770–.899) is not drawn: what the code shows it
//    for is not in the files, and a hit in CS2 shows the red segments.
//    (v53 FEEDBACK final) All the hits on you that one update() takes light their segments together: each lit segment's
//    animation restarts ONCE (before, two hits on one segment in one host frame flipped its A / B class twice — no
//    restart, no indicator). An HE that hurts you lights it too, from the blast's side: the host's stamp combat.hx[you]
//    (newer than seen, under 1 s old) and beside it combat.hxr[you], the level direction blast → you (combat-logic.js
//    hitMarks; Source's indicator takes a blast's position as its source — CS2's files don't say). Fire (molotov /
//    incendiary) damage has no direction on the host and lights nothing (open item).
// v53 HITS (H2): body armour — a record's ar (the bullet met kevlar on the chest or stomach, combat-logic.js hitMarks)
// picks CS2's *BodyArmor* events: for the shooter (hit(): the result's ar / w when passed, else the newest record of yours
// not yet used — a knife's w: CS2's knife feedback is silent), for the victim (its own) and for onlookers (every hit,
// placed: flesh, armour or head — v53 HITS final; before, a bare body hit was silent to onlookers).
// State: the newest record seen (lastI; on the first look everything already there is old news). Every frame: one walk
// over at most 12 records, nothing allocated; a hit only switches prebuilt class / transform strings.
import { gdHitSounds, gdHurtSound } from './gd-sounds.js';
import { createHitMarker } from './gd-crosshair.js';
import { listenerFrame } from './spatial-audio.js';
import { weaponById } from './weapons-data.js';
import { live } from './live-settings.js';   // (v53 FEEDBACK: Settings → Hit marker)
const knifeId = w => !!w && weaponById(w)?.kind === 'knife';

// Where a hit came from on your screen: the shot travelled along (rx, rz); it came FROM −(rx, rz). Your view looks
// along (fx, fz) (three.js: −z ahead, +x right of it). Degrees clockwise from ahead, 0 … 360.
export function arcAngle(rx, rz, fx, fz) { const sx = -rx, sz = -rz, fl = Math.hypot(fx, fz) || 1, ax = fx / fl, az = fz / fl;
  const a = Math.atan2(sx * -az + sz * ax, sx * ax + sz * az) * 180 / Math.PI; return (a + 360) % 360; }
// CS2's four segments: 0 top (ahead), 1 right, 2 bottom (behind), 3 left — the nearest one to the hit's direction.
export const SEGMENTS = ['top', 'right', 'bottom', 'left'];
export const segmentOf = deg => Math.round(((deg % 360) + 360) % 360 / 90) % 4;
// (v53 FEEDBACK) Which segments light (bit k = SEGMENTS[k]): the direction the shot came FROM, level, against your view
// (fx, fz); each of ahead / right / behind / left whose share passes SEG_SHARE (Source's hud_damageindicator rule, above).
export const SEG_SHARE = .3;
export function segmentsOf(rx, rz, fx, fz) { const fl = Math.sqrt(fx * fx + fz * fz) || 1, ax = fx / fl, az = fz / fl, sl = Math.sqrt(rx * rx + rz * rz);
  if (!(sl > 1e-9)) return 1; const sx = -rx / sl, sz = -rz / sl, ahead = sx * ax + sz * az, right = sx * -az + sz * ax;
  return (ahead > SEG_SHARE ? 1 : 0) | (right > SEG_SHARE ? 2 : 0) | (ahead < -SEG_SHARE ? 4 : 0) | (right < -SEG_SHARE ? 8 : 0); }
const SEG_GRAD = 'radial-gradient(circle calc(var(--gd-di) * .49) at 50% 50%,#cc330000 86.1%,#cc3300 86.2%,#cc3300 88.9%,#cc330000 89%,#cc330000 91.9%,#cc3300 92%,#cc3300 99.9%,#cc330000 100%)';
export const HIT_ARC_CSS = `
.gd-da{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;--gd-di:calc(var(--gd-view-h,100vh) * 300 / 1080)}
.gd-da i{position:absolute;left:calc(var(--gd-di) / -2);top:calc(var(--gd-di) / -2);width:var(--gd-di);height:var(--gd-di);opacity:0;background:${SEG_GRAD};clip-path:polygon(50% 50%,0 0,100% 0)}
.gd-da .s0{transform:translate3d(0,calc(var(--gd-di) * -5 / 300),0)}.gd-da .s1{transform:rotate(90deg) translate3d(0,calc(var(--gd-di) * -5 / 300),0)}.gd-da .s2{transform:rotate(180deg) translate3d(0,calc(var(--gd-di) * -5 / 300),0)}.gd-da .s3{transform:rotate(270deg) translate3d(0,calc(var(--gd-di) * -5 / 300),0)}
.gd-da i.a{animation:gd-da0 950ms ease-out both}.gd-da i.b{animation:gd-da1 950ms ease-out both}
@keyframes gd-da0{0%{opacity:0}5%{opacity:1}30%{opacity:.9}100%{opacity:0}}@keyframes gd-da1{0%{opacity:0}5%{opacity:1}30%{opacity:.9}100%{opacity:0}}`;
const SEG_CLS = [['s0', 's0 a', 's0 b'], ['s1', 's1 a', 's1 b'], ['s2', 's2 a', 's2 b'], ['s3', 's3 a', 's3 b']];

export function createHitFeedback({ parent, doc = globalThis.document, hit = gdHitSounds, hurt = gdHurtSound, frame = listenerFrame } = {}) {
  const marker = createHitMarker(parent, doc);
  if (doc.getElementById && !doc.getElementById('gd-da-css')) { const css = doc.createElement('style'); css.id = 'gd-da-css'; css.textContent = HIT_ARC_CSS; (doc.head || doc.body).append?.(css); }
  // CS2's damage indicator: one box, its four segments built once (a hit switches one segment's class: A / B restart).
  const di = doc.createElement('div'); di.className = 'gd-da'; const segs = [], segPar = new Uint8Array(4);
  for (let k = 0; k < 4; k++) { const e = doc.createElement('i'); e.className = SEG_CLS[k][0]; di.append(e); segs.push(e); } parent?.append?.(di);
  let lastI = -Infinity, primed = false, Gs = null, meS = '', mineI = -Infinity;   /* (Gs / meS: the last update's game and key — hit() reads your newest record) */ const LF = { fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 }, AT = { x: 0, y: 0, z: 0 };
  const stats = { hits: 0, hurt: 0, onlooker: 0, arcs: 0, seg: -1, mask: 0, armor: 0, marks: 0, lit: 0, blasts: 0 };   // (seg: the nearest segment; mask: every one the last hit lit — v53 FEEDBACK; lit: every one the last update restarted, blasts: HEs on you shown — v53 FEEDBACK final)
  // (v53 FEEDBACK final) arc() only gathers this update's lit segments (pend); light() restarts each of them once.
  let pend = 0, hxSeen = 0, hxMe = null;   // (hxSeen: the newest HE stamp on you seen — for key hxMe)
  function arc(rx, rz) { frame(LF); const m = segmentsOf(rx, rz, LF.fx, LF.fz); pend |= m;
    stats.arcs++; stats.mask = m; stats.seg = segmentOf(arcAngle(rx, rz, LF.fx, LF.fz)); }
  function light() { const m = pend; pend = 0; if (!m) return; for (let k = 0; k < 4; k++) if (m & (1 << k)) { segPar[k] ^= 1; segs[k].className = SEG_CLS[k][1 + segPar[k]]; } stats.lit = m; }
  // An HE on you: the host's stamp (combat.hx) newer than seen, its direction (combat.hxr). Old news on the first look / a new key.
  function blast(C, me, now) { const t = +(C?.hx?.[me]) || 0; if (me !== hxMe) { hxMe = me; hxSeen = t; return; } if (!(t > hxSeen) && !(t > 0 && t < hxSeen - 6e5)) return; hxSeen = t;   /* (v53 FEEDBACK final: a stamp far below the last — another host's clock — starts the count again, as gd-blood.js) */
    if (now - t > 1000) return; const d = C.hxr?.[me]; if (d && Number.isFinite(d[0]) && Number.isFinite(d[1])) { if (d[0] === 0 && d[1] === 0) { pend |= 15; stats.arcs++; stats.mask = 15; } else arc(d[0], d[1]); stats.blasts++; } }   // (v53 FEEDBACK final: [0, 0] — the blast right on you — lights all four)
  return {
    marker, stats,
    // A hit of yours the host confirmed.
    // (v53 HITS final) arIn / wIn: the hit result's own ar and w (combat-logic.js hitMarks puts them on it) when the caller
    // passes them; else your newest unused record's (the host put it in the same state as the reply).
    hit(kill, head, helmet, arIn, wIn) { if (live.hitMarker) { marker.show(!!kill, !!head); stats.marks++; }   // (v53 FEEDBACK: the X only when the setting is On; the sounds below either way)
      let ar = false, kn = false; const L = Gs?.combat?.bl;
      if (arIn !== undefined || wIn !== undefined) { ar = !!arIn; kn = knifeId(wIn); }
      else if (L) for (let k = L.length - 1; k >= 0; k--) { const r = L[k]; if (r.s === meS && r.i > mineI) { mineI = r.i; ar = !!r.ar; kn = knifeId(r.w); break; } }
      hit(!!kill, !!head, !!helmet, ar, kn); stats.hits++; if (ar) stats.armor++; },
    // Every frame in a match: G the game, me your key, now the host's clock (ms).
    update(G, me, now) {
      Gs = G; meS = me; blast(G?.combat, me, now); const L = G?.combat?.bl; if (!L || !L.length) { primed = true; light(); return; }
      if (!primed) { primed = true; for (let k = 0; k < L.length; k++) if (L[k].i > lastI) lastI = L[k].i; light(); return; }
      for (let k = 0; k < L.length; k++) { const r = L[k]; if (!(r.i > lastI) && !(r.i < lastI - 6e5)) continue; lastI = r.i;   // (v53 FEEDBACK final: a record far below the last — another host — starts the count again, gd-blood.js's rule; before, joining a host whose clock is behind lit nothing)
        if (now - r.at > 1000) continue;   // (a late frame: an old hit is no news)
        if (r.v === me) { hurt(r.z, !!r.hm, true, null, null, !!r.k, !!r.ar); stats.hurt++; const d = r.r; if (d && Number.isFinite(d[0]) && Number.isFinite(d[2])) arc(d[0], d[2]); }
        else if (r.s !== me && r.p) { AT.x = r.p[0]; AT.y = r.p[1]; AT.z = r.p[2]; hurt(r.z === 'head' ? 'head' : r.z, !!r.hm, false, AT, r.v, !!r.k, !!r.ar); stats.onlooker++; } }   // (v53 HITS final: every hit you see — CS2's DamageBody / DeathBody .Onlooker for flesh, *BodyArmor* on kevlar, the headshot ones; capped at 2 voices each)
      light();   // (v53 FEEDBACK final: every segment this update's hits lit, restarted once)
    },
  };
}
