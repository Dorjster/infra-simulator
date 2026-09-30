// Plays Level 0 through the real 3D interaction path: look at a target, read the prompt, press E.
import { chromium } from 'playwright-core'; // npm i playwright-core (not a game dependency); CHROME=/path/to/chrome or a Playwright-installed Chromium
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const [root, out] = process.argv.slice(2); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'L0', HOST_KEY: 'k', CAMPAIGN_SAVE: '/tmp/l0-'+Date.now()+'.json' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', 'Bot'); });
await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForFunction(() => globalThis.__infra?.lab); await page.waitForTimeout(2000);
await page.click('[data-start=solo]'); await page.click('#ss-new'); await page.waitForTimeout(1500);
await page.evaluate(() => { globalThis.INFRA_DELIVERY_SCALE = 0.05; document.querySelector('#face-picker')?.setAttribute('hidden',''); });
const log = [];
const prompt = () => page.evaluate(() => document.getElementById('walk-prompt').textContent);
const hud = () => page.evaluate(() => document.getElementById('level-hud').innerText.replace(/\n/g,' | '));
async function look(px, pz, tx, ty, tz, y) { await page.evaluate(a => __infra.lab.look(...a), [px, pz, tx, ty, tz, y]); await page.waitForTimeout(250); return prompt(); }
async function press(k, note) { const before = await prompt(); await page.keyboard.press(k); await page.waitForTimeout(600); const toast = await page.evaluate(() => [...document.querySelectorAll('.game-toast')].map(x => x.textContent).join(' / ')); log.push({ note, prompt: before, key: k, toast }); }
let i = 0; const shot = async n => page.screenshot({ path: `${out}/l0-${String(++i).padStart(2,'0')}-${n}.png` });
await shot('spawn'); log.push({ hud: await hud() });
// 1. Procurement kiosk (x -38, z 15): look at its screen.
log.push({ kiosk: await look(-32, 15, -37.4, 5.25, 15) }); await shot('kiosk-aim');
await press('e', 'kiosk'); await shot('kiosk-open');
await page.evaluate(() => document.querySelector('[data-order=rack]')?.click()); await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('.inv-shop details:nth-of-type(2)')?.setAttribute('open',''));
await page.evaluate(() => document.querySelector('[data-order=rail]')?.click()); await page.waitForTimeout(400);
await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
log.push({ hud: await hud() });
// 2. Delivery boxes around x -38, z -7..: aim at the first box.
console.log(JSON.stringify(log));const boxes = await page.evaluate(() => __infra.scene.children.filter(o => o.children?.some(c => c.userData?.delivery)).map(o => ({ x: o.position.x, z: o.position.z, id: o.children.find(c => c.userData?.delivery).userData.delivery })));
log.push({ boxes });
for (const b of boxes) { log.push({ box: await look(b.x + 4, b.z + 3, b.x, 0.9, b.z) }); await press('e', 'open box ' + b.id); await shot('box-' + b.id); await page.evaluate(() => document.getElementById('box-close')?.click()); }
// Reopen first box (rack) and take the rack out.
{ const b = boxes[0]; await look(b.x + 4, b.z + 3, b.x, 0.9, b.z); await press('e', 'choose item'); const items = await page.evaluate(() => [...document.querySelectorAll('#box-items button')].map(b => b.textContent)); log.push({ items }); await page.evaluate(() => document.querySelector('#box-items button')?.click()); await page.waitForTimeout(500); await shot('carry-rack'); log.push({ carried: await page.evaluate(() => document.getElementById('carried-item').textContent), hud: await hud() }); }
// 3. Walk to PAD-R01 (x -9, z 0) and aim at the bay.
log.push({ pad: await look(-9, 9, -9, -0.2, 0) }); await shot('pad-aim'); await press('e', 'place rack'); await shot('rack-placed');
// 4. Rear of R01: PDU inputs at y 13.5, z -3.05.
log.push({ feedA: await look(-10.2, -8, -10.2, 13.5, -3.05, 13.4) }); await shot('feed-aim'); await press('e', 'feed A');
log.push({ feedB: await look(-7.8, -8, -7.8, 13.5, -3.05, 13.4) }); await press('e', 'feed B'); await shot('feeds');
log.push({ hud: await hud() });
// 5. Rail kit from the second box to the rack front.
{ const b = boxes[1]; await look(b.x + 4, b.z + 3, b.x, 0.9, b.z); await press('e', 'rail box'); await page.evaluate(() => document.querySelector('#box-items button')?.click()); await page.waitForTimeout(400); }
log.push({ unit: await look(-9, 8, -9, 5.6, 3.4) }); await shot('rail-aim'); await press('e', 'rails');
await page.waitForTimeout(1500); log.push({ hud: await hud(), level: await page.evaluate(() => __infra.lab.world.operations.game.levels.current) }); await shot('level0-done');
console.log(JSON.stringify({ errors, log }, null, 1));
await browser.close(); server.kill(); process.exit(0);
