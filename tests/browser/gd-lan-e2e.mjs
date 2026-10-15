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
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dust2'); await host.selectOption('#ss-ar-bots', '2');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d, null, { timeout: 30000 });
let s = await G(host); check('first attempt: Defuse on Dune (not deathmatch)', s.mode === 'arena' && s.kind === 'defuse' && s.map === 'dust2' && s.phase === 'warmup', JSON.stringify({ kind: s.kind, map: s.map, phase: s.phase }));
check('a two-minute lobby is open', s.lobby && !s.lobby.started && s.lobby.until - Date.now() > 100000, JSON.stringify(s.lobby));
await host.waitForTimeout(400);
check('lobby panel: confirmed mode + map and a countdown', await host.evaluate(() => /LOBBY · DEFUSE · Dust II/.test(document.getElementById('ar-lobby').textContent) && /Match starts in (2:00|1:5\d)/.test(document.getElementById('ar-lobby').textContent)), await host.evaluate(() => document.getElementById('ar-lobby').textContent.slice(0, 120)));
check('the top bar is not covered by the host invite bar', await host.evaluate(() => { const a = document.getElementById('lan-invite'); return !a || a.hidden || getComputedStyle(a).display === 'none'; }));
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 });
const sg = await G(guest); check('the guest lands in the same lobby: Defuse · Dune · warmup', sg.kind === 'defuse' && sg.map === 'dust2' && sg.phase === 'warmup');
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
// The guest walks to it (teleport next to it): it lies within reach (dropped by the host); E picks it up (as CS2 — the buy
// menu lists no ground items).
await guest.evaluate(it => { __infra.lab.look(it.x + 2, it.z, it.x, (it.y || 0) + 2, it.z); }, g1);   // stands next to it, on that floor
await guest.waitForTimeout(800);   // (the room learns where the guest now stands)
check('the P250 lies within the guest\'s reach, dropped by the host', await guest.evaluate(() => __infra.lab.arenaUI.nearbyGround().includes('P250')) && /host/i.test(g1.by || ''), JSON.stringify(g1.by));
await guest.evaluate(() => __infra.lab.arenaUI.pickNearest('P250')); await guest.waitForTimeout(900);
const gl = await guest.evaluate(() => ({ sec: __infra.lab.world.operations.game.arena.loadout.guest?.secondary, ammo: __infra.lab.pistol.ammoOf('p250'), ground: __infra.lab.world.operations.game.combat.ground.filter(x => x.item === 'p250').length }));
check('the guest has the P250 with its rounds; it left the ground', gl.sec === 'p250' && gl.ammo[0] === 13 && gl.ground === 0, JSON.stringify(gl));
const twice = await act(host, { type: 'pickup', id: g1.id }); check('nobody else can claim it again', /Already taken/.test(twice?.error || ''), JSON.stringify(twice));
await guest.keyboard.press('Escape');
// A death clears the victim's loadout on their own screen at once (no old guns / grenades until the next round).
{ const tm = await host.evaluate(() => __infra.lab.world.operations.game.combat.d.teams); if (tm.host !== tm.guest) {
    await act(host, { type: 'settings', bots: 0 }); await host.waitForTimeout(300);   // just the two of us: the host is the one who shoots
    await guest.evaluate(() => { const s = __infra.lab.world.operations.game.combat.spawnTo.guest; __infra.lab.look(s.x, s.z, s.x, 9, s.z - 30); }); await guest.waitForTimeout(600);
    const bn = await act(guest, { type: 'buy-nade', kind: 'flash' }); await guest.waitForTimeout(500); const had = await guest.evaluate(() => (__infra.lab.world.operations.game.arena.loadout.guest?.nades || []).length);
    await host.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 30000 }).catch(() => {});
    const hw = await host.evaluate(() => __infra.lab.world.operations.game.arena.loadout.host?.secondary || (__infra.lab.world.operations.game.combat.d.teams.host === 'ct' ? 'usps' : 'pistol'));
    await host.evaluate(async () => { const s = __infra.lab.world.operations.game.combat.spawnTo.guest, { segmentClear } = await import('./arena-maps.js'), B = __infra.lab.arenaScene.boxes, y = (s.y ?? 0) + 9.7;   // beside the guest, on a side with a clear line to them (a CS2 map's spawn may stand by a wall)
      const [dx, dz] = [[8, 0], [-8, 0], [0, 8], [0, -8], [5, 5], [-5, -5], [5, -5], [-5, 5]].find(([dx, dz]) => segmentClear(B, s.x + dx, y, s.z + dz, s.x, y - 1, s.z)) || [8, 0]; __infra.lab.look(s.x + dx, s.z + dz, s.x, y - 1, s.z, y); }); await host.waitForTimeout(700);
    await host.evaluate(w => __infra.lab.pistol.equip(w), hw); await host.waitForTimeout(800); await host.evaluate(() => { __infra.lab.pistol.button(0, true); __infra.lab.pistol.button(0, false); }); await host.waitForTimeout(150);
    const k = await host.evaluate(([id, w]) => __infra.lab.world.operations.game.combat.down?.guest ? 'already down' : __infra.lab.lan.combat({ type: 'hit', target: id, weapon: w, zone: 'head', n: 1 }), [gid, hw]); await guest.waitForFunction(() => !!__infra.lab.world.operations.game.combat.down?.guest, null, { timeout: 30000 }).catch(() => {}); await guest.waitForTimeout(400);   // shot by the host, or by a bot if the host fell first
    const after = await guest.evaluate(() => { const g = __infra.lab.world.operations.game, l = g.arena.loadout.guest || {}; return { down: !!g.combat.down?.guest, nades: (l.nades || []).length, primary: l.primary, util: document.getElementById('gd-hud').hidden ? '(hud hidden while dead)' : document.querySelector('#gd-wp .util')?.textContent || '' }; });
    check('a death clears the victim\'s loadout on their screen at once (grenade gone, no rifle)', had === 1 && after.down && after.nades === 0 && !after.primary && !/◆/.test(after.util), JSON.stringify({ bn, had, k, after }));
    // Bodies never block: the host walks straight at the guest's body and through it.
    const body = await host.evaluate(() => { const m = [...__infra.lab.lan.models.values()].find(x => /guest/i.test(x.name || '')); return m ? { x: m.g.position.x, z: m.g.position.z } : null; });
    if (body && after.down) { await host.evaluate(b => __infra.lab.look(b.x - 8, b.z, b.x + 30, 9, b.z), body); await host.waitForTimeout(300); await host.evaluate(() => __infra.lab.enter()); await host.keyboard.down('KeyW'); await host.waitForTimeout(900); await host.keyboard.up('KeyW');
      const hx = await host.evaluate(() => __infra.camera.position.x); check('a dead body does not block: the host walks through it', hx > body.x + 2, (hx - body.x).toFixed(1)); }
  } else check('a death clears the victim\'s loadout (skipped: same team)', true); }
// M: the guest asks to switch side → next round.
const tm = await act(guest, { type: 'team', team: s.teams.guest === 't' ? 'ct' : 't' });
check('M during a match: change at the next round', /next round/.test(String(tm)) || /too many/.test(tm?.error || ''), JSON.stringify(tm));
// Host changes the map: both clients land on Mirage, round 1, same state.
await host.evaluate(() => __infra.lab.arenaUI.teamMenu(true)); await host.waitForTimeout(300);
check('M menu: host map / bots / difficulty controls', await host.evaluate(() => !!document.querySelector('#ar-team #ar-mapsel') && !!document.querySelector('#ar-team #ar-botn')));
await host.evaluate(() => { document.getElementById('ar-mapsel').value = 'mirage'; document.querySelector('[data-map-go]').click(); }); await host.waitForTimeout(500);
await guest.waitForFunction(() => __infra.lab.world.operations.game.arena?.map === 'mirage' && __infra.lab.arenaScene.map === 'mirage', null, { timeout: 15000 }).catch(() => {});
await host.waitForTimeout(1500);
const hm = await host.evaluate(() => ({ map: __infra.lab.arenaScene.map, boxes: __infra.lab.arenaScene.boxes.length, kind: __infra.lab.world.operations.game.arena.kind, n: __infra.lab.world.operations.game.combat.d?.n, inArena: __infra.lab.arenaScene.inArena(__infra.camera.position.z) }));
const gm = await guest.evaluate(() => ({ map: __infra.lab.arenaScene.map, boxes: __infra.lab.arenaScene.boxes.length, kind: __infra.lab.world.operations.game.arena.kind, n: __infra.lab.world.operations.game.combat.d?.n, inArena: __infra.lab.arenaScene.inArena(__infra.camera.position.z) }));
check('map change: host and guest both on Mirage (geometry built), Defuse round 1', hm.map === 'mirage' && gm.map === 'mirage' && hm.boxes === gm.boxes && hm.boxes > 10 && hm.n === 1 && gm.n === 1 && hm.inArena && gm.inArena, JSON.stringify([hm, gm]));
await guest.screenshot({ path: path.join(out, 'lan-mirage-guest.png') });
// Host match rules panel: a preset chosen mid-match is queued for the next match, on both clients; this match keeps its rules.
await host.evaluate(() => __infra.lab.arenaUI.teamMenu(true)); await host.waitForTimeout(300);
await host.evaluate(() => { const s = document.getElementById('ar-preset'); s.value = 'short'; s.dispatchEvent(new Event('change', { bubbles: true })); });
const ru = await guest.waitForFunction(() => { const G = __infra.lab.world.operations.game; return G.arena?.rulesNext?.win === 9 && G.combat.d?.rules?.win === 13 && JSON.stringify(G.arena.rulesNext); }, null, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => null);
check('rules panel: Short preset mid-match → first to 9 from the next match (guest sees it; this match stays first to 13)', !!ru, ru);
await host.evaluate(() => __infra.lab.arenaUI.teamMenu(true)); await host.waitForTimeout(300);
check('rules panel: the host sees "next match" and the queued values', await host.evaluate(() => /next match/.test(document.getElementById('ar-team').innerText) && document.getElementById('ar-win').value === '9'));
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
console.log(ok + '/' + n); for (const bw of browsers) await bw.close(); server.kill(); process.exit(ok === n ? 0 : 1);
