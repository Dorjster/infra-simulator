#!/usr/bin/env node
// Imports Counter-Strike 2's own fire pictures from THIS computer's CS2 install into the game's git-ignored
// user-assets/fire/ — the atlas dist/gd-fire-view.js draws the molotov's and the incendiary's fire with instead of its
// built-in one (the same layout: gd-fire-view.js ATLAS, 1024², 8 × 8 cells of 128):
//   cells  0–15  the molotov's flame flipbook   materials/particle/fire_small_sim/fire_small_sim_b, sequences 0–3 × 4 frames
//   cells 16–31  the incendiary's flame          materials/particle/fire_small_sim/fire_small_sim_a_v02, sequences 0–3 × 4 frames
//                (CS2 picks a random sequence per sprite: C_INIT_RandomSequence m_nSequenceMax 7 in both flame01a files)
//   cells 32–39  fire over the floor             materials/particle/fire_onsurface/fire_onsurface, sequence 0 (30: 8 of them)
//   cells 40–47  smoke (extinguish swirl, trail) materials/particle/smoke/smokeburst/smokeburst_c_slate, sequence 0 (64: 8)
//   cells 48–51  the incendiary's sparks         materials/particle/sparks/sparks_burst, sequence 0 (25: 4)
//   cell  52     glow / ember                    materials/particle/particle_flares/particle_flare_004
//   cells 53–55  the burning rag in flight       materials/particle/fire_burning_character/fire_burning_character, sequence 0 (12: 3)
//   cell  56     the scorch                      materials/decaltests/molotovscorch (materials/decals/molotovscorch.vmat's g_tColor)
//   cell  57     the incendiary's breakup        materials/particle/smoke_wisp_breakup_01/smoke_wisp_breakup_01_tile_inv (in its alpha)
//   cell  58     the molotov's plume             materials/particle/smoke/smokeburst/smokeloop_i_0, sequence 0, its first frame
//   cells 60–63  the burst's fireball / gas      materials/particle/fire_gas/fire_gas_batch_a_v2, sequence 0 (15: 4)
// (which picture each CS2 particle uses: particles/inferno_fx/*.vpcf and particles/weapons/cs_weapon_fx/weapon_molotov_* /
// weapon_incend_* — their renderers' m_hTexture — decompiled from the same install; gd-fire-view.js's header lists them.)
// Each flipbook frame is put back where its sheet (VTEX_EXTRA_DATA_SHEET) says it sits in the full frame. Additive
// pictures with no alpha of their own (black background) get one from their brightness and their colour un-darkened
// to match (rgb · alpha is the same light); the incendiary's flame keeps its own colour and takes its luminance as its
// alpha — CS2 draws it so (SPRITECARD_TEXTURE_CHANNEL_MIX_RGBA_RGBALPHA), and gd-fire-view.js's colour lookup reads that
// colour (FIRE final: stretched to 255, its dim red edges were saturated); the smoke's grey is brought up to our
// fallback's (brightest 200) so the files' colours tint it alike. Also writes fire.json (what came from where, Source 2 Viewer's version, the date) and
// lists the atlas in user-assets/manifest.json (models.fire: { atlas, grid }). Valve's files stay on this computer:
// user-assets/ is git-ignored, this tool holds only logic (tests/no-valve-data.mjs).
// Back-up rule (as the other importers): before anything under user-assets changes, the current user-assets/fire/ and
// manifest.json are copied to <cs2>/backup/fire-YYYYMMDD-HHMM/ (the 2 newest kept); the new folder is built beside
// (user-assets/fire.new) and swapped in; nothing else in user-assets is touched (the manifest gains models.fire only).
//   node tools/import-cs2-fire.mjs [--dry-run] [--force]
//     --cs2 <dir>      the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v/Source2Viewer-CLI)
//     --assets <dir>   the game's user-assets folder (default <repo>/user-assets)
//     --work <dir>     cache: Source2Viewer exports (default ~/Library/Caches/infra-cs2-fire)
//     --force          export from the depot again although the cache has the pictures
//     --dry-run        list what would be made; writes nothing under user-assets
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, renameSync, cpSync, statSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { readPng, writePng, blank, drawScaled } from './cs2-blood/png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, '..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }, flag = k => argv.includes(k);
const home = os.homedir(), CS2 = path.resolve(opt('--cs2', path.join(home, 'CS2-extract'))), ASSETS = path.resolve(opt('--assets', path.join(repo, 'user-assets')));
const WORK = path.resolve(opt('--work', process.platform === 'darwin' ? path.join(home, 'Library', 'Caches', 'infra-cs2-fire') : path.join(home, '.cache', 'infra-cs2-fire')));
const DRY = flag('--dry-run'), FORCE = flag('--force');
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
const die = s => { console.error(s); process.exit(1); };
if (path.resolve(WORK).startsWith(path.resolve(ASSETS) + path.sep)) die('--work must not be inside user-assets');

// [name, depot texture (no extension), sequence (null: a single picture; a list: the cells shared out among them), first cell, cells, how]
//   how: 'add' (an additive picture: alpha from brightness when it has none), 'rgbalpha' (its colour kept, its brightness
//   its alpha), 'smoke' (grey brought up), 'scorch' (as is)
export const PLAN = [
  ['molotov', 'materials/particle/fire_small_sim/fire_small_sim_b', [0, 1, 2, 3], 0, 16, 'add'],
  ['incendiary', 'materials/particle/fire_small_sim/fire_small_sim_a_v02', [0, 1, 2, 3], 16, 16, 'rgbalpha'],
  ['ground', 'materials/particle/fire_onsurface/fire_onsurface', 0, 32, 8, 'add'],
  ['smoke', 'materials/particle/smoke/smokeburst/smokeburst_c_slate', 0, 40, 8, 'smoke'],
  ['sparks', 'materials/particle/sparks/sparks_burst', 0, 48, 4, 'add'],
  ['flare', 'materials/particle/particle_flares/particle_flare_004', null, 52, 1, 'add'],
  ['rag', 'materials/particle/fire_burning_character/fire_burning_character', 0, 53, 3, 'add'],
  ['scorch', 'materials/decaltests/molotovscorch_tga_1dd246a4', null, 56, 1, 'scorch'],
  ['breakup', 'materials/particle/smoke_wisp_breakup_01/smoke_wisp_breakup_01_tile_inv', null, 57, 1, 'scorch'],
  ['plume', 'materials/particle/smoke/smokeburst/smokeloop_i_0', 0, 58, 1, 'smoke'],
  ['fireball', 'materials/particle/fire_gas/fire_gas_batch_a_v2', 0, 60, 4, 'add'],
];
const C = 128, N = 1024, TEX = path.join(WORK, 'tex');
// (FIRE final: imported — a test reading PLAN — it does nothing; only run as a tool does it export and install)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
function main() {
if (DRY) { console.log(JSON.stringify(PLAN.map(([n, f, s, c, k]) => `${n}: ${f}${s === null ? '' : ' seq ' + s} → cells ${c}–${c + k - 1}`), null, 1)); console.log('→ would write', path.join(ASSETS, 'fire'), '(atlas.png, fire.json; ~1.5 MB) and models.fire in manifest.json'); process.exit(0); }
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) die(`No ${what} at ${p} (--cs2 <dir>)`);

// ---- 1. the pictures out of the depot (cached)
const s2v = (args, opts = {}) => execFileSync('nice', ['-n', '10', S2V, '-i', VPK, ...args], { maxBuffer: 64 << 20, encoding: 'utf8', ...opts });
let s2vVersion = '?'; try { s2vVersion = (execFileSync(S2V, ['--version'], { encoding: 'utf8' }).match(/Version:\s*([\d.]+)/) || [])[1] || '?'; } catch {}
mkdirSync(TEX, { recursive: true });
for (const [, f] of PLAN) { const dir = path.join(TEX, path.dirname(f)), base = path.basename(f); if (!FORCE && existsSync(dir) && readdirSync(dir).some(n => n.startsWith(base) && n.endsWith('.png'))) continue;
  console.log('exporting', f); try { s2v(['-f', f + '.vtex_c', '-o', TEX, '-d'], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { die('Source 2 Viewer could not export ' + f + ': ' + (e.stderr || e.message)); } }
// A flipbook's sheet (VTEX_EXTRA_DATA_SHEET): where each cropped frame sits in its full frame (as tools/import-cs2-blood.mjs).
function sheetOf(vtex) {
  const txt = s2v(['-f', vtex + '.vtex_c', '-b', 'DATA'], { stdio: ['ignore', 'pipe', 'ignore'] }), out = {}, num = '(-?[\\d.]+)';
  const re = new RegExp(`\\[(\\d+)\\.(\\d+)\\.0\\] uvCropped\\s*=\\s*\\{\\s*\\(\\s*${num},\\s*${num}\\s*\\),\\s*\\(\\s*${num},\\s*${num}\\s*\\)\\s*\\}\\s*\\n\\s*\\[\\1\\.\\2\\.0\\] uvUncropped\\s*=\\s*\\{\\s*\\(\\s*${num},\\s*${num}\\s*\\),\\s*\\(\\s*${num},\\s*${num}\\s*\\)\\s*\\}`, 'g');
  for (const m of txt.matchAll(re)) { const [s, f, a, b, c, d, e, g, h, k] = [m[1], m[2], ...m.slice(3).map(Number)]; (out[s] ??= [])[+f] = { crop: [a, b, c, d], full: [e, g, h, k] }; }
  return out; }

// ---- 2. the atlas
const atlas = blank(N), from = {};
// One picture into a cell (alpha and colour fixed by `how`), at `at` (crop / full: its place in the full frame, or null).
function cell(src, idx, how, at = null) {
  const img = blank(src.width, src.height); img.data.set(src.data); const D = img.data, n = src.width * src.height;
  let noAlpha = true; for (let i = 0; i < n; i++) if (D[i * 4 + 3] < 250) { noAlpha = false; break; }
  if (how === 'rgbalpha') for (let i = 0; i < n; i++) { const o = i * 4; D[o + 3] = Math.round(.299 * D[o] + .587 * D[o + 1] + .114 * D[o + 2]); }   // (its alpha its luminance: our reading of RGBALPHA)
  if (how === 'add' && noAlpha) for (let i = 0; i < n; i++) { const o = i * 4, m = Math.max(D[o], D[o + 1], D[o + 2]); D[o + 3] = m; if (m > 0) { D[o] = Math.round(D[o] * 255 / m); D[o + 1] = Math.round(D[o + 1] * 255 / m); D[o + 2] = Math.round(D[o + 2] * 255 / m); } }
  if (how === 'smoke') { let mx = 1; for (let i = 0; i < n; i++) mx = Math.max(mx, D[i * 4], D[i * 4 + 1], D[i * 4 + 2]); const k = 200 / mx; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) D[i * 4 + c] = Math.min(255, Math.round(D[i * 4 + c] * k)); }
  const cx = (idx % 8) * C, cy = Math.floor(idx / 8) * C;
  if (!at) { const s = C / Math.max(img.width, img.height); drawScaled(atlas, img, cx + (C - img.width * s) / 2, cy + (C - img.height * s) / 2, img.width * s, img.height * s); return; }
  const { crop, full } = at, fw = full[2] - full[0], fh = full[3] - full[1], s = C / Math.max(fw, fh), ox = (C - fw * s) / 2, oy = (C - fh * s) / 2;
  drawScaled(atlas, img, cx + ox + (crop[0] - full[0]) * s, cy + oy + (crop[1] - full[1]) * s, Math.max(1, (crop[2] - crop[0]) * s), Math.max(1, (crop[3] - crop[1]) * s)); }
for (const [name, f, seq, first, cells, how] of PLAN) {
  const dir = path.join(TEX, path.dirname(f)), base = path.basename(f);
  if (seq === null) { const png = path.join(dir, base + '.png'); if (!existsSync(png)) die('missing ' + png); cell(readPng(readFileSync(png)), first, how); from[name] = { file: f, cells: [first] }; continue; }
  const seqs = Array.isArray(seq) ? seq : [seq], per = cells / seqs.length, sheets = sheetOf(f), took = [], frames = [];
  seqs.forEach((sq, si) => { const sh = sheets[sq]; if (!sh?.length) die(`no sheet for ${f} sequence ${sq}`); frames.push(sh.length);
    for (let c = 0; c < per; c++) { let fr = Math.floor(c * sh.length / per); const at = k => path.join(dir, `${base}_seq${sq}_${k}.png`);
      while (fr < sh.length - 1 && !existsSync(at(fr))) fr++;   // (an empty frame — Source 2 Viewer writes no picture for it: the next one)
      if (!existsSync(at(fr)) || !sh[fr]) die('missing ' + at(fr)); cell(readPng(readFileSync(at(fr))), first + si * per + c, how, sh[fr]); took.push(sq + ':' + fr); } });
  from[name] = { file: f, sequences: seqs, frames, took, cells: [first, first + cells - 1] }; }

// ---- 3. install (back-up rule)
const stamp = (() => { const d = new Date(), p = v => String(v).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; })();
const manP = path.join(ASSETS, 'manifest.json'); if (!existsSync(manP)) die('no ' + manP + ' (import the CS2 models first: tools/import-cs2-models.mjs)');
const backups = path.join(CS2, 'backup'), bak = path.join(backups, 'fire-' + stamp); mkdirSync(bak, { recursive: true });
cpSync(manP, path.join(bak, 'manifest.json')); if (existsSync(path.join(ASSETS, 'fire'))) cpSync(path.join(ASSETS, 'fire'), path.join(bak, 'fire'), { recursive: true });
for (const old of readdirSync(backups).filter(n => /^fire-\d{8}-\d{4}$/.test(n)).sort().reverse().slice(2)) rmSync(path.join(backups, old), { recursive: true, force: true });
const NEW = path.join(ASSETS, 'fire.new'), DST = path.join(ASSETS, 'fire'); rmSync(NEW, { recursive: true, force: true }); mkdirSync(NEW, { recursive: true });
writeFileSync(path.join(NEW, 'atlas.png'), writePng(atlas));
writeFileSync(path.join(NEW, 'fire.json'), JSON.stringify({ version: 1, made: new Date().toISOString(), s2v: s2vVersion, grid: 8, cell: C, from }, null, 1));
rmSync(DST, { recursive: true, force: true }); renameSync(NEW, DST);
const man = JSON.parse(readFileSync(manP, 'utf8')); man.models ??= {}; man.models.fire = { atlas: 'fire/atlas.png', grid: 8, from: 'CS2 (this computer): ' + PLAN.length + ' particle pictures' };
man.hash = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 12);   // (clients cache user assets by it: a new import, new URLs)
const tmp = manP + '.fire-tmp'; writeFileSync(tmp, JSON.stringify(man, null, 1)); renameSync(tmp, manP);   // (written whole, then moved over: a reader never sees half a manifest)
console.log(`→ ${DST}: atlas.png (${(statSync(path.join(DST, 'atlas.png')).size / 1048576).toFixed(1)} MB), fire.json · manifest models.fire · backup ${bak}`);
console.log('Reload the page to draw them; tools/import-cs2-models.mjs puts them in the asset pack for other computers.');
}
