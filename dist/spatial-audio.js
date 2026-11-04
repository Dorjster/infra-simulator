// One shared sound engine with 3D positions: sounds made by other players and bots (shots, reloads, knife swings,
// running footsteps) come from where they happen — louder close, quieter far, left / right by direction.
// The listener follows the camera every frame (setListener).
let ctx = null;
export function audioCtx() { ctx ??= new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
// Where to connect a sound: the speakers directly (your own sounds) or a panner at `at` ({x, y, z}).
// The mix. Buses: effects (the game world: shots, steps, grenades) → master; UI (hit markers, menus) → master; music
// → master; the master runs through a gentle compressor (gunfire hits hard without clipping) to the speakers. Each
// has its own volume (Settings → Audio, saved on this computer); team voice follows master × voice (voice.js).
const VOLS_KEY = 'infra-audio', VOL_DEFAULT = { master: 1, effects: 1, voice: 1, music: .7, ui: .9 };
export function getVolumes() { try { return { ...VOL_DEFAULT, ...JSON.parse(localStorage.getItem(VOLS_KEY) || '{}') }; } catch { return { ...VOL_DEFAULT }; } }
let vols = getVolumes(), bus = null, verb = null, masterG = null, busUI = null, busMusic = null, worldIn = null, duckF = null, duckG = null, limiter = null;
export function setVolumes(v) { vols = { ...vols, ...v }; for (const k of Object.keys(vols)) vols[k] = Math.max(0, Math.min(1, +vols[k] || 0)); try { localStorage.setItem(VOLS_KEY, JSON.stringify(vols)); } catch {} if (masterG) { masterG.gain.value = vols.master; bus.gain.value = vols.effects; busUI.gain.value = vols.ui; busMusic.gain.value = vols.music; } globalThis.dispatchEvent?.(new CustomEvent('infra-volume', { detail: vols })); return vols; }
function buses(c) {
  // (a gentle compressor, no make-up gain: gunfire is kept from clipping without squashing near and far together — a
  // footstep far off stays far quieter than one close by; the game world sits 3 dB under the old mix: it was too loud)
  // The world: worldIn → duck (a lowpass and a gain, see duck(): open — a lowpass at Nyquist passes everything) → the
  // Effects volume → trim → compressor → master volume → a brick-wall limiter (−1 dBFS, 20:1, 1 ms: a 3:1 compressor lets
  // a stack such as the bomb next to you through near 0 dBFS; this one holds peaks under full scale) → speakers. The UI
  // bus skips the world's compressor (hit markers no longer pump with gunfire) and meets the master after it.
  if (bus) return; const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = .003; comp.release.value = .2;
  limiter = c.createDynamicsCompressor(); limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .001; limiter.release.value = .05;
  masterG = c.createGain(); masterG.gain.value = vols.master; comp.connect(masterG).connect(limiter).connect(c.destination);
  worldIn = c.createGain(); duckF = c.createBiquadFilter(); duckF.type = 'lowpass'; duckF.frequency.value = c.sampleRate / 2; duckG = c.createGain();
  const trim = c.createGain(); trim.gain.value = .7; bus = c.createGain(); bus.gain.value = vols.effects; worldIn.connect(duckF).connect(duckG).connect(bus).connect(trim).connect(comp); busUI = c.createGain(); busUI.gain.value = vols.ui; busUI.connect(masterG); busMusic = c.createGain(); busMusic.gain.value = vols.music; busMusic.connect(comp);
}
// ── (v53 HITS, open-B #8 and the audio audit) Global Defensive's last stage — only while a GD match is on (gd-sounds.js
// gdAudio(true) turns it on, leaving turns it off; every other mode never reaches it: the chain ends at the limiter as
// before). CS2's own last stage is FinalMixGlue (sounds/graphs/__main__.vmix, the user's install): a peak compressor at
// −6 dB, knee 3.125 dB, 40:1, 4 ms attack, 458 ms release, output 0 dB and NO make-up gain (bAutoMakeupGain false).
// Web Audio's DynamicsCompressor always adds a make-up gain of its own (Chromium's DynamicsCompressorKernel: (1 / the
// curve's gain at 0 dBFS)^0.6 — the audit measured the −1 dBFS limiter above peaking at +0.33 dBFS (world ×4) and +1.74
// (UI ×4) through it). So: the glue (Web Audio's ratio stops at 20: 20:1 for CS2's 40:1), then a gain that takes its
// make-up back out (compressorMakeup below — the same formula), then a −1 dBFS ceiling for what the 4 ms attack lets
// through (a WaveShaper: identity to −2.9 dBFS, rounded into −1 dBFS; no oversampling, so no filter rings past it):
// every sample leaves at or under −1 dBFS.
export const GD_GLUE = { threshold: -6, knee: 3.125, ratio: 20, attack: .004, release: .458, ceiling: -1 };
const dbLin = db => Math.pow(10, db / 20), linDb = x => 20 * Math.log10(Math.max(1e-30, x));
// Chromium's static compression curve (DynamicsCompressorKernel: KneeCurve, Saturate, KAtSlope) → the make-up gain it adds.
export function compressorMakeup(threshold, knee, ratio) {
  const lt = dbLin(threshold), slope = 1 / ratio, kneeDb = threshold + knee, kt = dbLin(kneeDb);
  const kneeCurve = (x, k) => x < lt ? x : lt + (1 - Math.exp(-k * (x - lt))) / k;
  const slopeAt = (x, k) => { if (x < lt) return 1; const x2 = x * 1.001, xd = linDb(x), x2d = linDb(x2), yd = linDb(kneeCurve(x, k)), y2d = linDb(kneeCurve(x2, k)); return (y2d - yd) / (x2d - xd); };
  let k = 5; if (knee > 0) { let lo = .1, hi = 10000; for (let i = 0; i < 15; i++) { if (slopeAt(kt, k) < slope) hi = k; else lo = k; k = Math.sqrt(lo * hi); } }
  const yKneeDb = knee > 0 ? linDb(kneeCurve(kt, k)) : threshold;
  const sat = x => x < kt && knee > 0 ? kneeCurve(x, k) : dbLin(yKneeDb + slope * (linDb(x) - kneeDb));
  return Math.pow(1 / sat(1), .6); }
// The ceiling's curve: y = x up to .8 of the ceiling, then a tanh knee that never passes it.
export function ceilingCurve(db = GD_GLUE.ceiling, N = 4097) { const L = dbLin(db), a = .8 * L, b = L - a, cv = new Float32Array(N);
  for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1, m = Math.abs(x); cv[i] = m <= a ? x : Math.sign(x) * (a + b * Math.tanh((m - a) / b)); } return cv; }
let gdTail = null, gdTailOn = false;
export function gdFinalStage(on, c = ctx) { on = !!on; if (!c || on === gdTailOn) return gdTailOn; buses(c);
  if (!gdTail) { const g = c.createDynamicsCompressor(); g.threshold.value = GD_GLUE.threshold; g.knee.value = GD_GLUE.knee; g.ratio.value = GD_GLUE.ratio; g.attack.value = GD_GLUE.attack; g.release.value = GD_GLUE.release;
    const trim = c.createGain(); trim.gain.value = 1 / compressorMakeup(GD_GLUE.threshold, GD_GLUE.knee, GD_GLUE.ratio); const ws = c.createWaveShaper(); ws.curve = ceilingCurve(); ws.oversample = 'none';
    g.connect(trim).connect(ws).connect(c.destination); gdTail = { g, trim, ws }; }
  try { limiter.disconnect(); } catch {} limiter.connect(on ? gdTail.g : c.destination); gdTailOn = on; return on; }
export const gdFinalStageOn = () => gdTailOn;   // (tests)
export function master(c) { buses(c); return worldIn; }
// The Effects volume's own input after the duck: a sound that must not be muffled by it (a flashbang's ear ring) but
// still follows the Effects and Master volumes, the compressor and the limiter.
export function ringBus(c) { buses(c); return bus; }
// Flashed (Global Defensive; CS2 muffles the world while you are blinded): the world dulled by `depth` (0 … 1: down to
// ~600 Hz and −9 dB at 1) and eased back over `secs`. (The depth and the curve are this game's approximation — CS2's
// own dsp preset isn't in its sound events.) Nothing to do while it is open.
export function duck(depth, secs) { if (!duckF || !ctx) return; const d = Math.max(0, Math.min(1, depth)), t = ctx.currentTime, ny = ctx.sampleRate / 2; if (!(d > 0) || !(secs > 0)) return;
  const f = Math.max(600, ny * Math.pow(600 / ny, d)), g = Math.pow(10, -9 * d / 20); duckF.frequency.cancelScheduledValues(t); duckG.gain.cancelScheduledValues(t);
  duckF.frequency.setValueAtTime(Math.min(duckF.frequency.value, f), t); duckF.frequency.setTargetAtTime(f, t, .02); duckG.gain.setTargetAtTime(g, t, .02);
  duckF.frequency.setTargetAtTime(ny, t + secs * .35, secs * .25); duckG.gain.setTargetAtTime(1, t + secs * .35, secs * .25); }
export const ducking = () => !!duckF && !!ctx && duckF.frequency.value < ctx.sampleRate / 2 - 1;   // (tests)
export function uiBus(c) { buses(c); return busUI; }
export function musicBus(c) { buses(c); return busMusic; }
// The room you are in (CS2's sound zones, Sabine's RT60 ∝ volume / absorbing surface): 0 = open air (a site under the
// sky: most of a sound's energy flies off), 1 = enclosed (a tunnel, a vent, a hall: hard walls ring). The game sets it a
// few times a second from what is over and round you; the shared reverb's send follows it smoothly.
let verbGain = null; export function setRoom(k) { if (!verbGain || !ctx) return; const v = .2 + .55 * Math.max(0, Math.min(1, k)); verbGain.gain.setTargetAtTime(v, ctx.currentTime, .35); }
// A shared outdoor reverb, used sparingly: a short early slap off the walls and a ~1.2 s tail.
export function reverb(c) {
  if (verb) return verb;
  const len = Math.ceil(c.sampleRate * 1.2), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.6) * (t < .012 ? 0 : 1) * .45; }
    for (const [at, g] of [[.023, .7], [.041, .45], [.067, .35]]) { const i = Math.floor((at + ch * .004) * c.sampleRate); if (i < len) d[i] += g; } }
  const conv = c.createConvolver(); conv.buffer = ir; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220; const g = c.createGain(); g.gain.value = .32; verbGain = g;
  verb = hp; hp.connect(conv).connect(g).connect(master(c)); return verb;
}
// How far each kind of sound carries (game units; a player is 11 tall). Footsteps: CS2's distance law — full within
// a body's length (6), then half as loud each time the distance doubles (−6 dB), inaudible past ~175 (about CS's
// footstep range): one close by is clearly louder than one down the corridor. Handling noises (reloads, bolts, pins,
// knife swings) by ~70; gunfire carries across the map but quieter and duller with distance (sound-bank); explosions
// furthest. The bomb being planted (keypad beeps) is heard round its site; being defused, only close to it (CS2).
export const RANGE = { effect: ['inverse', 10, 1.3, 700], step: ['inverse', 6, 1, 175], handling: ['linear', 4, 1, 70], gun: ['inverse', 14, 1.1, 900], explosion: ['inverse', 20, .8, 1200], beep: ['inverse', 10, 1.2, 320], plant: ['inverse', 8, 1.1, 330], defuse: ['inverse', 5, 1.3, 140] };
export const SOUND_SPEED = 13504, HU_UNITS = 2.54 / 16.5;   // (Hammer units a second; game units per Hammer unit)
// Walls between you and a sound muffle it (quieter, fewer highs): the game sets how blocked a point is (0 … 1).
let occlusion = null; export const setOcclusion = fn => { occlusion = fn; };
// Where to connect a sound: the effects bus directly (your own sounds: never distance-muffled) or a panner at `at`.
// Global Defensive swaps in CS2's ranges (gd-sounds.js GD_RANGE: linear to silence at each family's last curve point, e.g.
// footsteps 1100 HU) for the shared fallbacks that still come here while its own copy decodes — Web Audio's 'inverse'
// clamps at maxDistance and never reaches silence: a step across the map stayed audible (package U). null: these.
let rangeOv = null; export const setRanges = r => { rangeOv = r || null; };
export function outAt(c, at, kind = 'effect') {
  if (!at) return master(c);
  const [model, ref, roll, max] = rangeOv?.[kind] || RANGE[kind] || RANGE.effect, p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = model; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = max; if (rangeOv) { p.channelCount = 1; p.channelCountMode = 'explicit'; }   // (Global Defensive: a stand-in is a point too — a stereo file folded to mono, GD-AUD-18)
  p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z;
  let occ = 0; try { occ = occlusion ? Math.max(0, Math.min(1, +occlusion(at) || 0)) : 0; } catch {}
  // Sound takes time to arrive: 343 m/s (13 504 Hammer units a second) — a shot across the map is heard a moment after.
  let head = p; const L = c.listener; if (L.positionX) { const d = Math.hypot(at.x - L.positionX.value, at.y - L.positionY.value, at.z - L.positionZ.value) / HU_UNITS; if (d > 150) { const dl = c.createDelay(1.5); dl.delayTime.value = Math.min(1.4, d / SOUND_SPEED); head.connect(dl); head = dl; } }
  if (occ > 0) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 18000 - occ * 17200; const g = c.createGain(); g.gain.value = 1 - occ * .5; head.connect(f).connect(g).connect(master(c)); }
  else head.connect(master(c));
  return p;
}
const fwd = { x: 0, y: 0, z: -1 };
// The listener's position (for distance-dependent sound: muffling, echo).
// (v53 HITS) The same, into `out` (nothing made: gd-impacts.js reads it per impact); null when no sound has started yet.
export const listenerPos = out => { const L = ctx?.listener; if (!L?.positionX) return null; out.x = L.positionX.value; out.y = L.positionY.value; out.z = L.positionZ.value; return out; };
export const listenerAt = () => { const L = ctx?.listener; return L?.positionX ? { x: L.positionX.value, y: L.positionY.value, z: L.positionZ.value } : null; };
// (a camera with no parent, or one in the scene root: straight from its position and rotation — this frame's, set by
// the movement just now; matrixWorld is only refreshed at render, a frame behind. Otherwise its world matrix.)
const up = { x: 0, y: 1, z: 0 };
export function setListener(camera) {
  if (!ctx) return; const L = ctx.listener, q = camera.quaternion, p = camera.position, root = q && p && (!camera.parent || camera.parent.isScene); let x, y, z;
  if (root) { x = p.x; y = p.y; z = p.z; const qx = q.x, qy = q.y, qz = q.z, qw = q.w;   // (the camera's −Z and +Y turned by q)
    fwd.x = -2 * (qx * qz + qw * qy); fwd.y = -2 * (qy * qz - qw * qx); fwd.z = -(1 - 2 * (qx * qx + qy * qy)); up.x = 2 * (qx * qy - qw * qz); up.y = 1 - 2 * (qx * qx + qz * qz); up.z = 2 * (qy * qz + qw * qx); }
  else { const e = camera.matrixWorld.elements; x = e[12]; y = e[13]; z = e[14]; fwd.x = -e[8]; fwd.y = -e[9]; fwd.z = -e[10]; up.x = e[4]; up.y = e[5]; up.z = e[6]; }
  if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z; }
  else { L.setPosition?.(x, y, z); L.setOrientation?.(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
}
// The listener's forward and up as set this frame (gd-sounds.js: the front / back cue of a placed sound; no object made).
export const listenerFrame = out => { out.fx = fwd.x; out.fy = fwd.y; out.fz = fwd.z; out.ux = up.x; out.uy = up.y; out.uz = up.z; return out; };
// The listener's right (forward × up), for a sound beside your own head (sound-bank: your own shell casings).
export const listenerRight = out => { out.x = fwd.y * up.z - fwd.z * up.y; out.y = fwd.z * up.x - fwd.x * up.z; out.z = fwd.x * up.y - fwd.y * up.x; return out; };
// Recorded footsteps: the game sets a hook that picks the surface and plays a sample (sound-bank.js); without it
// (or before the samples load) a footstep is a short filtered noise thud (concrete-ish), different every step.
let stepHook = null; export const setStepHook = f => { stepHook = f; };
export function footstep(at, volume = .5) {
  if (stepHook?.(at, volume)) return;
  try {
    const c = audioCtx(), t = c.currentTime, len = .09, buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = .85 + Math.random() * .3;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520 + Math.random() * 260; bp.Q.value = 1.1;
    const g = c.createGain(); g.gain.value = volume; src.connect(bp).connect(g).connect(outAt(c, at, 'step')); src.start(t);
  } catch {}
}
