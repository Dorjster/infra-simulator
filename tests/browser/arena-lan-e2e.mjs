// Global Defensive over LAN in two real browsers: the host starts "Host on LAN", a guest joins with the room code;
// both are in the arena and see each other and the bot; the host drops an AK, the guest walks over it and picks it
// up (both sides agree); the guest shoots the host (HP drops, the host hears it in 3D); frame pacing on both.
//   node tests/browser/arena-lan-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDLAN1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gd-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
// Host and guest in separate browser processes (own GPU process each), like two machines on a LAN.
const launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const browsers = [];
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 200) : '')); };
const errs = [];
async function open(who) {
  const bw = await launch(); browsers.push(bw); const ctx = await bw.newContext({ viewport: { width: 1200, height: 750 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n);
    globalThis.__panners = 0; const cp = AudioContext.prototype.createPanner; AudioContext.prototype.createPanner = function () { globalThis.__panners++; return cp.call(this); };
    // Frame pacing: every frame interval while the test runs.
    globalThis.__frames = []; globalThis.__long = []; globalThis.__phase = 'load'; let last = 0; const tick = t => { const behind = __phase === 'load' || !!document.getElementById('ar-load') && !document.getElementById('ar-load').hidden || !!document.getElementById('start-screen') && !document.getElementById('start-screen').hidden; if (last && behind) { if (t - last > 50) (globalThis.__hidden ??= []).push(Math.round(t - last)); last = t; requestAnimationFrame(tick); return; } if (last) { __frames.push(t - last); if (t - last > 50) { const mk = performance.getEntriesByType('mark').filter(m => m.startTime < t).at(-1); __long.push(__phase + ':' + Math.round(t - last) + (mk ? '@' + mk.name + '+' + Math.round(t - mk.startTime) : '')); } } last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, who);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200); return p;
}
const phase = (p, name) => p.evaluate(n => { globalThis.__phase = n; }, name);
const G = p => p.evaluate(() => { const g = __infra.lab.world.operations.game; return { mode: g.mode, bots: g.arena?.bots?.length, ground: (g.combat?.ground || []).map(i => i.item + '@' + i.id), loadout: g.arena?.loadout, hp: g.combat?.hp }; });
// Both browsers start up front (on a real LAN they are separate machines; here a Chrome launching mid-test would
// compete for this computer's CPU and show up as the host's lag).
const host = await open('Host'), guest = await open('Guest');
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(500); await host.selectOption('#ss-ar-bots', '1');
await phase(host, 'host-arena-start'); const hostBtn = await host.$('#ss-ar-host'); check('"Host on LAN" offered on the start screen', !!hostBtn); await (hostBtn || await host.$('#ss-ar-solo')).click(); await host.waitForTimeout(3000);
if (await host.evaluate(() => !document.getElementById('ar-buy').hidden)) await host.evaluate(() => document.querySelector('#ar-buy [data-act="close"]').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 });
check('Host is in the arena with a bot', (await G(host)).mode === 'arena' && (await G(host)).bots === 1);
await phase(host, 'guest-joining'); await phase(guest, 'join');
const code = await host.evaluate(() => __infra.lab.lan.roomCode);   // the code the host's screen shows
// The real way in: start screen → Join LAN → name + passcode → Join.
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code);
await guest.evaluate(() => document.getElementById('ss-join').click()); await guest.waitForTimeout(3500);
if (await guest.evaluate(() => !document.getElementById('ar-buy').hidden)) await guest.evaluate(() => document.querySelector('#ar-buy [data-act="close"]').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 }).catch(() => {});
check('Guest joined straight into the arena', (await G(guest)).mode === 'arena' && await guest.evaluate(() => __infra.lab.arenaScene.inArena(__infra.camera.position.z)), await guest.evaluate(() => __infra.camera.position.z.toFixed(0)));
const sees = p => p.evaluate(() => [...__infra.lab.lan.models.values()].map(m => m.name));
check('Host sees the guest and the bot', (await sees(host)).some(x => /Guest/.test(x)) && (await sees(host)).some(x => /^BOT/.test(x)), JSON.stringify(await sees(host)));
check('Guest sees the host and the bot', (await sees(guest)).some(x => /Host/.test(x)) && (await sees(guest)).some(x => /^BOT/.test(x)), JSON.stringify(await sees(guest)));
// Remove the bot now (it could kill someone mid-test and drop a gun of its own).
await host.evaluate(() => __infra.lab.lan.send({ type: 'arena', action: { type: 'remove-bot' } })); await host.waitForTimeout(600);
// Host buys an AK and drops it (G).
await phase(host, 'buy-drop'); await phase(guest, 'see-drop');
await host.evaluate(() => __infra.lab.lan.send({ type: 'arena', action: { type: 'loadout', primary: 'ak' } }));
await host.waitForFunction(() => __infra.lab.world.operations.game.arena.loadout.host?.primary === 'ak', null, { timeout: 5000 });
await host.evaluate(() => __infra.lab.enter()); await host.waitForTimeout(300); await host.waitForFunction(() => !__infra.lab.world.operations.game.combat.down?.host, null, { timeout: 8000 });
await host.keyboard.press('Digit1'); await host.waitForFunction(() => __infra.lab.pistol.current?.id === 'ak', null, { timeout: 3000 }).catch(() => {});
check('Key 1 puts the AK in hand', await host.evaluate(() => __infra.lab.pistol.current?.id) === 'ak');
const before = (await G(host)).ground.length; await host.keyboard.press('KeyG'); await host.waitForTimeout(1200);
check('One G press drops exactly one item (the AK in hand)', (await G(host)).ground.length === before + 1 && (await G(host)).ground.at(-1).startsWith('ak@'), JSON.stringify((await G(host)).ground));
check('After dropping, the host holds the pistol', await host.evaluate(() => __infra.lab.pistol.current?.id) === 'pistol');
const hg = await G(host), gg = await G(guest);
check('Host dropped the AK (no longer in the loadout)', !hg.loadout?.host?.primary && hg.ground.some(x => x.startsWith('ak@')), JSON.stringify(hg.ground));
check('Guest sees the AK on the ground', gg.ground.some(x => x.startsWith('ak@')), JSON.stringify(gg.ground));
check('The AK is drawn on the guest\'s screen', await guest.evaluate(() => { let n = 0; __infra.scene.traverse(o => { if (o.userData.ground) n++; }); return n; }) >= 1);
// Guest walks onto it: auto pickup (empty primary slot).
await phase(host, 'pickup'); await phase(guest, 'pickup');
await guest.evaluate(() => { const it = __infra.lab.world.operations.game.combat.ground.find(i => i.item === 'ak'); __infra.lab.enter(); __infra.camera.position.x = it.x + .5; __infra.camera.position.z = it.z; }); await guest.waitForTimeout(2000);
const hg2 = await G(host), gg2 = await G(guest);
check('Guest picked up the AK by walking over it', gg2.loadout?.guest?.primary === 'ak' && !gg2.ground.some(x => x.startsWith('ak@')), JSON.stringify(gg2.loadout?.guest));
check('Host agrees: AK gone from the ground, the guest has it', hg2.loadout?.guest?.primary === 'ak' && !hg2.ground.some(x => x.startsWith('ak@')));
// Guest shoots the host from ~25 units away until the host loses HP.
await phase(host, 'shot-at'); await phase(guest, 'shooting');
const hp0 = (await G(host)).hp?.host ?? 100;
await host.evaluate(() => { __infra.camera.position.set(__infra.camera.position.x, __infra.camera.position.y, __infra.camera.position.z); });
// Both in the open lane between the containers and the south wall (Freight Yard), 35 units apart.
const lane = await host.evaluate(async () => { const { ARENA } = await import('./facility-layout.js'); return { x: ARENA.cx, z: ARENA.cz + 102 }; });
await host.evaluate(l => { __infra.camera.position.x = l.x - 18; __infra.camera.position.z = l.z; }, lane); await guest.evaluate(l => { __infra.camera.position.x = l.x + 17; __infra.camera.position.z = l.z; }, lane);
await guest.waitForTimeout(900); const panners0 = await host.evaluate(() => __panners);
await guest.keyboard.press('Digit1'); await guest.waitForTimeout(300);
await host.waitForFunction(() => !__infra.lab.world.operations.game.combat.down?.host, null, { timeout: 6000 }).catch(() => {});
const place = () => Promise.all([host.evaluate(l => { __infra.camera.position.x = l.x - 18; __infra.camera.position.z = l.z; }, lane), guest.evaluate(l => { __infra.camera.position.x = l.x + 17; __infra.camera.position.z = l.z; }, lane)]);
// (bots are deadly since one head shot kills: take the bot out so this checks player vs player only)
await host.evaluate(async () => { while ((__infra.lab.world.operations.game.arena?.bots || []).length) await __infra.lab.lan.act({ type: 'arena', action: { type: 'remove-bot' } }); }); await host.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'start-match' } })); await host.waitForTimeout(3000);   // hosting opens a lobby: start the match (fresh loadouts: the guest takes an AK again)
await guest.evaluate(async () => { await __infra.lab.lan.act({ type: 'arena', action: { type: 'loadout', primary: 'ak' } }); __infra.lab.pistol.equip('ak'); }); await guest.waitForTimeout(1200);
let hit = false; for (let i = 0; i < 25 && !hit; i++) {
  await place(); await guest.waitForTimeout(120);
  await guest.evaluate(() => { const L = __infra.lab, m = [...L.lan.models.values()].find(m => /Host/.test(m.name)); if (!m) return; const t = m.g.position, c = __infra.camera; L.look(c.position.x, c.position.z, t.x, t.y + 7.5, t.z, c.position.y); });   // aim through the game's own look (as the mouse does)
  await guest.mouse.move(600, 375); await guest.mouse.down(); await guest.waitForTimeout(140); await guest.mouse.up(); await guest.waitForTimeout(160);
  hit = ((await G(host)).hp?.host ?? 100) < hp0;
}
check('Guest\'s shots hurt the host (host side)', hit, JSON.stringify((await G(host)).hp));
check('Host sees the guest holding the AK', await host.evaluate(() => { const p = __infra.lab.lan.players.find(p => /Guest/.test(p.name)); return p?.pose?.gun === true && p.pose.weapon === 'ak'; }));
check('Host heard the guest\'s shots in 3D', await host.evaluate(() => __panners) > panners0);
// Keep firing until the host is down: the host then spectates the guest (CS2), its body stays where it fell.
await phase(host, 'spectate'); await phase(guest, 'kill');
let down = false; for (let i = 0; i < 40 && !down; i++) {
  await place(); await guest.waitForTimeout(80);
  await guest.evaluate(() => { const L = __infra.lab, m = [...L.lan.models.values()].find(m => /Host/.test(m.name)); if (!m) return; const t = m.g.position, c = __infra.camera; L.look(c.position.x, c.position.z, t.x, t.y + 7.5, t.z, c.position.y); });   // aim through the game's own look (as the mouse does)
  await guest.mouse.down(); await guest.waitForTimeout(160); await guest.mouse.up(); await guest.waitForTimeout(120);
  down = await host.evaluate(() => !!__infra.lab.world.operations.game.combat.down?.host);
}
check('Guest killed the host', down);
await host.waitForTimeout(700);
const spec = await host.evaluate(() => { const bar = document.getElementById('sp-bar'), m = [...__infra.lab.lan.models.values()].find(m => /Guest/.test(m.name)); return { on: __infra.lab.spectating ?? null, bar: !bar.hidden && bar.textContent, near: m ? __infra.camera.position.distanceTo(m.g.position) : null, red: !document.getElementById('cb-down').hidden }; });
check('Host is spectating the guest (CS2 bar, no red screen)', /SPECTATING/.test(spec.bar) && /Guest/.test(spec.bar) && /killed by Guest/i.test(spec.bar) && !spec.red, JSON.stringify(spec));
check('Spectator camera follows the guest', spec.near !== null && spec.near < 16, spec.near?.toFixed(1));
const body = await guest.evaluate(l => { const p = __infra.lab.lan.players.find(p => /Host/.test(p.name)); return p ? Math.hypot(p.pose.x - (l.x - 18), p.pose.z - l.z) : null; }, lane);
check('Everyone else still sees the host\'s body where it fell', body !== null && body < 4, body?.toFixed(1));
await host.waitForFunction(() => !__infra.lab.world.operations.game.combat.down?.host, null, { timeout: 8000 }).catch(() => {}); await host.waitForTimeout(900);
check('Respawn ends spectating', await host.evaluate(() => document.getElementById('sp-bar').hidden));
const pacing = p => p.evaluate(() => { const f = __frames.slice().sort((a, b) => a - b), q = k => f[Math.floor(f.length * k)] || 0; return { frames: f.length, p50: q(.5).toFixed(1), p99: q(.99).toFixed(1), max: (f.at(-1) || 0).toFixed(1), over50: f.filter(x => x > 50).length }; });
const ph = await pacing(host), pg = await pacing(guest); console.log('long frames in play · host', JSON.stringify(await host.evaluate(() => __long)), 'guest', JSON.stringify(await guest.evaluate(() => __long)), '· behind loading / start screens (not visible as lag) · host', JSON.stringify(await host.evaluate(() => globalThis.__hidden || [])), 'guest', JSON.stringify(await guest.evaluate(() => globalThis.__hidden || []))); console.log('frame pacing host', JSON.stringify(ph), 'guest', JSON.stringify(pg));
check('No hitches while playing on the host (no frame over 50 ms)', ph.over50 === 0, JSON.stringify(ph)); check('No hitches while playing on the guest (no frame over 50 ms)', pg.over50 === 0, JSON.stringify(pg));
await host.screenshot({ path: path.join(out, 'lan-host.png') }); await guest.screenshot({ path: path.join(out, 'lan-guest.png') });
check('No page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); for (const bw of browsers) await bw.close(); server.kill(); process.exit(ok === n ? 0 : 1);
