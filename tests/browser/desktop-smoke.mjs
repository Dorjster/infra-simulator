// Packaged desktop smoke test (Windows and macOS, run by CI after building the installers).
//   node tests/browser/desktop-smoke.mjs <path-to-app-binary> <report.json>
// Launches the packaged app with a temporary user folder, drives it over CDP and writes a JSON report:
// start screen, New Campaign → Level 0, Free Build keeps every rack visible and leaves the campaign
// untouched (Continue), OS clipboard round trip into a text field and the laptop CLI, the renderer / GPU
// the machine gave us with frame-time percentiles, and a clean quit (the bundled room stops).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
const [exe, out = 'desktop-smoke.json'] = process.argv.slice(2);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'));
const port = 9400 + Math.floor(Math.random() * 400);
const app = spawn(exe, [...(process.env.SMOKE_ARGS ? process.env.SMOKE_ARGS.split(' ') : []), '--remote-debugging-port=' + port, '--user-data-dir=' + mkdtempSync(path.join(os.tmpdir(), 'infra-smoke-'))], { stdio: 'ignore', env });
const report = { platform: process.platform + ' ' + os.release(), cpu: os.cpus()[0]?.model, checks: [], errors: [] };
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' · ' + String(detail).slice(0, 160) : '')); };
let browser; for (let i = 0; i < 80 && !browser; i++) { try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + port); } catch { await new Promise(r => setTimeout(r, 500)); } }
try {
  if (!browser) throw Error('The app did not open its debugging port');
  let page = browser.contexts()[0].pages()[0]; for (let i = 0; !page && i < 40; i++) { await new Promise(r => setTimeout(r, 500)); page = browser.contexts()[0].pages()[0]; }
  page.setDefaultTimeout(60000); page.on('pageerror', e => report.errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 90000 }); await page.waitForTimeout(1500);
  report.gpu = await page.evaluate(() => globalThis.__infraDiagnostics?.().gpu); report.software = await page.evaluate(() => globalThis.__infraDiagnostics?.().softwareRendering);
  check('Desktop bridge present, no Node in the page', await page.evaluate(() => !!window.infraDesktop?.isDesktop && typeof require === 'undefined'));
  await page.waitForFunction(() => document.querySelectorAll('#ss-grid .ss-card').length > 3, null, { timeout: 60000 }).catch(() => {});
  check('Start screen shows New Campaign', await page.evaluate(() => [...document.querySelectorAll('#ss-grid .ss-card strong')].some(x => x.textContent === 'New Campaign')));
  await page.click('[data-start=new]'); await page.click('#ss-new');
  // Wait on game state, not a fixed delay: software-rendered CI runners draw a few frames per second.
  await page.waitForFunction(() => __infra.lab.world.operations.game.track === 'levels' && /LEVEL 0/.test(document.getElementById('level-hud')?.innerText || ''), null, { timeout: 60000 }).catch(() => {});
  const st = await page.evaluate(() => ({ track: __infra.lab.world.operations.game.track, level: __infra.lab.world.operations.game.levels?.current, hud: document.getElementById('level-hud').innerText }));
  check('New campaign starts at Level 0 with the HUD', st.track === 'levels' && st.level === 0 && /LEVEL 0/.test(st.hud), st.hud.split('\n')[0]);
  // Clipboard: write through the OS clipboard, paste into a field and into the laptop CLI (single line = text only).
  let clip = null; try { await page.evaluate(() => navigator.clipboard.writeText('CI-Paste 42')); clip = true; } catch (e) { clip = e.message; }
  if (clip === true) {
    const cdp = await page.context().newCDPSession(page), paste = async () => { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: process.platform === 'darwin' ? 4 : 2, key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, commands: ['paste'] }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86 }); };
    await page.evaluate(() => __infra.lab.kit.show()); await page.waitForTimeout(400); await page.evaluate(() => { const e = document.getElementById('laptop-command'); e.value = ''; e.focus(); }); await paste(); await page.waitForTimeout(300);
    check('OS clipboard paste into the laptop CLI (text only, not run)', (await page.evaluate(() => document.getElementById('laptop-command').value)) === 'CI-Paste 42');
    await page.keyboard.press('Escape');
  } else check('OS clipboard write', false, clip);
  // Free Build from the start screen: every rack visible; Continue returns to the untouched campaign.
  await page.evaluate(() => __infra.lab.campaignUI.showStart(true)); await page.click('[data-start=free]'); await page.waitForFunction(() => __infra.lab.world.operations.game.mode === 'free', null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(1000);
  const fb = await page.evaluate(() => { __infra.lab.update?.(.1); return { mode: __infra.lab.world.operations.game.mode, hidden: __infra.lab.rackList.filter(r => +r.id.slice(1) <= 6 && !r.g.visible).map(r => r.id), devices: __infra.nodes.filter(n => n.active !== false && n.rack).length }; });
  check('Free Build shows racks R01–R06 with their devices', fb.mode === 'free' && !fb.hidden.length && fb.devices > 10, JSON.stringify(fb));
  // Frame times while walking the hall (whatever GPU this machine has).
  report.frames = await page.evaluate(async () => { const path = [[-20, 30, -3, 6, 0], [-6, 9, -6, 6, 0], [9, -8, 3, 6, 0], [-30, 5, -38, 4, 0]]; const t = []; let last = performance.now(); const t0 = last; while (performance.now() - t0 < 10000) { const u = (performance.now() - t0) / 10000 * (path.length - 1), i = Math.min(path.length - 2, Math.floor(u)), f = u - i, A = path[i], B = path[i + 1]; __infra.lab.look(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2], A[3], A[4]); await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); t.push(now - last); last = now; } t.sort((a, b) => a - b); const q = p => +t[Math.floor(t.length * p)].toFixed(1); return { fps: Math.round(t.length / 10), median: q(.5), p95: q(.95), p99: q(.99), over100: t.filter(x => x > 100).length, drawCalls: __infra.stats().calls, pixelRatio: __infra.renderer.getPixelRatio() }; });
  check('Frame times measured', report.frames.median > 0, JSON.stringify(report.frames));
  await page.evaluate(() => __infra.lab.campaignUI.showStart(true)); await page.waitForTimeout(800);
  const cont = await page.evaluate(() => document.querySelector('[data-start=continue]')?.innerText.replace(/\n/g, ' · ') || '');
  check('Continue Campaign offered after Free Build (campaign untouched)', /Level 0/.test(cont), cont);
  await page.click('[data-start=continue]'); await page.waitForFunction(() => __infra.lab.world.operations.game.track === 'levels', null, { timeout: 60000 }).catch(() => {});
  check('Continue returns to the campaign at Level 0', await page.evaluate(() => __infra.lab.world.operations.game.track === 'levels' && __infra.lab.world.operations.game.levels.current === 0));
  report.info = await page.evaluate(() => window.infraDesktop.info());
  check('No page errors', !report.errors.length, report.errors.join(' | '));
} catch (e) { check('Smoke run completed', false, e.message); }
await browser?.close().catch(() => {});
app.kill(); await new Promise(r => { app.on('exit', r); setTimeout(r, 5000); });
if (report.info?.port) { let stopped = true; try { await fetch('http://127.0.0.1:' + report.info.port + '/api/room', { signal: AbortSignal.timeout(1500) }); stopped = false; } catch {} check('Bundled room stops when the app quits', stopped); }
writeFileSync(out, JSON.stringify(report, null, 2));
const failed = report.checks.filter(c => !c.ok).length; console.log(failed ? failed + ' check(s) failed' : 'All desktop smoke checks passed'); process.exit(failed ? 1 : 0);
