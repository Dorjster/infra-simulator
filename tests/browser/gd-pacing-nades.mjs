// Global Defensive frame pacing in a 5 v 5 fight WITH GRENADES (v53 batch B integration measurement).
// Same frame clock as frame-pacing.mjs's gd mode (the frames the game drew, gfx.render; programs linked after the fight
// began), on the user's High preset at Retina size (1920 × 1080 device pixels, deviceScaleFactor 2), solo Defuse on
// Dust II with 9 bots. The match is restarted with $16000 so you can buy a HE, a flash, a smoke and your side's fire
// grenade at spawn; during the measured window you strafe, fire and throw one grenade every THROW_MS forward from your
// eye (the game's own throw action) while the bots fight. Works on a 52.0.5 tree too (same actions), for comparison.
//   node tests/browser/gd-pacing-nades.mjs <repo> <out> [throttle=1] [seconds=24] [dsf=2] [w=1920] [h=1080]
//   (w × h: device pixels — v53 stage 6: 2940 1912 is the user's real Retina window, 1470 × 956 at 2×)
// Muted: run through bt2.sh (its Chrome adds --mute-audio). Gate: fps ≥ 55, no frame over 100 ms after 3 s, ≥ 3 grenades.
// Diagnosis switches (environment): PROFILE=1 a CPU profile of the window (self time per file, natives by caller);
// STYLEPROBE=1 page writes per element; FONTPROBE=1 canvas font sets; BLUROFF=1 every backdrop-filter off (an experiment).
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { writeFileSync, mkdirSync } from 'node:fs';
const [root, out, throttle = '1', seconds = '24', dsf = '2', wArg = '1920', hArg = '1080'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const THROW_MS = 4000;
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'PERF02', HOST_KEY: 'k', CAMPAIGN_SAVE: '/tmp/perf-nades-' + Date.now() + '.json' }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const p = await b.newPage({ viewport: { width: Math.round(+wArg / +dsf), height: Math.round(+hArg / +dsf) }, deviceScaleFactor: +dsf }); p.on('dialog', d => d.accept()); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Pacer'); localStorage.setItem('infra-face-name', 'Pacer'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' }));
  const L = globalThis.__links = []; const f = WebGL2RenderingContext.prototype.linkProgram; WebGL2RenderingContext.prototype.linkProgram = function (x) { L.push(performance.now()); return f.call(this, x); }; });
// STYLEPROBE=1: count style / class / text writes on page elements during the measured window, by element
if (process.env.STYLEPROBE) await p.addInitScript(() => { const C = globalThis.__muts = new Map(); const name = n => { const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return '?'; let s = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''); const p = e.closest('[id]'); return (p && p !== e ? p.id + ' > ' : '') + s; };
  addEventListener('DOMContentLoaded', () => new MutationObserver(L => { if (!globalThis.__G?.on) return; for (const m of L) { const k = m.type + (m.attributeName ? ':' + m.attributeName : '') + ' ' + name(m.target); C.set(k, (C.get(k) || 0) + 1); } }).observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true })); });
// FONTPROBE=1: count canvas font sets during the measured window (which strings, how often)
if (process.env.FONTPROBE) await p.addInitScript(() => { const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font'), C = globalThis.__fonts = new Map(); Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', { get: d.get, set(v) { if (globalThis.__G?.on) { const k = v + ' | ' + (this.font === v ? 'same' : 'diff') + ' | ' + (new Error().stack.split('\n')[2] || '').trim().slice(0, 90); C.set(k, (C.get(k) || 0) + 1); } return d.set.call(this, v); }, configurable: true }); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '9'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.pacer, null, { timeout: 300000 });
await p.keyboard.press('Escape'); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
const act = action => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).then(r => r, e => ({ error: String(e?.message || e) })), action);
// $16000 from the next match, restart, buy the four grenades at spawn in the freeze time
const rules = await act({ type: 'settings', rules: { start: 16000 } }); const rs = await act({ type: 'restart' });
await p.waitForFunction(() => { const d = __infra.lab.world.operations.game.combat?.d; return d?.round?.phase === 'freeze' && (d.money?.pacer ?? d.cash?.pacer ?? 16000) >= 1000; }, null, { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(1500);
const team = await p.evaluate(() => __infra.lab.world.operations.game.combat?.d?.teams?.pacer);
const kinds = ['smoke', team === 'ct' ? 'incendiary' : 'molotov', 'he', 'flash'], bought = [];
for (const k of kinds) bought.push([k, await act({ type: 'buy-nade', kind: k })]);
await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 40000 }).catch(() => {});
await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
// BLUROFF=1 (an experiment): every backdrop-filter off, to see what the HUD's blurred backgrounds cost
if (process.env.BLUROFF) await p.addStyleTag({ content: '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' });
const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
await p.evaluate(() => { const I = __infra, g = I.gfx, f = g.render, T = globalThis.__G = { on: false, t: [], t0: 0, l0: 0 }; let last = 0; g.render = function () { const out = f.apply(this, arguments); if (T.on) { const now = document.timeline.currentTime ?? performance.now(); if (last) T.t.push([now - T.t0, now - last]); last = now; } return out; };
  T.start = () => { T.t = []; T.t0 = performance.now(); T.l0 = globalThis.__links.length; last = 0; T.on = true; }; T.start(); });
const throwOne = kind => p.evaluate(kind => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()).normalize(); return __infra.lab.lan.act({ type: 'arena', action: { type: 'throw', kind, x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: Math.max(d.y, .15), dz: d.z, strength: 'long', vx: 0, vy: 0, vz: 0 } }).then(r => r, e => ({ error: String(e?.message || e) })); }, kind);
// PROFILE=1: a CPU profile of the measured window; prints self time per module file and the top functions
if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
const thrown = []; const t0 = Date.now(); let k = 0, next = 1500, ki = 0;
while (Date.now() - t0 < +seconds * 1000) { const key = k++ % 4 < 2 ? 'KeyA' : 'KeyD'; await p.keyboard.down(key); await p.mouse.move(600, 400); await p.mouse.down(); await p.waitForTimeout(400); await p.mouse.up(); await p.keyboard.up(key);
  if (Date.now() - t0 > next && ki < kinds.length) { const r = await throwOne(kinds[ki]); thrown.push([kinds[ki], Math.round((Date.now() - t0) / 100) / 10, r?.error || 'ok']); ki++; next += THROW_MS; }
  await p.waitForTimeout(200); }
const T = await p.evaluate(() => { __G.on = false; const C = __infra.lab.world.operations.game.combat; return { t: __G.t, links: globalThis.__links.length - __G.l0, ratio: __infra.renderer.getPixelRatio(), calls: __infra.stats().calls, nadesLive: (C?.nades || []).map(n => n.kind + ':' + n.phase) }; });
if (process.env.PROFILE) { const { profile } = await cdp.send('Profiler.stop'), self = new Map(), byFile = new Map(), dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) || 0) + (profile.timeDeltas[i] || 0) / 1000);
  for (const n of profile.nodes) { const ms = dt.get(n.id) || 0; if (!ms) continue; const f = (n.callFrame.url || '').split('/').pop() || '(' + n.callFrame.functionName + ')', k = f + ' ' + (n.callFrame.functionName || '(anon)') + ':' + n.callFrame.lineNumber;
    self.set(k, (self.get(k) || 0) + ms); byFile.set(f, (byFile.get(f) || 0) + ms); }
  // a native's time (set font, bindTexture …) also counted under the function that called it
  const parent = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n])), viaCaller = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  for (const n of profile.nodes) { const ms = dt.get(n.id) || 0; if (!ms || n.callFrame.url) continue; const pn = byId.get(parent.get(n.id)); if (!pn) continue; const k = n.callFrame.functionName + ' ← ' + (pn.callFrame.url || '').split('/').pop() + ' ' + pn.callFrame.functionName + ':' + pn.callFrame.lineNumber; viaCaller.set(k, (viaCaller.get(k) || 0) + ms); }
  const top = (m, n = 30) => [...m].sort((a, b2) => b2[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]);
  const ver = JSON.parse((await import('node:fs')).readFileSync(root + '/package.json', 'utf8')).version + '-' + root.replace(/\/+$/, '').split('/').pop();
  writeFileSync(out + '/gd-pacing-nades-profile-' + ver + '-' + throttle + 'x.json', JSON.stringify({ version: ver, frames: T.t.length, byFile: top(byFile, 80), self: top(self, 60), nativeByCaller: top(viaCaller, 30) }, null, 1)); console.log('PROFILE by file', JSON.stringify(top(byFile).slice(0, 20))); }
const all = T.t.map(x => x[1]), after = T.t.filter(x => x[0] > 3000).map(x => x[1]), s = [...all].sort((a, b2) => a - b2), q = k2 => +s[Math.min(s.length - 1, Math.floor(s.length * k2))].toFixed(1);
const res = { throttle, dsf, frames: all.length, fps: +(all.length / ((T.t.at(-1)[0] - T.t[0][0]) / 1000)).toFixed(1), median: q(.5), p95: q(.95), p99: q(.99), max: q(1), over33: all.filter(x => x > 33.4).length, over50: all.filter(x => x > 50).length, over100After3s: after.filter(x => x > 100).length, programsLinked: T.links, pixelRatio: T.ratio, calls: T.calls, team, rules: rules?.error || 'ok', restart: rs?.error || 'ok', bought, thrown, nadesAtEnd: T.nadesLive, errors: errs.slice(0, 3) };
if (process.env.STYLEPROBE) console.log('MUTS', JSON.stringify(await p.evaluate(() => [...globalThis.__muts].sort((a, b) => b[1] - a[1]).slice(0, 25)), null, 1));
if (process.env.FONTPROBE) console.log('FONTS', JSON.stringify(await p.evaluate(() => [...globalThis.__fonts].sort((a, b) => b[1] - a[1]).slice(0, 12)), null, 1));
console.log(JSON.stringify(res, null, 1)); writeFileSync(out + '/gd-pacing-nades-' + throttle + 'x-dsf' + dsf + '.json', JSON.stringify(res, null, 1));
const ok = res.fps >= 55 && res.over100After3s === 0 && thrown.filter(t => t[2] === 'ok').length >= 3;
console.log((ok ? 'PASS' : 'FAIL') + ' GD 5v5 with grenades (CPU ' + throttle + '×, dsf ' + dsf + '): ' + res.fps + ' fps, p95 ' + res.p95 + ', p99 ' + res.p99 + ', max ' + res.max + ' ms, ' + thrown.filter(t => t[2] === 'ok').length + ' grenades thrown, ' + res.programsLinked + ' programs linked');
await b.close(); server.kill(); process.exit(ok ? 0 : 1);
