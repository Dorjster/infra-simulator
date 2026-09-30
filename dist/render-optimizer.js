// Rendering performance helpers. Static, non-interactive meshes that share a parent and material are
// merged into one mesh (one draw call). Meshes with gameplay metadata (ports, sockets, buttons,
// device bodies, office monitors) are never merged; rack/wall "occluder" meshes are merged and the
// merged mesh keeps the occluder flag so aiming and picking behave as before.
import * as THREE from './three.module.js';

// Pick proxies (port housings that must stay raycastable per instance) are moved to this layer: the
// camera does not draw them, the game's raycasters test it, and their look is baked into the merge.
export const PICK_LAYER = 2;
export function pickAllLayers(raycaster) { raycaster.layers.enable(PICK_LAYER); return raycaster; }

function mergeGeometries(list) {
  let vertices = 0, indices = 0; const hasUV = list.every(({ g }) => g.attributes.uv);
  for (const { g } of list) { vertices += g.attributes.position.count; indices += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vertices * 3), nor = new Float32Array(vertices * 3), uv = hasUV ? new Float32Array(vertices * 2) : null, idx = new (vertices > 65535 ? Uint32Array : Uint16Array)(indices);
  let v = 0, i = 0; const normalMatrix = new THREE.Matrix3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  for (const { g, m } of list) {
    normalMatrix.getNormalMatrix(m);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let k = 0; k < P.count; k++) {
      p.fromBufferAttribute(P, k).applyMatrix4(m); pos.set([p.x, p.y, p.z], (v + k) * 3);
      n.fromBufferAttribute(N, k).applyMatrix3(normalMatrix).normalize(); nor.set([n.x, n.y, n.z], (v + k) * 3);
      if (uv) uv.set([U.getX(k), U.getY(k)], (v + k) * 2);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[i++] = g.index.getX(k) + v;
    else for (let k = 0; k < P.count; k++) idx[i++] = v + k;
    v += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

export function mergeStatic(root, pickables = [], { min = 3, skipOccluders = false } = {}) {
  if (!root) return 0;
  const pick = new Set(pickables), buckets = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.children.length || o.visible === false || Array.isArray(o.material) || o.layers.mask === 1 << PICK_LAYER) return;
    // Instanced batches without metadata or per-instance colour (vents, screws, bay slots, port
    // housings) are baked into the same merged mesh as the plain meshes of their parent + material.
    if (o.isInstancedMesh && (o.instanceColor || o.count > 256)) return;
    const keys = Object.keys(o.userData || {}), occluder = keys.length === 1 && o.userData.occluder === true;
    // Pickable port housings, port sockets and PSU inlets: static look, per-object pick metadata.
    const u = o.userData || {}, proxy = o.isInstancedMesh ? !!u.portIndices : !!u.node && (u.powerPSU !== undefined || !!u.port) && !o.material.wireframe;
    if (keys.length && !occluder && !proxy) return;
    if (occluder && skipOccluders) return;
    if (pick.has(o) && !occluder && !proxy) return;
    const g = o.geometry; if (!g?.attributes?.position || !g.attributes.normal || g.morphAttributes?.position) return;
    if (o.material.transparent || o.material.map || o.material.wireframe) return;
    const key = o.parent.uuid + '|' + o.material.uuid + '|' + occluder;
    if (!buckets.has(key)) buckets.set(key, { parent: o.parent, material: o.material, occluder, meshes: [], instanced: false });
    const b = buckets.get(key); b.meshes.push(o); if (o.isInstancedMesh) b.instanced = true; if (proxy) o.userData.__proxy = true;
  });
  let removed = 0; const im = new THREE.Matrix4();
  for (const b of buckets.values()) {
    if (b.meshes.length < (b.instanced ? 2 : min)) { for (const o of b.meshes) delete o.userData.__proxy; continue; }
    const list = [];
    for (const o of b.meshes) {
      o.updateMatrix();
      if (!o.isInstancedMesh) { list.push({ g: o.geometry, m: o.matrix.clone() }); continue; }
      for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, im); list.push({ g: o.geometry, m: o.matrix.clone().multiply(im) }); }
    }
    const merged = new THREE.Mesh(mergeGeometries(list), b.material);
    merged.name = 'merged-static'; merged.castShadow = b.meshes.some(o => o.castShadow); merged.receiveShadow = b.meshes.some(o => o.receiveShadow);
    if (b.occluder) { merged.userData = { occluder: true }; pickables.push(merged); }
    for (const o of b.meshes) {
      if (o.userData.__proxy) { delete o.userData.__proxy; o.layers.set(PICK_LAYER); continue; }
      b.parent.remove(o); const at = pickables.indexOf(o); if (at >= 0) pickables.splice(at, 1);
    }
    b.parent.add(merged); removed += b.meshes.length - 1;
  }
  return removed;
}

// Label atlas: static text plates (canvas textures flagged `userData.staticText`) are copied into shared
// 2048×2048 atlas pages (512×64 cells) and every plate under one parent that uses the same page is merged
// into one mesh, so a device's model name, port captions and service-port labels cost one draw call.
const ATLAS = 2048, CELL_W = 512, CELL_H = 64, PER_PAGE = (ATLAS / CELL_W) * (ATLAS / CELL_H);
const pages = [], cells = new Map();
let supported;
// Headless test environments stub canvases without drawImage: plates then stay individual meshes.
function atlasSupported() { if (supported === undefined) { try { supported = typeof document.createElement('canvas').getContext('2d')?.drawImage === 'function'; } catch { supported = false; } } return supported; }
function atlasCell(texture) {
  const image = texture.image; if (cells.has(image)) return cells.get(image);
  if (!atlasSupported()) return null;
  let page = pages.findLast(p => p.colorSpace === texture.colorSpace);
  if (!page || page.used >= PER_PAGE) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = ATLAS;
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = texture.colorSpace;
    page = { canvas, ctx: canvas.getContext('2d'), map, used: 0, colorSpace: texture.colorSpace, material: new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }) };
    pages.push(page);
  }
  // Column-major slots of 64 px; squarer canvases (e.g. 512×128) take two slots to keep their height.
  const rows = ATLAS / CELL_H, span = image.height / image.width * CELL_W > 80 ? 2 : 1;
  if (span === 2 && page.used % rows === rows - 1) page.used++;
  if (page.used + span > PER_PAGE) { page.used = PER_PAGE; return atlasCell(texture); }
  const k = page.used; page.used += span;
  const x = Math.floor(k / rows) * CELL_W, y = (k % rows) * CELL_H, h = span * CELL_H;
  page.ctx.drawImage(image, x + 2, y + 2, CELL_W - 4, h - 4); page.map.needsUpdate = true;
  // UV rectangle (flipY: canvas top row is v = 1).
  const cell = { page, u0: (x + 2) / ATLAS, u1: (x + CELL_W - 2) / ATLAS, v0: 1 - (y + h - 2) / ATLAS, v1: 1 - (y + 2) / ATLAS };
  cells.set(image, cell); return cell;
}
export function mergePlates(root, { min = 2 } = {}) {
  if (!root || typeof document === 'undefined') return 0;
  const buckets = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.children.length || o.visible === false || !o.parent) return;
    const batch = o.userData?.plateBatch;
    if (!batch && (o.geometry?.type !== 'PlaneGeometry' || !o.material?.map?.userData?.staticText || !o.material.transparent || Object.keys(o.userData || {}).length || o.material.opacity !== 1 || !(o.material.map.image?.getContext))) return;
    const cell = batch ? null : atlasCell(o.material.map), page = batch ? pages.find(p => p.material === o.material) : cell?.page; if (!page) return;
    const key = o.parent.uuid + '|' + pages.indexOf(page);
    if (!buckets.has(key)) buckets.set(key, { parent: o.parent, page, list: [] });
    buckets.get(key).list.push({ o, cell });
  });
  let removed = 0;
  for (const b of buckets.values()) {
    if (b.list.length < min) continue;
    const parts = [];
    let reach = 0; const v = new THREE.Vector3();
    for (const { o, cell } of b.list) {
      o.updateMatrix(); let g = o.geometry;
      if (cell) { g = g.clone(); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, cell.u0 + uv.getX(k) * (cell.u1 - cell.u0), cell.v0 + uv.getY(k) * (cell.v1 - cell.v0)); o.getWorldScale(v); reach = Math.max(reach, (g.parameters?.width || 1) * Math.max(v.x, v.y) * 22); }
      else reach = Math.max(reach, o.userData.cullDistance || 0);
      parts.push({ g, m: o.matrix.clone() });
    }
    const merged = new THREE.Mesh(mergeGeometries(parts), b.page.material);
    merged.name = 'label-atlas'; merged.renderOrder = Math.max(...b.list.map(x => x.o.renderOrder || 0));
    merged.userData = { plateBatch: true, cullDistance: reach };
    for (const { o } of b.list) b.parent.remove(o);
    b.list.forEach(({ cell }, k) => { if (cell) parts[k].g.dispose(); });
    b.parent.add(merged); removed += b.list.length - 1;
  }
  return removed;
}

// Hide small text plates when they are too far away to be legible (cheap distance test, throttled).
export function createDetailCuller(camera) {
  const items = [], seen = new WeakSet();
  const v = new THREE.Vector3();
  return {
    // Legibility-based distance: a plate stays visible up to ~22x its world width (min `maxDistance`).
    register(root, maxDistance = 16) { root?.traverse(o => { if (!o.isMesh || seen.has(o)) return; if (o.userData?.plateBatch) { seen.add(o); const max = Math.max(maxDistance, o.userData.cullDistance || 0); items.push({ o, max, max2: max * max, center: o.geometry.boundingSphere?.center.clone() }); return; } if (o.geometry?.type !== 'PlaneGeometry' || !o.material?.map || Object.keys(o.userData || {}).length) return; seen.add(o); o.getWorldScale(v); const w = (o.geometry.parameters?.width || 1) * Math.max(v.x, v.y), max = Math.max(maxDistance, w * 22); items.push({ o, max, max2: max * max }); }); },
    update() { for (let k = items.length - 1; k >= 0; k--) { const it = items[k]; if (!it.o.parent) { items.splice(k, 1); continue; } if (it.center) v.copy(it.center).applyMatrix4(it.o.matrixWorld); else it.o.getWorldPosition(v); const near = v.distanceToSquared(camera.position) < it.max2; if (it.o.visible !== near) it.o.visible = near; } },
    get size() { return items.length; },
  };
}
