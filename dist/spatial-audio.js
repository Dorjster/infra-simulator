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
let vols = getVolumes(), bus = null, verb = null, masterG = null, busUI = null, busMusic = null;
export function setVolumes(v) { vols = { ...vols, ...v }; for (const k of Object.keys(vols)) vols[k] = Math.max(0, Math.min(1, +vols[k] || 0)); try { localStorage.setItem(VOLS_KEY, JSON.stringify(vols)); } catch {} if (masterG) { masterG.gain.value = vols.master; bus.gain.value = vols.effects; busUI.gain.value = vols.ui; busMusic.gain.value = vols.music; } globalThis.dispatchEvent?.(new CustomEvent('infra-volume', { detail: vols })); return vols; }
function buses(c) {
  if (bus) return; const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = .002; comp.release.value = .18;
  const make = c.createGain(); make.gain.value = 1.25; masterG = c.createGain(); masterG.gain.value = vols.master; comp.connect(make).connect(masterG).connect(c.destination);
  bus = c.createGain(); bus.gain.value = vols.effects; bus.connect(comp); busUI = c.createGain(); busUI.gain.value = vols.ui; busUI.connect(comp); busMusic = c.createGain(); busMusic.gain.value = vols.music; busMusic.connect(comp);
}
export function master(c) { buses(c); return bus; }
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
// How far each kind of sound carries (game units; a player is 11 tall). Footsteps fade to nothing by ~175 units
// (about CS's footstep range), handling noises (reloads, bolts, pins, knife swings) by ~70, gunfire carries across
// the map but quieter and duller with distance (sound-bank), explosions furthest.
export const RANGE = { effect: ['inverse', 10, 1.3, 700], step: ['linear', 6, 1, 175], handling: ['linear', 4, 1, 70], gun: ['inverse', 14, 1.1, 900], explosion: ['inverse', 20, .8, 1200], beep: ['inverse', 10, 1.2, 320] };
export const SOUND_SPEED = 13504, HU_UNITS = 2.54 / 16.5;   // (Hammer units a second; game units per Hammer unit)
// Walls between you and a sound muffle it (quieter, fewer highs): the game sets how blocked a point is (0 … 1).
let occlusion = null; export const setOcclusion = fn => { occlusion = fn; };
// Where to connect a sound: the effects bus directly (your own sounds: never distance-muffled) or a panner at `at`.
export function outAt(c, at, kind = 'effect') {
  if (!at) return master(c);
  const [model, ref, roll, max] = RANGE[kind] || RANGE.effect, p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = model; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = max;
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
export const listenerAt = () => { const L = ctx?.listener; return L?.positionX ? { x: L.positionX.value, y: L.positionY.value, z: L.positionZ.value } : null; };
export function setListener(camera) {
  if (!ctx) return; const L = ctx.listener, e = camera.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
  fwd.x = -e[8]; fwd.y = -e[9]; fwd.z = -e[10];
  if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6]; }
  else { L.setPosition?.(x, y, z); L.setOrientation?.(fwd.x, fwd.y, fwd.z, e[4], e[5], e[6]); }
}
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
