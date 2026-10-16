// Imports models and maps downloaded on this computer into the game: Counter-Strike 2 agents (player characters),
// guns, knives, the bomb, the defuse kit, the karambit first-person model, first-person rifle animations and gloves (e.g. Sketchfab uploads of CS2's own
// models) → user-assets/; Counter-Strike 1.6 map files (.bsp, BSP 30: de_dust2, de_mirage…) → user-maps/. The room
// serves both to every player in it (lan/room.mjs) and the game draws them in place of its built-in ones. They are
// Valve's or their makers': they stay on this computer (both folders are git-ignored) and are never shipped.
//   node tools/import-cs2-models.mjs [<folder> = ~/Desktop/Infra Simulator Assets] [<out> = user-assets]
//     --maps <dir> (default user-maps)  --pack <file> (default ~/Desktop/Infra Simulator Assets.zip)  --no-app  --no-pack
// The folder holds the downloads as they come: .zip / .rar / .7z archives, folders, or loose .glb / .fbx / .bsp
// files (from ~/Downloads, only archives whose names look like CS models or maps are opened). When the desktop app has
// been run on this computer, its own folders (~/Library/Application Support/Infra Simulator/assets, maps) get the same
// files. What each model is comes from the names CS2 gives its meshes and bones (tools/import-cs2-page.js); files
// that are none of these are skipped. Converting runs three.js' loaders in Chrome. Run it again after more downloads:
// what was imported before stays unless a new file replaces it.
// At the end everything imported (models and maps) is written as one asset pack, ~/Desktop/Infra Simulator Assets.zip:
// on another computer, install it in one step (the game's Settings → Models and maps → Import asset pack, or drop it in
// that computer's ~/Desktop/Infra Simulator Assets folder and run this). --no-pack skips writing it.
import { execFileSync } from 'node:child_process'; import { writeZip } from '../lan/zip.mjs'; import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, mkdtempSync, rmSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, '..'), DROP = path.join(os.homedir(), 'Desktop', 'Infra Simulator Assets');
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; }, mapsArg = opt('--maps'), packArg = opt('--pack');
const args = argv.filter(a => !a.startsWith('--')), noPack = argv.includes('--no-pack'), noApp = argv.includes('--no-app'), PACK = path.resolve(packArg || path.join(os.homedir(), 'Desktop', 'Infra Simulator Assets.zip'));
const src = path.resolve(args[0] || DROP), out = path.resolve(args[1] || path.join(repo, 'user-assets')), mapsOut = path.resolve(mapsArg || path.join(repo, 'user-maps'));
const APP = path.join(os.homedir(), 'Library', 'Application Support', 'Infra Simulator'), app = !noApp && process.platform === 'darwin' && existsSync(APP) ? APP : null;
if (!existsSync(src)) { mkdirSync(src, { recursive: true }); console.log('Made ' + src + ': put the downloads there and run this again.'); process.exit(0); }
// From ~/Downloads, only archives / folders whose names say CS / weapon / agent / map (not every zip in there).
const WANT = /cs2|csgo|cs-go|cs_go|\bcss?_|weapon|knife|karambit|agent|bomb|c4|defuse|rifle|pistol|smg|sniper|shotgun|glove|\bsas\b|phoenix|terror|counter|de_[a-z]/i, picky = path.basename(src) === 'Downloads';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gd-cs2-')), roots = [];
// Archives: .zip with unzip, .rar / .7z with the system's tar (libarchive); archives inside archives too (the knives, Phoenix).
const ARCH = /\.(zip|rar|7z)$/i;
const unpack = (file, dir) => { mkdirSync(dir, { recursive: true }); if (/\.zip$/i.test(file)) execFileSync('unzip', ['-o', '-qq', file, '-d', dir], { stdio: 'ignore' }); else execFileSync('tar', ['-xf', file, '-C', dir], { stdio: 'ignore' });
  for (const f of walk(dir)) if (ARCH.test(f)) unpack(f, f.replace(ARCH, '') + '_unpacked'); };
function walk(dir) { const res = []; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) res.push(...walk(p)); else res.push(p); } return res; }
const loose = [];
for (const e of readdirSync(src, { withFileTypes: true })) { if (e.name.startsWith('.') || /^read ?me/i.test(e.name) || (picky && !WANT.test(e.name))) continue; const p = path.join(src, e.name);
  if (e.isFile() && ARCH.test(e.name)) { const dir = path.join(tmp, e.name.replace(ARCH, '')); try { unpack(p, dir); roots.push({ name: e.name, dir, at: statSync(p).mtimeMs }); } catch (err) { console.warn('skipped', e.name, err.message); } }
  else if (e.isFile() && /\.(glb|fbx|bsp)$/i.test(e.name)) loose.push(p);
  else if (e.isDirectory()) roots.push({ name: e.name, dir: p, at: statSync(p).mtimeMs }); }
// Asset packs (made here on another computer): installed as they are, nothing to convert.
const copyTree = (from, to) => { for (const f of walk(from)) { const t = path.join(to, path.relative(from, f)); mkdirSync(path.dirname(t), { recursive: true }); writeFileSync(t, readFileSync(f)); } };
for (const r of roots.splice(0).filter(r => { if (!existsSync(path.join(r.dir, 'infra-pack.json'))) { roots.push(r); return false; } return true; })) {
  if (existsSync(path.join(r.dir, 'assets'))) copyTree(path.join(r.dir, 'assets'), out);
  if (existsSync(path.join(r.dir, 'maps'))) copyTree(path.join(r.dir, 'maps'), mapsOut);
  console.log('  asset pack installed ←', r.name); }
// The model files (a .glb before an .fbx of the same thing; .dae copies are not read) with the pictures beside them.
const jobs = [], bsps = []; for (const r of roots) { const files = walk(r.dir), models = files.filter(f => /\.(glb|fbx|obj)$/i.test(f)), pics = files.filter(f => /\.(png|jpe?g)$/i.test(f));
  for (const m of models) jobs.push({ from: r.name, file: m, pics, at: r.at || 0 }); for (const f of files) if (/\.bsp$/i.test(f)) bsps.push({ from: r.name, file: f }); }
for (const f of loose) if (/\.bsp$/i.test(f)) bsps.push({ from: path.basename(f), file: f }); else jobs.push({ from: path.basename(f), file: f, pics: walk(path.dirname(f)).filter(x => /\.(png|jpe?g)$/i.test(x)), at: statSync(f).mtimeMs });
// Oldest download first: of two of the same thing (two pairs of gloves, a gun downloaded again) the newest is the one used.
jobs.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
console.log(`${roots.length + loose.length} downloads in ${src}: ${jobs.length} model files, ${bsps.length} map files`);

// Maps: a Counter-Strike 1.6 map file (BSP 30) or a Source one (VBSP 19–21: CS:S / CS:GO ports) named after one of the
// game's maps (de_dust2_c2.bsp → dust2); of several for the same map, the most detailed one (the largest file; variants —
// rainy, night, snow… — only if nothing else). CS2's own format is skipped.
const { CS_MAP_IDS } = await import(new URL('../dist/cs-maps/themes.js', import.meta.url).href), mapPick = new Map();
for (const m of bsps) { const name = path.basename(m.file).toLowerCase(), id = CS_MAP_IDS.find(i => new RegExp('(^|[^a-z])' + i + '([^a-z]|$)').test(name.replace(/\.bsp$/, '')));
  const head = readFileSync(m.file).subarray(0, 8), vbsp = head.toString('latin1', 0, 4) === 'VBSP', ver = vbsp ? head.readInt32LE(4) : head.length >= 4 ? head.readInt32LE(0) : 0;
  if (!id) { console.log('  skip map', path.basename(m.file), '(not one of: ' + CS_MAP_IDS.join(', ') + ')'); continue; }
  if (vbsp ? ver < 19 || ver > 21 : ver !== 30) { console.log('  skip map', path.basename(m.file), '(' + (vbsp ? 'Source map version ' : 'BSP version ') + ver + ': the game reads Counter-Strike 1.6 maps (30) and Source maps (19–21))'); continue; }
  const t = statSync(m.file).size * (/rainy|night|snow|winter|xmas|beta|old|_sky/i.test(name) ? .001 : 1), was = mapPick.get(id); if (!was || t > was.t) mapPick.set(id, { ...m, t }); }
for (const [id, m] of mapPick) for (const dir of [mapsOut, ...(app ? [path.join(app, 'maps')] : [])]) { mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, id + '.bsp'), readFileSync(m.file)); }
for (const [id, m] of mapPick) console.log('  map', id, '←', m.from, '(' + path.basename(m.file) + ')');

// Chrome only when there is something to convert (a pack or maps alone need none).
const { chromium } = jobs.length ? await import('playwright-core').catch(() => { console.error('Needs playwright-core (drives Chrome): npm install --no-save playwright-core'); process.exit(1); }) : {};
const b = jobs.length ? await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] }) : null;
const p = b && await b.newPage(); p?.on('pageerror', e => console.error(e.message)); p?.on('console', m => { if (m.type() === 'warning' && !/not supported in three/.test(m.text())) console.warn(m.text()); });
const allowed = new Set(jobs.flatMap(j => [j.file, ...j.pics]));
await p?.route('http://assets.local/**', r => { const u = decodeURIComponent(new URL(r.request().url()).pathname);
  if (u === '/') return r.fulfill({ body: '<!doctype html><title>import</title>', contentType: 'text/html' });
  if (u === '/page.js') return r.fulfill({ body: readFileSync(path.join(here, 'import-cs2-page.js')), contentType: 'text/javascript' });
  const f = u.slice('/file'.length); if (!allowed.has(f)) return r.fulfill({ status: 404 }); r.fulfill({ body: readFileSync(f) }); });
await p?.goto('http://assets.local/');
await p?.evaluate(() => { const s = document.createElement('script'); s.type = 'importmap'; s.textContent = JSON.stringify({ imports: { three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js', 'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/' } }); document.head.append(s); });

const old = existsSync(path.join(out, 'manifest.json')) ? JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8')) : { models: {} };
const models = { ...old.models, weapons: { ...(old.models.weapons || {}) }, agents: { ...(old.models.agents || {}) }, viewmodels: { ...(old.models.viewmodels || {}) } };   // (and what other tools added: CS2 maps' looks, models.maps)
const put = (rel, data) => { mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); writeFileSync(path.join(out, rel), data); };
const url = f => 'http://assets.local/file' + f.split('/').map(encodeURIComponent).join('/');
const done = new Set(), { WEAPON_IDS } = await import(new URL('../dist/weapons-data.js', import.meta.url).href), known = new Set([...WEAPON_IDS, 'knife', 'knife-t', 'karambit', 'c4', 'kit']);
// Guns are held by their grip as measured on each CS2 model (weapon-models.js CS2_FIT); one without it would float in
// the hand, so it is left out until measured (the game keeps its built-in model for it).
const fitted = (() => { const src = readFileSync(new URL('../dist/weapon-models.js', import.meta.url), 'utf8'), i = src.indexOf('export const CS2_FIT = {'), j = src.indexOf('\n};', i); return new Set([...src.slice(i, j).matchAll(/(?:^|[\s,{])'?([a-z0-9-]+)'?: \{ at:/g)].map(m => m[1])); })();
const BY_NAME = [[/glock/, 'pistol'], [/p250/, 'p250'], [/five.?seven/, 'fiveseven'], [/tec.?9/, 'tec9'], [/cz.?75/, 'cz75'], [/bizon/, 'bizon'], [/negev/, 'negev'], [/galil/, 'galil'], [/deagle|desert.?eagle/, 'deagle']];
// .glb first: the same model as .fbx in the same download is then skipped.
jobs.sort((a, b) => (/\.glb$/i.test(b.file) - /\.glb$/i.test(a.file)));
for (const j of jobs) {
  let what = await p.evaluate(async u => { const m = await import('/page.js'); const { root } = await m.load(u); return m.identify(root); }, url(j.file)).catch(e => ({ error: e.message }));
  // Files without CS2's part names (re-exports: "DefaultMaterial", a hash for a name): the download's own name says.
  if (!what && !what?.error) { const n = (j.from + ' ' + path.basename(j.file)).toLowerCase(), hit = BY_NAME.find(([re]) => re.test(n)); if (hit) what = { kind: 'weapon', id: hit[1] }; }
  if (!what || what.error) { console.log('  skip', path.basename(j.file), what?.error || '(not a CS2 model this game uses)'); continue; }
  if (what.kind === 'weapon' && !known.has(what.id)) { console.log('  skip', path.basename(j.file), '(' + what.id + ': the game has no such weapon)'); continue; }
  if (what.kind === 'weapon' && !fitted.has(what.id) && !process.env.ALLOW_UNFITTED) {   /* (ALLOW_UNFITTED=1: import anyway, to measure its grip) */ console.log('  skip', path.basename(j.file), '(' + what.id + ': no grip measured for it yet — the built-in model is used)'); continue; }
  const key = what.kind + ':' + what.id; if (done.has(key)) { console.log('  skip', path.basename(j.file), '(' + key + ' already from this run)'); continue; }
  const base = 'http://assets.local/file', files = j.pics;
  try {
    if (what.kind === 'weapon') {
      const r = await p.evaluate(async a => (await import('/page.js')).convertStatic(a), { url: url(j.file), files, base, id: what.id });
      // The game's compact model: JSON header + float32 positions / normals / uvs (dist/weapon-models.js loadReal).
      const head = { id: r.id, box: r.box, parts: [{ name: 'main', count: r.part.P.length / 3, opacity: false }] }, hj = Buffer.from(JSON.stringify(head)), pad = (4 - (hj.length + 4) % 4) % 4, len = Buffer.alloc(4); len.writeUInt32LE(hj.length + pad);
      put(`weapons/${r.id}.bin`, Buffer.concat([len, hj, Buffer.alloc(pad, 32), ...['P', 'N', 'U'].map(k => Buffer.from(new Float32Array(r.part[k]).buffer))]));
      const maps = []; for (const [k, b64] of Object.entries(r.tex)) { put(`weapons/${r.id}-main-${k}.jpg`, Buffer.from(b64, 'base64')); maps.push(k); }
      models.weapons[r.id] = { file: `weapons/${r.id}.bin`, maps, tris: r.tris, box: r.box.map(v => v.map(x => +x.toFixed(2))), from: j.from };
      console.log('  weapon', r.id, r.tris, 'triangles', maps.join('/'), '←', j.from);
    } else if (what.kind === 'agent') {
      const r = await p.evaluate(async a => (await import('/page.js')).convertAgent(a), { url: url(j.file), files, base });
      put(`agents/${what.team}.glb`, Buffer.from(r.glb, 'base64')); models.agents[what.team] = { file: `agents/${what.team}.glb`, name: what.name, tris: r.tris, bones: r.bones, height: r.height, from: j.from };
      console.log('  agent', what.team, what.name, r.tris, 'triangles', r.bones, 'bones', r.height + ' m', '←', j.from);
    } else if (what.kind === 'fp') {
      const r = await p.evaluate(async a => (await import('/page.js')).convertFPAnim(a), { url: url(j.file) });
      put(`fp/${what.id}.glb`, Buffer.from(r.glb, 'base64')); models.viewmodels[what.id] = { file: `fp/${what.id}.glb`, tris: r.tris, bones: r.bones, clips: r.clips, from: j.from };
      console.log('  first-person', what.id, 'animations:', r.clips.join(', '), '←', j.from);
    } else if (what.kind === 'glove') {
      const r = await p.evaluate(async a => (await import('/page.js')).convertGlove(a), { url: url(j.file), files, base });
      put('fp/glove.glb', Buffer.from(r.glb, 'base64')); models.viewmodels.glove = { file: 'fp/glove.glb', tris: r.tris, bones: r.bones, from: j.from };
      console.log('  gloves', r.tris, 'triangles', r.bones, 'bones', r.maps.join('/'), '←', j.from);
    } else if (what.kind === 'viewmodel') {
      const r = await p.evaluate(async a => (await import('/page.js')).convertViewmodel(a), { url: url(j.file) });
      put(`fp/${what.id}.glb`, Buffer.from(r.glb, 'base64')); models.viewmodels[what.id] = { file: `fp/${what.id}.glb`, tris: r.tris, bones: r.bones, from: j.from };
      console.log('  first-person', what.id, r.tris, 'triangles', r.bones, 'bones', '←', j.from);
    }
    done.add(key);
  } catch (e) { console.warn('  failed', path.basename(j.file), e.message); }
}
await b?.close(); rmSync(tmp, { recursive: true, force: true });
if (!jobs.length && !existsSync(path.join(out, 'manifest.json'))) { console.log(mapPick.size ? 'Maps imported; restart the room (or the app) to load them.' : 'Nothing to import.'); }
else {
// The manifest: what there is, and a hash of every file (clients cache by it).
const h = createHash('sha1'); for (const f of walk(out).filter(f => !f.endsWith('manifest.json')).sort()) h.update(f.slice(out.length)).update(readFileSync(f));
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ version: 1, hash: h.digest('hex').slice(0, 12), models }, null, 1));
console.log(`→ ${out}: ${Object.keys(models.weapons).length} weapons, ${Object.keys(models.agents).length} agents, ${Object.keys(models.viewmodels).length} first-person models`);
// The desktop app reads its own copy (its data folder): the same files there.
if (app) { copyTree(out, path.join(app, 'assets')); if (existsSync(mapsOut)) copyTree(mapsOut, path.join(app, 'maps')); console.log('→ ' + app + ' (desktop app: assets, maps)'); }
}
// One asset pack with everything: for other computers.
if (!noPack && (existsSync(path.join(out, 'manifest.json')) || existsSync(mapsOut))) {
  const maps = existsSync(mapsOut) ? readdirSync(mapsOut).filter(f => /\.bsp$/i.test(f)) : [], man = existsSync(path.join(out, 'manifest.json')) ? JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8')) : { models: {} };
  const info = { version: 1, made: new Date().toISOString(), weapons: Object.keys(man.models.weapons || {}), agents: Object.keys(man.models.agents || {}), viewmodels: Object.keys(man.models.viewmodels || {}), maps: maps.map(f => f.replace(/\.bsp$/i, '')), looks: Object.keys(man.models.maps || {}) };
  const entries = [{ name: 'infra-pack.json', data: Buffer.from(JSON.stringify(info, null, 1)) }, ...(existsSync(out) ? walk(out).map(f => ({ name: 'assets/' + path.relative(out, f).split(path.sep).join('/'), data: readFileSync(f) })) : []), ...maps.map(f => ({ name: 'maps/' + f, data: readFileSync(path.join(mapsOut, f)) }))];
  writeFileSync(PACK, writeZip(entries)); console.log(`→ ${PACK}: ${info.weapons.length} weapons, ${info.agents.length} agents, ${info.viewmodels.length} first-person, ${info.maps.length} maps (${(statSync(PACK).size / 1048576).toFixed(0)} MB) — on another computer: Settings → Models and maps → Import asset pack`);
}
