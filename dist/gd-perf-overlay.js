// Global Defensive performance overlay: off by default; F9 in a match, or Settings → Global Defensive → "Performance
// overlay". Rolling frame time p50 / p95 / p99 over the last 240 drawn frames (≈ 4 s at 60 fps), long frames (> 33 ms:
// a missed 60 Hz refresh twice over; > 50 ms: a visible hitch) in that window and since the match started, FPS, draw calls
// and triangles of the whole frame (every pass: sun shadows, scene, smoke, glow — app.js resets renderer.info once per frame
// in GD), the render resolution and pixel ratio against the page's devicePixelRatio, the GPU / backend string (ANGLE →
// Metal on a Mac, ANGLE → Direct3D 11 on Windows), whether WebGL is hardware-accelerated (a software renderer —
// SwiftShader, Microsoft Basic Render — is named; the desktop app adds Chromium's own feature status, the
// chrome://gpu "Graphics Feature Status": app.getGPUFeatureStatus), the GPU time of a frame when the browser reports it, the
// JS heap, and the network (multiplayer.js gdNetStats: RTT, jitter, snapshot age, interpolation delay, corrections, the
// host's tick time, requests in flight, the last frame's size) and a map / asset download in progress.
// Cheap: frame() only writes two numbers into ring buffers (no allocation); the text is rebuilt at most 4 times a second,
// line by line, and a line's DOM text is only touched when it changed.
import { loadProgress } from './load-progress.js';

// Fixed-size ring of numbers with percentiles: no allocation after creation (the sort works on a preallocated copy, the
// unused tail filled with +Infinity so a typed-array sort leaves it at the end).
export function createRing(size = 240) {
  const a = new Float32Array(size), s = new Float32Array(size); let at = 0, count = 0, sorted = false;
  return {
    push(v) { a[at] = v; at = (at + 1) % size; if (count < size) count++; sorted = false; },
    get count() { return count; },
    get size() { return size; },
    clear() { at = count = 0; sorted = false; },
    // the k-quantile (0..1) of what the ring holds, as the stress test computes it (index floor(count·k), clamped)
    quantile(k) { if (!count) return 0; if (!sorted) { s.set(a); if (count < size) s.fill(Infinity, count); s.sort(); sorted = true; } return s[Math.min(count - 1, Math.floor(count * k))]; },
    over(limit) { let n = 0; for (let i = 0; i < count; i++) if (a[i] > limit) n++; return n; },
    mean() { if (!count) return 0; let t = 0; for (let i = 0; i < count; i++) t += a[i]; return t / count; },
    last() { return count ? a[(at - 1 + size) % size] : 0; },
  };
}
const SOFTWARE = /swiftshader|llvmpipe|basic render|software|microsoft basic/i;
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
// What holds the frame rate back (package W: the overlay line 1 says it, so a player on a Windows laptop knows which setting
// helps): '' when frames come at the 60 fps slot (mean within 8 %); 'GPU' when the GPU's time (if the browser reports it)
// fills its share, or the main thread has time to spare (the wait is the GPU: lower Resolution scale / the preset);
// 'CPU' when the main thread's own work (script + the draw submit) fills > 85 % of the slot (a smaller picture won't help:
// plug in, Windows power mode "Best performance", close other apps, fewer bots).
export function limitOf(frameMean, cpuP50, gpuMs = null, slot = 1000 / 60) { if (!(frameMean > slot * 1.08)) return ''; if (gpuMs !== null && gpuMs !== undefined && gpuMs > slot * .85) return 'GPU'; return cpuP50 > slot * .85 ? 'CPU' : 'GPU'; }
export function createPerfOverlay({ renderer, preferences = {}, gpuMs = () => null, net = () => null }) {
  const frames = createRing(240), cpu = createRing(240); let el = null, nodes = [], on = false, textAt = 0, long33 = 0, long50 = 0, total = 0, desktopGpu = null;
  const gpu = (() => { try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch { return 'unknown'; } })();
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && renderer.getContext() instanceof WebGL2RenderingContext;
  try { globalThis.infraDesktop?.info?.().then(i => { desktopGpu = i?.gpu || null; }).catch(() => {}); } catch {}
  function build() {
    el = document.createElement('div'); el.id = 'gd-perf'; el.setAttribute('aria-hidden', 'true');
    // left column under the radar (gd-radar.js: left 14, top 14, min(210px, 26vh) square): clear of the HP / armor (bottom
    // left), money (bottom 142), weapon / ammo (bottom right), kill feed (top right), score and alive (top centre) and the
    // crosshair — narrow, lines wrap rather than reach the screen's centre
    el.style.cssText = 'position:fixed;left:14px;top:calc(min(210px,26vh) + 26px);z-index:80;pointer-events:none;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e8f0f2;background:#05080cb8;padding:6px 9px;border-radius:4px;white-space:pre-wrap;overflow-wrap:anywhere;width:max-content;max-width:min(520px,34vw);max-height:calc(100vh - min(210px,26vh) - 210px);overflow:hidden;text-shadow:0 1px 2px #000';
    for (let i = 0; i < 7; i++) { const t = document.createTextNode(''); nodes.push(t); el.append(t); if (i < 6) el.append(document.createElement('br')); }
    document.body.append(el);
  }
  const put = (i, s) => { if (nodes[i].data !== s) nodes[i].data = s; };
  function text() {
    const r = renderer, info = r.info.render, pr = r.getPixelRatio(), n = frames.count, mean = frames.mean(), g = gpuMs(), N = net(), mem = globalThis.performance?.memory;
    const hw = desktopGpu ? (String(desktopGpu.webgl2 || desktopGpu.webgl || '').startsWith('enabled') ? 'hardware' : 'SOFTWARE ' + (desktopGpu.webgl2 || desktopGpu.webgl)) : SOFTWARE.test(gpu) ? 'SOFTWARE' : 'hardware';
    put(0, (n ? Math.round(1000 / Math.max(1, mean)) : 0) + ' FPS · frame p50 ' + f1(frames.quantile(.5)) + ' · p95 ' + f1(frames.quantile(.95)) + ' · p99 ' + f1(frames.quantile(.99)) + ' · max ' + f1(frames.quantile(1)) + ' ms · CPU ' + f1(cpu.quantile(.5)) + '/' + f1(cpu.quantile(.95)) + ' ms' + ((L => L ? ' · limit: ' + L : '')(n ? limitOf(mean, cpu.quantile(.5), g) : '')));
    put(1, 'long frames: last ' + n + ' → ' + frames.over(33.4) + ' >33 ms, ' + frames.over(50) + ' >50 ms · match ' + long33 + ' / ' + long50 + ' of ' + total);
    put(2, info.calls + ' draws · ' + (info.triangles >= 1e6 ? f1(info.triangles / 1e6) + 'M' : Math.round(info.triangles / 1e3) + 'k') + ' tris · ' + (r.info.programs?.length || 0) + ' programs · ' + Math.round(innerWidth * pr) + '×' + Math.round(innerHeight * pr) + ' (ratio ' + pr.toFixed(2) + ', DPR ' + (+devicePixelRatio).toFixed(2) + ') · ' + (preferences.graphics || '') + (g !== null && g !== undefined ? ' · GPU ' + f1(g) + ' ms' : ''));
    put(3, gpu.slice(0, 90) + ' · WebGL' + (webgl2 ? '2' : '1') + ' · ' + hw + (desktopGpu ? ' · rasterization ' + (desktopGpu.rasterization || '?') + ' · compositing ' + (desktopGpu.gpu_compositing || '?') : ''));
    put(4, (mem ? 'heap ' + Math.round(mem.usedJSHeapSize / 1048576) + ' MB · ' : '') + (N ? 'RTT ' + f1(N.rtt) + ' ms · jitter ' + f1(N.jitter) + ' · snapshot ' + N.snapshotAgeMs + ' ms · interp ' + Math.round(N.interpMs) + ' ms' : 'not connected'));
    put(5, N ? 'corrections ' + N.corrections + ' (max ' + f1(N.correctionMaxU) + ' u / 5 s) · host tick ' + f1(N.hostTickMs) + ' ms · in flight ' + N.queue + ' · last frame ' + f1(N.lastSnapshotBytes / 1024) + ' KB' : '');
    const P = loadProgress, loading = P.label && performance.now() - P.at < 4000; put(6, loading ? 'download: ' + P.label + ' · ' + (P.total ? Math.min(100, Math.round(P.got / P.total * 100)) + '%' : (P.got / 1048576).toFixed(0) + ' MB') : '');
  }
  return {
    // every drawn Global Defensive frame: its interval on the display clock and the CPU time it took (ms)
    frame(now, ms, cpuMs) { frames.push(ms); cpu.push(cpuMs); total++; if (ms > 33.4) long33++; if (ms > 50) long50++; if (on && now - textAt >= 250) { textAt = now; text(); } },
    set(v) { v = !!v; if (v === on) return; on = v; if (on && !el) build(); if (el) el.hidden = !on; if (on) { textAt = 0; } },
    toggle() { this.set(!on); return on; },
    resetMatch() { long33 = long50 = total = 0; frames.clear(); cpu.clear(); },
    get on() { return on; },
    get rings() { return { frames, cpu }; },
  };
}
