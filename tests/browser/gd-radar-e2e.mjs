// Global Defensive radar + HUD layout (solo Defuse on Dune with 4 bots), at 1920×1080 and 1280×720:
// the radar shows the map, bomb sites and team mates; enemies only when someone on your side can see them (never
// through walls); N switches rotating / fixed; radar, health, ammo, money, kill feed and top bar don't overlap.
// v52 (package I1): the HUD, a full 10-player lobby panel and the connection-lost banner don't overlap at 1280×720,
// 1366×768, 1440×900 and 1920×1080, nor at display scaling 2 (the radar's dots drawn at the screen's pixels); Tab with
// the buy menu open never puts the big map over it; the Esc menu blocks game input (GDUI-02: W doesn't walk, G doesn't
// drop); the window losing focus lets go of the trigger (GDUI-03: an AK stops firing) and the chat box taking the keys
// closes the held scoreboard; dead, the radar turns with who you watch (GDUI-06); Nuke's lower floor is drawn before
// anyone walks down (GDUI-12).
// v52 (package Q): with the user's CS2 export (user-assets/radar, skipped without it) Dust II's radar is CS2's own overview
// picture, its spawns and sites at the picture pixels CS2's overview data gives, and on screen the picture layer and the
// dots line up (the drawn image's box ↔ the dots' projection); CS2's options change the radar live (north up, zoom,
// HUD size, Tab whole map on / off) and the Settings radar section (five controls, a drawn preview, reset) drives them.
//   node tests/browser/gd-radar-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'RAD001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'rd-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 240) : '')); }; const errs = [];
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); p.on('pageerror', e => errs.push(e.message));
for (const [w, h] of [[1920, 1080], [1280, 720]]) {
  if (w !== 1920) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(800); } else {
  if (w === 1920) await p.addInitScript(() => { localStorage.setItem('infra-name', 'Rada'); localStorage.setItem('infra-face-name', 'Rada'); localStorage.setItem('infra-face', 'smile'); localStorage.removeItem('gd-radar-mode'); localStorage.removeItem('gd-radar'); });
  if (w === 1920) { await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000); }
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '4'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.round, null, { timeout: 40000 });
  await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(1500); }
  check(w + 'p: the radar is shown', await p.evaluate(() => !document.getElementById('gd-radar').hidden));
  // Overlaps: radar, HP, ammo, money, top bar, kill feed — no two of them share pixels.
  const rects = await p.evaluate(() => Object.fromEntries(['gd-radar', 'gd-hp', 'gd-wp', 'ar-money', 'ar-top', 'ar-feed', 'ar-alive'].map(id => { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === 'none') return [id, null]; const r = e.getBoundingClientRect(); return [id, r.width && r.height ? [r.left, r.top, r.right, r.bottom] : null]; })));
  const hits = []; const ids = Object.keys(rects).filter(k => rects[k]); for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = rects[ids[i]], c = rects[ids[j]]; if (a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]) hits.push(ids[i] + '×' + ids[j]); }
  check(w + 'p: radar, health, ammo, money, top bar and feed do not overlap', hits.length === 0, hits.join(', ') + ' ' + JSON.stringify(rects));
  // Enemies: only those someone on our side can see.
  const r = await p.evaluate(async () => { const { clearView } = await import('./arena-nades.js'), { mapBoxes, ARENA_MAPS } = await import('./arena-maps.js'), { ARENA } = await import('./facility-layout.js');
    const G = __infra.lab.world.operations.game, d = G.combat.d, me = 'rada', boxes = mapBoxes(ARENA_MAPS[G.arena.map], ARENA.cx, ARENA.cz), cam = __infra.camera.position;
    const mine = (__infra.lab.lan.players || []).filter(x => d.teams[x.name.toLowerCase()] === d.teams[me] && x.name.toLowerCase() !== me).map(x => x.pose).concat([{ x: cam.x, z: cam.z }]);
    const foes = (__infra.lab.lan.players || []).filter(x => d.teams[x.name.toLowerCase()] && d.teams[x.name.toLowerCase()] !== d.teams[me]);
    await new Promise(r => setTimeout(r, 300)); const shown = __infra.lab.radar.revealed;
    const visible = foes.filter(f => mine.some(e => Math.hypot(e.x - f.pose.x, e.z - f.pose.z) < 220 && clearView(G, boxes, e.x, e.z, f.pose.x, f.pose.z))).map(f => f.name.toLowerCase());
    return { shown, visible, foes: foes.map(f => [f.name, Math.round(f.pose.x), Math.round(f.pose.z)]), mine: mine.map(e => [Math.round(e.x), Math.round(e.z)]), why: __infra.lab.radar.why }; });
  check(w + 'p: enemies on the radar only when seen (never through walls)', r.shown.every(k => r.visible.includes(k)), JSON.stringify(r));
  const m0 = await p.evaluate(() => __infra.lab.radar.mode); await p.keyboard.press('KeyN'); await p.waitForTimeout(200); const m1 = await p.evaluate(() => __infra.lab.radar.mode);
  check(w + 'p: N switches rotating ⇄ fixed', m0 === 'rotate' && m1 === 'fixed', m0 + ' → ' + m1);
  await p.screenshot({ path: path.join(out, 'hud-' + w + '.png') }); await p.keyboard.press('KeyN');
}
// ---- v52 (package Q): CS2's radar picture, aligned; CS2's options, live ---------------------------------------------
{ await p.setViewportSize({ width: 1920, height: 1080 }); await p.waitForTimeout(500);
  const cs2 = await p.evaluate(async () => { try { return (await fetch('/user-assets/radar/radar.json', { cache: 'no-cache' })).ok; } catch { return false; } });
  if (!cs2) console.log('SKIP CS2 picture checks: no user-assets/radar (tools/export-cs2-radar.mjs)');
  else { await p.waitForFunction(() => __infra.lab.radar.art === 'cs2', null, { timeout: 15000 }).catch(() => {});
    const a = await p.evaluate(async () => { const { ARENA } = await import('./facility-layout.js'), { ARENA_MAPS } = await import('./arena-maps.js'), G = __infra.lab.world.operations.game, M = ARENA_MAPS[G.arena.map], H = M.hammer, R = __infra.lab.radar;
      const ov = (await (await fetch('/user-assets/radar/radar.json', { cache: 'no-cache' })).json()).maps[G.arena.map]; if (!H || !ov) return { art: R.art, map: G.arena.map, missing: true };
      const mean = P => [P.reduce((s, q) => s + q[0], 0) / P.length, P.reduce((s, q) => s + q[1], 0) / P.length], pts = { T: mean(M.t), CT: mean(M.ct), A: M.sites.A, B: M.sites.B }, f = (ov.res || 1024) / 1024; let worst = 0; const at = {};
      for (const [n, [x, z]] of Object.entries(pts)) { const hx = H.x0 + (x + H.W / 2) / H.U, hy = H.y1 - (z + H.D / 2) / H.U, u = (hx - ov.pos_x) / ov.scale * f, v = (ov.pos_y - hy) / ov.scale * f, [pu, pv] = R.picturePoint(ARENA.cx + x, ARENA.cz + z); worst = Math.max(worst, Math.abs(pu - u), Math.abs(pv - v)); at[n] = [+(u / (ov.res || 1024)).toFixed(3), +(v / (ov.res || 1024)).toFixed(3)]; }
      // on screen, the big map (north up): where the image element is drawn vs where the dots canvas puts the same points
      R.expand(true); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); const img = [...document.querySelectorAll('#gd-radar .map img')].find(e => e.style.visibility !== 'hidden'), box = document.getElementById('gd-radar').getBoundingClientRect(), ib = img?.getBoundingClientRect();
      let screen = Infinity; if (ib) { screen = 0; for (const [x, z] of Object.values(pts)) { const [sx, sy] = R.project(ARENA.cx + x, ARENA.cz + z), [pu, pv] = R.picturePoint(ARENA.cx + x, ARENA.cz + z), ex = ib.left - box.left - 1 + pu / img.naturalWidth * ib.width, ey = ib.top - box.top - 1 + pv / img.naturalHeight * ib.height; screen = Math.max(screen, Math.hypot(sx - ex, sy - ey)); } }
      return { art: R.art, map: G.arena.map, worst, at, screen, img: img ? img.naturalWidth : 0 }; });
    await p.screenshot({ path: path.join(out, 'cs2-dust2-big.png') }); await p.evaluate(() => __infra.lab.radar.expand(false));
    check('Dust II (CS2 map file): the radar shows CS2\'s own overview picture (1024 px, decoded before the round)', a.art === 'cs2' && a.img === 1024, JSON.stringify(a));
    check('…its spawns and bomb sites at the picture pixels CS2\'s overview data gives (pos_x / pos_y / scale)', a.worst < .01, JSON.stringify(a.at) + ' worst ' + a.worst);
    check('…and on screen the picture layer and the dots line up (big map: under 1.5 CSS px)', a.screen < 1.5, a.screen); }
  const o = await p.evaluate(async () => { const P = await import('./gd-radar-prefs.js'), R = __infra.lab.radar, el = document.getElementById('gd-radar'), fr = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    P.saveRadarPrefs({ ...P.RADAR_DEFAULT }); await fr(); const d0 = { w: el.clientWidth, view: R.view, mode: R.mode };
    P.saveRadarPrefs({ ...P.RADAR_DEFAULT, rotate: false }); await fr(); const north = { ang: R.angle, mode: R.mode };
    P.saveRadarPrefs({ ...P.RADAR_DEFAULT, zoom: .35 }); await fr(); const view35 = R.view;
    P.saveRadarPrefs({ ...P.RADAR_DEFAULT, size: 1.3 }); await fr(); const w13 = el.clientWidth, cv13 = R.canvasPx;
    P.saveRadarPrefs({ ...P.RADAR_DEFAULT, squareTab: false }); await fr(); R.expand(true); const bigOff = el.classList.contains('big'); R.expand(false);
    P.saveRadarPrefs({ ...P.RADAR_DEFAULT }); await fr(); R.expand(true); const bigOn = el.classList.contains('big'); R.expand(false); await fr();
    return { d0, north, view35, w13, cv13, bigOff, bigOn, stored: localStorage.getItem('gd-radar') }; });
  check('options: defaults are CS2\'s (centred, rotating, size 1, zoom 0.7, whole map with the scoreboard), saved on this computer', o.d0.mode === 'rotate' && /"zoom":0.7/.test(o.stored) && /"squareTab":true/.test(o.stored), JSON.stringify(o));
  check('options live: "Radar is rotating" No → north up at once', o.north.ang === 0 && o.north.mode === 'fixed', JSON.stringify(o.north));
  check('options live: "Radar map zoom" 0.35 → twice the map across', Math.abs(o.view35 / o.d0.view - 2) < .01, o.view35 + ' / ' + o.d0.view);
  check('options live: "Radar HUD size" 1.3 → the panel 1.3× (its dots canvas follows)', Math.abs(o.w13 / o.d0.w - 1.3) < .02 && o.cv13 >= o.w13, o.w13 + ' / ' + o.d0.w + ' canvas ' + o.cv13);
  check('options live: "Toggle radar shape with scoreboard" No → Tab leaves the radar; Yes → the whole map', !o.bigOff && o.bigOn, JSON.stringify(o));
  await p.evaluate(() => __infra.lab.campaignUI.panel('settings')); await p.waitForTimeout(600);
  const s = await p.evaluate(async () => { const box = document.querySelector('#campaign-panel .rd-edit'); if (!box) return null; const sel = box.querySelector('select[data-rd=rotate]'); sel.value = '0'; sel.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 150));
    const mode = __infra.lab.radar.mode, cv = box.querySelector('.rd-preview'), px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i]) lit++;
    document.querySelector('#campaign-panel [data-rd-reset]').click(); await new Promise(r => setTimeout(r, 300)); return { controls: box.querySelectorAll('[data-rd]').length, mode, lit, after: __infra.lab.radar.mode }; });
  await p.screenshot({ path: path.join(out, 'settings-radar.png') }); await p.evaluate(() => { __infra.lab.campaignUI.close?.(); __infra.lab.enter(); }); await p.waitForTimeout(400);
  check('Settings → Radar: CS2\'s five options with a drawn preview; changing one applies at once; reset restores CS2\'s defaults', s && s.controls === 5 && s.mode === 'fixed' && s.lit > 1000 && s.after === 'rotate', JSON.stringify(s)); }
// ---- v52 layout: HUD + a 10-player lobby + the connection banner, at the laptop and desktop sizes (GDUI-17) ----------
const overlaps = () => p.evaluate(() => { const lob = document.getElementById('ar-lobby'), conn = document.getElementById('ar-conn'), was = [lob.hidden, lob.innerHTML, conn?.hidden, lob.className];
  // (the lobby's own markup, 10 players with the 1st as "you", 7 ready; then the game's own fit, as lobbyPanel runs it)
  lob.hidden = false; lob.innerHTML = '<b>LOBBY · DEFUSE · Dust II</b><div class="clock">Match starts in 1:51<small><b>7</b>/10 ready</small></div><small>Warmup 120 s · freeze time 15 s per round</small><ul>' + Array.from({ length: 10 }, (_, i) => `<li class="p ${i % 2 ? 'ct' : 't'}${i ? '' : ' me'}"${i < 7 ? ' data-ready="1"' : ''}><span>Player number ${i + 1}${i ? '' : ' (you)'}</span><small><i class="x">${i % 2 ? 'CT' : 'T'} · </i>${i < 7 ? '<b class="ok">✓ ready</b>' : 'not ready'}<i class="x"> · 12 ms</i></small></li>`).join('') + '</ul><div class="join">Friends join: 192.168.1.20:8080<br>passcode <b>ABC123</b></div><small>M: team · ready · start now · map · bots · warmup: no damage</small>';
  const cut = __infra.lab.arenaUI.lobbyFit(), ul = lob.querySelector('ul'), ub = ul.getBoundingClientRect(), more = ul.querySelector('li.more'), moreN = more ? +(/\+(\d+)/.exec(more.textContent)?.[1] || 0) : 0;
  const shown = [...ul.querySelectorAll('li.p')].filter(li => { if (li.hidden) return false; const r = li.getBoundingClientRect(); return r.height > 0 && r.top >= ub.top - 1 && r.bottom <= ub.bottom + 1; }).length, moreOk = !more || (more.getBoundingClientRect().bottom <= ub.bottom + 1 && /ready/.test(more.textContent));
  const fit = { cut, shown, moreN, moreOk, compact: lob.classList.contains('compact'), you: !ul.querySelector('li.me')?.hidden, sum: lob.querySelector('.clock small')?.textContent };
  if (conn) { conn.hidden = false; conn.lastElementChild.textContent = 'Reconnecting to the host · 3 s · play resumes when it answers'; }
  // (the toast stack at its fullest: hud.js keeps 2 toasts of up to 180 characters — sample ones, removed after)
  let nh = document.getElementById('game-notifications'); const madeNh = !nh; if (!nh) { nh = document.createElement('div'); nh.id = 'game-notifications'; document.body.append(nh); }
  const toasts = [0, 1].map(() => { const t = document.createElement('div'); t.className = 'game-toast'; t.textContent = 'Sample toast for the layout check · '.repeat(6).slice(0, 180); nh.append(t); return t; }); const keepToasts = [...nh.children].filter(c => !toasts.includes(c)); keepToasts.forEach(c => { c.__d = c.style.display; c.style.display = 'none'; });
  const ids = ['gd-radar', 'gd-hp', 'gd-hpbar', 'gd-wp', 'ar-money', 'ar-top', 'ar-feed', 'ar-alive', 'ar-lobby', 'ar-conn', 'game-notifications'], R = {};
  for (const id of ids) { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === 'none') continue; const r = e.getBoundingClientRect(); if (r.width && r.height) R[id] = [r.left, r.top, r.right, r.bottom].map(Math.round); }
  toasts.forEach(t => t.remove()); keepToasts.forEach(c => { c.style.display = c.__d; }); if (madeNh) nh.remove();
  lob.hidden = was[0]; lob.innerHTML = was[1]; lob.className = was[3]; if (conn) conn.hidden = was[2];
  const hits = [], k = Object.keys(R); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = R[k[i]], c = R[k[j]]; if (a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]) hits.push(k[i] + '×' + k[j]); }
  const off = k.filter(id => R[id][0] < 0 || R[id][1] < 0 || R[id][2] > innerWidth || R[id][3] > innerHeight);
  return { hits, off, R, lobbyShown: !!R['ar-lobby'], fit }; });
for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500); const o = await overlaps();
  check(`${w}×${h}: HUD, 10-player lobby, a full toast stack and connection banner don't overlap or leave the screen (GDUI-17)`, o.lobbyShown && !!o.R['game-notifications'] && !o.hits.length && !o.off.length, 'toasts ' + JSON.stringify(o.R['game-notifications']) + ' lobby ' + JSON.stringify(o.R['ar-lobby']) + ' ' + (o.hits.join(', ') || '') + ' off:' + o.off.join(',') + ' ' + JSON.stringify(o.R));
  // (no player silently cut off: every row fully visible, or the hidden ones counted in a "+N more · M ready" row; you always shown)
  check(`${w}×${h}: all 10 lobby players visible or counted ("+N more"), your row kept, ready count shown`, o.fit.shown + o.fit.moreN === 10 && o.fit.moreOk && o.fit.you && o.fit.sum === '7/10 ready', JSON.stringify(o.fit)); }
{ const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }); await p.waitForTimeout(700);
  const o = await overlaps(), px = await p.evaluate(() => ({ canvas: __infra.lab.radar.canvasPx, css: document.getElementById('gd-radar').clientWidth, dpr: devicePixelRatio }));
  check('display scaling 2 (1440×900 CSS): no overlaps; the radar\'s dots drawn at the screen\'s pixels (sharp icons)', !o.hits.length && !o.off.length && Math.abs(px.canvas - px.css * 2) <= 2, o.hits.join(', ') + ' ' + JSON.stringify(px));
  await p.screenshot({ path: path.join(out, 'hud-1440-dpr2.png') }); await cdp.send('Emulation.clearDeviceMetricsOverride'); await p.setViewportSize({ width: 1280, height: 720 }); await p.waitForTimeout(500); }
// ---- Tab with the buy menu open: the big map stays small (never over the menu) -----------------------------------
{ await p.evaluate(() => __infra.lab.arenaUI.buy(true)); await p.waitForTimeout(300); await p.keyboard.down('Tab'); await p.waitForTimeout(200);
  const big = await p.evaluate(() => document.getElementById('gd-radar').classList.contains('big')); await p.keyboard.up('Tab');
  const under = await p.evaluate(() => { const v = id => { const e = document.getElementById(id); return e ? getComputedStyle(e).visibility : 'none'; }, c = document.querySelector('#ar-buy .cash')?.getBoundingClientRect(), h = document.getElementById('gd-hp')?.getBoundingClientRect(); return { hp: v('gd-hp'), money: v('ar-money'), hint: v('controls-hint'), cashOverHp: !!(c && h && c.left < h.right && h.left < c.right && c.top < h.bottom && h.top < c.bottom) }; });
  check('buy menu open: the health corner and the HUD cash under its own cash are hidden (no text on text)', under.hp === 'hidden' && under.money === 'hidden' && under.hint !== 'visible', JSON.stringify(under)); await p.evaluate(() => __infra.lab.arenaUI.buy(false)); await p.waitForTimeout(200);
  check('Tab while buying: the big map doesn\'t cover the buy menu', !big); }
// ---- GDUI-02: the Esc menu blocks game input ------------------------------------------------------------------------
{ await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.enter(); }); await p.waitForTimeout(400);
  for (let i = 0; i < 3 && !(await p.evaluate(() => document.getElementById('gd-menu')?.hidden === false)); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(350); }
  const before = await p.evaluate(() => ({ menu: document.getElementById('gd-menu')?.hidden === false, x: __infra.camera.position.x, z: __infra.camera.position.z, own: JSON.stringify(__infra.lab.world.operations.game.arena.loadout?.[__infra.lab.lan.players.find(q => q.id === __infra.lab.lan.selfID)?.name?.toLowerCase?.()] || {}), held: __infra.lab.pistol.current?.id }));
  await p.keyboard.down('KeyW'); await p.waitForTimeout(700); await p.keyboard.up('KeyW'); await p.keyboard.press('KeyG'); await p.keyboard.press('KeyB'); await p.waitForTimeout(500);
  const after = await p.evaluate(() => ({ menu: document.getElementById('gd-menu')?.hidden === false, x: __infra.camera.position.x, z: __infra.camera.position.z, own: JSON.stringify(__infra.lab.world.operations.game.arena.loadout?.[__infra.lab.lan.players.find(q => q.id === __infra.lab.lan.selfID)?.name?.toLowerCase?.()] || {}), held: __infra.lab.pistol.current?.id, buy: !document.getElementById('ar-buy').hidden }));
  check('Esc menu open: holding W doesn\'t walk, G doesn\'t drop, B doesn\'t open the buy menu (GDUI-02)', before.menu && after.menu && Math.hypot(after.x - before.x, after.z - before.z) < .05 && after.own === before.own && after.held === before.held && !after.buy, JSON.stringify({ before, after }));
  await p.keyboard.press('KeyY'); await p.waitForTimeout(150); await p.keyboard.press('KeyU'); await p.waitForTimeout(150); await p.keyboard.press('KeyZ'); await p.waitForTimeout(250);
  const cr = await p.evaluate(() => ({ menu: document.getElementById('gd-menu')?.hidden === false, chat: !!globalThis.__comms?.open, radio: !!globalThis.__comms?.radioOpen, focus: document.activeElement?.tagName, lock: !!document.pointerLockElement }));
  check('Esc menu open: Y / U don\'t open the chat box and Z not the radio menu behind it (GDUI-02)', cr.menu && !cr.chat && !cr.radio && cr.focus !== 'INPUT' && !cr.lock, JSON.stringify(cr));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); check('…Esc closes it', await p.evaluate(() => document.getElementById('gd-menu')?.hidden !== false)); }
// ---- GDUI-03: the window losing focus lets go of the trigger; the chat box taking the keys closes the held scoreboard -
{ await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase !== 'freeze', null, { timeout: 30000 }).catch(() => {});
  // (the pistol in hand made automatic for this check — the host keeps the loadout, so no AK can be handed over here: a
  // held trigger then keeps firing, which is what has to stop; put back afterwards)
  const gun = await p.evaluate(() => { __infra.lab.enter(); const w = __infra.lab.pistol.current; if (!w) return null; w.__auto = w.auto; w.auto = true; return w.id; }); await p.waitForTimeout(1200); await p.mouse.move(640, 360);   /* (past the draw) */
  const s0 = await p.evaluate(() => __infra.lab.pistol.shots); await p.mouse.down(); await p.waitForTimeout(450); const s1 = await p.evaluate(() => __infra.lab.pistol.shots);
  await p.evaluate(() => dispatchEvent(new Event('blur'))); const s2 = await p.evaluate(() => __infra.lab.pistol.shots); await p.waitForTimeout(800); const s3 = await p.evaluate(() => __infra.lab.pistol.shots); await p.mouse.up();
  await p.evaluate(() => { const w = __infra.lab.pistol.current; if (w && '__auto' in w) { w.auto = w.__auto; delete w.__auto; } });
  check('automatic gun held on fire, then Alt/Cmd+Tab (window blur): it stops firing (GDUI-03)', s1 - s0 >= 2 && s3 - s2 <= 1, JSON.stringify({ s0, s1, s2, s3, gun }));
  // releaseHeld's own part (v51's blur never let go of a defuse; its pointer unlock never of push-to-talk): E held at the
  // bomb (nearBomb / defuseHold recorded, not sent), then blur; push-to-talk held, then the mouse lock lost.
  await p.evaluate(() => { const A = __infra.lab.arenaUI, V = globalThis.__voice; globalThis.__rl = { def: [], talk: [] }; A.__nb = A.nearBomb; A.__dh = A.defuseHold; A.nearBomb = () => true; A.defuseHold = on => { __rl.def.push(!!on); return Promise.resolve({}); }; if (V) { V.__talk = V.talk; V.talk = on => { __rl.talk.push(!!on); }; } __infra.lab.enter(); }); await p.waitForTimeout(300);
  await p.keyboard.down('KeyE'); await p.waitForTimeout(200); const d0 = await p.evaluate(() => __rl.def.slice()); await p.evaluate(() => dispatchEvent(new Event('blur'))); const d1 = await p.evaluate(() => __rl.def.slice()); await p.keyboard.up('KeyE');
  // push-to-talk: the mouse lock lost for real (exitPointerLock, waited for — B / the team menu / Esc) keeps it on, as CS2
  // lets you talk while buying; the chat box opening (Y) lets it go (v51 kept transmitting while you typed). The synthetic
  // pointerlockchange is sent only once no lock is held (headless Chromium may or may not have granted the lock).
  const t1 = await p.evaluate(async () => { __rl.talk.length = 0; document.exitPointerLock?.(); for (let i = 0; i < 60 && document.pointerLockElement; i++) await new Promise(r => setTimeout(r, 25)); await new Promise(r => setTimeout(r, 100)); const free = !document.pointerLockElement; if (free) document.dispatchEvent(new Event('pointerlockchange')); return { free, talk: __rl.talk.slice() }; });
  await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(300); await p.evaluate(() => { __rl.talk.length = 0; }); await p.keyboard.press('KeyY'); await p.waitForTimeout(250);
  const t2 = await p.evaluate(() => ({ talk: __rl.talk.slice(), chat: !!globalThis.__comms?.open, focus: document.activeElement?.tagName })); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(() => { const A = __infra.lab.arenaUI, V = globalThis.__voice; A.nearBomb = A.__nb; A.defuseHold = A.__dh; delete A.__nb; delete A.__dh; if (V?.__talk) { V.talk = V.__talk; delete V.__talk; } });
  check('defusing (E held), then window blur: the defuse is let go (GDUI-03)', d0.join() === 'true' && d1.join() === 'true,false', JSON.stringify({ d0, d1 }));
  check('mouse lock lost (B / team menu / Esc): push-to-talk kept on, as CS2 lets you talk while buying', t1.free && !t1.talk.includes(false), JSON.stringify(t1));
  check('the chat box opening (Y): push-to-talk let go (GDUI-03)', t2.talk.includes(false), JSON.stringify(t2));
  await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(300); await p.keyboard.down('Tab'); await p.waitForTimeout(250); const open = await p.evaluate(() => !document.getElementById('ar-board').hidden);
  await p.keyboard.press('KeyY'); await p.waitForTimeout(300); const chat = await p.evaluate(() => ({ board: !document.getElementById('ar-board').hidden, big: document.getElementById('gd-radar').classList.contains('big'), focus: document.activeElement?.tagName }));
  await p.keyboard.up('Tab'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('Tab held, then Y opens the chat: the scoreboard and big map close (their key-up goes to the chat box)', open && !chat.board && !chat.big, JSON.stringify({ open, chat })); }
// ---- GDUI-16: the browser refusing the mouse lock says so in game words, never the cable lab's ---------------------
{ await p.evaluate(() => { document.exitPointerLock?.(); const c = document.getElementById('world'); c.__rpl = c.requestPointerLock; c.requestPointerLock = () => Promise.reject(new Error('refused')); }); await p.waitForTimeout(300);
  await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(600); const txt = await p.evaluate(() => { const c = document.getElementById('world'); c.requestPointerLock = c.__rpl; return document.getElementById('game-notifications')?.textContent || ''; });
  check('mouse lock refused in Global Defensive: a game note, not "CABLE LAB · Mouse capture unavailable" (GDUI-16)', !/CABLE LAB|Mouse capture unavailable/.test(txt) && /Click to aim/.test(txt), txt.slice(-200)); }
// ---- GDUI-06: dead, the radar turns with who you watch -------------------------------------------------------------
{ const r = await p.evaluate(async () => { const G = __infra.lab.world.operations.game, me = __infra.lab.lan.players.find(q => q.id === __infra.lab.lan.selfID)?.name?.toLowerCase?.() || 'rada', { hostNow } = await import('./host-clock.js');
    if (!('watched' in (__infra.lab.spectator || {}))) return { missing: true };   /* (no watched getter at all: v51's spectator — a failure, never a skip) */
    if (__infra.lab.radar.mode !== 'rotate') __infra.lab.radar.toggle(); const down = G.combat.down ||= {}; const was = down[me]; let got = null;
    for (let i = 0; i < 40 && !got; i++) { down[me] = { until: hostNow() + 8000, by: 'BOT X' }; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const w = __infra.lab.spectator.watched; if (w) got = { watched: w.yaw, radar: __infra.lab.radar.angle, name: w.name }; }
    if (was) down[me] = was; else delete down[me]; return got; });
  if (r?.missing) check('dead, watching a team mate: the spectator says who it watches (GDUI-06)', false, 'spectator.watched missing');
  else if (!r) console.log('SKIP spectating radar: nobody alive on your side to watch'); else check('dead, watching a team mate: the rotating radar turns with them (GDUI-06)', Math.abs(r.watched - r.radar) < .02, JSON.stringify(r)); }
// Nuke, two floors: at B (under A) the radar shows the lower level and says so; at A the upper one. Team mates on the
// other floor carry ▲ / ▼ (checked through the same rule the radar draws with).
await p.evaluate(() => __infra.lab.lan.send({ type: 'arena', action: { type: 'change-map', map: 'nuke' } }));
await p.waitForFunction(() => __infra.lab.arenaScene?.map === 'nuke' && __infra.lab.world.operations.game.arena.map === 'nuke', null, { timeout: 40000 }); await p.waitForTimeout(1500);
check('Nuke: both floors\' radar pictures made on arrival (no drawing when someone first walks down: GDUI-12)', await p.evaluate(() => __infra.lab.radar.pictures === 2 && __infra.lab.radar.layer === null));
const at = L => p.evaluate(async L => { const { ARENA } = await import('./facility-layout.js'), { ARENA_MAPS } = await import('./arena-maps.js'), M = ARENA_MAPS.nuke, [x, z, gy] = M.siteGoals[L], f = gy ?? M.nav.floorAt(x, z);
  __infra.lab.look(ARENA.cx + x, ARENA.cz + z, ARENA.cx + x + 10, f + 9.7, ARENA.cz + z, f + 9.7); await new Promise(r => setTimeout(r, 600)); return { layer: __infra.lab.radar.layer, label: __infra.lab.radar.label, feet: +(__infra.camera.position.y - 9.7).toFixed(1), floor: +f.toFixed(1) }; }, L);
const atB = await at('B'); check('Nuke: at B (below A) the radar shows the lower level and "LOWER · B SITE"', atB.layer === 'lower' && atB.label === 'LOWER · B SITE', JSON.stringify(atB));
await p.screenshot({ path: path.join(out, 'nuke-lower.png') });
const atA = await at('A'); check('Nuke: at A the upper level and "A SITE"', atA.layer === null && atA.label === 'A SITE', JSON.stringify(atA));
await p.evaluate(() => __infra.lab.radar.expand(true)); await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, 'nuke-upper-big.png') }); await p.evaluate(() => __infra.lab.radar.expand(false));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
