# Source 2 textures for the glove bakes: tools/cs2-skins/vtex.py (read-only reuse) plus the 8-bit single-channel format
# newer glove ID maps use (VTexFormat 33: one byte per texel, LZ4 like the rest), with a per-process cache.
# Only the file format lives here, no Valve data.
import os, sys, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(1, os.path.join(os.path.dirname(HERE), 'cs2-skins'))
import vtex

R8 = 'R8_33'
if 33 not in vtex.FMT:
    vtex.FMT[33] = (R8, 1, None)
    vtex.RAW = tuple(vtex.RAW) + (R8,)
_cache = {}


def decode(b):
    name, w, h, fmt, data = vtex.parse(b)
    if name == R8: return (np.frombuffer(data, np.uint8)[:w * h].reshape(h, w, 1).astype(np.float32) / 255)
    return vtex.decode(b)


def load(v, path):
    """vtex path (with or without _c) from the VPK -> float32 (H, W, C), cached"""
    p = vtex.compiled_name(path.replace('\\', '/'))
    if p not in _cache:
        if len(_cache) > 48: _cache.pop(next(iter(_cache)))
        _cache[p] = decode(v.read(p))
    return _cache[p]
