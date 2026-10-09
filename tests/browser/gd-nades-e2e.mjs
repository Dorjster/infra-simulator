// Global Defensive grenades in a real browser (solo deathmatch): holding the button does not throw (the arc preview
// shows), releasing throws exactly one; full / medium / short throws land at clearly different distances; the smoke
// is a volume you can't see through; the molotov fire covers its area; a flashbang you face whites out the screen and
// wears off; the HE explodes; no frame over 50 ms; no page errors.   node tests/browser/gd-nades-e2e.mjs <repo> <out>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'NADE01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'nd-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Nader'); localStorage.setItem('infra-face-name', 'Nader'); localStorage.setItem('infra-face', 'smile');
  globalThis.__lf = []; globalThis.__loaf = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 50) __loaf.push({ d: Math.round(e.duration), s: (e.scripts || []).map(x => (x.sourceFunctionName || '') + '@' + (x.sourceURL || '').split('/').pop() + ':' + Math.round(x.duration)).slice(0, 4) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {} let last = 0; const tick = t => { const hid = id => { const e = document.getElementById(id); return !e || e.hidden; }; if (last && hid('ar-load') && hid('start-screen') && hid('ar-buy') && t - last > 50) __lf.push(Math.round(t - last)); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 220) : '')); };
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 }); await p.waitForTimeout(800);
await p.keyboard.press('Escape');
const buy = k => p.evaluate(k => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: k } }), k);
const nades = () => p.evaluate(() => __infra.lab.world.operations.game.combat.nades.map(x => ({ kind: x.kind, phase: x.phase, x: x.x, z: x.z, y: x.y })));
// A long open line: stand at one end of the widest clear lane we can find and look along it, level.
const lane = await p.evaluate(async () => { const { segmentClear } = await import('./arena-maps.js'); const S = __infra.lab.arenaScene, B = S.boxes, bd = S.bounds; let best = null;
  for (let x = bd.minX + 10; x < bd.maxX - 10; x += 6) for (let z = bd.minZ + 10; z < bd.maxZ - 10; z += 6) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let L = 0; while (L < 320 && segmentClear(B, x, 4, z, x + dx * (L + 6), 4, z + dz * (L + 6)) && segmentClear(B, x, 14, z, x + dx * (L + 6), 14, z + dz * (L + 6)) && S.clear(x + dx * (L + 6), z + dz * (L + 6))) L += 6; if (L > 20 && S.clear(x, z) && (!best || L > best.L)) best = { x, z, dx, dz, L }; }
  return best; });
const stand = () => p.evaluate(l => { __infra.lab.look(l.x, l.z, l.x + l.dx * 50, 9.7, l.z + l.dz * 50); }, lane);   // level: the arc stays under door lintels
check('found an open lane to throw along', lane && lane.L >= 150, JSON.stringify(lane));
// Flashbang in front of you, looking at it: white-out, then it wears off.
await buy('flash'); await p.evaluate(() => __infra.lab.enter()); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(150);
await p.evaluate(() => __infra.lab.pistol.button(2, true)); await p.waitForTimeout(300); await p.evaluate(() => __infra.lab.pistol.button(2, false)); await p.waitForTimeout(2300);
const wo = await p.evaluate(() => +document.getElementById('gd-flash').style.opacity); check('flashbang you face whites out the screen', wo > .5, wo);
await p.screenshot({ path: path.join(out, 'flashed.png') }); await p.waitForTimeout(5000); check('the flash wears off', await p.evaluate(() => +document.getElementById('gd-flash').style.opacity) < .05);
// Hold: no throw, the preview shows; release: one throw.
await buy('smoke'); await p.evaluate(() => __infra.lab.enter()); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(200);
await p.evaluate(() => __infra.lab.pistol.button(0, true)); await p.waitForTimeout(1200);
check('holding the button: nothing thrown yet', (await nades()).length === 0 && await p.evaluate(() => __infra.lab.pistol.nade?.state === 'held'));
check('…and the trajectory preview is shown', await p.evaluate(() => { let v = false; __infra.scene.getObjectByName('nades').traverse(o => { if (o.isLine && o.visible) v = true; }); return v; }));
await p.screenshot({ path: path.join(out, 'nade-preview.png') });
await p.evaluate(() => __infra.lab.pistol.button(0, false)); await p.waitForTimeout(700);
check('release: exactly one grenade thrown', (await nades()).length === 1 && await p.evaluate(() => !(__infra.lab.world.operations.game.arena.loadout.nader?.nades || []).length));
const land = async () => { for (let i = 0; i < 60; i++) { const s = (await nades()).filter(x => x.kind === 'smoke' && x.phase === 'smoke'); if (s.length) return s.at(-1); await p.waitForTimeout(100); } return null; };
const s1 = await land(), d1 = s1 && Math.hypot(s1.x - lane.x, s1.z - lane.z);
await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, 'smoke.png') });
// Smoke: a sight line through the cloud's middle is blocked by its core (a real volume).
const blocked = await p.evaluate(async s => { const THREE = await import('./three.module.js'); const r = new THREE.Raycaster(new THREE.Vector3(s.x - 70, s.y + 7, s.z), new THREE.Vector3(1, 0, 0), 0, 140); /* from outside the cloud, through its middle */ r.camera = __infra.camera; const hits = r.intersectObject(__infra.scene.getObjectByName('nades'), true).filter(h => h.object.isMesh && h.object.material.opacity > .9); return hits.length > 0; }, s1);
check('smoke: you cannot see through its middle', blocked);
check('smoke: ~4× the old area (44-unit radius)', await p.evaluate(async () => (await import('./arena-nades.js')).NADES.smoke.radius >= 44));
// Medium and short: shorter.
const throwSmoke = async (btns) => { await buy('smoke'); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(150);
  await p.evaluate(b => { for (const x of b) __infra.lab.pistol.button(x, true); }, btns); await p.waitForTimeout(500); await p.evaluate(b => { for (const x of b) __infra.lab.pistol.button(x, false); }, btns); await p.waitForTimeout(400); const before = (await nades()).filter(x => x.phase === 'smoke').length; for (let i = 0; i < 60; i++) { const s = (await nades()).filter(x => x.kind === 'smoke' && x.phase === 'smoke'); if (s.length > before) return s.at(-1); await p.waitForTimeout(100); } return null; };
const s2 = await throwSmoke([0, 2]), s3 = await throwSmoke([2]);
const d2 = s2 && Math.hypot(s2.x - lane.x, s2.z - lane.z), d3 = s3 && Math.hypot(s3.x - lane.x, s3.z - lane.z);
check('full ≫ medium ≫ short (left / both / right)', (d1 > d2 * 1.4 || d1 > lane.L - 30) && d2 > d3 * 1.5 && d3 > 8, [d1, d2, d3].map(v => v?.toFixed(0)).join(' / '));
check('a full throw goes far (most of a lane)', d1 > Math.min(150, lane.L - 10), d1?.toFixed(0) + ' of ' + lane.L);
// Molotov: the fire covers its area (many burning cells).
await buy('molotov'); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(150);   // a medium throw well away from us (standing in it would burn us)
await p.evaluate(() => { __infra.lab.pistol.button(0, true); __infra.lab.pistol.button(2, true); }); await p.waitForTimeout(400); await p.evaluate(() => { __infra.lab.pistol.button(0, false); __infra.lab.pistol.button(2, false); }); await p.waitForTimeout(2400);
const cells = await p.evaluate(() => { let c = 0; __infra.scene.getObjectByName('nades').traverse(o => { if (o.isInstancedMesh && o.material.blending === 2 && o.count > c) c = o.count; }); return c; });
check('molotov: fire drawn over its whole area (cells)', cells > 60, cells); await p.screenshot({ path: path.join(out, 'fire.png') });
// HE.
await buy('he'); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.evaluate(() => __infra.lab.pistol.button(0, true)); await p.waitForTimeout(300); await p.evaluate(() => __infra.lab.pistol.button(0, false));
let boom = false; for (let i = 0; i < 40 && !boom; i++) { await p.waitForTimeout(100); boom = (await nades()).some(x => x.kind === 'he' && x.phase === 'boom'); } check('HE explodes', boom);
check('no frame over 50 ms in play', (await p.evaluate(() => __lf)).length === 0, JSON.stringify(await p.evaluate(() => __lf)) + ' ' + JSON.stringify(await p.evaluate(() => __loaf.slice(-4))));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
