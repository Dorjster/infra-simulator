// Payday shoot-out over LAN in real browsers. Guns start at 90,000,000₮, so the test plays Payday until it is
// saved, stops the room, gives both wallets money in the save, restarts and continues (proving wallets, guns
// and money survive a save). Then: the bar, the weapon market, and Darja (host) shooting Sam (guest) with a
// real aimed assault rifle — Sam's HP drops on his screen, he is knocked out, and respawns with 100 HP.
//   node tests/browser/payday-combat-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const saveDir = mkdtempSync(path.join(os.tmpdir(), 'combat-')), campaignSave = path.join(saveDir, 'campaign-save.json'), paydaySave = path.join(saveDir, 'payday-save.json');
let server = null, port = '0';
async function startServer() {
  server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: port, BIND: '127.0.0.1', ROOM_CODE: 'GUN777', HOST_KEY: 'hk', CAMPAIGN_SAVE: campaignSave, DELIVERY_SCALE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
  port = new URL(base).port; return base;
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const results = [], errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' · ' + String(detail).slice(0, 220) : '')); };
async function client(base, name) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
  page.on('pageerror', e => errors.push(name + ': ' + e.message)); page.on('dialog', d => d.accept());
  await page.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, name);
  await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForFunction(() => globalThis.__infra?.lab); await page.waitForTimeout(1200); return page;
}
const until = async (p, fn, arg, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(250); } return false; };
const casino = (p, action) => p.evaluate(a => __infra.lab.lan.send({ type: 'casino', action: a }).then(r => typeof r === 'string' ? r : r?.message || JSON.stringify(r)).catch(e => 'ERR ' + e.message), action);
const cash = (p, who) => p.evaluate(w => __infra.lab.world.operations.game.wallets?.[w]?.cash, who);
const findWallets = (o, at = '$', out = []) => { if (!o || typeof o !== 'object') return out; if (o.payday && 'wallets' in o) out.push([at, o]); for (const [k, v] of Object.entries(o)) findWallets(v, at + '.' + k, out); return out; };
try {
  // 1. Start Payday on LAN; Sam joins so both wallets exist; wait for the save.
  let base = await startServer(); let host = await client(base, 'Darja');
  await host.click('[data-start=payday]'); await host.waitForTimeout(700); await host.click('#ss-pay-host'); await host.waitForTimeout(2500);
  let guest = await client(base, 'Sam'); await guest.click('[data-start=join]'); await guest.fill('#ss-code', 'GUN777'); await guest.click('#ss-join'); await guest.waitForTimeout(2500);
  await until(guest, () => !!__infra.lab.world.operations.game.wallets?.sam); await casino(guest, { type: 'hello' }); await host.waitForTimeout(1500);
  // 2. Stop the room, fund both wallets in the save, restart, continue.
  server.kill(); await new Promise(r => setTimeout(r, 800)); await host.close(); await guest.close();
  const save = JSON.parse(readFileSync(paydaySave, 'utf8')), found = findWallets(save); console.log('payday state in save at', found.map(f => f[0]).join(', ') || 'nowhere');
  for (const [, g] of found) { g.wallets ??= {}; for (const [k, n] of [['darja', 'Darja'], ['sam', 'Sam']]) (g.wallets[k] ??= { name: n, cash: 0, salary: 0, won: 0, lost: 0, log: [] }).cash = 2e9; } writeFileSync(paydaySave, JSON.stringify(save));
  base = await startServer(); host = await client(base, 'Darja');
  await host.click('[data-start=payday]'); await host.waitForTimeout(700); await host.click('#ss-pay-continue'); await host.waitForTimeout(2500);
  check('Continue Payday keeps the wallets (2,000,000,000₮)', (await cash(host, 'darja')) === 2e9);
  guest = await client(base, 'Sam'); await guest.click('[data-start=join]'); await guest.fill('#ss-code', 'GUN777'); await guest.click('#ss-join'); await guest.waitForTimeout(2500);
  await until(guest, () => __infra.lab.world.operations.game.wallets?.sam?.cash === 2e9);
  // 3. Bar.
  const dr = await casino(guest, { type: 'drink', drink: 'whisky' }); await guest.waitForTimeout(700);
  const badge = await guest.evaluate(() => { const b = document.getElementById('cz-luck'); return b && !b.hidden ? b.textContent : ''; });
  check('Bar: whisky costs 38,000₮ and gives luck (good or bad) shown on the wallet badge', /LUCKY|UNLUCKY/.test(dr) && /lucky/.test(badge) && (await cash(host, 'sam')) === 2e9 - 38000, dr + ' · ' + badge);
  await guest.evaluate(() => { __infra.lab.enter(); __infra.lab.casinoUI.show('bar'); }); await guest.waitForTimeout(900); await guest.screenshot({ path: path.join(out, 'bar.png') }); await guest.evaluate(() => __infra.lab.casinoUI.hide());
  // 4. Weapon market.
  check('Market: Darja buys the AK-47 (3,960,000₮)', /Bought the AK-47/.test(await casino(host, { type: 'buy-weapon', weapon: 'ak' })));
  check('Market: Sam buys the Glock-18 (1,980,000₮)', /Bought the Glock-18/.test(await casino(guest, { type: 'buy-weapon', weapon: 'pistol' })));
  check('Market: buying a gun you own is refused', /already own/.test(await casino(host, { type: 'buy-weapon', weapon: 'ak' })));
  await host.evaluate(() => { __infra.lab.enter(); __infra.lab.casinoUI.show('guns'); }); await host.waitForTimeout(900); await host.screenshot({ path: path.join(out, 'weapon-market.png') }); await host.evaluate(() => __infra.lab.casinoUI.hide());
  // Darja's bank: only Darja sees it; giving through the screen reaches Sam; Sam can't use it.
  check("Bank tab shows only for Darja", await host.evaluate(() => __infra.lab.casinoUI.show('bank') && !document.getElementById('cz-tab-bank').hidden) && await guest.evaluate(() => !__infra.lab.casinoUI.show('bank') && document.getElementById('cz-tab-bank').hidden));
  const samBefore = await cash(host, 'sam');
  await host.selectOption('#cz-bank-to', 'Sam'); await host.fill('#cz-bank-amt', '50000000'); await host.click('[data-act="bank-give"]'); await host.waitForTimeout(800);
  await host.screenshot({ path: path.join(out, 'bank.png') });
  check("Darja's bank gives Sam 50,000,000₮ from the screen", (await cash(host, 'sam')) === samBefore + 5e7 && await until(guest, v => __infra.lab.world.operations.game.wallets.sam.cash === v, samBefore + 5e7, 4000), String(await cash(host, 'sam')));
  // Цалингийн зээл from the Wallet tab: choose 4 months, take 20,000,000₮, pay one installment (5,000,000 + 400,000 хүү).
  const s0 = await cash(host, 'sam'); await guest.evaluate(() => __infra.lab.casinoUI.show('wallet')); await guest.waitForTimeout(500);
  await guest.selectOption('#cz-loan-months', '4'); await guest.waitForTimeout(300);
  const preview = await guest.evaluate(() => document.getElementById('cz-body').innerText);
  await guest.click('[data-act="salary-loan"]'); await guest.waitForTimeout(900);
  check('Salary loan (Цалингийн зээл): 4 × 5,400,000₮ shown before taking it, +20,000,000₮ after', /4 × 5,400,000₮/.test(preview) && (await cash(host, 'sam')) === s0 + 2e7 && /Installment 1\/4/.test(await guest.evaluate(() => document.getElementById('cz-body').innerText)), String(await cash(host, 'sam') - s0));
  await guest.click('[data-pay-installment]'); await guest.waitForTimeout(900); await guest.screenshot({ path: path.join(out, 'salary-loan.png') });
  check('Paying one installment takes 5,400,000₮ and moves to 2/4', (await cash(host, 'sam')) === s0 + 2e7 - 5400000 && /Installment 2\/4/.test(await guest.evaluate(() => document.getElementById('cz-body').innerText)), String(await cash(host, 'sam') - s0));
  check("Sam can't use the bank", /Only Darja/.test(await casino(guest, { type: 'bank', to: 'Sam', amount: 1e9 })));
  await host.evaluate(() => __infra.lab.casinoUI.hide()); await guest.evaluate(() => __infra.lab.casinoUI.hide());
  // 5. Shoot-out: Sam stands near the casino entrance, Darja aims at him from 26 units away and fires.
  await guest.evaluate(() => { __infra.lab.enter(); __infra.lab.look(14, 64, 14, 9.7, 40); }); await host.evaluate(() => { __infra.lab.enter(); __infra.lab.look(14, 90, 14, 6, 64); });
  await host.waitForTimeout(2000);
  const drew = await host.evaluate(() => { const L = __infra.lab; L.pistol.equip('ak'); return L.pistol.current?.name; });
  check('Darja draws the AK-47 (key 4 cycles owned guns)', drew === 'AK-47', drew);
  await host.evaluate(() => __infra.lab.pistol.fire()); await guest.waitForTimeout(700);
  const hp1 = await guest.evaluate(() => document.getElementById('cb-hp-t')?.textContent);
  check('Combat: one aimed rifle shot takes Sam to 70 HP (or 25 on a head shot) on his own screen', /HP (70|25)$/.test(hp1), hp1);
  const fired = await host.evaluate(async () => { const L = __infra.lab, sleep = t => new Promise(r => setTimeout(r, t)); let n = 0; for (let i = 0; i < 8; i++) { if (L.pistol.fire()) n++; await sleep(160); } return n; });
  await guest.waitForTimeout(600);
  const down = await guest.evaluate(() => ({ down: !document.getElementById('cb-down').hidden, text: document.getElementById('cb-down').innerText.replace(/\s+/g, ' ') }));
  check('Combat: Sam is knocked out and sees who did it', down.down && /Darja/.test(down.text) && /AK-47/.test(down.text), JSON.stringify({ fired, ...down }));
  await guest.screenshot({ path: path.join(out, 'knocked-out.png') });
  const feed = await host.evaluate(() => document.getElementById('cb-feed').innerText); check('Kill feed on the host: Darja ⟶ Sam', /Darja.*Sam/s.test(feed), feed);
  await until(guest, () => document.getElementById('cb-hp-t')?.textContent === 'HP 100' && document.getElementById('cb-down').hidden, null, 9000);
  check('Combat: Sam respawns at the entrance with 100 HP', await guest.evaluate(() => document.getElementById('cb-hp-t')?.textContent === 'HP 100' && __infra.lab.world.operations.game.combat.respawns.sam >= 1));
  // 6. Third person (key P) shows your own engineer.
  await host.evaluate(() => { __infra.lab.thirdPerson.toggle(); }); await host.waitForTimeout(1200); await host.screenshot({ path: path.join(out, 'third-person.png') });
  // CS-style handling: magazine, reload, recoil moves the aim up.
  const cs = await host.evaluate(async () => { const L = __infra.lab, W = L.pistol, cam = __infra.camera, e = new cam.rotation.constructor().setFromQuaternion(cam.quaternion, 'YXZ'); const pitch0 = e.x; W.equip('ak'); const a0 = W.ammo; let n = 0; for (let i = 0; i < 5; i++) { if (W.fire()) n++; await new Promise(r => setTimeout(r, 120)); } const pitch1 = new cam.rotation.constructor().setFromQuaternion(cam.quaternion, 'YXZ').x; const a1 = W.ammo; const started = W.reload(); await new Promise(r => setTimeout(r, 2700)); return { a0, a1, n, started, a2: W.ammo, rose: pitch1 > pitch0, hud: document.getElementById('wp-count')?.textContent }; });
  check('AK-47: 30-round magazine, shots use ammo, recoil raises the aim, R reloads to 30', cs.a0 > 0 && cs.a1 === cs.a0 - cs.n && cs.rose && cs.started && cs.a2 === 30 && cs.hud === '30 / 30', JSON.stringify(cs));
  check('Third person: P switches the view', await host.evaluate(() => __infra.lab.thirdPerson.on));
  check('No page errors', !errors.length, errors.join(' | '));
} catch (e) { check('Run completed', false, e.stack || e.message); }
writeFileSync(path.join(out, 'payday-combat-e2e.json'), JSON.stringify({ results, errors }, null, 2));
await browser.close(); server?.kill();
const failed = results.filter(r => !r.ok).length; console.log(failed ? failed + ' failed' : 'All combat checks passed'); process.exit(failed ? 1 : 0);
