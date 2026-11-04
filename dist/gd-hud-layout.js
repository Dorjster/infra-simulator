// Global Defensive · the CS2 HUD's layout (v53 stage 4, spec 3 + Addendum 7: the user's CS2 picture overrides 3's table).
//
// RULE: every HUD box is given in CS2's own panorama pixels at 1080 p (panorama lays its HUD out for a 1080-px-high
// screen and scales it by the screen's height) relative to an ANCHOR of the game view (the area package A's black bars
// leave: --gd-view-left / -top / -w / -h, else the window): x from the left edge (l), the centre (c) or the right edge
// (r); y from the top (t) or the bottom (b). One HUD unit u = view height / 1080 × HUD scale (0.8 – 1.4,
// gd-hud-prefs.js). So at 16:9 every box sits at the same FRACTION of the screen at 1366 × 768, 1920 × 1080 and
// 2560 × 1440, and Windows display scaling (100 – 150 %) changes only the CSS pixel count, never the fractions.
// The same table makes the CSS (hudCSS: calc() on --gd-u, written once) and the numbers the tests check (layoutBoxes),
// so what is drawn and what is tested cannot drift apart.
//
// WHERE THE NUMBERS COME FROM (the user's CS2 install, panorama/styles/*.vcss, read as text from the compiled files;
// and the user's picture scratchpad v53/ref/cs2-hud.png, 739 × 415 px, Dust II, measured by eye on 4× crops):
//   radar        #Radar__Round 250 px (hudradar.vcss Radar_VisSize_Round); its centre at (0.078, 0.135) of the picture
//   team counter #TeamCounterBG margin-top 2 px; ScoreAndTimeWidth 84 px, timer 28 px bold (.teamcounter_timer);
//                GameScore 30 px high, two 42 px halves, scores 28 px bold (#B5D4EE CT left, #EAD18A T right);
//                avatars 54 px wide (AvatarLBGWidth), 55 px high in the picture; CT's five end 52 px left of the
//                timer's centre and T's start 52 px right of it (picture: 347.5 and 388 of 739 px); C4 mark 16 px
//                rgb(255,255,95), kit 20 px rgb(119,221,255) (.AvatarL__C4 / __DefuseKit); dead: opacity .2, grey
//   health/ammo  hudhealthammocenter.vcss: the HA row 72 px high, 16 px above the bottom; number labels 70 px wide,
//                42 px (hud-HA-large-font-size); the small numbers 18 px; health bar 65 × 8 px; clip bar 65 × 4 px;
//                200 px between the health group and the 64 px badge, and between the badge and the ammo; picture:
//                the health number's centre x 0.341, the ammo's 0.645, both at y 0.952, the badge 53 px above the bottom
//   money        hudmoney.vcss digits 38 px bold; picture: left edge 0.028, centre y 0.961
//   chat / radio hudchat.vcss 18 px text; picture: the "[T] BOT Yuri: Sector clear." line's centre y 0.880, x from 0.004
//   weapons      hudweaponselection.vcss: names 16 px, slot numbers 16 px, rows 300 px wide 6 px from the right;
//                picture: the selected pistol's icon centre y 0.807 (its right edge 0.982), its name y 0.840, slot
//                number "2" (0.992, 0.786), the knife y 0.880, the bottom row (grenade pips, C4 / kit) y 0.952
// Positions are rounded to whole CS2 px. The picture is small (739 px wide): measured fractions are ±0.004.

// The picture's own fractions of the screen, [x, y, which x]: 'c' the box's centre, 'l' its left edge, 'r' its right
// edge (y always the centre). Tests compare the layout with these at every resolution and scaling.
export const REF = Object.freeze({
  radar: [.078, .135, 'c'], timer: [.4975, .016, 'c'], scoreCT: [.486, .051, 'c'], avatarsCT: [.400, .030, 'c'], avatarsT: [.597, .030, 'c'],
  health: [.341, .952, 'c'], badge: [.500, .952, 'c'], ammo: [.645, .952, 'c'], money: [.028, .961, 'l'], chat: [.004, .880, 'l'],
  wpn2: [.982, .807, 'r'], wpnName: [.984, .840, 'r'], wpn3: [.982, .880, 'r'], bombKit: [.861, .955, 'c'],
});
export const REF_SIZE = Object.freeze([739, 415]);
// [anchor x, anchor y, x, y, w, h] in CS2 px at 1080 p (x, y: the box's top-left from its anchor).
export const BOX = Object.freeze({
  radar:     ['l', 't', 25, 21, 250, 250],
  timer:     ['c', 't', -42, 2, 84, 31],
  scoreCT:   ['c', 't', -42, 34, 42, 30],
  scoreT:    ['c', 't', 0, 34, 42, 30],
  aliveCT:   ['c', 't', -42, 64, 42, 30],   // (the score boxes go on down under the alive count, fading: the picture)
  aliveT:    ['c', 't', 0, 64, 42, 30],
  avatarsCT: ['c', 't', -322, 2, 270, 55],
  avatarsT:  ['c', 't', 52, 2, 270, 55],
  health:    ['c', 'b', -340, -75, 70, 42],
  healthBar: ['c', 'b', -337, -36, 65, 8],
  armor:     ['c', 'b', -268, -72, 62, 36],
  badge:     ['c', 'b', -32, -85, 64, 64],
  ammo:      ['c', 'b', 243, -73, 70, 42],
  clipBar:   ['c', 'b', 246, -36, 65, 4],
  reserve:   ['c', 'b', 313, -66, 62, 26],
  money:     ['l', 'b', 54, -61, 240, 38],
  chat:      ['l', 'b', 8, -141, 560, 22],
  // weapon rows (right side): the icon box's right edge 34 px from the right, rows' centres from the bottom
  wpn1:      ['r', 'b', -164, -301, 130, 36],
  wpn2:      ['r', 'b', -164, -226, 130, 36],
  wpn3:      ['r', 'b', -164, -151, 130, 36],
  wpnName:   ['r', 'b', -331, -183, 300, 18],   // (under the selected row's icon: its top = row centre + 25)
  wpnNum:    ['r', 'b', -30, -23, 14, 16],      // (relative: added to a row's centre, see SLOT_NUM_DY)
  nades:     ['r', 'b', -230, -70, 215, 36],
  bombKit:   ['r', 'b', -292, -70, 52, 36],
});
export const ROW_CY = Object.freeze({ 1: -283, 2: -208, 3: -133, 4: -52 });   // the rows' centres from the bottom (px at 1080 p)
export const SLOT_NUM_DY = -23, NAME_DY = 25;   // a row's slot number: 23 px above its centre; the name's top 25 px below
export const NADE_PITCH = 48;                   // px between grenade icons in the bottom row (picture: 4 pips 48 px apart)
// HUD unit for a view of height H at HUD scale s.
export const hudUnit = (H, s = 1) => H / 1080 * s;
// A box in CSS px inside a W × H view at scale s: { x, y, w, h, cx, cy }.
export function boxOf(name, W, H, s = 1, out = {}) {
  const [ax, ay, x, y, w, h] = BOX[name], u = hudUnit(H, s);
  out.x = (ax === 'l' ? 0 : ax === 'c' ? W / 2 : W) + x * u; out.y = (ay === 't' ? 0 : H) + y * u; out.w = w * u; out.h = h * u; out.cx = out.x + out.w / 2; out.cy = out.y + out.h / 2; return out; }
export function layoutBoxes(W, H, s = 1) { const o = {}; for (const k in BOX) o[k] = boxOf(k, W, H, s); return o; }
// The CSS for one box: absolute inside the view box, calc() on --gd-u (set by the HUD: view height / 1080 × scale).
export function boxCSS(name) { const [ax, ay, x, y, w, h] = BOX[name];
  return `left:calc(${ax === 'l' ? '0%' : ax === 'c' ? '50%' : '100%'} + ${x} * var(--gd-u));top:calc(${ay === 't' ? '0%' : '100%'} + ${y} * var(--gd-u));width:calc(${w} * var(--gd-u));height:calc(${h} * var(--gd-u))`; }
export const U = n => `calc(${n} * var(--gd-u))`;
