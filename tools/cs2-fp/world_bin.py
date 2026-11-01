# world_bin.py <weapon.glb> <id> <out.bin>: CS2's own weapon model (Source 2 Viewer export) as the game's compact model
# (dist/weapon-models.js loadReal: a JSON header, then float32 positions / normals / uvs, one 'main' part, triangles
# unindexed) in the convention of the other CS2 models in user-assets/weapons: centimetres, y up, muzzle along −z — the
# export turned half a turn about y (x → −x, z → −z: the same files' boxes match the M4A4's, Negev's, MP9's… exactly),
# at its bind pose, origin kept (CS2's hand point; weapon-models.js CS2_FIT says where the hand holds). The HD body when
# there is one (the AUG's 'body_hd'; its legacy LOD left out) and no scope glass (its own material, the gun's texture
# would be wrong on it). Prints {tris, box} as JSON.
#   --drop-joints a,b,…  leave out the triangles weighted to these bones (the molotov's lighter: CS2 hangs it in the left
#                        hand, 10 cm off the bottle — a thrown or dropped bottle carries none)
#   --drop-mats a,b,…    leave out the primitives whose material name has one of these in it (the molotov's flame card)
import sys, json, struct, numpy as np, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from gltfio import load, acc, worlds, node_trs
argv = sys.argv[1:]; opt = lambda k: (argv.pop(argv.index(k) + 1), argv.remove(k))[0].split(',') if k in argv else []
DROPJ, DROPM = set(opt('--drop-joints')), opt('--drop-mats'); src, gid, out = argv[:3]; g, b = load(src)
W = worlds(g, {i: list(node_trs(nd)) for i, nd in enumerate(g['nodes'])}); names = [m.get('name') or '' for m in g['meshes']]
hd = [i for i, n in enumerate(names) if n.endswith('body_hd')]; pick = hd or [i for i, n in enumerate(names) if 'physics' not in n]
P, N, U = [], [], []
for nd_i, nd in enumerate(g['nodes']):
    if nd.get('mesh') not in pick: continue
    M = W[nd_i] if 'skin' not in nd else np.eye(4)   # (a skinned mesh's vertices are already at the bind pose, in the skeleton's frame)
    for p in g['meshes'][nd['mesh']]['primitives']:
        mat = g['materials'][p['material']].get('name', '') if 'material' in p and g.get('materials') else ''
        if 'lens' in mat or any(x in mat for x in DROPM): continue
        pos = acc(g, b, p['attributes']['POSITION']); nor = acc(g, b, p['attributes']['NORMAL']); uv = acc(g, b, p['attributes']['TEXCOORD_0'])
        idx = acc(g, b, p['indices']).astype(np.int64).ravel() if 'indices' in p else np.arange(len(pos))
        pos = pos @ M[:3, :3].T + M[:3, 3]; nor = nor @ M[:3, :3].T
        if DROPJ and 'JOINTS_0' in p['attributes'] and 'skin' in nd:   # (a vertex belongs to its heaviest bone; a triangle with any vertex on a dropped bone goes)
            jn = [g['nodes'][j].get('name', '') for j in g['skins'][nd['skin']]['joints']]; J = acc(g, b, p['attributes']['JOINTS_0']).astype(np.int64); Wt = acc(g, b, p['attributes']['WEIGHTS_0'])
            bad = np.array([jn[j] in DROPJ for j in J[np.arange(len(J)), Wt.argmax(1)]]); idx = idx.reshape(-1, 3)[~bad[idx.reshape(-1, 3)].any(1)].ravel()
        P.append(pos[idx]); N.append(nor[idx]); U.append(uv[idx])
P = np.concatenate(P) * 100 * [-1, 1, -1]; N = np.concatenate(N) * [-1, 1, -1]; U = np.concatenate(U) * [1, -1] + [0, 1]   # (v flipped, as tools/import-cs2-page.js does for glTF: loadReal decodes its pictures flipped)
N /= np.maximum(1e-9, np.linalg.norm(N, axis=1, keepdims=True))
box = [P.min(0).round(4).tolist(), P.max(0).round(4).tolist()]
head = json.dumps({'id': gid, 'box': box, 'parts': [{'name': 'main', 'count': len(P), 'opacity': False}]}).encode(); pad = (4 - (len(head) + 4) % 4) % 4
with open(out, 'wb') as f:
    f.write(struct.pack('<I', len(head) + pad)); f.write(head + b' ' * pad)
    for a in (P, N, U): f.write(np.ascontiguousarray(a, np.float32).tobytes())
print(json.dumps({'tris': len(P) // 3, 'box': [[round(x, 2) for x in v] for v in box]}))
