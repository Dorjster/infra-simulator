# install.py <glb> <weapon id> <repo>: copy an authored first-person set into user-assets/fp/cs2_<id>.glb and list it
# in the manifest (new hash: browsers fetch the new file).
import json, shutil, sys, hashlib, os, time
glb, wid, repo = sys.argv[1:4]; ua = os.path.join(repo, 'user-assets'); dst = os.path.join(ua, 'fp', 'cs2_' + wid + '.glb')
shutil.copyfile(glb, dst); mp = os.path.join(ua, 'manifest.json'); m = json.load(open(mp))
m['models'].setdefault('viewmodels', {})['cs2_' + wid] = {'file': 'fp/cs2_' + wid + '.glb', 'from': 'Blender: CS2_MultiRig arms + ' + wid + ' (authored from reference video)', 'bytes': os.path.getsize(dst)}
m['hash'] = hashlib.sha1((m.get('hash', '') + str(time.time())).encode()).hexdigest()[:12]
json.dump(m, open(mp, 'w'), indent=1); print('installed', dst, os.path.getsize(dst), 'hash', m['hash'])
