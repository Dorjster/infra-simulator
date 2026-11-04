// Global Defensive bullet tracers (gd-tracers.js, fun-pistol.js, weapons.js, multiplayer.js, arena-logic.js):
//  · every gun has a tracer frequency — CS2's m_nTracerFrequency (weapons.vdata), and 1 in 3 where CS2 has 0 (the
//    silenced USP-S and M4A1-S, the MP5-SD); counted on the shot's own number (numbers 1, 1 + f, 1 + 2f…), so
//    every gun shows tracers within any three shots; shotguns draw a few pellets of each shot (every third);
//  · your own shots (shootAt with the shot number), other players' and bots' (shoot with dirs and n) draw them; bots'
//    shots carry a pitch toward their target (arena-logic botRoster), so their streaks are not flat;
//  · one fixed pool in ONE mesh (one draw, always in the scene, its material in the warm-up samples); a full pool reuses
//    the oldest; streaks stop at the bullet's stop and fade; no meshes are made per shot;
//  · update() makes nothing per frame (heap flat over 20 000 frames with tracers flying).
//   node tests/gd-tracers.mjs        (re-runs itself with --expose-gc for the allocation check)
import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
let n = 0, ok = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 400))); };
const ET = new EventTarget(); globalThis.addEventListener ??= ET.addEventListener.bind(ET); globalThis.dispatchEvent ??= ET.dispatchEvent.bind(ET);
let T = 1000; performance.now = () => T;
const THREE = await import('../dist/three.module.js');
const TR = await import('../dist/gd-tracers.js');
const { WEAPONS, isFirearm, weaponById, HU } = await import('../dist/weapons-data.js');
const { createPistolEffects } = await import('../dist/fun-pistol.js');
const { TRACER_FREQ, tracerShot, tracerPellet, tracerFreq, createTracers, POOL, TRACER } = TR;

// 1 · frequencies: CS2's per gun (weapons.vdata m_nTracerFrequency; 0 → 3).
const CS2 = { pistol: 1, usps: 0, p250: 1, fiveseven: 1, cz75: 1, tec9: 1, deagle: 1, mac10: 3, mp9: 3, mp7: 3, smg: 0, bizon: 3, ump45: 3, p90: 3, shotgun: 1, xm1014: 1, galil: 3, famas: 3, ak: 3, m4: 3, m4s: 0, sg553: 3, aug: 3, ssg08: 1, sniper: 1, lmg: 1, negev: 1 };
const guns = WEAPONS.filter(isFirearm);
check('every firearm has its own tracer frequency', guns.every(w => TRACER_FREQ[w.id] >= 1), guns.filter(w => !TRACER_FREQ[w.id]).map(w => w.id));
check('the frequencies are CS2\'s (0 → one in three)', guns.every(w => tracerFreq(w.id) === (CS2[w.id] || 3)), guns.map(w => w.id + ':' + tracerFreq(w.id)).join(' '));
check('every gun draws a tracer within any three shots in a row', guns.every(w => { for (let s = 1; s < 60; s++) if (![s, s + 1, s + 2].some(k => tracerShot(w.id, k))) return false; return true; }));
check('every shot of every gun draws a tracer (user: each bullet)', guns.every(w => [1, 2, 3, 4, 5, 6, 7].every(k => tracerShot(w.id, k))));
check('every shot of the AWP, the Deagle, the Glock, the shotguns draws one', ['sniper', 'deagle', 'pistol', 'shotgun', 'xm1014', 'ssg08'].every(id => [1, 2, 3, 4, 5].every(k => tracerShot(id, k))));
check('an unknown shot number still draws one (the toy pistol, an older pose)', tracerShot('ak', null) && tracerShot(undefined, undefined));
const pel = w => Array.from({ length: w.pellets }, (_, i) => tracerPellet(i, w.pellets)).filter(Boolean).length;
check('shotguns: every pellet draws one (Nova 9 of 9, XM1014 6 of 6)', pel(weaponById('shotgun')) === 9 && pel(weaponById('xm1014')) === 6, [pel(weaponById('shotgun')), pel(weaponById('xm1014'))]);

// 2 · the pool: one mesh, reuse, stops, fade.
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(70, 1, .1, 1000); scene.add(cam);
const P = createTracers(scene, { camera: () => cam });
check('one mesh in the scene, always there (one draw), drawn as GD fx', scene.children.filter(o => o.name === 'gd-tracers').length === 1 && P.mesh.userData.gd && P.mesh.userData.fx && !P.mesh.frustumCulled);
check('the warm-up sample shares its material and buffers', P.sample().material === P.mesh.material && P.sample().geometry === P.mesh.geometry);
for (let i = 0; i < POOL * 2; i++) P.spawn(0, 9, 0, 0, 0, -1, 300 + i);
check('a full pool reuses the oldest (never more than ' + POOL + ')', P.active === POOL && P.spawned === POOL * 2);
P.update(1 / 60); check('all live streaks drawn in one range (a core and a glow each)', P.drawn === POOL && P.mesh.geometry.drawRange.count === POOL * 12);
for (let i = 0; i < 120; i++) P.update(1 / 60);
check('streaks land and fade out (2 s later none)', P.active === 0 && P.mesh.geometry.drawRange.count === 0);
P.spawn(0, 9, 0, 0, 0, -1, 50); P.update(.5 * 50 / TRACER.speed);
const pos = P.buffers.pos; let maxZ = Infinity; for (let v = 0; v < 4; v++) maxZ = Math.min(maxZ, pos[v * 3 + 2]);
check('a streak flies along the bullet from the muzzle, head short of the stop mid-flight', maxZ < 0 && maxZ > -50, maxZ);
for (let i = 0; i < 10; i++) P.update(1 / 120); for (let v = 0; v < 4; v++) maxZ = Math.min(maxZ, pos[v * 3 + 2]);
check('it stops at the hit point (never past it)', maxZ >= -50 - 1e-3, maxZ);
P.clear(); P.spawn(0, 9, 0, 0, 0, -1, 80, .2); P.update(.1);
check('a replayed burst\'s later shot waits its delay', P.drawn === 0 && P.active === 1);
P.update(.15); check('then flies', P.drawn === 1); P.clear();
// near the eye (your own tracer at the barrel): narrower
cam.position.set(0, 9, 0); cam.updateMatrixWorld(); P.spawn(1, 8, -1, 0, 0, -1, 300); P.update(.005);
const wNear = Math.hypot(pos[0] - pos[3], pos[1] - pos[4], pos[2] - pos[5]); P.clear(); P.spawn(1, 8, -200, 0, 0, -1, 300); P.update(.005);
const wFar = Math.hypot(pos[0] - pos[3], pos[1] - pos[4], pos[2] - pos[5]); P.clear();
check('thin at the barrel next to the eye, at least the core width far away', wNear < wFar * .5 && wFar >= 2 * TRACER.core.width - 1e-4, [wNear, wFar]);
// the look: a blended core and an added glow in one draw (premultiplied), long, starting past the muzzle, warm colours
const M = P.mesh.material, cA = P.buffers.col; P.spawn(0, 9, -5, 0, 0, -1, 300); P.update(.02);
const zs = [0, 1, 2, 3].map(v => pos[v * 3 + 2]), gw = Math.hypot(pos[12] - pos[15], pos[13] - pos[16], pos[14] - pos[17]), cw = Math.hypot(pos[0] - pos[3], pos[1] - pos[4], pos[2] - pos[5]);
check('one draw, premultiplied blend (blended core + added glow)', M.blending === THREE.CustomBlending && M.blendSrc === THREE.OneFactor && M.blendDst === THREE.OneMinusSrcAlphaFactor && M.depthWrite === false);
check('core alpha > 0, glow alpha 0 (added), the glow wider than the core', cA[3] > .5 && cA[19] === 0 && cA[16 + 0] > 0 && gw > cw * 2, [cA[3], cA[19], gw, cw]);
check('warm yellow-orange head (red ≥ green > blue)', cA[8] >= cA[9] && cA[9] > cA[10] * 2, [cA[8], cA[9], cA[10]]);
check('the streak starts past the muzzle (not inside your gun)', Math.max(...zs) <= -5 - TRACER.start + 1e-3, zs);
check('short streak (user: about 8 m, runs to the landing spot), not a long CS2 1200 HU one', TRACER.length >= 200 * HU && TRACER.length <= 400 * HU && TRACER.speed <= 20500 * HU, [TRACER.length, TRACER.speed]);
P.clear();

// 3 · the effects: your shots and others' (fun-pistol), no meshes made per shot.
const s2 = new THREE.Scene(), fx = createPistolEffects(s2, { camera: () => cam }), gfxPool = o => o === fx.gunfx?.mesh || o === fx.gunfx?.shells, kids = () => s2.children.filter(o => !gfxPool(o)).length;   // (v53 GUNS: the two fixed CS2 flash / shell pools, made with the effects — gd-gunfx.js — are not per-shot meshes)
const end = (x, z) => ({ point: new THREE.Vector3(x, 9, z), normal: null, flesh: false });
fx.update(0); const before = kids(), muzzle = new THREE.Vector3(.5, 8, -1);
let drawnBy = id => { fx.tracers.clear(); let c = 0; for (let k = 1; k <= 9; k++) { fx.shootAt(muzzle, [end(0, -100)], { id, n: k }); c += fx.tracers.active; fx.tracers.clear(); } return c; };
check('your own rifle shots: 9 tracers in 9 (every bullet)', drawnBy('ak') === 9);
check('your own pistol / AWP shots: a tracer every shot', drawnBy('pistol') === 9 && drawnBy('sniper') === 9 && drawnBy('deagle') === 9);
check('your silenced M4A1-S / USP-S / MP5-SD shots draw every bullet', drawnBy('m4s') === 9 && drawnBy('usps') === 9 && drawnBy('smg') === 9);
fx.tracers.clear(); fx.shootAt(muzzle, Array.from({ length: 9 }, (_, i) => end(i - 4, -60)), { id: 'shotgun', n: 1 });
check('your own Nova shot: 9 pellet streaks (every pellet)', fx.tracers.active === 9, fx.tracers.active); fx.tracers.clear();
const meshes = () => s2.children.filter(o => o.isMesh && !gfxPool(o) && o.geometry.type !== 'CircleGeometry').length;   // (pooled flashes are sprites, pooled holes circles)
check('no meshes made per shot (only the one tracer mesh, after 60 shots)', meshes() === 1 && before <= 2, [before, meshes()]);
fx.shootAt(muzzle, [{ point: new THREE.Vector3(0, 9, -30), normal: new THREE.Vector3(0, 0, 1), mark: true }, end(0, -100)], { id: 'pistol', n: 1 });
check('holes on the way are not tracers (one streak to the stop)', fx.tracers.active === 1); fx.tracers.clear();
const dirs = [new THREE.Vector3(0, 0, -1)], seenFor = (id, k) => { fx.tracers.clear(); fx.shoot(muzzle, dirs[0], { id, dirs, n: k, src: 'p2' }); return fx.tracers.active; };
check('another player\'s / a bot\'s shots: every bullet draws one', seenFor('ak', 1) === 1 && seenFor('ak', 2) === 1 && seenFor('sniper', 2) === 1 && seenFor('p90', 4) === 1);
fx.tracers.clear(); fx.shoot(muzzle, dirs[0], { id: 'xm1014', dirs: Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, -1)), n: 3 });
check('another player\'s XM1014 shot: 6 pellet streaks (every pellet)', fx.tracers.active === 6); fx.tracers.clear();
const fx2 = createPistolEffects(new THREE.Scene(), { camera: () => cam, trace: () => ({ t: 25, n: [0, 0, 1], flesh: false, mat: null }), muzzleFor: (src, out) => src === 'watched' && !!out.set(3, 3, 3) });
fx2.shoot(muzzle, dirs[0], { id: 'deagle', dirs, n: 1, src: 'watched' }); fx2.update(1);
check('another player\'s bullet stops where the map trace says; spectating, it leaves the watched barrel', fx2.tracers.spawned === 1 && fx2.tracers.active === 0);
check('the warm-up samples include the tracer material', fx.samples().some(o => o.material === fx.tracers.mesh.material));

// 4 · bots' shots aim their pitch at the target (arena-logic botRoster).
const AL = await import('../dist/arena-logic.js');
const fakeGame = { mode: 'arena', arena: { bots: [{ id: 'bot-1', name: 'B', weapon: 'ak', x: 0, z: 0, yaw: 0, pitch: -.12, shotN: 4 }] }, combat: {} };
let pitch = NaN; try { pitch = AL.botRoster(fakeGame)[0].pose.shot.pitch; } catch (e) { pitch = String(e); }
check('a bot\'s shot record carries its pitch toward the target', pitch === -.12, pitch);

// 5 · allocation: update() with streaks flying makes nothing.
const A = createTracers(new THREE.Scene(), { camera: () => cam }); for (let i = 0; i < 30; i++) A.spawn(0, 9, 0, Math.sin(i), 0, -Math.cos(i), 200 + i * 10);
for (let i = 0; i < 2000; i++) { A.update(1 / 240); if (A.active < 20) A.spawn(0, 9, 0, 0, 0, -1, 300); }
gc(); gc(); const h0 = process.memoryUsage().heapUsed;
for (let i = 0; i < 20000; i++) { A.update(1 / 240); if (A.active < 20) A.spawn(0, 9, 0, 0, 0, -1, 300); }
gc(); gc(); const grew = process.memoryUsage().heapUsed - h0;
check('update() + spawn() allocate nothing per frame (heap flat over 20 000 frames)', grew < 64 * 1024 && A.drawn > 0, grew + ' bytes');

console.log(`${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
