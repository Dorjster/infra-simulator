// CS2 gloves as skins in a real match (Global Defensive): picked in the LOADOUT & SKINS menu's Gloves tab (1280×720) and
// worn on the first-person arms, CT and T, with this computer's own import (user-assets/gloves: tools/import-cs2-gloves.mjs).
// Checks: the tab (Sport Gloves first; CS2's icon, name and rarity colour on every tile; the wear slider limited to the
// finish's range; Equip → the room keeps { finish, wear }, the list ticks it); in hand the chosen type's gloves shown and the
// side's own gloves hidden (sleeves kept) on every type, a rifle and the knife (idle, inspect), their pictures on the GPU
// before they show, no shader program built by any glove swap; left-handed view; spectating shows the WATCHED player's
// gloves (spectate-view.js) and your own view takes them back; no page errors. Pictures: a sheet per finish — CS2's icon |
// CT rifle idle | CT knife inspect | T rifle idle | T knife inspect — under the picker's screenshot.
// Skipped without the gloves import or the CS2 first-person sets.
//   node tests/browser/gd-gloves-skins-e2e.mjs <repo-root> <out-dir> [map=dust2] [desktop=1] [sport=4]
// desktop=1 also writes ~/Desktop/GD-v52-gloves-in-game.jpg.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-gloves-skins'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('=')));
const man = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'manifest.json'), 'utf8')); } catch { return null; } })(), GL = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'gloves', 'gloves.json'), 'utf8')); } catch { return null; } })();
if (!man?.models?.viewmodels?.cs2_ak || !man?.models?.fpGloves || !GL) { console.log('SKIP: no CS2 gloves import / first-person sets on this computer'); process.exit(0); }
const ORDER = ['sporty', 'slick', 'handwrap', 'motorcycle', 'specialist', 'bloodhound', 'hydra', 'brokenfang'].filter(t => GL.types[t]);
const KITS = [...GL.types.sporty.finishes.slice(0, +(opt.sport || 4)), ...ORDER.slice(1).map(t => GL.types[t].finishes[0])];   // (Sport Gloves: several finishes; every other type: its first)
const servers = [];
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GLSK01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'glsk-')), 's.json') }, stdio: ['ignore', 'pipe', 'inherit'] }); servers.push(server);
process.on('exit', () => { for (const s of servers) try { s.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 500) : '')); }; const errs = [];
const VW = 1280, VH = 720, shots = {}, info = { swaps: [], progs: {} };
const jpg = async (G, clip) => 'data:image/jpeg;base64,' + (await G.screenshot({ type: 'jpeg', quality: 86, ...(clip ? { clip } : {}) })).toString('base64');
async function page(side) {
  const G = await b.newPage({ viewport: { width: VW, height: VH } }); G.on('pageerror', e => errs.push(side + ': ' + e.message)); G.on('dialog', d => d.accept());
  await G.goto(base + '/'); await G.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 });
  const name = await G.evaluate(async side => { const { sideOf } = await import('/gd-soldiers.js'); for (const n of ['Viewer', 'Tessa', 'Ivan', 'Mara', 'Otto', 'Lena', 'Bora', 'Dash']) if (sideOf(n) === side) return n; return 'Viewer'; }, side);
  await G.evaluate(n => { localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); localStorage.setItem('infra-face', 'smile'); }, name); await G.reload(); await G.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await G.waitForTimeout(1200);
  await G.evaluate(() => document.querySelector('[data-start=arena]').click()); await G.waitForTimeout(400); await G.selectOption('#ss-ar-kind', 'practice'); await G.waitForTimeout(200); await G.selectOption('#ss-ar-map', opt.map || 'dust2').catch(() => G.selectOption('#ss-ar-map', 'yard')); await G.selectOption('#ss-ar-bots', '0').catch(() => {}); await G.evaluate(() => document.getElementById('ss-ar-solo').click());
  await G.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 }); await G.waitForTimeout(1500);
  if (await G.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await G.keyboard.press('Escape'); await G.waitForTimeout(300);
  await G.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); });
  return { G, name: name.toLowerCase() };
}
// Equip a weapon and wait for its CS2 set in hand; → what the set wears.
const hold = (G, id, kit) => G.evaluate(async ({ id, kit }) => { const P = __infra.lab.pistol, w = (await import('/weapons-data.js')).weaponById(id), { arenaArsenalOf } = await import('/combat-logic.js'), F = await import('/fp-view.js'), game = () => __infra.lab.world.operations.game, me = String(localStorage.getItem('infra-name'));
  const act = async a => { try { return String(await __infra.lab.lan.act({ type: 'arena', action: a })); } catch (e) { return 'ERR ' + (e?.message || e); } };
  if (id === 'knife') await act({ type: 'knife', knife: 'default' }); else await act({ type: 'loadout', [w.kind === 'pistol' ? 'secondary' : 'primary']: id });
  for (let i = 0; i < 40 && !arenaArsenalOf(game(), me).includes(id); i++) await new Promise(r => setTimeout(r, 100));
  P.equip(null); await new Promise(r => setTimeout(r, 60)); P.equip(id); for (let i = 0; i < 60 && !(P.current?.id === id && P.viewInfo.authored); i++) await new Promise(r => setTimeout(r, 100));
  const f = F.fpFor(id, P.viewInfo.set); for (let i = 0; i < 150 && kit && f?.worn?.shows !== 'glove'; i++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 1500)); return { set: P.viewInfo.set, shows: f?.worn?.shows || null }; }, { id, kit });
// What the set in hand wears right now: the type group shown, the side's own parts hidden, the sleeves kept, pictures on the GPU.
const worn = (G, id, side) => G.evaluate(async ({ id, side }) => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(id, P.viewInfo.set), w = f?.worn; if (!w) return null; const R = __infra.renderer;
  const grp = [...w.types.entries()].find(([, g]) => g.visible), gm = grp?.[1].children.find(o => o.userData.glovePart === 'glove')?.material;
  const up = gm ? [gm.map, gm.normalMap, gm.aoMap].every(t => t && R.properties.get(t).__webglTexture && t.image?.width > 1) : false;
  return { shows: w.shows, type: grp?.[0] || null, kit: gm?.userData?.kit || null, partsHidden: w.parts[side].every(o => !o.visible), sleeves: w[side].children.filter(o => /^sleeves_/.test(o.name)).every(o => o.visible) && w[side].children.some(o => /^sleeves_/.test(o.name)), sideOn: w[side].visible, up, progs: R.info.programs.length }; }, { id, side });
const setGloves = (G, kit, wear = .15) => G.evaluate(async ({ kit, wear }) => { const r = String(await __infra.lab.lan.act({ type: 'arena', action: kit ? { type: 'skin', weapon: 'gloves', skin: { finish: 'cs2g:' + kit, wear } } : { type: 'skin', weapon: 'gloves', clear: true } }).catch(e => 'ERR ' + e.message));
  const me = String(localStorage.getItem('infra-name')).toLowerCase(); for (let i = 0; i < 60 && (__infra.lab.world.operations.game.arena?.skins?.[me]?.gloves?.finish || null) !== (kit ? 'cs2g:' + kit : null); i++) await new Promise(r => setTimeout(r, 100)); return r; }, { kit, wear });
try {
  for (const side of ['ct', 't']) {
    const { G, name } = await page(side), rifle = side === 'ct' ? 'm4' : 'ak';
    // The picker (once, on the CT page): the Gloves tab at 1280×720.
    if (side === 'ct') {
      await G.waitForTimeout(1500); await G.evaluate(() => { __infra.lab.arenaUI.teamMenu(true); document.querySelector('#ar-team [data-tab=skins]').click(); }); await G.waitForTimeout(500);
      const tab = await G.evaluate(async () => { for (let i = 0; i < 50 && !document.querySelector('#ar-team [data-sk-cat=gloves]'); i++) await new Promise(r => setTimeout(r, 100)); const t = document.querySelector('#ar-team [data-sk-cat=gloves]'); if (!t) return null; t.click(); await new Promise(r => setTimeout(r, 300));
        const types = [...document.querySelectorAll('#sk-list [data-gl-type]')].map(x => x.dataset.glType), tiles = [...document.querySelectorAll('#sk-grid [data-gl-finish]')].filter(x => x.dataset.glFinish);
        const box = document.querySelector('#ar-team>div').getBoundingClientRect();
        return { types, tiles: tiles.length, icons: tiles.every(x => /\/user-assets\/gloves\/icons\/sporty\/.+\.webp/.test(x.querySelector('img')?.src || '')), rar: tiles.every(x => /rgb\(235, 75, 75\)|#eb4b4b/i.test(x.getAttribute('style') || '') && /Extraordinary/.test(x.textContent)), names: tiles.slice(0, 3).map(x => x.querySelector('small')?.textContent), def: !!document.querySelector('#sk-grid [data-gl-finish=""]'), inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, hscroll: document.documentElement.scrollWidth > innerWidth }; });
      check('the Gloves tab (the host has gloves.json): Default first, then Sport Gloves and the rest in CS2\'s order', tab && tab.types[0] === '' && tab.types.slice(1).join() === ORDER.join(), JSON.stringify(tab?.types));
      check('Sport Gloves\' tiles: CS2\'s icon, name and rarity colour (Extraordinary), a Default tile; the panel inside 1280×720', tab && tab.tiles === GL.types.sporty.finishes.length && tab.icons && tab.rar && tab.def && tab.inside && !tab.hscroll, JSON.stringify(tab));
      const kit = GL.types.sporty.finishes[1], pick = await G.evaluate(async kit => { const b = document.querySelector(`#sk-grid [data-gl-finish="cs2g:${kit}"]`); b.click(); await new Promise(r => setTimeout(r, 200)); const s = document.getElementById('gl-wear');
        s.value = '0.3'; s.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 100)); const title = document.getElementById('sk-title')?.textContent; document.querySelector('#sk-detail [data-gl-apply]').click();
        const me = String(localStorage.getItem('infra-name')).toLowerCase(); for (let i = 0; i < 50 && __infra.lab.world.operations.game.arena?.skins?.[me]?.gloves?.finish !== 'cs2g:' + kit; i++) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 300));
        return { min: +s.min, max: +s.max, title, rec: __infra.lab.world.operations.game.arena?.skins?.[me]?.gloves, tick: !!document.querySelector('#sk-list [data-gl-type=sporty] .ok'), cur: document.getElementById('sk-cur')?.textContent }; }, kit);
      const f = GL.finishes[kit];
      check('wear limited to the finish\'s range; Equip: the room keeps { finish, wear }, the list ticks Sport Gloves, the detail names the pair', pick.min === f.wearRange[0] && pick.max === f.wearRange[1] && pick.rec?.finish === 'cs2g:' + kit && pick.rec?.wear === .3 && pick.tick && /Sport Gloves \| /.test(pick.cur || '') && /Field-Tested/.test(pick.title || ''), JSON.stringify(pick));
      shots.picker = await jpg(G); writeFileSync(path.join(out, 'picker-gloves-1280.jpg'), Buffer.from(shots.picker.split(',')[1], 'base64'));
      await G.evaluate(() => __infra.lab.arenaUI.teamMenu(false)); await G.waitForTimeout(300);
    }
    await G.evaluate(() => { const st = document.createElement('style'); st.textContent = '#ar-buy,#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar,#crosshair,.crosshair{visibility:hidden!important}'; document.head.appendChild(st); });
    // Warm: the rifle and the knife with the agent's own gloves; the program count from here on must not rise.
    await setGloves(G, null); await hold(G, 'knife', null); await hold(G, rifle, null); const p0 = (await worn(G, rifle, side))?.progs; info.progs[side] = { before: p0 };
    for (const kit of KITS) { const f = GL.finishes[kit]; await setGloves(G, kit, Math.max(f.wearRange[0], .15));
      const h = await hold(G, rifle, kit), wr = await worn(G, rifle, side); info.swaps.push({ side, want: kit, item: rifle, ...wr }); await G.waitForTimeout(400); shots[`${side}|rifle|${kit}`] = await jpg(G);
      const hk = await hold(G, 'knife', kit), wk = await worn(G, 'knife', side); info.swaps.push({ side, want: kit, item: 'knife', ...wk });
      await G.evaluate(async () => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor('knife', P.viewInfo.set); f?.inspect?.(); }); await G.waitForTimeout(1000); shots[`${side}|knife|${kit}`] = await jpg(G); }
    info.progs[side].after = (await worn(G, 'knife', side))?.progs;
    // Left-handed view (live.leftHand): mirrored, the gloves still on.
    { const lh = await G.evaluate(async () => { const L = (await import('/live-settings.js')).live, was = L.leftHand; L.leftHand = true; await new Promise(r => setTimeout(r, 300)); const h = __infra.camera.children.find(o => o.children.length && o.scale.x < 0); L.leftHand = was; return { mirrored: !!h }; }), w = await worn(G, 'knife', side);
      check(`${side}: left-handed view: the hand mirrored, the gloves still worn`, lh.mirrored && w.shows === 'glove', JSON.stringify(lh) + ' ' + w.shows); }
    // Spectating (first person only): the watched player's own gloves on the set, then your own view takes it back.
    { const other = GL.types.slick?.finishes?.[0] || KITS[1], mine = KITS.at(-1), sp = await G.evaluate(async ({ other, side }) => { const SV = await import('/spectate-view.js'), F = await import('/fp-view.js'), v = SV.createSpectateView({ camera: __infra.camera, scene: __infra.scene });
        const t = { key: 'mate', weapon: 'ak', team: side, knife: null, skin: null, gloves: { finish: 'cs2g:' + other, wear: .2 }, shotN: 0, shotW: null, reloadN: 0, reloadW: null, speed: 0, act: null, actUntil: 0 };
        let shows = null; for (let i = 0; i < 120; i++) { v.show(t, 1 / 60); shows = v.set?.worn?.shows; const kit = [...(v.set?.worn?.types.values() || [])].find(g => g.visible)?.children.find(o => o.userData.glovePart === 'glove')?.material?.userData?.kit; if (shows === 'glove' && kit === other) break; await new Promise(r => setTimeout(r, 100)); }
        const kit = [...(v.set?.worn?.types.values() || [])].find(g => g.visible)?.children.find(o => o.userData.glovePart === 'glove')?.material?.userData?.kit; v.hide(); v.group.removeFromParent(); return { shows, kit }; }, { other, side });
      check(`${side}: spectating shows the watched player's gloves (theirs, not yours)`, sp.shows === 'glove' && sp.kit === other, JSON.stringify(sp));
      await hold(G, rifle, mine); const back = await worn(G, rifle, side); check(`${side}: back in your own view: your own gloves again`, back.shows === 'glove' && back.kit === mine, JSON.stringify(back)); }
    await G.close();
  }
  const sw = info.swaps, bad = sw.filter(s => s.shows !== 'glove' || s.kit !== s.want || s.type !== GL.finishes[s.want].type || !s.partsHidden || !s.sleeves || !s.sideOn);
  check('every type and finish, CT and T, rifle and knife: the chosen gloves worn, the side\'s own gloves and wrists hidden, the sleeves kept', sw.length === KITS.length * 4 && !bad.length, bad.map(s => JSON.stringify(s)).join(' | ') || sw.length + ' views');
  check('their pictures on the GPU before they showed (glove-assets\' gated pump: not mid-round)', sw.every(s => s.up), sw.filter(s => !s.up).map(s => s.side + ' ' + s.item + ' ' + s.want).join(' · ') || 'all');
  check('no shader program built by any glove swap (the arms\' program: renderer.info.programs unchanged)', ['ct', 't'].every(s => info.progs[s].before > 0 && info.progs[s].after === info.progs[s].before), JSON.stringify(info.progs));
  // The sheet.
  const P = await b.newPage({ viewport: { width: 800, height: 600 } }); await P.goto(base + '/'); const icon = kit => base + '/user-assets/gloves/' + GL.finishes[kit].icon;
  const rows = KITS.map(kit => ({ label: (GL.types[GL.finishes[kit].type].name), sub: GL.finishes[kit].name + (GL.finishes[kit].shader === 'v2' ? ' (v2 approx.)' : ''), cells: [{ src: icon(kit), fit: 'contain' }, { src: shots[`ct|rifle|${kit}`] }, { src: shots[`ct|knife|${kit}`] }, { src: shots[`t|rifle|${kit}`] }, { src: shots[`t|knife|${kit}`] }] }));
  const url = await P.evaluate(async ({ rows, picker }) => {
    const cw = 400, ch = 225, iw = 300, pad = 6, lab = 180, head = 80, ph = 405, W = lab + iw + 4 * cw + 6 * pad, H = head + ph + 40 + rows.length * (ch + pad) + pad, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const img = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
    g.fillStyle = '#14181c'; g.fillRect(0, 0, W, H); g.fillStyle = '#f0b232'; g.font = 'bold 28px system-ui'; g.fillText('GLOBAL DEFENSIVE v52 · CS2 GLOVES AS SKINS — in game, first person', pad + 4, 34);
    g.fillStyle = '#9fb3c3'; g.font = '15px system-ui'; g.fillText('Picked in M → LOADOUT & SKINS → Gloves (1280×720, below). Per finish: CS2\'s own icon | CT M4A4 idle | CT knife inspect | T AK-47 idle | T knife inspect (Dust II, Practice; each frame\'s lower right, where the hands are).', pad + 4, 60);
    const pk = await img(picker); if (pk) g.drawImage(pk, pad, head, ph * 16 / 9, ph); g.fillStyle = '#9fb3c3'; g.font = 'bold 15px system-ui'; g.fillText('the picker · Gloves tab', pad + ph * 16 / 9 + 12, head + 20);
    const y0 = head + ph + 40; g.font = 'bold 15px system-ui'; ['CS2 icon', 'CT · M4A4 idle', 'CT · knife inspect', 'T · AK-47 idle', 'T · knife inspect'].forEach((t, i) => g.fillText(t, lab + pad + (i ? iw + pad + (i - 1) * (cw + pad) : 0), y0 - 10));
    for (const [ri, r] of rows.entries()) { const y = y0 + ri * (ch + pad); g.fillStyle = '#e6edf2'; g.font = 'bold 16px system-ui'; g.fillText(r.label, pad + 4, y + ch / 2 - 6); g.fillStyle = '#eb4b4b'; g.font = '14px system-ui'; g.fillText(r.sub, pad + 4, y + ch / 2 + 14);
      for (const [ci, c] of r.cells.entries()) { const x = lab + pad + (ci ? iw + pad + (ci - 1) * (cw + pad) : 0), w = ci ? cw : iw, im = await img(c.src); g.fillStyle = ci ? '#20262c' : '#d9dde0'; g.fillRect(x, y, w, ch);
        if (im) { if (ci) g.drawImage(im, im.width * .3125, im.height * .3125, im.width * .6875, im.height * .6875, x, y, w, ch); else { const k = Math.min(w / im.width, ch / im.height); g.drawImage(im, x + (w - im.width * k) / 2, y + (ch - im.height * k) / 2, im.width * k, im.height * k); } } } }
    return cv.toDataURL('image/jpeg', .88); }, { rows, picker: shots.picker });
  const file = path.join(out, 'GD-v52-gloves-in-game.jpg'); writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); if (opt.desktop) copyFileSync(file, path.join(os.homedir(), 'Desktop', 'GD-v52-gloves-in-game.jpg')); console.log('sheet: ' + file);
  for (const [k, v] of Object.entries(shots)) writeFileSync(path.join(out, 'shot_' + k.replace(/[^a-z0-9]+/gi, '_') + '.jpg'), Buffer.from(v.split(',')[1], 'base64'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { check('ran to the end', false, e.stack || e.message); }
console.log((ok === n ? 'PASS' : 'FAIL') + ': gloves as skins in game · ' + ok + '/' + n); await b.close(); for (const s of servers) s.kill(); if (ok !== n) process.exitCode = 1;
