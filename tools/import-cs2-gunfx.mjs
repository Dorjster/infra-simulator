#!/usr/bin/env node
// v53 GUNS (spec addendum 9, G5 / G6): imports Counter-Strike 2's first-person muzzle flashes and shell casings from THIS
// computer's CS2 install into the game's git-ignored user-assets/gunfx/ — the numbers dist/gd-gunfx.js draws them with
// instead of its built-in ones (which are these same files' values, read on 2026-11-04 and written down there).
//   · Which effect each gun uses: scripts/items/items_game.txt, each weapon prefab's visuals —
//     muzzle_flash_effect_1st_person (its _fp variant when the depot has one: CS2's first-person copy),
//     muzzle_flash_effect_3rd_person (what other players see) — the _alt keys for the guns carried silencer-on (the
//     M4A1-S) — and eject_brass_effect.
//   · Each effect: particles/weapons/cs_weapon_fx/<name>.vpcf_c, decompiled with Source 2 Viewer (-b DATA), and every
//     child it lists (m_Children, recursively: the main flash, the vent, sparks…). Per sprite child: how many particles
//     (an instantaneous emitter's m_nParticlesToEmit, a continuous one's duration × rate, at most m_nMaxParticles), life
//     (field 1), radius (field 3, or C_INIT_CreationNoise's range), roll (field 4), alpha (field 7), colour
//     (C_INIT_RandomColor), the offset along the barrel (C_INIT_PositionOffset, C_INIT_RemapScalarToVector), the fade
//     (C_OP_FadeOut), its picture (m_hTexture), blend mode and overbright. Per shell: its speed in the ejection port's
//     frame (C_INIT_CreateWithinSphereTransform m_LocalCoordinateSystemSpeedMin / Max), gravity (C_OP_BasicMovement),
//     life, radius and model (C_OP_RenderModels).
//   · The pictures the flashes name (particle_glow_04, muzzleflashx…): exported to PNG and packed side by side into
//     one atlas (gunfx/atlas.png, 128 × 128 cells, one row) so the game draws every flash particle in ONE pooled draw.
// Writes user-assets/gunfx/gunfx.json { version, made, s2v, cells, guns: { <our id>: { muzzle, muzzle3, shell } }, muzzle:
// { <effect>: [sprite child…] }, shell: { <effect>: {…} } } and lists it in user-assets/manifest.json (models.gunfx).
// Valve's files stay on this computer: user-assets/ is git-ignored and this tool holds only logic (tests/no-valve-data.mjs).
// Back-up rule (as the other importers): before anything under user-assets changes, user-assets/gunfx/ (if any) and
// manifest.json are copied to <cs2>/backup/gunfx-YYYYMMDD-HHMM/; the new folder is built beside (gunfx.new) and swapped
// in; the manifest is re-read just before it is written (other importers may run) and gains models.gunfx only.
//   node tools/import-cs2-gunfx.mjs [--dry-run]
//     --cs2 <dir>      the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v/Source2Viewer-CLI)
//     --assets <dir>   the game's user-assets folder (default <repo>/user-assets)
//     --work <dir>     cache for the decompiled files (default ~/Library/Caches/infra-cs2-gunfx)
//     --dry-run        print what was read; writes nothing under user-assets
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, renameSync, cpSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { parseKV3 } from './cs2-soundevents.mjs';
import { readPng, writePng, blank, drawScaled } from './cs2-blood/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CS2 = path.resolve(opt('--cs2', path.join(os.homedir(), 'CS2-extract'))), ASSETS = path.resolve(opt('--assets', path.join(HERE, '..', 'user-assets')));
const WORK = path.resolve(opt('--work', path.join(os.homedir(), 'Library', 'Caches', 'infra-cs2-gunfx'))), DRY = argv.includes('--dry-run');
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
const die = m => { console.error('import-cs2-gunfx: ' + m); process.exit(1); };
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) die(`No ${what} at ${p} (--cs2 <dir>)`);
mkdirSync(WORK, { recursive: true });
const s2v = (args, opts = {}) => execFileSync('nice', ['-n', '10', S2V, '-i', VPK, ...args], { maxBuffer: 64 << 20, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts });
let s2vVersion = '?'; try { s2vVersion = (execFileSync(S2V, ['--version'], { encoding: 'utf8' }).match(/Version:\s*([\d.]+)/) || [])[1] || '?'; } catch {}
// The depot's file list (once, cached): which _fp variants exist.
const listP = path.join(WORK, 'files.txt'); if (!existsSync(listP)) writeFileSync(listP, s2v(['-l', '-f', 'particles/weapons/cs_weapon_fx/']));   // (the depot's own list, this folder only)
const FILES = new Set(readFileSync(listP, 'utf8').split('\n').map(l => l.trim().split(/\s/)[0].toLowerCase()).filter(Boolean));
const has = f => FILES.has(f.toLowerCase());
// A resource's DATA block, parsed (cached).
function data(file) { const c = path.join(WORK, file.replace(/[\/]/g, '__') + '.txt'); if (!existsSync(c)) writeFileSync(c, s2v(['-f', file, '-b', 'DATA'])); const t = readFileSync(c, 'utf8'), i = t.indexOf('<!--'); return i < 0 ? null : parseKV3(t.slice(i).replace(/\b(resource|resource_name|soundevent|panorama):"/g, '"')); }   // (typed strings — resource:"…" — as plain strings: parseKV3 reads the type word with its colon)

// items_game: prefab → its visuals (the newest key wins, as the KeyValues file reads; prefabs inherit by "prefab").
const IG = (() => { const c = path.join(WORK, 'items_game.txt'); if (!existsSync(c)) { const d = path.join(WORK, 'ig'); mkdirSync(d, { recursive: true }); s2v(['-f', 'scripts/items/items_game.txt', '-o', d]); const f = path.join(d, 'scripts', 'items', 'items_game.txt'); cpSync(existsSync(f) ? f : path.join(d, 'items_game.txt'), c); } return readFileSync(c, 'utf8'); })();
const prefabs = {}; { const L = IG.split('\n'); let depth = 0, inPre = -1, cur = null, key = null;
  for (const raw of L) { const l = raw.trim(); if (l === '{') { depth++; if (key === 'prefabs' && inPre < 0) inPre = depth; else if (inPre > 0 && depth === inPre + 1) cur = prefabs[key] = prefabs[key] || {}; continue; }
    if (l === '}') { if (inPre > 0 && depth === inPre + 1) cur = null; if (depth === inPre) inPre = -1; depth--; continue; }
    const m = l.match(/^"([^"]+)"(?:\s+"([^"]*)")?/); if (!m) continue; key = m[1]; if (m[2] !== undefined && cur && /^(prefab|muzzle_flash_effect_(1st|3rd)_person(_alt)?|eject_brass_effect)$/.test(m[1])) cur[m[1]] = m[2]; } }
const fx = (pf, k, d = 0) => !pf || d > 8 ? null : pf[k] ?? (pf.prefab ? pf.prefab.split(' ').map(p => fx(prefabs[p], k, d + 1)).find(Boolean) ?? null : null);
// our ids → CS2's classes (weapons-data.js)
const GUNS = { pistol: 'glock', usps: 'usp_silencer', p250: 'p250', fiveseven: 'fiveseven', cz75: 'cz75a', tec9: 'tec9', deagle: 'deagle', mac10: 'mac10', mp9: 'mp9', mp7: 'mp7', smg: 'mp5sd', bizon: 'bizon', ump45: 'ump45', p90: 'p90', shotgun: 'nova', xm1014: 'xm1014', galil: 'galilar', famas: 'famas', ak: 'ak47', m4: 'm4a1', m4s: 'm4a1_silencer', sg553: 'sg556', aug: 'aug', ssg08: 'ssg08', sniper: 'awp', lmg: 'm249', negev: 'negev' };
const DIR = 'particles/weapons/cs_weapon_fx/';
const fpName = n => { if (!n) return null; for (const c of [n + '_fp', n]) if (has(DIR + c.toLowerCase() + '.vpcf_c')) return c.toLowerCase(); return null; };
const tpName = n => n && has(DIR + n.toLowerCase() + '.vpcf_c') ? n.toLowerCase() : null;   // (third person: the effect itself, never an _fp copy)
// (final review: the guns this game always carries silencer-on take their prefab's _alt effects — items_game's
// weapon_m4a1_silencer_prefab: muzzle_flash_effect_1st_person_alt / _3rd_person_alt "weapon_muzzle_flash_assaultrifle_silenced".
// The USP-S's prefab has no _alt key: its own weapon_muzzle_flash_pistol, as items_game names it.)
const SILENCED = new Set(['m4s', 'usps']);
const vis = (pf, id, k) => (SILENCED.has(id) && fx(pf, k + '_alt')) || fx(pf, k);

// ── Reading a particle system ──
const lit = v => v == null ? null : typeof v === 'number' ? [v, v] : v.m_nType === 'PF_TYPE_LITERAL' ? [v.m_flLiteralValue, v.m_flLiteralValue] : v.m_nType === 'PF_TYPE_RANDOM_UNIFORM' ? [v.m_flRandomMin, v.m_flRandomMax]
  : v.m_nMapType === 'PF_MAP_TYPE_REMAP' ? [Math.min(v.m_flOutput0, v.m_flOutput1), Math.max(v.m_flOutput0, v.m_flOutput1)] : Number.isFinite(v.m_flLiteralValue) ? [v.m_flLiteralValue, v.m_flLiteralValue] : null;
const vlit = v => v?.m_vLiteralValue || (Array.isArray(v) ? v : null);
const join = (a, b) => !a ? b : !b ? a : [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
const r3 = a => a && a.map(x => +(+x).toFixed(6));
function sprite(d, name) {
  const em = d.m_Emitters || [], ini = d.m_Initializers || [], ops = d.m_Operators || [], rn = (d.m_Renderers || [])[0] || {}, max = d.m_nMaxParticles || 0;
  let count = 0; for (const e of em) { if (e._class === 'C_OP_InstantaneousEmitter') count += (lit(e.m_nParticlesToEmit) || [1])[1]; if (e._class === 'C_OP_ContinuousEmitter') count += Math.ceil((lit(e.m_flEmissionDuration) || [0])[1] * (lit(e.m_flEmitRate) || [0])[1]) || 0; }
  if (max) count = Math.min(count, max);
  const f = { life: null, radius: null, roll: null, alpha: null }; let off = null, remap = null;
  for (const i of ini) { const c = i._class;
    if (c === 'C_INIT_InitFloat') { const r = lit(i.m_InputValue), o = i.m_nOutputField ?? 3; if (!r) continue; if (o === 1) f.life = join(f.life, r); if (o === 3) f.radius = join(f.radius, r); if (o === 4) f.roll = join(f.roll, r); if (o === 7) f.alpha = join(f.alpha, r); }
    if (c === 'C_INIT_RandomLifeTime') f.life = join(f.life, [i.m_fLifetimeMin, i.m_fLifetimeMax]);
    if (c === 'C_INIT_RandomRadius') f.radius = join(f.radius, [i.m_flRadiusMin, i.m_flRadiusMax]);
    if (c === 'C_INIT_RandomAlpha') f.alpha = join(f.alpha, [(i.m_nAlphaMin ?? 255) / 255, (i.m_nAlphaMax ?? 255) / 255]);
    if (c === 'C_INIT_CreationNoise' && (i.m_nFieldOutput ?? 3) === 3) f.radius = join(f.radius, [i.m_flOutputMin ?? 0, i.m_flOutputMax ?? 1]);
    if (c === 'C_INIT_RandomColor') { f.c0 = i.m_ColorMin; f.c1 = i.m_ColorMax; }
    if (c === 'C_INIT_PositionOffset') off = [i.m_OffsetMin?.[0] ?? 0, i.m_OffsetMax?.[0] ?? 0];
    if (c === 'C_INIT_RemapScalarToVector' && i.m_vecOutputMax) remap = [i.m_vecOutputMin?.[0] ?? 0, i.m_vecOutputMax[0]];
    if (c === 'C_INIT_CreateWithinSphereTransform') { f.sphere = i.m_fRadiusMax ?? 0; const a = vlit(i.m_LocalCoordinateSystemSpeedMin), b = vlit(i.m_LocalCoordinateSystemSpeedMax); if (a || b) { f.speedMin = r3(a || [0, 0, 0]); f.speedMax = r3(b || a); } } }
  // (along the barrel: the offset's start, out to the remap's reach — the main flash's 1 … 12 HU)
  if (off || remap) f.along = off && remap ? [off[0], Math.max(off[1], remap[1])] : off || remap;
  if (!f.radius && rn._class === 'C_OP_RenderSprites') f.radius = [5, 5];   // (no radius initializer: CS2's default particle radius, m_flConstantRadius 5)
  for (const o of ops) { if (o._class === 'C_OP_FadeOut') f.fade = [o.m_flFadeOutTimeMin ?? .25, o.m_flFadeOutTimeMax ?? .25]; if (o._class === 'C_OP_BasicMovement') { if (o.m_Gravity) f.gravity = r3(vlit(o.m_Gravity)); if (o.m_fDrag) f.drag = o.m_fDrag; } }
  const tex = (rn.m_vecTexturesInput || [])[0]?.m_hTexture || rn.m_hTexture || null, model = (rn.m_ModelList || [])[0]?.m_model || null;
  return { name, render: rn._class || null, count, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v != null).map(([k, v]) => [k, Array.isArray(v) ? r3(v) : v])),
    texture: tex ? String(tex).replace(/^materials\//, '').replace(/\.vtex$/, '') : null, model, blend: rn.m_nOutputBlendMode || null, overbright: (lit(rn.m_flOverbrightFactor) || [1])[0] };
}
// Every sprite child of an effect (depth first, as CS2 starts them together).
function effect(name, depth = 0, out = []) { const file = DIR + name + '.vpcf_c'; if (!has(file) || depth > 4) return out; const d = data(file); if (!d) return out;
  if ((d.m_Renderers || []).length) out.push(sprite(d, name));
  for (const ch of d.m_Children || []) { const r = String(ch.m_ChildRef || '').match(/([a-z0-9_]+)\.vpcf$/i); if (r && !ch.m_bDisableChild) effect(r[1].toLowerCase(), depth + 1, out); }
  return out; }

const guns = {}, muzzle = {}, shell = {};
for (const [id, cls] of Object.entries(GUNS)) { const pf = prefabs['weapon_' + cls + '_prefab']; const m = fpName(vis(pf, id, 'muzzle_flash_effect_1st_person')), m3 = tpName(vis(pf, id, 'muzzle_flash_effect_3rd_person')), s = (fx(pf, 'eject_brass_effect') || '').toLowerCase() || null;
  guns[id] = { muzzle: m, muzzle3: m3, shell: s && has(DIR + s + '.vpcf_c') ? s : null };   // (muzzle3: what other players see — items_game's muzzle_flash_effect_3rd_person)
  for (const e of [m, m3]) if (e && !muzzle[e]) muzzle[e] = effect(e).filter(c => c.render === 'C_OP_RenderSprites' && c.blend === 'PARTICLE_OUTPUT_BLEND_MODE_ADD');   // (the flash's additive light only: its smoke puffs are not drawn here)
  if (guns[id].shell && !shell[guns[id].shell]) shell[guns[id].shell] = effect(guns[id].shell).find(c => c.render === 'C_OP_RenderModels') || null; }
// The atlas: every picture the flashes use, one 128² cell each, in one row.
const pics = [...new Set(Object.values(muzzle).flat().map(c => c.texture).filter(Boolean))], cells = {}, C = 128;
const atlas = blank(C * Math.max(1, pics.length), C);
pics.forEach((t, k) => { const d = path.join(WORK, 'tex'); mkdirSync(d, { recursive: true }); const png = path.join(d, path.basename(t) + '.png');
  if (!existsSync(png)) { try { s2v(['-f', 'materials/' + t + '.vtex_c', '-o', d, '-d']); } catch {} const all = readdirSync(d, { recursive: true }).map(String), f = all.find(n => n.endsWith(path.basename(t) + '.png')) || all.find(n => n.endsWith(path.basename(t) + '_seq0.png')); /* (a flip-book picture — smoke1, the silenced flash's — comes out as <name>_seq0…5.png: its first frame) */ if (f && path.join(d, f) !== png) cpSync(path.join(d, f), png); }
  if (!existsSync(png)) { console.warn('no picture for', t); return; } const img = readPng(readFileSync(png));
  // (additive pictures: CS2 draws their colour × brightness; a picture without alpha takes its brightness as its alpha)
  const opaque = (() => { for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) return false; return true; })();
  if (opaque) for (let i = 0; i < img.data.length; i += 4) { const a = Math.max(img.data[i], img.data[i + 1], img.data[i + 2]); img.data[i + 3] = a; if (a) for (let c = 0; c < 3; c++) img.data[i + c] = Math.min(255, Math.round(img.data[i + c] * 255 / a)); }
  drawScaled(atlas, img, k * C, 0, C, C); cells[t] = k; });
const out = { version: 1, made: new Date().toISOString(), s2v: s2vVersion, cell: C, grid: Math.max(1, pics.length), cells, guns, muzzle, shell };   // (grid: the atlas' cells in its one row)
if (DRY) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
// ── Install (the back-up rule) ──
const manP = path.join(ASSETS, 'manifest.json'); if (!existsSync(manP)) die('no ' + manP + ' (import the CS2 models first: tools/import-cs2-models.mjs)');
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-'), bak = path.join(CS2, 'backup', 'gunfx-' + stamp); mkdirSync(bak, { recursive: true });
cpSync(manP, path.join(bak, 'manifest.json')); if (existsSync(path.join(ASSETS, 'gunfx'))) cpSync(path.join(ASSETS, 'gunfx'), path.join(bak, 'gunfx'), { recursive: true });
const NEW = path.join(ASSETS, 'gunfx.new'), DST = path.join(ASSETS, 'gunfx'); rmSync(NEW, { recursive: true, force: true }); mkdirSync(NEW, { recursive: true });
writeFileSync(path.join(NEW, 'atlas.png'), writePng(atlas)); writeFileSync(path.join(NEW, 'gunfx.json'), JSON.stringify(out, null, 1));
if (existsSync(DST)) renameSync(DST, path.join(ASSETS, 'gunfx.old-' + stamp)); renameSync(NEW, DST); rmSync(path.join(ASSETS, 'gunfx.old-' + stamp), { recursive: true, force: true });   // (the old one is in the backup)
const man = JSON.parse(readFileSync(manP, 'utf8')); man.models = man.models || {}; man.models.gunfx = { file: 'gunfx/gunfx.json', atlas: 'gunfx/atlas.png', from: 'CS2: particles/weapons/cs_weapon_fx (muzzle flashes, shell casings) and items_game.txt (Steam depot, read on this computer)' };
const tmp = manP + '.gunfx-tmp'; writeFileSync(tmp, JSON.stringify(man, null, 1)); renameSync(tmp, manP);   // (re-read just now, written whole, then moved over: a reader never sees half a manifest)
console.log(`→ ${DST}: atlas.png (${pics.length} pictures: ${pics.join(', ')}), gunfx.json (${Object.keys(muzzle).length} flashes, ${Object.keys(shell).length} shells) · manifest models.gunfx · backup ${bak}`);
