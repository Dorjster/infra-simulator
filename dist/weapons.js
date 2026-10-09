// The local player's weapons in Global Defensive: firing, aim, spray, ammo, reloads, scopes, knife attacks and
// grenade throws, plus the first-person view model.
//
// Aim (one pipeline, so everything agrees):
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
import { weaponById, EYE, BODY_R, BODY_H, HEAD_Y, zoneAt, HIT_GROUPS, isFirearm, sprayAt, moveInaccuracy, pelletPattern, KNIFE, fullAmmo } from './weapons-data.js';
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
function tick(freq = 1800, len = .05, vol = .25, type = 'square', at = null) { try { actx = audioCtx(); const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * .4, t + len); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + len); o.connect(g).connect(outAt(actx, at)); o.start(t); o.stop(t + len + .02); } catch {} }
export function warmTicks() { try { actx = audioCtx(); } catch {} }
// `at`: where the sound happens (another player / bot); left out = your own sound. `id`: the weapon.
export const sounds = { draw: (at, id) => { const w = weaponById(id); if (w?.kind === 'knife') tick(1800, .07, .1, 'sawtooth', at); else if (w?.kind === 'nade') tick(2600, .03, .1, 'square', at); else reloadSound(2, id, at) || tick(900, .05, .2, 'square', at); }, slash: (at, heavy = false) => { tick(heavy ? 220 : 300, heavy ? .18 : .12, .25, 'sawtooth', at); setTimeout(() => tick(heavy ? 140 : 180, .08, .15, 'sawtooth', at), 40); }, dry: at => tick(2400, .04, .18, 'square', at), scope: () => tick(3200, .025, .12, 'square'), pin: at => { tick(2900, .03, .14, 'square', at); setTimeout(() => tick(1900, .04, .1, 'triangle', at), 90); }, magOut: (at, id) => reloadSound(0, id, at) || tick(420, .09, .3, 'triangle', at), magIn: (at, id) => reloadSound(1, id, at) || tick(620, .07, .35, 'triangle', at), bolt: (at, id) => reloadSound(2, id, at) || (tick(900, .05, .3, 'square', at), setTimeout(() => tick(1300, .04, .25, 'square', at), 70)) };

// Options: scene, camera, effects (fun-pistol), arsenal() ids, targets() [{ id, feet, crouched }], report(hit),
// canFire(), aim() { pitch, yaw }, boxes() map boxes, move() { speed, max, onGround, landedAgo, ducked },
// throwNade(id, strength), moveSpeed(), host() { ammo: { id: [mag, res] }, shots: { n, r, pending } } (mine).
export function createWeapons({ scene, camera, effects, arsenal, targets, report, canFire, aim = () => ({ pitch: 0, yaw: 0 }), boxes = () => [], move = () => ({ speed: 0, max: 1, onGround: true, landedAgo: 9 }), throwNade = () => {}, moveSpeed = () => 0, host = () => null }) {
  let current = null, view = null, lastShot = 0, kick = 0, heldLeft = false, reloadUntil = 0, reloadId = null, lastDry = 0;
  // Shot and reload numbers start somewhere random each session, so a host that saw an older session re-syncs.
  let shots = 1e6 + Math.floor(Math.random() * 4e8), reloads = 1000 + Math.floor(Math.random() * 1e6);
  let lastEnds = null, ri = 0, scope = 0, knife = null, nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }, punch = { pitch: 0, yaw: 0 };
  const ammo = new Map(), origin = new THREE.Vector3(), muzzle = new THREE.Vector3(), base = new THREE.Vector3(), tmpD = new THREE.Vector3();
  const now = () => performance.now(), w = () => current, fire_ = () => current && isFirearm(current);
  const left = id => (ammo.get(id) || fullAmmo(id) || [0, 0]);
  const reloading = () => now() < reloadUntil;
  loadSounds();
  let fp = null;
  loadFP().then(() => { if (current && fpFor(current.id)) setView(current.id); });
  loadRealWeapons().then(n => { if (n && current) setView(current.id); });
  let drawAt = 0, drawMs = 1;
  function setView(id, draw = false) {
    if (view) { camera.remove(view); view = null; }
    if (draw && id) { drawAt = now(); drawMs = DRAW_MS[id]; sounds.draw(null, id); }
    fp = null; if (!id) return;
    const f = fpFor(id); if (f) { fp = f; view = new THREE.Group(); view.userData.base = [0, 0, 0]; view.add(f.root); f.hold(id, { draw, drawMs: DRAW_MS[id] }); camera.add(view); if (!camera.parent) scene.add(camera); return; }
    const [x, y, z, sc] = VIEW[id] || VIEW.pistol; const m = weaponModel(id, sc); for (const [ax, r] of VIEW_ROT[id] || VIEW_ROT[weaponById(id)?.model] || []) m.rotateOnWorldAxis(AXES[ax], r);
    view = new THREE.Group(); view.add(m); view.position.set(x, y, z); view.rotation.y = .04; view.userData.base = [x, y, z]; camera.add(view);
    if (!camera.parent) scene.add(camera);
  }
  function stopReload() { reloadUntil = 0; reloadId = null; }
  function equip(id) { const was = current?.id; current = id ? weaponById(id) : null; if (current?.id !== was) { setView(current?.id, true); scope = 0; ri = 0; stopReload(); knife = null; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; } heldLeft = false; return current; }
  function cycle() { const own = arsenal(); if (!own.length) return null; const i = current ? own.indexOf(current.id) : -1; return equip(i + 1 < own.length ? own[i + 1] : null); }
  // R: reload (time per gun). Rounds move from the reserve at the end; never more than the reserve has.
  function reload() {
    if (!fire_() || reloading()) return false; const id = current.id, [mag, res] = left(id); if (mag >= current.mag || res <= 0) return false;
    reloadUntil = now() + current.reloadMs; reloadId = id; heldLeft = false; scope = 0; reloads++; sounds.magOut(null, id); fp?.reload(current.reloadMs);
    setTimeout(() => sounds.magIn(null, id), current.reloadMs * .7);
    return true;
  }
  function finishReload() { const id = reloadId, wpn = weaponById(id); reloadId = null; reloadUntil = 0; if (!wpn) return; const [mag, res] = left(id), move = Math.min(wpn.mag - mag, res); ammo.set(id, [mag + move, res - move]); setTimeout(() => current?.id === id && sounds.bolt(null, id), 120); }
  // Knife: left = quick slash, right = slow heavy stab. The hit is decided at the moment the blade arrives (hitMs),
  // along your aim, within reach, not through walls.
  function attack(kind) {
    const K = KNIFE[kind]; if (knife && now() < knife.until) return false; if (now() - drawAt < drawMs) return false;
    knife = { kind, start: now(), hitAt: now() + K.hitMs, until: now() + K.rateMs, done: false }; lastShot = now(); sounds.slash(null, kind === 'heavy'); fp?.fire(); return true;
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
  function nadeButton(btn, on) {
    if (on) { if (nade.state === 'thrown' || now() - drawAt < drawMs) return; nade.buttons.add(btn); if (nade.state === 'idle') { nade.state = 'priming'; nade.primedAt = now() + 250; sounds.pin(); fp?.fire(); } nade.both = nade.buttons.size > 1; return; }
    if (!nade.buttons.has(btn)) return; const both = nade.buttons.size > 1 || nade.both, only = [...nade.buttons][0]; nade.buttons.delete(btn);
    if (nade.state !== 'priming' && nade.state !== 'held') return;
    nade.strength = both ? 'medium' : only === 0 ? 'long' : 'short'; nade.state = 'release';
  }
  function fire() {
    if (!current || !canFire() || reloading() || now() - drawAt < drawMs) return false;
    if (current.kind === 'knife') return attack('light');
    if (current.kind === 'bomb' || current.kind === 'nade') return false;   // planting: lab → arena-ui.plant · grenades: nadeButton
    if (now() - lastShot < current.rateMs) return false;
    const id = current.id, [mag, res] = left(id);
    if (mag <= 0) { if (now() - lastDry > 250) { lastDry = now(); sounds.dry(); } if (res > 0) reload(); return false; }
    lastShot = now(); shots++; kick = 1; ammo.set(id, [mag - 1, res]); fp?.fire();
    // The ray: from the eye along aim + spray(ri) (+ movement cone).
    const a = aim(), [sp, sy] = sprayAt(current, ri), o = camera.getWorldPosition(origin), m = move();
    dirFor(a.pitch + sp * D2R, a.yaw - sy * D2R, base);
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
    for (const [target, h] of hits) report({ type: 'hit', target, weapon: id, pellets: h.pellets, zone: h.zone, head: h.zone === 'head', n: shots });
    ri = Math.min(ri + 1, (current.pattern?.length || 1) + 2);
    if (mag - 1 <= 0 && res > 0 && !current.auto) setTimeout(() => { if (current?.id === id && left(id)[0] === 0) reload(); }, current.rateMs);
    return true;
  }
  return {
    get current() { return current; }, get shots() { return shots; }, get reloads() { return reloads; }, get equipped() { return !!current; },
    get ammo() { return current ? left(current.id)[0] : 0; }, get reserve() { return current ? left(current.id)[1] : 0; }, ammoOf: id => left(id), get reloading() { return reloading(); },
    get reloadLeft() { return reloading() ? (reloadUntil - now()) / current.reloadMs : 0; },
    get punch() { return punch; }, get lastShot() { return lastEnds; }, get scope() { return scope; }, get scopeFov() { return scope && current?.zoom ? current.zoom[scope - 1] : 0; },
    get nade() { return current?.kind === 'nade' ? { state: nade.state, strength: nade.buttons.size > 1 || nade.both ? 'medium' : nade.buttons.has(2) ? 'short' : 'long' } : null; },
    get knife() { return knife; }, get drawing() { return now() - drawAt < drawMs; },
    equip, cycle, fire, reload, setView,
    // Mouse buttons (0 left, 2 right) while playing.
    button(btn, on) {
      if (!current) return;
      if (current.kind === 'nade') return nadeButton(btn, on);
      if (btn === 0) { heldLeft = on; if (on) fire(); return; }
      if (btn === 2 && on) { if (current.kind === 'knife') { if (canFire()) attack('heavy'); return; } if (current.zoom && !reloading()) { scope = (scope + 1) % (current.zoom.length + 1); sounds.scope(); } }
    },
    press(on) { this.button(0, on); },
    // Death, respawn, new round: no scope, no spray, no half-done throws or reloads.
    reset() { scope = 0; ri = 0; punch = { pitch: 0, yaw: 0 }; stopReload(); heldLeft = false; knife = null; nade = { state: 'idle', buttons: new Set(), primedAt: 0, both: false }; },
    unscope() { scope = 0; },
    hideView(hidden) { if (view) view.visible = !hidden; },
    // Take the host's ammo when it has seen exactly our shots and reloads (and no reload is running on either side).
    sync() { const h = host(); if (!h?.shots || reloading() || h.shots.pending) return false; if (h.shots.n !== shots || h.shots.r !== reloads) return false; let changed = false;
      for (const [id, a] of Object.entries(h.ammo || {})) { const mine = ammo.get(id); if (!mine || mine[0] !== a[0] || mine[1] !== a[1]) { ammo.set(id, [a[0], a[1]]); changed = true; } } return changed; },
    // Picked up / bought / new round: take these rounds now (the host's numbers follow).
    setAmmo(id, a) { if (a) ammo.set(id, [a[0], a[1]]); else ammo.delete(id); },
    update(dt) {
      if (!current) { punch = { pitch: 0, yaw: 0 }; return; }
      if (reloadId && !reloading()) finishReload();
      if (reloadId && current.id !== reloadId) stopReload();
      if (heldLeft && current.auto) fire();
      if (fp && view?.visible) fp.update(dt, moveSpeed());
      // Spray recovery once the trigger rests a moment.
      if (now() - lastShot > current.rateMs * 1.15) ri = Math.max(0, ri - dt * (current.recover || 10));
      const [p, y] = sprayAt(current, ri); punch = { pitch: p * D2R, yaw: y * D2R };
      if (knife && !knife.done && now() >= knife.hitAt) { knife.done = true; if (canFire()) knifeHit(); }
      if (nade.state === 'priming' && now() >= nade.primedAt) nade.state = 'held';
      if (nade.state === 'release' && now() >= nade.primedAt) { nade.state = 'thrown'; if (canFire()) throwNade(current.id, nade.strength); else nade.state = 'idle'; }
      kick = Math.max(0, kick - dt * (current.auto ? 14 : 7));
      if (!view) return;
      const [x, y0, z] = view.userData.base, k = current.kind === 'pistol' ? 1 : current.kind === 'sniper' || current.kind === 'shotgun' ? 1.4 : .5;
      const d = 1 - Math.min(1, (now() - drawAt) / drawMs), dr = d * d * (3 - 2 * d), spin = current.kind === 'knife' ? (current.id === 'karambit' ? Math.PI * 2 : Math.PI) * d * d : 0;
      // The arms pack animates reloads itself; the plain model (no arms) dips instead.
      const rl = reloading() && !fp ? Math.sin(Math.min(1, 1 - (reloadUntil - now()) / current.reloadMs) * Math.PI) : 0;
      // Knife swings: light = a fast sweep right→left; heavy = draw back, then a stab forward.
      let kx = 0, ky = 0, kz = 0, rx = 0, ry = 0, rz = 0;
      if (knife) { const K = KNIFE[knife.kind], t = Math.min(1, (now() - knife.start) / K.rateMs);
        if (knife.kind === 'light') { const s = Math.sin(Math.min(1, t * 2.2) * Math.PI); kx = -s * .5; ky = s * .12; rz = s * .9; ry = s * .5; }
        else { const back = Math.min(1, t / .26), stab = Math.max(0, Math.min(1, (t - .26) / .16)), rec = Math.max(0, (t - .55) / .45), amt = (back - stab * 1.6 + 0) * (1 - rec); kz = amt * .35 - stab * (1 - rec) * .3; rx = -stab * (1 - rec) * .5 + back * (1 - stab) * .25; ky = back * (1 - stab) * .1; } }
      // Grenade held: raised back over the shoulder (long) or low (short) while the pin is out.
      let ny = 0, nz = 0, nr = 0; const N = nade.state; if (current.kind === 'nade' && (N === 'priming' || N === 'held')) { const s = this.nade?.strength; ny = s === 'short' ? -.25 : .12; nz = s === 'short' ? -.1 : .25; nr = s === 'short' ? .2 : -.35; }
      view.position.set(x + kx, y0 + kick * .05 * k - rl * .35 - dr * .55 + ky + ny, z + kick * .22 * k + dr * .15 + kz + nz);
      view.rotation.set(kick * .35 * k - rl * .6 - dr * .9 + rx + nr, .04 + ry, rl * .4 + dr * .35 + spin + rz);
      if (scope && view) view.visible = false;
    }
  };
}
export const feetOf = pose => new THREE.Vector3(pose.x, Math.max(0, pose.y - (pose.crouched ? 5.9 : EYE)), pose.z);
