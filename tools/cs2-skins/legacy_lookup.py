# Blender (run: blender -b --factory-startup --python-exit-code 1 -P legacy_lookup.py -- <weapon.glb> <out.npz> [res])
# CS2 composites "legacy" finishes (items_game use_legacy_model 1: Redline, Asiimov, Printstream, DDPAT…) in the UV layout of
# the weapon's old body_legacy mesh, which does not fit the body_hd mesh the game draws. This bakes, once per gun, a lookup
# image in body_hd UV0: for each texel, the 3D point it covers on body_hd, then the nearest point on body_legacy facing the
# same way (or, when that point is hidden under another legacy surface, the surface seen from just outside), and its legacy UV0. A legacy finish is then resampled into HD UV0 in numpy (bake.py), so every finish
# works on the one HD mesh. Output npz: lut (res,res,3) float32 = legacy u, legacy v (glTF orientation: v down, like the
# images), valid; legacy_cover (res,res) = texels inside body_legacy's UV islands (to pad the legacy bake before sampling);
# stats. No Valve data is stored in this file.
import bpy, sys, os, numpy as np, mathutils
from mathutils.bvhtree import BVHTree
a = sys.argv[sys.argv.index('--') + 1:]; GLB, OUT = a[0], a[1]; RES = int(a[2]) if len(a) > 2 else 1024
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=GLB)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
def pick(suffix): return [o for o in meshes if (o.data.name or '').endswith(suffix) or o.name.endswith(suffix)]
hd, leg = pick('body_hd'), pick('body_legacy')
if not hd or not leg: raise SystemExit('need body_hd and body_legacy meshes in ' + GLB + ': ' + str([o.data.name for o in meshes]))


def tris(objs):
    """-> P (n,3,3) world positions, N (n,3,3) normals, UV (n,3,2) in image orientation (v down)"""
    P, N, U = [], [], []
    for o in objs:
        me = o.data; me.calc_loop_triangles(); M = o.matrix_world; R = M.to_3x3()
        uvl = me.uv_layers[0].data if me.uv_layers else None
        nl = len(me.loop_triangles)
        vi = np.zeros(nl * 3, np.int64); li = np.zeros(nl * 3, np.int64)
        me.loop_triangles.foreach_get('vertices', vi); me.loop_triangles.foreach_get('loops', li)
        co = np.zeros(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        Mn = np.array(M, np.float32); co = co @ Mn[:3, :3].T + Mn[:3, 3]
        ln = np.zeros(len(me.loops) * 3, np.float32); me.loops.foreach_get('normal', ln); ln = ln.reshape(-1, 3) @ np.array(R, np.float32).T
        uv = np.zeros(len(me.loops) * 2, np.float32); uvl.foreach_get('uv', uv); uv = uv.reshape(-1, 2); uv[:, 1] = 1 - uv[:, 1]
        P.append(co[vi].reshape(-1, 3, 3)); N.append(ln[li].reshape(-1, 3, 3)); U.append(uv[li].reshape(-1, 3, 2))
    return np.concatenate(P), np.concatenate(N), np.concatenate(U)


def raster(UV, res):
    """texel centres inside each UV triangle -> (texel y, x, triangle index, barycentrics (k,3))"""
    ys, xs, ts, bs = [], [], [], []
    px = UV * res - 0.5
    for t in range(len(UV)):
        (x0, y0), (x1, y1), (x2, y2) = px[t]
        d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(d) < 1e-12: continue
        lx, hx = int(np.floor(min(x0, x1, x2))), int(np.ceil(max(x0, x1, x2))); ly, hy = int(np.floor(min(y0, y1, y2))), int(np.ceil(max(y0, y1, y2)))
        gy, gx = np.mgrid[ly:hy + 1, lx:hx + 1]; gx = gx.ravel().astype(np.float32); gy = gy.ravel().astype(np.float32)
        b0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / d; b1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / d; b2 = 1 - b0 - b1
        m = (b0 >= -1e-4) & (b1 >= -1e-4) & (b2 >= -1e-4)
        if not m.any(): continue
        ys.append(gy[m].astype(np.int64)); xs.append(gx[m].astype(np.int64)); ts.append(np.full(m.sum(), t, np.int64)); bs.append(np.stack([b0[m], b1[m], b2[m]], 1))
    ys, xs, ts, bs = np.concatenate(ys), np.concatenate(xs), np.concatenate(ts), np.concatenate(bs)
    ok = (xs >= 0) & (xs < res) & (ys >= 0) & (ys < res)   # (wrapped UVs: MAC-10 / SSG 08 have a few outside 0..1)
    return ys[ok] % res, xs[ok] % res, ts[ok], bs[ok]


Ph, Nh, Uh = tris(hd); Pl, Nl, Ul = tris(leg)
ext = np.concatenate([Ph.reshape(-1, 3), Pl.reshape(-1, 3)]); diag = float(np.linalg.norm(ext.max(0) - ext.min(0)))
flat = Pl.reshape(-1, 3); bvh = BVHTree.FromPolygons([tuple(v) for v in flat], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(Pl))], all_triangles=True)
flat_h = Ph.reshape(-1, 3); bvh_hd = BVHTree.FromPolygons([tuple(v) for v in flat_h], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(Ph))], all_triangles=True)
fn = np.cross(Pl[:, 1] - Pl[:, 0], Pl[:, 2] - Pl[:, 0]); fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
ys, xs, ts, bs = raster(Uh, RES)
pts = np.einsum('kj,kjc->kc', bs, Ph[ts]); nrm = np.einsum('kj,kjc->kc', bs, Nh[ts]); nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
n = len(pts); hit_t = np.full(n, -1, np.int64); hit_p = np.zeros((n, 3), np.float32); dist = np.full(n, np.inf, np.float32)
off = diag * 0.004; TOL = diag * 0.02
for i in range(n):
    p = mathutils.Vector(pts[i]); nv = mathutils.Vector(nrm[i]); best = None
    for k, q in enumerate((p, p + nv * off, p + nv * (off * 3))):   # nearest point; if it faces away (the other side of a thin part), look from just outside
        loc, _n, idx, d = bvh.find_nearest(q)
        if idx is None: continue
        facing = float(fn[idx] @ nrm[i]) > 0.2; dd = (loc - p).length
        if facing: best = (idx, loc, dd); break
        if best is None: best = (idx, loc, dd)
    # a nearest point hidden under a parallel legacy layer (an inner shell, e.g. the Five-SeveN grip insert, which CS2's
    # artwork leaves grey) is not what a viewer sees: take the layer above it (rays in creases hit angled faces: ignored)
    if best is not None and bvh_hd.ray_cast(p + nv * (diag * 1e-4), nv, TOL)[2] is None:   # (only where the HD point itself is uncovered: Nova's meshes coincide, layers and all)
        fnv = mathutils.Vector(fn[best[0]]); cl, _n, cov_i, _d = bvh.ray_cast(best[1] + fnv * (diag * 1e-4), fnv, TOL)
        if cov_i is not None and cov_i != best[0] and float(fn[cov_i] @ fn[best[0]]) > 0.9 and float(fn[cov_i] @ nrm[i]) > 0.2:
            best = (cov_i, cl, (cl - p).length)
    if best is None: continue
    hit_t[i], hit_p[i], dist[i] = best[0], best[1], best[2]
valid = (hit_t >= 0) & (dist < TOL)
# barycentrics of the hit point in its legacy triangle -> legacy UV
T = Pl[np.maximum(hit_t, 0)]; v0, v1, v2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0], hit_p - T[:, 0]
d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1); d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1); den = np.maximum(d00 * d11 - d01 * d01, 1e-20)
bv = (d11 * d20 - d01 * d21) / den; bw = (d00 * d21 - d01 * d20) / den; bu = 1 - bv - bw
UVl = Ul[np.maximum(hit_t, 0)]; luv = UVl[:, 0] * bu[:, None] + UVl[:, 1] * bv[:, None] + UVl[:, 2] * bw[:, None]
lut = np.zeros((RES, RES, 3), np.float32); lut[ys, xs, 0] = luv[:, 0]; lut[ys, xs, 1] = luv[:, 1]; lut[ys, xs, 2] = valid.astype(np.float32)
ly, lx, _lt, _lb = raster(Ul, RES); cover = np.zeros((RES, RES), np.uint8); cover[ly, lx] = 1
hdcover = np.zeros((RES, RES), np.uint8); hdcover[ys, xs] = 1
st = dict(texels=int(n), valid=float(valid.mean()), far=float((dist >= TOL).mean()), median_dist=float(np.median(dist[valid]) / diag) if valid.any() else 1.0, diag=diag)
np.savez_compressed(OUT, lut=lut, legacy_cover=cover, hd_cover=hdcover, stats=np.array([st['valid'], st['far'], st['median_dist'], diag], np.float32))
print('LUT', os.path.basename(GLB), st)
