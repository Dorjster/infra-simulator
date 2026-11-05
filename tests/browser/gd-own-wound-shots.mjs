// Global Defensive · your own wound (v53 FEEDBACK; the user, 2026-11-05: "no blood should be on own wound only red
// barrier something with 4 side") — the picture run, in the real game (practice, Dust II, your own view at 1920 × 1080):
// host-shaped records on YOU (v = your key, as the host's bleed writes them) from the front, the side (your right),
// behind, and a killing hit from the front-left diagonal (k: 1, 100 damage, with your down record as the host writes it
// at a death: the death cam starts — practice has no combat.d, the respawn-mode path; the HUD keeps only the indicator,
// class dc — v53 FEEDBACK final). Each is held 150 ms into CS2's damage
// indicator's fade (the CSS animation paused there) and pictured full frame; a labelled 2 × 2 sheet goes to
// <out>/GD-v53-own-wound.jpg (and ~/Desktop when DESKTOP=1). Checks: the blood module has no screen pool; each hit lit
// the expected segments (diagonal: two); no spray, no new scene object; away from the indicator's ring the frame is the
// same as with no hit (no blood anywhere on your screen); the lit segment's place is red; no shader compiled during
// play; no page errors. Muted Chrome (bt2.sh).
//   node tests/browser/gd-own-wound-shots.mjs <repo-root> <out-dir> [map=dust2]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-own-wound-shots'), MAP = 'dust2'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDOW01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdow-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], cerrs = [], report = { cases: {} }; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
const frames = [];
try {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text().slice(0, 200)); });   // (console errors: shown only if the run itself fails) p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '0').catch(() => p.selectOption('#ss-ar-bots', '1')); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(3000);
  for (let k = 0; k < 6; k++) { const open = await p.evaluate(() => { const el = document.getElementById('ar-buy'); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }); if (!open) break; await p.evaluate(() => { __infra.lab.arenaUI?.buy?.(false); document.querySelector('#ar-buy [data-act="close"]')?.click(); }); await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(400); await p.evaluate(() => __infra.lab.enter?.()); await p.waitForTimeout(300); }
  await p.evaluate(() => { const A = __infra.lab.world.operations.game.arena; if (A?.practice) { A.practice.bots = 'stand'; A.practice.impacts = false; } });
  check('the blood module is in the game with no screen pool (its warm-up: the spray, the decals, the dink)', await p.evaluate(() => !!globalThis.__gdBlood && __gdBlood.warmObjects().length === 3 && !('local' in __gdBlood)));
  check('CS2\'s damage indicator is in the HUD: four segments', await p.evaluate(() => document.querySelectorAll('.gd-da i').length === 4));
  const progs0 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1), kids0 = await p.evaluate(() => __infra.scene?.children?.length ?? -1);
  // your view's level forward and right; a record on you from direction `from` (unit, level): the bullet travels −from
  const view = await p.evaluate(() => { const d = new __infra.camera.position.constructor(); __infra.camera.getWorldDirection(d); d.y = 0; d.normalize(); const c = __infra.camera.position; return { f: [d.x, d.z], r: [-d.z, d.x], at: [c.x, c.y - 1.5, c.z] }; });
  const clean = path.join(out, 'own-wound-none.jpg'); await p.waitForTimeout(300); await p.screenshot({ path: clean, type: 'jpeg', quality: 92 });
  const record = (from, o) => p.evaluate(([from, at, o]) => { const C = __infra.lab.world.operations.game.combat; if (!C) return null; const r = { i: Date.now() + Math.floor(Math.random() * 1000), at: Date.now(), v: 'tester', z: 'chest', d: 45, p: at.map(x => Math.round(x * 100) / 100), r: [-from[0], 0, -from[1]].map(x => Math.round(x * 1000) / 1000), s: 'bot', ...o }; (C.bl ||= []).push(r); return r; }, [from, view.at, o]);
  const SEG = ['top', 'right', 'bottom', 'left'];
  const shoot = async (label, file, make, want, death = false) => {
    const cls0 = await p.evaluate(() => [...document.querySelectorAll('.gd-da i')].map(e => e.className)), h0 = await p.evaluate(() => __gdBlood.stats.hits); await make();
    await p.waitForFunction(c => [...document.querySelectorAll('.gd-da i')].some((e, j) => e.className !== c[j]), cls0, { timeout: 4000 }).catch(() => {});
    const lit = await p.evaluate(c => { const L = [...document.querySelectorAll('.gd-da i')], on = L.map((e, j) => e.className !== c[j] ? j : -1).filter(j => j >= 0); on.forEach(j => L[j].getAnimations().forEach(a => { a.pause(); a.currentTime = 150; })); return on; }, cls0);   // (only the segments this hit lit: an earlier one's finished animation stays at its end)
    const names = lit.map(j => SEG[j]).join('+'); check(`${label}: the indicator lit ${names || 'nothing'} (want ${want})`, names === want);
    const st = await p.evaluate(() => ({ hits: __gdBlood.stats.hits, spray: __gdBlood.stats.sprayAlive, kids: __infra.scene?.children?.length ?? -1 }));
    check(`${label}: the blood took the record, no spray in your view, no new scene object`, st.hits > h0 && !st.spray && st.kids === kids0, JSON.stringify(st));
    if (death) {   // (v53 FEEDBACK final: a real death's shape in a respawn mode — the death cam on, the HUD's box kept up with only the indicator)
      await p.waitForFunction(() => !!__infra.lab.spectator?.on && document.getElementById('gd-hud').classList.contains('dc'), null, { timeout: 4000 }).catch(() => {});
      const st2 = await p.evaluate(l => { const R = document.getElementById('gd-hud'), L = [...document.querySelectorAll('.gd-da i')], vb = R.querySelector('.vb'); return { cam: !!__infra.lab.spectator?.on, dc: R.classList.contains('dc'), shown: !R.hidden && getComputedStyle(R).display !== 'none', vb: vb ? getComputedStyle(vb).visibility : '?', x: getComputedStyle(document.getElementById('gd-x')).visibility, op: l.map(j => +getComputedStyle(L[j]).opacity) }; }, lit);
      check(`${label}: dead in the death cam (practice: no combat.d) the indicator stays on screen, everything else of the HUD hidden`, st2.cam && st2.dc && st2.shown && st2.vb === 'hidden' && st2.x === 'hidden' && st2.op.length && st2.op.every(o => o > .5), JSON.stringify(st2)); }
    await p.waitForTimeout(250); const f = path.join(out, `own-wound-${file}.jpg`); await p.screenshot({ path: f, type: 'jpeg', quality: 92 }); frames.push({ f, label, lit, death });
    await p.evaluate(() => document.querySelectorAll('.gd-da i').forEach(e => e.getAnimations().forEach(a => a.finish()))); await p.waitForTimeout(500); };
  const rot = (v, deg) => { const a = deg * Math.PI / 180; return [v[0] * Math.cos(a) + view.r[0] * Math.sin(a), v[1] * Math.cos(a) + view.r[1] * Math.sin(a)]; };   // (forward turned `deg` toward your right)
  await shoot('FRONT, 45 damage', 'front', () => record(view.f, {}), 'top');
  await shoot('SIDE (your right), 45 damage', 'side', () => record(rot(view.f, 90), {}), 'right');
  await shoot('REAR, 45 damage', 'rear', () => record([-view.f[0], -view.f[1]], {}), 'bottom');
  { const progs1 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1); report.programs = [progs0, progs1]; check('no shader compiled during play (the hits on you)', progs0 < 0 || progs1 === progs0, progs0 + ' → ' + progs1); }
  // the killing hit: the host's shape of a death in a respawn mode — your down record (the death cam starts) and the k: 1 record together
  await shoot('KILLING HIT from the front-left diagonal, 100 damage (dead: death cam)', 'kill', async () => { await p.evaluate(() => { const C = __infra.lab.world.operations.game.combat, now = Date.now(); (C.down ||= {}).tester = { until: now + 6000, at: now, by: 'Bot', wid: 'ak47', head: false }; if (C.hp) C.hp.tester = 0; }); await record(rot(view.f, -45), { d: 100, k: 1 }); }, 'top+left', true);
  // pixels: outside the indicator's square (300 px at 1080 p, round the centre) each frame matches the clean one (no blood anywhere
  // on your screen); inside, the lit segments' band (radius 127–147 px, 5 px up) is red
  { const q = await b.newPage({ viewport: { width: 400, height: 300 } }); const res = await q.evaluate(async ([a, list]) => { const load = s => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = s; });
      const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const x = c.getContext('2d', { willReadFrequently: true }), px = im => { x.drawImage(im, 0, 0); return x.getImageData(0, 0, 1920, 1080).data; }, A = px(await load(a)), out = [];
      for (const s of list) { const d = px(await load(s.src)); let sum = 0, cnt = 0; const red = [0, 0, 0, 0], all = [0, 0, 0, 0];
        for (let y = 0; y < 1080; y += 2) for (let X = 0; X < 1920; X += 2) { const i = (y * 1920 + X) * 4, dx = X - 960, dy = y - 540;
          if (Math.abs(dx) > 170 || Math.abs(dy) > 175) { sum += Math.abs(d[i] - A[i]) + Math.abs(d[i + 1] - A[i + 1]) + Math.abs(d[i + 2] - A[i + 2]); cnt++; continue; }
          const ang = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360, k = Math.round(ang / 90) % 4, r = Math.hypot(dx - [0, 5, 0, -5][k], dy - [-5, 0, 5, 0][k]); if (r < 129 || r > 145) continue; if (Math.abs(((ang - k * 90 + 540) % 360) - 180) > 40) continue;   // (each segment 5 px out along its own side — gd-hit-feedback.js)
          all[k]++; if (d[i] > 150 && d[i + 1] < 95 && d[i + 2] < 35) red[k]++; }   // (the indicator's own colour, #cc3300 over the scene: Dust II's orange walls and the death cam's red tint are not it)
        out.push({ outside: sum / cnt / 3, red: red.map((v, k) => all[k] ? v / all[k] : 0) }); }
      return out; }, ['data:image/jpeg;base64,' + readFileSync(clean).toString('base64'), frames.map(f => ({ death: !!f.death, src: 'data:image/jpeg;base64,' + readFileSync(f.f).toString('base64') }))]); await q.close();
    res.forEach((r, k) => { const fr = frames[k]; report.cases[fr.label] = r;
      if (!fr.death) check(`${fr.label}: no blood on your screen — away from the indicator the frame is as with no hit (mean difference ${r.outside.toFixed(2)} of 255)`, r.outside < 3, r.outside);   // (the death cam moves the view: that frame is checked by the HUD's state above and the red band)
      check(`${fr.label}: the lit segments are red there (${r.red.map(v => (v * 100).toFixed(0) + '%').join(' / ')}), the others not`, [0, 1, 2, 3].every(j => fr.lit.includes(j) ? r.red[j] > .3 : r.red[j] < .1), r.red.join()); }); }
  // the sheet: 2 × 2 panels (each the full frame at half size) with labels
  const imgs = frames.map(fr => ({ label: fr.label + ' — lit: ' + fr.lit.map(j => SEG[j]).join(' + '), src: 'data:image/jpeg;base64,' + readFileSync(fr.f).toString('base64') }));
  const q = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  const jpg = await q.evaluate(async imgs => { const L = await Promise.all(imgs.map(i => new Promise(r => { const im = new Image(); im.onload = () => r({ ...i, im }); im.src = i.src; })));
    const cw = 960, ch = 540, cols = 2, rows = Math.ceil(L.length / cols), top = 74, lab = 30, c = document.createElement('canvas'); c.width = cw * cols; c.height = top + rows * (ch + lab); const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.fillText('Global Defensive v53 — your own wound: NO blood on your screen, only CS2\'s red 4-segment damage indicator', 14, 30);
    x.font = '15px sans-serif'; x.fillStyle = '#bbb'; x.fillText('Dust II practice, 1920 × 1080, muted Chrome. Host-shaped hit records on you (the kill with your down record: the death cam); each held 150 ms into the indicator\'s fade. Indicator: huddamageindicator.vcss (300 px, #cc3300, two bands, 90° wedges).', 14, 56);
    L.forEach((e, k) => { const ox = (k % cols) * cw, oy = top + Math.floor(k / cols) * (ch + lab); x.fillStyle = '#ffd76a'; x.font = 'bold 16px sans-serif'; x.fillText(e.label, ox + 8, oy + 21); x.drawImage(e.im, ox, oy + lab, cw, ch); x.strokeStyle = '#333'; x.strokeRect(ox + .5, oy + lab + .5, cw - 1, ch - 1); });
    return c.toDataURL('image/jpeg', .92); }, imgs);
  const sheet = path.join(out, 'GD-v53-own-wound.jpg'); writeFileSync(sheet, Buffer.from(jpg.split(',')[1], 'base64')); console.log('sheet', sheet);
  if (process.env.DESKTOP === '1') { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-own-wound.jpg'); copyFileSync(sheet, d); console.log('→', d); }
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
} catch (e) { console.log('FAIL run: ' + e.message + (errs.length || cerrs.length ? ' · page errors: ' + errs.concat(cerrs).slice(0, 5).join(' | ') : '')); failed++; }
finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-own-wound-shots · ${failed}` : 'PASS: gd-own-wound-shots'); process.exit(failed ? 1 : 0);
