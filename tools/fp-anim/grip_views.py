# Close-up views of the two-handed grip at the idle pose (author.py's rig, frame 1 of 'idle'): from below, left, front,
# behind (camera) — to fit the hands without one sinking into the other. Also reports the closest approach between the
# two gloves' vertices (negative: interpenetration estimate via nearest-vertex distance).
import bpy, sys, json, math
args = sys.argv[sys.argv.index('--') + 1:]
sys.argv = [sys.argv[0], '--', args[0], args[1], args[2], 'none']
exec(open(args[0] + '/author.py').read())
make_clip('idle', spec['anims']['idle']); sc.frame_set(1); update()
gb = bpy.data.objects['Sport Gloves']; dg = bpy.context.evaluated_depsgraph_get(); me = gb.evaluated_get(dg).to_mesh()
# which hand each vertex belongs to: by its strongest vertex group's side
names = {g.index: g.name for g in gb.vertex_groups}; Lp, Rp = [], []
for v in gb.data.vertices:
    if not v.groups: continue
    gname = names[max(v.groups, key=lambda g: g.weight).group]; p = gb.matrix_world @ me.vertices[v.index].co
    (Lp if gname.endswith('_l') or gname.endswith('_L') else Rp).append(p)
from mathutils import kdtree
kd = kdtree.KDTree(len(Rp))
for i, p in enumerate(Rp): kd.insert(p, i)
kd.balance(); d = sorted(kd.find(p)[2] for p in Lp)
print('GAP min %.3f p1 %.3f p5 %.3f  (n L %d R %d) close<0.15: %d' % (d[0], d[len(d) // 100], d[len(d) // 20], len(Lp), len(Rp), sum(1 for x in d if x < .15)))
G = GunCtl.matrix_world; c0 = G @ L((3.0, 0.0, 0.3)); up = G.to_3x3() @ L((0, 1, 0))
for nm, off, u in (('below', (0, -14, 0), (1, 0, 0)), ('left', (0, 0, 14), (0, 1, 0)), ('front', (14, 0, 0), (0, 1, 0)), ('right', (0, 0, -14), (0, 1, 0))):
    side_cam('V_' + nm, c0 + G.to_3x3() @ L(off), c0, 7.5, G.to_3x3() @ L(u)); render(args[2] + '_' + nm + '.png', 'V_' + nm, (600, 600))
render(args[2] + '_cam.png', 'FPCam', (960, 540))
