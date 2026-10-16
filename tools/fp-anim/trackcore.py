import cv2, math, subprocess, numpy as np
from scipy.optimize import minimize
W, H, FPS = 1920, 1080, 60
VF = globals().get('VF', 53.66); f = (H / 2) / math.tan(math.radians(VF / 2)); K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]], float)
m = np.load(meshf); V, N, F = m['V'].astype(np.float64), m['N'], m['F']; VL, FL = (m['VL'], m['FL']) if 'VL' in m else (V, F)
def frame_at(vid, t):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.4f}', '-i', vid, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(H, W)
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
def edge_cost(dt, rv, tv):
    c = silhouette_pts(rv, tv)
    if c is None: return 9.0
    return float(np.mean(np.minimum(dt[c[:, 1], c[:, 0]], 6.0)))
