# CS2's own first-person arms for Global Defensive, from the CS2 install on this computer (never shipped, never
# committed): each side's agent model carries its view-model arms — `firstperson_default_gloves_arms` (the default
# gloves and the bare forearm under them) and `firstperson_sleeves` (the agent's sleeves) — on the same 52 view-model
# arm bones, at the same bind pose, as the glove mesh every first-person set (user-assets/fp/cs2_*.glb) is built
# with. fp-view.js binds them to each set's own bones, so every clip moves them.
#   CT: SAS (agents/models/ctm_sas)        → glove_hardknuckle_black + bare_arm_133 + sleeve_ctm_sas
#   T:  Phoenix (agents/models/tm_phoenix) → glove_fullfinger + bare_arm_133 + its body cloth (rolled sleeves)
# The sets so far wore the Driver Gloves mesh painted with a downloaded picture (driver-glove-garden.zip: CS2's Driver
# Gloves are a composite material — their own colour texture is a 4×4 placeholder) and the forearms the FPS pack's
# black camo shirt, on both sides; no AO, no roughness map.
# Every map at CS2's own resolution, laid out for glTF / three.js:
#   base colour  g_tColor (sRGB)                                  JPEG q95
#   normal       g_tNormal RGB (Source 2 exports: +Y up the image = glTF's convention; checked against the AO map)   PNG
#   ORM          R = g_tAmbientOcclusion, G = roughness = g_tNormal's alpha + the vmat's g_vRoughnessAdjustBrightness-
#                Contrast, B = metalness (g_tMetalness R; 0 on F_CLOTH_SHADING materials, whose map holds cloth masks)
#                — linear PNG, half the normal map's size (low-frequency data; saves GPU memory)
# A material that only uses a corner of its picture (Phoenix's sleeves: a strip of its body atlas) is cropped to it.
# Output: user-assets/fp-gloves/arms-<sha8>.glb (named by content: browsers cache /user-assets for good) listed in the
# manifest as models.fpGloves (the manifest is backed up first; nothing under user-assets/fp is touched).
#   <Blender's python> tools/export-fp-gloves.py [--cs2 ~/CS2-extract] [--assets user-assets] [--work DIR] [--backup DIR (default <work>/manifest-backups)] [--no-install]
# (Blender's bundled Python has numpy and OpenImageIO: /Applications/Blender.app/Contents/Resources/<v>/python/bin/python3.x)
import os, sys, json, struct, subprocess, hashlib, shutil, time, math
import numpy as np, OpenImageIO as oiio

A = sys.argv[1:]; opt = lambda k, d=None: A[A.index(k) + 1] if k in A else d
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CS2 = os.path.expanduser(opt('--cs2', '~/CS2-extract')); S2V = CS2 + '/tools/s2v/Source2Viewer-CLI'; PAK = CS2 + '/game/game/csgo/pak01_dir.vpk'
ASSETS = os.path.abspath(opt('--assets', os.path.join(REPO, 'user-assets'))); WORK = os.path.abspath(opt('--work', os.path.join(os.environ.get('TMPDIR', '/tmp'), 'fp-gloves-work')))
BACKUP = os.path.abspath(opt('--backup', os.path.join(WORK, 'manifest-backups'))); INSTALL = '--no-install' not in A
SIDES = {'ct': ('agents/models/ctm_sas/ctm_sas.vmdl_c', 'SAS'), 't': ('agents/models/tm_phoenix/tm_phoenix.vmdl_c', 'Phoenix')}
MESHES = {'firstperson_default_gloves_arms': 'arms', 'firstperson_sleeves': 'sleeves'}
# CS2's view-model arm bones, in the order of the glove mesh the sets carry (fp-view.js reuses that skeleton when the
# names line up — they do: one bone texture per set, as before).
BONES = [f'{b}_{s}' for s in 'LR' for b in ('arm_upper', 'arm_lower', 'hand', 'finger_middle_meta', 'finger_middle_0', 'finger_middle_1', 'finger_middle_2', 'finger_pinky_meta', 'finger_pinky_0', 'finger_pinky_1', 'finger_pinky_2', 'finger_index_meta', 'finger_index_0', 'finger_index_1', 'finger_index_2', 'finger_thumb_0', 'finger_thumb_1', 'finger_thumb_2', 'finger_ring_meta', 'finger_ring_0', 'finger_ring_1', 'finger_ring_2', 'arm_lower_TWIST', 'arm_lower_TWIST1', 'arm_upper_TWIST', 'arm_upper_TWIST1')]
BONES = [b.replace('_TWIST_L', '_L_TWIST').replace('_TWIST1_L', '_L_TWIST1').replace('_TWIST_R', '_R_TWIST').replace('_TWIST1_R', '_R_TWIST1') for b in BONES]   # (CS2 writes arm_lower_L_TWIST)
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(p):
    b = open(p, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + n]); return J, b[20 + n + 8:]


def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; dt = CT[a['componentType']]; nc = NC[a['type']]; isz = np.dtype(dt).itemsize * nc
    st = bv.get('byteStride') or isz; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); raw = B[off:off + st * (a['count'] - 1) + isz] + b'\0' * (st - isz)
    arr = np.frombuffer(raw, np.uint8).reshape(a['count'], st)[:, :isz].copy().view(dt).reshape(a['count'], nc)
    return arr.astype(np.float32) / np.iinfo(dt).max if a.get('normalized') else arr


def load_img(p):
    cfg = oiio.ImageSpec(); cfg.attribute('oiio:UnassociatedAlpha', 1); cfg.attribute('oiio:ColorSpace', 'Raw'); b = oiio.ImageBuf(p, 0, 0, cfg); a = b.get_pixels(oiio.FLOAT)
    if a is None or a.size == 0: raise RuntimeError('cannot read ' + p + ': ' + oiio.geterror())
    a = np.array(a, np.float32); return a if a.ndim == 3 else a[..., None]


def resize(a, w, h):
    if a.shape[1] == w and a.shape[0] == h: return a
    return np.array(oiio.ImageBufAlgo.resize(oiio.ImageBuf(np.ascontiguousarray(a)), roi=oiio.ROI(0, w, 0, h, 0, 1, 0, a.shape[2])).get_pixels(oiio.FLOAT), np.float32).reshape(h, w, a.shape[2])


def encode(a, kind):   # → bytes (JPEG q95 4:4:4 for colour; PNG for data — no colour chunks, nothing may colour-manage them)
    p = os.path.join(WORK, 'tmp.' + kind); a = np.ascontiguousarray(np.clip(a, 0, 1).astype(np.float32)); h, w, c = a.shape
    spec = oiio.ImageSpec(w, h, c, oiio.UINT8)
    if kind == 'jpg': spec.attribute('Compression', 'jpeg:95'); spec.attribute('jpeg:subsampling', '4:4:4')
    o = oiio.ImageOutput.create(p); o.open(p, spec); o.write_image(a); o.close(); b = open(p, 'rb').read(); os.remove(p)
    if kind == 'png':   # keep IHDR / IDAT / IEND only
        out, i = [b[:8]], 8
        while i + 12 <= len(b):
            n = struct.unpack('>I', b[i:i + 4])[0]; t = b[i + 4:i + 8]
            if t in (b'IHDR', b'PLTE', b'IDAT', b'IEND'): out.append(b[i:i + 12 + n])
            i += 12 + n
        b = b''.join(out)
    return b


def export(side):   # CS2's own files → <WORK>/<side>/... (Source2Viewer: the two first-person meshes, skinned, materials)
    vmdl = SIDES[side][0]; out = os.path.join(WORK, side); glb = os.path.join(out, vmdl.replace('.vmdl_c', '.glb'))
    if not os.path.exists(glb):
        os.makedirs(out, exist_ok=True)
        subprocess.run([S2V, '-i', PAK, '-f', vmdl, '-o', out, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials', '--gltf_mesh_list', ','.join(MESHES),
                        '--gltf_export_animations', '--gltf_animation_list', '__none__'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return glb


def main():
    os.makedirs(WORK, exist_ok=True)
    J = {'asset': {'version': '2.0', 'generator': 'infra tools/export-fp-gloves.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'fp_gloves', 'children': []}], 'meshes': [], 'skins': [], 'accessors': [], 'bufferViews': [], 'buffers': [], 'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]}
    BIN = bytearray()

    def view(b, target=None):
        while len(BIN) % 4: BIN.append(0)
        o = len(BIN); BIN.extend(b); v = {'buffer': 0, 'byteOffset': o, 'byteLength': len(b)}
        if target: v['target'] = target
        J['bufferViews'].append(v); return len(J['bufferViews']) - 1

    def add_acc(arr, typ, comp=5126, target=34962, minmax=False):
        arr = np.ascontiguousarray(arr); a = {'bufferView': view(arr.tobytes(), target), 'componentType': comp, 'count': len(arr), 'type': typ}
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        J['accessors'].append(a); return len(J['accessors']) - 1

    def add_tex(b, mime):
        J['images'].append({'bufferView': view(b), 'mimeType': mime}); J['textures'].append({'source': len(J['images']) - 1, 'sampler': 0}); return len(J['textures']) - 1

    ibm = None; joint_nodes = []; mats = {}; report = []; sides = {}
    for side in SIDES:
        S, B = read_glb(export(side)); srcdir = os.path.dirname(export(side)); sides[side] = {}
        for nd in S['nodes']:
            if 'mesh' not in nd: continue
            mesh = S['meshes'][nd['mesh']]; part = next((v for k, v in MESHES.items() if mesh.get('name', '').endswith(k)), None)
            if not part: continue
            sk = S['skins'][nd['skin']]; names = [S['nodes'][j]['name'] for j in sk['joints']]; sib = acc(S, B, sk['inverseBindMatrices']).reshape(-1, 16)
            remap = np.array([BONES.index(n) if n in BONES else -1 for n in names], np.int32)
            if ibm is None:   # the arm bones' bind pose (identical in both agents and in the sets' glove: checked)
                ibm = np.zeros((len(BONES), 16), np.float32)
                for k, n in enumerate(names):
                    if n in BONES: ibm[BONES.index(n)] = sib[k]
                assert all(abs(ibm[i]).sum() > 0 for i in range(len(BONES))), 'an arm bone missing from ' + side
                for i, n in enumerate(BONES):
                    J['nodes'].append({'name': n, 'matrix': np.linalg.inv(ibm[i].reshape(4, 4).T).T.ravel().tolist()}); joint_nodes.append(len(J['nodes']) - 1); J['nodes'][0]['children'].append(joint_nodes[-1])
                J['skins'].append({'name': 'cs2_viewmodel_arms', 'joints': joint_nodes, 'inverseBindMatrices': add_acc(ibm, 'MAT4', target=None)})
            else:
                for k, n in enumerate(names):
                    if n in BONES: assert np.abs(sib[k] - ibm[BONES.index(n)]).max() < 1e-4, 'bind pose differs: ' + side + ' ' + n
            prims = []
            for p in mesh['primitives']:
                vm = S['materials'][p['material']].get('extras', {}).get('vmat', {}); mname = vm.get('Name', '').split('/')[-1].replace('.vmat', '') or S['materials'][p['material']]['name']
                at = p['attributes']; pos = acc(S, B, at['POSITION']).astype(np.float32); nrm = acc(S, B, at['NORMAL']).astype(np.float32); tan = acc(S, B, at['TANGENT']).astype(np.float32); uv = acc(S, B, at['TEXCOORD_0']).astype(np.float32)
                jt = acc(S, B, at['JOINTS_0']).astype(np.int32); w = acc(S, B, at['WEIGHTS_0']).astype(np.float32); idx = acc(S, B, p['indices']).ravel()
                j2 = remap[jt]; w = np.where(j2 < 0, 0, w); j2 = np.maximum(j2, 0); w /= np.maximum(w.sum(1, keepdims=True), 1e-8)   # (every weight is on an arm bone: checked — none dropped in practice)
                prims.append(dict(mat=mname, vm=vm, src=srcdir, pos=pos, nrm=nrm, tan=tan, uv=uv, j=j2.astype(np.uint8), w=w, idx=idx))
            sides[side][part] = prims
    # Materials: each vmat once (bare_arm_133 is both sides'), cropped to the part of its picture in use.
    uses = {}
    for side in sides:
        for part, prims in sides[side].items():
            for pr in prims: uses.setdefault(pr['mat'], []).append(pr)
    for mname, prs in uses.items():
        vm = prs[0]['vm']; T = vm.get('TextureParams', {}); F = vm.get('FloatParams', {}); V = vm.get('VectorParams', {}); I = vm.get('IntParams', {}); src = prs[0]['src']
        path = lambda k: os.path.join(src, T[k].replace('.vtex', '.png')) if k in T and os.path.exists(os.path.join(src, T[k].replace('.vtex', '.png'))) else None
        col = load_img(path('g_tColor'))[..., :3]; nor = load_img(path('g_tNormal')); H, W = nor.shape[:2]
        if col.shape[:2] != (H, W): col = resize(col, W, H)
        uv = np.concatenate([p['uv'] for p in prs]); lo = np.clip(uv.min(0), 0, 1); hi = np.clip(uv.max(0), 0, 1)
        x0, x1 = int(max(0, math.floor(lo[0] * W) - 16)) // 4 * 4, min(W, -(-int(math.ceil(hi[0] * W) + 16) // 4) * 4); y0, y1 = int(max(0, math.floor(lo[1] * H) - 16)) // 4 * 4, min(H, -(-int(math.ceil(hi[1] * H) + 16) // 4) * 4)
        crop = (x1 - x0) * (y1 - y0) < .6 * W * H
        if not crop: x0, y0, x1, y1 = 0, 0, W, H
        for p in prs:
            if crop and not p.get('cropped'): p['uv'] = np.stack([(p['uv'][:, 0] * W - x0) / (x1 - x0), (p['uv'][:, 1] * H - y0) / (y1 - y0)], 1).astype(np.float32); p['cropped'] = True
        col = col[y0:y1, x0:x1]; nor = nor[y0:y1, x0:x1]; h, w = nor.shape[:2]; oh, ow = max(4, h // 2), max(4, w // 2)
        bc = V.get('g_vRoughnessAdjustBrightnessContrast', [0, 1, 0, 0]); rough = nor[..., 3] if nor.shape[2] > 3 else np.full((h, w), .7, np.float32)
        rough = np.clip((rough - .5) * bc[1] + .5 + bc[0], .04, 1)
        aop = path('g_tAmbientOcclusion'); ao = load_img(aop)[..., 0] if aop else np.ones((H, W), np.float32)
        ao = resize(ao[..., None], W, H)[..., 0] if ao.shape != (H, W) else ao; ao = ao[y0:y1, x0:x1]
        cloth = bool(I.get('F_CLOTH_SHADING')); mp = path('g_tMetalness'); met = np.zeros((H, W), np.float32)
        if mp and not cloth: m = load_img(mp)[..., 0]; met = (resize(m[..., None], W, H)[..., 0] if m.shape != (H, W) else m)
        met = met[y0:y1, x0:x1]
        orm = resize(np.stack([ao, rough, met], -1), ow, oh)
        part = 'skin' if mname.startswith('bare_arm') else 'glove' if mname.startswith('glove') else 'sleeve'
        tint = V.get('g_vColorTint', [1, 1, 1, 0])[:3]
        m = {'name': mname, 'pbrMetallicRoughness': {'baseColorFactor': [*tint, 1], 'baseColorTexture': {'index': add_tex(encode(col, 'jpg'), 'image/jpeg')}, 'metallicFactor': 1, 'roughnessFactor': 1},
             'normalTexture': {'index': add_tex(encode(nor[..., :3], 'png'), 'image/png')},
             'extras': {'part': part, 'cloth': cloth, 'vmat': vm.get('Name', ''), 'size': [w, h], 'ormSize': [ow, oh], 'roughMean': round(float(rough.mean()), 3)}}
        t = add_tex(encode(orm, 'png'), 'image/png'); m['pbrMetallicRoughness']['metallicRoughnessTexture'] = {'index': t}; m['occlusionTexture'] = {'index': t}
        J['materials'].append(m); mats[mname] = len(J['materials']) - 1; report.append(f'{mname}: {w}×{h} colour + normal, ORM {ow}×{oh}{" (cropped)" if crop else ""} · {part}{" · cloth" if cloth else ""} · roughness {rough.mean():.2f}')
    for side in sides:
        for part, prims in sides[side].items():
            ps = []
            for p in prims:
                n = len(p['pos']); idx = p['idx'].astype(np.uint16 if n < 65536 else np.uint32)
                ps.append({'attributes': {'POSITION': add_acc(p['pos'], 'VEC3', minmax=True), 'NORMAL': add_acc(p['nrm'], 'VEC3'), 'TANGENT': add_acc(p['tan'], 'VEC4'), 'TEXCOORD_0': add_acc(p['uv'], 'VEC2'),
                                          'JOINTS_0': add_acc(p['j'], 'VEC4', comp=5121), 'WEIGHTS_0': add_acc(p['w'], 'VEC4')}, 'indices': add_acc(idx, 'SCALAR', comp=5123 if n < 65536 else 5125, target=34963), 'material': mats[p['mat']]})
            J['meshes'].append({'name': f'{part}_{side}', 'primitives': ps, 'extras': {'side': side, 'part': part, 'agent': SIDES[side][1]}})
            J['nodes'].append({'name': f'{part}_{side}', 'mesh': len(J['meshes']) - 1, 'skin': 0}); J['nodes'][0]['children'].append(len(J['nodes']) - 1)
    while len(BIN) % 4: BIN.append(0)
    J['buffers'] = [{'byteLength': len(BIN)}]; js = json.dumps(J, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + bytes(BIN)
    name = 'arms-' + hashlib.sha1(glb).hexdigest()[:8] + '.glb'; out = os.path.join(WORK, name); open(out, 'wb').write(glb)
    print('\n'.join(report)); print('built', out, f'{len(glb) / 1e6:.1f} MB')
    if not INSTALL: return
    dst = os.path.join(ASSETS, 'fp-gloves'); os.makedirs(dst, exist_ok=True); shutil.copyfile(out, os.path.join(dst, name))
    for old in sorted((f for f in os.listdir(dst) if f.startswith('arms-') and f != name), key=lambda f: os.path.getmtime(os.path.join(dst, f)))[:-1]: os.remove(os.path.join(dst, old))   # (ours only: the newest earlier build kept)
    mp = os.path.join(ASSETS, 'manifest.json')
    os.makedirs(BACKUP, exist_ok=True); shutil.copyfile(mp, os.path.join(BACKUP, 'manifest.json.' + time.strftime('%Y%m%d-%H%M%S'))); print('manifest backed up to', BACKUP)   # (always: the live manifest is shared with the other importers)
    man = json.load(open(mp));   # (read just before the write, one key changed: another importer's edit in between is kept)
    man['models']['fpGloves'] = {'file': 'fp-gloves/' + name, 'bytes': len(glb), 'sides': {s: SIDES[s][1] for s in SIDES},
        'from': 'CS2: the agents\' first-person arms — SAS (glove_hardknuckle_black, sleeve_ctm_sas) and Phoenix (glove_fullfinger, rolled sleeves), bare_arm_133 (Steam depot, converted on this computer)'}
    tmp = mp + '.fpg-tmp'; open(tmp, "w").write(json.dumps(man, indent=1, ensure_ascii=False)); os.replace(tmp, mp); print('installed', os.path.join(dst, name), '→ manifest models.fpGloves')


main()
