// Nuke's Lobby ladder and its broken windows in the real game (practice, no bots, the CS2 map files; the v52 reports "on
// Nuke's Lobby ladder we can't go up" and "Nuke's B glasses: when they break we can go through the window"). The ladder
// (Hammer 232…235, −861…−835, from the Lobby floor −416 to −52, on a wall at x 244): walked up to from the Lobby, W held
// and looking up (the game's own keys and movement), it climbs to the top and stays there (it went in behind the ladder
// and fell down a slot onto a sliver at −280); stepping back and to the side lands on the upper floor at −96. The
// Observation window (y −354, CS2 keeps players out of it, glass or no glass): a shot breaks it, then running and
// jumping at it stays in the room — and a shot still goes through the broken window. Pictures, a report, and a labelled
// sheet (out-dir/sheet.jpg).
//   node tests/browser/gd-nuke-ladder-window.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-nuke-ladder-window')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
if (!existsSync(path.join(root, 'user-maps', 'nuke.bsp'))) { console.log('SKIP: no Nuke map file'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDNL01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdnl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], report = { checks: [] }; let fails = 0;
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')); if (!ok) fails++; };
const pics = [];   // [file, label]
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', 'nuke'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(2500);
  const g = h => p.evaluate(async h => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), Hm = ARENA_MAPS.nuke.hammer; return [ARENA.cx + (h[0] - Hm.x0) * Hm.U - Hm.W / 2, (h[2] - Hm.zLow) * Hm.U, ARENA.cz + (Hm.y1 - h[1]) * Hm.U - Hm.D / 2]; }, h);
  const menus = () => p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.arenaUI?.buy?.(false); });
  const snap = async (file, label) => { await p.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 80 }); pics.push([file, label]); };
  // Stand at feet `from` (Hammer), looking at `at`; the game's movement takes over from there.
  const place = async (from, at) => { await menus(); const e = await g([from[0], from[1], from[2] + 64]), t = await g(at); await p.evaluate(({ e, t }) => __infra.lab.look(e[0], e[2], t[0], t[1], t[2], e[1]), { e, t }); await p.waitForTimeout(500); await p.waitForFunction(() => __infra.lab.move?.am, null, { timeout: 15000 }); };
  // Hold keys for ms (KeyboardEvents, as a player's), Space every 0.3 s when jump; the feet's path in Hammer units.
  const hold = (codes, ms, jump = false) => p.evaluate(async ({ codes, ms, jump }) => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), Hm = ARENA_MAPS.nuke.hammer, sleep = t => new Promise(r => setTimeout(r, t));
    const H = a => [(a.x - ARENA.cx + Hm.W / 2) / Hm.U + Hm.x0, Hm.y1 - (a.z - ARENA.cz + Hm.D / 2) / Hm.U, a.y / Hm.U + Hm.zLow].map(Math.round), key = (c, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: c, key: c.replace('Key', '').toLowerCase() }));
    const t0 = performance.now(), trace = []; let jumps = 0, top = -Infinity, low = Infinity, maxX = -Infinity; for (const c of codes) key(c, true);
    while (performance.now() - t0 < ms) { if (jump && ((performance.now() - t0) / 300 | 0) > jumps) { jumps++; key('Space', true); setTimeout(() => key('Space', false), 50); }
      await sleep(20); const am = __infra.lab.move.am; if (!am) continue; const h = H(am); trace.push(h); top = Math.max(top, h[2]); low = Math.min(low, h[2]); maxX = Math.max(maxX, h[0]); }
    for (const c of codes) key(c, false); await sleep(400); const am = __infra.lab.move.am; return { end: am ? H(am) : null, onLadder: !!am?.onLadder, onGround: !!am?.onGround, top, low, maxX, trace: trace.filter((_, i) => i % 10 === 0) }; }, { codes, ms, jump });
  // ── the Lobby ladder ──
  await place([196, -848, -416], [234, -848, -200]); await snap('1-lobby-ladder-foot.jpg', 'Lobby ladder from its foot (W, looking up)');
  const up = await hold(['KeyW'], 3200); report.up = up;
  check('Lobby ladder: W held, looking up, climbs to its top (−52)', up.top > -70, JSON.stringify({ top: up.top, end: up.end }));
  check('Lobby ladder: never in behind its face (the wall at x 244; it went into a slot there)', up.maxX < 236, 'furthest x ' + up.maxX);
  const held = await hold(['KeyW'], 1500); report.held = held;
  check('Lobby ladder: W held on at its top stays at the top (it fell down the slot behind it onto −280)', held.low > -110 && held.end && held.end[2] > -110, JSON.stringify({ low: held.low, end: held.end }));
  await p.evaluate(() => { const c = __infra.camera; c.rotation.x = 0; }); await snap('2-lobby-ladder-top.jpg', 'At the top of the Lobby ladder');
  let off = null; for (const side of ['KeyA', 'KeyD']) { const before = await p.evaluate(() => ({ ...__infra.lab.move.am })); const r = await hold(['KeyS', side], 450); report['off ' + side] = r;
    if (r.end && Math.abs(r.end[2] + 96) < 6 && r.onGround) { off = { side, ...r }; break; }
    await place([214, -848, -60], [234, -848, -40]); await hold(['KeyW'], 600); }   // (back on at the top for the other side)
  check('Lobby ladder: stepping back and to the side at its top lands on the upper floor (−96)', !!off, JSON.stringify(off ? { keys: 'S+' + off.side, end: off.end } : report['off KeyD']?.end));
  await p.evaluate(() => { const c = __infra.camera; c.rotation.x = -.15; }); await snap('3-lobby-ladder-off.jpg', off ? 'Got off at the top: upper floor (−96)' : 'Did NOT get off at the top');
  // ── the Observation window (y −354): broken, still in the way; shots still pass ──
  const win = await p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), M = ARENA_MAPS.nuke, Hm = M.hammer, toH = (x, z) => [(x + Hm.W / 2) / Hm.U + Hm.x0, Hm.y1 - (z + Hm.D / 2) / Hm.U];
    const id = M.movers.findIndex(m => { if (m.kind !== 'break' || !m.pane) return false; const a = toH(m.box[0], m.box[3]), c = toH(m.box[1], m.box[2]); return a[0] < 1100 && c[0] > 1350 && Math.abs(a[1] + 354) < 3 && (m.box[4] / Hm.U + Hm.zLow) < -620; }); return { id, clip: !!M.movers[id]?.clip }; });
  check('Observation window: its pane is one CS2 keeps players out of (clip)', win.id >= 0 && win.clip, JSON.stringify(win));
  await place([1230, -430, -640], [1230, -354, -575]); await p.waitForTimeout(300); await snap('4-window-whole.jpg', 'Observation window (whole)');
  const shot = await p.evaluate(async ({ e, t, id }) => { const { bulletPath, BulletPath } = await import('/arena-maps.js'); const S = __infra.lab.arenaScene, dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2], L = Math.hypot(dx, dy, dz);
    const P = bulletPath(S.boxes, e[0], e[1], e[2], dx / L, dy / L, dz / L, 2000, 0, new BulletPath()), box = S.boxes.movers.find(q => q.mover === id && q.role === 'shut');
    dispatchEvent(new CustomEvent('gd-break', { detail: { boxes: [box], dmg: 30 } })); return { crossed: P.crossed.some(c => c.b?.mover === id) || P.stopBox?.mover === id }; }, { e: await g([1230, -420, -575]), t: await g([1230, -354, -575]), id: win.id });
  await p.waitForTimeout(1200); const broken = await p.evaluate(id => !!__infra.lab.world.operations.game.combat?.mapState?.broken?.[id], win.id);
  check('Observation window: a shot breaks it (room state)', shot.crossed && broken, JSON.stringify({ ...shot, broken }));
  await place([1230, -430, -640], [1230, -354, -575]); await p.waitForTimeout(400); await snap('5-window-broken.jpg', broken ? 'Observation window shot: broken' : 'Observation window: NOT broken');
  const run = await hold(['KeyW'], 2500, true); report.run = run;
  check('Observation window: broken, running and jumping at it stays in the room (CS2\'s clip)', run.end && run.end[1] < -350, JSON.stringify({ end: run.end }));
  await snap('6-window-walk.jpg', run.end && run.end[1] < -350 ? 'Ran and jumped at the broken window: stayed in' : 'WENT THROUGH the broken window');
  const pass = await p.evaluate(async ({ e, t }) => { const { bulletPath, BulletPath } = await import('/arena-maps.js'); const S = __infra.lab.arenaScene, dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2], L = Math.hypot(dx, dy, dz);
    const P = bulletPath(S.boxes, e[0], e[1], e[2], dx / L, dy / L, dz / L, L, 0, new BulletPath()); return { stop: +(P.stop / L).toFixed(2) }; }, { e: await g([1230, -420, -575]), t: await g([1230, -300, -575]) });
  check('Observation window: broken, a shot still goes through it', pass.stop > .66, JSON.stringify(pass));
  report.errs = errs; check('No page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  // ── the labelled sheet ──
  const imgs = pics.map(([f, label]) => ({ label, src: 'data:image/jpeg;base64,' + readFileSync(path.join(out, f)).toString('base64') }));
  const q = await b.newPage({ viewport: { width: 400, height: 300 } });
  const jpg = await q.evaluate(async ({ imgs, title }) => { const W = 480, H = 300, cols = 3, rows = Math.ceil(imgs.length / cols), c = document.createElement('canvas'); c.width = cols * W; c.height = rows * (H + 26) + 40; const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.fillText(title, 12, 28);
    for (let i = 0; i < imgs.length; i++) { const im = new Image(); im.src = imgs[i].src; await im.decode(); const cx = (i % cols) * W, cy = 40 + ((i / cols) | 0) * (H + 26); x.drawImage(im, cx + 2, cy, W - 4, H); x.fillStyle = /NOT|WENT/.test(imgs[i].label) ? '#f66' : '#eee'; x.font = '15px sans-serif'; x.fillText(imgs[i].label, cx + 8, cy + H + 18); }
    return c.toDataURL('image/jpeg', .85).split(',')[1]; }, { imgs, title: 'Global Defensive v52 · Nuke: Lobby ladder, broken Observation window' });
  writeFileSync(path.join(out, 'sheet.jpg'), Buffer.from(jpg, 'base64'));
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log((fails ? 'FAIL' : 'PASS') + ': Nuke Lobby ladder and broken window in the game · ' + report.checks.length + ' checks, ' + fails + ' failed · ' + path.join(out, 'sheet.jpg'));
} finally { await b.close(); server.kill(); }
process.exit(fails ? 1 : 0);
