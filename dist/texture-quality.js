// Texture settings (Settings → Graphics; 'auto' follows the Graphics mode):
//  · quality: the largest picture imported models (CS2 guns, knives, the bomb, agents) are drawn with — low 512,
//    medium 1024, high 2048 px. Their pictures are stored at 2048; a smaller size is made once as they load, off the
//    main thread. Takes effect on the next load (restart, or the next map for map pictures).
//  · filtering: anisotropic filtering for every texture (floors and walls at a slant stay sharp): 2×, 4×, 8×, 16×.
import { loadPreferences } from './player-preferences.js';

export const TEXTURE_SIZES = { low: 512, medium: 1024, high: 2048 };
export function textureSize(p = loadPreferences()) { return TEXTURE_SIZES[p.textures] || ({ Low: 512, Ultra: 2048 })[p.graphics] || 1024; }
export function anisotropy(p = loadPreferences()) { const a = +p.filtering; return [2, 4, 8, 16].includes(a) ? a : ({ Low: 2, Medium: 4, High: 8, Ultra: 16 })[p.graphics] || 4; }
// A decoded picture at most `size` px on its long side (the same picture when it already is).
export async function fitImage(img, size = textureSize()) {
  const w = img?.width || 0, h = img?.height || 0; if (!w || !h || Math.max(w, h) <= size) return img;
  const k = size / Math.max(w, h), out = await createImageBitmap(img, { resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(h * k)), resizeQuality: 'high' });
  img.close?.(); return out;
}
// A JPEG file decoded straight at the size asked for (one step: the browser can decode it smaller), with the
// options given (e.g. flipped). Its size comes from its header.
export async function decodeJpeg(blob, opts = {}, size = textureSize()) {
  const head = new DataView(await blob.slice(0, 65536).arrayBuffer()); let w = 0, h = 0;
  for (let i = 2; i + 9 < head.byteLength;) { if (head.getUint8(i) !== 0xff) break; const m = head.getUint8(i + 1), len = head.getUint16(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = head.getUint16(i + 5); w = head.getUint16(i + 7); break; } i += 2 + len; }
  const k = w && h ? Math.min(1, size / Math.max(w, h)) : 1;
  return createImageBitmap(blob, k < 1 ? { ...opts, resizeWidth: Math.round(w * k), resizeHeight: Math.round(h * k), resizeQuality: 'high' } : opts);
}
// Every texture in the scene to the new filtering (sent to the GPU again once: done when the setting changes).
const MAPS = ['map', 'map2', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap'];
export function applyFiltering(scene, a = anisotropy()) {
  const seen = new Set(); scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const k of MAPS) { const t = m[k] || m.userData?.[k]; if (t?.isTexture && !seen.has(t) && t.anisotropy !== a && !t.isRenderTargetTexture) { seen.add(t); t.anisotropy = a; t.needsUpdate = true; } } });
  return seen.size;
}
