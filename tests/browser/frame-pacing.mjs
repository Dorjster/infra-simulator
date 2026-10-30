// Frame pacing under a slower CPU: walks a fixed path through the hall for N seconds, records every frame
// time, long tasks and a CPU profile (top self-time functions). mode=solo|guest (guest: host + bots, LAN frames).
// mode=gd: Global Defensive — solo Defuse on Dust II (the CS2 map file when present) with 9 bots and the High preset;
// you strafe and fire at your spawn while the bots fight, CPU throttled (a Windows laptop's slower CPU: 2–4×); frames are
// the ones the game drew (gfx.render), plus the dynamic resolution's changes and programs linked after the fight began
// (Windows' ANGLE → D3D11 compiles each on first use). Gate: fps ≥ 55 and no frame over 100 ms after the first 3 s.
//   node tests/browser/frame-pacing.mjs <repo> <out> gd [throttle=4] [seconds=20] [dsf=1]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
const [root, out, mode = 'solo', throttle = '4', seconds = '20', dsf = '1'] = process.argv.slice(2);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'PERF01', HOST_KEY: 'k', CAMPAIGN_SAVE: '/tmp/perf-' + Date.now() + '.json' }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
if (mode === 'gd') { await gdPacing(); process.exit(0); }
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Math.round(1920 / +dsf), height: Math.round(1080 / +dsf) }, deviceScaleFactor: +dsf }); page.on('dialog', d => d.accept());
await page.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); });
await page.goto(base + '/'); await page.waitForFunction(() => globalThis.__infra?.lab); await page.waitForTimeout(1500);
const post = (r, b, t) => fetch(base + '/api/' + r, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'X-Player-Token': t } : {}) }, body: JSON.stringify(b) }).then(x => x.json());
let bots = [], timer, actTimer;
if (mode === 'guest') {
  const host = await post('join', { code: 'PERF01', name: 'Host', hostKey: 'k' }); let rev = host.revision;
  for (let i = 0; i < 10; i++) bots.push(await post('join', { code: 'PERF01', name: 'Bot' + i }));
  await page.click('[data-start=join]'); await page.fill('#ss-code', 'PERF01'); await page.click('#ss-join'); await page.waitForTimeout(2000);
  const t0 = Date.now(); timer = setInterval(() => { const t = (Date.now() - t0) / 1000; [host, ...bots].forEach((p, i) => post('pose', { pose: { x: -10 + i * 2 + Math.sin(t + i) * 3, y: 9.7, z: 8 + Math.cos(t * .7 + i) * 4, yaw: t + i, active: true } }, p.token).catch(() => {})); }, 125);
  actTimer = setInterval(async () => { const r = await post('action', { revision: rev, action: { type: 'engineering', action: { type: 'lights' } } }, host.token); rev = r.revision ?? rev; if (r.world && r.error) rev = r.revision; }, 2000);
} else { await page.click('[data-start=free]'); await page.waitForTimeout(1500); }
await page.evaluate(() => document.getElementById('face-picker')?.setAttribute('hidden', ''));
const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });

const res = await page.evaluate(async secs => {
  const T = globalThis.__T = { cur: {}, frames: [] }; const wrap = (obj, fn, label) => { const f = obj?.[fn]; if (typeof f !== 'function' || f.__w) return; const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T.cur[label] = (T.cur[label] || 0) + performance.now() - t; } }; w.__w = 1; obj[fn] = w; };
  const L = __infra.lab; wrap(__infra.renderer, 'render', 'render'); wrap(L.engineering, 'update', 'engineering'); wrap(L.kit, 'update', 'kit'); wrap(L.world.office, 'tick', 'office.tick'); wrap(L.world.operations, 'tick', 'ops.tick'); wrap(L.campaignUI, 'update', 'campaignUI'); wrap(L.lan, 'update', 'lan'); wrap(L.world, 'restore', 'world.restore'); wrap(L.officeScene, 'update', 'officeScene'); wrap(L.emotes, 'update', 'emotes');
  const lt = []; const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) lt.push(Math.round(e.duration)); }); obs.observe({ entryTypes: ['longtask'] });
  const path = [[-20, 30, -3, 6, 0], [-6, 9, -6, 6, 0], [3, 9, 3, 6, 0], [9, -8, 3, 6, 0], [-9, -8, -3, 6, 0], [-30, 5, -38, 4, 0], [80, 25, 80, 4, 14]];
  const times = []; let last = performance.now(); const t0 = last, cam = __infra.camera;
  while (performance.now() - t0 < secs * 1000) {
    const u = ((performance.now() - t0) / 1000 / secs) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(u)), f = u - i, A = path[i], B = path[i + 1];
    const x = A[0] + (B[0] - A[0]) * f, z = A[1] + (B[1] - A[1]) * f; __infra.lab.look(x, z, A[2] + (B[2] - A[2]) * f, A[3], A[4] + (B[4] - A[4]) * f);
    await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); times.push(now - last); if (now - last > 50) T.frames.push({ ms: +(now - last).toFixed(0), ...Object.fromEntries(Object.entries(T.cur).map(([k, v]) => [k, +v.toFixed(1)])) }); T.cur = {}; last = now;
  }
  obs.disconnect(); times.sort((a, b) => a - b); const q = p => +times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1);
  return { frames: times.length, fps: Math.round(times.length / secs), median: q(.5), p95: q(.95), p99: q(.99), max: +times.at(-1).toFixed(1), over50: times.filter(t => t > 50).length, over100: times.filter(t => t > 100).length, longTasks: lt.length, longTaskMax: Math.max(0, ...lt), pixelRatio: __infra.renderer.getPixelRatio(), calls: __infra.stats().calls, slow: T.frames.slice(0, 14) };
}, +seconds);
const profile = null;
const top = [];
console.log(JSON.stringify({ mode, throttle, dsf, ...res, top }, null, 1)); 
clearInterval(timer); clearInterval(actTimer); await browser.close(); server.kill(); process.exit(0);

async function gdPacing() {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const p = await b.newPage({ viewport: { width: Math.round(1920 / +dsf), height: Math.round(1080 / +dsf) }, deviceScaleFactor: +dsf }); p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Pacer'); localStorage.setItem('infra-face-name', 'Pacer'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' }));
    const L = globalThis.__links = []; const f = WebGL2RenderingContext.prototype.linkProgram; WebGL2RenderingContext.prototype.linkProgram = function (x) { L.push(performance.now()); return f.call(this, x); }; });
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '9'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.pacer, null, { timeout: 300000 });
  await p.keyboard.press('Escape'); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 30000 }).catch(() => {});
  const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
  await p.evaluate(() => { const I = __infra, g = I.gfx, f = g.render, T = globalThis.__G = { on: false, t: [], res: [], t0: 0, l0: 0 }; let last = 0; g.render = function () { const out = f.apply(this, arguments); if (T.on) { const now = document.timeline.currentTime ?? performance.now(); if (last) T.t.push([now - T.t0, now - last]); last = now; } return out; };
    const spr = I.renderer.setPixelRatio; I.renderer.setPixelRatio = function (v) { if (T.on && Math.abs(v - I.renderer.getPixelRatio()) > .001) T.res.push([Math.round(performance.now() - T.t0), +(+v).toFixed(2)]); return spr.apply(this, arguments); };
    T.start = () => { T.t = []; T.res = []; T.t0 = performance.now(); T.l0 = globalThis.__links.length; last = 0; T.on = true; }; T.start(); });
  const t0 = Date.now(); let k = 0; while (Date.now() - t0 < +seconds * 1000) { const key = k++ % 4 < 2 ? 'KeyA' : 'KeyD'; await p.keyboard.down(key); await p.mouse.move(600, 400); await p.mouse.down(); await p.waitForTimeout(400); await p.mouse.up(); await p.keyboard.up(key); await p.waitForTimeout(200); }
  const T = await p.evaluate(() => { __G.on = false; return { t: __G.t, res: __G.res, links: globalThis.__links.length - __G.l0, ratio: __infra.renderer.getPixelRatio(), calls: __infra.stats().calls }; });
  const all = T.t.map(x => x[1]), after = T.t.filter(x => x[0] > 3000).map(x => x[1]), s = [...all].sort((a, b) => a - b), q = k2 => +s[Math.min(s.length - 1, Math.floor(s.length * k2))].toFixed(1);
  const res = { mode, throttle, dsf, frames: all.length, fps: +(all.length / ((T.t.at(-1)[0] - T.t[0][0]) / 1000)).toFixed(1), median: q(.5), p95: q(.95), p99: q(.99), max: q(1), over50: all.filter(x => x > 50).length, over100After3s: after.filter(x => x > 100).length, resolutionChanges: T.res, programsLinked: T.links, pixelRatio: T.ratio, calls: T.calls, errors: errs.slice(0, 3) };
  console.log(JSON.stringify(res, null, 1)); writeFileSync(out + '/frame-pacing-gd-' + throttle + 'x.json', JSON.stringify(res, null, 1));
  const ok = res.fps >= 55 && res.over100After3s === 0; console.log(ok ? 'PASS frame pacing (GD, CPU ' + throttle + '×): ' + res.fps + ' fps, p99 ' + res.p99 + ' ms' : 'FAIL frame pacing (GD, CPU ' + throttle + '×): ' + res.fps + ' fps, ' + res.over100After3s + ' frames over 100 ms, p99 ' + res.p99 + ' ms');
  await b.close(); server.kill(); if (!ok) process.exit(1);
}
