// Global Defensive · the headshot "dink" sparks (dist/gd-blood.js, v53 Addendum 6 — stage 3's headshot part):
//  · impact by hit: a headshot on a helmet (the host's record hm) → CS2's helmet impact sparks (and the blood as
//    before); a bare-head headshot → blood only; a body hit → blood only;
//  · CS2's numbers (particles/impact_fx/impact_helmet_headshot{,_spark,_glow}.vpcf): 15 trails + 2 streaks + 1 flare,
//    their lifetimes, colours (electric blue-white), the trails back toward the shooter, the streaks through the head;
//  · the same record gives the same sparks on every computer (seeded by its number);
//  · one pool of DINK_N quads, one additive draw, recycled oldest first; none on your own head in first person; the
//    Blood setting off leaves the sparks; a new round clears them;
//  · no allocation per helmet hit (planning + writing the pool) and none per frame.
//   node tests/gd-dink.mjs        (re-runs itself with --expose-gc for the allocation check)
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL:', m); } else if (process.env.V) console.log('  ok', m); };
const ET = new EventTarget(); globalThis.addEventListener = ET.addEventListener.bind(ET); globalThis.dispatchEvent = ET.dispatchEvent.bind(ET);
let T = 1000; performance.now = () => T;
const THREE = await import('../dist/three.module.js');
const B = await import('../dist/gd-blood.js');
const { live } = await import('../dist/live-settings.js');
const { HU } = await import('../dist/weapons-data.js');
const { DINK, DK, MAX_DINK, DINK_N, planDink, dinks, planSpray, SP, createBlood } = B;

// ── mapping ──
const rec = (o = {}) => ({ i: 4242, at: 5000, v: 'bo', z: 'head', d: 40, p: [10, 9, -20], r: [1, 0, 0], hm: 1, s: 'ann', ...o });
const KB = new Float32Array(MAX_DINK * DK), PB = new Float32Array(64 * SP);
ok(dinks(rec()) && !dinks(rec({ hm: undefined })) && !dinks(rec({ z: 'chest' })) && !dinks(rec({ z: 'chest', hm: 1 })), 'a helmet headshot dinks; a bare head, a body hit (even with armour) do not');
ok(planDink(rec(), KB) === 18 && planDink(rec({ hm: undefined }), KB) === 0 && planDink(rec({ z: 'legs' }), KB) === 0, 'helmet headshot: 15 + 2 + 1 particles; others none');
ok(planSpray(rec(), PB) > 0 && planSpray(rec({ hm: undefined }), PB) > 0, 'blood sprays either way (a bare head: the blood instead of sparks)');
// ── CS2's numbers ──
ok(DINK.trails.n === 15 && DINK.spark.n === 2 && DINK.glow.n === 1, "CS2's counts: InstantaneousEmitter 15 / 2 / 1");
ok(JSON.stringify(DINK.trails.life) === '[0.05,0.3]' && JSON.stringify(DINK.spark.life) === '[0.09,0.1]' && JSON.stringify(DINK.glow.life) === '[0.1,0.13]', "CS2's lifetimes: .05–.3 / .09–.1 / .1–.13 s");
ok(JSON.stringify(DINK.trails.col) === '[[103,255,242],[82,216,255]]' && JSON.stringify(DINK.spark.col) === '[[77,254,239],[175,224,255]]' && JSON.stringify(DINK.glow.col) === '[[155,218,255],[184,207,250]]', "CS2's colours: electric blue-white");
ok(DINK.trails.grav === -300 && DINK.trails.drag === .5 && DINK.trails.max === 25 && DINK.spark.max === 64 && DINK.trails.ob === 3 && DINK.glow.ob === 8 && DINK.glow.maxScreen === .01, "CS2's gravity −300, drag .5, trail caps 25 / 64 HU, overbright 3 / 8, flare ≤ 1 % of the screen");
{ planDink(rec(), KB); const d = [1, 0, 0]; let back = 0, through = 0;   // (the shot travels +x: back toward the shooter is −x)
  for (let k = 0; k < 15; k++) if (KB[k * DK + 3] * d[0] < 0) back++;
  for (let k = 15; k < 17; k++) if (KB[k * DK + 3] * d[0] > 0) through++;
  ok(back === 15 && through === 2, `the 15 trails fly back toward the shooter (${back}), the 2 streaks out through the head (${through})`);
  const sp = Math.hypot(KB[3], KB[4], KB[5]) / HU; ok(sp > 500 && sp < 2200, 'a trail\'s speed in CS2\'s range (' + sp.toFixed(0) + ' HU/s)');
  ok(KB[17 * DK + 19] === 1 && KB[17 * DK + 3] === 0 && Math.abs(KB[17 * DK] - (10 - 3 * HU)) < 1e-4, 'the flare: a sprite, still, 3 HU out toward the shooter'); }
{ const a = new Float32Array(MAX_DINK * DK), b = new Float32Array(MAX_DINK * DK); planDink(rec(), a); planDink(rec(), b); const c = new Float32Array(MAX_DINK * DK); planDink(rec({ i: 4243 }), c);
  ok(a.every((v, i) => v === b[i]) && !a.every((v, i) => v === c[i]), 'the same record → the same sparks on every computer; another record → others'); }

// ── the pool in a scene ──
const scene = new THREE.Scene(); let me = 'ann', G = { mode: 'arena', combat: { bl: [], d: { match: 1, n: 1 } }, arena: { map: 'dust2' } };
const blood = createBlood(scene, { game: () => G, me: () => me, clock: () => 5000, assets: false });
ok(scene.children.includes(blood.dink) && blood.dink.userData.gd && blood.dink.userData.warm && blood.dink.material.blending === THREE.AdditiveBlending, 'one additive mesh in the scene, warmed with the blood pools (userData.gd / warm)');
ok(blood.dink.geometry.instanceCount === DINK_N && blood.warmObjects().length === 3, `one draw of ${DINK_N} quads; the warm-up has it`);   // (3 — the spray, the decals and the dink; v53 FEEDBACK: no local splatter pool, the user's no-blood-on-your-screen rule)
let i = 100; const push = o => { G.combat.bl.push(rec({ i: ++i, ...o })); if (G.combat.bl.length > 12) G.combat.bl.shift(); };
blood.update(); push({}); blood.update(); ok(blood.stats.dinks === 1 && blood.dink.visible, 'a helmet headshot on someone: the dink');
push({ hm: undefined }); blood.update(); ok(blood.stats.dinks === 1, 'a bare head: no dink');
push({ v: 'ann' }); blood.update(); ok(blood.stats.dinks === 1, 'your own head in first person: none in your view');
live.blood = false; push({}); blood.update(); ok(blood.stats.dinks === 2, 'Blood off: the sparks still show (they are not blood)'); live.blood = true;
for (let k = 0; k < 4; k++) { push({}); blood.update(); } ok(blood.stats.dinks === 6 && blood.stats.kHead === (6 * 18) % DINK_N, 'the pool wraps, oldest first (' + blood.stats.kHead + ')');
T += 400; blood.update(); ok(!blood.dink.visible, 'gone after its longest life (.3 s)');
push({}); blood.update(); ok(blood.dink.visible, 'again'); G.combat.d = { match: 1, n: 2 }; blood.update(); ok(!blood.dink.visible && blood.stats.kHead === 0, 'a new round clears it');

// ── no allocation per helmet hit, none per frame ──
// (measured with V8's sampling heap profiler, every 64 bytes: what gd-blood.js's own functions allocate — the heap's
// size after a GC also moves with compiled code and feedback, which is not the module making garbage)
{ const inspector = await import('node:inspector'); const S = new inspector.Session(); S.connect(); const post = (m, p) => new Promise((res, rej) => S.post(m, p, (e, r) => e ? rej(e) : res(r)));
  const ownBytes = async f => { await post('HeapProfiler.startSampling', { samplingInterval: 64 }); f(); const { profile } = await post('HeapProfiler.stopSampling'); let b = 0; const w = nd => { if (/gd-blood\.js$/.test(nd.callFrame.url)) b += nd.selfSize; for (const c of nd.children) w(c); }; w(profile.head); return b; };
  const R = rec(); const t0 = blood.time; let j = 0; const run = N => { for (let k = 0; k < N; k++) { R.i = 9000 + (j++ & 1023); blood.dinkHit(R, t0); } };
  run(20000); const dh = await ownBytes(() => run(50000)); ok(dh / 50000 < 1, 'no allocation per helmet hit: 50 000 hits (plan + pool write), gd-blood.js allocated ' + dh + ' bytes in all (' + (dh / 50000).toFixed(2) + ' B a hit; one object would be ≥ 16)');
  // (v53 integration: warmed 20 000 frames first and judged at under 4 B a frame — a quarter of the smallest object. Under
  // load (the full npm test) V8 can still tier update() up inside the window and the sampler counts that one-off code and
  // feedback memory, ~1 B a frame; real per-frame garbage, one object a frame, would be ≥ 16 B a frame.)
  const f = N => { for (let k = 0; k < N; k++) blood.update(); }; f(20000); const df = await ownBytes(() => f(20000)); ok(df / 20000 < 4, 'none per frame: 20 000 frames, ' + df + ' bytes in all (' + (df / 20000).toFixed(2) + ' B a frame; one object a frame would be ≥ 16)');
  S.disconnect(); }

if (fails) { console.error(`FAIL: gd-dink · ${fails} of ${n}`); process.exit(1); }
console.log(`PASS: gd-dink · ${n} checks (helmet headshot → CS2's dink sparks, bare head / body → blood only, CS2's counts / lives / colours / directions, same sparks everywhere, one additive pool, not your own head, Blood off keeps them, round clears, no allocation per hit or frame)`);
