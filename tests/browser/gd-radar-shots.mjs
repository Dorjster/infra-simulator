// Global Defensive radar pictures (before / after, not a pass / fail test): the radar on Dust II, Mirage, Inferno and
// Nuke (upper at A, lower at B), the same spot and facing on every build; with v52's options (package Q) also each option
// variant, the Tab big map, CS2's picture with the map's own spawns and bomb sites marked where the radar puts them, and
// the Settings radar section. At 1440×900, display scaling 2 (a MacBook). `root=<path>` runs another checkout's game (a
// baseline) with this script; `label=` prefixes the files.
//   node tests/browser/gd-radar-shots.mjs <repo-root> <out-dir> [root=<other checkout>] [label=<prefix>]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(4).map(a => a.split('=')));
const [repo, out] = process.argv.slice(2), root = args.root || repo, label = args.label || 'now'; mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'RSHOT1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'rs-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Rada'); localStorage.setItem('infra-face-name', 'Rada'); localStorage.setItem('infra-face', 'smile'); localStorage.removeItem('gd-radar-mode'); localStorage.removeItem('gd-radar'); });
const clip = async (name, pad = 10) => { const r = await p.evaluate(() => { const e = document.getElementById('gd-radar'); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  if (!r) { console.log('(no radar for ' + name + ')'); return; } await p.screenshot({ path: path.join(out, `${label}-${name}.png`), clip: { x: Math.max(0, r[0] - pad), y: Math.max(0, r[1] - pad), width: r[2] + 2 * pad, height: r[3] + 2 * pad + 4 } }); console.log('shot', label + '-' + name); };
const frames = (n = 3) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(500);
await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '4'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.round, null, { timeout: 60000 });
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(1500);
// Stand at a spot of the map (its T spawn, or a bomb site), facing +x then a little turned, for the same picture on every build.
const stand = (where, turn = .6) => p.evaluate(async ([where, turn]) => { const { ARENA } = await import('./facility-layout.js'), { ARENA_MAPS } = await import('./arena-maps.js'), G = __infra.lab.world.operations.game, M = ARENA_MAPS[G.arena.map];
  const s = where === 'T' ? M.t[0] : where === 'CT' ? M.ct[0] : (M.siteGoals?.[where] || M.sites[where]), x = s[0], z = s[1], f = where.length === 1 && M.siteGoals?.[where]?.[2] !== undefined ? M.siteGoals[where][2] : (M.nav?.floorAt?.(x, z) ?? s[2] ?? 0);
  __infra.lab.look(ARENA.cx + x, ARENA.cz + z, ARENA.cx + x + 10 * Math.cos(turn), f + 9.7, ARENA.cz + z + 10 * Math.sin(turn), f + 9.7); await new Promise(r => setTimeout(r, 700)); return { map: G.arena.map, where, art: __infra.lab.radar.art || 'v51', label: __infra.lab.radar.label }; }, [where, turn]);
const toMap = async id => { if (await p.evaluate(id => __infra.lab.world.operations.game.arena.map === id, id)) return; await p.evaluate(id => __infra.lab.lan.send({ type: 'arena', action: { type: 'change-map', map: id } }), id);
  await p.waitForFunction(id => __infra.lab.arenaScene?.map === id && __infra.lab.world.operations.game.arena.map === id && !__infra.lab.world.operations.game.arena.loading, id, { timeout: 90000 }); await p.waitForTimeout(2500); await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(600); };
const v52 = await p.evaluate(async () => { try { await import('./gd-radar-prefs.js'); return true; } catch { return false; } });
for (const [id, spots] of [['dust2', ['T']], ['mirage', ['T']], ['inferno', ['T']], ['nuke', ['A', 'B']]]) { await toMap(id);
  for (const s of spots) { console.log(JSON.stringify(await stand(s))); await clip(`${id}-${s}`); }
  if (v52) { // CS2's picture, whole map, with the map's own spawns (T orange, CT blue) and bomb sites (white rings) marked where the radar projects them
    for (const layer of id === 'nuke' ? ['A', 'B'] : ['T']) { await stand(layer); await p.evaluate(() => __infra.lab.radar.expand(true)); await frames(4);
      await p.evaluate(async () => { const { ARENA } = await import('./facility-layout.js'), { ARENA_MAPS } = await import('./arena-maps.js'), M = ARENA_MAPS[__infra.lab.world.operations.game.arena.map], R = __infra.lab.radar, el = document.getElementById('gd-radar');
        const mark = (x, z, css) => { const [u, v] = R.project(ARENA.cx + x, ARENA.cz + z), d = document.createElement('i'); d.className = 'qmark'; d.style.cssText = `position:absolute;left:${u - 4}px;top:${v - 4}px;width:8px;height:8px;border-radius:50%;z-index:9;${css}`; el.append(d); };
        for (const s of M.t || []) mark(s[0], s[1], 'background:#ff9d2e;border:1px solid #000'); for (const s of M.ct || []) mark(s[0], s[1], 'background:#4ba3f2;border:1px solid #000');
        for (const s of Object.values(M.sites || {})) mark(s[0], s[1], 'width:16px;height:16px;margin:-4px 0 0 -4px;border:2px solid #fff;box-shadow:0 0 0 1px #000'); });
      await frames(2); await clip(`${id}-align-${layer}`, 4); await p.evaluate(() => { document.querySelectorAll('#gd-radar .qmark').forEach(e => e.remove()); __infra.lab.radar.expand(false); }); await frames(2); } } }
if (v52) { await toMap('dust2'); await stand('T');
  const prefs = async (o, name) => { await p.evaluate(async o => { const P = await import('./gd-radar-prefs.js'); P.saveRadarPrefs({ ...P.RADAR_DEFAULT, ...o }); }, o); await frames(4); await p.waitForTimeout(250); await clip(name); };
  await prefs({}, 'opt-default'); await prefs({ rotate: false }, 'opt-northup'); await prefs({ zoom: .35 }, 'opt-zoom035'); await prefs({ zoom: 1 }, 'opt-zoom100'); await prefs({ size: 1.3 }, 'opt-size130');
  await stand('B'); await prefs({ centered: false, rotate: false }, 'opt-bestfit'); await prefs({ rotate: false }, 'opt-bestfit-off'); await prefs({}, 'opt-reset');
  await stand('T'); await p.keyboard.down('Tab'); await frames(4); await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, `${label}-tab.png`) }); await p.keyboard.up('Tab'); console.log('shot', label + '-tab');
  await p.evaluate(() => __infra.lab.campaignUI.panel('settings')); await p.waitForTimeout(600);
  const r = await p.evaluate(() => { const e = document.querySelector('#campaign-panel .rd-edit'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const h = e.previousElementSibling?.getBoundingClientRect(), b = e.getBoundingClientRect(); return [b.left, (h?.top ?? b.top), b.width, b.bottom - (h?.top ?? b.top) + 50]; });
  if (r) { await p.waitForTimeout(300); const r2 = await p.evaluate(() => { const e = document.querySelector('#campaign-panel .rd-edit'), h = e.previousElementSibling?.getBoundingClientRect(), b = e.getBoundingClientRect(); return [b.left - 8, (h?.top ?? b.top) - 8, b.width + 16, b.bottom - (h?.top ?? b.top) + 60]; }); await p.screenshot({ path: path.join(out, `${label}-settings.png`), clip: { x: Math.max(0, r2[0]), y: Math.max(0, r2[1]), width: r2[2], height: Math.min(600, r2[3]) } }); console.log('shot', label + '-settings'); } }
else { await toMap('dust2'); await stand('T'); await p.keyboard.down('Tab'); await frames(4); await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, `${label}-tab.png`) }); await p.keyboard.up('Tab'); console.log('shot', label + '-tab'); }
console.log(errs.length ? 'page errors: ' + errs.slice(0, 3).join(' | ') : 'no page errors'); await b.close(); server.kill(); process.exit(0);
