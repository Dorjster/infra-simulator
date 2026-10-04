// The local engineer's guns. Key 4 draws the first owned gun and cycles through the rest (then holsters);
// left click fires, automatic guns keep firing while the button is held. Each shot is checked here against the
// other engineers' bodies (what you see is what you hit, walls block) and the hit is sent to the host, which
// re-checks it and takes the HP (combat-logic.js). Effects (tracer, flash, sound) are shared with fun-pistol.js.
import * as THREE from './three.module.js';
import { weaponById, EYE, BODY_R, BODY_H, HEAD_Y } from './weapons-data.js';
import { weaponModel, MUZZLE, VIEW } from './weapon-models.js';

const SOUND = { pistol: [.5, 1], deagle: [.6, .8], cannon: [.55, .85], smg: [.32, 1.35], shotgun: [.75, .62], ak: [.5, .95], m4: [.45, 1.05], sniper: [.85, .7], lmg: [.45, .9] };
export const shotFx = (wpn) => ({ volume: (SOUND[wpn.id] || SOUND.pistol)[0], pitch: (SOUND[wpn.id] || SOUND.pistol)[1], flashSize: wpn.kind === 'pistol' ? 1.1 : wpn.kind === 'shotgun' || wpn.kind === 'lmg' ? 1.8 : 1.5 });
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

export function createWeapons({ scene, camera, effects, arsenal, targets, report, canFire }) {
  let current = null, view = null, lastShot = 0, shots = 0, kick = 0, held = false;
  const dir = new THREE.Vector3(), muzzle = new THREE.Vector3();
  function setView(id) {
    if (view) { camera.remove(view); view = null; }
    if (!id) return; const [x, y, z, sc] = VIEW[id] || VIEW.pistol; view = weaponModel(id, sc); view.position.set(x, y, z); view.rotation.y = .04; view.userData.base = [x, y, z]; camera.add(view);
    if (!camera.parent) scene.add(camera);
  }
  function equip(id) { current = id ? weaponById(id) : null; setView(current?.id); held = false; return current; }
  // Key 4: holstered → first gun → next … → holstered.
  function cycle() { const own = arsenal(); if (!own.length) return null; const i = current ? own.indexOf(current.id) : -1; return equip(i + 1 < own.length ? own[i + 1] : null); }
  function fire() {
    if (!current || !canFire() || performance.now() - lastShot < current.rateMs) return false;
    lastShot = performance.now(); shots++; kick = 1;
    camera.getWorldDirection(dir); const origin = camera.getWorldPosition(new THREE.Vector3());
    view?.updateMatrixWorld(); muzzle.set(...(MUZZLE[current.id] || MUZZLE.pistol)); if (view) muzzle.applyMatrix4(view.matrixWorld); else muzzle.copy(origin);
    const dirs = shotDirs(dir, current); effects.shoot(muzzle, dir.clone(), { ...shotFx(current), dirs });
    // Hits: nearest engineer along each pellet, unless a wall is closer; pellets on the same engineer add up.
    const hits = new Map();
    for (const d of dirs) {
      const wall = effects.hitPoint(origin, d).point.distanceTo(origin); let best = null;
      for (const tgt of targets()) { const t = rayCapsule(origin, d, tgt.feet); if (t !== null && t < wall && t <= current.range && (!best || t < best.t)) best = { t, tgt }; }
      if (!best) continue; const y = origin.y + d.y * best.t - best.tgt.feet.y, h = hits.get(best.tgt.id) || { pellets: 0, head: false };
      h.pellets++; h.head ||= y > HEAD_Y; hits.set(best.tgt.id, h);
    }
    for (const [target, h] of hits) report({ type: 'hit', target, weapon: current.id, pellets: h.pellets, head: h.head });
    return true;
  }
  return {
    get current() { return current; }, get shots() { return shots; }, get equipped() { return !!current; },
    equip, cycle, fire, setView,
    press(on) { held = on; if (on) fire(); },
    hideView(hidden) { if (view) view.visible = !hidden; },
    update(dt) {
      if (!current) return; if (held && current.auto) fire();
      kick = Math.max(0, kick - dt * (current.auto ? 14 : 7));
      if (view) { const [x, y, z] = view.userData.base, k = current.kind === 'pistol' ? 1 : current.kind === 'sniper' || current.kind === 'shotgun' ? 1.4 : .5; view.position.set(x, y + kick * .05 * k, z + kick * .22 * k); view.rotation.x = kick * .35 * k; }
    }
  };
}
export const feetOf = pose => new THREE.Vector3(pose.x, Math.max(0, pose.y - EYE), pose.z);
