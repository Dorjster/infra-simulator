import { chromium } from 'playwright-core'; // npm i playwright-core (not a game dependency); CHROME=/path/to/chrome or a Playwright-installed Chromium
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
const exe = process.argv[2], out = process.argv[3], user = mkdtempSync(path.join(os.tmpdir(), 'infra-desktop-'));
const app = spawn(exe, ['--remote-debugging-port=9333', '--user-data-dir=' + user], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; app.stdout.on('data', d => log += d); app.stderr.on('data', d => log += d);
let browser; for (let i = 0; i < 40; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); break; } catch { await new Promise(r => setTimeout(r, 500)); } }
const ctx = browser.contexts()[0]; let page = ctx.pages()[0]; for (let i = 0; !page && i < 20; i++) { await new Promise(r => setTimeout(r, 500)); page = ctx.pages()[0]; }
await page.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await page.waitForTimeout(2000);
const r = {}; r.url = page.url(); r.desktop = await page.evaluate(() => !!window.infraDesktop?.isDesktop); r.node = await page.evaluate(() => typeof require);
r.info = await page.evaluate(() => window.infraDesktop.info());
await page.screenshot({ path: out + '/desktop-start.png' });
await page.click('[data-start=solo]'); await page.click('#ss-new'); await page.waitForTimeout(1500);
r.solo = await page.evaluate(() => ({ track: __infra.lab.world.operations.game.track, level: __infra.lab.world.operations.game.levels.current }));
r.lanJoined = await page.evaluate(() => ({ connected: __infra.lab.lan.connected, host: __infra.lab.lan.canManageWorld }));
await page.evaluate(() => __infra.lab.lan.send({ type: 'engineering', action: { type: 'order', sku: 'rack', quantity: 1, length: 1 } }));
await page.waitForTimeout(1500);
r.fileSave = existsSync(r.info.savePath) && JSON.parse(readFileSync(r.info.savePath, 'utf8')).operations.orders.length;
await page.screenshot({ path: out + '/desktop-solo.png' });
// LAN host: the room rebinds to 0.0.0.0 on the same port; a guest can reach it on the LAN address.
await page.evaluate(() => __infra.lab.campaignUI.showStart(true)); await page.click('[data-start=host]'); await page.waitForTimeout(2500);
r.host = await page.evaluate(() => window.infraDesktop.info());
r.hostPanel = await page.evaluate(() => document.getElementById('ss-sub').innerText.slice(0, 160));
r.hostContinues = await page.evaluate(() => !!document.getElementById('ss-host-continue'));
const lanIP = Object.values(os.networkInterfaces()).flat().find(i => i?.family === 'IPv4' && !i.internal)?.address;
if (lanIP) { try { const res = await fetch(`http://${lanIP}:${r.host.port}/api/room`); r.guestReach = (await res.json()).protocol; } catch (e) { r.guestReach = 'error ' + e.message; } }
await page.screenshot({ path: out + '/desktop-host.png' });
await page.evaluate(() => window.infraDesktop.stopHosting()); r.after = await page.evaluate(() => window.infraDesktop.info());
if (lanIP) { try { await fetch(`http://${lanIP}:${r.host.port}/api/room`, { signal: AbortSignal.timeout(1500) }); r.lanClosed = false; } catch { r.lanClosed = true; } }
await browser.close().catch(() => {});
app.kill('SIGTERM'); await new Promise(res => app.on('exit', res));
try { await fetch(`http://127.0.0.1:${r.host.port}/api/room`, { signal: AbortSignal.timeout(1500) }); r.serverStopped = false; } catch { r.serverStopped = true; }
r.userData = existsSync(user) ? 'ok' : 'missing';
console.log(JSON.stringify(r, null, 1));
process.exit(0);
