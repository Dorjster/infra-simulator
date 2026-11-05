// v53 LOOK · the kill-card fan and the HUD at 1920 × 1080 (device scale 1) in a real Global Defensive match, next to the
// user's CS2 pictures (scratchpad v53/ref), muted. Solo Defuse on Dust II, High: at freeze time a picture of the whole
// HUD; then the game's own kill tally is hidden and the same module (dist/gd-kill-emblem.js, CS2's imported cards when
// tools/import-cs2-killfeed.mjs put them in user-assets) is driven to 1, 3 and 5 kills over the real frame (its backdrop
// blur over the map), each a 1:1 bottom-centre crop once its animations have ended. The geometry is read back from the
// page (the cards' boxes, in badge diameters) and checked: card ≥ 0.79 badge tall, every kill from the 1st shows a card.
//   node tests/browser/gd-emblem-hud-shots.mjs <repo> <out>
// Writes <out>/hud.png, <out>/kills-1.png, -3, -5 and <out>/report.json.
import { chromium } from 'playwright-core'; import { writeFileSync, mkdirSync } from 'node:fs';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const { startRoom } = await import(root + '/lan/room.mjs');
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: '/tmp/gd-ehud-' + Date.now() + '.json', roomCode: 'GDEHUD', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--use-angle=metal'] });
let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Looker'); localStorage.setItem('infra-face-name', 'Looker'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', gdPreset: 'High' })); });
const report = {};
try {
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '2'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.looker, null, { timeout: 400000 });
  await p.keyboard.press('Escape'); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  const act = action => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).then(r => r, e => ({ error: String(e?.message || e) })), action);
  await act({ type: 'settings', rules: { start: 800 } }); await act({ type: 'restart' });
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 60000 }).catch(() => {});
  await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  await p.waitForTimeout(3000); await p.screenshot({ path: out + '/hud.png' });
  report.hud = await p.evaluate(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return { color: c.color, box: e.getBoundingClientRect().toJSON() }; }; return { health: q('#gd-hud .hp .num'), ammo: q('#gd-hud .ammo .num'), money: q('#gd-hud .money'), hpbar: q('#gd-hpbar i') }; });
  console.log('HUD', JSON.stringify(report.hud));
  check('money white (CS2 hudmoney.vcss defaultColor #ffffff)', report.hud.money?.color === 'rgb(255, 255, 255)', report.hud.money?.color);
  const team = await p.evaluate(() => __infra.lab.world.operations.game.combat?.d?.teams?.looker), kind = team === 'ct' ? 'incendiary' : 'molotov'; report.buy = await act({ type: 'buy-nade', kind }); console.log('BUY', kind, JSON.stringify(report.buy)?.slice(0, 120));
  // the kill tally: our own instance of the same module over the real frame (the game's hidden)
  const ok = await p.evaluate(async () => { const M = await import('/gd-kill-emblem.js'); let art = null; const m = await fetch('/user-assets/icons/killfeed/killfeed.json').then(r => r.ok ? r.json() : null).catch(() => null);
    if (m?.cards) { const T = { pip: m.pips, card: m.cards, logo: m.logos }; art = { url: (g, n) => T[g]?.[n] ? `/user-assets/icons/killfeed/${T[g][n]}.svg` : null }; }
    for (const e of document.querySelectorAll('.gd-ke')) e.style.visibility = 'hidden'; const e = M.createKillEmblems({ art }); e.root.hidden = false; e.root.style.visibility = 'visible'; window.__ke = e; window.__keM = M; return { cs2Art: !!art }; });
  report.art = ok;
  const geo = () => p.evaluate(() => { const r = window.__ke.root, bd = r.querySelector('.ke-bd').getBoundingClientRect(), D = bd.height; const cards = [...r.querySelectorAll('.ke-f')].filter(f => getComputedStyle(f).visibility === 'visible').map(f => f.getBoundingClientRect());
    if (!cards.length) return { n: 0, D }; const top = Math.min(...cards.map(c => c.top)), x0 = Math.min(...cards.map(c => c.left)), x1 = Math.max(...cards.map(c => c.right)); return { n: cards.length, D, top: (bd.top - top) / D, fan: (x1 - x0) / D, badge: bd.toJSON() }; });   // (the layout boxes; the pixels are measured below)
  let kills = 0;
  for (const [want, seq] of [[1, [[0, 0]]], [3, [[1, 0], [0, 0]]], [5, [[1, 0], [0, 0]]]]) {
    for (const [k, mk] of seq) { await p.evaluate(([k, mk]) => window.__ke.kill(k, mk), [k, mk]); kills++; await p.waitForTimeout(250); }
    await p.waitForTimeout(1400); const g = report['k' + want] = await geo(); console.log('KILLS', want, JSON.stringify(g));
    check(`${want} kill(s): ${want} card(s) shown`, g.n === want, g.n);
    const cx = Math.round(g.badge.x + g.badge.width / 2), cy = Math.round(g.badge.y + g.badge.height / 2); await p.screenshot({ path: `${out}/kills-${want}.png`, clip: { x: cx - 150, y: Math.max(0, cy - 190), width: 300, height: Math.min(240, 1080 - Math.max(0, cy - 190)) } });
  }
  // (v53 LOOK review fix: the card's size MEASURED from pixels, not the module's constant.) A second page at 1920 × 1080
  // CSS px drawn at 3× (a badge 192 px across: a 1 px outline edge is a third of a CSS px, so the measurement is good to
  // ~0.005 badge), no match (the 3D view hidden), the same module and CS2's art; the badge, its ring, logo, line and sparks
  // hidden for the shot; the bright card outlines' rows and columns in badge diameters.
  { const c3 = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 3 }), q = await c3.newPage(), S = 3;
    try { await q.goto(base + '/'); await q.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await q.waitForTimeout(800);
      await q.evaluate(async () => { const M = await import('/gd-kill-emblem.js'); let art = null; const m = await fetch('/user-assets/icons/killfeed/killfeed.json').then(r => r.ok ? r.json() : null).catch(() => null);
        if (m?.cards) { const T = { pip: m.pips, card: m.cards, logo: m.logos }; art = { url: (g, n) => T[g]?.[n] ? `/user-assets/icons/killfeed/${T[g][n]}.svg` : null }; }
        for (const c of document.querySelectorAll('canvas')) c.style.visibility = 'hidden'; for (const e of document.querySelectorAll('.gd-ke')) e.style.visibility = 'hidden';
        const e = M.createKillEmblems({ art }); e.root.hidden = false; e.root.style.visibility = 'visible'; e.root.style.zIndex = '2147483647'; window.__ke = e;
        for (const c of document.body.children) if (c !== e.root && c.tagName !== 'STYLE') c.style.visibility = 'hidden';   // (the start screen and the rest: only the emblem on the black page)
        const st = document.createElement('style'); st.textContent = 'body{background:#000!important}.gd-ke .ke-bd,.gd-ke .ke-rg,.gd-ke .ke-lg,.gd-ke .ke-ln,.gd-ke .ke-sw,.gd-ke .ke-fw,.gd-ke .ke-a,.gd-ke .ke-fl{visibility:hidden!important}'; document.head.append(st); });
      for (const [want, seq] of [[1, [[0, 0]]], [3, [[1, 0], [0, 0]]]]) {
        for (const [k, mk] of seq) { await q.evaluate(([k, mk]) => window.__ke.kill(k, mk), [k, mk]); await q.waitForTimeout(250); }
        await q.waitForTimeout(1500);
        const bd = await q.evaluate(() => window.__ke.root.querySelector('.ke-bd').getBoundingClientRect().toJSON()), cx0 = bd.x + bd.width / 2, cy0 = bd.y + bd.height / 2;
        const clip = { x: Math.round(cx0 - 100), y: Math.round(cy0 - 110), width: 200, height: 104 };   // (above the badge's centre less 6 px: the cards only)
        const png = (await q.screenshot({ clip })).toString('base64'); writeFileSync(`${out}/measure-${want}.png`, Buffer.from(png, 'base64'));
        const m = await q.evaluate(async ([png, top, D]) => { const im = new Image(); im.src = 'data:image/png;base64,' + png; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
          let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) { const k = (y * c.width + i) * 4, r = d[k], g = d[k + 1], b = d[k + 2]; if (Math.max(r, g, b) > 110) {   /* (any bright pixel: the background is black, the badge hidden — the outlines, whatever the HUD colour) */ if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
          return x1 < 0 ? null : { h: (y1 - y0 + 1) / D, top: (top - y0) / D, fan: (x1 - x0 + 1) / D }; }, [png, (bd.y - clip.y) * S, bd.height * S]);
        report['measured' + want] = m; console.log('MEASURED', want, JSON.stringify(m), JSON.stringify(bd));
        if (want === 1) check('1 kill: the card measures ≥ 0.79 badge diameters tall on screen (CS2 0.79; pixels at 3×)', m && m.h >= .79, m && m.h.toFixed(3));
        if (want === 3) check('3 kills: the fan measures 1.04–1.10 badge widths (CS2 pictures 1.06–1.10) and tops 0.62 (±0.03) above the badge (CS2; pixels at 3×)', m && m.fan >= 1.04 && m.fan <= 1.10 && Math.abs(m.top - .62) <= .03, m && m.fan.toFixed(3) + ' / ' + m.top.toFixed(3)); }
    } catch (e) { check('measured the cards', false, String(e?.message || e)); } finally { await c3.close(); } }
  // the baked map's lights (v53 LOOK c): a fire at your feet — its light must reach the map's own shader slots
  { // (bought at freeze time, right after the HUD's picture: the buy time is over by the end of the kill tally's shots)
    await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
    await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 40000 }).catch(() => {});
    const l0 = await p.evaluate(() => { const L = globalThis.__lk = []; const f = WebGL2RenderingContext.prototype.linkProgram; WebGL2RenderingContext.prototype.linkProgram = function (x) { L.push(1); return f.call(this, x); }; return 0; });
    const r = await p.evaluate(kind => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()).normalize(); return __infra.lab.lan.act({ type: 'arena', action: { type: 'throw', kind, x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: -.25, dz: d.z, strength: 'short', vx: 0, vy: 0, vz: 0 } }).then(r => r, e => ({ error: String(e?.message || e) })); }, kind);
    await p.waitForTimeout(2500); const lit = await p.evaluate(async () => { const X = await import('/gd-exposure.js'); return { slots: X.bakedLightsOn(), first: [...X.BAKED_LIGHTS_U.uBPLc.value.slice(0, 3)].map(v => +v.toFixed(2)) /* (v53 PERF4X: flat slots) */, linked: globalThis.__lk.length }; });
    report.fireLight = { kind, throw: r?.error || 'ok', ...lit }; console.log('FIRE', JSON.stringify(report.fireLight)); await p.screenshot({ path: out + '/fire-light.png' });
    check('a fire lights the baked map (a light slot filled)', lit.slots > 0, JSON.stringify(lit)); }
  check('no page error', !errs.length, errs[0]);
} catch (e) { check('ran', false, String(e?.message || e)); }
writeFileSync(out + '/report.json', JSON.stringify({ ...report, errs }, null, 1)); await b.close(); room.close?.();
console.log(failed ? `FAIL: gd-emblem-hud-shots · ${failed}` : 'PASS: gd-emblem-hud-shots'); process.exit(failed ? 1 : 0);
