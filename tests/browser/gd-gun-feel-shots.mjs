// Global Defensive · the CS2 gun feel (v53 GUNS, spec addendum 9) in the real game at 1920 × 1080, muted: a solo
// Deathmatch on the built-in yard, the HUD hidden, CS2's first-person sets (skipped without them).
//  · G1, the view model's field of view: the Glock idle at viewmodel_fov 60 and 68 (CS2's presets: 4:3 horizontal →
//    46.8° / 53.7° vertical, weapons-data vmVfov), measured from the gun mesh itself projected by the game's camera —
//    its rear face's width, the slide's top and the rear face's centre — against CS2's picture (v53/ref/cs2-hud.png at
//    1920 × 1080: about 105 px wide, top y 685, centre x 1262; the audit's crops). Prints both and which is nearer.
//  · Pictures: the Glock, AK-47 and AWP idle beside cs2-hud.png's bottom; CS2's muzzle flash (gd-gunfx.js) at 0, 8 and
//    16 ms (its pool's clock stepped by hand); a shell case in flight; the Glock's slide locked after its last round
//    (CS2's shoot_empty / idle_slide_back); the AUG scoped with its view model (m_bHideViewModelWhenZoomed false).
//    (final review: the flash and the shell are shot looking up at open sky — no bullet impact in the frame — and shown
//    as 1:1 close-ups around the muzzle / the case, found by projecting them; the muzzle's area must get brighter.)
//    → <out>/gun-feel.jpg, and with --desktop ~/Desktop/GD-v53-gun-feel.jpg.
//   node tests/browser/gd-gun-feel-shots.mjs <repo-root> <out-dir> [--desktop] [--vmfov 60|68]
import { chromium } from 'playwright-core'; import { spawn, execFileSync } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), flag = k => { const i = argv.indexOf(k); if (i < 0) return false; argv.splice(i, 1); return true; }, opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const DESK = flag('--desktop'), VMF = +(opt('--vmfov') || 0); const [root = '.', out = path.join(os.tmpdir(), 'gd-gun-feel')] = argv; mkdirSync(out, { recursive: true });
const REF = '/private/tmp/claude-501/-Users-dorjoht-Downloads-infra-lan-v31--2-/e36c7b43-670b-481d-8e6b-7efd02f58f36/scratchpad/v53/ref/cs2-hud.png';
if (!existsSync(path.join(root, 'user-assets', 'fp', 'cs2_pistol.glb'))) { console.log('SKIP: no CS2 first-person sets on this computer'); process.exit(0); }
let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 500) : '')); };
const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDGUNS', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdgf-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { s.kill(); } catch {} }); let err = ''; s.stderr.on('data', d => { err += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + err.slice(-300))), 120000); s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
try {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Viewer'); localStorage.setItem('infra-face-name', 'Viewer'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', gdPreset: 'High' })); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-kind', 'dm'); await p.selectOption('#ss-ar-map', 'yard'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 }); await p.waitForTimeout(1500); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); document.querySelectorAll('#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar,#gd-x,#game-notifications').forEach(e => e && (e.style.visibility = 'hidden')); });
  const hold = (id, pitch = 0) => p.evaluate(async ([id, pitch]) => { const P = __infra.lab.pistol, w = (await import('/weapons-data.js')).weaponById(id), { arenaArsenalOf } = await import('/combat-logic.js'), game = () => __infra.lab.world.operations.game;
    const act = async a => { try { return String(await __infra.lab.lan.act({ type: 'arena', action: a })); } catch (e) { return 'ERR ' + (e?.message || e); } };
    await act(w.kind === 'pistol' ? { type: 'loadout', secondary: id } : { type: 'loadout', primary: id });
    for (let i = 0; i < 40 && !arenaArsenalOf(game(), 'Viewer').includes(id); i++) await new Promise(r => setTimeout(r, 100));
    P.equip(null); await new Promise(r => setTimeout(r, 60)); P.equip(id); for (let i = 0; i < 40 && P.current?.id !== id; i++) await new Promise(r => setTimeout(r, 100));
    __infra.lab.rotation?.set?.(pitch, 0, 0); await new Promise(r => setTimeout(r, 1800)); return { cur: P.current?.id || null, set: P.viewInfo.set, authored: !!P.viewInfo.authored }; }, [id, pitch]);
  // Where a world point is on screen (CSS px): the muzzle (the set's own tip) or the newest shell case.
  const muzzleXY = () => p.evaluate(async () => { const THREE = await import('/three.module.js'), F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(P.current.id, P.viewInfo.set), v = new THREE.Vector3(); if (!f?.muzzle) return null; f.muzzle(v); v.project(__infra.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
  const shellXY = () => p.evaluate(async () => { const THREE = await import('/three.module.js'), X = globalThis.__gdGunFx, M = new THREE.Matrix4(), v = new THREE.Vector3(); if (!X.counts.shells) return null; X.shells.getMatrixAt(X.counts.shells - 1, M); v.setFromMatrixPosition(M); v.project(__infra.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
  // The gun mesh projected by the game's camera: the rear face (the vertices within 1 cm of the closest to the eye) — its
  // width and centre — and the slide's top (the highest point on screen), in CSS pixels.
  const measure = () => p.evaluate(async () => { const THREE = await import('/three.module.js'), cam = __infra.camera, v = new THREE.Vector3(), pts = []; let gun = null;
    cam.updateMatrixWorld(true); cam.traverse(o => { if (!gun && o.isMesh && o.visible !== false && [].concat(o.material)[0]?.name === 'cs2_weapon') gun = o; }); if (!gun) return null; gun.updateMatrixWorld(true);
    const n = gun.geometry.attributes.position.count, step = Math.max(1, Math.ceil(n / 6000)), inv = cam.matrixWorldInverse;
    for (let i = 0; i < n; i += step) { gun.getVertexPosition(i, v).applyMatrix4(gun.matrixWorld); const z = v.clone().applyMatrix4(inv).z; v.project(cam); pts.push([(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, z]); }
    let zc = -Infinity; for (const q of pts) zc = Math.max(zc, q[2]); const rear = pts.filter(q => q[2] > zc - .0606);   // (within 1 cm of the closest: 0.0606 units)
    const xs = rear.map(q => q[0]); return { width: Math.max(...xs) - Math.min(...xs), cx: xs.reduce((a, b) => a + b, 0) / xs.length, top: Math.min(...pts.map(q => q[1])), n: pts.length }; });
  const setFov = h => p.evaluate(async h => { (await import('/weapons-data.js')).VM_FOV.h = h; await new Promise(r => setTimeout(r, 300)); }, h);
  const shot = async name => { const f = path.join(out, name + '.png'); await p.screenshot({ path: f }); return f; };
  const g = await hold('pistol'); check('the Glock in hand, CS2\'s own set', g.cur === 'pistol' && g.authored, JSON.stringify(g));
  // ── G1: the two presets measured ──
  const TARGET = { width: 105, top: 685, cx: 1262 }, rows = {};
  for (const h of [60, 68]) { await setFov(h); rows[h] = await measure(); await shot('glock-vm' + h); }
  const dist = r => r ? Math.abs(r.width - TARGET.width) / TARGET.width + Math.abs(r.top - TARGET.top) / 100 + Math.abs(r.cx - TARGET.cx) / 100 : Infinity, best = Object.keys(rows).sort((a, b) => dist(rows[a]) - dist(rows[b]))[0];
  console.log('G1 measured (CSS px at 1920 × 1080):', JSON.stringify({ target: TARGET, vm60: rows[60], vm68: rows[68], nearer: best }));
  writeFileSync(path.join(out, 'vmfov.json'), JSON.stringify({ target: TARGET, rows, best }, null, 1));
  check(`the view model measured (rear face px / slide top y / centre x; CS2 ≈ 105 / 685 / 1262): ${Object.entries(rows).map(([k, r]) => `${k} → ${r.width.toFixed(0)} / ${r.top.toFixed(0)} / ${r.cx.toFixed(0)}`).join(' · ')} — nearest ${best}`, Object.values(rows).every(Boolean));
  await setFov(VMF || (await p.evaluate(async () => (await import('/weapons-data.js')).VM_FOV.h)));   // (the game's own setting from here)
  const cells = [];
  cells.push(['CS2 (cs2-hud.png)', null]);
  cells.push([`Glock idle (viewmodel_fov ${VMF || await p.evaluate(async () => (await import('/weapons-data.js')).VM_FOV.h)})`, await shot('glock')]);
  cells.push(['Glock idle (viewmodel_fov 60, for comparison)', path.join(out, 'glock-vm60.png')]);
  await hold('ak'); cells.push(['AK-47 idle', await shot('ak')]);
  await hold('sniper'); cells.push(['AWP idle', await shot('awp')]);
  // ── the muzzle flash at 0, 8 and 16 ms: the pool's own clock stopped and stepped by hand (looking up at the sky) ──
  await hold('ak', .55); const mz = await muzzleXY(); const before = await shot('flash-before');
  const flashAt = async ms => p.evaluate(async ms => { const X = globalThis.__gdGunFx; if (!X) return -1; if (!X._real) { X._real = X.update; X.update = () => {}; } const P = __infra.lab.pistol; P.button?.(0, true); P.button?.(0, false);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); if (ms) X._real(ms / 1000); return X.counts.flash; }, ms);
  const f0 = await flashAt(0); const f0png = await shot('flash0'); cells.push([`AK muzzle flash 0 ms (${f0} sprites, close-up)`, f0png, mz]);
  await p.evaluate(() => { const X = globalThis.__gdGunFx; X.mesh.onBeforeRender(); X._real(.008); }); cells.push([`8 ms (${await p.evaluate(() => globalThis.__gdGunFx.counts.flash)}: the vent)`, await shot('flash8'), mz]);
  await p.evaluate(() => { const X = globalThis.__gdGunFx; X._real(.008); }); cells.push([`16 ms (${await p.evaluate(() => globalThis.__gdGunFx.counts.flash)})`, await shot('flash16'), mz]);
  const sh = await p.evaluate(() => { const X = globalThis.__gdGunFx; X._real(.009); return X.counts.shells; }); const s25 = await shellXY(); cells.push([`shell leaving the port, 25 ms (close-up)`, await shot('shell25'), s25]);
  await p.evaluate(() => { const X = globalThis.__gdGunFx; X._real(.025); }); const s50 = await shellXY(); cells.push([`shell in flight, 50 ms (close-up)`, await shot('shell'), s50]);
  check('the flash: CS2\'s sprites drawn at 0 ms, the main flash gone by 8 ms, a case thrown', f0 >= 7 && sh >= 1, JSON.stringify({ f0, sh, mz, s25, s50 }));
  await p.evaluate(() => { const X = globalThis.__gdGunFx; if (X._real) { X.update = X._real; delete X._real; } });
  // ── the Glock's last round: the slide locked back ──
  // (a semi-automatic gun reloads by itself one cycle after its last round — weapons.js, as before — so the picture is
  // taken at once: CS2's shoot_empty clip, the slide going back and staying there into reload_empty)
  await hold('pistol'); const empty = await p.evaluate(async () => { const P = __infra.lab.pistol; for (let i = 0; i < 40 && P.ammo > 1; i++) { P.button(0, true); P.button(0, false); await new Promise(r => setTimeout(r, 200)); } await new Promise(r => setTimeout(r, 300)); P.button(0, true); P.button(0, false);
    await new Promise(r => setTimeout(r, 90)); const F = await import('/fp-view.js'); const f = F.fpFor('pistol', P.viewInfo.set); return { ammo: P.ammo, clip: f?.clipNow, empty: f?.empty }; });
  const emptyShot = await shot('glock-empty');
  check(`the Glock's last round: CS2's shoot_empty (${empty.clip}, magazine ${empty.ammo}) — the slide locked back`, empty.ammo === 0 && empty.clip === 'fireempty' && empty.empty === true, JSON.stringify(empty)); cells.push(['Glock: slide locked after the last round', emptyShot]);
  // ── the AUG scoped: its view model stays (m_bHideViewModelWhenZoomed false) ──
  await hold('aug'); const sc = await p.evaluate(async () => { const P = __infra.lab.pistol; P.button(2, true); P.button(2, false); await new Promise(r => setTimeout(r, 700)); let vis = false; __infra.camera.traverse(o => { if (o.isMesh && [].concat(o.material)[0]?.name === 'cs2_weapon' && o.visible) { let v = true; for (let q = o; q; q = q.parent) if (q.visible === false) v = false; vis = vis || v; } }); return { scope: P.scope, vis }; });
  check('the AUG scoped keeps its view model drawn', sc.scope > 0 && sc.vis, JSON.stringify(sc)); cells.push(['AUG scoped, view model drawn', await shot('aug-scoped')]);
  check('no page errors', !errs.length, errs.slice(0, 4).join(' | '));
  // ── the sheet (a page of its own, labelled): 4 × 3 cells of each frame's lower right (x 640–1920, y 360–1080) ──
  const { readFileSync } = await import('node:fs'), url = f => 'data:image/' + (f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + readFileSync(f).toString('base64');
  // the muzzle's area (48 px around the tip) before the shot and at 0 ms: brighter with the flash
  { const lum = await b.newPage(); const L = await lum.evaluate(async ([a, c, m]) => { const img = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; }), cv = document.createElement('canvas'); cv.width = 96; cv.height = 96; const x = cv.getContext('2d');
      const mean = async s => { x.drawImage(await img(s), m[0] - 48, m[1] - 48, 96, 96, 0, 0, 96, 96); const d = x.getImageData(0, 0, 96, 96).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; return t / (d.length / 4); };
      return [await mean(a), await mean(c)]; }, [url(before), url(f0png), mz]); await lum.close();
    check(`the muzzle gets brighter with the flash (mean luminance around the tip ${L[0].toFixed(1)} → ${L[1].toFixed(1)})`, L[1] > L[0] + 4, JSON.stringify(L)); }
  // (a cell: [label, frame, close-up centre]: a 1:1 crop around it; else the frame's lower right)
  const cl = (v, hi) => Math.max(0, Math.min(hi, v)), bg = (f, c) => c ? `url(${url(f)}) ${(-cl(c[0] - 240, 1440)).toFixed(0)}px ${(-cl(c[1] - 135, 810)).toFixed(0)}px/1920px 1080px no-repeat` : `url(${url(f || REF)}) -240px -135px/720px 405px no-repeat`;
  const html = `<body style="margin:0;background:#111418;width:1920px;height:1080px;font:20px system-ui,sans-serif;color:#fff"><div style="padding:34px 24px 0;font-size:30px;height:101px;box-sizing:border-box">Global Defensive v53 · CS2 gun feel (GUNS) · 1920×1080, muted · the lower right of each frame; flash and shell cells 1:1 close-ups</div>`
    + `<div style="display:grid;grid-template-columns:repeat(4,480px);grid-auto-rows:270px;gap:0">` + cells.slice(0, 12).map(([t, f, c]) => `<div style="position:relative;background:${bg(f, c)};background-color:#000"><span style="position:absolute;left:8px;top:8px;background:#000a;padding:3px 8px;border-radius:3px">${t}</span></div>`).join('') + `</div></body>`;
  const sp = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); await sp.setContent(html); await sp.waitForTimeout(400);
  const dst = path.join(out, 'gun-feel.jpg'); await sp.screenshot({ path: dst, type: 'jpeg', quality: 88 }); await sp.close();
  console.log('picture', dst, cells.length, 'cells'); if (DESK) { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-gun-feel.jpg'); copyFileSync(dst, d); console.log('→', d); }
} finally { await b.close(); try { s.kill(); } catch {} }
console.log(failed ? `FAIL: gd-gun-feel-shots · ${failed} failed` : 'PASS: gd-gun-feel-shots'); process.exit(failed ? 1 : 0);
