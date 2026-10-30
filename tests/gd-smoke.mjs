// Global Defensive smoke — one rule for the screen, the bots, the radar and the remote players' models (arena-nades.js):
//   · the rule is the screen's own transmittance: smokeSeen = e^(−SMOKE.k · ∫density), blocked below SMOKE.see — a
//     player a few units inside a cloud's edge is hidden from the rules too (the old 14-unit rule saw him 13 deep);
//   · clouds add up: the same answer whatever their order, overlapping edges that each let light through block together;
//   · the same both ways (inside → out as outside → in); deep inside, nothing is seen; at the very edge, looking out, it is;
//   · HE holes are bounded (the last three, never past their reach) and temporary (~2 s); bullet tunnels too (the last
//     TUNNEL.max shots, closed within ~1.2 s, never wider than their radius);
//   · host and client agree exactly: the client (its own copy of the module, its own map state — a door opened since the
//     smoke popped) gets the host's state over the wire and computes the same depths (the doors stamped at the pop);
//   · the view (arena-nades-view.js + arena-smoke-pass.js): one atlas slot per cloud with the rules' own bytes, freed when
//     the smoke ends and on leaving the match (VIEW-CLEAR); the molotov's floor glow is not the hall's detail culler's
//     to hide (GDUI-07); a rules query costs a few microseconds (SMK-CPU).
import assert from 'node:assert/strict';
import * as THREE from '../dist/three.module.js';
import { NADES, SMOKE, TUNNEL, LOCAL_CUTS, HOLE_OUT, smokeBlocks, smokeSeen, smokeDepth, smokeDensity, smokeCut, smokeLocalCut, smokeCutsNow, smokeVoxels, smokeHoleBytes, nadesTick, setSmokeSolids, holeRadius, smokeHides, smokeUp, BODY, HULL, cutShots } from '../dist/arena-nades.js';
import { createSmokePass, SLOTS, SMOKE_QUALITY } from '../dist/arena-smoke-pass.js';
const CLIENT = await import('../dist/arena-nades.js?client');   // (another page: its own caches, its own map state)
const B = (minX, maxX, minZ, maxZ, y0, y1, extra = {}) => ({ minX, maxX, minZ, maxZ, y0, y1, ...extra });
const solids = g => g.testBoxes || null; setSmokeSolids(solids); CLIENT.setSmokeSolids(solids);
const T0 = 5e9, now = T0 + 4000, eye = 9.7, R = NADES.smoke.radius, ok = [];
const open = () => { const b = [B(-300, 300, -300, 300, -4, 0)]; b.movers = []; return b; };   // (a floor, nothing else: the cloud as in the open)
const smoke = (id, x, z, extra = {}) => ({ id, kind: 'smoke', phase: 'smoke', x, y: 0, z, firedAt: T0, ...extra });
const game = (nades, boxes = open()) => ({ levels: {}, testBoxes: boxes, combat: { nades, hp: {}, down: {}, clock: now }, arena: { bots: [] } });
const rnd = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const seg = (span = 70) => [(rnd() - .5) * 2 * span, 1 + rnd() * 16, (rnd() - .5) * 2 * span, (rnd() - .5) * 2 * span, 1 + rnd() * 16, (rnd() - .5) * 2 * span];

// ── SMK-RULES: the rule is what the screen shows ──
{ const g = game([smoke('a', 0, 0)]); assert(SMOKE.k > 0 && SMOKE.see > 0 && SMOKE.see < .05 && Math.abs(SMOKE.block - Math.log(1 / SMOKE.see) / SMOKE.k) < 1e-9, 'one figure: blocked = less than SMOKE.see of the light through');
  for (let i = 0; i < 300; i++) { const q = seg(); const d = smokeDepth(g, ...q, now), seen = smokeSeen(g, ...q, now);
    assert(Math.abs(seen - Math.exp(-SMOKE.k * d)) < 1e-12, 'smokeSeen = e^(−k·depth)'); if (Math.abs(seen - SMOKE.see) > 1e-6) assert.equal(smokeBlocks(g, ...q, now), seen < SMOKE.see, 'blocked exactly when the screen lets less than SMOKE.see through'); }
  let edge = null; for (let x = -60; x < 0; x += .25) if (smokeDensity(g, x, eye, 0, now) > .5) { edge = x; break; }
  assert(edge !== null && edge > -R - 2 && edge < -R * .5, 'the cloud\'s edge (half density) along x at eye height · ' + edge);
  assert(!smokeBlocks(g, -80, eye, 0, edge + .5, eye, 0, now), 'someone at the very edge is seen');
  for (const deep of [6, 9, 13]) assert(smokeBlocks(g, -80, eye, 0, edge + deep, eye, 0, now), `someone ${deep} units inside the edge is hidden (the old rule saw him up to 13 deep)`);
  assert(smokeSeen(g, 0, eye, 0, 0, eye, 10, now) < SMOKE.see && smokeSeen(g, 0, eye, 0, 10, eye, 0, now) < SMOKE.see, 'deep inside: nothing 10 units away is seen (opaque, not a dimmed world)');
  assert(smokeBlocks(g, 0, eye, 0, -80, eye, 0, now) && !smokeBlocks(g, edge + .5, eye, 0, -80, eye, 0, now), 'from the middle you cannot see out; at the very edge, looking out, you can');
  for (let i = 0; i < 300; i++) { const q = seg(); assert.equal(smokeBlocks(g, ...q, now), smokeBlocks(g, q[3], q[4], q[5], q[0], q[1], q[2], now), 'the same both ways'); }
  // a player is hidden only when all of him is (head, chest, knees): one standing behind the cloud is; one whose head is
  // above its top is not (the radar spots him, his model is drawn) — standing or crouched, from the same body points
  assert(smokeHides(g, -80, eye, 0, 40, 0, 0) && smokeHides(g, -80, eye, 0, 40, 0, 0, true), 'behind the cloud: hidden (standing and crouched)');
  let peek = null; for (let fy = 0; fy < 60 && !peek; fy += .5) if (smokeBlocks(g, -80, eye + fy, 0, 40, fy + BODY[2] * HULL, 0, now) && !smokeBlocks(g, -80, eye + fy, 0, 40, fy + BODY[0] * HULL, 0, now)) peek = fy;
  assert(peek !== null && !smokeHides(g, -80, eye + peek, 0, 40, peek, 0, false, now), 'his head above the cloud\'s top: seen (though his knees are not) · ' + peek);
  assert(!smokeUp(game([])) && smokeUp(g), 'smokeUp');
  ok.push('the rule = the screen (e^(−k·depth) < see), 6–13 units in hidden, edge seen, the same both ways, all of him or seen'); }

// ── SMK-ORDER / overlap: clouds add, order never matters ──
{ const A = smoke('a', 0, 0), Bs = smoke('b', 34, 6), gAB = game([A, Bs]), gBA = game([{ ...Bs }, { ...A }]); let worst = 0;
  for (let i = 0; i < 400; i++) { const q = seg(90); const a = smokeDepth(gAB, ...q, now), b = smokeDepth(gBA, ...q, now); worst = Math.max(worst, Math.abs(a - b)); assert.equal(smokeBlocks(gAB, ...q, now), smokeBlocks(gBA, ...q, now), 'the same answer whatever the order'); }
  assert(worst < 1e-9, 'the same depth whatever the order · ' + worst);
  // a line through the thin edges of both (over the top of the overlap): each alone lets light through, both together don't
  const gA = game([smoke('a', 0, 0)]), gB = game([smoke('b', 34, 6)]); let found = null;
  for (let y = 4; y < 40 && !found; y += .5) for (let off = -12; off < 18 && !found; off += 1) { const q = [-60, y, off, 100, y, off + 12];
    const a = smokeDepth(gA, ...q, now), b = smokeDepth(gB, ...q, now), ab = smokeDepth(gAB, ...q, now); if (a < SMOKE.block * .9 && b < SMOKE.block * .9 && ab > SMOKE.block * 1.05) found = { y, off, a, b, ab, blocked: smokeBlocks(gAB, ...q, now) && !smokeBlocks(gA, ...q, now) && !smokeBlocks(gB, ...q, now) }; }
  assert(found?.blocked, 'two thin edges that each let light through block together · ' + JSON.stringify(found));
  ok.push('overlapping clouds add (order-free, edges together block)'); }

// ── HE holes: bounded and temporary (SMOKE.holeR, ~2 s; the last three) ──
{ const s = smoke('h', 0, 0), g = game([s]); const he = (id, x, z, t) => { g.combat.nades.push({ id, kind: 'he', phase: 'air', x, y: .3, z, vx: 0, vy: 0, vz: 0, at: t - NADES.he.fuse - 10, still: 0 }); nadesTick(g, [], .05, t, {}); };
  const t1 = T0 + 3000; he('h1', 0, 0, t1); const across = t => smokeBlocks(g, -80, eye, 0, 80, eye, 0, t);
  assert(s.holes?.length === 1 && !across(t1 + 300), 'an HE in the middle clears the cloud for a moment');
  assert(across(t1 + SMOKE.holeGrow + SMOKE.holeOpen + SMOKE.holeClose + 100), '…and it is whole again about two seconds later');
  assert(Math.abs(SMOKE.holeGrow + SMOKE.holeOpen + SMOKE.holeClose - 2000) <= 250 && holeRadius({ at: 0 }, 1e9) === 0, 'about two seconds, then nothing');
  for (let i = 0; i < 5; i++) he('hx' + i, (i - 2) * 6, 0, t1 + 4000 + i * 200); assert(s.holes.length <= 3, 'only the last three holes are kept · ' + s.holes.length);
  const gs = game([smoke('h2', 0, 0)]), s2 = gs.combat.nades[0], t2 = T0 + 3000; gs.combat.nades.push({ id: 'side', kind: 'he', phase: 'air', x: -R, y: .3, z: 0, vx: 0, vy: 0, vz: 0, at: t2 - NADES.he.fuse - 10, still: 0 }); nadesTick(gs, [], .05, t2, {});
  const reach = SMOKE.holeR * HOLE_OUT; let far = 0; for (let x = -R + reach + 2; x < R; x += 1) far = Math.max(far, smokeDensity(gs, x, 4, 0, t2 + 400));
  assert(s2.holes?.length === 1 && smokeDensity(gs, -R + 4, 4, 0, t2 + 400) < .05 && far > .5, 'an HE at the side clears round it, never past its reach · far ' + far.toFixed(2));
  ok.push('HE holes bounded (3, their reach) and temporary (~2 s)'); }

// ── TUNNEL-RULES: bullet tunnels — the host's state, bounded, temporary, the same on every client ──
{ LOCAL_CUTS.length = 0; const s = smoke('t', 0, 0), g = game([s]), t = T0 + 4000; g.combat.clock = t;
  const along = (gm, T, dz = 0, mod = { smokeBlocks }) => mod.smokeBlocks(gm, -80, eye, dz, 80, eye, dz, T);
  assert(along(g, t), 'blocked before the shot');
  assert(smokeCut(g, -80, eye, 0, 1, 0, 0, 200, t) && g.combat.cuts?.length === 1, 'a shot through the smoke cuts a tunnel (host state)');
  assert(!along(g, t + 100) && along(g, t + 100, TUNNEL.radius * 2.5), 'through the tunnel you see; a line beside it stays blocked');
  assert(along(g, t + TUNNEL.open + TUNNEL.close + 50), 'it fills in again (~' + (TUNNEL.open + TUNNEL.close) + ' ms)');
  assert(!smokeCut(g, -80, eye, 60, 1, 0, 0, 200, t) && g.combat.cuts.length === 1, 'a shot that misses every smoke cuts nothing');
  for (let i = 0; i < 20; i++) smokeCut(g, -80, eye, (i % 5) - 2, 1, 0, 0, 200, t + 300 + i * 10); assert(g.combat.cuts.length <= TUNNEL.max, 'the host keeps the last TUNNEL.max shots · ' + g.combat.cuts.length);
  // the client: the host's state over the wire, its own module — the same answer at the same host time
  const c = JSON.parse(JSON.stringify(g)); c.testBoxes = open(); for (const T of [t + 320, t + 500, t + 900, t + 1400, t + 2000]) for (const dz of [-2, 0, 1, 3]) assert.equal(along(c, T, dz, CLIENT), along(g, T, dz), 'client and host agree on the tunnels · ' + T + ' ' + dz);
  // your own shot shows at once (before the host's copy), then is the host's (never counted twice)
  const g2 = game([smoke('t2', 0, 0)]); assert(along(g2, t) && smokeCutsNow(g2, t) === 0); smokeLocalCut(-80, eye, 0, 1, 0, 0, 200, t); assert(!along(g2, t + 50) && smokeCutsNow(g2, t + 50) === 1, 'your own shot opens its tunnel at once');
  smokeCut(g2, -80, eye, 0, 1, 0, 0, 200, t + 30); assert.equal(smokeCutsNow(g2, t + 60), 1, 'the host\'s copy of your shot replaces yours (not two tunnels)'); LOCAL_CUTS.length = 0;
  // the host's tick: a shot counted in a pose (shot.n up by one, aimed along +x: yaw −90°) cuts its tunnel; no new shot, no cut
  const g3 = game([smoke('t3', 0, 0)]), pl = [{ name: 'Ann', pose: { x: -80, y: eye, z: 0, yaw: -Math.PI / 2, shot: { n: 4, pitch: 0 } } }];
  assert.equal(cutShots(g3, pl, t), 0, 'the first pose seen: its count is the start'); assert.equal(cutShots(g3, pl, t + 20), 0, 'no new shot: no tunnel');
  pl[0].pose.shot.n = 5; assert.equal(cutShots(g3, pl, t + 40), 1, 'a new shot through the smoke: a tunnel'); assert(!along(g3, t + 100) && along(g3, t + 100, 4), '…along the aim, from the eye');
  // a spray down its own open tunnel keeps cutting (the check ignores the tunnels: the cloud itself is crossed)
  const g5 = game([smoke('t5', 0, 0)]); assert(smokeCut(g5, -80, eye, 0, 1, 0, 0, 200, t) && smokeCut(g5, -80, eye, 0, 1, 0, 0, 200, t + 200) && g5.combat.cuts.length === 2, 'the next shot down an open tunnel cuts again (the tunnel stays open while you spray)');
  // another player's shot replayed on this client (lab.js pistolFx onShot): drawn, never in this client's rules — its
  // origin is this client's copy of his model, its reach the full 400 (a replay doesn't know the wall it stopped at), so
  // every client's would differ; the rules take his tunnels from the host. A shotgun's pellets: one tube per shot.
  LOCAL_CUTS.length = 0; const g4 = game([smoke('t4', 0, 0)]);
  assert(smokeLocalCut(-80, eye, 0, 1, 0, 0, undefined, t, true, g4) && along(g4, t + 50), 'a replayed shot leaves the rules alone (still blocked for the models\' hiding and the radar)');
  assert(smokeCutsNow(g4, t + 50) === 1 && smokeCutsNow(g4, t + 50, false) === 0, '…and is drawn (the screen\'s set)');
  smokeCut(g4, -80, eye, 8, 1, 0, 0, 200, t + 60); for (let i = 0; i < 9; i++) smokeLocalCut(-80, eye, -3, 1, 0, (i - 4) * .01, undefined, t + 70, true, g4);
  assert(LOCAL_CUTS.length === 2 && smokeCutsNow(g4, t + 80) === 3, 'a shotgun replay\'s 9 pellets cut one tube, never pushing out the host\'s · ' + LOCAL_CUTS.length);
  assert(!smokeLocalCut(-80, eye, 60, 1, 0, 0, 200, t + 90, false, g4) && LOCAL_CUTS.length === 2, 'your own shot that crosses no smoke cuts nothing (the ring keeps the tunnels that matter)');
  assert(smokeLocalCut(-80, eye, -1.5, 1, 0, 0, 200, t + 95, false, g4) && smokeCutsNow(g4, t + 120, false) === 2, 'your own shot through it: in your rules at once (until the host\'s copy)'); LOCAL_CUTS.length = 0;
  ok.push('bullet tunnels: host state (from the poses\' shots), ≤ TUNNEL.max, closed in ~1.2 s, the same on the client'); }

// ── SMK-STALE-MOVERS + determinism: the doors of the moment it popped; the client computes the host's depths exactly ──
{ const room = shut => { const door = B(9.5, 10.5, -5, 5, 0, 16, { mover: 'd1', role: 'door', off: !shut }), b = [B(-300, 300, -300, 300, -4, 0), B(9.5, 10.5, -300, -5, 0, 60), B(9.5, 10.5, 5, 300, 0, 60), B(9.5, 10.5, -5, 5, 16, 60), door]; b.movers = [door]; return b; };
  const pop = (id, shut) => { const g = { levels: {}, testBoxes: room(shut), combat: { nades: [{ id, kind: 'smoke', phase: 'air', x: 0, y: .35, z: 0, vx: 0, vy: 0, vz: 0, at: T0 - 2100, still: 1, rest: true }], hp: {}, down: {}, clock: T0 }, arena: { bots: [] } }; nadesTick(g, [], .05, T0, {}); g.combat.clock = now; return g; };
  const host = pop('m1', true), s = host.combat.nades[0]; assert(s.phase === 'smoke' && s.mv === '', 'the host stamps the doors round it when it pops (here: shut)');
  const client = { levels: {}, testBoxes: room(false), combat: JSON.parse(JSON.stringify(host.combat)), arena: { bots: [] } };   // (the client's door is open by the time it sees the smoke)
  let differ = 0; for (let i = 0; i < 300; i++) { const a = i * 2.39996, r = 10 + (i % 7) * 6, y = 2 + (i % 9) * 1.5, q = [Math.cos(a) * 60, y, Math.sin(a) * 60, Math.cos(a + 2.5) * r, y, Math.sin(a + 2.5) * r];
    if (smokeDepth(host, ...q, now) !== CLIENT.smokeDepth(client, ...q, now)) differ++; }
  assert.equal(differ, 0, 'the client\'s depths are the host\'s, exactly, whatever its doors are doing now');
  assert(smokeDensity(host, 14, 5, 0, now) === 0 && CLIENT.smokeDensity(client, 14, 5, 0, now) === 0, 'popped behind a shut door: none beyond it, on either');
  const opened = pop('m2', false); assert(opened.combat.nades[0].mv === 'd1:door' && smokeDensity(opened, 14, 5, 0, now) > .5, 'popped with the door open: it pours through');
  ok.push('host and client agree exactly (door stamp at the pop)'); }

// ── The view: atlas slots hold the rules' own bytes; freed when the smoke ends and on leaving (VIEW-CLEAR) ──
const gl = { getContextAttributes: () => ({ antialias: false }) }, fakeRenderer = { getContext: () => gl, shadowMap: {}, getRenderTarget: () => null, setRenderTarget() {}, render() {}, compile() {}, initTexture() {}, getDrawingBufferSize: v => v.set(8, 8) };
{ const cam = new THREE.PerspectiveCamera(), pass = createSmokePass({ renderer: fakeRenderer, scene: new THREE.Scene(), camera: cam, quality: () => 'High' }), g = game([smoke('v', 0, 0)]), s = g.combat.nades[0], v = smokeVoxels(g, s);
  const k = pass.add(v); assert(k === 0 && pass.used === 1, 'a slot for the cloud');
  const tex = pass.atlasTexture.image, SX = tex.width, SY = tex.height; let same = 0, n = 0;
  for (let z = 0, c = 0; z < v.nz; z++) for (let y = 0; y < v.ny; y++) for (let x = 0; x < v.nx; x++, c++) { n++; if (tex.data[(((k * (tex.depth / SLOTS) + z + 1) * SY + y + 1) * SX + x + 1) * 4] === v.r8[c]) same++; }
  assert.equal(same, n, 'the atlas holds the very bytes the rules read (R: the spread)');
  g.combat.nades.push({ id: 'hv', kind: 'he', phase: 'air', x: 0, y: .3, z: 0, vx: 0, vy: 0, vz: 0, at: T0 + 3000 - NADES.he.fuse - 10, still: 0 }); nadesTick(g, [], .05, T0 + 3000, {}); const hb = smokeHoleBytes(g, s, s.holes[0]); pass.hole(k, 0, hb);
  let hs = 0; for (let z = 0, c = 0; z < v.nz; z++) for (let y = 0; y < v.ny; y++) for (let x = 0; x < v.nx; x++, c++) if (tex.data[(((k * (tex.depth / SLOTS) + z + 1) * SY + y + 1) * SX + x + 1) * 4 + 2] === hb[c]) hs++; assert.equal(hs, n, 'a hole\'s reach: the rules\' bytes too (B)');
  const ks = [k]; for (let i = 1; i < SLOTS; i++) ks.push(pass.add(v)); assert(!ks.includes(-1) && pass.add(v) === -1, SLOTS + ' clouds at once, then no slot (puffs instead)');
  pass.remove(ks[3]); assert(pass.add(v) === ks[3], 'a freed slot is used again');
  pass.frame(0, new Float64Array(TUNNEL.max * 7), 0); pass.push(k, 10, 1, 0, 0); pass.push(k, 10, 0, 0, 0); assert(pass.stats().clouds === 1 && pass.active(), 'pushed this frame: drawn (a faded-out one is not)');
  cam.position.set(0, 10, 150); cam.lookAt(0, 10, 400); assert(!pass.active(), 'the cloud behind you: the pass is skipped (costs nothing)'); cam.lookAt(0, 10, 0); assert(pass.active(), '…turn round: drawn that very frame');
  pass.clear(); assert(pass.used === 0 && !pass.active(), 'clear(): every slot free, nothing drawn');
  assert(Object.values(SMOKE_QUALITY).every(q => q.scale >= 1 && q.scale <= 3 && q.steps >= 32 && q.step <= 2.5), 'every preset: resolution and steps only (the density and SMOKE.k are the same on all)');
  ok.push('pass slots: the rules\' bytes, ' + SLOTS + ' at once, freed'); }

// ── createNadeView in a scene (no browser): slots follow the smokes, clear() lets everything go; the fire's glow is GD's ──
{ const doc = globalThis.document; globalThis.document = { body: { insertAdjacentHTML() {} }, getElementById: () => null, createElement: () => ({ getContext: () => null }) };
  const was = globalThis.__infra; globalThis.__infra = { renderer: fakeRenderer };
  try { const { createNadeView } = await import('../dist/arena-nades-view.js'), { createDetailCuller } = await import('../dist/render-optimizer.js');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), g = game([]); g.mode = 'arena'; const world = { operations: { game: g } };
    const view = createNadeView({ scene, camera, world, boxes: () => g.testBoxes, quality: () => 'High', hostNow: () => now });
    g.combat.nades.push(smoke('n1', 0, 0), { id: 'f1', kind: 'molotov', phase: 'fire', x: 60, y: 0, z: 0, firedAt: now - 500, at: now - 500 }); view.update(.016);
    const pass = scene.userData.gdSmoke; assert(pass && pass.used === 1 && pass.stats().clouds === 1, 'the smoke has its slot and is drawn');
    const culler = createDetailCuller(camera); culler.register(scene); assert.equal(culler.size, 0, 'nothing of the grenades is the hall\'s detail culler\'s (the molotov\'s floor glow stays at any distance)');
    g.combat.nades.splice(0, 1); view.update(.016); assert(pass.used === 0, 'the smoke ended: its slot is free');
    g.combat.nades.push(smoke('n2', 0, 0)); view.update(.016); assert(pass.used === 1);
    view.clear(); const fx = scene.getObjectByName('nadeFx'), nades = scene.getObjectByName('nades'); let leftovers = 0; nades.traverse(o => { if (o !== nades && (o.userData.vox || o.isGroup)) leftovers++; });
    assert(pass.used === 0 && !pass.active() && fx.children.filter(o => o.isGroup).length === 0 && leftovers === 0, 'leaving the match: no slot, nothing drawn, no effect left in the scene');
    ok.push('view: slots follow the smokes, clear() frees all, the glow is GD\'s'); }
  finally { globalThis.document = doc; globalThis.__infra = was; } }

// ── From inside a cloud the rules count what the screen draws: its march starts SMOKE.near from the eye (arm's length) ──
{ const g = game([smoke('nb', 0, 0)]), ey = 6, H = HULL; let differ = 0, n = 0;
  const screen = (x, fy, z) => BODY.every(b => { const y = fy + b * H, L = Math.hypot(x, y - ey, z), f = SMOKE.near / L; return smokeSeen(g, x * f, ey + (y - ey) * f, z * f, x, y, z, now) < SMOKE.see; });
  for (let D = 2.5; D <= 8; D += .1) for (const a of [0, 1.3, 2.9]) { const x = Math.cos(a) * D, z = Math.sin(a) * D, want = screen(x, 0, z); n++;
    assert.equal(smokeHides(g, 0, ey, 0, x, 0, z, false, now), want, 'inside a cloud: hidden exactly when the screen (from SMOKE.near out) hides all of him · ' + D.toFixed(1));
    if (BODY.every(b => smokeBlocks(g, 0, ey, 0, x, b * H, z, now)) !== want) differ++; }
  assert(differ > 0, 'the near band matters somewhere (the old lines from the eye itself hid him there) · ' + differ + '/' + n);
  ok.push('inside a cloud the rules skip the near band the screen skips (' + differ + ' of ' + n + ' spots differed)'); }

// ── The radar spots through smoke on the host's running clock (gd-radar.js) — never on G.combat.clock, the last combat
// frame's stamp, which stands still for seconds in a quiet game: here the last frame came 4 s after the pop (the cloud
// full) and nothing since; 17.95 s after the pop the cloud has all but faded on screen (and to the models' hiding), so
// the enemy behind it is spotted — at that stale stamp it would still be full. The page's DOM is stand-ins.
{ let mono = 5000, wall = 1.8e12; const realDate = Date.now, realPerf = performance.now; Date.now = () => wall; performance.now = () => mono;
  const ctx = new Proxy({}, { get: (o, k) => k in o ? o[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}, set: (o, k, v) => { o[k] = v; return true; } }), canvas = () => ({ width: 420, height: 420, style: {}, getContext: () => ctx });
  const cv = canvas(), el = { hidden: true, clientWidth: 210, style: {}, classList: { toggle() {} }, querySelector: s => s === 'canvas' ? cv : s === 'small' ? { textContent: '' } : { style: {}, replaceChildren() {} } };
  const doc = globalThis.document; globalThis.document = { createElement: t => t === 'canvas' ? canvas() : { textContent: '' }, head: { append() {} }, body: { insertAdjacentHTML() {}, classList: { toggle() {} } }, getElementById: () => el };
  try { const { createRadar } = await import('../dist/gd-radar.js'), Hc = await import('../dist/host-clock.js'), { ARENA } = await import('../dist/facility-layout.js');
    Hc.resetHostClock(); const C0 = wall + 7000; Hc.hostClockSample(C0); const me = { x: ARENA.cx, y: eye, z: ARENA.cz };
    const radar = (nades, clock, pose) => { const G = { mode: 'arena', arena: { map: 'yard' }, combat: { clock, nades } }, R = createRadar({ world: { operations: { game: G } }, lan: { players: [{ name: 'Bo', pose: { x: ARENA.cx, y: eye, z: ARENA.cz + 40, yaw: 0, ...pose } }] }, name: () => 'Ann', yaw: () => 0, where: () => me, active: () => true }); mono += 100; R.update(); return R.revealed.includes('bo'); };
    const cloud = () => [{ id: 'rs', kind: 'smoke', phase: 'smoke', x: ARENA.cx, y: 0, z: ARENA.cz + 20, firedAt: C0 - 4000 }];
    assert(radar([], C0), 'no smoke: the enemy in the open is spotted');
    assert(!radar(cloud(), C0), 'a full cloud between: not spotted');
    const fade = NADES.smoke.lasts - 50 - 4000; mono += fade; wall += fade;   // (17.95 s after the pop: faded all but away; no combat frame since the one at 4 s)
    assert(smokeSeen({ combat: { nades: cloud() } }, ARENA.cx, eye, ARENA.cz, ARENA.cx, eye, ARENA.cz + 40, C0 + fade) > SMOKE.see && radar(cloud(), C0 + fade), 'faded: spotted (a fresh stamp)');
    assert(radar(cloud(), C0), '…and when the last combat frame is 14 s old (the radar runs on the host\'s running clock, as the screen and the models\' hiding do)');
    ok.push('the radar spots through smoke on the running host clock'); }
  finally { if (doc === undefined) delete globalThis.document; else globalThis.document = doc; Date.now = realDate; performance.now = realPerf; } }

// ── SMK-CPU: a rules query is cheap (three clouds, long lines: bots, radar, the models' hiding all call it) ──
{ const g = game([smoke('c1', 0, 0), smoke('c2', 40, 10), smoke('c3', -30, 30)]), L = []; for (let i = 0; i < 400; i++) { const a = i * .7, r0 = 150 + (i % 5) * 60; L.push([Math.cos(a) * r0, eye, Math.sin(a) * r0, -Math.cos(a) * 120, eye + (i % 5), -Math.sin(a) * 120]); }
  for (const q of L) smokeBlocks(g, ...q, now); const t = performance.now(); for (let r = 0; r < 5; r++) for (const q of L) smokeBlocks(g, ...q, now); const us = (performance.now() - t) / (5 * L.length) * 1000;
  assert(us < 60, 'smokeBlocks: ' + us.toFixed(1) + ' µs a call'); ok.push('a rules query ' + us.toFixed(1) + ' µs'); }
console.log('PASS: smoke (one rule) · ' + ok.join(' · '));
