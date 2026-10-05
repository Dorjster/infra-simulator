// Two desktop apps on one computer (host + guest, separate user folders): the host starts Payday on LAN, the
// guest joins from the Join LAN screen with the host's IP (no port: 8080 is assumed). With a third argument
// (an unreachable address) the guest must stay on its start screen with a clear message, not a black window.
//   node tests/browser/desktop-join.mjs <repo-root> <out-dir> [bad-address]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import os from 'node:os'; import { mkdtempSync, mkdirSync } from 'node:fs'; import path from 'node:path';
const [root, out, badAddr] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const electron = path.join(root, 'desktop/node_modules/.bin/electron'), env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'));
const apps = [];
async function launch(port) { const dir = mkdtempSync(path.join(os.tmpdir(), 'dj-')); const p = spawn(electron, [path.join(root, 'desktop'), '--remote-debugging-port=' + port, '--user-data-dir=' + dir], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d); apps.push(p);
  let b; for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP('http://127.0.0.1:' + port); } catch { await new Promise(r => setTimeout(r, 500)); } }
  let pg; for (let i = 0; i < 40 && !pg; i++) { pg = b.contexts()[0]?.pages()[0]; if (!pg) await new Promise(r => setTimeout(r, 500)); }
  await pg.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await pg.evaluate(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); }); return { b, pg, log: () => log }; }
try {
  const H = await launch(9341); await new Promise(r => setTimeout(r, 2000)); const host = H.pg;
  await host.waitForTimeout(1500);
  await host.screenshot({ path: path.join(out, 'host-start.png') }); console.log('host url', host.url(), await host.evaluate(() => document.body.innerText.slice(0, 300)));
  await host.click('[data-start=payday]'); await host.waitForTimeout(600); await host.click('#ss-pay-host'); await host.waitForTimeout(3000);
  const info = await host.evaluate(async () => window.infraDesktop.hostLan()); const ip = Object.values(os.networkInterfaces()).flat().find(i => i?.family === 'IPv4' && !i.internal).address;
  console.log('host', JSON.stringify(info), 'ip', ip); await host.screenshot({ path: path.join(out, 'host.png') });
  const G = await launch(9342); let guest = G.pg;
  await guest.click('[data-start=join]'); await guest.waitForTimeout(500);
  if (process.env.DISCOVER) {   // one-click join from "Games on your network"
    await guest.waitForSelector('.ss-found-game', { timeout: 8000 }).catch(() => {});
    const listed = await guest.evaluate(() => document.getElementById('ss-found')?.innerText || ''); console.log('found', JSON.stringify(listed));
    await guest.fill('#ss-jname', 'Sam'); await guest.click('.ss-found-game', { noWaitAfter: true }); await new Promise(r => setTimeout(r, 6000));
    guest = G.b.contexts()[0].pages()[0]; console.log('guest url', guest.url());
    const st = await guest.evaluate(() => ({ connected: globalThis.__infra?.lab?.lan?.connected, players: globalThis.__infra?.lab?.lan?.players?.length, payday: !!globalThis.__infra?.lab?.world?.operations?.game?.payday })).catch(e => ({ err: e.message }));
    console.log('guest state', JSON.stringify(st)); for (const a of apps) a.kill(); process.exit(st.connected && st.players === 2 ? 0 : 1);
  }
  await guest.fill('#ss-jname', 'Sam'); await guest.fill('#ss-code', info.roomCode); await guest.fill('#ss-addr', badAddr || ip);
  await guest.click('#ss-join', { noWaitAfter: true }); await new Promise(r => setTimeout(r, +(process.env.WAIT || 6000)));
  guest = G.b.contexts()[0].pages()[0]; console.log('guest url', guest.url());
  await guest.screenshot({ path: path.join(out, 'guest.png') });
  const st = await guest.evaluate(() => ({ lab: !!globalThis.__infra?.lab, connected: globalThis.__infra?.lab?.lan?.connected, players: globalThis.__infra?.lab?.lan?.players?.length, payday: !!globalThis.__infra?.lab?.world?.operations?.game?.payday, body: document.body?.innerText.slice(0, 200) })).catch(e => ({ err: e.message }));
  console.log('guest state', JSON.stringify(st)); console.log('status', await guest.evaluate(() => document.getElementById('ss-join-status')?.innerText).catch(() => '(left page)')); console.log('invite bar', await host.evaluate(() => { const b = document.getElementById('lan-invite'); return b && !b.hidden ? b.innerText.replace(/\s+/g, ' ') : 'hidden'; }));
} catch (e) { console.log('ERR', e.message); }
for (const a of apps) a.kill(); process.exit(0);
