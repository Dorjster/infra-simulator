# The gun's mesh in its armature's frame (x forward, y down, z left; inches), at its idle pose: vertices, normals, the
# bone each vertex follows. Usage: blender -b -Y scene.blend -P export_mesh.py -- out.npz
import bpy, sys, numpy as np
out = sys.argv[sys.argv.index('--') + 1]
gun = bpy.data.objects['Gun']; gun.animation_data.action = bpy.data.actions.get('firstperson_idle'); bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
mesh = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == gun][0]
dg = bpy.context.evaluated_depsgraph_get(); me = mesh.evaluated_get(dg).to_mesh(); inv = gun.matrix_world.inverted() @ mesh.matrix_world; R = inv.to_3x3()
V = np.array([tuple(inv @ v.co) for v in me.vertices]); N = np.array([tuple((R @ v.normal).normalized()) for v in me.vertices])
names = {g.index: g.name for g in mesh.vertex_groups}; B = []
for v in mesh.data.vertices: B.append(names[max(v.groups, key=lambda g: g.weight).group] if v.groups else '')
F = np.array([p.vertices[:] for p in me.polygons if len(p.vertices) == 3])
# A low-poly copy for outlines (Decimate ~1000 triangles), in the same frame.
lo = mesh.copy(); lo.data = mesh.data.copy(); bpy.context.scene.collection.objects.link(lo); md = lo.modifiers.new('dec', 'DECIMATE'); md.ratio = 1000 / max(1, len(F)); md.use_collapse_triangulate = True
for mm in list(lo.modifiers):
    if mm.type == 'ARMATURE': lo.modifiers.remove(mm)
dg = bpy.context.evaluated_depsgraph_get(); ml = lo.evaluated_get(dg).to_mesh(); il = gun.matrix_world.inverted() @ mesh.matrix_world
# (the armature deformation of the idle pose is not applied to the copy: the idle pose is the rest pose for these guns)
VL = np.array([tuple(il @ v.co) for v in ml.vertices]); FL = np.array([p.vertices[:3] for p in ml.polygons])
np.savez(out, V=V, N=N, B=np.array(B), F=F, VL=VL, FL=FL); print('MESH', V.shape, F.shape, 'low', VL.shape, FL.shape, sorted(set(B)))
