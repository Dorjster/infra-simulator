// Global Defensive · CS2's auto exposure and CS2's bloom settings for the map being played (v53 LOOK, spec 4.1).
//
// WHERE THE NUMBERS COME FROM (the user's own CS2 install; tools/import-cs2-look.mjs → user-assets/look/look.json,
// never shipped):
//   · the map's post_processing_volume entity (maps/de_<id>.vpk's entity lump, Source2Viewer-CLI → export/<id>/ents.txt):
//     minexposure / maxexposure (the auto exposure's RANGE), exposurespeedup / exposurespeeddown (how fast it moves),
//     fadetime (blending between volumes: one master volume per map, so unused), enableexposure;
//       dust2 [0.925, 1.1] 1.0/1.0 · mirage [0.8, 1.0] · inferno [0.8, 1.1] · nuke [1.0, 0.85] 1.1/0.9 · anubis [0.7, 1.8]
//       · ancient [1.0, 1.7] · overpass [0.8, 1.2]
//     Nuke's reversed range is in its entity itself (de_nuke: minexposure 1.0, maxexposure 0.85, hammeruniqueid
//     2:61814:38404), not an import slip. CS2's shader-side clamp (HLSL clamp(x, lo, hi) = min(max(x, lo), hi)) then
//     holds Nuke at 0.85 whatever it sees — which is also where the footage fit (exposure_fit.json) put it. We clamp
//     the same way (clampH), so Nuke does not adapt, as in CS2.
//   · the map's .vpost CBloomLayer (the volume's postprocessing resource): m_blendMode, m_flScreenBloomStrength (SCREEN)
//     or m_flBloomStrength (ADD), m_flBloomThreshold, m_flBloomThresholdWidth, m_flBlurWeight (5 × 0.2), m_vBlurTint:
//       SCREEN dust2 .184 (threshold 1.974 / width 2.364) · mirage and overpass (basepostprocess) .1261 (1.055 / 1.661)
//       · anubis .0301 (9.999 / 9.999) · nuke .0112 (1.055 / 2.421) · ADD inferno .12 (0.599 / 0.906) · ancient .163
//       (1.143 / 1.02). (Inferno's and Ancient's screen strength is 0, but their files use the ADD blend: they do bloom.)
//   NOT IN THE FILES (CS2's binary): the adaptation's KEY (what mean brightness it aims for) and the exact meaning of the
//   speeds. Ours: the speeds as rates per second of an exponential approach in log space (speedup when the picture
//   brightens = exposure rises, speeddown when it falls). The KEY, per map (EXPOSURE_KEY_FIT, v53 LOOK review fix): one
//   key for every map (0.205, the log-average linear luminance of the user's CS2 Dust II picture's 3D view, v53/ref/
//   cs2-hud.png) sent several maps to the far end of their range from CS2's own footage (Dust II 0.925 → 1.10, Inferno
//   0.8 → 1.10, Anubis 1.8 → 0.80), because we measure the GRADED picture and each map's curve and colour table differ
//   (CS2 measures its HDR scene before them). So each map's key is the luminance our renderer shows at CS2's footage
//   exposure (~/CS2-extract/build/exposure_fit.json, install_look.py post.use) in its two spawn views, High and Low (the
//   geometric mean of L·use/E over the 4 pictures of tests/browser/gd-look-shots.mjs, 2026-11-04): spawn views now
//   settle near CS2's footage exposure and darker / brighter places move within the map's range from there. 0.205 stays
//   the key of a map without a fit.
//
// THE RULE (adaptExposure, and the same lines in the GPU shader below):
//   L      = the log-average luminance of the frame as drawn (the composer's buffer after the scene and the smoke; the
//            map's grade is applied in its materials, so this is the graded picture: a feedback loop, steady when L = KEY)
//   target = clampH(E · KEY / L, min, max)          (KEY: the map's EXPOSURE_KEY_FIT, else EXPOSURE_KEY)
//   E'     = clampH(E · (target / E)^(1 − e^(−speed · dt)), min, max)     (speed = up when target > E, else down)
//   Frame-rate independent: two steps of dt/2 towards a fixed target equal one step of dt. A new map starts at its
//   fitted `use` (install_look.py post.use: CS2's footage) or its range's top.
//
// GPU ONLY (never readPixels): ExposurePass is a composer pass (needsSwap false: it only reads the frame) —
//   1. the frame → a 32 × 32 half-float target: each texel the mean log2 luminance of 4 × 4 bilinear taps of its cell;
//   2. 32 × 32 → a 1 × 1 32-bit float target holding E (r), E · 2^bias (g, what the map's shader multiplies by) and L (b),
//      read from the other 1 × 1 target (ping-pong) — EXPOSURE_U.uExpTex points at the newest, the map's materials and
//      the first-person gun's grade (cs2-render.js GRADE_U) read it next frame.
//   Two tiny programs, compiled by warm() when the composer is built (behind the loading card); nothing made per frame.
//   Without a composer (a software renderer: no post at all) EXPOSURE_U.uExpOn stays 0 and the map uses its fixed `use`.
import * as THREE from './three.module.js';
import { Pass, FullScreenQuad } from './post/Pass.js';

export const EXPOSURE_KEY = .205;   // (ours: cs2-hud.png's 3D view, log-average linear luminance — a map without a fit)
// (ours, see the top: L at CS2's footage exposure in each map's spawn views; Nuke's range holds it at 0.85 anyway)
export const EXPOSURE_KEY_FIT = Object.freeze({ dust2: .129, mirage: .240, inferno: .0875, nuke: .0995, anubis: .341, ancient: .0886, overpass: .0309 });
export const clampH = (x, lo, hi) => Math.min(Math.max(x, lo), hi);   // HLSL's clamp: lo > hi gives hi (Nuke)
// The look of the map being played; cs2-render.js fills it when a map's look is prepared (setLook), graphics.js reads it.
export const GD_LOOK = { ver: 0, id: null, lo: 1, hi: 1, up: 1, down: 1, use: 1, bias: 1, key: EXPOSURE_KEY, bloom: null, from: '' };
// The uniforms the map's materials read (shared objects: one value serves every program).
export const EXPOSURE_U = { uExpTex: { value: null }, uExpOn: { value: 0 } };
// The baked map's fixed point-light term (cs2-render.js BAKED_PARS gdPoints, BAKED_LIGHT_N = 6): position + range (0 =
// off) and colour × intensity per slot, written by graphics.js each frame from its light pool. Here (not in
// cs2-render.js) so graphics.js reads it without loading the map code.
export const BAKED_LIGHT_N = 6;
export const BAKED_LIGHTS_U = { uBPLp: { value: Array.from({ length: BAKED_LIGHT_N }, () => new THREE.Vector4()) }, uBPLc: { value: Array.from({ length: BAKED_LIGHT_N }, () => new THREE.Vector3()) } };

// One adaptation step (the JS mirror of the shader: tests, and the fallback). L: the frame's log-average luminance.
export function adaptExposure(E, L, dt, look = GD_LOOK, key = look.key ?? EXPOSURE_KEY) {
  const t = clampH(E * key / Math.max(L, 1e-4), look.lo, look.hi), r = t > E ? look.up : look.down;
  return clampH(E * Math.pow(t / E, 1 - Math.exp(-r * Math.max(0, dt))), look.lo, look.hi);
}
// The map's post data (look.json's entry: { volume: {...}, bloom: {...} }) and its fitted exposure → GD_LOOK.
export function setLook(id, entry, use) {
  const V = entry?.volume, B = entry?.bloom;
  if (!V || !Number.isFinite(V.minexposure) || !Number.isFinite(V.maxexposure)) { GD_LOOK.id = null; GD_LOOK.bloom = null; GD_LOOK.ver++; return GD_LOOK; }
  GD_LOOK.id = id; GD_LOOK.lo = V.minexposure; GD_LOOK.hi = V.maxexposure;
  GD_LOOK.up = Number.isFinite(V.exposurespeedup) && V.exposurespeedup > 0 ? V.exposurespeedup : 1; GD_LOOK.down = Number.isFinite(V.exposurespeeddown) && V.exposurespeeddown > 0 ? V.exposurespeeddown : 1;
  GD_LOOK.use = clampH(Number.isFinite(use) ? use : Math.max(V.minexposure, V.maxexposure), V.minexposure, V.maxexposure);
  GD_LOOK.bias = 2 ** (Number.isFinite(entry.tone?.m_flExposureBias) ? entry.tone.m_flExposureBias : 0); GD_LOOK.key = EXPOSURE_KEY_FIT[id] ?? EXPOSURE_KEY;
  GD_LOOK.bloom = bloomOf(B, entry.tone, GD_LOOK.use * GD_LOOK.bias); GD_LOOK.from = entry.vpost || ''; GD_LOOK.ver++; return GD_LOOK;
}
// The map's filmic curve (CS2's Hable form, cs2-render.js cs2Hable) on one value: HDR scene light → the display value
// (0–1) the map's grade gives it, before its colour table.
export function displayOf(x, T) {
  if (!T) return Math.min(1, Math.max(0, x)); const A = +T.m_flShoulderStrength, B = +T.m_flLinearStrength, C = +T.m_flLinearAngle, D = +T.m_flToeStrength, E = +T.m_flToeNum, F = +T.m_flToeDenom, W = +T.m_flWhitePoint || 1;
  const h = v => v * (A * v * (F - E) + B * (C * F - E)) / (F * (v * (A * v + B) + D * F)), y = h(Math.max(0, x)) / h(W);
  return Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : Math.min(1, Math.max(0, x));   // (a tone record without the whole curve — only a bias, as when look.json is not imported — is linear, never NaN)
}
// CS2's CBloomLayer → what graphics.js gives the bloom pass: { screen, strength, threshold, width, lo, hi, weights,
// tints } (strength 0: the pass is off). CS2 thresholds the HDR scene; this game grades in the map's materials, so the
// composer holds display values: lo / hi are the threshold and threshold + width through the map's curve at its
// starting exposure E, held to 0.92 / 1.0 at most (a threshold above the white point — Dust II's 1.974 over its 1.649 —
// leaves only the clipped highlights blooming, which is what it does in CS2's HDR too).
export function bloomOf(B, T = null, E = 1) {
  if (!B) return null; const screen = B.m_blendMode !== 'BLOOM_BLEND_ADD';
  const strength = +(screen ? B.m_flScreenBloomStrength : B.m_flBloomStrength) || 0;
  const w = Array.isArray(B.m_flBlurWeight) && B.m_flBlurWeight.length === 5 ? B.m_flBlurWeight.map(Number) : [.2, .2, .2, .2, .2];
  const t = Array.isArray(B.m_vBlurTint) && B.m_vBlurTint.length === 5 ? B.m_vBlurTint.map(c => new THREE.Vector3(+c[0] || 0, +c[1] || 0, +c[2] || 0)) : null;
  const threshold = +B.m_flBloomThreshold || 1, width = +B.m_flBloomThresholdWidth || 1, lo = Math.min(.92, displayOf(threshold * E, T)), hi = Math.max(lo + .04, Math.min(1, displayOf((threshold + width) * E, T)));
  return Object.freeze({ screen, strength, threshold, width, lo, hi, weights: w, tints: t });
}

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
const DOWN = 32;
const DOWN_FS = `uniform sampler2D tSrc; varying vec2 vUv;
float lumLog( vec2 p ) { vec3 c = texture2D( tSrc, p ).rgb; return log2( max( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0 ) + 1e-4 ); }
void main() { vec2 cell = 1.0 / vec2( ${DOWN}.0 ), o = vUv - 0.5 * cell; float s = 0.0;
  for ( int y = 0; y < 4; y ++ ) for ( int x = 0; x < 4; x ++ ) s += lumLog( o + ( vec2( float( x ), float( y ) ) + 0.5 ) * 0.25 * cell );
  gl_FragColor = vec4( s / 16.0, 0.0, 0.0, 1.0 ); }`;
const ADAPT_FS = `uniform sampler2D tDown; uniform sampler2D tPrev; uniform float uDt, uLo, uHi, uUp, uDn, uKey, uInit, uUse, uBias; varying vec2 vUv;
float clampH( float x ) { return min( max( x, uLo ), uHi ); }
void main() { float s = 0.0; for ( int y = 0; y < ${DOWN}; y ++ ) for ( int x = 0; x < ${DOWN}; x ++ ) s += texture2D( tDown, ( vec2( float( x ), float( y ) ) + 0.5 ) / ${DOWN}.0 ).r;
  float L = exp2( s / ${DOWN * DOWN}.0 ), E = uInit > 0.5 ? uUse : texture2D( tPrev, vec2( 0.5 ) ).r; E = clampH( max( E, 1e-3 ) );
  float t = clampH( E * uKey / max( L, 1e-4 ) ), r = t > E ? uUp : uDn; E = clampH( E * pow( t / E, 1.0 - exp( - r * uDt ) ) );
  gl_FragColor = vec4( E, E * uBias, L, 1.0 ); }`;

export class ExposurePass extends Pass {
  constructor() {
    super(); this.needsSwap = false; this.isGdExposure = true; const o = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false };
    this.down = new THREE.WebGLRenderTarget(DOWN, DOWN, { ...o, minFilter: THREE.NearestFilter }); const f = { ...o, type: THREE.FloatType }; this.e = [new THREE.WebGLRenderTarget(1, 1, f), new THREE.WebGLRenderTarget(1, 1, f)]; this.i = 0; this.ver = -1;   // (32-bit: a frame's step at 144 fps is ~2e-4, below half-float's 1e-3 near 1 — it stalled there)
    this.downM = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null } }, vertexShader: VS, fragmentShader: DOWN_FS, depthTest: false, depthWrite: false }); this.downM.name = 'GDExposureDown';
    this.adaptM = new THREE.ShaderMaterial({ uniforms: { tDown: { value: this.down.texture }, tPrev: { value: null }, uDt: { value: 0 }, uLo: { value: 1 }, uHi: { value: 1 }, uUp: { value: 1 }, uDn: { value: 1 }, uKey: { value: EXPOSURE_KEY }, uInit: { value: 1 }, uUse: { value: 1 }, uBias: { value: 1 } },
      vertexShader: VS, fragmentShader: ADAPT_FS, depthTest: false, depthWrite: false }); this.adaptM.name = 'GDExposureAdapt';
    this.quad = new FullScreenQuad(this.downM); this.last = 0;
  }
  // Both programs compiled now (the composer is built behind the loading card): one draw each into the targets.
  warm(renderer) { const was = renderer.getRenderTarget(); try { this.downM.uniforms.tSrc.value = this.down.texture; this.quad.material = this.downM; renderer.setRenderTarget(this.e[1]); this.quad.render(renderer); this.adaptM.uniforms.tPrev.value = this.e[1].texture; this.quad.material = this.adaptM; renderer.setRenderTarget(this.e[0]); this.quad.render(renderer); } finally { renderer.setRenderTarget(was); } }
  render(renderer, writeBuffer, readBuffer, dt) {
    const L = GD_LOOK, U = this.adaptM.uniforms; if (L.id === null) { EXPOSURE_U.uExpOn.value = 0; return; }
    if (this.ver !== L.ver) { this.ver = L.ver; U.uInit.value = 1; U.uLo.value = L.lo; U.uHi.value = L.hi; U.uUp.value = L.up; U.uDn.value = L.down; U.uUse.value = L.use; U.uBias.value = L.bias; U.uKey.value = L.key; } else U.uInit.value = 0;
    U.uDt.value = Math.min(.25, Math.max(0, +dt || 0));
    const was = renderer.getRenderTarget(); try {
      this.downM.uniforms.tSrc.value = readBuffer.texture; this.quad.material = this.downM; renderer.setRenderTarget(this.down); this.quad.render(renderer);
      const from = this.e[this.i], to = this.e[1 - this.i]; U.tPrev.value = from.texture; this.quad.material = this.adaptM; renderer.setRenderTarget(to); this.quad.render(renderer);
      this.i = 1 - this.i; EXPOSURE_U.uExpTex.value = to.texture; EXPOSURE_U.uExpOn.value = 1;
    } finally { renderer.setRenderTarget(was); }
  }
  setSize() {}
  dispose() { this.down.dispose(); this.e[0].dispose(); this.e[1].dispose(); this.downM.dispose(); this.adaptM.dispose(); this.quad.dispose(); if (EXPOSURE_U.uExpTex.value === this.e[0].texture || EXPOSURE_U.uExpTex.value === this.e[1].texture) { EXPOSURE_U.uExpTex.value = null; EXPOSURE_U.uExpOn.value = 0; } }
}
