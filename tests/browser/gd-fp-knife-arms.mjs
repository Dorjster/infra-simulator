// First-person knife swings with CS2's arms (user report "when doing slash and mouse 1 and mouse2 with knife arms are
// looks broken"): every knife (CT default, T default, karambit, butterfly, M9, stiletto) on each side, posed at fixed
// moments of its light (mouse 1) and heavy (mouse 2) clip, plus idle and inspect, as the game draws them in a real
// Practice match. The set's own update is paused and stepped to each moment, so every build shows the same pose.
// Columns now | before (`before=<repo>`, e.g. the released v51). Writes a contact sheet and each frame.
//   node tests/browser/gd-fp-knife-arms.mjs <repo-root> <out-dir> [before=<older repo>] [map=dust2] [sides=ct,t] [knives=default,karambit,butterfly,m9,stiletto] [guns=0] [desktop=<file name>]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-fp-knife-arms'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('=')));
const man = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'manifest.json'), 'utf8')); } catch { return null; } })();
if (!man?.models?.viewmodels?.cs2_knife) { console.log('SKIP: no CS2 first-person sets on this computer'); process.exit(0); }
const servers = [];
async function serve(dir, code) { const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: dir, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: code, HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gka-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] }); servers.push(s);
  return new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); })); }
process.on('exit', () => { for (const s of servers) try { s.kill(); } catch {} });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 600) : '')); }; const errs = [];
const VW = 1200, VH = 750, SIDES = (opt.sides || 'ct,t').split(','), KNIVES = (opt.knives || 'default,karambit,butterfly,m9,stiletto').split(',');
// [clip, seconds into it, label]
export const POSES = [['idle', .4, 'idle'], ['light', .12, 'M1 .12s'], ['light', .3, 'M1 .30s'], ['light', .45, 'M1 .45s'], ['light', .65, 'M1 .65s'], ['heavy', .15, 'M2 .15s'], ['heavy', .35, 'M2 .35s'], ['heavy', .5, 'M2 .50s'], ['heavy', .7, 'M2 .70s'], ['inspect', 1.6, 'inspect 1.6s']];
// A rifle on each side too (KNIFE-verify: the forearm twist fix runs on every set) — the side's own rifle (CT M4A4, T AK-47), bought in the Practice match. guns=0 leaves it out.
export const GUN_POSES = [['idle', .4, 'idle'], ['fire', .03, 'fire .03s'], ['fire', .08, 'fire .08s'], ['fire', .15, 'fire .15s'], ['reload', .4, 'reload .4s'], ['reload', .9, 'reload .9s'], ['reload', 1.4, 'reload 1.4s'], ['reload', 1.9, 'reload 1.9s'], ['reload', 2.3, 'reload 2.3s'], ['inspect', 1.6, 'inspect 1.6s']];
const GUNS = opt.guns !== '0';
const spots = {};
async function run(repo, tag) {
  const base = await serve(repo, 'GDKA' + tag), shots = {}, info = {};
  for (const side of SIDES) {
    const G = await b.newPage({ viewport: { width: VW, height: VH } }); G.on('pageerror', e => errs.push(tag + ': ' + e.message)); G.on('dialog', d => d.accept());
    await G.goto(base + '/'); await G.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 });
    const name = await G.evaluate(async side => { const { sideOf } = await import('/gd-soldiers.js'); for (const n of ['Viewer', 'Tessa', 'Ivan', 'Mara', 'Otto', 'Lena', 'Bora', 'Dash']) if (sideOf(n) === side) return n; return 'Viewer'; }, side);
    await G.evaluate(n => { localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); localStorage.setItem('infra-face', 'smile'); }, name); await G.reload(); await G.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await G.waitForTimeout(1200);
    await G.evaluate(() => document.querySelector('[data-start=arena]').click()); await G.waitForTimeout(400); await G.selectOption('#ss-ar-kind', 'practice'); await G.waitForTimeout(200); await G.selectOption('#ss-ar-map', opt.map || 'dust2').catch(() => G.selectOption('#ss-ar-map', 'yard')); await G.selectOption('#ss-ar-bots', '0').catch(() => {}); await G.evaluate(() => document.getElementById('ss-ar-solo').click());
    await G.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 }); await G.waitForTimeout(1500);
    if (await G.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await G.keyboard.press('Escape'); await G.waitForTimeout(300);
    spots[side] = await G.evaluate(s => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()); s ??= { x: c.position.x, y: c.position.y, z: c.position.z, tx: c.position.x + d.x * 20, ty: c.position.y + d.y * 20, tz: c.position.z + d.z * 20 };
      try { __infra.lab.look(s.x, s.z, s.tx, s.ty, s.tz, s.y); } catch {} return s; }, spots[side] || null); await G.waitForTimeout(500);
    await G.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); const st = document.createElement('style'); st.textContent = '#ar-buy,#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar,#crosshair,.crosshair,#gd-killfeed{visibility:hidden!important}'; document.head.appendChild(st); });
    for (const knife of KNIVES) {
      const label = side.toUpperCase() + ' · ' + knife;
      const h = await G.evaluate(async ({ knife }) => { const P = __infra.lab.pistol, F = await import('/fp-view.js'), { arenaArsenalOf } = await import('/combat-logic.js'), game = () => __infra.lab.world.operations.game, me = String(localStorage.getItem('infra-name'));
        let r; try { r = String(await __infra.lab.lan.act({ type: 'arena', action: { type: 'knife', knife } })); } catch (e) { r = 'ERR ' + (e?.message || e); }
        const id = knife === 'karambit' ? 'karambit' : 'knife';
        for (let i = 0; i < 40 && !arenaArsenalOf(game(), me).includes(id); i++) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 300)); P.equip(null); await new Promise(r => setTimeout(r, 60)); P.equip(id); for (let i = 0; i < 60 && !(P.current?.id === id && P.viewInfo.authored); i++) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 1500)); const f = F.fpFor(id, P.viewInfo.set);
        const worn = f?.worn ? { ct: f.worn.ct.visible, t: f.worn.t.visible, legacy: f.worn.legacy.some(o => o.visible) } : null;
        if (f) { f.__u ??= f.update; f.update = () => {}; }   // (held still: posed by the test only)
        return { r, id, cur: P.current?.id, set: P.viewInfo.set, authored: P.viewInfo.authored, worn }; }, { knife });
      info[label] = h;
      for (const [clip, t, pl] of POSES) {
        const posed = await G.evaluate(async ({ id, clip, t }) => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(id, P.viewInfo.set); if (!f?.__u) return false; f.swing(clip); f.__u(t); return true; }, { id: h.id, clip, t });
        await G.waitForTimeout(160); shots[label + '|' + pl] = posed ? 'data:image/jpeg;base64,' + (await G.screenshot({ type: 'jpeg', quality: 85 })).toString('base64') : null; }
      await G.evaluate(async ({ id }) => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(id, P.viewInfo.set); if (f?.__u) { f.update = f.__u; delete f.__u; } }, { id: h.id });
    }
    if (GUNS) { const label = side.toUpperCase() + ' · rifle';
      const h = await G.evaluate(async ({ side }) => { const P = __infra.lab.pistol, F = await import('/fp-view.js'), { arenaArsenalOf } = await import('/combat-logic.js'), game = () => __infra.lab.world.operations.game, me = String(localStorage.getItem('infra-name')), id = side === 't' ? 'ak' : 'm4';
        let r; try { r = JSON.stringify(await __infra.lab.lan.act({ type: 'arena', action: { type: 'buy', primary: id } })); } catch (e) { r = 'ERR ' + (e?.message || e); }
        for (let i = 0; i < 40 && !arenaArsenalOf(game(), me).includes(id); i++) await new Promise(r => setTimeout(r, 100));
        P.equip(null); await new Promise(r => setTimeout(r, 60)); P.equip(id); for (let i = 0; i < 60 && !(P.current?.id === id && P.viewInfo.authored); i++) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 1500)); const f = F.fpFor(id, P.viewInfo.set);
        const worn = f?.worn ? { ct: f.worn.ct.visible, t: f.worn.t.visible, legacy: f.worn.legacy.some(o => o.visible) } : null;
        if (f) { f.__u ??= f.update; f.update = () => {}; }
        return { r, id, cur: P.current?.id, set: P.viewInfo.set, authored: P.viewInfo.authored, worn }; }, { side });
      info[label] = h;
      for (const [clip, t, pl] of GUN_POSES) {
        const posed = await G.evaluate(async ({ id, clip, t }) => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(id, P.viewInfo.set); if (!f?.__u) return false; f.swing(clip); f.__u(t); return true; }, { id: h.id, clip, t });
        await G.waitForTimeout(160); shots[label + '|' + pl] = posed ? 'data:image/jpeg;base64,' + (await G.screenshot({ type: 'jpeg', quality: 85 })).toString('base64') : null; }
      await G.evaluate(async ({ id }) => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(id, P.viewInfo.set); if (f?.__u) { f.update = f.__u; delete f.__u; } }, { id: h.id });
    }
    await G.close();
  }
  return { shots, info };
}
async function compose(p, title, rows, heads, cw, ch) {
  return p.evaluate(async ({ title, rows, heads, cw, ch }) => {
    const pad = 4, lab = 18, head = 64, left = 130, cols = heads.length, W = left + cols * (cw + pad) + pad, H = head + rows.length * (ch + lab + pad) + pad, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#14181c'; g.fillRect(0, 0, W, H); g.fillStyle = '#f0b232'; g.font = 'bold 24px system-ui'; g.fillText(title, pad + 4, 30);
    g.fillStyle = '#9fb3c3'; g.font = 'bold 15px system-ui'; heads.forEach((h, i) => g.fillText(h, left + pad + i * (cw + pad) + 4, 56));
    const img = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
    for (const [ri, r] of rows.entries()) { const y = head + ri * (ch + lab + pad); g.fillStyle = '#e6edf2'; g.font = 'bold 14px system-ui'; g.fillText(r.label, pad + 4, y + ch / 2); g.fillStyle = '#8fa1ae'; g.font = '12px system-ui'; g.fillText(r.sub || '', pad + 4, y + ch / 2 + 18);
      for (const [ci, c] of r.cells.entries()) { const x = left + pad + ci * (cw + pad), im = await img(c.src); g.fillStyle = '#20262c'; g.fillRect(x, y, cw, ch + lab); if (im) g.drawImage(im, im.width * .25, im.height * .3, im.width * .75, im.height * .7, x, y, cw, ch); else { g.fillStyle = '#887'; g.font = '14px system-ui'; g.fillText('—', x + 10, y + 30); }
        g.fillStyle = '#8fa1ae'; g.font = '11px ui-monospace, Menlo, monospace'; g.fillText(c.sub || '', x + 4, y + ch + 13); } }
    return cv.toDataURL('image/jpeg', .88); }, { title, rows, heads, cw, ch });
}
try {
  const now = await run(root, 'N'), before = opt.before ? await run(opt.before, 'B') : null;
  const gunInfo = Object.entries(now.info).filter(([l]) => l.endsWith('rifle'));
  if (GUNS) check('each side\'s rifle: its CS2 set in hand wearing that side\'s CS2 arms', gunInfo.length === SIDES.length && gunInfo.every(([l, h]) => h.authored && h.worn && !h.worn.legacy && h.worn[l.startsWith('CT') ? 'ct' : 't']), gunInfo.map(([l, h]) => l + ' ' + h.id + ' ' + h.set + ' ' + JSON.stringify(h.worn) + ' buy ' + h.r).join(' | '));
  const got = Object.entries(now.info).filter(([l]) => !l.endsWith('rifle')), wrong = got.filter(([l, h]) => !h.authored || !h.worn || h.worn.legacy || !h.worn[l.startsWith('CT') ? 'ct' : 't']);
  check('every knife: its CS2 set in hand wearing that side\'s CS2 arms', got.length === SIDES.length * KNIVES.length && !wrong.length, got.map(([l, h]) => l + ' ' + h.set + ' ' + JSON.stringify(h.worn)).join(' | '));
  for (const [k, v] of Object.entries(now.shots)) if (v) writeFileSync(path.join(out, 'now_' + k.replace(/[^a-z0-9]+/gi, '_') + '.jpg'), Buffer.from(v.split(',')[1], 'base64'));
  if (before) for (const [k, v] of Object.entries(before.shots)) if (v) writeFileSync(path.join(out, 'before_' + k.replace(/[^a-z0-9]+/gi, '_') + '.jpg'), Buffer.from(v.split(',')[1], 'base64'));
  const rows = []; for (const side of SIDES) for (const knife of KNIVES) { const label = side.toUpperCase() + ' · ' + knife;
    rows.push({ label, sub: 'now · ' + (now.info[label]?.set || '?'), cells: POSES.map(([, , pl]) => ({ src: now.shots[label + '|' + pl], sub: pl })) });
    if (before) rows.push({ label, sub: 'before · ' + (before.info[label]?.set || '?'), cells: POSES.map(([, , pl]) => ({ src: before.shots[label + '|' + pl], sub: pl })) }); }
  if (GUNS) for (const side of SIDES) { const label = side.toUpperCase() + ' · rifle';
    rows.push({ label, sub: 'now · ' + (now.info[label]?.set || '?'), cells: GUN_POSES.map(([, , pl]) => ({ src: now.shots[label + '|' + pl], sub: pl })) });
    if (before) rows.push({ label, sub: 'before · ' + (before.info[label]?.set || '?'), cells: GUN_POSES.map(([, , pl]) => ({ src: before.shots[label + '|' + pl], sub: pl })) }); }
  const P = await b.newPage(); await P.setContent('<html><body></body></html>');
  const file = path.join(out, 'GD-fp-knife-arms.jpg'), url = await compose(P, 'GLOBAL DEFENSIVE · FIRST-PERSON KNIFE SWINGS (M1 light · M2 heavy) — arms', rows, POSES.map(p => p[2]), 270, 168);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); if (opt.desktop) copyFileSync(file, path.join(os.homedir(), 'Desktop', opt.desktop)); console.log('sheet: ' + file);
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { check('ran to the end', false, e.stack || e.message); }
console.log((ok === n ? 'PASS' : 'FAIL') + ': knife arms sheet · ' + ok + '/' + n); await b.close(); for (const s of servers) s.kill(); if (ok !== n) process.exitCode = 1;
