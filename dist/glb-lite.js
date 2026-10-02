// Minimal binary glTF (.glb) loader for one skinned character: node hierarchy (TRS), one skinned mesh with
// POSITION / NORMAL / TEXCOORD_0 / JOINTS_0 / WEIGHTS_0, and a PBR material with base colour and normal maps.
// Returns { root, mesh, bones } where bones maps node names to THREE.Bone. Enough for the casino dancer
// without shipping the full GLTFLoader.
import * as THREE from './three.module.js';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

export async function loadGlb(url) {
  const res = await fetch(url); if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = await res.arrayBuffer(), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`${url}: not a GLB`);
  const jsonLen = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const viewBytes = i => { const v = json.bufferViews[i]; return new Uint8Array(buf, binStart + (v.byteOffset || 0), v.byteLength); };
  const accessor = i => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], C = ARRAYS[a.componentType], n = COMPONENTS[a.type];
    const start = binStart + (v.byteOffset || 0) + (a.byteOffset || 0), copy = buf.slice(start, start + a.count * n * C.BYTES_PER_ELEMENT);
    return { array: new C(copy), size: n, normalized: !!a.normalized };
  };
  const texture = async (index, srgb) => {
    if (index === undefined) return null;
    const img = json.images[json.textures[index].source], blob = new Blob([viewBytes(img.bufferView)], { type: img.mimeType });
    const bitmap = await createImageBitmap(blob), t = new THREE.Texture(bitmap);
    t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t;
  };
  // Nodes: bones for skin joints, groups for the rest.
  const jointSet = new Set((json.skins || []).flatMap(s => s.joints)), objs = json.nodes.map((n, i) => {
    const o = jointSet.has(i) ? new THREE.Bone() : new THREE.Group(); o.name = n.name || '';
    if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale);
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    return o;
  });
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const root = new THREE.Group(); for (const i of json.scenes[json.scene || 0].nodes) root.add(objs[i]);
  let mesh = null;
  for (const [i, n] of json.nodes.entries()) {
    if (n.mesh === undefined) continue;
    const prim = json.meshes[n.mesh].primitives[0], geo = new THREE.BufferGeometry(), names = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', JOINTS_0: 'skinIndex', WEIGHTS_0: 'skinWeight' };
    for (const [k, name] of Object.entries(names)) { if (prim.attributes[k] === undefined) continue; const a = accessor(prim.attributes[k]); geo.setAttribute(name, new THREE.BufferAttribute(a.array, a.size, a.normalized)); }
    if (prim.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(accessor(prim.indices).array, 1));
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const m = json.materials?.[prim.material] || {}, pbr = m.pbrMetallicRoughness || {};
    const mat = new THREE.MeshStandardMaterial({
      map: await texture(pbr.baseColorTexture?.index, true), normalMap: await texture(m.normalTexture?.index, false),
      metalness: pbr.metallicFactor ?? 0, roughness: pbr.roughnessFactor ?? .6, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (pbr.baseColorFactor) mat.color.fromArray(pbr.baseColorFactor);
    const skin = n.skin !== undefined ? json.skins[n.skin] : null, obj = skin ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
    obj.name = n.name || 'mesh'; objs[i].add(obj); mesh = obj;
    if (skin) {
      const ibm = accessor(skin.inverseBindMatrices).array, inverses = skin.joints.map((_, k) => new THREE.Matrix4().fromArray(ibm, k * 16));
      root.updateMatrixWorld(true); obj.bind(new THREE.Skeleton(skin.joints.map(j => objs[j]), inverses), obj.matrixWorld);
    }
  }
  const bones = {}; root.traverse(o => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
  return { root, mesh, bones };
}
