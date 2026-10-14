// A Source map keeps only what the game uses of it: of the files packed in it, the world's materials and their
// textures, and the static props' models with their materials and textures (copied out); its lightmaps and ambient
// light copied too. The rest of the file (prop lighting, physics, sounds — most of a CS:GO map's size) is let go, so a
// 600 MB map file costs a fraction of that once read. Textures are kept already read (vtf.js), only the sizes the game
// uploads (up to maxSize: Settings → Texture quality, 1024 px by default, so a 2048 picture costs a quarter).
import { loadModel } from './vbsp-props.js';
import { parseVmt, parseVtf } from './vtf.js';

export function compactVbsp(bsp, { maxSize = 1024 } = {}) {
  const keep = new Map(), vtfs = new Map(), src = bsp.pak, read = n => src.read(n);
  const take = n => { n = n.toLowerCase(); if (keep.has(n) || !src.has(n)) return null; const b = read(n); if (!b) return null; keep.set(n, b.slice()); return b; };
  const material = vmt => { const b = take(vmt); if (!b) return; const kv = parseVmt(new TextDecoder().decode(b), read);
    if (kv.include) take(String(kv.include).replace(/\\/g, '/'));
    for (const k of ['$basetexture', '$basetexture2']) if (kv[k]) { const t = String(kv[k]).toLowerCase().replace(/\\/g, '/').replace(/\.vtf$/, ''); if (vtfs.has(t)) continue; const v = parseVtf(read('materials/' + t + '.vtf'), { skipAbove: maxSize }); if (v) vtfs.set(t, { ...v, mips: v.mips.map(m => ({ width: m.width, height: m.height, data: m.data.slice() })) }); } };
  for (const td of bsp.texdata) material('materials/' + td.name + '.vmt');
  const used = new Set(bsp.props.map(p => p.model));
  for (const k of used) { const path = bsp.propModels[k], base = path.replace(/\.mdl$/i, ''); for (const f of [path, base + '.vvd', base + '.dx90.vtx', base + '.vtx']) take(f);
    const m = loadModel(src, path); if (m) for (const mesh of m.lods[0]) material(mesh.material); }
  const pak = keptPak(keep);
  let bytes = 0; for (const b of keep.values()) bytes += b.length; for (const v of vtfs.values()) for (const m of v.mips) bytes += m.data.length;
  return { ...bsp, pak, vtfs, lighting: bsp.lighting.slice(), ambient: bsp.ambient && { index: bsp.ambient.index, samples: bsp.ambient.samples.slice() }, packed: { files: keep.size, bytes } };
}
// The kept files as a pack (made out here: a closure made inside compactVbsp would share its scope — and with it the
// whole original file — with the functions there that read the original).
function keptPak(keep) { const pak = new Map([...keep].map(([n, b]) => [n, { size: b.length }])); pak.read = n => keep.get(n.toLowerCase()) || null; return pak; }
