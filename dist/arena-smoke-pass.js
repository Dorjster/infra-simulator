// Global Defensive smoke on screen: every live smoke in ONE pass, drawn right after the scene (graphics.js) and before
// the glow. A ray from the eye through every pixel (at a reduced resolution) marches through all the clouds at once and
// adds up their densities — arena-nades.js's own density, from the same bytes (the clouds' cells in one 3D atlas, the
// billows' noise) and the same formula as the rules — so overlapping clouds are one medium (no drawing order, no
// edges between them, the same from every angle), being inside one is the same sum (thick smoke in front of you is
// opaque grey, never a dimmed copy of the world), and what the screen hides is what bots, the radar and the remote
// players' models count as hidden (e^(−k·depth), SMOKE.k / SMOKE.see). The march stops at the scene's depth (walls and
// players in front of a cloud stay in front); the full-resolution composite picks, per pixel, the reduced-resolution
// samples at its own depth and marches again itself where none is (a player's outline in front of the smoke never
// shows the smoke behind him, nor the smoke the world behind it). Effects that write no depth (fire, sparks, muzzle
// flashes, puffs: top-level objects flagged userData.fx) are drawn after it, depth-tested against the smoke's half-
// opacity surface — in front of a cloud they show, inside or behind it they don't.
// Presets lower the resolution and the number of steps, never the density: every preset hides the same.
// Nothing here runs unless a smoke is up (scene.userData.gdSmoke.active()).
import * as THREE from './three.module.js';
import { NADES, SMOKE, VOX, VOX_DMAX, HOLE_IN, HOLE_OUT, HOLE_MAX, TUNNEL, BILLOW, smokeNoise } from './arena-nades.js';

export const SLOTS = 12;   // (clouds drawn at once: more than a 5v5 throws in 18 s)
// One slot of the atlas: a fill grid (arena-nades fillSmoke: nx × ny × nz) with a border of empty cells all round.
const GX = Math.ceil(2 * NADES.smoke.radius * VOX_DMAX / VOX), GY = Math.ceil((NADES.smoke.radius * SMOKE.top + VOX) / VOX), SX = GX + 2, SY = GY + 2, SZ = GX + 2;
// Per preset: the march's resolution (1 / scale of the screen, coarser still to keep it under px pixels — a Retina screen
// at High is 2.8 Mpx: marched at a third, ~0.31 Mpx), its step (game units) and most steps per ray. Measured on an M3 Air
// at 1470×956 @2×, High (tests/browser/gd-smoke-stress.mjs): every preset hides the same, only the sharpness changes.
export const SMOKE_QUALITY = { Low: { scale: 3, px: 120e3, step: 2.4, steps: 32 }, Medium: { scale: 2, px: 200e3, step: 2, steps: 40 }, High: { scale: 2, px: 330e3, step: 1.5, steps: 48 }, Ultra: { scale: 2, px: 520e3, step: 1.2, steps: 64 } };
// The light in each cell (G of the atlas): the sun and the sky through the cloud's own density (its full shape), a march
// of cells toward each — e^(−k·depth). Once per smoke (a few thousand cells).
const SMOKE_SUN = [.42, .82, .38];   // (from above and a side, as CS2's maps' suns)
function smokeLight(v) { const { nx, ny, nz, d, dFill } = v, N = nx * ny * nz, den = new Float32Array(N), g = new Uint8Array(N);
  for (let c = 0; c < N; c++) den[c] = d[c] === Infinity ? 0 : Math.min(1, (dFill - d[c]) / (3 * VOX) + .4);
  const L = Math.hypot(...SMOKE_SUN), sx = SMOKE_SUN[0] / L, sy = SMOKE_SUN[1] / L, sz = SMOKE_SUN[2] / L, at = (i, j, k) => i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? 0 : den[(k * ny + j) * nx + i];
  for (let k = 0, c = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, c++) { if (!den[c]) continue; let ts = 0, tu = 0;
    for (let s = 1; s <= 10; s++) { ts += at(Math.round(i + sx * s), Math.round(j + sy * s), Math.round(k + sz * s)); tu += at(i, j + s, k); }
    g[c] = Math.round(255 * Math.min(1, .62 * Math.exp(-ts * .55) + .38 * Math.exp(-tu * .35))); }
  return g; }

const VS = `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// The march (both passes): arena-nades.js voxDensity, line for line, summed over the clouds whose box the ray is in.
const COMMON = `precision highp float; precision highp int; precision highp sampler3D; precision highp sampler2D;
#define SLOTS ${SLOTS}
#define TUNS ${TUNNEL.max}
uniform sampler3D uAtlas; uniform sampler3D uNoise; uniform vec3 uAtlasSize;
uniform vec4 uA[SLOTS]; uniform vec4 uB[SLOTS]; uniform vec4 uC[SLOTS]; uniform vec4 uLo[SLOTS]; uniform vec4 uHi[SLOTS]; uniform int uCount;
uniform vec4 uTunA[TUNS]; uniform vec4 uTunB[TUNS]; uniform int uTuns;
uniform float uTime; uniform float uK; uniform float uStep; uniform int uSteps; uniform float uNear; uniform vec3 uLight; uniform vec3 uDark;
uniform vec3 uCam; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform mat4 uProj; uniform sampler2D uDepth; uniform vec2 uFull; uniform float uScale;
const float VOX = ${VOX.toFixed(4)}, HOLE_IN = ${HOLE_IN.toFixed(4)}, HOLE_OUT = ${HOLE_OUT.toFixed(4)}, HOLE_MAX = ${HOLE_MAX.toFixed(6)};
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }   // (each pixel starts a little along its ray: no banding)
vec3 viewAt(vec2 uv, float d) { vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
vec3 billowQ(vec3 p) { return p * ${BILLOW.scale} + vec3(0.0, -uTime * ${BILLOW.rise}, uTime * ${BILLOW.turn}); }
// From the eye along rd (world) over [uNear, tMax]: (colour, premultiplied; transmittance). th: where less than half the
// light was left; ent: where the smoke began (T < 0.99). The steps fall where the clouds' boxes put them, whatever the
// scene's depth (a player in the smoke and the wall behind him get the same smoke up to him: no outline from the steps).
vec4 smokeMarch(vec3 rd, float tMax, float jit, out float th, out float ent) {
  th = 1e5; ent = 1e5; float a0[SLOTS]; float a1[SLOTS]; int ids[SLOTS]; int m = 0; float len = 0.0, lo = 1e9, hi = 0.0; vec3 inv = 1.0 / (rd + vec3(equal(rd, vec3(0.0))) * 1e-6);
  for (int i = 0; i < SLOTS; i++) { if (i >= uCount) break; vec3 t0 = (uLo[i].xyz - uCam) * inv, t1 = (uHi[i].xyz - uCam) * inv, tn = min(t0, t1), tf = max(t0, t1);
    float e = max(max(tn.x, tn.y), max(tn.z, uNear)), x = min(min(tf.x, tf.y), tf.z); if (e < x && e < tMax) { ids[m] = i; a0[m] = e; a1[m] = x; m++; len += x - e; lo = min(lo, e); hi = max(hi, x); } }
  if (m == 0) return vec4(0.0, 0.0, 0.0, 1.0);
  float dt = max(uStep, len / float(uSteps)), t = lo + dt * jit, T = 1.0, end = min(hi, tMax); vec3 col = vec3(0.0);
  for (int s = 0; s < 1024; s++) { if (s >= uSteps * 2 || t > end || T < 0.004) break;
    vec3 p = uCam + rd * t, q = billowQ(p); float dsum = 0.0, gsum = 0.0, nxt = 1e9, n = 0.5, n0 = 0.5; bool inAny = false, haveN = false;
    for (int k = 0; k < SLOTS; k++) { if (k >= m) break; if (t < a0[k]) { nxt = min(nxt, a0[k]); continue; } if (t > a1[k]) continue; inAny = true; int i = ids[k];
      vec4 v = texture(uAtlas, (vec3((p - uA[i].xyz) / VOX) + vec3(0.0, 0.0, uA[i].w)) / uAtlasSize); if (v.r > 0.99) continue;
      float dq = v.r * uB[i].y, grow = clamp((uB[i].x - dq) / (2.0 * VOX), 0.0, 1.0); if (grow <= 0.003) continue;
      float f = clamp((uB[i].z - dq) / uB[i].z, 0.0, 1.0), dens;
      if (f >= 0.595 && uC[i].x <= 0.0 && uC[i].y <= 0.0) dens = grow;   // (deep inside: solid whatever the billows)
      else { if (!haveN) { haveN = true; n0 = texture(uNoise, q).r; n = n0 * 0.72 + texture(uNoise, q * 2.3 + 0.31).r * 0.28; } dens = grow * smoothstep(0.14, 0.22, f + (n - 0.5) * 0.75); }
      if (uC[i].x > 0.0) { float hd = v.b * HOLE_MAX + (n - 0.5) * 2.0 * VOX, l = uC[i].x * HOLE_IN, h = uC[i].x * HOLE_OUT; dens *= clamp((hd - l) / (h - l), 0.0, 1.0); }
      if (uC[i].y > 0.0) { float hd = v.a * HOLE_MAX + (n - 0.5) * 2.0 * VOX, l = uC[i].y * HOLE_IN, h = uC[i].y * HOLE_OUT; dens *= clamp((hd - l) / (h - l), 0.0, 1.0); }
      dens *= uB[i].w; dsum += dens; gsum += dens * v.g; }
    if (!inAny) { if (nxt > end) break; t = nxt + dt * jit; continue; }   // (between clouds: on to the next one's box)
    if (dsum > 0.0 && uTuns > 0) { float tf = 1.0; for (int b = 0; b < TUNS; b++) { if (b >= uTuns) break; vec3 A = uTunA[b].xyz, ab = uTunB[b].xyz - A; float u = clamp(dot(p - A, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0); vec3 dd = p - A - ab * u; float k2 = dot(dd, dd) / (uTunB[b].w * uTunB[b].w); if (k2 < 1.0) tf *= 1.0 - uTunA[b].w * (1.0 - k2); } dsum *= tf; gsum *= tf; }   // bullet tunnels
    if (dsum > 0.002) {
      // light: the cells' sun and sky (G), each lump shaded on its own (denser toward the light: darker here) — lit tops,
      // dark undersides, as CS2's — where the billows are (the edge, a hole's rim); deep in the core, where the light
      // a few steps in no longer shows, the cells' light alone (no texture read: the cost is the edge's, not the volume's)
      float l = gsum / dsum * 0.8175; if (haveN) { float lump = clamp(0.55 + (n0 - texture(uNoise, q + vec3(0.016, 0.04, 0.013)).r) * 4.0, 0.0, 1.0); l = gsum / dsum * (0.35 + 0.85 * lump) * (0.7 + 0.6 * n); } l = clamp(l, 0.0, 1.0);
      float a = 1.0 - exp(-uK * dsum * dt); col += T * a * mix(uDark, uLight, l); T *= 1.0 - a; if (T < 0.99 && ent > 1e4) ent = t; if (T < 0.5 && th > 1e4) th = t; }
    t += dt; }
  return vec4(col, T); }
`;
// Reduced resolution: each pixel marches to the farthest scene depth of the screen pixels it covers (aux: that view depth, th).
const MARCH_FS = COMMON + `layout(location = 0) out highp vec4 oColor; layout(location = 1) out highp vec4 oAux;
void main() { int S = int(uScale); ivec2 base = ivec2(floor(gl_FragCoord.xy)) * S, mx = ivec2(uFull) - 1; float d = 0.0;
  for (int a = 0; a < 4; a++) for (int b = 0; b < 4; b++) { if (a < S && b < S) d = max(d, texelFetch(uDepth, min(base + ivec2(a, b), mx), 0).r); }
  vec3 vp = viewAt(gl_FragCoord.xy * uScale / uFull, d); float th, ent; vec4 r = smokeMarch(mat3(uCamWorld) * normalize(vp), length(vp), ign(gl_FragCoord.xy), th, ent);
  oColor = r; oAux = vec4(-vp.z, th, ent, 1.0); }`;
// Full resolution: the scene × transmittance + the smoke, from the samples at this pixel's depth (or its own march), and
// the depth of the smoke's half-opacity surface for the effects drawn after.
const COMPOSITE_FS = COMMON + `uniform sampler2D uScene; uniform sampler2D uM0; uniform sampler2D uM1; uniform vec2 uHalf; uniform float uEnc; layout(location = 0) out highp vec4 oColor;
void main() { ivec2 pf = ivec2(floor(gl_FragCoord.xy)); float d = texelFetch(uDepth, pf, 0).r; vec3 vp = viewAt(gl_FragCoord.xy / uFull, d); float zp = -vp.z;
  vec2 hp = gl_FragCoord.xy / uScale - 0.5; ivec2 h0 = ivec2(floor(hp)), hm = ivec2(uHalf) - 1; vec2 fr = hp - vec2(h0); vec4 acc = vec4(0.0); float ws = 0.0, best = 1e9, th = 1e5, minT = 1.0, minE = 1e9, L = length(vp); vec3 na = vec3(1e9, 1e5, 1e5); vec4 ns = vec4(0.0, 0.0, 0.0, 1.0);
  for (int k = 0; k < 4; k++) { ivec2 o = ivec2(k & 1, k >> 1), q = clamp(h0 + o, ivec2(0), hm); vec4 s = texelFetch(uM0, q, 0); vec3 a = texelFetch(uM1, q, 0).xyz;
    float bil = (o.x == 1 ? fr.x : 1.0 - fr.x) * (o.y == 1 ? fr.y : 1.0 - fr.y), rel = abs(a.x - zp) / max(zp, 0.5), w = (bil + 0.001) / (rel * 40.0 + 0.02);
    acc += s * w; ws += w; minT = min(minT, s.a); minE = min(minE, a.z); if (rel < best) { best = rel; th = a.y; } if (a.x < na.x) { na = a; ns = s; } }
  vec4 sm = acc / ws;
  // No sample at this depth (an outline): nearer than where any of them met smoke — none in front of it; nearer than all
  // of them (a player's edge before the wall they hit) — the nearest one's smoke up to here (e^(−k·∫): its share of the
  // way from where it met the smoke); else (rare: farther than all) its own ray.
  if (best > 0.06 && minT < 0.995) { if (L < minE * 0.97) { sm = vec4(0.0, 0.0, 0.0, 1.0); th = 1e5; }
    else if (zp < na.x) { float Ls = na.x * L / max(zp, 1e-3), u = clamp((L - na.z) / max(Ls - na.z, 1e-3), 0.0, 1.0), Tl = pow(max(ns.a, 1e-6), u); sm = vec4(ns.rgb * (1.0 - Tl) / max(1.0 - ns.a, 1e-4), Tl); th = na.y < L ? na.y : 1e5; }
    else { float e2; sm = smokeMarch(mat3(uCamWorld) * normalize(vp), L, ign(gl_FragCoord.xy), th, e2); } }
  vec4 sc = texelFetch(uScene, pf, 0); vec3 o = sc.rgb;
  if (sm.a < 0.9999) { vec3 c = sm.rgb / max(1.0 - sm.a, 1e-4);
    #ifdef TONE_MAPPING
    c = toneMapping(c);
    #endif
    // Blended in linear light on every preset (SMK-COLORSPACE): into the HDR buffer the scene is linear already; onto the
    // screen (uEnc) the scene was written sRGB-encoded — decoded, blended, encoded again (blending the encoded values
    // would draw a thin edge darker on Low / Medium than on High).
    if (uEnc > 0.5) o = linearToOutputTexel(vec4(sRGBTransferEOTF(vec4(sc.rgb, 1.0)).rgb * sm.a + c * (1.0 - sm.a), 1.0)).rgb; else o = sc.rgb * sm.a + c * (1.0 - sm.a); }
  oColor = vec4(o, sc.a);
  if (th < L) { vec4 cp = uProj * vec4(normalize(vp) * th, 1.0); gl_FragDepth = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 1.0); } else gl_FragDepth = d; }`;

export function createSmokePass({ renderer, scene, camera, quality = () => 'Medium' }) {
  const atlas = new THREE.Data3DTexture(new Uint8Array(SX * SY * SZ * SLOTS * 4), SX, SY, SZ * SLOTS); atlas.format = THREE.RGBAFormat; atlas.type = THREE.UnsignedByteType; atlas.minFilter = atlas.magFilter = THREE.LinearFilter; atlas.wrapS = atlas.wrapT = atlas.wrapR = THREE.ClampToEdgeWrapping; atlas.unpackAlignment = 1; atlas.generateMipmaps = false;
  { const a = atlas.image.data; for (let i = 0; i < a.length; i += 4) { a[i] = 255; a[i + 1] = 0; a[i + 2] = 255; a[i + 3] = 255; } atlas.needsUpdate = true; }   // (every cell empty)
  const noise = new THREE.Data3DTexture(smokeNoise(), 32, 32, 32); noise.format = THREE.RedFormat; noise.type = THREE.UnsignedByteType; noise.minFilter = noise.magFilter = THREE.LinearFilter; noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping; noise.unpackAlignment = 1; noise.generateMipmaps = false; noise.needsUpdate = true;
  const v4 = () => Array.from({ length: SLOTS }, () => new THREE.Vector4()), TA = Array.from({ length: TUNNEL.max }, () => new THREE.Vector4()), TB = Array.from({ length: TUNNEL.max }, () => new THREE.Vector4());
  const U = { uAtlas: { value: atlas }, uNoise: { value: noise }, uAtlasSize: { value: new THREE.Vector3(SX, SY, SZ * SLOTS) }, uA: { value: v4() }, uB: { value: v4() }, uC: { value: v4() }, uLo: { value: v4() }, uHi: { value: v4() }, uCount: { value: 0 },
    uTunA: { value: TA }, uTunB: { value: TB }, uTuns: { value: 0 }, uTime: { value: 0 }, uK: { value: SMOKE.k }, uStep: { value: 1.5 }, uSteps: { value: 56 }, uNear: { value: SMOKE.near }, uLight: { value: new THREE.Color(.56, .57, .59) }, uDark: { value: new THREE.Color(.05, .052, .058) },
    uCam: { value: new THREE.Vector3() }, uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld }, uProj: { value: camera.projectionMatrix }, uDepth: { value: null }, uFull: { value: new THREE.Vector2(1, 1) }, uScale: { value: 2 },
    uScene: { value: null }, uM0: { value: null }, uM1: { value: null }, uHalf: { value: new THREE.Vector2(1, 1) }, uEnc: { value: 0 } };
  // (uNear: the march starts 1.2 units out — your own gun and hands are never in the smoke)
  const mat = fs => new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: true });
  const marchMat = mat(MARCH_FS), compMat = mat(COMPOSITE_FS); compMat.depthTest = true; compMat.depthWrite = true; compMat.depthFunc = THREE.AlwaysDepth;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), marchMat), qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false; qs.add(quad);
  // Is any cloud drawn this frame in view? Its box (2 units wider) against the camera's frustum as it is now (the frame
  // about to be drawn: a quick turn never leaves a frame without a cloud that is there).
  const FR = new THREE.Frustum(), FM = new THREE.Matrix4(), BX = new THREE.Box3();
  function inView() { camera.updateMatrixWorld(); FM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); FR.setFromProjectionMatrix(FM);
    for (let i = 0; i < count; i++) { const lo = U.uLo.value[i], hi = U.uHi.value[i]; BX.min.set(lo.x - 2, lo.y - 2, lo.z - 2); BX.max.set(hi.x + 2, hi.y + 2, hi.z + 2); if (FR.intersectsBox(BX)) return true; } return false; }
  let M = null, S = null, used = 0, count = 0, wired = null, frameAt = -1e9; const slots = new Array(SLOTS).fill(null), size = new THREE.Vector2(), FXK = [], HID = [];
  const aa = (() => { try { return !!renderer.getContext().getContextAttributes()?.antialias; } catch { return false; } })();
  const depthTex = (w, h) => { const t = new THREE.DepthTexture(w, h); t.type = THREE.UnsignedIntType; return t; };
  const ensureM = (mw, mh) => { if (!M) M = new THREE.WebGLRenderTarget(mw, mh, { count: 2, type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }); else if (M.width !== mw || M.height !== mh) M.setSize(mw, mh); return M; };
  // Without post-processing: the scene's own buffer, as the screen (three.js: an XR target is drawn as the screen is — the
  // same programs as the screen, no recompile; RGBA8: the values as the screen holds them, blended as there).
  const ensureS = (w, h) => { if (S && S.width === w && S.height === h) return S; S?.dispose(); S = new THREE.WebGLRenderTarget(w, h, { samples: aa ? 4 : 0, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthTexture: depthTex(w, h), generateMipmaps: false }); S.isXRRenderTarget = true; S.texture.internalFormat = 'RGBA8'; renderer.initRenderTarget?.(S); return S; };
  // The march's resolution for a w × h buffer (SMOKE_QUALITY: its scale, kept under its pixel budget).
  const marchScale = (w, h) => { const q = SMOKE_QUALITY[quality()] || SMOKE_QUALITY.Medium; return Math.min(4, Math.max(q.scale, Math.ceil(Math.sqrt(w * h / (q.px || 3e5)) - .05))); };
  const compile = () => renderer.compileAsync ? renderer.compileAsync(qs, qc).catch(() => {}) : Promise.resolve(renderer.compile(qs, qc));
  function march(w, h) { const q = SMOKE_QUALITY[quality()] || SMOKE_QUALITY.Medium, s = marchScale(w, h), mw = Math.max(1, Math.ceil(w / s)), mh = Math.max(1, Math.ceil(h / s)); ensureM(mw, mh);
    U.uScale.value = s; U.uStep.value = q.step; U.uSteps.value = q.steps; U.uFull.value.set(w, h); U.uHalf.value.set(mw, mh); U.uCam.value.setFromMatrixPosition(camera.matrixWorld);
    quad.material = marchMat; renderer.setRenderTarget(M); renderer.render(qs, qc); U.uM0.value = M.textures[0]; U.uM1.value = M.textures[1]; }
  // The effects that write no depth, after the smoke: only the top-level objects flagged userData.fx (and the lights, so
  // their shaders are the ones the scene drew them with), the sky and the shadow map left alone.
  // Only those begin() held back (drawn this frame: an idle pool sprite stays hidden), lit by every light the scene's draw
  // counted — nested ones too (the camera's own flashlight: a light's count is part of a shader, one missing builds every
  // effect's shader again at the first smoke), each where the scene's draw put it (no matrix updated here).
  const NESTED = []; let fxN = 0; const nestedLight = o => { if (o.isLight && o.parent !== scene) NESTED.push(o); };
  const showing = o => { if (!o.visible) return false; if (o.isMesh || o.isSprite || o.isLine || o.isPoints) return o.count !== 0; const c = o.children; for (let i = 0; i < c.length; i++) if (showing(c[i])) return true; return false; };
  const drawn = (o, all) => { let q = o; for (; q.parent && q.parent !== scene; q = q.parent) if (!q.visible) return false; return q.visible && all.includes(q); };
  function fx(target) { const all = scene.children; if (!HID.length) return; FXK.length = 0; if (fxN++ % 600 === 0) { NESTED.length = 0; scene.traverse(nestedLight); }   // (the nested lights looked for now and then: a whole map's walk)
    for (let i = 0; i < all.length; i++) if (all[i].isLight) FXK.push(all[i]); for (let i = 0; i < NESTED.length; i++) if (drawn(NESTED[i], all)) FXK.push(NESTED[i]); for (let i = 0; i < HID.length; i++) { HID[i].visible = true; FXK.push(HID[i]); }
    const bg = scene.background, ac = renderer.autoClear, su = renderer.shadowMap.autoUpdate, mu = scene.matrixWorldAutoUpdate; scene.background = null; renderer.autoClear = false; renderer.shadowMap.autoUpdate = false; scene.matrixWorldAutoUpdate = false; scene.children = FXK;
    try { renderer.setRenderTarget(target); renderer.render(scene, camera); } finally { scene.children = all; scene.background = bg; renderer.autoClear = ac; renderer.shadowMap.autoUpdate = su; scene.matrixWorldAutoUpdate = mu; } }
  const api = {
    get used() { return used; },
    active: () => count > 0 && performance.now() - frameAt < 1500 && inView(),   // (clouds pushed lately — a view that stopped updating altogether (the start screen) draws none, a long hitch never drops them — and one in view: clouds behind you cost nothing)
    // The scene's draw without the effects (they come after the smoke); the post-processing's buffers given depth textures.
    // The post-processing's buffers given depth textures (graphics.js calls this every frame of a match — from its warm-up
    // on, so the buffers are made at the loading screen, never at the first smoke: armed).
    armed: false,
    wire(composer) { if (!composer || wired === composer) return; for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (!rt.depthTexture) rt.depthTexture = depthTex(rt.width, rt.height); wired = composer; },
    begin(composer) { api.wire(composer);
      HID.length = 0; for (const o of scene.children) if (o.userData.fx && showing(o)) { o.visible = false; HID.push(o); } },   // (only those with something to draw: no effect up, no second pass)
    end() { for (const o of HID) o.visible = true; HID.length = 0; },
    // graphics.js's pass (after the scene's render into readBuffer): march, composite into writeBuffer, effects.
    composite(r, writeBuffer, readBuffer) { if (!readBuffer.depthTexture) return; U.uEnc.value = 0; U.uDepth.value = readBuffer.depthTexture; U.uScene.value = readBuffer.texture; march(readBuffer.width, readBuffer.height);
      quad.material = compMat; const ac = r.autoClear; r.autoClear = true; try { r.setRenderTarget(writeBuffer); r.render(qs, qc); } finally { r.autoClear = ac; } fx(writeBuffer); api.end(); },   // (cleared, not loaded: every pixel is written — a tiled GPU (Apple's) then never reads the old buffer back)
    // Without post-processing (Low / Medium): the scene into a buffer that takes it as the screen would (sRGB, tone-mapped:
    // the same shaders), then the composite onto the screen, then the effects.
    renderDirect() { renderer.getDrawingBufferSize(size); const w = size.x, h = size.y; ensureS(w, h);
      api.begin(null); try { renderer.setRenderTarget(S); renderer.render(scene, camera); U.uEnc.value = 1; U.uDepth.value = S.depthTexture; U.uScene.value = S.texture; march(w, h); quad.material = compMat; renderer.setRenderTarget(null); renderer.render(qs, qc); fx(null); } finally { api.end(); renderer.setRenderTarget(null); } },
    // ── slots (arena-nades-view.js) ──
    // A smoke's cells into a free slot of the atlas (R: its spread bytes; G: its light; B, A: holes, none yet): the slot, or −1.
    add(v) { if (v.nx > GX || v.ny > GY || v.nz > GX || !v.box) return -1; const k = slots.indexOf(null); if (k < 0) return -1; slots[k] = v; used++;
      const a = atlas.image.data, g = smokeLight(v), { nx, ny, nz } = v, zb = k * SZ; for (let z = 0; z < SZ; z++) for (let y = 0; y < SY; y++) for (let x = 0, o = (((zb + z) * SY + y) * SX) * 4; x < SX; x++, o += 4) { a[o] = 255; a[o + 1] = 0; a[o + 2] = 255; a[o + 3] = 255; }
      for (let z = 0, c = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, c++) { const o = (((zb + z + 1) * SY + y + 1) * SX + x + 1) * 4; a[o] = v.r8[c]; a[o + 1] = g[c]; }
      atlas.needsUpdate = true; return k; },
    // A hole's bytes (arena-nades smokeHoleBytes) into channel B (k = 0) or A (1) of a slot.
    hole(slot, k, b) { const v = slots[slot]; if (!v) return; const a = atlas.image.data, { nx, ny, nz } = v, zb = slot * SZ; for (let z = 0, c = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, c++) a[(((zb + z + 1) * SY + y + 1) * SX + x + 1) * 4 + 2 + k] = b ? b[c] : 255; atlas.needsUpdate = true; },
    remove(slot) { if (slot >= 0 && slots[slot]) { slots[slot] = null; used--; } },
    // Each frame: the clouds drawn (push one per live smoke: its slot, front, fade, holes' radii now), the tunnels, the clock.
    frame(time, cuts, n) { count = 0; U.uCount.value = 0; frameAt = performance.now(); U.uTime.value = time; let t = 0; for (let i = 0; i < n && t < TUNNEL.max; i++, t++) { const o = i * 7; TA[t].set(cuts[o], cuts[o + 1], cuts[o + 2], cuts[o + 6]); TB[t].set(cuts[o + 3], cuts[o + 4], cuts[o + 5], TUNNEL.radius); } U.uTuns.value = t; },
    push(slot, front, fade, r0, r1) { const v = slots[slot]; if (!v || count >= SLOTS || fade <= 0) return; const i = count++, B = v.box; U.uA.value[i].set(v.x0 - VOX, v.y0 - VOX, v.z0 - VOX, slot * SZ); U.uB.value[i].set(front, v.scaleD, v.dFill, fade); U.uC.value[i].set(r0, r1, 0, 0); U.uLo.value[i].set(B[0], B[1], B[2], 0); U.uHi.value[i].set(B[3], B[4], B[5], 0); U.uCount.value = count; },
    // Leaving the match: every slot free, the buffers let go of, the post-processing's buffers back as they were (no
    // depth textures: the hall draws exactly as it did before any smoke).
    clear() { slots.fill(null); used = 0; count = 0; U.uCount.value = 0; api.armed = false; api.end(); M?.dispose(); M = null; S?.dispose(); S = null; U.uDepth.value = U.uScene.value = U.uM0.value = U.uM1.value = null;
      if (wired) { for (const rt of [wired.renderTarget1, wired.renderTarget2]) if (rt?.depthTexture) { const d = rt.depthTexture; rt.depthTexture = null; d.dispose(); } wired = null; } },
    // Shaders built and textures sent now (the loading screen), for where they will draw: the HDR buffer or the screen.
    // Its buffers made now too, at this screen's size (the march's; without post-processing the scene's own; with it,
    // graphics.js wires the depth textures from the next frame on: armed) — the first smoke allocates nothing.
    warm(post) { const was = renderer.getRenderTarget(), jobs = []; let T8 = null; api.armed = true; try { renderer.getDrawingBufferSize(size); const ms = marchScale(size.x, size.y); quad.material = marchMat; renderer.setRenderTarget(ensureM(Math.max(1, Math.ceil(size.x / ms)), Math.max(1, Math.ceil(size.y / ms)))); jobs.push(compile()); if (!post) ensureS(size.x, size.y);
        quad.material = compMat; T8 = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType }); renderer.setRenderTarget(T8); jobs.push(compile()); renderer.setRenderTarget(null); jobs.push(compile());   /* (the composite for both targets: a preset changed mid-match between post-processing and none — High ↔ Medium — switches its program (tone mapping, output colour space), never a first-use build at the next smoke) */ renderer.initTexture(atlas); renderer.initTexture(noise); }
      catch (e) { console.warn('smoke warm-up:', e.message); } finally { renderer.setRenderTarget(was); } return Promise.all(jobs).finally(() => T8?.dispose()); },
    get marchTarget() { return M; },   // (tests: the reduced-resolution march's colour / transmittance and depths)
    get atlasTexture() { return atlas; },   // (tests: the slots' bytes)
    stats: () => ({ clouds: count, slots: used, march: M ? [M.width, M.height] : null, scale: U.uScale.value, steps: U.uSteps.value }),
  };
  return api;
}
