# Reads files straight out of the user's own CS2 install (a VPK v2 directory, pak01_dir.vpk + pak01_NNN.vpk archives).
# Read only. Every file read is CRC-checked: a partly downloaded install (archives of zeros) is reported, never baked.
# No Valve data lives in this file: only the container format.
import struct, os, zlib


class VPK:
    def __init__(self, dir_path):
        self.dir_path = dir_path; self.base = dir_path[:-len('_dir.vpk')] if dir_path.endswith('_dir.vpk') else dir_path
        with open(dir_path, 'rb') as f: d = f.read()
        sig, ver, tree = struct.unpack_from('<III', d, 0)
        if sig != 0x55aa1234: raise ValueError('not a VPK directory: ' + dir_path)
        o = 28 if ver == 2 else 12; end = o + tree; self.hdr = end; self.d = d; self.index = {}
        def cstr(o):
            e = d.index(b'\0', o); return d[o:e].decode('utf-8', 'replace'), e + 1
        while o < end:
            ext, o = cstr(o)
            if not ext: break
            while True:
                path, o = cstr(o)
                if not path: break
                while True:
                    name, o = cstr(o)
                    if not name: break
                    crc, pre, arch, off, ln, _term = struct.unpack_from('<IHHIIH', d, o); o2 = o + 18
                    full = (f'{path}/{name}.{ext}' if path.strip() else f'{name}.{ext}')
                    self.index[full] = (crc, arch, off, ln, d[o2:o2 + pre]); o = o2 + pre

    def has(self, p): return p in self.index

    def size(self, p):
        crc, arch, off, ln, pre = self.index[p]; return ln + len(pre)

    def read(self, p, check=True):
        crc, arch, off, ln, pre = self.index[p]
        if arch == 0x7fff: data = pre + self.d[self.hdr + off:self.hdr + off + ln]
        else:
            with open(f'{self.base}_{arch:03d}.vpk', 'rb') as f: f.seek(off); data = pre + f.read(ln)
        if check and (zlib.crc32(data) & 0xffffffff) != crc: raise IOError('CRC mismatch (file missing from this install?): ' + p)
        return data

    def find(self, prefix='', suffix=''):
        return [p for p in self.index if p.startswith(prefix) and p.endswith(suffix)]
