// Global Defensive match flow (host): unique spawn spots (12 players, both modes), the lobby (2-minute join window,
// no fighting, host can start early, extends when there aren't enough players), team changes (lobby: at once; match:
// next round; balance; spectator), host-only settings and map changes, plant / defuse in one attempt with a stale host
// position, one outcome per round, the arena mode never falling back from Defuse to Deathmatch.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, LOBBY_MS } from '../dist/arena-logic.js';
import { DEFUSE, teamOf } from '../dist/arena-defuse.js';
import { combatApply, isDown, applyHit, takeShots, hurt, SPAWN_SAFE_MS } from '../dist/combat-logic.js';
import { buildReport } from '../dist/gd-report.js';
import { ARENA_MAPS, mapBoxes, walkable } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { weaponById, defaultPistol } from '../dist/weapons-data.js';
import { arenaArsenalOf, armorOf } from '../dist/combat-logic.js';
import { epochError, shiftClock, rematch } from '../dist/arena-logic.js';
import { newRound } from '../dist/arena-defuse.js';
let seed = 5; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const throws = (f, re, name) => { n++; assert.throws(f, re, name); };
const spread = pts => { let m = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)); return m; };

// ── Spawns: 10 people + 2 bots in Defuse, everyone on their own spot, all walkable ──
{ let t = 1e10; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 2 }, t); const M = ARENA_MAPS.dust2, boxes = mapBoxes(M, ARENA.cx, ARENA.cz), bounds = { minX: ARENA.cx - M.size[0] / 2, maxX: ARENA.cx + M.size[0] / 2, minZ: ARENA.cz - M.size[1] / 2, maxZ: ARENA.cz + M.size[1] / 2 };
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
{ let t = 3e10; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t); const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: ARENA.cz + z, yaw: 0 });
  const P = [{ id: 'a', name: 'Ann', pose: at(M.t[0]) }, { id: 'c', name: 'Cy', pose: at(M.ct[0]) }, { id: 'e', name: 'Eve', pose: at(M.ct[1]) }];
  const tick = ms => { for (let i = 0; i < ms / 50; i++) arenaTick(g, P, .05, t += 50); }; tick(100); const d = g.combat.d; d.teams.eve = 'ct';
  d.bomb.carrier = 'ann'; tick(DEFUSE.freezeMs + 100); ok('live', d.round.phase === 'live');
  // The host still has Ann 3 units back (she was sliding to a stop); she reports where she really stands, on the site.
  const [sx, sz] = M.siteGoals?.A || M.sites.A; P[0].pose = at([sx, sz]);
  arenaApply(g, { type: 'plant', hold: true, x: ARENA.cx + sx, y: P[0].pose.y, z: ARENA.cz + sz }, 'Ann', P, t); P[0].pose.x = ARENA.cx + sx;   // the next pose catches up
  tick(DEFUSE.plantMs + 100); ok('one held click plants (no second try)', d.round.phase === 'planted', d.round.phase);
  // Cy defuses; Eve can't at the same time; walking away cancels; then one full defuse ends the round once.
  P[1].pose = { x: d.round.planted.x + 2, y: (d.round.planted.y || 0) + 9.7, z: d.round.planted.z, yaw: 0 }; P[2].pose = { x: d.round.planted.x - 2, y: (d.round.planted.y || 0) + 9.7, z: d.round.planted.z, yaw: 0 };
  arenaApply(g, { type: 'defuse', hold: true, x: P[1].pose.x, z: P[1].pose.z }, 'Cy', P, t); throws(() => arenaApply(g, { type: 'defuse', hold: true, x: P[2].pose.x, z: P[2].pose.z }, 'Eve', P, t), /already defusing/, 'one defuser at a time');
  tick(1000); P[1].pose.x += 6; tick(100); ok('walking away cancels the defuse', !d.round.defuse); P[1].pose.x -= 6;
  arenaApply(g, { type: 'defuse', hold: true, x: P[1].pose.x, z: P[1].pose.z }, 'Cy', P, t); tick(DEFUSE.defuseMs + 100);
  ok('one held E defuses: CT win once', d.round.winner === 'ct' && d.round.reason === 'defuse' && d.score.ct === 1 && d.score.t === 0, JSON.stringify(d.score));
  tick(200); ok('the round counts once', d.score.ct === 1); }

// ── Lobby: two minutes, no fighting, host starts early, waits when there aren't enough players ──
{ let t = 4e10; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, lobbyMs: LOBBY_MS }, t); const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: ARENA.cz + z, yaw: 0 });
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
{ let t = 6e10; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 2 }, t);
  throws(() => arenaApply(g, { type: 'settings', bots: 6 }, 'Guest', [], t, { isHost: false }), /Only the host/, 'guests cannot change bots');
  arenaApply(g, { type: 'settings', bots: 6, difficulty: 'hard' }, 'Host', [], t); ok('host: 6 hard bots', g.arena.bots.length === 6 && g.arena.difficulty === 'hard');
  arenaApply(g, { type: 'settings', bots: 1 }, 'Host', [], t); ok('host: down to 1 bot (removed from teams)', g.arena.bots.length === 1 && Object.keys(g.combat.d.teams).length === 1);
  throws(() => arenaApply(g, { type: 'change-map', map: 'atlantis' }, 'Host', [], t), /not available/, 'unknown map: a clear error');
  throws(() => arenaApply(g, { type: 'change-map', map: 'mirage' }, 'Guest', [], t, { isHost: false }), /Only the host/, 'guests cannot change the map');
  arenaApply(g, { type: 'change-map', map: 'mirage' }, 'Host', [], t + 10); ok('change map: Plaza, still Defuse, a new match', g.arena.map === 'mirage' && g.arena.kind === 'defuse' && g.combat.d.n === 1 && g.arena.bots.length === 1);
  const P = [{ id: 'x', name: 'X', pose: { x: 0, y: 9.7, z: -400 } }]; arenaTick(g, P, .05, t + 100); const s = g.combat.spawnTo.x, m = ARENA_MAPS.mirage;
  ok('spawns come from the new map', s && [...m.t, ...m.ct].some(([x, z]) => Math.hypot(ARENA.cx + x - s.x, ARENA.cz + z - s.z) < 14), JSON.stringify(s));
  arenaApply(g, { type: 'change-map', map: 'town' }, 'Host', [], t + 200); ok('change map to a deathmatch map switches the mode', g.arena.kind === 'dm' && !g.combat.d); }

// ── The mode never falls back: Defuse on a Defuse map, an error for a mismatch ──
{ const g = { levels: {} }; throws(() => startArena(g, { map: 'yard', kind: 'defuse' }), /not a Defuse map/, 'Defuse on a deathmatch map is an error, not deathmatch');
  for (let i = 0; i < 5; i++) { const h = { levels: {} }; startArena(h, { map: 'yard', kind: 'dm', bots: 2 }); startArena(h, { map: ['dust2', 'mirage', 'cache'][i % 3], kind: 'defuse', bots: 3 }); ok('after a deathmatch, Defuse starts as Defuse (' + h.arena.map + ')', h.arena.kind === 'defuse' && !!h.combat.d?.round); } }
// ── Host timers and administration (host only; live changes wait for the next round; pause stops every clock) ──
{ const g = { levels: {} }; let t = 3e11; const P = [{ name: 'Host', pose: { x: ARENA.cx, y: 9.7, z: ARENA.cz } }, { name: 'Gus', pose: { x: ARENA.cx + 5, y: 9.7, z: ARENA.cz } }]; const H = { isHost: true }, G = { isHost: false };
  startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, lobbyMs: 30000, freezeS: 5 }, t); for (let i = 0; i < 3; i++) arenaTick(g, P, .05, t += 50);
  ok('host timers: freeze 5 s and warmup 30 s confirmed in the state', g.arena.freezeMs === 5000 && g.arena.warmupS === 30, JSON.stringify([g.arena.freezeMs, g.arena.warmupS]));
  assert.throws(() => arenaApply(g, { type: 'pause', on: true }, 'Gus', P, t, G), /Only the host/); assert.throws(() => arenaApply(g, { type: 'settings', freeze: 1 }, 'Gus', P, t, G), /Only the host/); n += 2;
  arenaApply(g, { type: 'settings', warmup: 0 }, 'Host', P, t, H); ok('warmup set to 0 in the lobby: the match starts on the next tick', g.arena.lobby.until <= t); for (let i = 0; i < 3; i++) arenaTick(g, P, .05, t += 50);
  const r1 = g.combat.d.round; ok('round 1 freeze is the host’s 5 s', r1.phase === 'freeze' && Math.abs(r1.freezeUntil - r1.at - 5000) < 5, JSON.stringify({ phase: r1.phase, f: r1.freezeUntil - r1.at }));
  arenaApply(g, { type: 'settings', freeze: 0 }, 'Host', P, t, H); ok('a freeze change during the match waits for the next round (this countdown untouched)', g.combat.d.round.freezeUntil === r1.freezeUntil && g.arena.freezeNext === 0);
  arenaApply(g, { type: 'pause', on: true }, 'Host', P, t, H); const before = g.combat.d.round.freezeUntil; for (let i = 0; i < 40; i++) arenaTick(g, P, .05, t += 250);
  ok('paused: the round clock stands still (still in freeze after 10 s)', g.combat.d.round.phase === 'freeze');
  arenaApply(g, { type: 'pause', on: false }, 'Host', P, t, H); ok('resumed: the countdown continues where it stopped', g.combat.d.round.freezeUntil === before + 10000, g.combat.d.round.freezeUntil - before);
  const n0 = g.combat.d.n; arenaApply(g, { type: 'restart-round' }, 'Host', P, t, H); ok('restart round: same round number, new freeze (0 s from the next round on: live at once)', g.combat.d.n === n0 && g.combat.d.round.phase === 'live');
  arenaApply(g, { type: 'move-spec', name: 'Gus' }, 'Host', P, t, H); ok('host moves a player to spectator', g.combat.d.teams.gus === 'spec');
  arenaApply(g, { type: 'next-map', map: 'ancient' }, 'Host', P, t, H); g.combat.d.matchOver = { at: t - 20000, winner: 't' }; arenaTick(g, P, .05, t += 50);
  ok('the next match starts on the scheduled map, sides kept', g.arena.map === 'ancient' && g.combat.d.teams.host !== undefined, g.arena.map); }

// ── Match statistics (post-match report) from the host's own events ──
{ const g = { levels: {} }; let t = 4e11; const P = [{ name: 'Ann', pose: { x: ARENA.cx, y: 9.7, z: ARENA.cz } }, { name: 'Bo', pose: { x: ARENA.cx + 5, y: 9.7, z: ARENA.cz } }, { name: 'Cy', pose: { x: ARENA.cx + 9, y: 9.7, z: ARENA.cz } }];
  startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, lobbyMs: 5000 }, t); for (let i = 0; i < 3; i++) arenaTick(g, P, .05, t += 50); g.combat.d.teams = { ann: 't', bo: 'ct', cy: 't' };
  g.arena.loadout.ann = { primary: 'ak', secondary: 'pistol', nades: [] }; takeShots(g, 'Ann', 100, 'ak'); takeShots(g, 'Ann', 103, 'ak');
  ok('warmup / lobby: nothing recorded', !(g.combat.stats?.ann?.shots));
  g.arena.lobby.until = t; for (let i = 0; i < 3; i++) arenaTick(g, P, .05, t += 50); const d = g.combat.d; d.teams = { ann: 't', bo: 'ct', cy: 't' }; d.round.phase = 'live'; g.combat.stats = {};
  g.combat.ammo = { ann: { ak: [30, 90] } }; takeShots(g, 'Ann', 110, 'ak'); takeShots(g, 'Ann', 115, 'ak');
  applyHit(g, 'Ann', 'Bo', weaponById('ak'), 'chest', 10, 1, t); hurt(g, 'Ann', 'Bo', weaponById('ak'), 500, 'head', t, true);   // 36ish, then a head shot that kills (capped at the HP left)
  hurt(g, 'Cy', 'Ann', weaponById('ak'), 20, 'chest', t);   // team damage: not in the report
  const st = g.combat.stats.ann; ok('shots counted once each (12 fired after the match went live)', st.shots === 12, st.shots); ok('hits, head-shot kill', st.hits === 2 && st.hsKills === 1 && st.hsHits === 1, JSON.stringify(st));
  ok('damage capped at the HP the victim had (100 in all)', st.dmg === 100, st.dmg); ok('team damage not counted', !g.combat.stats.cy?.dmg);
  d.round.phase = 'over'; d.history = [{ n: 1, winner: 't', reason: 'elimination', at: t, score: { t: 1, ct: 0 } }, { n: 2, winner: 't', reason: 'bomb', at: t, score: { t: 2, ct: 0 } }]; g.combat.stats.ann.plants = 1; d.score = { t: 13, ct: 0 }; d.matchOver = { at: t, winner: 't' };
  const R = buildReport(g), A = R.players.find(p => p.k === 'ann');
  ok('report: result, rounds, ADR (dmg / rounds), accuracy, HS%, plants', R.winner === 't' && R.rounds.length === 2 && A.adr === 50 && A.acc === 17 && A.hs === 100 && A.plants === 1 && A.kills === 1, JSON.stringify(A));
  ok('report: MVP is a real player', R.players.some(p => p.k === R.mvp)); }

// ── Deathmatch spawn protection: no damage for 2 s after a (re)spawn, unless you fire first ──
{ let t = 5e10; const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0 }, t); const P = [{ id: 'a', name: 'Ann', pose: { x: 0, y: 9.7, z: -800 } }, { id: 'b', name: 'Bo', pose: { x: 5, y: 9.7, z: -800 } }];
  arenaTick(g, P, .05, t += 50); const ak = weaponById('ak');
  ok('deathmatch: a player who just spawned takes no damage', applyHit(g, 'Bo', 'Ann', ak, 'chest', 10, 1, t + 500).dmg === 0);
  ok('…and is hurt again after 2 s', applyHit(g, 'Bo', 'Ann', ak, 'chest', 10, 1, t + SPAWN_SAFE_MS + 10).dmg > 0);
  hurt(g, 'Bo', 'Ann', ak, 500, 'head', t + 3000, true); ok('Ann down', isDown(g, 'Ann', t + 3001));
  t += 3000 + 3000; const { combatTick } = await import('../dist/combat-logic.js'); combatTick(g, t); arenaTick(g, P, .05, t += 50);   // the tick respawns her
  ok('respawned', !isDown(g, 'Ann', t)); ok('protected after the respawn', applyHit(g, 'Bo', 'Ann', ak, 'chest', 10, 1, t + 100).dmg === 0);
  g.combat.ammo = { ann: { ak: [30, 90] } }; takeShots(g, 'Ann', 1, 'ak'); ok('firing ends the protection at once', applyHit(g, 'Bo', 'Ann', ak, 'chest', 10, 1, t + 200).dmg > 0);
  const gd = { levels: {} }; startArena(gd, { map: 'dust2', kind: 'defuse', bots: 0 }, t); ok('Defuse has no spawn protection (no respawns)', !gd.combat.safe); }

// ── Match lifecycle: a new match starts clean — three rematches in a row, after guns, armor, a kit and grenades bought and
// thrown, with someone dead and someone spectating, bots holding rifles; knives and host settings stay ──
{ let t = 7e11; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 4, difficulty: 'hard', freezeS: 5, rules: { win: 5, start: 1000 } }, t);
  const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + M.nav.floorAt(x, z), z: ARENA.cz + z, yaw: 0 });
  const P = [{ id: 'a', name: 'Ann', pose: at(M.t[0]) }, { id: 'c', name: 'Cy', pose: at(M.ct[0]) }, { id: 's', name: 'Sam', pose: at(M.ct[1]) }];
  const tick = ms => { for (let i = 0; i < ms / 50; i++) arenaTick(g, P, .05, t += 50); }, follow = () => { for (const p of P) { const s = g.combat.spawnTo[p.name.toLowerCase()]; if (s) { p.pose.x = s.x; p.pose.z = s.z; if (s.y !== undefined) p.pose.y = s.y + 9.7; } } };
  tick(100); const side = k => g.combat.d.teams[k];
  ok('a fresh Defuse match: bots hold their side’s pistol, not a deathmatch rifle', g.arena.bots.every(b => b.weapon === defaultPistol(side(b.name.toLowerCase()))), JSON.stringify(g.arena.bots.map(b => b.weapon)));
  g.combat.d.teams.ann = 't'; g.combat.d.teams.cy = 'ct'; g.combat.d.teams.sam = 'ct'; arenaApply(g, { type: 'restart-round' }, 'Host', P, t); follow(); tick(100);
  arenaApply(g, { type: 'knife', knife: 'butterfly' }, 'Ann', P, t); arenaApply(g, { type: 'move-spec', name: 'Sam' }, 'Host', P, t);
  for (let k = 1; k <= 3; k++) { const d = g.combat.d, m0 = g.arena.match, s0 = g.arena.startedAt; d.money.ann = 16000; d.money.cy = 16000;
    for (const a of [{ type: 'buy', primary: 'ak' }, { type: 'buy-armor', kind: 'helmet' }, { type: 'buy-nade', kind: 'he' }, { type: 'buy-nade', kind: 'flash' }, { type: 'buy-nade', kind: 'smoke' }]) arenaApply(g, a, 'Ann', P, t);
    arenaApply(g, { type: 'buy-kit' }, 'Cy', P, t); arenaApply(g, { type: 'buy', primary: 'm4' }, 'Cy', P, t);
    tick(5100); ok(`match ${k}: live`, d.round.phase === 'live', d.round.phase);
    arenaApply(g, { type: 'throw', kind: 'he', x: P[0].pose.x, y: P[0].pose.y, z: P[0].pose.z, dx: 0, dy: .2, dz: -1 }, 'Ann', P, t);   // utility used
    hurt(g, 'Ann', 'Cy', weaponById('ak'), 40, 'chest', t); hurt(g, 'BOT Bat', 'Cy', weaponById('ak'), 500, 'head', t); g.arena.bots[0].weapon = 'ak'; g.arena.bots[1].weapon = 'sniper'; tick(100);
    ok(`match ${k}: before the end — Ann armed with rifle, armor and grenades; Cy dead (his rifle on the ground), assist and damage tallied`, arenaArsenalOf(g, 'Ann').includes('ak') && armorOf(g, 'Ann').helmet && isDown(g, 'Cy', t) && (g.combat.ground || []).length > 0 && (g.combat.nades || []).length > 0, JSON.stringify({ own: arenaArsenalOf(g, 'Ann'), ground: g.combat.ground?.length, nades: g.combat.nades?.length }));
    d.matchOver = { at: t, winner: 't' }; tick(DEFUSE.matchOverMs + 100); follow(); const D = g.combat.d, C = g.combat;
    ok(`rematch ${k}: a new match (new id, new start), round 1 in its freeze`, g.arena.match !== m0 && g.arena.startedAt !== s0 && D.match === g.arena.match && D !== d && D.n === 1 && D.round.phase === 'freeze', JSON.stringify([D.n, D.round.phase]));
    ok(`rematch ${k}: no gun, grenade or armor kept — the side pistol and the knife only`, arenaArsenalOf(g, 'Ann').every(x => ['pistol', 'knife', 'c4'].includes(x)) && armorOf(g, 'Ann').kevlar === 0 && !armorOf(g, 'Ann').helmet && !(g.arena.loadout.ann?.nades || []).length && arenaArsenalOf(g, 'Cy').every(x => ['usps', 'knife'].includes(x)), JSON.stringify([arenaArsenalOf(g, 'Ann'), arenaArsenalOf(g, 'Cy'), armorOf(g, 'Ann')]));
    ok(`rematch ${k}: kits, kills, deaths, assists, damage, report and history gone; nothing on the ground or in the air`, !Object.keys(D.kits).length && !Object.keys(C.kills).length && !Object.keys(C.deaths).length && !Object.keys(C.assists || {}).length && !Object.keys(C.dmg || {}).length && !Object.keys(C.stats || {}).length && !D.history.length && !C.ground.length && !C.nades.length && !Object.keys(C.ammo || {}).some(k2 => Object.keys(C.ammo[k2]).some(w => w === 'ak' || w === 'm4')), JSON.stringify({ kits: D.kits, kills: C.kills, ground: C.ground.length, nades: C.nades.length, ammo: C.ammo }));
    ok(`rematch ${k}: the economy from the rules ($1,000 each), the dead alive with full HP, the spectator still watching`, D.money.ann === 1000 && D.money.cy === 1000 && !isDown(g, 'Cy', t) && side('sam') === 'spec' && isDown(g, 'Sam', t), JSON.stringify([D.money, side('sam')]));
    ok(`rematch ${k}: bots back to their side’s pistol, no target, no route`, g.arena.bots.every(b => b.weapon === defaultPistol(side(b.name.toLowerCase())) && !b.target && !b.path), JSON.stringify(g.arena.bots.map(b => [b.weapon, side(b.name.toLowerCase())])));
    ok(`rematch ${k}: host settings (bots, difficulty, freeze, rules) and Ann’s knife stay; people keep their side; spawn orders on their side`, g.arena.bots.length === 4 && g.arena.difficulty === 'hard' && g.arena.freezeMs === 5000 && D.rules.win === 5 && D.rules.start === 1000 && g.arena.knives.ann === 'butterfly' && side('ann') === 't' && side('cy') === 'ct' && C.spawnTo.ann?.at === g.arena.startedAt && C.spawnTo.cy?.at === g.arena.startedAt, JSON.stringify({ knives: g.arena.knives, ann: side('ann'), sp: C.spawnTo.ann }));
    ok(`rematch ${k}: ground and grenade ids keep counting (no id names two things on a client)`, C.groundSeq > 0 && C.nadeSeq >= k, JSON.stringify([C.groundSeq, C.nadeSeq])); }
  // Round to round (not a new match): survivors keep their gear, the dead get the pistol; assist damage is per round.
  const d = g.combat.d; d.money.ann = 16000; arenaApply(g, { type: 'buy', primary: 'ak' }, 'Ann', P, t); tick(5100); hurt(g, 'Ann', 'Cy', weaponById('ak'), 30, 'chest', t);
  d.round.phase = 'over'; d.round.overAt = t - DEFUSE.overMs - 1; tick(50); follow();
  ok('next round: the survivor keeps the rifle (round-to-round retention), damage tallies start again', arenaArsenalOf(g, 'Ann').includes('ak') && !Object.keys(g.combat.dmg || {}).length, JSON.stringify([arenaArsenalOf(g, 'Ann'), g.combat.dmg]));
  tick(5100); hurt(g, 'Ann', 'Cy', weaponById('ak'), 15, 'chest', t); hurt(g, 'BOT Bat', 'Cy', weaponById('ak'), 500, 'head', t);
  ok('an assist needs 41 damage within one round (30 last round + 15 now is none)', !g.combat.assists?.ann, JSON.stringify(g.combat.assists)); }
// Deathmatch: the automatic rematch keeps the host's settings and starts everyone clean.
{ let t = 8e11; const g = { levels: {} }; startArena(g, { map: 'yard', bots: 3, difficulty: 'hard' }, t); const P = [{ id: 'a', name: 'Ann', pose: { x: 0, y: 9.7, z: -800 } }];
  arenaTick(g, P, .05, t += 50); g.arena.loadout.ann = { primary: 'ak', secondary: 'deagle', nades: [] }; g.combat.kills.ann = 7; const s0 = g.arena.startedAt;
  g.arena.endsAt = t; arenaTick(g, P, .05, t += 50); ok('deathmatch: the clock runs out → match over', !!g.arena.over);
  arenaTick(g, P, .05, t += 12001); ok('deathmatch rematch: new match, same bots and difficulty, loadouts and kills gone', g.arena.startedAt !== s0 && g.arena.bots.length === 3 && g.arena.difficulty === 'hard' && !g.arena.loadout.ann?.primary && !g.combat.kills.ann && !g.arena.over, JSON.stringify([g.arena.difficulty, g.arena.bots.length, g.arena.loadout.ann]));
  throws(() => arenaApply(g, { type: 'restart' }, 'Guest', P, t, { isHost: false }), /Only the host/, 'a guest cannot start a new match'); }
// The host's map change keeps its settings (freeze, rules, difficulty) and starts a clean match there.
{ let t = 9e11; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 2, difficulty: 'easy', freezeS: 7, rules: { win: 6 } }, t); g.arena.loadout.x = { primary: 'ak', secondary: 'pistol', nades: ['he'] };
  arenaApply(g, { type: 'change-map', map: 'mirage' }, 'Host', [], t + 10); ok('change map: the host’s freeze, rules and difficulty stay; gear does not', g.arena.map === 'mirage' && g.arena.freezeMs === 7000 && g.combat.d.rules.win === 6 && g.arena.difficulty === 'easy' && !g.arena.loadout.x, JSON.stringify([g.arena.freezeMs, g.combat.d.rules.win])); }
// Requests from an earlier round or match (epochError): refused; without ids (older clients): judged as before.
{ let t = 1e12; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t); const r0 = g.combat.d.round.id, m0 = g.arena.match;
  ok('ids of this round and match pass', epochError(g, { type: 'throw', round: r0, match: m0 }) === null && epochError(g, { type: 'throw' }) === null);
  arenaApply(g, { type: 'restart-round' }, 'Host', [], t);
  ok('a throw, drop, pickup, door or hit from the round before is refused', ['throw', 'drop', 'pickup', 'use', 'break', 'hit', 'buy'].every(type => /round has ended/.test(epochError(g, { type, round: r0 }) || '')));
  ok('host settings and team changes are never bound to a round', epochError(g, { type: 'settings', round: r0 }) === null && epochError(g, { type: 'team', round: r0 }) === null);
  rematch(g, [], t + 5); ok('anything from the match before is refused', /match has ended/.test(epochError(g, { type: 'buy', match: m0, round: g.combat.d.round.id }) || '')); }
// The host's computer slept: every match timer moves on by the gap (as a pause), the stamps clients act on do not.
{ let t = Date.now(); const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 2 }, t); const P = [{ id: 'a', name: 'Ann', pose: { x: ARENA.cx, y: 9.7, z: ARENA.cz } }]; arenaTick(g, P, .05, t + 50);
  const r = g.combat.d.round, f0 = r.freezeUntil, e0 = r.endsAt, s0 = g.arena.startedAt, sp0 = g.combat.spawnTo.ann?.at, gap = 600000;
  const n = shiftClock(g, gap, t + gap); ok('asleep 10 min: the round clock moves on by the gap (still the same freeze left), startedAt and spawn orders untouched', n > 0 && r.freezeUntil === f0 + gap && r.endsAt === e0 + gap && g.arena.startedAt === s0 && g.combat.spawnTo.ann?.at === sp0, JSON.stringify({ n, f: r.freezeUntil - f0 }));
  arenaTick(g, P, .05, t + gap + 100); ok('…so the round is still in its freeze on waking (no backlog of rounds)', g.combat.d.round === r && r.phase === 'freeze'); }
// Readiness: a player still loading the map (the room marks them `loading`) is not in the match; once loaded, in the freeze
// they get a spot of their own.
{ let t = 1.1e12; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 2 }, t); const M = ARENA_MAPS.dust2;
  const P = [{ id: 'a', name: 'Ann', pose: { x: ARENA.cx + M.t[0][0], y: 9.7, z: ARENA.cz + M.t[0][1] } }, { id: 'b', name: 'Bo', loading: true, pose: { x: ARENA.cx + 44, y: 9.7, z: ARENA.cz - 1006 } }];
  for (let i = 0; i < 4; i++) arenaTick(g, P, .05, t += 50);
  ok('loading: not in the round, no spawn order, not counted', !g.combat.d.round.here.bo && !g.combat.spawnTo.bo && !g.combat.d.teams.bo, JSON.stringify([g.combat.d.round.here, g.combat.spawnTo.bo]));
  g.combat.d.round.phase = 'live'; g.combat.d.round.freezeUntil = t; const bot = g.arena.bots.find(b => g.combat.d.teams[b.name.toLowerCase()] === 'ct') || g.arena.bots[0]; bot.x = P[1].pose.x + 3; bot.z = P[1].pose.z; bot.y = undefined;
  for (let i = 0; i < 40; i++) arenaTick(g, P, .05, t += 50); ok('loading: bots never shoot at the old-map spot', (g.combat.hp.bo ?? 100) === 100 && !isDown(g, 'Bo', t));
  g.combat.d.round.phase = 'freeze'; g.combat.d.round.freezeUntil = t + 10000; delete P[1].loading; arenaTick(g, P, .05, t += 50);
  ok('loaded in the freeze: a side, money and a spot of their own', !!g.combat.d.teams.bo && g.combat.d.money.bo >= 800 && Number.isFinite(g.combat.spawnTo.bo?.x), JSON.stringify(g.combat.spawnTo.bo)); }
// Round 1 on a new map waits for whoever still loads it (readyMap: the map the room says they have) — its freeze keeps 3 s
// left, 30 s from the match's start at most — so a slower computer never sits out round 1, and can still buy when it's in.
{ let t = 1.2e12; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 2, freezeS: 3 }, t); const M = ARENA_MAPS.dust2, r = () => g.combat.d.round;
  const P = [{ id: 'a', name: 'Ann', readyMap: 'dust2', pose: { x: ARENA.cx + M.t[0][0], y: 9.7, z: ARENA.cz + M.t[0][1] } }, { id: 'b', name: 'Bo', readyMap: 'nuke', pose: { x: ARENA.cx + 44, y: 9.7, z: ARENA.cz - 1006 } }];
  for (let i = 0; i < 100; i++) arenaTick(g, P, .05, t += 50);
  ok('5 s into a 3 s freeze with Bo still loading: round 1 is still in its freeze, ≥ 2.9 s left, buy time moved with it', r().phase === 'freeze' && r().freezeUntil - t >= 2900 && r().buyUntil - r().freezeUntil === DEFUSE.buyMs, JSON.stringify([r().phase, r().freezeUntil - t]));
  P[1].readyMap = 'dust2'; arenaTick(g, P, .05, t += 50);
  ok('…Bo has the map: in round 1 with a spot of their own, still time to buy', !!g.combat.spawnTo.bo && r().phase === 'freeze' && r().freezeUntil - t > 2500, JSON.stringify([g.combat.spawnTo.bo, r().freezeUntil - t]));
  for (let i = 0; i < 64; i++) arenaTick(g, P, .05, t += 50); ok('…and the round goes live once the freeze is over', r().phase === 'live', r().phase);
  const h = { levels: {} }; let u = 1.3e12; startArena(h, { map: 'dust2', kind: 'defuse', bots: 2, freezeS: 3 }, u); for (let i = 0; i < 700; i++) arenaTick(h, [P[0], { ...P[1], readyMap: 'nuke' }], .05, u += 50);
  ok('someone who never finishes loading holds round 1 for 30 s at most', h.combat.d.round.phase !== 'freeze', h.combat.d.round.phase); }
// Still loading the map (after a change of map; Deathmatch has no freeze): an HE at their last map's pose leaves them alone
// (grenades, fire, flashes and decoys reach only those in this map), while it hurts the same player once loaded.
for (const loading of [false, true]) { let t = 1.35e12; const g = { levels: {} }; startArena(g, { map: 'yard', kind: 'dm', bots: 0 }, t);
  const at = { x: ARENA.cx, y: 9.7, z: ARENA.cz, yaw: 0, active: true, crouched: false }, P = [{ id: 'a', name: 'Ann', readyMap: 'yard', pose: { ...at, t } }, { id: 'b', name: 'Bo', readyMap: loading ? 'dust2' : 'yard', pose: { ...at, x: at.x + 3, t } }];
  for (let i = 0; i < 80; i++) arenaTick(g, P, .05, t += 50); g.combat.safe = {};
  arenaApply(g, { type: 'buy-nade', kind: 'he' }, 'Ann', P, t); arenaApply(g, { type: 'throw', kind: 'he', x: at.x, y: at.y, z: at.z, strength: 'short', dx: 0, dy: -1, dz: 0, pitch: -1.5, yaw: 0 }, 'Ann', P, t);
  for (let i = 0; i < 80; i++) arenaTick(g, P, .05, t += 50); const hp = g.combat.hp.bo ?? 100;
  ok(loading ? 'still loading: an HE at their last pose does no damage' : 'loaded: the same HE hurts them', loading ? hp === 100 : hp < 100, 'HP ' + hp + ' · Ann ' + (g.combat.hp.ann ?? 100)); }
// Doors and glass across a rematch (map files have them; a synthetic copy of the built-in Dust II with one sliding door and
// one pane stands in, as CI has no map files): the next match starts with the door shut and the pane whole in the HOST's
// collision too (its bots' sight, grenades, smoke) — as every client draws it — not the last match's open door and hole.
{ const base = ARENA_MAPS.dust2, M = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base)); M.id = 'movetest'; M.name = 'Mover test';
  M.movers = [{ kind: 'break', glass: true, health: 1, box: [10, 10.2, -4, 4, 0, 12] }, { kind: 'door', health: 0, box: [20, 20.3, -3, 3, 0, 12], open: { open: [20, 20.3, 3, 9, 0, 12] } }];
  ARENA_MAPS.movetest = M; let t = 1.4e12; const g = { levels: {} }; startArena(g, { map: 'movetest', kind: 'defuse', bots: 0, freezeS: 0 }, t);
  const tick = (ms, k = 1) => { for (let i = 0; i < k; i++) arenaTick(g, [], .05, t += ms); }; tick(50, 5);
  const B = mapBoxes(M, ARENA.cx, ARENA.cz).movers, off = (id, role) => B.filter(b => b.mover === id && (!role || b.role === role)).map(b => b.off);
  ok('mover test map: one pane and one door, shut and whole at the start', B.length === 3 && off(0)[0] === false && off(1, 'shut')[0] === false && off(1, 'open')[0] === true, JSON.stringify(B.map(b => [b.mover, b.role, b.off])));
  arenaApply(g, { type: 'break', id: 0, dmg: 500 }, 'Ann', [], t); arenaApply(g, { type: 'use', id: 1 }, 'Ann', [], t); tick(50, 30);
  ok('…pane broken and door open in match 1 (host collision)', off(0)[0] === true && off(1, 'shut')[0] === true && off(1, 'open')[0] === false, JSON.stringify(B.map(b => [b.mover, b.role, b.off])));
  const m1 = g.arena.match; g.combat.d.matchOver = { at: t, winner: 't' }; tick(DEFUSE.matchOverMs + 100); tick(50, 10);
  ok('rematch on the same map: door shut and pane whole again in the host\'s collision', g.arena.match !== m1 && off(0)[0] === false && off(1, 'shut')[0] === false && off(1, 'open')[0] === true, JSON.stringify(B.map(b => [b.mover, b.role, b.off])));
  arenaApply(g, { type: 'break', id: 0, dmg: 500 }, 'Ann', [], t); tick(50, 2); rematch(g, [], t, 'dust2'); tick(50, 2); rematch(g, [], t, 'movetest'); tick(50, 2);
  ok('…and after leaving for another map and coming back (the boxes are cached per map)', off(0)[0] === false, JSON.stringify(B.map(b => [b.mover, b.role, b.off])));
  delete ARENA_MAPS.movetest; }

console.log('PASS: Global Defensive match flow · ' + n + ' checks (unique spawns for 12, one-attempt plant / defuse with stale positions, one outcome, lobby window + start rules, team changes + balance + spectator, host settings, map changes, no Defuse → Deathmatch fallback)');
