// Global Defensive grenades in a real browser (solo deathmatch): holding the button does not throw (no path drawn — CS2
// shows none in a match; practice does), releasing throws exactly one; full / medium / short throws land at clearly different distances; the smoke
// is a volume you can't see through; the molotov fire covers its area; a flashbang you face whites out the screen and
// wears off; the HE explodes; no frame over 50 ms; no page errors.   node tests/browser/gd-nades-e2e.mjs <repo> <out>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'NADE01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'nd-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Nader'); localStorage.setItem('infra-face-name', 'Nader'); localStorage.setItem('infra-face', 'smile');
  globalThis.__lf = []; globalThis.__loaf = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 50) __loaf.push({ d: Math.round(e.duration), s: (e.scripts || []).map(x => (x.sourceFunctionName || '') + '@' + (x.sourceURL || '').split('/').pop() + ':' + Math.round(x.duration)).slice(0, 4) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {} let last = 0; const tick = t => { const hid = id => { const e = document.getElementById(id); return !e || e.hidden; }; if (last && hid('ar-load') && hid('start-screen') && hid('ar-buy') && !(performance.now() < (globalThis.__pause || 0)) && t - last > 50) __lf.push(Math.round(t - last)); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 220) : '')); };
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 }); await p.waitForTimeout(800);
await p.keyboard.press('Escape');
const buy = k => p.evaluate(k => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: k } }), k);
// Screenshots stall the page's rendering (a test artefact): frames around them aren't counted.
const snap = async o => { await p.evaluate(() => { globalThis.__pause = performance.now() + 1e9; }); await p.screenshot(o); await p.evaluate(() => { globalThis.__pause = performance.now() + 400; }); };
const nades = () => p.evaluate(() => __infra.lab.world.operations.game.combat.nades.map(x => ({ id: x.id, kind: x.kind, phase: x.phase, x: x.x, z: x.z, y: x.y })));
// A long open line: stand at one end of the widest clear lane we can find and look along it, level.
await p.evaluate(() => { globalThis.__pause = performance.now() + 1e9; });   // the test's own lane search blocks the page: not counted
const lane = await p.evaluate(async () => { const { segmentClear } = await import('./arena-maps.js'); const S = __infra.lab.arenaScene, B = S.boxes, bd = S.bounds; let best = null;
  for (let x = bd.minX + 10; x < bd.maxX - 10; x += 6) for (let z = bd.minZ + 10; z < bd.maxZ - 10; z += 6) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let L = 0; while (L < 320 && segmentClear(B, x, 4, z, x + dx * (L + 6), 4, z + dz * (L + 6)) && segmentClear(B, x, 14, z, x + dx * (L + 6), 14, z + dz * (L + 6)) && S.clear(x + dx * (L + 6), z + dz * (L + 6))) L += 6; if (L > 20 && S.clear(x, z) && (!best || L > best.L)) best = { x, z, dx, dz, L }; }
  return best; });
await p.evaluate(() => { globalThis.__pause = performance.now() + 400; });
const stand = () => p.evaluate(l => { __infra.lab.look(l.x, l.z, l.x + l.dx * 50, 9.7, l.z + l.dz * 50); }, lane);   // level: the arc stays under door lintels
check('found an open lane to throw along', lane && lane.L >= 150, JSON.stringify(lane));
// Flashbang in front of you, looking at it: white-out, then it wears off.
await buy('flash'); await p.evaluate(() => __infra.lab.enter()); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(150);
await p.evaluate(() => __infra.lab.pistol.button(2, true)); await p.waitForTimeout(450); await p.evaluate(() => __infra.lab.pistol.button(2, false)); await p.waitForTimeout(2300);   // held past the pin pull (350 ms): a click alone never throws
const wo = await p.evaluate(() => +document.getElementById('gd-flash').style.opacity); check('flashbang you face whites out the screen', wo > .5, wo);
await snap({ path: path.join(out, 'flashed.png') }); await p.waitForTimeout(5000); check('the flash wears off', await p.evaluate(() => +document.getElementById('gd-flash').style.opacity) < .05);
// CS2: a quick click throws as soon as the pin is out; losing focus while holding cancels.
await buy('smoke'); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(150);
const n0 = (await nades()).length; await p.evaluate(() => { __infra.lab.pistol.button(0, true); __infra.lab.pistol.button(0, false); }); await p.waitForTimeout(900);
check('a quick click throws once the pin is out (CS2)', (await nades()).length === n0 + 1, (await nades()).length - n0);
await buy('smoke'); await p.waitForTimeout(300); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(150); const n1 = (await nades()).length;
await p.evaluate(() => __infra.lab.pistol.button(0, true)); await p.waitForTimeout(600); await p.evaluate(() => dispatchEvent(new Event('blur'))); await p.waitForTimeout(100); await p.evaluate(() => __infra.lab.pistol.button(0, false)); await p.waitForTimeout(900);
check('losing focus while holding cancels (no throw on release)', (await nades()).length === n1);
// Hold: no throw, no path drawn (a match: as CS2); release: one throw.
await buy('smoke'); await p.evaluate(() => __infra.lab.enter()); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(200);
const before = new Set((await nades()).map(x => x.id)), nh = before.size; await p.evaluate(() => __infra.lab.pistol.button(0, true)); await p.waitForTimeout(1200);
check('holding the button: nothing thrown yet', (await nades()).length === nh && await p.evaluate(() => __infra.lab.pistol.nade?.state === 'held'));
check('…and no trajectory line is drawn (practice only)', await p.evaluate(() => { let v = false; __infra.scene.getObjectByName('nades').traverse(o => { if (o.isLine && o.visible) v = true; }); return !v; }));
await snap({ path: path.join(out, 'nade-preview.png') });
await p.evaluate(() => __infra.lab.pistol.button(0, false)); await p.waitForTimeout(700);
check('release: exactly one grenade thrown', (await nades()).length === nh + 1 && await p.evaluate(() => !(__infra.lab.world.operations.game.arena.loadout.nader?.nades || []).length));
const land = async () => { for (let i = 0; i < 60; i++) { const s = (await nades()).filter(x => x.kind === 'smoke' && x.phase === 'smoke' && !before.has(x.id)); if (s.length) return s.at(-1); await p.waitForTimeout(100); } return null; };
const s1 = await land(), d1 = s1 && Math.hypot(s1.x - lane.x, s1.z - lane.z);
await p.waitForTimeout(1500); await snap({ path: path.join(out, 'smoke.png') });
// Smoke: a sight line through the cloud's middle, from outside it to outside it, is blocked (the volume the rules use).
const blocked = await p.evaluate(async s => { const { smokeBlocks } = await import('./arena-nades.js'), R = 144 * 2.54 / 16.5; return smokeBlocks(__infra.lab.world.operations.game, s.x - R - 20, s.y + 7, s.z, s.x + R + 20, s.y + 7, s.z); }, s1);   // (the game's own rule — what bots, sight and the flash use: a line through its middle is blocked by its dense core)
check('smoke: you cannot see through its middle', blocked);
check('smoke: CS2\'s size (144 units round)', await p.evaluate(async () => Math.abs((await import('./arena-nades.js')).NADES.smoke.radius - 144 * 2.54 / 16.5) < .5));
// Medium and short: shorter.
const throwSmoke = async (btns) => { await buy('smoke'); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(150);
  await p.evaluate(b => { for (const x of b) __infra.lab.pistol.button(x, true); }, btns); await p.waitForTimeout(500); await p.evaluate(b => { for (const x of b) __infra.lab.pistol.button(x, false); }, btns); await p.waitForTimeout(400); const before = (await nades()).filter(x => x.phase === 'smoke').length; for (let i = 0; i < 60; i++) { const s = (await nades()).filter(x => x.kind === 'smoke' && x.phase === 'smoke'); if (s.length > before) return s.at(-1); await p.waitForTimeout(100); } return null; };
const s2 = await throwSmoke([0, 2]), s3 = await throwSmoke([2]);
const d2 = s2 && Math.hypot(s2.x - lane.x, s2.z - lane.z), d3 = s3 && Math.hypot(s3.x - lane.x, s3.z - lane.z);
check('full ≫ medium ≫ short (left / both / right)', (d1 > d2 * 1.4 || d1 > lane.L - 30) && d2 > d3 * 1.5 && d3 > 8, [d1, d2, d3].map(v => v?.toFixed(0)).join(' / '));
check('a full throw goes far (most of a lane)', d1 > Math.min(135, lane.L - 10), d1?.toFixed(0) + ' of ' + lane.L);   // (CS2, level from the eye: ~730 u in the air + bounces at 45 % ≈ 970 u ≈ 150 here)
// Molotov: the fire covers its area (many burning cells).
await p.waitForFunction(() => !(__infra.lab.world.operations.game.combat.nades || []).some(n => n.phase === 'smoke'), null, { timeout: 30000 }).catch(() => {});   // a molotov into smoke fizzles (CS2): wait for the lane to clear
await buy('molotov'); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.waitForTimeout(150);   // a medium throw well away from us (standing in it would burn us)
await p.evaluate(() => { __infra.lab.pistol.button(0, true); __infra.lab.pistol.button(2, true); }); await p.waitForTimeout(400); await p.evaluate(() => { __infra.lab.pistol.button(0, false); __infra.lab.pistol.button(2, false); }); await p.waitForTimeout(2400);
const cells = await p.evaluate(() => { let c = 0; __infra.scene.getObjectByName('nades').traverse(o => { if (o.isInstancedMesh && o.material.blending === 2 && o.count > c) c = o.count; }); return c; });
check('molotov: fire drawn over its whole area (cells)', cells > 60, cells); await snap({ path: path.join(out, 'fire.png') });
// HE.
await buy('he'); await p.keyboard.press('Digit4'); await p.waitForTimeout(700); await stand(); await p.evaluate(() => __infra.lab.pistol.button(0, true)); await p.waitForTimeout(450); await p.evaluate(() => __infra.lab.pistol.button(0, false));
let boom = false; for (let i = 0; i < 40 && !boom; i++) { await p.waitForTimeout(100); boom = (await nades()).some(x => x.kind === 'he' && x.phase === 'boom'); } check('HE explodes', boom);
check('no frame over 50 ms in play', (await p.evaluate(() => __lf)).length === 0, JSON.stringify(await p.evaluate(() => __lf)) + ' ' + JSON.stringify(await p.evaluate(() => __loaf.slice(-4))));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
