// v53 RELOAD (spec addendum 4): Global Defensive reloads like CS2's.
//  · NUMBERS: every gun's magazine / reserve / reload length / mag-in moment are CS2's — weapons-data.js against the
//    generated reference (dist/gd-reload-ref.js) and, when this computer has the user's CS2 install, against
//    weapons.vdata and the reload clips read again here (m_iMaxClip1, m_nPrimaryReserveAmmoMax × m_iMaxClip1 when
//    m_bReserveAmmoAsClips, m_flDisallowAttackAfterReloadStartDuration, WPN_RELOAD_ADD_AMMO).
//  · EACH GUN TYPE through the real weapons.js on a fake clock — rifle (AK-47), pistol (Glock-18: its partial and its
//    slide-locked empty reload), Desert Eagle, AWP (bolt), M249 and Negev (box), SMG (MP9), CZ75-Auto (its front
//    magazine): a switch 1 ms before the mag-in cancels (the magazine as it was, no reload number), a switch AT the
//    mag-in moment with no frame in between keeps the full magazine (the moment counts, not the frame); the reserve
//    gives only the missing rounds; no reload with a full magazine or an empty reserve; the HUD's count (weapons.ammo /
//    reserve) changes at the mag-in, not before.
//  · SHOTGUNS (Nova, XM1014): shell by shell at CS2's intro + loop moments; a switch keeps the shells in; a click after
//    reloadStartMs with shells in fires and ends the reload.
//  · HOST / CLIENT: a guest's pose stream to the host (combat-logic poseAmmo, latency and jitter): a switch just after
//    the mag-in → the full magazine on both; just before → unchanged on both; a forged completion before CS2's mag-in on
//    the host's clock is refused; shotgun shells agree; the client's sync takes the host's numbers.
//   node tests/gd-reload.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path'; import { homedir } from 'node:os';
let T = 1000; globalThis.performance = { now: () => T, mark() {}, measure() {}, getEntriesByName: () => [] };
const THREE = await import('../dist/three.module.js');
const { createWeapons } = await import('../dist/weapons.js');
const W = await import('../dist/weapons-data.js');
const { WEAPONS, weaponById, isFirearm, magInMs, magInMinMs, HU } = W;
const { RELOAD_REF } = await import('../dist/gd-reload-ref.js');
const { startArena, arenaApply, arenaTick, botReload, botSeat } = await import('../dist/arena-logic.js');
const { ammoOf, poseAmmo, takeReload, RELOAD_SLACK_MS } = await import('../dist/combat-logic.js');
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const J = x => JSON.stringify(x);

// ── NUMBERS ──
const guns = WEAPONS.filter(isFirearm);
ok('every GD gun has CS2\'s reload reference', guns.every(w => RELOAD_REF[w.id]), guns.filter(w => !RELOAD_REF[w.id]).map(w => w.id));
for (const w of guns) { const r = RELOAD_REF[w.id], res = r.asClips ? r.reserve * r.clip1 : r.reserve;
  ok(`${w.name}: Magazines ${w.mag} / ${w.reserveMags} = m_iMaxClip1 ${r.clip1} / m_nPrimaryReserveAmmoMax ${r.reserve}${r.asClips ? ' magazines' : ''}`, w.mag === r.clip1 && w.reserveMags === res);   // (v53 RESERVE: the install's numbers are the host's Magazines model; Bullets, the default: tests/gd-reserve-modes.mjs)
  if (w.shellMs) ok(`${w.name}: shells at CS2's stages (intro ${r.reload.intro} s, one per ${r.reload.loop} s, counted at ${r.reload.add} s, outro ${r.reload.outro} s)`, w.shellIntroMs === Math.round(r.reload.intro * 1000) && w.shellMs === Math.round(r.reload.loop * 1000) && w.shellIntroMs + w.shellAddMs === Math.round(r.reload.add * 1000) && w.shellOutroMs === Math.round(r.reload.outro * 1000) && r.single);
  else ok(`${w.name}: no shot for ${r.rl} s (m_flDisallowAttackAfterReloadStartDuration), the rounds in at ${r.reload.add} s (WPN_RELOAD_ADD_AMMO)${r.empty ? `, ${r.empty.add} s from empty` : ''}`, w.reloadMs === Math.round(r.rl * 1000) && w.magInMs === Math.round(r.reload.add * 1000) && w.magInEmptyMs === Math.round((r.empty || r.reload).add * 1000) && w.magInMs < w.reloadMs && !r.single); }
ok('CS2\'s own examples: AK-47 30 / 90, Glock-18 20 / 60, AWP 5 / 10, M4A4 30 / 120, Nova 8 / 32, Negev 150 / 300', J(W.fullAmmo('ak', 'mags')) === '[30,90]' && J(W.fullAmmo('pistol', 'mags')) === '[20,60]' && J(W.fullAmmo('sniper', 'mags')) === '[5,10]' && J(W.fullAmmo('m4', 'mags')) === '[30,120]' && J(W.fullAmmo('shotgun', 'mags')) === '[8,32]' && J(W.fullAmmo('negev', 'mags')) === '[150,300]');
ok('the AK\'s mag-in 1.1 s of its 2.4333 s clip, the reload 2.4667 s; the Glock\'s 0.9333 s, from empty 1.2667 s', weaponById('ak').magInMs === 1100 && weaponById('ak').reloadClipMs === 2433 && weaponById('ak').reloadMs === 2467 && weaponById('pistol').magInMs === 933 && weaponById('pistol').magInEmptyMs === 1267);
ok('outside Global Defensive Darja\'s hand cannon keeps its 52.0.5 rounds and reload (7 / 35, 2.2 s)', W.DARJA_GUN.mag === 7 && W.DARJA_GUN.reserve === 35 && W.DARJA_GUN.reloadMs === 2200);
// Against the user's own install, when this computer has it (the importer's cache: decompiled at its last run).
{ const C = join(homedir(), 'CS2-extract', 'export', 'reloads'), vf = join(C, 'scripts__weapons.vdata_c.dec.txt');
  if (existsSync(vf)) { const { vdataPrefabs, GUNS, clipEvents } = await import('../tools/import-cs2-reloads.mjs'), V = vdataPrefabs(readFileSync(vf, 'utf8')); let same = 0, clips = 0;
    for (const w of guns) { const v = V[GUNS[w.id][0] + '_prefab']; assert(v, GUNS[w.id][0]); const res = v.m_bReserveAmmoAsClips === true ? v.m_nPrimaryReserveAmmoMax * v.m_iMaxClip1 : v.m_nPrimaryReserveAmmoMax;
      if (w.mag === v.m_iMaxClip1 && w.reserveMags === res && (w.shellMs || w.reloadMs === Math.round(v.m_flDisallowAttackAfterReloadStartDuration * 1000)) && !!w.shellMs === (v.m_bReloadsSingleShells === true)) same++;
      const cf = join(C, 'animation__anims__viewmodel__' + RELOAD_REF[w.id].reload.clip.replace(/\//g, '__') + '.vnmclip_c.txt'); if (existsSync(cf)) { const ce = clipEvents(readFileSync(cf, 'utf8')); if (Math.abs(ce.ids.WPN_RELOAD_ADD_AMMO[0] - RELOAD_REF[w.id].reload.add) < 1e-3) clips++; } }
    ok(`the install's weapons.vdata: all ${guns.length} guns' magazine, reserve, reload length and shell rule equal the game's`, same === guns.length, same);
    ok(`the install's reload clips: every WPN_RELOAD_ADD_AMMO equals the reference (${clips} clips)`, clips === guns.length, clips);
  } else console.log('  (no CS2 install on this computer: checked against the committed reference only)'); }

// ── EACH GUN TYPE (the real weapons.js) ──
function rig(id) { const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); scene.add(camera);
  const P = createWeapons({ scene, camera, effects: { shoot() {}, shootAt() {} }, arsenal: () => [id, 'knife'], report: () => {}, canFire: () => true, targets: () => [], move: () => ({ speed: 0, max: 215 * HU, onGround: true, landedAgo: 9 }) });
  P.equip(id); T += (weaponById(id).deployMs || 1000) + 50; P.update(.016); return P; }
const frames = (P, ms, fps = 60) => { let left = ms; while (left > 0) { const dt = Math.min(left, 1000 / fps); T += dt; left -= dt; P.update(dt / 1000); } };
const CASES = [['ak', 'rifle'], ['m4s', 'rifle (suppressed)'], ['pistol', 'pistol'], ['usps', 'pistol (USP-S)'], ['deagle', 'Desert Eagle'], ['sniper', 'AWP (bolt)'], ['ssg08', 'SSG 08 (bolt)'], ['lmg', 'M249 (box)'], ['negev', 'Negev (box)'], ['mp9', 'SMG'], ['cz75', 'CZ75-Auto']];
for (const [id, kind] of CASES) { const w = weaponById(id);
  for (const startMag of [Math.floor(w.mag / 3), 0]) { const missing = w.mag - startMag, res0 = w.reserve;
    // before the mag-in: cancelled
    { T = 1e6; const P = rig(id); P.setAmmo(id, [startMag, res0]); const r0 = P.reloads; ok(`${kind}: R starts a reload (${startMag} / ${res0})`, P.reload() && P.reloading);
      const at = P.magInAt; ok(`${kind}: the mag-in is CS2's ${startMag ? 'partial' : 'empty'} clip moment`, at - T === magInMs(w, startMag, true), at - T);
      frames(P, at - T - 1); ok(`${kind}: until the mag-in the HUD still shows ${startMag} / ${res0}`, P.ammo === startMag && P.reserve === res0);
      P.equip('knife'); frames(P, 2000); ok(`${kind}: a switch 1 ms before the mag-in cancels — ${startMag} / ${res0} kept, no reload number`, J(P.ammoOf(id)) === J([startMag, res0]) && P.reloads === r0, J(P.ammoOf(id))); }
    // at the mag-in moment, no frame in between: kept
    { T = 2e6; const P = rig(id); P.setAmmo(id, [startMag, res0]); const r0 = P.reloads; P.reload(); const at = P.magInAt; T = at; P.equip('knife');
      ok(`${kind}: a switch at the mag-in moment (no frame there) keeps the full magazine — ${w.mag} / ${res0 - missing}`, J(P.ammoOf(id)) === J([w.mag, res0 - missing]) && P.reloads === r0 + 1, J(P.ammoOf(id))); }
    // the HUD's count changes at the mag-in, the reload runs on to reloadMs
    { T = 3e6; const P = rig(id); P.setAmmo(id, [startMag, res0]); P.reload(); const t0 = T, at = P.magInAt; frames(P, at - T + 17); ok(`${kind}: at the mag-in the HUD's count turns ${w.mag} / ${res0 - missing} while the reload still runs`, P.ammo === w.mag && P.reserve === res0 - missing && P.reloading); frames(P, w.reloadMs - (T - t0) + 20); ok(`${kind}: the reload ends at reloadMs`, !P.reloading); } }
  // reserve arithmetic
  { T = 4e6; const P = rig(id); P.setAmmo(id, [w.mag - 2, 1]); P.reload(); frames(P, w.reloadMs + 50); ok(`${kind}: the reserve gives only what it has (${w.mag - 2} + 1 → ${w.mag - 1} / 0)`, J(P.ammoOf(id)) === J([w.mag - 1, 0]));
    P.setAmmo(id, [5, 0]); ok(`${kind}: no reload with an empty reserve`, !P.reload() && !P.reloading); P.setAmmo(id, [w.mag, 9]); ok(`${kind}: no reload with a full magazine`, !P.reload() && !P.reloading); } }
// The CZ75-Auto: its first reload takes the spare front magazine (reload_*), later ones reload2_* (CS2's two clip pairs).
{ const w = weaponById('cz75'); T = 5e6; const P = rig('cz75'); P.setAmmo('cz75', [4, w.reserve]); P.reload(); const a = P.magInAt - T; frames(P, w.reloadMs + 30); P.setAmmo('cz75', [4, w.reserve - 8]); P.reload(); const b = P.magInAt - T;
  ok('CZ75-Auto: the first reload at 1.567 s (front magazine), the next at 1.233 s (reload2)', a === w.magInMs && b === w.magInAltMs && a === 1567 && b === 1233, [a, b]); }
// ── SHOTGUNS ──
for (const id of ['shotgun', 'xm1014']) { const w = weaponById(id), first = w.shellIntroMs + w.shellAddMs;
  { T = 6e6; const P = rig(id); P.setAmmo(id, [2, 32]); const r0 = P.reloads; P.reload(); frames(P, first - 5); ok(`${w.name}: no shell before CS2's first shell moment (${first} ms)`, P.ammo === 2); frames(P, 10); ok(`${w.name}: the first shell at ${first} ms`, P.ammo === 3 && P.reloads === r0 + 1);
    frames(P, w.shellMs); ok(`${w.name}: the next one loop (${w.shellMs} ms) later`, P.ammo === 4 && P.reloads === r0 + 2); P.equip('knife'); frames(P, 3000); ok(`${w.name}: a switch keeps the shells in (4 / 30)`, J(P.ammoOf(id)) === '[4,30]'); }
  { T = 7e6; const fired = []; const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); scene.add(camera);
    const P = createWeapons({ scene, camera, effects: { shoot() {}, shootAt() {} }, arsenal: () => [id], report: a => fired.push(a), canFire: () => true, targets: () => [{ id: 'b', feet: new THREE.Vector3(0, 0, -3), crouched: false, seen: 1 }], move: () => ({ speed: 0, max: 215 * HU, onGround: true, landedAgo: 9 }) });
    P.equip(id); T += w.deployMs + 50; P.update(.016); P.setAmmo(id, [1, 32]); P.reload(); frames(P, Math.max(first, w.reloadStartMs) + 20); const m = P.ammo; P.button(0, true); P.button(0, false);
    ok(`${w.name}: a click with shells in fires and ends the reload`, m === 2 && !P.reloading && P.ammo === 1, [m, P.reloading, P.ammo]); frames(P, 3000); ok(`${w.name}: …no shells after that`, P.ammo === 1); } }

// ── HOST / CLIENT agreement (combat-logic on the host's clock; the guest's pose stream with latency) ──
const H0 = 3e9;
function match(prim, sec) { const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0 }, H0); const P = [{ id: 'a', name: 'Ann', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }]; arenaApply(g, { type: 'loadout', primary: prim, ...(sec ? { secondary: sec } : {}) }, 'Ann', P, H0); return g; }
function guest(id, g, { lat = 40, jitter = 0, seed = 7 } = {}) { const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); scene.add(camera);
  const host = () => { const C = g.combat; return { ammo: C.ammo?.ann, shots: C.shots?.ann ? { n: C.shots.ann.n, r: C.shots.ann.r, pending: false } : null }; };
  const P = createWeapons({ scene, camera, effects: { shoot() {}, shootAt() {} }, arsenal: () => [id, 'knife'], report: () => {}, canFire: () => true, targets: () => [], host, move: () => ({ speed: 0, max: 215 * HU, onGround: true, landedAgo: 9 }) });
  const queue = []; let s = seed, lastDue = 0, c0 = T;   // (an ordered stream, as the room's: a pose never overtakes the one before)
  const hostNow = () => H0 + (T - c0);
  const send = () => { s = (s * 16807) % 2147483647; const due = Math.max(lastDue, T + lat + jitter * (s / 2147483647)); lastDue = due; queue.push([due, structuredClone(P.poseShot(0, 0)), P.current?.id || null]); };
  const deliver = () => { while (queue.length && queue[0][0] <= T) { const [due, shot, wpn] = queue.shift(); poseAmmo(g, 'Ann', shot, wpn, H0 + (due - c0)); } };
  const run = ms => { let left = ms; while (left > 0) { const dt = Math.min(left, 1000 / 60); T += dt; left -= dt; P.update(dt / 1000); send(); deliver(); } };
  P.equip(id); P.setAmmo(id, ammoOf(g, 'Ann', id)); run(1200); return { P, run, hostNow, queue }; }
for (const [id, sec] of [['ak', null], ['sniper', null], ['lmg', null], [null, 'deagle']]) { const gid = id || sec, w = weaponById(gid);
  for (const [dt, label] of [[1, 'just after'], [-1, 'just before']]) for (const jit of [0, 80]) {
    T = 8e6; const g = match(id, sec); g.combat.ammo.ann[gid] = [3, w.reserve]; const { P, run } = guest(gid, g, { lat: 35, jitter: jit }); P.setAmmo(gid, [3, w.reserve]); run(100);
    P.reload(); const at = P.magInAt; run(Math.max(0, at - T + dt)); P.equip('knife'); run(1500);
    const want = dt > 0 ? [w.mag, w.reserve - (w.mag - 3)] : [3, w.reserve];
    ok(`host / client, ${w.name}: a switch ${label} the mag-in (jitter ${jit} ms) — ${J(want)} on both`, J(P.ammoOf(gid)) === J(want) && J(ammoOf(g, 'Ann', gid)) === J(want) && !g.combat.shots.ann.early, J([P.ammoOf(gid), ammoOf(g, 'Ann', gid), g.combat.shots.ann.early])); } }
// A forged completion: the reload's number 300 ms after its start (an AK seats at 1.1 s) — the host refuses it.
{ T = 9e6; const g = match('ak'); g.combat.ammo.ann.ak = [3, 90]; const s0 = { n: 2e6, r: 5000, rs: 7000, w: 'ak', rw: 'ak' }; poseAmmo(g, 'Ann', s0, 'ak', H0);
  poseAmmo(g, 'Ann', { ...s0, rs: 7001 }, 'ak', H0 + 100); poseAmmo(g, 'Ann', { ...s0, rs: 7001, r: 5001 }, 'ak', H0 + 400);
  ok('host: a completion 300 ms after the start (CS2\'s AK mag-in is 1.1 s) is refused — 3 / 90 kept', J(ammoOf(g, 'Ann', 'ak')) === '[3,90]' && g.combat.shots.ann.early === 1 && g.combat.shots.ann.r === 5001);
  poseAmmo(g, 'Ann', { ...s0, rs: 7002, r: 5001 }, 'ak', H0 + 2000); poseAmmo(g, 'Ann', { ...s0, rs: 7002, r: 5002 }, 'ak', H0 + 2000 + 1100 - RELOAD_SLACK_MS + 5);
  ok(`host: one inside CS2's mag-in less the ${RELOAD_SLACK_MS} ms network slack counts — 30 / 63`, J(ammoOf(g, 'Ann', 'ak')) === '[30,63]');
  ok('host: without a reload start (older clients, bots, direct calls) no check, as before', takeReload(g, 'Ann', 5003, 'ak') === false && (g.combat.ammo.ann.ak = [1, 63], takeReload(g, 'Ann', 5004, 'ak')) && J(ammoOf(g, 'Ann', 'ak')) === '[30,34]'); }
ok('magInMinMs: the earliest moment any reload of the gun can seat (the host\'s bound)', magInMinMs(weaponById('pistol')) === 933 && magInMinMs(weaponById('cz75')) === 1233 && magInMinMs(weaponById('shotgun')) === 667);
// Shotgun shells on both sides.
{ T = 1e7; const g = match('shotgun'); g.combat.ammo.ann.shotgun = [2, 32]; const { P, run } = guest('shotgun', g, { lat: 30, jitter: 60 }); P.setAmmo('shotgun', [2, 32]); run(100); const w = weaponById('shotgun');
  P.reload(); run(w.shellIntroMs + w.shellAddMs + 2 * w.shellMs + 20); P.equip('knife'); run(1500);
  ok('host / client, Nova: three shells in, then a switch — 5 / 29 on both', J(P.ammoOf('shotgun')) === '[5,29]' && J(ammoOf(g, 'Ann', 'shotgun')) === '[5,29]' && !g.combat.shots.ann.early, J([P.ammoOf('shotgun'), ammoOf(g, 'Ann', 'shotgun')])); }
// The client's sync: in step with the host, it takes the host's numbers (a refused forged reload undone there).
{ T = 1.1e7; const g = match('ak'); g.combat.ammo.ann.ak = [3, 90]; const { P, run } = guest('ak', g, { lat: 30 }); P.setAmmo('ak', [3, 90]); run(100); P.reload(); run(2600);
  ok('the client\'s sync agrees with the host after a full reload (30 / 63, nothing to take)', P.sync() === false && J(P.ammoOf('ak')) === '[30,63]' && J(ammoOf(g, 'Ann', 'ak')) === '[30,63]');
  g.combat.ammo.ann.ak = [3, 90]; ok('…and takes the host\'s magazine when the host refused it', P.sync() === true && J(P.ammoOf('ak')) === '[3,90]'); }
// ── RELOAD final (review fixes) ──
// A network spike on the pose in flight when R is pressed: the start reaches the host late, the completion on time.
for (const spike of [350, 450, 550]) { T = 1.2e7; const g = match('ak'); g.combat.ammo.ann.ak = [3, 90]; const s0 = { n: 2e6, r: 6000, rs: 8000, w: 'ak', rw: 'ak' }; poseAmmo(g, 'Ann', s0, 'ak', H0);
  poseAmmo(g, 'Ann', { ...s0, rs: 8001 }, 'ak', H0 + 1000 + spike); poseAmmo(g, 'Ann', { ...s0, rs: 8001, r: 6001 }, 'ak', H0 + 1000 + 1100 + 35);
  ok(`host: a fair AK reload whose start was held up ${spike} ms by a spike still counts — 30 / 63`, J(ammoOf(g, 'Ann', 'ak')) === '[30,63]' && !g.combat.shots.ann.early, J([ammoOf(g, 'Ann', 'ak'), g.combat.shots.ann.early])); }
// A shotgun's shell and the click that cuts its reload in ONE pose (they happen in one frame): the shell first, then the shot.
for (const id of ['shotgun', 'xm1014']) { const w = weaponById(id); T = 1.3e7; const g = match(id); g.combat.ammo.ann[id] = [0, 32]; const s0 = { n: 3e6, r: 7000, rs: 9000, w: id, rw: id };
  poseAmmo(g, 'Ann', s0, id, H0); poseAmmo(g, 'Ann', { ...s0, rs: 9001 }, id, H0 + 100); poseAmmo(g, 'Ann', { ...s0, rs: 9001, r: 7001, n: 3e6 + 1 }, id, H0 + 100 + w.shellIntroMs + w.shellAddMs + 5);
  ok(`host, ${w.name}: a shell and the click that ends the reload in one pose — the shot fires (no dry shot), 0 / 31`, J(ammoOf(g, 'Ann', id)) === '[0,31]' && !g.combat.shots.ann.dry.length, J([ammoOf(g, 'Ann', id), g.combat.shots.ann.dry])); }
// …and a magazine's last shots and its (much later) completion in one held-up pose: the shots first, from the old magazine.
{ T = 1.4e7; const g = match('ak'); g.combat.ammo.ann.ak = [5, 90]; const s0 = { n: 4e6, r: 8000, w: 'ak', rw: 'ak' }; poseAmmo(g, 'Ann', s0, 'ak', H0); poseAmmo(g, 'Ann', { ...s0, n: 4e6 + 5, r: 8001 }, 'ak', H0 + 3000);
  ok('host: 5 shots and a reload in one pose — the 5 from the old magazine, then a full one: 30 / 60', J(ammoOf(g, 'Ann', 'ak')) === '[30,60]' && !g.combat.shots.ann.dry.length, J(ammoOf(g, 'Ann', 'ak'))); }
// Bots: a shotgun shell by shell at CS2's moments; a magazine seated whether or not the bot sees anyone.
for (const id of ['shotgun', 'xm1014']) { const w = weaponById(id), bot = { name: 'Bot', weapon: id, ammo: 0, reserve: 32 }, t0 = 5e5, first = w.shellIntroMs + w.shellAddMs;
  const rl = botReload({ combat: {} }, bot, t0); ok(`bot ${w.name}: from empty the reload lasts intro + 8 loops + outro (${w.shellIntroMs + w.mag * w.shellMs + w.shellOutroMs} ms; Nova 4.66 s), not one cycle`, rl === w.shellIntroMs + w.mag * w.shellMs + w.shellOutroMs && rl > 4000, rl);
  botSeat(bot, t0 + first - 1); const a0 = bot.ammo; botSeat(bot, t0 + first); const a1 = bot.ammo; botSeat(bot, t0 + first + w.shellMs * 3); const a4 = bot.ammo; botSeat(bot, t0 + rl);
  ok(`bot ${w.name}: no shell before ${first} ms, one then, one per ${w.shellMs} ms, ${w.mag} / ${32 - w.mag} at the end`, a0 === 0 && a1 === 1 && a4 === 4 && bot.ammo === w.mag && bot.reserve === 32 - w.mag && !bot.magInAt, J([a0, a1, a4, bot.ammo, bot.reserve])); }
{ const w = weaponById('ak'), bot = { name: 'Bot', weapon: 'ak', ammo: 0, reserve: 90 }; const rl = botReload({ combat: {} }, bot, 0); botSeat(bot, w.magInEmptyMs - 1); const a0 = bot.ammo; botSeat(bot, w.magInEmptyMs);
  ok('bot AK-47: the reload lasts CS2\'s 2.467 s, the 30 rounds in at the mag-in', rl === w.reloadMs && a0 === 0 && bot.ammo === 30 && bot.reserve === 60); }
{ T = 1.5e7; const g = { levels: {} }; startArena(g, { map: 'yard', bots: 1 }, H0); arenaTick(g, [], .05, H0 + 50); const b = g.arena.bots[0], w = weaponById(b.weapon); b.ammo = 0; b.reserve = w.reserve; b.magInAt = H0 + 1000; b.reloadUntil = H0 + 1000 + (w.shellMs ? 4000 : w.reloadMs);
  arenaTick(g, [], .05, H0 + 1100); ok(`bot with no enemy in sight (${w.name}): its magazine is seated at the mag-in anyway`, b.ammo > 0 && (w.shellMs ? true : b.ammo === w.mag), J([b.weapon, b.ammo, b.reserve, b.target])); }
console.log(`PASS: gd-reload · ${n} checks (CS2's magazine / reserve / reload / mag-in numbers per gun, before / at the mag-in for rifles, pistols, the Deagle, AWP, SSG 08, M249, Negev, SMG and CZ75, reserve arithmetic, shell by shell + fire interrupt, host / client agreement with jitter, forged completions refused)`);
