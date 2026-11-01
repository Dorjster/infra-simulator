# Blender: check renders for the contact sheets (not part of the install). Renders the weapon mesh of a .glb (a game
# first-person set or a CS2 export) in its bind pose, side view, orthographic, in a simple studio light, with a baked
# albedo + ORM (G roughness, B metalness) per job. Several jobs in one session.
# blender -b --factory-startup --python-exit-code 1 -P render_check.py -- <glb> <mesh-suffix> <outdir> <width> <flip 0|1> <albedo,orm,name> ...
import bpy, sys, mathutils, math
a = sys.argv[sys.argv.index('--') + 1:]; glb, suffix, outdir, RX, flip = a[0], a[1], a[2], int(a[3]), a[4].startswith('1'); jobs = [j.split(',') for j in a[5:]]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
keep = [o for o in bpy.context.scene.objects if o.type == 'MESH' and ((o.data.name or '').endswith(suffix) or o.name.endswith(suffix))]
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH' and o not in keep: bpy.data.objects.remove(o, do_unlink=True)
for o in keep:
    for m in list(o.modifiers): o.modifiers.remove(m)   # bind pose: no armature deformation
mat = bpy.data.materials.new('finish'); mat.use_nodes = True; nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
ti = nt.nodes.new('ShaderNodeTexImage'); to = nt.nodes.new('ShaderNodeTexImage'); sp = nt.nodes.new('ShaderNodeSeparateColor'); uvn = nt.nodes.new('ShaderNodeUVMap')
for o in keep: uvn.uv_map = o.data.uv_layers[0].name; o.data.materials.clear(); o.data.materials.append(mat)
for t in (ti, to): nt.links.new(uvn.outputs['UV'], t.inputs['Vector'])
nt.links.new(ti.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(to.outputs['Color'], sp.inputs['Color'])
nt.links.new(sp.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], bsdf.inputs['Metallic'])
bpy.context.view_layer.update()
pts = [o.matrix_world @ v.co for o in keep for v in o.data.vertices]   # (rest-pose vertices: bound_box can still hold the posed extent)
mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)]); ctr = (mn + mx) / 2; ext = mx - mn
ax = sorted(range(3), key=lambda i: ext[i]); thin, up_ax, long_ax = ax[0], ax[1], ax[2]
sc = bpy.context.scene; cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(ext[long_ax], ext[up_ax]) * 1.06
d = mathutils.Vector((0, 0, 0)); d[thin] = (-1 if flip else 1) * ext.length * 2; cam.location = ctr + d
upv = mathutils.Vector((0, 0, 0)); upv[up_ax] = -1 if 'r' in a[4] else 1   # flip arg: 0/1 = which side, +'r' = turned 180° in the image
back = (cam.location - ctr).normalized(); xv = upv.cross(back)   # camera: looks across the thin axis, image up = the model's middle axis
cam.rotation_euler = mathutils.Matrix((xv, upv, back)).transposed().to_euler()
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x = RX; sc.render.resolution_y = max(64, int(RX * max(0.3, ext[up_ax] / ext[long_ax]) * 1.12)); sc.render.film_transparent = True
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; wn = w.node_tree; bg = wn.nodes['Background']
tc = wn.nodes.new('ShaderNodeTexCoord'); sx = wn.nodes.new('ShaderNodeSeparateXYZ'); ramp = wn.nodes.new('ShaderNodeValToRGB')
wn.links.new(tc.outputs['Generated'], sx.inputs[0]); wn.links.new(sx.outputs['Z'], ramp.inputs['Fac'])
el = ramp.color_ramp.elements; el[0].position = 0.3; el[0].color = (0.12, 0.12, 0.13, 1); el[1].position = 0.8; el[1].color = (1.6, 1.6, 1.62, 1)
e = el.new(0.5); e.color = (0.7, 0.71, 0.74, 1); e2 = el.new(0.6); e2.color = (3.0, 3.0, 3.0, 1); e3 = el.new(0.66); e3.color = (0.9, 0.9, 0.92, 1)
wn.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.2
for i, (rx, rz, en) in enumerate(((45, 30, 2.5), (70, 210, 1.0))):
    l = bpy.data.objects.new(f'sun{i}', bpy.data.lights.new(f'sun{i}', 'SUN')); l.data.energy = en; l.rotation_euler = (math.radians(rx), 0, math.radians(rz)); sc.collection.objects.link(l)
try: sc.eevee.taa_render_samples = 16
except Exception: pass
sc.view_settings.view_transform = 'Standard'
for alb, orm, name in jobs:
    ti.image = bpy.data.images.load(alb); to.image = bpy.data.images.load(orm); to.image.colorspace_settings.name = 'Non-Color'
    sc.render.filepath = f'{outdir}/{name}.png'; bpy.ops.render.render(write_still=True); print('RENDERED', name)
