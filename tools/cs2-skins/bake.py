# Bakes CS2 finishes for one game model (a gun or a star knife) from the user's own CS2 install, with Blender's Python
# (numpy + OpenImageIO): an offline re-implementation of CS2's weapon-finish composite (csgo_customweapon.vfx is not in
# the install, so each F_PAINT_STYLE is rebuilt from the paint material's parameters and the model's composite inputs).
# Per finish, in the model's HD UV0 layout (images: row 0 = v 0, the glTF convention; three.js flipY = false):
#   <kit>_paint.jpg  paint albedo, sRGB, AO + cavity baked in; on knives the handle (outside CS2's blade mask) is
#                    matte near-black paint (the game's black-handle rule)
#   <kit>_mrw.png    data: R paint metalness, G paint roughness, B wear rank (the wear float at which the paint is
#                    gone: the shader keeps paint where rank > wear), A paint coverage
# Legacy finishes (CS2 paints them in body_legacy's layout) are composited in that layout and resampled into HD UV0
# through the gun's lookup (legacy_lookup.py, transfer.py). Knives also get base maps (base/<knife>_color.jpg, _orm.jpg).
# usage: python3 -I bake.py <job.json>   (written by tools/import-cs2-skins.mjs). Prints one "RESULT {json}" per finish.
# job: {vpk, res, kind gun|knife, model, out, root, cache, composite, legacy_composite?, lut?, base?, wear_tex, finishes[], suffix?, force?}
# Only identifiers and logic live here; every texture and parameter is read from the install at run time.
import sys, os, json, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from vpk import VPK
import vtex
from imglib import load, resize, save, rgb, chan, srgb2lin, lin2srgb, smooth, dilate
from transfer import Lookup

job = json.load(open(sys.argv[1])); V = VPK(job['vpk']); RES = int(job['res']); KNIFE = job['kind'] == 'knife'
OUT = job['out']; os.makedirs(OUT, exist_ok=True)
_cache = {}
KNIFE_WEAR_K = 0.85   # knives lose paint faster than guns: measured on the light → heavy econ icons (Crimson Web, Lore, Autotronic: 18–32% of the knife changes; 0.4 gave 5–15%, 0.85 gives ~24%)
BAKE_V = job.get('bake_version', '')


def tex(path, res=None, keep=False):
    """a texture from the VPK as float (H, W, C), resized to res (square) if given; patterns are capped at 2048"""
    key = (path, res)
    if key in _cache: return _cache[key]
    a = vtex.decode(V.read(vtex.compiled_name(path)))
    if res: a = resize(a, res)
    elif a.shape[0] > 2048: a = resize(a, 2048, int(a.shape[0] * 2048 / a.shape[1]))
    if keep or len(_cache) < 6: _cache[key] = a
    return a


def sample(img, u, v, clampu=False, clampv=False):
    h, w = img.shape[:2]; u = np.clip(u, 0, 0.9999) if clampu else u % 1.0; v = np.clip(v, 0, 0.9999) if clampv else v % 1.0
    x = u * w - 0.5; y = v * h - 0.5; x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    x1 = (x0 + 1) % w; y1 = (y0 + 1) % h; x0 %= w; y0 %= h
    return (img[y0, x0] * (1 - fx) + img[y0, x1] * fx) * (1 - fy) + (img[y1, x0] * (1 - fx) + img[y1, x1] * fx) * fy


def xform(u, v, scale, rot, off):
    r = math.radians(rot); c, s = math.cos(r), math.sin(r); u = u - 0.5; v = v - 0.5
    return (u * c - v * s) * scale + 0.5 + off[0], (u * s + v * c) * scale + 0.5 + off[1]


def is_default(p): return (not p) or '/default/' in p or os.path.basename(p).startswith('default_')


class Layout:
    """a model's composite inputs at one resolution (the HD/knife layout, or a gun's legacy layout)"""
    def __init__(self, comp, res, island=None):
        self.res = res; self.uvscale = comp['uvscale']; self.len = comp['len']
        ao = tex(comp['ao'], res, True); self.occ = chan(ao, 1, 1.0); self.cav = chan(ao, 0, 1.0); self.edge = chan(ao, 3, 1.0) if ao.shape[2] > 3 else 1 - 0 * self.cav
        m = tex(comp['masks'], res, True); self.mr, self.mg, self.mb = chan(m, 0), chan(m, 1), chan(m, 2)
        self.comp = comp; self._pos = None
        v, u = np.mgrid[0:res, 0:res].astype(np.float32); self.u = (u + 0.5) / res; self.v = (v + 0.5) / res
        self.island = island if island is not None else ((self.occ > 0.01) | (self.mr + self.mg + self.mb > 0.01))

    def pos(self):
        if self._pos is None: self._pos = tex(self.comp['pos'], self.res, True)
        return self._pos


def colours(P):
    return [srgb2lin(np.array((P.get(f'g_vColor{i}') or [1, 1, 1, 1])[:3], np.float32)) for i in range(4)]


def chain(C, p):   # colour 0, then toward colours 1..3 by pattern R, G, B (hydro / spray / anodized-multi)
    c = np.broadcast_to(C[0], p.shape[:2] + (3,)).copy()
    for k in range(3): c = c * (1 - p[..., k:k + 1]) + C[k + 1] * p[..., k:k + 1]
    return c


def chain1(vals, p):
    c = np.full(p.shape[:2], vals[0], np.float32)
    for k in range(3): c = c * (1 - p[..., k]) + vals[k + 1] * p[..., k]
    return c


def uvtex0(path, L, pat_uv):   # a texture in the pattern's coordinates
    if pat_uv == 'uv' or pat_uv is None: return tex(path, L.res)
    return sample(tex(path), *pat_uv)


def composite(L, f):
    """-> layers (H, W, 8): paint rgb (linear), metal, rough, wear driver e, coverage, occlusion"""
    P, T, F = f['params'], f['tex'], int(f['F']); u, v = L.u, L.v
    ign = int(P.get('g_bIgnoreWeaponSizeScale', 0)); scale = float(P.get('g_flPatternTexCoordScale', 1)) * (1.0 if ign else L.uvscale * 2.0)   # (×2: calibrated by eye against the econ icons)
    rot = float(P.get('g_flPatternTexCoordRotation', 0)); off = (P.get('g_vPatternTexCoordOffset') or [0, 0])[:2]
    bright = float(P.get('g_flColorBrightness', 1)); C = colours(P)
    occ = L.occ
    if P.get('g_bOverrideAmbientOcclusion') and not is_default(T.get('g_tFinalAmbientOcclusion')): occ = chan(tex(T['g_tFinalAmbientOcclusion'], L.res), 0, 1.0)
    mr, mg, mb = L.mr, L.mg, L.mb
    pbn = T.get('g_tPaintByNumberMasks') if P.get('g_bOverrideDefaultMasks') else (T.get('g_tMasks') if not is_default(T.get('g_tMasks')) else None)
    if pbn and not is_default(pbn): m = tex(pbn, L.res); mr, mg, mb = chan(m, 0), chan(m, 1), chan(m, 2)
    pat_uv = None; pat = None
    pt = T.get('g_tPattern')
    if F in (6, 8):                                    # custom / gunsmith: the pattern is the artwork, in the model's UVs
        if abs(scale - 1) < 1e-6 and abs(rot) < 1e-6 and abs(off[0]) + abs(off[1]) < 1e-6: pat = tex(pt, L.res); pat_uv = 'uv'
        else: uu, vv = xform(u, v, scale, rot, off); pat = sample(tex(pt), uu, vv); pat_uv = (uu, vv)
    elif F in (2, 5):                                  # spray / airbrush: projected through the model's position map
        pos = L.pos(); pu, pv = 1 - pos[..., 2], 1 - pos[..., 1]
        uu, vv = xform(pu, pv, scale, -rot, off)        # (rotation sense mirrored vs our position-map axes: calibrated against the knife Fade icons)
        if F == 5:                                     # (the fade spans the painted part: CS2's exact projection is unknown)
            live = (mr > .5) & L.island if KNIFE else L.island
            lo, hi = np.percentile(uu[live], [2, 98]) if live.any() else (0, 1)
            uu = 0.05 + 0.95 * (hi - uu) / max(1e-4, hi - lo); pat = sample(tex(pt), uu, vv * 0 + 0.5, True, True)
        else: pat = sample(tex(pt), uu, vv)
    elif F in (1, 4, 7):
        uu, vv = xform(u, v, scale, rot, off); pat = sample(tex(pt), uu, vv); pat_uv = (uu, vv)
    if pat is not None and pat.shape[2] < 3: pat = np.repeat(pat[..., :1], 3, 2)
    metal_d = {0: 0.0, 1: 0.0, 2: 0.0, 3: 1.0, 4: 1.0, 5: 1.0, 6: 0.0, 7: 1.0, 8: 0.0}.get(F, 0.0)
    if F == 0:                                         # solid: colour 0, colours 1..3 on the model's mask channels R, G, B
        pc = np.broadcast_to(C[0], u.shape + (3,)).copy()
        for c_, m_ in ((C[1], mr), (C[2], mg), (C[3], mb)): pc = pc * (1 - m_[..., None]) + c_ * m_[..., None]
    elif F in (1, 2): pc = chain(C, pat)
    elif F == 3: pc = np.broadcast_to(C[0] * bright, u.shape + (3,)).copy()
    elif F in (4, 5): pc = chain(C, pat) * bright
    elif F == 6: pc = srgb2lin(pat[..., :3]) * bright
    elif F == 7: pc = srgb2lin(pat[..., :3]) * C[0] * bright * 0.85          # patina over steel (0.85 calibrated by eye)
    elif F == 8:                                       # gunsmith: the brightness lifts only where the pattern's alpha is set
        a8 = pat[..., 3] if pat.shape[2] > 3 else np.ones(u.shape, np.float32)   # (fits the econ icons: brightness on the
        pc = srgb2lin(pat[..., :3]) * (1 + (bright - 1) * a8)[..., None]           #  whole pattern made 33 of 105 kits ~1.3× too light)
    else: raise ValueError(f'paint style {F} not supported')
    pc = np.clip(pc, 0, 1)
    pearl = abs(float(P.get('g_flPearlescentScale', 0) or 0))
    if pearl > 0 and F in (6, 8):                      # pearlescent (Printstream): CS2 turns the hue with the view angle, which
        pm = T.get('g_tPearlescenceMask')              # averages to a neutral pearl in the icons; the bake keeps that average
        mk = chan(uvtex0(pm, L, pat_uv), 0, 1.0) if (pm and not is_default(pm) and (P.get('F_PEARLESCENCE_MASK') or P.get('g_bUsePearlescenceMask'))) else np.ones(u.shape, np.float32)
        lum = (pc @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
        d = (np.clip(mk * min(1.0, pearl / 20.0), 0, 1) * 0.85)[..., None]; pc = pc * (1 - d) + lum * d
    # paint metalness / roughness
    def uvtex(path):
        if pat_uv == 'uv' or pat_uv is None: return tex(path, L.res)
        return sample(tex(path), *pat_uv)
    if 'g_flPaintMetalness' in P: metal = np.full(u.shape, float(P['g_flPaintMetalness']), np.float32)
    elif 'g_vPaintMetalness' in P and pat is not None and F in (1, 2): metal = chain1([float(x) for x in P['g_vPaintMetalness'][:4]], pat)
    else: metal = np.full(u.shape, metal_d, np.float32)
    if (P.get('F_METALNESS_TEXTURE') or P.get('g_bUseMetalness')) and not is_default(T.get('g_tPaintMetalness')): metal = chan(uvtex(T['g_tPaintMetalness']), 0)
    rough = np.full(u.shape, float(P.get('g_flPaintRoughness', 0.5 if F in (6, 8) else 0.45)), np.float32)
    if P.get('F_ROUGHNESS_PER_COLOR') and 'g_vPaintRoughness' in P and pat is not None: rough = chain1([float(x) for x in P['g_vPaintRoughness'][:4]], pat)
    if (P.get('F_ROUGHNESS_TEXTURE') or P.get('g_bUseRoughness')) and not is_default(T.get('g_tPaintRoughness')): rough = chan(uvtex(T['g_tPaintRoughness']), 0)
    # wear driver: low = worn first (CS2's shared wear texture, pushed down in cavities and on edges)
    wt = tex(job['wear_tex'], keep=True)[..., :1]; ws = 1.0 if KNIFE else 1.6
    w = sample(wt, u * ws, v * ws)[..., 0]
    e = (w * (0.6 + 0.4 * occ) + 0.3 * (1 - L.edge) - 0.15) if KNIFE else (w * (0.55 + 0.45 * occ) + 0.25 * (1 - L.cav))
    cover = (mr if KNIFE else np.ones_like(u)).astype(np.float32)
    return np.concatenate([pc, metal[..., None], rough[..., None], e[..., None], cover[..., None], occ[..., None]], 2).astype(np.float32)


def finalize(layers, island, path_paint, path_mrw):
    pc, metal, rough, e, cover, occ = layers[..., :3], layers[..., 3], layers[..., 4], layers[..., 5], layers[..., 6], layers[..., 7]
    painted = island & (cover > 0.5)
    es = np.sort(e[painted][::3]) if painted.any() else np.array([0.0, 1.0], np.float32)
    cdf = np.searchsorted(es, e).astype(np.float32) / max(1, len(es))
    p, k = 1.5, (float(job.get('knife_wear_k', KNIFE_WEAR_K)) if KNIFE else 0.4)
    rank = np.clip((cdf / k) ** (1 / p) + 0.02, 0, 1)            # paint is gone where rank < wear: about k·wear^1.5 of the paint is lost (calibrated
                                                                  # against the light / heavy econ icons: guns 0.4, ~29% at 0.8; knives KNIFE_WEAR_K)
    aof = (0.4 + 0.6 * occ) if KNIFE else (0.35 + 0.65 * occ)
    alb = pc * aof[..., None]
    if KNIFE:   # the handle: matte near-black "paint", never worn, never metal (black-handle rule; Lore inlays are masked out)
        k = np.clip(cover, 0, 1); hb = (1 - k)
        alb = alb * k[..., None] + (0.045 * aof)[..., None] * hb[..., None]
        metal = metal * k; rough = rough * k + 0.7 * hb; rank = rank * k + hb; cov = island.astype(np.float32)
    else: cov = np.clip(cover, 0, 1) * island
    mrw = np.stack([metal, rough, rank, cov], -1)
    a1, _ = dilate(np.concatenate([lin2srgb(alb), mrw[..., :3]], 2), island, 8)
    srgb, mrw3 = a1[..., :3], a1[..., 3:6]
    mrw = np.concatenate([mrw3, cov[..., None]], 2)
    save(path_paint + '.tmp.jpg', srgb, quality=90); os.replace(path_paint + '.tmp.jpg', path_paint)
    save(path_mrw + '.tmp.png', mrw); os.replace(path_mrw + '.tmp.png', path_mrw)
    # three representative colours of the paint (for the built-in fallback pick) and its coverage
    sel = painted & (cover > 0.5)
    if KNIFE: sel = sel & (layers[..., 6] > 0.5)
    px = pc[sel][::max(1, int(sel.sum() // 20000))] if sel.any() else np.zeros((3, 3), np.float32)
    lum = px @ np.array([0.2126, 0.7152, 0.0722], np.float32); o = np.argsort(lum); parts = np.array_split(px[o], 3)
    pal = ['#' + ''.join(f'{int(round(float(c) * 255)):02x}' for c in lin2srgb(q.mean(0) if len(q) else np.zeros(3))) for q in parts]
    sat = px.max(1) - px.min(1) if len(px) else np.zeros(1); top = px[sat >= np.quantile(sat, 0.95)] if len(px) > 20 else px   # the most colourful 5%: stripes, accents
    acc = '#' + ''.join(f'{int(round(float(c) * 255)):02x}' for c in lin2srgb(top.mean(0) if len(top) else np.zeros(3)))
    return dict(pal=pal, accent=acc, cover=round(float(cov[island].mean()) if island.any() else 0.0, 4), metal=round(float(metal[sel].mean()) if sel.any() else 0.0, 3), rough=round(float(rough[sel].mean()) if sel.any() else 0.0, 3))


lut = Lookup(job['lut'], RES) if job.get('lut') else None
hd = Layout(job['composite'], RES, island=lut.hd_cover if lut is not None else None)
leg = None
if KNIFE and job.get('base'):   # CS2's own knife base maps (replacing the pale CS:GO texture + constant gloss of the first-person knives)
    # (CS2's own knife material uses the flat default normal map, so there is no base normal map to bake)
    b = job['base']; bdir = os.path.join(job['root'], 'base'); os.makedirs(bdir, exist_ok=True)
    pc_, po_ = os.path.join(bdir, f"{job['model']}_color.jpg"), os.path.join(bdir, f"{job['model']}_orm.jpg")
    if job.get('force') or job.get('base_force') or not (os.path.exists(pc_) and os.path.exists(po_)):
        col = rgb(tex(b['color'], RES)); mt = tex(b['metal'], RES)   # metal texture: R roughness, G metalness
        orm = np.stack([hd.occ, chan(mt, 0, 0.5), chan(mt, 1, 0.0)], -1)
        c2, _ = dilate(np.concatenate([col, orm], 2), hd.island, 8)
        save(pc_ + '.tmp.jpg', c2[..., :3]); os.replace(pc_ + '.tmp.jpg', pc_); save(po_ + '.tmp.jpg', c2[..., 3:6]); os.replace(po_ + '.tmp.jpg', po_)
        open(os.path.join(bdir, f".{job['model']}.v"), 'w').write(BAKE_V)
    print('RESULT ' + json.dumps(dict(base=job['model'])), flush=True)
for f in job['finishes']:
    t0 = time.time(); kit = f['kit']; sfx = job.get('suffix', ''); pp = os.path.join(OUT, f'{kit}_paint{sfx}.jpg'); pm = os.path.join(OUT, f'{kit}_mrw{sfx}.png')
    side = os.path.join(job['cache'], f"{job['model']}_{kit}_{RES}.json")   # (results of earlier runs: a re-run skips finished finishes)
    if not job.get('force') and os.path.exists(pp) and os.path.exists(pm) and os.path.exists(side):
        try: old = json.load(open(side))
        except Exception: old = {}
        if old.get('v') == BAKE_V: print('RESULT ' + json.dumps(old), flush=True); continue
    try:
        if f.get('legacy') and not KNIFE:
            if lut is None or not job.get('legacy_composite'): raise RuntimeError('legacy finish but no legacy lookup / composite inputs')
            if leg is None: leg = Layout(job['legacy_composite'], min(2048, RES * 2), island=None)
            layers = composite(leg, f)
            if leg.res != lut.legacy_cover.shape[0]:
                cov = resize(lut.legacy_cover[..., None].astype(np.float32), leg.res)[..., 0] > 0.5
            else: cov = lut.legacy_cover
            layers, _ = dilate(layers, cov, 6)
            if job.get('dump_legacy'):   # (check renders: the finish in CS2's legacy layout, before the move)
                save(os.path.join(job['dump_legacy'], f'{kit}_legacy_paint.png'), lin2srgb(layers[..., :3] * (0.35 + 0.65 * layers[..., 7:8])))
            layers = lut.apply(layers)
            if job.get('legacy_far', 'paint') != 'paint': layers[..., 6] *= lut.valid
            # (default 'paint': HD texels whose nearest legacy point is farther than 2% of the gun — parts CS2 remodelled,
            #  e.g. the Five-SeveN grip — take the paint of that nearest same-facing point instead of showing bare base)
        else: layers = composite(hd, f)
        if lut is not None and not KNIFE: layers[..., 6] *= lut.keep(bool(f.get('legacy')), int(f['F']))   # (scope lenses, the SSG 08's scope: CS2's base)
        r = finalize(layers, hd.island, pp, pm); r.update(kit=kit, ok=True, s=round(time.time() - t0, 2), v=BAKE_V)
    except Exception as ex:
        r = dict(kit=kit, ok=False, error=f'{type(ex).__name__}: {ex}')
    if r.get('ok'): os.makedirs(job['cache'], exist_ok=True); open(side, 'w').write(json.dumps(r))
    print('RESULT ' + json.dumps(r), flush=True)
    for k in [k for k in _cache if k[1] is None and k[0] != job['wear_tex']]: _cache.pop(k)   # patterns: per finish
