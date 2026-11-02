# Resamples an image made in a gun's body_legacy UV0 layout into its body_hd UV0 layout through the lookup that
# legacy_lookup.py bakes (numpy only, ~0.3 s per 1024² map). No Valve data.
import numpy as np
from imglib import dilate, resize


ART_STYLES = (4, 6, 8)   # paint styles CS2 leaves off a second composited material (the SSG 08's scope stays black under
                          # anodized-multicolour, custom and gunsmith finishes in its econ icons; hydrographic / patina paint it)


class Lookup:
    def __init__(self, path, res):
        z = np.load(path); lut = z['lut']
        if lut.shape[0] != res: lut = resize(lut, res)
        self.u, self.v, self.valid = lut[..., 0], lut[..., 1], lut[..., 2] > 0.5
        self.legacy_cover = z['legacy_cover'].astype(bool); self.hd_cover = z['hd_cover'].astype(bool)
        if self.hd_cover.shape[0] != res: self.hd_cover = resize(self.hd_cover[..., None].astype(np.float32), res)[..., 0] > 0.5
        self.stats = z['stats'].tolist()
        # texels CS2 leaves at the gun's base (legacy_lookup.py 'plain' bits; lookups before v4 have none): 1 a second
        # composited legacy material (the SSG 08's scope), 2 a material CS2 never composites (lenses), 4 a minor HD part
        pl = z['plain'] if 'plain' in z.files else np.zeros(lut.shape[:2], np.uint8)
        if pl.shape[0] != res: pl = pl[(np.arange(res) * pl.shape[0]) // res][:, (np.arange(res) * pl.shape[1]) // res]   # (nearest: bit flags)
        self.plain = pl.astype(np.uint8)

    def keep(self, legacy, style):
        """coverage multiplier (res, res) for a finish: 0 where CS2 shows the gun's own base instead of this finish's paint"""
        drop = 4 | ((2 | (1 if style in ART_STYLES else 0)) if legacy else 0)
        return ((self.plain & drop) == 0).astype(np.float32)

    def pad_legacy(self, img, steps=6):
        """grow a legacy-layout image past its UV islands so bilinear lookups at island edges do not pick up the background"""
        cov = self.legacy_cover
        if cov.shape[0] != img.shape[0]: cov = resize(cov[..., None].astype(np.float32), img.shape[1], img.shape[0])[..., 0] > 0.5
        out, _ = dilate(img, cov, steps); return out

    def apply(self, img):
        """legacy-layout image (H, W, C) -> HD-layout image at the lookup's resolution (bilinear, wrapping)"""
        h, w = img.shape[:2]; x = self.u * w - 0.5; y = self.v * h - 0.5
        x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
        x1 = (x0 + 1) % w; y1 = (y0 + 1) % h; x0 %= w; y0 %= h
        out = (img[y0, x0] * (1 - fx) + img[y0, x1] * fx) * (1 - fy) + (img[y1, x0] * (1 - fx) + img[y1, x1] * fx) * fy
        return out.astype(np.float32)
