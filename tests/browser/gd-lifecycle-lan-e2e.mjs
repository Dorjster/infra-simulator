// Global Defensive match lifecycle over LAN, two real browsers on this computer (a host page and a guest page against one
// room server — simulated computers: the guest's page clock is set 5 s ahead, as on an offline LAN):
//  · the guest's round clock is the host's (host-clock.js), not its own;
//  · a match played (a pistol and grenades bought, an HE thrown) → the host starts a new match → on the guest's own screen
//    nothing of the last match is left (loadout, grenades in the air, money back to the start); a buy still naming the
//    last match is refused;
//  · one lost pose request (Wi-Fi) or one refused for rate never stops the guest's hits and buys;
//  · the host changes the map: the guest is `loading` (out of the match) until it has the new map, then in it;
//  · the network figures for the perf overlay (multiplayer.js gdNetStats) are live numbers. No page errors.
//   node tests/browser/gd-lifecycle-lan-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDLIF1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gli-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); }; const errs = [];
async function open(who, skewMs = 0, w = 1100, h = 700) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: w, height: h } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(([n, skew]) => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); if (skew) { const real = Date.now; Date.now = () => real() + skew; } }, [who, skewMs]);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200); return p; }
const host = await open('Host'), guest = await open('Guest', 5000);
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }), a);
const G = p => p.evaluate(() => { const g = __infra.lab.world.operations.game, d = g.combat?.d, l = g.arena?.loadout?.guest || {}; return { map: g.arena?.map, match: g.arena?.match, n: d?.n, phase: d?.round?.phase, money: d?.money?.guest, team: d?.teams?.guest, primary: l.primary ?? null, secondary: l.secondary ?? null, nades: (l.nades || []).length, armor: g.combat?.armor?.guest?.kevlar || 0, inAir: (g.combat?.nades || []).length, ground: (g.combat?.ground || []).length }; });
// Host: Defuse · Dust II · 2 bots, a 3 s freeze; the guest joins the lobby; the host starts.
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dust2'); await host.selectOption('#ss-ar-bots', '2');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d, null, { timeout: 30000 });
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 });
await act(host, { type: 'settings', freeze: 3 }); const st = await act(host, { type: 'start-match' }); check('the host starts the match', !st?.error, JSON.stringify(st));
await guest.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze' && __infra.lab.world.operations.game.combat.d.n === 1, null, { timeout: 10000 }).catch(() => {});
// The guest's clock runs 5 s ahead: its host clock doesn't, and its round clock reads as the host's.
{ const off = await guest.evaluate(() => __infra.lab.lan.hostNow() - Date.now()); check('guest 5 s ahead: its host clock is the host’s (≈ −5 s from its own)', Math.abs(off + 5000) < 400, Math.round(off));
  const clk = p => p.evaluate(() => { const r = __infra.lab.world.operations.game.combat.d.round; return Math.round((r.phase === 'freeze' ? r.freezeUntil : r.endsAt) - __infra.lab.lan.hostNow()); });
  const [a, b] = await Promise.all([clk(host), clk(guest)]); check('…the round clock agrees with the host’s (within 0.5 s), not 5 s short', Math.abs(a - b) < 500, a + ' vs ' + b); }
// Round 1: the guest buys a pistol and two grenades ($800), the round goes live, it throws the HE.
let s = await G(guest); const m0 = s.match;
const buys = [await act(guest, { type: 'loadout', secondary: 'p250' }), await act(guest, { type: 'buy-nade', kind: 'he' }), await act(guest, { type: 'buy-nade', kind: 'flash' })];
await guest.waitForTimeout(400); s = await G(guest); check('round 1: the guest buys a P250, an HE and a flash (its screen)', s.secondary === 'p250' && s.nades === 2, JSON.stringify([buys, s]));
await guest.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 15000 }).catch(() => {});
const th = await guest.evaluate(() => { const c = __infra.camera.position; return __infra.lab.lan.act({ type: 'arena', action: { type: 'throw', kind: 'he', x: c.x, y: c.y, z: c.z, dx: 0, dy: .3, dz: -1, strength: 'long' } }); });
await guest.waitForTimeout(300); s = await G(guest); check('…and throws the HE: in the air on its screen', s.inAir > 0 && s.nades === 1, JSON.stringify([th, s]));
// The host starts a new match (the same reset as a match's end): on the guest's own screen, a clean start.
const nm = await act(host, { type: 'restart' }); check('the host starts a new match', !nm?.error, JSON.stringify(nm));
const fresh = await guest.waitForFunction(m0 => { const g = __infra.lab.world.operations.game; return g.arena?.match !== m0 && g.combat?.d?.n === 1; }, m0, { timeout: 10000 }).then(() => true).catch(() => false);
await guest.waitForTimeout(800); s = await G(guest);
check('new match on the guest’s screen: a new match id, round 1', fresh && s.match !== m0 && s.n === 1, JSON.stringify(s));
check('…nothing of the last match: no P250, no grenades (held or in the air), no armor, $800 again', s.secondary !== 'p250' && !s.primary && s.nades === 0 && s.inAir === 0 && s.armor === 0 && s.money === 800, JSON.stringify(s));
check('…its hands hold the side pistol again (it re-entered the match)', await guest.evaluate(() => ['pistol', 'usps'].includes(__infra.lab.pistol.current?.id)), await guest.evaluate(() => __infra.lab.pistol.current?.id));
{ const late = await guest.evaluate(m0 => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: 'flash', match: m0 } }), m0);
  check('a buy still naming the last match is refused', /match has ended/.test(String(late?.error || late)), JSON.stringify(late)); }
// One pose request lost on the way, then one refused for rate: the guest's buys and hits still go through.
{ let lost = 0, refused = 0; await guest.route('**/api/pose', r => { if (!lost) { lost++; return r.abort(); } if (!refused) { refused++; return r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Too many updates"}' }); } return r.continue(); });
  for (let i = 0; i < 6; i++) { await guest.evaluate(i => { const c = __infra.camera.position; __infra.lab.look(c.x + (i % 2 ? .3 : -.3), c.z, c.x, c.y, c.z - 20); }, i); await guest.waitForTimeout(150); }
  const back = await guest.waitForFunction(() => __infra.lab.lan.healthy, null, { timeout: 4000 }).then(() => true).catch(() => false);
  const k = await guest.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'knife', knife: 'default' } }));
  check('a lost pose and a refused one: the guest is connected again at once — its requests go through', lost === 1 && refused === 1 && back && !k?.error && !/Not connected/.test(String(k)), JSON.stringify({ lost, refused, back, k }));
  await guest.unroute('**/api/pose'); }
// The host changes the map: the guest is out of the match while it loads Mirage, then in it with a spawn of its own.
{ await host.evaluate(() => { globalThis.__seenLoading = false; const t = setInterval(() => { const p = (__infra.lab.lan.players || []).find(x => x.name === 'Guest'); if (p?.loading) { globalThis.__seenLoading = true; clearInterval(t); } }, 20); setTimeout(() => clearInterval(t), 20000); });
  const cm = await act(host, { type: 'change-map', map: 'mirage' }); check('the host changes the map to Mirage', !cm?.error, JSON.stringify(cm));
  const inNow = await guest.waitForFunction(() => __infra.lab.arenaScene.map === 'mirage' && __infra.lab.world.operations.game.combat?.spawnTo?.guest && document.getElementById('ar-load')?.hidden !== false, null, { timeout: 30000 }).then(() => true).catch(() => false);
  await host.waitForTimeout(800);
  const hv = await host.evaluate(() => ({ seen: globalThis.__seenLoading, now: !!(__infra.lab.lan.players || []).find(x => x.name === 'Guest')?.loading }));
  check('…the guest was `loading` (not in the match) until it had Mirage, then in it with a spawn', hv.seen && !hv.now && inNow, JSON.stringify(hv)); }
// The perf overlay's network figures (multiplayer.js gdNetStats): measured, live.
{ await guest.waitForTimeout(1500); const ns = await guest.evaluate(() => ({ ...__infra.lab.lan.netStats }));
  check('net stats: rtt, jitter, snapshot age, interpolation, queue, host tick and frame size are live numbers', ns.rtt > 0 && ns.rtt < 1000 && ns.jitter >= 0 && ns.snapshotAgeMs >= 0 && ns.snapshotAgeMs < 1000 && ns.interpMs >= 0 && ns.queue >= 0 && ns.hostTickMs >= 0 && ns.lastSnapshotBytes > 0 && Number.isFinite(ns.corrections) && Number.isFinite(ns.correctionMaxU), JSON.stringify(ns)); }
await guest.screenshot({ path: path.join(out, 'lifecycle-guest.png') });
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
console.log(ok + '/' + n); for (const bw of browsers) await bw.close(); server.kill(); process.exit(ok === n ? 0 : 1);
