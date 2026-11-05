// Global Defensive · the Low / Very Low presets for computers without a graphics card (v53 stage 6, spec §5): dist/gd-preset.js
// and the places that follow it, in node (no browser; the frame-rate and draw-call measurements are the browser check
// tests/browser/gd-presets.mjs, whose last result this test reads back — see 7):
//  1. the preset by renderer string (WEBGL_debug_renderer_info as Chrome / ANGLE report it on Windows, macOS, Linux):
//     software → Very Low, integrated → Low (UHD / HD / Vega class) or Medium (Iris Xe / Arc / 680M+ / Apple), dedicated →
//     High; the 2-second probe only moves a preset down; a masked string is placed by the probe alone;
//  2. Settings: a fixed preset wins; Auto takes the detected one; a computer with High / Ultra saved before v53 keeps it
//     (a saved 'Medium' / 'Low' — v52's default, bench or software start-up — does not: Auto);
//  3. the table against spec §5.2 (render scale 0.6–0.8 + sharpen, 60 fps / 30 on software, no shadows / glow — base Low
//     through graphics.js resolveGraphics —, no post at all on software, textures 512–1024, LOD past 15 m, 24 voices,
//     radar 15 Hz, decal / ragdoll caps, the HUD's backdrop blur off) and Medium+ unchanged (v52's sizing, blur on);
//  4. the render scale in pixels (1920 × 1080 at 150 % Windows scaling: Low 1536 × 864; a Retina laptop capped at 1080p's
//     pixel count);
//  5. the caps at work: gd-sounds' voices (24 at once on Low, 40 on Medium), the radar's redraw rate, the anim LOD range,
//     gd-impacts' decal ring, the texture cap; the HUD rule (body.gd-lo) only on Low / Very Low and only in a match;
//  6. the wiring (source checks): graphics.js builds the sharpen pass only for a GD preset with sharpen and never on a
//     software renderer; app.js applies the preset only while a GD match is drawn (gdRowNow null elsewhere);
//  7. the draw-call budget: < 400 draw calls in a full 10-player fight on Low (the staged fight: 9 bots in view) — the
//     browser check's RECORDED result, its date printed
//     (tests/data/gd-presets-result.json; if absent the budget constant alone is checked and that is said).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
let n = 0; const ok = (c, m) => { assert(c, m); n++; if (process.env.V) console.log('  ok ' + m); };

// ── a tiny DOM (body.classList, head) for setGdPresetNow's rule ──
const cls = new Set(); const styles = [];
globalThis.document = { body: { classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: c => cls.has(c) } }, head: { append: s => styles.push(s) }, createElement: () => ({}) };
const store = new Map(); globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const P = await import('../dist/gd-preset.js');
const { classifyRenderer, presetFor, resolveGdPreset, autoPreset, GD_PRESETS, PRESET_NAMES, presetRow, presetRatio, setGdPresetNow, gdPresetNow, noteFirstRun, loadDevice, saveDevice, PROBE_MS, LOW_PIXEL_CAP, gdTexSize } = P;

// ── 1. renderer strings ──
const R = {
  'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Low'],
  'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.9466)': ['integrated', 'Low'],
  'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Low'],
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Medium'],
  'ANGLE (Intel, Intel(R) Iris(R) Plus Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Medium'],
  'ANGLE (Intel, Intel(R) Arc(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Medium'],
  'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Low'],
  'ANGLE (AMD, AMD Radeon(TM) RX Vega 10 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Low'],
  'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Low'],
  'ANGLE (AMD, AMD Radeon 780M Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': ['integrated', 'Medium'],
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)': ['integrated', 'Medium'],
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)': ['dedicated', 'High'],
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)': ['dedicated', 'High'],
  'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)': ['dedicated', 'High'],
  'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': ['dedicated', 'High'],
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)': ['software', 'Very Low'],
  'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)': ['software', 'Very Low'],
  'llvmpipe (LLVM 15.0.7, 256 bits)': ['software', 'Very Low'],
  'WebKit WebGL': ['unknown', 'Medium'],
  '': ['unknown', 'Medium'],
};
for (const [s, [tier, preset]] of Object.entries(R)) { const c = classifyRenderer(s); ok(c.tier === tier, `"${s.slice(0, 60)}" → ${tier} (got ${c.tier})`); ok(presetFor(c.tier, null, c.strong) === preset, `"${s.slice(0, 60)}" → ${preset}`); }
// the probe moves down only; a masked name by the probe alone
ok(presetFor('integrated', PROBE_MS.medium + 1, true) === 'Low', 'Iris Xe name, a slow probe (past the Medium limit) → Low');
ok(presetFor('integrated', PROBE_MS.low + 1, false) === 'Very Low', 'UHD name, a very slow probe → Very Low');
ok(presetFor('integrated', .2, false) === 'Low', 'a UHD name with a fast probe stays Low (the probe never moves up)');
ok(presetFor('dedicated', PROBE_MS.high + .1, true) === 'Medium', 'a dedicated GPU slower than the High limit → Medium');
ok(presetFor('unknown', .5) === 'High' && presetFor('unknown', PROBE_MS.high + .1) === 'Medium' && presetFor('unknown', PROBE_MS.medium + .1) === 'Low' && presetFor('unknown', PROBE_MS.low + .1) === 'Very Low', 'a masked renderer: the probe alone');
ok(presetFor('software', .1) === 'Very Low', 'software is Very Low whatever the probe');
ok(presetFor('integrated', P.PROBE_REF.m3, true) === 'Medium' && presetFor('unknown', P.PROBE_REF.m3) === 'High' && presetFor('unknown', P.PROBE_REF.swiftshader) === 'Very Low', 'the measured probes: the M3 (0.3 ms) by its name Medium, masked High; SwiftShader (680 ms) masked → Very Low');

// ── 2. the setting, the stored detection, the pre-v53 Graphics mode ──
store.clear(); let d = noteFirstRun(JSON.stringify({ graphics: 'High' }));
ok(d.hadGraphics === 'High' && resolveGdPreset({}, loadDevice(), 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)') === 'High', 'a computer with Graphics mode High saved before v53 keeps High in GD (the user\'s Mac)');
ok(noteFirstRun(JSON.stringify({})).hadGraphics === 'High', 'noted once: a Graphics mode saved later (the first-match bench) does not change it');
ok(resolveGdPreset({ gdPreset: 'auto' }, loadDevice(), 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)') === 'Low', 'Auto chosen: the detected preset, even with a pre-v53 mode');
ok(resolveGdPreset({ gdPreset: 'Very Low' }, loadDevice(), '') === 'Very Low', 'a fixed preset wins');
// (review: savePreferences writes the whole object, defaults included — graphics 'Medium' — and v52's bench / a software
// GPU's start-up wrote 'Low' / 'Medium' by themselves: those are not a player's choice, so they get Auto)
const UHD = 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', SWS = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
{ const { defaultPreferences } = await import('../dist/player-preferences.js');
  store.clear(); d = noteFirstRun(JSON.stringify({ ...defaultPreferences, fov: 90 }));
  ok(d.hadGraphics === null && resolveGdPreset({ ...defaultPreferences, fov: 90 }, loadDevice(), UHD) === 'Low', 'a v52 computer that changed one setting (the default graphics \'Medium\' saved with it): Auto — a UHD 620 gets Low, not Medium');
  store.clear(); d = noteFirstRun(JSON.stringify({ graphics: 'Low' }));
  ok(d.hadGraphics === null && resolveGdPreset({}, loadDevice(), SWS) === 'Very Low', 'a software PC with v52\'s start-up \'Low\' saved: Auto — Very Low, not Low');
  store.clear(); noteFirstRun(JSON.stringify({ graphics: 'Ultra' })); ok(resolveGdPreset({}, loadDevice(), UHD) === 'Ultra', 'Ultra saved before v53 is kept (only a player picks it)');
  ok(P.keptGraphics({ hadGraphics: 'Medium' }) === null && P.keptGraphics({ hadGraphics: 'High' }) === 'High' && resolveGdPreset({}, { hadGraphics: 'Medium' }, UHD) === 'Low', 'a record noted before this rule (hadGraphics \'Medium\') is not kept either');
}
store.clear(); noteFirstRun(null);
ok(resolveGdPreset({}, loadDevice(), 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)') === 'Very Low', 'a new computer, no setting: Auto from the renderer string at once (Basic Render → Very Low)');
saveDevice({ ...loadDevice(), renderer: 'X', preset: 'Low', tier: 'integrated', probeMs: 9 });
ok(autoPreset(loadDevice(), 'X') === 'Low' && autoPreset(loadDevice(), 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)') === 'High', 'the detected preset is used while the GPU is the same; another GPU: from its name until detected again');
ok(P.needsDetection(loadDevice(), 'X') === false && P.needsDetection(loadDevice(), 'Y') === true && P.needsDetection(null, 'X') === true, 'detection runs once per computer and GPU');

// ── 3. the table against spec §5.2 ──
const lo = [GD_PRESETS.Low, GD_PRESETS['Very Low']];
for (const r of lo) {
  ok(r.scale >= .6 && r.scale <= .8 && r.floor >= .5 && r.floor <= r.scale, `${r.name}: render scale ${r.scale} (0.6–0.8), dynamic floor ${r.floor}`);
  ok(r.sharpen === true && r.hudBlur === false && r.fps === 60, `${r.name}: sharpen pass, no HUD backdrop blur, holds 60 fps`);
  ok(r.base === 'Low', `${r.name}: the existing GD modules run as Low (no shadows, no glow, smoke march ≤ half resolution, CS2 LOD0 particles, one flame, 4 ragdolls)`);
  ok(r.texCap >= 512 && r.texCap <= 1024, `${r.name}: textures capped at ${r.texCap} (512–1024)`);
  ok(r.lodM === 15 && r.voices === 24 && r.radarHz === 15 && r.draws === 400 && r.decals <= 64 && r.ragdolls <= 4, `${r.name}: LOD past 15 m, 24 voices, radar 15 Hz, < 400 draws, decals ${r.decals}, ragdolls ${r.ragdolls}`);
}
ok(GD_PRESETS.Low.scale > GD_PRESETS['Very Low'].scale && GD_PRESETS.Low.texCap > GD_PRESETS['Very Low'].texCap, 'Very Low is below Low (scale, textures)');
for (const k of ['Medium', 'High', 'Ultra']) { const r = GD_PRESETS[k]; ok(r.scale === null && r.hudBlur === true && r.sharpen === false && r.voices === 40 && r.radarHz === 0 && r.texCap === 0 && r.base === k, `${k}: v52's own sizing and look (blur on, all voices, radar every frame)`); }
ok(JSON.stringify(PRESET_NAMES) === JSON.stringify(['Ultra', 'High', 'Medium', 'Low', 'Very Low']), 'the presets, best first');
const soft = presetRow('Very Low', true);
ok(soft.fps === 30 && soft.sharpen === false && soft.software === true && soft.scale === .6, 'software: 30 fps target and no post-processing at all (no sharpen)');
ok(presetRow('Very Low', true) === soft, 'the software row made once');
const { resolveGraphics } = await import('../dist/graphics.js').catch(() => ({}));
if (resolveGraphics) {
  const g = resolveGraphics({}, 'Low', false); ok(g.shadows === 'off' && g.glow === false && g.aa === 0, 'base Low: no real-time shadows, no bloom, no MSAA (graphics.js resolveGraphics)');
  const s = resolveGraphics({ shadows: 'high', glow: 'on', antialias: '4' }, 'Low', true); ok(s.shadows === 'off' && s.glow === false && s.aa === 0, 'software: no shadows, glow or MSAA even when asked (no post at all)');
}

// ── 4. render scale in pixels ──
const px = (row, dpr, w, h) => { const r = presetRatio(row, dpr, w, h, 1); return [Math.round(w * r), Math.round(h * r)]; };
ok(JSON.stringify(px(GD_PRESETS.Low, 1.5, 1280, 720)) === '[1536,864]', `1920×1080 at 150 % scaling, Low: ${px(GD_PRESETS.Low, 1.5, 1280, 720)} (0.8 of the screen)`);
ok(JSON.stringify(px(GD_PRESETS['Very Low'], 1, 1280, 720)) === '[768,432]', `1280×720 software, Very Low: ${px(GD_PRESETS['Very Low'], 1, 1280, 720)}`);
{ const [w, h] = px(GD_PRESETS.Low, 2, 1512, 982); ok(w * h <= LOW_PIXEL_CAP * .8 * .8 + 2000, `a Retina laptop on Low: ${w}×${h}, never more than 0.8² of 1080p's pixels`); }
{ const lowR = presetRatio(GD_PRESETS.Low, 2, 960, 540), vlR = presetRatio(GD_PRESETS['Very Low'], 2, 960, 540); ok(lowR <= P.MEDIUM_RATIO * GD_PRESETS.Low.scale + 1e-9 && lowR < P.MEDIUM_RATIO && vlR < lowR, `a small window on a 2× screen (960×540): Low ratio ${lowR.toFixed(2)} < Medium's 1.5 (review: it was 1.6, more pixels than Medium)`); }
ok(Math.abs(presetRatio(GD_PRESETS.Low, 2, 1470, 956) - Math.sqrt(LOW_PIXEL_CAP / (1470 * 956)) * .8) < 1e-9, 'the user\'s Retina window (1470×956 at 2×): Low by the 1080p pixel cap, 0.8 of it');
ok(presetRatio(GD_PRESETS.High, 2, 1512, 982) === null, 'High: no render scale of its own (v52 sizing)');
ok(Math.abs(presetRatio(GD_PRESETS.Low, 1.5, 1280, 720, .85) - 1.2 * .85) < 1e-9, 'the player\'s Resolution scale multiplies on top');

// ── 5. the caps at work ──
cls.clear(); setGdPresetNow('Low', false); ok(!cls.has('gd-lo') && gdPresetNow().name === 'Low', 'Low outside a match: no HUD class');
setGdPresetNow('Low', true); ok(cls.has('gd-lo') && styles.length === 1 && /backdrop-filter:none!important/.test(styles[0].textContent) && /rgba\(0,0,0,\.627\)/.test(styles[0].textContent), 'Low in a match: body.gd-lo — every backdrop blur off, the kill tally a flat rgba(0,0,0,.627) (= CS2\'s brightness .373)');
setGdPresetNow('Medium', true); ok(!cls.has('gd-lo'), 'Medium in a match: CS2\'s blur kept');
ok(/^body\.gd-mode\.gd-lo /.test(styles[0].textContent), 'the rule only reaches the GD HUD (body.gd-mode)');
setGdPresetNow('Very Low', true); ok(gdTexSize(2048) === 512 && gdTexSize(256) === 256, 'texture cap: Very Low 512');
setGdPresetNow('Low', true); ok(gdTexSize(2048) === 1024, 'texture cap: Low 1024');
setGdPresetNow('High', true); ok(gdTexSize(2048) === 2048, 'texture cap: none on High');
const LOD = await import('../dist/gd-anim-lod.js');
setGdPresetNow('Low', true); ok(Math.abs(LOD.nearFull() - 15 * 100 / 16.5) < 1e-9 && LOD.agentAnimDt(100, true, 1, .016) === 0 && LOD.agentAnimDt(100, true, 2, .016) === .032 && LOD.agentAnimDt(80, true, 1, .016) === .016, 'Low: agents past 15 m (91 units) animate every other frame with twice the step; nearer every frame');
setGdPresetNow('Medium', true); ok(LOD.nearFull() === LOD.NEAR_FULL && LOD.agentAnimDt(100, true, 1, .016) === .016, 'Medium: v52\'s 160 units');
// voices: a recording Web Audio stand-in (as tests/gd-headshot-audio.mjs), every world event's file decoded, one each from its own source
{
  class Param { constructor(v) { this.value = v; } setValueAtTime() { return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } cancelScheduledValues() { return this; } setTargetAtTime() { return this; } }
  class Node { constructor(c, k) { this.ctx = c; this.kind = k; this.out = []; } connect(d) { this.out.push(d); return d; } disconnect() {} }
  const buf = () => ({ numberOfChannels: 1, length: 48000, sampleRate: 48000, duration: 1, getChannelData: () => new Float32Array(48000), copyToChannel() {} });
  class Ctx { constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = new Node(this, 'dest'); const p = v => new Param(v); this.listener = { positionX: p(0), positionY: p(0), positionZ: p(0), forwardX: p(0), forwardY: p(0), forwardZ: p(-1), upX: p(0), upY: p(1), upZ: p(0) }; }
    resume() {} createBufferSource() { const s = new Node(this, 'src'); s.playbackRate = new Param(1); s.start = () => {}; s.stop = () => {}; return s; } createGain() { const g = new Node(this, 'gain'); g.gain = new Param(1); return g; }
    createBiquadFilter() { const f = new Node(this, 'bq'); f.frequency = new Param(1); f.Q = new Param(1); f.gain = new Param(0); return f; } createPanner() { const p = new Node(this, 'pan'); p.positionX = new Param(0); p.positionY = new Param(0); p.positionZ = new Param(0); return p; }
    createDynamicsCompressor() { const d = new Node(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) d[k] = new Param(0); return d; } createConvolver() { return new Node(this, 'conv'); } createDelay() { const d = new Node(this, 'delay'); d.delayTime = new Param(0); return d; }
    createBuffer() { return buf(); } decodeAudioData() { return Promise.resolve(buf()); } }
  globalThis.AudioContext = Ctx; globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8), json: async () => ({}) });
  const SA = await import('../dist/spatial-audio.js'), SB = await import('../dist/sound-bank.js'), S = await import('../dist/gd-sounds.js');
  SA.audioCtx(); SA.setListener({ position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, parent: null });
  const ids = Object.keys(S.EVENTS).filter(id => { const e = S.gdEvent(id); return e && e.files?.length && e.cat === 'world' && !e.cap; });
  await SB.want(ids.flatMap(id => S.gdEvent(id).files)); await new Promise(r => setTimeout(r, 30));
  const fill = () => { S.resetVoices(); let i = 0; for (const id of ids) S.gdPlay(id, { at: { x: 1 + (i % 5), y: 0, z: 1 }, src: 'p' + i++ }); return S.liveVoices(0.01); };
  setGdPresetNow('Medium', true); const med = fill(); setGdPresetNow('Low', true); const low = fill(); setGdPresetNow('Very Low', true); const vlow = fill();
  ok(ids.length > 40, `${ids.length} world events with files, one each from its own source`);
  ok(med > 24 && med <= S.VOICES, `Medium: ${med} voices at once (pool ${S.VOICES})`);
  ok(low === 24 && vlow === 24, `Low / Very Low: ${low} / ${vlow} voices at once (spec: at most 24) — the rest take the lowest-priority, quietest voice or are dropped`);
  setGdPresetNow('Medium', true);
}
// radar, decals: the source follows the preset (their behaviour is checked by the browser run: radar redraws counted)
const src = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
ok(/const hz = gdPresetNow\(\)\.radarHz; if \(hz > 0\) \{ if \(now - drawAt < 1000 \/ hz - 4\) return; drawAt = now; \}/.test(src('gd-radar.js')), 'radar: redrawn at the preset\'s radarHz (15 on Low), the canvas keeps its picture between');
ok(!/x\.font\s*=/.test(src('gd-radar.js')) && /function glyph\(/.test(src('gd-radar.js')), 'radar: no font is set on the on-page canvas (its text drawn from cached pictures: no mid-frame style recalc)');
ok(/DN = Math\.min\(DECAL_N, gdPresetNow\(\)\.decals \|\| DECAL_N\)/.test(src('gd-impacts.js')), 'impacts: the bullet-hole ring capped by the preset (Low 64, Very Low 32 of 128)');
ok(/if \(previewTag\.hidden !== !visible\) previewTag\.hidden = !visible;/.test(src('emotes.js')), '#emote-preview-tag: hidden written only when it changes (it ran every frame in GD)');
ok(/low: \(\) => !gdPresetNow\(\)\.hudBlur/.test(src('arena-ui.js')), 'the death panel\'s flat fill follows the preset (its .lo)');

// ── 6. wiring ──
const gx = src('graphics.js'), app = src('app.js');
ok(/const gdSharp = !!gdLast\?\.sharpen && !software;/.test(gx) && /const outPass = gdSharp \? new SharpenOutputPass\(\) : gdFx \? new FxaaOutputPass\(\) \/\* \(v53 LOOK: GD Medium's edges\) \*\/ : new OutputPass\(\);[\s\S]{0,400}?composer\.addPass\(outPass\)/.test(gx) /* (v53 PERF4X: the last pass held as outPass — the kill tally's blur is patched into it) */ /* (v53 LOOK: GD Medium's FXAA output in between) */, 'graphics.js: the sharpen pass ends the composer only for a GD preset with sharpen, never on a software renderer');
ok(/if \(!gdSharp \|\| G\.glow\) bloom = new UnrealBloomPass/.test(gx), 'graphics.js: a sharpen-only composer makes no glow buffers');
ok(/gdRowNow=gdFrame\?row:null;scene\.userData\.gdPreset=gdRowNow;/.test(app), 'app.js: the preset row only while a GD match is drawn (other modes: null — graphicsCeiling, the scaler and graphics.js as before)');
ok(/if\(gdRowNow\?\.scale\)return/.test(app) && /gdTgt=gdFrame&&gdRowNow&&gdRowNow\.fps<60\?gdRowNow\.fps:0/.test(app), 'app.js: the render scale and the 30 fps target come from the GD row');
ok(/preset:\(\)=>gdRowNow\?gdRowNow\.base:preferences\.graphics/.test(app), 'app.js: graphics.js gets the GD preset\'s Graphics mode in GD, the setting elsewhere');
// (review) detection never in play: the start panel or a loading card; its result applied only there
ok(/function gdDetectCheck\(\)\{if\(gdDevPending\)\{if\(!gdFrame\|\|gdLoadShown\(\)\)gdDetectApply\(\);return;\}if\(!gdNeedDetect\|\|gdDetecting\|\|!\(gdFrame\?gdLoadShown\(\):!!document\.getElementById\('ss-ar-solo'\)\)\)return;/.test(app), 'app.js: the probe runs on the GD start panel or behind a loading card, never in freeze time or a round');
ok(/gdDevPending=true;if\(!gdFrame\|\|gdLoadShown\(\)\)gdDetectApply\(\);/.test(app) && /resolveGdPreset\(preferences,gdDev,gpuName\)/.test(app), 'app.js: a detection that ends in play waits for the next loading card (gdDev: the record in effect)');
ok(/renderer\.shadowMap\.enabled\+'\|'\+\(gdRowNow\?\.name\|\|''\)/.test(app), 'app.js: a preset change warms its shader variants (the rehearse key holds the preset)');
ok(/function gdBenchOn\(\)\{return false&&/.test(app), 'app.js: v52\'s GD first-match bench is off (GD uses its own detection; no second, contradicting message)');
ok(/const mapTexCap = \(\) => \{ const c = gdPresetNow\(\)\.texCap; return c > 0 && c < 1024 \? c : 0; \};/.test(src('cs2-render.js')) && /capMapTextures\(g, mapTexCap\(\), \{ tex: t, mask: m \}\)/.test(src('cs2-render.js')) && /const LIGHT_CAP = 4096;/.test(src('cs2-render.js')) && /kept\?\.id === id && kept\.cap === mapTexCap\(\)/.test(src('cs2-render.js')), 'cs2-render.js: Very Low\'s 512 cap reaches the map\'s own textures and its light map is drawn at 4096 (review), a kept look reloaded when the cap changes');
ok(/await fitTextures\(\[\.\.\.set\.textures\], gdTexSize\(1 << 15\)\);/.test(src('fp-view.js')), 'fp-view.js: the first-person gun\'s own 2048 pictures under the cap (Low 1024, Very Low 512; none on Medium and up)');
{ const sh = src('gd-sharpen.js'); ok(/clamp\( c0\.rgb \+ uAmount \* \( c0\.rgb - 0\.25 \* \( n \+ s \+ e \+ w \) \), lo, hi \)/.test(sh), 'the sharpen: 5 taps, clamped to the neighbours\' range (no ringing)'); }

// ── 7. draw-call budget (the browser check's recorded fight) ──
const res = new URL('./data/gd-presets-result.json', import.meta.url);
// A RECORDED number (this test cannot render): the browser run's file, its date printed. The staged fight is the gate: all
// 9 bots held in view 4–15 m away and shooting (gd-presets.mjs staged()) — draws max under the budget.
if (existsSync(res)) { const r = JSON.parse(readFileSync(res, 'utf8')), low = r.presets?.Low, st = low?.staged;
  ok(low && low.drawsP95 < GD_PRESETS.Low.draws, `Low, spawn-view fight (recorded ${r.when}, ${r.machine}): draw calls p95 ${low?.drawsP95} (max ${low?.drawsMax}) < ${GD_PRESETS.Low.draws}`);
  ok(st && !st.error && st.drawsMax < GD_PRESETS.Low.draws && st.agentsInView[1] >= 8, `Low, staged 10-player fight (recorded ${r.when}): ${st?.agentsInView?.[1]} agents in view, draw calls max ${st?.drawsMax} (p95 ${st?.drawsP95}) < ${GD_PRESETS.Low.draws}`);
  ok(low.programsInFight === 0 && st.programsInFight === 0, 'Low: no shader linked during either fight');
  console.log(`  (recorded result, ${r.when}: re-run tests/browser/gd-presets.mjs with RECORD=1 after changing what it covers)`);
} else console.log('  (no recorded browser result yet — tests/browser/gd-presets.mjs writes tests/data/gd-presets-result.json; budget constant checked only)');
console.log(`PASS: gd-low-preset · ${n} checks (preset by renderer string, probe, settings, spec 5.2 table, render scale, voice / texture / LOD / radar / decal caps, HUD blur rule, wiring${existsSync(res) ? ', draw-call budget measured' : ''})`);
