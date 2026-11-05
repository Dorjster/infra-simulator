// 53.0.1 — Settings → Models and maps → Import asset pack in Chrome with a big zip (the Global Defensive assets folder
// zipped by Finder, or any asset pack): the page sends the chosen File as the request body (never read into the page's
// memory), the room (lan/server.mjs, temporary assets and maps folders) streams it to disk and installs it one entry at a
// time. Reports the reply, the maps the room then serves, and the peak memory of Chrome's processes and of the room.
//   node tests/browser/gd-pack-import-e2e.mjs <root> <out> <zip>
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, statSync, rmSync, mkdirSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
const [root, out, zip] = process.argv.slice(2); if (!zip) throw Error('usage: gd-pack-import-e2e.mjs <root> <out> <zip>');
mkdirSync(out, { recursive: true });
const work = mkdtempSync(path.join(process.env.PACK_E2E_TMP || os.tmpdir(), 'gd-pack-e2e-'));
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'PACK53', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(work, 's.json'), GD_ASSETS_DIR: path.join(work, 'assets'), GD_MAPS_DIR: path.join(work, 'maps') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const roomLog = []; server.stdout.on('data', d => roomLog.push(String(d))); server.stderr.on('data', d => roomLog.push(String(d)));
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); };
// memory: the resident size of a process tree (ps), sampled every 100 ms
const tree = pid => { const rows = execFileSync('ps', ['-Ao', 'pid=,ppid=,rss=']).toString().trim().split('\n').map(l => l.trim().split(/\s+/).map(Number)), kids = new Map();
  for (const [p, pp] of rows) { if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(p); } const rss = new Map(rows.map(([p, , r]) => [p, r])), all = []; const go = p => { all.push(p); for (const k of kids.get(p) || []) go(k); }; go(pid); return all.reduce((s, p) => s + (rss.get(p) || 0), 0) * 1024; };
// Chrome's processes: every process of this test's browser profile (Playwright's own --user-data-dir)
const chromeRss = () => execFileSync('ps', ['-Ao', 'rss=,command=']).toString().split('\n').filter(l => /playwright_chromiumdev_profile/.test(l) && /Chrome|Chromium/.test(l)).reduce((s, l) => s + Number(l.trim().split(/\s+/)[0]) * 1024, 0);
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
// the page's reply kept across its reload (it reloads 1.5 s after a pack is installed)
await p.addInitScript(() => { const f = window.fetch; window.fetch = async (...a) => { const r = await f(...a); if (String(a[0]).includes('user-assets/pack')) r.clone().text().then(t => sessionStorage.setItem('pack-reply', r.status + ' ' + t)); return r; }; });
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Packer'); localStorage.setItem('infra-face-name', 'Packer'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.evaluate(() => __infra.lab.campaignUI.panel('settings')); await p.waitForTimeout(400);
check('Settings shows Models and maps → Import asset pack', await p.evaluate(() => !!document.querySelector('#campaign-panel [data-pack]')));
const c0 = chromeRss(), s0 = tree(server.pid); let cPeak = c0, sPeak = s0;
const iv = setInterval(() => { try { cPeak = Math.max(cPeak, chromeRss()); sPeak = Math.max(sPeak, tree(server.pid)); } catch {} }, 100);
const reply = p.waitForResponse(r => r.url().endsWith('/api/user-assets/pack'), { timeout: 900000 });
// (the button sits far down the settings panel: focused and pressed with Enter — a real key press, which lets the page open
// the file chooser)
await p.focus('#campaign-panel [data-pack]');
const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), p.keyboard.press('Enter')]);
const t0 = Date.now(); await chooser.setFiles(zip);
const r = await reply, secs = (Date.now() - t0) / 1000; clearInterval(iv);
let saved = null; for (let i = 0; i < 100 && !saved; i++) { saved = await p.evaluate(() => sessionStorage.getItem('pack-reply')).catch(() => null); if (!saved) await p.waitForTimeout(100); }
const body = saved ? JSON.parse(saved.slice(saved.indexOf(' ') + 1)) : null;
check('the pack is installed (' + (statSync(zip).size / 1e9).toFixed(2) + ' GB in ' + secs.toFixed(1) + ' s)', r.status() === 200 && body?.ok, JSON.stringify(body));
const maps = await (await fetch(base + '/api/user-maps')).json();
check('the room serves its maps', maps.maps.length > 0 || !body?.maps, maps.maps.map(m => m.id).join(', '));
check('Chrome never held the pack in memory (its processes grew far less than the zip)', c0 > 0 && cPeak - c0 < statSync(zip).size * 0.25, ((cPeak - c0) / 1e6).toFixed(0) + ' MB');
check('no page errors', !errs.length, errs.join(' | '));
const report = { zip, bytes: statSync(zip).size, status: r.status(), body, secs, maps: maps.maps.map(m => m.id), chrome: { start: c0, peak: cPeak }, room: { start: s0, peak: sPeak }, roomLog: roomLog.join('').split('\n').filter(l => /pack|CS2|Map/i.test(l)).slice(0, 40) };
console.log('memory: Chrome ' + (c0 / 1e6).toFixed(0) + ' → peak ' + (cPeak / 1e6).toFixed(0) + ' MB; room ' + (s0 / 1e6).toFixed(0) + ' → peak ' + (sPeak / 1e6).toFixed(0) + ' MB');
writeFileSync(path.join(out, 'gd-pack-import-e2e.json'), JSON.stringify(report, null, 1));
await b.close(); server.kill(); await new Promise(r => setTimeout(r, 500)); rmSync(work, { recursive: true, force: true });
console.log(`${ok}/${n} checks passed`); process.exit(ok === n ? 0 : 1);
