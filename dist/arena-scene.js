// Builds the active arena map in 3D (only one at a time, far south of the hall) and answers collision and
// spawn questions. Walls use world-scaled texture coordinates, so brick, plaster and container ribs keep their
// size on every wall. One merged mesh per material keeps the whole map to a dozen draw calls.
import * as THREE from './three.module.js';
import { ARENA } from './facility-layout.js';
import { ARENA_MAPS, mapBoxes, walkable } from './arena-maps.js';

function tex(draw, size = 256) {
  try { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); if (typeof g?.fillRect !== 'function') return null; draw(g, size);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; } catch { return null; }
}
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const speckle = (g, s, base, amp, n = 4000) => { g.fillStyle = base; g.fillRect(0, 0, s, s); for (let i = 0; i < n; i++) { const v = (rnd() - .5) * amp; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); } };
// [texture, world units per texture tile]
const LOOK = {
  sand: [g => { speckle(g, 256, '#c8a46e', .16); g.strokeStyle = 'rgba(90,60,30,.25)'; for (let y = 0; y < 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); } }, 24],
  plaster: [g => { speckle(g, 256, '#d9cdb4', .12); for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(120,95,60,${rnd() * .12})`; g.fillRect(rnd() * 256, rnd() * 256, 40 + rnd() * 60, 20 + rnd() * 40); } }, 30],
  concrete: [g => { speckle(g, 256, '#8c8c87', .14); g.strokeStyle = 'rgba(40,40,40,.25)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254); }, 20],
  brick: [g => { g.fillStyle = '#8a4a34'; g.fillRect(0, 0, 256, 256); for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) { g.fillStyle = `hsl(14,${38 + rnd() * 12}%,${28 + rnd() * 10}%)`; g.fillRect(c * 56 + (r % 2) * 28 - 28 + 2, r * 32 + 2, 52, 28); } }, 12],
  stone: [g => { speckle(g, 256, '#a79a84', .18); g.strokeStyle = 'rgba(60,50,40,.35)'; for (let i = 0; i < 9; i++) g.strokeRect(rnd() * 200, rnd() * 200, 40 + rnd() * 60, 30 + rnd() * 40); }, 16],
  wood: [g => { g.fillStyle = '#7a5230'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 3) { g.fillStyle = `rgba(40,20,5,${rnd() * .3})`; g.fillRect(x, 0, 1, 256); } for (let y = 0; y < 256; y += 64) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, 256, 3); } }, 8],
  crate: [g => { g.fillStyle = '#9a6b37'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 3) { g.fillStyle = `rgba(50,25,5,${rnd() * .25})`; g.fillRect(x, 0, 1, 256); } g.strokeStyle = '#5a3a18'; g.lineWidth = 18; g.strokeRect(9, 9, 238, 238); g.beginPath(); g.moveTo(9, 9); g.lineTo(247, 247); g.stroke(); }, 8],
  'metal-red': [g => { g.fillStyle = '#8f2a22'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 5, 256); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 6, 0, 3, 256); } speckle(g, 256, 'rgba(0,0,0,0)', .1, 1500); }, 10],
  'metal-blue': [g => { g.fillStyle = '#244f7a'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 5, 256); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 6, 0, 3, 256); } }, 10],
  'metal-green': [g => { g.fillStyle = '#3d6236'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 5, 256); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 6, 0, 3, 256); } }, 10],
  roof: [g => { speckle(g, 256, '#6d5f52', .15); for (let y = 0; y < 256; y += 20) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, y, 256, 3); } }, 14],
};
const mats = new Map();
function material(name) {
  if (mats.has(name)) return mats.get(name); const [draw] = LOOK[name] || LOOK.concrete, map = tex(draw);
  const m = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0x999999, roughness: name.startsWith('metal') ? .55 : .9, metalness: name.startsWith('metal') ? .35 : 0 }); m.userData.shared = true; mats.set(name, m); return m;
}
// A box with world-scaled UVs (each face tiles its texture by its own size).
function boxGeometry(b, tile) {
  const w = b.maxX - b.minX, h = b.y1 - b.y0, d = b.maxZ - b.minZ, g = new THREE.BoxGeometry(w, h, d);
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i) + (b.minX + b.maxX) / 2, y = P.getY(i) + (b.y0 + b.y1) / 2, z = P.getZ(i) + (b.minZ + b.maxZ) / 2, nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i));
    U.setXY(i, (nx > .5 ? z : x) / tile, (ny > .5 ? z : y) / tile); }
  g.translate((b.minX + b.maxX) / 2, (b.y0 + b.y1) / 2, (b.minZ + b.maxZ) / 2); return g;
}
function merge(geos) {
  const P = [], N = [], U = [], I = []; let base = 0;
  for (const g of geos) { const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); U.push(u.getX(i), u.getY(i)); } for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + base); base += p.count; g.dispose(); }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); m.setIndex(I); m.computeBoundingSphere(); return m;
}

// Bomb-site markings (defuse maps): a painted circle with the letter, one shared material per letter.
const SITE_MAT = {}; for (const L of ['A', 'B']) { let map = null; try { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); if (typeof g?.arc === 'function') { g.strokeStyle = 'rgba(255,214,90,.85)'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,214,90,.9)'; g.font = '900 150px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L, 128, 138); map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; } } catch {}
  SITE_MAT[L] = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : 0xffd65a, transparent: true, opacity: .8, depthWrite: false }); SITE_MAT[L].userData.shared = true; }
const SITE_GEO = new THREE.PlaneGeometry(1, 1); SITE_GEO.userData.shared = true;
// One small box per arena material (every map), for the graphics warm-up: compiles their shaders and uploads
// their textures before anyone enters the arena.
export function arenaWarmMeshes() {
  const names = new Set(); for (const m of Object.values(ARENA_MAPS)) { names.add(m.floor); for (const s of m.solids) names.add(s[5]); }
  return [...[...names].map((n, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material(n)); m.position.x = i * 2; m.castShadow = m.receiveShadow = true; return m; }), ...Object.values(SITE_MAT).map(m => new THREE.Mesh(SITE_GEO, m))];
}
export function createArenaScene(scene, { pickables = [] } = {}) {
  const group = new THREE.Group(); group.name = 'arena'; group.visible = false; scene.add(group);
  let current = null, boxes = [], bounds = null, savedBg = null, savedFog = null;
  function clearMap() { for (const o of [...group.children]) { if (o.userData.ground) continue;   // dropped guns: arena-ui owns them
    group.remove(o); if (!o.geometry?.userData.shared) o.geometry?.dispose(); const i = pickables.indexOf(o); if (i >= 0) pickables.splice(i, 1); } boxes = []; current = null; }
  function build(id) {
    if (current === id) return; clearMap(); const map = ARENA_MAPS[id]; if (!map) return; current = id;
    const cx = ARENA.cx, cz = ARENA.cz, [sw, sd] = map.size; boxes = mapBoxes(map, cx, cz); bounds = { minX: cx - sw / 2, maxX: cx + sw / 2, minZ: cz - sd / 2, maxZ: cz + sd / 2 };
    const byMat = new Map(); for (const b of boxes) { const [, tile] = LOOK[b.mat] || LOOK.concrete; (byMat.get(b.mat) || byMat.set(b.mat, []).get(b.mat)).push(boxGeometry(b, tile)); }
    const floor = { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ, y0: -1, y1: 0 }; (byMat.get(map.floor) || byMat.set(map.floor, []).get(map.floor)).push(boxGeometry(floor, (LOOK[map.floor] || LOOK.concrete)[1]));
    for (const [mat, geos] of byMat) { const mesh = new THREE.Mesh(merge(geos), material(mat)); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.arena = true; group.add(mesh); pickables.push(mesh); }
    for (const [L, [x, z, r]] of Object.entries(map.sites || {})) { const s = new THREE.Mesh(SITE_GEO, SITE_MAT[L]); s.rotation.x = -Math.PI / 2; s.position.set(cx + x, .06, cz + z); s.scale.setScalar(r * 1.6); s.renderOrder = 1; group.add(s); }
  }
  return {
    group,
    get map() { return current; }, get boxes() { return boxes; }, get bounds() { return bounds; },
    // Show / hide the arena (and swap the dark indoor background for a sky while inside it).
    show(id) { build(id); group.visible = true; if (savedBg === null) { savedBg = scene.background; savedFog = scene.fog; } const map = ARENA_MAPS[id]; scene.background = new THREE.Color(map?.sky || 0x9fb8cc); scene.fog = new THREE.FogExp2(map?.sky || 0x9fb8cc, .0011); },   // light haze: the far side of the map stays visible   // same fog type as the hall: every compiled shader is reused (no hitch on entering)
    hide() { group.visible = false; if (savedBg !== null) { scene.background = savedBg; scene.fog = savedFog; savedBg = null; } },
    inArena: z => z < ARENA.maxZ,
    clear(x, z) { return !!bounds && walkable(boxes, bounds, x, z); },
    // What the feet are on at (x, z) with feet at height y, for footstep sounds: wood, metal, grass (sand) or concrete.
    surfaceAt(x, z, y = 0) { const b = y > .3 && boxes.find(b => Math.abs(b.y1 - y) < .6 && x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1), m = b ? b.mat : ARENA_MAPS[current]?.floor || 'concrete';
      return /wood|crate/.test(m) ? 'wood' : /metal/.test(m) ? 'metal' : /sand/.test(m) ? 'grass' : 'concrete'; },
    spawnFor(i) { const map = ARENA_MAPS[current]; if (!map) return null; const s = map.spawns[((i % map.spawns.length) + map.spawns.length) % map.spawns.length]; return { x: ARENA.cx + s[0], z: ARENA.cz + s[1] }; },
  };
}
