// Global Defensive surface properties, as CS2 has them (v53 stage 5). One table drives four things for every bullet,
// footstep and grenade that meets the map: the wallbang (penetration power and damage loss), the impact effect and
// decal (gd-impacts.js), the impact sound, and the grenade bounce / footstep surface (map-light.js keeps the footstep
// classes it always had).
//
// THE RULE (what a surface is made of):
//  1. a CS2 map converted on this computer: each bullet stretch carries its CS2 surface property — its exact name
//     (header.pens: chainlink, metalgrate, metalrailing… — maps imported since the v53 MAP fix), or in files made
//     before it, the importer's classes (concrete, wood, crate, metal, plaster, brick, sand, stone, glass), which
//     MAT_SURFACE turns into the CS2 surface property each stands for; a door or breakable carries its model's
//     own surface property (MODEL_SURFACE, read from the model's physics in the user's install);
//  2. the built-in maps: each solid's material (sand, plaster, adobe, roof, metal-red…) → MAT_SURFACE;
//  3. anything else: CS2's "default".
// CS2_SURFACES holds CS2's values, resolved through each property's `base` chain (a field a property leaves out comes
// from its base, then from "default"), from the user's install — tools/cs2-surfaceprops.mjs prints them and
// tests/gd-surface-props.mjs checks this table against the files whenever the install is on the computer:
//   gm      game material letter     scripts/surfaceproperties_game.txt  gamematerial
//   dist    penetration modifier     scripts/surfaceproperties_game.txt  bulletPenetrationDistanceModifier
//   dmg     damage modifier          scripts/surfaceproperties_game.txt  bulletPenetrationDamageModifier
//   effect  impact particle          scripts/surfaceproperties_impact_effects.txt  effect (particles/impact_fx/…)
//   decal   impact decal group       scripts/surfaceproperties_impact_effects.txt  impactDecalName
//   sound   bullet impact event      surfaceproperties/surfaceproperties.vsurf  audiosounds.bulletimpact
//   e, f    elasticity, friction     surfaceproperties/surfaceproperties.vsurf  physics
//
// THE WALLBANG (penWalk, below): CS2's server code is not in the install, so the formula is CS:GO's
// HandleBulletPenetration (cs_player_shared.cpp, the code CS2's surface fields were renamed from: penetrationmodifier
// → bulletPenetrationDistanceModifier). Per solid crossed, with D the bullet's damage on arrival, P the gun's
// m_flPenetration (weapons.vdata) and T the solid's thickness in Hammer units:
//    mod  = the entry and exit surfaces' dist averaged (one solid: its own); both wood (gm W) or cardboard (U) → 3,
//           both plastic (L) → 2; a glass (Y) or grate (G) entry → 3 with a 5 % loss instead of 16 %;
//    lost = D · 0.16 + (3 / P · 1.25) · (3 / mod) + (1 / mod) · T² / 24;    D −= lost; below 1 the bullet stops.
//  It stops too: P ≤ 0 (the Zeus, grenades), mod < 0.1 (metal barrels, blockbullets), a solid over 90 units thick (CS:GO
//  TraceToExit's MAX_PENETRATION_DISTANCE), after 4 solids (nPenetrationCount), or past 3000 units of travel
//  (flPenetrationDistance). The damage modifier (dmg) is read and kept, but CS:GO's formula never uses it — whether CS2
//  does cannot be read from the install (noted in UPDATE-v53.0.md).
// Pure data and arithmetic: the host, the clients and the tests share it. Nothing allocated per call.

// CS2's surface properties (the user's install, resolved; see the header). Names as CS2 spells them.
export const CS2_SURFACES = {
  default: { gm: 'C', dist: .5, dmg: .5, effect: 'impact_concrete', decal: 'Impact.Concrete', sound: 'Default.BulletImpact', e: .25, f: .8 },
  concrete: { gm: 'C', dist: .5, dmg: .25, effect: 'impact_concrete', decal: 'Impact.Concrete', sound: 'Concrete.BulletImpact', e: .2, f: .8 },
  rock: { gm: '3', dist: .5, dmg: .25, effect: 'impact_concrete', decal: 'Impact.Rock', sound: 'Concrete.BulletImpact', e: .25, f: .8 },
  brick: { gm: 'R', dist: .47, dmg: .3, effect: 'impact_concrete', decal: 'Impact.Rock', sound: 'Concrete.BulletImpact', e: .25, f: .8 },
  stucco: { gm: '2', dist: .5, dmg: .25, effect: 'impact_concrete', decal: 'Impact.Concrete', sound: 'Concrete.BulletImpact', e: .25, f: .8 },
  asphalt: { gm: 'Q', dist: .55, dmg: .3, effect: 'impact_concrete', decal: 'Impact.Asphalt', sound: 'Concrete.BulletImpact', e: .25, f: .8 },
  gravel: { gm: '3', dist: .4, dmg: .25, effect: 'impact_concrete', decal: 'Impact.Rock', sound: 'Concrete.BulletImpact', e: .25, f: .8 },
  plaster: { gm: '2', dist: .7, dmg: .6, effect: 'impact_plaster', decal: 'Impact.Plaster', sound: 'Concrete.BulletImpact', e: .25, f: .8 },
  sheetrock: { gm: '5', dist: .85, dmg: .6, effect: 'impact_plaster', decal: 'Impact.Sheetrock', sound: 'drywall.ImpactHard', e: .25, f: .8 },
  tile: { gm: 'T', dist: .7, dmg: .3, effect: 'impact_tile', decal: 'Impact.Tile', sound: 'Tile.BulletImpact', e: .3, f: .8 },
  Wood: { gm: 'W', dist: .9, dmg: .6, effect: 'impact_wood', decal: 'Impact.Wood', sound: 'Wood.BulletImpact', e: .1, f: .8 },
  Wood_Crate: { gm: 'W', dist: .9, dmg: .6, effect: 'impact_wood', decal: 'Impact.Wood', sound: 'Wood.BulletImpact', e: .25, f: .8 },
  Wood_Panel: { gm: 'W', dist: .9, dmg: .6, effect: 'impact_wood', decal: 'Impact.Wood', sound: 'Wood_Panel.BulletImpact', e: .25, f: .8 },
  Wood_Plank: { gm: 'W', dist: .85, dmg: .6, effect: 'impact_wood', decal: 'Impact.Wood', sound: 'Wood_Plank.BulletImpact', e: .25, f: .8 },
  Wood_Solid: { gm: 'W', dist: .8, dmg: .6, effect: 'impact_wood', decal: 'Impact.Wood', sound: 'Wood_Solid.BulletImpact', e: .25, f: .8 },
  Wood_Furniture: { gm: 'W', dist: .9, dmg: .6, effect: 'impact_wood', decal: 'Impact.Wood', sound: 'Wood_Box.BulletImpact', e: .25, f: .8 },
  solidmetal: { gm: 'M', dist: .27, dmg: .3, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'SolidMetal.BulletImpact', e: .1, f: .8 },
  metal: { gm: 'M', dist: .4, dmg: .3, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'SolidMetal.BulletImpact', e: .25, f: .8 },
  Metal_Box: { gm: 'M', dist: .5, dmg: .3, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'Metal_Box.BulletImpact', e: .25, f: .8 },
  metal_sheetmetal: { gm: 'M', dist: .4, dmg: .3, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'SolidMetal.BulletImpact', e: .25, f: .8 },
  metal_ventslat: { gm: 'M', dist: .4, dmg: .3, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'SolidMetal.BulletImpact', e: .25, f: .8 },
  metalvehicle: { gm: 'M', dist: .5, dmg: .3, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'MetalVehicle.BulletImpact', e: .2, f: .8 },
  metalpanel: { gm: 'V', dist: .5, dmg: .45, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'MetalVehicle.BulletImpact', e: .2, f: .8 },
  metalvent: { gm: 'V', dist: .6, dmg: .45, effect: 'impact_metal_vent', decal: 'Impact.Vent', sound: 'MetalVehicle.BulletImpact', e: .1, f: .8 },
  metalgrate: { gm: 'G', dist: .95, dmg: .99, effect: 'impact_metal_grate', decal: 'Impact.Metal', sound: 'MetalGrate.BulletImpact', e: .25, f: .8 },
  chainlink: { gm: 'G', dist: .99, dmg: .99, effect: 'impact_chainlink', decal: 'Impact.Concrete', sound: 'ChainLink.BulletImpact', e: .25, f: .8 },
  metal_barrel: { gm: '12', dist: .01, dmg: .01, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'MetalBarrel.BulletImpact', e: .1, f: .8 },
  glass: { gm: 'Y', dist: .99, dmg: .5, effect: 'impact_glass', decal: 'Impact.Glass', sound: 'Glass.BulletImpact', e: .2, f: .5 },
  sand: { gm: 'N', dist: .3, dmg: .25, effect: 'impact_dirt', decal: 'Impact.Dirt', sound: 'Sand.BulletImpact', e: .25, f: .8 },
  dirt: { gm: 'D', dist: .6, dmg: .3, effect: 'impact_dirt', decal: 'Impact.Dirt', sound: 'Dirt.BulletImpact', e: .01, f: .8 },
  grass: { gm: 'J', dist: .6, dmg: .3, effect: 'impact_grass', decal: 'Impact.Dirt', sound: 'grass.BulletImpact', e: .25, f: .8 },
  cardboard: { gm: 'U', dist: .95, dmg: .99, effect: 'impact_dirt', decal: 'Impact.Dirt', sound: 'Cardboard.BulletImpact', e: .25, f: .8 },
  Plastic_Box: { gm: 'L', dist: .75, dmg: .5, effect: 'impact_plastic', decal: 'Impact.Plastic', sound: 'Plastic_Box.BulletImpact', e: .01, f: .8 },
  carpet: { gm: '7', dist: .75, dmg: .3, effect: 'impact_carpet', decal: 'Impact.Upholstery', sound: 'Carpet.BulletImpact', e: .01, f: .8 },
  metalrailing: { gm: 'M', dist: .4, dmg: .3, effect: 'impact_metal', decal: 'Impact.Metal', sound: 'SolidMetal.BulletImpact', e: .25, f: .8 },   // (v53 MAP fix: Nuke's railings — hash 2838185980)
  plastic: { gm: 'L', dist: .75, dmg: .5, effect: 'impact_plastic', decal: 'Impact.Plastic', sound: 'Plastic_Box.ImpactHard', e: .25, f: .8 },
  rubber: { gm: '4', dist: .85, dmg: .5, effect: 'impact_rubber', decal: 'Impact.Rubber', sound: 'Rubber.BulletImpact', e: .2, f: .8 },
  rubbertire: { gm: '4', dist: .85, dmg: .5, effect: 'impact_rubber', decal: 'Impact.Rubber', sound: 'Rubber_Tire.BulletImpact', e: .25, f: 1 },
  computer: { gm: 'P', dist: .4, dmg: .45, effect: 'impact_computer', decal: 'Impact.Computer', sound: 'Computer.BulletImpact', e: .25, f: .8 },
  paper: { gm: 'U', dist: .95, dmg: .99, effect: 'impact_dirt', decal: 'Impact.Dirt', sound: 'Cardboard.BulletImpact', e: .25, f: .8 },
  blockbullets: { gm: 'X', dist: .01, dmg: .001, effect: 'impact_concrete', decal: 'Impact.Concrete', sound: 'Default.BulletImpact', e: .25, f: .8 },
};
// Lower-case lookup (the importer's names and the files' names differ in case: Wood_Crate / wood_crate).
const LOWER = {}; for (const k of Object.keys(CS2_SURFACES)) LOWER[k.toLowerCase()] = k;

// The game's material classes → the CS2 surface property each stands for.
//  CS2 maps' bullet classes (the importer's PENS, from CS2's physics surface names): concrete → concrete, wood → Wood,
//  crate (wood_crate, cardboard, plastic…) → Wood_Crate, metal → metal, plaster (plaster, tile, pottery, drywall) →
//  plaster, brick → brick, sand (sand, dirt, gravel, grass) → sand, stone (rock, boulder) → rock, glass → glass.
//  The built-in maps' solids: adobe (Dust's mud walls) → stucco, roof (tiled roofs) → tile, the shipping containers
//  (metal-red / -blue / -green) → metal, door (a wooden door) → Wood_Panel. clip (a window CS2 keeps players out of)
//  is never in the bullets' boxes.
export const MAT_SURFACE = { concrete: 'concrete', wood: 'Wood', crate: 'Wood_Crate', metal: 'metal', plaster: 'plaster', brick: 'brick', sand: 'sand', stone: 'rock', glass: 'glass',
  adobe: 'stucco', roof: 'tile', 'metal-red': 'metal', 'metal-blue': 'metal', 'metal-green': 'metal', door: 'Wood_Panel', grass: 'grass', dirt: 'dirt', tile: 'tile' };

// Doors and breakables of the converted CS2 maps: each model's own surface property — its physics' m_surfacePropertyHashes
// (Source2Viewer-CLI -b PHYS on the user's install) matched to the m_nameHash values in surfaceproperties.vsurf:
//   417707814 metal · 3076510970 Wood · 2327582287 metal_ventslat · 670127480 Wood_Furniture · 2870565398
//   metal_sheetmetal · 1432157305 glass.
export const MODEL_SURFACE = {
  metal_door_001_br: 'metal',                 // Nuke's doors (models/props/de_nuke/hr_nuke/metal_door_001)
  metal_door_112: 'metal',                    // Overpass (models/props_downtown)
  ch2_door_001: 'metal',                      // Cache (models/de_cache_s2/doors)
  break_wooden_door_01: 'Wood',               // Inferno (models/breakable_props)
  nuke_vent_bombsite_breakable_c: 'metal',    // Nuke's A vent grille
  nuke_vent_slats: 'metal_ventslat',          // Nuke's vent slats
  shutter_window_l_breakable: 'Wood_Furniture', // Mirage's shutters
  wall_hole_b_cover_sheetmetal: 'metal_sheetmetal', wall_hole_cover_sheetmetal: 'metal_sheetmetal',   // Mirage's sheet-metal hole covers
  apartment_window01: 'glass', door_glass01: 'glass' };
// Surface properties by their vsurf m_nameHash, for the physics groups Source2Viewer-CLI could not name
// (physics_group_vrf_unknown_key_<hash>: tools/maps/import-cs2-map.mjs) — read from surfaceproperties.vsurf in the
// user's install (m_nameHash → surfacePropertyName; tests/gd-surface-props.mjs checks them when it is here).
export const SURFACE_HASH = { 2838185980: 'metalrailing', 417707814: 'metal', 3076510970: 'Wood', 2327582287: 'metal_ventslat', 670127480: 'Wood_Furniture', 2870565398: 'metal_sheetmetal', 1432157305: 'glass' };
// A model path → its surface property (MODEL_SURFACE, else by its name: a model whose file says metal / glass / wood).
export function modelSurface(path) {
  const base = String(path || '').split('/').pop().replace(/\.vmdl(_c)?$/, ''); if (!base) return null;
  if (MODEL_SURFACE[base]) return MODEL_SURFACE[base];
  return /glass|window/.test(base) ? 'glass' : /metal|steel|vent|grate/.test(base) ? 'metal' : /wood|crate|shutter|plank/.test(base) ? 'Wood' : null;
}

// A material (a game class or a CS2 surface name) → its CS2 surface property name / record.
export const surfaceName = mat => { if (!mat) return 'default'; const m = MAT_SURFACE[mat]; if (m) return m; return LOWER[String(mat).toLowerCase()] || 'default'; };
export const surfaceOf = mat => CS2_SURFACES[surfaceName(mat)];

// ── the wallbang ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const PEN = { count: 4, maxThick: 90, range: 3000, loss: .16, lossSoft: .05 };   // (CS:GO cs_player_shared.cpp: nPenetrationCount 4, MAX_PENETRATION_DISTANCE 90, flPenetrationDistance 3000, flDamLostPercent .16 / .05)
// The modifier for a solid entered as `a` and left as `b` (one solid: the same twice) — and whether its loss is the soft 5 %.
let SOFT = false;
export function penMod(a, b = a) {
  const A = surfaceOf(a), B = surfaceOf(b); SOFT = false;
  if (A.gm === 'Y' || A.gm === 'G') { SOFT = true; return 3; }
  if (A.gm === B.gm) { if (A.gm === 'W' || A.gm === 'U') return 3; if (A.gm === 'L') return 2; }
  return (A.dist + B.dist) / 2;
}
export const softLoss = () => SOFT;   // (the last penMod's: a glass or grate entry)
// The damage a bullet loses crossing `thickHU` Hammer units of `mat` (entering and leaving the same solid), arriving with
// `dmg` from a gun of penetration `pen`. Infinity: it cannot cross (it stops on the solid's face).
export function penLoss(dmg, pen, mat, thickHU, exitMat = mat) {
  if (!(pen > 0) || !(thickHU <= PEN.maxThick)) return Infinity;
  if (surfaceOf(mat).dist < .1) return Infinity;   // (v53 MAP fix: CS:GO's FireBullet stops on the ENTRY surface's own modifier < .1 — a metal barrel — before the two are averaged)
  const mod = penMod(mat, exitMat); if (mod < .1) return Infinity;
  const pm = 1 / mod, lost = dmg * (SOFT ? PEN.lossSoft : PEN.loss) + (3 / pen * 1.25) * (pm * 3) + pm * thickHU * thickHU / 24;
  return dmg - lost < 1 ? Infinity : lost;
}
// A whole wallbang: `dmg` through solids [[mat, thickHU], …] (nearest first; `at`: the travel in HU where each starts,
// for the 3000-unit rule) → the damage left (0: stopped). Pure: the tests' table (tests/gd-surface-props.mjs).
export function penThrough(dmg, pen, solids, at = null) {
  let d = dmg; for (let i = 0; i < solids.length; i++) { if (i >= PEN.count || (at && at[i] > PEN.range)) return 0; const l = penLoss(d, pen, solids[i][0], solids[i][1], solids[i][2] ?? solids[i][0]); if (l === Infinity) return 0; d -= l; }
  return d;
}
