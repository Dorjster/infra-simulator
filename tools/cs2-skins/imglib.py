# Image helpers (OpenImageIO + numpy, both in Blender's Python). No Valve data.
import os, struct, numpy as np, OpenImageIO as oiio
oiio.attribute('threads', int(os.environ.get('CS2_SKINS_THREADS', '1')))   # one thread per bake process: the tool runs --jobs processes under nice


def load(p):
    cfg = oiio.ImageSpec(); cfg.attribute('oiio:UnassociatedAlpha', 1); b = oiio.ImageBuf(p, 0, 0, cfg)
    a = b.get_pixels(oiio.FLOAT)
    if a is None or a.size == 0: raise RuntimeError('cannot read ' + p + ': ' + oiio.geterror())
    return np.array(a, np.float32)


def resize(a, w, h=None):
    h = h or w
    if a.shape[1] == w and a.shape[0] == h: return a
    src = oiio.ImageBuf(np.ascontiguousarray(a.astype(np.float32)))
    dst = oiio.ImageBufAlgo.resize(src, roi=oiio.ROI(0, w, 0, h, 0, 1, 0, a.shape[2]))
    return np.array(dst.get_pixels(oiio.FLOAT), np.float32)


def save(p, a, bits=oiio.UINT8, quality=90):
    a = np.ascontiguousarray(np.clip(a, 0, 1).astype(np.float32)) if bits == oiio.UINT8 else np.ascontiguousarray(a.astype(np.float32))
    if a.ndim == 2: a = a[..., None]
    h, w, c = a.shape; spec = oiio.ImageSpec(w, h, c, bits); spec.attribute('oiio:UnassociatedAlpha', 1)
    if p.endswith('.jpg'): spec.attribute('Compression', f'jpeg:{quality}')
    if p.endswith('.webp'): spec.attribute('Compression', f'webp:{quality}')
    o = oiio.ImageOutput.create(p)
    if o is None: raise RuntimeError('no writer for ' + p)
    o.open(p, spec); o.write_image(a); o.close()
    if p.endswith('.png'): strip_png(p)


KEEP_CHUNKS = (b'IHDR', b'PLTE', b'tRNS', b'IDAT', b'IEND')


def strip_png(p):
    """drop every ancillary chunk (sRGB, gAMA, cHRM, iCCP, eXIf, oFFs, text…): the PNGs are data (the mrw maps), so no
    decoder may colour-manage them; only IHDR, PLTE, tRNS, IDAT and IEND are kept (each chunk keeps its own CRC)"""
    b = open(p, 'rb').read()
    if b[:8] != b'\x89PNG\r\n\x1a\n': raise RuntimeError('not a PNG: ' + p)
    out, i = [b[:8]], 8
    while i + 12 <= len(b):
        n = struct.unpack('>I', b[i:i + 4])[0]; t = b[i + 4:i + 8]; end = i + 12 + n
        if t in KEEP_CHUNKS: out.append(b[i:end])
        i = end
        if t == b'IEND': break
    tmp = p + '.strip'; open(tmp, 'wb').write(b''.join(out)); os.replace(tmp, p)


def rgb(a):
    if a.shape[2] >= 3: return a[..., :3]
    return a[..., :1].repeat(3, 2)


def chan(a, i, default=0.0):
    return a[..., i] if a.shape[2] > i else np.full(a.shape[:2], default, np.float32)


def srgb2lin(c): c = np.asarray(c, np.float32); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin2srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def smooth(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def dilate(a, valid, steps=8):
    """push colours of valid texels outward into invalid ones (UV-island padding against mip/bilinear seams)"""
    a = a.copy(); v = valid.astype(bool).copy()
    for _ in range(steps):
        if v.all(): break
        acc = np.zeros_like(a); n = np.zeros(v.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sv = np.roll(np.roll(v, dy, 0), dx, 1); sa = np.roll(np.roll(a, dy, 0), dx, 1)
            acc += sa * sv[..., None]; n += sv
        grow = (~v) & (n > 0); a[grow] = acc[grow] / n[grow][..., None]; v |= grow
    return a, v
