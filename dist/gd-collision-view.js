// What collides, drawn over the map (Global Defensive: practice and development) — the map you see against the shapes
// the game uses round you: player boxes (green: what bodies stop at), bullet boxes (orange: where a shot may meet a wall;
// on a CS2 map its triangles say where in the box it does — arena-maps.js bulletPath's fine phase), doors and panes
// (cyan; grey while open or broken) and CS2's own triangles (white: stop sight and bullets; magenta: grenades only —
// clips, fences, glass). Within VIEW_R of the camera, drawn through walls; rebuilt when the camera has moved MOVE_R or the
// doors changed, from buffers made once (no garbage in play). Off (COLLISION_VIEW.on false): nothing is made or drawn —
// arena-scene.js reads one flag a frame. On: Practice menu → Collision shapes (campaign-ui.js), the console
// (__infra.lab.arenaScene.debugCollision()), or ?gdcollision in the address.
import * as THREE from './three.module.js';
import { boxesNear } from './box-grid.js';

const DEV = /[?&]gdcollision\b/.test(globalThis.location?.search || '');
export const COLLISION_VIEW = { on: DEV, dev: DEV };   // (dev: asked for by the address or the console — outside practice too)
const VIEW_R = 40, MOVE_R = 5, MAXSEG = 24000, MAXTRI = 8000, EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
export function createCollisionView(parent, boxesOf) {
  const layer = (color, opacity = 1) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXSEG * 6), 3)); g.setDrawRange(0, 0);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false, depthWrite: false })); l.frustumCulled = false; l.renderOrder = 999; l.visible = false; l.userData.gd = true; l.userData.noShadow = true; l.userData.keep = true; parent.add(l);   // (keep: arena-scene clearMap leaves it in the group — clear() hides it till the next map's boxes are drawn)
    return { l, a: g.attributes.position.array, n: 0 }; };
  const L = [layer(0x3dff6a), layer(0xff9a2a), layer(0x30e0ff), layer(0x8a8a8a, .6), layer(0xffffff, .35), layer(0xff3dff, .55)], [PL, BU, MO, OFF, SI, CL] = L;
  const near = [], tri = new Float32Array(MAXTRI * 9), flg = new Uint8Array(MAXTRI), C = new Float32Array(24);
  let cx = Infinity, cy = 0, cz = 0, lastV = -1, shown = false, dirty = true;
  const seg = (Ly, ax, ay, az, bx, by, bz) => { if (Ly.n >= MAXSEG) return; const o = Ly.n++ * 6, a = Ly.a; a[o] = ax; a[o + 1] = ay; a[o + 2] = az; a[o + 3] = bx; a[o + 4] = by; a[o + 5] = bz; };
  const box = (Ly, b) => { for (let k = 0; k < 8; k++) { C[k * 3] = k & 1 ? b.maxX : b.minX; C[k * 3 + 1] = k & 4 ? b.y1 : b.y0; C[k * 3 + 2] = k & 2 ? b.maxZ : b.minZ; }
    for (const [i, j] of EDGES) seg(Ly, C[i * 3], C[i * 3 + 1], C[i * 3 + 2], C[j * 3], C[j * 3 + 1], C[j * 3 + 2]); };
  const inView = b => b.maxX > cx - VIEW_R && b.minX < cx + VIEW_R && b.maxZ > cz - VIEW_R && b.minZ < cz + VIEW_R && b.y1 > cy - VIEW_R && b.y0 < cy + VIEW_R;
  function rebuild(boxes) { for (const Ly of L) Ly.n = 0;
    for (const b of boxesNear(boxes, cx - VIEW_R, cz - VIEW_R, cx + VIEW_R, cz + VIEW_R, near)) if (b.mover == null && !b.off && inView(b)) box(PL, b);   // (boxesNear: the switched-off ones are left out)
    const bl = boxes.bullets; if (bl) for (const b of boxesNear(bl, cx - VIEW_R, cz - VIEW_R, cx + VIEW_R, cz + VIEW_R, near)) if (b.mover == null && inView(b)) box(BU, b);
    for (const b of boxes.movers || []) if (inView(b)) box(b.off ? OFF : MO, b);
    const M = boxes.nadeMesh; if (M?.trianglesIn) { const n = M.trianglesIn(cx - VIEW_R, cy - VIEW_R, cz - VIEW_R, cx + VIEW_R, cy + VIEW_R, cz + VIEW_R, tri, flg, MAXTRI);
      for (let t = 0; t < n; t++) { const Ly = flg[t] ? SI : CL, k = t * 9; seg(Ly, tri[k], tri[k + 1], tri[k + 2], tri[k + 3], tri[k + 4], tri[k + 5]); seg(Ly, tri[k + 3], tri[k + 4], tri[k + 5], tri[k + 6], tri[k + 7], tri[k + 8]); seg(Ly, tri[k + 6], tri[k + 7], tri[k + 8], tri[k], tri[k + 1], tri[k + 2]); } }
    for (const Ly of L) { Ly.l.geometry.setDrawRange(0, Ly.n * 2); Ly.l.geometry.attributes.position.needsUpdate = true; } }
  return {
    // Each frame while shown: rebuilt round the camera when it has moved MOVE_R or the doors changed (v: mapState's).
    update(camera, v) { const boxes = boxesOf(); if (!camera || !boxes?.length) return; const p = camera.position;
      if (!shown) { shown = true; for (const Ly of L) Ly.l.visible = true; }
      if (dirty || v !== lastV || Math.hypot(p.x - cx, p.y - cy, p.z - cz) > MOVE_R) { cx = p.x; cy = p.y; cz = p.z; lastV = v; dirty = false; rebuild(boxes); } },
    hide() { if (!shown) return; shown = false; for (const Ly of L) Ly.l.visible = false; },
    clear() { dirty = true; this.hide(); },   // (a new map: its boxes)
    get shown() { return shown; },
    dispose() { for (const Ly of L) { parent.remove(Ly.l); Ly.l.geometry.dispose(); Ly.l.material.dispose(); } },
  };
}
