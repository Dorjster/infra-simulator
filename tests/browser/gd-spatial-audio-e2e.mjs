// Global Defensive · spatial sound like CS2 over LAN (package U), two real browsers on this computer (host and guest pages,
// one room server, Defuse on Dust II, no bots), Chrome's own Web Audio:
//  · the guest walks with Shift (CS2: 135 HU/s or under is silent) → the host's page makes no step for it, placed or culled;
//    it runs → steps every ~0.3 s; it crouch-walks → none;
//  · the host hears the guest's running steps where the guest is (the panner at the guest's body, 20 HU over its feet);
//  · a step 200 / 1000 / 2000 HU to the host's right (the page's own gd-sounds instance, the game's listener): 1000 HU
//    ≥ 18 dB under 200, 2000 silent; rendered through the very panner and listener the game set (OfflineAudioContext), a
//    source on the right is louder in the right ear, and after the host turns round the same source is in the left ear;
//  · what HRTF costs: 32 voices rendered offline with HRTF / equalpower / no panner (reported).
// (The mix itself needs a person with headphones to confirm.)
//   node tests/browser/gd-spatial-audio-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDSPA1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gsa-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); }; const errs = [], report = {};
async function open(who) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: 1000, height: 640 } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n);
    // Every sound started: its gains on the way out, lowpass, panner and the listener at that moment (read back, not guessed).
    const E = new WeakMap(), log = globalThis.__alog = []; const oc = AudioNode.prototype.connect; AudioNode.prototype.connect = function (d, ...a) { let l = E.get(this); if (!l) E.set(this, l = []); l.push(d); return oc.call(this, d, ...a); };
    const os = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { try { const c = this.context, L = c.listener; globalThis.__actx = c; let g = 1, pan = null, lp = null, node = this;
        for (let i = 0; i < 10 && node; i++) { const nx = E.get(node)?.[0]; if (!nx) break; if (nx instanceof GainNode && !pan) g *= nx.gain.value; if (nx instanceof BiquadFilterNode && nx.type === 'lowpass') lp = nx.frequency.value; if (nx instanceof PannerNode) { pan = { x: nx.positionX.value, y: nx.positionY.value, z: nx.positionZ.value, m: nx.panningModel, cc: nx.channelCount, ccm: nx.channelCountMode, roll: nx.rolloffFactor }; break; } node = nx; }
        log.push({ t: performance.now(), g, pan, lp, ch: this.buffer?.numberOfChannels, L: [L.positionX.value, L.positionY.value, L.positionZ.value, L.forwardX.value, L.forwardY.value, L.forwardZ.value, L.upX.value, L.upY.value, L.upZ.value] }); if (log.length > 3000) log.splice(0, 1000); } catch { } return os.apply(this, a); }; }, who);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000);
  await p.evaluate(async () => { globalThis.__gdS = await import('/gd-sounds.js'); globalThis.__sa = await import('/spatial-audio.js'); });   // (the page's own module instances)
  return p; }
const host = await open('Host'), guest = await open('Guest');
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }), a);
const phase = (p, ph, ms) => p.waitForFunction(ph => __infra.lab.world.operations.game.combat?.d?.round?.phase === ph, ph, { timeout: ms }).then(() => true).catch(() => false);
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dust2'); await host.selectOption('#ss-ar-bots', '0');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d, null, { timeout: 60000 });
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 60000 });
await act(host, { type: 'settings', freeze: 3 }); await act(host, { type: 'settings', rules: { roundS: 90 } });
const st = await act(host, { type: 'start-match' }); check('the host starts the match', !st?.error, JSON.stringify(st));
const live = await phase(guest, 'live', 30000) && await phase(host, 'live', 5000); check('the round goes live', live);
for (const p of [host, guest]) { await p.keyboard.press('Escape'); await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); }
await host.waitForTimeout(1500);
// An open lane by the guest (45 units clear ahead, 15 behind, a near-level floor — as gd-movement-e2e): the guest stands at
// its start facing along it; the host 12 units behind that start, facing the same way (the guest ahead of it).
const spot = await guest.evaluate(async () => { const { blocked, groundAt, HU } = await import('/arena-move.js'), boxes = __infra.lab.arenaScene.boxes, c = __infra.camera.position, y0 = __infra.lab.move.am?.y ?? c.y - 9.7;
  for (const [x, z] of [[c.x, c.z], ...Array.from({ length: 160 }, (_, i) => [c.x + Math.cos(i * 2.4) * (4 + i * .45), c.z + Math.sin(i * 2.4) * (4 + i * .45)])]) { const y = groundAt(boxes, x, z, y0 + 2); if (blocked(boxes, null, x, z, y)) continue;
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, dx = Math.cos(a), dz = Math.sin(a); let clear = true; for (let d = 1; d <= 45 && clear; d += 1) { const px = x + dx * d, pz = z + dz * d; if (blocked(boxes, null, px, pz, y) || Math.abs(groundAt(boxes, px, pz, y + 2) - y) > .3) clear = false; }
      for (let d = 1; d <= 15 && clear; d += 1) if (blocked(boxes, null, x - dx * d, z - dz * d, y) || Math.abs(groundAt(boxes, x - dx * d, z - dz * d, y + 2) - y) > .3) clear = false;
      if (clear) return { x, z, y, dx, dz, HU }; } } return null; });
check('an open lane by the guest', !!spot, JSON.stringify(spot));
const HU = spot?.HU ?? 2.54 / 16.5;
const placeGuest = () => guest.evaluate(s => __infra.lab.look(s.x, s.z, s.x + s.dx * 10, s.y + 9.7, s.z + s.dz * 10, s.y + 9.7), spot);
const placeHost = (back = 12, turn = 1) => host.evaluate(([s, b, t]) => { const x = s.x - s.dx * b, z = s.z - s.dz * b; __infra.lab.look(x, z, x + s.dx * 10 * t, s.y + 9.7, z + s.dz * 10 * t, s.y + 9.7); }, [spot, back, turn]);
// The host's decisions about sounds (started, culled, dropped) — nothing else makes a sound here while the guest moves.
const decisions = () => host.evaluate(() => { const v = __gdS.voiceStats; return { started: v.started, culled: v.culled, dropped: v.dropped, all: v.started + v.culled + v.dropped, logN: __alog.length }; });
const guestSpeed = () => guest.evaluate(() => { const a = __infra.lab.move.am; return a ? Math.hypot(a.vx || 0, a.vz || 0) : 0; });
async function hold(keys, plan) { for (const k of keys) await guest.keyboard.down(k); const sp = []; for (const [key, ms] of plan) { await guest.keyboard.down(key); const t0 = Date.now(); while (Date.now() - t0 < ms) { await guest.waitForTimeout(150); sp.push(await guestSpeed()); } await guest.keyboard.up(key); }
  for (const k of keys) await guest.keyboard.up(k); await guest.waitForTimeout(500); sp.sort((a, b) => a - b); return sp.length ? sp[Math.floor(sp.length * .8)] / HU : 0; }   // (the 80th percentile speed, HU/s)
if (spot) {
  await placeGuest(); await placeHost(); await host.waitForTimeout(1500);
  // 1. Shift-walk: silent for others.
  let d0 = await decisions(); const vWalk = await hold(['Shift'], [['KeyW', 1800], ['KeyS', 1800], ['KeyW', 1800]]); let d1 = await decisions();
  check(`the guest Shift-walks (${vWalk.toFixed(0)} HU/s: CS2's walk, under 135)`, vWalk > 60 && vWalk <= 135, vWalk.toFixed(1));
  check('…and the host\'s page makes no step for it (none placed, none culled)', d1.all === d0.all, JSON.stringify({ before: d0, after: d1 }));
  report.walk = { vWalk, d0, d1 };
  // 2. Running: steps, placed at the guest.
  await placeGuest(); await host.waitForTimeout(800); d0 = await decisions(); const l0 = await host.evaluate(() => __alog.length);
  const vRun = await hold([], [['KeyW', 1100], ['KeyS', 1100], ['KeyW', 1100], ['KeyS', 1100]]); d1 = await decisions();
  const steps = await host.evaluate(([l0]) => __alog.slice(l0).filter(e => e.pan), [l0]);
  check(`the guest runs (${vRun.toFixed(0)} HU/s) → the host hears steps (${d1.all - d0.all} in 4.4 s; ~0.3 s apart)`, vRun > 150 && d1.all - d0.all >= 6 && d1.all - d0.all <= 18, JSON.stringify({ before: d0, after: d1 }));
  const gy = spot.y + 20 * HU; const placed = steps.filter(e => Math.abs(e.pan.y - gy) < .6);
  check('…placed at the guest\'s body, 20 HU over its feet (CS2 position_offset), mono HRTF points', placed.length >= 3 && placed.every(e => e.pan.cc === 1 && e.pan.ccm === 'explicit' && e.pan.m === 'HRTF' && e.pan.roll === 0), JSON.stringify(steps.slice(0, 3).map(e => ({ y: +e.pan.y.toFixed(2), want: +gy.toFixed(2), m: e.pan.m, cc: e.pan.cc, g: +e.g.toFixed(3) }))));
  report.run = { vRun, d0, d1, steps: steps.length };
  // 3. Crouch-walk: silent.
  await placeGuest(); await host.waitForTimeout(800); d0 = await decisions(); const vDuck = await hold(['KeyC'], [['KeyW', 1500], ['KeyS', 1500]]); d1 = await decisions();
  check(`the guest crouch-walks (${vDuck.toFixed(0)} HU/s) → no step for others`, vDuck > 30 && d1.all === d0.all, JSON.stringify({ vDuck, before: d0, after: d1 }));
  report.duck = { vDuck, d0, d1 };
}
// 4. Distance and side, through the game's own listener and Chrome's panner (walls off for this part: the open falloff).
await host.waitForTimeout(500);
const probe = (hu, side = 1) => host.evaluate(([hu, side, HU]) => { const c = __sa.audioCtx(), L = c.listener, e = [L.positionX.value, L.positionY.value, L.positionZ.value], f = [L.forwardX.value, 0, L.forwardZ.value], fl = Math.hypot(f[0], f[2]) || 1, r = [-f[2] / fl, 0, f[0] / fl];   // (right of a level forward: forward × up)
  const at = { x: e[0] + r[0] * hu * HU * side, y: e[1] - 44 * HU, z: e[2] + r[2] * hu * HU * side }, k = __alog.length, ret = __gdS.gdStep('concrete', at, 'probe' + Math.random()); const got = __alog.slice(k).filter(x => x.pan); return { ret, at, e: got[0] || null }; }, [hu, side, HU]);
await host.evaluate(() => __gdS.setGdOcclusion(null));
const p200 = await probe(200), p1000 = await probe(1000), p2000 = await probe(2000);
const dB = (a, b) => 20 * Math.log10(a / b);
check(`a step 200 HU to the right plays (gain ${p200.e?.g.toFixed(3)}); 1000 HU ≥ 18 dB under it (${p200.e && p1000.e ? dB(p200.e.g, p1000.e.g).toFixed(1) : '-'} dB)`, !!p200.e && !!p1000.e && dB(p200.e.g, p1000.e.g) >= 18, JSON.stringify({ p200: p200.e?.g, p1000: p1000.e?.g }));
check('a step 2000 HU off is silent (handled, nothing started)', p2000.ret === true && !p2000.e, JSON.stringify(p2000));
const renderLR = e => host.evaluate(async e => { const oc = new OfflineAudioContext(2, 24000, 48000), L = oc.listener, [x, y, z, fx, fy, fz, ux, uy, uz] = e.L;
  L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
  const p = oc.createPanner(); p.panningModel = e.pan.m; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.positionX.value = e.pan.x; p.positionY.value = e.pan.y; p.positionZ.value = e.pan.z;
  const b = oc.createBuffer(1, 24000, 48000), d = b.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
  const src = oc.createBufferSource(); src.buffer = b; src.connect(p).connect(oc.destination); src.start(); const r = await oc.startRendering(); const rms = ch => { const a = r.getChannelData(ch); let q = 0; for (let i = 4800; i < a.length; i++) q += a[i] * a[i]; return Math.sqrt(q / (a.length - 4800)); };
  return 20 * Math.log10(rms(1) / rms(0)); }, e);   // (R − L, dB)
if (p200.e) { const lr = await renderLR(p200.e); check(`…rendered through the game's panner and listener, it is in the right ear (R − L = ${lr.toFixed(1)} dB)`, lr > 6, lr.toFixed(2)); report.lrRight = lr; }
// The host turns round (its view, through the game: lab.look): the same spot is now on its left.
if (spot && p200.e) { await placeHost(12, -1); await host.waitForTimeout(600);
  const back = await host.evaluate(([at]) => { const k = __alog.length; __gdS.gdStep('concrete', at, 'probe-turn'); return __alog.slice(k).find(x => x.pan) || null; }, [p200.at]);
  const fwdFlip = back && (back.L[3] * p200.e.L[3] + back.L[5] * p200.e.L[5]) < -.9;
  check('the host turns round: the game\'s listener turned with the view', !!fwdFlip, JSON.stringify(back?.L?.slice(3, 6)));
  if (back) { const lr = await renderLR(back); check(`…and the same spot is now in the left ear (R − L = ${lr.toFixed(1)} dB)`, lr < -6, lr.toFixed(2)); report.lrTurned = lr; } }
// 5. What HRTF costs (Chrome, offline: 32 voices × 5 s of audio).
report.cost = await host.evaluate(async () => { const out = {}; for (const m of ['none', 'equalpower', 'HRTF']) { const oc = new OfflineAudioContext(2, 48000 * 5, 48000), b = oc.createBuffer(1, 48000, 48000), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (let v = 0; v < 32; v++) { const s = oc.createBufferSource(); s.buffer = b; s.loop = true; const g = oc.createGain(); g.gain.value = .02; s.connect(g); if (m === 'none') g.connect(oc.destination); else { const p = oc.createPanner(); p.panningModel = m; p.positionX.value = Math.cos(v) * 20; p.positionZ.value = Math.sin(v) * 20; g.connect(p).connect(oc.destination); } s.start(); }
    const t0 = performance.now(); await oc.startRendering(); out[m] = +(performance.now() - t0).toFixed(1); } return out; });
console.log('HRTF cost (ms to render 5 s of 32 voices, offline):', JSON.stringify(report.cost), '→ HRTF per voice ≈', ((report.cost.HRTF - report.cost.none) / 32 / 5 / 10).toFixed(3), '% of one core');
check('HRTF for the bounded voice count is affordable (32 voices: HRTF over none under a quarter of real time — measured 70–390 ms of 5000 on a loaded machine)', report.cost.HRTF - report.cost.none < .25 * 5000, JSON.stringify(report.cost));   // (relative to the run's own 'none': a busy machine slows both)
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
for (const b of browsers) await b.close().catch(() => {}); server.kill();
console.log(`${ok}/${n} checks passed (the mix itself needs a person with headphones)`); process.exit(ok === n ? 0 : 1);
