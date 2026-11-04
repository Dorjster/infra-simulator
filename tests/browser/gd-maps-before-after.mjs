// Global Defensive maps, before and after v53 stage 5 — a picture run: the same view on each map (practice, no bots: from
// the first Terrorist spawn toward the Counter-Terrorists' at eye height) drawn by 52.0.5 (a tree given as <before-root>,
// e.g. `git archive d2e74af | tar -x`, with this checkout's user-assets / user-maps linked in) and by this checkout; in
// this checkout the view's wall then takes three shots (CS2's impacts and holes, gd-impacts.js). A labelled sheet goes to
// <out>/GD-v53-maps.jpg (and ~/Desktop when DESKTOP=1). Muted Chrome (bt2.sh).
//   node tests/browser/gd-maps-before-after.mjs <repo-root> <out-dir> <before-root> [maps=dust2,mirage,nuke]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-maps-ba'), before = null, maps = 'dust2,mirage,nuke'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
if (!before) { console.log('FAIL: give the 52.0.5 tree as <before-root>'); process.exit(1); }
const MAPS = maps.split(','), shots = []; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
async function run(tree, tag) {
  const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: tree, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDBA' + tag.slice(0, 2).toUpperCase(), HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdba-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serr = ''; server.stderr.on('data', d => { serr += d; });
  try {
    const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
    for (const MAP of MAPS) { const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
      await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
      await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(800);
      await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
      await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
      await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
      await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(2500);
      for (let k = 0; k < 6; k++) { const open = await p.evaluate(() => { const el = document.getElementById('ar-buy'); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }); if (!open) break; await p.evaluate(() => { __infra.lab.arenaUI?.buy?.(false); document.querySelector('#ar-buy [data-act="close"]')?.click(); }); await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(400); await p.evaluate(() => __infra.lab.enter?.()); await p.waitForTimeout(300); }
      const view = await p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'); const M = ARENA_MAPS[__infra.lab.world.operations.game.arena.map]; const t = M.t[0], c = M.ct[0];
        const f = M.nav.floorAt(t[0], t[1]), eye = [ARENA.cx + t[0], f + 9.7, ARENA.cz + t[1]], dx = c[0] - t[0], dz = c[1] - t[1], l = Math.hypot(dx, dz) || 1, to = [eye[0] + dx / l * 40, eye[1] - 1.5, eye[2] + dz / l * 40]; return { eye, to }; });
      const aim = () => p.evaluate(({ eye, to }) => { __infra.lab.look(eye[0], eye[2], to[0], to[1], to[2], eye[1]); __infra.camera.position.set(...eye); __infra.camera.lookAt(...to); }, view);
      for (let k = 0; k < 4; k++) { await aim(); await p.waitForTimeout(300); }
      let fired = 0; if (tag === 'after') { for (let k = 0; k < 3; k++) { await aim(); if (await p.evaluate(() => __infra.lab.pistol.fire())) fired++; await p.waitForTimeout(320); } await p.waitForTimeout(200); await aim(); await p.evaluate(() => globalThis.__gdImpacts?.hold(__gdImpacts.lastAt + .09)); await p.waitForTimeout(150); }
      const f = path.join(out, `${MAP}-${tag}.jpg`); await p.screenshot({ path: f, type: 'jpeg', quality: 86 }); if (tag === 'after') await p.evaluate(() => globalThis.__gdImpacts?.release());
      const st = tag === 'after' ? await p.evaluate(() => __gdImpacts.stats) : null;
      shots.push({ f, map: MAP, tag, label: `${MAP} · ${tag === 'before' ? '52.0.5' : 'v53 stage 5' + (fired ? ` — ${fired} shots at the wall: CS2 impacts + holes (${st?.holes ?? 0})` : '')}` });
      check(`${tag}: ${MAP} drawn, no page errors`, !errs.length, errs.slice(0, 3).join(' | ')); await p.close(); }
  } finally { server.kill(); }
}
try { await run(path.resolve(before), 'before'); await run(path.resolve(root), 'after'); } catch (e) { console.log('FAIL run: ' + e.message); failed++; }
const q = await b.newPage({ viewport: { width: 1600, height: 1200 } });
const imgs = shots.map(s => ({ label: s.label, row: MAPS.indexOf(s.map), col: s.tag === 'before' ? 0 : 1, src: 'data:image/jpeg;base64,' + readFileSync(s.f).toString('base64') }));
const jpg = await q.evaluate(async ({ imgs, rows }) => { const L = await Promise.all(imgs.map(i => new Promise(r => { const im = new Image(); im.onload = () => r({ ...i, im }); im.src = i.src; })));
  const cw = 960, ch = 540, c = document.createElement('canvas'); c.width = cw * 2; c.height = ch * rows + 60; const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.fillText('Global Defensive maps — 52.0.5 (left) and v53 stage 5 (right), the same view', 20, 42);
  for (const { im, label, row, col } of L) { const ox = col * cw, oy = 60 + row * ch; x.drawImage(im, ox, oy, cw, ch); x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(ox, oy + ch - 40, cw, 40); x.fillStyle = '#ffd76a'; x.font = 'bold 21px sans-serif'; x.fillText(label, ox + 12, oy + ch - 13); }
  return c.toDataURL('image/jpeg', .9); }, { imgs, rows: MAPS.length });
const sheet = path.join(out, 'GD-v53-maps.jpg'); writeFileSync(sheet, Buffer.from(jpg.split(',')[1], 'base64')); console.log('sheet', sheet);
if (process.env.DESKTOP === '1') { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-maps.jpg'); copyFileSync(sheet, d); console.log('→', d); }
await b.close();
console.log(failed ? `FAIL: gd-maps-before-after · ${failed}` : 'PASS: gd-maps-before-after'); process.exit(failed ? 1 : 0);
