#!/usr/bin/env node
// Global Defensive's CS2 sounds, from YOUR OWN CS2 install, for YOUR OWN computer: every GD event's CS2 sound event
// (dist/gd-sounds.js EVENTS[id].cs) resolved through CS2's soundevents (files, volume, distance curve, instance limit,
// occlusion, pitch), each file decoded once from the depot with Source 2 Viewer, made Ogg Opus with ffmpeg, written to
// user-assets/sounds/cs2/… and listed in user-assets/manifest.json (models.sounds: name → file; models.gdSounds: event →
// files + CS2's tuning). Valve's audio is never committed or shipped: user-assets/ is git-ignored, and a LAN host serves
// it to the players in its own room only. The shipped placeholders in dist/sounds are never touched.
//   node tools/import-cs2-sounds.mjs                 import (backs up user-assets/sounds + manifest.json first, once,
//                                                    to ~/CS2-extract/backup/sounds-v50/)
//   node tools/import-cs2-sounds.mjs --dry           list what it would do
//   node tools/import-cs2-sounds.mjs --ref [dir]     rewrite dist/gd-sounds-ref.js (CS2's reference values per event)
//   node tools/import-cs2-sounds.mjs --doc           rewrite docs/GD-SOUNDS.md (events, CS2 sources, local coverage)
// --only <id,id…>: import just those GD events (e.g. c4.beep,c4.disarm.start), keeping the other events as they are.
//   The round sounds: --only music.won,music.lost,music.mvp,radio.start (radio.start: the round start radio of the
//   voices of this computer's agents — models.agents — and of the sides' defaults, gd-sounds.js roundStartVoices).
// Options: --cs2 <dir> (default ~/CS2-extract: tools/s2v/Source2Viewer-CLI, game/game/csgo/pak01_dir.vpk),
// --assets <dir> (default <repo>/user-assets), --events <dir> (decompiled *.vsndevts — flat, or at their depot paths with
// soundevents/music/…, soundevents/vo/agents/… and scripts/talker/*.vrr; default: decompiled from the depot),
// --cache <dir> (the decoded CS2 files kept between runs; default ~/CS2-extract/export/sounds).
// Merges, never replaces: every other models.sounds entry (the fp-* clip sounds fp_sounds.py adds, the older game
// names sounds_cs2.py adds) is kept (GD-AUD-19).
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseKV3, mergeEvents, resolveEvent } from './cs2-soundevents.mjs';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const EVENT_FILES = ['weapons', 'footsteps', 'player', 'physics', 'world', 'ui', 'music/valve_cs2_01/game_sounds_music'];   // (the last: CS2's default music kit — its round-end events)
export const MAX_TAKES = 8;   // (CS2 has up to 17 takes of a footstep; 8 keep the variety at half the memory)
export const MAX_LINES = 40;  // (a voice's round start radio: every line of CS2's four concepts — at most 29 in CS2's sets, ~1 s each)
// CS2's round start radio (talker concepts, scripts/talker/<voice>.vrr): when the freeze ends one player of each team says
// one of these on the team radio, in their agent's voice (the four concepts every voice's response rules list).
export const ROUND_START_CONCEPTS = ['radio.go', 'radio.letsgo', 'radio.locknload', 'radio.moveout'];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(k);
const relOf = f => f.includes('/') ? `soundevents/${f}.vsndevts` : `soundevents/game_sounds_${f}.vsndevts`;
// One decompiled file (a path inside the depot, e.g. soundevents/vo/agents/game_sounds_sas.vsndevts): from a folder of
// decompiled files (at its depot path, without the leading soundevents/, or flat by name), or decompiled now from the
// depot into the cache. null when neither has it.
export function eventFile(rel, { dir = null, cs2 = join(homedir(), 'CS2-extract') } = {}) {
  if (dir) { for (const p of [join(dir, rel), join(dir, rel.replace(/^soundevents\//, '')), join(dir, rel.split('/').pop())]) if (existsSync(p)) return p; return null; }
  const src = join(cs2, 'export', 'soundevents-txt'), out = join(src, rel); if (existsSync(out)) return out; mkdirSync(src, { recursive: true });
  try { execFileSync(join(cs2, 'tools/s2v/Source2Viewer-CLI'), ['-i', join(cs2, 'game/game/csgo/pak01_dir.vpk'), '-f', rel + '_c', '-o', src, '-d'], { stdio: 'ignore' }); } catch {}
  return existsSync(out) ? out : null;
}
// The soundevents as one table: from a folder of decompiled .vsndevts, or decompiled now from the depot (cached).
export function loadEvents({ dir = null, cs2 = join(homedir(), 'CS2-extract') } = {}) {
  return mergeEvents(...EVENT_FILES.map(f => eventFile(relOf(f), { dir, cs2 })).filter(Boolean).map(p => parseKV3(readFileSync(p, 'utf8'))));
}
// A voice's lines for some talker concepts, from CS2's response rules (scripts/talker/<voice>.vrr: the group whose rule
// requires TLK_<concept>, its RESPONSE groups expanded to their SPEAK lines): [[sound event…] per concept].
export function talkerLines(vrr, concepts = ROUND_START_CONCEPTS) { const G = {}; for (const g of vrr?.m_ResponseGroups || []) G[g.m_name] = g;
  const speak = (rs, d) => (rs || []).flatMap(r => r.m_type === 'SPEAK' ? [r.m_value] : r.m_type === 'RESPONSE' && d < 5 ? speak(G[r.m_value]?.m_responses, d + 1) : []);
  return concepts.map(c => { const g = Object.values(G).find(g => (g.m_pEmbeddedRule?.m_Requirements || []).includes('TLK_' + c)); return g ? speak(g.m_responses, 0) : []; }); }
// A voice's round start radio, resolved: the files of every line (deduplicated, at most MAX_LINES) and, per concept, the
// indices of its lines in them (sets: the game picks a concept, then one of its lines — as CS2 does), plus the tuning of
// the first line. null when the voice's response rules or sound events are not there.
export function loadTalker(voice, { dir = null, cs2 = join(homedir(), 'CS2-extract') } = {}) {
  const vp = eventFile(`scripts/talker/${voice}.vrr`, { dir, cs2 }), ep = eventFile(`soundevents/vo/agents/game_sounds_${voice}.vsndevts`, { dir, cs2 }); if (!vp || !ep) return null;
  const EV = parseKV3(readFileSync(ep, 'utf8')), per = talkerLines(parseKV3(readFileSync(vp, 'utf8'))), files = []; let first = null;
  const sets = per.map(evs => { const s = []; for (const n of evs) { const r = resolveEvent(EV, n); if (!r?.files?.length) continue; first ??= r; let i = files.indexOf(r.files[0]); if (i < 0 && files.length < MAX_LINES) { files.push(r.files[0]); i = files.length - 1; } if (i >= 0 && !s.includes(i)) s.push(i); } return s; });
  return first ? { voice, concepts: ROUND_START_CONCEPTS, files, sets, r: first } : null; }
const r3 = v => Math.round(v * 1000) / 1000, r1 = v => Math.round(v * 10) / 10;
// CS2's tuning of one event as the game stores it.
export const tuning = r => ({ vol: r3(r.volume), curve: (r.curve || []).map(p => [r1(p[0]), r3(p[1])]), limit: r.limit, occl: r3(r.occl), pitch: [r3(r.pitch + r.pitchRand[0]), r3(r.pitch + r.pitchRand[1])], delay: r3(r.delay) });
// dist/gd-sounds-ref.js: [volume, curve, instance limit, occlusion, pitch lo, pitch hi, delay] per CS2 event GD uses.
export function refModule(EV, EVENTS) { const out = {}, miss = [];
  for (const e of Object.values(EVENTS)) { if (!e.cs || out[e.cs]) continue; const r = resolveEvent(EV, e.cs); if (!r) { miss.push(e.cs); continue; } const t = tuning(r); out[e.cs] = [t.vol, t.curve, t.limit, t.occl, t.pitch[0], t.pitch[1], t.delay]; }
  let s = '// Generated by tools/import-cs2-sounds.mjs --ref from CS2\'s soundevents (game_sounds_*.vsndevts of the local install):\n// CS2\'s reference values for the events Global Defensive uses (dist/gd-sounds.js) — [volume, distance curve [[Hammer\n// units, gain]…], instance limit per source (0: none), occlusion intensity, pitch lo, pitch hi, delay s]. Numbers only;\n// no audio. Regenerate after a CS2 update; do not edit by hand.\nexport const REF = {\n';
  const ks = Object.keys(out); for (let i = 0; i < ks.length; i += 3) s += '  ' + ks.slice(i, i + 3).map(k => `'${k}': ${JSON.stringify(out[k])}`).join(', ') + ',\n';
  return { text: s + '};\n', miss }; }
// A CS2 file path → this computer's name and file for it ('sounds/weapons/c4/c4_disarmstart' → cs2:weapons/c4/c4_disarmstart).
export const nameOf = path => 'cs2:' + path.replace(/^sounds\//, ''), fileOf = path => 'sounds/cs2/' + path.replace(/^sounds\//, '') + '.ogg';
// What one event needs: CS2's event, its files (at most MAX_TAKES) and tuning.
// talk(voice): loadTalker, for the events that are a voice's round start radio (e.talker).
export function plan(EV, EVENTS, talk = null) { const out = {};
  for (const e of Object.values(EVENTS)) { if (e.talker) { const T = talk?.(e.talker); out[e.id] = T?.files.length ? { cs2: `${e.talker}.vrr: TLK_${T.concepts.join('|')}`, files: T.files, sets: T.sets, ...tuning(T.r) } : { cs2: `${e.talker}.vrr`, files: [], missing: 'voice not in this install' }; continue; }
    if (!e.cs) continue; const r = resolveEvent(EV, e.cs); if (!r || !r.files.length) { out[e.id] = { cs2: e.cs, files: [], missing: r ? 'no files in the event' : 'event not in these soundevents' }; continue; }
    out[e.id] = { cs2: e.cs, files: r.files.slice(0, MAX_TAKES), ...tuning(r) }; }
  return out; }
function backup(assets, cs2) { const to = join(cs2, 'backup', 'sounds-v50'); if (existsSync(join(to, 'manifest.json'))) return to; mkdirSync(to, { recursive: true });
  if (existsSync(join(assets, 'sounds'))) cpSync(join(assets, 'sounds'), join(to, 'sounds'), { recursive: true }); cpSync(join(assets, 'manifest.json'), join(to, 'manifest.json')); return to; }
// Decode one CS2 file (Source 2 Viewer: the sound inside, WAV or MP3, cached under export/sounds like sounds_cs2.py),
// then Ogg Opus (kept stereo: the game folds a placed sound to mono itself, and your own gun keeps its stereo).
function extract(path, cs2, assets, cache = join(cs2, 'export', 'sounds')) { const tmp = join(cache, path.replace(/\//g, '__') + '.snd'), dst = join(assets, fileOf(path)); mkdirSync(dirname(tmp), { recursive: true });
  if (!existsSync(tmp)) try { execFileSync(join(cs2, 'tools/s2v/Source2Viewer-CLI'), ['-i', join(cs2, 'game/game/csgo/pak01_dir.vpk'), '-f', path + '.vsnd_c', '-o', tmp, '-d'], { stdio: 'ignore', cwd: dirname(tmp) }); } catch {}
  if (!existsSync(tmp) || statSync(tmp).size < 64) return false;
  if (!existsSync(dst) || statSync(dst).mtimeMs < statSync(tmp).mtimeMs) { mkdirSync(dirname(dst), { recursive: true }); execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-c:a', 'libopus', '-b:a', /weapons\/[^/]+\/[^/]*(_0\d|-1|distant)/.test(path) ? '112k' : '96k', dst]); }
  return true; }
// cache: where the decoded CS2 files are kept between runs (default ~/CS2-extract/export/sounds); talk: loadTalker.
export function importSounds({ EV, EVENTS, assets, cs2, dry = false, only = null, log = console.log, cache = undefined, talk = null }) {
  const manP = join(assets, 'manifest.json'); if (!existsSync(manP)) throw new Error('no ' + manP + ' (import the CS2 models first: tools/import-cs2-models.mjs)');
  const man = JSON.parse(readFileSync(manP, 'utf8')); man.models ??= {}; const snd = man.models.sounds ??= {}, P = plan(EV, only ? Object.fromEntries(Object.entries(EVENTS).filter(([id]) => only.includes(id))) : EVENTS, talk);   // (--only: just those events; the rest of models.gdSounds is kept)
  const byFrom = new Map(Object.entries(snd).map(([n, s]) => [String(s.from || '').replace(/^CS2: /, ''), n]));   // (a file already imported under another name: reused, not copied again)
  const paths = [...new Set(Object.values(P).flatMap(p => p.files))]; log(`${Object.keys(P).length} GD events with a CS2 event · ${paths.length} CS2 files (${paths.filter(p => byFrom.has(p)).length} already imported)`);
  if (dry) return { plan: P, paths };
  log('backup:', backup(assets, cs2));
  const done = new Map(); let n = 0;
  for (const p of paths) { if (byFrom.has(p) && existsSync(join(assets, snd[byFrom.get(p)].file))) { done.set(p, byFrom.get(p)); continue; }
    if (extract(p, cs2, assets, cache)) { const name = nameOf(p); snd[name] = { file: fileOf(p), from: 'CS2: ' + p }; done.set(p, name); } if (++n % 25 === 0) log(`  ${n} decoded…`); }
  const gd = {}, missing = {};
  for (const [id, p] of Object.entries(P)) { const files = p.files.map(f => done.get(f)).filter(Boolean); if (!files.length) { missing[id] = { cs2: p.cs2, need: p.files, why: p.missing || 'not decoded' }; continue; } const { files: _, missing: __, ...t } = p;
    if (p.sets) { const at = []; let j = 0; for (const f of p.files) at.push(done.get(f) ? j++ : -1); t.sets = p.sets.map(s => s.map(i => at[i]).filter(i => i >= 0)); }   // (a radio line that failed to decode: its concept keeps the others)
    gd[id] = { ...t, files }; }
  man.models.gdSounds = only ? { ...(man.models.gdSounds || {}), ...gd } : gd; man.hash = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 12);
  writeFileSync(manP, JSON.stringify(man, null, 1)); log(`installed ${Object.keys(gd).length} GD events · ${Object.keys(missing).length} without files · manifest hash ${man.hash}`);
  return { gd, missing }; }
// docs/GD-SOUNDS.md: every event, CS2's event and file(s), whether this computer's import covers it, and what is missing.
export function docText(EV, EVENTS, gd = {}) { const rows = [], miss = [];
  const cat = e => e.cat === 'ui' ? 'UI 2D' : e.cat === 'own' ? 'own 2D' : e.cat === 'music' ? 'music 2D' : e.cat === 'radio' ? 'team radio 2D' : 'world (yours 2D)';
  for (const e of Object.values(EVENTS)) { if (e.talker) { const have = gd[e.id]?.files?.length || 0; rows.push(`| \`${e.id}\` | ${cat(e)} | ${e.talker}.vrr: TLK_radio.go / letsgo / locknload / moveout | \`sounds/vo/agents/${e.talker}/…\` | silent | | ${have ? `yes (${have})` : 'not imported'} |`); continue; }
    const r = e.cs ? resolveEvent(EV, e.cs) : null, files = r?.files || [], have = gd[e.id]?.files?.length || 0;
    const status = !e.cs ? 'no CS2 event' : !r ? 'CS2 event not found' : have ? `yes (${have})` : 'missing';
    if (e.cs && !have) miss.push(`- \`${e.id}\` — ${e.cs}: ${files.length ? files.slice(0, MAX_TAKES).map(f => '`' + f + '.vsnd_c`').join(', ') : '(no files in the event)'}`);
    rows.push(`| \`${e.id}\` | ${cat(e)} | ${e.cs || '—'} | ${files.length ? '`' + files[0] + '`' + (files.length > 1 ? ` +${files.length - 1}` : '') : '—'} | ${e.f.length ? '`' + e.f[0] + '`' + (e.f.length > 1 ? ` +${e.f.length - 1}` : '') : e.syn ? 'synth: ' + e.syn : 'silent'} | ${e.clip ? 'clip `' + e.clip + '`' : ''} | ${status} |`); }
  return { rows, miss }; }
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const cs2 = arg('--cs2', join(homedir(), 'CS2-extract')), assets = arg('--assets', join(REPO, 'user-assets'));
  const { EVENTS } = await import('../dist/gd-sounds.js');
  if (has('--ref')) { const EV = loadEvents({ dir: arg('--ref', null) || arg('--events', null), cs2 }), { text, miss } = refModule(EV, EVENTS); writeFileSync(join(REPO, 'dist/gd-sounds-ref.js'), text); console.log('dist/gd-sounds-ref.js written', miss.length ? 'missing: ' + miss.join(', ') : ''); }
  else if (has('--doc')) { const EV = loadEvents({ dir: arg('--events', null), cs2 }), man = existsSync(join(assets, 'manifest.json')) ? JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8')) : {}, { rows, miss } = docText(EV, EVENTS, man.models?.gdSounds || {});
    const p = join(REPO, 'docs/GD-SOUNDS.md'), old = existsSync(p) ? readFileSync(p, 'utf8') : '', head = old.includes('<!-- table -->') ? old.slice(0, old.indexOf('<!-- table -->')) : '# Global Defensive sounds\n\n';
    writeFileSync(p, head + '<!-- table -->\n| Event | Category | CS2 event | CS2 file | Shipped placeholder | Tied to | Local CS2 copy |\n|---|---|---|---|---|---|---|\n' + rows.join('\n') + `\n\n## Missing on this computer (${new Date().toISOString().slice(0, 10)})\n\nEach is a \`.vsnd_c\` in \`game/csgo/pak01_dir.vpk\`; the import decodes it with Source 2 Viewer (WAV or MP3 inside) and stores Ogg Opus (96–112 kbps, the file's own channels) in \`user-assets/sounds/cs2/\`.\n\n` + (miss.join('\n') || '- none') + '\n');
    console.log('docs/GD-SOUNDS.md written:', rows.length, 'events,', miss.length, 'missing'); }
  else { const dir = arg('--events', null), EV = loadEvents({ dir, cs2 }), { roundStartVoices } = await import('../dist/gd-sounds.js');
    const man = existsSync(join(assets, 'manifest.json')) ? JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8')) : {};
    const voices = roundStartVoices(man.models?.agents), only = arg('--only', null)?.split(',').flatMap(id => id === 'radio.start' ? voices.map(v => 'radio.start.' + v) : [id]) || null;   // (radio.start: the voices of this computer's agents and the sides' defaults)
    const events = only ? EVENTS : Object.fromEntries(Object.entries(EVENTS).filter(([, e]) => !e.talker || voices.includes(e.talker)));   // (a full import: those voices only, not all of CS2's)
    importSounds({ EV, EVENTS: events, assets, cs2, dry: has('--dry'), only, cache: arg('--cache', undefined), talk: v => loadTalker(v, { dir, cs2 }) }); }
}
