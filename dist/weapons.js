// The local player's weapons in Global Defensive: firing, aim, spray, ammo, reloads, scopes, knife attacks and
// grenade throws, plus the first-person view model.
//
// Aim (one pipeline, so everything agrees), CS2's (weapons-data.js "Shots": the same functions the host runs):
//  · aim() is where the mouse points (the lab's raw yaw / pitch). A shot leaves the EYE along aim + `punch` (the aim
//    punch: the spray's pattern so far, plus the flinch from being shot) + the shot's seeded offset — CS2's
//    inaccuracy (the gun's stand / crouch floor, each shot's m_flInaccuracyFire recovering over its recovery time,
//    running, jumping, landing, ladders) and spread, drawn from the shot number, so the host recomputes the very same
//    bullets (combat-logic.js) and other players see them (shotDirs).
//  · The camera follows RECOIL.view (45 %) of `punch` and the bullets go all the way, so a spray climbs above the fixed
//    crosshair and you pull down to hold it. `shake` is the per-shot visual view punch (camera only). When you stop
//    firing the punch decays straight back (never along the pattern) and the spray position winds down.
//  · The trigger keeps the gun's exact cadence at any frame rate (a held trigger: one cycle after the last shot);
//    a semi-automatic click while the gun isn't ready fires the moment it is, if still held (CS2).
//  · Hits are tested along that same ray: against the players' bodies (rayBody: torso and head) and the map's walls.
//    The bullet hole is where the ray stops; the tracer is drawn from the gun's muzzle to that point.
// Ammo: [magazine, reserve] per gun, predicted here, owned by the host (combat-logic.js). Shots and reloads are
// numbered (pose shot.n / shot.r, and each hit carries its shot number); whenever the host has seen exactly our
// shots and reloads, its numbers are taken (new round, pickup, purchase…).
import * as THREE from './three.module.js';
import { audioCtx, outAt } from './spatial-audio.js';
import { magInMs, weaponById, EYE, BODY_R, BODY_H, HEAD_Y, CROUCH_H, zoneAt, HIT_GROUPS, isFirearm, pelletPattern, KNIFE, fullAmmo, THROW, RECOIL, accOf, accFloor, createAim, accuracyDecay, inaccuracyOf, nextFireAt, recoilShot, recoilRest, flinchRest, restAfterMs, viewKick, shotOffsets, shotBase, offsetDir, rayBody, zoomVfov, zoomSens, flinchPunch } from './weapons-data.js';
import { loadSounds, reloadSound, fx as rec } from './sound-bank.js';
import { loadFP, fpFor, onFPReady, wantFP, hasFP } from './fp-view.js'; import { gloveVersion } from './glove-assets.js';
import { createClipChannel } from './fp-sounds.js';
import { synthWhoosh } from './gd-sounds.js';
import { applySkin, skinObject, unskinObject } from './skin-render.js';
import { live } from './live-settings.js';
// The view model's own field of view (vertical degrees; 0: the world's), as CS2's viewmodel_fov 68 (4:3 horizontal ≈ 54 vertical).
export const VIEWMODEL = { fov: 58 };
import { weaponModel, loadRealWeapons, MUZZLE, VIEW, VIEW_ROT, knifeFor } from './weapon-models.js';
import { rayBoxes, bulletPath, BulletPath } from './arena-maps.js';
const PATH = new BulletPath();   // (each pellet's way, refilled: no garbage per shot)

// Draw (deploy) time: it swings up from below; no shooting until it's up. Guns: CS2's m_flDeployDuration (deployMs:
// 1 s for most, the CZ75-Auto 1.83 s, the AWP 1.27 s…); knives, grenades and the bomb our own.
const DRAW_BY_KIND = { pistol: 600, smg: 750, rifle: 900, sniper: 1050, shotgun: 850, lmg: 1100, knife: 450, nade: 500, bomb: 600 };
const GUN_FP_KINDS = new Set(['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'lmg']);   // (guns: their arms may have an inspect animation)
export const DRAW_MS = new Proxy({ karambit: 500 }, { get: (o, id) => o[id] ?? weaponById(id)?.deployMs ?? DRAW_BY_KIND[weaponById(id)?.kind] ?? 600 });
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const LOUD = { pistol: [.5, 1], smg: [.32, 1.3], shotgun: [.75, .62], rifle: [.5, 1], sniper: [.85, .7], lmg: [.45, .9] };
export const shotFx = (wpn) => { const [volume, pitch] = LOUD[wpn.kind] || LOUD.pistol; return { id: wpn.id, volume: wpn.suppressed ? volume * .4 : volume, pitch, flashSize: wpn.suppressed ? .35 : wpn.kind === 'pistol' ? 1.1 : wpn.kind === 'shotgun' || wpn.kind === 'lmg' ? 1.8 : 1.5 }; };
const D2R = Math.PI / 180;
// Direction for an aim (pitch up, yaw as the lab's rotation.y): the camera's −Z through a YXZ euler.
const E = new THREE.Euler(0, 0, 0, 'YXZ');
export const dirFor = (pitch, yaw, out = new THREE.Vector3()) => out.set(0, 0, -1).applyEuler(E.set(pitch, yaw, 0, 'YXZ'));
// Offset a direction by (dp, dy) radians in its own frame (up / right).
function offset(dir, dp, dy, out = new THREE.Vector3()) { const up = Math.abs(dir.y) > .999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(dir, up).normalize(), u = new THREE.Vector3().crossVectors(right, dir).normalize(); return out.copy(dir).addScaledVector(u, Math.tan(dp)).addScaledVector(right, Math.tan(dy)).normalize(); }
// Directions of a remote player's shot (visual only). With the shot's own record from its pose (sh: the shot's look
// pitch sp (else the live pitch) / yaw, aim punch pu [°, °], inaccuracy ia, scoped sc — weapons poseShot) and its
// number n: the very bullets it fired (the seeded spread, weapons-data shotOffsets); without (an older pose): the
// pellet pattern round `dir`, else straight.
const RS_B = [0, 0, 0], RS_D = [0, 0, 0], RS_O = new Float64Array(32);
export function shotDirs(dir, wpn, sh = null, n = null) {
  const sp = Number.isFinite(sh?.sp) ? sh.sp : sh?.pitch;
  if (wpn && sh && Number.isFinite(sh.yaw) && Number.isFinite(sp) && Number.isFinite(sh.ia) && Array.isArray(sh.pu) && Number.isInteger(n)) {
    shotBase(sp, sh.yaw, +sh.pu[0] || 0, +sh.pu[1] || 0, RS_B); const k = shotOffsets(wpn, n, sh.ia, accOf(wpn, !!sh.sc)?.spread || 0, RS_O), out = [];
    for (let i = 0; i < k; i++) { offsetDir(RS_B, RS_O[2 * i], RS_O[2 * i + 1], RS_D); out.push(new THREE.Vector3(RS_D[0], RS_D[1], RS_D[2])); } return out; }
  return wpn?.pellets ? pelletPattern(wpn).map(([p, y]) => offset(dir, p, y)) : [dir.clone()]; }
// Ray against an upright capsule (feet at `feet`, height h, radius BODY_R): distance along the ray or null.
export function rayCapsule(o, d, feet, h = BODY_H) {
  const a = feet, b = feet.clone().setY(feet.y + h), ab = b.clone().sub(a), ao = o.clone().sub(a);
  const abab = ab.dot(ab), abd = ab.dot(d), abao = ab.dot(ao), A = abab - abd * abd, B = abab * ao.dot(d) - abao * abd, C = abab * ao.dot(ao) - abao * abao - BODY_R * BODY_R * abab;
  let t = null; const disc = B * B - A * C;
  if (A > 1e-9 && disc >= 0) { const t0 = (-B - Math.sqrt(disc)) / A, y = abao + t0 * abd; if (t0 > 0 && y >= 0 && y <= abab) t = t0; }
  if (t === null) for (const c of [a, b]) { const oc = o.clone().sub(c), bb = oc.dot(d), cc = oc.dot(oc) - BODY_R * BODY_R, h2 = bb * bb - cc; if (h2 >= 0) { const tt = -bb - Math.sqrt(h2); if (tt > 0 && (t === null || tt < t)) t = tt; } }
  return t;
}

// Small synthesized sounds: dry-fire click, scope, pin, knife swish.
let actx = null;
function tick(freq = 1800, len = .05, vol = .25, type = 'square', at = null) { try { actx = audioCtx(); const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * .4, t + len); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + len); o.connect(g).connect(outAt(actx, at, 'handling')); o.start(t); o.stop(t + len + .02); } catch {} }
export function warmTicks() { try { actx = audioCtx(); } catch {} }
// `at`: where the sound happens (another player / bot); left out = your own sound. `id`: the weapon.
// Recorded handling (sound-bank fx: draw, knife, dry fire, scope, pin), the synthesized ticks if not loaded yet.
// (gid: the weapon — Global Defensive's bank picks that weapon's event: gd-sounds.js; the other modes ignore it)
export const sounds = { draw: (at, id) => { const w = weaponById(id); if (w?.kind === 'knife') rec('knifedraw', { at, volume: .5, kind: 'handling' }) || tick(1800, .07, .1, 'sawtooth', at); else if (w?.kind === 'nade') rec('nadedraw', { at, gid: id }) || tick(2600, .03, .1, 'square', at); else rec('draw', { at, volume: .7, rate: w?.kind === 'pistol' ? 1.08 : .95, kind: 'handling', gid: id }) || reloadSound(2, id, at) || tick(900, .05, .2, 'square', at); },
  toss: (at, kind) => rec('toss', { at, gid: kind }) || (!at && synthWhoosh()),   // a grenade let go (no CS2 clip of it): CS2's throw, else a whoosh
  slash: (at, heavy = false) => rec('slash', { at, volume: heavy ? .9 : .7, rate: heavy ? .85 : 1.05, kind: 'handling' }) || (tick(heavy ? 220 : 300, heavy ? .18 : .12, .25, 'sawtooth', at), setTimeout(() => tick(heavy ? 140 : 180, .08, .15, 'sawtooth', at), 40)),
  stab: (at, heavy = false) => rec('stab', { at, volume: heavy ? 1 : .8, rate: heavy ? .9 : 1, kind: 'handling' }),
  dry: (at, id) => rec('dry', { at, volume: .7, kind: 'handling', gid: id }) || tick(2400, .04, .18, 'square', at), scope: () => rec('scope', { volume: .5, rate: 1.2, kind: 'handling' }) || tick(3200, .025, .12, 'square'),
  pin: (at, kind) => rec('pin', { at, volume: .8, kind: 'handling', gid: kind }) || (tick(2900, .03, .14, 'square', at), setTimeout(() => tick(1900, .04, .1, 'triangle', at), 90)),
  magOut: (at, id) => reloadSound(0, id, at) || tick(420, .09, .3, 'triangle', at), magIn: (at, id) => reloadSound(1, id, at) || tick(620, .07, .35, 'triangle', at), bolt: (at, id) => reloadSound(2, id, at) || (tick(900, .05, .3, 'square', at), setTimeout(() => tick(1300, .04, .25, 'square', at), 70)) };

// Options: scene, camera, effects (fun-pistol), arsenal() ids, targets() [{ id, feet, crouched, seen }] (seen: the
// moment of them shown, sent with a hit for lag compensation), report(hit),
// canFire(), blind() 0…1 (flashed), aim() { pitch, yaw } (the raw look), boxes() map boxes, move() { speed, max,
// onGround, landedAgo, ducked, vy (units/s), ladder, landSpeed (HU/s, the last landing) },
// throwNade(id, strength, rel — v53: { t (s, performance.now's clock), pitch, yaw } of the release), moveSpeed(), host() { ammo: { id: [mag, res] }, shots: { n, r, pending } } (mine).
const PIVOT = new THREE.Vector3(), pivR = new THREE.Quaternion(), pivE = new THREE.Euler(), pivA = new THREE.Vector3(), pivB = new THREE.Vector3();
// Viewmodel lag: k (radians of lag per radian a second of turn), max (radians), K / D (the spring: stiffness, damping — critical).
const SWAY = { k: .012, max: .035, K: 90, D: 2 * Math.sqrt(90) };
export function createWeapons({ scene, camera, effects, arsenal, targets, report, canFire, onShot = () => {}, skinOf = () => null, blind = () => 0, aim = () => ({ pitch: 0, yaw: 0 }), boxes = () => [], move = () => ({ speed: 0, max: 1, onGround: true, landedAgo: 9 }), throwNade = () => {}, moveSpeed = () => 0, host = () => null, autoRescope = () => true, planting = () => false, practiceAmmo = () => false, practiceMag = () => false /* (v53 S2: GD practice, sv_infinite_ammo 1 — the magazine never empties) */, team = () => null, knifeSkin = () => null, skinRev = () => 0, glovesOf = () => null }) {
  let current = null, view = null, lastShot = 0, kick = 0, heldLeft = false, reloadUntil = 0, reloadId = null, lastDry = 0;
  // Shot and reload numbers start somewhere random each session, so a host that saw an older session re-syncs.
  let shots = 1e6 + Math.floor(Math.random() * 4e8), reloads = 1000 + Math.floor(Math.random() * 1e6);
  let inspecting = null, idleT = 0, plantE = 0, rescope = null, lastEnds = null, scope = 0, scopeAt = 0, knife = null, nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }, punch = { pitch: 0, yaw: 0 }, shake = { pitch: 0, yaw: 0 }, wasPlanting = false;
  const ammo = new Map(), origin = new THREE.Vector3(), muzzle = new THREE.Vector3(), base = new THREE.Vector3(), tmpD = new THREE.Vector3();
  // CS2 aim (weapons-data createAim: penalty, spray, punch, trigger times) for the gun in hand; wantShot: a semi-automatic
  // click waiting for the gun to be ready (fired then if the button is still held); MV: this frame's movement (reused).
  const ZB = { zone: null }, A = createAim(), MV = { speed: 0, max: 1, onGround: true, vy: 0, ladder: false, ducked: false, landedAgo: 9, landSpeed: 0 }, KICK = { pitch: 0, yaw: 0 }, B3 = [0, 0, 0], D3 = [0, 0, 0], OFFS = new Float64Array(32);
  let wantShot = false, inacc = 0, wasGround = true, lastLandAgo = 9, lastFired = null, lastReloaded = null, shotRec = null, shell = null;
  const readMove = () => { const m = move() || {}; MV.speed = +m.speed || 0; MV.max = m.max > 0 ? m.max : 1; MV.onGround = m.onGround !== false; MV.vy = +m.vy || 0; MV.ladder = !!m.ladder; MV.ducked = !!m.ducked; MV.landedAgo = Number.isFinite(m.landedAgo) ? m.landedAgo : 9; MV.landSpeed = +m.landSpeed || 0; return MV; };
  // Scoped accuracy once the zoom has settled (CS2 m_flZoomTime of the level); a gun without a scope: its own.
  const scopedMode = () => scope > 0 && !!current?.accZ && now() - scopeAt >= (current.zoomMs?.[scope] ?? 0);
  // The aim state moved on to moment t (ms): the penalty toward its floor, the spray at rest past RECOIL_REST, the flinch.
  // (Scoping in: the unscoped floor isn't carried into the scope — the zoom time gates it instead; what is left of the
  // shots' fire penalty still is. Our reading of CS2: an AWP re-scoped after its bolt is accurate again, not 0.5 s later.)
  let lastZs = false;
  function advance(t) { const dt = (t - A.t) / 1000; if (!(dt > 0)) return; const w = current, zs = scopedMode(), a = isFirearm(w) ? accOf(w, zs) : null;
    if (zs !== lastZs) { if (zs && a && w.acc) { const f0 = accFloor(w.acc, MV.ducked, MV.ladder), f1 = accFloor(a, MV.ducked, MV.ladder); A.pen = Math.max(f1, A.pen - Math.max(0, f0 - f1)); } lastZs = zs; }
    if (a) { accuracyDecay(A, a, dt, MV.ducked, MV.ladder); const rest = (t - A.lastShot - restAfterMs(w)) / 1000; if (rest > 0) recoilRest(A, w, Math.min(dt, rest)); }
    flinchRest(A, dt); A.t = t; }
  function resetAim() { A.pen = 0; A.ri = 0; A.aimP = A.aimY = 0; A.nextAt = 0; A.lastShot = -1e9; A.t = now(); wantShot = false; }
  const now = () => performance.now(), w = () => current, fire_ = () => current && isFirearm(current);
  const left = id => (ammo.get(id) || fullAmmo(id) || [0, 0]);
  const reloading = () => now() < reloadUntil;
  loadSounds();
  let skinSeen = null, skinAt = 0; let fp = null, swayYaw = null, swayPitch = 0, swX = 0, swY = 0, swVx = 0, swVy = 0;   // (viewmodel lag: the last look, the lag and its rate)
  // CS2's own clip sounds (fp-sounds.js) for what you hold: the clip playing (draw, reload, inspect, a swing, a pin,
  // a throw, a bolt) and its set ('ak', 'butterfly'…); without them the old sounds play.
  const clipSnd = createClipChannel(); let fpSet = null, chanKind = '';
  const clipStart = (clip, ms = 0) => { const ok = !!fpSet && clipSnd.start(fpSet, clip, ms, now()); chanKind = ok ? clip : chanKind; return ok; };
  loadFP().then(() => { if (current && fpFor(current.id)) setView(current.id); });
  // A CS2 first-person set that arrives for the weapon in hand: the view swaps to it (no draw: it was already out).
  onFPReady(id => { if (current && (id === current.id || id === knifeFor(current.id, team(), knifeSkin(), true))) setView(current.id); });
  loadRealWeapons().then(n => { if (n && current) setView(current.id); });
  let drawAt = 0, drawMs = 1;
  // The view model is drawn on top of the world, like CS2: while its meshes draw, their depth goes into the nearest
  // 1 % of the depth range (gl.depthRange), so the gun is always in front of every wall (a wall you stand against
  // never cuts into it) while the world's own depth stays intact (walls still hide smoke, fire, decals and glows behind
  // them). Same materials and shaders as everywhere else: nothing new to compile when a weapon first appears.
  const vmNear = r => r.getContext().depthRange(0, .01), vmFar = r => r.getContext().depthRange(0, 1);
  const onTop = g => g.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.onBeforeRender = vmNear; o.onAfterRender = vmFar; o.frustumCulled = false; o.castShadow = false; } });
  // Gun hand (Settings → Global Defensive): the whole first-person view mirrored for the left hand, as CS2's cl_righthand.
  // Viewmodel field of view (CS2's viewmodel_fov): the arms and gun drawn as with a narrower lens than the world's —
  // the same as stretching them sideways and up from the eye by tan(world / 2) / tan(view model / 2) — so a long gun
  // doesn't swing steeply in from the corner (VIEWMODEL.fov, vertical degrees; the packs' poses sit further out to match).
  const hand = new THREE.Group(); hand.name = 'gun-hand';
  const fitHand = () => { const vf = fp?.vfov || VIEWMODEL.fov, k = vf > 0 && camera.fov > vf ? Math.tan(camera.fov * Math.PI / 360) / Math.tan(vf * Math.PI / 360) : 1;   /* (a CS2-data set: CS2's own view-model field of view) */ hand.scale.set(live.leftHand ? -k : k, k, 1); };
  const sideView = v => { fitHand(); hand.add(v); if (!hand.parent) camera.add(hand); };
  let knifeSeen = null;   // (the chosen knife the view shows: a new choice swaps it while you hold it)
  // With no skin on every knife is its plain CS2 steel, the karambit too (v52: its vertex colours are the blade mask —
  // shown as colour they drew a flat red blade; a Ruby is the Doppler Ruby finish in the skins menu).
  const ownTint = () => false;
  let plainM = null, skinRevSeen = -1, glovesSeen = null, gloveVSeen = -1;   // (glovesSeen: your CS2 gloves as last worn — skins record 'gloves'; gloveVSeen: glove-assets' version then)   // (the plain view's model, skinned as other players' guns are: no CS2 set — CI, a host without assets)
  function setView(id, draw = false) {
    if (view) { view.removeFromParent(); view = null; } if (plainM) { unskinObject(plainM); plainM = null; }
    if (draw && id) { drawAt = now(); drawMs = DRAW_MS[id]; }
    fp = null; clipSnd.stop(); chanKind = ''; fpSet = null; if (!id) return;
    const want = knifeFor(id, team(), knifeSkin(), true); wantFP(want); const kf = want !== id && want !== knifeFor(id, team()) && !hasFP(want) ? knifeFor(id, team()) : want, f = fpFor(id, kf);
    const dn = draw && f?.drawPick ? f.drawPick() : 'draw';   // (v53 KNIVES final: the Skeleton's / Nomad's rare draw 1 in 9 — fp-view.js drawPick; its sounds at its own length)
    fpSet = kf; if (draw && !clipStart(dn, dn === 'draw' ? DRAW_MS[id] : 0)) sounds.draw(null, id);   // (CS2's draw: its own sounds at its own moments)
    skinRevSeen = skinRev(); skinAt = now(); if (f?.weaponMats) { skinSeen = skinOf(id); applySkin(f.weaponMats, skinSeen, ownTint(kf)); }   /* (your skin on it: skins.js, skin-render.js) */
    /* (a chosen knife: the side's default until its own CS2 set is in) */ if (f) { fp = f; view = new THREE.Group(); view.userData.base = [0, 0, 0]; view.add(f.root); glovesSeen = glovesOf(); gloveVSeen = gloveVersion(); f.hold(id, { draw, drawMs: DRAW_MS[id], model: kf, team: team(), gloves: glovesSeen, drawClip: dn }); onTop(view); sideView(view); if (!camera.parent) scene.add(camera); return; }
    const [x, y, z, sc] = VIEW[id] || VIEW.pistol; const m = weaponModel(knifeFor(id, team()), sc); for (const [ax, r] of VIEW_ROT[id] || VIEW_ROT[weaponById(id)?.model] || []) m.rotateOnWorldAxis(AXES[ax], r);
    skinSeen = skinOf(id); plainM = m; if (skinSeen) skinObject(m, skinSeen);   // (your skin on the plain view too: shared painted copies, released when it goes)
    view = new THREE.Group(); view.add(m); view.position.set(x, y, z); view.rotation.y = .04; view.userData.base = [x, y, z]; onTop(view); sideView(view);
    if (!camera.parent) scene.add(camera);
  }
  // Reloads, as CS2 (v53 RELOAD: weapons-data reloadOf / magInMs, CS2's clip events): the rounds count only once the new
  // magazine is seated — the gun's WPN_RELOAD_ADD_AMMO moment (the AK's 1.1 s; the *_empty_* clip's when the magazine
  // was at 0) — on the page clock, not at a frame: a switch at any moment after it keeps the full magazine (catchUp
  // seats it first), a switch before it cancels the reload and the gun keeps the magazine it had. No shot until
  // reloadMs (m_flDisallowAttackAfterReloadStartDuration). Shotguns (CS2 m_bReloadsSingleShells): shell by shell — CS2's
  // intro, then one shell per loop, each counted shellAddMs into it and numbered (the host moves one round per number) —
  // and a click with shells in the tube after reloadStartMs fires, ending it. Each reload's start is numbered too
  // (reloadStarts → pose shot.rs): the host stamps it on its own clock (combat-logic takeReload) and others start their
  // view of it then, not at the mag-in.
  let magInAt = 0, magIn = false, reloadMs = 1, reloadStarts = 1000 + Math.floor(Math.random() * 1e6);
  function stopReload() { reloadUntil = 0; reloadId = null; magIn = false; if (shell) { shell = null; fp?.stopReload?.(); } if (chanKind === 'reload') { clipSnd.stop(); chanKind = ''; } }   // (broken off: its sounds still to come stay quiet)
  function seatMag() { const id = reloadId, wpn = weaponById(id); if (!wpn || magIn) return; magIn = true; const [mag, res] = left(id), move = Math.min(wpn.mag - mag, res); ammo.set(id, [mag + move, practiceAmmo() ? res : res - move]); reloads++; lastReloaded = id; }
  function seatShells(t) { const w = weaponById(shell.id); while (shell && t >= shell.next) { const [mag, res] = left(shell.id); if (mag >= w.mag || res <= 0) break; ammo.set(shell.id, [mag + 1, practiceAmmo() ? res : res - 1]); reloads++; lastReloaded = shell.id; shell.next += w.shellMs; }
    const [mag, res] = left(shell.id); if (mag >= w.mag || res <= 0) { shell = null; reloadId = null; reloadUntil = 0; } }
  // Everything a reload had seated by moment t (ms): the magazine at its mag-in, the shells due — before a switch or a
  // reset breaks it off, so the moment counts, never the frame that noticed it.
  function catchUp(t) { if (!reloadId) return; if (shell) seatShells(t); else if (!magIn && t >= magInAt) seatMag(); }
  let prevWeapon = null;
  function equip(id) { if (reloadId && weaponById(id)?.id !== reloadId) catchUp(now()); const was = current?.id; { const k = weaponById(id)?.kind, wk = weaponById(was)?.kind; if ((k === 'nade' || k === 'bomb') && wk && wk !== 'nade' && wk !== 'bomb') prevWeapon = was; } current = id ? weaponById(id) : null; if (current?.id !== was) { setView(current?.id, true); inspecting = null; fp?.twirl?.(0); scope = 0; resetAim(); rescope = null; stopReload(); knife = null; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; } heldLeft = false; wantShot = false; return current; }
  function cycle() { const own = arsenal(); if (!own.length) return null; const i = current ? own.indexOf(current.id) : -1; return equip(i + 1 < own.length ? own[i + 1] : null); }
  // R: reload (time per gun). Rounds move from the reserve at the end; never more than the reserve has.
  function reload() { inspecting = null;
    if (!fire_() || reloading()) return false; const id = current.id, [mag, res] = left(id); if (mag >= current.mag || res <= 0) return false;
    const t0 = now(), cs2Shells = current.shellMs && current.shellIntroMs != null, n = Math.min(current.mag - mag, res);
    reloadMs = !current.shellMs ? current.reloadMs : cs2Shells ? current.shellIntroMs + n * current.shellMs + current.shellOutroMs : current.reloadStartMs + n * current.shellMs;
    if (current.shellMs) shell = { id, start: t0, next: t0 + (cs2Shells ? current.shellIntroMs + current.shellAddMs : current.reloadStartMs) };
    reloadUntil = t0 + reloadMs; reloadId = id; magIn = false; magInAt = t0 + magInMs(current, mag, res >= current.reserve); reloadStarts++; heldLeft = false; wantShot = false; scope = 0;
    // The arms and CS2's reload sounds (magazine out, in, bolt…) at the clip's own speed (a shotgun's over its shells).
    const clipMs = current.shellMs ? reloadMs : current.reloadClipMs || reloadMs; fp?.reload(clipMs);
    const own = clipStart('reload', clipMs); if (!own) { sounds.magOut(null, id); setTimeout(() => { if (reloadId === id && current?.id === id) sounds.magIn(null, id); }, Math.max(0, magInAt - t0 - 30)); }
    return true;
  }
  function finishReload() { const id = reloadId, own = chanKind === 'reload'; if (!weaponById(id)) { stopReload(); return; } seatMag(); reloadId = null; reloadUntil = 0; magIn = false; if (!own) setTimeout(() => current?.id === id && sounds.bolt(null, id), 120); }
  // Knife (CS2, KNIFE): left = quick slash, right = slow heavy stab; either locks both buttons for its time. The hit is
  // decided the moment you click (hitMs 0: the swing animation follows), along your aim, within reach, not through walls.
  // A slash that follows another attack (within chainMs of its end) is the weaker follow-up (chain).
  // (v53 KNIVES final) The swing's clip by its result (0 miss, 1 hit, 2 backstab): fp-view.js falls back where a set lacks one.
  const LIGHT_CLIP = ['light', 'lighthit', 'backstab'], LIGHT2_CLIP = ['light2', 'lighthit2', 'backstab2'], HEAVY_CLIP = ['heavy', 'heavyhit', 'heavystab']; let lightAlt = false;
  function attack(kind) {
    const K = KNIFE[kind]; if (knife && now() < knife.until) return false; if (now() - drawAt < drawMs) return false;
    const chain = kind === 'light' && !!knife && now() < knife.until + KNIFE.chainMs;
    inspecting = null; knife = { kind, chain, start: now(), hitAt: now() + K.hitMs, until: now() + K.rateMs, done: false }; lastShot = now();
    // (v53 KNIVES final) The hit is known at the click (hitMs 0), so the arms play CS2's clip for it, as its knife graph
    // does (viewmodel_knife.vnmgraph: the attack_type selector over LightMiss / LightHit / LightBackstab / HeavyMiss /
    // HeavyHit / HeavyBackstab; LightMiss, LightHit and LightBackstab each a selector on attack_variation over two
    // clips). How CS2 sets attack_variation is game code, not in the files: the light ones alternate here (CS:GO's
    // knife did so — m_swingLeft; from memory, not verified in CS2). The host still decides the damage (combat-logic).
    let res = 0; if (K.hitMs <= 0) { knife.done = true; if (canFire()) res = knifeHit(true); }
    const want = kind === 'heavy' ? HEAVY_CLIP[res] : (lightAlt = !lightAlt) ? LIGHT_CLIP[res] : LIGHT2_CLIP[res];
    const n = fp?.swing ? fp.swing(want) : (fp?.fire(), null), own = clipStart(n || kind); if (!own) sounds.slash(null, kind === 'heavy');
    if (res && !(own && n !== 'light' && n !== 'light2' && n !== 'heavy')) sounds.stab(null, kind === 'heavy');   // (a hit or backstab clip carries CS2's own hit sound: knife_hit_*)
    return true;
  }
  function knifeHit(quiet = false) {   // (quiet: attack() plays the hit's sound with the swing's clip)
    const K = KNIFE[knife.kind], a = aim(), d = dirFor(a.pitch, a.yaw, tmpD), o = camera.getWorldPosition(origin), wall = rayBoxes(boxes(), o.x, o.y, o.z, d.x, d.y, d.z, 40);
    let best = null; for (const tgt of targets()) { const t = rayCapsule(o, d, tgt.feet, tgt.crouched ? BODY_H * CROUCH_H : BODY_H); if (t !== null && t <= K.range && t < wall && (!best || t < best.t)) best = { t, tgt, off: 0 }; }
    // Nothing on the line: CS2 sweeps a hull along the aim — a body within KNIFE.hull of the line, in reach, counts; the
    // one nearest the line (the crosshair) first; never round a wall (the line from your eye to its chest is clear).
    if (!best) for (const tgt of targets()) { const f = tgt.feet, h = tgt.crouched ? BODY_H * CROUCH_H : BODY_H; let off = Infinity, at = 0;
      for (let t = 0; t <= K.range; t += .4) { const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t, hz = Math.max(0, Math.hypot(px - f.x, pz - f.z) - BODY_R), vz = py < f.y ? f.y - py : py > f.y + h ? py - f.y - h : 0, sep = Math.hypot(hz, vz); if (sep < off) { off = sep; at = t; } }
      if (off > KNIFE.hull || at >= wall || (best && (off > best.off || (off === best.off && at >= best.t)))) continue;
      const cy = f.y + h * .6, L = Math.hypot(f.x - o.x, cy - o.y, f.z - o.z) || 1e-6; if (rayBoxes(boxes(), o.x, o.y, o.z, (f.x - o.x) / L, (cy - o.y) / L, (f.z - o.z) / L, L) < L - BODY_R) continue;
      best = { t: at, tgt, off }; }
    if (best && !quiet) sounds.stab(null, knife.kind === 'heavy');
    // (v53 KNIVES final: from behind — the host's rule, combat-logic knifeCheck: the line to the target within its facing,
    // dot > KNIFE.backDot — for the arms' backstab clip; the target's yaw as drawn: lab.js shootTargets)
    let res = 0; if (best) { const f = best.tgt.feet, y = best.tgt.yaw, dx = f.x - o.x, dz = f.z - o.z, L = Math.hypot(dx, dz) || 1e-6; res = Number.isFinite(y) && (dx * -Math.sin(y) + dz * -Math.cos(y)) / L > KNIFE.backDot ? 2 : 1; }
    if (best) { const y = Math.min(best.tgt.feet.y + BODY_H, Math.max(best.tgt.feet.y, o.y + d.y * best.t)); report({ type: 'hit', target: best.tgt.id, seen: best.tgt.seen, weapon: current.id, attack: knife.kind, chain: !!knife.chain, zone: zoneAt(y - best.tgt.feet.y) === 'head' ? 'head' : 'chest' }); }
    // No one in reach: the blade meets glass or a vent grate in front (CS: the knife breaks them too).
    if (!best) { const P = bulletPath(boxes(), o.x, o.y, o.z, d.x, d.y, d.z, K.range, 0, PATH), b = P.stopBox?.mover != null ? P.stopBox : P.embedded;
      if (b) dispatchEvent(new CustomEvent('gd-break', { detail: { boxes: [b], dmg: knife.kind === 'heavy' ? 65 : 40 } })); }
    return res;
  }
  // Grenades: press = pull the pin (and hold); release = throw. Left alone: long throw; right alone: short underhand;
  // both: medium. One throw per grenade; nothing after death.
  // Grenade state machine, as CS2 (THROW in weapons-data.js): idle → priming (the pin comes out, primeMs, after the
  // draw) → held (armed) → released → thrown. A click throws as soon as the pin is out; holding waits for the
  // release. The buttons held at the moment you let go pick the throw: both = medium, left = long, right = short.
  // Switching weapons, a menu or leaving the window cancels (cancelUtility).
  function nadeButton(btn, on, at) {
    if (on) { if (nade.state === 'thrown' || nade.state === 'release') return; nade.buttons.add(btn); if (nade.state === 'idle') { nade.state = 'priming'; nade.primedAt = Math.max(now(), drawAt + drawMs) + THROW.primeMs; nade.queued = null; if (!clipStart('prime')) sounds.pin(null, current.id); if (fp?.prime) fp.prime(); else fp?.fire(); } return; }
    if (!nade.buttons.has(btn)) return; const held = new Set(nade.buttons); nade.buttons.delete(btn);
    const pick = held.size > 1 ? 'medium' : held.has(0) ? 'long' : 'short';
    if (nade.state === 'priming') { if (!nade.buttons.size || held.size > 1) nade.queued = pick; return; }   // let go early: thrown the moment the pin is out (CS2)
    if (nade.state !== 'held') return;
    nade.strength = pick; nade.state = 'release'; releaseAt(evAt(at));   // (v53: the button event's own moment — lab.js passes e.timeStamp)
  }
  // v53 (sub-tick release): the moment of letting go (ms, performance.now — the button's event) and the raw look angles
  // at that moment (aim(): the view's own pitch / yaw, no punch or smoothing) go with the throw; the movement then gives
  // the state at that moment (lab.js → arena-move.js pressThrow), so the same input lands the same at any frame rate.
  function releaseAt(t) { const A = aim(); nade.relAt = t; nade.relP = +A.pitch || 0; nade.relY = +A.yaw || 0; }
  // evAt: an input event's moment (ms, e.timeStamp — performance.now()'s clock, the moment the OS took the input, not the
  // moment a busy frame let its handler run), when it is one: else now. The angles are still read at the handler: every
  // mouse move before the release has been applied by then (events run in order), so they are the release's angles.
  const evAt = at => { const T = now(); return Number.isFinite(at) && at <= T && T - at < 1000 ? at : T; };
  // A jump-throw (GD's 'jumpthrow' action, or Jump with the "Jump + release" helper): the grenade in hand let go at
  // moment t (seconds, performance.now() / 1000 — the same moment lab.js gives pressJump) with the buttons held now picking the strength (left 1, right 0, both 0.5 — as a release), and lab.js
  // presses Jump at the same t: both fall on one movement tick. Returns true when a grenade was let go (or will be the
  // moment its pin is out).
  function jumpThrow(t) {
    if (current?.kind !== 'nade' || !nade.buttons.size || (nade.state !== 'held' && nade.state !== 'priming')) return false;
    const pick = nade.buttons.size > 1 ? 'medium' : nade.buttons.has(0) ? 'long' : 'short'; nade.buttons.clear();
    if (nade.state === 'priming') { nade.queued = pick; return true; }
    nade.strength = pick; nade.state = 'release'; releaseAt(t * 1000); return true; }   // (t: s, on performance.now()'s clock — lab.js's pressJump moment; releaseAt keeps ms)
  function cancelNade() { if (nade.state === 'thrown') return; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; }
  // A shot at moment t (ms; the trigger's own time — update() passes when a held trigger's next shot was due, so the
  // cadence and the aim state don't depend on the frame rate).
  function fire(t = now()) {
    if (!current || !canFire() || t < drawAt + drawMs) return false;
    if (current.kind === 'knife') return !reloading() && attack('light');
    if (current.kind === 'bomb' || current.kind === 'nade') return false;   // planting: lab → arena-ui.plant · grenades: nadeButton
    if (t < A.nextAt) return false;
    const id = current.id, [mag, res] = left(id);
    if (reloading()) { if (!(shell && mag > 0 && t >= shell.start + current.reloadStartMs)) return false; stopReload(); }   // a shotgun with shells in: the click fires (CS2), ending the reload
    if (mag <= 0) { if (now() - lastDry > 250) { lastDry = now(); sounds.dry(null, current.id); } if (res > 0) reload(); return false; }
    advance(t); inspecting = null; A.nextAt = nextFireAt(A.nextAt, t, current.rateMs); A.lastShot = lastShot = t; shots++; kick = 1; lastFired = id;
    // CS2's inaccuracy now (penalty + movement), its visual view punch, then the ray: from the eye along the raw look +
    // the aim punch (spray + flinch) + the shot's seeded offset — the host recomputes exactly this (combat-logic.js).
    const zs = scopedMode(), acc = accOf(current, zs), ia = inacc = inaccuracyOf(acc, A, MV);
    viewKick(current, shots, zs, KICK); shake.pitch += KICK.pitch * D2R; shake.yaw += KICK.yaw * D2R; ammo.set(id, [practiceMag() ? mag : mag - 1, res]); fp?.fire();
    const a = aim(), o = camera.getWorldPosition(origin), m = MV, puP = A.aimP + A.flP, puY = A.aimY + A.flY, reach = current.reach ?? current.range;
    shotBase(a.pitch, a.yaw, puP, puY, B3); base.set(B3[0], B3[1], B3[2]); const np = shotOffsets(current, shots, ia, acc.spread, OFFS), dirs = [];
    for (let k = 0; k < np; k++) { offsetDir(B3, OFFS[2 * k], OFFS[2 * k + 1], D3); dirs.push(new THREE.Vector3(D3[0], D3[1], D3[2])); }
    view?.updateMatrixWorld(); muzzle.set(...(MUZZLE[id] || MUZZLE.pistol)); if (fp && view) fp.muzzle(muzzle); else if (view) muzzle.applyMatrix4(view.matrixWorld); else muzzle.copy(o);
    const bx = boxes(), hits = new Map(), ends = []; let broke = null;   // (doors and breakables a bullet hit: map files' movers)
    for (const d of dirs) {
      // Through crates and thin walls (wallbang) as far as the gun's penetration allows; then the floor or the first solid wall.
      const path = bulletPath(bx, o.x, o.y, o.z, d.x, d.y, d.z, 2000, current.pen || 0, PATH, false, current.dmg), wallT = Math.min(path.stop, d.y < -1e-6 ? -o.y / d.y : Infinity, !bx.length && effects.hitPoint ? effects.hitPoint(o, d).point.distanceTo(o) : Infinity);
      let best = null; for (const tgt of targets()) { const f = tgt.feet, tt = rayBody(o.x, o.y, o.z, d.x, d.y, d.z, f.x, f.y, f.z, !!tgt.crouched, 0, ZB); if (tt > 0 && tt < wallT && tt <= reach && (!best || tt < best.t)) best = { t: tt, tgt, zone: ZB.zone }; }
      const end = Math.min(best ? best.t : wallT, 400); onShot(o.x, o.y, o.z, d.x, d.y, d.z, end, (current.dmg || 30) / 30);   // (a CS2 map's pots and cans on the way: knocked or shattered)
      for (const c of path.crossed) if (c.t0 < end) { ends.push({ point: o.clone().addScaledVector(d, c.t0), normal: new THREE.Vector3(c.nx, c.ny, c.nz), mark: true, mat: c.b?.surf || c.mat || null, dir: d });   // entry holes in what it went through (on its face: CS2 maps, the triangle's own)
        if (c.t1 < end) ends.push({ point: o.clone().addScaledVector(d, c.t1), normal: d.clone(), mark: true, exit: true, mat: c.b?.surf || c.mat || null, dir: d }); }   // (v53 MAP: and where it leaves it — CS:GO's HandleBulletPenetration draws the exit's impact and hole too)
      for (const c of path.crossed) if (c.t0 < end && c.b?.mover != null) (broke ??= new Set()).add(c.b); if (path.stopBox?.mover != null && !best && wallT === path.stop) (broke ??= new Set()).add(path.stopBox); if (path.embedded && !best && wallT === path.stop) (broke ??= new Set()).add(path.embedded);
      const sn = path.stopNormal; ends.push({ point: o.clone().addScaledVector(d, end), normal: best ? null : wallT === path.stop && sn ? new THREE.Vector3(sn[0], sn[1], sn[2]) : wallT < path.stop && d.y < -1e-6 && wallT === -o.y / d.y ? new THREE.Vector3(0, 1, 0) : d.clone().negate(), flesh: !!best, mat: !best && wallT === path.stop ? path.stopBox?.surf || path.stopBox?.mat || path.embedded?.surf || path.embedded?.mat || null : null,
        sky: !best && !(wallT === path.stop ? path.stop < 2000 : Number.isFinite(wallT)), far: !best && wallT > end && (wallT === path.stop ? path.stop < 2000 : Number.isFinite(wallT)) ? o.clone().addScaledVector(d, wallT) : null, dir: d });   // (v53 MAP: sky — nothing met within 2000 units, no impact; far — the wall past the tracer's 400 units, its impact drawn there)   // (v53 GD: a CS2 door's own surface, gd-surface-props.js)   // (the mark lies on the wall or floor it hit; mat: what it is — the impact's sound)
      if (!best) continue; const h = hits.get(best.tgt.id) || { pellets: 0, seen: best.tgt.seen, zones: {} }, z = best.zone;
      h.pellets++; h.zones[z] = (h.zones[z] || 0) + 1; if (!h.zone || HIT_GROUPS[z] > HIT_GROUPS[h.zone]) h.zone = z; hits.set(best.tgt.id, h);
    }
    lastEnds = { origin: o.clone(), dir: base.clone(), ends, muzzle: muzzle.clone(), cone: ia, n: shots, at: t };   // (tests: where the shot went)
    shotRec = { n: shots, pitch: a.pitch, yaw: a.yaw, pu: [puP, puY], ia, sc: zs ? 1 : 0 };   // (the pose carries the newest: others draw its tracers — shotDirs)
    if (broke) dispatchEvent(new CustomEvent('gd-break', { detail: { boxes: [...broke], dmg: (current.dmg || 20) * dirs.length } }));   // glass and vents it hit: lab.js tells the room
    effects.shootAt ? effects.shootAt(muzzle, ends, { ...shotFx(current), n: shots }) : effects.shoot(muzzle, base.clone(), { ...shotFx(current), dirs, n: shots });   // (n: which shots draw a tracer — CS2's frequency, gd-tracers.js)
    const how = { noscope: !!current.zoom && !(scope > 0), air: !m.onGround, blind: blind() > .5 };   // for the kill feed (CS2 marks)
    // Each body hit: the shot's whole record (the host traces it again itself: eye, raw look, aim punch, inaccuracy,
    // shot number; ft the trigger's moment on this page's clock) — zone and pellets only as hints.
    for (const [target, h] of hits) report({ type: 'hit', target, seen: h.seen, weapon: id, pellets: h.pellets, zones: h.zones, zone: h.zone, head: h.zone === 'head', n: shots, ft: Math.round(t), eye: [o.x, o.y, o.z], look: [a.pitch, a.yaw], pu: [puP, puY], ia, sc: zs ? 1 : 0, ...how });
    A.pen += acc.fire; recoilShot(A, current);   // (after the shot, as CS: the first shot from rest has only the floor)
    // Bolt-action rifles: the scope drops at once for the bolt; it comes back after the bolt if Auto re-scope is on (Settings).
    if (current.mode === 'pump') clipStart('fire');   // (a pump gun's pump after the shot, as CS2's clip has it)
    if (current.mode === 'bolt') { if (scope) rescope = { id, level: scope, at: now() + current.rateMs * .9, manual: false }; scope = 0; if (!clipStart('fire')) setTimeout(() => current?.id === id && sounds.bolt(null, id), current.rateMs * .4); }
    if (mag - 1 <= 0 && res > 0 && !current.auto) setTimeout(() => { if (current?.id === id && left(id)[0] === 0) reload(); }, current.rateMs);
    return true;
  }
  return {
    get current() { return current; }, get shots() { return shots; }, get reloads() { return reloads; }, get reloadStarts() { return reloadStarts; }, get magInAt() { return reloadId && !shell && !magIn ? magInAt : 0; }, get equipped() { return !!current; },
    get ammo() { return current ? left(current.id)[0] : 0; }, get reserve() { return current ? left(current.id)[1] : 0; }, ammoOf: id => left(id), get reloading() { return reloading(); },
    get reloadLeft() { return reloading() ? (reloadUntil - now()) / reloadMs : 0; },
    get punch() { return punch; }, get shake() { return shake; }, get spray() { return A.ri; }, get lastShot() { return lastEnds; }, get scope() { return scope; },
    // Scoped: the camera's vertical FOV for CS2's zoom (horizontal on 4:3), and the mouse sensitivity factor (zoom / 90).
    get scopeFov() { return scope && current?.zoom ? zoomVfov(current.zoom[scope - 1]) : 0; }, get scopeSens() { return scope && current?.zoom ? zoomSens(current.zoom[scope - 1]) : 1; },
    // The inaccuracy a shot would have now (tangent units: the crosshair's gap) and the aim state (tests).
    get inaccuracy() { return inacc; }, get aimState() { return A; }, get lastFired() { return lastFired; },
    // The pose's shot record (lab.js → room → other players' tracers, the host's ammo): numbers, the newest shot's look,
    // punch and inaccuracy, and which gun fired the last shot (w) and reloaded last (rw) — the host charges those (SHOOT-13).
    // (pitch stays the live look pitch — flash facing, the spectator camera, smoke tunnels read it; sp / yaw: the newest shot's look)
    poseShot(pitch, yaw) { const s = shotRec; return { n: shots, r: reloads, rs: reloadStarts, pitch, sp: s ? s.pitch : pitch, yaw: s ? s.yaw : yaw, pu: s ? s.pu : [0, 0], ia: s ? s.ia : 0, sc: s ? s.sc : 0, w: lastFired, rw: lastReloaded }; },
    // Being shot (lab.js onHurt): an aim punch up, smaller on armor (weapons-data flinchPunch); it decays on its own.
    flinch(dmg, armored = false) { const p = flinchPunch(dmg, armored); if (p > 0) { A.flP = Math.min(A.flP + p, 2 * p + 1); shake.pitch += p * RECOIL.view * D2R; } return p; },
    // Let go of the trigger (focus or the mouse lost, a menu, a chorded release): an automatic gun stops at once.
    release() { heldLeft = false; wantShot = false; },
    get nade() { return current?.kind === 'nade' ? { state: nade.state, strength: nade.buttons.size > 1 || nade.both ? 'medium' : nade.buttons.has(2) ? 'short' : 'long' } : null; },
    // Inspect (F): look the weapon over; any action cancels it.
    inspect() { if (!current || (knife && now() < knife.until) || reloading() || scope || (now() - drawAt < drawMs && !(current.kind === 'knife' && fp?.canInspectDraw?.())) || (current.kind === 'nade' && nade.state !== 'idle')) return false; const clip = GUN_FP_KINDS.has(current.kind) || fp?.authored ? fp?.inspect?.() || 0 : 0; inspecting = { start: now(), ms: clip || (current.kind === 'knife' ? 2400 : current.kind === 'bomb' ? 1400 : 2000), clip: clip > 0 }; if (clip > 0) clipStart(fp?.inspectClip || 'inspect', clip); return true; },   // (v53 KNIVES: the inspect CS2 picked — lookat02's own sounds)   // (clip: the arms' own inspect animation plays)
    get inspecting() { return !!inspecting; },
    get viewInfo() { return { authored: !!fp?.authored, skinMats: fp?.weaponMats || [], set: fpSet }; },   // (tests: CS2's own set in view? its skinnable materials)
    // What to hold when the current item is gone (a thrown grenade, a planted bomb): the last weapon, else the best one.
    fallback() { const own = arsenal().filter(Boolean); return own.includes(prevWeapon) ? prevWeapon : own.find(i => !['nade', 'bomb'].includes(weaponById(i)?.kind)) || null; },
    get knife() { return knife; }, get drawing() { return now() - drawAt < drawMs; },
    equip, cycle, fire, reload, setView, jumpThrow,
    // Mouse buttons (0 left, 2 right) while playing.
    button(btn, on, at) {   // (at: the event's moment, ms on performance.now()'s clock — grenades' sub-tick release)
      if (!current) return;
      if (current.kind === 'nade') return nadeButton(btn, on, at);
      // Left: a press fires now if the gun is ready; else a semi-automatic gun's press waits and fires the moment it is,
      // as long as the button is still held (CS2); an automatic one fires on while held (update).
      if (btn === 0) { heldLeft = on; wantShot = false; if (!on) return; readMove(); advance(now()); if (!fire() && isFirearm(current) && left(current.id)[0] > 0) wantShot = true; return; }   // (an empty gun clicks once per press, as before: nothing to wait for)
      if (btn === 2 && on) { if (current.kind === 'knife') { if (canFire()) attack('heavy'); return; } if (current.zoom && !reloading()) {
        // During the bolt: right click cancels an automatic re-scope, or asks for one (manual) when it is off.
        if (current.mode === 'bolt' && now() - lastShot < current.rateMs) { if (rescope) rescope = null; else rescope = { id: current.id, level: 1, at: lastShot + current.rateMs * .9, manual: true }; return; }
        scope = (scope + 1) % (current.zoom.length + 1); scopeAt = now(); sounds.scope(); } }
    },
    press(on, at) { this.button(0, on, at); },   // (at: the event's moment, ms — GD grenades)
    // Death, respawn, new round: no scope, no spray, no half-done throws or reloads. Leaving the window, losing the
    // mouse or opening a menu (lab.js blur / pointerlockchange / panelOpen call this too) also lets go of the trigger.
    cancelUtility() { cancelNade(); heldLeft = false; wantShot = false; }, get rescope() { return rescope; },
    reset() { rescope = null; scope = 0; resetAim(); A.flP = A.flY = 0; punch.pitch = punch.yaw = 0; stopReload(); heldLeft = false; knife = null; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; },
    unscope() { scope = 0; },
    hideView(hidden) { if (view) view.visible = !hidden;
      // Spectating borrowed this CS2 set (spectate-view.js: the sets are shared objects) — shown again: held again for your weapon, skin and side.
      if (!hidden && fp?.root && view && fp.root.parent !== view && current) setView(current.id); },
    // Take the host's ammo when it has seen exactly our shots and reloads (and no reload is running on either side).
    sync() { const h = host(); if (!h?.shots || reloading() || h.shots.pending) return false; if (h.shots.n !== shots || h.shots.r !== reloads) return false; let changed = false;
      for (const [id, a] of Object.entries(h.ammo || {})) { const mine = ammo.get(id); if (!mine || mine[0] !== a[0] || mine[1] !== a[1]) { ammo.set(id, [a[0], a[1]]); changed = true; } } return changed; },
    // Picked up / bought / new round: take these rounds now (the host's numbers follow).
    setAmmo(id, a) { if (a) ammo.set(id, [a[0], a[1]]); else ammo.delete(id); },
    update(dt) { if (current?.id === 'knife') { const k = knifeSkin(); if (k !== knifeSeen) { knifeSeen = k; setView('knife'); } }
      { const k = Math.exp(-dt * RECOIL.kickBack); shake.pitch *= k; shake.yaw *= k; }
      clipSnd.step(now()); if (chanKind === 'inspect' && !inspecting) { clipSnd.stop(); chanKind = ''; }
      if (fp?.setGloves && fp.root.parent === view) { const gl = glovesOf(), gv = gloveVersion(); if (gl !== glovesSeen || gv !== gloveVSeen) { glovesSeen = gl; gloveVSeen = gv; fp.setGloves(gl, team()); } }   // (your gloves: a pick (the record's identity changes only then) or glove files arriving — two comparisons a frame otherwise)
      if (current && (fp?.weaponMats || plainM)) { const r = skinRev(); if (r !== skinRevSeen || now() - skinAt > 1000) { skinRevSeen = r; skinAt = now(); const sk = skinOf(current.id); if (sk !== skinSeen) { skinSeen = sk; if (fp?.weaponMats) applySkin(fp.weaponMats, sk, ownTint(fpSet)); else skinObject(plainM, sk); } } }   // (the room's skins changed (srev): re-applied at once; else a 1 s look — records keep their identity between changes)   // (an inspect broken off by any action: quiet)
      if (!current) { punch.pitch = punch.yaw = 0; A.t = now(); return; }
      if (reloadId && current.id !== reloadId) { catchUp(now()); stopReload(); }   // switched away: before the magazine is seated nothing changed
      if (shell && reloadId) seatShells(now());
      else { if (reloadId && !magIn && now() >= magInAt) seatMag(); if (reloadId && !reloading()) finishReload(); }
      // CS2 aim: a jump adds m_flInaccuracyJumpInitial to the penalty, a landing m_flInaccuracyLand × the landing speed
      // (HU/s); then every shot the trigger owes up to now, each at its own moment (a long frame fires them all, at most 4).
      const T = now(), gun = isFirearm(current), m = readMove(), a0 = gun ? accOf(current, scopedMode()) : null;
      if (a0) { if (wasGround && !m.onGround && !m.ladder && m.vy > 0) A.pen = Math.max(A.pen, a0.stand) + a0.jumpInit; if (m.landedAgo < lastLandAgo - 1e-3 && m.landedAgo < .2) A.pen = Math.max(A.pen, a0.stand) + a0.land * m.landSpeed; }
      wasGround = m.onGround || m.ladder; lastLandAgo = m.landedAgo;
      if (gun && heldLeft && (current.auto || wantShot)) for (let k = 0; k < 4; k++) { const due = Math.max(A.nextAt, drawAt + drawMs, A.t); if (due > T) break; advance(due); if (!fire(due)) break; if (!current.auto) { wantShot = false; break; } }
      advance(T); inacc = gun ? inaccuracyOf(accOf(current, scopedMode()), A, MV) : 0;
      if (fp && view?.visible) fp.update(dt, moveSpeed());
      punch.pitch = (A.aimP + A.flP) * D2R; punch.yaw = (A.aimY + A.flY) * D2R;   // (the camera follows RECOIL.view of it: lab.js)
      if (knife && !knife.done && now() >= knife.hitAt) { knife.done = true; if (canFire()) knifeHit(); }
      if (nade.state === 'priming' && now() >= nade.primedAt) { if (nade.queued) { nade.strength = nade.queued; nade.state = 'release'; releaseAt(nade.primedAt); } else nade.state = 'held'; }   // (let go early: released the moment the pin is out)
      if (nade.state === 'release') { nade.state = 'thrown'; nade.thrownAt = now(); fp?.throw?.(nade.strength); if (!clipStart(nade.strength === 'short' ? 'throwlow' : 'throw')) sounds.toss(null, current.id);   /* (one throw sound: CS2's clip, else its event / a whoosh — arena-ui no longer adds its own: GD-AUD-07) */ if (canFire()) throwNade(current.id, nade.strength, { t: (nade.relAt ?? now()) / 1000, pitch: nade.relP, yaw: nade.relY }); else cancelNade(); }   /* (v53: the release's moment, s, and its angles) */
      // After the throw (the arm follows through): another of the same grenade comes up, else back to your last weapon.
      if (nade.state === 'thrown' && now() - nade.thrownAt > 450) { const own = arsenal(); if (own.includes(current.id)) { nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; drawAt = now(); drawMs = DRAW_MS[current.id] || 500; setView(current.id, true); } else return this.equip(this.fallback()); }
      if (rescope && now() >= rescope.at) { if (current?.id === rescope.id && !reloading() && (rescope.manual || autoRescope())) { scope = rescope.level; scopeAt = now(); sounds.scope(); } rescope = null; }
      kick = Math.max(0, kick - dt * (current.auto ? 14 : 7));
      if (!view) return;
      const [x, y0, z] = view.userData.base, k = (current.kind === 'pistol' ? 1 : current.kind === 'sniper' || current.kind === 'shotgun' ? 1.4 : .5) * (fp?.authored ? .08 : 1);   /* (authored sets kick in their own fire clip: the shove stays a trace) */
      const d = fp?.authored ? 0 : 1 - Math.min(1, (now() - drawAt) / drawMs), dr = d * d * (3 - 2 * d),   /* (authored sets: their own draw) */ spin = current.kind === 'knife' ? (current.id === 'karambit' ? Math.PI * 2 : Math.PI) * d * d : 0;
      // The arms pack animates reloads itself; the plain model (no arms) dips instead.
      const rl = reloading() && !fp ? Math.sin(Math.min(1, 1 - (reloadUntil - now()) / current.reloadMs) * Math.PI) : 0;
      // Knife swings: light = a fast sweep right→left; heavy = draw back, then a stab forward.
      let kx = 0, ky = 0, kz = 0, rx = 0, ry = 0, rz = 0;
      if (knife && !fp?.authored) { const K = KNIFE[knife.kind], t = Math.min(1, (now() - knife.start) / K.rateMs);   /* (CS2-data sets: the swing is their own clip) */
        if (knife.kind === 'light') { const s = Math.sin(Math.min(1, t * 2.2) * Math.PI); kx = -s * .22; ky = s * .06; kz = -s * .08; rz = s * .45; ry = s * .28; }   // a quick diagonal swipe that stays in the lower right
        else { const ss = v => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v), back = ss(t / .26) * (1 - ss((t - .26) / .1)), stab = ss((t - .26) / .14) * (1 - ss((t - .55) / .45));   /* wind up back and to the right, then a hard stab forward toward the centre */
          kz = back * .1 - stab * .36; kx = back * .05 - stab * .13; ky = back * .05 + stab * .05; rx = back * .2 - stab * .15; rz = -back * .15 + stab * .15; } }
      // Grenade held: raised back over the shoulder (long) or low (short) while the pin is out.
      let ny = 0, nz = 0, nr = 0; const N = nade.state; if (current.kind === 'nade' && !fp?.authored && (N === 'priming' || N === 'held')) { const s = this.nade?.strength; ny = s === 'short' ? -.12 : .05; nz = s === 'short' ? -.04 : .1; nr = s === 'short' ? .12 : -.18; }
      // Knife idle: a slow breathing sway (the packs' idle clip barely moves a one-handed fist).
      idleT += dt; if (current.kind === 'knife' && !knife && !fp?.authored) { kx += Math.sin(idleT * 1.1) * .006; ky += Math.sin(idleT * 2.2) * .004; rz += Math.sin(idleT * 1.1) * .02; }
      // Inspect: raise and turn the hand to show the weapon's side, hold, turn back; the karambit spins round the ring.
      if (inspecting) { const t = (now() - inspecting.start) / inspecting.ms; if (t >= 1) { inspecting = null; fp?.twirl?.(0); } else if (!inspecting.clip) { const ss = v => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v), e = ss(t / .22) * (1 - ss((t - .78) / .22));
        if (current.kind === 'knife') { ky += e * .06; kx -= e * .07; ry -= e * .35; rz += e * .35; rx -= e * .12; if (current.id === 'karambit') fp?.twirl?.(Math.PI * 2 * ss((t - .34) / .3)); }
        else if (current.kind === 'bomb') { ky += e * .05; ry -= e * .25; rz += e * .15; }
        else { ky += e * .04; kx -= e * .05; ry -= e * .3; rz += e * .35; rx -= e * .08; } } }
      // Bolt-action rifles (AWP, SSG 08): after each shot the rifle rolls to show the bolt — up, back, forward, down —
      // and settles exactly when the next shot is ready, so you can read when you can fire again (CS2).
      if (current.mode === 'bolt' && !fp?.authored && lastShot && now() - lastShot < current.rateMs) { const t = (now() - lastShot) / current.rateMs, ss = v => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v), up = ss((t - .1) / .18) * (1 - ss((t - .7) / .25)), pull = Math.sin(Math.max(0, Math.min(1, (t - .3) / .34)) * Math.PI);
        rz += up * .62; ry += up * .16; ky += up * .09; kx -= up * .04; kz += pull * .15; rx += pull * .12; }
      // Planting: the bomb is lowered to the ground in front of you while the plant runs.
      { const pl = current.kind === 'bomb' && planting(); if (pl && !wasPlanting) fp?.plant?.(); wasPlanting = pl; }   /* (CS2-data sets: their own plant clip) */
      plantE += ((current.kind === 'bomb' && planting() && !fp?.authored ? 1 : 0) - plantE) * Math.min(1, dt * 7); if (plantE > .001) { ky -= plantE * .22; kz -= plantE * .12; kx -= plantE * .1; rx -= plantE * .7; }
      // Viewmodel lag (CS2): turning, the weapon trails the view a touch and springs back — a critically damped spring
      // on the look's turn rate, never more than about 2° (a hint of weight; a snap of the mouse doesn't throw it about).
      { const a = aim(); if (swayYaw === null) { swayYaw = a.yaw; swayPitch = a.pitch; } let dy = a.yaw - swayYaw, dp = a.pitch - swayPitch; swayYaw = a.yaw; swayPitch = a.pitch;
        if (dy > Math.PI) dy -= 2 * Math.PI; else if (dy < -Math.PI) dy += 2 * Math.PI; if (Math.abs(dy) > .6 || Math.abs(dp) > .6 || dt <= 0) dy = dp = 0;   // (a respawn or a teleport: no fling)
        const h = Math.max(dt, 1e-3), tx = Math.max(-SWAY.max, Math.min(SWAY.max, -dy / h * SWAY.k)), ty = Math.max(-SWAY.max, Math.min(SWAY.max, -dp / h * SWAY.k)), st = Math.min(dt, .05);
        swVx += (SWAY.K * (tx - swX) - SWAY.D * swVx) * st; swX += swVx * st; swVy += (SWAY.K * (ty - swY) - SWAY.D * swVy) * st; swY += swVy * st;
        if (!scope) { ry += swX; rx += swY; kx -= swX * .04; } }
      fitHand();   // (a change in Settings or the field of view applies at once)
      view.position.set(x + kx, y0 + kick * .05 * k - rl * .35 - dr * .55 + ky + ny, z + kick * .22 * k + dr * .15 + kz + nz);
      view.rotation.set(kick * .35 * k - rl * .6 - dr * .9 + rx + nr, .04 + ry, rl * .4 + dr * .35 + spin + rz);
      // Swings, inspect and planting turn round the hand (not the eye), so the weapon twists in place on screen.
      if (fp && (rx || ry || rz)) { fp.handIn(view, PIVOT); pivR.setFromEuler(pivE.set(rx, ry, rz)); view.position.add(pivA.copy(PIVOT).sub(pivB.copy(PIVOT).applyQuaternion(pivR))); }
      if (scope && view) view.visible = false;
    }
  };
}
export const feetOf = pose => new THREE.Vector3(pose.x, Math.max(0, pose.y - (Number.isFinite(pose.ey) ? pose.ey : pose.crouched ? 5.9 : EYE)), pose.z);   // (GD poses carry ey, the eye over the feet — combat-logic poseFeet; the hall's crouch is 5.9)
