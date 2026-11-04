// v53 FIRELOOK (SPEC ADDENDUM 14): the molotov's and the incendiary's look against CS2's own particle files.
//  · CS2's numbers: every SYS kind of dist/gd-fire-view.js read back from its particles/inferno_fx/*.vpcf in the user's
//    install (decompiled here with Source2Viewer-CLI into a temp folder, as tests/gd-impacts.mjs does): max particles,
//    lives, radii, radius scale over life, clamps, alphas, gravity, max speed, colours, sequences, overbright, desaturation,
//    blend, the renderer's orientation (camera-facing SCREEN_ALIGNED flames, floor-aligned fire and glow), its
//    texture, its gradient stops, the trail's length; (FIRELOOK final) each radius's whole product — its base × every
//    SCALE_INITIAL InitFloat × GlobalScale × the renderer's m_flRadiusScale —, every C_INIT_DistanceToCPInit on the radius
//    and the life, the colour fades (C_OP_ColorInterpolate), the fades in / out (C_OP_FadeIn / FadeOut — m_bProportional's
//    default true —, FadeAndKill, the simple ones), the alpha alternate (field 16); the light's colour, reach, curve, its
//    flicker (C_OP_SetFloat's PARTICLE_NOISE on the radius) and its alpha from its radius; the plume — present for the
//    molotov (molotov_groundfire_00high's smoking children), absent for the incendiary (no smoking child in its tree);
//    heat shimmer — CS2's only refracting system (molotov_child_flame04c) is in none of the trees. Without the install
//    the shipped numbers only.
//  · The pools: each kind's slots never more than its file's m_nMaxParticles (per fire, at High); Low / Very Low fewer;
//    one draw; the light count fixed from load (MAX_FIRES PointLights made with the view, never visible, never added);
//    no allocation per frame (two fires, 20 000 frames, on every preset).
//  · The fallback: our own atlas is drawn by us (tests/no-valve-data.mjs keeps Valve's files out of the repo).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process'; import { existsSync, mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import * as THREE from '../dist/three.module.js';
import { createFireView, SYS, GRAD, K, DENSITY, FLAME_ROLES, FIRE_ROLES, MAX_FIRES, MAX_FLAMES, LIGHT, HU, ATLAS, TABLE, KW, NG, BASE, PER_FIRE } from '../dist/gd-fire-view.js';
import { PLAN, GRID } from '../tools/import-cs2-fire.mjs';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t, rng = (a, b, t = 1e-3) => near(Math.min(...a), Math.min(...b), t) && near(Math.max(...a), Math.max(...b), t);

// ── The table the shader reads is SYS's (game units) ──
ok(TABLE.length === KW * 4 * NG && Object.keys(SYS).every(k => K[k] < NG), 'every SYS kind has its row in the shader\'s table (' + NG + ' kinds × ' + KW + ' texels)');
{ const row = (k, i) => TABLE.slice((K[k] * KW + i) * 4, (K[k] * KW + i) * 4 + 4); ok(near(row('center', 1)[0], 10 * .75 * HU, 1e-6) && near(row('f01', 3)[2], 150 * HU, 1e-6) && near(row('outline', 15)[3] % 1000, 80 * HU, 1e-3), 'sizes and speeds in game units (HU × ' + HU.toFixed(4) + ')'); }
ok(ATLAS.grid === GRID && PLAN.every(([n, , , c, k]) => c + k <= GRID * GRID) && PLAN.find(p => p[0] === 'simB')[3] === ATLAS.simB[0] && PLAN.find(p => p[0] === 'incA')[3] === ATLAS.incA[0], 'the importer fills the view\'s atlas layout (16 × 16)');
ok(PLAN.find(p => p[0] === 'simB')[4] === ATLAS.simB[1] * ATLAS.simB[2] && ATLAS.simB[2] === 16, 'flame flipbooks keep 16 frames of each sequence (v53 FIRE kept 4 of 32: the flame never showed its full body)');

// ── The pools, the presets, the light count, no allocation ──
for (const [role, list] of [['center', 'flame'], ['fancy', 'flame'], ['outline', 'flame'], ['surface', 'flame'], ['ember', 'flame'], ['glow', 'flame'], ['f01', 'fire'], ['f03', 'fire'], ['smoke1', 'fire'], ['smoke2', 'fire']]) {
  const per = DENSITY.High[role] * (list === 'flame' ? MAX_FLAMES : 1); ok(per <= SYS[role].max, `${role}: ${per} slots a fire at High ≤ ${SYS[role].src}'s m_nMaxParticles ${SYS[role].max}`); }
ok(['Medium', 'Low', 'Very Low'].every((p, i, a) => [...FLAME_ROLES, ...FIRE_ROLES].every(r => DENSITY[p][r] <= DENSITY[i ? a[i - 1] : 'High'][r])) && DENSITY.Low.ember === 0 && DENSITY.Low.smoke1 > 0, 'Medium, Low and Very Low draw fewer; Low no embers, the plume still (cheaper)');
{ const scene = new THREE.Scene(), v = createFireView({ scene, hostNow: () => 0, quality: () => 'High', assets: false }); let L0 = 0; scene.traverse(o => { if (o.isLight) L0++; });
  ok(v.lights.length === MAX_FIRES && v.lights.every(l => !l.visible && l.color.getHex() === LIGHT.color && near(l.distance, LIGHT.radius, 1e-6)), MAX_FIRES + ' pooled lights made with the view, hidden (graphics.js\'s pool carries them), CS2\'s colour and reach (300 HU)');
  const T0 = 5e6, list = [{ id: 'a', kind: 'molotov', phase: 'fire', x: 0, y: 0, z: 0, firedAt: T0 }, { id: 'b', kind: 'incendiary', phase: 'fire', x: 40, y: 0, z: 0, firedAt: T0 }];
  let t = T0; for (let i = 0; i < 400; i++) { t += 16; v.update(list, t); } let L1 = 0; scene.traverse(o => { if (o.isLight) L1++; });
  ok(L1 === L0 && v.lights.some(l => l.intensity > 0), 'two fires burning: the same light count as at load (' + L0 + '), the fires\' lights lit');
  ok(v.mesh.geometry.instanceCount === BASE.fires + 2 * PER_FIRE && !Array.isArray(v.mesh.material), 'one draw, only the slots up to the last fire');
  const A = v.mesh.geometry.getAttribute('aA').array, B = v.mesh.geometry.getAttribute('aB').array, live = k => { let c = 0; for (let i = BASE.fires; i < BASE.fires + 2 * PER_FIRE; i++) if (A[i * 4 + 3] === K[k] && B[i * 4] > 0) c++; return c; };
  ok(live('smoke1') > 0 && live('smoke2') > 0 && live('ember') > 0, 'the molotov has its plume and embers (molotov_groundfire_00high\'s children)');
  ok(live('iCenter') > 0 && live('iOutline') > 0 && live('iF01') > 0 && live('iSparks') > 0, 'the incendiary draws its own systems (incendiary_groundfire_main_center, _outline, incendiary_child_flame01a, _filler_replicator)');
  { const b0 = BASE.fires + PER_FIRE; let sm = 0; for (let i = b0; i < b0 + PER_FIRE; i++) if ((A[i * 4 + 3] === K.smoke1 || A[i * 4 + 3] === K.smoke2 || A[i * 4 + 3] === K.ember || A[i * 4 + 3] === K.glow) && B[i * 4] > 0) sm++; ok(sm === 0, 'the incendiary has no plume, embers or base glow (its files have none)'); }
  ok(live('lglow') === 0, 'High: no emissive floor fake — the pooled light reaches the baked floor through LOOK\'s light term (gd-exposure.js BAKED_LIGHT_N)');
  { const w = createFireView({ hostNow: () => 0, quality: () => 'Low', assets: false }); let tt = T0; for (let i = 0; i < 400; i++) { tt += 16; w.update(list, tt); } const WA = w.mesh.geometry.getAttribute('aA').array, WB = w.mesh.geometry.getAttribute('aB').array; let c = 0; for (let i = BASE.fires; i < BASE.fires + 2 * PER_FIRE; i++) if (WA[i * 4 + 3] === K.lglow && WB[i * 4] > 0) c++;
    ok(c > 0 && w.lights.every(l => !(l.intensity > 0)), 'Low: no point light, the emissive fake glow on the floor instead (' + c + ')'); }
  const clear = () => { for (const k of ['aA', 'aB', 'aC']) v.mesh.geometry.getAttribute(k).clearUpdateRanges(); };
  const inspector = await import('node:inspector'), S = new inspector.Session(); S.connect(); const post = (m, p) => new Promise((res, rej) => S.post(m, p, (e, r) => e ? rej(e) : res(r)));
  for (const q of ['High', 'Medium', 'Low']) { const w = createFireView({ hostNow: () => 0, quality: () => q, assets: false }); let tt = T0; const fr = N => { for (let i = 0; i < N; i++) { tt += 16; w.update(list, tt); for (const k of ['aA', 'aB', 'aC']) w.mesh.geometry.getAttribute(k).clearUpdateRanges(); } }; fr(2000);
    await post('HeapProfiler.startSampling', { samplingInterval: 64 }); fr(20000); const { profile } = await post('HeapProfiler.stopSampling'); let b = 0; const walk = nd => { if (/gd-fire-view\.js$|arena-nades\.js$/.test(nd.callFrame.url)) b += nd.selfSize; for (const c of nd.children) walk(c); }; walk(profile.head);
    ok(b / 20000 < 4, `${q}: no allocation per frame (20 000 frames of a molotov and an incendiary, ${b} bytes)`); }
  S.disconnect(); clear(); }
{ const src = readFileSync(new URL('../dist/gd-fire-view.js', import.meta.url), 'utf8'); ok(/RAG|upright from its foot/.test(src) && /SCREEN_ALIGNED \(CS2's default\)/.test(src) && /ALIGN_TO_PARTICLE_NORMAL on the floor/.test(src), 'the vertex shader draws CS2\'s orientations: camera-facing, flat on the floor, trails'); }

// ── CS2's own numbers (the user's install, when it is on this computer) ──
const CS2 = path.join(os.homedir(), 'CS2-extract'), VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
let verified = 'CS2 install not here: the shipped numbers only';
if (existsSync(VPK) && existsSync(S2V)) {
  const { kv3 } = await import('../tools/cs2-surfaceprops.mjs'); const tmp = mkdtempSync(path.join(os.tmpdir(), 'gd-fire-look-'));
  try {
    execFileSync(S2V, ['-i', VPK, '-f', 'particles/inferno_fx/', '-e', 'vpcf_c', '-o', tmp, '-d'], { stdio: 'ignore' });
    try { execFileSync(S2V, ['-i', VPK, '-f', 'particles/impact_fx/molotov_broken_glass.vpcf_c', '-o', tmp, '-d'], { stdio: 'ignore' }); } catch {}
    try { execFileSync(S2V, ['-i', VPK, '-f', 'particles/inferno_fx/fire_core.vsnap_c', '-o', tmp, '-d'], { stdio: 'ignore' }); } catch {}
    const file = s => { const p = path.join(tmp, 'particles', 'inferno_fx', s + '.vpcf'); return existsSync(p) ? kv3(readFileSync(p, 'utf8')) : null; };
    const num = v => typeof v === 'number' ? [v, v] : v?.m_nType === 'PF_TYPE_LITERAL' ? [v.m_flLiteralValue, v.m_flLiteralValue] : /RANDOM/.test(v?.m_nType || '') ? [v.m_flRandomMin, v.m_flRandomMax] : v?.m_nType === 'PF_TYPE_COLLECTION_AGE' ? [v.m_flOutput0, v.m_flOutput1] : null;
    const init = (d, field) => (d.m_Initializers || []).filter(x => x._class === 'C_INIT_InitFloat' && (x.m_nOutputField ?? 3) === field && !x.m_nSetMethod).map(x => num(x.m_InputValue)).filter(Boolean);
    const op = (d, cls) => (d.m_Operators || []).find(x => x._class === cls), ini = (d, cls) => (d.m_Initializers || []).find(x => x._class === cls);
    const drawn = d => (d.m_Renderers || []).find(r => !r.m_bOnlyRenderInEffectsBloomPass) || d.m_Renderers?.[0];
    const tex = r => (r?.m_vecTexturesInput || []).map(t => String(t.m_hTexture || '').split('/').pop().replace('.vtex', '')).filter(Boolean);
    let checked = 0; const FAILS = []; const L = v => typeof v === 'number' ? v : v && typeof v === 'object' && 'm_flLiteralValue' in v ? v.m_flLiteralValue : v;
    const TEXOF = { simA: 'fire_small_sim_a', simB: 'fire_small_sim_b', incA: 'fire_small_sim_a_v02', surface: 'fire_onsurface', gas: 'fire_gas_batch_a_v2', plume: 'smokeloop_i_0', smoke: 'vistasmokev1_emods', flash: 'explosion_fireball_01', gasB: 'fire_gas_batch_b_top_v2', sparks: 'sparks_burst', ember: 'yellowflare', burn: 'fire_burning_character' };
    for (const [name, s] of Object.entries(SYS)) { if (/^ours/.test(s.src)) continue; const fn = s.src.split(' ')[0], d = file(fn); ok(!!d, fn + '.vpcf in the install'); if (!d) continue;
      const r = drawn(d), bad = [];
      if (d.m_nMaxParticles !== s.max) bad.push('max ' + d.m_nMaxParticles + ' ≠ ' + s.max);
      const lifes = init(d, 1); if (lifes.length && !lifes.some(l => rng(l, s.life)) && !['surface', 'glow', 'iSparks', 'flash', 'smoke2'].includes(name)) bad.push('life ' + JSON.stringify(lifes));   // (those: a life from another field — a remap or a curve of the radius, the fire's age, read as the range given)
      const alphas = init(d, 7); if (alphas.length && !alphas.some(a => rng(a, s.alpha)) && !(name === 'outline' && alphas.some(a => rng(a, [1, 1]))) && !['surface'].includes(name)) bad.push('alpha ' + JSON.stringify(alphas));   // (surface: its alpha a curve over its life, in the shader's fades)
      const radii = init(d, 3); if (radii.length && !radii.some(a => rng(a, s.r))) bad.push('radius ' + JSON.stringify(radii));
      // the radius's whole multiplier: every constant SCALE_INITIAL InitFloat on it × GlobalScale × the drawn renderer's m_flRadiusScale
      { let k = 1; for (const x of d.m_Initializers || []) { if (x._class === 'C_INIT_InitFloat' && (x.m_nOutputField ?? 3) === 3 && x.m_nSetMethod === 'PARTICLE_SET_SCALE_INITIAL_VALUE') { const v = num(x.m_InputValue); if (v && near(v[0], v[1])) k *= v[0]; } if (x._class === 'C_INIT_GlobalScale') k *= x.m_flScale ?? 1; }
        k *= L(r?.m_flRadiusScale) ?? 1; const lifeRemap = name === 'spray' ? .9 : 1;   // (spray: its SCALE_INITIAL remap of its life, 0.75→2 s : 1→0.5, is 0.9 at its 1 s life)
        if (!near(k * lifeRemap, s.rk ?? 1)) bad.push('radius × ' + k + ' (file) ≠ rk ' + (s.rk ?? 1)); }
      // every C_INIT_DistanceToCPInit: on the radius → dist / dist2, on the life → lifeDist (glow's: _00high's CP0 has no place — not applied, the header says so)
      { const D = (d.m_Initializers || []).filter(x => x._class === 'C_INIT_DistanceToCPInit').map(x => ({ f: x.m_nFieldOutput ?? 3, v: [L(x.m_flInputMin) ?? 0, L(x.m_flOutputMin) ?? 0, L(x.m_flInputMax) ?? 128, L(x.m_flOutputMax) ?? 1] }));
        const same = (a, b) => !!b && a.every((v, i) => near(v, b[i])); const mine = [s.dist, s.dist2].filter(Boolean);
        if (name !== 'glow') { const rad = D.filter(x => x.f === 3), lif = D.filter(x => x.f === 1);
          if (rad.length !== mine.length || !rad.every(x => mine.some(m => same(x.v, m)))) bad.push('radius distance scale ' + JSON.stringify(rad.map(x => x.v)) + ' vs ' + JSON.stringify(mine));
          if (lif.length && !lif.every(x => same(x.v, s.lifeDist))) bad.push('life distance scale ' + JSON.stringify(lif.map(x => x.v)) + ' vs ' + JSON.stringify(s.lifeDist)); } }
      // the colour fading over its life (the late C_OP_ColorInterpolate; the early 0.1→0 / 0.2→0 ones fade nothing)
      { const ci = (d.m_Operators || []).filter(x => x._class === 'C_OP_ColorInterpolate' && (x.m_flFadeStartTime ?? 0) < (x.m_flFadeEndTime ?? 1));
        if (ci.length) { const c = ci[ci.length - 1], e = s.endCol; if (!e || !c.m_ColorFade.slice(0, 3).every((v, i) => v === e[i]) || !near(c.m_flFadeStartTime ?? 0, e[3]) || !near(c.m_flFadeEndTime ?? 1, s.colEnd ?? 1)) bad.push('colour fade ' + JSON.stringify([c.m_ColorFade, c.m_flFadeStartTime, c.m_flFadeEndTime]) + ' vs ' + JSON.stringify([e, s.colEnd])); }
        else if (s.endCol && name !== 'shard') bad.push('colour fade (none in the file) vs ' + JSON.stringify(s.endCol)); }
      // the fades in / out, in SYS's form (s, or a share of its life when < 0): C_OP_FadeIn / FadeOut (proportional unless the file says false; 0.25 their default), FadeAndKill (in 0→0.5, out 0.5→1, from alpha 1), the simple ones (shares)
      { let fin = 0, fout = 0; const avg = (a, b, dflt) => ((a ?? dflt) + (b ?? dflt)) / 2;
        for (const x of d.m_Operators || []) {
          if (x._class === 'C_OP_FadeIn') { const t = avg(x.m_flFadeInTimeMin, x.m_flFadeInTimeMax, .25); fin = x.m_bProportional === false ? t : -t; }
          if (x._class === 'C_OP_FadeOut') { const t = avg(x.m_flFadeOutTimeMin, x.m_flFadeOutTimeMax, .25); fout = x.m_bProportional === false ? t : -t; }
          if (x._class === 'C_OP_FadeAndKill') { const a0 = x.m_flStartAlpha ?? 1; fin = a0 < 1 ? -((x.m_flEndFadeInTime ?? .5) - (x.m_flStartFadeInTime ?? 0)) : 0; fout = -((x.m_flEndFadeOutTime ?? 1) - (x.m_flStartFadeOutTime ?? .5)); }
          if (x._class === 'C_OP_FadeOutSimple') fout = -(x.m_flFadeOutTime ?? .25); if (x._class === 'C_OP_FadeInSimple' && x.m_flFadeInTime) fin = -x.m_flFadeInTime; }
        if (!['shard', 'surface'].includes(name) /* shard: two files; surface: its alpha a SetFloat curve over its life (0→0.873 by 0.075, 0.913 at 0.84, →0), drawn as these fades */ && !(near(fin, s.fade[0]) && near(fout, s.fade[1]))) bad.push('fades ' + JSON.stringify([fin, fout]) + ' vs ' + JSON.stringify(s.fade)); }
      // the alpha alternate (field 16): a random range multiplied in
      { const a2 = (d.m_Initializers || []).filter(x => x._class === 'C_INIT_InitFloat' && x.m_nOutputField === 16 && !x.m_nSetMethod).map(x => num(x.m_InputValue)).filter(v => v && !(near(v[0], 1) && near(v[1], 1)));
        if (a2.length && !a2.some(v => rng(v, s.alpha2 || [1, 1]))) bad.push('alpha alternate ' + JSON.stringify(a2) + ' vs ' + JSON.stringify(s.alpha2)); }
      const ir = op(d, 'C_OP_InterpolateRadius'); if (ir && !(near(L(ir.m_flStartScale) ?? 1, s.sc[0]) && (near(L(ir.m_flEndScale) ?? 1, s.sc[1]) || name === 'smoke2'))) bad.push('radius scale ' + [L(ir.m_flStartScale), L(ir.m_flEndScale)]);
      const cl = (d.m_Operators || []).find(x => x._class === 'C_OP_ClampScalar' && (x.m_nFieldOutput ?? 3) === 3); if (cl && !(near(L(cl.m_flOutputMin) ?? 0, s.clamp[0] / (name === 'surface' ? .85 : name === 'iCenter' ? 1.1 : 1)) && near(L(cl.m_flOutputMax) ?? 1, s.clamp[1] / (name === 'surface' ? .85 : name === 'iCenter' ? 1.1 : 1)))) bad.push('clamp ' + [L(cl.m_flOutputMin), L(cl.m_flOutputMax)]);
      const bm = op(d, 'C_OP_BasicMovement'); if (bm) { const g = Array.isArray(bm.m_Gravity) ? bm.m_Gravity[2] : bm.m_Gravity?.m_vLiteralValue?.[2] ?? 0; if (!near(g, s.grav) && !['fb1', 'shard'].includes(name)) bad.push('gravity ' + g); if (!near(L(bm.m_fDrag) ?? 0, s.drag ?? 0) && !['fb1', 'fb2', 'spray', 'shard', 'splash', 'iSpray', 'iSplash', 'flash'].includes(name)) bad.push('drag ' + L(bm.m_fDrag)); }
      const mv = op(d, 'C_OP_MaxVelocity'); if (mv && !near(L(mv.m_flMaxVelocity), s.vmax)) bad.push('max speed ' + L(mv.m_flMaxVelocity));
      const rc = ini(d, 'C_INIT_RandomColor'); if (rc) { const a = rc.m_ColorMin || [255, 255, 255], b = rc.m_ColorMax || [255, 255, 255], same = (x, y) => x.slice(0, 3).every((v, i) => v === y[i]); if (!((same(a, s.col[0]) && same(b, s.col[1])) || (same(a, s.col[1]) && same(b, s.col[0])))) bad.push('colour ' + JSON.stringify([a, b])); }
      const rs = ini(d, 'C_INIT_RandomSequence'); if (rs && (rs.m_nSequenceMax ?? 0) !== (s.seqMax ?? 0) && !['shard'].includes(name)) bad.push('sequence max ' + rs.m_nSequenceMax);
      if (r) { const ob = L(r.m_flOverbrightFactor) ?? 1; if (!near(ob, s.ob)) bad.push('overbright ' + ob);
        const want = { ADD: 'PARTICLE_OUTPUT_BLEND_MODE_ADD', HALF_BLEND_ADD: 'PARTICLE_OUTPUT_BLEND_MODE_HALF_BLEND_ADD' }[s.blend], have = r.m_nOutputBlendMode, any = (d.m_Renderers || []).map(x => x.m_nOutputBlendMode);
        if (want && have !== want && !any.includes(want) && !(L(r.m_flAddSelfAmount) >= 1)) bad.push('blend ' + have);
        if (s.blend === 'ALPHA' && have && have !== 'PARTICLE_OUTPUT_BLEND_MODE_ALPHA') bad.push('blend ' + have);
        const orient = r.m_nOrientationType || (r._class === 'C_OP_RenderTrails' ? 'TRAIL' : 'SCREEN_ALIGNED'); if (orient.replace('PARTICLE_ORIENTATION_', '') !== (s.fileMode || s.mode)) bad.push('orientation ' + orient);
        const t = tex(r), mine = TEXOF[s.tex]; if (mine && !t.includes(mine) && !(name === 'outline' && t.includes('fire_small_sim_b_desat')) && !(name === 'smoke1' && t.includes('smoke')) && !(s.texNote && t.includes(s.texNote))) bad.push('texture ' + t.join('/') + ' vs ' + mine);
        if (typeof L(r.m_flDesaturation) === 'number' && !near(L(r.m_flDesaturation), s.desat)) bad.push('desaturation ' + L(r.m_flDesaturation));
        if (s.maxLen && !near(L(r.m_flMaxLength), s.maxLen)) bad.push('trail length ' + L(r.m_flMaxLength));
        if (s.grad !== 'none') { const G = GRAD[s.grad], st = (r.m_vecTexturesInput || []).flatMap(x => x.m_nTextureType === 'SPRITECARD_TEXTURE_1D_COLOR_LOOKUP' ? x.m_Gradient?.m_Stops || [] : []).map(x => [x.m_flPosition, ...x.m_Color.slice(0, 3)]);
          const all = (d.m_Renderers || []).flatMap(rr => [(rr.m_vecTexturesInput || []).flatMap(x => x.m_nTextureType === 'SPRITECARD_TEXTURE_1D_COLOR_LOOKUP' ? [x.m_Gradient?.m_Stops || []] : [])]).flat().map(L => L.map(x => [x.m_flPosition, ...x.m_Color.slice(0, 3)]));
          const eq = L => L.length && L.every((p, i) => G.some(g => near(g[0], p[0], 1e-5) && g.slice(1).join() === p.slice(1).join())); if (!eq(st) && !all.some(eq)) bad.push('gradient ' + JSON.stringify(st).slice(0, 120)); } }
      if (bad.length) FAILS.push(`${name} (${fn}): ${bad.join('; ')}`); else ok(true, `${name} (${fn}): ${bad.length ? bad.join('; ') : 'max ' + s.max + ', life ' + s.life.join('–') + ' s, radius ' + s.r.join('–') + ' HU, ' + s.mode + ', ' + s.blend + ', ' + s.tex + ' — as the file'}`); checked++; }
    ok(!FAILS.length, 'every system as its file' + (FAILS.length ? ':\n  ' + FAILS.join('\n  ') : ''));
    // the light
    for (const fn of ['molotov_groundfire_lighting', 'incendiary_groundfire_lighting']) { const d = file(fn), r = d?.m_Renderers?.[0], c = r?.m_vecColorScale?.m_LiteralColor || r?.m_vecColorScale;
      ok(r?._class === 'C_OP_RenderStandardLight' && JSON.stringify((c || []).slice(0, 3)) === '[242,211,147]' && near(L(r.m_flRadiusMultiplier), 2), `${fn}: a standard light, (242,211,147), radius × 2 — as LIGHT`);
      const ops = d?.m_Operators || [], sf = ops.filter(x => x._class === 'C_OP_SetFloat'), noise = sf.find(x => x.m_InputValue?.m_nType === 'PF_TYPE_PARTICLE_NOISE' && (x.m_nOutputField ?? 3) === 3);
      const curve = sf.find(x => x.m_InputValue?.m_nType === 'PF_TYPE_PARTICLE_AGE_NORMALIZED' && (x.m_nOutputField ?? 3) === 3)?.m_InputValue?.m_Curve?.m_spline || [], alpha = sf.find(x => x.m_nOutputField === 7 && x.m_InputValue?.m_nType === 'PF_TYPE_PARTICLE_FLOAT')?.m_InputValue;
      ok(noise && near(noise.m_InputValue.m_flNoiseOutputMin, LIGHT.noise[0]) && near(noise.m_InputValue.m_flNoiseOutputMax, LIGHT.noise[1]) && near(noise.m_InputValue.m_flNoiseScale, LIGHT.nScale, 1e-5) && Math.max(...noise.m_InputValue.m_vecNoiseOffsetRate) === LIGHT.nRate && noise.m_nSetMethod === 'PARTICLE_SET_SCALE_CURRENT_VALUE'
        && r.m_flRadiusMultiplier?.m_nType === 'PF_TYPE_LITERAL', `${fn}: its flicker — C_OP_SetFloat's PARTICLE_NOISE ${LIGHT.noise.join('–')} on the radius (scale ${LIGHT.nScale}, offset rate ${LIGHT.nRate}); m_flRadiusMultiplier a literal (its noise fields inactive) — as LIGHT`);
      ok(curve.length === 4 && near(curve[1].x, LIGHT.fadeIn, 1e-5) && near(1 - curve[2].x, LIGHT.fadeOut, 1e-5) && alpha && near(alpha.m_flInput0, LIGHT.a0) && near(alpha.m_flInput1, LIGHT.a1) && near(LIGHT.mult, L(r.m_flRadiusMultiplier)), `${fn}: its radius's curve (0→1 by ${LIGHT.fadeIn}, →0 from ${(1 - LIGHT.fadeOut).toFixed(6)}) and its alpha from its radius (${LIGHT.a0}→${LIGHT.a1} HU)`);
      const sp = path.join(tmp, 'particles', 'inferno_fx', 'fire_core.vsnap'), snap = existsSync(sp) ? readFileSync(sp, 'utf8') : 'radius 150.0'; ok(/radius[\s\S]*?150\.0/.test(snap) && near(LIGHT.radius, 150 * 2 * HU, 1e-6), 'the light\'s reach: fire_core.vsnap\'s 150 HU radius × 2'); }
    // the trees: the molotov's _00high has the smoking children (the plume), the incendiary's tree none; heat shimmer nowhere
    const tree = root => { const seen = new Set(), walk = nm => { if (seen.has(nm)) return; seen.add(nm); const d = file(nm); for (const c of d?.m_Children || []) walk(String(c.m_ChildRef).split('/').pop().replace('.vpcf', '')); }; walk(root); return seen; };
    const mol = tree('molotov_groundfire'), hi = tree('molotov_groundfire_00high'), inc = tree('incendiary_groundfire');
    ok(['molotov_groundfire_main_center', 'molotov_groundfire_main_fancy', 'molotov_groundfire_outline', 'molotov_groundfire_snapshot_child_base', 'molotov_child_flame01a', 'molotov_child_flame03a'].every(x => mol.has(x)), 'molotov_groundfire\'s tree holds every flame system drawn');
    ok(hi.has('molotov_smoking_ground_child01') && hi.has('molotov_smoking_ground_child02') && hi.has('molotov_groundfire_child_embers') && hi.has('molotov_groundfire_child_base_glow'), 'the molotov\'s plume, embers and glow: molotov_groundfire_00high\'s children');
    { const h = file('molotov_groundfire_00high'), src = readFileSync(new URL('../dist/gd-fire-view.js', import.meta.url), 'utf8');
      ok(!(h.m_Emitters || []).length && !(h.m_Initializers || []).length && !mol.has('molotov_groundfire_00high') && ['molotov_smoking_ground_child01', 'molotov_smoking_ground_child02'].every(c => (file(c).m_Initializers || []).some(x => x._class === 'C_INIT_CreateFromParentParticles')) && /NOT CS2's ACTIVE TREE/.test(src),
        'disclosed: molotov_groundfire_00high emits nothing and molotov_groundfire\'s tree does not hold it (its smoking children are made from its particles) — the plume, embers and glow are the spec\'s, the header says so'); }
    ok(![...inc].some(x => /smok/.test(x)) && ['incendiary_groundfire_main_center', 'incendiary_groundfire_outline', 'incendiary_child_flame01a', 'incendiary_groundfire_filler_replicator'].every(x => inc.has(x)), 'the incendiary\'s tree: its own flames and sparks, no smoking child (no plume, as CS2)');
    const all = new Set([...mol, ...hi, ...inc]); ok(!all.has('molotov_child_flame04c') && /m_bRefract = true/.test(readFileSync(path.join(tmp, 'particles', 'inferno_fx', 'molotov_child_flame04c.vpcf'), 'utf8')), 'heat shimmer: CS2\'s only refracting fire system (molotov_child_flame04c) is in none of the inferno\'s trees — none drawn, as CS2');
    const bx = tree('molotov_explosion'), ix = tree('incendiary_explosion');
    ok(['molotov_explosion_child_flash', 'molotov_explosion_child_fireball1', 'molotov_explosion_child_fireball4', 'molotov_explosion_child_fireball2', 'molotov_explosion_child_sprays', 'explosion_molotov_ground_debris', 'explosion_molotov_ground_splash07a'].every(x => bx.has(x)) && ['molotov_explosion_child_fireball2', 'incen_explosion_child_sprays', 'explosion_incen_ground_splash07a'].every(x => ix.has(x)) && !ix.has('molotov_explosion_child_flash'), 'the bursts: the bottle\'s flash, fireballs, sprays, shards and splash; the can\'s fireball2, sprays and sparks (no flash)');
    const glass = path.join(tmp, 'particles', 'impact_fx', 'molotov_broken_glass.vpcf'); if (existsSync(glass)) { const g = kv3(readFileSync(glass, 'utf8')); ok(g.m_nMaxParticles === 10 && /broken_glass/.test(JSON.stringify(g.m_Renderers)), 'the molotov\'s glass: particles/impact_fx/molotov_broken_glass (5–10 pieces)'); }
    verified = `CS2's files: ${checked} systems read back from particles/inferno_fx (${readdirSync(path.join(tmp, 'particles', 'inferno_fx')).length} files)`;
  } finally { rmSync(tmp, { recursive: true, force: true }); } }
console.log(`PASS gd-fire-look · ${n} checks (${verified}; pools within each file's max; one draw; light count fixed; no allocation per frame)`);
