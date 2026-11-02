// Global Defensive bullet tracers in the real game (practice on a map, one bot) — a picture run: your own shots with a
// rifle (AK-47), a pistol (Desert Eagle), the AWP and a shotgun (Nova) down a long lane, each caught in first person
// MID-FLIGHT at several moments (12, 25, 40, 60 ms after the shot) and from a fixed side camera at floor level beside
// the bullet's real path; an AK spray (its 1-in-3 tracer shots, each caught 25 ms out); then the bot (Practice: bots
// fight) shooting at you — first person at three moments, then from the side. The tracer pool is held still for each
// picture (its update paused, then stepped by hand — gd-tracers.js), so each moment is exact; everything else runs live.
// The side camera is pinned (applied as the camera's world matrix is built, so the walk code can't move it) and your
// first-person gun is hidden there. Ends with a labelled sheet of all of it: <out-dir>/sheet.jpg.
//   node tests/browser/gd-tracers-shots.mjs <repo-root> <out-dir> [map]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-tracers-shots'), MAP = 'dust2'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDTR01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdtr-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], report = { guns: {} }; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
const shot = (p, name) => p.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 88 });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '1'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(3000);
  check('the tracer pool is in the game (one mesh, warmed with the scene)', await p.evaluate(() => !!__infra.lab.tracers?.mesh?.parent && __infra.lab.tracers.mesh.userData.gd === true));
  // A lane: from where we stand, the horizontal direction with the longest clear way (60–260 units).
  const lane = await p.evaluate(async () => { const { bulletPath, BulletPath } = await import('/arena-maps.js'); const c = __infra.camera.position, bx = __infra.lab.arenaScene.boxes; let best = null;
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a), d = Math.min(260, bulletPath(bx, c.x, c.y - 1, c.z, dx, 0, dz, 400, 0, new BulletPath()).stop); if (d > 60 && (!best || d > best.d)) best = { dx, dz, d }; }
    return best && { eye: [c.x, c.y, c.z], ...best }; });
  report.lane = lane; check('a long lane to shoot down', !!lane, JSON.stringify(lane));
  // The pool held still (update paused) and stepped by hand; the camera pinned for the side views.
  const freeze = () => p.evaluate(() => { const T = __infra.lab.tracers; T.__u ??= T.update; T.update = () => {}; });
  const thaw = () => p.evaluate(() => { const T = __infra.lab.tracers; if (T.__u) T.update = T.__u; });
  const step = dt => p.evaluate(dt => { const T = __infra.lab.tracers; __infra.camera.updateMatrixWorld(); T.__u(dt); return T.drawn; }, dt);
  const look = (eye, at) => p.evaluate(({ eye, at }) => { __infra.lab.look(eye[0], eye[2], at[0], at[1], at[2], eye[1]); __infra.camera.position.set(...eye); __infra.camera.lookAt(...at); }, { eye, at });
  const pin = (cam, at) => p.evaluate(({ cam, at }) => { const C = __infra.camera; C.__pin = cam && { cam, at }; __infra.lab.pistol.hideView?.(!!cam); for (const o of C.children) { if (cam) { o.userData.__vis ??= o.visible; o.visible = false; } else if (o.userData.__vis != null) { o.visible = o.userData.__vis; delete o.userData.__vis; } }
    if (!C.__umw) { C.__umw = C.updateMatrixWorld; C.updateMatrixWorld = function (f) { const q = this.__pin; if (q) { this.position.set(...q.cam); this.up.set(0, 1, 0); this.lookAt(...q.at); } return this.__umw(f); }; } }, { cam, at });
  // A floor-level side camera beside a bullet path: the path's point Q (direction dir, horizontal-ish); the camera stands
  // `back` units behind Q toward the shooter and off to one side, 2.5 units over the floor, looking at Q + dir·ahead.
  const sideCam = (Q, dir, back = 20, ahead = 25) => p.evaluate(async ({ Q, dir, back, ahead }) => { const { bulletPath, BulletPath } = await import('/arena-maps.js'); const bx = __infra.lab.arenaScene.boxes;
    const h = Math.hypot(dir[0], dir[2]), dx = dir[0] / h, dz = dir[2] / h, at = [Q[0] + dir[0] * ahead, Q[1] + dir[1] * ahead, Q[2] + dir[2] * ahead];
    const clear = (a, b) => { const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2], l = Math.hypot(x, y, z); return bulletPath(bx, a[0], a[1], a[2], x / l, y / l, z / l, l + 1, 0, new BulletPath()).stop >= l - .5; };
    for (const off of [12, -12, 9, -9, 16, -16, 6, -6]) for (const bk of [back, back * .5, 0]) {
      const x = Q[0] - dx * bk - dz * off, z = Q[2] - dz * bk + dx * off, top = Q[1] + 2, s = bulletPath(bx, x, top, z, 0, -1, 0, 30, 0, new BulletPath()).stop;
      if (!(s < 29.5)) continue; const cam = [x, top - s + 2.5, z]; if (cam[1] > Q[1] - .5) continue;
      if (clear(cam, at) && clear(cam, Q)) return { cam, at }; }
    return null; }, { Q, dir, back, ahead });
  const shots = {}; const snap = async (key, name) => { await p.waitForTimeout(90); const f = `${name}.jpg`; await shot(p, f); (shots[key] ??= []).push(f); };
  const MOM = [.012, .025, .04, .06];   // first-person moments after the shot (s)
  if (lane) {
    const { eye, dx, dz, d } = lane, at = [eye[0] + dx * d, eye[1] - 1.5, eye[2] + dz * d];
    for (const [id, slot, label] of [['ak', 'primary', 'rifle'], ['deagle', 'secondary', 'pistol'], ['sniper', 'primary', 'awp'], ['shotgun', 'primary', 'shotgun']]) {
      await p.evaluate(async ({ id, slot }) => { await __infra.lab.lan.act({ type: 'arena', action: { type: 'loadout', [slot]: id } }); __infra.lab.arenaUI?.buy?.(false); __infra.lab.pistol.equip(id); }, { id, slot });
      await p.waitForTimeout(1600); for (let k = 0; k < 3; k++) { await look(eye, at); await p.waitForTimeout(200); }
      // (a 1-in-3 gun: the shots before its next tracer shot go first — the count is the gun's shot number)
      const pre = await p.evaluate(async id => { const { tracerShot } = await import('/gd-tracers.js'), w = __infra.lab.pistol; let k = 0; while (!tracerShot(id, w.shots + 1) && k < 4) { if (w.fire()) k++; await new Promise(r => setTimeout(r, 160)); } return k; }, id);
      if (pre) { await p.waitForTimeout(500); for (let k = 0; k < 2; k++) { await look(eye, at); await p.waitForTimeout(150); } }
      // First person: the shot, then the streak held at each moment of its flight.
      const r = await p.evaluate(t0 => { const T = __infra.lab.tracers, s0 = T.spawned; T.__u ??= T.update; T.update = () => {}; T.clear(); const ok = __infra.lab.pistol.fire(), L = __infra.lab.pistol.lastShot, f = L?.ends?.filter(e => !e.mark) || [];
        __infra.camera.updateMatrixWorld(); T.__u(t0);
        return { fired: ok, made: T.spawned - s0, drawn: T.drawn, pellets: f.length, muzzle: L && [L.muzzle.x, L.muzzle.y, L.muzzle.z], end: f[0] && [f[0].point.x, f[0].point.y, f[0].point.z], ends: f.map(e => [e.point.x, e.point.y, e.point.z]), weapon: __infra.lab.pistol.current?.id }; }, MOM[0]);
      const drawnAt = [r.drawn]; await snap(label, `${label}-fp-${MOM[0] * 1000}ms`);
      for (let i = 1; i < MOM.length; i++) { drawnAt.push(await step(MOM[i] - MOM[i - 1])); await snap(label, `${label}-fp-${Math.round(MOM[i] * 1000)}ms`); }
      await thaw();
      // From the side: the same bullet path, its streak flown again and held as it passes a floor-level camera.
      let side = null;
      if (r.muzzle && r.end) {
        const M = r.muzzle, E = r.end, L = Math.hypot(E[0] - M[0], E[1] - M[1], E[2] - M[2]), dir = [(E[0] - M[0]) / L, (E[1] - M[1]) / L, (E[2] - M[2]) / L], qd = Math.min(60, L * .4), Q = M.map((m, i) => m + dir[i] * qd);
        side = await sideCam(Q, dir);
        if (side) { await pin(side.cam, side.at); await p.waitForTimeout(400);
          side.drawn = await p.evaluate(({ M, ends, h }) => { const T = __infra.lab.tracers; T.__u ??= T.update; T.update = () => {}; T.clear();
            ends.forEach((e, i) => { if (ends.length > 1 && i % 3) return; const x = e[0] - M[0], y = e[1] - M[1], z = e[2] - M[2], d = Math.hypot(x, y, z); T.spawn(M[0], M[1], M[2], x / d, y / d, z / d, d); });
            __infra.camera.updateMatrixWorld(); T.__u(h / (12000 * 2.54 / 16.5)); return T.drawn; }, { M, ends: r.ends, h: qd + 25 });
          side.camAt = await p.evaluate(() => { const c = __infra.camera.position; return [c.x, c.y, c.z]; });
          await snap(label + '-side', `${label}-side-a`); await step(.012); await snap(label + '-side', `${label}-side-b`);
          await pin(null); await thaw(); }
      }
      report.guns[label] = { ...r, drawnAt, side }; console.log(label, JSON.stringify({ fired: r.fired, made: r.made, drawnAt, pellets: r.pellets, side: side && { drawn: side.drawn, cam: side.cam.map(Math.round), camAt: side.camAt.map(Math.round) } }));
      check(`${label} (${id}): fired and drew its tracer${r.pellets > 1 ? 's' : ''} at every moment 12-60 ms (or landed)`, r.fired && r.weapon === id && r.made >= 1 && drawnAt[0] >= 1 && drawnAt[1] >= 1, JSON.stringify({ drawnAt, made: r.made }));
      if (r.pellets > 1) check(`${label}: a few pellets streak (${r.made} of ${r.pellets})`, r.made >= 2 && r.made < r.pellets);
      check(`${label}: a floor-level side camera beside the path, where it was put`, !!side && side.drawn >= 1 && Math.abs(side.camAt[1] - side.cam[1]) < .5, JSON.stringify(side));
      await p.waitForTimeout(300); for (let k = 0; k < 2; k++) { await look(eye, at); await p.waitForTimeout(150); }
    }
    // An AK spray: 9 shots in rhythm; each tracer shot (1 in 3) held 25 ms into its flight for a picture.
    await p.evaluate(async () => { await __infra.lab.lan.act({ type: 'arena', action: { type: 'loadout', primary: 'ak' } }); __infra.lab.pistol.equip('ak'); }); await p.waitForTimeout(1600);
    for (let k = 0; k < 3; k++) { await look(eye, at); await p.waitForTimeout(150); }
    const spray = { fired: 0, made: 0, held: [] };
    for (let k = 0; k < 9; k++) {
      const s = await p.evaluate(() => { const T = __infra.lab.tracers, s0 = T.spawned, ok = __infra.lab.pistol.fire(), made = T.spawned - s0;
        if (made) { T.__u ??= T.update; T.update = () => {}; __infra.camera.updateMatrixWorld(); T.__u(.025); } return { ok, made, drawn: T.drawn, n: __infra.lab.pistol.shots }; });
      spray.fired += +s.ok; spray.made += s.made;
      if (s.made) { spray.held.push(s.drawn); await snap('spray', `spray-shot${s.n}-25ms`); await thaw(); } else await p.waitForTimeout(105);
    }
    report.spray = spray; console.log('spray', JSON.stringify(spray));
    check('a 9-shot AK spray draws one in three (CS2 frequency 3), each seen mid-flight', spray.fired >= 6 && spray.made >= 2 && spray.made <= Math.ceil(spray.fired / 3) + 1 && spray.held.every(n => n >= 1), JSON.stringify(spray));
  }
  // The bot shoots at you (Practice: bots fight): its tracer held at three moments of its flight, then from the side.
  await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'practice', settings: { bots: 'fight' } } })); await p.waitForTimeout(300);
  const spot = await p.evaluate(async () => { const { bulletPath, BulletPath } = await import('/arena-maps.js'); const bot = __infra.lab.world.operations.game.arena.bots[0], bx = __infra.lab.arenaScene.boxes, y = (Number.isFinite(bot.y) ? bot.y : 0) + 9.7;
    for (const D of [44, 34, 26]) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a); if (bulletPath(bx, bot.x, y, bot.z, dx, 0, dz, D + 4, 0, new BulletPath()).stop > D + 3) return { eye: [bot.x + dx * D, y, bot.z + dz * D], bot: [bot.x, y - 1.5, bot.z], dx, dz, D }; }
    return null; });
  report.botSpot = spot; check('a clear spot facing the bot', !!spot);
  if (spot) {
    for (let k = 0; k < 3; k++) { await look(spot.eye, spot.bot); await p.waitForTimeout(150); }
    await p.evaluate(() => { const T = __infra.lab.tracers, u = T.__u || T.update; T.__u = u; const s0 = T.spawned; let age = -1; window.__botTr = null;
      T.update = dt => {   // (the clock starts on the first frame its streak is DRAWN: a replayed burst's shot waits its delay first)
        if (age < 0) { u(dt); if (T.spawned > s0 && T.drawn > 0) age = Math.min(dt, .015); else return; } else { const d = Math.min(dt, .015 - age); u(d); age += d; }
        if (age >= .015 - 1e-6 && T.drawn > 0) { T.update = () => {}; window.__botTr = { drawn: T.drawn, spawned: T.spawned - s0 }; } }; });
    let got = null; try { await p.waitForFunction(() => window.__botTr, null, { timeout: 25000, polling: 16 }); got = await p.evaluate(() => window.__botTr); } catch {}
    report.bot = got; console.log('bot', JSON.stringify(got));
    if (got) {
      // (the streak's line, read from the pool's core ribbon: tail → head)
      const line = await p.evaluate(() => { const b = __infra.lab.tracers.buffers.pos, m = (i, j) => [0, 1, 2].map(c => (b[i * 3 + c] + b[j * 3 + c]) / 2); return { tail: m(0, 1), head: m(2, 3) }; });
      await snap('bot', 'bot-fp-15ms'); got.drawnAt = [got.drawn, await step(.015)]; await snap('bot', 'bot-fp-30ms'); got.drawnAt.push(await step(.015)); await snap('bot', 'bot-fp-45ms');
      await thaw();
      const T0 = line.tail, H0 = line.head, ll = Math.hypot(H0[0] - T0[0], H0[1] - T0[1], H0[2] - T0[2]), dir = [0, 1, 2].map(i => (H0[i] - T0[i]) / ll);
      const B = spot.bot, tb = [0, 1, 2].reduce((s, i) => s + (B[i] - T0[i]) * dir[i], 0), O = T0.map((t, i) => t + dir[i] * tb), te = [0, 1, 2].reduce((s, i) => s + (spot.eye[i] - O[i]) * dir[i], 0);
      const Q = O.map((o, i) => o + dir[i] * te * .35), side = await sideCam(Q, dir, 10, 18); report.botSide = side;
      if (side) { await pin(side.cam, side.at); await p.waitForTimeout(400);
        side.drawn = await p.evaluate(({ O, dir, te, h }) => { const T = __infra.lab.tracers; T.__u ??= T.update; T.update = () => {}; T.clear(); T.spawn(O[0], O[1], O[2], dir[0], dir[1], dir[2], te); __infra.camera.updateMatrixWorld(); T.__u(h / (12000 * 2.54 / 16.5)); return T.drawn; }, { O, dir, te, h: te * .35 + 18 });
        side.camAt = await p.evaluate(() => { const c = __infra.camera.position; return [c.x, c.y, c.z]; });
        await snap('bot-side', 'bot-side-a'); await step(.012); await snap('bot-side', 'bot-side-b'); await pin(null); }
      check('the bot\'s tracer seen from a floor-level side camera', !!side && side.drawn >= 1 && Math.abs(side.camAt[1] - side.cam[1]) < .5, JSON.stringify(side));
    }
    await thaw();
    check('the bot\'s shots draw tracers on your screen (remote shot replay), held mid-flight', !!got && got.spawned >= 1 && got.drawnAt?.[1] >= 1, JSON.stringify(got));
  }
  report.errs = errs; report.shots = shots; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
  // The sheet: one row per gun (first person at each moment, then the side view), labelled.
  const { readFileSync } = await import('node:fs'), img = f => 'data:image/jpeg;base64,' + readFileSync(path.join(out, f)).toString('base64');
  const rows = [['AK-47 (1 in 3)', 'rifle'], ['AK-47 spray: shots 1, 4, 7', 'spray'], ['Desert Eagle', 'pistol'], ['AWP', 'awp'], ['Nova (3 of 9 pellets)', 'shotgun'], ['Bot shooting at you', 'bot']];
  const cell = (f, cap) => `<figure><img src="${img(f)}"><figcaption>${cap}</figcaption></figure>`;
  const html = `<html><body style="margin:0;background:#111;color:#eee;font:15px -apple-system,Helvetica,sans-serif"><h1 style="font-size:22px;margin:12px 16px">Global Defensive v52.0.5 · bullet tracers (CS2 look) · ${MAP} · first person mid-flight + floor-level side view</h1>
    <style>.r{display:flex;gap:6px;margin:0 16px 10px;align-items:flex-start}.l{width:150px;font-weight:600;padding-top:8px}figure{margin:0}img{width:430px;height:269px;object-fit:cover;display:block}figcaption{font-size:13px;color:#bbb;padding:2px 0}</style>
    ${rows.map(([t, k]) => `<div class="r"><div class="l">${t}</div>${(shots[k] || []).map(f => cell(f, 'first person · ' + (/(\d+)ms/.exec(f)?.[1] || '') + ' ms')).join('')}${(shots[k + '-side'] || []).slice(0, 1).map(f => cell(f, 'side view (floor level)')).join('')}</div>`).join('')}</body></html>`;
  const sp = await b.newPage({ viewport: { width: 2400, height: 800 } }); await sp.setContent(html); await sp.waitForTimeout(300); await sp.screenshot({ path: path.join(out, 'sheet.jpg'), type: 'jpeg', quality: 88, fullPage: true });
} finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: ${failed}` : 'PASS: tracer shots'); process.exit(failed ? 1 : 0);
