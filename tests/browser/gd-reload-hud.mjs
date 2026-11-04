// Global Defensive · reloads on the HUD like CS2 (v53 RELOAD, spec addendum 4), in the real game, muted: Defuse on Dust II
// with no bots, the pistol in hand. Every frame of a reload the HUD's magazine / reserve text is logged in the page
// (requestAnimationFrame) with the page clock:
//  · the HUD starts at CS2's numbers (weapons.vdata: the Glock-18 20 | 60, the USP-S 12 | 24);
//  · fired down to the low-ammo colour (≤ 20 % of the magazine, red), R: the count stays until CS2's mag-in moment
//    (the gun's WPN_RELOAD_ADD_AMMO, weapons-data magInMs) and changes in the first frame after it — the reserve gives
//    only the missing rounds — and the low colour goes with it;
//  · a switch to the knife just BEFORE the mag-in: back on the pistol the old count, on the HUD and on the host;
//  · a switch just AFTER it: the full magazine, on the HUD and on the host.
// Pictures: the bottom-centre HUD before, during (before the mag-in) and after → <out>/reload-hud.jpg (--pic <jpg>).
//   node tests/browser/gd-reload-hud.mjs <repo-root> <out-dir> [--pic <jpg>]
import { chromium } from 'playwright-core'; import { spawn, execFileSync } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const PIC = opt('--pic'); const [root = '.', out = path.join(os.tmpdir(), 'gd-reload-hud')] = argv; mkdirSync(out, { recursive: true });
let failed = 0; const lines = []; const check = (name, c, d = '') => { if (!c) failed++; const l = (c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 400)); lines.push(l); console.log(l); };
const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDRELOAD', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdrl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { s.kill(); } catch {} }); let err = ''; s.stderr.on('data', d => { err += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + err.slice(-300))), 120000); s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
try {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', showControls: false })); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '0');
  await p.evaluate(() => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', '2'], ['ss-ar-diff', 'easy']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } }); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.tester, null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'live', null, { timeout: 60000, polling: 200 });
  await p.keyboard.press('Digit2'); await p.waitForFunction(() => __infra.lab.pistol.current?.kind === 'pistol', null, { timeout: 5000 }); await p.waitForTimeout(1200);
  // the page's own log: every frame's HUD text and the page clock
  await p.evaluate(() => { const L = globalThis.__rl = []; const A = document.querySelector('#gd-wp .ammo .num'), R = document.querySelector('#gd-wp .reserve b'), box = document.querySelector('#gd-wp .ammo');
    const f = () => { L.push([performance.now(), A?.textContent, R?.textContent, box?.classList.contains('low') ? 1 : 0, __infra.lab.pistol.reloading ? 1 : 0]); if (L.length > 4000) L.splice(0, 2000); requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const W = await p.evaluate(() => { const w = __infra.lab.pistol.current; return { id: w.id, name: w.name, mag: w.mag, reserve: w.reserve, magIn: w.magInMs, magInEmpty: w.magInEmptyMs, rl: w.reloadMs }; }); console.log('pistol', JSON.stringify(W));
  const hud = () => p.evaluate(() => [document.querySelector('#gd-wp .ammo .num').textContent, document.querySelector('#gd-wp .reserve b').textContent, document.querySelector('#gd-wp .ammo').classList.contains('low')]);
  const hostAmmo = id => p.evaluate(id => __infra.lab.world.operations.game.combat.ammo?.tester?.[id] || null, id);
  check(`the HUD starts at CS2's numbers: ${W.name} ${W.mag} | ${W.reserve} (weapons.vdata)`, JSON.stringify((await hud()).slice(0, 2)) === JSON.stringify([String(W.mag), String(W.reserve)]) && (W.id === 'pistol' ? W.reserve === 60 : W.reserve === 24), JSON.stringify(await hud()));
  const fire = async k => { for (let i = 0; i < k; i++) { await p.evaluate(() => { __infra.lab.pistol.button(0, true); __infra.lab.pistol.button(0, false); }); await p.waitForTimeout(260); } };
  const left = Math.ceil(W.mag * .2) - 1; await fire(W.mag - left); await p.waitForTimeout(800);   // (fired down into the low colour: ≤ 20 % of the magazine)
  const before = await hud(); check(`fired down to ${left}: the low-ammo colour (CS2's HUD--ammo-clip--low)`, before[0] === String(left) && before[2] === true, JSON.stringify(before));
  await p.screenshot({ path: path.join(out, 'a-before.png'), clip: { x: 560, y: 960, width: 800, height: 120 } });
  // 1. a full reload, every frame logged
  const t0 = await p.evaluate(() => { __infra.lab.pistol.reload(); return { t: performance.now(), at: __infra.lab.pistol.magInAt }; });
  await p.waitForTimeout(Math.max(0, t0.at - t0.t - 120)); await p.screenshot({ path: path.join(out, 'b-during.png'), clip: { x: 560, y: 960, width: 800, height: 120 } });
  await p.waitForTimeout(W.rl + 300); await p.screenshot({ path: path.join(out, 'c-after.png'), clip: { x: 560, y: 960, width: 800, height: 120 } });
  const log = await p.evaluate(() => __rl.slice()); writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ W, t0, log }));
  const after = log.filter(r => r[0] >= t0.t), firstFull = after.find(r => r[1] === String(W.mag)), lastOld = [...after].reverse().find(r => r[1] === String(left));
  check(`R: the count stays ${left} until CS2's mag-in (${t0.at - t0.t} ms), then ${W.mag} in the first frame after it`, lastOld && firstFull && lastOld[0] < t0.at && firstFull[0] >= t0.at && firstFull[0] - t0.at < 60, JSON.stringify([lastOld?.[0] - t0.t, firstFull?.[0] - t0.t]));
  check(`…the reserve gives only the missing ${W.mag - left}: ${W.reserve} → ${W.reserve - (W.mag - left)}, at the same frame`, firstFull && firstFull[2] === String(W.reserve - (W.mag - left)) && after.filter(r => r[0] < t0.at).every(r => r[2] === String(W.reserve)), JSON.stringify(firstFull));
  check('…the low colour goes at the mag-in; the reload itself runs on to its end', firstFull && firstFull[3] === 0 && firstFull[4] === 1 && after.filter(r => r[0] < t0.at).every(r => r[3] === 1), JSON.stringify(firstFull));
  const h1 = await hostAmmo(W.id); check(`the host agrees: ${W.mag} | ${W.reserve - (W.mag - left)}`, JSON.stringify(h1) === JSON.stringify([W.mag, W.reserve - (W.mag - left)]), JSON.stringify(h1));
  // 2. a switch just before the mag-in: the old count kept
  await fire(3); await p.waitForTimeout(600); const m2 = Number((await hud())[0]), r2 = Number((await hud())[1]);
  { const t = await p.evaluate(() => { __infra.lab.pistol.reload(); return { t: performance.now(), at: __infra.lab.pistol.magInAt }; }); await p.waitForTimeout(Math.max(0, t.at - t.t - 150)); await p.keyboard.press('Digit3'); await p.waitForTimeout(500); await p.keyboard.press('Digit2'); await p.waitForTimeout(1500); }
  { const h = await hud(), ho = await hostAmmo(W.id); check(`a switch to the knife ~150 ms before the mag-in: back on the pistol ${m2} | ${r2}, the host too`, h[0] === String(m2) && h[1] === String(r2) && JSON.stringify(ho) === JSON.stringify([m2, r2]), JSON.stringify([h, ho])); }
  // 3. a switch just after it: the full magazine kept
  { const t = await p.evaluate(() => { __infra.lab.pistol.reload(); return { t: performance.now(), at: __infra.lab.pistol.magInAt }; }); await p.waitForTimeout(Math.max(0, t.at - t.t + 60)); await p.keyboard.press('Digit3'); await p.waitForTimeout(500); await p.keyboard.press('Digit2'); await p.waitForTimeout(1500); }
  { const h = await hud(), ho = await hostAmmo(W.id), want = [W.mag, r2 - (W.mag - m2)]; check(`a switch ~60 ms after the mag-in: ${want[0]} | ${want[1]} on the HUD and on the host`, h[0] === String(want[0]) && h[1] === String(want[1]) && JSON.stringify(ho) === JSON.stringify(want), JSON.stringify([h, ho])); }
  check('no page errors', !errs.length, errs.slice(0, 4).join(' | '));
  const dst = PIC || path.join(out, 'reload-hud.jpg');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(out, 'a-before.png'), '-i', path.join(out, 'b-during.png'), '-i', path.join(out, 'c-after.png'), '-filter_complex', '[0:v][1:v][2:v]vstack=inputs=3', '-q:v', '3', dst]); console.log('picture', dst);
} finally { await b.close(); try { s.kill(); } catch {} }
writeFileSync(path.join(out, 'result.txt'), lines.join('\n') + '\n'); console.log(failed ? `FAIL: gd-reload-hud · ${failed} failed` : 'PASS: gd-reload-hud'); process.exit(failed ? 1 : 0);
