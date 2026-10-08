// Darja's pistol and the mouse-wheel fix, in real Chrome against a LAN room.
//   node tests/browser/pistol-and-wheel.mjs <repo-root> <out-dir>
// · A player named Darja has slot 4; key 4 draws the pistol, a shot throws pellets, 4 holsters it.
// · A player with any other name has no slot 4 and key 4 does nothing.
// · Over LAN the host sees a guest named Darja holding the pistol; a guest with another name who
//   claims `gun` in its pose is refused by the host.
// · Scrolling over an open panel (Campaign menu, laptop) scrolls that panel and never opens the emote
//   wheel; scrolling over the 3D view while walking still opens it.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GUN001', HOST_KEY: 'gun-key', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gun-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const results = [], errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')); };
async function player(name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  await page.addInitScript(n => { try { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); localStorage.setItem('infra-hat', 'cap'); localStorage.setItem('infra-outfit', 'bands'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); } catch {} }, name);
  await page.goto(base + '/'); await page.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await page.waitForTimeout(1200);
  return page;
}
try {
  // Host: Darja hosts Payday on LAN (guns exist only in Payday and the Arena).
  const host = await player('Darja');
  await host.click('[data-start=payday]'); await host.waitForTimeout(700); await host.click('#ss-pay-host'); await host.waitForTimeout(2500);
  await host.evaluate(() => { document.getElementById('lan-close')?.click(); __infra.lab.enter(); __infra.lab.look(-3, 9, -3, 6, 0); });
  check('Darja sees slot 4 · her gun in Payday', await host.evaluate(() => !document.getElementById('slot-pistol').hidden));
  await host.keyboard.press('4'); await host.waitForTimeout(300);
  check('Key 4 draws the pistol', await host.evaluate(() => __infra.lab.pistol.equipped));
  const fired = await host.evaluate(async () => { const ok = __infra.lab.pistol.fire(); await new Promise(r => setTimeout(r, 60)); return { ok, shots: __infra.lab.pistol.shots }; });
  check('A shot fires pellets', fired.ok && fired.shots === 1, JSON.stringify(fired));
  await host.waitForTimeout(40); await host.screenshot({ path: path.join(out, 'pistol-first-person.png') });
  await host.waitForTimeout(400); await host.screenshot({ path: path.join(out, 'pistol-impacts.png') });
  check('Rapid clicks are rate-limited', await host.evaluate(() => { const a = __infra.lab.pistol.fire(), b = __infra.lab.pistol.fire(); return a !== b || !a; }));

  // Guests: one named Darja (gets the pistol), one named Sam (refused).
  const room = { roomCode: 'GUN001' };
  const join = async name => (await (await fetch(base + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: room.roomCode, name }) })).json());
  const darja2 = await join('darja'), sam = await join('Sam');
  const pose = (t, x, extra) => fetch(base + '/api/pose', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Player-Token': t }, body: JSON.stringify({ pose: { x, y: 9.7, z: 7, yaw: 0, active: true, ...extra } }) });
  // Guests keep posting poses (as a real client does); Darja's guest fires once after a second.
  let shotN = 0; const keepAlive = setInterval(() => { pose(darja2.token, -6, { gun: true, shot: { n: shotN, pitch: 0 } }).catch(() => {}); pose(sam.token, 0, { gun: true, shot: { n: 0, pitch: 0 } }).catch(() => {}); }, 250);
  await host.waitForTimeout(1500); shotN = 1; await host.waitForTimeout(1200);
  const seen = await host.evaluate(() => { const out = {}; __infra.scene.traverse(o => { if (o.userData?.lanPlayer || o.name?.startsWith?.('lan-')) {} }); const ms = [...(__infra.lab.lan.models?.values?.() || [])]; return ms.map(m => ({ name: m.name, gun: !!m.gun, pistolVisible: !!m.parts?.pistol?.visible })); });
  check('Host sees guest "darja" holding the pistol', seen.some(m => /darja/i.test(m.name) && m.gun && m.pistolVisible), JSON.stringify(seen));
  check('Host refuses the pistol for guest "Sam"', seen.some(m => m.name === 'Sam' && !m.gun), JSON.stringify(seen));
  await host.evaluate(() => { __infra.lab.pistol.equip(false); __infra.lab.look(-3, 15, -6, 8, 7); }); await host.waitForTimeout(500);
  await host.screenshot({ path: path.join(out, 'pistol-teammate.png') }); clearInterval(keepAlive);

  // Key 4 for someone else does nothing.
  const other = await player('Sam');
  const code = await host.evaluate(() => __infra.lab.lan.roomCode);   // Sam joins Darja's Payday room
  await other.click('[data-start=join]'); await other.fill('#ss-code', code); await other.click('#ss-join'); await other.waitForTimeout(2500); await other.evaluate(() => __infra.lab.enter());
  await other.keyboard.press('4'); await other.waitForTimeout(200);
  check('Players not named Darja have no pistol', await other.evaluate(() => document.getElementById('slot-pistol').hidden && !__infra.lab.pistol.equipped));

  // Mouse wheel: over an open panel it scrolls the panel, never the emote wheel.
  await other.evaluate(() => __infra.lab.campaignUI.panel?.('settings') ?? __infra.lab.campaignUI.open?.('settings')); await other.waitForTimeout(400);
  const panelBox = await other.evaluate(() => { const e = document.getElementById('campaign-panel'); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (panelBox) { await other.mouse.move(panelBox.x, panelBox.y); await other.mouse.wheel(0, 400); await other.waitForTimeout(250); }
  check('Scrolling the Campaign menu does not open the emote wheel', panelBox && await other.evaluate(() => document.getElementById('emote-wheel').hidden), JSON.stringify(panelBox));
  await other.keyboard.press('Escape'); await other.waitForTimeout(300);
  await other.evaluate(() => __infra.lab.kit.show()); await other.waitForTimeout(400);
  const lap = await other.evaluate(() => { const e = document.getElementById('laptop-output'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await other.mouse.move(lap.x, lap.y); await other.mouse.wheel(0, 400); await other.waitForTimeout(250);
  check('Scrolling the laptop does not open the emote wheel', await other.evaluate(() => document.getElementById('emote-wheel').hidden));
  await other.evaluate(() => __infra.lab.kit.hide()); await other.evaluate(() => __infra.lab.enter()); await other.waitForTimeout(300);
  await other.mouse.move(720, 450); await other.mouse.wheel(0, 120); await other.waitForTimeout(250);
  check('Scrolling over the 3D view while walking opens the emote wheel', await other.evaluate(() => !document.getElementById('emote-wheel').hidden));
  check('No page errors', !errors.length, errors.join(' | '));
} catch (e) { check('Run completed', false, e.message); }
writeFileSync(path.join(out, 'pistol-and-wheel.json'), JSON.stringify({ results, errors }, null, 2));
await browser.close(); server.kill();
const failed = results.filter(r => !r.ok).length; console.log(failed ? failed + ' failed' : 'All pistol / wheel checks passed'); process.exit(failed ? 1 : 0);
