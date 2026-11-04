// Global Defensive · physical death ragdolls (v53 Addendum 3: dist/gd-ragdoll.js on cs2-agents.js / gd-soldiers.js).
//  · Always (CI): the built-in soldier's ragdoll — falls and settles (asleep) within SETTLE_S, never under the floor, the
//    killing hit pushes the way the bullet went (a headshot moves the head first), a blast pushes away from it, the
//    momentum is kept; the same record gives the same fall (every computer alike); a body first seen long after its
//    death is lying at once; the cap (10; Low presets 4) — a death past it with none settled falls the old way; nothing
//    allocated per frame; on the built-in maps' boxes from their spawns, never inside a box or under the ground;
//    the host's kill record (rg / z) on the down record; the CS2 PHYS reader (tools/cs2-ragdoll/kv3.mjs) on a sample.
//  · With CS2 imported on this computer (user-assets/agents/cs2_ct.glb + user-assets/ragdoll/cs2-ragdoll.json, and the
//    converted maps user-maps/*.bsp; skipped without them): CS2's own ragdoll on the CS2 agent — its joints at the bind
//    pose are exactly at rest (no swing, no twist, no gap: the frames read right); a sweep of death spots on 3 CS2 maps
//    (walkable spots, random facing and hit direction): every body sleeps within SETTLE_S, no part ends in a wall or
//    under a floor (the map's own triangles), no step of any part crosses a surface.
//  · (FINISH pass) the time limit MAX_S stops a body that never rests (forced); one budget for all ragdolls a frame
//    (ragdollFrame), a body first seen late catches up a few steps a frame, hidden meanwhile; a body hidden in a smoke
//    keeps falling; a sleeping body is not re-posed; allocation measured without a collection in between (a large
//    young generation) — and the check shown to catch a frame that does allocate.
//  · (r2 fixes) ten bodies falling at 30 fps: every one takes its due steps, none hidden; several late bodies share the
//    catch-up budget; past the cap only a settling body is put to sleep (none settling: the new death falls the old way);
//    the Low preset falls exactly as High (one solver; Low only sleeps sooner) — and the CS2 sweep runs at both; depth
//    measured against the full part radius; a part that starts through a thin wall comes back (it was pinned there);
//    under a converted map's gap the map's lowest surface holds the body; a death in a jump keeps its vertical speed;
//    warmRagdolls() on the CS2 map makes the first death's first step cheap (fresh process); the body stays in the
//    world when the dead player's group moves after the death.
//   node tests/gd-ragdoll.mjs [--spots N]        (re-runs itself with --expose-gc and a 64 MB young generation for the allocation check)
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { readFileSync, existsSync } from 'node:fs';
if (typeof gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', '--max-semi-space-size=64', '--min-semi-space-size=64', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
// allocation over a loop: one collection BEFORE, none during or after — with a 64 MB young generation nothing is collected
// in between, so every short-lived object the loop makes is still counted (the old gc-after check saw none of them)
const DEAD = { dead: true }, DT144 = 1 / 144;   // (the frame's arguments made once: the loop measured makes nothing itself)
const allocOf = loop => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; loop(); return process.memoryUsage().heapUsed - h0; };
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; }, SPOTS = +(opt('--spots') || 24);
let n = 0, ok = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding/.test(String(a[0]))) w(...a); }; }
const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : /^(get|create)ImageData$/.test(k) ? () => ({ data: new Uint8ClampedArray(4) }) : /Gradient$/.test(k) ? () => ({ addColorStop() {} }) : typeof k === 'string' ? (t[k] ?? (() => {})) : undefined, set: (t, k, x) => { t[k] = x; return true; } });
globalThis.document ??= { createElement: () => ({ width: 64, height: 64, style: {}, getContext: () => ctx, toDataURL: () => '' }), createElementNS: () => ({ style: {} }) };
const THREE = await import('../dist/three.module.js');
const R = await import('../dist/gd-ragdoll.js'), { makeSoldier } = await import('../dist/gd-soldiers.js'), CL = await import('../dist/combat-logic.js');
const { ARENA_MAPS, useMapFile, mapBoxes, floorTop } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), { FILE_MAP_IDS } = await import('../dist/cs-maps/themes.js');
const FORCED = [], CS2_FILES = []; const SETTLE_S = 8;   // (CS2's own come to rest in 2–3 s on flat ground; anywhere within 8 s — sliding down a slope included — at rest, never stopped by the time limit)
let T = 1e6; const hostNowFn = () => T; R.setRagdollWorld({ world: () => WORLD, hostNow: hostNowFn, quality: () => QUAL, game: () => GAME }); let WORLD = R.FLAT, QUAL = 'High', GAME = null;
let seed = 20261104; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// a soldier standing at (x, y, z) facing yaw, posed (its own update), its rig
function soldier(x = 0, y = 0, z = 0, yaw = 0, name = 'S') { const s = makeSoldier({ name, pose: {} }, 't'); s.setWeapon('ak'); for (let i = 0; i < 30; i++) s.update(1 / 30, { speed: 0, crouch: false, aim: true }); const m = new THREE.Group(); m.add(s.g); m.position.set(x, y, z); m.rotation.y = yaw; m.updateMatrixWorld(true); return s; }   // (held as multiplayer.js holds it: the player's group m.g places it, the dress's own g is its fall offset)
// the soldier's rig is private: reach it through the module's own path (startRagdoll on its first dead update) — a stub
// down record via the game state, then the simulation read back from the pool
const parts = s => { const out = []; s.g.traverse(o => { if (o.isGroup) out.push(o); }); return out; };
// what is drawn of it (every ancestor visible; vertex-exact bounds — a turned part's box corners overstate it)
const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const drawn = s => { s.g.updateMatrixWorld(true); const out = []; s.g.traverse(o => { if (o.isMesh && o.geometry && shown(o) && !o.userData.noShadow) out.push(o); }); return out; };
const lowest = s => { const b = new THREE.Box3(); let low = Infinity; for (const o of drawn(s)) { b.setFromObject(o, true); low = Math.min(low, b.min.y); } return low; };
const headOf = s => { let h = null; s.g.traverse(o => { if (!h && o.isGroup && o.children.some(c => c.isMesh) && o.parent?.parent && o.position.y > 3.5 && o.position.y < 4.5) h = o; }); return h; };
const centre = s => { s.g.updateMatrixWorld(true); const c = new THREE.Vector3(), v = new THREE.Vector3(); let k = 0; s.g.traverse(o => { if (o.isGroup && o.children.some(x => x.isMesh) && shown(o) && o !== s.g) { c.add(o.getWorldPosition(v)); k++; } }); return c.divideScalar(k || 1); };   // (the mean of its parts' pivots)
function die(s, name, dn, vx = 0, vz = 0) { GAME = { combat: { down: { [name.toLowerCase()]: dn }, nades: dn.nades || [], d: null } }; s.update(1 / 60, { dead: true, vx, vz }); }
function run(s, secs, step = 1 / 60) { for (let t = 0; t < secs; t += step) { T += step * 1000; s.update(step, { dead: true }); } }

// (the clean-process mode: node tests/gd-ragdoll.mjs --cs2-alloc <map> — the CS2 agent's ragdoll stepped on that CS2 map,
// the heap counted over each fall's first 60 steps with no collection in between; prints "CS2ALLOC <least bytes a step>")
const CS2_ALLOC = opt('--cs2-alloc');
if (CS2_ALLOC) { const { gltfLoader } = await import('../dist/gltf-loader.js'); const buf = readFileSync('user-assets/agents/cs2_ct.glb'); const glb = await new Promise((res, rej) => gltfLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
  R.useCs2Ragdolls(JSON.parse(readFileSync('user-assets/ragdoll/cs2-ragdoll.json', 'utf8'))); const holder = new THREE.Group(); holder.scale.setScalar(100 / 16.5); holder.add(glb.scene); const rig = R.agentRig(glb.scene, 'ct', 'tpl', THREE);
  useMapFile(CS2_ALLOC, readFileSync(`user-maps/${CS2_ALLOC}.bsp`)); const M = ARENA_MAPS[CS2_ALLOC], cx = ARENA.cx, cz = ARENA.cz, boxes = mapBoxes(M, cx, cz), Gd = M.grid, [W, D] = M.size, Wd = R.mapWorld(boxes, { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 });
  const spots = []; for (let i = 0; i < Gd.cells.length && spots.length < 8; i += 1201) { if (Gd.cells[i] !== 1 || !Number.isFinite(Gd.heights[i])) continue; spots.push([cx - W / 2 + (i % Gd.cols + .5) * Gd.cell, Gd.heights[i], cz - D / 2 + (((i / Gd.cols) | 0) + .5) * Gd.cell]); }
  if (!process.env.NOWARM) { const [x, y, z] = spots[0]; R.warmRagdolls(Wd, x, y, z); rig.restore(); holder.position.set(x, y, z); holder.updateMatrixWorld(true); rig.read(); R.applyKill(rig, { wid: 'ak', rg: [x, y + 7.9, z, 1, 0, 0] });
    let worst = 0; for (let i = 0; i < 4; i++) { const t0 = process.hrtime.bigint(); rig.sim.step(Wd); worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6); } console.log('CS2FIRST ' + worst); }   // (r2: after the load's warm-up, the first death's first steps)
  let least = Infinity; for (let r = 0; r < 10; r++) { const [x, y, z] = spots[r % spots.length]; rig.restore(); holder.position.set(x, y, z); holder.rotation.y = r; holder.updateMatrixWorld(true); rig.read(); R.applyKill(rig, { wid: 'ak', rg: [x, y + 7.9, z, Math.sin(r), 0, Math.cos(r)] }); rig.sim.freeStart(Wd);   // (as startRagdoll does: the death's one-off check of parts through a wall, before its steps)
    let st = 0; const b = allocOf(() => { for (let i = 0; i < 60 && !rig.sim.asleep; i++) { rig.sim.step(Wd); st++; } }); if (r > 1 && st) least = Math.min(least, b / st); }
  console.log('CS2ALLOC ' + least); process.exit(0); }
// (r2) the deepest any sample is into the world, as a fraction of its own full radius (sim.penetration measures half a radius)
const depthOf = (sim, world) => { const P = new Float64Array(4), C = new Float64Array(4); let m = 0; for (let s = 0; s < sim.NS; s++) { sim.sampleAt(s, P); if (world.contact(P[0], P[1], P[2], P[3], C)) m = Math.max(m, C[3] / P[3]); } return m; };

// ── the PHYS reader ──
{ const { parseKV3 } = await import('../tools/cs2-ragdoll/kv3.mjs'); const k = parseKV3('<!-- kv3 encoding:text:version{e21c7f3c} format:generic:version{7412167c} -->\n{\n\tm_a = [ 1.5, -2, 3e-2 ]\n\tm_b = { m_c = "x\\"y" m_d = true m_e = null }\n\tm_f = resource:"a/b.vmat"\n}');
  check('the KV3 reader (tools/cs2-ragdoll/kv3.mjs): header skipped, arrays, objects, strings, booleans, null, typed values', JSON.stringify(k) === JSON.stringify({ m_a: [1.5, -2, .03], m_b: { m_c: 'x"y', m_d: true, m_e: null }, m_f: 'a/b.vmat' }), JSON.stringify(k)); }

// ── the soldier on flat ground ──
WORLD = R.FLAT;
{ const s = soldier(0, 0, 0, 0), c0 = centre(s); die(s, 'S', { at: T, wid: 'ak', rg: [0, 7.9, -1, 0, 0, 1], z: 'chest' }); const head0 = headOf(s)?.getWorldPosition(new THREE.Vector3());
  let slept = -1; for (let t = 0; t < 8; t += 1 / 60) { T += 1000 / 60; s.update(1 / 60, { dead: true }); if (slept < 0 && R.activeRagdolls() === 0) slept = t; }
  const c1 = centre(s), low = lowest(s);
  check(`soldier, a body shot along +z: it settles and sleeps within ${SETTLE_S} s`, slept >= 0 && slept < SETTLE_S, slept.toFixed(2) + ' s');
  check('…lying down (its parts\' pivots near the ground), never under it', c1.y < 2.5 && low > -.15, `centre y ${c1.y.toFixed(2)}, lowest ${low.toFixed(3)}`);
  check('…pushed the way the bullet went (+z)', c1.z - c0.z > .3, (c1.z - c0.z).toFixed(2));
  const before = parts(s).map(o => o.getWorldPosition(new THREE.Vector3())); run(s, 1); const after = parts(s).map(o => o.getWorldPosition(new THREE.Vector3())); const jit = Math.max(...before.map((v, i) => v.distanceTo(after[i])));
  check('…asleep: no jitter, no creep (nothing moves over a further second)', jit < 1e-6, jit);
  GAME.combat.down = {}; s.update(1 / 60, { dead: false }); s.g.updateMatrixWorld(true); check('back alive: the parts return to the soldier (standing again)', centre(s).y > 3, centre(s).y); s.dispose(); }
// the direction of the push follows the bullet (four ways), and a blast pushes away from it
for (const [dx, dz] of [[1, 0], [-1, 0], [0, -1]]) { const s = soldier(0, 0, 0, 0), c0 = centre(s); die(s, 'S', { at: T, wid: 'ak', rg: [0, 7.9, 0, dx, 0, dz], z: 'chest' }); run(s, 3); const c = centre(s), m = (c.x - c0.x) * dx + (c.z - c0.z) * dz;
  check(`soldier pushed along (${dx}, ${dz}): it falls that way`, m > .3, m.toFixed(2)); s.dispose(); }
{ const s = soldier(0, 0, 0, 0), c0 = centre(s); die(s, 'S', { at: T, by: 'X', wid: 'he', nades: [{ kind: 'he', phase: 'boom', x: -3, y: .5, z: 0, firedAt: T }] }); run(s, 3); const c = centre(s); check('an HE blast at its left: thrown to the right (away from the blast)', c.x - c0.x > .5, (c.x - c0.x).toFixed(2)); s.dispose(); }
{ const s = soldier(0, 0, 0, 0), c0 = centre(s); die(s, 'S', { at: T, wid: 'molotov' }, 8, 0); run(s, 3); const c = centre(s); check('a running death (8 u/s along x, fire: no push): the body keeps its momentum', c.x - c0.x > .8, (c.x - c0.x).toFixed(2)); s.dispose(); }
{ const s = soldier(0, 0, 0, 0), h = headOf(s), p0 = h.getWorldPosition(new THREE.Vector3()), c0 = centre(s); die(s, 'S', { at: T, wid: 'ak', head: true, rg: [0, 10.2, -1, 0, 0, 1], z: 'head' }); run(s, .1); const p1 = h.getWorldPosition(new THREE.Vector3()), c1 = centre(s);
  check('a headshot: the head snaps back first (after 0.1 s it has moved more than the body, along the bullet)', p1.z - p0.z > 1.5 * Math.max(.01, c1.z - c0.z) && p1.z - p0.z > .05, [(p1.z - p0.z).toFixed(3), (c1.z - c0.z).toFixed(3)]); s.dispose(); }
// the same record → the same fall
{ const a = soldier(0, 0, 0, .3), b = soldier(0, 0, 0, .3), dn = { at: T, wid: 'deagle', rg: [0, 7.9, -1, .6, 0, .8], z: 'chest' }; die(a, 'S', dn); die(b, 'S', dn); for (let i = 0; i < 180; i++) { T += 1000 / 60; a.update(1 / 60, { dead: true }); b.update(1 / 60, { dead: true }); }
  const pa = parts(a).map(o => o.getWorldPosition(new THREE.Vector3())), pb = parts(b).map(o => o.getWorldPosition(new THREE.Vector3())); const d = Math.max(...pa.map((v, i) => v.distanceTo(pb[i])));
  check('the same host record → the same fall, step for step (every computer alike)', d < 1e-9, d); a.dispose(); b.dispose(); }
{ const s = soldier(0, 0, 0, 0); die(s, 'S', { at: T - 20000, wid: 'ak', rg: [0, 7.9, -1, 0, 0, 1] }); const sim = s.ragdoll.sim; let worst = sim.steps, frames = 1, hidden = !s.g.visible, prev = sim.steps;
  while (s.ragdoll.catching && frames < 400) { T += 1000 / 60; s.update(1 / 60, { dead: true }); worst = Math.max(worst, sim.steps - prev); prev = sim.steps; frames++; if (s.ragdoll.catching && s.g.visible) hidden = false; }
  const c = centre(s);
  check(`a body first seen 20 s after its death: caught up ${R.CATCH_STEPS} steps a frame at most (never hundreds in one frame), not drawn meanwhile, then lying and drawn (${frames} frames)`, worst <= R.CATCH_STEPS && hidden && !s.ragdoll.catching && s.g.visible && c.y < 2.5 && sim.steps * R.STEP <= R.MAX_S + 1e-9, `worst ${worst} steps a frame, hidden ${hidden}, centre y ${c.y.toFixed(2)}, ${sim.steps} steps`);
  GAME.combat.down = {}; s.update(1 / 60, { dead: false }); s.dispose(); }
// the cap
for (const [q, cap] of [['High', R.CAP], ['Low', R.CAP_LOW]]) { QUAL = q; const many = []; let fell = 0; for (let i = 0; i < cap + 2; i++) { const s = soldier(i * 30, 0, 0, 0, 'S' + i); GAME = { combat: { down: { ['s' + i]: { at: T, wid: 'ak', rg: [i * 30, 7.9, -1, 0, 0, 1] } }, nades: [] } }; s.update(1 / 60, { dead: true }); many.push(s); }
  check(`${q} preset: at most ${cap} ragdolls at once (spec: 10; Low ${R.CAP_LOW}), the rest fall the old way`, R.activeRagdolls() === cap, R.activeRagdolls()); many.forEach(s => { s.update(1 / 60, { dead: false }); s.dispose(); }); }
QUAL = 'High';
// no allocation per frame
{ // the check itself first: a frame that makes a small array and a string is caught
  let sink = 0; const bad = () => { for (let i = 0; i < 2000; i++) { const a = [1, 2, 3].map(x => x * 2); sink = (sink + a[1] + ('Foe' + i).toLowerCase().length) % 7; } };
  bad(); const db = allocOf(bad); check('the allocation check sees allocation (a frame making a 3-number array and a string, 2000 frames: > 100 KB)', db > 100000, db + ' bytes');
  // a soldier's ragdoll while it falls: 144 Hz frames on the host's clock (each frame 1/144 s: it really steps), its gun held()
  // hidden every frame; six deaths, each measured over its first 1.4 s
  const s = soldier(0, 0, 0, 0); let worst = Infinity, stepped = 0, det = '';
  for (let r = 0; r < 6; r++) { GAME = null; s.update(1 / 60, { dead: false }); die(s, 'S', { at: T, wid: 'ak', rg: [0, 7.9, -1, Math.sin(r), 0, Math.cos(r)] }); const st0 = s.ragdoll.sim.steps;
    const loop = () => { for (let i = 0; i < 200; i++) { T += 1000 / 144; s.update(DT144, DEAD); } }, base = () => { for (let i = 0; i < 200; i++) { T += 1000 / 144; hostNowFn(); } };
    base(); const b0 = allocOf(base), raw = allocOf(loop), dh = raw - b0; if (r) det = `${raw} bytes measured, the test's own clock alone ${b0}`; stepped = s.ragdoll.sim.steps - st0;   // (less the test's own clock: its number written and read each frame)
    if (r) worst = Math.min(worst, dh); }   // (the first death warms the code; the least of five: the steady cost a frame — a one-off recompile of the JIT is not a frame's)
  check(`an active ragdoll (stepped and posed every frame, 200 frames, ${stepped} steps) allocates nothing (< 2 KB over the test's own clock, measured with no collection in between)`, worst < 2048 && stepped > 60, det);
  for (let i = 0; i < 400; i++) { T += 1000 / 144; s.update(1 / 144, { dead: true }); } const asleep = s.ragdoll.sim.asleep; let da = 0, da0 = 0, dl = Infinity;
  for (let r = 0; r < 3; r++) { const c = allocOf(() => { for (let i = 0; i < 2000; i++) T += 1000 / 144; }), a = allocOf(() => { for (let i = 0; i < 2000; i++) { T += 1000 / 144; s.update(DT144, DEAD); } }); if (a - c < dl) { dl = a - c; da = a; da0 = c; } }   // (the least of three pairs: the heap counter's own noise is ~10 KB)
  check('…asleep: 2000 more frames allocate nothing either (under 8 bytes a frame over the test\'s own clock — less than one number)', asleep && dl < 16384, `${da} bytes measured, the test's own clock alone ${da0}`); s.update(1 / 60, { dead: false }); s.dispose(); }
// the host's kill record
{ const G = { mode: 'arena', arena: {}, combat: { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [] } }, ak = { id: 'ak', name: 'AK-47', dmg: 36, kind: 'rifle' };
  const r = CL.hurt(G, 'A', 'B', ak, 200, 'stomach', 5000); CL.bleed(G, 'B', r, 1, 6, 2, 0, 0, -1, 5000); const d = G.combat.down.b;
  check('the host puts the killing hit on the down record: rg (point, direction) and z (its hit group)', JSON.stringify(d.rg) === '[1,6,2,0,0,-1]' && d.z === 'stomach', JSON.stringify(d)); }
// built-in maps (boxes): deaths at the spawns never end inside a box or under the ground
{ const inBox = (bx, x, y, z) => bx.some(b => !b.off && b.mat !== 'clip' && x > b.minX + .05 && x < b.maxX - .05 && z > b.minZ + .05 && z < b.maxZ - .05 && y > b.y0 + .05 && y < b.y1 - .05);
  for (const id of ['dust2', 'inferno', 'nuke']) { const M = ARENA_MAPS[id]; if (!M || M.fromFile) { console.log('SKIP built-in ' + id); continue; } const cx = ARENA.cx, cz = ARENA.cz, boxes = mapBoxes(M, cx, cz), [W, D] = M.size; WORLD = R.mapWorld(boxes, { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 });
    let bad = 0, deaths = 0, slow = 0; for (const sp of [...(M.t || []), ...(M.ct || [])].slice(0, 8)) { const x = cx + sp[0], z = cz + sp[1], y = Number.isFinite(sp[2]) ? sp[2] : floorTop(boxes, x, z), yaw = rnd() * 6.28, a = rnd() * 6.28, s = soldier(x, y, z, yaw);
      die(s, 'S', { at: T, wid: 'ak', rg: [x, y + 7.9, z, Math.sin(a), 0, Math.cos(a)] }); let t = 0; for (; t < 8 && R.activeRagdolls(); t += 1 / 60) { T += 1000 / 60; s.update(1 / 60, { dead: true }); } deaths++; if (t > SETTLE_S) slow++;
      const sim = s.ragdoll.sim, P = new Float64Array(4); if (sim.forced) { slow++; FORCED.push(sim.speed.toFixed(2)); } for (let k = 0; k < sim.NS; k++) { sim.sampleAt(k, P); if (inBox(boxes, P[0], P[1], P[2]) || P[1] < -.2) bad++; } if (sim.penetration(WORLD) > .2) bad++;   // (its collision parts' centres: none inside a box or under the ground)
      s.update(1 / 60, { dead: false }); s.dispose(); }
    check(`${id} (built in, boxes): ${deaths} deaths at the spawns — every one settles, no part inside a box or under the ground`, deaths > 0 && !bad && !slow, `bad ${bad}, slow ${slow} (speeds when stopped: ${FORCED.splice(0).join(' ')})`); } }

// ── (FINISH pass) the time limit, the frame budget, a body in a smoke, a sleeping body ──
WORLD = R.FLAT;
{ const T0 = { mass: 20, invI: [1, 1, 1], samples: [[0, -.5, 0, .5], [0, .5, 0, .5]], linDamp: 0, angDamp: 2 }, mk = () => { const sm = R.createSim({ bodies: [T0, { ...T0, mass: 5 }], joints: [{ a: 0, b: 1, ra: [0, 1, 0], rb: [0, -1, 0], qa: [0, 0, 0, 1], qb: [0, 0, 0, 1], hinge: false, swing: .5, tmin: -.5, tmax: .5, fric: .3 }] }); sm.X.set([0, 3, 0, 0, 5, 0]); sm.Q.set([0, 0, 0, 1, 0, 0, 0, 1]); return sm; };
  const VOID = { contact: () => false, blocked: () => false }, nv = [Math.sin(1.05), Math.cos(1.05), 0];   // (no floor at all: a hole; a 60° face, steeper than any friction holds)
  const SLOPE = { contact(x, y, z, r, out) { const d = x * nv[0] + y * nv[1]; if (d >= r) return false; out[0] = nv[0]; out[1] = nv[1]; out[2] = 0; out[3] = r - d; return true; }, blocked(ax, ay, az, bx, by) { return ax * nv[0] + ay * nv[1] >= 0 && bx * nv[0] + by * nv[1] < 0; } };
  for (const [what, w] of [['falling into a hole (no floor)', VOID], ['sliding down a 60° face', SLOPE]]) { const sm = mk(); let k = 0; for (; k < 64 * 20 && !sm.asleep; k++) sm.step(w);
    check(`a body that never rests (${what}) is stopped at the time limit MAX_S (${R.MAX_S} s), marked forced`, sm.asleep && sm.forced === true && Math.abs(sm.steps * R.STEP - R.MAX_S) < R.STEP + 1e-9, `asleep ${sm.asleep}, forced ${sm.forced}, after ${(sm.steps * R.STEP).toFixed(2)} s`); } }
{ // many deaths at once: ragdollFrame() steps them all within FRAME_BUDGET a frame (lab.js calls it once a frame)
  const many = []; for (let i = 0; i < R.CAP; i++) { const s = soldier(i * 30, 0, 0, 0, 'B' + i); GAME = { combat: { down: { ['b' + i]: { at: T, wid: 'ak', rg: [i * 30, 7.9, -1, 0, 0, 1] } }, nades: [] } }; R.ragdollFrame(); s.update(1 / 60, { dead: true }); many.push(s); }
  let worst = 0, hid = 0, lag = 0; const sum = () => many.reduce((a, s) => a + s.ragdoll.sim.steps, 0), t0 = T;
  for (let f = 0; f < 30; f++) { T += 1000 / 30; const s0 = sum(); R.ragdollFrame(); worst = Math.max(worst, sum() - s0); for (const s of many) { s.update(1 / 30, { dead: true }); if (!s.g.visible || s.ragdoll.catching) hid++; lag = Math.max(lag, Math.floor((T - s.ragdoll.t0) / 1000 / R.STEP) - s.ragdoll.sim.steps); } }   // (30 fps: 10 bodies want ~21 steps a frame)
  check(`(r2) ${R.CAP} bodies falling at 30 fps: every body takes every step it is due each frame (${worst} steps in the busiest frame — the old 16-step budget left them behind and hidden), none ever hidden`, hid === 0 && lag <= 0 && worst > R.FRAME_BUDGET, `hidden ${hid} body-frames, worst lag ${lag} steps, ${worst} steps a frame`);
  for (let f = 0; f < 600 && R.activeRagdolls(); f++) { T += 1000 / 60; R.ragdollFrame(); for (const s of many) s.update(1 / 60, { dead: true }); }
  check('…and all of them come to rest all the same (the budget slows, never loses, a fall)', R.activeRagdolls() === 0 && many.every(s => s.ragdoll.sim.asleep && !s.ragdoll.sim.forced && centre(s).y < 2.5), R.activeRagdolls());
  many.forEach(s => { s.update(1 / 60, { dead: false }); s.dispose(); }); }
{ // (r2) several bodies first seen 20 s after their deaths at once: they share the catch-up budget, hidden meanwhile
  const late = []; for (let i = 0; i < 6; i++) { const s = soldier(i * 30, 0, 40, 0, 'L' + i); GAME = { combat: { down: { ['l' + i]: { at: T - 20000, wid: 'ak', rg: [i * 30, 7.9, 39, 0, 0, 1] } }, nades: [] } }; R.ragdollFrame(); s.update(1 / 60, { dead: true }); late.push(s); }
  let worst = 0, each = 0, shown = false, frames = 0; const sum = () => late.reduce((a, s) => a + s.ragdoll.sim.steps, 0);
  while (late.some(s => s.ragdoll.catching) && frames < 2000) { T += 1000 / 60; const st = late.map(s => s.ragdoll.sim.steps), s0 = sum(); R.ragdollFrame(); for (const s of late) s.update(1 / 60, { dead: true }); worst = Math.max(worst, sum() - s0); late.forEach((s, i) => { each = Math.max(each, s.ragdoll.sim.steps - st[i]); if (s.ragdoll.catching && s.g.visible) shown = true; }); frames++; }
  check(`(r2) six bodies first seen 20 s late: at most FRAME_BUDGET (${R.FRAME_BUDGET}) catch-up steps a frame for all, ${R.CATCH_STEPS} each, hidden until caught up, then all drawn`, worst <= R.FRAME_BUDGET && each <= R.CATCH_STEPS && !shown && late.every(s => s.g.visible && !s.ragdoll.catching), `worst ${worst}, each ${each}, shown while catching ${shown}, ${frames} frames`);
  late.forEach(s => { s.update(1 / 60, { dead: false }); s.dispose(); }); }
{ // (r2) the cap: a death past it puts only a SETTLING body to sleep — never one still falling
  const many = []; for (let i = 0; i < R.CAP; i++) { const s = soldier(i * 30, 0, 80, 0, 'C' + i); GAME = { combat: { down: { ['c' + i]: { at: T, wid: 'ak', rg: [i * 30, 7.9, 79, 0, 0, 1] } }, nades: [] } }; R.ragdollFrame(); s.update(1 / 60, { dead: true }); many.push(s); }
  for (let f = 0; f < 12; f++) { T += 1000 / 60; R.ragdollFrame(); for (const s of many) s.update(1 / 60, { dead: true }); }   // (0.2 s: all still falling)
  const x = soldier(400, 0, 80, 0, 'CX'); GAME = { combat: { down: { cx: { at: T, wid: 'ak', rg: [400, 7.9, 79, 0, 0, 1] } }, nades: [] } }; R.ragdollFrame(); x.update(1 / 60, { dead: true });
  const frozen = many.filter(s => s.ragdoll.sim.asleep).length, oldWay = !x.ragdoll.active;
  for (let f = 0; f < 400 && many.some(s => !s.ragdoll.sim.asleep && s.ragdoll.sim.speed >= R.SLEEP_V * 4); f++) { T += 1000 / 60; R.ragdollFrame(); for (const s of many) s.update(1 / 60, { dead: true }); }
  const settling = many.filter(s => !s.ragdoll.sim.asleep); x.update(1 / 60, { dead: false }); GAME = { combat: { down: { cx: { at: T, wid: 'ak', rg: [400, 7.9, 79, 0, 0, 1] } }, nades: [] } }; x.update(1 / 60, { dead: true });
  const slept = many.filter(s => s.ragdoll.sim.asleep && settling.includes(s)), sp = slept.map(s => s.ragdoll.sim.speed);
  check('(r2) past the cap with all ten still falling (0.2 s in): none is frozen mid-fall — the new death falls the old way', frozen === 0 && oldWay, `frozen ${frozen}, new one ragdolled ${!oldWay}`);
  check('(r2) …once they settle, a new death puts the slowest settling one to sleep (it was only trembling: < 4 × SLEEP_V) and gets its ragdoll', !settling.length || (x.ragdoll.active && slept.length === 1 && sp[0] < R.SLEEP_V * 4), `settling ${settling.length}, slept ${slept.length} at ${sp.map(v => v.toFixed(2))} u/s, new active ${x.ragdoll.active}`);
  [...many, x].forEach(s => { s.update(1 / 60, { dead: false }); s.dispose(); }); }
{ // (r2) the same record on a Low and a High computer: the same fall (one solver; Low only sleeps sooner)
  const lie = q => { QUAL = q; const s = soldier(0, 0, 0, .7); die(s, 'S', { at: T, wid: 'deagle', rg: [0, 7.9, -1, .6, 0, .8], z: 'chest' }); for (let f = 0; f < 600 && R.activeRagdolls(); f++) { T += 1000 / 60; R.ragdollFrame(); s.update(1 / 60, { dead: true }); } const p = parts(s).map(o => o.getWorldPosition(new THREE.Vector3())); s.update(1 / 60, { dead: false }); s.dispose(); return p; };
  const hi = lie('High'), lo = lie('Low'); QUAL = 'High'; const d = Math.max(...hi.map((v, i) => v.distanceTo(lo[i])));
  check('(r2) a Low preset computer draws the same death as a High one (the same substeps; it was up to 17 HU apart)', d < .05, d.toFixed(4) + ' u apart'); }
{ // (r2) a death in a jump keeps its vertical speed
  const rise = vy => { const s = soldier(0, 0, 0, 0); GAME = { combat: { down: { s: { at: T, wid: 'molotov' } }, nades: [] } }; s.update(1 / 60, { dead: true, vy }); const c0 = centre(s).y; for (let f = 0; f < 9; f++) { T += 1000 / 60; s.update(1 / 60, { dead: true }); } const c = centre(s).y - c0; s.update(1 / 60, { dead: false }); s.dispose(); return c; };
  const up = rise(25), still = rise(0); check('(r2) died in a jump (25 u/s up, fire: no push): the body still rises at first — its vertical momentum kept (it was dropped)', up > .5 && up - still > 1.5, [up.toFixed(2), still.toFixed(2)]); }
{ // (r2) under a converted map's gap: the map's lowest surface (nadeMesh.minY) holds the body
  const hole = { nadeMesh: { minY: -5, contact: () => false, blocked: () => false }, movers: [] }, W2 = R.mapWorld(hole, null); WORLD = W2;
  const s = soldier(0, 20, 0, 0); die(s, 'S', { at: T, wid: 'ak', rg: [0, 27.9, -1, 0, 0, 1] }); for (let f = 0; f < 600 && R.activeRagdolls(); f++) { T += 1000 / 60; s.update(1 / 60, { dead: true }); }
  const sim = s.ragdoll.sim, P = new Float64Array(4); let low = Infinity; for (let k = 0; k < sim.NS; k++) { sim.sampleAt(k, P); low = Math.min(low, P[1] - P[3]); }   // (its collision parts' lowest point)
  check('(r2) a body that finds a gap in the map\'s triangles rests on the map\'s lowest surface — not falling for MAX_S', sim.asleep && !sim.forced && low > -5.1 && low < -4.5, `asleep ${sim.asleep}, forced ${sim.forced}, its parts' lowest ${low.toFixed(2)} (the surface −5)`); s.update(1 / 60, { dead: false }); s.dispose(); WORLD = R.FLAT; }
{ // (r2) a body that starts sunk in the floor (a foot in a stair's tread, a body drawn a little low): eased out, never thrown
  const s = soldier(0, -1.2, 0, 0); const c0 = centre(s); die(s, 'S', { at: T, wid: 'molotov' }); let top = 0, fast = 0;
  for (let f = 0; f < 600 && R.activeRagdolls(); f++) { T += 1000 / 60; s.update(1 / 60, { dead: true }); const c = centre(s); top = Math.max(top, c.y - c0.y); fast = Math.max(fast, s.ragdoll.sim.speed); }
  const P = new Float64Array(4), sim = s.ragdoll.sim; let low = Infinity; for (let k = 0; k < sim.NS; k++) { sim.sampleAt(k, P); low = Math.min(low, P[1] - P[3]); }
  check(`(r2) a body that starts 1.2 u sunk in the floor is eased out (pushed out at most DEPEN_V = ${R.DEPEN_V} u/s), not thrown — it rose ${top.toFixed(2)} u at most, and lies on the floor`, top < 1.5 && low > -.1 && sim.asleep && !sim.forced, `rose ${top.toFixed(2)}, fastest ${fast.toFixed(1)} u/s, lowest ${low.toFixed(2)}`); s.update(1 / 60, { dead: false }); s.dispose(); }
{ // (r2) a part that starts through a thin wall (an arm against a door) comes back out of it, and the body rests
  const s = soldier(0, 0, 0, 0); s.g.updateMatrixWorld(true); const torso = parts(s).find(o => o.children.some(c => c.isMesh)); const P = {}; s.g.traverse(o => { if (o.isGroup) { const v = o.getWorldPosition(new THREE.Vector3()); if (!P.r || v.x < P.r.x) P.r = v; } });
  const tx = torso.getWorldPosition(new THREE.Vector3()).x, wx = (tx + P.r.x) / 2, wall = [{ minX: wx - .1, maxX: wx + .1, minZ: -20, maxZ: 20, y0: 0, y1: 30, mat: 'concrete', walk: false, off: false }];
  WORLD = R.mapWorld(wall, null); die(s, 'S', { at: T, wid: 'ak', rg: [0, 7.9, -1, 1, 0, 0], z: 'chest' }); T += 1000 / 60; R.ragdollFrame(); s.update(1 / 60, { dead: true }); const freed = s.ragdoll.sim.freed;
  for (let f = 0; f < 600 && R.activeRagdolls(); f++) { T += 1000 / 60; R.ragdollFrame(); s.update(1 / 60, { dead: true }); } const sim = s.ragdoll.sim;
  check('(r2) an arm that starts through a thin wall: freed from the wall until it is back on the body\'s side, and the body comes to rest (it was pinned there until the time limit)', freed > 0 && sim.asleep && !sim.forced && sim.freed === 0, `freed at start ${freed}, now ${sim.freed}, asleep ${sim.asleep}, forced ${sim.forced}, wall at x ${wx.toFixed(2)} (torso ${tx.toFixed(2)}, the far hand ${P.r.x.toFixed(2)})`);
  s.update(1 / 60, { dead: false }); s.dispose(); WORLD = R.FLAT; }
{ // a body that dies in view, then is hidden by a smoke (multiplayer.js stops calling its update): it keeps falling
  const a = soldier(0, 0, 0, .3), b = soldier(0, 0, 0, .3), dn = { at: T, wid: 'ak', rg: [0, 7.9, -1, .6, 0, .8], z: 'chest' }; GAME = { combat: { down: { s: dn }, nades: [] } };
  R.ragdollFrame(); a.update(1 / 60, { dead: true }); b.update(1 / 60, { dead: true });
  let worst = 0; for (let f = 0; f < 120; f++) { T += 1000 / 60; const st = b.ragdoll.sim.steps; R.ragdollFrame(); worst = Math.max(worst, b.ragdoll.sim.steps - st); a.update(1 / 60, { dead: true }); if (f < 5 || f > 100) b.update(1 / 60, { dead: true }); }   // (b hidden 1.6 s)
  const pa = parts(a).map(o => o.getWorldPosition(new THREE.Vector3())), pb = parts(b).map(o => o.getWorldPosition(new THREE.Vector3())), d = Math.max(...pa.map((v, i) => v.distanceTo(pb[i])));
  check('a body hidden in a smoke while it falls keeps falling (stepped once a frame by ragdollFrame): seen again, it lies exactly where one always seen lies, with no catch-up burst', d < 1e-9 && worst <= R.MAX_STEPS_FRAME, `apart ${d}, worst ${worst} steps a frame`);
  // asleep: its pose not written again (a sleeping body costs nothing a frame)
  for (let f = 0; f < 600 && !a.ragdoll.sim.asleep; f++) { T += 1000 / 60; R.ragdollFrame(); a.update(1 / 60, { dead: true }); } let writes = 0; const w0 = a.ragdoll.write; a.ragdoll.write = () => { writes++; w0(); };
  for (let f = 0; f < 60; f++) { T += 1000 / 60; R.ragdollFrame(); a.update(1 / 60, { dead: true }); } a.ragdoll.write = w0;
  check('asleep: its pose is not written again (60 frames, no re-posing of a body that lies still)', a.ragdoll.sim.asleep && writes === 0, writes);
  // (r2) its holder (the player's group) moves after the death — drawn walking back to where the host has the dead player:
  // the body stays where it fell in the world (it went with the group: 42 u on Dust II's stairs)
  { const before = a.ragdoll.nodes.map(o => o.getWorldPosition(new THREE.Vector3())), hold = a.g.parent; hold.position.x += 30; hold.position.z -= 12; hold.updateMatrixWorld(true); T += 1000 / 60; R.ragdollFrame(); a.update(1 / 60, { dead: true }); a.g.updateMatrixWorld(true);
    const after = a.ragdoll.nodes.map(o => o.getWorldPosition(new THREE.Vector3())), d = Math.max(...before.map((v, i) => v.distanceTo(after[i])));
    check('(r2) the dead player\'s group moves 32 u after the death: the body (its eight parts) stays where it lies in the world', d < 1e-6, d); hold.position.x -= 30; hold.position.z += 12; hold.updateMatrixWorld(true); }
  GAME = null; a.update(1 / 60, { dead: false }); b.update(1 / 60, { dead: false }); a.dispose(); b.dispose(); }

// ── CS2's own ragdoll on the CS2 agent, and the sweep on CS2 maps ──
const A = 'user-assets/agents/cs2_ct.glb', RJ = 'user-assets/ragdoll/cs2-ragdoll.json';
if (!existsSync(A) || !existsSync(RJ)) console.log('SKIP (CS2): no CS2 agent or ragdoll import on this computer (tools/import-cs2-models.mjs, tools/import-cs2-ragdoll.mjs)');
else {
  const { gltfLoader } = await import('../dist/gltf-loader.js'); const buf = readFileSync(A); const glb = await new Promise((res, rej) => gltfLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
  const data = JSON.parse(readFileSync(RJ, 'utf8')); R.useCs2Ragdolls(data); const def = data.sides.ct;
  const holder = new THREE.Group(); holder.scale.setScalar(100 / 16.5); holder.add(glb.scene); holder.updateMatrixWorld(true);
  const B = {}; glb.scene.traverse(o => { if (o.isBone) B[o.name.toLowerCase()] = o; });
  // its joints at the bind pose
  { const names = def.bodies.map(b => b.bone), wq = n => B[n].getWorldQuaternion(new THREE.Quaternion()); let worst = 0, gap = 0;
    for (const j of def.joints) { const Aq = wq(names[j.a]).multiply(new THREE.Quaternion(...j.f1.slice(3))), Bq = wq(names[j.b]).multiply(new THREE.Quaternion(...j.f2.slice(3))); worst = Math.max(worst, Aq.angleTo(Bq));
      const pa = new THREE.Vector3(...j.f1.slice(0, 3)).multiplyScalar(.0254).applyMatrix4(B[names[j.a]].matrixWorld), pb = new THREE.Vector3(...j.f2.slice(0, 3)).multiplyScalar(.0254).applyMatrix4(B[names[j.b]].matrixWorld); gap = Math.max(gap, pa.distanceTo(pb)); }
    check(`CS2's ragdoll (${def.bodies.length} bodies, ${def.joints.length} joints): at the agent's bind pose every joint is at rest — its two frames agree (worst ${(worst * 57.3).toFixed(3)}°, gap ${gap.toFixed(4)} u)`, def.bodies.length === 15 && def.joints.length === 14 && worst < .02 && gap < .01); }
  const rig = R.agentRig(glb.scene, 'ct', 'tpl', THREE); check('the agent\'s rig is CS2\'s own (imported), not ours', rig?.cs2 === true);
  const order = []; { let rb = B.pelvis; while (rb.parent?.isBone) rb = rb.parent; rb.traverse(o => { if (o.isBone) order.push(o); }); }
  const restL = order.map(o => [o.position.clone(), o.quaternion.clone()]); const resetPose = () => order.forEach((o, i) => { o.position.copy(restL[i][0]); o.quaternion.copy(restL[i][1]); });
  const dir = argvDir(); function argvDir() { return 'user-maps'; }
  const files = existsSync(dir) ? ['dust2', 'mirage', 'inferno'].filter(id => FILE_MAP_IDS.includes(id) && existsSync(`${dir}/${id}.bsp`)) : []; CS2_FILES.push(...files);
  if (!files.length) console.log('SKIP (CS2 maps): no converted CS2 maps in ' + dir);
  const P4 = new Float64Array(4), Q4 = new Float64Array(4), sim0 = rg => { rg.sim.sub = R.SUB; rg.sim.sleepS = R.SLEEP_S; };
  for (const id of files) { const buf2 = readFileSync(`${dir}/${id}.bsp`); if (buf2.subarray(0, 4).toString() !== 'CS2M') { console.log('SKIP ' + id + ': not a CS2 map file'); continue; }
    useMapFile(id, buf2); const M = ARENA_MAPS[id], cx = ARENA.cx, cz = ARENA.cz, boxes = mapBoxes(M, cx, cz), NM = boxes.nadeMesh; if (!NM) { console.log('SKIP ' + id + ': no mesh'); continue; }
    const [W, D] = M.size, Gd = M.grid; WORLD = R.mapWorld(boxes, { minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 });
    const spots = []; let tries = 0; while (spots.length < SPOTS && tries++ < 60000) { const i = (rnd() * Gd.cells.length) | 0; if (Gd.cells[i] !== 1) continue; const x = cx - W / 2 + (i % Gd.cols + .5) * Gd.cell, z = cz - D / 2 + (((i / Gd.cols) | 0) + .5) * Gd.cell, y = Gd.heights[i];
      if (!Number.isFinite(y) || NM.contact(x, y + 6, z, 2.6, P4) || NM.contact(x, y + 2.2, z, 2, P4) || !NM.blocked(x, y + 1, z, x, y - 1, z)) continue; spots.push([x, y, z]); }   // (room for a standing body, a floor right under its feet)
    for (const pre of ['High', 'Low']) {   // (r2: both presets — Low sleeps sooner; its own 4 substeps were never swept before)
    let slow = 0, inWall = 0, crossed = 0, worstPen = 0, steps = 0; const t0 = Date.now(), PF = new Uint8Array(64);
    for (const [x, y, z] of spots) { resetPose(); holder.position.set(x, y, z); holder.rotation.y = rnd() * 6.28; holder.updateMatrixWorld(true); const a = rnd() * 6.28, sim = rig.sim;
      rig.read(); sim.sub = R.SUB; sim.sleepS = pre === 'Low' ? R.SLEEP_S_LOW : R.SLEEP_S; R.applyKill(rig, { wid: rnd() < .5 ? 'ak' : 'sniper', rg: [x, y + 7.9, z, Math.sin(a), rnd() * .4 - .2, Math.cos(a)], z: rnd() < .3 ? 'head' : 'chest', head: false }, Math.sin(a) * rnd() * 30, 0, Math.cos(a) * rnd() * 30);
      const prev = new Float64Array(sim.NS * 3); for (let s = 0; s < sim.NS; s++) { sim.sampleAt(s, P4); prev[s * 3] = P4[0]; prev[s * 3 + 1] = P4[1]; prev[s * 3 + 2] = P4[2]; }
      PF.fill(0); for (let guard = 0; !sim.asleep && guard <= Math.ceil(R.MAX_S / R.STEP) + 1; guard++) { sim.step(WORLD); steps++; for (let s = 0; s < sim.NS; s++) { sim.sampleAt(s, P4); const free = PF[s] || sim.isFree(s); PF[s] = sim.isFree(s) ? 1 : 0; if (!free && NM.blocked(prev[s * 3], prev[s * 3 + 1], prev[s * 3 + 2], P4[0], P4[1], P4[2])) crossed++; prev[s * 3] = P4[0]; prev[s * 3 + 1] = P4[1]; prev[s * 3 + 2] = P4[2]; } }   // (a part that started through a wall — freed — may cross it once, coming back)
      if (!sim.asleep || sim.forced || sim.steps * R.STEP > SETTLE_S) { slow++; FORCED.push(sim.speed.toFixed(2)); } const pen = depthOf(sim, WORLD); worstPen = Math.max(worstPen, pen); if (pen > .25) inWall++; }
    check(`${id} (CS2 map, its own triangles, ${pre} preset): ${spots.length} deaths at random spots, facings and hits — all asleep within ${SETTLE_S} s, no part in a wall or under a floor (deepest ${worstPen.toFixed(3)} of a part's full radius), no step of any part through a surface`, spots.length >= SPOTS / 2 && !slow && !inWall && !crossed, `slow ${slow} (speeds when stopped: ${FORCED.splice(0).join(' ')}) · in a wall ${inWall} · crossings ${crossed} · ${steps} steps in ${Date.now() - t0} ms`); } }
}
// CS2's ragdoll on a CS2 map, allocation a step: measured in a fresh process (a CS2-map session: the solver, the map's mesh
// and doors; this file's built-in-map checks above leave the shared code's type feedback mixed — box objects of other
// shapes — which a CS2 session never sees)
if (CS2_FILES.length) { const r = spawnSync(process.execPath, ['--expose-gc', '--max-semi-space-size=64', '--min-semi-space-size=64', fileURLToPath(import.meta.url), '--cs2-alloc', CS2_FILES[0]], { encoding: 'utf8' }); const m = /CS2ALLOC (\S+)/.exec(r.stdout || ''), f = /CS2FIRST (\S+)/.exec(r.stdout || '');
  check(`(r2) after warmRagdolls() on ${CS2_FILES[0]} (the load's warm-up, a fresh process), the first CS2 death's first steps are cheap (${f ? (+f[1]).toFixed(2) : '?'} ms, worst of 4 — 13–43 ms in one frame before)`, !!f && +f[1] < 3, f ? f[1] : (r.stderr || '').slice(-300));
  check(`CS2's ragdoll on ${CS2_FILES[0]}'s own triangles allocates nothing a step (${m ? (+m[1]).toFixed(0) : '?'} bytes a step, the least of eight falls after two to warm — r2: eight, as V8 re-tiers its code once in a fresh process's early falls (one fall of falls 3–5 runs deoptimised, seen with and without the warm-up); ~45 KB before the FINISH pass)`, !!m && +m[1] < 64, m ? m[1] : (r.stderr || '').slice(-300)); }
console.log(ok === n ? `PASS: gd-ragdoll · ${n} checks (settles and sleeps, floor and walls, force direction, headshot, blast, momentum, same record same fall, late body caught up a few steps a frame, cap, no allocation, kill record, built-in maps, time limit, frame budget, smoke-hidden fall, sleeping bodies not re-posed; CS2's ragdoll and 3 CS2 maps when imported)` : `FAIL: gd-ragdoll · ${n - ok} of ${n} failed`);
process.exit(ok === n ? 0 : 1);
