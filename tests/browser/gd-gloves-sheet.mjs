// First-person gloves, hands and sleeves as the game draws them in a real match (package V), on a labelled contact sheet
// next to CS2's own look: per side (CT: M4A4, USP-S, knife · T: AK-47, Glock, T knife) an idle and a reload frame (the
// knife: its inspect), columns CS2 render (Blender, from the CS2 install: tools/render-fp-gloves-cs2.py → cs2=<dir>) |
// before (`before=<repo>`, the released v51) | now. Checks: the side's own CS2 arms worn on every CS2 set (CT: SAS
// sleeves + Hardknuckle gloves, T: Phoenix's), their pictures on the GPU before the shot, no page errors. Skipped without
// the CS2 sets / arms imported on this computer.
//   node tests/browser/gd-gloves-sheet.mjs <repo-root> <out-dir> [before=<older repo>] [cs2=<dir of CS2 renders>] [map=dust2] [desktop=1]
// desktop=1 also writes ~/Desktop/GD-v52-gloves-vs-CS2.jpg.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-gloves-sheet'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('=')));
const man = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'manifest.json'), 'utf8')); } catch { return null; } })();
if (!man?.models?.viewmodels?.cs2_ak || !man?.models?.fpGloves) { console.log('SKIP: no CS2 first-person sets / arms (tools/export-fp-gloves.py) on this computer'); process.exit(0); }
const servers = [];
async function serve(dir, code) { const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: dir, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: code, HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'ggs-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] }); servers.push(s);
  return new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); })); }
process.on('exit', () => { for (const s of servers) try { s.kill(); } catch {} });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); }; const errs = [];
const VW = 1200, VH = 750;
// [side, arsenal id, the set it must show, label]
export const PLAN = [['ct', 'm4', 'm4', 'CT · M4A4'], ['ct', 'usps', 'usps', 'CT · USP-S'], ['ct', 'knife', 'knife', 'CT · knife'], ['t', 'ak', 'ak', 'T · AK-47'], ['t', 'pistol', 'pistol', 'T · Glock-18'], ['t', 'knife', 'knife-t', 'T · knife']];
export const FRAMES = { idle: .4, reload: .95, inspect: 1.0 };   // seconds into the clip at the shot (the CS2 renders pose the same moments; reload: of a 2.6 s reload)
const spots = {};
// How a part reads on screen, in the real frame: its pixels found by drawing the frame with and without it (the view
// held still between: the set's update paused), then its mean colour, its share at R ≥ 250 (clipped) and its mean
// luminance — bare skin, the gloves and the gun (the glove-to-gun ratio: CS2's render ~1.2, a black glove beside a black slide).
async function measure(G, id, side) {
  const toggle = (part, on) => G.evaluate(async ({ id, side, part, on }) => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(id, P.viewInfo.set); if (!f) return 0; let n = 0;
    if (part === 'freeze') { if (on) { f.__u ??= f.update; f.update = () => {}; } else if (f.__u) { f.update = f.__u; delete f.__u; } return 1; }
    const hit = part === 'gun' ? (m => f.weaponMats.includes(m.material)) : (m => m.material?.userData?.part === part);
    f.root.traverse(o => { if (o.isMesh && o.parent?.visible !== false && hit(o) && (part === 'gun' || f.worn[side].children.includes(o))) { o.visible = on; n++; } }); return n; }, { id, side, part, on });
  const png = async () => (await G.screenshot({ type: 'png' })).toString('base64'), out = {};
  await toggle('freeze', true); await G.waitForTimeout(150);
  try { const A = await png();
    for (const part of ['skin', 'glove', 'gun']) { if (!(await toggle(part, false))) continue; await G.waitForTimeout(120); const B = await png(); await toggle(part, true);
      out[part] = await G.evaluate(async ({ A, B }) => { const dec = async s => { const im = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()), c = new OffscreenCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
        const a = await dec(A), b = await dec(B); let n = 0, r = 0, g = 0, bl = 0, clip = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) { n++; r += a[i]; g += a[i + 1]; bl += a[i + 2]; if (a[i] >= 250) clip++; }
        return n ? { px: n, rgb: [r / n, g / n, bl / n].map(Math.round), clip: +(clip / n * 100).toFixed(1), lum: Math.round(.299 * r / n + .587 * g / n + .114 * bl / n) } : { px: 0 }; }, { A, B }); } }
  finally { await toggle('freeze', false); }
  return out;
}
async function run(repo, tag) {
  const base = await serve(repo, 'GDGL' + tag), shots = {}, info = {};
  for (const side of ['ct', 't']) {
    const G = await b.newPage({ viewport: { width: VW, height: VH } }); G.on('pageerror', e => errs.push(tag + ': ' + e.message)); G.on('dialog', d => d.accept());
    await G.goto(base + '/'); await G.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 });
    // Practice on a CS2 map (Deathmatch's rules: free loadouts, no teams — your side is by name, gd-soldiers sideOf)
    const name = await G.evaluate(async side => { const { sideOf } = await import('/gd-soldiers.js'); for (const n of ['Viewer', 'Tessa', 'Ivan', 'Mara', 'Otto', 'Lena', 'Bora', 'Dash']) if (sideOf(n) === side) return n; return 'Viewer'; }, side);
    await G.evaluate(n => { localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); localStorage.setItem('infra-face', 'smile'); }, name); await G.reload(); await G.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await G.waitForTimeout(1200);
    await G.evaluate(() => document.querySelector('[data-start=arena]').click()); await G.waitForTimeout(400); await G.selectOption('#ss-ar-kind', 'practice'); await G.waitForTimeout(200); await G.selectOption('#ss-ar-map', opt.map || 'dust2').catch(() => G.selectOption('#ss-ar-map', 'yard')); await G.selectOption('#ss-ar-bots', '0').catch(() => {}); await G.evaluate(() => document.getElementById('ss-ar-solo').click());
    await G.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 }); await G.waitForTimeout(1500);
    if (await G.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await G.keyboard.press('Escape'); await G.waitForTimeout(300);
    // The same spot and view for every build (the first run's spawn, its eye and look; the released build spawned elsewhere — T rows faced a wall)
    spots[side] = await G.evaluate(s => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()); s ??= { x: c.position.x, y: c.position.y, z: c.position.z, tx: c.position.x + d.x * 20, ty: c.position.y + d.y * 20, tz: c.position.z + d.z * 20 };
      try { __infra.lab.look(s.x, s.z, s.tx, s.ty, s.tz, s.y); } catch {} return s; }, spots[side] || null); await G.waitForTimeout(500);
    await G.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); const st = document.createElement('style'); st.textContent = '#ar-buy,#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar,#crosshair,.crosshair{visibility:hidden!important}'; document.head.appendChild(st); });   // (Deathmatch's buy menu opens at the spawn: hidden, as the HUD)
    for (const [s, id, expect, label] of PLAN) { if (s !== side) continue;
      const h = await G.evaluate(async ({ id, side }) => { const P = __infra.lab.pistol, w = (await import('/weapons-data.js')).weaponById(id), { arenaArsenalOf } = await import('/combat-logic.js'), F = await import('/fp-view.js'), game = () => __infra.lab.world.operations.game, me = String(localStorage.getItem('infra-name'));
        const act = async a => { try { return String(await __infra.lab.lan.act({ type: 'arena', action: a })); } catch (e) { return 'ERR ' + (e?.message || e); } };
        if (id === 'knife') await act({ type: 'knife', knife: 'default' }); else await act({ type: 'loadout', [w.kind === 'pistol' ? 'secondary' : 'primary']: id });
        for (let i = 0; i < 40 && !arenaArsenalOf(game(), me).includes(id); i++) await new Promise(r => setTimeout(r, 100));
        P.equip(null); await new Promise(r => setTimeout(r, 60)); P.equip(id); for (let i = 0; i < 60 && !(P.current?.id === id && P.viewInfo.authored); i++) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 1800)); const f = F.fpFor(id, P.viewInfo.set);   // (the draw played out: idle — the arms as the game's own path chose them, weapons.js setView with lab's team(); no hold() of ours)
        const worn = f?.worn ? { ct: f.worn.ct.visible, t: f.worn.t.visible, legacy: f.worn.legacy.some(o => o.visible) } : null;
        const env = f?.worn ? f.worn[side].children.every(m => m.material.envMap && m.material.envMap === F.fpEnv?.() && m.material.envMapIntensity === F.ARM_LOOK[m.material.userData.part].env) : null;   // (their own reflections — the gun's studio box at ARM_LOOK's share: without an envMap three.js uses scene.environmentIntensity instead)
        let up = 0, all = 0; if (f?.worn) { const R = __infra.renderer; for (const m of [...f.worn[side].children]) for (const t of [m.material.map, m.material.normalMap, m.material.aoMap]) { all++; if (R.properties.get(t).__webglTexture) up++; } }
        return { cur: P.current?.id, set: P.viewInfo.set, authored: P.viewInfo.authored, worn, env, up, all }; }, { id, side });
      info[label] = h; await G.waitForTimeout(FRAMES.idle * 1000); shots[label + '|idle'] = 'data:image/jpeg;base64,' + (await G.screenshot({ type: 'jpeg', quality: 88 })).toString('base64');
      if (h.worn) info[label].look = await measure(G, id, side);
      const kind = id === 'knife' ? 'inspect' : 'reload';
      await G.evaluate(async ({ id, kind }) => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(id, P.viewInfo.set); if (kind === 'reload') f?.reload?.(2600); else f?.inspect?.(); }, { id, kind });
      await G.waitForTimeout(FRAMES[kind] * 1000); shots[label + '|' + kind] = 'data:image/jpeg;base64,' + (await G.screenshot({ type: 'jpeg', quality: 88 })).toString('base64');
      info[label].expect = expect; }
    await G.close();
  }
  return { shots, info };
}
async function compose(p, title, rows, cols, cw, ch, heads) {
  return p.evaluate(async ({ title, rows, cols, cw, ch, heads }) => {
    const pad = 6, lab = 22, head = 70, W = cols * (cw + pad) + pad + 150, H = head + rows.length * (ch + lab + pad) + pad, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#14181c'; g.fillRect(0, 0, W, H); g.fillStyle = '#f0b232'; g.font = 'bold 26px system-ui'; g.fillText(title, pad + 4, 32);
    g.fillStyle = '#9fb3c3'; g.font = 'bold 17px system-ui'; heads.forEach((h, i) => g.fillText(h, 150 + pad + i * (cw + pad) + 4, 60));
    const img = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
    for (const [ri, r] of rows.entries()) { const y = head + ri * (ch + lab + pad); g.fillStyle = '#e6edf2'; g.font = 'bold 16px system-ui'; g.fillText(r.label, pad + 4, y + ch / 2); g.fillStyle = '#8fa1ae'; g.font = '13px system-ui'; g.fillText(r.frame, pad + 4, y + ch / 2 + 20);
      for (const [ci, c] of r.cells.entries()) { const x = 150 + pad + ci * (cw + pad), im = await img(c.src); g.fillStyle = '#20262c'; g.fillRect(x, y, cw, ch + lab); if (im) g.drawImage(im, x, y, cw, ch); else { g.fillStyle = '#887'; g.font = '14px system-ui'; g.fillText('—', x + 10, y + 30); }
        g.fillStyle = c.bad ? '#ff7b6b' : '#8fa1ae'; g.font = '12px ui-monospace, Menlo, monospace'; g.fillText(c.sub || '', x + 5, y + ch + 15); } }
    return cv.toDataURL('image/jpeg', .9); }, { title, rows, cols, cw, ch, heads });
}
try {
  const now = await run(root, 'N'), before = opt.before ? await run(opt.before, 'B') : null;
  const worn = Object.entries(now.info), wrong = worn.filter(([l, h]) => !h.authored || h.set !== h.expect || !h.worn || h.worn.legacy || !h.worn[l.startsWith('CT') ? 'ct' : 't'] || h.worn[l.startsWith('CT') ? 't' : 'ct']);
  check('every cell: the item\'s CS2 set in hand, wearing that side\'s CS2 arms (CT: SAS, T: Phoenix), not the old glove', worn.length === PLAN.length && !wrong.length, wrong.map(([l, h]) => l + ' ' + JSON.stringify(h)).join(' | ') || worn.map(([l, h]) => l + ': ' + h.set).join(' · '));
  check('the arms\' pictures on the GPU before the view shows them (loaded with the sets, not mid-round)', worn.every(([, h]) => h.all > 0 && h.up === h.all), worn.map(([l, h]) => l + ' ' + h.up + '/' + h.all).join(' · '));
  check('their own reflections: the gun\'s studio box (fpEnv) at ARM_LOOK\'s share per part, not the scene\'s room at three.js\'s environmentIntensity', worn.every(([, h]) => h.env === true), worn.map(([l, h]) => l + ' ' + h.env).join(' · '));
  // How they read (idle, Dust II's sun): bare skin tan, not clipped (CS2 render: mean R 143–178, nothing at R ≥ 250; v52
  // before the light/grade path: mean R 234, 11 % at R ≥ 250); a black glove no lighter than ~1.3× the black slide
  // beside it (CS2 render ~1.2; ungraded and unshadowed it read 1.35× — light grey).
  const skins = worn.filter(([, h]) => h.look?.skin?.px > 500).map(([l, h]) => [l, h.look.skin]), usp = now.info['CT · USP-S']?.look, ratio = usp?.glove?.lum && usp?.gun?.lum ? usp.glove.lum / usp.gun.lum : null;
  check('bare forearms (T) tan, not clipped: R ≥ 250 on ≤ 2 % of their pixels, mean R ≤ 215', skins.length > 0 && skins.every(([, s]) => s.clip <= 2 && s.rgb[0] <= 215), skins.map(([l, s]) => `${l} rgb ${s.rgb} clip ${s.clip}% (${s.px} px)`).join(' · ') || 'no skin measured');
  check('the black Hardknuckle glove reads black beside the USP-S slide (luminance ratio ≤ 1.3)', ratio !== null && ratio <= 1.3, usp ? `glove ${JSON.stringify(usp.glove)} gun ${JSON.stringify(usp.gun)} ratio ${ratio?.toFixed(2)}` : 'not measured');
  const cs2 = opt.cs2, cs2img = (side, id, fr) => { const f = cs2 && path.join(cs2, `cs2_${side}_${id}_${fr}.jpg`); return f && existsSync(f) ? 'data:image/jpeg;base64,' + readFileSync(f).toString('base64') : null; };
  const rows = []; for (const [side, id, expect, label] of PLAN) for (const fr of ['idle', id === 'knife' ? 'inspect' : 'reload']) { const k = label + '|' + fr;
    rows.push({ label, frame: fr === 'idle' ? 'idle' : fr === 'reload' ? 'reload · 0.95 s' : 'inspect · 1.0 s', cells: [{ src: cs2img(side, expect, fr), sub: cs2 ? 'CS2 files, Blender studio light' : 'no render' }, { src: before?.shots[k], sub: before ? 'v51: Driver Gloves picture, camo shirt' : 'not run' }, { src: now.shots[k], sub: 'now: CS2 ' + (side === 'ct' ? 'SAS · Hardknuckle' : 'Phoenix · Full-finger') }] }); }
  const P = await b.newPage(); await P.setContent('<html><body></body></html>');
  const file = path.join(out, 'GD-v52-gloves-vs-CS2.jpg'), url = await compose(P, 'GLOBAL DEFENSIVE v52 · FIRST-PERSON GLOVES, HANDS AND SLEEVES vs CS2', rows, 3, 480, 300, ['CS2 maps in Blender (not CS2\'s renderer)', 'v51 (released)', 'now (v52)']);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); if (opt.desktop) copyFileSync(file, path.join(os.homedir(), 'Desktop', 'GD-v52-gloves-vs-CS2.jpg')); console.log('sheet: ' + file);
  for (const [k, v] of Object.entries(now.shots)) writeFileSync(path.join(out, 'now_' + k.replace(/[^a-z0-9]+/gi, '_') + '.jpg'), Buffer.from(v.split(',')[1], 'base64'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { check('ran to the end', false, e.stack || e.message); }
console.log((ok === n ? 'PASS' : 'FAIL') + ': gloves sheet · ' + ok + '/' + n); await b.close(); for (const s of servers) s.kill(); if (ok !== n) process.exitCode = 1;
