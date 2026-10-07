//   node tests/browser/lan-scan-join.mjs <repo-root>   (needs port 8080 free)
// A game hosted by the plain room server on 8080 (no UDP broadcast at all): the desktop Join screen must still
// list it (subnet scan), auto-select it as the only game, and join with the passcode in two actions.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import os from 'node:os'; import { mkdtempSync } from 'node:fs'; import path from 'node:path';
const [root] = process.argv.slice(2);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '8080', BIND: '0.0.0.0', ROOM_CODE: 'SCAN42', HOST_KEY: 'hk', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'sj-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(r => server.stdout.on('data', d => { if (/localhost:\d+/.test(String(d))) r(); }));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'));
const app = spawn(path.join(root, 'desktop/node_modules/.bin/electron'), [path.join(root, 'desktop'), '--remote-debugging-port=9361', '--user-data-dir=' + mkdtempSync(path.join(os.tmpdir(), 'sg-'))], { env, stdio: 'ignore' });
let b; for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP('http://127.0.0.1:9361'); } catch { await new Promise(r => setTimeout(r, 500)); } }
let p; for (let i = 0; i < 40 && !p; i++) { p = b.contexts()[0]?.pages()[0]; if (!p) await new Promise(r => setTimeout(r, 500)); }
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d ? ' · ' + String(d).slice(0, 220) : '')); };
await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.evaluate(() => localStorage.setItem('infra-face', 'smile')); await p.waitForTimeout(1500);
const home = p.url(); await p.click('[data-start=join]'); await p.fill('#ss-jname', 'Sam');
const t0 = Date.now(); await p.waitForSelector('.ss-found-game', { timeout: 15000 }).catch(() => {});
const list = await p.evaluate(() => document.getElementById('ss-found')?.innerText || ''); check('Game found without any broadcast (subnet scan)', /:8080/.test(list), (Date.now() - t0) + ' ms · ' + list.replace(/\n/g, ' | '));
await p.waitForTimeout(1600);
const sel = await p.evaluate(() => ({ addr: document.getElementById('ss-addr').value, focus: document.activeElement?.id, status: document.getElementById('ss-join-status').innerText }));
check('Only game auto-selected, passcode box focused', /:8080$/.test(sel.addr) && sel.focus === 'ss-code', JSON.stringify(sel));
await p.keyboard.type('scan42'); await p.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 6000)); p = b.contexts()[0].pages()[0];
const st = await p.evaluate(() => ({ connected: !!globalThis.__infra?.lab?.lan?.connected, url: location.host })).catch(e => ({ err: e.message }));
check('Joined with two actions (type passcode, Enter)', st.connected, JSON.stringify(st));
// Back on the Join screen later: the last game and passcode are remembered.
await p.goto(home); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.click('[data-start=join]').catch(() => {}); await p.waitForSelector('.ss-found-game', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1600);
const again = await p.evaluate(() => ({ code: document.getElementById('ss-code')?.value, status: document.getElementById('ss-join-status')?.innerText }));
check('Rejoin: last game and passcode prefilled', /scan42/i.test(again.code || '') && /Last game/.test(again.status || ''), JSON.stringify(again));
console.log(ok + '/' + n); app.kill(); server.kill(); process.exit(ok === n ? 0 : 1);
