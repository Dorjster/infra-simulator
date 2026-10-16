# Authoring first-person animations on the CS2 MultiRig from key-pose specs (JSON), for one weapon.
# Control rig: GunCtl (the gun's world pose, keyed; the gun copies it) · HandR_tgt (child of GunCtl: the right hand on
# the grip, fixed) · the left hand's IK target blended over named holds: 'free' (keyed in camera space) and holds on
# the gun — gun-attached (children of GunCtl: grip, front…) or on the gun's own bones (slide, clip) — keyed influences
# · shoulders lowered and set back (CS2: the arms rise from below the screen) · elbows and fingers keyed.
# Usage: blender -b -Y scene.blend -P author.py -- <fpanim dir> <spec.json> <out prefix> [render|export|both]
import bpy, sys, math, json
args = sys.argv[sys.argv.index('--') + 1:]; sys.path.insert(0, args[0]); from poselib import *
spec = json.load(open(args[1])); OUT = args[2]; MODE = args[3] if len(args) > 3 else 'render'
FPS = 60; sc = bpy.context.scene; sc.render.fps = FPS; sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
sc.display.shading.color_type = 'OBJECT'
for o in bpy.data.objects:
    if o.name == 'Sport Gloves': o.color = (.2, .22, .26, 1)
    elif o.name.startswith('sleeve'): o.color = (.08, .1, .16, 1)
    elif o.type == 'MESH' and gun and o.parent == gun: o.color = (.3, .32, .36, 1)
gun.animation_data_create(); gun.animation_data.action = None; [gun.constraints.remove(x) for x in list(gun.constraints)]; update(); _mw = gun.matrix_world.copy(); gun.parent = None; gun.matrix_world = _mw; update(); R_IMP = gun.matrix_world.to_3x3().normalized()   # (the gun in scene space: baked and exported as its own node)
def L(v): return Vector((v[0], -v[1], v[2]))
RS_LOCAL = spec.get('rs_local', [2.13, 5.03, 0])
C4 = Matrix(((-1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # camera space (x right, y up, z back) → world axes
def gun_matrix(g):
    if 'cam' in g: return Matrix.Translation(EYE) @ C4 @ Matrix(g['cam'])
    if 'hand' in g:   # placed by its right hand: the hand's middle knuckle, knuckle direction and index side in camera space
        h = g['hand']; gr = spec['grip_r']; Grest = R_IMP.to_4x4()
        Hrest = hand_matrix('r', Grest @ L(gr['mcp']), (R_IMP @ L(gr['d'])).normalized(), R_IMP @ L(gr['a']))
        Hw = hand_matrix('r', cam_to_world(h['mcp']), cvec(h['d']), cvec(h['a'])); return Hw @ Hrest.inverted() @ Grest
    if 'rel' in g:   # [dx, dy, dz (camera space, inches), rx, ry, rz (degrees about camera right / up / back)] from the idle, about the grip
        base = gun_matrix(spec['idle']['gun']); dx, dy, dz, rx, ry, rz = (list(g['rel']) + [0] * 6)[:6]
        Rc = Matrix.Rotation(math.radians(rz), 4, 'Z') @ Matrix.Rotation(math.radians(ry), 4, 'Y') @ Matrix.Rotation(math.radians(rx), 4, 'X')
        Rw = C4 @ Rc @ C4.inverted(); piv = base @ L(spec.get('pivot', [2.6, 0.5, 0]))
        return Matrix.Translation(C4.to_3x3() @ Vector((dx, dy, dz))) @ Matrix.Translation(piv) @ Rw @ Matrix.Translation(-piv) @ base
    yaw, pitch, roll = [math.radians(v) for v in g.get('rot', [0, 0, 0])]
    RG = Matrix.Rotation(-yaw, 3, 'Z') @ Matrix.Rotation(pitch, 3, 'X') @ Matrix.Rotation(-roll, 3, 'Y') @ R_IMP
    return Matrix.Translation(cam_to_world(g['rs']) - RG @ L(RS_LOCAL)) @ RG.to_4x4()
def hand_matrix(sd, mcp, d, a):
    d = Vector(d).normalized(); hl = (W('finger_middle_0_' + sd).translation - W('hand_' + sd).translation).length
    R = frame(d, a) @ rest_frame(sd).transposed(); rest = W('hand_ik_target_' + sd)
    return Matrix.Translation(Vector(mcp) - d * hl) @ (R @ rest.to_3x3()).to_4x4()
def cvec(v): return Vector((-v[0], v[2], v[1]))   # a camera-space direction → world
def empty(name):
    o = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    if o.name not in sc.collection.objects: sc.collection.objects.link(o)
    o.parent = None; o.rotation_mode = 'QUATERNION'; return o
# Shoulders: lowered / set back (camera space offset, inches).
sh = spec.get('shoulders', [0, -5, 4])
for sd, sx in (('r', 1), ('l', -1)):
    pb = P['shoulder_IK_' + sd]; pb.location = (0, 0, 0); update(); M = rig.matrix_world @ pb.matrix
    pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(cvec([sh[0] * sx, sh[1], sh[2]])) @ M)
update()
# The gun at idle, then everything that hangs off it.
G0 = gun_matrix(spec['idle']['gun'])
GunCtl = empty('GunCtl'); GunCtl.matrix_world = G0
c = gun.constraints.new('COPY_TRANSFORMS'); c.target = GunCtl; update()
def gl(v): return G0 @ L(v)
def gdir(v): return (G0.to_3x3() @ L(v)).normalized()
def hold(name, g, sd='l', bone=None):   # an empty where the hand's IK target goes for this hold, fixed to the gun or one of its bones
    o = empty(name)
    if bone: o.parent = gun; o.parent_type = 'BONE'; o.parent_bone = bone
    else: o.parent = GunCtl
    update(); o.matrix_world = hand_matrix(sd, gl(g['mcp']), gdir(g['d']), gdir(g['a'])); return o
HandR = hold('HandR_tgt', spec['grip_r'], 'r')
for pb in (P['hand_ik_target_r'], P['hand_ik_target_l']): [pb.constraints.remove(x) for x in list(pb.constraints)]
cr = P['hand_ik_target_r'].constraints.new('COPY_TRANSFORMS'); cr.target = HandR
HandLf = empty('HandL_free')
cf = P['hand_ik_target_l'].constraints.new('COPY_TRANSFORMS'); cf.target = HandLf; cf.name = 'free'
HOLDS = {}
for hn, h in spec['holds_l'].items():   # {name: {mcp, d, a, bone?}}
    o = hold('HandL_' + hn, h, 'l', h.get('bone')); con = P['hand_ik_target_l'].constraints.new('COPY_TRANSFORMS'); con.target = o; con.name = hn; HOLDS[hn] = con
FING = ['thumb', 'index', 'middle', 'ring', 'pinky']
SPIN_AX = None
if spec.get('spin_bone'):   # a flat knife spun round its ring: the axis ⟂ its blade (its vertices' least-spread direction), in the bone's own frame
    gmesh = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == gun][0]; vs = [gun.matrix_world.inverted() @ (gmesh.matrix_world @ v.co) for v in list(gmesh.data.vertices)[::7]]
    c0 = sum(vs, Vector()) / len(vs); C = Matrix(((0, 0, 0), (0, 0, 0), (0, 0, 0)))
    for v in vs:
        d0 = v - c0
        for i in range(3):
            for j in range(3): C[i][j] += d0[i] * d0[j]
    import numpy as _np
    w_, V_ = _np.linalg.eigh(_np.array([[C[i][j] for j in range(3)] for i in range(3)])); n_ = Vector(V_[:, 0].tolist())
    SPIN_AX = (gun.data.bones[spec['spin_bone']].matrix_local.to_3x3().inverted() @ n_).normalized(); print('SPIN axis', tuple(round(x, 3) for x in n_))
LASTQ = {}
def keyq(owner, key, fr):   # key a quaternion, its sign kept continuous with the one keyed before (no flips between keys)
    q = owner.rotation_quaternion; k_ = (id(owner), key)
    if k_ in LASTQ and LASTQ[k_].dot(q) < 0: owner.rotation_quaternion = -q
    LASTQ[k_] = owner.rotation_quaternion.copy(); owner.keyframe_insert('rotation_quaternion', frame=fr)
SH0 = {sd: P['shoulder_IK_' + sd].location.copy() for sd in 'rl'}
def key_pose(fr, k, base):
    g = k.get('gun') or base.get('gun', {}); GunCtl.matrix_world = gun_matrix(g)   # (a key's own gun pose, else the clip's base)
    GunCtl.keyframe_insert('location', frame=fr); GunCtl.rotation_mode = 'QUATERNION'; keyq(GunCtl, 'g', fr); update()
    lm = k.get('l', base.get('l', 'grip')); w = {hn: 0.0 for hn in HOLDS}
    if isinstance(lm, str): w[lm] = 1.0 if lm in w else 0.0
    else: w.update(lm)
    for hn, con in HOLDS.items(): con.influence = w.get(hn, 0.0); con.keyframe_insert('influence', frame=fr)
    lf = k.get('lfree') or (base.get('lfree') if 'l' not in k or k.get('l') == 'free' else None)
    if lf: HandLf.matrix_world = hand_matrix('l', cam_to_world(lf['mcp']), cvec(lf['d']), cvec(lf['a']))
    else: HandLf.matrix_world = bpy.data.objects['HandL_grip'].matrix_world.copy()
    HandLf.keyframe_insert('location', frame=fr); keyq(HandLf, 'lf', fr)
    for sd in 'rl':   # shoulder reach: this key's offset (camera space) on top of the set-back shoulders
        o = k.get('sh_' + sd, [0, 0, 0]); pb_ = P['shoulder_IK_' + sd]; pb_.location = SH0[sd].copy(); update()
        if any(o): M_ = rig.matrix_world @ pb_.matrix; pb_.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(cvec(o)) @ M_)
        pb_.keyframe_insert('location', frame=fr)
    if SPIN_AX is not None:
        pb = gun.pose.bones[spec['spin_bone']]; pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = Quaternion(SPIN_AX, math.radians(k.get('spin', 0))); keyq(pb, 'spin', fr)
    for sd in 'rl':
        e = k.get('elbow_' + sd, base.get('elbow_' + sd))
        if e: set_elbow(sd, cam_to_world(e)); P['elbow_target_' + sd].keyframe_insert('location', frame=fr)
        for f in FING:
            curl(sd, f, k.get('curl_' + sd, {}).get(f, base.get('curl_' + sd, {}).get(f, [0, 0, 0])))
            for j in range(3): keyq(P[f'finger_{f}_{j}_{sd}'], 'f', fr)
def make_clip(name, a):
    rig.animation_data_create(); rig.animation_data.action = bpy.data.actions.new('rig_' + name)
    for o in (GunCtl, HandLf): o.animation_data_create(); o.animation_data.action = bpy.data.actions.new(o.name + '_' + name)
    base = {**spec['idle'], **a.get('base', {})}
    if SPIN_AX is not None: gun.animation_data.action = bpy.data.actions.new('gun_' + name)
    for k in a['keys']: key_pose(round(k['t'] * FPS) + 1, k, base)
    if SPIN_AX is None: gun.animation_data.action = bpy.data.actions.get(a.get('part_clip', 'firstperson_idle'))
    if a.get('slide_kick'):
        ga = bpy.data.actions.new('gun_' + name); gun.animation_data.action = ga; pb = gun.pose.bones[spec.get('slide_bone', 'v_weapon_slide')]; ax = Vector(spec.get('slide_axis', (0, 0, 1)))
        for t, back in a['slide_kick']: pb.location = ax * back; pb.keyframe_insert('location', frame=round(t * FPS) + 1)
        pb.location = (0, 0, 0)
    for o in (rig, GunCtl, HandLf) + ((gun,) if SPIN_AX is not None else ()):
        for fc in fcurves(o.animation_data.action):
            for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
    sc.frame_start = 1; sc.frame_end = round(a['dur'] * FPS) + 1
results = []
for name, a in spec['anims'].items():
    if spec.get('only') and name not in spec['only']: continue
    make_clip(name, a)
    if MODE in ('render', 'both'):
        for t in a.get('preview', []):
            sc.frame_set(round(t * FPS) + 1); update(); render(f'{OUT}_{name}_{t:.2f}.png', 'FPCam', (960, 540)); results.append(f'{name} {t}')
print('DONE', results)

# --- export: bake every clip (visual), constraints off, NLA tracks per clip, materials, GLB ---
def tex(path, size=2048):
    img = bpy.data.images.load(path, check_existing=True)
    if max(img.size) > size: img.scale(size, size)
    return img
def pbr(name, color=None, base=None, normal=None, rough=.7, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if color: b.inputs['Base Color'].default_value = color
    if base: t = nt.nodes.new('ShaderNodeTexImage'); t.image = base; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if normal:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = normal; t.image.colorspace_settings.name = 'Non-Color'; nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m
def set_mat(o, m): o.data.materials.clear(); o.data.materials.append(m)
if MODE in ('export', 'both'):
    mats = spec['materials']
    gb = bpy.data.objects['Sport Gloves']
    if mats.get('glove_glb'):
        before = set(bpy.data.images); before_o = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=mats['glove_glb'])
        for o in [o for o in bpy.data.objects if o not in before_o]: bpy.data.objects.remove(o, do_unlink=True)
        gimgs = [i for i in bpy.data.images if i not in before]; set_mat(gb, pbr('cs2_glove', base=gimgs[0], normal=gimgs[1] if len(gimgs) > 1 else None, rough=.75))
    for sn in ('sleeve_ctm_sas', 'sleeve_tm_heavy'): set_mat(bpy.data.objects[sn], pbr(sn, color=(.05, .065, .1, 1) if 'ctm' in sn else (.08, .08, .06, 1), rough=.9))
    gm = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == gun][0]
    if mats.get('gun_color'): set_mat(gm, pbr('gun_' + spec['weapon'], base=tex(mats['gun_color']), normal=tex(mats['gun_normal']) if mats.get('gun_normal') else None, rough=.55, metal=.25))
    baked = {}
    def bake(obj, types):
        bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
        for bc in getattr(obj.data, 'collections_all', []): bc.is_visible = True
        for b in obj.data.bones: b.hide = False
        bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT')
        bpy.ops.nla.bake(frame_start=sc.frame_start, frame_end=sc.frame_end, step=1, only_selected=False, visual_keying=True, clear_constraints=False, clear_parents=False, use_current_action=False, bake_types=types)
        bpy.ops.object.mode_set(mode='OBJECT'); return obj.animation_data.action
    for name, a in spec['anims'].items():
        make_clip(name, a); ra = bake(rig, {'POSE'}); ra.name = 'B_rig_' + name; ga = bake(gun, {'POSE', 'OBJECT'}); ga.name = 'B_gun_' + name; baked[name] = (ra, ga)
    for pb in rig.pose.bones: [pb.constraints.remove(x) for x in list(pb.constraints)]
    if rig.animation_data:
        for d in list(rig.animation_data.drivers): rig.animation_data.drivers.remove(d)
    [gun.constraints.remove(x) for x in list(gun.constraints)]
    for obj, k in ((rig, 0), (gun, 1)):
        obj.animation_data.action = None
        for tr in list(obj.animation_data.nla_tracks): obj.animation_data.nla_tracks.remove(tr)
        for name in baked: tr = obj.animation_data.nla_tracks.new(); tr.name = name; tr.strips.new(name, 1, baked[name][k])
    mz = empty('muzzle'); sc.frame_set(1); update(); mz.parent = gun; mz.matrix_world = gun.matrix_world @ Matrix.Translation(L(spec.get('muzzle', [18.27, 4.08, 0])))
    keep = [rig, gun, gm, gb, bpy.data.objects['sleeve_ctm_sas'], bpy.data.objects['sleeve_tm_heavy'], bpy.data.objects['FPCam'], mz]
    bpy.ops.object.select_all(action='DESELECT')
    for o in keep: o.hide_set(False); o.hide_viewport = False; o.select_set(True)
    sc.frame_set(1)
    bpy.ops.export_scene.gltf(filepath=OUT + '.glb', export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_cameras=True, export_yup=True,
        export_skins=True, export_force_sampling=True, export_frame_step=2, export_image_format='JPEG', export_jpeg_quality=85, export_apply=False, export_morph=False)
    print('EXPORTED', OUT + '.glb', list(baked))
