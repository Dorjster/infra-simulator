// Global Defensive · the round's kill tally (CS2's HudHealthAmmoCenter kill flags, v53 spec 2.1 + Addendum 7) and the
// death panel.
//
// LOOK (Addendum 7, the user's CS2 picture, overrides 2.1's look): at the bottom centre a round BADGE (a 64 px dark
// translucent disc with a 3 px light-blue ring and the team's logo — T: a star over crossed knives), on a thin gold
// horizontal LINE, and behind it, fanned out above it like a hand of playing cards, one rounded gold-outlined CARD per
// kill you made this round. Each card carries its kill number (CS2's kill_1 … kill_5) and its pip in the two corners,
// playing-card style (CS2's kill_pip_<kind>: an upright icon top left, the same turned 180° bottom right); the newest
// card lies on top, so its number shows. CS2's pips: default (skull) · headshot · slash (knife) · blast (HE) · burn
// (fire) · shock (taser).
// CS2's numbers (panorama/styles/hud/hudhealthammocenter.vcss, the user's install, decompiled with Source2Viewer-CLI):
//   .hud-HA-center 64×64 circle, border 3 px; .hud-HA__stroke 60 % of the 800 px HA width, two halves fading outwards;
//   kill flags: the 48×126 card SVG drawn 152 px tall (@define card-svg-height) — the card itself is its x 10–38,
//   y 8.4–46.4 (the kill_mask rect), 33.8 × 45.8 px; the fan per kill count, .HUD--NumKills--N .hud-HA__kill-flagK
//   (translate3d px, rotateZ deg): FAN below; a hidden flag rests at translate3d(0, 42px, 0) and moves in with a 0.2 s
//   ease-in-out transition (.hud-HA__kill-flag.animate); past five kills (.HUD--NumKills--extra) the five keep the
//   5-kill fan and an EXTRA flag (kill_extra, straight up, on top) shows the count (Label.hud-HA__kills__count, 21 px);
//   on a kill the new flag plays on-kill (0.7 s ease-out, brightness 6 → 6 at 30 % → 1) and its spotlight (a 36 × 100 px
//   white-to-clear gradient, radius 10 px, opacity 0 → .2 at 1 % → .2 at 30 % → 0, 0.7 s).
// The turning point (v53 HUD fix): each flag turns about its own centre (panorama's default transform-origin 50 % 50 %),
// and the 152 px card SVG is centred in it (.kill-flag-svg-size vertical-align center), so the pivot is the SVG's centre
// (y 63 of 126) — (63 − 27.4) × 152 / 126 = 42.95 px below the card's centre (the kill_mask rect's centre, y 27.4).
// Measured from the user's pictures (scratchpad v53/ref: cs2-hud.png 739 × 415, cs2-kill-emblem.png 617 × 480, which is
// stretched 1.105× sideways — its ring measures 268 × 242.5 px —, cs2-kill-emblem-ace.png 161 × 158, not stretched):
// the badge's centre 53 px (at 1080 p) above the picture's bottom; the cards' centres 44 px above the badge's centre
// (a fit of the drawn card outlines to the gold / white outline pixels of both pictures: pivot 42.95 and 44 px match
// 82 % of the outline in the 3-kill picture and 76 % in the ace picture; the old fitted 58 / 49 px matched 57 % / 53 %).
// Colours: below (the HUD colour, your player colour, the team colour).
// The card's fill (hudhealthammocenter.vcss .kill-flag-bg-blur): hud-blur-bg-color #000000a0 over the world blurred
// (world-blur hudWorldBlur = gaussian(2, 2, 2), csgostyles.vcss), cut to kill_mask, and .kill-flag-bg-pattern: CS2's
// bluedots_large at 0.2 opacity (backgroundDotsSize 360 px). Ours: backdrop-filter blur(2px) brightness(.373) (= the
// world under 160/255 black) and the dots (CS2's image when tools/import-cs2-hud.mjs imported it, else a dot grid of our
// own — v53 LOOK: at 0.05, nearly invisible, since CS2's 360 px dots read as a plain dark fill in its pictures and our
// 3.4 px grid at 0.2 read as a texture; CS2's imported image keeps its 0.2). The badge's disc is the same (.hud-HA-center: hud-blur-bg-color + world-blur, a circle mask). CS2's world blur
// samples the world only, so an older card under a newer one is hidden; a backdrop filter also sees the older card, so
// an older card shows its plain card (kill_extra / ours without a number) — its number would be under the newer card in
// CS2 anyway (the user's pictures: older cards show only their skulls).
// Everything is laid out in CS2's 1080 p pixels and scaled by the picture's height (gd-display.js gdView; stage 4's HUD
// scale multiplies through setScale).
//
// STATE MACHINE, per round: EMPTY (0 kills: the badge and line only, no card) --kill--> N = 1 … 5 (cards 1 … N in the
// N-kill fan) --6th kill--> EXTRA (the 5-kill fan plus the extra card with the count) --a new round id (the next
// freeze time starts; deathmatch: you respawn)--> EMPTY. Dead (spectating): all hidden; back alive: shown again.
// On each kill the NEW card (card N, or the extra card) plays, on HTML elements, transform / opacity only:
//   0–140 ms    pop-in, scale 1.35 → 1.0, ease-out-back (spec);   0–700 ms CS2's on-kill flash and spotlight;
//   80–400 ms   a bright diagonal shine sweeps across it (320 ms, spec);
//   120–450 ms  a lightning burst: 3–5 jagged arcs out from its rim, a small flash and sparks (spec 250–350 ms) — gold /
//               white with a stronger flash for a headshot, blue / white for a body kill;
//   0–950 ms    its glow, held to ~350 ms, then down over 600 ms (spec).
// The older cards pulse at the same time. The 3rd, 4th and 5th kill burst bigger (tiers 1–3), the ace (5th) adds a ring
// wave. Wallbang, no-scope, through-smoke and blind kills carry a small mark on the card's left edge (the kill feed's
// marks: CS2's when imported). "Reduce flashes" (the preference reduceFlashes, or the system's reduced motion) tones
// the flash, lightning, sparks, glow and ring down.
// A delayed part's first keyframe is invisible (opacity 0): nothing shows before its moment.
// ART: CS2's kill_1 … kill_5, kill_extra, the pips and the team logos (panorama/images/icons/ui/{t,ct}_logo_1c) when
// tools/import-cs2-killfeed.mjs imported them (user-assets, never shipped): drawn as CSS masks in the gold (the cards
// as luminance masks: their black fill clear, the outline and number gold); otherwise our own drawings in the same
// layout. The shine, the lightning and the glow are always ours.
// COST: ONE node set (6 flags with every pip, their bursts, the badge) is built when the HUD is made and reused every
// round. A kill only assigns class strings from tables built at load (the fan is CSS rules per count class; an
// animation restarts by switching between two identically keyed names — no forced reflow) and, past five, a count
// string from a table: nothing allocated. The per-frame update() reads the feed and returns at once unless a new entry,
// a new round, a death or a new screen size is there; names are turned into keys once each (a small cache).
//
// Death panel — when you die: CS2's death panel during the death cam (v53 DEATH: gd-death-panel.js, re-exported at the end).
import { gdView } from './gd-display.js';
import { loadHudPrefs, hudColorOf, PLAYER_COLORS, TEAM_COLOR } from './gd-hud-prefs.js';   // (v53 stage 4: CS2's HUD colour, your player colour, the HUD scale)

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ── Tables (built once) ──
export const SLOTS = 5;          // cards before the extra card (CS2: kill flags 1–5, then .HUD--NumKills--extra)
export const FLAGS = SLOTS + 1;  // + the extra card (index 5)
// CS2's fan (hudhealthammocenter.vcss .HUD--NumKills--N .hud-HA__kill-flagK): [x px, y px, rotateZ deg] per card.
export const FAN = [[],
  [[0, 0, 0]],
  [[-2, 2, -6], [2, 0, 6]],
  [[-3, 4, -12], [0, 2, 0], [3, 0, 12]],
  [[-5, 6, -18], [-2, 4, -6], [2, 2, 6], [5, 0, 18]],
  [[-7, 8, -24], [-3, 6, -12], [0, 4, 0], [3, 2, 12], [7, 0, 24]]];
export const HIDDEN_Y = 42;      // px: a hidden flag rests here (.hud-HA__kill-flag translate3d(0, 42px, 0))
export const FLAG_MS = 200;      // the fan's move (.hud-HA__kill-flag.animate transition-duration 0.2 s)
export const ON_KILL_MS = 700;   // CS2's on-kill / on-kill-spotlight (0.7 s ease-out)
const U = 152 / 126;             // CS2 px per card-SVG unit (126 units drawn 152 px tall)
// v53 LOOK (coord-kill-card-fan, C1, H4): the cards were too small against the user's CS2 pictures. Measured at 1080 p
// (audit-v53-hits k3.png vs cs2-kill-emblem.png / -ace.png, in badge diameters, which the picture's 1.105× sideways
// stretch cancels out of): card 0.71 → CS2 0.79 tall, its top 0.56 → 0.62 above the badge's top, the 3-kill fan
// 1.00 → 1.06 badges wide. The card (with its number, pips and CS2's own mask images) is drawn CARD_SCALE × CS2's
// vcss size about its own centre; the pivot stays CS2's 42.95 px and the fan CS2's FAN, and the cards' centres sit
// CARD_CY px above the badge's centre. fanGeometry() is the model the test checks (corners of every card, turned as
// the CSS turns them); the old model gave 0.716 / 0.578 / 1.038 where the screenshot measured 0.71 / 0.56 / 1.00
// (outline anti-aliasing). v53 LOOK review fix: now MEASURED from the screenshot's pixels (tests/browser/
// gd-emblem-hud-shots.mjs, the badge hidden, the gold outline's rows and columns at 1920 × 1080): the model reads
// 0.016 taller, 0.014 higher and 0.035 wider than the screen (1.113 / 45 measured 0.781 / 0.625 / 1.078 — the card
// short of CS2's 0.79). CARD_SCALE 1.126 and CARD_CY 44 give the model 0.807 / 0.629 / 1.122, so on screen
// 0.79 / 0.615 / 1.087 (CS2 0.79 / 0.62 / 1.06–1.10). The number and the skulls are CS2's own kill_N / kill_pip images,
// scaled with the card (their size against the card is CS2's art's).
export const CARD_SCALE = 1.126;
const UC = U * CARD_SCALE;       // CS2 px per card-SVG unit, on the drawn (scaled) card
export const CARD = { w: 28 * UC, h: 38 * UC, x0: 10, y0: 8.4 };   // the card inside the 48 × 126 SVG (kill_mask: x 10–38, y 8.4–46.4)
export const CARD_CY = 44, PIVOT = 42.95, BADGE = 64, BADGE_BOTTOM = 53;   // px at 1080 p (the pivot from CS2's layout, the rest measured: see the top)
// The fan of n cards in badge diameters: h (a card's height), top (the highest corner above the badge's top), fan (the
// union's width) — the CSS transform: translate (FAN), then rotate about the pivot PIVOT px below the card's centre.
export function fanGeometry(n) {
  const w = CARD.w, h = CARD.h; let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  for (const [tx, ty, r] of FAN[n] || []) { const a = r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k < 4; k++) { const px = k & 1 ? w / 2 : -w / 2, py = (k & 2 ? h / 2 : -h / 2) - PIVOT;
      const X = px * c - py * s + tx, Y = px * s + py * c + PIVOT + ty - CARD_CY; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; } }
  return { h: h / BADGE, top: (-y0 - BADGE / 2) / BADGE, fan: (x1 - x0) / BADGE };
}
// Kill kinds: which pip a card shows (CS2's .HUD--KillN--<kind> classes).
export const KIND = { body: 0, head: 1, slash: 2, blast: 3, burn: 4, shock: 5 }; const KIND_N = 6;
export const PIP_NAMES = ['default', 'headshot', 'slash', 'blast', 'burn', 'shock'];
export const pipKind = (wid, head) => head ? 1 : wid === 'knife' || wid === 'karambit' || String(wid || '').startsWith('knife') ? 2 : wid === 'he' ? 3 : wid === 'molotov' || wid === 'incendiary' ? 4 : wid === 'taser' || wid === 'zeus' ? 5 : 0;
// Marks (bits): wallbang 1 · no-scope 2 · through smoke 4 · blind 8 (the kill feed's f.how — combat-logic.js).
export const MARK_KEYS = ['wallbang', 'noscope', 'smoke', 'blind'];
export const markBits = how => !how ? 0 : (how.wallbang ? 1 : 0) | (how.noscope ? 2 : 0) | (how.smoke ? 4 : 0) | (how.blind ? 8 : 0);
// A card's animation state: 0 still · 1 / 2 the new-kill burst (two names: switching restarts it) · 3 / 4 a pulse.
const ANIM = ['', ' nA', ' nB', ' pA', ' pB'], MARK_CLS = ['', ' mw', ' mn', ' ms', ' mb'];
export const EMBLEM_CLASS = [];   // [((kind * 16 + marks) * 5 + anim)] → the card's class string
for (let k = 0; k < KIND_N; k++) for (let m = 0; m < 16; m++) for (let a = 0; a < 5; a++) {
  let s = 'ke-c k' + k + (k === 1 ? ' h' : ''); for (let b = 0; b < 4; b++) if (m & (1 << b)) s += MARK_CLS[b + 1]; EMBLEM_CLASS.push(s + ANIM[a]); }
const cardClass = (kind, marks, anim) => EMBLEM_CLASS[(kind * 16 + marks) * 5 + anim];
// Burst size by kill number: 1st–2nd tier 0, 3rd 1, 4th 2, 5th (ace) 3 + ring, past 5 tier 3.
export const TIER_CLASS = ['ke-bx', 'ke-bx t1', 'ke-bx t2', 'ke-bx t3', 'ke-bx t3 ace'];
export const tierOf = n => n >= 6 ? 3 : n === 5 ? 4 : n === 4 ? 2 : n === 3 ? 1 : 0;
// The root: count (0 … 5, x = extra) · reduce flashes · team.
const NCLS = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'nx'];
export const ROOT_CLASS = []; for (let c = 0; c < 7; c++) for (let rf = 0; rf < 2; rf++) for (let ct = 0; ct < 2; ct++) ROOT_CLASS.push('gd-ke ' + NCLS[c] + (rf ? ' rf' : '') + (ct ? ' ct' : ' t'));
const rootClass = (n, rf, ct) => ROOT_CLASS[((n > SLOTS ? 6 : n) * 2 + (rf ? 1 : 0)) * 2 + (ct ? 1 : 0)];
const COUNT = []; for (let i = 0; i < 100; i++) COUNT.push(String(i)); COUNT.push('99+');   // (the extra card's count)

// ── Our own art (original drawings in CS2's layout; CS2's files replace them when imported) ──
// Pips, each drawn in a 10 × 10 box (gold: currentColor; holes by the even-odd rule).
const SKULL_D = 'M5 .5C2.3.5.7 2.3.7 4.6c0 1.5.7 2.6 1.6 3.2V9c0 .3.2.5.5.5h4.4c.3 0 .5-.2.5-.5V7.8c.9-.6 1.6-1.7 1.6-3.2C9.3 2.3 7.7.5 5 .5zM2.3 4.9a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 1 0-2.3 0zM5.4 4.9a1.15 1.15 0 1 0 2.3 0 1.15 1.15 0 1 0-2.3 0zM5 6.2l-.55 1h1.1zM3.9 8.3h.4v1.2h-.4zM5.7 8.3h.4v1.2h-.4z';
const starD = (cx, cy, ro, ri, pts) => { let d = ''; for (let i = 0; i < pts * 2; i++) { const r = i & 1 ? ri : ro, a = Math.PI * i / pts - Math.PI / 2; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2); } return d + 'z'; };
const PIP_D = [
  SKULL_D,                                                                                   // default: a skull
  SKULL_D + 'M4.4 2.5a.6.6 0 1 0 1.2 0 .6.6 0 1 0-1.2 0z' + starD(8.9, 1.1, 1.3, .45, 4),   // headshot: a hole in the brow and a spark
  'M.8 9.2l1-1.9 5.6-5.6C8.3 1 9.2.6 9.5.5c-.1.4-.5 1.2-1.2 2.1L2.7 8.2zM1.2 6.6l2.2 2.2-.7.7-2.2-2.2z',   // slash: a knife
  starD(5, 5, 4.8, 2, 8),                                                                    // blast: a burst
  'M5 .4C6 2.4 8.6 3.6 8.6 6.4 8.6 8.4 7 9.6 5 9.6S1.4 8.4 1.4 6.4c0-1.6 1-2.6 1.8-3.4 0 1.2.5 2 1.2 2.3C4.2 3.6 4.4 2 5 .4zM5 9c1 0 1.7-.6 1.7-1.6 0-1-.9-1.6-1.4-2.6-.6.9-2 1.6-2 2.6S4 9 5 9z',   // burn: a flame
  'M6.2.4L1.8 5.6h2.6L3.4 9.6l4.8-5.4H5.6z',                                                // shock: a bolt
];
// In the card's own box (28 × 38, CS2's kill_mask rect): the upright pip top left, the same turned 180° bottom right
// (CS2's kill_pip_* layout), the number in the middle (CS2's kill_N: x 10.8–17, y 13.3–24 of the card).
const pipPair = k => `<path fill-rule="evenodd" transform="translate(3 2.6) scale(.8 1)" d="${PIP_D[k]}"/><path fill-rule="evenodd" transform="rotate(180 14 19) translate(3 2.6) scale(.8 1)" d="${PIP_D[k]}"/>`;
const OWN_CARD = num => `<svg class="ke-svg" viewBox="0 0 28 38" aria-hidden="true"><rect x=".5" y=".5" width="27" height="37" rx="4.3" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity=".82"/>${num ? `<text x="14" y="23.6" text-anchor="middle" font-size="13" font-weight="800" font-family="system-ui,-apple-system,Segoe UI,sans-serif" fill="currentColor">${num}</text>` : ''}</svg>`;
// The ace (5th kill): CS2's kill_5 is a big spade with a skull cut out of it (the decompiled kill_5.vsvg: the spade from
// y 14.4 to 36.4 of the 48 × 126 SVG, x 13–35 — in the card's box 3.2–24.8 × 6–28) with the kill's pips in the corners
// as on every card (the user's ace picture: skulls top left and bottom right, no letter). Ours the same, in the card's
// 28 × 38 box: the spade scaled up and a skull hole (an SVG mask, one per page: only the 5th flag draws it).
const SPADE_D = 'M14 9.5c-2.6 3.4-6.6 5.8-6.6 9.2 0 2.2 1.7 3.6 3.5 3.6 1.1 0 2.1-.5 2.6-1.3-.3 1.8-1 3.2-2.3 4.3h5.6c-1.3-1.1-2-2.5-2.3-4.3.5.8 1.5 1.3 2.6 1.3 1.8 0 3.5-1.4 3.5-3.6 0-3.4-4-5.8-6.6-9.2z';
const OWN_ACE = `<svg class="ke-svg" viewBox="0 0 28 38" aria-hidden="true"><defs><mask id="gd-ke-ace-m" maskUnits="userSpaceOnUse" x="0" y="0" width="28" height="38"><path fill="#fff" transform="translate(14 17.6) scale(1.62 1.34) translate(-14 -17.8)" d="${SPADE_D}"/><path fill="#000" fill-rule="evenodd" transform="translate(10.2 12.6) scale(.76)" d="${SKULL_D}"/></mask></defs><rect x=".5" y=".5" width="27" height="37" rx="4.3" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity=".82"/><rect width="28" height="38" fill="currentColor" mask="url(#gd-ke-ace-m)"/></svg>`;
export const OWN_PIP = PIP_D.map((_, k) => `<svg class="ke-svg" viewBox="0 0 28 38" aria-hidden="true"><g fill="currentColor">${pipPair(k)}</g></svg>`);
// The team logos (64 × 64): T — a star over two crossed knives; CT — a shield with a star (ours).
const KNIFE = 'M0 0C9-4.6 23-6 32-2.6L39 .2 32 1.8C23 3 11 3.4 0 2.4zM-3-2.6h2.4v7.6H-3zM-12 .1h9v2.2h-9z';
const OWN_LOGO = {
  t: `<svg class="ke-svg" viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><path d="${starD(32, 17.5, 11.5, 4.6, 5)}"/><path d="${KNIFE}" transform="translate(12.5 51) rotate(-36)"/><path d="${KNIFE}" transform="translate(64 0) scale(-1 1) translate(12.5 51) rotate(-36)"/></g></svg>`,
  ct: `<svg class="ke-svg" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M32 6l21 7.4V31c0 13.6-9.4 22-21 27-11.6-5-21-13.4-21-27V13.4zM32 10.4l-17 6V31c0 11 7.4 18.4 17 22.8C41.6 49.4 49 42 49 31V16.4z${starD(32, 31, 11, 4.4, 5)}"/></svg>`,
};
const OWN_MARK = {   // (tiny versions of the kill feed's own marks)
  wallbang: '<svg viewBox="0 0 16 16"><path d="M2 2h5v12H2z" fill="#fff" opacity=".55"/><path d="M1 8h14M11 5l4 3-4 3" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  noscope: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M2 14L14 2" stroke="#f55" stroke-width="2"/></svg>',
  smoke: '<svg viewBox="0 0 16 16"><path d="M3 12a3 3 0 0 1 1-5.8A4 4 0 0 1 11.6 5 3.5 3.5 0 1 1 12 12z" fill="#fff"/></svg>',
  blind: '<svg viewBox="0 0 16 16"><path d="M1 8c3-4.5 11-4.5 14 0-3 4.5-11 4.5-14 0z" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="8" cy="8" r="2.2" fill="#fff"/><path d="M2 14L14 2" stroke="#fff" stroke-width="1.8"/></svg>',
};
// Lightning: 5 jagged arcs per card, each its OWN HTML wrapper holding a static SVG (an animated SVG child would be
// styled, laid out and painted on the main thread every frame; an HTML wrapper's transform / opacity is the
// compositor's), from the card's rim outwards, and 6 sparks (a wrapper turned once, the spark inside flying out) —
// drawn once per flag from a fixed seed, so every flag has its own shape and nothing is made per kill.
function arcsHTML(seed) {
  let s = seed >>> 0 || 1; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let h = '';
  for (let j = 0; j < 5; j++) {
    const a0 = (j * 72 + seed * 23 + (rnd() - .5) * 30) * Math.PI / 180; let d = '', fork = '';
    for (let k = 0; k <= 5; k++) { const r = 21 + k * 4.6, side = k === 0 || k === 5 ? 0 : (rnd() - .5) * 9, a = a0 + side / r;
      const x = (Math.sin(a) * r).toFixed(1), y = (-Math.cos(a) * r).toFixed(1); d += (k ? 'L' : 'M') + x + ' ' + y;
      if (k === 2) { const fa = a + (rnd() > .5 ? .38 : -.38), fr = r + 9; fork = `M${x} ${y}L${(Math.sin(fa) * fr).toFixed(1)} ${(-Math.cos(fa) * fr).toFixed(1)}`; } }
    h += `<i class="ke-a a${j + 1}"><svg viewBox="-50 -50 100 100" aria-hidden="true"><path class="o" d="${d}${fork}"/><path class="c" d="${d}${fork}"/></svg></i>`; }
  return h; }
const SPARK_HTML = seed => { let h = ''; for (let i = 0; i < 6; i++) h += `<i class="ke-sw" style="transform:rotate(${(i * 60 + 25 + seed * 31) % 360}deg)"><i class="ke-sp"></i></i>`; return h; };

// The fan as CSS rules per count class (no inline transform written per kill).
const fanCSS = () => { let s = ''; const tf = ([x, y, r]) => `translate3d(${x}px,${y}px,0) rotate(${r}deg)`;
  for (let n = 1; n <= SLOTS; n++) for (let k = 0; k < n; k++) s += `.gd-ke.n${n} .ke-f${k + 1}${n === SLOTS ? `,.gd-ke.nx .ke-f${k + 1}` : ''}{transform:${tf(FAN[n][k])};visibility:visible}`;
  return s + '.gd-ke.nx .ke-f6{transform:translate3d(0,0,0) rotate(0deg);visibility:visible}'; };
// Older cards (all but the newest; past five, cards 1–4 under the extra card) show their plain card: see the top.
const plainCSS = () => { let s = ''; for (let n = 2; n <= SLOTS + 1; n++) for (let k = 0; k < Math.min(n - 1, SLOTS - 1); k++) s += `.gd-ke.${n > SLOTS ? 'nx' : 'n' + n} .ke-f${k + 1} .ke-cd{display:none}.gd-ke.${n > SLOTS ? 'nx' : 'n' + n} .ke-f${k + 1} .ke-cp{display:block}`; return s; };
const px = v => +v.toFixed(2) + 'px';
export const KILL_EMBLEM_CSS = `
.gd-ke{position:fixed;left:0;top:0;width:0;height:0;z-index:36;pointer-events:none;transform-origin:0 0;--g:#eabe54;--ring:#88cef5;--tm:#eabe54}.gd-ke[hidden]{display:none}
.ke-ln{position:absolute;top:-.5px;width:240px;height:1px;opacity:.85}.ke-ln.l{right:0;background:linear-gradient(270deg,var(--g),transparent)}.ke-ln.r{left:0;background:linear-gradient(90deg,var(--g),transparent)}
.ke-f{position:absolute;left:${px(-CARD.w / 2)};top:${px(-CARD_CY - CARD.h / 2)};width:${px(CARD.w)};height:${px(CARD.h)};transform-origin:50% calc(50% + ${PIVOT}px);transform:translate3d(0,${HIDDEN_Y}px,0) rotate(0deg);visibility:hidden;transition:transform ${FLAG_MS}ms ease-in-out}
${fanCSS()}
.ke-c{position:absolute;inset:0;transform-origin:50% 50%;color:var(--g)}
.ke-gl{position:absolute;left:-18px;top:-16px;right:-18px;bottom:-16px;border-radius:50%;opacity:0;background:radial-gradient(closest-side,#9fd2ffaa,#5aa8ff55 55%,#5aa8ff00)}.ke-c.h .ke-gl{background:radial-gradient(closest-side,#ffe9a8cc,#ffbf3a66 55%,#ffbf3a00)}
.ke-bg{position:absolute;inset:0;border-radius:${px(4.8 * UC)};background:#0000;-webkit-backdrop-filter:blur(2px) brightness(.373);backdrop-filter:blur(2px) brightness(.373)}.ke-bg.ke-mk{border-radius:0;background:#0000}
.ke-dt{position:absolute;inset:0;border-radius:${px(4.8 * UC)};opacity:var(--dots-o,.05);background-image:var(--dots,radial-gradient(circle,#fff 0 .6px,#fff0 1px));background-size:var(--dots-size,3.4px 3.4px)}
.ke-cp{display:none}${plainCSS()}
.ke-svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}
.ke-mk{position:absolute;left:${px(-CARD.x0 * UC)};top:${px(-CARD.y0 * UC)};width:${px(48 * UC)};height:${px(152 * CARD_SCALE)};background:var(--g);-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}.ke-mk.lum{mask-mode:luminance}
.ke-p{position:absolute;inset:0;display:none}.ke-c.k0 .ke-p.k0,.ke-c.k1 .ke-p.k1,.ke-c.k2 .ke-p.k2,.ke-c.k3 .ke-p.k3,.ke-c.k4 .ke-p.k4,.ke-c.k5 .ke-p.k5{display:block}.ke-f6 .ke-p{display:none!important}
.ke-cn{position:absolute;left:0;right:0;top:${px(12 * UC)};text-align:center;font:800 ${px(21 * CARD_SCALE)}/1 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--g);text-shadow:0 1px 2px #0008}
.ke-wh{position:absolute;inset:0;border-radius:${px(4.8 * UC)};background:#fff;opacity:0}
.ke-cl{position:absolute;inset:0;border-radius:${px(4.8 * UC)};overflow:hidden}
.ke-sh{position:absolute;left:0;top:-30%;width:45%;height:160%;opacity:0;background:linear-gradient(90deg,#fff0,#ffffffd0 45%,#fff 50%,#ffffffd0 55%,#fff0);transform:translateX(-140%) rotate(24deg)}
.ke-spot{position:absolute;left:50%;bottom:50%;width:36px;height:100px;margin-left:-18px;border-radius:10px;background:linear-gradient(0deg,#fff,#fff0);opacity:0}
.ke-m{position:absolute;left:${px(2.6 * UC)};width:${px(7.4 * UC)};height:${px(7.4 * UC)};display:none;filter:drop-shadow(0 0 1px #000)}.ke-m svg,.ke-m img{width:100%;height:100%;display:block}
.ke-m.mw{top:${px(14 * UC)}}.ke-m.mn{top:${px(21.6 * UC)}}.ke-m.ms{top:${px(29.2 * UC)}}.ke-m.mb{top:${px(14 * UC)};left:auto;right:${px(2.6 * UC)}}
.ke-c.mw .ke-m.mw,.ke-c.mn .ke-m.mn,.ke-c.ms .ke-m.ms,.ke-c.mb .ke-m.mb{display:block}
.ke-bx{position:absolute;left:50%;top:50%;width:0;height:0}.ke-bx.t1{transform:scale(1.15)}.ke-bx.t2{transform:scale(1.32)}.ke-bx.t3{transform:scale(1.5)}
.ke-fw{position:absolute;left:-30px;top:-30px;width:60px;height:60px;opacity:.55}.h~.ke-bx .ke-fw{opacity:1}
.ke-fl{position:absolute;inset:0;border-radius:50%;opacity:0;background:radial-gradient(closest-side,#fff,#bfe2ff99 40%,#7cc0ff00)}.h~.ke-bx .ke-fl{background:radial-gradient(closest-side,#fff,#ffe7a0cc 40%,#ffc24000)}
.ke-a{position:absolute;left:-50px;top:-50px;width:100px;height:100px;opacity:0}.ke-a svg{width:100%;height:100%;display:block;overflow:visible}
.ke-a .o{fill:none;stroke:#7cc4ff;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;opacity:.75}.ke-a .c{fill:none;stroke:#f4fbff;stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
.h~.ke-bx .ke-a .o{stroke:#ffc23d;opacity:.9}.h~.ke-bx .ke-a .c{stroke:#fffbe8;stroke-width:1.3}
.ke-c:not(.h)~.ke-bx:not(.t1):not(.t2):not(.t3) .a4,.ke-bx:not(.t1):not(.t2):not(.t3) .a5,.ke-c:not(.h)~.ke-bx.t1 .a5{display:none}
.ke-sw{position:absolute;left:0;top:0;width:0;height:0}.ke-sp{position:absolute;left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%;background:#e8f6ff;box-shadow:0 0 4px #8fd0ff;opacity:0}.h~.ke-bx .ke-sp{background:#fff6d0;box-shadow:0 0 4px #ffc23d}
.ke-rg{position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;box-shadow:0 0 0 2px #ffe08acc,0 0 10px #ffc23d88;opacity:0;display:none}.ke-bx.ace .ke-rg{display:block}
.ke-bd{position:absolute;left:${-BADGE / 2}px;top:${-BADGE / 2}px;width:${BADGE}px;height:${BADGE}px;border-radius:50%;background:#0000;-webkit-backdrop-filter:blur(2px) brightness(.373);backdrop-filter:blur(2px) brightness(.373);box-shadow:inset 0 0 0 3px var(--ring),0 0 2px #0006}
.ke-lg{position:absolute;inset:9px;color:var(--tm)}.ke-lg .ke-mk{left:0;top:0;width:100%;height:100%;mask-mode:alpha}.gd-ke.ct .ke-lg.t,.gd-ke.t .ke-lg.ct{display:none}
.nA{animation:ke-pop0 140ms cubic-bezier(.34,1.56,.64,1) both}.nB{animation:ke-pop1 140ms cubic-bezier(.34,1.56,.64,1) both}
.pA{animation:ke-pu0 260ms ease-out both}.pB{animation:ke-pu1 260ms ease-out both}
.nA .ke-wh{animation:ke-wh0 ${ON_KILL_MS}ms ease-out both}.nB .ke-wh{animation:ke-wh1 ${ON_KILL_MS}ms ease-out both}
.nA .ke-spot{animation:ke-spot0 ${ON_KILL_MS}ms ease-out both}.nB .ke-spot{animation:ke-spot1 ${ON_KILL_MS}ms ease-out both}
.nA .ke-sh{animation:ke-sh0 320ms 80ms ease-in-out both}.nB .ke-sh{animation:ke-sh1 320ms 80ms ease-in-out both}
.nA .ke-gl{animation:ke-gl0 950ms linear both}.nB .ke-gl{animation:ke-gl1 950ms linear both}.pA .ke-gl{animation:ke-gp0 260ms ease-out both}.pB .ke-gl{animation:ke-gp1 260ms ease-out both}
.nA~.ke-bx .ke-fl{animation:ke-fl0 300ms 120ms ease-out both}.nB~.ke-bx .ke-fl{animation:ke-fl1 300ms 120ms ease-out both}
.nA~.ke-bx .ke-a{animation:ke-ar0 300ms 120ms linear both}.nB~.ke-bx .ke-a{animation:ke-ar1 300ms 120ms linear both}
.ke-bx .a2{animation-delay:150ms!important}.ke-bx .a3{animation-delay:135ms!important}.ke-bx .a4{animation-delay:170ms!important}.ke-bx .a5{animation-delay:160ms!important}
.nA~.ke-bx .ke-sp{animation:ke-spk0 340ms 130ms ease-out both}.nB~.ke-bx .ke-sp{animation:ke-spk1 340ms 130ms ease-out both}
.nA~.ke-bx .ke-rg{animation:ke-rg0 700ms 120ms ease-out both}.nB~.ke-bx .ke-rg{animation:ke-rg1 700ms 120ms ease-out both}
.rf .ke-a{opacity:.22!important}.rf .ke-fw{opacity:.15!important}.rf .ke-sp,.rf .ke-rg,.rf .ke-gl,.rf .ke-spot{display:none!important}.rf .ke-sh{background:linear-gradient(90deg,#fff0,#ffffff55 50%,#fff0)}.rf .ke-wh{background:#ffffff40}
@keyframes ke-pop0{0%{transform:scale(1.35)}100%{transform:scale(1)}}@keyframes ke-pop1{0%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes ke-pu0{0%{transform:scale(1)}40%{transform:scale(1.08)}100%{transform:scale(1)}}@keyframes ke-pu1{0%{transform:scale(1)}40%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes ke-wh0{0%{opacity:.62}30%{opacity:.62}100%{opacity:0}}@keyframes ke-wh1{0%{opacity:.62}30%{opacity:.62}100%{opacity:0}}
@keyframes ke-spot0{0%{opacity:0}1%{opacity:.2}30%{opacity:.2}100%{opacity:0}}@keyframes ke-spot1{0%{opacity:0}1%{opacity:.2}30%{opacity:.2}100%{opacity:0}}
@keyframes ke-sh0{0%{opacity:0;transform:translateX(-140%) rotate(24deg)}1%{opacity:1}100%{opacity:1;transform:translateX(300%) rotate(24deg)}}@keyframes ke-sh1{0%{opacity:0;transform:translateX(-140%) rotate(24deg)}1%{opacity:1}100%{opacity:1;transform:translateX(300%) rotate(24deg)}}
@keyframes ke-gl0{0%{opacity:0}10%{opacity:1}37%{opacity:1}100%{opacity:0}}@keyframes ke-gl1{0%{opacity:0}10%{opacity:1}37%{opacity:1}100%{opacity:0}}
@keyframes ke-gp0{0%{opacity:0}35%{opacity:.45}100%{opacity:0}}@keyframes ke-gp1{0%{opacity:0}35%{opacity:.45}100%{opacity:0}}
@keyframes ke-fl0{0%{opacity:0;transform:scale(.4)}18%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.45)}}@keyframes ke-fl1{0%{opacity:0;transform:scale(.4)}18%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.45)}}
@keyframes ke-ar0{0%{opacity:0;transform:scale(.8)}8%{opacity:1}22%{opacity:.2}34%{opacity:1;transform:scale(.97)}52%{opacity:.5}66%{opacity:1}100%{opacity:0;transform:scale(1.12)}}@keyframes ke-ar1{0%{opacity:0;transform:scale(.8)}8%{opacity:1}22%{opacity:.2}34%{opacity:1;transform:scale(.97)}52%{opacity:.5}66%{opacity:1}100%{opacity:0;transform:scale(1.12)}}
@keyframes ke-spk0{0%{opacity:0;transform:translateY(-20px) scale(1)}1%{opacity:1;transform:translateY(-20px) scale(1)}100%{opacity:0;transform:translateY(-40px) scale(.3)}}@keyframes ke-spk1{0%{opacity:0;transform:translateY(-20px) scale(1)}1%{opacity:1;transform:translateY(-20px) scale(1)}100%{opacity:0;transform:translateY(-40px) scale(.3)}}
@keyframes ke-rg0{0%{opacity:0;transform:scale(.3)}1%{opacity:.95;transform:scale(.32)}100%{opacity:0;transform:scale(3.4)}}@keyframes ke-rg1{0%{opacity:0;transform:scale(.3)}1%{opacity:.95;transform:scale(.32)}100%{opacity:0;transform:scale(3.4)}}
.gd-dp{position:fixed;left:50%;bottom:84px;z-index:39;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:7px 14px 7px 12px;border-radius:6px;background:linear-gradient(90deg,#3a0c0ce6,#160909e0);border:1px solid #ff5a4a66;color:#fff;font:700 14px system-ui;text-shadow:0 1px 2px #000;pointer-events:none;animation:gd-dp-in .22s ease-out both}.gd-dp[hidden]{display:none}
.gd-dp small{font:700 10px system-ui;letter-spacing:.14em;color:#ffb0a8}.gd-dp b{font-size:16px}.gd-dp .hp{font:700 12px ui-monospace,Menlo,monospace;color:#cfd8de}.gd-dp .kw{height:24px;width:auto;max-width:110px;filter:drop-shadow(0 0 1px #000)}.gd-dp .wi{height:20px;max-width:64px;object-fit:contain;filter:brightness(0) invert(1) drop-shadow(0 0 1px #000)}.gd-dp .km{height:20px;width:20px;filter:drop-shadow(0 0 1px #000)}.gd-dp .hs{color:#ff6b5a}.gd-dp svg{flex:none}
@keyframes gd-dp-in{0%{opacity:0;transform:translate(-50%,8px)}100%{opacity:1;transform:translate(-50%,0)}}`;

// The reduce-flashes choice: the preference (Settings, stage 4: preference key reduceFlashes) or the system's reduced
// motion. Read on load and on each preferences change — never per kill.
export function reduceFlashesNow(prefs) { if (prefs && prefs.reduceFlashes === true) return true; if (loadHudPrefs().reduceFlashes) return true;   /* (stage 4: Settings → HUD → Reduce flashes, gd-hud-prefs.js) */ try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; } }

// An imported picture as a gold CSS mask (lum: a luminance mask — CS2's cards: black fill clear, outline / number gold).
const maskHTML = (url, lum) => { const u = String(url).replace(/["'()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')); return `<i class="ke-mk${lum ? ' lum' : ''}" style="-webkit-mask-image:url('${u}');mask-image:url('${u}')"></i>`; };

// The tally. art: { url(group, name) → URL | null — CS2's picture when imported: group 'card' (1 … 5, 'extra'), 'pip'
// (PIP_NAMES), 'logo' ('t', 'ct') — and mark(key, ours) → html } (arena-ui.js: the kill feed's icons). Returns
// { root, kill(kind, marks), clear(), update(on, G, me, now), setArt(art), setReduce(b), setScale(k), count }.
export function createKillEmblems({ doc = globalThis.document, parent = doc?.body, art = null, reduce = false } = {}) {
  const url = (g, n) => { try { return art?.url?.(g, n) || null; } catch { return null; } };
  const cardHTML = i => { const u = url('card', i < SLOTS ? String(i + 1) : 'extra'); return u ? maskHTML(u, true) : i === SLOTS - 1 ? OWN_ACE : OWN_CARD(i < SLOTS ? String(i + 1) : ''); };   // (the 5th: the ace card, CS2's kill_5 — a spade and an A, ours drawn the same way)
  const plainHTML = () => { const u = url('card', 'extra'); return u ? maskHTML(u, true) : OWN_CARD(''); };   // (an older card: CS2's kill_extra — the card without a number — or ours)
  const pipHTML = k => { const u = url('pip', PIP_NAMES[k]); return u ? maskHTML(u, false) : OWN_PIP[k]; };
  const logoHTML = t => { const u = url('logo', t); return u ? maskHTML(u, false) : OWN_LOGO[t]; };
  const bgHTML = () => { const u = url('card', 'mask'); return u ? maskHTML(u, false).replace('class="ke-mk', 'class="ke-bg ke-mk') : '<i class="ke-bg"></i>'; };   // (CS2's kill_mask: the card's shape; ours the same rect, x 10–38 / y 8.4–46.4, corners 4.8)
  const markHTML = k => art?.mark ? art.mark(k, OWN_MARK[k]) : OWN_MARK[k];
  let h = '<i class="ke-ln l"></i><i class="ke-ln r"></i><div class="ke-fan">';
  for (let i = 0; i < FLAGS; i++) {
    let ic = ''; for (let k = 0; k < KIND_N; k++) ic += `<span class="ke-p k${k}">${pipHTML(k)}</span>`;
    let mk = ''; for (let b = 0; b < 4; b++) mk += `<span class="ke-m${MARK_CLS[b + 1]}">${markHTML(MARK_KEYS[b])}</span>`;
    h += `<div class="ke-f ke-f${i + 1}"><div class="${cardClass(0, 0, 0)}"><i class="ke-spot"></i><i class="ke-gl"></i><span class="ke-bw">${bgHTML()}</span><i class="ke-dt"></i><span class="ke-cd">${cardHTML(i)}</span>${i < SLOTS - 1 ? `<span class="ke-cp">${plainHTML()}</span>` : ''}${ic}${i === SLOTS ? '<b class="ke-cn"></b>' : ''}${mk}<i class="ke-wh"></i><span class="ke-cl"><i class="ke-sh"></i></span></div>`
      + `<div class="${TIER_CLASS[0]}"><div class="ke-fw"><i class="ke-fl"></i></div>${arcsHTML(i * 7 + 3)}${SPARK_HTML(i)}<i class="ke-rg"></i></div></div>`; }
  h += `</div><div class="ke-bd"><span class="ke-lg t">${logoHTML('t')}</span><span class="ke-lg ct">${logoHTML('ct')}</span></div>`;
  const root = doc.createElement('div'); root.id = 'gd-ke'; root.className = rootClass(0, reduce, false); root.hidden = true; root.innerHTML = h;
  if (doc.getElementById && !doc.getElementById('gd-ke-css')) { const css = doc.createElement('style'); css.id = 'gd-ke-css'; css.textContent = KILL_EMBLEM_CSS; (doc.head || doc.body).append?.(css); }
  parent?.append?.(root);
  // CS2's card dots (bluedots_large, tools/import-cs2-hud.mjs → user-assets/icons/hud/hud.json "kill_dots"), once per page.
  if (typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) fetch('/user-assets/icons/hud/hud.json').then(r => r.ok ? r.json() : null).then(m => { const f = m?.icons?.kill_dots; if (!f) return; setVar('--dots', `url('/user-assets/icons/hud/${encodeURIComponent(f)}?h=${encodeURIComponent(m.hash || '')}')`); setVar('--dots-size', '360px 360px'); setVar('--dots-o', '.2'); }).catch(() => {});
  const F = []; const q = (el, s) => el.querySelector(s);
  for (let i = 0; i < FLAGS; i++) { const f = q(root, '.ke-f' + (i + 1)); F.push({ f, c: q(f, '.ke-c'), bx: q(f, '.ke-bx'), cd: q(f, '.ke-cd'), cp: q(f, '.ke-cp'), bw: q(f, '.ke-bw'), cn: i === SLOTS ? q(f, '.ke-cn') : null, ic: f.querySelectorAll('.ke-p'), mk: f.querySelectorAll('.ke-m'), par: 0 }); }
  const LG = root.querySelectorAll('.ke-lg');
  // The round's kills: kind and marks of the first five (CS2's flags 1–5 keep theirs) and the newest (the extra card).
  const KK = new Uint8Array(SLOTS), KM = new Uint8Array(SLOTS); let n = 0, rf = !!reduce, ct = false, lastKind = 0, lastMarks = 0;
  // Feed reading state: the newest feed time taken, and the victims already taken at that same millisecond (a
  // collateral: two kills in one host ms).
  let lastAt = -Infinity, sameN = 0, lastRound, wasDown = false; const SAME = [null, null, null, null];
  // Names → keys, once each (no string made per feed line or frame); a fresh map past 256 names.
  const KEYS = new Map(); const kOf = nm => { let k = KEYS.get(nm); if (k === undefined) { if (KEYS.size > 256) KEYS.clear(); k = key(nm); KEYS.set(nm, k); } return k; };
  // Screen fit: the badge's centre over the picture's bottom centre, CS2's 1080 p pixels scaled by its height.
  let scale = 1, fitW = -1, fitH = -1, fitX = -1, fitY = -1;
  function fit(force) {
    const on = !!gdView?.on && gdView.w > 0 && gdView.h > 0, W = on ? gdView.w : (globalThis.innerWidth || 1920), H = on ? gdView.h : (globalThis.innerHeight || 1080), X = on ? gdView.x || 0 : 0, Y = on ? gdView.y || 0 : 0;
    if (!force && W === fitW && H === fitH && X === fitX && Y === fitY) return; fitW = W; fitH = H; fitX = X; fitY = Y;
    const k = H / 1080 * scale; root.style.transform = `translate3d(${(X + W / 2).toFixed(1)}px,${(Y + H - BADGE_BOTTOM * k).toFixed(1)}px,0) scale(${k.toFixed(4)})`; }   // (a string only when the screen changed)
  // Colours (v53 stage 4, verified against the user's two CS2 pictures with CS2's csgostyles.vcss values): the cards, their
  // numbers / pips and the line take the HUD colour (cl_hud_color: picture 1 Team Color = t-color #eabe54 — sampled
  // (228, 188, 88); the ace picture White = color-hud-1 #e8e8e8 — sampled (231, 232, 235)); the badge's RING is your
  // player colour (picture 1 light blue = color-player-blue rgb(136, 206, 245); the ace picture green =
  // color-player-green rgb(29, 162, 132) — sampled (79, 149, 133)); the logo is your team's colour (gold in both
  // pictures). Not a rule per kill count: the same kill count would look the same with the same settings. Written
  // only when a colour changes (a new round, side or HUD option).
  let hudPrefs = loadHudPrefs(), colCard = '', colRing = '', colLogo = '', colRound;
  function colors(ts, me) { colRound = lastRound; let slot = 0, i = 0; const side = ts?.[me] || 't'; if (ts) for (const k in ts) { if (ts[k] !== side) continue; if (k === me) { slot = i; break; } i++; }
    const c = hudColorOf(hudPrefs, side, slot), r = PLAYER_COLORS[slot % 5], l = side === 'ct' ? TEAM_COLOR.ct : TEAM_COLOR.t;
    if (c !== colCard) { colCard = c; setVar('--g', c); } if (r !== colRing) { colRing = r; setVar('--ring', r); } if (l !== colLogo) { colLogo = l; setVar('--tm', l); } }
  const setVar = (k, v) => { const st = root.style; if (typeof st.setProperty === 'function') st.setProperty(k, v); else st[k] = v; };
  globalThis.addEventListener?.('gd-hud-prefs', e => { hudPrefs = e.detail || loadHudPrefs(); api.setScale(hudPrefs.scale); api.setReduce(reduceFlashesNow(null)); colCard = ''; colors(lastTeams, lastMe); });
  let lastTeams = null, lastMe = '';
  const setRoot = () => { root.className = rootClass(n, rf, ct); };
  function paint(newest) {   // newest: the flag that bursts (−1: none — a redraw)
    setRoot();
    const shown = Math.min(n, SLOTS);
    for (let i = 0; i < FLAGS; i++) { const s = F[i], vis = i < shown || (i === SLOTS && n > SLOTS); if (!vis) continue;
      const kind = i < SLOTS ? KK[i] : lastKind, marks = i < SLOTS ? KM[i] : lastMarks;
      let anim = 0; if (newest >= 0) { s.par ^= 1; anim = i === newest ? 1 + s.par : 3 + s.par; }
      s.c.className = cardClass(kind, marks, anim);
      if (i === newest) s.bx.className = TIER_CLASS[tierOf(n)]; }
    if (n > SLOTS) F[SLOTS].cn.textContent = COUNT[Math.min(100, n)]; }
  const api = {
    root,
    get count() { return n; },
    // A kill of yours: kind (KIND / pipKind), marks (markBits). No allocation.
    kill(kind, marks) { if (n < SLOTS) { KK[n] = kind; KM[n] = marks & 15; } lastKind = kind; lastMarks = marks & 15; n++; paint(n > SLOTS ? SLOTS : n - 1); },
    clear() { if (!n) return; n = 0; setRoot(); for (let i = 0; i < FLAGS; i++) { const s = F[i]; s.c.className = EMBLEM_CLASS[0]; s.bx.className = TIER_CLASS[0]; } },
    setReduce(b) { b = !!b; if (b === rf) return; rf = b; setRoot(); },
    // Stage 4's HUD scale (0.8–1.4): multiplies the 1080 p fit.
    setScale(k) { k = Number.isFinite(+k) && +k > 0 ? +k : 1; if (k === scale) return; scale = k; fit(true); },
    get colors() { return { card: colCard, ring: colRing, logo: colLogo }; },
    // CS2's pictures arrived (or went): the cards, pips, logos and marks rewritten once, in place.
    setArt(a) { art = a; for (let i = 0; i < FLAGS; i++) { const s = F[i]; s.cd.innerHTML = cardHTML(i); if (s.cp) s.cp.innerHTML = plainHTML(); s.bw.innerHTML = bgHTML(); for (let k = 0; k < KIND_N; k++) s.ic[k].innerHTML = pipHTML(k); for (let b = 0; b < 4; b++) s.mk[b].innerHTML = markHTML(MARK_KEYS[b]); }
      LG[0].innerHTML = logoHTML('t'); LG[1].innerHTML = logoHTML('ct'); },
    // Every frame (arena-ui.js): on = in a match; G = the game; me = your key; now = the host's clock (ms).
    update(on, G, me, now) {
      if (!on) { if (!root.hidden) root.hidden = true; return; }
      fit(false);
      const C = G?.combat, D = C?.d, rid = D?.round?.id, ts = D?.teams; lastTeams = ts; lastMe = me;
      if (rid !== lastRound) { if (lastRound !== undefined) api.clear(); lastRound = rid; }   // (a new round: its freeze time starts — spec "clear when the next round's freeze time starts")
      const side = ts?.[me] === 'ct'; if (side !== ct) { ct = side; setRoot(); colors(ts, me); } else if (rid !== colRound) colors(ts, me);
      const dn = C?.down?.[me], down = !!dn && dn.until > now;
      if (!D && wasDown && !down) api.clear();   // (deathmatch has no rounds: the tally is per life)
      wasDown = down;
      if (root.hidden !== down) root.hidden = down;   // (dead: the spectate view's HUD instead)
      const FE = C?.feed;
      if (lastAt === -Infinity) { lastAt = now; sameN = 0; if (FE) for (let i = 0; i < FE.length; i++) { const at = FE[i].at; if (at > lastAt) { lastAt = at; sameN = 0; } if (at === lastAt && sameN < 4) SAME[sameN++] = FE[i].target; } return; }   // (first look: what is in the feed already is no news)
      if (!FE || !FE.length) return;
      for (let i = FE.length - 1; i >= 0; i--) { const f = FE[i], at = f.at; if (!(at >= lastAt)) continue;
        if (at === lastAt) { let seen = false; for (let s = 0; s < sameN; s++) if (SAME[s] === f.target) seen = true; if (seen) continue; } else { lastAt = at; sameN = 0; }
        if (sameN < 4) SAME[sameN++] = f.target;
        const tk = kOf(f.target); if (kOf(f.by) !== me || tk === me) continue;
        if (ts && ts[me] && ts[me] === ts[tk]) continue;   // (a team kill is no kill: CS2's tally, combat-logic's kill count)
        api.kill(pipKind(f.wid, !!f.head), markBits(f.how)); }
    },
  };
  fit(true); colors(null, ''); if (hudPrefs.scale !== 1) api.setScale(hudPrefs.scale);
  return api;
}

// The death panel (v53 DEATH): CS2's own layout, with the death cam — it lives in gd-death-panel.js now (killer, agent,
// weapon icon, HS / wallbang / no-scope / smoke marks, their health, damage given and taken); the same interface as
// stage 3's: createDeathPanel({ art }) → { el, update(on, G, me, now) }.
export { createDeathPanel, DEATH_PANEL_MS } from './gd-death-panel.js';
