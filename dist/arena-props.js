// Map props and decoration, drawn (arena-scene.js builds them with the map). Props are the shapes of their collision
// boxes (arena-mapkit.js): barrels, cars, trucks, stalls, carts, sandbags, palms, trees, lamps (with light), fountains,
// wells, benches, bollards, planters, forklifts. Decoration never collides: windows with shutters, painted signs,
// awnings. Each part is one InstancedMesh per kind of part (a whole map's props in a few draw calls), with shared
// materials so nothing recompiles when maps change.
import * as THREE from './three.module.js';

const canvasTex = (w, h, draw) => { try { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (typeof g?.fillRect !== 'function') return null; draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; } catch { return null; } };
const stripes = (a, b) => canvasTex(64, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 8, 0, 8, 64); } g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 56, 64, 8); });
const M = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: .8, metalness: 0, ...o }); m.userData.shared = true; return m; };
const MAT = {
  steel: M({ color: 0x4f565c, roughness: .5, metalness: .6 }), dark: M({ color: 0x24282c, roughness: .6, metalness: .4 }), rubber: M({ color: 0x18191b, roughness: .9 }),
  glass: M({ color: 0x1b2a33, roughness: .15, metalness: .3 }), light: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
  wood: M({ color: 0x7a5230, roughness: .85 }), darkwood: M({ color: 0x4a3220, roughness: .85 }), sand: M({ color: 0xbfa67a, roughness: 1 }), hay: M({ color: 0xd8b85a, roughness: 1 }),
  stone: M({ color: 0xa79a84, roughness: .95 }), water: M({ color: 0x3f7f9a, roughness: .1, metalness: .2, transparent: true, opacity: .85 }),
  trunk: M({ color: 0x7b6243, roughness: 1 }), leaf: M({ color: 0x4f7a32, roughness: .9, side: THREE.DoubleSide }), bush: M({ color: 0x3f6a2c, roughness: 1 }),
  frame: M({ color: 0x5a4330, roughness: .8 }), windowDark: M({ color: 0x1d242a, roughness: .3, metalness: .2 }),
};
for (const m of Object.values(MAT)) m.userData.shared = true;
const paintCache = new Map(), paint = hex => { if (!paintCache.has(hex)) paintCache.set(hex, M({ color: hex, roughness: .45, metalness: .3 })); return paintCache.get(hex); };
const awnCache = new Map(), awnMat = (a, b) => { const k = a + ':' + b; if (!awnCache.has(k)) { const m = M({ map: stripes('#' + a.toString(16).padStart(6, '0'), '#' + b.toString(16).padStart(6, '0')), side: THREE.DoubleSide, roughness: .9 }); awnCache.set(k, m); } return awnCache.get(k); };
const shutterCache = new Map(), shutterMat = hex => { if (!shutterCache.has(hex)) shutterCache.set(hex, M({ color: hex, roughness: .8 })); return shutterCache.get(hex); };
const signCache = new Map();
function signMat(text, color) { const k = text + color; if (signCache.has(k)) return signCache.get(k);
  const map = canvasTex(256, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '900 86px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillText(text, w / 2 + 3, h / 2 + 4); g.fillStyle = color; g.fillText(text, w / 2, h / 2); });
  const m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); m.userData.shared = true; signCache.set(k, m); return m; }
// Geometries (shared).
const G = {
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8), box: new THREE.BoxGeometry(1, 1, 1), cone: new THREE.ConeGeometry(1, 1, 10), sphere: new THREE.SphereGeometry(1, 14, 10),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2), leaf: (() => { const g = new THREE.PlaneGeometry(1, 1, 4, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + .5; p.setY(i, p.getY(i) * (1 - x * .7)); p.setZ(i, -x * x * .35); } g.translate(.5, 0, 0); g.computeVertexNormals(); return g; })(),
  plane: new THREE.PlaneGeometry(1, 1),
};
for (const g of Object.values(G)) g.userData.shared = true;
// Collects instances per (geometry, material) and makes one InstancedMesh each.
function batcher() { const groups = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  return { add(geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) { const k = geo.uuid + mat.uuid; let g = groups.get(k); if (!g) groups.set(k, g = { geo, mat, list: [] }); g.list.push(m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz, 'YXZ')), s.set(sx, sy, sz)).clone()); },
    meshes() { const out = []; for (const { geo, mat, list } of groups.values()) { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); out.push(im); } return out; } };
}
// Build every prop and decoration of a map; (cx, cz): the arena centre. Returns { meshes, lights }.
export function buildProps(map, cx, cz) {
  const b = batcher(), lights = [];
  for (const P of map.props || []) {
    const x = cx + P.x, z = cz + P.z, y = P.y || 0, w = P.w, d = P.d, h = P.h, rot = P.rot ? Math.PI / 2 : 0, along = P.rot ? 'x' : 'z';
    const col = P.color != null ? paint(P.color) : null;
    switch (P.type) {
      case 'barrel': b.add(G.cyl, col || MAT.steel, x, y + h / 2, z, w / 2, h, w / 2); b.add(G.cyl, MAT.dark, x, y + h * .3, z, w / 2 + .03, .2, w / 2 + .03); b.add(G.cyl, MAT.dark, x, y + h * .7, z, w / 2 + .03, .2, w / 2 + .03); break;
      case 'barrels': for (const k of [-1, 1]) { const bx = x + (P.rot ? 0 : k * 1.35), bz = z + (P.rot ? k * 1.35 : 0); b.add(G.cyl, col || paint(k > 0 ? 0x355e8c : 0x8c3a2e), bx, y + h / 2, bz, 1.3, h, 1.3); b.add(G.cyl, MAT.dark, bx, y + h * .65, bz, 1.33, .2, 1.33); } break;
      case 'car': case 'truck': { const body = col || paint(0x8c3a2e), L = P.rot ? w : d, Wd = P.rot ? d : w, low = P.type === 'truck' ? h * .45 : h * .5;
        b.add(G.box, body, x, y + 1.2 + low / 2, z, w, low, d); const cabL = P.type === 'truck' ? L * .28 : L * .5, off = P.type === 'truck' ? -L / 2 + cabL / 2 : -L * .05, ox = P.rot ? off : 0, oz = P.rot ? 0 : off;
        b.add(G.box, P.type === 'truck' ? body : MAT.glass, x + ox, y + 1.2 + low + (h - 1.2 - low) / 2, z + oz, P.rot ? cabL : Wd * .9, h - 1.2 - low, P.rot ? Wd * .9 : cabL);
        if (P.type === 'truck') b.add(G.box, paint(0x7d6b4c), x + (P.rot ? cabL / 2 : 0), y + 1.2 + low + (h - 1.2 - low) / 2, z + (P.rot ? 0 : cabL / 2), P.rot ? L - cabL : Wd * .95, h - 1.2 - low, P.rot ? Wd * .95 : L - cabL);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wx = P.rot ? sz * L * .33 : sx * Wd / 2, wz = P.rot ? sx * Wd / 2 : sz * L * .33; b.add(G.wheel, MAT.rubber, x + wx, y + 1.3, z + wz, 1.3, Math.max(.8, Wd * .1), 1.3, 0, P.rot ? Math.PI / 2 : 0); } break; }
      case 'stall': { b.add(G.box, MAT.wood, x, y + 1.8, z, w, 3.6, d); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(G.box, MAT.darkwood, x + sx * (w / 2 - .3), y + 5.5, z + sz * (d / 2 - .3), .5, 11, .5);
        b.add(G.box, awnMat(P.color || 0xb03a2e, 0xf2e3c0), x, y + 11.2, z, w + 1.5, .3, d + 1.5); break; }
      case 'cart': { b.add(G.box, MAT.wood, x, y + 2.6, z, w, 2.2, d); for (const s of [-1, 1]) b.add(G.wheel, MAT.darkwood, x + (P.rot ? 0 : s * w / 2), y + 1.6, z + (P.rot ? s * d / 2 : 0), 1.6, .4, 1.6, 0, P.rot ? Math.PI / 2 : 0); b.add(G.box, MAT.darkwood, x + (P.rot ? w * .6 : 0), y + 1.6, z + (P.rot ? 0 : d * .6), P.rot ? 5 : .3, .3, P.rot ? .3 : 5); break; }
      case 'sandbags': for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { const L = (P.rot ? d : w) / 4, off = (i - 1.5 + (r ? .5 : 0)) * L; if (r && i === 3) continue; b.add(G.sphere, MAT.sand, x + (P.rot ? 0 : off), y + 1.2 + r * 2.2, z + (P.rot ? off : 0), P.rot ? 1.5 : L / 2 + .2, 1.25, P.rot ? L / 2 + .2 : 1.5); } break;
      case 'hay': b.add(G.box, MAT.hay, x, y + h / 2, z, w, h, d); break;
      case 'palm': { const segs = 6; for (let i = 0; i < segs; i++) b.add(G.cyl8, MAT.trunk, x + Math.sin(i * .25) * .4, y + (i + .5) * h / segs, z, .8 - i * .07, h / segs + .1, .8 - i * .07);
        for (let i = 0; i < 8; i++) b.add(G.leaf, MAT.leaf, x + Math.sin(segs * .25) * .4, y + h, z, 11, 3, 1, -.35 - (i % 2) * .25, i * Math.PI / 4, 0); break; }
      case 'tree': b.add(G.cyl8, MAT.trunk, x, y + 4, z, .9, 8, .9); b.add(G.cone, MAT.bush, x, y + 13, z, 6, 14, 6); b.add(G.sphere, MAT.bush, x, y + 9, z, 6.5, 4.5, 6.5); break;
      case 'lamp': b.add(G.cyl8, MAT.dark, x, y + h / 2, z, .35, h, .35); b.add(G.box, MAT.dark, x + .9, y + h - .3, z, 2, .3, .3); b.add(G.sphere, MAT.light, x + 1.8, y + h - .8, z, .7, .55, .7);
        if (P.light) lights.push({ x: x + 1.8, y: y + h - 1.4, z }); break;
      case 'fountain': b.add(G.cyl, MAT.stone, x, y + 1.6, z, w / 2, 3.2, w / 2); b.add(G.cyl, MAT.water, x, y + 3.05, z, w / 2 - .7, .2, w / 2 - .7); b.add(G.cyl8, MAT.stone, x, y + 4.5, z, 1.2, 9, 1.2); b.add(G.cyl, MAT.stone, x, y + 9.2, z, 3, .6, 3); break;
      case 'well': b.add(G.cyl, MAT.stone, x, y + 2, z, w / 2, 4, w / 2); for (const s of [-1, 1]) b.add(G.box, MAT.darkwood, x + s * w / 2, y + 6, z, .4, 8, .4); b.add(G.box, MAT.wood, x, y + 10.2, z, w + 2, .4, 3.5); break;
      case 'bench': b.add(G.box, MAT.wood, x, y + 1.8, z, w, .3, d); for (const s of [-1, 1]) b.add(G.box, MAT.dark, x + (P.rot ? 0 : s * w * .4), y + .9, z + (P.rot ? s * d * .4 : 0), P.rot ? d : .3, 1.8, P.rot ? .3 : d); break;
      case 'bollard': b.add(G.cyl8, MAT.dark, x, y + h / 2, z, w / 2, h, w / 2); break;
      case 'planter': b.add(G.box, MAT.stone, x, y + h / 2, z, w, h, d); b.add(G.sphere, MAT.bush, x, y + h + 1, z, w * .45, 2, d * .45); break;
      case 'forklift': b.add(G.box, col || paint(0xd6a21e), x, y + 3, z, w, 4, d * .6); b.add(G.box, MAT.dark, x, y + 7, z, w * .9, 4, d * .3); for (const s of [-1, 1]) b.add(G.wheel, MAT.rubber, x + s * w / 2, y + 1.2, z, 1.2, .8, 1.2); break;
    }
  }
  // Decoration on walls.
  const FACE = { n: [0, -1, Math.PI], s: [0, 1, 0], e: [1, 0, Math.PI / 2], w: [-1, 0, -Math.PI / 2] };
  for (const D of map.decor || []) {
    const [nx, nz, ry] = FACE[D.face] || FACE.s, x = cx + D.x + nx * .08, z = cz + D.z + nz * .08;
    if (D.kind === 'window') { b.add(G.box, MAT.windowDark, x, D.y + D.h / 2, z, nx ? .1 : D.w, D.h, nx ? D.w : .1); b.add(G.box, MAT.frame, x + nx * .1, D.y - .2, z + nz * .1, nx ? .5 : D.w + .8, .4, nx ? D.w + .8 : .5); b.add(G.box, MAT.frame, x + nx * .1, D.y + D.h + .2, z + nz * .1, nx ? .5 : D.w + .8, .4, nx ? D.w + .8 : .5);
      for (const s of [-1, 1]) { const ox = nx ? 0 : s * (D.w / 2 + 1.1), oz = nx ? s * (D.w / 2 + 1.1) : 0; b.add(G.box, shutterMat(D.shutters || 0x2f6d7a), x + ox + nx * .12, D.y + D.h / 2, z + oz + nz * .12, nx ? .15 : 2, D.h, nx ? 2 : .15); } }
    if (D.kind === 'sign') { b.add(G.plane, signMat(D.text, D.color || '#f2e3c0'), x + nx * .03, D.y, z + nz * .03, D.size * 2, D.size, 1, 0, ry, 0); }
    if (D.kind === 'awning') { b.add(G.plane, awnMat(D.color, D.stripes || 0xf2e3c0), x + nx * 2.2, D.y - 1, z + nz * 2.2, D.w, 5, 1, -Math.PI / 2 + .45, ry, 0);
      for (const s of [-1, 1]) b.add(G.cyl8, MAT.dark, x + nx * 4.1 + (nx ? 0 : s * D.w / 2), D.y - 2.6, z + nz * 4.1 + (nx ? s * D.w / 2 : 0), .08, 3.2, .08, nx ? 0 : -.6 * nz, 0, nx ? .6 * nx : 0); }
  }
  return { meshes: b.meshes(), lights };
}
// One of each part kind for the graphics warm-up (instanced, like in play).
export function propWarmMeshes() { const map = { props: ['barrel', 'barrels', 'car', 'truck', 'stall', 'cart', 'sandbags', 'hay', 'palm', 'tree', 'lamp', 'fountain', 'well', 'bench', 'bollard', 'planter', 'forklift'].map((type, i) => ({ type, x: i * 20, z: 0, y: 0, w: 4, d: 6, h: 5, color: 0x8c3a2e, light: false })), decor: [{ kind: 'window', x: 0, z: 0, face: 's', y: 15, w: 4, h: 6, shutters: 0x2f6d7a }, { kind: 'sign', text: 'A', x: 0, z: 0, face: 's', y: 10, size: 5 }, { kind: 'awning', x: 0, z: 0, face: 's', w: 10, y: 15, color: 0xb03a2e }] }; return buildProps(map, 0, -2000).meshes; }
