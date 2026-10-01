// Multiplayer clip: the page is the host; 11 LAN bots walk loops through the rack aisle with different
// looks, carrying, crouching, pointing and emoting (real pose sync over the LAN server). 1 → 4 → 12 players.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process';
const [root, out] = process.argv.slice(2);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'MP12', HOST_KEY: 'k', CAMPAIGN_SAVE: '/tmp/mp-' + Date.now() + '.json' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
await page.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', showControls: false })); });
await page.goto(base + '/'); await page.waitForFunction(() => globalThis.__infra?.lab); await page.waitForTimeout(800);
await page.evaluate(async () => { const d = await (await fetch('/api/room')).json(); await __infra.lab.lan.join({ name: 'Host', code: d.roomCode, hostKey: d.hostKey }, true); });
await page.waitForTimeout(800); await page.evaluate(() => { __infra.lab.campaignUI.showStart(false); document.body.classList.add('in-game'); __infra.lab.enter(); for (const id of ['controls-hint', 'face-picker']) document.getElementById(id)?.setAttribute('hidden', ''); __infra.lab.look(-3, 26, -3, 4, 6); });
const post = (r, b, t) => fetch(base + '/api/' + r, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'X-Player-Token': t } : {}) }, body: JSON.stringify(b) }).then(x => x.json()).catch(() => ({}));
const looks = [['cute', 'yellow', 'cap', 'bands'], ['smile', 'red', 'helmet', 'vest'], ['bigeyes', 'blue', 'beanie', 'plain'], ['grumpy', 'green', 'headset', 'bands'], ['sleepy', 'pink', 'hair', 'vest'], ['angry', 'mint', 'cap', 'plain'], ['cute', 'blue', 'helmet', 'bands'], ['smile', 'green', 'beanie', 'vest'], ['bigeyes', 'yellow', 'headset', 'plain'], ['cute', 'red', 'hair', 'bands'], ['grumpy', 'mint', 'helmet', 'vest']];
const bots = []; let t0 = Date.now(), n = 0;
const tick = setInterval(() => { const t = (Date.now() - t0) / 1000; bots.forEach((b, i) => { const r = 5 + (i % 3) * 1.5, a = t * (.5 + (i % 4) * .08) + i * .9, carry = ['box', null, 'cable', null, 'rack', null][i % 6], emote = i === 3 && Math.floor(t) % 6 === 0 ? { id: 'wave', n: Math.floor(t / 6) } : i === 6 && Math.floor(t) % 7 === 0 ? { id: 'salute', n: Math.floor(t / 7) } : { id: null, n: 0 }; post('pose', { pose: { x: -3 + Math.cos(a) * r, y: i === 4 && Math.sin(t) > .3 ? 5.9 : 9.7, z: 12 + Math.sin(a) * r, yaw: -a - Math.PI / 2, active: true, crouched: i === 4 && Math.sin(t) > .3, face: looks[i][0], skin: looks[i][1], hat: looks[i][2], outfit: looks[i][3], carry, point: i === 9 && Math.sin(t * .7) > .5, emote } }, b.token); }); }, 125);
async function addBots(k) { while (bots.length < k) bots.push(await post('join', { code: 'MP12', name: ['Aru', 'Bat', 'Chi', 'Dul', 'Ene', 'Fox', 'Gan', 'Hul', 'Idr', 'Jav', 'Kha'][bots.length] })); }
await page.waitForTimeout(3000);               // 1 player (host only)
await addBots(3); await page.waitForTimeout(6000);  // 4 players
await addBots(11); await page.waitForTimeout(8000); // 12 players
await page.evaluate(() => __infra.lab.look(-12, 20, -3, 4, 12)); await page.waitForTimeout(5000);
const fps = await page.evaluate(async () => { const times = []; let last = performance.now(); for (let i = 0; i < 180; i++) { await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); times.push(now - last); last = now; } times.sort((a, b) => a - b); return { median: +times[90].toFixed(1), p95: +times[171].toFixed(1), calls: __infra.stats().calls, players: __infra.lab.lan.players.length }; });
await page.screenshot({ path: out + '/mp-12-players.png' });
clearInterval(tick); const vpath = await page.video().path(); await ctx.close(); console.log(JSON.stringify({ errors, fps, video: vpath }));
await browser.close(); server.kill(); process.exit(0);
