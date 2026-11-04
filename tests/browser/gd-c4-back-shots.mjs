// v53 C4 · Addendum 10, muted: the bomb on the carrier's back with its blinking light, as other players see it.
//   A · the models (gd-gallery page, the game's own loaders and gd-c4-back.js; then again with the import hidden — the
//       shipped CC0 bomb on the built-in soldier, the fallback): the carrier from behind — the whole body
//       and close up — at CS2's flash (the light on, 0.111 s into its 1 s cycle) and between flashes (off), on the CS2 T
//       agent (when imported on this computer) and on the built-in soldier.
//   B · the real game: a Defuse round (the room in this process, lan/room.mjs startRoom), long freeze time; the host
//       hands the bomb to a Terrorist bot, the camera is put behind it: the rig must hang on that bot's body
//       (window.__c4Back.state), pictured at the flash and between; a drop takes it off at once.
// Writes the cells to <out-dir> and the labelled sheet to ~/Desktop/GD-v53-c4-back.jpg (opened in Preview).
//   node tests/browser/gd-c4-back-shots.mjs <repo-root> <out-dir> [map=dust2] [--no-open]
import { chromium } from 'playwright-core'; import { spawn, execFileSync } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), noOpen = argv.includes('--no-open'), args = argv.filter(a => !a.startsWith('--'));
const [root = '.', out = path.join(os.tmpdir(), 'gd-c4-back'), MAP = 'dust2'] = args; mkdirSync(out, { recursive: true });
const SHEET = path.join(os.homedir(), 'Desktop', 'GD-v53-c4-back.jpg');
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); }; const errs = [];
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
const { startRoom } = await import(path.resolve(root, 'lan/room.mjs'));
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdc4-')), 's.json'), roomCode: 'GDC401', hostKey: 'k', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, g = () => room.world.operations.game, key = s => String(s).trim().toLowerCase().slice(0, 40);
const cells = [];   // { src (data URL), label }
try {
  // ── A · the models, from behind (fallback: the page told there is no import — the shipped CC0 bomb, the built-in soldier) ──
  for (const fallback of [false, true]) { const p = await b.newPage({ viewport: { width: 900, height: 700 } }); p.on('pageerror', e => errs.push(e.message));
    if (fallback) await p.route('**/api/user-assets', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ models: {} }) }));
    await p.goto(base + '/gd-gallery.html');
    const res = await p.evaluate(async fallback => {
      const THREE = await import('/three.module.js'), A = await import('/cs2-agents.js'), W = await import('/weapon-models.js'), S = await import('/gd-soldiers.js'), C = await import('/gd-c4-back.js'), { RoomEnvironment } = await import('/post/RoomEnvironment.js');
      await W.loadRealWeapons(); const sides = await A.loadAgents();
      const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(420, 420); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x2e353c); sc.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), .04).texture;
      sc.add(new THREE.HemisphereLight(0xdfe8f0, 0x3a3f44, .9)); const sun = new THREE.DirectionalLight(0xfff2dd, 1.6); sun.position.set(-12, 30, 25); sc.add(sun);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x5a5d60, roughness: .95 })); fl.rotation.x = -Math.PI / 2; sc.add(fl);
      const cam = new THREE.PerspectiveCamera(30, 1, .02, 500), out = [], info = { file: W.modelFromFile('c4'), real: W.hasReal('c4'), sides };
      const bodies = []; if (!fallback && A.hasAgent('t')) bodies.push(['CS2 agent (Phoenix)', () => A.makeAgent({ name: 'Carrier' }, 't')]); bodies.push([fallback ? 'fallback: CC0 bomb, soldier' : 'built-in soldier (T)', () => S.makeSoldier({ name: 'Carrier', pose: {} }, 't')]);
      for (const [label, make] of bodies) {
        const d = make(); sc.add(d.g); d.setWeapon('ak'); for (let i = 0; i < 40; i++) d.update(1 / 60, { aim: true, speed: 0 });
        let now = 0; const players = [{ id: 'x', name: 'Carrier', pose: { gun: true, weapon: 'ak' } }], models = new Map([['x', { cs: d }]]), G = { mode: 'arena', combat: { d: { bomb: { carrier: 'carrier' } } } };
        const v = C.createC4Back({ scene: sc, players: () => players, models: () => models, selfId: () => 'me', game: () => G, hostNow: () => now });
        v.update(); d.update(1 / 60, { aim: true, speed: 0 }); sc.updateMatrixWorld(true); const led = v.led.getWorldPosition(new THREE.Vector3()), top = new THREE.Box3().setFromObject(d.g).max.y;
        for (const [ms, tag] of [[111, 'light ON (CS2 flash, 0.11 s)'], [650, 'light OFF (between flashes)']]) { now = ms; v.update();
          if (!fallback) { cam.position.set(led.x + 2.2, Math.max(led.y + 1.2, top * .72), led.z + 15); cam.lookAt(0, top * .55, 0); R.render(sc, cam); out.push({ src: R.domElement.toDataURL('image/jpeg', .92), label: label + ' · whole body · ' + tag }); }
          cam.position.set(led.x + .9, led.y + .7, led.z + 3.6); cam.lookAt(led.x, led.y - .25, led.z); R.render(sc, cam); out.push({ src: R.domElement.toDataURL('image/jpeg', .92), label: label + ' · close · ' + tag, pulse: v.state.pulse, mounted: v.state.mounted }); }
        v.dispose(); d.dispose?.(); }
      R.dispose(); return { out, info }; }, fallback);
    cells.push(...res.out); console.log('models' + (fallback ? ' (fallback)' : '') + ':', JSON.stringify(res.info));
    if (fallback) { check('A · fallback: no CS2 file — the shipped CC0 bomb on the built-in soldier, light on and off', res.info.real && !res.info.file && res.out.length === 2 && res.out[0].mounted === 'soldier' && res.out[0].pulse > .8 && res.out[1].pulse < .05, JSON.stringify(res.info)); await p.close(); continue; }
    check('A · the bomb hangs on every body pictured (agent: spine_3 · soldier: torso)', res.out.filter(c => c.mounted).every(c => c.mounted === 'agent' || c.mounted === 'soldier') && res.out.some(c => c.mounted), res.out.map(c => c.mounted).filter(Boolean).join(','));
    check('A · the light on at the flash, off between', res.out.filter(c => c.pulse !== undefined).every((c, i) => i % 2 ? c.pulse < .05 : c.pulse > .8), res.out.map(c => c.pulse?.toFixed?.(2)).filter(Boolean).join(' '));
    await p.close(); }
  // ── B · the real game ──
  { const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
    await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
    await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
    await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '5');
    await p.evaluate(() => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', '60'], ['ss-ar-diff', 'easy']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } }); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
    await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 300000 });
    await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
    await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 60000, polling: 200 }); await p.waitForTimeout(1500);
    const G = g(), C = G.combat, ts = G.arena.bots.filter(x => C.d.teams[key(x.name)] === 't'), bot = ts[0];
    check('B · a Terrorist bot to carry the bomb', !!bot, ts.length);
    C.d.bomb.carrier = key(bot.name); room.touch?.('combat');   // (the host gives it: its own field, as the round start does)
    await p.waitForFunction(k => globalThis.__c4Back?.state?.carrier === k, key(bot.name), { timeout: 15000, polling: 100 }).catch(() => {});
    await p.waitForTimeout(600);
    // the camera behind the bot (its back: + its facing's opposite), a little above, looking at its back
    const st = await p.evaluate(() => { const v = globalThis.__c4Back; if (!v?.rig?.parent) return null; v.rig.updateMatrixWorld(true); const V = v.rig.position.constructor, q = v.rig.getWorldPosition(new V()), nz = new V(0, 0, 1).transformDirection(v.rig.matrixWorld); return { mounted: v.state.mounted, at: [q.x, q.y, q.z], n: [nz.x, nz.y, nz.z], vis: v.rig.visible }; });   // (n: out of the back — the brick's top, Source +z)
    check('B · in the game the rig hangs on the carrier bot\'s body', st?.mounted === 'agent' || st?.mounted === 'soldier', JSON.stringify(st));
    if (st) { const L = Math.hypot(st.n[0], st.n[2]) || 1, bx = st.n[0] / L, bz = st.n[2] / L, [x, y, z] = st.at;   // (behind: along the back's normal, level)
      // the 10 m shot: the first spot 60 u (10 m) out behind the back, turned up to ±75°, with a clear line to the LED
      // (a ray through the map: nothing but the carrier's own body before it)
      const far = await p.evaluate(async ([x, y, z, bx, bz]) => { const THREE = await import('/three.module.js'), v = globalThis.__c4Back, led = v.led.getWorldPosition(new THREE.Vector3()), rc = new THREE.Raycaster(); rc.camera = __infra.camera; let top = v.rig; while (top.parent && top.parent !== __infra.scene) top = top.parent;   // (top: the carrier's whole body)
        const mine = o => { for (let q = o; q; q = q.parent) if (q === top || q === v.rig) return true; return false; };
        for (const deg of [0, 25, -25, 50, -50, 75, -75]) { const a = deg * Math.PI / 180, dx = bx * Math.cos(a) - bz * Math.sin(a), dz = bx * Math.sin(a) + bz * Math.cos(a), c = new THREE.Vector3(x + dx * 60, y + 4, z + dz * 60), dir = led.clone().sub(c), d = dir.length(); rc.set(c, dir.normalize()); rc.far = d - .3;
          const hit = rc.intersectObjects(__infra.scene.children, true).find(h => h.object.visible !== false && !h.object.isSprite && !h.object.isPoints && !h.object.isLine && !mine(h.object));
          if (!hit) return { cam: [c.x, c.y, c.z], deg }; }
        return null; }, [x, y, z, bx, bz]);
      check('B · a clear 10 m line of sight to the carrier\'s back found for the far shot', !!far, JSON.stringify(far));
      for (const [cam, tag] of [[[x + bx * 14 - bz * 3, y + 2.5, z + bz * 14 + bx * 3], 'whole'], [[x + bx * 4.2 - bz * .8, y + 1.2, z + bz * 4.2 + bx * .8], 'close'], ...(far ? [[far.cam, 'far (10 m)']] : [])]) {
        /* (aimed below the LED, so the crosshair never covers it) */ await p.evaluate(([c, t]) => __infra.lab.look(c[0], c[2], t[0], t[1], t[2], c[1]), [cam, [x, y - (tag === 'whole' ? 2.5 : tag === 'close' ? 1.1 : 3), z]]).catch(() => {});
        for (const [ms, lt] of [[111, 'light ON'], [650, 'light OFF']]) {   // (the blink held at that moment of CS2's cycle for the picture: holdPulse)
          await p.evaluate(ms => globalThis.__c4Back?.holdPulse(ms), ms); await p.waitForTimeout(250);
          const f = path.join(out, `game-${tag}-${lt.replace(' ', '-')}.jpg`); await p.screenshot({ path: f, type: 'jpeg', quality: 88 });
          const { pulse, px } = await p.evaluate(() => { const v = globalThis.__c4Back, V = v.rig.position.constructor, q = v.led.getWorldPosition(new V()).project(__infra.camera); return { pulse: v?.state?.pulse, px: [(q.x + 1) / 2 * innerWidth * devicePixelRatio, (1 - q.y) / 2 * innerHeight * devicePixelRatio] }; });
          cells.push({ file: f, label: `in game (${MAP}) · bot carrier from behind · ${tag} · ${lt}`, pulse, px, pair: tag }); console.log(`  ${tag} ${lt}: LED at ${px.map(Math.round).join(', ')} px`); } }
      await p.evaluate(() => globalThis.__c4Back?.holdPulse(null));
      const gc = cells.filter(c => c.file); check('B · pictured at the flash and between', gc.length === (far ? 6 : 4) && gc.every((c, i) => i % 2 ? c.pulse < .05 : c.pulse > .8), gc.map(c => c.pulse?.toFixed?.(2)).join(' '));
      // and live, on the host's clock: it blinks (sampled for 1.3 s)
      const live = await p.evaluate(async () => { const a = []; const t0 = performance.now(); while (performance.now() - t0 < 1300) { await new Promise(r => requestAnimationFrame(r)); a.push(globalThis.__c4Back?.state?.pulse ?? -1); } return { min: Math.min(...a), max: Math.max(...a), n: a.length }; });
      check('B · live in the game it blinks (host clock: dark and lit within 1.3 s)', live.min < .05 && live.max > .5, JSON.stringify(live)); }
    // a pickup by another Terrorist (the host's field changes): the rig moves to that body at once; then you (first person:
    // never on your own back). (A drop in the freeze time is given straight back by the host — arena-defuse.js — so the
    // drop itself is checked in node: tests/gd-c4-back.mjs.)
    const pid = async () => p.evaluate(() => { const v = globalThis.__c4Back; let id = null; for (const [k, m] of __infra.lab.lan.models) { let o = v?.rig?.parent; while (o && o !== m.g) o = o.parent; if (o) id = k; } return { id, mounted: v?.state?.mounted, vis: v?.rig?.visible }; });
    const first = await pid(); if (ts[1]) { C.d.bomb.carrier = key(ts[1].name); await p.waitForFunction(k => globalThis.__c4Back?.state?.carrier === k, key(ts[1].name), { timeout: 15000, polling: 100 }).catch(() => {}); await p.waitForTimeout(100); }
    const second = await pid(); check('B · the bomb given to another Terrorist: the rig moves to that body at once', !!ts[1] && second.vis && second.mounted && second.id && second.id !== first.id, JSON.stringify([first, second]));
    C.d.bomb.carrier = 'tester'; await p.waitForFunction(() => globalThis.__c4Back?.state?.carrier === 'tester', null, { timeout: 15000, polling: 100 }).catch(() => {}); await p.waitForTimeout(100);
    const mine = await p.evaluate(() => ({ vis: globalThis.__c4Back?.rig?.visible, mounted: globalThis.__c4Back?.state?.mounted, self: globalThis.__c4Back?.state?.self }));
    check('B · you carry it: not drawn on your own back (first person), hidden', mine.vis === false && !mine.mounted && mine.self, JSON.stringify(mine));
    await p.close(); }
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  // ── the sheet (labels drawn in a page: ffmpeg here has no drawtext) ──
  const sp = await b.newPage({ viewport: { width: 800, height: 600 } }); const fs = await import('node:fs');
  for (const c of cells) if (c.file) c.src = 'data:image/jpeg;base64,' + fs.readFileSync(c.file).toString('base64');
  const seen = await sp.evaluate(async ({ cells }) => { const img = src => new Promise(r => { const m = new Image(); m.onload = () => r(m); m.onerror = () => r(null); m.src = src; }), res = {};
    for (let i = 0; i + 1 < cells.length; i++) { const a = cells[i], o = cells[i + 1]; if (!a.pair || a.pair !== o.pair) continue; const [A, B] = await Promise.all([img(a.src), img(o.src)]); const S = 24, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d', { willReadFrequently: true });
      const grab = m => { x.clearRect(0, 0, S, S); x.drawImage(m, a.px[0] - S / 2, a.px[1] - S / 2, S, S, 0, 0, S, S); return x.getImageData(0, 0, S, S).data; }; const da = grab(A), db = grab(B); let max = 0, sum = 0;
      for (let k = 0; k < da.length; k += 4) { const d = ((da[k] - db[k]) + (da[k + 1] - db[k + 1]) + (da[k + 2] - db[k + 2])) / 3; max = Math.max(max, d); sum += Math.abs(d); }
      res[a.pair] = { max: Math.round(max), mean: +(sum / (S * S)).toFixed(1) }; i++; }
    return res; }, { cells: cells.map(({ src, pair, px }) => ({ src, pair, px })) });
  check('B · the blink is plain to see in the game: ON brighter than OFF at the LED (24 px box, 0-255) — close, whole, 10 m', seen.close?.max >= 80 && seen.whole?.max >= 50 && seen['far (10 m)']?.max >= 30, JSON.stringify(seen));
  // zoomed cells (the in-game LED, ON and OFF side by side: on the sheet the whole screenshot is shrunk to 400 px)
  for (const [pair, S] of [['close', 360], ['far (10 m)', 120]]) for (const c of cells.filter(c => c.pair === pair)) cells.push({ src: c.src, label: c.label.replace('bot carrier from behind · ', '') + ' · zoom ×' + (400 / S).toFixed(1), crop: [c.px[0] - S / 2, c.px[1] - S / 2 - S * .1, S, S] });
  const sheet = await sp.evaluate(async ({ cells }) => { const cw = 400, ch = 400, lab = 30, pad = 8, cols = 4, head = 54, rows = Math.ceil(cells.length / cols), W = cols * (cw + pad) + pad, H = head + rows * (ch + lab + pad) + pad;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'); x.fillStyle = '#121619'; x.fillRect(0, 0, W, H); x.fillStyle = '#f0b232'; x.font = 'bold 24px system-ui'; x.fillText('GLOBAL DEFENSIVE v53 · THE C4 ON THE CARRIER\'S BACK (CS2 attachment, CS2 holstered-light blink 1/s, warm yellow)', pad + 4, 34);
    for (let i = 0; i < cells.length; i++) { const c = cells[i], cx = pad + (i % cols) * (cw + pad), cy = head + Math.floor(i / cols) * (ch + lab + pad); const im = await new Promise(r => { const m = new Image(); m.onload = () => r(m); m.onerror = () => r(null); m.src = c.src; });
      x.fillStyle = '#1d2329'; x.fillRect(cx, cy, cw, ch + lab); if (im && c.crop) { x.imageSmoothingEnabled = false; x.drawImage(im, c.crop[0], c.crop[1], c.crop[2], c.crop[3], cx, cy, cw, ch); x.imageSmoothingEnabled = true; } else if (im) { const s = Math.max(cw / im.width, ch / im.height), w = im.width * s, h = im.height * s; x.save(); x.beginPath(); x.rect(cx, cy, cw, ch); x.clip(); x.drawImage(im, cx + (cw - w) / 2, cy + (ch - h) / 2, w, h); x.restore(); }
      x.fillStyle = '#dfe6ec'; x.font = '600 13px system-ui'; x.fillText(c.label, cx + 6, cy + ch + 20, cw - 12); }
    return cv.toDataURL('image/jpeg', .9); }, { cells: cells.map(({ src, label, crop }) => ({ src, label, crop })) });
  writeFileSync(path.join(out, 'GD-v53-c4-back.jpg'), Buffer.from(sheet.split(',')[1], 'base64')); writeFileSync(SHEET, Buffer.from(sheet.split(',')[1], 'base64')); console.log('sheet: ' + SHEET);
  if (!noOpen) try { execFileSync('open', ['-a', 'Preview', SHEET]); } catch {}
} catch (e) { console.log('FAIL (error) ' + (e?.stack || e)); n++; }
finally { await b.close(); room.close?.(); }
console.log(`${ok}/${n}`); console.log((ok === n ? 'PASS' : 'FAIL') + ': gd-c4-back-shots'); process.exit(ok === n ? 0 : 1);
