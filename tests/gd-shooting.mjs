// Global Defensive shooting, CS2's (package F): the trigger keeps the gun's cadence at any frame rate (identical shots,
// times and directions at 30 / 60 / 144 / 240 fps), a semi-automatic click waits for the gun while held, the trigger
// lets go on blur / menus; CS2's accuracy from weapons.vdata (stand / crouch floors, fire penalty recovering over the
// recovery time with its transition bullets, movement, jumps and landings); the spray recovers straight back (never along
// the pattern); the seeded spread is the same on the shooter and the host, which traces the shot itself (zone, pellets
// and walls its own), counts a shot once, refuses one too fast on the shooter's clock (never for network bunching),
// a forged jump, look or zone; shotgun pellets each in their own hit group; ammo charged to the gun that fired; shells
// reload one by one; scope FOVs converted from CS2's 4:3 horizontal degrees; the flinch of being shot.
//   node tests/gd-shooting.mjs
import assert from 'node:assert/strict';
let T = 1000; globalThis.performance = { now: () => T, mark() {}, measure() {}, getEntriesByName: () => [] };   // (weapons.js reads the page clock: a fake one)
const THREE = await import('../dist/three.module.js');
const { createWeapons, shotDirs } = await import('../dist/weapons.js');
const W = await import('../dist/weapons-data.js');
const { weaponById, accOf, createAim, accuracyDecay, inaccuracyOf, movePenalty, recoilShot, recoilRest, restAfterMs, sprayAt, shotRand, shotOffsets, shotBase, offsetDir, rayBody, pelletDamage, damageFor, zoomVfov, zoomSens, nextFireAt, HU, BODY_H } = W;
const { startArena, arenaApply } = await import('../dist/arena-logic.js');
const { epochError } = await import('../dist/arena-logic.js');
const { combatApply, ammoOf, takeShots, takeReload, poseAmmo, hpOf, armorOf, traceShot } = await import('../dist/combat-logic.js');
const { DEFUSE } = await import('../dist/arena-defuse.js');
const { ARENA_MAPS, mapBoxes, segmentClear } = await import('../dist/arena-maps.js');
const { ARENA } = await import('../dist/facility-layout.js');
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const close = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ── A player's weapons in node: the real weapons.js on a fake clock, a body 3 units in front (every shot hits it) ──
function rig(id, { targets = null, move = null, aim = null } = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); camera.position.set(0, 9.7, 0); scene.add(camera);
  const reports = [], dirs = [];
  const P = createWeapons({ scene, camera, effects: { shoot() {}, shootAt() {} }, arsenal: () => [id], report: a => reports.push(a), canFire: () => true, onShot: (ox, oy, oz, dx, dy, dz) => dirs.push([dx, dy, dz]),
    targets: targets || (() => [{ id: 'b', feet: new THREE.Vector3(0, 0, -3), crouched: false, seen: 1 }]), aim: aim || (() => ({ pitch: 0, yaw: 0 })), move: move || (() => ({ speed: 0, max: 215 * HU, onGround: true, landedAgo: 9, ducked: false })) });
  P.equip(id); T += (weaponById(id).deployMs || 1000) + 50; P.update(.016); return { P, reports, dirs };
}
// Frames at `fps` with ±10 % jitter (seeded: the same jitter sequence for a given fps), until `ms` have passed.
function frames(P, fps, ms, seed = 1, each = null) { let s = seed, left = ms; while (left > 0) { s = (s * 16807) % 2147483647; const dt = Math.min(left, 1000 / fps * (.9 + .2 * s / 2147483647)); T += dt; left -= dt; P.update(dt / 1000); each?.(); } }

// ── SHOOT-01: the cadence at any frame rate ──
{ const runs = {};
  for (const fps of [30, 60, 144, 240]) { T = 1e6; const { P, reports } = rig('negev'); const t0 = T; P.button(0, true); frames(P, fps, 2950, fps); P.button(0, false); frames(P, fps, 300, 7);
    runs[fps] = reports.map(r => ({ dt: r.ft - Math.round(t0), n: r.n - reports[0].n, pu: r.pu, ia: r.ia })); }
  const ref = runs[240]; ok('Negev held 2.95 s: 40 rounds (75 ms cycle, the first at the press)', ref.length === 40, ref.length);
  ok('…each exactly one cycle after the one before', ref.every((r, i) => r.dt === i * 75), JSON.stringify(ref.slice(0, 5).map(r => r.dt)));
  for (const fps of [30, 60, 144]) { const R = runs[fps]; ok(fps + ' fps: the same shots at the same moments as 240 fps', R.length === ref.length && R.every((r, i) => r.dt === ref[i].dt && r.n === ref[i].n), JSON.stringify(R.slice(0, 6).map(r => r.dt)));
    ok(fps + ' fps: the same aim punch and inaccuracy for every bullet (same directions)', R.every((r, i) => close(r.pu[0], ref[i].pu[0], 1e-9) && close(r.pu[1], ref[i].pu[1], 1e-9) && close(r.ia, ref[i].ia, 1e-9))); }
  ok('the rule: a held trigger adds one cycle; a press after the gun is ready starts a full cycle from the press (never borrows time)', nextFireAt(1000, 1000, 100) === 1100 && nextFireAt(1000, 1030, 100) === 1130 && nextFireAt(1000, 1400, 100) === 1500); }

// ── SHOOT-09: a semi-automatic click while the gun isn't ready fires the moment it is (while held) ──
{ T = 2e6; const { P, reports } = rig('pistol'); const t0 = T; P.button(0, true); P.button(0, false); frames(P, 144, 130, 3);
  P.button(0, true); frames(P, 144, 70, 4); P.button(0, false); frames(P, 144, 300, 5);
  ok('Glock: a click 20 ms early, held 70 ms: fires when the 150 ms cycle is up', reports.length === 2 && reports[1].ft - reports[0].ft === 150, JSON.stringify(reports.map(r => r.ft - t0)));
  const t1 = T; P.button(0, true); P.button(0, false); const fired = reports.length; T = t1 + 20; P.update(.02); P.button(0, true); frames(P, 144, 50, 9); P.button(0, false); frames(P, 144, 300, 10);
  ok('a click released before the gun is ready never fires later', fired === 3 && reports.length === fired, JSON.stringify(reports.map(r => r.ft - t1)));
  T = 2.5e6; const pi = rig('pistol'); for (let i = 0; i < 6; i++) { pi.P.button(0, true); frames(pi.P, 30, 60, 11 + i); pi.P.button(0, false); frames(pi.P, 30, 100, 21 + i); }
  ok('clicks every 160 ms at 30 fps: every click a shot, never closer than the cycle', pi.reports.length === 6 && pi.reports.every((r, i) => !i || r.ft - pi.reports[i - 1].ft >= 150), JSON.stringify(pi.reports.map(r => r.ft))); }

// ── SHOOT-11: the trigger lets go (focus lost, a menu, a chorded release) ──
{ T = 3e6; const { P, reports } = rig('ak'); P.button(0, true); frames(P, 60, 250, 1); const a = reports.length; P.release(); frames(P, 60, 500, 2);
  ok('release(): an automatic gun stops at once', a >= 3 && reports.length === a, a + ' → ' + reports.length);
  P.button(0, true); frames(P, 60, 150, 3); const b = reports.length; P.cancelUtility(); frames(P, 60, 500, 4); ok('cancelUtility() (blur, pointer lock lost, a menu) lets go too', reports.length === b, b + ' → ' + reports.length); }

// ── SHOOT-06: CS2's accuracy (weapons.vdata values, our table CS2) ──
{ const ak = weaponById('ak'), a = ak.acc;
  ok('AK: CS2 m_flInaccuracyStand 0.00641, Crouch 0.00481, Fire 0.0078, Move 0.17506, JumpInitial 0.10094', a.stand === .00641 && a.crouch === .00481 && a.fire === .0078 && a.move === .17506 && a.jumpInit === .10094);
  ok('AK: recovery 0.368 → 0.506 s standing over bullets 2–5 (m_flRecoveryTimeStand/Final, transition bullets)', a.recStand === .368 && a.recStandFinal === .506 && a.trStart === 2 && a.trEnd === 5 && W.recoveryTime(a, false, false, 0) === .368 && close(W.recoveryTime(a, false, false, 3.5), (.368 + .506) / 2) && W.recoveryTime(a, false, false, 9) === .506);
  ok('cycle times are CS2\'s m_flCycleTime (AWP 1.455 s, Negev 0.075 s…)', weaponById('sniper').rateMs === 1455 && weaponById('negev').rateMs === 75 && weaponById('ak').rateMs === 100 && weaponById('shotgun').rateMs === 880);
  ok('AWP scoped stand 0.002 (mode 2), unscoped 0.0808; Negev recovery final 0.1 over bullets 9–12', weaponById('sniper').accZ.stand === .002 && weaponById('sniper').acc.stand === .0808 && weaponById('negev').acc.recStandFinal === .1 && weaponById('negev').acc.trStart === 9);
  ok('deploy from m_flDeployDuration (CZ75-Auto 1.833 s, AWP 1.267 s, AK 1 s); head-shot multipliers (Deagle 3.9, M4A1-S 3.475)', weaponById('cz75').deployMs === 1833 && weaponById('sniper').deployMs === 1267 && ak.deployMs === 1000 && weaponById('deagle').hs === 3.9 && weaponById('m4s').hs === 3.475);
  const still = { speed: 0, max: 215 * HU, onGround: true, vy: 0 };
  { const s = createAim(); accuracyDecay(s, a, .5); ok('the first shot from rest: only the stand floor', inaccuracyOf(a, s, still) === a.stand); }
  // Ten AK shots standing vs crouched (decay between shots, CS2's rule): the crouched spray stays tighter.
  const spray = (ducked, k = 10) => { const s = createAim(); accuracyDecay(s, a, 1, ducked); for (let i = 0; i < k; i++) { s.pen += a.fire; recoilShot(s, ak); accuracyDecay(s, a, .1, ducked); } return s; };
  const st = spray(false), cr = spray(true); ok('after 10 shots the cone has opened (fire penalty)', inaccuracyOf(a, st, still) > a.stand * 2, inaccuracyOf(a, st, still));
  ok('crouched, the same spray is tighter', inaccuracyOf(a, cr, still) < inaccuracyOf(a, st, still), inaccuracyOf(a, cr, still) + ' < ' + inaccuracyOf(a, st, still));
  { const s = spray(false); accuracyDecay(s, a, 2 * a.recStandFinal); ok('recovered to within 1 % of the floor after two recovery times (×0.1 each)', (s.pen - a.stand) / (st.pen - a.stand) <= .0101, s.pen); }
  { const s1 = spray(false), s2 = spray(false); accuracyDecay(s1, a, .3); for (let i = 0; i < 30; i++) accuracyDecay(s2, a, .01); ok('recovery is the same in one step or thirty (frame-rate independent)', close(s1.pen, s2.pen, 1e-12)); }
  ok('running: +m_flInaccuracyMove from 34 % of the speed to 95 %; under 34 % (a counter-strafe) nothing', movePenalty(a, { speed: 215 * HU * .33, max: 215 * HU, onGround: true }) === 0 && close(movePenalty(a, { speed: 215 * HU * .95, max: 215 * HU, onGround: true }), a.move) && movePenalty(a, { speed: 215 * HU * .6, max: 215 * HU, onGround: true }) > 0);
  ok('in the air: the jump penalty, least at the apex', movePenalty(a, { speed: 0, max: 1, onGround: false, vy: 0 }) === 0 && movePenalty(a, { speed: 0, max: 1, onGround: false, vy: 300 * HU }) > .1);
  ok('the SSG 08 at a jump\'s apex is accurate again (its jump 0.00572)', movePenalty(weaponById('ssg08').accZ, { speed: 0, max: 1, onGround: false, vy: 0 }) === 0);
  // In weapons.js: a jump adds JumpInitial, a landing Land × speed; then it recovers.
  { T = 4e6; let mv = { speed: 0, max: 215 * HU, onGround: true, vy: 0, landedAgo: 9, landSpeed: 0 }; const { P } = rig('ak', { move: () => mv }); P.update(.016); const i0 = P.inaccuracy;
    mv = { ...mv, onGround: false, vy: 302 * HU }; T += 16; P.update(.016); const i1 = P.inaccuracy; mv = { ...mv, onGround: true, vy: 0, landedAgo: 0, landSpeed: 400 }; T += 16; P.update(.016); const i2 = P.inaccuracy;
    mv = { ...mv, landedAgo: 1 }; frames(P, 60, 2000, 3); ok('weapons.js: a jump costs JumpInitial at once, a landing more, then back to the floor', close(i0, a.stand) && i1 > a.stand + .1 && i2 > a.stand + .05 && close(P.inaccuracy, a.stand, 1e-4), [i0, i1, i2, P.inaccuracy].map(x => x.toFixed(4)).join(' ')); } }

// ── SHOOT-10: the spray recovers straight back, never along the pattern ──
{ const ak = weaponById('ak'), s = createAim(); let follows = true; for (let i = 0; i < 30; i++) { const [p, y] = sprayAt(ak, i); follows &&= close(s.aimP, p, 1e-9) && close(s.aimY, y, 1e-9); recoilShot(s, ak); }
  ok('a continuous spray follows the gun\'s pattern exactly (the learned spray)', follows);
  const s2 = createAim(); for (let i = 0; i < 20; i++) recoilShot(s2, ak); const r0 = Math.hypot(s2.aimP, s2.aimY), ratio = s2.aimY / s2.aimP; let mono = true, straight = true, last = r0, t = 0;
  for (let i = 0; i < 70; i++) { recoilRest(s2, ak, .01); t += .01; const r = Math.hypot(s2.aimP, s2.aimY); mono &&= r <= last + 1e-12; if (r > 1e-6) straight &&= close(s2.aimY / s2.aimP, ratio, 1e-9); last = r; }
  ok('at rest the punch only shrinks, along its own line (no S-curve back)', mono && straight); ok('…and is gone within 0.7 s (exp 8 /s + 18 °/s)', last < .1, last);
  const ng = weaponById('negev'), s3 = createAim(); for (let i = 0; i < 40; i++) recoilShot(s3, ng); let up = false, p = s3.aimP; for (let i = 0; i < 300; i++) { recoilRest(s3, ng, .01); up ||= s3.aimP > p + 1e-12; p = s3.aimP; } ok('the Negev never climbs while recovering', !up);
  const s4 = createAim(), s5 = createAim(); for (let i = 0; i < 10; i++) { recoilShot(s4, ak); recoilShot(s5, ak); } recoilRest(s4, ak, .3); for (let i = 0; i < 37; i++) recoilRest(s5, ak, .3 / 37); ok('rest decay is the same in one step or many', close(s4.aimP, s5.aimP, 1e-9) && close(s4.ri, s5.ri, 1e-9));
  ok('the rest starts after 1.1 cycles (single-shot guns 60 ms)', close(restAfterMs(ak), 110) && restAfterMs(weaponById('sniper')) === 60); }

// ── SHOOT-07: the seeded spread — the same bullets on the shooter, the host and the other players ──
{ ok('shotRand: pure integer hashing (fixed values: any change would split host and clients)', shotRand(1, 0) === 0.7503997390158474 && shotRand(2, 0) === 0.503355290973559 && shotRand(123456789, 5) === shotRand(123456789, 5) && shotRand(1001, 0) !== shotRand(1002, 0));
  const out = new Float64Array(32); let sum = 0; for (let i = 0; i < 20000; i++) { shotOffsets(weaponById('ak'), 5e6 + i, .01, 0, out); sum += Math.hypot(out[0], out[1]); } ok('CS distribution: uniform in the radius (mean ≈ inaccuracy / 2)', Math.abs(sum / 20000 - .005) < .0002, sum / 20000);
  T = 5e6; const { P, reports, dirs } = rig('ak', { aim: () => ({ pitch: .01, yaw: .02 }) }); P.button(0, true); frames(P, 60, 600, 2); P.button(0, false);
  const B = [0, 0, 0], D = [0, 0, 0], O = new Float64Array(32); let same = reports.length > 3;
  for (let i = 0; i < reports.length; i++) { const r = reports[i]; shotBase(r.look[0], r.look[1], r.pu[0], r.pu[1], B); shotOffsets(weaponById('ak'), r.n, r.ia, weaponById('ak').acc.spread, O); offsetDir(B, O[0], O[1], D); same &&= dirs[i] && D.every((v, k) => close(v, dirs[i][k], 1e-12)); }
  ok('every bullet the client fired is exactly the one its record recomputes (eye, look, punch, inaccuracy, shot number)', same, reports.length);
  ok('the record: shot number, trigger time, eye, raw look, aim punch, inaccuracy', reports.every(r => Number.isInteger(r.n) && Number.isFinite(r.ft) && r.eye.length === 3 && r.look.length === 2 && r.pu.length === 2 && Number.isFinite(r.ia)));
  const ps = P.poseShot(0, 0), last = reports.at(-1); ok('the pose carries the newest shot (others draw its bullets) and the gun that fired', ps.n === last.n && ps.sp === .01 && ps.yaw === .02 && ps.pu[0] === last.pu[0] && ps.pu[1] === last.pu[1] && ps.ia === last.ia && ps.w === 'ak', JSON.stringify(ps));
  const rd = shotDirs(new THREE.Vector3(0, 0, -1), weaponById('ak'), ps, ps.n)[0]; ok('…and another player rebuilds that very bullet from the pose (shotDirs)', [rd.x, rd.y, rd.z].every((v, k) => close(v, dirs.at(-1)[k], 1e-12)), JSON.stringify([rd, dirs.at(-1)]));
  ok('pose.shot.pitch stays the live look pitch after shooting (flash facing, the spectator camera), also after reset()', P.poseShot(1.2, 0).pitch === 1.2 && (P.reset(), P.poseShot(-1, 0).pitch === -1)); }

// ── SHOOT-05: the body's shape (head sphere, torso cylinder) ──
{ const o = {}, hit = (y, off, cr = false) => { const t = rayBody(off, y, 10, 0, 0, -1, 0, 0, 0, cr, 0, o); return t > 0 ? o.zone : null; };
  ok('nothing above the head (11.5 units through the axis)', hit(11.5, 0) === null); ok('the head at 10.2 near the axis', hit(10.2, .3) === 'head'); ok('beside the head (1.2 off at 10.2): a miss, no longer a head shot', hit(10.2, 1.2) === null);
  ok('chest at 7.9 with a 1.2 offset; stomach at 5.8; legs at 2.7', hit(7.9, 1.2) === 'chest' && hit(5.8, 0) === 'stomach' && hit(2.7, 0) === 'legs');
  ok('crouched, everything is CROUCH_H lower (head at 8.0, nothing at 9.5)', hit(8, 0, true) === 'head' && hit(9.5, 0, true) === null); }

// ── The host: traces the shot itself, counts it once, judges the rate on the shooter's clock ──
const map = ARENA_MAPS.yard, boxes = mapBoxes(map, ARENA.cx, ARENA.cz);
const spot = (() => { for (let x = -120; x < 120; x += 4) for (let z = -120; z < 120; z += 4) { const a = { x: ARENA.cx + x, z: ARENA.cz + z }, b = { x: a.x + 30, z: a.z }; if ([a, b].every(p => !boxes.some(q => p.x > q.minX - 3 && p.x < q.maxX + 3 && p.z > q.minZ - 3 && p.z < q.maxZ + 3)) && segmentClear(boxes, a.x, 9.7, a.z, b.x, 7, b.z) && segmentClear(boxes, a.x, 9.7, a.z, b.x, 10, b.z) && segmentClear(boxes, a.x, 9.7, a.z, b.x, 2, b.z)) return a; } })();
const yawTo = (f, x, z) => Math.atan2(-(x - f.x), -(z - f.z)), pitchTo = (f, x, y, z) => Math.atan2(y - f.y, Math.hypot(x - f.x, z - f.z));
const fresh = (prim = 'ak', t0 = 3e9) => { const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0 }, t0); const a = { x: spot.x, y: 9.7, z: spot.z }, b = { x: spot.x + 30, y: 9.7, z: spot.z, yaw: 0 }; a.yaw = yawTo(a, b.x, b.z);
  const P = [{ id: 'a', name: 'Ann', pose: a }, { id: 'b', name: 'Bo', pose: b }]; arenaApply(g, { type: 'loadout', primary: prim }, 'Ann', P, t0); return { g, P, a, b }; };
// A client-like record aimed at height h above the target's feet (yaw offset dyaw), shot n, trigger time ft.
const rec = (wpn, a, b, nn, ft, h = 7.9, extra = {}) => ({ type: 'hit', target: 'b', weapon: wpn, n: nn, ft, eye: [a.x, a.y, a.z], look: [pitchTo(a, b.x, h, b.z), yawTo(a, b.x, b.z) + (extra.dyaw || 0)], pu: [0, 0], ia: weaponById(wpn).acc.stand, zone: 'chest', ...extra });
{ const { g, P, a, b } = fresh(); const t = 3e9 + 5000;
  let r = combatApply(g, rec('ak', a, b, 1001, 100), 'Ann', P, 'a', t); ok('a chest shot the host traced: 36 (AK, CS2)', r.dmg === 36 && r.zone === 'chest', JSON.stringify(r));
  assert.throws(() => combatApply(g, rec('ak', a, b, 1001, 100), 'Ann', P, 'a', t + 1), /Already counted/); n++; ok('…the same shot again adds nothing (HP down by one hit only)', hpOf(g, 'Bo') === 64);
  r = combatApply(g, rec('ak', a, b, 1002, 200), 'Ann', P, 'a', t + 5); ok('SHOOT-02: the next shot 100 ms later on the shooter\'s clock, arriving 5 ms after: counted', r.dmg === 36, JSON.stringify(r));
  assert.throws(() => combatApply(g, rec('ak', a, b, 1003, 230), 'Ann', P, 'a', t + 400), /Too fast/); n++;
  ok('…one 30 ms after it on the shooter\'s clock is too fast, however late it arrives (no damage)', hpOf(g, 'Bo') === 100 - 72, hpOf(g, 'Bo'));
  // Reordered: 1005 then 1004 (both a cycle apart from what came before).
  const S0 = 4e6, { g: g2, P: P2, a: a2, b: b2 } = fresh(); takeShots(g2, 'Ann', S0 + 3, 'ak');   // (the pose stream has numbered the shots so far — a game client's numbering, from 1e6 up)
  combatApply(g2, rec('ak', a2, b2, S0 + 5, 500), 'Ann', P2, 'a', t); r = combatApply(g2, rec('ak', a2, b2, S0 + 4, 400), 'Ann', P2, 'a', t + 1);
  ok('reordered delivery: both land, each round charged once', hpOf(g2, 'Bo') === 100 - 72 && ammoOf(g2, 'Ann', 'ak')[0] === 30 - 2, JSON.stringify([hpOf(g2, 'Bo'), ammoOf(g2, 'Ann', 'ak')]));
  poseAmmo(g2, 'Ann', { n: S0 + 5, r: 0, w: 'ak' }, 'ak'); ok('the pose with those numbers charges nothing more', ammoOf(g2, 'Ann', 'ak')[0] === 28);
  assert.throws(() => combatApply(g2, rec('ak', a2, b2, S0 + 5 + 600, 9e9), 'Ann', P2, 'a', t + 9000), /Unknown shot/); n++; ok('SHOOT-12: a number 600 past the last is refused and charges nothing', ammoOf(g2, 'Ann', 'ak')[0] === 28);
  // A forged zone: the record says head, the ray goes through the chest.
  const { g: g3, P: P3, a: a3, b: b3 } = fresh(); r = combatApply(g3, rec('ak', a3, b3, 3001, 0, 7.9, { zone: 'head', head: true }), 'Ann', P3, 'a', t);
  ok('a "head" claim on a chest ray scores the chest', r.zone === 'chest' && r.dmg === 36, JSON.stringify(r));
  r = combatApply(g3, rec('ak', a3, b3, 3002, 100, 10.25), 'Ann', P3, 'a', t + 200); ok('a ray through the head is a head shot (the host\'s own)', r.zone === 'head', JSON.stringify(r)); delete g3.combat.down.bo; g3.combat.hp.bo = 100;   // (Bo up again for the refusals)
  assert.throws(() => combatApply(g3, rec('ak', a3, b3, 3003, 200, 7.9, { dyaw: .2 }), 'Ann', P3, 'a', t + 400), /Missed/); n++;   // (a claimed hit whose ray passes beside the body)
  const P3b = [{ ...P3[0], pose: { ...P3[0].pose, yaw: P3[0].pose.yaw + 2 } }, P3[1]];   // (a shot sent well to the side of where the shooter faced)
  assert.throws(() => combatApply(g3, rec('ak', a3, b3, 3004, 300), 'Ann', P3b, 'a', t + 600), /Not where you looked/); n++;
  const P3c = [{ ...P3[0], pose: { ...P3[0].pose, x: P3[0].pose.x - 8 } }, P3[1]]; assert.throws(() => combatApply(g3, rec('ak', a3, b3, 3005, 400), 'Ann', P3c, 'a', t + 800), /Not where you stood/); n++;
  assert.throws(() => combatApply(g3, rec('ak', a3, b3, 3006, 500, 7.9, { pu: [40, 0] }), 'Ann', P3, 'a', t + 1000), /Recoil out of bounds/); n++;
  // A forged zero inaccuracy (unscoped AWP: the floor is 0.06): the host draws the shot with its floor.
  const { g: g4, P: P4, a: a4, b: b4 } = fresh('sniper'); const far = { ...b4 }; let nn = 7000; const O = new Float64Array(32); while (Math.hypot(...(shotOffsets(weaponById('sniper'), nn, .0606 * .999, .0002, O), [O[0], O[1]])) < .05) nn++;
  assert.throws(() => combatApply(g4, { ...rec('sniper', a4, far, nn, 0, 10.25), ia: 0 }, 'Ann', P4, 'a', t), /Missed/); n++;
  ok('…the same shot drawn honestly misses too (the host is not stricter than the truth)', (() => { try { traceShot(g4, weaponById('sniper'), { ...rec('sniper', a4, far, nn, 0, 10.25), ia: .0808 }, nn, a4, far); return false; } catch (e) { return /Missed/.test(e.message); } })()); }

// ── Semi-automatic clicks and re-pressed automatics are never closer than the gun's cycle, so the host's rate gate
//    accepts every shot the client fired (a click shortly after the gun was ready used to borrow up to half a cycle) ──
{ const sched = [1.45, .6, 1.2, .7, 1.05, .8];   // (click moments, in cycles after the shot before; each click held half a cycle: an early one waits for the gun)
  for (const id of ['pistol', 'deagle', 'usps', 'sniper', 'ak', 'negev']) { const w = weaponById(id); T = 1.1e7; const { P, reports } = rig(id, { aim: () => ({ pitch: -.6, yaw: 0 }) }); P.setAmmo(id, [10, 90]);   // (aimed at the chest 3 units ahead: every bullet hits, every shot reports; 10 in: the AWP holds 5)
    P.button(0, true); frames(P, 144, 5, 1); P.button(0, false);
    for (const c of sched) { const at = reports.at(-1).ft + w.rateMs * c; frames(P, 144, Math.max(0, at - T), 2); P.button(0, true); frames(P, 144, w.rateMs * .5, 3); P.button(0, false); }
    frames(P, 144, 3000, 4); const gaps = reports.slice(1).map((r, i) => r.ft - reports[i].ft);
    ok(id + ': every click fired, none closer than its ' + w.rateMs + ' ms cycle (m_flCycleTime)', reports.length === sched.length + 1 && reports.every((r, i) => r.n - reports[0].n === i) && gaps.every(g => g >= w.rateMs - 1e-9), JSON.stringify(gaps.map(Math.round)));
    const { g, P: HP, a, b } = fresh(w.kind === 'pistol' ? 'ak' : id); if (w.kind === 'pistol') arenaApply(g, { type: 'loadout', secondary: id }, 'Ann', HP, 3e9); g.combat.ammo.ann[id] = [10, 90]; const refused = [];
    for (const r of reports) { try { combatApply(g, rec(id, a, b, r.n, r.ft, 3), 'Ann', HP, 'a', 3e9 + 5000 + r.ft - reports[0].ft); } catch (e) { refused.push(e.message); } delete g.combat.down?.bo; g.combat.hp.bo = 100; }
    ok(id + ': the host takes every one of those shots (none "Too fast"; an unscoped AWP may miss on its 0.08 cone)', !refused.some(m => !(id === 'sniper' && m === 'Missed')) && refused.length < reports.length, refused.join(' | ')); }
  // An empty semi-automatic held down: one dry click per press (as v51 — the waiting click is only for a loaded gun).
  const { sounds } = await import('../dist/weapons.js'), dry0 = sounds.dry; let dry = 0; sounds.dry = () => { dry++; };
  try { T = 1.2e7; const { P } = rig('pistol'); P.setAmmo('pistol', [0, 0]); P.button(0, true); frames(P, 144, 1000, 5); P.button(0, false); frames(P, 144, 200, 6); ok('an empty Glock held 1 s: one dry click', dry === 1, dry); } finally { sounds.dry = dry0; } }

// ── A counter-strafe (real arena-move at 128 Hz, poses at 30 Hz): the host's speed floor never widens an honest shot —
//    the hit beats its own pose to the host (speed unknown: the floor only), and once the poses after it arrive the
//    shooter is seen standing; a shooter running through the shot is still caught ──
{ const Mv = await import('../dist/arena-move.js'), { createPoseHistory, rewound } = await import('../dist/lag-comp.js'), id = 'ak', w = weaponById(id), max = Mv.maxSpeed(id);
  const sim = strafe => { const s = Object.assign(Mv.createMoveState(0), { x: spot.x, z: spot.z }), H = createPoseHistory(); let t = 0, next = 0, shot = null, first = null;
    for (let i = 0; i < 128 * 3; i++) { const sp = Math.hypot(s.vx, s.vz);
      if (shot === null && t > 1 && (!strafe || sp < max * .34)) { shot = Math.round(t * 1000); first = rewound(H, [{ id: 'a', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }], { type: 'hit', target: 'b', ft: shot }, 'a')[0].pose; }
      if (shot !== null && t * 1000 > shot + 300) break;
      Mv.moveStep(s, { wish: shot === null ? (strafe && t > 1 ? [-1, 0] : [1, 0]) : strafe ? [0, 0] : [1, 0], weapon: id }, null, Mv.TICK); t += Mv.TICK;
      if (t * 1000 >= next) { H.record('a', Math.round(t * 1000), { x: s.x, y: 9.7, z: s.z, yaw: 0 }); next += 1000 / 30; } }
    return { first, later: rewound(H, [{ id: 'a', pose: { x: 0, y: 9.7, z: 0, yaw: 0 } }], { type: 'hit', target: 'b', ft: shot }, 'a')[0].pose }; };
  const cs = sim(true), run = sim(false);
  ok('counter-strafe: the hit arrives before its pose — the host knows no speed (floor only; the run-up before used to read as running)', cs.first.vel === null, JSON.stringify(cs.first.vel));
  ok('…and with the poses after it, the shooter is not running (the slower side: standing after the shot)', cs.later.vel && cs.later.vel.h < max * .85, cs.later.vel && (cs.later.vel.h / max).toFixed(2));
  ok('running through the shot (poses on both sides): seen running', run.later.vel && run.later.vel.h > max * .85, run.later.vel && (run.later.vel.h / max).toFixed(2));
  const { g, a, b } = fresh(), same = (vel) => { let k = 0, eq = 0; for (let nn = 5e6; nn < 5e6 + 200; nn++) { const r = rec(id, a, b, nn, 0, 10.25), f = x => { try { return traceShot(g, w, r, nn, { ...a, vel: x }, b).hits.map(h => h.zone).join(); } catch (e) { return e.message; } }; k++; if (f(null) === f(vel)) eq++; } return eq / k; };
  ok('the host traces the counter-strafed shots exactly as the shooter fired them (200 seeds, head aim at 30 units)', same(cs.first.vel) === 1 && same(cs.later.vel) === 1);
  ok('…while the running shots get the host\'s wider cone (some land elsewhere)', same(run.later.vel) < 1, same(run.later.vel)); }

// ── Flick and fire (gd-lan-wifi-e2e's guest: faces away, turns onto the target and clicks at once): the hit beats the pose
//    that shows the turn, so the host cannot judge the look yet — it must not refuse the shot as 'Not where you looked';
//    with poses either side of the moment the look is judged against either one's facing, and a shot sent sideways
//    while the poses around it face forward is still refused ──
{ const { createPoseHistory, rewound } = await import('../dist/lag-comp.js'), got = [];
  for (const [flick, after] of [[Math.PI, false], [1.6, false], [Math.PI, true]]) { const { g, P, a, b } = fresh(), aim = a.yaw, H = createPoseHistory();
    for (let s = 0; s <= 990; s += 33) { H.record('a', s, { ...a, yaw: aim + flick }); H.record('b', s, b); } if (after) H.record('a', 1040, { ...a, yaw: aim });
    const r = { ...rec('ak', a, b, 6e6 + 1, 1010), seen: 990 }; try { got.push(combatApply(g, r, 'Ann', rewound(H, P, r, 'a'), 'a', 3e9 + 5000).dmg); } catch (e) { got.push(e.message); } }
  ok('flick and fire: a 180° / 92° turn whose pose has not arrived, and a 180° turn between two poses, all land (36 each)', got.every(x => x === 36), JSON.stringify(got));
  const { g, P, a, b } = fresh(), H = createPoseHistory(); for (let s = 0; s <= 1100; s += 33) { H.record('a', s, { ...a, yaw: a.yaw }); H.record('b', s, b); }
  const r = { ...rec('ak', a, b, 6e6 + 1, 1010, 7.9, { dyaw: 2 }), seen: 990 }; assert.throws(() => combatApply(g, r, 'Ann', rewound(H, P, r, 'a'), 'a', 3e9 + 5000), /Not where you looked/); n++;
  const H2 = createPoseHistory(); for (let s = 0; s <= 990; s += 33) { H2.record('a', s, { ...a, x: a.x - 8 }); H2.record('b', s, b); }
  const r2 = { ...rec('ak', a, b, 6e6 + 2, 1010), seen: 990 }; assert.throws(() => combatApply(g, r2, 'Ann', rewound(H2, P, r2, 'a'), 'a', 3e9 + 6000), /Not where you stood/); n++;   // (8 units off with a 20 ms lead: still refused, the lead buys ~1.2)
}

// ── A page reload / rejoin mid-match: a new random shot numbering and a fresh page clock — the rate gate starts over
//    (it used to measure the new shots against the old session's last one: 'Too fast' for the rest of the match) ──
for (const S2 of [2e8, 2e6]) { const { g, P, a, b } = fresh(), t = 3e9 + 5000, S1 = 5e6; poseAmmo(g, 'Ann', { n: S1, r: 0, w: 'ak' }, 'ak');
  combatApply(g, rec('ak', a, b, S1 + 1, 600000, 5.8), 'Ann', P, 'a', t); poseAmmo(g, 'Ann', { n: S2, r: 0, w: 'ak' }, 'ak'); const got = [];
  for (let i = 1; i <= 2; i++) { try { got.push(combatApply(g, rec('ak', a, b, S2 + i, 5000 + i * 2000, 5.8), 'Ann', P, 'a', t + 60000 + i * 2000).dmg); } catch (e) { got.push(e.message); } delete g.combat.down?.bo; g.combat.hp.bo = 100; }
  ok('after a reload to numbering ' + S2 + ' (' + (S2 > S1 ? 'higher' : 'lower') + ') on a fresh clock: the hits count', got.every(x => x === 45), JSON.stringify(got));
  assert.throws(() => combatApply(g, rec('ak', a, b, S2 + 3, 9030, 5.8), 'Ann', P, 'a', t + 70000), /Too fast/); n++;   // (…and the new session is gated again: 30 ms after its last shot)
}

// ── Deathmatch spawn protection: poses end it only with a new shot (every pose used to: gone at the first one) ──
{ const g = { levels: {} }, t0 = 4e11; startArena(g, { map: 'yard', bots: 0 }, t0); const { arenaTick } = await import('../dist/arena-logic.js'); const P = [{ id: 'a', name: 'Ann', pose: { x: 0, y: 9.7, z: -800 } }, { id: 'b', name: 'Bo', pose: { x: 5, y: 9.7, z: -800 } }];
  arenaTick(g, P, .05, t0 + 50); ok('a fresh deathmatch spawn is protected', (g.combat.safe?.ann || 0) > t0 + 50);
  poseAmmo(g, 'Ann', { n: 5e6, r: 0 }, 'pistol'); poseAmmo(g, 'Ann', { n: 5e6, r: 0 }, 'pistol'); ok('…poses with no new shot leave the protection on', (g.combat.safe?.ann || 0) > t0 + 50);
  poseAmmo(g, 'Ann', { n: 5e6 + 1, r: 0, w: 'pistol' }, 'pistol'); ok('…a pose with a new shot ends it (firing)', !g.combat.safe?.ann); }

// ── SHOOT-15: shots fired at the end of a round, arriving in the next one's freeze time ──
{ const t0 = 8e9, d = { levels: {} }; startArena(d, { map: 'dust2', kind: 'defuse', bots: 0 }, t0); const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: ARENA.cz + z, yaw: 0 });
  const DP = [{ id: 't1', name: 'Tess', pose: at(M.t[0]) }, { id: 'c1', name: 'Cal', pose: at(M.ct[0]) }]; const { arenaTick } = await import('../dist/arena-logic.js'); arenaTick(d, DP, .05, t0 + 50);
  ok('freeze time', d.combat.d.round.phase === 'freeze'); poseAmmo(d, 'Tess', { n: 100, r: 0 }, 'pistol'); poseAmmo(d, 'Tess', { n: 103, r: 0, w: 'pistol' }, 'pistol');
  ok('late shot numbers in the freeze are counted, not charged to the fresh magazine', JSON.stringify(ammoOf(d, 'Tess', 'pistol')) === '[20,120]'   /* (v53 RESERVE: the default Bullets model, the user's 20 | 120; CS2's 3 magazines = 60 in Magazines — tests/gd-reserve-modes.mjs) */ && d.combat.shots.tess.n === 103, JSON.stringify(ammoOf(d, 'Tess', 'pistol')));
  assert.throws(() => combatApply(d, { type: 'hit', target: 'c1', weapon: 'pistol', zone: 'chest', n: 104 }, 'Tess', DP, 't1', t0 + 60), /hasn’t started/); n++;
  arenaTick(d, DP, .05, t0 + DEFUSE.freezeMs + 200); poseAmmo(d, 'Tess', { n: 104, r: 0, w: 'pistol' }, 'pistol'); ok('the first live shot takes its round', ammoOf(d, 'Tess', 'pistol')[0] === 19);
  const rid = d.combat.d.round.id; ok('a hit tagged with an older round is refused before it is judged (room: epochError)', /round has ended/.test(epochError(d, { type: 'hit', round: rid - 1 }) || '') && !epochError(d, { type: 'hit', round: rid })); }

// ── SHOOT-04: shotgun pellets each in their own hit group ──
{ const nova = weaponById('shotgun'), H = [{ zone: 'head', f: 1 }, ...Array(8).fill({ zone: 'legs', f: 1 })];
  const r = pelletDamage(nova, H, 40); ok('Nova: 1 head + 8 leg pellets = one head pellet + eight leg pellets (not nine head shots)', r.hp === damageFor(nova, 'head', 40) + 8 * damageFor(nova, 'legs', 40) && r.hp < 300, r.hp);
  const ar = pelletDamage(nova, H, 40, { kevlar: 100, helmet: true }); ok('with a helmet the head pellet is reduced, the legs are not', ar.hp === pelletDamage(nova, [H[0]], 40, { kevlar: 100, helmet: true }).hp + 8 * damageFor(nova, 'legs', 40) && ar.armor > 0, JSON.stringify(ar));
  const { g, P, a, b } = fresh('shotgun'); P[1].pose = { ...b, x: a.x + 12 }; const shot = { ...rec('shotgun', a, P[1].pose, 50, 0, 6.5), zone: 'head', pellets: 9 }, tr = traceShot(g, nova, shot, 50, a, P[1].pose);
  ok('host: a Nova shot into the body at 12 units — the host traces every pellet itself (its own groups, no head)', tr.hits.length >= 5 && tr.hits.length <= 9 && !tr.hits.some(h => h.zone === 'head'), JSON.stringify(tr.hits.map(h => h.zone)));
  const r2 = combatApply(g, shot, 'Ann', P, 'a', 3e9 + 5000); ok('…and the damage is those pellets\' (not a head claim × 9)', r2.zone !== 'head' && (r2.dmg === pelletDamage(nova, tr.hits, tr.dist).hp || r2.down), JSON.stringify(r2));
  const { g: gl, P: Pl } = fresh('shotgun'); const r3 = combatApply(gl, { type: 'hit', target: 'b', weapon: 'shotgun', zone: 'head', pellets: 9, zones: { head: 1, legs: 8 }, n: 9 }, 'Ann', Pl, 'a', 3e9 + 5000);
  ok('an older record with pellet zones: each pellet in its own group too', r3.dmg === Math.min(100, pelletDamage(nova, H, 30).hp) || r3.dmg === pelletDamage(nova, H, 30).hp, JSON.stringify(r3)); }

// ── SHOOT-13: ammo charged to the gun that fired and the one that reloaded ──
{ const { g, P } = fresh('sniper'); takeShots(g, 'Ann', 500, 'sniper');
  poseAmmo(g, 'Ann', { n: 501, r: 0, w: 'sniper' }, 'knife'); ok('an AWP shot, then a switch to the knife before the pose: the AWP is charged', JSON.stringify(ammoOf(g, 'Ann', 'sniper')) === '[4,30]'   /* (v53 RESERVE: the default Bullets model's classic 5 | 30; CS2's 2 magazines = 10 in Magazines) */, JSON.stringify(ammoOf(g, 'Ann', 'sniper')));
  const { g: g2 } = fresh('ak'); takeShots(g2, 'Ann', 500, 'ak'); poseAmmo(g2, 'Ann', { n: 502, r: 0, w: 'ak' }, 'pistol');
  ok('AK shots with the pistol already in hand: the AK pays, the pistol is untouched', JSON.stringify(ammoOf(g2, 'Ann', 'ak')) === '[28,90]' && JSON.stringify(ammoOf(g2, 'Ann', 'pistol')) === '[20,120]');   // (v53 RESERVE: the default Bullets model)
  T = 6e6; const c = rig('ak'); c.P.button(0, true); c.P.button(0, false); ok('the client names the gun that fired in its pose', c.P.poseShot(0, 0).w === 'ak' && c.P.lastFired === 'ak'); }

// ── SHOOT-17: shotguns reload shell by shell; a click fires the shells in ──
{ const { g } = fresh('shotgun'); g.combat.ammo.ann.shotgun = [6, 32]; takeReload(g, 'Ann', 10, 'shotgun'); takeReload(g, 'Ann', 12, 'shotgun'); ok('host: two shell numbers move two shells', JSON.stringify(ammoOf(g, 'Ann', 'shotgun')) === '[8,30]', JSON.stringify(ammoOf(g, 'Ann', 'shotgun')));
  g.combat.ammo.ann.shotgun = [6, 32]; takeReload(g, 'Ann', 13, 'shotgun'); ok('…one number, one shell', JSON.stringify(ammoOf(g, 'Ann', 'shotgun')) === '[7,31]');
  T = 7e6; const nova = weaponById('shotgun'), { P, reports } = rig('shotgun'); P.setAmmo('shotgun', [5, 32]); const r0 = P.reloads; P.reload();
  frames(P, 60, nova.shellIntroMs + nova.shellAddMs + nova.shellMs + 30, 1); ok('client: the first shell after CS2\'s intro + add moment, one per loop (shellMs) after (reload number each) — v53 RELOAD', P.ammo === 7 && P.reloads === r0 + 2, P.ammo + ' ' + (P.reloads - r0));
  P.button(0, true); P.button(0, false); ok('a click with shells in fires and ends the reload', reports.length === 1 && !P.reloading && P.ammo === 6, reports.length + ' ' + P.reloading + ' ' + P.ammo);
  frames(P, 60, 2000, 2); ok('…no shells after that', P.ammo === 6); }

// ── SHOOT-16: scope FOVs (CS2: horizontal degrees on 4:3) and scoped sensitivity ──
{ ok('zoomVfov: 90 → 73.74 (the arena\'s), 40 → 30.5, 10 → 7.5', close(zoomVfov(90), 73.74, .01) && close(zoomVfov(40), 30.54, .02) && close(zoomVfov(10), 7.5, .02), [zoomVfov(90), zoomVfov(40), zoomVfov(10)].map(x => x.toFixed(2)).join(' '));
  T = 8e6; const { P } = rig('sniper'); P.button(2, true); ok('AWP scope 1: the camera at 30.5° vertical, sensitivity 40 / 90', close(P.scopeFov, zoomVfov(40)) && close(P.scopeSens, zoomSens(40)) && close(P.scopeSens, 40 / 90));
  P.button(2, true); ok('scope 2: 10° → 7.5° vertical', close(P.scopeFov, zoomVfov(10)));
  T = 8.5e6; const q = rig('sniper'); q.P.update(.016); const un = q.P.inaccuracy; q.P.button(2, true); T += 20; q.P.update(.02); const early = q.P.inaccuracy; T += 60; q.P.update(.06);
  ok('AWP: unscoped 0.0808; scoped, the unscoped accuracy until the zoom time (50 ms), then 0.002', close(un, .0808) && close(early, .0808) && close(q.P.inaccuracy, .002), [un, early, q.P.inaccuracy].join(' ')); }

// ── SHOOT-18: the flinch of being shot ──
{ T = 9e6; const { P } = rig('ak'); const bare = P.flinch(30, false); P.reset(); const arm = P.flinch(30, true); P.reset(); P.flinch(30, false); P.update(.016); const p0 = P.punch.pitch; frames(P, 60, 600, 1);
  ok('being shot kicks the aim up, much less on armor; gone within 0.6 s', bare > arm && arm > 0 && p0 > 0 && Math.abs(P.punch.pitch) < .05 * Math.PI / 180, [bare, arm, p0, P.punch.pitch].join(' ')); }

console.log('PASS: Global Defensive shooting · ' + n + ' checks (cadence at 30/60/144/240 fps, semi-auto queue, trigger release, CS2 accuracy + recovery, straight spray recovery, seeded shots shooter = host, body shape, host trace / once per shot / rate on the shooter\'s clock / forged jump, look, place, zone, punch, inaccuracy, late round, shotgun pellets per group, ammo to the gun that fired, shell reloads, scope FOV + sensitivity, flinch)');
