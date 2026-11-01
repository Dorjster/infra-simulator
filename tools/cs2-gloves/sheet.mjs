// The import sheet for the CS2 gloves (pictures only, never shipped): every finish of a baked folder rendered on its
// glove (tools/cs2-gloves/render.py studio, both hands, studio light) next to CS2's own econ icon, captioned with its
// name and rarity, one block of rows per glove type (CS2's order: Sport Gloves first), plus a row of gloves fitted on
// the first-person arms skeleton in weapon poses (render.py fit). Labelled JPEG sheets are drawn by an external
// contact-sheet tool (a spec JSON in, a JPEG out: --sheet-tool).
//   node tools/cs2-gloves/sheet.mjs --dir <baked folder> --out ~/Desktop/GD-gloves-import.jpg --sheet-tool <exe> [--work <dir>] [--per-row 8] [--split 4]
//     --fit sporty:<kit>@ak:idle:0.5,…   the fit row (type:finish@set:clip:seconds; sets: user-assets/fp/cs2_<set>.glb)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, '..', '..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DIR = path.resolve(opt('--dir')), OUT = path.resolve(opt('--out', path.join(os.homedir(), 'Desktop', 'GD-gloves-import.jpg'))), TOOL = opt('--sheet-tool');
const WORK = path.resolve(opt('--work', path.join(os.tmpdir(), 'gd-gloves-sheet'))), PER = +opt('--per-row', 8), SPLIT = +opt('--split', 4), JOBS = +opt('--jobs', 2);
const ASSETS = path.resolve(opt('--assets', path.join(repo, 'user-assets')));
const BLENDER = opt('--blender', '/Applications/Blender.app/Contents/MacOS/Blender');
const R = '/Applications/Blender.app/Contents/Resources'; let PY = opt('--python');
if (!PY && existsSync(R)) for (const v of readdirSync(R).filter(x => /^\d/.test(x)).sort().reverse()) { const b = path.join(R, v, 'python', 'bin'); if (existsSync(b)) { const p = readdirSync(b).find(x => /^python3\.\d+$/.test(x)); if (p) { PY = path.join(b, p); break; } } }
if (!TOOL || !existsSync(TOOL)) { console.error('--sheet-tool <contact sheet exe> needed'); process.exit(1); }
const man = JSON.parse(readFileSync(path.join(DIR, 'gloves.json'), 'utf8'));
const arms = (() => { const d = path.join(ASSETS, 'fp-gloves'); return readdirSync(d).filter(x => /^arms-.*\.glb$/.test(x)).map(x => path.join(d, x)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]; })();
mkdirSync(WORK, { recursive: true });

function run(cmd, args) {
  return new Promise((res, rej) => { const c = spawn('nice', ['-n', '10', cmd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }); let e = ''; c.stdout.on('data', d => { if (/RENDERED/.test(d)) process.stdout.write('.'); }); c.stderr.on('data', d => { e = (e + d).slice(-3000); }); c.on('close', k => k === 0 ? res() : rej(Error(cmd + ' failed ' + k + '\n' + e))); });
}
async function pool(tasks, n) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) await tasks[i++](); })); }
const abs = rel => path.join(DIR, rel);

// 1. studio renders, one Blender process per glove type
const jobs = [];
for (const [t, T] of Object.entries(man.types)) {
  const items = T.finishes.map(k => man.finishes[k]).map(f => ({ color: abs(f.color), orm: abs(f.orm), normal: abs(f.normal), cloth: f.cloth, out: path.join(WORK, 'studio', t, f.id + '.jpg') })).filter(it => !existsSync(it.out) || statSync(it.out).mtimeMs < statSync(it.color).mtimeMs);
  if (!items.length) continue;
  const j = path.join(WORK, `studio-${t}.json`); writeFileSync(j, JSON.stringify({ mode: 'studio', glove_glb: abs(T.mesh), size: [480, 360], items }));
  jobs.push(() => run(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(here, 'render.py'), '--', j]));
}
// 2. fit renders
const FIT = (opt('--fit', '') || '').split(',').filter(Boolean).map(s => { const [tk, rest] = s.split('@'); const [t, k] = tk.split(':'); const [set, clip, sec, zoom, sx, sy] = rest.split(':'); return { t, k, set, clip, sec: +sec, zoom: +(zoom || 1), shift: [+(sx || 0), +(sy || 0)] }; });
for (const [i, F] of FIT.entries()) {
  const f = man.finishes[F.k]; if (!f || !man.types[F.t]) { console.warn('fit: unknown ' + F.t + ':' + F.k); continue; }
  const j = path.join(WORK, `fit-${i}.json`); F.out = path.join(WORK, 'fit', `${i}-${F.t}-${F.set}-${F.clip}.jpg`);
  writeFileSync(j, JSON.stringify({ mode: 'fit', glove_glb: abs(man.types[F.t].mesh), size: [960, 360], set_glb: path.join(ASSETS, 'fp', `cs2_${F.set}.glb`), clip: F.clip, t: F.sec, zoom: F.zoom, shift: F.shift, arms_glb: arms, side: 'ct',
    items: [{ color: abs(f.color), orm: abs(f.orm), normal: abs(f.normal), cloth: f.cloth, out: F.out }] }));
  jobs.push(() => run(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(here, 'render.py'), '--', j]));
}
console.log(`Rendering (${jobs.length} Blender runs)…`); await pool(jobs, JOBS); console.log('');

// 3. cells: render | CS2 icon side by side (960×360)
const pairs = [];
for (const [t, T] of Object.entries(man.types)) for (const k of T.finishes) { const f = man.finishes[k]; pairs.push([path.join(WORK, 'studio', t, k + '.jpg'), f.icon ? abs(f.icon) : '', path.join(WORK, 'cell', t, k + '.jpg')]); }
const cj = path.join(WORK, 'cells.json'); writeFileSync(cj, JSON.stringify(pairs));
await run(PY, ['-I', '-B', '-c', `
import sys, json, os; sys.path.insert(0, ${JSON.stringify(path.join(here, '..', 'cs2-skins'))}); import imglib, numpy as np
for r, ic, out in json.load(open(${JSON.stringify(cj)})):
    if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(r): continue
    a = imglib.load(r)[..., :3]; a = imglib.resize(a, 480, 360)
    b = np.full((360, 480, 3), 0.42, np.float32)
    if ic:
        i = imglib.load(ic); rgb = i[..., :3]; al = i[..., 3:4] if i.shape[2] > 3 else 1.0; i = rgb * al + 0.42 * (1 - al); i = imglib.resize(i, 480, 360); b = i
    os.makedirs(os.path.dirname(out), exist_ok=True); imglib.save(out, np.concatenate([a, b], 1), quality=90)
`]);

// 4. sheets: rows of PER cells; types split over sheets after SPLIT types
const typeIds = Object.keys(man.types), sheets = [typeIds.slice(0, SPLIT), typeIds.slice(SPLIT)].filter(x => x.length);
const outs = [];
for (const [si, ids] of sheets.entries()) {
  const rows = [];
  for (const t of ids) {
    const T = man.types[t], ks = T.finishes, parts = Math.ceil(ks.length / PER);
    for (let p = 0; p < parts; p++) rows.push({ label: `${T.name}${parts > 1 ? ` (${p + 1}/${parts})` : ''}\n${ks.length} finishes`.replace('\n', ' · '), cells: ks.slice(p * PER, (p + 1) * PER).map(k => { const f = man.finishes[k]; return { img: path.join(WORK, 'cell', t, k + '.jpg'), cap: `${f.name} · ${f.rarityName}${f.shader === 'v2' ? ' · v2' : ''}` }; }) });
  }
  if (si === sheets.length - 1 && FIT.length) rows.push({ label: 'Fit on the first-person arms skeleton (CT sleeves)', cells: FIT.filter(F => F.out).map(F => ({ img: F.out, cap: `${man.types[F.t].name} ${man.finishes[F.k].name} · ${F.set} ${F.clip} ${F.sec}s` })) });
  const out = si === 0 ? OUT : OUT.replace(/\.jpg$/, `-${si + 1}.jpg`);
  const spec = { title: `Global Defensive · CS2 gloves import${sheets.length > 1 ? ` (${si + 1}/${sheets.length})` : ''}`,
    subtitle: `Each cell: left = the baked finish (colour + normal + ORM at ${man.res}²) on CS2's glove mesh in Blender, studio light, both hands; right = CS2's own light econ icon. ${Object.keys(man.finishes).length} finishes on ${typeIds.length} glove types from this computer's CS2 install (Source2Viewer ${man.source.s2v}). v2 = the newer glove shader (approximate colours). Meshes on the arms skeleton ${man.skeleton.hash.slice(0, 12)} (52 bones).`,
    cw: 480, ch: 180, cols: [], rows, notes: si === sheets.length - 1 ? ['Fit row: the glove + its wrist skinned by bone name onto a first-person set\'s clip (user-assets/fp/cs2_<gun>.glb), the agent\'s sleeves from the arms glb, the set\'s camera.'] : [] };
  const sp = path.join(WORK, `sheet-${si + 1}.json`); writeFileSync(sp, JSON.stringify(spec)); await run(TOOL, [sp, out]); outs.push(out);
}
console.log('sheets: ' + outs.join(', '));
