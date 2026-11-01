// Global Defensive's CS2-style video settings (package A, v52) in a solo match at 1920×1080 and 1366×768 windows: Native (v51's
// sizing), 4:3 stretched, 4:3 black bars, 16:9 and 16:10 — the drawing buffer (the chosen resolution × the dynamic resolution's
// scale), the canvas's CSS box (stretched: the whole window; bars: the ratio centred), the camera (aspect = the picture's ratio,
// CS2's vertical FOV 73.74°: 90° across 4:3, 106.26° across 16:9, 100.39° across 16:10), the HUD inside the picture (bars) and
// not stretched (the crosshair alone stretched sideways in stretched, as CS2's), the menus (buy, scoreboard, Settings) inside
// the black-bars box, the aim ray through the crosshair, back to Native exactly as before. Perf: the frame cost per size is
// reported (no gate: see gpuFrame), and the F9 overlay names the buffer drawn.
// Screenshots: <out>/aspect-*.jpg (the sheet ~/Desktop/GD-v52-aspect-ratios.jpg is made from them).
//   node tests/browser/gd-aspect-e2e.mjs <repo-root> <out-dir> [headless=1]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out, ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const O = Object.fromEntries(rest.map(a => a.split('=')));
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'ASPC01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'as-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: O.headless === '1', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); }; const errs = [], shots = [], perf = {};
const near = (a, b, e) => Math.abs(a - b) <= e;
const VFOV = 2 * Math.atan(.75) * 180 / Math.PI, hfov = a => 2 * Math.atan(Math.tan(VFOV * Math.PI / 360) * a) * 180 / Math.PI;

async function match(w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(w + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Aspect'); localStorage.setItem('infra-face-name', 'Aspect'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); });
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) , null, { timeout: 180000 });
  await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(2500); return p;
}
const setVideo = (p, v) => p.evaluate(async v => { const m = await import('./player-preferences.js'); const s = m.loadPreferences(); for (const k of ['gdAspect', 'gdRes', 'gdScale']) delete s[k]; Object.assign(s, v); m.savePreferences(s); await new Promise(r => setTimeout(r, 400)); }, v);
const state = p => p.evaluate(() => { const I = __infra, c = I.renderer.domElement, r = c.getBoundingClientRect(), cam = I.camera, THREE_V = cam.position.constructor;
  const d = I.lab.lookDir ? I.lab.lookDir() : null; const fwd = new THREE_V(); cam.getWorldDirection(fwd); const pt = cam.position.clone().addScaledVector(fwd, 20).project(cam);
  const aim = { x: r.left + (pt.x + 1) / 2 * r.width, y: r.top + (1 - pt.y) / 2 * r.height }, xh = document.querySelector('#gd-x > div')?.getBoundingClientRect();
  const box = id => { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const q = e.getBoundingClientRect(); return q.width && q.height ? [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)] : null; };
  const hud = document.getElementById('gd-hud').getBoundingClientRect();
  return { buf: [c.width, c.height], css: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], win: [innerWidth, innerHeight], pr: I.renderer.getPixelRatio(), aspect: cam.aspect, fov: cam.fov,
    aim, xh: xh ? { x: xh.left, y: xh.top } : null, hud: [Math.round(hud.left), Math.round(hud.top), Math.round(hud.width), Math.round(hud.height)], hudTf: getComputedStyle(document.getElementById('gd-hud')).transform,
    parts: Object.fromEntries(['gd-radar', 'gd-hp', 'gd-wp', 'ar-money', 'ar-top'].map(id => [id, box(id)])), bars: document.body.classList.contains('gd-bars'), dirOk: !d || Math.abs(d.x - fwd.x) + Math.abs(d.y - fwd.y) + Math.abs(d.z - fwd.z) < 1e-6 }; });
// The cost of one frame at the current size, REPORT ONLY: 20 frames queued back to back, then one 1-pixel readPixels waits
// for the GPU to finish them all (throughput, not one frame's readPixels wait — on Apple Metal that wait reads 10–13 ms at
// 1×, 2× and 4× the pixels alike, app.js gdBench); the best of 3 batches. It is max(CPU submit, GPU) a frame, so a CPU-bound
// scene or a loaded machine hides the pixel saving — no hard gate on it; the hard checks are the buffer sizes and the F9 line.
const gpuFrame = p => p.evaluate(() => { const I = __infra, gl = I.renderer.getContext(), px = new Uint8Array(4); let best = 1e9; I.gfx.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); for (let k = 0; k < 3; k++) { const t0 = performance.now(); for (let i = 0; i < 20; i++) I.gfx.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, (performance.now() - t0) / 20); } return +best.toFixed(2); });

for (const [W, H] of [[1920, 1080], [1366, 768]]) {
  const p = await match(W, H), tag = W + '×' + H;
  const native = await state(p); const prN = native.pr;
  check(`${tag} Native (default): v51's sizing — the window at the preset's density, camera = window ratio, no bars`, native.css.join() === [0, 0, W, H].join() && native.buf[0] === Math.round(W * prN) && near(native.aspect, W / H, 1e-6) && !native.bars, JSON.stringify(native));
  check(`${tag} Native: CS2's vertical FOV ${VFOV.toFixed(2)}° (${hfov(W / H).toFixed(2)}° across)`, near(native.fov, VFOV, .05), native.fov);
  if (W === 1920) { await p.screenshot({ path: path.join(out, 'aspect-native.jpg'), type: 'jpeg', quality: 80 }); shots.push(['aspect-native.jpg', 'Native 16:9 · 1920×1080 window · 106.3° across']); perf.native = await gpuFrame(p); perf.nativeBuf = native.buf; }
  const cfgs = W === 1920
    ? [['4:3 stretched', { gdAspect: '4:3', gdScale: 'stretched', gdRes: '1280x960' }, 4 / 3, [1280, 960], 'stretched'], ['4:3 black bars', { gdAspect: '4:3', gdScale: 'bars', gdRes: '1024x768' }, 4 / 3, [1024, 768], 'bars'], ['16:9', { gdAspect: '16:9', gdRes: '1280x720' }, 16 / 9, [1280, 720], 'full'], ['16:10 black bars', { gdAspect: '16:10', gdRes: '1680x1050' }, 1.6, [1680, 1050], 'bars']]
    : [['4:3 stretched', { gdAspect: '4:3', gdScale: 'stretched', gdRes: '1024x768' }, 4 / 3, [1024, 768], 'stretched'], ['4:3 black bars', { gdAspect: '4:3', gdScale: 'bars' }, 4 / 3, null, 'bars'], ['16:9', { gdAspect: '16:9', gdRes: '1366x768' }, 16 / 9, [1366, 768], 'full'], ['16:10 black bars', { gdAspect: '16:10', gdRes: '1280x800' }, 1.6, [1280, 800], 'bars']];
  for (const [name, v, A, res, kind] of cfgs) {
    await setVideo(p, v); const s = await state(p), t = `${tag} ${name}${res ? ' ' + res.join('×') : ' auto'}`;
    const bw = kind === 'bars' ? (W / H > A ? Math.round(H * A) : W) : W, bh = kind === 'bars' ? (W / H > A ? H : Math.round(W / A)) : H, bx = Math.floor((W - bw) / 2), by = Math.floor((H - bh) / 2);
    check(`${t}: canvas CSS box ${kind === 'bars' ? 'centred ' + bw + '×' + bh + ' (black bars)' : 'the whole window'}`, s.css.join() === [bx, by, bw, bh].join() && s.bars === (kind === 'bars' && (bw !== W || bh !== H)), JSON.stringify(s.css) + ' bars ' + s.bars);
    check(`${t}: drawing buffer ${res ? res.join('×') + ' × the scale ' + s.pr : 'the box × the preset density'}`, res ? s.buf[0] === Math.floor(res[0] * s.pr) && s.buf[1] === Math.floor(res[1] * s.pr) && near(s.pr, 1, .01) : s.buf[0] === Math.floor(bw * s.pr), JSON.stringify(s.buf) + ' pr ' + s.pr);
    check(`${t}: camera aspect ${A.toFixed(3)}, vertical ${VFOV.toFixed(2)}° → ${hfov(A).toFixed(2)}° across`, near(s.aspect, A, 1e-6) && near(s.fov, VFOV, .05) && near(hfov(s.aspect), { '1.333': 90, '1.778': 106.26, '1.600': 100.39 }[A.toFixed(3)], .02), s.aspect + ' / ' + s.fov);
    check(`${t}: the HUD fills the picture (${kind === 'bars' ? 'inside the bars' : 'the window'}), not stretched`, s.hud.join() === [bx, by, bw, bh].join() && (s.hudTf === 'none' || !s.hudTf), JSON.stringify(s.hud) + ' ' + s.hudTf);
    const outside = Object.entries(s.parts).filter(([, r]) => r && (r[0] < bx - 1 || r[1] < by - 1 || r[2] > bx + bw + 1 || r[3] > by + bh + 1)).map(([k, r]) => k + JSON.stringify(r));
    check(`${t}: radar, health, ammo, money and top bar inside the picture`, !outside.length && Object.values(s.parts).filter(Boolean).length >= 3, outside.join(' ') + ' ' + JSON.stringify(s.parts));
    if (kind === 'bars') { const m = await p.evaluate(() => Object.fromEntries([['ar-buy', 1], ['ar-board', 1], ['campaign-panel', 0]].map(([id, inner]) => { const e = document.getElementById(id); if (!e) return [id, null]; const h = e.hidden; e.hidden = false; const q = (inner ? e.firstElementChild : e)?.getBoundingClientRect(); e.hidden = h; return [id, q && q.width ? [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)] : null]; })));
      const out2 = Object.entries(m).filter(([, r]) => r && (r[0] < bx - 1 || r[1] < by - 1 || r[2] > bx + bw + 1 || r[3] > by + bh + 1)).map(([k, r]) => k + JSON.stringify(r));
      check(`${t}: buy menu, scoreboard and Settings panel open inside the box ${bx}..${bx + bw} (not cut off)`, !out2.length && m['ar-buy'] && m['ar-board'], out2.join(' ') + ' ' + JSON.stringify(m)); }
    if (kind === 'stretched') { const a = await p.evaluate(() => { const m = /matrix\(([^,]+)/.exec(getComputedStyle(document.getElementById('gd-x')).transform); return m ? +m[1] : 1; });
      check(`${t}: the crosshair stretched sideways with the picture (×${((W / H) / A).toFixed(3)}, CS2's), the HUD not`, near(a, (W / H) / A, .002), a); }
    check(`${t}: the aim ray hits the crosshair (≤ 1.5 px) at the picture's centre`, s.xh && near(s.aim.x, s.xh.x, 1.5) && near(s.aim.y, s.xh.y, 1.5) && near(s.aim.x, bx + bw / 2, 1.5) && near(s.aim.y, by + bh / 2, 1.5) && s.dirOk, JSON.stringify({ aim: s.aim, xh: s.xh }));
    if (W === 1920) { const f = 'aspect-' + name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.jpg'; await p.screenshot({ path: path.join(out, f), type: 'jpeg', quality: 80 }); shots.push([f, `${name} · ${res ? res.join('×') : 'auto'} · ${hfov(A).toFixed(1)}° across`]); perf[name] = await gpuFrame(p); perf[name + ' buf'] = s.buf; }
    if (W === 1920 && kind === 'stretched') { // the dynamic resolution scales the chosen resolution, not the window
      const sc = await p.evaluate(() => { const r = __infra.renderer; r.setPixelRatio(.85); const a = [r.domElement.width, r.domElement.height]; return a; });
      check(`${t}: the dynamic resolution's step (.85) scales the chosen 1280×960 → ${Math.floor(1280 * .85)}×${Math.floor(960 * .85)}`, sc[0] === Math.floor(1280 * .85) && sc[1] === Math.floor(960 * .85), JSON.stringify(sc));
      await p.evaluate(() => __infra.renderer.setPixelRatio(1)); }
    if (W === 1920 && name === '4:3 black bars') { // the F9 overlay names the buffer drawn
      await p.keyboard.press('F9'); await p.waitForTimeout(1500); const txt = await p.evaluate(() => document.getElementById('gd-perf')?.textContent || ''); await p.keyboard.press('F9');
      check(`${t}: the F9 overlay shows the 1024×768 buffer`, /1024×768/.test(txt), txt.slice(0, 200)); }
  }
  await setVideo(p, {}); const back = await state(p);
  check(`${tag} back to Native: exactly as before (buffer, CSS box, camera, no bars)`, back.css.join() === native.css.join() && back.buf[0] === Math.round(W * back.pr) && back.buf[1] === Math.round(H * back.pr) && back.pr <= native.pr + .01 && near(back.aspect, native.aspect, 1e-9) && !back.bars, JSON.stringify(back.buf) + ' vs ' + JSON.stringify(native.buf));
  if (W === 1920) perf.back = await gpuFrame(p);
  await p.context().close();
}
console.log('perf (ms a frame, GPU waited for):', JSON.stringify(perf));
console.log(`REPORT (no gate) frame cost: 4:3 1024×768 ${perf['4:3 black bars']} ms, 16:9 1280×720 ${perf['16:9']} ms vs native ${perf.nativeBuf?.join('×')} ${perf.native} ms`);
writeFileSync(path.join(out, 'shots.json'), JSON.stringify(shots)); writeFileSync(path.join(out, 'perf.json'), JSON.stringify(perf));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
