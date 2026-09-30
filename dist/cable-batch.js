// Cable batching: many thin tube meshes (data links, power cords) drawn as ONE vertex-coloured mesh.
// Each source tube keeps its own mesh for picking/particles/focus; while it is batched that mesh sits on
// a layer the camera does not draw, and its colour/opacity is written into the merged mesh (RGBA vertex
// colours). A tube that needs its own look (focused cable, highlighted path) is drawn individually.
// The merged geometry is rebuilt only when the set of tubes changes; colours only when a tube's state does.
import * as THREE from './three.module.js';

export const BATCHED_LAYER = 3;
const color = new THREE.Color();

export function createCableBatch(scene, { depthWrite = true } = {}) {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, alphaTest: .01, depthWrite });
  let mesh = null, items = [], ranges = [], keys = [];
  function rebuild(meshes) {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    let vertices = 0, indices = 0;
    for (const m of meshes) { vertices += m.geometry.attributes.position.count; indices += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
    const pos = new Float32Array(vertices * 3), col = new Float32Array(vertices * 4), idx = new (vertices > 65535 ? Uint32Array : Uint16Array)(indices), p = new THREE.Vector3();
    let v = 0, i = 0; ranges = [];
    for (const m of meshes) {
      m.updateMatrixWorld(); const P = m.geometry.attributes.position, g = m.geometry;
      for (let k = 0; k < P.count; k++) { p.fromBufferAttribute(P, k).applyMatrix4(m.matrixWorld); pos.set([p.x, p.y, p.z], (v + k) * 3); }
      if (g.index) for (let k = 0; k < g.index.count; k++) idx[i++] = g.index.getX(k) + v; else for (let k = 0; k < P.count; k++) idx[i++] = v + k;
      ranges.push([v, P.count]); v += P.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    mesh = new THREE.Mesh(geo, material); mesh.name = 'cable-batch'; mesh.frustumCulled = false; scene.add(mesh);
    items = meshes.slice(); keys = meshes.map(() => '');
  }
  return {
    // list: [{ mesh, batched, visible, color, opacity }] in a stable order.
    update(list) {
      const meshes = list.map(x => x.mesh);
      if (meshes.length !== items.length || meshes.some((m, k) => m !== items[k])) rebuild(meshes);
      if (!mesh) return;
      const col = mesh.geometry.attributes.color; let dirty = false;
      list.forEach((x, k) => {
        x.mesh.layers.set(x.batched ? BATCHED_LAYER : 0);
        const alpha = x.batched && x.visible ? x.opacity : 0, key = alpha ? x.color + ':' + alpha : '0';
        if (key === keys[k]) return; keys[k] = key; dirty = true;
        color.setHex(x.color); const [start, count] = ranges[k];
        for (let q = start; q < start + count; q++) col.setXYZW(q, color.r, color.g, color.b, alpha);
      });
      if (dirty) col.needsUpdate = true;
    },
    get mesh() { return mesh; },
  };
}
