# Decodes a Source 2 texture (.vtex_c) read from the VPK into a float numpy array (H, W, C), keeping every channel.
# (Source2Viewer-CLI 20.0.6980 decodes BC7 wrongly on macOS and drops channels of packed textures, so this does it:
# LZ4-decompress mip 0, wrap it in a DX10 DDS header and let OpenImageIO decode BC1-7; RGBA8 / RGBA16F directly.)
# Only the file format lives here, no Valve data.
import struct, os, tempfile, numpy as np, OpenImageIO as oiio

FMT = {1: ('DXT1', 8, 71), 2: ('DXT5', 16, 77), 4: ('RGBA8888', 4, None), 20: ('BC7', 16, 98), 19: ('BC6H', 16, 95),
       21: ('ATI2N', 16, 83), 27: ('ATI1N', 8, 80), 10: ('RGBA16161616F', 8, None), 28: ('BGRA8888', 4, None)}   # VRF VTexFormat ids
RAW = ('RGBA8888', 'BGRA8888', 'RGBA16161616F')


def lz4_block(src, outlen):
    dst = bytearray(); i = 0; n = len(src)
    while i < n:
        tok = src[i]; i += 1; ll = tok >> 4
        if ll == 15:
            while True:
                b = src[i]; i += 1; ll += b
                if b != 255: break
        dst += src[i:i + ll]; i += ll
        if i >= n: break
        off = src[i] | (src[i + 1] << 8); i += 2; ml = tok & 15
        if ml == 15:
            while True:
                b = src[i]; i += 1; ml += b
                if b != 255: break
        ml += 4; s = len(dst) - off
        if off >= ml: dst += dst[s:s + ml]
        else:
            for k in range(ml): dst.append(dst[s + k])
    if len(dst) != outlen: raise ValueError(f'lz4 size {len(dst)} != {outlen}')
    return bytes(dst)


def mipsize(fmt, w, h):
    name, bpb, _ = FMT[fmt]
    if name in RAW: return w * h * bpb
    return max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * bpb


def parse(b):
    """-> (format name, w, h, fmt id, mip-0 bytes)"""
    _fsz, _hv, _vv, boff, bcnt = struct.unpack_from('<IHHII', b, 0); blocks = {}
    for k in range(bcnt):
        q = 8 + boff + k * 12; t = b[q:q + 4].decode('latin1'); ro, sz = struct.unpack_from('<II', b, q + 4); blocks[t] = (q + 4 + ro, sz)
    do, dsz = blocks['DATA']
    w, h, dep = struct.unpack_from('<HHH', b, do + 20); fmt, nmip = b[do + 26], b[do + 27]
    if fmt not in FMT: raise ValueError(f'unsupported texture format {fmt}')
    exoff_pos = do + 32; exoff, excnt = struct.unpack_from('<II', b, exoff_pos); q = exoff_pos + exoff; ex = {}
    for k in range(excnt):
        t, ro, _sz = struct.unpack_from('<III', b, q + k * 12); ex[t] = q + k * 12 + 4 + ro
    comp = None
    if 4 in ex:   # COMPRESSED_MIP_SIZE
        e = ex[4]; _a, moff, cnt = struct.unpack_from('<iIi', b, e); comp = list(struct.unpack_from(f'<{cnt}i', b, e + 4 + moff))
    off = do + dsz
    for m in range(nmip - 1, 0, -1):   # mips are stored smallest first
        off += comp[m] if comp else mipsize(fmt, max(1, w >> m), max(1, h >> m)) * max(1, dep)
    raw_len = mipsize(fmt, w, h) * max(1, dep)
    if comp:
        c = comp[0]; data = b[off:off + c]; data = lz4_block(data, raw_len) if c < raw_len else data
    else: data = b[off:off + raw_len]
    return FMT[fmt][0], w, h, fmt, data


def decode(b):
    """vtex_c bytes -> float32 array (H, W, C)"""
    name, w, h, fmt, data = parse(b)
    if name in ('RGBA8888', 'BGRA8888'):
        a = np.frombuffer(data, np.uint8).reshape(h, w, 4).astype(np.float32) / 255
        return a[..., [2, 1, 0, 3]] if name == 'BGRA8888' else a
    if name == 'RGBA16161616F': return np.frombuffer(data, np.float16).reshape(h, w, 4).astype(np.float32)
    dx = FMT[fmt][2]
    hd = struct.pack('<4s7I44s8I5I', b'DDS ', 124, 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, h, w, len(data), 0, 1, b'\0' * 44, 32, 0x4,
                     0x30315844, 0, 0, 0, 0, 0, 0x1000, 0, 0, 0, 0) + struct.pack('<IIIII', dx, 3, 0, 1, 0)
    fd, tmp = tempfile.mkstemp(suffix='.dds')
    try:
        with os.fdopen(fd, 'wb') as f: f.write(hd + data)
        buf = oiio.ImageBuf(tmp); a = buf.get_pixels(oiio.FLOAT)
        if a is None or a.size == 0: raise RuntimeError(oiio.geterror())
        return np.array(a, np.float32)
    finally:
        os.remove(tmp)


def compiled_name(vtex_path):
    """'materials/x/y_psd_1234.vtex' -> 'materials/x/y_psd_1234.vtex_c'"""
    return vtex_path if vtex_path.endswith('_c') else vtex_path + '_c'
