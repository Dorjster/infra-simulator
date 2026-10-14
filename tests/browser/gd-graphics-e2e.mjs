// Graphics settings in play (Settings → Graphics): every new setting is on the settings screen, and changing it there
// takes effect at once in the running game — shadows off / on and their edges, the glow and MSAA (the HDR buffer made
// or let go), tone mapping and brightness, texture filtering on the map's textures, map detail — with no page errors
// the gun hand (left: the first-person view mirrored), and no hitch once the menu is closed.
//   node tests/browser/gd-graphics-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GFX001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gx-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Gfx'); localStorage.setItem('infra-face-name', 'Gfx'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'dm'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.map, null, { timeout: 120000 });
await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy(false); }); await p.waitForTimeout(1500);
const S = () => p.evaluate(() => { const r = __infra.renderer, g = __infra.gfx; return { ...g.settings, post: g.post, shadowMap: r.shadowMap.enabled, type: r.shadowMap.type, tm: r.toneMapping, exp: r.toneMappingExposure }; });
const s0 = await S(); check('Quality mode, auto: medium shadows, glow, no MSAA', s0.shadows === 'medium' && s0.glow && s0.aa === 0 && s0.shadowMap && s0.post, JSON.stringify(s0));
await p.evaluate(() => __infra.lab.campaignUI.panel('settings')); await p.waitForTimeout(400);
const keys = ['graphics', 'shadows', 'shadowEdges', 'glow', 'antialias', 'reflections', 'textures', 'filtering', 'detail', 'rim', 'tonemap', 'brightness'];
const have = await p.evaluate(k => k.filter(x => document.querySelector(`#campaign-panel [data-set="${x}"]`)), keys); check('every graphics setting is on the settings screen', have.length === keys.length, keys.filter(k => !have.includes(k)).join(', ') || have.length);
const set = async (k, v) => { await p.evaluate(([k, v]) => { const el = document.querySelector(`#campaign-panel [data-set="${k}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); await p.waitForTimeout(250); };
await set('shadows', 'off'); let s = await S(); check('shadows off: no shadow map', s.shadows === 'off' && !s.shadowMap, JSON.stringify(s));
await set('shadows', 'high'); await set('shadowEdges', 'sharp'); s = await S(); check('shadows high, sharp edges', s.shadows === 'high' && s.shadowMap && s.type === 1 /* PCFShadowMap */, JSON.stringify(s));
await set('glow', 'off'); await set('antialias', '0'); s = await S(); check('no glow, no MSAA: drawn straight to the screen (no HDR buffer)', !s.glow && !s.post, JSON.stringify(s));
await set('antialias', '4'); s = await S(); check('MSAA 4×: the HDR buffer comes back for it', s.aa === 4 && s.post, JSON.stringify(s));
await set('tonemap', 'filmic'); await set('brightness', '1.3'); s = await S(); check('filmic tone mapping, brightness 130 %', s.tm === 4 /* ACESFilmic */ && Math.abs(s.exp - 1.3) < 1e-6, JSON.stringify(s));
await set('filtering', '16'); await p.waitForTimeout(300); const aniso = await p.evaluate(() => { let a = []; __infra.lab.arenaScene && __infra.scene.traverse(o => { if (o.userData.arena && o.material?.map) a.push(o.material.map.anisotropy); }); return a; });
check('texture filtering 16× on the map\'s textures', aniso.length > 0 && aniso.every(v => v === 16), aniso.length + ' textures, ' + [...new Set(aniso)].join('/'));
await set('detail', 'high'); const det = await p.evaluate(async () => (await import('/live-settings.js')).live.detail); check('map detail far: × 1.6 at once', det === 1.6, det);
await set('rim', 'off'); const rim = await p.evaluate(async () => (await import('/live-settings.js')).live.rim); check('player outline off at once', rim === false);
await set('gunHand', 'left'); const hand = await p.evaluate(() => { const h = __infra.camera.getObjectByName('gun-hand'); return h ? h.scale.x : null; }); check('gun hand left: the first-person view mirrored at once', hand < 0, hand);
await set('gunHand', 'right'); check('…and back to the right', await p.evaluate(() => __infra.camera.getObjectByName('gun-hand')?.scale.x) > 0);
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('infra-player-preferences'))); check('saved on this computer', saved.shadows === 'high' && saved.tonemap === 'filmic' && saved.filtering === '16' && saved.brightness === 1.3, JSON.stringify(saved));
await p.evaluate(() => __infra.lab.campaignUI.close()); await p.waitForTimeout(1500);
const frames = await p.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = t => { ts.push(t - last); last = t; if (ts.length < 150) requestAnimationFrame(f); else res(ts.slice(5)); }; requestAnimationFrame(f); }));
check('no hitch in play after the changes (no frame over 50 ms)', Math.max(...frames) < 50, 'max ' + Math.max(...frames).toFixed(1) + ' ms');
await p.screenshot({ path: path.join(out, 'graphics.jpg'), type: 'jpeg', quality: 80 });
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
