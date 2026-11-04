// Global Defensive bullet impacts in the real game (practice, one bot) — a picture run for v53 stage 5 / ADDENDUM 6:
// the game's own gun (lab.pistol.fire: the trace → the shared effects → gd-impacts.js) fired at a metal, a concrete, a
// wood and a sand surface of the map, each pictured just after its impact (the impacts' clock held a moment after the
// impact was drawn, so the picture shows CS2's burst at that age), then a headshot on the bot: with a helmet (the host's
// record hm) CS2's dink sparks, else the blood. A labelled sheet of the frames goes to <out>/GD-v53-impacts.jpg (and to
// ~/Desktop when DESKTOP=1). Muted Chrome (bt2.sh).
//   node tests/browser/gd-impacts-shots.mjs <repo-root> <out-dir> [map=dust2] [dsf=1]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-impacts-shots'), MAP = 'dust2', dsf = '1'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDIM01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdim-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], report = { shots: {} }; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
const frames = [];   // ({ f, row, age }: three crops a row)
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: +dsf }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '1'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(3000);
  // the buy menu (Deathmatch practice opens it): shut, and kept shut for the pictures
  for (let k = 0; k < 6; k++) { const open = await p.evaluate(() => { const el = document.getElementById('ar-buy'); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }); if (!open) break; await p.evaluate(() => { __infra.lab.arenaUI?.buy?.(false); document.querySelector('#ar-buy [data-act="close"]')?.click(); }); await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(400); await p.evaluate(() => __infra.lab.enter?.()); await p.waitForTimeout(300); }
  // ADDENDUM 11's "stray dark translucent square next to the crosshair": practice's recoil panel (arena-practice.js #gd-recoil, your
  // spray as dots, stage 2 — CS2 has no such panel); hidden for these pictures
  await p.addStyleTag({ content: '#gd-recoil{display:none!important}' });
  check('the impacts module is in the game', await p.evaluate(() => !!globalThis.__gdImpacts && __gdImpacts.warmObjects().length === 3));
  // Spots: from walkable floor near the spawns, rays a little down from eye height; the first face of each material 30–52 HU away.
  const plan = await p.evaluate(async () => { const { bulletPath, BulletPath, ARENA_MAPS } = await import('/arena-maps.js'); const G = __infra.lab.world.operations.game, M = ARENA_MAPS[G.arena.map], bx = __infra.lab.arenaScene.boxes, { ARENA } = await import('/facility-layout.js');
    const want = ['metal', 'concrete', 'wood', 'sand'], found = {}, P = new BulletPath(); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const like = (m, w) => m === w || (w === 'wood' && (m === 'crate' || m === 'Wood' || m === 'door')) || (w === 'metal' && /^metal/.test(m || ''));
    const [W, D] = M.size, starts = [...(M.t || []), ...(M.ct || [])].map(s => [s[0], s[1]]); for (let i = 0; i < 3000; i++) starts.push([(rnd() - .5) * W, (rnd() - .5) * D]);
    for (const [sx, sz] of starts) { const f = M.nav.floorAt(sx, sz); if (!Number.isFinite(f)) continue; const ex = ARENA.cx + sx, ez = ARENA.cz + sz, ey = f + 9.7;
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, dy = -.18 - (want.every(w => w === 'sand' || found[w]) ? .9 : .25) * rnd(), l = Math.hypot(1, dy), dx = Math.sin(a) / l, dz = Math.cos(a) / l, ddy = dy / l;
        const R = bulletPath(bx, ex, ey, ez, dx, ddy, dz, 30, 0, P); if (!(R.stop > 4.5 && R.stop < 8) || !R.stopBox) continue; const m = R.stopBox.mat || R.embedded?.mat;
        for (const w of want) if (!found[w] && like(m, w)) found[w] = { eye: [ex, ey, ez], to: [ex + dx * R.stop, ey + ddy * R.stop, ez + dz * R.stop], mat: m, dist: R.stop }; }
      if (want.every(w => found[w])) break; }
    const bot = G.arena.bots?.[0]; return { found, bot: bot ? { x: bot.x, z: bot.z, y: Number.isFinite(bot.y) ? bot.y : M.nav.floorAt(bot.x - ARENA.cx, bot.z - ARENA.cz) } : null }; });
  report.plan = plan; console.log('plan', JSON.stringify(plan).slice(0, 900));
  const aim = (eye, to) => p.evaluate(({ eye, to }) => { __infra.lab.look(eye[0], eye[2], to[0], to[1], to[2], eye[1]); __infra.camera.position.set(eye[0], eye[1], eye[2]); __infra.camera.lookAt(to[0], to[1], to[2]); }, { eye, to });
  const LABEL = { metal: 'METAL — CS2 spark burst (impact_metal)', concrete: 'CONCRETE — dust and flecks (impact_concrete)', wood: 'WOOD — chips and splinters (impact_wood)', sand: 'SAND — puffs (impact_dirt)' };
  const progs0 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1);
  const AGES = [1 / 120, .06, .2];
  // a close-up crop around a world point (the hit), from the current view: CSS pixels of a 480 × 300 box
  const crop = pt => p.evaluate(pt => { const v = new __infra.camera.position.constructor(pt[0], pt[1], pt[2]).project(__infra.camera), W = innerWidth, H = innerHeight, cw = 480, ch = 300;
    const x = Math.round((v.x * .5 + .5) * W - cw / 2), y = Math.round((-v.y * .5 + .5) * H - ch / 2); return { x: Math.max(0, Math.min(W - cw, x)), y: Math.max(0, Math.min(H - ch, y)), width: cw, height: ch }; }, pt);
  // ADDENDUM 11: "a stray dark translucent square next to the crosshair in every panel" — what is there
  report.stray = await p.evaluate(() => { const out = []; for (const [fx, fy] of [[.59, .6], [.62, .55], [.6, .62]]) { const x = innerWidth * fx, y = innerHeight * fy; for (const el of document.elementsFromPoint(x, y)) { if (el.tagName === 'CANVAS' || el === document.body || el === document.documentElement) continue; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); out.push({ at: [Math.round(x), Math.round(y)], id: el.id, cls: String(el.className).slice(0, 60), tag: el.tagName, bg: cs.backgroundColor, w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, op: cs.opacity }); } } return out; });
  console.log('stray-square probe', JSON.stringify(report.stray).slice(0, 1200));
  for (const w of ['metal', 'concrete', 'wood', 'sand']) { const s = plan.found[w]; check(`a ${w} surface 30–52 HU from a standing eye`, !!s, JSON.stringify(Object.keys(plan.found))); if (!s) continue;
    // the picture from 45 HU off the hit, a little to the side and above (the gun was fired from the eye, as a player does)
    const vx = s.eye[0] - s.to[0], vy = s.eye[1] - s.to[1], vz = s.eye[2] - s.to[2], vl = Math.hypot(vx, vy, vz), K = 45 * 2.54 / 16.5;
    const back = [s.to[0] + vx / vl * K - vz / vl * K * .35, s.to[1] + vy / vl * K + .9, s.to[2] + vz / vl * K + vx / vl * K * .35];
    for (let k = 0; k < 3; k++) { await aim(s.eye, s.to); await p.waitForTimeout(200); }
    const before = await p.evaluate(() => __gdImpacts.stats.impacts);
    await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForFunction(n => __gdImpacts.stats.impacts > n, before, { timeout: 3000 }).catch(() => {});
    await p.evaluate(a => __gdImpacts.hold(__gdImpacts.lastAt + a), AGES[0]);
    await aim(back, s.to); await p.waitForTimeout(150); await aim(back, s.to);   // (the body moved there: the game draws its camera from the body)
    const st = await p.evaluate(() => ({ ...__gdImpacts.stats, t: __gdImpacts.now(), last: __gdImpacts.lastAt }));
    for (const a of AGES) { await p.evaluate(a => __gdImpacts.hold(__gdImpacts.lastAt + a), a); await p.waitForTimeout(120); const clip = await crop(s.to), f = path.join(out, `impact-${w}-${Math.round(a * 1000)}.jpg`);
      await p.screenshot({ path: f, type: 'jpeg', quality: 90, clip }); frames.push({ f, row: LABEL[w] + ` · ${s.mat}, ${(s.dist / (2.54 / 16.5)).toFixed(0)} HU`, age: a }); }
    await p.evaluate(() => __gdImpacts.release()); report.shots[w] = { ...s, stats: st };
    check(`${w}: the shot drew its impact (sparks / dust and a hole)`, st.impacts > before && st.holes > 0, JSON.stringify(st)); await p.waitForTimeout(600); }
  { const progs1 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1); report.programs = [progs0, progs1];
    check('no shader compiled for the impacts during play (warmed behind the loading card)', progs0 < 0 || progs1 === progs0, progs0 + ' → ' + progs1); }
  // Headshot on the practice bot — the host's own record. The practice bot wears no helmet: CS2 shows blood only, no dink
  // (the helmet dink frame by frame: tests/browser/gd-impacts-look.mjs, the same gd-blood / gd-impacts code on a record with hm).
  // (v53 MAP fix) Headshots on the practice bot — the host's own records: first with a helmet (CS2's dink sparks: the host's
  // armor record gives the bot kevlar and a helmet, as a bought one does), then without (blood only, no dink).
  const botNow = () => p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), G = __infra.lab.world.operations.game, M = ARENA_MAPS[G.arena.map], bot = G.arena.bots?.[0];
    return bot ? { x: bot.x, z: bot.z, y: Number.isFinite(bot.y) ? bot.y : M.nav.floorAt(bot.x - ARENA.cx, bot.z - ARENA.cz) } : null; });   // (where the bot stands now: it walks)
  if (plan.bot) for (const helm of [true, false]) { const bt = (await botNow()) || plan.bot, eye = [bt.x - 7, bt.y + 9.7, bt.z + 4], head = [bt.x, bt.y + 10.3, bt.z];   // (fired from where the picture is taken)
    const bk = await p.evaluate(() => String(__infra.lab.world.operations.game.arena.bots?.[0]?.name || '').trim().toLowerCase().slice(0, 40));
    await p.evaluate(([k, h]) => { const C = __infra.lab.world.operations.game.combat; if (!C) return; C.armor ||= {}; for (const q of [k, 'bot ' + k]) { if (h) C.armor[q] = { kevlar: 100, helmet: true }; else delete C.armor[q]; } }, [bk, helm]);   // (the victim's key as the host's records spell it: 'bot <name>')
    for (let k = 0; k < 4; k++) { await aim(eye, head); await p.waitForTimeout(250); }
    for (let k = 0; k < 3; k++) { const q = await botNow(); if (!q) break; eye[0] = q.x - 7; eye[1] = q.y + 9.7; eye[2] = q.z + 4; head[0] = q.x; head[1] = q.y + 10.3; head[2] = q.z; await aim(eye, head); await p.waitForTimeout(40); }   // (it walks: aimed again where it is now)
    const before = await p.evaluate(() => ({ bl: (__infra.lab.world.operations.game.combat?.bl || []).length, dinks: __gdBlood.stats.dinks, add: __gdImpacts.stats.addHead, hits: __gdBlood.stats.hits }));
    // (the practice bots wear no helmet and the host — the test's server — has no way to give them one, nor CS2's mp_free_armor:
    // the helmet row is the host's record shape with hm, at the bot's real head in the game, drawn by the same gd-blood /
    // gd-impacts code a real one goes through — labelled so on the sheet)
    if (helm) await p.evaluate(([head, eye, v]) => { const C = __infra.lab.world.operations.game.combat; if (!C) return; const dx = head[0] - eye[0], dy = head[1] - eye[1], dz = head[2] - eye[2], l = Math.hypot(dx, dy, dz);
      (C.bl ||= []).push({ i: Date.now(), at: Date.now(), v, z: 'head', d: 56, hm: 1, p: head.map(x => Math.round(x * 100) / 100), r: [dx / l, dy / l, dz / l].map(x => Math.round(x * 1000) / 1000), k: 0, s: 'tester' }); }, [head, eye, 'bot ' + bk]);
    else await p.evaluate(() => __infra.lab.pistol.fire());
    await p.waitForFunction(n => __gdBlood.stats.hits > n, before.hits, { timeout: 4000 }).catch(() => {});
    const t0 = await p.evaluate(() => { const t = __gdBlood.time; __gdBlood.hold(t); return t; });   // (the record has just been drawn: its clock held there)
    const rec = await p.evaluate(() => { const L = __infra.lab.world.operations.game.combat?.bl || []; return L.length ? L[L.length - 1] : null; });
    const armor = await p.evaluate(k => { const A = __infra.lab.world.operations.game.combat?.armor || {}; return A[k] || A['bot ' + k] || null; }, bk);
    report['head' + (helm ? 'Helmet' : '')] = { rec, before, armor };
    for (const a of AGES) { await p.evaluate(([t, a]) => { __gdBlood.hold(t + a); __gdImpacts.hold(__gdImpacts.lastAt + a); }, [t0, a]); await p.waitForTimeout(120); const clip = await crop(head), f = path.join(out, `impact-head${helm ? '-helmet' : ''}-${Math.round(a * 1000)}.jpg`);
      await p.screenshot({ path: f, type: 'jpeg', quality: 90, clip }); frames.push({ f, row: (helm ? 'HEADSHOT, HELMET — CS2 dink sparks (host-shaped record with hm: practice bots wear no helmet)' : 'HEADSHOT, NO HELMET — blood only, no dink (host record' + (rec ? ' z ' + rec.z + ', hm ' + (rec.hm ? 1 : 0) : ' missing') + ')'), age: a }); }
    await p.evaluate(() => { __gdBlood.hold(null); __gdImpacts.release(); });
    const st = await p.evaluate(() => ({ dinks: __gdBlood.stats.dinks, add: __gdImpacts.stats.addHead }));
    if (helm) check('a helmet record (hm) at the bot\'s head: the dink sparks are drawn, and their CS2 children (gd-impacts)', !!rec && rec.z === 'head' && !!rec.hm && st.dinks > before.dinks && st.add > before.add, JSON.stringify({ rec, st, before }));
    else check('a headshot without a helmet: the host\'s record has no hm and no dink is drawn — blood only', !!rec && rec.z === 'head' && !rec.hm && st.dinks === before.dinks && st.add === before.add, JSON.stringify({ rec, st, before }));
    await p.waitForTimeout(1500); }
  // The sheet: the frames side by side with their labels (drawn in a page canvas: ffmpeg here has no drawtext).
  const imgs = frames.map(fr => ({ row: fr.row, age: fr.age, src: 'data:image/jpeg;base64,' + readFileSync(fr.f).toString('base64') }));
  const q = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  const jpg = await q.evaluate(async imgs => { const L = await Promise.all(imgs.map(i => new Promise(r => { const im = new Image(); im.onload = () => r({ ...i, im }); im.src = i.src; })));
    const cw = 480, ch = 300, cols = 3, rows = Math.ceil(L.length / cols), top = 70, lab = 34, c = document.createElement('canvas'); c.width = cw * cols; c.height = top + rows * (ch + lab); const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif'; x.fillText('Global Defensive v53 — bullet impacts in the game, close up at 8, 60 and 200 ms (CS2 particles/impact_fx numbers, our own sprites)', 16, 32);
    x.font = '17px sans-serif'; x.fillStyle = '#bbb'; x.fillText('Dust II, practice, Glock, muted; the red box is practice\'s sv_showimpacts (practice\'s recoil panel hidden). Close-ups at 8, 60 and 200 ms.', 16, 58);
    L.forEach((e, k) => { const ox = (k % cols) * cw, oy = top + Math.floor(k / cols) * (ch + lab); if (k % cols === 0) { x.fillStyle = '#ffd76a'; x.font = 'bold 20px sans-serif'; x.fillText(e.row, 12, oy + 24); }
      x.drawImage(e.im, ox, oy + lab, cw, ch); x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(ox, oy + lab, 74, 26); x.fillStyle = '#fff'; x.font = 'bold 16px sans-serif'; x.fillText(Math.round(e.age * 1000) + ' ms', ox + 8, oy + lab + 19); });
    return c.toDataURL('image/jpeg', .9); }, imgs);
  const sheet = path.join(out, 'GD-v53-impacts.jpg'); writeFileSync(sheet, Buffer.from(jpg.split(',')[1], 'base64')); console.log('sheet', sheet);
  if (process.env.DESKTOP === '1') { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-impacts.jpg'); copyFileSync(sheet, d); console.log('→', d); }
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
} catch (e) { console.log('FAIL run: ' + e.message); failed++; }
finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-impacts-shots · ${failed}` : 'PASS: gd-impacts-shots'); process.exit(failed ? 1 : 0);
