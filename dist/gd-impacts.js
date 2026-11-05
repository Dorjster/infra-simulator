// Global Defensive bullet impacts on the map, as CS2 draws them (v53 stage 5, ADDENDUM 6, ADDENDUM 11): where a bullet
// stops on (or enters, or leaves) a wall, floor, door or crate, that surface's CS2 impact effect plays — sparks on
// metal, dust and chips on concrete and plaster, chips and splinters on wood, shards on glass, puffs on sand and dirt —
// and its bullet hole stays as a decal. A helmeted headshot adds CS2's helmet-impact children that stage 3 left out
// (DINK_EXTRA).
//
// THE RULE: surface → effect. The surface is CS2's surface property (gd-surface-props.js: a CS2 map's own per stretch, a
// door's or breakable's model, else the built-in maps' material); its `effect` (surfaceproperties_impact_effects.txt,
// inherited through `base`) picks the emitter set (EFFECT_OF): impact_metal / _grate / _vent → metal, impact_concrete →
// concrete, impact_plaster → plaster, impact_tile → tile, impact_wood → wood, impact_glass → glass, impact_dirt /
// _grass → dirt. Its `decal` group (Impact.Concrete…) picks the hole and its size (DECAL_SIZE: the group's first
// material's DecalWorldWidth / DecalSizeVariance). Flesh is not here: a body hit is the host's blood record (gd-blood.js).
// CS2's cheap fallback: past a system's m_nFallbackMaxCount live copies (impact_metal: 15) a new metal impact plays
// impact_metal_cheap.vpcf instead (FALLBACK) — a long spray on a metal wall thins out as CS2's does.
//
// THE NUMBERS: each emitter below is one CS2 particle system (particles/impact_fx/*.vpcf in the user's install, decompiled
// with Source2Viewer-CLI) and tests/gd-impacts.mjs reads every field back from the install: its count
// (InstantaneousEmitter, or per detail level: PF_TYPE_PARTICLE_DETAIL_LEVEL LOD0–3 = our Low / Medium / High / Ultra; a
// count control point 6 drives — the surface's distance remap, CP6_OF — is that remap at the hit's distance), the start sphere
// and the speeds in the impact's frame (CreateWithinSphereTransform / VelocityRandom local speeds and sphere speed,
// vecDistanceBiasAbs z = out of the surface only; InitialVelocityNoise as a uniform draw; local z = the surface normal,
// or the reflected bullet for the systems that read control point 1), lifetime (and its EXPONENTIAL bias), radius (and
// a remap's output range), alpha, colours (RandomColor min / max — its default min is white — × the renderer's
// vecColorScale × the texture's own mean tint, measured from the install's .vtex: `tex`), gravity, drag, the
// InterpolateRadius curve (start / end scale, flBias, flStartTime), the FadeOut share, the drawn renderer's overbright,
// self-illumination, diffuse share, trail cap, length fade-in (flLengthFadeInTime: a spark's streak grows from nothing
// over it, so a 30 ms spark is a short streak), head / tail alpha and screen cap (flMaxSize), and its second renderer:
// a halo (`h`) — the glow CS2 draws in its effects-bloom pass (bOnlyRenderInEffectsBloomPass: the orange glow around
// the white-hot metal sparks, gradient (238,222,172) → (247,198,114) ×5) or a second drawn sprite (the embers' orange
// aircraft_hot halo), in the same particle. A bloom-pass halo shows BLOOM_K of its light (our stand-in for CS2's bloom
// blur, which spreads it: never under uHaloPx pixels wide) on every preset.
// Engine rules CS2's code does not ship (Source 1's particle code, which CS2's operators come from — said so in
// UPDATE-v53.0.md): BasicMovement's fDrag keeps (1 − fDrag) of the speed per 1/30 s (ExponentialDecayIntegral); the
// InterpolateRadius flBias is Source's Bias(t, b) = t^(ln b / ln .5); a RenderTrails streak is speed × the trail-length
// field (default .1 s), capped by m_flMaxLength, × min(age / flLengthFadeInTime, 1); a trail whose previous point is a
// control point (nPrevPntSource 17 = CP0's position) is drawn from the hit point to the particle. Our own, marked so:
// the EXPONENTIAL random bias p ∈ (−1, 1) as u^((1 − p) / (1 + p)) (linear at 0, toward the minimum below it).
// Left out (said in UPDATE-v53.0.md): CS2's model flecks are drawn as flat chips; contrast shadows, depth feathering,
// self-shadowing of smoke, ColorInterpolate with a start after its end and a trail's least length (flMinLength); CS2's
// WorldTraceConstraint collides with the world every frame — here a particle that has it lands on the floor under the hit
// and bounces once (landing()), and (v53 DETAILS) ends where its flight first enters a wall or a ceiling (wallCut: CS2
// bounces it there; ledges between the hit and the floor are walls to it too); the textures' animated frames (each kind
// has one procedural shape of ours: a tapered streak, a soft round glow, a chip, a puff); LEFT_OUT lists each
// surface's CS2 children not drawn.
//
// THE ENGINE (any stutter is a bug): three pools made once — ADD_N additive particles (sparks, flares, flashes: ONE
// draw), ALPHA_N alpha particles (dust, smoke, chips, streaks: ONE draw) and DECAL_N holes (ONE draw), recycled oldest
// first. Particles fly on the GPU (start, velocity, birth, drag, gravity: the vertex shader moves them; a frame writes one
// uniform). An impact writes its particles into the pools' arrays and uploads only those slots; nothing is allocated per
// shot or per frame (the pending ring of impacts waiting for their bullet to arrive is a fixed typed array). All three
// materials start in the warm-ups (userData.warm, as gd-blood). Low detail draws CS2's LOD0 counts. The dust, chips
// and holes are lit by the map's baked light at the hit (lightAt: map-light.js, as the agents — cs2-agents.js), the
// sparks are self-lit as CS2's.
// v53 HITS (H5, the CS2 feel audit): impact_concrete's ricochet_sparks_sparse drawn at its full 1 HU width with the soft
// effects/spark.vtex profile in its warm (195,184,166) tint (short glints: the length fades in over .1 s, 20 HU at most);
// impact_concrete_child_smoke's radius × its flOpStrength rnd(1..2); control point 6 — the distance remap each surface's
// parent system sets itself (C_OP_DistanceBetweenCPsToCP: CP6_OF, v53 HITS final) — drives the children's counts and
// their alpha / life / radius curves (CV) on concrete, plaster, glass and dirt, and impact_fx_hit_darken's own. The spark colours stay the files' near-white cream cores and
// their (238,222,172) → (247,198,114) bloom (open-B #17: ADDENDUM 11's "deeper orange" is not in the files).
// Everyone sees the same impacts: your own shots from your trace; another player's from the trace of their shot record
// (lab.js traceRemote — from the same eye, look and seed the host uses), seeded by the hit point.
import { gdPresetNow } from './gd-preset.js';   // (v53 stage 6: the preset's decal cap)
import * as THREE from './three.module.js';
import { HU } from './weapons-data.js';
import { surfaceOf } from './gd-surface-props.js';
import { listenerPos } from './spatial-audio.js';   // (v53 HITS: the eye — control point 6's distance)

export const ADD_N = 1024, ALPHA_N = 512, DECAL_N = 128, PEND_N = 64, MAX_HIT = 128;
// Particle kinds: 0 a spark trail (additive) · 1 a flare / flash sprite (additive) · 2 a chip (alpha) · 3 a puff of
// dust or smoke (alpha) · 4 a debris streak (alpha trail).
export const K = { trail: 0, glow: 1, chip: 2, puff: 3, streak: 4 };
const ADDITIVE = k => k <= 1;
// ── v53 HITS (3rd run): the radius curves (rc) — C_OP_SetFloat on the radius (its default output field: ours, the files
// omit it) with a PF_MAP_TYPE_CURVE of the particle's age. 'add' (PARTICLE_SET_ADD_TO_INITIAL_VALUE, age in s):
// impact_concrete_child_base / impact_glass_base / impact_plaster_base (0,0) (.164,10.908) (1,19.15) HU; impact_glass_dust /
// impact_plaster_smoke (0,0) (.749,14.908) (2,44.723); impact_dirt_child_smoke_puff (0,0) (.775,15.635) (2,44.723).
// 'scale' (SCALE_INITIAL_VALUE): impact_dirt_child_smoke, age in s, (0,.1) (.141,1.131) (.364,2.678) (.5,3) — drawn
// through (0,.1) (.364,2.678) (.5,3). The keys are joined linearly (the files' tangents are not modelled) and held
// after the last key. These are what makes CS2's concrete / plaster / dirt puff swell to 20–45 HU; before, the base
// and the puffs kept their initial 3–12 HU radius (the "no puff" of the feel audit). Read back by tests/gd-impacts.mjs.
export const RC = { base: [0, .164, 10.908, 1, 19.15], smoke: [0, .749, 14.908, 2, 44.723], puff: [0, .775, 15.635, 2, 44.723], dirt: [.1, .364, 2.678, .5, 3] };
const RC_ID = { base: 1, smoke: 2, puff: 3, dirt: 4 };
// A bloom-pass renderer's share of light in our halo, and the halo's least width in pixels (CS2's bloom blur): ours.
// (A spark's bright line is SPARK_CORE = .3 of its trail's width: sparks/sparks.vtex's frames, measured — the line is
// 40 % of the narrow frames' width and 15–20 % of the wide ones'; the glow fills the rest.)
export const BLOOM_K = .35, HALO_PX = 3;   // (v53 MAP fix: .15 hid most of CS2's orange bloom glow — the reviewers' look sheet)

// ── CS2's emitters (HU, s; local z along the axis: the normal, or the reflected bullet when cp: 1) ────────────────────
// n [min, max] (random) and/or lod [LOD0..3] (added); cpn: the count is control point 6's (n: its remap's maximum) ·
// pos [r0, r1] start sphere (hemi: out of the surface only) · lmin / lmax local speed · sph sphere speed [min, max] ·
// nmin / nmax InitialVelocityNoise (ncp: its frame) · off / offp offset along z (HU / × the radius) · life (lb: its
// EXPONENTIAL bias) · r radius (rl: a remap of life [in0, in1, out0, out1]) × rs, the renderer's radius scale · grow
// [start, end] InterpolateRadius (rb its bias, rst its start time) · a alpha × as · c0 / c1 colour (sRGB) × cs (the
// renderer's colour) × tex (the texture's mean tint) · ob overbright, si self-illumination, dif diffuse share (lit) ·
// g gravity (HU/s²) · drag (fDrag) · tt trail time (field 10; 'cp': from the hit point) · tmax / tmin trail cap / least
// length (HU) · tin length fade-in (s) · ha / ta head / tail alpha · fade: the share of life faded at the end (FadeOut:
// .25 by default; its min / max time averaged) · fin fade-in share · spin (°/s) · smax screen cap (flMaxSize) · h the
// halo: c0 → c1 over life (a gradient's ends), a, ob, si, rs, tex, bloom (a bloom-pass renderer), raw (the colours
// are not gamma-corrected: bGammaCorrectVertexColors false) · wtc [bounce, slide, stop speed (HU/s; −1 none)]: the
// system's C_OP_WorldTraceConstraint (m_flBounceAmount, m_flSlideAmount, m_flStopSpeed) — it lands on the floor
// under the hit and bounces once (landing(), below); a field CS2 remaps from the particle's radius or life is that remap
// at the emitter's radius and life (clamped: impact_concrete / _glass / _plaster_high's flecks, radius .75–1.5 over the
// remap's .25–.7 → bounce .15, life ≥ 1 → slide .3), impact_tile's (from a particle field we cannot read, and its stop
// speed by age 2→90) their outputs' middles · dev: where we differ from the file, and why.
const W = [255, 255, 255];
const SPARK_TEX = [217, 217, 217], SPARK2_TEX = [195, 184, 166], HOT_TEX = [155, 116, 86], SLATE_TEX = [78, 78, 78], LOOP_SC_TEX = [152, 152, 152], LOOP_G_TEX = [104, 104, 104], SMOKEGREN_TEX = [217, 217, 217], BURST_E_TEX = [84, 84, 84], FLEKS_TEX = [154, 154, 161];
// (each texture's mean colour, weighted by its alpha and brightness: sparks/sparks.vtex, effects/spark.vtex,
// particle_flares/aircraft_hot, smokeburst_c_slate, smokeloop_i_0_sc, smokeloop_g_1, particle_smokegrenade, smokeburst_e,
// impact/fleks — decompiled from the user's install; glow_simple_01, wispy_steam_set: white)
const FLASH = { src: 'impact_light_flash', k: K.glow, n: [1, 1], life: [.05, .05], r: [.5, 1.5], grow: [0, 1], rb: .7, a: [1, 1], c0: [231, 205, 182], c1: [231, 205, 182], ob: 50, si: .2, dif: 2, fade: 0, smax: .02 };
const DARKEN = { src: 'impact_fx_hit_darken', k: K.puff, n: [2, 2], cpn: 1, c6: { own: 1, n: [0, 1, 2, 1], nb: -.955, a: 'darkA', life: 'darkL' }, lmin: [0, 0, 20], lmax: [0, 0, 50], life: [.5, 1], r: [1, 1], grow: [5, 2], rb: .65, a: [.5, 1], c0: [190, 190, 190], c1: W, cs: [33, 27, 27], tex: HOT_TEX, dif: .1, drag: .17, fade: .9, smax: .008, dev: { speed: 'MaxVelocity 1: it barely moves (its speeds are kept, the drag stops it)', cp6: 'its own CP6 (the local player\'s distance, CP6_DARKEN): count 2 → 1, alpha and life curves (v53 HITS final)' } };
export const FX = {
  metal: [   // impact_metal.vpcf and its children (the single sprites first: a per-hit cap never cuts them)
    { src: 'impact_metal_child_glow', k: K.glow, n: [1, 1], off: .25, life: [.1, .125], r: [.5, 1], grow: [5, 2], rb: .8, a: [1, 1], c0: [255, 254, 220], c1: [255, 254, 220], ob: 4, si: 2, fade: .25, smax: .01,
      h: { c0: [251, 230, 125], c1: [251, 230, 125], a: 1, ob: 6, si: 2, rs: 1.5, bloom: 1 } },   // (halo rs: its flMaxSize .015 / .01)
    FLASH,
    { src: 'impact_metal_child_base', k: K.puff, n: [1, 1], lmin: [0, 0, 50], lmax: [0, 0, 50], offp: .5, life: [.2, .25], r: [7, 12], grow: [.25, 2], a: [.251, .502], c0: [180, 180, 180], c1: [87, 87, 87], tex: SMOKEGREN_TEX, fade: 1, drag: .1, spin: 2 },
    { src: 'impact_metal_child_smoke', k: K.puff, n: [1, 3], lmin: [-125, -125, 100], lmax: [125, 125, 200], life: [.5, 1], r: [8, 15], grow: [.5, 2], rb: .9, a: [.3137, .549], tex: SLATE_TEX, ob: 2, si: 1, fade: .625, fin: .25, g: -25, drag: .5 },
    DARKEN,
    { src: 'impact_metal', k: K.trail, n: [8, 32], pos: [0, 1], hemi: 1, lmin: [-200, -200, 50], lmax: [200, 200, 250], sph: [0, 250], ncp: 1, nmin: [0, 0, 0], nmax: [0, 0, 500], life: [.025, .2], lb: -.368421, r: [.15, .5], a: [.502, 1], c0: W, c1: [255, 239, 169], tex: SPARK_TEX, g: -300, drag: .25, tt: [.01, .15], tmax: 32, tin: .1, fade: 0,
      h: { c0: [238, 222, 172], c1: [247, 198, 114], a: .5, ob: 5, rs: 2, bloom: 1 } },
    { src: 'ricochet_sparks_dir', k: K.trail, cp: 1, n: [4, 16], pos: [.5, 1.25], hemi: 1, sph: [0, 5], nmin: [-150, -150, 50], nmax: [150, 150, 250], life: [.01, 2], r: [.15, 1.5], grow: [1, 0], rb: .25, a: [1, 1], c0: [251, 241, 194], c1: [255, 238, 195], tex: SPARK_TEX, g: -450, drag: .075, tt: [.01, .05], tmax: 64, tin: .1, fade: 0, wtc: [.5, .2, 32],
      h: { c0: [252, 244, 194], c1: [252, 244, 194], a: .15, ob: 2, si: 2, rs: .75, bloom: 1 }, dev: { colour: 'head (251,241,194) / tail (255,238,195): drawn as a random one of the two' } },
    { src: 'ricochet_sparks', k: K.trail, cp: 1, n: [5, 10], lod: [3, 5, 8, 10], lmin: [-400, -400, 100], lmax: [400, 400, 300], life: [.025, .1], r: [.1, .2], grow: [1, 0], rb: .25, a: [1, 1], c0: [255, 248, 220], c1: [250, 252, 215], cs: [251, 251, 189], ob: 4, drag: .7, tt: 'cp', tmax: 64, fade: 0,
      h: { c0: [122, 139, 0], c1: [166, 216, 235], cs: [251, 251, 189], a: 1, ob: 6, si: 3, rs: 2, bloom: 1, raw: 1 }, dev: { colour: 'the head / tail colours drawn as a random one of the two; the halo head → tail over life' } },
    { src: 'ricochet_sparks_dots', k: K.glow, cp: 1, n: [2, 10], lod: [5, 15, 20, 30], lmin: [-50, -50, 65], lmax: [50, 50, 250], off: 1, life: [.05, .6], r: [.1, .222], grow: [1, 0], rb: .3, rst: .5, a: [1, 1], g: -250, drag: .1, fade: 0, wtc: [.5, .2, 4], wtcAge: [0, 2, 4, 200],
      h: { c0: [250, 249, 207], c1: [237, 227, 88], a: [.1, .15], ob: 4, rs: [7, 12], tex: HOT_TEX }, dev: { halo: 'its gradient\'s .19 → .83 stops (229 grey at .08, (226,173,0) at 1 left out)' } }],
  concrete: [   // impact_concrete.vpcf
    { src: 'impact_concrete_child_base', k: K.puff, rc: 'base', n: [1, 1], lmin: [0, 0, 100], lmax: [0, 0, 140], life: [.5, 1], r: [4, 12], a: [.188, .251], c0: [169, 177, 182], c1: [236, 240, 245], ob: 1.5, fade: 1, drag: .2, spin: 2, c6: { a: 'baseA', life: 'baseL' }, dev: { cp6: 'life and alpha × control point 6\'s curves (CP6_OF, CV below: v53 HITS final)', radius: 'a remap [.5, 3] → [12, 4] of a particle float we cannot read: drawn uniformly in its output range' } },
    DARKEN,
    { src: 'impact_concrete_child_smoke', k: K.puff, n: [4, 4], cpn: 1, c6: { n: [0, 1, 4, 1], a: 'smokeA', life: 'smokeL' }, rsr: [1, 2], lmin: [-65, -65, 50], lmax: [65, 65, 125], life: [.75, 1.5], rl: [.75, 1.5, 3, 6], rs: 1.2, grow: [1, 4], rb: .68, a: [.157, .627], c0: [169, 177, 182], c1: [205, 209, 213], cs: [237, 237, 237], tex: LOOP_SC_TEX, ob: 1.4, fade: .65, g: -60, drag: .17, spin: 1, dev: { grow: 'SetFloat radius × a curve of PARTICLE_AGE_NORMALIZED (0,1) (.264,2.43) (1,4): ×1 → ×4, Bias .68 through the middle key (v53 HITS 3rd run; it was read as growing from nothing — the frame op, field 38, is the 0 → 1 one)', rsr: 'its radius InitFloat\'s flOpStrength rnd(1..2): read as a ×1–2 scale of the remapped radius (ours)', cp6: 'count 4 → 1 over CP6 0 → 1 (far → near), alpha and life × CP6\'s curves' } },
    { src: 'impact_concrete', k: K.chip, lod: [0, 3, 4, 6], pos: [0, 1], lmin: [-100, -100, 50], lmax: [100, 100, 350], life: [1, 1], r: [.75, 1.5], a: [1, 1], c0: [105, 105, 105], c1: [215, 230, 234], g: -500, fade: .25, spin: 1719, wtc: [.15, .3, 24], dev: { look: 'flecks3.vmdl models drawn as flat chips; life: the default 1 s' } },
    { src: 'ricochet_sparks_sparse', k: K.trail, n: [2, 2], lmin: [-500, -500, 250], lmax: [500, 500, 500], life: [.01, .2], r: [.5, .5], core: 1, a: [1, 1], tex: SPARK2_TEX, g: -450, drag: .5, tt: [.1, .1], tmax: 20, tin: .1, fade: 0, dev: { radius: 'its system\'s constant radius .5', trail: 'the trail field left at the engine default .1 s', core: 'effects/spark.vtex is a soft glint across its full width (1 HU), not sparks.vtex\'s thin bright line: drawn full width (v53 HITS, H5)' } },
    { src: 'impact_generic_burst_2', k: K.streak, lod: [1, 1, 2, 2], hemi: 1, lmin: [0, 0, 150], lmax: [0, 0, 185], life: [.25, .5], r: [1.5, 2], grow: [1, 3], rb: .75, a: [.196, .314], as: .5, c0: [150, 146, 140], c1: [150, 146, 140], tt: 'cp', tmax: 128, tmin: 15, ha: 0, ta: 1, drag: .2, fade: .85, c6: { life: 'b2L', r: 'b2R' },
      h: { c0: [32, 27, 27], tex: LOOP_G_TEX, a: 1, rs: 1.4 }, dev: { cp6: 'life and radius × control point 6\'s curves: near, its longest life and half its far width', colour: 'particle_debris_burst_002 would not decompile: its tint is ours (150,146,140)', halo: 'its second trail, the dark smoke streak (32,27,27), in the same particle' } }],
  plaster: [   // impact_plaster.vpcf → impact_plaster_high.vpcf and its children
    { src: 'impact_plaster_flash', k: K.glow, n: [1, 1], life: [.075, .075], r: [4, 8], grow: [1, 0], rb: .1, rst: .5, a: [.0627, .1255], as: .75, c0: [255, 223, 191], c1: [255, 223, 191], ob: 2, fade: 0, smax: .05,
      h: { c0: [255, 223, 191], c1: [255, 223, 191], a: .5, rs: 1, bloom: 1 } },
    { src: 'impact_plaster_base', k: K.puff, rc: 'base', n: [1, 1], c6: { a: 'smokeA', life: 'smokeL' }, lmin: [0, 0, 100], lmax: [0, 0, 140], life: [1, 3], r: [4, 12], a: [.188, .251], c0: [192, 188, 185], c1: [255, 251, 247], tex: LOOP_SC_TEX, ob: 1.5, si: .125, fade: 1, g: -100, drag: .125, spin: 1, smax: .5, dev: { radius: 'a remap [.5, 3] → [12, 4] of a particle float: its output range', colour: 'InheritFromParentParticles: the flecks\' colour' } },
    DARKEN,
    { src: 'impact_plaster_smoke', k: K.puff, rc: 'smoke', n: [2, 2], cpn: 1, c6: { n: [.5, 1, 1, 2], a: 'smokeA', life: 'smokeL' }, off: 6, lmin: [-65, -65, 50], lmax: [65, 65, 125], life: [.75, 1.5], r: [3, 8], lb: -.052632, a: [.3765, .6275], c0: [192, 188, 185], c1: [255, 251, 247], tex: LOOP_SC_TEX, si: .125, fade: 1, g: -60, drag: .15, spin: 1, smax: .75, dev: { radius: 'its EXPONENTIAL bias on the radius is drawn on the life', colour: 'the flecks\' colour (inherited)', off: 'PositionOffset 2–10: its middle' } },
    { src: 'impact_plaster_high', k: K.chip, lod: [0, 3, 4, 6], pos: [0, 1], lmin: [-100, -100, 25], lmax: [100, 100, 150], life: [1, 2], r: [.75, 1.5], a: [1, 1], c0: [192, 188, 185], c1: [255, 251, 247], g: -500, fade: .25, spin: 30, wtc: [.15, .3, 24], dev: { speed: 'VelocityRandom max is control point 0\'s components (set by the game): impact_glass\'s (100, 100, 150)', look: 'flecks3 models as flat chips' } },
    { src: 'impact_plaster_dots', k: K.chip, lod: [0, 10, 20, 30], pos: [0, 1], lmin: [-100, -100, 25], lmax: [100, 100, 150], life: [.05, 1], r: [.2, .4], lb: -.052632, rs: 2, grow: [1, 0], rb: .3, rst: .5, a: [1, 1], c0: [192, 188, 185], c1: [255, 251, 247], cs: [207, 207, 207], tex: FLEKS_TEX, ob: .75, g: -500, fade: 0, spin: 30, dev: { speed: 'as impact_plaster_high', colour: 'the flecks\' (inherited)' } },
    { src: 'impact_plaster_burst', k: K.streak, n: [1, 1], hemi: 1, lmin: [-25, 25, 250], lmax: [25, -25, 275], life: [.25, .375], r: [1.5, 2], grow: [1, 3], rb: .75, a: [.8745, 1], c0: [192, 188, 185], c1: [255, 251, 247], tex: LOOP_SC_TEX, si: .125, g: -50, drag: .2, tt: 'cp', tmax: 128, ha: 1, ta: 0, fade: 1, dev: { colour: 'the flecks\' (inherited)' } }],
  tile: [   // impact_tile.vpcf
    FLASH,
    { src: 'impact_tile_child_base', k: K.puff, n: [1, 1], lmin: [0, 0, 50], lmax: [0, 0, 50], offp: .5, life: [.15, .25], r: [4, 8], rs: 2, grow: [.25, 2], a: [.353, .745], c0: [195, 195, 195], c1: [84, 84, 84], tex: SMOKEGREN_TEX, fade: 1, drag: .1, spin: 2 },
    { src: 'impact_tile_child_smoke', k: K.puff, n: [1, 1], lmin: [-90, -90, 30], lmax: [90, 90, 250], life: [1, 2], r: [5, 8], grow: [.25, 2.5], rb: .75, a: [.282, .392], c0: [195, 195, 195], c1: [84, 84, 84], tex: LOOP_SC_TEX, dif: 1.5, fade: .5, drag: .38, spin: 2 },
    DARKEN,
    { src: 'impact_tile', k: K.chip, n: [8, 8], pos: [0, 2], hemi: 1, lmin: [-75, -75, 25], lmax: [75, 75, 150], life: [2, 2], r: [.35, 1], a: [1, 1], c0: [232, 232, 232], c1: [179, 179, 179], g: -500, drag: .01, fade: .25, spin: 180, wtc: [.35, .15, 32], dev: { radius: 'a remap of its speed [50, 150] → [1, .35]: its output range' } },
    { src: 'impact_generic_burst', k: K.streak, n: [1, 3], hemi: 1, off: 1.5, lmin: [0, 0, 30], lmax: [0, 0, 100], sph: [20, 40], life: [.15, .35], r: [.5, 1], grow: [1, 10], a: [.3137, .3922], c0: W, c1: [146, 145, 145], tt: 'cp', tmax: 128, ha: 1, ta: 1, fade: .85 }],
  wood: [   // impact_wood.vpcf (the chips' colour is the surface's own tint in CS2 — control point 4 — here wood's brown)
    FLASH,
    { src: 'impact_wood_child_base', k: K.puff, n: [1, 1], lmin: [0, 0, 50], lmax: [0, 0, 100], offp: .5, life: [.2, .25], r: [6, 12], grow: [.25, 2], a: [.251, .502], as: .5, c0: [177, 177, 177], c1: [60, 60, 60], tex: SMOKEGREN_TEX, fade: 1, drag: .1, spin: 2 },
    { src: 'impact_wood_child_burn', k: K.puff, n: [1, 1], lmin: [0, 0, 5], lmax: [0, 0, 5], life: [3, 3], r: [1, 1], grow: [.25, 4], rb: .6, a: [.235, .314], c0: [134, 122, 109], c1: [54, 48, 43], fade: .875, fin: .05, g: 10, drag: .1, spin: 2, dev: { radius: 'no radius of its own: the default 1' } },
    { src: 'impact_generic_smoke_medium', k: K.puff, n: [1, 1], lmin: [-125, -125, 150], lmax: [125, 125, 300], life: [1, 1.5], r: [10, 15], grow: [0, 2], rb: .96, a: [.078, .098], c0: [128, 128, 128], c1: [128, 128, 128], fade: 1, g: -40, drag: .3 },
    DARKEN,
    { src: 'impact_wood', k: K.chip, n: [10, 10], lmin: [-150, 150, 50], lmax: [150, -150, 150], life: [.4, .4], r: [.65, 2], lb: -.157895, a: [1, 1], c0: [167, 167, 167], c1: [69, 69, 69], cs: [205, 160, 115], ob: .7, g: -500, fade: .25, spin: 55 * 57.3, dev: { colour: 'tinted 40 % by the surface (control point 4: the game\'s, here wood brown (205,160,115))' } },
    { src: 'impact_wood_child_chunks', k: K.chip, n: [8, 8], pos: [0, 1], hemi: 1, lmin: [-50, -50, 0], lmax: [50, 50, 50], nmin: [-100, -100, 100], nmax: [100, 100, 300], life: [.2, .6], r: [4, 6], rs: .25, a: [1, 1], c0: [167, 167, 167], c1: [69, 69, 69], cs: [190, 150, 110], g: -700, drag: .05, fade: .75, spin: 55 * 57.3, dev: { colour: 'tinted 40 % toward the surface (TintMax): wood brown (190,150,110)' } },
    { src: 'impact_generic_burst_2', k: K.streak, lod: [1, 1, 2, 2], hemi: 1, lmin: [0, 0, 150], lmax: [0, 0, 185], life: [.25, .5], r: [1.5, 2], grow: [1, 3], rb: .75, a: [.196, .314], as: .5, c0: [150, 140, 128], c1: [150, 140, 128], tt: 'cp', tmax: 128, tmin: 15, ha: 0, ta: 1, drag: .2, fade: .85, c6: { life: 'b2L', r: 'b2R' },
      h: { c0: [32, 27, 27], tex: LOOP_G_TEX, a: 1, rs: 1.4 }, dev: { colour: 'as concrete\'s, in wood\'s tint' } },
    { src: 'impact_wood_child_burst', k: K.streak, n: [15, 20], hemi: 1, lmin: [0, 0, 50], lmax: [0, 0, 60], sph: [50, 80], life: [.2, .5], r: [.5, .5], rs: 2, grow: [2, 0], rb: .7, a: [1, 1], as: .35, c0: [157, 141, 123], c1: [157, 141, 123], cs: [114, 97, 78], tex: FLEKS_TEX, g: -600, drag: .1, tt: 'cp', tmax: 512, ha: 0, ta: 1, fade: .85, dev: { colour: 'CP4 (the surface tint) × its gradient\'s end (114,97,78)' } }],
  glass: [   // impact_glass.vpcf
    FLASH,
    { src: 'impact_glass_flash', k: K.glow, n: [1, 1], life: [.075, .075], r: [4, 8], grow: [1, 0], rb: .1, rst: .5, a: [.25, .5], as: .25, fade: 0, smax: .05, h: { c0: W, c1: W, a: .2, rs: 1, bloom: 1 } },
    { src: 'impact_glass_base', k: K.puff, rc: 'base', n: [1, 1], c6: { a: 'smokeA', life: 'smokeL' }, lmin: [0, 0, 100], lmax: [0, 0, 140], life: [.5, 1.5], r: [4, 12], a: [.1255, .251], c0: [200, 206, 208], c1: [220, 224, 226], ob: 1.5, si: .125, fade: 1, g: -100, drag: .125, spin: 2, dev: { radius: 'the remap\'s output range', colour: 'inherited from the shards: glass\'s' } },
    { src: 'impact_glass_dust', k: K.puff, rc: 'smoke', n: [3, 3], cpn: 1, c6: { n: [0, 1, 3, 2], a: 'smokeA', life: 'smokeL' }, off: 6, lmin: [-65, 65, 50], lmax: [65, 65, 125], life: [.75, 1.5], r: [3, 8], lb: -.052632, a: [.3765, .6275], c0: [200, 206, 208], c1: [220, 224, 226], tex: LOOP_SC_TEX, ob: 1.5, si: .125, fade: 0, fin: 1, g: -60, drag: .15, spin: 1, dev: { colour: 'inherited from the shards', off: 'PositionOffset 2–10: its middle', fin: 'SetFloat alpha × PARTICLE_AGE_NORMALIZED: it fades in over its whole life' } },
    { src: 'impact_glass', k: K.chip, lod: [0, 3, 4, 6], pos: [0, 1], lmin: [-100, -100, 25], lmax: [100, 100, 150], life: [1, 2], r: [.75, 1.5], a: [1, 1], as: .5, c0: [210, 222, 226], c1: [240, 248, 250], ob: 1.5, si: .125, g: -500, fade: .25, spin: 30, wtc: [.15, .3, 24], dev: { speed: 'VelocityRandom max is control point 0\'s components (the game\'s): (100, 100, 150)', colour: 'RandomColor white, desaturated: glass\'s pale blue-grey' } },
    { src: 'impact_glass_debris_small', k: K.chip, lod: [0, 10, 20, 30], pos: [0, 1], lmin: [-100, -100, 25], lmax: [100, 100, 150], life: [.05, 1], r: [.2, .4], grow: [1, 0], rb: .3, rst: .5, a: [1, 1], as: .5, c0: [220, 230, 234], c1: [250, 252, 252], ob: 1.5, si: .125, g: -500, fade: 0, spin: 30, dev: { speed: 'as impact_glass', colour: 'as impact_glass' } },
    { src: 'impact_glass_burst', k: K.streak, n: [1, 1], hemi: 1, lmin: [-25, 25, 250], lmax: [25, -25, 275], life: [.25, .375], r: [1.5, 2], grow: [1, 3], rb: .75, a: [.8745, 1], c0: [220, 224, 226], c1: [220, 224, 226], tex: LOOP_SC_TEX, ob: 1.5, si: .125, g: -50, drag: .2, tt: 'cp', tmax: 128, ha: 1, ta: 0, fade: 1, dev: { colour: 'inherited from the shards', fade: 'alpha × age: drawn as a fade over its life' } }],
  dirt: [   // impact_dirt.vpcf (sand and grass: CS2's sand inherits dirt's effect)
    FLASH,
    { src: 'impact_dirt_child_smoke', k: K.puff, rc: 'dirt', n: [1, 1], lmin: [0, 0, 10], lmax: [0, 0, 10], life: [1, 1], lb: -.052632, r: [10, 25], rs: .5, a: [.235, .431], c0: [242, 218, 199], c1: [182, 182, 182], tex: BURST_E_TEX, si: .338, fade: .65, spin: 2, dev: { rc: 'SetFloat radius × a curve of PARTICLE_AGE (s) (0,.1) (.141,1.131) (.364,2.678) (.5,3): RC.dirt (v53 HITS 3rd run)', radius: '× a remap of a particle float [.5, 1.5] → [.5, 1] (its upper end) and × its age curve (rc above)' } },
    { src: 'impact_dirt_child_base', k: K.puff, n: [3, 3], lmin: [0, 0, 30], lmax: [0, 0, 80], offp: .5, life: [.2, .275], r: [5, 10], grow: [.25, 3], a: [.251, .502], c0: [211, 188, 167], c1: [142, 122, 108], tex: [161, 164, 172], fade: 1, drag: .1, spin: 2, dev: { colour: 'inherited from the flecks: impact_dirt\'s' } },
    { src: 'impact_dirt_child_smoke_puff', k: K.puff, rc: 'puff', n: [2, 2], cpn: 1, c6: { n: [0, 1, 2, 1], a: 'puffA', life: 'puffL' }, lmin: [-50, 50, 50], lmax: [50, -50, 250], life: [1, 2], r: [2, 6], a: [.588, .784], c0: [157, 141, 102], c1: [230, 213, 190], tex: LOOP_SC_TEX, fade: .65, fin: .185, g: -150, drag: .24, dev: { radius: 'a remap [1, 2] → [6, 2] of a particle float: its output range', colour: 'SetVec gradient (87,78,67) → (157,141,102) at .1 → (230,213,190): its .1 → 1 part' } },
    DARKEN,
    { src: 'impact_dirt', k: K.chip, cp: 1, lod: [0, 2, 4, 7], lmin: [-100, 100, 0], lmax: [100, -100, 350], life: [2.5, 2.5], r: [.5, 1], a: [1, 1], c0: [211, 188, 167], c1: [142, 122, 108], g: -400, fade: .25, spin: 120 },
    { src: 'impact_dirt_back', k: K.chip, cp: 1, n: [3, 3], lmin: [90, -35, 80], lmax: [35, 35, 120], life: [2.5, 2.5], r: [.5, 1], lb: -.052632, a: [1, 1], c0: [211, 188, 167], c1: [142, 122, 108], cs: [189, 175, 164], g: -400, fade: .25, spin: 120, wtc: [.35, .2, 24], dev: { colour: 'inherited from the flecks' } },
    { src: 'impact_dirt_child_burst', k: K.streak, cp: 1, n: [5, 5], hemi: 1, off: 1, lmin: [0, 0, 40], lmax: [0, 0, 90], sph: [25, 50], life: [.125, .35], r: [1, 2], grow: [.5, 2], a: [.706, .902], c0: [211, 188, 167], c1: [114, 89, 76], tt: [1, 2], tmax: 150, tin: 1, ha: 1, ta: .3, fade: .65 },
    { src: 'impact_dirt_child_burst2', k: K.streak, n: [3, 3], pos: [.1, .1], hemi: 1, lmin: [0, 0, 60], lmax: [0, 0, 120], sph: [20, 30], life: [.25, .4], r: [1, 4], rs: 1.5, grow: [.1, 1], a: [.588, .702], c0: [194, 168, 145], c1: [74, 67, 62], g: -10, drag: .2, tt: [1, 1.5], tmax: 15, ha: 1, ta: .3, fade: .95 },
    { src: 'impact_generic_burst_sm', k: K.streak, n: [3, 3], hemi: 1, lmin: [0, 0, 120], lmax: [0, 0, 60], sph: [14, 50], life: [.2, .35], r: [1.5, 2], grow: [1, 4], rb: .8, a: [.894, .843], c0: [211, 188, 167], c1: [101, 86, 74], tt: [30, 30], tmax: 120, tin: 1, ha: 1, ta: .3, fade: .85 }],
};
// The helmet "dink" children stage 3 left out (impact_helmet_headshot.vpcf's children; gd-blood.js draws the trails,
// streaks and flare): its ricochet sparks, trailing metal sparks, a glow and a small smoke. (blood_impact_friendly_flash
// is CS2's friendly-fire flash — its count is control point 4's friendly value — not drawn for enemies.)
export const DINK_EXTRA = [
  { src: 'impact_metal_child_glow2', k: K.glow, n: [1, 1], lmin: [0, 0, 200], lmax: [0, 0, 200], off: 1, offp: 1, life: [.1, .1], r: [12, 12], rs: .35, grow: [1, 4], a: [.392, .471], c0: [75, 73, 53], c1: [62, 65, 90], ob: 1.5, fade: 1, drag: .5, smax: .05, dev: { radius: 'its VisibilityInputs radius scale (proxy) as ×.35', smax: 'its fade sizes 2–3 as a 5 % screen cap' } },
  { src: 'impact_generic_smoke_small', k: K.puff, n: [1, 1], lmin: [-50, -50, 80], lmax: [50, 50, 160], life: [1.5, 2], r: [8, 12], grow: [.5, 2], rb: .7, a: [.059, .078], c0: [128, 128, 128], c1: [128, 128, 128], fade: .9, fin: .1, g: -90, drag: .3 },
  FX.metal[7],   // (ricochet_sparks: the same emitter as impact_metal's)
  { src: 'impact_metal_sparks_trailing', k: K.trail, cp: 1, n: [4, 4], pos: [0, 0], hemi: 1, lmin: [-100, -100, 150], lmax: [100, 100, 350], sph: [0, 100], life: [.05, .425], lb: .25, r: [.25, .5], rs: .5, a: [.502, 1], c0: [252, 251, 195], c1: [169, 197, 255], tex: SPARK_TEX, ob: 3, g: -700, drag: .1, tt: [.01, .071], tmax: 25, tin: .1, fade: 0 }];
// Each surface's CS2 children that are not drawn (the test checks FX + this = the install's tree).
export const LEFT_OUT = {
  metal: { impact_fx_hit_darken_model: 'the darkening\'s model (CS2 model renderer)' },
  concrete: { impact_fx_hit_darken_model: 'the darkening\'s model' }, plaster: { impact_fx_hit_darken_model: 'the darkening\'s model', impact_plaster_burst_puff: 'a puff the burst emits along its way', impact_plaster_cheap: 'the cheap stand-in CS2 plays past 10 (its children: burst_cheap, smoke, light flash, darken)', impact_plaster_burst_cheap: 'the cheap one\'s', impact_light_flash: 'the cheap one\'s' },
  tile: { impact_fx_hit_darken_model: 'the darkening\'s model' }, wood: { impact_fx_hit_darken_model: 'the darkening\'s model', impact_spark_glow_soft_parent: 'a soft glow through its contrast-shadow children', ricochet_sparks_contrast_shadow: 'contrast shadow', impact_spark_glow_soft: 'the soft glow', ricochet_sparks_contrast_glow_soft: 'its child' },
  glass: { impact_glass_burst_puff: 'a puff the burst emits along its way' }, dirt: { impact_fx_hit_darken_model: 'the darkening\'s model' },
};
// CS2's cheap fallback (m_hFallback, m_nFallbackMaxCount): past `max` live impacts of a kind, its cheap system plays.
export const FALLBACK = {
  metal: { max: 15, src: 'impact_metal_cheap', list: [
    FX.metal[0], FLASH, FX.metal[2], DARKEN,
    { src: 'impact_metal_cheap', k: K.trail, n: [3, 3], hemi: 1, lmin: [-400, -400, 550], lmax: [400, 400, 950], sph: [0, 300], life: [.05, .15], lb: -.105263, r: [.25, 1], a: [.502, 1], c0: W, c1: [169, 197, 255], tex: SPARK2_TEX, g: -300, drag: .5, tt: [.1, .1], tmax: 25, tin: .1, fade: 0,
      h: { c0: [163, 203, 234], c1: [163, 203, 234], a: 1, ob: 3, rs: 1.5, bloom: 1 } },
    FX.metal[7],
    { src: 'ricochet_sparks_dots_cheap', k: K.glow, cp: 1, n: [2, 10], lod: [5, 15, 20, 30], lmin: [-50, -50, 65], lmax: [50, 50, 250], off: 1, life: [.05, .6], r: [.1, .222], grow: [1, 0], rb: .3, rst: .5, a: [1, 1], g: -250, drag: .1, fade: 0,
      h: { c0: [208, 220, 250], c1: [88, 130, 237], a: [.7, 1], ob: 4, rs: [.95, 1.1], bloom: 1 } }] },
};
// (live systems of a kind: their particles' longest life — impact_metal's ricochet_sparks_dir, 2 s)
const sysLife = list => { let m = 0; for (const e of list) m = Math.max(m, e.life[1]); return m; };
const FB_LIFE = { metal: sysLife(FX.metal) };

// CS2 effect → our emitter set (anything unlisted: concrete, CS2's "default").
export const EFFECT_OF = { impact_metal: 'metal', impact_metal_grate: 'metal', impact_metal_vent: 'metal', impact_chainlink: 'metal', impact_computer: 'metal',
  impact_concrete: 'concrete', impact_plaster: 'plaster', impact_tile: 'tile', impact_pottery: 'tile', impact_wood: 'wood', impact_leaves: 'wood', impact_glass: 'glass',
  impact_dirt: 'dirt', impact_grass: 'dirt', impact_carpet: 'dirt', impact_plastic: 'plaster' };
export const impactOf = mat => EFFECT_OF[surfaceOf(mat).effect] || 'concrete';
// Holes: CS2's decal group → its size (DecalWorldWidth, HU) and DecalSizeVariance (each group's first material in
// scripts/decalgroups.vdata: materials/decals/concrete/concrete1, metal/metal1, wood/wood1, glass/shot1, dirt/dirt_dark1,
// plaster/plaster1, tile/tile1, rock/rock1) and its cell in our atlas.
export const DECAL_SIZE = { 'Impact.Concrete': [5.8, .5, 0], 'Impact.Rock': [8.1, .5, 0], 'Impact.Asphalt': [5.8, .5, 0], 'Impact.Metal': [6.6, .5, 1], 'Impact.Vent': [6.6, .5, 1], 'Impact.Wood': [7.7, .6, 2],
  'Impact.Glass': [8.1, .5, 3], 'Impact.Dirt': [5.8, .75, 4], 'Impact.Plaster': [9.2, .5, 5], 'Impact.Sheetrock': [9.2, .5, 5], 'Impact.Tile': [11.6, 1, 6], 'Impact.Plastic': [5.8, .5, 5], 'Impact.Upholstery': [5.8, .5, 4] };
export const decalOf = mat => DECAL_SIZE[surfaceOf(mat).decal] || DECAL_SIZE['Impact.Concrete'];
// The baked light at a hit (map-light.js: 1 ≈ a sunlit floor) → the dust's and holes' shade, as the agents' (cs2-agents.js)
export const shadeOf = l => Number.isFinite(l) ? Math.min(1.1, Math.max(.3, .3 + .75 * l)) : 1;

// ── deterministic randomness: the same hit gives the same impact everywhere ────────────────────────────────────────────
const SS = new Int32Array([1]);
const seed = s => { SS[0] = (s >>> 0) || 1; }, rnd = () => { const S = SS[0] = (SS[0] + 0x6D2B79F5) | 0; let t = Math.imul(S ^ (S >>> 15), 1 | S); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = a => typeof a === 'number' ? a : a[0] + (a[1] - a[0]) * rnd();
// CS2's PF_BIAS_TYPE_EXPONENTIAL (our curve, see the header): p < 0 leans to the minimum.
export const biased = (u, p) => p ? Math.pow(u, (1 - p) / (1 + p)) : u;
export const hitSeed = (x, y, z) => (Math.imul(Math.round(x * 64) | 0, 73856093) ^ Math.imul(Math.round(y * 64) | 0, 19349663) ^ Math.imul(Math.round(z * 64) | 0, 83492791)) >>> 0;
const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
// (v53 HITS final) Control point 6 — FROM THE FILES. Each surface's parent system sets it before it emits:
// C_OP_DistanceBetweenCPsToCP (m_PreEmissionOperators, m_bSetOnce) from the hit (CP0) to CP5 — impact_dirt.vpcf's note:
// "Cp 5 is the start of the Shot. This gives us Distance to Impact" — m_flInputMin / Max → m_flOutputMin / Max, clamped:
// impact_concrete / impact_glass / impact_plaster_high 100 → 800 HU gives 1 → 0, impact_dirt 1 → .1 (CP6_OF). impact_metal,
// impact_tile and impact_wood set none: their CP6 is an unset control point — 0 here (Source's control points start at
// the origin: ours, marked). impact_fx_hit_darken sets its own: CP5 = the local player (C_OP_SetControlPointToPlayer),
// 50 → 1200 HU, its output range not in the file (Source 1's defaults 0 → 1: ours, marked) — CP6_DARKEN.
// The children read CP6's x through their own maps (c6, below): a count remap (PF_MAP_TYPE_REMAP, rounded to nearest;
// impact_fx_hit_darken's REMAP_BIASED with Source's Bias at (p + 1) / 2: ours) and PF_MAP_TYPE_CURVE initial-value
// scales on alpha (field 7), life (1) and radius (3) — CV, each curve's keys and slopes as the vpcf stores them (x, y,
// slope in, slope out), evaluated as a cubic Hermite through the stored slopes (ours: the editor's tangent modes are
// not modelled) at plan time, never per frame. (Before this, CP6 was our own guess — .25 at the muzzle rising to 1
// at 300 HU — and multiplied straight in: backwards, a close concrete hit lost its dust.) What it gives: a close
// concrete hit (≤ 100 HU) one bright puff (α × .86, life × .69) and burst_2 at its longest life; far off (≥ 800 HU)
// four faint short puffs and burst_2 twice as wide. Read back by tests/gd-impacts.mjs.
export const CP6_OF = { concrete: [100, 800, 1, 0], glass: [100, 800, 1, 0], plaster: [100, 800, 1, 0], dirt: [100, 800, 1, .1] };
export const CP6_DARKEN = [50, 1200, 0, 1];
// CP6 for a remap R at a distance (HU) — unknown distance: R's near end; no setter (R null): 0.
export const cp6Of = (R, hu) => !R ? 0 : !Number.isFinite(hu) ? R[2] : R[2] + (R[3] - R[2]) * Math.min(1, Math.max(0, (hu - R[0]) / (R[1] - R[0])));
export const CP6 = CP6_OF.concrete, cp6At = hu => cp6Of(CP6_OF.concrete, hu);   // (concrete's: the picture and tests)
export const CV = {
  baseL: [-4.142846, -2.964012, .807153, .807153, .002, .381512, .064488, .064488, .414, .512812, .913391, .913391, .696059, .969736, .466048, .466048, 1, .785916, -1.951661, -1.951661],   // impact_concrete_child_base life
  baseA: [-4.142846, -3.57386, .9276, .9276, -.012059, .25786, .013488, .013488, .431454, .60148, .892018, .892018, .726424, .9166, .550909, .550909, 1, .69238, -.819588, -.819588],   // impact_concrete_child_base alpha
  smokeA: [-4.142846, -3.57386, .9276, .9276, -.012059, .25786, .013488, .013488, .485465, .43786, .797306, .797306, .874953, .96508, .550909, .550909, 1, .856, -.872311, -.872311],   // concrete_child_smoke / glass_base / glass_dust / plaster_base / plaster_smoke alpha
  smokeL: [-4.142846, -3.57386, .93133, .93133, .002, .28636, .074409, .074409, .414, .43786, 1.053913, 1.053913, .904, .89236, .434334, .434334, 1, .69238, -6.868007, -6.868007],   // the same five's life
  b2L: [0, .5, .329334, .329334, .422089, .62928, .55117, .55117, .798955, .94036, .470811, .470811, 1.003971, .97672, -.075579, -.075579, 5.142847, 3.549239, .62155, .62155],   // impact_generic_burst_2 life
  b2R: [0, 1, -.329334, -.329334, .422089, .87072, -.55117, -.55117, .798955, .55964, -.470811, -.470811, 1.003971, .52328, .075579, .075579, 5.142847, -2.049239, -.62155, -.62155],   // impact_generic_burst_2 radius (bigger far off)
  puffA: [-4.142846, -2.964012, .810724, .810724, -.009782, .386764, .166579, .166579, .545188, .62066, .634203, .634203, .926, .98024, .213231, .213231, 1, .71764, -3.173084, -3.173084],   // impact_dirt_child_smoke_puff alpha
  puffL: [-4.142846, -2.964012, .820437, .820437, -.012634, .424568, .292967, .292967, .52398, .654044, .58205, .58205, .924, .969736, .453561, .453561, 1, .869948, -5.490723, -5.490723],   // impact_dirt_child_smoke_puff life
  darkA: [.022507, 0, 7.89879, 7.89879, .149109, 1, -.734545, -.734545, .756797, .61408, -.540058, -.540058, .996128, .54256, -.017984, -.017984, 5.142846, -5.09848, -1.360363, -1.360363],   // impact_fx_hit_darken alpha
  darkL: [0, .25, .658667, .658667, .316567, .44392, 1.10234, 1.10234, .599216, .91054, .941621, .941621, .752978, .96508, -.151158, -.151158, 3.857135, 4.823859, 1.2431, 1.2431] };   // impact_fx_hit_darken life
// A curve at x (clamped 0–1: the files' PF_INPUT_MODE_CLAMPED over input 0 → 1); held flat past its end keys.
export function curveAt(C, x) { x = Math.min(1, Math.max(0, x)); const n = C.length / 4;
  if (x <= C[0]) return C[1]; for (let i = 0; i < n - 1; i++) { const x0 = C[i * 4], x1 = C[i * 4 + 4]; if (x > x1) continue;
    const h = x1 - x0 || 1, t = (x - x0) / h, t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * C[i * 4 + 1] + (t3 - 2 * t2 + t) * h * C[i * 4 + 3] + (-2 * t3 + 3 * t2) * C[i * 4 + 5] + (t3 - t2) * h * C[i * 4 + 6]; }
  return C[(n - 1) * 4 + 1]; }
const bias = (t, b) => Math.pow(t, Math.log(b) / Math.log(.5));   // (Source's Bias)
// c6: { n: [in0, in1, out0, out1] the count remap (nb: REMAP_BIASED's parameter), a / life / r: a CV curve's name, own: 1 this
// system's own CP6 (darken) }.
const c6Scale = (C6, f, cp6) => C6?.[f] ? curveAt(CV[C6[f]], cp6) : 1;
export const countOf = (e, detail, cp6 = 1) => { let n = 0; if (e.c6?.n) { const R = e.c6.n; let t = Math.min(1, Math.max(0, (cp6 - R[0]) / (R[1] - R[0]))); if (e.c6.nb) t = bias(t, (e.c6.nb + 1) / 2); return Math.round(R[2] + (R[3] - R[2]) * t); } if (e.n) n += e.n[0] + Math.floor(rnd() * (e.n[1] - e.n[0] + 1)); if (e.lod) n += e.lod[Math.max(0, Math.min(3, detail | 0))]; return n; };
// Source 1's BasicMovement drag: (1 − fDrag) of the speed kept per 1/30 s → a rate per second.
export const dragRate = f => f > 0 ? -Math.log(Math.max(1e-6, 1 - f)) * 30 : 0;

// ── an impact → particles (pure) ─────────────────────────────────────────────────────────────────────────────────────
// Each particle PK floats: 0 start x y z · 3 velocity x y z · 6 life · 7 radius · 8 grow0 · 9 grow1 · 10 gravity · 11 drag
// (/s) · 12 trail time (−1: from the hit point) · 13 trail cap · 14 fade share · 15 r g b (linear × overbright) · 18 alpha
// · 19 end r g b · 22 roll · 23 kind · 24 spin (rad/s; trails: the length fade-in, s) · 25 screen cap (trails: head
// alpha) · 26 fade-in share (trails: tail alpha) · 27 delay · 28 halo r g b · 31 halo radius scale (0: none) · 32 halo
// end r g b (the alpha kinds: 32 its alpha) · 35 the radius curve: bias + 4 × start time.
export const PK = 40;
const F0 = [0, 0, 0], F1 = [0, 0, 0], F2 = [0, 0, 0], G0 = [0, 0, 0], G1 = [0, 0, 0], G2 = [0, 0, 0];
// frame(n): z along a, x / y across it (any pair).
function basis(ax, ay, az, X, Y, Z) { const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1; ax /= l; ay /= l; az /= l; Z[0] = ax; Z[1] = ay; Z[2] = az;
  let ux = 0, uy = 1, uz = 0; if (Math.abs(ay) > .9) { ux = 1; uy = 0; } let x0 = uy * az - uz * ay, x1 = uz * ax - ux * az, x2 = ux * ay - uy * ax; const xl = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2) || 1; x0 /= xl; x1 /= xl; x2 /= xl;
  X[0] = x0; X[1] = x1; X[2] = x2; Y[0] = ay * x2 - az * x1; Y[1] = az * x0 - ax * x2; Y[2] = ax * x1 - ay * x0; }
const tl = (c, q) => c ? lin(c[q]) : 1;
// A landing (v53 MAP fix — CS2's C_OP_WorldTraceConstraint, for the systems that have one: wtc): when the particle
// first comes down to the floor under the hit (floor: its height in world units, the caller's floorAt; NaN: none known),
// and how it leaves it — its speed into the floor × the bounce (none under the stop speed), its speed along it × the
// slide; one bounce, then it rests on the floor (the vertex shader flies both legs). Lanes 36–39: the landing's age
// (−1: none), the floor's height, the bounce, the slide. Ours, said so in UPDATE-v53.0.md: only the floor under the hit
// (CS2 traces the world every frame: walls too, and more bounces with m_bDecayBounce), and the split into the speed
// into the floor (bounce) and along it (slide) is our reading of the two fields.
const flyY = (y0, vy, g, k, t) => k < .01 ? y0 + vy * t + .5 * g * t * t : y0 + (vy - g / k) * (1 - Math.exp(-k * t)) / k + g / k * t;
// (v53 DETAILS, open-B#16 — the walls: CS2's C_OP_WorldTraceConstraint traces the world along the whole flight, so a
// spark or fleck never flies through a wall. Here, for the same systems (wtc), the flight up to its floor landing (or its
// end) is traced in WALL_SEG straight pieces against the map's sight triangles (createImpacts' wallAt: nadeMesh.first);
// where it first ENTERS a wall or a ceiling (a face toward it, |normal.y| < 0.7 or facing down — floors stay the landing
// above), the particle ends there: hidden from that moment (aF.y, the cut, when it has no landing — its life, and so its
// size, colour and fade by age / life, stay CS2's) (ours: CS2 bounces it off the wall by the same
// m_flBounceAmount — one more leg the shader would need a plane for; a cut keeps one draw and no new shader). WALL.left:
// the traces this frame may still make (WALL_BUDGET a frame, shared by every impact: ~1.9 µs each on Dust II); past it a
// particle is not traced (as before). Allocation-free: WN is the one normal buffer.)
export const WALL_SEG = 3, WALL_BUDGET = 600;
// (the frame's budget by particle detail, Low … Ultra: a shotgun's 9 pellets into metal plan ~960 traces on High, so the
// cap is what bounds that frame — ~0.6 ms on High at ~1.9 µs a trace, 4× that on a weak laptop; ours, not CS2's)
export const WALL_BUDGETS = [150, 220, 300, WALL_BUDGET];
export const WALL = { at: null, left: 0 };
const WN = new Float64Array(4);
const flyH = (x0, v, k, t) => k < .01 ? x0 + v * t : x0 + v * (1 - Math.exp(-k * t)) / k;
export function wallCut(o, out, until) {
  const f = WALL.at; if (!f || !(until > 0)) return -1;
  const x0 = out[o], y0 = out[o + 1], z0 = out[o + 2], vx = out[o + 3], vy = out[o + 4], vz = out[o + 5], g = out[o + 10], k = out[o + 11];
  let ax = x0, ay = y0, az = z0, ta = 0;
  for (let i = 1; i <= WALL_SEG; i++) { if (WALL.left <= 0) return -1; WALL.left--;
    const t = until * i / WALL_SEG, bx = flyH(x0, vx, k, t), by = flyY(y0, vy, g, k, t), bz = flyH(z0, vz, k, t), w = f(ax, ay, az, bx, by, bz, WN);
    if (w >= 0 && w <= 1 && WN[0] * (bx - ax) + WN[1] * (by - ay) + WN[2] * (bz - az) < 0 && WN[1] < .7) {
      // (the chord met the wall at P: the curved flight's own moment on that plane, by bisection — no more traces)
      const px = ax + (bx - ax) * w, py = ay + (by - ay) * w, pz = az + (bz - az) * w; let lo = ta, hi = t;
      for (let j = 0; j < 10; j++) { const m = (lo + hi) / 2, s = WN[0] * (flyH(x0, vx, k, m) - px) + WN[1] * (flyY(y0, vy, g, k, m) - py) + WN[2] * (flyH(z0, vz, k, m) - pz); if (s < 0) hi = m; else lo = m; }
      return lo; }
    ax = bx; ay = by; az = bz; ta = t; }
  return -1; }
function landing(e, o, out, floor) {
  out[o + 36] = -1; out[o + 37] = 0; out[o + 38] = 0; out[o + 39] = 0;
  if (!e.wtc) return;
  const y0 = out[o + 1], vy = out[o + 4], g = out[o + 10], k = out[o + 11], life = out[o + 6];
  let a = 0, b = -1;
  if (Number.isFinite(floor) && !(y0 < floor - 1e-4)) {   // (not when it starts under that floor: a hit under a ledge)
    for (let i = 1; i <= 16; i++) { const t = life * i / 16; if (flyY(y0, vy, g, k, t) <= floor) { b = t; a = life * (i - 1) / 16; break; } }
    if (b >= 0) for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (flyY(y0, vy, g, k, m) <= floor) b = m; else a = m; } }
  const tw = wallCut(o, out, b >= 0 ? b : life); if (tw >= 0) { out[o + 37] = Math.max(1e-3, tw); return; }   // (into a wall first: it ends there — lane 37, the cut, with no landing (lane 36 = −1); its life stays, so its size, colour and fade still run on CS2's whole life: the shader only hides it from the cut on)
  if (b < 0) return;   // (no floor known, or it dies before it lands)
  const vyb = k < .01 ? vy + g * b : (vy - g / k) * Math.exp(-k * b) + g / k, up = -vyb * e.wtc[0], A = e.wtcAge,
    stop = A ? A[2] + (A[3] - A[2]) * Math.min(1, Math.max(0, (b - A[0]) / (A[1] - A[0]))) : e.wtc[2];   // (wtcAge: a stop speed CS2 remaps from the particle's age — ricochet_sparks_dots: 0–2 s → 4–200)
  out[o + 36] = Math.max(1e-4, b); out[o + 37] = floor; out[o + 38] = stop >= 0 && up < stop * HU ? 0 : e.wtc[0]; out[o + 39] = e.wtc[1];
}
// px.. the hit point (game units), nx.. the surface normal toward the shooter, dx.. the bullet's direction; list: an
// emitter list (FX[kind] or DINK_EXTRA); detail 0–3; out: a Float32Array of MAX_HIT × PK; light: the shade at the hit
// (shadeOf). Returns how many.
export function planImpact(list, px, py, pz, nx, ny, nz, dx, dy, dz, s, detail, out, max = MAX_HIT, light = 1, floor = NaN, cp6 = 1, cp6d = cp6) {   // (cp6: the surface's control point 6; cp6d: impact_fx_hit_darken's own)
  seed(s); basis(nx, ny, nz, F0, F1, F2);
  const dn = dx * F2[0] + dy * F2[1] + dz * F2[2]; basis(dx - 2 * dn * F2[0], dy - 2 * dn * F2[1], dz - 2 * dn * F2[2], G0, G1, G2);   // (the reflected bullet: CS2's control point 1)
  let n = 0;
  for (let w = 0; w < list.length; w++) { const e = list[w], C6 = e.c6, q6 = C6?.own ? cp6d : cp6, c = countOf(e, detail, q6), X = e.cp ? G0 : F0, Y = e.cp ? G1 : F1, Z = e.cp ? G2 : F2, nc = e.ncp ?? e.cp, NX = nc ? G0 : F0, NY = nc ? G1 : F1, NZ = nc ? G2 : F2;
    const add = ADDITIVE(e.k), trail = e.k === K.trail || e.k === K.streak, lit = add ? (e.si ?? 1) + (e.dif || 0) * light : e.si != null ? e.si + (1 - e.si) * light * (e.dif || 1) : light * (e.dif || 1), h = e.h;   // (additive: self-lit, + its diffuse share of the light; alpha: lit by the map, a self-lit share kept)
    for (let j = 0; j < c && n < max; j++) {
      let lx = 0, ly = 0, lz = 0, sx = 0, sy = 0, sz = 0; if (e.lmin) { lx = e.lmin[0] + (e.lmax[0] - e.lmin[0]) * rnd(); ly = e.lmin[1] + (e.lmax[1] - e.lmin[1]) * rnd(); lz = e.lmin[2] + (e.lmax[2] - e.lmin[2]) * rnd(); }
      let vx = X[0] * lx + Y[0] * ly + Z[0] * lz, vy = X[1] * lx + Y[1] * ly + Z[1] * lz, vz = X[2] * lx + Y[2] * ly + Z[2] * lz;
      if (e.nmin) { const a = e.nmin[0] + (e.nmax[0] - e.nmin[0]) * rnd(), b = e.nmin[1] + (e.nmax[1] - e.nmin[1]) * rnd(), q = e.nmin[2] + (e.nmax[2] - e.nmin[2]) * rnd(); vx += NX[0] * a + NY[0] * b + NZ[0] * q; vy += NX[1] * a + NY[1] * b + NZ[1] * q; vz += NX[2] * a + NY[2] * b + NZ[2] * q; }
      if (e.sph || e.pos) { const u = rnd() * 2 - 1, an = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u), ux = q * Math.cos(an), uy = q * Math.sin(an), uz = e.hemi ? Math.abs(u) : u;   // (the sphere's direction: its start offset and its speed)
        const dirx = X[0] * ux + Y[0] * uy + Z[0] * uz, diry = X[1] * ux + Y[1] * uy + Z[1] * uz, dirz = X[2] * ux + Y[2] * uy + Z[2] * uz;
        if (e.sph) { const sp = rr(e.sph); vx += dirx * sp; vy += diry * sp; vz += dirz * sp; } if (e.pos) { const pr = rr(e.pos); sx = dirx * pr; sy = diry * pr; sz = dirz * pr; } }
      const life0 = e.lb ? e.life[0] + (e.life[1] - e.life[0]) * biased(rnd(), e.lb) : rr(e.life), life = life0 * c6Scale(C6, 'life', q6);   // (v53 HITS: CP6's curve scales the life after the radius is read from it — the vpcf's order)
      const r0 = (e.rsr ? rr(e.rsr) : 1) * c6Scale(C6, 'r', q6) * (e.rl ? e.rl[2] + (e.rl[3] - e.rl[2]) * Math.min(1, Math.max(0, (life0 - e.rl[0]) / (e.rl[1] - e.rl[0] || 1))) : rr(e.r)), rad = r0 * (e.rs || 1), off = (e.off || 0) + (e.offp || 0) * r0 + .3;   // (.3 HU off the face: never inside it)
      const o = n * PK, cr = rnd(), ob = (e.ob || 1) * lit;
      out[o] = px + (F2[0] * off + sx) * HU; out[o + 1] = py + (F2[1] * off + sy) * HU; out[o + 2] = pz + (F2[2] * off + sz) * HU;
      out[o + 3] = vx * HU; out[o + 4] = vy * HU; out[o + 5] = vz * HU; out[o + 6] = life;
      out[o + 7] = rad * HU; out[o + 8] = e.grow ? e.grow[0] : 1; out[o + 9] = e.grow ? e.grow[1] : 1; out[o + 10] = (e.g || 0) * HU; out[o + 11] = dragRate(e.drag || 0);
      out[o + 12] = e.tt === 'cp' ? -1 : e.tt ? rr(e.tt) : 0; out[o + 13] = (e.tmax || 0) * HU; out[o + 14] = e.fade || 0;
      const c0 = e.c0 || W, c1 = e.c1 || W;
      for (let q = 0; q < 3; q++) out[o + 15 + q] = lin(c0[q] + (c1[q] - c0[q]) * cr) * tl(e.cs, q) * tl(e.tex, q) * ob;
      out[o + 18] = Math.min(1, rr(e.a) * (e.as || 1)) * c6Scale(C6, 'a', q6);
      for (let q = 0; q < 3; q++) out[o + 19 + q] = e.ce ? lin(e.ce[q]) * ob : out[o + 15 + q];
      { const roll = rnd() * Math.PI * 2; out[o + 22] = trail ? (e.core || 0) : roll; } out[o + 23] = e.k;   // (v53 HITS: a trail's lane 22 is its core width — 0: SPARK_CORE, 1: full, effects/spark.vtex)
      if (trail) { out[o + 24] = e.tin || 0; out[o + 25] = e.ha ?? 1; out[o + 26] = e.ta ?? .3; }
      else { out[o + 24] = e.spin ? (rnd() * 2 - 1) * e.spin * Math.PI / 180 : 0; out[o + 25] = e.smax || 0; out[o + 26] = e.fin || 0; }
      out[o + 27] = 0;
      if (h) { const hs = rr(h.rs || 1), ha = rr(h.a ?? 1);
        if (add) { const I = ha * (h.ob || 1) * (h.si || 1) * (h.bloom ? BLOOM_K : 1); const C0 = h.c0, C1 = h.c1 || h.c0;
          for (let q = 0; q < 3; q++) { const f = (h.raw ? (h.cs ? h.cs[q] / 255 : 1) : tl(h.cs, q)) * tl(h.tex, q) * I, a0 = h.raw ? C0[q] / 255 : lin(C0[q]), a1 = h.raw ? C1[q] / 255 : lin(C1[q]); out[o + 28 + q] = a0 * f; out[o + 32 + q] = a1 * f; } }
        else { for (let q = 0; q < 3; q++) out[o + 28 + q] = lin(h.c0[q]) * tl(h.tex, q) * light; out[o + 32] = ha; out[o + 33] = 0; out[o + 34] = 0; }
        out[o + 31] = hs; }
      else { for (let q = 28; q < 35; q++) out[o + q] = 0; }
      out[o + 35] = (e.rb ?? .5) + 4 * (e.rst || 0);
      if (!add && e.rc) { out[o + 33] = RC_ID[e.rc] || 0; out[o + 34] = HU * (e.rs || 1); }   // (v53 HITS 3rd run: the radius curve, aB.y / aB.z — below)
      landing(e, o, out, floor);
      n++; } }
  return n;
}
// The most particles a list can write (its counts' maxima at a detail level): the per-hit cap is above every list's.
export const maxCount = (list, detail = 3) => { let m = 0; for (const e of list) m += (e.n ? e.n[1] : 0) + (e.lod ? e.lod[detail] : 0); return m; };

// ── the shaders: one vertex shader for both particle pools (GPU flight), the fragment shape by kind ──────────────────
const VS = `#define SPARK_CORE 0.3
uniform float uTime; uniform float uPx; uniform float uLight; uniform float uHaloPx;
attribute vec4 aP; attribute vec4 aV; attribute vec4 aS; attribute vec4 aM; attribute vec4 aC; attribute vec4 aE; attribute vec4 aK; attribute vec4 aH; attribute vec4 aB; attribute vec4 aF;
varying vec2 vQ; varying vec4 vCol; varying vec4 vHalo; varying vec3 vShape;
void fly(vec3 p0, vec3 v0, vec3 g, float k, float t, out vec3 p, out vec3 v) {   // (gravity and Source's drag: ExponentialDecayIntegral)
  if (k < 0.01) { p = p0 + v0 * t + 0.5 * g * t * t; v = v0 + g * t; }
  else { float e = exp(-k * t); vec3 vt = g / k; p = p0 + (v0 - vt) * (1.0 - e) / k + vt * t; v = (v0 - vt) * e + vt; }
}
void main() {
  float age = uTime - aP.w, life = aV.w;
  if (age < 0.0 || age >= life || (aF.x <= 0.0 && aF.y > 0.0 && age >= aF.y)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vQ = vec2(0.0); vCol = vec4(0.0); vHalo = vec4(0.0); vShape = vec3(0.0); return; }
  float n = age / life, k = aM.x; vec3 g = vec3(0.0, aS.w, 0.0), p, vel;
  if (aF.x > 0.0 && age > aF.x) {   // (landed: CS2's WorldTraceConstraint — off the floor with the bounce and the slide, then resting on it)
    vec3 p1, v1; fly(aP.xyz, aV.xyz, g, k, aF.x, p1, v1); p1.y = aF.y; v1 = vec3(v1.x * aF.w, -v1.y * aF.z, v1.z * aF.w);
    fly(p1, v1, g, k, age - aF.x, p, vel); if (p.y < aF.y) { p.y = aF.y; vel = vec3(vel.x, 0.0, vel.z) * aF.w; } }
  else fly(aP.xyz, aV.xyz, g, k, age, p, vel);
  vec4 mv = viewMatrix * vec4(p, 1.0); float d = max(0.05, -mv.z), onePx = d * uPx / projectionMatrix[1][1];   // (one pixel at that depth)
  float rb = fract(aB.w), rst = floor(aB.w) * 0.25, tr = clamp((n - rst) / max(1e-3, 1.0 - rst), 0.0, 1.0);
  if (rb > 0.0 && abs(rb - 0.5) > 1e-3) tr = pow(tr, log(rb) / log(0.5));   // (Source's Bias)
  float rad = aS.x * mix(aS.y, aS.z, tr); if (aK.x > 1.5 && aB.y > 0.5) { float y0 = 0.0; vec4 cv = vec4(.164, 10.908, 1.0, 19.15); if (aB.y > 3.5) { y0 = .1; cv = vec4(.364, 2.678, .5, 3.0); } else if (aB.y > 2.5) cv = vec4(.775, 15.635, 2.0, 44.723); else if (aB.y > 1.5) cv = vec4(.749, 14.908, 2.0, 44.723);   // (the radius curves RC, v53 HITS)
    float cy = age < cv.x ? mix(y0, cv.y, age / cv.x) : mix(cv.y, cv.w, clamp((age - cv.x) / (cv.z - cv.x), 0.0, 1.0)); rad = aB.y > 3.5 ? aS.x * cy : rad + cy * aB.z; }
  float hs = aH.w, kind = aK.x, core = 1.0, ce = 1.0, he = 1.0; vec2 c = position.xy * 2.0, ends = vec2(1.0);   // (ce / he: a spark thinner than its least drawn width keeps its light, not its width)
  if (kind < 0.5 || kind > 3.5) {   // trails and streaks: along the screen velocity, or from the hit point to the particle
    vec3 seg = aM.y < 0.0 ? p - aP.xyz : vel; vec3 vv = (viewMatrix * vec4(seg, 0.0)).xyz; float sp = length(seg), sl = length(vv.xy);
    vec2 ay = sl > 1e-5 ? vv.xy / sl : vec2(0.0, 1.0), ax = vec2(ay.y, -ay.x);
    float l3 = aM.y < 0.0 ? sp : min(sp * aM.y * (aK.y > 0.0 ? clamp(age / aK.y, 0.0, 1.0) : 1.0), length(p - aP.xyz));   // (never longer than the way it has come: a streak does not reach back into the wall)
    float len = min(aM.z, l3) * (sp > 1e-5 ? sl / sp : 0.0), wt = rad * (kind < 0.5 ? (aE.w > 0.0 ? aE.w : SPARK_CORE) : 1.0), w = max(wt, onePx * 0.6), ht = rad * hs, Wd = hs > 0.0 ? max(w, max(ht, onePx * uHaloPx)) : w;
    if (kind < 0.5) { ce = clamp(wt / w, 0.0, 1.0); he = hs > 0.0 ? clamp(ht / Wd, 0.0, 1.0) : 1.0; }
    mv.xy += ax * c.x * Wd + ay * ((c.y * 0.5 - 0.5) * len + c.y * Wd); core = w / Wd; ends = aK.zw;
  } else {
    if (aK.z > 0.0) rad = min(rad, aK.z * d / projectionMatrix[1][1]);
    float r0 = max(rad, onePx), R = hs > 0.0 ? max(r0 * hs, onePx * uHaloPx) : r0; if (kind < 1.5) { ce = min(1.0, (rad / r0) * (rad / r0)); he = hs > 0.0 ? min(1.0, (rad * hs / R) * (rad * hs / R)) : 1.0; }
    float a = aE.w + aK.y * age, cs = cos(a), sn = sin(a); vec2 r = kind > 1.5 && kind < 2.5 ? vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) : c;
    mv.xy += r * R; core = r0 / R;
  }
  gl_Position = projectionMatrix * mv;
  float al = aC.a; if (aM.w > 0.0) al *= 1.0 - smoothstep(1.0 - aM.w, 1.0, n); if (kind > 0.5 && kind < 3.5 && aK.w > 0.0) al *= clamp(n / aK.w, 0.0, 1.0);
  vec3 col = mix(aC.rgb, aE.rgb, n); if (kind > 1.5) col *= uLight;
  vHalo = kind > 1.5 ? vec4(aH.rgb * uLight, aB.x * al) : vec4(mix(aH.rgb, aB.rgb, n) * he, al);
  vCol = vec4(kind < 1.5 ? col * ce : col, al); vQ = c; vShape = vec3(kind, core, 0.0); if (kind < 0.5 || kind > 3.5) vShape.z = mix(ends.y, ends.x, c.y * 0.5 + 0.5);
}`;
const FS = `varying vec2 vQ; varying vec4 vCol; varying vec4 vHalo; varying vec3 vShape;
void main() {
  float kind = vShape.x, core = max(vShape.y, 1e-3), a, ha = 0.0;
  if (kind < 0.5) {   // a spark: a thin spindle (sparks.vtex: a bright line narrower than its quad, tapered at both ends), its glow around it
    float s = vQ.y * 0.5 + 0.5, tp = pow(max(0.0, sin(3.14159 * s)), 0.6), x = vQ.x, xc = abs(x) / (core * max(tp, 0.05));
    a = pow(max(0.0, 1.0 - xc), 2.0) * vShape.z; ha = exp(-5.0 * x * x / max(tp, 0.08)) * (1.0 - x * x) * tp * vShape.z; }
  else if (kind > 3.5) {   // a debris streak: soft across, faded at both ends (no hard edge)
    float s = vQ.y * 0.5 + 0.5, tp = sin(3.14159 * s), x = vQ.x, xc = x / core; a = max(0.0, 1.0 - xc * xc); a *= a * tp * vShape.z; ha = (1.0 - x * x) * (1.0 - x * x) * tp * vShape.z; }
  else if (kind < 1.5) { float l = length(vQ); a = pow(max(0.0, 1.0 - l / core), 2.0); ha = pow(max(0.0, 1.0 - l), 2.0); }
  else if (kind < 2.5) { float m = abs(vQ.x) * 0.8 + abs(vQ.y) * 1.1; a = 1.0 - smoothstep(0.7, 0.95, m); }
  else { float l = dot(vQ, vQ); a = max(0.0, 1.0 - l); a *= a; }
  if (kind < 1.5) { vec3 o = (vCol.rgb * a + vHalo.rgb * ha) * vCol.a; float m = max(o.r, max(o.g, o.b)); if (m < 0.002) discard;
    if (m > 1.0) o /= m;   // (an overbright spark keeps its hue, as CS2's HDR tone map and bloom keep it — clipped per channel, a ×4 cream spark (251,241,194) read as a white line: ADDENDUM 11)
    gl_FragColor = vec4(o, 1.0); }
  else { float ca = a * vCol.a, hA = ha * vHalo.a, A = ca + hA * (1.0 - ca); if (A < 0.004) discard; gl_FragColor = vec4((vCol.rgb * ca + vHalo.rgb * hA * (1.0 - ca)) / A, A); }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// Holes: a quad on the surface (centre, right and up axes × half size), its atlas cell, its shade; faded out at the end of a round.
const DVS = `uniform float uCells; attribute vec4 aC; attribute vec4 aU; attribute vec4 aW; varying vec2 vUv; varying float vA; varying float vL;
void main() { vec3 p = aC.xyz + aU.xyz * (position.x * 2.0) + aW.xyz * (position.y * 2.0); float cell = aU.w;
  vUv = (vec2(mod(cell, uCells), floor(cell / uCells)) + uv) / vec2(uCells, 2.0); vA = aW.w; vL = aC.w > 0.0 ? aC.w : 1.0;
  gl_Position = aW.w > 0.0 ? projectionMatrix * viewMatrix * vec4(p, 1.0) : vec4(0.0, 0.0, 2.0, 1.0); }`;
const DFS = `uniform sampler2D uMap; varying vec2 vUv; varying float vA; varying float vL;
void main() { vec4 t = texture2D(uMap, vUv); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(t.rgb * vL, a);
  #include <colorspace_fragment>
}`;

// Our own hole pictures (never CS2's: a 4 × 2 atlas of 128 px cells): concrete, metal, wood, glass, dirt, plaster, tile,
// spare. Each: a dark centre and the ring its material shows (chipped grey, bright scuffed metal, splintered wood, a
// cracked star, a soft dark spot…). The same every time (seeded), so every computer draws the same.
export function builtinHoles(W = 512) {
  const H = W / 2, C = W / 4, A = new Uint8Array(W * H * 4); SS[0] = 77;
  const put = (x, y, r, g, b, a) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4, k = a / 255, ka = A[i + 3] / 255, oa = k + ka * (1 - k);
    if (oa <= 0) return; A[i] = (r * k + A[i] * ka * (1 - k)) / oa; A[i + 1] = (g * k + A[i + 1] * ka * (1 - k)) / oa; A[i + 2] = (b * k + A[i + 2] * ka * (1 - k)) / oa; A[i + 3] = oa * 255; };
  const disc = (cx, cy, r, col, a, soft = .3) => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.sqrt(x * x + y * y) / r; if (d > 1) continue; put(cx + x, cy + y, col[0], col[1], col[2], a * Math.min(1, (1 - d) / soft)); } };
  const ray = (cx, cy, ang, len, w, col, a) => { for (let t = 0; t < len; t += .5) disc(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t, Math.max(.6, w * (1 - t / len)), col, a * (1 - t / len * .6), 1); };
  const cell = (i, f) => f((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2, C / 2);
  cell(0, (x, y, R) => { for (let k = 0; k < 14; k++) { const a = rnd() * 6.283, d = R * (.18 + rnd() * .22); disc(x + Math.cos(a) * d, y + Math.sin(a) * d, R * (.08 + rnd() * .1), [120, 118, 114], 150); } disc(x, y, R * .34, [70, 68, 66], 200); disc(x, y, R * .16, [12, 12, 12], 245); });   // concrete
  cell(1, (x, y, R) => { disc(x, y, R * .42, [150, 154, 158], 90, .6); disc(x, y, R * .28, [176, 178, 180], 110, .5); disc(x, y, R * .2, [30, 30, 32], 240); disc(x, y, R * .1, [5, 5, 5], 255); });   // metal: a scuffed ring (lit by the map's light at the hit)
  cell(2, (x, y, R) => { for (let k = 0; k < 9; k++) ray(x, y, rnd() * 6.283, R * (.3 + rnd() * .45), R * .05, [70, 48, 28], 170); disc(x, y, R * .24, [52, 34, 18], 220); disc(x, y, R * .13, [10, 8, 6], 250); });   // wood: splinters
  cell(3, (x, y, R) => { for (let k = 0; k < 11; k++) ray(x, y, rnd() * 6.283, R * (.45 + rnd() * .5), R * .025, [235, 242, 245], 190); for (let k = 0; k < 2; k++) { const r0 = R * (.3 + .25 * k); for (let a = 0; a < 6.283; a += .05) if (rnd() < .6) disc(x + Math.cos(a) * r0, y + Math.sin(a) * r0, 1, [230, 238, 242], 120, 1); } disc(x, y, R * .14, [200, 210, 215], 200); disc(x, y, R * .07, [20, 22, 24], 230); });   // glass: a cracked star
  cell(4, (x, y, R) => { disc(x, y, R * .5, [60, 48, 36], 110, 1); disc(x, y, R * .25, [30, 24, 18], 200, .8); });   // dirt / sand: a soft dark spot
  cell(5, (x, y, R) => { for (let k = 0; k < 10; k++) { const a = rnd() * 6.283, d = R * (.2 + rnd() * .2); disc(x + Math.cos(a) * d, y + Math.sin(a) * d, R * (.1 + rnd() * .1), [236, 232, 222], 150); } disc(x, y, R * .3, [140, 134, 124], 190); disc(x, y, R * .14, [20, 18, 16], 245); });   // plaster: white chips
  cell(6, (x, y, R) => { for (let k = 0; k < 6; k++) ray(x, y, rnd() * 6.283, R * (.4 + rnd() * .5), R * .02, [40, 40, 40], 160); disc(x, y, R * .22, [90, 88, 86], 200); disc(x, y, R * .11, [14, 14, 14], 245); });   // tile: cracks
  cell(7, (x, y, R) => { disc(x, y, R * .3, [40, 40, 40], 200); disc(x, y, R * .14, [8, 8, 8], 250); });
  return A;
}

// An attribute's upload, widened by every write in a frame (v53 MAP fix: each impact used to clear the ranges and set
// its own, so of several impacts in one frame — a shotgun's pellets, a wallbang's entry and exit, replayed shots — only
// the last reached the GPU). three uploads an attribute's updateRanges at the next render and then empties them; until
// then every write here widens the one pending range — the attribute's own range object, made once with it (gdR), so
// nothing is allocated — and a full upload (a ring wrap, clearHoles) stays full.
function dirty(a, start, count) { const R = a.gdR, U = a.updateRanges;
  if (U.length !== 1 || U[0] !== R) { U.length = 0; R.start = start; R.count = count; U.push(R); }
  else { const e = Math.max(R.start + R.count, start + count); R.start = Math.min(R.start, start); R.count = e - R.start; }
  a.needsUpdate = true; }
function quad(n, attrs) { const p = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry(); g.index = p.index; g.setAttribute('position', p.getAttribute('position')); g.setAttribute('uv', p.getAttribute('uv')); g.instanceCount = n;
  const out = {}; for (const [k, s] of attrs) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * s), s); a.setUsage(THREE.DynamicDrawUsage); a.gdR = { start: 0, count: 0 }; g.setAttribute(k, a); out[k] = a; } return { g, a: out }; }
const PATTR = [['aP', 4], ['aV', 4], ['aS', 4], ['aM', 4], ['aC', 4], ['aE', 4], ['aK', 4], ['aH', 4], ['aB', 4], ['aF', 4]];
// (the planned float each attribute's 4 lanes take: aP 0–2 + its birth, aV 3–6, aS 7–10, aM 11–14, aC 15–18, aE 19–22, aK 23–26, aH 28–31, aB 32–35, aF 36–39: the landing — or, with no landing (36 = −1), 37: the wall cut's moment)
const LANE = [0, 3, 7, 11, 15, 19, 23, 28, 32, 36];

// ── the pools ───────────────────────────────────────────────────────────────────────────────────────────────────────
// opts: detail() → 0–3 (Low … Ultra: CS2's particle detail level), game() → the game state (a new round — Defuse: match
// + round number; Deathmatch: the map — clears the holes, as the blood), on() → false outside a match (nothing drawn,
// the pending ring dropped), sound(mat, x, y, z) → plays a scheduled impact's sound when it lands (another player's
// shot: lab.js — CS2's bullet impact for that surface, one per 35 ms as the shared effects' own), lightAt(x, y, z) →
// the map's baked light there (1 ≈ a sunlit floor; null: 1), floorAt(x, y, z) → the floor's height under a point (world
// units: the sparks and flecks with CS2's WorldTraceConstraint land and bounce on it; null: a floor hit's own only).
export function createImpacts(scene, { detail = () => 2, game = () => null, on = () => true, sound = null, lightAt = null, floorAt = null, wallAt = null, eye = listenerPos } = {}) {   // (wallAt(ax, ay, az, bx, by, bz, out): v53 DETAILS — the first wall crossing's fraction on a→b (Infinity: none), its normal into out; null: no wall traces)   // (eye(out): the camera's spot into out, or null — CP6; v53 HITS)
  const t0 = performance.now(); let held = null; const now = () => held ?? (performance.now() - t0) / 1000;
  const mk = (n, blending) => { const q = quad(n, PATTR), mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPx: { value: 2 / 1080 }, uLight: { value: 1 }, uHaloPx: { value: HALO_PX } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending });
    mat.userData.shared = true; const m = new THREE.Mesh(q.g, mat); m.frustumCulled = false; m.visible = false; m.matrixAutoUpdate = false; m.userData.gd = true; m.userData.warm = true; m.userData.noPool = true; m.userData.fx = true; scene?.add(m); return { q, mat, m, head: 0, end: -1, list: Object.values(q.a) }; };
  const ADD = mk(ADD_N, THREE.AdditiveBlending), AL = mk(ALPHA_N, THREE.NormalBlending); ADD.m.name = 'gd-impact-sparks'; AL.m.name = 'gd-impact-dust';
  const holesTex = new THREE.DataTexture(builtinHoles(), 512, 256, THREE.RGBAFormat); holesTex.colorSpace = THREE.SRGBColorSpace; holesTex.magFilter = THREE.LinearFilter; holesTex.minFilter = THREE.LinearMipmapLinearFilter; holesTex.generateMipmaps = true; holesTex.needsUpdate = true;
  const dq = quad(DECAL_N, [['aC', 4], ['aU', 4], ['aW', 4]]), decalMat = new THREE.ShaderMaterial({ uniforms: { uCells: { value: 4 }, uMap: { value: holesTex } }, vertexShader: DVS, fragmentShader: DFS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
  decalMat.userData.shared = true; const holes = new THREE.Mesh(dq.g, decalMat); holes.name = 'gd-impact-holes'; holes.frustumCulled = false; holes.visible = false; holes.matrixAutoUpdate = false; holes.renderOrder = -1; holes.userData.gd = true; holes.userData.warm = true; holes.userData.noPool = true; scene?.add(holes);
  let dHead = 0, dCount = 0; const DL = [dq.a.aC, dq.a.aU, dq.a.aW];
  const PB = new Float32Array(MAX_HIT * PK);
  // the impacts waiting for their bullet (tracer speed): when, where, the normal, the bullet, the kind (an index into KINDS), the decal, loud, the shot's length (−1: none)
  const PVN = 13;
  const KINDS = ['metal', 'concrete', 'plaster', 'tile', 'wood', 'glass', 'dirt'], KI = {}; KINDS.forEach((k, i) => { KI[k] = i; });
  const PT = new Float64Array(PEND_N), PV = new Float32Array(PEND_N * PVN), matOf = new Array(PEND_N).fill(null); let pHead = 0, pN = 0, impacts = 0, dropped = 0, heardAt = -1, lastAt = -1, cheap = 0;
  // live metal impacts (their end times: CS2's fallback count), a fixed ring
  const LIVE_N = 32, live = new Float64Array(LIVE_N).fill(-1); let liveHead = 0;
  const liveCount = t => { let c = 0; for (let k = 0; k < LIVE_N; k++) if (live[k] > t) c++; return c; };
  const floorUnder = (x, y, z, ny) => ny > .7 ? y : floorAt ? floorAt(x, y, z) : NaN;   // (a floor hit lands on its own floor; else the floor under it)
  const shadeAt = (x, y, z, nx, ny, nz) => lightAt ? shadeOf(lightAt(x + nx * 2 * HU, y + ny * 2 * HU, z + nz * 2 * HU)) : 1;
  // the round, compared field by field (no key string per frame — gd-blood.js's rule)
  let kMode, kMap, kMatch, kN, kSeen = false;
  const roundChanged = G => { const mode = G?.mode === 'arena', d = mode ? G.combat?.d : null, map = mode ? G.arena?.map ?? null : null, match = d ? d.match ?? null : null, n = d ? d.n ?? null : null;
    if (kSeen && mode === kMode && map === kMap && match === kMatch && n === kN) return false; const first = !kSeen; kSeen = true; kMode = mode; kMap = map; kMatch = match; kN = n; return !first; };
  // Write n planned particles (PB) into a pool at time t; only their slots are uploaded.
  function spawn(P, n, t) {
    const A = P.list; let lo = P.head, wrapped = false;
    for (let j = 0; j < n; j++) { const o = j * PK, q = P.head * 4; P.head = (P.head + 1) % P.q.g.instanceCount; if (P.head === 0) wrapped = true;
      for (let k = 0; k < LANE.length; k++) { const arr = A[k].array, s = o + LANE[k]; arr[q] = PB[s]; arr[q + 1] = PB[s + 1]; arr[q + 2] = PB[s + 2]; arr[q + 3] = PB[s + 3]; }
      A[0].array[q + 3] = t + PB[o + 27];   // (aP.w: the birth)
      if (t + PB[o + 6] > P.end) P.end = t + PB[o + 6]; }
    for (let k = 0; k < A.length; k++) { const a = A[k]; if (wrapped || P.head < lo) dirty(a, 0, a.count * a.itemSize); else dirty(a, lo * a.itemSize, (P.head - lo) * a.itemSize); }
    P.m.visible = true;
  }
  // One planned list into the two pools (the additive kinds first, then the alpha ones: each pool gets its own run).
  const EYE = { x: 0, y: 0, z: 0 }; let lastCp6 = 1, frameN = 0, wallFrame = -1;   // (frameN: update()'s count — the wall traces' budget is a frame's)
  const PB2 = new Float32Array(MAX_HIT * PK), copy = (j, k) => { const a = j * PK, b = k * PK; for (let q = 0; q < PK; q++) PB[b + q] = PB2[a + q]; };
  // kind: the surface (its parent's CP6 remap, CP6_OF); len: the shot's length in HU (CP5 = the shot's start) — not
  // given, the distance from your eye (exact for your own shots; another player's measured from you: ours, marked).
  function emit(list, px, py, pz, nx, ny, nz, dx, dy, dz, s, t, light = 1, floor = NaN, kind = null, len = NaN) {
    const E = eye?.(EYE), dv = E ? Math.hypot(px - E.x, py - E.y, pz - E.z) / HU : NaN, c6 = cp6Of(CP6_OF[kind], Number.isFinite(len) && len > 0 ? len : dv), c6d = cp6Of(CP6_DARKEN, dv); lastCp6 = c6;
    if (wallFrame !== frameN) { wallFrame = frameN; WALL.left = WALL_BUDGETS[Math.max(0, Math.min(3, detail() | 0))]; } WALL.at = wallAt;   // (v53 DETAILS: the walls' trace budget, a frame's)
    const n = planImpact(list, px, py, pz, nx, ny, nz, dx, dy, dz, s, detail(), PB2, MAX_HIT, light, floor, c6, c6d); WALL.at = null; let na = 0, nb = 0; lastAt = t;
    for (let j = 0; j < n; j++) if (ADDITIVE(PB2[j * PK + 23])) { copy(j, na); na++; }   // (copied by hand: a subarray() is an object per particle)
    if (na) spawn(ADD, na, t);
    for (let j = 0; j < n; j++) if (!ADDITIVE(PB2[j * PK + 23])) { copy(j, nb); nb++; }
    if (nb) spawn(AL, nb, t);
    return n;
  }
  // A surface's list now: its CS2 fallback past m_nFallbackMaxCount live impacts of that kind (metal: 15).
  function listFor(kind, t) { const F = FALLBACK[kind]; if (!F) return FX[kind];
    const use = liveCount(t) >= F.max; live[liveHead] = t + FB_LIFE[kind]; liveHead = (liveHead + 1) % LIVE_N; if (use) { cheap++; return F.list; } return FX[kind]; }
  // A hole on the surface at the hit (quad along the face: right / up axes from the normal, a random spin), its CS2 size, its shade.
  function hole(px, py, pz, nx, ny, nz, mat, s, light = 1) {
    const D = decalOf(mat), size = D[0], vari = D[1], cellI = D[2]; seed(s ^ 0x9E37); basis(nx, ny, nz, F0, F1, F2);
    const sc = size * (1 - vari * .5 * rnd()) * HU * .5, a = rnd() * Math.PI * 2, ca = Math.cos(a) * sc, sa = Math.sin(a) * sc, DN = Math.min(DECAL_N, gdPresetNow().decals || DECAL_N); if (dHead >= DN) dHead = 0; const q = dHead * 4; dHead = (dHead + 1) % DN; if (dCount < DN) dCount++;   /* (v53 stage 6: the preset's decal cap — Low 64, Very Low 32 of the pool's 128 — the ring reused sooner) */
    const C = dq.a.aC.array, U = dq.a.aU.array, Wv = dq.a.aW.array, lift = .02 * HU;
    C[q] = px + nx * lift; C[q + 1] = py + ny * lift; C[q + 2] = pz + nz * lift; C[q + 3] = light;
    U[q] = F0[0] * ca + F1[0] * sa; U[q + 1] = F0[1] * ca + F1[1] * sa; U[q + 2] = F0[2] * ca + F1[2] * sa; U[q + 3] = cellI;
    Wv[q] = -F0[0] * sa + F1[0] * ca; Wv[q + 1] = -F0[1] * sa + F1[1] * ca; Wv[q + 2] = -F0[2] * sa + F1[2] * ca; Wv[q + 3] = 1;
    for (let k = 0; k < DL.length; k++) dirty(DL[k], q, 4);
    holes.visible = true;
  }
  // An impact now: the surface `mat` at (px, py, pz), its normal toward the shooter, the bullet's direction. mark: false
  // draws no hole (a crossing's exit, a ricochet). Returns the emitter set used.
  function hit(px, py, pz, nx, ny, nz, dx, dy, dz, mat, mark = true, t = now(), len = NaN) {
    const kind = impactOf(mat), s = hitSeed(px, py, pz), L = shadeAt(px, py, pz, nx, ny, nz); impacts++;
    emit(listFor(kind, t), px, py, pz, nx, ny, nz, dx, dy, dz, s, t, L, floorUnder(px, py, pz, ny), kind, len); if (mark) hole(px, py, pz, nx, ny, nz, mat, s, L);
    return kind;
  }
  // Later: when its bullet arrives (`delay` s from now) — the shot's tracer flies at TRACER.speed.
  function schedule(delay, px, py, pz, nx, ny, nz, dx, dy, dz, mat, mark = true, loud = false, len = NaN) {   // (len: the shot's length, HU — optional, CP6)
    if (!on()) return false; if (pN >= PEND_N) { dropped++; return false; }
    const i = (pHead + pN) % PEND_N, o = i * PVN; pN++; PT[i] = now() + Math.max(0, delay);
    PV[o] = px; PV[o + 1] = py; PV[o + 2] = pz; PV[o + 3] = nx; PV[o + 4] = ny; PV[o + 5] = nz; PV[o + 6] = dx; PV[o + 7] = dy; PV[o + 8] = dz; PV[o + 9] = KI[impactOf(mat)] ?? 1; PV[o + 10] = mark ? 1 : 0; PV[o + 11] = loud ? 1 : 0; PV[o + 12] = Number.isFinite(len) ? len : -1;
    matOf[i] = mat; return true;
  }
  // The helmet dink's extra CS2 children at the head (gd-blood.js calls it with the record: the hit point, the bullet).
  function dink(rec, t = now()) { if (!rec?.p || !rec?.r) return 0; const dx = +rec.r[0], dy = +rec.r[1], dz = +rec.r[2], l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return emit(DINK_EXTRA, +rec.p[0], +rec.p[1], +rec.p[2], -dx / l, -dy / l, -dz / l, dx / l, dy / l, dz / l, (Math.floor(+rec.i || 0) * 2654435761) >>> 0, t, shadeAt(+rec.p[0], +rec.p[1], +rec.p[2], 0, 0, 0), floorUnder(+rec.p[0], +rec.p[1], +rec.p[2], 0)); }
  function clearHoles() { const at = dq.a.aW; at.array.fill(0); dirty(at, 0, at.array.length); dHead = 0; dCount = 0; holes.visible = false; }   // (a full upload, kept full by the holes after it in that frame)
  function update() {
    frameN++; const t = now(); ADD.mat.uniforms.uTime.value = t; AL.mat.uniforms.uTime.value = t;
    if (!on()) { pN = 0; if (holes.visible) clearHoles(); ADD.m.visible = AL.m.visible = false; return; }
    if (roundChanged(game()) && holes.visible) clearHoles();
    while (pN && PT[pHead] <= t) { const o = pHead * PVN, mat = matOf[pHead]; matOf[pHead] = null;
      const kind = KINDS[PV[o + 9] | 0] || 'concrete', s = hitSeed(PV[o], PV[o + 1], PV[o + 2]), L = shadeAt(PV[o], PV[o + 1], PV[o + 2], PV[o + 3], PV[o + 4], PV[o + 5]); impacts++;
      emit(listFor(kind, t), PV[o], PV[o + 1], PV[o + 2], PV[o + 3], PV[o + 4], PV[o + 5], PV[o + 6], PV[o + 7], PV[o + 8], s, t, L, floorUnder(PV[o], PV[o + 1], PV[o + 2], PV[o + 4]), kind, PV[o + 12]); if (PV[o + 10]) hole(PV[o], PV[o + 1], PV[o + 2], PV[o + 3], PV[o + 4], PV[o + 5], mat, s, L);
      if (PV[o + 11] && sound && t - heardAt >= .035) { heardAt = t; sound(mat, PV[o], PV[o + 1], PV[o + 2]); }
      pHead = (pHead + 1) % PEND_N; pN--; }
    if (ADD.m.visible && t > ADD.end) ADD.m.visible = false; if (AL.m.visible && t > AL.end) AL.m.visible = false;
  }
  return { sparks: ADD.m, dust: AL.m, holes, update, hit, schedule, dink, clearHoles,
    get stats() { return { impacts, pending: pN, dropped, holes: dCount, addHead: ADD.head, alphaHead: AL.head, sparksAlive: ADD.m.visible, dustAlive: AL.m.visible, cheap }; },
    get pools() { return { add: ADD.q.a, alpha: AL.q.a, holes: dq.a }; }, get lastAt() { return lastAt; }, get lastCp6() { return lastCp6; },   // (tests and pictures: when the last impact was drawn)
    setViewHeight(h) { if (h > 0) { ADD.mat.uniforms.uPx.value = AL.mat.uniforms.uPx.value = 2 / h; ADD.mat.uniforms.uHaloPx.value = AL.mat.uniforms.uHaloPx.value = HALO_PX * Math.max(1, h / 1080); } },
    setLight(v) { AL.mat.uniforms.uLight.value = v; },
    hold(t) { held = t; }, release() { held = null; }, now,
    warmObjects() { const a = new THREE.Mesh(ADD.q.g, ADD.mat), b = new THREE.Mesh(AL.q.g, AL.mat), c = new THREE.Mesh(dq.g, decalMat); a.frustumCulled = b.frustumCulled = c.frustumCulled = false; return [a, b, c]; },
    dispose() { for (const o of [ADD.m, AL.m, holes]) scene?.remove(o); ADD.q.g.dispose(); AL.q.g.dispose(); dq.g.dispose(); ADD.mat.dispose(); AL.mat.dispose(); decalMat.dispose(); holesTex.dispose(); } };
}
