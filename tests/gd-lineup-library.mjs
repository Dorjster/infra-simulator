// Global Defensive · the lineup library (v53 S2, SPEC 1.3; dist/gd-lineups.js, dist/gd-lineup-seeds.js, the room's
// /api/lineups/<map>, the practice preview's flight):
//  · the shipped seeds: at least 6 smokes and 4 flashbangs (pop-flashes among them) for each of Mirage, Dust II,
//    Inferno, Nuke, Anubis, Ancient and Overpass (Nuke and Anubis: 3 flashes — all the public ones a getpos repeats),
//    each a clean lineup with its public source, CS2's landing point and a unique id (where they land: gd-lineups.mjs);
//  · the aim target: green within 0.1° (AIM_OK) — the larger of the pitch and yaw differences, the yaw wrapped at ±180°;
//  · a lineup's throw: standing / crouched eye, a jump-throw's take-off speed, a run-jump's speed along the yaw;
//  · the player's own: cleaned (junk refused), merged after the seeds without doubles, at most MAX_USER a map; saved
//    and read back through the room (POST / GET /api/lineups/<map> into a temporary user-assets folder, the file
//    written whole: never a half file), ids replaced, removed, a bad map name refused;
//  · the preview flies the throw's own steps: simThrow into a reused flight object = simThrow into a new one, bit for
//    bit, for 120 random throws (a converted CS2 Mirage when there is one) — and allocates nothing per frame
//    (20 000 previews; re-runs itself with --expose-gc).
//   node tests/gd-lineup-library.mjs
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
import { readFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { SEEDS } from '../dist/gd-lineup-seeds.js';
import { seedsFor, lineupsFor, cleanLineup, userFile, parsePos, formatPos, aimOff, aimed, AIM_OK, toLook, lineupThrow, lineupStand, mapFrame, MAX_USER, HU, EYE_HU, JUMP_HU, RUN_HU, lineupFrom, saveArgs } from '../dist/gd-lineups.js';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { simThrow, throwPacket } from '../dist/arena-nades.js';
import { startRoom } from '../lan/room.mjs';
let pass = 0, fail = 0; const ok = (name, cond, info = '') => { cond ? pass++ : fail++; if (!cond || process.env.V) console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };

// ── the seeds ──
const MAPS = ['mirage', 'dust2', 'inferno', 'nuke', 'anubis', 'ancient', 'overpass'], FEWER = { nuke: 3, anubis: 3 };
for (const m of MAPS) { const L = seedsFor(m), s = L.filter(l => l.kind === 'smoke').length, f = L.filter(l => l.kind === 'flash').length, ids = new Set(L.map(l => l.id));
  ok(`${m}: ${s} smokes, ${f} flashbangs shipped (≥ 6 / ≥ ${FEWER[m] ?? 4})`, s >= 6 && f >= (FEWER[m] ?? 4));
  ok(`${m}: every seed clean, sourced, with CS2's landing point, its own id`, ids.size === L.length && L.every(l => { const c = cleanLineup(l, m); return c && c.pos === l.pos && /^https:\/\/www\.cs2util\.com\//.test(l.src) && l.land?.length === 3 && ['left', 'right', 'both'].includes(l.button) && ['stand', 'crouch', 'jump'].includes(l.move); })); }
{ const all = MAPS.flatMap(m => seedsFor(m)), pops = MAPS.filter(m => seedsFor(m).some(l => l.kind === 'flash' && l.pop === true));   // (v53 S2 review: on EVERY map — pop: true, checked against the map by tests/gd-lineups.mjs popFlash)
  ok('pop-flashes among them on every map (pop: true — spares the thrower turned away, blinds round the corner)', pops.length === MAPS.length, MAPS.map(m => m + ' ' + seedsFor(m).filter(l => l.pop).length).join(' '));
  ok('standing, crouched and jump-throws; left, right and both buttons', ['stand', 'crouch', 'jump'].every(v => all.some(l => l.move === v)) && ['left', 'right', 'both'].every(v => all.some(l => l.button === v)));
  ok('seedsFor gives copies (a change never reaches the shipped table)', (seedsFor('mirage')[0].land[0] = 1e9, SEEDS.mirage[0].land[0] !== 1e9)); }
// ── aim: green within 0.1° ──
{ const L = { pos: 'setpos 0 0 0;setang -37.951241 176.761139 0.000000' }, p = parsePos(L.pos), at = (dp, dy) => { const l = toLook(p.pitch + dp, p.yaw + dy); return aimOff(L, l.pitch, l.yaw); };
  ok('aimOff 0 on the lineup\'s own angles', at(0, 0) < 1e-9, at(0, 0));
  ok('within 0.1° (pitch 0.099°, yaw 0.099°): green', aimed(L, toLook(p.pitch + .099, p.yaw).pitch, toLook(p.pitch, p.yaw).yaw) && aimed(L, toLook(p.pitch, p.yaw).pitch, toLook(p.pitch, p.yaw - .099).yaw));
  ok('0.101° off (either angle): not yet', !aimed(L, toLook(p.pitch + .101, p.yaw).pitch, toLook(p.pitch, p.yaw).yaw) && !aimed(L, toLook(p.pitch, p.yaw).pitch, toLook(p.pitch, p.yaw + .101).yaw), [at(.101, 0), at(0, .101)].map(v => v.toFixed(4)).join(' '));
  ok('yaw wraps: 179.95° vs −179.97° is 0.08° apart', Math.abs(aimOff({ pos: 'setpos 0 0 0;setang 0 179.95 0' }, 0, (-179.97 - 90) * Math.PI / 180) - .08) < 1e-6);
  ok('AIM_OK is 0.1°', AIM_OK === .1); }
// ── a lineup's throw ──
{ const fr = mapFrame({ size: [400, 400] }, ARENA.cx, ARENA.cz), base = { pos: 'setpos 100 200 64.0626;setang 10 30 0', kind: 'smoke', button: 'left' };
  const st = lineupThrow({ ...base, move: 'stand' }, fr), cr = lineupThrow({ ...base, move: 'crouch', pos: 'setpos 100 200 46.045;setang 10 30 0' }, fr), jt = lineupThrow({ ...base, move: 'jump' }, fr), rj = lineupThrow({ ...base, move: 'runjump' }, fr);
  ok('standing: the feet 64.06 HU under the eye, no speed; crouched: 46.04, ducked', Math.abs(st.y) < 1e-9 && !st.vx && !st.vy && st.duck === 0 && Math.abs(cr.y) < 1e-9 && cr.duck === 1);
  ok('a jump-throw: CS2\'s take-off speed 301.993 u/s up (the throw delay is cs2Release\'s)', Math.abs(jt.vy / HU - JUMP_HU) < 1e-9 && jt.jt === 1 && !jt.vx);
  const yw = toLook(10, 30).yaw; ok('a run-jump: a grenade\'s 245 u/s along the yaw, and the jump', Math.abs(Math.hypot(rj.vx, rj.vz) / HU - RUN_HU) < 1e-9 && Math.abs(Math.atan2(-rj.vx, -rj.vz) - yw) < 1e-9 && rj.jt === 1);
  ok('the strengths: left long, right short, both medium', lineupThrow({ ...base, move: 'stand', button: 'right' }, fr).strength === 'short' && lineupThrow({ ...base, move: 'stand', button: 'both' }, fr).strength === 'medium' && st.strength === 'long');
  const s2 = lineupStand({ ...base, move: 'stand' }, fr), back = fr.toHammer(s2.x, s2.y, s2.z); ok('the built-in frame: Hammer ↔ game exactly', Math.abs(back[0] - 100) < 1e-9 && Math.abs(back[1] - 200) < 1e-9 && Math.abs(back[2] - (64.0626 - EYE_HU.stand)) < 1e-9); }
// ── the player's own ──
{ const mine = lineupFrom('mirage', 'setpos 1 2 3;setang 4 5 0', { name: 'Mine', kind: 'flash', button: 'both' });
  ok('lineup_save: a clean lineup of yours from a getpos line', mine && mine.user && mine.kind === 'flash' && mine.button === 'both' && mine.pos === 'setpos 1.000000 2.000000 3.000000;setang 4.000000 5.000000 0.000000');
  ok('junk refused: no getpos, no setang, unknown grenade, not an object', !cleanLineup({ kind: 'smoke', pos: 'hello' }) && !cleanLineup({ kind: 'smoke', pos: 'setpos 1 2 3' }) && !cleanLineup({ kind: 'nuke', pos: 'setpos 1 2 3;setang 0 0 0' }) && !cleanLineup('x'));
  const evil = cleanLineup({ kind: 'smoke', pos: 'setpos 1 2 3;setang 0 0 0', name: '<img src=x onerror=1>' + 'x'.repeat(300), pic: '../../etc/passwd' }); ok('text cut short and stripped of markup, a picture path only a plain file name', evil.name.length <= 80 && !/[<>]/.test(evil.name) && evil.pic === '');
  const merged = lineupsFor('mirage', [mine, mine, { ...SEEDS.mirage[0] }]); ok('merged after the seeds, without doubles (by id)', merged.length === SEEDS.mirage.length + 1 && merged.at(-1).id === mine.id);
  const many = Array.from({ length: MAX_USER + 30 }, (_, i) => ({ ...mine, id: 'u' + i })); ok(`at most ${MAX_USER} kept a map (the newest)`, userFile('mirage', many).lineups.length === MAX_USER && userFile('mirage', many).lineups[0].id === 'u30'); }
// ── the room: saved and read back (a temporary user-assets folder) ──
{ const tmp = mkdtempSync(path.join(os.tmpdir(), 'gdlu-')), maps = mkdtempSync(path.join(os.tmpdir(), 'gdlm-'));
  const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(tmp, 's.json'), assetsDir: path.join(tmp, 'assets'), mapsDir: maps, roomCode: 'LINE02', hostKey: 'k', log: () => {}, error: () => {} });
  const base = `http://127.0.0.1:${room.port ?? room.address?.().port ?? room.server?.address().port}`, req = async (p, body) => { const r = await fetch(base + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, j: await r.json().catch(() => null), cache: r.headers.get('cache-control') }; };
  try {
    let r = await req('/api/lineups/mirage'); ok('GET with no file: none yet (not cached)', r.status === 200 && r.j.lineups.length === 0 && r.cache === 'no-store', JSON.stringify(r));
    const a = lineupFrom('mirage', 'setpos 360.075439 -691.968750 -100.067307;setang -37.951241 176.761139 0.000000', { name: 'Window from cart', kind: 'smoke' });
    r = await req('/api/lineups/mirage', { add: a }); ok('POST add: kept (this computer)', r.status === 200 && r.j.lineups.length === 1 && r.j.lineups[0].name === 'Window from cart', JSON.stringify(r.j)?.slice(0, 200));
    r = await req('/api/lineups/mirage', { add: { ...a, name: 'Window (renamed)' } }); ok('the same id again: replaced, not doubled', r.j.lineups.length === 1 && r.j.lineups[0].name === 'Window (renamed)');
    await req('/api/lineups/mirage', { add: lineupFrom('mirage', 'setpos 1 2 3;setang 0 0 0', { name: 'Two', kind: 'flash' }) });
    const file = path.join(tmp, 'assets', 'lineups', 'mirage.json'), disk = JSON.parse(readFileSync(file, 'utf8'));
    ok('on disk: user-assets/lineups/mirage.json, whole, no temporary file left', disk.map === 'mirage' && disk.lineups.length === 2 && !readdirSync(path.dirname(file)).some(f => f.endsWith('.tmp')));
    r = await req('/api/lineups/mirage'); ok('GET reads it back', r.j.lineups.length === 2 && r.j.lineups.every(l => l.user));
    r = await req('/api/lineups/mirage', { remove: a.id }); ok('POST remove', r.j.lineups.length === 1 && r.j.lineups[0].name === 'Two');
    r = await req('/api/lineups/mirage', { add: { kind: 'smoke', pos: 'nonsense' } }); ok('a bad lineup refused (400)', r.status === 400);
    r = await req('/api/lineups/..%2Fx'); ok('a bad map name: not served', r.status >= 400, String(r.status));
    ok('another map has its own file', (await req('/api/lineups/dust2')).j.lineups.length === 0);
  } finally { await room.close?.(); room.server?.close?.(); } }
// ── the preview: the throw's own steps, into a reused flight, without garbage ──
{ let boxes = [], bounds = null, label = 'no map (flat)'; const F = 'user-maps/mirage.bsp';
  if (existsSync(F) && readFileSync(F).subarray(0, 4).toString() === 'CS2M') { useMapFile('mirage', readFileSync(F)); const M = ARENA_MAPS.mirage, [W, D] = M.size; boxes = mapBoxes(M, ARENA.cx, ARENA.cz); bounds = { minX: ARENA.cx - W / 2, maxX: ARENA.cx + W / 2, minZ: ARENA.cz - D / 2, maxZ: ARENA.cz + D / 2 }; label = 'CS2 Mirage';
    var fr = mapFrame(M, ARENA.cx, ARENA.cz); }
  let seed = 777; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, G = {}, P = {}; let same = 0;
  const L0 = fr ? seedsFor('mirage') : [];
  for (let i = 0; i < 120; i++) { const base = L0.length ? lineupThrow(L0[i % L0.length], fr) : { x: ARENA.cx, y: 0, z: ARENA.cz, duck: 0, vx: 0, vy: 0, vz: 0, pitch: 0, yaw: 0, strength: 'long' };
    const s = { ...base, pitch: base.pitch + (rnd() - .5) * .3, yaw: base.yaw + (rnd() - .5) * .3, strength: ['long', 'medium', 'short'][i % 3], vx: (base.vx || 0) + (i % 4 === 1 ? (rnd() - .5) * 30 : 0), jt: i % 5 === 2 ? 1 : base.jt, vy: i % 5 === 2 ? JUMP_HU * HU : base.vy };
    const kind = ['smoke', 'flash', 'he', 'molotov'][i % 4], a = simThrow(kind, throwPacket(s), boxes, bounds, 8000), b = simThrow(kind, throwPacket(s, P), boxes, bounds, 8000, null, true, G);
    if (a.n === b.n && a.x === b.x && a.y === b.y && a.z === b.z && a.off === b.off) same++; }
  ok(`the preview's flight (a reused object) = the throw's, bit for bit (120 throws, ${label})`, same === 120, same + '/120');
  // the session's own preview (arena-practice.js createFlightPreview): a still aim flies nothing again; a moving one flies
  const { createFlightPreview } = await import('../dist/arena-practice.js'), FPv = createFlightPreview(() => boxes, () => bounds), arr = new Float32Array(260 * 3);
  const s = L0.length ? lineupThrow(L0[0], fr) : { x: ARENA.cx, y: 0, z: ARENA.cz, duck: 0, vx: 0, vy: 0, vz: 0, pitch: -.3, yaw: 0, strength: 'long' };
  const g0 = FPv.hold('smoke', s, arr), ref = simThrow('smoke', throwPacket(s), boxes, bounds, 8000); ok('the session\'s preview ends where the throw does', g0.x === ref.x && g0.z === ref.z && g0.n === ref.n && FPv.n > 2, `${FPv.n} points, ${FPv.nb} bounces`);
  const still = n => { for (let i = 0; i < n; i++) FPv.hold('smoke', s, arr); }, moving = n => { for (let i = 0; i < n; i++) { s.pitch += 1e-7; FPv.hold('flash', s, arr); } };
  const heap = (f, n) => { f(2000); const r = () => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; f(n); return process.memoryUsage().heapUsed - h0; }; return Math.min(r(), r(), r()); };
  const f0 = FPv.flights, dStill = heap(still, 200000); ok('a still aim: nothing flown again, nothing allocated (200 000 frames grow the heap < 64 KB)', FPv.flights === f0 && dStill < 64 * 1024, (dStill / 1024).toFixed(1) + ' KB');
  const dMove = heap(moving, 20000); ok('a moving aim: one flight a frame, no object kept (< 1 KB a flight of short-lived numbers)', dMove / 20000 < 1024, (dMove / 20000).toFixed(0) + ' B a flight'); }
// v53 S2 review: lineup_save records how it is thrown (the words, else the last throw), and standing on a spot costs
// nothing per frame (the practice tools cache each lineup's look in place(); aimOff reads the lineup's cached angles).
{ const a = saveArgs('Window from cart right jump'), b = saveArgs('My smoke', { strength: 'medium', jt: 1 }), c = saveArgs('', null, 1), d = saveArgs('Mid walk both');
  ok('lineup_save words: the button and move end the line (either order), else the last throw\'s, else crouched / standing, left',
    a.name === 'Window from cart' && a.button === 'right' && a.move === 'jump' && b.name === 'My smoke' && b.button === 'both' && b.move === 'jump' && c.name === '' && c.button === 'left' && c.move === 'crouch' && d.name === 'Mid' && d.button === 'both' && d.move === 'walk', JSON.stringify([a, b, c, d]));
  const L = seedsFor('mirage')[0]; aimOff(L, 0, 0); gc?.(); gc?.(); const h0 = process.memoryUsage().heapUsed; let x = 0; for (let i = 0; i < 200000; i++) x += aimOff(L, i * 1e-7, 1 - i * 1e-7); gc?.(); gc?.(); const dh = process.memoryUsage().heapUsed - h0;
  ok('on a lineup spot: the aim check allocates nothing (200 000 frames grow the heap < 64 KB)', dh < 64 * 1024 && Number.isFinite(x), (dh / 1024).toFixed(1) + ' KB'); }
console.log((fail ? 'FAIL' : 'PASS') + `: lineup library · ${pass}/${pass + fail}`); if (fail) process.exitCode = 1;
