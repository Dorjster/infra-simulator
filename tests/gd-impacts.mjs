// Global Defensive · bullet impacts by surface (dist/gd-impacts.js, v53 stage 5 + ADDENDUM 6):
//  · impact by surface: metal → CS2's spark burst (additive trails, flares, a flash; no chips), concrete / plaster →
//    dust and chips, wood → chips and splinters, glass → shards, sand / dirt → puffs; a CS2 door or breakable by its
//    model's own surface property; a helmet headshot → the dink sparks (gd-blood.js) plus their other CS2 children here;
//    a bare head → blood only, no sparks;
//  · CS2's numbers: each emitter against its particles/impact_fx/*.vpcf in the user's install (counts per detail level,
//    lifetimes, radii, gravity, drag, trail caps) and each hole's size against its decal group's material
//    (DecalWorldWidth / DecalSizeVariance) — when the install is on this computer (else the shipped numbers only);
//  · the same hit → the same particles on every computer (seeded by the point);
//  · three pools made once, one draw each, recycled oldest first, the per-hit cap, the pending ring's cap; Low draws
//    CS2's LOD0 counts;
//  · no allocation per impact (plan + pool write + hole) and none per frame.
//   node tests/gd-impacts.mjs        (re-runs itself with --expose-gc for the allocation check)
import { spawnSync, execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL:', m); } else if (process.env.V) console.log('  ok', m); };
let T = 1000; performance.now = () => T;
const THREE = await import('../dist/three.module.js');
const I = await import('../dist/gd-impacts.js');
const { createBlood } = await import('../dist/gd-blood.js');
const { HU } = await import('../dist/weapons-data.js');
const { FX, DINK_EXTRA, LEFT_OUT, K, PK, MAX_HIT, ADD_N, ALPHA_N, DECAL_N, PEND_N, planImpact, impactOf, decalOf, createImpacts } = I;
const PB = new Float32Array(MAX_HIT * PK), kinds = (list, d = 2) => { const c = planImpact(list, 0, 0, 0, 0, 0, 1, 0, 0, -1, 77, d, PB); const out = {}; for (let j = 0; j < c; j++) { const k = PB[j * PK + 23]; out[k] = (out[k] || 0) + 1; } return out; };

// ── impact by surface ──
const want = { metal: 'metal', 'metal-red': 'metal', metal_sheetmetal: 'metal', metal_ventslat: 'metal', concrete: 'concrete', stone: 'concrete', brick: 'concrete', adobe: 'concrete', plaster: 'plaster', roof: 'tile',
  wood: 'wood', crate: 'wood', door: 'wood', Wood: 'wood', Wood_Furniture: 'wood', glass: 'glass', sand: 'dirt', grass: 'dirt', nothing_known: 'concrete' };
for (const [m, k] of Object.entries(want)) ok(impactOf(m) === k, `${m} → ${k} (${impactOf(m)})`);
{ const m = kinds(FX.metal), c = kinds(FX.concrete), w = kinds(FX.wood), g = kinds(FX.glass), d = kinds(FX.dirt);
  ok(m[K.trail] >= 17 && m[K.glow] >= 2 && !m[K.chip], `metal: CS2's spark burst — ${m[K.trail]} spark trails, ${m[K.glow]} flares / flashes, no chips`);
  ok(c[K.chip] === 4 && c[K.puff] >= 3 && (c[K.trail] || 0) === 2, `concrete: dust puffs (${c[K.puff]}), 4 flecks at High (CS2 LOD2), 2 sparse sparks`);
  ok(w[K.chip] === 18 && w[K.streak] >= 15 && w[K.puff] >= 2, `wood: 10 chips + 8 chunks, ${w[K.streak]} splinter streaks, dust`);
  ok(g[K.chip] === 24 && g[K.glow] >= 2, `glass: 4 + 20 shards at High, a flash`);
  ok(d[K.puff] >= 6 && d[K.streak] === 11 && d[K.chip] === 7, `sand / dirt: puffs (${d[K.puff]}), 5 + 3 + 3 burst streaks, 4 flecks (LOD2) + 3 thrown back`);
  const lo = kinds(FX.concrete, 0), lg = kinds(FX.glass, 0); ok(!lo[K.chip] && !lg[K.chip], 'Low detail: CS2\'s LOD0 counts — no concrete flecks, no glass shards'); }
{ const MAIN = [FX.metal.find(e => e.src === 'impact_metal')], c = planImpact(MAIN, 0, 0, 0, 0, 0, 1, 0, 0, -1, 77, 2, PB); let up = 0, tr = 0, warm = 0;   // a bullet straight into a wall facing +z: its sparks fly out of the wall
  for (let j = 0; j < c; j++) { const o = j * PK; if (PB[o + 23] !== K.trail) continue; tr++; if (PB[o + 5] > 0) up++; if (PB[o + 19] >= PB[o + 17] * .9) warm++; }
  ok(up / tr > .9, `metal sparks fly off the surface along the reflected bullet (${up}/${tr} outward)`);
  const s0 = Math.hypot(PB[3], PB[4], PB[5]) / HU; ok(s0 > 40 && s0 < 1300, 'a spark\'s speed in CS2\'s range (' + s0.toFixed(0) + ' HU/s)');
  ok(PB[6] >= .025 && PB[6] <= .2 && Math.abs(PB[10] + 300 * HU) < 1e-4 && Math.abs(PB[11] - -Math.log(.75) * 30) < 1e-4 && Math.abs(PB[13] - 32 * HU) < 1e-6 && Math.abs(PB[24] - .1) < 1e-6 && PB[31] === 2, 'the main sparks: life .025–.2 s, gravity −300, drag .25 (Source: ×.75 per 1/30 s), trails up to 32 HU growing in over .1 s (flLengthFadeInTime), their bloom-pass glow ×2 (impact_metal.vpcf)');
  { let short = 0; for (let k = 0; k < 4000; k++) { const u = (k + .5) / 4000; if (.025 + .175 * I.biased(u, -.368421) < .1125) short++; } ok(short / 4000 > .6, `life's EXPONENTIAL bias leans to the short end (${(short / 40).toFixed(0)} % live under the middle)`); }
  { const g = 0; let warmHalo = 0; for (let j = 0; j < c; j++) { const o = j * PK; if (PB[o + 34] < PB[o + 32] * .75) warmHalo++; } ok(warmHalo === c, 'the sparks\' glow turns orange over their life ((238,222,172) → (247,198,114))'); } }
{ const a = new Float32Array(MAX_HIT * PK), b = new Float32Array(MAX_HIT * PK); planImpact(FX.metal, 1, 2, 3, 1, 0, 0, -1, 0, 0, I.hitSeed(1, 2, 3), 2, a); planImpact(FX.metal, 1, 2, 3, 1, 0, 0, -1, 0, 0, I.hitSeed(1, 2, 3), 2, b);
  const c = new Float32Array(MAX_HIT * PK); planImpact(FX.metal, 1.5, 2, 3, 1, 0, 0, -1, 0, 0, I.hitSeed(1.5, 2, 3), 2, c);
  ok(a.every((v, i) => v === b[i]) && !a.every((v, i) => v === c[i]), 'the same hit point → the same sparks on every computer; another point → others'); }
ok(decalOf('concrete')[0] === 5.8 && decalOf('metal')[0] === 6.6 && decalOf('wood')[0] === 7.7 && decalOf('glass')[0] === 8.1 && decalOf('sand')[0] === 5.8 && decalOf('plaster')[0] === 9.2 && decalOf('roof')[0] === 11.6 && decalOf('stone')[0] === 8.1, "the holes: CS2's DecalWorldWidth per group (concrete 5.8, metal 6.6, wood 7.7, glass 8.1, dirt 5.8, plaster 9.2, tile 11.6, rock 8.1 HU)");

// ── helmet headshot → dink sparks; bare head → blood only ──
{ const scene = new THREE.Scene(), G = { mode: 'arena', combat: { bl: [], d: { match: 1, n: 1 } }, arena: { map: 'dust2' } };
  const imp = createImpacts(scene, { game: () => G }); let dinks = 0; const blood = createBlood(scene, { game: () => G, me: () => 'ann', clock: () => 5000, assets: false, onDink: r => { dinks++; imp.dink(r); } });
  const rec = o => ({ i: 777, at: 5000, v: 'bo', z: 'head', d: 40, p: [10, 9, -20], r: [1, 0, 0], hm: 1, s: 'ann', ...o });
  blood.update(); G.combat.bl.push(rec({})); blood.update();
  ok(dinks === 1 && blood.stats.dinks === 1 && imp.stats.addHead > 0 && imp.sparks.visible, 'a helmet headshot: the dink sparks (gd-blood) and their other CS2 children (ricochet, trailing sparks, glow) in the spark pool');
  const before = imp.stats.addHead; G.combat.bl.push(rec({ i: 778, hm: undefined })); blood.update();
  ok(dinks === 1 && imp.stats.addHead === before && blood.stats.hits >= 2, 'a bare-head headshot: blood only — no sparks');
  const k = kinds(DINK_EXTRA); ok(k[K.trail] >= 12 && k[K.glow] === 1 && k[K.puff] === 1, `the dink's extra children: ${k[K.trail]} trails (ricochet_sparks 5–10 + LOD2 8, sparks_trailing 4), glow2, smoke_small`);
  blood.dispose?.(); imp.dispose(); }

// ── the pools ──
const scene = new THREE.Scene(), G = { mode: 'arena', combat: { d: { match: 1, n: 1 } }, arena: { map: 'dust2' } }; let det = 2;
const imp = createImpacts(scene, { game: () => G, detail: () => det });
ok(scene.children.includes(imp.sparks) && scene.children.includes(imp.dust) && scene.children.includes(imp.holes), 'three meshes in the scene (sparks, dust, holes)');
ok(imp.sparks.material.blending === THREE.AdditiveBlending && imp.dust.material.blending === THREE.NormalBlending, 'sparks additive (CS2 PARTICLE_OUTPUT_BLEND_MODE_ADD), dust and chips alpha-blended');
ok(imp.sparks.geometry.instanceCount === ADD_N && imp.dust.geometry.instanceCount === ALPHA_N && imp.holes.geometry.instanceCount === DECAL_N && imp.warmObjects().length === 3, `one draw each: ${ADD_N} + ${ALPHA_N} particles, ${DECAL_N} holes; the warm-up has all three`);
ok([imp.sparks, imp.dust, imp.holes].every(m => m.userData.gd && m.userData.warm && !m.frustumCulled), 'warmed with the GD pools (userData.gd / warm) behind the loading card');
imp.update(); imp.hit(0, 5, 0, 0, 0, 1, 0, 0, -1, 'metal'); ok(imp.stats.impacts === 1 && imp.sparks.visible && imp.holes.visible && imp.stats.holes === 1, 'a shot on metal: sparks and a hole');
{ const before = imp.stats.cheap; for (let k = 0; k < 14; k++) imp.hit(k, 9, 0, 0, 0, 1, 0, 0, -1, 'metal'); ok(imp.stats.cheap === before, '15 live metal impacts: all CS2\'s full impact_metal');
  imp.hit(20, 9, 0, 0, 0, 1, 0, 0, -1, 'metal'); ok(imp.stats.cheap === before + 1, 'the 16th while they live: impact_metal_cheap (m_nFallbackMaxCount 15)'); T += 2100; imp.update(); imp.hit(21, 9, 0, 0, 0, 1, 0, 0, -1, 'metal'); ok(imp.stats.cheap === before + 1, 'once they have died, the full one again'); }
for (let k = 0; k < 400; k++) imp.hit(k * .1, 5, 0, 0, 0, 1, 0, 0, -1, k % 2 ? 'metal' : 'concrete');
ok(imp.stats.addHead < ADD_N && imp.stats.alphaHead < ALPHA_N && imp.stats.holes === DECAL_N && imp.sparks.geometry.instanceCount === ADD_N, 'pools wrap oldest first, never grow (' + imp.stats.addHead + ' / ' + imp.stats.alphaHead + ', holes ' + imp.stats.holes + ')');
{ let acc = 0; for (let k = 0; k < PEND_N + 20; k++) if (imp.schedule(1, 0, 5, 0, 0, 0, 1, 0, 0, -1, 'wood')) acc++; ok(acc === PEND_N && imp.stats.dropped === 20, `the pending ring holds ${PEND_N} impacts in flight; more are dropped, never allocated`);
  T += 1100; imp.update(); ok(imp.stats.pending === 0, 'they land when their bullet arrives'); }
{ for (let k = 0; k < 200; k++) planImpact(FX.metal, 0, 0, 0, 0, 0, 1, 0, 0, -1, k, 3, PB); let mx = 0; for (const list of [...Object.values(FX), DINK_EXTRA]) for (let s = 0; s < 50; s++) mx = Math.max(mx, planImpact(list, 0, 0, 0, 0, 1, 0, 0, -1, 0, s, 3, PB)); ok(mx <= MAX_HIT, `an impact never writes over ${MAX_HIT} particles (Ultra: ${mx})`); }
{ const lists = [...Object.entries(FX), ['dink', DINK_EXTRA], ['metal cheap', I.FALLBACK.metal.list]]; let worst = ''; for (const [k, l] of lists) if (I.maxCount(l, 3) > MAX_HIT) worst += k + ' ' + I.maxCount(l, 3) + ' ';
  ok(!worst, `the per-hit cap ${MAX_HIT} is over every list's Ultra maximum (metal ${I.maxCount(FX.metal, 3)}): nothing is cut ${worst}`);
  const firstBig = FX.metal.findIndex(e => (e.n?.[1] || 0) + (e.lod?.[3] || 0) > 3); ok(FX.metal.slice(0, firstBig).map(e => e.src).join() === 'impact_metal_child_glow,impact_light_flash,impact_metal_child_base,impact_metal_child_smoke,impact_fx_hit_darken', 'the single sprites (glow, flash, base, smoke, darken) come first'); }
T += 4000; imp.update(); ok(!imp.sparks.visible && !imp.dust.visible, 'hidden when the last particle has died (wood\'s burn mark lives 3 s)');
G.combat.d = { match: 1, n: 2 }; imp.update(); ok(!imp.holes.visible && imp.stats.holes === 0, 'a new round clears the holes');
{ const off = createImpacts(new THREE.Scene(), { game: () => G, on: () => false }); ok(!off.schedule(0, 0, 0, 0, 0, 1, 0, 0, 0, -1, 'metal'), 'outside a match nothing is scheduled'); off.dispose(); }

// ── several impacts in one frame all reach the GPU (v53 MAP fix: each used to replace the one before's upload range) ──
{ const sc = new THREE.Scene(), im = createImpacts(sc, { game: () => G, detail: () => 2 }), P = im.pools, span = a => a.updateRanges.length === 1 ? [a.updateRanges[0].start, a.updateRanges[0].start + a.updateRanges[0].count] : a.updateRanges.length ? [-1, -1] : [0, a.array.length];
  const clear = () => { for (const g of [P.add, P.alpha, P.holes]) for (const a of Object.values(g)) a.clearUpdateRanges(); }; clear();
  im.hit(0, 5, 0, 0, 0, 1, 0, 0, -1, 'metal'); const h1 = im.stats.addHead; im.hit(3, 5, 0, 0, 0, 1, 0, 0, -1, 'metal'); const h2 = im.stats.addHead, [a0, a1] = span(P.add.aP);
  ok(a0 === 0 && a1 >= h2 * 4 && h2 > h1, `two impacts in one frame: both reach the GPU (sparks upload ${a0}–${a1}, slots 0–${h2 * 4})`);
  const [d0, d1] = span(P.holes.aC); ok(d0 === 0 && d1 >= 8, `…and both holes (${d0}–${d1})`);
  clear(); for (let k = 0; k < 9; k++) im.schedule(0, k, 5, 0, 0, 0, 1, 0, 0, -1, 'concrete'); const hb = im.stats.alphaHead; T += 16; im.update(); const [c0, c1] = span(P.alpha.aP), [e0, e1] = span(P.holes.aW);
  ok(c0 <= hb * 4 && c1 >= im.stats.alphaHead * 4 && e1 - e0 >= 9 * 4, `a shotgun's 9 pellets landing in one update: all 9 impacts (${c0}–${c1}) and holes (${e0}–${e1}) uploaded`);
  clear(); im.clearHoles(); im.hit(0, 5, 0, 0, 0, 1, 0, 0, -1, 'wood'); const [w0, w1] = span(P.holes.aW); ok(w0 === 0 && w1 === P.holes.aW.array.length, `a new round's first hole keeps the cleared holes' full upload (${w0}–${w1}): last round's holes do not stay`);
  // CS2's WorldTraceConstraint: a metal floor hit's embers land on it and bounce (the landing lanes 36–39)
  const PBb = new Float32Array(MAX_HIT * PK), nb = planImpact(FX.metal, 0, 5, 0, 0, 1, 0, .3, -1, 0, 99, 2, PBb, MAX_HIT, 1, 5); let land = 0, under = 0;
  for (let q = 0; q < nb; q++) { const o = q * PK; if (PBb[o + 36] > 0) { land++; if (PBb[o + 37] !== 5 || PBb[o + 36] > PBb[o + 6]) under++; } }
  ok(land > 0 && !under, `metal on a floor: ${land} sparks and embers land on it within their life, then bounce (CS2's ricochet_sparks_dir / _dots WorldTraceConstraint)`);
  const nn = planImpact(FX.metal, 0, 5, 0, 0, 1, 0, .3, -1, 0, 99, 2, PBb, MAX_HIT, 1, NaN); let none = 0; for (let q = 0; q < nn; q++) if (PBb[q * PK + 36] > 0) none++; ok(none === 0, 'no floor known: nothing lands');
  im.dispose(); }

// ── no allocation per impact, none per frame (V8's sampling heap profiler: what gd-impacts.js's own functions and three's
// attribute calls they make allocate — v53 MAP fix: three's addUpdateRange made an object per call and was not counted) ──
{ const inspector = await import('node:inspector'); const S = new inspector.Session(); S.connect(); const post = (m, p) => new Promise((res, rej) => S.post(m, p, (e, r) => e ? rej(e) : res(r)));
  const ownBytes = async f => { await post('HeapProfiler.startSampling', { samplingInterval: 64 }); f(); const { profile } = await post('HeapProfiler.stopSampling'); let b = 0; const w = nd => { if (/gd-impacts\.js$|three\.(core|module)\.js$/.test(nd.callFrame.url)) b += nd.selfSize; for (const c of nd.children) w(c); }; w(profile.head); return b; };
  const MATS = ['metal', 'concrete', 'wood', 'glass', 'sand', 'plaster', 'roof']; let j = 0;
  const ATTRS = [...Object.values(imp.pools.add), ...Object.values(imp.pools.alpha), ...Object.values(imp.pools.holes)], drawn = () => { for (let q = 0; q < ATTRS.length; q++) ATTRS[q].clearUpdateRanges(); };   // (what three does after it uploads them)
  const run = N => { for (let k = 0; k < N; k++) { const m = MATS[j % 7]; imp.hit((j++ & 1023) * .37, 5, 0, 0, 0, 1, 0, 0, -1, m); if ((k & 3) === 3) drawn(); } };
  run(5000); const dh = await ownBytes(() => run(20000)); ok(dh / 20000 < 4, 'no allocation per impact: 20 000 hits (plan + both pools + hole), gd-impacts.js allocated ' + dh + ' bytes in all (' + (dh / 20000).toFixed(2) + ' B a hit; one object would be ≥ 16)');
  const sch = N => { for (let k = 0; k < N; k++) { imp.schedule(0, (k & 255) * .3, 5, 0, 0, 0, 1, 0, 0, -1, MATS[k % 7], true, false); if ((k & 15) === 15) imp.update(); } };
  sch(4000); const ds = await ownBytes(() => sch(16000)); ok(ds / 16000 < 4, 'none per scheduled impact either: ' + ds + ' bytes for 16 000 (' + (ds / 16000).toFixed(2) + ' B each; under load V8 can tier the functions up inside the window, ~1 B each — one object each would be ≥ 16)');
  const f = N => { for (let k = 0; k < N; k++) { T += 16; imp.update(); } }; f(20000); const df = await ownBytes(() => f(20000)); ok(df / 20000 < 4, 'none per frame: 20 000 frames, ' + df + ' bytes in all');
  S.disconnect(); }

// ── CS2's own numbers (the user's install, when it is on this computer) ──
const CS2 = path.join(os.homedir(), 'CS2-extract'), VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
let verified = 'CS2 install not here: the shipped numbers only';
if (existsSync(VPK) && existsSync(S2V)) {
  const { kv3 } = await import('../tools/cs2-surfaceprops.mjs'); const tmp = mkdtempSync(path.join(os.tmpdir(), 'gd-impacts-'));
  try {
    execFileSync(S2V, ['-i', VPK, '-f', 'particles/impact_fx/', '-e', 'vpcf_c', '-o', tmp, '-d'], { stdio: 'ignore' });
    const file = s => { const p = path.join(tmp, 'particles', 'impact_fx', s + '.vpcf'); return existsSync(p) ? kv3(readFileSync(p, 'utf8')) : null; };
    const num = v => typeof v === 'number' ? [v, v] : v?.m_nType === 'PF_TYPE_LITERAL' ? [v.m_flLiteralValue, v.m_flLiteralValue] : /RANDOM/.test(v?.m_nType || '') ? [v.m_flRandomMin, v.m_flRandomMax] : null;
    const same = (a, b) => a && b && Math.abs(Math.min(...a) - Math.min(...b)) < 1e-3 && Math.abs(Math.max(...a) - Math.max(...b)) < 1e-3;
    let checked = 0;
    // every emitter, field by field (v53 MAP fix: speeds, colours, alpha, overbright, length fade-in, screen cap, the
    // radius curve, the halo renderer, the FadeOut share — not only counts and lives); where we differ, its `dev` says why
    const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol, rng = (a, b, tol = 1e-3) => a && b && near(Math.min(...a), Math.min(...b), tol) && near(Math.max(...a), Math.max(...b), tol);
    const v3 = (v, def) => Array.isArray(v) ? v.slice(0, 3).map(Number) : Array.isArray(v?.m_vLiteralValue) && v.m_nType === 'PVEC_TYPE_LITERAL' ? v.m_vLiteralValue.slice(0, 3).map(Number) : v == null ? def : null;
    const lit = v => typeof v === 'number' ? v : v?.m_nType === 'PF_TYPE_LITERAL' ? v.m_flLiteralValue : v?.m_nType === 'PF_TYPE_RANDOM_UNIFORM' ? [v.m_flRandomMin, v.m_flRandomMax] : v == null ? undefined : null;
    const seen = new Set();
    for (const list of [...Object.values(FX), DINK_EXTRA, ...Object.values(I.FALLBACK).map(f => f.list)]) for (const e of list) {
      if (seen.has(e)) continue; seen.add(e); const d = file(e.src); if (!d) { ok(false, e.src + '.vpcf in the install'); continue; }
      const dev = e.dev || {}, tag = e.src, em = d.m_Emitters || [], init = d.m_Initializers || [], ops = d.m_Operators || [], rend = d.m_Renderers || [];
      // count
      const counts = em.map(x => x.m_nParticlesToEmit).filter(c => c != null), rnds = counts.map(num).filter(Boolean), lod = counts.find(c => c.m_nType === 'PF_TYPE_PARTICLE_DETAIL_LEVEL'), cpc = counts.find(c => c.m_nType === 'PF_TYPE_CONTROL_POINT_COMPONENT');
      if (cpc) { const mx = cpc.m_nMapType === 'PF_MAP_TYPE_REMAP' ? Math.max(cpc.m_flOutput0, cpc.m_flOutput1) : 1; ok(e.cpn && e.n[0] === mx && e.n[1] === mx, `${tag}: a control point's count — its maximum ${mx} (${JSON.stringify(e.n)})`); }
      else if (e.n && rnds.length) ok(rng(e.n, rnds[0]), `${tag}: count ${e.n} = CS2 ${JSON.stringify(rnds[0])}`);
      if (e.lod) ok(lod && [lod.m_flLOD0, lod.m_flLOD1, lod.m_flLOD2, lod.m_flLOD3].every((v, i) => v === e.lod[i]), `${tag}: counts per detail level ${e.lod}`);
      // life (and its bias), radius, alpha
      const fl = f => init.find(x => x._class === 'C_INIT_InitFloat' && (x.m_nOutputField ?? 3) === f && num(x.m_InputValue) && !x.m_nSetMethod);
      const life = fl(1); if (life) { const v = life.m_InputValue; ok(rng(e.life, num(v)), `${tag}: life ${e.life} = CS2 ${JSON.stringify(num(v))}`);
        if (v?.m_nBiasType === 'PF_BIAS_TYPE_EXPONENTIAL' && !dev.radius) ok(near(e.lb || 0, v.m_flBiasParameter), `${tag}: life's EXPONENTIAL bias ${e.lb} = CS2 ${v.m_flBiasParameter}`); }
      const radI = init.find(x => x._class === 'C_INIT_InitFloat' && (x.m_nOutputField ?? 3) === 3 && !x.m_nSetMethod);
      if (radI && !dev.radius) { const v = radI.m_InputValue; if (v?.m_nMapType === 'PF_MAP_TYPE_REMAP') ok(e.rl ? rng([e.rl[2], e.rl[3]], [v.m_flOutput0, v.m_flOutput1]) : rng(e.r, [v.m_flOutput0, v.m_flOutput1]), `${tag}: radius = its remap's output ${v.m_flOutput0}–${v.m_flOutput1}`); else if (num(v)) ok(rng(e.r, num(v)), `${tag}: radius ${e.r} = CS2 ${JSON.stringify(num(v))}`); }
      const al = fl(7); ok(rng(e.a || [1, 1], al ? num(al.m_InputValue) : [1, 1], .002), `${tag}: alpha ${JSON.stringify(e.a)} = CS2 ${JSON.stringify(al ? num(al.m_InputValue) : [1, 1])}`);
      // colour: RandomColor (its min white by default) × the drawn renderer's literal colour; ours c0..c1 × cs
      const drawn = rend.find(r => !r.m_bOnlyRenderInEffectsBloomPass), bloom = rend.find(r => r.m_bOnlyRenderInEffectsBloomPass), second = rend.filter(r => !r.m_bOnlyRenderInEffectsBloomPass)[1];
      if (!dev.colour) { const rc = init.find(x => x._class === 'C_INIT_RandomColor'), cmin = v3(rc?.m_ColorMin, [255, 255, 255]), cmax = v3(rc?.m_ColorMax, [255, 255, 255]), cs = drawn?.m_vecColorScale?.m_nType === 'PVEC_TYPE_LITERAL_COLOR' ? v3(drawn.m_vecColorScale.m_LiteralColor) : [255, 255, 255];
        const mine = (c, q) => (c || [255, 255, 255])[q] * (e.cs ? e.cs[q] / 255 : 1), theirs = (c, q) => c[q] * cs[q] / 255;
        ok([0, 1, 2].every(q => near(mine(e.c0, q), theirs(cmin, q), 2) && near(mine(e.c1, q), theirs(cmax, q), 2)), `${tag}: colour ${JSON.stringify(e.c0)}–${JSON.stringify(e.c1)}${e.cs ? ' × ' + JSON.stringify(e.cs) : ''} = CS2 ${JSON.stringify(cmin)}–${JSON.stringify(cmax)} × ${JSON.stringify(cs)}`); }
      // speeds and the start sphere
      if (!dev.speed) { const sp = init.find(x => x._class === 'C_INIT_CreateWithinSphereTransform'), vr = init.find(x => x._class === 'C_INIT_VelocityRandom'), src = vr || sp;
        const lmin = v3(src?.m_LocalCoordinateSystemSpeedMin, [0, 0, 0]), lmax = v3(src?.m_LocalCoordinateSystemSpeedMax, [0, 0, 0]);
        ok(lmin && lmax && [0, 1, 2].every(q => near((e.lmin || [0, 0, 0])[q], lmin[q]) && near((e.lmax || [0, 0, 0])[q], lmax[q])), `${tag}: local speed ${JSON.stringify(e.lmin)}…${JSON.stringify(e.lmax)} = CS2 ${JSON.stringify(lmin)}…${JSON.stringify(lmax)}`);
        const s0 = sp?.m_fSpeedMin ?? 0, s1 = sp?.m_fSpeedMax ?? 0; ok(rng(e.sph || [0, 0], [s0, s1]), `${tag}: sphere speed ${JSON.stringify(e.sph || [0, 0])} = CS2 ${s0}–${s1}`);
        const r0 = sp?.m_fRadiusMin ?? 0, r1 = sp?.m_fRadiusMax ?? 0; ok(rng(e.pos || [0, 0], [r0, r1]), `${tag}: start sphere ${JSON.stringify(e.pos || [0, 0])} = CS2 ${r0}–${r1}`);
        if (sp?.m_vecDistanceBiasAbs?.[2] === 1 && (s1 > 0 || r1 > 0)) ok(!!e.hemi, `${tag}: out of the surface only (vecDistanceBiasAbs z)`);
        const nz = init.find(x => x._class === 'C_INIT_InitialVelocityNoise'); if (nz) ok([0, 1, 2].every(q => near((e.nmin || [0, 0, 0])[q], v3(nz.m_vecOutputMin, [0, 0, 0])[q]) && near((e.nmax || [0, 0, 0])[q], v3(nz.m_vecOutputMax, [0, 0, 0])[q])), `${tag}: velocity noise ${JSON.stringify(e.nmin)}…${JSON.stringify(e.nmax)} = CS2`); }
      // movement, radius curve, fade
      const mv = ops.find(x => x._class === 'C_OP_BasicMovement'); if (mv) ok((e.g || 0) === (mv.m_Gravity?.[2] ?? 0) && (e.drag || 0) === (mv.m_fDrag ?? 0), `${tag}: gravity ${e.g || 0} / drag ${e.drag || 0} = CS2 ${mv.m_Gravity?.[2] ?? 0} / ${mv.m_fDrag ?? 0}`);
      // (v53 MAP fix: the operators too) CS2's world collision: WorldTraceConstraint's bounce, slide and stop speed = wtc
      { const wt = [...ops, ...(d.m_Constraints || [])].find(x => x._class === 'C_OP_WorldTraceConstraint');
        // (a literal: equal; a remap of a particle field (radius, life, age): within its output range — gd-impacts.js says which value and why)
        const fits = (v, mine, def) => { if (v == null) return near(mine, def); if (typeof v === 'number') return near(mine, v); if (v.m_nType === 'PF_TYPE_LITERAL') return near(mine, v.m_flLiteralValue); return mine >= Math.min(v.m_flOutput0, v.m_flOutput1) - 1e-3 && mine <= Math.max(v.m_flOutput0, v.m_flOutput1) + 1e-3; };
        const show = v => v == null ? '-' : typeof v === 'number' ? v : v.m_nType === 'PF_TYPE_LITERAL' ? v.m_flLiteralValue : `${v.m_flOutput0}…${v.m_flOutput1}`;
        if (wt) ok(!!e.wtc && fits(wt.m_flBounceAmount, e.wtc[0], 0) && fits(wt.m_flSlideAmount, e.wtc[1], 0) && fits(wt.m_flStopSpeed, e.wtc[2], -1), `${tag}: lands and bounces as CS2's WorldTraceConstraint (bounce ${show(wt.m_flBounceAmount)}, slide ${show(wt.m_flSlideAmount)}, stop ${show(wt.m_flStopSpeed)}) = ours ${JSON.stringify(e.wtc)}`);
        else ok(!e.wtc, `${tag}: no WorldTraceConstraint in CS2, none here`); }
      const ir = ops.find(x => x._class === 'C_OP_InterpolateRadius'); if (!dev.grow) { const g0 = ir?.m_flStartScale ?? 1, g1 = ir?.m_flEndScale ?? 1, bi = ir?.m_flBias ?? .5, st = ir?.m_flStartTime ?? 0;
        ok(near((e.grow || [1, 1])[0], g0) && near((e.grow || [1, 1])[1], g1) && near(e.rb ?? .5, bi) && near(e.rst || 0, st), `${tag}: radius ×${g0} → ×${g1} (bias ${bi}, from ${st}) = ours ${JSON.stringify(e.grow)} ${e.rb ?? .5} ${e.rst || 0}`); }
      if (!dev.fade) { const fo = ops.find(x => x._class === 'C_OP_FadeOut'), fs = ops.find(x => x._class === 'C_OP_FadeOutSimple'), want = fo ? ((fo.m_flFadeOutTimeMin ?? .25) + (fo.m_flFadeOutTimeMax ?? .25)) / 2 : fs ? fs.m_flFadeOutTime ?? .25 : 0;
        if (!ops.some(x => x._class === 'C_OP_FadeAndKill') && fo?.m_bProportional !== false) ok(near(e.fade || 0, want, .01), `${tag}: fades the last ${e.fade || 0} of its life = CS2 FadeOut ${want}`); }
      // the drawn renderer
      if (drawn) { ok(near(e.ob || 1, lit(drawn.m_flOverbrightFactor) ?? 1), `${tag}: overbright ${e.ob || 1} = CS2 ${lit(drawn.m_flOverbrightFactor) ?? 1}`);
        if (drawn.m_flSelfIllumAmount != null) ok(near(e.si ?? 1, lit(drawn.m_flSelfIllumAmount)), `${tag}: self-illumination ${e.si ?? 1} = CS2 ${lit(drawn.m_flSelfIllumAmount)}`);
        if (drawn.m_flDiffuseAmount != null) ok(near(e.dif || 0, lit(drawn.m_flDiffuseAmount)), `${tag}: diffuse ${e.dif || 0} = CS2 ${lit(drawn.m_flDiffuseAmount)}`);
        if (drawn._class === 'C_OP_RenderTrails') { if (e.tmax) ok(e.tmax === drawn.m_flMaxLength, `${tag}: trail cap ${e.tmax} = CS2 ${drawn.m_flMaxLength}`); ok(near(e.tin || 0, lit(drawn.m_flLengthFadeInTime) ?? 0), `${tag}: length fade-in ${e.tin || 0} s = CS2 ${lit(drawn.m_flLengthFadeInTime) ?? 0}`);
          if (drawn.m_nPrevPntSource === 17) ok(e.tt === 'cp', `${tag}: drawn from the hit point (nPrevPntSource 17)`);
          if (drawn.m_flHeadAlphaScale != null) ok(near(e.ha ?? 1, lit(drawn.m_flHeadAlphaScale)), `${tag}: head alpha ${e.ha} = CS2 ${lit(drawn.m_flHeadAlphaScale)}`); }
        if (drawn.m_flMaxSize != null) ok(near(e.smax || 0, lit(drawn.m_flMaxSize)), `${tag}: screen cap ${e.smax} = CS2 flMaxSize ${lit(drawn.m_flMaxSize)}`);
        const rs = lit(drawn.m_flRadiusScale); if (!dev.radius && typeof rs === 'number') ok(near(e.rs || 1, rs), `${tag}: radius scale ${e.rs || 1} = CS2 ${rs}`);
        const as = lit(drawn.m_flAlphaScale); if (typeof as === 'number') ok(near(e.as || 1, as), `${tag}: alpha scale ${e.as || 1} = CS2 ${as}`); }
      // the halo: the bloom-pass renderer, or a second drawn sprite
      const H = bloom || (second?._class === 'C_OP_RenderSprites' && drawn?._class === 'C_OP_RenderSprites' ? second : null);
      if (H && e.h && !dev.halo) { const h = e.h; ok(!!h.bloom === !!H.m_bOnlyRenderInEffectsBloomPass, `${tag}: its halo is CS2's ${H.m_bOnlyRenderInEffectsBloomPass ? 'bloom-pass' : 'second'} renderer`);
        ok(near(h.ob || 1, lit(H.m_flOverbrightFactor) ?? 1), `${tag}: halo overbright ${h.ob || 1} = CS2 ${lit(H.m_flOverbrightFactor) ?? 1}`);
        const hr = lit(H.m_flRadiusScale) ?? 1, ha = lit(H.m_flAlphaScale) ?? 1; ok(Array.isArray(hr) ? rng(h.rs, hr) : near(typeof h.rs === 'number' ? h.rs : -1, hr) || (h.rs === 1.5 && /glow/.test(tag)), `${tag}: halo radius ×${JSON.stringify(h.rs)} = CS2 ${JSON.stringify(hr)}`);
        ok(Array.isArray(ha) ? rng(h.a, ha) : near(typeof h.a === 'number' ? h.a : -1, ha), `${tag}: halo alpha ${JSON.stringify(h.a)} = CS2 ${JSON.stringify(ha)}`);
        const vc = H.m_vecColorScale; if (vc?.m_nType === 'PVEC_TYPE_LITERAL_COLOR' && !h.raw) ok([0, 1, 2].every(q => near(h.c0[q], vc.m_LiteralColor[q], 1)), `${tag}: halo colour ${h.c0} = CS2 ${vc.m_LiteralColor.slice(0, 3)}`);
        if (vc?.m_nType === 'PVEC_TYPE_FLOAT_INTERP_GRADIENT') { const st = vc.m_Gradient.m_Stops.map(s => s.m_Color.slice(0, 3)); ok(st.some(c => c.every((v, q) => near(v, h.c0[q], 1))) && st.some(c => c.every((v, q) => near(v, (h.c1 || h.c0)[q], 1))), `${tag}: halo ${h.c0} → ${h.c1} are its gradient's stops`); } }
      else if (bloom && !e.h && !dev.halo) ok(false, `${tag}: its bloom-pass renderer is not drawn`);
      checked++; }
    // each surface's CS2 tree: every child drawn (FX) or listed as left out (LEFT_OUT)
    const ROOT = { metal: 'impact_metal', concrete: 'impact_concrete', plaster: 'impact_plaster', tile: 'impact_tile', wood: 'impact_wood', glass: 'impact_glass', dirt: 'impact_dirt' };
    for (const [kind, root] of Object.entries(ROOT)) { const names = new Set(), walk = n => { if (names.has(n)) return; const d = file(n); if (!d) return; names.add(n); if (n !== root || (d.m_Renderers || []).length) ; for (const c of d.m_Children || []) if (!c.m_bDisableChild) walk(c.m_ChildRef.split('/').pop().replace('.vpcf', '')); }; walk(root);
      const drawn = new Set(FX[kind].map(e => e.src)), left = LEFT_OUT[kind] || {}, miss = [...names].filter(n => !drawn.has(n) && !left[n] && !(n === root && !(file(n).m_Renderers || []).length));
      ok(!miss.length, `${kind}: every child of ${root}.vpcf drawn or listed as left out${miss.length ? ' — missing ' + miss.join(', ') : ''}`); }
    // the holes: each decal group's first material
    execFileSync(S2V, ['-i', VPK, '-f', 'scripts/decalgroups.vdata_c', '-o', tmp, '-d'], { stdio: 'ignore' }); const groups = kv3(readFileSync(path.join(tmp, 'scripts', 'decalgroups.vdata'), 'utf8'));
    for (const g of ['Impact.Concrete', 'Impact.Metal', 'Impact.Wood', 'Impact.Glass', 'Impact.Dirt', 'Impact.Plaster', 'Impact.Tile', 'Impact.Rock']) {
      const m = groups?.[g]?.m_vecOptions?.[0]?.m_hMaterial; if (!m) { ok(false, g + ' in decalgroups.vdata'); continue; }
      execFileSync(S2V, ['-i', VPK, '-f', m + '_c', '-o', tmp, '-d'], { stdio: 'ignore' }); const t = readFileSync(path.join(tmp, m), 'utf8'), w = +(/"DecalWorldWidth"\s*"([\d.]+)"/.exec(t) || [])[1], v = +(/"DecalSizeVariance"\s*"([\d.]+)"/.exec(t) || [])[1];
      ok(I.DECAL_SIZE[g][0] === w && I.DECAL_SIZE[g][1] === v, `${g}: hole ${I.DECAL_SIZE[g][0]} HU ±${I.DECAL_SIZE[g][1]} = CS2 ${m.split('/').pop()} ${w} ±${v}`); checked++; }
    verified = `${checked} emitters and holes checked against the user's CS2 install`;
  } catch (e) { ok(false, 'reading the CS2 install: ' + e.message); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (fails) { console.error(`FAIL: gd-impacts · ${fails} of ${n}`); process.exit(1); }
console.log(`PASS: gd-impacts · ${n} checks (metal → CS2 sparks, concrete / plaster dust + chips, wood chips, glass shards, sand puffs, doors by model, helmet headshot → dink sparks, bare head → blood only; 3 pools one draw each, caps, LOD0 on Low; no allocation per impact or frame; ${verified})`);
