// Which CS2 model each game weapon is (identifiers only: CS2's item class, model and composite-input folder names;
// no Valve data). Game id → { cls: items_game weapon class, model: CS2 model (export glb / HD composite PreviewModel),
// legacy_composite: the old body_legacy composite inputs }; the first-person set is user-assets/fp/cs2_<game id>.glb.
// AUG: no CS2 first-person set on this install, so no imported finishes (built-in finishes only).
const L = 'materials/models/weapons/customization/', lc = d => `${L}${d}/${d}_composite_inputs.vmat`;
const gun = (cls, model, legacy) => ({ kind: 'gun', cls, model, legacy_composite: lc(legacy) });
export const GUNS = {
  pistol: gun('weapon_glock', 'weapon_pist_glock18', 'pist_glock18'), usps: gun('weapon_usp_silencer', 'weapon_pist_usp_silencer', 'pist_223'),
  p250: gun('weapon_p250', 'weapon_pist_p250', 'pist_p250'), fiveseven: gun('weapon_fiveseven', 'weapon_pist_fiveseven', 'pist_fiveseven'),
  cz75: gun('weapon_cz75a', 'weapon_pist_cz75a', 'pist_cz_75'), tec9: gun('weapon_tec9', 'weapon_pist_tec9', 'pist_tec9'), deagle: gun('weapon_deagle', 'weapon_pist_deagle', 'pist_deagle'),
  mac10: gun('weapon_mac10', 'weapon_smg_mac10', 'smg_mac10'), mp9: gun('weapon_mp9', 'weapon_smg_mp9', 'smg_mp9'), mp7: gun('weapon_mp7', 'weapon_smg_mp7', 'smg_mp7'),
  smg: gun('weapon_mp5sd', 'weapon_smg_mp5sd', 'smg_mp5sd'), bizon: gun('weapon_bizon', 'weapon_smg_bizon', 'smg_bizon'), ump45: gun('weapon_ump45', 'weapon_smg_ump45', 'smg_ump45'),
  p90: gun('weapon_p90', 'weapon_smg_p90', 'smg_p90'), shotgun: gun('weapon_nova', 'weapon_shot_nova', 'shot_nova'), xm1014: gun('weapon_xm1014', 'weapon_shot_xm1014', 'shot_xm1014'),
  galil: gun('weapon_galilar', 'weapon_rif_galilar', 'rif_galilar'), famas: gun('weapon_famas', 'weapon_rif_famas', 'rif_famas'), ak: gun('weapon_ak47', 'weapon_rif_ak47', 'rif_ak47'),
  m4: gun('weapon_m4a1', 'weapon_rif_m4a4', 'rif_m4a1'), m4s: gun('weapon_m4a1_silencer', 'weapon_rif_m4a1_silencer', 'rif_m4a1_s'), sg553: gun('weapon_sg556', 'weapon_rif_sg556', 'rif_sg556'),
  ssg08: gun('weapon_ssg08', 'weapon_snip_ssg08', 'snip_ssg08'), sniper: gun('weapon_awp', 'weapon_snip_awp', 'snip_awp'),
  lmg: gun('weapon_m249', 'weapon_mach_m249', 'mach_m249para'), negev: gun('weapon_negev', 'weapon_mach_negev', 'mach_negev'),
  // (v53 GUNS8: CS2's guns the game lacked — their first-person sets from tools/cs2-fp/export_missing.py; the legacy
  // composite folders as the install names them: materials/models/weapons/customization/<folder>)
  p2000: gun('weapon_hkp2000', 'weapon_pist_hkp2000', 'pist_hkp2000'), elite: gun('weapon_elite', 'weapon_pist_elite', 'pist_elite'), revolver: gun('weapon_revolver', 'weapon_pist_revolver', 'pist_revolver'),
  mag7: gun('weapon_mag7', 'weapon_shot_mag7', 'shot_mag7'), sawedoff: gun('weapon_sawedoff', 'weapon_shot_sawedoff', 'shot_sawedoff'), scar20: gun('weapon_scar20', 'weapon_snip_scar20', 'snip_scar20'), g3sg1: gun('weapon_g3sg1', 'weapon_snip_g3sg1', 'snip_g3sg1'),
};
// Star knives: the kit-name infix CS2 uses per knife (cu_karam_lore, cu_m9_bay_lore…) is dropped to form the family.
const knife = (cls, dir, infix) => ({ kind: 'knife', cls, model: 'weapon_' + dir, composite: `weapons/models/knife/${dir}/materials/composite_inputs/${dir}_composite_inputs.vmat`, infix });
export const KNIVES = {
  karambit: knife('weapon_knife_karambit', 'knife_karambit', ['karam', 'karambit']), butterfly: knife('weapon_knife_butterfly', 'knife_butterfly', ['butterfly']),
  m9: knife('weapon_knife_m9_bayonet', 'knife_m9', ['m9', 'bay', 'bayonet']), stiletto: knife('weapon_knife_stiletto', 'knife_stiletto', ['stiletto']),
  // v53 KNIVES: CS2's item classes (weapons.vdata m_szName / items_game) and model folders. The Talon is CS2's
  // weapon_knife_widowmaker in the knife_talon folder (its kits: am_doppler_phase1_widow, aq_damascus_widow…); the Nomad
  // is weapon_knife_outdoor. The Bayonet's class has no 'knife_' (weapon_bayonet), its kits cu_bayonet_lore….
  bayonet: knife('weapon_bayonet', 'knife_bayonet', ['bayonet']), skeleton: knife('weapon_knife_skeleton', 'knife_skeleton', ['skeleton']),
  talon: knife('weapon_knife_widowmaker', 'knife_talon', ['widow', 'widowmaker', 'talon']), flip: knife('weapon_knife_flip', 'knife_flip', ['flip']),
  nomad: knife('weapon_knife_outdoor', 'knife_outdoor', ['outdoor', 'nomad']),
};
export const MODELS = { ...GUNS, ...KNIVES };
// The finishes every curated import includes (the visual check list, PLAN §8.2) on top of the best-known per gun.
export const CHECK_KITS = { ak: ['cu_ak47_cobra'], sniper: ['cu_awp_asimov'], m4s: ['cu_m4a1s_printstream'], usps: ['cu_usp_kill_confirmed'], pistol: ['so_red'], deagle: ['hy_ddpat_urb'] };
// Built-in finish each old knife-skin id maps to, and back (PLAN §2.7): the importer's fbId for these families.
export const FAMILY_FB = { aa_fade: 'fade', am_marble_fade: 'marble', am_ruby_marbleized: 'doppler', am_sapphire_marbleized: 'sapphire', am_emerald_marbleized: 'emerald',
  aq_oiled: 'casehardened', hy_webs: 'web', an_tiger_orange: 'tiger', sp_mesh_tan: 'camo', hy_forest_boreal: 'forest' };
