// CS2's own incendiary, decoy and AUG (tools/cs2-fp/export_missing.py → user-assets) as the game draws them, before
// (without them: the old pack's AUG rig and model, the cans recoloured smoke grenades — what v51 drew) and now, on one
// labelled contact sheet: first person in a real match (idle; the pin pulled and the throw; the AUG firing and mid-reload),
// third person on the CT agent, the grenade in flight, landed (v51: frozen mid-tumble at its centre; now: on its side on the
// floor, arena-nades-view restNade) and dropped. Checks: the view shows CS2's set for each, others draw CS2's model (its
// vertex count), a landed grenade's lowest point on the floor, no page errors. The molotov's world model too (CS2's bottle,
// no lighter: it was the CC0 bottle; its first-person set was CS2's already); a landed incendiary or molotov bursts into
// fire and is no longer drawn (arena-nades-view liesAfter). Needs the CS2 assets (user-assets): skipped without.
//   node tests/browser/gd-nade-aug-sheet.mjs <repo-root> <out-dir> [before=<user-assets dir without them>] [desktop=1]
// desktop=1 also writes ~/Desktop/GD-v52-incendiary-decoy-aug.jpg.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-nade-aug-sheet'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('='))), ITEMS = ['incendiary', 'decoy', 'aug', 'molotov'], FP_NEW = new Set(['incendiary', 'decoy', 'aug']);   // (the molotov's first-person set was CS2's already: its world model is new)
if (!existsSync(path.join(root, 'user-assets', 'fp', 'cs2_aug.glb')) || !existsSync(path.join(root, 'user-assets', 'agents', 'cs2_anims.glb'))) { console.log('SKIP: no CS2 assets on this computer'); process.exit(0); }
const servers = [];
async function serve(code, assets) { const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: code, HOST_KEY: 'k', ...(assets ? { GD_ASSETS_DIR: assets } : {}), CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gna-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] }); servers.push(s);
  return new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); })); }
process.on('exit', () => { for (const s of servers) try { s.kill(); } catch {} });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); }; const errs = [];
const page = async (base, w = 960, h = 600, url = '/gd-gallery.html') => { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto(base + url); return p; };
const binCount = id => { const m = JSON.parse(readFileSync(path.join(root, 'user-assets', 'manifest.json'), 'utf8')).models.weapons?.[id]; if (!m) return -1; const f = readFileSync(path.join(root, 'user-assets', m.file)), hl = f.readUInt32LE(0); return JSON.parse(f.subarray(4, 4 + hl).toString()).parts.reduce((s, p) => s + p.count, 0); };

// ── First person, in a real match (solo Deathmatch on the built-in yard: loadouts free, a grenade bought) ──
async function fpCells(base) {
  const G = await page(base, 1280, 800, '/'); await G.addInitScript(() => { localStorage.setItem('infra-name', 'Viewer'); localStorage.setItem('infra-face-name', 'Viewer'); localStorage.setItem('infra-face', 'smile'); });
  await G.goto(base + '/'); await G.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await G.waitForTimeout(1200);
  await G.evaluate(() => document.querySelector('[data-start=arena]').click()); await G.waitForTimeout(400); await G.selectOption('#ss-ar-kind', 'dm'); await G.selectOption('#ss-ar-map', 'yard'); await G.selectOption('#ss-ar-bots', '0'); await G.evaluate(() => document.getElementById('ss-ar-solo').click());
  await G.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 }); await G.waitForTimeout(1500); await G.keyboard.press('Escape'); await G.waitForTimeout(300);
  await G.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); document.querySelectorAll('#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar').forEach(e => e && (e.style.visibility = 'hidden')); });
  const shot = async () => 'data:image/jpeg;base64,' + (await G.screenshot({ type: 'jpeg', quality: 85 })).toString('base64'), cells = [], info = {};
  const hold = id => G.evaluate(async id => { const P = __infra.lab.pistol, w = (await import('/weapons-data.js')).weaponById(id), { arenaArsenalOf } = await import('/combat-logic.js'), game = () => __infra.lab.world.operations.game, me = 'viewer';
    const act = async a => { try { return String(await __infra.lab.lan.act({ type: 'arena', action: a })); } catch (e) { return 'ERR ' + (e?.message || e); } };
    if (w.kind === 'nade') { for (const k of [...(game().arena?.loadout?.[me]?.nades || [])]) if (k !== id) await act({ type: 'drop', slot: 'nades', kind: k }); if (!(game().arena?.loadout?.[me]?.nades || []).includes(id)) await act({ type: 'buy-nade', kind: id }); }
    else await act({ type: 'loadout', primary: id });
    for (let i = 0; i < 40 && !arenaArsenalOf(game(), 'Viewer').includes(id); i++) await new Promise(r => setTimeout(r, 100));
    P.equip(null); await new Promise(r => setTimeout(r, 60)); P.equip(id); for (let i = 0; i < 40 && P.current?.id !== id; i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 1500)); return { cur: P.current?.id || null, set: P.viewInfo.set, authored: !!P.viewInfo.authored }; }, id);
  const pose = (id, what, ms) => G.evaluate(async ({ id, what, ms }) => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(id, P.viewInfo.set); if (!f) return false;
    if (what === 'prime') f.prime?.(); else if (what === 'wait') {} else if (what === 'throw') f.throw?.('long'); else if (what === 'fire') f.fire?.(); else if (what === 'reload') f.reload?.(2600); await new Promise(r => setTimeout(r, ms)); return true; }, { id, what, ms });
  for (const id of ITEMS) { const h = await hold(id); info[id] = h; const tag = h.authored ? 'CS2 set' : 'pack rig'; cells.push({ src: await shot(), label: id + ' · idle', sub: tag + ' · ' + h.set });
    if (id === 'aug') { await pose(id, 'fire', 60); cells.push({ src: await shot(), label: 'aug · fire', sub: tag }); await G.waitForTimeout(600); await pose(id, 'reload', 1300); cells.push({ src: await shot(), label: 'aug · reload', sub: tag + ' · mid-reload' }); }
    // (CS2's grenade clips: the can in full view while the pin comes out (~0.35 s), then held up at the screen's top right
    // ready to throw (the pull-pin clip's end pose: a quarter of it on screen — the HE, flash and smoke sets the same), and
    // in view again as the arm comes over at the release (~0.2 s into the throw); v52's first sheet shot 0.9 s / 0.26 s: gone)
    else { await pose(id, 'prime', 350); cells.push({ src: await shot(), label: id + ' · pulling the pin', sub: tag + ' · 0.35 s' }); await pose(id, 'wait', 750); cells.push({ src: await shot(), label: id + ' · pin out, ready', sub: tag + ' · held up, top right' });
      await pose(id, 'throw', 190); cells.push({ src: await shot(), label: id + ' · throw', sub: tag + ' · release 0.19 s' }); }
    await G.waitForTimeout(800); }
  await G.close(); return { cells, info };
}
// ── Third person on the CT agent, in flight, landed and dropped (offscreen renders in the page) ──
async function worldCells(base, old = false) {   // old: the landing as v51 drew it (this build's restNade not used)
  const p = await page(base, 900, 600); await p.waitForFunction(() => document.getElementById('status')?.textContent !== 'Loading models…', null, { timeout: 120000 }).catch(() => {});
  return p.evaluate(async ({ items, old }) => {
    const THREE = await import('/three.module.js'), A = await import('/cs2-agents.js'), W = await import('/weapon-models.js'), NV = await import('/arena-nades-view.js'), N = await import('/arena-nades.js'), { RoomEnvironment } = await import('/post/RoomEnvironment.js');
    await W.loadRealWeapons(); await A.loadAgents();
    const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(300, 220); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x2f363c); sc.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), .04).texture; sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(6, 12, 8); sc.add(sun);
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'); x.fillStyle = '#6d7075'; x.fillRect(0, 0, 256, 256); x.strokeStyle = '#4a4d52'; x.lineWidth = 2; for (let i = 0; i <= 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(40, 40); tex.colorSpace = THREE.SRGBColorSpace;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: tex, roughness: .9, transparent: true, opacity: .85 })); fl.rotation.x = -Math.PI / 2; sc.add(fl);
    const cam = new THREE.PerspectiveCamera(30, 300 / 220, .02, 300), box = new THREE.Box3(), snap = () => R.domElement.toDataURL('image/jpeg', .9), verts = m => { let v = 0; m.traverse(o => { if (o.isMesh) v += o.geometry.attributes.position.count; }); return v; };
    const frame = (m, k = 1) => { m.updateMatrixWorld(true); box.setFromObject(m, true); const s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), d = Math.max(s.x, s.y, s.z) * 2.6 * k + .4; cam.position.set(c.x + d * .45, c.y + d * .35, c.z + d * .8); cam.lookAt(c); };
    const out = {};
    for (const id of items) { const o = out[id] = { cells: [] }; const isNade = id !== 'aug';
      // third person: the CT agent, from its right
      const a = A.makeAgent({ name: 'Sheet' }, 'ct'); sc.add(a.g); a.update(1 / 60, { aim: true }); a.setWeapon(id); for (let i = 0; i < 50; i++) a.update(1 / 60, { aim: true, speed: 0 }); a.g.updateMatrixWorld(true);
      const h = new THREE.Vector3(); a.g.getObjectByName('hand_R').getWorldPosition(h); let wv = 0; a.g.getObjectByName('wpn')?.traverse(q => { if (q.isMesh) wv += q.geometry.attributes.position.count; });
      if (isNade) { cam.position.set(h.x + 2.3, h.y + .7, h.z - 2.6); cam.lookAt(h.x, h.y, h.z - .2); } else { cam.position.set(h.x + 6, h.y + .7, h.z - 1.4); cam.lookAt(h.x, h.y - .1, h.z - 1.4); }   /* (a grenade from the front right, so the can in the fist shows; the AUG from the agent's right) */ R.render(sc, cam); o.cells.push({ src: snap(), label: id + ' · CT agent', sub: wv + ' vertices in hand' }); o.tp = wv; a.dispose();
      const m = W.weaponModel(id, isNade ? 1.4 : 1); o.model = verts(m); o.file = W.modelFromFile?.(id) || false; sc.add(m);
      if (isNade) {   // in flight (the view's tumble), landed (v51's pose vs restNade), dropped
        m.position.set(0, 2.2, 0); m.rotation.set(1.1, .4, .7); frame(m, 1.3); R.render(sc, cam); o.cells.push({ src: snap(), label: id + ' · in flight', sub: o.model + ' vertices' });
        const phase = id === 'decoy' ? 'decoy' : 'fire', g = { id: 5, kind: id, phase, x: 0, y: phase === 'decoy' ? N.R : 0, z: 0 };
        if (!old && typeof NV.restNade === 'function') NV.restNade(m, id, g); else { m.rotation.set(1.1, .4, .7); m.position.set(0, phase === 'decoy' ? g.y : g.y + .3, 0); }   // (v51: where it stopped tumbling, at the sphere's centre — a fire's on the floor + .3)
        m.updateMatrixWorld(true); box.setFromObject(m, true); o.landLow = box.min.y; frame(m); const gone = !old && NV.liesAfter && !NV.liesAfter(phase); m.visible = !gone; R.render(sc, cam); m.visible = true;   // (an incendiary / molotov bursts into fire on landing: the game draws no can there — CS2 removes it)
        o.gone = gone; o.cells.push({ src: snap(), label: id + ' · landed', sub: gone ? 'bursts into fire: can removed (CS2)' : 'lowest point ' + (box.min.y * 16.5).toFixed(1) + ' cm from the floor' }); }
      m.scale.setScalar(1); const r = W.groundRest(id); m.rotation.set(r.x, .5, r.z, 'YXZ'); m.position.set(0, r.lift, 0); frame(m, isNade ? 1 : .5); R.render(sc, cam); o.cells.push({ src: snap(), label: id + ' · dropped', sub: (o.file ? 'CS2 model' : 'built-in look') + ' · ' + verts(m) + ' vertices' }); m.removeFromParent(); }
    R.dispose(); return out; }, { items: ITEMS, old });
}
async function compose(p, title, rows, cw, ch, cols) {
  return p.evaluate(async ({ title, rows, cw, ch, cols }) => {
    const pad = 6, lab = 34, head = 46; let y = head, x = 0; const pos = [];
    for (const r of rows) { if (x) { y += ch + lab + pad; x = 0; } pos.push({ head: r.head, y }); y += 26; for (const c of r.cells) { pos.push({ c, x: x * (cw + pad) + pad, y }); x++; if (x === cols) { x = 0; y += ch + lab + pad; } } }
    const H = y + (x ? ch + lab + pad : 0) + pad, Wd = cols * (cw + pad) + pad, cv = document.createElement('canvas'); cv.width = Wd; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#14181c'; g.fillRect(0, 0, Wd, H); g.fillStyle = '#f0b232'; g.font = 'bold 24px system-ui'; g.fillText(title, pad + 4, 32);
    const img = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
    for (const e of pos) { if (e.head) { g.fillStyle = '#9fb3c3'; g.font = 'bold 17px system-ui'; g.fillText(e.head, pad + 4, e.y + 18); continue; }
      const im = await img(e.c.src); g.fillStyle = '#20262c'; g.fillRect(e.x, e.y, cw, ch + lab); if (im) { const k = Math.max(cw / im.width, ch / im.height), w = im.width * k, h = im.height * k; g.save(); g.beginPath(); g.rect(e.x, e.y, cw, ch); g.clip(); g.drawImage(im, e.x + (cw - w) / 2, e.y + (ch - h) / 2, w, h); g.restore(); }
      g.fillStyle = '#e6edf2'; g.font = 'bold 13px system-ui'; g.fillText(e.c.label || '', e.x + 5, e.y + ch + 14); g.fillStyle = '#8fa1ae'; g.font = '11px ui-monospace, Menlo, monospace'; g.fillText(e.c.sub || '', e.x + 5, e.y + ch + 28); }
    return cv.toDataURL('image/jpeg', .86); }, { title, rows, cw, ch, cols });
}
try {
  const now = await serve('GDNAS1'), before = opt.before ? await serve('GDNAS0', opt.before) : null, rows = [];
  const W1 = await worldCells(now), W0 = before ? await worldCells(before, true) : null, F1 = await fpCells(now), F0 = before ? await fpCells(before) : null;
  for (const id of ITEMS) {
    if (F0) rows.push({ head: `${id.toUpperCase()} · BEFORE (no CS2 model of it: what v51 drew) — first person · third person · in flight · landed · dropped`, cells: [...F0.cells.filter(c => c.label.startsWith(id + ' ')), ...W0[id].cells] });
    rows.push({ head: `${id.toUpperCase()} · NOW (CS2's own model, CS2's first-person clips) — first person · third person · in flight · landed · dropped`, cells: [...F1.cells.filter(c => c.label.startsWith(id + ' ')), ...W1[id].cells] });
    check(`${id}: first person shows CS2's set`, F1.info[id].authored && F1.info[id].cur === id && F1.info[id].set === id, JSON.stringify(F1.info[id]));
    check(`${id}: other players, the thrown grenade and the dropped one draw CS2's model (${binCount(id)} vertices)`, W1[id].file && W1[id].model === binCount(id) && W1[id].tp === binCount(id), JSON.stringify({ model: W1[id].model, tp: W1[id].tp, file: W1[id].file }));
    if (id === 'decoy') check(`${id}: landed on the floor (lowest point within 1 cm)`, Math.abs(W1[id].landLow * 16.5) < 1, (W1[id].landLow * 16.5).toFixed(2) + ' cm' + (W0 ? ' · before ' + (W0[id].landLow * 16.5).toFixed(2) + ' cm' : ''));
    if (id === 'incendiary' || id === 'molotov') check(`${id}: landed, it bursts into fire and the can is no longer drawn (CS2)`, W1[id].gone === true);
    if (F0) check(`${id}: before, without the CS2 files, the old look (${FP_NEW.has(id) ? 'pack rig, ' : ''}no CS2 model)`, (!FP_NEW.has(id) || !F0.info[id].authored) && !W0[id].file, JSON.stringify(F0.info[id])); }
  const P = await page(now, 400, 300), dataURL = await compose(P, 'GLOBAL DEFENSIVE v52 · CS2 INCENDIARY, DECOY, AUG AND MOLOTOV · before / now', rows, 330, 206, 8), f = path.join(out, 'GD-v52-incendiary-decoy-aug.jpg');
  writeFileSync(f, Buffer.from(dataURL.split(',')[1], 'base64')); if (opt.desktop) copyFileSync(f, path.join(os.homedir(), 'Desktop', 'GD-v52-incendiary-decoy-aug.jpg')); console.log('sheet: ' + f);
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { check('ran to the end', false, e.stack || e.message); }
console.log((ok === n ? 'PASS' : 'FAIL') + ': incendiary / decoy / AUG sheet · ' + ok + '/' + n); await b.close(); for (const s of servers) s.kill(); if (ok !== n) process.exitCode = 1;
