// LAN Defuse through the real room server, with players made of plain HTTP (no browsers: every join, leave and map change
// at full speed): the host starts Defuse with 7 bots; two people join → 5 vs 5; joins always work — 20 times one leaves
// and comes back (the seat freed at once on leave; a dropped connection frees it within seconds; never a second copy),
// 5 people join at the same moment; the match runs; on every map (the host changes it mid-match) someone joins in the
// middle of a live round: they watch until the next round, then play — money, their own spot — and when they leave the
// sides even again.
//   node tests/lan-defuse-room.mjs
import { spawn } from 'node:child_process'; import { mkdtempSync, existsSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ARENA_MAPS, useMapFile } from '../dist/arena-maps.js'; import { ARENA } from '../dist/facility-layout.js';
const CODE = 'RMTEST', HU = 2.54 / 16.5;
for (const id of ['dust2', 'mirage', 'inferno', 'nuke', 'cache', 'anubis', 'ancient', 'overpass']) if (existsSync('user-maps/' + id + '.bsp')) useMapFile(id, readFileSync('user-maps/' + id + '.bsp'));   // (the maps the room has, as each player's game has them)
const server = spawn(process.execPath, ['lan/server.mjs'], { env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: CODE, HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'rm-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server')), 30000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' · ' + info : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// The game in the room's snapshot: operations.mode, .arena, .combat (the client puts them together as operations.game).
const gameOf = w => { const o = w?.operations; return o ? { mode: o.mode, arena: o.arena, combat: o.combat } : null; };
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await sleep(50); } return !!f(); };
// A player: joins, keeps its event stream (world + combat), stands where the host sends it (its spawn order), posts its
// pose ten times a second while in the arena, and can act or leave.
async function player(name, host = false) {
  const j = await (await fetch(base + '/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, code: CODE, ...(host ? { hostKey: 'k' } : {}) }) })).json();
  if (!j.token) return { error: j.error || 'no token' };
  const P = { name: j.name, token: j.token, world: j.world, revision: j.revision, combat: gameOf(j.world)?.combat || null, players: j.players || [], ac: new AbortController(), alive: true, at: null };
  const H = { 'content-type': 'application/json', 'x-player-token': P.token };
  fetch(base + '/api/events?token=' + P.token, { signal: P.ac.signal }).then(async res => { const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /event: (\w+)/.exec(chunk)?.[1], data = /data: (.*)/s.exec(chunk)?.[1]; if (!ev || !data) continue;
        try { const x = JSON.parse(data); if (ev === 'world') { P.world = x.world; P.revision = x.revision; if (gameOf(x.world)?.combat) P.combat = gameOf(x.world).combat; } else if (ev === 'combat') P.combat = x; else if (ev === 'players') P.players = x; } catch {} } } }).catch(() => {});
  const game = () => gameOf(P.world);
  (async () => { while (P.alive) { const g = game(), s = P.combat?.spawnTo?.[P.name.toLowerCase()], M = ARENA_MAPS[g?.arena?.map];
      if (g?.mode === 'arena' && M) { if (s && s.at !== P.spawnAt) { P.spawnAt = s.at; P.at = { x: s.x, y: (s.y ?? 0) + 9.7, z: s.z }; } if (!P.at && M.t?.[0]) P.at = { x: ARENA.cx + M.t[0][0], y: 9.7 + (M.nav?.floorAt(M.t[0][0], M.t[0][1]) || 0), z: ARENA.cz + M.t[0][1] };   // (a map only in a file this process hasn't read: wait for the spawn order)
        if (P.at) await fetch(base + '/api/pose', { method: 'POST', headers: H, body: JSON.stringify({ pose: { ...P.at, yaw: 0 } }) }).catch(() => {}); }
      await sleep(100); } })();
  P.act = async a => { for (let k = 0; k < 4; k++) { const r = await (await fetch(base + '/api/action', { method: 'POST', headers: H, body: JSON.stringify({ revision: P.revision, action: a }) })).json().catch(e => ({ error: e.message })); if (r.world) { P.world = r.world; P.revision = r.revision ?? P.revision; if (gameOf(r.world)?.combat) P.combat = gameOf(r.world).combat; } if (!/World changed/.test(r.error || '')) return r; } };   // (a world action carries the revision it was meant for: retried on the latest)
  P.leave = async () => { P.alive = false; await fetch(base + '/api/leave?token=' + P.token, { method: 'POST' }).catch(() => {}); P.ac.abort(); };   // (as the page does on closing)
  P.drop = () => { P.alive = false; P.ac.abort(); };   // (the connection just lost: a crash, the network)
  return P;
}
const people = h => h.players.filter(p => !p.bot).map(p => p.name);
const counts = h => { const c = { t: 0, ct: 0 }, d = h.combat?.d, g = gameOf(h.world); if (!d) return c; for (const k of [...people(h).map(n => n.toLowerCase()), ...(g.arena?.bots || []).map(b => b.name.toLowerCase())]) if (d.teams[k] === 't' || d.teams[k] === 'ct') c[d.teams[k]]++; return c; };
const apart = h => { const g = gameOf(h.world), C = h.combat, ppl = new Set(people(h).map(n => n.toLowerCase())), S = [...Object.entries(C?.spawnTo || {}).filter(([k]) => ppl.has(k) && !C?.down?.[k]).map(([, s]) => [s.x, s.z, s.y]), ...(g?.arena?.bots || []).map(b => [b.x, b.z, b.y])]; let close = 0;
  for (let i = 0; i < S.length; i++) for (let j = 0; j < i; j++) if (!(Number.isFinite(S[i][2]) && Number.isFinite(S[j][2]) && Math.abs(S[i][2] - S[j][2]) > 6) && Math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1]) < 32 * HU) close++; return { placed: S.length, close }; };
try {
  const host = await player('Host', true); check('the host joins the room', !host.error, host.error || '');
  const st = await host.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'defuse', map: 'dust2', bots: 7, difficulty: 'normal', lobby: true, warmup: 120, freeze: 15 } });   // (as the start screen's Host does)
  check('the host starts Defuse on Dust II with 7 bots (a lobby)', await until(() => host.combat?.d && gameOf(host.world)?.arena?.bots?.length === 7), JSON.stringify(st).slice(0, 120));
  const bo = await player('Bo'), cy0 = await player('Cy'); check('Bo and Cy join', !bo.error && !cy0.error);
  check('3 people + 7 bots: 5 vs 5', await until(() => { const c = counts(host); return c.t === 5 && c.ct === 5; }), JSON.stringify(counts(host)));
  // Joins always work: one person leaves and comes back, 20 times (by leaving, and by a dropped connection).
  let cy = cy0, okAll = true, ghosts = 0, slowest = 0, side = host.combat.d.teams.cy;
  for (let i = 0; i < 20; i++) { const t0 = Date.now(); if (i % 4 === 3) cy.drop(); else await cy.leave();
    const gone = await until(() => !people(host).includes('Cy'), 15000); cy = await player('Cy'); const back = await until(() => people(host).filter(n => /^Cy/.test(n)).length === 1 && host.combat?.d?.teams?.cy, 8000);
    if (!gone || !back || cy.error) okAll = false; if (people(host).filter(n => /^Cy/.test(n)).length > 1) ghosts++; slowest = Math.max(slowest, Date.now() - t0); }
  check('20 leaves and rejoins (every 4th a dropped connection): each time gone, back, once, on the same side', okAll && !ghosts && host.combat.d.teams.cy === side, `slowest ${slowest} ms · ghosts ${ghosts}`);
  check('…and still 5 vs 5', (await until(() => { const c = counts(host); return c.t === 5 && c.ct === 5; })), JSON.stringify(counts(host)));
  // Five people at the same moment.
  const five = await Promise.all(['E1', 'E2', 'E3', 'E4', 'E5'].map(n => player(n)));
  check('5 people join at the same moment: all in, each once, each on a side', five.every(p => !p.error) && await until(() => ['E1', 'E2', 'E3', 'E4', 'E5'].every(n => people(host).filter(x => x === n).length === 1 && host.combat?.d?.teams?.[n.toLowerCase()])), JSON.stringify(people(host)));
  for (const p of five) await p.leave(); await until(() => !people(host).some(n => /^E\d/.test(n)), 8000);
  // The match.
  const sm = await host.act({ type: 'arena', action: { type: 'start-match' } }); await until(() => host.combat?.d?.round?.phase === 'freeze' && gameOf(host.world)?.arena?.lobby?.started, 8000);
  check('the host starts the match', gameOf(host.world).arena.lobby.started, JSON.stringify(sm).slice(0, 100));
  await host.act({ type: 'arena', action: { type: 'restart-round' } }); await sleep(800);
  check('the round starts 5 vs 5 (after the leaves, bots even it), everyone on a spot of their own', (() => { const c = counts(host), a = apart(host); return c.t === 5 && c.ct === 5 && a.close === 0; })(), JSON.stringify({ ...counts(host), ...apart(host) }));
  // Every map: the host changes it mid-match; someone joins mid-round there.
  const maps = ['dust2', 'mirage', 'inferno', 'nuke', 'cache', 'anubis', 'ancient', ...(existsSync('user-maps/overpass.bsp') ? ['overpass'] : [])];
  for (const id of maps) { if (id !== 'dust2') { const r = await host.act({ type: 'arena', action: { type: 'change-map', map: id } }); await until(() => gameOf(host.world)?.arena?.map === id && host.combat?.d?.n === 1, 15000); await sleep(600);
      check(`${id}: the host changes the map mid-match → 5 vs 5 on round 1, everyone on a spot of their own`, (() => { const c = counts(host), a = apart(host); return gameOf(host.world).arena.map === id && host.combat.d.n === 1 && c.t === 5 && c.ct === 5 && a.close === 0; })(), JSON.stringify({ r: r.result || r.error, n: host.combat?.d?.n, ...counts(host), ...apart(host) })); }
    await until(() => host.combat?.d?.round?.phase === 'live' && Date.now() - host.combat.d.round.at > 9000, 30000);   // live, past a round's first seconds
    const dee = await player('Dee'); await until(() => host.combat?.d?.teams?.dee && host.combat?.down?.dee, 8000);
    check(`${id}: Dee joins mid-round, on an even team, watching until the next round`, host.combat?.down?.dee?.weapon === 'joined mid-round' && Math.abs(counts(host).t - counts(host).ct) <= 1, JSON.stringify({ down: host.combat?.down?.dee, ...counts(host) }));
    await host.act({ type: 'arena', action: { type: 'restart-round' } }); await until(() => !host.combat?.down?.dee && host.combat?.spawnTo?.dee, 8000); await sleep(400);
    const buy = await dee.act({ type: 'arena', action: { type: 'loadout', secondary: 'deagle' } });
    check(`${id}: next round Dee plays: money, a spot of their own, buys in the spawn`, !host.combat.down?.dee && host.combat.d.money.dee >= 800 && apart(host).close === 0 && /Desert Eagle/.test(JSON.stringify(buy)), JSON.stringify({ money: host.combat.d.money.dee, ...apart(host), buy: buy.result || buy.error }));
    await dee.leave(); await until(() => !people(host).includes('Dee'), 8000); await host.act({ type: 'arena', action: { type: 'restart-round' } }); await sleep(500);
    check(`${id}: Dee leaves → the next round 5 vs 5`, (() => { const c = counts(host); return c.t === 5 && c.ct === 5; })(), JSON.stringify(counts(host))); }
  for (const p of [host, bo, cy]) await p.leave();
} catch (e) { check('no crash', false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
console.log((fail ? 'FAIL' : 'PASS') + ': LAN Defuse through the room · joins (20 rejoins, 5 at once), the match, every map, joins mid-round, 5 vs 5 · ' + pass + '/' + (pass + fail)); server.kill(); process.exit(fail ? 1 : 0);
