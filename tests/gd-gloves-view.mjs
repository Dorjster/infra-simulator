// CS2 gloves drawn (Global Defensive): the player's pick on the first-person arms and on other players' agents, with this
// computer's own import (user-assets/gloves from tools/import-cs2-gloves.mjs, the CS2 arms from tools/export-fp-gloves.py,
// the first-person sets and agents). Skipped without them (CI: tests/gd-gloves.mjs covers the data and LAN everywhere).
//  · every glove type's meshes on CS2's 52 arm bones in the arms' order with the arms' inverse binds (no new skeleton);
//  · first person: only the glove part swapped — the side's own gloves and bare wrists hidden, the agent's sleeves kept —
//    on the set's own skeleton, CT and T, every set (guns, knives, grenades, the bomb), the hands where the arms' hands are
//    through idle and inspect; one material per finish shared by every set, a copy of the arms' glove material (the same
//    maps, hook and program key: no shader built for a glove); the 1×1 fallback while pictures load; the agent's own
//    gloves tinted when a type's meshes are missing; none (the agent's) and no side (other modes) as before;
//  · third person: the glove's world meshes on the agent's own skeleton (bones re-numbered, binds matching), the agent's
//    default gloves hidden, at the agent's hands; the material a copy of the agent's own glove material (shared per
//    finish, or the agent's own shaded copy); bots and no pick: the agent's own gloves;
//  · per frame: re-checking a pick allocates nothing.
//   node tests/gd-gloves-view.mjs        (re-runs itself with --expose-gc for the allocation check)
import { readFileSync, existsSync } from 'node:fs'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
const UA = 'user-assets/', man = existsSync(UA + 'manifest.json') ? JSON.parse(readFileSync(UA + 'manifest.json', 'utf8')) : null, fpg = man?.models?.fpGloves;
if (!fpg || !existsSync(UA + fpg.file) || !existsSync(UA + 'gloves/gloves.json') || !existsSync(UA + 'fp/cs2_ak.glb') || !man?.models?.agents?.ct) { console.log('SKIP: no CS2 gloves import (tools/import-cs2-gloves.mjs), CS2 arms or agents on this computer'); process.exit(0); }
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }), getElementById: () => null };
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding|first-person set/.test(String(a[0]))) w(...a); }; }
const THREE = await import('../dist/three.module.js'), { gltfLoader } = await import('../dist/gltf-loader.js'), F = await import('../dist/fp-view.js'), GA = await import('../dist/glove-assets.js'), AG = await import('../dist/cs2-agents.js');
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const toBuf = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), parse = f => new Promise((res, rej) => gltfLoader().parse(toBuf(readFileSync(f)), '', res, rej));
const GL = JSON.parse(readFileSync(UA + 'gloves/gloves.json', 'utf8'));
// The loaders: files from disk (pictures stand-ins of their size: nothing is drawn here), a missing type for the tint case.
let hold = null; const rel = url => decodeURIComponent(url.split('?')[0].replace(/^\/user-assets\/gloves\//, ''));
GA.setGloveLoader({ image: async (url, { size }) => { if (hold) await hold; if (!existsSync(UA + 'gloves/' + rel(url))) throw Error('404 ' + url); return { width: size, height: size, close() {} }; },
  buf: async url => { const f = UA + 'gloves/' + rel(url); if (!existsSync(f)) throw Error('404 ' + url); return toBuf(readFileSync(f)); }, bake: async c => c });
const BAD = JSON.parse(JSON.stringify(GL)); BAD.made = 'test-missing-type'; BAD.types.brokenfang.mesh = 'meshes/not-there.glb';
await GA.loadGloveManifest(false, BAD);
const settle = async (pred, ms = 20000) => { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) { GA.pumpGloves(); await new Promise(r => setTimeout(r, 5)); } return pred(); };
const rec = (kit, wear = .2) => ({ finish: 'cs2g:' + kit, wear });
const types = GA.gloveTypeList(), sport = GA.gloveFinishes('sporty');
check('the catalogue: 8 types, Sport Gloves first, 94 finishes', types.length === 8 && types[0].id === 'sporty' && Object.keys(GL.finishes).length >= 90, types.map(t => t.id + ' ' + t.count).join(', '));

// 1. Every type's meshes on the arms' skeleton.
const arms = F.armsFrom(await parse(UA + fpg.file));
for (const t of types) GA.wantType(GA.gloveType(t.id));
await settle(() => types.every(t => ['ready', 'failed'].includes(GA.gloveType(t.id).state)));
const okTypes = types.filter(t => t.id !== 'brokenfang');
{ const bad = []; for (const t of okTypes) { const T = GA.gloveType(t.id); if (T.state !== 'ready') { bad.push(t.id + ' ' + T.state); continue; } let d = 0; T.bones.forEach((n, i) => { const j = arms.bones.indexOf(n); if (j !== i) d = Infinity; else for (let k = 0; k < 16; k++) d = Math.max(d, Math.abs(T.inverses[i].elements[k] - arms.inverses[j].elements[k])); }); if (d > 1e-3) bad.push(t.id + ' ' + d); }
  check('every glove type: glove_L, glove_R, skin, world_L, world_R on the arms\' 52 bones, same order, same inverse binds (no new skeleton)', !bad.length && okTypes.every(t => GA.MESH_NAMES.every(n => GA.gloveType(t.id).meshes[n])), bad.join(' · ') || okTypes.length + ' types'); }

// 2. First person on a set.
let legacyGlove = null; if (existsSync(UA + 'fp/glove.glb')) (await parse(UA + 'fp/glove.glb')).scene.traverse(o => { if (!legacyGlove && o.isSkinnedMesh) legacyGlove = o; });
const build = async id => F.buildAuthored(await parse(UA + man.models.viewmodels['cs2_' + id].file), legacyGlove, id, arms);
const ak = await build('ak'), w = ak.worn, A = rec(sport[0].kit, .3);
const gloveTpl = arms.materials.find(m => m.userData.part === 'glove'), key = m => [m.type, !!m.map, !!m.normalMap, !!m.aoMap, !!m.roughnessMap, !!m.metalnessMap, !!m.emissiveMap, !!m.envMap, m.vertexColors, m.transparent, m.alphaTest, m.side, m.flatShading, m.map?.channel, m.aoMap?.channel, m.customProgramCacheKey?.(), m.onBeforeCompile === gloveTpl.onBeforeCompile].join();
ak.hold('ak', { draw: false, team: 'ct', gloves: A }); const first = w.shows;
check('before the pictures are in: the 1×1 fallback set (or the tint until the type is in) — never nothing', ['fallback', 'tint', 'glove'].includes(first), first);
await settle(() => GA.gloveTex(sport[0].kit, .3, 'fp').state === 'ready'); const shows = ak.setGloves(A, 'ct');
const grp = w.types.get('sporty'), vis = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
check('CT: the Sport Gloves shown, the SAS gloves and bare wrists hidden, the SAS sleeves kept', shows === 'glove' && grp?.visible && w.ct.visible && w.parts.ct.length >= 2 && w.parts.ct.every(o => !o.visible) && w.ct.children.filter(o => /^sleeves_ct/.test(o.name)).every(o => o.visible) && w.ct.children.some(o => /^sleeves_ct/.test(o.name)),
  w.ct.children.map(o => o.name + (o.visible ? '' : ' (hidden)')).join(', '));
const gm = grp.children.find(o => o.userData.glovePart === 'glove').material;
check('on the set\'s own skeleton (the arms\' — no new skeleton, one bone texture)', grp.children.every(o => o.skeleton === w.sk) && w.ct.children[0].skeleton === w.sk);
check('the glove material: a copy of the CS2 arms\' glove material — the same maps, hook and program key (no shader built for it)', key(gm) === key(gloveTpl) && gm.map && gm.map !== gloveTpl.map && gm.aoMap === gm.roughnessMap && gm.envMapIntensity === F.ARM_LOOK.glove.env, key(gm) + ' | ' + key(gloveTpl));
check('the bare wrist: the arms\' own bare_arm_133 material (shared)', grp.children.find(o => o.userData.glovePart === 'skin')?.material === arms.materials.find(m => m.userData.part === 'skin'));
check('the pictures in the set\'s warm-up list are the arms\' (the glove\'s go up through glove-assets\' own gated pump)', arms.textures.every(t => ak.textures.includes(t)));
const knife = await build('knife'); knife.hold('knife', { draw: false, team: 'ct', gloves: A });
check('one material per finish, shared by every set', knife.worn.types.get('sporty').children.find(o => o.userData.glovePart === 'glove').material === gm);
ak.setGloves(rec(sport[0].kit, .7), 'ct'); await settle(() => GA.gloveTex(sport[0].kit, .7, 'fp').state === 'ready'); ak.setGloves(rec(sport[0].kit, .7), 'ct');
check('another wear: its own baked pictures (another material)', grp.children.find(o => o.userData.glovePart === 'glove').material !== gm && GA.gloveTex(sport[0].kit, .7, 'fp') !== GA.gloveTex(sport[0].kit, .3, 'fp'));
const shT = ak.setGloves(A, 't');
check('T: the Phoenix gloves and bare wrists hidden, the rolled sleeves and their forearm kept, the CT arms hidden', shT === 'glove' && w.t.visible && !w.ct.visible && w.parts.t.every(o => !o.visible) && w.t.children.filter(o => /^sleeves_t/.test(o.name)).every(o => o.visible) && w.t.children.some(o => o.name === 'sleeves_t/bare_arm_133'),
  w.t.children.map(o => o.name + (o.visible ? '' : ' (hidden)')).join(', '));
ak.setGloves(null, 't'); check('no pick: the agent\'s own gloves again (nothing of the glove shown)', w.parts.t.every(o => o.visible) && [...w.types.values()].every(g => !g.visible) && w.shows === 'agent');
ak.setGloves(A, null); check('no side (other modes): the set\'s own glove, no CS2 gloves', w.legacy.every(o => o.visible) && !w.ct.visible && !w.t.visible && [...w.types.values()].every(g => !g.visible) && w.shows === 'legacy');
// The hands where the arms' hands are, in idle and through the inspect.
{ const v = new THREE.Vector3(), mesh = (g, re) => g.children.find(o => re.test(o.name)), bone = w.sk.bones.findIndex(b => b.name === 'finger_index_0_R');
  const at = m => { const sI = m.geometry.attributes.skinIndex, sW = m.geometry.attributes.skinWeight, c = new THREE.Vector3(); let k = 0; for (let i = 0; i < sI.count; i += 3) for (let j = 0; j < 4; j++) if (sI.getComponent(i, j) === bone && sW.getComponent(i, j) > .5) { c.add(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld)); k++; } return k ? c.multiplyScalar(1 / k) : null; };
  const span = () => { const a = w.sk.bones.find(b => b.name === 'hand_R'), b = w.sk.bones.find(b => b.name === 'finger_middle_0_R'); return a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3())); };
  const gap = () => { ak.root.updateMatrixWorld(true); const g = at(mesh(grp, /glove_R/)) || at(mesh(grp, /glove_L/)), a = at(w.ct.children.find(o => o.material.userData.part === 'glove')); return g && a ? g.distanceTo(a) / span() : Infinity; };
  ak.hold('ak', { draw: false, team: 'ct', gloves: A }); ak.update(.016); const idle = gap(); const ms = ak.inspect(); let worst = 0; for (let t = 0; t < ms; t += 100) { ak.update(.1); worst = Math.max(worst, gap()); }
  check('the glove\'s right index knuckle where the CS2 arms\' is, idle and through the whole inspect (< 25 % of the hand\'s size)', idle < .25 && worst < .25, `idle ${(idle * 100).toFixed(1)} % · inspect worst ${(worst * 100).toFixed(1)} % of the hand`); }
// The 1×1 fallback while pictures load; the tint when a type's meshes are missing.
{ let open; hold = new Promise(r => { open = r; }); const B = rec(sport[1].kit, .1); const s1 = ak.setGloves(B, 'ct'), fm = grp.children.find(o => o.userData.glovePart === 'glove').material;
  check('pictures not in yet: the finish\'s 1×1 fallback set — the same maps and program key', s1 === 'fallback' && key(fm) === key(gloveTpl) && fm.map.image.width === 1, s1); open(); hold = null; await settle(() => GA.gloveTex(sport[1].kit, .1, 'fp').state === 'ready'); }
{ const bf = GA.gloveFinishes('brokenfang')[0], s2 = ak.setGloves(rec(bf.kit), 'ct'), gp = w.parts.ct.find(o => o.material.userData.part === 'glove');
  check('a type whose meshes are missing: the agent\'s own gloves in the finish\'s fallback colour (a copy: the same shader)', s2 === 'tint' && gp.visible && gp.material !== w.orig.get(gp) && gp.material.onBeforeCompile === gloveTpl.onBeforeCompile && '#' + gp.material.color.getHexString() === GA.gloveFinish(bf.kit).fallback, s2); }
// Every set: guns, knives, grenades, the bomb — CT and T.
{ const ids = Object.keys(man.models.viewmodels).filter(k => /^cs2_/.test(k)).map(k => k.slice(4)), bad = []; let n = 0;
  for (const id of ids) { let s; try { s = await build(id); } catch (e) { bad.push(id + ' ' + e.message); continue; } if (!s.worn) { bad.push(id + ' no CS2 arms'); continue; }
    for (const team of ['ct', 't']) { s.hold(id, { draw: false, team, gloves: A }); const g = s.worn.types.get('sporty'); if (s.worn.shows !== 'glove' || !g?.visible || s.worn.parts[team].some(o => o.visible) || g.children.some(o => o.skeleton !== s.worn.sk)) bad.push(id + ' ' + team + ' ' + s.worn.shows); }
    if (s.inspect) { s.inspect(); s.update(.3); } n++; }
  check('every first-person set (guns, knives, grenades, the bomb): the gloves on CT and T, the inspect plays', !bad.length && n >= 20, bad.join(' · ') || n + ' sets'); }

// 3. Third person.
const [ct, t] = await Promise.all([parse(UA + man.models.agents.ct.file), parse(UA + man.models.agents.t.file)]); AG.useAgents({ ct: ct.scene, t: t.scene });
for (const side of ['ct', 't']) {
  const a = AG.makeAgent({ name: 'x' }, side), b = AG.makeAgent({ name: 'y' }, side), lit = AG.makeAgent({ name: 'z' }, side, { lightAt: () => .5 });
  let dg = null; a.g.traverse(o => { if (!dg && AG.isDefaultGloves(o)) dg = o; });
  await settle(() => GA.gloveTex(sport[0].kit, .3, 'tp').state !== 'idle'); a.setGloves(A); await settle(() => GA.gloveTex(sport[0].kit, .3, 'tp').state === 'ready'); a.setGloves({ ...A }); const sh = a.wearGloves();
  const ms = a.gloveMeshes.get('sporty') || [];
  check(`${side}: the Sport Gloves' world meshes on the agent, its own gloves hidden`, sh === 'glove' && ms.length === 2 && ms.every(m => m.visible) && !dg.visible, sh);
  check(`${side}: on the agent's own skeleton (bones re-numbered once per type and side; no new skeleton), sharing the glove's vertices, no tangents`, ms.every(m => m.skeleton === dg.skeleton && m.geometry.attributes.position === GA.gloveType('sporty').meshes[m.name.split('/')[1]].geometry.attributes.position && !m.geometry.attributes.tangent));
  const dm = dg.material; check(`${side}: a copy of the agent's own glove material (same maps and hook: its program), shared per finish by every agent`, ms[0].material !== dm && !!ms[0].material.map === !!dm.map && !!ms[0].material.normalMap === !!dm.normalMap && ms[0].material.onBeforeCompile === dm.onBeforeCompile && (b.setGloves(A), b.gloveMeshes.get('sporty')[0].material === ms[0].material));
  lit.setGloves(A); const lm = lit.gloveMeshes.get('sporty')?.[0]?.material; let ld = null; lit.g.traverse(o => { if (!ld && AG.isDefaultGloves(o)) ld = o; });
  check(`${side}: an agent shaded by the map's light: its own copy with the rim hook, as its body`, !!lm && lm !== ms[0].material && lm.onBeforeCompile === ld.material.onBeforeCompile && lm.userData.rim);
  // At the agent's hands: the world glove's centre near its own default glove's.
  { a.update(1 / 60, { speed: 0, aim: 'rifle' }); a.g.updateMatrixWorld(true); const c = (m, v = new THREE.Vector3(), out = new THREE.Vector3()) => { const n = m.geometry.attributes.position.count; for (let i = 0; i < n; i += 7) out.add(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld)); return out.multiplyScalar(1 / Math.ceil(n / 7)); };
    const both = c(ms[0]).add(c(ms[1])).multiplyScalar(.5), own = c(dg), box = new THREE.Box3().setFromObject(a.g), h = box.max.y - box.min.y;
    check(`${side}: the world gloves where the agent's own gloves are (centres within 4 % of its height)`, both.distanceTo(own) / h < .04, (both.distanceTo(own) / h * 100).toFixed(2) + ' %'); }
  a.setGloves(null); check(`${side}: no pick (a bot, the default): the agent's own gloves`, dg.visible && ms.every(m => !m.visible) && a.wearGloves() === 'agent');
  // Per frame: the pick re-checked, nothing allocated.
  { const r1 = { ...A }; a.setGloves(r1); const frames = n => { for (let i = 0; i < n; i++) { a.setGloves(r1); b.setGloves(r1); lit.setGloves(r1); GA.gloveVersion(); } };
    frames(20000); const round = () => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; frames(20000); gc(); gc(); return process.memoryUsage().heapUsed - h0; }; const dh = Math.min(round(), round(), round());
    check(`${side}: setGloves() every frame with an unchanged pick makes nothing (heap growth over 20 000 frames < 64 KB)`, dh < 65536, dh + ' bytes'); }
  for (const x of [a, b, lit]) x.dispose(); }
const st = GA.gloveStats(); console.log(`  glove-assets: ${st.types} types, ${st.ready} texture sets, ${(st.bytes / 1048576).toFixed(0)} MB, ${st.uploads} uploads, ${st.failed} failed (the missing type, by design)`);
// 4. Loads finishing mid-round show nothing until the gate opens (review): a type's meshes parsed while a round is live
//    stay out of every view (no glove meshes built, no agent re-worn, nothing uploaded) and appear at the freeze; a team
//    mate's type (wanted at 'fp' for spectating) is built on the first-person sets then, hidden, before anyone wears it.
{ const ST = await import('../dist/skin-textures.js'); let live = true; ST.setSkinGate(() => !live, () => true);   // (fetching open, uploads shut: a fetch from the round end landing in the live round)
  GA.resetGloves(); await GA.loadGloveManifest(false, GL); const hw = GA.gloveFinishes('handwrap')[0].kit, T = GA.gloveType('handwrap');
  GA.prefetchGloves([{ rec: rec(hw, .1), tier: 'fp' }]); await settle(() => T.state === 'decoded', 10000); const v0 = GA.gloveVersion();
  for (let i = 0; i < 20; i++) { GA.pumpGloves(); await new Promise(r => setTimeout(r, 5)); }
  const kn = await build('knife');
  check('a glove type parsed in a live round: not shown to any view (no version bump, no glove meshes on a set)', T.state === 'decoded' && GA.gloveVersion() === v0 && !kn.worn.types.has('handwrap'), T.state + ', version ' + v0 + '→' + GA.gloveVersion());
  live = false; await settle(() => T.state === 'ready', 5000);
  const kn2 = await build('knife'), g2 = kn2.worn.types.get('handwrap');
  check('the gate open (freeze): the type shown, a team mate\'s type already built on new first-person sets (hidden) before anyone wears it', T.state === 'ready' && GA.gloveVersion() > v0 && !!g2 && !g2.visible && GA.gloveFpTypes().has('handwrap'));
  ST.setSkinGate(null); }
console.log(fail ? `FAIL: gloves drawn · ${pass} passed, ${fail} failed` : `PASS: gloves drawn · ${pass} checks`); process.exit(fail ? 1 : 0);
