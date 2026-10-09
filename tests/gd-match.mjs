// Global Defensive match flow (host): unique spawn spots (12 players, both modes), the lobby (2-minute join window,
// no fighting, host can start early, extends when there aren't enough players), team changes (lobby: at once; match:
// next round; balance; spectator), host-only settings and map changes, plant / defuse in one attempt with a stale host
// position, one outcome per round, the arena mode never falling back from Defuse to Deathmatch.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, LOBBY_MS } from '../dist/arena-logic.js';
import { DEFUSE, teamOf } from '../dist/arena-defuse.js';
import { combatApply, isDown, applyHit } from '../dist/combat-logic.js';
import { ARENA_MAPS, mapBoxes, walkable } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { weaponById } from '../dist/weapons-data.js';
let seed = 5; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const throws = (f, re, name) => { n++; assert.throws(f, re, name); };
const spread = pts => { let m = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)); return m; };

// ── Spawns: 10 people + 2 bots in Defuse, everyone on their own spot, all walkable ──
{ let t = 1e10; const g = { levels: {} }; startArena(g, { map: 'dune', kind: 'defuse', bots: 2 }, t); const M = ARENA_MAPS.dune, boxes = mapBoxes(M, ARENA.cx, ARENA.cz), bounds = { minX: ARENA.cx - 150, maxX: ARENA.cx + 150, minZ: ARENA.cz - 150, maxZ: ARENA.cz + 150 };
  const P = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, pose: { x: ARENA.cx, y: 9.7, z: ARENA.cz } }));
  for (let i = 0; i < 4; i++) arenaTick(g, P, .05, t += 50);
  // Apply the spawn orders like clients do, then finish the round so a new one places everyone.
  const place = () => { for (const p of P) { const s = g.combat.spawnTo[p.name.toLowerCase()]; if (s) { p.pose.x = s.x; p.pose.z = s.z; } } };
  place(); const firstPts = [...P.map(p => p.pose), ...g.arena.bots.map(b => ({ x: b.x, z: b.z }))];
  ok('joiners during the freeze all stand apart', spread(firstPts) > 4.4, spread(firstPts).toFixed(2));
  const d = g.combat.d; d.round.phase = 'over'; d.round.overAt = t - DEFUSE.overMs - 1; arenaTick(g, P, .05, t += 50); place();
  const pts = [...P.map(p => p.pose), ...g.arena.bots.map(b => ({ x: b.x, z: b.z }))];
  ok('new round: 12 players on 12 different spots', spread(pts) > 4.4, spread(pts).toFixed(2)); ok('every spot is walkable', pts.every(p => walkable(boxes, bounds, p.x, p.z, 1.3)));
  ok('teams balanced 6 v 6', Object.values(d.teams).filter(x => x === 't').length === 6 && Object.values(d.teams).filter(x => x === 'ct').length === 6); }
{ let t = 2e10; const g = { levels: {} }; startArena(g, { map: 'yard', bots: 3 }, t); const P = Array.from({ length: 8 }, (_, i) => ({ id: 'q' + i, name: 'Q' + i, pose: { x: 0, y: 9.7, z: 0 } }));
  arenaTick(g, P, .05, t += 50); const pts = [...P.map(p => g.combat.spawnTo[p.name.toLowerCase()]), ...g.arena.bots.map(b => ({ x: b.x, z: b.z }))];
  ok('deathmatch: 8 players + 3 bots get spots of their own', pts.every(Boolean) && spread(pts) > 4.4, spread(pts.filter(Boolean)).toFixed(2)); }

// ── Plant / defuse: one attempt with a stale host position completes; moving away cancels; one outcome ──
{ let t = 3e10; const g = { levels: {} }; startArena(g, { map: 'dune', kind: 'defuse', bots: 0 }, t); const M = ARENA_MAPS.dune, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7, z: ARENA.cz + z, yaw: 0 });
  const P = [{ id: 'a', name: 'Ann', pose: at(M.t[0]) }, { id: 'c', name: 'Cy', pose: at(M.ct[0]) }, { id: 'e', name: 'Eve', pose: at(M.ct[1]) }];
  const tick = ms => { for (let i = 0; i < ms / 50; i++) arenaTick(g, P, .05, t += 50); }; tick(100); const d = g.combat.d; d.teams.eve = 'ct';
  d.bomb.carrier = 'ann'; tick(DEFUSE.freezeMs + 100); ok('live', d.round.phase === 'live');
  // The host still has Ann 3 units back (she was sliding to a stop); she reports where she really stands, on the site.
  const [sx, sz] = M.sites.A; P[0].pose = { x: ARENA.cx + sx - 3, y: 9.7, z: ARENA.cz + sz, yaw: 0 };
  arenaApply(g, { type: 'plant', hold: true, x: ARENA.cx + sx, y: 9.7, z: ARENA.cz + sz }, 'Ann', P, t); P[0].pose.x = ARENA.cx + sx;   // the next pose catches up
  tick(DEFUSE.plantMs + 100); ok('one held click plants (no second try)', d.round.phase === 'planted', d.round.phase);
  // Cy defuses; Eve can't at the same time; walking away cancels; then one full defuse ends the round once.
  P[1].pose = { x: d.round.planted.x + 2, y: 9.7, z: d.round.planted.z, yaw: 0 }; P[2].pose = { x: d.round.planted.x - 2, y: 9.7, z: d.round.planted.z, yaw: 0 };
  arenaApply(g, { type: 'defuse', hold: true, x: P[1].pose.x, z: P[1].pose.z }, 'Cy', P, t); throws(() => arenaApply(g, { type: 'defuse', hold: true, x: P[2].pose.x, z: P[2].pose.z }, 'Eve', P, t), /already defusing/, 'one defuser at a time');
  tick(1000); P[1].pose.x += 6; tick(100); ok('walking away cancels the defuse', !d.round.defuse); P[1].pose.x -= 6;
  arenaApply(g, { type: 'defuse', hold: true, x: P[1].pose.x, z: P[1].pose.z }, 'Cy', P, t); tick(DEFUSE.defuseMs + 100);
  ok('one held E defuses: CT win once', d.round.winner === 'ct' && d.round.reason === 'defuse' && d.score.ct === 1 && d.score.t === 0, JSON.stringify(d.score));
  tick(200); ok('the round counts once', d.score.ct === 1); }

// ── Lobby: two minutes, no fighting, host starts early, waits when there aren't enough players ──
{ let t = 4e10; const g = { levels: {} }; startArena(g, { map: 'dune', kind: 'defuse', bots: 0, lobbyMs: LOBBY_MS }, t); const M = ARENA_MAPS.dune, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7, z: ARENA.cz + z, yaw: 0 });
  ok('the lobby is a two-minute window', g.arena.lobby.until - t === 120000 && !g.arena.lobby.started);
  const P = [{ id: 'h', name: 'Host', pose: at(M.t[0]) }]; arenaTick(g, P, .05, t += 50);
  ok('Defuse lobby: warmup phase, Defuse rules ready', g.arena.kind === 'defuse' && g.combat.d?.round?.phase === 'warmup');
  throws(() => arenaApply(g, { type: 'start-match' }, 'Host', P, t), /at least 2/, 'not enough players to start');
  arenaTick(g, P, .05, t = g.arena.lobby.until + 10); ok('timeout with too few players: the lobby waits 30 s more and says why', !g.arena.lobby.started && /at least 2/.test(g.arena.lobby.note) && g.arena.lobby.until > t);
  P.push({ id: 'f', name: 'Friend', pose: at(M.ct[0]) }); arenaTick(g, P, .05, t += 50);
  ok('a friend joins the other team', teamOf(g, 'Friend') === 'ct');
  throws(() => combatApply(g, { type: 'hit', target: 'f', weapon: 'pistol', zone: 'chest', n: 1 }, 'Host', P, 'h', t), /Warmup/, 'no fighting in the lobby');
  throws(() => arenaApply(g, { type: 'team', team: 'ct' }, 'Host', P, t), /too many/, 'balance: 2 v 0 is refused');
  P.push({ id: 'th', name: 'Third', pose: at(M.t[1]) }); arenaTick(g, P, .05, t += 50); ok('a third player is balanced onto T', teamOf(g, 'Third') === 't');
  ok('M in the lobby: switch side at once', /now Counter-Terrorists/.test(arenaApply(g, { type: 'team', team: 'ct' }, 'Host', P, t)) && teamOf(g, 'Host') === 'ct');
  throws(() => arenaApply(g, { type: 'team', team: 'ct' }, 'Third', P, t), /too many/, 'balance: 3 v 0 is refused');
  arenaApply(g, { type: 'team', team: 't' }, 'Host', P, t);
  throws(() => arenaApply(g, { type: 'start-match' }, 'Friend', P, t, { isHost: false }), /Only the host/, 'guests cannot start the match');
  arenaApply(g, { type: 'start-match' }, 'Host', P, t, { isHost: true }); arenaTick(g, P, .05, t += 50);
  ok('the host starts early: round 1, freeze, sides kept', g.arena.lobby.started && g.combat.d.n === 1 && g.combat.d.round.phase === 'freeze' && teamOf(g, 'Host') === 't' && teamOf(g, 'Friend') === 'ct');
  ok('fresh economy', g.combat.d.money.host === 800 && g.combat.d.money.friend === 800);
  P.pop(); g.combat.d.teams.third = 'spec';   // (the third player leaves)
  arenaApply(g, { type: 'settings', bots: 2 }, 'Host', P, t); ok('two bots fill the sides', Object.values(g.combat.d.teams).filter(x => x === 't').length === Object.values(g.combat.d.teams).filter(x => x === 'ct').length);
  // Mid-match team change: next round; balance; spectator.
  const r = arenaApply(g, { type: 'team', team: 'ct' }, 'Host', P, t); ok('during a match: you change side next round', /next round/.test(r) && teamOf(g, 'Host') === 't', r);
  g.combat.d.round.phase = 'over'; g.combat.d.round.overAt = t - DEFUSE.overMs - 1; arenaTick(g, P, .05, t += 50);
  ok('…and at the next round you are on the new side (a bot gave way)', teamOf(g, 'Host') === 'ct' && Object.values(g.combat.d.teams).filter(x => x === 't').length >= 1);
  ok('spectator: watching, not spawned', /Spectator/.test(arenaApply(g, { type: 'team', team: 'spec' }, 'Friend', P, t)) || teamOf(g, 'Friend') !== 'spec');
  g.combat.d.round.phase = 'over'; g.combat.d.round.overAt = t - DEFUSE.overMs - 1; arenaTick(g, P, .05, t += 50); ok('the spectator stays out of the round', teamOf(g, 'Friend') === 'spec' && isDown(g, 'Friend', t)); }
{ let t = 5e10; const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0, lobbyMs: LOBBY_MS }, t); const P = [{ id: 'a', name: 'A', pose: { x: 0, y: 9.7, z: -400 } }, { id: 'b', name: 'B', pose: { x: 10, y: 9.7, z: -400 } }];
  arenaTick(g, P, .05, t = g.arena.lobby.until + 1); ok('deathmatch lobby: starts at the timeout with enough players', g.arena.lobby.started); }

// ── Host settings and map changes ──
{ let t = 6e10; const g = { levels: {} }; startArena(g, { map: 'dune', kind: 'defuse', bots: 2 }, t);
  throws(() => arenaApply(g, { type: 'settings', bots: 6 }, 'Guest', [], t, { isHost: false }), /Only the host/, 'guests cannot change bots');
  arenaApply(g, { type: 'settings', bots: 6, difficulty: 'hard' }, 'Host', [], t); ok('host: 6 hard bots', g.arena.bots.length === 6 && g.arena.difficulty === 'hard');
  arenaApply(g, { type: 'settings', bots: 1 }, 'Host', [], t); ok('host: down to 1 bot (removed from teams)', g.arena.bots.length === 1 && Object.keys(g.combat.d.teams).length === 1);
  throws(() => arenaApply(g, { type: 'change-map', map: 'atlantis' }, 'Host', [], t), /not available/, 'unknown map: a clear error');
  throws(() => arenaApply(g, { type: 'change-map', map: 'plaza' }, 'Guest', [], t, { isHost: false }), /Only the host/, 'guests cannot change the map');
  arenaApply(g, { type: 'change-map', map: 'plaza' }, 'Host', [], t + 10); ok('change map: Plaza, still Defuse, a new match', g.arena.map === 'plaza' && g.arena.kind === 'defuse' && g.combat.d.n === 1 && g.arena.bots.length === 1);
  const P = [{ id: 'x', name: 'X', pose: { x: 0, y: 9.7, z: -400 } }]; arenaTick(g, P, .05, t + 100); const s = g.combat.spawnTo.x, m = ARENA_MAPS.plaza;
  ok('spawns come from the new map', s && [...m.t, ...m.ct].some(([x, z]) => Math.hypot(ARENA.cx + x - s.x, ARENA.cz + z - s.z) < 14), JSON.stringify(s));
  arenaApply(g, { type: 'change-map', map: 'town' }, 'Host', [], t + 200); ok('change map to a deathmatch map switches the mode', g.arena.kind === 'dm' && !g.combat.d); }

// ── The mode never falls back: Defuse on a Defuse map, an error for a mismatch ──
{ const g = { levels: {} }; throws(() => startArena(g, { map: 'yard', kind: 'defuse' }), /not a Defuse map/, 'Defuse on a deathmatch map is an error, not deathmatch');
  for (let i = 0; i < 5; i++) { const h = { levels: {} }; startArena(h, { map: 'yard', kind: 'dm', bots: 2 }); startArena(h, { map: ['dune', 'plaza', 'hamlet'][i % 3], kind: 'defuse', bots: 3 }); ok('after a deathmatch, Defuse starts as Defuse (' + h.arena.map + ')', h.arena.kind === 'defuse' && !!h.combat.d?.round); } }
console.log('PASS: Global Defensive match flow · ' + n + ' checks (unique spawns for 12, one-attempt plant / defuse with stale positions, one outcome, lobby window + start rules, team changes + balance + spectator, host settings, map changes, no Defuse → Deathmatch fallback)');
