// Global Defensive · CS2's death cam and the physical ragdolls in the real game (v53 Addenda 2 + 3), muted.
// The room runs in this process (lan/room.mjs startRoom), so the test reaches the host's own game state: in a long
// freeze time (nobody moves or shoots) it kills bots and you through the host's own rules — combat-logic.js hurt() and
// bleed(), the same records a real shot leaves (the down record with its rg / z / dg / dt, the blood record) — and an HE
// through a real grenade record. Pictured:
//   · ragdolls: a body shot, a headshot, an HE death, a death on stairs — each at 0.15 / 0.5 / 1 / 2.5 s after the kill;
//     checked: the body ends on the floor (no part under it) and asleep, the push the way the bullet went;
//   · the death cam: your death by a bot you hurt first — frames from 0.2 s to the spectating, the panel's text (KILLED BY,
//     the killer, the weapon, damage given / taken), the skip hint after the lock, Space skipping into the spectating.
//   node tests/browser/gd-death-shots.mjs <repo-root> <out-dir> [map] [--sheet-cam <jpg>] [--sheet-rag <jpg>]
import { chromium } from 'playwright-core'; import { execFileSync } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const SHEET_CAM = opt('--sheet-cam'), SHEET_RAG = opt('--sheet-rag');
const [root = '.', out = path.join(os.tmpdir(), 'gd-death-shots'), MAP = 'dust2'] = argv; mkdirSync(out, { recursive: true });
const { startRoom } = await import(path.resolve(root, 'lan/room.mjs'));
const CL = await import(path.resolve(root, 'dist/combat-logic.js')), { weaponById } = await import(path.resolve(root, 'dist/weapons-data.js')), { ARENA_MAPS } = await import(path.resolve(root, 'dist/arena-maps.js')), { ARENA } = await import(path.resolve(root, 'dist/facility-layout.js'));
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdds-')), 's.json'), roomCode: 'GDDS01', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, g = () => room.world.operations.game, key = n => String(n).trim().toLowerCase();
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d === '' ? '' : ' · ' + String(d).slice(0, 400))); };
const report = { rag: {}, cam: {} };
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '5');
  await p.evaluate(() => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', '60'], ['ss-ar-diff', 'easy']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } }); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
  await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 60000, polling: 200 });
  await p.waitForTimeout(1500);
  const G = g(), C = G.combat, M = ARENA_MAPS[G.arena.map], cx = ARENA.cx, cz = ARENA.cz;
  check('the round is in its freeze time (nobody moves or shoots: the pictures are of the bodies alone)', C.d.round.phase === 'freeze');
  const me = 'tester', team = C.d.teams[me], bots = G.arena.bots, agents = await p.evaluate(() => [...(__infra.lab.lan.models || new Map()).values()].filter(m => m.cs).length);
  report.agents = agents; check('the bots are drawn as CS2 agents or the built-in soldiers', agents > 0, agents);
  const label = (t) => p.evaluate(t => { let e = document.getElementById('__lbl'); if (!e) { e = document.createElement('div'); e.id = '__lbl'; e.style.cssText = 'position:fixed;left:10px;top:8px;z-index:999;color:#fff;font:700 15px system-ui;background:#000a;padding:3px 8px;border-radius:4px;pointer-events:none'; document.body.append(e); } e.textContent = t; }, t);
  const shot = async (tag, t) => { await label(t); const f = path.join(out, tag + '.jpg'); await p.screenshot({ path: f, type: 'jpeg', quality: 88 }); return f; };
  const feetOf = bt => Number.isFinite(bt.y) ? bt.y : (M.nav?.floorAt?.(bt.x - cx, bt.z - cz) || 0);
  // The client's view of a body: its parts' lowest point over the floor right under it, asleep or not (gd-ragdoll's rig on the model)
  const bodyState = name => p.evaluate(async name => { const m = [...__infra.lab.lan.models.values()].find(x => x.name === name); if (!m?.g) return null; const B = []; m.g.updateMatrixWorld(true); let low = Infinity, pel = null; m.g.traverse(o => { if (o.isBone && /^(pelvis|head_0|ankle_[lr]|hand_[lr])$/i.test(o.name)) { const v = o.getWorldPosition(new o.position.constructor()); B.push([o.name, +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]); low = Math.min(low, v.y); if (/pelvis/i.test(o.name)) pel = v; } });
    const R = await import('/gd-ragdoll.js'); return { bones: B, low, pel: pel && [pel.x, pel.y, pel.z], active: R.activeRagdolls(), g: [m.g.position.x, m.g.position.y, m.g.position.z], rag: m.cs?.ragdoll ? { active: m.cs.ragdoll.active, steps: m.cs.ragdoll.sim.steps, freed: m.cs.ragdoll.sim.freed, x0: [...m.cs.ragdoll.sim.X.slice(15, 18)] } : null }; }, name);
  const enemies = bots.filter(x => C.d.teams[key(x.name)] !== team), friends = bots.filter(x => C.d.teams[key(x.name)] === team);
  // ── the death cam ──
  const killer = enemies[enemies.length - 1]; report.cam.killer = killer?.name;
  const mine = await p.evaluate(() => [__infra.camera.position.x, __infra.camera.position.y, __infra.camera.position.z]);
  // the killer in the open, 24 units off at your side (in clear sight: the host's own line check); you look ahead
  const { segmentClear } = await import(path.resolve(root, 'dist/arena-maps.js')), bx = (await import(path.resolve(root, 'dist/arena-maps.js'))).mapBoxes(M, cx, cz);
  let kx = null, kz = null, look = 0; for (let k = 0; k < 32 && kx === null; k++) { const a = k / 32 * Math.PI * 2, x = mine[0] + Math.sin(a) * 24, z = mine[2] + Math.cos(a) * 24; if (segmentClear(bx, mine[0], mine[1], mine[2], x, mine[1], z) && segmentClear(bx, mine[0], mine[1] - 6, mine[2], x, mine[1] - 6, z)) { kx = x; kz = z; look = a + Math.PI / 2; } }
  report.cam.killerAt = [kx, kz]; check('a spot for the killer in clear sight', kx !== null);
  killer.x = kx; killer.z = kz; if (Number.isFinite(killer.y)) killer.y = mine[1] - 9.7; await p.evaluate(n => { window.__killer = n; }, killer.name); await p.waitForTimeout(800);
  await p.evaluate(([x, z, y, a]) => __infra.lab.look(x, z, x + Math.sin(a) * 30, y, z + Math.cos(a) * 30, y), [mine[0], mine[2], mine[1], look]); await p.waitForTimeout(400);
  { const now = Date.now(), usp = weaponById('usps') || weaponById('pistol'), ak = weaponById('ak');
    CL.hurt(G, 'Tester', killer.name, usp, 27, 'chest', now - 900); CL.hurt(G, 'Tester', killer.name, usp, 27, 'stomach', now - 700);
    CL.hurt(G, killer.name, 'Tester', ak, 36, 'chest', now - 300); const r = CL.hurt(G, killer.name, 'Tester', ak, 150, 'head', now); const mp = await p.evaluate(() => [__infra.camera.position.x, __infra.camera.position.y, __infra.camera.position.z]);
    const L = Math.hypot(mp[0] - kx, mp[2] - kz); CL.bleed(G, 'Tester', r, mp[0] - (mp[0] - kx) / L, mp[1] - .3, mp[2] - (mp[2] - kz) / L, (mp[0] - kx) / L, 0, (mp[2] - kz) / L, now);
    report.cam.down = { ...C.down[me] }; }
  check('you are down, by the bot, the host\'s record carries damage given / taken and the killing hit', !!C.down[me] && Array.isArray(C.down[me].dg) && C.down[me].dg[0] === 54 && C.down[me].dg[1] === 2 && C.down[me].dt[1] === 2 && Array.isArray(C.down[me].rg), JSON.stringify(C.down[me]));
  const t0 = Date.now(), camFrames = []; let moved = false;
  for (const t of [200, 600, 1000, 1400, 2200, 2950]) { const w = t - (Date.now() - t0); if (w > 0) await p.waitForTimeout(w); if (t >= 1400 && !moved) { moved = true; killer.x += Math.cos(look) * 8; killer.z -= Math.sin(look) * 8; }   // (the killer walks: the cam keeps them framed)
    const st = await p.evaluate(async () => { const D = await import('/gd-deathcam.js'); return { on: D.DEATHCAM.on, phase: D.DEATHCAM.phase, canSkip: D.DEATHCAM.canSkip, panel: !document.getElementById('gd-dp')?.hidden, text: document.getElementById('gd-dp')?.innerText || '', fit: (() => { const d = document.querySelector('#gd-dp .desc'), n = document.querySelector('#gd-dp .name'); return d ? { sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight, ch: d.clientHeight, fs: getComputedStyle(d).fontSize, pl: getComputedStyle(d).paddingLeft, nsw: n?.scrollWidth, ncw: n?.clientWidth, nfs: n ? getComputedStyle(n).fontSize : null, desc: d.textContent } : null; })(), skip: !document.getElementById('gd-dp-skip')?.hidden, sp: __infra.lab.spectator?.watched?.name || null, cam: [__infra.camera.position.x, __infra.camera.position.y, __infra.camera.position.z].map(v => +v.toFixed(2)), dir: (() => { const v = __infra.camera.getWorldDirection(new __infra.camera.position.constructor()); return [v.x, v.y, v.z].map(x => +x.toFixed(2)); })(), self: (() => { const m = __infra.lab.spectator?.selfBody; let pel = null, meshes = 0; m?.g.traverse(o => { if (!pel && o.isBone && /pelvis/i.test(o.name)) { const v = o.getWorldPosition(new o.position.constructor()); pel = [v.x, v.y, v.z].map(x => +x.toFixed(2)); } if (o.isMesh && o.visible) meshes++; }); return m ? { pel, meshes, gv: (() => { let o = m.g, ok = true; while (o) { if (!o.visible) ok = false; o = o.parent; } return ok; })(), vis: m.g.visible, inScene: !!m.g.parent, pos: [m.g.position.x, m.g.position.y, m.g.position.z].map(v => +v.toFixed(2)) } : null; })(), killer: (() => { const m = [...__infra.lab.lan.models.values()].find(x => x.name === window.__killer); return m ? [m.g.position.x, m.g.position.y, m.g.position.z].map(v => +v.toFixed(2)) : null; })() }; });
    report.cam['t' + t] = st; camFrames.push(await shot(`cam-${t}`, `death cam · ${(t / 1000).toFixed(2)} s · ${st.phase}`)); }
  const at1 = report.cam.t1000, at29 = report.cam.t2950;
  check('the death cam runs (not spectating yet) with the death panel', at1.on && at1.panel && !at1.sp, JSON.stringify(at1));
  { const f = at1.fit; check('the description line fits its box as CS2 sizes it (padding-left 8 px, shrunk from 18 px to no less than 14 px, up to 30 px tall): the weapon\'s name is not cut', !!f && f.sw <= f.cw + 1 && f.sh <= Math.max(f.ch, 30) + 1 && f.pl === '8px' && parseFloat(f.fs) >= 14 && parseFloat(f.fs) <= 18 && /AK-47|with their \S/.test(f.desc) && f.nsw <= f.ncw + 1, JSON.stringify(f)); }
  check('the panel: KILLED BY, the killer, the weapon, damage taken and given (CS2\'s words)', /KILLED BY/.test(at1.text) && at1.text.includes(killer.name) && /killed you with their/i.test(at1.text) && /Damage taken/.test(at1.text) && /Damage given/.test(at1.text), at1.text);
  check('phases in CS2\'s order: anim → travel → freeze', report.cam.t200.phase === 'anim' && /travel|freeze/.test(report.cam.t1000.phase) && report.cam.t2200.phase === 'freeze', JSON.stringify([report.cam.t200.phase, report.cam.t1000.phase, report.cam.t2200.phase]));
  check('the skip hint shows once the lock has passed (deathanim + lock = 2.8 s)', at29.skip && at29.canSkip && !report.cam.t2200.skip, JSON.stringify([report.cam.t2200, at29]));
  await p.keyboard.press('Space'); await p.waitForTimeout(450);
  const afterSkip = await p.evaluate(async () => { const D = await import('/gd-deathcam.js'); return { on: D.DEATHCAM.on, phase: D.DEATHCAM.phase, panel: !document.getElementById('gd-dp')?.hidden, sp: __infra.lab.spectator?.watched?.name || null, spOn: !!__infra.lab.spectator?.on }; });
  report.cam.afterSkip = afterSkip; camFrames.push(await shot('cam-skip', 'Space: skipped → spectating a team mate'));
  check('Space skips: the cam is done, the panel gone, spectating a team mate in first person', !afterSkip.on && afterSkip.phase === 'done' && !afterSkip.panel && afterSkip.spOn, JSON.stringify(afterSkip));
  // a new round for the ragdolls (you are alive again: the host's restart)
  { const r0 = C.d.round.id; await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'restart-round' } })); const t1 = Date.now(); while (Date.now() - t1 < 20000 && (g().combat.d.round.id === r0 || g().combat.down?.[me] || g().combat.d.round.phase !== 'freeze')) await p.waitForTimeout(200);
    check('a new round: you are alive again (the restart)', !g().combat.down?.[me] && g().combat.d.round.phase === 'freeze', JSON.stringify([g().combat.d.round.phase, !!g().combat.down?.[me]])); await p.waitForTimeout(1500); }
  // ── ragdolls ──
  const cases = [{ tag: 'body', what: 'a body shot (AK-47, chest)', zone: 'chest', wid: 'ak', dmg: 400 }, { tag: 'head', what: 'a headshot (AK-47)', zone: 'head', wid: 'ak', dmg: 400 }, { tag: 'he', what: 'an HE grenade', wid: 'he', dmg: 400 }, { tag: 'stairs', what: 'a death on stairs (shot down them)', zone: 'chest', wid: 'ak', dmg: 400, stairs: true }];
  const victims = [enemies[0], friends[0], friends[1], enemies[1], ...friends.slice(2)].filter(Boolean); let vi = 0;   // (an enemy kept alive: your killer in the death cam)
  // a staircase: four cells in a row each a step (0.5–2.6 units) higher than the one before, walkable
  // (r2) real stairs, not a ramp: the grid's rise found first (five walkable cells, each 0.5–2.6 units higher), then the
  // map's own triangles sampled every few centimetres along the line — treads (flat) and risers (sudden steps), no slope
  const stairs = (() => { const Gd = M.grid, NM = bx.nadeMesh; if (!Gd) return null; const [W, D] = M.size, at = (c, r) => [cx - W / 2 + (c + .5) * Gd.cell, cz - D / 2 + (r + .5) * Gd.cell];
    const floorAt = (x, z, top, bot) => { if (!NM?.first) return null; const w = NM.first(x, top, z, x, bot, z); return Number.isFinite(w) ? top + (bot - top) * w : null; };
    for (const [ax, az] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (let r = 3; r < Gd.rows - 7; r++) for (let c = 3; c < Gd.cols - 7; c++) { let ok = true; const id = k => (r + az * k) * Gd.cols + c + ax * k;
      for (let k = 0; k < 5 && ok; k++) { const i = id(k); if (Gd.cells[i] !== 1 || !Number.isFinite(Gd.heights[i])) ok = false; else if (k && !(Gd.heights[i] - Gd.heights[id(k - 1)] > .5 && Gd.heights[i] - Gd.heights[id(k - 1)] < 2.6)) ok = false; } if (!ok) continue;
      const [x0, z0] = at(c, r), top = Gd.heights[id(4)] + 6, bot = Gd.heights[id(0)] - 4, N = 48, L = 4 * Gd.cell, hs = [];
      for (let n = 0; n <= N; n++) { const h = floorAt(x0 + ax * L * n / N, z0 + az * L * n / N, top, bot); if (h === null) { ok = false; break; } hs.push(h); } if (!ok) continue;
      let risers = 0, flat = 0; for (let n = 1; n < hs.length; n++) { const d = hs[n] - hs[n - 1]; if (d > .7) risers++; else if (Math.abs(d) < .12) flat++; }
      if (risers >= 3 && risers + flat >= N - 2) { const [x, z] = at(c + ax * 4, r + az * 4); return { x, z, y: Gd.heights[id(4)], dx: -ax, dz: -az, risers, flat, from: [x0, z0] }; } }
    return null; })();
  report.stairs = stairs;
  const ragFiles = []; let pin = null;
  for (const cs of cases) {
    const v0 = victims[vi++]; if (!v0) break; const v = g().arena.bots.find(x => x.name === v0.name) || v0, vk = key(v.name);   // (the bot as the new round has it)
    if (cs.stairs && stairs) { v.x = stairs.x; v.z = stairs.z; v.y = stairs.y; await p.waitForTimeout(700);
      // (r2) wait until this computer draws the bot there (its interpolated body, not only the host's record)
      const t1 = Date.now(); let d = Infinity; while (Date.now() - t1 < 8000) { v.x = stairs.x; v.z = stairs.z; v.y = stairs.y; d = await p.evaluate(([n, x, z]) => { const m = [...__infra.lab.lan.models.values()].find(q => q.name === n); return m ? Math.hypot(m.g.position.x - x, m.g.position.z - z) : Infinity; }, [v.name, stairs.x, stairs.z]); if (d < .5) break; await p.waitForTimeout(200); }
      report.stairs.drawnOff = +d.toFixed(2); pin = setInterval(() => { v.x = stairs.x; v.z = stairs.z; v.y = stairs.y; }, 10); }   // (r2: held there until the kill — the host's freeze-time bot logic walks it back to its spawn, and a body killed walking flew off with that speed)
    const fy = cs.stairs && stairs ? stairs.y : feetOf(v), yaw = v.yaw || 0;
    // you stand 16 units off its side, looking at its chest (a good view of the fall)
    const side = cs.stairs && stairs ? [0, 1] : [Math.cos(yaw), -Math.sin(yaw)], dist = cs.wid === 'he' ? 26 : 17, ex = v.x + side[0] * dist, ez = v.z + side[1] * dist;
    if (cs.stairs && stairs) await p.evaluate(([x, z, y, sx, sz, dx, dz]) => __infra.lab.look(x + sx * 15 - dx * 3, z + sz * 15 - dz * 3, x + dx * 3, y + 1, z + dz * 3, y + 13), [v.x, v.z, fy, -stairs.dz, stairs.dx, stairs.dx, stairs.dz]);   /* (r2: from the stairs' side, the steps down in view) */ else await p.evaluate(([ex, ez, x, y, z, ey]) => __infra.lab.look(ex, ez, x, y, z, ey), [ex, ez, v.x, fy + 4, v.z, fy + 9.7 + 3]); await p.waitForTimeout(500);
    const now = Date.now(), wp = weaponById(cs.wid) || { id: cs.wid, name: cs.wid };
    // the bullet from your side... a body shot from in front of it, a head shot, an HE beside it, stairs: pushed down them
    let dx = -side[0], dz = -side[1]; if (cs.stairs && stairs) { dx = stairs.dx; dz = stairs.dz; }
    if (cs.wid === 'he') { g().combat.nades ??= []; g().combat.nades.push({ id: 'dshe' + now, kind: 'he', by: 'Tester', phase: 'boom', x: v.x - dx * 3.5, y: fy + .6, z: v.z - dz * 3.5, at: now, firedAt: now }); const r = CL.hurt(G, 'Tester', v.name, { id: 'he', name: 'HE Grenade' }, cs.dmg, 'chest', now); report.rag[cs.tag] = { down: !!r.down }; }
    else { const r = CL.hurt(G, 'Tester', v.name, wp, cs.dmg, cs.zone, now); const hy = fy + (cs.zone === 'head' ? 10.2 : 7.9); CL.bleed(G, v.name, r, v.x - dx * 1.4, hy, v.z - dz * 1.4, dx, 0, dz, now); report.rag[cs.tag] = { down: !!r.down, rg: g().combat.down[vk]?.rg, z: g().combat.down[vk]?.z || 'chest' }; }
    if (pin) { clearInterval(pin); pin = null; } const t0 = Date.now(); const fr = [];
    if (cs.stairs) { await p.waitForTimeout(60); report.rag.stairs.atKill = await p.evaluate(n => { const m = [...__infra.lab.lan.models.values()].find(q => q.name === n); const r = m?.cs?.ragdoll; return m ? { g: [m.g.position.x, m.g.position.z], vx: m.vx, vz: m.vz, speed: m.speed, x0: r ? [...r.sim.X.slice(15, 18)] : null, steps: r?.sim.steps } : null; }, v.name); }
    for (const t of [150, 500, 1000, 2500]) { const w = t - (Date.now() - t0); if (w > 0) await p.waitForTimeout(w); fr.push(await shot(`rag-${cs.tag}-${t}`, `${cs.what} · ${(t / 1000).toFixed(2)} s`)); }
    ragFiles.push(fr);
    await p.waitForTimeout(3600); const st = await bodyState(v.name); let floor = fy; if (cs.stairs && st?.pel && bx.nadeMesh?.first) { let lo = Infinity; for (const b of st.bones) { const w = bx.nadeMesh.first(b[1], b[2] + 2, b[3], b[1], b[2] - 30, b[3]); if (Number.isFinite(w)) lo = Math.min(lo, b[2] + 2 - 32 * w); } if (Number.isFinite(lo)) floor = lo; report.rag.stairs.floorUnder = floor; }   /* (r2: on stairs, the step under the body — it may slide down them) */ report.rag[cs.tag].state = st;
    if (st) { const pel = st.pel; const moved = pel ? (pel[0] - v.x) * dx + (pel[2] - v.z) * dz : 0; report.rag[cs.tag].moved = +moved.toFixed(2);
      check(`ragdoll, ${cs.what}: it lies on the floor — no part under it (lowest bone ${(st.low - floor).toFixed(2)} u over the floor)` , st.low > floor - .6, JSON.stringify(st.bones));
      if (cs.wid !== 'he' && !cs.stairs) check(`ragdoll, ${cs.what}: pushed the way the bullet went (pelvis ${moved.toFixed(2)} u along it)`, moved > -.5, moved); }
  }
  check('the ragdolls sleep once settled (none active 6 s on)', (await p.evaluate(async () => (await import('/gd-ragdoll.js')).activeRagdolls())) === 0);
  // sheets (ffmpeg tiles; labels drawn in the page)
  const tile = (files, cols, to) => { const n = files.length, rows = Math.ceil(n / cols), inputs = files.flatMap(f => ['-i', f]), sc = files.map((_, i) => `[${i}:v]scale=853:480[s${i}]`).join(';'), lay = files.map((_, i) => `${(i % cols) * 853}_${Math.floor(i / cols) * 480}`).join('|');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${sc};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${lay}:fill=black`, '-q:v', '3', to]); return to; };
  report.sheetRag = tile(ragFiles.flat(), 4, SHEET_RAG || path.join(out, 'ragdoll.jpg'));
  report.sheetCam = tile(camFrames, 4, SHEET_CAM || path.join(out, 'deathcam.jpg'));
  check('no page errors', !errs.length, errs.join(' | '));
} catch (e) { failed++; console.log('FAIL ' + (e?.stack || e)); }
finally { writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1)); await b.close().catch(() => {}); await room.close?.().catch?.(() => {}); }
console.log(failed ? `FAIL: gd-death-shots · ${failed} failed` : 'PASS: gd-death-shots'); process.exit(failed ? 1 : 0);
