# Landmarks on the gun mesh in the armature's local frame (x forward, y down, z left; inches): extreme points of regions.
import bpy, json, sys
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]
gun = bpy.data.objects['Gun']; bpy.context.view_layer.update(); mesh = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == gun][0]
dg = bpy.context.evaluated_depsgraph_get(); me = mesh.evaluated_get(dg).to_mesh(); inv = gun.matrix_world.inverted()
pts = [inv @ (mesh.matrix_world @ v.co) for v in me.vertices]
def pick(filt, key):
    c = [p for p in pts if filt(p)]; return max(c, key=key) if c else None
f = lambda p: p.x; u = lambda p: -p.y; w = lambda p: p.z
L = {}
L['muzzle'] = pick(lambda p: True, f)                                    # silencer tip (front-most)
L['muzzle_top'] = pick(lambda p: f(p) > 17.5, u)
L['sil_rear_top'] = pick(lambda p: 9.6 < f(p) < 10.6 and u(p) > 3.5, u)  # silencer base top
L['front_sight'] = pick(lambda p: 7 < f(p) < 9.6, u)
L['rear_sight'] = pick(lambda p: f(p) < 3.2, u)
L['rear_sight_l'] = pick(lambda p: f(p) < 3.2 and u(p) > 4.6, w)
L['rear_sight_r'] = pick(lambda p: f(p) < 3.2 and u(p) > 4.6, lambda p: -w(p))
L['slide_back_top'] = pick(lambda p: u(p) > 3.8, lambda p: -f(p))
L['slide_back_bottom'] = pick(lambda p: 2.7 < u(p) < 3.3, lambda p: -f(p))
L['mag_base_front'] = pick(lambda p: u(p) < -1.5, f)
L['mag_base_back'] = pick(lambda p: u(p) < -1.5, lambda p: -f(p))
L['guard_front'] = pick(lambda p: 1.0 < u(p) < 2.6, f)
L['beaver'] = pick(lambda p: 2.0 < u(p) < 2.7, lambda p: -f(p))
json.dump({k: [round(c, 3) for c in v] for k, v in L.items() if v}, open(out, 'w'), indent=1); print('LANDMARKS', {k: [round(c, 2) for c in v] for k, v in L.items() if v})
