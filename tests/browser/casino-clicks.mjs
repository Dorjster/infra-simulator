// Casino buttons with real, slow mouse clicks (held 300 ms, like a person) while the panel's timers update:
// every press must register. (Before v35.2 the panel rebuilt itself every 250 ms and swallowed such clicks.)
//   node tests/browser/casino-clicks.mjs <repo-root>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root] = process.argv.slice(2);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'CLK001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'ck-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', 'Darja'); localStorage.setItem('infra-face-name', 'Darja'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1500);
await p.click('[data-start=payday]'); await p.waitForTimeout(600); await p.click('#ss-pay-solo'); await p.waitForTimeout(3000);
const slowClick = async sel => { const box = await p.locator(sel).first().boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(300); await p.mouse.up(); await p.waitForTimeout(250); };
const T = id => p.evaluate(id => __infra.lab.world.operations.game.casino.tables[id], id);
let ok = 0, n = 0; const check = (name, c) => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name); };
await p.evaluate(() => { __infra.lab.enter(); __infra.lab.casinoUI.show('bj-1'); }); await p.waitForTimeout(600);
await slowClick('[data-chip="100000"]'); await slowClick('[data-act="bj-bet"]'); check('Blackjack: Bet & sit registers', (await T('bj-1')).seats.length === 1);
await slowClick('[data-act="bj-bet"]'); check('Blackjack: Add during the betting countdown registers', (await T('bj-1')).seats[0]?.bet === 200000);
await slowClick('[data-act="bj-deal"]'); await p.waitForTimeout(1500); let t = await T('bj-1'); check('Blackjack: Deal now registers', t.phase !== 'betting');
if (t.phase === 'playing') { await slowClick('[data-act="bj-stand"]'); t = await T('bj-1'); check('Blackjack: Stand registers', t.phase !== 'playing'); }
await p.evaluate(() => __infra.lab.casinoUI.show('rl-1')); await p.waitForTimeout(500);
for (const v of [7, 17, 32]) await slowClick(`[data-rl="straight"][data-v="${v}"]`); check('Roulette: three number bets register', (await T('rl-1')).bets.length === 3);
await slowClick('[data-act="rl-spin"]'); check('Roulette: Spin registers', (await T('rl-1')).phase === 'spinning');
await p.evaluate(() => __infra.lab.casinoUI.show('sl-1')); await p.waitForTimeout(500);
const s0 = (await T('sl-1')).spins; await slowClick('[data-act="sl-spin"]'); check('Slots: Spin registers', (await T('sl-1')).spins === s0 + 1);
await p.waitForTimeout(2600); await slowClick('[data-act="sl-spin"]'); check('Slots: a second spin after the reels stop registers (not stuck)', (await T('sl-1')).spins === s0 + 2);
await p.evaluate(() => __infra.lab.casinoUI.show('lotto')); await p.waitForTimeout(500);
await slowClick('[data-act="quick"]'); await slowClick('[data-act="lotto"]'); check('Lotto: Quick pick + Buy ticket register', (await T('lotto')).tickets === 1);
await p.evaluate(() => __infra.lab.casinoUI.show('stage')); await p.waitForTimeout(500);
await slowClick('[data-dance="4"]'); check('Stage: a dance button registers the tip', (await T('stage')).dance === 4 || (await T('stage')).queue.length > 0);
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
