// The developer weapon gallery (dist/gd-gallery.html, spec §8): every weapon, knife, grenade and the bomb gets a card
// with its model rendered by the game's own loader — all drawn, all different, none the generic fallback, no errors.
//   node tests/browser/gd-gallery-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GAL001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] }); const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
await p.goto(base + '/gd-gallery.html'); await p.waitForFunction(() => /items ·/.test(document.getElementById('status')?.textContent || ''), null, { timeout: 90000 }).catch(() => {});
const r = await p.evaluate(() => ({ status: document.getElementById('status').textContent, cards: document.querySelectorAll('.card').length, rendered: [...document.querySelectorAll('img[data-model]')].filter(i => i.src.startsWith('data:image/png') && i.naturalWidth > 0).length, fallback: document.querySelectorAll('.bad').length, distinct: new Set([...document.querySelectorAll('img[data-model]')].map(i => i.src)).size }));
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
check('a card for every weapon, knife, grenade and the bomb (30)', r.cards === 30, r.cards);
check('every model drawn', r.rendered === r.cards, r.rendered);
check('no two models look the same (30 different pictures)', r.distinct === r.cards, r.distinct);
check('none is the generic fallback', r.fallback === 0, r.fallback);
check('no page errors or failed loads', errs.length === 0, errs.slice(0, 3).join(' | '));
await p.screenshot({ path: path.join(out, 'gallery.png'), fullPage: false }); console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
