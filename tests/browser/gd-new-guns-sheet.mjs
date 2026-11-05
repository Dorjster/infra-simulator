// v53 GUNS8: CS2's eight added guns in first person as the game draws them — the Zeus x27, P2000, Dual Berettas, R8
// Revolver, MAG-7, Sawed-Off, SCAR-20 and G3SG1, each in its own CS2 set (CS2's arms and clips, tools/cs2-fp/
// export_missing.py): idle, a shot (the Dual Berettas' right barrel), the gun's own second clip (the Dual Berettas' left
// barrel, the R8's hammer drawn back and its fan, a shotgun's reload, the autosnipers' reload), the inspect; next to
// CS2's kill-feed icon; and the buy menu with them in it (practice: every gun), then in a Defuse match CS2's loadout
// (a chosen loadout per side: the CT's menu with a slot's ⇄ choices open, the T's). Checks: each set held, each gun
// registered for third person, the loadout columns (5 / 5 / 5, the badges, the choices), the host refusing a gun outside
// the loadout, the program count unchanged, no shader or page errors. Muted (--mute-audio). Skipped without the sets.
//   node tests/browser/gd-new-guns-sheet.mjs <repo-root> <out-dir> [map=mirage] [desktop=1]   (desktop=1: ~/Desktop/GD-v53-new-guns.jpg)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-new-guns-sheet'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('=')));
const ua = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'manifest.json'), 'utf8')); } catch { return null; } })();
const kf = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'icons', 'killfeed', 'killfeed.json'), 'utf8')); } catch { return null; } })();
if (!ua?.models?.viewmodels?.cs2_p2000) { console.log('SKIP: no CS2 sets for the new guns (tools/cs2-fp/export_missing.py --install) on this computer'); process.exit(0); }
const GUNS = [['zeus', 'Zeus x27'], ['p2000', 'P2000'], ['elite', 'Dual Berettas'], ['revolver', 'R8 Revolver'], ['mag7', 'MAG-7'], ['sawedoff', 'Sawed-Off'], ['scar20', 'SCAR-20'], ['g3sg1', 'G3SG1']];
const PISTOL = new Set(['p2000', 'elite', 'revolver']);
const servers = []; process.on('exit', () => { for (const s of servers) try { s.kill(); } catch {} });
async function serve(dir) { const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: dir, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDGUN8', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gss-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] }); servers.push(s);
  return new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); })); }
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 500) : '')); };
const base = await serve(root), p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }), errs = [], shaderErr = [];
p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); p.on('console', m => { const t = m.text(); if (/Shader Error|ERROR: 0:|VALIDATE_STATUS/i.test(t)) shaderErr.push(t.slice(0, 800)); });
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Viewer'); localStorage.setItem('infra-face-name', 'Viewer'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); });
await p.goto(base + '/', { timeout: 180000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'practice'); await p.waitForTimeout(200); await p.selectOption('#ss-ar-map', opt.map || 'mirage').catch(() => p.selectOption('#ss-ar-map', 'dust2')); await p.selectOption('#ss-ar-bots', '0').catch(() => {}); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 }); await p.waitForTimeout(2500);
if (await p.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await p.keyboard.press('Escape');
await p.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); const st = document.createElement('style'); st.id = 'g8-hide'; st.textContent = '#ar-buy,#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar,#crosshair,.crosshair,[id^="gd-"]:not(canvas){visibility:hidden!important}'; document.head.appendChild(st); __infra.lab.campaignUI?.close?.(); });
await p.waitForTimeout(1500); const prog0 = await p.evaluate(() => __infra.renderer.info.programs.length);
const act = a => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).then(r => String(r), e => 'ERR ' + e.message), a);
const hold = id => p.evaluate(async id => { const P = __infra.lab.pistol, F0 = await import('/fp-view.js'); for (let i = 0; i < 60; i++) { if (P.current?.id !== id || i % 8 === 7) P.equip(id); if (P.current?.id === id && P.viewInfo.authored && (P.viewInfo.set === 'cs2_' + id || P.viewInfo.set === id) && F0.fpFor(id, P.viewInfo.set)?.hasClip?.('fire')) return true; await new Promise(r => setTimeout(r, 300)); } return { cur: P.current?.id, set: P.viewInfo.set, authored: P.viewInfo.authored }; }, id);
// One clip of the held set, from idle, caught `ms` in (a: 'idle' | 'fire' | 'fire2' (the second barrel) | 'alt' (the R8's fan) | 'prepare' | 'reload' | 'inspect')
const shoot = async (a, ms) => { await p.evaluate(async a => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(P.current.id, P.viewInfo.set); f?.stopReload?.(); f?.setEmpty?.(false); f.barrel = 0; f?.hold?.(P.current.id, { draw: false }); await new Promise(r => setTimeout(r, 500));
    if (a === 'fire') { f.fire(false); globalThis.__g8fire = f.clipNow; } else if (a === 'fire2') { f.fire(false); await new Promise(r => setTimeout(r, 450)); f.fire(false); } else if (a === 'alt') f.fire(false, true); else if (a === 'prepare') f.prepare?.(); else if (a === 'reload') { const w = P.current, sh = w.shellMs && w.shellIntroMs != null ? { intro: w.shellIntroMs / 1000, loop: w.shellMs / 1000, n: 5 } : null; f.reload?.(sh ? w.shellIntroMs + 5 * w.shellMs + w.shellOutroMs : w.reloadClipMs || 2500, false, sh); }   /* (a shotgun: 5 shells, the arms' loop once per shell — fp-view shellPlan) */ else if (a === 'inspect') f.inspect?.(); }, a);
  await p.waitForTimeout(ms); const clip = await p.evaluate(async () => { const F = await import('/fp-view.js'), P = __infra.lab.pistol; return F.fpFor(P.current.id, P.viewInfo.set)?.clipNow || null; });
  if (a === 'fire') console.log('  fire: right after', await p.evaluate(() => globalThis.__g8fire), '· then', clip);
  return { clip, img: 'data:image/jpeg;base64,' + (await p.screenshot({ type: 'jpeg', quality: 88 })).toString('base64') }; };
const SECOND = { zeus: ['inspect', 1400, 'inspect'], p2000: ['reload', 900, 'reload'], elite: ['fire2', 70, 'left barrel (shoot_left1)'], revolver: ['prepare', 260, 'hammer back (prepare_shoot)'], mag7: ['reload', 900, 'magazine reload'], sawedoff: ['reload', 1100, 'shell by shell'], scar20: ['reload', 1000, 'reload'], g3sg1: ['reload', 1000, 'reload'] };
const THIRD = { revolver: ['alt', 70, 'fan the hammer (shoot_alt1)'] };
const cells = {}, held = {};
for (const [id, name] of GUNS) {
  const r = id === 'zeus' ? await act({ type: 'buy-zeus' }) : await act({ type: 'loadout', [PISTOL.has(id) ? 'secondary' : 'primary']: id }); console.log(id, r);
  const h = await hold(id); held[id] = h === true; check(`${name}: its own CS2 first-person set held (CS2 arms, its clips)`, held[id], JSON.stringify(h));
  const idle = await shoot('idle', 400), fire = await shoot(id === 'elite' ? 'fire' : 'fire', 70), [a2, ms2, cap2] = SECOND[id], sec = await shoot(a2, ms2), th = THIRD[id] ? await shoot(THIRD[id][0], THIRD[id][1]) : null, ins = id === 'zeus' ? null : await shoot('inspect', 1500);
  cells[id] = { idle, fire, sec: { ...sec, cap: cap2 }, th: th && { ...th, cap: THIRD[id][2] }, ins }; }
// (GUNS8 final, review: a shotgun's arms loop the insert once per shell at CS2's speed, in step with its sounds — not one cycle stretched)
if (held.sawedoff) { await act({ type: 'loadout', primary: 'sawedoff' }); await hold('sawedoff');
  const loopT = await p.evaluate(async () => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, w = P.current, f = F.fpFor(w.id, P.viewInfo.set); f.stopReload?.(); f.hold(w.id, { draw: false }); await new Promise(r => setTimeout(r, 400));
    const I = w.shellIntroMs, L = w.shellMs, sh = { intro: I / 1000, loop: L / 1000, n: 5 }; f.reload(I + 5 * L + w.shellOutroMs, false, sh); const t0 = performance.now(), out = [];
    for (const at of [I + .5 * L, I + 2.5 * L, I + 4.5 * L]) { await new Promise(r => setTimeout(r, Math.max(0, t0 + at - performance.now()))); out.push([Math.round(at), f.clipNow, +f.clipTime.toFixed(3)]); } return { I: I / 1000, L: L / 1000, out }; });
  check('Sawed-Off: the arms run the shell loop once per shell at CS2\'s speed (intro ' + loopT.I + ' s, loop ' + loopT.L + ' s): mid-shell 1, 3 and 5 all in the loop', loopT.out.every(([, c, t]) => c === 'reload' && t >= loopT.I - .02 && t <= loopT.I + loopT.L + .02) && Math.abs(loopT.out[0][2] - loopT.out[2][2]) < .12, JSON.stringify(loopT)); }
const tpOk = await p.evaluate(async ids => { const W = await import('/weapon-models.js'); return ids.filter(k => W.hasReal?.(k)); }, GUNS.map(g => g[0]));
check('every new gun registered for third person (other players, spectators, the death cam)', tpOk.length === GUNS.length, tpOk.join(','));
// the buy menu (practice: every gun of both sides, CS2's columns)
await p.evaluate(() => { document.getElementById('g8-hide')?.remove(); __infra.lab.arenaUI.buy(true); }); await p.waitForTimeout(900);
const menu = await p.evaluate(() => { const r = document.getElementById('ar-buy'); return r ? r.innerText : ''; });
check('the buy menu lists the Zeus x27, P2000, Dual Berettas, R8, MAG-7, Sawed-Off, SCAR-20, G3SG1', GUNS.every(([, nm]) => menu.includes(nm)), GUNS.filter(([, nm]) => !menu.includes(nm)).map(g => g[1]).join(', '));
const buyImg = 'data:image/jpeg;base64,' + (await p.screenshot({ type: 'jpeg', quality: 90 })).toString('base64'); writeFileSync(path.join(out, 'buy-menu.jpg'), Buffer.from(buyImg.split(',')[1], 'base64'));
await p.evaluate(() => __infra.lab.arenaUI.buy(false));
const prog1 = await p.evaluate(() => __infra.renderer.info.programs.length);
check('the program count the same after every gun (nothing built in play)', prog1 === prog0, `${prog0} → ${prog1}`);
check('no shader errors, no page errors', !shaderErr.length && !errs.length, [...shaderErr, ...errs].slice(0, 3).join(' | '));
// CS2's loadout in a Defuse match (a second page on the same room): a chosen loadout per side (localStorage, as the
// buy menu keeps it), the CT's buy menu with a slot's choices open, the host refusing a gun outside it, then the T's.
const LO = { ct: { s0: 'p2000', s3: 'cz75', s4: 'revolver', m0: 'mag7', r1: 'm4', r2: 'scar20' }, t: { s4: 'revolver', m0: 'sawedoff', r2: 'g3sg1' } };
const p2 = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }); p2.on('pageerror', e => errs.push(e.message)); p2.on('dialog', d => d.accept());
await p2.addInitScript(lo => { localStorage.setItem('infra-name', 'Viewer2'); localStorage.setItem('infra-face-name', 'Viewer2'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High' })); localStorage.setItem('gd.loadoutSlots', JSON.stringify(lo)); }, LO);
await p.close(); await p2.goto(base + '/', { timeout: 180000 }); await p2.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p2.waitForTimeout(800);
await p2.evaluate(() => document.querySelector('[data-start=arena]').click()); await p2.waitForTimeout(400); await p2.selectOption('#ss-ar-kind', 'defuse'); await p2.selectOption('#ss-ar-map', 'dust2'); await p2.selectOption('#ss-ar-bots', '0').catch(() => {}); await p2.evaluate(() => document.getElementById('ss-ar-solo').click());
await p2.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 }); await p2.waitForTimeout(2000);
if (await p2.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await p2.keyboard.press('Escape');
const act2 = a => p2.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).then(r => String(r?.error || r), e => 'ERR ' + e.message), a);
// (a team change mid-match waits for the next round — arena-logic changeTeam — so the host, this page, restarts the round)
const side = t => p2.evaluate(async t => { const k = Object.keys(__infra.lab.world.operations.game.combat.d.teams).find(k => /viewer2/.test(k)); for (let i = 0; i < 40 && __infra.lab.world.operations.game.combat.d.teams[k] !== t; i++) { await __infra.lab.lan.act({ type: 'arena', action: { type: 'team', team: t } }).catch(() => {}); await new Promise(r => setTimeout(r, 300)); if (__infra.lab.world.operations.game.combat.d.pending?.[k] === t) await __infra.lab.lan.act({ type: 'arena', action: { type: 'restart-round' } }).catch(() => {}); await new Promise(r => setTimeout(r, 400)); } return __infra.lab.world.operations.game.combat.d.teams[k]; }, t);
const menuShot = async (t, pick) => { await p2.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI.buy(false); }); await p2.waitForTimeout(300); await p2.evaluate(() => __infra.lab.arenaUI.buy(true)); await p2.waitForTimeout(700);
  if (pick) { await p2.evaluate(k => document.querySelector(`#ar-buy [data-swap="${k}"]`)?.click(), pick); await p2.waitForTimeout(500); }
  const info = await p2.evaluate(() => { const r = document.getElementById('ar-buy'); return { open: !!r && !r.hidden, text: r?.innerText || '', swaps: r ? r.querySelectorAll('[data-swap]').length : 0, lo: r ? [...r.querySelectorAll('[data-lo]')].map(b => b.textContent) : [], cards: r ? [...r.querySelectorAll('[data-pick]')].map(b => b.textContent) : [], cols: r ? [...r.querySelectorAll('.col')].map(c => c.querySelectorAll('[data-pick]').length) : [] }; });
  return { ...info, img: 'data:image/jpeg;base64,' + (await p2.screenshot({ type: 'jpeg', quality: 90 })).toString('base64') }; };
const ctSide = await side('ct'), ctMenu = await menuShot('ct', 'r1');
check('Defuse CT: the buy menu shows your CS2 loadout — 5 pistols, 5 Mid-Tier, 5 rifles, each with its ⇄ badge', ctSide === 'ct' && ctMenu.open && ctMenu.cols.slice(1, 4).every(c => c === 5) && ctMenu.swaps >= 14, JSON.stringify({ ctSide, open: ctMenu.open, cols: ctMenu.cols, swaps: ctMenu.swaps }));
check('…your choices in it (P2000, CZ75-Auto, R8, MAG-7, M4A4, SCAR-20) and not what they replaced (USP-S, Five-SeveN, Desert Eagle, Nova, M4A1-S, SSG 08)', ['P2000', 'CZ75-Auto', 'R8 Revolver', 'MAG-7', 'M4A4', 'SCAR-20'].every(x => ctMenu.text.includes(x)) && !['USP-S', 'Five-SeveN', 'Desert Eagle', 'SSG 08'].some(x => ctMenu.cards.some(c => c.includes(x)))   /* (the cards: the open ⇄ list rightly names the other rifles) */, ctMenu.text.replace(/\s+/g, ' ').slice(0, 400));
check('…the ⇄ on rifle 2 lists every CT rifle for that slot (M4A1-S, AWP, SCAR-20 …)', ['M4A1-S', 'AWP', 'SCAR-20', 'FAMAS', 'AUG'].every(x => ctMenu.lo.some(t => t.startsWith(x))) && !ctMenu.lo.some(t => /AK-47|G3SG1/.test(t)), ctMenu.lo.join(', '));
const refused = await act2({ type: 'loadout', primary: 'mp7' }); check('the host refuses a gun outside your loadout (MP7)', /not in your loadout/.test(refused), refused);
const tSide = await side('t'), tMenu = await menuShot('t', null);
check('Defuse T: the T loadout (Sawed-Off, G3SG1, R8; the Glock as starting pistol)', tSide === 't' && tMenu.open && ['Sawed-Off', 'G3SG1', 'R8 Revolver', 'Glock-18'].every(x => tMenu.text.includes(x)) && !tMenu.text.includes('SCAR-20'), JSON.stringify({ tSide, open: tMenu.open, text: tMenu.text.replace(/\s+/g, ' ').slice(0, 300) }));
// the sheet, drawn in the page
const icon = id => { const f = kf?.weapons?.[id] || kf?.weapons?.[{ zeus: 'taser', p2000: 'hkp2000' }[id]] || null; return f ? base + '/user-assets/icons/killfeed/' + f + '.svg' : null; };   // (drawn on p2: same origin)
const data = await p2.evaluate(async ({ rows, cols, buyImg, ctImg, tImg, title }) => {
  const cw = 300, ch = 169, pad = 6, lab = 18, left = 130, head = 70, gridW = left + cols.length * (cw + pad) + pad, bw = gridW - 2 * pad, bh = Math.round(bw * 720 / 1280), W = gridW, hb = Math.round((bw / 2 - pad) * 720 / 1280), H = head + rows.length * (ch + lab + pad) + pad + 34 + bh + pad + 34 + hb + pad;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#14181c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f0b232'; g.font = 'bold 24px system-ui'; g.fillText(title, pad + 4, 30); g.fillStyle = '#9fb3c3'; g.font = 'bold 15px system-ui'; cols.forEach((c, i) => g.fillText(c, left + pad + i * (cw + pad) + 4, 60));
  const img = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  for (let r = 0; r < rows.length; r++) { const y = head + r * (ch + lab + pad); g.fillStyle = '#e8eef2'; g.font = 'bold 15px system-ui'; rows[r].label.split(' · ').forEach((w, k) => g.fillText(w, pad + 4, y + 28 + k * 19));
    for (let c = 0; c < rows[r].cells.length; c++) { const x = left + pad + c * (cw + pad), cell = rows[r].cells[c]; g.fillStyle = '#1e252b'; g.fillRect(x, y, cw, ch); const im = await img(cell?.src);
      if (im) { const contain = cell.fit === 'contain', k = contain ? Math.min(cw / im.width, ch / im.height) * .8 : Math.max(cw / im.width, ch / im.height), w = im.width * k, h = im.height * k; g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); if (contain) { g.fillStyle = '#3a444c'; g.fillRect(x, y, cw, ch); } g.drawImage(im, x + (cw - w) / 2, y + (ch - h) / 2, w, h); g.restore(); }
      else { g.fillStyle = '#56646f'; g.font = '14px system-ui'; g.fillText(cell?.empty || '—', x + 10, y + ch / 2); }
      g.fillStyle = '#9fb3c3'; g.font = '12px system-ui'; g.fillText(cell?.cap || '', x + 2, y + ch + 14); } }
  const by = head + rows.length * (ch + lab + pad) + pad; g.fillStyle = '#f0b232'; g.font = 'bold 18px system-ui'; g.fillText('Buy menu, practice: every gun of both sides · Equipment: the Zeus x27 · Pistols in CS2\'s loadout order', pad + 4, by + 22);
  const bi = await img(buyImg); if (bi) g.drawImage(bi, pad, by + 34, bw, bh);
  const by2 = by + 34 + bh + pad; g.fillStyle = '#f0b232'; g.fillText('Defuse: your CS2 loadout (items_game flexible slots) · left CT, rifle 2\'s ⇄ open (its choices on the info line) · right T', pad + 4, by2 + 22);
  const ci = await img(ctImg), ti = await img(tImg), hw = bw / 2 - pad / 2; if (ci) g.drawImage(ci, pad, by2 + 34, hw, hw * 720 / 1280); if (ti) g.drawImage(ti, pad + hw + pad, by2 + 34, hw, hw * 720 / 1280);
  return cv.toDataURL('image/jpeg', .88).split(',')[1]; }, { buyImg, ctImg: ctMenu.img, tImg: tMenu.img, title: `GD v53 · CS2's eight added guns in first person (CS2's own sets) and the buy menu · ${opt.map || 'mirage'} · Retina, High · muted`,
  cols: ['CS2 kill-feed icon', 'idle', 'a shot', 'its own clip', 'inspect / fan'],
  rows: GUNS.map(([id, name]) => { const c = cells[id]; return { label: name + ' · ' + id, cells: [{ src: icon(id), fit: 'contain', cap: 'panorama/…/equipment (local install)', empty: 'no icon' }, { src: c.idle.img, cap: 'idle · ' + (c.idle.clip || '') }, { src: c.fire.img, cap: (id === 'elite' ? 'right barrel · ' : '') + (c.fire.clip || '') + ', 70 ms in' }, { src: c.sec.img, cap: c.sec.cap + ' · ' + (c.sec.clip || '') }, c.th ? { src: c.th.img, cap: c.th.cap + ' · ' + (c.th.clip || '') } : c.ins ? { src: c.ins.img, cap: 'inspect · ' + (c.ins.clip || '') } : { empty: 'inspect shown left', cap: '' }] }; }) });
const f = path.join(out, 'GD-v53-new-guns.jpg'); writeFileSync(f, Buffer.from(data, 'base64')); if (opt.desktop) copyFileSync(f, path.join(os.homedir(), 'Desktop', 'GD-v53-new-guns.jpg')); console.log('sheet', f);
console.log(`${ok === n ? 'PASS' : 'FAIL'}: new guns sheet · ${ok}/${n}`); await b.close(); process.exit(ok === n ? 0 : 1);
