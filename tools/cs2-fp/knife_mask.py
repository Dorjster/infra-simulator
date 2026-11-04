# knife_mask.py <knife model folder, e.g. knife_bayonet> <out.png> (v53 KNIVES; Blender's Python: numpy, OpenImageIO):
# CS2's own paint coverage of a knife — the red channel of its composite inputs' masks texture
# (weapons/models/knife/<dir>/materials/composite_inputs/<dir>_masks_psd_*.vtex: 1 where a finish paints, 0 the handle CS2
# leaves unpainted; tools/cs2-skins/bake.py reads the same channel as a knife's coverage) → an 8-bit grey PNG in the
# model's UV0. build_set.py --blade-mask samples it per vertex for the set's blade mask (vertex colours), so a knife
# with no 'blade' bone (the Bayonet, Skeleton, Talon) gets CS2's blade, not a guess along its length. Read straight from
# the user's install (tools/cs2-skins/vpk.py, vtex.py); Valve's: the PNG stays on this computer.
# (v53 KNIVES final) The PNG's green channel is the same texture's green: CS2's own handle region (the Bayonet's ribbed
# grip, the Talon's scales, the Flip's and the Nomad's grips; the Skeleton has none). build_set.py marks the parts that
# are neither — bare steel CS2 leaves unpainted: the Bayonet's crossguard, muzzle ring and pommel, rivets, the Talon's
# ring — so the black-handle rule blackens only CS2's handle and the steel keeps CS2's base material.
import os, sys, numpy as np, OpenImageIO as oiio
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cs2-skins'))
from vpk import VPK; from vtex import decode
d, out = sys.argv[1:3]; V = VPK(os.path.expanduser('~/CS2-extract/game/game/csgo/pak01_dir.vpk'))
hits = [p for p in V.find(f'weapons/models/knife/{d}/materials/composite_inputs/', '.vtex_c') if '_masks_' in p]   # (named after the folder — knife_bayonet_masks_… — or not: the Talon's are knife_widowmaker_masks_…)
if not hits: sys.exit(f'{d}: no composite masks in the install')
a = decode(V.read(sorted(hits)[0])); r = np.clip(a[..., 0], 0, 1); g = np.clip(a[..., 1], 0, 1); h, w = r.shape
o = oiio.ImageBuf(oiio.ImageSpec(w, h, 3, oiio.UINT8)); o.set_pixels(oiio.ROI(), (np.stack([r, g, np.zeros_like(r)], -1) * 255 + .5).astype(np.uint8)); o.write(out)
print(out, f'{w}x{h}', 'painted share %.2f' % float((r > .5).mean()), 'handle share %.2f' % float(((g > .5) & (r <= .5)).mean()))
