# Minimal glTF (GLB) reading / writing with numpy: accessors, node trees, animation sampling, world matrices.
import json, struct, numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def load(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + n]); o = 20 + n
    bin_ = b[o + 8:o + 8 + struct.unpack('<I', b[o:o + 4])[0]] if o < len(b) else b''
    return g, bin_
def acc(g, bin_, i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); k = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0) or dt.itemsize * k
    raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * k, offset=off)
    arr = np.lib.stride_tricks.as_strided(raw.view(dt) if stride % dt.itemsize == 0 and False else np.frombuffer(raw.tobytes(), dt), shape=(a['count'], k), strides=(stride, dt.itemsize)) if stride != dt.itemsize * k else np.frombuffer(raw.tobytes(), dt).reshape(a['count'], k)
    arr = np.array(arr, dtype=np.float64)
    if a.get('normalized'): arr /= {np.int8: 127, np.uint8: 255, np.int16: 32767, np.uint16: 65535}[CT[a['componentType']]]
    return arr
def q2m(q):
    x, y, z, w = q; return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def m2q(m):
    t = np.trace(m)
    if t > 0: s = np.sqrt(t + 1) * 2; q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]: s = np.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; q = [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]: s = np.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; q = [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else: s = np.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q); return q / np.linalg.norm(q)
def trs(t, r, s):
    M = np.eye(4); M[:3, :3] = q2m(r) * np.array(s); M[:3, 3] = t; return M
def decompose(M):
    t = M[:3, 3].copy(); s = np.linalg.norm(M[:3, :3], axis=0); R = M[:3, :3] / s
    if np.linalg.det(R) < 0: s[0] = -s[0]; R[:, 0] = -R[:, 0]
    return t, m2q(R), s
def parents(g):
    p = {}
    for i, nd in enumerate(g['nodes']):
        for c in nd.get('children', []): p[c] = i
    return p
def node_trs(nd):
    if 'matrix' in nd: return decompose(np.array(nd['matrix']).reshape(4, 4).T)
    return np.array(nd.get('translation', [0, 0, 0]), float), np.array(nd.get('rotation', [0, 0, 0, 1]), float), np.array(nd.get('scale', [1, 1, 1]), float)
class Anim:   # one glTF animation, sampled
    def __init__(self, g, bin_, ai):
        self.ch = []; a = g['animations'][ai]; self.dur = 0
        for c in a['channels']:
            sm = a['samplers'][c['sampler']]; t = acc(g, bin_, sm['input']).ravel(); v = acc(g, bin_, sm['output'])
            self.ch.append((c['target']['node'], c['target']['path'], t, v, sm.get('interpolation', 'LINEAR'))); self.dur = max(self.dur, float(t[-1]))
    def pose(self, g, time):   # node index → (t, r, s) at `time`
        P = {i: list(node_trs(nd)) for i, nd in enumerate(g['nodes'])}
        for n, path, t, v, interp in self.ch:
            if interp == 'CUBICSPLINE': v = v[1::3]
            k = np.searchsorted(t, time, side='right') - 1; k = max(0, min(len(t) - 1, k))
            if k < len(t) - 1 and interp != 'STEP':
                f = (time - t[k]) / max(1e-9, t[k + 1] - t[k]); f = min(1, max(0, f)); a_, b_ = v[k], v[k + 1]
                if path == 'rotation':
                    if np.dot(a_, b_) < 0: b_ = -b_
                    x = a_ * (1 - f) + b_ * f; x /= np.linalg.norm(x)
                else: x = a_ * (1 - f) + b_ * f
            else: x = v[k]
            P[n][{'translation': 0, 'rotation': 1, 'scale': 2}[path]] = np.array(x, float)
        return P
def worlds(g, P):   # node index → world matrix
    par = parents(g); W = {}
    def w(i):
        if i in W: return W[i]
        M = trs(*P[i]); W[i] = (w(par[i]) @ M) if i in par else M; return W[i]
    for i in range(len(g['nodes'])): w(i)
    return W
