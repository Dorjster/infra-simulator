// Global Defensive · Defuse in a real browser (solo): start Defuse on Dune from the start screen; team HUD, $800, frozen
// during the freeze, buy menu with money, move after the freeze, key 5 + held click plants on site A (banner, bomb,
// beeps), the bomb explodes → Terrorists win; a bot added joins CT next round; no frame over 50 ms in play.
//   node tests/browser/arena-defuse-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'DEF001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'df-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 220) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Darja'); localStorage.setItem('infra-face-name', 'Darja');
  globalThis.__lf = []; let last = 0; const tick = t => { const hidden = id => { const e = document.getElementById(id); return !e || e.hidden; }; if (last && hidden('ar-load') && hidden('start-screen') && t - last > 50) __lf.push(Math.round(t - last)); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
const G = () => p.evaluate(() => { const g = __infra.lab.world.operations.game, d = g.combat?.d; return { kind: g.arena?.kind, map: g.arena?.map, team: d?.teams?.darja, money: d?.money?.darja, phase: d?.round?.phase, n: d?.n, carrier: d?.bomb?.carrier, winner: d?.round?.winner, reason: d?.round?.reason, score: d?.score }; });
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dune'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.darja, null, { timeout: 30000 });
let s = await G(); check('Defuse on Dune started; you are a Terrorist with $800', s.kind === 'defuse' && s.map === 'dune' && s.team === 't' && s.money === 800, JSON.stringify(s));
check('Team HUD (T score · clock · CT score) and money shown', await p.evaluate(() => /T/.test(document.getElementById('ar-top').textContent) && /CT/.test(document.getElementById('ar-top').textContent) && /\$ 800/.test(document.getElementById('ar-money').textContent)));
check('You carry the bomb (slot 5)', s.carrier === 'darja');
await p.screenshot({ path: path.join(out, 'defuse-freeze.png') });
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(300);
const pos = () => p.evaluate(() => [__infra.camera.position.x, __infra.camera.position.z]);
let a0 = await pos(); await p.keyboard.down('KeyW'); await p.waitForTimeout(700); await p.keyboard.up('KeyW'); let a1 = await pos();
check('Frozen during the freeze time', Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) < .5, Math.hypot(a1[0] - a0[0], a1[1] - a0[1]).toFixed(2));
await p.keyboard.press('KeyB'); await p.waitForTimeout(300); check('Buy menu shows your money', await p.evaluate(() => /\$800/.test(document.getElementById('ar-buy').textContent)));
check('An AK-47 is too dear at $800 (button disabled)', await p.evaluate(() => document.querySelector('#ar-buy [data-pick="ak"]').disabled));
await p.evaluate(() => document.querySelector('#ar-buy [data-pick="deagle"]').click()); await p.waitForTimeout(600);
s = await G(); check('Bought a Desert Eagle: $100 left', s.money === 100, s.money); await p.evaluate(() => document.querySelector('#ar-buy [data-act="close"]').click());
await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'live', null, { timeout: 20000 });
await p.evaluate(() => __infra.lab.enter()); a0 = await pos(); await p.keyboard.down('KeyW'); await p.waitForTimeout(700); await p.keyboard.up('KeyW'); a1 = await pos();
check('Moving after the freeze', Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) > 5, Math.hypot(a1[0] - a0[0], a1[1] - a0[1]).toFixed(1));
// Walk to site A (teleport for speed), bomb in hand, hold left click.
await p.evaluate(async () => { const { ARENA } = await import('./facility-layout.js'), { ARENA_MAPS } = await import('./arena-maps.js'); const [x, z] = ARENA_MAPS.dune.sites.A; __infra.camera.position.x = ARENA.cx + x; __infra.camera.position.z = ARENA.cz + z; });
await p.waitForTimeout(600); await p.keyboard.press('Digit5'); await p.waitForTimeout(800);
check('Key 5: the bomb in hand', await p.evaluate(() => __infra.lab.pistol.current?.id) === 'c4');
await p.mouse.move(640, 400); await p.mouse.down(); await p.waitForTimeout(1500);
check('Planting progress shown', await p.evaluate(() => !document.getElementById('ar-prog').hidden && /Planting/.test(document.getElementById('ar-prog').textContent)));
await p.waitForTimeout(2300); await p.mouse.up(); await p.waitForTimeout(500);
s = await G(); check('Bomb planted on A', s.phase === 'planted', JSON.stringify(s));
check('"THE BOMB HAS BEEN PLANTED" banner', await p.evaluate(() => /BOMB HAS BEEN PLANTED/.test(document.getElementById('ar-banner').textContent) && !document.getElementById('ar-banner').hidden));
check('Bomb model on the ground', await p.evaluate(() => { let n = 0; __infra.lab.arenaScene.group.traverse(o => { if (o.userData.ground) n++; }); return n >= 1; }));
await p.screenshot({ path: path.join(out, 'defuse-planted.png') });
await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'over', null, { timeout: 50000 });
s = await G(); check('The bomb went off: Terrorists win (target bombed)', s.winner === 't' && s.reason === 'bomb' && s.score.t === 1, JSON.stringify(s));
check('"TERRORISTS WIN" banner', await p.evaluate(() => /TERRORISTS WIN/.test(document.getElementById('ar-banner').textContent)));
await p.screenshot({ path: path.join(out, 'defuse-twin.png') });
await p.evaluate(() => __infra.lab.lan.send({ type: 'arena', action: { type: 'add-bot' } })); await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.n === 2, null, { timeout: 15000 });
s = await G(); const botTeam = await p.evaluate(() => { const d = __infra.lab.world.operations.game.combat.d; return Object.entries(d.teams).find(([k]) => k.startsWith('bot'))?.[1]; });
check('Round 2: the bot joined the Counter-Terrorists', s.n === 2 && botTeam === 'ct', botTeam);
check('Win money: $100 + $300 plant + $3,500 = $3,900', s.money === 3900, s.money);
check('No hitches in play (no frame over 50 ms)', (await p.evaluate(() => __lf)).length === 0, JSON.stringify(await p.evaluate(() => __lf)));
check('No page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
