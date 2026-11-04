// Image quality, tiered by the graphics preset so every computer stays smooth.
//  · Every preset: a reflection environment (three.js RoomEnvironment, prefiltered once) so metal, chrome,
//    gold, glass and lacquer reflect light instead of looking flat. It costs nothing per frame after startup.
//  · Every preset: a light pool. Every surface computes every light in the scene, so instead of 12 fixed point
//    lights the scene uses 4 pooled ones that take the place of the strongest lights near the player, refreshed
//    5× a second. The count never changes, so no shader ever recompiles; lighting where you stand looks the same.
//  · High / Ultra (not on software rendering): real shadows from the key light, which follows the player
//    so a small shadow map stays sharp, and a soft glow (bloom) on lamps, neon and LEDs.
// Each part has its own setting (Settings → Graphics, resolveGraphics below; 'auto' follows the Graphics mode):
// shadows (off, low, medium, high: the shadow map's size), their edges (soft, sharp), the glow, anti-aliasing (MSAA
// of the HDR buffer), reflections, brightness and tone mapping (off: colours as they are; filmic / AgX: highlights
// rolled off like a camera's).
import * as THREE from './three.module.js';
import { RoomEnvironment } from './post/RoomEnvironment.js';
import { EffectComposer } from './post/EffectComposer.js';
import { RenderPass } from './post/RenderPass.js';
import { UnrealBloomPass } from './post/UnrealBloomPass.js';
import { OutputPass } from './post/OutputPass.js';
import { SharpenOutputPass } from './gd-sharpen.js';
import { ExposurePass, GD_LOOK, BAKED_LIGHTS_U, BAKED_LIGHT_N } from './gd-exposure.js'; import { SSAOPass } from './gd-ssao.js'; import { FxaaOutputPass } from './gd-fxaa.js';   // (v53 LOOK: GD only — CS2's auto exposure and bloom per map, SSAO on High / Ultra, lights on the baked map)   // (v53 stage 6: Global Defensive's Low / Very Low presets only — scene.userData.gdPreset)
import { AVATAR_SHADOW } from './avatar.js';
import { anisotropy, applyFiltering } from './texture-quality.js';

// Shadow map sizes, indoors / outdoors (a Global Defensive map: its shadow box is larger).
export const SHADOW_MAPS = { low: [512, 1024], medium: [1024, 2048], high: [2048, 4096] };
// The graphics settings as used, from the preferences and the Graphics mode. The old single "Shadows & glow" setting
// (effects) still counts where the new ones are left on auto.
export function resolveGraphics(p = {}, preset = p.graphics || 'Medium', software = false) {
  const q = preset === 'High' || preset === 'Ultra', ultra = preset === 'Ultra', old = p.effects === 'on' || p.effects === 'off' ? p.effects : null, pick = (v, d) => v && v !== 'auto' ? v : d;
  const shadows = software ? 'off' : pick(p.shadows, old === 'off' ? 'off' : old === 'on' || q ? (ultra ? 'high' : 'medium') : 'off');
  return { shadows: SHADOW_MAPS[shadows] ? shadows : 'off', edges: p.shadowEdges === 'sharp' ? 'sharp' : 'soft', glow: !software && pick(p.glow, old ?? (q ? 'on' : 'off')) === 'on',
    aa: software ? 0 : Math.min(4, +pick(p.antialias, ultra ? 4 : 0) || 0), brightness: Math.max(.6, Math.min(1.6, +p.brightness || 1)), tone: ['filmic', 'agx'].includes(p.tonemap) ? p.tonemap : 'off' };
}

export function createGraphics({ renderer, scene, camera, sun, preset, prefs = () => ({}), software = false, jobs = null }) {
  // Reflections.
  // Reflections are the costliest effect on a Retina laptop, so they follow the mode: on for Quality / Ultra,
  // off for Performance / Balanced, unless Settings → Reflections says otherwise.
  let envTexture = null;
  try { const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    envTexture = pmrem.fromScene(room, .04).texture; scene.environmentIntensity = .38; room.dispose?.(); pmrem.dispose(); }
  catch (e) { console.warn('reflections unavailable:', e.message); }                                            // the game still runs without them
  // Shadows: the key light casts; its shadow box moves with the player.
  const SHADOW_BOX = 70, OUT_BOX = 90, SUN_DIR = new THREE.Vector3(), OUT_TILT = new THREE.Vector3(1, .62, 1), ONE3 = new THREE.Vector3(1, 1, 1),   // outdoors the sun a little lower: longer shadows
    sunOffset = sun.position.clone(), LIGHT_DIST = 17;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_BOX; sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_BOX;
  sun.shadow.camera.near = .5; sun.shadow.camera.far = 170; sun.shadow.bias = -.0004; sun.shadow.normalBias = .04; scene.add(sun.target);
  // The Global Defensive smoke's slot in the post-processing (right after the scene, before the glow): disabled — skipped —
  // unless a smoke is up (draw()); it hands the frame to scene.userData.gdSmoke (arena-smoke-pass.js).
  const smokeHook = { enabled: false, needsSwap: true, clear: false, renderToScreen: false, setSize() {}, dispose() {}, render: (r, writeBuffer, readBuffer) => scene.userData.gdSmoke?.composite(r, writeBuffer, readBuffer) };
  let composer = null, bloom = null, mode = '', frame = 0, fxOn = false; const hemi = scene.children.find(o => o.isHemisphereLight), base = { sun: sun.intensity, hemi: hemi?.intensity, sunColor: sun.color.clone(), sky: hemi?.color.clone(), ground: hemi?.groundColor.clone() };
  // scene.userData.outdoor (Global Defensive maps): { sun, sunK, sky, ground, hemiK } — that map's sunlight and sky light, and the sun
  // far enough out for buildings to cast their shadows; the hall's lighting comes back when it is cleared.
  let lastOutdoor = null, G = resolveGraphics({}), shadowOn = false, filtering = 0;
  const auto = (v, def) => v === 'on' ? true : v === 'off' ? false : def;
  const reflect = () => !!envTexture && auto(prefs().reflections, ['High', 'Ultra'].includes(preset()));
  const shadowSize = outdoor => (SHADOW_MAPS[G.shadows] || SHADOW_MAPS.medium)[outdoor ? 1 : 0];
  // Brightness: exposure, applied where the picture goes to the screen (linear at 1 changes nothing).
  const TONE = { off: THREE.LinearToneMapping, filmic: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping };
  renderer.toneMapping = THREE.LinearToneMapping;
  // Worked out again only when a setting changes (no garbage per frame).
  let dirty = true, lastPreset = null, lastBaked = false, gdLast = null, gdSharpOn = false, gdFxOn = false, gdLookOn = '', gdExpPass = null, gdSsaoPass = null, bloomVer = -2, bloomBase = null; addEventListener?.('infra-preferences', () => { dirty = true; });
  function apply() {
    if (!dirty && preset() === lastPreset && (scene.userData.gdPreset ?? null) === gdLast) return; dirty = false; lastPreset = preset(); gdLast = scene.userData.gdPreset ?? null;
    // v53 stage 6 (GD only): scene.userData.gdPreset — the Global Defensive preset's row (gd-preset.js), set by app.js only while
    // a GD match is drawn, null elsewhere. Its `sharpen` (Low / Very Low on a GPU) makes the composer end in the sharpen pass;
    // never on a software renderer (no post-processing there at all). Every other mode: gdLast null, gdSharp false — as before.
    const gdSharp = !!gdLast?.sharpen && !software;
    // v53 LOOK (GD only, spec 4.1): on a map with CS2's baked look and a GPU — CS2's auto exposure (gd-exposure.js, every preset
    // with a composer), its bloom from the map's .vpost (gdPreset.bloom: Medium and up) and SSAO (gdPreset.ssao: High, Ultra,
    // gd-ssao.js). gdL false in every other mode and on GD's fallback maps: gdKey '' — nothing changes there.
    const gdL = !!gdLast && !software && !!scene.userData.baked, gdBloom = gdL && !!gdLast.bloom, gdSsao = gdL && !!gdLast.ssao, gdKey = gdL ? 'L' + (gdBloom ? 'b' : '') + (gdSsao ? 's' : '') : '';
    const p = prefs(); G = resolveGraphics(p, lastPreset, software); renderer.toneMappingExposure = G.brightness;
    { const a = anisotropy(p); if (a !== filtering) { const first = !filtering; filtering = a; if (!first) applyFiltering(scene, a); } }   // texture filtering changed: every texture re-sent once
    // A map whose light is baked (a CS2 map's look, scene.userData.baked) has its shadows in its light and takes no
    // shadow map: the sun's shadow pass would only cost (players' contact shadows instead).
    const want = [G.shadows, G.edges, G.glow, G.aa, G.tone, reflect(), !!scene.userData.baked, gdSharp].join('|'); if (want === mode && gdKey === gdLookOn) return; const matsToo = want !== mode /* (GD look: only a GD pass change skips the materials; elsewhere always true here, as before) */; mode = want;   // (v53 LOOK: a change of the GD look passes alone rebuilds the composer, not every material)
    renderer.toneMapping = TONE[G.tone];
    shadowOn = G.shadows !== 'off' && !scene.userData.baked; fxOn = shadowOn || G.glow; scene.environment = reflect() ? envTexture : null;
    renderer.shadowMap.enabled = shadowOn; renderer.shadowMap.type = G.edges === 'sharp' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; sun.castShadow = shadowOn;
    AVATAR_SHADOW.visible = !shadowOn;                                                                       // contact shadows only without real ones
    sun.shadow.mapSize.setScalar(shadowSize(!!scene.userData.outdoor)); sun.shadow.map?.dispose(); sun.shadow.map = null; lastOutdoor = undefined;   // (outdoor shadow settings re-applied on the next frame)
    if (shadowOn) flagShadows();   // first time at once; the job keeps it current
    // The HDR buffer: for the glow, or for anti-aliasing (its MSAA). Made again when either changes.
    const needPost = G.glow || G.aa > 0 || gdSharp || gdBloom || gdSsao;
    // (v53 LOOK review fix, GD only: a composer that exists only for the map's CS2 look — Medium: no glow, no sharpen, no
    // MSAA asked — lost the 4× MSAA its canvas gave it before. A 4× MSAA half-float buffer halved Medium's fps at real size,
    // so its output pass smooths the edges instead (gd-fxaa.js, a post-process AA as CS2's CMAA2 choice). Elsewhere as before.)
    const gdFx = gdL && !gdSharp && !G.glow && !G.aa && !!renderer.getContextAttributes?.()?.antialias;
    if (composer && (!needPost || composer.renderTarget1.samples !== G.aa || gdFxOn !== gdFx || gdSharpOn !== gdSharp || (G.glow && !bloom) || gdLookOn !== gdKey)) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); bloom?.dispose(); gdExpPass?.dispose(); gdSsaoPass?.dispose(); composer = null; bloom = null; gdExpPass = gdSsaoPass = null; }   // (v53 LOOK: and its GD passes)
    if (needPost && !composer) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: G.aa });
      composer = new EffectComposer(renderer, target); composer.addPass(new RenderPass(scene, camera)); if (gdSsao) composer.addPass(gdSsaoPass = new SSAOPass(camera)); composer.addPass(smokeHook);   // (smokeHook: off unless a Global Defensive smoke is up)
      if (gdL) composer.addPass(gdExpPass = new ExposurePass());   // (v53 LOOK: SSAO before the smoke, drawn into the scene's buffer in place — no swap, so the smoke reads the scene's depth; the exposure measured after the smoke, as CS2 sees the frame)
      gdSharpOn = gdSharp; gdFxOn = gdFx; if (!gdSharp || G.glow) bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), .32, .45, 1.05);
      // The composer sizes every pass to the full buffer; the glow is a blur, so its mips start at a quarter of
      // the screen, not half (a third of High's cost on a Retina screen, the same look).
      if (bloom /* (GD: none on a sharpen-only composer) */) { const fullSize = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => fullSize(w / 2, h / 2); composer.addPass(bloom); }   // (GD Low's sharpen-only composer: no glow buffers at all)
      composer.addPass(gdSharp ? new SharpenOutputPass() : gdFx ? new FxaaOutputPass() /* (v53 LOOK: GD Medium's edges) */ : new OutputPass());
      // (v53 LOOK: a GD map's bloom reads display values — what is above white there is an unclamped spike, such as the
      // water's sun glint on Ancient that bloomed into a white square: clamped to white before the blur. Only this
      // composer's own copy of the high-pass material, built now, so other modes' glow is untouched.)
      if (bloom && gdBloom) { const hp = bloom.materialHighPassFilter; hp.fragmentShader = hp.fragmentShader.replace('gl_FragColor = mix( outputColor, texel, alpha );', 'gl_FragColor = mix( outputColor, min( texel, vec4( 1.0 ) ), alpha );'); hp.needsUpdate = true; }
      gdLookOn = gdKey; bloomVer = -2; bloomBase = bloom ? { f: bloom.compositeMaterial.uniforms.bloomFactors.value, t: bloom.compositeMaterial.uniforms.bloomTintColors.value } : null;
      gdExpPass?.warm(renderer); gdSsaoPass?.warm(renderer, composer.renderTarget2);   // (v53 LOOK: their programs now, behind the loading card — never in a round)
    }
    if (bloom) bloom.enabled = G.glow; bloomVer = -2;   // (v53 LOOK: gdBloomSync() sets it again for a GD map)
    if (matsToo) scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });   // shadow / no-shadow, soft / sharp, tone-mapping shaders
    glow(G.glow); metalShine();
  }
  // Lamps, neon, LEDs (bright unlit colours without a texture) become HDR on High so the bloom picks them up.
  const boosted = new Set();
  function glow(on) {
    if (!on) { for (const m of boosted) m.color.multiplyScalar(1 / 2.6); boosted.clear(); return; }
    scene.traverse(o => { const m = o.material; if (!m || Array.isArray(m) || !m.isMeshBasicMaterial || m.map || boosted.has(m) || m.visible === false || m.userData.noGlow /* (v53 LOOK: a GD CS2 map's own materials) */) return;
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
  const KEEP = [];   // the frame's drawn top-level objects when filtered (reused)
  const POOL = 4, pool = Array.from({ length: POOL }, () => { const l = new THREE.PointLight(0xffffff, 0, 1, 2); l.userData.pooled = true; scene.add(l); return l; });
  const sources = new Set(), wp = new THREE.Vector3(); let poolAt = 0, scanAt = 0;
  // (the same scan: a transparent double-sided material is drawn in one pass — three.js otherwise draws it twice a frame,
  // back then front, flagging it for a new program both times: every frame a full program lookup per material)
  function scanLights() { scene.traverse(o => { if (o.isPointLight && !o.userData.pooled && !o.userData.noPool && !sources.has(o)) { sources.add(o); o.visible = false; } const m = o.material; if (m && !Array.isArray(m) && m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass) m.forceSinglePass = true; if (o.isLight) o.layers.enable(7); if (o.isPointLight && o.userData.noPool && o.userData.gd && gdExtra.length < 8 && !gdExtra.includes(o)) gdExtra.push(o); }); }   /* lights seen by the sun-shadow pass's camera too (its layer 7): else every other frame its lights count changed and every lit material looked up its program again */
  // v53 LOOK (GD only): the baked map's own light term (cs2-render.js gdPoints: a fixed BAKED_LIGHT_N slots, never a new
  // program) gets the pool's lights (the fire's among them) and the unpooled GD lights (fun-pistol.js's muzzle flash),
  // copied each frame into the shared uniforms; slots without a light get range 0. And the map's CS2 bloom (its .vpost
  // CBloomLayer via gd-exposure.js GD_LOOK): strength, display-space threshold, CS2's blur weights and tints, its blend
  // (SCREEN: 1 − (1 − a)(1 − b) as blending One-minus-dst-colour + One; ADD: additive) — set when the map's look or the
  // composer changes, and put back to this game's own glow everywhere else.
  const gdExtra = [];
  function gdLights() { const P = BAKED_LIGHTS_U.uBPLp.value, C = BAKED_LIGHTS_U.uBPLc.value; let k = 0;
    for (let i = 0; i < pool.length && k < BAKED_LIGHT_N; i++) { const l = pool[i]; if (!(l.intensity > 0)) continue; P[k].set(l.position.x, l.position.y, l.position.z, l.distance || 1e4); C[k].set(l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity); k++; }
    for (let i = 0; i < gdExtra.length && k < BAKED_LIGHT_N; i++) { const l = gdExtra[i]; if (!l.parent || !l.visible || !(l.intensity > 0)) continue; l.getWorldPosition(wp); P[k].set(wp.x, wp.y, wp.z, l.distance || 1e4); C[k].set(l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity); k++; }
    for (; k < BAKED_LIGHT_N; k++) P[k].w = 0; }
  function gdBloomSync() { if (!bloom) return; const B = gdLookOn.includes('b') ? GD_LOOK.bloom : null, v = B ? GD_LOOK.ver : -1; if (v === bloomVer) return; bloomVer = v;
    const cu = bloom.compositeMaterial.uniforms, bm = bloom.blendMaterial;
    if (B) { bloom.strength = B.strength; bloom.threshold = B.lo; bloom.highPassUniforms.smoothWidth.value = B.hi - B.lo; bloom.radius = 0; cu.bloomFactors.value = B.weights; if (bloomBase) bloom.bloomTintColors = B.tints || bloomBase.t;   /* (review fix: UnrealBloomPass copies bloom.bloomTintColors into the uniform on every render) */
      if (B.screen) { bm.blending = THREE.CustomBlending; bm.blendEquation = THREE.AddEquation; bm.blendSrc = THREE.OneMinusDstColorFactor; bm.blendDst = THREE.OneFactor; } else bm.blending = THREE.AdditiveBlending; bloom.enabled = B.strength > 0; }
    else { bloom.strength = .32; bloom.radius = .45; bloom.threshold = 1.05; bloom.highPassUniforms.smoothWidth.value = .01; if (bloomBase) { cu.bloomFactors.value = bloomBase.f; bloom.bloomTintColors = bloomBase.t; } bm.blending = THREE.AdditiveBlending; bloom.enabled = G.glow; } }
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
  // renderer.compileAsync, but a material disposed while its shader still compiles (a bot removed meanwhile) no longer
  // throws in the readiness check ("reading 'isReady'"): it just stops being waited for.
  // Compiled for where a frame draws: into the post-processing's target when it is on (a linear target, tone-mapped
  // later), else the screen — a program built for the other is built again on first sight in play.
  function compileWarm(root) {
    const was = renderer.getRenderTarget(); let mats;
    try { renderer.setRenderTarget(composer ? composer.renderTarget1 : null); mats = renderer.compile(root, camera, scene); } finally { renderer.setRenderTarget(was); }
    if (!renderer.compileAsync) return Promise.resolve();
    return new Promise(res => { const check = () => { for (const m of mats) { const pr = renderer.properties.get(m).currentProgram; if (!pr || pr.isReady()) mats.delete(m); } if (!mats.size) res(); else setTimeout(check, 10); }; check(); });
  }
  async function warm(objs, reveal, whole) {
    performance.mark?.('warm:start'); apply(); scanLights();   // the lights as play has them (lamps folded into the pool): a shader's light count is part of it, so a warm-up with more lights on compiled variants play never uses (Ancient: a 45 ms frame)
    const g = new THREE.Group(); g.position.set(0, -500, 0); objs.forEach(o => g.add(o)); scene.add(g); metalShine(); if (shadowOn) flagShadows(); g.visible = false;
    const frame = () => new Promise(r => requestAnimationFrame(r));
    // Compile a couple of objects per frame (shader linking can block the main thread on some GPUs). The set's
    // settings (e.g. the arena's fog) are applied only while the programs are created, and the objects are hidden
    // otherwise, so normal frames never draw them with other settings.
    // The lights counted are those a frame draws: with scene.userData.renderOnly (set by reveal() or play), only the
    // top-level objects it keeps, as render() does.
    const one = async root => { g.visible = true; const restore = reveal(), only = scene.userData.renderOnly, all = scene.children; if (only) scene.children = all.filter(o => o === g || only(o));
      let job; try { job = compileWarm(root); } catch {} scene.children = all; restore(); g.visible = false; try { await job; } catch {} };
    for (let i = 0; i < objs.length; i += 2) { const part = new THREE.Group(); part.position.copy(g.position); objs.slice(i, i + 2).forEach(o => part.add(o)); g.add(part); performance.mark?.('warm:part' + i); await one(part); g.remove(part); await frame(); }
    // The start-up set: everything in the hall too (rooms revealed by reveal()) — one mesh per distinct material
    // and kind (instanced, skinned, shadow flags decide the shader variant), three per frame.
    if (whole) { const restore = reveal(), seenKey = new Set(), reps = []; scene.traverseVisible(o => { if (!o.isMesh && !o.isSprite && !o.isPoints && !o.isLine) return; for (const m of [].concat(o.material || [])) { const k = m.uuid + (o.isInstancedMesh ? 'I' : '') + (o.isSkinnedMesh ? 'S' : '') + (o.receiveShadow ? 'r' : '') + (o.castShadow ? 'c' : ''); if (!seenKey.has(k)) { seenKey.add(k); reps.push(o); } } }); restore();
      for (let i = 0; i < reps.length; i += 3) { const restore2 = reveal(); let job; try { job = Promise.all(reps.slice(i, i + 3).map(o => compileWarm(o))); } catch {} restore2(); try { await job; } catch {} await frame(); } }
    performance.mark?.('warm:compiled');
    // Upload every texture now (signs, felts, reels, cards, gun skins…) instead of on first sight.
    const seen = new Set(); const look = o => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const k of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'emissiveMap', 'alphaMap']) { const t = m[k]; if (t) seen.add(t); } };
    objs.forEach(o => o.traverse(look)); if (whole) scene.traverse(look); scene.remove(g);
    // (as many a frame as fit in ~8 ms: this runs behind the loading card, and 2 a frame took 1.4 s with the 2048 px pictures)
    let t0 = performance.now(); for (const t of seen) { try { renderer.initTexture(t); } catch {} if (performance.now() - t0 > 8) { await frame(); t0 = performance.now(); } }
    performance.mark?.('warm:done');
  }

  return {
    prewarm,
    // root's shaders built now as a frame would draw them (the settings applied, the lights a frame draws — with
    // scene.userData.renderOnly only the top-level objects it keeps — and its target): fp-view.js's first-person sets.
    compileFor(root) { apply(); const only = scene.userData.renderOnly, all = scene.children, was = root.visible; let job = null; if (only) scene.children = all.filter(only); root.visible = true;
      try { job = compileWarm(root); } catch {} finally { scene.children = all; root.visible = was; } return job || Promise.resolve(); },
    // Every texture root's materials use, sent to the GPU now — a few ms a frame (`budget`), never in one long frame — instead of
    // on first sight. renderer.compile builds programs but uploads no texture: a CS2 map's 360 materials (each its own colour,
    // normal and light-map pictures) went up the first time each came into view, mid-fight — a 50–300 ms frame here on a
    // turn (and slower through ANGLE → Direct3D 11 on a Windows laptop). Already uploaded ones cost a lookup. (package W)
    async uploadTextures(root, budget = 6) {
      const seen = new Set(), add = t => { if (t?.isTexture && !renderer.properties.get(t).__webglTexture) seen.add(t); };
      root.traverse(o => { for (const m of [].concat(o.material || [])) { if (!m) continue; for (const k in m) add(m[k]); if (m.uniforms) for (const k in m.uniforms) add(m.uniforms[k]?.value); } });
      let t0 = performance.now(), n = 0; for (const t of seen) { try { renderer.initTexture(t); n++; } catch {} if (performance.now() - t0 > budget) { await new Promise(r => requestAnimationFrame(r)); t0 = performance.now(); } } return n;
    },
    get post() { return !!composer; },
    get settings() { return G; },
    get passes() { return composer?.passes || []; },
    setSize(w, h) { if (composer) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); composer.setSize(w, h); composer.setPixelRatio?.(renderer.getPixelRatio()); bloom?.resolution.set(s.x / 2, s.y / 2); } },
    // scene.userData.renderOnly(o): draw only the top-level objects it keeps (Global Defensive hides the Infra world this
    // way: the children list is swapped for the frame's draw and put back, so no module ever sees a change).
    render() {
      const only = scene.userData.renderOnly; if (only) { const all = scene.children; KEEP.length = 0; for (let i = 0; i < all.length; i++) if (only(all[i])) KEEP.push(all[i]); scene.children = KEEP; try { draw(); } finally { scene.children = all; } } else draw();
    },
  };
  function draw() {
      if (!!scene.userData.baked !== lastBaked) { lastBaked = !!scene.userData.baked; dirty = true; }   // (entering / leaving a baked map: shadows off / on)
      apply(); frame++; updatePool(performance.now()); if (gdLast && scene.userData.baked) gdLights(); if (composer) gdBloomSync();   // (v53 LOOK: GD only)
      { const O = scene.userData.outdoor || null; if (O !== lastOutdoor) { lastOutdoor = O; sun.color.copy(O ? new THREE.Color(O.sun) : base.sunColor);
          // Outdoors (a Global Defensive map): the shadow box covers what you see around you (buildings cast across the
          // streets), the sun far out; the hall's tight box comes back indoors.
          const SC = sun.shadow.camera, box = O ? OUT_BOX : SHADOW_BOX; SC.left = SC.bottom = -box; SC.right = SC.top = box; SC.far = O ? 520 : 170; SC.updateProjectionMatrix();
          const ms = shadowSize(!!O); if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.setScalar(ms); sun.shadow.map?.dispose(); sun.shadow.map = null; }
          sun.shadow.normalBias = O ? .12 : .04; if (hemi) { hemi.color.copy(O ? new THREE.Color(O.sky) : base.sky); hemi.groundColor.copy(O ? new THREE.Color(O.ground) : base.ground); } }
        sun.intensity = base.sun * (shadowOn ? 1.55 : 1) * (O ? O.sunK : 1); if (hemi) hemi.intensity = base.hemi * (shadowOn ? .72 : 1) * (O ? O.hemiK : 1); }   // more light from the shadow-casting key
      if (jobs) jobs.add('metal-shine', metalShine, 3000); else if (frame % 180 === 2) metalShine();
      if (fxOn && jobs) jobs.add('shadow-flags', () => { if (shadowOn) flagShadows(); if (G.glow) glow(true); }, 2000); else if (fxOn && frame % 120 === 1) { if (shadowOn) flagShadows(); if (G.glow) glow(true); }
      AVATAR_SHADOW.visible = scene.userData.baked ? preset() === 'Low' : !shadowOn;   // contact shadows without real ones (a baked map: the players' own sun shadows from Medium up, sun-shadows.js)
      if (shadowOn) { const O = scene.userData.outdoor, tx = O ? 2 * OUT_BOX / sun.shadow.mapSize.x : 0;   // whole shadow texels: shadows don't crawl as you move
        sun.target.position.set(tx ? Math.round(camera.position.x / tx) * tx : camera.position.x, 0, tx ? Math.round(camera.position.z / tx) * tx : camera.position.z); sun.position.copy(sun.target.position).add(SUN_DIR.copy(sunOffset).multiply(O ? OUT_TILT : ONE3).setLength(O ? 260 : LIGHT_DIST)); }   // just under the ceilings, so they don't shade the rooms
      // Global Defensive smoke (arena-smoke-pass.js, scene.userData.gdSmoke): while one is up, every cloud in one pass after
      // the scene — into the HDR buffer before the glow, or (no post-processing) via its own buffer onto the screen.
      // Otherwise this draw is exactly as without it.
      const sm = scene.userData.gdSmoke, smoke = !!sm?.active(); if (composer && sm?.armed) sm.wire(composer);   // (armed: in a match — its buffers' depth textures made at the start, not at the first smoke)
      if (composer) {
        const pr = renderer.getPixelRatio(); if (composer._pixelRatio !== pr) { composer.setPixelRatio(pr); const z = renderer.getSize(new THREE.Vector2()); composer.setSize(z.x, z.y); const d = renderer.getDrawingBufferSize(new THREE.Vector2()); bloom?./* (GD Low: no glow pass) */resolution.set(d.x / 2, d.y / 2); }
        smokeHook.enabled = smoke; if (smoke) sm.begin(composer); try { composer.render(); } finally { if (smoke) sm.end(); }
      } else if (smoke) sm.renderDirect(); else renderer.render(scene, camera);
  }
}
