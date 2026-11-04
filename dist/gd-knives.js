// CS2's knives in Global Defensive (v53 KNIVES): the one table every knife list reads — the M menu's KNIFE row, the
// host's check of a { type: 'knife' } pick, the room's save, the first-person sets, the third-person models and holds,
// the kill feed and the CS2 finishes. Pure data (the host imports it in Node).
//
// The rule (CS2): a knife choice is only a look. Every CS2 knife is the same weapon for the rules — weapons.vdata gives
// each of them (weapon_knife, weapon_knife_t, weapon_bayonet, weapon_knife_flip, …_widowmaker, …_skeleton, …_outdoor,
// the butterfly, stiletto, M9 and karambit) identical numbers: m_nDamage 50, m_flCycleTime [0.15, 0.3],
// m_flDeployDuration 1.0, m_flMaxSpeed 250, m_flArmorRatio 1.7, m_flRange 4096, m_nKillAward 1500 (read from the
// user's install, scripts/weapons.vdata, 2026-11-04). So a chosen knife is never a weapon of its own here: you carry the
// game's 'knife' (weapons-data.js KNIFE: its light / heavy attacks), drawn as your pick. (The karambit alone is also a
// weapon id, Darja's from before v52; its numbers are the knife's.)
//
// Per knife: name — CS2's English name (csgo_english.txt SFUI_WPNHUD_*: "Bayonet", "Flip Knife", "Talon Knife",
// "Skeleton Knife", "Nomad Knife"); cls — CS2's item class (weapons.vdata m_szName); dir — its model folder
// (weapons/models/knife/<dir>/); icon — its picture in panorama/images/icons/equipment/ (the kill feed, the HUD, the M
// menu): note the Bayonet's is plain 'bayonet' (the install has no knife_bayonet.vsvg), the Talon's knife_widowmaker,
// the Nomad's knife_outdoor; inspects — how many inspect clips CS2's view-model graph picks from
// (animation/graphs/viewmodel/viewmodel_inspects.vnmgraph+knife_<dir>: a Parameterized Clip Selector on
// 'inspect_variation', option weights [2, 1, 1] over Inspect0 = lookat01, Inspect1 = lookat02, Inspect2 = none — so
// lookat01 twice as often as lookat02 where a knife has both).
export const STAR_KNIVES = {
  butterfly: { name: 'Butterfly Knife', cls: 'weapon_knife_butterfly', dir: 'knife_butterfly', icon: 'knife_butterfly', inspects: 1 },
  stiletto: { name: 'Stiletto Knife', cls: 'weapon_knife_stiletto', dir: 'knife_stiletto', icon: 'knife_stiletto', inspects: 1 },
  m9: { name: 'M9 Bayonet', cls: 'weapon_knife_m9_bayonet', dir: 'knife_m9', icon: 'knife_m9_bayonet', inspects: 1 },
  karambit: { name: 'Karambit', cls: 'weapon_knife_karambit', dir: 'knife_karambit', icon: 'knife_karambit', inspects: 1 },
  bayonet: { name: 'Bayonet', cls: 'weapon_bayonet', dir: 'knife_bayonet', icon: 'bayonet', inspects: 1 },
  skeleton: { name: 'Skeleton Knife', cls: 'weapon_knife_skeleton', dir: 'knife_skeleton', icon: 'knife_skeleton', inspects: 2 },
  talon: { name: 'Talon Knife', cls: 'weapon_knife_widowmaker', dir: 'knife_talon', icon: 'knife_widowmaker', inspects: 2 },
  flip: { name: 'Flip Knife', cls: 'weapon_knife_flip', dir: 'knife_flip', icon: 'knife_flip', inspects: 1 },
  nomad: { name: 'Nomad Knife', cls: 'weapon_knife_outdoor', dir: 'knife_outdoor', icon: 'knife_outdoor', inspects: 2 },
};
// (the stiletto, too, has a lookat02 in the install; its set was built before v53 with lookat01 only)
// (v53 KNIVES final) CS2's draw choice: viewmodel_knife.vnmgraph+skeleton / +outdoor, DeployOptions0/1 — a
// Parameterized Clip Selector on deploy_variation, m_optionWeights [1, 8, 1] over draw_<k>, draw2_<k> and an empty
// clip, m_bIgnoreInvalidOptions true: the rare draw_<k> (the Nomad's 2.23 s flourish) 1 time in 9, draw2 (1.0 s, as
// m_flDeployDuration) 8 in 9. fp-view.js drawPick(): Math.random() * 9 < DRAW_RARE.
export const DRAW_RARE = 1;
// (v53 KNIVES final) Inspecting while drawing: the inspects graph's 'Draw' state plays lookat01_draw_<k> (only the Bayonet
// and the Flip have one) when the draw clip's CNmIDEvent WPN_INSPECT_USE_DRAW_VERSION is on — seconds from the draw's
// start. draw_bayonet.vnmclip: m_flDuration 1.1667, events 0–0.142857 and 0–0.285714 (fractions of the clip, as
// fp_sounds.py reads clip events) → 0.333 s; draw_flip.vnmclip: m_flDuration 1.0, 0–0.4 → 0.4 s.
export const INSPECT_DRAW_S = { bayonet: 0.333, flip: 0.4 };
// The new ones (v53): what tests and the asset pack list check.
export const NEW_KNIVES = ['bayonet', 'skeleton', 'talon', 'flip', 'nomad'];
// Every pick a player may make, in the M menu's order: the default, then the star knives.
export const KNIFE_IDS = ['default', ...Object.keys(STAR_KNIVES)];
// Star knives drawn on the 'knife' weapon (all but the karambit, which is a weapon id of its own).
export const KNIFE_SKIN_IDS = Object.keys(STAR_KNIVES).filter(k => k !== 'karambit');
export const isStarKnife = k => Object.prototype.hasOwnProperty.call(STAR_KNIVES, k);
// '★ Talon Knife' (CS2 marks every knife but the defaults with a star); null for the default / unknown.
export const knifeTitle = k => isStarKnife(k) ? '★ ' + STAR_KNIVES[k].name : null;
// A weapon id or chosen knife a knife model / hold / clip is keyed by.
export const KNIFE_MODEL_RE = /^(knife|knife-t|karambit|butterfly|stiletto|m9|bayonet|skeleton|talon|flip|nomad)$/;
