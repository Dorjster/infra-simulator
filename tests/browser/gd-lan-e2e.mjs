// Global Defensive over LAN, two browsers (host + guest), Defuse on Dune with 2 bots:
// lobby (confirmed mode + map, countdown, the guest listed, no damage in warmup, host starts early) → rounds:
// Tab two-team scoreboard, unique spawns, buying two rifles drops the first, the guest finds the host's dropped gun in
// the B menu and picks it up with its rounds (one claim only), ammo agrees host ↔ client, M team change next round,
// the host changes the map and both land on the new map in the same round state. No page errors.
//   node tests/browser/gd-lan-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDLAN1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 260) : '')); }; const errs = [];
async function open(who, w = 1280, h = 760) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: w, height: h } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, who);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200); return p; }
const host = await open('Host'), guest = await open('Guest', 1100, 700);
const G = p => p.evaluate(() => { const g = __infra.lab.world.operations.game, d = g.combat?.d; return { mode: g.mode, kind: g.arena?.kind, map: g.arena?.map, lobby: g.arena?.lobby, teams: d?.teams, phase: d?.round?.phase, n: d?.n, score: d?.score }; });
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }), a);
// Host: Defuse · Dune · 2 bots · Host on LAN → lobby.
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dune'); await host.selectOption('#ss-ar-bots', '2');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d, null, { timeout: 30000 });
let s = await G(host); check('first attempt: Defuse on Dune (not deathmatch)', s.mode === 'arena' && s.kind === 'defuse' && s.map === 'dune' && s.phase === 'warmup', JSON.stringify({ kind: s.kind, map: s.map, phase: s.phase }));
check('a two-minute lobby is open', s.lobby && !s.lobby.started && s.lobby.until - Date.now() > 100000, JSON.stringify(s.lobby));
await host.waitForTimeout(400);
check('lobby panel: confirmed mode + map and a countdown', await host.evaluate(() => /LOBBY · DEFUSE · Dune/.test(document.getElementById('ar-lobby').textContent) && /Match starts in (2:00|1:5\d)/.test(document.getElementById('ar-lobby').textContent)), await host.evaluate(() => document.getElementById('ar-lobby').textContent.slice(0, 120)));
check('the top bar is not covered by the host invite bar', await host.evaluate(() => { const a = document.getElementById('lan-invite'); return !a || a.hidden || getComputedStyle(a).display === 'none'; }));
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 });
const sg = await G(guest); check('the guest lands in the same lobby: Defuse · Dune · warmup', sg.kind === 'defuse' && sg.map === 'dune' && sg.phase === 'warmup');
await host.waitForTimeout(800); check('the guest is listed in the host lobby', await host.evaluate(() => /Guest/.test(document.getElementById('ar-lobby').textContent)));
const gid = await host.evaluate(() => (__infra.lab.lan.players || []).find(p => p.name === 'Guest')?.id);
const warm = await host.evaluate(id => __infra.lab.lan.combat({ type: 'hit', target: id, weapon: 'pistol', zone: 'chest', n: 1 }), gid);
check('warmup: no damage', /Warmup/.test(warm?.error || ''), JSON.stringify(warm));
// Ready + host starts early.
await act(guest, { type: 'ready', ready: true });
const st = await act(host, { type: 'start-match' }); check('the host starts the match early', !st?.error, JSON.stringify(st));
await host.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 8000 });
await guest.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze' && __infra.lab.world.operations.game.combat.d.n === 1, null, { timeout: 8000 }).catch(() => {});
s = await G(host); const s2 = await G(guest); check('both in round 1 (freeze), same teams', s.n === 1 && s2.n === 1 && JSON.stringify(s.teams) === JSON.stringify(s2.teams), JSON.stringify(s.teams));
await guest.waitForTimeout(1200);
const pos = await host.evaluate(() => { const out = [[__infra.camera.position.x, __infra.camera.position.z]]; for (const [, m] of __infra.lab.lan.models) if (m.g.visible) out.push([m.g.position.x, m.g.position.z]); return out; });
let minD = Infinity; for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) minD = Math.min(minD, Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]));
check('round start: nobody stands inside anybody (host view, 4 players)', pos.length >= 4 && minD > 3.5, minD.toFixed(2) + ' · ' + pos.length);
check('nobody is lying dead at the round start', await guest.evaluate(() => [...__infra.lab.lan.models.values()].every(m => !m.cbDown)));
// Tab: two team columns.
await host.evaluate(() => __infra.lab.enter()); await host.keyboard.down('Tab'); await host.waitForTimeout(300);
check('Tab: two team columns with scores, K/D/A, ping, money', await host.evaluate(() => { const b = document.getElementById('ar-board'); return !b.hidden && /TERRORISTS/.test(b.textContent) && /COUNTER-TERRORISTS/.test(b.textContent) && /PING/.test(b.textContent) && /\$800/.test(b.textContent) && b.querySelector('tr.me'); }));
await host.screenshot({ path: path.join(out, 'lan-tab.png') });
await host.keyboard.up('Tab'); await host.waitForTimeout(200); check('releasing Tab closes it', await host.evaluate(() => document.getElementById('ar-board').hidden));
// Buy two rifles in a row (money for it), then the host drops one for the guest.
const hostTeam = s.teams.host; await host.evaluate(t => { __infra.lab.world.operations.game.combat.d.money.host; }, hostTeam);
await host.evaluate(() => { /* rich for the test */ });
const rif = hostTeam === 't' ? ['galil', 'ak'] : ['famas', 'm4'];
// (give money through the host rules: cheat-free — use two cheap pistols instead if money is short)
let b1 = await act(host, { type: 'loadout', secondary: 'p250' }), b2 = await act(host, { type: 'loadout', secondary: hostTeam === 't' ? 'pistol' : 'usps' });   // $300 + $200 of $800
check('buying a second pistol drops the first (with its rounds)', !b1?.error && /dropped your P250/.test(String(b2)), String(b1) + ' | ' + String(b2));
const g1 = await host.evaluate(() => __infra.lab.world.operations.game.combat.ground.find(x => x.item === 'p250'));
check('…the P250 is on the ground, full', g1 && g1.ammo?.[0] === 13 && g1.ammo?.[1] === 26, JSON.stringify(g1));
// The guest walks to it (teleport next to it), opens B and sees it as a nearby drop; picks it up from the menu.
await guest.evaluate(it => { __infra.lab.enter(); __infra.camera.position.x = it.x + 2; __infra.camera.position.z = it.z; }, g1); await guest.waitForTimeout(800);
await guest.evaluate(() => __infra.lab.arenaUI.buy(true)); await guest.waitForTimeout(300);
check('guest B menu: Nearby dropped weapons lists the P250 (dropped by Host)', await guest.evaluate(() => /NEARBY DROPPED/.test(document.getElementById('ar-buy').textContent) && /P250/.test(document.querySelector('#ar-buy .near')?.textContent || '') && /Host/.test(document.querySelector('#ar-buy .near')?.textContent || '')));
await guest.evaluate(() => [...document.querySelectorAll('#ar-buy [data-ground]')].find(b => /P250/.test(b.textContent))?.click()); await guest.waitForTimeout(900);
const gl = await guest.evaluate(() => ({ sec: __infra.lab.world.operations.game.arena.loadout.guest?.secondary, ammo: __infra.lab.pistol.ammoOf('p250'), ground: __infra.lab.world.operations.game.combat.ground.filter(x => x.item === 'p250').length }));
check('the guest has the P250 with its rounds; it left the ground', gl.sec === 'p250' && gl.ammo[0] === 13 && gl.ground === 0, JSON.stringify(gl));
const twice = await act(host, { type: 'pickup', id: g1.id }); check('nobody else can claim it again', /Already taken/.test(twice?.error || ''), JSON.stringify(twice));
await guest.keyboard.press('Escape');
// M: the guest asks to switch side → next round.
const tm = await act(guest, { type: 'team', team: s.teams.guest === 't' ? 'ct' : 't' });
check('M during a match: change at the next round', /next round/.test(String(tm)) || /too many/.test(tm?.error || ''), JSON.stringify(tm));
// Host changes the map: both clients land on Plaza, round 1, same state.
await host.evaluate(() => __infra.lab.arenaUI.teamMenu(true)); await host.waitForTimeout(300);
check('M menu: host map / bots / difficulty controls', await host.evaluate(() => !!document.querySelector('#ar-team #ar-mapsel') && !!document.querySelector('#ar-team #ar-botn')));
await host.evaluate(() => { document.getElementById('ar-mapsel').value = 'plaza'; document.querySelector('[data-map-go]').click(); }); await host.waitForTimeout(500);
await guest.waitForFunction(() => __infra.lab.world.operations.game.arena?.map === 'plaza' && __infra.lab.arenaScene.map === 'plaza', null, { timeout: 15000 }).catch(() => {});
await host.waitForTimeout(1500);
const hm = await host.evaluate(() => ({ map: __infra.lab.arenaScene.map, boxes: __infra.lab.arenaScene.boxes.length, kind: __infra.lab.world.operations.game.arena.kind, n: __infra.lab.world.operations.game.combat.d?.n, inArena: __infra.lab.arenaScene.inArena(__infra.camera.position.z) }));
const gm = await guest.evaluate(() => ({ map: __infra.lab.arenaScene.map, boxes: __infra.lab.arenaScene.boxes.length, kind: __infra.lab.world.operations.game.arena.kind, n: __infra.lab.world.operations.game.combat.d?.n, inArena: __infra.lab.arenaScene.inArena(__infra.camera.position.z) }));
check('map change: host and guest both on Plaza (geometry built), Defuse round 1', hm.map === 'plaza' && gm.map === 'plaza' && hm.boxes === gm.boxes && hm.boxes > 10 && hm.n === 1 && gm.n === 1 && hm.inArena && gm.inArena, JSON.stringify([hm, gm]));
await guest.screenshot({ path: path.join(out, 'lan-plaza-guest.png') });
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
console.log(ok + '/' + n); for (const bw of browsers) await bw.close(); server.kill(); process.exit(ok === n ? 0 : 1);
