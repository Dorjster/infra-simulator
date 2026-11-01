# The newer CS2 glove shader (csgo_customglove_preview.vfx, the "volatile" finishes) rebuilt for tools/cs2-gloves/bake.py:
# g_tLayerId RGB = weights of 4 textile layers; g_tTintId (8-bit) = id 1..8 (which eighth of 0..1) -> g_vId<id>Color
# (A = how much it multiplies in); per layer a tiled textile g_tSurface<i> (colour + normal) with brightness / contrast
# / saturation and tint (tint alpha set: the tint's hue at the textile's brightness); g_tPattern on the ids with
# g_bId<id>Pattern (F_PATTERN: printed into the textile, F_PATTERN_PAINT: painted on it; A = coverage; a translucency
# pattern takes its colour from TexturePatternColor), g_tPatternProperties G = its roughness; g_tObjectProperties
# R = ambient occlusion, G = edges. An approximation (the shader is not in the install). No Valve data lives here.
import numpy as np
import tex as T
from imglib import srgb2lin
from bake import P, vec, weights, default_tex, sample, xform, hemi, detail_blend, lum, sat


def bake_v2(C, f):
    t = f['tex']; R = C.R
    W = weights(C.uvmap(t['g_tLayerId']))
    if t.get('g_tTintId'):
        a = T.load(C.V, t['g_tTintId'])[..., 0]; h, w = a.shape   # nearest texel: ids must not blend
        tid = a[np.minimum((C.v * h).astype(np.int64), h - 1), np.minimum((C.u * w).astype(np.int64), w - 1)]
        idx = np.clip(np.floor(tid * 8), 0, 7).astype(np.int64)   # (id = which eighth of 0..1 the value falls in: maps hold 18, 49, 77 … or 31, 61, 107 … levels)
    else: idx = np.zeros((R, R), np.int64)
    col = np.zeros((R, R, 3), np.float32); rough = np.zeros((R, R), np.float32); metal = np.zeros((R, R), np.float32); dnx = np.zeros((R, R, 3), np.float32)
    for i in range(1, 5):
        w = W[..., i - 1]
        if w.max() < 1e-3 or default_tex(t.get(f'g_tSurface{i}')): continue
        sc = vec(f, f'g_vUvScale{i}', (1, 1, 0, 0))[:2]; off = vec(f, f'g_vUvOffset{i}', (0, 0, 0, 0))[:2]
        uv = xform(C.u, C.v, (sc[0] or 1, sc[1] or 1), 0, off)
        s = srgb2lin(sample(T.load(C.V, t[f'g_tSurface{i}']), *uv)[..., :3])
        m = float(lum(s).mean()) or 1e-3
        c = (s - m) * float(P(f, f'g_fSurfaceColorContrast{i}', 1)) + m
        c = sat(c, float(P(f, f'g_fSurfaceColorSaturation{i}', 1))) * float(P(f, f'g_fSurfaceColorBrightness{i}', 1))
        tint = vec(f, f'g_vSurfaceColorTint{i}'); tl = srgb2lin(np.array(tint[:3], np.float32))
        if min(tint[:3]) < 0.98: c = tl / max(float(lum(tl)), 1e-3) * lum(c)[..., None] if tint[3] > 0.5 else c * tl   # (alpha set: the tint's hue at the textile's own brightness; a white tint leaves the textile's colours, e.g. Plum Quill's ostrich)
        col += w[..., None] * np.clip(c, 0, 1)
        r0 = vec(f, f'TextureSurfaceRoughness{i}', (0.6, 0.6, 0.6, 0))[0] if f'TextureSurfaceRoughness{i}' in f['params'] else 0.6
        rough += w * r0; metal += w * (vec(f, f'TextureSurfaceMetalness{i}', (0, 0, 0, 0))[0] if f'TextureSurfaceMetalness{i}' in f['params'] else 0)
        if not default_tex(t.get(f'g_tSurfaceNormal{i}')): dnx += w[..., None] * hemi(sample(T.load(C.V, t[f'g_tSurfaceNormal{i}']), *uv))
        else: dnx += w[..., None] * np.array([0, 0, 1], np.float32)
    if int(P(f, 'F_TINT_ID', 0)):
        ids = np.array([vec(f, f'g_vId{i}Color') for i in range(1, 9)], np.float32); ic = srgb2lin(ids[:, :3]); ia = ids[:, 3]
        col = col + (col * ic[idx] - col) * ia[idx][..., None]   # id colour multiplies the textile, by its alpha
    pat_a = np.zeros((R, R), np.float32)
    if (int(P(f, 'F_PATTERN', 0)) or int(P(f, 'F_PATTERN_PAINT', 0))) and not default_tex(t.get('g_tPattern')):
        sc = vec(f, 'g_vPatternTexCoordScale', (1, 1, 0, 0))[:2]; off = vec(f, 'g_vPatternTexCoordOffset', (0, 0, 0, 0))[:2]; ce = vec(f, 'g_vPatternTexCoordCenter', (0.5, 0.5, 0, 0))[:2]
        pu, pv = xform(C.u, C.v, (sc[0] or 1, sc[1] or 1), float(P(f, 'g_fPatternTexCoordRotation', 0)), off, ce)
        pt = sample(T.load(C.V, t['g_tPattern']), pu, pv)
        allow = np.array([float(P(f, f'g_bId{i}Pattern', 1)) for i in range(1, 9)], np.float32)[idx]
        pat_a = np.clip((pt[..., 3] if pt.shape[2] > 3 else 1.0) * allow, 0, 1)
        shade = np.clip(lum(col) / max(float(lum(col).mean()), 1e-3), 0.6, 1.3)
        pc = srgb2lin(pt[..., :3])
        if isinstance(f['params'].get('TexturePatternColor'), list):   # a translucency pattern: its colour is a constant, shaded by the pattern
            pl = lum(pc); ref = float((pl * pat_a).sum() / max(pat_a.sum(), 1e-3)) or 1e-3
            pc = srgb2lin(np.array(f['params']['TexturePatternColor'][:3], np.float32)) * np.clip(pl / ref, 0.5, 1.5)[..., None]
        col = col + (pc * shade[..., None] - col) * pat_a[..., None]
        if not default_tex(t.get('g_tPatternProperties')):
            pp = sample(T.load(C.V, t['g_tPatternProperties']), pu, pv); pr = pp[..., 1] if pp.shape[2] > 1 else pp[..., 0]
            rough = rough + (pr - rough) * pat_a
    base = hemi(C.uvmap(t['g_tNormal'])) if not default_tex(t.get('g_tNormal')) else np.dstack([np.zeros((R, R, 2)), np.ones((R, R, 1))]).astype(np.float32)
    nrm = detail_blend(base, dnx / np.maximum(np.linalg.norm(dnx, axis=-1, keepdims=True), 1e-6), 0.5 * (1 - pat_a * 0.7))
    O = C.uvmap(t['g_tObjectProperties']) if not default_tex(t.get('g_tObjectProperties')) else np.ones((R, R, 4), np.float32)
    ao = O[..., 0]; edge = O[..., 1] if O.shape[2] > 1 else np.zeros((R, R), np.float32)
    dmg = np.clip(np.clip(edge - 0.35, 0, 1) * 1.6, 0, 1)
    return col, nrm, ao, np.clip(rough, 0.04, 1), np.clip(metal, 0, 1), dmg, {'brightness': 0.25, 'saturation': -0.4, 'roughness': 1.2}, bool(P(f, 'F_CLOTH_SHADING', 0))

