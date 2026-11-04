// CS2 gloves' files (Global Defensive), imported on the host's computer (tools/import-cs2-gloves.mjs →
// user-assets/gloves/, never shipped) and served by the room to everyone, as the gun finishes are (skin-textures.js):
//  · gloves.json — the catalogue: 8 types (Sport Gloves first), 94 finishes, each with CS2's econ icon, rarity, wear range
//    and a plain `fallback` colour. Fetched once per page (again when the host's arenaView says its catalogue changed:
//    arena.gloveCat), handed to skins.js (names, solo play's checks).
//  · meshes/glove-<type>.glb — per type the first-person hands (glove_L, glove_R, skin: the bare wrist) and the
//    third-person ones (world_L, world_R), all on CS2's 52 arm bones with the arms glb's inverse binds (no new skeleton:
//    fp-view.js binds them to each set's own, cs2-agents.js to each agent's).
//  · <type>/<kit>_color|normal|orm|wear — one texture set per finish. Per (kit, wear, tier) one entry, shared by every
//    player and view that shows it: 'fp' (your own gloves and your team mates' — spectating shows theirs — at 1024 with
//    the ORM map, as the CS2 arms) and 'tp' (other players' agents: 512, colour and normal, as the agents' own gloves).
//    Wear is baked into the colour once, as the entry loads (CS2 re-runs its composite at the item's wear; the import's
//    _wear.png says which texels are worn by when, wearLook how they look): never per frame, no shader of its own.
// Off the play path, under skin-textures.js's gates: files fetched only while fetching is allowed, pictures sent to the
// GPU one a frame only while the gate is open (freeze, buy time, warmup, menus, a loading card — never in a live round);
// a pair not in yet when a round goes live shows the finish's fallback colour (a 1×1 picture set: the same shader).
// Least recently used entries nobody shows are freed once over the budget, outside live rounds only.
import { gdTexSize } from './gd-preset.js';   // (v53 stage 6: Low / Very Low texture cap)
import * as THREE from './three.module.js';
import { gltfLoader } from './gltf-loader.js';
import { textureSize, anisotropy } from './texture-quality.js';
import { setGloveCatalog, gloveKit, GLOVE_TYPE_ORDER } from './skins.js';
import { skinGateOpen, skinFetchOpen, skinRenderer } from './skin-textures.js';

export const GLOVE_BUDGET = 160 * 1024 * 1024;   // bytes of glove pictures (RGBA8 + mips) kept on the GPU at most
const TIERS = { fp: 1024, tp: 512 };
export const tierSize = t => Math.min(TIERS[t] || 512, gdTexSize(textureSize()));   /* (v53 stage 6: the GD preset's texture cap) */
// CS2's rarity colours (gloves are all "Extraordinary": ancient).
export const RARITY_COLOR = { ancient: '#eb4b4b', legendary: '#d32ce6', mythical: '#8847ff', rare: '#4b69ff', uncommon: '#5e98d9', common: '#b0c3d9', immortal: '#e4ae39' };
export const MESH_NAMES = ['glove_L', 'glove_R', 'skin', 'world_L', 'world_R'];
let base = '/user-assets/gloves/', manifest = null, manifestP = null, version = 0, bytes = 0, pumping = false, inflight = 0, pinned = new Set();
const types = new Map(), entries = new Map(), fallbacks = new Map(), fetchQ = [], uploadQ = [], fns = new Set(), fpTypes = new Set();
const stats = { uploads: 0, fetches: 0, failed: 0, evicted: 0, baked: 0 };
const web = () => typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
// Loaders (tests replace them): a picture → image-like { width, height }; a glb → ArrayBuffer.
let fetchImage = (url, { size, data }) => fetch(url).then(r => { if (!r.ok) throw Error(r.status + ' ' + url); return r.blob(); })
  .then(b => createImageBitmap(b, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: data ? 'none' : 'default' }));
let fetchBuf = url => fetch(url).then(r => { if (!r.ok) throw Error(r.status + ' ' + url); return r.arrayBuffer(); });
let bakeImage = null;   // (tests: (colorImg, wearImg, size, wear, look) → image; the browser's is canvasBake below)
export function setGloveLoader({ image, buf, bake, base: b } = {}) { if (image) fetchImage = image; if (buf) fetchBuf = buf; if (bake !== undefined) bakeImage = bake; if (b) base = b; }
export const onGloves = fn => { fns.add(fn); return () => fns.delete(fn); };
const bump = () => { version++; for (const fn of fns) try { fn(version); } catch (e) { console.warn('gloves', e?.message); } };
// Rises whenever something new can be drawn (the catalogue, a type's meshes, a finish's pictures): views compare it.
export const gloveVersion = () => version;

// ── The catalogue ──
export function loadGloveManifest(force = false, given) {
  if (given !== undefined) { setManifest(given); return Promise.resolve(manifest); }
  if (manifestP && !force) return manifestP;
  if (!web()) return manifestP = Promise.resolve(manifest);
  return manifestP = fetch(base + 'gloves.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null).then(m => { setManifest(m); return manifest; });
}
export function validGloveManifest(m) {   // (the parts the game reads: the import's full check is tools/cs2-gloves/manifest.mjs validateManifest)
  if (!m || typeof m !== 'object' || m.version !== 1 || !m.types || !m.finishes || typeof m.types !== 'object' || typeof m.finishes !== 'object') return false;
  for (const [id, t] of Object.entries(m.types)) if (!/^[a-z0-9_]+$/.test(id) || typeof t?.mesh !== 'string' || !Array.isArray(t.finishes)) return false;
  for (const [k, f] of Object.entries(m.finishes)) if (!/^[a-z0-9_-]{1,64}$/.test(k) || !f || !Object.hasOwn(m.types, f.type) || typeof f.color !== 'string' || typeof f.normal !== 'string' || typeof f.orm !== 'string') return false;
  return true;
}
function setManifest(m) { const was = manifest?.made; manifest = validGloveManifest(m) ? m : null; setGloveCatalog(manifest);
  if (was !== manifest?.made) { for (const e of [...entries.values()]) drop(e); types.clear(); fallbacks.clear(); } bump(); }
export const gloveManifest = () => manifest;
export const gloveFileURL = rel => base + rel + '?m=' + encodeURIComponent(manifest?.made || '');
export const gloveFinish = kit => kit && manifest && Object.hasOwn(manifest.finishes, kit) ? manifest.finishes[kit] : null;
export const gloveIconURL = kit => { const f = gloveFinish(kit); return f?.icon ? gloveFileURL(f.icon) : null; };
// The types in CS2's order (Sport Gloves first), then any others the catalogue has.
export function gloveTypeList() { if (!manifest) return []; const ids = Object.keys(manifest.types); return [...GLOVE_TYPE_ORDER.filter(t => ids.includes(t)), ...ids.filter(t => !GLOVE_TYPE_ORDER.includes(t))].map(id => ({ id, name: manifest.types[id].name || id, count: manifest.types[id].finishes.length })); }
export const gloveFinishes = type => (manifest?.types?.[type]?.finishes || []).filter(k => gloveFinish(k)).map(k => ({ kit: k, ...manifest.finishes[k] }));
// A wear float → the step a texture set is baked for (0.02; Factory New and below: unworn), inside the finish's range.
export function wearBucket(w, range = [0, 1]) { const lo = Math.max(0, +range?.[0] || 0), hi = Math.min(1, Number.isFinite(+range?.[1]) ? +range[1] : 1); const x = Math.max(lo, Math.min(hi, Number.isFinite(+w) ? +w : lo)); return x < .07 ? 0 : Math.round(x * 50) / 50; }
// Wear on a colour picture (RGBA bytes, in place): a texel is worn once the wear passes its threshold (wear map R); a worn
// texel's colour × (1 + brightness), its saturation moved by `saturation` (CS2's averaged damage look). → texels worn.
export function bakeWear(px, wearPx, n, wear, look = {}) {
  const t = wear * 255, b = 1 + (+look.brightness || 0), s = 1 + (+look.saturation || 0); let worn = 0;
  for (let i = 0, j = 0; j < n; i += 4, j++) { if (!(t > wearPx[i])) continue; worn++; const r = px[i] * b, g = px[i + 1] * b, bl = px[i + 2] * b, l = .2126 * r + .7152 * g + .0722 * bl; px[i] = l + (r - l) * s; px[i + 1] = l + (g - l) * s; px[i + 2] = l + (bl - l) * s; }
  return worn;
}
async function canvasBake(col, wr, size, wear, look) {
  if (typeof OffscreenCanvas !== 'function') return col; const c = new OffscreenCanvas(size, size), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(col, 0, 0, size, size); const a = x.getImageData(0, 0, size, size); x.clearRect(0, 0, size, size); x.drawImage(wr, 0, 0, size, size); const w = x.getImageData(0, 0, size, size);
  bakeWear(a.data, w.data, size * size, wear, look); col.close?.(); wr.close?.(); return createImageBitmap(a, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

// ── A type's meshes (one glb per type, loaded once, shared by every set and agent) ──
// → { type, state: 'idle'|'fetch'|'ready'|'failed', meshes: { glove_L, glove_R, skin, world_L, world_R }, bones, inverses }
export function gloveType(type) {
  if (!manifest?.types?.[type]) return null; let t = types.get(type);
  if (!t) { t = { type, state: 'idle', meshes: null, bones: null, inverses: null }; types.set(type, t); }
  return t;
}
export function wantType(t) { if (!t || t.state !== 'idle' && !(t.state === 'failed' && t.retry < performance.now())) return; t.state = 'queued'; fetchQ.push(t); kick(); }
// publish false (a load): the templates are made but the type stays 'decoded' until the upload pump shows it, under the
// skin gate like a picture — so no view builds or re-wears glove meshes (nor uploads their geometry) mid-round.
export async function typeFromGltf(t, gltf, publish = true) {   // (exported for tests: a parsed glb → the type's templates)
  const meshes = {}; let bones = null, inverses = null;
  gltf.scene.traverse(o => { if (!o.isSkinnedMesh || !MESH_NAMES.includes(o.name) || meshes[o.name]) return; meshes[o.name] = o; o.geometry.userData.shared = true; o.frustumCulled = false;
    if (!bones) { bones = o.skeleton.bones.map(b => b.name); inverses = o.skeleton.boneInverses; } });
  if (!meshes.glove_L || !meshes.glove_R || !bones) throw Error('no first-person glove meshes in ' + t.type);
  t.meshes = meshes; t.bones = bones; t.inverses = inverses; t.state = publish ? 'ready' : 'decoded'; return t;
}
const parseGlb = buf => new Promise((res, rej) => gltfLoader().parse(buf, '', res, rej));

// ── A finish's pictures: (kit, wear step, tier) ──
// → { key, kit, wear, tier, state, tex: { color, normal, orm? } } or null (no such finish).
export function gloveTex(kit, wear = 0, tier = 'tp') {
  const f = gloveFinish(kit); if (!f) return null; const w = wearBucket(wear, f.wearRange), key = kit + '|' + w + '|' + tier; let e = entries.get(key);
  if (!e) { e = { key, kit, wear: w, tier, f, state: 'idle', img: null, tex: null, mats: new Map(), used: 0, bytes: 0 }; entries.set(key, e); }
  return e;
}
export function wantTex(e) { if (!e) return; e.used = performance.now(); if (e.state === 'idle' || e.state === 'failed' && e.retry < performance.now()) { e.state = 'queued'; fetchQ.push(e); kick(); } }
// A record { finish: 'cs2g:<kit>', wear } → what a view needs to draw it, asking for anything missing (queued: loaded
// under the gates). { kit, f, type, tex (entry, ready or not), fb (the 1×1 fallback set) } or null (no gloves / unknown kit).
export function gloveLook(rec, tier) {
  const kit = gloveKit(rec), f = gloveFinish(kit); if (!f) return null; const t = gloveType(f.type), e = gloveTex(kit, rec.wear, tier);
  wantType(t); wantTex(e); return { kit, f, type: t, tex: e, fb: fallbackTex(kit) };
}
// The fallback: the finish's plain colour as a 1×1 picture set (colour, flat normal, ORM from its mean roughness and
// metalness) — the same maps as the real pictures, so the same shader; sent to the GPU with the rest (one a frame).
let flatN = null;
const px1 = (r, g, b, srgb) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = false; t.userData.shared = true; t.needsUpdate = true; return t; };
export function fallbackTex(kit) {
  const f = gloveFinish(kit); if (!f) return null; let fb = fallbacks.get(kit); if (fb) return fb;
  const n = parseInt(String(f.fallback || '#808080').replace('#', ''), 16) || 0x808080; flatN ??= px1(128, 128, 255, false);
  fb = { key: kit + '|fb', kit, state: 'ready', tex: { color: px1((n >> 16) & 255, (n >> 8) & 255, n & 255, true), normal: flatN, orm: px1(255, Math.round(255 * (f.roughMean ?? .6)), Math.round(255 * (f.metalMean ?? 0)), false) }, mats: new Map(), color: '#' + n.toString(16).padStart(6, '0') };
  fallbacks.set(kit, fb); for (const t of Object.values(fb.tex)) uploadQ.push({ one: t }); kick(); return fb;
}
// Load these ahead (the freeze: every player's gloves at 'tp', yours and your team mates' at 'fp'): [{ rec, tier }].
// The list is also what is in use: entries not on it may be freed when over the budget.
// Types wanted at 'fp' (yours, and your team mates' — spectated in first person): fp-view.js builds their first-person
// meshes on every set when the type is shown (under the gate), so a first spectate mid-round builds nothing.
export function prefetchGloves(list) { const keep = new Set(); let late = false;
  for (const w of list || []) { const L = gloveLook(w.rec, w.tier); if (!L) continue; keep.add(L.tex.key); if (w.tier === 'fp' && !fpTypes.has(L.f.type)) { fpTypes.add(L.f.type); late ||= L.type.state === 'ready'; } }
  pinned = keep; evict(); if (late) { uploadQ.push({ show: null }); kick(); } }   // (a type already in for a third-person agent: shown again at the gate)
export const gloveFpTypes = () => fpTypes;

const raf = cb => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16))(cb);
let retryT = 0;
function kick() { fetchLoop(); if (uploadQ.length && !pumping) { pumping = true; raf(pump); } }
function fetchLoop() {
  while (inflight < 2 && fetchQ.length && skinFetchOpen()) {
    const e = fetchQ.shift(); if (e.state !== 'queued') continue; e.state = 'fetch'; inflight++; stats.fetches++;
    const job = 'kit' in e ? loadTex(e) : loadType(e);
    job.catch(err => { e.state = 'failed'; e.retry = performance.now() + 30000; stats.failed++; console.warn('gloves', e.key || e.type, err?.message); bump(); }).finally(() => { inflight--; kick(); });
  }
  if (fetchQ.length && !skinFetchOpen() && !retryT) retryT = setTimeout(() => { retryT = 0; fetchLoop(); }, 500);
}
async function loadType(t) { const m = manifest?.types?.[t.type]; if (!m) throw Error('no type ' + t.type); const g = await parseGlb(await fetchBuf(gloveFileURL(m.mesh))); if (t.state !== 'fetch') return; await typeFromGltf(t, g, false); uploadQ.push({ show: t }); }
async function loadTex(e) {
  const size = tierSize(e.tier), f = e.f, U = gloveFileURL, worn = e.wear > 0 && f.wear;
  const [color, normal, orm, wr] = await Promise.all([fetchImage(U(f.color), { size, data: false }), fetchImage(U(f.normal), { size, data: true }), e.tier === 'fp' ? fetchImage(U(f.orm), { size, data: true }) : null, worn ? fetchImage(U(f.wear), { size, data: true }) : null]);
  if (e.state !== 'fetch') { for (const i of [color, normal, orm, wr]) i?.close?.(); return; }
  let col = color; if (wr) { col = await (bakeImage || canvasBake)(color, wr, size, e.wear, f.wearLook || {}); stats.baked++; }
  e.img = { color: col, normal, ...(orm ? { orm } : {}) }; e.state = 'decoded'; uploadQ.push(e);
}
const texOf = (img, srgb, tier) => { const t = new THREE.Texture(img); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;   // (every UV in 0..1: the import)
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = tier === 'fp' ? anisotropy() : Math.min(4, anisotropy()); t.userData.shared = true; t.needsUpdate = true; return t; };
const sizeOf = img => Math.round((img.width || 0) * (img.height || 0) * 4 * 4 / 3);
// One picture to the GPU per frame, only while the gate is open (a live round waits).
function pump() {
  pumping = false; if (!uploadQ.length) return; if (!skinGateOpen()) { pumping = true; setTimeout(() => raf(pump), 250); return; }
  const e = uploadQ[0], r = skinRenderer();
  if (e.one) { uploadQ.shift(); try { r?.initTexture(e.one); } catch {} stats.uploads++; }
  else if ('show' in e) { uploadQ.shift(); if (e.show) e.show.state = 'ready'; bump(); }   // (a type's meshes: shown to the views only now, the gate open)
  else if (e.state === 'decoded') { e.tex ??= {}; const k = ['color', 'normal', 'orm'].find(n => e.img[n] && !e.tex[n]);
    if (k) { const t = e.tex[k] = texOf(e.img[k], k === 'color', e.tier); try { r?.initTexture(t); } catch (err) { console.warn('glove upload', e.key, err?.message); } stats.uploads++; const b = sizeOf(e.img[k]); e.bytes += b; bytes += b; }
    if (!['color', 'normal', 'orm'].some(n => e.img[n] && !e.tex[n])) { uploadQ.shift(); e.state = 'ready'; e.img = null; bump(); evict(); } }
  else uploadQ.shift();
  if (uploadQ.length) { pumping = true; raf(pump); }
}
function drop(e) { for (const t of Object.values(e.tex || {})) { t.dispose(); t.image?.close?.(); } for (const i of Object.values(e.img || {})) i?.close?.(); for (const m of e.mats.values()) m.dispose?.(); e.mats.clear(); bytes -= e.bytes; e.bytes = 0; e.tex = e.img = null; e.state = 'idle'; entries.delete(e.key); }
// Over the budget: the least recently used entries nobody shows go (only while the gate is open — never mid-round).
export function evict(budget = GLOVE_BUDGET) {
  if (bytes <= budget || !skinGateOpen()) return 0; let n = 0; const free = [...entries.values()].filter(e => e.state === 'ready' && !pinned.has(e.key)).sort((a, b) => a.used - b.used);
  for (const e of free) { if (bytes <= budget) break; drop(e); n++; stats.evicted++; } return n;
}
// One material per (entry, kind) — fp-view.js's first-person glove, cs2-agents.js's third-person one — made by the
// caller once and shared by every view that shows that finish; freed with the entry.
export function gloveMaterial(e, kind, make) { let m = e.mats.get(kind); if (!m) { m = make(e.tex); e.mats.set(kind, m); } return m; }
export const gloveStats = () => ({ ...stats, entries: entries.size, ready: [...entries.values()].filter(e => e.state === 'ready').length, types: [...types.values()].filter(t => t.state === 'ready').length, bytes, budget: GLOVE_BUDGET, queued: fetchQ.length + uploadQ.length + inflight, version });
export const pumpGloves = () => { if (uploadQ.length) pump(); };   // (tests: one frame of the upload pump)
export function resetGloves() { for (const e of [...entries.values()]) drop(e); types.clear(); fallbacks.clear(); fpTypes.clear(); fetchQ.length = uploadQ.length = 0; inflight = 0; pumping = false; bytes = 0; pinned = new Set(); for (const k in stats) stats[k] = 0; manifest = null; manifestP = null; setGloveCatalog(null); }
