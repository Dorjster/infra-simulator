# Posing helpers for the CS2 MultiRig: hands from anatomical directions (IK targets), fingers curled (FK), the gun on
# weapon_hand_r, the left hand on support_l. All in Blender world space (inches; camera looks −Y, up +Z, right −X).
import bpy, math
from mathutils import Vector, Matrix, Quaternion
rig = bpy.data.objects['Rig']; gun = bpy.data.objects.get('Gun'); P = rig.pose.bones; B = rig.data.bones
EYE = Vector((0, 1.626, 18.812))
def cam_to_world(v):   # camera space (x right, y up, z back) → world
    return EYE + Vector((-v[0], v[2], v[1]))
def W(name): return rig.matrix_world @ B[name].matrix_local   # rest, world
def frame(d, a):   # orthonormal (d, a', n) with n = a × d (palm normal), a' = d × n... rows as columns
    d = Vector(d).normalized(); a = Vector(a); a = (a - d * a.dot(d)).normalized(); n = a.cross(d).normalized(); return Matrix((d, a, n)).transposed()
def rest_frame(sd):   # the hand's anatomical frame at rest: d wrist→middle knuckle, a pinky→index knuckles
    w = W('hand_' + sd).translation; m = W('finger_middle_0_' + sd).translation; i = W('finger_index_0_' + sd).translation; p = W('finger_pinky_0_' + sd).translation
    return frame(m - w, i - p)
def set_hand(sd, wrist, d, a):   # the hand's world pose: wrist position, knuckle direction, index side
    R = frame(d, a) @ rest_frame(sd).transposed()   # rest anatomical frame → wanted
    rest = W('hand_ik_target_' + sd); M = Matrix.Translation(Vector(wrist)) @ (R @ rest.to_3x3()).to_4x4()
    P['hand_ik_target_' + sd].matrix = rig.matrix_world.inverted() @ M
def set_elbow(sd, pos): P['elbow_target_' + sd].matrix = rig.matrix_world.inverted() @ Matrix.Translation(Vector(pos)) @ W('elbow_target_' + sd).to_3x3().to_4x4()
FING = ['thumb', 'index', 'middle', 'ring', 'pinky']
def curl(sd, f, angles, spread=0.0, twist=0.0):   # each segment turned about the hand's across axis (in its own rest frame)
    wa = (W('finger_index_0_' + sd).translation - W('finger_pinky_0_' + sd).translation).normalized()
    for k, ang in enumerate(angles):
        bn = f'finger_{f}_{k}_{sd}'; R = W(bn).to_3x3(); ax = (R.inverted() @ wa).normalized()
        if sd == 'l': ax = -ax
        q = Quaternion(ax, ang)
        if k == 0 and (spread or twist):
            nrm = (R.inverted() @ (wa.cross(Vector(W(bn).col[1][:3])))).normalized(); q = Quaternion(nrm, spread) @ q
            if twist: q = q @ Quaternion(Vector((0, 1, 0)), twist)
        P[bn].rotation_mode = 'QUATERNION'; P[bn].rotation_quaternion = q
def set_gun_from_hand(sd='r'):   # weapon_hand_r stays as it is: the gun follows the hand
    pass
def gun_offset(local):   # the gun relative to the right hand (a 4×4 in hand-bone space): weapon_hand_r's pose
    P['weapon_hand_r'].matrix_basis = local
def update(): bpy.context.view_layer.update()
def gun_world(): update(); return gun.matrix_world.copy()
def place_gun_world(M):   # set weapon_hand_r so the gun lands at world M (hand as posed)
    update(); hand = rig.matrix_world @ P['weapon_hand_r'].matrix; cur = gun.matrix_world
    delta = M @ cur.inverted()   # world-space correction
    P['weapon_hand_r'].matrix = rig.matrix_world.inverted() @ delta @ hand; update()
def render(path, cam='FPCam', res=(960, 540)):
    sc = bpy.context.scene; sc.camera = bpy.data.objects[cam]; sc.render.resolution_x, sc.render.resolution_y = res; sc.render.filepath = path; bpy.ops.render.render(write_still=True)
def side_cam(name, pos, look, ortho=8.0, up=(0, 0, 1)):
    c = bpy.data.objects.get(name) or bpy.data.objects.new(name, bpy.data.cameras.new(name))
    if c.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(c)
    z = (Vector(pos) - Vector(look)).normalized(); x = Vector(up).cross(z).normalized(); y = z.cross(x)
    c.matrix_world = Matrix.Translation(Vector(pos)) @ Matrix((x, y, z)).transposed().to_4x4(); c.data.type = 'ORTHO'; c.data.ortho_scale = ortho; return c

def fcurves(act):   # every F-curve of an action (Blender 5: layered actions → channel bags)
    if hasattr(act, 'fcurves'):
        yield from act.fcurves; return
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags: yield from cb.fcurves
