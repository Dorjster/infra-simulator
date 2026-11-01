# CS2's own first-person look as a reference picture (package V; never shipped): a first-person set's clip
# (user-assets/fp/cs2_<id>.glb: CS2's view-model clips on CS2's arm bones) posed at a moment, CS2's own arm meshes of a
# side (the Source2Viewer export tools/export-fp-gloves.py made: <work>/<side>/agents/models/...) skinned onto it, the
# set's gun, rendered from the set's camera (CS2's view-model field of view) in a neutral studio light with Blender's
# Principled BSDF built straight from CS2's own pictures and vmat values — g_tColor (sRGB) × g_tAmbientOcclusion,
# g_tNormal (tangent space, +Y) with roughness in its alpha + g_vRoughnessAdjustBrightnessContrast, sheen on
# F_CLOTH_SHADING cloth, a little subsurface on F_SUBSURFACE_SCATTERING skin — independent of the game's three.js
# materials (the thing it is compared with: tests/browser/gd-gloves-sheet.mjs cs2=<out dir>).
#   blender -b --factory-startup -P tools/render-fp-gloves-cs2.py -- <set.glb> <work dir> <side ct|t> <clip> <seconds[@ms]> <out.jpg> [W H]
import bpy, sys, os, json, struct, math, tempfile
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]; SET, WORK, SIDE, CLIP, T, OUT = a[:6]; STRETCH = float(T.split('@')[1]) / 1000 if '@' in T else 0; T = float(T.split('@')[0]); RW, RH = (int(a[6]), int(a[7])) if len(a) > 7 else (960, 600)   # (<s>@<ms>: s seconds into the clip played over ms, as the game's reload(ms))
VMDL = {'ct': 'agents/models/ctm_sas/ctm_sas.glb', 't': 'agents/models/tm_phoenix/tm_phoenix.glb'}[SIDE]
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(p):
    b = open(p, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; return json.loads(b[20:20 + n]), b[20 + n + 8:]


def acc(J, B, i):
    x = J['accessors'][i]; bv = J['bufferViews'][x['bufferView']]; dt = CT[x['componentType']]; nc = NC[x['type']]; isz = np.dtype(dt).itemsize * nc
    st = bv.get('byteStride') or isz; off = bv.get('byteOffset', 0) + x.get('byteOffset', 0); raw = B[off:off + st * (x['count'] - 1) + isz] + b'\0' * (st - isz)
    arr = np.frombuffer(raw, np.uint8).reshape(x['count'], st)[:, :isz].copy().view(dt).reshape(x['count'], nc)
    return arr.astype(np.float32) / np.iinfo(dt).max if x.get('normalized') else arr


def q2m(q):
    x, y, z, w = q; return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def slerp(q0, q1, f):
    d = float(np.dot(q0, q1))
    if d < 0: q1, d = -q1, -d
    if d > .9995: q = q0 + f * (q1 - q0); return q / np.linalg.norm(q)
    th = math.acos(d); return (math.sin((1 - f) * th) * q0 + math.sin(f * th) * q1) / math.sin(th)


# 1. The set's nodes posed at T in the clip → world matrices (glTF space, metres)
J, B = read_glb(SET); N = J['nodes']; trs = []
for nd in N:
    if 'matrix' in nd: m = np.array(nd['matrix']).reshape(4, 4).T; trs.append(['M', m])
    else: trs.append([np.array(nd.get('translation', [0, 0, 0]), float), np.array(nd.get('rotation', [0, 0, 0, 1]), float), np.array(nd.get('scale', [1, 1, 1]), float)])
anim = next(x for x in J['animations'] if x['name'] == CLIP)
if STRETCH: T *= max(float(acc(J, B, anim['samplers'][c['sampler']]['input']).max()) for c in anim['channels']) / STRETCH
for ch in anim['channels']:
    s = anim['samplers'][ch['sampler']]; tt = acc(J, B, s['input']).ravel(); vv = acc(J, B, s['output']); node, path = ch['target']['node'], ch['target']['path']
    if isinstance(trs[node][0], str): continue
    t = min(max(T, tt[0]), tt[-1]); k = int(np.clip(np.searchsorted(tt, t) - 1, 0, len(tt) - 2)); f = 0 if tt[k + 1] == tt[k] else (t - tt[k]) / (tt[k + 1] - tt[k])
    i = {'translation': 0, 'rotation': 1, 'scale': 2}[path]; trs[node][i] = slerp(vv[k].astype(float), vv[k + 1].astype(float), f) if path == 'rotation' else vv[k] * (1 - f) + vv[k + 1] * f
parent = {}
for i, nd in enumerate(N):
    for c in nd.get('children', []): parent[c] = i
local = []
for v in trs:
    if isinstance(v[0], str): local.append(v[1]); continue
    m = np.eye(4); m[:3, :3] = q2m(v[1]) * v[2]; m[:3, 3] = v[0]; local.append(m)
world = [None] * len(N)
def W(i):
    if world[i] is None: world[i] = (W(parent[i]) @ local[i]) if i in parent else local[i]
    return world[i]
for i in range(len(N)): W(i)
byname = {nd.get('name'): i for i, nd in enumerate(N)}


def skinned(GJ, GB, nd, mesh, joint_world):   # → [(positions, normals, uv, indices, material json)] posed; joint_world(node index in GJ)
    sk = GJ['skins'][nd['skin']]; ibm = acc(GJ, GB, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    M = np.stack([joint_world(j) @ ibm[k] for k, j in enumerate(sk['joints'])]); out = []
    for p in mesh['primitives']:
        at = p['attributes']; P = acc(GJ, GB, at['POSITION']).astype(float); Nn = acc(GJ, GB, at['NORMAL']).astype(float); uv = acc(GJ, GB, at['TEXCOORD_0']).astype(float); j = acc(GJ, GB, at['JOINTS_0']).astype(int); w = acc(GJ, GB, at['WEIGHTS_0']).astype(float)
        w /= np.maximum(w.sum(1, keepdims=True), 1e-9); Mv = np.einsum('vk,vkij->vij', w, M[j]); P2 = np.einsum('vij,vj->vi', Mv[:, :3, :3], P) + Mv[:, :3, 3]; N2 = np.einsum('vij,vj->vi', Mv[:, :3, :3], Nn); N2 /= np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-9)
        out.append((P2, N2, uv, acc(GJ, GB, p['indices']).ravel().astype(int), GJ['materials'][p['material']] if 'material' in p else {}))
    return out


# 2. CS2's arms of the side (the raw export: CS2's own bind pose and pictures) on the set's bones; the set's gun on its own
RAW = os.path.join(WORK, SIDE, VMDL); RJ, RB = read_glb(RAW); RD = os.path.dirname(RAW); parts = []
for nd in RJ['nodes']:
    if 'mesh' in nd and 'firstperson' in RJ['meshes'][nd['mesh']].get('name', ''): parts += [(x, 'arm') for x in skinned(RJ, RB, nd, RJ['meshes'][nd['mesh']], lambda j: W(byname[RJ['nodes'][j]['name']]) if RJ['nodes'][j]['name'] in byname else np.eye(4))]   # (the agent's body bones carry no weight on these meshes)
for i, nd in enumerate(N):
    if 'mesh' in nd and 'skin' in nd and not J['meshes'][nd['mesh']].get('name', '').endswith('viewmodel'): parts += [(x, 'gun') for x in skinned(J, B, nd, J['meshes'][nd['mesh']], W)]
cam_i = next(i for i, nd in enumerate(N) if 'camera' in nd); CW = W(cam_i); vfov = (N[cam_i].get('extras') or {}).get('vfov') or math.degrees(J['cameras'][N[cam_i]['camera']]['perspective']['yfov'])

# 3. Blender scene: glTF (Y up) → Blender (Z up)
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; C = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float); tmp = tempfile.mkdtemp()
def img(path, color=True):
    im = bpy.data.images.load(path, check_existing=True); im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'; im.alpha_mode = 'CHANNEL_PACKED'; return im   # (the normal map's alpha is roughness: never premultiplied)
def set_img(J_, B_, ti):
    im = J_['images'][J_['textures'][ti]['source']]; bv = J_['bufferViews'][im['bufferView']]; p = os.path.join(tmp, f'set{ti}.' + ('png' if 'png' in im['mimeType'] else 'jpg')); open(p, 'wb').write(B_[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']]); return p
mats = {}
def material(mj, kind):
    key = (kind, mj.get('name'));
    if key in mats: return mats[key]
    m = bpy.data.materials.new(mj.get('name', 'm')); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']; L = nt.links.new
    vm = (mj.get('extras') or {}).get('vmat', {}); T_ = vm.get('TextureParams', {}); V = vm.get('VectorParams', {}); I = vm.get('IntParams', {})
    tex = lambda k: os.path.join(RD, T_[k].replace('.vtex', '.png')) if k in T_ and os.path.exists(os.path.join(RD, T_[k].replace('.vtex', '.png'))) else None
    if kind == 'arm':
        c = nt.nodes.new('ShaderNodeTexImage'); c.image = img(tex('g_tColor')); col = c.outputs['Color']
        if tex('g_tAmbientOcclusion'):
            ao = nt.nodes.new('ShaderNodeTexImage'); ao.image = img(tex('g_tAmbientOcclusion'), False); mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
            L(col, mx.inputs['A']); L(ao.outputs['Color'], mx.inputs['B']); col = mx.outputs['Result']
        L(col, bs.inputs['Base Color'])
        nn = nt.nodes.new('ShaderNodeTexImage'); nn.image = img(tex('g_tNormal'), False); nm = nt.nodes.new('ShaderNodeNormalMap'); L(nn.outputs['Color'], nm.inputs['Color']); L(nm.outputs['Normal'], bs.inputs['Normal'])
        bc = V.get('g_vRoughnessAdjustBrightnessContrast', [0, 1, 0, 0]); r = nt.nodes.new('ShaderNodeMath'); r.operation = 'MULTIPLY_ADD'; r.use_clamp = True; L(nn.outputs['Alpha'], r.inputs[0]); r.inputs[1].default_value = bc[1]; r.inputs[2].default_value = bc[0] + .5 - .5 * bc[1]; L(r.outputs[0], bs.inputs['Roughness'])
        bs.inputs['Metallic'].default_value = 0
        if I.get('F_CLOTH_SHADING'): bs.inputs['Sheen Weight'].default_value = .6 * (vm.get('FloatParams', {}).get('g_flSheenScale', 1)); bs.inputs['Sheen Roughness'].default_value = .5
        if I.get('F_SUBSURFACE_SCATTERING'): bs.inputs['Subsurface Weight'].default_value = .15; bs.inputs['Subsurface Radius'].default_value = (1, .35, .2); bs.inputs['Subsurface Scale'].default_value = .004
    else:   # the set's gun: its own colour (+ normal) picture
        pb = mj.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pb: c = nt.nodes.new('ShaderNodeTexImage'); c.image = img(set_img(J, B, pb['baseColorTexture']['index'])); L(c.outputs['Color'], bs.inputs['Base Color'])
        if 'normalTexture' in mj: nn = nt.nodes.new('ShaderNodeTexImage'); nn.image = img(set_img(J, B, mj['normalTexture']['index']), False); nm = nt.nodes.new('ShaderNodeNormalMap'); L(nn.outputs['Color'], nm.inputs['Color']); L(nm.outputs['Normal'], bs.inputs['Normal'])
        bs.inputs['Metallic'].default_value = pb.get('metallicFactor', .3); bs.inputs['Roughness'].default_value = pb.get('roughnessFactor', .5)
    mats[key] = m; return m
for k, ((P, Nn, uv, idx, mj), kind) in enumerate(parts):
    me = bpy.data.meshes.new(f'p{k}'); Pb = P @ C.T; Nb = Nn @ C.T; tris = idx.reshape(-1, 3)
    me.from_pydata(Pb.tolist(), [], tris.tolist()); uvl = me.uv_layers.new(name='UV'); li = np.array([l.vertex_index for l in me.loops]); u = uv[li]; u[:, 1] = 1 - u[:, 1]; uvl.data.foreach_set('uv', u.ravel())
    me.normals_split_custom_set_from_vertices(Nb.tolist()); me.materials.append(material(mj, kind)); ob = bpy.data.objects.new(f'p{k}', me); sc.collection.objects.link(ob)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
Mb = np.eye(4); Mb[:3, :3] = C @ CW[:3, :3]; Mb[:3, 3] = C @ CW[:3, 3]; import mathutils; cam.matrix_world = mathutils.Matrix(Mb.tolist())
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(vfov); cam.data.clip_start = .005
# 4. Neutral studio: a grey room light, a soft key from above-left in front, a weaker fill from the right
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (.24, .245, .26, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
for nm_, d_, en in (('key', (.45, -.65, -1), 3.0), ('fill', (-.7, -.2, -.6), 1.0)):   # (directions in the camera's frame — x right, y up, −z ahead: the key from the upper left behind you, the fill from the right; the same light on every frame of every weapon)
    l = bpy.data.objects.new(nm_, bpy.data.lights.new(nm_, 'SUN')); l.data.energy = en; l.data.angle = math.radians(8); sc.collection.objects.link(l)
    dw = mathutils.Matrix(Mb.tolist()).to_3x3() @ mathutils.Vector(d_).normalized(); l.rotation_euler = dw.to_track_quat('-Z', 'Y').to_euler()
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x, sc.render.resolution_y = RW, RH; sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
try: sc.eevee.taa_render_samples = 32
except Exception: pass
sc.render.filepath = OUT; bpy.ops.render.render(write_still=True); print('RENDERED', OUT, 'vfov', vfov)
