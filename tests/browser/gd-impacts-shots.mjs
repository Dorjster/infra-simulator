// Global Defensive bullet impacts and blood in the real game (practice, one bot standing still) — the v53 picture run
// (stage 5, ADDENDUM 6 / 11; v53 HITS): the game's own gun (lab.pistol.fire: the trace → the shared effects → gd-impacts.js)
// fired at metal, concrete (at ~50 and ~300 HU: CS2's control point 6), wood and sand; then on the bot: a REAL headshot
// without a helmet (blood only, no dink — the bot stands still: open-B #34), and host-shaped records at its real head and
// chest for the headshots at 64, 200 and 600 HU (CS2's screen caps and fades by distance), a body shot, a helmet's dink,
// and your own wounds on your screen from the front left and from behind (CS2's local splatter). 1:1 crops at 0, 8, 60
// and 200 ms, the clocks held; a labelled sheet goes to <out>/GD-v53-impacts.jpg (and ~/Desktop when DESKTOP=1). Muted Chrome (bt2.sh).
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
  await p.evaluate(() => { const A = __infra.lab.world.operations.game.arena; if (A?.practice) { A.practice.bots = 'stand'; A.practice.impacts = false; } });   // (v53 HITS final: practice's red sv_showimpacts box off — it hid the impact's core in every crop)   // (v53 HITS, open-B #34: the bot stands still — a real shot at a walking bot missed 1 in 2)
  check('the impacts and blood modules are in the game', await p.evaluate(() => !!globalThis.__gdImpacts && __gdImpacts.warmObjects().length === 3 && !!globalThis.__gdBlood && __gdBlood.warmObjects().length === 4));
  report.recoilPanel = await p.evaluate(() => !!document.getElementById('gd-recoil')); check('no practice recoil panel (CS2 has none: the "stray dark square", open-B #9)', !report.recoilPanel);
  const U = 2.54 / 16.5;   // (game units per HU)
  // Spots: from walkable floor near the spawns, rays a little down from eye height; the first face of each kind at its distance.
  const plan = await p.evaluate(async U => { const { bulletPath, BulletPath, ARENA_MAPS } = await import('/arena-maps.js'); const G = __infra.lab.world.operations.game, M = ARENA_MAPS[G.arena.map], bx = __infra.lab.arenaScene.boxes, { ARENA } = await import('/facility-layout.js');
    const want = { metal: [30, 52], concrete: [44, 56], concrete300: [270, 330], concrete800: [700, 1100], wood: [30, 52], sand: [30, 60] }, found = {}, P = new BulletPath(); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const like = (m, w) => w.startsWith('concrete') ? /^(concrete|stone|brick|adobe|plaster)$/.test(m || '') : m === w || (w === 'wood' && (m === 'crate' || m === 'Wood' || m === 'door')) || (w === 'metal' && /^metal/.test(m || ''));
    const [W, D] = M.size, starts = [...(M.t || []), ...(M.ct || [])].map(s => [s[0], s[1]]); for (let i = 0; i < 4000; i++) starts.push([(rnd() - .5) * W, (rnd() - .5) * D]);
    for (const [sx, sz] of starts) { const f = M.nav.floorAt(sx, sz); if (!Number.isFinite(f)) continue; const ex = ARENA.cx + sx, ez = ARENA.cz + sz, ey = f + 9.7;
      for (let k = 0; k < 24; k++) { const far = !found.concrete300 || !found.concrete800, a = k / 24 * Math.PI * 2, dy = far ? -.02 - .06 * rnd() : -.18 - (found.metal && found.wood && found.concrete ? .9 : .25) * rnd(), l = Math.hypot(1, dy), dx = Math.sin(a) / l, dz = Math.cos(a) / l, ddy = dy / l;
        const R = bulletPath(bx, ex, ey, ez, dx, ddy, dz, 1200 * U, 0, P); if (!R.stopBox || !(R.stop < 1200 * U)) continue; const m = R.stopBox.mat || R.embedded?.mat, hu = R.stop / U;
        for (const [w, [lo, hi]] of Object.entries(want)) if (!found[w] && hu >= lo && hu <= hi && like(m, w)) found[w] = { eye: [ex, ey, ez], to: [ex + dx * R.stop, ey + ddy * R.stop, ez + dz * R.stop], mat: m, dist: R.stop }; }
      if (Object.keys(want).every(w => found[w])) break; }
    const bot = G.arena.bots?.[0]; return { found, bot: bot ? { x: bot.x, z: bot.z, y: Number.isFinite(bot.y) ? bot.y : M.nav.floorAt(bot.x - ARENA.cx, bot.z - ARENA.cz) } : null }; }, U);
  report.plan = plan; console.log('plan', JSON.stringify(plan).slice(0, 900));
  const aim = (eye, to) => p.evaluate(({ eye, to }) => { __infra.lab.look(eye[0], eye[2], to[0], to[1], to[2], eye[1]); __infra.camera.position.set(eye[0], eye[1], eye[2]); __infra.camera.lookAt(to[0], to[1], to[2]); }, { eye, to });
  const LABEL = { metal: 'METAL — CS2 spark burst (impact_metal)', concrete: 'CONCRETE at ~50 HU — one bright puff, base, flecks, 2 sparse glints (impact_concrete; CP6 from its file)', concrete300: 'CONCRETE at ~300 HU — 2 puffs, burst_2 wider (CP6 from the file)', concrete800: 'CONCRETE at ~800 HU — 4 faint puffs (CP6 0)', wood: 'WOOD — chips and splinters (impact_wood)', sand: 'SAND — puffs (impact_dirt)' };
  const progs0 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1);
  const AGES = [0, .008, .06, .2];   // (v53 HITS final: + 8 ms — impact_concrete_child_base / generic_burst_2's first frame)
  // a 1:1 crop (CSS = device pixels at dsf 1) of 480 × 300 round a world point, from the current view
  const crop = pt => p.evaluate(pt => { const v = new __infra.camera.position.constructor(pt[0], pt[1], pt[2]).project(__infra.camera), W = innerWidth, H = innerHeight, cw = 480, ch = 300;
    const x = Math.round((v.x * .5 + .5) * W - cw / 2), y = Math.round((-v.y * .5 + .5) * H - ch / 2); return { x: Math.max(0, Math.min(W - cw, x)), y: Math.max(0, Math.min(H - ch, y)), width: cw, height: ch }; }, pt);
  for (const w of ['metal', 'concrete', 'concrete300', 'concrete800', 'wood', 'sand']) { const s = plan.found[w]; check(`a ${w} surface at its distance from a standing eye`, !!s, JSON.stringify(Object.keys(plan.found))); if (!s) continue;
    // metal / wood / sand pictured from 45 HU off the hit (as before); concrete from where it was fired (CP6 is the eye's distance)
    const vx = s.eye[0] - s.to[0], vy = s.eye[1] - s.to[1], vz = s.eye[2] - s.to[2], vl = Math.hypot(vx, vy, vz), K = 45 * U;
    const view = w.startsWith('concrete') || w === 'sand' ? s.eye : [s.to[0] + vx / vl * K - vz / vl * K * .35, s.to[1] + vy / vl * K + .9, s.to[2] + vz / vl * K + vx / vl * K * .35];
    for (let k = 0; k < 3; k++) { await aim(s.eye, s.to); await p.waitForTimeout(200); }
    const before = await p.evaluate(() => __gdImpacts.stats.impacts);
    await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForFunction(n => __gdImpacts.stats.impacts > n, before, { timeout: 3000 }).catch(() => {});
    await p.evaluate(a => __gdImpacts.hold(__gdImpacts.lastAt + a), AGES[0]);
    await aim(view, s.to); await p.waitForTimeout(150); await aim(view, s.to);
    const st = await p.evaluate(() => ({ ...__gdImpacts.stats, t: __gdImpacts.now(), last: __gdImpacts.lastAt, cp6: __gdImpacts.lastCp6 }));
    for (const a of AGES) { await p.evaluate(a => __gdImpacts.hold(__gdImpacts.lastAt + a), a); await p.waitForTimeout(120); const clip = await crop(s.to), f = path.join(out, `impact-${w}-${Math.round(a * 1000)}.jpg`);
      await p.screenshot({ path: f, type: 'jpeg', quality: 92, clip }); frames.push({ f, row: LABEL[w] + ` · ${s.mat}, ${(s.dist / U).toFixed(0)} HU${w.startsWith('concrete') ? ', CP6 ' + (+st.cp6).toFixed(2) : ''}`, age: a }); }
    await p.evaluate(() => __gdImpacts.release()); report.shots[w] = { ...s, stats: st };
    check(`${w}: the shot drew its impact (sparks / dust and a hole)`, st.impacts > before && st.holes > 0, JSON.stringify(st)); await p.waitForTimeout(600); }
  { const progs1 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1); report.programs = [progs0, progs1];
    check('no shader compiled for the impacts during play (warmed behind the loading card)', progs0 < 0 || progs1 === progs0, progs0 + ' → ' + progs1); }
  // The bot (standing still now) and its head; the victim's key as the host's records spell it ('bot <name>').
  const botNow = () => p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), G = __infra.lab.world.operations.game, M = ARENA_MAPS[G.arena.map], bot = G.arena.bots?.[0];
    return bot ? { x: bot.x, z: bot.z, y: Number.isFinite(bot.y) ? bot.y : M.nav.floorAt(bot.x - ARENA.cx, bot.z - ARENA.cz) } : null; });
  const bk = await p.evaluate(() => String(__infra.lab.world.operations.game.arena.bots?.[0]?.name || '').trim().toLowerCase().slice(0, 40));
  // an open line of sight from the head out to `hu` (the first of 16 ways round it): the eye there
  const eyeAt = (head, hu) => p.evaluate(async ([head, hu, U]) => { const { bulletPath, BulletPath, ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), bx = __infra.lab.arenaScene.boxes, P = new BulletPath(), M = ARENA_MAPS[__infra.lab.world.operations.game.arena.map], feet = head[1] - 10.3;
    for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2 + .3, dx = Math.sin(a), dz = Math.cos(a), L = hu * U, R = bulletPath(bx, head[0], head[1] - .4, head[2], dx, 0, dz, L, 0, P), fl = M.nav.floorAt(head[0] + dx * L - ARENA.cx, head[2] + dz * L - ARENA.cz);
      if (R.stop >= L - .01 && Number.isFinite(fl) && Math.abs(fl - feet) < 1.5) return [head[0] + dx * L, fl + 9.7, head[2] + dz * L]; }   // (on walkable floor at the bot's own height: the game puts your body — and so the camera — on the floor there)
      let best = null; for (let k = 0; k < 64; k++) { const a = k / 64 * Math.PI * 2 + .1, dx = Math.sin(a), dz = Math.cos(a), L = hu * U;   // pass 2: other floor heights, sight-line from that eye to the head
        for (const f of [1, .85, .7, .55]) { const l = L * f, fl = M.nav.floorAt(head[0] + dx * l - ARENA.cx, head[2] + dz * l - ARENA.cz); if (!Number.isFinite(fl)) continue; const e = [head[0] + dx * l, fl + 9.7, head[2] + dz * l], ex = head[0] - e[0], ey = head[1] - .4 - e[1], ez = head[2] - e[2], el = Math.hypot(ex, ey, ez), R = bulletPath(bx, e[0], e[1], e[2], ex / el, ey / el, ez / el, el, 0, P);
          if (R.stop >= el - .02 && (!best || Math.abs(l - L) < Math.abs(best[3] - L))) best = [e[0], e[1], e[2], l]; } }
      if (best) return best;
    return [head[0] - hu * U, head[1] - .6, head[2], hu * U]; }, [head, hu, U]);
  // A host-shaped record (practice: this page is the host) at the bot's real head / chest, fired from `eye`.
  const record = (pt, eye, o) => p.evaluate(([pt, eye, o]) => { const C = __infra.lab.world.operations.game.combat; if (!C) return null; const dx = pt[0] - eye[0], dy = pt[1] - eye[1], dz = pt[2] - eye[2], l = Math.hypot(dx, dy, dz);
    const r = { i: Date.now() + Math.floor(Math.random() * 1000), at: Date.now(), d: 56, p: pt.map(x => Math.round(x * 100) / 100), r: [dx / l, dy / l, dz / l].map(x => Math.round(x * 1000) / 1000), k: 0, s: 'tester', ...o }; (C.bl ||= []).push(r); return r; }, [pt, eye, o]);
  const shoot = async (row, eye, pt, o, cropAt = null, file = row, view = null) => {   // view: [camera eye, look-at] when the camera is not the shooter (your own wounds)
    for (let k = 0; k < 3; k++) { await aim(view ? view[0] : eye, view ? view[1] : pt); await p.waitForTimeout(150); }
    const h0 = await p.evaluate(() => __gdBlood.stats.hits + __gdBlood.stats.locals); const rec = await record(pt, eye, o);
    await p.waitForFunction(n => __gdBlood.stats.hits + __gdBlood.stats.locals > n, h0, { timeout: 4000 }).catch(() => {});
    const t0 = await p.evaluate(() => { const t = __gdBlood.lastAt >= 0 ? __gdBlood.lastAt : __gdBlood.time; __gdBlood.hold(t); return t; });   // (v53 HITS final: from the record's own birth — '0 ms' is 0 ms, not a frame or two later)
    for (const a of AGES) { await p.evaluate(([t, a]) => { __gdBlood.hold(t + a); __gdImpacts.hold(__gdImpacts.lastAt + a); }, [t0, a]); await p.waitForTimeout(120); const clip = cropAt || await crop(pt), f = path.join(out, `hit-${file}-${Math.round(a * 1000)}.jpg`);
      await p.screenshot({ path: f, type: 'jpeg', quality: 92, clip }); frames.push({ f, row, age: a }); }
    await p.evaluate(() => { __gdBlood.hold(null); __gdImpacts.release(); }); await p.waitForTimeout(900); return rec; };
  if (plan.bot) {
    const bt = (await botNow()) || plan.bot, head = [bt.x, bt.y + 10.3, bt.z], chest = [bt.x, bt.y + 7.9, bt.z]; report.bot = bt;
    await p.evaluate(k => { const C = __infra.lab.world.operations.game.combat; if (C?.armor) for (const q of [k, 'bot ' + k]) delete C.armor[q]; }, bk);
    // headshots at 64, 200 and 600 HU, a body shot (host-shaped records at the bot's real head / chest, labelled)
    for (const hu of [64, 200, 600]) { const e4 = await eyeAt(head, hu), eye = e4.slice(0, 3), real = e4.length > 3 ? Math.round(e4[3] / U) : hu; await shoot(`HEADSHOT at ${real} HU — CS2 blood_impact_headshot + children, screen caps / fades (host-shaped record)`, eye, head, { v: 'bot ' + bk, z: 'head', d: 100 }, null, 'head-' + hu); }
    { const eye = await eyeAt(head, 64); await shoot('BODY SHOT at 64 HU, 27 damage — blood_impact_med (host-shaped record)', eye, chest, { v: 'bot ' + bk, z: 'chest', d: 27 }, null, 'body'); }
    { const eye = await eyeAt(head, 64); await shoot('HEADSHOT, HELMET — CS2 dink sparks (host-shaped record with hm)', eye, head, { v: 'bot ' + bk, z: 'head', d: 56, hm: 1 }, null, 'helmet'); }
    // your own wounds on your screen: shot from the front left, then from behind (records with v = you)
    { const eye = await eyeAt(head, 200); await aim(eye, head); await p.waitForTimeout(300); const W = await p.evaluate(() => [innerWidth, innerHeight]);
      const f = await p.evaluate(() => { const d = new __infra.camera.position.constructor(); __infra.camera.getWorldDirection(d); d.y = 0; d.normalize(); return [d.x, d.z]; }), rt = [-f[1], f[0]];
      const me = [eye[0], eye[1] - 1.5, eye[2]], fromFL = [f[0] * Math.cos(.5) - rt[0] * Math.sin(.5), f[1] * Math.cos(.5) - rt[1] * Math.sin(.5)];
      await shoot('YOUR WOUND, shot from the front left — CS2 localfrontenemy splatter (+ lp_spray; screen placement ours)', [me[0] + fromFL[0] * 20, me[1], me[2] + fromFL[1] * 20], me, { v: 'tester', z: 'chest', d: 45, s: 'bot ' + bk }, { x: 0, y: Math.round(W[1] / 2 - 150), width: 480, height: 300 }, 'local-front', [eye, head]);
      await aim(eye, head); await p.waitForTimeout(200);
      await shoot('YOUR WOUND, shot from behind — CS2 localrearhit splatter (+ lp_spray; screen placement ours)', [me[0] - f[0] * 20, me[1], me[2] - f[1] * 20], me, { v: 'tester', z: 'chest', d: 45, s: 'bot ' + bk }, { x: Math.round(W[0] / 2 - 240), y: W[1] - 300, width: 480, height: 300 }, 'local-rear', [eye, head]);
      check('your own wounds drew the local splatter', await p.evaluate(() => __gdBlood.stats.locals >= 2)); }
    // (last: the Glock headshot kills the bot, so the pictured rows above use it alive) a REAL headshot on the standing bot, no helmet: the host's own trace — blood only, no dink (the open-B #34 flake)
    { const eye = [bt.x - 7, bt.y + 9.7, bt.z + 4]; for (let k = 0; k < 4; k++) { await aim(eye, head); await p.waitForTimeout(250); }   // (the run's original spot, ~52 HU off: it hit when the bot stood)
      // (v53 HITS 3rd run: the Glock's first-shot spread can still graze past the head at ~52 HU — a miss left no record, rec null.
      //  Up to 3 shots, each after the spread has recovered; a miss leaves no blood record, so the first shot that lands is the one checked.)
      let before = null, rec = null, st = null; const moved0 = await botNow();
      for (let t = 0; t < 3 && !rec; t++) { await aim(eye, head); await p.waitForTimeout(700);
        before = await p.evaluate(() => ({ dinks: __gdBlood.stats.dinks, add: __gdImpacts.stats.addHead, hits: __gdBlood.stats.hits, n: (__infra.lab.world.operations.game.combat?.bl || []).at(-1)?.i ?? 0 }));
        await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForFunction(n => __gdBlood.stats.hits > n, before.hits, { timeout: 2500 }).catch(() => {});
        rec = await p.evaluate(n => { const L = __infra.lab.world.operations.game.combat?.bl || [], r = L.at(-1); return r && r.i > n ? r : null; }, before.n); st = await p.evaluate(() => ({ dinks: __gdBlood.stats.dinks, add: __gdImpacts.stats.addHead })); }
      const moved1 = await botNow();
      report.realHead = { rec, before, st, moved0, moved1 };
      check('the practice bot stands still (practice bots: stand)', !!moved0 && !!moved1 && Math.hypot(moved1.x - moved0.x, moved1.z - moved0.z) < .05, JSON.stringify({ moved0, moved1 }));
      check('a real headshot without a helmet: the host\'s record (z head, no hm) and no dink — blood only', !!rec && rec.z === 'head' && !rec.hm && st.dinks === before.dinks && st.add === before.add, JSON.stringify({ rec, st, before }));
      await p.waitForTimeout(1500); }
  }
  // The sheet: the frames side by side with their labels (drawn in a page canvas: ffmpeg here has no drawtext).
  const imgs = frames.map(fr => ({ row: fr.row, age: fr.age, src: 'data:image/jpeg;base64,' + readFileSync(fr.f).toString('base64') }));
  const q = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  const jpg = await q.evaluate(async imgs => { const L = await Promise.all(imgs.map(i => new Promise(r => { const im = new Image(); im.onload = () => r({ ...i, im }); im.src = i.src; })));
    const cw = 480, ch = 300, cols = 4, rows = Math.ceil(L.length / cols), top = 70, lab = 34, c = document.createElement('canvas'); c.width = cw * cols; c.height = top + rows * (ch + lab); const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 24px sans-serif'; x.fillText('Global Defensive v53 HITS — impacts and blood in the game, 1:1 crops at 0, 8, 60 and 200 ms (CS2 particles/impact_fx + blood_impact numbers)', 16, 32);
    x.font = '16px sans-serif'; x.fillStyle = '#bbb'; x.fillText('Dust II, practice, Glock, muted Chrome; the practice impacts box is off; CP6 = the surface file distance remap (impact_concrete: 100 to 800 HU gives 1 to 0). Head / body / helmet / wound rows: host-shaped records at the standing bot (labelled).', 16, 58);
    L.forEach((e, k) => { const ox = (k % cols) * cw, oy = top + Math.floor(k / cols) * (ch + lab); if (k % cols === 0) { x.fillStyle = '#ffd76a'; x.font = 'bold 18px sans-serif'; x.fillText(e.row, 12, oy + 24); }
      x.drawImage(e.im, ox, oy + lab, cw, ch); x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(ox, oy + lab, 74, 26); x.fillStyle = '#fff'; x.font = 'bold 16px sans-serif'; x.fillText(Math.round(e.age * 1000) + ' ms', ox + 8, oy + lab + 19); });
    return c.toDataURL('image/jpeg', .9); }, imgs);
  const sheet = path.join(out, 'GD-v53-impacts.jpg'); writeFileSync(sheet, Buffer.from(jpg.split(',')[1], 'base64')); console.log('sheet', sheet);
  if (process.env.DESKTOP === '1') { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-impacts.jpg'); copyFileSync(sheet, d); console.log('→', d); }
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
} catch (e) { console.log('FAIL run: ' + e.message); failed++; }
finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-impacts-shots · ${failed}` : 'PASS: gd-impacts-shots'); process.exit(failed ? 1 : 0);
