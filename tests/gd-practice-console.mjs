// Global Defensive · the practice console (v53 S2, SPEC 1.3; dist/gd-console.js, the host's practice actions in
// dist/arena-logic.js / arena-nades.js / combat-logic.js):
//  · getpos prints CS2's line ("setpos x y z;setang pitch yaw 0.000000", 6 decimals, the eye 64.06 HU over the feet,
//    46.04 crouched; CS2's own coordinates on a converted CS2 map) and setpos / setang of that line puts you back
//    exactly there: the round trip, 300 random spots and looks on Mirage's file frame (when converted) and a built-in
//    map's — the same line again, the feet within 1e-6 HU, the angles within 1e-6°; CS2's own getpos lines (Mirage's
//    Cart) read in and printed back unchanged.
//  · The commands: setang, noclip / god toggles, sv_infinite_ammo 0 / 1 / 2, mp_roundtime / mp_freezetime (clamped),
//    bot_kick, sv_rethrow_last_grenade, lineup_save, unknown commands and bad numbers, practice-only outside practice.
//  · The host: god takes no damage (and only in practice), bot_kick one / all, a practice round (its clock, freeze,
//    the restart that respawns everyone and clears the grenades), sv_infinite_ammo 1 keeps a thrown grenade, a rethrow
//    needs none in hand — and none of it outside practice.
//   node tests/gd-practice-console.mjs
import { readFileSync, existsSync } from 'node:fs';
import { runCommand, getpos } from '../dist/gd-console.js';
import { mapFrame, parsePos, formatPos, EYE_HU, HU } from '../dist/gd-lineups.js';
import { ARENA_MAPS, useMapFile } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { startArena, arenaApply, arenaTick } from '../dist/arena-logic.js';
import { hurt, hpOf } from '../dist/combat-logic.js';
let pass = 0, fail = 0; const ok = (name, cond, info = '') => { cond ? pass++ : fail++; if (!cond || process.env.V) console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };

// A console context over a plain state (what lab.js gives: the movement's feet, duck, the raw look).
function rig(frame, practice = true) {
  const st = { x: ARENA.cx, y: 0, z: ARENA.cz, duck: 0, pitch: 0, yaw: 0 }, log = [];
  const ctx = { practice, frame, me: () => st, teleport: (x, y, z, p, yw) => { st.x = x; st.y = y; st.z = z; st.pitch = p; st.yaw = yw; log.push('tp'); }, look: (p, yw) => { st.pitch = p; st.yaw = yw; },
    toggle: k => (st[k] = !st[k]), set: (k, v) => { log.push(k + '=' + v); }, kick: n => { log.push('kick:' + (n ?? 'all')); }, rethrow: () => st.thrown ? 'Rethrew' : null, saveLineup: (n, pos) => { log.push('save:' + n + ':' + pos); return 'Saved'; }, lineups: () => ['a', 'b'], copy: t => { st.copied = t; } };
  return { st, ctx, log };
}
let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const frames = [['built-in Dust II (no file frame)', mapFrame({ size: [400, 400] }, ARENA.cx, ARENA.cz)]];
const MF = 'user-maps/mirage.bsp'; if (existsSync(MF) && readFileSync(MF).subarray(0, 4).toString() === 'CS2M') { useMapFile('mirage', readFileSync(MF)); frames.unshift(['Mirage (CS2 file frame)', mapFrame(ARENA_MAPS.mirage, ARENA.cx, ARENA.cz)]); } else console.log('SKIP Mirage frame: not converted on this computer');
for (const [label, frame] of frames) {
  const { st, ctx } = rig(frame); let worst = 0, worstA = 0, same = 0;
  for (let i = 0; i < 300; i++) {
    st.x = ARENA.cx + (rnd() - .5) * 400; st.y = rnd() * 60; st.z = ARENA.cz + (rnd() - .5) * 400; st.duck = i % 5 === 0 ? 1 : 0; st.pitch = (rnd() - .5) * 2.9; st.yaw = (rnd() - .5) * 12;
    const want = { ...st }, line = runCommand('getpos', ctx).lines[0];
    st.x += 50; st.y += 3; st.z -= 20; st.pitch = 0; st.yaw = 1;   // (somewhere else, looking elsewhere)
    const r = runCommand(line, ctx), back = runCommand('getpos', ctx).lines[0]; if (back === line) same++;
    worst = Math.max(worst, Math.hypot(st.x - want.x, st.y - want.y, st.z - want.z) / HU);
    const dy = Math.atan2(Math.sin(st.yaw - want.yaw), Math.cos(st.yaw - want.yaw)); worstA = Math.max(worstA, Math.abs(st.pitch - want.pitch) * 180 / Math.PI, Math.abs(dy) * 180 / Math.PI);
    if (r.error) { ok(label + ': setpos of a getpos line runs', false, line); break; } }
  ok(`${label}: getpos → setpos;setang → getpos gives the same line (300 spots, standing and crouched)`, same === 300, same + '/300');
  ok(`${label}: …and the same place (feet within 1e-5 HU) and look (within 1e-5°)`, worst < 1e-5 && worstA < 1e-5, worst.toExponential(2) + ' HU, ' + worstA.toExponential(2) + '°');
}
// CS2's own lines: read and printed back as CS2 prints them; the eye is 64.06 HU over the feet.
{ const L = 'setpos 360.075439 -691.968750 -100.067307;setang -37.951241 176.761139 0.000000', p = parsePos(L);
  ok('CS2\'s getpos line reads back to itself', formatPos(p) === L, formatPos(p));
  ok('setpos_exact, commas and no setang read too', parsePos('setpos_exact 1,2,3')?.z === 3 && !parsePos('setpos 1 2 3').hasAng && parsePos('setang 1 2').hasAng && !parsePos('setpos a b c') && !parsePos('hello'));
  const frame = frames[0][1], { st, ctx } = rig(frame); runCommand(L, ctx); const h = frame.toHammer(st.x, st.y, st.z);
  ok('setpos puts the feet 64.06 HU under the line\'s eye (CS2\'s view offset), standing', Math.abs(h[2] - (-100.067307 - EYE_HU.stand)) < 1e-6 && Math.abs(h[0] - 360.075439) < 1e-6, h.map(v => v.toFixed(4)).join(' '));
  st.duck = 1; runCommand(L, ctx); const hc = frame.toHammer(st.x, st.y, st.z); ok('…46.04 HU crouched', Math.abs(hc[2] - (-100.067307 - EYE_HU.duck)) < 1e-6, hc[2].toFixed(4));
  { const line = runCommand('getpos', ctx).lines[0]; ok('getpos goes to the clipboard as printed', st.copied === line); } }
// The commands.
{ const { st, ctx, log } = rig(frames[0][1]);
  runCommand('setang 12.5 -45', ctx); ok('setang: CS2 degrees → the look (pitch down positive, yaw − 90°)', Math.abs(st.pitch + 12.5 * Math.PI / 180) < 1e-12 && Math.abs(st.yaw - (-135) * Math.PI / 180) < 1e-12);
  ok('noclip / god toggle and say so', runCommand('noclip', ctx).lines[0] === 'noclip ON' && runCommand('noclip', ctx).lines[0] === 'noclip OFF' && runCommand('god', ctx).lines[0] === 'god ON');
  runCommand('sv_infinite_ammo 1', ctx); runCommand('sv_infinite_ammo 0', ctx); ok('sv_infinite_ammo 0 / 1 / 2 (3 refused)', log.includes('ammo=1') && log.includes('ammo=0') && runCommand('sv_infinite_ammo 3', ctx).error);
  runCommand('mp_roundtime 999', ctx); runCommand('mp_freezetime -4', ctx); ok('mp_roundtime / mp_freezetime clamped to 0–60', log.includes('roundtime=60') && log.includes('freezetime=0') && runCommand('mp_roundtime', ctx).error);
  runCommand('bot_kick', ctx); runCommand('bot_kick Bot 3', ctx); ok('bot_kick: all, or one by name', log.includes('kick:all') && log.includes('kick:Bot 3'));
  ok('sv_rethrow_last_grenade: none thrown yet → says so; after one → rethrows', runCommand('sv_rethrow_last_grenade', ctx).error && (st.thrown = true, runCommand('sv_rethrow_last_grenade', ctx).lines[0] === 'Rethrew'));
  runCommand('lineup_save Window from cart', ctx); ok('lineup_save keeps the getpos line with its name', log.some(l => l.startsWith('save:Window from cart:setpos ')));
  ok('unknown commands and two commands on a line', runCommand('sv_cheats 1', ctx).error && runCommand('echo a; echo b', ctx).lines.join() === 'a,b');
  const out = rig(frames[0][1], false); ok('outside practice: setpos, noclip, god … refused ("practice only"); getpos works', runCommand('noclip', out.ctx).error && /practice only/.test(runCommand('setpos 1 2 3', out.ctx).lines[0]) && !runCommand('getpos', out.ctx).error && !out.log.length); }

// ── The host's side ──
const T = 9.2e9, players = [{ name: 'Ann', pose: { x: ARENA.cx, y: 9.7, z: ARENA.cz } }];
{ const g = { levels: {} }; startArena(g, { map: 'yard', kind: 'dm', bots: 3, practice: { bots: 'stand' } }, T);
  arenaApply(g, { type: 'practice-god', on: true }, 'Ann', players, T); const r = hurt(g, 'Bot', 'Ann', { id: 'ak', name: 'AK-47' }, 50, 'chest', T + 5000);
  ok('god: no damage to you in practice', r.dmg === 0 && hpOf(g, 'Ann') === 100, JSON.stringify(r));
  arenaApply(g, { type: 'practice-god', on: false }, 'Ann', players, T); ok('god off: damage again', hurt(g, 'Bot', 'Ann', { id: 'ak', name: 'AK-47' }, 50, 'chest', T + 6000).dmg === 50);
  const names = g.arena.bots.map(b => b.name); arenaApply(g, { type: 'practice-kick', name: names[1] }, 'Ann', players, T); ok('bot_kick <name>: that bot only', g.arena.bots.length === 2 && !g.arena.bots.some(b => b.name === names[1]));
  arenaApply(g, { type: 'practice-kick' }, 'Ann', players, T); ok('bot_kick: all of them', g.arena.bots.length === 0);
  let threw = false; try { arenaApply(g, { type: 'practice-kick' }, 'Ann', players, T); } catch { threw = true; } ok('…and none left to kick: an error', threw);
  arenaApply(g, { type: 'practice', settings: { roundtime: 1, freezetime: 3 } }, 'Ann', players, T); const R = g.arena.practice.round;
  ok('mp_roundtime 1 / mp_freezetime 3: a practice round (3 s still, then 60 s)', R && R.free === T + 3000 && R.ends === T + 63000, JSON.stringify(R));
  g.combat.nades.push({ id: 'x', kind: 'smoke', phase: 'smoke', x: 0, y: 0, z: 0, at: T, firedAt: T }); g.combat.down.ann = { until: 4e15 };
  arenaTick(g, players, .05, T + 63001); const R2 = g.arena.practice.round;
  ok('the round\'s end: everyone respawned, the grenades gone, the next round (freeze first)', R2.n === 2 && R2.free === T + 63001 + 3000 && !g.combat.nades.length && !g.combat.down.ann && g.combat.spawnTo.ann?.at === T + 63001, JSON.stringify([R2, g.combat.nades.length]));
  arenaApply(g, { type: 'practice', settings: { roundtime: 0 } }, 'Ann', players, T); ok('mp_roundtime 0: no clock', !g.arena.practice.round);
  // sv_infinite_ammo 1: a thrown grenade stays; a rethrow needs none in hand.
  const l = g.arena.loadout.ann ??= {}; l.nades = ['smoke']; arenaApply(g, { type: 'practice', settings: { ammo: true, nades: true } }, 'Ann', players, T);
  arenaApply(g, { type: 'throw', kind: 'smoke', x: ARENA.cx, y: 9.7, z: ARENA.cz, dx: 0, dy: 0, dz: -1, strength: 'long' }, 'Ann', players, T); ok('sv_infinite_ammo 1: the smoke is still yours after the throw', l.nades.join() === 'smoke' && g.combat.nades.length === 1);
  // v53 S2 review — sv_infinite_ammo 1 (mag): shots never empty the magazine (CS2: no reloading); 2 (reserve only): they do.
  { const { takeShots, ammoOf } = await import('../dist/combat-logic.js'); arenaApply(g, { type: 'practice', settings: { mag: true } }, 'Ann', players, T); const m0 = ammoOf(g, 'Ann', 'ak')[0]; takeShots(g, 'Ann', 1000, 'ak'); takeShots(g, 'Ann', 1012, 'ak'); const m1 = ammoOf(g, 'Ann', 'ak')[0];
    arenaApply(g, { type: 'practice', settings: { mag: false } }, 'Ann', players, T); takeShots(g, 'Ann', 1015, 'ak'); const m2 = ammoOf(g, 'Ann', 'ak')[0];
    ok('sv_infinite_ammo 1: 12 shots leave the magazine full; with 2 (reserve only) 3 shots take 3', m0 > 3 && m1 === m0 && m2 === m0 - 3, JSON.stringify([m0, m1, m2])); }
  arenaApply(g, { type: 'practice', settings: { nades: false } }, 'Ann', players, T); l.nades = [];
  arenaApply(g, { type: 'throw', kind: 'flash', x: ARENA.cx, y: 9.7, z: ARENA.cz, dx: 0, dy: 0, dz: -1, strength: 'long', rethrow: true }, 'Ann', players, T); ok('sv_rethrow_last_grenade: thrown again with none in hand (practice)', g.combat.nades.length === 2 && g.combat.nades[1].kind === 'flash'); }
{ const g = { levels: {} }; startArena(g, { map: 'yard', kind: 'dm', bots: 1 }, T); let e1 = '', e2 = '';
  try { arenaApply(g, { type: 'practice-god', on: true }, 'Ann', players, T); } catch (e) { e1 = e.message; } try { arenaApply(g, { type: 'throw', kind: 'flash', x: ARENA.cx, y: 9.7, z: ARENA.cz, dx: 0, dy: 0, dz: -1, rethrow: true }, 'Ann', players, T); } catch (e) { e2 = e.message; }
  ok('a match (no practice): god refused, a "rethrow" with no grenade refused', /practice/.test(e1) && /no Flashbang/.test(e2), e1 + ' · ' + e2);
  g.arena.practice = undefined; ok('…and hurt works as before there', hurt(g, 'Bot', 'Ann', { id: 'ak', name: 'AK-47' }, 30, 'chest', T + 9000).dmg === 30); }
console.log((fail ? 'FAIL' : 'PASS') + `: practice console · ${pass}/${pass + fail} (getpos / setpos round trip on ${frames.length} frames, commands, the host's practice rules)`); if (fail) process.exitCode = 1;
