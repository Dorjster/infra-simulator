// Image quality, tiered by the graphics preset so every computer stays smooth.
//  · Every preset: a reflection environment (three.js RoomEnvironment, prefiltered once) so metal, chrome,
//    gold, glass and lacquer reflect light instead of looking flat. It costs nothing per frame after startup.
//  · Every preset: a light pool. Every surface computes every light in the scene, so instead of 12 fixed point
//    lights the scene uses 4 pooled ones that take the place of the strongest lights near the player, refreshed
//    5× a second. The count never changes, so no shader ever recompiles; lighting where you stand looks the same.
//  · High / Ultra (not on software rendering): real shadows from the key light, which follows the player
//    so a small shadow map stays sharp, and a soft glow (bloom) on lamps, neon and LEDs.
import * as THREE from './three.module.js';
import { RoomEnvironment } from './post/RoomEnvironment.js';
import { EffectComposer } from './post/EffectComposer.js';
import { RenderPass } from './post/RenderPass.js';
import { UnrealBloomPass } from './post/UnrealBloomPass.js';
import { OutputPass } from './post/OutputPass.js';
import { AVATAR_SHADOW } from './avatar.js';

export function createGraphics({ renderer, scene, camera, sun, preset, prefs = () => ({}), software = false, jobs = null }) {
  // Reflections.
  // Reflections are the costliest effect on a Retina laptop, so they follow the mode: on for Quality / Ultra,
  // off for Performance / Balanced, unless Settings → Reflections says otherwise.
  let envTexture = null;
  try { const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    envTexture = pmrem.fromScene(room, .04).texture; scene.environmentIntensity = .38; room.dispose?.(); pmrem.dispose(); }
  catch (e) { console.warn('reflections unavailable:', e.message); }                                            // the game still runs without them
  // Shadows: the key light casts; its shadow box moves with the player.
  const SHADOW_BOX = 70, sunOffset = sun.position.clone(), LIGHT_DIST = 17;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_BOX; sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_BOX;
  sun.shadow.camera.near = .5; sun.shadow.camera.far = 170; sun.shadow.bias = -.0004; sun.shadow.normalBias = .04; scene.add(sun.target);
  let composer = null, bloom = null, mode = '', frame = 0, fxOn = false; const hemi = scene.children.find(o => o.isHemisphereLight), base = { sun: sun.intensity, hemi: hemi?.intensity };
  const auto = (v, def) => v === 'on' ? true : v === 'off' ? false : def;
  const high = () => !software && auto(prefs().effects, ['High', 'Ultra'].includes(preset()));
  const reflect = () => !!envTexture && auto(prefs().reflections, ['High', 'Ultra'].includes(preset()));
  function apply() {
    const fx = high() ? (preset() === 'Ultra' ? 'Ultra' : 'High') : 'basic', want = fx + (reflect() ? '+env' : ''); if (want === mode) return; mode = want;
    const on = fx !== 'basic'; fxOn = on; scene.environment = reflect() ? envTexture : null;
    renderer.shadowMap.enabled = on; renderer.shadowMap.type = THREE.PCFSoftShadowMap; sun.castShadow = on;
    AVATAR_SHADOW.visible = !on;                                                                             // contact shadows only without real ones
    sun.intensity = base.sun * (on ? 1.55 : 1); if (hemi) hemi.intensity = base.hemi * (on ? .72 : 1);              // more light from the shadow-casting key on High
    sun.shadow.mapSize.setScalar(fx === 'Ultra' ? 2048 : 1024); sun.shadow.map?.dispose(); sun.shadow.map = null;
    if (on) flagShadows();   // first time at once; the job keeps it current
    if (on && !composer) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: fx === 'Ultra' ? 4 : 0 });   // MSAA only on Ultra (it is the costliest part on Retina)
      composer = new EffectComposer(renderer, target); composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), .32, .45, 1.05);
      // The composer sizes every pass to the full buffer; the glow is a blur, so its mips start at a quarter of
      // the screen, not half (a third of High's cost on a Retina screen, the same look).
      const fullSize = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => fullSize(w / 2, h / 2);
      composer.addPass(bloom); composer.addPass(new OutputPass());
    }
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });                              // shadow / no-shadow shaders
    glow(on); metalShine();
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
  // Metal shine in every mode: when full reflections are off, only metallic surfaces (guns, chrome, gold, slot
  // cabinets) get the reflection map, so they still gleam for a fraction of the cost (few pixels are metal).
  const shiny = new Set();
  function metalShine() { if (!envTexture) return; const full = !!scene.environment;
    scene.traverse(o => { const m = o.material; if (!m || Array.isArray(m) || !m.isMeshStandardMaterial || (m.metalness ?? 0) < .4) return;
      if (full) { if (shiny.has(m)) { m.envMap = null; m.needsUpdate = true; shiny.delete(m); } } else if (!m.envMap) { m.envMap = envTexture; m.envMapIntensity = m.userData.envI ??= Math.min(m.envMapIntensity ?? 1, .9); m.needsUpdate = true; shiny.add(m); } }); }
  // Light pool (see top). Point lights created later (casino, office) are picked up by the periodic rescan.
  const POOL = 4, pool = Array.from({ length: POOL }, () => { const l = new THREE.PointLight(0xffffff, 0, 1, 2); l.userData.pooled = true; scene.add(l); return l; });
  const sources = new Set(), wp = new THREE.Vector3(); let poolAt = 0, scanAt = 0;
  function scanLights() { scene.traverse(o => { if (o.isPointLight && !o.userData.pooled && !o.userData.noPool && !sources.has(o)) { sources.add(o); o.visible = false; } }); }
  function updatePool(now) {
    if (jobs) jobs.add('light-scan', scanLights, 2000); else if (now - scanAt > 2000) { scanAt = now; scanLights(); }
    if (now - poolAt < 200) return; poolAt = now;
    const cam = camera.position, ranked = [];
    for (const l of sources) { if (!l.parent) continue; const i = l.intensity; if (i <= 0) continue; l.getWorldPosition(wp); const d = wp.distanceTo(cam), reach = l.distance || 200; if (d > reach * 1.4) continue; ranked.push({ l, w: i / (1 + (d / Math.max(8, reach * .35)) ** 2), p: wp.clone() }); }
    ranked.sort((a, b) => b.w - a.w);
    pool.forEach((p, k) => { const r = ranked[k]; if (!r) { p.intensity = 0; return; } p.position.copy(r.p); p.color.copy(r.l.color); p.intensity = r.l.intensity; p.distance = r.l.distance; p.decay = r.l.decay; });
  }
  // Warm-up: put objects (all guns, shot effects) into the scene for one asynchronous shader compile, with the
  // same lights, reflections and shadow settings as play, then take them out. The first draw / shot is instant.
  // Each set (`key`) is warmed once: 'main' at start, 'arena' once the realistic models are in.
  const warmed = new Map();
  // reveal(): shows rooms that are hidden while far away (the casino) just for the compile; returns a restore().
  // Resolves when the set is compiled and uploaded (callers can wait for it, e.g. the arena's loading screen).
  function prewarm(objs, reveal = () => () => {}, key = 'main') {
    if (warmed.has(key)) return warmed.get(key); if (!objs?.length) return Promise.resolve();
    const job = warm(objs, reveal, key === 'main'); warmed.set(key, job); return job;
  }
  async function warm(objs, reveal, whole) {
    performance.mark?.('warm:start'); apply();
    const g = new THREE.Group(); g.position.set(0, -500, 0); objs.forEach(o => g.add(o)); scene.add(g); metalShine(); if (fxOn) flagShadows(); g.visible = false;
    const frame = () => new Promise(r => requestAnimationFrame(r));
    // Compile a couple of objects per frame (shader linking can block the main thread on some GPUs). The set's
    // settings (e.g. the arena's fog) are applied only while the programs are created, and the objects are hidden
    // otherwise, so normal frames never draw them with other settings.
    const one = async root => { g.visible = true; const restore = reveal(); let job; try { job = renderer.compileAsync ? renderer.compileAsync(root, camera, scene) : renderer.compile(root, camera, scene); } catch {} restore(); g.visible = false; try { await job; } catch {} };
    for (let i = 0; i < objs.length; i += 2) { const part = new THREE.Group(); part.position.copy(g.position); objs.slice(i, i + 2).forEach(o => part.add(o)); g.add(part); performance.mark?.('warm:part' + i); await one(part); g.remove(part); await frame(); }
    // The start-up set: everything in the hall too (rooms revealed by reveal()) — one mesh per distinct material
    // and kind (instanced, skinned, shadow flags decide the shader variant), three per frame.
    if (whole) { const restore = reveal(), seenKey = new Set(), reps = []; scene.traverseVisible(o => { if (!o.isMesh && !o.isSprite && !o.isPoints && !o.isLine) return; for (const m of [].concat(o.material || [])) { const k = m.uuid + (o.isInstancedMesh ? 'I' : '') + (o.isSkinnedMesh ? 'S' : '') + (o.receiveShadow ? 'r' : '') + (o.castShadow ? 'c' : ''); if (!seenKey.has(k)) { seenKey.add(k); reps.push(o); } } }); restore();
      for (let i = 0; i < reps.length; i += 3) { const restore2 = reveal(); let job; try { job = Promise.all(reps.slice(i, i + 3).map(o => renderer.compileAsync ? renderer.compileAsync(o, camera, scene) : renderer.compile(o, camera, scene))); } catch {} restore2(); try { await job; } catch {} await frame(); } }
    performance.mark?.('warm:compiled');
    // Upload every texture now (signs, felts, reels, cards, gun skins…) instead of on first sight — two per frame.
    const seen = new Set(); const look = o => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const k of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'emissiveMap', 'alphaMap']) { const t = m[k]; if (t) seen.add(t); } };
    objs.forEach(o => o.traverse(look)); if (whole) scene.traverse(look); scene.remove(g);
    let n = 0; for (const t of seen) { try { renderer.initTexture(t); } catch {} if (++n % 2 === 0) await frame(); }
    performance.mark?.('warm:done');
  }

  return {
    prewarm,
    get post() { return !!composer && fxOn; },
    get passes() { return composer?.passes || []; },
    setSize(w, h) { if (composer) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); composer.setSize(w, h); composer.setPixelRatio?.(renderer.getPixelRatio()); bloom?.resolution.set(s.x / 2, s.y / 2); } },
    render() {
      apply(); frame++; updatePool(performance.now());
      if (jobs) jobs.add('metal-shine', metalShine, 3000); else if (frame % 180 === 2) metalShine();
      if (fxOn) {
        if (jobs) jobs.add('shadow-flags', () => { if (fxOn) { flagShadows(); glow(true); } }, 2000); else if (frame % 120 === 1) { flagShadows(); glow(true); }
        const pr = renderer.getPixelRatio(); if (composer._pixelRatio !== pr) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); const d = renderer.getDrawingBufferSize(new THREE.Vector2()); bloom.resolution.set(d.x / 2, d.y / 2); }
        sun.target.position.set(camera.position.x, 0, camera.position.z); sun.position.copy(sun.target.position).add(sunOffset.clone().setLength(LIGHT_DIST));   // just under the ceilings, so they don't shade the rooms
        composer.render();
      } else renderer.render(scene, camera);
    }
  };
}
