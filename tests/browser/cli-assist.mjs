// Laptop console in a real browser with real keystrokes: Tab completion, "?" help, the suggestion line and
// abbreviations ("sh int st" runs "show interfaces status") on the management switch.
//   node tests/browser/cli-assist.mjs <repo-root>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root] = process.argv.slice(2);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'CLI001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'cl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', 'Tester'); });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d ? ' · ' + String(d).slice(0, 200) : '')); };
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1500);
await p.click('[data-start=free]'); await p.waitForTimeout(2000);
await p.evaluate(() => __infra.lab.kit.show()); await p.waitForTimeout(500); if (await p.$eval('#dock-laptop', e => !e.hidden && !!e.offsetParent)) await p.click('#dock-laptop'); await p.waitForTimeout(800);   // Free Build starts connected to MGMT-SW
const val = () => p.$eval('#laptop-command', e => e.value), out = () => p.$eval('#laptop-output', e => e.innerText), tail = k => p.$eval('#laptop-output', (e, k) => e.innerText.slice(-k), k), sug = () => p.$eval('#laptop-suggest', e => e.textContent);
check('Connected to a device', !/NOT CONNECTED/.test(await p.$eval('#laptop-session', e => e.innerText)), await p.$eval('#laptop-session', e => e.innerText));
await p.click('#laptop-command'); await p.keyboard.type('sh int st'); await p.waitForTimeout(150);
check('Suggestion line shows what the abbreviation runs', /runs: show interfaces status/.test(await sug()), await sug());
await p.keyboard.press('Enter'); await p.waitForTimeout(500);
const res = await tail(4000); const ran = res.split('sh int st').pop(); check('"sh int st" runs show interfaces status', /notconnect|connected/i.test(ran) && !/Unrecognized|Unknown|invalid/i.test(ran), ran.slice(0, 200));
await p.keyboard.type('show int'); await p.keyboard.press('Tab'); check('Tab extends to the common part', (await val()) === 'show interface', await val());
await p.keyboard.type('s '); await p.keyboard.press('Tab'); await p.waitForTimeout(150);
const listed = await tail(200); check('Tab lists the next words', /status/.test(listed) && /transceiver/.test(listed), listed);
await p.keyboard.type('sta'); await p.keyboard.press('Tab'); check('Tab completes a unique word', (await val()) === 'show interfaces status ', await val());
await p.fill('#laptop-command', ''); await p.keyboard.type('show '); await p.keyboard.press('?'); await p.waitForTimeout(150);
const q = await tail(500); check('"?" lists what can follow and keeps the line', /vlan/.test(q) && /> show \?/.test(q) && (await val()) === 'show ', q.slice(-160));
await p.fill('#laptop-command', ''); await p.keyboard.type('show inter'); await p.waitForTimeout(150); check('Suggestion while typing', /Tab ▸ show interface/.test(await sug()), await sug());
await p.fill('#laptop-command', ''); await p.keyboard.type('sh'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
const sh = await tail(200); check('A bare "sh" is not run as shutdown', !/(shutdown|disabled|administratively down)/i.test(sh.split('> sh').pop() || ''), sh.slice(-120));
check('No page errors', !errs.length, errs.join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
