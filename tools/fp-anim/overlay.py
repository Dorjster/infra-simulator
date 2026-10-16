# Overlay of tracked poses: the model's silhouette outline (front-facing triangles filled, then its contour) on the
# video frames. Usage: overlay.py <video> <mesh.npz> <poses.json> <out.jpg> [step frames] [cols] [t from] [t to]
import cv2, json, subprocess, sys, numpy as np
vid, meshf, posef, out = sys.argv[1:5]; step = int(sys.argv[5]) if len(sys.argv) > 5 else 15; cols = int(sys.argv[6]) if len(sys.argv) > 6 else 6
P = json.load(open(posef)); K = np.array(P['K']); m = np.load(meshf); V, F = m['V'], m['F']; W, H = 1920, 1080
ta = float(sys.argv[7]) if len(sys.argv) > 7 else -1; tb = float(sys.argv[8]) if len(sys.argv) > 8 else 1e9
sel = [r for r in P['poses'][::step] if ta <= r['t'] <= tb]; tiles = []
for r in sel:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f"{r['t']:.4f}", '-i', vid, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True).stdout
    im = np.frombuffer(raw, np.uint8).reshape(H, W, 3).copy(); R, _ = cv2.Rodrigues(np.array(r['rvec'])); Pc = V @ R.T + np.array(r['tvec'])
    uv = (Pc[:, :2] / Pc[:, 2:3] * K[0, 0] + K[:2, 2]).astype(np.int32); mask = np.zeros((H, W), np.uint8)
    cv2.fillPoly(mask, [uv[t] for t in F], 255); cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(im, cs, -1, (0, 255, 0), 3); cv2.putText(im, f"t={r['t']:.2f}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 255), 4)
    tiles.append(cv2.resize(im, (640, 360)))
while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
cv2.imwrite(out, np.vstack([np.hstack(tiles[k:k + cols]) for k in range(0, len(tiles), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 82]); print(out, len(sel))
