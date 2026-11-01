# Bakes CS2 glove finishes for one glove type from the user's own CS2 install (Blender's Python: numpy + OpenImageIO).
# CS2 paints gloves with a composite material (gloves/paints/<kit>.vcompmat): at run time its compositor renders the
# paint .vmat with the glove shader in "output modes" 0-3 into the glove's g_tColor / g_tNormal / g_tMetalness /
# g_tAmbientOcclusion at 2048², wear (g_flWearAmount -> g_fWearProgress) included. The shaders are not in the install,
# so both generations are rebuilt here from the paint material's parameters and textures:
#   v1  csgo_customglove.vfx (72 finishes): g_tLayerMask RGB = weights of 4 textile layers (the 4th where RGB is 0),
#       A = colour id 1..8 ((id-0.5)/8) -> g_vColorTint<id>; per layer a tiled detail texture (R shade, G roughness),
#       detail normal, roughness brightness/contrast, metalness; g_tPattern replaces colour id g_nPatternReplaceIndex
#       (mode 0: palette chain g_vPatternPaletteIndices by pattern R, G, B; mode 2: the pattern's own colour);
#       g_tSurface G = ambient occlusion, B = edges (curvature, where wear starts).
#   v2  csgo_customglove_preview.vfx (22 newer finishes; bake_v2.py): g_tLayerId RGB = layer weights, g_tTintId (8-bit) = id 1..8
#       -> g_vId<id>Color (A = how much of it), per layer a tiled textile (g_tSurface<i>: colour, normal, properties)
#       with brightness / contrast / saturation / tint; g_tPattern = a paint in the glove's UV (A = coverage, where
#       g_bId<id>Pattern), g_tPatternProperties G = its roughness; g_tObjectProperties R = ambient occlusion.
# Per finish, in the glove's UV0 (row 0 = v 0, the glTF convention; one texture set for both hands):
#   <type>/<kit>_color.jpg   base colour, sRGB (no AO baked in: the ORM carries it)
#   <type>/<kit>_normal.png  tangent-space normal, glTF +Y (CS2's hemi-octahedral normal maps decoded, as Source2Viewer does)
#   <type>/<kit>_orm.png     R ambient occlusion, G roughness, B metalness (linear data, no colour chunks)
#   <type>/<kit>_wear.png    512², R = wear threshold: a texel looks worn once the float wear passes it (CS2 re-bakes the
#                            whole composite per wear; this map + the manifest's wearLook let the runtime approximate it)
#   icons/<type>/<kit>.webp  CS2's own econ icon (light), 256×192
# usage: python3 -I -B bake.py <job.json>; one "RESULT {json}" line per finish.
# job: {vpk, type, res, out, root, mask, cache, force, bake_version, finishes[]}
import sys, os, json, math, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(1, os.path.join(os.path.dirname(HERE), 'cs2-skins'))
import numpy as np
from vpk import VPK
import tex as T
from imglib import load, resize, save, srgb2lin, lin2srgb, dilate

ICON_W, ICON_H = 256, 192


def sample(img, u, v):
    h, w = img.shape[:2]; u = u % 1.0; v = v % 1.0
    x = u * w - 0.5; y = v * h - 0.5; x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    x1 = (x0 + 1) % w; y1 = (y0 + 1) % h; x0 %= w; y0 %= h
    return (img[y0, x0] * (1 - fx) + img[y0, x1] * fx) * (1 - fy) + (img[y1, x0] * (1 - fx) + img[y1, x1] * fx) * fy


def xform(u, v, scale, rot, off, centre=(0.5, 0.5)):
    sx, sy = (scale, scale) if np.isscalar(scale) else scale
    r = math.radians(rot); c, s = math.cos(r), math.sin(r); u = u - centre[0]; v = v - centre[1]
    return (u * c - v * s) * sx + centre[0] + off[0], (u * s + v * c) * sy + centre[1] + off[1]


def hemi(a):
    """Source 2 normal map (RG hemi-octahedral) -> unit normals (…, 3), +Y = glTF"""
    x = a[..., 0] * 2 - 1; y = a[..., 1] * 2 - 1; tx = (x + y) * 0.5; ty = (x - y) * 0.5; z = 1 - np.abs(tx) - np.abs(ty)
    n = np.stack([tx, ty, z], -1); return n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)


def detail_blend(base, det, k):
    """partial-derivative blend of a detail normal (strength k, per texel or scalar) onto a base normal"""
    k = np.asarray(k, np.float32)[..., None] if np.ndim(k) else np.float32(k)
    bz = np.maximum(base[..., 2:3], 0.05); dz = np.maximum(det[..., 2:3], 0.05)
    xy = base[..., :2] / bz + k * det[..., :2] / dz
    n = np.concatenate([xy, np.ones_like(bz)], -1); return n / np.linalg.norm(n, axis=-1, keepdims=True)


def lum(c): return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def sat(c, s):
    l = lum(c)[..., None]; return l + (c - l) * s


def default_tex(p): return (not p) or '/default/' in p or os.path.basename(p).startswith('default_')


class Ctx:
    def __init__(self, job):
        self.job = job; self.V = VPK(job['vpk']); self.R = int(job['res'])
        v, u = np.mgrid[0:self.R, 0:self.R].astype(np.float32); self.u = (u + 0.5) / self.R; self.v = (v + 0.5) / self.R
        self.cov = load(job['mask'])[..., 0] > 0.5
        if self.cov.shape[0] != self.R: self.cov = resize(self.cov[..., None].astype(np.float32), self.R)[..., 0] > 0.5
        self._uv = {}

    def uvmap(self, path):   # a texture laid out in the glove's UV, at bake resolution
        if path not in self._uv:
            if len(self._uv) > 10: self._uv.pop(next(iter(self._uv)))
            self._uv[path] = resize(T.load(self.V, path), self.R)
        return self._uv[path]

    def tiled(self, path, scale, rot=0.0, off=(0, 0)):
        a = T.load(self.V, path)
        return sample(a, *xform(self.u, self.v, scale, rot, off))


def P(f, k, d=0.0):
    x = f['params'].get(k, d)
    return x[0] if isinstance(x, list) else x   # (a few kits store a scalar as a vector)


def vec(f, k, d=(1, 1, 1, 0)):
    x = f['params'].get(k); return list(x) + [0] * (4 - len(x)) if isinstance(x, list) else list(d)


def weights(m):
    w = np.stack([m[..., 0], m[..., 1], m[..., 2], np.clip(1 - m[..., 0] - m[..., 1] - m[..., 2], 0, 1)], -1)
    return w / np.maximum(w.sum(-1, keepdims=True), 1e-4)


def bake_v1(C, f):
    t = f['tex']; R = C.R
    M = C.uvmap(t['g_tLayerMask']); W = weights(M)
    idx = np.clip(np.round(M[..., 3] * 8 - 0.5), 0, 7).astype(np.int64)
    tints = np.array([srgb2lin(np.array(vec(f, f'g_vColorTint{i}', (0.5, 0.5, 0.5, 0))[:3], np.float32)) for i in range(1, 9)], np.float32)
    col = tints[idx]
    pat_a = np.zeros((R, R), np.float32); pattern_on = int(P(f, 'F_PATTERN', 0)) == 1 and not default_tex(t.get('g_tPattern'))
    if pattern_on:
        off = vec(f, 'g_fPatternTexCoordOffset', (0, 0, 0, 0))
        pu, pv = xform(C.u, C.v, float(P(f, 'g_fPatternTexCoordScale', 1)), float(P(f, 'g_fPatternTexCoordRotation', 0)), off[:2])
        pt = sample(T.load(C.V, t['g_tPattern']), pu, pv)
        if int(P(f, 'g_nPatternMode', 0)) == 2: pc = srgb2lin(pt[..., :3])
        else:
            pal = [int(round(x)) for x in vec(f, 'g_vPatternPaletteIndices', (1, 2, 3, 4))]; tc = lambda i: tints[min(max(i, 1), 8) - 1]
            pc = np.broadcast_to(tc(pal[0]), pt[..., :3].shape).copy()
            for ch, i in ((0, pal[1]), (1, pal[2]), (2, pal[3])): pc += (tc(i) - pc) * pt[..., ch:ch + 1]
        rep = int(P(f, 'g_nPatternReplaceIndex', 0)); pat_a = (idx == rep - 1).astype(np.float32) if rep > 0 else np.ones((R, R), np.float32)
        col = col + (pc - col) * pat_a[..., None]
    shade = np.zeros((R, R), np.float32); rough = np.zeros((R, R), np.float32); metal = np.zeros((R, R), np.float32); dnx = np.zeros((R, R, 3), np.float32); kk = np.zeros((R, R), np.float32)
    for i in range(1, 5):
        w = W[..., i - 1]
        if w.max() < 1e-3: continue
        sc = float(P(f, f'g_fDetailScale{i}', 1))
        if not default_tex(t.get(f'g_tDetail{i}')):
            d = C.tiled(t[f'g_tDetail{i}'], sc); dr = d[..., 0]; bp = float(P(f, f'g_fDetailBlackPoint{i}', 0)); dr = np.clip((dr - bp) / max(1 - bp, 1e-3), 0, 1)
            s = dr / max(float(dr.mean()), 1e-3); dg = d[..., 1]
        else: s = np.ones((R, R), np.float32); dg = np.full((R, R), 0.5, np.float32)
        shade += w * np.clip(0.55 + 0.45 * s, 0, 1.6)
        r = np.clip(((dg - 0.5) * (1 + float(P(f, f'g_fDetailRoughnessContrast{i}', 0))) + 0.5) * float(P(f, f'g_fDetailRoughnessBrightness{i}', 1)), 0.04, 1)
        rough += w * r; metal += w * float(P(f, f'g_fDetailMetalness{i}', 0))
        if not default_tex(t.get(f'g_tDetailNormal{i}')):
            dn = hemi(C.tiled(t[f'g_tDetailNormal{i}'], sc)); dnx += w[..., None] * dn; kk += w * 0.35 * float(P(f, f'g_fDetailNormalContrast{i}', 1))
        else: dnx += w[..., None] * np.array([0, 0, 1], np.float32)
    infl = float(P(f, 'g_fPatternDetailInfluence', 25)) / 25.0
    shade = 1 + (shade - 1) * (1 - pat_a * (1 - min(infl, 1)))
    col = col * shade[..., None]
    if pattern_on:
        rough = rough + (np.clip(rough * float(P(f, 'g_fPatternRoughnessBrightness', 1)), 0.04, 1) - rough) * pat_a
        metal = metal + (float(P(f, 'g_fPatternMetalness', 0)) - metal) * pat_a
    base = hemi(C.uvmap(t['g_tNormal'])) if not default_tex(t.get('g_tNormal')) else np.dstack([np.zeros((R, R, 2)), np.ones((R, R, 1))]).astype(np.float32)
    nrm = detail_blend(base, dnx / np.maximum(np.linalg.norm(dnx, axis=-1, keepdims=True), 1e-6), kk)
    S = C.uvmap(t['g_tSurface']) if not default_tex(t.get('g_tSurface')) else np.ones((R, R, 4), np.float32)
    ao = S[..., 1]; edge = S[..., 2] if S.shape[2] > 2 else np.zeros((R, R), np.float32)
    # wear: edges first (curvature ** power, boosted per layer), then the noise texture spreads it
    pw = sum(W[..., i - 1] * float(P(f, f'g_fCurvaturePower{i}', 3)) for i in range(1, 5)); bo = sum(W[..., i - 1] * float(P(f, f'g_fCurvatureWearBoost{i}', 0.1)) for i in range(1, 5))
    noise = C.tiled(t['g_tNoise'], 2.0)[..., 0] if not default_tex(t.get('g_tNoise')) else np.full((R, R), 0.5, np.float32)
    dmg = np.clip(np.clip(edge, 0, 1) ** np.maximum(pw / 3, 0.2) * (0.6 + bo) + (noise - 0.5) * 0.35, 0, 1)
    look = {k: round(float(sum((W[..., i - 1] * C.cov).sum() * float(P(f, f'g_fDamage{k}{i}', d)) for i in range(1, 5)) / max(C.cov.sum(), 1)), 3)
            for k, d in (('Brightness', 0), ('Saturation', 0), ('RoughnessBrightness', 1))}
    cloth = bool(P(f, 'F_CLOTH_SHADING', 0))
    return col, nrm, ao, rough, metal, dmg, {'brightness': look['Brightness'], 'saturation': look['Saturation'], 'roughness': look['RoughnessBrightness']}, cloth


def finish(C, f, out, icon_out):
    if 'preview' in f['shader']:
        from bake_v2 import bake_v2   # (bake_v2.py: the newer shader; imported here, it imports this module's helpers)
        col, nrm, ao, rough, metal, dmg, look, cloth = bake_v2(C, f)
    else: col, nrm, ao, rough, metal, dmg, look, cloth = bake_v1(C, f)
    valid = C.cov
    srgb = lin2srgb(np.clip(col, 0, 1))
    srgb, _ = dilate(srgb, valid, 12); n3, _ = dilate(nrm * 0.5 + 0.5, valid, 12)
    orm, _ = dilate(np.stack([np.clip(ao, 0, 1), np.clip(rough, 0.04, 1), np.clip(metal, 0, 1)], -1), valid, 12)
    thr = np.clip(1 - dmg, 0, 1)   # wear threshold: worn where wear > thr (CS2's wear range 0.06-0.8 -> heavy wear reaches the edges)
    thr, _ = dilate(thr[..., None], valid, 12)
    os.makedirs(os.path.dirname(out['color']), exist_ok=True)
    save(out['color'] + '.tmp.jpg', srgb, quality=92); os.replace(out['color'] + '.tmp.jpg', out['color'])
    save(out['normal'] + '.tmp.png', n3); os.replace(out['normal'] + '.tmp.png', out['normal'])
    save(out['orm'] + '.tmp.png', orm); os.replace(out['orm'] + '.tmp.png', out['orm'])
    save(out['wear'] + '.tmp.png', resize(thr, 512)); os.replace(out['wear'] + '.tmp.png', out['wear'])
    icon = None
    ip = f['icons'].get('light')
    if ip and icon_out:
        a = T.load(C.V, ip); h, w = a.shape[:2]; tw = ICON_W; th = ICON_H
        s = min(tw / w, th / h); a2 = resize(a, max(1, round(w * s)), max(1, round(h * s)))
        canvas = np.zeros((th, tw, a.shape[2]), np.float32); y0 = (th - a2.shape[0]) // 2; x0 = (tw - a2.shape[1]) // 2; canvas[y0:y0 + a2.shape[0], x0:x0 + a2.shape[1]] = a2
        os.makedirs(os.path.dirname(icon_out), exist_ok=True); save(icon_out + '.tmp.webp', canvas, quality=88); os.replace(icon_out + '.tmp.webp', icon_out); icon = icon_out
    m = valid
    mean = lin2srgb(np.array([float((col[..., k] * m).sum() / max(m.sum(), 1)) for k in range(3)]))
    # a plain colour for players without the files: the glove's average base colour (sRGB)
    fb = '#' + ''.join(f'{int(round(float(np.clip(x, 0, 1)) * 255)):02x}' for x in mean)
    return {'fallback': fb, 'roughMean': round(float((rough * m).sum() / max(m.sum(), 1)), 3), 'metalMean': round(float((metal * m).sum() / max(m.sum(), 1)), 3), 'wearLook': look, 'cloth': cloth, 'icon': icon}


def main(job):
    C = Ctx(job); root = job['out']; tp = job['type']
    for f in job['finishes']:
        t0 = time.time(); kit = f['kit']
        out = {k: os.path.join(root, tp, f'{kit}_{k}.' + ('jpg' if k == 'color' else 'png')) for k in ('color', 'normal', 'orm', 'wear')}
        icon_out = os.path.join(root, 'icons', tp, kit + '.webp')
        try:
            r = finish(C, f, out, icon_out); r.update(ok=True, type=tp, kit=kit, v=job.get('bake_version', ''), secs=round(time.time() - t0, 1))
            if job.get('cache'):
                os.makedirs(job['cache'], exist_ok=True); json.dump(r, open(os.path.join(job['cache'], f'{tp}_{kit}_{C.R}.json'), 'w'))
        except Exception as e:
            import traceback; traceback.print_exc(); r = {'ok': False, 'type': tp, 'kit': kit, 'error': f'{type(e).__name__}: {e}'}
        print('RESULT ' + json.dumps(r), flush=True)


if __name__ == '__main__':
    main(json.load(open(sys.argv[1])))
