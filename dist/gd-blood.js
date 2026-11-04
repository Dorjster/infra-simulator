// Global Defensive blood, as CS2 draws it. On every bullet or knife hit the host confirms (combat-logic.js bleed: the
// combat state's `bl`, the last 1.5 s of hits — where the bullet met the body, its direction, the zone, the damage, a
// rising number i), every computer in the room draws the same blood, seeded by that number:
//  · the impact spray (CS2's particles/blood_impact/blood_impact_{low,med,high}): a splash and small puffs back toward
//    the shooter (vis_spray, low_forw_spray), a red mist and fast streaks out of the exit side (mist_away, spray_away),
//    and a falling trail whose drops land on the floor (vis_spray_trail → *_ground_decal). The tier follows the damage
//    (a weak armoured body shot: low, still a small spray); a head shot is high plus blood_impact_headshot.vpcf and its
//    children (v53 HITS: 01b, 01c wisps, 01d, 01e, red_01_chunk ×2, red_01_backspray), each emitter with its own CS2
//    screen-size cap and fade, FadeOut window and radius curve (EMIT below);
//  · decals: a splat on the wall or floor behind the victim along the shot line (within CS2's 172 HU, a little noise
//    per extra splat — CS:GO's TraceBleed), splats where the trail's drops land (CS2's ground decals, placed on the
//    ground below, turned away from the shooter) and a drip under the wound. They lie on the map's real surface (the
//    triangle or box face the line meets, as weapons.js's impact marks), shrink until all four corners sit on that
//    surface (never hanging over an edge in the air), stay for the round and go at the next one (or at a map change).
// The numbers below are CS2's (HU, seconds; its vpcf files: counts at the High detail level, speeds, sizes, lifetimes,
// gravity, drag, colours) converted to game units (HU). Drag: CS2's per-tick fDrag read as a rate of fDrag × 30 /s (ours).
// Engine rules (any stutter is a bug): both pools are made once — SPRAY_N particles, DECAL_N decals, each ONE draw
// (an instanced quad), recycled oldest first. The particles fly on the GPU (each keeps its start, velocity and birth;
// the vertex shader moves it — exponential drag and gravity, CS2's radius ramp, flipbook, fade): a frame writes one
// uniform. A hit writes its few particles and decals into the pools' arrays (nothing allocated). Decal placement casts
// rays (arena-maps.js bulletPath, pooled) — one record's decals per frame at most. The spray draws after a smoke
// (userData.fx: arena-smoke-pass.js — in front of a cloud it shows, inside or behind it doesn't); the decals draw
// with the map (multiplied onto what is already lit there: shade, light maps and smoke over them stay right).
// Textures: CS2's own blood (the decal splats, the spray flipbooks, the drop) when tools/import-cs2-blood.mjs put them
// in user-assets (models.blood: never shipped), else built-in procedural ones of the same layout. A picture arriving
// mid-round waits for a quiet moment (not in a live round) before it is sent to the GPU; both start in the warm-ups
// (top-level userData.gd objects: lab.js's match warm-up and app.js's freeze-time rehearsal, userData.warm).
// Settings → Global Defensive → Blood (live.blood, default on): off hides it at once and draws none.
// Your own wounds (and, spectating, the watched player's) spray nothing in your view (CS2: no impact on your own body
// in first person); their decals are drawn as for everyone.
// v53 (Addendum 6, stage 3): the headshot "dink" — a headshot on a HELMET (the record's hm, combat-logic.js hitMarks) also
// throws CS2's helmet impact (particles/impact_fx/impact_helmet_headshot.vpcf and its children _spark and _glow, the
// user's install, decompiled with Source2Viewer-CLI): electric blue-white spark trails back toward the shooter, two
// long fast streaks out through the head and a brief bright flare at the helmet — DINK below, every number from those
// files. A third pool (DINK_N trail / sprite quads, ONE additive draw, warmed with the others), written from the same
// host records, so everyone who can see the head sees the same sparks; a bare head gets the blood only. Not your own
// head in first person (as the spray). The sparks are not blood: Settings → Blood off leaves them.
// Its other CS2 children (impact_generic_smoke_small, ricochet_sparks, impact_metal_sparks_trailing,
// impact_metal_child_glow2) are drawn by gd-impacts.js (DINK_EXTRA) through onDink — v53 stage 5;
// blood_impact_friendly_flash is CS2's friendly-fire flash, not drawn.
import * as THREE from './three.module.js';
import { HU } from './weapons-data.js';
import { bulletPath, BulletPath } from './arena-maps.js';
import { live } from './live-settings.js';
import { userAssets, userAssetURL } from './user-assets.js';
import { hostNow } from './host-clock.js';
import { listenerFrame } from './spatial-audio.js';   // (v53 HITS: your view's forward, as the camera set it this frame — the local splatter's side)

export const SPRAY_N = 320, DECAL_N = 48;   // (v53 HITS: CS2's head-shot children are ~140 particles a head shot — two at once fit)
export const KEEP_MS = 1500;   // a record older than this (host ms) is not drawn (a join, a stalled stream): the host keeps them as long
export const SPRAY_GRID = 8, DECAL_GRID = 4;   // atlas layouts (cells a row), the built-in and the imported alike
// Spray atlas cells: flipbooks of 16 (CS2: blood_spray_top seq 0 / blood_spray_high / blood_spray_top seq 1), the drop
// (blood_drop), a mist puff (blood_splatter_light), a chunk, and (v53 HITS) a 12-frame wisp flipbook (CS2's spray1.vtex:
// a small burst that spreads and thins — its frames cover 48 % → 3 % of their area) for headshot_01c and red_01_backspray.
export const CELL = { splash: 0, streak: 16, puff: 32, drop: 48, mist: 49, chunk: 50, wisp: 51 }, FRAMES = { splash: 16, streak: 16, puff: 16, drop: 1, mist: 1, chunk: 1, wisp: 12 };
// Decal atlas cells: 12 wall splats (CS2 blood_decals_10 / 15 / 22) and 4 drip spots.
export const WALL_CELLS = 12, DROP_CELL0 = 12;

// ── CS2's emitters (HU, s) ──────────────────────────────────────────────────────────────────────────────────────────
// Each: cell, n (High detail), lx (speed along the bullet: + out of the exit side, − back toward the shooter), ly
// (sideways, sign random when `side`), lz (up), sph (a random direction this fast), up (world up added), r (radius
// HU), grow (CS2 InterpolateRadius start → end scale), life, alpha, grav (HU/s²), drag (fDrag), col (sRGB 0–255 min,
// max), st (velocity stretch: the trails).
// v53 HITS (H1, the CS2 feel audit — every value from particles/blood_impact/*.vpcf, the user's install): each emitter's
// own fade and size rules, as CS2's renderer and operators apply them —
//   smax / sf / ef — the renderer's m_flMaxSize / m_flStartFadeSize / m_flEndFadeSize: the share of the screen a sprite
//     may cover (its projected diameter over the view's height, 2r / (d · 2 tan(fov / 2))), capped at smax, and its alpha
//     faded out between sf and ef (1 − smoothstep). The fade reads the share before the cap (our reading: CS2's code
//     isn't in the files). A renderer without them (CS2's defaults: no cap, no fade) has none here (0).
//   fo — C_OP_FadeOut's flFadeOutTimeMin / Max (a random time per particle; CS2's defaults .25 / .25 where the file
//     leaves one out), fp: 0 when bProportional is false (seconds, else a share of the life; CS2's default true). The fade
//     eases in and out (bEaseInAndOut, CS2's default: smoothstep) over that window at the end of the life. fs:
//     C_OP_FadeOutSimple (a linear fade over that last share of the life) or C_OP_FadeAndKill's fade-out start (.5 of
//     the life, linear, its defaults).
//   rb / gs — InterpolateRadius flBias (Source's Bias(t, b) = t^(ln b / ln .5)) and flStartTime (before it, the start
//     scale; our reading of the window, so nothing jumps).
//   lb — the life's EXPONENTIAL bias (PF_BIAS_TYPE_EXPONENTIAL, as gd-impacts.js: u^((1 − p) / (1 + p))); fwd / off — a
//   PositionOffset along the bullet and up (HU); pos — a start sphere's radius [min, max] (HU); ob — the renderer's
//   flOverbrightFactor; tex — the CS2 texture's own mean tint the colour multiplies (alpha-weighted, measured from the
//   decompiled .vtex: headshot.vtex sequences 0–2 (119,57,43), 3–6 (67,25,11), 5–9 (79,41,28), spray1 (149,159,105),
//   particle_pebble_1 (132,136,137)); our built-in pictures are grey, so the tint keeps CS2's colour on them. Only the
//   coloured texture (headshot.vtex) tints: spray1 and the pebble are neutral (a mask the vertex colour paints —
//   multiplying their grey in made the wisps black on the picture sheet), their light already in the shader's luminance.
const RED = [[92, 0, 0], [101, 0, 0]], SPR = [[118, 12, 12], [150, 14, 14]], TRL = [[139, 4, 4], [178, 11, 11]];
const HS02 = [119, 57, 43], HS36 = [67, 25, 11], HS59 = [79, 41, 28], SPRAY1 = [149, 159, 105], PEBBLE = [132, 136, 137];
const forw = { src: 'blood_impact_low_forw_spray', cell: 'puff', n: 3, lx: [-150, -250], ly: [-12, 15], lz: [-15, 15], r: [5, 8], grow: [.1, 3], rb: .65, gs: .3, life: [.35, .75], alpha: [.78, .86], grav: 0, drag: .2, col: SPR, fo: [.25, .25], smax: .1, sf: .354, ef: .75 };   // low_forw_spray (all tiers; its two renderers: max .1, fade .5–1 and .354–.75 — the second, the task's)
export const EMIT = {
  low: [forw,
    { src: 'blood_impact_low_mist_away', cell: 'mist', n: 3, lx: [50, 100], ly: [-50, 50], lz: [-50, 50], sph: [25, 25], up: [50, 50], r: [7, 8], grow: [.25, 2], rb: .85, life: [.5, 1], alpha: [.5, 1], grav: -50, drag: .125, col: RED, fs: 0, smax: .6, sf: .2, ef: .3 },   // low_mist_away (FadeOutSimple 1)
    { src: 'blood_impact_low_vis_spray_trail', cell: 'streak', n: 3, lx: [200, 350], ly: [50, 50], side: 1, sph: [50, 50], up: [25, 50], r: [16, 32], rs: .3, grow: [.25, 1], rb: .25, life: [.5, .65], alpha: [1, 1], grav: -450, drag: .1, col: TRL, st: .06, trail: 1, fo: [.125, .25], sf: .1, ef: .2 }],   // low_vis_spray_trail (v53 HITS: 3 — its LOD2 count; it was 2)
  med: [forw,
    { src: 'blood_impact_med_vis_spray', cell: 'splash', n: 3, lx: [-50, -120], ly: [-12, 15], lz: [-15, 15], r: [11, 16], grow: [.1, 2], rb: .52, life: [.5, .7], alpha: [.78, .86], grav: -250, drag: .05, col: SPR, fo: [.5, .6], smax: .85, sf: .5, ef: 1 },   // med_vis_spray
    { src: 'blood_impact_med_vis_spray_trail', cell: 'streak', n: 2, lx: [120, 250], sph: [50, 50], up: [25, 50], r: [14, 20], rs: .3, grow: [.25, 2], life: [.5, .75], alpha: [1, 1], grav: -450, drag: .05, col: TRL, st: .06, trail: 1, fo: [.125, .25], sf: .1, ef: .2 },   // med_vis_spray_trail
    { src: 'blood_impact_med_mist_away', cell: 'mist', n: 4, lx: [75, 250], ly: [20, 50], side: 1, lz: [-50, 50], sph: [35, 65], up: [30, 50], r: [9, 12], grow: [.25, 3], rb: .75, life: [.5, 1], alpha: [.3, .65], grav: -50, drag: .135, col: RED, fo: [.6, 1], smax: .6, sf: .2, ef: .3 },   // med_mist_away
    { src: 'blood_impact_med_spray_away', cell: 'streak', n: 1, lx: [250, 450], sph: [50, 50], r: [4, 8], grow: [.25, 2], life: [.5, .65], alpha: [1, 1], grav: -450, drag: .05, col: TRL, st: .05, fo: [.125, .25], sf: .1, ef: .2 }],   // med_spray_away
  high: [forw,
    { src: 'blood_impact_high_vis_spray', cell: 'splash', n: 2, lx: [-50, -120], r: [14, 20], grow: [.25, 1], rb: .75, life: [.5, .75], alpha: [1, 1], grav: -100, drag: .05, col: SPR, fo: [.125, .5], smax: .85, sf: .5, ef: 1 },   // high_vis_spray
    { src: 'blood_impact_high_vis_spray_trail', cell: 'streak', n: 1, lx: [100, 200], ly: [50, 50], side: 1, up: [25, 50], r: [16, 32], rs: .3, grow: [.25, 2], life: [.5, .75], alpha: [1, 1], grav: -550, drag: .05, col: TRL, st: .06, trail: 1, fo: [.125, .25], sf: .1, ef: 1 },   // high_vis_spray_trail
    { src: 'blood_impact_high_mist_away', cell: 'mist', n: 4, lx: [120, 200], ly: [50, 75], side: 1, lz: [-50, 50], sph: [80, 80], up: [30, 50], r: [10, 15], grow: [.25, 3], rb: .85, life: [.75, 1.25], alpha: [.3, .65], grav: -50, drag: .15, col: RED, fo: [.65, 1], smax: .6, sf: .2, ef: .3 },   // high_mist_away
    { src: 'blood_impact_high_spray_away', cell: 'streak', n: 2, lx: [200, 400], sph: [50, 50], r: [8, 16], rs: .5, grow: [.25, 4], life: [.35, .75], alpha: [1, 1], grav: -450, drag: .05, col: TRL, st: .05, fo: [.125, .25], sf: .1, ef: .15 }],   // high_spray_away
  // Head shots: high plus blood_impact_headshot.vpcf's own sprites and its children (01b, red_01_chunk ×2,
  // red_01_backspray, 01e, 01c, 01d — its m_Children, in that order). Which system CS2's code fires for a head shot is
  // not in the files (blood_impact_headshot is the one named for it; blood_impact_light_headshot is another): ours.
  // red_01_mist and drops1 (v53 S3's head-shot extras) are not its children and are gone. VelocityFromCP (control
  // points 1 / 2: set by the game's code, not in the files) is left out.
  head: [
    { src: 'blood_impact_headshot', cell: 'splash', n: 12, lx: [50, 120], up: [80, 170], sph: [0, 50], pos: [0, 4], off: 8, r: [1, 2.5], grow: [1, 1], life: [.5, 1], alpha: [1, 1], grav: -405, drag: .005125, col: [[78, 0, 0], [71, 30, 30]], tex: HS59, fo: [.25, .25], fp: 0 },   // headshot (its own sprites: sequences 5–9)
    { src: 'blood_impact_headshot_01b', cell: 'splash', n: 16, lx: [50, 90], up: [70, 190], sph: [0, 80], pos: [0, 4], off: 8, r: [.25, 2], grow: [1, 1], life: [.2, 1.4], lb: .5, alpha: [1, 1], grav: -450, drag: .005125, col: [[249, 177, 177], [85, 55, 55]], tex: HS02, fo: [.125, .15], fp: 0 },   // headshot_01b
    { src: 'blood_impact_red_01_chunk', cell: 'chunk', n: 22, lx: [130, 190], up: [20, 100], sph: [50, 150], fwd: 6, r: [.2, 1.7], grow: [1, 1], life: [.1, .7], alpha: [1, 1], grav: -400, drag: .1, col: [[123, 0, 0], [77, 0, 0]], fs: .5 },   // red_01_chunk (FadeAndKill)
    { src: 'blood_impact_red_01_backspray', cell: 'wisp', n: 25, lx: [0, 420], ly: [-80, 80], up: [-15, 180], pos: [0, 8], fwd: 4, r: [2, 4], grow: [1, 5], rb: .4, gs: .25, life: [.2, .8], alpha: [.784314, 1], grav: -500, drag: .015, col: [[115, 0, 0], [83, 0, 0]], ob: .5, fo: [.25, .25], fp: 0, smax: .85, sf: .675, ef: .75 },   // red_01_backspray
    { src: 'blood_impact_red_01_chunk', cell: 'chunk', n: 22, lx: [130, 190], up: [20, 100], sph: [50, 150], fwd: 6, r: [.2, 1.7], grow: [1, 1], life: [.1, .7], alpha: [1, 1], grav: -400, drag: .1, col: [[123, 0, 0], [77, 0, 0]], fs: .5 },   // red_01_chunk (its second copy)
    { src: 'blood_impact_headshot_01e', cell: 'splash', n: 1, lx: [50, 160], ly: [-35, 35], up: [90, 110], sph: [20, 40], pos: [4, 4], off: 8, r: [5, 6], grow: [1, .9], life: [.9, 1.3], lb: .5, alpha: [1, 1], grav: -405, drag: .015125, col: [[36, 21, 21], [53, 28, 28]], tex: HS36, fo: [.25, .25], fp: 0 },   // headshot_01e
    { src: 'blood_impact_headshot_01c', cell: 'wisp', n: 8, lx: [115, 385], ly: [-40, 40], up: [44, 170], sph: [20, 100], pos: [5, 7], offr: [0, 16], r: [7, 10], grow: [3, 3], rb: .65, life: [.6, .8], alpha: [.862745, 1], grav: -400, drag: .005, col: [[70, 0, 0], [109, 2, 2]], ob: .5, fo: [.125, .25], fp: 0, smax: .85, sf: .675, ef: .75 },   // headshot_01c (wisps: spray1.vtex — the wispy cell, not the chunk)
    { src: 'blood_impact_headshot_01d', cell: 'splash', n: 32, lx: [110, 200], ly: [-50, 50], up: [40, 150], sph: [50, 180], pos: [4, 4], off: 8, r: [.5, 1], grow: [1, .5], life: [.2, .7], lb: .5, alpha: [1, 1], grav: -405, drag: .005125, col: [[92, 63, 63], [239, 148, 148]], tex: HS02, fo: [.125, .35], fp: 0 }],   // headshot_01d
};
// Decals per tier: behind the victim along the shot (CS:GO TraceBleed: 1 / 2 / more by damage, noise .1 / .2 / .3 on the
// direction, 172 HU), where the trail lands (CS2 ground decals: radius 20–30 low, 30–40 med / high, warped .4–.75 of the
// way, traced down 256 HU from 32 HU above), a drip under the wound. Sizes: full width, HU (CS2's decal vmats: 35–72).
export const DECALS = { reach: 172, floorUp: 32, floorDown: 256, warp: [.4, .75], drip: [10, 16],
  low: { wall: 1, noise: .1, size: [30, 38], floor: 1, floorR: [20, 30] }, med: { wall: 1, noise: .2, size: [38, 50], floor: 1, floorR: [30, 40] }, high: { wall: 2, noise: .3, size: [44, 60], floor: 2, floorR: [30, 40] } };
// The tier for a hit: head shots high; else by the damage taken (CS2 picks low / med / high by the hit).
export const tierOf = rec => rec.z === 'head' || rec.d >= 60 ? 'high' : rec.d >= 25 ? 'med' : 'low';
const LISTS = { low: [EMIT.low], med: [EMIT.med], high: [EMIT.high], head: [EMIT.high, EMIT.head] }, TRAIL = { low: EMIT.low.find(e => e.trail), med: EMIT.med.find(e => e.trail), high: EMIT.high.find(e => e.trail) };

// ── deterministic randomness: the same record gives the same blood everywhere ────────────────────────────────────────
const SS = new Int32Array([1]);   // (the state in a typed array: a module variable past ±2^30 is a boxed number, one allocation per draw — v53)
const seed = s => { SS[0] = (s >>> 0) || 1; }, rnd = () => { const S = SS[0] = (SS[0] + 0x6D2B79F5) | 0; let t = Math.imul(S ^ (S >>> 15), 1 | S); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a) => a[0] + (a[1] - a[0]) * rnd();
const hashStr = s => { let h = 2166136261; for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619); return h >>> 0; };
const recSeed = (rec, salt) => (Math.floor(+rec.i) % 2147483647) ^ hashStr(String(rec.v || '')) ^ salt;
const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };   // sRGB → linear (the shaders' output turns it back)

// A record's frame: D the bullet's direction, L sideways (horizontal), U up.
const D = [0, 0, 0], L = [0, 0, 0];
function frame(rec) { let x = +rec.r[0], y = +rec.r[1], z = +rec.r[2]; const n = Math.sqrt(x * x + y * y + z * z) || 1;   // (sqrt, not hypot: no boxed numbers per hit — v53)
  x /= n; y /= n; z /= n; D[0] = x; D[1] = y; D[2] = z;
  let lx = -z, lz = x; const ln = Math.sqrt(lx * lx + lz * lz); if (ln < 1e-4) { lx = 1; lz = 0; } else { lx /= ln; lz /= ln; } L[0] = lx; L[1] = 0; L[2] = lz; }
const fin3 = a => Array.isArray(a) && a.length === 3 && Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]);   // (v53: unrolled — every() / hypot() cost an allocation per hit)
export const validRecord = r => !!r && Number.isFinite(+r.i) && fin3(r.p) && fin3(r.r) && r.r[0] * r.r[0] + r.r[1] * r.r[1] + r.r[2] * r.r[2] > 1e-12;

// ── the spray: a record → particles (pure) ───────────────────────────────────────────────────────────────────────────
// Each particle: SP floats — start x y z, velocity x y z, life, radius, grow0, grow1, gravity, drag (/s), rotation,
// first cell, frames, stretch, r g b (linear), alpha, delay; (v53 HITS) 21 the screen cap (smax), 22 / 23 the screen
// fade (sf, ef), 24 the fade-out's start as a share of the life (+ 10: linear), 25 the radius bias, 26 its start time.
// Returns how many (at most MAX_PER_HIT).
export const SP = 28, MAX_PER_HIT = 160;
// CS2's PF_BIAS_TYPE_EXPONENTIAL (gd-impacts.js biased: our curve) and the fade-out's start for one particle.
const biased = (u, p) => p ? Math.pow(u, (1 - p) / (1 + p)) : u;
export function fadeStart(e, life) { if (e.fs !== undefined) return 10 + Math.min(.999, e.fs); const F = e.fo || [.25, .25], t = rr(F);
  return Math.max(0, Math.min(.999, e.fp === 0 ? 1 - t / Math.max(1e-3, life) : 1 - t)); }
export function planSpray(rec, out) {
  if (!validRecord(rec)) return 0; frame(rec); seed(recSeed(rec, 0x51)); const list = LISTS[rec.z === 'head' ? 'head' : tierOf(rec)];
  let n = 0; const px = +rec.p[0], py = +rec.p[1], pz = +rec.p[2];
  for (const em of list) for (const e of em) for (let k = 0; k < e.n && n < MAX_PER_HIT; k++) {
    const lx = rr(e.lx), ly = e.ly ? rr(e.ly) * (e.side && rnd() < .5 ? -1 : 1) : 0, lz = e.lz ? rr(e.lz) : 0, sp = e.sph ? rr(e.sph) : 0, up = e.up ? rr(e.up) : 0;
    let sx = 0, sy = 0, sz = 0, ux = 0, uy = 0, uz = 0; if (sp || e.pos) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u); ux = q * Math.cos(a); uy = u; uz = q * Math.sin(a); sx = ux * sp; sy = uy * sp; sz = uz * sp; }
    const o = n * SP, cr = rnd(), r0 = rr(e.r) * (e.rs || 1), pr = e.pos ? rr(e.pos) : 0, f0 = e.fwd || 0, o0 = e.off || (e.offr ? rr(e.offr) : 0);
    if (e.pos) { out[o] = px + (ux * pr + D[0] * f0) * HU; out[o + 1] = py + (uy * pr + D[1] * f0 + o0) * HU; out[o + 2] = pz + (uz * pr + D[2] * f0) * HU; }   // (v53 HITS: CS2's start sphere and PositionOffset)
    else { out[o] = px + ((rnd() - .5) * 2 + D[0] * f0) * HU; out[o + 1] = py + ((rnd() - .5) * 2 + D[1] * f0 + o0) * HU; out[o + 2] = pz + ((rnd() - .5) * 2 + D[2] * f0) * HU; }   // (CS2: within 2 HU)
    out[o + 3] = (D[0] * lx + L[0] * ly + sx) * HU; out[o + 4] = (D[1] * lx + lz + up + sy) * HU; out[o + 5] = (D[2] * lx + L[2] * ly + sz) * HU;
    const life = e.lb ? e.life[0] + (e.life[1] - e.life[0]) * biased(rnd(), e.lb) : rr(e.life); out[o + 6] = life; out[o + 7] = r0 * HU; out[o + 8] = e.grow[0]; out[o + 9] = e.grow[1]; out[o + 10] = e.grav * HU; out[o + 11] = Math.max(.02, e.drag * 30);
    out[o + 12] = rnd() * Math.PI * 2; out[o + 13] = CELL[e.cell]; out[o + 14] = FRAMES[e.cell]; out[o + 15] = e.st || 0;
    const ob = e.ob || 1, T = e.tex; for (let q = 0; q < 3; q++) out[o + 16 + q] = lin(e.col[0][q] + (e.col[1][q] - e.col[0][q]) * cr) * (T ? lin(T[q]) : 1) * ob;
    out[o + 19] = rr(e.alpha); out[o + 20] = 0;
    out[o + 21] = e.smax || 0; out[o + 22] = e.sf || 0; out[o + 23] = e.ef || 0; out[o + 24] = fadeStart(e, life); out[o + 25] = e.rb || .5; out[o + 26] = e.gs || 0; out[o + 27] = 0; n++; }
  return n;
}

// (v53 HITS) The vertex shader's size and alpha for planned particle k at `age` s, `dep` game units from the eye, with
// the projection's P[1][1] (1 / tan(fov / 2)) — the same rule SPRAY_VS draws (tests and the picture's numbers):
// out.r the drawn radius (game units), out.share its unclamped share of the view's height, out.a its alpha (0: not drawn).
export const LOOK = { r: 0, share: 0, a: 0 };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function sprayLook(P, k, age, dep, p11, out = LOOK) { const o = k * SP, life = P[o + 6]; out.r = out.share = out.a = 0; if (age < 0 || age >= life) return out;
  const n = age / life, gs = P[o + 26], rb = P[o + 25]; let tr = Math.max(0, Math.min(1, (n - gs) / Math.max(1e-3, 1 - gs))); if (rb > 0 && Math.abs(rb - .5) > 1e-3) tr = Math.pow(tr, Math.log(rb) / Math.log(.5));
  let size = P[o + 7] * (P[o + 8] + (P[o + 9] - P[o + 8]) * tr); const d = Math.max(.05, dep), share = size * p11 / d, sf = P[o + 22], ef = P[o + 23], smax = P[o + 21];
  const sfade = ef > 0 ? 1 - sstep(sf, ef, share) : 1; if (smax > 0) size = Math.min(size, smax * d / p11);
  const fo = P[o + 24], fade = fo >= 9.5 ? 1 - Math.max(0, Math.min(1, (n - (fo - 10)) / Math.max(1e-3, 11 - fo))) : 1 - sstep(fo, 1, n);
  out.r = size; out.share = share; out.a = P[o + 19] * fade * sfade; return out; }

// ── the helmet dink: a record → spark particles (pure) ─────────────────────────────────────────────────────────────
// CS2 (HU, s; local z = the impact's normal, back toward the shooter; x, y across it): [impact_helmet_headshot.vpcf]
// 15 trails (InstantaneousEmitter 15): speed local (−900…900, −900…900, 550…950) + up to 300 any way
// (CreateWithinSphereTransform m_fSpeedMax) + up to 500 along z (InitialVelocityNoise m_vecOutputMax, as a uniform
// draw), life .05–.3, radius .35–.9 (× the renderer's .5), alpha .5–1, colour (103,255,242)–(82,216,255), gravity
// −300, drag .5, trail ≤ 25 HU (fading in over .1 s), overbright 3, additive, no fade (Decay); [_spark.vpcf] 2 streaks
// out through the head, speed (−900…900, −900…900, −1600…−400) + up to 500, life .09–.1, radius 4–6 going ×4 → ×.5
// (InterpolateRadius), trail length .0142–.0205 s of speed (field 10) ≤ 64 HU fading in over .051 s, colour
// (77,254,239)–(175,224,255), fade over its life (FadeOutSimple 1), overbright 3; [_glow.vpcf] 1 flare 3 HU out, life
// .1–.13, radius 2–3 going ×.5 → ×2, colour (155,218,255)–(184,207,250), fading out at the end (FadeOut), overbright 8,
// at most 1 % of the screen (m_flMaxSize .01). The main trails' own trail length is the engine's default (.1 s).
export const DINK = {
  trails: { n: 15, xy: [-900, 900], z: [550, 950], sph: 300, noise: 500, life: [.05, .3], r: [.35, .9], rs: .5, grow: [1, 1], alpha: [.5, 1], col: [[103, 255, 242], [82, 216, 255]], grav: -300, drag: .5, tt: [.1, .1], max: 25, fadeIn: .1, ob: 3, fade: 0 },
  spark: { n: 2, xy: [-900, 900], z: [-1600, -400], sph: 500, noise: 0, life: [.09, .1], r: [4, 6], rs: .5, grow: [4, .5], rb: .95, alpha: [1, 1], col: [[77, 254, 239], [175, 224, 255]], grav: 0, drag: 0, tt: [.0142, .0205], max: 64, fadeIn: .051, ob: 3, fade: 1 },
  glow: { n: 1, off: 3, life: [.1, .13], r: [2, 3], rs: .5, grow: [.5, 2], rb: .95, alpha: [1, 1], col: [[155, 218, 255], [184, 207, 250]], ob: 8, fade: 2, maxScreen: .01, sprite: 1 },
};
export const DK = 24, MAX_DINK = 18, DINK_N = 54; const DINK_PARTS = [DINK.trails, DINK.spark, DINK.glow];
// Does this record dink? A headshot that met a helmet (host: hm).
export const dinks = rec => !!rec && rec.z === 'head' && !!rec.hm;
const Ux = [0, 0, 0];
export function planDink(rec, out) {
  if (!validRecord(rec) || !dinks(rec)) return 0; frame(rec); seed(recSeed(rec, 0xD1));
  // local axes: z back toward the shooter (−D), x the sideways L, y = z × x
  const zx = -D[0], zy = -D[1], zz = -D[2], xx = L[0], xy = L[1], xz = L[2]; Ux[0] = zy * xz - zz * xy; Ux[1] = zz * xx - zx * xz; Ux[2] = zx * xy - zy * xx;
  const px = +rec.p[0], py = +rec.p[1], pz = +rec.p[2]; let n = 0;
  for (let w = 0; w < 3; w++) { const e = DINK_PARTS[w]; for (let k = 0; k < e.n && n < MAX_DINK; k++) {
    let vx = 0, vy = 0, vz = 0, ox = 0;
    if (!e.sprite) { const a = rr(e.xy), b = rr(e.xy), c = rr(e.z) + (e.noise ? rnd() * e.noise : 0); vx = xx * a + Ux[0] * b + zx * c; vy = xy * a + Ux[1] * b + zy * c; vz = xz * a + Ux[2] * b + zz * c;
      if (e.sph) { const u = rnd() * 2 - 1, an = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u), sp = rnd() * e.sph; vx += q * Math.cos(an) * sp; vy += u * sp; vz += q * Math.sin(an) * sp; } }
    else ox = e.off;
    const o = n * DK, cr = rnd();
    out[o] = px + zx * ox * HU; out[o + 1] = py + zy * ox * HU; out[o + 2] = pz + zz * ox * HU;
    out[o + 3] = vx * HU; out[o + 4] = vy * HU; out[o + 5] = vz * HU; out[o + 6] = rr(e.life);
    out[o + 7] = rr(e.r) * e.rs * HU; out[o + 8] = e.grow[0]; out[o + 9] = e.grow[1]; out[o + 10] = (e.grav || 0) * HU; out[o + 11] = Math.max(.02, e.drag > 0 ? -Math.log(1 - e.drag) * 30 : 0);   // (v53 MAP: Source's drag — (1 − fDrag) of the speed kept per 1/30 s, as gd-impacts.js)
    out[o + 12] = e.tt ? rr(e.tt) : 0; out[o + 13] = (e.max || 0) * HU; out[o + 14] = e.fadeIn || 0;
    out[o + 15] = lin(e.col[0][0] + (e.col[1][0] - e.col[0][0]) * cr) * e.ob; out[o + 16] = lin(e.col[0][1] + (e.col[1][1] - e.col[0][1]) * cr) * e.ob; out[o + 17] = lin(e.col[0][2] + (e.col[1][2] - e.col[0][2]) * cr) * e.ob;
    out[o + 18] = rr(e.alpha); out[o + 19] = e.sprite ? 1 : 0; out[o + 20] = e.fade; out[o + 21] = e.maxScreen || 0; out[o + 22] = 0; out[o + 23] = e.rb || .5; n++; } }   // (23: InterpolateRadius flBias — v53 MAP: Source's Bias(), the spark shrinks from ×4 at once as CS2's)
  return n;
}

// ── decals: a record → placed splats (pure, given the map's rays) ────────────────────────────────────────────────────
// cast(ox, oy, oz, dx, dy, dz, far) → distance to the first surface (Infinity: none), its normal in castN.
// Each decal: DC floats — centre x y z, right axis × half width, up axis × half height (the splat's spray direction),
// cell, delay (s), alpha. Returns how many (at most MAX_DECALS_PER_HIT).
export const DC = 12, MAX_DECALS_PER_HIT = 6;
export const castN = [0, 1, 0];
const CN = [0, 0, 0], T1 = [0, 0, 0], T2 = [0, 0, 0];
const LIFT = .015;   // off the surface (and a polygon offset): no z-fighting
// Do all four corners of a square (centre c, axes a, b: half extents) lie on the surface whose normal is n? Each corner
// is cast at from just in front along −n: the surface must be there (within ±tol) and face the same way.
function onSurface(cast, cx, cy, cz, nx, ny, nz, ax, ay, az, bx, by, bz) {
  const back = .3, tol = .14;
  for (let s = 0; s < 4; s++) { const su = s & 1 ? 1 : -1, sv = s & 2 ? 1 : -1, x = cx + ax * su + bx * sv + nx * back, y = cy + ay * su + by * sv + ny * back, z = cz + az * su + bz * sv + nz * back;
    const t = cast(x, y, z, -nx, -ny, -nz, back * 2 + tol); if (!(t >= back - tol && t <= back + tol)) return false;
    if (castN[0] * nx + castN[1] * ny + castN[2] * nz < .85) return false; }
  return true;
}
// One splat on the surface hit at distance t along (dx, dy, dz) from o (normal castN): oriented so the texture's up runs
// along the shot as it meets the surface (`sx, sy, sz`; across a wall face-on, any way), turned by `spin`; shrunk
// until its corners sit on the surface (3 tries), else none. Writes into out at slot j; true when placed.
function place(cast, out, j, x, y, z, nx, ny, nz, sx, sy, sz, size, spin, cell, delay, alpha) {
  // the spray direction in the surface's plane
  const d = sx * nx + sy * ny + sz * nz; let vx = sx - nx * d, vy = sy - ny * d, vz = sz - nz * d, vl = Math.hypot(vx, vy, vz);
  if (vl < .2) { const wall = Math.abs(ny) < .9, ay = wall ? 1 : 0, az = wall ? 0 : 1, dd = ay * ny + az * nz; vx = -nx * dd; vy = ay - ny * dd; vz = az - nz * dd; vl = Math.hypot(vx, vy, vz) || 1; }   // (face-on: world up on a wall, along z on a floor)
  vx /= vl; vy /= vl; vz /= vl;
  // turned round the normal by spin
  const c = Math.cos(spin), s = Math.sin(spin), rx0 = vy * nz - vz * ny, ry0 = vz * nx - vx * nz, rz0 = vx * ny - vy * nx;   // right = v × n
  const ux = vx * c + rx0 * s, uy = vy * c + ry0 * s, uz = vz * c + rz0 * s, rx = rx0 * c - vx * s, ry = ry0 * c - vy * s, rz = rz0 * c - vz * s;
  let h = size / 2; CN[0] = nx; CN[1] = ny; CN[2] = nz;
  for (let k = 0; k < 3; k++, h *= .7) { const m = h * .72;   // (the splat's shape fills ~72 % of its square: its corners checked there)
    if (!onSurface(cast, x, y, z, CN[0], CN[1], CN[2], rx * m, ry * m, rz * m, ux * m, uy * m, uz * m)) continue;
    const o = j * DC; out[o] = x + CN[0] * LIFT; out[o + 1] = y + CN[1] * LIFT; out[o + 2] = z + CN[2] * LIFT;
    out[o + 3] = rx * h; out[o + 4] = ry * h; out[o + 5] = rz * h; out[o + 6] = ux * h; out[o + 7] = uy * h; out[o + 8] = uz * h;
    out[o + 9] = cell; out[o + 10] = delay; out[o + 11] = alpha; return true; }
  return false;
}
export function planDecals(rec, cast, out) {
  if (!validRecord(rec)) return 0; frame(rec); seed(recSeed(rec, 0xD3)); const tier = tierOf(rec), P = DECALS[tier], px = +rec.p[0], py = +rec.p[1], pz = +rec.p[2];
  let n = 0; const dx = D[0], dy = D[1], dz = D[2];
  // behind the victim along the shot (the body itself is not in the map's rays: the line goes on from the wound)
  for (let k = 0; k < P.wall && n < MAX_DECALS_PER_HIT; k++) {
    let ex = dx + (rnd() - .5) * 2 * P.noise * (k ? 1 : .5), ey = dy + (rnd() - .5) * 2 * P.noise * (k ? 1 : .5), ez = dz + (rnd() - .5) * 2 * P.noise * (k ? 1 : .5); const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
    const size = rr(P.size) * HU, spin = (rnd() - .5) * .9, cell = Math.floor(rnd() * WALL_CELLS), t = cast(px, py, pz, ex, ey, ez, DECALS.reach * HU);
    if (t === Infinity) continue; const nx = castN[0], ny = castN[1], nz = castN[2];
    if (place(cast, out, n, px + ex * t, py + ey * t, pz + ez * t, nx, ny, nz, ex, ey, ez, size, spin, cell, Math.min(.12, t / (400 * HU)), 1)) n++; }
  // where the trail's drops land: each trail particle's flight (as the spray flies it), a point .4–.75 of the way, traced down
  const trail = TRAIL[tier];
  for (let k = 0; k < P.floor && trail && n < MAX_DECALS_PER_HIT; k++) {
    const lx = rr(trail.lx), ly = (trail.ly ? rr(trail.ly) : 0) * (rnd() < .5 ? -1 : 1), up = trail.up ? rr(trail.up) : 0, life = rr(trail.life), kd = Math.max(.02, trail.drag * 30), g = trail.grav;
    const vx = (dx * lx + L[0] * ly) * HU, vy = (dy * lx + up) * HU, vz = (dz * lx + L[2] * ly) * HU, e = Math.exp(-kd * life), f = (1 - e) / kd, gy = g * HU / kd;
    const ex = vx * f, ey = (vy - gy) * f + gy * life, ez = vz * f, w = rr(DECALS.warp);
    const qx = px + ex * w, qz = pz + ez * w, qy = Math.max(py + ey * w, py - 2) + DECALS.floorUp * HU;
    const t = cast(qx, qy, qz, 0, -1, 0, (DECALS.floorUp + DECALS.floorDown) * HU); const size = rr(P.floorR) * 1.5 * HU, spin = (rnd() - .5) * Math.PI / 2, cell = Math.floor(rnd() * WALL_CELLS);
    if (t === Infinity || castN[1] < .6) continue;
    if (place(cast, out, n, qx, qy - t, qz, castN[0], castN[1], castN[2], dx, 0, dz, size, spin, cell, life, 1)) n++; }
  // a drip under the wound
  if (n < MAX_DECALS_PER_HIT) { const ox = (rnd() - .5) * 16 * HU, oz = (rnd() - .5) * 16 * HU, size = rr(DECALS.drip) * HU, cell = DROP_CELL0 + Math.floor(rnd() * 4), spin = rnd() * Math.PI * 2;
    const t = cast(px + ox, py, pz + oz, 0, -1, 0, DECALS.floorDown * HU);
    if (t < Infinity && castN[1] >= .6) { const fall = Math.sqrt(2 * t / (400 * HU)); if (place(cast, out, n, px + ox, py - t, pz + oz, castN[0], castN[1], castN[2], dx, 0, dz, size, spin, cell, .1 + fall, .9)) n++; } }
  return n;
}
// The map's rays for decals: the first surface along a line (bulletPath with no penetration: a CS2 map's own triangle,
// a box face) or the floor plane y = 0 (weapons.js's floor), its normal in castN. One pooled path: nothing made per ray.
export function mapCast(boxes) {
  const P = new BulletPath();
  return (ox, oy, oz, dx, dy, dz, far) => {
    const B = boxes(); let t = Infinity;
    if (B && B.length !== 0) { const R = bulletPath(B, ox, oy, oz, dx, dy, dz, far, 0, P); if (R.stop < far) { t = R.stop; const s = R.stopNormal; if (s) { castN[0] = s[0]; castN[1] = s[1]; castN[2] = s[2]; } else { castN[0] = -dx; castN[1] = -dy; castN[2] = -dz; } } }
    if (dy < -1e-6) { const tf = -oy / dy; if (tf >= 0 && tf < t && tf <= far) { t = tf; castN[0] = 0; castN[1] = 1; castN[2] = 0; } }
    return t;
  };
}

// ── (v53 HITS, H6) Your own wounds on your screen: CS2's local-player hit splatter ─────────────────────────────────────
// particles/blood_impact (the user's install): a hit from the front plays blood_impact_localfrontenemy — its children
// _splatter_lft and _splatter_rgt, each 5–10 splats (nParticlesToEmit: control point 1's x — the damage — 15 → 65 remapped
// to 5 → 10), life .35–.75 s, FadeOut up to .5 s (min .25: CS2's default; a share of the life), colour (228,33,33) ×
// overbright 3, alpha 1; a hit from behind blood_impact_localrearhit_splatter — 10 splats, life .5–.75 s, (249,55,55) ×
// 2; and every hit blood_impact_lp_spray (blood_impact_localplayer's child) — 3–6 splats (the damage 15 → 80), life
// .75 s, (249,55,55) × 2. Its texture (decals/blood/blood_particle_splatter) is drawn with our decal atlas's splats.
// A front hit always plays BOTH children (localfrontenemy.vpcf's m_Children: _splatter_lft and _splatter_rgt, neither
// disabled — v53 HITS final; it was the shot's side only): each lays its splats in order along its own path
// (C_INIT_CreateSequentialPathV2 between the two points its C_OP_SetSingleControlPointPosition ops place: _lft x = 100,
// _rgt x = −100, y 100 → −50 in its control points' space) — so two vertical runs, the left and right edges, from high
// to a little below the middle (y .75 → −.375 of the half-height). OURS (the game's code places those control points on
// the screen, and is not in the files): that mapping of CP space to the screen edges; from behind → along the bottom and
// the sides; lp_spray nearer the corner on the side the shot came from (the record's r against your view). Sizes 4.5–12 % of the view's height (lp_spray 9–15 %): a splat fills about half its square.
// One pool of LOCAL_N splats in screen space (ONE draw, warmed with the others), written from your own records only (and
// the watched player's, spectating in-eye); Settings → Blood off draws none.
export const LOCAL_N = 48, LK = 12;
export const LOCAL = {
  front: { n: [5, 10], dmg: [15, 65], life: [.35, .75], fo: [.25, .5], col: [228, 33, 33], ob: 3, r: [.045, .12] },   // localfrontenemy_splatter_lft / _rgt
  rear: { n: [10, 10], life: [.5, .75], fo: [.25, .5], col: [249, 55, 55], ob: 2, r: [.05, .12] },   // localrearhit_splatter
  spray: { n: [3, 6], dmg: [15, 80], life: [.75, .75], fo: [.25, .5], col: [249, 55, 55], ob: 2, r: [.09, .15] },   // lp_spray
};
const countBy = (e, d) => { if (!e.dmg) return e.n[0]; const k = Math.max(0, Math.min(1, (d - e.dmg[0]) / (e.dmg[1] - e.dmg[0]))); return Math.round(e.n[0] + (e.n[1] - e.n[0]) * k); };
// Where the shot came from in your view (fx, fz: your forward, level): .front (it came from ahead), .side (−1 left, 1 right,
// 0 straight ahead / behind within 15°).
export const LSIDE = { front: true, side: 0 };
export function hitSide(rec, fx, fz, out = LSIDE) { const sx = -(+rec.r[0]), sz = -(+rec.r[2]), fl = Math.sqrt(fx * fx + fz * fz) || 1, ax = fx / fl, az = fz / fl, sl = Math.sqrt(sx * sx + sz * sz) || 1;
  const ahead = (sx * ax + sz * az) / sl, right = (sx * -az + sz * ax) / sl; out.front = ahead >= 0; out.side = Math.abs(right) < Math.sin(15 * Math.PI / 180) ? 0 : right > 0 ? 1 : -1; return out; }
// A record → splats (pure): each LK floats — centre x y (the view's height units: y −1 bottom … 1 top, x across × the
// aspect), radius, life, fade start (share), cell, rotation, r g b (linear × overbright), alpha. Returns how many.
export const MAX_LOCAL = 26;
export const PATH_Y = [.75, -.375];   // (the children's path y 100 → −50, as a share of the half-height: ours, the scale)
export function planLocal(rec, fx, fz, out) {
  if (!validRecord(rec)) return 0; seed(recSeed(rec, 0x10C)); const S = hitSide(rec, fx, fz), d = +rec.d || 0; let n = 0;
  const put = (e, x, y) => { if (n >= MAX_LOCAL) return; const o = n * LK, life = rr(e.life); out[o] = x; out[o + 1] = y; out[o + 2] = rr(e.r); out[o + 3] = life; out[o + 4] = Math.max(0, Math.min(.999, 1 - rr(e.fo)));
    out[o + 5] = Math.floor(rnd() * WALL_CELLS); out[o + 6] = rnd() * Math.PI * 2; for (let q = 0; q < 3; q++) out[o + 7 + q] = Math.min(1, lin(e.col[q]) * e.ob); out[o + 10] = 1; out[o + 11] = 0; n++; };
  const edge = (e, sd, k) => { for (let j = 0; j < k; j++) put(e, sd * (1.3 + rnd() * .15), PATH_Y[0] + (PATH_Y[1] - PATH_Y[0]) * (k > 1 ? j / (k - 1) : .5)); };   // (x past ±1.3: the side beyond a 4:3 centre, inside any wide view; y along the file's path, in order)
  if (S.front) { const k = countBy(LOCAL.front, d); edge(LOCAL.front, -1, k); edge(LOCAL.front, 1, k); }   // (both children, each its own 5–10)
  else for (let j = 0; j < LOCAL.rear.n[0]; j++) { const a = rnd(); if (a < .5) put(LOCAL.rear, (rnd() * 2 - 1) * 1.4, -.8 - rnd() * .2); else put(LOCAL.rear, (a < .75 ? -1 : 1) * (1.2 + rnd() * .5), -.6 + rnd() * 1.2); }
  { const k = countBy(LOCAL.spray, d), sd = S.side || (rnd() < .5 ? -1 : 1); for (let j = 0; j < k; j++) put(LOCAL.spray, sd * (1.25 + rnd() * .45), (S.front ? .3 : -.5) + (rnd() * 2 - 1) * .35); }
  return n;
}
// Screen-space splats: x scaled by the view's aspect (projectionMatrix), drawn over everything, faded out as CS2's FadeOut.
const LOCAL_VS = `uniform float uTime; uniform float uCells;
attribute vec4 aP; attribute vec4 aL; attribute vec4 aC;
varying vec2 vUv; varying vec4 vCol;
void main() {
  float age = uTime - aP.w, life = aL.x;
  if (age < 0.0 || age >= life) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vUv = vec2(0.0); vCol = vec4(0.0); return; }
  float n = age / life, asp = projectionMatrix[1][1] / projectionMatrix[0][0], cs = cos(aL.w), sn = sin(aL.w); vec2 c = position.xy * 2.0, q = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * aP.z;
  gl_Position = vec4((aP.x + q.x) / asp, aP.y + q.y, -1.0, 1.0);   // (on the near plane: in front of everything, a smoke too)
  vUv = (vec2(mod(aL.z, uCells), uCells - 1.0 - floor(aL.z / uCells)) + uv) / uCells;
  vCol = vec4(aC.rgb, aC.a * (1.0 - smoothstep(aL.y, 1.0, n)));
}`;
const LOCAL_FS = `uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main() { vec4 t = texture2D(uMap, vUv); float a = t.a * vCol.a; if (a < 0.01) discard; gl_FragColor = vec4(vCol.rgb * (0.55 + 0.7 * t.r), a);
  #include <colorspace_fragment>
}`;

// ── built-in pictures (no CS2 files): procedural, the same layout as the import ──────────────────────────────────────
// Pixels are written top row first into a bottom-up buffer, so v = 1 is the picture's top as for a loaded image.
function picture(W, cells, draw) {
  const data = new Uint8Array(W * W * 4), cw = W / cells, A = new Float32Array(cw * cw), C = new Float32Array(cw * cw);
  for (let cell = 0; cell < cells * cells; cell++) { A.fill(0); C.fill(0); if (!draw(cell, cw, A, C)) continue; const ox = (cell % cells) * cw, oy = Math.floor(cell / cells) * cw;
    for (let y = 0; y < cw; y++) for (let x = 0; x < cw; x++) { const a = Math.min(1, A[y * cw + x]), c = C[y * cw + x], o = ((W - 1 - (oy + y)) * W + ox + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.round(255 * Math.min(1, c)); data[o + 3] = Math.round(255 * a); } }
  return data;
}
// Stamp a soft disc (alpha max, and a value) into a cell's field.
function disc(A, C, cw, x, y, r, a, v) { const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(cw - 1, Math.ceil(x + r + 1)), y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(cw - 1, Math.ceil(y + r + 1));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { const d = Math.hypot(i + .5 - x, j + .5 - y), k = Math.max(0, Math.min(1, r + .6 - d)) * a, q = j * cw + i; if (k > A[q]) { C[q] = A[q] > 0 ? Math.min(C[q], v) * (1 - k) + v * k : v; A[q] = k; } } }
// (v53 HITS) A hole: the alpha in a small disc thinned to a fifth.
function hole(A, cw, x, y, r) { for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(cw - 1, Math.ceil(y + r)); j++) for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(cw - 1, Math.ceil(x + r)); i++) if (Math.hypot(i + .5 - x, j + .5 - y) < r) A[j * cw + i] *= .2; }
// A streak of discs from (x, y) along angle ang, length len, radius r0 thinning to r1, then a few drops off its end.
function streak(A, C, cw, x, y, ang, len, r0, r1, a, v) { const n = Math.max(2, Math.ceil(len / Math.max(.6, r1))); for (let k = 0; k <= n; k++) { const t = k / n; disc(A, C, cw, x + Math.sin(ang) * len * t, y - Math.cos(ang) * len * t, r0 + (r1 - r0) * t, a, v); } }
export function builtinDecals(W = 512) {
  seed(0xB100D);
  const rgb = new Uint8Array(W * W * 4), data = picture(W, DECAL_GRID, (cell, cw, A, C) => {
    const cx = cw / 2, cy = cw * .56, s = cw / 128;
    if (cell < WALL_CELLS) {   // a splat (as CS2's): a small core, a fan of fine streaks thrown up the picture (its spray direction), drops and mist beyond
      const cy2 = cw * .64, g = () => (rnd() + rnd() + rnd() - 1.5) / 1.5, spread = .6 + rnd() * .6;
      for (let k = 0; k < 6; k++) disc(A, C, cw, cx + (rnd() - .5) * 12 * s, cy2 + (rnd() - .5) * 9 * s, (2.5 + rnd() * 5) * s, 1, .18 + rnd() * .1);
      const ns = 34 + Math.floor(rnd() * 18); for (let k = 0; k < ns; k++) { const all = rnd() < .2, ang = all ? rnd() * Math.PI * 2 : g() * spread * 1.6, len = (all ? .4 : 1) * (12 + rnd() * 46) * s, r0 = (.7 + rnd() * 1.7) * s;
        const x0 = cx + (rnd() - .5) * 8 * s, y0 = cy2 + (rnd() - .5) * 6 * s; streak(A, C, cw, x0, y0, ang, len, r0, r0 * .2, .92, .26 + rnd() * .2);
        if (rnd() < .3) { const m = .35 + rnd() * .4, b = ang + (rnd() - .5) * .8; streak(A, C, cw, x0 + Math.sin(ang) * len * m, y0 - Math.cos(ang) * len * m, b, len * .35, r0 * .5, r0 * .12, .9, .32); }
        if (rnd() < .6) { const d = len + (2 + rnd() * 9) * s; disc(A, C, cw, x0 + Math.sin(ang) * d, y0 - Math.cos(ang) * d, (.5 + rnd() * 1.6) * s, .95, .34); } }
      for (let k = 0; k < 45; k++) { const ang = g() * spread * 2, d = (8 + rnd() * 50) * s; disc(A, C, cw, cx + Math.sin(ang) * d, cy2 - Math.cos(ang) * d, (.3 + rnd() * 1) * s, .85, .4); }
    } else {   // drip spots: a few round drops, one bigger
      disc(A, C, cw, cx, cw / 2, (6 + rnd() * 5) * s, 1, .28); for (let k = 0; k < 7; k++) disc(A, C, cw, cx + (rnd() - .5) * 46 * s, cw / 2 + (rnd() - .5) * 46 * s, (1 + rnd() * 3) * s, .95, .33);
    }
    return true; });
  // colour: thick blood dark, thin edges redder (the field's value is how dark; alpha the shape)
  for (let o = 0; o < data.length; o += 4) { const v = data[o] / 255; rgb[o] = Math.round(255 * (.2 + v * .45)); rgb[o + 1] = Math.round(255 * (.008 + v * .02)); rgb[o + 2] = Math.round(255 * (.008 + v * .018)); rgb[o + 3] = data[o + 3]; }
  return rgb;
}
export function builtinSpray(W = 256) {
  seed(0x5B1A7);
  return picture(W, SPRAY_GRID, (cell, cw, A, C) => {
    const cx = cw / 2, cy = cw / 2, s = cw / 32;
    if (cell < 48) {   // flipbooks: splash (0–15), streak (16–31), puff (32–47) — growing, breaking up
      const f = (cell % 16) / 15, kind = Math.floor(cell / 16);
      if (kind === 1) { const len = (6 + f * 14) * s; streak(A, C, cw, cx, cy + len * .45, 0, len, (2.6 - f) * s, (.6 + f * .4) * s, 1 - f * .45, .8); for (let k = 0; k < 4 + f * 6; k++) disc(A, C, cw, cx + (rnd() - .5) * 6 * s * f, cy - len * .5 + rnd() * len, (.4 + rnd()) * s, .8 - f * .4, .7); }
      else { const R = (kind === 0 ? 4 + f * 9 : 3 + f * 7) * s; for (let k = 0; k < 6; k++) disc(A, C, cw, cx + (rnd() - .5) * R * .7, cy + (rnd() - .5) * R * .7, R * (.35 + rnd() * .3), (1 - f * .6) * (.7 + rnd() * .3), .75 + rnd() * .25);
        const sp = 7 + Math.floor(rnd() * 5); for (let k = 0; k < sp; k++) { const a = rnd() * Math.PI * 2; streak(A, C, cw, cx, cy, a, R * (1.1 + rnd() * .6), R * .22, .5 * s, (1 - f * .7) * .9, .9); }
        if (f > .4) for (let k = 0; k < 8; k++) disc(A, C, cw, cx + (rnd() - .5) * R * 1.8, cy + (rnd() - .5) * R * 1.8, (.5 + rnd()) * s, (1 - f) * .9, 1); }
      return true; }
    if (cell === CELL.drop) { streak(A, C, cw, cx, cy + 8 * s, 0, 14 * s, 3.2 * s, .8 * s, 1, .85); return true; }
    if (cell === CELL.mist) { for (let k = 0; k < 40; k++) { const a = rnd() * Math.PI * 2, d = rnd() * 9 * s; disc(A, C, cw, cx + Math.cos(a) * d, cy + Math.sin(a) * d, (3 + rnd() * 4) * s, .12 + rnd() * .1, .8); } return true; }
    if (cell === CELL.chunk) { for (let k = 0; k < 7; k++) disc(A, C, cw, cx + (rnd() - .5) * 10 * s, cy + (rnd() - .5) * 10 * s, (1.5 + rnd() * 3) * s, 1, .6 + rnd() * .3); return true; }
    if (cell >= CELL.wisp && cell < CELL.wisp + FRAMES.wisp) {   // (v53 HITS) a wisp, as spray1.vtex: a small dense burst spreading into thin, broken strands (its alpha cover 48 % → 3 %)
      const f = (cell - CELL.wisp) / (FRAMES.wisp - 1), R = (3 + f * 12) * s, a0 = .9 * (1 - f * .8), ns = 9 + Math.floor(rnd() * 4);
      for (let k = 0; k < ns; k++) { const ang = rnd() * Math.PI * 2, len = R * (.6 + rnd() * .5), r0 = (1.6 - f * 1.1) * s; streak(A, C, cw, cx + Math.sin(ang) * R * .15, cy - Math.cos(ang) * R * .15, ang, len, r0, r0 * .25, a0 * (.5 + rnd() * .5), .8); }
      if (f < .4) disc(A, C, cw, cx, cy, R * .45, a0, .7);
      if (f > .3) for (let k = 0; k < 120 * f; k++) { const x = (rnd() - .5) * 2 * R, y = (rnd() - .5) * 2 * R; hole(A, cw, cx + x, cy + y, (.4 + rnd() * .8) * s); }   // (broken up: holes in it)
      return true; }
    return false; });
}
function dataTexture(data, W) { const t = new THREE.DataTexture(data, W, W, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; }

// ── shaders ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const SPRAY_VS = `uniform float uTime; uniform float uCells;
attribute vec4 aP; attribute vec4 aV; attribute vec4 aS; attribute vec4 aM; attribute vec4 aC; attribute vec4 aX; attribute vec4 aF; uniform float uWisp;
varying vec2 vUv; varying vec4 vCol;
void main() {
  float age = uTime - aP.w, life = aV.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vUv = vec2(0.0); vCol = vec4(0.0); return; }
  float n = age / life, k = aM.x, e = exp(-k * age);
  vec3 vt = vec3(0.0, aS.w / k, 0.0);   // terminal velocity (gravity / drag)
  vec3 p = aP.xyz + (aV.xyz - vt) * (1.0 - e) / k + vt * age, vel = (aV.xyz - vt) * e + vt;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // (v53 HITS) InterpolateRadius from its start time, with Source's Bias; the renderer's screen cap and fade (the share of the
  // view's height the sprite's diameter covers: r × P[1][1] / depth)
  float tr = clamp((n - aX.w) / max(1e-3, 1.0 - aX.w), 0.0, 1.0); if (aX.z > 0.0 && abs(aX.z - 0.5) > 1e-3) tr = pow(tr, log(aX.z) / log(0.5));
  float size = aS.x * mix(aS.y, aS.z, tr), dep = max(0.05, -mv.z), share = size * projectionMatrix[1][1] / dep;
  float sfade = aF.z > 0.0 ? 1.0 - smoothstep(aF.y, aF.z, share) : 1.0; if (aX.y > 0.0) size = min(size, aX.y * dep / projectionMatrix[1][1]);
  vec2 ax = vec2(cos(aM.y), sin(aM.y)), ay = vec2(-ax.y, ax.x); float along = 1.0;
  if (aX.x > 0.0) { vec2 sv = (viewMatrix * vec4(vel, 0.0)).xy; float sl = length(sv); if (sl > 1e-4) { ay = sv / sl; ax = vec2(ay.y, -ay.x); along = 1.0 + min(sl * aX.x, 6.0); } }
  vec2 c = position.xy * 2.0;
  mv.xy += ax * c.x * size + ay * c.y * size * along;
  gl_Position = projectionMatrix * mv;
  float fr = min(floor(n * aM.w), aM.w - 1.0), cell = aM.z + fr;
  if (aM.z > 50.5 && uWisp < 0.5) cell = 32.0 + min(15.0, floor(n * 16.0));   // (an imported atlas without the wisp frames: its puffs)
  vUv = (vec2(mod(cell, uCells), uCells - 1.0 - floor(cell / uCells)) + uv) / uCells;
  float fo = aF.x, fade = fo >= 9.5 ? 1.0 - clamp((n - (fo - 10.0)) / max(1e-3, 11.0 - fo), 0.0, 1.0) : 1.0 - smoothstep(fo, 1.0, n);   // (CS2's FadeOut — eased — or FadeOutSimple / FadeAndKill — linear)
  vCol = vec4(aC.rgb, aC.a * fade * sfade);
}`;
const SPRAY_FS = `uniform sampler2D uMap; uniform float uLight;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 t = texture2D(uMap, vUv); float a = t.a * vCol.a; if (a < 0.008) discard;
  float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(vCol.rgb * mix(0.5, 1.3, lum) * uLight, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const DECAL_VS = `uniform float uTime; uniform float uCells;
attribute vec4 aC; attribute vec4 aU; attribute vec4 aV;
varying vec2 vUv; varying float vA;
void main() {
  if (aV.w <= 0.0 || uTime < aC.w) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vUv = vec2(0.0); vA = 0.0; return; }
  vec3 p = aC.xyz + aU.xyz * (position.x * 2.0) + aV.xyz * (position.y * 2.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vUv = (vec2(mod(aU.w, uCells), uCells - 1.0 - floor(aU.w / uCells)) + uv) / uCells;
  vA = aV.w * clamp((uTime - aC.w) / 0.14, 0.0, 1.0);   // (CS2's fade-in, 0.125–0.15 s)
}`;
// Multiplied onto the lit surface (blend: destination × source): 1 where there is no blood.
const DECAL_FS = `uniform sampler2D uMap; uniform float uDark;
varying vec2 vUv; varying float vA;
void main() {
  vec4 t = texture2D(uMap, vUv); float a = t.a * vA; if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0), clamp(t.rgb * uDark, 0.0, 1.0), a), 1.0);
  #include <colorspace_fragment>
}`;
// The dink: trails stretched back along their screen velocity (at least a pixel wide), sprites capped to a share of the
// screen; additive (CS2 PARTICLE_OUTPUT_BLEND_MODE_ADD), colours pre-multiplied by CS2's overbright.
const DINK_VS = `uniform float uTime; uniform float uPx;
attribute vec4 aP; attribute vec4 aV; attribute vec4 aS; attribute vec4 aM; attribute vec4 aC; attribute vec4 aK;
varying vec2 vQ; varying vec4 vCol; varying float vKind;
void main() {
  float age = uTime - aP.w, life = aV.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vQ = vec2(0.0); vCol = vec4(0.0); vKind = 0.0; return; }
  float n = age / life, k = aM.x, e = exp(-k * age);
  vec3 vt = vec3(0.0, aS.w / k, 0.0);
  vec3 p = aP.xyz + (aV.xyz - vt) * (1.0 - e) / k + vt * age, vel = (aV.xyz - vt) * e + vt;
  vec4 mv = viewMatrix * vec4(p, 1.0); float d = max(0.05, -mv.z), onePx = d * uPx;
  float tb = abs(aK.w - 0.5) > 1e-3 && aK.w > 0.0 ? pow(n, log(aK.w) / log(0.5)) : n, rad = aS.x * mix(aS.y, aS.z, tb); vec2 c = position.xy * 2.0;
  if (aK.x < 0.5) {
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz; float sp = length(vel), sl = length(vv.xy);
    vec2 ay = sl > 1e-5 ? vv.xy / sl : vec2(0.0, 1.0), ax = vec2(ay.y, -ay.x);
    float len = min(aM.z, sp * aM.y) * clamp(age / max(aM.w, 1e-3), 0.0, 1.0) * (sp > 1e-5 ? sl / sp : 0.0);
    float w = max(rad, onePx * 0.75);
    mv.xy += ax * c.x * w + ay * ((c.y * 0.5 - 0.5) * len + c.y * w);
  } else { rad = min(rad, aK.z * d / projectionMatrix[1][1]); mv.xy += c * max(rad, onePx); }
  gl_Position = projectionMatrix * mv;
  float a = aC.a; if (aK.y > 1.5) a *= 1.0 - smoothstep(0.75, 1.0, n); else if (aK.y > 0.5) a *= 1.0 - n;
  vCol = vec4(aC.rgb, a); vQ = c; vKind = aK.x;
}`;
const DINK_FS = `varying vec2 vQ; varying vec4 vCol; varying float vKind;
void main() {
  float s = vQ.y * 0.5 + 0.5, tp = pow(max(0.0, sin(3.14159 * s)), 0.6);   // (v53 MAP: a thin tapered spindle, as sparks.vtex — gd-impacts.js)
  float a = vKind < 0.5 ? pow(max(0.0, 1.0 - abs(vQ.x) / max(tp, 0.05)), 2.0) * mix(0.3, 1.0, s) : pow(max(0.0, 1.0 - length(vQ)), 2.0);
  a *= vCol.a; if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function quad(n, attrs) { const p = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry(); g.index = p.index; g.setAttribute('position', p.getAttribute('position')); g.setAttribute('uv', p.getAttribute('uv')); g.instanceCount = n;
  const out = {}; for (const [k, s] of attrs) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); out[k] = a; } return { g, a: out }; }

// ── the pools ───────────────────────────────────────────────────────────────────────────────────────────────────────
// opts: boxes() → the map's collision boxes (lab.js: the arena's), game() → the game state, me() → your key, watched()
// → the key you watch in first person (else null), clock() → the host's ms (tests), quiet() → true when a picture may
// be sent to the GPU now (no live round), assets: false to skip the CS2 import (tests).
export function createBlood(scene, { boxes = () => null, game = () => null, me = () => '', watched = () => null, clock = () => hostNow(), quiet = null, assets = true, onDink = null, view = listenerFrame } = {}) {   // (view(out): your forward in out.fx / out.fz — tests)   // (onDink(rec): v53 stage 5 — the dink's other CS2 children, gd-impacts.js)
  const t0 = performance.now();
  const decalTex = dataTexture(builtinDecals(), 512), sprayTex = dataTexture(builtinSpray(), 256);
  const sp = quad(SPRAY_N, [['aP', 4], ['aV', 4], ['aS', 4], ['aM', 4], ['aC', 4], ['aX', 4], ['aF', 4]]), dc = quad(DECAL_N, [['aC', 4], ['aU', 4], ['aV', 4]]);
  const sprayMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uCells: { value: SPRAY_GRID }, uMap: { value: sprayTex }, uLight: { value: .9 }, uWisp: { value: 1 } }, vertexShader: SPRAY_VS, fragmentShader: SPRAY_FS, transparent: true, depthWrite: false });
  const decalMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uCells: { value: DECAL_GRID }, uMap: { value: decalTex }, uDark: { value: 1.25 } }, vertexShader: DECAL_VS, fragmentShader: DECAL_FS, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
  for (const m of [sprayMat, decalMat]) m.userData.shared = true;
  const spray = new THREE.Mesh(sp.g, sprayMat), decals = new THREE.Mesh(dc.g, decalMat);
  spray.name = 'gd-blood-spray'; decals.name = 'gd-blood-decals'; decals.renderOrder = -1;
  for (const o of [spray, decals]) { o.frustumCulled = false; o.visible = false; o.matrixAutoUpdate = false; o.userData.gd = true; o.userData.warm = true; o.userData.noPool = true; scene?.add(o); }
  spray.userData.fx = true;   // (after a smoke: arena-smoke-pass.js)
  // the helmet dink (v53): its own additive pool, one draw, warmed with the others (userData.warm)
  const dk = quad(DINK_N, [['aP', 4], ['aV', 4], ['aS', 4], ['aM', 4], ['aC', 4], ['aK', 4]]);
  const dinkMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPx: { value: 2 / 1080 } }, vertexShader: DINK_VS, fragmentShader: DINK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  dinkMat.userData.shared = true;
  const dink = new THREE.Mesh(dk.g, dinkMat); dink.name = 'gd-dink'; dink.frustumCulled = false; dink.visible = false; dink.matrixAutoUpdate = false; dink.userData.gd = true; dink.userData.warm = true; dink.userData.noPool = true; dink.userData.fx = true; scene?.add(dink);
  const KB = new Float32Array(MAX_DINK * DK), KA = Object.values(dk.a); let kHead = 0, dinkEnd = -1, dinksN = 0;
  function spawnDink(n, t) {
    const P = dk.a.aP.array, V = dk.a.aV.array, Sz = dk.a.aS.array, M = dk.a.aM.array, Cc = dk.a.aC.array, K = dk.a.aK.array;
    for (let j = 0; j < n; j++) { const o = j * DK, q = kHead * 4; kHead = (kHead + 1) % DINK_N;
      P[q] = KB[o]; P[q + 1] = KB[o + 1]; P[q + 2] = KB[o + 2]; P[q + 3] = t + KB[o + 22];
      V[q] = KB[o + 3]; V[q + 1] = KB[o + 4]; V[q + 2] = KB[o + 5]; V[q + 3] = KB[o + 6];
      Sz[q] = KB[o + 7]; Sz[q + 1] = KB[o + 8]; Sz[q + 2] = KB[o + 9]; Sz[q + 3] = KB[o + 10];
      M[q] = KB[o + 11]; M[q + 1] = KB[o + 12]; M[q + 2] = KB[o + 13]; M[q + 3] = KB[o + 14];
      Cc[q] = KB[o + 15]; Cc[q + 1] = KB[o + 16]; Cc[q + 2] = KB[o + 17]; Cc[q + 3] = KB[o + 18];
      K[q] = KB[o + 19]; K[q + 1] = KB[o + 20]; K[q + 2] = KB[o + 21]; K[q + 3] = KB[o + 23];
      dinkEnd = Math.max(dinkEnd, t + KB[o + 22] + KB[o + 6]); }
    for (let j = 0; j < KA.length; j++) KA[j].needsUpdate = true; dink.visible = true; dinksN++;
  }
  function dinkHit(rec, t) { if (!dinks(rec) || !validRecord(rec)) return false; if (rec.v && (rec.v === me() || rec.v === watched())) return false; const n = planDink(rec, KB); if (n) { spawnDink(n, t); onDink?.(rec); } return n > 0; }
  // (v53 HITS, H6) your own wounds on your screen: one screen-space pool, one draw, warmed with the others
  const lc = quad(LOCAL_N, [['aP', 4], ['aL', 4], ['aC', 4]]);
  const localMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uCells: { value: DECAL_GRID }, uMap: { value: decalTex } }, vertexShader: LOCAL_VS, fragmentShader: LOCAL_FS, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
  localMat.userData.shared = true;
  const local = new THREE.Mesh(lc.g, localMat); local.name = 'gd-blood-local'; local.frustumCulled = false; local.visible = false; local.matrixAutoUpdate = false; local.renderOrder = 999; local.userData.gd = true; local.userData.warm = true; local.userData.noPool = true; local.userData.fx = true; scene?.add(local);   // (fx: drawn after a smoke, so a cloud never covers it)
  const LB = new Float32Array(MAX_LOCAL * LK), LA = Object.values(lc.a), VF = { fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 }; let lHead = 0, localEnd = -1, locals = 0, lastAt = -1;
  function localHit(rec, t) { if (!validRecord(rec)) return 0; view(VF); const n = planLocal(rec, VF.fx, VF.fz, LB); const P = lc.a.aP.array, Lf = lc.a.aL.array, Cc = lc.a.aC.array;
    for (let j = 0; j < n; j++) { const o = j * LK, q = lHead * 4; lHead = (lHead + 1) % LOCAL_N;
      P[q] = LB[o]; P[q + 1] = LB[o + 1]; P[q + 2] = LB[o + 2]; P[q + 3] = t; Lf[q] = LB[o + 3]; Lf[q + 1] = LB[o + 4]; Lf[q + 2] = LB[o + 5]; Lf[q + 3] = LB[o + 6];
      Cc[q] = LB[o + 7]; Cc[q + 1] = LB[o + 8]; Cc[q + 2] = LB[o + 9]; Cc[q + 3] = LB[o + 10]; localEnd = Math.max(localEnd, t + LB[o + 3]); }
    if (n) { for (let j = 0; j < LA.length; j++) LA[j].needsUpdate = true; local.visible = true; locals++; lastAt = t; } return n; }
  function clearLocal() { lc.a.aL.array.fill(0); lc.a.aL.needsUpdate = true; lHead = 0; localEnd = -1; local.visible = false; }
  function clearDink() { dk.a.aV.array.fill(0); dk.a.aV.needsUpdate = true; kHead = 0; dinkEnd = -1; dink.visible = false; }
  // particles start with no life: nothing drawn
  const PB = new Float32Array(MAX_PER_HIT * SP), DB = new Float32Array(MAX_DECALS_PER_HIT * DC), cast = mapCast(boxes);
  let sHead = 0, dHead = 0, dCount = 0, sprayEnd = -1, lastList = null, lastSeq = 0, lastTop = 0, hits = 0;
  const SA = Object.values(sp.a), DA = Object.values(dc.a);
  // records waiting for their decals (one placed a frame): a fixed ring of the records themselves and their arrival times
  const PEND = new Array(8).fill(null), PENDT = new Float64Array(8); let pHead = 0, pN = 0;
  let held = null; const now = () => held ?? (performance.now() - t0) / 1000;   // (held: the clock stopped — tests' pictures)
  function spawn(n, t) {
    const P = sp.a.aP.array, V = sp.a.aV.array, Sz = sp.a.aS.array, M = sp.a.aM.array, Cc = sp.a.aC.array, X = sp.a.aX.array, Fd = sp.a.aF.array;
    for (let k = 0; k < n; k++) { const i = sHead, o = k * SP, q = i * 4; sHead = (sHead + 1) % SPRAY_N;
      P[q] = PB[o]; P[q + 1] = PB[o + 1]; P[q + 2] = PB[o + 2]; P[q + 3] = t + PB[o + 20];
      V[q] = PB[o + 3]; V[q + 1] = PB[o + 4]; V[q + 2] = PB[o + 5]; V[q + 3] = PB[o + 6];
      Sz[q] = PB[o + 7]; Sz[q + 1] = PB[o + 8]; Sz[q + 2] = PB[o + 9]; Sz[q + 3] = PB[o + 10];
      M[q] = PB[o + 11]; M[q + 1] = PB[o + 12]; M[q + 2] = PB[o + 13]; M[q + 3] = PB[o + 14];
      Cc[q] = PB[o + 16]; Cc[q + 1] = PB[o + 17]; Cc[q + 2] = PB[o + 18]; Cc[q + 3] = PB[o + 19];
      X[q] = PB[o + 15]; X[q + 1] = PB[o + 21]; X[q + 2] = PB[o + 25]; X[q + 3] = PB[o + 26]; Fd[q] = PB[o + 24]; Fd[q + 1] = PB[o + 22]; Fd[q + 2] = PB[o + 23]; Fd[q + 3] = 0;
      sprayEnd = Math.max(sprayEnd, t + PB[o + 20] + PB[o + 6]); }
    for (let k = 0; k < SA.length; k++) SA[k].needsUpdate = true; spray.visible = true;
  }
  function addDecals(n, t) {
    const Cc = dc.a.aC.array, U = dc.a.aU.array, V = dc.a.aV.array;
    for (let k = 0; k < n; k++) { const i = dHead, o = k * DC, q = i * 4; dHead = (dHead + 1) % DECAL_N; dCount = Math.min(DECAL_N, dCount + 1);
      Cc[q] = DB[o]; Cc[q + 1] = DB[o + 1]; Cc[q + 2] = DB[o + 2]; Cc[q + 3] = t + DB[o + 10];
      U[q] = DB[o + 3]; U[q + 1] = DB[o + 4]; U[q + 2] = DB[o + 5]; U[q + 3] = DB[o + 9];
      V[q] = DB[o + 6]; V[q + 1] = DB[o + 7]; V[q + 2] = DB[o + 8]; V[q + 3] = DB[o + 11]; }
    if (n) { for (let k = 0; k < DA.length; k++) DA[k].needsUpdate = true; decals.visible = true; }
  }
  // Everything off (a new round, a map change, Blood turned off).
  function clear() {
    dc.a.aV.array.fill(0); dc.a.aV.needsUpdate = true; dHead = 0; dCount = 0; decals.visible = false;
    sp.a.aV.array.fill(0); sp.a.aV.needsUpdate = true; sHead = 0; sprayEnd = -1; spray.visible = false; PEND.fill(null); pN = 0;
  }
  // One host record: its spray now (not on your own body), its decals queued (placed one record a frame).
  function hit(rec, t = now()) {
    if (!validRecord(rec)) return false; hits++; lastAt = t;   // (lastAt: the newest record's birth — pictures hold the clock from it)
    const own = rec.v && (rec.v === me() || rec.v === watched());
    if (!own) { const n = planSpray(rec, PB); if (n) spawn(n, t); }
    PEND[(pHead + pN) % 8] = rec; PENDT[(pHead + pN) % 8] = t; if (pN < 8) pN++; else pHead = (pHead + 1) % 8;   // (a full ring: the oldest waiting record's decals are dropped)
    return true;
  }
  function placeNext() { if (!pN) return 0; const rec = PEND[pHead], t = PENDT[pHead]; PEND[pHead] = null; pHead = (pHead + 1) % 8; pN--; const n = planDecals(rec, cast, DB); addDecals(n, t); return n; }
  // The round (Defuse: match + round number; Deathmatch: the map; out of the arena: none): a change clears the blood.
  // Compared field by field (no key string made per frame).
  let kMode, kMap, kMatch, kN, kSeen = false;
  const roundChanged = G => { const mode = G?.mode === 'arena', d = mode ? G.combat?.d : null, map = mode ? G.arena?.map ?? null : null, match = d ? d.match ?? null : null, n = d ? d.n ?? null : null;
    if (kSeen && mode === kMode && map === kMap && match === kMatch && n === kN) return false; const first = !kSeen; kSeen = true; kMode = mode; kMap = map; kMatch = match; kN = n; return !first; };
  // Pictures: CS2's own (user-assets models.blood) once loaded; sent to the GPU at a quiet moment.
  let pendingTex = null;
  const isQuiet = quiet || (() => { const G = game(), ph = G?.combat?.d?.round?.phase; return G?.mode !== 'arena' || ph === 'freeze' || ph === 'over' || ph === 'warmup' || !!(G?.arena?.lobby && !G.arena.lobby.started); });
  if (assets && typeof document !== 'undefined') userAssets().then(ua => { const B = ua.models?.blood; if (!B?.decals || !B?.spray) return; const L2 = new THREE.TextureLoader(), got = { wisp: !!B.wisp };
    const done = () => { if (got.decals && got.spray) pendingTex = got; };
    for (const k of ['decals', 'spray']) L2.load(userAssetURL(ua, B[k]), t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; got[k] = t; done(); }, undefined, () => {}); }).catch(() => {});
  let cs2 = null, source = 'builtin';
  function swapTextures() { if (!pendingTex || !isQuiet()) return; const T = cs2 = pendingTex; pendingTex = null; decalMat.uniforms.uMap.value = T.decals; sprayMat.uniforms.uMap.value = T.spray; sprayMat.uniforms.uWisp.value = T.wisp ? 1 : 0;   /* (v53 HITS: an atlas imported before the wisp frames — its puffs instead) */
    const r = globalThis.__infra?.renderer; try { r?.initTexture(T.decals); r?.initTexture(T.spray); } catch {} source = 'cs2'; }
  // Per frame: the clock uniform, new host records, at most one record's decals, quiet-moment texture swap.
  function update() {
    const t = now(); sprayMat.uniforms.uTime.value = t; decalMat.uniforms.uTime.value = t; dinkMat.uniforms.uTime.value = t; localMat.uniforms.uTime.value = t;
    if (spray.visible && t > sprayEnd) spray.visible = false; if (local.visible && t > localEnd) local.visible = false;
    if (dink.visible && t > dinkEnd) dink.visible = false;
    if (pendingTex) swapTextures();
    const G = game();
    if (roundChanged(G)) { if (dCount || spray.visible || pN) clear(); if (dink.visible) clearDink(); if (local.visible) clearLocal(); lastSeq = 0; }
    const on = live.blood, list = G?.mode === 'arena' ? G.combat?.bl : null;
    // new records (each once, by its rising number; one far below the last — another host — starts the count again)
    // (a client gets a new list each update; a host in this page — practice, solo — changes its own in place: the newest number tells)
    const top = list && list.length ? +list[list.length - 1]?.i : 0;
    if (list && (list !== lastList || top !== lastTop)) { lastList = list; lastTop = top; const hn = clock();
      for (let j = 0; j < list.length; j++) { const r = list[j], i = +r?.i; if (!(i > lastSeq) && !(i < lastSeq - 6e5)) continue; lastSeq = i; if (hn - r.at <= KEEP_MS) { if (on) { hit(r, t); if (r.v && (r.v === me() || r.v === watched())) localHit(r, t); } if (r.hm) dinkHit(r, t); } } }   // (v53 HITS: your own wound's splatter on your screen)   // (the dink: whatever the Blood setting)
    if (!on) { if (dCount || spray.visible || pN) clear(); if (local.visible) clearLocal(); return; }
    placeNext();
  }
  return { spray, decals, dink, local, update, hit, clear, placeNext, swapTextures, dinkHit, clearDink, localHit, clearLocal,
    get stats() { return { decals: dCount, sprayAlive: spray.visible, pending: pN, hits, source, sHead, dHead, dinks: dinksN, dinkAlive: dink.visible, kHead, locals, lHead, localAlive: local.visible }; },
    // the dink's one-pixel width: the picture's height in pixels (lab / tests; 1080 until told)
    setViewHeight(h) { if (h > 0) dinkMat.uniforms.uPx.value = 2 / h; },
    get time() { return now(); }, get lastAt() { return lastAt; },
    // tests and pictures: stop the clock (seconds since this started; null runs it again) · which pictures ('builtin' | 'cs2')
    hold(t) { held = t === null ? null : Number.isFinite(t) ? t : (performance.now() - t0) / 1000; },
    textures(which) { if (which === 'builtin') { decalMat.uniforms.uMap.value = decalTex; sprayMat.uniforms.uMap.value = sprayTex; sprayMat.uniforms.uWisp.value = 1; source = 'builtin'; } else if (which === 'cs2' && cs2) { decalMat.uniforms.uMap.value = cs2.decals; sprayMat.uniforms.uMap.value = cs2.spray; sprayMat.uniforms.uWisp.value = cs2.wisp ? 1 : 0; source = 'cs2'; } return source; },
    // tests: the pools' arrays
    get pools() { return { spray: sp.a, decals: dc.a, dink: dk.a, local: lc.a }; },
    // one visible sample of each (sharing the pools' materials), for a warm-up that wants its own objects
    warmObjects() { const a = new THREE.Mesh(sp.g, sprayMat), b = new THREE.Mesh(dc.g, decalMat), c = new THREE.Mesh(dk.g, dinkMat), d = new THREE.Mesh(lc.g, localMat); a.frustumCulled = b.frustumCulled = c.frustumCulled = d.frustumCulled = false; return [a, b, c, d]; },
    dispose() { scene?.remove(spray); scene?.remove(decals); scene?.remove(dink); scene?.remove(local); sp.g.dispose(); dc.g.dispose(); dk.g.dispose(); lc.g.dispose(); sprayMat.dispose(); decalMat.dispose(); dinkMat.dispose(); localMat.dispose(); decalTex.dispose(); sprayTex.dispose(); } };
}
