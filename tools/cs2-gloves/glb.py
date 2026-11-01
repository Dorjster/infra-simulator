# glTF binary (.glb) reading and writing for the glove importer: accessors as numpy arrays, a small writer that packs
# buffers, accessors, images and textures. Only the container format lives here, no Valve data.
import json, struct, numpy as np

CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read(p):
    """-> (json, binary chunk)"""
    b = open(p, 'rb').read()
    if b[:4] != b'glTF': raise ValueError('not a glb: ' + p)
    n = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + n]); rest = b[20 + n:]
    return J, (rest[8:8 + struct.unpack('<I', rest[:4])[0]] if len(rest) >= 8 else b'')


def acc(J, B, i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; dt = CT[a['componentType']]; nc = NC[a['type']]; isz = np.dtype(dt).itemsize * nc
    st = bv.get('byteStride') or isz; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); raw = B[off:off + st * (a['count'] - 1) + isz] + b'\0' * (st - isz)
    arr = np.frombuffer(raw, np.uint8).reshape(a['count'], st)[:, :isz].copy().view(dt).reshape(a['count'], nc)
    return arr.astype(np.float32) / np.iinfo(dt).max if a.get('normalized') else arr


def image_bytes(J, B, tex_index):
    im = J['images'][J['textures'][tex_index]['source']]; bv = J['bufferViews'][im['bufferView']]
    o = bv.get('byteOffset', 0); return B[o:o + bv['byteLength']], im.get('mimeType')


class Writer:
    def __init__(self, generator):
        self.J = {'asset': {'version': '2.0', 'generator': generator}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'root', 'children': []}],
                  'meshes': [], 'skins': [], 'accessors': [], 'bufferViews': [], 'buffers': [], 'materials': [], 'textures': [], 'images': [],
                  'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]}
        self.BIN = bytearray()

    def view(self, b, target=None):
        while len(self.BIN) % 4: self.BIN.append(0)
        o = len(self.BIN); self.BIN.extend(b); v = {'buffer': 0, 'byteOffset': o, 'byteLength': len(b)}
        if target: v['target'] = target
        self.J['bufferViews'].append(v); return len(self.J['bufferViews']) - 1

    def acc(self, arr, typ, comp=5126, target=34962, minmax=False):
        arr = np.ascontiguousarray(arr); a = {'bufferView': self.view(arr.tobytes(), target), 'componentType': comp, 'count': len(arr), 'type': typ}
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        self.J['accessors'].append(a); return len(self.J['accessors']) - 1

    def tex(self, b, mime):
        self.J['images'].append({'bufferView': self.view(b), 'mimeType': mime}); self.J['textures'].append({'source': len(self.J['images']) - 1, 'sampler': 0}); return len(self.J['textures']) - 1

    def node(self, nd, parent=0):
        self.J['nodes'].append(nd); i = len(self.J['nodes']) - 1; self.J['nodes'][parent].setdefault('children', []).append(i); return i

    def bytes(self):
        while len(self.BIN) % 4: self.BIN.append(0)
        J = dict(self.J); J['buffers'] = [{'byteLength': len(self.BIN)}]
        for k in ('materials', 'textures', 'images', 'skins', 'samplers'):
            if not J[k]: del J[k]
        if 'textures' not in J: J.pop('samplers', None)
        js = json.dumps(J, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        return struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(self.BIN), 0x004E4942) + bytes(self.BIN)
