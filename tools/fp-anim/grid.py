# grid.py <video> <time s> <out.png> [x0 y0 x1 y1]: one full-resolution frame, cropped, with a pixel grid (lines every
# 20 px, labels every 100 px in full-frame coordinates) for reading landmark positions.
import cv2, sys, subprocess, numpy as np
vid, t, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]; box = [int(v) for v in sys.argv[4:8]] if len(sys.argv) > 7 else [0, 0, 1920, 1080]
raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', vid, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True).stdout
img = np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3).copy(); x0, y0, x1, y1 = box; c = img[y0:y1, x0:x1].copy()
k = max(1, int(1100 / max(x1 - x0, y1 - y0) + .5)); c = cv2.resize(c, None, fx=k, fy=k, interpolation=cv2.INTER_NEAREST)
for X in range((x0 // 20) * 20, x1, 20):
    if X < x0: continue
    col = (0, 255, 255) if X % 100 == 0 else (90, 90, 90); cv2.line(c, ((X - x0) * k, 0), ((X - x0) * k, c.shape[0]), col, 1)
    if X % 100 == 0: cv2.putText(c, str(X), ((X - x0) * k + 2, 14), cv2.FONT_HERSHEY_SIMPLEX, .45, (0, 255, 255), 1)
for Y in range((y0 // 20) * 20, y1, 20):
    if Y < y0: continue
    col = (0, 255, 255) if Y % 100 == 0 else (90, 90, 90); cv2.line(c, (0, (Y - y0) * k), (c.shape[1], (Y - y0) * k), col, 1)
    if Y % 100 == 0: cv2.putText(c, str(Y), (2, (Y - y0) * k - 3), cv2.FONT_HERSHEY_SIMPLEX, .45, (0, 255, 255), 1)
cv2.imwrite(out, c); print(out, c.shape, 'scale', k)
