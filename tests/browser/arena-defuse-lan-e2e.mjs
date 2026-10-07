// Global Defensive · Defuse over LAN (two browsers): the host starts Defuse (Host on LAN), a guest joins through the
// start screen; they land on opposite teams; the host (T) plants on site A with key 5 + held click; the guest (CT)
// holds E on the bomb and defuses it → Counter-Terrorists win on both screens; no frame over 50 ms in play.
//   node tests/browser/arena-defuse-lan-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'DLAN01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'dl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 220) : '')); }; const errs = [];
async function open(who) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: 1200, height: 750 } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n);
    globalThis.__lf = []; let last = 0; const tick = t => { const hid = id => { const e = document.getElementById(id); return !e || e.hidden; }; if (last && hid('ar-load') && hid('start-screen') && t - last > 50) __lf.push(Math.round(t - last)); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, who);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200); return p; }
const host = await open('Host'), guest = await open('Guest');
const D = p => p.evaluate(() => { const d = __infra.lab.world.operations.game.combat?.d; return d && { teams: d.teams, phase: d.round?.phase, winner: d.round?.winner, reason: d.round?.reason, carrier: d.bomb?.carrier, score: d.score }; });
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dune'); await host.selectOption('#ss-ar-bots', '0');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.host, null, { timeout: 30000 });
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 });
let s = await D(host); check('Host is T, the guest CT', s.teams.host === 't' && s.teams.guest === 'ct', JSON.stringify(s.teams));
check('The host carries the bomb', s.carrier === 'host');
const sg = await D(guest); check('The guest sees the same teams', sg.teams.host === 't' && sg.teams.guest === 'ct');
await host.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'live', null, { timeout: 20000 });
const siteA = await host.evaluate(async () => { const { ARENA } = await import('./facility-layout.js'), { ARENA_MAPS } = await import('./arena-maps.js'); const [x, z] = ARENA_MAPS.dune.sites.A; return { x: ARENA.cx + x, z: ARENA.cz + z }; });
await host.evaluate(s => { __infra.lab.enter(); __infra.camera.position.x = s.x; __infra.camera.position.z = s.z; }, siteA); await host.waitForTimeout(700);
await host.keyboard.press('Digit5'); await host.waitForTimeout(800); await host.mouse.move(600, 375); await host.mouse.down(); await host.waitForTimeout(3700); await host.mouse.up(); await host.waitForTimeout(600);
s = await D(host); check('Host planted the bomb on A', s.phase === 'planted', JSON.stringify(s));
await guest.waitForFunction(() => /BOMB HAS BEEN PLANTED/.test(document.getElementById('ar-banner').textContent), null, { timeout: 5000 }).catch(() => {});
check('The guest sees "THE BOMB HAS BEEN PLANTED"', await guest.evaluate(() => /BOMB HAS BEEN PLANTED/.test(document.getElementById('ar-banner').textContent)));
check('The guest sees the bomb', await guest.evaluate(() => { let n = 0; __infra.lab.arenaScene.group.traverse(o => { if (o.userData.ground) n++; }); return n >= 1; }));
// The guest walks to the bomb (teleport) and holds E for 10 s (no kit).
const bomb = await guest.evaluate(() => __infra.lab.world.operations.game.combat.d.round.planted);
await host.evaluate(() => { __infra.camera.position.x -= 40; });   // the Terrorist steps away
await guest.evaluate(b => { __infra.lab.enter(); __infra.camera.position.x = b.x + 2; __infra.camera.position.z = b.z; }, bomb); await guest.waitForTimeout(700);
await guest.keyboard.down('KeyE'); await guest.waitForTimeout(1500);
check('Defusing progress on the guest', await guest.evaluate(() => /Defusing/.test(document.getElementById('ar-prog').textContent) && !document.getElementById('ar-prog').hidden));
await guest.waitForTimeout(9200); await guest.keyboard.up('KeyE'); await guest.waitForTimeout(600);
s = await D(host); check('Bomb defused: Counter-Terrorists win (host side)', s.winner === 'ct' && s.reason === 'defuse' && s.score.ct === 1, JSON.stringify(s));
check('"COUNTER-TERRORISTS WIN" on both screens', await host.evaluate(() => /COUNTER-TERRORISTS WIN/.test(document.getElementById('ar-banner').textContent)) && await guest.evaluate(() => /COUNTER-TERRORISTS WIN/.test(document.getElementById('ar-banner').textContent)));
await host.screenshot({ path: path.join(out, 'host-ct-win.png') }); await guest.screenshot({ path: path.join(out, 'guest-ct-win.png') });
const lf = [await host.evaluate(() => __lf), await guest.evaluate(() => __lf)]; check('No hitches in play on either screen', lf[0].length === 0 && lf[1].length === 0, JSON.stringify(lf));
check('No page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); for (const bw of browsers) await bw.close(); server.kill(); process.exit(ok === n ? 0 : 1);
