// Drawing a weapon skin (skins.js) on a gun's own materials. One shader patch for every skinnable material ('|skin2':
// the same program whatever the skin — only uniforms and texture bindings change, so a skin appearing never compiles
// anything; every sampler is always declared, bound to a 1×1 picture when unused). Modes (uSkMode):
//  0 no paint (stickers only) · 1 a built-in finish in the texture's UV space (a model without a fit) ·
//  2 a built-in finish in the model's own space (along its length, across its height: seamless over UV islands, and on
//    models without UVs — the Quaternius guns) · 3 a CS2 finish imported on the host (skin-textures.js): its baked paint,
//    metal / rough and wear rank on UV0 of CS2's mesh (the paint gone where rank < wear).
// A CS2 finish not on this computer yet (or on a model without CS2's UVs) draws its built-in stand-in (skin.fb) in
// mode 2 until its pictures are in (they go to the GPU only between rounds). Knife handles stay black: CS2's bakes
// carry it; built-in finishes go through the knife's blade mask (vertex colours). Your own first-person gun also gets
// the map's baked light where you stand (FP_LIGHT) and the map's colour grade (cs2-render.js), as the map around it.
import * as THREE from './three.module.js';
import { FINISHES, PATTERNS, STICKERS, STICKER_IDS } from './skins.js';
import { texEntry, acquire, release, want, unwant, onSkinReady, onSkinManifest, loadSkinManifest, skinManifest, fbOf } from './skin-textures.js';
import { GRADE_U, GRADE_PARS } from './cs2-render.js';

let atlas = null;   // stickers: one row of 128-px cells, each a glyph on its badge (drawn once, on first use)
function stickerAtlas() {
  if (atlas || typeof document === 'undefined') return atlas; const n = 16, c = document.createElement('canvas'); c.width = 128 * n; c.height = 128; const x = c.getContext('2d');
  STICKER_IDS.forEach((id, i) => { const s = STICKERS[id], cx = i * 128 + 64; x.save(); x.beginPath(); x.arc(cx, 64, 56, 0, Math.PI * 2); x.fillStyle = s.bg; x.fill(); x.lineWidth = 6; x.strokeStyle = s.foil ? '#f8e9a0' : 'rgba(255,255,255,.85)'; x.stroke();
    x.fillStyle = s.fg; x.font = `900 ${s.glyph.length > 1 && !/\p{Extended_Pictographic}/u.test(s.glyph) ? 50 : 66}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s.glyph, cx, 68); x.restore(); });
  atlas = new THREE.CanvasTexture(c); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4; return atlas;
}
// Built-in finishes' looks (this game's own, no Valve data): how each responds to light — anodized (coloured metal,
// glossy), patina (metal, satin), paint / hydro (dielectric) — a 4th colour, the pattern's base turn (the seed adds
// ±15°, no longer any angle: a Fade is always tip to base) and size (repeats along the gun), the wear range (Fade,
// Doppler, Marble: CS2's 0.08 cap) and pearlescence.
const LOOK = {
  none: { metal: 0, rough: .5 },
  fade: { metal: 1, rough: .17, d: '#3b2aa8', rot: 0, scale: 1, wear: .08 },
  marble: { metal: 1, rough: .17, d: '#f2f2f2', rot: .5, scale: 1.4, wear: .08, pearl: .08 },
  doppler: { metal: 1, rough: .15, d: '#ff5a6a', rot: .3, scale: 1.9, wear: .08, pearl: .22 },
  sapphire: { metal: 1, rough: .15, d: '#7fb8ff', rot: .3, scale: 1.9, wear: .08, pearl: .22 },
  emerald: { metal: 1, rough: .15, d: '#8cffb8', rot: .3, scale: 1.9, wear: .08, pearl: .22 },
  casehardened: { metal: 1, rough: .38, d: '#b8a77a', rot: 0, scale: 2.2 },
  web: { metal: .1, rough: .5, rot: .2, scale: 1.7 },
  tiger: { metal: 1, rough: .22, rot: 0, scale: 1.2, wear: .08 },
  asiimov: { metal: .1, rough: .45, rot: 0, scale: 1 },
  hex: { metal: .2, rough: .4, rot: 0, scale: 1 },
  camo: { metal: 0, rough: .62, d: '#a8946a', rot: .4, scale: 2 },
  forest: { metal: 0, rough: .62, d: '#45502c', rot: .4, scale: 2 },
  redline: { metal: .1, rough: .42, rot: 0, scale: 1 },
  gold: { metal: 1, rough: .25, rot: 0, scale: 1 },
};
const looks = new Map();   // id → parsed (linear colours made once: applying a skin allocates nothing)
function lookOf(id) {
  let L = looks.get(id); if (L) return L; const f = FINISHES[id] || FINISHES.none, k = LOOK[id] || LOOK.none, [a, b, c] = f.colors, col = h => new THREE.Color(h || '#888');
  L = { pat: Math.max(0, PATTERNS.indexOf(f.pattern)), A: col(a), B: col(b || a), C: col(c || b || a), D: col(k.d || c || b || a), metal: k.metal ?? .1, rough: k.rough ?? .5, rot: k.rot || 0, scale: k.scale || 1, wear: k.wear ?? 1, pearl: k.pearl || 0 };
  looks.set(id, L); return L;
}
export const finishLook = id => { const L = lookOf(id); return { pattern: PATTERNS[L.pat], metal: L.metal, rough: L.rough, rot: L.rot, scale: L.scale, wearMax: L.wear, pearl: L.pearl }; };
// The patterns' own pictures (drawn once here, by code — not Valve art): 256², tileable. R, G: soft noise at two sizes;
// B: tiger stripes' field (thresholded in the shader, crisp at any distance); A: cells (Case Hardened's patches).
const PT = 256; let patData = null, patTex = null;
const hash = (x, y, s) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function pnoise(x, y, L, s) { const fx = x * L, fy = y * L, ix = Math.floor(fx), iy = Math.floor(fy); let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const x0 = ((ix % L) + L) % L, y0 = ((iy % L) + L) % L, x1 = (x0 + 1) % L, y1 = (y0 + 1) % L, a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s); return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty; }
function pfbm(x, y, L, s, oct) { let a = 0, w = .5, n = 0; for (let k = 0; k < oct; k++) { a += w * pnoise(x, y, L, s + k); n += w; L *= 2; w *= .5; } return a / n; }
function patternData() {
  if (patData) return patData; const D = new Uint8Array(PT * PT * 4), G = 6, pts = new Float32Array(G * G * 2); for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { pts[(j * G + i) * 2] = (i + hash(i, j, 91)) / G; pts[(j * G + i) * 2 + 1] = (j + hash(i, j, 92)) / G; }
  for (let y = 0; y < PT; y++) for (let x = 0; x < PT; x++) { const u = x / PT, v = y / PT, k = (y * PT + x) * 4, ci = Math.floor(u * G), cj = Math.floor(v * G); let f1 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const I = ci + di, J = cj + dj, i = ((I % G) + G) % G, j = ((J % G) + G) % G; f1 = Math.min(f1, Math.hypot(pts[(j * G + i) * 2] + (I - i) / G - u, pts[(j * G + i) * 2 + 1] + (J - j) / G - v)); }   // (the neighbour across the edge: the same point, a tile over)
    D[k] = 255 * pfbm(u, v, 4, 1, 5); D[k + 1] = 255 * pfbm(u, v, 6, 7, 4); D[k + 2] = 255 * (.5 + .5 * Math.sin(2 * Math.PI * (6 * u + v + .6 * pfbm(u, v, 3, 13, 3)))); D[k + 3] = 255 * Math.min(1, f1 * G * .9); }
  return patData = D;
}
function patternTexture() { if (patTex) return patTex; patTex = new THREE.DataTexture(patternData(), PT, PT); patTex.wrapS = patTex.wrapT = THREE.RepeatWrapping; patTex.magFilter = THREE.LinearFilter; patTex.minFilter = THREE.LinearMipmapLinearFilter; patTex.generateMipmaps = true; patTex.userData.shared = true; patTex.needsUpdate = true; return patTex; }
let dummy = null;   // every unused sampler: one white texel (never null: a binding never changes a program)
const dummyTexture = () => { if (!dummy) { dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); dummy.userData.shared = true; dummy.needsUpdate = true; } return dummy; };
// Textures every skinned material samples (lab.js warm-up sends them to the GPU behind the loading card).
export const skinSharedTextures = () => [patternTexture(), dummyTexture(), stickerAtlas()].filter(Boolean);
const VERT_PARS = '#include <common>\nvarying vec3 vSkO; varying vec3 vSkN; varying vec2 vSkUv;', VERT_BODY = '#include <begin_vertex>\n\tvSkO = position; vSkN = normal; vSkUv = uv;';   // (bind pose, before skinning: the pattern sticks to the gun)
const GLSL = `
uniform float uSkinOn; uniform float uSkinVC; uniform float uSkMode; uniform float uSkPat; uniform vec3 uSkA; uniform vec3 uSkB; uniform vec3 uSkC; uniform vec3 uSkD;
uniform float uSkWear; uniform vec4 uSkSeed; uniform vec2 uSkMR; uniform float uSkPearl; uniform mat4 uSkM; uniform float uSkFlip; uniform float uSkUv; uniform float uSkAvg; uniform float uSkLight; uniform float uSkGr; uniform float uSkAll;
uniform sampler2D uSkPaint; uniform sampler2D uSkMRW; uniform sampler2D uSkTex;   // (4 samplers: a texture unit fewer for ANGLE's 16 — the grime is drawn from uSkTex)
uniform vec4 uStk[5]; uniform vec2 uStkRW[5]; uniform sampler2D uStkAtlas;
varying vec3 vSkO; varying vec3 vSkN; varying vec2 vSkUv;
vec3 skBase = vec3(1.0); float skK = 0.0; float skMet = 0.0; float skRgh = 0.5; float skHnd = 0.0;   // (the texel before paint; paint coverage; the paint's metal / rough; the knife handle)
float skH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(skH(i), skH(i + vec2(1.0, 0.0)), f.x), mix(skH(i + vec2(0.0, 1.0)), skH(i + vec2(1.0, 1.0)), f.x), f.y); }
float skF(vec2 p) { float a = 0.0, w = 0.5; for (int i = 0; i < 5; i++) { a += w * skN(p); p = p * 2.03 + 17.1; w *= 0.5; } return a; }
vec3 skRamp(float t) { t = clamp(t, 0.0, 1.0) * 3.0; return t < 1.0 ? mix(uSkA, uSkB, t) : t < 2.0 ? mix(uSkB, uSkC, t - 1.0) : mix(uSkC, uSkD, t - 2.0); }
float skAA(float e, float x) { float w = max(fwidth(x), 1e-4); return smoothstep(e - w, e + w, x); }
float skWeb(vec2 p) { vec2 f = fract(p) - 0.5; float r = length(f), t = fract(atan(f.y, f.x) / 6.2832 * 11.0), sag = 1.0 - 0.12 * sin(3.14159 * t);
  float sp = r * sin(min(t, 1.0 - t) * 6.2832 / 11.0), ring = abs(fract(r / sag * 8.0) - 0.5) / 8.0 * sag, w = max(fwidth(r), 1e-4) * 1.2 + 0.0015;
  return (1.0 - smoothstep(w * 0.6, w * 1.6, min(sp, ring))) * smoothstep(0.0, 0.04, r); }
vec3 skinPattern(vec2 p, float along) {
  vec4 T = texture2D(uSkTex, p * 0.37); int k = int(uSkPat + 0.5);
  if (k == 1) return skRamp(along + (T.r - 0.5) * 0.08);   // fade: base to tip along the blade, no seam
  if (k == 2) { float t = fract(p.x * 0.35 + (T.r + T.g) * 0.8); return skRamp(t < 0.5 ? t * 2.0 : 2.0 - t * 2.0); }
  if (k == 3) { vec4 V = texture2D(uSkTex, p * 0.21 + 0.31); float sw = smoothstep(0.25, 0.55, V.r + 0.25 * sin((p.x + p.y) * 4.0 + T.g * 6.0)); return mix(uSkC, mix(uSkA, mix(uSkB, uSkD, smoothstep(0.7, 0.95, V.g)), smoothstep(0.3, 0.8, T.g)), sw); }
  if (k == 4) { vec4 V = texture2D(uSkTex, p * 0.19 + 0.53); vec3 c = mix(uSkA, uSkC, smoothstep(0.35, 0.6, V.a)); return mix(mix(c, uSkD, smoothstep(0.6, 0.8, T.g) * 0.5), uSkB, smoothstep(0.55, 0.75, T.r) * 0.85); }
  if (k == 5) return mix(uSkA, uSkB, skWeb(p * 0.8));
  if (k == 6) return mix(uSkA, uSkB, skAA(0.62, T.b * (0.75 + 0.5 * T.g)));
  if (k == 7) { float b = fract(p.y * 1.2 + 0.5); vec3 c = b < 0.55 ? uSkA : b < 0.8 ? uSkB : uSkC; return mix(c, uSkC, step(0.92, fract(p.x * 3.0))); }
  if (k == 8) { vec2 h = p * 14.0; h.y *= 1.1547; h.x += mod(floor(h.y), 2.0) * 0.5; vec2 f = fract(h) - 0.5; float e = max(abs(f.x), abs(f.y) * 1.3); return mix(mix(uSkA, uSkB, smoothstep(0.40, 0.47, e)), uSkC, 0.25 * skN(floor(h))); }
  if (k == 9) { vec4 V = texture2D(uSkTex, p * 0.6 + 0.17); float n = mix(T.r, V.g, 0.5); return mix(mix(uSkA, uSkB, skAA(0.45, n)), mix(uSkC, uSkD, step(0.5, V.a)), skAA(0.56, n)); }
  if (k == 10) { float b = abs(p.y - 0.15 * sin(p.x * 2.5)); return b < 0.05 ? uSkB : b < 0.065 ? uSkC : uSkA; }
  return uSkA;
}`;
const BODY = `#include <map_fragment>
skBase = diffuseColor.rgb;
if (uSkinOn > 0.5) { float lum = dot(skBase, vec3(0.299, 0.587, 0.114)); vec2 suv = vec2(vSkUv.x, uSkFlip > 0.5 ? 1.0 - vSkUv.y : vSkUv.y);
  if (uSkMode > 2.5) { vec3 paint = texture2D(uSkPaint, suv).rgb; vec4 mrw = texture2D(uSkMRW, suv); float w = min(uSkWear, 0.97);   // (rank 1 — handles, the toughest paint — never wears: 0.97 at most)
    w = min(w + 0.18 * smoothstep(0.45, 1.0, uSkWear), 0.97); skK = mrw.a * smoothstep(w - 0.02, w + 0.02, mrw.b);   // (Field-Tested on: scraped deeper than the rank alone — Battle-Scarred reads worn at arm's length, not only at the edges)
    vec4 T = texture2D(uSkTex, suv * 5.0); float g = smoothstep(0.3, 0.8, T.g * 0.7 + T.r * 0.3);   // (grime: this game's own noise — the pattern texture, no extra sampler)
    paint = mix(paint, vec3(dot(paint, vec3(0.333))) * 0.62, uSkWear * (0.2 + 0.55 * g));   // (worn paint: dulled, darker, in patches)
    diffuseColor.rgb = mix(skBase * mix(1.0, 0.7 + 0.5 * g, min(1.0, uSkWear * 0.8)), paint, skK); skMet = mrw.r; skRgh = clamp(mrw.g * mix(1.0, 0.6, mrw.r) + uSkWear * (0.15 + 0.3 * g), 0.04, 1.0); }   // (the bake's metal a mirror, as CS2's chrome; wear roughens it)
  else if (uSkMode > 0.5) { vec3 q = (uSkM * vec4(vSkO, 1.0)).xyz, an = abs(mat3(uSkM) * vSkN);
    vec2 pp = uSkMode > 1.5 ? (an.z >= max(an.x, an.y) ? q.xy : an.y >= an.x ? q.xz : q.zy) : suv;   // (the face's own plane: sides, top / bottom, the ends)
    float c = cos(uSkSeed.z), s = sin(uSkSeed.z); vec2 p = mat2(c, -s, s, c) * pp * uSkSeed.w + uSkSeed.xy;
    vec3 paint = skinPattern(p, uSkMode > 1.5 ? q.x + 0.5 : suv.x) * clamp(mix(1.0, lum / max(uSkAvg, 0.02), 0.5), 0.45, 1.35);   // (the gun's own shading under the paint, around its average: no blanket brightening)
    float sc = skF(pp * 40.0 + uSkSeed.xy * 13.0) * 0.6 + skF(pp * 7.0) * 0.4, worn = uSkWear > 0.001 ? smoothstep(1.05 - uSkWear * 1.1, 1.13 - uSkWear * 1.1, sc) : 0.0;
    float smx = max(skBase.r, max(skBase.g, skBase.b)), steelOnly = uSkAll > 0.5 ? 1.0 : 1.0 - smoothstep(0.12, 0.25, (smx - min(skBase.r, min(skBase.g, skBase.b))) / max(smx, 0.001));   // (paint on the steel; a handle's wood or cloth, coloured, keeps its own look)
    skK = (1.0 - worn) * steelOnly; diffuseColor.rgb = mix(mix(skBase, vec3(0.62, 0.62, 0.6) * (0.5 + 0.7 * lum), worn * steelOnly), paint, skK) * (1.0 - uSkWear * 0.18 * skF(pp * 3.0)); skMet = uSkMR.x; skRgh = uSkMR.y; }
  if (uSkUv > 0.5) for (int i = 0; i < 5; i++) { if (uStk[i].z <= 0.0) continue; vec2 q = suv - uStk[i].xy; float cr = cos(uStkRW[i].x), sr = sin(uStkRW[i].x); q = mat2(cr, -sr, sr, cr) * q / (uStk[i].z * 0.12) + 0.5;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) continue; vec4 st = texture2D(uStkAtlas, vec2((q.x + uStk[i].w) / 16.0, q.y)); float keep = skF(q * 9.0 + float(i)) > uStkRW[i].y * 1.1 ? 1.0 : 0.0; diffuseColor.rgb = mix(diffuseColor.rgb, st.rgb, st.a * keep); skK *= 1.0 - st.a * keep; } }`;
// A model's own vertex colours: CS2's star knives carry their finish's mask in them (red: the blade it covers; 0: the
// handle). uSkinVC 1: multiplied in as they are (the karambit's Ruby, no skin on); 2: a mask — the blade shows its
// steel or the skin, the handle its own unpainted black (matte); 0: not used (a CS2 bake carries its own handle).
// (v53 KNIVES final) Green without red: bare steel CS2 leaves unpainted outside its handle (the Bayonet's crossguard,
// ring and pommel, rivets: build_set.py from CS2's composite masks) — CS2's base material there, never the black-handle
// rule nor a finish's paint. The sets made before v53 have no green, so they look as before.
const VCOL = `#if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR )
  if (uSkinVC > 1.5) { float bm = smoothstep(0.02, 0.3, vColor.r), st = smoothstep(0.3, 0.6, vColor.g - vColor.r); diffuseColor.rgb = mix(mix(skBase * 0.06, diffuseColor.rgb, bm), skBase, st * (1.0 - bm)); skK *= bm; skHnd = (1.0 - bm) * (1.0 - st); }
  else if (uSkinVC > 0.5) diffuseColor.rgb *= vColor.rgb;
  else if (uSkMode > 2.5) { float st = smoothstep(0.3, 0.6, vColor.g - vColor.r); diffuseColor.rgb = mix(diffuseColor.rgb, skBase, st); skK *= 1.0 - st; }   // (a CS2 bake: it paints all but the blade near-black — bake.py's handle rule — so its bare steel takes the base back here)
#endif`;
const ROUGH = '#include <roughnessmap_fragment>\n\troughnessFactor = mix(mix(roughnessFactor, skRgh, skK), 0.7, skHnd);', METAL = '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix(mix(metalnessFactor, skMet, skK), 0.0, skHnd);';
const PEARL = '#include <normal_fragment_maps>\n\tif (uSkPearl > 0.0 && skK > 0.0) { float ph = uSkPearl * skK * 2.0 * (1.0 - abs(dot(normal, normalize(vViewPosition)))), pc = cos(ph); vec3 ax = vec3(0.57735); diffuseColor.rgb = diffuseColor.rgb * pc + cross(ax, diffuseColor.rgb) * sin(ph) + ax * dot(ax, diffuseColor.rgb) * (1.0 - pc); }';   // (a hue turn at grazing angles: the pearl of Doppler and co., approximate)
const LIGHT = '#include <aomap_fragment>\n\treflectedLight.directDiffuse *= uSkLight; reflectedLight.directSpecular *= uSkLight; reflectedLight.indirectDiffuse *= uSkLight; reflectedLight.indirectSpecular *= uSkLight * (1.0 + 0.9 * skK * skMet * step(2.5, uSkMode) * step(0.5, uSkGr));';   // (first person, a CS2 bake's metal: the studio box's sweep at CS2-icon strength — chrome, Damascus, Fade read as mirror steel, not grey)
const GRADE = '\tif (uGrade > 0.5 && uSkGr > 0.5) gl_FragColor.rgb = cs2Grade(gl_FragColor.rgb);\n#include <tonemapping_fragment>';
// Your own first-person gun's light: the map's baked light where you stand (lab.js setFPLightAt), as CS2 agents get it
// (cs2-agents.js) — a reflection that glows in a dark tunnel no more. One value for every first-person material.
export const FP_LIGHT = { value: 1 }; const ONE = { value: 1 }, FP_GRADE = { value: 1 }, NO_GRADE = { value: 0 };
let lightAtFn = null, lightT = 0; const lightV = new THREE.Vector3();
export const setFPLightAt = fn => { lightAtFn = fn; if (!fn) FP_LIGHT.value = 1; };
export function fpLightTick(dt, obj) { if (!lightAtFn || !obj) return; lightT -= dt; if (lightT > 0) return; lightT = .15; obj.getWorldPosition(lightV); const l = lightAtFn(lightV.x, lightV.y, lightV.z); if (!Number.isFinite(l)) return; FP_LIGHT.value += (Math.min(1.1, Math.max(.35, .3 + .75 * l)) - FP_LIGHT.value) * .5; }
// Per material: its uniforms and what it is (kept here, not in userData: Material.clone copies userData through JSON —
// Colors and Vectors became plain objects — and not the shader hook). userData.skinU still reads the uniforms (tests,
// debugging), not enumerable so a clone never carries it.
const INFO = new WeakMap(), pending = new Set(), stats = { prepared: 0, lateVC: 0, latePrepare: 0, cloned: 0, disposed: 0 };
export const skinnable = m => !!m && m.isMeshStandardMaterial === true && !m.transparent && !m.userData?.noSkin;
export const skinInfo = m => INFO.get(m) || null;
export const skinRenderStats = () => ({ ...stats, cached: [...CACHE.values()].reduce((n, b) => n + b.size, 0) });
function avgLum(m) {   // the base picture's mean luminance (linear), once per material: what "unshaded" is on this gun
  const img = m.map?.image, c = new THREE.Color(); if (!img || typeof document === 'undefined' || !img.width) return m.color ? (c.copy(m.color), Math.max(.02, .299 * c.r + .587 * c.g + .114 * c.b)) : .5;
  try { const cv = document.createElement('canvas'); cv.width = cv.height = 4; const x = cv.getContext('2d'); x.drawImage(img, 0, 0, 4, 4); const d = x.getImageData(0, 0, 4, 4).data; let s = 0; for (let i = 0; i < 64; i += 4) { c.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace); s += .299 * c.r + .587 * c.g + .114 * c.b; } return Math.max(.02, s / 16 * (m.color ? (m.color.r + m.color.g + m.color.b) / 3 : 1)); } catch { return .5; }
}
// Make a material skinnable (once; later calls update what it is: model, UVs, tier, fit). opt: { model (weapon or
// knife id: whose CS2 bakes), uv ('cs2' — CS2's UV0; 'cs2flip' — the third-person .bin, V flipped at import; null),
// tier ('fp' your own view at 1024, else 'tp' 512), M (Matrix4: geometry → the pattern frame), hasUv }. Call it when a
// model loads, before its first compile: the patch is in the program from the start.
function prepare(m, opt = null, from = null) {
  let I = INFO.get(m);
  if (!I) { stats.prepared++; const fp = (opt?.tier ?? from?.tier) === 'fp', D = dummyTexture();
    const U = { uSkinOn: { value: 0 }, uSkinVC: { value: m.userData?.skinMask ? 0 : 1 }, uSkMode: { value: 0 }, uSkPat: { value: 0 }, uSkA: { value: new THREE.Color() }, uSkB: { value: new THREE.Color() }, uSkC: { value: new THREE.Color() }, uSkD: { value: new THREE.Color() },
      uSkWear: { value: 0 }, uSkSeed: { value: new THREE.Vector4(0, 0, 0, 1) }, uSkMR: { value: new THREE.Vector2(.1, .5) }, uSkPearl: { value: 0 }, uSkM: { value: new THREE.Matrix4() }, uSkFlip: { value: 0 }, uSkUv: { value: 1 }, uSkAvg: { value: .5 },
      uSkLight: fp ? FP_LIGHT : ONE, uSkGr: fp ? FP_GRADE : NO_GRADE, uSkAll: { value: 0 }, uSkPaint: { value: D }, uSkMRW: { value: D }, uSkGrunge: { value: D }, uSkTex: { value: patternTexture() },
      uStk: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) }, uStkRW: { value: Array.from({ length: 5 }, () => new THREE.Vector2()) }, uStkAtlas: { value: stickerAtlas() } };
    I = { m, U, model: null, uv: null, tier: fp ? 'fp' : 'tp', fit: false, tex: null, skin: null, tint: true, avg: null, compiled: false };
    const before = m.onBeforeCompile, ii = I; m.onBeforeCompile = (sh, r) => { before?.call(m, sh, r); ii.compiled = true; Object.assign(sh.uniforms, U, GRADE_U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_PARS).replace('#include <begin_vertex>', VERT_BODY);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', GRADE_PARS + GLSL + '\nvoid main() {').replace('#include <map_fragment>', BODY).replace('#include <color_fragment>', VCOL).replace('#include <roughnessmap_fragment>', ROUGH).replace('#include <metalnessmap_fragment>', METAL)
        .replace('#include <normal_fragment_maps>', PEARL).replace('#include <aomap_fragment>', LIGHT).replace('#include <tonemapping_fragment>', GRADE); };
    const key = m.customProgramCacheKey?.bind(m); m.customProgramCacheKey = () => (key ? key() : '') + '|skin2'; m.needsUpdate = true; INFO.set(m, I);
    Object.defineProperty(m.userData, 'skinU', { value: U, enumerable: false, configurable: true, writable: true }); }
  const src = opt || from; if (!src) { if (I.avg === null) { I.avg = avgLum(m); I.U.uSkAvg.value = I.avg; } return I; }
  if (src.model !== undefined) I.model = src.model; if (src.uv !== undefined) { I.uv = src.uv; I.U.uSkFlip.value = src.uv === 'cs2flip' ? 1 : 0; if (src.uv === 'cs2' && I.tier === 'tp' && m.vertexColors && !I.skin) I.U.uSkinVC.value = 2; }   // (a star knife in other hands, no skin on: its colours are the blade mask — plain steel, black handle; not the flat red they drew multiplied in)
  if (src.tier !== undefined && src.tier !== I.tier && !I.compiled) { I.tier = src.tier; I.U.uSkLight = I.tier === 'fp' ? FP_LIGHT : ONE; I.U.uSkGr = I.tier === 'fp' ? FP_GRADE : NO_GRADE; }   // (only before its first compile: the program holds the uniform objects it was built with)
  if (opt?.M) { I.U.uSkM.value.copy(opt.M); I.fit = true; } else if (from?.fit) { I.U.uSkM.value.copy(from.U.uSkM.value); I.fit = true; }
  if (opt?.paintAll !== undefined) I.U.uSkAll.value = opt.paintAll ? 1 : 0; else if (from) I.U.uSkAll.value = from.U.uSkAll.value;
  if (opt?.hasUv !== undefined) I.U.uSkUv.value = opt.hasUv ? 1 : 0; else if (from) I.U.uSkUv.value = from.U.uSkUv.value;
  I.avg = from?.avg ?? (I.avg === null ? avgLum(m) : I.avg); I.U.uSkAvg.value = I.avg; return I;
}
// Made skinnable when a set or model loads (its shader built then, on a loading screen — never compiled in play on a change).
export function prepareSkins(materials, opt = null) { for (const m of materials || []) if (skinnable(m)) prepare(m, opt); }
// A copy of a prepared material made elsewhere (weapon-models.js: a variant's tinted copy): the same patch and fit.
export const prepareLike = (copy, of) => { if (skinnable(copy) && skinnable(of)) prepare(copy, null, INFO.get(of) || prepare(of)); return copy; };
// A world model (third person, drops: blade / muzzle along −z, game convention) made skinnable at load, its pattern
// frame fitted: along its length (x: toward the muzzle or tip), its height (y), across (z), centred, in lengths.
const mA = new THREE.Matrix4(), bA = new THREE.Box3(), bB = new THREE.Box3();
export function prepareModel(root, opt = {}) {
  if (!root) return root; root.updateMatrixWorld(true); mA.copy(root.matrixWorld).invert(); bA.makeEmpty(); const list = [];
  root.traverse(o => { if (!o.isMesh || ![].concat(o.material).some(skinnable)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const rel = new THREE.Matrix4().multiplyMatrices(mA, o.matrixWorld); bA.union(bB.copy(o.geometry.boundingBox).applyMatrix4(rel)); list.push([o, rel]); });
  if (!list.length || bA.isEmpty()) return root; const c = bA.getCenter(new THREE.Vector3()), s = bA.getSize(new THREE.Vector3()), L = Math.max(s.z, s.x, s.y, 1e-4);
  const N = new THREE.Matrix4().set(0, 0, -1 / L, c.z / L, 0, 1 / L, 0, -c.y / L, 1 / L, 0, 0, -c.x / L, 0, 0, 0, 1);
  for (const [o, rel] of list) for (const m of [].concat(o.material)) if (skinnable(m)) prepare(m, { ...opt, M: new THREE.Matrix4().multiplyMatrices(N, rel), hasUv: !!o.geometry.attributes.uv });
  return root;
}
// A first-person set's skinned mesh (bind-pose positions): its long axis, the front end (knives: toward the blade,
// their vertex-colour mask; guns: the end further along the view's −z in the pose it stands in now), its up.
export function fitSkinned(mesh, root) {
  const g = mesh.geometry, P = g.attributes.position, n = P.count, col = g.attributes.color; g.computeBoundingBox(); const lo = g.boundingBox.min.toArray(), hi = g.boundingBox.max.toArray(), sz = [0, 1, 2].map(k => hi[k] - lo[k]), c = [0, 1, 2].map(k => (hi[k] + lo[k]) / 2);
  const [ax, up, th] = [0, 1, 2].sort((a, b) => sz[b] - sz[a]), L = sz[ax] || 1, step = Math.max(1, Math.floor(n / 6000)); let sA = 1, sU = 1;
  root?.updateMatrixWorld(true); const inv = root ? new THREE.Matrix4().copy(root.matrixWorld).invert() : new THREE.Matrix4(), v = new THREE.Vector3(), posed = i => (mesh.getVertexPosition ? mesh.getVertexPosition(i, v) : v.fromBufferAttribute(P, i)).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
  const ends = k => { let a = 0, b = 0; for (let i = 0; i < n; i += step) { if (P.getComponent(i, k) < P.getComponent(a, k)) a = i; if (P.getComponent(i, k) > P.getComponent(b, k)) b = i; } return [a, b]; };
  let cA = c[ax], LA = L;   // (along: a knife's runs over its blade only — a Fade from the guard to the tip, the handle black anyway)
  if (col) { let a = 0, na = 0, b = 0, nb = 0, b0 = Infinity, b1 = -Infinity; for (let i = 0; i < n; i += step) { const x = P.getComponent(i, ax); if (col.getX(i) > .3) { a += x; na++; b0 = Math.min(b0, x); b1 = Math.max(b1, x); } else { b += x; nb++; } } if (na && nb && a / na < b / nb) sA = -1; if (na && b1 - b0 > L * .2) { cA = (b0 + b1) / 2; LA = b1 - b0; } }
  else { const [a, b] = ends(ax), za = posed(a).z, zb = posed(b).z; if (zb > za) sA = -1; }
  { const [a, b] = ends(up), ya = posed(a).y, yb = posed(b).y; if (yb < ya) sU = -1; }
  const row = (k, s, l = L) => [0, 1, 2].map(j => j === k ? s / l : 0), r0 = row(ax, sA, LA), r1 = row(up, sU), r2 = row(th, 1), t = (r, cc = c) => -(r[0] * cc[0] + r[1] * cc[1] + r[2] * cc[2]), c0 = c.slice(); c0[ax] = cA;
  return new THREE.Matrix4().set(...r0, t(r0, c0), ...r1, t(r1), ...r2, t(r2), 0, 0, 0, 1);
}
// The skin record → what to draw (no allocation: one scratch answer). finish: a built-in id, 'cs2:<kit>' (guns) or
// 'cs2k:<family>' (knives); fb: the built-in stand-in for a CS2 finish (else the manifest's fbId, else none).
const R = { on: false, id: 'none', cs2: null };
function resolve(skin) {
  R.on = false; R.id = 'none'; R.cs2 = null; if (!skin) return R; const fin = skin.finish;
  if (typeof fin === 'string' && (fin.startsWith('cs2:') || fin.startsWith('cs2k:'))) { R.cs2 = fin; R.id = typeof skin.fb === 'string' && Object.hasOwn(FINISHES, skin.fb) ? skin.fb : fbOf(fin) || 'none'; }
  else if (typeof fin === 'string' && Object.hasOwn(FINISHES, fin)) R.id = fin; else if (fin != null && fin !== 'none') return R;   // (an unknown finish: drawn plain)
  R.on = R.id !== 'none' || !!R.cs2 || !!skin.stickers?.length; return R;
}
const clampSeed = s => Math.max(1, Math.min(1000, s | 0));
function bindTex(I, e) {
  if (I.tex !== e) { if (I.tex) { unwant(I.tex, I); release(I.tex); } I.tex = e; if (e) acquire(e); }
  const U = I.U; if (e && e.state === 'ready') { U.uSkPaint.value = e.paint; U.uSkMRW.value = e.mrw; } else { U.uSkPaint.value = U.uSkMRW.value = dummyTexture(); if (e) want(e, I); }
}
function setSkin(I, skin, tint) {
  const U = I.U, r = resolve(skin), mask = !!I.m.userData.skinMask; I.skin = skin; I.tint = tint;
  if (!r.on) { U.uSkinOn.value = 0; U.uSkMode.value = 0; U.uSkPearl.value = 0; U.uSkinVC.value = mask ? 0 : tint ? 1 : 2; bindTex(I, null); return; }   // (skinMask: a mask made here for a model without one — the default knives: used under a skin only; with none, the knife's own look)
  const L = lookOf(r.id), s = clampSeed(skin.seed ?? 1); U.uSkinOn.value = 1; U.uSkPat.value = L.pat; U.uSkA.value.copy(L.A); U.uSkB.value.copy(L.B); U.uSkC.value.copy(L.C); U.uSkD.value.copy(L.D);
  const still = L.pat === 1 || L.pat === 7 || L.pat === 10; U.uSkSeed.value.set(still ? 0 : (s * .12345) % 1, still ? 0 : (s * .6789) % 1, L.rot + ((s * 37) % 31 / 15 - 1) * .2618, L.scale * (.9 + ((s * 7) % 23) / 60)); U.uSkMR.value.set(L.metal, L.rough);
  const w = Math.max(0, Math.min(1, +skin.wear || 0));
  for (let i = 0; i < 5; i++) { const st = skin.stickers?.[i]; if (!st) { U.uStk.value[i].z = 0; continue; } U.uStk.value[i].set(st.x, st.y, st.scale, Math.max(0, STICKER_IDS.indexOf(st.id))); U.uStkRW.value[i].set(st.rot * Math.PI / 180, st.wear || 0); }
  let e = null; if (r.cs2 && I.uv && I.model) { e = texEntry(I.model, r.cs2, I.tier); if (!e && !skinManifest()) { pending.add(I); loadSkinManifest(); } }
  bindTex(I, e); const three = !!e && e.state === 'ready'; U.uSkMode.value = three ? 3 : r.id === 'none' ? 0 : I.fit ? 2 : 1; U.uSkPearl.value = three ? 0 : L.pearl; U.uSkinVC.value = three ? 0 : 2;
  U.uSkWear.value = three ? w : Math.min(w, L.wear);   // (a CS2 bake: the skin's own wear, clamped by the host into the kit's range; a built-in look: its own cap)
}
onSkinReady(e => { for (const I of e.waiters) if (I.tex === e) setSkin(I, I.skin, I.tint); e.waiters.clear(); });   // (pictures in, between rounds: shown from now)
onSkinManifest(() => { const list = [...pending]; pending.clear(); for (const I of list) setSkin(I, I.skin, I.tint); });
// Paint these materials with a skin (null or Default: the gun's own look). Allocation-free (numbers, Colors, Vectors).
// tint: with no skin on, the model's own vertex colours show as they are (a karambit's Ruby); false: as a mask — the
// blade's plain steel, the handle black. Under a skin always the mask: the skin on the blade, the handle black.
export function applySkin(materials, skin, tint = true) {
  if (!materials) return; for (let i = 0; i < materials.length; i++) { const m = materials[i]; if (!skinnable(m)) continue; let I = INFO.get(m); if (!I) { stats.latePrepare++; I = prepare(m); } setSkin(I, skin, tint); }
}
// The shader's pattern on the CPU (skinPattern above), for the menu's swatches: the same patterns and pictures. (u, v):
// a point on the gun's side (u along it, 0 = back, 1 = muzzle / tip); S [u, v, turn, size]: the seed's placement.
// Colours mixed in linear light as the GPU does.
const fr = v => v - Math.floor(v), smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const skH = (x, y) => fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function skN(x, y) { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const a = skH(ix, iy), b = skH(ix + 1, iy), c = skH(ix, iy + 1), d = skH(ix + 1, iy + 1); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; }
function tex(x, y, ch) { const D = patternData(), u = fr(x) * PT - .5, v = fr(y) * PT - .5, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, at = (a, b) => D[((((b % PT) + PT) % PT) * PT + (((a % PT) + PT) % PT)) * 4 + ch] / 255;
  return at(i, j) * (1 - fx) * (1 - fy) + at(i + 1, j) * fx * (1 - fy) + at(i, j + 1) * (1 - fx) * fy + at(i + 1, j + 1) * fx * fy; }
function web(x, y) { const fx = fr(x) - .5, fy = fr(y) - .5, r = Math.hypot(fx, fy), t = fr(Math.atan2(fy, fx) / 6.2832 * 11), sag = 1 - .12 * Math.sin(Math.PI * t), sp = r * Math.sin(Math.min(t, 1 - t) * 6.2832 / 11), ring = Math.abs(fr(r / sag * 8) - .5) / 8 * sag, w = .004;
  return (1 - smooth(w * .6, w * 1.6, Math.min(sp, ring))) * smooth(0, .04, r); }
const mixC = (o, A, B, t) => { o[0] = A[0] + (B[0] - A[0]) * t; o[1] = A[1] + (B[1] - A[1]) * t; o[2] = A[2] + (B[2] - A[2]) * t; return o; };
export function paintTexel(pat, u, v, A, B, C, S, o = [0, 0, 0], D = C) {
  const c = Math.cos(S[2]), s = Math.sin(S[2]), qx = (u - .5) * S[3], qy = (v - .5) * S[3], px = c * qx + s * qy + S[0], py = -s * qx + c * qy + S[1], t1 = [0, 0, 0], t2 = [0, 0, 0];   // (GLSL mat2(c, −s, s, c) is column-major)
  const ramp = t => { t = Math.min(1, Math.max(0, t)) * 3; return t < 1 ? mixC(o, A, B, t) : t < 2 ? mixC(o, B, C, t - 1) : mixC(o, C, D, t - 2); }, T = ch => tex(px * .37, py * .37, ch);
  if (pat === 1) ramp(u + (T(0) - .5) * .08);
  else if (pat === 2) { const t = fr(px * .35 + (T(0) + T(1)) * .8); ramp(t < .5 ? t * 2 : 2 - t * 2); }
  else if (pat === 3) { const vr = tex(px * .21 + .31, py * .21 + .31, 0), vg = tex(px * .21 + .31, py * .21 + .31, 1), sw = smooth(.25, .55, vr + .25 * Math.sin((px + py) * 4 + T(1) * 6)); mixC(o, C, mixC(t1, A, mixC(t2, B, D, smooth(.7, .95, vg)), smooth(.3, .8, T(1))), sw); }
  else if (pat === 4) { const va = tex(px * .19 + .53, py * .19 + .53, 3); mixC(t1, A, C, smooth(.35, .6, va)); mixC(t2, t1, D, smooth(.6, .8, T(1)) * .5); mixC(o, t2, B, smooth(.55, .75, T(0)) * .85); }
  else if (pat === 5) mixC(o, A, B, web(px * .8, py * .8));
  else if (pat === 6) mixC(o, A, B, smooth(.6, .64, T(2) * (.75 + .5 * T(1))));
  else if (pat === 7) { const b = fr(py * 1.2 + .5); mixC(o, b < .55 ? A : b < .8 ? B : C, C, fr(px * 3) >= .92 ? 1 : 0); }
  else if (pat === 8) { let hx = px * 14, hy = py * 14 * 1.1547; hx += (((Math.floor(hy) % 2) + 2) % 2) * .5; const fx = fr(hx) - .5, fy = fr(hy) - .5, e = Math.max(Math.abs(fx), Math.abs(fy) * 1.3); mixC(t1, A, B, smooth(.4, .47, e)); mixC(o, t1, C, .25 * skN(Math.floor(hx), Math.floor(hy))); }
  else if (pat === 9) { const vg = tex(px * .6 + .17, py * .6 + .17, 1), va = tex(px * .6 + .17, py * .6 + .17, 3), n = (T(0) + vg) / 2; mixC(t1, A, B, smooth(.44, .46, n)); mixC(o, t1, va < .5 ? C : D, smooth(.55, .57, n)); }
  else if (pat === 10) { const b = Math.abs(py - .15 * Math.sin(px * 2.5)), k = b < .05 ? B : b < .065 ? C : A; o[0] = k[0]; o[1] = k[1]; o[2] = k[2]; }
  else { o[0] = A[0]; o[1] = A[1]; o[2] = A[2]; }
  return o;
}
const toSRGB = l => Math.round(255 * (l <= .0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - .055));
// A finish as a small picture (the skins menu): its pattern as a gun's side wears it, at the seed's placement, made
// once per (finish, seed, size) and kept (the menu redraws without re-painting).
const swatches = new Map();
export function finishSwatch(finish, seed = 1, w = 96, h = 48) {
  if (typeof document === 'undefined') return null; const key = finish + '|' + seed + '|' + w + 'x' + h; if (swatches.has(key)) return swatches.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), f = FINISHES[finish];
  if (!f || f.pattern === 'none') { x.fillStyle = '#5a5e64'; x.fillRect(0, 0, w, h); }
  else { const L = lookOf(finish), lin = k => [k.r, k.g, k.b], A = lin(L.A), B = lin(L.B), C = lin(L.C), D = lin(L.D), s = clampSeed(seed), still = L.pat === 1 || L.pat === 7 || L.pat === 10, S = [still ? 0 : (s * .12345) % 1, still ? 0 : (s * .6789) % 1, L.rot + ((s * 37) % 31 / 15 - 1) * .2618, L.scale * (.9 + ((s * 7) % 23) / 60)], img = x.createImageData(w, h), o = [0, 0, 0];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { paintTexel(L.pat, (i + .5) / w, .5 + ((j + .5) / h - .5) * (h / w), A, B, C, S, o, D); const k = (j * w + i) * 4; img.data[k] = toSRGB(Math.min(1, o[0])); img.data[k + 1] = toSRGB(Math.min(1, o[1])); img.data[k + 2] = toSRGB(Math.min(1, o[2])); img.data[k + 3] = 255; }
    x.putImageData(img, 0, 0); }
  if (swatches.size > 400) swatches.clear(); swatches.set(key, c); return c;
}
// The same skin? (Field by field: the room's state arrives as new objects with every update, the same skin or not.)
export function sameSkin(a, b) {
  if (a === b) return true; if (!a || !b) return false; if (a.finish !== b.finish || (a.fb || '') !== (b.fb || '') || a.wear !== b.wear || a.seed !== b.seed || !!a.st !== !!b.st || (a.name || '') !== (b.name || '')) return false;
  const x = a.stickers || [], y = b.stickers || []; if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) { const s = x[i], t = y[i]; if (s.id !== t.id || s.slot !== t.slot || s.x !== t.x || s.y !== t.y || s.scale !== t.scale || s.rot !== t.rot || (s.wear || 0) !== (t.wear || 0)) return false; } return true;
}
// What a skin looks like, as one string (the material cache's key; made when a skin changes, never per frame).
export const skinHash = s => !s ? '' : [s.finish, s.fb || '', s.wear, s.seed, s.st ? 1 : 0, s.name || '', ...(s.stickers || []).map(t => [t.id, t.slot, t.x, t.y, t.scale, t.rot, t.wear || 0].join(':'))].join('|');
// Other players' guns and the ones on the ground: one painted copy per (base material, skin), shared by every mesh
// that shows it — ten agents holding the same AK Redline and that AK on the floor share one material — freed with
// its last user (refcounted). The copy's program is the base's (same patch and settings): nothing compiles.
const CACHE = new Map(), OWN = new WeakMap();
function skinMaterial(base, skin, h) {
  let by = CACHE.get(base); if (!by) CACHE.set(base, by = new Map()); let e = by.get(h);
  if (!e) { const c = base.clone(); c.userData.shared = false; stats.cloned++;   // (the copy is the players': not 'shared' — Material.clone copied the flag, and dispose code skipped it)
    const I = prepare(c, null, INFO.get(base) || prepare(base)); e = { m: c, refs: 0, base, h }; by.set(h, e); OWN.set(c, e); setSkin(I, skin, true); }
  e.refs++; return e.m;
}
function releaseMaterial(m) {
  const e = OWN.get(m); if (!e || --e.refs > 0) return; const by = CACHE.get(e.base); by?.delete(e.h); if (by && !by.size) CACHE.delete(e.base); OWN.delete(m);
  const I = INFO.get(m); if (I) { bindTex(I, null); pending.delete(I); } m.dispose(); stats.disposed++;
}
const VCV = new WeakMap(), vcBase = m => { let v = VCV.get(m); if (!v) { stats.lateVC++; v = m.clone(); v.vertexColors = true; v.userData.shared = true; prepare(v, null, INFO.get(m)); VCV.set(m, v); } return v; };
const releaseAll = mat => { if (Array.isArray(mat)) for (const m of mat) releaseMaterial(m); else releaseMaterial(mat); };
// Someone else's gun in the world (a CS2 agent's, an avatar's, a dropped one): the shared painted copies of its
// materials for this skin (array materials too: the Quaternius guns); null: back to the gun's own materials.
export function skinObject(obj, skin) {
  if (!obj) return; const on = resolve(skin).on, h = on ? skinHash(skin) : '';
  obj.traverse(o => { if (!o.isMesh) return; const own = o.userData.skinOwn, base = own ? o.userData.skinBase : o.material;
    if (!(Array.isArray(base) ? base.some(skinnable) : skinnable(base))) return;
    if (!on) { if (own) { const prev = o.material; o.material = base; o.userData.skinOwn = false; o.userData.skinBase = null; o.userData.skinHash = ''; releaseAll(prev); } return; }
    if (own && o.userData.skinHash === h) return; const prev = own ? o.material : null;
    const one = m => { if (!skinnable(m)) return m; if (!INFO.get(m)) { stats.latePrepare++; prepare(m); }
      if (m.userData.skinMask && o.geometry.attributes.color && !m.vertexColors) m = vcBase(m);   // (a mask the model was not loaded with: a new program — models load with it on, weapon-models.js / fp-view.js; counted for the tests)
      return skinMaterial(m, skin, h); };
    o.material = Array.isArray(base) ? base.map(one) : one(base); o.userData.skinBase = base; o.userData.skinOwn = true; o.userData.skinHash = h; if (prev) releaseAll(prev); });
}
// Its copies released with it (a gun put away, a player gone): the last user frees them.
export function unskinObject(obj) { obj?.traverse(o => { if (o.isMesh && o.userData.skinOwn) { const prev = o.material; o.material = o.userData.skinBase; o.userData.skinOwn = false; o.userData.skinBase = null; o.userData.skinHash = ''; releaseAll(prev); } }); }
