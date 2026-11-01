# kv3_compat.py <in.*_c> <out.*_c>: a CS2 resource file rewritten so the Source 2 Viewer build on this computer (20.0)
# reads it. CS2's October 2026 files (the AUG's weapon_rif_aug.vmdl_c: its DATA, MDAT and RED2 blocks) carry the KV3
# node types 26 / 27 (UINT32_ZERO / UINT32_ONE, no payload: VRF 20.1 "Added support for KeyValues3 types 26 and 27"),
# which 20.0 stops on ("Unknown KVType for variable 'datatype': 26"). Every KV3 block is decompressed (LZ4 / zstd),
# those type bytes swapped for the payload-free INT64_ZERO / INT64_ONE (15 / 16: the same value, read as a number
# either way) and written back uncompressed; the other blocks are copied as they are. Only this computer's copy, in a
# scratch folder: the game's files are never touched. Python 3.14 (compression.zstd), standard library only.
import struct, sys
from compression import zstd

def lz4_block(src, out, size):   # one LZ4 block appended to `out` (bytearray); back-references may reach earlier output (chained blocks)
    i, n, end = 0, len(src), len(out) + size
    while i < n:
        tok = src[i]; i += 1; lit = tok >> 4
        if lit == 15:
            while True:
                b = src[i]; i += 1; lit += b
                if b != 255: break
        out += src[i:i + lit]; i += lit
        if i >= n or len(out) >= end: break
        off = src[i] | src[i + 1] << 8; i += 2; ml = tok & 15
        if ml == 15:
            while True:
                b = src[i]; i += 1; ml += b
                if b != 255: break
        ml += 4; s = len(out) - off
        if off >= ml: out += out[s:s + ml]
        else:
            for k in range(ml): out.append(out[s + k])
    return out

MAP = {26: 15, 27: 16}
def patch_types(t):   # type bytes (a flag byte follows one with 0x80 set: flags are small, never 26 / 27)
    t = bytearray(t); i, n, hits = 0, len(t), 0
    while i < n:
        b = t[i]; low = b & 0x3F
        if low in MAP and not b & 0x40: t[i] = (b & 0x80) | MAP[low]; hits += 1
        i += 2 if b & 0x80 else 1
    return bytes(t), hits

def align(o, a): return (o + a - 1) & ~(a - 1)

def kv3(block):
    magic, = struct.unpack_from('<I', block, 0)
    if magic & 0xFFFFFF00 != 0x4B563300: return block, 0
    ver = magic & 0xFF; o = 4; guid = block[o:o + 16]; o += 16; comp, = struct.unpack_from('<I', block, o); o += 4
    if ver < 2: return block, 0
    dict_id, frame = struct.unpack_from('<HH', block, o); o += 4
    c1, c4, c8, ctypes = struct.unpack_from('<4i', block, o); o += 16; cobj, carr = struct.unpack_from('<HH', block, o); o += 4
    unc_total, cmp_total, cblocks, blob_bytes = struct.unpack_from('<4i', block, o); o += 16
    c2 = blkcs = 0
    if ver >= 4: c2, blkcs = struct.unpack_from('<2i', block, o); o += 8
    v5 = struct.unpack_from('<12i', block, o) if ver >= 5 else None; head_end = o + (48 if ver >= 5 else 0); o = head_end
    if v5: u1, s1, u2, s2 = v5[:4]
    else: u1, s1, u2, s2 = unc_total, cmp_total, 0, 0
    def take(csize, usize, extra=0):
        nonlocal o
        if comp == 0: d = bytes(block[o:o + usize]); o += usize; return d
        if comp == 1: d = bytes(lz4_block(block[o:o + csize], bytearray(), usize)); o += csize; return d
        d = zstd.decompress(bytes(block[o:o + csize])); o += csize; return d
    if comp == 2 and ver < 5: both = take(s1, u1 + blob_bytes); buf1, blobs_pre = both[:u1], both[u1:u1 + blob_bytes]
    else: buf1 = take(s1, u1); blobs_pre = None
    buf2 = take(s2, u2) if ver >= 5 else b''
    hits = 0
    if ver >= 5:   # the types sit in buffer 2 after the object lengths and its 1 / 2 / 4 / 8-byte values
        b1, b2, b4, b8 = v5[4:8]; cobj2 = v5[9]; off = cobj2 * 4
        if b1: off += b1
        if b2: off = align(off, 2) + b2 * 2
        if b4: off = align(off, 4) + b4 * 4
        if b8: off = align(off, 8) + b8 * 8
        t, hits = patch_types(buf2[off:off + ctypes]); buf2 = buf2[:off] + t + buf2[off + ctypes:]
    else:   # in buffer 1 after its values and the strings
        off = 0
        if c1: off += c1
        if c2: off = align(off, 2) + c2 * 2
        at4 = align(off, 4); nstr, = struct.unpack_from('<i', buf1, at4)   # (the strings' count: the first 4-byte value)
        if c4: off = at4 + c4 * 4
        if c8: off = align(off, 8) + c8 * 8
        else: off = align(off, 8)
        s0 = off
        for _ in range(nstr): off = buf1.index(b'\0', off) + 1
        tl = ctypes - off + s0; t, hits = patch_types(buf1[off:off + tl]); buf1 = buf1[:off] + t + buf1[off + tl:]
    blobs = b''
    if cblocks:
        if blobs_pre is not None: blobs = blobs_pre
        elif comp == 0: blobs = bytes(block[o:o + blob_bytes]); o += blob_bytes
        elif comp == 1:   # chained LZ4 frames, their compressed lengths (u16) after the blob lengths and a trailer
            tail = buf2 if ver >= 5 else buf1; lens_at = tail.rindex(struct.pack('<I', 0xFFEEDD00)) + 4   # (the last trailer in the buffer: after it, the frame sizes)
            out = bytearray(); k = lens_at
            while k + 2 <= len(tail) and len(out) < blob_bytes:
                cl, = struct.unpack_from('<H', tail, k); k += 2; lz4_block(block[o:o + cl], out, min(frame, blob_bytes - len(out))); o += cl
            blobs = bytes(out[:blob_bytes])
        else: blobs = zstd.decompress(bytes(block[o:o + (cmp_total - s1 - s2)])); o += cmp_total - s1 - s2
    if not hits: return block, 0
    # written back uncompressed (dictionary id and frame size 0, compressed sizes 0)
    h = bytearray(block[:head_end]); struct.pack_into('<I', h, 20, 0); struct.pack_into('<HH', h, 24, 0, 0)
    struct.pack_into('<i', h, 52, 0 if ver >= 5 else u1)   # (compressed total: before v5 the buffer's own size when uncompressed)
    if ver >= 4: struct.pack_into('<i', h, 68, 0)   # (block compressed sizes)
    if ver >= 5: struct.pack_into('<i', h, 76, 0); struct.pack_into('<i', h, 84, 0)   # (buffers 1 and 2: compressed 0)
    body = bytes(h) + buf1 + buf2 + (blobs + struct.pack('<I', 0xFFEEDD00) if cblocks else b'')
    return body, hits

def main(src, dst):
    b = open(src, 'rb').read(); fs, hv, ver, bo, bc = struct.unpack_from('<IHHII', b, 0); p = 8 + bo
    blocks = []
    for i in range(bc):
        t, rel, size = struct.unpack_from('<4sII', b, p + i * 12); a = p + i * 12 + 4 + rel; data = b[a:a + size]
        nd, hits = kv3(data); blocks.append((t, nd)); print(t.decode(), size, '->', len(nd), 'patched types:', hits) if hits else None
    table = p + bc * 12; out = bytearray(b[:table]); pos = align(table, 16)
    for i, (t, d) in enumerate(blocks):
        out += b'\0' * (pos - len(out)); struct.pack_into('<4sII', out, p + i * 12, t, pos - (p + i * 12 + 4), len(d)); out += d; pos = align(len(out), 16)
    struct.pack_into('<I', out, 0, len(out)); open(dst, 'wb').write(out); print('wrote', dst, len(out))

if __name__ == '__main__': main(*sys.argv[1:3])
