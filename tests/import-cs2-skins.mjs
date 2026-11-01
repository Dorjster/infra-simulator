// The CS2 finishes importer (tools/import-cs2-skins.mjs, tools/cs2-skins/manifest.mjs) and its manifest
// (user-assets/skins/skins.json). Part 1 runs everywhere (CI has no CS2 install): image headers, the manifest check,
// the built-in fallback pick, and the install back-up rule on a fake user-assets folder (an existing skins/ becomes
// skins.bak-*, at most 2 backups are kept, every other file is left as it was, nothing is written outside it).
// Part 2 needs this computer's own CS2 install (~/CS2-extract) and Blender: it bakes the karambit Fade and the AK-47
// Redline into a temp folder, checks the manifest and files, and installs into a fake user-assets folder. It is
// skipped with a message when either is missing. Synthetic images and made-up colours only: the real finishes are
// Valve's and stay local.
//   node tests/import-cs2-skins.mjs            (CS2_SKINS_WORK=<dir> reuses a bake cache; default: the tool's own)
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process'; import { createHash } from 'node:crypto';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { imageSize, validateManifest, installSkins, fbIdFor, hueName, manifestFiles, stageProblem, claimStage, backupOrder, BACKUP, MANIFEST, STAGE_MARK } from '../tools/cs2-skins/manifest.mjs';
import { symlinkSync } from 'node:fs';
import { MODELS, GUNS, KNIVES, FAMILY_FB, CHECK_KITS } from '../tools/cs2-skins/models.mjs';
import { FINISHES } from '../dist/skins.js';
import { WEAPONS } from '../dist/weapons-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const tmp = mkdtempSync(path.join(os.tmpdir(), 'cs2skins-'));

// ---- synthetic images (headers are all the check reads; the rest is padding)
const png = (w, h) => { const b = Buffer.alloc(64); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const jpg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const webp = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(32, 4); b.write('WEBPVP8X', 8, 'latin1'); b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };
const webpLossy = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0, 'latin1'); b.write('WEBPVP8 ', 8, 'latin1'); b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); return b; };

// Image headers.
{ const p = imageSize(png(1024, 1024)), j = imageSize(jpg(1024, 512)), w = imageSize(webp(192, 144)), l = imageSize(webpLossy(192, 144));
  ok(p.type === 'png' && p.w === 1024 && p.h === 1024, 'PNG size from its header');
  ok(j.type === 'jpeg' && j.w === 1024 && j.h === 512, 'JPEG size from its SOF marker');
  ok(w.type === 'webp' && w.w === 192 && w.h === 144 && l.w === 192 && l.h === 144, 'WebP size (VP8X and lossy VP8)');
  ok(imageSize(Buffer.from('not an image at all, just text')) === null && imageSize(Buffer.alloc(4)) === null, 'anything else: no size'); }

// The game ids the importer knows are the game's own guns (every gun with a CS2 set; the AUG has none) and the four star knives.
{ const guns = WEAPONS.map(w => w.id), missing = guns.filter(id => !GUNS[id]);
  ok(guns.length >= 27 && !Object.keys(GUNS).filter(id => !guns.includes(id)).length, 'every importer gun id is a game gun id');
  ok(missing.join() === 'aug', 'every game gun but the AUG (no CS2 set on this install) has a CS2 model · missing: ' + missing.join(','));
  ok(Object.keys(KNIVES).join() === 'karambit,butterfly,m9,stiletto' && Object.values(MODELS).every(m => /^weapon_\w+$/.test(m.cls) && /^weapon_\w+$/.test(m.model)), 'four star knives; identifiers only');
  ok(Object.values(FAMILY_FB).every(id => FINISHES[id]) && Object.keys(CHECK_KITS).every(id => GUNS[id]), 'old knife ids map onto built-in finishes; the check list names importer guns'); }

// A synthetic baked folder in the §3.4 format.
const RES = 64;
function fakeBake(dir, { bad = null, tag = '' } = {}) {
  const m = { version: 1, made: new Date().toISOString(), res: RES, source: { s2v: '0', pakSize: 1, pakMtime: 1 }, shared: { grunge: 'shared/grunge.jpg' },
    base: { karambit: { color: 'base/karambit_color.jpg', orm: 'base/karambit_orm.jpg' } },
    weapons: { ak: { model: 'cs2_ak', uv: 0, len: 37.287, finishes: { cu_ak47_cobra: { name: 'Red' + tag, rarity: 'Classified', style: 7, wear: [0.1, 0.7], legacy: true, pearl: 0,
      paint: 'ak/cu_ak47_cobra_paint.jpg', mrw: 'ak/cu_ak47_cobra_mrw.png', icon: 'icons/ak_cu_ak47_cobra.webp', fbId: 'redline' } } } },
    knives: { aa_fade: { name: 'Fade', rarity: 'Covert', style: 6, wear: [0, 0.08], pearl: 0, fbId: 'fade', icon: { karambit: 'icons/karambit_aa_fade.webp' },
      models: { karambit: { kit: 'aa_fade', paint: 'karambit/aa_fade_paint.jpg', mrw: 'karambit/aa_fade_mrw.png' } } } } };
  const put = (rel, buf) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), buf); };
  put('shared/grunge.jpg', jpg(256, 256)); put('base/karambit_color.jpg', jpg(RES, RES)); put('base/karambit_orm.jpg', jpg(RES, RES));
  put('ak/cu_ak47_cobra_paint.jpg', jpg(RES, RES)); put('ak/cu_ak47_cobra_mrw.png', png(RES, RES)); put('icons/ak_cu_ak47_cobra.webp', webp(192, 144));
  put('karambit/aa_fade_paint.jpg', jpg(RES, RES)); put('karambit/aa_fade_mrw.png', png(RES, RES)); put('icons/karambit_aa_fade.webp', webp(192, 144));
  if (bad === 'missing') rmSync(path.join(dir, 'karambit/aa_fade_mrw.png'));
  if (bad === 'size') put('ak/cu_ak47_cobra_paint.jpg', jpg(RES * 2, RES));
  if (bad === 'escape') m.weapons.ak.finishes.cu_ak47_cobra.paint = '../../etc/passwd';
  if (bad === 'jpegdata') { m.weapons.ak.finishes.cu_ak47_cobra.mrw = 'ak/cu_ak47_cobra_paint.jpg'; }
  if (bad === 'schema') delete m.knives.aa_fade.fbId;
  writeFileSync(path.join(dir, MANIFEST), JSON.stringify(m));
  return m;
}

// The manifest check.
{ const good = path.join(tmp, 'good'); const m = fakeBake(good); const v = validateManifest(good);
  ok(v.ok && v.files === manifestFiles(m).length && v.counts.gunFinishes === 1 && v.counts.knifeFamilies === 1, 'a good baked folder passes · ' + v.errors.join('; '));
  for (const [bad, re] of [['missing', /missing/], ['size', /expected 64×64/], ['escape', /bad path|outside/], ['jpegdata', /must be PNG/], ['schema', /fbId/]]) {
    const d = path.join(tmp, 'bad-' + bad); fakeBake(d, { bad }); const r = validateManifest(d);
    ok(!r.ok && r.errors.some(e => re.test(e)), `refused: ${bad} · ${r.errors[0]}`);
  }
  ok(!validateManifest(path.join(tmp, 'nothing')).ok, 'no manifest: refused'); }

// Built-in fallback (fbId): knife families by the old ids, styles by family, hue by the bake's accent colour.
{ ok(fbIdFor({ style: 5, family: 'am_ruby_marbleized', pal: ['#000000'] }, FINISHES, FAMILY_FB) === 'doppler' && fbIdFor({ style: 2, family: 'hy_webs' }, FINISHES, FAMILY_FB) === 'web', 'knife families keep the old ids (Ruby → doppler, Crimson Web → web)');
  ok(fbIdFor({ style: 6, pal: ['#cc66aa', '#ee9988', '#eeccaa'], accent: '#ffaa66' }, FINISHES) === 'fade' && fbIdFor({ style: 8 }, FINISHES) === 'casehardened', 'airbrush → fade, patina → case hardened');
  ok(fbIdFor({ style: 7, pal: ['#444444', '#4c4c4c', '#775555'], accent: '#cc3333' }, FINISHES) === 'redline', 'a dark custom paint with red accents → redline');
  ok(fbIdFor({ style: 7, pal: ['#222222', '#dddddd', '#eeeeee'], accent: '#ee6622' }, FINISHES) === 'asiimov', 'white with orange → asiimov');
  ok(fbIdFor({ style: 5, pal: ['#113377', '#2266ee', '#4488ff'], accent: '#2266ee' }, FINISHES) === 'sapphire' && fbIdFor({ style: 2, pal: ['#334422', '#556633', '#888855'], accent: '#558833' }, FINISHES) === 'forest', 'blue anodized → sapphire, green hydro → forest');
  ok(hueName([200, 20, 30]) === 'red' && hueName([128, 128, 130]) === 'grey', 'hue names');
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(style => fbIdFor({ style, pal: ['#333333', '#777777', '#bbbbbb'], accent: '#3366cc' }, FINISHES));
  ok(all.every(id => FINISHES[id]), 'every style falls back to a real built-in finish: ' + all.join(',')); }

// Install under the back-up rule, on a fake user-assets folder.
const treeHash = (dir, skip = /^$/) => { const h = createHash('sha1'); const walk = d => readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1).forEach(e => { const p = path.join(d, e.name), r = path.relative(dir, p); if (skip.test(r)) return; if (e.isDirectory()) walk(p); else h.update(r).update(readFileSync(p)); }); walk(dir); return h.digest('hex'); };
function fakeAssets(dir) { mkdirSync(path.join(dir, 'fp'), { recursive: true }); mkdirSync(path.join(dir, 'weapons'), { recursive: true }); writeFileSync(path.join(dir, 'manifest.json'), '{"version":1,"hash":"x","models":{}}'); writeFileSync(path.join(dir, 'fp', 'cs2_ak.glb'), 'glb'); writeFileSync(path.join(dir, 'weapons', 'ak.bin'), 'bin'); }
{ const parent = path.join(tmp, 'inst'), A = path.join(parent, 'user-assets'); mkdirSync(A, { recursive: true }); fakeAssets(A); writeFileSync(path.join(parent, 'sibling.txt'), 'leave me');
  const others = () => treeHash(A, /^skins/), before = others(), sib = treeHash(parent, /^user-assets/);
  const b1 = path.join(tmp, 'b1'); fakeBake(b1); mkdirSync(path.join(b1, 'stale')); writeFileSync(path.join(b1, 'stale', 'old_paint.jpg'), jpg(RES, RES));
  const r1 = installSkins({ assets: A, from: b1, now: new Date(2026, 10, 1, 9, 5) });
  ok(r1.backup === null && validateManifest(path.join(A, 'skins')).ok && !existsSync(path.join(A, 'skins.new')), 'first install: user-assets/skins holds the bake, no skins.new left');
  ok(existsSync(path.join(b1, MANIFEST)) && !existsSync(path.join(A, 'skins', 'stale')), 'the staging folder is copied, not moved, and only the files its manifest lists');
  writeFileSync(path.join(A, 'skins', 'marker.txt'), 'one');
  const b2 = path.join(tmp, 'b2'); fakeBake(b2, { tag: '2' });
  const r2 = installSkins({ assets: A, from: b2, now: new Date(2026, 10, 1, 9, 6) });
  ok(path.basename(r2.backup) === 'skins.bak-20261101-0906' && readFileSync(path.join(r2.backup, 'marker.txt'), 'utf8') === 'one' && !existsSync(path.join(A, 'skins', 'marker.txt')), 'second install: the old skins/ is kept as skins.bak-YYYYMMDD-HHMM, untouched');
  const same = installSkins({ assets: A, from: b2, now: new Date(2026, 10, 1, 9, 6) });
  ok(same.unchanged && same.backup === null && readdirSync(A).filter(x => BACKUP.test(x)).length === 1, 'installing the same bake again changes nothing and uses up no backup');
  const b3 = path.join(tmp, 'b3'); fakeBake(b3, { tag: '3' }); const b4 = path.join(tmp, 'b4'); fakeBake(b4, { tag: '4' });
  installSkins({ assets: A, from: b3, now: new Date(2026, 10, 1, 9, 6) });
  ok(existsSync(path.join(A, 'skins.bak-20261101-0906-2')), 'same minute: the backup name gets a suffix, never overwrites');
  const r4 = installSkins({ assets: A, from: b4, now: new Date(2026, 10, 1, 9, 7) });
  const baks = readdirSync(A).filter(x => BACKUP.test(x)).sort();
  ok(baks.length === 2 && baks.join() === 'skins.bak-20261101-0906-2,skins.bak-20261101-0907' && r4.removed.length === 1, 'only the 2 newest backups are kept · ' + baks.join(','));
  ok(others() === before && treeHash(parent, /^user-assets/) === sib, 'manifest.json, fp/, weapons/ and everything next to user-assets are untouched');
  const bad = path.join(tmp, 'bad-inst'); fakeBake(bad, { bad: 'missing' }); const snap = treeHash(A);
  assert.throws(() => installSkins({ assets: A, from: bad }), /does not pass/); n++;
  ok(treeHash(A) === snap, 'a bake that fails the check changes nothing');
  mkdirSync(path.join(A, 'skins.new')); writeFileSync(path.join(A, 'skins.new', 'x'), 'left over'); const snap2 = treeHash(A);
  assert.throws(() => installSkins({ assets: A, from: b2 }), /left from an earlier run/); n++;
  ok(treeHash(A) === snap2, 'a leftover skins.new is never overwritten');
  rmSync(path.join(A, 'skins.new'), { recursive: true });
  assert.throws(() => installSkins({ assets: path.join(tmp, 'no-such'), from: b2 }), /no user-assets/); n++;
  ok(backupOrder(['skins.bak-20261101-0906-2', 'skins.bak-20261101-0906-10', 'skins.bak-20261101-0906', 'skins.bak-20261031-2359-12', 'other']).join() === 'skins.bak-20261101-0906-10,skins.bak-20261101-0906-2,skins.bak-20261101-0906,skins.bak-20261031-2359-12', 'backups ordered by time, then by the suffix as a number (-10 after -2)'); }

// The staging folder (--out) is pruned by a full run, so it must be a folder the tool owns.
{ const parent = path.join(tmp, 'stage-safety'), A = path.join(parent, 'user-assets'); mkdirSync(A, { recursive: true }); fakeAssets(A);
  const link = path.join(parent, 'ua-link'); symlinkSync(A, link);
  const known = Object.keys(MODELS), p = out => stageProblem({ out, assets: A, knownModels: known });
  ok(p(A) && p(link) && p(A + path.sep + '.') && p(path.join(link, '..', 'user-assets')), 'user-assets itself is refused, also through a symlink or another spelling');
  ok(p(parent) && p(path.dirname(parent)), 'a folder holding user-assets is refused');
  ok(p(path.join(A, 'fp')) && p(path.join(link, 'skins')) && !p(path.join(A, 'skins.new')) && !p(path.join(link, 'skins.new')), 'inside user-assets only skins.new may be used');
  const desk = path.join(tmp, 'desk'); mkdirSync(desk); writeFileSync(path.join(desk, 'Notes.txt'), 'mine'); mkdirSync(path.join(desk, 'photos'));
  ok(p(desk) && /did not make/.test(p(desk)), 'an existing folder holding other things is refused · ' + p(desk));
  ok(!p(path.join(tmp, 'brand-new', 'stage')) && !p(path.join(tmp, 'b2')) && !!p(path.join(tmp, 'b1')), 'a new folder, or one holding only what a bake makes, is accepted (one with a stray folder is not)');
  const marked = path.join(tmp, 'marked'); mkdirSync(marked); writeFileSync(path.join(marked, 'whatever.txt'), 'x'); claimStage(marked);
  ok(existsSync(path.join(marked, STAGE_MARK)) && !p(marked), 'a folder carrying the tool\'s marker is accepted');
  const fn = path.join(tmp, 'file.txt'); writeFileSync(fn, 'x'); ok(p(fn), 'a file is refused'); }

// The asset-pack importer leaves skins/ out of the manifest hash, the app copy and the pack unless --with-skins.
{ const src = readFileSync(path.join(root, 'tools', 'import-cs2-models.mjs'), 'utf8');
  ok(/const SKINS = \/\^skins\(\$\|\[\.\]\)\//.test(src) && /walkAssets\(out\)\.filter/.test(src) && /--with-skins/.test(src), 'import-cs2-models: skins/ skipped in the hash; --with-skins opt-in');
  ok(/'skins-pack\/'/.test(src) && !/walkAssets\(out, withSkins\)/.test(src) && /installSkins\(/.test(src), 'packed finishes go under skins-pack/ (never assets/skins/, which a room would write over in place); the app copy installs them under the back-up rule'); }

console.log(`PASS: import-cs2-skins part 1 · ${n} checks (headers, manifest check, fallback pick, back-up rule)`);

// ---- part 2: a real bake from this computer's CS2 install
const CS2 = process.env.CS2_EXTRACT || path.join(os.homedir(), 'CS2-extract'), VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk');
const blenderPy = existsSync('/Applications/Blender.app/Contents/Resources') && readdirSync('/Applications/Blender.app/Contents/Resources').some(v => existsSync(path.join('/Applications/Blender.app/Contents/Resources', v, 'python')));
if (process.argv.includes('--part1')) console.log('SKIP: import-cs2-skins part 2 · --part1 (npm test runs part 1 only; the real bake takes minutes)');
else if (!existsSync(VPK) || !existsSync(path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI')) || !blenderPy || !existsSync(path.join(CS2, 'export', 'weapons', 'weapon_rif_ak47.glb'))) {
  console.log(`SKIP: import-cs2-skins part 2 · needs a CS2 install at ${CS2} (pak01_dir.vpk, tools/s2v, export/weapons) and Blender — not on this computer`);
} else {
  const out = path.join(tmp, 'stage'), A = path.join(tmp, 'real', 'user-assets'); mkdirSync(A, { recursive: true }); fakeAssets(A);
  const old = path.join(tmp, 'old'); fakeBake(old); installSkins({ assets: A, from: old, now: new Date(2026, 0, 1, 0, 0) });
  const before = treeHash(A, /^skins/), m0 = n;
  const args = [path.join(root, 'tools', 'import-cs2-skins.mjs'), '--cs2', CS2, '--assets', A, '--out', out, '--only', 'karambit,ak', '--kits', 'aa_fade,cu_ak47_cobra', '--install'];
  if (process.env.CS2_SKINS_WORK) args.push('--work', process.env.CS2_SKINS_WORK);
  const t = Date.now(); const log = execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 30 * 60e3 });
  const v = validateManifest(path.join(A, 'skins')), m = v.manifest;
  ok(v.ok, 'the real bake passes the check · ' + v.errors.join('; '));
  ok(m.knives.aa_fade?.models?.karambit && m.knives.aa_fade.wear[1] <= 0.08 && m.knives.aa_fade.fbId === 'fade' && m.knives.aa_fade.icon.karambit, 'karambit Fade: bake, wear cap, fallback, icon');
  ok(m.weapons.ak?.finishes?.cu_ak47_cobra?.legacy === true && m.weapons.ak.model === 'cs2_ak' && m.weapons.ak.len > 30 && m.weapons.ak.finishes.cu_ak47_cobra.icon, 'AK-47 Redline: a legacy finish moved onto the HD mesh, with its icon');
  ok(m.base.karambit?.color && m.base.karambit?.orm && m.shared.grunge && m.res === 1024, 'CS2 knife base maps and the shared grunge texture');
  ok(readdirSync(A).some(x => BACKUP.test(x)) && treeHash(A, /^skins/) === before, 'installed: the old skins/ backed up, nothing else in user-assets touched');
  const listed = new Set(manifestFiles(m).map(f => f.rel).concat(MANIFEST)), extra = [];
  const walk = d => readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!listed.has(path.relative(path.join(A, 'skins'), p).split(path.sep).join('/'))) extra.push(p); }); walk(path.join(A, 'skins'));
  ok(!extra.length, 'the installed folder holds exactly the files the manifest lists · ' + extra.slice(0, 3).join(','));
  const mrw = readFileSync(path.join(A, 'skins', m.weapons.ak.finishes.cu_ak47_cobra.mrw)), chunks = [];
  for (let i = 8; i + 8 <= mrw.length;) { const len = mrw.readUInt32BE(i); chunks.push(mrw.toString('latin1', i + 4, i + 8)); i += 12 + len; }
  ok(chunks.every(c => ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(c)), 'the mrw PNG is plain data: no colour chunks (sRGB, gAMA, cHRM, iCCP) · ' + [...new Set(chunks)].join(','));
  const again = execFileSync(process.execPath, args, { encoding: 'utf8', timeout: 30 * 60e3 });
  ok(/already holds this bake: nothing changed/.test(again) && readdirSync(A).filter(x => BACKUP.test(x)).length === 1, 'a second identical run re-uses the bakes and installs nothing');
  const snapA = treeHash(A); let refused = '';
  try { execFileSync(process.execPath, [path.join(root, 'tools', 'import-cs2-skins.mjs'), '--cs2', CS2, '--assets', A, '--out', A, '--only', 'karambit', '--kits', 'aa_fade'], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { refused = String(e.stderr); }
  ok(/user-assets folder itself/.test(refused) && treeHash(A) === snapA, 'the tool refuses --out <user-assets> and writes nothing · ' + refused.trim().split('\n')[0]);
  console.log(`PASS: import-cs2-skins part 2 · ${n - m0} checks · real bake + install in ${((Date.now() - t) / 1000).toFixed(0)} s · ${log.trim().split('\n').filter(l => l.startsWith('→')).join(' | ')}`);
}
rmSync(tmp, { recursive: true, force: true });
