// Payday mode over LAN in real browsers: the host (Darja) starts Payday from the start screen, a guest (Sam)
// joins with the room code. Checks: wallets (Darja $10,000, Sam $500), salary for a real job (order → unbox
// → place a rack pays the engineer who placed it, once), the casino doors open and the room is walkable,
// shared blackjack (both seated, dealt, played, settled), roulette (bet → spin → payout), lotto, a loan
// from Darja to Sam and its repayment, and that the Campaign save was never touched.
//   node tests/browser/payday-casino-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const saveDir = mkdtempSync(path.join(os.tmpdir(), 'payday-')), campaignSave = path.join(saveDir, 'campaign-save.json');
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'PAY777', HOST_KEY: 'hk', CAMPAIGN_SAVE: campaignSave, DELIVERY_SCALE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const results = [], errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' · ' + String(detail).slice(0, 200) : '')); };
async function client(name) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  page.on('pageerror', e => errors.push(name + ': ' + e.message)); page.on('dialog', d => d.accept());
  await page.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); }, name);
  await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForFunction(() => globalThis.__infra?.lab); await page.waitForTimeout(1200); return page;
}
const game = p => p.evaluate(() => { const g = __infra.lab.world.operations.game; return { payday: !!g.payday, mode: g.mode, wallets: Object.fromEntries(Object.values(g.wallets || {}).map(w => [w.name, w.cash])), loans: g.loans || [], casino: g.casino }; });
const cash = async (p, who) => (await game(p)).wallets[who];
const until = async (p, fn, arg, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(250); } return false; };
const casino = (p, action) => p.evaluate(a => __infra.lab.lan.send({ type: 'casino', action: a }).then(r => typeof r === 'string' ? r : r?.message || JSON.stringify(r)).catch(e => 'ERR ' + e.message), action);
try {
  const host = await client('Darja');
  await host.click('[data-start=payday]'); await host.waitForTimeout(800);
  await host.click('#ss-pay-host'); await host.waitForTimeout(2500);
  let g = await game(host);
  check('Host started Payday (Levels track, payday on)', g.payday && g.mode === 'campaign', JSON.stringify({ payday: g.payday, mode: g.mode }));
  await until(host, () => !!__infra.lab.world.operations.game.wallets?.darja);
  check('Darja starts with $10,000', (await cash(host, 'Darja')) === 10000, JSON.stringify((await game(host)).wallets));
  const guest = await client('Sam');
  await guest.click('[data-start=join]'); await guest.fill('#ss-code', 'PAY777'); await guest.click('#ss-join'); await guest.waitForTimeout(2500);
  await until(guest, () => !!__infra.lab.world.operations.game.wallets?.sam);
  check('Guest Sam gets a $500 wallet', (await cash(guest, 'Sam')) === 500, JSON.stringify((await game(guest)).wallets));
  check('Guest sees the wallet badge', await guest.evaluate(() => !document.getElementById('cz-badge').hidden && /\$500/.test(document.getElementById('cz-cash').textContent)));

  // Salary: Sam orders, unboxes and places a rack; the placement pays Sam, once.
  const job = await guest.evaluate(async () => {
    const L = __infra.lab, op = L.world.operations, sleep = ms => new Promise(r => setTimeout(r, ms)), eng = a => L.lan.send({ type: 'engineering', action: a }).then(r => typeof r === 'string' ? r : r?.message);
    const go = async (x, z) => { L.look(x, z, x, 5, z - 4); for (let k = 0; k < 20; k++) { await sleep(150); const me = L.lan.players?.find(p => p.id === L.lan.selfID); if (me && Math.hypot(me.pose.x - x, me.pose.z - z) < 1) return; } };
    await go(-34, 2); const msgs = []; msgs.push(await eng({ type: 'order', sku: 'rack', quantity: 1 })); await sleep(300); const o = op.game.orders.at(-1); msgs.push(await eng({ type: 'unbox', id: o.id })); await sleep(300);
    const s = op.game.stock.filter(x => x.sku === 'rack' && !x.holders.length).at(-1); msgs.push(await eng({ type: 'grab', id: s.id })); await go(-3, 6); msgs.push(await eng({ type: 'rack', id: s.id, pad: 'PAD-R02' })); return msgs;
  });
  await guest.waitForTimeout(800);
  const samAfter = await cash(guest, 'Sam');
  check('Placing a rack pays Sam a salary (unbox $15 + rack $150)', samAfter === 500 + 15 + 150, samAfter + ' · ' + job.join(' | '));
  await guest.screenshot({ path: path.join(out, 'payday-salary.png') });

  // The casino: doors open, walk in, look around.
  await host.evaluate(() => { __infra.lab.enter(); __infra.lab.look(5, 50, 5, 6, 60); }); await host.waitForTimeout(1200);
  await host.screenshot({ path: path.join(out, 'casino-entrance.png') });
  const door = await host.evaluate(() => { const c = __infra.lab.casinoScene; return { doorway: c.clear(5, 55.5), inside: c.clear(0, 66), table: c.clear(-6, 74), wall: c.clear(-10, 55.5) }; });
  check('Casino doorway and room are walkable in Payday; tables and walls block', door.doorway && door.inside && !door.table && !door.wall, JSON.stringify(door));
  await host.evaluate(() => __infra.lab.look(-14, 64, 6, 4, 82, 9.7)); await host.waitForTimeout(1200);
  await host.screenshot({ path: path.join(out, 'casino-room.png') });

  // Blackjack: both sit, deal, both stand, settle.
  check('Darja bets $500 at blackjack', /Seat taken/.test(await casino(host, { type: 'bj-bet', amount: 500 })));
  check('Sam bets $50 at blackjack', /Seat taken/.test(await casino(guest, { type: 'bj-bet', amount: 50 })));
  await casino(guest, { type: 'bj-deal' });
  for (let i = 0; i < 12; i++) { g = await game(host); const t = g.casino.blackjack; if (t.phase !== 'playing') break; const turn = t.seats[t.turn]?.name; await casino(turn === 'Darja' ? host : guest, { type: 'bj-stand' }); await host.waitForTimeout(200); }
  await until(host, () => __infra.lab.world.operations.game.casino.blackjack.phase === 'done', null, 8000);
  g = await game(host); const bj = g.casino.blackjack;
  check('Blackjack hand settled for both players', bj.phase === 'done' && bj.seats.length === 2 && bj.seats.every(s => s.result), JSON.stringify(bj.seats.map(s => [s.name, s.cards, s.result, s.payout])) + ' dealer ' + JSON.stringify(bj.dealer));
  await host.evaluate(() => __infra.lab.look(-6, 82, -6, 3, 74, 11)); await host.waitForTimeout(800); await host.screenshot({ path: path.join(out, 'blackjack-table.png') });
  await host.evaluate(() => { const ui = [...document.querySelectorAll('#casino-panel')][0]; }); await host.evaluate(() => __infra.lab.world && document.dispatchEvent(new Event('noop')));
  const opened = await host.evaluate(() => { const L = __infra.lab; return true; });
  // Roulette: Darja bets red, Sam bets 17, spin, settle.
  const before = { d: await cash(host, 'Darja'), s: await cash(host, 'Sam') };
  await casino(host, { type: 'rl-bet', kind: 'red', amount: 200 }); await casino(guest, { type: 'rl-bet', kind: 'straight', value: 17, amount: 20 });
  check('Spin starts (no more bets)', /spinning/i.test(await casino(guest, { type: 'rl-spin' })));
  await host.evaluate(() => __infra.lab.look(16, 81, 14, 3, 74, 11)); await host.waitForTimeout(2500); await host.screenshot({ path: path.join(out, 'roulette-spinning.png') });
  await until(host, () => __infra.lab.world.operations.game.casino.roulette.phase === 'betting', null, 10000); await host.waitForTimeout(600);
  g = await game(host); const n = g.casino.roulette.history[0], red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
  check('Roulette pays out by the table', g.wallets.Darja === before.d - 200 + (red ? 400 : 0) && g.wallets.Sam === before.s - 20 + (n === 17 ? 720 : 0), 'ball ' + n + ' · ' + JSON.stringify(g.wallets));
  await host.screenshot({ path: path.join(out, 'roulette-landed.png') });
  // Lotto.
  const lt = await casino(guest, { type: 'lotto', picks: [3, 9, 14, 22, 31] });
  check('Sam buys a lotto ticket', /Lotto ·/.test(lt), lt);
  await host.evaluate(() => __infra.lab.look(5, 97 - 3, 5, 6, 89, 9.7)); await host.waitForTimeout(800); await host.screenshot({ path: path.join(out, 'lotto-machine.png') });
  // Loans.
  const d0 = await cash(host, 'Darja'), s0 = await cash(host, 'Sam');
  check('Darja lends Sam $1,000', /Lent \$1,000 to Sam/.test(await casino(host, { type: 'lend', to: 'Sam', amount: 1000 })));
  await host.waitForTimeout(400); g = await game(guest);
  check('Loan moves the money and is recorded', g.wallets.Darja === d0 - 1000 && g.wallets.Sam === s0 + 1000 && g.loans.some(l => l.lender === 'Darja' && l.borrower === 'Sam' && l.owed === 1000), JSON.stringify(g.wallets));
  const loanId = g.loans.find(l => l.owed > 0).id;
  check('Sam repays $400', /still owe \$600/.test(await casino(guest, { type: 'repay', id: loanId, amount: 400 })));
  // UI: open the casino panel as the guest on each tab.
  for (const tab of ['blackjack', 'roulette', 'lotto', 'wallet']) { await guest.evaluate(t => __infra.lab.casinoUI.show(t), tab); await guest.waitForTimeout(600); await guest.screenshot({ path: path.join(out, 'panel-' + tab + '.png') }); }
  check('Casino panel shows the wallet and tables', await guest.evaluate(() => /Rich list/.test(document.getElementById('cz-body').innerText) && /Sam/.test(document.getElementById('cz-body').innerText)));
  await guest.evaluate(() => __infra.lab.casinoUI.hide());
  // Campaign save untouched; Payday save written separately.
  await host.waitForTimeout(1500);
  check('Payday saved to its own file, Campaign save untouched', existsSync(path.join(saveDir, 'payday-save.json')) && !existsSync(campaignSave), JSON.stringify({ payday: existsSync(path.join(saveDir, 'payday-save.json')), campaign: existsSync(campaignSave) }));
  check('No page errors', !errors.length, errors.join(' | '));
} catch (e) { check('Run completed', false, e.stack || e.message); }
writeFileSync(path.join(out, 'payday-casino-e2e.json'), JSON.stringify({ results, errors }, null, 2));
await browser.close(); server.kill();
const failed = results.filter(r => !r.ok).length; console.log(failed ? failed + ' failed' : 'All Payday / casino checks passed'); process.exit(failed ? 1 : 0);
