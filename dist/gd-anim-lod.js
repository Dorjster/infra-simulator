// Global Defensive: how often a remote player's CS2 agent is animated (multiplayer.js, every frame per body). A weak
// Windows laptop is CPU-bound in a 10-player fight (package W: an i5-11th-gen's main thread ≈ 2.5× an M3's), and each
// agent's mixer blends ~80 clips over ~90 bones. In view and within 160 units (≈ 1 000 HU, most fights): every frame —
// their legs at 30 fps read as stutter at mid range (v49). Farther, or out of view (behind you, off the screen's sides —
// they still cast their live sun shadows and are heard, so not frozen): every other frame with twice the step, as the
// far ones already were. Allocation-free: one view test per page, refreshed once per frame.
// v53 stage 6: on the Low / Very Low presets (gd-preset.js lodM 15 m) the full-rate range is 15 m (91 units: 1 unit = 16.5 cm)
// instead of 160 units — CS2's agents farther than that move every other frame with twice the step, as the far ones above.
import * as THREE from './three.module.js';
import { gdPresetNow } from './gd-preset.js';

export const NEAR_FULL = 160;
// dt to animate with this frame, 0 = not this frame. far: distance to the camera; seen: in the view frustum; skip: the
// body's own frame counter (odd / even).
export const UNITS_PER_M = 100 / 16.5;
export const nearFull = () => { const m = gdPresetNow().lodM; return m > 0 ? Math.min(NEAR_FULL, m * UNITS_PER_M) : NEAR_FULL; };
export function agentAnimDt(far, seen, skip, dt) { return far < nearFull() && seen ? dt : skip % 2 === 0 ? dt * 2 : 0; }
// The camera's view as a frustum, refreshed by frame(); seen(x, y, z) for a standing body's feet at (x, y, z): a sphere
// round its middle (72 HU tall ≈ 11 units: centre 5.5 up, radius 7 — a gun held out included).
export function createViewTest(camera) {
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sp = new THREE.Sphere(new THREE.Vector3(), 7);
  return {
    frame() { pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm); },   // (the view of the last frame drawn: a frame old at most)
    seen(x, y, z) { sp.center.set(x, y + 5.5, z); return fr.intersectsSphere(sp); },
  };
}
