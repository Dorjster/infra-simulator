// Global Defensive HUD — CS2's HUD (v53 stage 4: spec 3, laid out exactly as the user's CS2 picture, Addendum 7).
// Boxes and sizes: gd-hud-layout.js (CS2's panorama pixels at 1080 p, anchored to the game view, × the HUD scale).
//   bottom centre   HEALTH (big number, a thin bar under it) left of the round badge (the kill tally's, gd-kill-emblem.js),
//                   ARMOUR (shield / helmet icon + number) between them only while it is above 0, AMMO "mag | reserve"
//                   with the weapon's reserve icon right of the badge (CS2's hudhealthammocenter; the reserve icon per
//                   weapon — .HUD--ammo-reserve--<type>, RESERVE_TYPE below; the clip bar is not drawn: the user's
//                   picture shows none under the magazine, though hudhealthammocenter.vcss styles #AmmoClipBar); low health
//                   (≤ 20, CS2's HUD--health--low) and low ammo (≤ 20 % of the magazine) glow red; a hit makes the
//                   number and bar jitter (CS2's on-damage / jitter-number keyframes, 0.15 s)
//   bottom left     MONEY "$800" (38 px), with CS2's +/− change animation (hudmoney.vcss: 2.9 s, #8fff6f / #fd3535);
//                   the chat / radio lines (gd-comms.js #gd-feed) are placed above it
//   bottom right    the WEAPON LIST (CS2's hudweaponselection): one row per slot — 1 primary, 2 pistol, 3 knife, then
//                   the bottom row with the grenades (pips for empty places, up to 4) and the C4 / defuse kit — each with
//                   its icon (CS2's equipment icons when imported: tools/import-cs2-killfeed.mjs; our silhouettes
//                   otherwise) and slot number; the selected row brighter with its name under it
//   top centre      the TEAM COUNTER (CS2's hudteamcounter): the round timer in a small dark box (red bomb icon once
//                   planted, pulsing faster as the timer runs out), the scores under it (CT left, T right — CS2 keeps the
//                   CTs left whatever your side), the alive counts, five avatars per side in player-colour frames
//                   (dead: dimmed and grey; your side: the C4 / kit mark and a health bar; "?" for a player without a
//                   picture, as CS2; a bot: CS2's square portrait of the agent GD draws — SAS / Phoenix — when
//                   tools/import-cs2-hud.mjs imported it), letters over the colours with the colour-blind option; the
//                   score halves on CS2's dark boxes (fading down, the picture) with the alive count in them; while you
//                   are dead and spectating the team counter stays (CS2) and the player you watch has a white frame
//   centre          the dynamic crosshair (gd-crosshair.js), the scope, the hit marker and arcs (gd-hit-feedback.js)
// Colours: CS2's cl_hud_color (gd-hud-prefs.js; default Team Color — the picture's gold is t-color #eabe54); text white
// with soft shadows, thin lines, no panel backgrounds. The font: Barlow Semi Condensed (OFL, dist/fonts), tabular numbers.
// COST (spec 3 UI performance): one node set built here, reused; DOM written only when a value changes (numbers and
// references compared, no signature strings: the weapon list keeps its last values in WL, each avatar a bit field); the
// team counter and weapon list are re-read 5× a second (and at once on a weapon or round change); the bot names' keys
// are cached per roster; animations are transform / opacity only. Defuse rounds use this team counter; deathmatch and practice keep
// arena-ui.js's top bar (#ar-top).
import { skinTitle, skinFor, catalogHash } from './skins.js';
import { weaponById, moveInaccuracy, MAX_HP, isFirearm, NADE_ORDER, WEAPONS, KNIVES } from './weapons-data.js';
import { hpOf, armorOf, arenaArsenalOf } from './combat-logic.js';
import { loadCrosshair, crosshairHTML } from './gd-crosshair.js';
import { bindingOf, keyLabel } from './input.js';
import { gdView } from './gd-display.js';
import { createHitFeedback } from './gd-hit-feedback.js';   // (v53 S3: hit marker, headshot sounds, the hit-direction arc)
import { hostNow } from './host-clock.js';
import { BOX, boxCSS, U, ROW_CY, SLOT_NUM_DY, NAME_DY, NADE_PITCH } from './gd-hud-layout.js';
import { loadHudPrefs, hudColorOf, PLAYER_COLORS, PLAYER_LETTERS, TEAM_COLOR } from './gd-hud-prefs.js';
import { createHudAlerts } from './gd-hud-alerts.js';   // (CS2's centre-top messages: the plant, the defuse, a draw, match point, warmup…)

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
// Each grenade's own mark, and the key that draws it (slots 6–10: input.js; the two fire grenades share slot 10).
export const NADE_ICON = { he: '●', flash: '◆', smoke: '■', decoy: '◎', molotov: '▲', incendiary: '✹' };
// The reserve-ammo icon per weapon (CS2's .HUD--ammo-reserve--<type> classes: hudhealthammocenter.vcss; the icons
// panorama/images/hud/ammo_reserve_<type>). Which weapon takes which type is set in CS2's game code, not in its data
// files (weapons.vdata has no such key): the user's picture shows the Glock-18 with ammo_reserve_magazine; the rest
// follow the icons' own shapes (a curved magazine for the AK-47 / Galil AR, shells for shotguns, a box for the
// machine guns, the Bizon's tube, the P90's top magazine, the R8's loader).
export const RESERVE_TYPE = { ak: 'banana_mag', galil: 'banana_mag', shotgun: 'shotgun_shell', xm1014: 'shotgun_shell', negev: 'box', lmg: 'box', bizon: 'bizon_tube', p90: 'p90' };   // (GD's ids: weapons-data.js — shotgun = Nova, lmg = M249)
export const reserveType = id => RESERVE_TYPE[id] || 'magazine';
const NADE_KEY = { he: 'a-he', flash: 'a-flash', smoke: 'a-smoke', decoy: 'a-decoy', molotov: 'a-molotov', incendiary: 'a-molotov' };
// CS2's equipment icon names (the kill-feed import's own table arrives in killfeed.json "weapons"); ours: the rendered
// silhouettes dist/icons/w-<id>.png (guns, knives), drawn shapes for the rest — all used as masks in the HUD colour.
const ICON_DIR = new URL('./icons/', import.meta.url).href, HAS_PIC = new Set([...WEAPONS.map(w => w.id), ...KNIVES.map(k => k.id)]);
const svgURL = body => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32">${body}</svg>`);
const OWN = {   // (original drawings, 64 × 32)
  he: svgURL('<circle cx="32" cy="19" r="10"/><rect x="28" y="4" width="8" height="6" rx="1"/><path d="M36 6h9v3h-9z"/>'),
  flash: svgURL('<rect x="25" y="9" width="14" height="21" rx="2"/><rect x="27" y="3" width="10" height="5"/><path d="M38 5h8v3h-8z"/>'),
  smoke: svgURL('<rect x="24" y="8" width="16" height="22" rx="2"/><rect x="27" y="3" width="10" height="4"/><path d="M27 13h10v2H27zM27 18h10v2H27z" fill="#000" fill-opacity=".5"/>'),
  decoy: svgURL('<rect x="24" y="9" width="16" height="21" rx="3"/><rect x="28" y="4" width="8" height="4"/>'),
  molotov: svgURL('<path d="M29 2h6v8l5 6v14H24V16l5-6z"/><path d="M31 0c3 2 4 4 2 6-1-2-3-2-2-6z"/>'),
  // (v53 FIRE: its own outline — a can with a sloped shoulder and a ring pin, not the smoke's plain can: the two read apart in the slot)
  incendiary: svgURL('<path d="M26 8h12l3 4v18H23V12z"/><rect x="30" y="2" width="4" height="6"/><circle cx="37" cy="5" r="2.6" fill="none" stroke="#000" stroke-width="1.6"/><path d="M32 13c4 4 5 7 3 11-1 2-5 2-6 0-2-4 0-6 3-11z" fill="#000" fill-opacity=".55"/>'),
  c4: svgURL('<rect x="14" y="8" width="36" height="18" rx="2"/><rect x="18" y="11" width="12" height="8" fill="#000" fill-opacity=".55"/><path d="M34 12h12v2H34zM34 16h12v2H34z" fill="#000" fill-opacity=".55"/>'),
  kit: svgURL('<path d="M20 10h24l-3 18H23z"/><path d="M26 4h12v6h-3V7h-6v3h-3z"/>'),
  bullet: svgURL('<path d="M25 2h7l9 25-1.5 3h-6L24 6z"/><path d="M33.5 27h6l-1 3h-5z" fill-opacity=".6"/>'),   // (ours: a magazine leaning as CS2's ammo_reserve_magazine)
  shield: svgURL('<path d="M32 2l20 6v10c0 8-8 12-20 14C20 30 12 26 12 18V8z"/>'),
  helmet: svgURL('<path d="M12 22c0-11 9-18 20-18s20 7 20 18v3H12z"/><path d="M8 25h48v4H8z"/>'),
  face: svgURL('<circle cx="32" cy="12" r="8"/><path d="M14 32c0-9 8-14 18-14s18 5 18 14z"/>'),
  bomb: svgURL('<rect x="12" y="8" width="40" height="20" rx="3"/><circle cx="24" cy="18" r="4" fill="#000" fill-opacity=".6"/><path d="M34 13h12v3H34zM34 19h12v3H34z" fill="#000" fill-opacity=".6"/>'),
};
const CSS_TEXT = () => {
  const b = n => `#gd-hud .vb .${n}{position:absolute;${boxCSS(n)}}`;
  return `
@font-face{font-family:'GD HUD';src:url('${new URL('./fonts/barlow-semi-condensed-700.ttf.bin', import.meta.url).href}') format('truetype');font-weight:700;font-display:swap}
@font-face{font-family:'GD HUD';src:url('${new URL('./fonts/barlow-semi-condensed-600.ttf.bin', import.meta.url).href}') format('truetype');font-weight:600;font-display:swap}
:root{--gd-u:calc(var(--gd-view-h, 100vh) / 1080 * var(--gd-hs, 1))}
#gd-hud{position:fixed;inset:0;z-index:36;pointer-events:none;font:700 14px 'GD HUD','Barlow Semi Condensed','Arial Narrow',system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000d,1px 1px 1px #0008;--hc:${TEAM_COLOR.t};font-variant-numeric:tabular-nums}#gd-hud[hidden]{display:none}
#gd-hud .vb{position:absolute;left:var(--gd-view-left,0px);top:var(--gd-view-top,0px);width:var(--gd-view-w,100%);height:var(--gd-view-h,100%);contain:layout style}
${['health', 'armor', 'ammo', 'reserve', 'money', 'timer', 'scoreCT', 'scoreT', 'aliveCT', 'aliveT', 'avatarsCT', 'avatarsT', 'nades', 'bombKit'].map(b).join('\n')}
#gd-hud .vb #gd-hpbar{position:absolute;${boxCSS('healthBar')}}#gd-hud .vb .clip{position:absolute;${boxCSS('clipBar')}}
#gd-hud .num{display:block;text-align:center;font-size:${U(42)};line-height:${U(42)};color:var(--hc);will-change:transform}
#gd-hud .hp.low .num,#gd-hud .ammo.low .num{text-shadow:0 0 ${U(9)} #dd0000,0 0 ${U(3)} #dd0000}
#gd-hud .hp.hit .num{animation:gd-jit .15s ease-out}#gd-hud .hp.hit2 .num{animation:gd-jit2 .15s ease-out}
@keyframes gd-jit{0%{transform:scale(1.15) translate(-3px,-4px)}25%{transform:translate(0,-2px)}50%{transform:translate(3px,5px)}100%{transform:none}}@keyframes gd-jit2{0%{transform:scale(1.15) translate(-3px,-4px)}25%{transform:translate(0,-2px)}50%{transform:translate(3px,5px)}100%{transform:none}}
#gd-hpbar{border:1px solid #000;box-sizing:border-box;background:linear-gradient(270deg,#ff00001a,#f00 50%,#f00)}#gd-hpbar i{display:block;height:100%;width:100%;background:var(--hc);transform-origin:0 50%;transition:transform .15s}
#gd-hud .clip{display:none;border:1px solid #000;box-sizing:border-box;background:#ffffff1a}#gd-hud .clip i{display:block;height:100%;width:100%;background:var(--hc);transform-origin:0 50%}#gd-hud .ammo.low~.clip i{background:#f33;box-shadow:0 0 5px #d00}
#gd-hud .armor{display:flex;align-items:center;gap:${U(3)};opacity:0;transform:translateY(${U(5)})}#gd-hud .armor.on{opacity:1;transform:none}
#gd-hud .armor i{width:${U(22)};height:${U(22)};background:var(--hc);-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}#gd-hud .armor b{font-size:${U(18)};color:var(--hc)}
#gd-hud .reserve{display:flex;align-items:center;gap:${U(4)};color:var(--hc);font-size:${U(22)}}#gd-hud .reserve .sep{width:${U(2)};height:${U(20)};background:var(--hc);opacity:.85}#gd-hud .reserve .bul{width:${U(18)};height:${U(18)};background:var(--hc);-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}#gd-hud .ammo.low~.reserve b{text-shadow:0 0 ${U(9)} #dd0000}
#gd-hud .ammo[hidden],#gd-hud .ammo[hidden]~.reserve,#gd-hud .ammo[hidden]~.clip{display:none}
/* the reload cue (CS2's .hud-HA-icon-container.HUD--on-reload: keyframes 'reload' 0.3 s ease-in — the reserve icon drops
   50 px out and comes back in from 50 px above, hudhealthammocenter.vcss), clipped by its box; two names so a new reload
   restarts it without a reflow */
#gd-hud .reserve .bw{display:inline-flex;overflow:hidden}#gd-hud .reserve .bw.ra .bul{animation:gd-rl-a .3s ease-in}#gd-hud .reserve .bw.rb .bul{animation:gd-rl-b .3s ease-in}
@keyframes gd-rl-a{0%{transform:translateY(0)}50%{transform:translateY(${U(50)})}50.01%{transform:translateY(${U(-50)})}100%{transform:translateY(0)}}@keyframes gd-rl-b{0%{transform:translateY(0)}50%{transform:translateY(${U(50)})}50.01%{transform:translateY(${U(-50)})}100%{transform:translateY(0)}}
#gd-hud .money{font-size:${U(38)};line-height:${U(38)};color:var(--hc);white-space:nowrap}#gd-hud .money .dm{position:absolute;left:0;bottom:100%;font-size:${U(24)};opacity:0}
#gd-hud .money .dm.add{color:#8fff6f}#gd-hud .money .dm.rem{color:#fd3535}#gd-hud .money .dm.a{animation:gd-mny 2.9s linear}#gd-hud .money .dm.b{animation:gd-mny2 2.9s linear}
@keyframes gd-mny{0%{opacity:0;transform:translateY(${U(26)})}13%{opacity:1;transform:none}87%{opacity:1;transform:none}100%{opacity:0;transform:translateY(${U(30)})}}@keyframes gd-mny2{0%{opacity:0;transform:translateY(${U(26)})}13%{opacity:1;transform:none}87%{opacity:1;transform:none}100%{opacity:0;transform:translateY(${U(30)})}}
#gd-hud .wl{position:absolute;inset:0}#gd-hud .row{position:absolute;right:${U(34)};width:${U(130)};height:${U(36)};display:none}#gd-hud .row.on{display:block}
#gd-hud .row .ic{position:absolute;inset:0;background:var(--hc);-webkit-mask:var(--m) right center/contain no-repeat;mask:var(--m) right center/contain no-repeat;opacity:.8;filter:brightness(.9)}
#gd-hud .row.sel .ic{opacity:1;filter:brightness(1.5) drop-shadow(0 0 1px #000)}#gd-hud .row .n{position:absolute;right:${U(-25)};top:${U(SLOT_NUM_DY + 10)};width:${U(14)};font-size:${U(16)};line-height:${U(16)};text-align:center;color:#fff}
#gd-hud .row .nm{position:absolute;right:${U(-3)};top:calc(100% + ${U(NAME_DY - 18)});white-space:nowrap;font:600 ${U(16)}/${U(18)} 'GD HUD','Barlow Semi Condensed','Arial Narrow',system-ui,sans-serif;color:#fff;display:none}#gd-hud .row.sel .nm{display:block}
#gd-hud .nades{display:flex;flex-direction:row-reverse;align-items:center;gap:${U(NADE_PITCH - 36)}}#gd-hud .nades span{position:relative;width:${U(36)};height:${U(36)};flex:none}
#gd-hud .nades span i{position:absolute;inset:0;background:var(--hc);-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat;opacity:.8}#gd-hud .nades span.on i{opacity:1;filter:brightness(1.5)}
#gd-hud .nades span.pip i{-webkit-mask:none;mask:none;inset:auto;left:50%;top:50%;width:${U(5)};height:${U(5)};margin:${U(-2.5)};border-radius:50%;background:#fff;opacity:.45}
#gd-hud .nades span b{position:absolute;right:${U(-2)};bottom:${U(-2)};font-size:${U(13)};color:#fff}#gd-hud .nades .n{position:absolute;right:${U(-14)};top:${U(-14)};font-size:${U(16)};color:#fff}#gd-hud .nades span>em{position:absolute;left:0;top:${U(-12)};font:600 ${U(11)} 'GD HUD',system-ui;font-style:normal;opacity:.75}
#gd-hud .bombKit{display:none}#gd-hud .bombKit.on{display:block}#gd-hud .bombKit i{position:absolute;inset:0;background:var(--hc);-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}#gd-hud .bombKit.c4 i{background:#eabe54}#gd-hud .bombKit.kit i{background:#77ddff}#gd-hud .bombKit b{position:absolute;right:${U(-12)};top:${U(-16)};font-size:${U(16)}}
#gd-hud .tc[hidden]{display:none}
#gd-hud .timer{display:grid;place-items:center;background:#000000a0;font-size:${U(28)};line-height:1;color:#fff}#gd-hud .timer.red{color:#f00}
#gd-hud .timer .bomb{display:none;width:${U(42)};height:${U(25)};background:#b80000;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}#gd-hud .timer.planted .bomb{display:block;animation:gd-bomb .8s ease-in-out infinite}#gd-hud .timer.planted.m .bomb{animation-duration:.5s}#gd-hud .timer.planted.f .bomb{animation-duration:.3s}#gd-hud .timer.planted b{display:none}
@keyframes gd-bomb{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
#gd-hud .scoreCT,#gd-hud .scoreT{display:grid;place-items:center;background:linear-gradient(180deg,#000000a0,#00000070);font-size:${U(28)};line-height:1}#gd-hud .aliveCT,#gd-hud .aliveT{background:linear-gradient(180deg,#00000070,#0000)}#gd-hud .scoreCT{color:#b5d4ee}#gd-hud .scoreT{color:#ead18a}
#gd-hud .aliveCT,#gd-hud .aliveT{display:flex;align-items:center;justify-content:center;gap:${U(3)};font:600 ${U(13)}/1 'GD HUD',system-ui;color:#fff;opacity:.85}#gd-hud .aliveCT i,#gd-hud .aliveT i{width:${U(9)};height:${U(12)};background:#fff;-webkit-mask:url('${OWN.face}') center/contain no-repeat;mask:url('${OWN.face}') center/contain no-repeat}
#gd-hud.sp .vb>:not(.tc),#gd-hud.sp #gd-x,#gd-hud.sp #gd-scope{visibility:hidden}
#gd-hud .avatarsCT,#gd-hud .avatarsT{display:flex;gap:0}#gd-hud .avatarsCT{flex-direction:row-reverse}
#gd-hud .av{position:relative;width:${U(52)};height:${U(55)};margin:0 ${U(1)};box-sizing:border-box;border:${U(2)} solid var(--pc,#7f7f7f);background:linear-gradient(180deg,#3a4652,#1b2229);display:none}#gd-hud .av.on{display:block}#gd-hud .av.t{background:linear-gradient(180deg,#6b5a3c,#2c2418)}
#gd-hud .av .pic{position:absolute;inset:${U(6)} ${U(4)} ${U(5)};background:#0006;-webkit-mask:var(--m) center bottom/contain no-repeat;mask:var(--m) center bottom/contain no-repeat}#gd-hud .av.ct .pic{background:#9fb3c4cc}#gd-hud .av.t .pic{background:#d8c191cc}
#gd-hud .av .ag{position:absolute;inset:0;display:none;background:center/cover no-repeat}#gd-hud .av.img .ag{display:block}#gd-hud .av.img .pic{display:none}
#gd-hud .av .q{position:absolute;inset:0;display:none;place-items:center;font-size:${U(28)};color:#fff}#gd-hud .av.unk .q{display:grid}#gd-hud .av.unk .pic{display:none}#gd-hud .av.unk{background:#111}
#gd-hud .av .lt{position:absolute;left:${U(3)};top:${U(1)};font-size:${U(14)};display:none}#gd-hud.letters .av .lt{display:block}
#gd-hud .av .mk{position:absolute;right:${U(1)};bottom:${U(3)};width:${U(16)};height:${U(16)};display:none;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat;filter:drop-shadow(1px 1px 1px #000)}#gd-hud .av.c4 .mk{display:block;background:rgb(255,255,95)}#gd-hud .av.kit .mk{display:block;width:${U(20)};height:${U(20)};bottom:${U(1)};background:rgb(119,221,255)}
#gd-hud .av .hb{position:absolute;left:0;right:0;bottom:${U(-6)};height:${U(4)};background:linear-gradient(270deg,#0000,#f00 50%,#f00)}#gd-hud .av .hb i{display:block;height:100%;background:#fff;transform-origin:0 50%}#gd-hud .av.foe .hb{display:none}
#gd-hud .av.dead{opacity:.2;filter:grayscale(1)}#gd-hud .av.dead .hb,#gd-hud .av.dead .mk{display:none}#gd-hud .av.spec{box-shadow:0 0 0 ${U(2)} #fff}
html body:has(#gd-hud.cs2:not([hidden])) #gd-feed{left:calc(var(--gd-view-left,0px) + ${U(8)});bottom:calc(100vh - var(--gd-view-top,0px) - var(--gd-view-h,100vh) + ${U(119)});width:${U(560)};font:600 ${U(18)} 'GD HUD','Barlow Semi Condensed',system-ui,sans-serif;gap:${U(2)}}
html body:has(#gd-hud.cs2:not([hidden])) #gd-feed div{background:none;padding:0}
html body:has(#gd-hud.cs2:not([hidden])) #ar-banner:not(.over){display:none!important}   /* (CS2's alert bar instead: gd-hud-alerts.js — the match-over banner stays) */
html body:has(#gd-hud.cs2:not([hidden])) #controls-hint{bottom:calc(100vh - var(--gd-view-top,0px) - var(--gd-view-h,100vh) + ${U(196)})}   /* (the first seconds' key strip: above the kill cards, never over CS2's health / ammo row) */
html body:has(#gd-hud.cs2:not([hidden])) #game-notifications{left:calc(var(--gd-view-left,0px) + ${U(8)});right:auto;top:auto;bottom:calc(100vh - var(--gd-view-top,0px) - var(--gd-view-h,100vh) + ${U(150)});width:${U(560)}}
`; };
export function createGdHud({ world, name, weapons, recoil, fov, move, active, spectating = () => false, watched = () => null }) {   // (spectating / watched: lab.js — dead and watching a team mate, CS2's in-eye; the watched player's key)
  let tW = null, tS = null, tK = -1, tC = '', tTitle = '';   // (the weapon title, made again only when the weapon, its skin or the host's CS2 catalogue — the finish names — changes)
  const css = document.createElement('style'); css.textContent = CSS_TEXT() + `
#gd-x{position:absolute;inset:0}#gd-x i{position:absolute;background:#7dff8e;box-shadow:0 0 1px #000,0 0 2px #000}#gd-x .t,#gd-x .b{width:2px;height:7px;left:-1px}#gd-x .l,#gd-x .r{height:2px;width:7px;top:-1px}#gd-x .c{width:2px;height:2px;left:-1px;top:-1px}#gd-x[hidden]{display:none}
#gd-scope{position:absolute;inset:0;display:none}#gd-scope.on{display:block}#gd-scope .ring{position:absolute;left:50%;top:50%;width:calc(min(var(--gd-view-h,100vh),var(--gd-view-w,100vw))*.92);height:calc(min(var(--gd-view-h,100vh),var(--gd-view-w,100vw))*.92);transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 200vmax #000;border:2px solid #000}#gd-scope .h,#gd-scope .v{position:absolute;background:#000}#gd-scope .h{left:0;right:0;top:50%;height:1px}#gd-scope .v{top:0;bottom:0;left:50%;width:1px}#gd-scope.dot .ring{width:calc(min(var(--gd-view-h,100vh),var(--gd-view-w,100vw))*.6);height:calc(min(var(--gd-view-h,100vh),var(--gd-view-w,100vw))*.6);box-shadow:0 0 0 200vmax #000c}#gd-scope.dot .h,#gd-scope.dot .v{display:none}#gd-scope.dot:after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#ff3030;box-shadow:0 0 4px #f00}`;
  (document.head || document.body).append?.(css);
  const av = side => { let h = ''; for (let i = 0; i < 5; i++) h += `<i class="av ${side}"><i class="pic" style="--m:url('${OWN.face}')"></i><i class="ag"></i><b class="q">?</b><b class="lt"></b><i class="mk"></i><i class="hb"><i></i></i></i>`; return h; };
  const rows = () => { let h = ''; for (let s = 1; s <= 3; s++) h += `<div class="row r${s}" style="bottom:calc(${-ROW_CY[s] - 18} * var(--gd-u))"><i class="ic"></i><b class="n">${s}</b><b class="nm"></b></div>`; return h; };
  let nadeHTML = ''; for (let i = 0; i < 4; i++) nadeHTML += '<span class="pip"><i></i></span>';
  document.body.insertAdjacentHTML('beforeend', `<div id="gd-hud" hidden><div id="gd-scope"><div class="ring"></div><div class="h"></div><div class="v"></div></div><div id="gd-x"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="c"></i></div>
    <div class="vb"><div id="gd-hp"><div class="health hp"><b class="num">100</b></div><div id="gd-hpbar"><i></i></div><div class="armor arm"><i style="--m:url('${OWN.shield}')"></i><b>0</b></div></div>
    <div id="gd-wp"><div class="ammo"><b class="num"></b></div><div class="reserve"><i class="sep"></i><b></b><span class="bw"><i class="bul" style="--m:url('${OWN.bullet}')"></i></span></div><div class="clip"><i></i></div>
      <div class="wl">${rows()}<div class="nades util">${nadeHTML}</div><div class="bombKit"><i></i><b>5</b></div></div><b class="name" hidden></b></div>
    <div class="money"><b>$0</b><i class="dm"></i></div>
    <div class="tc" hidden><div class="timer"><b>0:00</b><i class="bomb" style="--m:url('${OWN.bomb}')"></i></div><div class="scoreCT">0</div><div class="scoreT">0</div><div class="aliveCT"><i></i><b></b></div><div class="aliveT"><i></i><b></b></div><div class="avatarsCT">${av('ct')}</div><div class="avatarsT">${av('t')}</div></div></div></div>`);
  const $ = s => document.querySelector(s), root = $('#gd-hud'), last = {}; root.classList.add('cs2');
  const qs0 = s => $(s) || $(s.replace(/ b$/, ''));   // (the alive count's number; tolerant of the tests' page stubs)
  const set = (k, el, prop, v) => { if (last[k] === v) return; last[k] = v; if (prop === 'html') el.innerHTML = v; else if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else el.style[prop] = v; };
  const els = { hpBox: $('#gd-hp .hp'), hp: $('#gd-hp .hp .num'), bar: $('#gd-hpbar i'), armBox: $('#gd-hp .arm'), arm: $('#gd-hp .arm b'), armIco: $('#gd-hp .arm i'),
    ammoBox: $('#gd-wp .ammo'), ammo: $('#gd-wp .ammo .num'), res: $('#gd-wp .reserve b'), resBox: $('#gd-wp .reserve'), clip: $('#gd-wp .clip i'), name: $('#gd-wp .name'), util: $('#gd-wp .nades'), bk: $('#gd-wp .bombKit'),
    money: $('#gd-hud .money b'), dm: $('#gd-hud .money .dm'), moneyBox: $('#gd-hud .money'), tc: $('#gd-hud .tc'), timer: $('#gd-hud .timer'), timerB: $('#gd-hud .timer b'), sCT: $('#gd-hud .scoreCT'), sT: $('#gd-hud .scoreT'), aCT: qs0('#gd-hud .aliveCT b'), aT: qs0('#gd-hud .aliveT b'),
    x: $('#gd-x'), scope: $('#gd-scope'), xt: $('#gd-x .t'), xb: $('#gd-x .b'), xl: $('#gd-x .l'), xr: $('#gd-x .r'), xc: $('#gd-x .c') };
  const qs = (e, sel) => e?.querySelector?.(sel) || e, kids = e => e?.children ? [...e.children] : [];   // (tolerant of the tests' page stubs)
  const ROWS = [null, ...[1, 2, 3].map(s => { const r = $('#gd-wp .r' + s); return { r, ic: qs(r, '.ic'), nm: qs(r, '.nm') }; })];
  const AV = { ct: [...document.querySelectorAll('#gd-hud .avatarsCT .av')], t: [...document.querySelectorAll('#gd-hud .avatarsT .av')] };
  for (const s of ['ct', 't']) for (const a of AV[s]) { a.__lt = qs(a, '.lt'); a.__hb = qs(a, '.hb i'); a.__mk = qs(a, '.mk'); a.__ag = qs(a, '.ag'); a.__sig = -1; a.__tk = null; a.__nm = null; }
  const NADES = kids(els.util);
  let xh = loadCrosshair(), xhVer = 0; addEventListener('gd-crosshair', e => { xh = e.detail || loadCrosshair(); xhVer++; });
  let keyVer = 0; addEventListener('infra-bindings', () => { keyVer++; wlSig = ''; });   // (grenade keys rebound: their labels change)
  const keyOf = id => { const c = bindingOf('arena', NADE_KEY[id])[0]; return c ? keyLabel(c).replace(/[<&>"]/g, '') : ''; };
  const countOf = (list, id) => { let c = 0; for (let i = 0; i < list.length; i++) if (list[i] === id) c++; return c; };
  const px = (rad, f) => Math.tan(rad) / Math.tan(f * Math.PI / 360) * (gdView.h || innerHeight) / 2;   // (the picture's height: black bars leave less than the window — gd-display.js)
  // HUD options (gd-hud-prefs.js): scale → --gd-hs on the page root (every box's calc), colour → --hc, letters → a class.
  let prefs = loadHudPrefs(), hcFor = '', slow = 0, wlSig = '', armSig = -1;   // (slow: the last 5 Hz pass — 0 redoes it next frame; wlSig / armSig: what the weapon list / armour show)
  const applyPrefs = () => { document.documentElement?.style?.setProperty?.('--gd-hs', String(prefs.scale)); root.classList.toggle('letters', !!prefs.letters); hcFor = ''; slow = 0; wlSig = ''; };   // (the HUD colour: teamCounter compares prefs.color itself)
  addEventListener('gd-hud-prefs', e => { prefs = e.detail || loadHudPrefs(); applyPrefs(); });
  applyPrefs();
  // CS2's icons when the host imported them (killfeed.json: the equipment icons; hud.json: the HUD's own — armour, bullet,
  // C4, kit, bot avatar), read once per page; ours until then.
  let KFW = null, HUDI = null, resType = ''; const AGENT = { ct: false, t: false }; /* (AGENT: CS2's portrait of that side's agent is in) */ const kfURL = (h, n) => `/user-assets/icons/killfeed/${encodeURIComponent(n)}.svg?h=${encodeURIComponent(h || '')}`, hudURL = (h, f) => `/user-assets/icons/hud/${encodeURIComponent(f)}?h=${encodeURIComponent(h || '')}`;
  if (typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
    fetch('/user-assets/icons/killfeed/killfeed.json').then(r => r.ok ? r.json() : null).then(m => { if (m?.weapons) { KFW = n => m.weapons[n] ? kfURL(m.hash, m.weapons[n]) : null; slow = 0; wlSig = ''; } }).catch(() => {});
    fetch('/user-assets/icons/hud/hud.json').then(r => r.ok ? r.json() : null).then(m => { if (m?.icons) { HUDI = n => m.icons[n] ? hudURL(m.hash, m.icons[n]) : null; slow = 0; wlSig = ''; armSig = -1;
      const bm = HUDI('bomb_planted'); if (bm) els.timer.querySelector('.bomb').style.setProperty('--m', `url('${bm}')`);
      const bot = HUDI('bot_avatar'); if (bot) for (const s of ['ct', 't']) for (const a of AV[s]) a.querySelector('.pic').style.setProperty('--m', `url('${bot}')`);
      for (const s of ['ct', 't']) { const ag = HUDI('agent_' + s); if (ag) for (const a of AV[s]) a.__ag?.style?.setProperty?.('background-image', `url('${ag}')`); AGENT[s] = !!ag; } resType = ''; } }).catch(() => {});
  }
  const iconOf = (id, knife) => (KFW && ((id === 'knife' && knife && knife !== 'default' && KFW('knife:' + knife)) || KFW(id === 'c4' ? 'c4' : id))) || (HAS_PIC.has(id) ? `${ICON_DIR}w-${id}.png` : OWN[id] || OWN.he);
  // (v53 S3) Hit feedback: the marker and the arcs live in this HUD's box (the crosshair's centre); your key cached per name.
  const fb = createHitFeedback({ parent: root }); let fbName = null, fbKey = '';
  const alerts = createHudAlerts();
  // Numbers last written (compared before any string is made).
  let rlN = 0, rlPar = 0, hpN = -1, hpLow = -1, magN = -1, resN = -1, lowN = -1, clipF = -1, moneyN = null, dmPar = 0, tcOn = null, timerS = -2, timerCls = '', sCTn = -1, sTn = -1, aCTn = -1, aTn = -1, hcSide = '', hcSlot = -1, hcCol = -1, topHidden = null, spOn = false;
  // The 5 Hz part: the weapon list and the team counter.
  // WL: what the weapon list shows now (compared value by value — no signature string).
  const WL = { prim: undefined, pist: undefined, knife: undefined, kn: undefined, cur: undefined, bomb: false, kit: false, keyVer: -1, kfw: null, title: null, nc: new Int8Array(NADE_ORDER.length) };
  function weaponList(G, me, w) {
    const A = G.arena, k = key(me), arsenal = arenaArsenalOf(G, me), l = A?.loadout?.[k] || {}, nades = Array.isArray(l.nades) ? l.nades : [], d = G.combat?.d, kn = A?.knives?.[k];
    let prim = l.primary || null, pist = null, knife = 'knife'; for (let i = 0; i < arsenal.length; i++) { const id = arsenal[i], kd = weaponById(id)?.kind; if (!pist && id !== prim && kd === 'pistol') pist = id; if (kd === 'knife' && knife === 'knife') knife = id; }
    const bomb = d?.bomb?.carrier === k, kit = !!d?.kits?.[k], cur = w?.id || '';
    { const sk = w && skinFor(A, me, w.id), kills = sk?.kills | 0; if (w !== tW || sk !== tS || kills !== tK || catalogHash() !== tC) { tW = w; tS = sk; tK = kills; tC = catalogHash(); tTitle = w ? (sk ? skinTitle(w.name, sk) + (sk.st ? ' · ' + kills + ' kills' : '') : w.name) : ''; } }
    let same = WL.prim === prim && WL.pist === pist && WL.knife === knife && WL.kn === kn && WL.cur === cur && WL.bomb === bomb && WL.kit === kit && WL.keyVer === keyVer && WL.kfw === KFW && WL.title === tTitle && wlSig === 'ok';
    for (let i = 0; i < NADE_ORDER.length; i++) { const c = countOf(nades, NADE_ORDER[i]); if (WL.nc[i] !== c) { WL.nc[i] = c; same = false; } }
    if (same) return; WL.prim = prim; WL.pist = pist; WL.knife = knife; WL.kn = kn; WL.cur = cur; WL.bomb = bomb; WL.kit = kit; WL.keyVer = keyVer; WL.kfw = KFW; WL.title = tTitle; wlSig = 'ok';   // (wlSig = '' elsewhere: redo it)
    const put = (s, id) => { const R = ROWS[s]; R.r.classList.toggle('on', !!id); if (!id) return; R.r.classList.toggle('sel', id === cur); R.ic.style.setProperty('--m', `url('${iconOf(id, kn)}')`); R.nm.textContent = id === cur ? tTitle : ''; };
    put(1, prim); put(2, pist); put(3, knife);
    els.name.textContent = tTitle;   // (kept for tools: the weapon in hand, its skin's name)
    let i = 0; if (NADES.length >= 4) for (const id of NADE_ORDER) { const c = countOf(nades, id); if (!c || i >= 4) continue; const s = NADES[i++]; s.className = cur === id ? 'on' : ''; s.dataset.n = id; s.dataset.c = c; s.innerHTML = `<i style="--m:url('${iconOf(id)}')"></i>${c > 1 ? '<b>×' + c + '</b>' : ''}<em>${keyOf(id)}</em>`; }
    for (; i < NADES.length && i < 4; i++) { const s = NADES[i]; s.className = 'pip'; delete s.dataset.n; delete s.dataset.c; s.innerHTML = '<i></i>'; }
    els.bk.className = 'bombKit' + (bomb ? ' on c4' : kit ? ' on kit' : '') + (cur === 'c4' ? ' sel' : ''); if (bomb || kit) els.bk.firstElementChild.style.setProperty('--m', `url('${bomb ? iconOf('c4') : (KFW?.('kit') || HUDI?.('defuser') || OWN.kit)}')`);
  }
  const slots = { t: new Map(), ct: new Map() };
  let botsOf = null, botsN = -1; const BOTS = new Set();   // (the bots' keys, made again only when the roster changes)
  function teamCounter(G, me) {
    const C = G.combat || {}, d = C.d, A = G.arena, show = !!(d && d.round && G.arena?.kind !== 'practice' && !A?.practice);
    if (show !== tcOn) { tcOn = show; els.tc.hidden = !show; }
    // arena-ui.js's own top bar and alive tiles give way to CS2's team counter in a defuse match (hidden by style only).
    if (topHidden !== show) { topHidden = show; for (const id of ['ar-top', 'ar-alive', 'ar-money']) { const e = document.getElementById(id); if (!e) continue; if (show) e.style.setProperty('display', 'none', 'important'); else e.style.removeProperty('display'); } }
    if (!show) return;
    const bl = A?.bots || null; if (bl !== botsOf || (bl?.length | 0) !== botsN) { botsOf = bl; botsN = bl?.length | 0; BOTS.clear(); if (bl) for (let i = 0; i < bl.length; i++) BOTS.add(key(bl[i].name)); }
    const k = key(me), mine = d.teams?.[k], now = hostNow(), wk = watched();   // (wk: the team mate you watch while dead — arena-spectate.js watchedKey; CS2 frames his avatar)
    slots.t.clear(); slots.ct.clear(); let nT = 0, nCT = 0, aliveT = 0, aliveCT = 0;
    for (const tk in d.teams) { const s = d.teams[tk]; if (s !== 't' && s !== 'ct') continue; const list = s === 't' ? AV.t : AV.ct, i = s === 't' ? nT++ : nCT++; slots[s].set(tk, i); if (i >= 5) continue;
      const a = list[i], dead = (C.down?.[tk]?.until || 0) > now, own = s === mine, hp = own ? Math.max(0, Math.min(100, C.hp?.[tk] ?? 100)) | 0 : 100, c4 = own && s === 't' && d.bomb?.carrier === tk, kit = own && s === 'ct' && !!d.kits?.[tk], bot = BOTS.has(tk), img = bot && AGENT[s], spec = wk === tk;
      if (!dead) { if (s === 't') aliveT++; else aliveCT++; }
      const bits = (dead ? 1 : 0) | (c4 ? 2 : 0) | (kit ? 4 : 0) | (own ? 8 : 0) | (bot ? 16 : 0) | (spec ? 32 : 0) | (img ? 64 : 0) | (i << 7) | (hp << 10);
      if (a.__sig === bits && a.__tk === tk) continue; a.__sig = bits; a.__tk = tk;
      a.className = 'av on ' + s + (dead ? ' dead' : '') + (c4 ? ' c4' : '') + (kit ? ' kit' : '') + (own ? '' : ' foe') + (bot ? '' : ' unk') + (img ? ' img' : '') + (spec ? ' spec' : '');
      a.style.setProperty('--pc', PLAYER_COLORS[i % 5]); a.__lt.textContent = PLAYER_LETTERS[i % 5]; a.__hb.style.transform = `scaleX(${hp / 100})`; const nm = C.names?.[tk] || tk; if (a.__nm !== nm) { a.__nm = nm; a.title = nm; }
      if (c4 || kit) a.__mk.style.setProperty('--m', `url('${c4 ? (HUDI?.('c4') || OWN.c4) : (HUDI?.('defuser') || OWN.kit)}')`); }
    for (const s of ['t', 'ct']) { const n = s === 't' ? nT : nCT; for (let i = n; i < 5; i++) { const a = AV[s][i]; if (a.__sig !== -1) { a.__sig = -1; a.__tk = null; a.className = 'av ' + s; } } }
    if (d.score.ct !== sCTn) { sCTn = d.score.ct; els.sCT.textContent = sCTn; } if (d.score.t !== sTn) { sTn = d.score.t; els.sT.textContent = sTn; }
    if (aliveCT !== aCTn) { aCTn = aliveCT; els.aCT.textContent = aliveCT; } if (aliveT !== aTn) { aTn = aliveT; els.aT.textContent = aliveT; }
    // your colour slot for the HUD colour 'Teammate Color' and the side for 'Team Color'
    const sl = slots[mine]?.get(k) ?? 0; if (mine !== hcSide || sl !== hcSlot || prefs.color !== hcCol) { hcSide = mine; hcSlot = sl; hcCol = prefs.color; root.style.setProperty('--hc', hudColorOf(prefs, mine, sl)); }
  }
  // The round timer, every frame (only its seconds are compared): CS2's .teamcounter_timer; planted: the bomb icon,
  // pulsing every 0.8 / 0.5 / 0.3 s (BombPlantedPulse__Slow / Medium / Fast — at the beep schedule's thirds).
  function timer(G) {
    const d = G.combat?.d, r = d?.round; if (!r || !tcOn) return; const now = hostNow();
    const clock = r.phase === 'freeze' ? r.freezeUntil - now : r.phase === 'live' ? r.endsAt - now : r.phase === 'planted' && r.planted ? r.planted.explodeAt - now : 0;
    const t = r.phase === 'warmup' ? -1 : Math.max(0, Math.ceil(clock / 1000)), cls = r.phase === 'planted' ? (t > 20 ? 'timer planted' : t > 10 ? 'timer planted m' : 'timer planted f') : r.phase === 'live' && t <= 10 ? 'timer red' : 'timer';
    if (cls !== timerCls) { timerCls = cls; els.timer.className = cls; }
    if (t !== timerS) { timerS = t; els.timerB.textContent = t < 0 ? 'WARMUP' : Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  }
  return {
    // A hit of yours the host confirmed (lab.js reportHit): marker + sounds (gd-hit-feedback.js).
    hit(kill, head, helmet) { fb.hit(kill, head, helmet); },
    // Tests: the boxes as laid out now (CSS px), by name.
    rect(name) { const e = { health: els.hp, healthBar: $('#gd-hpbar'), armor: els.armBox, ammo: els.ammoBox, reserve: els.resBox, money: els.moneyBox, timer: els.timer, scoreCT: els.sCT, scoreT: els.sT, avatarsCT: $('#gd-hud .avatarsCT'), avatarsT: $('#gd-hud .avatarsT'), wpn1: ROWS[1].r, wpn2: ROWS[2].r, wpn3: ROWS[3].r, nades: els.util, bombKit: els.bk }[name]; return e?.getBoundingClientRect?.() || null; },
    update() {
      const g = world.operations.game, act = g.mode === 'arena' && active(), sp = !act && g.mode === 'arena' && !!g.combat?.d && spectating(), on = act || sp; if (root.hidden === on) root.hidden = !on; alerts.update(on, g, hostNow()); if (!on) return;
      if (sp !== spOn) { spOn = sp; root.classList.toggle('sp', sp); slow = 0; }   // (dead, watching: only the team counter — CS2 keeps it; the watched player's numbers are the spectate view's)
      if (sp) { const tn = performance.now(); if (tn - slow > 200) { slow = tn; teamCounter(g, name()); } timer(g); return; }
      { const nm = name(); if (nm !== fbName) { fbName = nm; fbKey = key(nm); } fb.update(g, fbKey, hostNow()); }   // (v53 S3: hurt sounds, arcs, onlookers' headshots)
      const me = name(), hp = hpOf(g, me), arm = armorOf(g, me), w = weapons.current, d = g.combat?.d;
      // Health: the number, the bar, the low glow (≤ 20, CS2's HUD--health--low) and a jitter on each loss.
      if (hp !== hpN) { if (hp < hpN && hpN >= 0) { els.hpBox.className = 'health hp' + (hp <= 20 ? ' low' : '') + ((dmPar ^= 1) ? ' hit' : ' hit2'); } else els.hpBox.className = 'health hp' + (hp <= 20 ? ' low' : ''); hpN = hp; els.hp.textContent = hp; els.bar.style.transform = `scaleX(${Math.max(0, hp) / MAX_HP})`; }
      // Armour: shown only above 0 (CS2), the helmet icon when there is one.
      { const sig = (arm.kevlar | 0) * 2 + (arm.helmet ? 1 : 0); if (sig !== armSig) { armSig = sig; els.armBox.className = 'armor arm' + (arm.kevlar ? ' on' : ''); els.arm.textContent = arm.kevlar | 0; els.armIco.style.setProperty('--m', `url('${(arm.helmet ? HUDI?.('armor_helmet') : HUDI?.('armor')) || (arm.helmet ? OWN.helmet : OWN.shield)}')`); } }
      // Ammo: magazine big, "| reserve" small with the bullet icon, the clip bar; red glow at ≤ 20 % of the magazine.
      if (w && isFirearm(w)) { const m = weapons.ammo, r = weapons.reserve, low = m <= Math.ceil(w.mag * .2) ? 1 : 0;
        if (els.ammoBox.hidden) els.ammoBox.hidden = false;
        { const rt = reserveType(w.id); if (rt !== resType) { resType = rt; els.resBox.querySelector('.bul').style.setProperty('--m', `url('${HUDI?.('ammo_' + rt) || HUDI?.('bullet') || OWN.bullet}')`); } }   // (CS2's reserve icon for this weapon: a table string, set only on a weapon change)
        if (m !== magN) { magN = m; els.ammo.textContent = m; } if (r !== resN) { resN = r; els.res.textContent = r; } if (low !== lowN) { lowN = low; els.ammoBox.className = 'ammo' + (low ? ' low' : ''); }
        const f = Math.max(0, Math.min(1, m / (w.mag || 1))); if (f !== clipF) { clipF = f; els.clip.style.transform = `scaleX(${f})`; }
        { const rl = weapons.reloading ? 1 : 0; if (rl !== rlN) { if (rl) { rlPar ^= 1; const bw = els.resBw ??= els.resBox?.querySelector?.('.bw'); if (bw) bw.className = rlPar ? 'bw ra' : 'bw rb'; } rlN = rl; } } }   // (v53 HUD: the reload cue, on a reload's start)
      else if (!els.ammoBox.hidden) { els.ammoBox.hidden = true; magN = resN = lowN = -1; }
      // Money (defuse): "$800" and CS2's +/− flash on a change.
      { const mn = d ? (d.money?.[fbKey] ?? null) : null;   /* (your key, cached per name above: no string per frame) */ if (mn !== moneyN) { const was = moneyN; moneyN = mn; els.moneyBox.hidden = mn === null; if (mn !== null) { els.money.textContent = '$' + mn; if (was !== null && mn !== was) { const add = mn > was; els.dm.textContent = (add ? '+$' : '-$') + Math.abs(mn - was); els.dm.className = 'dm ' + (add ? 'add' : 'rem') + ((dmPar ^= 2) & 2 ? ' a' : ' b');   /* (two identical keyframe names in turn: a change restarts it, no forced layout) */ } } } }
      // 5× a second (and at once when the weapon in hand changes): the weapon list, the team counter.
      const tn = performance.now(); if (tn - slow > 200 || w !== tW) { slow = tn; weaponList(g, me, w); teamCounter(g, me); }
      timer(g);
      // Crosshair: offset to where the next bullet goes (recoil), gap from movement inaccuracy; scope overlay instead when scoped.
      const sc = weapons.scope, f = fov(), sniper = w?.kind === 'sniper';
      set('sc', els.scope, 'class', sc ? (sniper ? 'on' : 'on dot') : '');
      // The crosshair: the player's own look, fixed at the screen centre (never moved by recoil); none for a sniper
      // rifle unless scoped (then the scope's reticle), as in CS2. Dynamic: the gap opens with the inaccuracy.
      const showX = !!w && !sniper; if (els.x.hidden === showX) els.x.hidden = !showX; if (!showX) return;
      const inacc = weapons.inaccuracy ?? moveInaccuracy(w, { ...move(), scoped: sc > 0 }), gap = Math.round(Math.min(40, px(inacc, f)));   /* dynamic, CS2's: the gun's whole inaccuracy now (weapons.js — its floor, the shots' fire penalty, running, jumping), as the cone the next bullet can land in */
      if (last.xg !== gap || last.xv !== xhVer) { last.xg = gap; last.xv = xhVer; els.x.innerHTML = crosshairHTML(xh, gap); }
    },
  };
}
