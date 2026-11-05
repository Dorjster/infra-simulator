// Global Defensive · the host's "Reserve ammo: Magazines | Bullets" on the HUD (v53 RESERVE, spec addendum 13), in the
// real game, muted: Defuse on Dust II with no bots, the pistol in hand.
//  · Bullets (the default, the user's cs2-hud.png): "20 | 120", the number shown, no magazine icons;
//  · the host picks Magazines during the round: nothing changes until the next round (the host's menu says so);
//  · the next round (the host restarts it): CS2's magazine-icons mode (hudhealthammocenter.vcss .show-mags
//    #HudReserveMagsContainer; .reserve-ammo-as-icons hides the number): 20 and three Glock magazine icons;
//  · fired down and R: a whole magazine comes in, the rest of the old one goes — 20 and two icons, the host 20 / 40.
// Picture: the bottom-centre HUD in Bullets, in Magazines, and after a Magazines reload → <out>/reserve-modes.jpg
// (--pic <jpg>).
//   node tests/browser/gd-reserve-modes.mjs <repo-root> <out-dir> [--pic <jpg>]
import { chromium } from 'playwright-core'; import { spawn, execFileSync } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const PIC = opt('--pic'); const [root = '.', out = path.join(os.tmpdir(), 'gd-reserve-modes')] = argv; mkdirSync(out, { recursive: true });
let failed = 0; const lines = []; const check = (name, c, d = '') => { if (!c) failed++; const l = (c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 400)); lines.push(l); console.log(l); };
const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDRESV', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdrv-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { s.kill(); } catch {} }); let err = ''; s.stderr.on('data', d => { err += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + err.slice(-300))), 120000); s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const CLIP = { x: 560, y: 960, width: 800, height: 120 };
// (a caption drawn on the page over the picture's corner: this ffmpeg has no drawtext)
const shot = async (p, file, text) => { await p.evaluate(t => { let e = document.getElementById('rv-cap'); if (!e) { e = document.createElement('div'); e.id = 'rv-cap'; e.style.cssText = 'position:fixed;left:568px;top:964px;z-index:99999;font:600 18px Arial,sans-serif;color:#fff;background:#000a;padding:3px 8px;border-radius:3px'; document.body.append(e); } e.textContent = t; }, text); await p.screenshot({ path: file, clip: CLIP }); await p.evaluate(() => document.getElementById('rv-cap')?.remove()); };
try {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', showControls: false })); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '0');
  await p.evaluate(() => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', '2'], ['ss-ar-diff', 'easy']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } }); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.tester, null, { timeout: 240000 });
  const close = () => p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  await close();
  // a Terrorist: the Glock-18 of the user's picture
  if (await p.evaluate(() => __infra.lab.world.operations.game.combat.d.teams.tester) !== 't') { await p.evaluate(async () => { await __infra.lab.lan.act({ type: 'arena', action: { type: 'team', team: 't' } }); await __infra.lab.lan.act({ type: 'arena', action: { type: 'restart-round' } }); }); await p.waitForTimeout(1500); await close(); }
  const live = () => p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'live', null, { timeout: 60000, polling: 200 });
  await live(); await p.keyboard.press('Digit2'); await p.waitForFunction(() => __infra.lab.pistol.current?.id === 'pistol', null, { timeout: 8000 }); await p.waitForTimeout(1500);
  const hud = () => p.evaluate(() => { const R = document.querySelector('#gd-wp .reserve'), num = R.querySelector('b'), icons = [...R.querySelectorAll('.mg .bul')];
    return { mag: document.querySelector('#gd-wp .ammo .num').textContent, res: num.textContent, numShown: getComputedStyle(num).display !== 'none', icons: icons.filter(i => getComputedStyle(i).display !== 'none' && getComputedStyle(i.parentElement).display !== 'none').length, mode: __infra.lab.world.operations.game.arena.reserveMode, next: __infra.lab.world.operations.game.arena.reserveModeNext ?? null,
      // (v53 RESERVE final: the row's layout — the '|' kept and every icon inside the row, which grows rightwards as CS2's #HudReserveMagsContainer{width: fit-children}, short of the grenade row)
      sepW: R.querySelector('.sep').getBoundingClientRect().width, lastR: Math.max(0, ...icons.filter(i => getComputedStyle(i).display !== 'none' && getComputedStyle(i.parentElement).display !== 'none').map(i => i.getBoundingClientRect().right)), boxR: R.getBoundingClientRect().right, nadesL: (r => r && r.width ? r.left : 1e9)(document.querySelector('#gd-hud .nades')?.getBoundingClientRect()) }; });
  const rowOk = h => h.sepW > 0 && h.lastR <= h.boxR + .5 && h.boxR < h.nadesL;
  const hostAmmo = id => p.evaluate(id => __infra.lab.world.operations.game.combat.ammo?.tester?.[id] || null, id);
  let h = await hud();
  check('Bullets (the default): the Glock-18 "20 | 120", the number shown, no magazine icons', h.mode === 'bullets' && h.mag === '20' && h.res === '120' && h.numShown && h.icons === 0, JSON.stringify(h));
  await shot(p, path.join(out, 'a-bullets.png'), 'Reserve ammo: Bullets (default) — 20 | 120');
  const msg = await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'settings', reserve: 'mags' } }).then(r => r?.message || r?.error || String(r))); await p.waitForTimeout(600); h = await hud();
  check('the host picks Magazines mid-round: "from the next round", the HUD unchanged until then', /next round/.test(msg) && h.mode === 'bullets' && h.next === 'mags' && h.res === '120' && h.numShown && h.icons === 0, JSON.stringify([msg, h]));
  await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'restart-round' } })); await p.waitForTimeout(1200); await close(); await live();
  await p.keyboard.press('Digit2'); await p.waitForFunction(() => __infra.lab.pistol.current?.id === 'pistol', null, { timeout: 8000 }); await p.waitForTimeout(1500); h = await hud();
  check('the next round in Magazines: 20 and three magazine icons (CS2\'s .show-mags), no number (.reserve-ammo-as-icons)', h.mode === 'mags' && h.mag === '20' && !h.numShown && h.icons === 3, JSON.stringify(h));
  check('…the "|" is kept and the three icons stay inside the row (it used to squeeze the "|" to 0 px)', rowOk(h), JSON.stringify(h));
  check('…the host holds 20 / 60 (3 magazines, weapons.vdata)', JSON.stringify(await hostAmmo('pistol')) === '[20,60]', JSON.stringify(await hostAmmo('pistol')));
  await shot(p, path.join(out, 'b-mags.png'), 'Reserve ammo: Magazines — 20 and 3 magazines');
  for (let i = 0; i < 6; i++) { await p.evaluate(() => { __infra.lab.pistol.button(0, true); __infra.lab.pistol.button(0, false); }); await p.waitForTimeout(260); }
  await p.waitForTimeout(500); await p.evaluate(() => __infra.lab.pistol.reload()); await p.waitForTimeout(3200); h = await hud();
  check('fired 6 and R in Magazines: a whole magazine in (20), the 14 left go with the old one — two icons', h.mag === '20' && !h.numShown && h.icons === 2, JSON.stringify(h));
  check('…the host agrees: 20 / 40', JSON.stringify(await hostAmmo('pistol')) === '[20,40]', JSON.stringify(await hostAmmo('pistol')));
  await shot(p, path.join(out, 'c-mags-reload.png'), 'Magazines, reloaded at 14 — 20 and 2 magazines');
  // the layout with 4 magazines (the M4A4 / FAMAS / Galil AR / P2000's full reserve) and with all 8 icons: the page's own count only, put back after
  for (const nM of [4, 8]) { await p.evaluate(n => { const g = __infra.lab.world.operations.game; g.combat.ammo.tester.pistol = [20, 20 * n]; __infra.lab.pistol.setAmmo('pistol', [20, 20 * n]); }, nM); await p.waitForTimeout(100); const q = await hud();   // (this page's copy too: it follows the host's count)
    check(`…${nM} magazine icons: the "|" kept, all inside the row, short of the grenades`, q.icons === nM && rowOk(q), JSON.stringify(q)); }
  await p.evaluate(() => { __infra.lab.world.operations.game.combat.ammo.tester.pistol = [20, 40]; __infra.lab.pistol.setAmmo('pistol', [20, 40]); }); await p.waitForTimeout(150);
  check('no page errors', !errs.length, errs.slice(0, 4).join(' | '));
  const dst = PIC || path.join(out, 'reserve-modes.jpg');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(out, 'a-bullets.png'), '-i', path.join(out, 'b-mags.png'), '-i', path.join(out, 'c-mags-reload.png'), '-filter_complex', '[0:v][1:v][2:v]vstack=inputs=3', '-q:v', '3', dst]); console.log('picture', dst);
} finally { await b.close(); try { s.kill(); } catch {} }
writeFileSync(path.join(out, 'result.txt'), lines.join('\n') + '\n'); console.log(failed ? `FAIL: gd-reserve-modes · ${failed} failed` : 'PASS: gd-reserve-modes'); process.exit(failed ? 1 : 0);
