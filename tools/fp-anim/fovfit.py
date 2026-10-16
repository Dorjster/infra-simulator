# The video's field of view from several landmark frames at once (focal length shared, a pose per frame).
import json, sys, math, numpy as np, cv2
from scipy.optimize import least_squares
sets = json.loads(sys.argv[1])   # [[{name:[x,y,z]}, {name:[px,py]}], ...]
def proj(f, rv, tv, A):
    K = np.array([[f, 0, 960], [0, f, 540], [0, 0, 1.]]); p, _ = cv2.projectPoints(A, rv, tv, K, None); return p.reshape(-1, 2)
data = []
for M3, I2 in sets:
    n = [k for k in I2 if k in M3]; data.append((np.array([M3[k] for k in n], float), np.array([I2[k] for k in n], float)))
for vf in (40, 47, 53.66, 60, 68, 75):
    f0 = 540 / math.tan(math.radians(vf / 2)); x0 = [f0]
    for A, B in data:
        K = np.array([[f0, 0, 960], [0, f0, 540], [0, 0, 1.]]); ok, rv, tv = cv2.solvePnP(A, B, K, None, flags=cv2.SOLVEPNP_SQPNP); x0 += list(rv.ravel()) + list(tv.ravel())
    def res(x):
        r = []
        for i, (A, B) in enumerate(data): r.append((proj(x[0], np.array(x[1 + 6 * i:4 + 6 * i]), np.array(x[4 + 6 * i:7 + 6 * i]), A) - B).ravel())
        return np.concatenate(r)
    s = least_squares(res, x0, loss='soft_l1', f_scale=6)
    print('start %5.1f → vfov %.2f  rms %.1f px' % (vf, 2 * math.degrees(math.atan(540 / s.x[0])), math.sqrt(np.mean(s.fun ** 2))))
