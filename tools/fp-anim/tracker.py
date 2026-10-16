# Model-based tracking of a gun through a video section. The pose at one frame comes from landmark pixels (PnP); from
# there, frame by frame (both ways): the model's visible, textured points are projected with the last pose, followed
# into the next frame (pyramidal Lucas-Kanade, forward-backward checked), and the pose re-solved from them (RANSAC
# PnP, then refined on the inliers). Writes every frame's pose (video camera: x right, y down, z forward; model:
# armature frame, inches) and an overlay sheet to check it.
# Usage: tracker.py <video> <mesh.npz> <model landmarks.json> '<{name:[px,py]}>' <init t> <t0> <t1> <out prefix> [vfov]
import cv2, json, math, subprocess, sys, numpy as np
vid, meshf, modelf, lmk, t_init, t0, t1, out = sys.argv[1:9]; t_init, t0, t1 = float(t_init), float(t0), float(t1); VF = float(sys.argv[9]) if len(sys.argv) > 9 else 53.66
W, H, FPS = 1920, 1080, 60
import os; EDGES = os.environ.get('EDGES', '1') == '1'
f = (H / 2) / math.tan(math.radians(VF / 2)); K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]], float)
m = np.load(meshf); V, N, F = m['V'].astype(np.float64), m['N'], m['F']; VL, FL = (m['VL'], m['FL']) if 'VL' in m else (V, F)
def frames(a, b):   # gray frames a..b (seconds) at 60 fps
    n = round((b - a) * FPS) + 1
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', f'{a:.4f}', '-i', vid, '-frames:v', str(n), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
    out_ = []
    for i in range(n):
        buf = p.stdout.read(W * H)
        if len(buf) < W * H: break
        out_.append(np.frombuffer(buf, np.uint8).reshape(H, W))
    p.wait(); return out_
model = json.load(open(modelf)); img = json.loads(lmk); names = [k for k in img if k in model]
ok, rv, tv = cv2.solvePnP(np.array([model[k] for k in names], float), np.array([img[k] for k in names], float), K, None, flags=cv2.SOLVEPNP_SQPNP)
rv, tv = cv2.solvePnPRefineLM(np.array([model[k] for k in names], float), np.array([img[k] for k in names], float), K, None, rv, tv)
def visible(rv, tv):   # vertex indices facing the camera, inside the picture
    R, _ = cv2.Rodrigues(rv); Pc = V @ R.T + tv.reshape(3); Nc = N @ R.T
    facing = (Nc * Pc).sum(1) < -0.05 * np.linalg.norm(Pc, axis=1)
    uv = Pc[:, :2] / Pc[:, 2:3] * f + [W / 2, H / 2]
    ins = (uv[:, 0] > 8) & (uv[:, 0] < W - 8) & (uv[:, 1] > 8) & (uv[:, 1] < H - 8) & (Pc[:, 2] > 1)
    return np.where(facing & ins)[0], uv
def pick(gray, idx, uv, nmax=400):   # textured ones, spread out (one per 12 px cell)
    if not len(idx): return idx
    eig = cv2.cornerMinEigenVal(gray, 5); q = uv[idx].astype(int); s = eig[q[:, 1], q[:, 0]]
    order = idx[np.argsort(-s)]; seen = set(); keep = []
    for i in order:
        c = (int(uv[i, 0]) // 12, int(uv[i, 1]) // 12)
        if c in seen: continue
        seen.add(c); keep.append(i)
        if len(keep) >= nmax: break
    keep = np.array(keep); return keep[eig[uv[keep, 1].astype(int), uv[keep, 0].astype(int)] > 1e-4] if len(keep) else keep
from scipy.optimize import minimize
def silhouette_pts(rv, tv, n=200):   # the model's outline in the half-size picture (sampled), from the low-poly copy
    R, _ = cv2.Rodrigues(np.asarray(rv, float)); Pc = VL @ R.T + np.asarray(tv, float).reshape(3)
    if (Pc[:, 2] < 1).any(): return None
    uv = (Pc[:, :2] / Pc[:, 2:3] * f / 2 + [W / 4, H / 4]).astype(np.int32); x0, y0 = np.clip(uv.min(0) - 3, 0, [W // 2 - 1, H // 2 - 1]); x1, y1 = np.clip(uv.max(0) + 3, 1, [W // 2, H // 2])
    if x1 - x0 < 4 or y1 - y0 < 4: return None
    mask = np.zeros((y1 - y0, x1 - x0), np.uint8); cv2.fillPoly(mask, list(uv[FL] - [x0, y0]), 255)
    cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs: return None
    c = max(cs, key=len).reshape(-1, 2) + [x0, y0]; c = c[(c[:, 0] > 1) & (c[:, 0] < W // 2 - 2) & (c[:, 1] > 1) & (c[:, 1] < H // 2 - 2)]
    return c[np.linspace(0, len(c) - 1, min(n, len(c))).astype(int)] if len(c) > 15 else None
def edge_dt(gray):   # distance (half-size px) to the nearest edge of the frame, capped
    g = cv2.resize(gray, (W // 2, H // 2), interpolation=cv2.INTER_AREA); e = cv2.Canny(cv2.GaussianBlur(g, (3, 3), .8), 40, 110); return np.minimum(cv2.distanceTransform(255 - e, cv2.DIST_L2, 3), 15.0)
def refine_edges(gray, rv, tv, dt=None):   # the pose nudged so its outline lies on the frame's edges (the robust mean distance)
    dt = edge_dt(gray) if dt is None else dt; x0 = np.concatenate([rv.ravel(), tv.ravel()])
    def cost(x):
        c = silhouette_pts(x[:3], x[3:])
        if c is None: return 25.0
        d = dt[c[:, 1], c[:, 0]]; return float(np.mean(np.minimum(d, 6.0))) + 0.002 * float(np.sum(((x - x0) * [40, 40, 40, 1, 1, 1]) ** 2))
    r = minimize(cost, x0, method='Powell', options={'xtol': 1e-3, 'ftol': 1e-3, 'maxfev': 250}); x = r.x
    return x[:3].reshape(3, 1), x[3:].reshape(3, 1), r.fun
LK = dict(winSize=(25, 25), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, .01))
def seed(gray, rv, tv, have2d, nmax=300):   # new points: visible model vertices at real corners, away from points already tracked
    idx, uv = visible(rv, tv)
    if not len(idx): return np.zeros((0, 3)), np.zeros((0, 2), np.float32)
    eig = cv2.cornerMinEigenVal(gray, 5); q = uv[idx].astype(int); s_ = eig[q[:, 1], q[:, 0]]; thr = max(1e-3, np.percentile(s_, 70) if len(s_) else 1)
    order = idx[np.argsort(-s_)]; occ = set((int(x) // 14, int(y) // 14) for x, y in have2d); keep = []
    for i in order:
        if eig[int(uv[i, 1]), int(uv[i, 0])] < thr: break
        c = (int(uv[i, 0]) // 14, int(uv[i, 1]) // 14)
        if c in occ: continue
        occ.add(c); keep.append(i)
        if len(keep) >= nmax: break
    keep = np.array(keep, int); return V[keep], uv[keep].astype(np.float32)
def run(seq, rv, tv):   # the same points followed frame to frame, each tied to its model point when it was first seen
    poses = [(rv.copy(), tv.copy(), 999, 0)]; P3, P2 = seed(seq[0], rv, tv, [])
    for k, (a, b) in enumerate(zip(seq, seq[1:])):
        if len(P3) >= 8:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(a, b, P2.reshape(-1, 1, 2), None, **LK); pb, st2, _ = cv2.calcOpticalFlowPyrLK(b, a, p1, None, **LK)
            good = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm((pb - P2.reshape(-1, 1, 2)).reshape(-1, 2), axis=1) < 0.8)
            P3, P2 = P3[good], p1.reshape(-1, 2)[good]
        ninl = 0
        if len(P3) >= 8:
            ok, r2, t2, inl = cv2.solvePnPRansac(P3, P2, K, None, rv.copy(), tv.copy(), useExtrinsicGuess=True, reprojectionError=2.5, iterationsCount=200, confidence=.995)
            if ok and inl is not None and len(inl) >= 8:
                sel = inl.ravel(); r2, t2 = cv2.solvePnPRefineLM(P3[sel], P2[sel], K, None, r2, t2); rv, tv = r2, t2; P3, P2 = P3[sel], P2[sel]; ninl = len(sel)
        if len(P3) < 150 or k % 30 == 29:   # top up with new points (tied with the pose just found)
            n3, n2 = seed(b, rv, tv, P2, 300 - len(P3)); P3 = np.vstack([P3, n3]) if len(n3) else P3; P2 = np.vstack([P2, n2]) if len(n2) else P2
        poses.append((rv.copy(), tv.copy(), len(P3), ninl))
    return poses
allf = frames(t0, t1); i0 = round((t_init - t0) * FPS)
fwd = run(allf[i0:], rv, tv); bwd = run(allf[i0::-1], rv, tv)
poses = bwd[::-1][:-1] + fwd
res = [{'t': round(t0 + i / FPS, 4), 'rvec': p[0].ravel().tolist(), 'tvec': p[1].ravel().tolist(), 'tracked': p[2], 'inliers': p[3]} for i, p in enumerate(poses)]
json.dump({'K': K.tolist(), 'vfov': VF, 'poses': res}, open(out + '.json', 'w')); print('POSES', len(res), 'min inliers', min(r['inliers'] for r in res if r['inliers'] != 0) if any(r['inliers'] for r in res) else 0)
# Overlay sheet: the model's visible points on the frame, every 0.25 s.
tiles = []
for i in range(0, len(res), 15):
    r = res[i]; rv_, tv_ = np.array(r['rvec']), np.array(r['tvec']); idx, uv = visible(rv_, tv_); im = cv2.cvtColor(allf[i], cv2.COLOR_GRAY2BGR)
    for j in idx[::4]: cv2.circle(im, (int(uv[j, 0]), int(uv[j, 1])), 2, (0, 255, 0), -1)
    cv2.putText(im, f"t={r['t']:.2f} in={r['inliers']}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 255, 255), 3); tiles.append(cv2.resize(im, (480, 270)))
while len(tiles) % 6: tiles.append(np.zeros_like(tiles[0]))
rows = [np.hstack(tiles[k:k + 6]) for k in range(0, len(tiles), 6)]; cv2.imwrite(out + '_sheet.jpg', np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 80])
