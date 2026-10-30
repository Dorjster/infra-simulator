// Global Defensive over LAN as tonight's players will meet it: the room listens on every address (as `npm start` does), the
// host plays at http://localhost and the guest joins at this computer's LAN address (http://<LAN IP>:<port>, plain http)
// through a small TCP relay that can act like Wi-Fi. Two browser pages on one computer are SIMULATED clients (one machine's
// CPU and GPU shared by both pages, the room and the relay): what a real Windows PC on Wi-Fi does is not measured here.
//  1. clean LAN, Defuse on Dust II, 2 people + 8 bots: per page frame times (p50/p95/p99/max, frames > 33 ms with their
//     long-animation-frame scripts), the guest's network figures (multiplayer.js gdNetStats: RTT, jitter, snapshot age,
//     interpolation delay, corrections), stream bytes per second per page, the host's tick time (p50/p95/max);
//  2. Wi-Fi: each way 15–40 ms extra (RTT +30–80 ms, jittered per chunk) and 1 % of chunks held 250 ms (a lost TCP segment
//     waits for its resend: TCP delivers in order, so everything behind it waits too) — remote bodies must stay smooth (no
//     teleport-size steps outside respawns / round starts, no long freeze-then-jump);
//  3. the guest's connection drops for 4 s (every socket cut, new ones refused) and comes back: it reconnects by itself as
//     the same player on the same side, frames flow again, no ghost of it is left in the room;
//  4. hits still register under the Wi-Fi conditions (the guest shoots the host; the host's HP drops on the host).
//   node tests/browser/gd-lan-wifi-e2e.mjs <repo-root> <out-dir> [seconds per phase = 20]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import net from 'node:net';
const [root, out, secsArg] = process.argv.slice(2); mkdirSync(out, { recursive: true }); const SECS = +secsArg || 20;
const lanIp = (() => { const all = Object.entries(os.networkInterfaces()).flatMap(([n, l]) => (l || []).map(i => ({ n, ...i }))).filter(i => i.family === 'IPv4' && !i.internal); return (all.find(i => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) || all[0])?.address || null; })();
if (!lanIp) { console.log('SKIP: this computer has no LAN address (no network) — the LAN-address join cannot be checked'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '0.0.0.0', ROOM_CODE: 'GDWIFI', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gw-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const port = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r(+m[1]); }));
// The Wi-Fi relay: guest ⇄ relay (on the LAN address) ⇄ room (on the LAN address: the room sees a LAN peer, not loopback).
const W = { oneWay: 0, jitter: 0, loss: 0, hold: 250, down: false, socks: new Set() };
const pipe = (from, to) => { let last = 0; from.on('data', buf => { if (W.down) return; const now = Date.now(); let d = W.oneWay + Math.random() * W.jitter; if (W.loss && Math.random() < W.loss) d += W.hold; const at = Math.max(last, now + d); last = at; if (at <= now) to.write(buf); else setTimeout(() => { if (!to.destroyed) to.write(buf); }, at - now); }); };
const relay = net.createServer(c => { if (W.down) return c.destroy(); const s = net.connect(port, lanIp); W.socks.add(c); W.socks.add(s); const end = () => { c.destroy(); s.destroy(); W.socks.delete(c); W.socks.delete(s); }; c.on('error', end); s.on('error', end); c.on('close', end); s.on('close', end); pipe(c, s); pipe(s, c); });
const relayPort = await new Promise(r => relay.listen(0, lanIp, () => r(relay.address().port)));
const hostUrl = `http://localhost:${port}/`, guestUrl = `http://${lanIp}:${relayPort}/`;
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); }; const errs = [];
// Stream bytes per page (CDP: every server-sent event's data) and request bodies sent.
async function open(who, url, w = 1280, h = 760) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: w, height: h } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, who);
  const cdp = await p.context().newCDPSession(p); p.bytes = { down: 0, up: 0, msgs: 0 }; await cdp.send('Network.enable');
  if (who === 'Guest' && +process.env.GUEST_THROTTLE > 1) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.GUEST_THROTTLE }); console.log('guest CPU throttled ×' + process.env.GUEST_THROTTLE + ' (a weak Windows laptop as the guest: package W)'); }
  cdp.on('Network.eventSourceMessageReceived', e => { p.bytes.down += e.data.length + e.eventName.length + 16; p.bytes.msgs++; const k = (p.kinds ??= {})[e.eventName] ??= [0, 0]; k[0]++; k[1] += e.data.length; if (e.eventName === 'players' && e.data.length > (p.sample?.length || 0)) p.sample = e.data; }); cdp.on('Network.requestWillBeSent', e => { p.bytes.up += (e.request.postData?.length || 0) + 300; });   // (+ headers, roughly: an approximation)
  await p.goto(url); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 90000 }); await p.waitForTimeout(1200); return p; }
// LAN address: the room answers there (what a Windows browser on the network fetches first).
{ const r = await fetch(`http://${lanIp}:${port}/api/room`).then(r => r.json()).catch(e => ({ error: e.message })); check(`the room answers on the LAN address http://${lanIp}:${port} (bound to every address, plain http)`, r.protocol === 'infra-lan-v1' && !!r.gd, JSON.stringify(r)); }
const host = await open('Host', hostUrl), guest = await open('Guest', guestUrl, 1100, 700);
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }), a);
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dust2'); await host.selectOption('#ss-ar-bots', '0');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d, null, { timeout: 60000 });
check('eight bots added', !(await act(host, { type: 'add-bot', count: 8 }))?.error);
// (hosting: the invite bar / lobby / start screen show the address friends type — whichever is on screen holds it)
{ const shown = await host.waitForFunction(ip => document.body.innerText.includes(ip) || [...document.querySelectorAll('#lan-invite, #ar-lobby, [id^=lan-]')].some(e => e.textContent.includes(ip)), lanIp, { timeout: 8000 }).then(() => true).catch(() => false);
  check('the host\'s screen shows its LAN address to give friends', shown, await host.evaluate(() => ['lan-invite', 'ar-lobby'].map(id => (document.getElementById(id)?.textContent || '').slice(0, 160)).join(' | '))); }
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
const joined = await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 60000 }).then(() => true).catch(() => false);
check(`the guest joins at the LAN address (${guestUrl}) and lands in the lobby`, joined);
await act(host, { type: 'settings', freeze: 3 }); check('the host starts the match', !(await act(host, { type: 'start-match' }))?.error);
await guest.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 20000 }).catch(() => {});
for (const pg of [host, guest]) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); await pg.evaluate(() => __infra.lab.enter()); }
// In-page collectors (both pages): frame times, frames > 33 ms with their long-animation-frame scripts, remote bodies' steps.
const collect = p => p.evaluate(() => { const M = globalThis.__M = { ft: [], hitch: [], loaf: [], snaps: [], stalls: [], ns: [], tick: [], on: true, frames: 0 };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (M.on && e.duration > 33) M.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), render: Math.round((e.renderStart || 0) - e.startTime), scripts: (e.scripts || []).slice(0, 3).map(s => `${(s.sourceURL || '').split('/').pop()}:${s.sourceFunctionName || s.invoker || '?'} ${Math.round(s.duration)}ms`) }); }).observe({ type: 'long-animation-frame', buffered: false }); } catch {}
  const last = new Map(), still = new Map(); let prev = performance.now(), mark = { n: -1, phase: '' }, markAt = 0;
  const f = now => { if (!M.on) return; const dt = now - prev; prev = now; M.ft.push(dt); M.frames++; if (dt > 33) M.hitch.push({ t: Math.round(now), dt: Math.round(dt) });
    const g = __infra.lab.world.operations.game, d = g.combat?.d, r = d?.round; if (r && (r.phase !== mark.phase || d.n !== mark.n)) { mark.phase = r.phase; mark.n = d.n; markAt = now; }
    for (const m of (__infra.lab.lan.models || new Map()).values()) { const k = m.name, q = m.g.position, l = last.get(k), down = !!g.combat?.down?.[String(k).toLowerCase()];
      if (l) { const step = Math.hypot(q.x - l.x, q.z - l.z), cap = 40 * Math.max(dt, 16) / 1000 * 2 + .5;   // (CS2 runs 250 HU/s ≈ 38.5 units/s: twice a frame's run, + 0.5)
        if (step > cap && !down && !l.down && now - markAt > 1500) M.snaps.push({ k, step: +step.toFixed(2), dt: Math.round(dt), t: Math.round(now), ph: r?.phase, dy: +(q.y - (l.y ?? q.y)).toFixed(2), lead: m.buf?.length ? Math.round(m.buf.at(-1).t - m.seen) : null, from: [+l.x.toFixed(1), +l.z.toFixed(1)], to: [+q.x.toFixed(1), +q.z.toFixed(1)] });
        const s = still.get(k) || { n: 0, mv: 0 }; if (step < 1e-4) s.n++; else { if (s.n >= 8 && s.mv > 0 && step > Math.max(1.2, s.mv * 4) && !down && now - markAt > 1500) M.stalls.push({ k, frames: s.n, jump: +step.toFixed(2), t: Math.round(now) }); s.n = 0; s.mv = s.mv ? s.mv * .9 + step * .1 : step; } still.set(k, s); l.x = q.x; l.z = q.z; l.y = q.y; l.down = down; }
      else last.set(k, { x: q.x, z: q.z, down }); }
    requestAnimationFrame(f); }; requestAnimationFrame(f);
  M.timer = setInterval(() => { const s = __infra.lab.lan.netStats; M.ns.push({ rtt: s.rtt, jitter: s.jitter, age: s.snapshotAgeMs, interp: s.interpMs, corr: s.corrections, corrMax: s.correctionMaxU, tick: s.hostTickMs, bytes: s.lastSnapshotBytes, q: s.queue }); if (M.ns.length % 8 === 0) for (const m of (__infra.lab.lan.models || new Map()).values()) { const e = (M.dly ??= {})[m.name] ??= { dly: 0, jit: 0, n: 0, sum: 0 }; e.dly = Math.max(e.dly, Math.round(m.dly || 0)); e.jit = Math.max(e.jit, Math.round(m.jit || 0)); e.n++; e.sum += m.dly || 0; e.avg = Math.round(e.sum / e.n); } }, 250); });
const stop = p => p.evaluate(() => { const M = globalThis.__M; M.on = false; clearInterval(M.timer); const s = [...M.ft].sort((a, b) => a - b), q = f => +(s[Math.min(s.length - 1, Math.floor(s.length * f))] || 0).toFixed(1);
  const ns = M.ns, pick = (k, f) => { const v = ns.map(x => x[k]).filter(Number.isFinite).sort((a, b) => a - b); return v.length ? +(v[Math.min(v.length - 1, Math.floor(v.length * f))]).toFixed(1) : null; };
  return { frames: M.frames, p50: q(.5), p95: q(.95), p99: q(.99), max: q(1), over33: M.hitch.length, hitch: M.hitch.slice(0, 12), loaf: M.loaf.slice(0, 12), snaps: M.snaps.length, snapEvents: new Set(M.snaps.map(s => Math.round(s.t / 100))).size, snapList: M.snaps.slice(0, 8), stalls: M.stalls.length, stallList: M.stalls.slice(0, 8), dly: M.dly || {},
    net: { rtt50: pick('rtt', .5), rtt95: pick('rtt', .95), jitter50: pick('jitter', .5), age50: pick('age', .5), age95: pick('age', .95), interp50: pick('interp', .5), interpMax: pick('interp', 1), corrections: ns.length ? ns.at(-1).corr - ns[0].corr : 0, corrMaxU: pick('corrMax', 1), tick50: pick('tick', .5), tick95: pick('tick', .95), tickMax: pick('tick', 1), frameBytes50: pick('bytes', .5), queueMax: pick('q', 1) } }; });
async function phase(label) { const b0 = [host.bytes.down, host.bytes.up, guest.bytes.down, guest.bytes.up], t0 = Date.now(); await Promise.all([collect(host), collect(guest)]);
  // the host walks a square (W held, turning a quarter every 1.5 s): a moving remote player for the guest besides the 8 bots
  const walk = (async () => { await host.keyboard.down('KeyW'); for (let t = 0; t < SECS * 1000; t += 1500) { await host.evaluate(i => { const c = __infra.camera.position, a = i * Math.PI / 2; __infra.lab.look(c.x, c.z, c.x + Math.sin(a) * 20, c.y, c.z + Math.cos(a) * 20, c.y); }, t / 1500); await host.waitForTimeout(1500); } await host.keyboard.up('KeyW'); })();
  await walk; const [h, g] = await Promise.all([stop(host), stop(guest)]); const s = (Date.now() - t0) / 1000;
  const bps = { hostDown: Math.round((host.bytes.down - b0[0]) / s), hostUp: Math.round((host.bytes.up - b0[1]) / s), guestDown: Math.round((guest.bytes.down - b0[2]) / s), guestUp: Math.round((guest.bytes.up - b0[3]) / s) };
  const rep = { label, secs: +s.toFixed(1), load: os.loadavg().map(x => +x.toFixed(1)), busy: Math.max(os.loadavg()[0], os.loadavg()[1]) > os.cpus().length, host: h, guest: g, bytesPerSec: bps }; writeFileSync(path.join(out, `wifi-${label}.json`), JSON.stringify(rep, null, 1));
  console.log(`[${label}] host frames p50 ${h.p50} p95 ${h.p95} p99 ${h.p99} max ${h.max} (>33 ms: ${h.over33}) · guest p50 ${g.p50} p95 ${g.p95} p99 ${g.p99} max ${g.max} (>33 ms: ${g.over33}) · load ${rep.load.join(' ')}`);
  console.log(`[${label}] guest net ${JSON.stringify(g.net)} · bytes/s ${JSON.stringify(bps)} · remote snaps ${g.snaps} stalls ${g.stalls} · max delay / gap per body ${JSON.stringify(g.dly)}`);
  if (h.loaf.length || g.loaf.length) console.log(`[${label}] long frames host ${JSON.stringify(h.loaf.slice(0, 4))} guest ${JSON.stringify(g.loaf.slice(0, 4))}`);
  return rep; }
// Timing checks judge the network code only on a machine with CPU to spare: with the load average over the core count (other
// programs, other test runs) the room's tick and both pages are starved and their timing says nothing about the game — then
// they are reported, not judged (the join, reconnect, ghost and hit checks always run).
const timed = (rep, name, c, d = '') => { if (rep.busy) console.log(`SKIP (machine loaded: load ${rep.load.join(' ')} > ${os.cpus().length} cores) ${name} · ${String(d).slice(0, 200)}`); else check(name, c, d); };
// 1. Clean LAN.
const A = await phase('lan');
{ const k = guest.kinds || {}, s = guest.sample ? JSON.parse(guest.sample) : []; console.log('[lan] guest stream by event (count, bytes):', JSON.stringify(k), '· largest players frame', guest.sample?.length, 'B for', s.length, 'bodies · one entry', JSON.stringify(s.find(x => x.bot) || s[0] || {}).slice(0, 900)); }
timed(A, 'clean LAN: the guest gets frames steadily (snapshot age p95 < 150 ms) and the host ticks on time (tick p95 < 50 ms)', A.guest.net.age95 !== null && A.guest.net.age95 < 150 && A.guest.net.tick95 < 50, JSON.stringify(A.guest.net));
timed(A, 'clean LAN: remote bodies never jump (no teleport-size step outside respawns / round starts)', A.guest.snaps === 0, JSON.stringify(A.guest.snapList));
timed(A, 'clean LAN: no remote body freezes then jumps', A.guest.stalls <= 1, JSON.stringify(A.guest.stallList));
// (the human host walks and turns every 1.5 s: its pauses between turns are its own, not the network's — multiplayer.js
// remoteClock; v51's first fix still drew it at the 400 ms cap here, dly 400 / jit ~1550 in every run)
timed(A, 'clean LAN: the human host is drawn close behind (mean delay < 200 ms, as the bots)', A.guest.dly.Host && A.guest.dly.Host.avg < 200, JSON.stringify(A.guest.dly));
{ const bodies = Math.max(2, guest.sample ? JSON.parse(guest.sample).length : 10), cap = 16000 * bodies;   // (measured ~11.6 kB/s a body: ~31 players frames a second, each entry with face, skin, outfit)
  check(`clean LAN: a guest receives a bounded stream (${A.bytesPerSec.guestDown} B/s < ${cap / 1000} kB/s for ${bodies} bodies)`, A.bytesPerSec.guestDown > 0 && A.bytesPerSec.guestDown < cap, JSON.stringify(A.bytesPerSec)); }
// 2. Wi-Fi.
Object.assign(W, { oneWay: 15, jitter: 25, loss: .01 });
const B = await phase('wifi');
check('Wi-Fi: the guest measures the added latency (RTT p50 ≥ 30 ms)', B.guest.net.rtt50 >= 30, JSON.stringify(B.guest.net));
// (one catch-up is allowed: the first stall after a calm LAN, before the drawing delay has learnt this network — every body
// then steps ~2 units once, together; after it the delay covers the stalls: multiplayer.js remoteClock's 8 s memory)
timed(B, 'Wi-Fi: remote bodies stay smooth (at most the first stall\'s one catch-up, no teleport-size steps after it)', B.guest.snapEvents <= 1 && B.guest.snapList.every(s => s.step < 4), JSON.stringify({ events: B.guest.snapEvents, list: B.guest.snapList }));
timed(B, 'Wi-Fi: no remote body freezes then jumps more than twice', B.guest.stalls <= 2, JSON.stringify(B.guest.stallList));
// (the stall memory is the stream's: the human host, with few updates of its own, is drawn far enough behind to cover the stalls too)
timed(B, 'Wi-Fi: the human host is drawn behind enough to cover the stalls, like the bots (mean delay ≥ 250 ms)', B.guest.dly.Host && B.guest.dly.Host.avg >= 250, JSON.stringify(B.guest.dly));
check('Wi-Fi: the drawing delay grows to cover the jitter but stays bounded (interp ≤ 400 ms)', B.guest.net.interpMax !== null && B.guest.net.interpMax <= 400, JSON.stringify(B.guest.net));
// 3. The guest's connection drops for 4 s and comes back.
{ const before = await guest.evaluate(() => ({ team: __infra.lab.world.operations.game.combat?.d?.teams?.guest, epoch: __infra.lab.lan.epoch }));
  W.down = true; for (const s of W.socks) s.destroy(); W.socks.clear(); await guest.waitForTimeout(4000); W.down = false;
  const back = await guest.waitForFunction(e => __infra.lab.lan.healthy && __infra.lab.lan.epoch > e && __infra.lab.lan.netStats.snapshotAgeMs >= 0 && __infra.lab.lan.netStats.snapshotAgeMs < 1000, before.epoch, { timeout: 20000 }).then(() => true).catch(() => false);
  const after = await guest.evaluate(() => ({ team: __infra.lab.world.operations.game.combat?.d?.teams?.guest, name: (__infra.lab.lan.players || []).find(p => p.isSelf || p.self)?.name }));
  check('a 4 s drop: the guest reconnects by itself and frames flow again', back, JSON.stringify(await guest.evaluate(() => ({ healthy: __infra.lab.lan.healthy, ns: { ...__infra.lab.lan.netStats } }))));
  check('…on the same side', after.team === before.team, JSON.stringify([before, after]));
  await host.waitForTimeout(1500); const roster = await host.evaluate(() => (__infra.lab.lan.players || []).filter(p => p.name === 'Guest').length);
  check('…and the host sees exactly one Guest (no ghost)', roster === 1, roster); }
// 4. Hits under Wi-Fi: no bots; the guest shoots the host standing in front of it.
{ await host.evaluate(async () => { while ((__infra.lab.world.operations.game.arena?.bots || []).length) await __infra.lab.lan.act({ type: 'arena', action: { type: 'remove-bot' } }); });
  await act(host, { type: 'restart' }); await host.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 20000 }).catch(() => {});
  await guest.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 20000 }).catch(() => {});
  for (const pg of [host, guest]) { await pg.evaluate(() => { for (const id of ['ar-buy']) { const e = document.getElementById(id); if (e && !e.hidden) e.querySelector('[data-act="close"]')?.click(); } __infra.lab.enter(); }); }
  const hp0 = await host.evaluate(() => __infra.lab.world.operations.game.combat.hp?.host ?? 100); let hit = false, tries = 0;
  const gs = await guest.evaluate(() => { const c = __infra.camera.position; return { x: c.x, y: c.y, z: c.z }; });
  // (the host goes 10 units from the guest with the game's own placement — lab.look with the guest's eye height puts it on the
  // floor under that eye, as a spawn pick does; Dust II's spawns have steps and ledges, so directions are tried until it lands level)
  const putHost = o => host.evaluate(([s, o]) => __infra.lab.look(s.x + o[0], s.z + o[1], s.x, s.y, s.z, s.y), [gs, o]);
  let off = [0, -10]; for (let a = 0; a < 8; a++) { const o = [Math.sin(a * Math.PI / 4) * 10, Math.cos(a * Math.PI / 4) * 10]; await putHost(o); await host.waitForTimeout(900);
    const hy = await host.evaluate(() => __infra.camera.position.y); if (Math.abs(hy - gs.y) < .5) { off = o; break; } }
  for (; tries < 30 && !hit; tries++) {
    await putHost(off); await guest.evaluate(s => __infra.lab.look(s.x, s.z, s.x, s.y, s.z - 10, s.y), gs); await guest.waitForTimeout(250);
    await guest.evaluate(() => { const L = __infra.lab, m = [...L.lan.models.values()].find(m => /Host/.test(m.name)); if (!m) return; const t = m.g.position, c = __infra.camera; L.look(c.position.x, c.position.z, t.x, t.y + 7.5, t.z, c.position.y); });
    await guest.mouse.move(550, 350); await guest.mouse.down(); await guest.waitForTimeout(120); await guest.mouse.up(); await guest.waitForTimeout(400);
    hit = (await host.evaluate(() => __infra.lab.world.operations.game.combat.hp?.host ?? 100)) < hp0; }
  const diag = hit ? {} : await guest.evaluate(() => { const L = __infra.lab, g = L.world.operations.game, m = [...L.lan.models.values()].find(m => /Host/.test(m.name)), c = __infra.camera.position;
    return { gun: L.pistol.current?.id, phase: g.combat?.d?.round?.phase, teams: g.combat?.d?.teams, down: g.combat?.down, me: [c.x, c.y, c.z].map(v => +v.toFixed(1)), host: m ? [m.g.position.x, m.g.position.y, m.g.position.z].map(v => +v.toFixed(1)) : null, stats: g.combat?.stats?.guest, menus: [...document.querySelectorAll('.ar-panel:not([hidden]),#ar-buy:not([hidden])')].map(e => e.id) }; });
  check('Wi-Fi: the guest\'s shots hurt the host (the host\'s own screen)', hit, JSON.stringify({ tries, hp0, hp: await host.evaluate(() => __infra.lab.world.operations.game.combat.hp), diag, hostAt: await host.evaluate(() => { const c = __infra.camera.position; return [c.x, c.y, c.z].map(v => +v.toFixed(1)); }) })); }
await guest.screenshot({ path: path.join(out, 'wifi-guest.png') }); await host.screenshot({ path: path.join(out, 'wifi-host.png') });
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
console.log(ok + '/' + n + ' (two pages on one computer = simulated clients)'); for (const bw of browsers) await bw.close(); relay.close(); server.kill(); process.exit(ok === n ? 0 : 1);
