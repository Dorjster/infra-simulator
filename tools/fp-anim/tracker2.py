# Model-based gun tracking with several anchors (frames whose pose comes from landmark pixels). Each anchor is tracked
# forward to the next and back to the one before (the same points followed from frame to frame, each tied to its model
# point when first seen; RANSAC PnP); between two anchors the two tracks are blended (the nearer anchor counts more; a
# track that lost the gun counts not at all). Usage: tracker2.py <video> <mesh.npz> <anchors.json> <t0> <t1> <out> [vfov]
import json, sys, numpy as np, cv2, subprocess
from scipy.spatial.transform import Rotation as Rot, Slerp
vid, meshf, anchf, t0, t1, out = sys.argv[1:7]; t0, t1 = float(t0), float(t1); VF = float(sys.argv[7]) if len(sys.argv) > 7 else 57.0
exec(open(sys.argv[0].replace('tracker2.py', 'trackcore.py')).read())
src = open(sys.argv[0].replace('tracker2.py', 'tracker.py')).read(); a = src.index('def visible('); b = src.index('allf = frames(t0, t1)')
exec(src[src.index('def frames('):src.index('model = json.load')]); exec(src[a:src.index('from scipy.optimize')]); exec(src[src.index('LK = dict('):b])
def solve(an):
    A = np.array([an['model'][k] for k in an['image']], float); B = np.array([an['image'][k] for k in an['image']], float)
    ok, rv, tv = cv2.solvePnP(A, B, K, None, flags=cv2.SOLVEPNP_SQPNP); rv, tv = cv2.solvePnPRefineLM(A, B, K, None, rv, tv)
    pr, _ = cv2.projectPoints(A, rv, tv, K, None); print('anchor', an['t'], 'err', np.round(np.linalg.norm(pr.reshape(-1, 2) - B, axis=1), 1).tolist()); return rv, tv
anchors = sorted(json.load(open(anchf)), key=lambda x: x['t']); allf = frames(t0, t1); n = len(allf); idx = lambda t: max(0, min(n - 1, round((t - t0) * FPS)))
tracks = []   # (anchor frame index, direction, poses per frame index)
for k, an in enumerate(anchors):
    rv, tv = solve(an); i = idx(an['t']); lo = idx(anchors[k - 1]['t']) if k > 0 else 0; hi = idx(anchors[k + 1]['t']) if k + 1 < len(anchors) else n - 1
    f_ = run(allf[i:hi + 1], rv, tv); b_ = run(allf[lo:i + 1][::-1], rv, tv)
    tracks.append({i + j: p for j, p in enumerate(f_)}); tracks[-1].update({i - j: p for j, p in enumerate(b_)}); tracks[-1]['_i'] = i
res = []
for j in range(n):
    cand = []
    for tr in tracks:
        if j in tr and tr[j][3] >= 12 or j == tr['_i']: cand.append((1.0 / (1 + abs(j - tr['_i'])), tr[j]))
    if not cand: cand = [(1.0, min(((abs(j - tr['_i']), tr.get(j)) for tr in tracks if j in tr), key=lambda z: z[0])[1])]
    cand.sort(key=lambda c: -c[0]); cand = cand[:2]; wsum = sum(c[0] for c in cand)
    if len(cand) == 1: rv, tv = cand[0][1][0], cand[0][1][1]
    else:
        w = cand[1][0] / wsum; R0, R1 = Rot.from_rotvec(cand[0][1][0].ravel()), Rot.from_rotvec(cand[1][1][0].ravel())
        rv = Slerp([0, 1], Rot.concatenate([R0, R1]))(w).as_rotvec().reshape(3, 1); tv = cand[0][1][1] * (1 - w) + cand[1][1][1] * w
    res.append({'t': round(t0 + j / FPS, 4), 'rvec': np.ravel(rv).tolist(), 'tvec': np.ravel(tv).tolist(), 'inliers': int(cand[0][1][3])})
json.dump({'K': K.tolist(), 'vfov': VF, 'poses': res}, open(out + '.json', 'w')); print('POSES', len(res))
