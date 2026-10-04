// Image quality, tiered by the graphics preset so every computer stays smooth.
//  · Every preset: a reflection environment (three.js RoomEnvironment, prefiltered once) so metal, chrome,
//    gold, glass and lacquer reflect light instead of looking flat. It costs nothing per frame after startup.
//  · High / Ultra (not on software rendering): real shadows from the key light, which follows the player
//    so a small shadow map stays sharp, and a soft glow (bloom) on lamps, neon and LEDs.
import * as THREE from './three.module.js';
import { RoomEnvironment } from './post/RoomEnvironment.js';
import { EffectComposer } from './post/EffectComposer.js';
import { RenderPass } from './post/RenderPass.js';
import { UnrealBloomPass } from './post/UnrealBloomPass.js';
import { OutputPass } from './post/OutputPass.js';
import { AVATAR_SHADOW } from './avatar.js';

export function createGraphics({ renderer, scene, camera, sun, preset, software = false }) {
  // Reflections.
  try { const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, .04).texture; scene.environmentIntensity = .38; room.dispose?.(); pmrem.dispose(); }
  catch (e) { console.warn('reflections unavailable:', e.message); }                                            // the game still runs without them
  // Shadows: the key light casts; its shadow box moves with the player.
  const SHADOW_BOX = 70, sunOffset = sun.position.clone(), LIGHT_DIST = 17;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_BOX; sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_BOX;
  sun.shadow.camera.near = .5; sun.shadow.camera.far = 170; sun.shadow.bias = -.0004; sun.shadow.normalBias = .04; scene.add(sun.target);
  let composer = null, bloom = null, mode = '', frame = 0; const hemi = scene.children.find(o => o.isHemisphereLight), base = { sun: sun.intensity, hemi: hemi?.intensity };
  const high = () => !software && ['High', 'Ultra'].includes(preset());
  function apply() {
    const want = high() ? preset() : 'basic'; if (want === mode) return; mode = want;
    const on = want !== 'basic';
    renderer.shadowMap.enabled = on; renderer.shadowMap.type = THREE.PCFSoftShadowMap; sun.castShadow = on;
    AVATAR_SHADOW.visible = !on;                                                                             // contact shadows only without real ones
    sun.intensity = base.sun * (on ? 1.55 : 1); if (hemi) hemi.intensity = base.hemi * (on ? .72 : 1);              // more light from the shadow-casting key on High
    sun.shadow.mapSize.setScalar(want === 'Ultra' ? 4096 : 2048); sun.shadow.map?.dispose(); sun.shadow.map = null;
    if (on && !composer) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });   // MSAA inside the composer
      composer = new EffectComposer(renderer, target); composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), .32, .45, 1.05); composer.addPass(bloom); composer.addPass(new OutputPass());
    }
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });                              // shadow / no-shadow shaders
    glow(on);
  }
  // Lamps, neon, LEDs (bright unlit colours without a texture) become HDR on High so the bloom picks them up.
  const boosted = new Set();
  function glow(on) {
    if (!on) { for (const m of boosted) m.color.multiplyScalar(1 / 2.6); boosted.clear(); return; }
    scene.traverse(o => { const m = o.material; if (!m || Array.isArray(m) || !m.isMeshBasicMaterial || m.map || boosted.has(m) || m.visible === false) return;
      const c = m.color, lum = .2126 * c.r + .7152 * c.g + .0722 * c.b; if (lum > .35) { c.multiplyScalar(2.6); boosted.add(m); } });
  }
  // Meshes cast and receive shadows (sprites, lines, glass, labels and flagged objects don't).
  function flagShadows() {
    scene.traverse(o => {
      if (!o.isMesh || o.userData.noShadow) return; const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const clear = m?.transparent || m?.visible === false || m?.isMeshBasicMaterial;
      o.receiveShadow = m?.visible !== false; o.castShadow = !clear;
    });
  }
  return {
    get post() { return !!composer && mode !== 'basic'; },
    setSize(w, h) { if (composer) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); composer.setSize(w, h); composer.setPixelRatio?.(renderer.getPixelRatio()); bloom?.resolution.set(s.x / 2, s.y / 2); } },
    render() {
      apply(); frame++;
      if (mode !== 'basic') {
        if (frame % 120 === 1) { flagShadows(); glow(true); }
        const pr = renderer.getPixelRatio(); if (composer._pixelRatio !== pr) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); const d = renderer.getDrawingBufferSize(new THREE.Vector2()); bloom.resolution.set(d.x / 2, d.y / 2); }
        sun.target.position.set(camera.position.x, 0, camera.position.z); sun.position.copy(sun.target.position).add(sunOffset.clone().setLength(LIGHT_DIST));   // just under the ceilings, so they don't shade the rooms
        composer.render();
      } else renderer.render(scene, camera);
    }
  };
}
