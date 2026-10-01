// Frame pacing under a slower CPU: walks a fixed path through the hall for N seconds, records every frame
// time, long tasks and a CPU profile (top self-time functions). mode=solo|guest (guest: host + bots, LAN frames).
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
const [root, out, mode = 'solo', throttle = '4', seconds = '20', dsf = '1'] = process.argv.slice(2);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'PERF01', HOST_KEY: 'k', CAMPAIGN_SAVE: '/tmp/perf-' + Date.now() + '.json' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
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
