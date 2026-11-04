// v53 LOOK · the CS2 maps' look in the real game (spec 4.1: CS2's auto exposure and bloom from each map's own files, SSAO
// on High / Ultra, the fire's and guns' lights on the baked map), muted, at the user's real size (1470 × 956 at 2×).
// For each preset (default High, Low) and each map (default the 7 CS2 maps): a solo Defuse match with 2 bots, at freeze
// time the spawn view (after 2.5 s: the exposure settles), then turned 180° (3 s more) — a picture of each, the composer's
// passes, the adapted exposure (the 1 × 1 target read back by THIS TEST only: the game never reads it), the map's range
// and bloom, and the programs linked after the first picture (must be 0: nothing compiled after the loading card).
//   node tests/browser/gd-look-shots.mjs <repo> <out> [presets=High,Low] [maps=dust2,mirage,inferno,nuke,anubis,ancient,overpass] [dsf=2] [w=2940] [h=1912]
// Writes <out>/<preset>-<map>-<view>.png and <out>/report.json. Gates: no page error, every exposure inside its map's
// range (HLSL clamp), the GD passes as the preset says (SSAO only on High / Ultra; bloom on Medium+ when the map's
// strength > 0; exposure on every GPU preset), 0 programs linked after the first picture.
import { chromium } from 'playwright-core'; import { writeFileSync, mkdirSync } from 'node:fs';
const [root, out, presetsArg = 'High,Low', mapsArg = 'dust2,mirage,inferno,nuke,anubis,ancient,overpass', dsfArg = '2', wArg = '2940', hArg = '1912'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const dsf = +dsfArg, W = +wArg, H = +hArg, presets = presetsArg.split(','), maps = mapsArg.split(',');
const { startRoom } = await import(root + '/lan/room.mjs');
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: '/tmp/gd-look-' + Date.now() + '.json', roomCode: 'GDLOOK', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--use-angle=metal'] });
let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const report = {};
const state = p => p.evaluate(async () => { const I = __infra, X = await import('/gd-exposure.js'), THREE = await import('/three.module.js'), pass = I.gfx.passes.find(x => x.isGdExposure);
  let E = null; if (pass && X.EXPOSURE_U.uExpOn.value) { const t = pass.e[pass.i], buf = new Float32Array(4); I.renderer.readRenderTargetPixels(t, 0, 0, 1, 1, buf); E = [...buf].map(v => +v.toFixed(4)); }
  const L = X.GD_LOOK; return { passes: I.gfx.passes.map(x => (x.constructor?.name || '?') + (x.enabled === false ? '(off)' : '')), E, look: { id: L.id, lo: L.lo, hi: L.hi, up: L.up, down: L.down, use: L.use, bloom: L.bloom && { screen: L.bloom.screen, strength: L.bloom.strength, lo: +L.bloom.lo.toFixed(3), hi: +L.bloom.hi.toFixed(3) } },
    bloom: (() => { const bp = I.gfx.passes.find(x => x.constructor?.name === 'UnrealBloomPass'); return bp ? { on: bp.enabled, strength: bp.strength, threshold: +bp.threshold.toFixed(3), blend: bp.blendMaterial.blending } : null; })(),
    lights: X.BAKED_LIGHTS_U.uBPLp.value.filter(v => v.w > 0).length, links: globalThis.__links.length, baked: !!I.scene.userData.baked, preset: I.scene.userData.gdPreset?.name || null }; });
for (const preset of presets) {
  const ctx = await b.newContext({ viewport: { width: Math.round(W / dsf), height: Math.round(H / dsf) }, deviceScaleFactor: dsf });
  for (const map of maps) {
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.addInitScript(preset => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Looker'); localStorage.setItem('infra-face-name', 'Looker'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', gdPreset: preset }));
      const L = globalThis.__links = []; const f = WebGL2RenderingContext.prototype.linkProgram; WebGL2RenderingContext.prototype.linkProgram = function (x) { L.push(performance.now()); return f.call(this, x); }; }, preset);
    const r = report[preset + '-' + map] = { preset, map };
    try {
      await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
      await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
      await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', map); await p.selectOption('#ss-ar-bots', '2'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
      await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.looker, null, { timeout: 400000 });
      await p.keyboard.press('Escape'); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
      const act = action => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).then(r => r, e => ({ error: String(e?.message || e) })), action);
      await act({ type: 'restart' }); await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 60000 }).catch(() => {});
      await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
      if (process.env.PROBE) { const ser = []; for (let i = 0; i < 12; i++) { await p.waitForTimeout(500); const s2 = await state(p); ser.push([s2.E?.[0], s2.E?.[2], await p.evaluate(() => __infra.renderer.info.render.frame)]); } console.log('PROBE', JSON.stringify(ser)); }
      await p.waitForTimeout(2500); r.v1 = await state(p); await p.evaluate(() => __infra.lab.arenaUI?.buy?.(false)); await p.waitForTimeout(150); /* (the buy menu can open itself at the round's start: closed for the picture) */ await p.screenshot({ path: `${out}/${preset.replace(/\s+/g, '')}-${map}-1.png` });
      await p.evaluate(() => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()); __infra.lab.look(c.position.x, c.position.z, c.position.x - d.x * 50, c.position.y + d.y * 50, c.position.z - d.z * 50, c.position.y); });
      await p.waitForTimeout(3000); r.v2 = await state(p); await p.evaluate(() => __infra.lab.arenaUI?.buy?.(false)); await p.waitForTimeout(150); /* (the buy menu can open itself at the round's start: closed for the picture) */ await p.screenshot({ path: `${out}/${preset.replace(/\s+/g, '')}-${map}-2.png` });
      if (process.env.PICK) console.log('PICK', JSON.stringify(await p.evaluate(async xy => { const THREE = await import('/three.module.js'), I = __infra, rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(xy[0], xy[1]), I.camera); rc.layers.enableAll();
        return rc.intersectObjects(I.scene.children, true).slice(0, 8).map(h => { const m = [].concat(h.object.material)[0]; let q = h.object, path = []; while (q && q !== I.scene) { path.push(q.name || q.type); q = q.parent; } return { d: +h.distance.toFixed(2), path: path.slice(0, 4).join('<'), mat: m?.type + ' ' + (m?.name || '') + ' vis:' + h.object.visible + ' col:' + m?.color?.getHexString?.() + ' map:' + !!m?.map + ' blend:' + m?.blending + ' tr:' + m?.transparent, layers: h.object.layers.mask }; }); }, process.env.PICK.split(',').map(Number))));   // (PICK=x,y in NDC: what is drawn there — debugging)
      if (process.env.ABLATE) for (const name of ['SSAOPass', 'UnrealBloomPass', 'ExposurePass']) { await p.evaluate(n => { for (const x of __infra.gfx.passes) x.enabled = x.constructor?.name !== n && !(x.constructor?.name === 'Object'); }, name); await p.waitForTimeout(800); await p.screenshot({ path: `${out}/${preset.replace(/\s+/g, '')}-${map}-2-no${name}.png` }); await p.evaluate(() => { for (const x of __infra.gfx.passes) if (x.constructor?.name !== 'Object') x.enabled = true; }); }   // (ABLATE=1: one GD pass off at a time — debugging)
      r.linkedAfterFirst = r.v2.links - r.v1.links; r.errors = errs.slice(0, 3);
      const lo = Math.min(r.v1.look.lo, r.v1.look.hi), hi = Math.max(r.v1.look.lo, r.v1.look.hi), inR = e => !e || (e[0] >= lo - .002 && e[0] <= hi + .002);
      check(`${preset} ${map}: no page error`, !errs.length, errs[0]); check(`${preset} ${map}: exposure inside [${r.v1.look.lo}, ${r.v1.look.hi}]`, inR(r.v1.E) && inR(r.v2.E) && !!r.v1.E, JSON.stringify([r.v1.E, r.v2.E]));
      const ssao = r.v1.passes.some(x => x.startsWith('SSAOPass')), wantSsao = /^(High|Ultra)$/.test(preset); check(`${preset} ${map}: SSAO ${wantSsao ? 'on' : 'off'}`, ssao === wantSsao && r.v1.baked, r.v1.passes.join(' '));
      const wantBloom = !/Low/.test(preset) && r.v1.look.bloom?.strength > 0; check(`${preset} ${map}: CS2 bloom ${wantBloom ? r.v1.look.bloom.strength : 'off'}`, wantBloom ? r.v1.bloom?.on && Math.abs(r.v1.bloom.strength - r.v1.look.bloom.strength) < 1e-9 : !r.v1.bloom?.on, JSON.stringify(r.v1.bloom));
      check(`${preset} ${map}: 0 programs linked after the first picture`, r.linkedAfterFirst === 0, r.linkedAfterFirst);
      // (v53 LOOK review fix, high: SSAO had handed the smoke a cleared depth buffer.) The smoke's pass forced on for a few
      // frames (no cloud: it composites the frame unchanged) and the depth it is given sampled on the GPU — this frame's
      // scene depth (a view of floor and walls: most samples nearer than the far plane), with SSAO on High. Its sampling
      // program is this test's own, built AFTER the link count above. Also the buffer's MSAA (0: Medium's edges by FXAA).
      r.smokeDepth = await p.evaluate(async () => { const THREE = await import('/three.module.js'), I = __infra, sm = I.scene.userData.gdSmoke; if (!sm) return null;
        const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType, depthBuffer: false }), qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const mat = new THREE.ShaderMaterial({ uniforms: { tD: { value: null } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }', fragmentShader: 'uniform sampler2D tD; varying vec2 vUv; void main() { gl_FragColor = vec4( texture2D( tD, 0.2 + 0.6 * vUv ).x, 0.0, 0.0, 1.0 ); }', depthTest: false, depthWrite: false });
        qs.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)); const act = sm.active, comp = sm.composite; let got = null;
        sm.active = () => true; sm.composite = (r, w, rb) => { if (!got && rb.depthTexture) { const was = r.getRenderTarget(); mat.uniforms.tD.value = rb.depthTexture; r.setRenderTarget(rt); r.render(qs, qc); r.setRenderTarget(was); const buf = new Float32Array(8 * 8 * 4); r.readRenderTargetPixels(rt, 0, 0, 8, 8, buf); const d = []; for (let i = 0; i < 64; i++) d.push(buf[i * 4]); got = { near: d.filter(v => v < .99999).length, min: Math.min(...d), samples: rb.samples, ssao: I.gfx.passes.some(x => x.isGdSsao) }; } return comp(r, w, rb); };
        try { for (let i = 0; i < 6 && !got; i++) await new Promise(f => requestAnimationFrame(f)); } finally { sm.active = act; sm.composite = comp; rt.dispose(); mat.dispose(); } return got; });
      check(`${preset} ${map}: the smoke reads this frame's scene depth${wantSsao ? ' with SSAO on' : ''} (of 64 samples nearer than the far plane)`, r.smokeDepth && r.smokeDepth.near >= 32 && r.smokeDepth.ssao === wantSsao, JSON.stringify(r.smokeDepth));
      if (preset === 'Medium') check(`Medium ${map}: the look's composer ends in the FXAA output pass (Medium's edges; no MSAA buffer)`, r.v1.passes.at(-1) === 'FxaaOutputPass' && r.smokeDepth?.samples === 0, r.v1.passes.join(' ') + ' · samples ' + r.smokeDepth?.samples);
      console.log(JSON.stringify({ preset, map, E: [r.v1.E?.[0], r.v2.E?.[0]], L: [r.v1.E?.[2], r.v2.E?.[2]], range: [r.v1.look.lo, r.v1.look.hi], bloom: r.v1.bloom, lights: r.v1.lights }));
    } catch (e) { r.error = String(e?.message || e); check(`${preset} ${map}: ran`, false, r.error); }
    await p.close();
  }
  await ctx.close();
}
writeFileSync(out + '/report.json', JSON.stringify(report, null, 1)); await b.close(); room.close?.();
console.log(failed ? `FAIL: gd-look-shots · ${failed} checks` : 'PASS: gd-look-shots'); process.exit(failed ? 1 : 0);
