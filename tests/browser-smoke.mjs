// Chromium smoke test (not part of npm test: needs Playwright + Chromium). Starts the LAN server,
// opens two clients, walks, opens every vendor GUI family, CLI sessions, alarm click-through, NOC map,
// the PDU page, and records page errors, screenshots and draw calls per frame.
//   node tests/browser-smoke.mjs [screenshot-dir]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { console.log('SKIP: Playwright not installed'); process.exit(0); } }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), shots = process.argv[2] || path.join(root, 'screenshots');
await mkdir(shots, { recursive: true });
const temp = await mkdtemp(path.join(os.tmpdir(), 'infra-smoke-')), KEY = 'smoke-host-key';
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SMOKE1', HOST_KEY: KEY, CAMPAIGN_SAVE: path.join(temp, 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browser = await chromium.launch({ executablePath: fs => undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }).catch(() => chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }));
const report = { errors: [], networkWarnings: [], drawCalls: {}, shots: [] };
async function client(name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => report.errors.push(name + ': ' + e.message));
  // External resources (web fonts) can fail behind a proxy/offline LAN: reported as network warnings.
  page.on('console', m => { if (m.type() !== 'error' || /favicon|404/.test(m.text())) return; (/Failed to load resource: net::/.test(m.text()) ? report.networkWarnings : report.errors).push(name + ' console: ' + m.text()); });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  return page;
}
const shot = async (page, name) => { const f = path.join(shots, name + '.png'); await page.screenshot({ path: f }); report.shots.push(f); };
const frameCalls = async (page, frames = 20) => page.evaluate(async n => { const out = []; for (let i = 0; i < n; i++) { await new Promise(r => requestAnimationFrame(r)); out.push(__infra.stats().calls); } out.sort((a, b) => a - b); return { median: out[Math.floor(out.length / 2)], max: out.at(-1) }; }, frames);
try {
  const a = await client('host');
  await a.evaluate(() => document.getElementById('lan-close')?.click());
  report.drawCalls.orbit = await frameCalls(a); await shot(a, '01-orbit');
  await a.evaluate(() => { __infra.lab.enter(); });
  await a.waitForTimeout(1500);
  // First walk-in shows the face picker (6 faces + 6 head colours); pick one to start playing.
  report.facePicker = await a.evaluate(() => ({ nameField: !!document.getElementById('fp-name'), shown: !document.getElementById('face-picker').hidden, faces: document.querySelectorAll('#face-picker .fp-face').length, skins: document.querySelectorAll('#face-picker .fp-skin').length }));
  if (!report.facePicker.shown || report.facePicker.faces !== 6 || report.facePicker.skins !== 6) report.errors.push('face picker: ' + JSON.stringify(report.facePicker));
  await shot(a, '02a-face-picker');
  await a.evaluate(() => __infra.lab.faces.pick('cute', 'yellow', 'Smoke Tester')); await a.waitForTimeout(1500);
  report.rename = await a.evaluate(() => __infra.lab.lan.players.find(p => p.id === __infra.lab.lan.selfID)?.name);
  if (report.rename !== 'Smoke Tester') report.errors.push('rename not applied: ' + report.rename);
  report.drawCalls.walking = await frameCalls(a, 40); await shot(a, '02-walking');
  await a.evaluate(() => { for (const [x, z] of [[-3, 10], [3, 8], [9, 8]]) { __infra.camera.position.set(x, 9.7, z); } });
  report.drawCalls.walkingRacks = await frameCalls(a, 40); await shot(a, '03-walking-racks');
  // Emote wheel: one scroll opens it on Salute, a click plays it; the corner preview shows you.
  await a.mouse.move(720, 450); await a.mouse.wheel(0, 120); await a.waitForTimeout(200);
  report.emoteWheel = await a.evaluate(() => ({ open: __infra.lab.emotes.open, on: document.querySelector('#emote-wheel .ew-item.on')?.textContent || '' }));
  await a.mouse.down(); await a.mouse.up(); await a.waitForTimeout(200);
  report.emoteWheel.played = await a.evaluate(() => __infra.lab.emotes.current);
  await shot(a, '03a-emote-salute-preview');
  if (!report.emoteWheel.open || !/Salute/.test(report.emoteWheel.on) || report.emoteWheel.played !== 'salute') report.errors.push('emote wheel: ' + JSON.stringify(report.emoteWheel));
  await a.evaluate(() => __infra.lab.emotes.cancel());
  for (const k of ['walking', 'walkingRacks']) if (report.drawCalls[k].max >= 500) report.errors.push(k + ': ' + report.drawCalls[k].max + ' draw calls per frame (budget < 500)');
  // Vendor GUIs through the laptop (local sessions): one device per family.
  const families = await a.evaluate(async () => {
    const L = __infra.lab.kit.network.logic, out = [], kit = __infra.lab.kit, pick = id => __infra.byId[id];
    for (const id of ['FIREWALL-A', 'CORE-A', 'SERVER-01', 'GPU-01', 'NVMe ENCLOSURE', 'SAN-A']) { kit.openDevicePage(id, 'overview'); await new Promise(r => setTimeout(r, 400)); const el = document.getElementById('product-gui'); out.push({ id, family: L.module(pick(id)).family, html: (el?.innerHTML || '').length, blocking: !!document.getElementById('pg-blocking') }); }
    return out;
  });
  report.guis = families; await shot(a, '04-vendor-gui');
  // GUI guards: an invalid IP is flagged inline and its Save is blocked; a destructive action (restore
  // checkpoint) first shows its impact and needs a second click.
  report.guards = await a.evaluate(async () => {
    const kit = __infra.lab.kit, wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
    kit.openDevicePage('SERVER-01', 'management'); await wait(400);
    const ip = document.getElementById('pg-ip'); if (ip) { ip.value = '10.0.0.300'; ip.dispatchEvent(new Event('input', { bubbles: true })); out.inlineError = ip.nextElementSibling?.textContent || ''; document.getElementById('pg-management-save')?.click(); await wait(100); out.saveBlocked = document.getElementById('pg-message')?.textContent || ''; }
    kit.openDevicePage('SERVER-01', 'maintenance'); await wait(400);
    const f = document.querySelector('form[data-runtime-form="restore"]'); if (f) { f.requestSubmit(); await wait(100); out.confirm = document.getElementById('pg-message')?.textContent || ''; out.button = f.querySelector('button[type=submit]')?.textContent || ''; }
    return out;
  });
  if (!/IPv4/.test(report.guards.inlineError || '') || !/Fix the highlighted/.test(report.guards.saveBlocked || '')) report.errors.push('inline validation not shown: ' + JSON.stringify(report.guards));
  if (!/checkpoint/.test(report.guards.confirm || '') || !/^Confirm/.test(report.guards.button || '')) report.errors.push('destructive action not confirmed: ' + JSON.stringify(report.guards));
  for (const [id, cmd] of [['FIREWALL-A', 'get router info routing-table all'], ['CORE-A', 'show spanning-tree'], ['SERVER-01', 'racadm storage get vdisks'], ['SAN-A', 'nsshow'], ['GPU-01', 'nvidia-smi']]) report['cli:' + id] = (await a.evaluate(async ([id, cmd]) => String(await __infra.lab.kit.network.command(cmd, { node: __infra.byId[id] })).split('\n').length, [id, cmd]));
  // Alarm click-through: host injects a PDU overload through the LAN API, NOC table → click.
  await a.evaluate(async () => { const lab = __infra.lab; lab.kit.hide(); lab.engineering.panel('monitoring'); });
  await a.waitForTimeout(500); await shot(a, '05-monitoring');
  await a.evaluate(() => __infra.lab.engineering.panel('noc')); await a.waitForTimeout(500); await shot(a, '06-noc-map');
  report.nocNodes = await a.evaluate(() => document.querySelectorAll('#noc-map [data-noc]').length);
  await a.evaluate(() => __infra.lab.engineering.panel('power')); await a.waitForTimeout(500); await shot(a, '07-power');
  report.pduRows = await a.evaluate(() => document.querySelectorAll('[data-pdu-reset], #eng-content tbody tr').length);
  // Second client joins over LAN and sees the same world.
  const b = await client('guest'); report.drawCalls.guestOrbit = await frameCalls(b); await shot(b, '08-guest');
  await a.evaluate(async () => { const r = await __infra.lab.world.apply({ type: 'engineering', action: { type: 'fault', fault: 'pdu-overload', rack: 'R04' } }); return r; }).catch(e => report.errors.push('fault: ' + e.message));
  await a.evaluate(() => { __infra.lab.engineering.panel('monitoring'); }); await a.waitForTimeout(600);
  report.alarmButtons = await a.evaluate(() => document.querySelectorAll('[data-alarm]').length);
  await a.evaluate(() => document.querySelector('[data-alarm]')?.click()); await a.waitForTimeout(600); await shot(a, '09-alarm-click');
  report.arrowVisible = await a.evaluate(() => __infra.scene.children.some(o => o.geometry?.type === 'ConeGeometry' && o.visible));
} catch (e) { report.errors.push('smoke: ' + e.stack); }
finally { await browser.close(); server.kill('SIGINT'); }
console.log(JSON.stringify(report, null, 2));
process.exit(report.errors.length ? 1 : 0);
