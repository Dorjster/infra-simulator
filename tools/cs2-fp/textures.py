# Blender (background): CS2 texture PNGs (as Source 2 Viewer writes them) → the JPEGs the game reads.
#   blender -b --factory-startup --python textures.py -- <jobs.json>
# jobs: [{out, kind, src, size, ao?}] — kind 'rgb': the picture's colour, its alpha left out (CS2 keeps masks there: the
# AUG's colour map is mostly transparent, flattened over white it came out blank); 'orm': the game's ORM map
# (weapon-models.js: roughness in green, metalness in blue) from CS2's '_rough' map, which carries roughness in red
# and metalness in green (csgo_weapon g_tMetalness), and its ambient occlusion in red when given. At most `size` px.
import bpy, sys, json, numpy as np
jobs = json.load(open(sys.argv[sys.argv.index('--') + 1]))
def px(path, size):
    im = bpy.data.images.load(path); w, h = im.size
    if max(w, h) > size: im.scale(min(size, w * size // max(w, h)), min(size, h * size // max(w, h))); w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im); return a.reshape(h, w, 4), w, h
for j in jobs:
    src, w, h = px(j['src'], j.get('size', 2048)); out = np.ones((h, w, 4), np.float32)
    if j['kind'] == 'rgb': out[..., :3] = src[..., :3]
    else:
        out[..., 1] = src[..., 0]; out[..., 2] = src[..., 1]
        if j.get('ao'): ao, aw, ah = px(j['ao'], max(w, h)); out[..., 0] = ao[..., 0] if (aw, ah) == (w, h) else 1
    im = bpy.data.images.new('t', w, h, alpha=False); im.colorspace_settings.name = 'Non-Color'; im.pixels.foreach_set(out.ravel())
    im.filepath_raw = j['out']; im.file_format = 'JPEG'; bpy.context.scene.render.image_settings.quality = 90; im.save(); bpy.data.images.remove(im); print('TEX', j['out'], w, h)
