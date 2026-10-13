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
import { weaponById, EYE, BODY_R, BODY_H, HEAD_Y, zoneAt, HIT_GROUPS, isFirearm, sprayAt, moveInaccuracy, pelletPattern, KNIFE, fullAmmo, THROW, RECOIL } from './weapons-data.js';
import { loadSounds, reloadSound } from './sound-bank.js';
import { loadFP, fpFor } from './fp-view.js';
import { weaponModel, loadRealWeapons, MUZZLE, VIEW, VIEW_ROT } from './weapon-models.js';
import { rayBoxes, bulletPath } from './arena-maps.js';

// Draw (deploy) time, CS2-like: it swings up from below; no shooting until it's up.
const DRAW_BY_KIND = { pistol: 600, smg: 750, rifle: 900, sniper: 1050, shotgun: 850, lmg: 1100, knife: 450, nade: 500, bomb: 600 };
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
export const sounds = { draw: (at, id) => { const w = weaponById(id); if (w?.kind === 'knife') tick(1800, .07, .1, 'sawtooth', at); else if (w?.kind === 'nade') tick(2600, .03, .1, 'square', at); else reloadSound(2, id, at) || tick(900, .05, .2, 'square', at); }, slash: (at, heavy = false) => { tick(heavy ? 220 : 300, heavy ? .18 : .12, .25, 'sawtooth', at); setTimeout(() => tick(heavy ? 140 : 180, .08, .15, 'sawtooth', at), 40); }, dry: at => tick(2400, .04, .18, 'square', at), scope: () => tick(3200, .025, .12, 'square'), pin: at => { tick(2900, .03, .14, 'square', at); setTimeout(() => tick(1900, .04, .1, 'triangle', at), 90); }, magOut: (at, id) => reloadSound(0, id, at) || tick(420, .09, .3, 'triangle', at), magIn: (at, id) => reloadSound(1, id, at) || tick(620, .07, .35, 'triangle', at), bolt: (at, id) => reloadSound(2, id, at) || (tick(900, .05, .3, 'square', at), setTimeout(() => tick(1300, .04, .25, 'square', at), 70)) };

// Options: scene, camera, effects (fun-pistol), arsenal() ids, targets() [{ id, feet, crouched }], report(hit),
// canFire(), blind() 0…1 (flashed), aim() { pitch, yaw }, boxes() map boxes, move() { speed, max, onGround, landedAgo, ducked },
// throwNade(id, strength), moveSpeed(), host() { ammo: { id: [mag, res] }, shots: { n, r, pending } } (mine).
const PIVOT = new THREE.Vector3(), pivR = new THREE.Quaternion(), pivE = new THREE.Euler(), pivA = new THREE.Vector3(), pivB = new THREE.Vector3();
export function createWeapons({ scene, camera, effects, arsenal, targets, report, canFire, blind = () => 0, aim = () => ({ pitch: 0, yaw: 0 }), boxes = () => [], move = () => ({ speed: 0, max: 1, onGround: true, landedAgo: 9 }), throwNade = () => {}, moveSpeed = () => 0, host = () => null, autoRescope = () => true, planting = () => false }) {
  let current = null, view = null, lastShot = 0, kick = 0, heldLeft = false, reloadUntil = 0, reloadId = null, lastDry = 0;
  // Shot and reload numbers start somewhere random each session, so a host that saw an older session re-syncs.
  let shots = 1e6 + Math.floor(Math.random() * 4e8), reloads = 1000 + Math.floor(Math.random() * 1e6);
  let inspecting = null, idleT = 0, plantE = 0, rescope = null, lastEnds = null, ri = 0, scope = 0, knife = null, nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }, punch = { pitch: 0, yaw: 0 }, shake = { pitch: 0, yaw: 0 };
  const ammo = new Map(), origin = new THREE.Vector3(), muzzle = new THREE.Vector3(), base = new THREE.Vector3(), tmpD = new THREE.Vector3();
  const now = () => performance.now(), w = () => current, fire_ = () => current && isFirearm(current);
  const left = id => (ammo.get(id) || fullAmmo(id) || [0, 0]);
  const reloading = () => now() < reloadUntil;
  loadSounds();
  let fp = null;
  loadFP().then(() => { if (current && fpFor(current.id)) setView(current.id); });
  loadRealWeapons().then(n => { if (n && current) setView(current.id); });
  let drawAt = 0, drawMs = 1;
  // The view model is drawn on top of the world, like CS2: while its meshes draw, their depth goes into the nearest
  // 1 % of the depth range (gl.depthRange), so the gun is always in front of every wall (a wall you stand against
  // never cuts into it) while the world's own depth stays intact (walls still hide smoke, fire, decals and glows behind
  // them). Same materials and shaders as everywhere else: nothing new to compile when a weapon first appears.
  const vmNear = r => r.getContext().depthRange(0, .01), vmFar = r => r.getContext().depthRange(0, 1);
  const onTop = g => g.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.onBeforeRender = vmNear; o.onAfterRender = vmFar; o.frustumCulled = false; o.castShadow = false; } });
  function setView(id, draw = false) {
    if (view) { camera.remove(view); view = null; }
    if (draw && id) { drawAt = now(); drawMs = DRAW_MS[id]; sounds.draw(null, id); }
    fp = null; if (!id) return;
    const f = fpFor(id); if (f) { fp = f; view = new THREE.Group(); view.userData.base = [0, 0, 0]; view.add(f.root); f.hold(id, { draw, drawMs: DRAW_MS[id] }); onTop(view); camera.add(view); if (!camera.parent) scene.add(camera); return; }
    const [x, y, z, sc] = VIEW[id] || VIEW.pistol; const m = weaponModel(id, sc); for (const [ax, r] of VIEW_ROT[id] || VIEW_ROT[weaponById(id)?.model] || []) m.rotateOnWorldAxis(AXES[ax], r);
    view = new THREE.Group(); view.add(m); view.position.set(x, y, z); view.rotation.y = .04; view.userData.base = [x, y, z]; onTop(view); camera.add(view);
    if (!camera.parent) scene.add(camera);
  }
  // Reloads, as CS2: the rounds count only once the new magazine is seated (MAG_IN of the way through); switching
  // weapons before that cancels the reload and the gun keeps the magazine it had. After it, the reload stands.
  const MAG_IN = .75; let magInAt = 0, magIn = false;
  function stopReload() { reloadUntil = 0; reloadId = null; magIn = false; }
  function seatMag() { const id = reloadId, wpn = weaponById(id); if (!wpn || magIn) return; magIn = true; const [mag, res] = left(id), move = Math.min(wpn.mag - mag, res); ammo.set(id, [mag + move, res - move]); reloads++; }
  let prevWeapon = null;
  function equip(id) { const was = current?.id; { const k = weaponById(id)?.kind, wk = weaponById(was)?.kind; if ((k === 'nade' || k === 'bomb') && wk && wk !== 'nade' && wk !== 'bomb') prevWeapon = was; } current = id ? weaponById(id) : null; if (current?.id !== was) { setView(current?.id, true); inspecting = null; fp?.twirl?.(0); scope = 0; ri = 0; rescope = null; stopReload(); knife = null; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; } heldLeft = false; return current; }
  function cycle() { const own = arsenal(); if (!own.length) return null; const i = current ? own.indexOf(current.id) : -1; return equip(i + 1 < own.length ? own[i + 1] : null); }
  // R: reload (time per gun). Rounds move from the reserve at the end; never more than the reserve has.
  function reload() { inspecting = null;
    if (!fire_() || reloading()) return false; const id = current.id, [mag, res] = left(id); if (mag >= current.mag || res <= 0) return false;
    reloadUntil = now() + current.reloadMs; reloadId = id; magIn = false; magInAt = now() + current.reloadMs * MAG_IN; heldLeft = false; scope = 0; sounds.magOut(null, id); fp?.reload(current.reloadMs);
    setTimeout(() => { if (reloadId === id && current?.id === id) sounds.magIn(null, id); }, current.reloadMs * (MAG_IN - .03));
    return true;
  }
  function finishReload() { const id = reloadId; if (!weaponById(id)) { stopReload(); return; } seatMag(); reloadId = null; reloadUntil = 0; magIn = false; setTimeout(() => current?.id === id && sounds.bolt(null, id), 120); }
  // Knife: left = quick slash, right = slow heavy stab. The hit is decided at the moment the blade arrives (hitMs),
  // along your aim, within reach, not through walls.
  function attack(kind) {
    const K = KNIFE[kind]; if (knife && now() < knife.until) return false; if (now() - drawAt < drawMs) return false;
    inspecting = null; knife = { kind, start: now(), hitAt: now() + K.hitMs, until: now() + K.rateMs, done: false }; lastShot = now(); sounds.slash(null, kind === 'heavy'); fp?.fire(); return true;
  }
  function knifeHit() {
    const K = KNIFE[knife.kind], a = aim(), d = dirFor(a.pitch, a.yaw, tmpD), o = camera.getWorldPosition(origin), wall = rayBoxes(boxes(), o.x, o.y, o.z, d.x, d.y, d.z, 40);
    let best = null; for (const tgt of targets()) { const t = rayCapsule(o, d, tgt.feet, tgt.crouched ? BODY_H * .7 : BODY_H); if (t !== null && t <= K.range && t < wall && (!best || t < best.t)) best = { t, tgt }; }
    // A little aim assist for the knife: a body just beside the crosshair still counts (CS2's swing is wide).
    if (!best) for (const tgt of targets()) { const c = tgt.feet.clone().setY(tgt.feet.y + 6), to = c.clone().sub(o), dist = to.length(); if (dist < K.range + 1.5 && to.normalize().dot(d) > .93 && dist < wall && (!best || dist < best.t)) best = { t: dist, tgt }; }
    if (best) report({ type: 'hit', target: best.tgt.id, weapon: current.id, attack: knife.kind, zone: zoneAt(o.y + d.y * best.t - best.tgt.feet.y) === 'head' ? 'head' : 'chest' });
  }
  // Grenades: press = pull the pin (and hold); release = throw. Left alone: long throw; right alone: short underhand;
  // both: medium. One throw per grenade; nothing after death.
  // Grenade state machine, as CS2 (THROW in weapons-data.js): idle → priming (the pin comes out, primeMs, after the
  // draw) → held (armed) → released → thrown. A click throws as soon as the pin is out; holding waits for the
  // release. The buttons held at the moment you let go pick the throw: both = medium, left = long, right = short.
  // Switching weapons, a menu or leaving the window cancels (cancelUtility).
  function nadeButton(btn, on) {
    if (on) { if (nade.state === 'thrown' || nade.state === 'release') return; nade.buttons.add(btn); if (nade.state === 'idle') { nade.state = 'priming'; nade.primedAt = Math.max(now(), drawAt + drawMs) + THROW.primeMs; nade.queued = null; sounds.pin(); fp?.fire(); } return; }
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
    if (mag <= 0) { if (now() - lastDry > 250) { lastDry = now(); sounds.dry(); } if (res > 0) reload(); return false; }
    inspecting = null; lastShot = now(); shots++; kick = 1; shake.pitch += (RECOIL.kick[current.kind] ?? .6) * D2R; shake.yaw += (Math.random() - .5) * (RECOIL.kick[current.kind] ?? .6) * .5 * D2R; ammo.set(id, [mag - 1, res]); fp?.fire();
    // The ray: from the eye along aim + spray(ri) (+ movement cone).
    const a = aim(), o = camera.getWorldPosition(origin), m = move();
    const rest = 1 - RECOIL.view; dirFor(a.pitch + punch.pitch * rest, a.yaw - punch.yaw * rest, base);   // the camera shows RECOIL.view of the spray; the bullet goes all the way
    const cone = moveInaccuracy(current, { ...m, scoped: scope > 0 }), dirs = (current.pellets ? pelletPattern(current) : [[0, 0]]).map(([pp, py]) => { const r = cone * Math.sqrt(Math.random()), t = Math.random() * Math.PI * 2; return offset(base, pp + r * Math.sin(t), py + r * Math.cos(t)); });
    view?.updateMatrixWorld(); muzzle.set(...(MUZZLE[id] || MUZZLE.pistol)); if (fp && view) fp.muzzle(muzzle); else if (view) muzzle.applyMatrix4(view.matrixWorld); else muzzle.copy(o);
    const bx = boxes(), hits = new Map(), ends = [];
    for (const d of dirs) {
      // Through crates and thin walls (wallbang) as far as the gun's penetration allows; then the floor or the first solid wall.
      const path = bulletPath(bx, o.x, o.y, o.z, d.x, d.y, d.z, 2000, current.pen || 0), wallT = Math.min(path.stop, d.y < -1e-6 ? -o.y / d.y : Infinity, !bx.length && effects.hitPoint ? effects.hitPoint(o, d).point.distanceTo(o) : Infinity);
      let best = null; for (const tgt of targets()) { const t = rayCapsule(o, d, tgt.feet, tgt.crouched ? BODY_H * .7 : BODY_H); if (t !== null && t < wallT && t <= current.range && (!best || t < best.t)) best = { t, tgt }; }
      const end = Math.min(best ? best.t : wallT, 400);
      for (const c of path.crossed) if (c.t0 < end) ends.push({ point: o.clone().addScaledVector(d, c.t0), normal: d.clone().negate(), mark: true });   // entry holes in what it went through
      ends.push({ point: o.clone().addScaledVector(d, end), normal: best ? null : d.clone().negate(), flesh: !!best });
      if (!best) continue; const y = (o.y + d.y * best.t - best.tgt.feet.y) / (best.tgt.crouched ? .7 : 1), h = hits.get(best.tgt.id) || { pellets: 0 }, z = zoneAt(y);
      h.pellets++; if (!h.zone || HIT_GROUPS[z] > HIT_GROUPS[h.zone]) h.zone = z; hits.set(best.tgt.id, h);
    }
    lastEnds = { origin: o.clone(), dir: base.clone(), ends, muzzle: muzzle.clone(), cone };   // (tests: where the shot went)
    effects.shootAt ? effects.shootAt(muzzle, ends, shotFx(current)) : effects.shoot(muzzle, base.clone(), { ...shotFx(current), dirs });
    const how = { noscope: !!current.zoom && !(scope > 0), air: !m.onGround, blind: blind() > .5 };   // for the kill feed (CS2 marks)
    for (const [target, h] of hits) report({ type: 'hit', target, weapon: id, pellets: h.pellets, zone: h.zone, head: h.zone === 'head', n: shots, ...how });
    ri = Math.min(ri + 1, (current.pattern?.length || 1) + 2);
    // Bolt-action rifles: the scope drops at once for the bolt; it comes back after the bolt if Auto re-scope is on (Settings).
    if (current.mode === 'bolt') { if (scope) rescope = { id, level: scope, at: now() + current.rateMs * .9, manual: false }; scope = 0; setTimeout(() => current?.id === id && sounds.bolt(null, id), current.rateMs * .4); }
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
    inspect() { if (!current || (knife && now() < knife.until) || reloading() || scope || now() - drawAt < drawMs || (current.kind === 'nade' && nade.state !== 'idle')) return false; inspecting = { start: now(), ms: current.kind === 'knife' ? 2400 : current.kind === 'bomb' ? 1400 : 2000 }; return true; },
    get inspecting() { return !!inspecting; },
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
    update(dt) {
      { const k = Math.exp(-dt * RECOIL.kickBack); shake.pitch *= k; shake.yaw *= k; }
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
      if (nade.state === 'release') { nade.state = 'thrown'; nade.thrownAt = now(); if (canFire()) throwNade(current.id, nade.strength); else cancelNade(); }
      // After the throw (the arm follows through): another of the same grenade comes up, else back to your last weapon.
      if (nade.state === 'thrown' && now() - nade.thrownAt > 450) { const own = arsenal(); if (own.includes(current.id)) { nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; drawAt = now(); drawMs = DRAW_MS[current.id] || 500; setView(current.id, true); } else return this.equip(this.fallback()); }
      if (rescope && now() >= rescope.at) { if (current?.id === rescope.id && !reloading() && (rescope.manual || autoRescope())) { scope = rescope.level; sounds.scope(); } rescope = null; }
      kick = Math.max(0, kick - dt * (current.auto ? 14 : 7));
      if (!view) return;
      const [x, y0, z] = view.userData.base, k = current.kind === 'pistol' ? 1 : current.kind === 'sniper' || current.kind === 'shotgun' ? 1.4 : .5;
      const d = 1 - Math.min(1, (now() - drawAt) / drawMs), dr = d * d * (3 - 2 * d), spin = current.kind === 'knife' ? (current.id === 'karambit' ? Math.PI * 2 : Math.PI) * d * d : 0;
      // The arms pack animates reloads itself; the plain model (no arms) dips instead.
      const rl = reloading() && !fp ? Math.sin(Math.min(1, 1 - (reloadUntil - now()) / current.reloadMs) * Math.PI) : 0;
      // Knife swings: light = a fast sweep right→left; heavy = draw back, then a stab forward.
      let kx = 0, ky = 0, kz = 0, rx = 0, ry = 0, rz = 0;
      if (knife) { const K = KNIFE[knife.kind], t = Math.min(1, (now() - knife.start) / K.rateMs);
        if (knife.kind === 'light') { const s = Math.sin(Math.min(1, t * 2.2) * Math.PI); kx = -s * .22; ky = s * .06; kz = -s * .08; rz = s * .45; ry = s * .28; }   // a quick diagonal swipe that stays in the lower right
        else { const ss = v => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v), back = ss(t / .26) * (1 - ss((t - .26) / .1)), stab = ss((t - .26) / .14) * (1 - ss((t - .55) / .45));   /* wind up back and to the right, then a hard stab forward toward the centre */
          kz = back * .1 - stab * .36; kx = back * .05 - stab * .13; ky = back * .05 + stab * .05; rx = back * .2 - stab * .15; rz = -back * .15 + stab * .15; } }
      // Grenade held: raised back over the shoulder (long) or low (short) while the pin is out.
      let ny = 0, nz = 0, nr = 0; const N = nade.state; if (current.kind === 'nade' && (N === 'priming' || N === 'held')) { const s = this.nade?.strength; ny = s === 'short' ? -.12 : .05; nz = s === 'short' ? -.04 : .1; nr = s === 'short' ? .12 : -.18; }
      // Knife idle: a slow breathing sway (the packs' idle clip barely moves a one-handed fist).
      idleT += dt; if (current.kind === 'knife' && !knife) { kx += Math.sin(idleT * 1.1) * .006; ky += Math.sin(idleT * 2.2) * .004; rz += Math.sin(idleT * 1.1) * .02; }
      // Inspect: raise and turn the hand to show the weapon's side, hold, turn back; the karambit spins round the ring.
      if (inspecting) { const t = (now() - inspecting.start) / inspecting.ms; if (t >= 1) { inspecting = null; fp?.twirl?.(0); } else { const ss = v => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v), e = ss(t / .22) * (1 - ss((t - .78) / .22));
        if (current.kind === 'knife') { ky += e * .06; kx -= e * .07; ry -= e * .35; rz += e * .35; rx -= e * .12; if (current.id === 'karambit') fp?.twirl?.(Math.PI * 2 * ss((t - .34) / .3)); }
        else if (current.kind === 'bomb') { ky += e * .05; ry -= e * .25; rz += e * .15; }
        else { ky += e * .04; kx -= e * .05; ry -= e * .3; rz += e * .35; rx -= e * .08; } } }
      // Bolt-action rifles (AWP, SSG 08): after each shot the rifle rolls to show the bolt — up, back, forward, down —
      // and settles exactly when the next shot is ready, so you can read when you can fire again (CS2).
      if (current.mode === 'bolt' && lastShot && now() - lastShot < current.rateMs) { const t = (now() - lastShot) / current.rateMs, ss = v => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v), up = ss((t - .1) / .18) * (1 - ss((t - .7) / .25)), pull = Math.sin(Math.max(0, Math.min(1, (t - .3) / .34)) * Math.PI);
        rz += up * .62; ry += up * .16; ky += up * .09; kx -= up * .04; kz += pull * .15; rx += pull * .12; }
      // Planting: the bomb is lowered to the ground in front of you while the plant runs.
      plantE += ((current.kind === 'bomb' && planting() ? 1 : 0) - plantE) * Math.min(1, dt * 7); if (plantE > .001) { ky -= plantE * .22; kz -= plantE * .12; kx -= plantE * .1; rx -= plantE * .7; }
      view.position.set(x + kx, y0 + kick * .05 * k - rl * .35 - dr * .55 + ky + ny, z + kick * .22 * k + dr * .15 + kz + nz);
      view.rotation.set(kick * .35 * k - rl * .6 - dr * .9 + rx + nr, .04 + ry, rl * .4 + dr * .35 + spin + rz);
      // Swings, inspect and planting turn round the hand (not the eye), so the weapon twists in place on screen.
      if (fp && (rx || ry || rz)) { fp.handIn(view, PIVOT); pivR.setFromEuler(pivE.set(rx, ry, rz)); view.position.add(pivA.copy(PIVOT).sub(pivB.copy(PIVOT).applyQuaternion(pivR))); }
      if (scope && view) view.visible = false;
    }
  };
}
export const feetOf = pose => new THREE.Vector3(pose.x, Math.max(0, pose.y - (pose.crouched ? 5.9 : EYE)), pose.z);
