#!/usr/bin/env node
// Global Defensive's reloads as CS2 has them, read from YOUR OWN CS2 install (v53 RELOAD, spec addendum 4). Writes the
// numbers only — no audio, no models, no Valve file — to dist/gd-reload-ref.js, the reference the game's reload rule
// (weapons-data.js), the host (combat-logic.js) and the sound bank (gd-sounds.js) read. Regenerate after a CS2 update.
//   node tools/import-cs2-reloads.mjs            rewrite dist/gd-reload-ref.js
//   node tools/import-cs2-reloads.mjs --dry      print what it read, write nothing
//   options: --cs2 <dir> (default ~/CS2-extract: tools/s2v/Source2Viewer-CLI and game/game/csgo/pak01_dir.vpk),
//            --cache <dir> (decompiled clips and graphs kept between runs; default ~/CS2-extract/export/reloads)
// What it reads, per GD gun (GUNS below: GD id → CS2's weapons.vdata prefab and its first-person animgraph):
//  · scripts/weapons.vdata: m_iMaxClip1, m_nPrimaryReserveAmmoMax, m_bReserveAmmoAsClips (the reserve counted in
//    magazines), m_bReloadsSingleShells, m_flDisallowAttackAfterReloadStartDuration (the reload's length, s).
//  · The gun's first-person animgraph (animation/graphs/viewmodel/viewmodel_gun.vnmgraph+<gun>, the CZ75's own
//    viewmodel_gun_cz75): which reload clips it plays. CS2 picks the *_empty_* clip when weapon_ammo is 0 (the graph's
//    ReloadSelector: Float Comparison weapon_ammo NearEqual 0); the CZ75 has a second pair (reload2_*) for when its front
//    magazine is gone (weapon_has_front_mag_removed).
//  · Each clip (.vnmclip): its length and its events — the CNmIDEvents WPN_RELOAD_ADD_AMMO (the moment the rounds go in:
//    the magazine is seated), WPN_DROP_MAG (the old magazine leaves), WPN_RELOAD_SILENT (a window from the start: CS2's
//    "silent" reload, see below), WPN_RELOAD_INTRO / _LOOP / _OUTRO (a shotgun's shell-by-shell stages), and the
//    CNmSoundEvents (each sound event at its moment).
//  · soundevents/game_sounds_weapons.vsndevts: each of those sound events' volume, distance curve (HU → gain), occlusion,
//    pitch, mixgroup, display_broadcast (our reading, not verified: false = a first-person-only sound — CS2 sets it false on every Draw,
//    WeaponMove and Inspect foley and true on every .Single shot; the code that uses it is not in the data), suppression_enable with
//    suppression_volume_multiplier / suppression_falloff_multiplier (how much quieter and how much shorter-ranged the
//    sound is when suppressed), and its files' base names (to tell which event a first-person clip take belongs to).
// The silent reload: every reload clip carries WPN_RELOAD_SILENT from its start to just after its last sound, and every
// reload sound event has suppression_enable = true (× 0.07 volume, × 0.2 falloff on most). The game code that joins the
// two is not in the install's data files; our reading (gd-sounds.js) is that sounds of a reload inside that window are
// played suppressed for everyone but the reloading player. Recorded as such in UPDATE-v53.0.md.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseKV3 } from './cs2-soundevents.mjs';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// GD gun id → [weapons.vdata prefab, first-person graph] (graph: the viewmodel_gun variant's name, or a full graph path).
export const GUNS = {
  pistol: ['weapon_glock', 'glock'], usps: ['weapon_usp_silencer', 'usp'], p250: ['weapon_p250', 'p250'], fiveseven: ['weapon_fiveseven', 'five_seven'],
  cz75: ['weapon_cz75a', 'animation/graphs/viewmodel/viewmodel_gun_cz75.vnmgraph'], tec9: ['weapon_tec9', 'tec9'], deagle: ['weapon_deagle', 'deagle'],
  mac10: ['weapon_mac10', 'mac10'], mp9: ['weapon_mp9', 'mp9'], mp7: ['weapon_mp7', 'mp7'], smg: ['weapon_mp5sd', 'mp5sd'], bizon: ['weapon_bizon', 'bizon'],
  ump45: ['weapon_ump45', 'ump45'], p90: ['weapon_p90', 'p90'], shotgun: ['weapon_nova', 'nova'], xm1014: ['weapon_xm1014', 'xm1014'],
  galil: ['weapon_galilar', 'galil'], famas: ['weapon_famas', 'famas'], ak: ['weapon_ak47', 'ak47'], m4: ['weapon_m4a1', 'm4a4'], m4s: ['weapon_m4a1_silencer', 'm4a1s'],
  sg553: ['weapon_sg556', 'sg556'], aug: ['weapon_aug', 'aug'], ssg08: ['weapon_ssg08', 'ssg08'], sniper: ['weapon_awp', 'awp'], lmg: ['weapon_m249', 'm249'], negev: ['weapon_negev', 'negev'],
};
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const r4 = x => Math.round(x * 1e4) / 1e4, r3 = x => Math.round(x * 1e3) / 1e3;
// One resource of the depot: its DATA block as text (-b DATA), or decompiled (-d) when `deco`; cached by path.
function depot(cs2, cache, path, deco = false) {
  const out = join(cache, path.replace(/\//g, '__') + (deco ? '.dec' : '') + '.txt'); if (existsSync(out) && readFileSync(out, 'utf8').length > 100) return readFileSync(out, 'utf8');
  mkdirSync(cache, { recursive: true }); const X = join(cs2, 'tools/s2v/Source2Viewer-CLI'), P = join(cs2, 'game/game/csgo/pak01_dir.vpk');
  if (deco) { const dir = join(cache, 'deco'); mkdirSync(dir, { recursive: true }); execFileSync(X, ['-i', P, '-f', path, '-d', '-o', dir], { stdio: 'ignore' }); const f = join(dir, path.replace(/_c$/, '')); const t = existsSync(f) ? readFileSync(f, 'utf8') : ''; writeFileSync(out, t); return t; }
  const t = execFileSync(X, ['-i', P, '-f', path, '-b', 'DATA'], { encoding: 'utf8', maxBuffer: 64 << 20 }); writeFileSync(out, t); return t;
}
// A clip's DATA text → { dur, ids: { NAME: [start s, length s] }, snd: [[s, event name]] } (CNmIDEvent / CNmSoundEvent:
// start and length are fractions of the clip in CS2's data).
export function clipEvents(text) {
  const dur = +(/^\tm_flDuration = ([\d.]+)/m.exec(text)?.[1] || 0), ids = {}, snd = [];
  for (const blk of text.split('_class = ').slice(1)) {
    const cls = /^"([^"]+)"/.exec(blk)?.[1]; if (cls !== 'CNmIDEvent' && cls !== 'CNmSoundEvent') continue;
    const st = +(/m_flStartTime = \s*\{\s*m_flValue = ([\d.e-]+)/.exec(blk)?.[1] ?? NaN), ln = +(/m_flDuration = \s*\{\s*m_flValue = ([\d.e-]+)/.exec(blk)?.[1] ?? 0); if (!Number.isFinite(st)) continue;
    if (cls === 'CNmIDEvent') { const id = /m_ID = "([^"]*)"/.exec(blk)?.[1]; if (id && !ids[id]) ids[id] = [r4(st * dur), r4(ln * dur)]; }
    else { const nm = /m_name = "([^"]+)"/.exec(blk)?.[1]; if (nm) snd.push([r4(st * dur), nm]); }
  }
  snd.sort((a, b) => a[0] - b[0]); return { dur: r4(dur), ids, snd };
}
// A reload clip → the game's record: length, the mag-in (ADD_AMMO), drop, silent window, shotgun stages, sound moments.
export function reloadRecord(path, c) {
  const id = k => c.ids[k] || null, add = id('WPN_RELOAD_ADD_AMMO'), o = { clip: path.replace(/^animation\/anims\/viewmodel\//, '').replace(/\.vnmclip(_c)?$/, ''), dur: c.dur, add: add ? add[0] : null, drop: id('WPN_DROP_MAG')?.[0] ?? null, silent: id('WPN_RELOAD_SILENT') ? [id('WPN_RELOAD_SILENT')[0], r4(id('WPN_RELOAD_SILENT')[0] + id('WPN_RELOAD_SILENT')[1])] : null };
  if (id('WPN_RELOAD_LOOP')) { o.intro = id('WPN_RELOAD_INTRO')?.[1] ?? id('WPN_RELOAD_LOOP')[0]; o.loop = id('WPN_RELOAD_LOOP')[1]; o.outro = id('WPN_RELOAD_OUTRO')?.[1] ?? 0; }
  o.snd = c.snd; return o;
}
// weapons.vdata's prefabs (one tab in: `\tweapon_ak47_prefab = {`) → their own top-level fields (`\t\tm_x = value`), read
// line by line (its typed values — soundevent:"…", resource_name:"…" — are not plain KV3 for cs2-soundevents' parser).
export function vdataPrefabs(text) { const out = {}; let cur = null;
  for (const line of text.split('\n')) { let m = /^\t([a-z0-9_]+) = *$/.exec(line); if (m) { cur = out[m[1]] = {}; continue; }
    if (cur && (m = /^\t\t(m_\w+) = (.*)$/.exec(line))) { const v = m[2].trim(); cur[m[1]] = v === 'true' ? true : v === 'false' ? false : Number.isFinite(+v) ? +v : v; } }
  return out; }
const prefab = (V, name) => V[name + '_prefab'] || V[name] || null;
// Everything for the GD guns: { ref: { gid: … }, snd: { event: […] } }. EV: the parsed weapons soundevents (name → block).
export function readReloads({ cs2 = join(homedir(), 'CS2-extract'), cache = join(cs2, 'export', 'reloads') } = {}) {
  const V = vdataPrefabs(depot(cs2, cache, 'scripts/weapons.vdata_c', true)), EV = parseKV3(depot(cs2, cache, 'soundevents/game_sounds_weapons.vsndevts_c', true)), ref = {}, names = new Set();
  for (const [gid, [vname, graph]] of Object.entries(GUNS)) {
    const v = prefab(V, vname); if (!v) throw Error('weapons.vdata has no ' + vname);
    const gpath = graph.includes('/') ? graph + '_c' : `animation/graphs/viewmodel/viewmodel_gun.vnmgraph+${graph}.vnmgraph_c`;
    const clips = [...new Set([...depot(cs2, cache, gpath).matchAll(/anims\/viewmodel\/[^"\s]*reload[^"\s]*\.vnmclip/g)].map(m => 'animation/' + m[0]))];
    const role = p => { const b = p.split('/').pop(); return (/reload2/.test(b) ? 'alt' : 'main') + (/empty/.test(b) ? 'Empty' : ''); }, rec = {};
    for (const p of clips) { const r = reloadRecord(p, clipEvents(depot(cs2, cache, p + '_c'))); rec[role(p)] = r; for (const s of r.snd) names.add(s[1]); }
    if (!rec.main) throw Error(gid + ': no reload clip in ' + gpath);
    ref[gid] = { vdata: vname, clip1: +v.m_iMaxClip1, reserve: +v.m_nPrimaryReserveAmmoMax, asClips: v.m_bReserveAmmoAsClips === true, single: v.m_bReloadsSingleShells === true, rl: r4(+v.m_flDisallowAttackAfterReloadStartDuration), reload: rec.main, empty: rec.mainEmpty || null, alt: rec.alt || null, altEmpty: rec.altEmpty || null };
  }
  const L = new Map(Object.keys(EV).map(k => [k.toLowerCase(), k])), snd = {};
  for (const n of [...names].sort()) { const k = EV[n] ? n : L.get(n.toLowerCase()); const e = k && EV[k]; if (!e || typeof e !== 'object') continue;
    const curve = Array.isArray(e.distance_volume_mapping_curve) && e.use_distance_volume_mapping_curve !== false ? e.distance_volume_mapping_curve.filter(Array.isArray).map(p => [Math.round(+p[0] * 10) / 10, r3(+p[1])]) : [];
    const files = Object.keys(e).filter(x => /^vsnd_files/.test(x)).flatMap(x => [].concat(e[x])).filter(f => typeof f === 'string').map(f => f.split('/').pop().replace(/\.vsnd$/, ''));
    const num = (x, d) => Number.isFinite(+e[x]) && e[x] !== undefined ? +e[x] : d;
    snd[n] = [r3(num('volume', 1)), curve, r3(num('occlusion_intensity', 0)), r3(num('pitch', 1) + num('pitch_random_min', 0)), r3(num('pitch', 1) + num('pitch_random_max', 0)), e.suppression_enable === true ? 1 : 0, r3(num('suppression_volume_multiplier', 1)), r3(num('suppression_falloff_multiplier', 1)), e.display_broadcast === true ? 1 : 0, e.mixgroup || '', files]; }
  return { ref, snd };
}
export function refText({ ref, snd }) {
  let s = '// Generated by tools/import-cs2-reloads.mjs from CS2\'s own files (weapons.vdata, the first-person reload clips and\n// animgraphs, game_sounds_weapons.vsndevts of the local install). Numbers and names only: no audio, no model, no Valve\n// file. Regenerate after a CS2 update; do not edit by hand.\n';
  s += '// RELOAD_REF[gid]: vdata prefab · clip1 m_iMaxClip1 · reserve m_nPrimaryReserveAmmoMax (magazines when asClips:\n// m_bReserveAmmoAsClips) · single m_bReloadsSingleShells · rl m_flDisallowAttackAfterReloadStartDuration (s) · reload /\n// empty (weapon_ammo 0) / alt, altEmpty (the CZ75\'s reload2_*: front magazine gone): the clip, its length, add\n// (WPN_RELOAD_ADD_AMMO: the magazine seated), drop (WPN_DROP_MAG), silent (WPN_RELOAD_SILENT [from, to]), a shotgun\'s\n// intro / loop / outro lengths, snd [[s, sound event]]. All times in seconds from the clip\'s start.\n';
  s += 'export const RELOAD_REF = {\n'; for (const [k, v] of Object.entries(ref)) s += `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`; s += '};\n';
  s += '// RELOAD_SND[event]: [volume, distance curve [[HU, gain]…], occlusion, pitch lo, pitch hi, suppression_enable,\n// suppression_volume_multiplier, suppression_falloff_multiplier, display_broadcast, mixgroup, its files\' base names].\nexport const RELOAD_SND = {\n';
  for (const [k, v] of Object.entries(snd)) s += `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`; return s + '};\n';
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cs2 = arg('--cs2', join(homedir(), 'CS2-extract')), data = readReloads({ cs2, cache: arg('--cache', join(cs2, 'export', 'reloads')) });
  for (const [g, r] of Object.entries(data.ref)) console.log(g.padEnd(9), `${r.clip1}/${r.asClips ? r.reserve + '×' + r.clip1 + '=' + r.reserve * r.clip1 : r.reserve}`, 'rl', r.rl, 'clip', r.reload.dur, 'add', r.reload.add, r.empty ? 'empty add ' + r.empty.add : '', r.alt ? 'alt add ' + r.alt.add : '', r.reload.loop ? `intro ${r.reload.intro} loop ${r.reload.loop} outro ${r.reload.outro}` : '', 'silent', JSON.stringify(r.reload.silent));
  console.log(Object.keys(data.snd).length, 'reload sound events');
  if (!process.argv.includes('--dry')) { writeFileSync(join(REPO, 'dist/gd-reload-ref.js'), refText(data)); console.log('dist/gd-reload-ref.js written'); }
}
