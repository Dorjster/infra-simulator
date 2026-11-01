// First / third person (key P). The game logic always keeps the camera at the engineer's eyes, so aiming,
// picking and walking are unchanged; only for drawing, the camera steps back over the right shoulder (kept
// inside the room the engineer is in) and the engineer's own avatar is shown, then it steps back in.
import * as THREE from './three.module.js';
import { createAvatar } from './avatar.js';
import { ROOM, CASINO } from './facility-layout.js';

// dress() (Global Defensive, lab.js): the character others see you as — the room's dress for you ({ key, make(), knife }: a
// CS2 agent, else the side's soldier) — so your own third-person view holds every item exactly as other players see it
// (cs2-agents.js: CS2's hold), with your skin on the gun (skinOf(id), optional) and your shots (state().shotAt). Asked twice a second, not every frame; null → the engineer avatar. inRoom(): keep the
// camera inside the facility's hall / casino (not in a Global Defensive map, which lies elsewhere: clamped there, the
// camera jumped out of the map).
export function createThirdPerson({ scene, camera, look, state, dress = null, inRoom = () => true }) {
  let on = false, model = null, lookKey = '', saved = null, dist = 0, worn = null, wornKey = null, askT = 0, skinWid, skinWorn;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3(), eye = new THREE.Vector3(), cs = { speed: 0, crouch: false, aim: false, dead: false, vx: 0, vz: 0, pitch: 0, act: null, shotAt: 0 };
  function drop() { if (model) { scene.remove(model.g); model.dispose?.(); } model = null; }
  function ensureModel(dt = 0) {
    if (dress && ((askT -= dt) <= 0 || !model)) { askT = .5; worn = dress() || null; }
    if (worn) { if (model && wornKey === worn.key) return model; const m = worn.make(); if (m) { drop(); model = m; wornKey = worn.key; lookKey = ''; model.g.userData.gd = true; scene.add(model.g); return model; } }
    if (wornKey) { drop(); wornKey = null; }
    const l = look(), k = [l.color, l.skin, l.hat, l.outfit].join();
    if (model && k === lookKey) { if (l.face !== model.style) model.setStyle(l.face); return model; }
    drop();
    lookKey = k; model = createAvatar({ ...l, name: '' }); if (model.label) model.label.visible = false; model.g.userData.gd = true; scene.add(model.g); return model;
  }
  // Keep the camera inside the hall or the casino, whichever the engineer stands in.
  function clampToRoom(p, eye) {
    const b = eye.z > ROOM.maxZ && CASINO ? CASINO : ROOM;
    p.x = Math.max(b.minX + 1, Math.min(b.maxX - 1, p.x)); p.z = Math.max(b.minZ + 1, Math.min(b.maxZ - 1, p.z)); p.y = Math.max(1.5, Math.min((b.height || 30) - 1, p.y));
  }
  return {
    get on() { return on; },
    toggle() { on = !on; if (model) model.g.visible = on; askT = 0; return on; },
    get model() { return model; },   // (tests: the body drawn for you)
    // Every frame (logic side): move the avatar to the engineer and animate it.
    update(dt) {
      if (!on) { if (model) model.g.visible = false; return; }
      const m = ensureModel(dt), st = state(); m.g.visible = true;
      m.g.position.set(camera.position.x, Number.isFinite(st.feet) ? st.feet : Math.max(0, camera.position.y - (st.crouch ? 5.9 : 9.7)), camera.position.z);   // (Global Defensive gives the feet: lab.js)
      m.g.rotation.y = st.yaw;
      if (wornKey) { const wid = st.gun ? st.weapon || null : null; m.setWeapon(wid, worn?.knife || null);
        if (wid !== skinWid || worn !== skinWorn) { skinWid = wid; skinWorn = worn; m.setSkin?.(wid && worn?.skinOf ? worn.skinOf(wid) || null : null); }   // (your skin on it, as others see it: on a switch or the dress's refresh — not every frame)
        if (Number.isFinite(st.shotAt)) cs.shotAt = st.shotAt; cs.speed = st.speed; cs.crouch = !!st.crouch; cs.aim = !!st.gun; cs.vx = st.vx || 0; cs.vz = st.vz || 0; cs.pitch = st.pitch || 0; cs.act = st.act || null; m.update(dt, cs); }   // (the dress interface multiplayer.js drives for others: the same state, so the same hold)
      else { if (st.gun) m.setWeapon?.(st.weapon || 'cannon'); m.update(dt, st); }
      dist += ((on ? 13 : 0) - dist) * Math.min(1, dt * 6);
    },
    // Around renderer.render(): step back for the picture, then return to the eyes. (No allocation per frame.)
    before() {
      if (!on || dist < .2) return; saved = eye.copy(camera.position);
      camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize();
      want.copy(saved).addScaledVector(fwd, -dist).addScaledVector(right, 2.2); want.y += 1.6; if (inRoom()) clampToRoom(want, saved);
      camera.position.copy(want); camera.updateMatrixWorld();
    },
    after() { if (saved) { camera.position.copy(saved); camera.updateMatrixWorld(); saved = null; } }
  };
}
