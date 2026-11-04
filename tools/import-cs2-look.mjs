#!/usr/bin/env node
// Imports each Counter-Strike 2 map's own look settings from THIS computer's CS2 install into the game's git-ignored
// user-assets/look/look.json (v53 LOOK, spec 4.1) — what dist/gd-exposure.js and dist/graphics.js use for Global
// Defensive's auto exposure and bloom on a map with CS2's baked look:
//   volume  the map's post_processing_volume entity (maps/de_<id>.vpk entity lump, already decompiled by the map
//           importer into <cs2>/export/<id>/ents.txt): master, enableexposure, minexposure, maxexposure (kept in the
//           file's order — Nuke's is reversed in its own entity), exposurespeedup, exposurespeeddown, fadetime,
//           postprocessing (the .vpost), its origin and hammeruniqueid (where it came from)
//   tone    the .vpost's CToneMappingLayer m_params (exposure bias, the filmic curve, shadow/highlight bias)
//   bloom   the .vpost's CBloomLayer m_params (m_blendMode, m_flBloomStrength, m_flScreenBloomStrength,
//           m_flBloomThreshold, m_flBloomThresholdWidth, m_flSkyboxBloomStrength, m_flBlurWeight, m_vBlurTint, and
//           CS2's compute-bloom fields as they are)
//   probes  the map's reflection / light probes (env_combined_light_probe_volume, env_light_probe_volume, env_cubemap,
//           env_cubemap_box: origin, box mins / maxs, array_index, the cube-map array texture's name) — for per-area
//           reflections (spec 4.1); listed only: their cube-map arrays (maps/de_<id>/cubemaps/env_cubemap_array.vtex)
//           are not converted yet (UPDATE-v53.0.md, partial)
// The .vpost is read from <cs2>/export/post/<path> when collect_post.py already decompiled it, else exported with
// Source2Viewer-CLI from the map's own package, then pak01 (as collect_post.py does).
// Valve's files stay on this computer: user-assets/ is git-ignored, this tool holds only logic (tests/no-valve-data.mjs).
// Back-up rule (as the other importers): before anything under user-assets changes, the current user-assets/look/ and
// manifest.json are copied to <cs2>/backup/look-YYYYMMDD-HHMM/ (the 2 newest kept); nothing else in user-assets is
// touched — the manifest gains models.look = { file, v } only (v: the file's own hash, so browsers fetch a new import;
// the manifest's global hash is left alone, so no other asset is downloaded again).
//   node tools/import-cs2-look.mjs [--dry-run] [map ids…]
//     --cs2 <dir>      the CS2 extract (default ~/CS2-extract)
//     --assets <dir>   the game's user-assets folder (default <repo>/user-assets)
//     --out <file>     write look.json here instead (tests, scratch; implies no manifest change and no backup)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, cpSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createHash } from 'node:crypto';

const MAPS = ['dust2', 'mirage', 'inferno', 'nuke', 'anubis', 'ancient', 'overpass', 'cache'];
// One entity block's fields (Source2Viewer's text: "key   value" lines) — numbers, [vectors], "strings", resource_name:"…".
export function parseEntity(blk) {
  const o = {}; for (const line of blk.split('\n')) { const m = /^(\S+)\s+(.*)$/.exec(line.trim()); if (!m) continue; const k = m[1].toLowerCase(); let v = m[2].trim();
    if (/^resource_name:"(.*)"$/.test(v)) v = /^resource_name:"(.*)"$/.exec(v)[1]; else if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(Number); else if (/^".*"$/.test(v)) v = v.slice(1, -1); else if (v === 'true' || v === 'false') v = v === 'true'; else if (/^-?[\d.]+(e-?\d+)?$/i.test(v)) v = +v;
    o[k] = v; } return o;
}
export const entityBlocks = ents => ents.split(/\n====\d+====\n/);
// A kv3 text layer's m_params (one level of `key = value`, arrays of numbers / of [r, g, b]).
export function layerParams(vpost, cls) {
  const i = vpost.indexOf(`_class = "${cls}"`); if (i < 0) return null; const a = vpost.indexOf('m_params', i), b0 = vpost.indexOf('{', a); if (a < 0 || b0 < 0) return null;
  let d = 0, e = b0; for (; e < vpost.length; e++) { if (vpost[e] === '{') d++; else if (vpost[e] === '}' && --d === 0) break; }
  const body = vpost.slice(b0 + 1, e), out = {}, re = /(m_\w+)\s*=\s*(\[\s*\[[\s\S]*?\]\s*,?\s*\]|\[[^\]]*\]|"[^"]*"|-?[\d.]+(?:e-?\d+)?|true|false)/g; let m;
  while ((m = re.exec(body))) { let v = m[2].trim(); if (v.startsWith('[')) { const rows = [...v.matchAll(/\[\s*([^\[\]]*?)\s*\]/g)].map(r => r[1].split(',').map(s => s.trim()).filter(Boolean).map(Number));
      v = /^\[\s*\[/.test(v) ? rows : v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean).map(Number); } else if (v.startsWith('"')) v = v.slice(1, -1); else if (v === 'true' || v === 'false') v = v === 'true'; else v = +v; out[m[1]] = v; }
  return out;
}
const PROBE = /^(env_combined_light_probe_volume|env_light_probe_volume|env_cubemap|env_cubemap_box)$/;
export function lookOfMap(ents, vpost) {
  const blocks = entityBlocks(ents).map(parseEntity), V = blocks.find(b => b.classname === 'post_processing_volume' && b.master !== false) || blocks.find(b => b.classname === 'post_processing_volume');
  if (!V) return null; const keep = ['master', 'enableexposure', 'minexposure', 'maxexposure', 'exposurespeedup', 'exposurespeeddown', 'fadetime', 'postprocessing', 'origin', 'hammeruniqueid'];
  const volume = Object.fromEntries(keep.filter(k => k in V).map(k => [k, V[k]]));
  const probes = blocks.filter(b => PROBE.test(b.classname || '')).map(b => ({ classname: b.classname, origin: b.origin, box_mins: b.box_mins, box_maxs: b.box_maxs, array_index: b.array_index, cubemaptexture: b.cubemaptexture }));
  return { vpost: V.postprocessing || '', volume, tone: vpost ? layerParams(vpost, 'CToneMappingLayer') : null, bloom: vpost ? layerParams(vpost, 'CBloomLayer') : null, probes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const CS2 = opt('--cs2') || path.join(os.homedir(), 'CS2-extract'), repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const UA = opt('--assets') || path.join(repo, 'user-assets'), OUT = opt('--out'), dry = args.includes('--dry-run'); const ids = args.filter(a => !a.startsWith('--')); const list = ids.length ? ids : MAPS;
  const X = path.join(CS2, 'tools/s2v/Source2Viewer-CLI'), G = path.join(CS2, 'game/game/csgo'), maps = {};
  for (const id of list) {
    const ef = path.join(CS2, 'export', id, 'ents.txt'); if (!existsSync(ef)) { console.log(id, ': no', ef, '(run the map importer first) — skipped'); continue; }
    const ents = readFileSync(ef, 'utf8'), first = lookOfMap(ents, null); if (!first) { console.log(id, ': no post_processing_volume'); continue; }
    let vf = path.join(CS2, 'export/post', first.vpost);
    if (!existsSync(vf) && existsSync(X)) for (const src of [path.join(G, 'maps', `de_${id}.vpk`), path.join(G, 'pak01_dir.vpk')]) { if (existsSync(vf)) break; try { execFileSync(X, ['-i', src, '-f', first.vpost + '_c', '-o', path.join(CS2, 'export/post'), '-d'], { stdio: 'ignore' }); } catch {} }
    const look = lookOfMap(ents, existsSync(vf) ? readFileSync(vf, 'utf8') : null); maps[id] = look;
    const B = look.bloom, V = look.volume; console.log(id.padEnd(9), 'exposure', V.minexposure, '→', V.maxexposure, 'speed', V.exposurespeedup, '/', V.exposurespeeddown, '| bloom', B ? `${B.m_blendMode} ${B.m_blendMode === 'BLOOM_BLEND_ADD' ? B.m_flBloomStrength : B.m_flScreenBloomStrength} thr ${B.m_flBloomThreshold} w ${B.m_flBloomThresholdWidth}` : 'none', '| probes', look.probes.length);
  }
  const doc = { _: 'CS2 map look settings, imported on this computer by tools/import-cs2-look.mjs from the user\'s own CS2 install (never shipped)', made: new Date().toISOString(), from: CS2, maps };
  const text = JSON.stringify(doc, null, 1);
  if (dry) { console.log('dry run: nothing written'); process.exit(0); }
  if (OUT) { mkdirSync(path.dirname(OUT), { recursive: true }); writeFileSync(OUT, text); console.log('wrote', OUT); process.exit(0); }
  const mp = path.join(UA, 'manifest.json'); if (!existsSync(mp)) { console.error('no', mp, '— import the models / maps first'); process.exit(1); }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13), bk = path.join(CS2, 'backup', 'look-' + stamp); mkdirSync(bk, { recursive: true });
  cpSync(mp, path.join(bk, 'manifest.json')); if (existsSync(path.join(UA, 'look'))) cpSync(path.join(UA, 'look'), path.join(bk, 'look'), { recursive: true });
  const old = readdirSync(path.join(CS2, 'backup')).filter(n => n.startsWith('look-')).sort(); for (const n of old.slice(0, -2)) rmSync(path.join(CS2, 'backup', n), { recursive: true, force: true });
  mkdirSync(path.join(UA, 'look'), { recursive: true }); writeFileSync(path.join(UA, 'look', 'look.json'), text);
  const m = JSON.parse(readFileSync(mp, 'utf8')); m.models = m.models || {}; m.models.look = { file: 'look/look.json', v: createHash('sha1').update(text).digest('hex').slice(0, 12), from: 'CS2: each map\'s post_processing_volume and .vpost (this computer\'s install)' };
  writeFileSync(mp, JSON.stringify(m, null, 1)); console.log('installed', path.join(UA, 'look/look.json'), '· backup', bk);
}
