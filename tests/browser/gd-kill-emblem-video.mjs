// Global Defensive · a screen recording of the round kill tally in a real game, WITH the game's sound (v53 Addendum 8,
// the video deliverable): Defuse on Dust II (the CS2 map file when converted, the High preset) against 9 easy bots; in
// one round you make kills 1 → 5 (an ace), the 2nd, 4th and 5th by headshot, each about 1.6 s apart so every card's
// pop, shine, lightning and glow plays out. Recorded at 1920 × 1080, 60 fps:
//   picture — the tab itself, every composited frame (TAB CAPTURE: getDisplayMedia of the current tab at 60 fps,
//             the canvas AND the HUD's DOM, as shown; recorded with the sound by ONE MediaRecorder, H.264 + Opus);
//   sound   — DIGITALLY inside the page: every connection the game makes to its AudioContext's destination (its final
//             node) is also made to a MediaStreamAudioDestinationNode (AudioNode.prototype.connect, wrapped before the
//             game loads); Chrome stays muted (--mute-audio): nothing reaches the speakers.
// TRUE 60 fps (v53 HUD fix): the page is 1936 px wide (8 px more each side, cropped away) and stamps every frame it draws
// (requestAnimationFrame) into an 8 × 8 px corner as one of 8 colours (its frame number mod 8); each screencast picture
// is decoded by that stamp (the recording's frames, their own times), so a repeated picture is known. Checked: the
// page drew >= 57 frames a second and >= 92 % of its frames reached the file as distinct pictures (a stamp seen once
// each). (The DevTools screencast, used before, reached only 60-73 % in a real round: its JPEG per frame can't keep up.)
// The camera stays on each bot as it dies (it falls in view) and you play a Terrorist (the user's pictures: the T badge).
// The sound: the taps mixed through a limiter (a DynamicsCompressorNode at −1 dBFS, ratio 20) so the file never clips.
// The recording (H.264 + Opus, variable frame times) → ffmpeg → H.264 + AAC mp4 (constant 60 fps). Checked: ffprobe (1920 × 1080, 60 fps,
// duration, an audio stream) and ffmpeg volumedetect (the audio is not silent). A labelled contact sheet (one frame per
// kill, 0.25 s after it) is made from the mp4 itself.
//   node tests/browser/gd-kill-emblem-video.mjs <repo-root> <out-dir> [--kf <dir>] [--hud <dir>] [--mp4 <file>] [--sheet <jpg>] [--probe]
//     --probe   only check the screencast + in-page audio capture here (a 3 s clip of a test page)
//     --tabcap-probe  only check that headless tab capture works here (4 s of a test page; distinct frames counted)
import { chromium } from 'playwright-core'; import { spawn, spawnSync, execFileSync } from 'node:child_process'; import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; }, flag = k => { const i = argv.indexOf(k); if (i < 0) return false; argv.splice(i, 1); return true; };
const KF_DIR = opt('--kf'), HUD_DIR = opt('--hud'), MP4 = opt('--mp4'), SHEET = opt('--sheet'), PROBE = flag('--probe'), TABCAP_PROBE = flag('--tabcap-probe'), FPS_PROBE = flag('--fps-probe');   // (--fps-probe: the game's own frame rate here, with and without the screencast)
const [root = '.', out = path.join(os.tmpdir(), 'gd-kill-emblem-video')] = argv; mkdirSync(out, { recursive: true });
let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d === '' ? '' : ' · ' + String(d).slice(0, 500))); };
const serveDir = async (p, pat, dir) => { if (!dir) return; await p.route(pat, r => { const f = path.join(dir, decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop())); if (!existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: readFileSync(f), contentType: f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'application/json' }); }); };
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--auto-accept-this-tab-capture', '--auto-select-tab-capture-source-by-title=GDCAP', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
// (no --use-fake-ui-for-media-stream: with it headless Chrome's tab capture fails, "NotReadableError: Could not start video
// source"; without it, getDisplayMedia picks the tab titled GDCAP by itself — tried with --tabcap-probe, 2026-11-04)
// The in-page sound tap (before any game script): a context's destination gets a twin MediaStreamAudioDestinationNode.
const TAP = () => { const orig = AudioNode.prototype.connect; window.__taps = [];
  AudioNode.prototype.connect = function (dest, ...a) { const r = orig.call(this, dest, ...a); try { if (dest instanceof AudioDestinationNode) { const c = dest.context; if (!c.__tap) { c.__tap = c.createMediaStreamDestination(); window.__taps.push(c.__tap); } orig.call(this, c.__tap); } } catch {} return r; }; };
// Recorder control in the page: start(fps) → tab video + every tap's audio mixed into one track; stop() → base64 chunks.
// Recorder: the SOUND in the page — every tap mixed into one track (a MediaStreamAudioDestinationNode of its own
// context), MediaRecorder (Opus); its start moment on the wall clock (s) to line it up with the picture. The PICTURE: the
// DevTools screencast of the tab (Page.startScreencast: every composited frame, JPEG, with its swap time) — the page as
// the screen shows it, the canvas and the HUD's DOM. (Tab capture, getDisplayMedia, is not available to headless Chrome:
// "Could not start video source"; a headed window would take the user's screen and focus.)
const REC = () => { window.__rec = {
  // TAB CAPTURE (v53 HUD fix, true 60 fps): the tab's own picture (getDisplayMedia, the current tab, 60 fps — the
  // compositor's frames, no JPEG per frame) and the sound mix recorded TOGETHER by one MediaRecorder (H.264 + Opus), the
  // chunks handed to the test as they come (__gdChunk). grab() needs a click (a user gesture): the test clicks #gdcap-go.
  async grab() { const t0 = document.title; document.title = 'GDCAP'; try { this.tab = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1936 }, height: { ideal: 1080 } }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }); return { ok: true, settings: this.tab.getVideoTracks()[0].getSettings() }; } catch (e) { return { ok: false, err: e.name + ': ' + e.message }; } finally { document.title = t0; } },
  async startAV() { const mix = new AudioContext(); await mix.resume(); const md = mix.createMediaStreamDestination(), lim = mix.createDynamicsCompressor(); lim.threshold.value = -1; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .05; lim.connect(md); for (const t of window.__taps) mix.createMediaStreamSource(t.stream).connect(lim);
    this.mix = mix; const mime = ['video/webm;codecs=h264,opus', 'video/mp4;codecs=avc1.640028,opus', 'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/webm;codecs=vp9,opus'].find(m => MediaRecorder.isTypeSupported(m)); this.seq = 0; this.pending = 0;
    this.r = new MediaRecorder(new MediaStream([this.tab.getVideoTracks()[0], md.stream.getAudioTracks()[0]]), { mimeType: mime, videoBitsPerSecond: 30e6, audioBitsPerSecond: 192000 });
    this.q = Promise.resolve(); this.r.ondataavailable = e => { if (!e.data.size) return; const n = this.seq++, blob = e.data; this.pending++; this.q = this.q.then(async () => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); await window.__gdChunk(n, btoa(s)); this.pending--; }); };   // (in order: one chain)
    await new Promise(r => { this.r.onstart = () => { this.wall = Date.now() / 1000; r(); }; this.r.start(500); }); return { mime, taps: window.__taps.length, wall: this.wall }; },
  async stopAV() { await new Promise(r => { this.r.onstop = r; this.r.stop(); }); while (this.pending) await new Promise(r => setTimeout(r, 20)); this.mix.close(); return { wall: this.wall, chunks: this.seq }; },
  async start() { const mix = new AudioContext(); await mix.resume(); const md = mix.createMediaStreamDestination(), lim = mix.createDynamicsCompressor(); lim.threshold.value = -1; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .05; lim.connect(md); for (const t of window.__taps) mix.createMediaStreamSource(t.stream).connect(lim);
    this.mix = mix; this.chunks = []; this.t0 = performance.now(); const mime = ['audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m));
    this.r = new MediaRecorder(md.stream, { mimeType: mime, audioBitsPerSecond: 192000 }); this.r.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    await new Promise(r => { this.r.onstart = () => { this.wall = Date.now() / 1000; r(); }; this.r.start(250); }); return { mime, taps: window.__taps.length, wall: this.wall }; },
  async stop() { await new Promise(r => { this.r.onstop = r; this.r.stop(); }); this.mix.close(); const buf = new Uint8Array(await new Blob(this.chunks, { type: 'audio/webm' }).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return { b64: btoa(s), wall: this.wall }; },
}; };
// The frame stamp (before any game script): every requestAnimationFrame paints the corner square in colour (n mod 8).
const STAMP = () => { const C = ['#000', '#f00', '#0f0', '#ff0', '#00f', '#f0f', '#0ff', '#fff']; let n = 0, el = null; window.__fstamp = { n: 0, t: new Float64Array(30000) };
  const f = t => { if (!el && document.body) { el = document.createElement('div'); el.style.cssText = 'position:fixed;right:0;top:0;width:8px;height:8px;z-index:2147483647;pointer-events:none;background:#000'; document.body.append(el); }
    if (el) { el.style.background = C[n & 7]; const S = window.__fstamp; if (S.n < S.t.length) S.t[S.n] = t; S.n++; n++; } requestAnimationFrame(f); }; requestAnimationFrame(f); };
// Decode each picture's stamp (the 8 × 8 corner's centre, 3 bits by thresholds) → its page frame number (unwrapped).
function stampsOf(frames) { const dir = path.dirname(frames[0].f);   // (the frames are numbered 000000.jpg …: read in order as an image sequence, one picture each)
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-framerate', '100', '-start_number', '0', '-i', path.join(dir, '%06d.jpg'), '-frames:v', String(frames.length), '-vf', 'crop=2:2:1931:3,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  const idx = []; let last = -1, acc = 0;
  let lastTs = 0;
  for (let i = 0; i < frames.length && i * 3 + 2 < raw.length; i++) { const v = (raw[i * 3] > 128 ? 1 : 0) | (raw[i * 3 + 1] > 128 ? 2 : 0) | (raw[i * 3 + 2] > 128 ? 4 : 0);
    if (last < 0) { acc = v; last = v; lastTs = frames[i].ts; idx.push(acc); continue; }
    // the step in page frames: ≡ the stamp's change (mod 8), the one nearest the swap times' gap × 60 (a step ≤ 0: a late
    // picture of an older frame — treated as a repeat)
    const m = (v - last + 8) % 8, want = (frames[i].ts - lastTs) * 60; let d = m; for (const c of [m - 8, m, m + 8, m + 16]) if (Math.abs(c - want) < Math.abs(d - want)) d = c;
    if (d <= 0) { idx.push(acc); continue; } acc += d; last = v; lastTs = frames[i].ts; idx.push(acc); }
  return idx; }
// The screencast: frames written as they come (acked at once), with their swap times.
async function screencast(p, dir, quality = 80) { mkdirSync(dir, { recursive: true }); const cdp = await p.context().newCDPSession(p), frames = [];
  const on = e => { const f = path.join(dir, String(frames.length).padStart(6, '0') + '.jpg'); writeFileSync(f, Buffer.from(e.data, 'base64')); frames.push({ f, ts: e.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); };
  cdp.on('Page.screencastFrame', on); await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1, maxWidth: 1936, maxHeight: 1080 });
  return { frames, async stop() { await cdp.send('Page.stopScreencast').catch(() => {}); cdp.off('Page.screencastFrame', on); await cdp.detach().catch(() => {}); } }; }
// Frames (variable times) + the sound → constant 60 fps H.264 + AAC: each frame shown until the next one's swap time
// (the concat demuxer's durations), the sound delayed by its start minus the first frame's.
function encodeAV(frames, audio, audioWall, mp4) { const list = path.join(path.dirname(audio), 'frames.txt'); let txt = '';
  // each DISTINCT picture held from its own page frame to the next distinct one's (1/60 s per page frame); a repeat dropped
  const st = stampsOf(frames), keep = []; for (let i = 0; i < st.length; i++) if (!keep.length || st[i] !== st[keep[keep.length - 1]]) keep.push(i);
  for (let j = 0; j < keep.length; j++) { const i = keep[j], d = j + 1 < keep.length ? (st[keep[j + 1]] - st[i]) / 60 : 1 / 60; txt += `file '${frames[i].f}'\nduration ${d.toFixed(6)}\n`; } txt += `file '${frames[keep[keep.length - 1]].f}'\n`; writeFileSync(list, txt);
  const pageFrames = st[keep[keep.length - 1]] - st[keep[0]] + 1, distinct = keep.length;
  const off = Math.max(0, audioWall - frames[0].ts), lead = Math.max(0, frames[0].ts - audioWall);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-ss', lead.toFixed(3), '-i', audio, '-filter_complex', `[0:v]fps=60,crop=1920:1080:8:0,format=yuv420p[v];[1:a]adelay=${Math.round(off * 1000)}:all=1,aresample=48000[a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', '60', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
  const span = frames[frames.length - 1].ts - frames[0].ts; return { frames: frames.length, span, captureFps: (frames.length - 1) / span, distinct, pageFrames, pageFps: (pageFrames - 1) / span, distinctShare: distinct / pageFrames, audioOffset: off - lead,
    at: tSec => { let i = 0; while (i + 1 < frames.length && frames[i + 1].ts <= tSec) i++; return (st[i] - st[keep[0]]) / 60; } }; }   // (a wall-clock moment → its time in the file: its frame's own page-frame time)
// One tab recording (variable frame times, its own sound) → constant 60 fps H.264 + AAC. Its frames' stamps are read
// (each frame's pts from ffprobe) to count the distinct page frames: the true-60 check. at(): a wall moment → file time.
function encodeRec(file, wall, mp4) {
  const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n').map(Number).filter(Number.isFinite);
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-fps_mode', 'passthrough', '-loglevel', 'fatal', '-vf', 'crop=2:2:1931:3,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  // (each decoded picture's stamp: the step from the last is its change mod 8 — 0 a repeat; at ~58 fps captured with 99 %
  // distinct, no gap reaches 8 frames. The pictures are counted as decoded, the span is the stream's own pts.)
  const n = Math.floor(raw.length / 3), st = []; let last = -1, acc = 0;
  for (let i = 0; i < n; i++) { const v = (raw[i * 3] > 128 ? 1 : 0) | (raw[i * 3 + 1] > 128 ? 2 : 0) | (raw[i * 3 + 2] > 128 ? 4 : 0);
    if (last >= 0) acc += (v - last + 8) % 8; last = v; st.push(acc); }
  let distinct = 0; for (let i = 0; i < st.length; i++) if (!i || st[i] !== st[i - 1]) distinct++;
  const pageFrames = st[st.length - 1] - st[0] + 1, span = pts[pts.length - 1] - pts[0];
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-filter_complex', '[0:v]fps=60,crop=1920:1080:8:0,format=yuv420p[v];[0:a]aresample=48000,alimiter=limit=0.84:attack=1:release=50:level=disabled[a]', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', '60', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4]);
  return { frames: n, span, captureFps: (n - 1) / span, distinct, pageFrames, pageFps: (pageFrames - 1) / span, distinctShare: distinct / pageFrames, audioOffset: 0, via: 'tab capture', at: tSec => tSec - wall }; }
const probeMedia = f => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' }));
function require_vol(f) { const r = spawnSyncText('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']); const mean = /mean_volume: (-?[\d.]+) dB/.exec(r), max = /max_volume: (-?[\d.]+) dB/.exec(r); return { mean: mean ? +mean[1] : null, max: max ? +max[1] : null }; }
function spawnSyncText(c, a) { const r = spawnSync(c, a, { encoding: 'utf8' }); return (r.stdout || '') + (r.stderr || ''); }
function verify(mp4, minDur) { const m = probeMedia(mp4), v = m.streams.find(s => s.codec_type === 'video'), a = m.streams.find(s => s.codec_type === 'audio'), fr = v ? eval(v.r_frame_rate) : 0, dur = +m.format.duration, V = a ? require_vol(mp4) : {};
  check(`mp4: H.264 ${v?.width}×${v?.height} at ${fr} fps, ${dur.toFixed(2)} s, AAC audio`, v?.codec_name === 'h264' && v.width === 1920 && v.height === 1080 && Math.abs(fr - 60) < .01 && dur >= minDur && a?.codec_name === 'aac', JSON.stringify({ v: v && [v.codec_name, v.width, v.height, v.r_frame_rate, v.nb_frames], a: a && [a.codec_name, a.sample_rate, a.channels], dur }));
  check(`the audio track is not silent (volumedetect: mean ${V.mean} dB, max ${V.max} dB)`, V.max !== null && V.max > -45 && V.mean > -80, JSON.stringify(V));
  // (never clips — spec 2.2: the true peak of the decoded AAC, astats, under 0 dBFS; the capture mix and both encodes go
  // through a limiter at about -1.5 dBFS, as the AAC encoder overshoots a little)
  if (a) { const pk = /Peak level dB: (-?[\d.]+|-inf)/.exec(spawnSyncText('ffmpeg', ['-hide_banner', '-nostats', '-i', mp4, '-map', '0:a:0', '-af', 'astats=measure_overall=Peak_level:measure_perchannel=none', '-f', 'null', '-'])); V.peak = pk ? +pk[1] : null; check(`the audio never clips (astats peak ${V.peak} dBFS < 0)`, V.peak !== null && V.peak < 0, V.peak); }
  return { v, a, fr, dur, V }; }
try {
  if (TABCAP_PROBE) {   // (--tabcap-probe: can this headless Chrome capture its own tab — getDisplayMedia, the current tab — at 60 fps?)
    const { createServer } = await import('node:http'), hs = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<title>GDCAP</title><body style="margin:0;background:#123"><canvas id=c width=1920 height=1080></canvas><button id=go style="position:fixed;left:0;top:0">go</button><div id=d style="position:fixed;left:40px;top:40px;color:#fff;font:40px system-ui">DOM</div></body>'); }); await new Promise(r => hs.listen(0, '127.0.0.1', r));
    const p = await b.newPage({ viewport: { width: 1936, height: 1080 } }); await p.addInitScript(STAMP); await p.goto('http://127.0.0.1:' + hs.address().port + '/');
    await p.evaluate(() => { const c = document.getElementById('c').getContext('2d'); let t = 0; const f = () => { c.fillStyle = '#123'; c.fillRect(0, 0, 1920, 1080); c.fillStyle = '#fc4'; c.fillRect((t * 8) % 1900, 500, 40, 40); document.getElementById('d').textContent = 'DOM ' + t++; requestAnimationFrame(f); }; f();
      document.getElementById('go').onclick = async () => { try { const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1936 }, height: { ideal: 1080 } }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }); window.__cap = { ok: true, settings: s.getVideoTracks()[0].getSettings(), s }; } catch (e) { window.__cap = { ok: false, err: e.name + ': ' + e.message }; } }; });
    await p.click('#go'); await p.waitForFunction(() => window.__cap, null, { timeout: 15000 }).catch(() => {}); const cap = await p.evaluate(() => window.__cap && { ok: window.__cap.ok, err: window.__cap.err, settings: window.__cap.settings });
    console.log('getDisplayMedia', JSON.stringify(cap));
    if (cap?.ok) { const R = await p.evaluate(async () => { const mime = ['video/mp4;codecs=avc1.640028', 'video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)), ch = [], r = new MediaRecorder(window.__cap.s, { mimeType: mime, videoBitsPerSecond: 40e6 }); r.ondataavailable = e => e.data.size && ch.push(e.data); r.start(250); await new Promise(z => setTimeout(z, 4000)); await new Promise(z => { r.onstop = z; r.stop(); }); const buf = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return { mime, b64: btoa(s) }; });
      const f = path.join(out, 'tabcap-probe.' + (R.mime.includes('mp4') ? 'mp4' : 'webm')); writeFileSync(f, Buffer.from(R.b64, 'base64')); console.log('recorded', R.mime, f);
      console.log(spawnSyncText('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-vf', 'mpdecimate=hi=64:lo=32:frac=0.001', '-f', 'null', '-']).split('\n').filter(l => /frame=|Stream/.test(l)).join('\n')); }
    await p.close(); hs.close();
  } else if (PROBE) {
    const { createServer } = await import('node:http'), hs = createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<body style="margin:0;background:#123"><canvas id=c width=1920 height=1080></canvas><div id=d style="position:fixed;left:40px;top:40px;color:#fff;font:40px system-ui">DOM</div></body>'); }); await new Promise(r => hs.listen(0, '127.0.0.1', r));   // (a secure context: localhost)
    const p = await b.newPage({ viewport: { width: 1936, height: 1080 } }); await p.addInitScript(TAP); await p.addInitScript(REC); await p.addInitScript(STAMP); await p.goto('http://127.0.0.1:' + hs.address().port + '/');
    await p.evaluate(() => { const c = document.getElementById('c').getContext('2d'); let t = 0; const f = () => { c.fillStyle = '#123'; c.fillRect(0, 0, 1920, 1080); c.fillStyle = '#fc4'; c.fillRect((t * 8) % 1900, 500, 40, 40); document.getElementById('d').textContent = 'DOM ' + t++; requestAnimationFrame(f); }; f();
      const ac = new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); g.gain.value = .2; o.connect(g); g.connect(ac.destination); o.start(); window.__ac = ac; });
    const sc = await screencast(p, path.join(out, 'probe-frames')), info = await p.evaluate(() => __rec.start()); console.log('recording', JSON.stringify(info)); await p.waitForTimeout(3000);
    const A = await p.evaluate(() => __rec.stop()); await sc.stop(); const aud = path.join(out, 'probe-audio.webm'), mp4 = path.join(out, 'probe.mp4'); writeFileSync(aud, Buffer.from(A.b64, 'base64'));
    const E = encodeAV(sc.frames, aud, A.wall, mp4); console.log('capture', JSON.stringify(E)); verify(mp4, 2.5); await p.close();
  } else {
    const srv = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDKEV1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdkev-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
    process.on('exit', () => { try { srv.kill(); } catch {} }); let serr = ''; srv.stderr.on('data', d => { serr += d; });
    const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); srv.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
    const p = await b.newPage({ viewport: { width: 1936, height: 1080 }, deviceScaleFactor: 1 }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await serveDir(p, '**/user-assets/icons/killfeed/**', KF_DIR); await serveDir(p, '**/user-assets/icons/hud/**', HUD_DIR); await p.addInitScript(TAP); await p.addInitScript(REC); await p.addInitScript(STAMP);
    await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: 'High', showControls: false }));
      window.__cards = () => { const m = /\bn(\d|x)\b/.exec(document.getElementById('gd-ke')?.className || ''); return m ? (m[1] === 'x' ? 6 : +m[1]) : 0; }; });
    await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }).catch(() => { throw Error('no game: ' + errs.slice(0, 6).join(' | ')); }); await p.waitForTimeout(800);
    let recFile = null, recFd = null; const { openSync, writeSync, closeSync } = await import('node:fs'); await p.exposeFunction('__gdChunk', (n, b64) => { if (recFd !== null) writeSync(recFd, Buffer.from(b64, 'base64')); });
    await p.evaluate(() => { const bt = document.createElement('button'); bt.id = 'gdcap-go'; bt.style.cssText = 'position:fixed;left:0;top:0;width:6px;height:6px;opacity:0;z-index:2147483647'; bt.onclick = async () => { window.__grab = await __rec.grab(); bt.remove(); }; document.body.append(bt); });
    await p.click('#gdcap-go'); await p.waitForFunction(() => window.__grab, null, { timeout: 15000 }); const grab = await p.evaluate(() => window.__grab); console.log('tab capture', JSON.stringify(grab)); if (!grab.ok) throw Error('tab capture: ' + grab.err);
    await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
    await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '9');
    await p.evaluate(() => { for (const [id, v] of [['ss-ar-warm', '0'], ['ss-ar-freeze', '4'], ['ss-ar-diff', 'easy']]) { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } } }); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
    await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
    await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); });
    await p.waitForTimeout(1500); await p.mouse.click(968, 540).catch(() => {});
    await p.evaluate(() => __infra.lab.lan.act?.({ type: 'arena', action: { type: 'team', team: 't' } })?.catch?.(() => {}));   // (a Terrorist, as the user's pictures: from the next round if not at once)   // (a user gesture: the game's sound starts)
    if (FPS_PROBE) {   // the page's own frames (rAF) and the distinct pictures a screencast gets, 3 s each way
      await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'live', null, { timeout: 60000, polling: 100 }).catch(() => {});
      const raf = () => p.evaluate(() => new Promise(r => { const T = []; const f = t => { T.push(t); if (T.length < 181) requestAnimationFrame(f); else { const d = T.slice(1).map((v, i) => v - T[i]).sort((a, b) => a - b); r({ fps: 180 / ((T[180] - T[0]) / 1000), med: d[90], p95: d[171] }); } }; requestAnimationFrame(f); }));
      console.log('rAF alone', JSON.stringify(await raf()));
      for (const q of [92, 60]) { const dir = path.join(out, 'fps-' + q); rmSync(dir, { recursive: true, force: true }); const sc = await screencast(p, dir, q); const r = await raf(); await p.waitForTimeout(500); await sc.stop();
        const { createHash } = await import('node:crypto'); const H = new Set(sc.frames.map(f => createHash('md5').update(readFileSync(f.f)).digest('hex'))); const span = sc.frames.length > 1 ? sc.frames[sc.frames.length - 1].ts - sc.frames[0].ts : 1;
        console.log(`screencast q${q}: rAF ${JSON.stringify(r)} · ${sc.frames.length} events, ${H.size} distinct in ${span.toFixed(2)} s = ${(H.size / span).toFixed(1)} distinct/s`); }
      await p.close(); throw Object.assign(Error('fps-probe done'), { probe: true }); }
    // One kill: as tests/browser/gd-kill-emblem-shots.mjs — stand behind the bot where the way is clear, aim at its drawn
    // model (the host rewinds it to your view), fire until the tally grows. head: aim at the head.
    async function killOne(head) {
      const before = await p.evaluate(() => __cards()), skip = []; let on = null, onShots = 0;   // (skip: bots 10 shots could not kill — behind cover — tried last)
      for (let shot = 0; shot < 60; shot++) {
        const st = await p.evaluate(async ({ head, skip }) => {
          const { bulletPath, BulletPath } = await import('/arena-maps.js'); const G = __infra.lab.world.operations.game, C = G.combat, me = 'tester', now = __infra.lab.lan.hostNow?.() ?? Date.now();
          if (C.down?.[me] && C.down[me].until > now) return { dead: true };
          const team = C.d?.teams?.[me], bx = __infra.lab.arenaScene.boxes, all = G.arena.bots.filter(b => C.d.teams[b.name.trim().toLowerCase()] !== team && !(C.down?.[b.name.trim().toLowerCase()]?.until > now)), fresh = all.filter(b => !skip.includes(b.name)), foes = fresh.length ? fresh : all;
          if (!foes.length) return { none: true };
          const iso = b => { let m = 1e9; for (const o of foes) if (o !== b) m = Math.min(m, Math.hypot(o.x - b.x, o.z - b.z)); return m; }, bot = team === 't' ? foes.slice().sort((a, b) => iso(b) - iso(a))[0] : foes[0], down = y0 => { const P = bulletPath(bx, bot.x, y0, bot.z, 0, -1, 0, 400, 0, new BulletPath()); return Number.isFinite(P.stop) && P.stop < 400 ? y0 - P.stop : null; };
          const feet = Number.isFinite(bot.y) ? bot.y : down(14) ?? down(120) ?? 0, ty = feet + (head ? 10.15 : 7.6); let best = null; const px = -Math.sin(bot.yaw || 0), pz = -Math.cos(bot.yaw || 0);
          for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a), front = bulletPath(bx, bot.x, feet + 9.7, bot.z, -dx, 0, -dz, 40, 0, new BulletPath()).stop, behind = dx * px + dz * pz; if (!(front < 12) && (!best || behind > best.behind)) best = { dx, dz, behind }; }
          if (!best) return { blocked: bot.name };
          const D = 9, ex = bot.x - best.dx * D, ez = bot.z - best.dz * D, ey = feet + 9.7; __infra.lab.look(ex, ez, bot.x, ty, bot.z, ey); __infra.camera.position.set(ex, ey, ez); __infra.camera.lookAt(bot.x, ty, bot.z);
          return { bot: bot.name }; }, { head, skip });
        if (st.dead || st.none) return st; if (st.blocked) { skip.push(st.blocked); await p.waitForTimeout(150); continue; }
        if (st.bot !== on) { on = st.bot; onShots = 0; } if (++onShots > 5 && !skip.includes(on)) skip.push(on);
        await p.waitForTimeout(140);
        await p.evaluate(async ({ head, name }) => { let m = null; for (const x of (__infra.lab.lan.models || new Map()).values()) if ((x.name || x.pname) === name) m = x; if (!m) return; const q = m.g.position, { bulletPath, BulletPath } = await import('/arena-maps.js'), P = bulletPath(__infra.lab.arenaScene.boxes, q.x, q.y + 12, q.z, 0, -1, 0, 60, 0, new BulletPath()), feet = Number.isFinite(P.stop) && P.stop < 60 ? q.y + 12 - P.stop : q.y; const c = __infra.camera.position, ty = feet + (head ? 10.15 : 7.6); for (let i = 0; i < (head ? 1 : 3); i++) { if (i) await new Promise(r => setTimeout(r, 190)); __infra.lab.look(c.x, c.z, q.x, ty, q.z, c.y); __infra.camera.lookAt(q.x, ty, q.z); __infra.lab.pistol.fire(); } }, { head, name: st.bot });   /* (a body kill: three quick shots — CS2's USP-S cycles in 0.17 s) */
        const got = await p.waitForFunction(n => __cards() > n, before, { timeout: 420, polling: 'raf' }).then(() => true, () => false);
        if (got) { const wall = await p.evaluate(() => Date.now()), at = 0; const f = await p.evaluate(() => { const G = __infra.lab.world.operations.game, f = G.combat.feed.filter(x => x.by === 'Tester').sort((x, y) => y.at - x.at)[0] || {}; return { target: f.target, head: !!f.head, wid: f.wid }; }); return { ok: true, at, wall, ...f, shots: shot + 1 }; }
        if (shot % 6 === 5) await p.keyboard.press('KeyR').then(() => p.waitForTimeout(2300));   // (empty: reload)
      }
      return { timeout: true }; }
    const PLAN = [true, true, true, true, false];   // kills 1–4 headshots · 5 (the ace) a body kill: both card looks
    // Between kills you wait back at your spawn (out of the fight) while the card plays; a Kevlar vest from the freeze time.
    const home = async () => p.evaluate(() => { const h = window.__home; if (!h) return; __infra.lab.look(h.x, h.z, h.x + Math.sin(h.yaw) * -50, h.y, h.z + Math.cos(h.yaw) * -50, h.y); __infra.camera.position.set(h.x, h.y, h.z); });
    let kills = null, rec = null;
    for (let tries = 0; tries < 6 && !kills; tries++) {
      const r0 = await p.evaluate(() => __infra.lab.world.operations.game.combat.d.round);
      if (tries || r0.phase !== 'freeze') await p.waitForFunction(id => { const r = __infra.lab.world.operations.game.combat.d.round; return r.id !== id && r.phase === 'freeze'; }, r0.id, { timeout: 240000, polling: 100 }).catch(() => {});
      const want = tries < 2 ? 't' : 'ct';   // (a Terrorist first, as the user's pictures; CT bots hold their sites behind cover, so after two tries a Counter-Terrorist against the Terrorists' open routes)
      if (await p.evaluate(() => __infra.lab.world.operations.game.combat.d.teams.tester) !== want) { const r1 = await p.evaluate(() => __infra.lab.world.operations.game.combat.d.round.id); await p.evaluate(w => __infra.lab.lan.act?.({ type: 'arena', action: { type: 'team', team: w } })?.catch?.(() => {}), want); await p.waitForFunction(([id, w]) => { const G = __infra.lab.world.operations.game; return G.combat.d.round.id !== id && G.combat.d.round.phase === 'freeze' && G.combat.d.teams.tester === w; }, [r1, want], { timeout: 240000, polling: 100 }).catch(() => {}); }
      recFile = path.join(out, `kill-emblem-rec-${tries}.webm`); recFd = openSync(recFile, 'w'); const info = await p.evaluate(() => __rec.startAV()); console.log('recording', JSON.stringify(info));
      await p.evaluate(() => { const d = __infra.lab.world.operations.game.combat.d; __infra.lab.lan.send({ type: 'arena', action: { type: 'buy-armor', kind: 'kevlar', round: d.round.id } }); });
      await p.waitForFunction(() => __infra.lab.world.operations.game.combat.d.round.phase === 'live', null, { timeout: 30000, polling: 50 }); await p.waitForTimeout(700);
      await p.evaluate(() => { const c = __infra.camera.position; window.__home = { x: c.x, y: c.y, z: c.z, yaw: __infra.lab.yaw?.() ?? 0 }; });
      const got = []; for (const head of PLAN) { const k = await killOne(head); if (!k.ok) { console.log('attempt', tries, 'stopped:', JSON.stringify(k)); break; } got.push(k); console.log('kill', got.length, JSON.stringify(k)); await p.waitForTimeout(420); await home(); await p.waitForTimeout(900); }   // (the camera stays on the bot as it falls — Addendum 12 — then back out of the fight while its card plays on)
      await p.waitForTimeout(1800); const A = await p.evaluate(() => __rec.stopAV()); closeSync(recFd); recFd = null;
      if (got.length === 5) { kills = got; rec = { file: recFile, wall: A.wall }; }
    }
    check('a real round with kills 1 → 5 (an ace) and headshots', kills?.length === 5 && kills.some(k => k.head) && kills.some(k => !k.head), JSON.stringify(kills));
    const cls = await p.evaluate(() => document.getElementById('gd-ke')?.className); check('the tally shows five cards at the end (the ace)', /\bn5\b/.test(cls || ''), cls);
    check('no page errors', !errs.length, errs.slice(0, 4).join(' | ')); await p.close();
    if (kills) { const mp4 = MP4 || path.join(out, 'kill-emblem.mp4'), full = path.join(out, 'kill-emblem-full.mp4'), E = encodeRec(rec.file, rec.wall, full);
      // a long walk between two kills (a bot behind cover) is cut down to 2.5 s after the one and 2 s before the next: the
      // same frames and sound, cut together (select / aselect), the kills' times moved with it
      for (const k of kills) k.at = E.at(k.wall / 1000) * 1000;   // (the kills on the file's own timeline)
      { const seg = []; let a = Math.max(0, kills[0].at / 1000 - 2.5); for (let i = 0; i + 1 < kills.length; i++) { const t0 = kills[i].at / 1000, t1 = kills[i + 1].at / 1000; if (t1 - t0 > 6) { seg.push([a, t0 + 2.5]); a = t1 - 2; } } seg.push([a, kills[kills.length - 1].at / 1000 + 3.2]);
        const sel = seg.map(([x, y]) => `between(t,${x.toFixed(3)},${y.toFixed(3)})`).join('+');
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', full, '-vf', `select='${sel}',setpts=N/60/TB`, '-af', `aselect='${sel}',asetpts=N/SR/TB,alimiter=limit=0.84:attack=1:release=50:level=disabled`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4]);
        const moved = t => { let o = 0; for (const [x, y] of seg) { if (t >= x && t <= y) return o + t - x; o += y - x; } return o; }; for (const k of kills) k.at = moved(k.at / 1000) * 1000; E.cut = seg.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]); delete E.at; } console.log('capture', JSON.stringify(E)); check(`true 60 fps: the page drew ${E.pageFps.toFixed(1)} frames a second and ${(E.distinctShare * 100).toFixed(1)} % of them are distinct pictures in the file (${E.distinct} of ${E.pageFrames}; ${E.frames} recorded frames, ${E.via || "screencast"})`, E.pageFps >= 57 && E.distinctShare >= .92, JSON.stringify(E)); const V = verify(mp4, 8); V.capture = E; console.log('video:', mp4);
      // contact sheet: a frame 0.25 s after each kill, plus 0.1 s and 0.6 s after the ace
      const frames = []; const grab = (t, label) => { const f = path.join(out, `sheet-${frames.length}.png`), g = path.join(out, `sheet-${frames.length}-full.png`); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, t / 1000)), '-i', mp4, '-frames:v', '1', '-vf', 'crop=640:360:640:720', f]); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, t / 1000)), '-i', mp4, '-frames:v', '1', '-vf', 'scale=640:360', g]); frames.push({ f, g, label }); };   // (a full frame and the bottom centre: the cards)
      kills.forEach((k, i) => grab(k.at + 250, `kill ${i + 1}${k.head ? ' · headshot' : ''} · ${(k.at / 1000).toFixed(2)} s + 0.25 s`)); grab(kills[4].at + 100, 'the ace · + 0.10 s (pop, flash)'); grab(kills[4].at + 600, 'the ace · + 0.60 s (glow down, ring wave)');
      const s = await b.newPage({ viewport: { width: 1500, height: 900 } }), img = f => 'data:image/png;base64,' + readFileSync(f).toString('base64');
      await s.setContent(`<style>body{margin:0;padding:14px 18px;background:#15181c;color:#e8ecef;font:14px system-ui}h1{font-size:19px;margin:0 0 4px}.n{color:#aab;margin:0 0 10px}.r{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0}figure img{display:block;width:470px;border:1px solid #333}figure .pair{display:flex;gap:4px}figcaption{font:12px ui-monospace,Menlo,monospace;color:#cfd;margin-top:2px}</style>
        <h1>Global Defensive v53 · kill emblem video — contact sheet (GD-v53-kill-emblem.mp4)</h1><p class="n">Real Defuse round on Dust II vs 9 bots, 1920×1080 at ${V.fr} fps, ${V.dur.toFixed(1)} s, H.264 + AAC; game sound captured inside the page (mean ${V.V.mean} dB, max ${V.V.max} dB), Chrome muted. Each moment: the full frame and the bottom-centre crop (640×360). True 60 fps: ${(V.capture?.distinctShare * 100 || 0).toFixed(1)} % of the page's frames are distinct pictures (frame stamps).</p>
        <div class="r">${frames.map(x => `<figure><div class="pair"><img src="${img(x.g)}"><img src="${img(x.f)}"></div><figcaption>${x.label} · full frame | bottom centre (640×360 of 1920×1080)</figcaption></figure>`).join('')}</div>`);
      await s.waitForTimeout(300); const sh = SHEET || path.join(out, 'kill-emblem.jpg'); await s.screenshot({ path: sh, type: 'jpeg', quality: 90, fullPage: true }); await s.close(); console.log('sheet:', sh);
      writeFileSync(path.join(out, 'report.json'), JSON.stringify({ kills, video: { fr: V.fr, dur: V.dur, vol: V.V, capture: E } }, null, 1)); }
  }
} catch (e) { if (!e.probe) throw e; } finally { await b.close(); }
console.log(failed ? `FAIL: gd-kill-emblem-video · ${failed} failed` : 'PASS: gd-kill-emblem-video'); process.exit(failed ? 1 : 0);
