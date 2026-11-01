// Spectating in first person (CS2 "in-eye"): the watched team mate's own first-person view model — their weapon in
// CS2's first-person set (their chosen knife, their skin), held, drawn when they switch, kicking on each of their shots,
// reloading when they reload and throwing when they throw — drawn on top of the world under the camera, as your own is.
//
// The CS2 sets are single objects (fp-view.js fpFor: one rig per set, shared with your own view model). While you are
// dead your own view model is hidden and not animated (lab.js), so this view borrows the set: its root goes under this
// view's own group, held for their weapon. When you respawn your own view takes it back (weapons.js hideView(false) →
// setView: held again for your weapon, your skin, your side's arms). Should your own view take a set back while this one
// shows it (a set that loads late, a knife choice), this view takes it back next frame and holds it again.
//
// Everything here runs on events (a switch, a shot, a reload): per frame it only checks numbers and animates the set —
// no allocations, no new materials (the same sets and materials the warm-up compiled for your own view).
import * as THREE from './three.module.js';
import { fpFor, wantFP, hasFP } from './fp-view.js';
import { weaponModel, VIEW, VIEW_ROT, knifeFor } from './weapon-models.js';
import { DRAW_MS, VIEWMODEL } from './weapons.js';
import { weaponById } from './weapons-data.js';
import { applySkin } from './skin-render.js';
import { live } from './live-settings.js';

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const GUN_KINDS = new Set(['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'lmg']);
// The view model on top of the world (as weapons.js onTop: the nearest 1 % of the depth range while its meshes draw).
const vmNear = r => r.getContext().depthRange(0, .01), vmFar = r => r.getContext().depthRange(0, 1);
const onTopMesh = o => { if (o.isMesh || o.isSkinnedMesh) { o.onBeforeRender = vmNear; o.onAfterRender = vmFar; o.frustumCulled = false; o.castShadow = false; } };
// A CS2 star knife's own finish shows with no skin on only on the karambit (weapons.js ownTint).
const ownTint = () => false;   // (v52: every knife plain CS2 steel with no skin on, the karambit too — weapons.js)

export function createSpectateView({ camera, scene }) {
  const hand = new THREE.Group(), view = new THREE.Group(); hand.name = 'spectate-hand'; view.name = 'spectate-view'; hand.add(view); hand.visible = false;
  let who = null, weapon = null, model = null, team = null, set = null, plain = null, skinSeen = null, skinAt = 0;
  let knifeSeen = null, shotN = null, reloadN = null, reloadUntil = 0, actSeen = 0, holds = 0, fires = 0, reloads = 0, throws = 0;
  const now = () => performance.now();
  const fit = () => { const vf = set?.vfov || VIEWMODEL.fov, k = vf > 0 && camera.fov > vf ? Math.tan(camera.fov * Math.PI / 360) / Math.tan(vf * Math.PI / 360) : 1; hand.scale.set(live.leftHand ? -k : k, k, 1); };
  function drop() { if (set && set.root.parent === view) view.remove(set.root); if (plain) { plain.removeFromParent(); plain = null; } set = null; }
  // Hold `id` for the watched player (draw: they switched to it — CS2 shows the draw; a new target: shown held at once).
  function hold(t, draw) {
    drop(); weapon = t.weapon; team = t.team; model = null; if (!weapon) return;
    const want = knifeFor(weapon, team, t.knife || null, true); wantFP(want);
    const kf = want !== weapon && want !== knifeFor(weapon, team) && !hasFP(want) ? knifeFor(weapon, team) : want, f = fpFor(weapon, kf);
    model = kf; skinSeen = t.skin || null; skinAt = now();
    if (f) { set = f; view.add(f.root); f.root.traverse(onTopMesh); f.hold(weapon, { draw, drawMs: DRAW_MS[weapon], model: kf, team }); if (f.weaponMats) applySkin(f.weaponMats, skinSeen, ownTint(kf)); }
    else { const [x, y, z, sc] = VIEW[weapon] || VIEW.pistol, m = weaponModel(knifeFor(weapon, team), sc); for (const [ax, r] of VIEW_ROT[weapon] || VIEW_ROT[weaponById(weapon)?.model] || []) m.rotateOnWorldAxis(AXES[ax], r);
      plain = new THREE.Group(); plain.add(m); plain.position.set(x, y, z); plain.rotation.y = .04; plain.traverse(onTopMesh); view.add(plain); }
    holds++;
  }
  const api = {
    get shown() { return hand.visible && !!(set || plain); }, get weapon() { return hand.visible ? weapon : null; }, get model() { return model; },
    get set() { return set; }, get group() { return hand; }, get stats() { return { holds, fires, reloads, throws }; },
    // Every frame while spectating. t: { key, weapon (null: empty hands), team, knife, skin, shotN, shotW, reloadN,
    // reloadW, speed, act, actUntil } (arena-spectate.js fills one reused record).
    show(t, dt) {
      if (!hand.parent) camera.add(hand); if (!camera.parent) scene?.add(camera); hand.visible = true;
      const switched = t.key === who && t.weapon !== weapon, fresh = t.key !== who;
      if (fresh || switched || (t.weapon === 'knife' && (t.knife || null) !== knifeSeen) || t.team !== team) { knifeSeen = t.knife || null; hold(t, switched); who = t.key; shotN = t.shotN; reloadN = t.reloadN; actSeen = t.actUntil || 0; reloadUntil = 0; }
      // Your own view took the set back (a late set, a knife choice): take it again, held for their weapon.
      else if (set && set.root.parent !== view) hold(t, false);
      if (!set && !plain) { shotN = t.shotN; reloadN = t.reloadN; return; }
      const w = weaponById(weapon), T = now();
      // Their shot (the newest shot number moved on, fired from this gun): the set's own fire clip — the kick.
      if (t.shotN !== shotN) { if (shotN !== null && set && (!t.shotW || t.shotW === weapon) && GUN_KINDS.has(w?.kind)) { if (T >= reloadUntil) set.fire?.(); else { set.stopReload?.(); set.fire?.(); reloadUntil = 0; } fires++; } shotN = t.shotN; }
      // Their reload (the reload number moved on for this gun; a shotgun numbers every shell: one reload is one reload).
      if (t.reloadN !== reloadN) { if (reloadN !== null && set && (!t.reloadW || t.reloadW === weapon) && GUN_KINDS.has(w?.kind) && T >= reloadUntil) { const ms = w.reloadMs || 2000; set.reload?.(ms); reloadUntil = T + ms; reloads++; } reloadN = t.reloadN; }
      // Their grenade throw (multiplayer.js marks the thrower's model): the set's own throw clip.
      if (t.act === 'throw' && t.actUntil && t.actUntil !== actSeen && w?.kind === 'nade') { actSeen = t.actUntil; set?.throw?.('long'); throws++; }
      // Their skin changed (the menu, between rounds): shown at once, as your own.
      if (set?.weaponMats && T - skinAt > 400) { skinAt = T; if ((t.skin || null) !== skinSeen) { skinSeen = t.skin || null; applySkin(set.weaponMats, skinSeen, ownTint(model)); } }
      fit(); set?.update?.(dt, t.speed || 0);
    },
    // Stop showing it (respawned, nobody to watch, out of the match). Returns true when it held a set (your own view then
    // takes it back: weapons.js hideView(false)).
    hide() { const had = !!set; drop(); hand.visible = false; who = null; weapon = null; model = null; shotN = reloadN = null; reloadUntil = 0; return had; },
  };
  return api;
}
