// CS2's own smoke lineups on Mirage (converted on this computer: user-maps/mirage.bsp), thrown with the game's physics:
// each lands in the place CS2's does (CS2's place volumes, from the map file) at about the time CS2's takes (its
// "air time", from a lineup site: until the smoke settles). The positions are CS2's getpos lines (setpos = the EYE,
// 64 units over the floor; setang: pitch down positive, yaw), plain left-click throws standing still. A wrong pitch remap,
// throw speed, start point, gravity or a collision that lets grenades through shows up here. Skipped without the map.
//   node tests/gd-lineups.mjs
import { readFileSync, existsSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { parseCs2Map } from '../dist/cs2-map.js';
import { throwStart, launch, stepNade } from '../dist/arena-nades.js';
const FILE = 'user-maps/mirage.bsp';
if (!existsSync(FILE) || readFileSync(FILE).subarray(0, 4).toString() !== 'CS2M') { console.log('SKIP: no converted CS2 Mirage on this computer'); process.exit(0); }
const buf = readFileSync(FILE), P = parseCs2Map(buf); if (!P.nadeMesh) { console.log('SKIP: this Mirage has no grenade mesh (convert it again)'); process.exit(0); }
useMapFile('mirage', buf); const M = ARENA_MAPS.mirage, H = M.hammer, U = H.U, cx = ARENA.cx, cz = ARENA.cz, boxes = mapBoxes(M, cx, cz), [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 };
const toGame = (x, y, z) => [cx + (x - H.x0) * U - H.W / 2, (z - H.zLow) * U, cz + (H.y1 - y) * U - H.D / 2], toH = (gx, gy, gz) => [H.x0 + (gx - cx + H.W / 2) / U, H.y1 - (gz - cz + H.D / 2) / U, H.zLow + gy / U];
const placeAt = q => P.places.filter(pl => q[0] >= pl.mins[0] - 16 && q[0] <= pl.maxs[0] + 16 && q[1] >= pl.mins[1] - 16 && q[1] <= pl.maxs[1] + 16 && q[2] >= pl.mins[2] - 48 && q[2] <= pl.maxs[2] + 48).map(pl => pl.name);
let pass = 0, fail = 0; const check = (name, ok, info) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ' · ' + info); };
// [name, where CS2's lands, CS2's air time (s), setpos x y z, setang pitch yaw] — www.cs2util.com/mirage/smoke/…
for (const [name, want, air, [x, y, z], [pitch, yaw]] of [
  ['Window smoke from cart', 'SnipersNest', 5.4, [360.075439, -691.96875, -100.067307], [-37.951241, 176.761139]],
  ['Jungle smoke from cart', 'Jungle', 6.6, [343.30954, -621.610291, -99.046494], [-42.075249, -148.328827]],
  ['B short smoke from cart', 'Catwalk', 3.6, [360.075439, -691.96875, -100.067307], [-24.971155, 160.756149]],
  ['Window smoke from underpass', 'SnipersNest', 2.6, [-968.03125, -380.064697, -288.06308], [-41.883251, -117.848106]],
]) {
  const p = pitch * Math.PI / 180, a = yaw * Math.PI / 180, f = [Math.cos(p) * Math.cos(a), Math.cos(p) * Math.sin(a), -Math.sin(p)], [ex, ey, ez] = toGame(x, y, z), A = { x: ex, y: ey, z: ez, dx: f[0], dy: f[2], dz: -f[1], strength: 'long' };
  const g = { kind: 'smoke', ...throwStart(A, boxes, bounds), ...launch(A), still: 0 }; let t = 0; for (; t < 12 && !g.rest; t += 1 / 64) stepNade(g, boxes, bounds, 1 / 64);
  const end = toH(g.x, g.y, g.z), at = placeAt(end);
  check(name + ': lands where CS2\'s does, when', at.includes(want) && Math.abs(t - air) <= .4, `${at.join('/') || 'nowhere named'} at ${end.map(Math.round).join(', ')} after ${t.toFixed(2)} s (CS2: ${want}, ${air} s)`);
}
console.log((fail ? 'FAIL' : 'PASS') + ': CS2 lineups on Mirage · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;

// ── v53 S2: the shipped lineup library (dist/gd-lineup-seeds.js) on every converted map ──
// Each seed is one of CS2's own lineups (www.cs2util.com: its getpos line, button, movement, and CS2's RECORDED landing /
// pop point — Hammer units, CS2's own coordinates — and the site's air time). Thrown as the library throws it
// (gd-lineups.js lineupThrow → arena-nades.js throwPacket → simThrow: the game's one fixed-step flight, CS2's 0.104 s
// throw delay and the flash's 0.2 s think included), it must land:
//  · in CS2's place volume (env_cs_place of the map file; a smoke within 32 HU of height, a flash's pop by its x / y),
//  · where CS2's did: a smoke's rest point within 32 HU of CS2's, a flash's pop point within 16 HU,
//  · when CS2's did: a flash — CS2's pop point lies on our flight within ±1 tick of our pop, whichever step the game
//    pops it on (the whole-set check below shows that step is CS2's 1.6 s, not 1.5 s); a smoke — the site's air time (measured from the click, 0.1 s steps, by hand: ±0.13 s spread over
//    108 lineups, so ±1 tick cannot be checked against it) within 0.3 s of ours + the throw delay.
// Standing, crouched and jump-throws (CS2's jump-throw bind). Run-jump lineups: none — the site's "W" lineups name no
// speed and fit no constant one (s2 report). Counts: at least 6 smokes and 4 flashes a map, except Nuke and Anubis
// (3 flashes each: all the site's flashbangs there that a getpos alone repeats — the rest are running throws, or land
// elsewhere here: see the v53 notes).
// And from where the GAME'S body stands on the spot (the movement settled there 0.5 s with no keys: our collision's floor,
// up to a few HU off CS2's — the 16-HU collision columns): it still lands in CS2's place, within 32 HU (a flash's pop
// too) — a lineup that only works from CS2's exact eye height is not shipped.
{ const { mapFrame, lineupThrow, lineupStand, seedsFor, cleanLineup, HU } = await import('../dist/gd-lineups.js'); const N = await import('../dist/arena-nades.js'); const MV = await import('../dist/arena-move.js'); const { floorTop } = await import('../dist/arena-maps.js');
  const MIN = { smoke: 6, flash: 4 }, FEWER = { nuke: { flash: 3 }, anubis: { flash: 3 } }; let maps = 0, seeds = 0, bad = 0;
  for (const map of ['mirage', 'dust2', 'inferno', 'nuke', 'anubis', 'ancient', 'overpass']) {
    const L0 = seedsFor(map); for (const k of ['smoke', 'flash']) { const n = L0.filter(l => l.kind === k).length, need = FEWER[map]?.[k] ?? MIN[k]; if (n < need) { bad++; console.log(`FAIL ${map}: ${n} ${k} lineups shipped (at least ${need})`); } }
    for (const l of L0) { const c = cleanLineup(l, map); if (!c || c.pos !== l.pos || c.kind !== l.kind || c.button !== l.button || c.move !== l.move || !/^https:\/\/www\.cs2util\.com\//.test(l.src)) { bad++; console.log('FAIL ' + map + ': seed ' + l.id + ' is not a clean lineup with its source'); } }
    const F = 'user-maps/' + map + '.bsp'; if (!existsSync(F) || readFileSync(F).subarray(0, 4).toString() !== 'CS2M') { console.log('SKIP ' + map + ': not converted on this computer'); continue; }
    const b = readFileSync(F), Pm = parseCs2Map(b); if (!Pm.nadeMesh) { console.log('SKIP ' + map + ': no grenade mesh'); continue; }
    useMapFile(map, b); const Mm = ARENA_MAPS[map], bx = mapBoxes(Mm, cx, cz), [Wm, Dm] = Mm.size, bd = { minX: cx - Wm / 2, maxX: cx + Wm / 2, minZ: cz - Dm / 2, maxZ: cz + Dm / 2 }, fr = mapFrame(Mm, cx, cz); maps++;
    const inPl = (q, zt) => Pm.places.filter(pl => q[0] >= pl.mins[0] && q[0] <= pl.maxs[0] && q[1] >= pl.mins[1] && q[1] <= pl.maxs[1] && (zt === null || q[2] >= pl.mins[2] - zt && q[2] <= pl.maxs[2] + zt)).map(pl => pl.name);
    for (const L of L0) { seeds++; const flash = L.kind === 'flash', ds = [], land = L.land;
      const g = N.simThrow(L.kind, N.throwPacket(lineupThrow(L, fr)), bx, bd, 20000, s => { const q = fr.toHammer(s.x, s.y, s.z); ds[s.n] = Math.hypot(q[0] - land[0], q[1] - land[1], q[2] - land[2]); });
      const end = fr.toHammer(g.x, g.y, g.z), miss = Math.hypot(end[0] - land[0], end[1] - land[1], end[2] - land[2]), zt = flash ? null : 32, want = inPl(land, zt), got = inPl(end, zt), t = g.n * N.NADE_MS / 1000;
      const placeOk = (!want.length || want.some(p => got.includes(p))) && (!L.place || got.includes(L.place)), missOk = miss <= (flash ? 16 : 32);
      const win = Math.min(ds[g.n - 1] ?? Infinity, ds[g.n] ?? Infinity, ds[g.n + 1] ?? Infinity), timeOk = flash ? g.off && win <= 16 : g.off && (!(L.air > 0) || Math.abs(t + N.THROW_DELAY - L.air) <= .3);
      const s0 = lineupStand(L, fr), st = MV.createMoveState(floorTop(bx, s0.x, s0.z, s0.y + 1)); st.x = s0.x; st.z = s0.z; st.y = s0.y; st.duck = s0.duck; st.ducked = !!s0.duck;
      for (let k = 0; k < 64; k++) MV.moveStep(st, { wish: [0, 0], walk: false, duck: !!s0.duck, jump: false, noJump: true, weapon: L.kind, scoped: false, look: [0, -1], pitch: 0 }, { boxes: bx, ladders: [], bounds: bd, others: [] }, MV.TICK);
      const T = lineupThrow(L, fr); T.x = st.x; T.y = st.y; T.z = st.z; const gb = N.simThrow(L.kind, N.throwPacket(T), bx, bd, 20000), eb = fr.toHammer(gb.x, gb.y, gb.z), missB = Math.hypot(eb[0] - land[0], eb[1] - land[1], eb[2] - land[2]), gotB = inPl(eb, zt);
      const bodyOk = missB <= 32 && (!want.length || want.some(p => gotB.includes(p))), dFeet = Math.hypot((st.x - s0.x) / HU, (st.y - s0.y) / HU, (st.z - s0.z) / HU);
      check(`${map} · ${L.kind} · ${L.move} ${L.button} · ${L.name}: lands where CS2's does, when`, placeOk && missOk && timeOk && bodyOk && !g.void,
        `${got.join('/') || 'no place'} (CS2: ${L.place || 'no place'}), ${miss.toFixed(1)} HU from CS2's ${flash ? 'pop' : 'landing'}, ${flash ? 'pops at step ' + g.n + ' (' + t.toFixed(3) + ' s), CS2\'s point ' + win.toFixed(1) + ' HU off within ±1 tick' : 'rests at ' + t.toFixed(3) + ' s (+' + N.THROW_DELAY + ' s throw delay; site: ' + (L.air ?? '—') + ')'} · from the game's body (${dFeet.toFixed(1)} HU off CS2's feet): ${missB.toFixed(1)} HU`); } }
  if (bad) fail += bad;
  console.log((fail ? 'FAIL' : 'PASS') + ': lineup library · ' + seeds + ' lineups on ' + maps + ' converted maps · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1; }

// ── v53 S2 (review): EVERY public CS2 lineup a getpos alone repeats, not just the shipped seeds ──
// tests/fixtures/cs2-lineups-public.json: all of cs2util.com's standing / crouched / standing-jump smokes and flashes
// with CS2's recorded landing / pop point (the seeds were picked from these by the same check as above, so passing the
// seeds alone proves little). Thrown the same way, each counts as a hit when it ends within 32 HU of CS2's point (a
// flash's pop within 16 HU). The floors below are what this build reaches — they may only go up (a physics change that
// loses CS2 lineups fails here); the misses are listed (the v53 notes: notCS2, the smoke rest / roll and collision
// differences). The flash's pop moment, checked so it can fail: on every flash whose flight passes CS2's pop point (within
// 16 HU anywhere in 1.4–1.8 s), that point lies nearer our flight at steps 102–104 (1.6 s) than at 96 (1.5 s) or 110.
{ const { mapFrame, lineupThrow, formatPos, parsePos } = await import('../dist/gd-lineups.js'); const N = await import('../dist/arena-nades.js');
  const FX = JSON.parse(readFileSync(new URL('./fixtures/cs2-lineups-public.json', import.meta.url), 'utf8')), FLOOR = { 'smoke stand': 50, 'smoke jump': 83, 'flash stand': 30, 'flash jump': 25 };   // (v53.0.0: 50/80, 83/217, 30/38, 25/31 — 'stand' includes the crouched)
  const tally = {}, misses = [], pops = [], PX = new Float64Array(120 * 3); let maps = 0, popN = 0, popBad = 0;
  for (const map of ['mirage', 'dust2', 'inferno', 'nuke', 'anubis', 'ancient', 'overpass']) {
    const F = 'user-maps/' + map + '.bsp'; if (!existsSync(F) || readFileSync(F).subarray(0, 4).toString() !== 'CS2M') continue; const b = readFileSync(F); if (!parseCs2Map(b).nadeMesh) continue;
    useMapFile(map, b); const Mm = ARENA_MAPS[map], bx = mapBoxes(Mm, cx, cz), [Wm, Dm] = Mm.size, bd = { minX: cx - Wm / 2, maxX: cx + Wm / 2, minZ: cz - Dm / 2, maxZ: cz + Dm / 2 }, fr = mapFrame(Mm, cx, cz); maps++;
    for (const [m, kind, move, button, pos, land, , name, id] of FX.rows) { if (m !== map) continue;
      const L = { kind, button, move: move === 'crouch' ? 'crouch' : move, pos: formatPos(parsePos(pos)) }, flash = kind === 'flash', ds = [];
      const g = N.simThrow(flash ? 'smoke' : kind, N.throwPacket(lineupThrow(L, fr)), bx, bd, flash ? 1800 : 20000, s => { const q = fr.toHammer(s.x, s.y, s.z); ds[s.n] = Math.hypot(q[0] - land[0], q[1] - land[1], q[2] - land[2]); if (s.n < 120) { PX[s.n * 3] = q[0]; PX[s.n * 3 + 1] = q[1]; PX[s.n * 3 + 2] = q[2]; } });
      const end = fr.toHammer(g.x, g.y, g.z), miss = flash ? ds[103] ?? Infinity : Math.hypot(end[0] - land[0], end[1] - land[1], end[2] - land[2]), hit = miss <= (flash ? 16 : 32) && !g.void, cat = kind + ' ' + (move === 'jump' ? 'jump' : 'stand');
      (tally[cat] ??= [0, 0])[1]++; if (hit) tally[cat][0]++; else misses.push(`${map} · ${kind} · ${move} ${button} · ${name} (${id}): ${Number.isFinite(miss) ? miss.toFixed(0) : '—'} HU`);
      const nearAll = Math.min(...ds.filter(Number.isFinite)); if (!hit) { if (nearAll <= 32) tally[cat][2] = (tally[cat][2] || 0) + 1; misses[misses.length - 1] += ` (its flight passes ${nearAll.toFixed(0)} HU from CS2's point)`; }   // (a miss whose flight passed CS2's point: the bounce / roll / rest differs, not the throw)
      const gf = flash ? N.simThrow('flash', N.throwPacket(lineupThrow(L, fr)), bx, bd, 4000) : null, ps = gf ? gf.n : 103;   // (the flash's own pop step, as the game flies it — the check below fails if that moves)
      const moving = flash && g.n >= 110 && Math.hypot(PX[96 * 3] - PX[110 * 3], PX[96 * 3 + 1] - PX[110 * 3 + 1], PX[96 * 3 + 2] - PX[110 * 3 + 2]) > 16;   // (still flying through 1.5–1.72 s: the moment can be told apart)
      if (moving && Math.min(...ds.slice(90, 116)) <= 16) { popN++; const near = Math.min(ds[ps - 1], ds[ps], ds[ps + 1]); pops.push([ds[96], ds[103], ds[110]]); if (!(near < ds[96] && near < ds[110])) { popBad++; console.log(`  pop moment: ${map} ${name}: CS2's pop ${ds[96].toFixed(1)} / ${near.toFixed(1)} / ${ds[110].toFixed(1)} HU off our flight at 1.5 / 1.6 / 1.72 s`); } } } }
  if (maps) { for (const [k, [h, n]] of Object.entries(tally)) check(`all public CS2 lineups · ${k}: within ${k.startsWith('flash') ? 16 : 32} HU of CS2's point`, h >= (FLOOR[k] ?? 0), `${h}/${n} (${(100 * h / n).toFixed(0)}%; floor ${FLOOR[k] ?? 0}) · of the ${n - h} misses, ${tally[k][2] || 0} fly within 32 HU of CS2's point first`);
    const med = i => { const v = pops.map(p => p[i]).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : NaN; };   // (a few flights part from CS2's after a bounce: the rule is the set's, ≥ 90 % and the medians)
    check('the flash pops at CS2\'s moment (1.6 s: the first 0.2 s think after the 1.5 s fuse)', popN > 20 && popBad <= popN * .1 && med(1) < med(0) / 2 && med(1) < med(2) / 2, `${popN - popBad}/${popN} flashes still flying then: CS2's pop point nearest our flight at 1.6 s; median ${med(0).toFixed(1)} / ${med(1).toFixed(1)} / ${med(2).toFixed(1)} HU at 1.5 / 1.609 / 1.72 s`);
    if (process.env.MISSES) for (const s of misses) console.log('  miss: ' + s); else console.log(`  (${misses.length} misses: MISSES=1 node tests/gd-lineups.mjs lists them)`); }
  console.log((fail ? 'FAIL' : 'PASS') + ': all public CS2 lineups · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1; }

// ── v53 S2 (review): pop-flashes like CS2's (SPEC 1.3: "the pop height above walls must blind players round the corner
// while not blinding the thrower when they turn away") ──
// Every shipped flash marked pop: true, on its converted map: thrown as written, the thrower on the spot turned away is
// blinded ≤ 0.25 s in all, and a viewer round the corner (sees the pop, not the thrower) is blinded ≥ 1 s (gd-lineups.js
// popFlash; the game's 3D flash rule, arena-nades.js flashBlind). At least one such flash a map.
{ const LB = await import('../dist/gd-lineups.js'); const N = await import('../dist/arena-nades.js'); let n = 0;
  for (const map of ['mirage', 'dust2', 'inferno', 'nuke', 'anubis', 'ancient', 'overpass']) {
    const F = 'user-maps/' + map + '.bsp'; if (!existsSync(F) || readFileSync(F).subarray(0, 4).toString() !== 'CS2M') continue; const b = readFileSync(F); if (!parseCs2Map(b).nadeMesh) continue;
    useMapFile(map, b); const Mm = ARENA_MAPS[map], bx = mapBoxes(Mm, cx, cz), [Wm, Dm] = Mm.size, bd = { minX: cx - Wm / 2, maxX: cx + Wm / 2, minZ: cz - Dm / 2, maxZ: cz + Dm / 2 }, fr = LB.mapFrame(Mm, cx, cz);
    const pops = LB.seedsFor(map).filter(l => l.pop); check(`${map}: pop-flashes shipped`, pops.length >= 1, pops.length + ' of ' + LB.seedsFor(map).filter(l => l.kind === 'flash').length + ' flashes');
    for (const L of pops) { n++; const r = LB.popFlash(L, fr, bx, bd, N); check(`${map} · pop-flash · ${L.name}: spares the thrower turned away, blinds round the corner`, !!r?.pop, `thrower turned away ${(r?.awayMs / 1000).toFixed(2)} s (≤ ${LB.POP_AWAY_MS / 1000}), round the corner ${(r?.victimMs / 1000).toFixed(2)} s (≥ ${LB.POP_VICTIM_MS / 1000})`); } }
  console.log((fail ? 'FAIL' : 'PASS') + ': pop-flashes · ' + n + ' checked · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1; }
