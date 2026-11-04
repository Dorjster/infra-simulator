// Global Defensive: spectating while dead is first person only (CS2's "in-eye" view) — arena-spectate.js.
//  · no chase camera, no Space toggle (the spectator has no toggle(); lab.js's jump does nothing while spectating);
//  · left / right click cycle team mates (cycleTarget wraps both ways; Defuse: never the enemy);
//  · the camera sits at the watched player's eye (feet + eye, crouch included) and faces their yaw AND pitch, from the
//    smoothed remote motion (m.iyaw / m.ipitch / m.iey — multiplayer.js place()), else their pose;
//  · their body (m.cs.g, never m.g) is hidden for you and comes back when you switch target or respawn; others' bodies
//    are never touched; their first-person view is driven (spectate-view.js interface) and released on respawn;
//  · the HUD shows the watched player's HP / armour;
//  · update() makes nothing per frame (heap stays flat over 20 000 frames);
//  · the pose carries the live pitch even when only the pitch changed (multiplayer.js send dedupe), and the remote pose
//    buffer interpolates pitch and eye height (multiplayer.js place).
//   node tests/gd-spectate.mjs        (re-runs itself with --expose-gc for the allocation check)
import { readFileSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ok = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
// A tiny DOM: the bar and HUD elements the spectator writes.
const els = {}; const el = () => ({ hidden: true, style: {}, innerHTML: '', append() {}, appendChild() {}, setAttribute() {} });
globalThis.document = { head: el(), body: { ...el(), insertAdjacentHTML() {} }, createElement: el, getElementById: id => els[id] ??= el() };
let T = 1000; performance.now = () => T;
const THREE = await import('../dist/three.module.js');
const SP = await import('../dist/arena-spectate.js'); const { hostNow } = await import('../dist/host-clock.js');
const { createSpectator, eyeOf, cycleTarget, createBodyHider, eyeCamera, EYE_STAND, EYE_CROUCH, watchable } = SP;

// ── pure parts ──────────────────────────────────────────────────────────────────────────────────────────────────
check('exports the first-person helpers (eyeOf, eyeCamera, cycleTarget, createBodyHider)', [eyeOf, eyeCamera, cycleTarget, createBodyHider].every(f => typeof f === 'function'));
if (typeof eyeOf === 'function') {
  check('eye: the interpolated eye first, then the pose\'s, then CS2\'s 64 / 46 HU', eyeOf(8.1, 9.7, false) === 8.1 && eyeOf(undefined, 7.5, false) === 7.5 && eyeOf(undefined, undefined, false) === EYE_STAND && eyeOf(NaN, undefined, true) === EYE_CROUCH && Math.abs(EYE_CROUCH - 46 * 2.54 / 16.5) < 1e-12);
  const L = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  check('cycling: next / previous wrap round; nobody watched yet → the first', cycleTarget(L, 'a', 1) === 'b' && cycleTarget(L, 'c', 1) === 'a' && cycleTarget(L, 'a', -1) === 'c' && cycleTarget(L, null, 1) === 'a' && cycleTarget([], 'a', 1) === null);
  const cam = new THREE.PerspectiveCamera(); eyeCamera(cam, 10, 2, -5, 9.7, .7, .4); const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  check('eye camera: at feet + eye, looking along yaw and pitch (YXZ, as the player\'s own camera)', cam.position.distanceTo(new THREE.Vector3(10, 11.7, -5)) < 1e-9 && Math.abs(Math.asin(f.y) - .4) < 1e-9 && Math.abs(Math.atan2(-f.x, -f.z) - .7) < 1e-9, JSON.stringify(f));
  eyeCamera(cam, 0, 0, 0, 9.7, 0, 3); check('pitch clamped as the host clamps it (±1.5)', Math.abs(Math.asin(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).y) - 1.5) < 1e-9);
  // body-hide bookkeeping
  const mk = name => { const g = new THREE.Group(), label = new THREE.Object3D(), cs = { g: new THREE.Group() }; g.add(label); g.add(cs.g); return { name, g, label, cs }; };
  const A = mk('A'), B = mk('B'), H = createBodyHider();
  H.hide(A); check('hide: the agent group only — never m.g (who is in the match), never the name tag', !A.cs.g.visible && A.g.visible && A.label.visible && H.model === A);
  H.hide(A); H.hide(A); check('hide again every frame: nothing more recorded', H.hidden === 1);
  H.hide(B); check('switch target: the first one\'s body back, the new one hidden', A.cs.g.visible && !B.cs.g.visible && H.model === B);
  const old = B.cs.g; B.g.remove(old); B.cs = { g: new THREE.Group() }; B.g.add(B.cs.g); H.hide(B); check('a new agent made while watched (side swap) is hidden too', !B.cs.g.visible);
  H.restore(); check('restore: everything shown again, nobody held', B.cs.g.visible && old.visible && H.model === null && H.hidden === 0);
  const plain = { name: 'P', g: new THREE.Group(), label: new THREE.Object3D() }, part = new THREE.Mesh(); plain.g.add(plain.label); plain.g.add(part);
  H.hide(plain); check('no CS2 agent: the plain avatar\'s parts hidden, the tag kept', !part.visible && plain.label.visible); H.restore(); check('…and back', part.visible);
  check('watchable: in the match, or hidden only by a smoke; not out of the match', watchable({ g: { visible: true } }) && watchable({ g: { visible: false }, smokeHid: true }) && !watchable({ g: { visible: false } }) && !watchable({ g: { visible: true }, activeVis: false }));
}

// ── the spectator, as lab.js wires it ─────────────────────────────────────────────────────────────────────────────
const mkModel = (name, x, z) => { const g = new THREE.Group(), label = new THREE.Object3D(), cs = { g: new THREE.Group() }; g.add(label); g.add(cs.g); g.position.set(x, 1, z); return { name, g, label, cs, speed: 0 }; };
const mate = mkModel('Mate', 10, 20), mate2 = mkModel('Mate2', -30, 5), foe = mkModel('Foe', 50, 0);
mate.iyaw = .5; mate.ipitch = .3; mate.iey = 9.7; mate2.iyaw = -1; mate2.ipitch = -.2; mate2.iey = EYE_CROUCH; mate2.crouch = true;
const G = { mode: 'arena', arena: { map: 'dust2', knives: { mate: 'karambit' }, skins: {} }, combat: { d: { teams: { me: 'ct', mate: 'ct', mate2: 'ct', foe: 't' }, round: { phase: 'live' } }, down: {}, hp: { mate: 73, mate2: 100 }, armor: { mate: { kevlar: 64, helmet: true } }, nades: [] } };
const players = [{ id: 'm1', name: 'Mate', pose: { yaw: 9, gun: true, weapon: 'ak', ey: 9.7, shot: { n: 5, r: 2, pitch: .9 } } }, { id: 'm2', name: 'Mate2', pose: { yaw: 9, gun: true, weapon: 'deagle', ey: 7, crouched: true, shot: { n: 1, r: 1, pitch: 0 } } }, { id: 'f1', name: 'Foe', pose: { yaw: 0, gun: true, weapon: 'ak', shot: { n: 0, r: 0, pitch: 0 } } }];
const lan = { models: new Map([['m1', mate], ['m2', mate2], ['f1', foe]]), players };
const calls = []; const fakeView = { shown: null, rec: {}, show(t, dt) { this.shown = Object.assign(this.rec, t); if (calls.at(-1) !== 'show') calls.push('show'); }, hide() { calls.push('hide'); const had = !!this.shown; this.shown = null; return had; } };   // (refills one record: the allocation check measures the spectator, not this fake)
const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 50, 0);
const sp = createSpectator({ camera, world: { operations: { game: G } }, lan, name: () => 'Me', view: fakeView });
check('no chase camera / no Space toggle: the spectator has no toggle()', !('toggle' in sp));
const lab = readFileSync(path.join(root, 'dist/lab.js'), 'utf8');
check('lab.js: Space while spectating does nothing but skip CS2\'s death cam (no spectator.toggle call; v53 DEATH: spectator.skip — a no-op once spectating)', !/spectator\??\.toggle\(/.test(lab) && /spectator\?\.on&&k==='jump'\)\{spectator\.skip\?\.\(\);return;\}/.test(lab));
check('lab.js: your own view model hidden (not animated) while spectating, before the weapons update', /pistol\.hideView\(thirdPerson\.on\|\|!!spectator\?\.on\);[^]{0,300}?pistol\.update\(dt\)/.test(lab));
sp.update(1 / 60); check('alive: not spectating, nothing hidden', !sp.on && mate.cs.g.visible && calls.length === 0);
G.combat.down.me = { until: hostNow() + 60000, by: 'Foe' }; sp.update(1 / 60);
const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
check('dead: watching a team mate (never the enemy who killed you, in Defuse)', sp.on && sp.watched?.name === 'Mate', sp.watched?.name);
check('camera exactly at his eye (interpolated feet + eye)', camera.position.distanceTo(new THREE.Vector3(10, 1 + 9.7, 20)) < 1e-9, camera.position.toArray());
check('camera faces his interpolated yaw and pitch (not the raw pose, not level)', Math.abs(Math.asin(fw.y) - .3) < 1e-9 && Math.abs(Math.atan2(-fw.x, -fw.z) - .5) < 1e-9, JSON.stringify(fw));
check('his body is not drawn for you (agent group hidden; m.g untouched: the radar / list still see him)', !mate.cs.g.visible && mate.g.visible && mate.label.visible);
check('nobody else\'s body is touched', mate2.cs.g.visible && foe.cs.g.visible);
check('his name tag: lab.js asks watchedKey (and hides it)', sp.watchedKey === 'mate' && /spectator\?\.watchedKey&&spectator\.watchedKey===/.test(lab));
check('his first-person view model asked for: his weapon, side, chosen knife, shot / reload numbers', fakeView.shown?.weapon === 'ak' && fakeView.shown.team === 'ct' && fakeView.shown.knife === 'karambit' && fakeView.shown.shotN === 5 && fakeView.shown.reloadN === 2, JSON.stringify(fakeView.shown));
T += 300; sp.update(1 / 60);
check('HUD: HIS health and armour (CS2 bottom left)', /<b>73<\/b>/.test(els['sp-hp'].innerHTML) && /<b>64<\/b>/.test(els['sp-hp'].innerHTML) && els['sp-hud'].hidden === false, els['sp-hp'].innerHTML);
check('the bar: no "Space" hint any more', !/Space/.test(els['sp-bar'].innerHTML) && /SPECTATING/.test(els['sp-bar'].innerHTML), els['sp-bar'].innerHTML);
players[0].pose.weapon = 'deagle'; sp.update(1 / 60); check('he switches weapon: the view model is asked for the new one', fakeView.shown?.weapon === 'deagle');
mate.ipitch = -.6; mate.iyaw = 2; mate.g.position.x = 12; sp.update(1 / 60); const fw2 = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
check('he looks down and turns: the camera follows exactly', Math.abs(Math.asin(fw2.y) + .6) < 1e-9 && Math.abs(Math.atan2(-fw2.x, -fw2.z) - 2) < 1e-9 && Math.abs(camera.position.x - 12) < 1e-9);
// the bodies are placed AFTER update() in the frame (lab.js: lan.update → place()); follow() re-aims from where they are drawn now
mate.iyaw = 2.2; mate.ipitch = -.4; mate.g.position.x = 13; sp.follow(); const fwF = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
check('follow(): after this frame\'s placing, the camera shows his look and eye of THIS frame (not one frame late)', Math.abs(Math.atan2(-fwF.x, -fwF.z) - 2.2) < 1e-9 && Math.abs(Math.asin(fwF.y) + .4) < 1e-9 && Math.abs(camera.position.x - 13) < 1e-9 && sp.watched.yaw === 2.2);
check('lab.js: follow() called right after lan.update (the remote bodies placed)', /lan\.update\([^]{0,1600}?tp:amTp\}\);if\(spectating\)spectator\.follow\(\);/.test(lab));
{ const mm = lan.models.get('m1'); lan.models.set('m1', mkModel('Mate', 0, 0)); const px = camera.position.x; sp.follow(); check('follow(): a model replaced this frame (re-dressed) is not followed until the next update', camera.position.x === px); lan.models.set('m1', mm); }
sp.next(); sp.update(1 / 60);
check('click: the next team mate — crouched eye, his look; the first one\'s body back', sp.watched?.name === 'Mate2' && Math.abs(camera.position.y - (1 + EYE_CROUCH)) < 1e-9 && mate.cs.g.visible && !mate2.cs.g.visible, JSON.stringify(sp.watched));
sp.prev(); sp.update(1 / 60); check('right click: back to the first', sp.watched?.name === 'Mate' && !mate.cs.g.visible && mate2.cs.g.visible);
// fallbacks: no interpolation yet → the pose's yaw / pitch / eye
delete mate.iyaw; delete mate.ipitch; delete mate.iey; players[0].pose.yaw = 1.1; players[0].pose.shot.pitch = .25; players[0].pose.ey = 9; sp.update(1 / 60); const fw3 = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
check('no interpolated look yet: his pose\'s yaw, live pitch and eye', Math.abs(Math.atan2(-fw3.x, -fw3.z) - 1.1) < 1e-9 && Math.abs(Math.asin(fw3.y) - .25) < 1e-9 && Math.abs(camera.position.y - 10) < 1e-9);
mate.iyaw = .5; mate.ipitch = .3; mate.iey = 9.7;
// allocations: 20 000 frames, heap flat
{ const frames = n => { for (let i = 0; i < n; i++) { mate.ipitch = .3 + (i % 7) * .01; sp.update(1 / 144); sp.follow(); } };
  // warm up first (the JIT tiers up and its feedback grows the heap a little on Node 22), then the least of 3 rounds:
  // a real per-frame object would add >= 16 bytes x 20 000 frames to every round
  frames(20000); const round = () => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; frames(20000); gc(); gc(); return process.memoryUsage().heapUsed - h0; }; const dh = Math.min(round(), round(), round());
  check('update() + follow() make nothing per frame (heap growth over 20 000 frames < 64 KB)', dh < 65536, dh + ' bytes'); }
// in a smoke: still watched (smokeHid), body still hidden
mate.g.visible = false; mate.smokeHid = true; sp.update(1 / 60); check('he walks into a smoke (his body hidden by it): still watched', sp.watched?.name === 'Mate'); mate.g.visible = true; mate.smokeHid = false;
// all team mates dead: frozen death view, bodies back, view model released
G.combat.down.mate = { until: hostNow() + 60000, by: 'Foe' }; G.combat.down.mate2 = { until: hostNow() + 60000, by: 'Foe' }; const before = camera.position.clone(); calls.length = 0; T += 300; sp.update(1 / 60);
check('nobody left alive on your side: the frozen death view (camera stays), no free camera', sp.on && sp.watched === null && camera.position.equals(before) && /killed by/.test(els['sp-bar'].innerHTML));
check('…bodies drawn again, view model released, the HUD gone', mate.cs.g.visible && calls.includes('hide') && els['sp-hud'].hidden === true);
delete G.combat.down.mate; delete G.combat.down.mate2; sp.update(1 / 60); check('a team mate alive again (respawn modes): watched again', sp.watched?.name === 'Mate' && !mate.cs.g.visible);
// respawn: everything back
calls.length = 0; delete G.combat.down.me; sp.update(1 / 60);
check('respawned: not spectating; his body back; the view model released (your own takes its set back)', !sp.on && sp.watched === null && mate.cs.g.visible && calls.includes('hide') && sp.takeReleased() === true && sp.takeReleased() === false);
// other modes untouched
G.mode = 'campaign'; G.combat.down.me = { until: hostNow() + 60000, by: 'Foe' }; check('other modes: no spectating', sp.update(1 / 60) === false && !sp.on); G.mode = 'arena'; delete G.combat.down.me;

// ── the pitch on the wire and in the remote motion ────────────────────────────────────────────────────────────────
const mp = readFileSync(path.join(root, 'dist/multiplayer.js'), 'utf8');
check('multiplayer.js: a pose whose only change is the look up / down is still sent (pitch in the skip test)', /Math\.abs\(pose\.yaw-lastPose\.yaw\)<\.003&&Math\.abs\(\(\+pose\.shot\?\.pitch\|\|0\)-\(\+lastPose\.shot\?\.pitch\|\|0\)\)<\.003/.test(mp));
check('multiplayer.js: the remote pose buffer keeps pitch and eye, place() interpolates them (m.ipitch / m.iey)', /yaw:p\.pose\.yaw,p:\+p\.pose\.shot\?\.pitch\|\|0,e:p\.pose\.ey/.test(mp) && /m\.ipitch=Number\.isFinite\(a\.p\)&&Number\.isFinite\(b\.p\)\?a\.p\+\(b\.p-a\.p\)\*kk/.test(mp) && /m\.iey=Number\.isFinite\(a\.e\)/.test(mp));
const wp = readFileSync(path.join(root, 'dist/weapons.js'), 'utf8');
check('weapons.js: shown again, your own view takes a borrowed CS2 set back (setView)', /hideView\(hidden\) \{[^]{0,400}fp\.root\.parent !== view[^]{0,40}setView\(current\.id\)/.test(wp));
console.log(ok + '/' + n); process.exit(ok === n ? 0 : 1);
