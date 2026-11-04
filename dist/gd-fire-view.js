// Global Defensive fire on screen (v53 FIRE, SPEC ADDENDUM 1; rebuilt by v53 FIRELOOK, SPEC ADDENDUM 14): every molotov's
// and incendiary's inferno — the bottle-break fireball, the flames, the embers and glow on the floor, the dark plume, the
// pooled flickering light, the extinguish swirl, the scorch left after, and the burning bottle / can in flight — in ONE
// instanced draw.
//
// WHY v53 FIRE LOOKED LIKE A LOW FLAT SMEAR (FIRELOOK, found against the install's files): it drew only molotov_fire01's
// two children (flame01a / flame03a: ~20 sprites at the fire's middle) and a big flat fire_onsurface patch per flame. CS2's
// molotov_groundfire draws far more: molotov_groundfire_filltest's main_center (fire_small_sim_a) and main_fancy
// (fire_small_sim_b) — hundreds of camera-facing flame sprites rising off filler points all over the burning ground —
// and molotov_groundfire_outlineset's outline (C_OP_RenderTrails: tongues licking up from the fire's edge, up to 80 HU).
// The old atlas also kept 4 of each flame sequence's 32 frames (frames 0, 8, 16, 24: the flame mostly tiny, never its
// full body), stood flame01a's sprites on the floor with their (small, low) first frames, and used 2–6 cd for a light
// that never reached CS2's baked floors (then MeshBasicMaterial; LOOK's baked light term now carries it, see THE LIGHT).
//
// THE SYSTEMS (CS2's files: particles/inferno_fx/*.vpcf in the user's install, decompiled with Source2Viewer-CLI; every
// number is in SYS below with its file — tests/gd-fire-look.mjs reads each one back from the vpcf):
//  MOLOTOV — molotov_groundfire (children climbingset, filltest, outlineset, molotov_fire01) + molotov_groundfire_00high's
//  smoking children (child01, child02), embers and base glow. NOT CS2's ACTIVE TREE: molotov_groundfire references no
//  smoke, ember or glow system, and molotov_groundfire_00high (m_nMaxParticles 24) has no emitter, initializer or
//  operator — its children are made from its particles (C_INIT_CreateFromParentParticles), so in the files CS2 emits none
//  of them. They are drawn because the spec asks for the plume, the embers and the glow (ADDENDUM 14), with those
//  children's own numbers; where they stand is ours (PLUME_Z). (Fades: C_OP_FadeIn / C_OP_FadeOut times are shares of the
//  life — m_bProportional's default is true: the files only ever write it as false.)
//   · center  molotov_groundfire_main_center: fire_small_sim_a, ADD, overbright 4, desat 0.1, CS2's gradient (texture
//             blend 0.5), SCREEN_ALIGNED (no m_nOrientationType), life 1–2 s, radius from the filler point (10–30 HU:
//             fire_filler.vsnap's scratch_float — the game fills the snapshot; the preview file is all the install has)
//             × 1.1→0.5 from 25→250 HU off the middle × GlobalScale 0.75, grown 0.6→1.2 (ease), clamped 10–55 HU, alpha
//             0.39–0.59 × 0.59–0.8 (field 16), fading in over 0.1–0.15 / out over the last 0.5 of its life, rising 75–100 HU/s (VelocityFromNormal −75…−100: our
//             reading — against the snapshot point's normal, which the game sets; the preview file's are flat) capped at
//             40 HU/s (C_OP_MaxVelocity), +35 HU/s², drag 0.075, pulled to the middle (AttractToControlPoint 30), rotation
//             −60…90°, colour white…(239,216,135), one flipbook pass per life (field 38 = age × 0.9–1.1).
//   · fancy   molotov_groundfire_main_fancy: fire_small_sim_b, ADD, overbright 2, life 1–1.1 s, radius (filler) × 1.2→0.5
//             (0→300 HU) × 1.2→0.5 (25→200 HU), grown 0.5→1 (bias 0.75), clamped 20–65 HU, rising 75–150 HU/s (max 50), +75 HU/s²,
//             colour white…(117,118,112) going black from 0.85 of its life, fading out from 0.85 (FadeAndKill: its fade-in from
//             its start alpha, 1 by default — none).
//   · outline molotov_groundfire_outline: C_OP_RenderTrails of fire_small_sim_b_desat through its own gradient (blue
//             (21,21,199) and purple (108,10,128) in the dim parts, CS2's flame base), overbright 3, alpha 1 × 2, radius
//             20–30 grown 0.5→1, at most 80 HU long and radius ≤ 0.5 × length, life 0.5–1.5 s, 2 a second per edge point,
//             colour → (255,140,0) from 0.6, fading in over 0.05–0.1 and out over the last 0.8–0.9 of its life; rotation ±25°, drag 0.01. (Its tail comes from scratch field 17 — the edge
//             point — so each tongue stands from the fire's edge; its lean into the fire (0.35) and its length growing
//             with its speed, capped at 50 HU/s, are our reading of the trail. Its drawn renderer sets no blend mode but
//             m_flAddSelfAmount 1: drawn added.) Its texture, fire_small_sim_b_desat, is fire_small_sim_b's picture
//             desaturated: sim_b's cells are drawn through the outline's gradient (their red channel its coordinate).
//   · surface molotov_groundfire_snapshot_child_base: fire_onsurface flat on the floor (ALIGN_TO_PARTICLE_NORMAL), ADD,
//             overbright 2, desat 0.15, radius (filler) clamped 25–150 × 0.85, colour white…(85,80,80), its alpha curve
//             0→0.873 at 0.075→0.913 at 0.84→0, faded out over the fire's last 2 s (age 5→7 of CP3's 7), ~1.3 frames/s.
//   · f01     molotov_child_flame01a: fire_small_sim_b, ADD, overbright 6, desat 0.15, at the fire's middle within a disc
//             growing 8→50 HU (fire age 3→7 s), 16 HU off the floor + 0.1 × radius, radius 28–45 shrinking 1→0.35 with the
//             fire's age (field 27), × 1.5→0.75 over its life, alpha 0.47–0.59 (× 2 at detail levels 0–1), life 0.65–1.5 s,
//             rising +150 HU/s² from 15–20 HU/s, rotation ±24°, colour (244,237,208)…(235,172,95), 10→5 a second, fading out
//             over the last 0.25 of its life (C_OP_FadeOut's defaults).
//   · f03     molotov_child_flame03a (= incendiary_child_flame03a): fire_gas_batch_a_v2, alpha blended (its drawn renderer
//             sets no blend; its ADD one is bloom only), overbright 3, colour scale (255,238,199), radius 24–55 × 0.8→1.25,
//             alpha 0.78–0.98, life 0.75–1.5 s, disc 5→50 HU (age 2→8 s), +150 HU/s², 30 fps, fading out from half its life
//             (C_OP_FadeAndKill's defaults).
//   · ember   molotov_groundfire_child_embers: yellowflare, ADD, radius 2–8 HU, life 1.5–2 s, alpha 0.25–1, colour
//             (244,155,0)…(157,58,4), +35 HU/s² (max 150), a random push ±250 HU/s² across (ours: a wander), 32 a second.
//   · glow    molotov_groundfire_child_base_glow: fire_burning_character flat on the floor, overbright 2.15, radius 30–50,
//             alpha 0.06–0.14, colour (249,249,243)…(245,204,10), ±50 HU round each flame, 60 a second for 4 s. (Its
//             DistanceToCPInit — radius, alpha 0→1 and life 0.1→1.5 from 50→300 HU off CP0 — is not applied: _00high's CP0
//             has no place in the files.)
//   · smoke1  molotov_smoking_ground_child01: the thick dark column — colour (36,36,36)…(8,8,8), alpha 0.35–0.78 × 1.25,
//             radius 25–35 grown 0.5→2, life 2–3.5 s, ±45 HU round its parent and 10–30 HU under it, rising +40 HU/s² (drag
//             0.05), fading in over the first 0.25 and out from half its life (FadeAndKill), 10 a second from 1.0 s. Its
//             parent: one column over the fire's middle at PLUME_Z (ours — see above), so it climbs from about 1 m to 5 m.
//             (Its renderer's materials/particles/smoke/smoke.vtex is not in the install's file list; its second texture,
//             vistasmokev1_emods, is drawn.)
//   · smoke2  molotov_smoking_ground_child02: smokeloop_i_0, colour (36,36,36)…(8,8,8), alpha 0.39–0.78, radius 40 HU (its
//             m_flConstantRadius) × 0.75→1.25 over 6 lives, life 2–5 s, 15–20 HU over its parent (PLUME_Z), +20 HU/s², 1 a
//             second per parent from 0.35 s, 0.25 frames/s, fading in over 0.2 and out from half its life.
//  INCENDIARY — incendiary_groundfire (climbingset, filltest, outlineset, incendiary_fire01); its files have no smoking,
//  ember or base-glow child, so it has no plume (as in CS2) — the differences are only the files':
//   · center  incendiary_groundfire_main_center: fire_small_sim_a_v02, ADD, overbright 3, desat 0.25, radius scale 1.1,
//             life 0.75–1.5 s × 0.75→1 (25→250 HU off the middle), radius × 1.5→0.85 from 60→150 HU off the middle (its own
//             DistanceToCPInit: bigger in the middle than the molotov's), +15 HU/s², grown 0.6→1, alpha 0.39–0.59 × 0.59–0.8,
//             going black from 0.75 to 0.95 of its life, fading in over 0.1–0.15 / out over its last 0.25 (C_OP_FadeOut's
//             defaults), its own gradient (teal (32,203,183) at 0.40, (222,199,109) at 0.75, (255,255,189) at 1: paler, whiter).
//   · outline incendiary_groundfire_outline: fire_small_sim_a_v02 (MIX_RGBA_RGBALPHA), HALF_BLEND_ADD (its bloom
//             renderer's; the drawn one sets none, AddSelf 0.25), desat 0.15, max 60 HU/s, its gradient ((0,255,255) at
//             0.40, (222,199,109) at 0.75, (255,255,189) at 1).
//   · f01     incendiary_child_flame01a: fire_small_sim_a_v02 (RGBALPHA), HALF_BLEND_ADD, overbright 3, desat 0.3, the
//             breakup smoke_wisp_breakup_01_tile_inv subtracted at 0.1, life 0.75–1.35 s, × 0.9→1.25, its gradient
//             (orange late: 0.669; back to (9,0,0) at 1).
//   · sparks  incendiary_groundfire_filler_replicator: sparks_burst, ADD, overbright 12, radius (filler) × 0.1 (InitFloat,
//             SCALE_INITIAL) × 2→1 from 15→100 HU off the middle (DistanceToCPInit) × radius scale 8 — 8–48 HU — × 0.5→1.2
//             (bias 0.6), going black from 0.8 of its life, fading over its last 0.1, life 1–2 s (filler radius 20→30),
//             colour (240,170,124)…(169,163,147), desat 0.3 (its colour
//             gradient over 0→8 s — warm white (251,245,236) → (221,133,122) — not drawn: its flat colour only).
//   · surface and f03: as the molotov's (incendiary_groundfire_snapshot_child_base / incendiary_child_flame03a: the same).
//  THE BURST (molotov_explosion / incendiary_explosion, once where it broke): flash (molotov_explosion_child_flash:
//  explosion_fireball_01, 4, radius 20–40 × 5, life 0.75–1.25 s, +150 HU/s²), fireball1 (fire_gas_batch_a_v2, 5 + 10/s for
//  0.15 s, radius 3–5 × 20, 0.75–1.5 s, flung 200–500 HU/s), fireball2 (fire_gas_batch_b_top_v2, 6, radius 2–4 × 21),
//  sprays (molotov_explosion_child_sprays: burning drops falling at −550 HU/s², (249,176,134) — a C_OP_RenderTrails of
//  blood_spray_multi in the file; drawn here as camera-facing sparks_burst sprites, the atlas has no room for it; the
//  incendiary's incen_explosion_child_sprays: fire_gas, 10, at −450, overbright 2), shards (explosion_molotov_ground_debris: fleks thrown 300–500 HU/s,
//  pulled down 1000–1500 HU/s²; the molotov's glass: particles/impact_fx/molotov_broken_glass's 5–10 pieces) and the splash
//  (explosion_molotov_ground_splash07a: spray1 / the incendiary's sparks_burst, 4 + 4 at 0.1 s, radius 48–56 × 0.5→1, fading in
//  over 0.1 and out over the last 0.5–0.75 of its life), and the molotov's whoosh smoke (molotov_explosion_child_fireball4:
//  wispy_steam_burst, 12 of its 20 — m_nMaxParticles —, radius 1–3 × 2→25 × 1.5, +200 HU/s², bright (250,247,215) going
//  (28,28,30)). The sprays: radius 8 (the incendiary's × m_flRadiusScale 3; the molotov's m_flRadiusScale 2 is its
//  WorldTraceConstraint's, not its renderer's) × its life remap (0.9 at 1 s).
//  THE LOOK'S OWN READINGS (the files don't say; by eye against the vpcf): OB_K, CS2's overbright × 0.36 for the
//  added parts (no HDR or bloom pass here), the alpha-blended ones (flame03a's gas, the flash, shards) at their whole
//  overbright; m_fDrag read as a damping rate a second (with it the plume climbs several metres in its 2–5 s); a 1D
//  colour lookup's coordinate read as the texel's density (its alpha: thin edges on the gradients' dark-red and orange
//  stops, thick cores on their yellow-white ones — the texel's red, read before, sat at 0.8–1 on 85 % of CS2's flame
//  texels, so the gradients' orange-red never showed).
//  THE LIGHT — molotov_groundfire_lighting / incendiary_groundfire_lighting (identical): C_OP_RenderStandardLight, colour
//  (242,211,147), m_flRadiusMultiplier 2 on its particle's radius: the core point's 150 HU (fire_core.vsnap) × a curve over
//  its life (C_OP_SetFloat: 0→1 by 0.110708, 1 until 0.918027, →0) × C_OP_SetFloat's PARTICLE_NOISE 0.6–1.0 (scale
//  0.72064, offset rate [0,50,0]: ~36 a second, our reading) — 180–300 HU, flickering; its alpha that radius remapped
//  30→80 HU to 0→1 (its m_flRadiusMultiplier field's own noise numbers are inactive: PF_TYPE_LITERAL 2). One pooled PointLight per fire slot (made at load, never visible — graphics.js's 4-light pool carries it: the lit
//  shaders' light count never changes), on High / Medium. Its brightness (candela) is ours: CS2's HDR light units aren't
//  three.js's. It lights the baked CS2 floors and walls through LOOK's fixed baked-shader light term (cs2-render.js
//  gdPoints, gd-exposure.js BAKED_LIGHT_N = 6: graphics.js copies its pool's lights into it each frame). On Low / Very
//  Low (no point light), or in a build without that term, each flame lays an emissive fake instead — a flat glow in the
//  light's colour and reach (lglow, ours).
//  NOT DRAWN (not CS2's or not possible here): molotov_groundfire_climbingset (fire up walls: the host's inferno has no
//  wall flames); the bloom-only renderers (m_bOnlyRenderInEffectsBloomPass: no effects-bloom pass here — OB_K stands in);
//  depth feathering; molotov_groundfire_projected (molotov_groundfire_filltest's child — the incendiary's filltest has none: C_OP_RenderProjected of
//  scortch_projected_directional: a scorch projected while the fire burns, its alpha 0.11→0.87 (0.075)→1 (0.51)→0 over the
//  system's first 10 s — ours instead: a flat scorch from 1.5 s before each flame dies, kept SCORCH_S, as the spec says the
//  scorch comes only after); _snapshot_water_silt; heat shimmer — CS2's only refracting fire system, molotov_child_flame04c (warp1_normal, refract −0.6),
//  is referenced by none of the trees above, so CS2's inferno has none either (spec item openB-21: as CS2).
//
// THE DRAW. One InstancedBufferGeometry quad, one ShaderMaterial (premultiplied alpha: an additive part writes alpha 0, a
// half-blended one half its coverage, smoke and scorch their coverage — one blend for all), every part an instance:
// [scorch ring | in flight | bursts | per fire slot: 16 flames × FLAME_ROLES + the fire's own parts]. Each instance is a
// particle slot that is reborn every life in the vertex shader (new random numbers per life from its seed), so the CPU
// writes a fire's slots once when it starts; per frame only uTime, the bottles in flight and the pooled lights change. The
// systems' numbers live in a float texture (uK: KW texels per kind), read with texelFetch: one program for every part,
// warmed behind the loading card (userData.gd + warm); CS2's atlas (tools/import-cs2-fire.mjs) swaps in as a texture.
// Only the slots up to the last fire in use are drawn (instanceCount). No allocation per frame.
// SLOTS. MAX_FIRES fire slots (10 players carry one fire grenade each); a fire is drawn in a free slot — when every slot
// holds a fire the host still has, a new one waits (never steals one: v53 review R3).
// PRESETS (DENSITY): High / Ultra draw CS2's counts (per flame: 12 center, 6 fancy, 8 outline, 6 surface, 12 embers, 4
// glow; per fire 12 f01, 12 f03, 28 + 16 smoke — CS2's emission rate × life, capped by each file's m_nMaxParticles); Medium
// about two thirds; Low a third (no embers, glow or f03, the plume cheaper); Very Low less still.
import * as THREE from './three.module.js';
import { INFERNO, FIRE, infernoFlames, flameOut, isFire, FL_X, FL_Z, FL_Y, FL_T, FL_END } from './arena-nades.js';
import { gdPresetNow } from './gd-preset.js';
import { BAKED_LIGHT_N } from './gd-exposure.js';   // (v53 FIRELOOK: LOOK's baked-shader light term — cs2-render.js gdPoints lights the map with graphics.js's pool, our fire lights among them)

export const HU = 2.54 / 16.5;
export const MAX_FIRES = 10, MAX_FLAMES = INFERNO.max, SCORCH_FIRES = 12, MAX_FLY = 8, FLY_PARTS = 6, MAX_BURSTS = 8;
export const PLUME_Z = 60;   // (HU: the plume's parent height — molotov_smoking_ground_child01/02 are made from their parent's particles (C_INIT_CreateFromParentParticles) and offset −30…−10 / +15…+20 HU from them; their parent, molotov_groundfire_00high, emits none in the files: ours, the flames' middle height)
export const SCORCH_S = 45;   // (s a scorch stays: ours — CS2's molotovscorch is a world decal kept for the round)
export const OB_K = .36;      // (ours: CS2's overbright × this, then a per-channel exposure curve — its HDR, tone map and
// bloom pass carry the rest; by eye against the vpcf numbers. Bright parts go yellow-white, as CS2's cores do.)
// The parts (aA.w). 0…NG−1 are the table's particle kinds; the rest the special ones.
export const K = { center: 0, fancy: 1, outline: 2, surface: 3, f01: 4, f03: 5, ember: 6, glow: 7, smoke1: 8, smoke2: 9, iCenter: 10, iOutline: 11, iF01: 12, iSparks: 13, lglow: 14,
  flash: 15, fb1: 16, fb2: 17, spray: 18, shard: 19, splash: 20, iSpray: 21, iSplash: 22, fb4: 23,
  scorch: 24, exSmoke: 25, rag: 26, ragGlow: 27, trail: 28, spark: 29, smokeTrail: 30 };
export const NG = 24;
// Atlas (16 × 16 cells): [first cell, sequences, frames per sequence] — tools/import-cs2-fire.mjs writes CS2's pictures to
// the same cells (2048², 128 px a cell); our fallback is drawn at 64 px a cell. Flipbooks keep 16 of CS2's 32 (17) frames,
// blended between, so a flame plays its whole sheet once a life as CS2's manual frames do.
export const ATLAS = { grid: 16, simB: [0, 4, 16], simA: [64, 4, 16], incA: [128, 3, 16], surface: [176, 2, 8], gas: [192, 2, 8], plume: [208, 1, 8], smoke: [216, 1, 4],
  flash: [220, 1, 8], gasB: [228, 1, 4], ext: [232, 1, 4], sparks: [236, 1, 4], ember: [240, 1, 1], flare: [241, 1, 1], burn: [242, 1, 3], scorch: [245, 1, 1], breakup: [246, 1, 1], fleks: [247, 4, 1], splash: [251, 1, 4], steam: [255, 1, 1] };
// CS2's 1D colour lookup gradients (the drawn renderers' m_Gradient stops: position, colour).
export const GRAD = {
  molotov: [[0, 0, 0, 0], [.064599, 128, 10, 10], [.170543, 167, 55, 46], [.258398, 210, 92, 29], [.839793, 210, 146, 97], [.945736, 255, 235, 201], [.953488, 255, 241, 218], [1, 255, 255, 255]],   // (main_center, main_fancy, flame01a: their drawn renderers)
  outline: [[0, 0, 0, 0], [.03876, 0, 0, 0], [.395349, 21, 21, 199], [.496124, 108, 10, 128], [.635659, 167, 55, 46], [.702842, 210, 92, 29], [.803618, 210, 146, 97], [.927649, 255, 235, 201], [.950904, 255, 241, 218], [1, 255, 255, 255]],   // (molotov_groundfire_outline)
  incendiary: [[0, 0, 0, 0], [.330749, 128, 10, 10], [.509044, 167, 55, 46], [.669251, 210, 92, 29], [.839793, 210, 146, 97], [.945736, 255, 235, 201], [.953488, 255, 241, 218], [.97416, 255, 255, 255], [1, 9, 0, 0]],   // (incendiary_child_flame01a)
  incCenter: [[0, 0, 0, 0], [.400517, 32, 203, 183], [.751938, 222, 199, 109], [1, 255, 255, 189]],   // (incendiary_groundfire_main_center)
  incOutline: [[0, 0, 0, 0], [.400517, 0, 255, 255], [.751938, 222, 199, 109], [1, 255, 255, 189]],   // (incendiary_groundfire_outline)
  flash: [[0, 28, 27, 27], [.276486, 50, 39, 33], [.537468, 81, 74, 63], [.581395, 116, 42, 42], [.684755, 238, 119, 52], [.775194, 229, 105, 38], [.834625, 249, 135, 69], [.904393, 243, 185, 154], [1, 255, 255, 255]],   // (molotov_explosion_child_flash: smoky edges, an orange core)
  splash: [[0, 0, 0, 0], [.067183, 0, 0, 0], [.255814, 255, 0, 0], [.736434, 255, 140, 0], [1, 255, 255, 255]],   // (explosion_molotov_ground_splash07a)
};
const GRAD_ID = { none: 0, molotov: 1, outline: 2, incendiary: 3, incCenter: 4, incOutline: 5, flash: 6, splash: 7 };
const MODE = { SCREEN_ALIGNED: 0, ALIGN_TO_PARTICLE_NORMAL: 1, TRAIL: 2 }, BLEND = { ADD: 0, HALF_BLEND_ADD: 1, ALPHA: 2, PLUME: 3 };
// THE SYSTEMS, kind by kind — CS2's numbers (HU, seconds, 0–255 colours, degrees) and their file; `ours` marks what the
// files don't hold. r: initial radius; sc: radius scale over life (bias: C_OP_InterpolateRadius m_flBias, our exponent
// reading); clamp: C_OP_ClampScalar; dist: C_INIT_DistanceToCPInit radius scale [d0, k0, d1, k1] off the fire's middle;
// inward / up / hs: speeds; grav: m_Gravity z; vmax: C_OP_MaxVelocity; jit: where it is born round its point; fade: in /
// out (s, or a share of its life when < 0); frames: −1 the whole sheet over its life (manual frames, field 38), > 0 frames a
// second; endFade: the emitter's own fade at the fire's end (m_flOpStartFadeOutTime → End, s before the end).
export const SYS = {
  center: { src: 'molotov_groundfire_main_center', life: [1, 2], cyc: 1, fade: [-.125, -.5], r: [10, 30], rk: .75, sc: [.6, 1.2], bias: 1, clamp: [10, 55], alpha: [.392157, .588235], alpha2: [.588235, .8], grav: 35, vmax: 40, drag: .075, attract: 30, inward: [0, 0], up: [75, 100], hs: 0, jit: 26, z: [-5, 2], tex: 'simA', seqMax: 3, frames: -1, ob: 4, desat: .1, grad: 'molotov', texBlend: .5, col: [[255, 255, 255], [239, 216, 135]], rot: [-60, 90], mode: 'SCREEN_ALIGNED', blend: 'ADD', dist: [25, 1.1, 250, .5], lifeDist: [25, .75, 250, 1], endFade: 1, sfade: [.45, .575], max: 450 },
  fancy: { src: 'molotov_groundfire_main_fancy', life: [1, 1.1], cyc: 1, fade: [0, -.15], r: [10, 30], rk: 1, sc: [.5, 1], bias: .75, clamp: [20, 65], alpha: [1, 1], grav: 75, vmax: 50, drag: .05, attract: 30, inward: [0, 0], up: [75, 150], hs: 0, jit: 26, z: [-10, 0], propZ: .05, tex: 'simB', seqMax: 2, frames: -1, ob: 2, desat: .1, grad: 'molotov', texBlend: .5, col: [[255, 255, 255], [117, 118, 112]], endCol: [0, 0, 0, .85], rot: [-60, 90], mode: 'SCREEN_ALIGNED', blend: 'ADD', dist: [25, 1.2, 200, .5], dist2: [0, 1.2, 300, .5], lifeDist: [25, .75, 500, 1], endFade: 1, sfade: [.45, .575], max: 500 },
  outline: { src: 'molotov_groundfire_outline', life: [.5, 1.5], cyc: 1, fade: [-.075, -.85], r: [20, 30], sc: [.5, 1], bias: .85, clamp: [0, 999], alpha: [1, 1], aScale: 2, grav: 20, vmax: 50, drag: .01, inward: [75, 150], up: [0, 0], hs: 0, jit: 6, z: [5, 5], tex: 'simB', seqMax: 3, frames: -1, ob: 3, desat: 0, grad: 'outline', texBlend: 1, col: [[255, 255, 255], [255, 255, 255]], endCol: [255, 140, 0, .6], rot: [-25, 25], mode: 'TRAIL', blend: 'ADD', maxLen: 80, endFade: .45, sfade: [.45, .575], max: 400 },
  surface: { src: 'molotov_groundfire_snapshot_child_base', life: [1, 2], cyc: 1, fade: [-.075, -.16], r: [25, 30], rk: .85, sc: [1, 1], bias: 1, clamp: [25 * .85, 150 * .85], alpha: [1, 1], grav: 0, vmax: 0, inward: [0, 0], up: [0, 0], hs: 0, jit: 22, z: [3, 3], tex: 'surface', seqMax: 2, frames: 1.29, ob: 2, desat: .15, grad: 'none', texBlend: 0, col: [[255, 255, 255], [85, 80, 80]], rot: [45, 135], mode: 'ALIGN_TO_PARTICLE_NORMAL', blend: 'ADD', endFade: 2, sfade: [9, 9], max: 200 },
  f01: { src: 'molotov_child_flame01a', life: [.65, 1.5], cyc: 1, fade: [0, -.25], r: [28, 45], sc: [1.5, .75], bias: .8, clamp: [0, 999], alpha: [.470588, .588235], lowAlpha: 2, grav: 150, vmax: 0, drag: .2, inward: [0, 0], up: [15, 20], hs: 0, jit: 8, jitAge: [3, 7, 50], z: [16, 16], propZ: .1, shrink: 1, tex: 'simB', seqMax: 7, frames: -1, ob: 6, desat: .15, grad: 'molotov', texBlend: .5, col: [[244, 237, 208], [235, 172, 95]], rot: [-24, 24], mode: 'SCREEN_ALIGNED', blend: 'ADD', endFade: 1, sfade: [.45, .575], max: 20 },
  f03: { src: 'molotov_child_flame03a', life: [.75, 1.5], cyc: 1, fade: [0, -.5], r: [24, 55], sc: [.8, 1.25], bias: .75, clamp: [0, 999], alpha: [.784314, .980392], lowAlpha: 2, grav: 150, vmax: 0, drag: .2, inward: [0, 0], up: [0, 20], hs: 0, jit: 5, jitAge: [2, 8, 50], z: [16, 16], propZ: .1, shrink: 1, tex: 'gas', seqMax: 7, frames: -1, ob: 3, desat: .15, grad: 'none', texBlend: 0, col: [[244, 237, 208], [231, 215, 202]], colScale: [255, 238, 199], rot: [-45, 45], mode: 'SCREEN_ALIGNED', blend: 'ALPHA', endFade: 1, sfade: [.475, .575], max: 25 },
  ember: { src: 'molotov_groundfire_child_embers', life: [1.5, 2], cyc: 1, fade: [-.25, -.4], r: [2, 8], sc: [1, 1], bias: 1, clamp: [0, 999], alpha: [.25098, 1], grav: 35, vmax: 150, drag: .05, inward: [0, 0], up: [0, 0], hs: 90, jit: 20, z: [2, 60], tex: 'ember', seqMax: 63, frames: -1, ob: 1, desat: 0, grad: 'none', texBlend: 0, col: [[244, 155, 0], [157, 58, 4]], rot: [0, 360], mode: 'SCREEN_ALIGNED', blend: 'ADD', endFade: .45, sfade: [.45, .575], max: 200 },
  glow: { src: 'molotov_groundfire_child_base_glow', life: [.4, 1.5], cyc: 1, fade: [-.25, -.5], r: [30, 50], sc: [1, 1], bias: 1, clamp: [0, 999], alpha: [.058824, .137255], grav: 0, vmax: 0, inward: [0, 0], up: [0, 0], hs: 0, jit: 50, z: [1, 1], tex: 'burn', seqMax: 4, frames: 12, ob: 2.15, desat: 0, grad: 'none', texBlend: 0, col: [[249, 249, 243], [245, 204, 10]], rot: [0, 360], mode: 'ALIGN_TO_PARTICLE_NORMAL', blend: 'ADD', endFade: .45, sfade: [.425, .525], emitFor: 4, max: 400 },
  smoke1: { src: 'molotov_smoking_ground_child01', life: [2, 3.5], cyc: 1, fade: [-.25, -.5], r: [25, 35], sc: [.5, 2], bias: 1, clamp: [0, 999], alpha: [.352941, .784314], aScale: 1.25, grav: 40, vmax: 0, drag: .05, inward: [0, 0], up: [1, 3], hs: 1, jit: 45, z: [-30, -10], tex: 'smoke', seqMax: 1, frames: 1.2, ob: 1, desat: 0, grad: 'none', texBlend: 0, col: [[36, 36, 36], [8, 8, 8]], rot: [0, 360], spin: 15, mode: 'SCREEN_ALIGNED', blend: 'PLUME', startAt: 1, endFade: .45, sfade: [.2, .55], max: 70 },
  smoke2: { src: 'molotov_smoking_ground_child02', life: [2, 5], cyc: 1, fade: [-.2, -.5], r: [40, 40], sc: [.75, .833], bias: 1, clamp: [0, 999], alpha: [.392157, .784314], grav: 20, vmax: 0, drag: .01, inward: [0, 0], up: [1, 2], hs: 1.5, jit: 20, z: [15, 20], tex: 'plume', seqMax: 1, frames: .25, ob: 1, desat: 0, grad: 'none', texBlend: 0, col: [[36, 36, 36], [8, 8, 8]], rot: [-45, 60], mode: 'SCREEN_ALIGNED', blend: 'PLUME', startAt: .35, endFade: .45, sfade: [.4, .55], max: 16 },
  iCenter: { src: 'incendiary_groundfire_main_center', life: [.75, 1.5], cyc: 1, fade: [-.125, -.25], r: [10, 30], rk: .75 * 1.1, sc: [.6, 1], bias: 1, clamp: [10 * 1.1, 55 * 1.1], alpha: [.392157, .588235], alpha2: [.588235, .8], grav: 15, vmax: 50, drag: .05, attract: 30, inward: [0, 0], up: [75, 100], hs: 0, jit: 26, z: [-5, 2], tex: 'incA', seqMax: 5, frames: -1, ob: 3, desat: .25, grad: 'incCenter', texBlend: .5, col: [[255, 255, 255], [255, 255, 255]], rot: [-60, 90], mode: 'SCREEN_ALIGNED', blend: 'ADD', dist: [60, 1.5, 150, .85], lifeDist: [25, .75, 250, 1], endCol: [0, 0, 0, .75], colEnd: .95, endFade: 1, sfade: [.45, .575], max: 450 },
  iOutline: { src: 'incendiary_groundfire_outline', life: [.5, 1.5], cyc: 1, fade: [-.075, -.85], r: [20, 30], sc: [.5, 1], bias: .85, clamp: [0, 999], alpha: [1, 1], aScale: 2, grav: 20, vmax: 60, drag: .01, inward: [75, 150], up: [0, 0], hs: 0, jit: 6, z: [5, 5], tex: 'incA', seqMax: 3, frames: -1, ob: 1, desat: .15, grad: 'incOutline', texBlend: 1, col: [[255, 255, 255], [255, 255, 255]], rot: [-25, 25], mode: 'TRAIL', blend: 'HALF_BLEND_ADD', maxLen: 80, endFade: .45, sfade: [.3, .4], max: 400 },
  iF01: { src: 'incendiary_child_flame01a', life: [.75, 1.35], cyc: 1, fade: [0, -.25], r: [28, 45], sc: [.9, 1.25], bias: .8, clamp: [0, 999], alpha: [.470588, .588235], lowAlpha: 2, grav: 150, vmax: 0, drag: .2, inward: [0, 0], up: [15, 20], hs: 0, jit: 8, jitAge: [3, 7, 50], z: [16, 16], propZ: .1, shrink: 1, tex: 'incA', seqMax: 7, frames: -1, ob: 3, desat: .3, grad: 'incendiary', texBlend: .5, breakup: .1, col: [[244, 237, 208], [235, 172, 95]], rot: [-24, 24], mode: 'SCREEN_ALIGNED', blend: 'HALF_BLEND_ADD', endFade: 1, sfade: [.45, .575], max: 20 },
  iSparks: { src: 'incendiary_groundfire_filler_replicator', life: [1, 2], cyc: 1, fade: [0, -.1], r: [10, 30], rk: .1 * 8, sc: [.5, 1.2], bias: .6, clamp: [0, 999], alpha: [1, 1], grav: 0, vmax: 0, inward: [0, 0], up: [0, 0], hs: 0, jit: 26, z: [4, 4], tex: 'sparks', seqMax: 3, frames: -1, ob: 12, desat: .3, grad: 'none', texBlend: 0, col: [[240, 170, 124], [169, 163, 147]], endCol: [0, 0, 0, .8], dist: [15, 2, 100, 1], rot: [0, 0], mode: 'SCREEN_ALIGNED', blend: 'ADD', endFade: 1, sfade: [.45, .575], max: 450 },
  lglow: { src: 'ours (the light\'s stand-in on floors no point light reaches: molotov_groundfire_lighting\'s colour and 300 HU reach)', life: [60, 60], cyc: 0, fade: [.3, 0], r: [75, 75], sc: [1, 1], bias: 1, clamp: [0, 999], alpha: [.55, .55], grav: 0, vmax: 0, inward: [0, 0], up: [0, 0], hs: 0, jit: 0, z: [1.5, 1.5], tex: 'flare', seqMax: 0, frames: -1, ob: 1, desat: 0, grad: 'none', texBlend: 0, col: [[242, 211, 147], [242, 211, 147]], rot: [0, 0], mode: 'ALIGN_TO_PARTICLE_NORMAL', blend: 'ADD', endFade: .45, sfade: [9, 9], flicker: 1, max: 16 },
  flash: { src: 'molotov_explosion_child_flash', life: [.75, 1.25], cyc: 0, fade: [0, -.175], r: [20, 40], sc: [1, 5], bias: .65, clamp: [0, 999], alpha: [1, 1], grav: 150, vmax: 0, inward: [0, 0], up: [-50, 150], hs: 150, jit: .5, z: [2, 4], tex: 'flash', seqMax: 0, frames: -.727, ob: 1, desat: 0, grad: 'flash', texBlend: 1, col: [[243, 229, 195], [218, 146, 69]], rot: [-45, 45], mode: 'SCREEN_ALIGNED', blend: 'ALPHA', sfade: [.25, .75], max: 4 },
  fb1: { src: 'molotov_explosion_child_fireball1', life: [.75, 1.5], cyc: 0, fade: [0, .15], r: [3, 5], sc: [1, 20], bias: .8, clamp: [0, 999], alpha: [1, 1], grav: -300, vmax: 0, inward: [0, 0], up: [100, 450], hs: 350, jit: 10, z: [2, 5], tex: 'gas', seqMax: 7, frames: -.972, ob: 2, desat: 0, grad: 'none', texBlend: 0, col: [[244, 237, 208], [255, 255, 255]], endCol: [0, 0, 0, .85], rot: [-45, 45], mode: 'SCREEN_ALIGNED', blend: 'ADD', sfade: [.45, .575], max: 12 },
  fb2: { src: 'molotov_explosion_child_fireball2', life: [.5, 1.5], cyc: 0, fade: [0, .35], r: [2, 4], sc: [1, 21], bias: .8, clamp: [0, 999], alpha: [1, 1], grav: 15, vmax: 0, inward: [0, 0], up: [0, 100], hs: 200, jit: .5, z: [2, 4], tex: 'gasB', seqMax: 7, frames: -1, ob: 2, desat: 0, grad: 'none', texBlend: 0, col: [[255, 255, 255], [255, 255, 255]], rot: [-45, 45], mode: 'SCREEN_ALIGNED', blend: 'ADD', sfade: [.45, .575], max: 12 },
  spray: { src: 'molotov_explosion_child_sprays', life: [1, 1], cyc: 0, fade: [0, -.5], r: [8, 8], rk: .9, sc: [1, 5], bias: 1, clamp: [0, 999], alpha: [1, 1], grav: -550, vmax: 0, inward: [0, 0], up: [100, 450], hs: 350, jit: 10, z: [2, 5], tex: 'sparks', seqMax: 3, frames: -1, ob: 2, desat: 0, grad: 'none', texBlend: 0, col: [[249, 176, 134], [249, 176, 134]], endCol: [0, 0, 0, .65], rot: [-45, 45], mode: 'SCREEN_ALIGNED', fileMode: 'TRAIL', texNote: 'blood_spray_multi', blend: 'ADD', sfade: [.45, .575], max: 45 },
  shard: { src: 'explosion_molotov_ground_debris + particles/impact_fx/molotov_broken_glass', life: [.5, 1], cyc: 0, fade: [0, -.2], r: [.5, 1], rk: 2, sc: [1, 0], bias: 1, clamp: [0, 999], alpha: [1, 1], grav: -1250, vmax: 0, inward: [0, 0], up: [150, 150], hs: 400, jit: 1, z: [2, 4], tex: 'fleks', seqMax: 3, frames: -1, ob: 1, desat: 0, grad: 'none', texBlend: 0, col: [[160, 160, 160], [96, 96, 96]], rot: [0, 360], spin: 1200, mode: 'SCREEN_ALIGNED', blend: 'ALPHA', bounce: .85, sfade: [9, 9], max: 50 },
  splash: { src: 'explosion_molotov_ground_splash07a', life: [.8, 1], cyc: 0, fade: [-.1, -.625], r: [48, 56], sc: [.5, 1], bias: 1, clamp: [0, 999], alpha: [.454902, .517647], grav: -400, vmax: 0, inward: [0, 0], up: [10, 50], hs: 115, jit: 2, z: [2, 4], tex: 'splash', seqMax: 2, frames: -1, ob: 3, desat: 0, grad: 'splash', texBlend: 1, col: [[153, 153, 103], [165, 165, 135]], rot: [0, 360], mode: 'SCREEN_ALIGNED', blend: 'ADD', sfade: [.675, .75], max: 45 },
  iSpray: { src: 'incen_explosion_child_sprays', life: [.75, 1.5], cyc: 0, fade: [0, -.5], r: [8, 8], rk: 3, sc: [1, 5], bias: 1, clamp: [0, 999], alpha: [1, 1], grav: -450, vmax: 0, inward: [0, 0], up: [0, 350], hs: 350, jit: 1, z: [2, 4], tex: 'gas', seqMax: 3, frames: -1, ob: 2, desat: 0, grad: 'none', texBlend: 0, col: [[163, 163, 163], [163, 163, 163]], endCol: [0, 0, 0, .65], rot: [-45, 45], mode: 'SCREEN_ALIGNED', blend: 'ADD', sfade: [.45, .575], max: 10 },
  iSplash: { src: 'explosion_incen_ground_splash07a', life: [.8, 1], cyc: 0, fade: [-.1, -.625], r: [48, 56], rk: 1.3, sc: [.5, 1.5], bias: 1, clamp: [0, 999], alpha: [.454902, .517647], grav: -400, vmax: 0, inward: [0, 0], up: [10, 50], hs: 115, jit: 2, z: [2, 4], tex: 'sparks', seqMax: 2, frames: -1, ob: 8, desat: .2, grad: 'none', texBlend: 0, col: [[153, 153, 103], [165, 165, 135]], rot: [0, 360], mode: 'SCREEN_ALIGNED', blend: 'ADD', sfade: [.675, .75], max: 45 },
  fb4: { src: 'molotov_explosion_child_fireball4', life: [1, 2], cyc: 0, fade: [0, -.5], r: [1, 3], rk: 1.5, sc: [2, 25], bias: .372, clamp: [0, 999], alpha: [1, 1], grav: 200, vmax: 0, drag: .1, inward: [0, 0], up: [-50, 150], hs: 200, jit: .5, z: [2, 4], tex: 'steam', seqMax: 3, frames: -1, ob: 1, desat: 0, grad: 'none', texBlend: 0, col: [[250, 247, 215], [205, 133, 63]], endCol: [28, 28, 30, .6], colEnd: .85, rot: [-210, -130], mode: 'SCREEN_ALIGNED', blend: 'ALPHA', sfade: [9, 9], max: 12 },   // (the burst's smoke: wispy_steam_burst, 20 at once (12 kept: m_nMaxParticles), radius 1–3 × 2→19.65 (0.49)→25 over its life (SetFloat SCALE_INITIAL; bias 0.372 our fit of that curve) × 1.5, flung by its local speeds (−50…250, ±100, −50…150 HU/s: hs/up ours), +200 HU/s², drag 0.1, (250,247,215)…(205,133,63) going (28,28,30) from 0.6 to 0.85; its renderer sets no blend (alpha), colour scale 0 and AddSelf 1 — drawn alpha-blended in its colour: our reading)
};
// Per-flame roles and the fire's own parts (slots), per preset. A role's kind is the molotov's or the incendiary's.
export const FLAME_ROLES = ['center', 'fancy', 'outline', 'surface', 'ember', 'glow', 'lglow', 'exSmoke'];
export const FIRE_ROLES = ['f01', 'f03', 'smoke1', 'smoke2'];
export const DENSITY = {
  High: { center: 12, fancy: 6, outline: 8, surface: 6, ember: 12, glow: 4, lglow: 1, exSmoke: 1, f01: 12, f03: 12, smoke1: 28, smoke2: 16 },
  Medium: { center: 8, fancy: 4, outline: 6, surface: 4, ember: 6, glow: 2, lglow: 1, exSmoke: 1, f01: 10, f03: 8, smoke1: 20, smoke2: 12 },
  Low: { center: 5, fancy: 2, outline: 4, surface: 3, ember: 0, glow: 0, lglow: 1, exSmoke: 1, f01: 8, f03: 0, smoke1: 12, smoke2: 6 },
  'Very Low': { center: 4, fancy: 1, outline: 3, surface: 2, ember: 0, glow: 0, lglow: 1, exSmoke: 1, f01: 6, f03: 0, smoke1: 8, smoke2: 4 },
};
DENSITY.Ultra = DENSITY.High;
const CAP = DENSITY.High, PER_FLAME = FLAME_ROLES.reduce((s, r) => s + CAP[r], 0), FIRE_OWN = FIRE_ROLES.reduce((s, r) => s + CAP[r], 0);
export const PER_FIRE = MAX_FLAMES * PER_FLAME + FIRE_OWN;
const ROLE_AT = {}; { let o = 0; for (const r of FLAME_ROLES) { ROLE_AT[r] = o; o += CAP[r]; } o = MAX_FLAMES * PER_FLAME; for (const r of FIRE_ROLES) { ROLE_AT[r] = o; o += CAP[r]; } }
export const BURST = { molotov: { flash: 4, fb1: 6, fb4: 12, fb2: 6, spray: 12, shard: 12, splash: 8 }, incendiary: { fb2: 6, iSpray: 10, shard: 8, iSplash: 8 } };
export const BURST_PARTS = Math.max(...Object.values(BURST).map(b => Object.values(b).reduce((s, n) => s + n, 0)));
export const BASE = { scorch: 0, fly: SCORCH_FIRES * MAX_FLAMES, burst: 0, fires: 0 }; BASE.burst = BASE.fly + MAX_FLY * FLY_PARTS; BASE.fires = BASE.burst + MAX_BURSTS * BURST_PARTS;
export const INSTANCES = BASE.fires + MAX_FIRES * PER_FIRE;
export const LIGHT = { color: 0xf2d393, core: 150, mult: 2, radius: 150 * 2 * HU, noise: [.6, 1], nScale: .72064, nRate: 50, fadeIn: .110708, fadeOut: 1 - .918027, a0: 30, a1: 80 };   // (molotov_groundfire_lighting: (242,211,147); the core point's radius 150 HU (fire_core.vsnap) × its curve over life (0→1 by 0.110708, 1 until 0.918027, →0) × C_OP_SetFloat's PARTICLE_NOISE 0.6–1.0 (m_flNoiseScale 0.72064, m_vecNoiseOffsetRate 50), × m_flRadiusMultiplier 2: 180–300 HU; its alpha the radius remapped 30→80 HU to 0→1)

// The kinds' table (uK): KW texels a kind, built from SYS (sizes and speeds in game units).
export const KW = 19;
function buildTable() {
  const T = new Float32Array(KW * 4 * NG), cellOf = n => ATLAS[n];
  for (const [name, s] of Object.entries(SYS)) { const k = K[name], o = k * KW * 4, put = (i, a, b, c, d) => { T[o + i * 4] = a; T[o + i * 4 + 1] = b; T[o + i * 4 + 2] = c; T[o + i * 4 + 3] = d; };
    const rk = s.rk ?? 1, at = cellOf(s.tex), seqs = Math.max(1, Math.min(at[1], (s.seqMax ?? 0) + 1)), cs = s.colScale || [255, 255, 255];
    put(0, s.life[0], s.life[1], s.cyc, s.fade[0]);
    put(1, s.r[0] * rk * HU, s.r[1] * rk * HU, s.sc[0], s.sc[1]);
    put(2, s.bias, s.clamp[0] * (s.clamp[1] < 999 ? HU : HU), s.clamp[1] * HU, s.fade[1]);
    put(3, s.alpha[0] * (s.aScale || 1), s.alpha[1] * (s.aScale || 1), s.grav * HU, s.vmax * HU);
    put(4, s.inward[0] * HU, s.inward[1] * HU, s.up[0] * HU, s.up[1] * HU);
    put(5, s.hs * HU, s.jit * HU, s.z[0] * HU, s.z[1] * HU);
    put(6, at[0], seqs, at[2], s.frames);
    put(7, s.ob * OB_K, s.desat, GRAD_ID[s.grad], s.texBlend);
    put(8, s.col[0][0] / 255 * cs[0] / 255, s.col[0][1] / 255 * cs[1] / 255, s.col[0][2] / 255 * cs[2] / 255, s.rot[0] * Math.PI / 180);
    put(9, s.col[1][0] / 255 * cs[0] / 255, s.col[1][1] / 255 * cs[1] / 255, s.col[1][2] / 255 * cs[2] / 255, s.rot[1] * Math.PI / 180);
    const ec = s.endCol || [0, 0, 0, 2]; put(10, ec[0] / 255, ec[1] / 255, ec[2] / 255, ec[3]);
    const d = s.dist || [0, 1, 1, 1]; put(11, d[0] * HU, d[1], Math.max(d[2], d[0] + 1) * HU, d[3]);
    const ja = s.jitAge || [0, 1, s.jit]; put(12, ja[0], Math.max(ja[1], ja[0] + .01), ja[2] * HU, s.lowAlpha || 1);
    put(13, s.endFade ?? FIRE.fade / 1000, s.sfade[0], s.sfade[1], s.shrink || 0);
    const ld = s.lifeDist || [0, 1, 1, 1]; put(14, ld[0] * HU, ld[1], Math.max(ld[2], ld[0] + 1) * HU, ld[3]);
    put(16, s.drag || 0, (s.attract || 0) * HU, s.colEnd ?? 1, 0);   // (z: C_OP_ColorInterpolate's m_flFadeEndTime)
    const a2 = s.alpha2 || [1, 1]; put(17, a2[0], a2[1], 0, 0);   // (field 16, alpha alternate: C_INIT_InitFloat on it — multiplied in, as its end cap's LerpEndCapScalar → 0 fades the flame)
    const d2 = s.dist2 || [0, 1, 1, 1]; put(18, d2[0] * HU, d2[1], Math.max(d2[2], d2[0] + 1) * HU, d2[3]);   // (a second C_INIT_DistanceToCPInit on the radius)
    put(15, s.propZ || 0, MODE[s.mode] + 10 * BLEND[s.blend], (s.spin || 0) * Math.PI / 180, (s.maxLen || 0) * HU + (s.breakup || 0) * 1000 + (s.flicker ? 2e6 : 0)); }
  return T; }
export const TABLE = buildTable();

const glslGrad = (name, S) => `vec3 ${name}(float x){ vec3 c = vec3(${S[0].slice(1).map(v => v.toFixed(1)).join(',')});` + S.slice(1).map((s, i) => ` c = mix(c, vec3(${s.slice(1).map(v => v.toFixed(1)).join(',')}), clamp((x - ${S[i][0].toFixed(6)}) / ${(s[0] - S[i][0]).toFixed(6)}, 0.0, 1.0));`).join('') + ' return c / 255.0; }';
const f3 = v => v.map(x => (+x).toFixed(1)).join(',');
const A_ = ATLAS;

const VS = `
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC;
uniform float uTime; uniform sampler2D uK; uniform float uLod;
varying vec2 vUv; varying float vA; varying float vCell; varying float vCell2; varying float vMix; varying vec3 vTint; varying vec4 vFx; varying float vBlend; varying float vAge; varying float vBreak; varying float vK;
const float GROW = ${(FIRE.grow / 1000).toFixed(3)}, HU = ${HU.toFixed(6)};
vec3 c2(vec3 a){ return a / 255.0; }
float h1(float n){ return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
vec4 KP(int k, int i){ return texelFetch(uK, ivec2(i, k), 0); }
float up1(float vu, float g, float vmax, float dr, float tt) {   // height risen: from vu under g with drag (m_fDrag read as a damping rate a second: our reading), capped at vmax (C_OP_MaxVelocity)
  float y; if (dr > 0.0) { float kk = dr, vt = g / kk; y = vt * tt + (vu - vt) * (1.0 - exp(-kk * tt)) / kk; } else y = vu * tt + 0.5 * g * tt * tt;
  return vmax > 0.0 ? min(y, vmax * tt) : y; }
void main() {
  float k = aA.w, t = uTime, s = aB.x, t0 = aB.y, t1 = aB.z, seed = aB.w, look = aC.x, outT = aC.y;
  float ex = clamp((t - outT) / 0.35, 0.0, 1.0);
  vec3 p = aA.xyz, R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = position.xy; vUv = uv; vK = k; vMix = 0.0; vTint = vec3(1.0); vFx = vec4(${(1.25 * OB_K).toFixed(3)}, 0.0, 0.0, 0.0); vBlend = 0.0; vAge = 0.0; vBreak = 0.0;
  float a = 0.0, w = s, hh = s, cell = 0.0, cell2 = -1.0, rot = seed * 6.2832; int mode = 1; vec3 axis = vec3(0.0, 1.0, 0.0); float len = 0.0;
  float fl = 0.82 + 0.1 * sin(t * 9.3 + seed * 37.0) + 0.08 * sin(t * 15.7 + seed * 11.0);
  if (k < ${NG}.0 - 0.5 && s > 0.0) {   // CS2's particle systems: SYS's numbers (uK)
    int ki = int(k + 0.5); vec4 P0 = KP(ki, 0), P1 = KP(ki, 1), P2 = KP(ki, 2), P3 = KP(ki, 3), P4 = KP(ki, 4), P5 = KP(ki, 5), P6 = KP(ki, 6), P7 = KP(ki, 7), P8 = KP(ki, 8), P9 = KP(ki, 9), P10 = KP(ki, 10), P11 = KP(ki, 11), P12 = KP(ki, 12), P13 = KP(ki, 13), P14 = KP(ki, 14), P15 = KP(ki, 15), P16 = KP(ki, 16), P17 = KP(ki, 17), P18 = KP(ki, 18);
    float fage = t - t0;   // the emitter's age (the flame's / the fire's / the burst's)
    vec2 toC = aC.zw; float dC0 = length(toC);
    float lifeK = mix(P14.y, P14.w, clamp((dC0 - P14.x) / (P14.z - P14.x), 0.0, 1.0));
    float L = mix(P0.x, P0.y, h1(seed * 91.0)) * lifeK, c, u, tt, r1;
    if (P0.z > 0.5) { c = fage / L + seed * 2.7; u = fract(c); r1 = h1(floor(c) + seed * 173.0); tt = u * L; if (fage - tt < -0.001) u = -1.0; }
    else { tt = fage; u = tt / L; r1 = h1(seed * 173.0); }
    float env = (P0.z > 0.5 ? smoothstep(0.0, GROW, fage) : 1.0) * (1.0 - smoothstep(t1 - P13.x, t1, t)) * step(0.0, fage) * step(t, t1);
    if (u >= 0.0 && u <= 1.0 && env > 0.0) {
      int pm = int(mod(P15.y, 10.0) + 0.5), pb = int(floor(P15.y / 10.0) + 0.5); mode = pm == 0 ? 1 : pm == 1 ? 2 : 3; vBlend = float(pb);
      float ra = fract(r1 * 7.1), rb = fract(r1 * 3.7), rc = fract(r1 * 5.3), rd = fract(r1 * 8.9), re = fract(r1 * 13.7), rf = fract(r1 * 29.3), rg = fract(r1 * 4.1), rh = fract(r1 * 11.3), ri = fract(r1 * 9.1), rj = fract(r1 * 17.9);
      // where it is born: round its point (the filler / edge point, the fire's middle within a disc growing with its age)
      float jit = mix(P5.y, P12.z, clamp((fage - P12.x) / (P12.y - P12.x), 0.0, 1.0)), an = 6.2832 * re, rr = jit * sqrt(rf);
      vec2 off = vec2(cos(an), sin(an)) * rr; p.xz += off; vec2 toCp = toC - off; float dC = length(toCp);
      // its radius: CS2's range × its distance scale × the fire's age (field 27) × its scale over life, clamped
      float shrink = P13.w > 0.5 ? mix(1.0, 0.35, clamp(fage / ${(INFERNO.life / 1000).toFixed(1)}, 0.0, 1.0)) : 1.0;
      float dk = mix(P11.y, P11.w, clamp((dC - P11.x) / (P11.z - P11.x), 0.0, 1.0)) * mix(P18.y, P18.w, clamp((dC - P18.x) / (P18.z - P18.x), 0.0, 1.0));
      float rad = mix(P1.x, P1.y, pow(ra, 1.6)) * dk * shrink * mix(P1.z, P1.w, pow(clamp(u, 0.0, 1.0), max(P2.x, 0.05)));
      rad = clamp(rad, P2.y, P2.z) * s;
      // its motion: drawn in toward the middle (capped at its max speed), a push across, rising under its gravity
      vec2 dirIn = dC > 1e-3 ? toCp / dC : vec2(0.0); float vin = mix(P4.x, P4.y, rc), vcap = P3.w > 0.0 ? min(vin, P3.w) : vin;
      p.xz += dirIn * min(vcap * tt + 0.5 * P16.y * tt * tt, dC);   // (+ C_OP_AttractToControlPoint's pull)
      float ha = 6.2832 * rj, hs = P5.x * (0.4 + 0.6 * rg); p.xz += vec2(cos(ha), sin(ha)) * hs * tt;
      if (pm == 0 && P5.x > 0.0 && P3.z > 0.0) p.xz += vec2(sin(t * 2.3 + seed * 40.0), cos(t * 1.9 + seed * 23.0)) * hs * 0.25;   // (embers: C_OP_RandomForce ±250 — a wander)
      float vu = mix(P4.z, P4.w, rd), z0 = mix(P5.z, P5.w, rb) + P15.x * rad;
      float dy = up1(vu, P3.z, P3.w, P16.x, tt); if (P3.z < 0.0) { dy = vu * tt + 0.5 * P3.z * tt * tt; dy = max(dy, -z0 + 0.3 * HU); }   // (falling parts stop on the floor: their world trace)
      p.y += z0 + dy;
      // alpha: its range, fades in / out (s, or a share of its life), the emitter's fade, the screen-size fade (StartFadeSize)
      float al = mix(P3.x, P3.y, ri) * mix(P17.x, P17.y, fract(r1 * 21.7)) * (uLod < 1.5 ? P12.w : 1.0); al = min(al, P3.y > 1.5 ? 2.0 : 1.0);
      float fi = P0.w < 0.0 ? smoothstep(0.0, -P0.w, u) : smoothstep(0.0, max(P0.w, 1e-3), tt);
      float fo = P2.w < 0.0 ? 1.0 - smoothstep(1.0 + P2.w, 1.0, u) : 1.0 - smoothstep(L - max(P2.w, 1e-3), L, tt);
      a = al * fi * fo * env * (1.0 - ex);
      if (P15.w >= 2e6 - 1.0) a *= 0.75 + 0.25 * fl;   // (the light's fake: flickers with it)
      vec4 vp = viewMatrix * vec4(p, 1.0); float scr = rad * projectionMatrix[1][1] / max(-vp.z, 0.1);
      a *= 1.0 - smoothstep(P13.y, P13.z, scr);
      // the flipbook: one of its sequences, the whole sheet over its life (manual frames) or at its rate
      float F = P6.z, sq = floor(rh * P6.y * 0.9999), f = P6.w < 0.0 ? clamp(u, 0.0, 1.0) * -P6.w * (F - 1.0) : min(tt * P6.w, F - 1.0), fi0 = floor(f);
      if (P6.w > 0.0 && P6.w < 2.0 && F > 1.0) { f = mod(tt * P6.w + rh * F, F); fi0 = floor(f); }
      cell = P6.x + sq * F + fi0; cell2 = P6.x + sq * F + min(fi0 + 1.0, F - 1.0); vMix = f - fi0;
      vTint = mix(P8.rgb, P9.rgb, rh * 0.7 + ri * 0.3); if (P10.w <= 1.0) vTint = mix(vTint, P10.rgb, clamp((u - P10.w) / max(P16.z - P10.w, 1e-3), 0.0, 1.0));   // (C_OP_ColorInterpolate: linear from its start to its end time)
      vFx = P7; vAge = tt; vBreak = mod(floor(P15.w / 1000.0), 1000.0) / 1000.0;
      rot = mix(P8.w, P9.w, rj) + P15.z * tt * (rg - 0.5) * 2.0; w = hh = 2.0 * rad;
      if (mode == 3) {   // a trail (C_OP_RenderTrails): a tongue from its edge point, leaning in, as long as it has travelled
        float maxL = mod(P15.w, 1000.0); len = min(maxL, 5.0 * HU + vcap * tt); vec3 ax = normalize(vec3(dirIn.x * 0.35, 1.0, dirIn.y * 0.35)); axis = ax;
        float rw = min(rad, 0.5 * len); w = 2.0 * rw; hh = len + rw; p = vec3(aA.x + off.x, aA.y + z0, aA.z + off.y) + ax * (hh * 0.5 - rw * 0.5);
      }
    }
  } else if (k > ${K.scorch}.0 - 0.5 && k < ${K.scorch}.0 + 0.5) {   // a scorch left on the floor (darkens), from after its flame lit
    mode = 2; a = 0.8 * smoothstep(0.0, 1.2, t - t0) * (1.0 - smoothstep(t1 - 4.0, t1, t)) * step(t0, t); cell = ${A_.scorch[0]}.0; vBlend = 4.0;
  } else if (k > ${K.exSmoke}.0 - 0.5 && k < ${K.exSmoke}.0 + 0.5) {   // put out: CS2's extinguish swirl, where the flame was
    mode = 1; float L = 0.2 + 0.8 * fract(seed * 7.0), tt = t - outT, u = clamp(tt / L, 0.0, 1.0); w = hh = 2.0 * s * mix(6.0, 20.0, u); p.y += s * 2.0 + 0.5 * 650.0 * tt * tt * HU * 0.6;
    a = step(outT, t) * step(tt, L) * (0.156863 + 0.078431 * fract(seed * 3.9)) * (1.0 - u * u) * smoothstep(0.0, 0.05, tt); cell = ${A_.ext[0]}.0 + floor(fract(seed * 5.0) * 3.99); vTint = mix(vec3(1.0), c2(vec3(37.0)), fract(seed * 11.3)); rot = seed * 6.2832 + u * 1.2; vBlend = 5.0;
  } else if (k > ${K.rag}.0 - 0.5 && k < ${K.rag}.0 + 0.5) {   // in flight: the molotov's burning rag / the incendiary's white-hot desaturated flame
    w = s; hh = aC.z * fl; a = step(0.0, t - t0) * step(t, t1); mode = 0;
    if (look > 0.5) { float f = fract(t * 2.0 + seed) * 15.99; cell = floor(f); cell2 = min(cell + 1.0, 15.0); vMix = fract(f); vTint = mix(c2(vec3(251.0, 237.0, 176.0)), c2(vec3(252.0, 148.0, 99.0)), 0.5 + 0.5 * sin(t * 11.0)); vFx.y = 1.0; }
    else { float f = fract(t * 4.7 + seed) * 2.99; cell = ${A_.burn[0]}.0 + floor(f); cell2 = ${A_.burn[0]}.0 + min(floor(f) + 1.0, 2.0); vMix = fract(f); vTint = mix(c2(vec3(222.0, 192.0, 171.0)), c2(vec3(192.0, 95.0, 0.0)), 0.35); }
  } else if (k > ${K.ragGlow}.0 - 0.5 && k < ${K.ragGlow}.0 + 0.5) {   // the molotov's glow in flight (weapon_molotov_thrown_glow)
    mode = 1; a = step(0.0, t - t0) * step(t, t1) * (0.6 + 0.4 * fl) * 0.7; cell = ${A_.flare[0]}.0; vTint = mix(c2(vec3(244.0, 244.0, 227.0)), c2(vec3(231.0, 181.0, 102.0)), 0.5);
  } else if (k > ${K.spark}.0 - 0.5 && k < ${K.spark}.0 + 0.5) {   // the incendiary's sparks in flight (weapon_incend_thrown: tile_starfield, (255,255,205))
    mode = 1; a = step(0.0, t - t0) * step(t, t1) * (0.5 + 0.5 * fl); cell = ${A_.sparks[0]}.0 + floor(fract(t * 9.0 + seed) * 3.99); vTint = c2(vec3(255.0, 255.0, 205.0)) * 1.3; rot = t * 3.0 + seed * 6.0;
  } else if (k > ${K.trail}.0 - 0.5 && k < ${K.trail}.0 + 0.5) {   // the molotov's trail of small flames (weapon_molotov_thrown_child3)
    mode = 1; float age = t - t0, L = 0.25 + 0.25 * seed, u = clamp(age / L, 0.0, 1.0); p.y += 0.5 * 52.0 * age * age * HU; w = hh = 2.0 * s * (0.9 + 0.2 * fract(seed * 7.0)); a = step(0.0, age) * step(age, L) * (0.27451 + 0.196078 * fract(seed * 3.3)) * (1.0 - u) * 1.6;
    cell = ${A_.burn[0]}.0 + floor(u * 2.99); vTint = mix(c2(vec3(186.0)), c2(vec3(129.0, 66.0, 20.0)), fract(seed * 5.1)) * 1.5;
  } else if (k > ${K.smokeTrail}.0 - 0.5) {   // the incendiary's dark smoke trail (weapon_incend_thrown: explosion_fireball_large_01_smoke, (28,28,30))
    mode = 1; float age = t - t0, L = 0.5 + 0.25 * seed, u = clamp(age / L, 0.0, 1.0); w = hh = 2.0 * s * mix(0.2, 1.5, u); p.y += u * s; a = step(0.0, age) * step(age, L) * 0.5 * (1.0 - u) * smoothstep(0.0, 0.1, u); cell = ${A_.ext[0]}.0 + floor(seed * 3.99); vTint = c2(vec3(28.0, 28.0, 30.0)); vBlend = 5.0;
  }
  vA = a; vCell = cell; vCell2 = cell2 < 0.0 ? cell : cell2;
  vec3 o; float cr = cos(rot), sr = sin(rot);
  if (mode == 0) { vec3 RH = normalize(vec3(R.x, 0.0, R.z) + vec3(1e-5, 0.0, 0.0)); o = p + RH * (q.x * w) + vec3(0.0, (q.y + 0.38) * hh, 0.0); }   // (upright from its foot: the rag in flight)
  else if (mode == 1) { vec2 rq = vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr); o = p + (R * rq.x + U * rq.y) * w; }   // SCREEN_ALIGNED (CS2's default)
  else if (mode == 2) o = p + vec3((q.x * cr - q.y * sr) * w, 0.03, (q.x * sr + q.y * cr) * w);   // ALIGN_TO_PARTICLE_NORMAL on the floor
  else { vec3 side = normalize(cross(axis, cameraPosition - p) + vec3(1e-5, 0.0, 0.0)); o = p + side * (q.x * w) + axis * (q.y * hh); }   // a trail: along its axis, facing the camera
  if (a <= 0.002) o = p;   // (nothing to draw: a degenerate quad, no fragments)
  gl_Position = projectionMatrix * viewMatrix * vec4(o, 1.0);
}`;
const FS = `
uniform sampler2D uAtlas;
varying vec2 vUv; varying float vA; varying float vCell; varying float vCell2; varying float vMix; varying vec3 vTint; varying vec4 vFx; varying float vBlend; varying float vAge; varying float vBreak; varying float vK;
${glslGrad('gM', GRAD.molotov)}
${glslGrad('gO', GRAD.outline)}
${glslGrad('gI', GRAD.incendiary)}
${glslGrad('gIC', GRAD.incCenter)}
${glslGrad('gIO', GRAD.incOutline)}
${glslGrad('gF', GRAD.flash)}
${glslGrad('gS', GRAD.splash)}
vec4 cellAt(float c, vec2 q) { float g = ${ATLAS.grid}.0, cx = mod(c, g), cy = floor(c / g); return texture2D(uAtlas, (vec2(cx, g - 1.0 - cy) + clamp(q, 0.01, 0.99)) / g); }
void main() {
  if (vA <= 0.002) discard;
  vec4 tx = cellAt(vCell, vUv); if (vMix > 0.004) tx = mix(tx, cellAt(vCell2, vUv), vMix);
  const vec3 LUM = vec3(0.299, 0.587, 0.114); float a = tx.a * vA;
  if (vBlend > 4.5) { a = min(a, 1.0); vec3 c = tx.rgb * vTint; gl_FragColor = vec4(c * a, a); return; }   // extinguish / trail smoke: over
  if (vBlend > 3.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, min(a, 1.0) * (1.0 - 0.5 * dot(tx.rgb, vec3(0.33)))); return; }   // scorch: darkens
  if (vBlend > 2.5) { a = min(a, 1.0); gl_FragColor = vec4(vTint * a, a); return; }   // dark smoke (the plume: its colour, the picture's coverage)
  vec3 c = tx.rgb; float gid = vFx.z;
  if (gid > 0.5) { float L = tx.a;   // (the lookup's coordinate: the texel's density, its alpha — our reading; CS2's outline texture fire_small_sim_b_desat is grey, so there its value, its luminance and its alpha agree. Thin edges land on the gradients' dark-red / orange stops, thick cores on their yellow-white ones)
    vec3 g = gid < 1.5 ? gM(L) : gid < 2.5 ? gO(L) : gid < 3.5 ? gI(L) : gid < 4.5 ? gIC(L) : gid < 5.5 ? gIO(L) : gid < 6.5 ? gF(L) : gS(L); c = mix(tx.rgb, g, vFx.w); }
  if (vBreak > 0.0) { float z = 1.0 + vBreak * vAge, b = cellAt(${A_.breakup[0]}.0, (vUv - 0.5) / z + 0.5).a * vBreak; c = max(c - b, 0.0); a = max(tx.a - b, 0.0) * vA; }
  c = mix(c, vec3(dot(c, LUM)), vFx.y);
  vec3 o = c * vTint * vFx.x;   // (overbright, linear: stacked flames add past 1 and clip yellow-white, as CS2's do through its tone map)
  if (vBlend > 1.5) { a = min(a, 1.0); o = min(o / ${OB_K.toFixed(3)}, vec3(1.0)); gl_FragColor = vec4(o * a, a); return; }   // ALPHA (flame03a's gas, the flash, shards): the file's overbright whole — OB_K is for the added parts' stacking
  gl_FragColor = vec4(o * a, vBlend > 0.5 ? min(a, 1.0) * 0.5 : 0.0);   // ADD (alpha 0) — HALF_BLEND_ADD half its coverage
}`;

// Our fallback atlas (the same layout as CS2's, 64 px a cell): upright animated flame flipbooks drawn by us (a flame
// that grows from a small lick at its foot to its full body and breaks into rising wisps, as CS2's fire_small_sim
// sheets do), fire on the floor, gas puffs, smoke, the flash, sparks, flares, the rag, the scorch, the breakup, shards and
// splashes — drawn once at load. In node (tests): a 1×1 picture.
export function fallbackAtlas() {
  const tiny = () => { const t = new THREE.DataTexture(new Uint8Array([255, 200, 120, 255]), 1, 1); t.needsUpdate = true; return t; };
  if (typeof document === 'undefined' || !document.createElement) return tiny();
  const G = ATLAS.grid, C = 64, N = G * C, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'); if (!g?.getImageData) return tiny();
  const img = g.createImageData(N, N), D = img.data; let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const NS = 32, nz = new Float32Array(NS * NS); for (let i = 0; i < nz.length; i++) nz[i] = rnd();
  const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = (u, v) => nz[((v % NS + NS) % NS) * NS + ((u % NS + NS) % NS)], sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (a(i, j) * (1 - sx) + a(i + 1, j) * sx) * (1 - sy) + (a(i, j + 1) * (1 - sx) + a(i + 1, j + 1) * sx) * sy; };
  const fbm = (x, y) => noise(x, y) * .55 + noise(x * 2.1, y * 2.1) * .3 + noise(x * 4.3, y * 4.3) * .15;
  const put = (cell, fn) => { const ox = (cell % G) * C, oy = Math.floor(cell / G) * C; for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const v = fn((x + .5) / C, 1 - (y + .5) / C), o = ((oy + y) * N + ox + x) * 4; D[o] = v[0]; D[o + 1] = v[1]; D[o + 2] = v[2]; D[o + 3] = v[3]; } };
  // A fire texel from its brightness b, on the curve CS2's own fire_small_sim_a/_b frames follow (measured per alpha band
  // from the imported frames, seq0 frame 6: red ≈ 1 − (1 − a)³, green ≈ a^1.5, blue ≈ 0.65 a³, alpha up to ≈ 0.9). The
  // shader's colour lookup reads the red, so our pictures land on the gradients' stops where CS2's do: the outline's
  // blue/purple and the incendiary's cyan stops (red 0.4–0.5) fall on faint edges only (alpha ≈ 0.12), not on the body.
  const fireRGB = (b, k) => { const a = Math.min(.92, b * 1.15); return [255 * (1 - Math.pow(1 - a, 3)), 255 * Math.pow(a, 1.5), 255 * Math.min(1, .65 * a * a * a * (k ?? 1)), 255 * a]; };
  // A flame frame: frame f of F in sequence sq. Its life: a small lick at the foot (frame 0) that rises into a full,
  // licking body (≈ 40 %), then lifts off and breaks into wisps (the last frames). Tongues sway with noise, rising.
  const flame = (sq, f, F, wide) => { const u = f / (F - 1), grow = Math.min(1, u / .4), lift = Math.max(0, (u - .45) / .55), ph = sq * 1.91 + u * 3.1;
    const H = .25 + .7 * grow - .15 * lift, W = (wide ? .42 : .26) * (.55 + .45 * grow), base = .06 + .5 * lift * lift, T = wide ? 3 : 2;
    return (x, y) => { const v = (y - base) / Math.max(.05, H); if (v < -.12 || v > 1.15) return [0, 0, 0, 0]; let b = 0;
      for (let k = 0; k < T; k++) { const cx = .5 + (k - (T - 1) / 2) * W * .55 + Math.sin(ph + k * 2.3) * .03, sway = Math.sin(v * 4.2 + ph * 1.7 + k) * .07 * v + (fbm(x * 3 + sq * 4 + k, y * 2.4 - u * 2.2) - .5) * .22 * v;
        const wv = W * (1 - k * .18) * Math.pow(Math.max(0, 1 - v), .7) * Math.min(1, (v + .12) * 4), d = Math.abs(x - cx - sway) / Math.max(.01, wv); b = Math.max(b, Math.max(0, 1 - d * d)); }
      const n = fbm(x * 6 + sq * 7, y * 5 - u * 4 - sq), eat = lift * (1.1 - n * 1.6), core = Math.max(0, 1 - Math.abs(x - .5) / (W * .6)) * Math.max(0, 1 - v * 1.3);
      const br = Math.max(0, Math.min(1, b * (.45 + .75 * n) - eat * .7)) * (.55 + .45 * core) + core * b * .35;
      return fireRGB(Math.min(1, br)); }; };
  const flip = ([first, seqs, F], wide = false) => { for (let sq = 0; sq < seqs; sq++) for (let f = 0; f < F; f++) put(first + sq * F + f, flame(sq, f, F, wide)); };
  flip(ATLAS.simB); flip(ATLAS.simA, true); flip(ATLAS.incA, true);
    for (let sq = 0; sq < ATLAS.surface[1]; sq++) for (let f = 0; f < ATLAS.surface[2]; f++) put(ATLAS.surface[0] + sq * ATLAS.surface[2] + f, (x, y) => { const d = Math.hypot(x - .5, y - .5) * 2, n = fbm(x * 5 + f * .6 + sq * 3, y * 5 - f * .4), b = Math.max(0, 1 - d) * Math.max(0, n * 1.7 - .5); return fireRGB(Math.min(1, b * 1.6)); });
  const gasF = (k, f, F) => (x, y) => { const d = Math.hypot(x - .5, y - .45) * 2, n = fbm(x * 4 + f * .7 + k, y * 4 - f * .6), b = Math.max(0, 1 - d * (1.05 - .3 * n)) * Math.max(0, n * 1.7 - .45) * (1 - .6 * f / F); return fireRGB(Math.min(1, b * 1.5)); };   // (fire gas: orange, bright where thick)
  for (let sq = 0; sq < ATLAS.gas[1]; sq++) for (let f = 0; f < ATLAS.gas[2]; f++) put(ATLAS.gas[0] + sq * ATLAS.gas[2] + f, gasF(sq * 5, f, ATLAS.gas[2]));
  for (let f = 0; f < ATLAS.gasB[2]; f++) put(ATLAS.gasB[0] + f, gasF(11, f, 4));
  for (let f = 0; f < ATLAS.flash[2]; f++) put(ATLAS.flash[0] + f, (x, y) => { const d = Math.hypot(x - .5, y - .5) * 2, n = fbm(x * 4 + f, y * 4 - f), b = Math.max(0, 1 - d * d) * (.6 + .4 * n) * (1 - f / 10); return fireRGB(Math.min(1, b * 1.4), 2); });
  for (const [first, , F] of [ATLAS.plume, ATLAS.smoke, ATLAS.ext, ATLAS.steam]) for (let f = 0; f < F; f++) put(first + f, (x, y) => { const d = Math.hypot(x - .5, y - .5) * 2, n = fbm(x * 3.2 + f * 1.3 + first, y * 3.2 + f * .9), a = Math.max(0, 1 - d * d) * Math.max(0, n * 1.5 - .2); return [200, 200, 200, 255 * Math.min(1, a)]; });
  for (let f = 0; f < 4; f++) put(ATLAS.sparks[0] + f, (x, y) => { let a = 0; for (let s = 0; s < 9; s++) { const an = s * 2.4 + f, rr = (.1 + .3 * ((s * 7 + f) % 5) / 5) * (1 + f * .25), px = .5 + Math.cos(an) * rr, py = .5 + Math.sin(an) * rr, dd = Math.hypot(x - px, y - py); a = Math.max(a, Math.max(0, 1 - dd / .035)); } return [255, 220, 160, 255 * a]; });
  for (const c of [ATLAS.ember[0], ATLAS.flare[0]]) put(c, (x, y) => { const d = Math.hypot(x - .5, y - .5) * 2, a = Math.pow(Math.max(0, 1 - d), 2.2); return [255, 255, 255, 255 * a]; });
  for (let f = 0; f < 3; f++) put(ATLAS.burn[0] + f, flame(f, 6 + f, 16, false));
  put(ATLAS.scorch[0], (x, y) => { const d = Math.hypot(x - .5, y - .5) * 2, n = fbm(x * 6, y * 6), a = Math.max(0, 1 - d * (1.1 - .5 * n)) * (.55 + .45 * n); return [40, 34, 30, 255 * Math.min(1, a * 1.3)]; });
  put(ATLAS.breakup[0], (x, y) => { const n = fbm(x * 8 + 11, y * 8 + 3); return [0, 0, 0, 255 * Math.min(1, Math.max(0, (n - .3) * 1.8))]; });   // (the breakup: in its alpha, as CS2's tile_inv)
  for (let s = 0; s < 4; s++) put(ATLAS.fleks[0] + s, (x, y) => { const X = x - .5, Y = y - .5, a = Math.abs(X * Math.cos(s) + Y * Math.sin(s)) < .12 + .05 * s && Math.abs(-X * Math.sin(s) + Y * Math.cos(s)) < .3 - .04 * s ? 1 : 0; return [230, 240, 235, 255 * a]; });   // (glass / metal bits)
  for (let f = 0; f < 4; f++) put(ATLAS.splash[0] + f, (x, y) => { const d = Math.hypot(x - .5, (y - .3) * 1.3) * 2, n = fbm(x * 5 + f, y * 5 - f * .8), b = Math.max(0, 1 - d) * Math.max(0, n * 1.6 - .4) * (1 - f / 5); return fireRGB(Math.min(1, b * 1.5)); });
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function createFireView({ scene = null, quality = () => 'Medium', hostNow = () => Date.now(), boxes = () => [], drawnAt = () => null, assets = true, quiet = () => true, onFlame = null, preset = null } = {}) {
  const geo = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1); geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv')); geo.instanceCount = BASE.fires;
  const A = {}; for (const n of ['aA', 'aB', 'aC']) { const a = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCES * 4), 4); a.setUsage(THREE.DynamicDrawUsage); a.gdR = { start: 0, count: 0 }; geo.setAttribute(n, a); A[n] = a; }
  const AA = A.aA.array, AB = A.aB.array, AC = A.aC.array;
  for (let i = 0; i < INSTANCES; i++) { AB[i * 4 + 1] = 1e9; AB[i * 4 + 2] = -1e9; AC[i * 4 + 1] = 1e9; }   // (nothing live: starts in the future, ends in the past)
  const fallback = fallbackAtlas(), table = new THREE.DataTexture(TABLE, KW, NG, THREE.RGBAFormat, THREE.FloatType); table.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uAtlas: { value: fallback }, uK: { value: table }, uLod: { value: 2 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, side: THREE.DoubleSide, forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
  mat.userData.shared = true;
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'gd-fire'; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.visible = false; mesh.renderOrder = 3;
  mesh.userData.gd = true; mesh.userData.warm = true; mesh.userData.fx = true; mesh.userData.noPool = true; scene?.add(mesh);
  // The lights: one source per fire slot (graphics.js's pool shows the strongest), off until its fire burns — CS2's colour
  // and reach. Made here, never visible: the lit shaders' light count is fixed from load.
  const lights = []; for (let i = 0; i < MAX_FIRES; i++) { const l = new THREE.PointLight(LIGHT.color, 0, LIGHT.radius, 2); l.visible = false; l.userData.gd = true; l.userData.fire = true; lights.push(l); scene?.add(l); }
  let base = NaN; const T = ms => (ms - base) / 1000;   // (seconds since `base` on the host's clock: float precision for hours)
  const fires = Array.from({ length: MAX_FIRES }, () => ({ id: null, g: null, flames: null, xm: 0, at: 0, seen: 0, cx: 0, cy: 0, cz: 0, look: 0, told: 0, t0: 0, t1: 0 }));
  const fly = Array.from({ length: MAX_FLY }, () => ({ id: null, look: 0, seen: 0, trailAt: 0, ti: 0 })), bursts = { next: 0 }, seenBurst = new Array(32).fill(null); let scorchNext = 0, burstSeenI = 0;
  const stats = { fires: 0, writes: 0, uploads: 0, waiting: 0 };
  function dirty(a, start, count) { const R = a.gdR, U = a.updateRanges; if (U.length !== 1 || U[0] !== R) { U.length = 0; R.start = start; R.count = count; U.push(R); } else { const e = Math.max(R.start + R.count, start + count); R.start = Math.min(R.start, start); R.count = e - R.start; } a.needsUpdate = true; }
  const dirtyAll = (i, n) => { dirty(A.aA, i * 4, n * 4); dirty(A.aB, i * 4, n * 4); dirty(A.aC, i * 4, n * 4); stats.uploads++; };
  function put(i, x, y, z, k, s, t0, t1, seed, look, outT, cz, cw = 0) { const o = i * 4; AA[o] = x; AA[o + 1] = y; AA[o + 2] = z; AA[o + 3] = k; AB[o] = s; AB[o + 1] = t0; AB[o + 2] = t1; AB[o + 3] = seed; AC[o] = look; AC[o + 1] = outT; AC[o + 2] = cz; AC[o + 3] = cw; stats.writes++; }
  const off = i => put(i, 0, -1e4, 0, 0, 0, 1e9, -1e9, 0, 0, 1e9, 0, 0);
  const hash = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const vnoise = x => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f), a = hash(i, 1.7), b = hash(i + 1, 1.7); return a + (b - a) * s; };   // (1D smooth noise in 0–1: the light's flicker)
  const presetName = () => { const q = String(quality() || 'Medium'); if (/low/i.test(q)) { let p = preset?.() ?? null; if (!p) try { p = gdPresetNow()?.name; } catch {} return p === 'Very Low' ? 'Very Low' : 'Low'; } return DENSITY[q] ? q : 'Medium'; };
  const lodOf = p => p === 'Ultra' ? 3 : p === 'High' ? 2 : p === 'Medium' ? 1 : 0;   // (CS2's detail levels 0–3: the files' m_flLOD0…3)
  const lightsOn = () => { const p = presetName(); return p === 'High' || p === 'Ultra' || p === 'Medium'; };
  const fakeFloor = () => !lightsOn() || !(BAKED_LIGHT_N > 0 || scene?.userData?.gdLightHook);   // (the light's stand-in where no point light reaches the floor: Low / Very Low, or a build without LOOK's baked light term)
  const roleKind = (role, inc) => inc ? ({ center: K.iCenter, fancy: K.iSparks, outline: K.iOutline, surface: K.surface, f01: K.iF01, f03: K.f03, lglow: K.lglow, exSmoke: K.exSmoke })[role] ?? -1 : K[role];
  // A fire starts here: its slots written once (and its scorches), its light on.
  function startFire(f, g, now) {
    const flames = infernoFlames(boxes() || [], g.x, g.z, g.y, g), fi = fires.indexOf(f), b0 = BASE.fires + fi * PER_FIRE, fired = T(g.firedAt || now), inc = g.kind === 'incendiary', look = inc ? 1 : 0, P = presetName(), Dn = DENSITY[P] || DENSITY.Medium, fake = fakeFloor();
    f.id = g.id; f.g = g; f.flames = flames; f.xm = 0; f.look = look; f.at = now; stats.fires++; mat.uniforms.uLod.value = lodOf(P);
    const tn = now - (g.firedAt || now); f.told = 0; for (let i = 0; i < flames.length; i++) if (tn - flames[i][FL_T] > 300) f.told |= 1 << i;   // (seen late — a join mid-fire: those flames lit long ago, no ignite sound)
    let cx = 0, cy = 0, cz = 0; for (const fl of flames) { cx += fl[FL_X]; cy += fl[FL_Y]; cz += fl[FL_Z]; } const n = flames.length || 1; cx /= n; cy /= n; cz /= n;
    const ox = Number.isFinite(g.x) ? g.x : cx, oz = Number.isFinite(g.z) ? g.z : cz, oy = flames.length ? flames[0][FL_Y] : (g.y || 0); f.cx = cx; f.cy = cy; f.cz = cz;
    let rMax = 1e-3; for (const fl of flames) rMax = Math.max(rMax, Math.hypot(fl[FL_X] - ox, fl[FL_Z] - oz));
    let e0 = Infinity, e1 = -Infinity; for (const fl of flames) { e0 = Math.min(e0, fl[FL_T]); e1 = Math.max(e1, fl[FL_END]); } f.t0 = fired + (Number.isFinite(e0) ? e0 : 0) / 1000; f.t1 = fired + (Number.isFinite(e1) ? e1 : 0) / 1000;
    // per flame: its roles' slots
    for (let i = 0; i < MAX_FLAMES; i++) { const fl = flames[i];
      for (const role of FLAME_ROLES) { const at = b0 + i * PER_FLAME + ROLE_AT[role], k = roleKind(role, inc);
        for (let j = 0; j < CAP[role]; j++) { const idx = at + j;
          if (!fl || k < 0 || j >= Dn[role] || (role === 'lglow' && !fake) || ((role === 'ember' || role === 'glow') && inc)) { off(idx); continue; }
          const t0 = fired + fl[FL_T] / 1000, t1 = fired + fl[FL_END] / 1000, sd = hash(i * 31 + j, ROLE_AT[role] + fl[FL_X] + fl[FL_Z]);
          if (role === 'exSmoke') { put(idx, fl[FL_X], fl[FL_Y], fl[FL_Z], K.exSmoke, 5.5 * HU, fired, fired + 600, sd, look, 1e9, 0, 0); continue; }
          let x = fl[FL_X], z = fl[FL_Z]; const dx = ox - x, dz = oz - z, dl = Math.hypot(dx, dz);
          if (role === 'outline') {   // its edge point: out from the middle (its open side), a flame inside the fire has none
            const e = dl / rMax; if (n > 1 && e < .45) { off(idx); continue; }
            const ang = Math.atan2(-dz, -dx) + (hash(i, j * 7 + 3) - .5) * 2.4, rr = 21 * HU; x += Math.cos(ang) * rr; z += Math.sin(ang) * rr; }
          const emitEnd = SYS[role]?.emitFor ? Math.min(t1, fired + SYS[role].emitFor + 1) : t1;
          put(idx, x, fl[FL_Y], z, k, 1, t0, emitEnd, sd, look, 1e9, ox - x, oz - z); } } }
    // the fire's own: flame01a / flame03a at its middle, the plume over its flames (the molotov's: _00high's)
    for (const role of FIRE_ROLES) { const k = roleKind(role, inc), at = b0 + ROLE_AT[role];
      for (let j = 0; j < CAP[role]; j++) { const idx = at + j; if (k < 0 || j >= Dn[role] || !flames.length || ((role === 'smoke1' || role === 'smoke2') && inc)) { off(idx); continue; }
        const sd = hash(j * 13 + 5, ROLE_AT[role] + ox), s0 = SYS[role].startAt || 0;
        if (role === 'smoke1' || role === 'smoke2') { put(idx, ox, oy + PLUME_Z * HU, oz, k, 1, f.t0 + s0, f.t1 + 1.2, sd, look, 1e9, 0, 0); continue; }   // (one column over the fire's middle, from its parent's height PLUME_Z (ours: _00high has no parent particles in the files))
        put(idx, ox, oy, oz, k, 1, fired, f.t1, sd, look, 1e9, 0, 0); } }
    dirtyAll(b0, PER_FIRE);
    // its scorches (the ring of the last SCORCH_FIRES fires): under each flame, from its start, kept SCORCH_S
    const s0 = BASE.scorch + (scorchNext++ % SCORCH_FIRES) * MAX_FLAMES; for (let i = 0; i < MAX_FLAMES; i++) { const fl = flames[i]; if (!fl) { off(s0 + i); continue; } put(s0 + i, fl[FL_X], fl[FL_Y], fl[FL_Z], K.scorch, 84 * HU * (.8 + .4 * hash(i, 9)), fired + fl[FL_END] / 1000 - 1.5, fired + fl[FL_END] / 1000 + SCORCH_S, hash(i, fl[FL_X]), 0, 1e9, 0, 0); }   // (the scorch only as its flame dies: under burning flames, the glow and embers)
    dirtyAll(s0, MAX_FLAMES); syncCount(); }
  // The host's mask changed: the flames it put out die now (their out-time; the swirl of smoke where each was).
  const maskOf = g => g.phase === 'out' && g.ext ? 0xffff : (+g.xm || 0) >>> 0;   // (put out whole: every flame)
  function smother(f, now) { const g = f.g, b0 = BASE.fires + fires.indexOf(f) * PER_FIRE, tn = T(now), m = maskOf(g); let lo = Infinity, hi = -1;
    for (let i = 0; i < f.flames.length; i++) { if (!((m >>> i) & 1) || ((f.xm >>> i) & 1)) continue;
      for (let l = 0; l < PER_FLAME; l++) { const idx = b0 + i * PER_FLAME + l; AC[idx * 4 + 1] = tn; if (AA[idx * 4 + 3] === K.exSmoke && AB[idx * 4] > 0) { AB[idx * 4 + 1] = tn - .01; AB[idx * 4 + 2] = tn + 1.6; } if (idx < lo) lo = idx; if (idx > hi) hi = idx; }
    }
    if (m === 0xffff || (m & ((1 << f.flames.length) - 1)) === (1 << f.flames.length) - 1) for (let l = MAX_FLAMES * PER_FLAME; l < PER_FIRE; l++) { const idx = b0 + l; AC[idx * 4 + 1] = tn; if (idx < lo) lo = idx; if (idx > hi) hi = idx; }   // (all out: the fire's own parts too)
    f.xm = m; if (hi >= lo) dirtyAll(lo, hi - lo + 1); }
  function endFire(f) { const b0 = BASE.fires + fires.indexOf(f) * PER_FIRE; for (let i = 0; i < PER_FIRE; i++) { AB[(b0 + i) * 4 + 1] = 1e9; AB[(b0 + i) * 4 + 2] = -1e9; } dirtyAll(b0, PER_FIRE); f.id = null; f.g = null; f.flames = null; lights[fires.indexOf(f)].intensity = 0; syncCount(); }
  function syncCount() { let last = -1; for (let i = 0; i < fires.length; i++) if (fires[i].id !== null) last = i; geo.instanceCount = BASE.fires + (last + 1) * PER_FIRE; }
  // A burst (the bottle breaking / the can popping): CS2's explosion children — or, broken inside smoke, the extinguish swirl.
  function burst(g, now) { for (let i = 0; i < seenBurst.length; i++) if (seenBurst[i] === g.id) return; seenBurst[burstSeenI++ % seenBurst.length] = g.id;
    const b0 = BASE.burst + (bursts.next++ % MAX_BURSTS) * BURST_PARTS, inc = g.kind === 'incendiary', look = inc ? 1 : 0, tn = T(g.firedAt || now), air = g.phase === 'out' && g.airburst;
    const fizz = g.phase === 'out' && g.ext && !air, y = (g.y || 0), P = BURST[inc ? 'incendiary' : 'molotov'], D = presetName(), lowK = D === 'Low' || D === 'Very Low' ? .5 : 1;
    let i = 0; if (fizz) { for (; i < 6; i++) put(b0 + i, g.x + Math.cos(i * 2.4) * 10 * HU, y, g.z + Math.sin(i * 2.4) * 10 * HU, K.exSmoke, 5.5 * HU, tn - 1, tn + 1.6, hash(i, g.x), look, tn + i * .05, 0, 0); }
    else for (const [name, cnt] of Object.entries(P)) { const n = Math.ceil(cnt * lowK); for (let j = 0; j < cnt; j++, i++) { if (j >= n) { off(b0 + i); continue; } const delay = name === 'splash' || name === 'iSplash' ? (j >= cnt / 2 ? .1 : 0) : name === 'fb1' && j >= 5 ? (j - 4) * .1 : 0;   // (splash07a's second 4 at 0.1 s; fireball1's 10 a second for 0.15 s)
      put(b0 + i, g.x, y, g.z, K[name], 1, tn + delay, tn + delay + 3, hash(j * 3 + 1, g.x + K[name]), look, 1e9, 0, 0); } }
    for (; i < BURST_PARTS; i++) off(b0 + i);
    dirtyAll(b0, BURST_PARTS); }
  // CS2's pictures (user-assets models.fire, tools/import-cs2-fire.mjs) once loaded: swapped in at a quiet moment (no fire up).
  let pending = null, source = 'builtin';
  if (assets && typeof document !== 'undefined' && typeof fetch === 'function') import('./user-assets.js').then(({ userAssets, userAssetURL }) => userAssets().then(ua => { const F = ua?.models?.fire; if (!F?.atlas || (F.grid && F.grid !== ATLAS.grid)) return;   // (an atlas of the older 8 × 8 layout: our own until the import is run again)
    new THREE.TextureLoader().load(userAssetURL(ua, F.atlas), t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; pending = t; }, undefined, () => {}); })).catch(() => {});
  const swap = () => { if (!pending || mesh.visible || !quiet()) return; const t = pending; pending = null; mat.uniforms.uAtlas.value = t; try { globalThis.__infra?.renderer?.initTexture(t); } catch {} source = 'cs2'; };
  const findFire = id => { for (const f of fires) if (f.id === id) return f; return null; }, freeFire = () => { for (const f of fires) if (f.id === null) return f; return null; };
  const findFly = id => { for (const f of fly) if (f.id === id) return f; return null; };
  const api = {
    mesh, lights, stats,
    // Every frame (arena-nades-view): the match's grenades (the host's state), its time.
    update(list, nowMs = hostNow()) {
      if (!Number.isFinite(base)) base = nowMs - 1000; const tn = T(nowMs); mat.uniforms.uTime.value = tn; let any = false;
      for (const f of fires) f.seen = 0; for (const f of fly) f.seen = 0;
      // 1. the fires already drawn that the host still has; 2. those gone let go of (their slots free); 3. new fires in free
      // slots — none free: it waits (never another's slot: review R3)
      for (let n = 0; n < list.length; n++) { const g = list[n]; if (!isFire(g.kind) || (g.phase !== 'fire' && g.phase !== 'out')) continue; const f = findFire(g.id); if (f) { f.g = g; f.seen = 1; } }
      for (const f of fires) if (f.id !== null && !f.seen) endFire(f);
      stats.waiting = 0;
      for (let n = 0; n < list.length; n++) { const g = list[n]; if (!isFire(g.kind)) continue;
        if (g.phase === 'fire') { let f = findFire(g.id); if (!f) { f = freeFire(); if (!f) { stats.waiting++; continue; } startFire(f, g, nowMs); burst(g, nowMs); f.seen = 1; } any = true; if (maskOf(g) !== f.xm) smother(f, nowMs); }
        else if (g.phase === 'out') { const f = findFire(g.id); if (f) { any = true; if (maskOf(g) !== f.xm) smother(f, nowMs); } else if (g.airburst || g.ext) { burst(g, nowMs); any = true; } }   // (an air burst: its fireball; a molotov that broke in smoke: the extinguish swirl where it broke)
        else if (g.phase === 'air') { const at = drawnAt(g.id); if (!at) continue; let s = findFly(g.id); if (!s) { s = null; for (const q of fly) if (q.id === null) { s = q; break; } if (!s) continue; s.id = g.id; s.look = g.kind === 'incendiary' ? 1 : 0; s.trailAt = 0; s.ti = 0; }
          s.seen = 1; any = true; const b0 = BASE.fly + fly.indexOf(s) * FLY_PARTS, L = s.look;
          if (L) { put(b0, at.x, at.y, at.z, K.rag, 10 * HU, tn - 1, tn + .2, .37, L, 1e9, 16 * HU); put(b0 + 1, at.x, at.y + 1 * HU, at.z, K.spark, 14 * HU, tn - 1, tn + .2, .5, L, 1e9, 0); }
          else { put(b0, at.x, at.y + 2 * HU, at.z, K.rag, 22 * HU, tn - 1, tn + .2, .37, L, 1e9, 30 * HU); put(b0 + 1, at.x, at.y + 4 * HU, at.z, K.ragGlow, 46 * HU, tn - 1, tn + .2, .5, L, 1e9, 0); }
          if (nowMs - s.trailAt > (L ? 150 : 80)) { s.trailAt = nowMs; const k = 2 + (s.ti++ % (FLY_PARTS - 2)), sd = hash(s.ti, k); put(b0 + k, at.x, at.y, at.z, L ? K.smokeTrail : K.trail, L ? 9 * HU : 10 * HU, tn, tn + .8, sd, L, 1e9, 0); }   // (child3's small flames / the can's smoke)
          dirtyAll(b0, FLY_PARTS); } }
      // the lights: at each fire's middle, CS2's reach (300 HU × its curve × its noise 0.6–1), its alpha from that radius, as bright as how much of it burns (ours);
      // a flame lighting: CS2's Inferno.Fire.Ignite (onFlame — arena-nades-view)
      const on = lightsOn();
      for (let i = 0; i < fires.length; i++) { const f = fires[i]; if (f.id === null) continue;
        const g = f.g, t = nowMs - (g.firedAt || nowMs); let lit = 0; if (g.phase === 'fire') for (let j = 0; j < f.flames.length; j++) { const fl = f.flames[j]; if (t >= fl[FL_T] && t < fl[FL_END] && !flameOut(g, j)) { lit++; if (!((f.told >>> j) & 1)) { f.told |= 1 << j; onFlame?.(fl[FL_X], fl[FL_Y], fl[FL_Z], f.look); } } }
        const Lt = lights[i], life = Math.max(.001, f.t1 - f.t0), u = (tn - f.t0) / life, fade = Math.min(1, Math.max(0, u / LIGHT.fadeIn), Math.max(0, (1 - u) / LIGHT.fadeOut));
        const nz = vnoise(tn * LIGHT.nScale * LIGHT.nRate + i * 17.3), k = LIGHT.noise[0] + (LIGHT.noise[1] - LIGHT.noise[0]) * nz;   // (CS2's Perlin noise on the radius: ~36 a second — our reading of scale × offset rate; graphics.js's pool samples it every 200 ms)
        const rHU = LIGHT.core * fade * k, la = Math.min(1, Math.max(0, (rHU - LIGHT.a0) / (LIGHT.a1 - LIGHT.a0)));
        Lt.position.set(f.cx + Math.sin(nowMs / 250 + i) * 1.5 * HU, f.cy + 30 * HU + Math.sin(nowMs / 90 + i) * 2 * HU, f.cz + Math.cos(nowMs / 210 + i) * 1.5 * HU);   // (30 HU up: the lighting's PositionOffset; C_OP_OscillateVector's wander)
        Lt.distance = Math.max(1, LIGHT.mult * rHU) * HU; Lt.intensity = on && lit ? (60 + 140 * lit / MAX_FLAMES) * la : 0; }   // (its reach flickers, as CS2's; its candela ours)
      for (let i = 0; i < fly.length; i++) { const s = fly[i]; if (s.id === null || s.seen) continue; const b0 = BASE.fly + i * FLY_PARTS; AB[b0 * 4 + 2] = AB[(b0 + 1) * 4 + 2] = -1e9; dirtyAll(b0, 2); s.id = null; }
      mesh.visible = any || tn < lastLive(); if (pending) swap(); },
    get source() { return source; },
    // Leaving the match / a new round: every part off, scorches gone.
    clear() { for (let i = 0; i < INSTANCES; i++) { AB[i * 4 + 1] = 1e9; AB[i * 4 + 2] = -1e9; AC[i * 4 + 1] = 1e9; } dirtyAll(0, INSTANCES); for (const f of fires) { f.id = null; f.g = null; f.flames = null; } for (const s of fly) s.id = null; for (const l of lights) l.intensity = 0; seenBurst.fill(null); mesh.visible = false; syncCount(); },
    // CS2's own atlas (tools/import-cs2-fire.mjs), swapped in (a texture uniform: the same program); `fallback`: ours.
    setAtlas(tex) { if (tex) mat.uniforms.uAtlas.value = tex; },
    get atlas() { return mat.uniforms.uAtlas.value; }, fallback, table,
    warmObjects() { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return [m]; },
  };
  if (scene) globalThis.__gdFire = api;   // (tests and the picture run: tests/browser/gd-fire-shots.mjs)
  return api;
  function lastLive() { let e = -1e9; for (let i = BASE.scorch; i < BASE.fires; i++) if (AB[i * 4 + 2] > e) e = AB[i * 4 + 2]; return e; }
}
