// Grenades never pass through the world, never fall out of it unnoticed, and go off on the surface they lie on.
//   · Always (CI): a one-faced wall and a one-faced floor (CS2's walls are single triangles) — full throws and slow drops
//     stepped at 16 ms … 250 ms never end behind / under them, and no committed piece of a flight crosses them; the
//     built-in maps (boxes): throws from the spawns in every direction at host ticks of 16 / 50 / 100 ms never enter a
//     box, never sink under the ground, never leave the map's bounds.
//   · On this computer's CS2 maps (user-maps/*.bsp; skipped without them), for every map: a few hundred grenades of each
//     kind (HE, flash, smoke, decoy, molotov, incendiary) from walkable spots, in every direction and strength (running
//     too), flown by the host's own nadesTick at 16 / 50 / 100 ms ticks, plus client copies catching up 100 ms late:
//       – no committed piece of any flight crosses one of CS2's triangles (setNadeProbe: every substep);
//       – none ends under the map's lowest surface or outside its bounds unless removed on purpose (out of the world:
//         a lob over an outer wall — logged in NADE_LOG; nothing else may be logged); a fall through a gap in the map
//         file's own surfaces (a face it lacks, a surface over where it fell out) is logged as that (GAP_WHY) and rare;
//       – every smoke and fire grenade goes off on a real surface (one right under it), the first one under where it lay
//         (its own floor, never one below); a fire on a floor has flames; a decoy rests on a surface;
//       – a throw from 16 HU in front of any shut door, whole crate or intact pane starts on the thrower's side and
//         never passes through it while shut / whole.
//   node tests/gd-nade-sweep.mjs [--files user-maps] [--throws N (per kind and map, default 200)] [map ids…]
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { FILE_MAP_IDS } from '../dist/cs-maps/themes.js';
import { EYE } from '../dist/weapons-data.js';
import { stepNade, throwStart, launch, nadesTick, setNadeProbe, fireCells, NADE_LOG, GAP_WHY, R, NADES } from '../dist/arena-nades.js';
import { buildNadeMesh } from '../tools/maps/nade-mesh.mjs';
import { createNadeMesh } from '../dist/nade-mesh.js';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const dir = opt('--files') || 'user-maps', THROWS = +(opt('--throws') || 200), only = argv;
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
let seed = 20261029; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const cx = ARENA.cx, cz = ARENA.cz, KINDS = ['he', 'flash', 'smoke', 'decoy', 'molotov', 'incendiary'], DTS = [.016, .05, .1];
// ── Synthetic: one-faced surfaces (each a single quad facing the open side, as CS2's world triangles are) ──
function meshOf(quads) {
  const T = []; for (const [a, b, c, d] of quads) T.push(...a, ...b, ...c, ...a, ...c, ...d);
  const { info, buf } = buildNadeMesh(new Float32Array(T)), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), p4 = n => n + (4 - n % 4) % 4;
  let o = 0; const tri = new Uint16Array(ab, o, info.tris * 9); o += p4(info.tris * 18); const box = new Uint16Array(ab, o, info.nodes * 6); o += p4(info.nodes * 12); const links = new Uint32Array(ab, o, info.nodes * 2); o += info.nodes * 8;
  return createNadeMesh({ o: info.o, s: info.s, tri, box, links, sight: new Uint8Array(ab, o, info.tris) });
}
{ const F = 400, wall = meshOf([[[0, 0, -F], [0, 0, F], [0, 300, F], [0, 300, -F]], [[-F, 0, -F], [-F, 0, F], [F, 0, F], [F, 0, -F]]]), floor = meshOf([[[-F, 0, -F], [-F, 0, F], [F, 0, F], [F, 0, -F]]]);
  const bw = { nadeMesh: wall, movers: [] }, bf = { nadeMesh: floor, movers: [] }, bounds = { minX: -F, maxX: F, minZ: -F, maxZ: F };
  for (const dt of [.016, .05, .08, .1, .25]) { let behind = 0, crossed = 0, under = 0;
    setNadeProbe((g, ox, oy, oz) => { if (g.M.blocked(ox, oy, oz, g.x, g.y, g.z)) crossed++; });
    for (let k = 0; k < 200; k++) { const g = { x: -20 - rnd() * 30, y: 5 + rnd() * 40, z: -100 + rnd() * 200, vx: 104 + rnd() * 120, vy: -10 + rnd() * 30, vz: -20 + rnd() * 40, still: 0, M: wall }; for (let t = 0; t < 3 && !g.rest; t += dt) stepNade(g, bw, bounds, dt); if (g.x > 0) behind++; }
    for (let k = 0; k < 200; k++) { const g = { x: -100 + rnd() * 200, y: .36 + rnd() * 3, z: -100 + rnd() * 200, vx: rnd() * 4 - 2, vy: -rnd() * 6, vz: rnd() * 4 - 2, still: 0, M: floor }; for (let t = 0; t < 3 && !g.rest && !g.void; t += dt) stepNade(g, bf, bounds, dt); if (g.y < 0) under++; }
    setNadeProbe(null); check(`one-faced wall and floor at ${dt * 1000 | 0} ms steps: nothing ends behind or under them, no piece of a flight crosses them`, !behind && !under && !crossed, `behind ${behind} · under ${under} · crossings ${crossed}`); } }
// ── Built-in maps (boxes): no box entered, never under the ground, never out of bounds ──
const inBox = (boxes, x, y, z) => boxes.some(b => !b.off && x > b.minX + 1e-6 && x < b.maxX - 1e-6 && z > b.minZ + 1e-6 && z < b.maxZ - 1e-6 && y > b.y0 + 1e-6 && y < b.y1 - 1e-6);
for (const id of ['yard', 'dust2', 'inferno', 'nuke', 'cache', 'anubis', 'ancient']) { const M = ARENA_MAPS[id]; if (!M || M.fromFile) continue; const boxes = mapBoxes(M, cx, cz), [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 };
  let n = 0, entered = 0, sunk = 0, out = 0; setNadeProbe(g => { if (inBox(boxes, g.x, g.y, g.z)) entered++; if (g.y < R - 1e-6) sunk++; if (g.x < bounds.minX - R || g.x > bounds.maxX + R || g.z < bounds.minZ - R || g.z > bounds.maxZ + R) out++; });
  for (const sp of (M.t ? [...M.t, ...M.ct] : M.spawns).slice(0, 12)) for (let k = 0; k < 6; k++) { const yaw = rnd() * Math.PI * 2, pit = (rnd() * 140 - 60) * Math.PI / 180, a = { x: cx + sp[0], y: (sp[2] ?? (M.floorAt?.(sp[0], sp[1]) || 0)) + EYE, z: cz + sp[1], dx: Math.cos(pit) * Math.sin(yaw), dy: Math.sin(pit), dz: Math.cos(pit) * Math.cos(yaw), strength: ['long', 'medium', 'short'][k % 3] };
    const dt = DTS[n++ % 3], g = { ...throwStart(a, boxes, bounds), ...launch(a), still: 0 }; for (let t = 0; t < 6 && !g.rest; t += dt) stepNade(g, boxes, bounds, dt); }
  setNadeProbe(null); check(`${id} (built in): ${n} throws at 16 / 50 / 100 ms — never inside a box, under the ground or off the map`, !entered && !sunk && !out, `inside ${entered} · under ${sunk} · off ${out}`); }
// ── CS2 map files ──
const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.bsp') && FILE_MAP_IDS.includes(f.replace(/\.bsp$/i, '')) && (!only.length || only.includes(f.replace(/\.bsp$/i, '')))).sort() : [];
if (!files.length) console.log('SKIP: no converted CS2 maps in ' + dir + ' (the CS2-map sweep runs on a computer that has them)');
for (const f of files) { const id = f.replace(/\.bsp$/i, ''), buf = readFileSync(dir + '/' + f); if (buf.subarray(0, 4).toString() !== 'CS2M') continue;
  useMapFile(id, buf); const M = ARENA_MAPS[id], boxes = mapBoxes(M, cx, cz), NM = boxes.nadeMesh; if (!NM) { console.log('SKIP ' + id + ': no grenade mesh (convert it again)'); continue; }
  const [W, D] = M.size, bounds = { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 }, G = M.grid, t0 = Date.now(), OFF0 = boxes.movers.map(b => b.off), reset = () => boxes.movers.forEach((b, i) => { b.off = OFF0[i]; });
  // Walkable spots: the spawns, then random walkable cells with room for a player's head.
  const spots = [...M.t, ...M.ct].map(s => [cx + s[0], (s[2] || 0) + EYE, cz + s[1]]), tmp = new Float64Array(4); let tries = 0;
  while (spots.length < 400 && tries++ < 80000) { const i = (rnd() * G.cells.length) | 0; if (G.cells[i] !== 1) continue; const c = i % G.cols, r = (i / G.cols) | 0, x = cx - W / 2 + (c + .5) * G.cell, z = cz - D / 2 + (r + .5) * G.cell, y = G.heights[i] + EYE;
    if (!Number.isFinite(y) || NM.contact(x, y, z, 16 * 2.54 / 16.5, tmp) || NM.contact(x, y - 4, z, 16 * 2.54 / 16.5, tmp)) continue; spots.push([x, y, z]); }
  let cur = null, crossings = 0, sightCross = 0, last = [0, 0, 0]; const ex = [];
  setNadeProbe((g, ox, oy, oz) => { last[0] = g.x; last[1] = g.y; last[2] = g.z; if (NM.blocked(ox, oy, oz, g.x, g.y, g.z)) { crossings++; if (NM.blocked(ox, oy, oz, g.x, g.y, g.z, true)) sightCross++; if (ex.length < 3) ex.push({ kind: cur?.kind, from: cur?.from, piece: [ox, oy, oz, g.x, g.y, g.z].map(v => +v.toFixed(2)) }); } });
  const gaps = [], st = { flights: 0, void: 0, gap: 0, logged: 0, bug: 0, offMap: 0, underWorld: 0, wrongFloor: 0, noSurface: 0, noFlames: 0, airburst: 0, decoyFloat: 0, client: 0, ms: 0 }, bad = [];
  const surfaceAt = (x, y, z) => { const w = NM.first(x, y + .3, z, x, y - .3, z); if (w <= 1) return true; return boxes.movers.some(b => !b.off && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && Math.abs(b.y1 - y) < .3); };
  for (const kind of KINDS) for (let k = 0; k < THROWS; k++) { reset(); const [x, y, z] = spots[(rnd() * spots.length) | 0], yaw = rnd() * Math.PI * 2, pit = (rnd() * 150 - 70) * Math.PI / 180, run = rnd() < .5 ? 0 : rnd() * 38, ry = rnd() * 6.283;
    const a = { x, y, z, dx: Math.cos(pit) * Math.sin(yaw), dy: Math.sin(pit), dz: Math.cos(pit) * Math.cos(yaw), vx: Math.sin(ry) * run, vy: 0, vz: Math.cos(ry) * run, strength: ['long', 'medium', 'short'][k % 3] }, dt = DTS[k % 3];
    const g = { id: 's' + k, kind, by: 'Sweeper', ...throwStart(a, boxes, bounds), ...launch(a), at: 1e9, phase: 'air', still: 0, ...(kind === 'decoy' ? { gun: 'ak', seed: k + 1, team: 't' } : {}) }, game = { mode: 'arena', arena: { map: id, bots: [], loadout: {} }, combat: { nades: [g], hp: {}, down: {} } };
    cur = { kind, from: [x, y, z].map(v => +v.toFixed(1)) }; last[0] = g.x; last[1] = g.y; last[2] = g.z; const logN = NADE_LOG.length, logHead = NADE_LOG.at(-1); let t = 1e9, wasY = g.y; st.flights++;
    while (t < 1e9 + 15000) { t += dt * 1000; wasY = g.y; nadesTick(game, [], dt, t, { boxes, bounds }); if (g.phase !== 'air') break; }
    const gone = !game.combat.nades.includes(g), entry = NADE_LOG.at(-1) !== logHead ? NADE_LOG.at(-1) : null;
    if (gone || g.phase === 'gone') { if (entry?.why === 'out of the world' || entry?.why === 'went off over nothing') st.void++; else if (entry?.why === GAP_WHY) { st.gap++; if (gaps.length < 2) gaps.push({ kind, from: cur.from, end: entry.end, last: entry.last }); } else { st.bug++; if (bad.length < 4) bad.push({ why: entry?.why || 'removed unlogged', kind, from: cur.from }); } continue; }
    if (g.x < bounds.minX - R || g.x > bounds.maxX + R || g.z < bounds.minZ - R || g.z > bounds.maxZ + R) st.offMap++;
    if (g.y < (NM.minY ?? 0) - 1) st.underWorld++;
    if (g.phase === 'smoke' || g.phase === 'fire') {   // on a surface (right under it), the first one under the canister's last spot
      if (!surfaceAt(g.x, g.y, g.z)) { st.noSurface++; if (bad.length < 8) bad.push({ why: 'no surface under ' + g.phase, kind, at: [g.x, g.y, g.z].map(v => +v.toFixed(2)) }); }
      if (last[1] - g.y > .02 && NM.blocked(last[0], last[1], last[2], g.x, g.y + .05, g.z)) { st.wrongFloor++; if (bad.length < 8) bad.push({ why: 'a floor between the canister and its ' + g.phase, kind, lay: last.map(v => +v.toFixed(2)), at: +g.y.toFixed(2) }); }
      if (g.phase === 'fire' && !fireCells(boxes, g.x, g.z, g.y).length) { st.noFlames++; if (bad.length < 8) bad.push({ why: 'fire without flames', kind, at: [g.x, g.y, g.z].map(v => +v.toFixed(2)) }); } }
    if (g.phase === 'out' && g.airburst) st.airburst++;
    if (g.phase === 'decoy' && !(NM.contact(g.x, g.y - R * .6, g.z, R, tmp) || boxes.movers.some(b => !b.off && g.x > b.minX - R && g.x < b.maxX + R && g.z > b.minZ - R && g.z < b.maxZ + R && Math.abs(b.y1 + R - g.y) < .2) || NM.contact(g.x, g.y, g.z, R * 1.05, tmp))) st.decoyFloat++; }
  // Client copies (arena-nades-view.js): the host's state copied each 50 ms update, stepped 100 ms late, then 60 fps frames.
  for (let k = 0; k < THROWS; k++) { reset(); const [x, y, z] = spots[(rnd() * spots.length) | 0], yaw = rnd() * Math.PI * 2, pit = (rnd() * 150 - 70) * Math.PI / 180, a = { x, y, z, dx: Math.cos(pit) * Math.sin(yaw), dy: Math.sin(pit), dz: Math.cos(pit) * Math.cos(yaw), strength: ['long', 'medium', 'short'][k % 3] };
    const host = { ...throwStart(a, boxes, bounds), ...launch(a), still: 0 }; cur = { kind: 'client copy', from: [x, y, z].map(v => +v.toFixed(1)) }; st.client++;
    for (let t = 0; t < 6 && !(host.rest && host.done); t += .05) { stepNade(host, boxes, bounds, .05); const S = { x: host.x, y: host.y, z: host.z, vx: host.vx, vy: host.vy, vz: host.vz, still: host.still, rest: !!host.rest, bt: host.bt, view: true }; stepNade(S, boxes, bounds, .1); for (let f = 0; f < 3; f++) stepNade(S, boxes, bounds, 1 / 60); if (host.rest) host.done = true; if (host.void) break; } }
  setNadeProbe(null); reset(); st.ms = Date.now() - t0;
  check(`${id}: ${st.flights} grenades (${THROWS} of each kind; ticks 16 / 50 / 100 ms) and ${st.client} client copies — no piece of any flight crosses a CS2 surface`, crossings === 0, `${crossings} crossings (${sightCross} of sight surfaces)` + (ex.length ? ' · ' + JSON.stringify(ex) : ''));
  check(`${id}: none ends under the world or off the map unless removed on purpose (out of the world: ${st.void}, logged); nothing else went wrong`, !st.offMap && !st.underWorld && !st.bug, `off the map ${st.offMap} · under the world ${st.underWorld} · bugs ${st.bug}` + (bad.length ? ' · ' + JSON.stringify(bad.filter(b => /logged|finite|air/.test(b.why))) : ''));
  // Falls through a gap in the map file's surfaces (a face it lacks: no crossing — the check above): told apart from a
  // lob off the map's edge in the log (GAP_WHY), and rare — map data for the converter, not the flight.
  check(`${id}: falls through gaps in the map file's own surfaces are logged as such and rare (≤ 0.5 %)`, st.gap <= st.flights * .005, `${st.gap} of ${st.flights}` + (gaps.length ? ' · ' + JSON.stringify(gaps) : ''));
  check(`${id}: every smoke and fire goes off on a real surface, its own floor; fires have flames; decoys rest on something`, !st.noSurface && !st.wrongFloor && !st.noFlames && !st.decoyFloat, `no surface ${st.noSurface} · floor below ${st.wrongFloor} · flameless ${st.noFlames} · decoy in the air ${st.decoyFloat} · air bursts ${st.airburst} · ${(st.ms / 1000).toFixed(1)} s` + (bad.length ? ' · ' + JSON.stringify(bad.slice(0, 4)) : ''));
  // Its doors, crates and panes (boxes, not CS2's triangles — the probe above cannot see them): a throw from 16 HU
  // (2.46 units) in front of each shut one, straight at it, every strength, at the host's ticks, starts on the thrower's
  // side and no piece of its flight passes through it while it is shut / whole (a pane: the flight breaks it first).
  // (The release sweep once looked at the triangles alone: every such throw at a shut door started behind it.)
  // (seg: does a→b enter the box — grown by a hair, so a pane of no thickness counts; off: how far a point is from it.)
  { const E = 1e-4, off = (b, p) => Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.y0 - p.y, 0, p.y - b.y1), Math.max(b.minZ - p.z, 0, p.z - b.maxZ));
    const seg = (b, ax, ay, az, bx, by, bz) => { let t0 = 0, t1 = 1; for (const [p, d, lo, hi] of [[ax, bx - ax, b.minX - E, b.maxX + E], [ay, by - ay, b.y0 - E, b.y1 + E], [az, bz - az, b.minZ - E, b.maxZ + E]]) { if (Math.abs(d) < 1e-12) { if (p <= lo || p >= hi) return false; continue; } let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 >= t1) return false; } return true; };
    let D0 = null, n = 0, movers = 0, startBehind = 0, through = 0; const exD = [];
    setNadeProbe((g, ox, oy, oz) => { if (D0 && !D0.off && seg(D0, ox, oy, oz, g.x, g.y, g.z)) { through++; if (exD.length < 2) exD.push({ mover: D0.mover, mat: D0.mat, from: [ox, oy, oz].map(v => +v.toFixed(2)), to: [g.x, g.y, g.z].map(v => +v.toFixed(2)) }); } });
    for (const d of boxes.movers) { reset(); if (d.off || !(d.y1 > d.y0)) continue; movers++; const thinX = d.maxX - d.minX < d.maxZ - d.minZ, mx = (d.minX + d.maxX) / 2, mz = (d.minZ + d.maxZ) / 2, y = (d.y0 + d.y1) / 2, gap = 16 * 2.54 / 16.5;
      for (const side of [-1, 1]) for (const strength of ['long', 'medium', 'short']) { reset(); D0 = d; const x = thinX ? (side < 0 ? d.minX - gap : d.maxX + gap) : mx, z = thinX ? mz : (side < 0 ? d.minZ - gap : d.maxZ + gap);
        const a = { x, y, z, dx: thinX ? -side : 0, dy: 0, dz: thinX ? 0 : -side, strength }, s = throwStart(a, boxes, bounds), g = { ...s, ...launch(a), still: 0 }, dt = DTS[n++ % 3];
        const hy = y + { long: 0, medium: -6, short: -12 }[strength] * 2.54 / 16.5, onDrop = s.x === x && s.z === z;   // (the hand: 12 − 12 × power HU under the eye — arena-nades.js throwStart; the start on the drop: something was between)
        if ((onDrop ? seg(d, x, y, z, s.x, s.y, s.z) : seg(d, x, y, z, x, hy, z) || seg(d, x, hy, z, s.x, s.y, s.z)) || off(d, s) < R - 1e-6) { startBehind++; if (exD.length < 2) exD.push({ startBehind: d.mover, mat: d.mat, eye: [x, y, z].map(v => +v.toFixed(2)), start: [s.x, s.y, s.z].map(v => +v.toFixed(2)) }); }
        for (let t = 0; t < 2 && !g.rest && !g.void && !g.bad; t += dt) stepNade(g, boxes, bounds, dt); } }
    D0 = null; setNadeProbe(null); reset();
    check(`${id}: ${n} throws from 16 HU in front of its ${movers} shut doors, crates and panes start on the thrower's side and never pass through a shut one`, !startBehind && !through, `started behind ${startBehind} · through ${through}` + (exD.length ? ' · ' + JSON.stringify(exD) : '')); }
}
console.log((fail ? 'FAIL' : 'PASS') + ': grenade sweep · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
