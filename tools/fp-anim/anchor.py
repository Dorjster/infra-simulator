# anchor.py <video> <t> <mesh.npz> '<{name:[x,y,z]}>' '<{name:[px,py]}>' <out.jpg> [crop x0,y0,x1,y1]: the gun's pose in one frame from
# landmarks (PnP), its outline drawn on the frame to check; prints the pose.
import sys, json, numpy as np, cv2
vid, t, meshf, mj, ij, out = sys.argv[1:7]; t = float(t); crop = [int(v) for v in sys.argv[7].split(',')] if len(sys.argv) > 7 else None
exec(open(sys.argv[0].replace('anchor.py', 'trackcore.py')).read())
M3 = json.loads(mj); I2 = json.loads(ij); names = [k for k in I2 if k in M3]; A = np.array([M3[k] for k in names], float); B = np.array([I2[k] for k in names], float)
best = None
for flag in (cv2.SOLVEPNP_SQPNP, cv2.SOLVEPNP_EPNP, cv2.SOLVEPNP_ITERATIVE):
    try:
        ok, rv, tv = cv2.solvePnP(A, B, K, None, flags=flag)
        if not ok or tv[2] <= 0: continue
        rv, tv = cv2.solvePnPRefineLM(A, B, K, None, rv, tv); pr, _ = cv2.projectPoints(A, rv, tv, K, None); e = np.linalg.norm(pr.reshape(-1, 2) - B, axis=1)
        if best is None or e.mean() < best[2].mean(): best = (rv, tv, e)
    except cv2.error: pass
rv, tv, e = best; g = frame_at(vid, t); im = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR); R, _ = cv2.Rodrigues(rv); Pc = V @ R.T + tv.reshape(3)
uv = (Pc[:, :2] / Pc[:, 2:3] * f + [W / 2, H / 2]).astype(np.int32); mask = np.zeros((H, W), np.uint8); cv2.fillPoly(mask, list(uv[F]), 255)
cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cv2.drawContours(im, cs, -1, (0, 255, 0), 2)
pr, _ = cv2.projectPoints(A, rv, tv, K, None)
for (x, y), (px, py) in zip(B, pr.reshape(-1, 2)): cv2.circle(im, (int(x), int(y)), 6, (0, 0, 255), 2); cv2.circle(im, (int(px), int(py)), 3, (255, 255, 0), -1)
if crop: im = im[crop[1]:crop[3], crop[0]:crop[2]]
cv2.imwrite(out, im); print(json.dumps({'t': t, 'rvec': rv.ravel().tolist(), 'tvec': tv.ravel().tolist(), 'err': [round(x, 1) for x in e.tolist()], 'names': names}))
