// Payday mode over LAN in real browsers: the host (Darja) starts Payday, a guest (Sam) joins.
// Checks wallets, salary, the casino doors, blackjack, roulette (3D ball lands on the host's number), a
// two-player Hold'em hand (each player sees only their own hole cards), slots, lotto, a stage tip with the
// requested dance, a loan, separate saves — and takes seat-view screenshots of every station.
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
const G = p => p.evaluate(() => { const g = __infra.lab.world.operations.game; return { payday: !!g.payday, mode: g.mode, wallets: Object.fromEntries(Object.values(g.wallets || {}).map(w => [w.name, w.cash])), loans: g.loans || [], t: g.casino?.tables }; });
const cash = async (p, who) => (await G(p)).wallets[who];
const until = async (p, fn, arg, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(250); } return false; };
const casino = (p, action) => p.evaluate(a => __infra.lab.lan.send({ type: 'casino', action: a }).then(r => typeof r === 'string' ? r : r?.message || JSON.stringify(r)).catch(e => 'ERR ' + e.message), action);
// Watch a client for `ms`: every 100 ms compare what its panel reveals with what its 3D table shows
// (__infra.lab.casinoScene.probe()). A reveal counts as wrong only if it is still ahead of the 3D on the
// next sample (one frame of slack). Returns { ok, samples, bad }.
const watch = (p, body, ms) => p.evaluate(async ({ body, ms }) => {
  const fn = new Function('probe', 'game', 'panel', body), sleep = t => new Promise(r => setTimeout(r, t)); let prev = null, bad = null, samples = 0;
  for (const t0 = performance.now(); performance.now() - t0 < ms; await sleep(100)) {
    const r = fn(() => __infra.lab.casinoScene.probe(), __infra.lab.world.operations.game, document.getElementById('cz-body')?.innerText || ''); samples++;
    if (!r.ok && prev && !prev.ok && !bad) bad = r.detail; prev = r;
  }
  return { ok: !bad, samples, bad };
}, { body, ms });
const seat = async (p, table, file, wait = 900) => { await p.evaluate(t => { __infra.lab.enter(); __infra.lab.casinoUI.show(t); }, table); await p.waitForTimeout(wait); if (file) await p.screenshot({ path: path.join(out, file) }); };
try {
  const host = await client('Darja');
  await host.evaluate(sel => document.querySelector(sel).click(), '[data-start=payday]'); await host.waitForTimeout(800); await host.evaluate(sel => document.querySelector(sel).click(), '#ss-pay-host'); await host.waitForTimeout(2500);
  let g = await G(host); check('Host started Payday', g.payday && g.mode === 'campaign');
  await until(host, () => !!__infra.lab.world.operations.game.wallets?.darja);
  check('Darja starts with 36,000,000₮', (await cash(host, 'Darja')) === 36000000);
  const guest = await client('Sam');
  await guest.evaluate(sel => document.querySelector(sel).click(), '[data-start=join]'); await guest.fill('#ss-code', 'PAY777'); await guest.evaluate(sel => document.querySelector(sel).click(), '#ss-join'); await guest.waitForTimeout(2500);
  await until(guest, () => !!__infra.lab.world.operations.game.wallets?.sam);
  check('Guest Sam gets a 1,800,000₮ wallet', (await cash(guest, 'Sam')) === 1800000);
  const job = await guest.evaluate(async () => {
    const L = __infra.lab, op = L.world.operations, sleep = ms => new Promise(r => setTimeout(r, ms)), eng = a => L.lan.send({ type: 'engineering', action: a }).then(r => typeof r === 'string' ? r : r?.message);
    const go = async (x, z) => { L.look(x, z, x, 5, z - 4); for (let k = 0; k < 20; k++) { await sleep(150); const me = L.lan.players?.find(p => p.id === L.lan.selfID); if (me && Math.hypot(me.pose.x - x, me.pose.z - z) < 1) return; } };
    await go(-34, 2); const msgs = [await eng({ type: 'order', sku: 'rack', quantity: 1 })]; await sleep(300); msgs.push(await eng({ type: 'unbox', id: op.game.orders.at(-1).id })); await sleep(300);
    const s = op.game.stock.filter(x => x.sku === 'rack' && !x.holders.length).at(-1); msgs.push(await eng({ type: 'grab', id: s.id })); await go(-3, 6); msgs.push(await eng({ type: 'rack', id: s.id, pad: 'PAD-R02' })); return msgs;
  });
  await guest.waitForTimeout(800); check('Jobs pay Sam a salary (unbox 54,000₮ + rack 540,000₮)', (await cash(guest, 'Sam')) === 2394000, job.join(' | '));
  const door = await host.evaluate(() => { const c = __infra.lab.casinoScene; return { doorway: c.clear(6, 55.5), inside: c.clear(2, 70), table: c.clear(-24, 88), stage: c.clear(14, 123), wall: c.clear(-10, 55.5) }; });
  check('Doorway and room walkable; tables, stage and walls block', door.doorway && door.inside && !door.table && !door.stage && !door.wall, JSON.stringify(door));
  await host.evaluate(() => { __infra.lab.enter(); __infra.lab.look(6, 44, 6, 8, 70); }); await host.waitForTimeout(1200); await host.screenshot({ path: path.join(out, 'casino-entrance.png') });
  await host.evaluate(() => __infra.lab.look(14, 64, 14, 6, 123, 14)); await host.waitForTimeout(1200); await host.screenshot({ path: path.join(out, 'casino-room.png') });

  // Blackjack.
  check('Darja bets at blackjack', /Seat taken/.test(await casino(host, { type: 'bj-bet', table: 'bj-1', amount: 2000000 })));
  check('Sam bets at blackjack', /Seat taken/.test(await casino(guest, { type: 'bj-bet', table: 'bj-1', amount: 200000 })));
  await casino(guest, { type: 'bj-deal', table: 'bj-1' }); await seat(host, 'bj-1', 'blackjack-dealing.png', 2600);
  await seat(guest, 'bj-1', null, 300);
  const bjWatch = watch(guest, `const t = game.casino.tables['bj-1'], d3 = probe()['bj-1'].cards.filter(([id, c]) => id.startsWith('d') && c !== '??').length, said = /\\b(WIN|LOSE|PUSH|BLACKJACK)\\b/.test(panel);
    return { ok: !said || (t.phase === 'done' && d3 === t.dealer.length), detail: JSON.stringify({ said, d3, dealer: t.dealer, phase: t.phase }) };`, 5500);
  for (let i = 0; i < 12; i++) { g = await G(host); const t = g.t['bj-1']; if (t.phase !== 'playing') break; await casino(t.seats[t.turn].name === 'Darja' ? host : guest, { type: 'bj-stand', table: 'bj-1' }); await host.waitForTimeout(200); }
  await until(host, () => __infra.lab.world.operations.game.casino.tables['bj-1'].phase === 'done', null, 8000); await host.waitForTimeout(1500);
  const bjw = await bjWatch; check('Blackjack: results appear only after the 3D dealer has turned and drawn every card', bjw.ok, JSON.stringify(bjw));
  const bj3d = await guest.evaluate(() => { const t = __infra.lab.world.operations.game.casino.tables['bj-1'], c = __infra.lab.casinoScene.probe()['bj-1'].cards; return { dealer: c.filter(([id]) => id.startsWith('d')).map(x => x[1]), want: t.dealer, seats: t.seats.map((s, i) => [c.filter(([id]) => id.startsWith('p' + t.round + ':' + i + ':')).map(x => x[1]), s.cards]) }; });
  check('Blackjack: guest\'s 3D table shows exactly the host\'s cards', JSON.stringify(bj3d.dealer) === JSON.stringify(bj3d.want) && bj3d.seats.every(([a, b]) => JSON.stringify(a) === JSON.stringify(b)), JSON.stringify(bj3d));
  await guest.evaluate(() => __infra.lab.casinoUI.hide());
  g = await G(host); check('Blackjack settled for both', g.t['bj-1'].seats.length === 2 && g.t['bj-1'].seats.every(s => s.result), JSON.stringify(g.t['bj-1'].seats.map(s => [s.name, s.cards, s.result])));
  await host.screenshot({ path: path.join(out, 'blackjack-settled.png') }); await host.evaluate(() => __infra.lab.casinoUI.hide());

  // Roulette: the 3D ball lands on the host's number when the panel reveals it.
  const before = { d: await cash(host, 'Darja'), s: await cash(host, 'Sam') };
  await casino(host, { type: 'rl-bet', table: 'rl-1', kind: 'red', amount: 1000000 }); await casino(guest, { type: 'rl-bet', table: 'rl-1', kind: 'straight', value: 17, amount: 70000 });
  await seat(host, 'rl-1', null, 300);
  check('Spin starts', /spinning/i.test(await casino(guest, { type: 'rl-spin', table: 'rl-1' })));
  await host.waitForTimeout(3000); await host.screenshot({ path: path.join(out, 'roulette-rolling.png') });
  const midPanel = await host.evaluate(() => !document.querySelector('#cz-body .cz-result') || /watch the wheel/.test(document.getElementById('cz-body').innerText));
  await host.waitForTimeout(5200); g = await G(host); const n = g.t['rl-1'].history[0];
  const landing = await host.evaluate(n => { const sc = __infra.scene, ball = []; sc.traverse(o => { if (o.isMesh && o.geometry?.parameters?.radius === .09) ball.push(o); }); const panel = document.querySelector('#cz-body .cz-result')?.textContent; return { panel, balls: ball.length }; }, n);
  check('Panel hides the number while the ball rolls, then shows the landed number', midPanel && +landing.panel === n, JSON.stringify({ midPanel, landing, n }));
  const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
  check('Roulette pays out by the table', g.wallets.Darja === before.d - 1000000 + (red ? 2000000 : 0) && g.wallets.Sam === before.s - 70000 + (n === 17 ? 2520000 : 0), 'ball ' + n);
  await host.screenshot({ path: path.join(out, 'roulette-landed.png') }); await host.evaluate(() => __infra.lab.casinoUI.hide());

  // Hold'em: both sit, a hand is dealt; each sees only their own hole cards; both check/call to showdown.
  check('Darja sits at Hold\'em', /Seated/.test(await casino(host, { type: 'pk-sit', table: 'pk-1', seat: 1, buyIn: 4000000 })));
  check('Sam sits at Hold\'em', /Seated/.test(await casino(guest, { type: 'pk-sit', table: 'pk-1', seat: 3, buyIn: 1200000 })));
  await until(host, () => __infra.lab.world.operations.game.casino.tables['pk-1'].phase === 'preflop', null, 12000);
  await guest.waitForTimeout(800);
  const views = { host: await host.evaluate(() => __infra.lab.world.operations.game.casino.tables['pk-1'].seats.map(s => s && s.cards)), guest: await guest.evaluate(() => __infra.lab.world.operations.game.casino.tables['pk-1'].seats.map(s => s && s.cards)) };
  check('Each player sees only their own hole cards', !views.host[1].includes('??') && views.host[3].every(c => c === '??') && !views.guest[3].includes('??') && views.guest[1].every(c => c === '??'), JSON.stringify(views));
  await seat(host, 'pk-1', 'poker-preflop.png', 2400);
  const pkWatch = watch(host, `const t = game.casino.tables['pk-1'], c = probe()['pk-1'].cards, board3 = c.filter(([id]) => id.startsWith('b')).length, boardPanel = ((panel.split('Board')[1] || '').split('pot')[0].match(/[♠♥♦♣]/g) || []).length;
    return { ok: boardPanel <= board3, detail: JSON.stringify({ boardPanel, board3, board: t.board }) };`, 6000);
  for (let i = 0; i < 20; i++) { g = await G(host); const t = g.t['pk-1']; if (t.phase === 'showdown' || t.phase === 'waiting') break; const who = t.seats[t.toAct]; if (!who) break; const page = who.name === 'Darja' ? host : guest; const mineBet = who.bet; await casino(page, { type: t.currentBet > mineBet ? 'pk-call' : 'pk-check', table: 'pk-1' }); await host.waitForTimeout(250); }
  const pkw = await pkWatch; check('Hold\'em: board cards appear in the panel only as they land on the 3D felt', pkw.ok, JSON.stringify(pkw));
  await host.waitForTimeout(800); g = await G(host); const pk = g.t['pk-1'];
  check('Hold\'em hand reaches showdown with a winner', pk.phase === 'showdown' && pk.results?.winners?.length && pk.board.length === 5, JSON.stringify(pk.results));
  check('At showdown both hands are revealed to both players', (await guest.evaluate(() => __infra.lab.world.operations.game.casino.tables['pk-1'].seats[1].cards)).every(c => c !== '??'));
  check('Chips conserved at the table', pk.seats.filter(Boolean).reduce((a, s) => a + s.stack, 0) === 5200000);
  await host.screenshot({ path: path.join(out, 'poker-showdown.png') }); await host.evaluate(() => __infra.lab.casinoUI.hide());

  // Slots, lotto, stage.
  await seat(guest, 'sl-1', null, 300); const badge0 = await guest.evaluate(() => document.getElementById('cz-cash').textContent);
  const slWatch = watch(guest, `const t = game.casino.tables['sl-1'], r3 = probe()['sl-1'].reels, done3 = t.last && r3.every((r, k) => r === t.last.reels[k]), said = /won|no win/i.test(panel);
    return { ok: !said || done3, detail: JSON.stringify({ said, r3, want: t.last?.reels, badge: document.getElementById('cz-cash').textContent }) };`, 3200);
  const sl = await guest.evaluate(() => __infra.lab.casinoUI.send({ type: 'sl-spin', table: 'sl-1', amount: 10000 })); check('Slot spin', /win|No win/i.test(sl), sl);
  await until(guest, b => document.getElementById('cz-cash').textContent !== b, badge0, 1500);    // the host's new world arrives
  const mid = await guest.evaluate(() => ({ msg: document.getElementById('cz-msg').textContent, badge: document.getElementById('cz-cash').textContent }));
  check('Slots: while the reels turn the panel says "Reels spinning…" and the badge shows only the bet taken', mid.msg === 'Reels spinning…' && mid.badge === (Number(badge0.replace(/[^0-9]/g, '')) - 10000).toLocaleString('en-US') + '₮', JSON.stringify({ badge0, ...mid }));
  const busy = await casino(host, { type: 'sl-spin', table: 'sl-1', amount: 10000 }); check('Slots: a second player can\'t pull the lever while the reels turn', /still spinning/.test(busy), busy);
  await guest.waitForTimeout(600); await guest.screenshot({ path: path.join(out, 'slots-spinning.png') });
  const slw = await slWatch; check('Slots: the result shows only when all three 3D reels have stopped on the host\'s symbols', slw.ok, JSON.stringify(slw));
  const sl3 = await guest.evaluate(() => ({ r3: __infra.lab.casinoScene.probe()['sl-1'].reels, want: __infra.lab.world.operations.game.casino.tables['sl-1'].last.reels, panel: [...document.querySelectorAll('#cz-body .cz-reels img')].map(i => i.alt) }));
  check('Slots: 3D reels, panel reels and host result agree', JSON.stringify(sl3.r3) === JSON.stringify(sl3.want) && sl3.panel.length === 3, JSON.stringify(sl3));
  await guest.screenshot({ path: path.join(out, 'slots-stopped.png') }); await guest.evaluate(() => __infra.lab.casinoUI.hide());
  await seat(guest, 'lotto', null, 300); await seat(host, 'lotto', null, 300);
  const ltWatch = watch(guest, `const panelBalls = [...document.querySelectorAll('#cz-body .cz-drawn span:not(.wait)')].map(s => +s.textContent), rack = probe().lotto.rack;
    return { ok: panelBalls.every(b => rack.includes(b)), detail: JSON.stringify({ panelBalls, rack }) };`, 7500);
  const lt = await casino(guest, { type: 'lotto', picks: [3, 9, 14, 22, 31] }); check('Lotto ticket', /Lotto ·/.test(lt), lt);
  const lt2 = await casino(host, { type: 'lotto', picks: [1, 2, 3, 4, 5] }); check('Lotto: a second ticket bought during a draw waits its turn', /Lotto ·/.test(lt2), lt2);
  await host.waitForTimeout(1500); const q = await host.evaluate(() => document.getElementById('cz-body').innerText);
  check('Lotto: the host\'s panel says its ticket is queued while Sam\'s is drawn', /in the queue/.test(q) && /drawing for Sam/.test(q), q.split('\n').filter(l => /queue|drawing/i.test(l)).join(' | '));
  await guest.waitForTimeout(1400); await guest.screenshot({ path: path.join(out, 'lotto-drawing.png') });
  const ltw = await ltWatch; check('Lotto: each ball appears in the panel only once the 3D ball is in the rack', ltw.ok, JSON.stringify(ltw));
  const rackSam = await guest.evaluate(() => ({ rack: __infra.lab.casinoScene.probe().lotto.rack, want: __infra.lab.world.operations.game.casino.tables.lotto.last.find(x => x.name === 'Sam').balls }));
  check('Lotto: the rack holds Sam\'s five balls in draw order', JSON.stringify(rackSam.rack) === JSON.stringify(rackSam.want), JSON.stringify(rackSam));
  await guest.screenshot({ path: path.join(out, 'lotto-drawn.png') });
  await host.waitForTimeout(8000); const rackDarja = await host.evaluate(() => ({ rack: __infra.lab.casinoScene.probe().lotto.rack, want: __infra.lab.world.operations.game.casino.tables.lotto.last.find(x => x.name === 'Darja').balls }));
  check('Lotto: then the machine draws Darja\'s ticket', JSON.stringify(rackDarja.rack) === JSON.stringify(rackDarja.want), JSON.stringify(rackDarja));
  await guest.evaluate(() => __infra.lab.casinoUI.hide()); await host.evaluate(() => __infra.lab.casinoUI.hide());
  const tip = await casino(host, { type: 'st-tip', table: 'stage', dance: 1, amount: 300000 }); check('Tip requests Climb & sit', /Climb & sit/.test(tip), tip);
  await until(guest, () => __infra.lab.world.operations.game.casino.tables.stage.dance === 1, null, 4000);
  check('Guest sees the requested dance', (await G(guest)).t.stage.dance === 1);
  await seat(host, 'stage', null, 300); for (const [i, ms] of [[1, 1500], [2, 2500]]) { await host.waitForTimeout(ms); await host.screenshot({ path: path.join(out, 'stage-dance-' + i + '.png') }); }
  for (const d of [0, 2, 3, 4, 5]) { await casino(guest, { type: 'st-tip', table: 'stage', dance: d, amount: 70000 }).catch(() => {}); }
  await host.evaluate(() => __infra.lab.casinoUI.hide());
  // Loan.
  const d0 = await cash(host, 'Darja'), s0 = await cash(host, 'Sam');
  check('Darja lends Sam 3,600,000₮', /Lent 3,600,000₮ to Sam/.test(await casino(host, { type: 'lend', to: 'Sam', amount: 3600000 })));
  await host.waitForTimeout(400); g = await G(guest); check('Loan recorded', g.wallets.Darja === d0 - 3600000 && g.wallets.Sam === s0 + 3600000);
  await seat(guest, 'wallet', 'panel-wallet.png', 600);
  await host.waitForTimeout(1500);
  check('Payday saved to its own file, Campaign save untouched', existsSync(path.join(saveDir, 'payday-save.json')) && !existsSync(campaignSave));
  check('No page errors', !errors.length, errors.join(' | '));
} catch (e) { check('Run completed', false, e.stack || e.message); }
writeFileSync(path.join(out, 'payday-casino-e2e.json'), JSON.stringify({ results, errors }, null, 2));
await browser.close(); server.kill();
const failed = results.filter(r => !r.ok).length; console.log(failed ? failed + ' failed' : 'All Payday / casino checks passed'); process.exit(failed ? 1 : 0);
