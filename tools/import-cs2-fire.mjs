#!/usr/bin/env node
// Imports Counter-Strike 2's own fire pictures from THIS computer's CS2 install into the game's git-ignored
// user-assets/fire/ — the atlas dist/gd-fire-view.js draws the molotov's and the incendiary's fire with instead of its
// built-in one (the same layout: gd-fire-view.js ATLAS, 2048², 16 × 16 cells of 128; v53 FIRELOOK: was 1024², 8 × 8, with
// only 4 of each flame sequence's 32 frames — the flames never showed their full body). Each flipbook keeps 16 frames of
// a sequence, spread over its whole sheet (CS2 plays the sheet once a life: manual frames, field 38):
//   cells   0–63   fire_small_sim_b, sequences 0–3 × 16    the molotov's flame01a, main_fancy and outline (b_desat's picture)
//   cells  64–127  fire_small_sim_a, sequences 0–3 × 16    the molotov's main_center
//   cells 128–175  fire_small_sim_a_v02, sequences 0–2 × 16 the incendiary's main_center, outline and flame01a (alpha from
//                  its brightness: MIX_RGBA_RGBALPHA)
//   cells 176–191  fire_onsurface, sequences 0–1 × 8       snapshot_child_base (fire on the floor)
//   cells 192–207  fire_gas_batch_a_v2, sequences 0–1 × 8  flame03a, fireball1, the incendiary's sprays
//   cells 208–215  smokeloop_i_0, sequence 0 × 8           the plume (molotov_smoking_ground_child02)
//   cells 216–219  vistasmokev1_emods, sequence 0 × 4      the plume's column (molotov_smoking_ground_child01; its first
//                  texture, materials/particles/smoke/smoke.vtex, is not in the install)
//   cells 220–227  explosion_fireball_01, sequence 0 × 8   the bottle's flash (molotov_explosion_child_flash)
//   cells 228–231  fire_gas_batch_b_top_v2, sequence 0 × 4 fireball2
//   cells 232–235  smokeburst_c_slate, sequence 0 × 4      the extinguish swirl, the can's smoke trail
//   cells 236–239  sparks_burst, sequence 0 × 4            the incendiary's sparks, sprays and splash, the can in flight
//   cell  240      materials/effects/yellowflare            the embers (molotov_groundfire_child_embers)
//   cell  241      particle_flare_004                       the rag's glow, the light's floor stand-in
//   cells 242–244  fire_burning_character, sequence 0 × 3   the rag in flight, the floor glow (child_base_glow)
//   cell  245      materials/decaltests/molotovscorch       the scorch (materials/decals/molotovscorch.vmat's g_tColor)
//   cell  246      smoke_wisp_breakup_01_tile_inv           the incendiary's breakup (in its alpha)
//   cells 247–250  materials/particle/impact/fleks, sequences 15, 23, 31, 39 (debris: 15–39)   the shards
//   cells 251–254  spray1 (materials/particle/spray1/normal), sequence 0 × 4   the burning splash (splash07a)
//   cell  255      wispy_steam_burst (materials/particle/simulated/steam), its sequence 0's middle frame   the bottle-break
//                  burst's smoke (molotov_explosion_child_fireball4; v53 FIRELOOK final)
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
  ['simB', 'materials/particle/fire_small_sim/fire_small_sim_b', [0, 1, 2, 3], 0, 64, 'add'],
  ['simA', 'materials/particle/fire_small_sim/fire_small_sim_a', [0, 1, 2, 3], 64, 64, 'add'],
  ['incA', 'materials/particle/fire_small_sim/fire_small_sim_a_v02', [0, 1, 2], 128, 48, 'rgbalpha'],
  ['surface', 'materials/particle/fire_onsurface/fire_onsurface', [0, 1], 176, 16, 'add'],
  ['gas', 'materials/particle/fire_gas/fire_gas_batch_a_v2', [0, 1], 192, 16, 'add'],
  ['plume', 'materials/particle/smoke/smokeburst/smokeloop_i_0', [0], 208, 8, 'smoke'],
  ['smoke', 'materials/particle/vistasmokev1/vistasmokev1_emods', [0], 216, 4, 'smoke'],
  ['flash', 'materials/particle/explosion_fireballs/explosion_fireball_01', [0], 220, 8, 'add'],
  ['gasB', 'materials/particle/fire_gas/fire_gas_batch_b_top_v2', [0], 228, 4, 'add'],
  ['ext', 'materials/particle/smoke/smokeburst/smokeburst_c_slate', [0], 232, 4, 'smoke'],
  ['sparks', 'materials/particle/sparks/sparks_burst', [0], 236, 4, 'add'],
  ['ember', 'materials/effects/yellowflare', null, 240, 1, 'add'],
  ['flare', 'materials/particle/particle_flares/particle_flare_004', null, 241, 1, 'add'],
  ['burn', 'materials/particle/fire_burning_character/fire_burning_character', [0], 242, 3, 'add'],
  ['scorch', 'materials/decaltests/molotovscorch_tga_1dd246a4', null, 245, 1, 'scorch'],
  ['breakup', 'materials/particle/smoke_wisp_breakup_01/smoke_wisp_breakup_01_tile_inv', null, 246, 1, 'scorch'],
  ['fleks', 'materials/particle/impact/fleks', [15, 23, 31, 39], 247, 4, 'scorch'],
  ['splash', 'materials/particle/spray1/normal/spray1', [0], 251, 4, 'add'],
  ['steam', 'materials/particle/simulated/steam/wispy_steam_burst', [0], 255, 1, 'smoke', 'mid'],   // (one cell: the sheet's middle frame, the puff at its full body)
];
export const GRID = 16; const C = 128, N = GRID * C, TEX = path.join(WORK, 'tex');
// (FIRE final: imported — a test reading PLAN — it does nothing; only run as a tool does it export and install)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
function main() {
if (DRY) { console.log(JSON.stringify(PLAN.map(([n, f, s, c, k]) => `${n}: ${f}${s === null ? '' : ' seq ' + s} → cells ${c}–${c + k - 1}`), null, 1)); console.log('→ would write', path.join(ASSETS, 'fire'), '(atlas.png, fire.json; ~1.5 MB) and models.fire in manifest.json'); process.exit(0); }
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) die(`No ${what} at ${p} (--cs2 <dir>)`);

// ---- 1. the pictures out of the depot (cached)
const s2v = (args, opts = {}) => execFileSync('nice', ['-n', '10', S2V, '-i', VPK, ...args], { maxBuffer: 64 << 20, encoding: 'utf8', ...opts });
let s2vVersion = '?'; try { s2vVersion = (execFileSync(S2V, ['--version'], { encoding: 'utf8' }).match(/Version:\s*([\d.]+)/) || [])[1] || '?'; } catch {}
mkdirSync(TEX, { recursive: true });
for (const [, f] of PLAN) { const dir = path.join(TEX, path.dirname(f)), base = path.basename(f); const mine = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(_seq\\d+(_\\d+)?)?\\.png$');   // (FIRELOOK: its own pictures — fire_small_sim_a is not fire_small_sim_a_v02)
  if (!FORCE && existsSync(dir) && readdirSync(dir).some(n => mine.test(n))) continue;
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
  const cx = (idx % GRID) * C, cy = Math.floor(idx / GRID) * C;
  if (!at) { const s = C / Math.max(img.width, img.height); drawScaled(atlas, img, cx + (C - img.width * s) / 2, cy + (C - img.height * s) / 2, img.width * s, img.height * s); return; }
  const { crop, full } = at, fw = full[2] - full[0], fh = full[3] - full[1], s = C / Math.max(fw, fh), ox = (C - fw * s) / 2, oy = (C - fh * s) / 2;
  drawScaled(atlas, img, cx + ox + (crop[0] - full[0]) * s, cy + oy + (crop[1] - full[1]) * s, Math.max(1, (crop[2] - crop[0]) * s), Math.max(1, (crop[3] - crop[1]) * s)); }
for (const [name, f, seq, first, cells, how, pick] of PLAN) {
  const dir = path.join(TEX, path.dirname(f)), base = path.basename(f);
  if (seq === null) { const png = path.join(dir, base + '.png'); if (!existsSync(png)) die('missing ' + png); cell(readPng(readFileSync(png)), first, how); from[name] = { file: f, cells: [first] }; continue; }
  const seqs = Array.isArray(seq) ? seq : [seq], per = cells / seqs.length, sheets = sheetOf(f), took = [], frames = [];
  seqs.forEach((sq, si) => { const sh = sheets[sq]; if (!sh?.length) die(`no sheet for ${f} sequence ${sq}`); frames.push(sh.length);
    for (let c = 0; c < per; c++) { let fr = Math.floor((c + (pick === 'mid' ? .5 : 0)) * sh.length / per); const at = k => { const one = path.join(dir, `${base}_seq${sq}.png`); return sh.length === 1 && existsSync(one) ? one : path.join(dir, `${base}_seq${sq}_${k}.png`); };   // (a one-frame sequence: Source 2 Viewer names it without the frame)
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
writeFileSync(path.join(NEW, 'fire.json'), JSON.stringify({ version: 2, made: new Date().toISOString(), s2v: s2vVersion, grid: GRID, cell: C, from }, null, 1));
rmSync(DST, { recursive: true, force: true }); renameSync(NEW, DST);
const man = JSON.parse(readFileSync(manP, 'utf8')); man.models ??= {}; man.models.fire = { atlas: 'fire/atlas.png', grid: GRID, from: 'CS2 (this computer): ' + PLAN.length + ' particle pictures' };
man.hash = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 12);   // (clients cache user assets by it: a new import, new URLs)
const tmp = manP + '.fire-tmp'; writeFileSync(tmp, JSON.stringify(man, null, 1)); renameSync(tmp, manP);   // (written whole, then moved over: a reader never sees half a manifest)
console.log(`→ ${DST}: atlas.png (${(statSync(path.join(DST, 'atlas.png')).size / 1048576).toFixed(1)} MB), fire.json · manifest models.fire · backup ${bak}`);
console.log('Reload the page to draw them; tools/import-cs2-models.mjs puts them in the asset pack for other computers.');
}
