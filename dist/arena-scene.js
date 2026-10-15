// Builds the active arena map in 3D (only one at a time, far south of the hall) and answers collision and
// spawn questions. Walls use world-scaled texture coordinates, so brick, plaster and container ribs keep their
// size on every wall. One merged mesh per material keeps the whole map to a dozen draw calls.
import * as THREE from './three.module.js';
import { ARENA } from './facility-layout.js';
import { ARENA_MAPS, MAP_LIST, mapBoxes, walkable, applyMapState } from './arena-maps.js';
import { fx } from './sound-bank.js';
import { THEMES } from './cs-maps/themes.js';
import { buildColumnMeshes } from './cs-mesh.js';
import { buildBspMeshes } from './bsp-mesh.js';
import { buildVbspMeshes } from './vbsp-mesh.js';
import { buildVbspProps } from './vbsp-props-mesh.js';
import { mapRender, placeRender } from './cs2-render.js';
import { warmSmoke } from './arena-nades.js';
import { boxesNear } from './box-grid.js';
const SURF_NEAR = [];
const warmCam = new THREE.PerspectiveCamera(70, 1.6, .1, 5000);
let mapTextures = null;   // a Source map's texture cache (all of it is freed when the map goes, used by a mesh or not)
import { buildProps, propWarmMeshes } from './arena-props.js';
import { anisotropy } from './texture-quality.js';

function tex(draw, size = 256) {
  try { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); if (typeof g?.fillRect !== 'function') return null; draw(g, size);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy(); return t; } catch { return null; }
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
  adobe: [g => { speckle(g, 256, '#c9a97c', .18, 5000); for (let i = 0; i < 18; i++) { g.strokeStyle = `rgba(90,60,30,${.1 + rnd() * .15})`; g.lineWidth = 1; g.beginPath(); let x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - .5) * 40; y += rnd() * 30; g.lineTo(x, y); } g.stroke(); } g.fillStyle = 'rgba(70,45,20,.12)'; g.fillRect(0, 230, 256, 26); }, 26],
  metal: [g => { speckle(g, 256, '#5a6168', .1, 1500); }, 10],
  // Inside roofed tunnels and halls: dim walls, a darker worn floor and a timbered ceiling (dark by themselves, so the
  // tunnel reads as one on every graphics preset, with or without shadows).
  tunnel: [g => { speckle(g, 256, '#6a5641', .2, 5000); g.strokeStyle = 'rgba(30,20,10,.35)'; for (let y = 0; y < 256; y += 48) { g.beginPath(); g.moveTo(0, y + rnd() * 6); g.lineTo(256, y + rnd() * 6); g.stroke(); } }, 22],
  tunnelfloor: [g => { speckle(g, 256, '#7a6448', .2, 5000); for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,28,15,${rnd() * .18})`; g.fillRect(rnd() * 256, rnd() * 256, 20 + rnd() * 50, 10 + rnd() * 30); } }, 20],
  tunnelroof: [g => { g.fillStyle = '#3e3022'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 64) { g.fillStyle = '#2a1f15'; g.fillRect(x, 0, 18, 256); g.fillStyle = 'rgba(255,220,170,.06)'; g.fillRect(x + 18, 0, 3, 256); } speckle(g, 256, 'rgba(0,0,0,0)', .1, 1500); }, 16],
  'crate-dark': [g => { g.fillStyle = '#5e4128'; g.fillRect(0, 0, 256, 256); }, 8], 'crate-metal': [g => { g.fillStyle = '#5d6b58'; g.fillRect(0, 0, 256, 256); }, 8], 'crate-blue': [g => { g.fillStyle = '#3c5c80'; g.fillRect(0, 0, 256, 256); }, 8],
  stoneblock: [g => { speckle(g, 256, '#c9a676', .12); }, 8], fieldblock: [g => { speckle(g, 256, '#8f8f7c', .14); }, 8], fieldstone: [g => { speckle(g, 256, '#8e8b78', .16); }, 12],
  roof: [g => { speckle(g, 256, '#6d5f52', .15); for (let y = 0; y < 256; y += 20) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, y, 256, 3); } }, 14],
};
// Photo textures (CC0, ambientCG — see MODEL-SOURCES.md): file, tint (multiplies the photo) and world units per tile.
// The drawn texture above stands in until the photo has loaded (no shader change: the map is swapped in place).
const PHOTO = {
  sand: ['sand', 0xf2dcb4, 18], adobe: ['plaster', 0xe9cf9e, 14], plaster: ['plaster', 0xf3e4c6, 14], stone: ['stone', 0xffeccc, 12],
  sandstone: ['sandstone', 0xf6d49a, 16], ancientstone: ['ancientstone', 0xe8e4d6, 12], concrete: ['concrete', 0xe9ebe8, 16],
  tunnel: ['plaster', 0xa48a6c, 14], tunnelfloor: ['tunnelfloor', 0xc7ab84, 14], 'metal-blue': ['metal-blue', 0x7d9fcb, 10],
  wood: ['wood', 0xffffff, 8], roof: ['roof', 0xffffff, 6], brick: ['brick', 0xf0e6dc, 10], 'metal-green': ['metal-green', 0xffffff, 10], fieldstone: ['fieldstone', 0xd8dcc6, 12],
  // Crates and blocks, a kind per map (themes.js crate): weathered planks, dark planks, painted metal, stone blocks.
  crate: ['crate', 0xffe2bc, 6], 'crate-dark': ['crate', 0xb08a68, 6], 'crate-metal': ['metal-green', 0xc9d4c4, 8], 'crate-blue': ['metal-blue', 0xa8c0e0, 8],
  stoneblock: ['sandstone', 0xffe6c0, 7], fieldblock: ['fieldstone', 0xcfd6be, 8],
};
const tileOf = name => PHOTO[name]?.[2] ?? (LOOK[name] || LOOK.concrete)[1];
const photoLoader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
function photo(m, name) { const P = PHOTO[name]; if (!P || !photoLoader) return; m.color.setHex(P[1]);
  photoLoader.load(new URL('./textures/' + P[0] + '.jpg', import.meta.url).href, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy(); m.map = t; for (const v of vmats.values()) if (v.userData.base === name) v.map = t; }); }
const mats = new Map();
function material(name) {
  if (mats.has(name)) return mats.get(name); const [draw] = LOOK[name] || LOOK.concrete, map = tex(draw);
  // Map surfaces: Lambert (diffuse) lighting — the walls and floors cover the whole screen, and at Retina resolution the
  // physically based shader cost a few ms a frame for no visible gain on rough plaster, sand and stone.
  const m = name.startsWith('metal') ? new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0x999999, roughness: .55, metalness: .35 }) : new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : 0x999999 }); if (name === 'tunnelroof') m.emissive.setHex(0x1c140c); /* never pitch black from below */ m.userData.shared = true; mats.set(name, m); photo(m, name); return m;
}
// The classic maps' surfaces carry baked shade per vertex (cs-mesh.js: corner shading, wall feet, lit undersides).
const vmats = new Map();
function shadedMaterial(name) { let m = vmats.get(name); if (!m) { m = material(name).clone(); m.vertexColors = true; m.userData.shared = true; m.userData.base = name; vmats.set(name, m); } return m; }
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
  const names = new Set(['crate', 'metal-blue']); for (const { id } of MAP_LIST) { const T = THEMES[id]; if (T) { for (const k of ['wall', 'floor', 'indoorWall', 'indoorFloor', 'car']) if (T[k]) names.add(T[k]); continue; } const m = ARENA_MAPS[id]; names.add(m.floor); for (const s of m.solids) names.add(s[5]); }   /* classic maps: their theme's materials (no build needed) */
  const shadedBox = () => { const g = new THREE.BoxGeometry(1, 1, 1); g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3)); return g; };
  return [...propWarmMeshes(), ...[...names].map((n, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material(n)); m.position.x = i * 2; m.castShadow = m.receiveShadow = true; return m; }), ...[...names].map((n, i) => { const m = new THREE.Mesh(shadedBox(), shadedMaterial(n)); m.position.x = i * 2; m.position.z = 3; m.castShadow = m.receiveShadow = true; return m; }), ...Object.values(SITE_MAT).map(m => new THREE.Mesh(SITE_GEO, m))];
}
export function createArenaScene(scene, { pickables = [] } = {}) {
  const group = new THREE.Group(); group.name = 'arena'; group.userData.gd = true; group.visible = false; scene.add(group);
  let current = null, boxes = [], ladders = [], bounds = null, savedBg = null, savedFog = null;
  // Doors and breakables of a map file (bsp-map.js movers): their mesh groups and how far each has swung / slid.
  let movers = [], lastState = null, lastV = -1;
  // Glass shards when a pane breaks: one small instanced pool, made once (no allocation in play).
  const SH = 72, shards = new THREE.InstancedMesh(new THREE.BoxGeometry(.32, .2, .02), new THREE.MeshBasicMaterial({ color: 0xcfe6ee, transparent: true, opacity: .7, depthWrite: false }), SH), shP = new Float32Array(SH * 3), shV = new Float32Array(SH * 3), shL = new Float32Array(SH), shM = new THREE.Matrix4(), shQ = new THREE.Quaternion(), shE = new THREE.Euler(), shS = new THREE.Vector3(1, 1, 1), shT = new THREE.Vector3(); let shI = 0, shAlive = 0;
  shards.frustumCulled = false; shards.visible = false; shards.userData.keep = true; shards.userData.noShadow = true; for (let i = 0; i < SH; i++) { shM.makeScale(0, 0, 0); shards.setMatrixAt(i, shM); } group.add(shards);
  const shatter = (b, glass) => { const cx = (b.minX + b.maxX) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.minZ + b.maxZ) / 2, n = glass ? 26 : 14;
    for (let k = 0; k < n; k++) { const i = shI++ % SH; shP[i * 3] = b.minX + Math.random() * (b.maxX - b.minX); shP[i * 3 + 1] = b.y0 + Math.random() * (b.y1 - b.y0); shP[i * 3 + 2] = b.minZ + Math.random() * (b.maxZ - b.minZ);
      shV[i * 3] = (Math.random() - .5) * 8; shV[i * 3 + 1] = Math.random() * 4; shV[i * 3 + 2] = (Math.random() - .5) * 8; shL[i] = 1.2 + Math.random() * .6; }
    shards.material.color.setHex(glass ? 0xcfe6ee : 0x8a6a48); shards.visible = true; shAlive = SH; fx(glass ? 'glass' : 'wall', { at: { x: cx, y: cy, z: cz }, volume: glass ? 1 : .8 }); };
  // Outdoor light per map: a strong warm sun (hard building shadows, as on the real maps), the sky's colour from above
  // and the ground's warm bounce from below, a soft fill so no shade is pitch black, and a sky dome — deep blue
  // overhead, pale and hazy at the horizon (the fog takes the horizon colour).
  const fill = new THREE.AmbientLight(0xffffff, .35); fill.userData.keep = true; group.add(fill);
  const DOME = new THREE.SphereGeometry(1000, 32, 16), WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), domeMat = new THREE.MeshBasicMaterial({ map: WHITE, vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });   // (a texture: the High preset's glow pass leaves it alone — an untextured bright material is boosted into bloom and washes the screen white)
  WHITE.needsUpdate = true; domeMat.userData.shared = true; DOME.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(DOME.attributes.position.count * 3), 3));
  DOME.userData.shared = true; const dome = new THREE.Mesh(DOME, domeMat); dome.userData.keep = true; dome.renderOrder = -1; dome.frustumCulled = false; dome.position.set(ARENA.cx, 0, ARENA.cz); group.add(dome);
  function outdoor(id) { const T = THEMES[id] || {}, base = new THREE.Color(T.sky ?? ARENA_MAPS[id]?.sky ?? 0x9fb8cc), warm = !/nuke|cache/.test(id);
    const zenith = base.clone().lerp(new THREE.Color(0x2f6fc8), .6), horizon = base.clone().lerp(new THREE.Color(0xeef3f6), .3);
    return { sun: T.sun ?? 0xfff0d6, sunK: 1.3, sky: base.clone().lerp(new THREE.Color(0xffffff), .25).getHex(), ground: warm ? 0x9a8464 : 0x7d8188, hemiK: .85, zenith: zenith.getHex(), horizon: horizon.getHex(), fill: warm ? 0xfff1dc : 0xeef2f6 }; }
  function sky(L) { fill.color.setHex(L.fill); const P = DOME.attributes.position, C = DOME.attributes.color, z = new THREE.Color(L.zenith), h = new THREE.Color(L.horizon), c = new THREE.Color();
    for (let i = 0; i < P.count; i++) { const t = Math.max(0, P.getY(i) / 1000); c.copy(h).lerp(z, Math.pow(t, .4)); C.setXYZ(i, c.r, c.g, c.b); } C.needsUpdate = true; }
  function clearMap() { movers = []; lastState = null; lastV = -1;
    for (const o of [...group.children]) { if (o.userData.cs2Mover) { o.position.copy(o.userData.base0 ?? o.position); o.rotation.set(0, 0, 0); o.visible = true; o.updateMatrixWorld(true); for (const c of [...o.children]) o.userData.home.attach(c); group.remove(o); continue; }   // (a CS2 look's door: back into the look, shut)
      if (o.userData.mover) { group.remove(o); for (const c of o.children) { c.geometry?.dispose(); c.material.map?.dispose(); c.material.lightMap?.dispose(); c.material.dispose(); } continue; }
      if (o.userData.ground || o.userData.keep) continue;   // dropped guns (arena-ui), the sky dome and fill light stay   // dropped guns: arena-ui owns them
    group.remove(o); if (!o.geometry?.userData.shared) o.geometry?.dispose(); if (o.userData.bsp) { o.material.map?.dispose(); o.material.userData.map2?.dispose(); o.material.lightMap?.dispose(); o.material.dispose(); if (o.isBatchedMesh) o.dispose(); }   /* a prop batch: its own instance textures too */   /* a map file's own textures and light */ const i = pickables.indexOf(o); if (i >= 0) pickables.splice(i, 1); } boxes = []; current = null; mapTextures?.dispose(); mapTextures = null; }
  let builtFrom = null, builtLook = null;   // the map object drawn (a map file loaded later replaces it: draw again) and its CS2 look
  function build(id) {
    if (current === id && builtFrom === ARENA_MAPS[id] && builtLook === mapRender(id)) return; clearMap(); const map = ARENA_MAPS[id]; if (!map) return; current = id; builtFrom = map; builtLook = mapRender(id);
    const cx = ARENA.cx, cz = ARENA.cz, [sw, sd] = map.size; boxes = mapBoxes(map, cx, cz); { const sp = map.spawns?.[0] || [0, 0, 0]; warmSmoke(boxes, cx + sp[0], (sp[2] || 0) + .35, cz + sp[1]); }   /* the first smoke fills at full speed (arena-nades.js) */ ladders = (map.ladders || []).map(([a, b, c, d, y0, y1]) => ({ minX: cx + a, maxX: cx + b, minZ: cz + c, maxZ: cz + d, y0, y1 })); bounds = { minX: cx - sw / 2, maxX: cx + sw / 2, minZ: cz - sd / 2, maxZ: cz + sd / 2 };
    // A map from a file: its own faces, textures and baked light (bsp-mesh.js); collision is the columns, as always.
    if (map.bsp) { const T = map.bsp.toGame, toGame = (x, y, z) => { const g = T(x, y, z); return [cx + g[0], g[1], cz + g[2]]; };
      // Counter-Strike 1.6 maps (bsp-mesh.js) or Source maps (vbsp-mesh.js: their own packed textures, terrain and props).
      const built = map.bsp.data.format === 'vbsp' ? buildVbspMeshes(map.bsp.data.source, { toGame, renderer: globalThis.__infra?.renderer }) : buildBspMeshes(map.bsp.data, { toGame, movers: map.movers || [] });
      for (const mesh of built.meshes) group.add(mesh);
      for (const { id, group: g } of built.movers || []) { g.userData.mover = true; group.add(g); movers.push({ id, m: map.movers[id], g, base: g.position.clone(), at: 0, broken: false }); }
      if (map.bsp.data.format === 'vbsp') { for (const mesh of buildVbspProps(map.bsp.data.source, { toGame, textures: built.textures }).meshes) group.add(mesh);
        // Every texture uploaded and every material compiled now, on the loading screen — never on first sight in play.
        mapTextures = built.textures; const r = globalThis.__infra?.renderer; if (r) { for (const t of built.textures.all()) r.initTexture(t); r.compile(group, warmCam); } }
      return; }
    // A Counter-Strike 2 map with its own look loaded (cs2-render.js): its walls, floors and props, textures uploaded on the
    // loading screen and materials compiled now; its own site markings (no painted circles). Collision: the columns.
    scene.userData.baked = !!(builtLook && map.hammer && builtLook.userData.baked && group.visible);
    if (builtLook && map.hammer) { placeRender(builtLook, map.hammer, cx, cz); group.add(builtLook);
      // Its doors and breakables: each moved onto a pivot at its hinge (game units), so it swings, slides or goes as the
      // file maps' movers do (mapState); on leaving they go back into the look (it is kept for the next time).
      (map.movers || []).forEach((m, id) => { const G = builtLook.userData.movers?.get(m.e); if (!G) return; const pv = new THREE.Group(); pv.userData.cs2Mover = true; pv.userData.home = builtLook;
        if (m.kind === 'rotdoor') pv.position.set(cx + m.hinge[0], m.hinge[1], cz + m.hinge[2]); pv.userData.base0 = pv.position.clone(); group.add(pv); pv.updateMatrixWorld(true); pv.attach(G); movers.push({ id, m, g: pv, base: pv.position.clone(), at: 0, broken: false }); });
      const r = globalThis.__infra?.renderer; if (r) r.compile(group, warmCam); return; }
    if (map.columns) { for (const mesh of buildColumnMeshes(map, shadedMaterial, tileOf, cx, cz)) group.add(mesh);   // classic maps: drawn from their columns (not aim-raycast: shots and the arena use the collision boxes)
      for (const [L, [x, z, r]] of Object.entries(map.sites || {})) { const s = new THREE.Mesh(SITE_GEO, SITE_MAT[L]); s.rotation.x = -Math.PI / 2; const g = map.siteGoals?.[L] || [x, z], fy = g[2] ?? map.nav.floorAt(g[0], g[1]); s.position.set(cx + g[0], (Number.isFinite(fy) ? fy : 0) + .08, cz + g[1]); s.scale.setScalar(Math.min(r, 30) * 1.2); s.renderOrder = 1; group.add(s); }
      return; }
    const byMat = new Map(); for (const b of boxes) { if (b.prop) continue; const tile = tileOf(b.mat); (byMat.get(b.mat) || byMat.set(b.mat, []).get(b.mat)).push(boxGeometry(b, tile)); }
    const floor = { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ, y0: -1, y1: 0 }; (byMat.get(map.floor) || byMat.set(map.floor, []).get(map.floor)).push(boxGeometry(floor, tileOf(map.floor)));
    for (const [mat, geos] of byMat) { const mesh = new THREE.Mesh(merge(geos), material(mat)); mesh.castShadow = mesh.receiveShadow = true; mesh.userData.arena = true; group.add(mesh); }   // not aim-raycast (the facility's per-frame pick ray): the arena uses its collision boxes
    { const P = buildProps(map, cx, cz); for (const m of P.meshes) { m.userData.arena = true; group.add(m); } for (const l of P.lights.slice(0, 4)) { const pl = new THREE.PointLight(0xffd9a0, 6, 45, 2); pl.position.set(l.x, l.y, l.z); pl.visible = false; group.add(pl); } }   // props as their own shapes, lamps lit — through the light pool (graphics.js): hidden from the start, so the scene's light count never changes and no shader is compiled again on entering (a 120 ms frame)
    for (const [L, [x, z, r]] of Object.entries(map.sites || {})) { const s = new THREE.Mesh(SITE_GEO, SITE_MAT[L]); s.rotation.x = -Math.PI / 2; s.position.set(cx + x, .06, cz + z); s.scale.setScalar(r * 1.6); s.renderOrder = 1; group.add(s); }
  }
  return {
    group,
    // The round's doors and breakables (game.combat.mapState) — called every frame: collision switched when the state
    // changes, doors swung / slid toward it at their own pace (CS: about 100°/s), panes broken with shards and a crash.
    mapState(state, dt) { if (!movers.length) return; const first = lastV < 0, v = state?.v ?? 0;
      if (state !== lastState || v !== lastV) { applyMapState(boxes, state); lastState = state; lastV = v; }
      for (const M of movers) { const d = state?.doors?.[M.id], br = !!state?.broken?.[M.id];
        if (M.m.kind === 'break') { if (br !== M.broken) { M.broken = br; M.g.visible = !br; if (br && !first) { const b = boxes.movers.find(x => x.mover === M.id && x.role === 'shut'); if (b) shatter(b, M.m.glass); } } continue; }
        if (br !== M.broken) { M.broken = br; M.g.visible = !br; if (br && !first) { const b = boxes.movers.find(x => x.mover === M.id && x.role === 'shut'); if (b) shatter(b, false); } }   // a door a grenade blew off: gone (back next round)
        if (br) continue;
        const goal = d?.open ? 1 : 0, sign = d?.open ? (d.side < 0 ? -1 : 1) : M.sign || 1; if (d?.open) M.sign = sign;
        const step = first ? 1 : dt * (M.m.kind === 'rotdoor' ? 1.8 : 1.2); M.at = goal > M.at ? Math.min(goal, M.at + step) : Math.max(goal, M.at - step);
        const e = M.at * M.at * (3 - 2 * M.at); if (M.m.kind === 'rotdoor') M.g.rotation.y = (M.sign || 1) * M.m.angle * e; else M.g.position.set(M.base.x + M.m.slide[0] * e, M.base.y + M.m.slide[1] * e, M.base.z + M.m.slide[2] * e); }
      if (shAlive) { let alive = 0; for (let i = 0; i < SH; i++) { if (shL[i] <= 0) continue; shL[i] -= dt; if (shL[i] <= 0) { shM.makeScale(0, 0, 0); shards.setMatrixAt(i, shM); continue; } alive++;
          shV[i * 3 + 1] -= 30 * dt; shP[i * 3] += shV[i * 3] * dt; shP[i * 3 + 1] = Math.max(0, shP[i * 3 + 1] + shV[i * 3 + 1] * dt); shP[i * 3 + 2] += shV[i * 3 + 2] * dt;
          shM.compose(shT.set(shP[i * 3], shP[i * 3 + 1], shP[i * 3 + 2]), shQ.setFromEuler(shE.set(shL[i] * 7, i, shL[i] * 5)), shS); shards.setMatrixAt(i, shM); }
        shards.instanceMatrix.needsUpdate = true; shAlive = alive; if (!alive) shards.visible = false; } },
    // The doors you could use from (x, y, z) (eye), nearest first within `reach`: { id, dist }.
    doorNear(x, y, z, reach = 4.5) { let best = null; for (const b of boxes.movers || []) { if (b.off || movers.length === 0) continue; const M = movers.find(q => q.id === b.mover); if (!M || M.m.kind === 'break') continue;
        const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ), dy = Math.max(b.y0 - y, 0, y - b.y1 - 2), d = Math.hypot(dx, dy, dz); if (d < reach && (!best || d < best.dist)) best = { id: b.mover, dist: d }; } return best; },
    // A breakable's id if this box is one (shots: weapons.js), else null.
    breakableOf: b => b && b.mover !== null && b.mover !== undefined && b.role === 'shut' && movers.some(q => q.id === b.mover && q.m.kind === 'break') ? b.mover : null,
    get map() { return current; }, get boxes() { return boxes; }, get ladders() { return ladders; }, get bounds() { return bounds; },
    // Show / hide the arena (and swap the dark indoor background for a sky while inside it).
    show(id) { group.visible = true; build(id); scene.userData.baked = !!(builtLook?.userData.baked && ARENA_MAPS[id]?.hammer);   /* a CS2 look with its baked light: graphics.js shows contact shadows */ if (savedBg === null) { savedBg = scene.background; savedFog = scene.fog; } const map = ARENA_MAPS[id], L = outdoor(id); scene.background = new THREE.Color(L.horizon); scene.fog = new THREE.FogExp2(L.horizon, .0011); scene.userData.outdoor = L; sky(L); },   // light haze: the far side of the map stays visible   // same fog type as the hall: every compiled shader is reused (no hitch on entering)
    hide() { group.visible = false; delete scene.userData.outdoor; delete scene.userData.baked; if (savedBg !== null) { scene.background = savedBg; scene.fog = savedFog; savedBg = null; } },
    inArena: z => z < ARENA.maxZ,
    clear(x, z) { return !!bounds && walkable(boxes, bounds, x, z); },
    // What the feet are on at (x, z) with feet at height y, for footstep sounds: wood, metal, grass (sand) or concrete.
    surfaceAt(x, z, y = 0) { const own = ARENA_MAPS[current]?.surfaceAt?.(x - ARENA.cx, z - ARENA.cz, y); if (own) return own;   /* maps from files: their own floors (map-light.js) */
      const b = y > .3 && boxesNear(boxes, x - 1, z - 1, x + 1, z + 1, SURF_NEAR).find(b => Math.abs(b.y1 - y) < .6 && x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1), m = b ? b.mat : ARENA_MAPS[current]?.floor || 'concrete';
      return /wood|crate/.test(m) ? 'wood' : /metal/.test(m) ? 'metal' : /sand/.test(m) ? 'grass' : 'concrete'; },
    spawnFor(i) { const map = ARENA_MAPS[current]; if (!map) return null; const s = map.spawns[((i % map.spawns.length) + map.spawns.length) % map.spawns.length]; return { x: ARENA.cx + s[0], z: ARENA.cz + s[1], ...(s[2] !== undefined ? { y: s[2] } : {}) }; },
  };
}
