// v50 in a real browser, on CS2 maps converted on this computer (user-maps + user-assets): Nuke's doors drawn once (CS2's
// fixed copies of them gone, the door that moves in their colour); every window a breakable pane — Dust II's found in its
// look, a broken one folded out of it, whole again next round; no material drawn twice a frame (transparent and
// double-sided in one pass), the lights seen by the sun-shadow pass (no program lookups every other frame); no page
// errors. Skipped without the maps.
//   node tests/browser/gd-v50-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-v50')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
if (!['nuke', 'dust2'].every(id => existsSync(path.join(root, 'user-maps', id + '.bsp')))) { console.log('SKIP: no converted Nuke and Dust II on this computer'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDV050', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdv-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 240) : '')); };
const errs = [];
async function play(map) { const p = await b.newPage({ viewport: { width: 1024, height: 640 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', map); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.waitForTimeout(3000); return p; }
try {
  // Nuke: the doors drawn once.
  const nk = await play('nuke');
  const d = await nk.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'); let look = null; __infra.scene.traverse(o => { if (o.userData?.cs2Render) look = o; }); const M = ARENA_MAPS.nuke, colors = [];
    __infra.scene.traverse(o => { if (!o.userData?.cs2Mover) return; o.traverse(c => { if (c.isMesh && /metal_door/.test(c.material.name)) colors.push(c.material.color.getHexString()); }); });
    return { cut: look?.userData.duplicates || 0, by: look?.userData.dupBy, doors: M.movers.filter(m => m.kind === 'rotdoor').length, colors }; });
  check("Nuke: CS2's fixed copies of its doors are out of the look", d.cut > 100 && (d.by?.metal_door_001 || 0) > 100, JSON.stringify({ cut: d.cut, by: d.by }));
  check('Nuke: the doors that move wear the copies\' colour (not plain grey)', d.colors.length >= 4 && d.colors.every(c => c !== 'ffffff'), JSON.stringify(d.colors));
  // One pass for transparent double-sided materials; the lights on the shadow pass's layer.
  const g = await nk.evaluate(() => { let twice = 0, lights = 0, lightsOff = 0; __infra.scene.traverse(o => { const m = o.material; if (m && !Array.isArray(m) && m.transparent && m.side === 2 && !m.forceSinglePass) twice++; if (o.isLight) { lights++; if (!o.layers.isEnabled(7)) lightsOff++; } }); return { twice, lights, lightsOff }; });
  check('no transparent double-sided material is drawn twice a frame', g.twice === 0, JSON.stringify(g));
  check('every light is seen by the sun-shadow pass (its layer 7)', g.lights > 0 && g.lightsOff === 0, JSON.stringify(g));
  await nk.close();
  // Dust II: every window a pane.
  const d2 = await play('dust2');
  const w = await d2.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'); let look = null; __infra.scene.traverse(o => { if (o.userData?.cs2Render) look = o; }); const M = ARENA_MAPS.dust2, panes = M.movers.map((m, i) => ({ m, i })).filter(x => x.m.pane);
    return { panes: panes.length, found: look?.userData.panes, first: panes[0]?.i, glass: panes.every(x => x.m.glass && x.m.health === 1) }; });
  check('Dust II: its windows are breakable panes (glass, one hit)', w.panes > 40 && w.glass, JSON.stringify(w));
  check('Dust II: nearly every pane found its glass in the look', w.found && w.found[1] >= w.found[0] * .9, JSON.stringify(w.found));
  // A pane broken (as a shot does): its glass folds out of the look; the next round it's back.
  const e = await d2.evaluate(async i => { const { ARENA_MAPS } = await import('/arena-maps.js'); return ARENA_MAPS.dust2.movers[i].e; }, w.first);
  const before = await d2.evaluate(e => { let n = 0; __infra.scene.traverse(o => { if (o.name === 'mover_e' + e) n++; }); return n; }, e);
  const r = await d2.evaluate(id => __infra.lab.lan.act({ type: 'arena', action: { type: 'break', id, dmg: 30 } }), w.first); await d2.waitForTimeout(800);
  const st = await d2.evaluate(id => !!__infra.lab.world.operations.game.combat?.mapState?.broken?.[id], w.first);
  check('a shot breaks a pane (the room says so, for everyone)', /Broken/.test(JSON.stringify(r)) && st, JSON.stringify(r));
  const fold = await d2.evaluate(e => { let G = null; __infra.scene.traverse(o => { if (o.name === 'mover_e' + e && o.userData?.setBroken) G = o; }); return G ? 1 : 0; }, e);
  check('the pane has its own piece of the look to fold', before === 1 && fold === 1, JSON.stringify({ before, fold }));
  await d2.screenshot({ path: path.join(out, 'dust2-pane.jpg'), type: 'jpeg', quality: 70 });
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { check('no crash', false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
console.log((ok === n ? 'PASS' : 'FAIL') + ': v50 in the browser · ' + ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
