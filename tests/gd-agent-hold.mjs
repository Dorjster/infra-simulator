// Third-person holds on the CS2 agents (user-assets/agents: imported on this computer, never shipped), for every gun,
// knife, grenade and the bomb, T and CT, standing, walking, running, crouched: the barrel points where the agent faces
// (v46–v51 hung every gun backwards and on its side off CS2's wpn bone), the gun's up is up, its grip sits in the
// right palm (it floated ~15 cm off it), the skeleton stays sane (no NaN, no stretched bone), and the fallback pose
// (no clips: two-bone IK) measures the gun the same wherever the agent stands. Skipped without the agents.
//   node tests/gd-agent-hold.mjs
import { readFileSync, existsSync } from 'node:fs';
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });   // (GLTFLoader's pictures: not drawn here)
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding/.test(String(a[0]))) w(...a); }; }   // (the clips animate CS2 helper bones the agents' files leave out)
const THREE = await import('../dist/three.module.js');
const { WPN_CARRY, useAgents, makeAgent } = await import('../dist/cs2-agents.js');
const { WEAPONS, GRENADES } = await import('../dist/weapons-data.js');
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
// The attachment rule itself (needs no files): our muzzle (−z) along CS2's wpn +x, our up (+y) along its +z.
const v = new THREE.Vector3();
check('WPN_CARRY: the muzzle (−z) → wpn +x', v.set(0, 0, -1).applyQuaternion(WPN_CARRY).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-6, v.toArray().map(x => x.toFixed(3)).join(','));
check('WPN_CARRY: the gun\'s up (+y) → wpn +z', v.set(0, 1, 0).applyQuaternion(WPN_CARRY).distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-6, v.toArray().map(x => x.toFixed(3)).join(','));
// The built-in soldiers (gd-soldiers → avatar.js: no CS2 agents imported, as on CI): barrel forward, upright, standing
// and crouched, T and CT. (Their name / face labels draw on a canvas: a no-op stand-in, removed after.)
{ const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : /^(get|create)ImageData$/.test(k) ? () => ({ data: new Uint8ClampedArray(4) }) : /Gradient$/.test(k) ? () => ({ addColorStop() {} }) : typeof k === 'string' ? (t[k] ?? (() => {})) : undefined, set: (t, k, x) => { t[k] = x; return true; } });
  const had = 'document' in globalThis; if (!had) globalThis.document = { createElement: () => ({ width: 64, height: 64, style: {}, getContext: () => ctx, toDataURL: () => '' }), createElementNS: () => ({ style: {} }) };
  const { makeSoldier } = await import('../dist/gd-soldiers.js'), q = new THREE.Quaternion(), m = new THREE.Vector3(), f = new THREE.Vector3(), u = new THREE.Vector3(); let worst = 1, worstUp = 1, found = 0, tries = 0, knifeUp = [1, -1], knifeFwd = 1, pistolUp = -9, rifleUp = 9;
  const held = s => { let gun = null; s.g.traverse(o => { if (!gun && o.isGroup && (o.userData.held || (Math.abs(o.rotation.x - Math.PI / 2) < 1e-6 && Math.abs(o.rotation.y - Math.PI) < 1e-6))) gun = o; }); return gun; };   // (avatar.js: the model under the right forearm, turned (π/2, π, 0); v52: marked held)
  for (const team of ['t', 'ct']) for (const id of ['ak', 'sniper', 'negev', 'deagle', 'usps', 'knife']) for (const crouch of [0, 1]) { tries++;
    const s = makeSoldier({ name: 'S', pose: {} }, team); s.setWeapon(id); for (let i = 0; i < 60; i++) s.update(1 / 60, { speed: 0, crouch, aim: true }); s.g.updateMatrixWorld(true);
    const gun = held(s); if (!gun) continue; found++;
    gun.getWorldQuaternion(q); m.set(0, 0, -1).applyQuaternion(q); u.set(0, 1, 0).applyQuaternion(q); s.g.getWorldQuaternion(q); f.set(0, 0, -1).applyQuaternion(q);
    if (id === 'knife') { knifeUp = [Math.min(knifeUp[0], m.y), Math.max(knifeUp[1], m.y)]; knifeFwd = Math.min(knifeFwd, m.dot(f)); } else { worst = Math.min(worst, m.dot(f)); worstUp = Math.min(worstUp, u.y); }
    if (id === 'usps') pistolUp = Math.max(pistolUp, gun.position.y); if (id === 'ak') rifleUp = Math.min(rifleUp, gun.position.y); s.dispose?.(); }   // (along the forearm, its own frame: the hand end is −y)
  if (!had) delete globalThis.document;
  check('built-in soldiers (no CS2 agents): every barrel forward (dot > .9) and upright (> .7), standing and crouched', found === tries && worst > .9 && worstUp > .7, `${found}/${tries} · dir ${worst.toFixed(2)} up ${worstUp.toFixed(2)}`);
  // CS2's convention on the soldiers too (v52 T): the knife's blade tipped up as CS2's default knife idles carry it (52°: y .79), and every pistol held short (up in the hand, as the Glock / Deagle), not halfway up the forearm like a rifle
  check('built-in soldiers: the knife\'s blade tipped up as CS2\'s knife idle (52° over the forearm: up .5–.9 as the forearm tilts, still forward) and the USP-S held up in the hand like a pistol', knifeUp[0] > .5 && knifeUp[1] < .9 && knifeFwd > .45 && pistolUp < rifleUp, `knife up ${knifeUp.map(x => x.toFixed(2)).join('…')} fwd ${knifeFwd.toFixed(2)} · usps at ${pistolUp.toFixed(2)} vs ak ${rifleUp.toFixed(2)} along the forearm`); }
const A = 'user-assets/agents/', files = ['cs2_ct.glb', 'cs2_t.glb', 'cs2_anims.glb'];
if (!files.every(f => existsSync(A + f))) { console.log(`SKIP (agents): no CS2 agents on this computer · ${pass} passed`); process.exit(fail ? 1 : 0); }
const { gltfLoader } = await import('../dist/gltf-loader.js');
const parse = f => { const b = readFileSync(A + f); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
const [ct, t, anims] = await Promise.all(files.map(parse));
const U = 2.54 / 16.5, IDS = [...WEAPONS.map(w => w.id), 'knife', ...GRENADES.map(g => g.id), 'c4'], GUNS = new Set(WEAPONS.map(w => w.id));
const h = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3(), f = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Quaternion(), pal = new THREE.Vector3();
// Bone sanity: every bone's world matrix finite, every bone within 0.6 m of its parent (game units: × 100/16.5).
function bonesSane(a) { let bad = null; a.g.updateMatrixWorld(true); const LIMB = /^(spine|neck|head|clavicle|arm_|hand_|finger_|leg_|ankle|ball)/i;   // (the body's own chain, not CS2's helpers: eye target, attachments)
  a.g.traverse(o => { if (!o.isBone || bad || !LIMB.test(o.name)) return; if (!o.matrixWorld.elements.every(Number.isFinite)) bad = o.name + ' NaN'; else if (o.parent?.isBone && o.parent.parent?.isBone) { o.getWorldPosition(h); o.parent.getWorldPosition(c); if (h.distanceTo(c) > .6 * 100 / 16.5) bad = o.name + ' ' + h.distanceTo(c).toFixed(2); } }); return bad; }
// 1. The fallback (no clips loaded yet: IK pose). The same gun at two places and turns sits the same in the agent's own frame.
useAgents({ ct: ct.scene, t: t.scene });
{ let worst = 0, worstDir = 1; for (const gun of ['ak', 'sniper', 'deagle']) { const rel = [];
    for (const [x, z, yaw] of [[0, 0, 0], [137, -412, 2.3]]) { const a = makeAgent({ name: 'IK' }, 'ct'); a.g.position.set(x, 0, z); a.g.rotation.y = yaw; a.update(1 / 60, { aim: true }); a.setWeapon(gun);   // (switched to in play: the agent already stands somewhere)
      for (let i = 0; i < 40; i++) a.update(1 / 60, { aim: true }); a.g.updateMatrixWorld(true);
      const hand = a.g.getObjectByName('hand_R'); hand.getWorldPosition(h); rel.push(a.g.worldToLocal(h.clone()));
      let gunObj = null; a.g.traverse(o => { if (!gunObj && o.isGroup && o.children.some(k => k.isMesh || k.isGroup) && o.parent?.name !== 'wpn' && o.scale.x < .5) gunObj = o; });
      a.g.getWorldQuaternion(q); f.set(0, 0, -1).applyQuaternion(q); gunObj.getWorldQuaternion(q); m.set(0, 0, -1).applyQuaternion(q); worstDir = Math.min(worstDir, m.dot(f)); a.dispose(); }
    worst = Math.max(worst, rel[0].distanceTo(rel[1])); }
  check('IK pose: the right hand sits the same on the gun wherever the agent stands or faces (stock / reach measured in the gun\'s own frame)', worst < .02, worst.toFixed(3) + ' units');
  check('IK pose: barrels forward', worstDir > .9, worstDir.toFixed(3)); }
// 2. CS2's clips.
useAgents({}, anims.animations);
const STATES = [['standing', 0, false], ['walking', 130, false], ['running', 250, false], ['crouched', 0, true], ['crouch-walking', 85, true]];
let n = 0, worstGun = 1, worstUp = 1, worstPalm = 0, worstItemUp = 1, knifeDir = 1, knifeUp = 1, insane = null; const per = {};
for (const team of ['t', 'ct']) for (const id of IDS) for (const [st, spd, cr] of STATES) for (const yaw of [0, 2]) {
  const a = makeAgent({ name: 'H' }, team); a.setWeapon(id); a.g.rotation.y = yaw; const sp = spd * U;
  for (let i = 0; i < 50; i++) { a.update(1 / 60, { speed: sp, crouch: cr, aim: true, vx: -Math.sin(yaw) * sp, vz: -Math.cos(yaw) * sp }); if (i < 30 || i % 5) continue;
    a.g.updateMatrixWorld(true); const wpn = a.g.getObjectByName('wpn'), carry = a.g.getObjectByName('wpn-turn')?.children[0] || wpn.children.find(o => o.isGroup), hand = a.g.getObjectByName('hand_R');
    a.g.getWorldQuaternion(q); f.set(0, 0, -1).applyQuaternion(q).setY(0).normalize(); carry.getWorldQuaternion(q); m.set(0, 0, -1).applyQuaternion(q); up.set(0, 1, 0).applyQuaternion(q);
    // the palm's centre: half way from the wrist to the middle knuckle
    const k = a.g.getObjectByName('finger_middle_0_R'); hand.getWorldPosition(h); k.getWorldPosition(pal); pal.add(h).multiplyScalar(.5); carry.getWorldPosition(c);
    const dir = m.clone().setY(0).normalize().dot(f), d = c.distanceTo(pal); n++;
    if (GUNS.has(id)) { worstGun = Math.min(worstGun, dir); worstUp = Math.min(worstUp, up.y); worstPalm = Math.max(worstPalm, d); const r = per[id] ??= { dir: 1, up: 1, palm: 0 }; r.dir = Math.min(r.dir, dir); r.up = Math.min(r.up, up.y); r.palm = Math.max(r.palm, d); }
    else { worstPalm = Math.max(worstPalm, d); if (id === 'knife') { knifeDir = Math.min(knifeDir, dir); knifeUp = Math.min(knifeUp, up.y); } } }
  insane ??= bonesSane(a); a.dispose(); }
const bad = Object.entries(per).filter(([, r]) => r.dir < .9 || r.up < .7 || r.palm > .4).map(([id, r]) => `${id} dir ${r.dir.toFixed(2)} up ${r.up.toFixed(2)} palm ${r.palm.toFixed(2)}`);
check('every gun\'s barrel points where its agent faces (dot > .9; T and CT, standing, walking, running, crouched)', worstGun > .9, `${n} frames · worst ${worstGun.toFixed(3)}${bad.length ? ' · ' + bad.slice(0, 4).join(' | ') : ''}`);
check('…upright (the gun\'s up · world up > .7)', worstUp > .7, worstUp.toFixed(3));
// The knife follows the wpn bone of CS2's own knife clips, which carry the blade forward but tipped down and, crouched,
// turned in across the body (measured: standing / walking / running .89 forward, .79 up; crouched .73 / .65 — the
// clip's pose, the same every frame), so its thresholds are its own: forward (> .7) and edge side up (> .6), never
// backwards or flat on its side. Grenades and the bomb have no barrel: only the palm is checked for them (next).
check('the knife\'s blade points forward as CS2\'s knife clips carry it (dir > .7, up > .6; tipped down, turned in when crouched)', knifeDir > .7 && knifeUp > .6, `dir ${knifeDir.toFixed(2)} up ${knifeUp.toFixed(2)}`);
check('…every item\'s grip in the right palm (< .4 units ≈ 6.6 cm from the palm\'s centre)', worstPalm < .4, worstPalm.toFixed(3) + ' units');
check('the skeleton stays sane (no NaN, no bone stretched past 60 cm)', !insane, insane || 'ok');
// Disposing gives back the agent's own skeletons (their bone textures) — nothing kept per agent.
{ const a = makeAgent({ name: 'D' }, 'ct'); a.setWeapon('ak'); a.update(1 / 60, {}); const sk = new Set(); a.g.traverse(o => { if (o.isSkinnedMesh) sk.add(o.skeleton); }); let disposed = 0; for (const s of sk) { const d = s.dispose.bind(s); s.dispose = () => { disposed++; d(); }; } a.dispose();
  check('dispose() frees the agent\'s own skeletons', sk.size > 0 && disposed === sk.size, disposed + '/' + sk.size); }
// 3. CS2's own hold data (package T: user-assets/holds — tools/export-cs2-holds.mjs reads the CS2 install; skipped without).
// Ground truth (holds-truth.json): each item in its CS2 hold clip's first frame with CS2's world model hung the way Source 2
// hangs it (its weapon bone on the agent's wpn bone). The game, with the real models loaded (the imported CS2 files; the
// CC0 / built-in stand-ins where none), standing and crouched, T and CT: the wpn bone within 2 cm of CS2's (the item's
// own clip, not one rifle pose for all), the barrel / blade along CS2's (dot > .98), the muzzle within 2 cm, both hands
// within 3 cm of CS2's where CS2 has both on it, rifles', snipers', shotguns' and LMGs' butt as far from the right shoulder
// as CS2's (± 3 cm: the stock in the shoulder). Walking, running, crouch-walking and aiming up / down (the chest bends):
// both hands stay on the gun as in CS2's hold (± 3 cm in the gun's frame), and the muzzle follows the pitch.
// v52 wave 2 (the palm grip, one turn for every item) fails these: muzzles 5–8 cm off, every knife's blade at 90° to CS2's.
const HD = process.env.GD_HOLDS_DIR ? process.env.GD_HOLDS_DIR.replace(/\/?$/, '/') : 'user-assets/holds/';   // (GD_HOLDS_DIR: another export, e.g. an old one, to show these checks fail on it)
if (!['holds.json', 'holds-clips.json', 'holds-truth.json'].every(f => existsSync(HD + f))) console.log('SKIP (CS2 holds): no user-assets/holds — node tools/export-cs2-holds.mjs');
else {
  const J = f => JSON.parse(readFileSync(HD + f, 'utf8')), HOLDS = J('holds.json'), TRUTH = J('holds-truth.json').truth;
  // the game's real models, as a browser loads them (the room's files): fetch over the local folders
  const { fileURLToPath } = await import('node:url'), ROOT = fileURLToPath(new URL('..', import.meta.url));
  globalThis.ProgressEvent ??= class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } };
  globalThis.location ??= { protocol: 'http:', href: 'http://127.0.0.1/' }; const hadDoc = 'document' in globalThis; if (!hadDoc) globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
  const realFetch = globalThis.fetch, local = u => { u = String(u.url || u); if (u.startsWith('file:')) return fileURLToPath(u.split('?')[0]); const p = new URL(u, 'http://127.0.0.1/').pathname; return p === '/api/user-assets' ? ROOT + 'user-assets/manifest.json' : p.startsWith('/user-assets/') ? ROOT + decodeURIComponent(p).slice(1) : ROOT + 'dist' + p; };
  globalThis.fetch = async u => { const f = local(u); return existsSync(f) ? new Response(readFileSync(f)) : new Response(null, { status: 404 }); };
  const W = await import('../dist/weapon-models.js'), { holdFit } = await import('../dist/cs2-agents.js'); await W.loadRealWeapons(); globalThis.fetch = realFetch; if (!hadDoc) delete globalThis.document;
  useAgents({}, null, { holds: HOLDS, clips: J('holds-clips.json') });
  const V = a => new THREE.Vector3().fromArray(a), STOCK = new Set(WEAPONS.filter(w => /rifle|sniper|shotgun|lmg/.test(w.kind)).map(w => w.id)), KN = /^(knife|knife-t|karambit|butterfly|stiletto|m9|bayonet|skeleton|talon|flip|nomad)$/;   // (v53 KNIVES: + the five new knives)
  const butt = {};   // the model's back end (the centre of its vertices within 1 cm of its rear: +z), game units, its own frame
  const buttOf = (id, gun) => butt[id] ??= (() => { gun.updateMatrixWorld(true); const iv = gun.matrixWorld.clone().invert(), b = new THREE.Box3(), s = new THREE.Vector3(), p = new THREE.Vector3(), all = [];
    gun.traverse(o => { if (!o.isMesh) return; const P = o.geometry.attributes.position, m = iv.clone().multiply(o.matrixWorld); for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i).applyMatrix4(m); b.expandByPoint(p); all.push(p.clone()); } });
    let n = 0; for (const v of all) if (v.z > b.max.z - 1 / 16.5) { s.add(v); n++; } return s.divideScalar(n || 1); })();
  const worst = { wpn: 0, dir: 1, muzzle: 0, hR: 0, hL: 0, stock: 0, relR: 0, relL: 0, pitchUp: 1, pitchDown: -1, fwd: 1 }, who = {}, note = (k, v, id, max = true) => { if (max ? v > worst[k] : v < worst[k]) { worst[k] = v; who[k] = id; } };
  const pt = new THREE.Vector3(), iw = new THREE.Matrix4(), tq = new THREE.Quaternion(); let cases = 0, fitted = 0, cs2Mesh = 0; insane = null;
  const rel = (a, name, out) => { a.g.getObjectByName(name).getWorldPosition(out); return out.applyMatrix4(iw.copy(a.g.getObjectByName('wpn').matrixWorld).invert()); };   // a bone in wpn's frame (metres)
  const gunOf = a => { const t = a.g.getObjectByName('wpn-turn'); if (t) return t.children[0]; let g = null; a.g.getObjectByName('wpn').traverse(o => { if (!g && o.isGroup && o.parent?.parent?.name === 'wpn') g = o; }); return g; };   // (the model, under wpn → carry → turn; older builds named neither)
  const agentFrame = a => { let o = a.g.getObjectByName('wpn'); while (o.parent && o.parent.scale.x < 2) o = o.parent; return o.parent; };   // the agent's own frame (the group scaled to game units: metres, facing +z — the truth's)
  for (const team of ['ct', 't']) for (const id of Object.keys(TRUTH)) { const knife = KN.test(id);
    for (const [st, cr] of [['stand', false], ['crouch', true]]) { const T = TRUTH[id][st]; if (!T) continue;
      const a = makeAgent({ name: 'H' }, team); a.setWeapon(id); for (let i = 0; i < 40; i++) a.update(1 / 60, { aim: true, speed: 0, crouch: cr }); a.g.updateMatrixWorld(true); cases++;
      const mdl = agentFrame(a), L = n => mdl.worldToLocal(a.g.getObjectByName(n).getWorldPosition(new THREE.Vector3())), gun = gunOf(a), F = holdFit?.(id, gun); if (F) fitted++; if (F?.same) cs2Mesh++;
      note('wpn', L('wpn').distanceTo(V(T.wpn.p)), id + ' ' + st);
      const fromFile = W.modelFromFile(id) || GUNS.has(id); gun.getWorldQuaternion(tq); mdl.getWorldQuaternion(q); const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(tq).applyQuaternion(q.invert());
      if (T.dir && fromFile && (GUNS.has(id) || knife)) note('dir', dir.dot(V(T.dir)), id + ' ' + st, false);
      if (T.muzzle && GUNS.has(id) && W.MUZZLE[id]) note('muzzle', mdl.worldToLocal(gun.localToWorld(pt.fromArray(W.MUZZLE[id]))).distanceTo(V(T.muzzle)), id + ' ' + st);
      note('hR', L('hand_R').distanceTo(V(T.handR)), id + ' ' + st); if (T.twoHands) note('hL', L('hand_L').distanceTo(V(T.handL).add(F?.ikL ? F.ikL.clone().applyQuaternion(new THREE.Quaternion().fromArray(T.wpn.q)) : pt.set(0, 0, 0))), id + ' ' + st);   // (a stand-in gun: CS2's left hand moved onto its own surface by the IK — ikL, checked against CS2's model in 4)
      // (a CC0 / built-in stand-in — no CS2 file imported for that gun — has another stock: its butt plate is checked against CS2's model's butt in 4)
      if (STOCK.has(id) && T.stockToShoulder && F?.same) { const b = gun.localToWorld(pt.copy(buttOf(id, gun))); note('stock', Math.abs(mdl.worldToLocal(b).distanceTo(L('arm_upper_R')) - T.stockToShoulder), id + ' ' + st); }
      a.dispose(); }
    // moving and aiming: the hold itself (both hands on the gun as in CS2's hold, its own frame) never changes
    const T = TRUTH[id].stand; if (!T) continue; iw.compose(V(T.wpn.p), new THREE.Quaternion().fromArray(T.wpn.q), new THREE.Vector3(1, 1, 1)).invert(); const tR = V(T.handR).applyMatrix4(iw), tL = V(T.handL).applyMatrix4(iw);
    // (v53 KNIVES: crouched, against CS2's crouched hold — its own hand ↔ weapon relation differs from the standing one by up
    // to 3.08 cm (the Bayonet's idle_crouch vs idle, holds-truth.json); the standing truth for crouched moves failed CS2 itself)
    const TC = TRUTH[id].crouch, iwc = TC ? new THREE.Matrix4().compose(V(TC.wpn.p), new THREE.Quaternion().fromArray(TC.wpn.q), new THREE.Vector3(1, 1, 1)).invert() : null, tRc = TC ? V(TC.handR).applyMatrix4(iwc) : tR, tLc = TC ? V(TC.handL).applyMatrix4(iwc) : tL;
    for (const [st, spd, cr, pitch, jump] of [['walk', 130, false, 0], ['run', 250, false, 0], ['crouch-walk', 85, true, 0], ['aim up', 0, false, .6], ['aim down', 0, false, -.6], ['run aiming up', 250, false, .5], ['jumping', 250, false, 0, 1], ['crouch-jumping', 250, true, 0, 1]]) {   // (jumping: the body thrown up and falling — CS2's 57-HU arc, ~0.66 s — mid-air at the check)
      const a = makeAgent({ name: 'M' }, team); a.setWeapon(id); a.g.rotation.y = 2; const sp = spd * U;
      for (let i = 0; i < 45; i++) { if (jump) { const t = i / 60 % .66; a.g.position.y = 57 * U * 4 * (t / .66) * (1 - t / .66); } a.update(1 / 60, { aim: true, speed: sp, crouch: cr, pitch, vx: -Math.sin(2) * sp, vz: -Math.cos(2) * sp }); } a.g.updateMatrixWorld(true);
      note('relR', rel(a, 'hand_R', pt).distanceTo(cr ? tRc : tR), id + ' ' + st); if (T.twoHands) { const ik = holdFit?.(id, gunOf(a))?.ikL, l = cr ? tLc : tL; note('relL', rel(a, 'hand_L', pt).distanceTo(ik ? l.clone().add(ik) : l), id + ' ' + st); }
      if (GUNS.has(id)) { const gun = gunOf(a); gun.getWorldQuaternion(tq); const d = new THREE.Vector3(0, 0, -1).applyQuaternion(tq); a.g.getWorldQuaternion(q); f.set(0, 0, -1).applyQuaternion(q);
        if (pitch > 0) note('pitchUp', d.y, id + ' ' + st, false); else if (pitch < 0) note('pitchDown', d.y, id + ' ' + st); else note('fwd', d.clone().setY(0).normalize().dot(f), id + ' ' + st, false); }
      insane ??= bonesSane(a); a.dispose(); } }
  const cm = x => (x * 100).toFixed(1) + ' cm', at = k => who[k] ? ' (' + who[k] + ')' : '';
  check(`CS2 holds: every item registered on CS2's world model (${cs2Mesh} of ${cases} are CS2's own mesh)`, fitted === cases, `${fitted}/${cases}`);
  check('CS2 holds: the wpn bone where CS2\'s hold clip puts it, per item, standing and crouched (< 2 cm)', worst.wpn < .02, cm(worst.wpn) + at('wpn'));
  check('CS2 holds: every barrel and blade along CS2\'s (dot > .98)', worst.dir > .98, worst.dir.toFixed(4) + at('dir'));
  check('CS2 holds: every muzzle where CS2\'s is (< 2 cm)', worst.muzzle < .02, cm(worst.muzzle) + at('muzzle'));
  check('CS2 holds: the right hand where CS2\'s is (< 3 cm)', worst.hR < .03, cm(worst.hR) + at('hR'));
  check('CS2 holds: the left hand on the gun where CS2\'s is (< 3 cm, items CS2 holds two-handed)', worst.hL < .03, cm(worst.hL) + at('hL'));
  check('CS2 holds: rifles, snipers, shotguns and LMGs on CS2\'s own mesh: the stock in the shoulder as CS2 has it (butt ↔ shoulder within 3 cm of CS2\'s; stand-ins: 4)', worst.stock < .03, cm(worst.stock) + at('stock'));
  check('CS2 holds: walking, running, crouch-walking, jumping, aiming up / down: both hands stay on the gun as in CS2\'s hold (< 3 cm, the gun\'s frame)', worst.relR < .03 && worst.relL < .03, 'right ' + cm(worst.relR) + at('relR') + ' · left ' + cm(worst.relL) + at('relL'));
  check('CS2 holds: the barrel forward on the move (dot > .9) and following the aim (up .6 rad → dir.y > .35, down → < −.35)', worst.fwd > .9 && worst.pitchUp > .35 && worst.pitchDown < -.35, `fwd ${worst.fwd.toFixed(3)}${at('fwd')} · up ${worst.pitchUp.toFixed(2)}${at('pitchUp')} · down ${worst.pitchDown.toFixed(2)}${at('pitchDown')}`);
  check('CS2 holds: the skeleton stays sane moving and aiming', !insane, insane || 'ok');
  // 4. Against CS2's own world model, not holds.json (v52 wave 3: the AUG's holds.json was measured from a bone-less export —
  // the model root taken for the weapon bone, 14.5 cm off — and the game, the truth and the checks above shared that mistake:
  // "aug 3d holding is not on hands"). Here each gun's CS2 model is read from its Source2Viewer export (holds/src, with its
  // skeleton — none is a failure) and hung by its own `weapon` bone on the game agent's wpn bone, as Source 2 bonemerges it.
  // In the same pose: the drawn gun's muzzle (its front-most vertices) on CS2's model's (< 2 cm), and each palm's centre as
  // close to the drawn gun's surface as it is to CS2's (≤ CS2's, at least 1.5 cm, + 1.5 cm: the hands on the gun where CS2 puts them — the
  // left only where CS2 holds it two-handed), standing and crouched, T and CT.
  { const tri = new THREE.Triangle(), cp = new THREE.Vector3(), wpnInv = new THREE.Matrix4(), pm = new THREE.Vector3(), mv = new THREE.Matrix4();
    // a mesh's triangles in a frame (metres): flat [ax,ay,az,bx,…] plus each one's centre and radius (for a quick reject)
    const tris = (root, toFrame, filter) => { const out = [], a = new THREE.Vector3(); root.updateMatrixWorld(true); root.traverse(o => { if (!o.isMesh || (filter && !filter(o)) || o.visible === false) return; const P = o.geometry.attributes.position, ix = o.geometry.index, n = ix ? ix.count : P.count; mv.multiplyMatrices(toFrame, o.matrixWorld);
        for (let t = 0; t + 2 < n; t += 3) for (let k = 0; k < 3; k++) { const i = ix ? ix.getX(t + k) : t + k; a.fromBufferAttribute(P, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, a); a.applyMatrix4(mv); out.push(a.x, a.y, a.z); } });
      const T = new Float32Array(out), C = new Float32Array(T.length / 9 * 4); for (let i = 0, j = 0; i < T.length; i += 9, j += 4) { const cx = (T[i] + T[i + 3] + T[i + 6]) / 3, cy = (T[i + 1] + T[i + 4] + T[i + 7]) / 3, cz = (T[i + 2] + T[i + 5] + T[i + 8]) / 3; C[j] = cx; C[j + 1] = cy; C[j + 2] = cz; C[j + 3] = Math.sqrt(Math.max((T[i] - cx) ** 2 + (T[i + 1] - cy) ** 2 + (T[i + 2] - cz) ** 2, (T[i + 3] - cx) ** 2 + (T[i + 4] - cy) ** 2 + (T[i + 5] - cz) ** 2, (T[i + 6] - cx) ** 2 + (T[i + 7] - cy) ** 2 + (T[i + 8] - cz) ** 2)); } return { T, C }; };
    const near = ({ T, C }, p) => { let best = Infinity; for (let i = 0, j = 0; i < T.length; i += 9, j += 4) { const dc = Math.hypot(p.x - C[j], p.y - C[j + 1], p.z - C[j + 2]) - C[j + 3]; if (dc >= best) continue; tri.a.fromArray(T, i); tri.b.fromArray(T, i + 3); tri.c.fromArray(T, i + 6); best = Math.min(best, tri.closestPointToPoint(p, cp).distanceTo(p)); } return best; };
    const front = ({ T }) => { let hi = -Infinity; for (let i = 0; i < T.length; i += 3) hi = Math.max(hi, T[i]); const s = new THREE.Vector3(); let k = 0; for (let i = 0; i < T.length; i += 3) if (T[i] > hi - .01) { s.x += T[i]; s.y += T[i + 1]; s.z += T[i + 2]; k++; } return s.divideScalar(k); };   // (the wpn frame's +x is the barrel)
    const rearPt = ({ T }) => { let lo = Infinity; for (let i = 0; i < T.length; i += 3) lo = Math.min(lo, T[i]); const s = new THREE.Vector3(); let k = 0; for (let i = 0; i < T.length; i += 3) if (T[i] < lo + .01) { s.x += T[i]; s.y += T[i + 1]; s.z += T[i + 2]; k++; } return s.divideScalar(k); };   // CS2's butt
    const plate = ({ T, C }, p) => { let lo = Infinity; for (let i = 0; i < T.length; i += 3) lo = Math.min(lo, T[i]); const keep = [], kc = []; for (let i = 0, j = 0; i < T.length; i += 9, j += 4) if (Math.min(T[i], T[i + 3], T[i + 6]) < lo + .03) { for (let k = 0; k < 9; k++) keep.push(T[i + k]); for (let k = 0; k < 4; k++) kc.push(C[j + k]); } return near({ T: new Float32Array(keep), C: new Float32Array(kc) }, p); };   // a gun's butt plate (its surface within 3 cm of its rear end) ↔ a point
    const STK = new Set(WEAPONS.filter(w => /rifle|sniper|shotgun|lmg/.test(w.kind)).map(w => w.id));
    const cs2 = {}, drawn = {}, w4 = { muzzle: 0, palmR: -9, palmL: -9, butt: 0 }, who4 = {}, noBone = [], gap = {}, note4 = (k, v, id) => { if (v > w4[k]) { w4[k] = v; who4[k] = id; } };
    for (const id of Object.keys(TRUTH).filter(i => GUNS.has(i))) { const it = HOLDS.items[id]; if (!it?.file || !existsSync(HD + it.file)) continue;
      const b = readFileSync(HD + it.file), g = await new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); g.scene.updateMatrixWorld(true); const wb = g.scene.getObjectByName('weapon');
      if (!wb) { noBone.push(id); continue; } const ms = []; g.scene.traverse(o => { if (o.isMesh) ms.push(o.name); }); const hd = ms.some(n => /body_hd/.test(n)), body = ms.some(n => /body/.test(n));
      cs2[id] = tris(g.scene, wb.matrixWorld.clone().invert(), o => hd ? /body_hd/.test(o.name) : body ? /body/.test(o.name) : true); cs2[id].muzzle = front(cs2[id]); }
    for (const team of ['ct', 't']) for (const id of Object.keys(cs2)) for (const [st, cr] of [['stand', false], ['crouch', true]]) { const T = TRUTH[id][st]; if (!T) continue;
      const a = makeAgent({ name: 'C' }, team); a.setWeapon(id); for (let i = 0; i < 40; i++) a.update(1 / 60, { aim: true, speed: 0, crouch: cr }); a.g.updateMatrixWorld(true);
      wpnInv.copy(a.g.getObjectByName('wpn').matrixWorld).invert(); const D = drawn[id] ??= (() => { const d = tris(gunOf(a), wpnInv); d.muzzle = front(d); return d; })();   // (the drawn gun in wpn's frame: fixed by the hold, the same every case)
      note4('muzzle', D.muzzle.distanceTo(cs2[id].muzzle), id); if (STK.has(id)) note4('butt', D.butt ??= plate(D, cs2[id].butt ??= rearPt(cs2[id])), id);
      const palm = s => pm.copy(a.g.getObjectByName('hand_' + s).getWorldPosition(new THREE.Vector3())).add(a.g.getObjectByName('finger_middle_0_' + s).getWorldPosition(new THREE.Vector3())).multiplyScalar(.5).applyMatrix4(wpnInv);
      for (const s of T.twoHands ? ['R', 'L'] : ['R']) { const p = palm(s), dg = near(D, p), dc = near(cs2[id], p), r = gap[id + ' ' + s] ??= { dg: 0, dc: 0 }; r.dg = Math.max(r.dg, dg); r.dc = Math.max(r.dc, dc); note4('palm' + s, dg - Math.max(dc, .015), `${id} ${team} ${st}: ${(dg * 100).toFixed(1)} vs CS2 ${(dc * 100).toFixed(1)} cm`); }
      a.dispose(); }
    const missing = Object.keys(TRUTH).filter(i => GUNS.has(i) && !cs2[i]);
    check('CS2 world models: every gun\'s CS2 export has its weapon bone (a bone-less export puts the gun in the model root\'s frame — the AUG, 14.5 cm off)', !missing.length, missing.length ? 'missing / no bone: ' + missing.join(', ') : `${Object.keys(cs2).length} guns`);
    check('CS2 world models: every drawn gun\'s muzzle on CS2\'s own model\'s, hung by its weapon bone (< 2 cm)', w4.muzzle < .02, cm(w4.muzzle) + (who4.muzzle ? ' (' + who4.muzzle + ')' : ''));
    check('CS2 world models: the right palm on the drawn gun as on CS2\'s model (palm ↔ surface ≤ CS2\'s + 1.5 cm; CS2\'s taken as ≥ 1.5 cm)', w4.palmR <= .015, `+${cm(w4.palmR)}` + (who4.palmR ? ' (' + who4.palmR + ')' : ''));
    check('CS2 world models: the left palm on the drawn gun as on CS2\'s model, where CS2 holds it two-handed (≤ CS2\'s + 1.5 cm; CS2\'s taken as ≥ 1.5 cm: a palm centre sits ~1.5–3 cm inside the hand)', w4.palmL <= .015, `+${cm(w4.palmL)}` + (who4.palmL ? ' (' + who4.palmL + ')' : ''));
    check('CS2 world models: rifles, snipers, shotguns and LMGs: the drawn gun\'s butt plate on CS2\'s model\'s butt — the stock in the shoulder (< 3 cm; stand-ins too)', w4.butt < .03, cm(w4.butt) + (who4.butt ? ' (' + who4.butt + ')' : ''));
    if (process.env.HOLD_VERBOSE) for (const [k, r] of Object.entries(gap)) console.log('  ' + k.padEnd(10) + ' drawn ' + cm(r.dg).padStart(8) + ' CS2 ' + cm(r.dc).padStart(8)); }
  // 5. A model made after load (a star knife baked from its first-person set → registerModel) is measured then, out of the
  // frame — not by its first equip mid-round (v52 wave 3: warmHolds measured the 567-vertex fallback; the baked knife's first
  // draw ran holdFit in frame code, 2–5 ms).
  { const { holdFitReady } = await import('../dist/cs2-agents.js'), base = W.weaponModel('knife', 1), knife = new THREE.Group(); base.traverse(o => { if (o.isMesh) knife.add(new THREE.Mesh(o.geometry.clone(), o.material)); }); knife.add(new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial()));   // (another vertex count than anything measured)
    const cx = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : /^(get|create)ImageData$/.test(k) ? () => ({ data: new Uint8ClampedArray(4) }) : /Gradient$/.test(k) ? () => ({ addColorStop() {} }) : typeof k === 'string' ? (t[k] ?? (() => {})) : undefined, set: (t, k, x) => { t[k] = x; return true; } });
    const had = 'document' in globalThis; if (!had) globalThis.document = { createElement: () => ({ width: 64, height: 64, style: {}, getContext: () => cx, toDataURL: () => '' }), createElementNS: () => ({ style: {} }) };
    W.registerModel('m9', knife); if (!had) delete globalThis.document; const now = holdFitReady('m9', W.weaponModel('m9', 1)); await new Promise(r => setTimeout(r, 20));
    check('CS2 holds: a model registered after load (a baked star knife) is measured then, not at its first equip (warmHolds on registerModel)', !now && holdFitReady('m9', W.weaponModel('m9', 1)), `before ${now} · after ${holdFitReady('m9', W.weaponModel('m9', 1))}`); }
  useAgents({}, null, null);
}
console.log(`${fail ? 'FAIL' : 'PASS'}: agents' holds · ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
