// v47 in a real browser, on a CS2 map converted on this computer (Mirage: user-maps + user-assets): its physics props
// pushed by a body and shattered by a shot, a skin on the AK (the HUD's title, the gun painted), CS2's clip sounds in,
// a dropped gun tossed (it flies, then lies where the host says), and no page errors. Skipped without the map.
//   node tests/browser/gd-v47-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-v47')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
if (!existsSync(path.join(root, 'user-maps', 'mirage.bsp'))) { console.log('SKIP: no converted Mirage on this computer'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDV047', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdv-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 240) : '')); };
try {
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'mirage'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.waitForTimeout(1500); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // Physics props: there, pushed by a body walking through one, a pot shattered by a shot.
  const pr = await p.evaluate(async () => { const S = __infra.lab.arenaScene, P = S.physProps; if (!P) return { count: 0 }; const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), M = ARENA_MAPS.mirage;
    const list = M.physProps, k = list.findIndex(q => !q.breaks), q = P.at(k), pos = new Float32Array(3), before = q.slice();
    for (let i = 0; i < 40; i++) { pos[0] = q[0] - 3 + i * .15; pos[1] = q[1]; pos[2] = q[2]; S.physUpdate(1 / 60, pos, 1); }
    for (let i = 0; i < 120; i++) S.physUpdate(1 / 60, pos, 0); const after = P.at(k);
    const j = list.findIndex(q => q.breaks), c = P.at(j), hit = S.physShot(c[0] - 6, c[1] + .5, c[2], 1, 0, 0, 20, 1);
    return { count: P.count, moved: Math.hypot(after[0] - before[0], after[2] - before[2]), broke: hit === j && P.broken(j) }; });
  check('Mirage has its physics props, moved in the look', pr.count > 50, pr.count);
  check('a body walking into one pushes it along', pr.moved > .5, pr.moved?.toFixed?.(2));
  check('a shot shatters a pot', pr.broke);
  // The look drawn in few pieces (cs2-render.js: fixed surfaces merged per material, props merged while they rest): the
  // pushed and the shot prop are out of their batches (drawn alone), and a new round puts them back. CS2's overlays
  // (Mirage's paint swatches and stain) drawn over their walls, not as solid sheets.
  const mg = await p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), S = __infra.lab.arenaScene, look = S.group.children.find(o => o.userData.cs2Render), B = look.userData.propBatch, list = ARENA_MAPS.mirage.physProps, P = S.physProps;
    const moved = [list.findIndex(q => !q.breaks), list.findIndex(q => q.breaks)];   // (the one pushed and the one shot, above)
    let meshes = 0, overlays = 0; look.traverseVisible(o => { if (o.isMesh) meshes++; }); look.traverse(o => { if (!o.isMesh) return; const m = o.material; if (m.polygonOffset && (m.customProgramCacheKey?.() === 'cs2-mod2x' || m.transparent || m.alphaTest > 0) && /paintswatch|stain/.test(m.name)) overlays++; });
    const out = moved.map(k => B.batched(list[k].i)); S.physReset(); const back = moved.map(k => B.batched(list[k].i)); return { meshes, overlays, out, back, merged: look.userData.merged }; });
  const M = mg.merged || { fixed: [0, 0], props: [0, 0] };
  check('the look drawn in fewer pieces (fixed surfaces merged per material), its props in a few batches', M.fixed[1] < M.fixed[0] && M.props[0] > 50 && M.props[1] < M.props[0] / 2, JSON.stringify(M) + ' · ' + mg.meshes + ' drawn');
  check('a pushed or shot prop is drawn on its own, the next round back in its batch', mg.out.length >= 2 && mg.out.every(b => !b) && mg.back.every(b => b), JSON.stringify(mg));
  check('CS2\'s overlays drawn over their walls (blended, cut out or mod2x)', mg.overlays >= 2, mg.overlays);
  // A skin on the AK: bought in warmup, painted Fade with a sticker; the HUD names it.
  const gun = await p.evaluate(() => { const G = __infra.lab.world.operations.game; return G.combat.d.teams.tester === 'ct' ? 'usps' : 'pistol'; }), gunName = gun === 'usps' ? 'USP-S' : 'GLOCK-18';   // (the starting pistol: warmup has $800)
  const sk = await p.evaluate(g => __infra.lab.lan.act({ type: 'arena', action: { type: 'skin', weapon: g, skin: { finish: 'fade', wear: .03, seed: 661, st: true, stickers: [{ id: 'crown', slot: 0, x: .45, y: .5, scale: 1.6, rot: 10 }] } } }), gun);
  check('the room equips the skin', /Fade/.test(JSON.stringify(sk)), JSON.stringify(sk));
  await p.evaluate(g => { __infra.lab.enter(); __infra.lab.pistol.equip(g); }, gun); await p.waitForTimeout(3000);
  check('the HUD names it as CS2 does', await p.evaluate(n => new RegExp('STATTRAK™ ' + n + ' \\| FADE \\(FACTORY NEW\\)').test(document.querySelector('#gd-wp .name').textContent), gunName), await p.evaluate(() => document.querySelector('#gd-wp .name').textContent));
  await p.waitForFunction(() => __infra.lab.pistol.viewInfo.authored, null, { timeout: 60000 }).catch(() => {});   // (CS2's own set for it, once loaded)
  const painted = await p.evaluate(() => { const v = __infra.lab.pistol.viewInfo; return { authored: v.authored, mats: v.skinMats.length, on: v.skinMats.filter(m => m.userData?.skinU?.uSkinOn.value).length }; });
  check('the gun in your hands is painted (its own shader, on)', painted.on > 0, JSON.stringify(painted));
  await p.screenshot({ path: path.join(out, 'skin-ak.png') });
  // CS2's clip sounds: the AK's reload has them.
  check('CS2\'s reload sounds are in (magazine out, in, bolt)', await p.evaluate(async () => { const { clipSounds } = await import('/fp-sounds.js'); const c = clipSounds('ak', 'reload') ; return !!c && c.ev.some(e => /clipout/.test(e[1][0])) && c.ev.some(e => /bolt/.test(e[1][0])); }));
  // G: the AK tossed ahead — it flies (its mesh moves), then lies where the host put it.
  const drop = await p.evaluate(async () => { const r = await __infra.lab.lan.act({ type: 'arena', action: { type: 'drop', slot: 'secondary' } }); const G = __infra.lab.world.operations.game.combat.ground, it = G[G.length - 1]; const wait = ms => new Promise(x => setTimeout(x, ms));
    await wait(80); let m = null; __infra.lab.arenaScene.group.traverse(o => { if (o.userData?.ground && Math.hypot(o.position.x - it.x, o.position.z - it.z) < 60) m ??= o; }); const a = m?.position.clone(); await wait(120); const bpos = m?.position.clone(); await wait((it.fly?.ms || 0) + 500);
    return { r, fly: it.fly?.ms, moving: a && bpos ? a.distanceTo(bpos) : -1, rest: m ? Math.hypot(m.position.x - it.x, m.position.z - it.z) : -1 }; });
  check('a dropped gun is tossed (it has a flight)', drop.fly > 0, JSON.stringify(drop));
  check('it flies (moves on screen)…', drop.moving > .05, drop.moving);
  check('…and lies where the host says', drop.rest >= 0 && drop.rest < .05, drop.rest);
  // H: other players' guns (CS2 agents): in the right hand and pointing where the agent faces — standing, walking,
  // running, crouched, crouch-walking, every way it faces (the gun rode the root and floated off the hands at a walk).
  const ag = await p.evaluate(async () => { const { makeAgent } = await import('/cs2-agents.js'), THREE = await import('/three.module.js'), U = 2.54 / 16.5, h = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3(), f = new THREE.Vector3(), q = new THREE.Quaternion();
    const states = [[0, false], [130, false], [250, false], [0, true], [85, true]]; let worstAng = 0, spread = 0, n = 0;
    for (const gun of ['ak', 'sniper', 'deagle']) for (const team of ['t', 'ct']) { const d = [];
      for (const [spd, cr] of states) for (const yaw of [0, 2]) { const a = makeAgent({ name: 'H' }, team); if (!a) return null; a.setWeapon(gun); a.g.rotation.y = yaw; __infra.scene.add(a.g); const v = spd * U;
        for (let t = 0; t < 90; t++) { a.update(1 / 60, { speed: v, crouch: cr, vx: -Math.sin(yaw) * v, vz: -Math.cos(yaw) * v }); if (t < 30 || t % 6) continue; a.g.updateMatrixWorld(true);
          const hand = a.g.getObjectByName('hand_R'), carry = a.g.getObjectByName('wpn').children.find(o => o.isGroup); hand.getWorldPosition(h); carry.getWorldPosition(c); d.push(h.distanceTo(c));
          carry.getWorldQuaternion(q); m.set(0, 0, 1).applyQuaternion(q).setY(0).normalize(); a.g.getWorldQuaternion(q); f.set(0, 0, -1).applyQuaternion(q).setY(0).normalize(); worstAng = Math.max(worstAng, Math.acos(Math.min(1, m.dot(f))) * 180 / Math.PI); n++; }
        a.dispose(); }
      spread = Math.max(spread, Math.max(...d) - Math.min(...d)); }
    return { n, worstAng: +worstAng.toFixed(1), spread: +spread.toFixed(3) }; });
  check('other players\' guns point where they face, walking and running too', ag && ag.n > 100 && ag.worstAng < 10, JSON.stringify(ag));
  check('…and stay in their hands (the grip never moves off the hand)', ag && ag.spread < .05, JSON.stringify(ag));
  // I: every shader the map and the players use compiles (a baked map's material that doesn't is simply not drawn).
  const progs = await p.evaluate(() => { const L = __infra.renderer.info.programs || []; return { n: L.length, bad: L.filter(q => q.diagnostics && !q.diagnostics.runnable).map(q => q.name + ': ' + (q.diagnostics.fragmentShader?.log || q.diagnostics.vertexShader?.log || '').slice(0, 120)) }; });
  check('every shader compiles', progs.n > 20 && !progs.bad.length, progs.n + ' programs · ' + progs.bad.slice(0, 2).join(' | '));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { check('ran to the end', false, e.message); }
console.log((ok === n ? 'PASS' : 'FAIL') + ': v47 in the browser · ' + ok + '/' + n); await b.close(); server.kill(); if (ok !== n) process.exitCode = 1;
