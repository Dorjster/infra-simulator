// Nothing derived from Valve's files may be committed: no imported assets (user-assets/, user-maps/, skins/), no
// Source 2 files (.vpk, .vtex, .vmat, .vcompmat), no copies of items_game.txt / csgo_english.txt, and no paint-kit
// colour tables or wear ranges pasted into code (the CS2 finishes importer reads them from the user's own install at
// run time; tools/cs2-skins holds only identifiers and logic). Checks the files git tracks plus the untracked files
// that are not ignored (what the next commit could add). Guards the obvious cases only.
import { execFileSync } from 'node:child_process'; import { readFileSync, statSync } from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let files;
try { files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean); }
catch { console.log('SKIP: no-valve-data · not a git checkout'); process.exit(0); }
const bad = [], PATHS = [[/(^|\/)user-assets\//, 'imported assets folder'], [/(^|\/)user-maps\//, 'imported maps folder'], [/(^|\/)skins(\.new|\.bak-[^/]*)?\/.*\.(jpe?g|png|webp)$/i, 'baked finish'],
  [/(^|\/)skins\.json$/, 'finishes manifest'], [/\.(vpk|vtex(_c)?|vmat(_c)?|vcompmat(_c)?|vmdl(_c)?)$/i, 'Source 2 file'], [/(^|\/)(items_game|csgo_english)[^/]*\.txt$/i, 'CS2 game text'], [/\.(npz|pyc)$/i, 'tool cache']];
for (const f of files) for (const [re, what] of PATHS) if (re.test(f)) bad.push(`${f}: ${what}`);
// Text content: vmat colour tables (g_vColor0 = [0.86, …]), items_game paint-kit blocks, wear ranges with numbers.
const TEXT = /\.(m?js|cjs|py|json|txt|md|html|css|swift|sh)$/i, CONTENT = [
  [/g_vColor\d["'\s]*[:=]\s*[[(]\s*-?\d*\.\d+/, 'vmat colour table'], [/"paint_kits"\s*\{/, 'items_game paint kits'], [/"wear_remap_(min|max)"\s*"[\d.]+"/, 'items_game wear range'],
  [/"description_tag"\s*"#PaintKit_/, 'items_game paint kit'], [/"PaintKit_[A-Za-z0-9_]+_Tag"\s*"/, 'csgo_english finish names']];
for (const f of files) {
  if (!TEXT.test(f) || /^tests\/no-valve-data\.mjs$/.test(f)) continue;
  let s; try { if (statSync(path.join(root, f)).size > 4 << 20) continue; s = readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
  for (const [re, what] of CONTENT) if (re.test(s)) bad.push(`${f}: ${what}`);
}
if (bad.length) { console.error('Valve data in the repo:\n  ' + bad.slice(0, 40).join('\n  ')); process.exit(1); }
console.log(`PASS: no-valve-data · ${files.length} files: no imported assets, Source 2 files, game text or paint-kit tables`);
