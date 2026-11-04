// Global Defensive weapons: the one place every gun is defined. Shared by the host's rules (damage, armor, ammo,
// prices, fire rate, range) and the client (spray, accuracy, scope, HUD, buy menu, models, sounds).
// Stats follow CS2's values (damage, armor penetration, fire rate, magazine/reserve, reload, speed, prices, kill
// rewards); damage, armor ratio, range modifier, cycle time, range, head-shot multiplier, deploy time, accuracy
// (spread, inaccuracy, recovery), recoil magnitude/angle, zoom and flinch come from CS2's weapons.vdata (table CS2
// below, the user's CS2 install, read for reference). Spray patterns are our own, tuned to be learnable (CS2 builds
// its from m_nRecoilSeed with its own random stream, which we cannot reproduce verifiably: see SPRAY_SCALE).
//
// Fields: id · name · kind (rifle | sniper | smg | shotgun | pistol | lmg | knife | nade | bomb) · team ('t' | 'ct' |
// null = both) · price ($) · reward (kill $) · dmg (per bullet; per pellet for shotguns) · ap (armor penetration:
// share of the damage that still goes to health on an armored body) · rangeMod (damage ×rangeMod per 500 HU) ·
// rateMs (between shots) · mode (auto | semi | pump | bolt) · mag / reserve (rounds) · reloadMs · speed (HU/s run) ·
// range (game units, max distance a hit counts) · pellets / pelletSpread (rad, shotguns) · pattern (spray: [pitch°,
// yaw°] of bullet n relative to your aim; first bullet [0, 0]) · recover (pattern bullets recovered per second
// when you stop firing) · zoom (scope FOVs: CS2's, horizontal degrees on 4:3 — zoomVfov converts; right click
// cycles) · suppressed · model (base model + look, weapon-models.js) · desc (buy menu).
// From CS2 (merged below): acc / accZ (unscoped / scoped accuracy, tangent units and seconds: ACC_KEYS) · recoil /
// recoilZ { mag, magVar, angle, angleVar } (degrees) · reach (game units: m_flRange) · hs (head-shot multiplier) ·
// deployMs · reloadStartMs (no attack for this long after a reload starts; a shotgun's first shell) · zoomMs (per
// level) · flinch [large, small] (m_flFlinchVelocityModifier*) · recoilSeed.
// Spray from key points [bullet, pitch°, yaw°], linearly interpolated (pitch up, yaw right).
const spray = (n, keys) => { const out = []; for (let i = 0; i < n; i++) { let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= i) k++; const [a, p0, y0] = keys[k], [b, p1, y1] = keys[k + 1] || keys[k], t = b === a ? 0 : Math.min(1, (i - a) / (b - a)); out.push([+(p0 + (p1 - p0) * t).toFixed(3), +(y0 + (y1 - y0) * t).toFixed(3)]); } return out; };
// Semi-automatic kick: each quick follow-up shot climbs `k` degrees, with a small alternating drift.
const kick = (n, k, drift = .15) => Array.from({ length: n }, (_, i) => [+(k * i * (1 - .03 * i)).toFixed(3), +(i ? (i % 2 ? drift : -drift) * Math.min(1, i / 3) : 0).toFixed(3)]);
const RECOVER = { rifle: 12, smg: 15, pistol: 5, shotgun: 5, sniper: 4, lmg: 10 };
// Wallbang power (arena-maps.js bulletPath, v53): every gun's `pen` is CS2's m_flPenetration (the CS2 table's cpen,
// weapons.vdata) and a wall costs CS2's damage loss (gd-surface-props.js). The per-gun `pen` literals and this table by
// kind are the pre-v53 budgets, kept only for a gun the CS2 table lacks.
const PEN = { rifle: 7, sniper: 11, lmg: 8, smg: 3.5, pistol: 3.5, shotgun: 1.5 };
// Shotguns load shell by shell (CS2 m_bReloadsSingleShells): before v53 the first after reloadStartMs, then one every
// SHELL_MS (500, a guess). v53 RELOAD replaces both with CS2's clip stages (reloadOf below); kept only for a gun the
// reference lacks.
const SHELL_MS = 500;
// ── v53 RELOAD: reloads and ammo as CS2 has them (spec addendum 4; RELOAD_REF: tools/import-cs2-reloads.mjs from the
// user's own install — weapons.vdata, the first-person reload clips and animgraphs) ──
//  · mag = m_iMaxClip1; reserve = m_nPrimaryReserveAmmoMax, which CS2 counts in magazines for every magazine gun
//    (m_bReserveAmmoAsClips: the AK's 3 = 90 rounds, the Glock's 3 = 60, the AWP's 2 = 10) and in shells for the
//    shotguns (32). The reserve is kept as a pool of rounds: a reload moves only the missing rounds (the spec's rule —
//    what CS2's server does with a half-empty magazine is in its code, not in its data files: UPDATE-v53.0.md).
//  · reloadMs = m_flDisallowAttackAfterReloadStartDuration (no shot for that long; the AK's 2.4667 s).
//  · magInMs: the clip's WPN_RELOAD_ADD_AMMO — the new magazine seated, the rounds counted (the AK's 1.1 s of 2.4333).
//    A switch after it keeps the full magazine; before it, nothing changed. magInEmptyMs: the *_empty_* clip's (CS2
//    plays it when the magazine is at 0: the pistols' slide-locked reloads, the Glock's 1.2667 s). The CZ75-Auto:
//    magInAltMs / magInAltEmptyMs, its reload2_* clips once the spare front magazine is gone.
//  · reloadClipMs: the clip's own length (its sounds and the arms play at CS2's speed).
//  · Shotguns (CS2's WPN_RELOAD_INTRO / LOOP / OUTRO stages): shellIntroMs, then one shell per shellMs, each counted
//    shellAddMs into its loop (the Nova's 0.3667 + 0.3 = 0.6667 s for the first, then every 0.4333 s), shellOutroMs.
import { RELOAD_REF } from './gd-reload-ref.js';
const ms = s => Math.round(s * 1000);
export function reloadOf(id) { const r = RELOAD_REF[id]; if (!r) return {};
  const o = { mag: r.clip1, reserve: r.asClips ? r.reserve * r.clip1 : r.reserve, reloadClipMs: ms(r.reload.dur) };
  if (r.single && r.reload.loop) return { ...o, shellIntroMs: ms(r.reload.intro), shellMs: ms(r.reload.loop), shellAddMs: ms(r.reload.add - r.reload.intro), shellOutroMs: ms(r.reload.outro), reloadMs: ms(r.reload.intro + r.reload.loop + r.reload.outro) };   // (reloadMs: one shell's whole reload — another player's arms)
  return { ...o, reloadMs: ms(r.rl), magInMs: ms(r.reload.add), magInEmptyMs: ms((r.empty || r.reload).add), ...(r.alt ? { magInAltMs: ms(r.alt.add), magInAltEmptyMs: ms((r.altEmpty || r.alt).add) } : {}) }; }
// The moment (ms after the start) a reload's rounds count: the gun, its magazine at the start, and whether the CZ75's
// spare front magazine is still on (front: true while the reserve is untouched — its first reload takes the spare).
export function magInMs(w, mag, front = true) { if (!w?.magInMs) return w?.reloadMs ? w.reloadMs * .75 : 0; const alt = w.magInAltMs && !front; return mag > 0 ? (alt ? w.magInAltMs : w.magInMs) : (alt ? w.magInAltEmptyMs : w.magInEmptyMs); }
// The earliest any reload of the gun can seat (the host's check: combat-logic takeReload).
export const magInMinMs = w => w?.shellMs ? (w.shellIntroMs ?? 0) + (w.shellAddMs ?? 0) : w?.magInMs ? Math.min(w.magInMs, w.magInEmptyMs, w.magInAltMs ?? Infinity, w.magInAltEmptyMs ?? Infinity) : 0;

const G = (o) => ({ team: null, mode: 'semi', pellets: 0, suppressed: false, zoom: null, model: o.id, sound: o.id, ...o, auto: o.mode === 'auto', recover: o.recover ?? RECOVER[o.kind], cat: { rifle: 'Rifle', sniper: 'Sniper rifle', smg: 'SMG', shotgun: 'Shotgun', pistol: 'Pistol', lmg: 'Machine gun' }[o.kind] });

// CS2's weapons.vdata per gun (reference: the user's CS2 install): cyc m_flCycleTime (s) · dmg m_nDamage · ar
// m_flArmorRatio (ap = ar / 2) · rmod m_flRangeModifier · rng m_flRange (HU) · hs m_flHeadshotMultiplier · cpen
// m_flPenetration (CS2's own: our wallbang budget stays PEN, arena-maps.js) · dep m_flDeployDuration (s) · rl
// m_flDisallowAttackAfterReloadStartDuration (s) · fl m_flFlinchVelocityModifier[Large, Small] · seed m_nRecoilSeed ·
// acc / accZ (unscoped / scoped: the second weapon mode) in ACC_KEYS order: m_flSpread, m_flInaccuracy[Stand, Crouch,
// Move, Jump, JumpInitial, JumpApex, Land, Ladder, Fire], m_flRecoveryTime[Stand, Crouch, StandFinal, CrouchFinal],
// m_nRecoveryTransition[Start, End]Bullet, then m_flRecoilMagnitude(+Variance), m_flRecoilAngle(+Variance) · zoom
// m_nZoomFOV1/2 · zt m_flZoomTime0–2 (s) · spdZ the scoped m_flMaxSpeed. The USP-S and M4A1-S take the second mode's
// values: CS2's silencer-on mode (the lower recoil and spread of the pair), how they are bought and carried here.
const CS2 = {
  pistol: { cyc: .15, dmg: 30, ar: .94, rmod: .85, rng: 4096, hs: 4, cpen: 1, dep: 1, rl: 2.266667, fl: [.5, .65], seed: 4484, acc: [.002, .0056, .0042, .01, .08787, .09662, 0, .000185, .137, .056, .2, .2, .33, .33, 0, 5, 18, 0, 0, 20] },   // weapon_glock
  usps: { cyc: .17, dmg: 35, ar: 1.01, rmod: .91, rng: 4096, hs: 4, cpen: 1, dep: 1, rl: 2.2, fl: [.5, .65], seed: 5426, acc: [.0015, .0049, .00368, .01387, .09448, .0966, 0, .000198, .1199, .052, .349532, .291277, .349532, .291277, 3, 10, 23, 0, 0, 0] },   // weapon_usp_silencer (silencer on: mode 2)
  p250: { cyc: .15, dmg: 38, ar: 1.28, rmod: .9, rng: 4096, hs: 4, cpen: 1, dep: 1, rl: 2.266667, fl: [.5, .65], seed: 9788, acc: [.002, .0091, .00683, .02, .09296, .09662, 0, .00019, .138, .05245, .345388, .287823, .345388, .287823, 3, 10, 26, 3, 0, 10] },   // weapon_p250
  fiveseven: { cyc: .15, dmg: 32, ar: 1.823, rmod: .81, rng: 4096, hs: 4, cpen: 1, dep: 1, rl: 2.266667, fl: [.5, .65], seed: 33244, acc: [.002, .0091, .00683, .04, .0897, .09988, 0, .00019, .138, .025, .2, .2, .5, .5, 0, 5, 25, 4, 0, 5] },   // weapon_fiveseven
  cz75: { cyc: .1, dmg: 31, ar: 1.553, rmod: .85, rng: 4096, hs: 4, cpen: 1, dep: 1.83333, rl: 2.733333, fl: [.5, .65], seed: 9788, acc: [.003, .01043, .0076, .01341, .09296, .09662, 0, .00019, .138, .035, .2425, .2275, .345388, .287823, 3, 10, 31, 6, 0, 120] },   // weapon_cz75a
  tec9: { cyc: .12, dmg: 33, ar: 1.812, rmod: .79, rng: 4096, hs: 4, cpen: 1, dep: 1, rl: 2.566667, fl: [.5, .65], seed: 789, acc: [.002, .0049, .00368, .00381, .07978, .07117, 0, .000211, .1206, .045, .391, .315, .391, .315, 3, 10, 23, 3, 0, 60] },   // weapon_tec9
  deagle: { cyc: .225, dmg: 53, ar: 1.864, rmod: .85, rng: 4096, hs: 3.9, cpen: 2, dep: 1, rl: 2.2, fl: [.4, .55], seed: 1454, acc: [.002, .0042, .00218, .0481, .04055, .54882, .33155, .000043, .152, .07223, .8112, .449927, .8112, .449927, 3, 10, 48.200001, 18, 0, 60] },   // weapon_deagle
  mac10: { cyc: .075, dmg: 29, ar: 1.15, rmod: .8, rng: 3600, hs: 4, cpen: 1, dep: 1, rl: 2.566667, fl: [0, 0], seed: 34079, acc: [.0006, .0133, .00998, .01399, .0333, .03499, 0, .000069, .03426, .00476, .399729, .285521, .399729, .285521, 2, 5, 18, 1, 0, 70] },   // weapon_mac10
  mp9: { cyc: .07, dmg: 26, ar: 1.2, rmod: .87, rng: 3600, hs: 4, cpen: 1, dep: 1.2, rl: 2.133333, fl: [0, 0], seed: 50729, acc: [.0006, .009, .008, .02904, .05, .03728, 0, .000056, .148913, .0037, .25789, .184207, .25789, .184207, 2, 5, 21, 1, 0, 70] },   // weapon_mp9
  mp7: { cyc: .08, dmg: 30, ar: 1.25, rmod: .87, rng: 3600, hs: 4, cpen: 1, dep: 1, rl: 3.166667, fl: [0, 0], seed: 61649, acc: [.0006, .01, .0085, .01986, .0596, .05541, 0, .000115, .05756, .00218, .437491, .312494, .437491, .312494, 2, 5, 16, 1, 0, 70] },   // weapon_mp7
  smg: { cyc: .08, dmg: 28, ar: 1.25, rmod: .87, rng: 3600, hs: 4, cpen: 1, dep: 1, rl: 2.966667, fl: [0, 0], seed: 61649, acc: [.0006, .01, .0085, .03, .0596, .05541, 0, .000115, .05756, .00218, .437491, .312494, .437491, .312494, 2, 5, 16, 1, 0, 70] },   // weapon_mp5sd
  bizon: { cyc: .08, dmg: 27, ar: 1.26, rmod: .8, rng: 3600, hs: 4, cpen: 1, dep: 1.1, rl: 2.433333, fl: [0, 0], seed: 36387, acc: [.001, .014, .0105, .02757, .03347, .0459, 0, .00008, .16965, .00288, .331572, .236837, .331572, .236837, 2, 5, 18, 1, 0, 70] },   // weapon_bizon
  ump45: { cyc: .09, dmg: 35, ar: 1.3, rmod: .75, rng: 3700, hs: 4, cpen: 1, dep: 1, rl: 3.466667, fl: [0, 0], seed: 59299, acc: [.001, .01343, .01007, .02876, .03725, .04721, 0, .000085, .04235, .00342, .349993, .249995, .349993, .249995, 2, 5, 23, 1, 0, 40] },   // weapon_ump45
  p90: { cyc: .07, dmg: 26, ar: 1.38, rmod: .86, rng: 3700, hs: 4, cpen: 1, dep: 1, rl: 3.366667, fl: [0, 0], seed: 6213, acc: [.001, .01365, .01024, .031, .09008, .1046, 0, .000082, .13217, .00285, .372098, .265784, .372098, .265784, 2, 5, 16, 1, 0, 70] },   // weapon_p90
  shotgun: { cyc: .88, dmg: 26, ar: 1, rmod: .7, rng: 3000, hs: 4, cpen: 1, dep: 1, rl: .466667, fl: [.4, .45], seed: 7763, acc: [.04, .007, .00525, .03675, .12631, .1097, 0, .000236, .07875, .00972, .460517, .328941, .460517, .328941, 2, 5, 143, 22, 0, 20] },   // weapon_nova
  xm1014: { cyc: .35, dmg: 20, ar: 1.6, rmod: .7, rng: 3000, hs: 4, cpen: 1, dep: 1, rl: .6, fl: [.4, .45], seed: 24862, acc: [.038, .007, .00525, .03603, .13083, .10038, 0, .000232, .07721, .00883, .506569, .361835, .506569, .361835, 2, 5, 80, 20, 0, 20] },   // weapon_xm1014
  galil: { cyc: .09, dmg: 30, ar: 1.55, rmod: .98, rng: 8192, hs: 4, cpen: 2, dep: 1.1, rl: 3.033333, fl: [.4, .55], seed: 51191, acc: [.0006, .00877, .00658, .12356, .14978, .10539, 0, .000256, .11358, .007, .3, .15, .5, .47, 2, 5, 21, 1, 0, 70] },   // weapon_galilar
  famas: { cyc: .09, dmg: 30, ar: 1.4, rmod: .96, rng: 8192, hs: 4, cpen: 2, dep: 1, rl: 3.3, fl: [.4, .55], seed: 39623, acc: [.0006, .00759, .0055, .09934, .11039, .09477, 0, .000205, .118716, .00605, .25, .12, .5, .48, 2, 5, 20, 1, 0, 60] },   // weapon_famas
  ak: { cyc: .1, dmg: 36, ar: 1.55, rmod: .98, rng: 8192, hs: 4, cpen: 2, dep: 1, rl: 2.466667, fl: [.4, .55], seed: 223, acc: [.0006, .00641, .00481, .17506, .14076, .10094, 0, .000242, .14, .0078, .368, .305257, .506, .419728, 2, 5, 30, 0, 0, 70] },   // weapon_ak47
  m4: { cyc: .09, dmg: 33, ar: 1.4, rmod: .97, rng: 8192, hs: 4, cpen: 2, dep: 1.133333, rl: 3.066667, fl: [.4, .55], seed: 38965, acc: [.0006, .0049, .0041, .13788, .09727, .09441, 0, .000192, .110994, .007, .338941, .2421, .466044, .332888, 2, 5, 23, 0, 0, 70] },   // weapon_m4a1
  m4s: { cyc: .1, dmg: 38, ar: 1.4, rmod: .94, rng: 8192, hs: 3.475, cpen: 2, dep: 1.133333, rl: 3.066667, fl: [.4, .4], seed: 38965, acc: [.0005, .0049, .0041, .122, .0997, .09677, 0, .000197, .113672, .007, .338941, .2421, .466044, .332888, 2, 5, 21, 0, 0, 65] },   // weapon_m4a1_silencer (silencer on: mode 2)
  sg553: { cyc: .11, dmg: 30, ar: 2, rmod: .98, rng: 8192, hs: 4, cpen: 2, dep: 1, rl: 2.766667, fl: [.4, .55], seed: 43500, acc: [.0006, .00581, .00381, .13601, .109, .07879, 0, .000188, .08366, .00795, .452886, .379204, .452886, .379204, 2, 5, 28, 2, 0, 60], accZ: [.0003, .00381, .00305, .13601, .109, .07879, 0, .000188, .138758, .0092, .452886, .379204, .452886, .379204, 2, 5, 19, 2, 0, 60], zoom: [45], zt: [.06, .1, 0], spdZ: 150 },   // weapon_sg556
  aug: { cyc: .1, dmg: 28, ar: 1.8, rmod: .98, rng: 8192, hs: 4, cpen: 2, dep: 1.16667, rl: 3.2, fl: [.4, .55], seed: 24204, acc: [.0005, .0049, .00368, .13545, .10599, .10156, 0, .000208, .11004, .00729, .429727, .30552, .429727, .30552, 2, 5, 24, 0, 0, 60], accZ: [.0003, .00368, .00311, .10545, .10599, .10156, 0, .000208, .10004, .00729, .429727, .30552, .429727, .30552, 2, 5, 16, 0, 0, 60], zoom: [45], zt: [.06, .1, 0], spdZ: 150 },   // weapon_aug
  ssg08: { cyc: 1.25, dmg: 88, ar: 1.7, rmod: .98, rng: 8192, hs: 4, cpen: 2.5, dep: 1, rl: 3.7, fl: [.35, .4], seed: 1278, acc: [.00028, .0317, .02378, .12345, .00572, .20872, 0, .000215, .09549, .02292, .142096, .055783, .142096, .055783, 2, 5, 33, 15, 0, 20], accZ: [.00023, .003, .0028, .12345, .00572, .20872, 0, .000215, .09549, .02292, .142096, .055783, .142096, .055783, 2, 5, 25, 2, 0, 20], zoom: [40, 15], zt: [.05, .05, .05], spdZ: 230 },   // weapon_ssg08
  sniper: { cyc: 1.455, dmg: 115, ar: 1.95, rmod: .99, rng: 8192, hs: 4, cpen: 2.5, dep: 1.266667, rl: 3.666667, fl: [.35, .4], seed: 4100, acc: [.0002, .0808, .0606, .17648, .13383, .17286, 0, .000307, .1365, .05385, .34539, .24671, .34539, .24671, 2, 5, 78, 15, 0, 20], accZ: [.0002, .002, .0015, .17648, .13383, .17286, 0, .0001, .1365, .05385, .34539, .24671, .34539, .24671, 2, 5, 25, 2, 0, 20], zoom: [40, 10], zt: [.05, .05, .05], spdZ: 100 },   // weapon_awp
  lmg: { cyc: .08, dmg: 32, ar: 1.6, rmod: .97, rng: 8192, hs: 4, cpen: 2, dep: 1.1, rl: 5.7, fl: [.4, .55], seed: 50310, acc: [.002, .0077, .00534, .15625, .27947, .11827, 0, .000398, .13281, .00356, .828931, .592093, .828931, .592093, 2, 5, 25, 2, 0, 50] },   // weapon_m249
  negev: { cyc: .075, dmg: 35, ar: 1.42, rmod: .97, rng: 8192, hs: 4, cpen: 2, dep: 1.1, rl: 5.7, fl: [.4, .55], seed: 57966, acc: [.002, .01017, .00763, .15914, .29223, .11629, 0, .000409, .13643, .03, .3, .25, .1, .08, 9, 12, 20, 2, 0, 0] },   // weapon_negev
};
export const ACC_KEYS = ['spread', 'stand', 'crouch', 'move', 'jump', 'jumpInit', 'jumpApex', 'land', 'ladder', 'fire', 'recStand', 'recCrouch', 'recStandFinal', 'recCrouchFinal', 'trStart', 'trEnd'];
const accFrom = v => v ? Object.fromEntries(ACC_KEYS.map((k, i) => [k, v[i]])) : null, recoilFrom = v => v ? { mag: v[16], magVar: v[17], angle: v[18], angleVar: v[19] } : null;
// Automatic guns' sprays at CS2 proportions: each gun's own shape (above), opened wider sideways and a little taller.
// (Kept as our own tables: CS2 generates its per-gun recoil table from m_nRecoilSeed, m_flRecoilAngle/Magnitude and
// their variances with the engine's own seeded random stream and smoothing, which we can't reproduce verifiably — so
// the shapes are hand-made, scaled here to CS2's spray size; recoil.mag still drives the visual view punch.)
export const SPRAY_SCALE = { pitch: 1.3, yaw: 1.9 };
export const WEAPONS = [
  // Pistols (slot 2). T start with the Glock-18, CTs with the USP-S.
  G({ id: 'pistol', name: 'Glock-18', kind: 'pistol', team: 't', price: 200, reward: 300, dmg: 30, ap: .47, rangeMod: .85, rateMs: 150, mag: 20, reserve: 120, reloadMs: 2270, speed: 240, range: 450, pattern: kick(20, .55, .12), model: 'pistol', desc: 'Terrorist starting pistol. Big magazine, fast fire, weak against armor.' }),
  G({ id: 'usps', name: 'USP-S', kind: 'pistol', team: 'ct', price: 200, reward: 300, dmg: 35, ap: .505, rangeMod: .91, rateMs: 170, mag: 12, reserve: 24, reloadMs: 2200, speed: 240, range: 500, suppressed: true, pattern: kick(12, .7, .08), model: 'pistol', desc: 'Counter-Terrorist starting pistol. Suppressed and accurate at range; small magazine.' }),
  G({ id: 'p250', name: 'P250', kind: 'pistol', price: 300, reward: 300, dmg: 38, ap: .64, rangeMod: .9, rateMs: 150, mag: 13, reserve: 26, reloadMs: 2200, speed: 240, range: 450, pattern: kick(13, .8, .2), model: 'luger', desc: 'Cheap upgrade that punches through armor better than the starting pistols.' }),
  G({ id: 'fiveseven', name: 'Five-SeveN', kind: 'pistol', team: 'ct', price: 500, reward: 300, dmg: 32, ap: .911, rangeMod: .81, rateMs: 150, mag: 20, reserve: 100, reloadMs: 2200, speed: 240, range: 450, pattern: kick(20, .75, .25), model: 'pistol', desc: 'Armor-piercing pistol with a 20-round magazine. Strong in eco rounds.' }),
  G({ id: 'cz75', name: 'CZ75-Auto', kind: 'pistol', price: 500, reward: 100, dmg: 31, ap: .776, rangeMod: .85, rateMs: 100, mode: 'auto', mag: 12, reserve: 12, reloadMs: 2700, speed: 240, range: 420, pattern: kick(12, 1.05, .35), model: 'pistol', desc: 'Fully automatic pistol: twelve rounds in a second, then a long reload. Deadly up close.' }),
  G({ id: 'tec9', name: 'Tec-9', kind: 'pistol', team: 't', price: 500, reward: 300, dmg: 33, ap: .906, rangeMod: .79, rateMs: 120, mag: 18, reserve: 90, reloadMs: 2500, speed: 240, range: 440, pattern: kick(18, .8, .3), model: 'pistol', desc: 'Terrorist pistol for running and gunning: 18 rounds, strong against armor, accurate on the move.' }),
  G({ id: 'deagle', name: 'Desert Eagle', kind: 'pistol', pen: 6, price: 700, reward: 300, dmg: 53, ap: .932, rangeMod: .85, rateMs: 225, mag: 7, reserve: 35, reloadMs: 2200, speed: 230, range: 500, pattern: kick(7, 2.6, .35), recover: 3, desc: 'Hand cannon. Heavy kick: take one aimed shot at a time.' }),
  // SMGs (slot 1).
  G({ id: 'mac10', name: 'MAC-10', kind: 'smg', team: 't', price: 1050, reward: 600, dmg: 29, ap: .575, rangeMod: .8, rateMs: 75, mode: 'auto', mag: 30, reserve: 100, reloadMs: 2600, speed: 240, range: 380, pattern: spray(30, [[0, 0, 0], [1, .3, 0], [5, 1.8, -.4], [9, 2.8, -1.4], [13, 3.2, -2.6], [17, 3.4, -3.4], [21, 3.5, -2.6], [25, 3.6, -1.4], [29, 3.7, -.4]]), model: 'greasegun', desc: 'Very fast fire and run speed. Deadly close, sprays wide.' }),
  G({ id: 'mp9', name: 'MP9', kind: 'smg', team: 'ct', price: 1250, reward: 600, dmg: 26, ap: .6, rangeMod: .87, rateMs: 70, mode: 'auto', mag: 30, reserve: 120, reloadMs: 2100, speed: 240, range: 380, pattern: spray(30, [[0, 0, 0], [1, .35, 0], [5, 2.4, .7], [9, 3.7, 1.4], [13, 4.2, .2], [17, 4.4, -1.3], [21, 4.6, -2], [25, 4.7, -.4], [29, 4.8, 1]]), model: 'smg', desc: 'Light, fast-firing CT SMG. Keep moving and fight close.' }),
  G({ id: 'mp7', name: 'MP7', kind: 'smg', price: 1500, reward: 600, dmg: 30, ap: .625, rangeMod: .87, rateMs: 80, mode: 'auto', mag: 30, reserve: 120, reloadMs: 3100, speed: 220, range: 400, pattern: spray(30, [[0, 0, 0], [1, .3, 0], [5, 2, -.3], [9, 3.1, .6], [13, 3.5, 1.5], [17, 3.7, .5], [21, 3.8, -.9], [25, 3.9, -1.4], [29, 4, -.3]]), model: 'smg', desc: 'Balanced SMG with a gentle spray. Good armor penetration for its class.' }),
  G({ id: 'smg', name: 'MP5-SD', kind: 'smg', price: 1500, reward: 600, dmg: 28, ap: .625, rangeMod: .87, rateMs: 80, mode: 'auto', mag: 30, reserve: 120, reloadMs: 3000, speed: 235, range: 400, suppressed: true, pattern: spray(30, [[0, 0, 0], [1, .25, 0], [5, 1.6, .3], [9, 2.6, .9], [13, 3, .2], [17, 3.2, -.9], [21, 3.3, -1.3], [25, 3.4, -.2], [29, 3.5, .8]]), model: 'smg', desc: 'Suppressed SMG: quiet shots, easy spray.' }),
  G({ id: 'bizon', name: 'PP-Bizon', kind: 'smg', price: 1400, reward: 600, dmg: 27, ap: .63, rangeMod: .8, rateMs: 80, mode: 'auto', mag: 64, reserve: 120, reloadMs: 2400, speed: 240, range: 360, pattern: spray(64, [[0, 0, 0], [1, .3, 0], [5, 1.9, .5], [9, 3, 1.1], [13, 3.4, .2], [17, 3.6, -1], [21, 3.7, -1.6], [25, 3.8, -.6], [29, 3.9, .6], [37, 4, -.4], [45, 4.1, .8], [63, 4.2, 0]]), model: 'greasegun', desc: 'A 64-round helical magazine: keeps spraying when others reload. Weak against armor.' }),
  G({ id: 'ump45', name: 'UMP-45', kind: 'smg', price: 1200, reward: 600, dmg: 35, ap: .65, rangeMod: .75, rateMs: 90, mode: 'auto', mag: 25, reserve: 100, reloadMs: 3500, speed: 230, range: 380, pattern: spray(25, [[0, 0, 0], [1, .45, 0], [4, 2.4, .2], [8, 4, .5], [12, 4.6, -.7], [16, 4.9, -1.4], [20, 5.1, -.2], [24, 5.2, 1.1]]), model: 'suomi', desc: 'Hard-hitting SMG; loses damage quickly over distance.' }),
  G({ id: 'p90', name: 'P90', kind: 'smg', price: 2350, reward: 300, dmg: 26, ap: .69, rangeMod: .86, rateMs: 70, mode: 'auto', mag: 50, reserve: 100, reloadMs: 3300, speed: 230, range: 400, pattern: spray(50, [[0, 0, 0], [1, .25, 0], [6, 1.8, -.2], [12, 2.9, .6], [18, 3.3, 1.5], [24, 3.5, .6], [30, 3.6, -.8], [36, 3.7, -1.6], [42, 3.8, -.6], [49, 3.9, .7]]), model: 'suomi', desc: '50-round magazine and an easy spray. Expensive for an SMG.' }),
  // Shotguns (slot 1): a fixed pellet pattern around your aim.
  G({ id: 'shotgun', name: 'Nova', kind: 'shotgun', price: 1050, reward: 900, dmg: 26, ap: .5, rangeMod: .7, rateMs: 880, mode: 'pump', pellets: 9, pelletSpread: .05, mag: 8, reserve: 32, reloadMs: 3000, speed: 220, range: 120, pattern: kick(8, 3), desc: 'Pump-action. One close shot can kill; useless at range.' }),
  G({ id: 'xm1014', name: 'XM1014', kind: 'shotgun', price: 2000, reward: 900, dmg: 20, ap: .8, rangeMod: .7, rateMs: 350, mode: 'auto', pellets: 6, pelletSpread: .055, mag: 7, reserve: 32, reloadMs: 3200, speed: 215, range: 120, pattern: spray(7, [[0, 0, 0], [1, 1.6, .2], [3, 3.6, -.3], [6, 4.8, .4]]), recover: 6, model: 'shotgun', desc: 'Automatic shotgun. Holds close angles against rushes.' }),
  // Rifles (slot 1).
  G({ id: 'galil', name: 'Galil AR', kind: 'rifle', team: 't', price: 1800, reward: 300, dmg: 30, ap: .775, rangeMod: .98, rateMs: 90, mode: 'auto', mag: 35, reserve: 90, reloadMs: 3000, speed: 215, range: 600, pattern: spray(35, [[0, 0, 0], [1, .4, 0], [5, 2.6, -.3], [10, 4.6, -.6], [14, 5, 1.2], [18, 5.2, 2.2], [22, 5.4, .6], [26, 5.5, -1.6], [30, 5.6, -.4], [34, 5.7, 1.4]]), model: 'ak', desc: 'Cheap Terrorist rifle with 35 rounds. Two body shots fewer than an AK at range.' }),
  G({ id: 'famas', name: 'FAMAS', kind: 'rifle', team: 'ct', price: 2050, reward: 300, dmg: 30, ap: .7, rangeMod: .96, rateMs: 90, mode: 'auto', mag: 25, reserve: 90, reloadMs: 3300, speed: 220, range: 600, pattern: spray(25, [[0, 0, 0], [1, .4, 0], [4, 2, .4], [8, 3.8, .8], [11, 4.3, -.5], [14, 4.5, -1.5], [18, 4.7, -.2], [21, 4.8, 1.2], [24, 4.9, .4]]), model: 'm4', desc: 'Cheap CT rifle. Short magazine; burst it at range.' }),
  G({ id: 'ak', name: 'AK-47', kind: 'rifle', pen: 7.5, team: 't', price: 2700, reward: 300, dmg: 36, ap: .775, rangeMod: .98, rateMs: 100, mode: 'auto', mag: 30, reserve: 90, reloadMs: 2500, speed: 215, range: 600, pattern: spray(30, [[0, 0, 0], [1, .6, .1], [3, 2.2, .3], [6, 4.6, .5], [9, 6.2, .7], [11, 6.6, -.6], [14, 6.9, -2.6], [17, 7.1, -1.2], [20, 7.2, 1.4], [23, 7.3, 2.6], [26, 7.4, .8], [29, 7.5, -1.6]]), desc: 'The Terrorist rifle. Hard-hitting; climbs, then pulls left and right.' }),
  G({ id: 'm4', name: 'M4A4', kind: 'rifle', pen: 6.5, team: 'ct', price: 3100, reward: 300, dmg: 33, ap: .7, rangeMod: .97, rateMs: 90, mode: 'auto', mag: 30, reserve: 90, reloadMs: 3100, speed: 225, range: 600, pattern: spray(30, [[0, 0, 0], [1, .45, 0], [4, 2.2, -.15], [8, 4.6, -.2], [11, 5.3, .9], [14, 5.6, 2], [17, 5.8, 1], [20, 5.9, -1], [24, 6, -2.2], [27, 6.1, -1], [29, 6.1, .2]]), desc: 'The CT rifle: 30 rounds, fast fire, controllable climb.' }),
  G({ id: 'm4s', name: 'M4A1-S', kind: 'rifle', pen: 6.5, team: 'ct', price: 2900, reward: 300, dmg: 38, ap: .7, rangeMod: .94, rateMs: 100, mode: 'auto', mag: 20, reserve: 80, reloadMs: 3100, speed: 225, range: 600, suppressed: true, pattern: spray(20, [[0, 0, 0], [1, .35, 0], [4, 1.9, .1], [8, 3.6, .3], [11, 4.1, -.6], [14, 4.3, -1.4], [17, 4.4, -.3], [19, 4.5, .7]]), model: 'm4', desc: 'Suppressed CT rifle: precise and quiet, 20 rounds.' }),
  G({ id: 'sg553', name: 'SG 553', kind: 'rifle', pen: 8, team: 't', price: 3000, reward: 300, dmg: 30, ap: 1, rangeMod: .98, rateMs: 110, mode: 'auto', mag: 30, reserve: 90, reloadMs: 2800, speed: 210, range: 650, zoom: [45], pattern: spray(30, [[0, 0, 0], [1, .5, 0], [5, 3, .5], [9, 5.2, 1.3], [12, 5.8, .3], [15, 6.1, -1.4], [19, 6.4, -2.3], [23, 6.6, -.6], [26, 6.7, 1.3], [29, 6.8, 2]]), model: 'ak', desc: 'Scoped Terrorist rifle (right click). Full armor penetration.' }),
  G({ id: 'aug', name: 'AUG', kind: 'rifle', team: 'ct', price: 3300, reward: 300, dmg: 28, ap: .9, rangeMod: .98, rateMs: 100, mode: 'auto', mag: 30, reserve: 90, reloadMs: 3800, speed: 220, range: 650, zoom: [45], pattern: spray(30, [[0, 0, 0], [1, .45, 0], [5, 2.6, -.6], [9, 4.6, -1.2], [12, 5.1, 0], [15, 5.4, 1.4], [19, 5.6, 2.1], [23, 5.8, .4], [26, 5.9, -1.2], [29, 6, -.6]]), model: 'm4', desc: 'Scoped CT rifle (right click). Precise bursts at long range.' }),
  // Sniper rifles (slot 1): right click scopes in, again for more zoom, again out. Unscoped they spray wide.
  G({ id: 'ssg08', name: 'SSG 08', kind: 'sniper', pen: 9, price: 1700, reward: 300, dmg: 88, ap: .85, rangeMod: .98, rateMs: 1250, mode: 'bolt', mag: 10, reserve: 90, reloadMs: 3700, speed: 230, range: 1000, zoom: [40, 15], pattern: kick(10, 3.2, .2), model: 'sniper', desc: 'Light bolt-action. One-shot head shots, mobile and cheap.' }),
  G({ id: 'sniper', name: 'AWP', kind: 'sniper', price: 4750, reward: 100, dmg: 115, ap: .975, rangeMod: .99, rateMs: 1455, mode: 'bolt', mag: 5, reserve: 30, reloadMs: 3600, speed: 200, scopedSpeed: 100, range: 1000, zoom: [40, 10], pattern: kick(5, 4, .2), desc: 'One body shot kills. Slow to move and to fire; useless unscoped.' }),
  // Machine gun.
  G({ id: 'lmg', name: 'M249', kind: 'lmg', price: 5200, reward: 300, dmg: 32, ap: .8, rangeMod: .97, rateMs: 80, mode: 'auto', mag: 100, reserve: 200, reloadMs: 5700, speed: 195, range: 550, pattern: spray(100, [[0, 0, 0], [1, .45, 0], [6, 3, .4], [12, 4.6, -.8], [20, 5.2, 1.2], [30, 5.6, -1.3], [45, 5.9, 1], [60, 6.1, -.9], [80, 6.3, .8], [99, 6.4, 0]]), desc: '100 rounds of suppressing fire. Slow to move and to reload.' }),
  G({ id: 'negev', name: 'Negev', kind: 'lmg', price: 1700, reward: 300, dmg: 35, ap: .71, rangeMod: .97, rateMs: 75, mode: 'auto', mag: 150, reserve: 300, reloadMs: 5700, speed: 150, range: 550, pattern: spray(150, [[0, 0, 0], [1, .7, 0], [3, 2.4, .8], [6, 4.4, -1], [9, 5.4, 1.2], [12, 5.2, -.4], [16, 4.7, 0], [24, 4.5, 0], [149, 4.5, 0]]), model: 'lmg', desc: '150 rounds: wild for the first shots, then a steady beam that holds a corner. Cheap for a machine gun; very slow to move.' }),
].map(w => { const c = CS2[w.id];   // (CS2's own numbers win over the literals above, which match them)
  return { ...w, usd: w.price, pen: c.cpen ?? w.pen ?? PEN[w.kind], pattern: w.mode === 'auto' && !w.pellets ? w.pattern.map(([p, y]) => [+(p * SPRAY_SCALE.pitch).toFixed(3), +(y * SPRAY_SCALE.yaw).toFixed(3)]) : w.pattern,
    rateMs: Math.round(c.cyc * 1000), dmg: c.dmg, ap: c.ar / 2, rangeMod: c.rmod, reach: c.rng / 6.5, hs: c.hs, deployMs: Math.round(c.dep * 1000), reloadStartMs: Math.round(c.rl * 1000), flinch: c.fl, recoilSeed: c.seed,
    acc: accFrom(c.acc), accZ: accFrom(c.accZ), recoil: recoilFrom(c.acc), recoilZ: recoilFrom(c.accZ), spread: c.acc[0], ...(c.zoom ? { zoom: c.zoom, zoomMs: c.zt.map(s => Math.round(s * 1000)) } : {}),
    ...(w.kind === 'shotgun' ? { shellMs: SHELL_MS, pelletSpread: c.acc[0] } : {}), ...reloadOf(w.id) }; });   // (v53 RELOAD: CS2's magazine, reserve and reload moments win over the literals)
export const WEAPON_IDS = WEAPONS.map(w => w.id);
// Darja's chrome hand cannon (old Payday saves only; not used in Global Defensive).
export const DARJA_GUN = { ...WEAPONS.find(w => w.id === 'deagle'), id: 'cannon', name: "Darja's Hand Cannon", price: 0, reward: 300, mag: 7, reserve: 35, reloadMs: 2200, magInMs: undefined, magInEmptyMs: undefined };   // (v53 RELOAD: its 52.0.5 rounds and reload, outside Global Defensive)
// Knives (slot 3): left click a quick slash, right click a slow heavy stab; from behind both are much stronger.
export const KNIVES = [
  { id: 'knife', name: 'Knife', kind: 'knife', price: 0, reward: 1500, dmg: 40, ap: .85, rangeMod: 1, rateMs: 400, mode: 'semi', range: 9, mag: 0, reserve: 0, reloadMs: 0, spread: 0, pattern: [[0, 0]], move: {}, recover: 1, speed: 250 },
  { id: 'karambit', name: '★ Karambit', kind: 'knife', price: 0, reward: 1500, dmg: 40, ap: .85, rangeMod: 1, rateMs: 400, mode: 'semi', range: 9, mag: 0, reserve: 0, reloadMs: 0, spread: 0, pattern: [[0, 0]], move: {}, recover: 1, speed: 250 },
];
// Knife attacks (CS2): light = left click, a quick slash every 0.4 s (40; 25 for one that follows another — within
// chainMs of the last attack's end; 90 in the back); heavy = right click, a slow stab every 1.0 s (65; 180 in the back).
// Each attack locks both buttons for its time. Reach 64 / 48 units (HU), swept as a hull (16 units round the aim line:
// the body nearest the crosshair); the hit counts the moment you click (hitMs 0). A backstab: from behind, the line to
// the victim within 61.6° of the way the victim faces (dot > backDot).
const KHU = 2.54 / 16.5;
export const KNIFE = { light: { front: 40, chain: 25, back: 90, rateMs: 400, hitMs: 0, range: 64 * KHU }, heavy: { front: 65, back: 180, rateMs: 1000, hitMs: 0, range: 48 * KHU }, hull: 16 * KHU, backDot: .475, chainMs: 400 };
// Grenades and the bomb (slot 5); their effects are host-run (arena-nades.js, arena-defuse.js). Listed in CS2's grenade
// order (items_game item_gear_slot_position 0–4 = slots 6–10, keys 6 7 8 9 0; key 4 cycles them in this order): HE,
// Flashbang, Smoke, Decoy, then slot 10's fire grenade — the Molotov for Terrorists, the Incendiary for Counter-
// Terrorists (items_game used_by_classes). Prices and kill award: weapons.vdata m_nPrice, m_nKillAward (300 each);
// speed: m_flMaxSpeed 245. desc: the buy menu's line (ours).
export const GRENADES = [['he', 'HE Grenade', 300, 6, null, 'Explodes after a short fuse, hurting everyone close by'], ['flash', 'Flashbang', 200, 7, null, 'Blinds everyone who looks at it · carry two'], ['smoke', 'Smoke Grenade', 300, 8, null, 'A cloud no one sees or shoots through'], ['decoy', 'Decoy Grenade', 50, 9, null, 'Sounds like your gun firing and shows on the enemy radar'], ['molotov', 'Molotov', 400, 10, 't', 'Sets the floor on fire where it breaks · Terrorists'], ['incendiary', 'Incendiary Grenade', 500, 10, 'ct', 'Sets the floor on fire where it lands · Counter-Terrorists']].map(([id, name, price, slot, team, desc]) => ({ id, name, kind: 'nade', price, slot, ...(team ? { team } : {}), desc, reward: 300, dmg: 0, ap: 1, rangeMod: 1, rateMs: 900, mode: 'semi', range: 0, mag: 0, reserve: 0, reloadMs: 0, spread: 0, pattern: [[0, 0]], move: {}, recover: 1, speed: 245 }));
export const NADE_ORDER = GRENADES.map(g => g.id), NADE_SLOT = Object.fromEntries(GRENADES.map(g => [g.id, g.slot]));
// What you may carry (CS2: ammo_grenade_limit_total 4, ammo_grenade_limit_flashbang 2, one of each other kind; the
// Molotov and the Incendiary share AMMO_TYPE_MOLOTOV, so one fire grenade at a time). A list is the kinds carried,
// a kind twice for two flashbangs (the loadout's `nades`, as the host streams it). '' = one more of `kind` fits.
export const NADE_MAX = 4, FLASH_MAX = 2;
const FIRE_NADES = ['molotov', 'incendiary'], countIn = (list, kind) => { let n = 0; for (const k of list) if (k === kind) n++; return n; };
export function nadeRefusal(list, kind) { const g = NADE_SLOT[kind] ? weaponById(kind) : null; if (!g) return 'Unknown grenade'; list = Array.isArray(list) ? list : [];
  if (list.length >= NADE_MAX) return 'You carry four grenades already'; if (kind === 'flash') return countIn(list, 'flash') >= FLASH_MAX ? 'Two flashbangs at most' : '';
  if (list.includes(kind)) return 'You already have a ' + g.name; if (FIRE_NADES.includes(kind) && list.some(k => FIRE_NADES.includes(k))) return 'One fire grenade at a time (Molotov or Incendiary)'; return ''; }
// A side's own grenade (Defuse buys): the Molotov is the Terrorists', the Incendiary the Counter-Terrorists'. '' = yours.
export const nadeSideRefusal = (kind, team) => { const g = weaponById(kind); return g?.team && team && g.team !== team ? g.name + ' is a ' + (g.team === 't' ? 'Terrorist' : 'Counter-Terrorist') + ' grenade · ' + (team === 't' ? 'buy the Molotov' : 'buy the Incendiary Grenade') : ''; };
// Grenade keys (lab.js): slot 6–10 = exactly the grenade in that slot among the ids you own, or null (never another
// kind); key 4 = the next kind after the one in hand in slot order, wrapping round (two flashbangs are one stop).
export const nadeInSlot = (own, slot) => { for (const id of own) if (NADE_SLOT[id] === slot) return id; return null; };
export function nextNade(own, held) { const h = NADE_ORDER.indexOf(held); let first = null; for (let i = 0; i < NADE_ORDER.length; i++) { if (!own.includes(NADE_ORDER[i])) continue; if (i > h) return NADE_ORDER[i]; first ??= NADE_ORDER[i]; } return first; }
// How many of each kind a list holds, in slot order (HUD, buy menu): fills `out` (reused: no allocation per frame)
// flat — kind, count, kind, count… — with the kinds carried only.
export function nadeCounts(list, out = []) { out.length = 0; if (!Array.isArray(list)) return out; for (const id of NADE_ORDER) { const n = countIn(list, id); if (n) out.push(id, n); } return out; }
export const C4 = { id: 'c4', name: 'C4 bomb', kind: 'bomb', price: 0, reward: 0, dmg: 0, ap: 1, rangeMod: 1, rateMs: 500, mode: 'semi', range: 0, mag: 0, reserve: 0, reloadMs: 0, spread: 0, pattern: [[0, 0]], move: {}, recover: 1, speed: 250 };
// Grenade throwing (one place for the input timing; flight is arena-nades.js): the pin takes primeMs to come out; a
// release before that throws nothing.
export const THROW = { primeMs: 350 };
// Recoil, CS style: the camera follows `view` of the aim punch (view_recoil_tracking 0.45); bullets land at the full
// punch (the patterns are the punch after weapon_recoil_scale 2), so a spray climbs above the fixed crosshair and you
// pull down to hold it. The per-shot visual view punch (viewKick, below: the gun's m_flRecoilMagnitude × 0.055) recovers
// at `kickBack` per second (view_punch_decay 18); it never moves the bullets.
export const RECOIL = { view: .45, kickBack: 18 };
// Body armor (buy menu · Equipment).
export const ARMOR = { kevlar: { name: 'Kevlar Vest', price: 650 }, helmet: { name: 'Kevlar + Helmet', price: 1000, upgrade: 350 } };
const BY_ID = new Map([...WEAPONS, ...KNIVES, ...GRENADES, C4, DARJA_GUN].map(w => [w.id, w]));
export const weaponById = id => BY_ID.get(id) || null;
export const isFirearm = w => !!w && ['rifle', 'smg', 'pistol', 'shotgun', 'sniper', 'lmg'].includes(w.kind);
export const MAX_HP = 100, RESPAWN_MS = 5000;
// Starting pistol for a team (deathmatch: the Glock).
export const defaultPistol = team => team === 'ct' ? 'usps' : 'pistol';
// Full ammo for a gun: [magazine, reserve].
export const fullAmmo = id => { const w = weaponById(id); return isFirearm(w) ? [w.mag, w.reserve] : null; };

// CS2 damage model: base × hit-group multiplier × rangeMod^(distance / 500 HU). One game unit ≈ 6.5 HU. A head shot
// takes the gun's own m_flHeadshotMultiplier (hs: 4 for most, the Desert Eagle 3.9, the M4A1-S 3.475), else 4.
export const HIT_GROUPS = { head: 4, chest: 1, stomach: 1.25, legs: .75 };
export const CS_UNITS_PER_UNIT = 6.5;
export function damageFor(wpn, zone, distance, pellets = 1) {
  const mult = zone === 'head' ? wpn.hs ?? HIT_GROUPS.head : HIT_GROUPS[zone] ?? 1, falloff = Math.pow(wpn.rangeMod ?? 1, (Math.max(0, distance) * CS_UNITS_PER_UNIT) / 500);
  return Math.max(1, Math.round(wpn.dmg * mult * falloff * pellets));
}
// THE rule for every hit, used by the host only (clients never decide damage), CS2's:
//  · A head shot does 4× (HIT_GROUPS); the helmet covers the head as kevlar covers chest and stomach — so an AK-47,
//    a Desert Eagle, an AWP or a Scout kill with one head shot through a helmet, a Glock, a USP-S, an M4A4 or an SMG
//    don't (without a helmet most do).
//  · Armor lets `ap` of the damage through to health and loses half of the rest; when the armor runs out the
//    remainder goes to health (CS2).
//  · Legs are never armored.
// armor: { kevlar: 0…100, helmet: bool } or null. Returns { hp: health damage, armor: armor lost, headKill }.
export const HEAD_KILL_HP = 1000;
export function hitDamage(wpn, zone, distance, pellets = 1, armor = null, base = null) {
  const raw = base ?? damageFor(wpn, zone, distance, pellets), kev = armor?.kevlar || 0;
  const covered = kev > 0 && (zone === 'chest' || zone === 'stomach' || (zone === 'head' && armor.helmet));
  if (!covered) return { hp: raw, armor: 0, headKill: false };
  let hp = Math.round(raw * (wpn.ap ?? 1)), lost = Math.round((raw - hp) * .5);
  if (lost > kev) { lost = kev; hp = Math.round(raw - kev * 2); }
  return { hp: Math.max(1, hp), armor: lost, headKill: false };
}
// Shotgun pellets (and any shot with several hits on one body): CS2 applies each pellet as its own hit — its own hit
// group, the armor worn down pellet by pellet. hits: [{ zone, f }] (f: the wall factor along that pellet's path, 1 in
// the open). Returns { hp, armor: armor lost, zone: the group that took the most, pellets }.
export function pelletDamage(wpn, hits, distance, armor = null) {
  let kev = armor?.kevlar || 0, helmet = !!armor?.helmet, hp = 0, lost = 0; const by = {};
  for (const h of hits) { const raw = h.f < 1 ? Math.max(1, Math.round(damageFor(wpn, h.zone, distance) * h.f)) : null, r = hitDamage(wpn, h.zone, distance, 1, kev > 0 ? { kevlar: kev, helmet } : null, raw);
    hp += r.hp; lost += r.armor; kev -= r.armor; if (kev <= 0) { kev = 0; helmet = false; } by[h.zone] = (by[h.zone] || 0) + r.hp; }
  let zone = 'chest', best = 0; for (const z of ['head', 'chest', 'stomach', 'legs']) if ((by[z] || 0) > best) { best = by[z]; zone = z; }
  return { hp, armor: lost, zone, pellets: hits.length };
}
// Hit group of a torso hit from its height above the feet (standing body 11 units tall: CS2's 72 u; crouched ÷
// CROUCH_H first). Above the neck (HEAD_Y) only the head counts as a head shot (rayBody).
export const zoneAt = y => y > HEAD_Y ? 'head' : y > 6.85 ? 'chest' : y > 4.77 ? 'stomach' : 'legs';
// Player body (game units): feet at pose.y − eye height. As CS2's agents stand at their true size (a rifle stance: head
// from ~61 u — the chin — to 72 u; crouched, 78 % of that height).
export const EYE = 9.7, BODY_R = 1.5, BODY_H = 11.0, HEAD_Y = 9.4, CROUCH_H = .78;
// The hit shape (rayBody): the torso a vertical cylinder of BODY_R from the feet to the neck (HEAD_Y), the head a sphere
// of HEAD_R round HEAD_C (both heights ×CROUCH_H crouched): top at 10.95 units ≈ 71 HU, about 9 HU across — our
// approximation of CS2's head hit box (a capsule a little over 4 HU in radius), not its exact shape. (The old single
// capsule scored the full 19.5 HU body width above HEAD_Y as the head, and 1.5 units of air over it.)
export const HEAD_R = .7, HEAD_C = 10.25;
// A (unit) ray against a body with its feet at (fx, fy, fz): the distance to the first hit or −1; out.zone = its hit
// group. pad: extra radius (the host's tolerance for where the shooter drew the target).
export function rayBody(ox, oy, oz, dx, dy, dz, fx, fy, fz, crouched = false, pad = 0, out = null) {
  const s = crouched ? CROUCH_H : 1, top = fy + HEAD_Y * s, R = BODY_R + pad, px = ox - fx, pz = oz - fz; let best = -1, zone = null;
  const a = dx * dx + dz * dz, b = px * dx + pz * dz, c = px * px + pz * pz - R * R;
  if (a > 1e-12) { const disc = b * b - a * c; if (disc >= 0) { const t = (-b - Math.sqrt(disc)) / a, y = oy + dy * t; if (t > 0 && y >= fy && y <= top) best = t; } }
  if (Math.abs(dy) > 1e-9) for (let k = 0; k < 2; k++) { const t = ((k ? fy : top) - oy) / dy; if (t > 0 && (best < 0 || t < best)) { const x = px + dx * t, z = pz + dz * t; if (x * x + z * z <= R * R) best = t; } }   // (the shoulders from above, the soles from below)
  if (best >= 0) zone = zoneAt(Math.min(HEAD_Y, (oy + dy * best - fy) / s) - 1e-9);
  const hr = HEAD_R + pad, qx = ox - fx, qy = oy - (fy + HEAD_C * s), qz = oz - fz, hb = qx * dx + qy * dy + qz * dz, hd = hb * hb - (qx * qx + qy * qy + qz * qz - hr * hr);
  if (hd >= 0) { const t = -hb - Math.sqrt(hd); if (t > 0 && (best < 0 || t < best)) { best = t; zone = 'head'; } }
  if (out) out.zone = zone; return best;
}

// ── Aim (client and tests) ───────────────────────────────────────────────────────────────────────────────────
// Spray offset [pitch°, yaw°] at a (fractional) pattern position: the first bullet is exactly [0, 0].
export function sprayAt(wpn, idx) {
  const p = wpn.pattern || [[0, 0]], i = Math.max(0, Math.min(p.length - 1, idx)), a = Math.floor(i), b = Math.min(p.length - 1, a + 1), t = i - a;
  if (idx > p.length - 1) { const last = p[p.length - 1]; return [last[0], last[1]]; }
  return [p[a][0] + (p[b][0] - p[a][0]) * t, p[a][1] + (p[b][1] - p[a][1]) * t];
}
// The same without a new array (fills out[0] pitch°, out[1] yaw°): per shot, every frame of a spray.
function sprayInto(wpn, idx, out) { const p = wpn.pattern || [[0, 0]], L = p.length - 1, i = Math.max(0, Math.min(L, idx)), a = Math.floor(i), b = Math.min(L, a + 1), t = i - a; out[0] = p[a][0] + (p[b][0] - p[a][0]) * t; out[1] = p[a][1] + (p[b][1] - p[a][1]) * t; return out; }
// Shotgun pellet directions as [pitch, yaw] (tangent units) around the shot: a fixed pattern (a centre pellet and
// rings of CS2's m_flSpread), so every shot lands the same way.
export function pelletPattern(wpn) {
  const n = wpn.pellets || 1, r = wpn.pelletSpread || 0, out = [[0, 0]];
  for (let i = 1; i < n; i++) { const ring = i <= 6 ? .55 : 1, k = i <= 6 ? i : i - 6, cnt = i <= 6 ? Math.min(6, n - 1) : Math.max(1, n - 7), a = (k / cnt) * Math.PI * 2 + (i <= 6 ? 0 : .5); out.push([Math.sin(a) * r * ring, Math.cos(a) * r * ring]); }
  return out;
}

// ── Shots, CS2's rules: one set of pure functions for the shooter's prediction (weapons.js) and the host (combat-logic.js),
// so both compute the very same bullets. Angles in radians unless marked °; inaccuracy and spread in tangent units (the
// vdata's: an offset of 0.01 across a unit of distance); times in ms for the trigger, seconds for accuracy.
export const HU = 2.54 / 16.5, D2R = Math.PI / 180;
export const JUMP_IMPULSE = 301.993377;   // HU/s (CS2 sv_jump_impulse): the air penalty's scale
// Accuracy in force: the scoped mode's values once scoped (accZ), else the gun's own. null: not a gun.
export const accOf = (wpn, scoped = false) => (scoped && wpn?.accZ) || wpn?.acc || null;
// The penalty's floor (CS UpdateAccuracyPenalty): the ladder's on a ladder, else crouched or standing.
export const accFloor = (a, ducked, ladder) => ladder ? a.ladder : ducked ? a.crouch : a.stand;
// Recovery time (s, CS GetRecoveryTime): crouched or standing (a ladder: standing), moving from the first to the
// 'Final' value as the recoil index goes from the transition's start bullet to its end bullet.
export function recoveryTime(a, ducked, ladder, ri) { const cr = ducked && !ladder, r0 = cr ? a.recCrouch : a.recStand, r1 = cr ? a.recCrouchFinal : a.recStandFinal;
  if (!(r1 > 0) || !(a.trEnd > a.trStart)) return r0; const k = Math.max(0, Math.min(1, (ri - a.trStart) / (a.trEnd - a.trStart))); return r0 + (r1 - r0) * k; }
// A gun's aim state: pen (CS's accuracy penalty: what is left of the shots' m_flInaccuracyFire, jumps and landings,
// never under the floor), ri (recoil index: bullets into the spray), aimP / aimY (the spray's aim punch, °: where the
// next bullet goes from the look), flP / flY (being shot: the flinch, °), lastShot / nextAt (ms), t (ms: advanced to).
export const createAim = () => ({ pen: 0, ri: 0, aimP: 0, aimY: 0, flP: 0, flY: 0, lastShot: -1e9, nextAt: 0, t: 0 });
// Penalty over dt seconds: up to the floor at once, down toward it ×0.1 per recovery time (CS: Lerp(exp(−dt·ln10 / rt),
// floor, penalty)). An exponential: frames of any length give the same value at the same moment.
export function accuracyDecay(st, a, dt, ducked = false, ladder = false) { const fl = accFloor(a, ducked, ladder); if (!(st.pen > fl)) { st.pen = fl; return st; }
  if (dt > 0) st.pen = fl + (st.pen - fl) * Math.exp(-dt * Math.LN10 / recoveryTime(a, ducked, ladder, st.ri)); return st; }
// Movement and air on top of the penalty (CS GetInaccuracy): running from 34 % of the gun's speed (CS_PLAYER_SPEED_DUCK
// _MODIFIER) to 95 % adds up to m_flInaccuracyMove — so a counter-strafe is accurate the moment the speed is under 34 %;
// in the air, m_flInaccuracyJump × (√|vertical speed| from ¼ of √jump impulse to all of it: up to 2×), least at the apex.
// CS2's m_flInaccuracyJumpApex (only the Desert Eagle's is not 0) is added at the apex and fades as the vertical
// speed grows — our reading of that value's name, not CS2 code. m: { speed, max (units/s), onGround, vy (units/s), ladder }.
export function movePenalty(a, m) {
  if (!a || !m) return 0; let x = 0; const max = m.max > 0 ? m.max : 1, f = (m.speed - max * .34) / (max * .61); if (f > 0) x += Math.min(1, f) * a.move;
  if (!m.onGround && !m.ladder) { const sj = Math.sqrt(JUMP_IMPULSE), k = Math.max(0, Math.min(2, (Math.sqrt(Math.abs(m.vy || 0) / HU) - sj * .25) / (sj * .75))); x += a.jump * k + (a.jumpApex || 0) * Math.max(0, 1 - k); }
  return x;
}
// The inaccuracy of a shot now (CS: never over 1).
export const inaccuracyOf = (a, st, m) => a ? Math.min(1, st.pen + movePenalty(a, m)) : 0;
// Movement's share alone (crosshair, tests). m.scoped picks the scoped mode.
export const moveInaccuracy = (wpn, m) => isFirearm(wpn) ? movePenalty(accOf(wpn, !!m?.scoped), m) : 0;
// The trigger (ms): a held trigger keeps the gun's exact cadence — the next shot one cycle after the one before, however
// long the frames are (weapons.js passes a held shot's due moment, t = prevNext) — and a press after a pause starts
// from the press: never less than one cycle after this shot's own moment t (CS2: m_flNextPrimaryAttack = shot + cycle;
// a fresh click never borrows time, so a semi-automatic stays at m_flCycleTime and the host's gate always passes it).
export const nextFireAt = (prevNext, t, cycleMs) => Math.max(t, prevNext) + cycleMs;
// The spray at rest: after RECOIL_REST (× the cycle; single-shot guns 60 ms) without a shot the aim punch decays along its
// own line toward the crosshair — exponentially (weapon_recoil_decay2_exp 8 /s) plus linearly (weapon_recoil_decay2_lin
// 18 °/s), the CS:GO-era cvar defaults; never back along the pattern — and the recoil index winds down by `recover`
// bullets/s (single-shot guns: one pattern step per 0.6 cycle). The flinch decays the same way, always.
export const RECOIL_DECAY = { exp: 8, lin: 18 }, RECOIL_REST = 1.1;
export const restAfterMs = wpn => wpn.mode === 'bolt' || wpn.mode === 'pump' ? 60 : wpn.rateMs * RECOIL_REST;
// dL/dt = −exp·L − lin, solved (so any split of the time gives the same result): the factor that scales a punch of
// length L over dt seconds.
const decayK = (L, dt) => { if (!(L > 0) || !(dt > 0)) return 1; const c = RECOIL_DECAY.lin / RECOIL_DECAY.exp, L1 = (L + c) * Math.exp(-RECOIL_DECAY.exp * dt) - c; return L1 > 0 ? L1 / L : 0; };
// A shot: the aim punch steps by the pattern from this bullet to the next — a continuous spray follows the gun's
// pattern exactly (the learned spray) — and the recoil index moves on one bullet.
const SP0 = [0, 0], SP1 = [0, 0];
export function recoilShot(st, wpn) { sprayInto(wpn, st.ri, SP0); sprayInto(wpn, st.ri + 1, SP1); st.aimP += SP1[0] - SP0[0]; st.aimY += SP1[1] - SP0[1]; st.ri = Math.min(st.ri + 1, (wpn.pattern?.length || 1) + 2); return st; }
// Rest for dt seconds (the caller passes only the time past restAfterMs).
export function recoilRest(st, wpn, dt) { if (!(dt > 0)) return st; const k = decayK(Math.hypot(st.aimP, st.aimY), dt); st.aimP *= k; st.aimY *= k;
  st.ri = Math.max(0, st.ri - dt * (wpn.mode === 'bolt' || wpn.mode === 'pump' ? 1000 / (wpn.rateMs * .6) : wpn.recover || 10)); return st; }
export function flinchRest(st, dt) { const k = decayK(Math.hypot(st.flP, st.flY), dt); st.flP *= k; st.flY *= k; return st; }
// Being shot (aim punch, SHOOT-18): the view and the bullets kick up by FLINCH.deg per HP taken, much less on armor
// (kevlar on the part hit) — our approximation of CS2's punch from damage (CS: armor stops most of it); max FLINCH.max.
export const FLINCH = { deg: .06, armored: .15, max: 4 };
export const flinchPunch = (dmg, armored) => Math.min(FLINCH.max, Math.max(0, dmg) * FLINCH.deg * (armored ? FLINCH.armored : 1));
// The visual view punch of a shot (camera only, never the bullets): weapon_recoil_view_punch_extra 0.055 (CS:GO-era
// default) × the gun's m_flRecoilMagnitude ± its variance, in the direction m_flRecoilAngle ± m_flRecoilAngleVariance
// from straight up — the variances drawn from the shot's seed; at most VIEW_PUNCH_MAX (our cap: the Nova's 143 would
// throw the view 7.9°). It decays at RECOIL.kickBack 18 /s (view_punch_decay 18). out: { pitch, yaw } in °.
export const VIEW_PUNCH_EXTRA = .055, VIEW_PUNCH_MAX = 4;
export function viewKick(wpn, n, scoped, out) { const r = (scoped && wpn.recoilZ) || wpn.recoil; if (!r) { out.pitch = out.yaw = 0; return out; }
  const mag = Math.min(VIEW_PUNCH_MAX, (r.mag + (2 * shotRand(n, 7) - 1) * r.magVar) * VIEW_PUNCH_EXTRA), ang = (r.angle + (2 * shotRand(n, 8) - 1) * r.angleVar) * D2R; out.pitch = mag * Math.cos(ang); out.yaw = mag * Math.sin(ang); return out; }
// Uniform in [0, 1) from a shot number and a draw index: integer hashing only (Math.imul, murmur3's finaliser), so node,
// Chrome and Electron on any computer draw the same bits — the host and the shooter agree on every shot.
export function shotRand(n, k) { let h = Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((k | 0) + 1, 0x85ebca77); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
// Shot n's bullets (CS FX_FireBullets): one inaccuracy offset for the whole shot — radius inaccuracy × u (uniform in the
// radius: most land near the middle), any direction — plus each bullet's spread (radius m_flSpread × u); shotgun pellets
// take the fixed pattern (pelletPattern) round the shot's offset instead. Fills out[2k] (right), out[2k + 1] (up) in
// tangent units; returns how many bullets.
const PELLETS = new Map();
export function shotOffsets(wpn, n, inacc, spread, out) {
  const r0 = Math.max(0, inacc) * shotRand(n, 0), t0 = 2 * Math.PI * shotRand(n, 1), x0 = r0 * Math.cos(t0), y0 = r0 * Math.sin(t0);
  if (wpn.pellets) { let P = PELLETS.get(wpn.id); if (!P) PELLETS.set(wpn.id, P = pelletPattern(wpn)); for (let k = 0; k < P.length; k++) { out[2 * k] = x0 + P[k][1]; out[2 * k + 1] = y0 + P[k][0]; } return P.length; }
  const r1 = Math.max(0, spread || 0) * shotRand(n, 2), t1 = 2 * Math.PI * shotRand(n, 3); out[0] = x0 + r1 * Math.cos(t1); out[1] = y0 + r1 * Math.sin(t1); return 1;
}
// Direction of a look (pitch up, yaw as the lab's rotation.y: the camera's −Z through a YXZ euler) into out[0..2].
export function aimDir(pitch, yaw, out) { const cp = Math.cos(pitch); out[0] = -Math.sin(yaw) * cp; out[1] = Math.sin(pitch); out[2] = -Math.cos(yaw) * cp; return out; }
// A unit direction moved by (ox right, oy up) in its own frame, normalised, into out (may be d).
export function offsetDir(d, ox, oy, out) {
  let rx = -d[2], rz = d[0]; const rl = Math.hypot(rx, rz); if (rl < 1e-9) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
  const ux = -rz * d[1], uy = rz * d[0] - rx * d[2], uz = rx * d[1], x = d[0] + rx * ox + ux * oy, y = d[1] + uy * oy, z = d[2] + rz * ox + uz * oy, L = Math.hypot(x, y, z);
  out[0] = x / L; out[1] = y / L; out[2] = z / L; return out;
}
// The bullet's base direction: the look (raw: the mouse's, not the camera's view punch) plus the aim punch (°).
export const shotBase = (pitch, yaw, puP, puY, out) => aimDir(pitch + puP * D2R, yaw - puY * D2R, out);
// Scope: CS2's zoom FOVs are horizontal degrees on a 4:3 screen (as its 90 — the arena's 73.74° vertical): the camera's
// vertical FOV; and the scoped mouse sensitivity, zoom_sensitivity_ratio 1: the zoom's FOV over the unscoped 90.
export const zoomVfov = z => 2 * Math.atan(Math.tan(z * Math.PI / 360) * .75) * 180 / Math.PI;
export const zoomSens = z => z / 90;
