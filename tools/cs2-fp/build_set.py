# A first-person set from CS2's own data: the glove's view-model mesh and the weapon model in one GLB, with every
# clip baked onto their bones (each bone's world pose = the clip skeleton's bone of the same name; the weapon
# skeleton placed on the clip's 'wpn' bone), a camera at the eye (CS2: forward +Z, metres).
# Usage: build_set.py <out.glb> <glove.glb> <weapon.glb> name=clip.glb [name=clip.glb ...]
# (A copy of ~/CS2-extract/build/build_set.py, which built the 37 sets in user-assets/fp; here one change: a scope's
# glass (CS2 material '…_lens': the AUG's) keeps a dark glossy glass of its own instead of the gun's texture.)
import sys, json, struct, numpy as np; sys.path.insert(0, __import__('os').path.dirname(__file__)); from gltfio import *
args = sys.argv[1:]; TEX = {}
while args and args[0].startswith('--'):   # --glove-tex color.jpg,normal.jpg  --weapon-tex color.jpg,normal.jpg  --arm-color r,g,b
    k, v = args[0][2:], args[1]; TEX[k] = v; args = args[2:]
out, glove, weapon, *clips = args; FPS = 30
docs = []; BIN = bytearray(); J = {k: [] for k in ('nodes', 'meshes', 'skins', 'accessors', 'bufferViews', 'materials', 'textures', 'images', 'samplers', 'animations')}; J['scenes'] = [{'nodes': []}]
def add_bytes(b):
    while len(BIN) % 4: BIN.append(0)
    o = len(BIN); BIN.extend(b); J['bufferViews'].append({'buffer': 0, 'byteOffset': o, 'byteLength': len(b)}); return len(J['bufferViews']) - 1
def merge(g, b, keep_mesh, images=True):   # copies g into J (only the scene's nodes; meshes filtered by keep_mesh(name)); returns node index map
    off = {k: len(J[k]) for k in J if k != 'scenes'}
    if not images:   # (no images: their buffer views left out, materials without textures)
        g = dict(g); imgbv = {im.get('bufferView') for im in g.get('images', [])}; g['images'] = []; g['textures'] = []
        g['materials'] = [{k: v for k, v in m.items() if 'Texture' not in k} for m in g.get('materials', [])]
        for m in g['materials']:
            if 'pbrMetallicRoughness' in m: m['pbrMetallicRoughness'] = {k: v for k, v in m['pbrMetallicRoughness'].items() if 'Texture' not in k}
        g['bufferViews'] = [bv if i not in imgbv else {**bv, 'byteLength': 0} for i, bv in enumerate(g.get('bufferViews', []))]
    for bv in g.get('bufferViews', []):
        nb = dict(bv); nb['byteOffset'] = 0; data = b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        i = add_bytes(data); J['bufferViews'][i] = {**{k: v for k, v in bv.items() if k not in ('buffer', 'byteOffset')}, 'buffer': 0, 'byteOffset': J['bufferViews'][i]['byteOffset']}
    for a in g.get('accessors', []): a = dict(a); a['bufferView'] = a['bufferView'] + off['bufferViews']; J['accessors'].append(a)
    for im in g.get('images', []):
        im = dict(im)
        if im.get('bufferView') is not None: im['bufferView'] += off['bufferViews']
        J['images'].append({k: v for k, v in im.items() if v is not None})
    for s in g.get('samplers', []): J['samplers'].append(s)
    for t in g.get('textures', []): t = dict(t); t['source'] = t['source'] + off['images']; t['sampler'] = t.get('sampler', 0) + off['samplers'] if 'sampler' in t else None; J['textures'].append({k: v for k, v in t.items() if v is not None})
    def fixtex(o):
        if isinstance(o, dict): return {k: (v + off['textures'] if k == 'index' else fixtex(v)) for k, v in o.items()}
        if isinstance(o, list): return [fixtex(x) for x in o]
        return o
    for m in g.get('materials', []): J['materials'].append(fixtex(m))
    for m in g.get('meshes', []):
        m = json.loads(json.dumps(m))
        for p in m['primitives']:
            p['attributes'] = {k: v + off['accessors'] for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] += off['accessors']
            if 'material' in p: p['material'] += off['materials']
            p.pop('targets', None)
        J['meshes'].append(m)
    for s in g.get('skins', []):
        s = dict(s); s['joints'] = [j + off['nodes'] for j in s['joints']]; s['inverseBindMatrices'] += off['accessors']
        if 'skeleton' in s: s['skeleton'] += off['nodes']
        J['skins'].append(s)
    for nd in g['nodes']:
        nd = dict(nd)
        if 'children' in nd: nd['children'] = [c + off['nodes'] for c in nd['children']]
        if 'mesh' in nd:
            if keep_mesh(g['meshes'][nd['mesh']].get('name') or ''): nd['mesh'] += off['meshes']
            else: nd.pop('mesh'); nd.pop('skin', None)
        if 'skin' in nd: nd['skin'] += off['skins']
        J['nodes'].append(nd)
    J['scenes'][0]['nodes'] += [r + off['nodes'] for r in g['scenes'][g.get('scene', 0)]['nodes']]
    return off['nodes']
gg, gb = load(glove); go = merge(gg, gb, lambda n: n.endswith('viewmodel'), images=not TEX.get('glove-shared'))
wg, wb = load(weapon)
for m in wg['meshes']:   # (CS2's relative name, as the other sets: an export from a rewritten scratch copy — kv3_compat.py — names its meshes by that copy's absolute path)
    n = m.get('name') or ''; i = n.find('weapons/models/'); m['name'] = n[i:] if i > 0 else n
meshnames = [m.get('name') or '' for m in wg['meshes']]; hd = [n for n in meshnames if n.endswith('body_hd')]
wo = merge(wg, wb, lambda n: (n in hd) if hd else not n.endswith('physics') and 'physics' not in n)
def add_acc(arr, typ):
    arr = np.ascontiguousarray(arr, np.float32); bv = add_bytes(arr.tobytes()); a = {'bufferView': bv, 'componentType': 5126, 'count': len(arr), 'type': typ}
    if typ == 'SCALAR': a['min'] = [float(arr.min())]; a['max'] = [float(arr.max())]
    J['accessors'].append(a); return len(J['accessors']) - 1
def add_image(path):
    data = open(path, 'rb').read(); bv = add_bytes(data); J['images'].append({'bufferView': bv, 'mimeType': 'image/png' if path.endswith('.png') else 'image/jpeg'})
    if not J['samplers']: J['samplers'].append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
    J['textures'].append({'source': len(J['images']) - 1, 'sampler': 0}); return len(J['textures']) - 1
def material(name, tex=None, color=None, rough=.7, metal=0.0):
    m = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': metal, 'roughnessFactor': rough}}
    if tex: c, n = (tex.split(',') + [None])[:2]; m['pbrMetallicRoughness']['baseColorTexture'] = {'index': add_image(c)}; m['normalTexture'] = {'index': add_image(n)} if n else None
    if color: m['pbrMetallicRoughness']['baseColorFactor'] = color
    J['materials'].append({k: v for k, v in m.items() if v is not None}); return len(J['materials']) - 1
def remat(mesh_filter, pick):   # every primitive of matching meshes: material chosen by its old material's name
    for m in J['meshes']:
        if not mesh_filter(m.get('name') or ''): continue
        for p in m['primitives']:
            old = J['materials'][p['material']]['name'] if 'material' in p else ''; new_ = pick(old)
            if new_ is not None: p['material'] = new_
if TEX.get('glove-shared'):   # the game supplies the glove's material: only a named slot here
    gm = material('cs2_glove', color=[.25, .27, .3, 1], rough=.75); am = material('cs2_sleeve', color=[*map(float, TEX.get('arm-color', '.05,.06,.09').split(',')), 1], rough=.9)
    remat(lambda n: n.endswith('viewmodel'), lambda old: gm if 'glove' in old else am)
elif 'glove-tex' in TEX:
    gm = material('cs2_glove', TEX['glove-tex'], rough=.75); am = material('cs2_sleeve', color=[*map(float, TEX.get('arm-color', '.05,.06,.09').split(',')), 1], rough=.9)
    remat(lambda n: n.endswith('viewmodel'), lambda old: gm if 'glove' in old else am)
if 'weapon-fade' in TEX:   # a Fade finish: purple at the grip → pink → gold at the tip, along the weapon's longest axis
    fm = material('cs2_weapon_fade', rough=.22, metal=.9); J['materials'][fm]['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 1]
    stops = [(0, (.32, .16, .62)), (.45, (.9, .32, .62)), (.75, (.98, .6, .7)), (1, (1, .82, .35))]
    for m in J['meshes']:
        if (m.get('name') or '').endswith('viewmodel'): continue
        for p in m['primitives']:
            a = J['accessors'][p['attributes']['POSITION']]; bv = J['bufferViews'][a['bufferView']]; pos = np.frombuffer(bytes(BIN[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']]), np.float32).reshape(-1, 3)[:a['count']]
            ext = pos.max(0) - pos.min(0); ax = int(np.argmax(ext)); f = (pos[:, ax] - pos[:, ax].min()) / max(1e-6, ext[ax])
            if TEX['weapon-fade'] == 'rev': f = 1 - f
            col = np.zeros((len(f), 4), np.float32); col[:, 3] = 1
            for k in range(len(stops) - 1):
                (f0, c0), (f1, c1) = stops[k], stops[k + 1]; sel = (f >= f0) & (f <= f1); w = ((f[sel] - f0) / (f1 - f0))[:, None]
                col[sel, :3] = (np.array(c0) * (1 - w) + np.array(c1) * w) ** 2.2
            p['attributes']['COLOR_0'] = add_acc(col, 'VEC4'); p['material'] = fm
if 'weapon-tex' in TEX:
    wm = material('cs2_weapon', TEX['weapon-tex'], rough=.5, metal=.3); lens = []   # (CS2's shared_scope_lens: tint .157, roughness .08, metal)
    def lens_or_gun(old):
        if 'lens' not in old: return wm
        if not lens: lens.append(material('cs2_lens', color=[.02, .025, .03, 1], rough=.08, metal=1.0))
        return lens[0]
    remat(lambda n: not n.endswith('viewmodel'), lens_or_gun)
if 'weapon-ruby' in TEX:   # CS2's Doppler Ruby: the blade deep candy-apple red with dark marbling, glossy metal; the grip black
    rm = material('cs2_weapon', TEX.get('weapon-tex'), rough=.16, metal=.85)
    def accf(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]; dt = {5126: np.float32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        arr = np.frombuffer(bytes(BIN[bv['byteOffset'] + a.get('byteOffset', 0):bv['byteOffset'] + bv['byteLength']]), dt)[:a['count'] * n].reshape(-1, n).astype(np.float32)
        return arr / 255 if a.get('normalized') and dt == np.uint8 else arr / 65535 if a.get('normalized') and dt == np.uint16 else arr
    for mi, m in enumerate(J['meshes']):
        if (m.get('name') or '').endswith('viewmodel'): continue
        skin = next((nd.get('skin') for nd in J['nodes'] if nd.get('mesh') == mi), None); jn = [J['nodes'][j].get('name', '') for j in J['skins'][skin]['joints']] if skin is not None else []
        for p in m['primitives']:
            pos = accf(p['attributes']['POSITION']); blade = None; steel = None
            if 'blade-mask' in TEX and 'TEXCOORD_0' in p['attributes']:   # (v53 KNIVES: CS2's own paint coverage — knife_mask.py — sampled at each vertex's UV0: 1 the painted blade, 0 the handle CS2 leaves bare)
                import OpenImageIO as oiio; mk = oiio.ImageBuf(TEX['blade-mask']).get_pixels(oiio.FLOAT)[..., 0]; mh, mw = mk.shape; uv = accf(p['attributes']['TEXCOORD_0'])
                mk3 = oiio.ImageBuf(TEX['blade-mask']).get_pixels(oiio.FLOAT); yi, xi = np.clip((uv[:, 1] % 1) * mh, 0, mh - 1).astype(int), np.clip((uv[:, 0] % 1) * mw, 0, mw - 1).astype(int)
                blade = mk[yi, xi].astype(np.float32)
                # (v53 KNIVES final: the mask's green is CS2's handle — knife_mask.py; neither blade nor handle is bare steel)
                if mk3.shape[2] > 1: steel = (1 - blade) * (1 - mk3[yi, xi, 1].astype(np.float32))
            elif 'blade' in jn and 'JOINTS_0' in p['attributes']:   # (a knife whose blade is its own bone: the butterfly's, the stiletto's)
                jj = accf(p['attributes']['JOINTS_0']).astype(int); ww = accf(p['attributes']['WEIGHTS_0']); bi = jn.index('blade'); blade = ((jj == bi) * ww).sum(1)
            if blade is None:   # else along the knife: past the grip (its origin is in the hand) toward the far end
                ext = np.abs(pos).max(0); ax = int(np.argmax(pos.max(0) - pos.min(0))); sgn = 1 if pos[:, ax].max() >= -pos[:, ax].min() else -1; t = sgn * pos[:, ax] / max(1e-6, ext[ax])
                blade = np.clip((t - .3) / .12, 0, 1)
            q = pos * 60; n = (np.sin(q[:, 0] * 1.7 + np.sin(q[:, 2] * 2.3)) + np.sin(q[:, 1] * 2.1 + q[:, 0] * .7) + 2) / 4   # (marbling)
            deep, bright = np.array([.16, .0, .015]), np.array([.85, .035, .09]); ruby = deep + (bright - deep) * np.clip(.3 + .6 * n, 0, 1)[:, None]
            col = np.ones((len(pos), 4), np.float32); col[:, :3] = (1 - blade[:, None]) * .13 + blade[:, None] * ruby * 1.6   # (the grip black; ×1.6: the pale texture under the ruby darkens it back)
            if steel is not None: col[:, 1] = np.maximum(col[:, 1], (steel > .5).astype(np.float32))   # (bare steel: green on, red off — skin-render.js keeps CS2's base material there, not the black handle)
            p['attributes']['COLOR_0'] = add_acc(np.clip(col, 0, 1) ** 2.2 * [1, 1, 1, 1] + [0, 0, 0, 0], 'VEC4'); p['material'] = rm
ox, oy, oz, VFOV = map(float, TEX.get('view', '2.5,2,-1.5,60').split(','))   # CS2 viewmodel_offset_x/y/z (inches) and the vertical field of view
cam = {'name': 'FPCam', 'camera': 0, 'rotation': [0, 1, 0, 0], 'translation': [ox * .0254, -oz * .0254, -oy * .0254], 'extras': {'metres': True, 'vfov': VFOV}}; J['nodes'].append(cam); J['scenes'][0]['nodes'].append(len(J['nodes']) - 1)
J['cameras'] = [{'type': 'perspective', 'perspective': {'yfov': float(np.radians(VFOV)), 'aspectRatio': 16 / 9, 'znear': .01, 'zfar': 100}}]
# Which nodes animate: the glove's and the weapon's skin joints and their ancestors.
par = parents(J); names = [nd.get('name', '') for nd in J['nodes']]
glove_nodes = range(go, go + len(gg['nodes'])); weapon_nodes = range(wo, wo + len(wg['nodes']))
rest = {i: list(node_trs(nd)) for i, nd in enumerate(J['nodes'])}
order = []; seen = set()
def topo(i):
    if i in seen: return
    if i in par: topo(par[i])
    seen.add(i); order.append(i)
for i in list(glove_nodes) + list(weapon_nodes): topo(i)
for spec in clips:
    name, path = spec.split('=', 1); cg, cb = load(path); A = Anim(cg, cb, 0); cn = {nd['name']: i for i, nd in enumerate(cg['nodes'])}
    times = np.arange(0, A.dur + 1e-6, 1 / FPS); 
    if times[-1] < A.dur - 1e-4: times = np.append(times, A.dur)
    tracks = {i: ([], [], []) for i in order}
    for t in times:
        CW = worlds(cg, A.pose(cg, t)); X = CW[cn['wpn']] @ np.linalg.inv(CW[cn['root_motion']]) if 'wpn' in cn else np.eye(4)
        Wn = {}
        for i in order:
            nm = names[i]; tgt = None
            if i in glove_nodes and nm in cn and not nm.endswith('.vnmskel'): tgt = CW[cn[nm]]
            elif i in weapon_nodes and nm in cn: tgt = X @ CW[cn[nm]]
            pw = Wn[par[i]] if i in par else np.eye(4)
            if tgt is not None: L = np.linalg.inv(pw) @ tgt
            else: L = trs(*rest[i])
            Wn[i] = pw @ L; tt, rr, ss = decompose(L); tracks[i][0].append(tt); tracks[i][1].append(rr); tracks[i][2].append(ss)
    T = add_acc(times.reshape(-1, 1), 'SCALAR'); T2 = add_acc(times[[0, -1]].reshape(-1, 1), 'SCALAR'); ch = []; sm = []
    for i, (tt, rr, ss) in tracks.items():
        rr = np.array(rr)
        for k in range(1, len(rr)):
            if np.dot(rr[k], rr[k - 1]) < 0: rr[k] = -rr[k]
        for path, arr, typ in (('translation', np.array(tt), 'VEC3'), ('rotation', rr, 'VEC4'), ('scale', np.array(ss), 'VEC3')):
            if np.abs(arr - arr[0]).max() < 1e-5:   # unchanging through the clip: two keys
                if path == 'scale' and np.abs(arr[0] - 1).max() < 1e-5 and np.abs(np.array(rest[i][2]) - 1).max() < 1e-5: continue   # (scale 1 throughout, 1 at rest: nothing to say)
                sm.append({'input': T2, 'output': add_acc(arr[[0, -1]], typ), 'interpolation': 'LINEAR'})
            else: sm.append({'input': T, 'output': add_acc(arr, typ), 'interpolation': 'LINEAR'})
            ch.append({'sampler': len(sm) - 1, 'target': {'node': i, 'path': path}})
    J['animations'].append({'name': name, 'channels': ch, 'samplers': sm}); print('clip', name, '%.2fs' % A.dur, len(times), 'frames')
# Repack: only the accessors / buffer views something uses (the glove's world model, legacy meshes, … left out).
used_acc = set()
for m in J['meshes']:
    pass
mesh_used = {nd['mesh'] for nd in J['nodes'] if 'mesh' in nd}; skin_used = {nd['skin'] for nd in J['nodes'] if 'skin' in nd}
for mi in mesh_used:
    for p in J['meshes'][mi]['primitives']: used_acc |= set(p['attributes'].values()) | ({p['indices']} if 'indices' in p else set())
for si in skin_used: used_acc.add(J['skins'][si]['inverseBindMatrices'])
for a in J['animations']:
    for sm_ in a['samplers']: used_acc |= {sm_['input'], sm_['output']}
mat_used = {p['material'] for mi in mesh_used for p in J['meshes'][mi]['primitives'] if 'material' in p}
tex_used = set()
def walk(o):
    if isinstance(o, dict):
        if 'index' in o and len(o) <= 3 and isinstance(o['index'], int): tex_used.add(o['index'])
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
for mi in mat_used: walk(J['materials'][mi])
img_used = {J['textures'][t]['source'] for t in tex_used}
bv_used = {J['accessors'][a]['bufferView'] for a in used_acc} | {J['images'][i]['bufferView'] for i in img_used if 'bufferView' in J['images'][i]}
NB = bytearray(); bvmap = {}
for i in sorted(bv_used):
    bv = J['bufferViews'][i]; data = BIN[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']]
    while len(NB) % 4: NB.append(0)
    bvmap[i] = len(bvmap); J['bufferViews'][i] = {**bv, 'byteOffset': len(NB)}; NB.extend(data)
J['bufferViews'] = [J['bufferViews'][i] for i in sorted(bv_used)]
accmap = {}; accs = []
for i, a in enumerate(J['accessors']):
    if i in used_acc: accmap[i] = len(accs); accs.append({**a, 'bufferView': bvmap[a['bufferView']]})
J['accessors'] = accs
for mi, m in enumerate(J['meshes']):
    for p in m['primitives']:
        p['attributes'] = {k: accmap.get(v, 0) for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = accmap.get(p['indices'], 0)
for sk in J['skins']: sk['inverseBindMatrices'] = accmap.get(sk['inverseBindMatrices'], 0)
for a in J['animations']:
    for sm_ in a['samplers']: sm_['input'] = accmap[sm_['input']]; sm_['output'] = accmap[sm_['output']]
for i, im in enumerate(J['images']):
    if 'bufferView' in im: im['bufferView'] = bvmap.get(im['bufferView'], 0)
# drop unused skins (the glove's world model, legacy weapon meshes), renumbered
smap = {si: k for k, si in enumerate(sorted(skin_used))}; J['skins'] = [J['skins'][si] for si in sorted(skin_used)]
for nd in J['nodes']:
    if 'skin' in nd: nd['skin'] = smap[nd['skin']]
# drop unused meshes, materials, textures, images (renumbered)
mmap = {mi: k for k, mi in enumerate(sorted(mesh_used))}; J['meshes'] = [J['meshes'][mi] for mi in sorted(mesh_used)]
for nd in J['nodes']:
    if 'mesh' in nd: nd['mesh'] = mmap[nd['mesh']]
matmap = {mi: k for k, mi in enumerate(sorted(mat_used))}; J['materials'] = [J['materials'][mi] for mi in sorted(mat_used)]
for m in J['meshes']:
    for p in m['primitives']:
        if 'material' in p: p['material'] = matmap[p['material']]
imap = {ii: k for k, ii in enumerate(sorted(img_used))}; tmap = {ti: k for k, ti in enumerate(sorted(tex_used))}
J['textures'] = [{**J['textures'][ti], 'source': imap[J['textures'][ti]['source']]} for ti in sorted(tex_used)]; J['images'] = [J['images'][ii] for ii in sorted(img_used)]
def retex(o):
    if isinstance(o, dict): return {k: (tmap[v] if k == 'index' and isinstance(v, int) and len(o) <= 3 else retex(v)) for k, v in o.items()}
    if isinstance(o, list): return [retex(v) for v in o]
    return o
J['materials'] = [retex(m) for m in J['materials']]
if not J['textures']: J['samplers'] = []
BIN = NB
J = {k: v for k, v in J.items() if v != []}; J['asset'] = {'version': '2.0', 'generator': 'infra fp build_set (CS2 data via Source 2 Viewer)'}; J['scene'] = 0
J['buffers'] = [{'byteLength': len(BIN)}]
js = json.dumps(J, separators=(',', ':')).encode();
while len(js) % 4: js += b' '
while len(BIN) % 4: BIN.append(0)
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(BIN))); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(BIN), 0x004E4942)); f.write(BIN)
print('WROTE', out, len(BIN) // 1024, 'KB')
