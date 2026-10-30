// Global Defensive host tick (GD-NET-08): the host's 50 ms tick never waits on work that can be done before play.
//  · the bots' site routes are planned when a match starts — and the next map (geometry, collision boxes, routes) is built
//    during the last match's scoreboard, not in the host's request that schedules it mid-match (that held the room's one
//    thread for seconds) — never in the first live tick of round 1 or in the tick that switches maps;
//  · at most one bot plans a fresh route per tick (a retake: every CT heading for the bomb at once froze everyone);
//  · with the user's CS2 map files (this computer only, git-ignored — skipped without them): tick times measured.
//   node tests/gd-host-tick.mjs
import assert from 'node:assert/strict'; import { existsSync, readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; import { loadavg, cpus } from 'node:os';
import { ARENA_MAPS, useMapFile } from '../dist/arena-maps.js';
import { startArena, arenaTick, arenaApply } from '../dist/arena-logic.js';
import { DEFUSE } from '../dist/arena-defuse.js'; import { ARENA } from '../dist/facility-layout.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const key = s => String(s).trim().toLowerCase();

// ── The user's CS2 map files (this computer only; first, in a fresh process): measured tick times ──
const REPO = fileURLToPath(new URL('..', import.meta.url)), file = id => REPO + 'user-maps/' + id + '.bsp', files = existsSync(file('dust2')) && existsSync(file('mirage'));
// (the slowest of the first 10 live ticks — routes used to be planned in the first one after the freeze)
const liveTicks = (g, t) => { let max = 0, live = 0; for (let i = 0; i < 400 && live < 10; i++) { const a = performance.now(); arenaTick(g, [], .05, t += 50); const ms = performance.now() - a; if (g.combat.d.round.phase === 'live') { live++; max = Math.max(max, ms); } } return [max, t]; };
if (!files) console.log('  (no user-maps/dust2.bsp + mirage.bsp here: the CS2 map timing part is skipped)');
else { for (const id of ['dust2', 'mirage']) useMapFile(id, readFileSync(file(id)));
  let t = 3e12, a = performance.now(); const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 10, freezeS: 1 }, t); const startMs = performance.now() - a;
  let first; [first, t] = liveTicks(g, t); let max = 0, over50 = 0;
  for (let i = 0; i < 1200; i++) { a = performance.now(); arenaTick(g, [], .05, t += 50); const ms = performance.now() - a; max = Math.max(max, ms); if (ms > 50) over50++; }
  const built = id => !Object.getOwnPropertyDescriptor(ARENA_MAPS, id).get;
  a = performance.now(); arenaApply(g, { type: 'next-map', map: 'mirage' }, 'Host', [], t); const schedMs = performance.now() - a, schedBuilt = built('mirage');
  g.combat.d.matchOver = { at: t, winner: 't' }; let warmMs = 0, switchMs = 0, routesBefore = false;
  while (g.arena.map === 'dust2') { a = performance.now(); arenaTick(g, [], .05, t += 50); const ms = performance.now() - a; if (g.arena.map === 'dust2') { warmMs = Math.max(warmMs, ms); routesBefore = built('mirage') && !!ARENA_MAPS.mirage._routes; } else switchMs = ms; }
  let firstM; [firstM, t] = liveTicks(g, t);
  console.log(`  CS2 Dust II, 10 bots: match start ${startMs.toFixed(0)} ms (the host waits) · first live ticks ≤ ${first.toFixed(1)} ms · 1200 ticks: max ${max.toFixed(0)} ms, ${over50} over 50 ms · next map (Mirage) scheduled ${schedMs.toFixed(0)} ms · built during the scoreboard ${warmMs.toFixed(0)} ms · switch tick ${switchMs.toFixed(0)} ms · its first live ticks ≤ ${firstM.toFixed(1)} ms`);
  ok('CS2 Mirage scheduled mid-match: not built by that request', !schedBuilt);
  ok('…built during the scoreboard (routes planned before the switch); the next match is on it', !!routesBefore && g.arena.map === 'mirage');
  // Wall-clock limits only on a machine that isn't swamped (several test suites or agents at once made them flaky): the
  // checks above say where the work happens either way.
  const busy = loadavg()[0] > cpus().length; if (busy) console.log(`  (load ${loadavg()[0].toFixed(1)} on ${cpus().length} cores: the tick-time limits are skipped)`);
  else { ok('CS2 Dust II: round 1’s first live ticks don’t plan the bots’ routes (each < 100 ms; the first was ≈ 330 ms)', first < 100, first.toFixed(1));
    ok('the next map (CS2 Mirage): scheduling it, the switch and its first live ticks stay short (< 100 ms each)', schedMs < 100 && switchMs < 100 && firstM < 100, JSON.stringify([schedMs.toFixed(0), switchMs.toFixed(0), firstM.toFixed(1)])); } }

// ── Built-in maps (CI): routes planned before play; one re-plan per tick ──
{ let t = 2e12; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 10, freezeS: 1 }, t);
  ok('a Defuse match on Dust II: the bots’ site routes are planned when it starts (not in round 1’s first live tick)', !!ARENA_MAPS.dust2._routes);
  const built = id => !Object.getOwnPropertyDescriptor(ARENA_MAPS, id).get;   // (a CS map is built on first use: arena-maps.js)
  const said = arenaApply(g, { type: 'next-map', map: 'inferno' }, 'Host', [], t);   // (Inferno: a map no other part of this file builds)
  ok('the host schedules Inferno next mid-match: answered without building it (that held every tick, pose and hit for seconds)', !built('inferno') && /Inferno/.test(said), said);
  // Everyone on one side (no fights), live; then every bot finds itself past its route's end, far from it: each wants a
  // fresh route this very tick.
  const d = g.combat.d; for (const b of g.arena.bots) d.teams[key(b.name)] = 't';
  for (let i = 0; i < 30; i++) arenaTick(g, [], .05, t += 50);
  ok('the round is live', d.round.phase === 'live', d.round.phase);
  const M = ARENA_MAPS.dust2, real = M.nav.route; let calls = 0; M.nav.route = function (...a) { calls++; return real.apply(this, a); };
  // (each bot's route "ends" at the other side's spawn — world coordinates, as bot.path keeps them — and it stands past it)
  const cx = ARENA.cx, cz = ARENA.cz, [ctx, ctz] = M.ct[0], [tx, tz] = M.t[0];
  for (const b of g.arena.bots) { const toCt = Math.hypot(b.x - cx - tx, b.z - cz - tz) < Math.hypot(b.x - cx - ctx, b.z - cz - ctz); b.path = [[b.x, b.z], toCt ? [cx + ctx, cz + ctz] : [cx + tx, cz + tz]]; b.pi = 2; b.replanAt = 0; b.target = null; }
  const perTick = []; for (let i = 0; i < 14; i++) { calls = 0; arenaTick(g, [], .05, t += 50); perTick.push(calls); }
  M.nav.route = real;
  ok('ten bots due a fresh route at once: one route planned per tick, the rest on the following ticks', Math.max(...perTick) === 1 && perTick.reduce((s, c) => s + c, 0) >= 8, JSON.stringify(perTick));
  // The match ends: Inferno (geometry, boxes, the bots' routes) is built during the scoreboard, after the end went out —
  // so the tick that switches to it only looks it up.
  d.matchOver = { at: t, winner: 't' }; arenaTick(g, [], .05, t += 50); ok('the match ends: the next map is not built in the tick that ends it', !built('inferno'));
  for (let i = 0; i < 24; i++) arenaTick(g, [], .05, t += 50);
  ok('…but a second into the scoreboard: Inferno built, its routes planned', built('inferno') && !!ARENA_MAPS.inferno._routes && g.arena.map === 'dust2');
  while (g.arena.map === 'dust2' && t < 3e12) arenaTick(g, [], .05, t += 50); ok('…and the next match starts on it after the scoreboard', g.arena.map === 'inferno' && !!g.combat.d); }
console.log('PASS: host tick · ' + n + ' checks (routes planned before play and for the next map, one route re-plan per tick' + (files ? ', CS2 map tick times' : '') + ')');
