// Global Defensive smoke in a real browser (practice, standing bots; a CS2 map file when this computer has one — Dust II
// or Mirage — else the built-in map): a bot behind one smoke, behind two overlapping smokes (the second thrown later),
// seen from several places, and a bot inside a smoke are not on screen — the pixels of his outline are the same whether
// his model is drawn or not (the remote-model hiding switched off: this is the picture alone), while without smoke they
// clearly differ — and the rules agree (smokeBlocks); inside a smoke the screen is one even smoke colour (not a dimmed
// world); an effect in front of the smoke shows and one behind it doesn't; no shader is built when the first smoke pops
// (the pass was warmed at the match's start) and neither it nor the first HE into a smoke costs a frame over 34 ms; from
// other angles (left, right, a low eye) the screen hides him exactly when the rules do; leaving the match frees the
// smoke (no slot, nothing drawn).
// Screenshots: outside, edge, inside, overlap → <out> (and E_SHOTS if set).   node tests/browser/gd-smoke-e2e.mjs <repo> <out> [map|auto] [High|Medium|Low]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out, mapArg = 'auto', preset = 'High'] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const SHOTS = process.env.E_SHOTS || null; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SMKE2E', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'se-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [], glErr = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); p.on('console', m => { if (m.type() === 'error' && /shader|program|webgl|GL_/i.test(m.text())) glErr.push(m.text().slice(0, 300)); });
await p.addInitScript(pr => { localStorage.setItem('infra-name', 'Smoker'); localStorage.setItem('infra-face-name', 'Smoker'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: pr }));
  globalThis.__lf = []; let last = 0; const tick = t => { const hid = id => { const e = document.getElementById(id); return !e || e.hidden; }; if (last && hid('ar-load') && hid('start-screen') && !(performance.now() < (globalThis.__pause || 0)) && t - last > 50) __lf.push(Math.round(t - last)); if (last && globalThis.__rec) __rec.push(Math.round(t - last)); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, preset);
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const pause = ms => p.evaluate(ms => { globalThis.__pause = performance.now() + ms; }, ms);
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(500);
await p.selectOption('#ss-ar-kind', 'practice'); await p.waitForTimeout(300);
const options = await p.evaluate(() => [...document.querySelectorAll('#ss-ar-map option')].map(o => o.value));
const want = mapArg !== 'auto' ? [mapArg] : existsSync(path.join(root, 'user-maps')) ? ['dust2', 'mirage'] : []; const map = want.find(m => options.includes(m)) || options[0];
await p.selectOption('#ss-ar-map', map); await p.evaluate(() => { const s = document.getElementById('ss-pr-bots'); if (s) s.value = 'stand'; document.getElementById('ss-ar-solo').click(); });
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 }); await p.waitForTimeout(2500);
await p.keyboard.press('Escape'); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); });
console.log('map', map, 'preset', preset, 'post', await p.evaluate(() => __infra.gfx.post));
// In the page: the bots' models, a clear line to one of them, and a picture of his outline drawn with and without him.
await p.evaluate(async () => { const THREE = await import('./three.module.js'), N = await import('./arena-nades.js'), A = await import('./arena-maps.js'), F = await import('./facility-layout.js');
  const L = __infra.lab, G = () => L.world.operations.game, gl = __infra.renderer.getContext(), V = new THREE.Vector3(), B3 = new THREE.Box3();
  const M = () => A.ARENA_MAPS[G().arena.map], floor = (x, z, y) => { const nav = M()?.nav; const f = nav?.floorAt ? nav.floorAt(x - F.ARENA.cx, z - F.ARENA.cz, y) : null; return Number.isFinite(f) ? f : A.floorTop(L.arenaScene.boxes, x, z, y); };
  const sight = (ax, ay, az, bx, by, bz) => { const nav = M()?.nav; return nav?.sight ? nav.sight(ax - F.ARENA.cx, ay, az - F.ARENA.cz, bx - F.ARENA.cx, by, bz - F.ARENA.cz) : A.segmentClear(L.arenaScene.boxes, ax, ay, az, bx, by, bz); };
  const bots = () => [...(L.lan.models?.values?.() || [])].filter(m => /^BOT /.test(m.pname || m.name || ''));
  globalThis.__E = { THREE, N, G, floor, sight, bots,
    // the bot's outline on the drawing buffer (its model's box, projected), or null when off screen
    region(m) { const cam = __infra.camera; cam.updateMatrixWorld(); m.g.updateMatrixWorld(true); B3.setFromObject(m.g); const r = __infra.renderer, W = r.domElement.width, H = r.domElement.height; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) { V.set(i & 1 ? B3.max.x : B3.min.x, i & 2 ? B3.max.y : B3.min.y, i & 4 ? B3.max.z : B3.min.z).project(cam); if (V.z > 1) return null; const x = (V.x * .5 + .5) * W, y = (V.y * .5 + .5) * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1)); return x1 - x0 > 4 && y1 - y0 > 8 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; },
    read(r) { __infra.lab.nadeView?.update?.(0); /* (the clouds as a frame has them: pushed, then drawn) */ __infra.gfx.render(); const px = new Uint8Array(r.w * r.h * 4); gl.readPixels(r.x, r.y, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; },
    // how much of the outline changes when the bot is drawn (frac: share of pixels off by more than 24 of 255)
    diff(m) { const r = this.region(m); if (!r) return null; const was = m.g.visible; m.g.visible = true; const a = this.read(r); m.g.visible = false; const b = this.read(r); m.g.visible = was; let big = 0, sum = 0, max = 0;
      for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); sum += d; if (d > 24) big++; if (d > max) max = d; } const n = a.length / 4; return { frac: +(big / n).toFixed(4), mean: +(sum / n).toFixed(2), max, px: n }; },
    // the screen's upper middle (no gun, no HUD): luminance spread and mean (0 … 1)
    even() { const r = __infra.renderer, W = r.domElement.width, H = r.domElement.height, R = { x: Math.round(W * .2), y: Math.round(H * .45), w: Math.round(W * .6), h: Math.round(H * .4) }, px = this.read(R); let s = 0, s2 = 0, n = 0;
      for (let i = 0; i < px.length; i += 16) { const l = (.2126 * px[i] + .7152 * px[i + 1] + .0722 * px[i + 2]) / 255; s += l; s2 += l * l; n++; } const m = s / n; return { mean: +m.toFixed(3), sd: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(4) }; },
  };
  L.lan.setOcclusion?.(null);   // (the picture alone: no model hidden by the rule)
});
const bot = await p.evaluate(async () => { const E = __E; for (let i = 0; i < 40 && !E.bots().length; i++) await new Promise(r => setTimeout(r, 250)); const C = E.G().arena.bots || [];
  // a standing bot and a spot 70–95 units from him with a clear line at eye and chest height, on one floor
  for (const m of E.bots()) { const q = m.g.position, fb = q.y; for (const d of [85, 75, 95, 70]) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d, f = E.floor(x, z, fb + 6); if (!Number.isFinite(f) || Math.abs(f - fb) > 1.5) continue;
      let flat = true; for (let s = 1; s < 10 && flat; s++) { const u = s / 10, g = E.floor(x + (q.x - x) * u, z + (q.z - z) * u, fb + 6); if (!Number.isFinite(g) || Math.abs(g - fb) > 1.5) flat = false; }
      if (flat && E.sight(x, f + 9.7, z, q.x, fb + 9.7, q.z) && E.sight(x, f + 9.7, z, q.x, fb + 5, q.z) && E.sight(x, f + 9.7, z, q.x, fb + 2, q.z)) return { name: m.pname || m.name, bx: q.x, by: fb, bz: q.z, cx: x, cy: f, cz: z, d }; } }
  return { none: E.bots().length, bots: C.length }; });
check('found a standing bot with a clear line to him', !!bot?.name, JSON.stringify(bot));
if (!bot?.name) { console.log(ok + '/' + n); await b.close(); process.exit(1); }
const look = (pos, tgt) => p.evaluate(({ pos, tgt }) => __infra.lab.look(pos.x, pos.z, tgt.x, tgt.y, tgt.z, pos.y), { pos, tgt });
const C0 = { x: bot.cx, y: bot.cy + 9.7, z: bot.cz }, BOT = { x: bot.bx, y: bot.by + 6, z: bot.bz }, at = f => ({ x: bot.cx + (bot.bx - bot.cx) * f, z: bot.cz + (bot.bz - bot.cz) * f });
// (the test's own renders — two draws and a read-back in one task — are no frame of the game's: not counted as long frames)
const diff = async () => { await pause(1e9); try { return await p.evaluate(n => { const m = __E.bots().find(x => (x.pname || x.name) === n); return m ? __E.diff(m) : null; }, bot.name); } finally { await pause(300); } };
const blocks = pos => p.evaluate(({ pos, B }) => { const k = dy => __E.N.smokeBlocks(__E.G(), pos.x, pos.y, pos.z, B.x, B.y + dy, B.z); return { feet: k(-5), knees: k(-3), chest: k(2), head: k(4.4), seen: +__E.N.smokeSeen(__E.G(), pos.x, pos.y, pos.z, B.x, B.y + 2, B.z).toFixed(4) }; }, { pos, B: BOT });
const hidden = d => d && d.frac < .01 && d.mean < 2, SEE = await p.evaluate(() => __E.N.SMOKE.see);
const snap = async name => { await pause(1e9); const f = path.join(out, name + '.png'); await p.screenshot({ path: f }); if (SHOTS) copyFileSync(f, path.join(SHOTS, name + '.png')); await pause(400); };
const act = a => p.evaluate(a => Promise.resolve(__infra.lab.lan.act({ type: 'arena', action: a })).then(x => JSON.stringify(x), e => 'ERR ' + e), a);
const smokes = () => p.evaluate(() => (__E.G().combat?.nades || []).filter(n => n.kind === 'smoke').map(n => ({ id: n.id, phase: n.phase, x: n.x, y: n.y, z: n.z })));
async function drop(x, z, y) { await act({ type: 'buy-nade', kind: 'smoke' }); await p.waitForTimeout(100); const r = await act({ type: 'throw', kind: 'smoke', x, y: y + 12, z, dx: 0, dy: -1, dz: 0, strength: 'short' }); if (!/Threw/.test(r)) console.log('throw:', r);
  for (let i = 0; i < 60; i++) { if ((await smokes()).some(q => q.phase === 'smoke' && Math.hypot(q.x - x, q.z - z) < 8)) break; await p.waitForTimeout(100); } return r; }
// 1. No smoke: the bot is on screen (his outline changes when he is drawn), and the rules see him.
await look(C0, BOT); await p.waitForTimeout(600);
const progs0 = await p.evaluate(() => (globalThis.__P0 = new Set(__infra.renderer.info.programs.map(q => q.cacheKey))).size);
// (a new one: its name and how its key differs from the nearest one built before — the fields that changed)
const newProgs = () => p.evaluate(() => __infra.renderer.info.programs.filter(q => !__P0.has(q.cacheKey)).map(q => { const k = q.cacheKey.split(','); let best = null, bd = 1e9;
  for (const o of __P0) { const f = o.split(','); if (f[0] !== k[0] || f.length !== k.length) continue; const d = k.reduce((n, x, i) => n + (x !== f[i] ? 1 : 0), 0); if (d < bd) { bd = d; best = f; } }
  return q.name + ' ' + k[0] + (best ? ' · differs at ' + k.map((x, i) => x !== best[i] ? i + ':' + best[i] + '→' + x : null).filter(Boolean).join(' ') : ' · nothing like it before'); }));
const d0 = await diff(), r0 = await blocks(C0); check('no smoke: the bot is on screen', d0 && d0.frac > .15, JSON.stringify(d0)); check('no smoke: the rules see him', !r0.chest && r0.seen > .99, JSON.stringify(r0));
await pause(1e9); const lum0 = await p.evaluate(() => __E.even()); await snap('smoke-0-none');
// 2. One smoke half way: hidden on screen and by the rules.
const s1 = at(.5), t1 = Date.now(); await p.evaluate(() => { globalThis.__rec = []; }); await drop(s1.x, s1.z, bot.by); await p.waitForTimeout(2300);
{ const w = await p.evaluate(() => { const a = __rec; globalThis.__rec = null; return { n: a.length, max: Math.max(0, ...a), over25: a.filter(x => x > 25).length }; }); check('the first smoke of the match pops without a hitch (no frame over 34 ms)', w.max < 34, JSON.stringify(w)); }
const progs1 = await newProgs(); check('no shader built when the first smoke pops (warmed at the start)', progs1.length === 0, progs0 + ' + ' + JSON.stringify(progs1));
await look(C0, BOT); await p.waitForTimeout(300); const d1 = await diff(), r1 = await blocks(C0);
check('behind one smoke: the bot is not on screen', d1 && d1.frac < .01 && d1.mean < 2, JSON.stringify(d1)); check('…and the rules agree (blocked, < 2 % of the light)', r1.chest && r1.head, JSON.stringify(r1));
await snap('smoke-1-outside');
// 3. A second smoke, thrown later and further along, overlapping: still hidden — from here and from other places on the line.
const s2 = at(.66); await drop(s2.x, s2.z, bot.by); await p.waitForTimeout(2300);
const views = [['outside', C0], ['nearer', { x: bot.cx + (bot.bx - bot.cx) * .2, y: C0.y, z: bot.cz + (bot.bz - bot.cz) * .2 }], ['edge', (() => { const e = at(.5 - 22 / bot.d); return { x: e.x, y: C0.y, z: e.z }; })()], ['low', { x: C0.x, y: bot.cy + 8.6, z: C0.z }]];   // (low: an eye just above the crouch line — lab.look() of a crouched eye on a map file puts the camera on the boxes' floor, under the map's)
{ const ux = (bot.bz - bot.cz) / bot.d, uz = -(bot.bx - bot.cx) / bot.d; for (const [nm, k] of [['left', -9], ['right', 9], ['wide left', -18]]) if (await p.evaluate(({ x, z, y }) => Number.isFinite(__E.floor(x, z, y)), { x: C0.x + ux * k, z: C0.z + uz * k, y: C0.y })) views.push([nm, { x: C0.x + ux * k, y: C0.y, z: C0.z + uz * k }]); }   // (other angles onto him: the screen and the rules must agree there too)
const thick = () => p.evaluate(() => { const G = __E.G(), now = __infra.lab.lan.hostNow?.() ?? G.combat?.clock ?? Date.now(), s = (G.combat?.nades || []).filter(n => n.phase === 'smoke'); return s.length >= 2 && s.every(n => now - n.firedAt < 14500); });   // (both still at full density: they thin from 15 s)
for (const [name, pos] of views) { if (!(await thick())) { console.log(`skip ${name} and the rest: the two smokes are thinning (a slow, busy machine)`); break; } await look(pos, BOT); await p.waitForTimeout(250);
  const moved = await p.evaluate(q => { const c = __infra.camera.position; return Math.hypot(c.x - q.x, c.y - q.y, c.z - q.z); }, pos); if (moved > .5) { console.log(`skip ${name}: the camera didn't stay where lab.look() put it (${moved.toFixed(1)} units off — a map file's floor under the boxes' one)`); continue; }
  const d = await diff(), r = await blocks(pos), all = r.feet && r.knees && r.chest && r.head;
  if (!['low', 'left', 'right', 'wide left'].includes(name)) { check(`two overlapping smokes, ${name}: the bot is not on screen`, hidden(d), JSON.stringify(d)); check(`…the rules agree (${name})`, r.chest && r.head, JSON.stringify(r)); }
  else check(`from ${name === 'low' ? 'a low eye' : 'the ' + name}: the screen hides him exactly when the rules do`, d && (all ? hidden(d) : !hidden(d) || (r.head && r.chest)), JSON.stringify({ d, r }));   // (a low or slanted view can pass a cloud's edge: then part of him shows — and the rules see it)
  if (name === 'outside') await snap('smoke-2-overlap'); if (name === 'edge') await snap('smoke-2-edge'); if (name === 'low') await snap('smoke-2-low'); }
// 4. Inside the first smoke: one even smoke colour on screen, not a dimmed world. (On a slow, busy machine the two may be
// thinning by now: then they are thrown again first — sections 4 and 5 need them thick.)
if (!(await thick())) { await p.waitForFunction(() => !(__E.G().combat?.nades || []).some(n => n.kind === 'smoke'), null, { timeout: 30000 }).catch(() => {}); await drop(s1.x, s1.z, bot.by); await drop(s2.x, s2.z, bot.by); await p.waitForTimeout(2300); console.log('(smokes thrown again for sections 4–5)'); }
const c1 = (await smokes()).find(q => Math.hypot(q.x - s1.x, q.z - s1.z) < 8) || { ...s1, y: bot.by };
// (looking the way with the most room in the cloud — a crate at arm's length inside a smoke is rightly seen: the screen
// test is about the smoke, not about what touches you)
const inDir = await p.evaluate(({ x, y, z }) => { let best = [1, 0], bl = -1; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let L = 0; while (L < 30 && __E.sight(x, y, z, x + dx * (L + 2), y, z + dz * (L + 2)) && __E.sight(x, y - 4, z, x + dx * (L + 2), y - 4, z + dz * (L + 2))) L += 2; if (L > bl) { bl = L; best = [dx, dz]; } } return best; }, { x: c1.x, y: (c1.y || bot.by) + 9.7, z: c1.z });
await look({ x: c1.x, y: (c1.y || bot.by) + 9.7, z: c1.z }, { x: c1.x + inDir[0] * 80, y: (c1.y || bot.by) + 9.7, z: c1.z + inDir[1] * 80 }); await p.waitForTimeout(400);
await pause(1e9); const ev = await p.evaluate(() => __E.even()); check('inside a smoke: the screen is one even colour', ev.sd < .035 && ev.sd < lum0.sd * .5, JSON.stringify({ inside: ev, world: lum0 })); await snap('smoke-3-inside');
// 5. Effects: a bright flash 5 units in front of you shows over the smoke, one behind the smoke doesn't.
await look(C0, BOT); await p.waitForTimeout(200); await pause(1e9);   // (the probe sprite below is the test's own material — its shader isn't the game's: its frame doesn't count)
const fx = await p.evaluate(B => { const { THREE } = __E, c = __infra.camera.position, dir = new THREE.Vector3(B.x - c.x, B.y - c.y, B.z - c.z), D = dir.length(); dir.normalize(); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.userData.gd = true; sp.userData.fx = true; sp.scale.setScalar(2.5); __infra.scene.add(sp);
  const r = __infra.renderer, W = r.domElement.width, H = r.domElement.height, R = { x: Math.round(W / 2 - 6), y: Math.round(H / 2 - 6), w: 12, h: 12 }, lum = () => { const px = __E.read(R); let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / (px.length / 4) / 3; };
  sp.visible = false; const base = lum(); sp.visible = true; sp.position.copy(c).addScaledVector(dir, 5); const front = lum(); sp.position.copy(c).addScaledVector(dir, D - 3); sp.scale.setScalar(6); const behind = lum(); sp.removeFromParent(); sp.material.dispose(); return { base: +base.toFixed(1), front: +front.toFixed(1), behind: +behind.toFixed(1) }; }, BOT);
check('an effect in front of the smoke shows (drawn after it)', fx.front > fx.base + 40, JSON.stringify(fx)); check('…one behind the smoke does not', fx.behind < fx.base + 3, JSON.stringify(fx)); await pause(400);
check('muzzle flashes are effects drawn after the smoke (userData.fx)', await p.evaluate(() => { __infra.lab.pistol.button?.(0, true); __infra.lab.pistol.button?.(0, false); return new Promise(r => setTimeout(() => r(__infra.scene.children.some(o => o.isSprite && o.userData.fx)), 400)); }));
// 6. A bot inside a smoke (the first two gone): hidden.
const stats1 = await p.evaluate(() => __infra.scene.userData.gdSmoke?.stats?.());
await p.waitForFunction(() => !(__E.G().combat?.nades || []).some(n => n.kind === 'smoke'), null, { timeout: 30000 }).catch(() => {});
{ const ux = (bot.bz - bot.cz) / bot.d, uz = -(bot.bx - bot.cx) / bot.d; await drop(bot.bx + ux * 4, bot.bz + uz * 4, bot.by); }   // (beside him: a canister dropped on his head bounces away)
await p.waitForTimeout(2300); await look(C0, BOT); await p.waitForTimeout(300);
const d3 = await diff(), r3 = await blocks(C0), in3 = await p.evaluate(B => ({ chest: +__E.N.smokeDensity(__E.G(), B.x, B.y + 2, B.z).toFixed(3), smoke: (__E.G().combat?.nades || []).filter(n => n.phase === 'smoke').map(n => [+(n.x - B.x).toFixed(1), +(n.z - B.z).toFixed(1)]) }), BOT);
check('a bot inside a smoke (the smoke round his chest) is not on screen', in3.chest > .5 && hidden(d3), JSON.stringify({ d3, in3 }));
// (the rules and the screen: blocked by the rules → hidden on screen; on screen → seen by the rules; between — 2 … ~15 % of
// the light, a silhouette no one makes out — the rules still see him: SMOKE.see is the stricter side)
check('…and the rules agree', (!(r3.chest && r3.head) || hidden(d3)) && (hidden(d3) || r3.seen > SEE) && (!hidden(d3) || r3.seen < .15), JSON.stringify(r3)); await snap('smoke-4-bot-inside');
// 6b. The first HE into a smoke this session (its hole's reach worked out here, uploaded once): no hitch.
{ const c = (await smokes()).find(q => q.phase === 'smoke'); if (c) { await act({ type: 'buy-nade', kind: 'he' }); await p.evaluate(() => { globalThis.__rec = []; }); const r = await act({ type: 'throw', kind: 'he', x: c.x, y: (c.y || bot.by) + 4, z: c.z, dx: 0, dy: -1, dz: 0, strength: 'short' });
  for (let i = 0; i < 40; i++) { if (await p.evaluate(x => (__E.G().combat?.nades || []).some(n => n.id === x && n.holes?.length), c.id)) break; await p.waitForTimeout(100); } await p.waitForTimeout(600);
  const w = await p.evaluate(() => { const a = __rec; globalThis.__rec = null; return { n: a.length, max: Math.max(0, ...a), over25: a.filter(x => x > 25).length }; }), holes = await p.evaluate(x => (__E.G().combat?.nades || []).find(n => n.id === x)?.holes?.length || 0, c.id);
  check('the first HE into a smoke: its hole opens without a hitch (no frame over 34 ms)', holes > 0 && w.max < 34, JSON.stringify({ throw: r, holes, ...w })); } }
// 7. Leaving the match frees it: no slot, nothing drawn, no effect left in the scene.
const left = await p.evaluate(() => { const v = __infra.lab.nadeView; v.clear(); const sp = __infra.scene.userData.gdSmoke; const fx = __infra.scene.getObjectByName('nadeFx'); return { slots: sp?.used ?? null, active: sp?.active?.() ?? null, effects: fx ? fx.children.filter(o => o.isGroup).length : null, march: !!sp?.marchTarget }; });
check('clear() lets the smoke go (no slot, nothing drawn, no effect group, targets freed)', left.slots === 0 && left.active === false && left.effects === 0 && !left.march, JSON.stringify(left));
check('no frame over 50 ms in play (smoke pops included)', (await p.evaluate(() => __lf)).length === 0, JSON.stringify(await p.evaluate(() => __lf)));
check('no shader errors, no page errors', !glErr.length && !errs.length, [...glErr, ...errs].slice(0, 3).join(' | '));
console.log('pass stats', JSON.stringify(stats1));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
