// Global Defensive · the CS2 HUD (v53 stage 4, Addendum 7) and the bomb on the radar (Addendum 8) in the real game, muted.
// Part 1 — Defuse on Dust II against 9 easy bots (5 v 5) at 1920 × 1080: every HUD box measured from the page (its
// getBoundingClientRect) against the user's CS2 picture's fractions (gd-hud-layout.js REF) at 1920 × 1080, 1366 × 768,
// 2560 × 1440 and 1280 × 720 (= 1920 × 1080 at 150 % Windows scaling); the HUD scale 1.4 keeps every box on the screen;
// then our HUD next to cs2-hud.png at the same resolution → <out>/hud-vs-cs2.jpg (--hud-pic <jpg>).
// Part 2 — Defuse with no bots (you are the only Terrorist, so you carry the bomb): the radar pictured carrying it, after
// dropping it (CS2's growing ring, 3 moments of its 0.75 s cycle) and planted on A (the blink, 2 moments), on one
// labelled sheet → <out>/radar-bomb.jpg (--radar-pic <jpg>).
//   node tests/browser/gd-hud-shots.mjs <repo-root> <out-dir> [--kf <dir>] [--hud <dir>] [--hud-pic <jpg>] [--radar-pic <jpg>]
//     --kf <dir>    serve /user-assets/icons/killfeed/ from <dir> (a tools/import-cs2-killfeed.mjs import made elsewhere)
//     --hud <dir>   serve /user-assets/icons/hud/ from <dir> (a tools/import-cs2-hud.mjs import made elsewhere)
import { chromium } from 'playwright-core'; import { spawn, execFileSync } from 'node:child_process'; import { existsSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const KF_DIR = opt('--kf'), HUD_DIR = opt('--hud'), HUD_PIC = opt('--hud-pic'), RADAR_PIC = opt('--radar-pic'), ONLY = opt('--only');   // (--only hud | radar: one part)
const [root = '.', out = path.join(os.tmpdir(), 'gd-hud-shots')] = argv; mkdirSync(out, { recursive: true });
const REF_PIC = '/private/tmp/claude-501/-Users-dorjoht-Downloads-infra-lan-v31--2-/e36c7b43-670b-481d-8e6b-7efd02f58f36/scratchpad/v53/ref/cs2-hud.png';
const { REF } = await import(path.resolve(root, 'dist/gd-hud-layout.js'));
let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 400))); };
async function server(code) { const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: code, HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdhud-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  process.on('exit', () => { try { s.kill(); } catch {} }); let err = ''; s.stderr.on('data', d => { err += d; });
  const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + err.slice(-300))), 120000); s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); }); return { s, base }; }
const serveDir = async (p, pat, dir) => { if (!dir) return; await p.route(pat, r => { const f = path.join(dir, decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop())); if (!existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: readFileSync(f), contentType: f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'application/json' }); }); };
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
async function game(base, bots, vp, freeze = 6) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await serveDir(p, '**/user-assets/icons/killfeed/**', KF_DIR); await serveDir(p, '**/user-assets/icons/hud/**', HUD_DIR);
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', showControls: false }));   /* (no controls strip: CS2 has none) */ });
  p.on('response', r => { if (r.status() === 404 && !/favicon/.test(r.url())) console.log('404', r.url().replace(base, '')); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }).catch(e => { throw Error('no game: ' + errs.slice(0, 6).join(' | ')); }); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', String(bots));
  await p.evaluate(fr => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', fr], ['ss-ar-diff', 'easy']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } }, String(freeze)); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.tester, null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  await p.waitForTimeout(1500); return { p, errs }; }
const SEL = { radar: '#gd-radar', timer: '#gd-hud .timer', scoreCT: '#gd-hud .scoreCT', avatarsCT: '#gd-hud .avatarsCT', avatarsT: '#gd-hud .avatarsT', health: '#gd-hp .health', badge: '#gd-ke .ke-bd', ammo: '#gd-wp .ammo', money: '#gd-hud .money', wpn2: '#gd-wp .r2', wpnName: '#gd-wp .r2 .nm', wpn3: '#gd-wp .r3', bombKit: '#gd-wp .bombKit' };
async function measure(p, tag) {
  const R = await p.evaluate(sel => { const o = {}; for (const [k, s] of Object.entries(sel)) { const e = document.querySelector(s); if (!e) continue; const r = e.getBoundingClientRect(); if (r.width || r.height) o[k] = [r.x, r.y, r.width, r.height]; } return { o, W: innerWidth, H: innerHeight }; }, SEL);
  const rows = []; let worst = 0;
  for (const [k, [fx, fy, mode]] of Object.entries(REF)) { const r = R.o[k]; if (!r) continue; const [x, y, w, h] = r, gx = (k === 'wpnName' ? x + w : mode === 'l' ? x : mode === 'r' ? x + w : x + w / 2) / R.W, gy = (y + h / 2) / R.H, d = Math.max(Math.abs(gx - fx) / .008, Math.abs(gy - fy) / .01); worst = Math.max(worst, d); rows.push(`${k} (${gx.toFixed(3)}, ${gy.toFixed(3)}) vs (${fx}, ${fy})${d > 1 ? ' ✗' : ''}`); }
  check(`${tag}: the HUD boxes on the page at the picture's fractions (±0.008 W, ±0.01 H; measured ${rows.length})`, worst <= 1 && rows.length >= 11, rows.join(' · '));
  return R; }
const pics = {};
try {
  // ── Part 1: 5 v 5, the HUD ──
  if (ONLY !== 'radar') { const { base } = await server('GDHUD1'), { p, errs } = await game(base, 9, { width: 1920, height: 1080 }, 25);   // (a long freeze time: everything measured and pictured before the round goes live)
    // a Terrorist, as in the user's picture (its T badge, gold HUD): the side change, then the round restarted (host)
    if (await p.evaluate(() => __infra.lab.world.operations.game.combat.d.teams.tester) !== 't') { await p.evaluate(async () => { await __infra.lab.lan.act({ type: 'arena', action: { type: 'team', team: 't' } }); await __infra.lab.lan.act({ type: 'arena', action: { type: 'restart-round' } }); });
      await p.waitForFunction(() => { const d = __infra.lab.world.operations.game.combat.d; return d.teams.tester === 't' && d.round.phase === 'freeze'; }, null, { timeout: 60000, polling: 200 }).catch(() => {}); await p.waitForTimeout(1500); }
    const team = await p.evaluate(() => __infra.lab.world.operations.game.combat.d.teams.tester); console.log('you are', team); check('you play a Terrorist (the picture: the T badge, gold HUD)', team === 't', team);
    await p.keyboard.press('Digit2'); await p.waitForFunction(() => document.getElementById('controls-hint')?.hidden !== false, null, { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(400);   // (the first 14 s' key strip gone, as in a CS2 screenshot)
    await measure(p, '1920 × 1080');
    const tc = await p.evaluate(() => ({ av: document.querySelectorAll('#gd-hud .av.on').length, timer: document.querySelector('#gd-hud .timer b').textContent, money: document.querySelector('#gd-hud .money b').textContent, ammo: document.querySelector('#gd-wp .ammo .num').textContent + '|' + document.querySelector('#gd-wp .reserve b').textContent, top: getComputedStyle(document.getElementById('ar-top')).display, hp: document.querySelector('#gd-hp .health .num').textContent, arm: document.querySelector('#gd-hp .armor').className, hc: getComputedStyle(document.getElementById('gd-hud')).getPropertyValue('--hc').trim(), font: [...document.fonts].some(f => f.family.replace(/["']/g, '') === 'GD HUD' && f.weight === '700' && f.status === 'loaded') && getComputedStyle(document.querySelector('#gd-hp .num')).fontFamily.includes('GD HUD') }));   // (our font's face really loaded — document.fonts.check is true with no face at all)
    check('team counter: 10 avatars, the timer, "$800", the pistol\'s "20 | 120", 100 health, no armour box at 0, the old top bar hidden, team-colour HUD, our font loaded', tc.av === 10 && /^\d:\d\d$/.test(tc.timer) && tc.money === '$800' && /^\d+\|\d+$/.test(tc.ammo) && tc.hp === '100' && !/\bon\b/.test(tc.arm) && tc.top === 'none' && (tc.hc === '#eabe54' || tc.hc === '#96c8fa') && tc.font, JSON.stringify(tc));
    await p.screenshot({ path: path.join(out, 'hud-1920.png') }); pics.hud = path.join(out, 'hud-1920.png');
    for (const [w, h] of [[1366, 768], [2560, 1440], [1280, 720]]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(900); await measure(p, `${w} × ${h}`); if (w === 2560) await p.screenshot({ path: path.join(out, 'hud-2560.png') }); }
    await p.setViewportSize({ width: 1920, height: 1080 }); await p.waitForTimeout(500);
    for (const s of [1.4, .8]) { await p.evaluate(async s => { const P = await import('/gd-hud-prefs.js'); P.saveHudPrefs({ scale: s }); }, s); await p.waitForTimeout(500);
      const offs = await p.evaluate(() => [...document.querySelectorAll('#gd-hud .vb > *, #gd-hud .vb .wl > *, #gd-hud .tc > *, #gd-hp > *, #gd-wp > *, #gd-radar, #gd-ke .ke-bd')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1); }).map(e => e.className || e.id));
      const k = await p.evaluate(() => document.querySelector('#gd-ke .ke-bd').getBoundingClientRect().width);
      check(`HUD scale ${s}: every box on the screen, the badge scaled with it (${k.toFixed(1)} px)`, !offs.length && Math.abs(k - 64 * s) < 1.5, offs.join()); if (s === 1.4) await p.screenshot({ path: path.join(out, 'hud-scale-1.4.png') }); }
    await p.evaluate(async () => { const P = await import('/gd-hud-prefs.js'); P.saveHudPrefs({}); });
    check('part 1: no page errors', !errs.length, errs.slice(0, 4).join(' | ')); await p.close(); }
  // side by side at the same resolution (1920 × 1080): ours | CS2's picture scaled up
  if (ONLY !== 'radar') { const dst = HUD_PIC || path.join(out, 'hud-vs-cs2.jpg'); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', pics.hud, '-i', REF_PIC, '-filter_complex', '[1:v]scale=1920:1080:flags=lanczos[r];[0:v][r]hstack=inputs=2,scale=3840:1080', '-q:v', '3', dst]); console.log('picture:', dst); }
  // ── Part 2: the bomb on the radar (you carry it) ──
  if (ONLY !== 'hud') { const { base } = await server('GDHUD2'), { p, errs } = await game(base, 0, { width: 1920, height: 1080 });   // (no bots: you are the only Terrorist, so you carry the bomb)
    const clip = await p.evaluate(() => { const r = document.getElementById('gd-radar').getBoundingClientRect(); return { x: Math.max(0, r.x - 14), y: Math.max(0, r.y - 14), width: r.width + 28, height: r.height + 40 }; });
    const shots = []; const shot = async (tag, label) => { const f = path.join(out, 'radar-' + tag + '.png'); await p.screenshot({ path: f, clip }); shots.push({ f, label }); };
    if (!(await p.evaluate(() => __infra.lab.world.operations.game.combat.d.bomb?.carrier))) {   // (the map took longer to load than the freeze time: the bomb is handed out in the freeze — restart the round)
      await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'restart-round' } })); await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.bomb?.carrier === 'tester', null, { timeout: 30000, polling: 200 }).catch(() => {}); }
    await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'live', null, { timeout: 30000, polling: 200 });
    const st = await p.evaluate(() => { const d = __infra.lab.world.operations.game.combat.d; return { team: d.teams.tester, carrier: d.bomb?.carrier }; }); check('part 2: you are the Terrorist with the bomb', st.team === 't' && st.carrier === 'tester', JSON.stringify(st));
    await shot('carry', 'Carrying the C4: the mark on your arrow');
    await p.keyboard.press('Digit5'); await p.waitForTimeout(700);
    const dr = await p.evaluate(() => __infra.lab.arenaUI.drop()); await p.waitForTimeout(1200);
    const ground = await p.evaluate(() => (__infra.lab.world.operations.game.combat.ground || []).filter(g => g.item === 'c4').length); check('the bomb dropped: on the ground', ground === 1, ground);
    // step back a little so the arrow doesn't cover it, then picture three moments of the 0.75 s ring
    await p.evaluate(() => { const c = __infra.camera.position; c.x += 14; }); await p.waitForTimeout(300);
    for (const [i, ms] of [[1, 0], [2, 250], [3, 250]]) { await p.waitForTimeout(ms); await shot('dropped' + i, `Dropped (T sees it): ring ${['', 'early', 'grown', 'fading'][i]}`); }
    // walk back over it (picked up), to site A, plant
    await p.evaluate(() => { const g = (__infra.lab.world.operations.game.combat.ground || []).find(x => x.item === 'c4'); if (g) { __infra.camera.position.x = g.x; __infra.camera.position.z = g.z; } }); await p.waitForTimeout(1500);
    const back = await p.evaluate(() => __infra.lab.world.operations.game.combat.d.bomb?.carrier); check('picked up again by walking over it', back === 'tester', back);
    await p.evaluate(async () => { const { ARENA } = await import('/facility-layout.js'), { ARENA_MAPS } = await import('/arena-maps.js'); const [x, z] = ARENA_MAPS.dust2.sites.A; __infra.camera.position.x = ARENA.cx + x; __infra.camera.position.z = ARENA.cz + z; });
    await p.waitForTimeout(700); await p.keyboard.press('Digit5'); await p.waitForTimeout(800); await p.mouse.move(960, 540); await p.mouse.down(); await p.waitForTimeout(3600); await p.mouse.up();
    const ph = await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'planted', null, { timeout: 8000, polling: 200 }).then(() => 'planted', () => 'not planted'); check('planted on A', ph === 'planted', ph);
    await p.evaluate(() => { const c = __infra.camera.position; c.x += 10; }); await p.waitForTimeout(400);
    // the blink's own brightest and darkest moments (the radar's BOMB.lit: RadarBombPlantPulse 0.1 … 0.8)
    const litAt = async (want, tag, label) => { await p.waitForFunction(w => { const l = __infra.lab.radar?.bomb?.lit ?? 0; return w > .5 ? l > .75 : l < .16; }, want, { timeout: 4000, polling: 'raf' }).catch(() => {}); const l = await p.evaluate(() => __infra.lab.radar?.bomb?.lit ?? -1); await shot(tag, `${label} · opacity ≈ ${l.toFixed(2)}`); return l; };
    const hi = await litAt(1, 'planted1', 'Planted: blinking (bright)'), lo = await litAt(0, 'planted2', 'Planted: blinking (dim)'); check('the planted pictures at the blink\'s top and bottom', hi > .7 && lo >= 0 && lo < .2, hi + ' / ' + lo);
    check('part 2: no page errors', !errs.length, errs.slice(0, 4).join(' | ')); await p.close();
    // the sheet
    const s = await b.newPage({ viewport: { width: 1600, height: 900 } }), img = f => 'data:image/png;base64,' + readFileSync(f).toString('base64');
    await s.setContent(`<style>body{margin:0;padding:16px 20px;background:#15181c;color:#e8ecef;font:14px system-ui}h1{font-size:20px;margin:0 0 4px}.n{color:#aab;margin:0 0 10px}.r{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0}figure img{display:block;height:340px;border:1px solid #333;image-rendering:auto}figcaption{font:12px ui-monospace,Menlo,monospace;color:#cfd;margin-top:3px;max-width:300px}</style>
      <h1>Global Defensive v53 · the bomb on the radar like CS2 (Addendum 8)</h1><p class="n">Dust II, Defuse, the real game at 1920×1080, muted. CS2's radar marks (hudradar.vcss): the dropped C4 inside a ring that grows and fades every 0.75 s (#DroppedBomb, #880000), the planted C4 blinking every 0.65 s inside a 70 px #D10000 ring. ${HUD_DIR ? "CS2's own radar C4 icon (tools/import-cs2-hud.mjs)." : 'Our own C4 icon (no CS2 import served).'} CTs see a dropped bomb only with a line of sight (tests/gd-radar-bomb.mjs).</p>
      <div class="r">${shots.map(x => `<figure><img src="${img(x.f)}"><figcaption>${x.label}</figcaption></figure>`).join('')}</div>`);
    await s.waitForTimeout(300); const dst = RADAR_PIC || path.join(out, 'radar-bomb.jpg'); await s.screenshot({ path: dst, type: 'jpeg', quality: 90, fullPage: true }); await s.close(); console.log('picture:', dst); }
} finally { await b.close(); }
console.log(failed ? `FAIL: gd-hud-shots · ${failed} failed` : 'PASS: gd-hud-shots'); process.exit(failed ? 1 : 0);
