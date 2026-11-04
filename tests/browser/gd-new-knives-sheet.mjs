// v53 KNIVES: the five new CS2 knives in first person as the game draws them — the Bayonet, Skeleton, Talon, Flip and
// Nomad, each in its own CS2 set (CS2's arms and clips): idle and inspect with no skin, CS2's second inspect (lookat02)
// where CS2 has one, and the inspect with three CS2 finishes (Fade, Doppler Phase 2, Crimson Web) next to CS2's own econ
// icon of that finish and CS2's equipment icon of the knife. Checks: each set held, each knife registered for third
// person, every finish drawn from its baked pictures (mode 3), the program count unchanged, no shader or page errors.
// Muted (--mute-audio). Skipped without the sets / finishes.
//   node tests/browser/gd-new-knives-sheet.mjs <repo-root> <out-dir> [map=mirage] [desktop=1]   (desktop=1: ~/Desktop/GD-v53-new-knives.jpg)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-new-knives-sheet'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('=')));
const man = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'skins', 'skins.json'), 'utf8')); } catch { return null; } })();
const ua = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'manifest.json'), 'utf8')); } catch { return null; } })();
const kf = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'icons', 'killfeed', 'killfeed.json'), 'utf8')); } catch { return null; } })();
if (!man?.knives || !ua?.models?.viewmodels?.cs2_bayonet) { console.log('SKIP: no new knife sets (tools/cs2-fp/export_missing.py) or CS2 finishes on this computer'); process.exit(0); }
const { STAR_KNIVES, NEW_KNIVES } = await import(path.resolve(root, 'dist/gd-knives.js'));
const FIN = [['aa_fade', 'Fade'], ['am_doppler_phase2', 'Doppler Phase 2'], ['hy_webs', 'Crimson Web']].filter(f => man.knives[f[0]]);
const servers = []; process.on('exit', () => { for (const s of servers) try { s.kill(); } catch {} });
async function serve(dir) { const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: dir, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDKNIV', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gss-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] }); servers.push(s);
  return new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); })); }
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 500) : '')); };
const base = await serve(root), p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }), errs = [], shaderErr = [];
p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); p.on('console', m => { const t = m.text(); if (/Shader Error|ERROR: 0:|VALIDATE_STATUS/i.test(t)) shaderErr.push(t.slice(0, 800)); });
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Viewer'); localStorage.setItem('infra-face-name', 'Viewer'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'practice'); await p.waitForTimeout(200); await p.selectOption('#ss-ar-map', opt.map || 'mirage').catch(() => p.selectOption('#ss-ar-map', 'dust2')); await p.selectOption('#ss-ar-bots', '0').catch(() => {}); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 }); await p.waitForTimeout(2500);
if (await p.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await p.keyboard.press('Escape');
await p.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); const st = document.createElement('style'); st.textContent = '#ar-buy,#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar,#crosshair,.crosshair,[id^="gd-"]:not(canvas){visibility:hidden!important}'; document.head.appendChild(st); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); });
await p.waitForTimeout(1500); const prog0 = await p.evaluate(() => __infra.renderer.info.programs.length);
// the view's gun: skin it (directly, as weapons.js does with the room's skin — reapplied while shown), wait for its pictures, frame it
const shoot = async (skin, action, ms) => {
  const st = await p.evaluate(async ({ skin }) => { const P = __infra.lab.pistol, S = await import('/skin-render.js'), mats = P.viewInfo.skinMats, tint = false;   // (as weapons.js ownTint: every knife plain CS2 steel with no skin on, the karambit too — §14.3)
    clearInterval(globalThis.__skInt); globalThis.__skInt = setInterval(() => S.applySkin(mats, skin, tint), 100); S.applySkin(mats, skin, tint);
    for (let i = 0; i < 80; i++) { const U = mats[0]?.userData?.skinU; if (!skin || !skin.finish.startsWith('cs2') || U?.uSkMode.value === 3 || i > 30) break; await new Promise(r => setTimeout(r, 150)); }
    const U = mats[0]?.userData?.skinU; return { set: P.viewInfo.set, mode: U?.uSkMode.value, on: U?.uSkinOn.value }; }, { skin });
  const start = () => p.evaluate(async a => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(P.current.id, P.viewInfo.set); f?.hold?.(P.current.id, { draw: false }); if (a === 'inspect') { await new Promise(r => setTimeout(r, 250)); f?.inspect?.(); } }, action);   // (back to idle first: an inspect still playing would not restart)
  // (the inspect moment, once per set: the one where the finish spans the most screen — the blade turned to the camera, not edge-on in the fist; §14.2)
  const key = st.set + '|' + action; if (action === 'inspect' && bestT[key] == null) { await start(); let best = 0, t0 = 0; bestT[key] = ms; for (const t of [600, 1000, 1500, 2000, 2500, 3000, 3600]) { await p.waitForTimeout(t - t0); t0 = t; const q = await frame(); if (q.w * q.h > best) { best = q.w * q.h; bestT[key] = t; } } }
  await start(); await p.waitForTimeout(action === 'inspect' ? bestT[key] : ms); const r = await frame();
  if (action !== 'inspect') return { ...st, img: 'data:image/jpeg;base64,' + (await p.screenshot({ type: 'jpeg', quality: 90 })).toString('base64') };   // (a gun: the whole view — it runs off the screen's edge)
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = Math.max(r.w, r.h * 1.43, 160) * 1.0, clip = { x: Math.max(0, Math.min(1280 - s, cx - s / 2)), y: Math.max(0, Math.min(720 - s / 1.43, cy - s / 2.86)), width: Math.min(1280, s), height: Math.min(720, s / 1.43) };
  return { ...st, t: action === 'inspect' ? bestT[key] : ms, img: 'data:image/jpeg;base64,' + (await p.screenshot({ type: 'jpeg', quality: 90, clip })).toString('base64') };
};
const bestT = {};
const frame = () => p.evaluate(async () => { const T = await import('/three.module.js'), P = __infra.lab.pistol, cam = __infra.camera, box = new T.Box3(); for (const m of P.viewInfo.skinMats) { __infra.scene.traverse(o => { if (o.isMesh && o.visible && [].concat(o.material).includes(m)) box.union(new T.Box3().setFromObject(o, true)); }); }
    let x0 = 1, y0 = 1, x1 = -1, y1 = -1; const v = new T.Vector3(); for (let i = 0; i < 8; i++) { v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const W = innerWidth, H = innerHeight; return { x: (x0 + 1) / 2 * W, y: (1 - y1) / 2 * H, w: (x1 - x0) / 2 * W, h: (y1 - y0) / 2 * H }; });
const act = a => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).then(r => String(r), e => 'ERR ' + e.message), a);
const holdKnife = knife => p.evaluate(async want => { const P = __infra.lab.pistol; for (let i = 0; i < 50; i++) { if (P.current?.kind !== 'knife' || i % 6 === 5) P.equip(i % 2 ? 'karambit' : 'knife'); if (P.current?.kind === 'knife' && P.viewInfo.authored && P.viewInfo.set === want) return true; await new Promise(r => setTimeout(r, 300)); } return false; }, knife);
const fileURL = f => { try { return 'data:image/jpeg;base64,' + readFileSync(f).toString('base64'); } catch { return null; } };
const iconURL = rel => rel ? base + '/user-assets/skins/' + rel : null;
const cells = {}, modes = [], held = {};
const inspect2 = async on => p.evaluate(o => { globalThis.__rnd ??= Math.random; Math.random = o ? () => .95 : () => .1; }, on);   // (CS2 picks lookat02 one time in three: forced here for its column)
for (const knife of NEW_KNIVES) {
  console.log(knife, await act({ type: 'knife', knife })); held[knife] = await holdKnife(knife); check(knife + ': its own CS2 first-person set held (CS2 arms, its clips)', held[knife]);
  await inspect2(false); const idle = await shoot(null, 'idle', 900), ins = await shoot(null, 'inspect', 1500);
  let ins2 = null; if (STAR_KNIVES[knife].inspects === 2) { await inspect2(true); delete bestT[ins.set + '|inspect']; ins2 = await shoot(null, 'inspect', 1500); delete bestT[ins.set + '|inspect']; await inspect2(false); }
  cells[knife] = { idle, ins, ins2, fins: [] };
  for (const [fam, label] of FIN) { const c = await shoot({ finish: 'cs2k:' + fam, fb: man.knives[fam].fbId, wear: .02, seed: 400, stickers: [] }, 'inspect', 1500); modes.push([knife, fam, !!man.knives[fam].models[knife], c.mode]);
    cells[knife].fins.push({ label, now: c.img, t: c.t, icon: iconURL(man.knives[fam].icon?.[knife]) }); } }
const tpOk = await p.evaluate(async ids => { const W = await import('/weapon-models.js'); return ids.filter(k => W.hasReal(k)); }, NEW_KNIVES);
check('every new knife registered for third person (other players, spectators, the death cam)', tpOk.length === NEW_KNIVES.length, tpOk.join(','));
const prog1 = await p.evaluate(() => __infra.renderer.info.programs.length);
check('every finish drawn from its baked CS2 pictures (mode 3)', modes.every(m => m[2] && m[3] === 3), modes.filter(m => m[3] !== 3).map(m => m.join(':')).join(' '));
check('the program count the same after every knife and skin (nothing built in play)', prog1 === prog0, `${prog0} → ${prog1}`);
check('no shader errors, no page errors', !shaderErr.length && !errs.length, [...shaderErr, ...errs].slice(0, 3).join(' | '));
// sheets, drawn in the page
async function sheet(title, rows, cols, file) {
  const data = await p.evaluate(async ({ title, rows, cols }) => {
    const cw = 330, ch = 231, pad = 6, lab = 20, left = 150, head = 74, W = left + cols.length * (cw + pad) + pad, H = head + rows.length * (ch + lab + pad) + pad, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#14181c'; g.fillRect(0, 0, W, H); g.fillStyle = '#f0b232'; g.font = 'bold 26px system-ui'; g.fillText(title, pad + 4, 32); g.fillStyle = '#9fb3c3'; g.font = 'bold 16px system-ui'; cols.forEach((c, i) => g.fillText(c, left + pad + i * (cw + pad) + 4, 62));
    const img = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
    for (let r = 0; r < rows.length; r++) { const y = head + r * (ch + lab + pad); g.fillStyle = '#e8eef2'; g.font = 'bold 15px system-ui'; const words = rows[r].label.split(' · '); words.forEach((w, k) => g.fillText(w, pad + 4, y + 30 + k * 20));
      for (let c = 0; c < rows[r].cells.length; c++) { const x = left + pad + c * (cw + pad), cell = rows[r].cells[c]; g.fillStyle = '#1e252b'; g.fillRect(x, y, cw, ch); const im = await img(cell?.src);
        if (im) { const k = cell.fit === 'contain' ? Math.min(cw / im.width, ch / im.height) : Math.max(cw / im.width, ch / im.height), w = im.width * k, h = im.height * k; g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); if (cell.fit === 'contain') { g.fillStyle = '#d9dde1'; g.fillRect(x, y, cw, ch); } g.drawImage(im, x + (cw - w) / 2, y + (ch - h) / 2, w, h); g.restore(); }
        else { g.fillStyle = '#56646f'; g.font = '14px system-ui'; g.fillText(cell?.empty || '—', x + 10, y + ch / 2); }
        g.fillStyle = cell?.warn ? '#ffb070' : '#9fb3c3'; g.font = '13px system-ui'; g.fillText(cell?.cap || '', x + 2, y + ch + 15); } }
    return cv.toDataURL('image/jpeg', .9).split(',')[1]; }, { title, rows, cols });
  const f = path.join(out, file); writeFileSync(f, Buffer.from(data, 'base64')); if (opt.desktop) copyFileSync(f, path.join(os.homedir(), 'Desktop', file)); console.log('sheet', f);
}
const eqIcon = k => kf?.weapons?.['knife:' + k] ? base + '/user-assets/icons/killfeed/' + kf.weapons['knife:' + k] + '.svg' : null;
const cols = ['CS2 icon (equipment)', 'idle · no skin', 'inspect · no skin', 'inspect 2 (lookat02)', ...FIN.flatMap(([, l]) => [l + ' · in game', l + ' · CS2 icon'])];
const rows = NEW_KNIVES.map(k => { const c = cells[k]; return { label: '★ ' + STAR_KNIVES[k].name + ' · ' + k, cells: [{ src: eqIcon(k), fit: 'contain', cap: 'panorama/…/equipment/' + STAR_KNIVES[k].icon, empty: 'no icon' }, { src: c.idle.img, cap: 'idle, CS2 steel' }, { src: c.ins.img, cap: `lookat01, ${((c.ins.t || 0) / 1000).toFixed(1)} s` },
  c.ins2 ? { src: c.ins2.img, cap: `lookat02, ${((c.ins2.t || 0) / 1000).toFixed(1)} s (CS2: 1 in 3)` } : { empty: 'CS2 has one inspect', cap: '' }, ...c.fins.flatMap(f => [{ src: f.now, cap: `inspect ${((f.t || 0) / 1000).toFixed(1)} s, Factory New` }, { src: f.icon, fit: 'contain', cap: 'CS2 econ icon (local install)', empty: 'no icon' }])] }; });
await sheet(`GD v53 new knives in first person: idle, inspects, three CS2 finishes vs CS2's icons · ${opt.map || 'mirage'} · Retina, High · muted`, rows, cols, 'GD-v53-new-knives.jpg');
console.log(`${ok === n ? 'PASS' : 'FAIL'}: new knives sheet · ${ok}/${n}`); await b.close(); process.exit(ok === n ? 0 : 1);
