# Pictures of the imported gloves (never shipped): Blender, headless, Principled BSDF straight from the baked maps
# (colour × ORM.R ambient occlusion, ORM.G roughness, ORM.B metalness, the +Y normal map, sheen on cloth finishes).
#   studio  both hands of a glove type in its bind pose (the agents' view-model rest pose), a neutral studio light,
#           one picture per finish (the scene is built once, only the pictures change)
#   fit     a first-person set's clip (user-assets/fp/cs2_<gun>.glb) posed at a moment, the glove + its wrist skinned
#           onto the set's arm bones by name, the agent's sleeves from the arms glb (package V), the set's gun, seen
#           from the set's camera: the proof that the glove sits on the game's first-person skeleton
#   blender -b --factory-startup -P tools/cs2-gloves/render.py -- <job.json>
#   job: {mode, glove_glb, items:[{color, normal, orm, cloth, out}], size:[w,h], set_glb?, clip?, t?, arms_glb?, side?}
import bpy, sys, os, json, math, tempfile, mathutils
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glb

job = json.load(open(sys.argv[sys.argv.index('--') + 1])); RW, RH = job.get('size', [640, 480])
C = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float); tmp = tempfile.mkdtemp()


def q2m(q):
    x, y, z, w = q; return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def slerp(q0, q1, f):
    d = float(np.dot(q0, q1))
    if d < 0: q1, d = -q1, -d
    if d > .9995: q = q0 + f * (q1 - q0); return q / np.linalg.norm(q)
    th = math.acos(d); return (math.sin((1 - f) * th) * q0 + math.sin(f * th) * q1) / math.sin(th)


def node_worlds(J, B, clip=None, T=0.0):
    N = J['nodes']; trs = []
    for nd in N:
        if 'matrix' in nd: trs.append(['M', np.array(nd['matrix']).reshape(4, 4).T])
        else: trs.append([np.array(nd.get('translation', [0, 0, 0]), float), np.array(nd.get('rotation', [0, 0, 0, 1]), float), np.array(nd.get('scale', [1, 1, 1]), float)])
    if clip:
        anim = next(x for x in J['animations'] if x['name'] == clip)
        for ch in anim['channels']:
            s = anim['samplers'][ch['sampler']]; tt = glb.acc(J, B, s['input']).ravel(); vv = glb.acc(J, B, s['output']); node, path = ch['target']['node'], ch['target']['path']
            if isinstance(trs[node][0], str): continue
            t = min(max(T, tt[0]), tt[-1]); k = int(np.clip(np.searchsorted(tt, t) - 1, 0, max(len(tt) - 2, 0)))
            if len(tt) < 2: f = 0; k = 0; vv = np.concatenate([vv, vv])
            else: f = 0 if tt[k + 1] == tt[k] else (t - tt[k]) / (tt[k + 1] - tt[k])
            i = {'translation': 0, 'rotation': 1, 'scale': 2}[path]; trs[node][i] = slerp(vv[k].astype(float), vv[k + 1].astype(float), f) if path == 'rotation' else vv[k] * (1 - f) + vv[k + 1] * f
    parent = {c: i for i, nd in enumerate(N) for c in nd.get('children', [])}; local = []
    for v in trs:
        if isinstance(v[0], str): local.append(v[1]); continue
        m = np.eye(4); m[:3, :3] = q2m(v[1]) * v[2]; m[:3, 3] = v[0]; local.append(m)
    world = [None] * len(N)

    def W(i):
        if world[i] is None: world[i] = (W(parent[i]) @ local[i]) if i in parent else local[i]
        return world[i]
    for i in range(len(N)): W(i)
    return world


def skinned(J, B, nd, joint_world, prim_filter=lambda p: True):
    sk = J['skins'][nd['skin']]; ibm = glb.acc(J, B, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    M = np.stack([joint_world(j) @ ibm[k] for k, j in enumerate(sk['joints'])]); out = []
    for p in J['meshes'][nd['mesh']]['primitives']:
        if not prim_filter(p): continue
        at = p['attributes']; P = glb.acc(J, B, at['POSITION']).astype(float); Nn = glb.acc(J, B, at['NORMAL']).astype(float); uv = glb.acc(J, B, at['TEXCOORD_0']).astype(float)
        j = glb.acc(J, B, at['JOINTS_0']).astype(int); w = glb.acc(J, B, at['WEIGHTS_0']).astype(float); w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
        Mv = np.einsum('vk,vkij->vij', w, M[j]); P2 = np.einsum('vij,vj->vi', Mv[:, :3, :3], P) + Mv[:, :3, 3]; N2 = np.einsum('vij,vj->vi', Mv[:, :3, :3], Nn); N2 /= np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-9)
        out.append((P2, N2, uv, glb.acc(J, B, p['indices']).ravel().astype(int), J['materials'][p['material']] if 'material' in p else {}))
    return out


def img(path, color=True):
    im = bpy.data.images.load(path, check_existing=False); im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'; im.alpha_mode = 'CHANNEL_PACKED'; return im


def embedded(J, B, ti, tag):
    data, mime = glb.image_bytes(J, B, ti); p = os.path.join(tmp, f'{tag}{ti}.' + ('png' if 'png' in (mime or '') else 'jpg')); open(p, 'wb').write(data); return p


bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene


def glove_material():
    m = bpy.data.materials.new('glove'); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']; L = nt.links.new
    c = nt.nodes.new('ShaderNodeTexImage'); c.name = 'color'; o = nt.nodes.new('ShaderNodeTexImage'); o.name = 'orm'; n = nt.nodes.new('ShaderNodeTexImage'); n.name = 'normal'
    sp = nt.nodes.new('ShaderNodeSeparateColor'); L(o.outputs['Color'], sp.inputs['Color'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
    L(c.outputs['Color'], mx.inputs['A']); L(sp.outputs['Red'], mx.inputs['B']); L(mx.outputs['Result'], bs.inputs['Base Color'])
    L(sp.outputs['Green'], bs.inputs['Roughness']); L(sp.outputs['Blue'], bs.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); L(n.outputs['Color'], nm.inputs['Color']); L(nm.outputs['Normal'], bs.inputs['Normal'])
    return m


def textured_material(name, J, B, mj, tag):   # a glb material with its own textures (arms glb: skin, sleeves)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']; L = nt.links.new; pb = mj.get('pbrMetallicRoughness', {})
    if 'baseColorTexture' in pb:
        c = nt.nodes.new('ShaderNodeTexImage'); c.image = img(embedded(J, B, pb['baseColorTexture']['index'], tag)); col = c.outputs['Color']
        f = pb.get('baseColorFactor', [1, 1, 1, 1])
        if f[:3] != [1, 1, 1]:
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1; L(col, mx.inputs['A']); mx.inputs['B'].default_value = (*f[:3], 1); col = mx.outputs['Result']
        L(col, bs.inputs['Base Color'])
    if 'normalTexture' in mj:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img(embedded(J, B, mj['normalTexture']['index'], tag), False); nm = nt.nodes.new('ShaderNodeNormalMap'); L(n.outputs['Color'], nm.inputs['Color']); L(nm.outputs['Normal'], bs.inputs['Normal'])
    if 'metallicRoughnessTexture' in pb:
        o = nt.nodes.new('ShaderNodeTexImage'); o.image = img(embedded(J, B, pb['metallicRoughnessTexture']['index'], tag), False); sp = nt.nodes.new('ShaderNodeSeparateColor'); L(o.outputs['Color'], sp.inputs['Color']); L(sp.outputs['Green'], bs.inputs['Roughness']); L(sp.outputs['Blue'], bs.inputs['Metallic'])
    if (mj.get('extras') or {}).get('part') == 'skin': bs.inputs['Subsurface Weight'].default_value = .15; bs.inputs['Subsurface Radius'].default_value = (1, .35, .2); bs.inputs['Subsurface Scale'].default_value = .004
    return m


def add_mesh(k, P, Nn, uv, idx, mat):
    me = bpy.data.meshes.new(f'p{k}'); Pb = P @ C.T; Nb = Nn @ C.T
    me.from_pydata(Pb.tolist(), [], idx.reshape(-1, 3).tolist()); uvl = me.uv_layers.new(name='UV'); li = np.array([l.vertex_index for l in me.loops]); u = uv[li].copy(); u[:, 1] = 1 - u[:, 1]; uvl.data.foreach_set('uv', u.ravel())
    me.normals_split_custom_set_from_vertices(Nb.tolist()); me.materials.append(mat); ob = bpy.data.objects.new(f'p{k}', me); sc.collection.objects.link(ob); return ob


GJ, GB = glb.read(job['glove_glb']); gmat = glove_material(); objs = []
skin_mat = bpy.data.materials.new('skin'); skin_mat.use_nodes = True; skin_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.55, .36, .27, 1)
if job['mode'] == 'fit':
    SJ, SB = glb.read(job['set_glb']); SW = node_worlds(SJ, SB, job.get('clip', 'idle'), float(job.get('t', 0.5))); byname = {nd.get('name'): i for i, nd in enumerate(SJ['nodes'])}
    jw = lambda J: (lambda j: SW[byname[J['nodes'][j]['name']]] if J['nodes'][j]['name'] in byname else np.eye(4))
    AJ, AB = glb.read(job['arms_glb']); side = job.get('side', 'ct')
    amats = {i: m for i, m in enumerate(AJ['materials'])}
    skin_src = next((i for i, m in amats.items() if (m.get('extras') or {}).get('part') == 'skin'), None)
    if skin_src is not None: skin_mat = textured_material('skin', AJ, AB, amats[skin_src], 'a')
    for nd in AJ['nodes']:   # the agent's sleeves only (its default gloves and wrist are replaced by the imported glove's)
        if 'mesh' in nd and AJ['meshes'][nd['mesh']]['name'] == f'sleeves_{side}':
            for k, (P, Nn, uv, idx, mj) in enumerate(skinned(AJ, AB, nd, jw(AJ))): objs.append(add_mesh(len(objs), P, Nn, uv, idx, textured_material(mj.get('name', 's'), AJ, AB, mj, 'a')))
    for nd in GJ['nodes']:
        if 'mesh' in nd and GJ['meshes'][nd['mesh']]['extras'].get('lod') == 'view':
            part = GJ['meshes'][nd['mesh']]['extras']['part']
            for (P, Nn, uv, idx, mj) in skinned(GJ, GB, nd, jw(GJ)): objs.append(add_mesh(len(objs), P, Nn, uv, idx, gmat if part == 'glove' else skin_mat))
    for i, nd in enumerate(SJ['nodes']):   # the set's gun
        if 'mesh' in nd and 'skin' in nd and not SJ['meshes'][nd['mesh']].get('name', '').endswith('viewmodel'):
            for (P, Nn, uv, idx, mj) in skinned(SJ, SB, nd, lambda j: SW[j]):
                gm = bpy.data.materials.new('gun'); gm.use_nodes = True; bs = gm.node_tree.nodes['Principled BSDF']; pb = mj.get('pbrMetallicRoughness', {})
                if 'baseColorTexture' in pb: t_ = gm.node_tree.nodes.new('ShaderNodeTexImage'); t_.image = img(embedded(SJ, SB, pb['baseColorTexture']['index'], 's')); gm.node_tree.links.new(t_.outputs['Color'], bs.inputs['Base Color'])
                bs.inputs['Roughness'].default_value = .5; objs.append(add_mesh(len(objs), P, Nn, uv, idx, gm))
    cam_i = next(i for i, nd in enumerate(SJ['nodes']) if 'camera' in nd); CW = SW[cam_i]; vfov = ((SJ['nodes'][cam_i].get('extras') or {}).get('vfov') or 60) / float(job.get('zoom', 1))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    Mb = np.eye(4); Mb[:3, :3] = C @ CW[:3, :3]; Mb[:3, 3] = C @ CW[:3, 3]; cam.matrix_world = mathutils.Matrix(Mb.tolist()); cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(vfov); cam.data.clip_start = .005
    cam.data.shift_x, cam.data.shift_y = job.get('shift', [0, 0])
    camM = mathutils.Matrix(Mb.tolist())
else:
    GW = node_worlds(GJ, GB); parts = []
    for nd in GJ['nodes']:
        if 'mesh' in nd and GJ['meshes'][nd['mesh']]['extras'].get('lod') == 'view' and GJ['meshes'][nd['mesh']]['extras']['part'] == 'glove':
            parts += skinned(GJ, GB, nd, lambda j: GW[j])   # (studio: the gloves alone, as CS2's icons show them; no wrist)
    # the rest pose holds the hands ~1.2 apart: bring them side by side (left hand on the left of the picture; the backs
    # of both hands toward +x: the right hand turned half round the vertical axis). Triangles go to a hand by where they
    # are (x > 0 = left), not by material: Specialist's left-hand material also covers a piece of the right hand.
    side = lambda P, idx: P[idx.reshape(-1, 3)].mean(1)[:, 0] > 0
    allL = np.concatenate([P[idx.reshape(-1, 3)].reshape(-1, 3)[np.repeat(side(P, idx), 3)] for (P, Nn, uv, idx, mj) in parts])
    allR = np.concatenate([P[idx.reshape(-1, 3)].reshape(-1, 3)[np.repeat(~side(P, idx), 3)] for (P, Nn, uv, idx, mj) in parts])
    cL, cR = allL.mean(0), allR.mean(0); s = float(np.linalg.norm(allL.max(0) - allL.min(0)))
    Ry = np.diag([-1.0, 1.0, -1.0])
    for (P, Nn, uv, idx, mj) in parts:
        L_ = side(P, idx)
        for hand, sel in (('L', L_), ('R', ~L_)):
            if not sel.any(): continue
            tri = idx.reshape(-1, 3)[sel]; used = np.unique(tri); remap = np.full(len(P), -1); remap[used] = np.arange(len(used))
            Q = P[used] - (cL if hand == 'L' else cR); N2 = Nn[used]
            if hand == 'R': Q = Q @ Ry.T; N2 = N2 @ Ry.T
            off = np.array([0.0, 0.0, 0.3 * s]) if hand == 'L' else np.array([-0.15 * s, 0.05 * s, -0.3 * s])
            objs.append(add_mesh(len(objs), Q + off, N2, uv[used], remap[tri].ravel(), gmat))
    pts = np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in objs]); lo, hi = pts.min(0), pts.max(0); ctr = (lo + hi) / 2; size = float(np.linalg.norm(hi - lo))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    d = mathutils.Vector(job.get('view', (1.0, -0.25, 0.45))).normalized(); cam.location = mathutils.Vector(ctr.tolist()) + d * size * 1.25
    q = (mathutils.Vector(ctr.tolist()) - cam.location).to_track_quat('-Z', 'Z'); q = q @ mathutils.Quaternion((0, 0, 1), math.radians(job.get('roll', 55)))
    cam.rotation_euler = q.to_euler(); cam.data.angle = math.radians(32)
    cam.data.clip_start = 0.001; camM = cam.matrix_world.copy(); bpy.context.view_layer.update(); camM = cam.matrix_world.copy()
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (.24, .245, .26, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
for nm_, d_, en in (('key', (.45, -.65, -1), 3.0), ('fill', (-.7, -.2, -.6), 1.0), ('rim', (0, .6, .8), 1.2)):
    l = bpy.data.objects.new(nm_, bpy.data.lights.new(nm_, 'SUN')); l.data.energy = en; l.data.angle = math.radians(8); sc.collection.objects.link(l)
    dw = camM.to_3x3() @ mathutils.Vector(d_).normalized(); l.rotation_euler = dw.to_track_quat('-Z', 'Y').to_euler()
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = RW, RH; sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
try: sc.eevee.taa_render_samples = 24
except Exception: pass
nt = gmat.node_tree; bs = nt.nodes['Principled BSDF']
for it in job['items']:
    for k, color in (('color', True), ('orm', False), ('normal', False)):
        old = nt.nodes[k].image; nt.nodes[k].image = img(it[k], color)
        if old: bpy.data.images.remove(old)
    bs.inputs['Sheen Weight'].default_value = .5 if it.get('cloth') else 0; bs.inputs['Sheen Roughness'].default_value = .5
    os.makedirs(os.path.dirname(it['out']), exist_ok=True); sc.render.filepath = it['out']; bpy.ops.render.render(write_still=True); print('RENDERED', it['out'], flush=True)
