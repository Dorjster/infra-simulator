// v53 DETAILS, muted: the small CS2 items in the real game, as pictures and checks.
//   A · Dust II, a Defuse round (the room in this process, lan/room.mjs startRoom; long freeze time): the host plants the
//       bomb in front of you — CS2's own size (1×), the red c4_timer_light flash with a beep and the dark between (the
//       lights held at a host moment: arena-ui bombLights.hold); then a dropped bomb — c4_timer_light_dropped's yellow
//       blink on and off; then the death cam's local contrast (death_cam_phase1.vpost, gd-deathcam-post.js) off, on, and
//       on with the death cam's tint — the same view.
//   B · LINEUPS left item: Nuke and Anubis (practice, CS2 map files): does the look (cs2-render.js) find each window-prop
//       pane's glass, so a broken window stops drawing it? Counts per map (panes, panes whose glass the look claimed), one
//       pane pictured whole and broken (the host breaks it, as a shot does: the 'gd-break' event).
// Writes the cells to <out-dir>, report.json, and the labelled sheet to ~/Desktop/GD-v53-details.jpg (opened in Preview).
//   node tests/browser/gd-details-shots.mjs <repo-root> <out-dir> [--no-open]
import { chromium } from 'playwright-core'; import { execFileSync } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), noOpen = argv.includes('--no-open'), args = argv.filter(a => !a.startsWith('--'));
const [root = '.', out = path.join(os.tmpdir(), 'gd-details-shots')] = args; mkdirSync(out, { recursive: true });
const SHEET = path.join(os.homedir(), 'Desktop', 'GD-v53-details.jpg');
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); }; const errs = [], report = {};
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
const { startRoom } = await import(path.resolve(root, 'lan/room.mjs'));
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'gddet-')), 's.json'), roomCode: 'GDDET1', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, g = () => room.world.operations.game;
const cells = [];   // { file, label }
const shot = async (p, name, label) => { const f = path.join(out, name + '.jpg'); await p.screenshot({ path: f, type: 'jpeg', quality: 88 }); cells.push({ file: f, label }); return f; };
async function enter(p, kind, map, bots = '0') {
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', kind); await p.selectOption('#ss-ar-map', map); await p.selectOption('#ss-ar-bots', bots);
  await p.evaluate(() => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', '60'], ['ss-ar-diff', 'easy']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } });
  await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(2500); }
// the camera at c looking at t (game units), held there (lab.look moves you; the camera is set again after)
const aim = async (p, c, t) => { await p.evaluate(([c, t]) => { __infra.lab.look(c[0], c[2], t[0], t[1], t[2], c[1]); }, [c, t]).catch(() => {}); await p.waitForTimeout(200); await p.evaluate(([c, t]) => { __infra.camera.position.set(c[0], c[1], c[2]); __infra.camera.lookAt(t[0], t[1], t[2]); }, [c, t]); };
// a still of the scene from camera c looking at t (game units), drawn straight by the game's renderer (no post-processing:
// the player's eye is not moved — a pane high on a wall needs no floor to stand on)
async function still(p, name, label, c, t) { const url = await p.evaluate(async ([c, t]) => { const R = __infra.renderer, cam = __infra.camera.clone(); cam.position.set(c[0], c[1], c[2]); cam.lookAt(t[0], t[1], t[2]); cam.updateMatrixWorld(true);
  await new Promise(r => requestAnimationFrame(r)); R.render(__infra.scene, cam); return R.domElement.toDataURL('image/jpeg', .9); }, [c, t]);
  const f = path.join(out, name + '.jpg'); writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); cells.push({ file: f, label }); return f; }
// the mean absolute difference (0-255) of two pictures in a box [x, y, w, h] of the page's pixels (null: the whole)
async function diff(p, fa, fb, box = null) { return p.evaluate(async ({ a, b, box }) => { const img = s => new Promise(r => { const m = new Image(); m.onload = () => r(m); m.src = s; }); const [A, B] = await Promise.all([img(a), img(b)]);
  const [x, y, w, h] = box || [0, 0, A.width, A.height], S = 96, c = document.createElement('canvas'); c.width = c.height = S; const k = c.getContext('2d', { willReadFrequently: true });
  const px = m => { k.clearRect(0, 0, S, S); k.drawImage(m, x, y, w, h, 0, 0, S, S); return k.getImageData(0, 0, S, S).data; }; const da = px(A), db = px(B); let s = 0, mx = 0, red = 0, n = 0, yel = 0;   // (n: pixels changed by more than 15 — the lit area; yel: R and G up over B, a yellow change)
  for (let i = 0; i < da.length; i += 4) { const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3; s += d; if (d > mx) mx = d; red += (da[i] - db[i]) - (da[i + 1] - db[i + 1]) / 2 - (da[i + 2] - db[i + 2]) / 2; if (d > 15) n++; yel += (da[i] - db[i] + da[i + 1] - db[i + 1]) / 2 - (da[i + 2] - db[i + 2]); }
  return { mean: +(s / (S * S)).toFixed(2), max: Math.round(mx), red: +(red / (S * S)).toFixed(2), n, yel: +(yel / (S * S)).toFixed(2) }; }, { a: 'data:image/jpeg;base64,' + readFileSync(fa).toString('base64'), b: 'data:image/jpeg;base64,' + readFileSync(fb).toString('base64'), box }); }
try {
  // ── A · Dust II: the planted bomb, the dropped bomb, the death cam's contrast ──
  { const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await enter(p, 'defuse', 'dust2', '1');
    await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 60000, polling: 200 }); await p.waitForTimeout(1200);
    const me = await p.evaluate(() => { const c = __infra.camera, d = c.getWorldDirection(c.position.clone()); return { c: [c.position.x, c.position.y, c.position.z], d: [d.x, d.y, d.z] }; });
    const L = Math.hypot(me.d[0], me.d[2]) || 1, dx = me.d[0] / L, dz = me.d[2] / L, feet = me.c[1] - 64 * 2.54 / 16.5;
    const B = [me.c[0] + dx * 10, feet, me.c[2] + dz * 10];   // (the bomb 10 game units — 65 HU — in front of you, on your floor)
    const cam = me.c;   // (looked at from your own eye: lab.look keeps you where you stand)
    // the host plants it there
    { const G = g(), r = G.combat.d.round; r.phase = 'planted'; r.planted = { x: B[0], y: B[1], z: B[2], site: 'A', at: Date.now(), explodeAt: Date.now() + 40000 }; room.touch?.('combat'); }
    await p.waitForFunction(() => !!__infra.lab.arenaUI?.bombObj, null, { timeout: 15000, polling: 100 }).catch(() => {});
    const pl = await p.evaluate(() => { const U = __infra.lab.arenaUI, o = U.bombObj; if (!o) return null; o.updateMatrixWorld(true); const s = new o.position.constructor(); o.getWorldScale(s); return { scale: [s.x, s.y, s.z], on: U.bombLights.P.on === o, vis: U.bombLights.P.g.visible }; });
    check('A · the planted bomb is drawn (CS2 size: scale 1) with its light hung on it', pl && Math.abs(pl.scale[0] - 1) < 1e-6 && pl.on && pl.vis, JSON.stringify(pl));
    await aim(p, cam, [B[0], B[1] + 2.2, B[2]]);   // (aimed over it: the crosshair never covers its light)
    const T = await p.evaluate(() => { const U = __infra.lab.arenaUI, t = 4e12; U.bombLights.beep(t); U.bombLights.hold(t + 8); return t; }); await p.waitForTimeout(300);
    const fOn = await shot(p, 'planted-flash', 'Planted bomb · CS2 size (1×, was 1.4×) · c4_timer_light flash (red 255 75 75, 0.5 s) with a beep');
    const sOn = await p.evaluate(() => __infra.lab.arenaUI.bombLights.state.planted);
    await p.evaluate(t => __infra.lab.arenaUI.bombLights.hold(t + 450), T); await p.waitForTimeout(300);
    const fOff = await shot(p, 'planted-dark', 'Planted bomb · between beeps (the flash gone after 0.5 s)'); const sOff = await p.evaluate(() => __infra.lab.arenaUI.bombLights.state.planted);
    const led = await p.evaluate(() => { const U = __infra.lab.arenaUI, V = U.bombObj.position.constructor, q = U.bombLights.P.core.getWorldPosition(new V()).project(__infra.camera); return [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight]; });
    const dP = await diff(p, fOn, fOff, [led[0] - 40, led[1] - 40, 80, 80]);
    check('A · the planted flash: lit at the beep, dark 0.45 s later, plain in the picture (a lit red area at the LED)', sOn > .95 && sOff === 0 && dP.max >= 40 && dP.red > 2 && dP.n >= 40, JSON.stringify({ sOn, sOff, dP, led }));
    for (const [f, t] of [[fOn, 'flash'], [fOff, 'between beeps']]) cells.push({ file: f, label: 'Planted bomb · zoom ×4 · ' + t, crop: [led[0] - 70, led[1] - 50, 140, 79] });
    await p.evaluate(() => __infra.lab.arenaUI.bombLights.hold(null));
    // live: the beeps fire flashes on their own (1 s apart at the plant)
    const live = await p.evaluate(async () => { const U = __infra.lab.arenaUI, f0 = U.bombLights.state.flashes, t0 = performance.now(); let mx = 0; while (performance.now() - t0 < 2300) { await new Promise(r => requestAnimationFrame(r)); mx = Math.max(mx, U.bombLights.state.planted); } return { flashes: U.bombLights.state.flashes - f0, max: mx }; });
    check('A · live: the bomb beeps and flashes about once a second just after the plant', live.flashes >= 2 && live.flashes <= 4 && live.max > .5, JSON.stringify(live));
    // the dropped bomb: take the plant back, drop one on the ground there
    { const G = g(), r = G.combat.d.round; r.phase = 'freeze'; r.planted = null; G.combat.groundSeq = (G.combat.groundSeq || 0) + 1; (G.combat.ground ??= []).push({ id: 'gdet' + G.combat.groundSeq, item: 'c4', x: B[0], z: B[2], y: B[1], yaw: .6, at: Date.now(), by: 'tester', team: 't', ammo: null }); G.arena.dirty = true; room.touch?.('combat'); }
    await p.waitForFunction(() => !!__infra.lab.arenaUI?.bombLights?.D?.on, null, { timeout: 15000, polling: 100 }).catch(() => {});
    const dr = await p.evaluate(() => { const U = __infra.lab.arenaUI; return { on: !!U.bombLights.D.on, planted: !!U.bombObj }; });
    check('A · the dropped bomb carries the yellow blink (and the planted one is gone)', dr.on && !dr.planted, JSON.stringify(dr));
    const drop = g().combat.ground.find(x => x.item === 'c4')?.at ?? Date.now();
    await p.evaluate(t => __infra.lab.arenaUI.bombLights.hold(t + 111), drop); await p.waitForTimeout(300);
    const fdOn = await shot(p, 'dropped-on', 'Dropped bomb · c4_timer_light_dropped blink ON (yellow 255 255 96, once a second, C4.LightFlash)'); const dOn = await p.evaluate(() => __infra.lab.arenaUI.bombLights.state.dropped);
    await p.evaluate(t => __infra.lab.arenaUI.bombLights.hold(t + 700), drop); await p.waitForTimeout(300);
    const fdOff = await shot(p, 'dropped-off', 'Dropped bomb · between blinks'); const dOff = await p.evaluate(() => __infra.lab.arenaUI.bombLights.state.dropped);
    const led2 = await p.evaluate(() => { const U = __infra.lab.arenaUI, D = U.bombLights.D, V = D.g.position.constructor, q = D.core.getWorldPosition(new V()).project(__infra.camera); return [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight]; });
    const dD = await diff(p, fdOn, fdOff, [led2[0] - 40, led2[1] - 40, 80, 80]);
    check('A · the dropped blink: on at 0.11 s into its second, off at 0.7 s, plain in the picture (a lit yellow area at the LED, not one pixel)', dOn > .8 && dOff < .1 && dD.max >= 40 && dD.n >= 20 && dD.yel > .3, JSON.stringify({ dOn, dOff, dD, led2 }));
    for (const [f, t] of [[fdOn, 'blink on'], [fdOff, 'blink off']]) cells.push({ file: f, label: 'Dropped bomb · zoom ×4 · ' + t, crop: [led2[0] - 70, led2[1] - 50, 140, 79] });
    await p.evaluate(() => __infra.lab.arenaUI.bombLights.hold(null));
    // the death cam's local contrast: the same view (down the spawn, wide), off / on / on with the tint
    await aim(p, [me.c[0], me.c[1], me.c[2]], [me.c[0] + me.d[0] * 50, me.c[1] + me.d[1] * 50, me.c[2] + me.d[2] * 50]); await p.waitForTimeout(400);
    await p.evaluate(async () => { const P = await import('/gd-deathcam-post.js'); P.DEATH_POST.amount = 0; }); await p.waitForTimeout(250);
    const fc0 = await shot(p, 'deathcam-off', 'Death cam local contrast OFF (the plain view)');
    await p.evaluate(async () => { const P = await import('/gd-deathcam-post.js'); P.DEATH_POST.amount = 1; }); await p.waitForTimeout(250);
    const fc1 = await shot(p, 'deathcam-contrast', 'Death cam local contrast ON (death_cam_phase1.vpost: strength 2, edge 2, rim blur .95; our formula)');
    await p.evaluate(() => { const t = document.getElementById('gd-dc-tint'); if (t) { t.hidden = false; t.style.opacity = '1'; } }); await p.waitForTimeout(250);
    const fc2 = await shot(p, 'deathcam-full', 'Death cam phase 1: the local contrast + CS2\'s colour table and vignette (the tint)');
    await p.evaluate(async () => { const P = await import('/gd-deathcam-post.js'); P.DEATH_POST.amount = 0; const t = document.getElementById('gd-dc-tint'); if (t) { t.style.opacity = '0'; t.hidden = true; } });
    const dC = await diff(p, fc0, fc1), W = 1280, H = 720, rim = await diff(p, fc0, fc1, [0, 0, 160, 160]), mid = await diff(p, fc0, fc1, [W / 2 - 120, H / 2 - 120, 240, 240]);
    check('A · the death cam\'s contrast pass draws (the frame changes: the rim softer, the middle crisper)', dC.mean > 1 && rim.mean > 0 && mid.mean > 0, JSON.stringify({ dC, rim, mid })); report.deathcam = { dC, rim, mid };
    await p.close(); }
  // ── B · Nuke's and Anubis's window-prop panes in the look ──
  for (const map of ['nuke', 'anubis']) {
    if (!existsSync(path.join(root, 'user-maps', map + '.bsp'))) { console.log('SKIP B · ' + map + ': no map file'); continue; }
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await enter(p, 'practice', map, '0');
    const info = await p.evaluate(async map => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'); let look = null; __infra.scene.traverse(o => { if (o.userData?.cs2Render) look = o; });
      const panes = (ARENA_MAPS[map].movers || []).map((m, i) => [m, i]).filter(([m]) => m.pane), res = [];
      for (const [m, idx] of panes) { const G = look?.userData.movers?.get(m.e), b = m.box; res.push({ e: m.e, idx, win: !!m.window, claimed: !!G?.userData?.setBroken, c: [ARENA.cx + (b[0] + b[1]) / 2, (b[4] + b[5]) / 2, ARENA.cz + (b[2] + b[3]) / 2], size: [b[1] - b[0], b[5] - b[4], b[3] - b[2]] }); }
      // for a pane the look did not claim: the look's meshes whose material sounds like glass / window near it
      const near = []; for (const r of res.filter(r => !r.claimed)) { const hits = new Set(); look?.traverse(o => { if (!o.isMesh || !o.geometry?.boundingSphere && !o.geometry?.computeBoundingSphere) return; o.geometry.boundingSphere || o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (s.distanceToPoint(new s.center.constructor(r.c[0], r.c[1], r.c[2])) < 3) hits.add(o.material?.name || '?'); }); near.push({ e: r.e, mats: [...hits].slice(0, 12) }); }
      return { panes: look?.userData.panes, list: res, near }; }, map);
    report[map] = info; const claimed = info.list.filter(x => x.claimed).length, wins = info.list.filter(x => x.win), wc = wins.filter(x => x.claimed).length;
    console.log(map, 'panes', info.list.length, 'claimed', claimed, 'window props', wins.length, 'claimed', wc, JSON.stringify(info.near).slice(0, 1500));
    check(`B · ${map}: every window-prop pane's glass is found in the look (a broken window draws no glass)`, wins.length > 0 && wc === wins.length, `window props ${wc}/${wins.length} claimed · all panes ${claimed}/${info.list.length} · look.userData.panes ${JSON.stringify(info.panes)}`);
    // one claimed pane pictured whole and broken (the host breaks it — the 'gd-break' event, as a shot sends it)
    const pick = info.list.find(x => x.win && x.claimed) || info.list.find(x => x.claimed);
    if (pick) { const thin = pick.size.indexOf(Math.min(...pick.size)), dir = [0, 0, 0]; dir[thin] = 1; let camAt = null;
      for (const sgn of [1, -1]) { const c = [pick.c[0] + dir[0] * sgn * 9, pick.c[1] + .5, pick.c[2] + dir[2] * sgn * 9];
        const clear = await p.evaluate(async ([c, t]) => { const THREE = await import('/three.module.js'), rc = new THREE.Raycaster(), o = new THREE.Vector3(...c), d = new THREE.Vector3(...t).sub(o), L = d.length(); rc.camera = __infra.camera; rc.set(o, d.normalize()); rc.far = L - 1; try { return !rc.intersectObjects(__infra.scene.children, true).some(h => h.object.isMesh && h.object.visible && !h.object.userData.glass); } catch { return false; } }, [c, pick.c]);
        if (clear) { camAt = c; break; } }
      camAt ??= [pick.c[0] + dir[0] * 9, pick.c[1] + .5, pick.c[2] + dir[2] * 9];
      const tris = i => { let look = null; __infra.scene.traverse(o => { if (o.userData?.cs2Render) look = o; }); const M = look?.userData.movers?.get(i); return M?.userData.glassTris ? M.userData.glassTris() : -1; };
      const t0 = await p.evaluate(tris, pick.e);
      const f0 = await still(p, map + '-pane-whole', `${map} · window-prop pane ${pick.e} whole (its glass claimed by the look)`, camAt, pick.c);
      const sent = await p.evaluate(i => { const S = __infra.lab.arenaScene, bx = [...(S.boxes || [])].filter(b => b.mover === i && S.breakableOf(b) !== null); if (bx.length) dispatchEvent(new CustomEvent('gd-break', { detail: { boxes: bx, dmg: 30 } })); return bx.length; }, pick.idx);   // (boxes carry the mover's index: arena-maps.js mapBoxes)
      await p.waitForFunction(i => !!__infra.lab.world.operations.game.combat?.mapState?.broken?.[i], pick.idx, { timeout: 8000, polling: 100 }).catch(() => {}); await p.waitForTimeout(600);
      const f1 = await still(p, map + '-pane-broken', `${map} · pane ${pick.e} broken by the host: its glass gone from the look`, camAt, pick.c);
      const st = await p.evaluate(i => !!__infra.lab.world.operations.game.combat?.mapState?.broken?.[i], pick.idx), dd = await diff(p, f0, f1, [640 - 200, 360 - 150, 400, 300]);
      const t1 = await p.evaluate(tris, pick.e);   // (v53 DETAILS final: the glass mesh's own state — its claimed triangles drawn whole, none once broken — not only a picture difference, which the shards alone would make)
      check(`B · ${map}: a broken pane's glass stops drawing (its claimed triangles ${t0} → ${t1})`, st && t0 > 0 && t1 === 0, JSON.stringify({ sent, broken: st, t0, t1, dd })); }
    await p.close(); }
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  // ── the sheet ──
  const sp = await b.newPage({ viewport: { width: 800, height: 600 } });
  const sheet = await sp.evaluate(async ({ cells }) => { const cw = 560, ch = 315, lab = 34, pad = 8, cols = 3, head = 54, rows = Math.ceil(cells.length / cols), W = cols * (cw + pad) + pad, H = head + rows * (ch + lab + pad) + pad;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'); x.fillStyle = '#121619'; x.fillRect(0, 0, W, H); x.fillStyle = '#f0b232'; x.font = 'bold 22px system-ui'; x.fillText('GLOBAL DEFENSIVE v53 · DETAILS: the C4\'s planted and dropped lights (CS2 particles), its CS2 size, the death cam\'s local contrast, window-prop glass', pad + 4, 34);
    for (let i = 0; i < cells.length; i++) { const c = cells[i], cx = pad + (i % cols) * (cw + pad), cy = head + Math.floor(i / cols) * (ch + lab + pad); const im = await new Promise(r => { const m = new Image(); m.onload = () => r(m); m.onerror = () => r(null); m.src = c.src; });
      x.fillStyle = '#1d2329'; x.fillRect(cx, cy, cw, ch + lab); if (im && c.crop) { x.drawImage(im, c.crop[0], c.crop[1], c.crop[2], c.crop[3], cx, cy, cw, ch); } else if (im) { const s = Math.max(cw / im.width, ch / im.height), w = im.width * s, h = im.height * s; x.save(); x.beginPath(); x.rect(cx, cy, cw, ch); x.clip(); x.drawImage(im, cx + (cw - w) / 2, cy + (ch - h) / 2, w, h); x.restore(); }
      x.fillStyle = '#dfe6ec'; x.font = '600 12px system-ui'; x.fillText(c.label, cx + 6, cy + ch + 22, cw - 12); }
    return cv.toDataURL('image/jpeg', .9); }, { cells: cells.map(c => ({ src: 'data:image/jpeg;base64,' + readFileSync(c.file).toString('base64'), label: c.label, crop: c.crop || null })) });
  writeFileSync(path.join(out, 'GD-v53-details.jpg'), Buffer.from(sheet.split(',')[1], 'base64')); writeFileSync(SHEET, Buffer.from(sheet.split(',')[1], 'base64')); console.log('sheet: ' + SHEET);
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  if (!noOpen) try { execFileSync('open', ['-a', 'Preview', SHEET]); } catch {}
} catch (e) { console.log('FAIL (error) ' + (e?.stack || e)); n++; }
finally { await b.close(); room.close?.(); }
console.log(`${ok}/${n}`); console.log((ok === n ? 'PASS' : 'FAIL') + ': gd-details-shots'); process.exit(ok === n ? 0 : 1);
