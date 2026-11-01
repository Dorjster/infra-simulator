// Global Defensive · the round's sounds (package R): CS2's round start radio and its round-end music.
//  · the events: music.won / music.lost / music.mvp (CS2's default music kit) on the Music bus, radio.start.<voice> on the
//    Interface bus, none with a shipped placeholder (Valve's audio only from the user's own import);
//  · CS2's rule: the MVP's anthem for everyone when the round has an MVP, else won to the winners and lost to the losers;
//  · once per round, a late frame of an earlier round or match refused, a stale cue not played, the radio only for your
//    own team in its agent's voice (the same line on every computer of the team), never two end sounds;
//  · the host's MVP (arena-defuse.js roundMvp): defuser, planter, most kills then damage, none for a quiet round;
//  · the importer: the music kit's events and a voice's round start lines from CS2's response rules (synthetic files);
//  · on a computer with the import (user-assets, skipped in CI): the manifest's entries.
import assert from 'node:assert/strict'; import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { EVENTS, gdEvent, setGdOverrides, roundEndEvent, createRoundSounds, radioLine, seedOf, voiceOfModel, roundStartVoices, SIDE_VOICE, CAT_LEVEL, setAgentVoices, teamVoice } from '../dist/gd-sounds.js';
import { startArena, arenaApply, arenaTick } from '../dist/arena-logic.js';
import { DEFUSE, roundMvp } from '../dist/arena-defuse.js';
import { hurt } from '../dist/combat-logic.js';
import { ARENA_MAPS } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { weaponById } from '../dist/weapons-data.js';
import { loadEvents, loadTalker, talkerLines, plan, ROUND_START_CONCEPTS } from '../tools/import-cs2-sounds.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

// ── The events ──
for (const [id, cs] of [['music.won', 'Music.WonRound.valve_cs2_01'], ['music.lost', 'Music.LostRound.valve_cs2_01'], ['music.mvp', 'Music.MVPAnthem.valve_cs2_01']]) {
  const e = EVENTS[id]; ok(e && e.cs === cs && e.cat === 'music' && e.mix === 'music' && e.f.length === 0, id + ': CS2 music kit event, music bus, no shipped placeholder'); }
for (const v of ['sas', 'phoenix', 'seal', 'leet', 'balkan', 'swat', 'fbihrt', 'professional', 'gendarmerie_male', 'jungle_male']) { const e = EVENTS['radio.start.' + v]; ok(e && e.talker === v && e.cat === 'radio' && e.f.length === 0 && !e.cs, 'radio.start.' + v + ': a voice, team radio, nothing shipped'); }
ok(gdEvent('music.won').flat && gdEvent('radio.start.sas').flat, 'music and radio are never placed or distance-curved');
// The room's import: CS2's volume × this game's level, the radio's concept sets kept.
setGdOverrides({ 'music.won': { files: ['cs2:music/valve_cs2_01/wonround'], vol: 1 }, 'music.mvp': { files: ['cs2:music/valve_cs2_01/roundmvpanthem_01'], vol: .9 }, 'radio.start.sas': { files: ['a', 'b', 'c'], sets: [[0], [0], [1, 2], [1, 2]], vol: 1 } });
ok(Math.abs(gdEvent('music.won').vol - CAT_LEVEL.music) < 1e-9 && Math.abs(gdEvent('music.mvp').vol - .9 * CAT_LEVEL.music) < 1e-9, 'music level: CS2 volume × the music level');
ok(gdEvent('radio.start.sas').cs2 && gdEvent('radio.start.sas').sets.length === 4 && gdEvent('music.lost').files.length === 0, 'radio keeps its sets; an event not imported has no files');
setGdOverrides({});

// ── Agents → voices ──
ok(voiceOfModel('CS2: agents/models/ctm_sas/ctm_sas (Steam depot)') === 'sas' && voiceOfModel('CS2: agents/models/tm_phoenix/tm_phoenix (Steam depot)') === 'phoenix', 'the default agents: sas, phoenix');
ok(voiceOfModel('agents/models/ctm_st6/ctm_st6_varianti') === 'seal_epic' && voiceOfModel('agents/models/ctm_st6/ctm_st6_variante') === 'seal' && voiceOfModel('agents/models/tm_professional/tm_professional_varf2') === 'professional_epic' && voiceOfModel('agents/models/tm_jungle_raider/tm_jungle_raider_variante') === 'jungle_fem_epic', 'a vo_prefix wins over the model folder');
ok(voiceOfModel('nothing') === null && voiceOfModel(null) === null, 'no model: no voice');
assert.deepEqual(roundStartVoices({ ct: { from: 'agents/models/ctm_swat/ctm_swat_variantf' }, t: { from: 'agents/models/tm_leet/tm_leet_varianta' } }), ['swat_fem', 'leet', 'sas', 'phoenix']); n++;
setAgentVoices({ ct: { from: 'agents/models/ctm_fbi/ctm_fbi_variantb' } }); ok(teamVoice('ct') === 'fbihrt_epic' && teamVoice('t') === SIDE_VOICE.t, 'the room\'s agents set the sides\' voices; a side without one: its default'); setAgentVoices(null);

// ── CS2's round-end rule ──
ok(roundEndEvent('t', 't', null) === 'music.won' && roundEndEvent('t', 'ct', null) === 'music.lost' && roundEndEvent('ct', 'ct', null) === 'music.won' && roundEndEvent('ct', 't', null) === 'music.lost', 'no MVP: won to the winners, lost to the losers');
ok(['t', 'ct', 'spec', null].every(tm => roundEndEvent('ct', tm, { k: 'cy', why: 'defuse' }) === 'music.mvp'), 'an MVP: the anthem for everyone (both sides, spectators)');
ok(roundEndEvent('t', 'spec', null) === null && roundEndEvent('t', null, null) === null, 'spectators: nothing without an MVP');

// ── The radio line: a concept, then one of its lines ──
{ const files = Array.from({ length: 20 }, (_, i) => 'f' + i), sets = [[0, 1, 2], [0, 1, 2], [3, 4, 5, 6, 7, 8, 9, 10], [3, 4, 5, 6, 7, 8, 9, 10]], seen = new Set();
  for (let s = 0; s < 400; s++) { const i = radioLine(files, sets, seedOf('m.' + s + ':ct')); ok(i >= 0 && i <= 10, 'a line of the concepts'); seen.add(i < 3 ? 'go' : 'lock'); }
  ok(seen.size === 2, 'both concept groups are heard over rounds');
  for (let s = 0; s < 50; s++) ok(radioLine(files, [[], [], [5, 6], []], s) >= 5, 'concepts without lines are skipped');
  ok(radioLine([], sets, 3) === -1 && radioLine(['x'], null, 7) === 0, 'no files: none; no sets: any file'); }

// ── The round memory (fakes for the bank) ──
function rig({ have = ['music.won', 'music.lost', 'music.mvp', 'ui.round.won', 'ui.round.lost', 'radio.start.sas', 'radio.start.phoenix'], voice = s => SIDE_VOICE[s] } = {}) {
  const played = [], stops = { n: 0 }, files = Array.from({ length: 12 }, (_, i) => 'line' + i), H = new Set(have);
  const rs = createRoundSounds({ play: (id, o) => { played.push({ id, name: o?.name || null, key: o?.key || null }); return true; }, has: id => H.has(id), event: id => ({ files, sets: [[0, 1], [0, 1], [2, 3, 4, 5], [2, 3, 4, 5]] }), stop: () => (stops.n++, true), voice });
  return { rs, played, stops };
}
const R = (id, phase, extra = {}) => ({ round: { id, phase, freezeUntil: 1000, overAt: 50000, winner: null, mvp: null, ...extra } });
{ // A round seen by a Terrorist: freeze (the music stops), live (one radio line, phoenix), many frames (nothing more), over (one end sound).
  const { rs, played, stops } = rig(); let now = 900;
  rs.update(R('m1.1', 'freeze'), 't', now); ok(stops.n === 1 && played.length === 0, 'freeze: the music stops, nothing plays');
  for (let i = 0; i < 30; i++) rs.update(R('m1.1', 'freeze'), 't', now += 50); ok(stops.n === 1, '…once');
  now = 1100; for (let i = 0; i < 30; i++) rs.update(R('m1.1', 'live'), 't', now += 50);
  ok(played.length === 1 && played[0].id === 'radio.start.phoenix' && /^line\d+$/.test(played[0].name) && played[0].key === 'radio:m1.1:t', 'live: one round start line, in the Terrorists\' voice, tagged with the round');
  rs.update(R('m1.1', 'planted'), 't', now += 50);
  now = 50100; for (let i = 0; i < 30; i++) rs.update(R('m1.1', 'over', { winner: 't' }), 't', now += 50);
  ok(played.length === 2 && played[1].id === 'music.won' && played[1].key === 'round:m1.1', 'over (no MVP): one end sound — won');
  // The next round: freeze stops the music; a late frame of the round before is refused.
  rs.update(R('m1.2', 'freeze', { freezeUntil: 70000 }), 't', 60000); ok(stops.n === 2, 'the next freeze stops the round-end music');
  rs.update(R('m1.1', 'over', { winner: 't' }), 't', 60050); rs.update(R('m1.1', 'live'), 't', 60060); ok(played.length === 2 && rs.stats.stale === 2, 'a late frame of the round before: refused, nothing replayed');
  // A rematch: a new match id; then a late frame of the old match is refused too.
  rs.update(R('m2.1', 'freeze'), 't', 61000); ok(stops.n === 3, 'a new match: the music stops');
  rs.update(R('m1.2', 'over', { winner: 'ct', overAt: 61000 }), 't', 61010); ok(played.length === 2, 'a late frame of the last match: refused');
  rs.update(R('m2.1', 'live', { freezeUntil: 62000 }), 't', 62100); ok(played.length === 3 && played[2].key === 'radio:m2.1:t', 'the new match\'s round: its own radio line');
}
{ // Both sides' clients for the same round: each hears its own team's radio, in its voice, and the same line as its team mates.
  const a = rig(), b = rig(), c = rig(), s = rig();
  for (const [x, tm] of [[a, 't'], [b, 't'], [c, 'ct'], [s, 'spec']]) { x.rs.update(R('m3.4', 'freeze'), tm, 900); x.rs.update(R('m3.4', 'live'), tm, 1100); }
  ok(a.played[0].id === 'radio.start.phoenix' && c.played[0].id === 'radio.start.sas', 'Terrorists hear the T voice, CTs the CT voice');
  ok(a.played[0].name === b.played[0].name, 'two Terrorists hear the same line'); ok(s.played.length === 0, 'a spectator hears no team radio');
  ok(!a.played.some(p => p.id === 'radio.start.sas') && !c.played.some(p => p.id === 'radio.start.phoenix'), 'never the other team\'s radio');
  // The end with an MVP: the anthem, once, for both sides and the spectator; never also won / lost or the UI cue.
  for (const [x, tm] of [[a, 't'], [c, 'ct'], [s, 'spec']]) for (let i = 0; i < 10; i++) x.rs.update(R('m3.4', 'over', { winner: 'ct', mvp: { k: 'cy', why: 'defuse' } }), tm, 50100 + i * 50);
  ok(a.played.filter(p => /^(music|ui)\./.test(p.id)).map(p => p.id).join() === 'music.mvp' && c.played.filter(p => /^(music|ui)\./.test(p.id)).map(p => p.id).join() === 'music.mvp' && s.played.map(p => p.id).join() === 'music.mvp', 'MVP: one anthem for everyone, no won / lost, no UI cue');
}
{ // Fall-backs: no music imported → CS2's round-report cue; nothing imported → nothing; anthem missing → won / lost.
  const u = rig({ have: ['ui.round.won', 'ui.round.lost'] }); u.rs.update(R('m4.1', 'over', { winner: 'ct' }), 'ct', 50100); ok(u.played.map(p => p.id).join() === 'ui.round.won', 'no music imported: the round-report cue, once');
  const z = rig({ have: [] }); z.rs.update(R('m4.1', 'live'), 'ct', 1100); z.rs.update(R('m4.1', 'over', { winner: 'ct' }), 'ct', 50100); ok(z.played.length === 0, 'nothing imported: nothing plays (no wrong sound)');
  const w = rig({ have: ['music.won', 'music.lost'] }); w.rs.update(R('m4.1', 'over', { winner: 't', mvp: { k: 'ann' } }), 'ct', 50100); ok(w.played.map(p => p.id).join() === 'music.lost', 'anthem not imported: lost to the losers');
  const v = rig({ voice: () => 'leet_epic' }); v.rs.update(R('m4.1', 'live'), 't', 1100); ok(v.played[0].id === 'radio.start.phoenix', 'the agent\'s voice not imported: the side\'s default voice');
  const late = rig(); late.rs.update(R('m4.2', 'live'), 'ct', 1000 + 6000); late.rs.update(R('m4.2', 'over', { winner: 'ct' }), 'ct', 50000 + 6000); ok(late.played.length === 0, 'a cue seen 6 s after its moment (a stalled page): not played');
  const j = rig(); j.rs.update(R('m4.3', 'live'), 'ct', 1500); ok(j.played.length === 1, 'joining in the first moments of a round: its line still plays');
  const r2 = rig(); r2.rs.update(R('m4.4', 'live'), 'ct', 1100); r2.rs.reset(); r2.rs.update(R('m4.4', 'live'), 'ct', 1200); ok(r2.played.length === 2, 'reset (leaving the match) forgets the rounds');
}

// ── The host's MVP ──
const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: ARENA.cz + z, yaw: 0 });
function match() { let t = 7e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, freezeS: 1 }, t);
  const players = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Bo', pose: at(M.t[1] || M.t[0]) }, { name: 'Cy', pose: at(M.ct[0]) }, { name: 'Di', pose: at(M.ct[1] || M.ct[0]) }];
  const tick = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, players, .05, t); } };
  tick(50); const d = g.combat.d; d.teams.ann = d.teams.bo = 't'; d.teams.cy = d.teams.di = 'ct'; tick(1100); return { g, d, players, tick, now: () => t }; }
const ak = weaponById('ak'), usp = weaponById('usps');
{ // Elimination: Ann and Bo one kill each; Bo did more damage (50 to Cy before Ann's kill, 100 to Di) → Bo.
  const { g, d, tick, now } = match(); ok(d.round.phase === 'live', 'live');
  hurt(g, 'Bo', 'Cy', ak, 50, 'chest', now()); hurt(g, 'Ann', 'Cy', ak, 100, 'chest', now()); hurt(g, 'Bo', 'Di', ak, 100, 'chest', now()); tick(100);
  ok(d.round.phase === 'over' && d.round.winner === 't', 'Terrorists win by elimination');
  ok(d.round.mvp?.k === 'bo' && d.round.mvp.why === 'kills' && d.round.mvp.kills === 1, 'a tie on kills goes to damage this round (the dead\'s tally kept): ' + JSON.stringify(d.round.mvp));
  tick(DEFUSE.overMs + 100); ok(d.round.phase !== 'over' && !d.round.mvp && !d.round.rk, 'the next round starts with no MVP and no tallies'); }
{ // Most kills wins over more damage: Ann kills Cy and Di (200), Bo 90 to Di first.
  const { g, d, tick, now } = match(); hurt(g, 'Bo', 'Di', ak, 90, 'chest', now()); hurt(g, 'Ann', 'Cy', ak, 100, 'chest', now()); hurt(g, 'Ann', 'Di', ak, 100, 'chest', now()); tick(100);
  ok(d.round.mvp?.k === 'ann' && d.round.mvp.kills === 2, 'most kills: ' + JSON.stringify(d.round.mvp)); }
{ // Team kills and the losing side's kills never count: Di kills Ann (enemy, but Di's side loses), Bo team-kills… then CTs die.
  const { g, d, tick, now } = match(); hurt(g, 'Di', 'Ann', ak, 100, 'chest', now()); hurt(g, 'Bo', 'Cy', ak, 100, 'chest', now()); hurt(g, 'Bo', 'Di', ak, 100, 'chest', now()); tick(100);
  ok(d.round.winner === 't' && d.round.mvp?.k === 'bo' && d.round.mvp.kills === 2, 'the winning side\'s kills only'); }
{ // Bomb defused: the defuser, even with fewer kills than a team mate.
  const { g, d, players, tick, now } = match(); hurt(g, 'Di', 'Bo', ak, 100, 'chest', now());
  d.bomb.carrier = 'ann'; players[0].pose = at(M.siteGoals?.A || M.sites.A.slice(0, 2)); arenaApply(g, { type: 'plant', hold: true }, 'Ann', players, now()); tick(DEFUSE.plantMs + 200); ok(d.round.phase === 'planted', 'planted');
  players[2].pose = { ...players[0].pose, x: players[0].pose.x + 2 }; arenaApply(g, { type: 'defuse', hold: true }, 'Cy', players, now()); tick(DEFUSE.defuseMs + 300);
  ok(d.round.phase === 'over' && d.round.reason === 'defuse' && d.round.mvp?.k === 'cy' && d.round.mvp.why === 'defuse', 'defused: the defuser is MVP: ' + JSON.stringify(d.round.mvp)); }
{ // Bomb exploded: the planter, even when a team mate has the kills.
  const { g, d, players, tick, now } = match(); players[2].pose = at(M.ct[0]); players[3].pose = at(M.ct[1] || M.ct[0]);
  d.bomb.carrier = 'ann'; players[0].pose = at(M.siteGoals?.A || M.sites.A.slice(0, 2)); arenaApply(g, { type: 'plant', hold: true }, 'Ann', players, now()); tick(DEFUSE.plantMs + 200);
  hurt(g, 'Bo', 'Cy', ak, 60, 'chest', now()); tick(DEFUSE.bombMs + 200);
  ok(d.round.phase === 'over' && d.round.reason === 'bomb' && d.round.mvp?.k === 'ann' && d.round.mvp.why === 'plant', 'exploded: the planter is MVP: ' + JSON.stringify(d.round.mvp)); }
{ // Time out: a quiet round has no MVP; a CT who did damage without a kill is MVP (kills, then damage).
  const a = match(); a.tick(115000 + 500); ok(a.d.round.phase === 'over' && a.d.round.reason === 'time' && a.d.round.mvp === null, 'a quiet time-out: no MVP');
  const b = match(); hurt(b.g, 'Di', 'Ann', usp, 30, 'chest', b.now()); b.tick(115000 + 500); ok(b.d.round.reason === 'time' && b.d.round.mvp?.k === 'di' && b.d.round.mvp.kills === 0, 'time out: damage without a kill still makes the MVP');
  ok(roundMvp({ combat: {} }, 't', 'elim') === null, 'no round: no MVP'); }

// ── The importer (synthetic CS2-format files: no Valve data in the repo) ──
{ const dir = mkdtempSync(path.join(os.tmpdir(), 'gdr-')), w = (p, s) => { mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); writeFileSync(path.join(dir, p), s); };
  w('soundevents/music/valve_cs2_01/game_sounds_music.vsndevts', '<!-- kv3 -->\n{ Music.WonRound.valve_cs2_01 = { type = "csgo_music" volume = 1.0 vsnd_files = "sounds/music/valve_cs2_01/wonround.vsnd" } Music.MVPAnthem.valve_cs2_01 = { volume = 0.9 vsnd_files = [ "sounds/music/valve_cs2_01/roundmvpanthem_01.vsnd", ] } }');
  w('game_sounds_ui.vsndevts', '<!-- kv3 -->\n{ UIPanorama.round_report_round_won = { volume = 0.7 vsnd_files_track_01 = "sounds/ui/x.vsnd" } }');
  w('scripts/talker/vx.vrr', '<!-- kv3 -->\n{ m_ResponseGroups = [ { m_name = "radio.letsgovx" m_responses = [ { m_type = "SPEAK" m_value = "vx.go01" }, { m_type = "SPEAK" m_value = "vx.go02" }, ] }, { m_name = "radio.locknloadvx" m_responses = [ { m_type = "SPEAK" m_value = "vx.lock01" }, { m_type = "SPEAK" m_value = "vx.go02" }, { m_type = "SPEAK" m_value = "vx.missing" }, ] },'
    + ' { m_name = "a" m_responses = [ { m_type = "RESPONSE" m_value = "radio.letsgovx" } ] m_pEmbeddedRule = { m_Requirements = [ "TLK_radio.letsgo", "Isvx" ] } }, { m_name = "b" m_responses = [ { m_type = "RESPONSE" m_value = "radio.letsgovx" } ] m_pEmbeddedRule = { m_Requirements = [ "TLK_radio.go" ] } },'
    + ' { m_name = "c" m_responses = [ { m_type = "RESPONSE" m_value = "radio.locknloadvx" } ] m_pEmbeddedRule = { m_Requirements = [ "TLK_radio.locknload" ] } }, { m_name = "d" m_responses = [ { m_type = "RESPONSE" m_value = "radio.locknloadvx" } ] m_pEmbeddedRule = { m_Requirements = [ "TLK_radio.moveout" ] } }, ] }');
  w('soundevents/vo/agents/game_sounds_vx.vsndevts', '<!-- kv3 -->\n{ vx.go01 = { volume = 1.0 vsnd_files_track_01 = "sounds/vo/agents/vx/go01.vsnd" } vx.go02 = { vsnd_files_track_01 = "sounds/vo/agents/vx/go02.vsnd" } vx.lock01 = { vsnd_files_track_01 = "sounds/vo/agents/vx/lock01.vsnd" } }');
  const EV = loadEvents({ dir }); ok(EV['Music.WonRound.valve_cs2_01'] && EV['UIPanorama.round_report_round_won'], 'loadEvents reads the music kit file (at its depot path) and the flat ones');
  const P = plan(EV, { a: EVENTS['music.won'], b: EVENTS['music.mvp'], c: EVENTS['music.lost'] }); ok(P['music.won'].files[0] === 'sounds/music/valve_cs2_01/wonround' && P['music.won'].vol === 1 && P['music.mvp'].vol === .9 && P['music.lost'].missing, 'the music events resolve with CS2\'s volume; a missing one says so');
  assert.deepEqual(talkerLines(JSON.parse(JSON.stringify({ m_ResponseGroups: [] }))), [[], [], [], []]); n++;
  const T = loadTalker('vx', { dir }); ok(T && T.concepts === ROUND_START_CONCEPTS, 'a voice\'s talker file and events load');
  assert.deepEqual(T.files, ['sounds/vo/agents/vx/go01', 'sounds/vo/agents/vx/go02', 'sounds/vo/agents/vx/lock01']); assert.deepEqual(T.sets, [[0, 1], [0, 1], [2, 1], [2, 1]]); n += 2;
  const Q = plan(EV, { r: { ...EVENTS['radio.start.sas'], id: 'radio.start.vx', talker: 'vx' }, s: { ...EVENTS['radio.start.sas'], id: 'radio.start.nope', talker: 'nope' } }, v => loadTalker(v, { dir }));
  ok(Q['radio.start.vx'].files.length === 3 && Q['radio.start.vx'].sets.length === 4 && /TLK_radio\.go/.test(Q['radio.start.vx'].cs2) && Q['radio.start.nope'].missing, 'plan: a voice\'s lines and sets; a voice not there is missing'); }

// ── This computer's import (user-assets: absent in CI) ──
{ const p = path.join(root, 'user-assets/manifest.json'), gd = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).models?.gdSounds || {} : null;
  if (!gd || !gd['music.won']) console.log('SKIP: the round sounds are not imported on this computer (node tools/import-cs2-sounds.mjs --only music.won,music.lost,music.mvp,radio.start)');
  else { ok(['music.won', 'music.lost', 'music.mvp'].every(id => gd[id]?.files?.length === 1), 'imported: the three round-end sounds');
    const rs = Object.entries(gd).filter(([k]) => k.startsWith('radio.start.')); ok(rs.length >= 2 && rs.every(([, e]) => e.files.length >= 4 && e.sets?.length === 4 && e.sets.flat().every(i => i >= 0 && i < e.files.length)), 'imported: round start radio voices with their concept sets'); } }
console.log(`PASS: gd-round-sounds · ${n} checks (round-end music rule, MVP, once per round, stale refused, team-only radio, importer)`);
