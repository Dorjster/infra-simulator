// The sun's shadows near the camera on a CS2 map lit by its own baked light, drawn live as CS2 draws them up close:
// sharp, from the map's own surfaces (cs2-render.js cuts its look into tiles for this: no glass, decals or water;
// foliage cut out by its alpha) and from everything that moves — players, bots, the guns in their hands, doors, pots
// and cans — so someone standing in the sun round a corner shows their shadow past it. Further out the map's baked sun
// reach stands (cs2-render.js fades between them). One depth map from the map's own sun, round the camera, snapped to
// whole texels (no shimmer); only layer CASTER is drawn into it, each thing with its own material (only its depth is
// kept). The map's shader reads it through BAKED.uPSh* (cs2-render.js).
import * as THREE from './three.module.js';
import { BAKED } from './cs2-render.js';

export const CASTER = 7;   // the layer of what casts (cs2-agents.js: agents and their guns; arena-scene.js: the map's casters, doors, props)
const SIZE = 2048, SPAN = 96, DEPTH = 700;   // texels; half the square covered (game units: ≈ 620 Hammer units each way); its depth
export function createSunShadows(renderer) {
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true, stencilBuffer: false, samples: 0 }); rt.depthTexture = new THREE.DepthTexture(SIZE, SIZE); rt.depthTexture.type = THREE.UnsignedIntType;
  rt.texture.generateMipmaps = false; const cam = new THREE.OrthographicCamera(-SPAN, SPAN, SPAN, -SPAN, 1, DEPTH); cam.layers.set(CASTER);
  const at = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  BAKED.uPSh.value = rt.depthTexture; BAKED.uPShSpan.value = SIZE; const KEEP = []; let frame = 0, drawn = false;
  // Each caster is drawn here with a depth-only stand-in, one per kind of draw (skinned, instanced, side, morphs), used
  // nowhere else: its own material drawn into this target (no lights, linear, no tone map) and then to the screen had
  // three.js work out its program again twice a frame, every material of every player. A cut-out (alpha tested: a
  // crate's slats, a fence) gets one that keeps its cut: its own picture, the same program for all of them (built at the
  // first shadows, warm()) — not its own material, whose shadow-pass shader was built the first time a prop came out of
  // its batch in play.
  const STAND = new Map(), CUT = new Map(); let draw = null;
  const standIn = (m, o, g) => { if (m.userData.depthOnly) return m; const mt = g.morphAttributes.position, k = (o.isSkinnedMesh ? 1 : 0) | (o.isInstancedMesh ? 2 : 0) | (o.instanceColor ? 4 : 0) | (m.side << 3) | ((mt ? mt.length : 0) << 5);
    if (m.alphaTest > 0 && m.map) { let c = CUT.get(m.map); if (!c) CUT.set(m.map, c = new Map()); let d = c.get(k); if (!d) { d = new THREE.MeshBasicMaterial({ map: m.map, alphaTest: m.alphaTest, colorWrite: false, side: m.side, fog: false, toneMapped: false }); c.set(k, d); } return d; }
    if (m.alphaTest > 0) return m;
    let d = STAND.get(k); if (!d) { d = new THREE.MeshBasicMaterial({ colorWrite: false, side: m.side, fog: false, toneMapped: false }); STAND.set(k, d); } return d; };
  const viaStandIn = function (camera, scene, geometry, material, object, group) { return draw.call(this, camera, scene, geometry, standIn(material, object, geometry), object, group); };
  // Every stand-in compiled at the first shadows drawn (behind the map's loading card), not when the first player, gun or
  // door of a kind comes into view in play (a 100–200 ms frame when a LAN player joined): one of each kind drawn into it.
  let warmed = -1; const fogKind = s => s.fog?.isFogExp2 ? 2 : s.fog ? 1 : 0;   // (warmed: for which kind of fog — again when a map brings another)
  function warm(scene) { warmed = fogKind(scene); const sc = new THREE.Scene(); sc.fog = scene.fog;   // (the scene's own fog: three.js keys every program by whether the scene has fog, a depth-only one too)
    const g = new THREE.BufferGeometry(), pic = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); pic.needsUpdate = true;
    const mats = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide].flatMap(side => [new THREE.MeshBasicMaterial({ side }), new THREE.MeshBasicMaterial({ side, map: pic, alphaTest: .5 })]);   // (plain, and cut out)
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3)); g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(12), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
    const add = o => { o.frustumCulled = false; o.layers.set(CASTER); sc.add(o); return o; };
    for (const m of mats) { add(new THREE.Mesh(g, m)); const k = add(new THREE.SkinnedMesh(g, m)), bone = new THREE.Bone(); k.add(bone); k.bind(new THREE.Skeleton([bone])); add(new THREE.InstancedMesh(g, m, 1)); }
    sc.updateMatrixWorld(true); const was = renderer.getRenderTarget(); draw = renderer.renderBufferDirect; renderer.renderBufferDirect = viaStandIn;
    try { renderer.setRenderTarget(rt); renderer.render(sc, cam); } finally { renderer.renderBufferDirect = draw; renderer.setRenderTarget(was); }
    sc.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); if (o.isInstancedMesh) o.dispose(); }); g.dispose(); for (const m of mats) m.dispose(); }   // (the stand-ins it made stay — STAND, CUT under its little picture — so their programs stay built: three.js frees a program no material uses)
  return {
    // Each frame on a baked map: follow the camera on the texel grid, draw the casters' depth from the sun, hand it to the
    // map's shader. off(): back to the baked sun alone (other maps, Low).
    // Cheap on the main thread (a quarter of its time, measured, before): every other frame (the shadows of what moves,
    // 30 times a second — the last map and its matrix hold between), only the scene's parts the frame itself draws
    // (scene.userData.renderOnly: Global Defensive keeps its own), and no second pass over the scene's matrices (the
    // frame's own keeps them: what moved shows a frame later).
    update(scene, camera) {
      const d = BAKED.uSunDir.value; if (d.y <= .05) { BAKED.uPShOn.value = 0; drawn = false; return; }
      if (drawn && (frame++ & 1)) return; if (warmed !== fogKind(scene)) warm(scene);
      right.crossVectors(Y, d); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize(); up.crossVectors(d, right).normalize();
      const k = 2 * SPAN / SIZE, cx = camera.position.dot(right), cy = camera.position.dot(up), cz = camera.position.dot(d);
      at.copy(right).multiplyScalar(Math.round(cx / k) * k).addScaledVector(up, Math.round(cy / k) * k).addScaledVector(d, cz);   // (the camera's spot, on the texel grid)
      cam.position.copy(at).addScaledVector(d, DEPTH * .55); cam.up.copy(up); cam.lookAt(at); cam.updateMatrixWorld(true);
      const was = renderer.getRenderTarget(), ac = renderer.autoClear; renderer.autoClear = true;
      const only = scene.userData.renderOnly, all = scene.children, mwa = scene.matrixWorldAutoUpdate; if (only) { KEEP.length = 0; for (let i = 0; i < all.length; i++) if (only(all[i])) KEEP.push(all[i]); scene.children = KEEP; }
      scene.matrixWorldAutoUpdate = false; draw = renderer.renderBufferDirect; renderer.renderBufferDirect = viaStandIn;
      try { renderer.setRenderTarget(rt); renderer.render(scene, cam); } finally { renderer.renderBufferDirect = draw; scene.children = all; scene.matrixWorldAutoUpdate = mwa; renderer.setRenderTarget(was); renderer.autoClear = ac; }
      BAKED.uPShMat.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); BAKED.uPShOn.value = 1; drawn = true; },
    off() { BAKED.uPShOn.value = 0; drawn = false; },
    dispose() { BAKED.uPShOn.value = 0; BAKED.uPSh.value = null; rt.dispose(); rt.depthTexture.dispose(); for (const d of STAND.values()) d.dispose(); STAND.clear(); for (const c of CUT.values()) for (const d of c.values()) d.dispose(); CUT.clear(); },
  };
}
