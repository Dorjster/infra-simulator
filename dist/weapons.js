// The local engineer's guns. Key 4 draws the first owned gun and cycles through the rest (then holsters);
// left click fires, automatic guns keep firing while the button is held. Each shot is checked here against the
// other engineers' bodies (what you see is what you hit, walls block) and the hit is sent to the host, which
// re-checks it and takes the HP (combat-logic.js). Effects (tracer, flash, sound) are shared with fun-pistol.js.
import * as THREE from './three.module.js';
import { audioCtx, outAt } from './spatial-audio.js';
import { weaponById, EYE, BODY_R, BODY_H, HEAD_Y, zoneAt, HIT_GROUPS } from './weapons-data.js';
import { loadSounds, reloadSound } from './sound-bank.js';
import { weaponModel, loadRealWeapons, MUZZLE, VIEW, VIEW_ROT } from './weapon-models.js';

// Draw (deploy) time per weapon, CS2-like: it swings up from below; no shooting until it's up.
export const DRAW_MS = { c4: 600, he: 500, flash: 500, smoke: 500, molotov: 550, knife: 450, karambit: 500, pistol: 550, deagle: 700, cannon: 550, smg: 700, shotgun: 800, ak: 850, m4: 850, sniper: 1000, lmg: 1100 };
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const SOUND = { pistol: [.5, 1], deagle: [.6, .8], cannon: [.55, .85], smg: [.32, 1.35], shotgun: [.75, .62], ak: [.5, .95], m4: [.45, 1.05], sniper: [.85, .7], lmg: [.45, .9] };
export const shotFx = (wpn) => ({ id: wpn.id, volume: (SOUND[wpn.id] || SOUND.pistol)[0], pitch: (SOUND[wpn.id] || SOUND.pistol)[1], flashSize: wpn.kind === 'pistol' ? 1.1 : wpn.kind === 'shotgun' || wpn.kind === 'lmg' ? 1.8 : 1.5 });
// Pellet directions for one shot (the shotgun fires several, everything else one), with the gun's spread.
export function shotDirs(dir, wpn, rand = Math.random) {
  const n = wpn.pellets || 1, out = [];
  for (let i = 0; i < n; i++) out.push(dir.clone().add(new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).multiplyScalar(wpn.spread * 2)).normalize());
  return out;
}
// Ray against an upright capsule (feet at `feet`, height BODY_H, radius BODY_R): distance along the ray or null.
function rayCapsule(o, d, feet) {
  const a = feet, b = feet.clone().setY(feet.y + BODY_H), ab = b.clone().sub(a), ao = o.clone().sub(a);
  const abab = ab.dot(ab), abd = ab.dot(d), abao = ab.dot(ao), A = abab - abd * abd, B = abab * ao.dot(d) - abao * abd, C = abab * ao.dot(ao) - abao * abao - BODY_R * BODY_R * abab;
  let t = null; const disc = B * B - A * C;
  if (A > 1e-9 && disc >= 0) { const t0 = (-B - Math.sqrt(disc)) / A, y = abao + t0 * abd; if (t0 > 0 && y >= 0 && y <= abab) t = t0; }
  if (t === null) for (const c of [a, b]) { const oc = o.clone().sub(c), bb = oc.dot(d), cc = oc.dot(oc) - BODY_R * BODY_R, h = bb * bb - cc; if (h >= 0) { const tt = -bb - Math.sqrt(h); if (tt > 0 && (t === null || tt < t)) t = tt; } }
  return t;
}

// Small synthesized sounds (no audio files): dry-fire click, magazine out / in, bolt.
let actx = null;
function tick(freq = 1800, len = .05, vol = .25, type = 'square', at = null) { try { actx = audioCtx(); const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * .4, t + len); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + len); o.connect(g).connect(outAt(actx, at)); o.start(t); o.stop(t + len + .02); } catch {} }
export function warmTicks() { try { actx = audioCtx(); } catch {} }
// `at`: where the sound happens (another player / bot); left out = your own sound.
export const sounds = { draw: (at, id) => { const w = weaponById(id); if (w?.kind === 'knife') tick(1800, .07, .1, 'sawtooth', at); else reloadSound(2, id, at) || tick(900, .05, .2, 'square', at); }, slash: at => { tick(300, .12, .25, 'sawtooth', at); setTimeout(() => tick(180, .08, .15, 'sawtooth', at), 40); }, dry: at => tick(2400, .04, .18, 'square', at), magOut: (at, id) => reloadSound(0, id, at) || tick(420, .09, .3, 'triangle', at), magIn: (at, id) => reloadSound(1, id, at) || tick(620, .07, .35, 'triangle', at), bolt: (at, id) => reloadSound(2, id, at) || (tick(900, .05, .3, 'square', at), setTimeout(() => tick(1300, .04, .25, 'square', at), 70)) };
// `id`: the weapon (picks the recorded reload sounds, sound-bank.js); synthesized clicks until they're loaded.

// recoil(up, side): called per shot so the game turns the camera (the aim really moves, like CS spray).
// inaccuracy(id): extra spread factor from moving / jumping (arena: CS2 rules, arena-move.js).
// throwNade(id): a grenade in hand is thrown instead of fired (the arena sends it to the host).
export function createWeapons({ scene, camera, effects, arsenal, targets, report, canFire, recoil = () => {}, inaccuracy = () => 1, throwNade = () => {} }) {
  // equip by id also accepts a knife id (arena slot 3).
  let current = null, view = null, lastShot = 0, shots = 0, kick = 0, held = false, reloadUntil = 0, burst = 0, lastDry = 0, reloads = 0;
  const ammo = new Map(), dir = new THREE.Vector3(), muzzle = new THREE.Vector3();
  const hud = (() => { try { document.body.insertAdjacentHTML('beforeend', '<div id="wp-ammo" hidden><b id="wp-name"></b><span id="wp-count"></span><i id="wp-reload"></i></div>'); const st = document.createElement('style'); st.textContent = '#wp-ammo{position:fixed;right:24px;bottom:92px;z-index:36;color:#fff;font:700 13px system-ui;text-align:right;text-shadow:0 1px 3px #000}#wp-ammo[hidden]{display:none}#wp-ammo b{display:block;font-size:12px;letter-spacing:.06em;color:#ffd36b}#wp-ammo span{font:800 30px ui-monospace,Menlo,monospace}#wp-ammo span.low{color:#ff6b6b}#wp-ammo i{display:block;font-style:normal;font-size:12px;color:#9fd8ff}'; (document.head || document.body).append?.(st); return id => document.getElementById(id); } catch { return () => null; } })();
  const left = () => current ? (ammo.has(current.id) ? ammo.get(current.id) : current.mag) : 0;
  function drawHud() { const el = hud('wp-ammo'); if (!el) return; el.hidden = !current; if (!current) return; hud('wp-name').textContent = current.name; if (current.kind === 'knife' || current.kind === 'nade') { hud('wp-count').textContent = ''; hud('wp-reload').textContent = ''; return; } const n = left(), c = hud('wp-count'); c.textContent = n + ' / ' + current.mag; c.className = n <= Math.ceil(current.mag * .2) ? 'low' : ''; hud('wp-reload').textContent = reloading() ? 'Reloading…' : n === 0 ? 'R to reload' : ''; }
  const reloading = () => performance.now() < reloadUntil;
  // The realistic models arrive a moment after start: swap the gun in hand once they do.
  loadSounds();
  loadRealWeapons().then(n => { if (n && current) setView(current.id); });
  let drawAt = 0, drawMs = 1;
  function setView(id, draw = false) {
    if (view) { camera.remove(view); view = null; }
    if (draw && id) { drawAt = performance.now(); drawMs = DRAW_MS[id] || 600; sounds.draw(null, id); }
    if (!id) return; const [x, y, z, sc] = VIEW[id] || VIEW.pistol; const m = weaponModel(id, sc); for (const [ax, r] of VIEW_ROT[id] || []) m.rotateOnWorldAxis(AXES[ax], r);   // how it's held
    view = new THREE.Group(); view.add(m); view.position.set(x, y, z); view.rotation.y = .04; view.userData.base = [x, y, z]; camera.add(view);   // kick / sway move `view`
    if (!camera.parent) scene.add(camera);
  }
  function equip(id) { const was = current?.id; current = id ? weaponById(id) : null; setView(current?.id, current?.id !== was); held = false; reloadUntil = 0; burst = 0; drawHud(); return current; }
  function cycle() { const own = arsenal(); if (!own.length) return null; const i = current ? own.indexOf(current.id) : -1; return equip(i + 1 < own.length ? own[i + 1] : null); }
  // R: swap the magazine (time depends on the gun); the rounds left in the old magazine are dropped, like CS.
  function reload() {
    if (!current || current.kind === 'knife' || current.kind === 'nade' || reloading() || left() === current.mag) return false;
    const id = current.id; reloadUntil = performance.now() + current.reloadMs; held = false; reloads++; sounds.magOut(null, id);
    setTimeout(() => { if (current?.id !== id) return; ammo.set(id, current.mag); sounds.magIn(null, id); setTimeout(() => current?.id === id && sounds.bolt(null, id), 180); drawHud(); }, current.reloadMs);
    drawHud(); return true;
  }
  // Knife: a short-range swing (no ammo, no tracer); hits the engineer in front of you within reach.
  function swing() {
    lastShot = performance.now(); shots++; kick = 1; sounds.slash();
    camera.getWorldDirection(dir); const origin = camera.getWorldPosition(new THREE.Vector3()); let best = null;
    for (const tgt of targets()) { const t = rayCapsule(origin, dir, tgt.feet); if (t !== null && t <= current.range && (!best || t < best.t)) best = { t, tgt }; }
    if (best) report({ type: 'hit', target: best.tgt.id, weapon: current.id, pellets: 1, zone: zoneAt(origin.y + dir.y * best.t - best.tgt.feet.y), head: false });
    return true;
  }
  function fire() {
    if (!current || !canFire() || reloading() || performance.now() - lastShot < current.rateMs || performance.now() - drawAt < drawMs) return false;
    if (current.kind === 'knife') return swing();
    if (current.kind === 'bomb') return false;   // planting is held (lab → arena-ui.plant)
    if (current.kind === 'nade') { lastShot = performance.now(); shots++; kick = 1; held = false; throwNade(current.id); return true; }
    if (left() <= 0) { if (performance.now() - lastDry > 250) { lastDry = performance.now(); sounds.dry(); } reload(); return false; }
    lastShot = performance.now(); shots++; kick = 1; ammo.set(current.id, left() - 1);
    camera.getWorldDirection(dir); const origin = camera.getWorldPosition(new THREE.Vector3());
    view?.updateMatrixWorld(); muzzle.set(...(MUZZLE[current.id] || MUZZLE.pistol)); if (view) muzzle.applyMatrix4(view.matrixWorld); else muzzle.copy(origin);
    // First shot is accurate; spray widens the cone (and the kick climbs) the longer you hold, like CS.
    const spread = { ...current, spread: current.spread * (1 + Math.min(burst, 8) * .35) * inaccuracy(current.id) };
    const dirs = shotDirs(dir, spread); effects.shoot(muzzle, dir.clone(), { ...shotFx(current), dirs });
    const hits = new Map();
    for (const d of dirs) {
      const wall = effects.hitPoint(origin, d).point.distanceTo(origin); let best = null;
      for (const tgt of targets()) { const t = rayCapsule(origin, d, tgt.feet); if (t !== null && t < wall && t <= current.range && (!best || t < best.t)) best = { t, tgt }; }
      if (!best) continue; const y = origin.y + d.y * best.t - best.tgt.feet.y, h = hits.get(best.tgt.id) || { pellets: 0, head: false };
      const z = zoneAt(y); h.pellets++; if (!h.zone || HIT_GROUPS[z] > HIT_GROUPS[h.zone]) h.zone = z; h.head = h.zone === 'head'; hits.set(best.tgt.id, h);
    }
    for (const [target, h] of hits) report({ type: 'hit', target, weapon: current.id, pellets: h.pellets, zone: h.zone, head: h.head });
    const [up, side] = current.recoil || [.01, .004]; recoil(up * (1 + Math.min(burst, 10) * .08), (Math.random() - .5) * 2 * side * (burst > 3 ? 1.6 : 1)); burst++;
    drawHud(); return true;
  }
  return {
    get current() { return current; }, get shots() { return shots; }, get reloads() { return reloads; }, get equipped() { return !!current; }, get ammo() { return left(); }, get reloading() { return reloading(); },
    equip, cycle, fire, reload, setView,
    press(on) { held = on; if (on) fire(); },
    hideView(hidden) { if (view) view.visible = !hidden; },
    update(dt) {
      if (!current) return; if (held && current.auto) fire();
      if (performance.now() - lastShot > current.rateMs * 2.5) burst = Math.max(0, burst - dt * 20);
      kick = Math.max(0, kick - dt * (current.auto ? 14 : 7));
      const r = reloading() ? Math.sin(Math.min(1, 1 - (reloadUntil - performance.now()) / current.reloadMs) * Math.PI) : 0;   // dip the gun while reloading
      if (view) { const [x, y, z] = view.userData.base, k = current.kind === 'pistol' ? 1 : current.kind === 'sniper' || current.kind === 'shotgun' ? 1.4 : .5; const d = 1 - Math.min(1, (performance.now() - drawAt) / drawMs), dr = d * d * (3 - 2 * d), spin = current.kind === 'knife' ? (current.id === 'karambit' ? Math.PI * 2 : Math.PI) * d * d : 0;   // drawing: from below, eased; knives twirl in
        view.position.set(x, y + kick * .05 * k - r * .35 - dr * .55, z + kick * .22 * k + dr * .15); view.rotation.x = kick * .35 * k - r * .6 - dr * .9; view.rotation.z = r * .4 + dr * .35 + spin; }
    }
  };
}
export const feetOf = pose => new THREE.Vector3(pose.x, Math.max(0, pose.y - EYE), pose.z);
