// Global Defensive's graphics presets in a real match (v53 stage 6, spec §5.5) — an EMULATION on this Mac, never a Windows
// measurement: each preset (High, Medium, Low, Very Low) on the same map and view, solo Defuse on Dust II with 9 bots
// (10 players), $16000, the four grenades bought; at freeze time a picture of the view with the performance overlay (F9:
// fps, frame-time percentiles, draw calls, triangles, texture memory, the preset), then a measured fight: you strafe and
// fire, throw a grenade every 4 s, the bots fight. Frames as frame-pacing.mjs counts them (gfx.render, the page's own
// clock), draw calls per frame (renderer.info: the whole frame in GD), programs linked after the fight began.
//   node tests/browser/gd-presets.mjs <repo> <out> [presets=High,Medium,Low,Very Low] [throttle=1] [seconds=16] [dsf=2] [w=2940] [h=1912]
//   SOFT=1  the software tier: Chrome's SwiftShader (--use-angle=swiftshader), 1280 × 720 at dsf 1, the preset left on Auto
//           (no setting saved: the page must pick Very Low by itself — its renderer string and probe), labelled so.
//   RECORD=1  also writes tests/data/gd-presets-result.json (read by tests/gd-low-preset.mjs: the Low draw-call budget).
//   STAGE=0   skip the staged fight (below).
// THE STAGED FIGHT (spec §5.2 "< 400 draw calls in a full 10-player fight on Low"; review: the spawn-view fight above has few
// players in view): the round restarted, then in the live round all 9 bots held in an arc in front of you, 4–15 m away
// (25–90 units, ±6–24° off the crosshair, so your own fire passes between them), every body kept at 100 HP and up (the
// host's record, this test's in-process room), the bots shooting at you, you firing and an HE thrown — draw calls per frame
// (p50 / p95 / max), the agents this computer draws in the view, and draws per agent over the freeze-time view.
// Default size: the user's Retina MacBook window, 1470 × 956 at 2× (memory rule: measure at real size).
// Muted: run through bt2.sh (its Chrome adds --mute-audio). Gates: Low < 400 draw calls (max) in the staged fight (p95 in
// the spawn fight), no program linked in either fight, the software run on Very Low (Auto) — fps reported (a target, not
// a gate: emulation).
import { chromium } from 'playwright-core'; import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
const [root, out, presetsArg = 'High,Medium,Low,Very Low', throttle = '1', seconds = '16', dsfArg = '2', wArg = '2940', hArg = '1912'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const SOFT = !!process.env.SOFT, dsf = SOFT ? 1 : +dsfArg, W = SOFT ? 1280 : +wArg, H = SOFT ? 720 : +hArg, presets = SOFT ? ['auto'] : presetsArg.split(',');
const label = SOFT ? 'SwiftShader software GPU on an M3 Mac (emulated)' + (+throttle > 1 ? ', CPU ×' + throttle : '') : +throttle > 1 ? 'CPU ×' + throttle + ' on an M3 Mac (emulated)' : 'Apple M3 Mac, Metal (not Windows)';
// (the room in this process — as gd-death-shots.mjs — so the staged fight can hold the host's bots where it wants them)
const { startRoom } = await import(root + '/lan/room.mjs');
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: '/tmp/gd-presets-' + Date.now() + '.json', roomCode: 'PRESET', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, hostGame = () => room.world.operations.game, server = { kill() { room.close?.().catch?.(() => {}); } };
const STAGE = process.env.STAGE !== '0';
const args = ['--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows']
  .concat(SOFT ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal']);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args });
const POSE = out + '/pose.json'; let pose = existsSync(POSE) ? JSON.parse(readFileSync(POSE, 'utf8')) : null;
const results = {};
for (const preset of presets) {
  const ctx = await b.newContext({ viewport: { width: Math.round(W / dsf), height: Math.round(H / dsf) }, deviceScaleFactor: dsf }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([preset, label]) => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Pacer'); localStorage.setItem('infra-face-name', 'Pacer');
    if (preset !== 'auto') localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', gdPreset: preset, gdPerf: true })); else localStorage.setItem('infra-player-preferences', JSON.stringify({ gdPerf: true }));
    globalThis.__gdEmulation = label;
    const L = globalThis.__links = []; const f = WebGL2RenderingContext.prototype.linkProgram; WebGL2RenderingContext.prototype.linkProgram = function (x) { L.push(performance.now()); return f.call(this, x); }; }, [preset, label]);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  // the detection runs while the Global Defensive panel is open (Auto): wait for it (≤ 6 s) on the software run
  if (preset === 'auto') await p.waitForFunction(() => { try { return !!JSON.parse(localStorage.getItem('infra-gd-device') || '{}').preset; } catch { return false; } }, null, { timeout: 20000 }).catch(() => {});
  const device = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('infra-gd-device') || 'null'); } catch { return null; } });
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '9'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.pacer, null, { timeout: 400000 });
  await p.keyboard.press('Escape'); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  const act = action => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).then(r => r, e => ({ error: String(e?.message || e) })), action);
  await act({ type: 'settings', rules: { start: 16000 } }); await act({ type: 'restart' });
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const team = await p.evaluate(() => __infra.lab.world.operations.game.combat?.d?.teams?.pacer);
  const kinds = ['smoke', team === 'ct' ? 'incendiary' : 'molotov', 'he', 'flash']; for (const k of kinds) await act({ type: 'buy-nade', kind: k });
  await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  // the same view in every run: the first run's spawn view (position and look) kept in pose.json
  const here = await p.evaluate(() => { const c = __infra.camera; return { x: c.position.x, y: c.position.y, z: c.position.z, q: c.quaternion.toArray() }; });
  if (!pose) { pose = here; writeFileSync(POSE, JSON.stringify(pose)); }
  const same = Math.hypot(here.x - pose.x, here.z - pose.z) < 1 && here.q.every((v, i) => Math.abs(v - pose.q[i]) < 1e-3);
  await p.waitForTimeout(1500);
  const view = await p.evaluate(() => { const I = __infra, r = I.renderer, ov = document.getElementById('gd-perf'); return { overlay: ov && !ov.hidden ? ov.innerText : null, ratio: +r.getPixelRatio().toFixed(3), buffer: [r.domElement.width, r.domElement.height], post: I.gfx.post, passes: I.gfx.passes.map(x => x.constructor?.name + (x.enabled === false ? '(off)' : '')), shadows: r.shadowMap.enabled, gdLo: document.body.classList.contains('gd-lo'), blur: getComputedStyle(document.querySelector('.ke-bd') || document.body).backdropFilter }; });
  // TRIS=1: the triangles a frame draws, by top-level object (what the software renderer pays per vertex)
  if (process.env.TRIS) console.log('TRIS ' + preset + ' ' + JSON.stringify(await p.evaluate(() => { const I = __infra, sc = I.scene, only = sc.userData.renderOnly, by = {};
    for (const top of sc.children) { if (only && !only(top)) continue; let t = 0, m = 0; top.traverseVisible(o => { if (!o.isMesh) return; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3, k = o.isInstancedMesh ? o.count : 1; t += n * k; m++; });
      const key = (top.name || top.type) + (top.userData?.gd ? '' : ''); by[key] = by[key] || [0, 0]; by[key][0] += t; by[key][1] += m; }
    return Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 14).map(([k, v]) => [k, Math.round(v[0] / 1000) + 'k', v[1]]); })));
  // TEXLIST=1: the biggest textures the scene holds (what the texture memory is made of), by where they hang
  if (process.env.TEXLIST) console.log('TEXLIST ' + preset + ' ' + JSON.stringify(await p.evaluate(() => { const seen = new Map(), I = __infra;
    const where = o => { let q = o, s = ''; while (q && q.parent && q.parent !== I.scene) q = q.parent; return (q?.name || q?.type || '?') + (q?.userData?.gd ? '' : ''); };
    I.scene.traverse(o => { for (const m of [].concat(o.material || [])) { for (const k in m) { const t = m[k]; if (!t?.isTexture || t.isRenderTargetTexture) continue; const src = t.source || t; if (seen.has(src)) continue; const w = t.image?.width || 0, h = t.image?.height || 0, d = t.isData3DTexture ? t.image?.depth || 1 : 1; seen.set(src, { b: w * h * d * 4 * (t.type === 1015 ? 4 : t.type === 1016 ? 2 : 1) * (t.generateMipmaps !== false ? 4 / 3 : 1), wh: w + 'x' + h + (d > 1 ? 'x' + d : ''), k, top: where(o) + (w * h >= 1 << 22 ? ' [' + (o.name || '') + '/' + (o.parent?.name || '') + '/' + (m.name || '') + ']' : ''), m: m.name || m.type }); } if (m.uniforms) for (const u in m.uniforms) { const t = m.uniforms[u]?.value; if (!t?.isTexture || t.isRenderTargetTexture) continue; const src = t.source || t; if (seen.has(src)) continue; const w = t.image?.width || 0, h = t.image?.height || 0; seen.set(src, { b: w * h * 4 * (t.type === 1015 ? 4 : t.type === 1016 ? 2 : 1) * (t.generateMipmaps !== false ? 4 / 3 : 1), wh: w + 'x' + h, k: 'u.' + u, top: where(o), m: m.name || m.type }); } } });
    const all = [...seen.values()], by = {}; for (const e of all) { const g = e.top + ' ' + e.k + ' ' + e.wh; by[g] = by[g] || [0, 0]; by[g][0] += e.b; by[g][1]++; }
    return { totalMB: Math.round(all.reduce((a, e) => a + e.b, 0) / 1048576), n: all.length, groups: Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 18).map(([g, v]) => [g, Math.round(v[0] / 1048576) + ' MB', v[1]]) }; })));
  const shot = out + '/preset-' + preset.replace(/\s+/g, '') + (SOFT ? '-soft' : '') + '.png'; await p.screenshot({ path: shot });
  // the fight (the overlay off while measured — F9 — and on again at the end to read it)
  await p.keyboard.press('F9');
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 40000 }).catch(() => {});
  await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
  await p.evaluate(() => { const I = __infra, g = I.gfx, f = g.render, T = globalThis.__G = { on: false, t: [], d: [], tri: [], t0: 0, l0: 0 }; let last = 0; g.render = function () { const out = f.apply(this, arguments); if (T.on) { const now = document.timeline.currentTime ?? performance.now(); if (last) { T.t.push([now - T.t0, now - last]); T.d.push(I.renderer.info.render.calls); T.tri.push(I.renderer.info.render.triangles); } last = now; } return out; };
    T.start = () => { T.t = []; T.d = []; T.tri = []; T.t0 = performance.now(); T.l0 = globalThis.__links.length; last = 0; T.on = true; }; T.start(); });
  const throwOne = kind => p.evaluate(kind => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()).normalize(); return __infra.lab.lan.act({ type: 'arena', action: { type: 'throw', kind, x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: Math.max(d.y, .15), dz: d.z, strength: 'long', vx: 0, vy: 0, vz: 0 } }).then(r => r, e => ({ error: String(e?.message || e) })); }, kind);
  const thrown = []; const t0 = Date.now(); let k = 0, next = 1500, ki = 0;
  while (Date.now() - t0 < +seconds * 1000) { const key = k++ % 4 < 2 ? 'KeyA' : 'KeyD'; await p.keyboard.down(key); await p.mouse.move(600, 400); await p.mouse.down(); await p.waitForTimeout(400); await p.mouse.up(); await p.keyboard.up(key);
    if (Date.now() - t0 > next && ki < kinds.length) { const r = await throwOne(kinds[ki]); thrown.push([kinds[ki], r?.error || 'ok']); ki++; next += 4000; } await p.waitForTimeout(200); }
  await p.evaluate(() => { __G.on = false; }); await p.keyboard.press('F9'); await p.waitForTimeout(600);
  const T = await p.evaluate(() => { __G.on = false; const C = __infra.lab.world.operations.game.combat, ov = document.getElementById('gd-perf'); return { t: __G.t, d: __G.d, tri: __G.tri, links: globalThis.__links.length - __G.l0, ratio: +__infra.renderer.getPixelRatio().toFixed(3), buffer: [__infra.renderer.domElement.width, __infra.renderer.domElement.height], alive: Object.keys(C?.d?.teams || {}).length, overlay: ov && !ov.hidden ? ov.innerText : null }; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const all = T.t.map(x => x[1]), after = T.t.filter(x => x[0] > 3000).map(x => x[1]), s = [...all].sort((a, c) => a - c), q = k2 => +s[Math.min(s.length - 1, Math.floor(s.length * k2))].toFixed(1);
  const ds = [...T.d].sort((a, c) => a - c), dq = k2 => ds[Math.min(ds.length - 1, Math.floor(ds.length * k2))];
  const r = { preset, device, label, same_view: same, view, frames: all.length, fps: +(all.length / ((T.t.at(-1)[0] - T.t[0][0]) / 1000)).toFixed(1), median: q(.5), p95: q(.95), p99: q(.99), max: q(1), over50: all.filter(x => x > 50).length, over100After3s: after.filter(x => x > 100).length,
    drawsP50: dq(.5), drawsP95: dq(.95), drawsMax: ds.at(-1), trisMax: Math.max(...T.tri), programsInFight: T.links, fightRatio: T.ratio, fightBuffer: T.buffer, players: T.alive, thrown, overlayFight: T.overlay, errors: errs.slice(0, 3), shot };
  results[preset] = r; console.log(JSON.stringify({ ...r, view: { ...r.view, overlay: undefined }, overlayFight: undefined }));
  console.log('  overlay at the end of the fight:\n    ' + String(T.overlay || '(none)').replace(/\n/g, '\n    '));
  if (STAGE) r.staged = await staged(p, act, cdp, r);
  await ctx.close();
}
// The staged fight (see the top): returns its numbers, or { error }.
async function staged(p, act, cdp, r) {
  const me = 'pacer', G = hostGame(); await act({ type: 'restart-round' });
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 30000 }).catch(() => {});
  await act({ type: 'buy-nade', kind: 'he' }); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  const freezeDraws = await p.evaluate(() => new Promise(res => { const I = __infra, a = []; const t = setInterval(() => { a.push(I.renderer.info.render.calls); if (a.length >= 10) { clearInterval(t); a.sort((x, y) => x - y); res(a[5]); } }, 100); }));
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 40000 }).catch(() => {});
  await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  const cam = await p.evaluate(() => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()); return { x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dz: d.z }; });
  const bots = (G.arena?.bots || []).slice(0, 9), C = G.combat; if (!bots.length || !C) return { error: 'no bots / combat' };
  const h = Math.hypot(cam.dx, cam.dz) || 1, fx = cam.dx / h, fz = cam.dz / h, feet = cam.y - 64 * 2.54 / 16.5;   // (CS2's standing eye, 64 HU)
  const spots = bots.map((b, i) => { const side = i % 2 ? 1 : -1, ang = side * (6 + (i >> 1) * 4.5) * Math.PI / 180, dist = 25 + i * 8, c = Math.cos(ang), sn = Math.sin(ang);
    const dx = fx * c - fz * sn, dz = fx * sn + fz * c; return { x: cam.x + dx * dist, z: cam.z + dz * dist, y: feet, yaw: Math.atan2(dx, dz) }; });
  const keyOf = n => String(n).trim().toLowerCase();
  const up = k => { if (C.hp) C.hp[k] = 100; if (C.down?.[k]) delete C.down[k]; };   // (100 HP, and a body a burst killed within one 10 ms step up again: as the host's own respawn does)
  const hold = () => { bots.forEach((b, i) => { const q = spots[i]; b.x = q.x; b.z = q.z; b.y = q.y; up(keyOf(b.name)); }); up(me); };
  hold(); const pin = setInterval(hold, 10);
  try {
    await p.waitForTimeout(1500);
    const seen = () => p.evaluate(() => { const I = __infra, c = I.camera; let n = 0, all = 0;   /* (a model counts when its chest projects inside the view) */
      const m4 = c.projectionMatrix.clone().multiply(c.matrixWorldInverse), e = m4.elements; for (const m of (I.lab.lan.models || new Map()).values()) { if (!m?.g) continue; all++; if (!m.g.visible) continue; const P = m.g.position, x = P.x, y = P.y + 5, z = P.z;
        const cw = e[3] * x + e[7] * y + e[11] * z + e[15]; if (cw <= 0) continue; const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / cw, cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw; if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) n++; } return { inView: n, models: all }; });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
    await p.evaluate(() => __G.start()); const vis = [], t0 = Date.now(); let k = 0, threw = null;
    while (Date.now() - t0 < 8000) { await p.mouse.move(600, 400); await p.mouse.down(); await p.waitForTimeout(350); await p.mouse.up(); if (k++ % 3 === 0) vis.push(await seen());
      if (!threw && Date.now() - t0 > 3000) { const c = await p.evaluate(() => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()).normalize(); return { x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: Math.max(d.y, .15), dz: d.z }; });
        threw = await act({ type: 'throw', kind: 'he', ...c, strength: 'long', vx: 0, vy: 0, vz: 0 }); }
      await p.waitForTimeout(150); }
    const S = await p.evaluate(() => { __G.on = false; return { t: __G.t.map(x => x[1]), d: __G.d, tri: __G.tri, links: globalThis.__links.length - __G.l0 }; });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const ds = [...S.d].sort((a, c) => a - c), dq = q => ds[Math.min(ds.length - 1, Math.floor(ds.length * q))], ts = [...S.t].sort((a, c) => a - c), tq = q => +ts[Math.min(ts.length - 1, Math.floor(ts.length * q))].toFixed(1);
    const inView = Math.min(...vis.map(v => v.inView)), inViewMax = Math.max(...vis.map(v => v.inView)), down = Object.keys(C.down || {}).length;
    const o = { frames: S.t.length, fps: +(S.t.length / (S.t.reduce((a, c) => a + c, 0) / 1000)).toFixed(1), p95: tq(.95), max: tq(1), drawsP50: dq(.5), drawsP95: dq(.95), drawsMax: ds.at(-1), trisMax: Math.max(...S.tri), programsInFight: S.links,
      agentsInView: [inView, inViewMax], freezeDraws, drawsPerAgent: inViewMax ? +((dq(.5) - freezeDraws) / inViewMax).toFixed(1) : null, downAtEnd: down, he: threw?.error || 'ok' };
    console.log('STAGED ' + r.preset + ' ' + JSON.stringify(o)); return o;
  } finally { clearInterval(pin); }
}
// SHEET=<file.jpg>: the presets' pictures side by side (2 × 2), each captioned with its numbers from this run
if (process.env.SHEET && !SOFT) { const pg = await b.newPage({ viewport: { width: 1920, height: 1160 } }); const rows = Object.values(results);
  const cell = r => `<figure><img src="data:image/png;base64,${readFileSync(r.shot).toString('base64')}"><figcaption><b>${r.preset}</b> · fight ${r.fps} fps (p95 ${r.p95}, p99 ${r.p99} ms) · ${r.drawsP95} draws${r.staged && !r.staged.error ? ' (staged fight, ' + r.staged.agentsInView[1] + ' agents in view: max ' + r.staged.drawsMax + ')' : ''} · ${r.fightBuffer.join('×')} · ${r.view.passes.filter(x => !/off/.test(x)).join(' → ') || 'no post-processing'}</figcaption></figure>`;
  await pg.setContent(`<style>body{margin:0;background:#111;color:#eee;font:600 15px system-ui}main{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:6px}figure{margin:0}img{width:100%;display:block}figcaption{padding:4px 2px}h1{font-size:16px;margin:6px 8px 0}</style><h1>Infra Simulator v53 · Global Defensive graphics presets · Dust II, 10 players · EMULATION on an Apple M3 Mac (${label}), not a Windows measurement</h1><main>${rows.map(cell).join('')}</main>`);
  await pg.waitForTimeout(300); await pg.screenshot({ path: process.env.SHEET, type: 'jpeg', quality: 88, fullPage: true }); await pg.close(); console.log('SHEET ' + process.env.SHEET); }
const tag = SOFT ? 'soft' : 'hw-' + throttle + 'x';
writeFileSync(out + '/gd-presets-' + tag + '.json', JSON.stringify({ when: new Date().toISOString(), machine: label, W, H, dsf, throttle: +throttle, results }, null, 1));
if (process.env.RECORD) { mkdirSync(root + '/tests/data', { recursive: true }); const f = root + '/tests/data/gd-presets-result.json'; const prev = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { presets: {} };
  for (const [k, v] of Object.entries(results)) prev.presets[k === 'auto' ? 'software-auto' : k] = { fps: v.fps, p95: v.p95, p99: v.p99, max: v.max, drawsP95: v.drawsP95, drawsMax: v.drawsMax, trisMax: v.trisMax, programsInFight: v.programsInFight, buffer: v.fightBuffer, players: v.players, label: v.label, throttle: +throttle, size: [W, H, dsf], staged: v.staged || null };
  prev.when = new Date().toISOString().slice(0, 10); prev.machine = 'emulation on an Apple M3 Mac (not Windows)'; writeFileSync(f, JSON.stringify(prev, null, 1)); }
let ok = true; const low = results.Low; if (low) { if (!(low.drawsP95 < 400)) { ok = false; console.log('FAIL Low draw calls p95 ' + low.drawsP95 + ' ≥ 400'); }
  if (STAGE) { const st = low.staged; if (!st || st.error || !(st.drawsMax < 400) || !(st.agentsInView[1] >= 8)) { ok = false; console.log('FAIL Low staged 10-player fight: ' + JSON.stringify(st)); } } }
for (const r of Object.values(results)) { if (r.programsInFight > 0) { ok = false; console.log('FAIL ' + r.preset + ': ' + r.programsInFight + ' programs linked in the fight'); } if (r.staged?.programsInFight > 0) { ok = false; console.log('FAIL ' + r.preset + ': ' + r.staged.programsInFight + ' programs linked in the staged fight'); } }
if (SOFT) { const r = results.auto; if (r.device?.preset !== 'Very Low' || r.device?.tier !== 'software') { ok = false; console.log('FAIL software run: detected ' + JSON.stringify(r.device)); } }
console.log((ok ? 'PASS' : 'FAIL') + ' GD presets (' + label + '): ' + Object.values(results).map(r => r.preset + ' ' + r.fps + ' fps p95 ' + r.p95 + ' p99 ' + r.p99 + ' max ' + r.max + ' ms, draws p95 ' + r.drawsP95 + ', ' + r.fightBuffer.join('×')).join(' · '));
await b.close(); server.kill(); process.exit(ok ? 0 : 1);
