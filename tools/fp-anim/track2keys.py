# Tracked gun poses (video camera) → author.py gun keys ('cam': model → our camera space, depth matched to our field
# of view so the gun covers the same part of the picture). Usage: track2keys.py <poses.json> <from s> <to s> <clip start t> [step frames] [our vfov]
import json, sys, math, numpy as np, cv2
P = json.load(open(sys.argv[1])); a, b, t0 = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]); step = int(sys.argv[5]) if len(sys.argv) > 5 else 2; OF = float(sys.argv[6]) if len(sys.argv) > 6 else 58.0
k = math.tan(math.radians(P['vfov'] / 2)) / math.tan(math.radians(OF / 2)); C = np.array([5.0, -2.0, 0.0])   # (C: about the gun's middle, model frame)
# Smoothed first (tracking noise ~1° per frame): rotations as quaternions (sign kept continuous), positions, both
# under a Gaussian over ~5 frames each side.
from scipy.spatial.transform import Rotation as Rot
from scipy.ndimage import gaussian_filter1d
sel = [r for r in P['poses'] if a - 1e-6 <= r['t'] <= b + 1e-6]
Q = Rot.from_rotvec([r['rvec'] for r in sel]).as_quat()
for i in range(1, len(Q)):
    if np.dot(Q[i], Q[i - 1]) < 0: Q[i] = -Q[i]
SIG = float(__import__('os').environ.get('SIGMA', 3)); Qs = gaussian_filter1d(Q, SIG, axis=0, mode='nearest'); Ts = gaussian_filter1d(np.array([r['tvec'] for r in sel]), SIG, axis=0, mode='nearest')
Rs = Rot.from_quat(Qs / np.linalg.norm(Qs, axis=1, keepdims=True)).as_matrix()
keys = []
for i in range(0, len(sel), step):
    r = sel[i]; R = Rs[i]; t = Ts[i]; c = R @ C + t; t2 = t + np.array([0, 0, c[2] * (k - 1)])
    D = np.diag([1, -1, -1]); M = np.eye(4); M[:3, :3] = D @ R; M[:3, 3] = D @ t2
    keys.append({'t': round(r['t'] - a + t0, 4), 'gun': {'cam': [[round(v, 5) for v in row] for row in M.tolist()]}})
print(json.dumps(keys))
