// The CS2 gloves importer (tools/import-cs2-gloves.mjs, tools/cs2-gloves/) and its manifest (user-assets/gloves/
// gloves.json). Part 1 runs everywhere (CI has no CS2 install): image and glb headers, the skeleton hash, the manifest
// check (schema, sizes, paths that leave the folder, a mesh on another skeleton), the staging-folder rule (the tool
// refuses --out inside user-assets), and the install back-up rule on a fake user-assets folder (an existing gloves/
// becomes gloves.bak-*, at most 2 backups are kept, every other file is left as it was).
// Part 2 needs this computer's own CS2 install (~/CS2-extract) and Blender's Python: it bakes two Sport Gloves
// finishes (one per CS2 glove-shader generation) into a temp folder, checks the manifest and files, matches the glove
// mesh's skeleton bone by bone against the first-person arms glb (package V: user-assets/fp-gloves/arms-*.glb), checks
// the Python and JS skeleton hashes agree, and installs into a fake user-assets folder. Skipped with a message when
// the install, Blender or the arms glb is missing. Synthetic data only: the real gloves are Valve's and stay local.
//   node tests/import-cs2-gloves.mjs        (CS2_GLOVES_WORK=<dir> picks the bake cache; default: the tool's own)
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { imageSize, validateManifest, installGloves, manifestFiles, stageProblem, claimStage, backupOrder, glbJson, glbSkeleton, skeletonHash, skeletonDiff,
  MANIFEST, STAGE_MARK, ICON_W, ICON_H, WEAR_RES, TYPE_ORDER, BONES } from '../tools/cs2-gloves/manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const tmp = mkdtempSync(path.join(os.tmpdir(), 'cs2gloves-'));

// ---- synthetic images and glb (headers are what the check reads)
const png = (w, h) => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const webp = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };
const NAMES = Array.from({ length: BONES }, (_, i) => `bone_${i}`);
function fakeGlb(names = NAMES, shift = 0) {
  const ibm = new Float32Array(names.length * 16); names.forEach((_, i) => { for (let k = 0; k < 4; k++) ibm[i * 16 + k * 5] = 1; ibm[i * 16 + 12] = -0.01 * i + shift; ibm[i * 16 + 13] = 0.5; });
  const bin = Buffer.from(ibm.buffer), J = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'root', children: names.map((_, i) => i + 1), extras: {} }, ...names.map(n => ({ name: n }))],
    skins: [{ joints: names.map((_, i) => i + 1), inverseBindMatrices: 0 }], accessors: [{ bufferView: 0, componentType: 5126, count: names.length, type: 'MAT4' }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }], buffers: [{ byteLength: bin.length }] };
  let js = Buffer.from(JSON.stringify(J)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  const h = Buffer.alloc(12); h.write('glTF', 0, 'latin1'); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const c = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return { buf: Buffer.concat([h, c(js.length, 0x4e4f534a), js, c(bin.length, 0x004e4942), bin]), hash: skeletonHash(names, ibm), ibm };
}

// Image headers and glb parsing.
{ const p = imageSize(png(1024, 1024)), j = imageSize(jpg(1024, 1024)), w = imageSize(webp(ICON_W, ICON_H));
  ok(p.type === 'png' && p.w === 1024 && j.type === 'jpeg' && j.h === 1024 && w.type === 'webp' && w.w === ICON_W && w.h === ICON_H, 'PNG / JPEG / WebP sizes from their headers');
  ok(imageSize(Buffer.from('plain text, not an image')) === null, 'anything else: no size');
  const g = fakeGlb(), sk = glbSkeleton(g.buf);
  ok(glbJson(g.buf)?.skins?.length === 1 && glbJson(Buffer.from('glTX0000000000000000')) === null, 'glb JSON chunk read; a non-glb refused');
  ok(sk.names.length === BONES && sk.names[3] === 'bone_3' && Math.abs(sk.ibm[3 * 16 + 12] + 0.03) < 1e-7, 'skin bone names and inverse bind matrices read from the binary chunk');
  ok(skeletonHash(sk.names, sk.ibm) === g.hash && /^[0-9a-f]{40}$/.test(g.hash), 'skeleton hash: same bones + matrices, same hash');
  ok(skeletonHash(sk.names, sk.ibm.map((x, i) => i === 12 ? x + 4e-4 : x)) !== g.hash && skeletonHash(sk.names, sk.ibm.map((x, i) => i === 12 ? x + 2e-6 : x)) === g.hash, 'hash: a 0.4 mm move changes it, float noise does not');
  ok(skeletonDiff(sk, glbSkeleton(fakeGlb(NAMES, 0.002).buf)) > 0.0019 && skeletonDiff(sk, glbSkeleton(fakeGlb([...NAMES].reverse()).buf)) === Infinity, 'skeleton diff: matrices compared by bone; other bone order = no match'); }

// A synthetic baked folder in the gloves.json format.
const RES = 64;
function fakeBake(dir, { bad = null, tag = '' } = {}) {
  const g = fakeGlb(), other = fakeGlb(NAMES, 0.01);
  const fin = (id, type, name) => ({ id, paintKit: 90000 + id.length, name: name + tag, rarity: 'r_test', rarityName: 'Test', type, shader: 'v1', color: `${type}/${id}_color.jpg`, normal: `${type}/${id}_normal.png`,
    orm: `${type}/${id}_orm.png`, wear: `${type}/${id}_wear.png`, icon: `icons/${type}/${id}.webp`, wearRange: [0.06, 0.8], wearLook: { brightness: -0.3, saturation: -0.2, roughness: 1.1 }, cloth: true, roughMean: 0.5, metalMean: 0, fallback: '#336699' });
  const m = { version: 1, made: new Date().toISOString(), res: RES, source: { s2v: '0', pakSize: 1, pakMtime: 1 }, skeleton: { hash: g.hash, bones: BONES, from: 'arms-test.glb' },
    types: { sporty: { id: 'sporty', name: 'Test Gloves A', mesh: 'meshes/glove-sporty.glb', skeleton: g.hash, default: null, finishes: ['kit_a', 'kit_b'] },
             slick: { id: 'slick', name: 'Test Gloves B', mesh: 'meshes/glove-slick.glb', skeleton: g.hash, default: null, finishes: ['kit_c'] } },
    finishes: { kit_a: fin('kit_a', 'sporty', 'Alpha'), kit_b: fin('kit_b', 'sporty', 'Beta'), kit_c: fin('kit_c', 'slick', 'Gamma') } };
  const put = (rel, buf) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), buf); };
  put('meshes/glove-sporty.glb', g.buf); put('meshes/glove-slick.glb', g.buf);
  for (const f of Object.values(m.finishes)) { put(f.color, jpg(RES, RES)); put(f.normal, png(RES, RES)); put(f.orm, png(RES, RES)); put(f.wear, png(WEAR_RES, WEAR_RES)); put(f.icon, webp(ICON_W, ICON_H)); }
  if (bad === 'missing') rmSync(path.join(dir, m.finishes.kit_b.orm));
  if (bad === 'size') put(m.finishes.kit_a.color, jpg(RES * 2, RES));
  if (bad === 'escape') m.finishes.kit_a.normal = '../../etc/passwd';
  if (bad === 'absolute') m.finishes.kit_a.icon = '/etc/hosts';
  if (bad === 'jpegnormal') put(m.finishes.kit_a.normal, jpg(RES, RES));
  if (bad === 'skeleton') put('meshes/glove-slick.glb', other.buf);
  if (bad === 'typeskel') m.types.slick.skeleton = other.hash;
  if (bad === 'list') m.types.slick.finishes.push('kit_a');
  if (bad === 'fallback') m.finishes.kit_c.fallback = 'red';
  if (bad === 'wear') m.finishes.kit_c.wearRange = [0.9, 0.1];
  if (bad === 'bones') put('meshes/glove-sporty.glb', fakeGlb(NAMES.slice(0, 40)).buf);
  writeFileSync(path.join(dir, MANIFEST), JSON.stringify(m)); return m;
}

// The manifest check.
{ const d = path.join(tmp, 'good'); const m = fakeBake(d); const v = validateManifest(d);
  ok(v.ok, 'a complete baked folder passes · ' + v.errors.join('; '));
  ok(v.counts.types === 2 && v.counts.finishes === 3 && v.files === 2 + 3 * 5, 'counts: 2 types, 3 finishes, 17 files');
  ok(manifestFiles(m).filter(f => f.kind === 'glb').every(f => f.skeleton === m.skeleton.hash), 'each mesh is checked against the skeleton hash');
  const cases = { missing: /missing/, size: /expected 64×64/, escape: /bad path/, absolute: /bad path/, jpegnormal: /jpeg, expected png/, skeleton: /skeleton hash/, typeskel: /not the arms skeleton/,
    list: /not one of its finishes/, fallback: /fallback/, wear: /wearRange/, bones: /40 bones/ };
  for (const [bad, re] of Object.entries(cases)) { const dd = path.join(tmp, 'bad-' + bad); fakeBake(dd, { bad }); const r = validateManifest(dd); ok(!r.ok && r.errors.some(e => re.test(e)), `refused: ${bad} · ${r.errors[0]}`); }
  ok(!validateManifest(path.join(tmp, 'nothing-here')).ok, 'no manifest: refused'); }

// The staging folder: never user-assets or anything inside it but gloves.new; foreign folders refused; real paths compared.
{ const A = path.join(tmp, 'ua-stage'); mkdirSync(path.join(A, 'skins'), { recursive: true }); const link = path.join(tmp, 'ua-link'); symlinkSync(A, link);
  ok(/user-assets folder itself/.test(stageProblem({ out: A, assets: A })) && /holds the user-assets/.test(stageProblem({ out: tmp, assets: A })), 'user-assets itself / an ancestor: refused');
  ok(/inside user-assets/.test(stageProblem({ out: path.join(A, 'gloves'), assets: A })) && /inside user-assets/.test(stageProblem({ out: path.join(link, 'x'), assets: A })), 'inside user-assets (also through a symlink): refused');
  ok(stageProblem({ out: path.join(A, 'gloves.new'), assets: A }) === null && stageProblem({ out: path.join(tmp, 'fresh'), assets: A }) === null, 'gloves.new and a new folder: allowed');
  const foreign = path.join(tmp, 'foreign'); mkdirSync(foreign); writeFileSync(path.join(foreign, 'thesis.docx'), 'x');
  ok(/did not make/.test(stageProblem({ out: foreign, assets: A })), 'a folder with other files: refused');
  claimStage(foreign); ok(stageProblem({ out: foreign, assets: A }) === null && existsSync(path.join(foreign, STAGE_MARK)), 'a folder carrying the tool\'s mark: allowed');
  // the tool itself refuses before it needs a CS2 install
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'import-cs2-gloves.mjs'), '--assets', A, '--out', path.join(A, 'gloves'), '--cs2', path.join(tmp, 'no-cs2')], { encoding: 'utf8' });
  ok(r.status !== 0 && /inside user-assets/.test(r.stderr) && !existsSync(path.join(A, 'gloves')), 'import-cs2-gloves.mjs --out user-assets/gloves: refused, nothing written · ' + r.stderr.trim().split('\n')[0]); }

// The install back-up rule on a fake user-assets folder.
{ const A = path.join(tmp, 'ua'); mkdirSync(path.join(A, 'fp-gloves'), { recursive: true }); mkdirSync(path.join(A, 'skins'), { recursive: true });
  writeFileSync(path.join(A, 'manifest.json'), '{"keep":true}'); writeFileSync(path.join(A, 'fp-gloves', 'arms-1.glb'), 'arms'); writeFileSync(path.join(A, 'skins', 'skins.json'), '{}');
  const before = Object.fromEntries(['manifest.json', 'fp-gloves/arms-1.glb', 'skins/skins.json'].map(f => [f, [readFileSync(path.join(A, f), 'utf8'), statSync(path.join(A, f)).mtimeMs]]));
  const at = (h, m) => new Date(2026, 10, 1, h, m);
  const b1 = path.join(tmp, 'b1'); fakeBake(b1, { tag: '1' }); const r1 = installGloves({ assets: A, from: b1, now: at(9, 0) });
  ok(!r1.backup && validateManifest(path.join(A, 'gloves')).ok && !existsSync(path.join(A, 'gloves.new')), 'first install: gloves/ made, no backup, no gloves.new left');
  ok(!existsSync(path.join(A, 'gloves', STAGE_MARK)), 'only the listed files are copied (no stage marker)');
  const r1b = installGloves({ assets: A, from: b1, now: at(9, 1) }); ok(r1b.unchanged && !readdirSync(A).some(n => n.startsWith('gloves.bak')), 'the same bake again: nothing changes, no backup used');
  for (const [i, t] of [[2, at(9, 5)], [3, at(9, 6)], [4, at(9, 6)]]) { const b = path.join(tmp, 'b' + i); fakeBake(b, { tag: String(i) }); installGloves({ assets: A, from: b, now: t }); }
  const baks = backupOrder(readdirSync(A));
  ok(baks.length === 2 && baks[0] === 'gloves.bak-20261101-0906-2' && baks[1] === 'gloves.bak-20261101-0906', 'backups: the 2 newest kept (same minute numbered) · ' + baks.join(','));
  ok(JSON.parse(readFileSync(path.join(A, 'gloves', MANIFEST), 'utf8')).finishes.kit_a.name === 'Alpha4' && JSON.parse(readFileSync(path.join(A, baks[0], MANIFEST), 'utf8')).finishes.kit_a.name === 'Alpha3', 'the newest bake installed; the one before it in the newest backup');
  ok(Object.entries(before).every(([f, [s, t]]) => readFileSync(path.join(A, f), 'utf8') === s && statSync(path.join(A, f)).mtimeMs === t), 'every other file in user-assets left as it was (content and time)');
  ok(readdirSync(A).sort().join() === ['fp-gloves', 'gloves', ...baks, 'manifest.json', 'skins'].sort().join(), 'nothing else appears in user-assets');
  mkdirSync(path.join(A, 'gloves.new')); const b5 = path.join(tmp, 'b5'); fakeBake(b5, { tag: '5' });
  assert.throws(() => installGloves({ assets: A, from: b5 }), /left from an earlier run/); n++;
  rmSync(path.join(A, 'gloves.new'), { recursive: true }); const bb = path.join(tmp, 'bbad'); fakeBake(bb, { bad: 'missing' });
  assert.throws(() => installGloves({ assets: A, from: bb }), /does not pass the check/); n++;
  ok(JSON.parse(readFileSync(path.join(A, 'gloves', MANIFEST), 'utf8')).finishes.kit_a.name === 'Alpha4', 'a refused install leaves the installed gloves alone'); }

// The docs describe the format the runtime track reads.
{ const doc = readFileSync(path.join(root, 'docs', 'GD-GLOVES-IMPORT.md'), 'utf8');
  ok(['gloves.json', 'skeleton', 'wearRange', 'fallback', 'orm', 'normal', 'wearLook', '--install', 'gloves.bak-'].every(k => doc.includes(k)), 'docs/GD-GLOVES-IMPORT.md documents the manifest and the install');
  ok(TYPE_ORDER[0] === 'sporty' && TYPE_ORDER.length === 8, 'eight glove types, Sport Gloves first'); }
console.log(`PASS part 1 · ${n} checks (synthetic)`);

// ---- Part 2: a real bake from this computer's CS2 install
const CS2 = path.join(os.homedir(), 'CS2-extract'), VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk');
const R = '/Applications/Blender.app/Contents/Resources'; let PY = null;
if (existsSync(R)) for (const v of readdirSync(R).filter(x => /^\d/.test(x)).sort().reverse()) { const bin = path.join(R, v, 'python', 'bin'); if (existsSync(bin)) { const p = readdirSync(bin).find(x => /^python3\.\d+$/.test(x)); if (p) { PY = path.join(bin, p); break; } } }
const armsDir = path.join(root, 'user-assets', 'fp-gloves'), arms = existsSync(armsDir) ? readdirSync(armsDir).filter(x => /^arms-[0-9a-f]+\.glb$/.test(x)).map(x => path.join(armsDir, x)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] : null;
if (process.env.CS2_GLOVES_PART1_ONLY || process.argv.includes('--part1')) { console.log('SKIP part 2 · part 1 only (--part1 or CS2_GLOVES_PART1_ONLY)'); rmSync(tmp, { recursive: true, force: true }); process.exit(0); }
if (!existsSync(VPK) || !PY || !arms) { console.log(`SKIP part 2 · needs ~/CS2-extract (${existsSync(VPK) ? 'ok' : 'missing'}), Blender's Python (${PY ? 'ok' : 'missing'}) and user-assets/fp-gloves/arms-*.glb (${arms ? 'ok' : 'missing'})`); rmSync(tmp, { recursive: true, force: true }); process.exit(0); }
let m2 = 0; const ok2 = (c, m) => { assert.ok(c, m); m2++; };
const out = path.join(tmp, 'stage'), work = process.env.CS2_GLOVES_WORK || undefined;
const KITS = ['sporty/sporty_purple', 'sporty/glove_sport_flames_orange'];   // one finish per CS2 glove shader generation (csgo_customglove, …_preview)
const args = [path.join(root, 'tools', 'import-cs2-gloves.mjs'), '--out', out, '--only', KITS.join(','), '--arms', arms, '--jobs', '2', ...(work ? ['--work', work] : [])];
const t0 = Date.now(); const log = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 16 << 20 });
const v = validateManifest(out), man = v.manifest;
ok2(v.ok, 'real bake passes the manifest check · ' + v.errors.join('; '));
ok2(Object.keys(man.finishes).sort().join() === KITS.map(k => k.split('/')[1]).sort().join() && man.types.sporty?.finishes.length === 2, 'the two finishes and the Sport Gloves type are listed');
ok2(man.types.sporty.name.length > 3 && Object.values(man.finishes).every(f => f.name && f.rarityName && /^#[0-9a-f]{6}$/.test(f.fallback) && f.icon), 'CS2 names, rarity, icon and a fallback colour per finish');
ok2(new Set(Object.values(man.finishes).map(f => f.shader)).size === 2, 'both glove shader generations baked');
for (const f of Object.values(man.finishes)) ok2(['color', 'normal', 'orm'].every(k => statSync(path.join(out, f[k])).size > 40000), `${f.id}: colour / normal / ORM hold real pictures (not blank)`);
// skeleton: bone by bone against the arms glb
const A = glbSkeleton(readFileSync(arms)), G = glbSkeleton(readFileSync(path.join(out, man.types.sporty.mesh)));
ok2(G.names.join() === A.names.join() && G.names.length === BONES, 'glove mesh bones = the arms glb bones, same order (52)');
ok2(skeletonDiff(G, A) < 1e-6, 'inverse bind matrices identical to the arms glb · max diff ' + skeletonDiff(G, A));
ok2(skeletonHash(G.names, G.ibm) === man.skeleton.hash && man.types.sporty.skeleton === man.skeleton.hash, 'skeleton hash in the manifest = the arms glb\'s');
const pyHash = execFileSync(PY, ['-I', '-B', '-c', `import sys; sys.path.insert(0, ${JSON.stringify(path.join(root, 'tools', 'cs2-gloves'))}); import export_mesh as e; n, i = e.arms_skeleton(${JSON.stringify(arms)}); print(e.skeleton_hash(n, i))`], { encoding: 'utf8' }).trim();
ok2(pyHash === man.skeleton.hash, 'Python (export_mesh.py) and JS skeleton hashes agree');
const GJ = G.json, meshNames = GJ.meshes.map(x => x.name).sort().join();
ok2(['glove_L', 'glove_R', 'skin'].every(k => meshNames.includes(k)) && GJ.meshes.every(x => x.primitives.every(p => ['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].every(a => a in p.attributes))), 'left / right first-person gloves + wrist, skinned, with tangents');
ok2(GJ.materials.some(x => x.extras?.part === 'skin' && x.extras?.shareWith) && GJ.materials.some(x => x.extras?.part === 'glove'), 'materials tagged glove / skin (the wrist shares the arms glb\'s skin material)');
ok2(GJ.meshes.filter(x => x.extras?.part === 'glove').every(x => x.primitives.every(p => { const a = GJ.accessors[p.attributes.TEXCOORD_0]; return a.min && a.min[0] >= -1e-4 && a.max[0] <= 1 + 1e-4; })), 'glove UVs moved into 0..1 (CS2 relies on the texture repeating; the export does not)');
const glbOf = id => readFileSync(path.join(out, man.types[id].mesh)); ok2(glbOf('sporty').subarray(0, 4).toString() === 'glTF', 'mesh is a binary glTF');
// install into a fake user-assets folder
const UA = path.join(tmp, 'ua2'); mkdirSync(UA); writeFileSync(path.join(UA, 'manifest.json'), '{}');
const r = installGloves({ assets: UA, from: out }); ok2(validateManifest(path.join(UA, 'gloves')).ok && !r.backup && readFileSync(path.join(UA, 'manifest.json'), 'utf8') === '{}', 'installs into a fake user-assets folder; nothing else touched');
console.log(`PASS part 2 · ${m2} checks (real bake of ${KITS.length} Sport Gloves finishes in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
rmSync(tmp, { recursive: true, force: true });
