// CS2 finishes' pictures (Global Defensive), imported on the host's computer (tools/import-cs2-skins.mjs →
// user-assets/skins/, never shipped) and served by the room to everyone (a Windows guest without CS2 draws the Mac
// host's finishes). Per (model, finish, tier) two pictures: the paint (sRGB) and the mrw data (R metal, G rough,
// B wear rank, A coverage). One texture pair per (model, finish, tier), shared by every player and dropped gun that
// shows it (refcounted). Off the play path: fetched and decoded off the main thread (createImageBitmap, at the tier's
// size), sent to the GPU one texture a frame and only while the gate is open (lab.js: not during a live round —
// freeze, buy time, warmup, deathmatch, a loading card); a finish still missing when a round goes live keeps drawing
// its built-in stand-in (skin-render.js) until the next quiet moment. Least recently used pictures nobody shows are
// freed once over the budget, outside live rounds only.
import * as THREE from './three.module.js';
import { textureSize, anisotropy } from './texture-quality.js';

export const SKIN_BUDGET = 128 * 1024 * 1024;   // bytes of skin textures (RGBA8 + mips) kept on the GPU at most (PLAN §5.4)
const TIERS = { fp: 1024, tp: 512 };   // your own first-person gun at 1024, everyone else's (and drops) at 512
const tierSize = t => Math.min(TIERS[t] || 512, textureSize());
let manifest = null, manifestP = null, base = '/user-assets/skins/', gate = () => true, fetchGate = null, renderer = null, readyFn = null, manifestFns = new Set();
const entries = new Map(), fetchQ = [], uploadQ = []; let inflight = 0, pumping = false, bytes = 0;
const stats = { uploads: 0, fetches: 0, failed: 0, evicted: 0 };
// Hooks (lab.js / tests): gate() true while textures may go to the GPU; fetchGate (default: gate) while files may be
// fetched (a guest on Wi-Fi fetches nothing mid-round: the room's stream keeps the link); the renderer.
export function setSkinGate(fn, fetchFn = null) { gate = fn || (() => true); fetchGate = fetchFn; kick(); }
export const setSkinRenderer = r => { renderer = r; };
export const onSkinReady = fn => { readyFn = fn; };   // (skin-render.js: binds a pair to the materials waiting for it)
export const onSkinManifest = fn => { manifestFns.add(fn); return () => manifestFns.delete(fn); };
// Tests: a loader without a browser (fetchImage(url, { size, data }) → image-like { width, height }).
let fetchImage = (url, { size, data }) => fetch(url).then(r => { if (!r.ok) throw Error(r.status + ' ' + url); return r.blob(); })
  .then(b => createImageBitmap(b, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: data ? 'none' : 'default' }));   // (mrw is data: no colour management, no premultiplied alpha)
export const setSkinLoader = (f, b) => { if (f) fetchImage = f; if (b) base = b; };
const web = () => typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
// The host's manifest (skins.json), fetched again when the room's catalogue changes (A.skinCat: the data track calls
// loadSkinManifest(true)). null: none (CI, a host without the import).
export function loadSkinManifest(force = false, given) {
  if (given !== undefined) { setManifest(given); return Promise.resolve(manifest); }
  if (manifestP && !force) return manifestP;
  if (!web()) return manifestP = Promise.resolve(null);
  return manifestP = fetch(base + 'skins.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null).then(m => { setManifest(m); return manifest; });
}
function setManifest(m) { const was = manifest?.made; manifest = m && typeof m === 'object' && m.version === 1 ? m : null;
  if (was !== manifest?.made) { for (const e of entries.values()) if (!e.refs) drop(e); for (const fn of manifestFns) fn(manifest); } }
export const skinManifest = () => manifest;
// Files for a finish on a model: guns 'cs2:<kit>' (manifest.weapons[model].finishes[kit]); knives 'cs2k:<family>'
// (manifest.knives[family].models[model]); null when this model has no bake of it (it draws the built-in stand-in).
export function finishFiles(model, finish) {
  if (!manifest || !model || typeof finish !== 'string') return null;
  if (finish.startsWith('cs2:')) { const f = manifest.weapons?.[model]?.finishes?.[finish.slice(4)]; return f?.paint && f.mrw ? f : null; }
  if (finish.startsWith('cs2k:')) { const f = manifest.knives?.[finish.slice(5)]?.models?.[model]; return f?.paint && f.mrw ? f : null; }
  return null;
}
// A file of the import by its manifest path (fp-view.js: the star knives' CS2 base pictures), versioned by the bake.
export const skinFileURL = rel => base + rel + '?m=' + encodeURIComponent(manifest?.made || '');
// The picker's thumbnail of a CS2 finish (PLAN §5.7: CS2's own econ icon from this install, an <img>, no GPU): guns
// manifest.weapons[w].finishes[kit].icon, knives manifest.knives[family].icon[knife]; null when there is none.
export function skinIconURL(model, finish) {
  if (!manifest || typeof finish !== 'string') return null; let rel = null;
  if (finish.startsWith('cs2:')) rel = manifest.weapons?.[model]?.finishes?.[finish.slice(4)]?.icon; else if (finish.startsWith('cs2k:')) { const ic = manifest.knives?.[finish.slice(5)]?.icon; rel = ic?.[model]; }   // (never another knife's icon: a knife without this bake draws the built-in stand-in, the menu its swatch)
  return rel ? skinFileURL(rel) : null;
}
// The manifest's built-in stand-in for a CS2 finish (fbId), when the skin record carries none.
export function fbOf(finish) { if (!manifest || typeof finish !== 'string') return null; return (finish.startsWith('cs2:') ? Object.values(manifest.weapons || {}).find(w => w.finishes?.[finish.slice(4)])?.finishes[finish.slice(4)] : manifest.knives?.[finish.slice(5)])?.fbId || null; }
// The pair for (model, finish, tier), made on first ask (not loaded yet: want() queues it). null: nothing to draw.
export function texEntry(model, finish, tier = 'tp') {
  const files = finishFiles(model, finish); if (!files) return null; const key = model + '|' + finish + '|' + tier; let e = entries.get(key);
  if (!e) { e = { key, model, finish, tier, files, state: 'idle', refs: 0, used: 0, bytes: 0, size: 0, paint: null, mrw: null, img: null, waiters: new Set() }; entries.set(key, e); }
  return e;
}
export function acquire(e) { if (e) { e.refs++; e.used = performance.now(); } }
export function release(e) { if (e && e.refs > 0) { e.refs--; e.used = performance.now(); } }
// Someone shows it: queue its load (nothing is fetched or uploaded here — the pumps do, when allowed).
export function want(e, who) { if (!e) return; if (who) e.waiters.add(who); if (e.state === 'idle' || e.state === 'failed' && e.retry < performance.now()) { e.state = 'queued'; fetchQ.push(e); kick(); } }
export const unwant = (e, who) => e?.waiters.delete(who);
// Load these ahead (freeze start: every player's guns at 'tp', your own at 'fp'): [{ model, finish, tier }].
export function prefetchSkins(list) { for (const w of list || []) want(texEntry(w.model, w.finish, w.tier)); }
const raf = cb => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16))(cb);
function kick() { fetchLoop(); if (uploadQ.length && !pumping) { pumping = true; raf(pump); } }
function fetchLoop() {
  while (inflight < 2 && fetchQ.length && (fetchGate || gate)()) {
    const e = fetchQ.shift(); if (e.state !== 'queued') continue; e.state = 'fetch'; inflight++; stats.fetches++; const size = tierSize(e.tier), v = '?m=' + encodeURIComponent(manifest?.made || '');
    Promise.all([fetchImage(base + e.files.paint + v, { size, data: false }), fetchImage(base + e.files.mrw + v, { size, data: true })])
      .then(([p, m]) => { if (e.state !== 'fetch') { p.close?.(); m.close?.(); return; } e.img = [p, m]; e.state = 'decoded'; uploadQ.push(e); })
      .catch(err => { e.state = 'failed'; e.retry = performance.now() + 30000; stats.failed++; console.warn('skin texture', e.key, err?.message); })
      .finally(() => { inflight--; kick(); });
  }
  if (fetchQ.length && !(fetchGate || gate)() && !retryT) retryT = setTimeout(() => { retryT = 0; fetchLoop(); }, 500);   // (one retry timer, however often kick() runs while the gate is shut)
}
let retryT = 0;
const texOf = (img, data, tier) => { const t = new THREE.Texture(img); t.flipY = false; t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;   // (a few MAC-10 / SSG 08 UVs lie outside 0..1)
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = tier === 'fp' ? anisotropy() : Math.min(4, anisotropy()); t.userData.shared = true; t.needsUpdate = true; return t; };
const sizeOf = img => Math.round((img.width || 0) * (img.height || 0) * 4 * 4 / 3);
// One texture to the GPU per frame, only while the gate is open (a live round waits).
function pump() {
  pumping = false; if (!uploadQ.length) return; if (!gate()) { pumping = true; setTimeout(() => raf(pump), 250); return; }   // (still 'pumping' while it waits: kick() starts no second chain)
  const e = uploadQ[0], r = renderer || globalThis.__infra?.renderer;
  if (e.state === 'decoded') { const which = e.paint ? 1 : 0, t = texOf(e.img[which], which === 1, e.tier); if (which) e.mrw = t; else e.paint = t;
    try { r?.initTexture(t); } catch (err) { console.warn('skin upload', e.key, err?.message); } stats.uploads++; const b = sizeOf(e.img[which]); e.bytes += b; bytes += b;
    if (e.paint && e.mrw) { uploadQ.shift(); e.state = 'ready'; e.img = null; e.size = e.paint.image.width; if (readyFn) readyFn(e); else e.waiters.clear(); evict(); } }   // (the images stay on the textures: three.js keeps them for a context loss)
  else uploadQ.shift();
  if (uploadQ.length) { pumping = true; raf(pump); }
}
function drop(e) { for (const t of [e.paint, e.mrw]) if (t) { t.dispose(); t.image?.close?.(); } for (const i of e.img || []) i?.close?.(); bytes -= e.bytes; e.bytes = 0; e.paint = e.mrw = e.img = null; e.state = 'idle'; e.waiters.clear(); entries.delete(e.key); }
// Over the budget: the least recently used pictures nobody shows go (only while the gate is open — never mid-round).
export function evict(budget = SKIN_BUDGET) {
  if (bytes <= budget || !gate()) return 0; let n = 0; const free = [...entries.values()].filter(e => !e.refs && e.state === 'ready').sort((a, b) => a.used - b.used);
  for (const e of free) { if (bytes <= budget) break; drop(e); n++; stats.evicted++; } return n;
}
export const skinTexStats = () => ({ ...stats, entries: entries.size, ready: [...entries.values()].filter(e => e.state === 'ready').length, referenced: [...entries.values()].filter(e => e.refs > 0).length, bytes, budget: SKIN_BUDGET, queued: fetchQ.length + uploadQ.length + inflight });
// Tests: run the upload pump once by hand (as one frame).
export const pumpSkinTextures = () => { if (uploadQ.length) pump(); };
export function resetSkinTextures() { for (const e of [...entries.values()]) drop(e); fetchQ.length = uploadQ.length = 0; inflight = 0; pumping = false; bytes = 0; for (const k in stats) stats[k] = 0; manifest = null; manifestP = null; }
