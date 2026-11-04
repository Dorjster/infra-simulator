// CS2 first-person sets (user-assets/fp/cs2_<id>.glb, made on this computer, never shipped) as the game builds them
// (fp-view.js buildAuthored): a gun's muzzle — flashes and tracers — at its barrel's end, not the right wrist (no set has
// a muzzle node); the default knives' blade found for a skin's mask (handles stay unpainted); each star knife baked
// for third person in the knife convention (blade along −z, flat facing ±x, guard at the origin) and drawn in another
// player's hands when they chose it. Every weapon and grenade the game offers has its CS2 set — the AUG, the decoy and
// the incendiary too (they fell back to the old pack's rigs: the AUG oversized and low, the left hand leaving it in the
// reload; the cans recoloured smoke grenades) — and CS2's own world model for other players' hands, the grenade in
// flight, landed and dropped (tools/cs2-fp/export_missing.py). Skipped without the sets.
//   node tests/gd-fp-sets.mjs
import { readFileSync, existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
const FP = 'user-assets/fp/';
if (!existsSync(FP + 'cs2_ak.glb')) { console.log('SKIP: no CS2 first-person sets on this computer'); process.exit(0); }
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });   // (pictures: not drawn here)
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }), getElementById: () => null };   // (the shirt's picture and the sticker atlas: never drawn here)
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding/.test(String(a[0]))) w(...a); }; }
// The room's file serving, for weapon-models.js loadRealWeapons (the manifest, user-assets files, the built-in models).
globalThis.location ??= { protocol: 'http:', href: 'http://localhost/' }; globalThis.ProgressEvent ??= class { constructor(type, o) { Object.assign(this, o, { type }); } };
globalThis.fetch = async u => { const url = new URL(typeof u === 'string' ? u : u.url, 'http://localhost/'), f = url.protocol === 'file:' ? fileURLToPath(url) : url.pathname === '/api/user-assets' ? 'user-assets/manifest.json' : url.pathname.startsWith('/user-assets/') ? decodeURIComponent(url.pathname.slice(1)) : null;
  return f && existsSync(f) ? new Response(readFileSync(f)) : new Response(null, { status: 404 }); };
const THREE = await import('../dist/three.module.js'), { gltfLoader } = await import('../dist/gltf-loader.js'), F = await import('../dist/fp-view.js'), W = await import('../dist/weapon-models.js');
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const parse = f => { const b = readFileSync(f); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
// 1. Muzzles: in the set's own frame (its root alone: the view's — camera at 0, looking −z).
{ const m = new THREE.Vector3(), h = new THREE.Vector3(), rows = [];
  for (const id of ['ak', 'usps', 'sniper', 'negev', 'p90', 'deagle', 'mp9', 'xm1014', 'aug']) { if (!existsSync(FP + 'cs2_' + id + '.glb')) continue; const set = F.buildAuthored(await parse(FP + 'cs2_' + id + '.glb'), null, id);
    set.hold(id, { draw: false }); set.update(0); set.muzzle(m); set.handIn(set.root, h); rows.push([id, h.z - m.z, m.distanceTo(h)]); }
  check('a gun\'s muzzle at its barrel\'s end, ahead of the right hand (≥ .5 units; it was the wrist: 0)', rows.length >= 4 && rows.every(r => r[1] >= .5), rows.map(r => r[0] + ' ' + r[1].toFixed(2)).join(' · '));
  const k = F.buildAuthored(await parse(FP + 'cs2_knife.glb'), null, 'knife'), kh = new THREE.Vector3(); k.hold('knife', { draw: false }); k.update(0); k.muzzle(m); k.handIn(k.root, kh);
  check('a knife keeps its point at the hand (no muzzle)', m.distanceTo(kh) < 1e-3); }
// 1b. Gloves: one glove material for the right hand, its mirrored copy (normal map's x turned round) for the left — the
// left hand's UVs run 0 → −1 (read mirrored), so with the shared material its folds and stitching were lit inside out.
if (existsSync(FP + 'glove.glb')) { const gl = await parse(FP + 'glove.glb'); let glove = null; gl.scene.traverse(o => { if (!glove && o.isSkinnedMesh) glove = o; });
  const set = F.buildAuthored(await parse(FP + 'cs2_ak.glb'), glove, 'ak'), hands = []; set.root.traverse(o => { if (o.isMesh && (o.material === glove.material || o.material.normalScale?.x < 0 && o.material.map === glove.material.map)) hands.push([F.leftHanded(o.geometry), o.material.normalScale.x]); });
  check('gloves: the right hand wears the glove, the left its mirrored copy (normal map x turned round)', hands.length === 2 && hands.some(([l, x]) => !l && x > 0) && hands.some(([l, x]) => l && x < 0), JSON.stringify(hands)); }
// 2. The default knives' blade mask (made: no vertex colours of their own).
for (const id of ['knife', 'knife-t']) { const g = await parse(FP + 'cs2_' + id + '.glb'); let mesh = null; g.scene.traverse(o => { if (!mesh && o.isMesh && o.material.name === 'cs2_weapon') mesh = o; });
  const blade = F.bladeMask(mesh), c = mesh.geometry.attributes.color; let s = 0; for (let i = 0; i < c.count; i++) s += c.getX(i); const share = s / c.count, runs = blade.map(String).join('').split(/(?<=true),(?=false)|(?<=false),(?=true)/).length;
  const firstB = blade.indexOf(true), lastB = blade.lastIndexOf(true), oneEnd = firstB === 0 || lastB === blade.length - 1, solid = blade.slice(firstB, lastB + 1).every(Boolean);
  check(`${id}: the blade found for a skin (one solid run at one end, 30–70 % of the mesh)`, oneEnd && solid && share > .3 && share < .7, blade.map(b => b ? 'B' : '.').join('') + ' · ' + share.toFixed(2) + ' · ' + mesh.material.userData.skinMask); }
// 3. Star knives baked for third person, and another player holding the one they chose.
const baked = {};
for (const id of ['butterfly', 'stiletto', 'm9', 'karambit', 'bayonet', 'skeleton', 'talon', 'flip', 'nomad']) { if (!existsSync(FP + 'cs2_' + id + '.glb')) continue; /* (v53 KNIVES: the five new ones too) */ F.buildAuthored(await parse(FP + 'cs2_' + id + '.glb'), null, id);   // (as the game loads it: the set registers its third-person model)
  if (!W.hasReal(id)) { check(id + ' baked for third person', false); continue; } const k = W.weaponModel(id, 1); baked[id] = k; const mesh = k.children[0], P = mesh.geometry.attributes.position, C = mesh.geometry.attributes.color;
  const box = new THREE.Box3().setFromBufferAttribute(P), sz = box.getSize(new THREE.Vector3()); let zb = 0, nb = 0, zh = 0, nh = 0; for (let i = 0; i < P.count; i++) if (C.getX(i) > .3) { zb += P.getZ(i); nb++; } else { zh += P.getZ(i); nh++; }
  check(`${id}: baked in the knife convention (blade toward −z, its flat facing ±x, ${(sz.z * 16.5).toFixed(0)} cm long)`, zb / nb < 0 && zh / nh > zb / nb && sz.x <= sz.y && sz.z > sz.y && sz.z * 16.5 > 15 && sz.z * 16.5 < 40, `blade z ${(zb / nb).toFixed(2)} handle z ${(zh / nh).toFixed(2)} · size ${sz.toArray().map(v => v.toFixed(2)).join('×')}`);
  check(`${id}: its own material (not the first-person one your skin paints), its finish mask kept`, mesh.material.vertexColors && !!C && mesh.material.userData.skinU?.uSkinOn.value === 0); }
if (baked.butterfly && existsSync('user-assets/agents/cs2_ct.glb')) { const { useAgents, makeAgent } = await import('../dist/cs2-agents.js'), ct = await parse('user-assets/agents/cs2_ct.glb'), an = await parse('user-assets/agents/cs2_anims.glb');
  useAgents({ ct: ct.scene }, an.animations); W.registerModel('butterfly', baked.butterfly); const a = makeAgent({ name: 'Bob' }, 'ct'), count = () => { let v = 0; a.g.getObjectByName('wpn').traverse(o => { if (o.isMesh) v += o.geometry.attributes.position.count; }); return v; };
  a.setWeapon('knife'); a.update(1 / 60, { aim: true }); const def = count(); a.setWeapon('knife', 'butterfly'); a.update(1 / 60, { aim: true }); const bf = count(), want = baked.butterfly.children[0].geometry.attributes.position.count;
  a.setSkin({ finish: 'fade', wear: .02, seed: 7 }); let painted = 0; a.g.getObjectByName('wpn').traverse(o => { if (o.isMesh && o.material.userData.skinU?.uSkinOn.value === 1 && o.material !== baked.butterfly.children[0].material) painted++; });
  check('another player who chose the Butterfly is seen holding it (its mesh, not the side\'s default), wearing their skin on their own copy', bf === want && def !== want && painted === 1, `default ${def}v → ${bf}v (butterfly ${want}v) · painted ${painted}`); a.dispose(); }
// 4. Every weapon, grenade, knife and the bomb the game offers has its CS2 set, listed in the manifest the room serves
// (fp-view.js loads every cs2_<id>; without one an item fell back to the old pack's arms: the AUG, decoy and incendiary).
const D = await import('../dist/weapons-data.js'), man = JSON.parse(readFileSync('user-assets/manifest.json', 'utf8')), VM = man.models.viewmodels || {};
{ const want = [...new Set([...D.WEAPON_IDS, ...D.GRENADES.map(g => g.id), ...D.KNIVES.map(k => k.id), 'knife-t', 'c4', ...Object.keys(W.KNIFE_SKINS)])], missing = want.filter(id => !VM['cs2_' + id] || !existsSync('user-assets/' + VM['cs2_' + id].file));
  check(`a CS2 first-person set for every item the game offers (${want.length})`, !missing.length, missing.length ? 'missing: ' + missing.join(', ') : ''); }
// 5. The AUG, the decoy and the incendiary: CS2's own model in CS2's arms, with CS2's clips — and the AUG its true size,
// held where the other CS2 rifles are, the left hand on it through the reload (the pack's AUG: big, low, hand off it).
const NEW = { aug: ['weapon_rif_aug', ['idle', 'draw', 'fire', 'reload', 'inspect']], decoy: ['weapon_decoy', ['idle', 'draw', 'prime', 'throw', 'throwlow', 'inspect']], incendiary: ['weapon_incendiarygrenade', ['idle', 'draw', 'prime', 'throw', 'throwlow', 'inspect']] };
const gunOf = set => { let m = null; set.root.traverse(o => { if (!m && o.isMesh && [].concat(o.material)[0]?.name === 'cs2_weapon') m = o; }); return m; };
const skinBox = (mesh, out = new THREE.Box3()) => { out.makeEmpty(); const v = new THREE.Vector3(), n = mesh.geometry.attributes.position.count, step = Math.max(1, Math.ceil(n / 3000)); for (let i = 0; i < n; i += step) out.expandByPoint(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld)); return out; };
const boneOf = (set, re) => { let b = null; set.root.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
for (const [id, [model, clips]] of Object.entries(NEW)) { const f = FP + 'cs2_' + id + '.glb'; if (!existsSync(f)) { check(id + ': CS2 set made', false, 'no ' + f); continue; }
  const g = await parse(f), meshes = g.parser.json.meshes.map(m => m.name || ''), set = F.buildAuthored(g, null, id), gun = gunOf(set);
  check(`${id}: CS2's own ${model} in CS2's arms, with CS2's clips (${clips.join(', ')})`, meshes.some(n => n.includes(model + '.vmdl')) && meshes.some(n => /glove_.*viewmodel/.test(n)) && clips.every(c => g.animations.some(a => a.name === c)) && !!gun?.material.map,
    meshes.map(n => n.split('/').pop()).join(' · ') + ' · ' + g.animations.map(a => a.name).join(',')); }
if (existsSync(FP + 'cs2_aug.glb') && existsSync(FP + 'cs2_famas.glb')) {
  const ag = await parse(FP + 'cs2_aug.glb'), aug = F.buildAuthored(ag, null, 'aug'), fam = F.buildAuthored(await parse(FP + 'cs2_famas.glb'), null, 'famas'), A = new THREE.Box3(), B = new THREE.Box3();
  for (const s of [aug, fam]) { s.hold(s === aug ? 'aug' : 'famas', { draw: false }); s.update(0); s.root.updateMatrixWorld(true); }
  skinBox(gunOf(aug), A); skinBox(gunOf(fam), B); const len = A.max.z - A.min.z, cs2 = 76.9 / 16.5, cy = (A.min.y + A.max.y) / 2, fy = (B.min.y + B.max.y) / 2;
  check(`AUG: its true length in view (${(len * 16.5).toFixed(1)} cm, CS2's 76.9 cm) and held as high as the FAMAS (centre ${cy.toFixed(2)} vs ${fy.toFixed(2)})`, Math.abs(len / cs2 - 1) < .05 && Math.abs(cy - fy) < .35);
  // (the wrist's distance to the nearest point of the gun or its magazine, every 1/15 s; CS2's own reloads move it some way —
  // the FAMAS's up to ~27 cm, the M4A4's 44 — so the AUG's may go no further than the FAMAS's, CS2's other bullpup, and ends back on it)
  const reach = (s, gl, id) => { s.hold(id, { draw: false }); s.update(0); const hl = boneOf(s, /^hand_[lL]$/), mesh = gunOf(s), v = new THREE.Vector3(), h = new THREE.Vector3(), row = [], dur = gl.animations.find(a => a.name === 'reload').duration; s.reload();
    for (let t = 0; t <= dur; t += 1 / 15) { s.update(t ? 1 / 15 : 0); s.root.updateMatrixWorld(true); hl.getWorldPosition(h); let best = Infinity; const n = mesh.geometry.attributes.position.count, step = Math.max(1, Math.ceil(n / 2500)); for (let i = 0; i < n; i += step) best = Math.min(best, mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).distanceTo(h)); row.push(best * 16.5); }
    return { dur, worst: Math.max(...row), end: row.at(-1) }; };
  const ra = reach(aug, ag, 'aug'), rf = reach(F.buildAuthored(await parse(FP + 'cs2_famas.glb'), null, 'famas'), await parse(FP + 'cs2_famas.glb'), 'famas');
  check(`AUG reload: the left hand keeps to the gun or its magazine (worst ${ra.worst.toFixed(1)} cm away, the FAMAS's ${rf.worst.toFixed(1)}) and ends back on it (${ra.end.toFixed(1)} cm) — ${ra.dur.toFixed(1)} s`, ra.worst <= rf.worst + 1 && ra.end < 10); }
// 6. Other players, the grenade in flight, landed and dropped: CS2's own world models from user-assets/weapons (the
// room serves them; weapon-models.js loadRealWeapons) in place of the old looks — the pack's AUG, the recoloured smoke
// cans — upright cans at the hand point; a landed one lies on its side on the floor (arena-nades-view.js restNade).
await W.loadRealWeapons();
const WM = man.models.weapons || {}, binCount = id => { const b = readFileSync('user-assets/' + WM[id].file), hl = b.readUInt32LE(0); return JSON.parse(b.subarray(4, 4 + hl).toString()).parts.reduce((n, p) => n + p.count, 0); };
const meshCount = m => { let n = 0; m.traverse(o => { if (o.isMesh) n += o.geometry.attributes.position.count; }); return n; };
for (const id of Object.keys(NEW)) { if (!WM[id] || !existsSync('user-assets/' + WM[id].file)) { check(id + ': CS2 world model imported', false, 'not in user-assets/weapons'); continue; }
  const m = W.weaponModel(id, 1), box = new THREE.Box3().setFromObject(m, true), sz = box.getSize(new THREE.Vector3()).multiplyScalar(16.5);
  const ok = W.modelFromFile(id) && meshCount(m) === binCount(id) && (id === 'aug' ? sz.z > 70 && sz.z < 85 && box.min.z < -2 : sz.y > 10 && sz.y > sz.x && sz.y > sz.z && sz.y < 18);
  check(`${id}: other players, the thrown grenade and the dropped one draw CS2's own model (${meshCount(m)} vertices, ${sz.toArray().map(v => v.toFixed(1)).join('×')} cm)`, ok, VARIANTS_NOTE(id)); }
function VARIANTS_NOTE(id) { return W.hasReal(id) ? (W.modelFromFile(id) ? 'from file' : 'built-in') : 'variant / fallback'; }
// The molotov too (it was the CC0 bottle in other players' hands, in flight and dropped): CS2's bottle, ~35 cm tall, neck
// up — without the lighter CS2 hangs in the left hand 10 cm off it (a thrown bottle carrying a lighter: ~23 cm deep).
if (WM.molotov) { const m = W.weaponModel('molotov', 1), sz = new THREE.Box3().setFromObject(m, true).getSize(new THREE.Vector3()).multiplyScalar(16.5);
  check(`molotov: CS2's own bottle from file, no lighter (${meshCount(m)} vertices, ${sz.toArray().map(v => v.toFixed(1)).join('×')} cm)`, W.modelFromFile('molotov') && meshCount(m) === binCount('molotov') && sz.y > 28 && sz.y < 40 && sz.z < 11 && sz.x < 14, VARIANTS_NOTE('molotov')); }
{ const V = await import('../dist/arena-nades-view.js'), N = await import('../dist/arena-nades.js'), rows = [], yaw = [];
  for (const [kind, phase] of [['decoy', 'decoy'], ['smoke', 'smoke'], ['incendiary', 'fire']]) { const m = W.weaponModel(kind, 1.4), floor = 3, g = { id: 'n7', kind, phase, x: 10, y: phase === 'decoy' ? floor + N.R : floor, z: -4 };   // (ids as arena-nades.js makes them: 'n' + seq)
    V.restNade(m, kind, g); m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m, true), s = b.getSize(new THREE.Vector3()); rows.push([kind, b.min.y - floor, s.y < Math.max(s.x, s.z)]); }
  for (const id of ['n7', 'n8']) { const m = W.weaponModel('decoy', 1.4); V.restNade(m, 'decoy', { id, kind: 'decoy', phase: 'decoy', x: 0, y: 1, z: 0 }); yaw.push(m.rotation.y); }
  check('a landed grenade lies on its side on the floor (lowest point within 1 cm of it; not frozen mid-tumble in the ground)', rows.every(([, d, side]) => Math.abs(d) * 16.5 < 1 && side), rows.map(([k, d, s]) => `${k} ${(d * 16.5).toFixed(2)} cm ${s ? 'side' : 'upright'}`).join(' · '));
  check('landed grenades lie at their own yaw, from the id (\'n7\' ≠ \'n8\'; the string id read as a number was NaN → 0: all alike)', Math.abs(yaw[0] - yaw[1]) > .3 && yaw[0] !== 0, yaw.map(y => y.toFixed(2)).join(' vs '));
  check('a decoy at work and a smoke lie drawn; an incendiary or molotov is gone into its fire (CS2 removes the projectile on detonation — it lay intact in its flames)', V.liesAfter('decoy') && V.liesAfter('smoke') && !V.liesAfter('fire') && !V.liesAfter('boom') && !V.liesAfter('pop')); }
// 7. In another player's hands: the AUG, the decoy, the incendiary (and the FAMAS beside them) drawn on the CS2 agent
// where CS2 hangs its own world model — its `weapon` bone on the agent's wpn bone — measured against the CS2 export
// itself (user-assets/holds/src, read here bone by bone, not holds.json: the AUG's holds were measured on a bone-less
// export, so the game and its reference shared the same 11 cm error — "aug 3d holding is not on hands"). The molotov's
// bottle without its lighter. Skipped without the agents / exports.
const HS = 'user-assets/holds/src/', AG = 'user-assets/agents/';
if (['cs2_ct.glb', 'cs2_anims.glb'].every(f => existsSync(AG + f)) && existsSync('user-assets/holds/holds.json') && existsSync(HS + 'weapon_rif_aug.glb')) {
  const { useAgents, makeAgent } = await import('../dist/cs2-agents.js'), Jh = f => JSON.parse(readFileSync((process.env.GD_HOLDS_DIR || 'user-assets/holds') + '/' + f, 'utf8')), [ct, an] = await Promise.all([parse(AG + 'cs2_ct.glb'), parse(AG + 'cs2_anims.glb')]);
  useAgents({ ct: ct.scene }, an.animations, { holds: Jh('holds.json'), clips: Jh('holds-clips.json') });
  // CS2's model in its weapon bone's frame (metres): its body (HD when there is one), skinned vertices at the bind pose in the root's frame
  const cs2Box = (file, dropJoints = null) => { const b = readFileSync(HS + file), n = b.readUInt32LE(12), g = JSON.parse(b.subarray(20, 20 + n)), bin = b.subarray(20 + n + 8), w = g.nodes.find(x => x.name === 'weapon'); if (!w) return null;
    const read = (ai, comps) => { const a = g.accessors[ai], bv = g.bufferViews[a.bufferView], o = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), T = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType], k = T.BYTES_PER_ELEMENT, st = bv.byteStride || comps * k, out = new Float32Array(a.count * comps), dv = new DataView(bin.buffer);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < comps; c++) out[i * comps + c] = k === 4 ? dv.getFloat32(o + i * st + c * 4, true) : k === 2 ? dv.getUint16(o + i * st + c * 2, true) : dv.getUint8(o + i * st + c); return out; };
    const qi = new THREE.Quaternion().fromArray(w.rotation || [0, 0, 0, 1]).invert(), t = new THREE.Vector3().fromArray(w.translation || [0, 0, 0]), box = new THREE.Box3(), v = new THREE.Vector3(), hd = g.meshes.filter(m => /body_hd$/.test(m.name || '')), ms = hd.length ? hd : g.meshes.filter(m => !/physics|legacy/.test(m.name || ''));
    const joints = g.skins?.[0]?.joints.map(j => g.nodes[j].name) || [];
    for (const m of ms) for (const p of m.primitives) { const mat = g.materials?.[p.material]?.name || ''; if (dropJoints && /flame/.test(mat)) continue; const P = read(p.attributes.POSITION, 3), J = dropJoints && p.attributes.JOINTS_0 !== undefined ? read(p.attributes.JOINTS_0, 4) : null, Wt = J ? read(p.attributes.WEIGHTS_0, 4) : null;
      for (let i = 0; i < P.length / 3; i++) { if (J) { let bi = 0; for (let c = 1; c < 4; c++) if (Wt[i * 4 + c] > Wt[i * 4 + bi]) bi = c; if (dropJoints.test(joints[J[i * 4 + bi]] || '')) continue; } box.expandByPoint(v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(t).applyQuaternion(qi)); } }
    return box; };
  const placed = id => { const a = makeAgent({ name: 'H' }, 'ct'); a.setWeapon(id); for (let i = 0; i < 40; i++) a.update(1 / 60, { aim: true, speed: 0 }); a.g.updateMatrixWorld(true);
    const inv = a.g.getObjectByName('wpn').matrixWorld.clone().invert(), box = new THREE.Box3(), v = new THREE.Vector3(), m4 = new THREE.Matrix4(), hand = a.g.getObjectByName('hand_R').getWorldPosition(new THREE.Vector3()).applyMatrix4(inv); let near = Infinity;
    a.g.getObjectByName('wpn-turn').traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position; m4.multiplyMatrices(inv, o.matrixWorld); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m4); box.expandByPoint(v); near = Math.min(near, v.distanceTo(hand)); } });
    a.dispose(); return { box, near }; };
  const cm = b => b.min.toArray().concat(b.max.toArray()).map(x => (x * 100).toFixed(1)).join(','), rows = {};
  for (const [id, file, drop] of [['famas', 'weapon_rif_famas.glb'], ['aug', 'weapon_rif_aug.glb'], ['decoy', 'weapon_decoy.glb'], ['incendiary', 'weapon_incendiarygrenade.glb'], ['molotov', 'weapon_molotov.glb', /^lighter/]]) {
    if (!existsSync(HS + file) || !W.modelFromFile(id)) continue; const ref = cs2Box(file, drop), P = placed(id), off = ref ? Math.max(P.box.min.distanceTo(ref.min), P.box.max.distanceTo(ref.max)) : Infinity; rows[id] = { off, near: P.near };
    check(`${id} in another player's hands where CS2 holds its own model (bounds within 1.5 cm of CS2's, the weapon bone's frame: ${(off * 100).toFixed(1)} cm off)`, off < .015, ref ? `drawn ${cm(P.box)} · CS2 ${cm(ref)} cm` : 'the CS2 export has no weapon bone: its frame is not CS2\'s'); }
  if (rows.aug && rows.famas) check(`AUG: the right hand on it as on the FAMAS (wrist to the gun ${(rows.aug.near * 100).toFixed(1)} cm, the FAMAS's ${(rows.famas.near * 100).toFixed(1)})`, rows.aug.near < rows.famas.near + .015); }
else console.log('SKIP (third person): no CS2 agents / holds exports on this computer');
console.log(`${fail ? 'FAIL' : 'PASS'}: first-person sets · ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
