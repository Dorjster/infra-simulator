// Global Defensive grenade keys in a real browser (solo deathmatch, no bots), as CS2: with an HE, two flashbangs and a
// decoy (four, the most) — 7 / 6 / 9 draw exactly that grenade, 7 again keeps the flashbang, 8 and 0 (none carried)
// say so and keep what you hold, 4 cycles HE → flashbang → decoy → HE (two flashbangs, one stop); nothing is ever
// thrown by a key; the HUD lists them in slot order with their keys and ×2; after dropping the decoy a molotov comes
// up on 0; the buy menu's grenade column is in slot order (6–10) and dims what you can't carry; the decoy and the
// incendiary have models of their own. No page errors.   node tests/browser/gd-grenade-slots-e2e.mjs <repo> <out>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SLOTS1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gsl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 240) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Slots'); localStorage.setItem('infra-face-name', 'Slots'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'dm'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 40000 });
await p.waitForTimeout(800); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
const buy = k => p.evaluate(k => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: k } }), k);
const held = () => p.evaluate(() => __infra.lab.pistol.current?.id || null);
const thrown = () => p.evaluate(() => (__infra.lab.world.operations.game.combat.nades || []).length);
const notice = () => p.evaluate(() => document.getElementById('game-notifications')?.textContent || '');
const hud = () => p.evaluate(() => [...document.querySelectorAll('#gd-wp .util span[data-n]')].map(s => s.dataset.n + (s.dataset.c > 1 ? '×' + s.dataset.c : '') + (s.classList.contains('on') ? '*' : '') + ':' + (s.querySelector('i')?.textContent || '')));
const key = async (code, ms = 450) => { await p.keyboard.press(code); await p.waitForTimeout(ms); };
for (const k of ['flash', 'decoy', 'he', 'flash']) { const r = await buy(k); if (r?.error) check('bought ' + k, false, r.error); }
check('a fifth grenade is refused (four in all)', /four grenades/.test((await buy('smoke'))?.error || ''));
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(300); const n0 = await thrown();
await key('Digit7'); check('7: the flashbang', await held() === 'flash', await held());
await key('Digit7'); check('7 again: still the flashbang (nothing thrown)', await held() === 'flash' && await thrown() === n0, await held());
await key('Digit6'); check('6: the HE grenade', await held() === 'he', await held());
await key('Digit9'); check('9: the decoy', await held() === 'decoy', await held());
check('HUD: HE, flashbang ×2, decoy — slot order, each with its key; the one in hand lit', (await hud()).join(' ') === 'he:6 flash×2:7 decoy*:9', (await hud()).join(' '));
await p.screenshot({ path: path.join(out, 'hud-grenades.png'), clip: { x: 900, y: 650, width: 500, height: 200 } });
await key('Digit8'); check('8 with no smoke: says so, the decoy stays in hand', /No Smoke Grenade/.test(await notice()) && await held() === 'decoy', await notice());
await key('Digit0'); check('0 with no fire grenade: says so (deathmatch: molotov or incendiary)', /No Molotov or Incendiary/.test(await notice()) && await held() === 'decoy', await notice());
const cyc = []; for (let i = 0; i < 4; i++) { await key('Digit4'); cyc.push(await held()); }
check('4 cycles in slot order: HE → flashbang → decoy → HE', cyc.join() === 'he,flash,decoy,he', cyc.join());
check('no key threw anything', await thrown() === n0, await thrown());
// Slot 10: drop the decoy (G with it in hand), buy a molotov, 0 draws it.
await key('Digit9'); const dr = await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'drop', slot: 'nades', kind: 'decoy' } })); await p.waitForTimeout(300);
check('dropped the decoy', !dr?.error, JSON.stringify(dr)); const bm = await buy('molotov'); check('bought a molotov', !bm?.error, JSON.stringify(bm));
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(250); await key('Digit0'); check('0: the molotov', await held() === 'molotov', await held());
check('an incendiary on top is refused (one fire grenade)', /One fire grenade/.test((await buy('incendiary'))?.error || '') || /four grenades/.test((await buy('incendiary'))?.error || ''));
check('HUD now: HE, flashbang ×2, molotov (key 0)', (await hud()).join(' ') === 'he:6 flash×2:7 molotov*:0', (await hud()).join(' '));
await p.screenshot({ path: path.join(out, 'hud-molotov.png'), clip: { x: 900, y: 650, width: 500, height: 200 } });
// Buy menu: the grenade column in slot order; what you can't carry dimmed with the reason.
await p.evaluate(() => __infra.lab.arenaUI.buy(true)); await p.waitForTimeout(400);
const col = await p.evaluate(() => { const c = [...document.querySelectorAll('#ar-buy .col')].find(c => /Grenades/.test(c.querySelector('h3')?.textContent || '')); return [...(c?.querySelectorAll('[data-pick]') || [])].map(b => b.dataset.pick + (b.disabled ? '(off:' + (b.title || '').split(' · ')[0] + ')' : '')); });
check('buy menu: grenades in slot order (deathmatch: both fire grenades)', col.map(s => s.split('(')[0]).join() === 'he,flash,smoke,decoy,molotov,incendiary', col.join(' '));
check('…full: every card dimmed with the reason', col.every(s => /four grenades/.test(s)), col.join(' '));
const tip = await p.evaluate(() => document.querySelector('#ar-buy [data-pick="decoy"]')?.title || ''); check('…the decoy card says what it does and its key (9)', /radar/.test(tip) && /key 9/.test(tip), tip);
await p.screenshot({ path: path.join(out, 'buy-grenades.png') });
// Every card inside its own column (Deathmatch's Mid-Tier has 11: two a row, six rows — not a 3rd column over Rifles).
const spill = await p.evaluate(() => [...document.querySelectorAll('#ar-buy .col')].flatMap(c => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('[data-pick]')].filter(b => { const q = b.getBoundingClientRect(); return q.left < r.left - 1 || q.right > r.right + 1; }).map(b => b.dataset.pick); }));
check('buy menu: every card inside its column (11 Mid-Tier guns, two a row)', spill.length === 0, spill.join());
await p.keyboard.press('Digit5'); await p.waitForTimeout(200); await p.keyboard.press('Digit0'); await p.waitForTimeout(250);
check('in the buy menu 0 backs out of a column (never draws the slot-10 grenade behind it)', !(await p.evaluate(() => document.getElementById('ar-buy').hidden)) && await held() === 'molotov', await held());
await p.evaluate(() => __infra.lab.arenaUI.buy(false)); await p.waitForTimeout(200);
// The decoy and the incendiary: models of their own (not the HE's sphere stand-in, not the smoke or flashbang can).
const looks = await p.evaluate(async () => { const W = await import('./weapon-models.js'), THREE = await import('./three.module.js'); await W.loadRealWeapons?.(); const f = id => { const m = W.weaponModel(id, 1), b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3()); let meshes = 0, colors = new Set(); m.traverse(o => { if (o.isMesh) { meshes++; for (const mt of [].concat(o.material)) colors.add(mt.color?.getHexString?.()); } }); return { meshes, size: [s.x, s.y, s.z].map(v => +v.toFixed(3)).join('×'), colors: [...colors].sort().join() }; }; return Object.fromEntries(['he', 'flash', 'smoke', 'decoy', 'molotov', 'incendiary'].map(id => [id, f(id)])); });
{ const png = await p.evaluate(async () => { const THREE = await import('./three.module.js'), W = await import('./weapon-models.js'), ids = ['he', 'flash', 'smoke', 'decoy', 'molotov', 'incendiary'], cv = document.createElement('canvas'), r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(900, 220, false); r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2)); const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(3, 5, 6); sc.add(dl); ids.forEach((id, i) => { const m = W.weaponModel(id, 1.6); m.position.set((i - 2.5) * .75, -.15, 0); m.rotation.y = .5; sc.add(m); });
    const bx = new THREE.Box3().setFromObject(sc), cy = (bx.min.y + bx.max.y) / 2, hh = (bx.max.y - bx.min.y) / 2 * 1.1, cam = new THREE.OrthographicCamera(-hh * 900 / 220, hh * 900 / 220, hh, -hh, .01, 50); cam.position.set(0, cy, 6); cam.lookAt(0, cy, 0); r.render(sc, cam); const u = cv.toDataURL('image/png'); r.dispose(); return u; });
  (await import('node:fs')).writeFileSync(path.join(out, 'grenade-models.png'), Buffer.from(png.split(',')[1], 'base64')); }   // (a picture to look at: HE, flashbang, smoke, decoy, molotov, incendiary)
// Their bands are seen, not buried in the can: each grenade drawn alone, side on — the incendiary shows red, the decoy
// more near-black than the smoke can it is made from.
const px = await p.evaluate(async () => { const THREE = await import('./three.module.js'), W = await import('./weapon-models.js'), cv = document.createElement('canvas'), r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, preserveDrawingBuffer: true }); r.setSize(160, 240, false); r.outputColorSpace = THREE.SRGBColorSpace;
  const one = id => { const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(3, 5, 6); sc.add(dl); const m = W.weaponModel(id, 1); sc.add(m); const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3()), h = (b.max.y - b.min.y) * .6, cam = new THREE.OrthographicCamera(-h * 160 / 240, h * 160 / 240, h, -h, .01, 50);
    cam.position.set(c.x, c.y, c.z + 10); cam.lookAt(c); r.render(sc, cam); const g = r.getContext(), d = new Uint8Array(160 * 240 * 4); g.readPixels(0, 0, 160, 240, g.RGBA, g.UNSIGNED_BYTE, d); let red = 0, dark = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; if (d[i] > 90 && d[i] > d[i + 1] * 1.8 && d[i] > d[i + 2] * 1.8) red++; if (d[i] < 45 && d[i + 1] < 45 && d[i + 2] < 45) dark++; } return { red, dark }; };
  const o = { smoke: one('smoke'), decoy: one('decoy'), incendiary: one('incendiary') }; r.dispose(); return o; });
check('the incendiary\'s red band and the decoy\'s dark band are seen', px.incendiary.red > px.smoke.red + 150 && px.decoy.dark > px.smoke.dark + 150, JSON.stringify(px));
check('decoy and incendiary: models of their own (parts, finish and size unlike every other grenade)',['decoy', 'incendiary'].every(id => looks[id].meshes > 1 && Object.keys(looks).every(o => o === id || (looks[o].colors !== looks[id].colors && looks[o].size !== looks[id].size))), JSON.stringify(looks));
// Radar: someone else's decoy shows as an enemy dot while it fires (arena-nades.js decoyBlip), not between its shots;
// your own never does. (A decoy put into this screen's grenade list for one radar frame; red fills counted.)
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(300);
// Timed on the running host clock (host-clock.js, the one its shots are heard on), not the last combat frame's stamp:
// G.combat.clock is held stale (just after the landing) while the radar draws, as in a quiet game with no new frame.
const rad = await p.evaluate(async () => { const N = await import('./arena-nades.js'), H = await import('./host-clock.js'), G = __infra.lab.world.operations.game, R = __infra.lab.radar, c = __infra.camera.position, ref = H.hostNow();
  const n = { id: 'probe-decoy', kind: 'decoy', by: 'Someone Else', phase: 'decoy', x: c.x + 6, y: c.y - 9.7, z: c.z, seed: 7, gun: 'ak', firedAt: ref - 3000 }, has = typeof N.decoyBlip === 'function';
  let on = null, off = null, q0 = null; for (let t = 50; t < 14000 && off === null; t += 25) { n.firedAt = ref - t; const b = has ? N.decoyBlip(n, ref) : true; if (b && on === null) on = t + 200; if (!b && on !== null && q0 === null) q0 = t; if (b && q0 !== null) off = Math.round((q0 + t - 25) / 2); } if (off === null && q0 !== null) off = q0 + 50;   /* (on: well inside a shot's moment; off: the middle of the first quiet spell after it) */
  const ctx = document.querySelector('#gd-radar > canvas').getContext('2d'), fill = ctx.fill; let red = 0; ctx.fill = function (...a) { if (this.fillStyle === '#ff4040') red++; return fill.apply(this, a); };
  const frame = (by, t) => { n.by = by; n.firedAt = H.hostNow() - t; red = 0; const keep = G.combat.nades, clock = G.combat.clock; G.combat.nades = [...keep, n]; G.combat.clock = n.firedAt + 100; try { R.update(); } finally { G.combat.nades = keep; G.combat.clock = clock; } return red; };
  const out = { has, on, off, firing: on !== null ? frame('Someone Else', on) : -1, silent: off !== null ? frame('Someone Else', off) : 0, mine: on !== null ? frame('Slots', on) : -1 }; ctx.fill = fill; return out; });
check('radar: another player\'s decoy shows as an enemy while it fires…', rad.has && rad.firing === 1, JSON.stringify(rad));
check('…not between its shots, and your own decoy never', rad.silent === 0 && rad.mine === 0, JSON.stringify(rad));
// Defuse (solo, Dust II): your side's buy menu lists five grenades in slot order — its own fire grenade only — and the
// fire grenade costs CS2's price for that side (molotov $400 T, incendiary $500 CT); 0 draws it.
// (a room of its own: the deathmatch above keeps the first one)
const server2 = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SLOTS2', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gsl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server2.kill(); } catch {} }); const base2 = await new Promise(r => server2.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
await p.close();
{ const q = await b.newPage({ viewport: { width: 1400, height: 850 } }); q.on('pageerror', e => errs.push('defuse: ' + e.message)); q.on('dialog', d => d.accept());
  await q.addInitScript(() => { localStorage.setItem('infra-name', 'Sider'); localStorage.setItem('infra-face-name', 'Sider'); localStorage.setItem('infra-face', 'smile'); });
  await q.goto(base2 + '/'); await q.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await q.waitForTimeout(1200);
  await q.evaluate(() => document.querySelector('[data-start=arena]').click()); await q.waitForTimeout(400);
  await q.selectOption('#ss-ar-kind', 'defuse'); await q.selectOption('#ss-ar-map', 'dust2'); await q.selectOption('#ss-ar-bots', '0'); await q.evaluate(() => document.getElementById('ss-ar-solo').click());
  await q.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.sider, null, { timeout: 90000 }); await q.waitForTimeout(800);   // (Dust II's first load: slow on a busy machine)
  const T = await q.evaluate(() => __infra.lab.world.operations.game.combat.d.teams.sider), fire = T === 'ct' ? 'incendiary' : 'molotov', price = T === 'ct' ? 500 : 400;
  await q.evaluate(() => __infra.lab.arenaUI.buy(true)); await q.waitForTimeout(400);
  const dcol = await q.evaluate(() => { const c = [...document.querySelectorAll('#ar-buy .col')].find(c => /Grenades/.test(c.querySelector('h3')?.textContent || '')); return [...(c?.querySelectorAll('[data-pick]') || [])].map(b => b.dataset.pick); });
  check(`Defuse (${T}): five grenades in slot order, your side's fire grenade only`, dcol.join() === 'he,flash,smoke,decoy,' + fire, dcol.join());
  await q.screenshot({ path: path.join(out, 'buy-defuse-' + T + '.png') });
  const m0 = await q.evaluate(() => __infra.lab.world.operations.game.combat.d.money.sider); await q.evaluate(f => document.querySelector(`#ar-buy [data-pick="${f}"]`).click(), fire); await q.waitForTimeout(600);
  const m1 = await q.evaluate(() => __infra.lab.world.operations.game.combat.d.money.sider); check(`the ${fire} costs $${price}`, m0 - m1 === price, m0 + ' → ' + m1);
  const other = await q.evaluate(f => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: f } }), T === 'ct' ? 'molotov' : 'incendiary'); check('the other side\'s fire grenade is refused', /grenade/.test(other?.error || ''), JSON.stringify(other));
  await q.evaluate(() => __infra.lab.arenaUI.buy(false)); await q.evaluate(() => __infra.lab.enter()); await q.waitForTimeout(250); await q.keyboard.press('Digit0'); await q.waitForTimeout(450);
  check('0 draws it', await q.evaluate(() => __infra.lab.pistol.current?.id) === fire, await q.evaluate(() => __infra.lab.pistol.current?.id)); await q.close(); }
check('no page errors', !errs.length, errs.join(' | '));
console.log((ok === n ? 'PASS' : 'FAIL') + ': grenade keys in the browser · ' + ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
