// Global Defensive Defuse vs bots in the real game at 1280×720: waits for a round to end (the bots fight it out), then
// pictures CS2's win panel (banner, MVP card, your round) and the Tab scoreboard (CT over T, K / A / D, ★, HS%, DMG,
// the round history) — the match stats reach this page as frame.ms from the LAN room. Pictures: <out-dir>/panel.jpg, board.jpg.
//   node tests/browser/gd-round-mvp.mjs <repo-root> <out-dir> [map]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-round-mvp'), MAP = 'dust2'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDMVP1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdmvp-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  const over = await p.waitForFunction(() => document.getElementById('ar-rp')?.hidden === false, null, { timeout: 200000, polling: 250 }).then(() => true, () => false);
  check('a round ended and the win panel is shown', over);
  await p.waitForTimeout(1200);
  const info = await p.evaluate(() => ({ html: document.getElementById('ar-rp').innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), box: document.getElementById('ar-rp').getBoundingClientRect().toJSON() }));
  console.log('panel:', info.html.slice(0, 300)); check('the panel names the winner and the reason', /(COUNTER-TERRORISTS|TERRORISTS) WIN/.test(info.html) && /(Bomb defused|Bomb exploded|All enemies eliminated|Target saved)/.test(info.html), info.html);
  check('the panel fits the 1280×720 view', info.box.left >= 0 && info.box.right <= 1280 && info.box.bottom <= 720, JSON.stringify(info.box));
  await p.screenshot({ path: path.join(out, 'panel.jpg'), type: 'jpeg', quality: 88 });
  await p.evaluate(() => __infra.lab.arenaUI.scoreboard(true)); await p.waitForTimeout(500);
  const bt = await p.evaluate(() => document.getElementById('ar-board').innerText);
  check('the board: CT block, T block, HS% and DMG columns, round history', /COUNTER-TERRORISTS[\s\S]*TERRORISTS/.test(bt) && /HS%/.test(bt) && /DMG/.test(bt) && await p.evaluate(() => !!document.querySelector('#ar-board .gb-hist i')), bt.slice(0, 300));
  await p.screenshot({ path: path.join(out, 'board.jpg'), type: 'jpeg', quality: 88 });
  check('no page errors', !errs.length, errs.join(' | '));
} catch (e) { failed++; console.log('FAIL run · ' + (e.stack || e).toString().slice(0, 600)); }
finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-round-mvp · ${failed}` : 'PASS: gd-round-mvp'); process.exit(failed ? 1 : 0);
