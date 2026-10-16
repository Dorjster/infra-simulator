# Karambit first-person scene: the CS2 MultiRig arms (sport gloves, sleeves) and CS:GO's karambit knife (cut from
# user-assets/fp/karambit.glb), on its own one-bone armature 'Gun' (scene space = the CS:GO file's rest space). Writes
# the hand's grip on the knife (the CS:GO hand's knuckle frame in knife space) and knife landmarks to a JSON.
# Usage: blender -b -Y v3.blend -P scene_kar.py -- karambit.glb out.blend out.json
import bpy, math, sys, json
from mathutils import Vector, Matrix
kar, out, outj = sys.argv[sys.argv.index('--') + 1:][:3]
rig = bpy.data.objects['Rig']
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == rig:
        for p in ('hide_render', 'hide_viewport'): o.driver_remove(p)
        o.hide_render = o.hide_viewport = o.name not in ('Sport Gloves', 'sleeve_ctm_sas', 'sleeve_tm_heavy')
for o in bpy.data.objects:
    if o.parent is None and o.type in ('MESH', 'EMPTY') and o.name.startswith(('Bone', 'BoneShape')): o.hide_render = True
if rig.animation_data: rig.animation_data.action = None
for pb in rig.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
for pb in rig.pose.bones:
    for c in pb.constraints:
        if c.type == 'IK' and pb.name.startswith('finger_'): c.influence = 0.0
if rig.animation_data:
    for d in list(rig.animation_data.drivers):
        if 'finger' in d.data_path: rig.animation_data.drivers.remove(d)
# The CS:GO view model: the knife's vertices (skinned mostly to v_weaponknife), and the hand's frame.
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=kar); new = [o for o in bpy.data.objects if o not in before]
sk = [o for o in new if o.type == 'ARMATURE'][0]; km = [o for o in new if o.type == 'MESH' and 'knife' in o.name.lower()][0]
gi = {g.name: g.index for g in km.vertex_groups}; KN = gi.get('v_weaponknife')
keep = [v.index for v in km.data.vertices if v.groups and max(v.groups, key=lambda g: g.weight).group == KN]
bpy.context.view_layer.update(); W = km.matrix_world
B = lambda n: sk.matrix_world @ sk.pose.bones['v_weapon' + n].head   # (posed: the file's node transforms, where the knife and hands agree)
wrist, idx, mid, pnk = B('Bip01_R_Hand'), B('Bip01_R_Finger1'), B('Bip01_R_Finger2'), B('Bip01_R_Finger4')
# A new mesh: the knife only, in that rest space.
import bmesh
dg = bpy.context.evaluated_depsgraph_get(); ev = km.evaluated_get(dg).to_mesh()   # (skinned at rest: where the game draws it)
bm = bmesh.new(); bm.from_mesh(km.data); bm.verts.ensure_lookup_table(); ks = set(keep)
for v in bm.verts: v.co = W @ ev.vertices[v.index].co
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in ks], context='VERTS')
HS = (B('Bip01_R_Finger2') - B('Bip01_R_Hand')).length; K = 3.79 / HS   # (to the CS2 hand's size: wrist → middle knuckle)
for v in bm.verts: v.co = v.co * K
wrist, idx, mid, pnk = wrist * K, idx * K, mid * K, pnk * K
me = bpy.data.meshes.new('karambit'); bm.to_mesh(me); bm.free(); print('SCALE', HS, K)
pts = [v.co.copy() for v in me.vertices]
ring0 = sorted(pts, key=lambda p: (p - idx).length)[:400]; RC0 = sum(ring0, Vector()) / len(ring0)   # the ring's centre → the knife's origin (its turns pivot there)
for v in me.vertices: v.co -= RC0
wrist, idx, mid, pnk = wrist - RC0, idx - RC0, mid - RC0, pnk - RC0
pts = [v.co.copy() for v in me.vertices]
for o in new: bpy.data.objects.remove(o, do_unlink=True)
# The ring: the knife's vertices nearest the index finger's first joint; the tip: the farthest from it.
f1 = idx; ring = sorted(pts, key=lambda p: (p - f1).length)[:400]; RC = sum(ring, Vector()) / len(ring)
TIP = max(pts, key=lambda p: (p - RC).length)
# Fade: purple at the ring → pink → gold at the tip, by distance from the ring.
L = (TIP - RC).length; col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); stops = [(0, (.32, .16, .62)), (.45, (.9, .32, .62)), (.75, (.98, .6, .7)), (1, (1, .82, .35))]
def srgb2lin(c): return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
for i, v in enumerate(me.vertices):
    f = min(1, (v.co - RC).length / L); a, b = stops[0], stops[-1]
    for k in range(len(stops) - 1):
        if stops[k][0] <= f <= stops[k + 1][0]: a, b = stops[k], stops[k + 1]; break
    w = (f - a[0]) / ((b[0] - a[0]) or 1); c = [srgb2lin(a[1][j] + (b[1][j] - a[1][j]) * w) for j in range(3)]; col.data[i].color = (*c, 1)
mat = bpy.data.materials.new('karambit_fade'); mat.use_nodes = True; nt = mat.node_tree; bs = nt.nodes['Principled BSDF']; ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
nt.links.new(ca.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Metallic'].default_value = .85; bs.inputs['Roughness'].default_value = .25; me.materials.append(mat)
# 'Gun': an armature (one bone) at the scene origin, the knife mesh its child.
ad = bpy.data.armatures.new('Gun'); gun = bpy.data.objects.new('Gun', ad); bpy.context.scene.collection.objects.link(gun)
bpy.context.view_layer.objects.active = gun; bpy.ops.object.mode_set(mode='EDIT'); eb = ad.edit_bones.new('v_weapon_knife'); eb.head = RC; eb.tail = RC + Vector((0, 0, 1)); bpy.ops.object.mode_set(mode='OBJECT')
ko = bpy.data.objects.new('karambit', me); bpy.context.scene.collection.objects.link(ko); ko.parent = gun; ko.parent_type = 'BONE'; ko.parent_bone = 'v_weapon_knife'; bpy.context.view_layer.update(); ko.matrix_world = Matrix.Identity(4)   # (on the ring's bone: it turns with it)
# Camera at the eye, the game's view-model field of view.
cam = bpy.data.objects.new('FPCam', bpy.data.cameras.new('FPCam')); bpy.context.scene.collection.objects.link(cam)
cam.location = (0, 1.626, 18.812); cam.rotation_euler = (math.pi / 2, 0, math.pi); cam.data.sensor_fit = 'VERTICAL'; cam.data.angle = math.radians(58); cam.data.clip_start = .5
sc = bpy.context.scene; sc.camera = cam; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.render.film_transparent = True
bpy.ops.wm.save_as_mainfile(filepath=out)
S = lambda v: [round(v.x, 3), round(-v.y, 3), round(v.z, 3)]   # scene → spec (f, u, w) = (x, −y, z)
j = {'grip_r': {'mcp': S(mid), 'd': S((mid - wrist).normalized()), 'a': S((idx - pnk).normalized())}, 'ring': S(RC), 'tip': S(TIP), 'wrist': S(wrist), 'verts': len(pts)}
json.dump(j, open(outj, 'w'), indent=1); print('KAR', j)
