// Nuke's vent and B's glass in the real game (practice, no bots, the CS2 map files): the vent grille on A drawn and in the
// way while whole; a shot breaks it (the way weapons.js sends what a bullet crossed: 'gd-break'); then the body jumps
// again and again along the vents (W held, Space every ~0.3 s — the game's own keys and movement) and must stay inside
// them (it went up through the vents' 4-unit roof into the void, the v52.0.1 report); then every kind of glass on B is
// shot — a floor pane, the floor panels the importer left as world, the panels under a metal rail, the Observation
// window — and must break. Pictures, a report, and a labelled sheet (out-dir/sheet.jpg).
//   node tests/browser/gd-nuke-vent-glass.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-nuke-vent-glass')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
if (!existsSync(path.join(root, 'user-maps', 'nuke.bsp'))) { console.log('SKIP: no Nuke map file'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDNV01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdnv-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], report = { checks: [] }; let fails = 0;
const check = (name, ok, detail = '') => { report.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')); if (!ok) fails++; };
const pics = [];   // [file, label]
// B's glass (Hammer): eye, aim point, what it is
const SHOTS = [
  ['floor-pane', [430, -1000, -704], [481, -925, -772], 'B floor pane'],
  ['floor-panel-west', [300, -800, -704], [225, -722, -772], 'B floor panel (was world)'],
  ['floor-panel-railed', [560, -800, -704], [592, -754, -772], 'B panel under a rail'],
  ['floor-panel-railed-2', [640, -860, -704], [673, -805, -772], 'B panel under a rail (2)'],
  ['observation-window', [990, -465, -578], [1038, -465, -560], 'B Observation window'],
  ['observation-window-2', [1085, -560, -545], [1038, -560, -565], 'B Observation window (2), from inside'],
];
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', 'nuke'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(2500);
  const g = h => p.evaluate(async h => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), Hm = ARENA_MAPS.nuke.hammer; return [ARENA.cx + (h[0] - Hm.x0) * Hm.U - Hm.W / 2, (h[2] - Hm.zLow) * Hm.U, ARENA.cz + (Hm.y1 - h[1]) * Hm.U - Hm.D / 2]; }, h);
  const menus = () => p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.arenaUI?.buy?.(false); });   // (a respawn opens the buy menu)
  const aim = async (eye, tgt) => { await menus(); const e = await g(eye), t = await g(tgt); await p.evaluate(({ e, t }) => { __infra.lab.look(e[0], e[2], t[0], t[1], t[2], e[1]); __infra.camera.lookAt(t[0], t[1], t[2]); }, { e, t }); await p.waitForTimeout(150);
    await p.evaluate(({ e, t }) => { __infra.camera.position.set(e[0], e[1], e[2]); __infra.camera.lookAt(t[0], t[1], t[2]); }, { e, t }); return { e, t }; };
  const snap = async (file, label) => { await p.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 80 }); pics.push([file, label]); };
  const view = async (eye, tgt, file, label) => { await aim(eye, tgt); await p.waitForTimeout(600); await aim(eye, tgt); await p.waitForTimeout(150); await snap(file, label); };
  // A shot from eye at tgt as weapons.js makes it: the breakables the bullet crossed before what stopped it go to the room.
  const shoot = async (eye, tgt) => p.evaluate(async ({ e, t }) => { const { bulletPath, BulletPath } = await import('/arena-maps.js'); const S = __infra.lab.arenaScene, bx = S.boxes; const dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2];
    const P = bulletPath(bx, e[0], e[1], e[2], dx, dy, dz, 2000, 0, new BulletPath()), broke = new Set(); for (const c of P.crossed) if (c.b?.mover != null && S.breakableOf(c.b) != null) broke.add(c.b); if (P.stopBox && S.breakableOf(P.stopBox) != null) broke.add(P.stopBox); if (P.embedded && S.breakableOf(P.embedded) != null) broke.add(P.embedded);
    if (broke.size) dispatchEvent(new CustomEvent('gd-break', { detail: { boxes: [...broke], dmg: 30 } })); return { stop: +P.stop.toFixed(2), stopMat: P.stopBox?.mat || null, sent: [...broke].map(x => x.mover) }; }, { e: await g(eye), t: await g(tgt) });
  const brokenOf = ids => p.evaluate(ids => { const ms = __infra.lab.world.operations.game.combat?.mapState; return ids.map(i => !!ms?.broken?.[i]); }, ids);
  // ── the vent grille: its mover, its look, its box ──
  const vent = await p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), M = ARENA_MAPS.nuke, id = M.movers.findIndex(m => m.kind === 'break' && m.health === 25 && m.lookBounds && !m.pane), m = M.movers[id]; let look = null; __infra.scene.traverse(o => { if (o.userData?.cs2Render) look = o; });
    const S = __infra.lab.arenaScene, G = look?.userData.movers?.get(m.e); let tris = 0, meshes = 0, vis = !!G; for (let q = G; q; q = q.parent) if (!q.visible) vis = false; G?.traverse(o => { if (o.isMesh) { meshes++; tris += (o.geometry.index?.count || 0) / 3; } });
    const box = S.boxes.movers.find(b => b.mover === id && b.role === 'shut'); return { id, e: m.e, meshes, tris, visible: vis, box: !!box, boxOn: !!box && !box.off, breakable: S.breakableOf(box) }; });
  check('Vent grille: its look is drawn (the grille\'s meshes on its mover)', vent.meshes > 0 && vent.tris > 100 && vent.visible, JSON.stringify(vent));
  check('Vent grille: its collision stands while whole and a shot can break it', vent.boxOn && vent.breakable === vent.id, JSON.stringify(vent));
  await view([448, -1335, -350], [448, -1402, -372], '1-vent-from-A.jpg', 'Vent grille from A (whole)');
  await view([448, -1440, -380], [448, -1402, -372], '2-vent-from-shaft.jpg', 'Vent grille from the shaft (whole)');
  // in the way: a body on A walking into it (the game's movement) stays out
  const blockedNow = await p.evaluate(async () => { const { blocked } = await import('/arena-move.js'), { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), Hm = ARENA_MAPS.nuke.hammer, S = __infra.lab.arenaScene;
    const x = ARENA.cx + (448 - Hm.x0) * Hm.U - Hm.W / 2, z = ARENA.cz + (Hm.y1 + 1402) * Hm.U - Hm.D / 2, y = (-414 - Hm.zLow) * Hm.U; return blocked(S.boxes, null, x, z, y, 54 * Hm.U); });
  check('Vent grille: whole, a crouched body can\'t pass through it', blockedNow);
  const sv = await shoot([448, -1360, -360], [448, -1402, -372]); await p.waitForTimeout(1200); const [vb] = await brokenOf([vent.id]);
  check('Vent grille: a shot breaks it (room state)', vb, JSON.stringify(sv));
  await view([448, -1335, -350], [448, -1402, -372], '3-vent-broken.jpg', 'Vent grille shot: broken, open');
  const freeNow = await p.evaluate(async () => { const { blocked } = await import('/arena-move.js'), { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), Hm = ARENA_MAPS.nuke.hammer, S = __infra.lab.arenaScene;
    const x = ARENA.cx + (448 - Hm.x0) * Hm.U - Hm.W / 2, z = ARENA.cz + (Hm.y1 + 1402) * Hm.U - Hm.D / 2, y = (-414 - Hm.zLow) * Hm.U; return !blocked(S.boxes, null, x, z, y, 54 * Hm.U); });
  check('Vent grille: broken, a crouched body crawls through', freeNow);
  // ── jumping along the vents (W held, Space pressed again and again) ──
  const run = async (name, from, toward, ms, low) => { await menus(); const e = await g([from[0], from[1], -544]), t = await g([toward[0], toward[1], -544]);
    await p.evaluate(({ e, t }) => { __infra.lab.look(e[0], e[2], t[0], t[1], t[2], e[1]); }, { e, t }); await p.waitForTimeout(500); await p.waitForFunction(() => __infra.lab.move?.am, null, { timeout: 15000 });
    return p.evaluate(async ({ ms, low }) => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), Hm = ARENA_MAPS.nuke.hammer, sleep = t => new Promise(r => setTimeout(r, t));
      const H = a => [(a.x - ARENA.cx + Hm.W / 2) / Hm.U + Hm.x0, Hm.y1 - (a.z - ARENA.cz + Hm.D / 2) / Hm.U, a.y / Hm.U + Hm.zLow];
      const key = (c, k, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: c, key: k }));
      const t0 = performance.now(); let lo = Infinity, hi = -Infinity, jumps = 0, out = null; const start = H(__infra.lab.move.am), trace = [];
      key('KeyW', 'w', true); while (performance.now() - t0 < ms) { if (((performance.now() - t0) / 300 | 0) > jumps) { jumps++; key('Space', ' ', true); setTimeout(() => key('Space', ' ', false), 50); key('KeyW', 'w', true); }
        await sleep(20); if (!__infra.lab.move.am) continue; const h = H(__infra.lab.move.am); trace.push(h.map(v => Math.round(v))); lo = Math.min(lo, h[2]); hi = Math.max(hi, h[2]); if (!out && (h[2] > -530 || h[2] < low)) out = h.map(Math.round); }
      key('KeyW', 'w', false); const end = __infra.lab.move.am ? H(__infra.lab.move.am) : start; return { start: start.map(Math.round), end: end.map(Math.round), lo: Math.round(lo), hi: Math.round(hi), jumps, out, moved: Math.round(Math.hypot(end[0] - start[0], end[1] - start[1])), trace: trace.filter((_, i) => i % 10 === 0) }; }, { ms, low }); };
  // (the south part drops at its end onto the cover over B — whole: feet −640; the roof is at −526 everywhere)
  for (const [name, from, toward, ms, lo] of [['west part, east', [520, -1432], [800, -1432], 3000, -616], ['north part, east', [820, -1376], [1040, -1376], 3000, -616], ['north part, into its south wall', [814, -1384], [814, -1500], 2500, -616], ['north part, west', [1000, -1376], [790, -1376], 3000, -616], ['south part, south', [630, -1440], [630, -1530], 2000, -645]]) {
    const r = await run(name, from, toward, ms, lo); report['jump ' + name] = r;
    check('Vents: jumping along (' + name + ') stays inside (feet ' + lo + '…−530)', !r.out && r.jumps >= 5, JSON.stringify({ start: r.start, end: r.end, feet: [r.lo, r.hi], jumps: r.jumps, moved: r.moved, out: r.out }));
    if (name === 'north part, west') { await p.waitForTimeout(300); await snap('4-in-the-vents.jpg', 'In the vents after jumping (' + (r.out ? 'LEFT them' : 'stayed inside') + ')'); } }
  // ── B's glass ──
  for (const [name, eye, tgt, what] of SHOTS) { await view(eye, tgt, '5-' + name + '-before.jpg', what + ' (whole)'); pics.pop();
    const r = await shoot(eye, tgt); await p.waitForTimeout(1200); const st = await brokenOf(r.sent); await aim(eye, tgt); await p.waitForTimeout(300);
    await snap('5-' + name + '-after.jpg', what + (st.some(Boolean) ? ': shot, broken' : ': shot, NOT broken'));
    report['shot ' + name] = { ...r, broken: st }; check('B glass: a shot breaks the ' + what, r.sent.length > 0 && st.every(Boolean), JSON.stringify(r)); }
  report.errs = errs; check('No page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  // ── the labelled sheet ──
  const imgs = pics.map(([f, label]) => ({ label, src: 'data:image/jpeg;base64,' + readFileSync(path.join(out, f)).toString('base64') }));
  const q = await b.newPage({ viewport: { width: 400, height: 300 } });
  const jpg = await q.evaluate(async ({ imgs, title }) => { const W = 480, H = 300, cols = 4, rows = Math.ceil(imgs.length / cols), c = document.createElement('canvas'); c.width = cols * W; c.height = rows * (H + 26) + 40; const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.fillText(title, 12, 28);
    for (let i = 0; i < imgs.length; i++) { const im = new Image(); im.src = imgs[i].src; await im.decode(); const cx = (i % cols) * W, cy = 40 + ((i / cols) | 0) * (H + 26); x.drawImage(im, cx + 2, cy, W - 4, H); x.fillStyle = /NOT/.test(imgs[i].label) ? '#f66' : '#eee'; x.font = '15px sans-serif'; x.fillText(imgs[i].label, cx + 6, cy + H + 18); }
    return c.toDataURL('image/jpeg', .85).split(',')[1]; }, { imgs, title: 'Global Defensive v52 · Nuke: vent grille, jumping in the vents, B glass' });
  writeFileSync(path.join(out, 'sheet.jpg'), Buffer.from(jpg, 'base64'));
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log((fails ? 'FAIL' : 'PASS') + ': Nuke vent and B glass in the game · ' + report.checks.length + ' checks, ' + fails + ' failed · ' + path.join(out, 'sheet.jpg'));
} finally { await b.close(); server.kill(); }
process.exit(fails ? 1 : 0);
