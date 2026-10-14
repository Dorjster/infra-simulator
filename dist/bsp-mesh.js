// Draws a GoldSrc map (bsp30.js) the way the map was lit: every face with its own texture and its baked light, the
// lightmaps packed into one atlas. One merged mesh per texture (a few hundred draw calls at most). Hammer units
// → game units: x east, y up, z south (−y), scaled by U and placed so the map's (x0, y1, zLow) frame matches the
// collision columns (bsp-map.js).
import * as THREE from './three.module.js';
import { faceVerts, modelOf, vec, textureRGBA } from './bsp30.js';
import { anisotropy } from './texture-quality.js';

// Faces never drawn: tool textures (invisible brushes), the sky (the scene's sky shows through).
const HIDDEN = /^(sky|clip|origin|aaatrigger|null|hint|skip|bevel|black_hidden|translucent|\{?invisible)$|^(aaa|clip)/;
// A texture the map keeps in a separate .wad (not in the file, not on this computer): the nearest CC0 photo texture by
// its name (dist/textures, MODEL-SOURCES.md) and a tint; the face's own size, placement and baked light still apply.
const STANDIN = [[/brick|cinder|block/, 'brick', 0xffffff], [/crate|box|case|pallet/, 'crate', 0xffffff], [/wood|plank|plywood|door|board/, 'wood', 0xffffff], [/train|trk_|wheel|steel|metal|mtl|rail|pipe|duct|dump|fender|rim|axle|grille|bumper|hood/, 'metal-green', 0xc8ccc8],
  [/asphalt|track|tracks/, 'concrete', 0x8a8a88], [/gravel|dirt|ground|sand/, 'sand', 0xb8b0a0], [/grass|ivy|leaf|plant/, 'fieldstone', 0x8ea070], [/roof|tile/, 'roof', 0xffffff], [/plaster|stucco/, 'plaster', 0xffffff], [/window|glass/, 'concrete', 0x8fa8c0], [/light|lgt|lamp/, 'plaster', 0xfff2d0], [/./, 'concrete', 0xd8d8d4]];
const standin = name => STANDIN.find(([re]) => re.test(name)) || STANDIN[STANDIN.length - 1];
let photoLoader = null; const photos = new Map(); const photo = file => { photoLoader ??= new THREE.TextureLoader(); if (!photos.has(file)) { const t = photoLoader.load(new URL('./textures/' + file + '.jpg', import.meta.url).href); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy(); photos.set(file, t); } return photos.get(file); };
// Brush entities that are drawn (their faces belong to their model); others (triggers, buy zones, bomb targets) are not.
const DRAWN = /^func_(wall|wall_toggle|breakable|door|door_rotating|illusionary|pushable|button|rot_button|rotating|conveyor|water|train|tracktrain|plat|pendulum|guntarget|mortar_field|vehicle)$/;

function releaseArray() { this.array = null; }

export function buildBspMeshes(bsp, { toGame, lightScale = 1.25, lightGamma = .6 } = {}) {
  // 1. Which faces, with which entity's render settings (rendermode 2 / 3 / 5: see-through by renderamt; 4: alpha test).
  const items = []; const addModel = (mi, ent) => { const m = bsp.models[mi]; if (!m) return; for (let f = m.firstFace; f < m.firstFace + m.numFaces; f++) items.push({ f, ent }); };
  addModel(0, null); for (const e of bsp.entities) { const mi = modelOf(e); if (mi > 0 && DRAWN.test(e.classname || '')) addModel(mi, e); }
  // 2. Lightmap rectangles: each lit face's texture-space extent in 16-unit luxels.
  const rects = [], info = new Map();
  for (const it of items) { const f = bsp.faces[it.f], ti = bsp.texinfo[f.texinfo], tex = bsp.textures[ti.tex]; if (!tex || HIDDEN.test(tex.name)) continue; const V = faceVerts(bsp, f); if (V.length < 3) continue;
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity; const st = V.map(v => { const s = v[0] * ti.s[0] + v[1] * ti.s[1] + v[2] * ti.s[2] + ti.s[3], t = v[0] * ti.t[0] + v[1] * ti.t[1] + v[2] * ti.t[2] + ti.t[3]; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); return [s, t]; });
    const lit = !(ti.flags & 1) && f.lightOfs >= 0 && f.styles[0] !== 255, bs = Math.floor(s0 / 16), bt = Math.floor(t0 / 16), w = Math.ceil(s1 / 16) - bs + 1, h = Math.ceil(t1 / 16) - bt + 1;
    const r = { it, f, ti, tex, V, st, lit, bs, bt, w, h }; info.set(it.f, r); if (lit && w > 0 && h > 0 && w <= 64 && h <= 64) rects.push(r); else r.lit = false; }
  // 3. Pack (tallest first, shelves), one luxel of border round each so neighbours never bleed in.
  rects.sort((a, b) => b.h - a.h); let AW = 1024; const pack = W => { let x = 0, y = 0, sh = 0; for (const r of rects) { if (x + r.w + 2 > W) { x = 0; y += sh; sh = 0; } r.ax = x + 1; r.ay = y + 1; x += r.w + 2; sh = Math.max(sh, r.h + 2); } return y + sh; };
  let AH = pack(AW); while (AH > AW && AW < 4096) { AW *= 2; AH = pack(AW); } AH = Math.pow(2, Math.ceil(Math.log2(Math.max(1, AH))));
  // The game drew its lightmaps through a gamma curve (dark corners lifted, bright spots kept): the same here.
  const GAMMA = new Uint8Array(256).map((_, v) => Math.round(255 * Math.pow(v / 255, lightGamma)));
  const atlas = new Uint8Array(AW * AH * 4), L = bsp.lighting, put = (x, y, r, g, b) => { const o = (y * AW + x) * 4; atlas[o] = GAMMA[r]; atlas[o + 1] = GAMMA[g]; atlas[o + 2] = GAMMA[b]; atlas[o + 3] = 255; };
  for (const r of rects) { const base = r.f.lightOfs; for (let y = -1; y <= r.h; y++) for (let x = -1; x <= r.w; x++) { const sx = Math.min(r.w - 1, Math.max(0, x)), sy = Math.min(r.h - 1, Math.max(0, y)), o = base + (sy * r.w + sx) * 3; if (o + 2 < L.length) put(r.ax + x, r.ay + y, L[o], L[o + 1], L[o + 2]); } }
  const lightTex = new THREE.DataTexture(atlas, AW, AH, THREE.RGBAFormat); lightTex.colorSpace = THREE.SRGBColorSpace; lightTex.magFilter = THREE.LinearFilter; lightTex.minFilter = THREE.LinearFilter; lightTex.flipY = false; lightTex.channel = 1; lightTex.needsUpdate = true; lightTex.onUpdate = () => { lightTex.image.data = null; };
  // A face without light of its own (sky-lit special surfaces, oversize faces): a mid-grey luxel.
  const GREY = [AW - 1, AH - 1]; put(GREY[0], GREY[1], 150, 150, 150);
  // 4. Geometry, one buffer per (texture, render setting).
  const groups = new Map();
  for (const r of info.values()) { const ent = r.it.ent, mode = +(ent?.rendermode || 0), amt = ent?.renderamt !== undefined ? +ent.renderamt / 255 : 1, alphaT = r.tex.name[0] === '{' || mode === 4, water = r.tex.name[0] === '!';
    if ((mode === 2 || mode === 5) && amt <= .02) continue;   // fully transparent brushes
    const key = r.ti.tex + '|' + (alphaT ? 'a' : '') + ((mode === 2 || mode === 3 || mode === 5) && amt < 1 ? 't' + amt.toFixed(2) : '') + (water ? 'w' : ''); let G = groups.get(key);
    if (!G) groups.set(key, G = { tex: r.tex, P: [], UV: [], UV2: [], N: [], alphaT, opacity: water ? .72 : (mode === 2 || mode === 3 || mode === 5) ? amt : 1, water, add: mode === 5 });
    const off = ent?.origin ? vec(ent.origin) : [0, 0, 0], pl = r.f.plane, sgn = r.f.side ? -1 : 1, nx = bsp.planes[pl * 4] * sgn, ny = bsp.planes[pl * 4 + 1] * sgn, nz = bsp.planes[pl * 4 + 2] * sgn;
    const tw = r.tex.rgba ? r.tex.width : 128, th = r.tex.rgba ? r.tex.height : 128, uv = j => [r.st[j][0] / tw, r.st[j][1] / th]   /* a stand-in photo: one tile per 128 units */, uv2 = j => r.lit ? [(r.ax + (r.st[j][0] / 16 - r.bs) + .5) / AW, (r.ay + (r.st[j][1] / 16 - r.bt) + .5) / AH] : [(GREY[0] + .5) / AW, (GREY[1] + .5) / AH];
    for (let j = 1; j + 1 < r.V.length; j++) for (const k of [0, j + 1, j]) { const v = r.V[k], g = toGame(v[0] + off[0], v[1] + off[1], v[2] + off[2]); G.P.push(g[0], g[1], g[2]); G.N.push(nx, nz, -ny); const a = uv(k), b = uv2(k); G.UV.push(a[0], a[1]); G.UV2.push(b[0], b[1]); } }   // fan, wound for y-up
  // 5. Textures and materials (unlit: the light is baked; a little more light than the raw lightmap, as the game drew it).
  const texCache = new Map(), meshes = [];
  const texOf = t => { if (texCache.has(t)) return texCache.get(t); let tx = null; if (t.rgba) { tx = new THREE.DataTexture(textureRGBA(t), t.width, t.height, THREE.RGBAFormat); tx.onUpdate = () => { tx.image.data = null; };   /* decoded for the upload, then let go (the file keeps the pixels) */ tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; tx.anisotropy = anisotropy(); tx.colorSpace = THREE.SRGBColorSpace; tx.needsUpdate = true; } texCache.set(t, tx); return tx; };
  for (const G of groups.values()) { if (!G.P.length) continue; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(G.N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(G.UV, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(G.UV2, 2)); g.computeBoundingSphere();
    // On the GPU once drawn: the arrays are let go (never aimed at — shots use the collision boxes; bounds computed above).
    for (const a of Object.values(g.attributes)) a.onUpload(releaseArray);
    const own = texOf(G.tex), sub = own ? null : standin(G.tex.name), map = own || photo(sub[1]), m = new THREE.MeshBasicMaterial({ map, color: own ? 0xffffff : sub[2], lightMap: lightTex, lightMapIntensity: lightScale * Math.PI,   /* (three.js divides a lightmap by π on unlit materials) */ transparent: G.opacity < 1 || G.water, opacity: G.opacity, alphaTest: G.alphaT ? .5 : 0, side: G.alphaT || G.water ? THREE.DoubleSide : THREE.FrontSide, depthWrite: !(G.opacity < 1) || G.alphaT, blending: G.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    g.userData.shared = false; const mesh = new THREE.Mesh(g, m); mesh.userData.arena = true; mesh.userData.bsp = true; mesh.userData.noShadow = true; mesh.castShadow = false; mesh.receiveShadow = false; meshes.push(mesh); }
  return { meshes, atlas: { width: AW, height: AH, faces: rects.length } };
}
