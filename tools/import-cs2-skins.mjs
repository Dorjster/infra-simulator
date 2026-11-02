// Imports Counter-Strike 2 weapon finishes (skins) from this computer's own CS2 install into the game's git-ignored
// user-assets/skins/, which the room serves to every player (a Windows peer without CS2 gets the host's finishes).
// Valve's files: they stay on this computer and are never shipped; this tool and tools/cs2-skins/ hold only logic.
//   node tools/import-cs2-skins.mjs [--install] [options]
//     --cs2 <dir>        the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v, export/weapons)
//     --assets <dir>     the game's user-assets folder (default <repo>/user-assets)
//     --out <dir>        where to bake (default <work>/stage); --install then copies it in as user-assets/skins. A full
//                        run deletes files there that the manifest does not list, so it must be a new or empty folder,
//                        one this tool made (marked .cs2-skins-stage), or user-assets/skins.new; never user-assets itself
//     --work <dir>       cache: catalogue, legacy lookups, finished-bake records (default ~/Library/Caches/infra-cs2-skins)
//     --set curated|all  curated (default): every knife family on the four star knives + per gun the 12 best known
//                        finishes (rarest first) + the check list; all: every importable finish
//     --only ak,karambit,…   these weapons / knives only      --kits cu_ak47_cobra,aa_fade,…   these finishes only
//     --styles +3,+6,-7  add / drop paint styles (default: spray 3, airbrush 6 and 10 left out, except the knife Fade)
//     --top N            curated finishes per gun (default 12)   --res 1024   --fp2k (2048² star-knife bakes too)
//     --jobs N           parallel bake processes (default 2, each under nice -n 10)   --force (re-bake finished ones)
//     --dry-run          print what would be baked and an estimated size; bakes nothing and writes nothing to --out or
//                        user-assets (it may read the CS2 install into the --work cache: catalog.json, models.json)
//     --install          check the baked folder, then: user-assets/skins → skins.bak-YYYYMMDD-HHMM (the 2 newest
//                        backups are kept), the new folder → user-assets/skins. Nothing else under user-assets is touched.
//     --blender <exe>  --python <Blender's python3>   (found in /Applications/Blender.app or PATH by default)
// What is baked, per (model, finish), in the model's first-person UV0: <model>/<kit>_paint.jpg (albedo) and
// <model>/<kit>_mrw.png (R metal, G rough, B wear rank, A paint coverage); CS2's own star-knife base maps
// (base/<knife>_color.jpg, _orm.jpg), the shared grunge texture, and 192×144 picker icons from CS2's econ images.
// The manifest is skins.json (format: docs/GD-SKINS-IMPORT.md). Legacy finishes (Redline, Asiimov, Printstream…) are
// painted by CS2 on the old body_legacy mesh; a per-gun lookup baked in Blender moves them onto the HD mesh the game draws.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODELS, CHECK_KITS, FAMILY_FB } from './cs2-skins/models.mjs';
import { validateManifest, installSkins, fbIdFor, stageProblem, claimStage, MANIFEST, STAGE_MARK, ICON_W, ICON_H, KNIFE_MODELS } from './cs2-skins/manifest.mjs';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, '..'), PY = path.join(here, 'cs2-skins');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }, flag = k => argv.includes(k);
const home = os.homedir(), CS2 = path.resolve(opt('--cs2', path.join(home, 'CS2-extract'))), ASSETS = path.resolve(opt('--assets', path.join(repo, 'user-assets')));
const WORK = path.resolve(opt('--work', process.platform === 'darwin' ? path.join(home, 'Library', 'Caches', 'infra-cs2-skins') : path.join(home, '.cache', 'infra-cs2-skins')));
const OUT = path.resolve(opt('--out', path.join(WORK, 'stage'))), RES = +opt('--res', 1024), JOBS = Math.max(1, Math.min(4, +opt('--jobs', 2))), TOP = +opt('--top', 12);
const SET = opt('--set', 'curated'), ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null, KITS = opt('--kits') ? new Set(opt('--kits').split(',')) : null;
const DRY = flag('--dry-run'), FORCE = flag('--force'), INSTALL = flag('--install'), FP2K = flag('--fp2k');
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI'), EXPORT = path.join(CS2, 'export', 'weapons');
const die = s => { console.error(s); process.exit(1); };
if (!['curated', 'all'].includes(SET)) die('--set curated|all');
// --out: a folder this tool owns (it prunes it); checked by real path before anything is written anywhere
{ const why = stageProblem({ out: OUT, assets: ASSETS, knownModels: Object.keys(MODELS) }); if (why) die(why);
  const rw = path.resolve(WORK), ro = path.resolve(OUT); if (rw === ro || rw.startsWith(ro + path.sep)) die('--work must not be inside --out (a full run prunes --out)'); }

// paint styles (items_game numbering): left out by default 3 spray + 6 anodized airbrush (their projection is calibrated
// only for the knife Fade) and 10; --styles +N / -N changes that
const STYLES_OUT = new Set([3, 6, 10]);
for (const s of (opt('--styles', '') || '').split(',').filter(Boolean)) { const n = +s.slice(1); if (s[0] === '+') STYLES_OUT.delete(n); else if (s[0] === '-') STYLES_OUT.add(n); }
const KEEP_ALWAYS = new Set(['aa_fade']);   // knife Fade: checked per knife on the import sheet

function findPython() {
  const p = opt('--python'); if (p) return p;
  const R = '/Applications/Blender.app/Contents/Resources';
  if (existsSync(R)) for (const v of readdirSync(R).filter(n => /^\d/.test(n)).sort().reverse()) {
    const bin = path.join(R, v, 'python', 'bin'); if (existsSync(bin)) { const py = readdirSync(bin).find(n => /^python3\.\d+$/.test(n)); if (py) return path.join(bin, py); }
  }
  return null;
}
function findBlender() {
  const b = opt('--blender'); if (b) return b;
  if (existsSync('/Applications/Blender.app/Contents/MacOS/Blender')) return '/Applications/Blender.app/Contents/MacOS/Blender';
  try { return execFileSync('which', ['blender'], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}
const PYTHON = findPython(), BLENDER = findBlender();
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) die(`No ${what} at ${p} (--cs2 <dir>)`);
if (!PYTHON) die("No Blender Python found (it brings numpy + OpenImageIO): install Blender, or pass --python <Blender's python3>");

// ---- run a child process (args as a list, no shell), under nice; collect "RESULT {json}" lines
function run(cmd, args, { label = '', onResult = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', cmd, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', CS2_SKINS_THREADS: '1' } }); let buf = '', err = '';
    c.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const ln = buf.slice(0, i); buf = buf.slice(i + 1); if (ln.startsWith('RESULT ')) onResult(JSON.parse(ln.slice(7))); else if (/^(LUT|CATALOG)/.test(ln)) console.log('  ' + label + ' ' + ln); } });
    c.stderr.on('data', d => { err = (err + d).slice(-4000); });
    c.on('close', code => code === 0 ? resolve() : reject(Error(`${label || path.basename(args[0] || cmd)} failed (${code}):\n${err}`)));
  });
}
async function pool(tasks, n) { const res = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); } })); return res; }

// ---- 1. catalogue (read fresh from the install; cached in the work folder while the VPK is unchanged)
mkdirSync(WORK, { recursive: true });
const models = Object.fromEntries(Object.entries(MODELS).filter(([gid]) => !ONLY || ONLY.has(gid)));
if (!Object.keys(models).length) die('--only matches no weapon: ' + [...ONLY].join(','));
writeFileSync(path.join(WORK, 'models.json'), JSON.stringify(MODELS));
const CAT = path.join(WORK, 'catalog.json'), pakStat = statSync(VPK);
let catalog = existsSync(CAT) ? JSON.parse(readFileSync(CAT, 'utf8')) : null;
if (!catalog || catalog.pak?.size !== pakStat.size || Math.abs((catalog.pak?.mtime || 0) - pakStat.mtimeMs / 1000) > 1 || statSync(CAT).mtimeMs < statSync(path.join(PY, 'catalog.py')).mtimeMs) {
  console.log('Reading the CS2 install (items_game, names, paint materials)…'); const t = Date.now();
  await run(PYTHON, ['-I', '-B', path.join(PY, 'catalog.py'), VPK, S2V, WORK, CAT, path.join(WORK, 'models.json')], { label: 'catalogue' });
  catalog = JSON.parse(readFileSync(CAT, 'utf8')); console.log(`  done in ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
let s2vVersion = '?'; try { s2vVersion = (execFileSync(S2V, ['--version'], { encoding: 'utf8' }).match(/Version:\s*([\d.]+)/) || [])[1] || '?'; } catch {}

// ---- 2. what to bake
const allowed = (e, knife = false) => (knife && KEEP_ALWAYS.has(e.family)) || !STYLES_OUT.has(e.style);
const plan = { guns: {}, knives: {} };
for (const [gid, g] of Object.entries(catalog.weapons)) {
  if (!models[gid]) continue;
  let fins = Object.values(g.finishes).filter(e => (!KITS || KITS.has(e.kit)) && (KITS || allowed(e)));
  if (SET === 'curated' && !KITS) {
    const must = new Set(CHECK_KITS[gid] || []);
    const ranked = fins.filter(e => !must.has(e.kit)).sort((a, b) => b.rarityValue - a.rarityValue || ([7, 9].includes(b.style) - [7, 9].includes(a.style)) || (+b.id || 0) - (+a.id || 0));
    const base = e => e.name.replace(/ Phase \d$| \((Ruby|Sapphire|Emerald|Black Pearl)\)$/, ''), seen = new Set(fins.filter(e => must.has(e.kit)).map(base));
    const one = ranked.filter(e => !seen.has(base(e)) && seen.add(base(e)));   // one of each finish (not four Gamma Doppler phases)
    fins = [...fins.filter(e => must.has(e.kit)), ...one.slice(0, Math.max(0, TOP - must.size))];
  }
  if (fins.some(e => e.legacy) && !existsSync(path.join(EXPORT, g.model + '.glb'))) { console.warn(`  ${gid}: no ${g.model}.glb in ${EXPORT}: its legacy finishes are skipped`); fins = fins.filter(e => !e.legacy); }
  if (fins.length) plan.guns[gid] = fins;
}
for (const [kn, k] of Object.entries(catalog.knives)) {
  if (!models[kn]) continue;
  const fins = Object.values(k.finishes).filter(e => (!KITS || KITS.has(e.kit) || KITS.has(e.family)) && (KITS || allowed(e, true)));
  if (fins.length) plan.knives[kn] = fins;
}
const nGun = Object.values(plan.guns).reduce((n, f) => n + f.length, 0), nKnife = Object.values(plan.knives).reduce((n, f) => n + f.length, 0);
const legacyGuns = Object.entries(plan.guns).filter(([, f]) => f.some(e => e.legacy)).map(([g]) => g);
const perFinishMB = 1.1 * (RES / 1024) ** 2, estMB = (nGun + nKnife) * perFinishMB + (FP2K ? nKnife * perFinishMB * 4 : 0) + Object.keys(plan.knives).length * 0.4 + (nGun + nKnife) * 0.01 + 1;
console.log(`To bake at ${RES}²: ${nKnife} knife finishes (${Object.entries(plan.knives).map(([k, f]) => k + ' ' + f.length).join(', ')}), ${nGun} gun finishes on ${Object.keys(plan.guns).length} guns (${legacyGuns.length} need a legacy lookup) — about ${estMB.toFixed(0)} MB`);
if (catalog.problems?.length) console.log('  not importable: ' + catalog.problems.join('; '));
if (DRY) { for (const [g, f] of Object.entries(plan.guns)) console.log(`  ${g}: ${f.map(e => e.kit).join(' ')}`); process.exit(0); }
if (!nGun && !nKnife) die('Nothing to bake.');

// ---- 3. legacy lookups (Blender, once per gun and resolution)
const LUT = path.join(WORK, 'lut'); mkdirSync(LUT, { recursive: true });
const LUT_VERSION = 4;   // (bump when legacy_lookup.py changes: 3 = hidden legacy layers skipped, 2026-11-01; 4 = 'plain' texels: scope lenses, the SSG 08's scope, 2026-11-02)
const lutOf = gid => path.join(LUT, `${gid}_${RES}_v${LUT_VERSION}.npz`);
// finished bakes are reused only when they were made by this bake code (bake.py and what it imports) and this lookup
const BAKE_VERSION = (() => { const h = createHash('sha1'); for (const f of ['bake.py', 'imglib.py', 'transfer.py', 'vtex.py', 'vpk.py']) h.update(f).update(readFileSync(path.join(PY, f))); return h.update('lut' + LUT_VERSION).digest('hex').slice(0, 12); })();
const needLut = legacyGuns.filter(g => FORCE || !existsSync(lutOf(g)));
if (needLut.length) {
  if (!BLENDER) die('Legacy finishes need Blender (legacy lookup): install it or pass --blender, or --kits without legacy finishes');
  console.log(`Legacy lookups for ${needLut.join(', ')}…`);
  await pool(needLut.map(g => () => run(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(PY, 'legacy_lookup.py'), '--', path.join(EXPORT, catalog.weapons[g].model + '.glb'), lutOf(g), String(RES)], { label: g })), JOBS);
}

// ---- 4. bakes: one process per model (guns, then knives at RES, then optional 2048² star knives)
claimStage(OUT);
const results = {}, CACHE = path.join(WORK, 'done');
const jobFile = (name, j) => { const f = path.join(WORK, 'jobs', name + '.json'); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(j)); return f; };
const tasks = [];
const common = { vpk: VPK, root: OUT, cache: CACHE, wear_tex: catalog.shared.wear, force: FORCE, bake_version: BAKE_VERSION };
for (const [gid, fins] of Object.entries(plan.guns)) {
  const g = catalog.weapons[gid], lut = fins.some(e => e.legacy) ? lutOf(gid) : null;
  tasks.push({ key: gid, res: RES, job: { ...common, res: RES, kind: 'gun', model: gid, out: path.join(OUT, gid), composite: g.composite, legacy_composite: g.legacy, lut, finishes: fins } });
}
for (const [kn, fins] of Object.entries(plan.knives)) {
  const k = catalog.knives[kn];
  tasks.push({ key: kn, res: RES, job: { ...common, res: RES, kind: 'knife', model: kn, out: path.join(OUT, kn), composite: k.composite, base: k.base, finishes: fins } });
  if (FP2K) tasks.push({ key: kn, res: RES * 2, job: { ...common, res: RES * 2, kind: 'knife', model: kn, out: path.join(OUT, kn), composite: k.composite, finishes: fins, suffix: '2k' } });
}
// bigger jobs first so the two workers finish together
tasks.sort((a, b) => b.job.finishes.length * b.res ** 2 - a.job.finishes.length * a.res ** 2);
let done = 0; const total = tasks.reduce((n, t) => n + t.job.finishes.length, 0), t0 = Date.now(), failed = [];
console.log(`Baking ${total} finishes with ${JOBS} worker(s)…`);
// finishes baked by an earlier run (outputs + their record) are read back, not re-run
for (const t of tasks) {
  if (FORCE) continue; const sfx = t.job.suffix || '';
  const left = t.job.finishes.filter(e => { const side = path.join(CACHE, `${t.job.model}_${e.kit}_${t.res}.json`);
    if (!existsSync(side) || !existsSync(path.join(t.job.out, `${e.kit}_paint${sfx}.jpg`)) || !existsSync(path.join(t.job.out, `${e.kit}_mrw${sfx}.png`))) return true;
    let r; try { r = JSON.parse(readFileSync(side, 'utf8')); } catch { return true; }
    if (r.v !== BAKE_VERSION) return true;   // (made by older bake code: baked again)
    (results[t.key] ||= {})[e.kit + (t.res !== RES ? '@2k' : '')] = r; done++; return false; });
  const baseV = path.join(OUT, 'base', `.${t.job.model}.v`);
  const baseOk = !t.job.base || (['color', 'orm'].every(k => existsSync(path.join(OUT, 'base', `${t.job.model}_${k}.jpg`))) && existsSync(baseV) && readFileSync(baseV, 'utf8') === BAKE_VERSION);
  if (t.job.base && !baseOk) t.job.base_force = true;
  t.job.finishes = left; t.skip = !left.length && baseOk;
}
if (done) console.log(`  ${done} finished earlier (kept; --force bakes them again)`);
await pool(tasks.filter(t => !t.skip).map(t => () => run(PYTHON, ['-I', '-B', path.join(PY, 'bake.py'), jobFile(`${t.key}_${t.res}`, t.job)], { label: t.key, onResult: r => {
  if (r.base) return;
  done++; (results[t.key] ||= {})[r.kit + (t.res !== RES ? '@2k' : '')] = r;
  if (!r.ok) failed.push(`${t.key}/${r.kit}: ${r.error}`);
  if (done % 10 === 0 || done === total) process.stdout.write(`  ${done}/${total} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
} })), JOBS);
if (failed.length) console.warn(`  ${failed.length} finishes failed (left out):\n    ` + failed.slice(0, 20).join('\n    '));

// ---- 5. icons + shared grunge
const icons = [], iconRel = (model, kit) => `icons/${model}_${kit}.webp`;
for (const [gid, fins] of Object.entries(plan.guns)) for (const e of fins) if (e.icon && results[gid]?.[e.kit]?.ok) icons.push({ src: e.icon, out: path.join(OUT, iconRel(gid, e.kit)), w: ICON_W, h: ICON_H });
for (const [kn, fins] of Object.entries(plan.knives)) for (const e of fins) if (e.icon && results[kn]?.[e.kit]?.ok) icons.push({ src: e.icon, out: path.join(OUT, iconRel(kn, e.kit)), w: ICON_W, h: ICON_H });
const extras = [...icons, ...(catalog.shared.grunge ? [{ src: catalog.shared.grunge, out: path.join(OUT, 'shared', 'grunge.jpg'), w: 1024, h: 1024 }] : [])];
const extraOk = new Set();
console.log(`Icons and shared textures (${extras.length})…`);
await run(PYTHON, ['-I', '-B', path.join(PY, 'extras.py'), jobFile('extras', { vpk: VPK, items: extras, force: FORCE })], { label: 'icons', onResult: r => { if (r.ok) extraOk.add(path.resolve(r.out)); else console.warn('  icon: ' + r.error); } });

// ---- 6. manifest (§3.4 of the plan; docs/GD-SKINS-IMPORT.md)
const builtins = (await import(pathToFileURL(path.join(repo, 'dist', 'skins.js')).href).catch(() => ({}))).FINISHES || {};
const rel = p => path.relative(OUT, p).split(path.sep).join('/');
const has = p => existsSync(p) && (extraOk.has(path.resolve(p)) || !p.includes(`${path.sep}icons${path.sep}`));
const pearl = e => +(e.params?.g_flPearlescentScale || 0) || 0;
const man = { version: 1, made: new Date().toISOString(), res: RES, source: { s2v: s2vVersion, pakSize: pakStat.size, pakMtime: Math.round(pakStat.mtimeMs / 1000) },
  shared: has(path.join(OUT, 'shared', 'grunge.jpg')) ? { grunge: 'shared/grunge.jpg' } : {}, base: {}, weapons: {}, knives: {} };
for (const [gid, fins] of Object.entries(plan.guns)) {
  const g = catalog.weapons[gid], finishes = {};
  for (const e of fins) {
    const r = results[gid]?.[e.kit]; if (!r?.ok) continue;
    const ic = path.join(OUT, iconRel(gid, e.kit));
    finishes[e.kit] = { name: e.name, rarity: e.rarityName, style: e.style, wear: e.wear, legacy: !!e.legacy, pearl: pearl(e),
      paint: `${gid}/${e.kit}_paint.jpg`, mrw: `${gid}/${e.kit}_mrw.png`, ...(has(ic) ? { icon: rel(ic) } : {}), fbId: fbIdFor({ style: e.style, pal: r.pal, accent: r.accent }, builtins) };
  }
  if (Object.keys(finishes).length) man.weapons[gid] = { model: 'cs2_' + gid, uv: 0, len: g.composite.len, finishes };
}
for (const [kn, fins] of Object.entries(plan.knives)) {
  if (existsSync(path.join(OUT, 'base', `${kn}_color.jpg`)) && existsSync(path.join(OUT, 'base', `${kn}_orm.jpg`))) man.base[kn] = { color: `base/${kn}_color.jpg`, orm: `base/${kn}_orm.jpg` };
  for (const e of fins) {
    const r = results[kn]?.[e.kit]; if (!r?.ok) continue;
    const f = man.knives[e.family] ||= { name: e.name, rarity: e.rarityName, style: e.style, wear: e.wear, pearl: pearl(e), models: {}, icon: {},
      fbId: fbIdFor({ style: e.style, pal: r.pal, accent: r.accent, family: e.family }, builtins, FAMILY_FB) };
    const m = f.models[kn] = { kit: e.kit, paint: `${kn}/${e.kit}_paint.jpg`, mrw: `${kn}/${e.kit}_mrw.png` };
    if (FP2K && results[kn]?.[e.kit + '@2k']?.ok) Object.assign(m, { paint2k: `${kn}/${e.kit}_paint2k.jpg`, mrw2k: `${kn}/${e.kit}_mrw2k.png` });
    const ic = path.join(OUT, iconRel(kn, e.kit)); if (has(ic)) f.icon[kn] = rel(ic);
  }
}
// order knife models as the game lists them
for (const f of Object.values(man.knives)) f.models = Object.fromEntries(KNIFE_MODELS.filter(k => f.models[k]).map(k => [k, f.models[k]]));
writeFileSync(path.join(OUT, MANIFEST + '.tmp'), JSON.stringify(man, null, 1));
// a full run leaves the staging folder holding exactly what the manifest lists (bakes left from other selections are removed)
const listed = new Set([MANIFEST]); const addL = p => p && listed.add(p);
addL(man.shared.grunge); for (const b of Object.values(man.base)) Object.values(b).forEach(addL);
for (const g of Object.values(man.weapons)) for (const f of Object.values(g.finishes)) [f.paint, f.mrw, f.icon].forEach(addL);
for (const f of Object.values(man.knives)) { for (const m of Object.values(f.models)) [m.paint, m.mrw, m.paint2k, m.mrw2k].forEach(addL); Object.values(f.icon).forEach(addL); }
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const keepAlso = new Set([MANIFEST + '.tmp', STAGE_MARK, ...Object.keys(man.base).map(k => `base/.${k}.v`)]);
let pruned = 0; if (!ONLY && !KITS) for (const f of walk(OUT)) { const r = rel(f); if (keepAlso.has(r)) continue; if (!listed.has(r)) { rmSync(f); pruned++; } }   // (partial runs keep the rest; stageProblem() made sure OUT is the tool's own folder)
writeFileSync(path.join(OUT, MANIFEST), readFileSync(path.join(OUT, MANIFEST + '.tmp'))); rmSync(path.join(OUT, MANIFEST + '.tmp'));
const v = validateManifest(OUT);
console.log(`→ ${OUT}: ${v.counts.knifeFamilies} knife finishes (${v.counts.knifeBakes} bakes), ${v.counts.gunFinishes} gun finishes on ${v.counts.weapons} guns, ${v.files} files, ${(v.bytes / 1048576).toFixed(0)} MB${pruned ? `, ${pruned} stale files removed` : ''}`);
if (!v.ok) die('The baked folder does not pass the check:\n  ' + v.errors.join('\n  '));

// ---- 7. install (back-up rule)
if (INSTALL) {
  const r = installSkins({ assets: ASSETS, from: OUT, log: s => console.log('  ' + s) });
  console.log(r.unchanged ? `→ ${r.installed} already holds this bake: nothing changed.` : `→ installed ${r.installed}${r.backup ? ` (previous finishes kept in ${path.basename(r.backup)})` : ''}. Restart the room to load them.`);
} else console.log('Check it, then run again with --install (nothing was written to user-assets).');
