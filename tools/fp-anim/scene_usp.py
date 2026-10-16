# Builds the USP-S first-person scene from the CS2 MultiRig: CS2 arms (Sport Gloves + SAS sleeve), the CS2 USP-S
# (with its part bones and part clips) on a weapon_hand_r bone under hand_r, a camera at the eye with the game's
# view-model field of view (58° vertical, 16:9). Saves it for posing. Usage: blender -b -Y v3.blend -P scene_usp.py -- gun.glb out.blend
import bpy, math, sys
from mathutils import Vector, Matrix
gun_path, out = sys.argv[sys.argv.index('--') + 1:][:2]
rig = bpy.data.objects['Rig']
# Meshes: drivers off, only the glove and the SAS sleeve.
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == rig:
        for p in ('hide_render', 'hide_viewport'): o.driver_remove(p)
        o.hide_render = o.hide_viewport = o.name not in ('Sport Gloves', 'sleeve_ctm_sas')
for o in [o for o in bpy.data.objects if o.parent is None and o.type in ('MESH', 'EMPTY') and o.name.startswith(('Bone', 'BoneShape'))]: o.hide_render = True
if rig.animation_data: rig.animation_data.action = None
for pb in rig.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
rig.pose.bones['hand_ik_target_r']['Finger IK R'] = 0.0; rig.pose.bones['hand_ik_target_l']['Finger IK L'] = 0.0
for pb in rig.pose.bones:
    for c in pb.constraints:
        if c.type == 'IK' and pb.name.startswith('finger_'): c.influence = 0.0
if rig.animation_data:
    for d in list(rig.animation_data.drivers):
        if 'IK' in d.data_path and 'finger' in d.data_path: rig.animation_data.drivers.remove(d)
# weapon_hand_r: under hand_r, at the hand's head, the world axes (set when posing).
bpy.context.view_layer.objects.active = rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones.new('weapon_hand_r'); h = rig.data.edit_bones['hand_r']; eb.head = h.head.copy(); eb.tail = h.head + Vector((0, 0, 2)); eb.parent = h; eb.use_deform = False
eb2 = rig.data.edit_bones.new('support_l'); eb2.head = h.head.copy(); eb2.tail = h.head + Vector((0, 0, 2)); eb2.parent = eb; eb2.use_deform = False   # where the left hand holds the gun
bpy.ops.object.mode_set(mode='OBJECT')
# The gun: imported, in inches (×1/0.0254), its armature parented to weapon_hand_r.
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=gun_path); new = [o for o in bpy.data.objects if o not in before]
gun = [o for o in new if o.type == 'ARMATURE'][0]; gun.name = 'Gun'
for o in new:
    if o.type == 'MESH' and o.parent is None: bpy.data.objects.remove(o)   # (the importer's icosphere bone shape)
gun.scale = (1, 1, 1); bpy.context.view_layer.update()
gm = gun.matrix_world.copy(); gun.parent = rig; gun.parent_type = 'BONE'; gun.parent_bone = 'weapon_hand_r'; gun.matrix_world = gm
gun.animation_data_create(); gun.animation_data.action = bpy.data.actions.get('firstperson_idle')
# Camera: the eye, looking −Y, 58° vertical.
cam = bpy.data.objects.new('FPCam', bpy.data.cameras.new('FPCam')); bpy.context.scene.collection.objects.link(cam)
cam.location = (0, 1.626, 18.812); cam.rotation_euler = (math.pi / 2, 0, math.pi); cam.data.sensor_fit = 'VERTICAL'; cam.data.angle = math.radians(58); cam.data.clip_start = .5
sc = bpy.context.scene; sc.camera = cam; sc.render.resolution_x, sc.render.resolution_y = 1920, 1080; sc.render.fps = 60
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'; sc.render.film_transparent = True
bpy.ops.wm.save_as_mainfile(filepath=out); print('SAVED', out, 'gun at', tuple(round(v, 2) for v in gun.matrix_world.translation))
