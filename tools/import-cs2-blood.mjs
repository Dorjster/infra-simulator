#!/usr/bin/env node
// Imports Counter-Strike 2's own blood pictures from THIS computer's CS2 install into the game's git-ignored
// user-assets/blood/ — the pictures dist/gd-blood.js draws instead of its built-in procedural ones (the same layout):
//   decals.png  1024 × 1024, 4 × 4 cells of 256: 12 wall / floor splats (CS2's materials/decals/blood/blood_decals_10 /
//               15 / 22 colour pictures, 1024 px each, downscaled) and 4 drip spots (the dotted ones CS2's ground decals use);
//   spray.png   1024 × 1024, 8 × 8 cells of 128: three 16-frame flipbooks (materials/particle/fluids/blood/
//               blood_spray_top sequence 0 — the splash, blood_spray_high sequence 0 — the streaks, blood_spray_top
//               sequence 1 — the puffs; each cropped frame put back where its sheet says it sits in the full frame), the
//               drop (materials/particle/blood_drop), a soft mist (drawn here) and a chunk (blood_splatter/bloodsplatter_light);
//   blood.json  what came from where (layout, CS2 file names, Source 2 Viewer version, date).
// and lists them in user-assets/manifest.json (models.blood: { decals, spray, grid }); the room serves them to everyone in
// it, tools/import-cs2-models.mjs packs user-assets/ (blood/ included) for other computers. Valve's files stay on this
// computer: user-assets/ is git-ignored, this tool and tools/cs2-blood/ hold only logic (tests/no-valve-data.mjs).
// Back-up rule (as the other importers): before anything under user-assets changes, the current user-assets/blood/ and
// manifest.json are copied to <cs2>/backup/blood-YYYYMMDD-HHMM/ (the 2 newest kept); the new folder is built beside
// (user-assets/blood.new) and swapped in; nothing else in user-assets is touched.
//   node tools/import-cs2-blood.mjs [--dry-run] [--force]
//     --cs2 <dir>      the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v/Source2Viewer-CLI)
//     --assets <dir>   the game's user-assets folder (default <repo>/user-assets)
//     --work <dir>     cache: Source2Viewer exports (default ~/Library/Caches/infra-cs2-blood)
//     --force          export from the depot again although the cache has the pictures
//     --dry-run        list what would be made; writes nothing under user-assets
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, renameSync, cpSync, statSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { readPng, writePng, blank, drawScaled } from './cs2-blood/png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, '..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }, flag = k => argv.includes(k);
const home = os.homedir(), CS2 = path.resolve(opt('--cs2', path.join(home, 'CS2-extract'))), ASSETS = path.resolve(opt('--assets', path.join(repo, 'user-assets')));
const WORK = path.resolve(opt('--work', process.platform === 'darwin' ? path.join(home, 'Library', 'Caches', 'infra-cs2-blood') : path.join(home, '.cache', 'infra-cs2-blood')));
const DRY = flag('--dry-run'), FORCE = flag('--force');
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
const die = s => { console.error(s); process.exit(1); };
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) die(`No ${what} at ${p} (--cs2 <dir>)`);
if (path.resolve(WORK).startsWith(path.resolve(ASSETS) + path.sep)) die('--work must not be inside user-assets');

// What goes in (the layout dist/gd-blood.js reads: DECAL_GRID 4 · WALL_CELLS 12 · DROP_CELL0 12; SPRAY_GRID 8 · CELL).
export const WALL = [['10', 1], ['10', 3], ['10', 9], ['10', 15], ['15', 0], ['15', 8], ['15', 10], ['15', 18], ['22', 1], ['22', 11], ['22', 15], ['22', 25]];
export const DROPS = [['10', 20], ['10', 28], ['15', 13], ['22', 10]];   // (15_13: CS2's blood_decals_spray_high, 22_10: _spray_low)
export const FLIP = [['splash', 'materials/particle/fluids/blood/blood_spray_top', 0, 0], ['streak', 'materials/particle/fluids/blood/blood_spray_high', 0, 16], ['puff', 'materials/particle/fluids/blood/blood_spray_top', 1, 32]];
const TEX = path.join(WORK, 'tex');

// ---- 1. the pictures out of the depot (cached)
const s2v = (args, opts = {}) => execFileSync('nice', ['-n', '10', S2V, '-i', VPK, ...args], { maxBuffer: 64 << 20, encoding: 'utf8', ...opts });
let s2vVersion = '?'; try { s2vVersion = (execFileSync(S2V, ['--version'], { encoding: 'utf8' }).match(/Version:\s*([\d.]+)/) || [])[1] || '?'; } catch {}
const need = ['materials/decals/blood/', 'materials/particle/fluids/blood/', 'materials/particle/blood_splatter/', 'materials/particle/blood_drop.vtex_c'];
mkdirSync(TEX, { recursive: true });
for (const f of need) { const probe = path.join(TEX, f.endsWith('/') ? f : path.dirname(f)); if (!FORCE && existsSync(probe) && readdirSync(probe).some(n => n.endsWith('.png'))) continue;
  console.log('exporting', f); try { s2v(['-f', f, '-e', 'vtex_c', '-o', TEX, '-d'], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { die('Source 2 Viewer could not export ' + f + ': ' + (e.stderr || e.message)); } }
const decalFile = (series, k) => { const d = path.join(TEX, 'materials/decals/blood'), re = new RegExp(`^blood_decals_${series}_color\\.${k}_tga_[0-9a-f]+\\.png$`), f = readdirSync(d).find(n => re.test(n)); if (!f) die(`missing blood_decals_${series}_color.${k} in ${d}`); return path.join(d, f); };
// A flipbook's sheet (VTEX_EXTRA_DATA_SHEET): where each cropped frame sits in its full frame.
function sheetOf(vtex) {
  const txt = s2v(['-f', vtex + '.vtex_c', '-b', 'DATA'], { stdio: ['ignore', 'pipe', 'ignore'] }), out = {}, num = '(-?[\\d.]+)';
  const re = new RegExp(`\\[(\\d+)\\.(\\d+)\\.0\\] uvCropped\\s*=\\s*\\{\\s*\\(\\s*${num},\\s*${num}\\s*\\),\\s*\\(\\s*${num},\\s*${num}\\s*\\)\\s*\\}\\s*\\n\\s*\\[\\1\\.\\2\\.0\\] uvUncropped\\s*=\\s*\\{\\s*\\(\\s*${num},\\s*${num}\\s*\\),\\s*\\(\\s*${num},\\s*${num}\\s*\\)\\s*\\}`, 'g');
  for (const m of txt.matchAll(re)) { const [s, f, a, b, c, d, e, g, h, k] = [m[1], m[2], ...m.slice(3).map(Number)]; (out[s] ??= [])[+f] = { crop: [a, b, c, d], full: [e, g, h, k] }; }
  return out;
}

// ---- 2. the atlases
const plan = { decals: [...WALL, ...DROPS].map(([s, k]) => `blood_decals_${s}_color.${k}`), spray: FLIP.map(([n, f, s]) => `${n}: ${path.basename(f)} seq ${s} × 16`).concat(['drop: blood_drop', 'mist: (drawn here)', 'chunk: bloodsplatter_light seq 30']) };
if (DRY) { console.log(JSON.stringify(plan, null, 1)); console.log('→ would write', path.join(ASSETS, 'blood'), '(decals.png, spray.png, blood.json; ~3 MB) and models.blood in manifest.json'); process.exit(0); }
const decals = blank(1024);
[...WALL, ...DROPS].forEach(([s, k], cell) => { const src = readPng(readFileSync(decalFile(s, k))); drawScaled(decals, src, (cell % 4) * 256, Math.floor(cell / 4) * 256, 256, 256); });
const spray = blank(1024), C = 128;
for (const [name, file, seq, first] of FLIP) { const sh = sheetOf(file)[seq]; if (!sh || sh.length < 16) die(`no sheet for ${file} sequence ${seq}`);
  for (let f = 0; f < 16; f++) { const png = path.join(TEX, `${file}_seq${seq}_${f}.png`); if (!existsSync(png)) die('missing ' + png); const src = readPng(readFileSync(png)), { crop, full } = sh[f];
    const fw = full[2] - full[0], fh = full[3] - full[1], s = C / Math.max(fw, fh), ox = (C - fw * s) / 2, oy = (C - fh * s) / 2, cell = first + f, cx = (cell % 8) * C, cy = Math.floor(cell / 8) * C;
    drawScaled(spray, src, cx + ox + (crop[0] - full[0]) * s, cy + oy + (crop[1] - full[1]) * s, Math.max(1, (crop[2] - crop[0]) * s), Math.max(1, (crop[3] - crop[1]) * s)); } }
{ const drop = readPng(readFileSync(path.join(TEX, 'materials/particle/blood_drop.png'))); drawScaled(spray, drop, (48 % 8) * C, Math.floor(48 / 8) * C, C, C);
  const ch = readPng(readFileSync(path.join(TEX, 'materials/particle/blood_splatter/bloodsplatter_light_seq30.png'))), s = C * .8 / Math.max(ch.width, ch.height); drawScaled(spray, ch, (50 % 8) * C + (C - ch.width * s) / 2, Math.floor(50 / 8) * C + (C - ch.height * s) / 2, ch.width * s, ch.height * s);
  // the mist: a soft blob (CS2's mists use a steam picture outside the blood set)
  const mx = (49 % 8) * C, my = Math.floor(49 / 8) * C; for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const d = Math.hypot(x - C / 2 + .5, y - C / 2 + .5) / (C * .46), a = Math.exp(-d * d * 3) * Math.max(0, 1 - d * d), o = ((my + y) * 1024 + mx + x) * 4;
    spray.data[o] = spray.data[o + 1] = spray.data[o + 2] = 200; spray.data[o + 3] = Math.round(255 * Math.min(1, a) * .8); } }

// ---- 3. install (back-up rule)
const stamp = (() => { const d = new Date(), p = v => String(v).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; })();
const manP = path.join(ASSETS, 'manifest.json'); if (!existsSync(manP)) die('no ' + manP + ' (import the CS2 models first: tools/import-cs2-models.mjs)');
const backups = path.join(CS2, 'backup'), bak = path.join(backups, 'blood-' + stamp); mkdirSync(bak, { recursive: true });
cpSync(manP, path.join(bak, 'manifest.json')); if (existsSync(path.join(ASSETS, 'blood'))) cpSync(path.join(ASSETS, 'blood'), path.join(bak, 'blood'), { recursive: true });
for (const old of readdirSync(backups).filter(n => /^blood-\d{8}-\d{4}$/.test(n)).sort().reverse().slice(2)) rmSync(path.join(backups, old), { recursive: true, force: true });
const NEW = path.join(ASSETS, 'blood.new'), DST = path.join(ASSETS, 'blood'); rmSync(NEW, { recursive: true, force: true }); mkdirSync(NEW, { recursive: true });
writeFileSync(path.join(NEW, 'decals.png'), writePng(decals)); writeFileSync(path.join(NEW, 'spray.png'), writePng(spray));
writeFileSync(path.join(NEW, 'blood.json'), JSON.stringify({ version: 1, made: new Date().toISOString(), s2v: s2vVersion, grid: { decals: 4, spray: 8 }, from: plan }, null, 1));
rmSync(DST, { recursive: true, force: true }); renameSync(NEW, DST);
const man = JSON.parse(readFileSync(manP, 'utf8')); man.models ??= {}; man.models.blood = { decals: 'blood/decals.png', spray: 'blood/spray.png', grid: { decals: 4, spray: 8 }, from: 'CS2 (this computer): ' + plan.decals.length + ' decal splats, 3 spray flipbooks' };
man.hash = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 12);   // (clients cache user assets by it: a new import, new URLs)
writeFileSync(manP, JSON.stringify(man, null, 1));
const mb = f => (statSync(path.join(DST, f)).size / 1048576).toFixed(1) + ' MB';
console.log(`→ ${DST}: decals.png (${mb('decals.png')}), spray.png (${mb('spray.png')}), blood.json · manifest models.blood · backup ${bak}`);
console.log('Restart the room (or reload the page) to draw them; tools/import-cs2-models.mjs puts them in the asset pack for other computers.');
