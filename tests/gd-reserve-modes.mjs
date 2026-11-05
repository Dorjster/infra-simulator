// v53 RESERVE (spec addendum 13): Global Defensive's reserve-ammo model is the HOST's match setting, "Reserve ammo:
// Magazines | Bullets", default Bullets (the user's cs2-hud.png, "20 | 120").
//  · NUMBERS: Bullets = the classic round pool (weapons-data CLASSIC_RESERVE; the Glock-18's 120 from the user's picture);
//    Magazines = this install's weapons.vdata (m_nPrimaryReserveAmmoMax magazines × m_iMaxClip1 when
//    m_bReserveAmmoAsClips; the shotguns' shells as they are) — against the generated reference gd-reload-ref.js.
//  · ARITHMETIC per gun type, both models, on the host (combat-logic takeReload) and the real client (weapons.js on a
//    fake clock): rifle (AK-47), pistol (Glock-18), AWP, shotgun shell by shell (Nova, XM1014), M249 and Negev. Bullets:
//    only the missing rounds move, nothing is lost. Magazines: a reload takes one whole magazine and the rounds left in
//    the old one go with it (weapons-data MAG_DROPS_REST); the last, short magazine gives what it has. Practice infinite
//    ammo keeps the reserve in both; bots follow the model.
//  · THE SETTING: host only; during a Defuse match it waits for the next round (and then refills every gun in it, bots
//    too); in the lobby / practice it applies at once with the guns refilled (the ground guns too), a Deathmatch at its next match; a new match keeps it;
//    buying a gun gives it full in the model; a dropped gun keeps its magazine and reserve when picked up.
//  · HOST / GUEST through the real room (lan/room.mjs, in-process): a guest can't change it; the guest's game shows the
//    host's model and the same ammo after a change (now in the lobby, from the next round in a match); a guest's
//    weapons.js and the host agree on a reload in both models (the pose stream).
//  · HUD rule (gd-hud.js uses these): Magazines shows CS2's icons (one per magazine) for magazine guns, the shotguns'
//    shells stay a number; Bullets shows the number. The browser picture: tests/browser/gd-reserve-modes.mjs.
//   node tests/gd-reserve-modes.mjs
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path'; import { mkdtempSync, mkdirSync } from 'node:fs';
let T = 1000; const perfNow = performance.now.bind(performance); performance.now = () => T;   // (the page clock, faked; fetch keeps the real performance object)
const THREE = await import('../dist/three.module.js');
const { createWeapons } = await import('../dist/weapons.js');
const W = await import('../dist/weapons-data.js');
const { WEAPONS, weaponById, isFirearm, fullAmmo, reserveFor, seatAmmo, wholeMags, magsIn, CLASSIC_RESERVE, RESERVE_MODES, RESERVE_DEFAULT, MAG_DROPS_REST, cleanReserveMode, reserveModeOf, HU } = W;
const { RELOAD_REF } = await import('../dist/gd-reload-ref.js');
const { startArena, arenaApply, arenaTick, arenaView, arenaEpochKey, botSeat, botReload, LOBBY_MS } = await import('../dist/arena-logic.js');
const { ammoOf, poseAmmo, takeReload } = await import('../dist/combat-logic.js');
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); };
const J = x => JSON.stringify(x);

// ── NUMBERS ──
ok('two models, Bullets the default (the user\'s picture); anything else is Bullets', J(RESERVE_MODES) === '["bullets","mags"]' && RESERVE_DEFAULT === 'bullets' && cleanReserveMode('x') === 'bullets' && cleanReserveMode('mags') === 'mags' && reserveModeOf({}) === 'bullets');
const guns = WEAPONS.filter(isFirearm);
for (const w of guns) { const r = RELOAD_REF[w.id]; if (!r) continue; const mags = r.asClips ? r.reserve * r.clip1 : r.reserve;
  ok(`${w.name}: Magazines ${w.mag} / ${reserveFor(w, 'mags')} = weapons.vdata ${r.asClips ? r.reserve + ' magazines × ' + r.clip1 : r.reserve + ' shells'}; Bullets ${w.mag} / ${reserveFor(w, 'bullets')} (classic)`,
    reserveFor(w, 'mags') === mags && reserveFor(w, 'bullets') === (CLASSIC_RESERVE[w.id] ?? mags) && w.asClips === !!r.asClips && J(fullAmmo(w.id)) === J(fullAmmo(w.id, 'bullets')), J([reserveFor(w, 'mags'), reserveFor(w, 'bullets'), CLASSIC_RESERVE[w.id]])); }
ok('every GD gun has a classic round count', guns.every(w => CLASSIC_RESERVE[w.id] != null), guns.filter(w => CLASSIC_RESERVE[w.id] == null).map(w => w.id));
const EX = { bullets: { pistol: [20, 120], ak: [30, 90], sniper: [5, 30], shotgun: [8, 32], lmg: [100, 200], negev: [150, 300], m4: [30, 90] }, mags: { pistol: [20, 60], ak: [30, 90], sniper: [5, 10], shotgun: [8, 32], lmg: [100, 200], negev: [150, 300], m4: [30, 120] } };
for (const [m, t] of Object.entries(EX)) ok(`${m}: Glock ${J(t.pistol)}, AK ${J(t.ak)}, AWP ${J(t.sniper)}, Nova ${J(t.shotgun)}, M249 ${J(t.lmg)}, Negev ${J(t.negev)}, M4A4 ${J(t.m4)}`, Object.entries(t).every(([id, a]) => J(fullAmmo(id, m)) === J(a)), J(Object.keys(t).map(id => fullAmmo(id, m))));
ok('the rounds left in a magazine go with it in Magazines (one value: MAG_DROPS_REST)', MAG_DROPS_REST === true);

// ── ARITHMETIC (the shared rule, the host, the client, bots) ──
const H0 = 3e9, P1 = () => [{ id: 'a', name: 'Ann', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }];
function match(mode, prim, sec, practice = null) { const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0, practice, reserve: mode }, H0); arenaApply(g, { type: 'settings', reserve: mode }, 'Ann', P1(), H0);   // (a Deathmatch starts in the model: a change during one waits for its next match)
  if (prim || sec) arenaApply(g, { type: 'loadout', ...(prim ? { primary: prim } : {}), ...(sec ? { secondary: sec } : {}) }, 'Ann', P1(), H0); ((g.combat.ammo ??= {}).ann ??= {}); return g; }
let rn = 1000; const hostReload = (g, id, k = 1) => { rn += 100; takeReload(g, 'Ann', rn, id); rn += k; takeReload(g, 'Ann', rn, id); return ammoOf(g, 'Ann', id); };   // (a jump of 100 re-syncs the numbering: then k reload numbers)
const CASES = [
  // [id, mode, start, after one reload]
  ['ak', 'bullets', [10, 90], [30, 70]], ['ak', 'mags', [10, 90], [30, 60]], ['ak', 'mags', [10, 20], [20, 0]],
  ['pistol', 'bullets', [5, 120], [20, 105]], ['pistol', 'mags', [5, 60], [20, 40]], ['pistol', 'mags', [0, 60], [20, 40]],
  ['sniper', 'bullets', [2, 30], [5, 27]], ['sniper', 'mags', [2, 10], [5, 5]], ['sniper', 'mags', [0, 5], [5, 0]],
  ['lmg', 'bullets', [40, 200], [100, 140]], ['lmg', 'mags', [40, 200], [100, 100]],
  ['negev', 'bullets', [10, 300], [150, 160]], ['negev', 'mags', [10, 300], [150, 150]]];
for (const [id, mode, a0, want] of CASES) { const w = weaponById(id), g = match(mode, ['ak', 'sniper', 'lmg', 'negev'].includes(id) ? id : null, id === 'pistol' ? null : null);
  g.combat.ammo.ann[id] = [...a0]; const got = hostReload(g, id);
  ok(`host, ${mode}, ${w.name}: ${J(a0)} → ${J(want)}${mode === 'mags' && a0[0] ? ` (the ${a0[0]} left go with the old magazine)` : mode === 'bullets' ? ' (only the missing rounds)' : ''}`, J(got) === J(want), J(got));
  ok(`…the shared rule says the same (client weapons.js, bots)`, J(seatAmmo(w, a0[0], a0[1], mode)) === J(want)); }
for (const mode of RESERVE_MODES) for (const id of ['ak', 'pistol']) { const w = weaponById(id);
  ok(`${mode}, ${w.name}: no reload with a full magazine or an empty reserve`, seatAmmo(w, w.mag, 60, mode) === null && seatAmmo(w, 3, 0, mode) === null); }
// Shotguns: shell by shell in both (weapons.vdata m_bReserveAmmoAsClips false: a pool of shells).
for (const id of ['shotgun', 'xm1014']) for (const mode of RESERVE_MODES) { const w = weaponById(id), g = match(mode, id); g.combat.ammo.ann[id] = [2, 32];
  hostReload(g, id, 1); const one = ammoOf(g, 'Ann', id); hostReload(g, id, 3); const four = ammoOf(g, 'Ann', id);
  ok(`host, ${mode}, ${w.name}: shell by shell — one number one shell (3 / 31), three more (6 / 28)`, J(one) === '[3,31]' && J(four) === '[6,28]' && !wholeMags(w, mode), J([one, four])); }
// Practice infinite ammo (sv_infinite_ammo): the reserve never runs down, in both.
for (const mode of RESERVE_MODES) { const g = match(mode, 'ak', null, { ammo: true }); g.combat.ammo.ann.ak = [4, 90]; const a = hostReload(g, 'ak');
  ok(`practice infinite ammo, ${mode}: the AK 4 / 90 reloads to 30 / 90`, J(a) === '[30,90]', J(a)); }

// The real client (weapons.js): a reload in each model, the HUD's numbers (weapons.ammo / reserve) at the mag-in.
function rig(id, mode) { const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); scene.add(camera);
  const P = createWeapons({ scene, camera, effects: { shoot() {}, shootAt() {} }, arsenal: () => [id, 'knife'], report: () => {}, canFire: () => true, targets: () => [], reserveMode: () => mode, move: () => ({ speed: 0, max: 215 * HU, onGround: true, landedAgo: 9 }) });
  P.equip(id); T += (weaponById(id).deployMs || 1000) + 50; P.update(.016); return P; }
const frames = (P, ms) => { let left = ms; while (left > 0) { const dt = Math.min(left, 1000 / 60); T += dt; left -= dt; P.update(dt / 1000); } };
for (const [id, mode, a0, want] of CASES) { T += 1e5; const w = weaponById(id), P = rig(id, mode); P.setAmmo(id, a0); P.reload(); const at = P.magInAt;
  frames(P, at - T - 5); const mid = [P.ammo, P.reserve]; frames(P, (w.reloadMs || 3000) + 100);
  ok(`client, ${mode}, ${w.name}: ${J(a0)} until the mag-in, then ${J(want)}`, J(mid) === J(a0) && J(P.ammoOf(id)) === J(want), J([mid, P.ammoOf(id)])); }
{ T += 1e5; const P = rig('ak', 'mags'); ok('client, Magazines: a gun the page has no count for starts full in the model (30 / 90 AK; Glock 20 / 60)', J(P.ammoOf('ak')) === '[30,90]'); const Q = rig('pistol', 'mags'); ok('…', J(Q.ammoOf('pistol')) === '[20,60]'); const B = rig('pistol', undefined); ok('client without a model (other modes): Bullets, 20 / 120', J(B.ammoOf('pistol')) === '[20,120]'); }
// Bots: their full reserve and their reloads follow the model.
for (const mode of RESERVE_MODES) { const g = { levels: {} }; startArena(g, { map: 'yard', bots: 1, reserve: mode }, H0);
  const b = g.arena.bots[0]; b.weapon = 'ak'; b.rm = reserveModeOf(g); b.ammo = 12; b.reserve = reserveFor(weaponById('ak'), mode); const r0 = b.reserve; botReload(g, b, 0); botSeat(b, 1e6);
  ok(`bot, ${mode}: AK 12 / ${r0} → ${mode === 'mags' ? '30 / 60 (the 12 dropped)' : '30 / 72'}`, J([b.ammo, b.reserve]) === (mode === 'mags' ? '[30,60]' : '[30,72]'), J([b.ammo, b.reserve])); }

// ── THE SETTING (the host's match settings) ──
const { ARENA_MAPS } = await import('../dist/arena-maps.js'); const { ARENA } = await import('../dist/facility-layout.js'); const { DEFUSE } = await import('../dist/arena-defuse.js');
const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + M.nav.floorAt(x, z), z: ARENA.cz + z, yaw: 0 });
{ let t = 1e10; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 2, lobbyMs: LOBBY_MS }, t);
  const P = [{ id: 'h', name: 'Host', pose: at(M.t[0]) }, { id: 'g', name: 'Guest', pose: at(M.ct[0]) }]; arenaTick(g, P, .05, t += 50);
  ok('a new match: Bullets', g.arena.reserveMode === 'bullets' && J(ammoOf(g, 'Host', 'pistol')) === '[20,120]', J(ammoOf(g, 'Host', 'pistol')));
  assert.throws(() => arenaApply(g, { type: 'settings', reserve: 'mags' }, 'Guest', P, t, { isHost: false }), /Only the host/); n++;
  assert.throws(() => arenaApply(g, { type: 'settings', reserve: 'clips' }, 'Host', P, t), /Magazines or Bullets/); n++;
  const k0 = arenaEpochKey(g), m1 = arenaApply(g, { type: 'settings', reserve: 'mags' }, 'Host', P, t);
  ok('in the lobby (warmup) it applies at once: every gun refilled in it, the bots\' too; the arena is re-sent (epoch key)', g.arena.reserveMode === 'mags' && g.arena.reserveModeNext === undefined && J(ammoOf(g, 'Host', 'pistol')) === '[20,60]' && g.arena.bots.every(b => b.rm === 'mags' && b.reserve === reserveFor(weaponById(b.weapon), 'mags')) && arenaEpochKey(g) !== k0 && /Magazines/.test(m1) && !/next round/.test(m1), m1 + J(g.arena.bots.map(b => [b.weapon, b.reserve])));
  ok('…the clients\' arena (arenaView) carries it', arenaView(g).reserveMode === 'mags');
  arenaApply(g, { type: 'start-match' }, 'Host', P, t += 50); arenaTick(g, P, .05, t += 50);
  ok('the match starts in Magazines', g.arena.reserveMode === 'mags' && J(ammoOf(g, 'Host', 'pistol')) === '[20,60]', J(ammoOf(g, 'Host', 'pistol')));
  // buying a gun: full in the model
  g.combat.d.round.phase = 'freeze'; g.combat.d.round.freezeUntil = t + 1e4; g.combat.d.round.buyUntil = t + 2e4; g.combat.d.money.host = 16000; P[0].pose = at(M.t[0]);
  arenaApply(g, { type: 'buy', primary: 'ak', round: g.combat.d.round.id }, 'Host', P, t += 10);
  ok('buying an AK in Magazines: 30 / 90 (3 magazines)', J(ammoOf(g, 'Host', 'ak')) === '[30,90]', J(ammoOf(g, 'Host', 'ak')));
  const k1 = arenaEpochKey(g), m2 = arenaApply(g, { type: 'settings', reserve: 'bullets' }, 'Host', P, t);
  ok('during the match: queued for the next round, this round unchanged; the arena is re-sent', g.arena.reserveMode === 'mags' && g.arena.reserveModeNext === 'bullets' && J(ammoOf(g, 'Host', 'ak')) === '[30,90]' && /next round/.test(m2) && arenaEpochKey(g) !== k1 && arenaView(g).reserveModeNext === 'bullets', m2);
  g.combat.ammo.host.ak = [7, 30];
  arenaApply(g, { type: 'restart-round' }, 'Host', P, t += 100);
  ok('the next round: Bullets, the survivor\'s AK refilled in it (30 / 90), the pistol 20 / 120, the bots\' guns too', g.arena.reserveMode === 'bullets' && g.arena.reserveModeNext === undefined && J(ammoOf(g, 'Host', 'ak')) === '[30,90]' && J(ammoOf(g, 'Host', 'pistol')) === '[20,120]' && g.arena.bots.every(b => b.rm === 'bullets' && b.reserve === reserveFor(weaponById(b.weapon), 'bullets')), J([ammoOf(g, 'Host', 'ak'), ammoOf(g, 'Host', 'pistol'), g.arena.bots.map(b => [b.weapon, b.reserve])]));
  arenaApply(g, { type: 'settings', reserve: 'mags' }, 'Host', P, t); arenaApply(g, { type: 'settings', reserve: 'bullets' }, 'Host', P, t);
  ok('changing it back before the round ends: nothing queued', g.arena.reserveModeNext === undefined && g.arena.reserveMode === 'bullets');
  // a dropped gun keeps its magazine and reserve
  g.combat.ammo.host.ak = [11, 44]; arenaApply(g, { type: 'drop', slot: 'primary', round: g.combat.d.round.id }, 'Host', P, t += 10); const it = g.combat.ground.find(x => x.item === 'ak');
  ok('a dropped AK keeps 11 / 44', it && J(it.ammo) === '[11,44]', J(it?.ammo));
  arenaApply(g, { type: 'settings', reserve: 'mags' }, 'Host', P, t); g.combat.d.matchOver = { at: t, winner: 't' }; arenaTick(g, P, .05, t += DEFUSE.matchOverMs + 100);
  ok('queued at the end of a match: the next match starts in it', g.arena.reserveMode === 'mags' && g.arena.reserveModeNext === undefined && J(ammoOf(g, 'Host', 'pistol')) === '[20,60]', J([g.arena.reserveMode, ammoOf(g, 'Host', 'pistol')])); }
// A Deathmatch (v53 RESERVE final: the spec's "from the next round or match start" — a DM match ends at endsAt and the
// next one starts in the queued model; it used to apply mid-fight with a refill).
{ const g = { levels: {} }; startArena(g, { map: 'yard', bots: 1 }, H0); const P = P1(); arenaApply(g, { type: 'loadout', primary: 'ak' }, 'Ann', P, H0); g.combat.ammo.ann.ak = [3, 15];
  const m = arenaApply(g, { type: 'settings', reserve: 'mags' }, 'Ann', P, H0);
  ok('Deathmatch: queued for the next match, this one unchanged (AK 3 / 15, Bullets)', g.arena.reserveMode === 'bullets' && g.arena.reserveModeNext === 'mags' && J(ammoOf(g, 'Ann', 'ak')) === '[3,15]' && /next match/.test(m), J([m, ammoOf(g, 'Ann', 'ak')]));
  g.arena.endsAt = H0 + 50; arenaTick(g, P, .05, H0 + 100); arenaTick(g, P, .05, H0 + 100 + 12100);
  ok('…the next Deathmatch starts in Magazines (Glock 20 / 60, the bot\'s model too)', g.arena.reserveMode === 'mags' && g.arena.reserveModeNext === undefined && J(ammoOf(g, 'Ann', 'pistol')) === '[20,60]' && g.arena.bots.every(b => b.rm === 'mags'), J([g.arena.reserveMode, ammoOf(g, 'Ann', 'pistol'), g.arena.bots.map(b => b.rm)])); }
// Practice (no rounds, no match end): at once, every gun refilled — carried AND on the ground (v53 RESERVE final: a
// ground gun kept the old model's ammo, a Bullets AK [30,120] showed 4 Magazines icons where the model allows 3).
{ const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0, practice: {} }, H0); const P = P1(); arenaApply(g, { type: 'loadout', primary: 'ak', secondary: 'pistol' }, 'Ann', P, H0); g.combat.ammo.ann.ak = [3, 15];
  arenaApply(g, { type: 'drop', slot: 'secondary' }, 'Ann', P, H0 + 5); const gl = g.combat.ground.find(x => x.item === 'pistol'); if (gl) gl.ammo = [20, 120];
  arenaApply(g, { type: 'settings', reserve: 'mags' }, 'Ann', P, H0 + 8);
  ok('practice: at once, the guns refilled in it (AK 30 / 90)', g.arena.reserveMode === 'mags' && J(ammoOf(g, 'Ann', 'ak')) === '[30,90]', J(ammoOf(g, 'Ann', 'ak')));
  ok('…the Glock on the ground too: 20 / 60 in Magazines, not the old 20 / 120', gl && J(gl.ammo) === '[20,60]', J(gl?.ammo));
  arenaApply(g, { type: 'drop', slot: 'primary' }, 'Ann', P, H0 + 10); g.combat.ground.find(x => x.item === 'ak').ammo = [12, 60];
  const id = g.combat.ground.find(x => x.item === 'ak').id, it = g.combat.ground.find(x => x.id === id); P[0].pose.x = it.x; P[0].pose.z = it.z;
  arenaApply(g, { type: 'pickup', id }, 'Ann', P, H0 + 30);
  ok('a gun picked up keeps its magazine and reserve (12 / 60)', J(ammoOf(g, 'Ann', 'ak')) === '[12,60]', J(ammoOf(g, 'Ann', 'ak'))); }

// ── HUD rule ──
{ const { RESERVE_TYPE } = await import('../dist/gd-hud.js').catch(() => ({}));   // (v53 RESERVE final: the R8's CS2 loader icon, the Sawed-Off's shells)
  if (RESERVE_TYPE) ok('HUD: the R8 takes ammo_reserve_revolver_loader, the Sawed-Off shotgun_shell', RESERVE_TYPE.revolver === 'revolver_loader' && RESERVE_TYPE.sawedoff === 'shotgun_shell', J(RESERVE_TYPE)); }
ok('HUD: Magazines shows icons for magazine guns (Glock 3, AK 3, AWP 2, M4A4 4, M249 2), the shells a number; Bullets a number',
  wholeMags(weaponById('pistol'), 'mags') && magsIn(weaponById('pistol'), 60) === 3 && magsIn(weaponById('ak'), 90) === 3 && magsIn(weaponById('sniper'), 10) === 2 && magsIn(weaponById('m4'), 120) === 4 && magsIn(weaponById('lmg'), 200) === 2 && !wholeMags(weaponById('shotgun'), 'mags') && !wholeMags(weaponById('pistol'), 'bullets'));
ok('HUD: a short last magazine still shows its icon (AK 20 left → 1); none when empty', magsIn(weaponById('ak'), 20) === 1 && magsIn(weaponById('ak'), 0) === 0);

// ── HOST / GUEST through the real room ──
const { startRoom } = await import('../lan/room.mjs'); const { mergeGdFrame } = await import('../dist/multiplayer.js');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gdrm-')); mkdirSync(tmp + '/maps'); mkdirSync(tmp + '/assets');
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew; performance.now = perfNow;
const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(tmp, 's.json'), roomCode: 'RESV01', hostKey: 'k', mapsDir: tmp + '/maps', assetsDir: tmp + '/assets', log: () => {}, error: () => {} });
const base = 'http://127.0.0.1:' + room.port, wait = ms => new Promise(r => setTimeout(r, ms)), G = () => room.world.operations.game;
const post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const until = async (f, ms = 4000) => { const t0 = realNow(); while (realNow() - t0 < ms) { if (f()) return true; await wait(25); } return !!f(); };
async function player(name, hostKey) { const j = (await post('join', { code: 'RESV01', name, ...(hostKey ? { hostKey } : {}) })).body; if (!j.token) throw Error('join: ' + J(j));
  const P = { name: j.name, token: j.token, revision: j.revision, game: j.world?.operations || null, ac: new AbortController() }, R = { combat: 0, arena: j.arev || 0, loadout: j.lrev || 0, match: null };
  const gd = c => { if (P.game) mergeGdFrame(P.game, c, R); };
  fetch(base + '/api/events?token=' + P.token, { signal: P.ac.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const type = /^event: (.*)$/m.exec(msg)?.[1], data = /^data: (.*)$/m.exec(msg)?.[1]; if (!data) continue; const d = JSON.parse(data);
        if (type === 'world' && d.revision > P.revision) { P.revision = d.revision; P.game = d.world.operations; R.arena = Math.max(R.arena, d.arev || 0); R.loadout = Math.max(R.loadout, d.lrev || 0); } else if (type === 'combat') gd(d); } } }).catch(() => {});
  P.act = async a => { const r = await post('action', { revision: P.revision, action: a }, P.token); if (r.body.gd) gd(r.body.gd); if (r.body.world && r.body.revision > P.revision) { P.revision = r.body.revision; P.game = r.body.world.operations; } return r; };
  P.arena = a => P.act({ type: 'arena', action: a }); return P; }
try {
  const ann = await player('Ann', 'k'), bo = await player('Bo'); await wait(200);
  let r = await ann.act({ type: 'engineering', action: { type: 'mode', mode: 'arena', kind: 'defuse', map: 'dust2', bots: 0, difficulty: 'easy', lobby: true, warmup: 600, freeze: 3 } });
  ok('room: the host starts Defuse with a lobby', r.status === 200 && G().arena.lobby, J(r.body).slice(0, 200));
  for (const P of [ann, bo]) await post('pose', { pose: { x: ARENA.cx, y: 9.7, z: ARENA.cz, yaw: 0, active: true } }, P.token);
  ok('room: Bo sees Bullets', await until(() => bo.game?.arena?.reserveMode === 'bullets'), J(bo.game?.arena?.reserveMode));
  r = await bo.arena({ type: 'settings', reserve: 'mags' });
  ok('room: a guest can\'t change it', (r.status >= 400 || r.body.error) && /host/i.test(J(r.body)) && G().arena.reserveMode === 'bullets', J(r.body).slice(0, 200));
  r = await ann.arena({ type: 'settings', reserve: 'mags' });
  const same = (k, mode) => ['pistol', 'usps'].every(id => J(ammoOf(bo.game, 'Bo', id)) === J(ammoOf(G(), 'Bo', id)) && ammoOf(G(), 'Bo', id)[1] === reserveFor(weaponById(id), mode));   // (the host's count, or full in the host's model; the guest's page reads the same)
  ok('room: the host sets Magazines in the lobby → Bo\'s game has it at once, and the same ammo as the host (Glock 20 / 60, USP-S 12 / 24)', r.status === 200 && await until(() => bo.game.arena.reserveMode === 'mags' && same('bo', 'mags')), J([bo.game.arena.reserveMode, ammoOf(bo.game, 'Bo', 'pistol'), ammoOf(G(), 'Bo', 'pistol')]));
  await ann.arena({ type: 'team', team: 't' }); await bo.arena({ type: 'team', team: 'ct' });   // (one on each side: the match starts only then — the auto-assignment put both on one side now and then)
  r = await ann.arena({ type: 'start-match' }); ok('room: the match starts', await until(() => G().arena.lobby?.started && G().combat.d.n >= 1, 15000), J([r.body?.error || r.body?.message, G().arena.lobby, G().combat.d?.n]).slice(0, 300));   // (v53 RESERVE final: waited for, not assumed — a slow machine let the change below land in the warmup)
  r = await ann.arena({ type: 'settings', reserve: 'bullets' });
  ok('room: in the match, Bullets queued → Bo sees "from the next round", the model in force unchanged', await until(() => bo.game.arena.reserveModeNext === 'bullets' && bo.game.arena.reserveMode === 'mags'), J([bo.game.arena.reserveMode, bo.game.arena.reserveModeNext]));
  r = await ann.arena({ type: 'restart-round' });
  ok('room: the next round → Bullets on both, and the same ammo (Glock 20 / 120, USP-S 12 / 24)', await until(() => bo.game.arena.reserveMode === 'bullets' && bo.game.arena.reserveModeNext === undefined && same('bo', 'bullets')), J([bo.game.arena.reserveMode, bo.game.combat?.ammo?.bo, G().combat.ammo?.bo]));
} finally { await room.close(); Date.now = realNow; performance.now = () => T; }

// A guest's weapons.js and the host on one reload, each model (the pose stream with latency, as gd-reload.mjs).
function guest(id, g, mode, { lat = 40, jitter = 30, seed = 7 } = {}) { const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); scene.add(camera);
  const view = JSON.parse(JSON.stringify(arenaView(g)));   // (the arena as the guest's page has it)
  const host = () => { const C = g.combat; return { ammo: C.ammo?.ann, shots: C.shots?.ann ? { n: C.shots.ann.n, r: C.shots.ann.r, pending: false } : null }; };
  const P = createWeapons({ scene, camera, effects: { shoot() {}, shootAt() {} }, arsenal: () => [id, 'knife'], report: () => {}, canFire: () => true, targets: () => [], host, reserveMode: () => view.reserveMode, move: () => ({ speed: 0, max: 215 * HU, onGround: true, landedAgo: 9 }) });
  const queue = []; let s = seed, lastDue = 0; const c0 = T;
  const send = () => { s = (s * 16807) % 2147483647; const due = Math.max(lastDue, T + lat + jitter * (s / 2147483647)); lastDue = due; queue.push([due, structuredClone(P.poseShot(0, 0)), P.current?.id || null]); };
  const deliver = () => { while (queue.length && queue[0][0] <= T) { const [due, shot, wpn] = queue.shift(); poseAmmo(g, 'Ann', shot, wpn, H0 + (due - c0)); } };
  const run = ms => { let left = ms; while (left > 0) { const dt = Math.min(left, 1000 / 60); T += dt; left -= dt; P.update(dt / 1000); send(); deliver(); } };
  P.equip(id); P.setAmmo(id, ammoOf(g, 'Ann', id)); run(1200); return { P, run, view }; }
for (const mode of RESERVE_MODES) for (const [id, a0] of [['ak', [9, 90]], ['pistol', [4, mode === 'mags' ? 60 : 120]], ['sniper', [1, mode === 'mags' ? 10 : 30]], ['negev', [20, 300]]]) {
  T = 8e6 + n * 1e4; const g = match(mode, ['ak', 'sniper', 'negev'].includes(id) ? id : null); g.combat.ammo.ann[id] = [...a0]; const { P, run, view } = guest(id, g, mode); P.setAmmo(id, [...a0]); run(100);
  P.reload(); run(weaponById(id).reloadMs + 1500); const want = seatAmmo(weaponById(id), a0[0], a0[1], mode);
  ok(`host / guest, ${mode}, ${weaponById(id).name}: ${J(a0)} → ${J(want)} on both`, view.reserveMode === mode && J(P.ammoOf(id)) === J(want) && J(ammoOf(g, 'Ann', id)) === J(want) && !g.combat.shots.ann.early, J([P.ammoOf(id), ammoOf(g, 'Ann', id)])); }
{ T = 9.9e6; const g = match('mags', 'shotgun'); g.combat.ammo.ann.shotgun = [2, 32]; const { P, run } = guest('shotgun', g, 'mags'); P.setAmmo('shotgun', [2, 32]); run(100); const w = weaponById('shotgun');
  P.reload(); run(w.shellIntroMs + w.shellAddMs + 2 * w.shellMs + 20); P.equip('knife'); run(1500);
  ok('host / guest, Magazines, Nova: shell by shell, three in then a switch — 5 / 29 on both', J(P.ammoOf('shotgun')) === '[5,29]' && J(ammoOf(g, 'Ann', 'shotgun')) === '[5,29]', J([P.ammoOf('shotgun'), ammoOf(g, 'Ann', 'shotgun')])); }

console.log(`PASS: gd-reserve-modes · ${n} checks (both models' numbers per gun vs weapons.vdata and the classic pool, the reload arithmetic for rifle / pistol / AWP / shotgun shells / M249 / Negev on host, client and bots, practice infinite ammo, host-only setting: lobby / practice now (the ground guns too) / match next round / Deathmatch next match / next match, buys, drops and pickups, the HUD rule, host and guest agreeing through the real room and the pose stream)`);
process.exit(0);
