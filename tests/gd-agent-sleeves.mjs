// The agent's own first-person sleeve (v53 AGENTS: tools/import-cs2-sleeves.mjs → user-assets/sleeves, worn by
// dist/fp-view.js). Part 1 needs no CS2 files (CI): which sleeve each side wears for its agent (its own, else its
// family's, never the other side's, none → the arms' own), the manifest's agent name read as the importer reads it,
// the importer's PNG and hit box readers on our own data. Part 2 (skipped without user-assets/sleeves): every imported
// sleeve loads on the CS2 arms' own 52 bones and binds, with the arms' maps, shader and program key (no new program at
// a side swap), is CS2's firstperson_sleeves material (vmat), and swapping it in changes only that side's sleeve —
// the gloves (the agent's own or the player's CS2 pick) and the bare forearm stay; the drawn agents (SAS, Phoenix)
// get their own sleeve.
//   node tests/gd-agent-sleeves.mjs
import { readFileSync, existsSync } from 'node:fs';
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }), getElementById: () => null };
{ const w = console.warn; console.warn = (...a) => { if (!/PropertyBinding/.test(String(a[0]))) w(...a); }; }
const F = await import('../dist/fp-view.js'), I = await import('../tools/import-cs2-sleeves.mjs'), PNG = await import('../tools/cs2-sleeves/png.mjs');
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };

// 1. The choice per agent and side (made-up list)
const list = { agents: { ctm_sas: { side: 'ct', file: 'a' }, ctm_fbi: { side: 'ct', file: 'b' }, tm_phoenix: { side: 't', file: 'c' }, tm_leet_varianta: { side: 't', file: 'd' }, tm_balkan_variantf: { side: 't', file: 'e' } } };
const pk = (a, s) => F.pickSleeve(list, a, s)?.[0] ?? null;
check('its own sleeve: SAS → ctm_sas, FBI → ctm_fbi, Phoenix → tm_phoenix (CT / T)', pk('ctm_sas', 'ct') === 'ctm_sas' && pk('ctm_fbi', 'ct') === 'ctm_fbi' && pk('tm_phoenix', 't') === 'tm_phoenix');
check('a variant not imported wears its family\'s: ctm_fbi_variantb → ctm_fbi, tm_leet_variantf → tm_leet_varianta, tm_balkan_variantj → tm_balkan_variantf', pk('ctm_fbi_variantb', 'ct') === 'ctm_fbi' && pk('tm_leet_variantf', 't') === 'tm_leet_varianta' && pk('tm_balkan_variantj', 't') === 'tm_balkan_variantf');
check('never the other side\'s, and none for an agent not imported (the arms\' own sleeve stays)', pk('ctm_sas', 't') === null && pk('tm_phoenix', 'ct') === null && pk('ctm_st6_variante', 'ct') === null && F.pickSleeve(null, 'ctm_sas', 'ct') === null && pk(null, 'ct') === null);
const entries = ['CS2: agents/models/ctm_sas/ctm_sas (Steam depot)', 'CS2: agents/models/tm_phoenix/tm_phoenix (Steam depot)', 'CS2: agents/models/ctm_fbi/ctm_fbi_variantb', 'a sketchfab upload', ''];
check('the manifest\'s agent (models.agents[side].from) read the same by the page and the importer', entries.every(f => F.agentKeyOf({ from: f }) === I.agentOfEntry({ from: f })) && F.agentKeyOf({ from: entries[0] }) === 'ctm_sas' && F.agentKeyOf({ from: entries[3] }) === null, entries.map(f => F.agentKeyOf({ from: f })).join(' '));
check('the importer\'s model paths and sides (vmdl per agent)', I.vmdlOf('ctm_sas') === 'agents/models/ctm_sas/ctm_sas.vmdl_c' && I.vmdlOf('tm_professional_varf') === 'agents/models/tm_professional/tm_professional_varf.vmdl_c' && I.vmdlOf('ctm_st6_variante') === 'agents/models/ctm_st6/ctm_st6_variante.vmdl_c' && I.sideOfAgent('tm_leet_varianta') === 't' && I.sideOfAgent('ctm_fbi') === 'ct' && I.sideOfAgent('glove_x') === null);
{ const w = 5, h = 3, px = new Uint8Array(w * h * 4).map((_, i) => (i * 37) & 255), a = PNG.readPNG(PNG.writePNG(w, h, px, 4)), b = PNG.readPNG(PNG.writePNG(w, h, px, 3));
  check('the importer\'s PNG writer and reader (RGBA and RGB) round-trip', a.w === w && a.h === h && a.data.every((v, i) => v === px[i]) && b.data.every((v, i) => i % 4 === 3 ? v === 255 : v === px[i])); }
{ const box = (n, bone, g, r) => `{ m_name = "${n}" m_sSurfaceProperty = "flesh" m_sBoneName = "${bone}" m_vMinBounds = [ 1.0, 2.0, 3.0 ] m_vMaxBounds = [ 4.0, 5.0, 6.0 ] m_flShapeRadius = ${r} m_nGroupId = ${g} m_nShapeType = 2 }`;
  const block = `--- Data for block "MDAT" ---\n<!-- kv3 -->\n{ m_skeleton = { m_bones = [ { m_boneName = "Head_0" m_invBindPose = [ 1.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0 ] } ] } m_hitboxsets = [ { key = "cstrike" value = { m_name = "cstrike" m_HitBoxes = [ ${box('head_0', 'Head_0', 1, 2.5)}, ${box('leg', 'leg_l', 6, 1.5)} ] } } ] }\n`;
  const s = I.hitboxSetOf(block + block, 'test');
  check('the importer\'s hit box reader (made-up MDAT dump): bones, end points, radii, groups, the bone\'s bind; every mesh block the same', s.boxes.length === 2 && s.boxes[0].bone === 'head_0' && s.boxes[0].r === 2.5 && s.boxes[1].group === 6 && s.boxes[0].a.join() === '1,2,3' && s.bind.head_0?.[3] === -1 && s.blocks === 2);
  let threw = false; try { I.hitboxSetOf(block + block.replace('= 6 m_nShapeType', '= 7 m_nShapeType'), 'test'); } catch { threw = true; } check('…and refuses blocks whose sets differ', threw); }

// ── Part 2: the imported sleeves (CS2's, local only) ──
const UA = 'user-assets/', man = existsSync(UA + 'manifest.json') ? JSON.parse(readFileSync(UA + 'manifest.json', 'utf8')) : null, M = man?.models || {};
if (!M.sleeves?.file || !existsSync(UA + M.sleeves.file) || !M.fpGloves?.file) { console.log(`SKIP (sleeves): none imported on this computer (tools/import-cs2-sleeves.mjs) · ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
const { gltfLoader } = await import('../dist/gltf-loader.js'), parse = f => { const b = readFileSync(f); return new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
const L = JSON.parse(readFileSync(UA + M.sleeves.file, 'utf8')), keys = Object.keys(L.agents), arms0 = F.armsFrom(await parse(UA + M.fpGloves.file));
check('the sleeves list: CT and T agents, each a file', keys.some(k => L.agents[k].side === 'ct') && keys.some(k => L.agents[k].side === 't') && keys.every(k => existsSync(UA + L.agents[k].file)), keys.join(', '));
const armMat = arms0.materials[0], slots = m => ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap'].map(k => !!m[k]).join();
let bad = [];
for (const k of keys) { const e = L.agents[k], arms = F.armsFrom(await parse(UA + M.fpGloves.file)), ms = F.sleevesFrom(await parse(UA + e.file), e.side, arms);
  if (!ms) { bad.push(k + ': not worn'); continue; }
  const mats = [...new Set(ms.map(o => o.material))];
  if (!ms.every(o => o.skeleton.bones.length === arms.bones.length && o.skeleton.bones.every((b, i) => b.name === arms.bones[i]))) bad.push(k + ': bones');
  if (!mats.every(m => m.onBeforeCompile === armMat.onBeforeCompile && m.customProgramCacheKey === armMat.customProgramCacheKey && slots(m) === slots(armMat))) bad.push(k + ': shader / maps');
  if (!mats.some(m => m.userData.part === 'sleeve' && /\.vmat$/.test(m.userData.vmat || ''))) bad.push(k + ': no sleeve material');
  if (!ms.every(o => o.geometry.attributes.tangent && o.geometry.attributes.skinIndex)) bad.push(k + ': attributes'); }
check(`every imported sleeve (${keys.length}) on the arms' own 52 bones, with the arms' shader, program key and the same five maps (no program built at a side swap), CS2's sleeve material`, !bad.length, bad.join(' · ') || keys.map(k => k + ' ' + L.agents[k].material).join(' · '));
// the swap: only that side's sleeve; its gloves and bare forearm (and the other side) untouched
{ const arms = F.armsFrom(await parse(UA + M.fpGloves.file)), before = { ct: arms.ct.slice(), t: arms.t.slice() }, k = keys.find(x => L.agents[x].side === 'ct' && x !== 'ctm_sas') || keys.find(x => L.agents[x].side === 'ct');
  const ms = F.sleevesFrom(await parse(UA + L.agents[k].file), 'ct', arms); F.wearAgentSleeves(arms, 'ct', ms, k);
  const keptArms = before.ct.filter(o => /^arms_/.test(o.name)).every(o => arms.ct.includes(o)), goneOld = before.ct.filter(o => /^sleeves_/.test(o.name)).every(o => !arms.ct.includes(o)), tSame = arms.t.length === before.t.length && arms.t.every((o, i) => o === before.t[i]);
  check(`wearing ${k}'s sleeve on the CT arms: the arms glb's SAS sleeve out, the gloves and skin (arms_ct) kept, the T side as it was`, keptArms && goneOld && tSame && ms.every(o => arms.ct.includes(o)) && arms.sleeve.ct === k, arms.ct.map(o => o.name).join(' + '));
  check('the gloves picker still finds the glove and skin parts (arms_<side>), never a sleeve', arms.ct.filter(o => /^arms_/.test(o.name)).every(o => /^(glove|skin)$/.test(o.material.userData.part)) && ms.every(o => !/^arms_/.test(o.name))); }
// the drawn agents get their own
{ const got = ['ct', 't'].map(s => F.pickSleeve(L, F.agentKeyOf(M.agents?.[s]), s)?.[0]);
  check(`the agents drawn here wear their own sleeves: CT ${M.agents?.ct?.name} → ${got[0]}, T ${M.agents?.t?.name} → ${got[1]}`, got[0] === F.agentKeyOf(M.agents.ct) && got[1] === F.agentKeyOf(M.agents.t));
  // (v53 AGENTS final: when the arms glb already wears that agent's sleeve — the same material name; SAS and Phoenix
  // today — fp-view does not download its glb again; any other agent's is loaded)
  const arms = F.armsFrom(await parse(UA + M.fpGloves.file)), has = s => got[['ct', 't'].indexOf(s)] && arms[s].some(o => o.name === 'sleeves_' + s + '/' + L.agents[got[['ct', 't'].indexOf(s)]].material);
  const src = readFileSync('dist/fp-view.js', 'utf8');
  check('…and when the arms glb already wears that sleeve (the same material) it is not downloaded again', src.includes("if (pick[1].material && arms[side].some(o => o.name === 'sleeves_' + side + '/' + pick[1].material)) { arms.sleeve[side] = pick[0]; return; }") && ['ct', 't'].every(has), ['ct', 't'].map(s => s + ': ' + (has(s) ? 'already worn' : 'downloaded')).join(', ')); }
// Phoenix's sleeve mesh carries its bare forearm too: the arms' own bare_arm_133 material (one picture set), not a copy
{ const e = L.agents.tm_phoenix; if (e) { const arms = F.armsFrom(await parse(UA + M.fpGloves.file)), ms = F.sleevesFrom(await parse(UA + e.file), 't', arms), skin = ms.find(o => o.material.userData.part === 'skin')?.material;
    check('Phoenix: its sleeve mesh\'s bare forearm shares the arms\' own bare_arm_133 material', !skin || arms.materials.filter(m => m.name === skin.name).length === 1, skin?.name || 'no skin part'); } }
console.log(`${fail ? 'FAIL' : 'PASS'}: gd-agent-sleeves · ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
