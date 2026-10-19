// Global Defensive's simpler way in and out, two browsers: the start panel offers Play solo, Host LAN game and Join
// LAN game (the rarely changed options folded under More options); Join opens the game-only join panel (no engineer
// title); the guest joins the host's match from it. In a match, Esc says what leaving does: the host sees Stop hosting,
// the guest Leave game. The guest leaves: disconnected, at the start screen, gone from the host's game. The host stops
// hosting: the match ends, back at the start screen. No page errors.
//   node tests/browser/gd-menus-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'MENU01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gm-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 260) : '')); }; const errs = [], dialogs = [];
async function open(who) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: 1200, height: 740 } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => { dialogs.push(who + ': ' + d.message()); d.accept(); });
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, who);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000); return p; }
const host = await open('Host'), guest = await open('Guest');
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForSelector('#ss-ar-solo');
const panel = await host.evaluate(() => ({ go: [...document.querySelectorAll('.gd-go button')].map(b => b.firstChild.textContent.trim()), more: !!document.querySelector('details.gd-more') && !document.querySelector('details.gd-more').open, folded: ['ss-ar-warm', 'ss-ar-freeze', 'ss-ar-diff'].every(id => document.getElementById(id)?.closest('details.gd-more')) }));
check('start panel: Play solo, Host LAN game, Join LAN game', JSON.stringify(panel.go) === JSON.stringify(['Play solo', 'Host LAN game', 'Join LAN game']), JSON.stringify(panel.go));
check('warmup, freeze time and difficulty folded under More options', panel.more && panel.folded);
await host.selectOption('#ss-ar-bots', '0'); await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 60000 });
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=arena]').click()); await guest.waitForSelector('#ss-ar-join'); await guest.evaluate(() => document.getElementById('ss-ar-join').click()); await guest.waitForSelector('#ss-code');
const jp = await guest.evaluate(() => ({ title: document.querySelector('#ss-sub h2')?.textContent, engineer: !!document.getElementById('ss-jtitle'), name: document.getElementById('ss-jname')?.value }));
check('Join LAN game: the game-only join panel (no engineer title), your name filled in', jp.title === 'Join a LAN game' && !jp.engineer && jp.name === 'Guest', JSON.stringify(jp));
await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 60000 });
check('the guest joins the host\'s match', await guest.evaluate(() => __infra.lab.world.operations.game.mode === 'arena' && __infra.lab.lan.connected));
await host.waitForTimeout(800);
const menu = async p => { await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy(false); }); await p.keyboard.press('Escape'); await p.waitForTimeout(400); return p.evaluate(() => { const m = document.getElementById('gd-menu'); return { open: m && !m.hidden, leave: m?.querySelector('[data-gm=leave]')?.textContent, sub: m?.querySelector('.gm-sub')?.textContent }; }); };
const hm = await menu(host); check('host\'s Esc menu: Stop hosting (ends the match for everyone)', hm.open && /^Stop hosting/.test(hm.leave) && /hosting/.test(hm.sub), JSON.stringify(hm));
await host.evaluate(() => document.querySelector('#gd-menu [data-gm=resume]').click());
const gm = await menu(guest); check('guest\'s Esc menu: Leave game (the others play on)', gm.open && /^Leave game/.test(gm.leave) && /LAN game/.test(gm.sub), JSON.stringify(gm));
await guest.evaluate(() => document.querySelector('#gd-menu [data-gm=leave]').click()); await guest.waitForTimeout(1500);
check('the guest left: disconnected, at the start screen', await guest.evaluate(() => !__infra.lab.lan.connected && !document.getElementById('start-screen').hidden));
await host.waitForFunction(() => !(__infra.lab.lan.players || []).some(p => p.name === 'Guest'), null, { timeout: 8000 }).catch(() => {});
check('…and is gone from the host\'s game', await host.evaluate(() => !(__infra.lab.lan.players || []).some(p => p.name === 'Guest')));
const hm2 = await menu(host); check('alone again, the host still sees Stop hosting', /^Stop hosting/.test(hm2.leave) || /^Leave match/.test(hm2.leave), hm2.leave);
await host.evaluate(() => document.querySelector('#gd-menu [data-gm=leave]').click()); await host.waitForTimeout(1500);
check('the host stopped: the match is over, back at the start screen', await host.evaluate(() => __infra.lab.world.operations.game.mode !== 'arena' && !document.getElementById('start-screen').hidden));
await host.screenshot({ path: path.join(out, 'host-end.jpg'), type: 'jpeg', quality: 75 });
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); for (const bw of browsers) await bw.close(); server.kill(); process.exit(ok === n ? 0 : 1);
