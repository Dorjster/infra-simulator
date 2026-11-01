// Global Defensive physics motion, measured frame by frame in a real browser (package P: "all in game physics looks so
// laggy"): every grenade kind thrown (flight, bounces, roll, the pose it comes to rest in), dropped guns (G's toss: flight
// and settle) and, on a CS2 map with prop_physics, the props an HE throws about. Each drawn frame (the game's own frames:
// lab.update wrapped, so a frame the frame gate skips is not counted) records every moving object's drawn position on
// the game's clock (the sum of the frames' dt), then per object: holds (a frame that drew it where it already was while
// it is moving — a 32 Hz step under a 60 / 144 Hz frame rate), zig-zags (forward-back-forward: a correction pulled it
// back), teleports (a step at over 4× the flight's median speed and > 0.3 units), the frame-to-frame speed change (median / p95 of
// |Δspeed| / speed, bounce frames left out), speed spikes (up then down frame to frame: the smaller change of the speed —
// a stall-and-race) and the landing pop (how far the model jumps when it comes to rest).
// The display's refresh `hz`: Chrome runs uncapped (--disable-frame-rate-limit) and the page's requestAnimationFrame is
// released on an `hz` grid with the grid's timestamps, so the game's frame gate (app.js) sees a 144 Hz display; the cap
// is `hz` (every refresh drawn) or CAP=auto (the default "Auto · 60": 144 Hz then draws 13.9 / 20.8 ms gaps). mode=host: one page (the room's own page on this
// computer); mode=guest: the host page plus a guest through a Wi-Fi relay (15–40 ms each way, 1 % of chunks held 250
// ms: tests/browser/gd-lan-wifi-e2e.mjs) — the guest and the host both throw and drop, both pages measure.
// Gates (GATE=0: report only, for the released build's numbers): no holds while moving, no zig-zags, no teleports (those
// right after a starved host tick — the room's simulation itself running slow on a loaded machine — reported apart),
// speed spikes p95 ≤ 0.05 for flights, landing pop ≤ 0.25 units.
//   node tests/browser/gd-physics-smooth.mjs <repo-root> <out-dir> [hz=60] [mode=host|guest]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import net from 'node:net';
const [root, out, hzArg, modeArg] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const HZ = +hzArg || 60, MODE = modeArg === 'guest' ? 'guest' : 'host', GATE = process.env.GATE !== '0', CAP = process.env.CAP === 'auto' ? 0 : +process.env.CAP || HZ;   // (CAP=auto: the default "Auto · 60" cap on that display — 144 Hz then draws 2-3-2-3 refreshes apart)
const lanIp = MODE === 'guest' ? (() => { const all = Object.entries(os.networkInterfaces()).flatMap(([n, l]) => (l || []).map(i => ({ n, ...i }))).filter(i => i.family === 'IPv4' && !i.internal); return (all.find(i => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) || all[0])?.address || '127.0.0.1'; })() : '127.0.0.1';
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: MODE === 'guest' ? '0.0.0.0' : '127.0.0.1', ROOM_CODE: 'PHYS01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'ps-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const port = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r(+m[1]); }));
const W = { oneWay: 0, jitter: 0, loss: 0, hold: 250 };
const pipe = (from, to) => { let last = 0; from.on('data', buf => { const now = Date.now(); let d = W.oneWay + Math.random() * W.jitter; if (W.loss && Math.random() < W.loss) d += W.hold; const at = Math.max(last, now + d); last = at; if (at <= now) to.write(buf); else setTimeout(() => { if (!to.destroyed) to.write(buf); }, at - now); }); };
let relayPort = 0; if (MODE === 'guest') { const relay = net.createServer(c => { const s = net.connect(port, lanIp); const end = () => { c.destroy(); s.destroy(); }; c.on('error', end); s.on('error', end); c.on('close', end); s.on('close', end); pipe(c, s); pipe(s, c); }); relayPort = await new Promise(r => relay.listen(0, lanIp, () => r(relay.address().port))); }
const browsers = [], errs = []; let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : GATE ? 'FAIL ' : 'INFO ') + name + (d !== '' ? ' · ' + String(d).slice(0, 500) : '')); };
async function open(who, url, w = 960, h = 600) { const bw = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-frame-rate-limit', '--disable-gpu-vsync'] }); browsers.push(bw);
  const p = await (await bw.newContext({ viewport: { width: w, height: h } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(([n, hz, cap]) => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); let pr = {}; try { pr = JSON.parse(localStorage.getItem('infra-player-preferences') || '{}'); } catch {} pr.fpsCap = cap; pr.graphics = 'Low'; localStorage.setItem('infra-player-preferences', JSON.stringify(pr));
    // The display: Chrome runs uncapped and rAF callbacks are released on a `hz` grid with the grid's timestamp (vsync-aligned, as a real display's are).
    // A 2-pixel corner square changes every tick: uncapped Chrome idles its frames for ~40 ms when a few in a row draw
    // nothing (the frame gate skipping refreshes under the Auto cap) — a real display's refresh never stops.
    const raf = window.requestAnimationFrame.bind(window), I = 1000 / hz; let q = [], next = 0, id = 0, dmg = null, flip = 0;
    const pump = () => { const now = performance.now(); if (!dmg && document.body) { dmg = document.createElement('div'); dmg.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;z-index:99999;pointer-events:none;background:#000'; document.body.appendChild(dmg); } if (dmg) dmg.style.opacity = (flip ^= 1) ? '.98' : '1'; if (!next) next = now; if (now >= next) { const ts = next; next += I; if (now - next > I * 4) next = now + I; const cbs = q; q = []; for (const [, cb] of cbs) try { cb(ts); } catch (e) { setTimeout(() => { throw e; }); } } raf(pump); };
    raf(pump); window.requestAnimationFrame = cb => { q.push([++id, cb]); return id; }; window.cancelAnimationFrame = k => { q = q.filter(e => e[0] !== k); }; }, [who, HZ, CAP]);
  await p.goto(url, { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 90000 }); await p.waitForTimeout(1000); return p; }
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).catch(e => ({ error: e.message })), a);
const host = await open('Host', `http://127.0.0.1:${port}/`); const pages = [host];
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-bots', '0').catch(() => {});
if (process.env.MAP) await host.selectOption('#ss-ar-kind', 'practice').then(() => host.waitForTimeout(200)).then(() => host.selectOption('#ss-ar-map', process.env.MAP, { timeout: 5000 }))   /* (practice: any map) */.catch(e => console.log('(map ' + process.env.MAP + ': ' + e.message.split('\n')[0] + ')'));   // (MAP=mirage: a CS2 map with prop_physics, from user-maps)
if (MODE === 'guest') { await host.selectOption('#ss-ar-kind', 'deathmatch').catch(() => {}); await host.evaluate(() => document.getElementById('ss-ar-host').click()); }
else await host.evaluate(() => document.getElementById('ss-ar-solo').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 90000 }); await host.waitForTimeout(800);
let guest = null;
if (MODE === 'guest') { const code = await host.evaluate(() => __infra.lab.lan.roomCode); guest = await open('Guest', `http://${lanIp}:${relayPort}/`, 900, 560); pages.push(guest);
  await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
  await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 90000 }); await guest.waitForTimeout(800);
  await act(host, { type: 'start-match' }); await host.waitForTimeout(1500); Object.assign(W, { oneWay: 15, jitter: 25, loss: .01 }); }
for (const p of pages) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(100); await p.evaluate(() => __infra.lab.enter()); }
// The collector: every drawn frame (after lab.update), the drawn position of each grenade model, dropped gun and awake prop.
const collect = p => p.evaluate(() => { const L = __infra.lab, M = globalThis.__PS = { tracks: {}, t: 0, frames: 0, dts: [], clk: [], lastClk: undefined, on: true }; const S = L.arenaScene, ng = () => __infra.scene.getObjectByName('nades');
  let grounds = [], scanAt = 0; const rec = (key, kind, phase, x, y, z) => { const T = M.tracks[key] ??= { kind, f: [] }; if (kind && kind !== 'mine') T.kind = kind; T.f.push([+M.t.toFixed(5), +x.toFixed(4), +y.toFixed(4), +z.toFixed(4), phase]); };
  const sample = dt => { M.t += dt; M.frames++; M.dts.push(+(dt * 1000).toFixed(2)); const G = L.world.operations.game, list = G.combat?.nades || [], nv = L.nadeView, g = ng(); const ck = G.combat?.clock; if (ck !== M.lastClk) { M.lastClk = ck; if (Number.isFinite(ck)) M.clk.push([+M.t.toFixed(4), ck]); }   /* (each host word's clock stamp, when this page took it in) */
    if (g) for (const c of g.children) { if (c.isLine || !c.visible || c.geometry?.type === 'RingGeometry') continue; let kind = 'mine', phase = 'air'; for (const q of list) if (nv?.drawn(q.id) === c.position) { kind = q.kind; phase = q.phase; break; } rec('n' + c.id, kind, phase, c.position.x, c.position.y, c.position.z); }
    const now = performance.now(); if (now - scanAt > 200) { scanAt = now; grounds = S?.group ? S.group.children.filter(o => o.userData.ground) : []; }
    for (const o of grounds) if (o.parent) rec('g' + o.id, 'drop', 'drop', o.position.x, o.position.y, o.position.z);
    const P = S?.physProps; if (P) for (let k = 0; k < P.count; k++) if (P.awake(k)) { const d = P.drawn?.(k), a = d ? [d.x, d.y, d.z] : P.at(k); rec('p' + k, 'prop', 'prop', a[0], a[1], a[2]); }   /* (drawn: the pivot — v51 drew the state itself) */ };
  const orig = L.update; if (typeof orig === 'function' && !orig.__ps) { const w = function (dt) { const r = orig.call(this, dt); if (M.on) try { sample(dt); } catch (e) { M.err = String(e); } return r; }; w.__ps = 1; L.update = w; }
  M.wrapped = L.update.__ps === 1; });
const harvest = p => p.evaluate(() => { const M = globalThis.__PS; M.on = false; return { tracks: M.tracks, frames: M.frames, dts: M.dts, clk: M.clk, wrapped: M.wrapped, err: M.err }; });
// A clear lane to throw along (the test's own search: not counted).
const laneOf = p => p.evaluate(async () => { const { segmentClear } = await import('./arena-maps.js'); const S = __infra.lab.arenaScene, B = S.boxes, bd = S.bounds; let best = null; const c = __infra.camera.position;
  for (let x = bd.minX + 10; x < bd.maxX - 10; x += 8) for (let z = bd.minZ + 10; z < bd.maxZ - 10; z += 8) { if (Math.hypot(x - c.x, z - c.z) > 140) continue; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let L = 0; while (L < 200 && segmentClear(B, x, 4, z, x + dx * (L + 6), 4, z + dz * (L + 6)) && segmentClear(B, x, 14, z, x + dx * (L + 6), 14, z + dz * (L + 6)) && S.clear(x + dx * (L + 6), z + dz * (L + 6))) L += 6; if (L > 20 && S.clear(x, z) && (!best || L > best.L)) best = { x, z, dx, dz, L }; } }
  return best; });
const lanes = []; for (const p of pages) lanes.push(await laneOf(p));
console.log(`hz ${HZ} · mode ${MODE} · lanes ${JSON.stringify(lanes)}`);
const stand = (p, l, pitch = 0) => p.evaluate(([l, pitch]) => { __infra.lab.look(l.x, l.z, l.x + l.dx * 50, 9.7 + pitch, l.z + l.dz * 50); }, [l, pitch]);
for (const p of pages) await collect(p);
const KINDS = ['he', 'flash', 'smoke', 'decoy', 'molotov', 'incendiary'];
// Throws: each kind once per thrower — a long throw up the lane (flight, bounces), then a short one at a wall-side floor
// (a roll); dropped guns: an AK bought and dropped three times.
for (let i = 0; i < pages.length; i++) { const p = pages[i], l = lanes[i]; if (!l) continue;
  for (const [j, k] of KINDS.entries()) { const b = await act(p, { type: 'buy-nade', kind: k }); if (b?.error) { console.log(`(${k}: ${b.error})`); continue; }
    await stand(p, l, j % 2 ? 6 : 2); await p.waitForTimeout(120); await p.evaluate(([k, s]) => __infra.lab.arenaUI.throwNade(k, s), [k, j % 3 === 2 ? 'short' : 'long']); await p.waitForTimeout(2600); }
  for (let j = 0; j < 3; j++) { await act(p, { type: 'buy', primary: j % 2 ? 'm4' : 'ak' }); await p.waitForTimeout(250); await stand(p, l, j - 1); await p.waitForTimeout(120); await act(p, { type: 'drop', slot: 'primary' }); await p.waitForTimeout(1500); } }
// Props: a CS2 map's prop_physics thrown about by a blast next to the nearest one (if the map has any).
for (const p of pages) { const hasProps = await p.evaluate(() => { const P = __infra.lab.arenaScene?.physProps; if (!P?.count) return false; const c = __infra.camera.position; let best = -1, bd = Infinity; for (let k = 0; k < P.count; k++) { const a = P.at(k), d = Math.hypot(a[0] - c.x, a[2] - c.z); if (d < bd && !P.broken(k)) { bd = d; best = k; } } if (best < 0) return false; for (let k = 0; k < P.count; k++) { const a = P.at(k); if (Math.hypot(a[0] - P.at(best)[0], a[2] - P.at(best)[2]) < 12) {} } const a = P.at(best); P.blast(a[0] + 8, a[1], a[2], 14) /* (8 of the blast's 14 units away: thrown, never shattered — a pot breaks closer in) */; return true; });
  if (hasProps) await p.waitForTimeout(3000); }
const res = []; for (const p of pages) res.push(await harvest(p));
// Analysis per object (on the game's clock).
// A starved host tick: lan/room.mjs steps the world by the time since its last tick but at most 0.1 s, while stamping the
// tick's real time — a tick over STARVED_MS late (a loaded machine: other processes) leaves every grenade behind its own
// stamp, so the next word pulls each copy back by what the host lost (gap − 100 ms of flight). That is the host's
// simulation running slow, not this drawing: a teleport or zig-zag within STARVED_S of the word after such a gap counts
// as `late`, reported apart (and not gated). Found on the host page's own words (clock gaps there: it reads the room
// without the Wi-Fi relay), then for each page the moment it took in that word.
const STARVED_MS = 125, STARVED_S = .45;
function starvedOn(res) { const h = res[0]?.clk || [], stamps = []; for (let i = 1; i < h.length; i++) if (h[i][1] - h[i - 1][1] > STARVED_MS) stamps.push(h[i][1]);
  return res.map(r => { const c = r.clk || [], out = []; let j = 0; for (const st of stamps) { while (j < c.length && c[j][1] < st) j++; if (j < c.length) out.push(c[j][0]); } return out; }); }
const EPS = 5e-4;   // (units: positions are recorded to 1e-4 — a step under this is no motion)
const q = (a, f) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
function judge(T, starved = []) { const f = T.f; if (f.length < 4) return null; const air = T.kind === 'drop' || T.kind === 'prop' ? f : f.filter(r => r[4] === 'air');
  // the moving window: first to last frame it moved (in flight for a grenade)
  const st = []; for (let i = 1; i < air.length; i++) st.push(Math.hypot(air[i][1] - air[i - 1][1], air[i][2] - air[i - 1][2], air[i][3] - air[i - 1][3]));
  let a = st.findIndex(s => s > EPS), b = st.length - 1; while (b >= 0 && !(st[b] > EPS)) b--; if (a < 0 || b - a < 3) return null;
  const vel = i => st[i] / Math.max(1e-6, air[i + 1][0] - air[i][0]);   // (units/s: a step judged against its frame's length — a long frame's step is no teleport)
  let holds = 0, run = 0, maxRun = 0, zig = 0, tele = 0, late = 0, bounces = 0, wasImpact = -9; const rel = [], spike = [], med = q(st.slice(a, b + 1).map((s, j) => s > EPS ? vel(a + j) : -1).filter(v => v > 0), .5) || 1e-3, D = i => [air[i + 1][1] - air[i][1], air[i + 1][2] - air[i][2], air[i + 1][3] - air[i][3]];
  for (let i = a; i <= b; i++) { if (st[i] <= EPS) {   // (one still frame at a contact — the way in and out over 25° apart: it met the floor at that frame's end — is the bounce, not a hold)
      if (run === 0 && i > a && i < b && st[i - 1] > EPS && st[i + 1] > EPS) { const u = D(i - 1), w = D(i + 1), c = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (Math.hypot(...u) * Math.hypot(...w)); if (c < Math.cos(25 * Math.PI / 180)) { bounces++; continue; } }
      if (run === 0 && !(i > a && vel(i - 1) > .5) && !(i < b && vel(i + 1) > .5)) continue;   // (coming to rest — under 0.5 units/s on both sides, sub-millimetre a frame: no hold; a hold run once started is counted whole)
      holds++; run++; maxRun = Math.max(maxRun, run); continue; } run = 0; const hostLate = starved.some(t => air[i + 1][0] >= t && air[i + 1][0] <= t + STARVED_S); if (vel(i) > 4 * med && st[i] > .3) { if (hostLate) late++; else tele++; }
    if (i > a && i < b) { const d0 = D(i - 1), d1 = D(i), d2 = D(i + 1), dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], m = u => Math.hypot(...u);
      if (m(d0) > .01 && m(d1) > .01 && m(d2) > .01 && dot(d0, d1) < 0 && dot(d1, d2) < 0) { if (hostLate) late++; else zig++; }
      const turn = m(d0) > EPS && m(d1) > EPS ? dot(d0, d1) / (m(d0) * m(d1)) : 1; if (turn < Math.cos(25 * Math.PI / 180)) { bounces++; continue; }
      // speed now vs the frame before (units/s, ≥ 3: a crawl's relative noise says nothing); a step down that holds the
      // next frame (an impact: a bounce off a floor at a shallow angle, the slide's friction) is no jitter — a dip that
      // bounces back (a stall, then a race) is
      const sp = j => air[j + 1] && air[j] && air[j + 1][0] > air[j][0] ? st[j] / (air[j + 1][0] - air[j][0]) : NaN, s0 = sp(i - 1), s1 = sp(i), s2 = sp(i + 1);
      if (st[i - 1] > EPS && Math.max(s0, s1) > 5) { const r = Math.abs(s1 - s0) / Math.max(s0, s1), held = Number.isFinite(s2) && Math.abs(s2 - s1) / Math.max(s1, s2, 1e-6) < .15; if (!(r > .3 && held)) rel.push(r); else bounces++;
        // the spike: up then down (or down then up) frame to frame — the smaller change, of the speed (a smooth arc's speed
        // changes one way between bounces: 0; a bounce is a step: ~0; a stall-and-race or a correction pulled in: large).
        // Not under 10 units/s (1.6 m/s: a gun's last hops along the floor, each 1/32 s step a tiny bounce — sub-centimetre a frame)
        // An impact next (a drop of over 30 % that the frame after keeps within 25 %: the bounce, after a fall's speeding up) is no spike —
        // nor one that lands late in the next frame (that frame part fall, part bounce: 21 → 19 → 7 → 7 units/s, a gun hopping along the floor).
        const s3 = sp(i + 2), s4 = sp(i + 3), kept = (u, w) => Number.isFinite(u) && Math.abs(u - w) < .25 * Math.max(w, 1e-6);
        const impact = (s2 < s1 * .7 && kept(s3, s2)) || (s2 < s1 && s3 < s1 * .7 && kept(s4, s3));
        // …nor the frame after an impact (its speed s1 is the bounce frame's: part of the way in, part out — its straight-line
        // step shorter than the arc it drew, so the next frame always reads faster: 22 → 6 → 8.7 units/s at a gun's bounce).
        if (impact) wasImpact = i; const afterImpact = wasImpact === i - 1;
        if (Number.isFinite(s2) && Math.max(s0, s1, s2) >= 10 && !impact && !afterImpact) { const e1 = s1 - s0, e2 = s2 - s1; spike.push(e1 * e2 < 0 ? Math.min(Math.abs(e1), Math.abs(e2)) / Math.max(s0, s1, s2) : 0); } } } }
  // the landing pop: the last flying frame to the first frame in its resting place
  let pop = 0; const li = f.indexOf(air[air.length - 1]); if (T.kind !== 'drop' && T.kind !== 'prop' && li >= 0 && li + 1 < f.length) { const r0 = f[li], r1 = f[li + 1]; pop = Math.hypot(r1[1] - r0[1], r1[2] - r0[2], r1[3] - r0[3]); }
  return { kind: T.kind, frames: b - a + 1, holds, maxHold: maxRun, zig, tele, late, bounces, relMed: +q(rel, .5).toFixed(3), relP95: +q(rel, .95).toFixed(3), spikeP95: +q(spike, .95).toFixed(3), spikeMax: +q(spike, 1).toFixed(3), pop: +pop.toFixed(3) }; }
const summary = {}, STARVED = starvedOn(res);
for (const [pi, r] of res.entries()) { const who = pi ? 'guest' : 'host'; const fps = r.dts.length ? +(1000 / q(r.dts, .5)).toFixed(1) : 0;
  console.log(`[${who}] frames ${r.frames} · median fps ${fps} · frame ms p95 ${q(r.dts, .95)} · wrapped ${r.wrapped} · host words ${r.clk?.length || 0}, starved host ticks (> ${STARVED_MS} ms apart) ${STARVED[pi].length}${r.err ? ' · err ' + r.err : ''}`);
  for (const T of Object.values(r.tracks)) { const j = judge(T, STARVED[pi]); if (!j) continue; const k = `${who}:${j.kind}`, s = summary[k] ??= { n: 0, frames: 0, holds: 0, maxHold: 0, zig: 0, tele: 0, late: 0, relMed: [], relP95: 0, spikeP95: 0, spikeMax: 0, pop: 0 };
    s.n++; s.frames += j.frames; s.holds += j.holds; s.maxHold = Math.max(s.maxHold, j.maxHold); s.zig += j.zig; s.tele += j.tele; s.late += j.late; s.relMed.push(j.relMed); s.relP95 = Math.max(s.relP95, j.relP95); s.spikeP95 = Math.max(s.spikeP95, j.spikeP95); s.spikeMax = Math.max(s.spikeMax, j.spikeMax); s.pop = Math.max(s.pop, j.pop); } }
for (const s of Object.values(summary)) s.relMed = +q(s.relMed, .5).toFixed(3);
for (const [k, s] of Object.entries(summary)) console.log(`${k.padEnd(18)} n ${s.n} frames ${s.frames} holds ${s.holds} (max run ${s.maxHold}) zig ${s.zig} tele ${s.tele} (after a starved host tick ${s.late}) Δspeed med ${s.relMed} p95max ${s.relP95} spike p95 ${s.spikeP95} max ${s.spikeMax} pop ${s.pop}`);
writeFileSync(path.join(out, `physics-${MODE}-${HZ}.json`), JSON.stringify({ hz: HZ, mode: MODE, summary, raw: res.map((r, i) => ({ frames: r.frames, dts: r.dts.slice(0, 2000), clk: r.clk, starved: STARVED[i], tracks: r.tracks })) }));
check('the game\'s frames were sampled (lab.update wrapped)', res.every(r => r.wrapped && r.frames > 100), res.map(r => r.frames).join(' / '));
check('grenades and dropped guns were measured on every page', pages.every((_, i) => Object.keys(summary).some(k => k.startsWith(i ? 'guest:' : 'host:') && !k.endsWith(':drop') && !k.endsWith(':prop')) && summary[(i ? 'guest' : 'host') + ':drop']), Object.keys(summary).join(' '));
for (const [k, s] of Object.entries(summary)) {
  check(`${k}: no holds while moving (a frame drawing it where it was)`, s.holds === 0, `${s.holds} of ${s.frames} frames, longest ${s.maxHold}`);
  if (k.endsWith(':prop')) check(`${k}: no zig-zags (a blast throws it at full speed at once: no teleport check)`, s.zig === 0, `zig ${s.zig} · fast frames ${s.tele}`);
  else check(`${k}: no zig-zags (corrections pulling it back) and no teleports`, s.zig === 0 && s.tele === 0, `zig ${s.zig} · tele ${s.tele}${s.late ? ` · ${s.late} more right after a starved host tick (not gated)` : ''}`);
  if (!k.endsWith(':prop')) check(`${k}: steady speed — no speed spikes frame to frame (spike p95 ≤ 0.05, bounces aside)`, s.spikeP95 <= .05, `spike p95 ${s.spikeP95} max ${s.spikeMax} · Δspeed median ${s.relMed}, worst flight's p95 ${s.relP95}`);
  if (!k.endsWith(':drop') && !k.endsWith(':prop')) check(`${k}: comes to rest without a pop (≤ 0.25 units)`, s.pop <= .25, s.pop); }
check('no page errors', !errs.length, errs.slice(0, 4).join(' | '));
console.log(`${ok}/${n} checks passed`); for (const b of browsers) await b.close().catch(() => {}); server.kill(); process.exit(!GATE || ok === n ? 0 : 1);
