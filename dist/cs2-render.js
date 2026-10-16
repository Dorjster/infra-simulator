// How a Counter-Strike 2 map looks (its own walls, floors and props with their textures), on the client: converted on
// the host's computer from the game's files (~/CS2-extract/build/convert_world.py — never shipped) into
// user-assets/maps/<id>.glb, listed in the import's manifest (models.maps) and served by the room like every imported
// model. The collision stays the map file's (cs2-map.js); this is only what is drawn in place of its plain columns.
// Loaded on the loading screen, textures uploaded there; one map's look is kept at a time.
import * as THREE from './three.module.js';
import { GLTFLoader } from './post/GLTFLoader.js';
import { userAssets, userAssetURL } from './user-assets.js';
import { mapFileOf } from './arena-maps.js';
import { anisotropy } from './texture-quality.js'; import { noteProgress } from './load-progress.js';

let kept = null; const loading = new Map(), none = new Set();   // kept: { id, root, textures, meshes }; none: maps without a look (or whose look failed)
// CS2's textures are made for its own baked light (soft, with ambient occlusion); under this game's sun and sky their
// light plaster would burn out to white: a little darker. (Only for a look without its baked light.)
const LIT = .75;
// Where CS2's auto exposure sits in its range when a map has no exposure of its own fitted (install_look.py: post.use,
// fitted to CS2's own footage of the map — Mirage at the top of its range, Dust II and Nuke at the bottom): the top.
export const EXPOSURE_AT = 1;
// CS2's baked light (convert_world.py, lm_pack.py): the light map (RGB = irradiance / scale, gamma 2.2; A = where the
// sun reaches) on what has light-map UVs, the same per vertex (vertex colour: irradiance / scale, A = sun) on the
// props CS2 lights from probes. A surface's light = irradiance + the sun (its colour × brightness × facing × reach),
// rolled off softly (CS2 tone-maps its scenes), times its texture. No light loop, no shadow map: the cheapest shading
// there is, and CS2's own light and shadows (props sit in their shadows instead of floating on flat light).
export const BAKED = { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Color(1, 1, 1) }, uLScale: { value: 4 }, uExposure: { value: .6 }, uWhite: { value: 4 }, uSunMask: { value: null }, uHasMask: { value: 0 },
  uPSh: { value: null }, uPShMat: { value: new THREE.Matrix4() }, uPShOn: { value: 0 }, uPShSpan: { value: 2048 }, uPShDebug: { value: 0 },
  uGrade: { value: 0 }, uCurveA: { value: new THREE.Vector4() }, uCurveB: { value: new THREE.Vector4() }, uLut: { value: null }, uLutOn: { value: 0 } };   // (the sun's live shadows near the camera: sun-shadows.js — the casters' depth from the sun, where to look it up, its size)   // (uSunMask: the sun's reach at the atlas's full size, when the map has it)
const BAKED_PARS = 'uniform vec3 uSunDir; uniform vec3 uSun; uniform float uLScale; uniform float uExposure; uniform float uWhite; uniform sampler2D uSunMask; uniform float uHasMask; varying vec3 vBakedN;\n'
  + 'uniform float uGrade; uniform vec4 uCurveA; uniform vec4 uCurveB; uniform highp sampler3D uLut; uniform float uLutOn;\n'
  + 'vec3 bakedLight( vec3 L ) { return uGrade > 0.5 ? L : uExposure * L / ( 1.0 + L / uWhite ); }\n'
  // CS2's grading of the map (its post_processing_volume, install_look.py): the colour × the exposure through its filmic
  // curve (Hable's: shoulder A, linear strength B and angle C, toe strength D, numerator E, denominator F; white point
  // W) — f(x) = x (A x (F − E) + B (C F − E)) / (F (x (A x + B) + D F)), the usual form with its constants cancelled out
  // (Mirage's near-straight curve lost its darks to rounding in the usual one) — then its colour lookup table (32³, on
  // the sRGB colour). Light stays linear up to here (bakedLight), as CS2's does.
  + 'vec3 cs2Hable( vec3 x ) { float A = uCurveA.x, B = uCurveA.y, C = uCurveA.z, D = uCurveA.w, E = uCurveB.x, F = uCurveB.y; return x * ( A * x * ( F - E ) + B * ( C * F - E ) ) / ( F * ( x * ( A * x + B ) + D * F ) ); }\n'
  + 'vec3 cs2Grade( vec3 c ) { vec3 t = clamp( cs2Hable( max( c * uCurveB.w, 0.0 ) ) / cs2Hable( vec3( uCurveB.z ) ), 0.0, 1.0 ); if ( uLutOn < 0.5 ) return t;\n'
  + '  vec3 s = mix( 12.92 * t, 1.055 * pow( t, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, t ) ); s = texture( uLut, s * ( 31.0 / 32.0 ) + 0.5 / 32.0 ).rgb;\n'
  + '  return mix( s / 12.92, pow( ( s + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, s ) ); }\n'
  // The sun's reach: CS2's baked one, darkened near the camera by what moves (sun-shadows.js: players, props, doors,
  // drawn from the sun): 5 taps a texel apart (a crisp edge, not a hard one), the spot nudged off its surface along its
  // normal (no self-shadowing), fading out at the edge of the covered square. (uPShDebug 1, tests: the live shadows of
  // the map itself against the baked ones, to fit the sun.)
  + 'uniform sampler2D uPSh; uniform mat4 uPShMat; uniform float uPShOn; uniform float uPShSpan; uniform float uPShDebug; varying vec3 vBakedW; vec4 shDbg = vec4( 0.0 );\n'
  + 'float sunReach( float baked, vec3 n ) { if ( uPShOn < 0.5 ) return baked; vec4 c = uPShMat * vec4( vBakedW + n * 0.12, 1.0 ); vec3 p = c.xyz / c.w * 0.5 + 0.5;\n'
  + '  float e = max( abs( p.x - 0.5 ), abs( p.y - 0.5 ) ) * 2.0; if ( e >= 1.0 || p.z >= 1.0 || p.z <= 0.0 ) return baked; float t = 1.0 / uPShSpan, z = p.z - 0.0006;\n'
  + '  float s = step( z, texture2D( uPSh, p.xy ).r ) * 2.0 + step( z, texture2D( uPSh, p.xy + vec2( t, t ) ).r ) + step( z, texture2D( uPSh, p.xy + vec2( - t, t ) ).r ) + step( z, texture2D( uPSh, p.xy + vec2( t, - t ) ).r ) + step( z, texture2D( uPSh, p.xy + vec2( - t, - t ) ).r );\n'
  + '  if ( uPShDebug > 0.5 && uPShDebug < 1.5 && n.y > 0.8 ) { float l = s / 6.0; shDbg = vec4( baked < 0.5 && l > 0.5 ? 1.0 : 0.0, l < 0.5 && baked > 0.5 ? 1.0 : 0.0, l < 0.5 && baked < 0.5 ? 1.0 : 0.0, 1.0 ); }\n'
  + '  return uPShDebug > 0.5 && uPShDebug < 1.5 ? mix( baked, s / 6.0, 1.0 - smoothstep( 0.8, 0.97, e ) ) : baked * mix( 1.0, s / 6.0, 1.0 - smoothstep( 0.8, 0.97, e ) ); }\n';   // (uPShDebug: tests — red: only the baked reach is shaded there, green: only the live one, blue: both)
function bakedShader(shader, vertexLight) {
  Object.assign(shader.uniforms, BAKED);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBakedN; varying vec3 vBakedW;\n#ifdef CS2_TINT\nattribute vec4 tint; varying vec3 vTint;\n#endif').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBakedN = normalize( mat3( modelMatrix ) * normal ); vBakedW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#ifdef CS2_TINT\n\tvTint = tint.rgb;\n#endif');   // (CS2_TINT: meshes merged into one, each one's colour per vertex — prepare)
  const light = (irr, sun, uvDbg = 'vec3( 0.0 )') => `{ vec3 bakedN = normalize( vBakedN ) * ( gl_FrontFacing ? 1.0 : - 1.0 ); reflectedLight.indirectDiffuse += bakedLight( ${irr} + uSun * ( sunReach( ${sun}, bakedN ) * max( dot( bakedN, uSunDir ), 0.0 ) ) ); if ( uPShDebug > 2.5 ) shDbg = vec4( ${uvDbg}, 1.0 ); else if ( uPShDebug > 1.5 ) shDbg = vec4( bakedLight( ${irr} ), 1.0 ); }`;   // (uPShDebug 2: the baked light alone, no texture — tests)
  let f = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + BAKED_PARS + '#ifdef CS2_TINT\nvarying vec3 vTint;\n#endif\n').replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity );\n#ifdef CS2_TINT\n\tdiffuseColor.rgb *= vTint;\n#endif');
  if (vertexLight) f = f.replace('#include <color_fragment>', '').replace('reflectedLight.indirectDiffuse += vec3( 1.0 );', light('vColor.rgb * uLScale', 'vColor.a'));   // (the vertex colour is light, not tint)
  else f = f.replace('reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;', light('pow( lightMapTexel.rgb, vec3( 2.2 ) ) * uLScale', '( uHasMask > 0.5 ? texture2D( uSunMask, vLightMapUv ).r : lightMapTexel.a )', '( uPShDebug > 4.5 ? vec3( floor( vLightMapUv.y * 255.0 ) / 255.0, fract( vLightMapUv.y * 255.0 ), 0.0 ) : uPShDebug > 3.5 ? vec3( floor( vLightMapUv.x * 255.0 ) / 255.0, fract( vLightMapUv.x * 255.0 ), 0.0 ) : vec3( fract( vLightMapUv * 16.0 ), 0.0 ) )'));
  f = f.replace('#include <tonemapping_fragment>', '\tif ( uGrade > 0.5 ) gl_FragColor.rgb = cs2Grade( gl_FragColor.rgb );\n#include <tonemapping_fragment>');
  f = f.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tif ( uPShDebug > 0.5 && shDbg.a > 0.0 ) gl_FragColor = vec4( uPShDebug > 1.5 && uPShDebug < 2.5 ? pow( shDbg.rgb, vec3( 0.4545 ) ) : shDbg.rgb, 1.0 );');
  shader.fragmentShader = f;
}
const bakedLM = s => bakedShader(s, false), bakedVL = s => bakedShader(s, true);   // (one function each: three.js keeps one program per kind)
// CS2's mod2x overlays (stains, grime, scuffs, worn road paint: static overlays in blend mode 3): the texture × its tint,
// unlit, eased to neutral grey by its alpha, then the surface under it × 2 × that (grey 128 leaves it as it is).
const mod2x = s => { s.fragmentShader = s.fragmentShader.replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\n\tgl_FragColor = vec4( mix( vec3( 0.5 ), gl_FragColor.rgb, gl_FragColor.a ), 1.0 );'); };
// The map's light map, as stored (no colour conversion, no premultiplied alpha: RGB and A are separate data).
// The sun's reach (one channel, the atlas's full size): stored on the GPU as one byte a texel.
function loadSunMask(url) {
  return fetch(url).then(r => { if (!r.ok) throw Error('sun mask ' + r.status); return r.blob(); }).then(b => createImageBitmap(b, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then(img => { const t = new THREE.Texture(img); t.flipY = false; t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; });
}
// The map's colour lookup table (CS2's, 32³ RGB bytes, red fastest) as a 3D texture, filtered between its entries.
function loadLut(url) {
  return fetch(url).then(r => { if (!r.ok) throw Error('lookup table ' + r.status); return r.arrayBuffer(); }).then(b => { const rgb = new Uint8Array(b), n = 32; if (rgb.length !== n * n * n * 3) throw Error('lookup table size ' + rgb.length);
    const rgba = new Uint8Array(n * n * n * 4); for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255; }
    const t = new THREE.Data3DTexture(rgba, n, n, n); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.NoColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.unpackAlignment = 1; t.needsUpdate = true; return t; });
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
      const lt = v.light?.post?.lut ? loadLut(userAssetURL(ua, v.light.post.lut)).catch(e => { console.warn('map grading', id, e?.message); return null; }) : null;
      const sk = v.light?.sky?.file ? new THREE.TextureLoader().loadAsync(userAssetURL(ua, v.light.sky.file)).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }).catch(e => { console.warn('map sky', id, e?.message); return null; }) : null;
      return Promise.all([new GLTFLoader().loadAsync(userAssetURL(ua, v.file), e => noteProgress('Downloading the map\'s look', e.loaded, e.total || 0)), lm, mk, lt, sk]).then(([g, t, m, l, k]) => prepare(id, g, t ? { ...v.light, tex: t, mask: m, lutTex: l, skyTex: k } : null)); })
    .catch(e => { console.warn('map look', id, e?.message); return null; });
  p.done = false; p.then(r => { p.done = true; loading.delete(id); if (!r) none.add(id); }); loading.set(id, p); return p;   // (none, or it failed: the map is drawn from its columns — not asked again this page)
}
// The look's own fixed surfaces as sun casters (sun-shadows.js), cut into 13 m tiles by each triangle's middle — each
// tile its own index on the same vertices (nothing copied but the indices), with its own tight bounds. Not drawn in
// play: the map's fixed shadows are CS2's own, baked (its sun mask, at the light map's full size); live, only what
// moves casts — players, props, doors (sun-shadows.js) — darkening that baked reach. The world drawn live as well, in a
// sun direction fitted to CS2's bake, shaded walls CS2 has in the sun (Mirage's A site: a third as bright). Built on
// demand (root.userData.worldCasters()) for the tests that fit the sun: its shadows against the baked ones. Glass,
// decals and water cast nothing; foliage and fences cut out by their alpha as drawn.
const TILE = 13, CASTER_LAYER = 7;   // (sun-shadows.js CASTER)
const casterDepth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide }), alphaDepth = new Map(); casterDepth.userData.shared = true;
function buildCasters(list) {
  const out = new THREE.Group(); out.name = 'sun-casters'; const v = new THREE.Vector3(); let tris = 0;
  for (const mesh of list) { const m = mesh.material, g = mesh.geometry, I = g.index, P = g.attributes.position; if (!I || !P || (m.transparent && !(m.alphaTest > 0)) || /water/i.test(m.name || '')) continue;
    const E = mesh.matrix.elements, ix = I.array, n = ix.length / 3, key = new Int32Array(n), groups = new Map(), px = i => P.getX(i), pz = i => P.getZ(i);
    for (let t = 0; t < n; t++) { const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2], x = (px(a) + px(b) + px(c)) / 3, y = (P.getY(a) + P.getY(b) + P.getY(c)) / 3, z = (pz(a) + pz(b) + pz(c)) / 3;
      const wx = E[0] * x + E[4] * y + E[8] * z + E[12], wz = E[2] * x + E[6] * y + E[10] * z + E[14], k = (Math.floor(wx / TILE) + 4096) * 8192 + Math.floor(wz / TILE) + 4096; key[t] = k; groups.set(k, (groups.get(k) || 0) + 1); }
    const at = new Map(); let o = 0; for (const [k, c] of groups) { at.set(k, o); o += c * 3; }
    const sorted = new ix.constructor(ix.length), fill = new Map(at); for (let t = 0; t < n; t++) { const p = fill.get(key[t]); sorted[p] = ix[t * 3]; sorted[p + 1] = ix[t * 3 + 1]; sorted[p + 2] = ix[t * 3 + 2]; fill.set(key[t], p + 3); }
    const index = new THREE.BufferAttribute(sorted, 1), alpha = m.alphaTest > 0 && m.map ? (alphaDepth.get(m.map) || alphaDepth.set(m.map, Object.assign(new THREE.MeshDepthMaterial({ map: m.map, alphaTest: m.alphaTest, side: THREE.DoubleSide }), { userData: { shared: true } })).get(m.map)) : null;
    for (const [k, c] of groups) { const start = at.get(k), cg = new THREE.BufferGeometry(); cg.setAttribute('position', P); if (alpha && g.attributes.uv) cg.setAttribute('uv', g.attributes.uv); cg.setIndex(index); cg.setDrawRange(start, c * 3);
      const box = new THREE.Box3(); for (let j = start; j < start + c * 3; j++) box.expandByPoint(v.fromBufferAttribute(P, sorted[j])); cg.boundingBox = box; cg.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const cm = new THREE.Mesh(cg, alpha || casterDepth); cm.matrixAutoUpdate = false; cm.matrix.copy(mesh.matrix); cm.layers.set(CASTER_LAYER); cm.userData.noShadow = true; out.add(cm); tris += c; } }
  out.userData.triangles = tris; return out;
}
// Meshes merged into one (one draw): each one's place baked into its points, its normals turned as the baked shader
// turns them (by the matrix's 3×3), its triangles wound the other way where its matrix mirrors, its colour per vertex
// (`tint`) when they differ. Returns the geometry and each mesh's vertices [first, count], in order.
const comp = (a, j, c) => c === 0 ? a.getX(j) : c === 1 ? a.getY(j) : c === 2 ? a.getZ(j) : a.getW(j);
export function mergeGeometry(list, tint) {
  const first = list[0].geometry, names = Object.keys(first.attributes), A = {}, out = new THREE.BufferGeometry(); let nv = 0, ni = 0;
  for (const m of list) { const g = m.geometry, n = g.attributes.position.count; nv += n; ni += g.index ? g.index.count : n; }
  for (const k of names) { const a = first.attributes[k], f = k === 'position' || k === 'normal'; A[k] = new THREE.BufferAttribute(f ? new Float32Array(nv * 3) : new a.array.constructor(nv * a.itemSize), f ? 3 : a.itemSize, f ? false : a.normalized); out.setAttribute(k, A[k]); }
  const T = tint ? new Uint16Array(nv * 4) : null; if (T) out.setAttribute('tint', new THREE.BufferAttribute(T, 4, true));
  const index = new (nv > 65535 ? Uint32Array : Uint16Array)(ni), spans = [], nm = new THREE.Matrix3(); let v = 0, i = 0;
  for (const m of list) { const g = m.geometry, n = g.attributes.position.count, E = m.matrix.elements, N = nm.setFromMatrix4(m.matrix).elements, flip = m.matrix.determinant() < 0;
    for (const k of names) { const s = g.attributes[k], d = A[k].array, sz = A[k].itemSize;
      if (k === 'position') for (let j = 0, o = v * 3; j < n; j++, o += 3) { const x = s.getX(j), y = s.getY(j), z = s.getZ(j); d[o] = E[0] * x + E[4] * y + E[8] * z + E[12]; d[o + 1] = E[1] * x + E[5] * y + E[9] * z + E[13]; d[o + 2] = E[2] * x + E[6] * y + E[10] * z + E[14]; }
      else if (k === 'normal') for (let j = 0, o = v * 3; j < n; j++, o += 3) { const x = s.getX(j), y = s.getY(j), z = s.getZ(j); d[o] = N[0] * x + N[3] * y + N[6] * z; d[o + 1] = N[1] * x + N[4] * y + N[7] * z; d[o + 2] = N[2] * x + N[5] * y + N[8] * z; }
      else if (!s.isInterleavedBufferAttribute && s.array.constructor === d.constructor && s.itemSize === sz) d.set(s.array.subarray(0, n * sz), v * sz);
      else for (let j = 0; j < n; j++) for (let c = 0; c < sz; c++) A[k].setComponent(v + j, c, comp(s, j, c)); }
    if (T) { const c = m.material.color, r = Math.round(Math.min(1, c.r) * 65535), gg = Math.round(Math.min(1, c.g) * 65535), b = Math.round(Math.min(1, c.b) * 65535); for (let j = 0, o = v * 4; j < n; j++, o += 4) { T[o] = r; T[o + 1] = gg; T[o + 2] = b; T[o + 3] = 65535; } }
    const I = g.index; if (I) { const ia = I.array; for (let t = 0; t + 2 < I.count; t += 3) { index[i++] = ia[t] + v; index[i++] = ia[flip ? t + 2 : t + 1] + v; index[i++] = ia[flip ? t + 1 : t + 2] + v; } }
    else for (let t = 0; t + 2 < n; t += 3) { index[i++] = v + t; index[i++] = v + (flip ? t + 2 : t + 1); index[i++] = v + (flip ? t + 1 : t + 2); }
    spans.push([v, n]); v += n; }
  out.setIndex(new THREE.BufferAttribute(i === ni ? index : index.slice(0, i), 1)); out.computeBoundingBox(); out.computeBoundingSphere(); return { geometry: out, spans };
}
// A merged mesh drawn with the first one's material (white, the colours per vertex, when they differ).
function mergedMesh(list) {
  const mat = list[0].material, tint = list.some(m => !m.material.color.equals(mat.color)), { geometry, spans } = mergeGeometry(list, tint);
  if (tint) { mat.color.setRGB(1, 1, 1); mat.defines = { ...(mat.defines || {}), CS2_TINT: '' }; const key = mat.customProgramCacheKey(); mat.customProgramCacheKey = () => key + '-t'; mat.needsUpdate = true; }
  const mesh = new THREE.Mesh(geometry, mat); mesh.matrixAutoUpdate = false; mesh.castShadow = mesh.receiveShadow = false; mesh.userData.noShadow = true; mesh.userData.cs2 = true; geometry.userData.shared = true; return { mesh, spans };
}
const PROP_CELL = 50;   // (metres, the look's units: ≈ 320 game units — props merged per square of this)
function prepare(id, gltf, light) {
  if (kept) dispose(kept); const textures = new Set(), meshes = [], still = [], root = new THREE.Group(), r = globalThis.__infra?.renderer, an = anisotropy();
  gltf.scene.updateMatrixWorld(true); const movers = new Map();   // (doors and breakables, by their entity: convert_world.py names them mover_e<entity>)
  const moverOf = o => { for (let q = o; q; q = q.parent) { const m = /^mover_e(\d+)/.exec(q.name || ''); if (m) return +m[1]; } return -1; };
  const props = new Map(), propOf = o => { for (let q = o; q; q = q.parent) { const m = /^prop_p(\d+)/.exec(q.name || ''); if (m) return +m[1]; } return -1; };   // (physics props: prop_p<i> — arena-physprops.js moves them)
  if (light) { const d = light.sun || [0, 1, 0], c = light.color || [1, 1, 1], k = light.brightness ?? 2.5; BAKED.uSunDir.value.set(d[0], d[1], d[2]).normalize(); BAKED.uSun.value.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace).multiplyScalar(k);   /* (the colour is sRGB; its brightness scales the linear light) */ BAKED.uLScale.value = light.scale || 4; textures.add(light.tex); BAKED.uSunMask.value = light.mask || null; BAKED.uHasMask.value = light.mask ? 1 : 0; if (light.mask) textures.add(light.mask); }
  // (CS2's grading: the map's exposure — as fitted to CS2's footage, else its auto exposure's range at EXPOSURE_AT — curve and table)
  { const P = light?.post; if (P && Array.isArray(P.curve) && P.curve.length === 7) { const [A, B, C, D, E, F, W] = P.curve, e0 = Math.min(...P.exposure), e1 = Math.max(...P.exposure);
      BAKED.uCurveA.value.set(A, B, C, D); BAKED.uCurveB.value.set(E, F, W, (Number.isFinite(P.use) ? P.use : e0 + (e1 - e0) * EXPOSURE_AT) * 2 ** (P.bias || 0)); BAKED.uGrade.value = 1; BAKED.uLut.value = light.lutTex || null; BAKED.uLutOn.value = light.lutTex ? 1 : 0; if (light.lutTex) textures.add(light.lutTex); }
    else { BAKED.uGrade.value = 0; BAKED.uLutOn.value = 0; BAKED.uLut.value = null; } }
  // (CS2's sky, graded as the map: arena-scene.js lays it on its sky dome)
  if (light?.skyTex) { textures.add(light.skyTex); root.userData.sky = { tex: light.skyTex, yaw: light.sky?.yaw || 0, horizon: light.sky?.horizon || null }; }
  gltf.scene.traverse(o => { if (!o.isMesh) return; const s = o.material, map = s.map || null, mv = moverOf(o), g = o.geometry;
    if (map) { map.anisotropy = an; textures.add(map); }
    const kind = !light ? null : /__nolm$/.test(s.name) ? (g.attributes.color?.itemSize === 4 ? 'vertex' : null) : g.attributes.uv1 ? 'map' : null;
    const common = { map, side: s.side, alphaTest: s.alphaTest, transparent: s.transparent, depthWrite: !s.transparent, name: s.name };
    // CS2's static overlays (graffiti, signs, stains, road paint — install_look.py: blend mode and opacity by material
    // name; Blender's .001 … and the __nolm mark dropped): exported as solid sheets, drawn here as CS2 draws them.
    const ov = light?.overlays?.[s.name.replace(/__nolm$/, '').replace(/\.\d+$/, '')] || null;
    let m;
    // CS2's water (Anubis's canal, coast) has its own shader and no texture: a clear teal surface the sun glints on.
    if (!map && /water/i.test(s.name)) { m = new THREE.MeshStandardMaterial({ color: 0x1f5b63, roughness: .1, metalness: .05, transparent: true, opacity: .84, depthWrite: false, side: THREE.DoubleSide, name: s.name }); const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.matrix.copy(o.matrixWorld); mesh.renderOrder = 1; mesh.userData.noShadow = true; mesh.userData.cs2 = true; g.userData.shared = true; meshes.push(mesh); s.dispose(); root.add(mesh); return; }
    if (ov?.[0] === 3 && map) { m = new THREE.MeshBasicMaterial({ map, color: s.color, opacity: ov[1], side: s.side, name: s.name, transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor }); m.onBeforeCompile = mod2x; m.customProgramCacheKey = () => 'cs2-mod2x'; }
    else if (kind === 'map') { m = new THREE.MeshBasicMaterial({ ...common, color: s.color, lightMap: light.tex }); m.onBeforeCompile = bakedLM; m.customProgramCacheKey = () => 'cs2-baked-lm'; }
    else if (kind === 'vertex') { m = new THREE.MeshBasicMaterial({ ...common, color: s.color, vertexColors: true }); m.onBeforeCompile = bakedVL; m.customProgramCacheKey = () => 'cs2-baked-vl'; }
    // Without baked light: Lambert (lit by the sun and sky, as the other maps), cheaper than the loader's standard material.
    else m = new THREE.MeshLambertMaterial({ ...common, color: s.color.clone().multiplyScalar(LIT) });
    if (ov && ov[0] === 2) { if (!(m.alphaTest > 0)) m.alphaTest = .5; } else if (ov && ov[0] !== 3) { m.transparent = true; m.depthWrite = false; m.opacity = ov[1]; }   // (2: cut out by its alpha; 1: blended, times its opacity)
    if (s.transparent || ov) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4; }   // (decals, signs and overlays lie on walls: drawn over them, whatever the order, even seen head-on)
    s.dispose(); const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.matrix.copy(o.matrixWorld); if (m.transparent) mesh.renderOrder = 1;
    // Baked: its shadows are in its light; it neither casts nor takes the sun's shadow map (graphics.js flags it so).
    if (kind || ov) { mesh.castShadow = mesh.receiveShadow = false; mesh.userData.noShadow = true; } else { mesh.castShadow = !s.transparent; mesh.receiveShadow = true; }
    mesh.userData.cs2 = true; g.userData.shared = true; meshes.push(mesh);
    const pp = mv >= 0 ? -1 : propOf(o);
    if (mv < 0 && pp < 0) still.push(mesh);   // (the map's fixed surfaces: its sun casters, below)
    if (mv >= 0) { let G = movers.get(mv); if (!G) { G = new THREE.Group(); G.name = 'mover_e' + mv; movers.set(mv, G); root.add(G); } G.add(mesh); } else if (pp >= 0) { let G = props.get(pp); if (!G) { G = new THREE.Group(); G.name = 'prop_p' + pp; props.set(pp, G); root.add(G); } G.add(mesh); } else root.add(mesh); });
  // Fewer draws (the main thread's cost a frame is mostly per draw: 950 meshes on Inferno and 450 props). The map's fixed,
  // opaque surfaces merged into one mesh per material over the whole map (a camera sees most of a map's meshes at once
  // anyway, and Apple's GPUs drop hidden pixels whatever the order), each one's tint kept per vertex. The physics props,
  // while they rest, merged per material in squares of PROP_CELL (they cast the live sun shadows: those near the camera
  // only); a prop knocked or broken is taken out (its vertices folded to a point) and drawn on its own until the next
  // round (propBatch.wake / rest: arena-scene.js, arena-physprops.js). Glass, decals and water stay apart (drawn in order).
  if (light) {
    const keyOf = m => { const M = m.material, G = m.geometry; return [M.customProgramCacheKey(), M.map?.uuid, M.side, M.alphaTest, M.polygonOffset, Object.keys(G.attributes).sort().map(k => { const a = G.attributes[k]; return k + (k === 'position' || k === 'normal' ? '' : a.itemSize + a.array.constructor.name + a.normalized); }).join('|')].join(','); };
    const mergeable = m => !m.material.transparent && (m.material.onBeforeCompile === bakedLM || m.material.onBeforeCompile === bakedVL) && !m.geometry.groups.length && m.geometry.drawRange.start === 0 && m.geometry.drawRange.count === Infinity && !!m.geometry.attributes.position && !!m.geometry.attributes.normal;
    const merged = new Set(), made = [], groups = new Map(); for (const m of still) if (mergeable(m)) { const k = keyOf(m); (groups.get(k) || groups.set(k, []).get(k)).push(m); }
    for (const list of groups.values()) { if (list.length < 2) continue; const { mesh } = mergedMesh(list); root.add(mesh); made.push(mesh); for (const m of list) merged.add(m); }
    // The physics props: each wholly mergeable one into its square's batch for each of its materials.
    const spans = new Map(), woke = new Set(), batches = new Map(), cellOf = m => Math.floor(m.matrix.elements[12] / PROP_CELL) + ',' + Math.floor(m.matrix.elements[14] / PROP_CELL);
    for (const [i, G] of props) { const ms = G.children.filter(o => o.isMesh); if (!ms.length || ms.length !== G.children.length || !ms.every(mergeable)) continue;
      for (const m of ms) { const k = keyOf(m) + '@' + cellOf(m); (batches.get(k) || batches.set(k, []).get(k)).push(m); m.userData.prop = i; } spans.set(i, []); }
    for (const list of batches.values()) { const mat = list[0].material.clone(); mat.onBeforeCompile = list[0].material.onBeforeCompile; mat.customProgramCacheKey = list[0].material.customProgramCacheKey;
      const own = list.map(m => Object.assign(Object.create(m), { material: m === list[0] ? mat : m.material }));   // (the batch's own material: each prop keeps its own for when it is drawn alone)
      const { mesh, spans: sp } = mergedMesh(own), pos = mesh.geometry.attributes.position, saved = pos.array.slice(); mesh.layers.enable(CASTER_LAYER); root.add(mesh); made.push(mesh);
      list.forEach((m, j) => spans.get(m.userData.prop).push({ pos, saved, first: sp[j][0], count: sp[j][1] })); }
    for (const i of spans.keys()) props.get(i).visible = false;   // (drawn in their batches until knocked)
    root.userData.propBatch = {
      wake(i) { const B = spans.get(i); if (!B || woke.has(i)) return; woke.add(i); props.get(i).visible = true;
        for (const s of B) { const a = s.pos.array, o = s.first * 3, x = a[o], y = a[o + 1], z = a[o + 2]; for (let j = o; j < o + s.count * 3; j += 3) { a[j] = x; a[j + 1] = y; a[j + 2] = z; } s.pos.addUpdateRange(o, s.count * 3); s.pos.needsUpdate = true; } },
      rest() { for (const i of woke) { props.get(i).visible = false; for (const s of spans.get(i)) { const o = s.first * 3, e = o + s.count * 3; s.pos.array.set(s.saved.subarray(o, e), o); s.pos.addUpdateRange(o, s.count * 3); s.pos.needsUpdate = true; } } woke.clear(); },
      batched: i => spans.has(i) && !woke.has(i),
    };
    if (merged.size) { const keepGeo = new Set(); for (const m of meshes) if (!merged.has(m)) keepGeo.add(m.geometry); const mats = new Set(made.map(m => m.material));
      for (const m of merged) { m.removeFromParent(); if (!keepGeo.has(m.geometry)) m.geometry.dispose(); if (!mats.has(m.material)) m.material.dispose(); } }
    root.userData.merged = { fixed: [still.length, still.length - merged.size + made.length - batches.size], props: [[...spans.values()].reduce((n, B) => n + B.length, 0), batches.size] };   // (meshes before → after: tests)
    const keepM = meshes.filter(m => !merged.has(m)), keepS = still.filter(m => !merged.has(m)); meshes.length = 0; meshes.push(...keepM, ...made); still.length = 0; still.push(...keepS, ...made.filter(m => !m.layers.isEnabled(CASTER_LAYER)));
  }
  root.userData.keep = false; root.userData.cs2Render = id; root.userData.baked = !!light;
  if (r) { for (const t of textures) r.initTexture(t); const sc = globalThis.__infra?.scene, cam = globalThis.__infra?.camera; if (sc && cam && r.compileAsync) { const all = cam.clone(); all.layers.enableAll(); r.compileAsync(root.userData.casters || root, all, sc).catch(() => {}); } if (sc && cam && r.compileAsync) r.compileAsync(root, cam, sc).catch(() => {}); }   // textures uploaded and shaders built now, on the loading screen
  root.userData.worldCasters = () => { if (!root.userData.casters) { const cr = buildCasters(still); root.add(cr); root.userData.casters = cr; } return root.userData.casters; };   // (tests: the sun's fit)
  root.userData.movers = movers; root.userData.props = props; kept = { id, root, textures, meshes }; return root;
}
function dispose(k) { k.root.userData.casters?.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); for (const m of k.meshes) { m.geometry.dispose(); m.material.dispose(); m.removeFromParent(); } for (const t of k.textures) t.dispose(); for (const G of k.root.userData.movers.values()) G.removeFromParent(); for (const G of k.root.userData.props?.values() || []) G.removeFromParent(); k.root.removeFromParent(); }   // (a door's group may hang from its hinge, outside the root)
