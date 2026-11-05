// v53 AGENTS picture: (top) the first-person arms of 2 CT and 2 T agents, each wearing its own CS2 sleeve
// (tools/import-cs2-sleeves.mjs → user-assets/sleeves, worn by fp-view.js sleevesFrom / wearAgentSleeves on the CS2
// arms' own 52 bones, the agent's default gloves kept) on the AK-47 / M4A4 set's idle frame; (bottom) CS2's 19 hit
// capsules (gd-hitboxes.js, the file the host traces against) drawn over the CT agent as everyone sees it, standing with
// the AK-47, looking level and looking 0.6 rad down (the capsules bent with the chest as gd-hitboxes bends them for the
// look's pitch), coloured by hit group. A plain three.js scene in the game's page (the game's own modules and
// materials; not a match frame: lights here are two plain lamps). Checks: every sleeve worn, the capsules installed, no
// page errors. Skipped without the imported sleeves / hit boxes.
//   node tests/browser/gd-sleeves-hitboxes-shots.mjs <repo-root> <out-dir> [desktop=1]   (desktop=1: ~/Desktop/GD-v53-sleeves-hitboxes.jpg)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-sleeves-shots'), ...rest] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const opt = Object.fromEntries(rest.map(a => a.split('=')));
const man = (() => { try { return JSON.parse(readFileSync(path.join(root, 'user-assets', 'manifest.json'), 'utf8')); } catch { return null; } })();
if (!man?.models?.sleeves || !man?.models?.hitboxes || !man?.models?.fpGloves) { console.log('SKIP: no CS2 sleeves / hit boxes (tools/import-cs2-sleeves.mjs) on this computer'); process.exit(0); }
const srv = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDSLV', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gsl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { srv.kill(); } catch {} });
const base = await new Promise(r => srv.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--enable-unsafe-swiftshader'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); }; const errs = [];
const G = await b.newPage({ viewport: { width: 1000, height: 700 } }); G.on('pageerror', e => errs.push(e.message));
await G.goto(base + '/user-assets.js');   // (any page of the room's origin: the modules import from it; the game itself is not started)
const T_POSE = [opt.tclip || 'idle', Number(opt.tt ?? .4), Number(opt.back ?? 2)];   // (the T agents' sleeves are rolled to the elbow, out of the game's view: the T panels pull the camera back, back=0 keeps the game's view)
const res = await G.evaluate(async (T_POSE) => {
  document.body.innerHTML = ''; document.body.style.margin = '0';
  globalThis.self ??= globalThis;
  const THREE = await import('/three.module.js'), F = await import('/fp-view.js'), { gltfLoader } = await import('/gltf-loader.js'), UA = await import('/user-assets.js'), CA = await import('/cs2-agents.js'), HB = await import('/gd-hitboxes.js');
  const ua = await UA.userAssets(), url = f => UA.userAssetURL(ua, f), load = f => gltfLoader().loadAsync(url(f)), list = await (await fetch(url(ua.models.sleeves.file))).json();
  const PW = 640, PH = 400, canvas = document.createElement('canvas'); canvas.width = PW; canvas.height = PH; document.body.appendChild(canvas);
  const R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); R.outputColorSpace = THREE.SRGBColorSpace;
  const shots = [], info = [];
  const lamps = sc => { sc.add(new THREE.HemisphereLight(0xdfe8f2, 0x4a4036, 1.6)); const d = new THREE.DirectionalLight(0xfff4e0, 2.4); d.position.set(2, 3, 2); sc.add(d); const d2 = new THREE.DirectionalLight(0xbfd4ff, .8); d2.position.set(-3, 1, -1); sc.add(d2); };
  const snap = (sc, cam) => { R.render(sc, cam); const im = new Image(); im.src = canvas.toDataURL('image/png'); return new Promise(r => { im.onload = () => r(im); }); };
  // 1. first person: the set's own skeleton and camera, the CS2 arms of that side with the agent's sleeve swapped in
  const picks = { ct: Object.keys(list.agents).filter(k => list.agents[k].side === 'ct'), t: Object.keys(list.agents).filter(k => list.agents[k].side === 't') };
  const plan = [['ct', picks.ct.includes('ctm_sas') ? 'ctm_sas' : picks.ct[0], 'fp/cs2_m4.glb'], ['ct', picks.ct.find(k => k !== 'ctm_sas' && /fbi|st6|swat|gend/.test(k)) || picks.ct[1], 'fp/cs2_m4.glb'], ['t', picks.t.includes('tm_phoenix') ? 'tm_phoenix' : picks.t[0], 'fp/cs2_ak.glb'], ['t', picks.t.find(k => /leet|balkan/.test(k)) || picks.t[1], 'fp/cs2_ak.glb']];
  for (const [side, key, setFile] of plan) {
    const set = await load(setFile), arms = F.armsFrom(await load(ua.models.fpGloves.file)), sl = await load(list.agents[key].file), ms = F.sleevesFrom(sl, side, arms); if (ms) F.wearAgentSleeves(arms, side, ms, key);
    const legacy = []; set.scene.traverse(o => { if (o.isSkinnedMesh && o.skeleton?.getBoneByName('finger_thumb_0_L')) legacy.push(o); }); const ref = legacy[0]; for (const o of legacy) o.visible = false;   // (every arm part of the set hidden, as fp-view dressArms does in GD: its glove, its untextured cs2_glove slot and its camo sleeve)
    const same = arms.bones.length === ref.skeleton.bones.length && arms.bones.every((nm, i) => ref.skeleton.bones[i].name === nm), sk = same ? ref.skeleton : new THREE.Skeleton(arms.bones.map(nm => ref.skeleton.getBoneByName(nm) || ref.skeleton.bones[0]), arms.inverses);
    const grp = new THREE.Group(); grp.position.copy(ref.position); grp.quaternion.copy(ref.quaternion); grp.scale.copy(ref.scale); ref.parent.add(grp);
    for (const tpl of arms[side]) { const m = new THREE.SkinnedMesh(tpl.geometry, tpl.material); m.frustumCulled = false; m.bind(sk, ref.bindMatrix); grp.add(m); }
    const [cn, ct] = side === 't' ? T_POSE : ['idle', .4], mix = new THREE.AnimationMixer(set.scene), idle = set.animations.find(a => a.name === cn) || set.animations.find(a => a.name === 'idle') || set.animations[0]; mix.clipAction(idle).play(); mix.setTime(ct); set.scene.updateMatrixWorld(true);
    let cam = null; set.scene.traverse(o => { if (!cam && o.isCamera) cam = o; }); cam.aspect = PW / PH; cam.updateProjectionMatrix();
    // (T: the camera pulled back by the eye-to-hand distance and turned to the elbow, so the rolled-up sleeve — out of CS2's own view — shows)
    if (side === 't' && T_POSE[2]) { const h = ref.skeleton.getBoneByName('hand_R') || ref.skeleton.bones[0], e = ref.skeleton.getBoneByName('arm_lower_R') || h, hp = h.getWorldPosition(new THREE.Vector3()), ep = e.getWorldPosition(new THREE.Vector3()), cp = cam.getWorldPosition(new THREE.Vector3()), d = cp.distanceTo(hp);
      cam.parent.remove(cam); cam.position.copy(cp).add(new THREE.Vector3().subVectors(cp, hp).normalize().multiplyScalar(d * T_POSE[2])).add(new THREE.Vector3(d * .5, d * .2, 0)); cam.lookAt(ep.lerp(hp, .3)); cam.near = d * .02; cam.updateProjectionMatrix(); }
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x77818d); sc.add(set.scene); lamps(sc);
    shots.push({ img: await snap(sc, cam), label: `${side.toUpperCase()} · ${key} — ${list.agents[key].material}${side === 't' && T_POSE[2] ? ' · camera pulled back' : ' · idle'}` }); info.push({ side, key, worn: !!ms, sleeve: arms.sleeve?.[side] || null, parts: arms[side].map(o => o.name) });
  }
  // 2. the hit capsules over the CT agent (as other players see it), standing and crouched, rifle
  await CA.loadAgents(); const on = HB.hitboxesOn(), COL = [0xffffff, 0xff3030, 0xff9a20, 0xffe040, 0x40c0ff, 0x4080ff, 0x60e060, 0x30a030, 0xd060ff];
  const crouch = false, E = new Float64Array(6);
  for (const pitch of [0, -.6]) {
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x2c3138); lamps(sc); const a = CA.makeAgent({ name: 'capsules' }, 'ct'); a.setWeapon('ak'); for (let i = 0; i < 90; i++) a.update(1 / 60, { speed: 0, crouch, aim: 'rifle', pitch }); a.g.rotation.y = Math.PI * .8; sc.add(a.g);
    const P = HB.hitboxPose('ak', crouch, 'ct'), C = P.caps, inner = new THREE.Group(); inner.rotation.y = a.g.rotation.y; sc.add(inner);
    for (let i = 0; i < P.n; i++) { HB.capsuleAt(P, i, pitch, E); const k = i * 8, A = new THREE.Vector3(E[0], E[1], E[2]), B = new THREE.Vector3(E[3], E[4], E[5]), r = C[k + 6], g = C[k + 7], L = A.distanceTo(B);
      const geo = new THREE.CapsuleGeometry(r, Math.max(1e-4, L), 6, 14), m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COL[g], transparent: true, opacity: .42, depthWrite: false })), w = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: COL[g], transparent: true, opacity: .75 }));
      for (const o of [m, w]) { o.position.copy(A).add(B).multiplyScalar(.5); if (L > 1e-6) o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); inner.add(o); } }
    const cam = new THREE.PerspectiveCamera(32, PW / PH, .1, 200); cam.position.set(-9, crouch ? 6.5 : 8, -15); cam.lookAt(0, crouch ? 4.2 : 5.4, 0);
    shots.push({ img: await snap(sc, cam), label: `CS2 hit capsules on the CT agent (${(ua.models.agents.ct.name)}) · AK-47 · ${pitch ? 'looking 0.6 rad down: bent with the chest' : 'looking level'}` });
  }
  // the sheet
  const cols = 3, rows = 2, pad = 10, head = 54, LBL = 26, S = document.createElement('canvas'); S.width = cols * PW + (cols + 1) * pad; S.height = head + rows * (PH + LBL) + (rows + 1) * pad; const x = S.getContext('2d');
  x.fillStyle = '#15181c'; x.fillRect(0, 0, S.width, S.height); x.fillStyle = '#e8edf2'; x.font = 'bold 22px -apple-system, Helvetica'; x.fillText('Global Defensive v53 · CS2 agent sleeves in first person, CS2 hit capsules (H8)', pad, 32);
  x.font = '14px -apple-system, Helvetica'; x.fillStyle = '#9aa6b2'; x.fillText('Each agent\'s own firstperson_sleeves (CS2 install, imported locally) on the CS2 arms with the agent\'s default gloves · capsules: head red, neck violet, chest orange, stomach yellow, arms blue, legs green', pad, 48);
  const order = [0, 1, 4, 2, 3, 5];
  order.forEach((si, i) => { const s = shots[si]; if (!s) return; const cx = pad + (i % cols) * (PW + pad), cy = head + pad + Math.floor(i / cols) * (PH + LBL + pad); x.drawImage(s.img, cx, cy, PW, PH); x.fillStyle = '#e8edf2'; x.font = '15px -apple-system, Helvetica'; x.fillText(s.label, cx + 4, cy + PH + 19); });
  return { url: S.toDataURL('image/jpeg', .9), info, on, count: HB.hitboxInfo()?.count };
}, T_POSE);
writeFileSync(path.join(out, 'GD-v53-sleeves-hitboxes.jpg'), Buffer.from(res.url.split(',')[1], 'base64'));
check('every agent wears its own CS2 sleeve (2 CT, 2 T)', res.info.length === 4 && res.info.every(i => i.worn && i.sleeve === i.key), res.info.map(i => `${i.side}:${i.key} → ${i.parts.join(' + ')}`).join(' · '));
check('CS2 hit capsules installed on the page (the host\'s file)', res.on && res.count === 19, res.count);
check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
if (opt.desktop) { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-sleeves-hitboxes.jpg'); copyFileSync(path.join(out, 'GD-v53-sleeves-hitboxes.jpg'), d); console.log('→', d); }
await b.close(); console.log(`${ok === n ? 'PASS' : 'FAIL'}: sleeves / hit boxes shots · ${ok}/${n}`); process.exit(ok === n ? 0 : 1);
