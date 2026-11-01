// Every gun, knife, grenade and the bomb as the game draws them, on labelled contact sheets (pictures for a person to
// look at, plus numbers checked here): first person (idle and a reload frame, in a real match; left-handed too),
// third person on the CS2 agents (side and front; T and CT holding a rifle, a pistol and a knife; before / after the
// v52 hold fix when `before=<repo>` points at an older build) and the dropped pose on a floor. Checks: barrel along
// the agent's facing (dot > .9), grip in the palm, upright, every dropped model's lowest point on the floor (< 1 cm),
// no page errors. Needs the CS2 agents imported on this computer (user-assets): skipped without.
// holds (package T): every item next to CS2's own hold — CS2's clip and world model (user-assets/holds:
// tools/export-cs2-holds.mjs) | the game before | the game now, side and front, crouched for a rifle, a pistol and a knife;
// checks muzzle < 2 cm, barrel dot > .98 against holds-truth.json, and each palm on the drawn gun's surface as close as CS2's is
// on CS2's own model (≤ CS2's, ≥ 1.5 cm, + 1.5 cm — v52 wave 3: the AUG hung 10 cm off the left hand and the old 'hands' number,
// the hand bones vs the same clip's, still said 0.0); refdir=<dir> saves the reference renders + ground truth (skipped without it).
//   node tests/browser/gd-models-sheet.mjs <repo-root> <out-dir> [before=<older repo>] [desktop=1] [only=tp,holds,drops,fp]
// desktop=1 also writes ~/Desktop/GD-v52-firstperson.jpg, GD-v52-thirdperson.jpg, GD-v52-drops.jpg, GD-v52-holds-vs-CS2.jpg.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-models-sheet'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('='))), only = new Set((opt.only || 'tp,holds,drops,fp').split(','));
if (!existsSync(path.join(root, 'user-assets', 'agents', 'cs2_anims.glb'))) { console.log('SKIP: no CS2 agents imported on this computer'); process.exit(0); }
const servers = [];
async function serve(dir, code) { const s = spawn(process.execPath, ['lan/server.mjs'], { cwd: dir, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: code, HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gms-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] }); servers.push(s);
  return new Promise(r => s.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); })); }
process.on('exit', () => { for (const s of servers) try { s.kill(); } catch {} });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); }; const errs = [];
const page = async (base, w = 1100, h = 700, url = '/gd-gallery.html') => { const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto(base + url); return p; };
const IDS = { guns: null, knives: ['knife', 'knife-t', 'karambit', 'butterfly', 'stiletto', 'm9'], nades: ['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy'], other: ['c4'] };

// ── In the page: third-person cells (works on older builds too: only makeAgent / setWeapon / update) ──
async function tpCells(p, list, size = 300) {
  return p.evaluate(async ({ list, size }) => {
    const THREE = await import('/three.module.js'), A = await import('/cs2-agents.js'), W = await import('/weapon-models.js'), { RoomEnvironment } = await import('/post/RoomEnvironment.js');
    await W.loadRealWeapons(); await A.loadAgents(); await (await import('/fp-view.js')).fpSetsReady?.();   // (the star knives' third-person models come from their first-person sets)
    const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(size, size); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x3a4148); sc.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), .04).texture;
    sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(20, 40, 10); sc.add(sun);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: .9 })); fl.rotation.x = -Math.PI / 2; sc.add(fl);
    const cam = new THREE.PerspectiveCamera(32, 1, .05, 500), h = new THREE.Vector3(), c = new THREE.Vector3(), k = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Vector3(), f = new THREE.Vector3(), u = new THREE.Vector3();
    const out = [];
    for (const { id, team, views, knife, skin } of list) {
      const a = A.makeAgent({ name: 'Sheet' }, team); if (!a) { out.push({ id, team, missing: true }); continue; } sc.add(a.g);
      a.update(1 / 60, { aim: true }); a.setWeapon(id, knife); if (skin) a.setSkin?.(skin); for (let i = 0; i < 50; i++) a.update(1 / 60, { aim: true, speed: 0 }); a.g.updateMatrixWorld(true);
      const hand = a.g.getObjectByName('hand_R'), wpn = a.g.getObjectByName('wpn'), carry = a.g.getObjectByName('wpn-turn')?.children[0] || wpn?.children.find(o => o.isGroup);   /* (the gun's own frame, under ITEM_HOLD's turn; older builds: the carry group) */ hand.getWorldPosition(h); a.g.getObjectByName('finger_middle_0_R').getWorldPosition(k); k.add(h).multiplyScalar(.5);
      let dir = null, up = null, palm = null; if (carry) { carry.getWorldPosition(c); carry.getWorldQuaternion(q); m.set(0, 0, -1).applyQuaternion(q); u.set(0, 1, 0).applyQuaternion(q); f.set(0, 0, -1); dir = m.x * f.x + m.z * f.z; dir /= Math.hypot(m.x, m.z) || 1; up = u.y; palm = c.distanceTo(k); }
      let verts = 0; a.g.traverse(o => { if (o.isMesh && wpn && (() => { for (let x = o; x; x = x.parent) if (x === wpn) return true; return false; })()) verts += o.geometry.attributes.position.count; });
      const cells = [];
      for (const v of views) {
        if (v === 'side') { cam.position.set(h.x + 6.5, h.y + .9, h.z - 1.4); cam.lookAt(h.x, h.y - .1, h.z - 1.6); }   // (from the agent's right: it faces −z)
        else if (v === 'front') { cam.position.set(h.x - 1.6, h.y + 1.1, h.z - 7.5); cam.lookAt(h.x - .6, h.y - .2, h.z); }
        else { cam.position.set(-7, 8.5, -13); cam.lookAt(0, 6, 0); }   // body: three-quarter front, the whole agent
        R.render(sc, cam); cells.push(R.domElement.toDataURL('image/jpeg', .9)); }
      out.push({ id, team, cells, dir, up, palm, verts }); a.dispose(); }
    R.dispose(); return out; }, { list, size });
}
// ── In the page: GPU memory across "rematches" — 10 agents made, armed with a skinned knife, skins switched, drawn, disposed;
// five times. Geometries, textures and programs after the 5th round must equal the 1st's (SKIN-2: bone textures and skin copies kept). ──
async function memCycles(p) {
  return p.evaluate(async () => {
    const THREE = await import('/three.module.js'), A = await import('/cs2-agents.js'), W = await import('/weapon-models.js'); await W.loadRealWeapons(); await A.loadAgents(); await (await import('/fp-view.js')).fpSetsReady?.();   // (the star knives' third-person models are baked from their first-person sets)
    const wpnVerts = a => { let n = 0; a.g.getObjectByName('wpn')?.traverse(o => { if (o.isMesh) n += o.geometry.attributes.position.count; }); return n; }, KN = ['butterfly', 'stiletto', 'm9', null];
    const R = new THREE.WebGLRenderer({ antialias: false }); R.setSize(200, 200); const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, .1, 500); cam.position.set(0, 8, -30); cam.lookAt(0, 6, 0); sc.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2));
    const skins = [{ finish: 'fade', wear: .02, seed: 7 }, { finish: 'tiger', wear: .1, seed: 3 }, null], rounds = [];
    for (let r = 0; r < 5; r++) { const list = []; for (let i = 0; i < 10; i++) { const a = A.makeAgent({ name: 'M' + i }, i % 2 ? 't' : 'ct'); if (!a) return null; a.g.position.x = (i - 5) * 3; sc.add(a.g); a.setWeapon('knife', KN[i % 4]); list.push(a); }
      if (!r) { const d = A.makeAgent({ name: 'M0' }, 'ct'); d.setWeapon('knife'); d.update(1 / 60, { aim: true }); list[0].update(1 / 60, { aim: true }); rounds.star = wpnVerts(list[0]); rounds.plain = wpnVerts(d); d.dispose(); let bf = 0; W.weaponModel('butterfly', 1).traverse(o => { if (o.isMesh) bf += o.geometry.attributes.position.count; }); rounds.bf = bf; }   // (agent 0: a CT with the butterfly; d: the same CT with the default knife; bf: the baked butterfly model itself)
      for (const s of skins) { for (const a of list) { a.setSkin?.(s); a.update(1 / 60, { aim: true }); } R.render(sc, cam); }
      list.forEach((a, i) => { a.setSkin?.(skins[0]); a.setWeapon('ak'); a.setWeapon('knife', KN[i % 4]); a.update(1 / 60, { aim: true }); }); R.render(sc, cam);   // (a pickup / switch with the skin on, back to the same chosen knife)
      for (const a of list) a.dispose(); R.render(sc, cam); rounds.push({ geo: R.info.memory.geometries, tex: R.info.memory.textures, prog: R.info.programs.length, ...(r ? {} : { star: rounds.star, plain: rounds.plain, bf: rounds.bf }) }); }
    R.dispose(); return rounds; });
}
// ── In the page: dropped items on a floor (groundRest when the build has it, else the old fixed pose) ──
async function dropCells(p, ids, size = 260) {
  return p.evaluate(async ({ ids, size }) => {
    const THREE = await import('/three.module.js'), W = await import('/weapon-models.js'), { RoomEnvironment } = await import('/post/RoomEnvironment.js'); await W.loadRealWeapons();
    const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(size, size * .62); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x2c3238); sc.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), .04).texture; sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 8, 4); sc.add(sun);
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'); x.fillStyle = '#6d7075'; x.fillRect(0, 0, 256, 256); x.strokeStyle = '#4a4d52'; x.lineWidth = 2; for (let i = 0; i <= 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(20, 20); tex.colorSpace = THREE.SRGBColorSpace;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: .9, transparent: true, opacity: .82 })); fl.rotation.x = -Math.PI / 2; sc.add(fl);
    const cam = new THREE.PerspectiveCamera(30, 1 / .62, .02, 200), box = new THREE.Box3(), out = [], has = typeof W.groundRest === 'function';
    for (const id of ids) { const m = W.weaponModel(id, 1), yaw = .5; if (has) { const r = W.groundRest(id); m.rotation.set(r.x, yaw, r.z, 'YXZ'); m.position.set(0, r.lift, 0); } else { m.rotation.set(0, yaw, Math.PI / 2); m.position.set(0, .35, 0); }
      sc.add(m); m.updateMatrixWorld(true); box.setFromObject(m, true); const s = box.getSize(new THREE.Vector3()), cn = box.getCenter(new THREE.Vector3()), d = Math.max(s.x, s.z, s.y * 2) * .95 + .5;
      cam.position.set(cn.x + d * .25, Math.max(.25, s.y * .6), cn.z + d); cam.lookAt(cn.x, Math.max(.05, cn.y * .5), cn.z); R.render(sc, cam); const low = box.min.y;
      out.push({ id, cell: R.domElement.toDataURL('image/jpeg', .9), low, size: s.toArray() }); m.removeFromParent(); }
    R.dispose(); return out; }, { ids, size });
}
// ── In the page: holds against CS2 (package T, only=holds). Every cell of an item uses the same camera, fixed to the agent
// (not to its hand: the side views of pistols were out of frame), passed in (cams: [eye, target] in the agent's frame, game
// units, facing −z). ref: CS2's own — the agent in the item's CS2 hold clip (first frame, the whole body) and CS2's own
// world model (orange: user-assets/holds/src, untextured) hung as Source 2 hangs it: its weapon bone on the agent's wpn
// bone. Else the game (makeAgent: works on older builds too), measured against the truth passed in (t: holds-truth). ──
async function holdCells(p, list, { ref = false, size = 260 } = {}) {
  return p.evaluate(async ({ list, ref, size }) => {
    const THREE = await import('/three.module.js'), A = await import('/cs2-agents.js'), W = await import('/weapon-models.js'), { RoomEnvironment } = await import('/post/RoomEnvironment.js'), UA = await import('/user-assets.js'), { gltfLoader } = await import('/gltf-loader.js');
    await W.loadRealWeapons(); await A.loadAgents(); await (await import('/fp-view.js')).fpSetsReady?.(); const ua = await UA.userAssets(), url = rel => UA.userAssetURL(ua, rel);
    const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(size, size); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x3a4148); sc.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), .04).texture;
    sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(20, 40, 10); sc.add(sun);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: .9 })); fl.rotation.x = -Math.PI / 2; sc.add(fl);
    const cam = new THREE.PerspectiveCamera(32, 1, .05, 500), q = new THREE.Quaternion(), v = new THREE.Vector3(), out = [], K = 100 / 16.5;
    let REF = null; if (ref) { const glb = f => gltfLoader().loadAsync(url(f)); const [ct, t, an, hc] = await Promise.all([glb(ua.models.agents.ct.file), glb(ua.models.agents.t.file), glb(ua.models.agentAnims.file), fetch(url('holds/holds-clips.json')).then(r => r.json())]);
      const clips = new Map(an.animations.map(c => [c.name, c])); for (const j of hc.clips) clips.set(j.name, THREE.AnimationClip.parse(j)); REF = { ct, t, clips, items: (await fetch(url('holds/holds.json')).then(r => r.json())).items, models: new Map() };
      REF.gold = new THREE.MeshStandardMaterial({ color: 0xe0902a, metalness: .35, roughness: .45 }); }
    const clipOf = (id, st) => { const c = id === 'knife' ? 'knife-ct' : /^(he|flash|smoke|decoy|incendiary)$/.test(id) ? 'nade' : id; return REF.clips.get(c + '/' + (st === 'crouch' ? 'hold_crouch' : 'hold')) || REF.clips.get(c + '/hold'); };
    for (const it of list) {
      let g, gun = null, a = null;
      if (ref) { const src = REF[it.team].scene, body = A.cloneSkinned(src); g = new THREE.Group(); const face = new THREE.Group(), model = new THREE.Group(); g.add(face); face.rotation.y = Math.PI; face.add(model); model.scale.setScalar(K); model.add(body);
        const mx = new THREE.AnimationMixer(body), clip = clipOf(it.id, it.st); if (clip) { mx.clipAction(clip).play(); mx.update(0); } g.updateMatrixWorld(true);
        const H = REF.items[it.id]; if (H) { let m = REF.models.get(H.file); if (!m) { m = await gltfLoader().loadAsync(url('holds/' + H.file)); m.scene.traverse(o => { if (o.isMesh) { o.material = REF.gold; o.frustumCulled = false; } }); REF.models.set(H.file, m); }
          const ws = A.cloneSkinned(m.scene); ws.updateMatrixWorld(true);   /* (its meshes are skinned to its own bones: a plain clone drew nothing) */ const wb = ws.getObjectByName('weapon');   /* (no weapon bone: not drawn — never hung by its root, v52 wave 3: the AUG's bone-less export floated 11 cm over the hands) */
          if (wb) { const hang = new THREE.Group(); hang.matrixAutoUpdate = false; hang.matrix.copy(wb.matrixWorld.clone().invert()); hang.add(ws); body.getObjectByName('wpn').add(hang); g.updateMatrixWorld(true); const ms = []; ws.traverse(o => { if (o.isMesh) ms.push(o); }); const hd = ms.filter(o => /body_hd/.test(o.name)), bd = ms.filter(o => /body/.test(o.name)); gun = { meshes: hd.length ? hd : bd.length ? bd : ms }; } } }
      else { a = A.makeAgent({ name: 'Sheet' }, it.team); if (!a) { out.push({ ...it, missing: true }); continue; } g = a.g; a.update(1 / 60, { aim: true }); const star = /^(butterfly|stiletto|m9)$/.test(it.id); a.setWeapon(star ? 'knife' : it.id, star ? it.id : null);
        for (let i = 0; i < 50; i++) a.update(1 / 60, { aim: true, speed: 0, crouch: it.st === 'crouch' }); g.updateMatrixWorld(true);
        const t = g.getObjectByName('wpn-turn'); if (t) gun = t.children[0]; else g.getObjectByName('wpn')?.traverse(o => { if (!gun && o.isGroup && o.parent?.parent?.name === 'wpn') gun = o; }); }
      sc.add(g); g.updateMatrixWorld(true);
      // numbers (the game's cells): the truth is in the agent's own frame (metres, facing +z) = g's (game units, facing −z) turned half round
      const r = { ...it, cells: [] }, toT = p => new THREE.Vector3(-p.x / K, p.y / K, -p.z / K), T = it.t; delete r.t;
      // each palm's centre (half way from the wrist to the middle knuckle) ↔ the drawn gun's surface (metres): the hands ON the gun — the same measure for CS2's model (ref) and the game's
      const palmGap = (side) => { const h = g.getObjectByName('hand_' + side), f = g.getObjectByName('finger_middle_0_' + side), meshes = gun?.meshes || (() => { const a = []; gun?.traverse?.(o => { if (o.isMesh && o.visible !== false) a.push(o); }); return a; })(); if (!h || !f || !meshes.length) return null;
        const pp = h.getWorldPosition(new THREE.Vector3()).add(f.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5), tri = new THREE.Triangle(), cp = new THREE.Vector3(); let best = Infinity;
        for (const o of meshes) { const P = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : P.count, X = [tri.a, tri.b, tri.c]; for (let t = 0; t + 2 < n; t += 3) { for (let k = 0; k < 3; k++) { const i = ix ? ix.getX(t + k) : t + k; X[k].fromBufferAttribute(P, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, X[k]); X[k].applyMatrix4(o.matrixWorld); } best = Math.min(best, tri.closestPointToPoint(pp, cp).distanceTo(pp)); } }
        return best / K; };
      if (T && gun) { r.pR = palmGap('R'); r.pL = T.twoHands ? palmGap('L') : null; }
      if (!ref && T) { const L = n => { const o = g.getObjectByName(n); return o ? toT(g.worldToLocal(o.getWorldPosition(new THREE.Vector3()))) : null; };
        r.hR = L('hand_R')?.distanceTo(new THREE.Vector3(...T.handR)); r.hL = T.twoHands ? L('hand_L')?.distanceTo(new THREE.Vector3(...T.handL)) : null;
        if (gun) { gun.getWorldQuaternion(q); v.set(0, 0, -1).applyQuaternion(q); const d = new THREE.Vector3(-v.x, v.y, -v.z); if (T.dir) r.dir = d.dot(new THREE.Vector3(...T.dir));
          const mz = W.MUZZLE[it.id]; if (T.muzzle && mz && it.gun) r.muzzle = toT(g.worldToLocal(gun.localToWorld(new THREE.Vector3(...mz)))).distanceTo(new THREE.Vector3(...T.muzzle)); r.file = W.modelFromFile?.(it.id) || false;
          // the same without trusting the build's model convention (v51's models were authored muzzle +z): the gun's foremost and rearmost vertices along CS2's barrel line
          if (T.muzzle && T.dir) {   /* (guns and knives: a knife's muzzle is its blade's tip) */ const D = new THREE.Vector3(...T.dir), p = new THREE.Vector3(); let hi = -Infinity, tip = null; gun.updateMatrixWorld(true);
            gun.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position, C = !it.gun && o.geometry.attributes.color; for (let i = 0; i < P.count; i += it.gun ? 3 : 1) { if (C && C.getX(i) <= .3) continue;   /* (a knife: its blade's vertices — its finish mask — so a stray skinned vertex of a baked star knife is no "tip") */ p.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); const t = toT(g.worldToLocal(p)), s = t.dot(D); if (s > hi) { hi = s; tip = t; } } });
            if (tip) r.tip = tip.distanceTo(new THREE.Vector3(...T.muzzle));
            if (tip && !it.gun && T.wpn) { const o = toT(g.worldToLocal(gun.getWorldPosition(new THREE.Vector3()))); r.blade = tip.clone().sub(o).normalize().dot(new THREE.Vector3(...T.muzzle).sub(new THREE.Vector3(...T.wpn.p)).normalize()); } } } }   // (the blade guard → tip against CS2's: the model's −z said nothing for a baked star knife)
      for (const [e, l] of it.cams) { cam.position.set(...e); cam.lookAt(...l); R.render(sc, cam); r.cells.push(R.domElement.toDataURL('image/jpeg', .88)); }
      out.push(r); g.removeFromParent(); a?.dispose(); }
    R.dispose(); return out; }, { list, ref, size });
}
// ── In the page: one labelled sheet from cells ──
async function compose(p, title, rows, cw, ch, cols) {
  return p.evaluate(async ({ title, rows, cw, ch, cols }) => {
    const cells = rows.flatMap(r => r.cells.map((c, i) => ({ ...c, head: i === 0 ? r.head : null }))), pad = 6, lab = 34, head = 46;
    let y = head, x = 0, H = head; const pos = []; for (const r of rows) { if (r.head) { if (x) { y += ch + lab + pad; x = 0; } pos.push({ head: r.head, y }); y += 26; } for (const c of r.cells) { pos.push({ c, x: x * (cw + pad) + pad, y }); x++; if (x === cols) { x = 0; y += ch + lab + pad; } } }
    H = y + (x ? ch + lab + pad : 0) + pad; const W = cols * (cw + pad) + pad, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#14181c'; g.fillRect(0, 0, W, H); g.fillStyle = '#f0b232'; g.font = 'bold 24px system-ui'; g.fillText(title, pad + 4, 32);
    const img = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
    for (const e of pos) { if (e.head) { g.fillStyle = '#9fb3c3'; g.font = 'bold 17px system-ui'; g.fillText(e.head, pad + 4, e.y + 18); continue; }
      const im = await img(e.c.src); g.fillStyle = '#20262c'; g.fillRect(e.x, e.y, cw, ch + lab); if (im) g.drawImage(im, e.x, e.y, cw, ch); else { g.fillStyle = '#663'; g.fillText('missing', e.x + 10, e.y + 30); }
      g.fillStyle = e.c.bad ? '#ff7b6b' : '#e6edf2'; g.font = 'bold 13px system-ui'; g.fillText(e.c.label || '', e.x + 5, e.y + ch + 14); g.fillStyle = e.c.bad ? '#ff9b8b' : '#8fa1ae'; g.font = '11px ui-monospace, Menlo, monospace'; g.fillText(e.c.sub || '', e.x + 5, e.y + ch + 28); }
    return cv.toDataURL('image/jpeg', .86); }, { title, rows, cw, ch, cols });
}
const save = (name, dataURL) => { const f = path.join(out, name); writeFileSync(f, Buffer.from(dataURL.split(',')[1], 'base64')); if (opt.desktop) copyFileSync(f, path.join(os.homedir(), 'Desktop', name)); return f; };
try {
  const base = await serve(root, 'GDSHT1'), P = await page(base); await P.waitForFunction(() => document.getElementById('status')?.textContent !== 'Loading models…', null, { timeout: 120000 }).catch(() => {});
  IDS.guns = await P.evaluate(async () => (await import('/weapons-data.js')).WEAPONS.map(w => w.id));
  const all = [...IDS.guns, ...IDS.knives, ...IDS.nades, ...IDS.other];
  if (only.has('tp')) {
    const list = all.map(id => ({ id: /^(butterfly|stiletto|m9|karambit)$/.test(id) ? 'knife' : id === 'knife-t' ? 'knife' : id, knife: /^(butterfly|stiletto|m9)$/.test(id) ? id : null, team: id === 'knife-t' ? 't' : 'ct', views: ['side', 'front'], label: id }));
    for (const id of ['karambit']) { const e = list.find(x => x.label === id); e.id = 'karambit'; }
    const bodies = ['ak', 'deagle', 'knife'].flatMap(id => ['t', 'ct'].map(team => ({ id, team, views: ['body'], label: team.toUpperCase() + ' · ' + id })));
    const now = await tpCells(P, [...list, ...bodies]); const guns = now.filter(r => IDS.guns.includes(r.id) && r.dir !== null);
    const worst = guns.reduce((w, r) => Math.min(w, r.dir), 1), worstUp = guns.reduce((w, r) => Math.min(w, r.up), 1), worstPalm = now.filter(r => r.palm !== null).reduce((w, r) => Math.max(w, r.palm), 0);
    check('third person: every gun\'s barrel along its agent\'s facing (dot > .9)', worst > .9, worst.toFixed(3) + ' · ' + guns.filter(r => r.dir <= .9).map(r => r.id).join(','));
    // (the grip: since v52 wave 3 the hold fit (cs2-agents fitStandIn / palmOnHandle) places each gun by CS2's own palm and
    // grip contacts, so the gun frame's origin is no longer the grip — the old origin ↔ palm < .4 units measure read 5–18 cm
    // on guns held right; the palms are judged on the drawn gun's surface against CS2's in the holds section below)
    check('…upright', worstUp > .7, 'up ' + worstUp.toFixed(3) + ' · ' + guns.filter(r => r.up <= .7).map(r => r.id).join(','));
    const mem = await memCycles(P), grew = mem && (mem[4].geo - mem[0].geo) + (mem[4].tex - mem[0].tex) + (mem[4].prog - mem[0].prog);
    check('GPU memory: 5 rounds of 10 agents with skinned knives — the star knives really drawn (butterfly, stiletto, M9 baked from their first-person sets), skins switched, weapons swapped, disposed — nothing kept per round', mem && grew <= 0 && mem[0].star === mem[0].bf && mem[0].star !== mem[0].plain, JSON.stringify(mem));   // (star: the CT agent who chose the butterfly draws exactly the baked butterfly, not the default knife)
    if (opt.before) { const bb = await serve(opt.before, 'GDSHT3'), PB = await page(bb), mb = await memCycles(PB); await PB.close(); console.log('  before (' + opt.before + '): ' + JSON.stringify(mb)); }
    const fmt = r => `dir ${r.dir?.toFixed(2)} up ${r.up?.toFixed(2)} palm ${r.palm != null ? (r.palm * 16.5).toFixed(1) + 'cm' : '-'}`;
    const rows = [];
    if (opt.before) { const bb = await serve(opt.before, 'GDSHT0'), PB = await page(bb), pick = ['ak', 'm4s', 'sniper', 'deagle', 'usps', 'mp9', 'knife', 'c4'];
      const before = await tpCells(PB, pick.map(id => ({ id, team: 'ct', views: ['side'] }))); await PB.close();
      rows.push({ head: 'BEFORE (v51.0.0) → AFTER (v52): the CS2 agents\' hold, from the agent\'s right side', cells: pick.flatMap(id => { const o = before.find(r => r.id === id), a = now.find(r => r.id === id && r.team === 'ct');
        return [{ src: o?.cells[0], label: id + ' · before', sub: o ? fmt(o) : 'missing', bad: o && o.dir !== null && o.dir < (IDS.guns.includes(id) ? .9 : 0) }, { src: a?.cells[0], label: id + ' · after', sub: a ? fmt(a) : 'missing', bad: a && a.dir !== null && a.dir < (IDS.guns.includes(id) ? .9 : 0) }]; }) }); }   // (knives / the bomb: CS2's own hold turns them; backwards only when < 0)
    const cellOf = (r, i, view) => ({ src: r.cells?.[i], label: `${r.label || r.id} · ${view}`, sub: r.missing ? 'no agent' : fmt(r) + (r.verts ? ' · ' + r.verts + 'v' : ''), bad: r.dir !== null && IDS.guns.includes(r.id) && (r.dir < .9 || r.up < .7) });
    const lab = (r, k) => { r.label = list[k]?.label || r.label; return r; };
    const named = now.map((r, k) => k < list.length ? lab(r, k) : { ...r, label: bodies[k - list.length].label });
    rows.push({ head: 'Third person on a CS2 agent (CT; knife-t on T) · side and front', cells: named.slice(0, list.length).flatMap(r => [cellOf(r, 0, 'side'), cellOf(r, 1, 'front')]) });
    rows.push({ head: 'T and CT agents holding a rifle, a pistol and a knife', cells: named.slice(list.length).map(r => cellOf(r, 0, 'body')) });
    console.log('sheet: ' + save('GD-v52-thirdperson.jpg', await compose(P, 'GLOBAL DEFENSIVE v52 · THIRD PERSON (CS2 agents)', rows, 240, 240, 10)));
  }
  if (only.has('holds')) {   // package T: every item, CS2's own (reference) | the game before (v51, before=<repo>) | the game now — side and front; crouched for a rifle, a pistol and a knife
    const TR = existsSync(path.join(root, 'user-assets/holds/holds-truth.json')) ? JSON.parse(readFileSync(path.join(root, 'user-assets/holds/holds-truth.json'), 'utf8')).truth : null, HI = TR && JSON.parse(readFileSync(path.join(root, 'user-assets/holds/holds.json'), 'utf8')).items;
    if (!TR) console.log('SKIP (holds): no user-assets/holds — node tools/export-cs2-holds.mjs');
    else {
      const K = 100 / 16.5, G = p => [-p[0] * K, p[1] * K, -p[2] * K], ids = [...IDS.guns, ...IDS.knives, ...IDS.nades, ...IDS.other].filter(id => TR[id]);
      const camsFor = (id, st) => { const T = TR[id][st] || TR[id].stand, H = HI[id], big = H && H.box[1][0] - H.box[0][0] > .5, c = T.muzzle && T.butt ? G(T.muzzle.map((x, i) => (x + T.butt[i]) / 2)) : G(T.wpn.p), d = big ? 15 : 9; c[1] -= .4;
        return [[[c[0] + d, c[1] + .8, c[2]], c], [[c[0] - d * .12, c[1] + d * .1, c[2] - d], [c[0], c[1], c[2] + 1]]]; };
      const entry = (id, st) => ({ id, st, team: id === 'knife-t' ? 't' : 'ct', gun: IDS.guns.includes(id), t: TR[id][st] || TR[id].stand, cams: camsFor(id, st) });
      const list = [...ids.map(id => entry(id, 'stand')), ...['ak', 'deagle', 'knife'].map(id => entry(id, 'crouch'))];
      const refs = await holdCells(P, list, { ref: true }), now = await holdCells(P, list);
      let before = null; if (opt.before) { const bb = await serve(opt.before, 'GDSHT4'), PB = await page(bb); before = await holdCells(PB, list); await PB.close(); }
      // (labels: numbers that hold for any build — the gun's foremost point vs CS2's muzzle ("tip"), the hands; the barrel / blade dot only for now: v51's models had another convention)
      // (palms: each palm's centre to the drawn gun's surface, cm — CS2's own on CS2's model in the reference column; off = more than 1.5 cm past CS2's, CS2's taken as ≥ 1.5 cm)
      const cm = x => x == null ? '–' : (x * 100).toFixed(1), off = (x, c) => x != null && c != null && x > Math.max(c, .015) + .015;
      const bad = (r, now, R0) => r && ((r.tip != null && r.tip > (r.gun ? .03 : .04)) || (now && r.dir != null && /^(knife|knife-t)$/.test(r.id) && r.dir < .98) || (now && r.blade != null && r.blade < .95) || off(r.pR, R0?.pR) || off(r.pL, R0?.pL));
      const sub = (r, now) => r?.missing ? 'no agent' : r ? (r.tip != null ? `tip ${cm(r.tip)} · ` : '') + (now && r.blade != null ? `blade ${r.blade.toFixed(2)} · ` : '') + `palms ${cm(r.pR)}/${cm(r.pL)} cm` : 'not run';
      const at = (arr, k) => arr?.[k], rowsOf = (from, to) => list.slice(from, to).flatMap((e, k) => { const i = from + k, R0 = refs[i], B = at(before, i), N = now[i], lbl = e.id + (e.st === 'crouch' ? ' crouched' : '');
        return [0, 1].flatMap(v => [{ src: R0?.cells[v], label: lbl + ' · CS2 ' + (v ? 'front' : 'side'), sub: R0?.pR != null ? `CS2 · palms ${cm(R0.pR)}/${cm(R0.pL)} cm` : 'CS2 clip + CS2 world model' }, { src: B?.cells[v], label: lbl + ' · v51', sub: sub(B, false), bad: bad(B, false, R0) }, { src: N?.cells[v], label: lbl + ' · now', sub: sub(N, true), bad: bad(N, true, R0) }]); });
      const worst = k => now.slice(0, list.length).reduce((w, r) => r[k] != null && r[k] > w.v ? { v: r[k], id: r.id + ' ' + r.st } : w, { v: 0, id: '' }), worstDir = now.filter(r => r.dir != null && (r.gun || /^(knife|knife-t)$/.test(r.id))).reduce((w, r) => r.dir < w.v ? { v: r.dir, id: r.id + ' ' + r.st } : w, { v: 1, id: '' });
      const m = worst('muzzle'), gapOf = k => now.reduce((w, r, i) => { const c = refs[i]?.[k], x = r[k]; if (x == null || c == null) return w; const d = x - Math.max(c, .015); return d > w.v ? { v: d, id: `${r.id} ${r.st} ${cm(x)} vs CS2 ${cm(c)}` } : w; }, { v: -1, id: '' }), hr = gapOf('pR'), hl = gapOf('pL');
      check('holds vs CS2 (browser, the real models): every muzzle within 2 cm of CS2\'s, standing and crouched', m.v < .02, cm(m.v) + ' cm ' + m.id);
      check('holds vs CS2: every barrel / default knife blade along CS2\'s (dot > .98)', worstDir.v > .98, worstDir.v.toFixed(4) + ' ' + worstDir.id);
      const kt = now.filter(r => /^(knife|knife-t|butterfly|stiletto|m9)$/.test(r.id) && r.tip != null).reduce((w, r) => r.tip > w.v ? { v: r.tip, id: r.id + ' ' + r.st } : w, { v: 0, id: '' });
      check('holds vs CS2: every knife\'s tip where CS2\'s is — the default knives and the star knives baked from their first-person sets (< 4 cm)', kt.v < .04, cm(kt.v) + ' cm ' + kt.id);
      check('holds vs CS2: both palms on the drawn gun as CS2\'s are on CS2\'s model (palm ↔ surface ≤ CS2\'s, ≥ 1.5 cm, + 1.5 cm)', hr.v <= .015 && hl.v <= .015, 'right +' + cm(hr.v) + ' ' + hr.id + ' · left +' + cm(hl.v) + ' ' + hl.id);
      const bl = now.filter(r => r.blade != null).reduce((w, r) => r.blade < w.v ? { v: r.blade, id: r.id + ' ' + r.st } : w, { v: 1, id: '' });
      check('holds vs CS2: every knife\'s blade (guard → tip) along CS2\'s, the star knives too (dot > .95)', bl.v > .95, bl.v.toFixed(3) + ' ' + bl.id);
      check('holds vs CS2: every reference rendered (CS2 clip + CS2 world model)', refs.every(r => r.cells?.length === 2), refs.filter(r => r.cells?.length !== 2).map(r => r.id).join(','));
      if (before) console.log('  v51: ' + before.filter((r, i) => bad(r, false, refs[i])).length + '/' + before.length + ' items off CS2 (the gun\'s tip > 3 cm from CS2\'s muzzle, or a palm > 1.5 cm farther off the gun than CS2\'s) · now: ' + now.filter((r, i) => bad(r, true, refs[i])).length);
      if (opt.refdir) { mkdirSync(opt.refdir, { recursive: true }); refs.forEach((r, i) => r.cells?.forEach((c, v) => writeFileSync(path.join(opt.refdir, `${list[i].id}-${list[i].st}-${v ? 'front' : 'side'}.jpg`), Buffer.from(c.split(',')[1], 'base64')))); writeFileSync(path.join(opt.refdir, 'ground-truth.json'), JSON.stringify({ about: 'CS2 reference renders (CS2 hold clip + CS2 world model hung weapon bone → wpn) and the numeric ground truth per item: holds-truth.json (agent root frame, metres) + palms ↔ CS2 model (m)', truth: Object.fromEntries(list.map((e, i) => [e.id + '/' + e.st, { ...TR[e.id][e.st === 'crouch' ? 'crouch' : 'stand'], palmToGunR: refs[i]?.pR ?? null, palmToGunL: refs[i]?.pL ?? null }])) }, null, 1)); console.log('reference renders: ' + opt.refdir); }
      writeFileSync(path.join(out, 'holds-numbers.json'), JSON.stringify({ ref: refs.map(({ cells, ...r }) => r), now: now.map(({ cells, ...r }) => r), before: before?.map(({ cells, ...r }) => r) }, null, 1));
      const n0 = ids.length, rows = [{ head: 'Each item: CS2 (its own hold clip + its own world model, orange, hung weapon bone → wpn) | the game in v51.0.0 | the game now — from the agent\'s right, then the front · numbers: tip = the gun\'s front vs CS2\'s muzzle (cm) · palms = right / left palm centre to the gun\'s surface (cm; CS2\'s own in its column) · blade = knife guard→tip vs CS2\'s', cells: rowsOf(0, n0) },
        { head: 'Crouched: a rifle, a pistol and a knife', cells: rowsOf(n0, list.length) }];
      console.log('sheet: ' + save('GD-v52-holds-vs-CS2.jpg', await compose(P, 'GLOBAL DEFENSIVE v52 · THIRD-PERSON HOLDS vs CS2', rows, 200, 200, 12)));
    }
  }
  if (only.has('drops')) {
    const ids = all.filter(id => !/^(butterfly|stiletto|m9)$/.test(id)), now = await dropCells(P, ids);
    const worst = now.reduce((w, r) => Math.max(w, Math.abs(r.low)), 0);
    check('dropped: every model\'s lowest point on the floor (< 1 cm)', worst < .06, (worst * 16.5).toFixed(2) + ' cm · ' + now.filter(r => Math.abs(r.low) >= .06).map(r => r.id).join(','));
    const rows = [];
    if (opt.before) { const bb = await serve(opt.before, 'GDSHT2'), PB = await page(bb), pick = ['ak', 'negev', 'sniper', 'deagle', 'knife', 'c4', 'he', 'molotov']; const before = await dropCells(PB, pick); await PB.close();
      rows.push({ head: 'BEFORE (v51.0.0) → AFTER (v52): dropped on a floor (grid = the floor; under it shows through)', cells: pick.flatMap(id => { const o = before.find(r => r.id === id), a = now.find(r => r.id === id); const cm = r => r ? (r.low * 16.5).toFixed(1) + ' cm ' + (r.low < -.06 ? 'sunk' : r.low > .06 ? 'floating' : 'on floor') : '';
        return [{ src: o?.cell, label: id + ' · before', sub: cm(o), bad: o && Math.abs(o.low) >= .06 }, { src: a?.cell, label: id + ' · after', sub: cm(a), bad: a && Math.abs(a.low) >= .06 }]; }) }); }
    rows.push({ head: 'Every item dropped (lowest point vs the floor)', cells: now.map(r => ({ src: r.cell, label: r.id, sub: (r.low * 16.5).toFixed(2) + ' cm · ' + r.size.map(v => v.toFixed(1)).join('×'), bad: Math.abs(r.low) >= .06 })) });
    console.log('sheet: ' + save('GD-v52-drops.jpg', await compose(P, 'GLOBAL DEFENSIVE v52 · DROPPED WEAPONS', rows, 240, 149, 8)));
  }
  if (only.has('fp')) {
    // A real match (solo, no bots): each item really given by the room (a loadout, a grenade bought — the others dropped
    // first: CS2's four-grenade and one-fire-grenade limits —, a knife chosen with the knife action, the bomb as the only
    // T in Defuse), held, and the view captured as you see it. Every cell checks the hand holds what it says.
    const matchPage = async (kind, map) => { const G = await page(base, 960, 600, '/'); await G.addInitScript(() => { localStorage.setItem('infra-name', 'Viewer'); localStorage.setItem('infra-face-name', 'Viewer');   /* ('Viewer': a CT in Deathmatch (gd-soldiers sideOf, by name), so the CT default knife is drawn there; Defuse below puts it on T) */ localStorage.setItem('infra-face', 'smile'); });
      await G.goto(base + '/'); await G.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await G.waitForTimeout(1200);
      await G.evaluate(() => document.querySelector('[data-start=arena]').click()); await G.waitForTimeout(400); await G.selectOption('#ss-ar-kind', kind); await G.selectOption('#ss-ar-map', map); await G.selectOption('#ss-ar-bots', '0'); await G.evaluate(() => document.getElementById('ss-ar-solo').click());
      await G.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 }); await G.waitForTimeout(1500); await G.keyboard.press('Escape'); await G.waitForTimeout(300);
      await G.evaluate(async () => { const F = await import('/fp-view.js'); await F.fpSetsReady?.(); document.querySelectorAll('#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar').forEach(e => e && (e.style.visibility = 'hidden')); }); return G; };
    let G = await matchPage('dm', 'yard');
    const shot = async () => 'data:image/jpeg;base64,' + (await G.screenshot({ type: 'jpeg', quality: 85 })).toString('base64');
    const act = a => G.evaluate(async a => { try { return String(await __infra.lab.lan.act({ type: 'arena', action: a })); } catch (e) { return 'ERR ' + (e?.message || e); } }, a);
    // id: what goes in the hand (an arsenal id: 'knife' for any chosen star knife, 'karambit', 'c4'); knife: a knife choice first;
    // expect: the first-person set the view must show (knifeFor: the chosen star knife, knife-t on the T side; a gun: itself).
    const hold = async (id, { left = false, knife = null } = {}) => G.evaluate(async ({ id, left, knife }) => {
      const L = (await import('/live-settings.js')).live; L.leftHand = left; const P = __infra.lab.pistol, w = (await import('/weapons-data.js')).weaponById(id), { arenaArsenalOf } = await import('/combat-logic.js'), F = await import('/fp-view.js');
      const game = () => __infra.lab.world.operations.game, me = 'viewer', act = async a => { try { return String(await __infra.lab.lan.act({ type: 'arena', action: a })); } catch (e) { return 'ERR ' + (e?.message || e); } }, notes = [];
      if (knife) notes.push(await act({ type: 'knife', knife }));
      if (w?.kind === 'nade') { for (const k of [...(game().arena?.loadout?.[me]?.nades || [])]) if (k !== id) notes.push(await act({ type: 'drop', slot: 'nades', kind: k })); if (!(game().arena?.loadout?.[me]?.nades || []).includes(id)) notes.push(await act({ type: 'buy-nade', kind: id })); }
      else if (w && !['knife', 'bomb'].includes(w.kind)) notes.push(await act({ type: 'loadout', [w.kind === 'pistol' ? 'secondary' : 'primary']: id }));   // (Deathmatch loadouts are free)
      let owned = false; for (let i = 0; i < 40 && !(owned = arenaArsenalOf(game(), 'Viewer').includes(id)); i++) await new Promise(r => setTimeout(r, 100));   // (in your hands only once the room says it's yours)
      const want = (knife && id === 'knife') ? (knife === 'default' ? null : knife) : null;
      P.equip(null); await new Promise(r => setTimeout(r, 60)); P.equip(id);
      for (let i = 0; i < 60; i++) { const s = P.viewInfo.set; if (P.current?.id === id && (!F.hasFP?.(s) || P.viewInfo.authored) && (!want || s === want)) break; await new Promise(r => setTimeout(r, 100)); }   // (a chosen knife's set loads on first use)
      await new Promise(r => setTimeout(r, 1500)); return { cur: P.current?.id || null, set: P.viewInfo.set, authored: P.viewInfo.authored, owned, notes: notes.filter(n => /^ERR/.test(n)) }; }, { id, left, knife });
    const reload = () => G.evaluate(async () => { const F = await import('/fp-view.js'), P = __infra.lab.pistol, f = F.fpFor(P.current?.id, P.viewInfo.set); f?.reload?.(2600); await new Promise(r => setTimeout(r, 950)); return !!f?.reload; });
    const rows = [], cells = [], wrong = []; let shown = 0;
    const cellFor = (label, id, h, expect) => { const good = h.cur === id && h.set === expect; if (good) shown++; else wrong.push(label + ': holding ' + h.cur + ' / set ' + h.set + ' (wanted ' + id + ' / ' + expect + ')' + (h.notes.length ? ' ' + h.notes.join(';') : ''));
      return { label: label + ' · idle', sub: good ? (h.authored ? 'CS2 set ' : 'pack rig ') + h.set : 'WRONG: shows ' + (h.set || h.cur || 'nothing'), bad: !good }; };
    // [label, arsenal id, knife choice, the set it must show]: every gun, grenade and knife (the T knife and the bomb: Defuse below)
    const plan = [...IDS.guns.map(id => [id, id, null, id]), ['knife (CT default)', 'knife', 'default', 'knife'], ['karambit', 'karambit', 'karambit', 'karambit'], ...['butterfly', 'stiletto', 'm9'].map(k => [k, 'knife', k, k]), ...IDS.nades.map(id => [id, id, null, id])];
    for (const [label, id, knife, expect] of plan) { const h = await hold(id, { knife }); const a = await shot(); let r = null; if (IDS.guns.includes(id) && h.cur === id) { await reload(); r = await shot(); }
      cells.push({ src: a, ...cellFor(label, id, h, expect) }); if (r) cells.push({ src: r, label: label + ' · reload', sub: 'mid-reload' }); }
    await hold('knife', { knife: 'default' });
    const leftCells = []; for (const id of ['ak', 'aug', 'usps', 'knife']) { await hold(id, { left: true }); leftCells.push({ src: await shot(), label: id + ' · left hand', sub: 'Settings → Gun hand: left' }); } await hold('knife');
    // The T side (Defuse on the built-in Dust II, alone: the only Terrorist carries the bomb): the T knife and the C4. The
    // same page changes map (as the host does): a second solo page on this server never reached its match (240 s timeout).
    const tCells = []; { const ch = await act({ type: 'change-map', map: 'dust2' });
      await G.waitForFunction(() => { const g = __infra.lab.world.operations.game; return g.arena?.map === 'dust2' && g.combat?.d && document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z); }, null, { timeout: 240000 }).catch(e => { throw Error('change-map ' + ch + ': ' + e.message); });
      await G.waitForTimeout(1500); if (await G.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await G.keyboard.press('Escape');   /* (the menu only if it is up: Escape opens it otherwise) */ await G.waitForTimeout(300); await G.evaluate(() => document.querySelectorAll('#gd-hud,#ar-top,#ar-alive,#ar-money,#ar-feed,#gd-wp,#gd-radar').forEach(e => e && (e.style.visibility = 'hidden')));
      const side = await act({ type: 'team', team: 't' });
      let carrier = false; for (let i = 0; i < 60 && !(carrier = await G.evaluate(async () => (await import('/combat-logic.js')).arenaArsenalOf(__infra.lab.world.operations.game, 'Viewer').includes('c4'))); i++) await G.waitForTimeout(500);
      for (const [label, id, expect] of [['knife-t (T default)', 'knife', 'knife-t'], ['c4', 'c4', 'c4']]) { const h = await hold(id, { knife: id === 'knife' ? 'default' : null }); tCells.push({ src: await shot(), ...cellFor(label, id, h, expect), ...(id === 'c4' && !carrier ? { sub: 'not the carrier · ' + side } : {}) }); }
    }
    rows.push({ head: 'First person: idle and a reload frame (right hand) · every gun, knife (chosen with the knife menu) and grenade', cells: [...cells, ...tCells] });
    rows.push({ head: 'Left-handed view (the gloves on both hands)', cells: leftCells });
    // The muzzle (flashes, tracers) at the barrel's end, not the right wrist (no CS2 set has a muzzle node): a set not in
    // the view (the knife is held now) has its root alone, so its world frame is the view's (camera at 0, looking −z).
    const mz = await G.evaluate(async () => { const F = await import('/fp-view.js'), THREE = await import('/three.module.js'), m = new THREE.Vector3(), h = new THREE.Vector3(), out = {};
      for (const id of ['ak', 'usps', 'sniper', 'p90', 'negev']) { const f = F.fpFor(id); if (!f?.authored) continue; f.muzzle(m); f.root.worldToLocal(m); f.handIn(f.root, h);   /* (both in the set's own frame: the view's, wherever its root hangs) */ out[id] = { ahead: +(h.z - m.z).toFixed(2), apart: +m.distanceTo(h).toFixed(2) }; } return out; });
    check('first person: the muzzle at the barrel\'s end (≥ .5 units ahead of the right hand)', Object.keys(mz).length >= 3 && Object.values(mz).every(r => r.ahead >= .5), JSON.stringify(mz));
    check('first person: every gun, knife (CT, T, karambit, each star knife), grenade and the bomb in hand, drawn with its own set (no cell shows another item)', wrong.length === 0 && shown === plan.length + 2, shown + '/' + (plan.length + 2) + (wrong.length ? ' · ' + wrong.join(' | ') : ''));
    console.log('sheet: ' + save('GD-v52-firstperson.jpg', await compose(P, 'GLOBAL DEFENSIVE v52 · FIRST PERSON', rows, 288, 180, 8)));
    await G.close();
  }
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { check('ran to the end', false, e.stack || e.message); }
console.log((ok === n ? 'PASS' : 'FAIL') + ': models sheet · ' + ok + '/' + n); await b.close(); for (const s of servers) s.kill(); if (ok !== n) process.exitCode = 1;
