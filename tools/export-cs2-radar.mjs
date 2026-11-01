#!/usr/bin/env node
// Global Defensive's radar pictures, from YOUR OWN CS2 install, for YOUR OWN computer: each map's CS2 overview picture
// (panorama/images/overheadmaps/de_<map>_radar_psd, and de_<map>_lower_radar_psd where CS2 has a lower level) and its
// overview data (resource/overviews/de_<map>.txt: pos_x / pos_y = the picture's top-left corner in Hammer units, scale =
// Hammer units per pixel of a 1024-px picture, verticalsections = where the lower picture takes over), decoded with
// Source 2 Viewer into user-assets/radar/ (radar.json + one PNG per picture). Valve's pictures are never committed or
// shipped: user-assets/ is git-ignored, and a LAN host serves them to the players in its own room only. Only this folder
// is written; nothing else in user-assets/ is touched. Without it the game keeps its own radar art (gd-radar-art.js).
//   node tools/export-cs2-radar.mjs              export every map CS2 has a picture for (de_dust2, de_mirage, …)
//   node tools/export-cs2-radar.mjs --dry        list what it would do
// Options: --cs2 <dir> (default ~/CS2-extract: tools/s2v/Source2Viewer-CLI, game/game/csgo/pak01_dir.vpk),
// --assets <dir> (default <repo>/user-assets), --maps dust2,nuke,… (game map ids; default: all of MAPS).
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// Game map ids (arena-maps.js) → CS2's map names. Train and Vertigo have no GD map file yet: exported for when they do.
export const MAPS = { dust2: 'de_dust2', mirage: 'de_mirage', inferno: 'de_inferno', nuke: 'de_nuke', overpass: 'de_overpass', ancient: 'de_ancient', anubis: 'de_anubis', cache: 'de_cache', train: 'de_train', vertigo: 'de_vertigo' };
// Valve KeyValues (the overview .txt): quoted keys and values, nested { } blocks, // comments → a plain object.
export function parseKV(text) {
  const tok = []; const re = /"([^"]*)"|([{}])|\/\/[^\n]*|([^\s"{}]+)/g; let m;
  while ((m = re.exec(text))) { if (m[1] !== undefined) tok.push({ s: m[1] }); else if (m[2]) tok.push(m[2]); else if (m[3]) tok.push({ s: m[3] }); }
  let i = 0; const block = () => { const o = {}; while (i < tok.length) { const t = tok[i++]; if (t === '}') return o; if (t === '{') continue; const k = t.s.toLowerCase(), v = tok[i++]; if (v === '{') o[k] = block(); else if (v && v !== '}') o[k] = v.s; else break; } return o; };
  return block(); }
// The overview data the radar needs, from a parsed overview file: { pos_x, pos_y, scale, split } — split: the Hammer z
// under which CS2 shows the lower picture (the "default" section's AltitudeMin), null on a one-level map.
export function overviewOf(kv) {
  const o = Object.values(kv).find(v => v && typeof v === 'object' && 'pos_x' in v) || kv, vs = o.verticalsections;
  const dflt = vs && (vs.default || Object.values(vs)[0]), lower = vs && Object.keys(vs).some(k => k !== 'default');
  const split = lower && dflt && Number.isFinite(+dflt.altitudemin) ? +dflt.altitudemin : null;
  return { pos_x: +o.pos_x, pos_y: +o.pos_y, scale: +o.scale, split }; }
// A PNG's width × height (its IHDR).
export const pngSize = buf => buf.length > 24 && buf.toString('ascii', 12, 16) === 'IHDR' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null;

function main() {
  const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; }, dry = args.includes('--dry');
  const CS2 = opt('--cs2') || join(homedir(), 'CS2-extract'), S2V = join(CS2, 'tools/s2v/Source2Viewer-CLI'), PAK = join(CS2, 'game/game/csgo/pak01_dir.vpk');
  const OUT = join(opt('--assets') || join(REPO, 'user-assets'), 'radar'), only = opt('--maps')?.split(',').map(s => s.trim()).filter(Boolean);
  if (!existsSync(S2V) || !existsSync(PAK)) { console.error('No CS2 install with Source 2 Viewer at ' + CS2 + ' (tools/s2v/Source2Viewer-CLI, game/game/csgo/pak01_dir.vpk). Pass --cs2 <dir>.'); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'gd-radar-')), s2v = (filter, out) => execFileSync(S2V, ['-i', PAK, '-f', filter, '-o', out, '-d'], { stdio: 'pipe', maxBuffer: 64 << 20 });
  try {
    console.log('Decoding CS2 overview data and pictures with Source 2 Viewer…'); s2v('resource/overviews/', join(tmp, 'ov')); s2v('panorama/images/overheadmaps/', join(tmp, 'img'));
    const ovDir = join(tmp, 'ov/resource/overviews'), imgDir = join(tmp, 'img/panorama/images/overheadmaps'), index = { version: 1, made: new Date().toISOString(), source: 'CS2 install on this computer (' + CS2 + ') — local only, never shipped', maps: {} };
    const pic = (name, outName) => { const f = join(imgDir, name + '_radar_psd.png'); if (!existsSync(f)) return null; const buf = readFileSync(f), size = pngSize(buf); if (!size) return null;
      if (!dry) copyFileSync(f, join(OUT, outName)); return { img: outName, hash: createHash('sha1').update(buf).digest('hex').slice(0, 12), w: size[0], h: size[1] }; };
    if (!dry) mkdirSync(OUT, { recursive: true });
    for (const [id, cs] of Object.entries(MAPS)) { if (only && !only.includes(id)) continue; const tf = join(ovDir, cs + '.txt');
      if (!existsSync(tf)) { console.log('  ' + id + ': no overview data in this CS2 install — skipped'); continue; }
      const ov = overviewOf(parseKV(readFileSync(tf, 'utf8'))), up = pic(cs, cs + '_radar.png'); if (!up || !(ov.scale > 0)) { console.log('  ' + id + ': no overview picture — skipped'); continue; }
      const lo = ov.split !== null ? pic(cs + '_lower', cs + '_lower_radar.png') : null;
      index.maps[id] = { cs2: cs, pos_x: ov.pos_x, pos_y: ov.pos_y, scale: ov.scale, res: up.w, split: lo ? ov.split : null, img: up.img, hash: up.hash, lower: lo ? { img: lo.img, hash: lo.hash } : null };
      console.log(`  ${id}: ${cs} · pos ${ov.pos_x}, ${ov.pos_y} · scale ${ov.scale} · ${up.w}×${up.h}` + (lo ? ` · lower picture below z ${ov.split}` : '')); }
    if (!dry) writeFileSync(join(OUT, 'radar.json'), JSON.stringify(index, null, 1));
    console.log((dry ? 'Would write ' : 'Wrote ') + Object.keys(index.maps).length + ' maps to ' + OUT + (dry ? '' : '/radar.json') + ' — the room serves them at /user-assets/radar/ (reload the game).');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
