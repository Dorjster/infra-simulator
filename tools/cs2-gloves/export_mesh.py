# One CS2 glove type -> a glb that drops into the game's first-person arms system (dist/fp-view.js, package V):
# the same 52 view-model arm bones, in the same order, with the same inverse bind matrices as the agents' arms glb
# (user-assets/fp-gloves/arms-<sha8>.glb), so the runtime can swap only the glove part and keep the agent's sleeves.
#   meshes  glove_L / glove_R   first-person gloves (CS2's viewmodel LOD: left- and right-hand materials)
#           skin                the bare wrist CS2 draws with this glove (material "bare_arm_133", shared with the arms glb)
#           world_L / world_R   CS2's third-person glove mesh (worldmodel), same bones
# CS2 lays both hands out on one texture (the right hand at u-1..0 with the texture repeating; Hand Wraps and Hydra
# also have pieces at u 1..2 / -1..0): every triangle is moved by whole texture widths into u 0..1 here, so one finish
# texture set (sampled with clamp, as the arms glb does) paints both hands. A mesh's `hand` is CS2's material side
# (Specialist's left-hand material also covers a small piece on the right hand's back, weighted to the right bones).
# CS2's glove models are bound to the same bones; three upper-arm twist bones sit up to 0.8 degrees differently. Each
# vertex is moved into the arms glb's bind pose (v' = sum_i w_i * inverse(IBM_arms_i) * IBM_glove_i * v), which is exact
# for every bone the gloves are weighted to (the report lists the largest move).
# Also writes the type's UV coverage mask (where the finish textures are used: bakes are padded outside it).
# usage (Blender's python, -I): export_mesh.py <job.json>   job: {src_glb, arms_glb, out_glb, out_mask, res, type}
import sys, os, json, hashlib, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(1, os.path.join(os.path.dirname(HERE), 'cs2-skins'))
import glb, imglib

BONES = [f'{b}_{s}' for s in 'LR' for b in ('arm_upper', 'arm_lower', 'hand', 'finger_middle_meta', 'finger_middle_0', 'finger_middle_1', 'finger_middle_2', 'finger_pinky_meta', 'finger_pinky_0', 'finger_pinky_1', 'finger_pinky_2', 'finger_index_meta', 'finger_index_0', 'finger_index_1', 'finger_index_2', 'finger_thumb_0', 'finger_thumb_1', 'finger_thumb_2', 'finger_ring_meta', 'finger_ring_0', 'finger_ring_1', 'finger_ring_2', 'arm_lower_TWIST', 'arm_lower_TWIST1', 'arm_upper_TWIST', 'arm_upper_TWIST1')]
BONES = [b.replace('_TWIST_L', '_L_TWIST').replace('_TWIST1_L', '_L_TWIST1').replace('_TWIST_R', '_R_TWIST').replace('_TWIST1_R', '_R_TWIST1') for b in BONES]


def skeleton_hash(names, ibm):
    """bone names + inverse bind matrices (column-major, as glTF stores them) rounded to 1e-4 -> sha1 hex (same in tests/import-cs2-gloves.mjs)"""
    q = np.floor(np.asarray(ibm, np.float64).reshape(-1) * 1e4 + 0.5).astype(np.int64)
    return hashlib.sha1((','.join(names) + '|' + ','.join(str(int(x)) for x in q)).encode()).hexdigest()


def arms_skeleton(p):
    J, B = glb.read(p); sk = J['skins'][0]; names = [J['nodes'][j]['name'] for j in sk['joints']]
    ibm = glb.acc(J, B, sk['inverseBindMatrices']).reshape(-1, 16)
    if names != BONES: raise SystemExit('the arms glb has other bones than CS2 view-model arms: ' + p)
    return names, ibm


def unwrap_u(u, tris):
    # whole-texture offsets that bring every triangle into u 0..1 (CS2 relies on the texture repeating: the right hand
    # sits at u -1..0, Hand Wraps / Hydra pieces at 1..2 or -1..0). Each triangle's offset is floor of its lowest u; a
    # vertex shared by triangles that need different offsets cannot move, so then the whole mesh keeps one offset.
    ft = np.floor(u[tris].min(1) + 1e-5); lo = np.full(len(u), np.inf); hi = np.full(len(u), -np.inf)
    np.minimum.at(lo, tris.ravel(), np.repeat(ft, 3)); np.maximum.at(hi, tris.ravel(), np.repeat(ft, 3))
    lo[~np.isfinite(lo)] = 0; hi[~np.isfinite(hi)] = 0
    if np.any(lo != hi) or np.any(u - lo > 1 + 1e-4): return np.floor(np.median(u))
    return lo


def raster(tris_uv, res):
    """UV triangles (N,3,2) in 0..1 -> bool coverage (res, res), image row 0 = v 0 (glTF: v down the image)"""
    m = np.zeros((res, res), bool); P = tris_uv * res - 0.5
    for t in P:
        x0, y0 = np.floor(t.min(0)).astype(int); x1, y1 = np.ceil(t.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, res - 1), min(y1, res - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1)); a, b, c = t
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12: continue
        l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d; l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d; l3 = 1 - l1 - l2
        e = -0.75 / (abs(d) ** 0.5 + 1e-9)   # (a little conservative: texels the triangle's edge touches count)
        m[ys, xs] |= (l1 >= e) & (l2 >= e) & (l3 >= e)
    return m


def main(job):
    names, ibmA = arms_skeleton(job['arms_glb'])
    S, B = glb.read(job['src_glb'])
    W = glb.Writer('infra tools/cs2-gloves/export_mesh.py'); W.J['nodes'][0]['name'] = 'glove_' + job['type']
    joints = [W.node({'name': n, 'matrix': np.linalg.inv(ibmA[i].reshape(4, 4).T).T.ravel().tolist()}) for i, n in enumerate(names)]
    W.J['skins'].append({'name': 'cs2_viewmodel_arms', 'joints': joints, 'inverseBindMatrices': W.acc(ibmA.astype(np.float32), 'MAT4', target=None)})
    mats = {}

    def material(part, name):
        if part not in mats:
            m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [0.16, 0.16, 0.16, 1], 'metallicFactor': 0, 'roughnessFactor': 0.8}, 'extras': {'part': part}}
            if part == 'skin': m['extras']['shareWith'] = name   # the arms glb's material of that name (skin tone, its textures)
            W.J['materials'].append(m); mats[part] = len(W.J['materials']) - 1
        return mats[part]

    report = {'meshes': {}, 'maxRebind': 0.0, 'bonesUsed': set()}; uv_tris = []
    for nd in S['nodes']:
        if 'mesh' not in nd: continue
        mesh = S['meshes'][nd['mesh']]; lod = 'view' if mesh['name'].endswith('.viewmodel') else 'world' if mesh['name'].endswith('.worldmodel') else None
        if not lod: continue
        sk = S['skins'][nd['skin']]; snames = [S['nodes'][j]['name'] for j in sk['joints']]; sib = acc_ibm = glb.acc(S, B, sk['inverseBindMatrices']).reshape(-1, 16)
        remap = np.array([names.index(n) if n in names else -1 for n in snames], np.int32)
        # per source joint: inverse(IBM_arms) * IBM_glove (identity where the bind poses agree)
        fix = np.stack([np.linalg.inv(ibmA[remap[k]].reshape(4, 4).T) @ sib[k].reshape(4, 4).T if remap[k] >= 0 else np.eye(4) for k in range(len(snames))])
        for p in mesh['primitives']:
            vm = S['materials'][p['material']].get('extras', {}).get('vmat', {}).get('Name', '') if 'materials' in S else ''
            mname = os.path.basename(vm).replace('.vmat', '') or S['materials'][p['material']]['name']
            part = 'skin' if mname.startswith('bare_arm') else 'glove'
            if lod == 'world' and part == 'skin': continue
            at = p['attributes']; idx = glb.acc(S, B, p['indices']).ravel(); used = np.unique(idx); inv = np.zeros(int(idx.max()) + 1, np.int64); inv[used] = np.arange(len(used)); idx = inv[idx]
            pos = glb.acc(S, B, at['POSITION'])[used].astype(np.float64); nrm = glb.acc(S, B, at['NORMAL'])[used].astype(np.float64); tan = glb.acc(S, B, at['TANGENT'])[used].astype(np.float64)
            uv = glb.acc(S, B, at['TEXCOORD_0'])[used].astype(np.float32); jt = glb.acc(S, B, at['JOINTS_0'])[used].astype(np.int64); w = glb.acc(S, B, at['WEIGHTS_0'])[used].astype(np.float64)
            w = np.where(remap[jt] < 0, 0, w); w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
            for j in np.unique(jt[w > 0]): report['bonesUsed'].add(snames[j])
            M = np.einsum('vk,vkij->vij', w, fix[jt])   # blended re-bind per vertex
            p2 = np.einsum('vij,vj->vi', M[:, :3, :3], pos) + M[:, :3, 3]; report['maxRebind'] = max(report['maxRebind'], float(np.abs(p2 - pos).max()))
            n2 = np.einsum('vij,vj->vi', M[:, :3, :3], nrm); n2 /= np.maximum(np.linalg.norm(n2, axis=1, keepdims=True), 1e-9)
            t2 = np.einsum('vij,vj->vi', M[:, :3, :3], tan[:, :3]); t2 /= np.maximum(np.linalg.norm(t2, axis=1, keepdims=True), 1e-9)
            if part == 'glove':
                uv[:, 0] -= unwrap_u(uv[:, 0], idx.reshape(-1, 3))   # (right hand at u -1..0, tiled pieces at 1..2: -> 0..1)
                hand = 'L' if mname.endswith('_left') else 'R' if mname.endswith('_right') else ('L' if pos[:, 0].mean() > 0 else 'R')
                if lod == 'view': uv_tris.append(uv[idx.reshape(-1, 3)])
            else: hand = None
            j8 = np.maximum(remap[jt], 0).astype(np.uint8)
            mn = (('glove_' if lod == 'view' else 'world_') + hand) if part == 'glove' else 'skin'
            n = len(pos); prim = {'attributes': {'POSITION': W.acc(p2.astype(np.float32), 'VEC3', minmax=True), 'NORMAL': W.acc(n2.astype(np.float32), 'VEC3'),
                                                 'TANGENT': W.acc(np.concatenate([t2, tan[:, 3:4]], 1).astype(np.float32), 'VEC4'), 'TEXCOORD_0': W.acc(uv, 'VEC2', minmax=True),
                                                 'JOINTS_0': W.acc(j8, 'VEC4', comp=5121), 'WEIGHTS_0': W.acc(w.astype(np.float32), 'VEC4')},
                                  'indices': W.acc(idx.astype(np.uint16 if n < 65536 else np.uint32), 'SCALAR', comp=5123 if n < 65536 else 5125, target=34963),
                                  'material': material(part, 'glove_' + job['type'] if part == 'glove' else mname)}
            W.J['meshes'].append({'name': mn, 'primitives': [prim], 'extras': {'part': part, 'hand': hand, 'lod': lod, 'cs2Material': mname}})
            W.node({'name': mn, 'mesh': len(W.J['meshes']) - 1, 'skin': 0})
            report['meshes'][mn] = {'verts': n, 'tris': len(idx) // 3}
    need = {'glove_L', 'glove_R'}
    if not need <= set(report['meshes']): raise SystemExit(f'{job["type"]}: no left / right first-person glove in {job["src_glb"]}')
    h = skeleton_hash(names, ibmA); W.J['nodes'][0]['extras'] = {'skeleton': h, 'cs2Type': job['type']}
    data = W.bytes(); os.makedirs(os.path.dirname(job['out_glb']), exist_ok=True); open(job['out_glb'] + '.tmp', 'wb').write(data); os.replace(job['out_glb'] + '.tmp', job['out_glb'])
    res = int(job.get('res', 1024)); m = raster(np.concatenate(uv_tris), res)
    imglib.save(job['out_mask'], m[..., None].astype(np.float32))
    print('RESULT ' + json.dumps({'ok': True, 'type': job['type'], 'glb': job['out_glb'], 'bytes': len(data), 'skeleton': h, 'maxRebind': round(report['maxRebind'], 6),
                                  'bonesUsed': sorted(report['bonesUsed']), 'meshes': report['meshes'], 'coverage': round(float(m.mean()), 4)}))


if __name__ == '__main__':
    main(json.load(open(sys.argv[1])))
