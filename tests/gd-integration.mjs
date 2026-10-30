// Global Defensive v51 integration of the wave-1 packages (the hand-offs between them): an incendiary's damage counts as
// utility damage in the match stats like a molotov's; bots judge smoke by the players' rule (head, chest and legs — a
// player whose legs show under a cloud on higher ground is seen, one wholly behind a cloud is not); the CS2 agents pose
// every grenade kind (incendiary, decoy) as a grenade, not a rifle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startArena, arenaTick } from '../dist/arena-logic.js';
import { hurt } from '../dist/combat-logic.js';
import { ARENA_MAPS } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { smokeBlocks, smokeHides } from '../dist/arena-nades.js';
import { weaponById, NADE_ORDER, EYE } from '../dist/weapons-data.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + d : '')); };
let seed = 7; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const live = (bots = 0) => { const g = { levels: {} }; let t = 2e10; startArena(g, { map: 'dust2', kind: 'defuse', bots }, t);
  const P = [{ id: 'p', name: 'Ann', pose: { x: ARENA.cx, y: EYE, z: ARENA.cz, yaw: 0 } }, { id: 'q', name: 'Bo', pose: { x: ARENA.cx + 5, y: EYE, z: ARENA.cz, yaw: 0 } }];
  for (let i = 0; i < 600 && g.combat.d.round.phase !== 'live'; i++) arenaTick(g, P, .05, t += 50); return { g, P, t }; };

// ── Utility damage: HE, molotov and incendiary all count (combat-logic hurt; v50 left the incendiary out) ──
{ const { g, t } = live(); const d = g.combat.d; d.teams.ann = 't'; d.teams.bo = 'ct';
  for (const id of ['he', 'molotov', 'incendiary']) { const before = g.combat.stats?.ann?.util || 0; hurt(g, 'Ann', 'Bo', weaponById(id), 8, 'chest', t);
    ok(`${id} damage counts as utility damage`, (g.combat.stats.ann.util - before) === 8, JSON.stringify(g.combat.stats.ann)); }
  const hits = g.combat.stats.ann.hits; hurt(g, 'Ann', 'Bo', weaponById('incendiary'), 5, 'chest', t); ok('…and never as a gun hit', g.combat.stats.ann.hits === hits); }

// ── Bots see through smoke by the players' rule (arena-logic sees → smokeHides) ──
{ const { g, P } = live(1); let t = g.combat.clock || 2e10; const b = g.arena.bots[0], M = ARENA_MAPS.dust2, nav = M.nav, cx = ARENA.cx, cz = ARENA.cz;
  g.combat.d.teams[b.name.toLowerCase()] = 't'; g.combat.d.teams.ann = 'ct'; P.length = 1;
  ok('dust2 has its nav (bots use the map\'s sight lines)', !!nav);
  let found = null;   // a clear sight line 30 units long on one floor, and a cloud on it raised so the eye line crosses it but the legs pass under
  for (let a = 0; a < 6.28 && !found; a += .2) { const px = b.x + Math.sin(a) * 30, pz = b.z + Math.cos(a) * 30, fy = nav.floorAt(px - cx, pz - cz), by = b.y;
    if (!Number.isFinite(fy) || Math.abs(fy - by) > 1 || !nav.sight(b.x - cx, by + EYE, b.z - cz, px - cx, fy + EYE, pz - cz)) continue;
    for (let dy = 0; dy < 15 && !found; dy += .25) { g.combat.nades = [{ id: 'sm', kind: 'smoke', phase: 'smoke', x: (b.x + px) / 2, y: by + dy, z: (b.z + pz) / 2, firedAt: t - 5000, at: t - 7000 }];
      if (smokeBlocks(g, b.x, by + EYE, b.z, px, fy + EYE, pz, t) && !smokeHides(g, b.x, by + EYE, b.z, px, fy, pz, false, t)) found = { px, pz, fy, y: by + dy }; } }
  ok('a raised cloud blocks the eye line but not the legs (setup)', !!found);
  const look = y => { g.combat.nades = [{ id: 'sm', kind: 'smoke', phase: 'smoke', x: (b.x + found.px) / 2, y, z: (b.z + found.pz) / 2, firedAt: t - 5000, at: t - 7000 }];
    P[0].pose = { x: found.px, y: found.fy + EYE, z: found.pz, yaw: 0 }; b.target = null; arenaTick(g, P, .05, t += 50); return b.target; };
  const bx = b.x, bz = b.z;
  ok('legs showing under the cloud: the bot sees the player (as a player would; v50 used the one eye line)', look(found.y) === 'Ann');
  b.x = bx; b.z = bz; ok('wholly behind a cloud on the floor: the bot does not', look(b.y) === null); }

// ── CS2 agents: every grenade kind is held as a grenade (cs2-agents.js lists; a kind missing there posed a rifle) ──
{ const src = readFileSync(new URL('../dist/cs2-agents.js', import.meta.url), 'utf8'), m = src.match(/const NADE_IDS = new Set\(\[([^\]]*)\]\)/), ids = m ? m[1].match(/'[^']+'/g).map(s => s.slice(1, -1)) : [];
  for (const k of NADE_ORDER) ok(`a remote player holding a ${k} is posed with a grenade`, ids.includes(k), ids.join(','));
  const kind = src.match(/\[([^\]]*)\]\.includes\(id\) \? 'item'/); for (const k of NADE_ORDER) ok(`…and its third-person item is a grenade (${k})`, !!kind && kind[1].includes(`'${k}'`)); }
// ── Bot routes inside the host's 50 ms tick (cs-mapbuild.js pathBetween): the same walks as ever, at half the cost or better ──
// (v50: 11–57 ms a route on the built-in maps — up to 0.8 s on a CS2 map file — each one stalling every player's tick.)
{ const os = await import('node:os'), { createHash } = await import('node:crypto'), nav = ARENA_MAPS.dust2.nav, [W, D] = ARENA_MAPS.dust2.size; void ARENA_MAPS.dust2.routes;
  let s2 = 11; const rnd = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647, pts = []; while (pts.length < 40) { const x = (rnd() - .5) * W * .9, z = (rnd() - .5) * D * .9, y = nav.floorAt(x, z); if (Number.isFinite(y)) pts.push([x, z, y]); }
  const times = [], h = createHash('sha1'); for (let i = 0; i < 30; i++) { const a = pts[i], b = pts[(i * 7 + 3) % 40], av = i % 5 === 0 ? [[pts[(i + 1) % 40][0], pts[(i + 1) % 40][1]]] : null; let best = Infinity, r; for (let k = 0; k < 3; k++) { const t0 = performance.now(); r = nav.route(a[0], a[1], a[2], b[0], b[1], av); best = Math.min(best, performance.now() - t0); } h.update(JSON.stringify(r)); times.push(best); }   // (each route's best of 3: another process taking the core mid-route is not the route's cost)
  ok('Dust II: 30 bot routes are the same walks, point for point, as before the speed-up', h.digest('hex').slice(0, 12) === '46700cadfa8f');
  times.sort((a, b) => a - b); const med = times[15], busy = os.loadavg()[0] > os.cpus().length;
  // Judged against a fixed piece of work timed in the same process (best of 5), so a slower or busier machine moves both: on this Mac
  // the median route ran 0.20–0.33 of it, v50's 0.44–0.62 (both measured side by side, scratchpad routerel.mjs).
  let ref = Infinity; for (let k = 0; k < 5; k++) { const t0 = performance.now(), a = new Float64Array(1 << 16); let s = 1; for (let i = 0; i < 4e6; i++) { const j = (i * 2654435761) & 0xffff; a[j] += s; s = (s * 1.0000001) % 7 + Math.sqrt(a[(j + 1) & 0xffff]); } ref = Math.min(ref, performance.now() - t0); if (s === 42) console.log(''); }
  if (busy) console.log(`  (route time not judged: load ${os.loadavg()[0].toFixed(1)} > ${os.cpus().length} cores · median ${med.toFixed(1)} ms, ${(med / ref).toFixed(2)} of the reference work)`);
  else ok(`…and a route's median cost is low enough for the host's tick (${med.toFixed(1)} ms = ${(med / ref).toFixed(2)} of the reference work < 0.4; v50 0.44–0.62)`, med / ref < .4, (med / ref).toFixed(2)); }
// ── The host's movement check (arena-move.js poseGate) and a new spawn order crossing a pose on the network ──
{ const { poseGate } = await import('../dist/arena-move.js'); const g = {}; let now = 5e6, ct = 1000;
  ok('a first pose is taken', poseGate(g, 0, 0, ct, now));
  const spawn = { x: 300, z: -200, at: now + 10 }; now += 33; ct += 33;
  ok('the host orders a spawn; a pose from the old spot, sent before the order arrived, is still taken', poseGate(g, .1, 0, ct, now, spawn));
  now += 33; ct += 33; ok('…and the jump to the spawn then passes at once (v50: refused — the order was used up by that pose — so the host kept the body at the old spot for seconds)', poseGate(g, 300, -200, ct, now, spawn) && g.x === 300);
  now += 33; ct += 33; ok('…once there, the same order lets no other jump through', !poseGate(g, -300, 200, ct, now, spawn) && g.x === 300); }
// ── How far behind a remote body is drawn (multiplayer.js remoteClock → jit → delay 100–400 ms) ──
// A player holding an angle sends a pose only every 2 s (unchanged ones are skipped): that gap is not network jitter. v50 counted
// it, so anyone standing still was drawn 400 ms late — and still was when they peeked. Nor is a human's mouse left still for a
// moment, or aim nudged every second or so (the first v51 fix still counted those: humans sat at the 400 ms cap). A real network
// stall (samples captured on time, delivered late) still counts. Each sample: its capture time on the sender's clock (ct), its arrival (T).
{ const { remoteClock } = await import('../dist/multiplayer.js'); let T = 1e6, ct = 5e7; const realNow = performance.now.bind(performance); performance.now = () => T;
  let skew = 5e7 - 1e6; const LAT = 40, send = (m, dt, still = false, late = 0) => { ct += dt; T = ct - skew + LAT + late; remoteClock(m, ct, still); };
  const delay = m => Math.max(100, Math.min(400, 50 + m.jit));   // createMultiplayer serverNow's target delay
  try { const still = {}; send(still, 0); for (let i = 0; i < 5; i++) send(still, 2000, true);
    ok('a player standing still (a keep-alive pose every 2 s): no jitter counted', still.jit === 0, still.jit);
    for (let i = 0; i < 20; i++) send(still, 33);
    ok('…and when they start moving, the 2 s before their first move is not jitter either', still.jit < 60, still.jit);
    const flick = {}; for (let r = 0; r < 8; r++) { send(flick, r ? 1500 : 0); for (let i = 0; i < 4; i++) send(flick, 33); }   // holding an angle, nudging the aim every 1.5 s
    ok('a player holding an angle who nudges the aim every 1.5 s is drawn at the floor delay (old: jit 1500 → 400 ms)', delay(flick) === 100, flick.jit);
    const go = {}; for (let i = 0; i < 60; i++) send(go, 33); send(go, 600); let worst = 0; for (let i = 0; i < 300; i++) { send(go, 33); worst = Math.max(worst, delay(go)); }
    ok('a mouse left still 0.6 s, then moving again: never drawn more than ~100 ms behind (old: 400 ms for ~11 s)', worst <= 110, worst);
    const run = {}; for (let i = 0; i < 40; i++) send(run, 33, false, i >= 20 && i < 29 ? (29 - i) * 33 : 0);   // 9 updates (300 ms) held by Wi-Fi, then delivered at once
    ok('a moving player whose updates stall 300 ms on the network: that lateness counts (drawn further behind to cover it)', run.jit >= 290 && run.jit <= 340, run.jit);
    { const sparse = {}; send(sparse, 0); send(sparse, 33);   // a player nudging the aim now and then, on the same stream
      ok('…and covers a player with few updates on the same stream too (the stall is the stream\'s, not one body\'s)', sparse.jit >= 290, sparse.jit); }
    for (let i = 0; i < 150; i++) send(run, 33);   // 5 s of steady updates
    ok('…and is remembered for a while after the 3 s window (the next stall must not find the buffer run dry)', run.jit >= 290, run.jit);
    for (let i = 0; i < 250; i++) send(run, 33);   // 13 s on (3 s in the window + 8 s held, then gone)
    ok('…then forgotten: steady updates bring the delay back down', run.jit < 60, run.jit);
    const hitch = {}; for (let i = 0; i < 60; i++) send(hitch, 33, false, i >= 20 && i < 56 ? (56 - i) * 33 : 0);   // one 1.2 s hitch (a page busy at the join)
    ok('a one-off 1.2 s hitch counts while in the 3 s window', hitch.jit >= 1000, hitch.jit);
    for (let i = 0; i < 120; i++) send(hitch, 33);   // 4 s on
    ok('…but is not held after it (no delay can cover it; held, it drew everyone at the 400 ms cap for 11 s)', hitch.jit < 60, hitch.jit);
    ct += 3.6e6; skew += 3.6e6; send(run, 33); for (let i = 0; i < 3; i++) send(run, 33);
    ok('a new sender clock (a reconnect): a new window, not an hour of jitter', run.jit < 60, run.jit); }
  finally { performance.now = realNow; } }
console.log(`PASS gd-integration · ${n} checks (utility damage incl. incendiary, bots' smoke rule = players', CS2 agents' grenade kinds, bot routes same + cheap)`);
