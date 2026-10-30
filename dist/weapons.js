// The local player's weapons in Global Defensive: firing, aim, spray, ammo, reloads, scopes, knife attacks and
// grenade throws, plus the first-person view model.
//
// Aim (one pipeline, so everything agrees), CS:GO recoil: `punch` is the next bullet's spray; the camera follows
// RECOIL.view (45 %) of it and the bullet goes the rest of the way, so a spray climbs above the fixed crosshair and
// you pull down to hold it (the first bullet is exact). `shake` is the per-shot visual kick (camera only).
// Aim:
//  · aim() is where the mouse points (the lab's yaw / pitch). A shot leaves the EYE along aim + spray(n), where
//    spray(n) is the gun's fixed pattern (weapons-data.js): the first bullet is spray(0) = 0 — exactly through the
//    crosshair. Moving / jumping adds a deliberate random cone (moveInaccuracy); standing still adds nothing.
//  · `punch` (the next bullet's spray) is what the lab shows: the camera turns by half of it and the recoil crosshair
//    sits on the other half, so the crosshair is always where the next bullet goes. When you stop firing the pattern
//    position winds back (`recover` bullets / s) and the view returns smoothly. Pulling the mouse down compensates.
//  · Hits are tested along that same ray: against the players' capsules and the map's walls (exact boxes). The
//    bullet hole is where the ray stops; the tracer is drawn from the gun's muzzle to that point.
// Ammo: [magazine, reserve] per gun, predicted here, owned by the host (combat-logic.js). Shots and reloads are
// numbered (pose shot.n / shot.r, and each hit carries its shot number); whenever the host has seen exactly our
// shots and reloads, its numbers are taken (new round, pickup, purchase…).
import * as THREE from './three.module.js';
import { audioCtx, outAt } from './spatial-audio.js';
import { weaponById, EYE, BODY_R, BODY_H, HEAD_Y, CROUCH_H, zoneAt, HIT_GROUPS, isFirearm, sprayAt, moveInaccuracy, pelletPattern, KNIFE, fullAmmo, THROW, RECOIL } from './weapons-data.js';
import { loadSounds, reloadSound, fx as rec } from './sound-bank.js';
import { loadFP, fpFor, onFPReady, wantFP, hasFP } from './fp-view.js';
import { createClipChannel } from './fp-sounds.js';
import { synthWhoosh } from './gd-sounds.js';
import { applySkin } from './skin-render.js';
import { live } from './live-settings.js';
// The view model's own field of view (vertical degrees; 0: the world's), as CS2's viewmodel_fov 68 (4:3 horizontal ≈ 54 vertical).
export const VIEWMODEL = { fov: 58 };
import { weaponModel, loadRealWeapons, MUZZLE, VIEW, VIEW_ROT, knifeFor } from './weapon-models.js';
import { rayBoxes, bulletPath, BulletPath } from './arena-maps.js';
const PATH = new BulletPath();   // (each pellet's way, refilled: no garbage per shot)

// Draw (deploy) time, CS2-like: it swings up from below; no shooting until it's up.
const DRAW_BY_KIND = { pistol: 600, smg: 750, rifle: 900, sniper: 1050, shotgun: 850, lmg: 1100, knife: 450, nade: 500, bomb: 600 };
const GUN_FP_KINDS = new Set(['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'lmg']);   // (guns: their arms may have an inspect animation)
export const DRAW_MS = new Proxy({ karambit: 500, deagle: 700, ak: 850, m4: 850, sniper: 1000 }, { get: (o, id) => o[id] ?? DRAW_BY_KIND[weaponById(id)?.kind] ?? 600 });
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const LOUD = { pistol: [.5, 1], smg: [.32, 1.3], shotgun: [.75, .62], rifle: [.5, 1], sniper: [.85, .7], lmg: [.45, .9] };
export const shotFx = (wpn) => { const [volume, pitch] = LOUD[wpn.kind] || LOUD.pistol; return { id: wpn.id, volume: wpn.suppressed ? volume * .4 : volume, pitch, flashSize: wpn.suppressed ? .35 : wpn.kind === 'pistol' ? 1.1 : wpn.kind === 'shotgun' || wpn.kind === 'lmg' ? 1.8 : 1.5 }; };
const D2R = Math.PI / 180;
// Direction for an aim (pitch up, yaw as the lab's rotation.y): the camera's −Z through a YXZ euler.
const E = new THREE.Euler(0, 0, 0, 'YXZ');
export const dirFor = (pitch, yaw, out = new THREE.Vector3()) => out.set(0, 0, -1).applyEuler(E.set(pitch, yaw, 0, 'YXZ'));
// Offset a direction by (dp, dy) radians in its own frame (up / right).
function offset(dir, dp, dy, out = new THREE.Vector3()) { const up = Math.abs(dir.y) > .999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(dir, up).normalize(), u = new THREE.Vector3().crossVectors(right, dir).normalize(); return out.copy(dir).addScaledVector(u, Math.tan(dp)).addScaledVector(right, Math.tan(dy)).normalize(); }
// Directions of a remote player's shot (visual only): the pellet pattern for shotguns, else straight.
export function shotDirs(dir, wpn) { return wpn?.pellets ? pelletPattern(wpn).map(([p, y]) => offset(dir, p, y)) : [dir.clone()]; }
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
// canFire(), blind() 0…1 (flashed), aim() { pitch, yaw }, boxes() map boxes, move() { speed, max, onGround, landedAgo, ducked },
// throwNade(id, strength), moveSpeed(), host() { ammo: { id: [mag, res] }, shots: { n, r, pending } } (mine).
const PIVOT = new THREE.Vector3(), pivR = new THREE.Quaternion(), pivE = new THREE.Euler(), pivA = new THREE.Vector3(), pivB = new THREE.Vector3();
// Viewmodel lag: k (radians of lag per radian a second of turn), max (radians), K / D (the spring: stiffness, damping — critical).
const SWAY = { k: .012, max: .035, K: 90, D: 2 * Math.sqrt(90) };
export function createWeapons({ scene, camera, effects, arsenal, targets, report, canFire, onShot = () => {}, skinOf = () => null, blind = () => 0, aim = () => ({ pitch: 0, yaw: 0 }), boxes = () => [], move = () => ({ speed: 0, max: 1, onGround: true, landedAgo: 9 }), throwNade = () => {}, moveSpeed = () => 0, host = () => null, autoRescope = () => true, planting = () => false, practiceAmmo = () => false, team = () => null, knifeSkin = () => null }) {
  let current = null, view = null, lastShot = 0, kick = 0, heldLeft = false, reloadUntil = 0, reloadId = null, lastDry = 0;
  // Shot and reload numbers start somewhere random each session, so a host that saw an older session re-syncs.
  let shots = 1e6 + Math.floor(Math.random() * 4e8), reloads = 1000 + Math.floor(Math.random() * 1e6);
  let inspecting = null, idleT = 0, plantE = 0, rescope = null, lastEnds = null, ri = 0, scope = 0, knife = null, nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }, punch = { pitch: 0, yaw: 0 }, shake = { pitch: 0, yaw: 0 }, wasPlanting = false;
  const ammo = new Map(), origin = new THREE.Vector3(), muzzle = new THREE.Vector3(), base = new THREE.Vector3(), tmpD = new THREE.Vector3();
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
  // A CS2 star knife's own finish (its vertex colours) shows with no skin on only on the karambit — ★ Karambit | Ruby;
  // the butterfly, stiletto and M9 are plain steel, as they are named.
  const ownTint = set => !/butterfly|stiletto|m9/.test(set || '');
  function setView(id, draw = false) {
    if (view) { view.removeFromParent(); view = null; }
    if (draw && id) { drawAt = now(); drawMs = DRAW_MS[id]; }
    fp = null; clipSnd.stop(); chanKind = ''; fpSet = null; if (!id) return;
    const want = knifeFor(id, team(), knifeSkin(), true); wantFP(want); const kf = want !== id && want !== knifeFor(id, team()) && !hasFP(want) ? knifeFor(id, team()) : want, f = fpFor(id, kf);
    fpSet = kf; if (draw && !clipStart('draw', DRAW_MS[id])) sounds.draw(null, id);   // (CS2's draw: its own sounds at its own moments)
    if (f?.weaponMats) { skinSeen = skinOf(id); applySkin(f.weaponMats, skinSeen, ownTint(kf)); }   /* (your skin on it: skins.js, skin-render.js) */
    /* (a chosen knife: the side's default until its own CS2 set is in) */ if (f) { fp = f; view = new THREE.Group(); view.userData.base = [0, 0, 0]; view.add(f.root); f.hold(id, { draw, drawMs: DRAW_MS[id], model: kf, team: team() }); onTop(view); sideView(view); if (!camera.parent) scene.add(camera); return; }
    const [x, y, z, sc] = VIEW[id] || VIEW.pistol; const m = weaponModel(knifeFor(id, team()), sc); for (const [ax, r] of VIEW_ROT[id] || VIEW_ROT[weaponById(id)?.model] || []) m.rotateOnWorldAxis(AXES[ax], r);
    view = new THREE.Group(); view.add(m); view.position.set(x, y, z); view.rotation.y = .04; view.userData.base = [x, y, z]; onTop(view); sideView(view);
    if (!camera.parent) scene.add(camera);
  }
  // Reloads, as CS2: the rounds count only once the new magazine is seated (MAG_IN of the way through); switching
  // weapons before that cancels the reload and the gun keeps the magazine it had. After it, the reload stands.
  const MAG_IN = .75; let magInAt = 0, magIn = false;
  function stopReload() { reloadUntil = 0; reloadId = null; magIn = false; if (chanKind === 'reload') { clipSnd.stop(); chanKind = ''; } }   // (broken off: its sounds still to come stay quiet)
  function seatMag() { const id = reloadId, wpn = weaponById(id); if (!wpn || magIn) return; magIn = true; const [mag, res] = left(id), move = Math.min(wpn.mag - mag, res); ammo.set(id, [mag + move, practiceAmmo() ? res : res - move]); reloads++; }
  let prevWeapon = null;
  function equip(id) { const was = current?.id; { const k = weaponById(id)?.kind, wk = weaponById(was)?.kind; if ((k === 'nade' || k === 'bomb') && wk && wk !== 'nade' && wk !== 'bomb') prevWeapon = was; } current = id ? weaponById(id) : null; if (current?.id !== was) { setView(current?.id, true); inspecting = null; fp?.twirl?.(0); scope = 0; ri = 0; rescope = null; stopReload(); knife = null; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; } heldLeft = false; return current; }
  function cycle() { const own = arsenal(); if (!own.length) return null; const i = current ? own.indexOf(current.id) : -1; return equip(i + 1 < own.length ? own[i + 1] : null); }
  // R: reload (time per gun). Rounds move from the reserve at the end; never more than the reserve has.
  function reload() { inspecting = null;
    if (!fire_() || reloading()) return false; const id = current.id, [mag, res] = left(id); if (mag >= current.mag || res <= 0) return false;
    reloadUntil = now() + current.reloadMs; reloadId = id; magIn = false; magInAt = now() + current.reloadMs * MAG_IN; heldLeft = false; scope = 0; fp?.reload(current.reloadMs);
    // CS2's reload sounds where its clip has them (magazine out, slide, in, bolt), stretched with the clip to the gun's time.
    const own = clipStart('reload', current.reloadMs); if (!own) { sounds.magOut(null, id); setTimeout(() => { if (reloadId === id && current?.id === id) sounds.magIn(null, id); }, current.reloadMs * (MAG_IN - .03)); }
    return true;
  }
  function finishReload() { const id = reloadId, own = chanKind === 'reload'; if (!weaponById(id)) { stopReload(); return; } seatMag(); reloadId = null; reloadUntil = 0; magIn = false; if (!own) setTimeout(() => current?.id === id && sounds.bolt(null, id), 120); }
  // Knife (CS2, KNIFE): left = quick slash, right = slow heavy stab; either locks both buttons for its time. The hit is
  // decided the moment you click (hitMs 0: the swing animation follows), along your aim, within reach, not through walls.
  // A slash that follows another attack (within chainMs of its end) is the weaker follow-up (chain).
  function attack(kind) {
    const K = KNIFE[kind]; if (knife && now() < knife.until) return false; if (now() - drawAt < drawMs) return false;
    const chain = kind === 'light' && !!knife && now() < knife.until + KNIFE.chainMs;
    inspecting = null; knife = { kind, chain, start: now(), hitAt: now() + K.hitMs, until: now() + K.rateMs, done: false }; lastShot = now(); if (!clipStart(kind)) sounds.slash(null, kind === 'heavy'); if (fp?.swing) fp.swing(kind); else fp?.fire();
    if (K.hitMs <= 0) { knife.done = true; if (canFire()) knifeHit(); } return true;
  }
  function knifeHit() {
    const K = KNIFE[knife.kind], a = aim(), d = dirFor(a.pitch, a.yaw, tmpD), o = camera.getWorldPosition(origin), wall = rayBoxes(boxes(), o.x, o.y, o.z, d.x, d.y, d.z, 40);
    let best = null; for (const tgt of targets()) { const t = rayCapsule(o, d, tgt.feet, tgt.crouched ? BODY_H * CROUCH_H : BODY_H); if (t !== null && t <= K.range && t < wall && (!best || t < best.t)) best = { t, tgt, off: 0 }; }
    // Nothing on the line: CS2 sweeps a hull along the aim — a body within KNIFE.hull of the line, in reach, counts; the
    // one nearest the line (the crosshair) first; never round a wall (the line from your eye to its chest is clear).
    if (!best) for (const tgt of targets()) { const f = tgt.feet, h = tgt.crouched ? BODY_H * CROUCH_H : BODY_H; let off = Infinity, at = 0;
      for (let t = 0; t <= K.range; t += .4) { const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t, hz = Math.max(0, Math.hypot(px - f.x, pz - f.z) - BODY_R), vz = py < f.y ? f.y - py : py > f.y + h ? py - f.y - h : 0, sep = Math.hypot(hz, vz); if (sep < off) { off = sep; at = t; } }
      if (off > KNIFE.hull || at >= wall || (best && (off > best.off || (off === best.off && at >= best.t)))) continue;
      const cy = f.y + h * .6, L = Math.hypot(f.x - o.x, cy - o.y, f.z - o.z) || 1e-6; if (rayBoxes(boxes(), o.x, o.y, o.z, (f.x - o.x) / L, (cy - o.y) / L, (f.z - o.z) / L, L) < L - BODY_R) continue;
      best = { t: at, tgt, off }; }
    if (best) sounds.stab(null, knife.kind === 'heavy');
    if (best) { const y = Math.min(best.tgt.feet.y + BODY_H, Math.max(best.tgt.feet.y, o.y + d.y * best.t)); report({ type: 'hit', target: best.tgt.id, seen: best.tgt.seen, weapon: current.id, attack: knife.kind, chain: !!knife.chain, zone: zoneAt(y - best.tgt.feet.y) === 'head' ? 'head' : 'chest' }); }
    // No one in reach: the blade meets glass or a vent grate in front (CS: the knife breaks them too).
    if (!best) { const P = bulletPath(boxes(), o.x, o.y, o.z, d.x, d.y, d.z, K.range, 0, PATH), b = P.stopBox?.mover != null ? P.stopBox : P.embedded;
      if (b) dispatchEvent(new CustomEvent('gd-break', { detail: { boxes: [b], dmg: knife.kind === 'heavy' ? 65 : 40 } })); }
  }
  // Grenades: press = pull the pin (and hold); release = throw. Left alone: long throw; right alone: short underhand;
  // both: medium. One throw per grenade; nothing after death.
  // Grenade state machine, as CS2 (THROW in weapons-data.js): idle → priming (the pin comes out, primeMs, after the
  // draw) → held (armed) → released → thrown. A click throws as soon as the pin is out; holding waits for the
  // release. The buttons held at the moment you let go pick the throw: both = medium, left = long, right = short.
  // Switching weapons, a menu or leaving the window cancels (cancelUtility).
  function nadeButton(btn, on) {
    if (on) { if (nade.state === 'thrown' || nade.state === 'release') return; nade.buttons.add(btn); if (nade.state === 'idle') { nade.state = 'priming'; nade.primedAt = Math.max(now(), drawAt + drawMs) + THROW.primeMs; nade.queued = null; if (!clipStart('prime')) sounds.pin(null, current.id); if (fp?.prime) fp.prime(); else fp?.fire(); } return; }
    if (!nade.buttons.has(btn)) return; const held = new Set(nade.buttons); nade.buttons.delete(btn);
    const pick = held.size > 1 ? 'medium' : held.has(0) ? 'long' : 'short';
    if (nade.state === 'priming') { if (!nade.buttons.size || held.size > 1) nade.queued = pick; return; }   // let go early: thrown the moment the pin is out (CS2)
    if (nade.state !== 'held') return;
    nade.strength = pick; nade.state = 'release';
  }
  function cancelNade() { if (nade.state === 'thrown') return; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; }
  function fire() {
    if (!current || !canFire() || reloading() || now() - drawAt < drawMs) return false;
    if (current.kind === 'knife') return attack('light');
    if (current.kind === 'bomb' || current.kind === 'nade') return false;   // planting: lab → arena-ui.plant · grenades: nadeButton
    if (now() - lastShot < current.rateMs) return false;
    const id = current.id, [mag, res] = left(id);
    if (mag <= 0) { if (now() - lastDry > 250) { lastDry = now(); sounds.dry(null, current.id); } if (res > 0) reload(); return false; }
    inspecting = null; lastShot = now(); shots++; kick = 1; shake.pitch += (RECOIL.kick[current.kind] ?? .6) * D2R; shake.yaw += (Math.random() - .5) * (RECOIL.kick[current.kind] ?? .6) * .5 * D2R; ammo.set(id, [mag - 1, res]); fp?.fire();
    // The ray: from the eye along aim + spray(ri) (+ movement cone).
    const a = aim(), o = camera.getWorldPosition(origin), m = move();
    const rest = 1 - RECOIL.view; dirFor(a.pitch + punch.pitch * rest, a.yaw - punch.yaw * rest, base);   // the camera shows RECOIL.view of the spray; the bullet goes all the way
    const cone = moveInaccuracy(current, { ...m, scoped: scope > 0 }), dirs = (current.pellets ? pelletPattern(current) : [[0, 0]]).map(([pp, py]) => { const r = cone * Math.sqrt(Math.random()), t = Math.random() * Math.PI * 2; return offset(base, pp + r * Math.sin(t), py + r * Math.cos(t)); });
    view?.updateMatrixWorld(); muzzle.set(...(MUZZLE[id] || MUZZLE.pistol)); if (fp && view) fp.muzzle(muzzle); else if (view) muzzle.applyMatrix4(view.matrixWorld); else muzzle.copy(o);
    const bx = boxes(), hits = new Map(), ends = []; let broke = null;   // (doors and breakables a bullet hit: map files' movers)
    for (const d of dirs) {
      // Through crates and thin walls (wallbang) as far as the gun's penetration allows; then the floor or the first solid wall.
      const path = bulletPath(bx, o.x, o.y, o.z, d.x, d.y, d.z, 2000, current.pen || 0, PATH), wallT = Math.min(path.stop, d.y < -1e-6 ? -o.y / d.y : Infinity, !bx.length && effects.hitPoint ? effects.hitPoint(o, d).point.distanceTo(o) : Infinity);
      let best = null; for (const tgt of targets()) { const t = rayCapsule(o, d, tgt.feet, tgt.crouched ? BODY_H * CROUCH_H : BODY_H); if (t !== null && t < wallT && t <= current.range && (!best || t < best.t)) best = { t, tgt }; }
      const end = Math.min(best ? best.t : wallT, 400); onShot(o.x, o.y, o.z, d.x, d.y, d.z, end, (current.dmg || 30) / 30);   // (a CS2 map's pots and cans on the way: knocked or shattered)
      for (const c of path.crossed) if (c.t0 < end) ends.push({ point: o.clone().addScaledVector(d, c.t0), normal: new THREE.Vector3(c.nx, c.ny, c.nz), mark: true, mat: c.mat || null });   // entry holes in what it went through (on its face: CS2 maps, the triangle's own)
      for (const c of path.crossed) if (c.t0 < end && c.b?.mover != null) (broke ??= new Set()).add(c.b); if (path.stopBox?.mover != null && !best && wallT === path.stop) (broke ??= new Set()).add(path.stopBox); if (path.embedded && !best && wallT === path.stop) (broke ??= new Set()).add(path.embedded);
      const sn = path.stopNormal; ends.push({ point: o.clone().addScaledVector(d, end), normal: best ? null : wallT === path.stop && sn ? new THREE.Vector3(sn[0], sn[1], sn[2]) : wallT < path.stop && d.y < -1e-6 && wallT === -o.y / d.y ? new THREE.Vector3(0, 1, 0) : d.clone().negate(), flesh: !!best, mat: !best && wallT === path.stop ? path.stopBox?.mat || path.embedded?.mat || null : null });   // (the mark lies on the wall or floor it hit; mat: what it is — the impact's sound)
      if (!best) continue; const y = (o.y + d.y * best.t - best.tgt.feet.y) / (best.tgt.crouched ? CROUCH_H : 1), h = hits.get(best.tgt.id) || { pellets: 0, seen: best.tgt.seen }, z = zoneAt(y);
      h.pellets++; if (!h.zone || HIT_GROUPS[z] > HIT_GROUPS[h.zone]) h.zone = z; hits.set(best.tgt.id, h);
    }
    lastEnds = { origin: o.clone(), dir: base.clone(), ends, muzzle: muzzle.clone(), cone };   // (tests: where the shot went)
    if (broke) dispatchEvent(new CustomEvent('gd-break', { detail: { boxes: [...broke], dmg: (current.dmg || 20) * dirs.length } }));   // glass and vents it hit: lab.js tells the room
    effects.shootAt ? effects.shootAt(muzzle, ends, shotFx(current)) : effects.shoot(muzzle, base.clone(), { ...shotFx(current), dirs });
    const how = { noscope: !!current.zoom && !(scope > 0), air: !m.onGround, blind: blind() > .5 };   // for the kill feed (CS2 marks)
    for (const [target, h] of hits) report({ type: 'hit', target, seen: h.seen, weapon: id, pellets: h.pellets, zone: h.zone, head: h.zone === 'head', n: shots, ...how });
    ri = Math.min(ri + 1, (current.pattern?.length || 1) + 2);
    // Bolt-action rifles: the scope drops at once for the bolt; it comes back after the bolt if Auto re-scope is on (Settings).
    if (current.mode === 'pump') clipStart('fire');   // (a pump gun's pump after the shot, as CS2's clip has it)
    if (current.mode === 'bolt') { if (scope) rescope = { id, level: scope, at: now() + current.rateMs * .9, manual: false }; scope = 0; if (!clipStart('fire')) setTimeout(() => current?.id === id && sounds.bolt(null, id), current.rateMs * .4); }
    if (mag - 1 <= 0 && res > 0 && !current.auto) setTimeout(() => { if (current?.id === id && left(id)[0] === 0) reload(); }, current.rateMs);
    return true;
  }
  return {
    get current() { return current; }, get shots() { return shots; }, get reloads() { return reloads; }, get equipped() { return !!current; },
    get ammo() { return current ? left(current.id)[0] : 0; }, get reserve() { return current ? left(current.id)[1] : 0; }, ammoOf: id => left(id), get reloading() { return reloading(); },
    get reloadLeft() { return reloading() ? (reloadUntil - now()) / current.reloadMs : 0; },
    get punch() { return punch; }, get shake() { return shake; }, get spray() { return ri; }, get lastShot() { return lastEnds; }, get scope() { return scope; }, get scopeFov() { return scope && current?.zoom ? current.zoom[scope - 1] : 0; },
    get nade() { return current?.kind === 'nade' ? { state: nade.state, strength: nade.buttons.size > 1 || nade.both ? 'medium' : nade.buttons.has(2) ? 'short' : 'long' } : null; },
    // Inspect (F): look the weapon over; any action cancels it.
    inspect() { if (!current || (knife && now() < knife.until) || reloading() || scope || now() - drawAt < drawMs || (current.kind === 'nade' && nade.state !== 'idle')) return false; const clip = GUN_FP_KINDS.has(current.kind) || fp?.authored ? fp?.inspect?.() || 0 : 0; inspecting = { start: now(), ms: clip || (current.kind === 'knife' ? 2400 : current.kind === 'bomb' ? 1400 : 2000), clip: clip > 0 }; if (clip > 0) clipStart('inspect', clip); return true; },   // (clip: the arms' own inspect animation plays)
    get inspecting() { return !!inspecting; },
    get viewInfo() { return { authored: !!fp?.authored, skinMats: fp?.weaponMats || [], set: fpSet }; },   // (tests: CS2's own set in view? its skinnable materials)
    // What to hold when the current item is gone (a thrown grenade, a planted bomb): the last weapon, else the best one.
    fallback() { const own = arsenal().filter(Boolean); return own.includes(prevWeapon) ? prevWeapon : own.find(i => !['nade', 'bomb'].includes(weaponById(i)?.kind)) || null; },
    get knife() { return knife; }, get drawing() { return now() - drawAt < drawMs; },
    equip, cycle, fire, reload, setView,
    // Mouse buttons (0 left, 2 right) while playing.
    button(btn, on) {
      if (!current) return;
      if (current.kind === 'nade') return nadeButton(btn, on);
      if (btn === 0) { heldLeft = on; if (on) fire(); return; }
      if (btn === 2 && on) { if (current.kind === 'knife') { if (canFire()) attack('heavy'); return; } if (current.zoom && !reloading()) {
        // During the bolt: right click cancels an automatic re-scope, or asks for one (manual) when it is off.
        if (current.mode === 'bolt' && now() - lastShot < current.rateMs) { if (rescope) rescope = null; else rescope = { id: current.id, level: 1, at: lastShot + current.rateMs * .9, manual: true }; return; }
        scope = (scope + 1) % (current.zoom.length + 1); sounds.scope(); } }
    },
    press(on) { this.button(0, on); },
    // Death, respawn, new round: no scope, no spray, no half-done throws or reloads.
    cancelUtility() { cancelNade(); }, get rescope() { return rescope; },
    reset() { rescope = null; scope = 0; ri = 0; punch = { pitch: 0, yaw: 0 }; stopReload(); heldLeft = false; knife = null; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; },
    unscope() { scope = 0; },
    hideView(hidden) { if (view) view.visible = !hidden; },
    // Take the host's ammo when it has seen exactly our shots and reloads (and no reload is running on either side).
    sync() { const h = host(); if (!h?.shots || reloading() || h.shots.pending) return false; if (h.shots.n !== shots || h.shots.r !== reloads) return false; let changed = false;
      for (const [id, a] of Object.entries(h.ammo || {})) { const mine = ammo.get(id); if (!mine || mine[0] !== a[0] || mine[1] !== a[1]) { ammo.set(id, [a[0], a[1]]); changed = true; } } return changed; },
    // Picked up / bought / new round: take these rounds now (the host's numbers follow).
    setAmmo(id, a) { if (a) ammo.set(id, [a[0], a[1]]); else ammo.delete(id); },
    update(dt) { if (current?.id === 'knife') { const k = knifeSkin(); if (k !== knifeSeen) { knifeSeen = k; setView('knife'); } }
      { const k = Math.exp(-dt * RECOIL.kickBack); shake.pitch *= k; shake.yaw *= k; }
      clipSnd.step(now()); if (chanKind === 'inspect' && !inspecting) { clipSnd.stop(); chanKind = ''; }
      if (current && fp?.weaponMats && now() - skinAt > 400) { skinAt = now(); const sk = skinOf(current.id); if (sk !== skinSeen) { skinSeen = sk; applySkin(fp.weaponMats, sk, ownTint(fpSet)); } }   // (a skin changed in the menu: shown at once)   // (an inspect broken off by any action: quiet)
      if (!current) { punch.pitch = punch.yaw = 0; return; }
      if (reloadId && current.id !== reloadId) stopReload();   // switched away: before the magazine is seated nothing changed
      if (reloadId && !magIn && now() >= magInAt) seatMag();
      if (reloadId && !reloading()) finishReload();
      if (heldLeft && current.auto) fire();
      if (fp && view?.visible) fp.update(dt, moveSpeed());
      // Spray recovery once the trigger rests a moment.
      if (current.mode === 'bolt' || current.mode === 'pump') { if (now() - lastShot > 60) ri = Math.max(0, ri - dt * 1000 / (current.rateMs * .6)); }   // single-shot guns: the kick is gone before the next shot is ready (flicks land)
      else if (now() - lastShot > current.rateMs * 1.15) ri = Math.max(0, ri - dt * (current.recover || 10));
      { const [p, y] = sprayAt(current, ri); punch.pitch = p * D2R; punch.yaw = y * D2R; }
      if (knife && !knife.done && now() >= knife.hitAt) { knife.done = true; if (canFire()) knifeHit(); }
      if (nade.state === 'priming' && now() >= nade.primedAt) { if (nade.queued) { nade.strength = nade.queued; nade.state = 'release'; } else nade.state = 'held'; }
      if (nade.state === 'release') { nade.state = 'thrown'; nade.thrownAt = now(); fp?.throw?.(nade.strength); if (!clipStart(nade.strength === 'short' ? 'throwlow' : 'throw')) sounds.toss(null, current.id);   /* (one throw sound: CS2's clip, else its event / a whoosh — arena-ui no longer adds its own: GD-AUD-07) */ if (canFire()) throwNade(current.id, nade.strength); else cancelNade(); }
      // After the throw (the arm follows through): another of the same grenade comes up, else back to your last weapon.
      if (nade.state === 'thrown' && now() - nade.thrownAt > 450) { const own = arsenal(); if (own.includes(current.id)) { nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; drawAt = now(); drawMs = DRAW_MS[current.id] || 500; setView(current.id, true); } else return this.equip(this.fallback()); }
      if (rescope && now() >= rescope.at) { if (current?.id === rescope.id && !reloading() && (rescope.manual || autoRescope())) { scope = rescope.level; sounds.scope(); } rescope = null; }
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
