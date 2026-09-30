// Continues from a Level 0 world (driven through game actions) and plays Level 1 through the real UI:
// procurement panel, carry/mount by aim + E, rear PSU cords by aim + E, laptop console via the Laptop tab
// and the terminal input, the patch-panel form in the Objective tab.
import { chromium } from 'playwright-core'; // npm i playwright-core (not a game dependency); CHROME=/path/to/chrome or a Playwright-installed Chromium
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const [root, out] = process.argv.slice(2); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'L1', HOST_KEY: 'k', CAMPAIGN_SAVE: '/tmp/l1-' + Date.now() + '.json' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
await page.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', 'Bot'); });
await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForFunction(() => globalThis.__infra?.lab); await page.waitForTimeout(1500);
await page.click('[data-start=solo]'); await page.click('#ss-new'); await page.waitForTimeout(1200);
// Level 0 quickly through game actions (already covered by level0.mjs through the UI).
await page.evaluate(() => { globalThis.INFRA_DELIVERY_SCALE = 0; const w = __infra.lab.world, act = a => w.apply({ type: 'engineering', action: a }, 'ENGINEER-01'), op = w.operations; const buy = sku => { act({ type: 'order', sku, quantity: 1, length: 5 }); const o = op.game.orders.at(-1); o.arrives = 0; act({ type: 'unbox', id: o.id }); return op.game.stock.filter(s => s.sku === sku).at(-1); }; const r = buy('rack'); act({ type: 'grab', id: r.id }); act({ type: 'rack', id: r.id, pad: 'PAD-R01' }); act({ type: 'rack-feed', rack: 'R01', feed: 'A' }); act({ type: 'rack-feed', rack: 'R01', feed: 'B' }); const k = buy('rail'); act({ type: 'grab', id: k.id }); act({ type: 'rails', id: k.id, rack: 'R01', unit: 30, units: 1 }); });
await page.waitForTimeout(2500);
const log = [], prompt = () => page.evaluate(() => document.getElementById('walk-prompt').textContent), hud = () => page.evaluate(() => document.getElementById('level-hud').innerText.replace(/\n/g, ' | '));
async function look(px, pz, tx, ty, tz, y) { await page.evaluate(a => __infra.lab.look(...a), [px, pz, tx, ty, tz, y]); await page.waitForTimeout(250); return prompt(); }
const press = async k => { await page.keyboard.press(k); await page.waitForTimeout(500); return page.evaluate(() => [...document.querySelectorAll('.game-toast')].map(x => x.textContent).join(' / ')); };
log.push({ hud: await hud() });
// Order the switch + a CAT6 lead from the Inventory tab.
await page.keyboard.press('i'); await page.waitForTimeout(300);
await page.evaluate(() => { for (const d of document.querySelectorAll('.inv-shop details')) d.open = true; });
await page.click('[data-order=fs148f]'); await page.waitForTimeout(200); await page.click('[data-order=cat6]'); await page.keyboard.press('Escape');
await page.evaluate(() => { for (const o of __infra.lab.world.operations.game.orders) o.arrives = 0; }); await page.waitForTimeout(1500);
const boxes = await page.evaluate(() => __infra.scene.children.filter(o => o.visible && o.children?.some(c => c.userData?.delivery)).map(o => ({ x: o.position.x, z: o.position.z, id: o.children.find(c => c.userData?.delivery).userData.delivery })));
const sw = boxes.find(b => b.id === 'ORDER-3') || boxes[0];
for (const b of boxes) { await look(b.x + 4, b.z + 3, b.x, 0.9, b.z); log.push({ ['open-' + b.id]: await press('e') }); await page.evaluate(() => document.getElementById('box-close')?.click()); }
log.push({ box: await look(sw.x + 4, sw.z + 3, sw.x, 0.9, sw.z) }); await press('e');
await page.evaluate(() => [...document.querySelectorAll('#box-items button')].find(b => /FortiSwitch/.test(b.textContent))?.click()); await page.waitForTimeout(400);
log.push({ carried: await page.evaluate(() => document.getElementById('carried-item').innerText) });
log.push({ mountAim: await look(-9, 8, -9, 0.55 + 29 * .267 + .12, 3.4) }); log.push({ mount: await press('e') });
const swNode = await page.evaluate(() => { const n = __infra.nodes.find(n => n.spec?.sku === 'fs148f'); return n && { id: n.id, x: n.pos.x, y: n.pos.y, z: n.pos.z, depth: n.depth || 4 }; });
log.push({ swNode });
// Rear: take a power cord from the box then plug PSU A and B.
for (const psu of [0, 1]) {
  await look(sw.x + 4, sw.z + 3, sw.x, 0.9, sw.z); await press('e'); await page.evaluate(() => [...document.querySelectorAll('#box-items button')].find(b => /power cord/i.test(b.textContent))?.click()); await page.waitForTimeout(300);
  log.push({ ['psu' + psu]: await look(swNode.x + .85 + psu * .35, -7, swNode.x + .85 + psu * .35, swNode.y, swNode.z - swNode.depth / 2 - .2) }); log.push({ plug: await press('e') });
}
await page.evaluate(() => { const n = __infra.nodes.find(n => n.spec?.sku === 'fs148f'); n.physical.bootUntil = 1; });
await page.waitForTimeout(1500); log.push({ hud: await hud() });
// Console: equip from the Laptop tab, aim at CONSOLE (rear on switches), E, type in the laptop terminal.
const consolePos = await page.evaluate(() => { const n = __infra.nodes.find(n => n.spec?.sku === 'fs148f'), p = n.ports.find(p => p.name === 'CONSOLE'); return { x: n.pos.x + p.pos.x, y: n.pos.y + p.pos.y, z: n.pos.z + p.pos.z }; });
log.push({ consoleNoTool: await look(consolePos.x, consolePos.z - 5, consolePos.x, consolePos.y, consolePos.z) });
await page.keyboard.press('j'); await page.waitForTimeout(300); await page.click('[data-tab=laptop]'); await page.waitForTimeout(300); await page.click('[data-equip="1"]'); await page.waitForTimeout(400);
log.push({ consoleAim: await look(consolePos.x, consolePos.z - 5, consolePos.x, consolePos.y, consolePos.z) }); log.push({ plugConsole: await press('e') });
await page.waitForTimeout(600); await page.screenshot({ path: out + '/l1-console.png' });
for (const c of ['config system interface', 'edit mgmt', 'set ip 10.10.70.8/24', 'set allowaccess ping https ssh', 'next', 'end', 'config system admin', 'edit admin', 'set password Northwind-2026', 'next', 'end']) { await page.fill('#laptop-command', c); await page.press('#laptop-command', 'Enter'); await page.waitForTimeout(150); }
log.push({ term: (await page.evaluate(() => document.getElementById('laptop-output').innerText)).slice(-500) });
await page.keyboard.press('Escape'); await page.waitForTimeout(1500); log.push({ hud: await hud() });
await page.screenshot({ path: out + '/l1-after-console.png' });
// Patch the central PC from the Objective tab, then set the switch port to VLAN 70 on the console.
await page.keyboard.press('j'); await page.waitForTimeout(400);
const patchForm = await page.evaluate(() => !!document.querySelector('[data-patch="ADMIN-PC"]'));
log.push({ patchForm });
if (patchForm) { await page.evaluate(() => document.querySelector('[data-do=patch]').click()); await page.waitForTimeout(800); }
const adminPort = await page.evaluate(() => { const pc = __infra.lab.world.office.state.pcs['ADMIN-PC']; const n = __infra.nodes.find(n => n.id === pc.switch); return pc.port >= 0 ? n.ports[pc.port].name : null; });
log.push({ adminPort, hud: await hud() });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await look(consolePos.x, consolePos.z - 5, consolePos.x, consolePos.y, consolePos.z); await press('l');
for (const c of ['config switch interface', 'edit ' + adminPort, 'set native-vlan 70', 'next', 'end']) { await page.fill('#laptop-command', c); await page.press('#laptop-command', 'Enter'); await page.waitForTimeout(150); }
log.push({ term2: (await page.evaluate(() => document.getElementById('laptop-output').innerText)).slice(-400) });
await page.keyboard.press('Escape'); await page.waitForTimeout(2500);
log.push({ hud: await hud(), level: await page.evaluate(() => __infra.lab.world.operations.game.levels.current) });
await page.screenshot({ path: out + '/l1-end.png' });
console.log(JSON.stringify({ errors, log }, null, 1)); await browser.close(); server.kill(); process.exit(0);
