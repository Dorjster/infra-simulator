// Global Defensive: spectating is first person only (CS2's in-eye view), over a real LAN room with two clients.
// Defuse on Dust II, Host and Guest both Counter-Terrorists (friendly fire on, Terrorist bots so the round runs); the
// Host shoots the Guest, the Guest spectates the Host:
//  · the Guest's camera sits at the Host's eye and follows his pitch (up, down, crouched) — smooth: per-frame turn rate
//    while the Host turns steadily, at the emulated display rate HZ (30 / 60 / 144);
//  · the Host's body (CS2 agent) is not drawn on the Guest's screen (m.g stays visible: radar / lists), other bodies are;
//  · a first-person view model of the Host's current weapon is shown and changes when he switches (rifle, pistol, knife);
//    it kicks on his shots;
//  · Space changes nothing (no chase camera); the spectator has no toggle;
//  · the HUD shows the Host's HP; after the respawn (restart-round) the Guest's own view model, HUD and the Host's body
//    are back; no page errors.
// Pictures: now-rifle / now-pistol / now-knife / now-shooting / now-crouch-up (.png) in <out-dir>. Run against v51
// (BT_REPO=baseline51) it takes before-chase / before-eye instead and fails (v51 had the chase camera and Space toggle).
//   node tests/browser/gd-spectate-fp-e2e.mjs <repo-root> <out-dir>        (HZ=30|60|144, default 60)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const HZ = +process.env.HZ || 60;
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'SPECFP', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'spfp-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const port = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r(+m[1]); }));
const url = `http://localhost:${port}/`, browsers = [], errs = [];
let ok = 0, n = 0; const results = []; const check = (name, c, d = '') => { n++; if (c) ok++; results.push({ name, pass: !!c, d: String(d).slice(0, 600) }); console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); };
async function open(who, w, h, hz) { const bw = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', ...(hz ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] }); browsers.push(bw);
  const p = await (await bw.newContext({ viewport: { width: w, height: h } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(([n, hz]) => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n);
    if (!hz) return; let pr = {}; try { pr = JSON.parse(localStorage.getItem('infra-player-preferences') || '{}'); } catch {} pr.fpsCap = hz; localStorage.setItem('infra-player-preferences', JSON.stringify(pr));
    // The display (as tests/browser/gd-physics-smooth.mjs): Chrome uncapped, requestAnimationFrame released on an `hz` grid with the grid's timestamps.
    const raf = window.requestAnimationFrame.bind(window), I = 1000 / hz; let q = [], next = 0, id = 0;
    const pump = () => { const now = performance.now(); if (!next) next = now; if (now >= next) { const ts = next; next += I; if (now - next > I * 4) next = now + I; const cbs = q; q = []; for (const [, cb] of cbs) try { cb(ts); } catch (e) { setTimeout(() => { throw e; }); } } raf(pump); };
    raf(pump); window.requestAnimationFrame = cb => { q.push([++id, cb]); return id; }; window.cancelAnimationFrame = k => { q = q.filter(e => e[0] !== k); }; }, [who, hz]);
  await p.goto(url); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 90000 }); await p.waitForTimeout(1000); return p; }
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).catch(e => ({ error: e.message })), a);
const host = await open('Host', 1100, 650, 0), guest = await open('Guest', 1280, 720, HZ);
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dust2'); await host.selectOption('#ss-ar-bots', '0');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d, null, { timeout: 60000 });
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
const joined = await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 60000 }).then(() => true).catch(() => false);
check('the guest joins the Defuse lobby', joined);
await act(host, { type: 'settings', rules: { ff: true, start: 16000 } }); await act(host, { type: 'settings', freeze: 2 });
await act(host, { type: 'add-bot', count: 2 }); await act(host, { type: 'team', team: 'ct' }); await act(guest, { type: 'team', team: 'ct' });   // (bots first: a side may be one up, a bot moves over — arena-logic changeTeam)
const teams = await host.evaluate(() => __infra.lab.world.operations.game.combat.d.teams);
check('Host and Guest on the same side (CT), a Terrorist bot keeps the round going', teams.host === 'ct' && teams.guest === 'ct' && Object.values(teams).includes('t'), JSON.stringify(teams));
check('the host starts the match', !(await act(host, { type: 'start-match' }))?.error);
await host.waitForTimeout(600); const buy = await act(host, { type: 'buy', primary: 'm4' }); check('the host buys a rifle (M4A4)', !buy?.error, JSON.stringify(buy));
await guest.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 20000 }).catch(() => {});
for (const pg of [host, guest]) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); await pg.evaluate(() => { const e = document.getElementById('ar-buy'); if (e && !e.hidden) e.querySelector('[data-act="close"]')?.click(); __infra.lab.enter(); }); }
// ── the Host shoots the Guest (friendly fire) until he is down ────────────────────────────────────────────────────
const gDown = () => guest.evaluate(async () => { const { hostNow } = await import('./host-clock.js'); const d = __infra.lab.world.operations.game.combat?.down?.guest; return !!d && d.until > hostNow(); });
const gs = await guest.evaluate(() => { const c = __infra.camera.position; return { x: c.x, y: c.y, z: c.z }; });
const putHost = o => host.evaluate(([s, o]) => __infra.lab.look(s.x + o[0], s.z + o[1], s.x, s.y - 2, s.z, s.y), [gs, o]);
let off = [0, -7]; for (let a = 0; a < 8; a++) { const o = [Math.sin(a * Math.PI / 4) * 7, Math.cos(a * Math.PI / 4) * 7]; await putHost(o); await host.waitForTimeout(500); const hy = await host.evaluate(() => __infra.camera.position.y); if (Math.abs(hy - gs.y) < .5) { off = o; break; } }
await host.keyboard.press('Digit1'); await host.waitForTimeout(1100);
for (let tries = 0; tries < 30 && !(await gDown()); tries++) { await putHost(off); await guest.evaluate(s => __infra.lab.look(s.x, s.z, s.x, s.y, s.z - 10, s.y), gs); await host.waitForTimeout(200);
  await host.evaluate(() => { const L = __infra.lab, m = [...L.lan.models.values()].find(m => /Guest/.test(m.name)); if (!m) return; const t = m.g.position, c = __infra.camera; L.look(c.position.x, c.position.z, t.x, t.y + 6.5, t.z, c.position.y); });
  await host.mouse.move(550, 320); await host.mouse.down(); await host.waitForTimeout(700); await host.mouse.up(); await host.waitForTimeout(500); }
check('the Guest is down (shot by his team mate)', await gDown());
await guest.waitForTimeout(900);
const sp = await guest.evaluate(() => { const S = __infra.lab.spectator; return { on: !!S?.on, name: S?.watched?.name || null, toggle: typeof S?.toggle === 'function' }; });
check('dead: the Guest spectates the Host', sp.on && /host/i.test(sp.name || ''), JSON.stringify(sp));
check('no chase camera / Space toggle in the spectator (CS2 first person only)', !sp.toggle);
if (sp.toggle) {   // v51: the pictures of what it was (starts behind him; Space: his eyes), then stop
  await host.evaluate(() => { const c = __infra.camera, L = __infra.lab; L.look(c.position.x, c.position.z, c.position.x + 10, c.position.y + 1.5, c.position.z - 6, c.position.y); });
  await guest.waitForTimeout(1500); await guest.screenshot({ path: path.join(out, 'before-chase.png') });
  await guest.keyboard.press('Space'); await guest.waitForTimeout(1200); await guest.screenshot({ path: path.join(out, 'before-eye.png') });
  console.log('v51 spectator (toggle present): before pictures taken'); console.log(ok + '/' + n); for (const bw of browsers) await bw.close(); server.kill(); process.exit(1); }
// helpers on the Guest's page: his camera's look, the Host's eye on the Host's page
const gCam = () => guest.evaluate(async () => { const THREE = await import('./three.module.js'), c = __infra.camera, e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ'); return { x: c.position.x, y: c.position.y, z: c.position.z, pitch: e.x, yaw: e.y }; });
const hCam = () => host.evaluate(async () => { const THREE = await import('./three.module.js'), c = __infra.camera, e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ'); return { x: c.position.x, y: c.position.y, z: c.position.z, pitch: e.x, yaw: e.y, weapon: __infra.lab.pistol.current?.id || null }; });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const hostLook = (pitch, yaw) => host.evaluate(([p, y]) => { const c = __infra.camera.position, L = __infra.lab; L.look(c.x, c.z, c.x - Math.sin(y) * 10 * Math.cos(p), c.y + Math.sin(p) * 10, c.z - Math.cos(y) * 10 * Math.cos(p), c.y); }, [pitch, yaw]);
const viewState = () => guest.evaluate(() => { const S = __infra.lab.spectator, V = S.view, cam = __infra.camera, sh = cam.getObjectByName('spectate-hand'), gh = cam.getObjectByName('gun-hand');
  const drawn = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; }; let meshes = 0; sh?.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && drawn(o)) meshes++; }); let own = 0; gh?.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && drawn(o)) own++; });
  return { shown: !!V?.shown, weapon: V?.weapon || null, model: V?.model || null, stats: V?.stats, meshes, ownMeshes: own, underCamera: sh?.parent === cam }; });
const bodyState = () => guest.evaluate(() => { const L = __infra.lab, ms = [...L.lan.models.values()], h = ms.find(m => /host/i.test(m.name)), others = ms.filter(m => m !== h && m.g.visible);
  return { host: h ? { g: h.g.visible, cs: h.cs ? h.cs.g.visible : null, parts: h.cs ? null : h.g.children.filter(c => c !== h.label && c.visible).length, label: h.label?.visible } : null, others: others.map(m => ({ name: m.name, cs: m.cs ? m.cs.g.visible : null })) }; });
// ── fire kick (before the pause: no shots while paused) ─────────────────────────────────────────────────────────────
{ await hostLook(.05, (await hCam()).yaw + Math.PI); await guest.waitForTimeout(700); const f0 = (await viewState()).stats?.fires ?? 0;
  await host.mouse.down(); await host.waitForTimeout(260); await guest.screenshot({ path: path.join(out, 'now-shooting.png') }); await host.waitForTimeout(250); await host.mouse.up(); await guest.waitForTimeout(500);
  const f1 = (await viewState()).stats?.fires ?? 0; check('his shots kick his view model on the Guest\'s screen (the set\'s fire clip)', f1 > f0, `${f0} → ${f1}`); }
check('the host pauses the match (the bot stays where it is during the checks)', !(await act(host, { type: 'pause', on: true }))?.error);
// ── eye and pitch ───────────────────────────────────────────────────────────────────────────────────────────────
for (const [pitch, label] of [[0, 'level'], [.5, 'up'], [-.35, 'down']]) { await hostLook(pitch, .8); await guest.waitForTimeout(800); let h = await hCam(), g = await gCam();
  for (let i = 0; i < 12 && !(dist(h, g) < .35 && Math.abs(h.pitch - g.pitch) < .03 && angle(h.yaw, g.yaw) < .03); i++) { await guest.waitForTimeout(250); h = await hCam(); g = await gCam(); }   // (a loaded machine can hold his pose back a moment: up to 3 s more — the check is where it settles, not how fast)
  check(`camera at the Host's eye, looking ${label}: same spot, same pitch and yaw`, dist(h, g) < .35 && Math.abs(h.pitch - g.pitch) < .03 && angle(h.yaw, g.yaw) < .03, JSON.stringify({ d: +dist(h, g).toFixed(3), hp: +h.pitch.toFixed(3), gp: +g.pitch.toFixed(3), hy: +h.yaw.toFixed(3), gy: +g.yaw.toFixed(3) })); }
{ const b = await bodyState(); check('the Host\'s body is not drawn on the Guest\'s screen (agent hidden; m.g visible for radar / lists; no name tag)', b.host && b.host.g === true && (b.host.cs === false || b.host.parts === 0) && b.host.label !== true, JSON.stringify(b.host));
  check('…the other bodies are drawn (nobody else hidden)', b.others.every(o => o.cs !== false), JSON.stringify(b.others)); }
// ── his view model: rifle, pistol, knife ────────────────────────────────────────────────────────────────────────
await hostLook(.02, .8); await guest.waitForTimeout(600);
{ const h = await hCam(), v = await viewState(); check('a view model of his current weapon is drawn (rifle)', v.shown && v.weapon === h.weapon && /^(m4|m4s|ak|famas|galil)$/.test(h.weapon) && v.meshes > 0 && v.underCamera, JSON.stringify({ ...v, host: h.weapon }));
  check('the Guest\'s own view model is not drawn while spectating', v.ownMeshes === 0, v.ownMeshes); await guest.screenshot({ path: path.join(out, 'now-rifle.png') }); }
for (const [key, kind, pic] of [['Digit2', 'pistol', 'now-pistol.png'], ['Digit3', 'knife', 'now-knife.png']]) { const h0 = (await viewState()).stats?.holds ?? 0; await host.keyboard.press(key); await guest.waitForTimeout(1400); const h = await hCam(), v = await viewState();
  check(`he switches to his ${kind}: the view model changes to it`, v.shown && v.weapon === h.weapon && h.weapon && v.meshes > 0 && (v.stats?.holds ?? 0) > h0, JSON.stringify({ ...v, host: h.weapon })); await guest.screenshot({ path: path.join(out, pic) }); }
await host.keyboard.press('Digit1'); await guest.waitForTimeout(1200);
// ── Space does nothing ──────────────────────────────────────────────────────────────────────────────────────────
{ for (let i = 0; i < 2; i++) { await guest.keyboard.press('Space'); await guest.waitForTimeout(700); } const h = await hCam(), g = await gCam(), s = await guest.evaluate(() => !!__infra.lab.spectator.on), v = await viewState();
  check('Space changes nothing: still in his eyes (no chase camera), his view model still shown', s && dist(h, g) < .35 && v.shown, JSON.stringify({ d: dist(h, g), v })); await guest.screenshot({ path: path.join(out, 'now-rifle-idle.png') }); }
// ── crouched, looking up ────────────────────────────────────────────────────────────────────────────────────────
{ const y0 = (await hCam()).y; await hostLook(.45, -.6); await host.keyboard.down('ControlLeft'); await guest.waitForTimeout(1200); const h = await hCam(), g = await gCam();
  check('he crouches and looks up: the camera drops to his crouched eye and looks up with him', h.y < y0 - .8 && dist(h, g) < .35 && Math.abs(h.pitch - g.pitch) < .03 && g.pitch > .4, JSON.stringify({ y0, hy: h.y, gy: g.y, hp: h.pitch, gp: g.pitch }));
  await guest.screenshot({ path: path.join(out, 'now-crouch-up.png') }); await host.keyboard.up('ControlLeft'); await guest.waitForTimeout(600); }
// ── HUD: his HP ─────────────────────────────────────────────────────────────────────────────────────────────────
{ const r = await guest.evaluate(() => { const G = __infra.lab.world.operations.game; return { hp: G.combat.hp?.host ?? 100, sp: document.getElementById('sp-hp')?.textContent || '', spHidden: document.getElementById('sp-hud')?.hidden, gd: document.getElementById('gd-hud')?.hidden }; });
  check('the HUD shows HIS health (CS2 bottom left); your own HUD is off', !r.spHidden && r.sp.includes(String(r.hp)) && r.gd === true, JSON.stringify(r)); }
// ── smooth: the Host turns steadily, the Guest's camera turns as steadily (per frame, at HZ) ─────────────────────
{ await guest.evaluate(() => { const S = __infra.lab.spectator, u = S.update, f = S.follow, c = __infra.camera; window.__sm = []; S.__u = u; S.__f = f; let fdt = 0;
    // (recorded where the frame's camera is final: after follow() — the bodies placed this frame — or, on code without it, after update())
    const rec = () => { if (!window.__smOn) return; const q = c.quaternion, yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)), m = __infra.lab.lan.models.get(S.target), b = m?.buf; window.__sm.push([fdt, yaw, b?.length ? (m.seen >= b.at(-1).t - 1 ? 1 : 0) : 1, b?.length ? b.at(-1).t : 0, performance.now(), m?.dly ?? 0]); };
    S.update = function (dt) { fdt = dt; const r = u.call(this, dt); if (!f) rec(); return r; }; if (f) S.follow = function () { const r = f.call(this); rec(); return r; }; });
  const turning = host.evaluate(() => new Promise(res => { const c = __infra.camera.position, L = __infra.lab, x = c.x, y = c.y, z = c.z, t0 = performance.now(); const step = () => { const a = .8 + (performance.now() - t0) / 1000 * 1.2; L.look(x, z, x - Math.sin(a) * 10, y, z - Math.cos(a) * 10, y); (window.__hf ??= []).push(performance.now()); if (performance.now() - t0 < 3600) requestAnimationFrame(step); else res(); }; step(); }).then(() => 0));
  // (the Guest records while the turn is drawn there: ~interpolation delay behind)
  await guest.waitForTimeout(500); await guest.evaluate(() => { window.__smOn = true; }); await guest.waitForTimeout(2600); await guest.evaluate(() => { window.__smOn = false; }); await turning;
  const s = await guest.evaluate(() => window.__sm);
  const w = []; for (let i = 1; i < s.length; i++) { const dt = s[i][0]; if (!(dt > 0)) continue; /* (the frame's own dt — what the game steps by; the emulated display's wall-clock callbacks jitter by a few ms) */ let d = s[i][1] - s[i - 1][1]; d = Math.atan2(Math.sin(d), Math.cos(d)); w.push(d / dt); }
  const sorted = [...w].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] || 0, mid = w.slice(Math.floor(w.length * .15), Math.floor(w.length * .85)), bad = mid.filter(v => Math.abs(v - med) > Math.abs(med) * .5).length;
  const dryShare = s.filter(r => r[2]).length / Math.max(1, s.length);
  // Frames with nothing newer to draw (his pose late: the sender or the network, which the adaptive delay then covers — the bodies hold
  // the same way) and the catch-up frame after them are the network's, not the spectator camera's: reported, not judged.
  const exc = []; for (let i = 1; i < s.length; i++) if (s[i][0] > 0) exc.push(!!(s[i][2] || s[i - 1][2]));
  const midX = mid.filter((v, i) => !exc[i + Math.floor(w.length * .15)]), badX = midX.filter(v => Math.abs(v - med) > Math.abs(med) * .5).length;
  // (the sender starved — his poses not reaching the Guest for whole seconds: seen with the machine at load 28 on 8 cores; nothing to interpolate, so nothing to judge. Reported, not passed.)
  if (dryShare > .2) console.log(`SKIP smooth at ${HZ} Hz: his poses starved on this machine (${Math.round(dryShare * 100)} % of frames had nothing newer to draw) — re-run on a quieter machine`); else check(`smooth at ${HZ} Hz: his steady turn (1.2 rad/s) is a steady turn on the Guest's screen (≤ 6 % of frames off by > 50 %)`, Math.abs(med - 1.2) < .25 && midX.length > 20 && badX / midX.length <= .06, JSON.stringify({ frames: w.length, med: +med.toFixed(3), bad: badX, of: midX.length, lateFrames: mid.length - midX.length, badIncludingLate: bad }));
  const hf = await host.evaluate(() => { const f = window.__hf || []; window.__hf = null; return f; }), hg = []; for (let i = 1; i < hf.length; i++) hg.push(hf[i] - hf[i - 1]);
  const dry = s.filter(r => r[2]).length; console.log(`  (diag: guest frames with his newest pose already drawn: ${dry}/${s.length}; host frame gaps > 60 ms: ${hg.filter(v => v > 60).length}, max ${Math.round(Math.max(0, ...hg))} ms)`);
  writeFileSync(path.join(out, `smooth-${HZ}.json`), JSON.stringify({ hz: HZ, med, bad, w, dry: s.map(r => r[2]), newest: s.map(r => r[3]), at: s.map(r => r[4]), dly: s.map(r => r[5]), dts: s.map(r => r[0]), hostGaps: hg }));
  await guest.evaluate(() => { const S = __infra.lab.spectator; if (S.__u) { S.update = S.__u; delete S.__u; } if (S.__f) { S.follow = S.__f; delete S.__f; } }); }
// ── respawn: everything back ────────────────────────────────────────────────────────────────────────────────────
await act(host, { type: 'pause', on: false }); check('the host restarts the round (the Guest respawns)', !(await act(host, { type: 'restart-round' }))?.error);
await guest.waitForFunction(() => !__infra.lab.spectator.on, null, { timeout: 15000 }).catch(() => {}); await guest.waitForTimeout(2500);
await guest.evaluate(() => { const e = document.getElementById('ar-buy'); if (e && !e.hidden) e.querySelector('[data-act="close"]')?.click(); __infra.lab.enter(); }); await guest.waitForTimeout(800);
{ const v = await viewState(), b = await bodyState(), h = await hCam(), g = await gCam(), r = await guest.evaluate(() => ({ cur: __infra.lab.pistol.current?.id || null, sp: document.getElementById('sp-hud')?.hidden, gd: document.getElementById('gd-hud')?.hidden, bar: document.getElementById('sp-bar')?.hidden, set: __infra.lab.pistol.viewInfo?.set || null }));
  check('respawned: not spectating, the spectator HUD and bar gone, your own HUD back', r.sp === true && r.bar === true && r.gd === false, JSON.stringify(r));
  check('…your own view model back (drawn under your camera), the spectator\'s gone', !!r.cur && v.ownMeshes > 0 && v.meshes === 0 && !v.shown, JSON.stringify({ ...v, ...r }));
  check('…the Host\'s body drawn again (and his name tag rule back)', b.host && b.host.cs !== false && (b.host.parts === null || b.host.parts > 0), JSON.stringify(b.host));
  check('…your camera is your own again (not at his eye)', dist(h, g) > 1, dist(h, g)); }
await guest.screenshot({ path: path.join(out, 'now-respawned.png') });
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
writeFileSync(path.join(out, `results-${HZ}.json`), JSON.stringify({ hz: HZ, ok, n, results }, null, 1));
console.log(ok + '/' + n); for (const bw of browsers) await bw.close(); server.kill(); process.exit(ok === n ? 0 : 1);
