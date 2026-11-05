// v53 PROPS (openB-10): the CS2 maps' physics props (prop_physics_multiplayer / prop_physics), host-authoritative, in
// the real game — before / after pictures. On two CS2 map files (default Mirage and Overpass: practice, no bots) a box
// and a barrel-like can or bucket (the CS2 maps have no physics barrels: their barrels are static props) are each shot
// three times with the game's own gun (lab.pistol.fire: the pose's shot record goes to the room, whose host simulation —
// dist/gd-props.js propsTick — knocks the prop; this page draws it from the combat frame's `pp`). Checks: the page is in
// net mode (the host's word, not its own simulation), the frame carried the prop, the drawn prop moved, no shader was
// compiled by it, no page error. v53 PROPS final: the knock must really move it (more than 10 HU, or break it), and
// with the moved prop hidden nothing whole is left drawn where it stood (the export's own copy of the model in the
// fixed surfaces was a second prop standing there — cs2-render.js cuts it at load). The sheet goes to <out>/GD-v53-props.jpg (and DESKTOP=1: ~/Desktop/GD-v53-props.jpg).
// Chrome runs muted (bt2.sh's CHROME wrapper, and --mute-audio).
//   node tests/browser/gd-props-shots.mjs <repo-root> <out-dir> [map,map]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-props-shots'), mapsArg = 'mirage,overpass'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const MAPS = mapsArg.split(',').filter(m => existsSync(path.join(root, 'user-maps', m + '.bsp')));
if (!MAPS.length) { console.log('SKIP: no CS2 map file with physics props'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDPR01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdpr-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = '', slog = ''; server.stderr.on('data', d => { serr += d; }); server.stdout.on('data', d => { slog += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], shots = [], report = { maps: {} }; let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); };
const U = 2.54 / 16.5;
const KINDS = [['box', /crate|box|cinderblock/i], ['barrel', /barrel|bucket|paint_?can|drink_container_can|metalcan/i]];
for (const MAP of MAPS) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(MAP + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(2000);
  await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy', primary: 'ak' } }).catch(e => ({ error: e.message }))); await p.waitForTimeout(1500);
  // The plan: for each kind the nearest-to-open prop of that model with a standing eye ~70 HU off it on the same floor
  // and a clear bullet line from the eye to its middle (the test's own search).
  const plan = await p.evaluate(async ([kinds, U]) => { const { bulletPath, BulletPath, ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js');
    const S = __infra.lab.arenaScene, L = S.physPropList || [], P = S.physProps, M = ARENA_MAPS[__infra.lab.world.operations.game.arena.map], B = S.boxes, BP = new BulletPath(), res = {};
    for (const [kind, src] of kinds) { const re = new RegExp(src, 'i'); let best = null;
      for (let k = 0; k < L.length && !best; k++) { const q = L[k]; if (!re.test(q.model) || P.broken(k)) continue; const a = P.at(k), mid = [a[0], a[1] + Math.max(.3, q.h * .5), a[2]];
        for (const hu of [70, 55, 90, 45, 110, 35, 140]) { for (let j = 0; j < 32 && !best; j++) { const ang = j / 32 * Math.PI * 2, dx = Math.sin(ang), dz = Math.cos(ang), Lh = hu * U, ex = a[0] + dx * Lh, ez = a[2] + dz * Lh, fl = M.nav.floorAt(ex - ARENA.cx, ez - ARENA.cz, a[1] + 2);
            if (!Number.isFinite(fl) || Math.abs(fl - a[1]) > (kind === 'box' ? 14 : 4) || !S.clear(ex, ez)) continue; const eye = [ex, fl + 9.7, ez], vx = mid[0] - eye[0], vy = mid[1] - eye[1], vz = mid[2] - eye[2], vl = Math.hypot(vx, vy, vz), R = bulletPath(B, eye[0], eye[1], eye[2], vx / vl, vy / vl, vz / vl, vl, 0, BP);
            // (and room past it the way the bullets push it: shot toward a wall it only bounces off it, as in CS2)
            const seen = R.stop, hl = Math.hypot(vx, vz), past = bulletPath(B, mid[0], mid[1], mid[2], vx / hl, 0, vz / hl, 24, 0, BP).stop;   // (BP is reused: the first answer kept)
            const NM = B.nadeMesh, FN = new Float64Array(4), wallAt = hy => { if (!NM?.first) return false; const yy = a[1] + q.h * hy, w = NM.first(a[0], yy, a[2], a[0] + vx / hl * 24, yy, a[2] + vz / hl * 24, false, FN); return w <= 1 && Math.abs(FN[1]) < .7; };   // (the props' own walls: CS2's grenade triangles, gd-props.js hostFor)
            if (seen >= vl - .05 && past >= 24 - .05 && !wallAt(.2) && !wallAt(.5)) best = { k, model: q.model, eye, mid, home: a.slice(), hu, h: q.h }; } if (best) break; } }
      res[kind] = best; }
    return { count: L.length, net: !!P?.net, plan: res }; }, [KINDS.map(([k, re]) => [k, re.source]), U]);
  report.maps[MAP] = { count: plan.count, shots: [] }; console.log(MAP, 'props', plan.count, JSON.stringify(plan.plan).slice(0, 600));
  check(`${MAP}: the map file has physics props`, plan.count > 0, plan.count);
  const aim = (eye, to) => p.evaluate(({ eye, to }) => { __infra.lab.look(eye[0], eye[2], to[0], to[1], to[2], eye[1]); __infra.camera.position.set(eye[0], eye[1], eye[2]); __infra.camera.lookAt(to[0], to[1], to[2]); }, { eye, to });
  // A warm-up shot into the floor at the spot (the gun's own first-shot look is not the props' business), then the count.
  await p.evaluate(() => { const c = __infra.camera.position; __infra.lab.look(c.x, c.z, c.x + 3, c.y - 9, c.z, c.y); }); await p.waitForTimeout(200); await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForTimeout(1200);
  // The props' own looks (each prop drawn alone once knocked — cs2-render.js propBatch.wake): every one of their materials
  // has its program from the load (warmed behind the loading card), and the same one after the knocks.
  const propProgs = () => p.evaluate(() => { const R = __infra.renderer, out = []; __infra.scene.traverse(o => { if (!/^prop_p\d+/.test(o.name || '')) return; o.traverse(m => { if (!m.isMesh) return; for (const M of [].concat(m.material)) { const q = R.properties.get(M).currentProgram; out.push(q ? q.id : -1); } }); }); return out; });
  const pp0 = await propProgs(); check(`${MAP}: every prop's own material has its shader from the load (${pp0.length} materials)`, pp0.length > 0 && pp0.every(i => i >= 0), pp0.filter(i => i < 0).length + ' without');
  const progs0 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1), names0 = await p.evaluate(() => (__infra.renderer?.info?.programs || []).map(q => q.name + '|' + q.cacheKey));
  for (const [kind] of KINDS) { const s = plan.plan[kind]; check(`${MAP}: a ${kind} to shoot with a clear line`, !!s, JSON.stringify(Object.keys(plan.plan).filter(k => plan.plan[k]))); if (!s) continue;
    // The picture's view: a little behind and above the eye, the prop in the middle.
    const view = s.eye;   // (the shooter's own eye: a clear line to it by the search)
    for (let j = 0; j < 3; j++) { await aim(s.eye, s.mid); await p.waitForTimeout(250); }
    await aim(view, s.mid); await p.waitForTimeout(300); await aim(view, s.mid);
    const where = () => p.evaluate(([k, mid]) => { const P = __infra.lab.arenaScene.physProps, d = P.drawn?.(k); let o = null; __infra.scene.traverse(q => { if (q.position === d) o = q; }); const B = o ? new (__infra.camera.position.constructor)() : null;
      let box = null; if (o) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; o.updateMatrixWorld(true); o.traverse(m => { if (!m.isMesh || !m.visible) return; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], bb.min.getComponent(j)); mx[j] = Math.max(mx[j], bb.max.getComponent(j)); } }); box = [mn.map(v => +v.toFixed(2)), mx.map(v => +v.toFixed(2))]; }
      const v = new (__infra.camera.position.constructor)(mid[0], mid[1], mid[2]).project(__infra.camera); return { pivot: d ? [d.x, d.y, d.z].map(v => +v.toFixed(2)) : null, meshBox: box, midOnScreen: [+v.x.toFixed(3), +v.y.toFixed(3)], visible: o ? o.visible : null }; }, [s.k, s.mid]);
    const w0 = await where(); console.log(`  ${MAP} ${kind}: before`, JSON.stringify(w0));
    const fb = path.join(out, `${MAP}-${kind}-before.jpg`); await p.screenshot({ path: fb, type: 'jpeg', quality: 88 });
    const pp0 = await p.evaluate(k => { const pp = __infra.lab.world.operations.game.combat?.pp; return pp ? pp.slice(0, 3) : null; }, s.k);
    let sawInPP = false;
    // (the game puts the body — and so the eye — on its floor: aimed again from where the eye really is before each shot)
    const aimFrom = async to => { await aim(s.eye, to); for (let q = 0; q < 3; q++) { await p.waitForTimeout(120); await p.evaluate(t => { const c = __infra.camera.position; __infra.lab.look(c.x, c.z, t[0], t[1], t[2], c.y); __infra.camera.lookAt(t[0], t[1], t[2]); }, to); } };
    for (let j = 0; j < 3; j++) { await aimFrom(s.mid); await p.waitForTimeout(100); await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForTimeout(160);
      sawInPP = sawInPP || await p.evaluate(k => { const pp = __infra.lab.world.operations.game.combat?.pp; if (!pp) return false; for (let i = 3 + (pp[2] | 0); i + 6 < pp.length; i += 7) if (pp[i] === k) return true; return false; }, s.k); }
    for (let t = 0; t < 10 && !sawInPP; t++) { await p.waitForTimeout(100); sawInPP = await p.evaluate(k => { const pp = __infra.lab.world.operations.game.combat?.pp; if (!pp) return false; for (let i = 3 + (pp[2] | 0); i + 6 < pp.length; i += 7) if (pp[i] === k) return true; return false; }, s.k); }
    await p.waitForTimeout(2200); await aim(view, s.mid); await p.waitForTimeout(200); await aim(view, s.mid);
    const st = await p.evaluate(k => { const P = __infra.lab.arenaScene.physProps, d = P.drawn?.(k); return { net: !!P.net, drawn: d ? [d.x, d.y, d.z] : P.at(k), broken: P.broken(k), rot: d?.parent ? null : null }; }, s.k);
    const fa = path.join(out, `${MAP}-${kind}-after.jpg`); await p.screenshot({ path: fa, type: 'jpeg', quality: 88 }); console.log(`  ${MAP} ${kind}: after`, JSON.stringify(await where()));
    const moved = Math.hypot(st.drawn[0] - s.home[0], st.drawn[2] - s.home[2]) / U;
    check(`${MAP} ${kind} (${s.model}): drawn from the host's word (net mode)`, st.net);
    check(`${MAP} ${kind}: the combat frame carried it (pp)`, sawInPP, JSON.stringify(pp0));
    check(`${MAP} ${kind}: three shots knocked it (moved more than 10 HU or broke)`, moved > 10 || st.broken, moved.toFixed(1) + ' HU' + (st.broken ? ', broken' : ''));
    // Nothing of it left where it stood: with its pivot hidden, no visible triangle of any mesh (non-degenerate: a batch's
    // folded prop is a point) has its middle inside the prop's box from before the knock.
    const ghost = await p.evaluate(([k, box]) => { if (!box) return { tris: -1 }; const P = __infra.lab.arenaScene.physProps, d = P.drawn?.(k); let G = null; __infra.scene.traverse(q => { if (q.position === d) G = q; });
      const was = G ? G.visible : null; if (G) G.visible = false; const V = __infra.camera.position.constructor, a = new V(), b = new V(), c = new V(), e1 = new V(), e2 = new V(), lo = box[0], hi = box[1], pad = .05; let tris = 0; const by = {};
      const inside = (x, y, z) => x > lo[0] + pad && x < hi[0] - pad && y > lo[1] + pad && y < hi[1] - pad && z > lo[2] + pad && z < hi[2] - pad;
      __infra.scene.updateMatrixWorld(true);
      __infra.scene.traverse(m => { if (!m.isMesh || !m.geometry?.attributes?.position || (m.layers.mask & ~1)) return; for (let q = m; q; q = q.parent) if (!q.visible || /^prop_p\d+/.test(q.name || '')) return; const g = m.geometry;   /* (the other props — in their batches, the sun-caster layer, or alone — are not this one's copy: a hot dog sits in Overpass's food box) */ if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(m.matrixWorld);
        if (bb.max.x < lo[0] || bb.min.x > hi[0] || bb.max.y < lo[1] || bb.min.y > hi[1] || bb.max.z < lo[2] || bb.min.z > hi[2]) return; const Pz = g.attributes.position, I = g.index, nt = I ? I.count / 3 : Pz.count / 3, W = m.matrixWorld;
        for (let t = 0; t < nt; t++) { const i0 = I ? I.getX(t * 3) : t * 3, i1 = I ? I.getX(t * 3 + 1) : t * 3 + 1, i2 = I ? I.getX(t * 3 + 2) : t * 3 + 2; a.fromBufferAttribute(Pz, i0).applyMatrix4(W); b.fromBufferAttribute(Pz, i1).applyMatrix4(W); c.fromBufferAttribute(Pz, i2).applyMatrix4(W);
          if (!inside((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3)) continue; if (e1.subVectors(b, a).cross(e2.subVectors(c, a)).length() < 1e-6) continue; tris++; const nm = (m.material?.name || m.name || '?'); by[nm] = (by[nm] || 0) + 1; } });
      if (G) G.visible = was; return { tris, by }; }, [s.k, w0.meshBox]);
    check(`${MAP} ${kind}: nothing of it left standing where it was (no second copy in the map's fixed surfaces)`, st.broken || ghost.tris === 0, JSON.stringify(ghost));
    const gun = await p.evaluate(() => __infra.lab.pistol.current?.name || __infra.lab.pistol.current?.id || 'gun'), rec = { kind, model: s.model, k: s.k, movedHU: +moved.toFixed(1), broken: st.broken, before: fb, after: fa, gun }; report.maps[MAP].shots.push(rec);
    shots.push({ ...rec, map: MAP }); }
  const progs1 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1);
  const names1 = await p.evaluate(() => (__infra.renderer?.info?.programs || []).map(q => q.name + '|' + q.cacheKey)), fresh = names1.filter(q => !names0.includes(q)); report.maps[MAP].newPrograms = fresh;
  const pp1 = await propProgs(); check(`${MAP}: no shader compiled for the props during play (the same programs after the knocks)`, pp1.length === pp0.length && pp1.every((q, j) => q === pp0[j]), pp1.filter((q, j) => q !== pp0[j]).length + ' changed');
  console.log(`INFO ${MAP}: programs in all ${progs0} → ${progs1}` + (fresh.length ? ' (new, not the props\': ' + fresh.map(f => f.slice(0, 80)).join(' | ') + ')' : ''));
  await p.close(); }
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
// The sheet: a row per prop, before | after.
{ const sp = await b.newPage({ viewport: { width: 1300, height: 200 } }), img = f => 'data:image/jpeg;base64,' + readFileSync(f).toString('base64');
  const rows = shots.map(s => `<div class="r"><div class="l">${s.map} · ${s.kind} · ${s.model}<br>after 3 shots (${s.gun}): ${s.broken ? 'broken' : 'moved ' + s.movedHU + ' HU'}</div><figure><img src="${img(s.before)}"><figcaption>before</figcaption></figure><figure><img src="${img(s.after)}"><figcaption>after</figcaption></figure></div>`).join('');
  await sp.setContent(`<html><body style="margin:0;background:#111;color:#ddd;font:14px -apple-system,Helvetica"><h2 style="margin:12px 16px">GD v53 PROPS — CS2 map physics props, host-simulated (64 Hz), shot with the game's gun</h2><style>.r{display:flex;gap:10px;align-items:center;padding:6px 16px}.l{width:190px}figure{margin:0}img{width:540px;display:block}figcaption{font-size:12px;color:#999}</style>${rows}</body></html>`);
  await sp.waitForTimeout(300); const sheet = path.join(out, 'GD-v53-props.jpg'); await sp.screenshot({ path: sheet, type: 'jpeg', quality: 85, fullPage: true });
  if (process.env.DESKTOP === '1') { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-props.jpg'); copyFileSync(sheet, d); console.log('sheet', d); } else console.log('sheet', sheet); }
writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ...report, errs, checks: [ok, n] }, null, 1));
await b.close(); server.kill(); console.log(`${ok === n ? 'PASS' : 'FAIL'}: gd-props-shots · ${ok}/${n} checks`); process.exit(ok === n ? 0 : 1);
