// A 5 vs 5 LAN match of Defuse (host rules: ten people, no bots), on Dust II built in and (when on this computer) its
// CS2 file: teams split 5 / 5; every round everyone gets a spawn spot of their own on their own side ($800, the buy
// zone, one Terrorist with the bomb); a round won by elimination, one by a defuse, one by the bomb going off; after 12
// the sides swap (money reset, scores follow the teams); the first team to 13 ends the match.
//   node tests/gd-5v5.mjs
import { readFileSync, existsSync } from 'node:fs';
import { startArena, arenaApply, arenaTick, botRoster } from '../dist/arena-logic.js';
import { DEFUSE, teamOf } from '../dist/arena-defuse.js';
import { applyHit, isDown } from '../dist/combat-logic.js';
import { ARENA_MAPS, spawnSlots, useMapFile } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { weaponById } from '../dist/weapons-data.js';
let seed = 5; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const HU = 2.54 / 16.5, BODY = 32 * HU;
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; if (!ok || process.env.VERBOSE) console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' · ' + info : '')); };
function match(label) {
  const M = ARENA_MAPS.dust2; let t = 9e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t); const d = g.combat.d;
  const players = Array.from({ length: 10 }, (_, i) => ({ name: 'P' + (i + 1), pose: { x: ARENA.cx + M.t[0][0], y: 9.7, z: ARENA.cz + M.t[0][1], yaw: 0 } })), k = p => p.name.toLowerCase();
  const tick = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, [...players, ...botRoster(g)], .05, t); } };   // (as the room passes its roster: people and the bots)
  const side = s => players.filter(p => teamOf(g, p.name) === s);
  // Everyone goes where the host sends them (as each client does), eye height over the spot's floor.
  const follow = () => { for (const p of players) { const s = g.combat.spawnTo?.[k(p)]; if (s) p.pose = { x: s.x, y: (s.y ?? 0) + 9.7, z: s.z, yaw: 0 }; } };
  const spots = () => players.map(p => { const s = g.combat.spawnTo?.[k(p)]; return s ? [s.x - ARENA.cx, s.z - ARENA.cz, s.y, teamOf(g, p.name)] : null; });
  const roundSpawns = n => { const S = spots(), mine = side => new Set(spawnSlots(M, side).map(([x, z]) => x.toFixed(2) + ',' + z.toFixed(2))); const T = mine('t'), C = mine('ct'); let close = 0, wrongSide = 0;
    for (let i = 0; i < S.length; i++) { if (!S[i]) continue; if (!(S[i][3] === 't' ? T : C).has(S[i][0].toFixed(2) + ',' + S[i][1].toFixed(2))) wrongSide++;
      for (let j = 0; j < i; j++) if (S[j] && !(Number.isFinite(S[i][2]) && Number.isFinite(S[j][2]) && Math.abs(S[i][2] - S[j][2]) > 6) && Math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1]) < BODY) close++; }
    check(`${label} round ${n}: all ten spawn on spots of their own, on their own side`, S.every(Boolean) && !close && !wrongSide, `${S.filter(Boolean).length} placed · ${close} overlapping · ${wrongSide} off their side`); };
  const killAll = (by, who) => { const gun = weaponById('ak'); for (const v of who) if (!isDown(g, v.name, t)) applyHit(g, by.name, v.name, gun, 'head', 5, 1, t); };
  tick(100);
  check(`${label}: ten people split 5 / 5`, side('t').length === 5 && side('ct').length === 5, `T ${side('t').length} · CT ${side('ct').length}`);
  if (g.arena.lobby && !g.arena.lobby.started) arenaApply(g, { type: 'start-match' }, 'P1', players, t); tick(100);
  check(`${label}: the match starts in the freeze`, d.round.phase === 'freeze', d.round.phase);
  roundSpawns(1); follow();
  check(`${label}: $800 each, a Terrorist carries the bomb`, players.every(p => d.money[k(p)] === DEFUSE.start) && side('t').some(p => k(p) === d.bomb.carrier), JSON.stringify(d.money) + ' · ' + d.bomb.carrier);
  check(`${label}: everyone can buy in their spawn`, players.every(p => /Desert Eagle/.test(String((() => { try { return arenaApply(g, { type: 'loadout', secondary: 'deagle' }, p.name, players, t); } catch (e) { return e.message; } })()))));
  // Round 1: the CTs wipe the Terrorists.
  tick(DEFUSE.freezeMs + 100); check(`${label} round 1: live after the freeze`, d.round.phase === 'live', d.round.phase);
  killAll(side('ct')[0], side('t')); tick(100);
  check(`${label} round 1: elimination → CT win`, d.round.phase === 'over' && d.round.winner === 'ct' && d.round.reason === 'elim' && d.score.ct === 1, JSON.stringify([d.round.phase, d.round.winner, d.round.reason, d.score]));
  // Round 2: the bomb planted on A, defused.
  tick(DEFUSE.overMs + 100); check(`${label} round 2: everyone back up in the freeze`, d.round.phase === 'freeze' && d.n === 2 && players.every(p => !isDown(g, p.name, t)), d.round.phase + ' ' + d.n);
  roundSpawns(2); follow(); tick(DEFUSE.freezeMs + 100);
  const planter = players.find(p => k(p) === d.bomb.carrier), site = M.siteGoals?.A || M.sites.A; planter.pose = { x: ARENA.cx + site[0], y: 9.7 + (M.nav ? M.nav.floorAt(site[0], site[1]) || 0 : 0), z: ARENA.cz + site[1], yaw: 0 };   // (on the site's floor, as tests/arena-defuse.mjs stands there)
  const onA = { ...planter.pose }; arenaApply(g, { type: 'plant', hold: true }, planter.name, players, t); tick(DEFUSE.plantMs + 200);
  check(`${label} round 2: the bomb planted on A`, d.round.phase === 'planted' && d.round.planted?.site === 'A', d.round.phase);
  const ct = side('ct')[0]; ct.pose = { ...planter.pose, x: planter.pose.x + 2 }; arenaApply(g, { type: 'defuse', hold: true }, ct.name, players, t); tick(DEFUSE.defuseMs + 300);
  check(`${label} round 2: defused → CT win`, d.round.winner === 'ct' && d.round.reason === 'defuse' && d.score.ct === 2, JSON.stringify([d.round.winner, d.round.reason, d.score]));
  // Round 3: planted again, left to go off.
  tick(DEFUSE.overMs + 100); roundSpawns(3); follow(); tick(DEFUSE.freezeMs + 100);
  const p3 = players.find(p => k(p) === d.bomb.carrier); p3.pose = { ...onA }; arenaApply(g, { type: 'plant', hold: true }, p3.name, players, t); tick(DEFUSE.plantMs + 200);
  for (const p of side('ct')) p.pose = { x: ARENA.cx + M.ct[0][0], y: 9.7, z: ARENA.cz + M.ct[0][1], yaw: 0 };   // (the CTs far away, at their spawn)
  tick(DEFUSE.bombMs + 300);
  check(`${label} round 3: the bomb goes off → T win`, d.round.winner === 't' && d.round.reason === 'bomb' && d.score.t === 1, JSON.stringify([d.round.winner, d.round.reason, d.score]));
  // Rounds 4–12 (CTs win each); then halftime.
  const before = Object.fromEntries(players.map(p => [k(p), teamOf(g, p.name)]));
  for (let r = 4; r <= 12; r++) { tick(DEFUSE.overMs + 100); follow(); tick(DEFUSE.freezeMs + 100); killAll(side('ct')[0], side('t')); tick(100); }
  tick(DEFUSE.overMs + 100);
  check(`${label}: after 12 rounds the sides swap, money resets, scores follow the teams`, players.every(p => teamOf(g, p.name) !== before[k(p)]) && players.every(p => d.money[k(p)] === DEFUSE.start) && d.n === 13, JSON.stringify({ n: d.n, score: d.score }));
  roundSpawns(13);
  // To 13: the team that was CT (now T) wins the next round by elimination.
  for (let r = 13; r <= 14 && !d.matchOver; r++) { follow(); tick(DEFUSE.freezeMs + 100); killAll(side('t')[0], side('ct')); tick(200); if (!d.matchOver) tick(DEFUSE.overMs + 100); }
  check(`${label}: the first team to 13 ends the match`, !!d.matchOver, JSON.stringify({ score: d.score, over: d.matchOver }));
}
match('Dust II');
// A LAN room as it really fills (the room hands the rules its roster: the people present and the bots): the host, then 7
// bots the host adds, then two people one after the other → 5 vs 5.
{ let t = 9e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t); const M = ARENA_MAPS.dust2, d = g.combat.d, at = () => ({ x: ARENA.cx + M.t[0][0], y: 9.7, z: ARENA.cz + M.t[0][1], yaw: 0 });
  const pl = [{ name: 'Host', pose: at() }], tk = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, [...pl, ...botRoster(g)], .05, t); } };
  tk(200); arenaApply(g, { type: 'add-bot', count: 7 }, 'Host', [...pl, ...botRoster(g)], t); tk(200); pl.push({ name: 'Bo', pose: at() }); tk(300); pl.push({ name: 'Cy', pose: at() }); tk(300);
  const c = { t: 0, ct: 0 }; for (const k of [...pl.map(p => p.name.toLowerCase()), ...g.arena.bots.map(b => b.name.toLowerCase())]) c[d.teams[k]]++;
  check('a room filling up (host, 7 bots, then two people one by one) makes 5 vs 5', c.t === 5 && c.ct === 5, JSON.stringify(c)); }
// People leave mid-match: at the next round start bots move over so the sides stay even (CS2's auto-balance; people never move).
{ let t = 9e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 7 }, t); const M = ARENA_MAPS.dust2, d = g.combat.d;
  let pl = Array.from({ length: 3 }, (_, i) => ({ name: 'H' + (i + 1), pose: { x: ARENA.cx + M.t[0][0], y: 9.7, z: ARENA.cz + M.t[0][1], yaw: 0 } })); const tk = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, [...pl, ...botRoster(g)], .05, t); } };
  tk(200); if (g.arena.lobby && !g.arena.lobby.started) arenaApply(g, { type: 'start-match' }, 'H1', pl, t); tk(200);
  const cnt = () => { const c = { t: 0, ct: 0 }; for (const k of [...pl.map(p => p.name.toLowerCase()), ...g.arena.bots.map(b => b.name.toLowerCase())]) if (d.teams[k] === 't' || d.teams[k] === 'ct') c[d.teams[k]]++; return c; };
  const c0 = cnt(), sideOf = k => d.teams[k], two = ['t', 'ct'].find(sd => pl.filter(p => sideOf(p.name.toLowerCase()) === sd).length >= 2), gone = pl.filter(p => sideOf(p.name.toLowerCase()) === two).slice(0, 2).map(p => p.name), stay = pl.find(p => !gone.includes(p.name)), keep = sideOf(stay.name.toLowerCase());   // (two people from one side leave: 3 vs 5)
  pl = pl.filter(p => !gone.includes(p.name)); tk(DEFUSE.freezeMs + DEFUSE.roundMs + DEFUSE.overMs + 400); const c1 = cnt();
  check('people leave → the next round the sides are even again (bots move over), and nobody left is moved', Math.abs(c1.t - c1.ct) <= 1 && c1.t + c1.ct === 8 && sideOf(stay.name.toLowerCase()) === keep, JSON.stringify({ before: c0, after: c1 })); }
// A LAN room is often a few people and bots: 3 people + 7 bots, and 4 + 6, still make 5 vs 5, each on a spot of their own.
for (const [people, bots] of [[3, 7], [4, 6], [1, 9]]) { let t = 9e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots }, t); const M = ARENA_MAPS.dust2;
  const pl = Array.from({ length: people }, (_, i) => ({ name: 'H' + (i + 1), pose: { x: ARENA.cx + M.t[0][0], y: 9.7, z: ARENA.cz + M.t[0][1], yaw: 0 } })); for (let i = 0; i < 4; i++) { t += 50; arenaTick(g, [...pl, ...botRoster(g)], .05, t); }
  const teams = Object.values(g.combat.d.teams), nT = teams.filter(x => x === 't').length, nC = teams.filter(x => x === 'ct').length;
  check(`${people} people + ${bots} bots make 5 vs 5`, nT === 5 && nC === 5, `T ${nT} · CT ${nC}`); }
if (existsSync('user-maps/dust2.bsp')) { useMapFile('dust2', readFileSync('user-maps/dust2.bsp')); match('Dust II (CS2 file)'); }
// The host changes the map mid-match to every Defuse map (the CS2 files when on this computer): 5 vs 5 again on round 1,
// people on their sides, everyone on a spot of their own; then on each map someone joins mid-round — watching until the
// next round, then up with money on a spot of their own, buying in the spawn — and leaves: the sides even again.
for (const id of ['mirage', 'inferno', 'nuke', 'cache', 'anubis', 'ancient', 'overpass']) { const f = 'user-maps/' + id + '.bsp'; if (existsSync(f)) useMapFile(id, readFileSync(f)); }
{ let t = 9e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t); const at = M => ({ x: ARENA.cx + M.t[0][0], y: 9.7, z: ARENA.cz + M.t[0][1], yaw: 0 });
  let pl = ['Host', 'Bo', 'Cy'].map(n => ({ name: n, pose: at(ARENA_MAPS.dust2) })); const room = () => [...pl, ...botRoster(g)], tk = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, room(), .05, t); } };
  tk(200); arenaApply(g, { type: 'add-bot', count: 7 }, 'Host', room(), t); tk(400); if (g.arena.lobby && !g.arena.lobby.started) arenaApply(g, { type: 'start-match' }, 'Host', room(), t); tk(200);
  const present = () => { const d = g.combat.d, c = { t: 0, ct: 0 }; for (const k of [...pl.map(p => p.name.toLowerCase()), ...g.arena.bots.map(b => b.name.toLowerCase())]) if (d.teams[k] === 't' || d.teams[k] === 'ct') c[d.teams[k]]++; return c; };
  const follow = () => { for (const p of pl) { const sp = g.combat.spawnTo?.[p.name.toLowerCase()]; if (sp) p.pose = { x: sp.x, y: (sp.y ?? 0) + 9.7, z: sp.z, yaw: 0 }; } };
  const apart = () => { const S = [...pl.map(p => g.combat.spawnTo?.[p.name.toLowerCase()]).filter(Boolean).map(s => [s.x, s.z, s.y]), ...g.arena.bots.map(b => [b.x, b.z, b.y])]; let close = 0; for (let i = 0; i < S.length; i++) for (let j = 0; j < i; j++) if (!(Number.isFinite(S[i][2]) && Number.isFinite(S[j][2]) && Math.abs(S[i][2] - S[j][2]) > 6) && Math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1]) < BODY) close++; return { placed: S.length, close }; };
  const sides0 = Object.fromEntries(pl.map(p => [p.name, g.combat.d.teams[p.name.toLowerCase()]]));
  for (const id of ['dust2', 'mirage', 'inferno', 'nuke', 'cache', 'anubis', 'ancient', ...(existsSync('user-maps/overpass.bsp') ? ['overpass'] : [])]) {   // (Overpass is file-only: without its file it is a stand-in)
    const r = arenaApply(g, { type: 'change-map', map: id }, 'Host', room(), t); tk(200); const d = g.combat.d, c = present(), sp = apart();
    check(`map change to ${id}: 5 vs 5 on round 1, people on their sides, everyone on a spot of their own`, /Map/.test(String(r)) && g.arena.map === id && d.n === 1 && c.t === 5 && c.ct === 5 && pl.every(p => d.teams[p.name.toLowerCase()] === sides0[p.name]) && sp.close === 0 && sp.placed === 10, JSON.stringify({ r, n: d.n, ...c, ...sp }));
    follow(); tk(DEFUSE.freezeMs + 9000);   // live, past the join grace
    const dee = { name: 'Dee', pose: at(ARENA_MAPS[id]) }; pl.push(dee); tk(200); const c2 = present(), watching = g.combat.down?.dee?.weapon === 'joined mid-round';
    check(`${id}: Dee joins mid-round on an even team, watching until the next round`, Math.abs(c2.t - c2.ct) <= 1 && watching, JSON.stringify({ ...c2, watching }));
    arenaApply(g, { type: 'restart-round' }, 'Host', room(), t); tk(200); follow(); const up = !g.combat.down?.dee, money = d.money.dee, sp2 = apart();
    let buy; try { buy = arenaApply(g, { type: 'loadout', secondary: 'deagle' }, 'Dee', room(), t); } catch (e) { buy = e.message; }
    check(`${id}: next round Dee is up with money on a spot of their own and buys in the spawn`, up && money >= 800 && sp2.close === 0 && /Desert Eagle/.test(String(buy)), JSON.stringify({ up, money, ...sp2, buy }));
    pl = pl.filter(p => p !== dee); arenaApply(g, { type: 'restart-round' }, 'Host', room(), t); tk(200); const c3 = present();
    check(`${id}: Dee leaves, the next round is 5 vs 5 again`, c3.t === 5 && c3.ct === 5, JSON.stringify(c3)); }
}
console.log((fail ? 'FAIL' : 'PASS') + ': 5 vs 5 · teams (people and bots), spawns, buying, elimination, defuse, bomb, halftime, first to 13 · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
