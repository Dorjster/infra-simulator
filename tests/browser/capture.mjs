// Before/after capture: same views, same viewport, real Chrome. Usage: node capture.mjs <repo-root> <out-dir> [players]
import { chromium } from 'playwright-core'; // npm i playwright-core (not a game dependency); CHROME=/path/to/chrome or a Playwright-installed Chromium
import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const [root, out, playersArg] = process.argv.slice(2), players = +(playersArg || 1);
await mkdir(out, { recursive: true });
const temp = await mkdtemp(path.join(os.tmpdir(), 'cap-'));
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'CAP001', HOST_KEY: 'cap-key', CAMPAIGN_SAVE: path.join(temp, 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const report = { base, views: {}, errors: [], gpu: null, players };
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) report.errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', 'Capture'); localStorage.setItem('infra-face-name', 'Capture'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', showFPS: true })); } catch {} });
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 });
await page.waitForTimeout(3000);
report.gpu = await page.evaluate(() => { const gl = __infra.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
// Optional simulated LAN players: join extra guests over HTTP and post poses near the racks.
const guests = [];
for (let i = 1; i < players; i++) { const r = await fetch(base + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'CAP001', name: 'Bot' + i }) }).then(r => r.json()); guests.push(r.token); }
const poseLoop = setInterval(() => { guests.forEach((t, i) => fetch(base + '/api/pose', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Player-Token': t }, body: JSON.stringify({ pose: { x: -8 + (i % 6) * 3, y: 9.7, z: 8 + Math.floor(i / 6) * 3 + Math.sin(Date.now() / 700 + i), yaw: i, active: true } }) }).catch(() => {})); }, 125);
if (players > 1) { await page.evaluate(async () => { const d = await (await fetch('/api/room')).json(); await __infra.lab.lan.join({ name: 'Host', code: d.roomCode, hostKey: d.hostKey }, true); }); await page.waitForTimeout(1500); }
await page.evaluate(() => { document.getElementById('lan-close')?.click(); for (const id of ['eng-close', 'box-close']) document.getElementById(id)?.click(); });
await page.evaluate(() => { const b = document.querySelector('[data-start=free]'); if (b) b.click(); __infra.lab.enter(); });
await page.waitForTimeout(1500);
await page.waitForTimeout(800);
await page.evaluate(() => { for (const b of document.querySelectorAll('#face-picker button')) { if (/play|start|done|ok/i.test(b.textContent)) { b.click(); break; } } document.getElementById('face-picker')?.setAttribute('hidden', ''); document.getElementById('eng-close')?.click(); });
const views = {
  '01-entrance': [[-20, 9.7, 44], [-2, 7, 0]],
  '02-receiving': [[-26, 9.7, 16], [-40, 2.5, -2]],
  '03-rack-front': [[-6, 9.7, 9.5], [-6, 6.5, 0]],
  '04-rack-rear': [[-6, 9.7, -8.5], [-6, 6.5, 0]],
  '05-cabling': [[1, 11.5, -8], [-3, 8, -2.6]],
  '06-office': [[96, 9.7, 36], [82, 4, 14]]
};
async function measure(name, pos, look) {
  await page.evaluate(([p, l]) => { const c = __infra.camera; c.position.set(...p); c.lookAt(...l); __infra.lab.syncLook?.(); }, [pos, look]);
  await page.evaluate(([p, l]) => { const c = __infra.camera; c.position.set(...p); c.lookAt(...l); }, [pos, look]);
  await page.waitForTimeout(1200);
  const m = await page.evaluate(async ([p, l]) => { const c = __infra.camera; const times = [], calls = []; let last = performance.now(); for (let i = 0; i < 120; i++) { c.position.set(...p); c.lookAt(...l); await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); times.push(now - last); last = now; calls.push(__infra.stats().calls); } times.sort((a, b) => a - b); calls.sort((a, b) => a - b); const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; const s = __infra.stats(); return { fps: Math.round(1000 / times[60]), frameMedianMs: +times[60].toFixed(2), frameP95Ms: +times[114].toFixed(2), drawCalls: calls[60], triangles: s.triangles, geometries: s.geometries, textures: s.textures, heapMB: mem, pixelRatio: __infra.renderer.getPixelRatio() }; }, [pos, look]);
  await page.screenshot({ path: path.join(out, name + '.png') });
  report.views[name] = m;
}
for (const [name, [pos, look]] of Object.entries(views)) await measure(name, pos, look);
// Device UI: the FortiGate GUI (Free Play facility).
try {
  await page.evaluate(() => { const fw = __infra.nodes.find(n => n.type === 'firewall' && n.active !== false); __infra.lab.kit.openDevice?.(fw.id, true); });
  await page.waitForTimeout(1500); await page.screenshot({ path: path.join(out, '07-device-ui.png') });
} catch (e) { report.errors.push('device ui: ' + e.message); }
clearInterval(poseLoop);
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close(); server.kill(); process.exit(0);
