# Decodes the small extra files of the CS2 finishes import from the user's own CS2 install: the picker icons (CS2's
# econ images, downscaled) and the shared grunge texture used for wear dirt.
# usage (Blender's python, -I): extras.py <job.json>   job: {vpk, items:[{src, out, w, h}]}
#   .webp / .png keep alpha; .jpg is flattened to RGB. A finished file is kept (re-runs skip it) unless job.force.
# Prints one "RESULT {json}" per item. Only identifiers and logic live here; every image is read from the install.
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vpk import VPK
import vtex
from imglib import resize, save, rgb

job = json.load(open(sys.argv[1])); V = VPK(job['vpk'])
for it in job['items']:
    out = it['out']
    if not job.get('force') and os.path.exists(out):
        print('RESULT ' + json.dumps(dict(out=out, ok=True, kept=True)), flush=True); continue
    try:
        a = vtex.decode(V.read(vtex.compiled_name(it['src'])))
        if it.get('w'): a = resize(a, int(it['w']), int(it.get('h') or it['w']))
        if out.endswith('.jpg') or a.shape[2] < 4: a = rgb(a)
        os.makedirs(os.path.dirname(out), exist_ok=True); tmp = out + '.tmp' + os.path.splitext(out)[1]
        save(tmp, a, quality=int(it.get('q', 88))); os.replace(tmp, out)
        r = dict(out=out, ok=True)
    except Exception as ex:
        r = dict(out=out, ok=False, error=f'{type(ex).__name__}: {ex}')
    print('RESULT ' + json.dumps(r), flush=True)
