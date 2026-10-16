// Drawing a weapon skin (skins.js) on a gun's own materials: the finish painted over the gun in its texture's space
// (the gun's own shading and detail kept under the paint), moved and turned by the pattern seed, scratched through to
// the metal as the wear rises (edges and worn spots first), and up to five stickers — each where it was placed, its
// size and turn, worn with it. One shader for every skinned material (no recompiling on a change: only uniforms).
import * as THREE from './three.module.js';
import { FINISHES, PATTERNS, STICKERS, STICKER_IDS, patternOf } from './skins.js';

let atlas = null;   // stickers: one row of 128-px cells, each a glyph on its badge (drawn once, on first use)
function stickerAtlas() {
  if (atlas || typeof document === 'undefined') return atlas; const n = 16, c = document.createElement('canvas'); c.width = 128 * n; c.height = 128; const x = c.getContext('2d');
  STICKER_IDS.forEach((id, i) => { const s = STICKERS[id], cx = i * 128 + 64; x.save(); x.beginPath(); x.arc(cx, 64, 56, 0, Math.PI * 2); x.fillStyle = s.bg; x.fill(); x.lineWidth = 6; x.strokeStyle = s.foil ? '#f8e9a0' : 'rgba(255,255,255,.85)'; x.stroke();
    x.fillStyle = s.fg; x.font = `900 ${s.glyph.length > 1 && !/\p{Extended_Pictographic}/u.test(s.glyph) ? 50 : 66}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s.glyph, cx, 68); x.restore(); });
  atlas = new THREE.CanvasTexture(c); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4; return atlas;
}
const GLSL = `
uniform float uSkinOn; uniform int uSkinPat; uniform vec3 uSkA; uniform vec3 uSkB; uniform vec3 uSkC; uniform float uSkWear; uniform vec4 uSkSeed;
uniform vec4 uStk[5]; uniform vec2 uStkRW[5]; uniform sampler2D uStkAtlas;
float skH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(skH(i), skH(i + vec2(1.0, 0.0)), f.x), mix(skH(i + vec2(0.0, 1.0)), skH(i + vec2(1.0, 1.0)), f.x), f.y); }
float skF(vec2 p) { float a = 0.0, w = 0.5; for (int i = 0; i < 5; i++) { a += w * skN(p); p = p * 2.03 + 17.1; w *= 0.5; } return a; }
vec3 skinPaint(vec2 uv, float lum) {
  float c = cos(uSkSeed.z), s = sin(uSkSeed.z); vec2 p = mat2(c, -s, s, c) * ((uv - 0.5) * uSkSeed.w) + 0.5 + uSkSeed.xy; vec3 col = uSkA;
  if (uSkinPat == 1) { float t = fract(p.x * 0.5 + p.y * 0.25); col = t < 0.5 ? mix(uSkA, uSkB, t * 2.0) : mix(uSkB, uSkC, t * 2.0 - 1.0); }
  else if (uSkinPat == 2) { float t = fract(p.x * 0.6 + skF(p * 3.0) * 0.6); col = t < 0.5 ? mix(uSkA, uSkB, t * 2.0) : mix(uSkB, uSkC, t * 2.0 - 1.0); }
  else if (uSkinPat == 3) { float n = skF(p * 4.0), sw = sin((p.x + p.y) * 9.0 + n * 7.0); col = mix(uSkC, mix(uSkA, uSkB, smoothstep(0.2, 0.9, n)), 0.55 + 0.45 * sw); }
  else if (uSkinPat == 4) { float n = skF(p * 5.0); col = n < 0.45 ? mix(uSkA, uSkC, smoothstep(0.3, 0.45, n)) : mix(uSkC, uSkB, smoothstep(0.5, 0.7, n)); }
  else if (uSkinPat == 5) { vec2 q = (p - 0.5) * 6.0; float r = length(q), a = atan(q.y, q.x), w = min(abs(fract(r * 1.2) - 0.5), abs(fract(a * 12.0 / 6.2832) - 0.5) * r * 0.4); col = mix(uSkB, uSkA, smoothstep(0.0, 0.06, w)); }
  else if (uSkinPat == 6) { float st = sin(p.x * 28.0 + skF(p * 6.0) * 9.0); col = mix(uSkA, uSkB, smoothstep(0.55, 0.75, st)); }
  else if (uSkinPat == 7) { float b = fract(p.y * 3.0); col = b < 0.55 ? uSkA : b < 0.8 ? uSkB : uSkC; col = mix(col, uSkC, step(0.92, fract(p.x * 7.0))); }
  else if (uSkinPat == 8) { vec2 h = p * 14.0; h.y *= 1.1547; h.x += mod(floor(h.y), 2.0) * 0.5; vec2 f = fract(h) - 0.5; float e = max(abs(f.x), abs(f.y) * 1.3); col = mix(uSkA, uSkB, smoothstep(0.40, 0.47, e)); col = mix(col, uSkC, 0.25 * skN(floor(h))); }
  else if (uSkinPat == 9) { float n = skF(p * 5.0); col = n < 0.42 ? uSkA : n < 0.55 ? uSkB : uSkC; }
  else if (uSkinPat == 10) { float b = abs(p.y - 0.5 - 0.15 * sin(p.x * 4.0)); col = b < 0.06 ? uSkB : b < 0.075 ? uSkC : uSkA; }
  return col * (0.45 + 0.9 * lum);
}`;
const BODY = `#include <map_fragment>
#ifdef USE_MAP
if (uSkinOn > 0.5) { vec2 suv = vMapUv; float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 paint = uSkinPat > 0 ? skinPaint(suv, lum) : diffuseColor.rgb;
  float sc = skF(suv * 40.0 + uSkSeed.xy * 13.0) * 0.6 + skF(suv * 7.0) * 0.4, worn = uSkWear > 0.001 && uSkinPat > 0 ? smoothstep(1.05 - uSkWear * 1.1, 1.13 - uSkWear * 1.1, sc) : 0.0;
  vec3 col = mix(paint, vec3(0.62, 0.62, 0.6) * (0.5 + 0.7 * lum), worn); col *= 1.0 - uSkWear * 0.22 * skF(suv * 3.0); diffuseColor.rgb = col;
  for (int i = 0; i < 5; i++) { if (uStk[i].z <= 0.0) continue; vec2 q = suv - uStk[i].xy; float cr = cos(uStkRW[i].x), sr = sin(uStkRW[i].x); q = mat2(cr, -sr, sr, cr) * q / (uStk[i].z * 0.12) + 0.5;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) continue; vec4 st = texture2D(uStkAtlas, vec2((q.x + uStk[i].w) / 16.0, q.y)); float keep = skF(q * 9.0 + float(i)) > uStkRW[i].y * 1.1 ? 1.0 : 0.0; diffuseColor.rgb = mix(diffuseColor.rgb, st.rgb, st.a * keep); } }
#endif`;
// Make a material skinnable once (its uniforms in userData.skinU); off until a skin is set.
function prepare(m) {
  if (m.userData.skinU) return m.userData.skinU;
  const U = { uSkinOn: { value: 0 }, uSkinPat: { value: 0 }, uSkA: { value: new THREE.Color() }, uSkB: { value: new THREE.Color() }, uSkC: { value: new THREE.Color() }, uSkWear: { value: 0 }, uSkSeed: { value: new THREE.Vector4(0, 0, 0, 1) },
    uStk: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) }, uStkRW: { value: Array.from({ length: 5 }, () => new THREE.Vector2()) }, uStkAtlas: { value: stickerAtlas() } };
  const before = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { before?.call(m, sh, r); Object.assign(sh.uniforms, U); sh.fragmentShader = sh.fragmentShader.replace('void main() {', GLSL + '\nvoid main() {').replace('#include <map_fragment>', BODY); };
  const key = m.customProgramCacheKey?.bind(m); m.customProgramCacheKey = () => (key ? key() : '') + '|skin1'; m.needsUpdate = true; m.userData.skinU = U; return U;
}
// Made skinnable when a set loads (its shader built then, on a loading screen — never compiled in play on a change).
export function prepareSkins(materials) { for (const m of materials || []) if (m?.map) prepare(m); }
// Paint these materials with a skin (null or Default: the gun's own look).
export function applySkin(materials, skin) {
  for (const m of materials || []) { if (!m?.map) continue; const U = prepare(m), f = skin && FINISHES[skin.finish];
    const on = !!(f && (skin.finish !== 'none' || skin.stickers?.length)); U.uSkinOn.value = on ? 1 : 0; if (!on) continue;
    U.uSkinPat.value = Math.max(0, PATTERNS.indexOf(f.pattern)); const [a, b, c] = f.colors; U.uSkA.value.set(a || '#888'); U.uSkB.value.set(b || a || '#888'); U.uSkC.value.set(c || b || a || '#888');
    U.uSkWear.value = +skin.wear || 0; const p = patternOf(skin.seed); U.uSkSeed.value.set(p.u, p.v, p.rot, p.scale);
    for (let i = 0; i < 5; i++) { const s = skin.stickers?.[i]; if (!s) { U.uStk.value[i].z = 0; continue; } U.uStk.value[i].set(s.x, s.y, s.scale, Math.max(0, STICKER_IDS.indexOf(s.id))); U.uStkRW.value[i].set(s.rot * Math.PI / 180, s.wear || 0); } }
}
// A finish as a small picture (the skins menu): its pattern in 2D, roughly as the shader paints it.
export function finishSwatch(finish, seed = 1, w = 96, h = 48) {
  if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), f = FINISHES[finish];
  if (!f || f.pattern === 'none') { x.fillStyle = '#5a5e64'; x.fillRect(0, 0, w, h); return c; }
  const p = patternOf(seed), g = x.createLinearGradient(0, 0, w, h); const [a, b, cc] = f.colors; g.addColorStop(0, a); g.addColorStop(.5, b || a); g.addColorStop(1, cc || b || a); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalAlpha = .35; for (let i = 0; i < 18; i++) { x.fillStyle = [a, b, cc][i % 3] || a; x.beginPath(); x.arc(((p.u * w + i * 37) % w), ((p.v * h + i * 23) % h), 4 + (i * 7) % 11, 0, Math.PI * 2); x.fill(); } x.globalAlpha = 1; return c;
}
// Someone else's gun in the world (a CS2 agent's): its own copies of the gun's materials (made once, when it first wears
// a skin — the shared ones stay as they are), painted with the skin; null: back to the gun's own look.
export function skinObject(obj, skin) {
  if (!obj) return; const on = !!(skin && (skin.finish !== 'none' || skin.stickers?.length));
  obj.traverse(o => { if (!o.isMesh || !o.material?.map) return;
    if (!o.userData.skinOwn) { if (!on) return; o.userData.skinBase = o.material; o.material = o.material.clone(); o.userData.skinOwn = true; }
    applySkin([o.material], on ? skin : null); });
}
// Its copies gone with it (a gun put away): the GPU's share freed.
export function unskinObject(obj) { obj?.traverse(o => { if (o.isMesh && o.userData.skinOwn) { o.material.dispose(); o.material = o.userData.skinBase; o.userData.skinOwn = false; } }); }
