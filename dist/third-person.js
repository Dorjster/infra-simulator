// First / third person (key P). The game logic always keeps the camera at the engineer's eyes, so aiming,
// picking and walking are unchanged; only for drawing, the camera steps back over the right shoulder (kept
// inside the room the engineer is in) and the engineer's own avatar is shown, then it steps back in.
import * as THREE from './three.module.js';
import { createAvatar } from './avatar.js';
import { ROOM, CASINO } from './facility-layout.js';

export function createThirdPerson({ scene, camera, look, state }) {
  let on = false, model = null, lookKey = '', saved = null, dist = 0;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3();
  function ensureModel() {
    const l = look(), k = [l.color, l.skin, l.hat, l.outfit].join();
    if (model && k === lookKey) { if (l.face !== model.style) model.setStyle(l.face); return model; }
    if (model) { scene.remove(model.g); model.dispose?.(); }
    lookKey = k; model = createAvatar({ ...l, name: '' }); if (model.label) model.label.visible = false; scene.add(model.g); return model;
  }
  // Keep the camera inside the hall or the casino, whichever the engineer stands in.
  function clampToRoom(p, eye) {
    const b = eye.z > ROOM.maxZ && CASINO ? CASINO : ROOM;
    p.x = Math.max(b.minX + 1, Math.min(b.maxX - 1, p.x)); p.z = Math.max(b.minZ + 1, Math.min(b.maxZ - 1, p.z)); p.y = Math.max(1.5, Math.min((b.height || 30) - 1, p.y));
  }
  return {
    get on() { return on; },
    toggle() { on = !on; if (model) model.g.visible = on; return on; },
    // Every frame (logic side): move the avatar to the engineer and animate it.
    update(dt) {
      if (!on) { if (model) model.g.visible = false; return; }
      const m = ensureModel(), st = state(); m.g.visible = true;
      m.g.position.set(camera.position.x, Math.max(0, camera.position.y - (st.crouch ? 5.9 : 9.7)), camera.position.z);
      m.g.rotation.y = st.yaw; if (st.gun) m.setWeapon?.(st.weapon || 'cannon');
      m.update(dt, st); dist += ((on ? 13 : 0) - dist) * Math.min(1, dt * 6);
    },
    // Around renderer.render(): step back for the picture, then return to the eyes.
    before() {
      if (!on || dist < .2) return; saved = camera.position.clone();
      camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize();
      want.copy(saved).addScaledVector(fwd, -dist).addScaledVector(right, 2.2).add(new THREE.Vector3(0, 1.6, 0)); clampToRoom(want, saved);
      camera.position.copy(want); camera.updateMatrixWorld();
    },
    after() { if (saved) { camera.position.copy(saved); camera.updateMatrixWorld(); saved = null; } }
  };
}
