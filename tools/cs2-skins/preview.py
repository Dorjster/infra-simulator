# Check renders only (not part of the install): composes an installed bake the way the game's mode-3 shader does
# (PLAN §5.3) into a plain albedo + ORM pair that render_check.py can draw, at a chosen wear float.
#   base steel: base/<knife>_color.jpg + _orm.jpg for star knives, or a model's CS2 colour texture read from the VPK
#   paint, mrw: the finish's <kit>_paint.jpg and <kit>_mrw.png
# usage (Blender's python, -I): preview.py <spec.json>
# spec: {vpk?, jobs:[{paint, mrw, wear, out_albedo, out_orm, base_color?|base_vpk_color?, base_orm?|base_vpk_metal?, res?}]}
# Also decodes econ icons for the sheets: {vpk, icons:[{path, out}]}. No Valve data lives in this file.
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from imglib import load, resize, save, rgb, chan, srgb2lin, lin2srgb, smooth

spec = json.load(open(sys.argv[1])); V = None
if spec.get('vpk'):
    from vpk import VPK
    import vtex
    V = VPK(spec['vpk'])
_c = {}


def vtex_img(p, res):
    k = (p, res)
    if k not in _c: _c[k] = resize(vtex.decode(V.read(vtex.compiled_name(p))), res)
    return _c[k]


for j in spec.get('jobs', []):
    paint = load(j['paint'])[..., :3]; res = paint.shape[0]; mrw = load(j['mrw'])
    if mrw.shape[0] != res: mrw = resize(mrw, res)
    if j.get('base_color'): bc = srgb2lin(rgb(resize(load(j['base_color']), res)))
    elif j.get('base_vpk_color'): bc = srgb2lin(rgb(vtex_img(j['base_vpk_color'], res)))
    else: bc = np.full((res, res, 3), 0.2, np.float32)
    if j.get('base_orm'): bo = resize(load(j['base_orm']), res)[..., :3]
    elif j.get('base_vpk_metal'):
        m = vtex_img(j['base_vpk_metal'], res); bo = np.stack([np.ones((res, res), np.float32), chan(m, 0, 0.5), chan(m, 1, 0.0)], -1)
    else: bo = np.stack([np.ones((res, res)), np.full((res, res), 0.5), np.full((res, res), 0.3)], -1).astype(np.float32)
    w = float(j.get('wear', 0.0)); cov = mrw[..., 3]; survive = smooth(w - 0.02, w + 0.02, mrw[..., 2]); k = (cov * survive)[..., None]
    alb = bc * (1 - k) + srgb2lin(paint) * k
    rough = bo[..., 1] * (1 - k[..., 0]) + mrw[..., 1] * k[..., 0]; metal = bo[..., 2] * (1 - k[..., 0]) + mrw[..., 0] * k[..., 0]
    save(j['out_albedo'], lin2srgb(alb)); save(j['out_orm'], np.stack([bo[..., 0], rough, metal], -1))
    print('PREVIEW', os.path.basename(j['out_albedo']), flush=True)
for ic in spec.get('icons', []):
    a = vtex.decode(V.read(vtex.compiled_name(ic['path']))); save(ic['out'], a if a.shape[2] == 4 else rgb(a)); print('ICON', os.path.basename(ic['out']), flush=True)
