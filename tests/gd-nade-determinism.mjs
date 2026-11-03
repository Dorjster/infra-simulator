// Grenade flights are deterministic (v53, SPEC 1.2.1 / 1.4): the same throw lands in the same place, at the same moment,
// whatever the host's tick and the client's frame rate — CS2's fixed 64 Hz grenade tick, one stepper for all three:
//   · 200 random throws (spawn spots of the built-in maps, plus Mirage when it is converted on this computer: user-maps/
//     mirage.bsp; every kind, every strength, standing / walking / running / crouched / jump-throws / run-jumps, any aim,
//     any sub-tick fraction), each made into the client's throw message (arena-nades.js throwPacket);
//   · the preview (predictThrow / simThrow: the flight's own 1/64 s steps) is the reference;
//   · the host (the real throwNade + nadesTick) at tick lengths 15.6, 33, 50 and 100 ms with ±30 % jitter: it must go off
//     on the same step (fuse, rest — ≤ 1 tick; it is 0 here) and at the same place (≤ 0.5 units; it is exact);
//   · the client's copy of the host's flight (phys-smooth.js flightFrame on arena-nades.js flyNade, as arena-nades-view.js
//     runs it) fed by the host's words 20–50 ms late, at 30, 60, 144 and 240 fps (±10 % jitter): at every frame its state
//     at its step n is the reference's step n (≤ 0.5 units), it comes to rest on the same step (≤ 1 tick), and the drawn
//     grenade (drawFixed) never jumps;
//   · your own throw's copy (flown from the throw message before the host's word comes) takes the same steps too.
//   node tests/gd-nade-determinism.mjs [--throws N]
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { simThrow, predictThrow, throwNade, nadesTick, setSmokeSolids, setNadeProbe, flyNade, throwPacket, throwStart, launch, cs2Release, NADE_DT, NADE_MS, GRAVITY, NADES } from '../dist/arena-nades.js';
import { flightFrame, drawFixed } from '../dist/phys-smooth.js';
import { MOVE, HU } from '../dist/arena-move.js';
const argv = process.argv.slice(2), THROWS = +(argv[argv.indexOf('--throws') + 1] || 0) || 200;
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); };
let seed = 20261103; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const cx = ARENA.cx, cz = ARENA.cz, KINDS = ['smoke', 'smoke', 'flash', 'flash', 'he', 'decoy', 'molotov', 'incendiary'], STR = ['long', 'medium', 'short'];
const TYPES = ['stand', 'walk', 'run', 'crouch', 'jump', 'runjump'], TICKS = [15.6, 33, 50, 100], FPS = [30, 60, 144, 240];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / HU;   // (in CS2 units)

// The maps: two built in (boxes), and Mirage's own triangles when converted here.
const maps = [];
for (const id of ['dust2', 'yard']) { const M = ARENA_MAPS[id]; if (M && !M.fromFile) maps.push({ id, M, file: false }); }
if (existsSync('user-maps/mirage.bsp')) { const buf = readFileSync('user-maps/mirage.bsp'); if (buf.subarray(0, 4).toString() === 'CS2M') { useMapFile('mirage', buf); maps.push({ id: 'mirage', M: ARENA_MAPS.mirage, file: true }); } }
if (!maps.some(m => m.file)) console.log('  (Mirage is not converted on this computer: the built-in maps only)');
let worstHost = 0, worstHostT = 0, worstCli = 0, worstCliT = 0, worstMine = 0, worstJump = 0, cliFrames = 0, throws = 0; const byType = {};
for (const [mi, { id, M, file }] of maps.entries()) {
  const boxes = mapBoxes(M, cx, cz), [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 };
  setSmokeSolids(() => boxes);   // (the host's map: throwNade's own lookup, as arena-logic.js sets it)
  const spots = (M.t ? [...M.t, ...M.ct] : M.spawns).map(s => [cx + s[0], s[2] ?? (M.nav?.floorAt?.(s[0], s[1]) || M.floorAt?.(s[0], s[1]) || 0), cz + s[1]]);
  const share = Math.round(THROWS / maps.length), count = mi === maps.length - 1 ? THROWS - throws : share;
  for (let k = 0; k < count; k++, throws++) {
    const [x, y, z] = spots[(rnd() * spots.length) | 0], kind = KINDS[(rnd() * KINDS.length) | 0], strength = STR[(rnd() * 3) | 0], type = TYPES[k % TYPES.length];
    const sp = { stand: 0, walk: 130, run: 245, crouch: 80, jump: 0, runjump: 245 }[type] * HU * rnd(), dir = rnd() * Math.PI * 2;
    const rel = { x, y, z, duck: type === 'crouch' ? 1 : 0, vx: Math.sin(dir) * sp, vy: type === 'jump' || type === 'runjump' ? MOVE.jump : 0, vz: Math.cos(dir) * sp, jt: type === 'jump' || type === 'runjump',
      pitch: (rnd() * 150 - 70) * Math.PI / 180, yaw: rnd() * Math.PI * 2, strength, frac: rnd() };
    const a = JSON.parse(JSON.stringify(throwPacket(rel)));   // (as it reaches the host: JSON)
    byType[type] = (byType[type] || 0) + 1;
    // ── the reference: the preview's own steps ──
    const path = [], rest = { at: -1 }; const ref = simThrow(kind, a, boxes, bounds, 20000, g => { path.push([g.x, g.y, g.z]); if (rest.at < 0 && g.rest) rest.at = g.n; });
    const P = predictThrow(kind, a, boxes, bounds);
    if (ref.n * NADE_MS <= 4000) { const e = P.at(-1); ok(`${id} #${k}: the preview ends where the flight does, on its step`, P.steps === ref.n && dist(e, [ref.x, ref.y, ref.z]) < 1e-9, JSON.stringify([P.steps, ref.n])); }
    // ── the host: the real throwNade + nadesTick, at four tick lengths with jitter ──
    const words = {};
    for (const tick of TICKS) {
      const game = { mode: 'arena', arena: { map: id, bots: [], loadout: { ann: { nades: [kind], secondary: 'pistol' } } }, combat: { nades: [], hp: {}, down: {} } }, t0 = 1e9 + k * 1000;
      throwNade(game, 'Ann', kind, a, t0); const g = game.combat.nades[0], start = [g.x, g.y, g.z];
      ok(`${id} #${k}: the host starts it where the preview does`, dist(start, path[0]) === 0);
      let now = t0, last = [g.x, g.y, g.z], off = -1; const W = words[tick] = [];
      setNadeProbe(q => { if (q === g) { last[0] = q.x; last[1] = q.y; last[2] = q.z; } });
      while (now < t0 + 21000) { const dt = tick * (1 + (rnd() - .5) * .6); now += dt; nadesTick(game, [], dt / 1000, now, { boxes, bounds });
        if (g.phase === 'air') W.push({ at: now, x: g.x, y: g.y, z: g.z, vx: g.vx, vy: g.vy, vz: g.vz, still: g.still, rest: !!g.rest, grav: g.grav, bt: g.bt, n: g.n, acc: g.acc, phase: g.phase });
        else { off = g.n; W.push({ at: now, phase: g.phase }); break; } }
      setNadeProbe(null);
      const at = [last[0], last[1], last[2]], dErr = ref.off ? dist(at, [ref.x, ref.y, ref.z]) : 0, tErr = ref.off ? Math.abs(off - ref.n) : 0;
      worstHost = Math.max(worstHost, dErr); worstHostT = Math.max(worstHostT, tErr);
      if (ref.off) { ok(`${id} #${k} ${kind} ${type} ${strength}, host tick ${tick} ms: goes off where the preview does (≤ 0.5 units)`, dErr <= .5, dErr.toFixed(4));
        ok(`${id} #${k} ${kind}, host tick ${tick} ms: on the same step (≤ 1 tick) — its moment ${(off * NADE_MS).toFixed(3)} ms`, tErr <= 1 && Math.abs((g.firedAt ?? g.at + off * NADE_MS) - (t0 + off * NADE_MS)) < 1e-6 || g.phase === 'gone', JSON.stringify([off, ref.n, g.phase])); }
    }
    // ── the client's copy of the host's flight, at four frame rates (the host's words 20–50 ms late) ──
    for (const tick of TICKS) for (const fps of FPS) {
      const W = words[tick]; if (!W.length) continue; const v = { model: null, fx: null, ox: 0, oy: 0, oz: 0, fresh: false, slow: 0, exact: true }, flyStep = (S, d) => flyNade(S, boxes, bounds, d, null, S.p);
      const lat = W.map(() => 20 + rnd() * 30); let tc = W[0].at + lat[0], wi = -1, restAt = -1, moveN = -1, prevDraw = null, prevSpd = 0, jump = 0; const out = { x: 0, y: 0, z: 0 };
      for (let f = 0; f < 30 * fps; f++) {
        const dt = 1000 / fps * (.9 + .2 * rnd()); tc += dt; let j = wi; while (j + 1 < W.length && W[j + 1].at + lat[j + 1] <= tc) j++;
        if (j >= 0 && W[j].phase !== 'air') break;
        const isNew = j !== wi; wi = j; if (wi < 0) continue; const w = W[wi];
        flightFrame(v, w, isNew, isNew ? (tc - w.at) / 1000 : 0, dt / 1000, flyStep, false, .05, GRAVITY, NADE_DT); cliFrames++;
        const S = v.sim; if (S.n <= ref.n && S.n < path.length) { const e = dist([S.x, S.y, S.z], path[S.n]); worstCli = Math.max(worstCli, e); if (e > .5) ok(`${id} #${k} host ${tick} ms, ${fps} fps: the copy at step ${S.n} is the flight's`, false, e.toFixed(4)); }
        if (restAt < 0) { if (S.rest) restAt = S.n; else moveN = S.n; }   // (its rest step: after the last step seen moving, at or before the first seen resting)
        drawFixed(out, S, S.p, NADE_DT, GRAVITY); const dp = [out.x + v.ox, out.y + v.oy, out.z + v.oz];
        const spd = Math.hypot(S.vx, S.vy, S.vz) / HU;   // (HU/s: a bounce slows it — the faster of this frame's and the last's bounds the way drawn)
        if (prevDraw) { const jj = dist(dp, prevDraw) - (Math.max(spd, prevSpd) + 200) * dt / 1000; if (process.env.DBG && jj > 1) console.log('JUMP', f, jj.toFixed(2), 'n', S.n, 'rest', S.rest, 'isNew', isNew, 'acc', S.acc.toFixed(4), 'o', [v.ox, v.oy, v.oz].map(q => (q / HU).toFixed(1)).join(','), 'w.n', w.n); jump = Math.max(jump, jj); } prevDraw = dp; prevSpd = spd; }
      if (rest.at >= 0 && restAt >= 0) { const te = rest.at > restAt ? rest.at - restAt : rest.at <= moveN ? moveN + 1 - rest.at : 0; worstCliT = Math.max(worstCliT, te); ok(`${id} #${k} host ${tick} ms, ${fps} fps: the copy comes to rest on the flight's step (≤ 1 tick)`, te <= 1, JSON.stringify([moveN, restAt, rest.at])); }
      worstJump = Math.max(worstJump, jump); ok(`${id} #${k} host ${tick} ms, ${fps} fps: the drawn grenade never jumps (≤ 6 units a frame past its speed: a bounce step is drawn through its contact point, phys-smooth.js hermiteStep)`, jump < 6, jump.toFixed(3)); }
    // ── your own throw's copy (before the host's word): the same steps ──
    for (const fps of FPS) { const ar = cs2Release(a, undefined, boxes?.length ? boxes : null, bounds), s = throwStart(ar, boxes, bounds), L = launch(ar), S = { x: s.x, y: s.y, z: s.z, vx: L.vx, vy: L.vy, vz: L.vz, still: 0, rest: false, view: true, n: 0, acc: rnd() * .02, p: new Float64Array(6) };
      for (let t = 0; t < 1200 && S.n <= ref.n; t += 1000 / fps) { flyNade(S, boxes, bounds, 1 / fps * (.9 + .2 * rnd()), null, S.p); if (S.n <= ref.n && S.n < path.length) worstMine = Math.max(worstMine, dist([S.x, S.y, S.z], path[S.n])); } }
  }
}
ok(`${throws} throws`, throws === THROWS && Object.keys(byType).length === TYPES.length, JSON.stringify(byType));
ok('host: every landing within 0.5 units of the preview\'s, at every tick length', worstHost <= .5, worstHost);
ok('host: every grenade goes off on the preview\'s step (≤ 1 tick)', worstHostT <= 1, worstHostT);
ok('client copies: every frame on the flight\'s own steps (≤ 0.5 units)', worstCli <= .5, worstCli);
ok('client copies: at rest on the flight\'s step (≤ 1 tick)', worstCliT <= 1, worstCliT);
ok('your own throw\'s copy: on the flight\'s steps (≤ 0.5 units)', worstMine <= .5, worstMine);
console.log(`PASS: grenade determinism · ${n} checks · ${throws} throws on ${maps.map(m => m.id).join(', ')} × host ticks ${TICKS.join(' / ')} ms × ${FPS.join(' / ')} fps (${cliFrames} client frames) · worst: host ${worstHost.toFixed(4)} u / ${worstHostT} tick, client ${worstCli.toFixed(4)} u / ${worstCliT} tick, own copy ${worstMine.toFixed(4)} u, drawn jump ${worstJump.toFixed(3)} u`);
