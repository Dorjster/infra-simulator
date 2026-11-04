// v53 LOOK · Global Defensive's map look from CS2's own data (spec 4.1): auto exposure, bloom, the baked map's lights,
// SSAO, the agents' readability lift.
//  · auto exposure (dist/gd-exposure.js): every step stays inside the map's post_processing_volume range (HLSL clamp:
//    Nuke's reversed [1.0, 0.85] holds it at 0.85), whatever the frame's brightness; it is frame-rate independent (2 s of
//    a bright → dark change at 30 / 60 / 144 / 240 fps land on the same exposure); the GPU shader runs the same formula;
//    no readPixels anywhere; nothing allocated per step;
//  · bloom: each map's strength is its .vpost CBloomLayer's (SCREEN: m_flScreenBloomStrength, ADD: m_flBloomStrength) —
//    checked against the imported user-assets/look/look.json when it is on this computer, and against the numbers read
//    from the user's install for this release (the table below); on Medium and up only (gd-preset.js `bloom`);
//  · the baked map's point lights: a fixed BAKED_LIGHT_N slots from load (the uniform arrays, the shader's array size and
//    its loop bound), filled by graphics.js without allocating;
//  · SSAO only on High and Ultra (gd-preset.js `ssao`), added to the composer only then, at half resolution;
//  · the agents' readability lift is one shared shader key (no per-agent program).
//   node tests/gd-look.mjs
import { readFileSync, existsSync } from 'node:fs';
const X = await import('../dist/gd-exposure.js'), P = await import('../dist/gd-preset.js'), S = await import('../dist/gd-ssao.js');
let n = 0, bad = 0; const ok = (c, name, d = '') => { n++; if (!c) bad++; if (!c || process.argv.includes('-v')) console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + d : '')); };
const src = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
// The numbers read from the user's install for v53 (export/<id>/ents.txt post_processing_volume, the map's .vpost CBloomLayer).
const CS2 = {
  dust2: { lo: .925, hi: 1.1, up: 1, down: 1, blend: 'SCREEN', bloom: .184 }, mirage: { lo: .8, hi: 1, up: 1, down: 1, blend: 'SCREEN', bloom: .1261 },
  inferno: { lo: .8, hi: 1.1, up: 1, down: 1, blend: 'ADD', bloom: .12 }, nuke: { lo: 1, hi: .85, up: 1.1, down: .9, blend: 'SCREEN', bloom: .0112 },
  anubis: { lo: .7, hi: 1.8, up: 1.25, down: 1.25, blend: 'SCREEN', bloom: .0301 }, ancient: { lo: 1, hi: 1.7, up: 1, down: 1, blend: 'ADD', bloom: .163 },
  overpass: { lo: .8, hi: 1.2, up: 1, down: 1, blend: 'SCREEN', bloom: .1261 } };
const lookFile = new URL('../user-assets/look/look.json', import.meta.url), imported = existsSync(lookFile) ? JSON.parse(readFileSync(lookFile, 'utf8')) : null;
const entryOf = id => imported?.maps?.[id] || { volume: { minexposure: CS2[id].lo, maxexposure: CS2[id].hi, exposurespeedup: CS2[id].up, exposurespeeddown: CS2[id].down },
  bloom: { m_blendMode: 'BLOOM_BLEND_' + CS2[id].blend, m_flScreenBloomStrength: CS2[id].blend === 'SCREEN' ? CS2[id].bloom : 0, m_flBloomStrength: CS2[id].blend === 'ADD' ? CS2[id].bloom : 0, m_flBloomThreshold: 1, m_flBloomThresholdWidth: 1 }, tone: { m_flExposureBias: 0 } };
console.log(imported ? 'look.json: imported (user-assets) — checked against the install\'s numbers' : 'look.json: not imported here — the install\'s numbers as a fixture');

// ── 1. auto exposure ──
for (const id of Object.keys(CS2)) {
  const e = entryOf(id), L = X.setLook(id, e, undefined), c = CS2[id], lo = Math.min(c.lo, c.hi), hi = Math.max(c.lo, c.hi);
  ok(L.lo === c.lo && L.hi === c.hi && L.up === c.up && L.down === c.down, `${id}: exposure range [${c.lo}, ${c.hi}] and speeds ${c.up} / ${c.down} from its post_processing_volume`, JSON.stringify([L.lo, L.hi, L.up, L.down]));
  let E = L.use, inside = E >= lo - 1e-12 && E <= hi + 1e-12, seed = 7;
  for (let i = 0; i < 20000; i++) { seed = (seed * 16807) % 2147483647; const Lum = 10 ** (seed / 2147483647 * 6 - 4), dt = (seed % 97) / 97 * .1; E = X.adaptExposure(E, Lum, dt, L); if (!(E >= lo - 1e-12 && E <= hi + 1e-12)) inside = false; }
  ok(inside, `${id}: 20 000 steps over frames 10⁻⁴ … 10² bright stay inside [${lo}, ${hi}]`);
  if (c.lo > c.hi) ok([1e-4, .01, .2, 5, 100].every(l => X.adaptExposure(.9, l, .5, L) === c.hi), `${id}: its own reversed range (min ${c.lo} > max ${c.hi}) holds it at ${c.hi} — HLSL clamp, as CS2's shader`);
  // frame-rate independence (v53 LOOK review fix: the target now lies INSIDE the range, so a feedback or rate bug shows;
  // both directions — speed up from the range's bottom, speed down from its top): a scene whose drawn brightness is the
  // exposure × its light (a linear curve) with its light set so the map's key asks for the middle of its range.
  if (c.lo < c.hi) { const mid = (lo + hi) / 2, k = L.key / mid;
    for (const [from, dir] of [[lo, 'up'], [hi, 'down']]) {
      const run = fps => { let E2 = from; const dt = 1 / fps, out = []; for (let f = 1; f <= 2 * fps; f++) { E2 = X.adaptExposure(E2, E2 * k, dt, L); if (f === fps / 2 || f === fps || f === 2 * fps) out.push(E2); } return out; };
      const r = [30, 60, 144, 240].map(run), worst = Math.max(...r.flatMap(a => a.map((v, i) => Math.abs(v / r[1][i] - 1)))), rate = dir === 'up' ? L.up : L.down;
      const want = from * (mid / from) ** (1 - Math.exp(-rate * 1));   // the closed form after 1 s
      ok(worst < 1e-9 && Math.abs(r[1][1] / want - 1) < 1e-9 && r[1][0] !== from && r[1][2] !== mid, `${id}: frame-rate independent, speed ${dir} ${rate} (0.5 / 1 / 2 s from ${from} towards ${mid.toFixed(3)} inside the range, 30 – 240 fps)`, 'worst ' + worst.toExponential(2) + ' · ' + r[1].map(v => v.toFixed(4)).join(' → ')); }
    // a scene that answers less than linearly (a curve's shoulder): still settles where the drawn brightness is the key
    const a = L.key / mid ** .6; let E3 = lo; for (let i = 0; i < 6000; i++) E3 = X.adaptExposure(E3, a * E3 ** .6, 1 / 60, L);   // (L(E) = a·E^0.6: the key is met at E = mid)
    ok(Math.abs(E3 / mid - 1) < 1e-3, `${id}: with a non-linear picture (L ∝ E^0.6) it settles where the drawn brightness equals its key (${mid.toFixed(3)})`, E3.toFixed(4)); }
}
{ const L = X.setLook('dust2', entryOf('dust2'), .925); let E = .925; for (let i = 0; i < 600; i++) E = X.adaptExposure(E, E * .1, 1 / 60, L); // dark corner: key .129 / .1 → wants 1.29, held at 1.1
  ok(Math.abs(E - 1.1) < 1e-3, 'Dust II: a dark view opens the exposure up to its 1.1 top in 10 s (speed up 1.0)', E.toFixed(4));
  E = 1.1; for (let i = 0; i < 600; i++) E = X.adaptExposure(E, E * 1.2, 1 / 60, L); ok(Math.abs(E - .925) < 1e-3, 'Dust II: a bright view brings it down to 0.925', E.toFixed(4)); }
{ const g = src('gd-exposure.js');
  ok(/E = clampH\( E \* pow\( t \/ E, 1\.0 - exp\( - r \* uDt \) \) \)/.test(g) && /float t = clampH\( E \* uKey \/ max\( L, 1e-4 \) \), r = t > E \? uUp : uDn;/.test(g) && /min\( max\( x, uLo \), uHi \)/.test(g), 'the GPU shader runs the same rule (target, rate, exponential step, HLSL clamp)');
  ok(!/readPixels/.test(g.replace(/\/\/[^\n]*/g, '')) && /new THREE\.WebGLRenderTarget\(1, 1, f\), new THREE\.WebGLRenderTarget\(1, 1, f\)/.test(g) && /type: THREE\.FloatType/.test(g), 'GPU-only: a 1 × 1 ping-pong pair, no readPixels');
  ok(/warm\(renderer\)/.test(g) && /gdExpPass\?\.warm\(renderer\)/.test(src('graphics.js')), 'its two programs are compiled when the composer is built (behind the loading card)');
  const cr = src('cs2-render.js'); ok(/uExpOn > 0\.5 \? texture2D\( uExpTex, vec2\( 0\.5 \) \)\.g : uCurveB\.w/.test(cr) && /uExpTex: BAKED\.uExpTex, uExpOn: BAKED\.uExpOn/.test(cr), 'the map (and the first-person grade, GRADE_U) multiply by the adapted exposure; the fixed one without a composer');
  ok(Math.abs(X.EXPOSURE_KEY - .205) < 1e-9 && X.setLook('cache', { volume: { minexposure: 1, maxexposure: 1.2 }, tone: {} }, 1).key === .205, 'a map without a footage fit: key 0.205, the log-average luminance of the user\'s CS2 Dust II picture (not in CS2\'s files)');
  // v53 LOOK review fix: each map's key from CS2's footage exposure (exposure_fit.json post.use) — its spawn views settle there
  const FIT = { dust2: .925, mirage: 1, inferno: .8, anubis: 1.8, ancient: 1.7, overpass: 1 }, Lsp = { dust2: [.0904, .1661], mirage: [.4078, .1334], inferno: [.1243, .0585], anubis: [.2343, .4746], ancient: [.0788, .0939], overpass: [.0164, .0533] };   // (High spawn views at use, tests/browser/gd-look-shots.mjs 2026-11-04)
  // (the views' own targets before the range's clamp — a view past the range's end is held there, as in CS2)
  for (const id of Object.keys(FIT)) { const L = X.setLook(id, entryOf(id), FIT[id]); const Em = Math.exp(Lsp[id].reduce((s, l) => s + Math.log(FIT[id] * L.key / l), 0) / 2);
    ok(L.key === X.EXPOSURE_KEY_FIT[id] && Math.abs(Em / FIT[id] - 1) < .08, `${id}: its key ${L.key} aims its two spawn views at CS2's footage exposure ${FIT[id]} on average (geometric mean of their targets, within 8 %)`, Em.toFixed(4)); }
  ok(X.setLook('nuke', entryOf('nuke'), .85).key === X.EXPOSURE_KEY_FIT.nuke && /U\.uKey\.value = L\.key;/.test(g), 'the GPU pass takes the map\'s key when its look changes'); }
if (globalThis.gc) { const L = X.setLook('mirage', entryOf('mirage'), 1); let E = 1; gc(); const h0 = process.memoryUsage().heapUsed; for (let i = 0; i < 200000; i++) E = X.adaptExposure(E, .1 + (i % 50) * .01, 1 / 144, L); gc(); const dh = process.memoryUsage().heapUsed - h0; ok(dh < 64 * 1024, 'no allocation per step (200 000 steps)', (dh / 1024).toFixed(1) + ' KB'); }

// ── 2. bloom ──
for (const id of Object.keys(CS2)) { const e = entryOf(id), b = X.bloomOf(e.bloom, e.tone, 1), want = e.bloom.m_blendMode === 'BLOOM_BLEND_ADD' ? e.bloom.m_flBloomStrength : e.bloom.m_flScreenBloomStrength;
  ok(b.strength === want && b.strength === CS2[id].bloom && b.screen === (CS2[id].blend === 'SCREEN'), `${id}: bloom ${CS2[id].blend} ${CS2[id].bloom} = its .vpost CBloomLayer`, b.strength + ' ' + (b.screen ? 'SCREEN' : 'ADD'));
  ok(b.lo >= 0 && b.lo <= .92 && b.hi > b.lo && b.hi <= 1 && b.weights.length === 5, `${id}: its threshold in display values (${b.lo.toFixed(3)} → ${b.hi.toFixed(3)}), CS2's five blur weights`); }
{ const R = P.GD_PRESETS; ok(R.Ultra.bloom && R.High.bloom && R.Medium.bloom && !R.Low.bloom && !R['Very Low'].bloom, 'bloom on Medium and up, off on Low and Very Low (gd-preset.js)');
  const gx = src('graphics.js'); ok(/gdBloom = gdL && !!gdLast\.bloom/.test(gx) && /bloom\.strength = B\.strength; bloom\.threshold = B\.lo;/.test(gx) && /bm\.blendSrc = THREE\.OneMinusDstColorFactor; bm\.blendDst = THREE\.OneFactor;/.test(gx), 'graphics.js: the GD bloom takes the map\'s strength, threshold and SCREEN blend (1 − (1 − a)(1 − b))');
  ok(/bloom\.strength = \.32; bloom\.radius = \.45; bloom\.threshold = 1\.05;/.test(gx), 'graphics.js: everywhere else the game\'s own glow as before (.32 / .45 / 1.05)'); }

// ── 3. the baked map's lights ──
{ const cr = src('cs2-render.js'), gx = src('graphics.js');
  ok(X.BAKED_LIGHT_N === 6 && X.BAKED_LIGHTS_U.uBPLp.value.length === 6 && X.BAKED_LIGHTS_U.uBPLc.value.length === 6, 'a fixed 6 light slots (uniform arrays made once)');
  ok(/'uniform vec4 uBPLp\[ ' \+ BAKED_LIGHT_N \+ ' \]; uniform vec3 uBPLc\[ ' \+ BAKED_LIGHT_N \+ ' \];/.test(cr) && /for \( int i = 0; i < ' \+ BAKED_LIGHT_N \+ '; i \+\+ \)/.test(cr) && /\+ gdPoints\( bakedN \) \)/.test(cr), 'the baked shaders (light map and vertex light) add the six lights: the count is fixed from load — no program change when a fire or a shot lights up');
  const fn = /function gdLights\(\) \{[\s\S]*?\n/.exec(gx)?.[0] || ''; ok(fn && !/new |\[\]|\{ *\}|=>/.test(fn.replace(/^function gdLights\(\) \{/, '')), 'graphics.js gdLights: copies the pool into the slots without allocating');
  ok(/if \(gdLast && scene\.userData\.baked\) gdLights\(\);/.test(gx), 'graphics.js: only in a GD match on a baked map'); }

// ── 4. SSAO ──
{ const R = P.GD_PRESETS; ok(R.Ultra.ssao && R.High.ssao && !R.Medium.ssao && !R.Low.ssao && !R['Very Low'].ssao, 'SSAO only on High and Ultra (gd-preset.js)');
  const gx = src('graphics.js'); ok(/gdSsao = gdL && !!gdLast\.ssao/.test(gx) && /if \(gdSsao\) composer\.addPass\(gdSsaoPass = new SSAOPass\(camera\)\);/.test(gx) && /gdSsaoPass\?\.warm\(renderer, composer\.renderTarget2\)/.test(gx), 'graphics.js: the SSAO pass only when the preset has it, warmed when the composer is built');
  ok(S.SSAO.scale === .5 && S.SSAO.samples === 8, 'SSAO at half resolution, 8 taps');
  // v53 LOOK review fix (high): the smoke after SSAO must read THIS frame's scene depth. The real EffectComposer and
  // SSAOPass with a recording renderer, in graphics.js's order (scene → SSAO → smoke): the smoke's readBuffer must be the
  // buffer the scene drew into, and nothing may clear it in between.
  { const THREE = await import('../dist/three.module.js'), { EffectComposer } = await import('../dist/post/EffectComposer.js'); const log = []; let target = null;
    const r = { autoClear: true, getSize: v => v.set(800, 600), getPixelRatio: () => 1, getRenderTarget: () => target, setRenderTarget: t => { target = t; }, render: () => { log.push({ to: target?.name || 'ao', clears: r.autoClear }); }, getDrawingBufferSize: v => v.set(800, 600), getContext: () => ({}), capabilities: {} };
    const c = new EffectComposer(r, new THREE.WebGLRenderTarget(800, 600)); c.renderTarget1.name = 'rt1'; c.renderTarget2.name = 'rt2'; for (const t of [c.renderTarget1, c.renderTarget2]) t.depthTexture = new THREE.DepthTexture(800, 600);
    let scene = null, smoke = null; c.addPass({ enabled: true, needsSwap: false, clear: true, renderToScreen: false, setSize() {}, render(rr, w, rb) { scene = rb.name; } });
    const pass = new S.SSAOPass(new THREE.PerspectiveCamera()); c.addPass(pass); c.addPass({ enabled: true, needsSwap: true, clear: false, renderToScreen: false, setSize() {}, render(rr, w, rb) { smoke = rb.name; } }); c.render(1 / 60);
    const intoScene = log.filter(e => e.to === scene);
    ok(smoke === scene && intoScene.length === 1 && intoScene.every(e => !e.clears) && !pass.needsSwap && r.autoClear === true, 'SSAO draws into the scene\'s own buffer without clearing it and swaps nothing: the smoke reads this frame\'s scene depth', JSON.stringify({ scene, smoke, log }));
    const m = pass.compM; ok(m.blending === THREE.CustomBlending && m.blendSrc === THREE.ZeroFactor && m.blendDst === THREE.SrcColorFactor && m.blendSrcAlpha === THREE.ZeroFactor && m.blendDstAlpha === THREE.OneFactor && !m.depthWrite && !/tColor/.test(m.fragmentShader), 'SSAO: a multiply blend (frame × AO, alpha kept), no depth write, never sampling the buffer it draws into'); pass.dispose(); } }
// ── 4b. Medium's anti-aliasing (v53 LOOK review fix, medium): a composer made only for the map's look smooths its edges in
// its output pass (FXAA: 4× MSAA on the half-float buffer halved Medium's fps at real size); every other composer as before ──
{ const gx = src('graphics.js'), F = await import('../dist/gd-fxaa.js'); globalThis.self ??= globalThis;
  ok(/const gdFx = gdL && !gdSharp && !G\.glow && !G\.aa && !!renderer\.getContextAttributes\?\.\(\)\?\.antialias;/.test(gx) && /gdSharp \? new SharpenOutputPass\(\) : gdFx \? new FxaaOutputPass\(\)/.test(gx) && /samples: G\.aa \}\);/.test(gx) && /gdFxOn !== gdFx/.test(gx), 'Medium (no glow, no sharpen, no MSAA): the look\'s composer ends in the FXAA output pass; its buffer keeps G.aa (0), as every other composer');
  const p = new F.FxaaOutputPass(), fs = p.material.fragmentShader; ok(/uniform vec2 uTexel;/.test(fs) && /\( lB < lMin \|\| lB > lMax \) \? a : b/.test(fs) && !/gl_FragColor = texture2D\( tDiffuse, vUv \);/.test(fs) && /toneMapping|TONE_MAPPING|LinearToneMapping/.test(fs) && /sRGBTransferOETF|SRGB_TRANSFER/.test(fs), 'the FXAA pass: the edge blend in place of the plain read, then OutputPass\'s own tone mapping and sRGB output'); p.dispose();
  ok(/bloom\.bloomTintColors = B\.tints \|\| bloomBase\.t;/.test(gx) && /bloom\.bloomTintColors = bloomBase\.t;/.test(gx) && !/cu\.bloomTintColors\.value = /.test(gx), "the map's m_vBlurTint set where UnrealBloomPass reads it (bloom.bloomTintColors: it re-sets the uniform every render)"); }

// ── 5. agents ──
{ const a = src('cs2-agents.js'); ok(/const readableKey = \(\) => 'rim-1-gdsat';/.test(a) && /SAT_LIFT = 1\.12, SHADE_FLOOR = \.36/.test(a) && /Math\.max\(SHADE_FLOOR, \.3 \+ \.75 \* l\)/.test(a), 'agents: a slight saturation lift (1.12) and a raised tunnel floor (0.36), one shared program key'); }

console.log(bad ? `FAIL: gd-look · ${bad} of ${n}` : `PASS: gd-look · ${n} checks (CS2 auto exposure in each map's range and frame-rate independent, bloom per .vpost on Medium+, 6 fixed baked lights, SSAO on High/Ultra, agents' lift)`);
if (bad) process.exit(1);
