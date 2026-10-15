// How a Counter-Strike 2 map looks (its own walls, floors and props with their textures), on the client: converted on
// the host's computer from the game's files (~/CS2-extract/build/convert_world.py — never shipped) into
// user-assets/maps/<id>.glb, listed in the import's manifest (models.maps) and served by the room like every imported
// model. The collision stays the map file's (cs2-map.js); this is only what is drawn in place of its plain columns.
// Loaded on the loading screen, textures uploaded there; one map's look is kept at a time.
import * as THREE from './three.module.js';
import { GLTFLoader } from './post/GLTFLoader.js';
import { userAssets, userAssetURL } from './user-assets.js';
import { mapFileOf } from './arena-maps.js';
import { anisotropy } from './texture-quality.js';

let kept = null; const loading = new Map(), none = new Set();   // kept: { id, root, textures, meshes }; none: maps without a look (or whose look failed)
// CS2's textures are made for its own baked light (soft, with ambient occlusion); under this game's sun and sky their
// light plaster would burn out to white: a little darker. (Only for a look without its baked light.)
const LIT = .75;
// CS2's baked light (convert_world.py, lm_pack.py): the light map (RGB = irradiance / scale, gamma 2.2; A = where the
// sun reaches) on what has light-map UVs, the same per vertex (vertex colour: irradiance / scale, A = sun) on the
// props CS2 lights from probes. A surface's light = irradiance + the sun (its colour × brightness × facing × reach),
// rolled off softly (CS2 tone-maps its scenes), times its texture. No light loop, no shadow map: the cheapest shading
// there is, and CS2's own light and shadows (props sit in their shadows instead of floating on flat light).
export const BAKED = { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Color(1, 1, 1) }, uLScale: { value: 4 }, uExposure: { value: .6 }, uWhite: { value: 4 }, uSunMask: { value: null }, uHasMask: { value: 0 } };   // (uSunMask: the sun's reach at the atlas's full size, when the map has it)
const BAKED_PARS = 'uniform vec3 uSunDir; uniform vec3 uSun; uniform float uLScale; uniform float uExposure; uniform float uWhite; uniform sampler2D uSunMask; uniform float uHasMask; varying vec3 vBakedN;\n'
  + 'vec3 bakedLight( vec3 L ) { return uExposure * L / ( 1.0 + L / uWhite ); }\n';
function bakedShader(shader, vertexLight) {
  Object.assign(shader.uniforms, BAKED);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBakedN;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBakedN = normalize( mat3( modelMatrix ) * normal );');
  const light = (irr, sun) => `{ vec3 bakedN = normalize( vBakedN ) * ( gl_FrontFacing ? 1.0 : - 1.0 ); reflectedLight.indirectDiffuse += bakedLight( ${irr} + uSun * ( ${sun} * max( dot( bakedN, uSunDir ), 0.0 ) ) ); }`;
  let f = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + BAKED_PARS);
  if (vertexLight) f = f.replace('#include <color_fragment>', '').replace('reflectedLight.indirectDiffuse += vec3( 1.0 );', light('vColor.rgb * uLScale', 'vColor.a'));   // (the vertex colour is light, not tint)
  else f = f.replace('reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;', light('pow( lightMapTexel.rgb, vec3( 2.2 ) ) * uLScale', '( uHasMask > 0.5 ? texture2D( uSunMask, vLightMapUv ).r : lightMapTexel.a )'));
  shader.fragmentShader = f;
}
const bakedLM = s => bakedShader(s, false), bakedVL = s => bakedShader(s, true);   // (one function each: three.js keeps one program per kind)
// The map's light map, as stored (no colour conversion, no premultiplied alpha: RGB and A are separate data).
// The sun's reach (one channel, the atlas's full size): stored on the GPU as one byte a texel.
function loadSunMask(url) {
  return fetch(url).then(r => { if (!r.ok) throw Error('sun mask ' + r.status); return r.blob(); }).then(b => createImageBitmap(b, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then(img => { const t = new THREE.Texture(img); t.flipY = false; t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; });
}
function loadLightMap(url) {
  return fetch(url).then(r => { if (!r.ok) throw Error('light map ' + r.status); return r.blob(); }).then(b => createImageBitmap(b, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then(img => { const t = new THREE.Texture(img); t.flipY = false; t.channel = 1; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; });
}
// glTF axes of the converted file (metres: X = Hammer y, Y = Hammer z, Z = Hammer x) → the map's game units, the way
// bsp-map.js lays the map file out (`hammer`: its x0, y1, size and lowest floor).
export function placeRender(root, { x0, y1, W, D, zLow, U }, cx = 0, cz = 0) {
  const k = 39.3701 * U; root.matrixAutoUpdate = false;
  root.matrix.set(0, 0, k, cx - x0 * U - W / 2, 0, k, 0, -zLow * U, -k, 0, 0, cz + y1 * U - D / 2, 0, 0, 0, 1); root.updateMatrixWorld(true); }
// The look of map `id` when it is loaded (a Group to add), else null.
export const mapRender = id => kept?.id === id ? kept.root : null;
// A promise (with .done) while map `id`'s look still has to load; null when there is none or it is in.
export function ensureMapRender(id) {
  if (!mapFileOf(id)?.cs2 || typeof document === 'undefined' || kept?.id === id || none.has(id)) return null; if (loading.has(id)) return loading.get(id);   // (the manifest is read once per page: a kept look is current)
  const p = userAssets().then(ua => { const v = ua.models?.maps?.[id]; if (!v) return null;
      const lm = v.light?.file ? loadLightMap(userAssetURL(ua, v.light.file)).catch(e => { console.warn('map light', id, e?.message); return null; }) : null;   // (without it: lit by the sun and sky as before)
      const mk = v.light?.mask ? loadSunMask(userAssetURL(ua, v.light.mask)).catch(e => { console.warn('map sun', id, e?.message); return null; }) : null;
      return Promise.all([new GLTFLoader().loadAsync(userAssetURL(ua, v.file)), lm, mk]).then(([g, t, m]) => prepare(id, g, t ? { ...v.light, tex: t, mask: m } : null)); })
    .catch(e => { console.warn('map look', id, e?.message); return null; });
  p.done = false; p.then(r => { p.done = true; loading.delete(id); if (!r) none.add(id); }); loading.set(id, p); return p;   // (none, or it failed: the map is drawn from its columns — not asked again this page)
}
function prepare(id, gltf, light) {
  if (kept) dispose(kept); const textures = new Set(), meshes = [], root = new THREE.Group(), r = globalThis.__infra?.renderer, an = anisotropy();
  gltf.scene.updateMatrixWorld(true); const movers = new Map();   // (doors and breakables, by their entity: convert_world.py names them mover_e<entity>)
  const moverOf = o => { for (let q = o; q; q = q.parent) { const m = /^mover_e(\d+)/.exec(q.name || ''); if (m) return +m[1]; } return -1; };
  if (light) { const d = light.sun || [0, 1, 0], c = light.color || [1, 1, 1], k = light.brightness ?? 2.5; BAKED.uSunDir.value.set(d[0], d[1], d[2]).normalize(); BAKED.uSun.value.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace).multiplyScalar(k);   /* (the colour is sRGB; its brightness scales the linear light) */ BAKED.uLScale.value = light.scale || 4; textures.add(light.tex); BAKED.uSunMask.value = light.mask || null; BAKED.uHasMask.value = light.mask ? 1 : 0; if (light.mask) textures.add(light.mask); }
  gltf.scene.traverse(o => { if (!o.isMesh) return; const s = o.material, map = s.map || null, mv = moverOf(o), g = o.geometry;
    if (map) { map.anisotropy = an; textures.add(map); }
    const kind = !light ? null : /__nolm$/.test(s.name) ? (g.attributes.color?.itemSize === 4 ? 'vertex' : null) : g.attributes.uv1 ? 'map' : null;
    const common = { map, side: s.side, alphaTest: s.alphaTest, transparent: s.transparent, depthWrite: !s.transparent, name: s.name };
    let m;
    // CS2's water (Anubis's canal, coast) has its own shader and no texture: a clear teal surface the sun glints on.
    if (!map && /water/i.test(s.name)) { m = new THREE.MeshStandardMaterial({ color: 0x1f5b63, roughness: .1, metalness: .05, transparent: true, opacity: .84, depthWrite: false, side: THREE.DoubleSide, name: s.name }); const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.matrix.copy(o.matrixWorld); mesh.renderOrder = 1; mesh.userData.noShadow = true; mesh.userData.cs2 = true; g.userData.shared = true; meshes.push(mesh); s.dispose(); root.add(mesh); return; }
    if (kind === 'map') { m = new THREE.MeshBasicMaterial({ ...common, color: s.color, lightMap: light.tex }); m.onBeforeCompile = bakedLM; m.customProgramCacheKey = () => 'cs2-baked-lm'; }
    else if (kind === 'vertex') { m = new THREE.MeshBasicMaterial({ ...common, color: s.color, vertexColors: true }); m.onBeforeCompile = bakedVL; m.customProgramCacheKey = () => 'cs2-baked-vl'; }
    // Without baked light: Lambert (lit by the sun and sky, as the other maps), cheaper than the loader's standard material.
    else m = new THREE.MeshLambertMaterial({ ...common, color: s.color.clone().multiplyScalar(LIT) });
    if (s.transparent) { m.polygonOffset = true; m.polygonOffsetFactor = -1; }   // (decals and signs lie on walls: drawn over them)
    s.dispose(); const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.matrix.copy(o.matrixWorld); if (s.transparent) mesh.renderOrder = 1;
    // Baked: its shadows are in its light; it neither casts nor takes the sun's shadow map (graphics.js flags it so).
    if (kind) { mesh.castShadow = mesh.receiveShadow = false; mesh.userData.noShadow = true; } else { mesh.castShadow = !s.transparent; mesh.receiveShadow = true; }
    mesh.userData.cs2 = true; g.userData.shared = true; meshes.push(mesh);
    if (mv >= 0) { let G = movers.get(mv); if (!G) { G = new THREE.Group(); G.name = 'mover_e' + mv; movers.set(mv, G); root.add(G); } G.add(mesh); } else root.add(mesh); });
  root.userData.keep = false; root.userData.cs2Render = id; root.userData.baked = !!light;
  if (r) { for (const t of textures) r.initTexture(t); const sc = globalThis.__infra?.scene, cam = globalThis.__infra?.camera; if (sc && cam && r.compileAsync) r.compileAsync(root, cam, sc).catch(() => {}); }   // textures uploaded and shaders built now, on the loading screen
  root.userData.movers = movers; kept = { id, root, textures, meshes }; return root;
}
function dispose(k) { for (const m of k.meshes) { m.geometry.dispose(); m.material.dispose(); m.removeFromParent(); } for (const t of k.textures) t.dispose(); for (const G of k.root.userData.movers.values()) G.removeFromParent(); k.root.removeFromParent(); }   // (a door's group may hang from its hinge, outside the root)
