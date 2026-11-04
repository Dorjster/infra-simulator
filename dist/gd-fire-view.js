// Global Defensive fire on screen (v53 FIRE, SPEC ADDENDUM 1): every molotov's and incendiary's inferno — and the
// burning bottle / can in flight, the burst, the extinguish and the scorch left after — in ONE instanced draw.
//
// THE RULE. The flames are the host's (arena-nades.js infernoFlames: the same list on every computer from the map, the
// spot, g.id, g.bv and g.mv; g.xm the flames put out). Each flame is drawn as CS2's inferno draws one — the particle
// files in the user's install (particles/inferno_fx, decompiled; the numbers below are theirs unless marked ours):
//  · flame01a (molotov_child_flame01a / incendiary_child_flame01a): two short-lived flame sprites per flame, each reborn
//    every 0.65–1.5 s (its lifetime) with a new random sequence of the flame flipbook (C_INIT_RandomSequence), radius
//    28–45 HU, alpha 0.47–0.59, colour between (244,237,208) and (235,172,95) (C_INIT_RandomColor, the same in both files),
//    shrinking 1.5 → 0.75 (molotov) / growing 0.9 → 1.25 (incendiary) over its life (C_OP_InterpolateRadius). The picture
//    goes through CS2's 1D colour lookup gradient (m_flTextureBlend 0.5: half the texture's colour, half the gradient at its
//    brightness): the molotov's stops reach orange early (0.26), the incendiary's late (0.67, and back to dark at 1.0); then
//    the renderer's desaturation (0.15 / 0.3) and overbright (6 / 3, × our OB_K: our renderer has no HDR bloom pass). The
//    molotov's sprites are added (fire_small_sim_b, ADD); the incendiary's are fire_small_sim_a_v02 in HALF_BLEND_ADD,
//    alpha from its brightness (MIX_RGBA_RGBALPHA), broken up by smoke_wisp_breakup_01_tile_inv SUBTRACTed at 0.1 and
//    zoomed with its age. Those are the "slightly different" looks: the same colours and sizes, a different flipbook, a
//    different gradient, paler, half blended, broken up — and embers vs sparks below.
//  · flame03a (molotov_child_flame03a / incendiary_child_flame03a): one fire-gas sprite per flame over the flames
//    (fire_gas_batch_a_v2), radius 24–55 HU, alpha 0.78–0.98, colour (244,237,208) → (231,215,202), life 0.75–1.5 s,
//    0.8 → 1.25 (1.2); ADD on the molotov (overbright 3), alpha blended on the incendiary (its renderer sets no blend).
//  · fire over the floor (*_groundfire_snapshot_child_base: fire_onsurface, colour white → (85,80,80), overbright 2), a glow
//    on the floor in the light's colour (ours: a stand-in where the pooled lights don't reach), and embers (molotov:
//    molotov_groundfire_child_embers, (157,58,4) → (244,155,0)) or the incendiary's spark filler
//    (incendiary_groundfire_filler_replicator: sparks_burst, (169,163,147) → (240,170,124)).
//  · the thin dark plume (molotov only: molotov_groundfire_00high's molotov_smoking_ground_child02 — smokeloop_i_0, colour
//    (36,36,36) → (8,8,8), alpha 0.39–0.78, life 2–5 s, rising under +20 HU/s² (its m_Gravity), 0.75 → 1.25, ~1 puff a
//    second for the fire: drawn on every 4th flame. The incendiary's files have no smoking child: none). The molotov's
//    plain molotov_groundfire tree has no smoke at all; the spec asks for the plume, so the _00high tree's is used.
//  · put out (by smoke): the flame sinks away in 0.35 s (ours) under CS2's extinguish swirl (extinguish_fire_swirl_smoke:
//    smokeburst_c_slate puffs, colour between white and (37,37,37), alpha 0.157–0.235, life 0.2–1.0 s, radius 5–6 HU
//    growing 6 → 20×, rising under +650 HU/s²): one puff per flame here, two more per flame at the spot it broke for a
//    molotov breaking inside smoke (the burst's parts).
//  · the burst: CS2's fireball (molotov_explosion / incendiary_explosion children, fire_gas_batch_a_v2).
//  · in flight: the molotov's burning rag (weapon_molotov_thrown_child1: fire_burning_character, (222,192,171) → (192,95,0)),
//    its glow (weapon_molotov_thrown_glow: particle_flare_004, (244,244,227) → (231,181,102)) and its trail of small flames
//    (weapon_molotov_thrown_child3: fire_burning_character, (186,186,186) → (129,66,20), radius 9–11 HU, alpha 0.27–0.47,
//    life 0.25–0.5 s, rising +52 HU/s²); the incendiary's white-hot desaturated flame (weapon_incend_thrown:
//    fire_small_sim_b_desat, colour (251,237,176) fading to (252,148,99), life 0.5–0.75 s), its sparks (tile_starfield,
//    (255,255,205)) and its dark smoke trail (explosion_fireball_large_01_smoke, (28,28,30)). No glow on the can (none in
//    its file).
//  · the light: one pooled PointLight per fire slot in CS2's colour (molotov_groundfire_lighting /
//    incendiary_groundfire_lighting: m_LiteralColor (242,211,147), the two files identical), its reach (ours: the file's
//    radius ×2 multiplies a radius the server sends) and flicker ours.
//  · every flame leaves a scorch (materials/decals/molotovscorch) that stays for SCORCH_S.
// Sizes not in the files (the flame sprites' height on the floor, the floor glow, the scorch) are ours, by eye; the rag in
// flight is one sprite for child1's ~40 overlapping 9–11 HU ones (120 a second, 0.25–0.55 s), its glow 20–25 HU.
//
// THE DRAW. One InstancedBufferGeometry quad, one ShaderMaterial (premultiplied alpha: an additive flame writes alpha 0,
// a smoke puff or a scorch writes its coverage, the incendiary's half blend half its coverage — so every part shares the
// one blend), every part an instance: [scorch ring | per fire slot: 16 flames × LAYERS | flight | bursts]. Everything
// moves in the vertex shader from the instance's numbers and uTime (the host's clock, seconds since `base`): a fire's
// instances are written once when it starts (and a flame's out-time when the host's mask says so) — per frame only
// uTime, the bottles in flight (a few instances) and the pooled lights change. No allocation per frame; nothing compiled
// during a round (the mesh is top-level, userData.gd + warm: compiled behind the loading card with the rest). CS2's own
// pictures (an atlas made by tools/import-cs2-fire.mjs into user-assets/fire, never shipped) replace our fallback atlas —
// same layout — at a quiet moment (a texture uniform: the same program).
// SLOTS. MAX_FIRES fire slots (10 players carry one fire grenade each); a fire is drawn in a free slot — when every slot
// holds a fire the host still has, a new one waits for a slot (never steals one: v53 review R3, nine fires restarted
// one every frame). A fire whose slot it lost is gone from the host's list.
// Presets: Low (and Very Low) draw one flame, the fire over the floor and the glow per flame, no embers, gas or plume;
// Medium two flames, one ember, no gas; High and Ultra everything.
import * as THREE from './three.module.js';
import { INFERNO, FIRE, infernoFlames, flameOut, isFire, FL_X, FL_Z, FL_Y, FL_T, FL_END } from './arena-nades.js';

const HU = 2.54 / 16.5;
export const MAX_FIRES = 10, MAX_FLAMES = INFERNO.max, SCORCH_FIRES = 12, MAX_FLY = 8, FLY_PARTS = 6, MAX_BURSTS = 8, BURST_PARTS = 6;
export const SCORCH_S = 45;   // (s a scorch stays: ours — CS2's inferno_scorch_decals are world decals, kept for the round)
export const OB_K = .3;       // (ours: CS2's overbright factors × this — its HDR and bloom pass carry the rest; by eye. A part
// whose file gives no overbright is drawn at our 1.25)
// The parts (kind, aA.w) — and the order a fire slot's block lays them out in (LAYERS: drawn back to front).
export const K = { flame: 0, ground: 1, plume: 2, ember: 3, glow: 4, scorch: 5, rag: 6, ragGlow: 7, burst: 8, spark: 9, trail: 10, exSmoke: 11, gas: 12, smokeTrail: 13 };
export const LAYERS = [K.glow, K.ground, K.flame, K.flame, K.gas, K.ember, K.ember, K.plume, K.exSmoke];
const LN = LAYERS.length, PER_FIRE = MAX_FLAMES * LN;
export const BASE = { scorch: 0, fires: SCORCH_FIRES * MAX_FLAMES, fly: 0, burst: 0 }; BASE.fly = BASE.fires + MAX_FIRES * PER_FIRE; BASE.burst = BASE.fly + MAX_FLY * FLY_PARTS;
export const INSTANCES = BASE.burst + MAX_BURSTS * BURST_PARTS;
// Atlas (1024², 8 × 8 cells of 128): which cells hold what — tools/import-cs2-fire.mjs writes CS2's pictures to the same.
// Flames: 4 sequences × 4 frames each (CS2 picks a random sequence per sprite).
export const ATLAS = { grid: 8, molotov: [0, 16], incendiary: [16, 16], seqs: 4, frames: 4, ground: [32, 8], smoke: [40, 8], sparks: [48, 4], flare: 52, rag: [53, 3], scorch: 56, breakup: 57, plume: 58, fireball: [60, 4] };
// CS2's 1D colour lookup gradients (the flame01a renderers' m_Gradient stops: position, colour).
export const GRAD = {
  molotov: [[0, 0, 0, 0], [.064599, 128, 10, 10], [.170543, 167, 55, 46], [.258398, 210, 92, 29], [.839793, 210, 146, 97], [.945736, 255, 235, 201], [.953488, 255, 241, 218], [1, 255, 255, 255]],   // (molotov_child_flame01a, its drawn renderer)
  incendiary: [[0, 0, 0, 0], [.330749, 128, 10, 10], [.509044, 167, 55, 46], [.669251, 210, 92, 29], [.839793, 210, 146, 97], [.945736, 255, 235, 201], [.953488, 255, 241, 218], [.97416, 255, 255, 255], [1, 9, 0, 0]],   // (incendiary_child_flame01a)
};
// Looks (aC.x 0 / 1): the renderers' numbers.
export const LOOK = {
  molotov: { id: 0, desat: .15, ob: 6, scale: [1.5, .75], half: 0, breakup: 0, gasOb: 3 },   // (molotov_child_flame01a: ADD, desaturation 0.15, overbright 6; flame03a overbright 3)
  incendiary: { id: 1, desat: .3, ob: 3, scale: [.9, 1.25], half: 1, breakup: .1, gasOb: 1 },   // (incendiary_child_flame01a: HALF_BLEND_ADD, 0.3, 3, breakup 0.1)
};
const lookOf = kind => kind === 'incendiary' ? LOOK.incendiary : LOOK.molotov;
// Sizes, game units: CS2's radii where its files give them (flame 45 HU at most, gas 55, plume ~30, extinguish puff 5.5),
// ours for the rest.
const SZ = { glow: 150 * HU, ground: 92 * HU, flame: 45 * HU, gas: 55 * HU, ember: 3.2 * HU, spark: 22 * HU, plume: 30 * HU, exSmoke: 5.5 * HU, scorch: 84 * HU, rag: [22 * HU, 30 * HU], incFlame: [10 * HU, 16 * HU], ragGlow: 46 * HU, trail: 10 * HU, smokeTrail: 9 * HU, canSpark: 14 * HU, burst: 90 * HU };
const glslGrad = (name, S) => `vec3 ${name}(float x){ vec3 c = vec3(${S[0].slice(1).map(v => v.toFixed(1)).join(',')});` + S.slice(1).map((s, i) => ` c = mix(c, vec3(${s.slice(1).map(v => v.toFixed(1)).join(',')}), clamp((x - ${S[i][0].toFixed(6)}) / ${(s[0] - S[i][0]).toFixed(6)}, 0.0, 1.0));`).join('') + ' return c / 255.0; }';
const f3 = v => v.map(x => (+x).toFixed(1)).join(',');

const VS = `
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC;
uniform float uTime;
varying vec2 vUv; varying float vA; varying float vK; varying float vCell; varying float vCell2; varying float vMix; varying vec3 vTint; varying float vLook; varying float vOB; varying float vAge;
const float GROW = ${(FIRE.grow / 1000).toFixed(3)}, FADE = ${(FIRE.fade / 1000).toFixed(3)}, HU = ${HU.toFixed(6)};
vec3 c2(vec3 a){ return a / 255.0; }
float h1(float n){ return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
void main() {
  float k = aA.w, t = uTime, s = aB.x, t0 = aB.y, t1 = aB.z, seed = aB.w, look = aC.x, outT = aC.y, h = aC.z;
  float age = t - t0, life = smoothstep(0.0, GROW, age) * (1.0 - smoothstep(t1 - FADE, t1, t)) * step(0.0, age) * step(t, t1);
  float ex = clamp((t - outT) / 0.35, 0.0, 1.0);
  vec3 p = aA.xyz, R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 RH = normalize(vec3(R.x, 0.0, R.z) + vec3(1e-5, 0.0, 0.0));
  vec2 q = position.xy; vUv = uv; vK = k; vLook = look; vMix = 0.0; vTint = vec3(1.0); vOB = ${(1.25 / OB_K).toFixed(3)}; vAge = 0.0; float a = 0.0, w = s, hh = s, first = 52.0, cell = 0.0, cell2 = -1.0, rot = seed * 6.2832; int mode = 0;   // (mode 0 upright from the floor, 1 facing, 2 on the floor)
  float fl = 0.82 + 0.1 * sin(t * 9.3 + seed * 37.0) + 0.08 * sin(t * 15.7 + seed * 11.0);
  if (k < 0.5 || (k > 11.5 && k < 12.5)) {   // flame01a / flame03a: a sprite reborn every life, a new random one each time
    bool gas = k > 0.5; float L0 = gas ? 0.75 : 0.65, L1 = gas ? 1.5 : 1.5;
    float P = L0 + (L1 - L0) * h1(seed * 91.0), c = age / P + seed * 2.7, u = fract(c), r1 = h1(floor(c) + seed * 173.0);
    float r = s * (gas ? (24.0 + 31.0 * fract(r1 * 7.1)) / 55.0 : (28.0 + 17.0 * fract(r1 * 7.1)) / 45.0);
    float sc = gas ? mix(0.8, look > 0.5 ? 1.2 : 1.25, u) : (look > 0.5 ? mix(${LOOK.incendiary.scale[0].toFixed(2)}, ${LOOK.incendiary.scale[1].toFixed(2)}, u) : mix(${LOOK.molotov.scale[0].toFixed(2)}, ${LOOK.molotov.scale[1].toFixed(2)}, pow(u, 0.8)));
    w = hh = 2.0 * r * sc * (1.0 - 0.85 * ex);
    float al = gas ? 0.784314 + 0.196078 * fract(r1 * 3.7) : 0.470588 + 0.117647 * fract(r1 * 3.7);
    a = life * (1.0 - ex) * al * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.7, 1.0, u));
    float sp = (look > 0.5 ? 5.0 : 8.0) * HU; p.x += (fract(r1 * 17.0) - 0.5) * 2.0 * sp; p.z += (fract(r1 * 23.0) - 0.5) * 2.0 * sp;   // (C_INIT_CreateWithinSphereTransform: 8 / 5 HU)
    float f = u * 3.0, fi = floor(f);
    if (gas) { mode = 1; p.y += hh * 0.35 + u * 20.0 * HU; first = 60.0; cell = first + fi; cell2 = first + min(fi + 1.0, 3.0); vMix = f - fi; vTint = mix(c2(vec3(${f3([244, 237, 208])})), c2(vec3(${f3([231, 215, 202])})), fract(r1 * 9.1)); vOB = look > 0.5 ? 1.0 : ${LOOK.molotov.gasOb.toFixed(1)}; rot = (fract(r1 * 5.3) - 0.5) * 1.5708; }
    else { first = look > 0.5 ? 16.0 : 0.0; float sq = floor(fract(r1 * 13.3) * 3.999); cell = first + sq * 4.0 + fi; cell2 = first + sq * 4.0 + min(fi + 1.0, 3.0); vMix = f - fi; vTint = mix(c2(vec3(${f3([244, 237, 208])})), c2(vec3(${f3([235, 172, 95])})), fract(r1 * 9.1)); vOB = look > 0.5 ? ${LOOK.incendiary.ob.toFixed(1)} : ${LOOK.molotov.ob.toFixed(1)}; vAge = u * P; }
  } else if (k < 1.5) {   // fire over the floor (snapshot_child_base: fire_onsurface, white → (85,80,80), overbright 2)
    mode = 2; float P = 1.3 + seed * 0.6, u = fract(age / P + seed), f = u * 7.0, fi = floor(f); first = 32.0; cell = first + fi; cell2 = first + min(fi + 1.0, 7.0); vMix = f - fi;
    a = life * (1.0 - ex) * (0.6 + 0.4 * sin(u * 3.1416)); vTint = mix(vec3(1.0), c2(vec3(85.0, 80.0, 80.0)), fract(seed * 7.7)); vOB = 2.0;
  } else if (k < 2.5) {   // the plume (molotov_smoking_ground_child02): dark puffs rising off the fire
    mode = 1; float P = 2.0 + 3.0 * fract(seed * 3.1), ph = fract(age / P + seed), tt = ph * P, r2 = h1(floor(age / P + seed) + seed * 37.0);
    p.y += 40.0 * HU + 0.5 * 20.0 * tt * tt * HU + tt * 14.0 * HU; p.x += sin(seed * 40.0 + ph * 2.0) * 10.0 * HU * ph; p.z += cos(seed * 23.0 + ph * 1.7) * 10.0 * HU * ph;
    w = hh = 2.0 * s * mix(0.75, 1.25, ph); a = life * (1.0 - ex) * (0.392157 + 0.392157 * fract(r2 * 5.1)) * smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.55, 1.0, ph));
    first = 58.0; cell = first; vTint = mix(c2(vec3(36.0)), c2(vec3(8.0)), fract(r2 * 3.3)); rot = r2 * 6.2832 + ph * 0.6;
  } else if (k < 3.5) {   // embers rising and drifting, cooling (molotov) / the incendiary's spark filler
    mode = 1; float P = 1.1 + seed * 0.9, ph = fract(age / P + seed * 3.1); p.y += ph * 46.0 * HU; p.x += sin(seed * 50.0 + ph * 3.0) * ph * 9.0 * HU; p.z += cos(seed * 31.0 + ph * 2.0) * ph * 9.0 * HU;
    a = life * (1.0 - ex) * (1.0 - ph) * smoothstep(0.0, 0.08, ph); cell = 52.0; vTint = mix(c2(vec3(157.0, 58.0, 4.0)), c2(vec3(244.0, 155.0, 0.0)), 1.0 - ph) * 2.0;
    if (look > 0.5) { s = ${SZ.spark.toFixed(4)}; w = hh = s; float P2 = 0.5 + seed * 0.4, ph2 = fract(age / P2 + seed * 5.3); cell = 48.0 + floor(ph2 * 3.99); p.y = aA.y + s * 0.3 + ph2 * s * 0.6; a = life * (1.0 - ex) * (1.0 - ph2) * 0.9; vTint = mix(c2(vec3(169.0, 163.0, 147.0)), c2(vec3(240.0, 170.0, 124.0)), ph2) * 1.4; }
  } else if (k < 4.5) {   // the glow on the floor round each flame (ours), in the light's colour (242,211,147)
    mode = 2; a = life * (1.0 - ex) * (0.55 + 0.45 * fl) * 0.2; cell = 52.0; vTint = c2(vec3(242.0, 211.0, 147.0));
  } else if (k < 5.5) {   // a scorch left on the floor (darkens)
    mode = 2; a = 0.8 * smoothstep(0.0, 1.2, age) * (1.0 - smoothstep(t1 - 4.0, t1, t)) * step(0.0, age); cell = 56.0;
  } else if (k < 6.5) {   // in flight: the molotov's burning rag / the incendiary's white-hot desaturated flame
    w = s; hh = h * fl; a = step(0.0, age) * step(t, t1);
    if (look > 0.5) { float f = fract(t * 2.0 + seed) * 15.99; cell = floor(f); cell2 = min(cell + 1.0, 15.0); vMix = fract(f); vTint = mix(c2(vec3(251.0, 237.0, 176.0)), c2(vec3(252.0, 148.0, 99.0)), 0.5 + 0.5 * sin(t * 11.0)); vLook = 2.0; }
    else { float f = fract(t * 4.7 + seed) * 2.99; cell = 53.0 + floor(f); cell2 = 53.0 + min(floor(f) + 1.0, 2.0); vMix = fract(f); vTint = mix(c2(vec3(222.0, 192.0, 171.0)), c2(vec3(192.0, 95.0, 0.0)), 0.35); }
  } else if (k < 7.5) {   // the molotov's glow in flight (weapon_molotov_thrown_glow)
    mode = 1; a = step(0.0, age) * step(t, t1) * (0.6 + 0.4 * fl) * 0.7; cell = 52.0; vTint = mix(c2(vec3(244.0, 244.0, 227.0)), c2(vec3(231.0, 181.0, 102.0)), 0.5);
  } else if (k < 8.5) {   // the burst's fireball
    mode = 1; float u = clamp(age / 0.55, 0.0, 1.0); w = hh = s * (0.35 + 1.1 * sqrt(u)); p.y += s * 0.25 * u; a = step(0.0, age) * (1.0 - u) * (1.0 - u); cell = 60.0 + floor(u * 3.99); vTint = look > 0.5 ? c2(vec3(250.0, 240.0, 220.0)) : c2(vec3(244.0, 200.0, 140.0));
  } else if (k < 9.5) {   // the incendiary's sparks in flight (weapon_incend_thrown: tile_starfield, (255,255,205))
    mode = 1; a = step(0.0, age) * step(t, t1) * (0.5 + 0.5 * fl); cell = 48.0 + floor(fract(t * 9.0 + seed) * 3.99); vTint = c2(vec3(255.0, 255.0, 205.0)) * 1.3; rot = t * 3.0 + seed * 6.0;
  } else if (k < 10.5) {   // the molotov's trail of small flames (weapon_molotov_thrown_child3)
    mode = 1; float L = 0.25 + 0.25 * seed, u = clamp(age / L, 0.0, 1.0); p.y += 0.5 * 52.0 * age * age * HU; w = hh = 2.0 * s * (0.9 + 0.2 * fract(seed * 7.0)); a = step(0.0, age) * step(age, L) * (0.27451 + 0.196078 * fract(seed * 3.3)) * (1.0 - u) * 1.6;
    float f = u * 2.99; cell = 53.0 + floor(f); vTint = mix(c2(vec3(186.0)), c2(vec3(129.0, 66.0, 20.0)), fract(seed * 5.1)) * 1.5;
  } else if (k < 11.5) {   // put out: CS2's extinguish swirl, where the flame was
    mode = 1; float L = 0.2 + 0.8 * fract(seed * 7.0), tt = t - outT, u = clamp(tt / L, 0.0, 1.0); w = hh = 2.0 * s * mix(6.0, 20.0, u); p.y += s * 2.0 + 0.5 * 650.0 * tt * tt * HU * 0.6;
    a = step(outT, t) * step(tt, L) * (0.156863 + 0.078431 * fract(seed * 3.9)) * (1.0 - u * u) * smoothstep(0.0, 0.05, tt); cell = 40.0 + floor(fract(seed * 5.0) * 7.99); vTint = mix(vec3(1.0), c2(vec3(37.0)), fract(seed * 11.3)); rot = seed * 6.2832 + u * 1.2;
  } else {   // the incendiary's dark smoke trail (weapon_incend_thrown: explosion_fireball_large_01_smoke, (28,28,30))
    mode = 1; float L = 0.5 + 0.25 * seed, u = clamp(age / L, 0.0, 1.0); w = hh = 2.0 * s * mix(0.2, 1.5, u); p.y += u * s; a = step(0.0, age) * step(age, L) * 0.5 * (1.0 - u) * smoothstep(0.0, 0.1, u); cell = 40.0 + floor(seed * 7.99); vTint = c2(vec3(28.0, 28.0, 30.0));
  }
  vA = a; vCell = cell; vCell2 = cell2 < 0.0 ? cell : cell2;
  vec3 o; float cr = cos(rot), sr = sin(rot);
  if (mode == 0) o = p + RH * (q.x * w) + vec3(0.0, (q.y + 0.38) * hh, 0.0);   // (upright: its foot a little in the floor, as CS2's sprites sit)
  else if (mode == 1) { vec2 rq = vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr); o = p + (R * rq.x + U * rq.y) * w; }
  else o = p + vec3((q.x * cr - q.y * sr) * w, 0.03, (q.x * sr + q.y * cr) * w);
  if (a <= 0.0) o = p;   // (nothing to draw: a degenerate quad, no fragments)
  gl_Position = projectionMatrix * viewMatrix * vec4(o, 1.0);
}`;
const FS = `
uniform sampler2D uAtlas;
varying vec2 vUv; varying float vA; varying float vK; varying float vCell; varying float vCell2; varying float vMix; varying vec3 vTint; varying float vLook; varying float vOB; varying float vAge;
${glslGrad('gradM', GRAD.molotov)}
${glslGrad('gradI', GRAD.incendiary)}
vec4 cellAt(float c, vec2 q) { float g = ${ATLAS.grid}.0, cx = mod(c, g), cy = floor(c / g); return texture2D(uAtlas, (vec2(cx, g - 1.0 - cy) + clamp(q, 0.01, 0.99)) / g); }
void main() {
  if (vA <= 0.002) discard;
  vec4 tx = cellAt(vCell, vUv); if (vMix > 0.004) tx = mix(tx, cellAt(vCell2, vUv), vMix);
  float k = vK, a = tx.a * vA; const vec3 LUM = vec3(0.299, 0.587, 0.114);
  if (k > 4.5 && k < 5.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, a * (1.0 - 0.5 * dot(tx.rgb, vec3(0.33)))); return; }   // scorch: darkens
  if ((k > 1.5 && k < 2.5) || (k > 10.5 && k < 11.5) || k > 12.5 || (k > 11.5 && vLook > 0.5)) { vec3 c = (k > 1.5 && k < 2.5 ? vec3(dot(tx.rgb, LUM)) : tx.rgb) * vTint; gl_FragColor = vec4(c * a, a); return; }   // smoke (plume, extinguish, the can's trail) and the incendiary's gas: over
  vec3 c = tx.rgb; float hb = 0.0;
  if (k < 0.5) {   // flame01a: CS2's colour lookup, desaturation, the incendiary's breakup
    float L = dot(tx.rgb, LUM); c = mix(tx.rgb, vLook > 0.5 ? gradI(L) : gradM(L), 0.5);
    if (vLook > 0.5) { float z = 1.0 + ${LOOK.incendiary.breakup.toFixed(2)} * vAge, b = cellAt(${ATLAS.breakup}.0, (vUv - 0.5) / z + 0.5).a * ${LOOK.incendiary.breakup.toFixed(2)}; c = max(c - b, 0.0); a = max(tx.a - b, 0.0) * vA; hb = 1.0; }
    c = mix(c, vec3(dot(c, LUM)), vLook > 0.5 ? ${LOOK.incendiary.desat.toFixed(2)} : ${LOOK.molotov.desat.toFixed(2)});
  } else if (k > 5.5 && k < 6.5 && vLook > 1.5) c = vec3(dot(c, LUM));   // (the incendiary's flame in flight: fire_small_sim_b_desat)
  vec3 o = c * vTint * a * vOB * ${OB_K.toFixed(2)}; float m = max(o.r, max(o.g, o.b)); if (m > 1.0) o /= m;   // (overbright keeps its hue, as CS2's tone map does)
  gl_FragColor = vec4(o, a * 0.5 * hb);   // added (alpha 0) — the incendiary's flames half blended (HALF_BLEND_ADD)
}`;

// Our fallback atlas (the same layout as CS2's): flames (4 sequences × 4 frames each: the molotov's thin licking tongues,
// the incendiary's fuller, rounder sim with its alpha from its brightness), fire on the floor, smoke, sparks, a flare,
// the rag's flames, the scorch, the breakup noise, the plume puff and the fireball, drawn once at load. In node (tests):
// a 1×1 picture.
export function fallbackAtlas() {
  if (typeof document === 'undefined' || !document.createElement) { const t = new THREE.DataTexture(new Uint8Array([255, 200, 120, 255]), 1, 1); t.needsUpdate = true; return t; }
  const N = 1024, C = 128, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'); if (!g?.getImageData) { const t = new THREE.DataTexture(new Uint8Array([255, 200, 120, 255]), 1, 1); t.needsUpdate = true; return t; }
  const img = g.createImageData(N, N), D = img.data; let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const NS = 32, nz = new Float32Array(NS * NS); for (let i = 0; i < nz.length; i++) nz[i] = rnd();
  const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = (u, v) => nz[((v % NS + NS) % NS) * NS + ((u % NS + NS) % NS)], sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (a(i, j) * (1 - sx) + a(i + 1, j) * sx) * (1 - sy) + (a(i, j + 1) * (1 - sx) + a(i + 1, j + 1) * sx) * sy; };
  const fbm = (x, y) => noise(x, y) * .55 + noise(x * 2.1, y * 2.1) * .3 + noise(x * 4.3, y * 4.3) * .15;
  const put = (cell, fn) => { const ox = (cell % 8) * C, oy = Math.floor(cell / 8) * C; for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const v = fn((x + .5) / C, 1 - (y + .5) / C), o = ((oy + y) * N + ox + x) * 4; D[o] = v[0]; D[o + 1] = v[1]; D[o + 2] = v[2]; D[o + 3] = v[3]; } };
  // A flame frame: `tongues` licks rising from a base, each its own width and sway, eaten at the edges by noise; the colour
  // hottest low in the middle (the shader's CS2 gradient colours it by brightness). inc: fuller and rounder, its alpha
  // its brightness (CS2's a_v02 has no alpha: MIX_RGBA_RGBALPHA).
  const flame = (sq, f, inc) => { const ph = (f / 4 + sq * .37) * 6.283, T = inc ? [[0, .62, 1]] : [[-.22, .26, .72], [.02, .3, 1], [.25, .24, .8]];
    return (u, v) => { const x = (u - .5) * 2, ti = v - .04; if (ti <= 0) return [0, 0, 0, 0]; let body = 0;
      for (let k = 0; k < T.length; k++) { const [cx, wd, ht] = T[k], tb = ti / (ht * (.78 + .14 * Math.sin(ph + k * 2.1 + sq))), sway = Math.sin(ti * 5 + ph + k * 1.7 + sq * 2) * .12 * ti, turb = (fbm(u * 3.2 + sq * 3.1 + k, v * 2.6 - f * .55) - .5) * .7 * ti;
        const wv = wd * Math.pow(Math.max(0, 1 - tb), inc ? .7 : 1.1) * (inc ? .9 + .25 * Math.sin(ti * 3) : .7 + .5 * Math.sin(ti * 3.4 + .4)), d = Math.abs(x - cx - sway - turb) / Math.max(.02, wv);
        body = Math.max(body, Math.max(0, 1 - d * d) * (tb < 1 ? 1 : 0)); }
      const n = fbm(u * 6 + sq * 5, v * 5 - f * .4 - sq), a = Math.min(1, body * Math.min(1, ti * 8) * (inc ? .55 + .7 * n : .35 + .9 * n * n)), core = Math.max(0, Math.min(1, a * 1.5 - ti * .9));
      const R = 255 * Math.min(1, .35 + a), G = Math.min(255, 70 + 160 * core), B = Math.min(255, 20 + 190 * core * core);
      return inc ? [R * a, G * a, B * a, Math.round(a * (.299 * R + .587 * G + .114 * B))] : [R, G, B, Math.round(255 * a * .8)]; }; };
  for (let sq = 0; sq < 4; sq++) for (let f = 0; f < 4; f++) { put(sq * 4 + f, flame(sq, f, false)); put(16 + sq * 4 + f, flame(sq, f, true)); }
  for (let f = 0; f < 8; f++) put(32 + f, (u, v) => { const d = Math.hypot(u - .5, v - .5) * 2, n = fbm(u * 5 + f * .7, v * 5 - f * .5), a = Math.max(0, 1 - d) * Math.max(0, n * 1.6 - .45); return [255, 170 + 60 * n, 70, Math.round(255 * Math.min(1, a * 1.4))]; });
  for (let f = 0; f < 8; f++) put(40 + f, (u, v) => { const d = Math.hypot(u - .5, v - .5) * 2, n = fbm(u * 3 + f * 1.3, v * 3 + f * .9), a = Math.max(0, 1 - d * d) * (.45 + .55 * n); return [200, 200, 200, Math.round(255 * Math.min(1, a))]; });
  for (let f = 0; f < 4; f++) put(48 + f, (u, v) => { let a = 0; for (let s = 0; s < 9; s++) { const an = s * 2.4 + f, rr = (.1 + .3 * ((s * 7 + f) % 5) / 5) * (1 + f * .25), px = .5 + Math.cos(an) * rr, py = .5 + Math.sin(an) * rr, dd = Math.hypot(u - px, v - py); a = Math.max(a, Math.max(0, 1 - dd / .025)); } return [255, 220, 160, Math.round(255 * a)]; });
  put(52, (u, v) => { const d = Math.hypot(u - .5, v - .5) * 2, a = Math.pow(Math.max(0, 1 - d), 2.2); return [255, 255, 255, Math.round(255 * a)]; });
  for (let f = 0; f < 3; f++) put(53 + f, flame(f, f, false));
  put(56, (u, v) => { const d = Math.hypot(u - .5, v - .5) * 2, n = fbm(u * 6, v * 6), a = Math.max(0, 1 - d * (1.1 - .5 * n)) * (.55 + .45 * n); return [40, 34, 30, Math.round(255 * Math.min(1, a * 1.3))]; });
  put(57, (u, v) => { const n = fbm(u * 8 + 11, v * 8 + 3); return [0, 0, 0, Math.round(255 * Math.min(1, Math.max(0, (n - .3) * 1.8)))]; });   // (the breakup: in its alpha, as CS2's tile_inv)
  put(58, (u, v) => { const d = Math.hypot(u - .5, v - .5) * 2, n = fbm(u * 3.5 + 7, v * 3.5 + 2), a = Math.max(0, 1 - d * d) * Math.max(0, n * 1.5 - .25); return [210, 210, 210, Math.round(255 * Math.min(1, a))]; });
  for (let f = 0; f < 4; f++) put(60 + f, (u, v) => { const d = Math.hypot(u - .5, v - .5) * 2, n = fbm(u * 4 + f, v * 4 - f), a = Math.max(0, 1 - d * d) * (.4 + .6 * n); return [255, 190 + 50 * n, 110 + 80 * n * n, Math.round(255 * Math.min(1, a * 1.2))]; });
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function createFireView({ scene = null, quality = () => 'Medium', hostNow = () => Date.now(), boxes = () => [], drawnAt = () => null, assets = true, quiet = () => true, onFlame = null } = {}) {
  const geo = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1); geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv')); geo.instanceCount = INSTANCES;
  const A = {}; for (const n of ['aA', 'aB', 'aC']) { const a = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCES * 4), 4); a.setUsage(THREE.DynamicDrawUsage); a.gdR = { start: 0, count: 0 }; geo.setAttribute(n, a); A[n] = a; }
  const AA = A.aA.array, AB = A.aB.array, AC = A.aC.array;
  for (let i = 0; i < INSTANCES; i++) { AB[i * 4 + 1] = 1e9; AB[i * 4 + 2] = -1e9; AC[i * 4 + 1] = 1e9; }   // (nothing live: starts in the future, ends in the past)
  const fallback = fallbackAtlas();
  const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uAtlas: { value: fallback } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, side: THREE.DoubleSide, forceSinglePass: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
  mat.userData.shared = true;
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'gd-fire'; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.visible = false; mesh.renderOrder = 3;
  mesh.userData.gd = true; mesh.userData.warm = true; mesh.userData.fx = true; mesh.userData.noPool = true; scene?.add(mesh);
  // The lights: one source per fire slot (graphics.js's pool shows the strongest), off until its fire burns — CS2's colour.
  const LIGHT = 0xf2d393;   // (242,211,147: molotov_groundfire_lighting / incendiary_groundfire_lighting m_LiteralColor)
  const lights = []; for (let i = 0; i < MAX_FIRES; i++) { const l = new THREE.PointLight(LIGHT, 0, 34, 2); l.visible = false; l.userData.gd = true; l.userData.fire = true; lights.push(l); scene?.add(l); }   // (hidden from the start, as graphics.js's scan hides every source: never counted by a shader — the pool's four carry its light)
  let base = NaN; const T = ms => (ms - base) / 1000;   // (seconds since `base` on the host's clock: float precision for hours)
  // Slots (fixed records, no Map): a fire burning or just out; a scorch ring; bottles in flight; bursts.
  const fires = Array.from({ length: MAX_FIRES }, () => ({ id: null, g: null, flames: null, xm: 0, at: 0, seen: 0, cx: 0, cy: 0, cz: 0, look: 0, told: 0 }));
  const fly = Array.from({ length: MAX_FLY }, () => ({ id: null, look: 0, seen: 0, trailAt: 0, ti: 0 })), bursts = { next: 0 }, seenBurst = new Array(32).fill(null); let scorchNext = 0, burstSeenI = 0;
  const stats = { fires: 0, writes: 0, uploads: 0, waiting: 0 };
  function dirty(a, start, count) { const R = a.gdR, U = a.updateRanges; if (U.length !== 1 || U[0] !== R) { U.length = 0; R.start = start; R.count = count; U.push(R); } else { const e = Math.max(R.start + R.count, start + count); R.start = Math.min(R.start, start); R.count = e - R.start; } a.needsUpdate = true; }
  const dirtyAll = (i, n) => { dirty(A.aA, i * 4, n * 4); dirty(A.aB, i * 4, n * 4); dirty(A.aC, i * 4, n * 4); stats.uploads++; };
  function put(i, x, y, z, k, s, t0, t1, seed, look, outT, h) { const o = i * 4; AA[o] = x; AA[o + 1] = y; AA[o + 2] = z; AA[o + 3] = k; AB[o] = s; AB[o + 1] = t0; AB[o + 2] = t1; AB[o + 3] = seed; AC[o] = look; AC[o + 1] = outT; AC[o + 2] = h; AC[o + 3] = 0; stats.writes++; }
  const hash = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const lowQ = () => /low/i.test(String(quality() || '')), midQ = () => String(quality() || '') === 'Medium';
  // A fire starts here: its flames' parts written once (and their scorches), its light on.
  function startFire(f, g, now) {
    const flames = infernoFlames(boxes() || [], g.x, g.z, g.y, g), L = lookOf(g.kind), b0 = BASE.fires + fires.indexOf(f) * PER_FIRE, fired = T(g.firedAt || now), lo = lowQ(), mid = midQ(), inc = L.id === 1;
    f.id = g.id; f.g = g; f.flames = flames; f.xm = 0; f.look = L.id; f.at = now; stats.fires++;
    const tn = now - (g.firedAt || now); f.told = 0; for (let i = 0; i < flames.length; i++) if (tn - flames[i][FL_T] > 300) f.told |= 1 << i;   // (seen late — a join mid-fire: those flames lit long ago, no ignite sound)
    for (let i = 0; i < MAX_FLAMES; i++) for (let l = 0; l < LN; l++) { const idx = b0 + l * MAX_FLAMES + i, fl = flames[i];
      if (!fl) { put(idx, 0, -1e4, 0, LAYERS[l], 0, 1e9, -1e9, 0, L.id, 1e9, 0); continue; }
      const k = LAYERS[l], t0 = fired + fl[FL_T] / 1000, t1 = fired + fl[FL_END] / 1000, sd = hash(i * 7 + l, fl[FL_X] + fl[FL_Z]), jx = (hash(i, l * 3 + 1) - .5) * 30 * HU, jz = (hash(i * 5, l + 2) - .5) * 30 * HU;
      const skip = (lo && (l === 3 || k === K.gas || k === K.ember || k === K.plume)) || (mid && (k === K.gas || l === 6)) || (k === K.plume && (inc || i % 4 !== 0));   // (Low: one flame and the glow; Medium: two flames, one ember; the plume: the molotov's, every 4th flame)
      let s = 0; if (k === K.glow) s = SZ.glow; else if (k === K.ground) s = SZ.ground; else if (k === K.flame) s = SZ.flame; else if (k === K.gas) s = SZ.gas; else if (k === K.ember) s = SZ.ember; else if (k === K.plume) s = SZ.plume; else if (k === K.exSmoke) s = SZ.exSmoke;
      const move = k === K.flame || k === K.ember || k === K.gas;
      put(idx, fl[FL_X] + (move ? jx : 0), fl[FL_Y], fl[FL_Z] + (move ? jz : 0), k, skip ? 0 : s, k === K.exSmoke ? fired : t0, k === K.exSmoke ? fired + 600 : t1, sd, L.id, 1e9, 0); }
    dirtyAll(b0, PER_FIRE);
    // its scorches (the ring of the last SCORCH_FIRES fires): under each flame, from its start, kept SCORCH_S
    const s0 = BASE.scorch + (scorchNext++ % SCORCH_FIRES) * MAX_FLAMES; for (let i = 0; i < MAX_FLAMES; i++) { const fl = flames[i]; if (!fl) { put(s0 + i, 0, -1e4, 0, K.scorch, 0, 1e9, -1e9, 0, 0, 1e9, 0); continue; } put(s0 + i, fl[FL_X], fl[FL_Y], fl[FL_Z], K.scorch, SZ.scorch * (.8 + .4 * hash(i, 9)), fired + fl[FL_T] / 1000 + .4, fired + fl[FL_T] / 1000 + SCORCH_S, hash(i, fl[FL_X]), 0, 1e9, 0); }
    dirtyAll(s0, MAX_FLAMES);
    let cx = 0, cy = 0, cz = 0; for (const fl of flames) { cx += fl[FL_X]; cy += fl[FL_Y]; cz += fl[FL_Z]; } const n = flames.length || 1; f.cx = cx / n; f.cy = cy / n; f.cz = cz / n; }
  // The host's mask changed: the flames it put out die now (their out-time; the swirl of smoke where each was).
  const maskOf = g => g.phase === 'out' && g.ext ? 0xffff : (+g.xm || 0) >>> 0;   // (put out whole: every flame)
  function smother(f, now) { const g = f.g, b0 = BASE.fires + fires.indexOf(f) * PER_FIRE, tn = T(now), m = maskOf(g); let lo = Infinity, hi = -1;
    for (let i = 0; i < f.flames.length; i++) { if (!((m >>> i) & 1) || ((f.xm >>> i) & 1)) continue;
      for (let l = 0; l < LN; l++) { const idx = b0 + l * MAX_FLAMES + i; AC[idx * 4 + 1] = tn; if (LAYERS[l] === K.exSmoke) { AB[idx * 4 + 1] = tn - .01; AB[idx * 4 + 2] = tn + 1.6; } if (idx < lo) lo = idx; if (idx > hi) hi = idx; } }
    f.xm = m; if (hi >= lo) dirtyAll(lo, hi - lo + 1); }
  function endFire(f) { const b0 = BASE.fires + fires.indexOf(f) * PER_FIRE; for (let i = 0; i < PER_FIRE; i++) { AB[(b0 + i) * 4 + 1] = 1e9; AB[(b0 + i) * 4 + 2] = -1e9; } dirtyAll(b0, PER_FIRE); f.id = null; f.g = null; f.flames = null; lights[fires.indexOf(f)].intensity = 0; }
  // A burst (the bottle breaking / the can popping): its fireball parts — or, broken inside smoke, CS2's extinguish swirl.
  function burst(g, now) { for (let i = 0; i < seenBurst.length; i++) if (seenBurst[i] === g.id) return; seenBurst[burstSeenI++ % seenBurst.length] = g.id;
    const b0 = BASE.burst + (bursts.next++ % MAX_BURSTS) * BURST_PARTS, L = lookOf(g.kind), tn = T(g.firedAt || now), air = g.phase === 'out' && g.airburst;
    const fizz = g.phase === 'out' && g.ext && !air;   // (broke inside smoke: no fireball — CS2's extinguish swirl)
    for (let i = 0; i < BURST_PARTS; i++) { const a = i * 2.4, r = (i ? 18 : 0) * HU; put(b0 + i, g.x + Math.cos(a) * r, (g.y || 0) + (air ? 0 : 10 * HU) + (i % 3) * 6 * HU, g.z + Math.sin(a) * r, fizz ? K.exSmoke : K.burst, fizz ? SZ.exSmoke : SZ.burst * (i ? .7 : 1) * (air ? 1.3 : 1), tn + i * .03, tn + (fizz ? 1.6 : .6) + i * .03, hash(i, g.x), L.id, fizz ? tn + i * .05 : 1e9, 0); }
    dirtyAll(b0, BURST_PARTS); }
  // CS2's pictures (user-assets models.fire, tools/import-cs2-fire.mjs) once loaded: swapped in at a quiet moment (no fire up).
  let pending = null, source = 'builtin';
  if (assets && typeof document !== 'undefined' && typeof fetch === 'function') import('./user-assets.js').then(({ userAssets, userAssetURL }) => userAssets().then(ua => { const F = ua?.models?.fire; if (!F?.atlas) return;
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
        else if (g.phase === 'air') { const at = drawnAt(g.id); if (!at) continue; let s = findFly(g.id); if (!s) { s = null; for (const q of fly) if (q.id === null) { s = q; break; } if (!s) continue; s.id = g.id; s.look = lookOf(g.kind).id; s.trailAt = 0; s.ti = 0; }
          s.seen = 1; any = true; const b0 = BASE.fly + fly.indexOf(s) * FLY_PARTS, L = s.look;
          if (L) { put(b0, at.x, at.y, at.z, K.rag, SZ.incFlame[0], tn - 1, tn + .2, .37, L, 1e9, SZ.incFlame[1]); put(b0 + 1, at.x, at.y + 1 * HU, at.z, K.spark, SZ.canSpark, tn - 1, tn + .2, .5, L, 1e9, 0); }
          else { put(b0, at.x, at.y + 2 * HU, at.z, K.rag, SZ.rag[0], tn - 1, tn + .2, .37, L, 1e9, SZ.rag[1]); put(b0 + 1, at.x, at.y + 4 * HU, at.z, K.ragGlow, SZ.ragGlow, tn - 1, tn + .2, .5, L, 1e9, 0); }
          if (nowMs - s.trailAt > (L ? 150 : 80)) { s.trailAt = nowMs; const k = 2 + (s.ti++ % (FLY_PARTS - 2)), sd = hash(s.ti, k); put(b0 + k, at.x, at.y, at.z, L ? K.smokeTrail : K.trail, L ? SZ.smokeTrail : SZ.trail, tn, tn + .8, sd, L, 1e9, 0); }   // (child3's small flames / the can's smoke)
          dirtyAll(b0, FLY_PARTS); } }
      // the lights: at each fire's middle, as bright as how much of it burns, flickering (graphics.js pools them); a flame
      // lighting: CS2's Inferno.Fire.Ignite (onFlame — arena-nades-view)
      for (let i = 0; i < fires.length; i++) { const f = fires[i]; if (f.id === null) continue;
        const g = f.g, t = nowMs - (g.firedAt || nowMs); let lit = 0; if (g.phase === 'fire') for (let j = 0; j < f.flames.length; j++) { const fl = f.flames[j]; if (t >= fl[FL_T] && t < fl[FL_END] && !flameOut(g, j)) { lit++; if (!((f.told >>> j) & 1)) { f.told |= 1 << j; onFlame?.(fl[FL_X], fl[FL_Y], fl[FL_Z], f.look); } } }
        const L = lights[i]; L.position.set(f.cx, f.cy + 30 * HU, f.cz); L.intensity = lit ? (2 + 4 * lit / MAX_FLAMES) * (.8 + .12 * Math.sin(nowMs / 61 + i) + .08 * Math.sin(nowMs / 23 + i * 3)) : 0; }
      for (let i = 0; i < fly.length; i++) { const s = fly[i]; if (s.id === null || s.seen) continue; const b0 = BASE.fly + i * FLY_PARTS; AB[b0 * 4 + 2] = AB[(b0 + 1) * 4 + 2] = -1e9; dirtyAll(b0, 2); s.id = null; }
      mesh.visible = any || tn < lastLive(); if (pending) swap(); },
    get source() { return source; },
    // Leaving the match / a new round: every part off, scorches gone.
    clear() { for (let i = 0; i < INSTANCES; i++) { AB[i * 4 + 1] = 1e9; AB[i * 4 + 2] = -1e9; AC[i * 4 + 1] = 1e9; } dirtyAll(0, INSTANCES); for (const f of fires) { f.id = null; f.g = null; f.flames = null; } for (const s of fly) s.id = null; for (const l of lights) l.intensity = 0; seenBurst.fill(null); mesh.visible = false; },
    // CS2's own atlas (tools/import-cs2-fire.mjs), swapped in (a texture uniform: the same program); `fallback`: ours.
    setAtlas(tex) { if (tex) mat.uniforms.uAtlas.value = tex; },
    get atlas() { return mat.uniforms.uAtlas.value; }, fallback,
    warmObjects() { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return [m]; },
  };
  if (scene) globalThis.__gdFire = api;   // (tests and the picture run: tests/browser/gd-fire-shots.mjs)
  return api;
  function lastLive() { let e = -1e9; for (let i = BASE.scorch; i < BASE.fires; i++) if (AB[i * 4 + 2] > e) e = AB[i * 4 + 2]; for (let i = BASE.burst; i < INSTANCES; i++) if (AB[i * 4 + 2] > e) e = AB[i * 4 + 2]; return e; }
}
