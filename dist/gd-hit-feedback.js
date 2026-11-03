// Global Defensive · hit and headshot feedback (v53 spec 2.2), made by gd-hud.js:
//  · the shooter — hit(kill, head, helmet) for each hit the host confirmed (lab.js reportHit: its result's down, head
//    and hm — the victim wore a helmet as the bullet met the head, combat-logic.js hitMarks): the hit marker
//    (gd-crosshair.js: a white X, red for a kill, an extra tick for a headshot) and the sounds (gd-sounds.js hitEvents:
//    the body tick, the headshot ding — the helmet's metallic ping or the bare head's dull thud — and on a headshot kill
//    the heavier headshot-kill sound layered with the kill confirm);
//  · the victim and the onlookers — update() reads the room's blood records (combat.bl: one per bullet / knife hit the
//    host applied, rising i; v victim, z zone, hm helmet, k killed, s shooter, p where, r direction): a hit on YOU
//    plays your own hurt sound (2D) and lights CS2's damage indicator towards where it came from (the shot's direction
//    against your view, from the listener the camera set this frame, snapped to one of its four segments); a headshot
//    on anyone else plays where it happened (placed: CS2's distance curve, walls, HRTF — gdPlay), unless you fired it
//    (your own feedback has it). A killing headshot is CS2's Death* event, a wounding one its Damage* (gd-sounds.js
//    hurtEvent). The red screen flash on losing health stays combat-hud.js's (#cb-flash).
//  · CS2's damage indicator (panorama/styles/hud/huddamageindicator.vcss, decompiled from the user's install):
//    @define damageIndicatorSize 300px; four .Damage__Segment panels (Top / Right / Bottom / Left: rotateZ 0 / 90 /
//    180 / 270°, each translate3d(0, −5px, 0)), each a radial gradient — centre 50 % 50 %, radius 49 % — white at
//    .862–.889 and .920–.999 (a thin and a thick band), clipped to a 90° wedge (clip: radial(50% 50%, 315deg, 90deg)),
//    wash-color #cc3300. Drawn at the picture's height (300 px at 1080 p). Its fade (950 ms: in 5 %, held, out) is ours —
//    CS2 drives it from code, not the stylesheet.
// State: the newest record seen (lastI; on the first look everything already there is old news). Every frame: one walk
// over at most 12 records, nothing allocated; a hit only switches prebuilt class / transform strings.
import { gdHitSounds, gdHurtSound } from './gd-sounds.js';
import { createHitMarker } from './gd-crosshair.js';
import { listenerFrame } from './spatial-audio.js';

// Where a hit came from on your screen: the shot travelled along (rx, rz); it came FROM −(rx, rz). Your view looks
// along (fx, fz) (three.js: −z ahead, +x right of it). Degrees clockwise from ahead, 0 … 360.
export function arcAngle(rx, rz, fx, fz) { const sx = -rx, sz = -rz, fl = Math.hypot(fx, fz) || 1, ax = fx / fl, az = fz / fl;
  const a = Math.atan2(sx * -az + sz * ax, sx * ax + sz * az) * 180 / Math.PI; return (a + 360) % 360; }
// CS2's four segments: 0 top (ahead), 1 right, 2 bottom (behind), 3 left — the nearest one to the hit's direction.
export const SEGMENTS = ['top', 'right', 'bottom', 'left'];
export const segmentOf = deg => Math.round(((deg % 360) + 360) % 360 / 90) % 4;
const SEG_GRAD = 'radial-gradient(circle calc(var(--gd-di) * .49) at 50% 50%,#cc330000 86.1%,#cc3300 86.2%,#cc3300 88.9%,#cc330000 89%,#cc330000 91.9%,#cc3300 92%,#cc3300 99.9%,#cc330000 100%)';
export const HIT_ARC_CSS = `
.gd-da{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;--gd-di:calc(var(--gd-view-h,100vh) * 300 / 1080)}
.gd-da i{position:absolute;left:calc(var(--gd-di) / -2);top:calc(var(--gd-di) / -2);width:var(--gd-di);height:var(--gd-di);opacity:0;background:${SEG_GRAD};clip-path:polygon(50% 50%,0 0,100% 0)}
.gd-da .s0{transform:translate3d(0,calc(var(--gd-di) * -5 / 300),0)}.gd-da .s1{transform:translate3d(0,calc(var(--gd-di) * -5 / 300),0) rotate(90deg)}.gd-da .s2{transform:translate3d(0,calc(var(--gd-di) * -5 / 300),0) rotate(180deg)}.gd-da .s3{transform:translate3d(0,calc(var(--gd-di) * -5 / 300),0) rotate(270deg)}
.gd-da i.a{animation:gd-da0 950ms ease-out both}.gd-da i.b{animation:gd-da1 950ms ease-out both}
@keyframes gd-da0{0%{opacity:0}5%{opacity:1}30%{opacity:.9}100%{opacity:0}}@keyframes gd-da1{0%{opacity:0}5%{opacity:1}30%{opacity:.9}100%{opacity:0}}`;
const SEG_CLS = [['s0', 's0 a', 's0 b'], ['s1', 's1 a', 's1 b'], ['s2', 's2 a', 's2 b'], ['s3', 's3 a', 's3 b']];

export function createHitFeedback({ parent, doc = globalThis.document, hit = gdHitSounds, hurt = gdHurtSound, frame = listenerFrame } = {}) {
  const marker = createHitMarker(parent, doc);
  if (doc.getElementById && !doc.getElementById('gd-da-css')) { const css = doc.createElement('style'); css.id = 'gd-da-css'; css.textContent = HIT_ARC_CSS; (doc.head || doc.body).append?.(css); }
  // CS2's damage indicator: one box, its four segments built once (a hit switches one segment's class: A / B restart).
  const di = doc.createElement('div'); di.className = 'gd-da'; const segs = [], segPar = new Uint8Array(4);
  for (let k = 0; k < 4; k++) { const e = doc.createElement('i'); e.className = SEG_CLS[k][0]; di.append(e); segs.push(e); } parent?.append?.(di);
  let lastI = -Infinity, primed = false; const LF = { fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 }, AT = { x: 0, y: 0, z: 0 };
  const stats = { hits: 0, hurt: 0, onlooker: 0, arcs: 0, seg: -1 };
  function arc(rx, rz) { frame(LF); const k = segmentOf(arcAngle(rx, rz, LF.fx, LF.fz)); segPar[k] ^= 1; segs[k].className = SEG_CLS[k][1 + segPar[k]]; stats.arcs++; stats.seg = k; }
  return {
    marker, stats,
    // A hit of yours the host confirmed.
    hit(kill, head, helmet) { marker.show(!!kill, !!head); hit(!!kill, !!head, !!helmet); stats.hits++; },
    // Every frame in a match: G the game, me your key, now the host's clock (ms).
    update(G, me, now) {
      const L = G?.combat?.bl; if (!L || !L.length) { primed = true; return; }
      if (!primed) { primed = true; for (let k = 0; k < L.length; k++) if (L[k].i > lastI) lastI = L[k].i; return; }
      for (let k = 0; k < L.length; k++) { const r = L[k]; if (!(r.i > lastI)) continue; lastI = r.i;
        if (now - r.at > 1000) continue;   // (a late frame: an old hit is no news)
        if (r.v === me) { hurt(r.z, !!r.hm, true, null, null, !!r.k); stats.hurt++; const d = r.r; if (d && Number.isFinite(d[0]) && Number.isFinite(d[2])) arc(d[0], d[2]); }
        else if (r.s !== me && r.z === 'head' && r.p) { AT.x = r.p[0]; AT.y = r.p[1]; AT.z = r.p[2]; hurt('head', !!r.hm, false, AT, r.v, !!r.k); stats.onlooker++; } }
    },
  };
}
