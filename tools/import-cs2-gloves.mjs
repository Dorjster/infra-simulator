// Imports Counter-Strike 2's paintable gloves (the 8 glove types and every finish this install has icons for) from
// this computer's own CS2 install into the game's git-ignored user-assets/gloves/, ready for the runtime track (a
// glove picker, LAN, first- and third-person drawing). Valve's files stay on this computer and are never shipped;
// this tool and tools/cs2-gloves/ hold only logic.
//   node tools/import-cs2-gloves.mjs [--install] [options]
//     --cs2 <dir>      the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v)
//     --assets <dir>   the game's user-assets folder (default <repo>/user-assets; read: the arms glb of package V)
//     --arms <glb>     the first-person arms glb whose skeleton the gloves are bound to (default: user-assets'
//                      manifest models.fpGloves, else the newest user-assets/fp-gloves/arms-*.glb)
//     --out <dir>      where to bake (default <work>/stage). A full run deletes files there its manifest does not
//                      list, so it must be a new or empty folder, one this tool made, or user-assets/gloves.new;
//                      never inside user-assets otherwise (use --install)
//     --work <dir>     cache: catalogue, Source2Viewer exports, finished-bake records (default ~/Library/Caches/infra-cs2-gloves)
//     --only sporty,slick/slick_black,…   these glove types, or type/finish, only (partial runs keep the rest of --out)
//     --res 1024       bake size        --jobs N   parallel bake processes (default 2, each under nice -n 10)
//     --force          bake / export again although an earlier run's result is cached
//     --dry-run        print what would be made and an estimated size; writes nothing to --out or user-assets
//     --install        check the baked folder, then: user-assets/gloves → gloves.bak-YYYYMMDD-HHMM (the 2 newest
//                      backups are kept), the new folder → user-assets/gloves. Nothing else under user-assets is touched.
//     --python <Blender's python3>   (found in /Applications/Blender.app by default: numpy + OpenImageIO)
// Output (format: docs/GD-GLOVES-IMPORT.md): gloves.json, meshes/glove-<type>.glb (on the arms skeleton),
// <type>/<kit>_{color.jpg, normal.png, orm.png, wear.png}, icons/<type>/<kit>.webp.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createHash } from 'node:crypto';
import { validateManifest, installGloves, stageProblem, claimStage, glbSkeleton, skeletonHash, MANIFEST, STAGE_MARK, TYPE_ORDER, BONES } from './cs2-gloves/manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, '..'), PY = path.join(here, 'cs2-gloves');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }, flag = k => argv.includes(k);
const home = os.homedir(), CS2 = path.resolve(opt('--cs2', path.join(home, 'CS2-extract'))), ASSETS = path.resolve(opt('--assets', path.join(repo, 'user-assets')));
const WORK = path.resolve(opt('--work', process.platform === 'darwin' ? path.join(home, 'Library', 'Caches', 'infra-cs2-gloves') : path.join(home, '.cache', 'infra-cs2-gloves')));
const OUT = path.resolve(opt('--out', path.join(WORK, 'stage'))), RES = +opt('--res', 1024), JOBS = Math.max(1, Math.min(4, +opt('--jobs', 2)));
const ONLY = opt('--only') ? opt('--only').split(',').filter(Boolean) : null, DRY = flag('--dry-run'), FORCE = flag('--force'), INSTALL = flag('--install');
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
const die = s => { console.error(s); process.exit(1); };
if (!(RES >= 256 && RES <= 4096 && (RES & (RES - 1)) === 0)) die('--res must be a power of two (256-4096)');
{ const why = stageProblem({ out: OUT, assets: ASSETS }); if (why) die(why);
  const rw = path.resolve(WORK), ro = path.resolve(OUT); if (rw === ro || rw.startsWith(ro + path.sep)) die('--work must not be inside --out (a full run prunes --out)'); }

function findPython() {
  const p = opt('--python'); if (p) return p;
  const R = '/Applications/Blender.app/Contents/Resources';
  if (existsSync(R)) for (const v of readdirSync(R).filter(n => /^\d/.test(n)).sort().reverse()) {
    const bin = path.join(R, v, 'python', 'bin'); if (existsSync(bin)) { const py = readdirSync(bin).find(n => /^python3\.\d+$/.test(n)); if (py) return path.join(bin, py); }
  }
  return null;
}
const PYTHON = findPython();
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) die(`No ${what} at ${p} (--cs2 <dir>)`);
if (!PYTHON) die("No Blender Python found (it brings numpy + OpenImageIO): install Blender, or pass --python <Blender's python3>");

// the arms glb (package V) whose skeleton every glove is bound to
function findArms() {
  const a = opt('--arms'); if (a) return path.resolve(a);
  try { const m = JSON.parse(readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8')); const f = m.models?.fpGloves?.file; if (f && existsSync(path.join(ASSETS, f))) return path.join(ASSETS, f); } catch {}
  const d = path.join(ASSETS, 'fp-gloves'); if (!existsSync(d)) return null;
  const g = readdirSync(d).filter(n => /^arms-[0-9a-f]+\.glb$/.test(n)).map(n => path.join(d, n)).sort((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs); return g[0] || null;
}
const ARMS = findArms();
if (!ARMS || !existsSync(ARMS)) die('No first-person arms glb (user-assets/fp-gloves/arms-*.glb from tools/export-fp-gloves.py): run that first, or pass --arms <glb>');
const armsSk = glbSkeleton(readFileSync(ARMS)); if (!armsSk || armsSk.names.length !== BONES) die(`${ARMS}: not the ${BONES}-bone first-person arms skeleton`);
const ARMS_HASH = skeletonHash(armsSk.names, armsSk.ibm);

function run(cmd, args, { label = '', onResult = () => {}, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', cmd, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', CS2_SKINS_THREADS: '1' } }); let buf = '', err = '';
    c.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const ln = buf.slice(0, i); buf = buf.slice(i + 1); if (ln.startsWith('RESULT ')) onResult(JSON.parse(ln.slice(7))); else if (/^CATALOG/.test(ln) || !quiet) console.log('  ' + label + ' ' + ln); } });
    c.stderr.on('data', d => { err = (err + d).slice(-4000); });
    c.on('close', code => code === 0 ? resolve() : reject(Error(`${label || path.basename(cmd)} failed (${code}):\n${err}`)));
  });
}
async function pool(tasks, n) { const res = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); } })); return res; }
const sha = (...parts) => { const h = createHash('sha1'); for (const p of parts) h.update(typeof p === 'string' ? p : JSON.stringify(p)); return h.digest('hex').slice(0, 12); };
const codeHash = files => sha(...files.map(f => readFileSync(f)));

// ---- 1. catalogue (cached while the VPK and catalog.py are unchanged)
mkdirSync(WORK, { recursive: true });
const CAT = path.join(WORK, 'catalog.json'), pakStat = statSync(VPK);
let catalog = existsSync(CAT) ? JSON.parse(readFileSync(CAT, 'utf8')) : null;
if (FORCE || !catalog || catalog.pak?.size !== pakStat.size || Math.abs((catalog.pak?.mtime || 0) - pakStat.mtimeMs / 1000) > 1 || statSync(CAT).mtimeMs < statSync(path.join(PY, 'catalog.py')).mtimeMs) {
  console.log('Reading the CS2 install (items_game, names, glove materials)…'); const t = Date.now();
  await run(PYTHON, ['-I', '-B', path.join(PY, 'catalog.py'), VPK, S2V, WORK, CAT], { label: 'catalogue' });
  catalog = JSON.parse(readFileSync(CAT, 'utf8')); console.log(`  done in ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
let s2vVersion = '?'; try { s2vVersion = (execFileSync(S2V, ['--version'], { encoding: 'utf8' }).match(/Version:\s*([\d.]+)/) || [])[1] || '?'; } catch {}

// ---- 2. what to make
const types = TYPE_ORDER.filter(t => catalog.types[t]).concat(Object.keys(catalog.types).filter(t => !TYPE_ORDER.includes(t)));
const want = {};
for (const t of types) {
  const all = Object.keys(catalog.types[t].finishes).sort((a, b) => catalog.types[t].finishes[a].name.localeCompare(catalog.types[t].finishes[b].name));
  if (!ONLY) { want[t] = all; continue; }
  if (ONLY.includes(t)) want[t] = all;
  else { const kits = ONLY.filter(o => o.startsWith(t + '/')).map(o => o.slice(t.length + 1)).filter(k => all.includes(k)); if (kits.length) want[t] = kits; }
}
if (ONLY) { const known = new Set([...types, ...types.flatMap(t => Object.keys(catalog.types[t].finishes).map(k => t + '/' + k))]); const bad = ONLY.filter(o => !known.has(o)); if (bad.length) die('--only: unknown ' + bad.join(', ') + ' (types: ' + types.join(', ') + ')'); }
const nFin = Object.values(want).reduce((n, k) => n + k.length, 0), estMB = nFin * 3.9 * (RES / 1024) ** 2 + Object.keys(want).length * 1.0;
console.log(`To make at ${RES}²: ${Object.keys(want).length} glove types, ${nFin} finishes (${Object.entries(want).map(([t, k]) => t + ' ' + k.length).join(', ')}) — about ${estMB.toFixed(0)} MB`);
console.log(`  arms skeleton: ${path.relative(repo, ARMS)} (${ARMS_HASH.slice(0, 12)})`);
if (catalog.problems?.length) console.log('  not importable: ' + catalog.problems.join('; '));
if (DRY) { for (const [t, k] of Object.entries(want)) console.log(`  ${t} (${catalog.types[t].name}): ${k.map(x => catalog.types[t].finishes[x].name).join(', ')}`); process.exit(0); }
if (!nFin) die('Nothing to make.');

// ---- 3. meshes: Source2Viewer export (cached) -> glove glb on the arms skeleton + the UV coverage mask
claimStage(OUT);
const MESH_V = codeHash([path.join(PY, 'export_mesh.py'), path.join(PY, 'glb.py')]) + ARMS_HASH.slice(0, 8);
const meshes = {}, maskHash = {};   // (a finish's bake depends on its type's UV coverage mask: a changed mask re-bakes that type)
await pool(Object.keys(want).map(t => async () => {
  const src = path.join(WORK, 's2v', `${t}.glb`), outGlb = path.join(OUT, 'meshes', `glove-${t}.glb`), mask = path.join(WORK, 'mask', `${t}_${RES}.png`), rec = path.join(WORK, 'mask', `${t}_${RES}.json`);
  if (FORCE || !existsSync(src)) {
    mkdirSync(path.dirname(src), { recursive: true });
    await run(S2V, ['-i', VPK, '-f', catalog.types[t].model, '-o', src, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials', '--gltf_export_animations', '--gltf_animation_list', '__none__'], { label: 's2v ' + t });
    if (!existsSync(src)) throw Error(`Source2Viewer wrote no ${src}`);
  }
  let r = null; try { r = JSON.parse(readFileSync(rec, 'utf8')); } catch {}
  if (FORCE || !r || r.v !== MESH_V || !existsSync(outGlb) || !existsSync(mask)) {
    const job = path.join(WORK, 'jobs', `mesh-${t}-${sha(OUT)}.json`); mkdirSync(path.dirname(job), { recursive: true }); mkdirSync(path.dirname(mask), { recursive: true });
    writeFileSync(job, JSON.stringify({ src_glb: src, arms_glb: ARMS, out_glb: outGlb, out_mask: mask, res: RES, type: t }));
    await run(PYTHON, ['-I', '-B', path.join(PY, 'export_mesh.py'), job], { label: 'mesh ' + t, onResult: x => { r = { ...x, v: MESH_V }; } });
    writeFileSync(rec, JSON.stringify(r));
  }
  if (r.skeleton !== ARMS_HASH) throw Error(`${t}: glove skeleton ${r.skeleton} is not the arms skeleton ${ARMS_HASH}`);
  meshes[t] = r; maskHash[t] = sha(readFileSync(mask)); console.log(`  mesh ${t}: ${(r.bytes / 1024).toFixed(0)} KB, ${Object.entries(r.meshes).map(([k, m]) => k + ' ' + m.tris).join(', ')} tris, re-bind ≤ ${r.maxRebind}`);
}), JOBS);

// ---- 4. bakes (one process per glove type; finished bakes reused while the bake code and the finish's inputs are unchanged)
const BAKE_V = codeHash(['bake.py', 'tex.py'].map(f => path.join(PY, f)).concat(['vtex.py', 'imglib.py', 'vpk.py'].map(f => path.join(here, 'cs2-skins', f))));
const BAKE_V2 = codeHash([path.join(PY, 'bake_v2.py')]);   // (the newer shader's own code: changing it re-bakes only those finishes)
const bakeVersion = f => BAKE_V + (/preview/.test(f.shader) ? BAKE_V2 : '');
const CACHE = path.join(WORK, 'done'), results = {}; let reused = 0;
const files = (t, k) => ['color.jpg', 'normal.png', 'orm.png', 'wear.png'].map(s => path.join(OUT, t, `${k}_${s}`)).concat([path.join(OUT, 'icons', t, k + '.webp')]);
const tasks = [];
for (const [t, kits] of Object.entries(want)) {
  const left = [];
  for (const k of kits) {
    const f = catalog.types[t].finishes[k], v = bakeVersion(f) + sha(f, RES) + maskHash[t], side = path.join(CACHE, `${t}_${k}_${RES}.json`);
    let r = null; try { r = JSON.parse(readFileSync(side, 'utf8')); } catch {}
    if (!FORCE && r?.ok && r.v === v && files(t, k).slice(0, 4).every(existsSync)) { (results[t] ||= {})[k] = r; reused++; } else left.push({ ...f, _v: v });
  }
  if (left.length) tasks.push({ t, left });
}
if (reused) console.log(`  ${reused} finishes baked earlier (kept; --force bakes them again)`);
let done = 0; const total = tasks.reduce((n, x) => n + x.left.length, 0), t0 = Date.now(), failed = [];
if (total) console.log(`Baking ${total} finishes with ${JOBS} worker(s)…`);
tasks.sort((a, b) => b.left.length - a.left.length);
await pool(tasks.map(({ t, left }) => async () => {
  // one job per finish group: the record's version is the finish's own (bake code + its inputs)
  const job = path.join(WORK, 'jobs', `bake-${t}-${sha(OUT)}.json`);   // (per staging folder: two runs never share a job file)
  writeFileSync(job, JSON.stringify({ vpk: VPK, type: t, res: RES, out: OUT, mask: path.join(WORK, 'mask', `${t}_${RES}.png`), cache: null, finishes: left }));
  await run(PYTHON, ['-I', '-B', path.join(PY, 'bake.py'), job], { label: 'bake ' + t, onResult: r => {
    done++; const f = left.find(x => x.kit === r.kit);
    if (r.ok) { r.v = f._v; (results[t] ||= {})[r.kit] = r; mkdirSync(CACHE, { recursive: true }); writeFileSync(path.join(CACHE, `${t}_${r.kit}_${RES}.json`), JSON.stringify(r)); }
    else failed.push(`${t}/${r.kit}: ${r.error}`);
    const el = (Date.now() - t0) / 1000; process.stdout.write(`\r  ${done}/${total} · ${el.toFixed(0)} s · ~${((total - done) * el / Math.max(done, 1)).toFixed(0)} s left   `);
  } });
}), JOBS);
if (total) console.log('');
if (failed.length) console.warn('  failed: ' + failed.join('\n          '));

// ---- 5. manifest (docs/GD-GLOVES-IMPORT.md)
const rel = p => path.relative(OUT, p).split(path.sep).join('/');
const prev = (() => { try { return JSON.parse(readFileSync(path.join(OUT, MANIFEST), 'utf8')); } catch { return null; } })();
const man = { version: 1, made: new Date().toISOString(), res: RES, source: { s2v: s2vVersion, pakSize: pakStat.size, pakMtime: Math.round(pakStat.mtimeMs / 1000) },
  skeleton: { hash: ARMS_HASH, bones: BONES, from: path.basename(ARMS) }, types: {}, finishes: {} };
// a partial run keeps the earlier manifest's other types / finishes (their files stay in --out)
if (ONLY && prev?.version === 1 && prev.skeleton?.hash === ARMS_HASH) { Object.assign(man.types, prev.types); Object.assign(man.finishes, prev.finishes); }
for (const t of types) {
  if (!want[t] && !man.types[t]) continue;
  const c = catalog.types[t], m = meshes[t] || null;
  if (want[t]) {
    for (const k of want[t]) {
      const r = results[t]?.[k]; if (!r?.ok) continue; const f = c.finishes[k]; const [color, normal, orm, wear, icon] = files(t, k);
      man.finishes[k] = { id: k, paintKit: f.id, name: f.name, rarity: f.rarity, rarityName: f.rarityName, type: t, shader: /preview/.test(f.shader) ? 'v2' : 'v1',
        color: rel(color), normal: rel(normal), orm: rel(orm), wear: rel(wear), ...(existsSync(icon) ? { icon: rel(icon) } : {}),
        wearRange: f.wear, wearLook: r.wearLook, cloth: !!r.cloth, roughMean: r.roughMean, metalMean: r.metalMean, fallback: r.fallback };
    }
    const fin = Object.keys(man.finishes).filter(k => man.finishes[k].type === t).sort((a, b) => man.finishes[a].name.localeCompare(man.finishes[b].name));
    man.types[t] = { id: t, name: c.name, item: c.item, defindex: c.defindex, mesh: `meshes/glove-${t}.glb`, skeleton: m ? m.skeleton : man.types[t]?.skeleton,
      meshes: m ? m.meshes : man.types[t]?.meshes, default: null, finishes: fin };
  }
}
// order: CS2's glove list order (Sport Gloves first)
man.types = Object.fromEntries(types.filter(t => man.types[t]).map(t => [t, man.types[t]]));
writeFileSync(path.join(OUT, MANIFEST + '.tmp'), JSON.stringify(man, null, 1));
const listed = new Set([MANIFEST]);
for (const t of Object.values(man.types)) listed.add(t.mesh);
for (const f of Object.values(man.finishes)) for (const k of ['color', 'normal', 'orm', 'wear', 'icon']) if (f[k]) listed.add(f[k]);
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
let pruned = 0; if (!ONLY) for (const f of walk(OUT)) { const r = rel(f); if (r === MANIFEST + '.tmp' || r === STAGE_MARK) continue; if (!listed.has(r)) { rmSync(f); pruned++; } }
writeFileSync(path.join(OUT, MANIFEST), readFileSync(path.join(OUT, MANIFEST + '.tmp'))); rmSync(path.join(OUT, MANIFEST + '.tmp'));
const v = validateManifest(OUT);
console.log(`→ ${OUT}: ${v.counts?.types} glove types, ${v.counts?.finishes} finishes, ${v.files} files, ${(v.bytes / 1048576).toFixed(0)} MB${pruned ? `, ${pruned} stale files removed` : ''}`);
if (!v.ok) die('The baked folder does not pass the check:\n  ' + v.errors.join('\n  '));
if (failed.length) die(`${failed.length} finishes failed: not installing.`);

// ---- 6. install (back-up rule)
if (INSTALL) {
  const r = installGloves({ assets: ASSETS, from: OUT, log: s => console.log('  ' + s) });
  console.log(r.unchanged ? `→ ${r.installed} already holds this bake: nothing changed.` : `→ installed ${r.installed}${r.backup ? ` (previous gloves kept in ${path.basename(r.backup)})` : ''}.`);
} else console.log('Check it, then run again with --install (nothing was written to user-assets).');
