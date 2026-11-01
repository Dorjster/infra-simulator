// Weapon skins as the game draws them (package S, rendering): first-person knife inspects with CS2 finishes imported on
// this computer (user-assets/skins), next to the released v51 look of the nearest built-in finish and CS2's own econ
// icon of that finish (default_generated, from the install); then guns in first person at Factory New and
// Battle-Scarred next to their icons. Checks: every CS2 cell drawn from its baked pictures (mode 3) or its built-in
// stand-in where the knife has no bake, no shader error, the program count the same before and after every skin, no
// page errors. Skipped without the CS2 finishes / first-person sets on this computer.
//   node tests/browser/gd-weapon-skins-sheet.mjs <repo-root> <out-dir> [before=<dir of v51 frames <knife>_<finish>_best.jpg>] [map=mirage] [only=knives|guns] [desktop=1]
// desktop=1 writes ~/Desktop/GD-v52-knife-skins-vs-CS2-1.jpg (karambit, butterfly), -2.jpg (M9, stiletto) and GD-v52-gun-skins-vs-CS2.jpg.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-weapon-skins-sheet'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('=')));
const man = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'skins', 'skins.json'), 'utf8')); } catch { return null; } })();
const ua = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'manifest.json'), 'utf8')); } catch { return null; } })();
if (!man?.knives || !ua?.models?.viewmodels?.cs2_karambit) { console.log('SKIP: no imported CS2 finishes (tools/import-cs2-skins.mjs) or first-person sets on this computer'); process.exit(0); }
// [CS2 family, label, the v51 built-in finish nearest to it (its before frame), the built-in stand-in]
const FIN = [['none', 'no skin', 'none', 'none'], ['am_ruby_marbleized', 'Doppler Ruby', 'doppler', 'doppler'], ['am_doppler_phase2', 'Doppler P2', 'doppler', 'doppler'], ['aa_fade', 'Fade', 'fade', 'fade'], ['am_marble_fade', 'Marble Fade', 'marble', 'marble'],
  ['an_tiger_orange', 'Tiger Tooth', 'tiger', 'tiger'], ['aq_oiled', 'Case Hardened', 'casehardened', 'casehardened'], ['hy_webs', 'Crimson Web', 'web', 'web'], ['am_zebra', 'Slaughter', null, 'web'], ['cu_lore', 'Lore', null, 'gold'],
  ['gs_autotronic', 'Autotronic', null, 'asiimov'], ['aq_damascus', 'Damascus Steel', null, 'none'], ['aq_blued', 'Blue Steel', null, 'none'], ['so_night', 'Night', null, 'none']].filter(f => f[0] === 'none' || man.knives[f[0]]);
const KNIVES = ['karambit', 'butterfly', 'm9', 'stiletto'];
const GUNS = ['ak', 'sniper', 'm4s', 'usps', 'deagle', 'pistol'].filter(g => man.weapons?.[g]);
const servers = []; process.on('exit', () => { for (const s of servers) try { s.kill(); } catch {} });
async function serve(dir) { const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: dir, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDSKSH', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gss-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] }); servers.push(s);
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
const cells = {}, modes = [];
if (opt.only !== 'guns') for (const knife of KNIVES) {
  console.log(knife, await act({ type: 'knife', knife })); const held = await holdKnife(knife); check(knife + ': its CS2 first-person set held', held);
  for (const [fam, label, old, fb] of FIN) { const has = fam === 'none' || !!man.knives[fam].models[knife];
    const c = await shoot(fam === 'none' ? null : { finish: 'cs2k:' + fam, fb, wear: .02, seed: 400, stickers: [] }, 'inspect', 1500);
    modes.push([knife, fam, has, c.mode]); cells[knife + '|' + fam] = { now: c.img, before: old && opt.before ? fileURL(path.join(opt.before, `${knife}_${old}_best.jpg`)) : null, icon: iconURL(fam === 'none' ? null : man.knives[fam].icon?.[knife]), t: c.t, note: fam !== 'none' && !has ? 'no CS2 bake: built-in ' + fb : '' }; } }
if (opt.only !== 'knives') for (const g of GUNS) {
  const kind = g === 'usps' || g === 'deagle' || g === 'pistol' ? 'secondary' : 'primary'; await act({ type: 'loadout', [kind]: g });
  await p.evaluate(async id => { const P = __infra.lab.pistol; P.equip(null); await new Promise(r => setTimeout(r, 100)); for (let i = 0; i < 50 && !(P.current?.id === id && P.viewInfo.authored); i++) { P.equip(id); await new Promise(r => setTimeout(r, 200)); } }, g);
  for (const kit of Object.keys(man.weapons[g].finishes).slice(0, 2)) { const f = man.weapons[g].finishes[kit];
    for (const wear of [Math.max(f.wear?.[0] ?? 0, .02), Math.min(f.wear?.[1] ?? 1, .8)]) { const c = await shoot({ finish: 'cs2:' + kit, fb: f.fbId, wear, seed: 1, stickers: [] }, 'inspect', 1500); modes.push([g, kit, true, c.mode]);   // (inspect: the gun fills the frame — wear and pattern placement can be judged; §14.2)
      cells[g + '|' + kit + '|' + wear] = { now: c.img, icon: iconURL(f.icon), label: `${g} · ${f.name} · ${wear < .07 ? 'Factory New' : wear < .15 ? 'Minimal Wear' : wear < .38 ? 'Field-Tested' : wear < .45 ? 'Well-Worn' : 'Battle-Scarred'} ${wear}` }; } } }
const prog1 = await p.evaluate(() => __infra.renderer.info.programs.length);
const wrong = modes.filter(([, , has, m]) => has ? m !== 3 && m !== 0 : m !== 2 && m !== 0);
check('every CS2 cell drawn from its baked pictures (mode 3), or its built-in stand-in (mode 2) where the knife has no bake', !wrong.length && modes.filter(m => m[1] !== 'none' && m[2]).every(m => m[3] === 3), wrong.slice(0, 6).map(w => w.join(':')).join(' '));
check('the program count the same after every skin (no shader built for a skin)', prog1 === prog0, `${prog0} → ${prog1}`);
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
if (opt.only !== 'guns') for (const [i, pair] of [[1, ['karambit', 'butterfly']], [2, ['m9', 'stiletto']]]) {
  const cols = pair.flatMap(k => [`${k} · v51 (built-in)`, `${k} · now`, `${k} · CS2 icon`]);
  const rows = FIN.map(([fam, label]) => ({ label: label + (fam !== 'none' ? ' · ' + fam : ''), cells: pair.flatMap(k => { const c = cells[k + '|' + fam] || {}; return [{ src: c.before, empty: c.before === null && fam !== 'none' && !FIN.find(f => f[0] === fam)[2] ? 'not a v51 finish' : '—', cap: 'v51' }, { src: c.now, cap: c.note || `in game, inspect ${((c.t || 1500) / 1000).toFixed(1)} s, FN`, warn: !!c.note }, { src: c.icon, fit: 'contain', cap: c.icon ? 'CS2 econ icon (local install)' : 'no icon', empty: 'no icon' }]; }) }));
  await sheet(`GD v52 knife skins: in game vs CS2 icon (${pair.join(', ')}) · ${opt.map || 'mirage'} · Retina, High`, rows, cols, `GD-v52-knife-skins-vs-CS2-${i}.jpg`); }
if (opt.only !== 'knives') { const keys = Object.keys(cells).filter(k => k.split('|').length === 3), rows = [];
  for (let i = 0; i < keys.length; i += 2) { const a = cells[keys[i]], c = cells[keys[i + 1]]; rows.push({ label: a.label.replace(/ · (FN|BS).*/, ''), cells: [{ src: a.now, cap: a.label.split(' · ').pop() }, { src: c?.now, cap: c?.label.split(' · ').pop() }, { src: a.icon, fit: 'contain', cap: 'CS2 econ icon (light)' }] }); }
  await sheet('GD v52 gun skins in first person: the kit\'s least and most wear, CS2 icon', rows, ['least worn (in game)', 'most worn (in game)', 'CS2 icon'], 'GD-v52-gun-skins-vs-CS2.jpg'); }
console.log(`${ok === n ? 'PASS' : 'FAIL'}: weapon skins sheet · ${ok}/${n}`); await b.close(); process.exit(ok === n ? 0 : 1);
