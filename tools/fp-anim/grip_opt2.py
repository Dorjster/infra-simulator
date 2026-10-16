# Anatomical grip fit at the idle pose (coordinate descent). Right hand: index side along the grip's axis, fingers
# wrapped round the front strap onto the left panel, index on the trigger. Left (support) hand, thumbs forward: palm
# on the left panel, fingers wrapped over the right hand's fingers round the front, thumb forward under the slide.
# Both: no glove vertex inside the gun or the other hand, fingertips and palm touching. Writes the grips into the spec.
# Usage: blender -b -Y scene.blend -P grip_opt2.py -- <fpanim dir> <spec.json> [rounds]
import bpy, sys, json, math, time
args = sys.argv[sys.argv.index('--') + 1:]; SPEC = args[1]; ROUNDS = int(args[2]) if len(args) > 2 else 10
sys.argv = [sys.argv[0], '--', args[0], args[1], '/tmp/none', 'none']
exec(open(args[0] + '/author.py').read())
from mathutils.bvhtree import BVHTree
make_clip('idle', spec['anims']['idle']); sc.frame_set(1); update()
for o in (rig, GunCtl, HandLf): o.animation_data.action = None
gb = bpy.data.objects['Sport Gloves']; gm = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == gun][0]
names = {g.index: g.name for g in gb.vertex_groups}; grp = {}
for v in gb.data.vertices:
    if v.groups: grp[v.index] = names[max(v.groups, key=lambda g: g.weight).group].lower()
sideof = lambda g: 'l' if g.endswith('_l') else 'r'
G0 = GunCtl.matrix_world.copy(); G0i = G0.inverted()
def loc(p): q = G0i @ p; return Vector((q.x, -q.y, q.z))   # world → gun-local (f, u, w)
dg0 = bpy.context.evaluated_depsgraph_get(); me = gm.evaluated_get(dg0).to_mesh(); GP = [gm.matrix_world @ v.co for v in me.vertices]
GB = BVHTree.FromPolygons(GP, [p.vertices[:] for p in me.polygons])
# The grip's axis: centres of slices through the grip (below the trigger guard).
GL = [loc(p) for p in GP]; cs = []
for u0 in [-1.4 + .3 * k for k in range(8)]:
    sl = [q for q in GL if u0 <= q.y < u0 + .3 and q.x < 4.2]
    if sl: cs.append(Vector((sum(q.x for q in sl) / len(sl), u0 + .15, sum(q.z for q in sl) / len(sl))))
AX = (cs[-1] - cs[0]).normalized(); MID = sum(cs, Vector()) / len(cs)
FRONT = max(q.x for q in GL if -1.0 < q.y < 0.8); trig = gun.matrix_world @ gun.pose.bones[spec.get('trigger_bone', 'v_weapon_trigger')].head
TRIG = loc(trig) + Vector((0.25, -0.35, 0))
print('GRIP axis', tuple(round(v, 3) for v in AX), 'mid', tuple(round(v, 2) for v in MID), 'front', round(FRONT, 2), 'trigger', tuple(round(v, 2) for v in TRIG))
def glove():
    dg = bpy.context.evaluated_depsgraph_get(); m = gb.evaluated_get(dg).to_mesh(); M = gb.matrix_world; return [M @ v.co for v in m.vertices], [p.vertices[:] for p in m.polygons]
def near(b, p):
    l, nrm, i, d = b.find_nearest(p); return (l is not None and (p - l).dot(nrm) < 0), (d if l is not None else 9)
FWD = Vector((1, 0, 0)); FWD = (FWD - AX * FWD.dot(AX)).normalized(); SIDE = AX.cross(FWD)   # SIDE: ⟂ both (left or right, sign checked below)
if SIDE.z < 0: SIDE = -SIDE   # +w: left
FING4 = ('index', 'middle', 'ring', 'pinky')
def hand_dirs(yaw, tilt):   # d: forward turned toward the hand's own side by yaw (+: left); a: the grip axis tipped forward/back by tilt about the side axis
    d = (FWD * math.cos(yaw) + SIDE * math.sin(yaw)).normalized(); a = (Matrix.Rotation(tilt, 3, d.cross(AX).normalized() if d.cross(AX).length > 1e-6 else SIDE) @ AX)
    a = (a - d * a.dot(d)).normalized(); return d, a
def apply(sd, x):
    f, u, w, yaw, tilt, ci, co, ct = x; d, a = hand_dirs(yaw, tilt)
    tgt = bpy.data.objects['HandR_tgt' if sd == 'r' else 'HandL_grip']; tgt.matrix_world = hand_matrix(sd, gl([f, u, w]), gdir(list(d)), gdir(list(a)))
    curl(sd, 'index', [ci * 1.0, ci * 1.1, ci * .7])
    for fn in FING4[1:]: curl(sd, fn, [co * 1.0, co * 1.1, co * .7])
    curl(sd, 'thumb', [ct * .3, ct * .4, ct * .3])
    return {'mcp': [round(f, 3), round(u, 3), round(w, 3)], 'd': [round(v, 4) for v in d], 'a': [round(v, 4) for v in a]}
def cost(sd, x, x0):
    apply(sd, x); update(); V, F = glove()
    other = BVHTree.FromPolygons(V, [f for f in F if all(sideof(grp.get(i, '_r')) != sd for i in f)])
    pen = 0; tips = {}; palm = []
    for i, p in enumerate(V):
        g = grp.get(i)
        if not g or sideof(g) != sd: continue
        a, dg = near(GB, p); pen += a; do = 9
        if sd == 'l': b, do = near(other, p); pen += b
        dd = min(dg, do)
        if g.startswith('finger_') and '_2_' in g: tips.setdefault(g.split('_')[1], []).append((dd, loc(p)))
        if g.startswith('hand_') or g.startswith('meta_'): palm.append(dd)
    def tip(fn): t = sorted(tips.get(fn, [(9, Vector())]), key=lambda z: z[0]); k = max(1, len(t) // 3); return sum(z[0] for z in t[:k]) / k, sum((z[1] for z in t[:k]), Vector()) / k
    palm.sort(); pal = sum(palm[:max(1, len(palm) // 3)]) / max(1, len(palm) // 3)
    c = pen * 2 + pal * 25 + math.dist(x[:3], x0[:3]) * 1.5
    for fn in ('middle', 'ring', 'pinky'):
        d_, q = tip(fn); c += d_ * 30
        c += (max(0, .35 - q.z) * 25 if sd == 'r' else max(0, q.z + .2) * 45 + max(0, FRONT + .7 - q.x) * 20)   # wrapped: right fingertips on the left panel; left fingertips round to the right
    di, qi = tip('index')
    if sd == 'r': c += (qi - TRIG).length * 15
    else: c += di * 30 + max(0, q.z - .1) * 10
    dt, qt = tip('thumb')
    if sd == 'l': c += max(0, FRONT + .8 - qt.x) * 12 + dt * 15   # thumb forward along the frame
    else: c += dt * 10
    return c, (pen, round(pal, 2))
def optimize(sd, x0, steps, rounds):
    x = list(x0); best, info = cost(sd, x, x0); print(sd, 'START', round(best, 1), info); st = list(steps)
    for r in range(rounds):
        improved = False
        for k in range(len(x)):
            for sgn in (1, -1):
                y = list(x); y[k] += sgn * st[k]; c, inf = cost(sd, y, x0)
                if c < best: best, info, x, improved = c, inf, y, True; break
        if not improved: st = [s * .5 for s in st]
    print(sd, 'END', round(best, 1), info, [round(v, 3) for v in x]); return x
t0 = time.time(); R = math.radians
steps = [.3, .3, .3, R(10), R(10), .15, .15, .3]
xr = optimize('r', [FRONT + .3, MID.y, MID.z - .6, R(-12), 0, .8, 1.4, 1.0], steps, ROUNDS); hr = apply('r', xr); update()
starts = [[FRONT + df, MID.y + du, MID.z + 1.4, R(yw), R(tl), 1.0, 1.0, .2] for df in (1.0, 1.6) for du in (-.6, 0) for yw in (-20, 0) for tl in (-30, -10)]
cands = []
for st0 in starts: cands.append((cost('l', st0, st0)[0], st0))
cands.sort(key=lambda z: z[0]); print('l starts', [round(c, 1) for c, _ in cands[:4]])
bestx = None; bestc = 1e9
for c0, st0 in cands[:3]:
    x = optimize('l', st0, steps, ROUNDS); c = cost('l', x, st0)[0]
    if c < bestc: bestc, bestx = c, x
xl = bestx; hl = apply('l', xl)
spec['grip_r'] = hr; spec['holds_l']['grip'] = hl
C = lambda x: {'index': [x[5], x[5] * 1.1, x[5] * .7], **{f: [x[6], x[6] * 1.1, x[6] * .7] for f in FING4[1:]}, 'thumb': [x[7] * .3, x[7] * .4, x[7] * .3]}
spec['idle']['curl_r'] = C(xr); spec['idle']['curl_l'] = C(xl); spec.pop('only', None); json.dump(spec, open(SPEC, 'w'), indent=1); print('TIME %.0fs' % (time.time() - t0))
