// Global Defensive · spatial sound like CS2 (package U: "a player running in mid sounds next to me, and I can't tell where").
// Against a recording stand-in for Web Audio (every node made, its settings and wiring read back — no sound is heard):
//  · CS2's footstep falloff (game_sounds_footsteps.vsndevts CT_Concrete.StepLeft / Base.Footstep distance_volume_mapping_curve:
//    49.6 HU → .45, 116.6 → 1, 402.3 → .489, 1095 → .03, 1100 → 0) — a step 2000 HU off is silent, 1000 HU ≥ 18 dB under 200 HU;
//  · out of earshot is decided before any file: a far step whose file is still decoding is silent, not left to the shared
//    bank's Web Audio law (which never reaches silence); that law itself is CS2's linear range while a match is on;
//  · a placed sound is a point: a stereo file is folded to mono by its panner (channelCount 1, explicit), HRTF close by;
//  · walls: a step behind a concrete wall is ≥ 8 dB quieter and dull (≤ 5 kHz) — before −1.2 dB / 14 kHz; the occlusion
//    line is asked once per spot (cached 250 ms, budgeted);
//  · distance and direction cues: far steps lose their highs; a source behind the ear is duller than the same in front;
//    the listener follows the camera's turn — a source on the right is on the right (Web Audio's own azimuth rule on the
//    listener the game set), behind after a quarter turn left;
//  · walk / crouch silence for others (CS2: over 135 HU/s only): a Shift-walker's jittery drawn motion makes no step (the
//    old per-frame test did), a runner steps every 0.3 s, crouching or in the air none;
//  · voices: with all step voices busy, the nearest step wins.
// (The mix itself — how loud, how dull — needs a person with headphones to confirm.)
import assert from 'node:assert/strict';
let n = 0; const ok = (c, m) => { assert(c, m); n++; if (process.env.V) console.log("  ok " + m); };
const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;

// ── A recording stand-in for Web Audio ──
class Param { constructor(v) { this.value = v; } setValueAtTime(v) { this.value = v; return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } cancelScheduledValues() { return this; } setTargetAtTime() { return this; } }
class Node { constructor(c, kind) { this.ctx = c; this.kind = kind; this.out = []; this.channelCount = 2; this.channelCountMode = 'max'; } connect(d) { this.out.push(d); return d; } disconnect() {} }
const fakeBuffer = (ch, len, sr) => ({ numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: () => new Float32Array(len) });
class FakeCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.started = []; this.destination = new Node(this, 'dest');
    const P = v => new Param(v); this.listener = { positionX: P(0), positionY: P(0), positionZ: P(0), forwardX: P(0), forwardY: P(0), forwardZ: P(-1), upX: P(0), upY: P(1), upZ: P(0) }; }
  resume() {}
  createBufferSource() { const s = new Node(this, 'src'); s.playbackRate = new Param(1); s.buffer = null; s.loop = false; s.start = t => { s.t0 = t; this.started.push(s); }; s.stop = () => {}; return s; }
  createGain() { const g = new Node(this, 'gain'); g.gain = new Param(1); return g; }
  createBiquadFilter() { const f = new Node(this, 'biquad'); f.type = 'lowpass'; f.frequency = new Param(350); f.Q = new Param(1); f.gain = new Param(0); return f; }
  createPanner() { const p = new Node(this, 'panner'); Object.assign(p, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1, maxDistance: 10000, positionX: new Param(0), positionY: new Param(0), positionZ: new Param(0) }); return p; }
  createDynamicsCompressor() { const d = new Node(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) d[k] = new Param(0); return d; }
  createConvolver() { const v = new Node(this, 'conv'); v.buffer = null; return v; }
  createDelay() { const d = new Node(this, 'delay'); d.delayTime = new Param(0); return d; }
  createBuffer(ch, len, sr) { return fakeBuffer(ch, len, sr); }
  decodeAudioData() { return Promise.resolve(fakeBuffer(2, 19200, 48000)); }   // (a stereo file, 0.4 s: the panner must fold it to mono)
}
globalThis.AudioContext = FakeCtx;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8), json: async () => ({}) });

const SA = await import('../dist/spatial-audio.js');
const G = await import('../dist/gd-sounds.js');
const { want, ready } = await import('../dist/sound-bank.js');
const { HU, REF, curveGain, gdPlay, gdEvent, resetVoices, setGdOcclusion, setGdNow, occStats, placeCue, stepDue, bufSpeed, STEP_RUN, STEP_UP, CULL, GD_RANGE, gdAudio, voiceStats } = G;
const c = SA.audioCtx();
// The camera the game's listener follows (lab.js setListener every frame): eye at the origin, a yaw (radians, three.js
// YXZ: + turns left) and a pitch.
const cam = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, parent: null };
function look(yaw, pitch = 0) { const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);   // (q = yaw(Y) · pitch(X))
  Object.assign(cam.quaternion, { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp }); SA.setListener(cam); }
look(0);
// What the last started voice became: its level (the gains on its way out, the reverb send aside), lowpass, panner.
function chain(s) { let g = 1, hz = null, q = null, shelf = 0, p = null, node = s; for (let i = 0; i < 12 && node; i++) { const nx = node.out[0]; if (!nx) break;
    if (nx.kind === 'gain' && !p) g *= nx.gain.value; if (nx.kind === 'biquad' && nx.type === 'lowpass') { hz = nx.frequency.value; q = nx.Q.value; } if (nx.kind === 'biquad' && nx.type === 'highshelf') shelf = nx.gain.value; if (nx.kind === 'panner') { p = nx; break; } node = nx; }
  return { g, hz, q, shelf, p, buf: s.buffer }; }
function playAt(id, x, y, z, src = null) { const k = c.started.length; const r = gdPlay(id, { at: { x, y, z }, src }); return { r, v: c.started.length > k ? chain(c.started[c.started.length - 1]) : null }; }
const atHu = (hu, ux = 0, uz = -1) => [ux * hu * HU, 0, uz * hu * HU];   // (a point `hu` Hammer units off along a level direction)
const dB = (a, b) => 20 * Math.log10(a / b);

// ── 1. CS2's footstep curve (the reference values match the install's file; the bank reads them) ──
const CS2_STEP = [[49.591427, .45], [116.563492, 1], [402.285736, .488971], [1095, .03], [1100, 0]];   // (game_sounds_footsteps.vsndevts)
const ref = REF['CT_Concrete.StepLeft'];
ok(ref && near(ref[0], .9) && near(ref[3], .375), 'CT_Concrete.StepLeft: CS2 volume .9, occlusion_intensity .375');
for (const [hu, gv] of CS2_STEP) ok(near(curveGain(ref[1], hu), gv, 2e-3), `the step curve at ${hu} HU is CS2's ${gv}`);
ok(near(curveGain(ref[1], 200), 1 - (1 - .488971) * (200 - 116.563492) / (402.285736 - 116.563492), 2e-3) && curveGain(ref[1], 1100) === 0 && curveGain(ref[1], 2000) === 0, 'between points linear, silent from 1100 HU on');
await want([...gdEvent('step.concrete').files, ...gdEvent('land.concrete').files, ...gdEvent('gun.ak.fire').files]);
ok(gdEvent('step.concrete').files.every(ready), 'the step files decoded (stand-in)');
resetVoices(); setGdOcclusion(null);
const s200 = playAt('step.concrete', ...atHu(200)), s1000 = playAt('step.concrete', ...atHu(1000)), s2000 = playAt('step.concrete', ...atHu(2000));
ok(s200.r && s200.v && near(s200.v.g, gdEvent('step.concrete').vol * curveGain(ref[1], 200), 1e-3) && near(gdEvent('step.concrete').vol, .55 * .8), `a step 200 HU off plays at the curve's level × CS2's Footsteps mix group .8 (v53 HITS) (${s200.v?.g.toFixed(3)})`);
ok(s1000.v && dB(s200.v.g, s1000.v.g) >= 18, `1000 HU is ≥ 18 dB under 200 HU (${s1000.v && dB(s200.v.g, s1000.v.g).toFixed(1)} dB)`);
ok(s2000.r === true && !s2000.v, 'a step 2000 HU off (mid from a site) is silent — handled, no voice');
ok(.55 * curveGain(ref[1], 1075) > CULL && .55 * curveGain(ref[1], 1099) < CULL, 'the cull sits at the curve\'s edge (~1085 HU for the placeholder\'s level), not earlier');

// ── 2. Out of earshot before any file; the fallback law while a match is on ──
resetVoices(); const k0 = c.started.length;
ok(gdPlay('step.wood', { at: { x: 0, y: 0, z: -2000 * HU } }) === true && c.started.length === k0, 'a far step whose file is still decoding is silent on purpose (true), never left to the bank');
ok(gdPlay('step.wood', { at: { x: 0, y: 0, z: -200 * HU } }) === false, '…a near one returns false (the caller plays its stand-in)');
gdAudio(true); { const p = SA.outAt(c, { x: 0, y: 0, z: -10 }, 'step'); ok(p.distanceModel === 'linear' && near(p.maxDistance, 1100 * HU) && near(p.refDistance, 116.6 * HU) && p.rolloffFactor === 1, 'a match on: the shared fallback steps are CS2\'s linear range to silence at 1100 HU'); }
{ const p = SA.outAt(c, { x: 0, y: 0, z: -10 }, 'gun'); ok(p.distanceModel === 'linear' && near(p.maxDistance, 2500 * HU), '…and a gun\'s to 2500 HU'); ok(p.channelCount === 1 && p.channelCountMode === 'explicit', '…folded to mono (a stand-in is a point too)'); }
for (const k of ['beep', 'plant', 'defuse']) { const p = SA.outAt(c, { x: 0, y: 0, z: -10 }, k); ok(p.distanceModel === 'linear', `a match on: the bomb's ${k} stand-in falls to silence (linear, not 'inverse')`); }
gdAudio(false); { const p = SA.outAt(c, { x: 0, y: 0, z: -10 }, 'step'); ok(p.distanceModel === SA.RANGE.step[0] && p.maxDistance === SA.RANGE.step[3], 'other modes keep their own ranges'); }
const lin = (d, [, r, f, m]) => 1 - f * (Math.max(Math.min(d, m), r) - r) / (m - r);   // (Web Audio's linear law)
ok(lin(2000 * HU, GD_RANGE.step) === 0 && lin(200 * HU, GD_RANGE.step) > .9, 'the fallback law: silent at 2000 HU, near full at 200');

// ── 3. A point source: mono, HRTF close by ──
resetVoices(); { const { v } = playAt('step.concrete', ...atHu(300, 1, 0)); ok(v.buf.numberOfChannels === 2 && v.p.channelCount === 1 && v.p.channelCountMode === 'explicit', 'a stereo file is folded to mono by its panner (channelCount 1, explicit)');
  ok(v.p.panningModel === 'HRTF' && v.p.rolloffFactor === 0 && near(v.p.positionX.value, 300 * HU), 'HRTF, placed where it happens, the distance law CS2\'s (rolloff 0)'); }

// ── 4. Walls: stronger than before, and cached ──
let asked = 0, now = 1000; setGdNow(() => now); setGdOcclusion(() => (asked++, .65));   // (lab.js's answer for one 26 HU concrete wall: 1 − e^(−.04 × 26))
resetVoices(); const open = (setGdOcclusion(null), playAt('step.concrete', ...atHu(300))); setGdOcclusion(() => (asked++, .65));
const walled = playAt('step.concrete', ...atHu(300));
ok(dB(open.v.g, walled.v.g) >= 8, `a step behind a concrete wall is ≥ 8 dB quieter (${dB(open.v.g, walled.v.g).toFixed(1)} dB; before: 1.2)`);
ok(walled.v.hz !== null && walled.v.hz <= 5000, `…and dull: lowpass ${walled.v.hz?.toFixed(0)} Hz (before: 14 kHz)`);
const ev0 = occStats.evaluated, ca0 = occStats.cached; for (let i = 0; i < 5; i++) playAt('step.concrete', ...atHu(300));
ok(occStats.evaluated === ev0 && occStats.cached === ca0 + 5, 'a run\'s steps from the same spot reuse the answer (one line per spot)');
now += 300; playAt('step.concrete', ...atHu(300)); ok(occStats.evaluated === ev0 + 1, '…asked again once it is 250 ms old');
now += 300; asked = 0; for (let i = 0; i < 12; i++) playAt('step.concrete', ...atHu(250 + i * 40, 1, 0)); ok(asked <= 6, `at most 6 new lines per 50 ms (${asked})`);
setGdOcclusion(null);

// ── 5. Distance and direction cues ──
resetVoices(); { const a = playAt('step.concrete', ...atHu(100)), b = playAt('step.concrete', ...atHu(1000));
  ok(a.v.hz === null && b.v.hz !== null && b.v.hz < 10000, `a far step loses its highs (100 HU: open · 1000 HU: ${b.v.hz?.toFixed(0)} Hz)`); }
resetVoices(); look(0); { const f = playAt('step.concrete', ...atHu(500, 0, -1)), b = playAt('step.concrete', ...atHu(500, 0, 1));
  ok(b.v.p.panningModel === 'HRTF' && near(b.v.hz, f.v.hz, 1) && b.v.shelf <= -4.5 && b.v.shelf >= -5.5 && f.v.shelf === 0, `an HRTF step behind: only a gentle shelf on top of the head's own cue (${b.v.shelf.toFixed(1)} dB over 8 kHz), the same lowpass as in front (${f.v.hz.toFixed(0)} Hz — distance only)`);
  const n = playAt('step.concrete', ...atHu(100, 0, 1)), w = placeCue(0, 0, -100 * HU, 100, .65, .375, 1, { fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 }, {}, true);
  ok(n.v.hz === null && w.hz < 5000, `a close open enemy behind is not muffled like one behind a wall (behind, open: no lowpass — before 5 kHz · in front behind concrete: ${w.hz.toFixed(0)} Hz)`);
  const L = { fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 }, ef = placeCue(0, 0, -500 * HU, 500, 0, .375, 1, L, {}), eb = placeCue(0, 0, 500 * HU, 500, 0, .375, 1, L, {});
  ok(eb.hz < ef.hz * .6 && eb.shelf === 0, `an equalpower voice (far, low priority) behind gets the lowpass cue (front ${ef.hz.toFixed(0)} Hz · behind ${eb.hz.toFixed(0)} Hz)`);
  ok(placeCue(0, 0, 200 * HU, 200, 0, 1, 0, L, {}, true).shelf === 0, 'an explosion (distance_effect_mix 0) behind: no shelf');
  ok(f.v.q < -3 && f.v.q > -3.1, 'the lowpass is Butterworth (Q −3.01 dB: no bump at the cut)');
  const u = placeCue(0, -500 * HU, 0, 500, 0, .375, 1, { fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 }, {}); ok(u.back === 0, 'a sound straight below is neither in front nor behind'); }
// Web Audio's azimuth (the spec's PannerNode algorithm) on the listener exactly as the game set it: + right, − left.
function azimuth(sx, sy, sz) { const L = c.listener, p = [L.positionX.value, L.positionY.value, L.positionZ.value], f0 = [L.forwardX.value, L.forwardY.value, L.forwardZ.value], u0 = [L.upX.value, L.upY.value, L.upZ.value];
  const nrm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const s = nrm([sx - p[0], sy - p[1], sz - p[2]]), f = nrm(f0), right = nrm(cross(f, u0)), up = cross(right, f), pr = nrm(s.map((x, i) => x - dot(s, up) * up[i]));
  let az = 180 / Math.PI * Math.acos(Math.max(-1, Math.min(1, dot(pr, right)))); if (dot(pr, f) < 0) az = 360 - az; return az >= 0 && az <= 270 ? 90 - az : 450 - az; }
look(0); ok(near(azimuth(10, 0, 0), 90, .5) && near(azimuth(-10, 0, 0), -90, .5), 'facing −Z: a source at +X is hard right, at −X hard left');
look(Math.PI / 2); ok(Math.abs(azimuth(10, 0, 0)) > 179 && Math.abs(azimuth(0, 0, -10)) < 91 && azimuth(0, 0, -10) > 89, 'a quarter turn left: the +X source is behind, the one ahead (−Z) now on the right');
resetVoices(); { const b = playAt('step.concrete', 500 * HU, 0, 0); ok(b.v.shelf <= -4.5, '…and behind it gets the behind cue (the listener follows the camera\'s turn)'); }
look(-Math.PI / 2); ok(Math.abs(azimuth(10, 0, 0)) < .5, 'a quarter turn right: the +X source dead ahead');
look(0, -1.2); ok(near(azimuth(10, 0, 0), 90, .5), 'looking steeply down does not swap left and right');
resetVoices(); { const f = playAt('step.concrete', 0, 0, -500 * HU); ok((f.v.hz ?? 20000) > 9000 && f.v.shelf === 0, 'looking steeply down: a source ahead is still in front (no behind cue)'); }
look(0);

// ── 6. Walk / crouch silence for others (CS2: steps over 135 HU/s on the ground only) ──
ok(near(STEP_RUN / HU, 135) && near(STEP_UP / HU, 20), 'the rule: 135 HU/s; a step heard 20 HU over the feet (CS2 position_offset)');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// A remote body as this computer draws it (multiplayer.js): the sender moves at v HU/s and posts a snapshot every 25–41 ms
// stamped with its own clock (model.buf); this computer draws it at rt = now − delay, the delay easing 100 ± 30 ms over
// 1.5 s (the adaptive delay settling, a late packet's catch-up) — the drawn speed swings ±12 % — on frames of 4–20 ms.
// accel: from rest at t = 0 with CS2's ground acceleration (sv_accelerate 5.5 × 250 = 1375 HU/s², 135 HU/s passed at
// 0.098 s); jit: the sender's stamps off by up to ± jit ms; slowAt: from then a Shift walk (130 HU/s); info: { steps,
// first (drawn time of the first step), after (steps drawn later than stopAt / slowAt + 0.15 s) }.
function remote(vHu, secs, { crouched = false, ground = true, oldRule = false, stopAt = Infinity, accel = false, jit = 0, slowAt = Infinity, info = false } = {}) {
  const m = {}, v = vHu * HU, A = 1375 * HU, ta = v / A, buf = [], base = s => accel ? (s <= 0 ? 0 : s < ta ? A * s * s / 2 : v * ta / 2 + v * (s - ta)) : v * s;
  const posAt = s => (s = Math.min(s, stopAt), s > slowAt ? base(slowAt) + 130 * HU * (s - slowAt) : base(s)); let t = 0, ts = 0, steps = 0, oldT = .25, oldSteps = 0, px = null, first = NaN, after = 0;
  while (t < secs) { const dt = .004 + rnd() * .016; t += dt;
    while (ts <= t) { buf.push({ t: ts * 1000 + (rnd() * 2 - 1) * jit, x: posAt(ts), z: 0 }); if (buf.length > 40) buf.shift(); ts += .025 + rnd() * .016; }
    const rt = t - (.1 + .03 * Math.sin(2 * Math.PI * t / 1.5)), dx = posAt(rt) + (rnd() - .5) * .01;
    if (stepDue(m, dt, dx, 0, crouched, ground, bufSpeed(buf, rt * 1000), bufSpeed(buf, rt * 1000, 125))) { steps++; if (first !== first) first = rt; if (rt > Math.min(stopAt, slowAt) + .15) after++; }
    if (px !== null) { const sp = Math.abs(dx - px) / dt; if (sp > 20.8 && sp < 60) { oldT += dt; if (oldT > .3) { oldT = 0; oldSteps++; } } else oldT = .25; } px = dx; }   // (the old rule, multiplayer.js before)
  return info ? { steps, first, after } : oldRule ? oldSteps : steps; }
ok(remote(130, 10) === 0, 'a Shift walk (130 HU/s) makes no step for others over 10 s');
ok(remote(130, 10, { oldRule: true }) > 5, `(the old per-frame test on the same motion made ${remote(130, 10, { oldRule: true })} steps)`);
ok(remote(85, 10) === 0 && remote(250, 10, { crouched: true }) === 0, 'a crouch walk (85 HU/s), or crouched at any speed: none');
{ const s = remote(215, 10); ok(s >= 28 && s <= 34, `running with a rifle (215 HU/s): a step every 0.3 s (${s} in 10 s)`); }
ok(remote(250, 5, { ground: false }) === 0, 'in the air: none (the landing is its own sound)');
{ const a = remote(215, 3), b = remote(215, 6, { stopAt: 3 }); ok(b <= a + 2, `a runner who stops goes quiet at once (${a} steps in 3 s running; ${b} with 3 s standing after)`); }
// A peek is heard as it starts (review U: the 0.25 s windows put the first step 0.23–0.38 s after the start; the old
// per-frame rule 0.10 s): within 0.15 s of passing 135 HU/s (0.098 s), every run.
{ const f = []; for (let i = 0; i < 12; i++) f.push(remote(250, 1.5, { accel: true, info: true }).first); ok(f.every(x => x <= .098 + .15), `a run from standing: the first step ${Math.min(...f).toFixed(3)}–${Math.max(...f).toFixed(3)} s after the start (≤ 0.248)`); }
{ const r = remote(250, 6, { stopAt: 3, info: true }); ok(r.after === 0, `…and a stop silences within 0.15 s (${r.after} steps after)`); }
{ const r = remote(250, 6, { slowAt: 3, info: true }); ok(r.after === 0, `a runner who goes Shift-walking (130 HU/s) goes quiet within 0.15 s (${r.after} steps after)`); }
// (the stamp is the sender's performance.now() in the frame its position is from — multiplayer.js pose.ct: a few ms at most)
{ let s = 0; for (let i = 0; i < 3; i++) s += remote(130, 10, { jit: 4 }); ok(s === 0, `a Shift walk with the sender's stamps off by up to ±4 ms: no step in 30 s (${s})`); }
{ const b = [{ t: 0, x: 0, z: 0 }, { t: 100, x: 2, z: 0 }, { t: 200, x: 4, z: 0 }, { t: 300, x: 6, z: 0 }]; ok(near(bufSpeed(b, 300), 20) && near(bufSpeed(b, 250), 20) && Number.isNaN(bufSpeed(b.slice(0, 1), 300)) && Number.isNaN(bufSpeed([b[0], { t: 50, x: 1, z: 0 }], 50)), 'the snapshot speed: 20 u/s on the sender\'s clock; none from under 100 ms'); }
{ const m = {}; let s = 0; for (let i = 0; i < 100; i++) if (stepDue(m, .01, i === 50 ? 500 : (i > 50 ? 500 : 0), 0, false, true)) s++; ok(s === 0, 'a teleport (respawn) is not running'); }

// ── 7. Voices: the nearest step wins ──
resetVoices(); for (let i = 0; i < 8; i++) playAt('step.concrete', ...atHu(900 + i * 10, 1, 0), 'far' + i);
const before = voiceStats.stolen; const close = playAt('step.concrete', ...atHu(150), 'close'); ok(close.v && voiceStats.stolen === before + 1, 'all step voices busy far off: a close step takes the quietest one');
const farther = playAt('step.concrete', ...atHu(1050, -1, 0), 'farther'); ok(farther.r === true && !farther.v, '…and a farther one is dropped');
resetVoices();

console.log(`gd-spatial-audio: ${n} checks passed (the mix itself needs a person with headphones)`);
