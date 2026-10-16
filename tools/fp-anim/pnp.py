# pnp.py <model points json> '<{name: [px, py], ...}>' [video vfov=53.66] [ours vfov=58] [guess json]:
# the gun's pose from landmark pixels (OpenCV PnP at the video's view-model field of view), then moved for ours
# (same picture: depth × tan(v/2)/tan(o/2), x/y kept, about the gun's landmark centroid).
# Prints a 4×4 'cam' matrix: armature-local (x fwd, y down, z left; inches) → camera space (x right, y up, z back).
import cv2, json, sys, numpy as np, math
model = json.load(open(sys.argv[1])); img = json.loads(sys.argv[2]); vf = float(sys.argv[3]) if len(sys.argv) > 3 else 53.66; of = float(sys.argv[4]) if len(sys.argv) > 4 else 58.0
names = [n for n in img if n in model]; P3 = np.array([model[n] for n in names], float); P2 = np.array([img[n] for n in names], float)
f = 540 / math.tan(math.radians(vf / 2)); K = np.array([[f, 0, 960], [0, f, 540], [0, 0, 1]], float)
best = None
for flag in (cv2.SOLVEPNP_SQPNP, cv2.SOLVEPNP_ITERATIVE, cv2.SOLVEPNP_EPNP):
    try:
        ok, rv, tv = cv2.solvePnP(P3, P2, K, None, flags=flag)
        if not ok: continue
        rv, tv = cv2.solvePnPRefineLM(P3, P2, K, None, rv, tv)
        pr, _ = cv2.projectPoints(P3, rv, tv, K, None); err = np.sqrt(((pr.reshape(-1, 2) - P2) ** 2).sum(1))
        if tv[2] > 0 and (best is None or err.mean() < best[2].mean()): best = (rv, tv, err)
    except cv2.error: pass
rv, tv, err = best; R, _ = cv2.Rodrigues(rv); t = tv.reshape(3)
c = R @ P3.mean(0) + t; k = math.tan(math.radians(vf / 2)) / math.tan(math.radians(of / 2)); c2 = np.array([c[0], c[1], c[2] * k]); t2 = c2 - R @ P3.mean(0)
D = np.diag([1, -1, -1]); M = np.eye(4); M[:3, :3] = D @ R; M[:3, 3] = D @ t2
print(json.dumps({'cam': [[round(v, 5) for v in row] for row in M.tolist()], 'err_px': [round(e, 1) for e in err.tolist()], 'names': names, 'depth_video': round(float(c[2]), 2)}))
