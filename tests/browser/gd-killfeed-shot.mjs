// Global Defensive Defuse vs bots at 1280×720: waits for a few kills and pictures the kill feed — CS2's own weapon and
// mark icons when the host imported them (tools/import-cs2-killfeed.mjs), else ours. Picture: <out-dir>/feed.jpg.
//   node tests/browser/gd-killfeed-shot.mjs <repo-root> <out-dir> [map]
//   node tests/browser/gd-killfeed-shot.mjs <repo-root> <out-dir> [map]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-killfeed-shot'), MAP = 'dust2'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDKF01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdkf-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = []; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '5');
  await p.evaluate(() => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', '2']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } }); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  const got = await p.waitForFunction(() => document.querySelectorAll('#ar-feed p').length >= 3, null, { timeout: 200000, polling: 200 }).then(() => true, () => false);
  check('three kills are in the feed', got);
  await p.waitForTimeout(600);
  const info = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#ar-feed p')].map(r => r.innerText.replace(/\s+/g, ' ')), cs2: document.querySelectorAll('#ar-feed img.kw').length, ok: [...document.querySelectorAll('#ar-feed img.kw, #ar-feed img.km')].every(i => i.complete && i.naturalWidth > 0), box: document.getElementById('ar-feed').getBoundingClientRect().toJSON() }));
  console.log('feed:', JSON.stringify(info.rows), 'cs2 icons:', info.cs2);
  check('CS2 icons loaded (when imported)', info.ok);
  await p.screenshot({ path: path.join(out, 'feed.jpg'), type: 'jpeg', quality: 92, clip: { x: Math.max(0, info.box.left - 40), y: Math.max(0, info.box.top - 20), width: Math.min(1280, info.box.width + 60), height: info.box.height + 40 } });
  await p.screenshot({ path: path.join(out, 'full.jpg'), type: 'jpeg', quality: 85 });
  check('no page errors', !errs.length, errs.join(' | '));
} catch (e) { failed++; console.log('FAIL run · ' + (e.stack || e).toString().slice(0, 600)); }
finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-killfeed-shot · ${failed}` : 'PASS: gd-killfeed-shot'); process.exit(failed ? 1 : 0);
