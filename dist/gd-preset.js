// Global Defensive graphics presets for computers without a graphics card (v53 stage 6, spec §5). GD only: other modes
// keep their own "Graphics mode" (preferences.graphics) exactly as before.
//
// DETECTION (first start of Global Defensive, once per computer, stored under localStorage 'infra-gd-device'):
//   1. the WebGL renderer string (WEBGL_debug_renderer_info → UNMASKED_RENDERER_WEBGL, e.g. "ANGLE (Intel, Intel(R) UHD
//      Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)") → a tier: 'software' (SwiftShader, llvmpipe, Microsoft Basic
//      Render Driver), 'integrated' (Intel HD / UHD / Iris / Arc iGPU, AMD Radeon Graphics / Vega APUs, Apple M-series,
//      phone GPUs) or 'dedicated' (NVIDIA, AMD Radeon RX / Pro, Intel Arc A-series) — classifyRenderer();
//   2. a 2-second render probe (runProbe: a small offscreen canvas of its own — the game's renderer and its state are
//      never touched — drawing a fixed fill-rate shader, timed with a 1-pixel readPixels after each batch) → ms per
//      1920×1080-sized pass;
//   3. tier + probe → the preset (presetFor): dedicated → High, integrated → Medium (Iris Xe class) or Low (UHD 620 class,
//      or a slow probe), software → Very Low. A probe slower than its tier expects moves one step down (never up:
//      a masked renderer string, "unknown", is placed by the probe alone).
// The probe's thresholds are ESTIMATES: measured here only on an Apple M3 (Metal) and on SwiftShader (this Mac's CPU),
// the integrated classes placed between them by their published FP32 throughput (M3 10-core ≈ 3.6 TFLOPS, Iris Xe 96 EU
// ≈ 2.1, Radeon Vega 8 ≈ 1.1, UHD 620 ≈ 0.4). Not calibrated on real Windows hardware (none here) — see UPDATE-v53.0.md.
//
// SETTINGS (Settings → Graphics in a GD match): "Graphics preset" Auto (the detected one, shown) or a fixed one —
// preferences.gdPreset ('auto' | 'Ultra' | 'High' | 'Medium' | 'Low' | 'Very Low'). A computer that already had High or
// Ultra saved before v53 (the user's Mac) keeps it as its GD preset until changed (resolveGdPreset, keptGraphics).
//
// THE PRESETS (GD_PRESETS; spec §5.2 for Low / Very Low). `base` is the Graphics mode every existing GD module already
// reads (shadows, glow, smoke march, particle detail, fire, ragdoll cap, sun shadows): Very Low runs as Low there, plus:
//   scale      render scale of the screen's pixels (× the 1080p pixel cap below), the dynamic resolution's start; floor its
//              lowest step (Low 0.8 → 0.6, Very Low 0.6 → 0.5); High and up keep v52's own sizing (scale null)
//   fps        what the dynamic resolution holds: 60, 30 on a software renderer (Very Low)
//   sharpen    the sharpen pass (gd-sharpen.js) on the upscaled picture — Low / Very Low on a GPU; on software: no post at all
//   hudBlur    the HUD's backdrop blur (CS2's hudWorldBlur gaussian(2,2,2) behind the kill tally, alerts, round banner):
//              Medium and up; Low / Very Low a flat rgba(0,0,0,.627) fill (= brightness .373) — batch B measured the
//              always-on blur at ~4 fps at 4× CPU
//   texCap     the largest model texture (CS2 guns, agents, gloves; map textures are imported at ≤ 1024 already), mip-mapped
//   lodM       metres past which remote agents animate at half rate (gd-anim-lod.js); 0 = v52's rule (160 units). Only
//              the animation rate: no simpler material or mesh exists yet past it (UPDATE-v53.0.md, partial)
//   decals     bullet-hole decals kept (gd-impacts.js pool DECAL_N = 128; a cap below it reuses the ring sooner)
//   ragdolls   active ragdolls (gd-ragdoll.js CAP / CAP_LOW: base 'Low' → 4)
//   voices     sound voices at once (gd-sounds.js VOICES 40; Low / Very Low 24)
//   radarHz    radar redraws a second (0 = every frame; Low / Very Low 15)
//   draws      the draw-call budget of a full 10-player fight (tests/gd-low-preset.mjs; < 400 on Low)
//   bloom      (v53 LOOK) the map's own CS2 bloom (its .vpost CBloomLayer, gd-exposure.js / graphics.js): Medium and up
//   ssao       (v53 LOOK) screen-space ambient occlusion at half resolution (gd-ssao.js): High and Ultra only (spec §4.1)
// (CS2's auto exposure, gd-exposure.js, runs on every preset with a composer — all GPU presets; not on a software renderer.)
//
// RUNTIME: app.js calls setGdPresetNow(name) whenever the preset or the match changes; modules read gdPresetNow() (a
// frozen table row: nothing made per frame). body.gd-lo is set on Low / Very Low (the HUD's blur rule below).

export const PRESET_NAMES = Object.freeze(['Ultra', 'High', 'Medium', 'Low', 'Very Low']);
const row = o => Object.freeze(o);
export const GD_PRESETS = Object.freeze({
  Ultra: row({ name: 'Ultra', base: 'Ultra', scale: null, floor: null, fps: 60, sharpen: false, hudBlur: true, texCap: 0, lodM: 0, decals: 128, ragdolls: 10, voices: 40, radarHz: 0, draws: 0, bloom: true, ssao: true }),
  High: row({ name: 'High', base: 'High', scale: null, floor: null, fps: 60, sharpen: false, hudBlur: true, texCap: 0, lodM: 0, decals: 128, ragdolls: 10, voices: 40, radarHz: 0, draws: 0, bloom: true, ssao: true }),
  Medium: row({ name: 'Medium', base: 'Medium', scale: null, floor: null, fps: 60, sharpen: false, hudBlur: true, texCap: 0, lodM: 0, decals: 128, ragdolls: 10, voices: 40, radarHz: 0, draws: 0, bloom: true, ssao: false }),
  Low: row({ name: 'Low', base: 'Low', scale: .8, floor: .6, fps: 60, sharpen: true, hudBlur: false, texCap: 1024, lodM: 15, decals: 64, ragdolls: 4, voices: 24, radarHz: 15, draws: 400, bloom: false, ssao: false }),
  'Very Low': row({ name: 'Very Low', base: 'Low', scale: .6, floor: .5, fps: 60, sharpen: true, hudBlur: false, texCap: 512, lodM: 15, decals: 32, ragdolls: 4, voices: 24, radarHz: 15, draws: 400, bloom: false, ssao: false }),
});
// The render scale is of the screen's own pixels, but never more than a 1080p screen's (a Retina laptop on Low would
// otherwise draw 2.6 Mpx × 0.8): Low on a 1920×1080 display at 150 % Windows scaling draws 1536 × 864. And never more
// than Medium's own pixel-ratio ceiling (app.js graphicsCeiling: 1.5) — in a small window on a 2× screen the 1080p cap
// alone let Low (2 × .8 = 1.6) draw more pixels than Medium (1.5) (review).
export const LOW_PIXEL_CAP = 1920 * 1080, MEDIUM_RATIO = 1.5;
// What the software tier changes on top of its preset: the 30 fps target, no post-processing at all (no sharpen).
export const SOFTWARE = Object.freeze({ fps: 30, sharpen: false });

// ── 1. The renderer string → a tier ──
const RE_SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|basic render|microsoft basic|\bsoftware\b|mesa offscreen|gdi generic/i;
// AMD's APUs first (their names carry "RX" / "Vega" like the cards: "AMD Radeon(TM) RX Vega 10 Graphics", "Radeon(TM) Vega 8
// Graphics", "AMD Radeon(TM) Graphics", "AMD Radeon 780M Graphics"): "… Graphics" after the model is the integrated part.
const RE_APU = /radeon\(tm\)\s*graphics|radeon graphics|vega\s*\d+\s*graphics|radeon(\(tm\))?\s*\d{3}m\b|radeon\(tm\)\s*r[2-7]\b/i;
const RE_DEDICATED = /nvidia|geforce|quadro|\brtx\b|\bgtx\b|tesla|radeon\s*(\(tm\)\s*)?(rx|pro|r9|hd\s*[5-8]\d{3}|vii)|firepro|arc\(tm\)\s*a\d{3}|\barc\s*a\d{3}/i;
const RE_INTEGRATED = /intel|iris|uhd|hd graphics|apple|mali|adreno|powervr|videocore|tegra/i;
// Integrated chips this game expects to hold Medium (Iris Xe class and up); the rest of the integrated tier starts at Low.
const RE_IGPU_STRONG = /iris\s*(\(r\)\s*)?(xe|plus|pro)|arc\(tm\)\s*graphics|\barc graphics|radeon(\(tm\))?\s*(6[0-9]0m|7[0-9]0m|8[0-9]0m)|apple/i;
export function classifyRenderer(s) {
  const r = String(s || '');
  if (!r.trim() || /^(webkit webgl|unknown|angle)$/i.test(r.trim())) return { tier: 'unknown', strong: false };
  if (RE_SOFTWARE.test(r)) return { tier: 'software', strong: false };
  if (RE_APU.test(r)) return { tier: 'integrated', strong: RE_IGPU_STRONG.test(r) };
  if (RE_DEDICATED.test(r)) return { tier: 'dedicated', strong: true };
  if (RE_INTEGRATED.test(r)) return { tier: 'integrated', strong: RE_IGPU_STRONG.test(r) };
  return { tier: 'unknown', strong: false };
}

// ── 2. The probe's thresholds (ms per 1920×1080-sized pass of the probe shader; estimates — see the top) ──
// Measured here (tests/browser/gd-presets.mjs, 2026-11-04, the device record it prints): Apple M3 (10-core GPU) through ANGLE →
// Metal 0.25–0.43 ms in six runs; SwiftShader (--use-angle=swiftshader on the M3's CPU) 680 ms.
export const PROBE_REF = Object.freeze({ m3: 0.3, swiftshader: 680 });
// A pass slower than these (estimates from the M3's 0.3 ms × the throughput ratios above, × 2 for margin): High is too much
// past 0.6 ms (a GPU at half an M3), Medium past 1.1 ms (Iris Xe ≈ 0.3 × 3.6 / 2.1 ≈ 0.5 ms), Low past 5.5 ms (UHD 620 ≈ 0.3 ×
// 3.6 / 0.4 ≈ 2.7 ms) — past that only a software-class renderer is left: Very Low.
export const PROBE_MS = Object.freeze({ high: .6, medium: 1.1, low: 5.5 });
// tier (+ strong: an Iris Xe-class name) and the probe's ms (null: none) → a preset name
export function presetFor(tier, probeMs = null, strong = false) {
  const p = Number.isFinite(probeMs) && probeMs > 0 ? probeMs : null;
  if (tier === 'software') return 'Very Low';
  const byProbe = p === null ? null : p <= PROBE_MS.high ? 'High' : p <= PROBE_MS.medium ? 'Medium' : p <= PROBE_MS.low ? 'Low' : 'Very Low';
  const named = tier === 'dedicated' ? 'High' : tier === 'integrated' ? (strong ? 'Medium' : 'Low') : null;
  if (named === null) return byProbe || 'Medium';                       // unknown name: the probe alone (no probe: Medium, v52's default)
  if (byProbe === null) return named;
  return PRESET_NAMES.indexOf(byProbe) > PRESET_NAMES.indexOf(named) ? byProbe : named;   // (the probe only moves down)
}

// ── 3. Stored detection, the setting, and the preset in use ──
const DEVICE_KEY = 'infra-gd-device';
export function loadDevice() { try { const d = JSON.parse(globalThis.localStorage?.getItem(DEVICE_KEY) || 'null'); return d && typeof d === 'object' ? d : null; } catch { return null; } }
export function saveDevice(d) { try { globalThis.localStorage?.setItem(DEVICE_KEY, JSON.stringify(d)); } catch {} return d; }
// Before v53 a computer with a Graphics mode saved keeps it as its GD preset — but only 'High' or 'Ultra', the modes
// only a player picks (the user's Mac keeps High). 'Medium' and 'Low' are not kept: savePreferences writes the whole
// preferences object, defaults included (player-preferences.js: graphics 'Medium'), so any v52 computer that changed one
// setting has 'Medium' saved without choosing it, and v52's own first-match / hall bench and a software GPU's start-up
// wrote 'Low' / 'Medium' by themselves (app.js). Those computers get Auto: the detected preset. noteFirstRun notes the
// kept mode the first time it runs (KEEP_V52 also filters records noted before this rule, keptGraphics).
const KEEP_V52 = Object.freeze(['High', 'Ultra']);
export const keptGraphics = device => KEEP_V52.includes(device?.hadGraphics) ? device.hadGraphics : null;
export function noteFirstRun(rawPrefsJSON) {
  const d = loadDevice(); if (d && 'hadGraphics' in d) return d;
  let had = null; try { const p = JSON.parse(rawPrefsJSON || '{}'); had = KEEP_V52.includes(p.graphics) ? p.graphics : null; } catch {}
  return saveDevice({ ...(d || {}), hadGraphics: had });
}
// The preset GD draws with: the setting, else a High / Ultra saved before v53, else the detected one (else from the
// renderer string alone, until the probe has run).
export function resolveGdPreset(prefs = {}, device = null, rendererString = '') {
  const set = prefs?.gdPreset;
  if (PRESET_NAMES.includes(set)) return set;
  const kept = set !== 'auto' ? keptGraphics(device) : null; if (kept) return kept;
  return autoPreset(device, rendererString);
}
export function autoPreset(device, rendererString = '') {
  if (device?.preset && PRESET_NAMES.includes(device.preset) && (!rendererString || device.renderer === rendererString)) return device.preset;   // (another GPU since: detect again)
  const c = classifyRenderer(rendererString); return presetFor(c.tier, null, c.strong);
}
export const needsDetection = (device, rendererString) => !device?.preset || device.renderer !== rendererString;
// The row in use, with the software renderer's changes folded in (no sharpen, 30 fps).
const SOFT_ROWS = new Map();
export function presetRow(name, software = false) {
  const r = GD_PRESETS[name] || GD_PRESETS.Medium; if (!software) return r;
  let s = SOFT_ROWS.get(r.name); if (!s) SOFT_ROWS.set(r.name, s = Object.freeze({ ...r, ...SOFTWARE, software: true })); return s;
}
// The pixel ratio a preset with its own render scale draws at (null: the preset keeps v52's sizing): `scale` of the
// screen's pixels, the screen first capped at 1080p's pixel count; `resScale` the player's Resolution scale on top.
export function presetRatio(row, dpr, cssW, cssH, resScale = 1, which = 'scale') {
  const k = row?.[which]; if (!k) return null;
  const base = Math.min(dpr, MEDIUM_RATIO, Math.sqrt(LOW_PIXEL_CAP / Math.max(1, cssW * cssH)));
  return Math.max(.25, base * k * (+resScale || 1));
}

// ── 4. The runtime state (app.js sets it; GD modules read it) ──
let now = GD_PRESETS.Medium, active = false;
const listeners = new Set();
export const gdPresetNow = () => now;
export const gdPresetActive = () => active;
// A GD model texture's size under the preset's cap (texCap: Low 1024, Very Low 512; 0 = none) — CS2 agents, first-person arms,
// gloves and skins (cs2-agents.js, fp-view.js, glove-assets.js, skin-textures.js: GD-only content).
export const gdTexSize = size => { const c = now.texCap; return c > 0 ? Math.min(size, c) : size; };
export function onGdPreset(f) { listeners.add(f); return () => listeners.delete(f); }
// name: the preset; on: a GD match is being drawn (body.gd-lo only then); software: the software renderer's row.
export function setGdPresetNow(name, on = active, software = false) {
  const r = presetRow(name, software); if (r === now && !!on === active) return now; now = r; active = !!on;
  const b = globalThis.document?.body; if (b) { if (active) ensureStyle(); b.classList.toggle('gd-lo', active && !r.hudBlur); }   // (the style only once a GD match is drawn: other modes' documents never get it)
  for (const f of listeners) { try { f(r, active); } catch {} }
  return now;
}
// Low / Very Low: no backdrop blur anywhere in the GD HUD (a blur re-reads the picture under it every frame), CS2's
// hud-blur-bg colour as a flat fill instead (the kill tally's cards and badge: #000000a0 over the world dimmed to .373 —
// one flat rgba(0,0,0,.627), as gd-death-panel.js's .lo).
let styled = false;
function ensureStyle() {
  if (styled || !globalThis.document?.head) return; styled = true;
  const s = document.createElement('style'); s.id = 'gd-preset-css';
  s.textContent = 'body.gd-mode.gd-lo *{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}'
    + 'body.gd-mode.gd-lo .ke-bg,body.gd-mode.gd-lo .ke-bd{background:rgba(0,0,0,.627)!important}';   // (.ke-bg.ke-mk: CS2's kill_mask shapes the fill as it shaped the blur)
  document.head.append(s);
}

// ── 5. The 2-second probe ──
// A canvas of its own (W × H), one fill-rate shader (ALU + 4 texture reads per pixel, like a lit, textured surface),
// drawn in batches: each batch is `n` passes and a 1-pixel readPixels (the wait for the GPU to finish them); n doubles
// until a batch takes ≥ 4 ms (the readPixels round trip is then noise), batches spread over animation frames so the page
// stays responsive, for `ms` (2000). Result: the median batch's ms per pass, scaled to 1920 × 1080 pixels.
const PROBE_VS = 'attribute vec2 p; varying vec2 v; void main() { v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }';
const PROBE_FS = `precision highp float; varying vec2 v; uniform sampler2D t; uniform float k;
void main() { vec3 c = vec3(0.); vec2 u = v;
  for (int i = 0; i < 4; i++) { vec4 s = texture2D(t, u * (1.7 + float(i)) + k); c += s.rgb * (.5 + .5 * sin(dot(s.rgb, vec3(12.9898, 78.233, 37.719)) + k));
    u = fract(u * 1.31 + vec2(c.r, c.g) * .07); c = c * .93 + vec3(fract(sin(dot(u, vec2(91.7, 13.3))) * 43758.5)) * .02; }
  gl_FragColor = vec4(c * .25, 1.); }`;
export async function runProbe({ ms = 2000, W = 640, H = 360, doc = globalThis.document, raf = globalThis.requestAnimationFrame?.bind(globalThis), clock = () => performance.now() } = {}) {
  if (!doc?.createElement) return null;
  const cv = doc.createElement('canvas'); cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const done = () => { try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} };
  try {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, PROBE_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, PROBE_FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { done(); return null; }
    gl.useProgram(pr); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const N = 256, px = new Uint8Array(N * N * 4); for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761 >>> 24) & 255;
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const uk = gl.getUniformLocation(pr, 'k'), one = new Uint8Array(4); gl.viewport(0, 0, W, H);
    const batch = n => { const t0 = clock(); for (let i = 0; i < n; i++) { gl.uniform1f(uk, i * .013); gl.drawArrays(gl.TRIANGLES, 0, 3); } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one); return clock() - t0; };
    batch(1);   // (the first draw links and uploads: not timed)
    const per = [], start = clock(); let n = 1;
    while (clock() - start < ms && per.length < 400) {
      const t = batch(n); if (t < 4 && n < 256) { n *= 2; continue; }
      per.push(t / n); if (gl.isContextLost()) break;
      if (raf) await new Promise(r => raf(r)); else await new Promise(r => setTimeout(r, 0));
    }
    done(); if (!per.length) return null;
    per.sort((a, b) => a - b); const med = per[per.length >> 1];
    return +(med * (1920 * 1080) / (W * H)).toFixed(3);
  } catch { done(); return null; }
}
// The whole detection: renderer string → tier, the probe, the preset; stored. Returns the stored record.
export async function detectDevice(rendererString, opts = {}) {
  const c = classifyRenderer(rendererString), probeMs = c.tier === 'software' && opts.probeSoftware === false ? null : await runProbe(opts);
  const preset = presetFor(c.tier, probeMs, c.strong);
  return saveDevice({ ...(loadDevice() || {}), renderer: String(rendererString || ''), tier: c.tier, strong: c.strong, probeMs, preset, at: new Date().toISOString() });
}
